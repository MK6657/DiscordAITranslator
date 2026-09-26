"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

const SOURCE = "This is the first paragraph of a long message about the release plan. ".repeat(3)
    + "\n" + "The second paragraph explains why the build failed yesterday afternoon. ".repeat(3);
const TRANSLATED = "这是关于发布计划的长消息的第一段。".repeat(3)
    + "\n" + "第二段解释了昨天下午构建失败的原因。".repeat(3);

function useGlobals(t, values) {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
        globalThis[key] = value;
    }
    t.after(() => {
        for (const [key, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}

// A plugin whose queue runs without a DOM: every target counts as visible and connected.
function createQueuePlugin(t) {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.isAutoTranslateEnabled = () => true;
    plugin.isElementVisibleInViewport = () => true;
    plugin.getViewportPriority = () => 1;
    plugin.queueScan = () => {};
    plugin.drainAutoTranslationQueue = () => {};
    plugin.renderPendingAutoTranslationLoading = () => {};
    plugin.removeAutoTranslationLoadingNode = () => {};
    plugin.removeAutoTranslationNode = () => {};
    plugin.renderAutoTranslationFailure = () => {};
    plugin.showToast = () => {};
    t.after(() => {
        clearTimeout(plugin.autoTranslationRetryTimer);
        plugin.autoTranslationRetryTimer = null;
    });
    return plugin;
}

function makeItem(plugin, name, extra = {}) {
    return {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true },
        text: `synthetic source ${name}`,
        cacheKey: `queue-test-${name}`,
        requestOptions: plugin.getAutoTranslationOptions(),
        ...extra
    };
}

function startInFlight(plugin, items) {
    items.forEach(item => {
        plugin.addAutoTranslationPendingTarget(item.cacheKey, item);
        plugin.markAutoTranslationInFlightItem(item);
    });
    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = items.length;
}

const timeoutError = () => Object.assign(new Error("API request timed out after 25s"), { name: "TimeoutError", code: "REQUEST_TIMEOUT" });
const statusError = status => Object.assign(new Error("API_ERROR"), { status });

// --- req-1: truncated output ---

test("strict retry off: a truncated output is retried once with a larger max_tokens", async () => {
    const plugin = new Plugin();
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const maxTokens = [];
    plugin.runModelTask = async (_kind, _input, options) => {
        maxTokens.push(Number(options?.configOverrides?.maxTokens || 0));
        if (maxTokens.length === 1) throw plugin.createModelOutputTruncatedError("半截", "length");
        return "你好";
    };
    assert.equal(await plugin.runAutoTranslationTask("привет", plugin.getAutoTranslationOptions()), "你好");
    assert.equal(maxTokens.length, 2);
    assert.ok(maxTokens[1] > maxTokens[0]);
});

test("strict retry off: a second truncation ends the task instead of looping", async () => {
    const plugin = new Plugin();
    plugin.settings.ui.autoTranslateStrictRetry = false;
    let calls = 0;
    plugin.runModelTask = async () => {
        calls++;
        throw plugin.createModelOutputTruncatedError("半截", "length");
    };
    await assert.rejects(plugin.runAutoTranslationTask("привет", plugin.getAutoTranslationOptions()), error => {
        assert.equal(plugin.getAutoTranslationFailureType(error), "truncated");
        return true;
    });
    assert.equal(calls, 2);
});

const LOCAL_ENDPOINT = "http://127.0.0.1:18080/v1/chat/completions";

function useLocalProvider(plugin) {
    Object.assign(plugin.settings.translation, { provider: "sakuraLocal", endpoint: LOCAL_ENDPOINT, apiKey: "", model: "local-model" });
}

test("strict retry off: the larger truncation retry gets a longer timeout, and its timeout stays a truncation, not a local outage", async t => {
    const plugin = createQueuePlugin(t);
    useLocalProvider(plugin);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const timeouts = [];
    const maxTokens = [];
    plugin.fetchApiResponseText = async (endpoint, request, timeoutMs) => {
        if (/\/models$/.test(endpoint)) return JSON.stringify({ data: [{ id: "fake-model.gguf" }] });
        timeouts.push(timeoutMs);
        maxTokens.push(Number(request?.body?.max_tokens || 0));
        // A looping model: cut off at max_tokens first, then too slow for the larger limit.
        if (timeouts.length === 1) return JSON.stringify({ choices: [{ message: { content: "重复重复重复" }, finish_reason: "length" }] });
        throw timeoutError();
    };
    const options = plugin.getAutoTranslationOptions();
    let thrown = null;
    await assert.rejects(plugin.runAutoTranslationTask("привет", options), error => {
        thrown = error;
        return true;
    });
    assert.equal(timeouts.length, 2);
    assert.ok(maxTokens[1] > maxTokens[0]);
    assert.ok(timeouts[1] > timeouts[0], `retry timeout ${timeouts[0]} -> ${timeouts[1]}`);
    assert.ok(timeouts[1] >= Math.floor(timeouts[0] * maxTokens[1] / maxTokens[0]) || timeouts[1] >= 90000, "the timeout scales with max_tokens (capped)");
    assert.ok(timeouts[1] <= 90000, "the raised timeout stays bounded");
    assert.equal(Boolean(thrown.localProviderUnavailable), false, "a slow retry is not a local outage");
    assert.equal(plugin.getAutoTranslationFailureType(thrown), "truncated");

    const item = makeItem(plugin, "truncation-retry-timeout", { text: "привет", requestOptions: options });
    plugin.markAutoTranslationFailure(item, thrown);
    assert.equal(plugin.getAutoTranslationProviderFailure(options) || null, null, "no provider-wide cooldown");
    assert.equal(plugin.getAutoTranslationFailure(item.cacheKey)?.type, "truncated");
});

test("a truncated visible message gets a failure record whose backoff grows instead of a 4 s requeue", t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "truncated");
    plugin.markAutoTranslationFailure(item, plugin.createModelOutputTruncatedError("x", "length"));
    assert.equal(plugin.autoTranslationQueue.length, 0, "not requeued every few seconds");
    const first = plugin.getAutoTranslationFailure(item.cacheKey);
    assert.equal(first.type, "truncated");
    assert.ok(first.retryAfterMs >= 120000, `first backoff ${first.retryAfterMs}`);

    first.retryAt = Date.now() - 1;
    assert.equal(plugin.getAutoTranslationFailure(item.cacheKey), null, "expired record is released for a retry");
    plugin.markAutoTranslationFailure(item, plugin.createModelOutputTruncatedError("x", "length"));
    const second = plugin.getAutoTranslationFailure(item.cacheKey);
    assert.equal(second.count, 2);
    assert.ok(second.retryAfterMs > first.retryAfterMs, "backoff grows");
});

