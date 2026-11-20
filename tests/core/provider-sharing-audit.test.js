"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { setImmediate: nextTurn } = require("node:timers/promises");
const Plugin = require("../../src");

const microsoftEndpoint = "https://microsoft.example.invalid/translate";
const fallbackEndpoint = "https://fallback.example.invalid/v1/chat/completions";
const localEndpoint = "http://127.0.0.1:39001/v1/chat/completions";
const source = "The library opens in the morning.";
const translated = "图书馆早上开放。";
const cancelled = { code: "REQUEST_CANCELLED" };

function createPlugin(config = {}) {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.scheduleTranslationCachePersist = () => {};
    Object.assign(plugin.settings.translation, {
        provider: "microsoft",
        endpoint: microsoftEndpoint,
        apiKey: "fake-microsoft-key",
        apiKeyOrigin: new URL(microsoftEndpoint).origin,
        ...config
    });
    return plugin;
}

function useManualFallback(plugin) {
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible"];
    plugin.settings.translation.providerProfiles.openaiCompatible = {
        endpoint: fallbackEndpoint,
        model: "fallback-model",
        apiKey: "fake-fallback-key",
        apiKeyOrigin: new URL(fallbackEndpoint).origin
    };
}

function localConfig(model = "local-model") {
    return { provider: "sakuraLocal", endpoint: localEndpoint, model, apiKey: "", apiKeyOrigin: new URL(localEndpoint).origin };
}

