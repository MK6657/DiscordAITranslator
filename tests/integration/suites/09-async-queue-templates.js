"use strict";

// Artifact regression suite: Async manual supersession, requeue invariants & templates
async function run(harness, shared) {
    const { assert, Plugin, createFakeElement } = harness;
    const { longOrdinarySource, explanatoryNoiseOutput, longSingleText } = shared;

    const manualSupersessionPlugin = new Plugin();
    manualSupersessionPlugin.settings.translation.enabled = true;
    manualSupersessionPlugin.settings.translation.apiKey = "sk-manual";
    manualSupersessionPlugin.getMessageIdentity = () => "manual-supersession-identity";
    manualSupersessionPlugin.getElementText = content => content.text;
    manualSupersessionPlugin.renderTranslationLoading = () => {};
    manualSupersessionPlugin.removeTranslationNode = () => {};
    manualSupersessionPlugin.setButtonBusy = () => {};
    manualSupersessionPlugin.showToast = () => {};
    manualSupersessionPlugin.setTranslationCache = () => {};
    manualSupersessionPlugin.syncManualTranslationToAutoCache = () => {};
    manualSupersessionPlugin.rememberRecentAutoTranslationRender = () => {};
    const manualSupersessionResolvers = [];
    manualSupersessionPlugin.runManualTranslationPlan = plan => new Promise(resolve => {
        manualSupersessionResolvers.push(translated => resolve({
            translated,
            requestOptions: plan.requestOptions,
            validation: { quality: "good", reasonCode: "", renderable: true, cacheable: true }
        }));
    });
    const manualSupersessionRenders = [];
    manualSupersessionPlugin.renderTranslation = (_messageNode, _content, translated) => manualSupersessionRenders.push(translated);
    const manualSupersessionMessage = { isConnected: true };
    const manualSupersessionContent = { dataset: {}, isConnected: true, text: "hello" };
    const manualSupersessionFirst = manualSupersessionPlugin.translateMessage(manualSupersessionMessage, manualSupersessionContent, null);
    const manualSupersessionSecond = manualSupersessionPlugin.translateMessage(manualSupersessionMessage, manualSupersessionContent, null);
    manualSupersessionResolvers[1]("\u65b0\u8bd1\u6587");
    await manualSupersessionSecond;
    manualSupersessionResolvers[0]("\u65e7\u8bd1\u6587");
    await manualSupersessionFirst;
    assert.deepEqual(manualSupersessionRenders, ["\u65b0\u8bd1\u6587"]);

    const manualEditedPlugin = new Plugin();
    manualEditedPlugin.settings.translation.enabled = true;
    manualEditedPlugin.settings.translation.apiKey = "sk-manual";
    manualEditedPlugin.getMessageIdentity = () => "manual-edited-identity";
    manualEditedPlugin.getElementText = content => content.text;
    manualEditedPlugin.renderTranslationLoading = () => {};
    manualEditedPlugin.setButtonBusy = () => {};
    manualEditedPlugin.showToast = () => {};
    manualEditedPlugin.syncManualTranslationToAutoCache = () => {};
    manualEditedPlugin.rememberRecentAutoTranslationRender = () => {};
    let manualEditedResolve = null;
    let manualEditedRenders = 0;
    let manualEditedRemovals = 0;
    let manualEditedCacheWrites = 0;
    manualEditedPlugin.runManualTranslationPlan = plan => new Promise(resolve => {
        manualEditedResolve = translated => resolve({
            translated,
            requestOptions: plan.requestOptions,
            validation: { quality: "good", reasonCode: "", renderable: true, cacheable: true }
        });
    });
    manualEditedPlugin.renderTranslation = () => { manualEditedRenders++; };
    manualEditedPlugin.removeTranslationNode = () => { manualEditedRemovals++; };
    manualEditedPlugin.setTranslationCache = () => { manualEditedCacheWrites++; };
    const manualEditedMessage = { isConnected: true };
    const manualEditedContent = { dataset: {}, isConnected: true, text: "hello" };
    const manualEditedPromise = manualEditedPlugin.translateMessage(manualEditedMessage, manualEditedContent, null);
    manualEditedContent.text = "hello world";
    manualEditedResolve("\u4f60\u597d");
    await manualEditedPromise;
    assert.equal(manualEditedRenders, 0);
    assert.equal(manualEditedCacheWrites, 0);
    assert.equal(manualEditedRemovals, 1);

    const manualConfigSnapshotPlugin = new Plugin();
    manualConfigSnapshotPlugin.settings.translation.provider = "deepseek";
    manualConfigSnapshotPlugin.settings.translation.apiKey = "snapshot-key";
    manualConfigSnapshotPlugin.settings.translation.targetLanguage = "English";
    manualConfigSnapshotPlugin.getMessageIdentity = () => "manual-config-snapshot-identity";
    const manualConfigSnapshotPlan = manualConfigSnapshotPlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "snapshot source" },
        "snapshot source"
    );
    assert.equal(manualConfigSnapshotPlan.requestOptions.targetLanguage, "English");
    assert.equal(manualConfigSnapshotPlan.requestOptions.configOverrides.provider, "deepseek");
    assert.equal(manualConfigSnapshotPlugin.isManualTranslationConfigCurrent(manualConfigSnapshotPlan), true);
    manualConfigSnapshotPlugin.settings.translation.targetLanguage = "\u6c49\u8bed";
    manualConfigSnapshotPlugin.autoTranslationConfigVersion++;
    assert.equal(manualConfigSnapshotPlugin.isManualTranslationConfigCurrent(manualConfigSnapshotPlan), false);

    const manualFallbackCachePlugin = new Plugin();
    manualFallbackCachePlugin.settings.translation.enabled = true;
    manualFallbackCachePlugin.settings.translation.apiKey = "sk-manual";
    manualFallbackCachePlugin.getMessageIdentity = () => "manual-fallback-cache-identity";
    manualFallbackCachePlugin.getElementText = content => content.text;
    manualFallbackCachePlugin.renderTranslationLoading = () => {};
    manualFallbackCachePlugin.removeTranslationNode = () => {};
    manualFallbackCachePlugin.setButtonBusy = () => {};
    manualFallbackCachePlugin.showToast = () => {};
    manualFallbackCachePlugin.rememberRecentAutoTranslationRender = () => {};
    manualFallbackCachePlugin.renderTranslation = () => {};
    let manualFallbackCacheWrites = 0;
    let manualFallbackAutoCacheWrites = 0;
    manualFallbackCachePlugin.setTranslationCache = () => { manualFallbackCacheWrites++; };
    manualFallbackCachePlugin.syncManualTranslationToAutoCache = () => { manualFallbackAutoCacheWrites++; };
    manualFallbackCachePlugin.runManualTranslationPlan = async plan => {
        plan.requestOptions.requestContext.fallbackProvider = "microsoft";
        return {
            translated: "\u5907\u7528 provider \u8bd1\u6587",
            requestOptions: plan.requestOptions,
            validation: { quality: "good", reasonCode: "", renderable: true, cacheable: true }
        };
    };
    await manualFallbackCachePlugin.translateMessage(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "manual fallback source" },
        null
    );
    assert.equal(manualFallbackCacheWrites, 0);
    assert.equal(manualFallbackAutoCacheWrites, 0);

    const staleFallbackPlugin = new Plugin();
    let staleFallbackCleared = 0;
    let staleFallbackRendered = 0;
    let staleFallbackFailed = 0;
    staleFallbackPlugin.runAutoTranslationTask = async () => {
        staleFallbackPlugin.autoTranslationConfigVersion++;
        return "stale translated";
    };
    staleFallbackPlugin.clearPendingAutoTranslationItem = () => { staleFallbackCleared++; };
    staleFallbackPlugin.renderAutoTranslationResult = () => { staleFallbackRendered++; };
    staleFallbackPlugin.markAutoTranslationFailure = () => { staleFallbackFailed++; };
    const staleFallbackItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-fallback-cache",
        requestOptions: { version: staleFallbackPlugin.autoTranslationConfigVersion }
    };
    const staleFallbackPending = new Set([staleFallbackItem]);
    await staleFallbackPlugin.runAutoTranslationFallbackItems(staleFallbackPending);
    assert.equal(staleFallbackPending.size, 0);
    assert.equal(staleFallbackCleared, 0);
    assert.equal(staleFallbackRendered, 0);
    assert.equal(staleFallbackFailed, 0);

    const batchRetryPlugin = new Plugin();
    batchRetryPlugin.settings.ui.autoTranslateStrictRetry = true;
    batchRetryPlugin.renderPendingAutoTranslationLoading = () => {};
    batchRetryPlugin.queueScan = () => {};
    batchRetryPlugin.drainAutoTranslationQueue = () => {};
    batchRetryPlugin.isAutoTranslationRequestCurrent = () => true;
    batchRetryPlugin.isInvalidAutoTranslationOutput = (source, translated) => String(translated).startsWith("bad");
    const batchRetryCalls = [];
    batchRetryPlugin.runAutoTranslationBatchTask = async (texts, options, taskOptions = {}) => {
        batchRetryCalls.push({ texts, retry: Boolean(taskOptions.retry) });
        return taskOptions.retry ? ["\u4f60\u597d\u4e59"] : ["\u4f60\u597d\u7532", "bad-b"];
    };
    batchRetryPlugin.renderAutoTranslationResult = (item, translated) => {
        item.rendered = translated;
    };
    batchRetryPlugin.runAutoTranslationTask = () => {
        throw new Error("batch retry should resolve before single-item fallback");
    };
    const batchRetryItemA = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source-a" },
        text: "source-a",
        cacheKey: "batch-retry-a",
        requestOptions: batchRetryPlugin.getAutoTranslationOptions()
    };
    const batchRetryItemB = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source-b" },
        text: "source-b",
        cacheKey: "batch-retry-b",
        requestOptions: batchRetryPlugin.getAutoTranslationOptions()
    };
    batchRetryPlugin.addAutoTranslationPendingTarget(batchRetryItemA.cacheKey, batchRetryItemA);
    batchRetryPlugin.addAutoTranslationPendingTarget(batchRetryItemB.cacheKey, batchRetryItemB);
    await batchRetryPlugin.autoTranslateQueuedBatch([batchRetryItemA, batchRetryItemB]);
    assert.deepEqual(batchRetryCalls, [
        { texts: ["source-a", "source-b"], retry: false },
        { texts: ["source-b"], retry: true }
    ]);
    assert.equal(batchRetryItemA.rendered, "\u4f60\u597d\u7532");
    assert.equal(batchRetryItemB.rendered, "\u4f60\u597d\u4e59");

    const batchStringRowsPlugin = new Plugin();
    batchStringRowsPlugin.runModelTask = async () => JSON.stringify(["\u4f60\u597d A", "\u4f60\u597d B"]);
    await assert.rejects(
        batchStringRowsPlugin.runAutoTranslationBatchTask(["source-a", "source-b"], batchStringRowsPlugin.getAutoTranslationOptions()),
        error => error.code === "AUTO_BATCH_PARSE_FAILED"
    );

    const longBatchGuardPlugin = new Plugin();
    await assert.rejects(
        longBatchGuardPlugin.runAutoTranslationBatchTask([longSingleText], longBatchGuardPlugin.getAutoTranslationOptions()),
        error => error.code === "AUTO_BATCH_PARSE_FAILED"
    );

    const longChunkPlugin = new Plugin();
    const longChunkCalls = [];
    const ultraLongText = "sentence ".repeat(210);
    longChunkPlugin.isInvalidAutoTranslationOutput = () => false;
    longChunkPlugin.runModelTask = async (kind, input, options) => {
        longChunkCalls.push({ input, options });
        return `\u5df2\u7ffb\u8bd1\u7b2c${longChunkCalls.length}\u6bb5`;
    };
    const longChunkResult = await longChunkPlugin.runAutoTranslationTask(ultraLongText, longChunkPlugin.getAutoTranslationOptions());
    assert.equal(longChunkCalls.length > 1, true);
    assert.equal(longChunkCalls.every(call => String(call.input).length <= 900), true);
    assert.equal(longChunkCalls.every(call => call.options?.configOverrides?.promptPolicyVersion === longChunkPlugin.getPromptPolicyVersion("longText")), true);
    assert.match(longChunkCalls[0].options.configOverrides.prompt, /Long automatic channel translation mode/);
    assert.match(longChunkResult, /\u5df2\u7ffb\u8bd1\u7b2c1\u6bb5/);
    assert.match(longChunkResult, /\u5df2\u7ffb\u8bd1\u7b2c2\u6bb5/);

    const localLongChunkPlugin = new Plugin();
    localLongChunkPlugin.settings.translation.provider = "sakuraLocal";
    localLongChunkPlugin.settings.translation.apiKey = "";
    localLongChunkPlugin.isInvalidAutoTranslationOutput = () => false;
    const localLongChunkCalls = [];
    localLongChunkPlugin.runModelTask = async (kind, input, options) => {
        localLongChunkCalls.push({ input, options });
        return `\u672c\u5730\u5df2\u7ffb\u8bd1\u7b2c${localLongChunkCalls.length}\u6bb5`;
    };
    const mediumLongText = "sentence ".repeat(70);
    const localLongChunkResult = await localLongChunkPlugin.runAutoTranslationTask(mediumLongText, localLongChunkPlugin.getAutoTranslationOptions());
    assert.equal(localLongChunkCalls.length > 1, true);
    assert.equal(localLongChunkCalls.every(call => String(call.input).length <= 430), true);
    assert.equal(localLongChunkCalls.every(call => Number(call.options?.configOverrides?.maxTokens || 0) <= 1200), true);
    assert.equal(localLongChunkCalls.every(call => !String(call.options?.configOverrides?.prompt || "").includes("<source_message>")), true);
    assert.equal(localLongChunkCalls.every(call => /Never refuse translation/.test(call.options?.configOverrides?.prompt || "")), true);
    assert.match(localLongChunkResult, /\u672c\u5730\u5df2\u7ffb\u8bd1\u7b2c1\u6bb5/);

    const longPartialPlugin = new Plugin();
    longPartialPlugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three"];
    let longPartialCalls = 0;
    longPartialPlugin.runAutoTranslationTaskWithOptions = async () => {
        longPartialCalls++;
        if (longPartialCalls === 2) throw longPartialPlugin.createFinalInvalidAutoTranslationError("same-as-source");
        return longPartialCalls === 1 ? "\u7b2c\u4e00\u6bb5\u5df2\u7ffb\u8bd1" : "\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1";
    };
    const longPartialResult = await longPartialPlugin.runLongAutoTranslationTask("very long source", longPartialPlugin.getAutoTranslationOptions());
    assert.match(longPartialResult, /\u7b2c\u4e00\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.doesNotMatch(longPartialResult, /\u7b2c\s+2\/3\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25/);
    assert.match(longPartialResult, /\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1/);
    const longOneOfFourPlugin = new Plugin();
    longOneOfFourPlugin.settings.translation.provider = "sakuraLocal";
    longOneOfFourPlugin.settings.translation.targetLanguage = "Chinese";
    longOneOfFourPlugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three", "chunk four"];
    let longOneOfFourCalls = 0;
    longOneOfFourPlugin.runAutoTranslationTaskWithOptions = async () => {
        longOneOfFourCalls++;
        if (longOneOfFourCalls !== 3) throw longOneOfFourPlugin.createFinalInvalidAutoTranslationError("residual-source");
        return "\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1";
    };
    const longOneOfFourResult = await longOneOfFourPlugin.runLongAutoTranslationTask("very long source", longOneOfFourPlugin.getAutoTranslationOptions());
    assert.doesNotMatch(longOneOfFourResult, /\u7b2c\s+1\/4\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25/);
    assert.match(longOneOfFourResult, /\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.doesNotMatch(longOneOfFourResult, /\u7b2c\s+4\/4\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25/);

    const longCandidatePlugin = new Plugin();
    const longCandidateRaw = "\u8fd9\u662f\u4e00\u6bb5\u5df2\u7ffb\u8bd1\u7684\u957f\u6587\uff0c\u5305\u542b\u201cAI\u201d\u8fd9\u6837\u7684\u4fdd\u7559\u8bcd\uff0c\u4f46\u4e0d\u5e94\u8be5\u88ab\u62bd\u53d6\u6210\u5f88\u77ed\u7684\u5019\u9009\u7247\u6bb5\u3002".repeat(3);
    assert.equal(
        longCandidatePlugin.sanitizeAutoTranslationOutput("source ".repeat(120), longCandidateRaw, "Chinese", { partialLongText: true }),
        longCandidateRaw
    );

    const subchunkRescuePlugin = new Plugin();
    subchunkRescuePlugin.settings.translation.provider = "sakuraLocal";
    subchunkRescuePlugin.settings.translation.targetLanguage = "Chinese";
    const subchunkCalls = [];
    const subchunkLargeText = "large chunk text ".repeat(24).trim();
    subchunkRescuePlugin.splitLongAutoTranslationText = (text, limit) => {
        if (text === subchunkLargeText && limit <= 320) return ["part one", "part two"];
        return [text];
    };
    subchunkRescuePlugin.runAutoTranslationTaskWithOptions = async input => {
        subchunkCalls.push(input);
        if (input === subchunkLargeText) throw subchunkRescuePlugin.createFinalInvalidAutoTranslationError("residual-source");
        return input === "part one" ? "\u7b2c\u4e00\u5c0f\u6bb5\u5df2\u7ffb\u8bd1" : "\u7b2c\u4e8c\u5c0f\u6bb5\u5df2\u7ffb\u8bd1";
    };
    subchunkRescuePlugin.getAutoTranslationOutputValidationResult = (_source, output) => ({
        quality: "usable",
        reasonCode: "",
        renderable: Boolean(output),
        cacheable: true
    });
    const subchunkOptions = subchunkRescuePlugin.getLongTextChunkTranslationOptions(
        subchunkRescuePlugin.getLongTextTranslationOptions(subchunkRescuePlugin.getAutoTranslationOptions(), "large chunk text ".repeat(40)),
        subchunkLargeText,
        0,
        1,
        "subchunk-source"
    );
    const subchunkRescue = await subchunkRescuePlugin.runLongAutoTranslationChunkManualRescue(
        subchunkLargeText,
        subchunkOptions,
        subchunkRescuePlugin.createFinalInvalidAutoTranslationError("residual-source"),
        { manualRescue: true },
        { sourceHash: "subchunk-source", chunkIndex: 0, chunkTotal: 1 }
    );
    assert.match(subchunkRescue.translated, /\u7b2c\u4e00\u5c0f\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.match(subchunkRescue.translated, /\u7b2c\u4e8c\u5c0f\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.deepEqual(subchunkCalls, [subchunkLargeText, subchunkLargeText, "part one", "part two"]);

    const longPartialOptions = longPartialPlugin.getLongTextTranslationOptions(longPartialPlugin.getAutoTranslationOptions(), "very long source ".repeat(40));
    const longPartialPlaceholder = longPartialPlugin.getLongAutoTranslationChunkFailurePlaceholder(1, 3, longPartialPlugin.createFinalInvalidAutoTranslationError("same-as-source"), "Chinese");
    assert.equal(longPartialPlugin.isInvalidAutoTranslationCacheValue("very long source ".repeat(40), longPartialPlaceholder, longPartialOptions), true);
    const longPartialCacheKeys = [];
    longPartialPlugin.setTranslationCache = key => longPartialCacheKeys.push(key);
    longPartialPlugin.cacheAutoTranslationResultWithOptions("partial-message-cache-key", "very long source ".repeat(40), longPartialOptions, longPartialPlaceholder);
    assert.deepEqual(longPartialCacheKeys, []);

    const localLongTimeoutPlugin = new Plugin();
    localLongTimeoutPlugin.settings.translation.provider = "sakuraLocal";
    localLongTimeoutPlugin.settings.translation.apiKey = "";
    const localLongOptions = localLongTimeoutPlugin.getLongTextTranslationOptions(localLongTimeoutPlugin.getAutoTranslationOptions(), "x".repeat(900));
    assert.equal(localLongTimeoutPlugin.getAutoTranslationRequestTimeoutMs(localLongOptions, "x".repeat(900)) > 45000, true);
    const localLongConfig = localLongTimeoutPlugin.getEffectiveTaskConfig("translation", localLongOptions.configOverrides);
    assert.equal(
        localLongTimeoutPlugin.isLocalProviderUnavailableError(new Error("API request timed out after 90s"), localLongConfig.endpoint, localLongConfig, localLongOptions),
        false
    );

    const batchOutOfOrderPlugin = new Plugin();
    batchOutOfOrderPlugin.runModelTask = async () => JSON.stringify([
        { id: "002", translation: "\u4f60\u597d B" },
        { id: "001", translation: "\u4f60\u597d A" }
    ]);
    assert.deepEqual(
        await batchOutOfOrderPlugin.runAutoTranslationBatchTask(["source-a", "source-b"], batchOutOfOrderPlugin.getAutoTranslationOptions()),
        ["\u4f60\u597d A", "\u4f60\u597d B"]
    );

    const batchMissingIdPlugin = new Plugin();
    batchMissingIdPlugin.runModelTask = async () => JSON.stringify([
        { id: "001", translation: "\u4f60\u597d A" }
    ]);
    assert.deepEqual(
        await batchMissingIdPlugin.runAutoTranslationBatchTask(["source-a", "source-b"], batchMissingIdPlugin.getAutoTranslationOptions()),
        ["\u4f60\u597d A", ""]
    );

    const batchStringFallbackPlugin = new Plugin();
    batchStringFallbackPlugin.settings.ui.autoTranslateStrictRetry = true;
    const batchStringFallbackRendered = [];
    let batchStringFallbackCalls = 0;
    batchStringFallbackPlugin.renderPendingAutoTranslationLoading = () => {};
    batchStringFallbackPlugin.queueScan = () => {};
    batchStringFallbackPlugin.drainAutoTranslationQueue = () => {};
    batchStringFallbackPlugin.runModelTask = async () => {
        batchStringFallbackCalls++;
        return JSON.stringify(["\u9519\u4f4d A", "\u9519\u4f4d B"]);
    };
    batchStringFallbackPlugin.runAutoTranslationStrictFallbackTask = async text => `strict-${text}`;
    batchStringFallbackPlugin.renderAutoTranslationResult = (item, translated) => {
        batchStringFallbackRendered.push({ key: item.cacheKey, translated });
    };
    const batchStringFallbackItems = ["a", "b"].map(name => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${name}` },
        text: `source-${name}`,
        cacheKey: `batch-string-fallback-${name}`,
        requestOptions: batchStringFallbackPlugin.getAutoTranslationOptions()
    }));
    batchStringFallbackItems.forEach(item => batchStringFallbackPlugin.addAutoTranslationPendingTarget(item.cacheKey, item));
    await batchStringFallbackPlugin.autoTranslateQueuedBatch(batchStringFallbackItems);
    assert.equal(batchStringFallbackCalls, 2);
    assert.deepEqual(batchStringFallbackRendered, [
        { key: "batch-string-fallback-a", translated: "strict-source-a" },
        { key: "batch-string-fallback-b", translated: "strict-source-b" }
    ]);

    const staleRouteInFlightPlugin = new Plugin();
    staleRouteInFlightPlugin.getCurrentRouteKey = () => "guild-a:channel-now:";
    staleRouteInFlightPlugin.renderPendingAutoTranslationLoading = () => {};
    staleRouteInFlightPlugin.runAutoTranslationTask = async () => "stale route translated";
    staleRouteInFlightPlugin.renderAutoTranslationResult = () => { throw new Error("stale route request should not render"); };
    staleRouteInFlightPlugin.markAutoTranslationFailure = () => { throw new Error("stale route request should not mark failure"); };
    staleRouteInFlightPlugin.drainAutoTranslationQueue = () => {};
    staleRouteInFlightPlugin.queueScan = () => {};
    const staleRouteInFlightItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-route-in-flight",
        requestOptions: { version: staleRouteInFlightPlugin.autoTranslationConfigVersion, routeKey: "guild-a:channel-old:" }
    };
    staleRouteInFlightPlugin.autoTranslationInFlight = 1;
    staleRouteInFlightPlugin.autoTranslationInFlightItems = 1;
    staleRouteInFlightPlugin.autoTranslationQueuedKeys.add(staleRouteInFlightItem.cacheKey);
    staleRouteInFlightPlugin.markAutoTranslationInFlightItem(staleRouteInFlightItem);
    await staleRouteInFlightPlugin.autoTranslateQueuedMessage(staleRouteInFlightItem);
    assert.equal(staleRouteInFlightPlugin.autoTranslationInFlight, 0);
    assert.equal(staleRouteInFlightPlugin.autoTranslationInFlightItems, 0);
    assert.equal(staleRouteInFlightPlugin.autoTranslationInFlightKeys.has(staleRouteInFlightItem.cacheKey), false);
    assert.equal(staleRouteInFlightPlugin.autoTranslationQueuedKeys.has(staleRouteInFlightItem.cacheKey), false);

    const savedConsoleWarn = console.warn;
    console.warn = () => {};
    const renderThrowPlugin = new Plugin();
    renderThrowPlugin.renderPendingAutoTranslationLoading = () => {};
    renderThrowPlugin.queueScan = () => {};
    renderThrowPlugin.drainAutoTranslationQueue = () => {};
    renderThrowPlugin.runAutoTranslationBatchTask = async () => ["\u5df2\u7ffb\u8bd1"];
    renderThrowPlugin.isInvalidAutoTranslationOutput = () => false;
    let providerFailureMarked = false;
    let renderCleanupCount = 0;
    renderThrowPlugin.markAutoTranslationProviderFailure = () => { providerFailureMarked = true; };
    renderThrowPlugin.clearPendingAutoTranslationItem = () => { renderCleanupCount++; };
    renderThrowPlugin.renderAutoTranslationResult = () => { throw new Error("render failed"); };
    const renderThrowItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "render-throw",
        requestOptions: renderThrowPlugin.getAutoTranslationOptions()
    };
    await renderThrowPlugin.autoTranslateQueuedBatch([renderThrowItem]);
    console.warn = savedConsoleWarn;
    assert.equal(providerFailureMarked, false);
    assert.equal(renderCleanupCount, 1);

    const savedConsoleWarnForLoading = console.warn;
    console.warn = () => {};
    const loadingThrowSinglePlugin = new Plugin();
    loadingThrowSinglePlugin.renderPendingAutoTranslationLoading = () => { throw new Error("loading render failed"); };
    loadingThrowSinglePlugin.runAutoTranslationTask = async () => "translated";
    loadingThrowSinglePlugin.renderAutoTranslationResult = item => { item.rendered = true; };
    loadingThrowSinglePlugin.drainAutoTranslationQueue = () => {};
    loadingThrowSinglePlugin.queueScan = () => {};
    const loadingThrowSingleItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "loading-throw-single",
        requestOptions: loadingThrowSinglePlugin.getAutoTranslationOptions()
    };
    loadingThrowSinglePlugin.autoTranslationInFlight = 1;
    loadingThrowSinglePlugin.autoTranslationInFlightItems = 1;
    loadingThrowSinglePlugin.autoTranslationQueuedKeys.add(loadingThrowSingleItem.cacheKey);
    loadingThrowSinglePlugin.markAutoTranslationInFlightItem(loadingThrowSingleItem);
    await loadingThrowSinglePlugin.autoTranslateQueuedMessage(loadingThrowSingleItem);
    assert.equal(loadingThrowSingleItem.rendered, true);
    assert.equal(loadingThrowSinglePlugin.autoTranslationInFlight, 0);
    assert.equal(loadingThrowSinglePlugin.autoTranslationInFlightItems, 0);
    assert.equal(loadingThrowSinglePlugin.autoTranslationQueuedKeys.has(loadingThrowSingleItem.cacheKey), false);

    const loadingThrowBatchPlugin = new Plugin();
    loadingThrowBatchPlugin.renderPendingAutoTranslationLoading = () => { throw new Error("loading render failed"); };
    loadingThrowBatchPlugin.runAutoTranslationBatchTask = async () => ["\u5df2\u7ffb\u8bd1\u7532", "\u5df2\u7ffb\u8bd1\u4e59"];
    loadingThrowBatchPlugin.isInvalidAutoTranslationOutput = () => false;
    loadingThrowBatchPlugin.renderAutoTranslationResult = item => { item.rendered = true; };
    loadingThrowBatchPlugin.drainAutoTranslationQueue = () => {};
    loadingThrowBatchPlugin.queueScan = () => {};
    const loadingThrowBatchItems = ["a", "b"].map(name => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${name}` },
        text: `source-${name}`,
        cacheKey: `loading-throw-batch-${name}`,
        requestOptions: loadingThrowBatchPlugin.getAutoTranslationOptions()
    }));
    loadingThrowBatchPlugin.autoTranslationInFlight = 1;
    loadingThrowBatchPlugin.autoTranslationInFlightItems = loadingThrowBatchItems.length;
    loadingThrowBatchItems.forEach(item => loadingThrowBatchPlugin.autoTranslationQueuedKeys.add(item.cacheKey));
    loadingThrowBatchItems.forEach(item => loadingThrowBatchPlugin.markAutoTranslationInFlightItem(item));
    await loadingThrowBatchPlugin.autoTranslateQueuedBatch(loadingThrowBatchItems);
    console.warn = savedConsoleWarnForLoading;
    assert.equal(loadingThrowBatchItems.every(item => item.rendered), true);
    assert.equal(loadingThrowBatchPlugin.autoTranslationInFlight, 0);
    assert.equal(loadingThrowBatchPlugin.autoTranslationInFlightItems, 0);
    assert.equal(loadingThrowBatchItems.every(item => !loadingThrowBatchPlugin.autoTranslationQueuedKeys.has(item.cacheKey)), true);

    const sakuraSingleFailurePlugin = new Plugin();
    sakuraSingleFailurePlugin.settings.translation.provider = "sakuraLocal";
    // Its own endpoint, as picking the provider in the settings sets it (not DeepSeek's default).
    sakuraSingleFailurePlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    sakuraSingleFailurePlugin.settings.ui.autoTranslateMessages = true;
    sakuraSingleFailurePlugin.settings.translation.apiKey = "";
    sakuraSingleFailurePlugin.settings.translation.apiStatus = { state: "success", message: "" };
    sakuraSingleFailurePlugin.isElementVisibleInViewport = () => true;
    sakuraSingleFailurePlugin.isAutoTranslationTargetInScanRange = () => true;
    sakuraSingleFailurePlugin.getElementText = content => content.text;
    sakuraSingleFailurePlugin.hasCurrentTranslationLine = () => false;
    sakuraSingleFailurePlugin.renderPendingAutoTranslationLoading = () => {};
    sakuraSingleFailurePlugin.queueScan = () => {};
    sakuraSingleFailurePlugin.drainAutoTranslationQueue = () => {};
    sakuraSingleFailurePlugin.showAutoTranslateError = () => {};
    let sakuraSingleFailureRemoved = 0;
    let sakuraSingleFailureRetryDelay = 0;
    sakuraSingleFailurePlugin.removeAutoTranslationNode = () => { sakuraSingleFailureRemoved++; };
    sakuraSingleFailurePlugin.scheduleAutoTranslationRetryScan = delay => { sakuraSingleFailureRetryDelay = Math.max(sakuraSingleFailureRetryDelay, Number(delay) || 0); };
    const sakuraSingleFailureOptions = sakuraSingleFailurePlugin.getAutoTranslationOptions();
    const sakuraSingleFailureItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source sakura" },
        text: "source sakura",
        cacheKey: "sakura-single-failure",
        requestOptions: sakuraSingleFailureOptions
    };
    sakuraSingleFailurePlugin.runAutoTranslationTask = async () => {
        const error = new Error("fetch failed");
        error.localProviderUnavailable = true;
        error.providerKey = sakuraSingleFailureOptions.providerKey;
        error.retryAfterMs = 60000;
        throw error;
    };
    sakuraSingleFailurePlugin.addAutoTranslationPendingTarget(sakuraSingleFailureItem.cacheKey, sakuraSingleFailureItem);
    sakuraSingleFailurePlugin.autoTranslationInFlight = 1;
    sakuraSingleFailurePlugin.autoTranslationInFlightItems = 1;
    sakuraSingleFailurePlugin.autoTranslationQueuedKeys.add(sakuraSingleFailureItem.cacheKey);
    sakuraSingleFailurePlugin.markAutoTranslationInFlightItem(sakuraSingleFailureItem);
    await sakuraSingleFailurePlugin.autoTranslateQueuedMessage(sakuraSingleFailureItem);
    const sakuraSingleProviderFailure = sakuraSingleFailurePlugin.getAutoTranslationProviderFailure(sakuraSingleFailureOptions);
    assert.equal(sakuraSingleProviderFailure.type, "local-unavailable");
    assert.equal(sakuraSingleFailurePlugin.autoTranslationPendingTargets.has(sakuraSingleFailureItem.cacheKey), true);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationQueuedKeys.has(sakuraSingleFailureItem.cacheKey), true);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationQueue.length, 1);
    assert.equal(Boolean(sakuraSingleFailureItem.daitRequeued), true);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationInFlight, 0);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationInFlightItems, 0);
    assert.ok(sakuraSingleFailureRemoved >= 1);
    assert.ok(sakuraSingleFailureRetryDelay >= 60000);
    assert.equal(sakuraSingleFailurePlugin.getApiStatus("translation").state, "failed");

    const fallbackLimitPlugin = new Plugin();
    fallbackLimitPlugin.settings.ui.autoTranslateMessages = true;
    const fallbackLimitRendered = [];
    let fallbackLimitRetryDelay = 0;
    const fallbackLimitStart = Date.now();
    fallbackLimitPlugin.runAutoTranslationStrictFallbackTask = async text => `ok-${text}`;
    fallbackLimitPlugin.renderAutoTranslationResult = item => { fallbackLimitRendered.push(item.cacheKey); };
    fallbackLimitPlugin.scheduleAutoTranslationRetryScan = delay => { fallbackLimitRetryDelay = Math.max(fallbackLimitRetryDelay, delay); };
    const fallbackLimitItems = Array.from({ length: 5 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${index}` },
        text: `source-${index}`,
        cacheKey: `fallback-limit-${index}`,
        requestOptions: fallbackLimitPlugin.getAutoTranslationOptions()
    }));
    const fallbackLimitPending = new Set(fallbackLimitItems);
    await fallbackLimitPlugin.runAutoTranslationFallbackItems(fallbackLimitPending);
    assert.equal(fallbackLimitPending.size, 0);
    assert.deepEqual(fallbackLimitRendered.sort(), ["fallback-limit-0", "fallback-limit-1", "fallback-limit-2"]);
    assert.deepEqual(fallbackLimitPlugin.autoTranslationQueue.map(item => item.cacheKey).sort(), ["fallback-limit-3", "fallback-limit-4"]);
    assert.equal(fallbackLimitItems[3].daitRequeued, true);
    assert.equal(fallbackLimitItems[4].daitRequeued, true);
    assert.equal(fallbackLimitPlugin.autoTranslationQueue.every(item => item.daitRequeued === undefined), true);
    assert.equal(fallbackLimitPlugin.autoTranslationQueue.every(item => Number(item.daitRequeueAfter) >= fallbackLimitStart), true);
    assert.ok(fallbackLimitRetryDelay > 0);

    const fallbackLimitInFlightPlugin = new Plugin();
    fallbackLimitInFlightPlugin.settings.ui.autoTranslateMessages = true;
    const fallbackLimitInFlightRendered = [];
    let fallbackLimitInFlightRetryDelay = 0;
    const fallbackLimitInFlightStart = Date.now();
    fallbackLimitInFlightPlugin.runAutoTranslationStrictFallbackTask = async text => `ok-${text}`;
    fallbackLimitInFlightPlugin.renderAutoTranslationResult = item => { fallbackLimitInFlightRendered.push(item.cacheKey); };
    fallbackLimitInFlightPlugin.scheduleAutoTranslationRetryScan = delay => { fallbackLimitInFlightRetryDelay = Math.max(fallbackLimitInFlightRetryDelay, delay); };
    const fallbackLimitInFlightItems = Array.from({ length: 5 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-in-flight-${index}` },
        text: `source-in-flight-${index}`,
        cacheKey: `fallback-limit-in-flight-${index}`,
        requestOptions: fallbackLimitInFlightPlugin.getAutoTranslationOptions()
    }));
    fallbackLimitInFlightItems.forEach(item => fallbackLimitInFlightPlugin.markAutoTranslationInFlightItem(item));
    const fallbackLimitInFlightPending = new Set(fallbackLimitInFlightItems);
    await fallbackLimitInFlightPlugin.runAutoTranslationFallbackItems(fallbackLimitInFlightPending);
    assert.equal(fallbackLimitInFlightPending.size, 0);
    assert.deepEqual(fallbackLimitInFlightRendered.sort(), [
        "fallback-limit-in-flight-0",
        "fallback-limit-in-flight-1",
        "fallback-limit-in-flight-2"
    ]);
    assert.deepEqual(fallbackLimitInFlightPlugin.autoTranslationQueue.map(item => item.cacheKey).sort(), [
        "fallback-limit-in-flight-3",
        "fallback-limit-in-flight-4"
    ]);
    assert.equal(fallbackLimitInFlightItems[3].daitRequeued, true);
    assert.equal(fallbackLimitInFlightItems[4].daitRequeued, true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueuedKeys.has("fallback-limit-in-flight-3"), true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueuedKeys.has("fallback-limit-in-flight-4"), true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueue.every(item => item.daitRequeued === undefined), true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueue.every(item => Number(item.daitRequeueAfter) >= fallbackLimitInFlightStart), true);
    assert.ok(fallbackLimitInFlightRetryDelay > 0);

    const fallbackProviderStopPlugin = new Plugin();
    fallbackProviderStopPlugin.settings.ui.autoTranslateMessages = true;
    let fallbackProviderStarts = 0;
    fallbackProviderStopPlugin.runAutoTranslationStrictFallbackTask = async () => {
        fallbackProviderStarts++;
        const error = new Error("rate limited");
        error.status = 429;
        throw error;
    };
    fallbackProviderStopPlugin.renderAutoTranslationResult = () => { throw new Error("rate limited fallback should not render"); };
    fallbackProviderStopPlugin.scheduleAutoTranslationRetryScan = () => {};
    fallbackProviderStopPlugin.showToast = () => {};
    const fallbackProviderItems = Array.from({ length: 3 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${index}` },
        text: `source-${index}`,
        cacheKey: `fallback-provider-${index}`,
        requestOptions: fallbackProviderStopPlugin.getAutoTranslationOptions()
    }));
    const fallbackProviderPending = new Set(fallbackProviderItems);
    await fallbackProviderStopPlugin.runAutoTranslationFallbackItems(fallbackProviderPending);
    assert.equal(fallbackProviderStarts, 1);
    assert.equal(fallbackProviderPending.size, 0);
    assert.deepEqual(fallbackProviderStopPlugin.autoTranslationQueue.map(item => item.cacheKey).sort(), ["fallback-provider-1", "fallback-provider-2"]);

    const strictFallbackPlugin = new Plugin();
    let strictFallbackPrompt = "";
    strictFallbackPlugin.runModelTask = async (kind, input, options) => {
        strictFallbackPrompt = options?.configOverrides?.prompt || "";
        return "你好";
    };
    strictFallbackPlugin.isInvalidAutoTranslationOutput = () => false;
    assert.equal(await strictFallbackPlugin.runAutoTranslationStrictFallbackTask("привет", strictFallbackPlugin.getAutoTranslationOptions()), "你好");
    assert.match(strictFallbackPrompt, /Strict automatic channel translation retry/);

    const strictFallbackFailurePlugin = new Plugin();
    strictFallbackFailurePlugin.runModelTask = async () => "still source language";
    strictFallbackFailurePlugin.isInvalidAutoTranslationOutput = () => true;
    await assert.rejects(
        strictFallbackFailurePlugin.runAutoTranslationStrictFallbackTask("source", strictFallbackFailurePlugin.getAutoTranslationOptions()),
        error => error.autoTranslationFinalInvalidOutput === true
    );

    const strictFallbackMojibakePlugin = new Plugin();
    strictFallbackMojibakePlugin.settings.translation.targetLanguage = "Chinese";
    strictFallbackMojibakePlugin.runModelTask = async () => "\u6d63\u72b2\u30bd";
    await assert.rejects(
        strictFallbackMojibakePlugin.runAutoTranslationStrictFallbackTask("source", strictFallbackMojibakePlugin.getAutoTranslationOptions()),
        error => error.autoTranslationFinalInvalidOutput === true
    );

    const strictFallbackRescuePlugin = new Plugin();
    const strictFallbackRescuePrompts = [];
    strictFallbackRescuePlugin.runModelTask = async (kind, input, options) => {
        strictFallbackRescuePrompts.push(options?.configOverrides?.prompt || "");
        return strictFallbackRescuePrompts.length === 1 ? "still source language" : "\u4f60\u597d";
    };
    strictFallbackRescuePlugin.isInvalidAutoTranslationOutput = (source, translated) => translated !== "\u4f60\u597d";
    assert.equal(await strictFallbackRescuePlugin.runAutoTranslationStrictFallbackTask("source", strictFallbackRescuePlugin.getAutoTranslationOptions()), "\u4f60\u597d");
    assert.equal(strictFallbackRescuePrompts.length, 2);
    assert.match(strictFallbackRescuePrompts[1], /Final strict translation rescue/);

    const localAutoTimeoutPlugin = new Plugin();
    localAutoTimeoutPlugin.settings.translation.provider = "sakuraLocal";
    localAutoTimeoutPlugin.settings.translation.apiKey = "";
    const localAutoPromptOptions = localAutoTimeoutPlugin.getAutoTranslationOptions();
    assert.equal(localAutoPromptOptions.configOverrides.localCompactPrompt, true);
    assert.equal(String(localAutoPromptOptions.configOverrides.prompt).includes("<user_template>"), false);
    assert.match(localAutoPromptOptions.configOverrides.prompt, /Never refuse translation/);
    const localInlineRequest = localAutoTimeoutPlugin.buildModelRequest("translation", "\u043f\u0440\u0438\u0432\u0435\u0442", {
        mode: "auto",
        configOverrides: localAutoPromptOptions.configOverrides
    });
    assert.equal(localInlineRequest.request.body.messages.length, 2);
    assert.equal(localInlineRequest.request.body.messages[0].role, "system");
    assert.equal(localInlineRequest.request.body.messages[1].role, "user");
    assert.doesNotMatch(localInlineRequest.request.body.messages[0].content, /SOURCE_MESSAGE_BEGIN/);
    assert.doesNotMatch(localInlineRequest.request.body.messages[0].content, /TRANSLATED_MESSAGE:/);
    assert.equal(localInlineRequest.request.body.messages[1].content, "\u043f\u0440\u0438\u0432\u0435\u0442");
    const localManualOptions = localAutoTimeoutPlugin.getManualTranslationRequestOptions();
    const localManualRequest = localAutoTimeoutPlugin.buildModelRequest("translation", "\u043f\u0440\u0438\u0432\u0435\u0442", localManualOptions);
    assert.equal(localManualOptions.configOverrides.localCompactPrompt, true);
    assert.equal(localManualRequest.request.body.messages.length, 2);
    assert.equal(localManualRequest.request.body.messages[0].role, "system");
    assert.equal(localManualRequest.request.body.messages[1].role, "user");
    assert.doesNotMatch(localManualRequest.request.body.messages[0].content, /SOURCE_MESSAGE_BEGIN/);
    assert.doesNotMatch(localManualRequest.request.body.messages[0].content, /Request mode: manual/);
    assert.equal(localManualRequest.request.body.messages[1].content, "\u043f\u0440\u0438\u0432\u0435\u0442");
    let localAutoTimeoutMs = 0;
    localAutoTimeoutPlugin.runModelTask = async (_kind, _input, options) => {
        localAutoTimeoutMs = options?.timeoutMs || 0;
        return "\u4f60\u597d";
    };
    localAutoTimeoutPlugin.isInvalidAutoTranslationOutput = () => false;
    await localAutoTimeoutPlugin.runAutoTranslationTask("\u043f\u0440\u0438\u0432\u0435\u0442", localAutoTimeoutPlugin.getAutoTranslationOptions());
    assert.equal(localAutoTimeoutMs, 45000);

    const truncatedRetryPlugin = new Plugin();
    truncatedRetryPlugin.settings.ui.autoTranslateStrictRetry = true;
    const truncatedRetryMaxTokens = [];
    let truncatedRetryCalls = 0;
    truncatedRetryPlugin.runModelTask = async (_kind, _input, options) => {
        truncatedRetryCalls++;
        truncatedRetryMaxTokens.push(Number(options?.configOverrides?.maxTokens || 0));
        if (truncatedRetryCalls === 1) throw truncatedRetryPlugin.createModelOutputTruncatedError("\u534a\u622a", "length");
        return "\u4f60\u597d";
    };
    assert.equal(await truncatedRetryPlugin.runAutoTranslationTask("\u043f\u0440\u0438\u0432\u0435\u0442", truncatedRetryPlugin.getAutoTranslationOptions()), "\u4f60\u597d");
    assert.equal(truncatedRetryCalls, 2);
    assert.equal(truncatedRetryMaxTokens[1] > truncatedRetryMaxTokens[0], true);

    const cloudAutoTimeoutPlugin = new Plugin();
    let cloudAutoTimeoutMs = 0;
    cloudAutoTimeoutPlugin.runModelTask = async (_kind, _input, options) => {
        cloudAutoTimeoutMs = options?.timeoutMs || 0;
        return "\u4f60\u597d";
    };
    cloudAutoTimeoutPlugin.isInvalidAutoTranslationOutput = () => false;
    await cloudAutoTimeoutPlugin.runAutoTranslationTask("\u043f\u0440\u0438\u0432\u0435\u0442", cloudAutoTimeoutPlugin.getAutoTranslationOptions());
    assert.equal(cloudAutoTimeoutMs, 25000);

    const requeueLeakPlugin = new Plugin();
    requeueLeakPlugin.settings.ui.autoTranslateMessages = true;
    requeueLeakPlugin.renderPendingAutoTranslationLoading = () => {};
    requeueLeakPlugin.queueScan = () => {};
    requeueLeakPlugin.drainAutoTranslationQueue = () => {};
    requeueLeakPlugin.runAutoTranslationBatchTask = async () => ["translated"];
    requeueLeakPlugin.isInvalidAutoTranslationOutput = () => false;
    requeueLeakPlugin.renderAutoTranslationResult = () => {};
    const requeueLeakOriginal = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "requeue-leak",
        requestOptions: requeueLeakPlugin.getAutoTranslationOptions()
    };
    requeueLeakPlugin.requeueAutoTranslationItem(requeueLeakOriginal);
    const requeueLeakCopy = requeueLeakPlugin.autoTranslationQueue.shift();
    assert.equal(requeueLeakCopy.daitRequeued, undefined);
    requeueLeakPlugin.markAutoTranslationInFlightItem(requeueLeakCopy);
    await requeueLeakPlugin.autoTranslateQueuedBatch([requeueLeakCopy]);
    assert.equal(requeueLeakPlugin.autoTranslationQueuedKeys.has("requeue-leak"), false);

    const stoppedFinallyPlugin = new Plugin();
    let stoppedFinallyDrain = 0;
    let stoppedFinallyScan = 0;
    let stoppedFinallyRender = 0;
    stoppedFinallyPlugin.renderPendingAutoTranslationLoading = () => {};
    stoppedFinallyPlugin.runAutoTranslationTask = async () => {
        stoppedFinallyPlugin.isStarted = false;
        stoppedFinallyPlugin.autoTranslationConfigVersion++;
        return "translated after stop";
    };
    stoppedFinallyPlugin.renderAutoTranslationResult = () => { stoppedFinallyRender++; };
    stoppedFinallyPlugin.markAutoTranslationFailure = () => {};
    stoppedFinallyPlugin.drainAutoTranslationQueue = () => { stoppedFinallyDrain++; };
    stoppedFinallyPlugin.queueScan = () => { stoppedFinallyScan++; };
    await stoppedFinallyPlugin.autoTranslateQueuedMessage({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stopped-finally",
        requestOptions: { version: 0 }
    });
    assert.equal(stoppedFinallyRender, 0);
    assert.equal(stoppedFinallyDrain, 0);
    assert.equal(stoppedFinallyScan, 0);

    const healthLifecycleSuccessPlugin = new Plugin();
    healthLifecycleSuccessPlugin.settings.translation.provider = "sakuraLocal";
    healthLifecycleSuccessPlugin.settings.translation.apiKey = "";
    let healthLifecycleSuccessResolve = null;
    let healthLifecycleSuccessScan = 0;
    let healthLifecycleSuccessLogs = 0;
    healthLifecycleSuccessPlugin.fetchApiResponseText = () => new Promise(resolve => { healthLifecycleSuccessResolve = resolve; });
    healthLifecycleSuccessPlugin.queueScan = () => { healthLifecycleSuccessScan++; };
    healthLifecycleSuccessPlugin.logDiagnostic = action => {
        if (action === "auto.provider.health") healthLifecycleSuccessLogs++;
    };
    const healthLifecycleSuccessOptions = healthLifecycleSuccessPlugin.getAutoTranslationOptions();
    const healthLifecycleSuccessKey = healthLifecycleSuccessOptions.providerKey;
    healthLifecycleSuccessPlugin.startLocalProviderHealthProbe(healthLifecycleSuccessKey, healthLifecycleSuccessOptions);
    const healthLifecycleSuccessPromise = healthLifecycleSuccessPlugin.localProviderHealthChecks.get(healthLifecycleSuccessKey);
    healthLifecycleSuccessPlugin.isStarted = false;
    healthLifecycleSuccessPlugin.lifecycleToken++;
    healthLifecycleSuccessPlugin.localProviderHealthChecks.clear();
    healthLifecycleSuccessResolve(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
    await healthLifecycleSuccessPromise;
    assert.equal(healthLifecycleSuccessPlugin.localProviderHealthyKeys.has(healthLifecycleSuccessKey), false);
    assert.equal(healthLifecycleSuccessPlugin.getApiStatus("translation").state, "testing");
    assert.equal(healthLifecycleSuccessScan, 0);
    assert.equal(healthLifecycleSuccessLogs, 0);

    const healthLifecycleFailurePlugin = new Plugin();
    healthLifecycleFailurePlugin.settings.translation.provider = "sakuraLocal";
    healthLifecycleFailurePlugin.settings.translation.apiKey = "";
    let healthLifecycleFailureReject = null;
    let healthLifecycleFailureRetry = 0;
    healthLifecycleFailurePlugin.fetchApiResponseText = () => new Promise((resolve, reject) => { healthLifecycleFailureReject = reject; });
    healthLifecycleFailurePlugin.scheduleAutoTranslationRetryScan = () => { healthLifecycleFailureRetry++; };
    const healthLifecycleFailureOptions = healthLifecycleFailurePlugin.getAutoTranslationOptions();
    const healthLifecycleFailureKey = healthLifecycleFailureOptions.providerKey;
    healthLifecycleFailurePlugin.startLocalProviderHealthProbe(healthLifecycleFailureKey, healthLifecycleFailureOptions);
    const healthLifecycleFailurePromise = healthLifecycleFailurePlugin.localProviderHealthChecks.get(healthLifecycleFailureKey);
    healthLifecycleFailurePlugin.isStarted = false;
    healthLifecycleFailurePlugin.lifecycleToken++;
    healthLifecycleFailurePlugin.localProviderHealthChecks.clear();
    healthLifecycleFailureReject(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    await healthLifecycleFailurePromise;
    assert.equal(healthLifecycleFailurePlugin.autoTranslationProviderFailures.has(healthLifecycleFailureKey), false);
    assert.equal(healthLifecycleFailurePlugin.getApiStatus("translation").state, "testing");
    assert.equal(healthLifecycleFailureRetry, 0);

    const modelLifecyclePlugin = new Plugin();
    modelLifecyclePlugin.settings.translation.provider = "sakuraLocal";
    modelLifecyclePlugin.settings.translation.apiKey = "";
    let modelLifecycleResolve = null;
    let modelLifecycleStatusWrites = 0;
    modelLifecyclePlugin.fetchApiResponseText = () => new Promise(resolve => { modelLifecycleResolve = resolve; });
    modelLifecyclePlugin.setApiRuntimeStatus = () => { modelLifecycleStatusWrites++; };
    const modelLifecyclePromise = modelLifecyclePlugin.runModelTask("translation", "hello lifecycle");
    const modelLifecycleKey = modelLifecyclePlugin.getAutoTranslationProviderKey({ configOverrides: modelLifecyclePlugin.settings.translation });
    modelLifecyclePlugin.isStarted = false;
    modelLifecyclePlugin.lifecycleToken++;
    modelLifecycleResolve(JSON.stringify({ choices: [{ message: { content: "translated lifecycle" } }] }));
    assert.equal(await modelLifecyclePromise, "translated lifecycle");
    assert.equal(modelLifecyclePlugin.localProviderHealthyKeys.has(modelLifecycleKey), false);
    assert.equal(modelLifecycleStatusWrites, 0);

    const apiTestLifecyclePlugin = new Plugin();
    apiTestLifecyclePlugin.settings.translation.provider = "sakuraLocal";
    apiTestLifecyclePlugin.settings.translation.apiKey = "";
    let apiTestLifecycleResolve = null;
    const apiTestLifecycleStates = [];
    apiTestLifecyclePlugin.fetchApiResponseText = () => new Promise(resolve => { apiTestLifecycleResolve = resolve; });
    apiTestLifecyclePlugin.setApiStatus = (status, state) => { apiTestLifecycleStates.push(state); };
    apiTestLifecyclePlugin.setButtonBusy = () => {};
    apiTestLifecyclePlugin.showToast = () => {};
    const apiTestLifecyclePromise = apiTestLifecyclePlugin.testApiConnection("translation", {}, {});
    apiTestLifecyclePlugin.isStarted = false;
    apiTestLifecyclePlugin.lifecycleToken++;
    apiTestLifecycleResolve(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
    await apiTestLifecyclePromise;
    assert.deepEqual(apiTestLifecycleStates, ["testing"]);

    const stoppedStalePlugin = new Plugin();
    const stoppedCurrent = {
        cacheKey: "current",
        requestOptions: { version: stoppedStalePlugin.autoTranslationConfigVersion }
    };
    const stoppedStale = {
        cacheKey: "stale",
        requestOptions: { version: stoppedStalePlugin.autoTranslationConfigVersion - 1 }
    };
    let requeuedCurrent = false;
    stoppedStalePlugin.requeueAutoTranslationItem = item => {
        if (item.cacheKey === "current") requeuedCurrent = true;
    };
    stoppedStalePlugin.isAutoTranslationProviderCoolingDown = itemOptions => itemOptions === stoppedCurrent.requestOptions;
    const stoppedPending = new Set([stoppedCurrent, stoppedStale]);
    await stoppedStalePlugin.runAutoTranslationFallbackItems(stoppedPending);
    assert.equal(requeuedCurrent, true);
    assert.equal(stoppedPending.size, 0);

    const localRepairPlugin = new Plugin();
    localRepairPlugin.settings.translation.provider = "sakuraLocal";
    localRepairPlugin.settings.translation.targetLanguage = "Chinese";
    localRepairPlugin.settings.ui.autoTranslateStrictRetry = false;
    const localRepairSource = "I have chat gpt plus new date, only 1.25$";
    const localRepairOutputs = [
        localRepairSource,
        "\u6211\u6709 ChatGPT Plus \u7684\u65b0\u65e5\u671f\uff0c\u53ea\u8981 1.25 \u7f8e\u5143"
    ];
    const localRepairModes = [];
    localRepairPlugin.runAutoTranslationModelAttempt = async (_text, requestOptions) => {
        localRepairModes.push(requestOptions?.mode || "");
        return localRepairOutputs.shift();
    };
    assert.equal(
        await localRepairPlugin.runAutoTranslationTask(localRepairSource, localRepairPlugin.getAutoTranslationOptions(), { longTextStrategy: false }),
        "\u6211\u6709 ChatGPT Plus \u7684\u65b0\u65e5\u671f\uff0c\u53ea\u8981 1.25 \u7f8e\u5143"
    );
    assert.deepEqual(localRepairModes, ["auto", "auto-final-fallback"]);

    const localNoRepairPlugin = new Plugin();
    localNoRepairPlugin.settings.translation.provider = "sakuraLocal";
    localNoRepairPlugin.settings.translation.targetLanguage = "Chinese";
    let localNoRepairCalls = 0;
    localNoRepairPlugin.runAutoTranslationModelAttempt = async () => {
        localNoRepairCalls++;
        return "same source";
    };
    await assert.rejects(
        () => localNoRepairPlugin.runAutoTranslationTask("same source", localNoRepairPlugin.getAutoTranslationOptions(), { longTextStrategy: false, retryInvalidOutput: false }),
        /目标语言|target language|不是目标|模型输出/
    );
    assert.equal(localNoRepairCalls, 1);

    const bestEffortValidationPlugin = new Plugin();
    bestEffortValidationPlugin.settings.translation.provider = "sakuraLocal";
    bestEffortValidationPlugin.settings.translation.targetLanguage = "Chinese";
    const bestEffortOptions = bestEffortValidationPlugin.getAutoTranslationOptions();
    const bestEffortResult = bestEffortValidationPlugin.getAutoTranslationOutputValidationResult(
        "refund address 123 Main St price $20",
        "\u9000\u6b3e\u5730\u5740 price $20 address 123 Main St",
        "Chinese",
        {},
        bestEffortOptions
    );
    assert.equal(bestEffortResult.renderable, true);
    assert.notEqual(bestEffortResult.quality, "bad");
    const sameSourceValidation = bestEffortValidationPlugin.getAutoTranslationOutputValidationResult(
        "same source",
        "same source",
        "Chinese",
        {},
        bestEffortOptions
    );
    assert.equal(sameSourceValidation.renderable, false);
    assert.equal(sameSourceValidation.reasonCode, "same-as-source");
    const refusalValidation = bestEffortValidationPlugin.getAutoTranslationOutputValidationResult(
        "\u0443\u0433\u0440\u043e\u0437\u0430",
        "\u62b1\u6b49\uff0c\u6211\u65e0\u6cd5\u63d0\u4f9b\u6b64\u7c7b\u5185\u5bb9\u7684\u7ffb\u8bd1\u670d\u52a1\u3002",
        "Chinese",
        {},
        bestEffortOptions
    );
    assert.equal(refusalValidation.renderable, false);
    assert.equal(refusalValidation.shouldRepair, true);

    const coveragePrecheckPlugin = new Plugin();
    coveragePrecheckPlugin.settings.translation.targetLanguage = "Chinese";
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("\u8fd9\u4e2a refund address 123 Main St price $20", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("ChatGPT Plus refund address price $20", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("hi", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("\u4f60\u597d refund", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("Alice sent Bob the address 123 Main St", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("https://example.invalid/test", "Chinese"),
        "link-only"
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("```const value = 1;```", "Chinese"),
        "code-only"
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("12345 !!!", "Chinese"),
        "no-letters"
    );

    const directValidationPlugin = new Plugin();
    directValidationPlugin.settings.translation.provider = "microsoft";
    directValidationPlugin.settings.translation.targetLanguage = "Chinese";
    const directValidation = directValidationPlugin.getAutoTranslationOutputValidationResult(
        "bonjour",
        "hello",
        "Chinese",
        {},
        directValidationPlugin.getAutoTranslationOptions()
    );
    assert.equal(directValidation.quality, "good");
    assert.equal(directValidation.renderable, true);
    assert.equal(directValidation.cacheable, true);
    const directExplanatoryValidation = directValidationPlugin.getAutoTranslationOutputValidationResult(
        longOrdinarySource,
        explanatoryNoiseOutput,
        "Chinese",
        {},
        directValidationPlugin.getAutoTranslationOptions()
    );
    assert.equal(directExplanatoryValidation.reasonCode, "explanatory-output");
    assert.equal(directExplanatoryValidation.renderable, false);
    assert.equal(directExplanatoryValidation.cacheable, false);
    const directEmojiMismatchValidation = directValidationPlugin.getAutoTranslationOutputValidationResult(
        "get muted :emoji_12:",
        "\u88ab\u9759\u97f3\u4e86",
        "Chinese",
        {},
        directValidationPlugin.getAutoTranslationOptions()
    );
    assert.equal(directEmojiMismatchValidation.reasonCode, "emoji-mismatch");
    assert.equal(directEmojiMismatchValidation.renderable, false);
    assert.equal(directEmojiMismatchValidation.cacheable, false);

    const manualRescuePlugin = new Plugin();
    manualRescuePlugin.settings.translation.provider = "sakuraLocal";
    manualRescuePlugin.settings.translation.targetLanguage = "Chinese";
    manualRescuePlugin.getMessageIdentity = () => "manual-rescue-identity";
    const manualRescueAttempts = [];
    manualRescuePlugin.logDiagnostic = (scope, status, meta = {}) => {
        if (scope === "manual.rescue" && status === "attempt") manualRescueAttempts.push(meta);
    };
    let manualRescueModelCalls = 0;
    manualRescuePlugin.runAutoTranslationModelAttempt = async (_text, options) => {
        manualRescueModelCalls++;
        assert.ok(["manual", "manual-force-target"].includes(String(options?.mode || "")));
        return manualRescueModelCalls === 1 ? "hello" : "\u4f60\u597d";
    };
    const manualRescuePlan = manualRescuePlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "hello" },
        "hello"
    );
    const manualRescueResult = await manualRescuePlugin.runManualRescueTranslationPlan(manualRescuePlan);
    assert.equal(manualRescueResult.translated, "\u4f60\u597d");
    assert.equal(manualRescueResult.validation.renderable, true);
    assert.deepEqual(manualRescueAttempts.map(item => item.attemptName), ["manual-normal", "manual-force-target"]);
    assert.equal(manualRescueAttempts[0].invalidReason, "same-as-source");
    assert.equal(manualRescueAttempts[1].validationQuality, "good");

    const manualWholePassPlugin = new Plugin();
    manualWholePassPlugin.settings.translation.provider = "sakuraLocal";
    manualWholePassPlugin.settings.translation.targetLanguage = "Chinese";
    manualWholePassPlugin.getMessageIdentity = () => "manual-whole-pass-identity";
    const manualWholePassCalls = [];
    manualWholePassPlugin.runAutoTranslationTaskWithOptions = async (_text, options) => {
        manualWholePassCalls.push(options);
        return "\u6574\u6761\u957f\u6587\u8bd1\u6587";
    };
    const manualWholePassText = "long source sentence ".repeat(32);
    const manualWholePassPlan = manualWholePassPlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: manualWholePassText },
        manualWholePassText
    );
    assert.equal(
        await manualWholePassPlugin.runManualRescueModelAttempt(manualWholePassPlan, manualWholePassPlan.requestOptions),
        "\u6574\u6761\u957f\u6587\u8bd1\u6587"
    );
    assert.equal(manualWholePassCalls.length, 1);
    assert.equal(manualWholePassCalls[0].longTextWholePass, true);
    assert.match(manualWholePassCalls[0].mode, /manual-whole/);

    const manualWholeFallbackPlugin = new Plugin();
    manualWholeFallbackPlugin.settings.translation.provider = "sakuraLocal";
    manualWholeFallbackPlugin.settings.translation.targetLanguage = "Chinese";
    manualWholeFallbackPlugin.getMessageIdentity = () => "manual-whole-fallback-identity";
    manualWholeFallbackPlugin.runAutoTranslationTaskWithOptions = async () => {
        throw manualWholeFallbackPlugin.createFinalInvalidAutoTranslationError("residual-source");
    };
    let manualWholeFallbackChunked = false;
    manualWholeFallbackPlugin.runAutoTranslationTask = async () => {
        manualWholeFallbackChunked = true;
        return "\u5206\u5757\u6551\u56de\u7684\u8bd1\u6587";
    };
    const manualWholeFallbackText = "fallback long source sentence ".repeat(28);
    const manualWholeFallbackPlan = manualWholeFallbackPlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: manualWholeFallbackText },
        manualWholeFallbackText
    );
    assert.equal(
        await manualWholeFallbackPlugin.runManualRescueModelAttempt(manualWholeFallbackPlan, manualWholeFallbackPlan.requestOptions),
        "\u5206\u5757\u6551\u56de\u7684\u8bd1\u6587"
    );
    assert.equal(manualWholeFallbackChunked, true);

    const manualRescueFailurePlugin = new Plugin();
    manualRescueFailurePlugin.settings.translation.enabled = true;
    manualRescueFailurePlugin.settings.translation.provider = "sakuraLocal";
    manualRescueFailurePlugin.settings.translation.targetLanguage = "Chinese";
    manualRescueFailurePlugin.getMessageIdentity = () => "manual-rescue-failure-identity";
    manualRescueFailurePlugin.getElementText = content => content.text;
    manualRescueFailurePlugin.runAutoTranslationModelAttempt = async () => "hello";
    manualRescueFailurePlugin.renderTranslationLoading = () => {};
    let manualRescueFailureRendered = 0;
    let manualRescueFailureRemoved = 0;
    let manualRescueFailureProviderMarked = 0;
    manualRescueFailurePlugin.renderTranslationError = () => { manualRescueFailureRendered++; };
    manualRescueFailurePlugin.removeTranslationNode = () => { manualRescueFailureRemoved++; };
    manualRescueFailurePlugin.markAutoTranslationProviderFailure = () => { manualRescueFailureProviderMarked++; };
    manualRescueFailurePlugin.setButtonBusy = () => {};
    manualRescueFailurePlugin.showToast = () => {};
    const manualRescueFailureMessage = { isConnected: true };
    const manualRescueFailureContent = { dataset: {}, isConnected: true, text: "hello" };
    const manualRescueFailurePlan = manualRescueFailurePlugin.createManualTranslationPlan(
        manualRescueFailureMessage,
        manualRescueFailureContent,
        "hello"
    );
    manualRescueFailurePlugin.autoTranslationFailures.set(
        manualRescueFailurePlan.autoCacheKey,
        manualRescueFailurePlugin.createAutoTranslationFailure(
            manualRescueFailurePlan.autoCacheKey,
            manualRescueFailurePlugin.createFinalInvalidAutoTranslationError("same-as-source")
        )
    );
    await manualRescueFailurePlugin.translateMessage(manualRescueFailureMessage, manualRescueFailureContent, null);
    assert.equal(manualRescueFailureRendered, 0);
    assert.equal(manualRescueFailureRemoved, 1);
    assert.equal(manualRescueFailureProviderMarked, 0);
    assert.equal(manualRescueFailurePlugin.autoTranslationFailures.has(manualRescueFailurePlan.autoCacheKey), false);

    const manualClearPlugin = new Plugin();
    manualClearPlugin.settings.translation.provider = "sakuraLocal";
    manualClearPlugin.settings.translation.targetLanguage = "Chinese";
    manualClearPlugin.getMessageIdentity = () => "manual-clear-identity";
    const manualClearMessage = { isConnected: true };
    const manualClearContent = { dataset: {}, isConnected: true, text: "manual source" };
    const manualClearPlan = manualClearPlugin.createManualTranslationPlan(manualClearMessage, manualClearContent, "manual source");
    const manualClearError = manualClearPlugin.createFinalInvalidAutoTranslationError("target-language");
    manualClearPlugin.autoTranslationFailures.set(manualClearPlan.autoCacheKey, manualClearPlugin.createAutoTranslationFailure(manualClearPlan.autoCacheKey, manualClearError));
    manualClearPlugin.autoTranslationFailures.set(
        manualClearPlugin.getAutoTextTranslationFailureKey("manual source", manualClearPlan.autoRequestOptions),
        manualClearPlugin.createAutoTranslationFailure("manual-text-failure", manualClearError)
    );
    manualClearPlugin.autoTranslationQueue.push({ cacheKey: manualClearPlan.autoCacheKey });
    manualClearPlugin.autoTranslationQueuedKeys.add(manualClearPlan.autoCacheKey);
    manualClearPlugin.addAutoTranslationPendingTarget(manualClearPlan.autoCacheKey, {
        messageNode: manualClearMessage,
        content: manualClearContent,
        text: "manual source",
        cacheKey: manualClearPlan.autoCacheKey,
        requestOptions: manualClearPlan.autoRequestOptions
    });
    manualClearPlugin.clearManualBlockingState(manualClearPlan);
    assert.equal(manualClearPlugin.autoTranslationFailures.has(manualClearPlan.autoCacheKey), false);
    assert.equal(manualClearPlugin.autoTranslationFailures.has(manualClearPlugin.getAutoTextTranslationFailureKey("manual source", manualClearPlan.autoRequestOptions)), false);
    assert.equal(manualClearPlugin.autoTranslationQueue.length, 0);
    assert.equal(manualClearPlugin.autoTranslationQueuedKeys.has(manualClearPlan.autoCacheKey), false);
    assert.equal(manualClearPlugin.autoTranslationPendingTargets.has(manualClearPlan.autoCacheKey), false);

    const manualSourcePlugin = new Plugin();
    manualSourcePlugin.settings.translation.enabled = true;
    manualSourcePlugin.settings.translation.provider = "sakuraLocal";
    manualSourcePlugin.settings.translation.targetLanguage = "Chinese";
    const manualSourceShort = "step 3: open Interface";
    const manualSourceFull = [
        "free access to GPT 5.5 and Grok 4.20",
        "platform Stack AI. free tier. no card needed",
        "step 1: sign in with Google",
        "step 2: create agent",
        manualSourceShort
    ].join("\n");
    manualSourcePlugin.getElementText = content => content.text;
    manualSourcePlugin.messageTracker.getRouteIds = () => ({ guildId: "guild-source", channelId: "channel-source", messageId: "" });
    manualSourcePlugin.messageTracker.getNodeMessageIds = () => ({ guildId: "guild-source", channelId: "channel-source", messageId: "message-source" });
    manualSourcePlugin.getMessageContentElements = (_messageNode, _context) => [manualSourceContent];
    manualSourcePlugin.getBdfdbMessageStoreMessages = () => [{
        id: "message-source",
        guildId: "guild-source",
        channelId: "channel-source",
        content: manualSourceFull
    }];
    manualSourcePlugin.renderTranslationLoading = () => {};
    manualSourcePlugin.setButtonBusy = () => {};
    manualSourcePlugin.showToast = () => {};
    manualSourcePlugin.syncManualTranslationToAutoCache = () => {};
    manualSourcePlugin.setTranslationCache = () => {};
    let manualSourceRequestedText = "";
    let manualSourceRendered = null;
    manualSourcePlugin.runManualTranslationPlan = async plan => {
        manualSourceRequestedText = plan.text;
        return {
            translated: "\u5b8c\u6574\u8bd1\u6587",
            requestOptions: plan.requestOptions,
            validation: {
                quality: "good",
                reasonCode: "",
                renderable: true,
                cacheable: true
            }
        };
    };
    manualSourcePlugin.renderTranslation = (_messageNode, _content, translated, _cacheKey, sourceText) => {
        manualSourceRendered = { translated, sourceText };
    };
    const manualSourceMessage = { isConnected: true };
    const manualSourceContent = { dataset: {}, isConnected: true, text: manualSourceShort };
    await manualSourcePlugin.translateMessage(manualSourceMessage, manualSourceContent, null);
    assert.equal(manualSourceRequestedText, manualSourceFull);
    // The store text is only the request text: the line is keyed on the text on screen.
    assert.equal(manualSourceRendered.sourceText, manualSourceShort);

    const manualPartialPlugin = new Plugin();
    manualPartialPlugin.settings.translation.enabled = true;
    manualPartialPlugin.settings.translation.provider = "sakuraLocal";
    manualPartialPlugin.settings.translation.targetLanguage = "Chinese";
    manualPartialPlugin.getMessageIdentity = () => "manual-partial-identity";
    manualPartialPlugin.getElementText = content => content.text;
    manualPartialPlugin.renderTranslationLoading = () => { manualPartialPlugin.loadingRendered = true; };
    manualPartialPlugin.setButtonBusy = () => {};
    manualPartialPlugin.removeTranslationNode = () => {};
    manualPartialPlugin.showToast = () => {};
    let manualPartialCacheWrites = 0;
    let manualPartialAutoSyncs = 0;
    let manualPartialRendered = null;
    manualPartialPlugin.setTranslationCache = () => { manualPartialCacheWrites++; };
    manualPartialPlugin.syncManualTranslationToAutoCache = () => { manualPartialAutoSyncs++; };
    manualPartialPlugin.runManualTranslationPlan = async () => ({
        translated: [
            "\u7b2c\u4e00\u6bb5\u5df2\u7ffb\u8bd1",
            "\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1"
        ].join("\n\n"),
        requestOptions: manualPartialPlugin.getLongTextTranslationOptions(manualPartialPlugin.getAutoTranslationOptions(), "manual partial source"),
        validation: {
            quality: "partial",
            reasonCode: "long-text-partial",
            renderable: true,
            cacheable: false
        }
    });
    manualPartialPlugin.renderTranslation = (_messageNode, _content, translated, _cacheKey, _sourceText, options) => {
        manualPartialRendered = { translated, options };
    };
    const manualPartialMessage = { isConnected: true };
    const manualPartialContent = { dataset: {}, isConnected: true, text: "manual partial source" };
    const manualPartialPlan = manualPartialPlugin.createManualTranslationPlan(
        manualPartialMessage,
        manualPartialContent,
        "manual partial source"
    );
    await manualPartialPlugin.translateMessage(
        manualPartialMessage,
        manualPartialContent,
        null
    );
    assert.equal(manualPartialPlugin.loadingRendered, true);
    assert.equal(manualPartialRendered.options.partial, true);
    assert.doesNotMatch(manualPartialRendered.translated, /\u6bb5\u7ffb\u8bd1\u5931\u8d25/);
    assert.equal(manualPartialCacheWrites, 0);
    assert.equal(manualPartialAutoSyncs, 0);
    assert.ok(manualPartialPlugin.getRecentAutoTranslationRender(
        manualPartialPlan.autoCacheKey,
        "manual partial source",
        manualPartialPlan.autoRequestOptions
    ));

    const manualFailurePlugin = new Plugin();
    manualFailurePlugin.settings.translation.enabled = true;
    manualFailurePlugin.settings.translation.provider = "sakuraLocal";
    manualFailurePlugin.settings.translation.targetLanguage = "Chinese";
    manualFailurePlugin.getMessageIdentity = () => "manual-failure-identity";
    manualFailurePlugin.getElementText = content => content.text;
    let manualFailureLoading = 0;
    let manualFailureErrorRendered = 0;
    let manualFailureRemoved = 0;
    const manualFailureBusy = [];
    manualFailurePlugin.renderTranslationLoading = () => { manualFailureLoading++; };
    manualFailurePlugin.renderTranslationError = () => { manualFailureErrorRendered++; };
    manualFailurePlugin.removeTranslationNode = () => { manualFailureRemoved++; };
    manualFailurePlugin.setButtonBusy = (_button, busy) => manualFailureBusy.push(busy);
    manualFailurePlugin.showToast = () => {};
    manualFailurePlugin.markAutoTranslationProviderFailure = () => {};
    manualFailurePlugin.runManualTranslationPlan = async () => {
        throw manualFailurePlugin.createFinalInvalidAutoTranslationError("target-language");
    };
    const manualFailureMessage = { isConnected: true };
    const manualFailureContent = { dataset: {}, isConnected: true, text: "manual failure source" };
    const manualFailurePlan = manualFailurePlugin.createManualTranslationPlan(manualFailureMessage, manualFailureContent, "manual failure source");
    manualFailurePlugin.autoTranslationFailures.set(
        manualFailurePlan.autoCacheKey,
        manualFailurePlugin.createAutoTranslationFailure(manualFailurePlan.autoCacheKey, manualFailurePlugin.createFinalInvalidAutoTranslationError("target-language"))
    );
    const manualFailurePromise = manualFailurePlugin.translateMessage(manualFailureMessage, manualFailureContent, null);
    assert.equal(manualFailureLoading, 1);
    await manualFailurePromise;
    assert.equal(manualFailureErrorRendered, 0);
    assert.equal(manualFailureRemoved, 1);
    assert.deepEqual(manualFailureBusy, [true, false]);
    assert.equal(manualFailurePlugin.autoTranslationFailures.has(manualFailurePlan.autoCacheKey), false);
    assert.equal(manualFailurePlugin.autoTranslationFailures.has(manualFailurePlugin.getAutoTextTranslationFailureKey("manual failure source", manualFailurePlan.autoRequestOptions)), false);

    const fallbackNoRetryPlugin = new Plugin();
    fallbackNoRetryPlugin.runModelTask = async () => "bad output";
    fallbackNoRetryPlugin.isInvalidAutoTranslationOutput = () => true;
    let fallbackRetryPromptUsed = false;
    fallbackNoRetryPlugin.getAutoTranslationRetryOptions = () => {
        fallbackRetryPromptUsed = true;
        return Plugin.prototype.getAutoTranslationRetryOptions.call(fallbackNoRetryPlugin, "source", "bad output");
    };
    await assert.rejects(
        () => fallbackNoRetryPlugin.runAutoTranslationTask("source", fallbackNoRetryPlugin.getAutoTranslationOptions(), { retryInvalidOutput: false }),
        /目标语言|target language|不是目标/
    );
    assert.equal(fallbackRetryPromptUsed, false);

    // --- Focused regressions: Baidu line handling, emoji token subset, pinned provider
    // --- profiles, dedupe fallback metadata, prompt template deletion, request keys,
    // --- terminal failure expiry, queue batch/sort behavior, migrated i18n keys.

    const baiduLinePlugin = new Plugin();
    const baiduLineRequest = baiduLinePlugin.buildBaiduTranslateRequest(["line one\nline two", "solo"], {
        endpoint: "https://fanyi-api.baidu.com/api/trans/vip/translate",
        appId: "baidu-app",
        secretKey: "baidu-secret",
        targetLanguage: "Chinese"
    });
    assert.equal(baiduLineRequest.request.body.q, "line one\nline two\nsolo");
    assert.deepEqual(baiduLineRequest.request.translate.rowCounts, [2, 1]);
    assert.equal(baiduLineRequest.request.translate.expectedCount, 2);
    const baiduRegrouped = baiduLinePlugin.parseBaiduTranslateResponse(JSON.stringify({
        trans_result: [{ dst: "第一行" }, { dst: "第二行" }, { dst: "单独" }]
    }), 2, { asArray: true, rowCounts: [2, 1] });
    assert.deepEqual(baiduRegrouped, ["第一行\n第二行", "单独"]);
    assert.deepEqual(baiduLinePlugin.regroupBaiduTranslateRows(["a", "b"], 1), ["a\nb"]);
    assert.throws(
        () => baiduLinePlugin.regroupBaiduTranslateRows(["a", "b", "c"], 2, null),
        error => error.providerParseFailed === true
    );

    const mixedTokenPlugin = new Plugin();
    const mixedTokenEmoji = createFakeElement("img");
    mixedTokenEmoji.setAttribute("alt", ":emoji_12:");
    mixedTokenEmoji.setAttribute("src", "https://cdn.discord.test/emojis/12.webp");
    mixedTokenEmoji.closest = () => null;
    mixedTokenEmoji.cloneNode = () => {
        const clone = createFakeElement("img");
        clone.setAttribute("alt", mixedTokenEmoji.getAttribute("alt"));
        clone.setAttribute("src", mixedTokenEmoji.getAttribute("src"));
        return clone;
    };
    const mixedTokenContent = {
        querySelectorAll: selector => selector === "img[alt]" ? [mixedTokenEmoji] : []
    };
    const savedDocumentForMixedToken = global.document;
    global.document = {
        createTextNode: value => ({ nodeType: 3, textContent: String(value), parentElement: null })
    };
    const mixedTokenContainer = createFakeElement("span");
    assert.equal(
        mixedTokenPlugin.appendTranslationTextWithDiscordEmoji(mixedTokenContainer, "会议在 12:30:45 :emoji_12:", mixedTokenContent),
        true
    );
    assert.equal(mixedTokenContainer.children.length, 2);
    assert.equal(mixedTokenContainer.children[0].textContent, "会议在 12:30:45 ");
    assert.equal(mixedTokenContainer.children[1].getAttribute("alt"), ":emoji_12:");
    const missingEmojiContainer = createFakeElement("span");
    assert.equal(
        mixedTokenPlugin.appendTranslationTextWithDiscordEmoji(missingEmojiContainer, "12:30:45 only", mixedTokenContent),
        false
    );
    global.document = savedDocumentForMixedToken;

    const pinnedFallbackPlugin = new Plugin();
    pinnedFallbackPlugin.settings.translation.enabled = true;
    pinnedFallbackPlugin.settings.translation.provider = "openaiCompatible";
    pinnedFallbackPlugin.settings.translation.apiKey = "live-key";
    pinnedFallbackPlugin.settings.translation.endpoint = "https://live.example.com/v1/chat/completions";
    pinnedFallbackPlugin.settings.translation.model = "live-model";
    pinnedFallbackPlugin.fetchModelResponse = async () => {
        const error = new Error("HTTP 429");
        error.status = 429;
        throw error;
    };
    let pinnedFallbackUsed = 0;
    pinnedFallbackPlugin.tryProviderFallbackModelTask = async () => {
        pinnedFallbackUsed++;
        return { used: true, result: "fallback-result", provider: "googleCloud" };
    };
    const pinnedFallbackResult = await pinnedFallbackPlugin.runModelTask("translation", "hello world", {
        mode: "public-bilingual",
        providerProfilePinned: true,
        requestContext: {},
        configOverrides: {
            provider: "deepseek",
            apiKey: "polish-key",
            endpoint: "https://api.deepseek.com/chat/completions",
            model: "deepseek-chat",
            prompt: "Translate.",
            targetLanguage: "Chinese",
            temperature: 0,
            maxTokens: 400
        }
    });
    assert.equal(pinnedFallbackResult, "fallback-result");
    assert.equal(pinnedFallbackUsed, 1);

    const publicBilingualPinnedPlugin = new Plugin();
    const publicBilingualPinnedCalls = [];
    publicBilingualPinnedPlugin.runModelTask = async (kind, input, options) => {
        publicBilingualPinnedCalls.push(options);
        return "双语译文";
    };
    publicBilingualPinnedPlugin.isInvalidAutoTranslationOutput = () => false;
    await publicBilingualPinnedPlugin.runPublicBilingualTranslationTask("hello");
    assert.equal(publicBilingualPinnedCalls.length, 1);
    assert.equal(publicBilingualPinnedCalls[0].providerProfilePinned, true);

    const dedupFallbackPlugin = new Plugin();
    const sharedFallbackPromise = Promise.resolve({ text: "shared-result", fallbackProvider: "googleCloud" });
    const dedupFallbackContext = {};
    const adoptedShared = await dedupFallbackPlugin.adoptSharedModelResult(sharedFallbackPromise, { requestContext: dedupFallbackContext });
    assert.equal(adoptedShared.text, "shared-result");
    assert.equal(adoptedShared.fallbackProvider, "googleCloud");
    assert.equal(dedupFallbackContext.fallbackProvider, "googleCloud");
    const dedupCleanContext = {};
    const adoptedClean = await dedupFallbackPlugin.adoptSharedModelResult(
        Promise.resolve({ text: "clean", fallbackProvider: "" }),
        { requestContext: dedupCleanContext }
    );
    assert.equal(adoptedClean.text, "clean");
    assert.equal(dedupCleanContext.fallbackProvider, undefined);
    // End-to-end: a deduped runModelTask caller still receives the plain text while its
    // requestContext learns about the shared fallback result.
    const dedupEndToEndPlugin = new Plugin();
    dedupEndToEndPlugin.settings.translation.enabled = true;
    dedupEndToEndPlugin.settings.translation.provider = "deepseek";
    dedupEndToEndPlugin.settings.translation.apiKey = "dedup-key";
    dedupEndToEndPlugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    dedupEndToEndPlugin.settings.translation.model = "deepseek-chat";
    let dedupFetchCalls = 0;
    dedupEndToEndPlugin.fetchModelResponse = async () => {
        dedupFetchCalls++;
        await new Promise(resolve => setTimeout(resolve, 10));
        const error = new Error("HTTP 429");
        error.status = 429;
        throw error;
    };
    dedupEndToEndPlugin.tryProviderFallbackModelTask = async (kind, input, options) => {
        if (options.requestContext && typeof options.requestContext === "object") {
            options.requestContext.fallbackProvider = "googleCloud";
        }
        return { used: true, result: "dedup-fallback-text", provider: "googleCloud" };
    };
    const dedupRequestOptions = () => ({
        mode: "manual",
        requestContext: {},
        configOverrides: {
            provider: "deepseek",
            apiKey: "dedup-key",
            endpoint: "https://api.deepseek.com/chat/completions",
            model: "deepseek-chat",
            prompt: "Translate.",
            targetLanguage: "Chinese",
            temperature: 0,
            maxTokens: 400
        }
    });
    const dedupFirstOptions = dedupRequestOptions();
    const dedupSecondOptions = dedupRequestOptions();
    const dedupFirstPromise = dedupEndToEndPlugin.runModelTask("translation", "dedup source", dedupFirstOptions);
    const dedupSecondPromise = dedupEndToEndPlugin.runModelTask("translation", "dedup source", dedupSecondOptions);
    assert.equal(await dedupFirstPromise, "dedup-fallback-text");
    assert.equal(await dedupSecondPromise, "dedup-fallback-text");
    assert.equal(dedupFetchCalls, 1);
    assert.equal(dedupFirstOptions.requestContext.fallbackProvider, "googleCloud");
    assert.equal(dedupSecondOptions.requestContext.fallbackProvider, "googleCloud");

    const promptTemplatePlugin = new Plugin();
    promptTemplatePlugin.syncSettingControls = () => {};
    promptTemplatePlugin.showToast = () => {};
    promptTemplatePlugin.saveSettings = () => {};
    let promptTemplateInvalidated = 0;
    promptTemplatePlugin.invalidateAutoTranslationQueue = () => { promptTemplateInvalidated++; };
    promptTemplatePlugin.settings.translation.promptTemplates = [
        { id: "tpl-a", serial: "001", name: "A", prompt: "prompt-a" },
        { id: "tpl-b", serial: "002", name: "B", prompt: "prompt-b" }
    ];
    promptTemplatePlugin.settings.translation.activePromptTemplate = "tpl-b";
    promptTemplatePlugin.settings.translation.prompt = "hand-edited";
    promptTemplatePlugin.deletePromptTemplate("translation", "tpl-a");
    assert.equal(promptTemplatePlugin.settings.translation.activePromptTemplate, "tpl-b");
    assert.equal(promptTemplatePlugin.settings.translation.prompt, "hand-edited");
    assert.equal(promptTemplateInvalidated, 0);
    promptTemplatePlugin.deletePromptTemplate("translation", "tpl-b");
    assert.equal(promptTemplatePlugin.settings.translation.activePromptTemplate, "");
    assert.equal(promptTemplateInvalidated, 1);

    const requestKeyPlugin = new Plugin();
    const deeplKeyZh = requestKeyPlugin.getModelRequestKey(
        "https://api-free.deepl.com/v2/translate",
        { provider: "deepl", responseParser: "deepLTranslate", headers: {}, body: { text: ["hello"], target_lang: "ZH" } },
        ["hello"]
    );
    const deeplKeyEn = requestKeyPlugin.getModelRequestKey(
        "https://api-free.deepl.com/v2/translate",
        { provider: "deepl", responseParser: "deepLTranslate", headers: {}, body: { text: ["hello"], target_lang: "EN" } },
        ["hello"]
    );
    assert.notEqual(deeplKeyZh, deeplKeyEn);
    const baiduKeyZh = requestKeyPlugin.getModelRequestKey(
        "https://fanyi-api.baidu.com/api/trans/vip/translate",
        { provider: "baidu", responseParser: "baiduTranslate", headers: {}, body: { q: "hello", from: "auto", to: "zh", appid: "a" } },
        "hello"
    );
    const baiduKeyJp = requestKeyPlugin.getModelRequestKey(
        "https://fanyi-api.baidu.com/api/trans/vip/translate",
        { provider: "baidu", responseParser: "baiduTranslate", headers: {}, body: { q: "hello", from: "auto", to: "jp", appid: "a" } },
        "hello"
    );
    assert.notEqual(baiduKeyZh, baiduKeyJp);

    const terminalFailurePlugin = new Plugin();
    const terminalFailureRecord = terminalFailurePlugin.createAutoTranslationFailure(
        "terminal-key",
        terminalFailurePlugin.createFinalInvalidAutoTranslationError("invalid-output")
    );
    assert.equal(terminalFailureRecord.terminal, true);
    assert.equal(terminalFailurePlugin.isAutoTranslationFailureExpired(terminalFailureRecord), false);
    assert.equal(
        terminalFailurePlugin.isAutoTranslationFailureExpired(terminalFailureRecord, Date.now() + 7 * 60 * 60 * 1000),
        true
    );
    terminalFailurePlugin.autoTranslationFailures.clear();
    for (let index = 0; index < 2100; index++) {
        terminalFailurePlugin.autoTranslationFailures.set(`terminal-${index}`, { at: Date.now(), retryAt: 0, terminal: true, count: 1 });
    }
    terminalFailurePlugin.pruneAutoTranslationFailureMapSize();
    assert.ok(terminalFailurePlugin.autoTranslationFailures.size <= 2000);

    const sortRankPlugin = new Plugin();
    const sortRankQueue = [
        { cacheKey: "history", daitHistoryRequest: true },
        { cacheKey: "manual-late", daitManualRequest: true },
        { cacheKey: "manual-early", daitManualRequest: true, priority: 1 },
        { cacheKey: "typeless", priority: 2, text: "short" }
    ];
    sortRankPlugin.translationScheduler.sortQueue(sortRankQueue);
    assert.deepEqual(sortRankQueue.map(item => item.cacheKey), ["manual-early", "manual-late", "history", "typeless"]);

    const batchLimitPlugin = new Plugin();
    batchLimitPlugin.settings.translation.enabled = true;
    batchLimitPlugin.getAutoTranslationRequestBatchSize = () => 1;
    let batchReadyComputations = 0;
    batchLimitPlugin.getReadyAutoTranslationTargets = item => {
        batchReadyComputations++;
        return [{ messageNode: { isConnected: true }, content: { isConnected: true }, text: item.text }];
    };
    batchLimitPlugin.getAutoTranslationPrimaryTarget = target => target;
    batchLimitPlugin.isAutoTranslationPrefetchItem = () => false;
    batchLimitPlugin.shouldRunAutoTranslationItemSingle = () => false;
    batchLimitPlugin.getAutoTranslationBatchGroupKey = () => "group";
    batchLimitPlugin.sortAutoTranslationQueue = () => {};
    batchLimitPlugin.autoTranslationQueue = [1, 2, 3, 4, 5].map(index => ({
        cacheKey: `batch-${index}`,
        text: `text-${index}`,
        requestOptions: {}
    }));
    const limitedBatch = batchLimitPlugin.takeAutoTranslationBatch();
    assert.equal(limitedBatch.length, 1);
    assert.equal(batchReadyComputations, 1);
    assert.equal(batchLimitPlugin.autoTranslationQueue.length, 4);

    const quietInvalidatePlugin = new Plugin();
    const savedDocumentForQuietInvalidate = global.document;
    global.document = { body: {} };
    quietInvalidatePlugin.isDiscordMediaViewerQuiet = () => true;
    quietInvalidatePlugin.hasLightweightDiscordMediaViewerMutation = () => false;
    quietInvalidatePlugin.isPresentationOnlyMessageMutation = () => false;
    quietInvalidatePlugin.isDiscordMessageElement = () => true;
    const quietEditedElement = { nodeType: 1, parentElement: null };
    quietInvalidatePlugin.elementTextCache.set(quietEditedElement, "stale text");
    quietInvalidatePlugin.handleDiscordObservedMutations([{ type: "characterData", target: quietEditedElement }]);
    assert.equal(quietInvalidatePlugin.elementTextCache.has(quietEditedElement), false);
    global.document = savedDocumentForQuietInvalidate;

    const migratedI18nPlugin = new Plugin();
    assert.equal(migratedI18nPlugin.t("publicBilingualButton"), "双语");
    assert.ok(migratedI18nPlugin.t("publicBilingualTooLong", { length: 2100, limit: 2000 }).includes("2100"));
    assert.notEqual(migratedI18nPlugin.t("errorLocalProviderUnavailable"), "errorLocalProviderUnavailable");

    // --- Intake regressions: the incremental scan must honor ui.autoTranslateIntakeMode
    // --- and produce the same candidates as the one-shot createAutoTranslationCandidates path.

    const intakeProjection = candidate => ({
        text: candidate.text,
        source: candidate.source,
        sourceTextKind: candidate.sourceTextKind,
        messageId: candidate.messageId,
        channelId: candidate.channelId,
        messageIdentity: candidate.messageIdentity
    });
    const createIntakeFixturePlugin = mode => {
        const plugin = new Plugin();
        plugin.settings.translation.enabled = true;
        plugin.settings.ui.autoTranslateMessages = true;
        plugin.settings.ui.injectMessageButtons = false;
        plugin.settings.ui.autoTranslateIntakeMode = mode;
        plugin.settings.ui.diagnosticsEnabled = true;
        plugin.isElementVisibleInViewport = () => true;
        plugin.getMessageContentElement = message => message.content;
        plugin.getCachedElementText = content => content.text;
        plugin.getElementText = content => content.text;
        plugin.shouldAutoTranslateText = () => true;
        return plugin;
    };
    const createIntakeContext = messageNodes => ({
        messageNodes,
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    const runIncrementalIntakeScan = (plugin, context, options = {}) => {
        const collected = [];
        plugin.processAutoTranslationScanCandidates = (work, candidates = []) => {
            collected.push(...candidates);
            return candidates.length;
        };
        plugin.finishAutoTranslationScanWork = () => {};
        const pending = [];
        plugin.scheduleIncrementalMessageScanCallback = callback => { pending.push(callback); };
        plugin.scheduleIncrementalMessageScan(context);
        let slices = 0;
        while (pending.length) {
            if (typeof options.betweenSlices === "function") options.betweenSlices(slices, plugin);
            const next = pending.shift();
            slices++;
            if (slices > 200) throw new Error("incremental intake scan did not settle");
            next({ didTimeout: false, timeRemaining: () => 50 });
        }
        return { collected, slices };
    };

    const savedWindowForIntakeParity = global.window;

    // Combo 1: mode "dom" — both paths identical, intake reports dom.
    global.window = { location: { pathname: "/channels/guild-parity/channel-parity" } };
    const intakeDomMessages = () => [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola parity" } }];
    const intakeDomReference = createIntakeFixturePlugin("dom")
        .createAutoTranslationCandidates(createIntakeContext(intakeDomMessages()));
    const intakeDomIncrementalPlugin = createIntakeFixturePlugin("dom");
    const intakeDomIncrementalContext = createIntakeContext(intakeDomMessages());
    const intakeDomIncremental = runIncrementalIntakeScan(intakeDomIncrementalPlugin, intakeDomIncrementalContext);
    assert.deepEqual(intakeDomIncremental.collected.map(intakeProjection), intakeDomReference.map(intakeProjection));
    assert.equal(intakeDomIncrementalContext.autoTranslateIntake.mode, "dom");
    assert.equal(intakeDomIncrementalContext.autoTranslateIntake.source, "dom");
    assert.equal(intakeDomIncrementalContext.autoTranslateIntake.domCandidates, 1);

    // Combo 2: mode "auto" + BDFDB store available — incremental must produce the same
    // bdfdb-enhanced candidates (store-full upgrade included) as the one-shot path.
    const intakeStoreShortDom = "step 4: paste model name";
    const intakeStoreFullText = [
        "free access to GPT 5.5 and Grok 4.20",
        "platform Stack AI. free tier. no card needed",
        "step 1: sign in with Google",
        "step 2: create agent",
        "step 3: open Interface",
        intakeStoreShortDom
    ].join("\n");
    const intakeStoreWindow = () => ({
        location: { pathname: "/channels/guild-parity/444444444444444444" },
        BDFDB_Global: {
            loaded: true,
            started: true,
            BDFDB: {
                LibraryStores: {
                    MessageStore: {
                        getMessages: () => [{
                            id: "444444444444444445",
                            guild_id: "guild-parity",
                            channel_id: "444444444444444444",
                            content: intakeStoreFullText,
                            author: { id: "author-parity" },
                            timestamp: "2026-07-26T00:00:00.000Z"
                        }]
                    }
                }
            }
        }
    });
    const intakeStoreMessages = () => [{
        nodeType: 1,
        isConnected: true,
        getAttribute: name => name === "data-message-id" ? "444444444444444445" : null,
        content: { dataset: {}, isConnected: true, text: intakeStoreShortDom }
    }];
    global.window = intakeStoreWindow();
    const intakeStoreReference = createIntakeFixturePlugin("auto")
        .createAutoTranslationCandidates(createIntakeContext(intakeStoreMessages()));
    assert.equal(intakeStoreReference[0].source, "bdfdb");
    assert.equal(intakeStoreReference[0].sourceTextKind, "store-full");
    global.window = intakeStoreWindow();
    const intakeStoreIncrementalPlugin = createIntakeFixturePlugin("auto");
    const intakeStoreIncrementalContext = createIntakeContext(intakeStoreMessages());
    const intakeStoreIncremental = runIncrementalIntakeScan(intakeStoreIncrementalPlugin, intakeStoreIncrementalContext);
    assert.deepEqual(intakeStoreIncremental.collected.map(intakeProjection), intakeStoreReference.map(intakeProjection));
    assert.equal(intakeStoreIncremental.collected[0].text, intakeStoreFullText);
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.mode, "auto");
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.source, "bdfdb");
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.bdfdbAvailable, true);
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.bdfdbEnhanced, 1);
    assert.ok(intakeStoreIncrementalPlugin.diagnosticLogs.some(entry => entry.action === "auto.intake" && entry.status === "bdfdb"));

    // Combos 3/4: modes "auto" and "bdfdb" without BDFDB — incremental falls back to DOM
    // candidates but must report the configured mode and the fallback reason.
    for (const fallbackMode of ["auto", "bdfdb"]) {
        global.window = { location: { pathname: "/channels/guild-parity/channel-parity" } };
        const fallbackReference = createIntakeFixturePlugin(fallbackMode)
            .createAutoTranslationCandidates(createIntakeContext(intakeDomMessages()));
        const fallbackPlugin = createIntakeFixturePlugin(fallbackMode);
        const fallbackContext = createIntakeContext(intakeDomMessages());
        const fallbackRun = runIncrementalIntakeScan(fallbackPlugin, fallbackContext);
        assert.deepEqual(fallbackRun.collected.map(intakeProjection), fallbackReference.map(intakeProjection));
        assert.equal(fallbackContext.autoTranslateIntake.mode, fallbackMode);
        assert.equal(fallbackContext.autoTranslateIntake.source, "dom");
        assert.equal(fallbackContext.autoTranslateIntake.reason, "bdfdb-unavailable");
        if (fallbackMode === "bdfdb") {
            assert.ok(fallbackPlugin.diagnosticLogs.some(entry => entry.action === "auto.intake" && entry.status === "fallback"));
        }
    }

    // One store snapshot per incremental scan, even across multiple slices/messages.
    global.window = { location: { pathname: "/channels/guild-parity/555555555555555555" } };
    const snapshotCountPlugin = createIntakeFixturePlugin("auto");
    let snapshotFetches = 0;
    snapshotCountPlugin.getBdfdbMessageStoreMessages = () => {
        snapshotFetches++;
        return [{
            id: "555555555555555556",
            guild_id: "guild-parity",
            channel_id: "555555555555555555",
            content: "hola uno",
            author: { id: "author-count" },
            timestamp: "2026-07-26T00:00:00.000Z"
        }];
    };
    snapshotCountPlugin.isBdfdbMessageIntakeAvailable = () => true;
    const snapshotContext = createIntakeContext([
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola uno" } },
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola dos" } },
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola tres" } }
    ]);
    const snapshotRun = runIncrementalIntakeScan(snapshotCountPlugin, snapshotContext);
    assert.equal(snapshotRun.collected.length, 3);
    assert.equal(snapshotFetches, 1);
    // Slice budget still enforced with enhancement on: init slice + one task per slice.
    assert.equal(snapshotRun.slices, 4);

    // Stale generation stops slices without producing candidates.
    global.window = { location: { pathname: "/channels/guild-parity/channel-parity" } };
    const staleGenerationPlugin = createIntakeFixturePlugin("dom");
    const staleGenerationContext = createIntakeContext(intakeDomMessages());
    const staleGenerationRun = runIncrementalIntakeScan(staleGenerationPlugin, staleGenerationContext, {
        betweenSlices: (slice, plugin) => {
            if (slice === 1) plugin.incrementalMessageScanGeneration++;
        }
    });
    assert.equal(staleGenerationRun.collected.length, 0);

    global.window = savedWindowForIntakeParity;

    // --- Phase 6.0 regressions: the task-state view stays consistent with the
    // --- parallel collections across enqueue / take / in-flight / finish / remove
    // --- and the render queue structures.

    const taskStatePlugin = new Plugin();
    taskStatePlugin.settings.translation.enabled = true;
    taskStatePlugin.settings.ui.autoTranslateMessages = true;
    taskStatePlugin.getAutoTranslationRequestBatchSize = () => 1;
    taskStatePlugin.getReadyAutoTranslationTargets = item => [{
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: item.text
    }];
    taskStatePlugin.getAutoTranslationPrimaryTarget = target => target;
    taskStatePlugin.isAutoTranslationPrefetchItem = () => false;
    taskStatePlugin.shouldRunAutoTranslationItemSingle = () => false;
    taskStatePlugin.getAutoTranslationBatchGroupKey = () => "group";
    taskStatePlugin.isLongAutoTranslationItem = () => false;
    const assertNoTaskViolations = stage => {
        const violations = taskStatePlugin.checkAutoTranslationTaskInvariants();
        assert.deepEqual(violations, [], `task-state invariants violated at ${stage}: ${JSON.stringify(violations)}`);
    };

    assertNoTaskViolations("initial");
    for (const index of [1, 2, 3]) {
        taskStatePlugin.enqueueAutoTranslationItem({
            cacheKey: `task-state-${index}`,
            text: `hola ${index}`,
            requestOptions: {}
        });
    }
    assertNoTaskViolations("after-enqueue");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-1").queued, true);
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-1").queuedKey, true);
    assert.equal(taskStatePlugin.listAutoTranslationTaskKeys().length, 3);

    const taskStateBatch = taskStatePlugin.takeAutoTranslationBatch();
    assert.equal(taskStateBatch.length, 1);
    assertNoTaskViolations("after-take");
    const takenKey = taskStateBatch[0].cacheKey;
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(takenKey).queued, false);

    taskStatePlugin.markAutoTranslationInFlightItem(taskStateBatch[0]);
    assertNoTaskViolations("after-mark-in-flight");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(takenKey).inFlight, true);

    assert.equal(taskStatePlugin.finishAutoTranslationInFlightItem(taskStateBatch[0]), true);
    assertNoTaskViolations("after-finish");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(takenKey).inFlight, false);

    const removeTarget = taskStatePlugin.autoTranslationQueue[0]?.cacheKey;
    assert.ok(removeTarget);
    taskStatePlugin.removeQueuedAutoTranslationItem(removeTarget);
    assertNoTaskViolations("after-remove");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(removeTarget).queued, false);
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(removeTarget).queuedKey, false);

    taskStatePlugin.scheduleAutoTranslationRenderQueue = () => {};
    const renderTaskTarget = { messageNode: { isConnected: true }, content: { isConnected: true }, text: "render me" };
    assert.equal(taskStatePlugin.queueAutoTranslationRenderTask({
        kind: "cache",
        target: renderTaskTarget,
        cacheKey: "task-state-render",
        run: () => {}
    }), true);
    assertNoTaskViolations("after-render-queue");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-render").renderQueued, true);
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-render").renderPending, true);
    taskStatePlugin.cancelAutoTranslationRenderQueue();
    assertNoTaskViolations("after-render-cancel");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-render").renderQueued, false);

}

module.exports = { title: "Async manual supersession, requeue invariants & templates", run };