test("retained visible failures keep counting, so repeated timeouts back off", t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "retained-timeout");
    plugin.markAutoTranslationFailure(item, timeoutError());
    const firstDelay = plugin.autoTranslationQueue[0].daitRequeueAfter - Date.now();
    plugin.autoTranslationQueue = [];
    plugin.autoTranslationQueuedKeys.clear();
    plugin.autoTranslationProviderFailures.clear();
    plugin.markAutoTranslationFailure(item, timeoutError());
    const secondDelay = plugin.autoTranslationQueue[0].daitRequeueAfter - Date.now();
    assert.ok(secondDelay > firstDelay + 5000, `${firstDelay} -> ${secondDelay}`);
});

test("one message that keeps timing out does not grow the provider-wide cooldown", t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "provider-escalation");
    const providerCooldowns = [];
    const itemFailureCounts = [];
    for (let round = 0; round < 4; round++) {
        plugin.autoTranslationQueue = [];
        plugin.autoTranslationQueuedKeys.clear();
        // The previous provider cooldown and the item's own delay have run out before it is sent again.
        plugin.autoTranslationProviderFailures.forEach(failure => { failure.retryAt = Date.now() - 1; });
        const recorded = plugin.autoTranslationFailures.get(item.cacheKey);
        if (recorded) recorded.retryAt = Date.now() - 1;
        plugin.getAutoTranslationFailure(item.cacheKey);
        plugin.markAutoTranslationFailure(item, timeoutError());
        const providerFailure = plugin.getAutoTranslationProviderFailure(item.requestOptions);
        providerCooldowns.push(providerFailure.retryAfterMs);
        itemFailureCounts.push(Math.max(plugin.getAutoTranslationFailureHistoryCount(item.cacheKey), Number(plugin.autoTranslationFailures.get(item.cacheKey)?.count || 0)));
    }
    assert.deepEqual(itemFailureCounts, [1, 2, 3, 4], "the item's own count keeps growing");
    assert.deepEqual(providerCooldowns, [10000, 10000, 10000, 10000], "the provider cooldown follows the provider's own count");

    // A server hint (Retry-After) still sets the provider cooldown.
    const hinted = Object.assign(statusError(429), { retryAfterMs: 30000 });
    plugin.autoTranslationProviderFailures.clear();
    plugin.markAutoTranslationFailure(makeItem(plugin, "provider-hint"), hinted);
    assert.equal(plugin.getAutoTranslationProviderFailure(item.requestOptions).retryAfterMs, 30000);
});

test("a truncated prefetch result keeps its truncated type and growing backoff", t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "truncated-prefetch", { daitPrefetchRequest: true });
    plugin.markAutoTranslationFailure(item, plugin.createModelOutputTruncatedError("x", "length"));
    const failure = plugin.getAutoTranslationFailure(item.cacheKey);
    assert.equal(failure.type, "truncated");
    assert.ok(failure.retryAfterMs >= 120000);
});

// --- req-3: a failed batch request ---

test("strict retry off: a batch timeout uses transient backoff, not a 6-hour invalid-output block", async t => {
    const plugin = createQueuePlugin(t);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const items = ["a", "b", "c"].map(name => makeItem(plugin, `batch-timeout-${name}`));
    startInFlight(plugin, items);
    let calls = 0;
    plugin.runModelTask = async () => {
        calls++;
        throw timeoutError();
    };
    await plugin.autoTranslateQueuedBatch(items);
    assert.equal(calls, 1);
    const failures = [...plugin.autoTranslationFailures.values()];
    assert.equal(failures.some(failure => failure.terminal), false, "no terminal failure");
    assert.equal(failures.some(failure => failure.type === "invalid-output"), false);
    const queued = new Set(plugin.autoTranslationQueue.map(item => item.cacheKey));
    items.forEach(item => assert.ok(queued.has(item.cacheKey) || plugin.autoTranslationFailures.get(item.cacheKey)?.type === "timeout"));
    const providerFailures = [...plugin.autoTranslationProviderFailures.values()];
    assert.equal(providerFailures.length, 1);
    assert.equal(providerFailures[0].count, 1, "the provider is marked once per batch, not once per item");
});

