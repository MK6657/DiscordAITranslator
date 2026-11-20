"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

function localGateway(url) {
    const plugin = new Plugin();
    Object.assign(plugin.settings.translation, { provider: "sakuraLocal", endpoint: url, apiKey: "", model: "local-model" });
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    return plugin;
}

test("A05 distinguishes structured quota exhaustion from an ordinary HTTP 429", async t => {
    const plugin = new Plugin();
    const responses = ["insufficient_quota", "rate_limit_exceeded"].map(code => new Response(JSON.stringify({
        error: { code, message: "synthetic-private-response-body" }
    }), { status: 429, headers: { "retry-after": "2" } }));
    t.mock.method(globalThis, "fetch", async () => responses.shift());
    const request = { headers: {}, body: { messages: [] } };
    const invoke = () => plugin.fetchApiResponseText("https://relay.example.test/v1/chat/completions", request);

    await assert.rejects(invoke(), error => {
        assert.equal(error.apiErrorCode, "insufficient_quota");
        assert.equal(error.message, "API_ERROR");
        assert.doesNotMatch(plugin.formatError(error), /synthetic-private-response-body/);
        const failure = plugin.createAutoTranslationFailure("quota", error);
        assert.equal(failure.type, "quota");
        assert.equal(failure.terminal, true);
        assert.equal(failure.retryAt, 0);
        return true;
    });
    await assert.rejects(invoke(), error => {
        assert.equal(error.apiErrorCode, "rate_limit_exceeded");
        const failure = plugin.createAutoTranslationFailure("limit", error);
        assert.equal(failure.type, "rate-limit");
        assert.equal(failure.terminal, false);
        assert.equal(failure.retryAfterMs, 2000);
        return true;
    });
});

for (const stage of ["construction", "reservation"]) {
    test(`A05 Google quota failure at ${stage} uses manual fallback only`, async t => {
        const plugin = new Plugin();
        plugin.saveSettings = () => true;
        plugin.queueScan = () => {};
        plugin.setTaskProvider("translation", "googleCloud");
        plugin.setSetting("googleTranslate.keyPoolText", "fixture|synthetic-google|1000", { save: false });
        plugin.settings.translation.providerProfiles.microsoft = { apiKey: "synthetic-backup" };
        plugin.settings.ui.providerFallbackEnabled = true;
        plugin.settings.ui.providerFallbackOrder = ["microsoft"];
        const requests = [];
        plugin.fetchApiResponseText = async (_endpoint, request) => {
            requests.push(request.provider);
            assert.equal(request.provider, "microsoft");
            return JSON.stringify([{ translations: [{ text: "备用服务译文" }] }]);
        };
        if (stage === "construction") {
            plugin.markGoogleTranslateKeyUsage("synthetic-google", 999);
        }
        else {
            t.mock.method(plugin, "reserveGoogleTranslateRequest", request => {
                if (request.provider === "googleCloud") throw plugin.createGoogleTranslateQuotaError({ charCount: 20 });
            });
        }

        await assert.rejects(plugin.runModelTask("translation", "Some text to translate", { mode: "auto" }), { googleTranslateQuotaExceeded: true });
        assert.deepEqual(requests, []);
        const result = await plugin.runModelTaskWithResult("translation", "Some text to translate", { mode: "manual" });
        assert.equal(result.text, "备用服务译文");
        assert.equal(result.fallbackProvider, "microsoft");
        assert.deepEqual(requests, ["microsoft"]);
        assert.equal(plugin.googleTranslateReservedChars.size, 0);
    });
}

test("A06 a cold local gateway resolves its model before health and automatic translation", async () => {
    const plugin = localGateway("http://127.0.0.1:18080/v1");
    const calls = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        if (new URL(endpoint).pathname.endsWith("/models")) {
            calls.push(["GET", endpoint]);
            return JSON.stringify({ data: [{ id: "served-model" }] });
        }
        const health = request.body.messages.at(-1).content === "Reply with OK only.";
        calls.push([health ? "health" : "translation", request.body.model]);
        if (request.body.model !== "served-model") throw Object.assign(new Error("Unknown model"), { status: 404 });
        return JSON.stringify({ choices: [{ message: { content: health ? "OK" : "团队马上就回来。" } }] });
    };
    const options = plugin.getAutoTranslationOptions();
    assert.equal(plugin.getCachedLocalProviderDetectedModel(plugin.settings.translation), "");
    assert.equal(plugin.shouldBlockAutoTranslationForLocalProviderHealth(options), true);
    await plugin.localProviderHealthChecks.get(options.providerKey);

    assert.equal(plugin.shouldBlockAutoTranslationForLocalProviderHealth(options), false);
    assert.equal(await plugin.runAutoTranslationTask("The team will be right back.", options), "团队马上就回来。");
    assert.deepEqual(calls, [
        ["GET", "http://127.0.0.1:18080/v1/models"],
        ["health", "served-model"],
        ["translation", "served-model"]
    ]);
});

test("A08 keeps model-list route versions and uses the returned API ID for completion", async () => {
    const endpoint = "http://127.0.0.1:18080/custom/v1/chat/completions?api-version=2025-01-01&token=synthetic-private#fragment";
    const plugin = localGateway(endpoint);
    const calls = [];
    plugin.fetchApiResponseText = async (url, request) => {
        calls.push([url, request.body?.model]);
        if (request.method === "GET") return JSON.stringify({ data: [
            { id: "gateway-model-v2", name: "friendly-name", filename: "wrong-model.gguf" },
            { id: "list", path: "/weights/fallback.gguf" }
        ] });
        return JSON.stringify({ choices: [{ message: { content: "译文" } }] });
    };

    assert.equal(await plugin.runModelTask("translation", "An example message.", { mode: "auto" }), "译文");
    assert.deepEqual(calls, [
        ["http://127.0.0.1:18080/custom/v1/models?api-version=2025-01-01", undefined],
        [endpoint, "gateway-model-v2"]
    ]);
});

test("A08 treats weight filenames as fallbacks for rows without valid IDs", () => {
    const plugin = new Plugin();
    const data = { models: [
        { filename: "fallback.gguf" },
        { id: "actual-id", model: "alternate.gguf", filename: "wrong-weight.gguf" },
        { id: 7, path: "ignored.txt" }
    ] };
    assert.equal(plugin.parseLocalProviderModelsResponse(data), "actual-id");
    assert.deepEqual(plugin.parseLocalProviderModelsResponse(data, { all: true }), ["fallback.gguf", "actual-id"]);
    assert.equal(plugin.parseLocalProviderModelsResponse({ models: [{ id: null, filename: "fallback.gguf" }] }), "fallback.gguf");
});