function holdProviderRequests(t, { ignoreAbort = false } = {}) {
    const requests = [];
    t.mock.method(globalThis, "fetch", (endpoint, { method, headers, body, signal }) => new Promise((resolve, reject) => {
        requests.push({
            url: new URL(endpoint),
            method,
            headers,
            body: body && JSON.parse(body),
            signal,
            respond: (data, status = 200) => resolve(Response.json(data, { status }))
        });
        if (!ignoreAbort) signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    t.after(() => requests.forEach(request => request.respond({})));
    return requests;
}

function completion(text = translated) {
    return { choices: [{ message: { content: text }, finish_reason: "stop" }] };
}

function googleTranslation(text = translated) {
    return { data: { translations: [{ translatedText: text }] } };
}

for (const firstMode of ["manual", "auto"]) {
    test(`A02 keeps fallback and cache attribution per caller when ${firstMode} arrives first`, async t => {
        const requests = holdProviderRequests(t);
        const plugin = createPlugin();
        useManualFallback(plugin);
        const manualPlan = t.mock.method(plugin, "createManualTranslationPlan");
        const modelTask = t.mock.method(plugin, "runModelTaskWithResult");
        const render = t.mock.fn();
        Object.assign(plugin, {
            getElementText: () => source,
            clearTranslationLineDismissal() {},
            resolveManualTranslationSource: () => ({ text: source, domText: source }),
            getMessageIdentity: () => null,
            renderManualLoading() {},
            renderTranslation: render,
            renderTranslationError: (_message, _content, error) => { throw error; }
        });
        const autoOptions = { ...plugin.getAutoTranslationOptions(), mode: "auto", requestContext: {} };
        let manual;
        let auto;
        for (const mode of [firstMode, firstMode === "manual" ? "auto" : "manual"]) {
            if (mode === "manual") manual = plugin.translateMessage({ isConnected: true }, { isConnected: true }, null);
            else auto = assert.rejects(plugin.runModelTaskWithResult("translation", source, autoOptions), { status: 503 });
        }

        assert.equal(requests.length, 1);
        assert.equal(requests[0].url.origin, new URL(microsoftEndpoint).origin);
        requests[0].respond({ error: { message: "Unavailable" } }, 503);
        await auto;
        assert.equal(requests.length, 2);
        assert.equal(requests[1].url.href, fallbackEndpoint);
        assert.equal(requests[1].body.messages.at(-1).content, source);
        requests[1].respond(completion());

        await manual;
        const plan = manualPlan.mock.calls[0].result;
        const manualResult = await modelTask.mock.calls.find(call => call.arguments[2]?.mode === "manual").result;
        assert.deepEqual(manualResult, { text: translated, fallbackProvider: "openaiCompatible" });
        assert.deepEqual(plan.requestOptions.requestContext, { fallbackProvider: "openaiCompatible" });
        assert.deepEqual(autoOptions.requestContext, {});
        assert.equal(render.mock.callCount(), 1);
        assert.equal(render.mock.calls[0].arguments[2], translated);
        assert.equal(plugin.translationCache.has(plan.cacheKey), false);
        assert.equal(plugin.translationCache.has(plan.autoCacheKey), false);
        assert.equal(plugin.translationRequests.size, 0);
    });
}

test("A02 an automatic caller starts its own primary attempt while manual fallback is pending", async t => {
    const requests = holdProviderRequests(t);
    const plugin = createPlugin();
    useManualFallback(plugin);
    const controller = new AbortController();
    const manualContext = {};
    const automaticContext = {};
    const manual = assert.rejects(plugin.runModelTaskWithResult("translation", source, {
        mode: "manual", requestContext: manualContext, signal: controller.signal
    }), cancelled);
    requests[0].respond({ error: { message: "Unavailable" } }, 503);
    await nextTurn();
    assert.equal(requests[1].url.href, fallbackEndpoint);

    const automatic = plugin.runModelTaskWithResult("translation", source, { mode: "auto", requestContext: automaticContext });
    assert.deepEqual(requests.map(request => request.url.origin), [
        new URL(microsoftEndpoint).origin,
        new URL(fallbackEndpoint).origin,
        new URL(microsoftEndpoint).origin
    ]);
    controller.abort();
    await manual;
    assert.equal(requests[1].signal.aborted, true);
    assert.equal(requests[2].signal.aborted, false);
    requests[2].respond([{ translations: [{ text: translated }] }]);
    assert.deepEqual(await automatic, { text: translated, fallbackProvider: "" });
    assert.deepEqual(manualContext, {});
    assert.deepEqual(automaticContext, {});
});

for (const cancelledIndex of [0, 1]) {
    const caller = cancelledIndex === 0 ? "first" : "joining";
    test(`A04 cancels the ${caller} model task while the other task completes`, async t => {
        const requests = holdProviderRequests(t);
        const plugin = createPlugin();
        const controllers = [new AbortController(), new AbortController()];
        const tasks = controllers.map(controller => plugin.runModelTaskWithResult("translation", source, { signal: controller.signal }));
        assert.equal(requests.length, 1);
        const rejected = assert.rejects(tasks[cancelledIndex], cancelled);
        controllers[cancelledIndex].abort("caller abandoned translation");
        await rejected;
        assert.equal(requests[0].signal.aborted, false);
        assert.equal(plugin.activeApiControllers.size, 1);

        requests[0].respond([{ translations: [{ text: translated }] }]);
        assert.deepEqual(await tasks[1 - cancelledIndex], { text: translated, fallbackProvider: "" });
        assert.equal(plugin.translationRequests.size, 0);
        assert.equal(plugin.activeApiControllers.size, 0);
    });

    test(`A04 cancels the ${caller} model discovery caller while the other caller translates`, async t => {
        const requests = holdProviderRequests(t);
        const plugin = createPlugin(localConfig());
        const controllers = [new AbortController(), new AbortController()];
        const tasks = controllers.map(controller => plugin.runModelTask("translation", source, { signal: controller.signal }));
        assert.deepEqual(requests.map(request => request.method), ["GET"]);
        assert.equal(requests[0].url.pathname, "/v1/models");
        const rejected = assert.rejects(tasks[cancelledIndex], cancelled);
        controllers[cancelledIndex].abort();
        await rejected;
        assert.equal(requests[0].signal.aborted, false);
        assert.equal(plugin.activeApiControllers.size, 1);

        requests[0].respond({ data: [{ id: "served-model" }] });
        await nextTurn();
        assert.deepEqual(requests.map(request => request.method), ["GET", "POST"]);
        assert.equal(requests[1].body.model, "served-model");
        requests[1].respond(completion());
        assert.equal(await tasks[1 - cancelledIndex], translated);
        assert.equal(plugin.getCachedLocalProviderDetectedModel(plugin.settings.translation), "served-model");
        assert.equal(plugin.localProviderModelDetections.size, 0);
        assert.equal(plugin.activeApiControllers.size, 0);
    });
}

test("A04 aborts the model transport after the last caller leaves and accepts a retry", async t => {
    const requests = holdProviderRequests(t, { ignoreAbort: true });
    const plugin = createPlugin(localConfig("known-model"));
    const statusWrites = t.mock.method(plugin, "setApiRuntimeStatus");
    const controllers = [new AbortController(), new AbortController()];
    const rejected = controllers.map(controller => assert.rejects(
        plugin.runModelTaskWithResult("translation", source, { signal: controller.signal }), cancelled
    ));
    assert.equal(requests.length, 1);
    controllers[0].abort();
    await rejected[0];
    assert.equal(requests[0].signal.aborted, false);
    controllers[1].abort();
    await rejected[1];
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(plugin.translationRequests.size, 0);

    const retry = plugin.runModelTask("translation", source);
    assert.equal(requests.length, 2);
    requests[0].respond(completion("late reply"));
    await nextTurn();
    assert.equal(statusWrites.mock.callCount(), 0);
    assert.equal(plugin.translationRequests.size, 1);
    assert.equal(plugin.activeApiControllers.size, 1);
    requests[1].respond(completion());
    assert.equal(await retry, translated);
    assert.equal(statusWrites.mock.callCount(), 1);
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("A04 aborts sole model discovery and discards its late result during a retry", async t => {
    const requests = holdProviderRequests(t, { ignoreAbort: true });
    const plugin = createPlugin(localConfig());
    const controller = new AbortController();
    const rejected = assert.rejects(plugin.runModelTask("translation", source, { signal: controller.signal }), cancelled);
    controller.abort();
    await rejected;
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(plugin.localProviderModelDetections.size, 0);

    const retry = plugin.runModelTask("translation", source);
    assert.deepEqual(requests.map(request => request.method), ["GET", "GET"]);
    requests[0].respond({ data: [{ id: "abandoned-model" }] });
    await nextTurn();
    assert.equal(plugin.localProviderDetectedModels.size, 0);
    assert.equal(plugin.localProviderModelDetections.size, 1);
    assert.equal(plugin.activeApiControllers.size, 1);
    requests[1].respond({ data: [{ id: "retry-model" }] });
    await nextTurn();
    assert.equal(requests[2].body.model, "retry-model");
    requests[2].respond(completion());
    assert.equal(await retry, translated);
    assert.equal(plugin.getCachedLocalProviderDetectedModel(plugin.settings.translation), "retry-model");
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("A04 a stale discovery starter still lets a current subscriber cache the model", async t => {
    const requests = holdProviderRequests(t);
    const plugin = createPlugin(localConfig());
    const config = plugin.settings.translation;
    let probeCurrent = true;
    const stale = assert.rejects(plugin.refreshLocalProviderDetectedModel(config, { isCurrent: () => probeCurrent }), cancelled);
    const current = plugin.refreshLocalProviderDetectedModel(config);
    probeCurrent = false;
    assert.equal(requests.length, 1);
    requests[0].respond({ data: [{ id: "current-model" }] });
    await stale;
    assert.equal(await current, "current-model");
    assert.equal(plugin.getCachedLocalProviderDetectedModel(config), "current-model");
});

test("A04 all stale discovery subscribers leave the model cache and retry timestamp untouched", async t => {
    const requests = holdProviderRequests(t);
    const plugin = createPlugin(localConfig());
    const config = plugin.settings.translation;
    for (const status of [200, 503]) {
        let probeCurrent = true;
        const options = { isCurrent: () => probeCurrent };
        const stale = [0, 1].map(() => assert.rejects(plugin.refreshLocalProviderDetectedModel(config, options), cancelled));
        probeCurrent = false;
        requests.at(-1).respond({ data: [{ id: "superseded-model" }] }, status);
        await Promise.all(stale);
        assert.equal(plugin.localProviderDetectedModels.size, 0);
        assert.equal(plugin.localProviderModelDetections.size, 0);
        assert.equal(plugin.activeApiControllers.size, 0);
    }
    assert.deepEqual(requests.map(request => request.method), ["GET", "GET"]);
});

test("A04 pre-aborted subscribers neither start a model task nor read a warm discovery cache", async t => {
    const requests = holdProviderRequests(t);
    const plugin = createPlugin(localConfig());
    const config = plugin.settings.translation;
    plugin.setCachedLocalProviderDetectedModel(config, "warm-model");
    const signal = AbortSignal.abort();
    await assert.rejects(plugin.runModelTask("translation", source, { signal }), cancelled);
    await assert.rejects(plugin.refreshLocalProviderDetectedModel(config, { signal }), cancelled);
    assert.equal(requests.length, 0);
    assert.equal(plugin.getCachedLocalProviderDetectedModel(config), "warm-model");
});

test("A04 stop aborts both shared request types and discards late replies", async t => {
    const requests = holdProviderRequests(t, { ignoreAbort: true });
    const globals = { document: globalThis.document, window: globalThis.window };
    Object.assign(globalThis, {
        document: { removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null },
        window: { removeEventListener() {} }
    });
    t.after(() => Object.assign(globalThis, globals));
    const plugin = createPlugin();
    const primary = assert.rejects(plugin.runModelTaskWithResult("translation", source), cancelled);
    const discovery = assert.rejects(plugin.refreshLocalProviderDetectedModel(localConfig()), cancelled);
    plugin.stop();
    await Promise.all([primary, discovery]);
    assert.deepEqual(requests.map(request => [request.method, request.signal.aborted]), [["POST", true], ["GET", true]]);
    assert.equal(plugin.translationRequests.size, 0);
    assert.equal(plugin.localProviderModelDetections.size, 0);
    assert.equal(plugin.activeApiControllers.size, 0);
    await assert.rejects(plugin.runModelTaskWithResult("translation", source), cancelled);

    requests[0].respond([{ translations: [{ text: translated }] }]);
    requests[1].respond({ data: [{ id: "late-model" }] });
    await nextTurn();
    assert.equal(requests.length, 2);
    assert.equal(plugin.translationCache.size, 0);
    assert.equal(plugin.localProviderDetectedModels.size, 0);
});

test("A04 a completed model transport returns its text after a lifecycle change without status writes", async t => {
    const requests = holdProviderRequests(t);
    const plugin = createPlugin(localConfig("known-model"));
    const statusWrites = t.mock.method(plugin, "setApiRuntimeStatus");
    const task = plugin.runModelTask("translation", source);
    plugin.isStarted = false;
    plugin.lifecycleToken++;
    requests[0].respond(completion());
    assert.equal(await task, translated);
    assert.equal(statusWrites.mock.callCount(), 0);
    assert.equal(plugin.localProviderHealthyKeys.size, 0);
});

test("A04 shares a Google reservation through subscriber cancellation and bills a key retry once", async t => {
    const requests = holdProviderRequests(t);
    const plugin = createPlugin({ provider: "googleCloud" });
    plugin.setSetting("googleTranslate.keyPoolText", "first|AIza-fake-first|5\nsecond|AIza-fake-second|5", { save: false });
    const [firstKey, secondKey] = plugin.getGoogleTranslateKeys();
    const markFailure = t.mock.method(plugin, "markGoogleTranslateKeyFailure");
    const run = signal => plugin.runModelTask("translation", "hello", { mode: "auto", signal });
    const first = assert.rejects(run(), { status: 429 });
    const duplicate = assert.rejects(run(), { status: 429 });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].headers["X-Goog-Api-Key"], firstKey.apiKey);
    assert.equal(plugin.getGoogleTranslateReservedChars(firstKey), 5);
    requests[0].respond({ error: { message: "Quota exceeded per minute", status: "RESOURCE_EXHAUSTED" } }, 429);
    await Promise.all([first, duplicate]);
    assert.equal(markFailure.mock.callCount(), 1);
    assert.equal(plugin.getGoogleTranslateReservedChars(firstKey), 0);
    assert.equal(plugin.getGoogleTranslateKeys()[0].usedChars, 0);

    const controller = new AbortController();
    const abandonedRetry = assert.rejects(run(controller.signal), cancelled);
    const retry = run();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].headers["X-Goog-Api-Key"], secondKey.apiKey);
    assert.equal(plugin.getGoogleTranslateReservedChars(secondKey), 5);
    controller.abort();
    await abandonedRetry;
    assert.equal(requests[1].signal.aborted, false);
    assert.equal(plugin.getGoogleTranslateReservedChars(secondKey), 5);
    requests[1].respond(googleTranslation());
    assert.equal(await retry, translated);
    assert.equal(plugin.getGoogleTranslateKeys()[1].usedChars, 5);
    assert.equal(plugin.googleTranslateReservedChars.size, 0);
});

test("A04 bills an abandoned Google send once and preserves the overlapping retry reservation", async t => {
    const requests = holdProviderRequests(t, { ignoreAbort: true });
    const plugin = createPlugin({ provider: "googleCloud" });
    plugin.setSetting("googleTranslate.keyPoolText", "only|AIza-fake-only|10", { save: false });
    const [key] = plugin.getGoogleTranslateKeys();
    const controllers = [new AbortController(), new AbortController()];
    const run = signal => plugin.runModelTask("translation", "hello", { mode: "auto", signal });
    const abandoned = controllers.map(controller => assert.rejects(run(controller.signal), cancelled));
    assert.equal(requests.length, 1);
    controllers.forEach(controller => controller.abort());
    await Promise.all(abandoned);
    assert.equal(requests[0].signal.aborted, true);

    const retry = run();
    assert.equal(requests.length, 2);
    assert.equal(plugin.getGoogleTranslateReservedChars(key), 10);
    requests[0].respond(googleTranslation("late reply"));
    await nextTurn();
    assert.equal(plugin.getGoogleTranslateKeys()[0].usedChars, 5);
    assert.equal(plugin.getGoogleTranslateReservedChars(key), 5);

    requests[1].respond(googleTranslation());
    assert.equal(await retry, translated);
    assert.equal(plugin.getGoogleTranslateKeys()[0].usedChars, 10);
    assert.equal(plugin.googleTranslateReservedChars.size, 0);
    assert.equal(plugin.activeApiControllers.size, 0);
});