test("strict retry off: a network error on a prefetch batch records weak retryable failures", async t => {
    const plugin = createQueuePlugin(t);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const items = ["a", "b"].map(name => makeItem(plugin, `batch-network-${name}`, { daitPrefetchRequest: true }));
    startInFlight(plugin, items);
    plugin.runModelTask = async () => { throw new Error("fetch failed"); };
    await plugin.autoTranslateQueuedBatch(items);
    items.forEach(item => {
        const failure = plugin.autoTranslationFailures.get(item.cacheKey);
        assert.ok(failure, "failure recorded");
        assert.equal(failure.terminal, false);
        assert.ok(failure.retryAt > 0);
    });
});

test("repeated batch timeouts on prefetch items back off instead of retrying every 4 s", async t => {
    const plugin = createQueuePlugin(t);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const items = ["a", "b"].map(name => makeItem(plugin, `prefetch-timeout-${name}`));
    let calls = 0;
    plugin.runModelTask = async () => {
        calls++;
        throw timeoutError();
    };
    const delays = [];
    for (let round = 0; round < 4; round++) {
        // The previous weak failure has run out and the scan sends the same prefetch batch again.
        items.forEach(item => {
            const recorded = plugin.autoTranslationFailures.get(item.cacheKey);
            if (recorded) recorded.retryAt = Date.now() - 1;
            plugin.getAutoTranslationFailure(item.cacheKey);
            item.daitPrefetchRequest = true;
        });
        plugin.autoTranslationQueue = [];
        plugin.autoTranslationQueuedKeys.clear();
        startInFlight(plugin, items);
        await plugin.autoTranslateQueuedBatch(items);
        const failure = plugin.autoTranslationFailures.get(items[0].cacheKey);
        assert.ok(failure && failure.weak && !failure.terminal, `round ${round + 1} records a weak failure`);
        delays.push(failure.retryAfterMs);
    }
    assert.equal(calls, 4);
    assert.ok(delays[0] >= 10000, `first delay ${delays[0]}`);
    assert.ok(delays[3] > delays[0], `delays ${delays.join(", ")}`);
    assert.ok(delays.every(delay => delay <= 120000));
    assert.equal(plugin.autoTranslationProviderFailures.size, 0, "prefetch timeouts still do not cool down the provider");
});

test("strict retry off: an unparsable batch sends its messages again as single requests", async t => {
    const plugin = createQueuePlugin(t);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const items = ["a", "b", "c"].map(name => makeItem(plugin, `batch-parse-${name}`));
    startInFlight(plugin, items);
    let calls = 0;
    plugin.runModelTask = async () => {
        calls++;
        return "this is not json";
    };
    await plugin.autoTranslateQueuedBatch(items);
    assert.equal(calls, 1);
    assert.equal(plugin.autoTranslationFailures.size, 0, "no failure is recorded for a batch format problem");
    assert.deepEqual(plugin.autoTranslationQueue.map(item => item.cacheKey).sort(), items.map(item => item.cacheKey).sort());
    plugin.autoTranslationQueue.forEach(item => assert.equal(plugin.shouldRunAutoTranslationItemSingle(item), true));
});

test("strict retry off: a truncated batch output also falls back to single requests", async t => {
    const plugin = createQueuePlugin(t);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const items = ["a", "b"].map(name => makeItem(plugin, `batch-truncated-${name}`));
    startInFlight(plugin, items);
    plugin.runModelTask = async () => { throw plugin.createModelOutputTruncatedError("[{\"id\":\"001\"", "length"); };
    await plugin.autoTranslateQueuedBatch(items);
    assert.equal(plugin.autoTranslationFailures.size, 0);
    assert.equal(plugin.autoTranslationQueue.length, 2);
    plugin.autoTranslationQueue.forEach(item => assert.equal(plugin.shouldRunAutoTranslationItemSingle(item), true));
});

test("strict retry off: invalid rows from a successful batch still end as final invalid output", async t => {
    const plugin = createQueuePlugin(t);
    plugin.settings.ui.autoTranslateStrictRetry = false;
    const items = ["a", "b"].map(name => makeItem(plugin, `batch-rows-${name}`));
    startInFlight(plugin, items);
    plugin.runModelTask = async () => JSON.stringify([{ id: "001", translation: "" }, { id: "002", translation: "" }]);
    await plugin.autoTranslateQueuedBatch(items);
    items.forEach(item => assert.equal(plugin.autoTranslationFailures.get(item.cacheKey)?.type, "invalid-output"));
});

// --- req-6: long messages stop on provider errors ---

test("a long message stops sending chunks after a rate-limit, auth, quota, server or timeout error", async () => {
    const errors = [statusError(429), statusError(401), statusError(503), timeoutError(), Object.assign(new Error("quota"), { providerQuotaExceeded: true })];
    for (const error of errors) {
        const plugin = new Plugin();
        plugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three", "chunk four"];
        let calls = 0;
        plugin.runAutoTranslationTaskWithOptions = async () => {
            calls++;
            throw error;
        };
        await assert.rejects(plugin.runLongAutoTranslationTask("synthetic long source", plugin.getAutoTranslationOptions()), thrown => thrown === error);
        assert.equal(calls, 1, `type ${plugin.getAutoTranslationFailureType(error)}`);
    }
});

test("a timeout or network error on a later chunk keeps the finished chunks and returns them as a partial result", async () => {
    for (const makeError of [timeoutError, () => new Error("fetch failed")]) {
        const plugin = new Plugin();
        plugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three", "chunk four"];
        const sent = [];
        plugin.runAutoTranslationTaskWithOptions = async chunk => {
            sent.push(chunk);
            if (chunk === "chunk three") throw makeError();
            return `${chunk} 已翻译`;
        };
        const taskOptions = {};
        const merged = await plugin.runLongAutoTranslationTask("synthetic long source", plugin.getAutoTranslationOptions(), taskOptions);
        assert.deepEqual(sent, ["chunk one", "chunk two", "chunk three"], "the chunks after the failing one are not sent");
        assert.match(merged, /chunk one 已翻译/);
        assert.match(merged, /chunk two 已翻译/);
        assert.deepEqual(taskOptions.longTextPartialInfo, { missingSegments: [3, 4], totalSegments: 4 });
    }
});

test("a rate limit on a later chunk still ends the whole long message", async () => {
    const plugin = new Plugin();
    plugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three"];
    const rateLimited = statusError(429);
    plugin.runAutoTranslationTaskWithOptions = async chunk => {
        if (chunk === "chunk two") throw rateLimited;
        return `${chunk} 已翻译`;
    };
    await assert.rejects(plugin.runLongAutoTranslationTask("synthetic long source", plugin.getAutoTranslationOptions()), error => error === rateLimited);
});

test("a visible long message whose later chunk times out is drawn as partial once, not re-sent every cycle", async t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "chunk-timeout", { text: SOURCE });
    item.requestOptions = plugin.getAutoTranslationRequestOptionsForText(SOURCE, plugin.getAutoTranslationOptions());
    item.cacheKey = plugin.getTranslationCacheKey(SOURCE, item.requestOptions);
    startInFlight(plugin, [item]);
    const [first, second] = SOURCE.split("\n");
    plugin.splitLongAutoTranslationText = () => [first, second];
    let calls = 0;
    plugin.runAutoTranslationTaskWithOptions = async chunk => {
        calls++;
        if (chunk === second) throw timeoutError();
        return TRANSLATED.split("\n")[0];
    };
    plugin.getElementText = () => SOURCE;
    plugin.hasManualTranslationLine = () => false;
    plugin.queueAutoTranslationRenderTask = task => task.run();
    const rendered = [];
    plugin.renderTranslation = (...args) => {
        rendered.push(args);
        return {};
    };
    await plugin.autoTranslateQueuedMessage(item);
    assert.equal(calls, 2);
    assert.equal(rendered.length, 1, "the finished chunk is drawn");
    assert.deepEqual(rendered[0][5].partialInfo, { missingSegments: [2], totalSegments: 2 });
    assert.equal(plugin.autoTranslationQueue.length, 0, "not retained for another full pass");
    assert.equal(plugin.autoTranslationProviderFailures.size, 0, "one slow chunk does not cool down the provider");
    assert.ok(plugin.getAutoTranslationPartialResult(item.cacheKey, SOURCE), "kept for redraw instead of a new request");
});

test("a visible item that keeps timing out stops holding a queue slot after a few retries", t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "retain-cap");
    const retainedCounts = [];
    for (let round = 0; round < 5; round++) {
        plugin.autoTranslationQueue = [];
        plugin.autoTranslationQueuedKeys.clear();
        plugin.autoTranslationProviderFailures.clear();
        const recorded = plugin.autoTranslationFailures.get(item.cacheKey);
        if (recorded) recorded.retryAt = Date.now() - 1;
        plugin.getAutoTranslationFailure(item.cacheKey);
        plugin.markAutoTranslationFailure(item, timeoutError());
        retainedCounts.push(plugin.autoTranslationQueue.length);
    }
    assert.deepEqual(retainedCounts.slice(0, 2), [1, 1], "the first failures are retained and retried");
    assert.equal(retainedCounts.at(-1), 0, "later failures wait on their failure record instead");
    const failure = plugin.getAutoTranslationFailure(item.cacheKey);
    assert.ok(failure && !failure.terminal, "still retried after its backoff");
    assert.ok(failure.retryAfterMs >= 80000, `backoff ${failure.retryAfterMs}`);
});

// --- render-2: partial long results ---

test("a long message with a failed chunk reports the missing parts and leaves shared options alone", async () => {
    const plugin = new Plugin();
    plugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three", "chunk four"];
    let calls = 0;
    plugin.runAutoTranslationTaskWithOptions = async () => {
        calls++;
        if (calls === 2) throw plugin.createFinalInvalidAutoTranslationError("same-as-source");
        return `第${calls}段已翻译`;
    };
    const options = plugin.getLongTextTranslationOptions(plugin.getAutoTranslationOptions(), "x".repeat(2000));
    const taskOptions = {};
    await plugin.runLongAutoTranslationTask("synthetic long source", options, taskOptions);
    assert.deepEqual(taskOptions.longTextPartialInfo, { missingSegments: [2], totalSegments: 4 });
    assert.equal(options.longTextPartial, undefined, "the item's request options are not mutated");
});

test("the queue hands partial info to the renderer, which marks the line partial and does not cache it", async t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "partial-render", { text: SOURCE });
    startInFlight(plugin, [item]);
    const partialInfo = { missingSegments: [2], totalSegments: 3 };
    plugin.runAutoTranslationTask = async (_text, _options, taskOptions) => {
        taskOptions.longTextPartialInfo = partialInfo;
        return TRANSLATED;
    };
    plugin.getElementText = () => SOURCE;
    plugin.hasManualTranslationLine = () => false;
    plugin.queueAutoTranslationRenderTask = task => task.run();
    const rendered = [];
    plugin.renderTranslation = (...args) => {
        rendered.push(args);
        return {};
    };
    let cached = 0;
    plugin.setTranslationCache = () => { cached++; };
    await plugin.autoTranslateQueuedMessage(item);
    assert.equal(rendered.length, 1);
    const renderOptions = rendered[0][5];
    assert.deepEqual(renderOptions.partialInfo, partialInfo);
    assert.equal(renderOptions.partial, true);
    assert.equal(cached, 0, "a partial long result is not cached as complete");
});

test("direct providers do not cache a partial long result as complete", () => {
    const plugin = new Plugin();
    plugin.settings.translation.provider = "googleCloud";
    const options = { ...plugin.getAutoTranslationOptions(), longTextPartial: true };
    const validation = plugin.getAutoTranslationOutputValidationResult(SOURCE, TRANSLATED, plugin.getAutoTranslationTargetLanguage(options), { partialLongText: true }, options);
    assert.equal(validation.renderable, true);
    assert.equal(validation.cacheable, false);
    assert.equal(validation.quality, "partial");
});

// --- req-9: partial results are kept for redraw ---

test("a partial result is kept in memory, redrawn by the next scan, and replaced by a complete one", t => {
    const plugin = createQueuePlugin(t);
    plugin.getMessageIdentity = () => "";
    plugin.isAutoTranslationTargetVisibleCached = () => true;
    plugin.hasCurrentTranslationLine = () => false;
    plugin.getElementText = () => SOURCE;
    plugin.hasManualTranslationLine = () => false;
    const candidate = { messageNode: { isConnected: true }, content: { dataset: {}, isConnected: true }, text: SOURCE, targetKind: "message" };
    const first = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(first.action, "enqueue");

    // The result arrives while the message is outside the viewport (a prefetch).
    plugin.isElementVisibleInViewport = () => false;
    plugin.renderAutoTranslationResult(first.item, TRANSLATED, { partialInfo: { missingSegments: [1], totalSegments: 2 } });

    const second = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(second.action, "render-cache");
    assert.equal(second.cachedTranslation, TRANSLATED);
    assert.equal(second.renderMeta?.partial, true);
    assert.deepEqual(second.renderMeta?.partialInfo, { missingSegments: [1], totalSegments: 2 });

    plugin.cacheAutoTranslationResultWithOptions(first.cacheKey, SOURCE, first.requestOptions, TRANSLATED);
    const third = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(third.action, "render-cache");
    assert.equal(third.renderMeta, undefined, "the complete cached result wins");
});

test("a drawn partial line is kept by the next scan instead of being removed and drawn again", () => {
    const plugin = new Plugin();
    const source = [
        "This is the first paragraph of a long message about the release plan for next week.",
        "The second paragraph explains why the build failed yesterday afternoon on the main branch.",
        "The third paragraph lists the people who will review the fix before Friday."
    ].map(line => line.repeat(3)).join("\n");
    const partial = "这是关于下周发布计划的长消息的第一段。".repeat(3);
    const options = plugin.getAutoTranslationRequestOptionsForText(source, plugin.getAutoTranslationOptions());
    const cacheKey = plugin.getTranslationCacheKey(source, options);
    let removed = false;
    const makeLine = () => ({
        dataset: { daitMode: plugin.getTranslationCacheMode(cacheKey) },
        classList: { contains: name => name === "dait-translation-partial" },
        querySelector: () => ({ textContent: partial }),
        remove: () => { removed = true; }
    });
    plugin.restoreTranslationSourceVisibility = () => {};
    // Validated as a complete translation, the line would be removed ("undertranslated").
    assert.equal(plugin.removeInvalidCurrentAutoTranslationLine(makeLine(), {}, source, cacheKey, [], options), true);
    removed = false;
    plugin.rememberAutoTranslationPartialResult(cacheKey, source, partial, { validationQuality: "partial", partialInfo: { missingSegments: [2, 3], totalSegments: 3 } });
    assert.equal(plugin.removeInvalidCurrentAutoTranslationLine(makeLine(), {}, source, cacheKey, [], options), false);
    assert.equal(removed, false);
});

// --- render-5: emoji restore ---

function emojiFixture(t) {
    const created = [];
    useGlobals(t, { document: { createTextNode: text => ({ nodeType: 3, textContent: text }) } });
    const makeImage = (alt, wrapper = null) => ({
        getAttribute: name => (name === "alt" ? alt : null),
        closest: selector => (wrapper && selector.includes("[aria-hidden='true']") ? wrapper : null),
        cloneNode: () => {
            const clone = { alt, attrs: {}, classList: { add() {} }, removeAttribute() {}, setAttribute(name, value) { this.attrs[name] = value; } };
            created.push(clone);
            return clone;
        }
    });
    return { created, makeImage };
}

test("emoji restore keeps extra literal :name: tokens as text instead of refusing the line", t => {
    const { makeImage } = emojiFixture(t);
    const plugin = new Plugin();
    const container = { children: [], appendChild(node) { this.children.push(node); } };
    const descriptors = [{ name: "pepe", alt: ":pepe:", image: makeImage(":pepe:") }];
    assert.equal(plugin.appendTranslationTextWithDiscordEmoji(container, "我喜欢 :pepe: （打字 :pepe:）", {}, descriptors), true);
    assert.equal(container.children.filter(node => node.alt === ":pepe:").length, 1);
    assert.match(container.children.filter(node => node.nodeType === 3).map(node => node.textContent).join(""), /:pepe:/);
});

test("emoji descriptors skip images that text extraction skips", t => {
    const { makeImage } = emojiFixture(t);
    const plugin = new Plugin();
    const hiddenWrapper = {};
    const content = {
        querySelectorAll: () => [makeImage(":pepe:"), makeImage(":hidden:", hiddenWrapper)],
        contains: node => node === hiddenWrapper
    };
    assert.deepEqual(plugin.getTranslationEmojiDescriptors(content).map(descriptor => descriptor.name), ["pepe"]);
});

test("a failed emoji restore is remembered so the message is not requested again every scan", t => {
    const plugin = createQueuePlugin(t);
    const item = makeItem(plugin, "emoji-restore", { text: SOURCE });
    plugin.getElementText = () => SOURCE;
    plugin.hasManualTranslationLine = () => false;
    plugin.renderTranslation = () => null;
    const validation = plugin.getAutoTranslationOutputValidationResult(SOURCE, TRANSLATED, plugin.getAutoTranslationTargetLanguage(item.requestOptions), {}, item.requestOptions);
    assert.equal(plugin.renderAutoTranslationRequestTarget(item, item, TRANSLATED, validation), false);
    const failure = plugin.getAutoTranslationFailure(item.cacheKey);
    assert.ok(failure, "failure recorded");
    assert.equal(failure.invalidReason, "emoji-restore-failed");
    assert.equal(plugin.isAutoTranslationFailureExpired(failure), false);

    const cacheItem = makeItem(plugin, "emoji-restore-cache", { text: SOURCE });
    plugin.isAutoTranslationCacheTargetDrawable = () => true;
    assert.equal(plugin.renderAutoTranslationCacheTarget(cacheItem, TRANSLATED, cacheItem.cacheKey, cacheItem.requestOptions), false);
    assert.equal(plugin.getAutoTranslationFailure(cacheItem.cacheKey)?.invalidReason, "emoji-restore-failed");
});

test("an undrawable result is dropped from the text cache too, so the scan does not redraw it on every pass", t => {
    const plugin = createQueuePlugin(t);
    plugin.getMessageIdentity = () => "";
    plugin.isAutoTranslationTargetVisibleCached = () => true;
    plugin.hasCurrentTranslationLine = () => false;
    plugin.getElementText = () => SOURCE;
    plugin.hasManualTranslationLine = () => false;
    plugin.isAutoTranslationCacheTargetDrawable = () => true;
    plugin.queueAutoTranslationRenderTask = task => task.run();
    let drawAttempts = 0;
    plugin.renderTranslation = () => {
        drawAttempts++;
        return null; // the emoji images cannot be restored
    };
    const candidate = { messageNode: { isConnected: true }, content: { dataset: {}, isConnected: true }, text: SOURCE, targetKind: "message" };
    const first = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(first.action, "enqueue");
    const item = { ...first.item, cacheKey: first.cacheKey, requestOptions: first.requestOptions };
    const validation = plugin.getAutoTranslationOutputValidationResult(SOURCE, TRANSLATED, plugin.getAutoTranslationTargetLanguage(item.requestOptions), {}, item.requestOptions);

    // A request result is cached (message and text cache) and its draw fails.
    plugin.cacheAutoTranslationResultWithOptions(item.cacheKey, SOURCE, item.requestOptions, TRANSLATED);
    assert.equal(plugin.renderAutoTranslationRequestTarget(item, item, TRANSLATED, validation), false);
    const afterRequest = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(afterRequest.action, "terminal-failed", `after a failed request draw: ${afterRequest.action} ${afterRequest.reasonCode || ""}`);

    // A cached result drawn by the scan fails the same way.
    plugin.clearAutoTranslationFailure(item.cacheKey, item.requestOptions);
    plugin.cacheAutoTranslationResultWithOptions(item.cacheKey, SOURCE, item.requestOptions, TRANSLATED);
    const hit = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(hit.action, "render-cache");
    plugin.applyAutoTranslationDecision(candidate, hit, {});
    const attempts = drawAttempts;
    const afterCacheDraw = plugin.evaluateAutoTranslationCandidate(candidate, { context: {} });
    assert.equal(afterCacheDraw.action, "terminal-failed", `after a failed cache draw: ${afterCacheDraw.action} ${afterCacheDraw.reasonCode || ""}`);
    plugin.applyAutoTranslationDecision(candidate, afterCacheDraw, {});
    assert.equal(drawAttempts, attempts, "no further draw attempt");
});

// --- req-8: manual request budget ---

function manualPlan(plugin, text) {
    return {
        mode: "manual",
        text,
        domText: text,
        requestOptions: plugin.getManualTranslationRequestOptions(),
        cacheKey: "manual-budget",
        sourceHash: plugin.getStrongTextFingerprint(text)
    };
}

test("one manual click on a long message that the model echoes sends at most 8 requests", async () => {
    for (const length of [948, 2388]) {
        const plugin = new Plugin();
        const line = "Service log: request 42 finished with status ok and a retry was scheduled. ";
        const text = line.repeat(Math.ceil(length / line.length)).slice(0, length);
        let calls = 0;
        plugin.runModelTask = async (_kind, input) => {
            calls++;
            return String(input);
        };
        await assert.rejects(plugin.runManualRescueTranslationPlan(manualPlan(plugin, text)));
        assert.ok(calls <= 8, `${length} characters made ${calls} requests`);
    }
});

test("a manual long translation with a failed part returns its partial info without touching the plan", async () => {
    const plugin = new Plugin();
    const text = "Synthetic long source. ".repeat(90);
    const chunks = ["first part of the source", "second part of the source", "third part of the source"];
    plugin.splitLongAutoTranslationText = () => chunks;
    plugin.getAutoTranslationInvalidOutputReason = () => "";
    let calls = 0;
    plugin.runModelTask = async (_kind, input) => {
        calls++;
        return String(input).includes("second") ? String(input) : "已翻译的一部分内容";
    };
    const plan = manualPlan(plugin, text);
    const result = await plugin.runManualRescueTranslationPlan(plan);
    assert.equal(result.validation.renderable, true);
    assert.equal(result.validation.quality, "partial");
    assert.deepEqual(result.requestOptions.longTextPartialInfo, { missingSegments: [2], totalSegments: 3 });
    assert.equal(plan.requestOptions.longTextPartialInfo, undefined, "the plan's shared options stay clean");
    assert.ok(calls <= 8);
});

test("a manual click on a long local message with many chunks translates every chunk", async () => {
    const plugin = new Plugin();
    useLocalProvider(plugin);
    const text = "Synthetic long source. ".repeat(170);
    const chunks = Array.from({ length: 12 }, (_value, index) => `part ${index + 1} of the synthetic source`);
    plugin.splitLongAutoTranslationText = () => chunks;
    plugin.getAutoTranslationInvalidOutputReason = () => "";
    let calls = 0;
    plugin.runModelTask = async () => {
        calls++;
        return "已翻译的一部分内容";
    };
    const plan = manualPlan(plugin, text);
    const result = await plugin.runManualRescueTranslationPlan(plan);
    assert.equal(result.validation.renderable, true);
    assert.equal(result.requestOptions.longTextPartialInfo, undefined, "no chunk is left out");
    assert.equal(calls, 12);
});

test("a manual chunk rescue leaves one request for every later chunk", async () => {
    const plugin = new Plugin();
    const text = "Synthetic long source. ".repeat(72);
    const chunks = [
        "first part of the source",
        "The second part keeps repeating the same line. ".repeat(7).trim(),
        "third part of the source",
        "fourth part of the source",
        "fifth part of the source"
    ];
    const originalSplit = plugin.splitLongAutoTranslationText.bind(plugin);
    plugin.splitLongAutoTranslationText = (value, maxLength) => (value === text ? chunks : originalSplit(value, maxLength));
    plugin.getAutoTranslationInvalidOutputReason = () => "";
    let calls = 0;
    plugin.runModelTask = async (_kind, input) => {
        calls++;
        // The whole pass and every piece of the hard chunk come back untranslated.
        return input === text || String(input).includes("second") ? String(input) : "已翻译的一部分内容";
    };
    const result = await plugin.runManualRescueTranslationPlan(manualPlan(plugin, text));
    assert.equal(result.validation.renderable, true);
    assert.deepEqual(result.requestOptions.longTextPartialInfo, { missingSegments: [2], totalSegments: 5 }, `${calls} requests`);
});

test("the manual request budget grows with the chunks but stays bounded", async () => {
    const { MANUAL_TRANSLATION_REQUEST_BUDGET_MAX } = require("../../src/constants");
    const plugin = new Plugin();
    const text = "Synthetic long source. ".repeat(170);
    plugin.splitLongAutoTranslationText = () => Array.from({ length: 60 }, (_value, index) => `part ${index + 1} of the source`);
    let calls = 0;
    plugin.runModelTask = async (_kind, input) => {
        calls++;
        return String(input);
    };
    await assert.rejects(plugin.runManualRescueTranslationPlan(manualPlan(plugin, text)));
    assert.ok(MANUAL_TRANSLATION_REQUEST_BUDGET_MAX >= 16 && MANUAL_TRANSLATION_REQUEST_BUDGET_MAX <= 32);
    assert.ok(calls <= MANUAL_TRANSLATION_REQUEST_BUDGET_MAX, `${calls} requests`);
});

function manualTranslateFixture(t) {
    const plugin = createQueuePlugin(t);
    const messageNode = { isConnected: true };
    const content = { dataset: {}, isConnected: true };
    plugin.getElementText = () => SOURCE;
    plugin.resolveManualTranslationSource = () => ({ text: SOURCE, domText: SOURCE, source: "dom-content" });
    plugin.isLowInformationRepeatedText = () => false;
    plugin.clearTranslationLineDismissal = () => {};
    plugin.getMessageIdentity = () => "";
    plugin.renderManualLoading = () => {};
    plugin.setButtonBusy = () => {};
    plugin.isManualTranslationRequestCurrent = () => true;
    plugin.isManualTranslationConfigCurrent = () => true;
    plugin.isManualTranslationSourceStillCurrent = () => true;
    const rendered = [];
    plugin.renderTranslation = (...args) => {
        rendered.push(args);
        return {};
    };
    const removed = [];
    plugin.removeTranslationNode = (...args) => { removed.push(args); };
    const toasts = [];
    plugin.showToast = (...args) => { toasts.push(args); };
    const autoOptions = plugin.withMessageIdentity(plugin.getAutoTranslationRequestOptionsForText(SOURCE, plugin.getAutoTranslationOptions()), messageNode, content, SOURCE);
    const autoKey = plugin.getTranslationCacheKey(SOURCE, autoOptions);
    return { plugin, messageNode, content, rendered, removed, toasts, autoKey };
}

function manualPartialResult(plugin, translated, partialInfo) {
    return {
        translated,
        validation: { renderable: true, cacheable: false, quality: "partial", reasonCode: "long-text-partial" },
        requestOptions: { ...plugin.getManualTranslationRequestOptions(), longTextPartial: true, longTextPartialInfo: partialInfo }
    };
}

test("retranslating a kept auto partial keeps it unless the manual result misses fewer parts", async t => {
    const { plugin, messageNode, content, rendered, autoKey } = manualTranslateFixture(t);
    const kept = "第一部分。第四部分。第五部分。";
    const keptInfo = { missingSegments: [2, 3], totalSegments: 5 };
    plugin.rememberAutoTranslationPartialResult(autoKey, SOURCE, kept, { validationQuality: "partial", partialInfo: keptInfo });
    plugin.runManualTranslationPlan = async () => manualPartialResult(plugin, "第一部分。第三部分。", { missingSegments: [2, 4, 5], totalSegments: 5 });
    await plugin.retranslateMessage(messageNode, content);
    assert.equal(rendered.length, 1);
    assert.equal(rendered[0][2], kept, "the better kept partial stays");
    assert.deepEqual(rendered[0][5].partialInfo, keptInfo);
    assert.ok(plugin.getAutoTranslationPartialResult(autoKey, SOURCE), "and stays kept for redraw");

    plugin.runManualTranslationPlan = async () => manualPartialResult(plugin, "第一部分。第二部分。第三部分。第四部分。", { missingSegments: [5], totalSegments: 5 });
    await plugin.retranslateMessage(messageNode, content);
    assert.equal(rendered.length, 2);
    assert.equal(rendered[1][2], "第一部分。第二部分。第三部分。第四部分。", "a better manual result replaces it");
    assert.deepEqual(rendered[1][5].partialInfo, { missingSegments: [5], totalSegments: 5 });
});

test("manual rescue stops at the first non-retryable provider error", async () => {
    const plugin = new Plugin();
    const line = "Service log: request 42 finished with status ok and a retry was scheduled. ";
    const text = line.repeat(40);
    let calls = 0;
    const rateLimited = statusError(429);
    plugin.runModelTask = async (_kind, input) => {
        calls++;
        if (calls === 1) return String(input);
        throw rateLimited;
    };
    await assert.rejects(plugin.runManualRescueTranslationPlan(manualPlan(plugin, text)), error => error === rateLimited);
    assert.equal(calls, 2);

    // A shorter long message starts with a whole-message pass; a 429 there ends the click too.
    const wholePassPlugin = new Plugin();
    let wholePassCalls = 0;
    wholePassPlugin.runModelTask = async () => {
        wholePassCalls++;
        throw rateLimited;
    };
    await assert.rejects(wholePassPlugin.runManualRescueTranslationPlan(manualPlan(wholePassPlugin, line.repeat(12))), error => error === rateLimited);
    assert.equal(wholePassCalls, 1);
});

// --- lifecycle-5: orphaned requests are aborted ---

test("a full invalidation aborts the in-flight auto request instead of leaving it running", async t => {
    const signals = [];
    t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
        signals.push(options.signal);
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    const plugin = createQueuePlugin(t);
    plugin.settings.translation.apiKey = "sk-fake-1";
    plugin.cancelIncrementalMessageScan = () => {};
    plugin.cancelAutoTranslationRenderQueue = () => {};
    plugin.removeAllAutoTranslationNodes = () => {};
    const item = makeItem(plugin, "orphan", { text: "привет" });
    startInFlight(plugin, [item]);
    const running = plugin.autoTranslateQueuedMessage(item);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, 1);
    plugin.invalidateAutoTranslationQueue();
    assert.equal(signals[0].aborted, true, "aborted at once, not by its own timeout");
    await running;
    assert.equal(plugin.activeApiControllers.size, 0);
    assert.equal(plugin.autoTranslationFailures.size, 0);
    assert.equal(plugin.autoTranslationProviderFailures.size, 0);
    assert.equal(plugin.autoTranslationInFlight, 0);

    // Work started after the invalidation gets a fresh, live signal.
    const next = makeItem(plugin, "after-invalidation", { text: "привет мир" });
    startInFlight(plugin, [next]);
    const nextRun = plugin.autoTranslateQueuedMessage(next);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(signals.length, 2);
    assert.equal(signals[1].aborted, false);
    // Scroll and jump invalidations keep in-flight work, so they must not abort it.
    plugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
    assert.equal(signals[1].aborted, false);
    plugin.abortActiveApiRequests();
    await nextRun;
});
