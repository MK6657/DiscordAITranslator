"use strict";

// Artifact regression suite: Scroll stability, diagnostics & output guard
function run(harness, shared) {
    const { assert, Plugin, createFakeElement } = harness;
    const { plugin } = shared;
    const scrollStabilityPlugin = new Plugin();
    const savedComputedStyleForScrollStability = global.getComputedStyle;
    const savedDocumentForScrollStability = global.document;
    let scrollStableTop = 120;
    const scrollStableScroller = {
        nodeType: 1,
        parentElement: null,
        scrollTop: 300,
        scrollHeight: 3000,
        clientHeight: 600
    };
    const scrollStableContent = {
        isConnected: true,
        parentElement: scrollStableScroller,
        getBoundingClientRect: () => ({ top: scrollStableTop, bottom: scrollStableTop + 20, width: 100, height: 20 })
    };
    global.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });
    global.document = { scrollingElement: null, documentElement: null };
    scrollStabilityPlugin.withTranslationScrollStability(scrollStableContent, () => {
        scrollStableTop += 28;
    });
    assert.equal(scrollStableScroller.scrollTop, 328);
    global.document = savedDocumentForScrollStability;
    global.getComputedStyle = savedComputedStyleForScrollStability;

    const pausedScrollStabilityPlugin = new Plugin();
    pausedScrollStabilityPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    const savedComputedStyleForPausedScrollStability = global.getComputedStyle;
    const savedDocumentForPausedScrollStability = global.document;
    let pausedScrollStableTop = 120;
    const pausedScrollStableScroller = {
        nodeType: 1,
        parentElement: null,
        scrollTop: 300,
        scrollHeight: 3000,
        clientHeight: 600
    };
    const pausedScrollStableContent = {
        isConnected: true,
        parentElement: pausedScrollStableScroller,
        getBoundingClientRect: () => ({ top: pausedScrollStableTop, bottom: pausedScrollStableTop + 20, width: 100, height: 20 })
    };
    global.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });
    global.document = { scrollingElement: null, documentElement: null };
    pausedScrollStabilityPlugin.withTranslationScrollStability(pausedScrollStableContent, () => {
        pausedScrollStableTop += 28;
    });
    assert.equal(pausedScrollStableScroller.scrollTop, 300);
    global.document = savedDocumentForPausedScrollStability;
    global.getComputedStyle = savedComputedStyleForPausedScrollStability;

    const adjustedScrollStabilityPlugin = new Plugin();
    const savedComputedStyleForAdjustedScrollStability = global.getComputedStyle;
    const savedDocumentForAdjustedScrollStability = global.document;
    let adjustedScrollStableTop = 120;
    const adjustedScrollStableScroller = {
        nodeType: 1,
        parentElement: null,
        scrollTop: 300,
        scrollHeight: 3000,
        clientHeight: 600
    };
    const adjustedScrollStableContent = {
        isConnected: true,
        parentElement: adjustedScrollStableScroller,
        getBoundingClientRect: () => ({ top: adjustedScrollStableTop, bottom: adjustedScrollStableTop + 20, width: 100, height: 20 })
    };
    global.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });
    global.document = { scrollingElement: null, documentElement: null };
    adjustedScrollStabilityPlugin.withTranslationScrollStability(adjustedScrollStableContent, () => {
        adjustedScrollStableTop += 28;
        adjustedScrollStableScroller.scrollTop = 340;
    });
    assert.equal(adjustedScrollStableScroller.scrollTop, 340);
    global.document = savedDocumentForAdjustedScrollStability;
    global.getComputedStyle = savedComputedStyleForAdjustedScrollStability;

    const renderQueuePlugin = new Plugin();
    const savedWindowForRenderQueue = global.window;
    const renderQueueCallbacks = [];
    global.window = {
        requestAnimationFrame(callback) {
            renderQueueCallbacks.push(callback);
            return renderQueueCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    let renderQueueRuns = 0;
    for (let index = 0; index < 5; index++) {
        renderQueuePlugin.queueAutoTranslationRenderTask({
            key: `render-${index}`,
            target: {},
            priority: index,
            run: () => { renderQueueRuns++; }
        });
    }
    assert.equal(renderQueueCallbacks.length, 1);
    renderQueueCallbacks.shift()();
    assert.equal(renderQueueRuns, 3);
    assert.equal(renderQueuePlugin.autoTranslationRenderQueue.length, 2);
    assert.equal(renderQueueCallbacks.length, 1);
    renderQueueCallbacks.shift()();
    assert.equal(renderQueueRuns, 5);
    assert.equal(renderQueuePlugin.autoTranslationRenderQueue.length, 0);
    global.window = savedWindowForRenderQueue;

    const renderQueuePriorityPlugin = new Plugin();
    const savedWindowForRenderQueuePriority = global.window;
    const renderQueuePriorityCallbacks = [];
    global.window = {
        requestAnimationFrame(callback) {
            renderQueuePriorityCallbacks.push(callback);
            return renderQueuePriorityCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    const renderQueuePriorityOrder = [];
    [4, 0, 3, 1, 2].forEach(priority => {
        renderQueuePriorityPlugin.queueAutoTranslationRenderTask({
            key: `render-priority-${priority}`,
            target: {},
            priority,
            run: () => { renderQueuePriorityOrder.push(priority); }
        });
    });
    renderQueuePriorityCallbacks.shift()();
    assert.deepEqual(renderQueuePriorityOrder, [0, 1, 2]);
    renderQueuePriorityCallbacks.shift()();
    assert.deepEqual(renderQueuePriorityOrder, [0, 1, 2, 3, 4]);
    global.window = savedWindowForRenderQueuePriority;

    const renderQueueHeavyPlugin = new Plugin();
    const savedWindowForRenderQueueHeavy = global.window;
    const renderQueueHeavyCallbacks = [];
    global.window = {
        requestAnimationFrame(callback) {
            renderQueueHeavyCallbacks.push(callback);
            return renderQueueHeavyCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    const renderQueueHeavyRuns = [];
    [
        { key: "heavy-short-a", priority: 0, text: "short a" },
        { key: "heavy-long", priority: 1, text: "long ".repeat(120) },
        { key: "heavy-short-b", priority: 2, text: "short b" }
    ].forEach(item => {
        renderQueueHeavyPlugin.queueAutoTranslationRenderTask({
            key: item.key,
            target: { text: item.text },
            translated: item.text,
            priority: item.priority,
            run: () => { renderQueueHeavyRuns.push(item.key); }
        });
    });
    renderQueueHeavyCallbacks.shift()();
    assert.deepEqual(renderQueueHeavyRuns, ["heavy-short-a"]);
    assert.equal(renderQueueHeavyPlugin.autoTranslationRenderQueue.length, 2);
    renderQueueHeavyCallbacks.shift()();
    assert.deepEqual(renderQueueHeavyRuns, ["heavy-short-a", "heavy-long"]);
    assert.equal(renderQueueHeavyPlugin.autoTranslationRenderQueue.length, 1);
    renderQueueHeavyCallbacks.shift()();
    assert.deepEqual(renderQueueHeavyRuns, ["heavy-short-a", "heavy-long", "heavy-short-b"]);
    global.window = savedWindowForRenderQueueHeavy;

    const renderQueueDedupePlugin = new Plugin();
    const savedWindowForRenderQueueDedupe = global.window;
    const renderQueueDedupeCallbacks = [];
    global.window = {
        requestAnimationFrame(callback) {
            renderQueueDedupeCallbacks.push(callback);
            return renderQueueDedupeCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    const renderQueueDedupeRuns = [];
    renderQueueDedupePlugin.queueAutoTranslationRenderTask({
        key: "render-dedupe",
        target: {},
        priority: 9,
        run: () => { renderQueueDedupeRuns.push("old"); }
    });
    renderQueueDedupePlugin.queueAutoTranslationRenderTask({
        key: "render-dedupe",
        target: {},
        priority: 1,
        run: () => { renderQueueDedupeRuns.push("new"); }
    });
    assert.equal(renderQueueDedupePlugin.autoTranslationRenderQueue.length, 1);
    assert.equal(renderQueueDedupePlugin.autoTranslationRenderQueuedTasks.size, 1);
    renderQueueDedupeCallbacks.shift()();
    assert.deepEqual(renderQueueDedupeRuns, ["new"]);
    assert.equal(renderQueueDedupePlugin.autoTranslationRenderQueuedTasks.size, 0);
    global.window = savedWindowForRenderQueueDedupe;

    const renderPendingActivePlugin = new Plugin();
    const savedWindowForRenderPendingActive = global.window;
    const renderPendingActiveCallbacks = [];
    global.window = {
        requestAnimationFrame(callback) {
            renderPendingActiveCallbacks.push(callback);
            return renderPendingActiveCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    let renderPendingActiveRuns = 0;
    renderPendingActivePlugin.isStarted = true;
    renderPendingActivePlugin.queueAutoTranslationRenderTask({
        key: "render-pending-active",
        cacheKey: "render-pending-cache-key",
        target: {},
        run: () => { renderPendingActiveRuns++; }
    });
    assert.equal(renderPendingActivePlugin.hasActiveAutoTranslationKey("render-pending-cache-key"), true);
    assert.equal(renderPendingActivePlugin.autoTranslationRenderPendingKeys.has("render-pending-cache-key"), true);
    renderPendingActiveCallbacks.shift()();
    assert.equal(renderPendingActiveRuns, 1);
    assert.equal(renderPendingActivePlugin.autoTranslationRenderPendingKeys.has("render-pending-cache-key"), false);
    assert.equal(renderPendingActivePlugin.hasActiveAutoTranslationKey("render-pending-cache-key"), false);
    global.window = savedWindowForRenderPendingActive;

    const renderPendingScanPlugin = new Plugin();
    const savedWindowForRenderPendingScan = global.window;
    const savedDocumentForRenderPendingScan = global.document;
    const renderPendingScanCallbacks = [];
    global.window = {
        innerHeight: 800,
        requestAnimationFrame(callback) {
            renderPendingScanCallbacks.push(callback);
            return renderPendingScanCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    global.document = {
        documentElement: { clientHeight: 800, clientWidth: 1200 }
    };
    renderPendingScanPlugin.isStarted = true;
    renderPendingScanPlugin.settings.translation.enabled = true;
    renderPendingScanPlugin.settings.translation.apiKey = "sk-test";
    renderPendingScanPlugin.settings.translation.targetLanguage = "Chinese";
    renderPendingScanPlugin.settings.ui.autoTranslateMessages = true;
    renderPendingScanPlugin.queueScan = () => {};
    renderPendingScanPlugin.isElementVisibleInViewport = () => true;
    renderPendingScanPlugin.hasCurrentTranslationLine = () => false;
    renderPendingScanPlugin.getMessageContentElement = message => message.content;
    renderPendingScanPlugin.getCachedElementText = content => content.text;
    renderPendingScanPlugin.getElementText = content => content.text;
    renderPendingScanPlugin.getMessageIdentity = message => `render-pending-scan:${message.id}`;
    renderPendingScanPlugin.getAutoTranslationOutputValidationResult = () => ({
        quality: "partial",
        reasonCode: "undertranslated",
        renderable: true,
        cacheable: false,
        shouldRepair: true,
        targetLanguageRatio: 0.4,
        residualSourceRatio: 0.2,
        sameAsSource: false,
        refusal: false
    });
    renderPendingScanPlugin.renderTranslation = () => {};
    renderPendingScanPlugin.drainAutoTranslationQueue = () => {};
    const renderPendingScanMessage = {
        id: "same",
        isConnected: true,
        getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 10, right: 300, width: 290, height: 40 }),
        content: {
            dataset: {},
            isConnected: true,
            text: "render pending source",
            getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 10, right: 300, width: 290, height: 40 })
        }
    };
    const renderPendingScanOptions = renderPendingScanPlugin.withMessageIdentity(
        renderPendingScanPlugin.getAutoTranslationOptions(),
        renderPendingScanMessage,
        renderPendingScanMessage.content,
        "render pending source"
    );
    const renderPendingScanCacheKey = renderPendingScanPlugin.getTranslationCacheKey("render pending source", renderPendingScanOptions);
    const renderPendingScanItem = {
        messageNode: renderPendingScanMessage,
        content: renderPendingScanMessage.content,
        text: "render pending source",
        cacheKey: renderPendingScanCacheKey,
        requestOptions: renderPendingScanOptions
    };
    renderPendingScanPlugin.addAutoTranslationPendingTarget(renderPendingScanCacheKey, renderPendingScanItem);
    renderPendingScanPlugin.renderAutoTranslationResult(renderPendingScanItem, "部分译文");
    assert.equal(renderPendingScanPlugin.autoTranslationRenderPendingKeys.has(renderPendingScanCacheKey), true);
    assert.equal(renderPendingScanPlugin.autoTranslationQueue.length, 0);
    renderPendingScanPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [renderPendingScanMessage],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(renderPendingScanPlugin.autoTranslationQueue.length, 0);
    assert.equal(renderPendingScanPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0].reasonCode, "dedupe-active");
    global.window = savedWindowForRenderPendingScan;
    global.document = savedDocumentForRenderPendingScan;

    const recentRenderDecisionPlugin = new Plugin();
    recentRenderDecisionPlugin.isStarted = true;
    recentRenderDecisionPlugin.settings.translation.enabled = true;
    recentRenderDecisionPlugin.settings.translation.apiKey = "sk-test";
    recentRenderDecisionPlugin.settings.translation.targetLanguage = "Chinese";
    recentRenderDecisionPlugin.settings.ui.autoTranslateMessages = true;
    recentRenderDecisionPlugin.isElementVisibleInViewport = () => true;
    recentRenderDecisionPlugin.hasCurrentTranslationLine = () => false;
    recentRenderDecisionPlugin.getMessageIdentity = () => "recent-render-identity";
    const recentRenderMessage = { isConnected: true, contains: () => true };
    const recentRenderContent = { dataset: {}, isConnected: true, text: "recent render source", closest: () => recentRenderMessage };
    const recentRenderCandidate = {
        messageNode: recentRenderMessage,
        content: recentRenderContent,
        text: "recent render source",
        targetKind: "message"
    };
    const recentRenderOptions = recentRenderDecisionPlugin.withAutoTranslationCandidateIdentity(
        recentRenderDecisionPlugin.getAutoTranslationRequestOptionsForText("recent render source", recentRenderDecisionPlugin.getAutoTranslationOptions()),
        recentRenderCandidate
    );
    const recentRenderCacheKey = recentRenderDecisionPlugin.getTranslationCacheKey("recent render source", recentRenderOptions);
    recentRenderDecisionPlugin.rememberRecentAutoTranslationRender(recentRenderCacheKey, "recent render source", recentRenderOptions, {
        validationQuality: "partial",
        validationReason: "undertranslated"
    });
    const recentRenderDecision = recentRenderDecisionPlugin.evaluateAutoTranslationCandidate(recentRenderCandidate, {
        requestOptions: recentRenderDecisionPlugin.getAutoTranslationOptions(),
        now: Date.now()
    });
    assert.equal(recentRenderDecision.action, "skip");
    assert.equal(recentRenderDecision.reasonCode, "recent-render-present");
    assert.equal(recentRenderDecisionPlugin.autoTranslationQueue.length, 0);
    // Discord rebuilt the message and dropped its line: a cached translation is drawn again
    // despite the recent render, still without a new request.
    recentRenderDecisionPlugin.setTranslationCache(recentRenderCacheKey, "最近渲染的译文");
    const recentRenderCachedDecision = recentRenderDecisionPlugin.evaluateAutoTranslationCandidate(recentRenderCandidate, {
        requestOptions: recentRenderDecisionPlugin.getAutoTranslationOptions(),
        now: Date.now()
    });
    assert.equal(recentRenderCachedDecision.action, "render-cache");
    assert.equal(recentRenderCachedDecision.cachedTranslation, "最近渲染的译文");
    assert.equal(recentRenderDecisionPlugin.autoTranslationQueue.length, 0);

    const renderQueueBudgetPlugin = new Plugin();
    const savedWindowForRenderQueueBudget = global.window;
    const savedDateNowForRenderQueueBudget = Date.now;
    const renderQueueBudgetCallbacks = [];
    let renderQueueBudgetNow = 1000;
    Date.now = () => renderQueueBudgetNow;
    global.window = {
        requestAnimationFrame(callback) {
            renderQueueBudgetCallbacks.push(callback);
            return renderQueueBudgetCallbacks.length;
        },
        cancelAnimationFrame() {}
    };
    const renderQueueBudgetRuns = [];
    ["budget-a", "budget-b", "budget-c"].forEach((key, priority) => {
        renderQueueBudgetPlugin.queueAutoTranslationRenderTask({
            key,
            target: {},
            priority,
            run: () => {
                renderQueueBudgetRuns.push(key);
                renderQueueBudgetNow += 10;
            }
        });
    });
    renderQueueBudgetCallbacks.shift()();
    assert.deepEqual(renderQueueBudgetRuns, ["budget-a"]);
    assert.equal(renderQueueBudgetPlugin.autoTranslationRenderQueue.length, 2);
    renderQueueBudgetCallbacks.shift()();
    assert.deepEqual(renderQueueBudgetRuns, ["budget-a", "budget-b"]);
    Date.now = savedDateNowForRenderQueueBudget;
    global.window = savedWindowForRenderQueueBudget;

    const inputBusyRenderPlugin = new Plugin();
    const savedSetTimeoutForInputBusyRender = global.setTimeout;
    const savedClearTimeoutForInputBusyRender = global.clearTimeout;
    let inputBusyRenderDelay = 0;
    global.setTimeout = (callback, delay) => {
        inputBusyRenderDelay = delay;
        return "input-busy-render-timer";
    };
    global.clearTimeout = () => {};
    let inputBusyRenderRan = false;
    inputBusyRenderPlugin.isStarted = true;
    inputBusyRenderPlugin.markInputComposerBusy(220);
    inputBusyRenderPlugin.autoTranslationRenderQueue.push({
        key: "input-busy-render",
        target: {},
        run: () => { inputBusyRenderRan = true; }
    });
    inputBusyRenderPlugin.processAutoTranslationRenderQueue();
    assert.equal(inputBusyRenderRan, false);
    assert.equal(inputBusyRenderPlugin.autoTranslationRenderTimer, "input-busy-render-timer");
    assert.ok(inputBusyRenderDelay >= 200);
    inputBusyRenderPlugin.autoTranslationRenderTimer = null;
    global.setTimeout = savedSetTimeoutForInputBusyRender;
    global.clearTimeout = savedClearTimeoutForInputBusyRender;

    const renderQueueReschedulePlugin = new Plugin();
    const savedSetTimeoutForRenderQueueReschedule = global.setTimeout;
    const savedClearTimeoutForRenderQueueReschedule = global.clearTimeout;
    const savedDateNowForRenderQueueReschedule = Date.now;
    const renderQueueRescheduleDelays = [];
    const renderQueueRescheduleCleared = [];
    let renderQueueRescheduleNow = 1000;
    Date.now = () => renderQueueRescheduleNow;
    global.setTimeout = (_callback, delay) => {
        renderQueueRescheduleDelays.push(delay);
        return `render-reschedule-${renderQueueRescheduleDelays.length}`;
    };
    global.clearTimeout = timer => { renderQueueRescheduleCleared.push(timer); };
    renderQueueReschedulePlugin.autoTranslationRenderQueue.push({
        key: "render-reschedule",
        target: {},
        run: () => {}
    });
    renderQueueReschedulePlugin.scheduleAutoTranslationRenderQueue(1000);
    assert.equal(renderQueueReschedulePlugin.autoTranslationRenderTimer, "render-reschedule-1");
    assert.equal(renderQueueReschedulePlugin.autoTranslationRenderDueAt, 2000);
    renderQueueReschedulePlugin.scheduleAutoTranslationRenderQueue(120);
    assert.equal(renderQueueReschedulePlugin.autoTranslationRenderTimer, "render-reschedule-2");
    assert.equal(renderQueueReschedulePlugin.autoTranslationRenderDueAt, 1120);
    assert.deepEqual(renderQueueRescheduleCleared, ["render-reschedule-1"]);
    renderQueueReschedulePlugin.scheduleAutoTranslationRenderQueue(300);
    assert.equal(renderQueueReschedulePlugin.autoTranslationRenderTimer, "render-reschedule-2");
    assert.deepEqual(renderQueueRescheduleDelays, [1000, 120]);
    Date.now = savedDateNowForRenderQueueReschedule;
    global.setTimeout = savedSetTimeoutForRenderQueueReschedule;
    global.clearTimeout = savedClearTimeoutForRenderQueueReschedule;
    renderQueueReschedulePlugin.autoTranslationRenderTimer = null;
    renderQueueReschedulePlugin.autoTranslationRenderDueAt = 0;

    const inputBusyScanPlugin = new Plugin();
    inputBusyScanPlugin.settings.ui.injectInputButton = true;
    inputBusyScanPlugin.isDiscordMediaViewerQuiet = () => false;
    inputBusyScanPlugin.isDiscordMediaViewerOpen = () => false;
    inputBusyScanPlugin.isDiscordSettingsSurfaceOpen = () => false;
    inputBusyScanPlugin.trackAutoTranslationRouteChange = () => false;
    inputBusyScanPlugin.isAutoTranslationRenderPaused = () => false;
    inputBusyScanPlugin.injectQuickSettingsButtons = () => {};
    inputBusyScanPlugin.createScanContext = () => ({ messageNodes: [] });
    inputBusyScanPlugin.reconcileTranslationLines = () => {};
    inputBusyScanPlugin.injectMessageButtons = () => {};
    inputBusyScanPlugin.queueAutoTranslateVisibleMessages = () => {};
    let inputBusyScanInjected = 0;
    let inputBusyScanDelay = 0;
    inputBusyScanPlugin.injectInputButtons = () => { inputBusyScanInjected++; };
    inputBusyScanPlugin.queueInputButtonScan = options => { inputBusyScanDelay = Number(options?.delayMs || 0); };
    const savedDocumentForInputBusyScan = global.document;
    global.document = { querySelectorAll: () => [], documentElement: { clientHeight: 800, clientWidth: 1200 } };
    inputBusyScanPlugin.markInputComposerBusy(220);
    inputBusyScanPlugin.scanDiscordUi();
    if (savedDocumentForInputBusyScan === undefined) delete global.document;
    else global.document = savedDocumentForInputBusyScan;
    assert.equal(inputBusyScanInjected, 0);
    assert.ok(inputBusyScanDelay >= 200);

    const sourceStyleMutationPlugin = new Plugin();
    const sourceStyleElement = createFakeElement("div", []);
    sourceStyleMutationPlugin.markTranslationSourceStyleMutation(sourceStyleElement);
    assert.equal(sourceStyleMutationPlugin.isOwnMutation({
        type: "attributes",
        attributeName: "style",
        target: sourceStyleElement
    }), true);
    assert.equal(sourceStyleMutationPlugin.isOwnMutation({
        type: "attributes",
        attributeName: "style",
        target: sourceStyleElement
    }), false);
    assert.equal(plugin.getTextFingerprint("same text"), plugin.getTextFingerprint("same text"));
    assert.notEqual(plugin.getTextFingerprint("same text"), plugin.getTextFingerprint("changed text"));
    const savedWindowForIdentity = global.window;
    global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" } };
    const identityHash = plugin.getTextFingerprint("hello");
    assert.equal(plugin.getMessageIdentity({
        nodeType: 1,
        getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-333333333333333333" : "",
        parentElement: null,
        querySelector: () => null
    }, { closest: () => null }, "hello"), `message:111111111111111111:222222222222222222:333333333333333333:message:${identityHash}`);
    global.window = savedWindowForIdentity;
    const fallbackNeighborMessage = {
        nodeType: 1,
        getAttribute: attribute => attribute === "data-list-item-id" ? "message-row-fallback" : "",
        parentElement: null,
        previousElementSibling: {
            nodeType: 1,
            getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-444444444444444444" : "",
            parentElement: null,
            querySelector: () => null
        },
        nextElementSibling: null,
        querySelector: selector => selector.includes("time") ? null : null
    };
    const fallbackIdentity = plugin.getMessageIdentity(fallbackNeighborMessage, { closest: () => null }, "same short text");
    assert.match(fallbackIdentity, /^fallback:/);
    assert.equal(fallbackIdentity.includes("unknown-author:unknown-time"), true);
    assert.equal(fallbackIdentity.endsWith(`:message:${plugin.getTextFingerprint("same short text")}`), true);
    const fallbackTimestampSummary = plugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:neighborhash:message:${plugin.getTextFingerprint("same short text")}`);
    assert.equal(fallbackTimestampSummary.timestamp, "2026-06-15T04:00:00.000Z");
    assert.equal(fallbackTimestampSummary.routeHash, "routehash");
    assert.equal(fallbackTimestampSummary.domHash, "domhash");
    assert.equal(fallbackTimestampSummary.neighborHash, "neighborhash");
    const singleSnowflakeNode = {
        nodeType: 1,
        getAttribute: attribute => attribute === "aria-labelledby" ? "chat-messages-999999999999999999" : "",
        parentElement: null
    };
    assert.equal(plugin.messageTracker.getNodeMessageIds(singleSnowflakeNode).messageId, "");
    const dataMessageNode = {
        nodeType: 1,
        getAttribute: attribute => attribute === "data-message-id" ? "555555555555555555" : "",
        parentElement: null
    };
    assert.equal(plugin.messageTracker.getNodeMessageIds(dataMessageNode).messageId, "555555555555555555");
    const savedWindowForStoreIdentity = global.window;
    global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" } };
    const createStoreIdentityNode = ({ id = "", authorId = "999999999999999999", timestamp = "2026-06-15T04:00:00.000Z", previousElementSibling = null, nextElementSibling = null } = {}) => ({
        nodeType: 1,
        getAttribute: attribute => attribute === "id" ? id : "",
        parentElement: null,
        previousElementSibling,
        nextElementSibling,
        querySelector: selector => {
            if (selector.includes("data-author-id")) {
                return { getAttribute: attribute => attribute === "data-author-id" ? authorId : "" };
            }
            if (selector.includes("time")) {
                return { getAttribute: attribute => attribute === "datetime" ? timestamp : "" };
            }
            return null;
        }
    });
    const storeIdentityPlugin = new Plugin();
    storeIdentityPlugin.getDiscordMessageStoreMessages = channelId => channelId === "222222222222222222" ? [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        guild_id: "111111111111111111",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "store backed text"
    }] : [];
    assert.equal(
        storeIdentityPlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "store backed text"),
        `message:111111111111111111:222222222222222222:777777777777777777:message:${storeIdentityPlugin.getTextFingerprint("store backed text")}`
    );
    const neighborAnchoredStorePlugin = new Plugin();
    neighborAnchoredStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "666666666666666666",
        channel_id: "222222222222222222",
        content: "previous anchor"
    }, {
        id: "777777777777777777",
        channel_id: "222222222222222222",
        content: "store text without metadata"
    }];
    assert.equal(
        neighborAnchoredStorePlugin.getMessageIdentity(createStoreIdentityNode({
            authorId: "",
            timestamp: "",
            previousElementSibling: {
                nodeType: 1,
                getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-666666666666666666" : "",
                parentElement: null,
                querySelector: () => null
            }
        }), { closest: () => null }, "store text without metadata"),
        `message:111111111111111111:222222222222222222:777777777777777777:message:${neighborAnchoredStorePlugin.getTextFingerprint("store text without metadata")}`
    );
    const noMetadataStorePlugin = new Plugin();
    noMetadataStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        content: "store text without anchors"
    }];
    assert.match(noMetadataStorePlugin.getMessageIdentity(createStoreIdentityNode({ authorId: "", timestamp: "" }), { closest: () => null }, "store text without anchors"), /^fallback:/);
    const duplicateStorePlugin = new Plugin();
    duplicateStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "duplicate text"
    }, {
        id: "888888888888888888",
        channel_id: "222222222222222222",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "duplicate text"
    }];
    assert.match(duplicateStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "duplicate text"), /^fallback:/);
    const negativeStorePlugin = new Plugin();
    const savedDateNowForNegativeStore = Date.now;
    let negativeStoreNow = 100000;
    let negativeStoreLookups = 0;
    let negativeStoreMessages = [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "negative text"
    }, {
        id: "888888888888888888",
        channel_id: "222222222222222222",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "negative text"
    }];
    Date.now = () => negativeStoreNow;
    negativeStorePlugin.getDiscordMessageStoreMessages = () => {
        negativeStoreLookups++;
        return negativeStoreMessages;
    };
    assert.match(negativeStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "negative text"), /^fallback:/);
    assert.match(negativeStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "negative text"), /^fallback:/);
    assert.equal(negativeStoreLookups, 1);
    negativeStoreNow += 4000;
    negativeStoreMessages = [negativeStoreMessages[0]];
    assert.equal(
        negativeStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "negative text"),
        `message:111111111111111111:222222222222222222:777777777777777777:message:${negativeStorePlugin.getTextFingerprint("negative text")}`
    );
    assert.equal(negativeStoreLookups, 2);
    Date.now = savedDateNowForNegativeStore;
    const crossChannelStorePlugin = new Plugin();
    crossChannelStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "777777777777777777",
        channel_id: "333333333333333333",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "cross channel text"
    }];
    assert.match(crossChannelStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "cross channel text"), /^fallback:/);
    const replyStorePlugin = new Plugin();
    replyStorePlugin.isReplyPreviewElement = () => true;
    replyStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "reply visible text"
    }];
    assert.match(replyStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "reply visible text"), /^fallback:/);
    const domWinsStorePlugin = new Plugin();
    domWinsStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        author: { id: "999999999999999999" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "dom wins text"
    }];
    assert.equal(
        domWinsStorePlugin.getMessageIdentity(createStoreIdentityNode({ id: "chat-messages-222222222222222222-666666666666666666" }), { closest: () => null }, "dom wins text"),
        `message:111111111111111111:222222222222222222:666666666666666666:message:${domWinsStorePlugin.getTextFingerprint("dom wins text")}`
    );
    const throwingStorePlugin = new Plugin();
    throwingStorePlugin.getDiscordMessageStoreMessages = () => { throw new Error("store loading"); };
    const savedConsoleWarnForStoreIdentity = console.warn;
    console.warn = () => {};
    assert.match(throwingStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "throwing text"), /^fallback:/);
    console.warn = savedConsoleWarnForStoreIdentity;
    const metadataMismatchStorePlugin = new Plugin();
    metadataMismatchStorePlugin.getDiscordMessageStoreMessages = () => [{
        id: "777777777777777777",
        channel_id: "222222222222222222",
        author: { id: "101010101010101010" },
        timestamp: "2026-06-15T04:00:00.000Z",
        content: "metadata mismatch"
    }];
    assert.match(metadataMismatchStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "metadata mismatch"), /^fallback:/);
    global.window = savedWindowForStoreIdentity;
    const savedWindowForReplyIdentity = global.window;
    global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" } };
    const replyLink = {
        getAttribute: attribute => attribute === "href" ? "/channels/111111111111111111/444444444444444444/555555555555555555" : "",
        href: ""
    };
    const replyContainer = {
        querySelector: selector => selector.includes("/channels/") ? replyLink : null,
        closest: () => null
    };
    const replyContent = {
        closest: selector => selector.includes("repliedMessage") ? replyContainer : null
    };
    const outerReplyMessage = {
        nodeType: 1,
        getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-333333333333333333" : "",
        parentElement: null,
        querySelector: () => null
    };
    const replyIdentityHash = plugin.getTextFingerprint("quoted text");
    assert.equal(
        plugin.getMessageIdentity(outerReplyMessage, replyContent, "quoted text"),
        `reply:111111111111111111:444444444444444444:555555555555555555:reply-preview:${replyIdentityHash}`
    );
    global.window = savedWindowForReplyIdentity;
    const savedWindowForViewport = global.window;
    const savedDocumentForViewport = global.document;
    global.window = { innerHeight: 800, innerWidth: 1200 };
    global.document = { documentElement: { clientHeight: 800, clientWidth: 1200 } };
    assert.equal(plugin.isElementNearViewport({
        isConnected: true,
        getBoundingClientRect: () => ({ top: -300, bottom: -260, left: 10, right: 100, width: 90, height: 40 })
    }, 480), true);
    assert.equal(plugin.isElementNearViewport({
        isConnected: true,
        getBoundingClientRect: () => ({ top: 1400, bottom: 1440, left: 10, right: 100, width: 90, height: 40 })
    }, 480), false);
    const viewportVisible = {
        isConnected: true,
        getBoundingClientRect: () => ({ top: 260, bottom: 320, left: 10, right: 100, width: 90, height: 60 })
    };
    const viewportNear = {
        isConnected: true,
        getBoundingClientRect: () => ({ top: 820, bottom: 880, left: 10, right: 100, width: 90, height: 60 })
    };
    const viewportTopVisible = {
        isConnected: true,
        getBoundingClientRect: () => ({ top: 40, bottom: 90, left: 10, right: 100, width: 90, height: 50 })
    };
    assert.ok(plugin.getViewportPriority(viewportVisible) < plugin.getViewportPriority(viewportNear));
    assert.ok(plugin.getViewportPriority(viewportTopVisible) < plugin.getViewportPriority(viewportVisible));
    const savedComputedStyleForViewportPriority = global.getComputedStyle;
    const clippedPriorityContainer = {
        nodeType: 1,
        parentElement: null,
        hidden: false,
        getAttribute: () => "",
        getBoundingClientRect: () => ({ top: 400, bottom: 500, left: 0, right: 300, width: 300, height: 100 })
    };
    const clippedPriorityElement = {
        nodeType: 1,
        isConnected: true,
        hidden: false,
        parentElement: clippedPriorityContainer,
        getAttribute: () => "",
        getBoundingClientRect: () => ({ top: 100, bottom: 150, left: 10, right: 100, width: 90, height: 50 })
    };
    global.getComputedStyle = element => ({
        display: "block",
        visibility: "visible",
        opacity: "1",
        overflow: element === clippedPriorityContainer ? "hidden" : "visible",
        overflowX: element === clippedPriorityContainer ? "hidden" : "visible",
        overflowY: element === clippedPriorityContainer ? "hidden" : "visible"
    });
    assert.ok(plugin.getViewportPriority(clippedPriorityElement) >= 100000);
    global.getComputedStyle = savedComputedStyleForViewportPriority;
    const savedDocumentForScanContext = global.document;
    global.document = {
        documentElement: { clientHeight: 800, clientWidth: 1200 },
        querySelectorAll: () => [viewportNear, viewportVisible, viewportTopVisible]
    };
    assert.deepEqual(plugin.createScanContext().messageNodes, [viewportTopVisible, viewportVisible, viewportNear]);
    plugin.settings.ui.autoTranslatePrefetch = false;
    assert.deepEqual(plugin.createScanContext().messageNodes, [viewportTopVisible, viewportVisible]);
    global.document = {
        documentElement: { clientHeight: 800, clientWidth: 1200 },
        querySelectorAll: () => [viewportNear]
    };
    assert.deepEqual(plugin.createScanContext().messageNodes, []);
    plugin.settings.ui.autoTranslatePrefetch = true;
    plugin.settings.ui.autoTranslatePrefetchRange = 5;
    const createFarPrefetchMessage = (top, text) => {
        const message = {
            isConnected: true,
            nodeType: 1,
            parentElement: null,
            getAttribute: () => "",
            getBoundingClientRect: () => ({ top, bottom: top + 60, left: 10, right: 100, width: 90, height: 60 }),
            querySelectorAll: () => [],
            contains(node) { return node === this.content; }
        };
        const content = {
            isConnected: true,
            nodeType: 1,
            parentElement: message,
            textContent: text,
            getAttribute: () => "",
            getBoundingClientRect: () => ({ top, bottom: top + 60, left: 10, right: 100, width: 90, height: 60 }),
            closest: () => null
        };
        message.content = content;
        return message;
    };
    const indexedVisibleMessage = createFarPrefetchMessage(120, "visible indexed");
    const indexedPrefetchMessages = [980, 1120, 1260, 1400, 1540].map((top, index) => createFarPrefetchMessage(top, `far indexed ${index}`));
    const indexedFarMessage = indexedPrefetchMessages[4];
    global.document = {
        documentElement: { clientHeight: 800, clientWidth: 1200 },
        querySelectorAll: () => [indexedVisibleMessage, ...indexedPrefetchMessages]
    };
    const indexedPrefetchContext = plugin.createScanContext();
    assert.equal(indexedPrefetchContext.messageNodes.includes(indexedFarMessage), true);
    assert.equal(plugin.isElementNearViewport(indexedFarMessage.content, 480, indexedPrefetchContext), false);
    assert.equal(plugin.isAutoTranslationTargetInScanRange(indexedFarMessage.content, indexedPrefetchContext), true);
    const classOnlyMessageNode = {
        className: "messageListItem__fake",
        isConnected: true,
        nodeType: 1,
        getBoundingClientRect: () => ({ top: 300, bottom: 360, left: 10, right: 100, width: 90, height: 60 })
    };
    global.document = {
        documentElement: { clientHeight: 800, clientWidth: 1200 },
        querySelectorAll: selector => {
            assert.doesNotMatch(selector, /messageListItem/);
            return [];
        }
    };
    assert.deepEqual(plugin.createScanContext().messageNodes, []);
    const dirtyRootMessageNode = {
        id: "chat-messages-dirty",
        className: "",
        isConnected: true,
        nodeType: 1,
        matches: selector => String(selector || "").includes("chat-messages"),
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 300, bottom: 360, left: 10, right: 100, width: 90, height: 60 })
    };
    const dirtyScanRoot = {
        isConnected: true,
        nodeType: 1,
        matches: () => false,
        querySelectorAll: selector => String(selector || "").includes("chat-messages") ? [dirtyRootMessageNode] : [],
        getBoundingClientRect: () => ({ top: 260, bottom: 380, left: 0, right: 120, width: 120, height: 120 })
    };
    global.document = {
        documentElement: { clientHeight: 800, clientWidth: 1200 },
        querySelectorAll: () => { throw new Error("dirty scan context should not query all messages"); }
    };
    const dirtyContext = plugin.createScanContext({ roots: [dirtyScanRoot], dirtyOnly: true });
    assert.deepEqual(dirtyContext.messageNodes, [dirtyRootMessageNode]);
    assert.equal(dirtyContext.dirtyOnly, true);
    let cachedRectCalls = 0;
    const cachedRectNode = {
        isConnected: true,
        parentElement: null,
        getBoundingClientRect: () => {
            cachedRectCalls++;
            return { top: 260, bottom: 320, left: 10, right: 100, width: 90, height: 60 };
        }
    };
    const cachedRectContext = {
        rectByElement: new Map(),
        visibleByElement: new Map(),
        nearByElement: new Map(),
        priorityByElement: new Map()
    };
    assert.deepEqual(plugin.getScanMessageNodes([cachedRectNode], cachedRectContext), [cachedRectNode]);
    assert.equal(plugin.isElementNearViewport(cachedRectNode, 480, cachedRectContext), true);
    assert.ok(plugin.getViewportPriority(cachedRectNode, cachedRectContext) < 100000);
    assert.equal(cachedRectCalls, 1);
    const targetCachePlugin = new Plugin();
    let targetContentLookups = 0;
    let targetReplyLookups = 0;
    targetCachePlugin.isAutoTranslationTargetInScanRange = () => true;
    targetCachePlugin.getMessageContentElement = () => {
        targetContentLookups++;
        return { text: "bonjour" };
    };
    targetCachePlugin.getCachedElementText = element => element.text;
    targetCachePlugin.getReplyPreviewElements = () => {
        targetReplyLookups++;
        return [];
    };
    const targetCacheContext = { targetsByMessage: new Map() };
    const targetCacheMessage = {};
    assert.equal(targetCachePlugin.getAutoTranslationTargets(targetCacheMessage, targetCacheContext).length, 1);
    assert.equal(targetCachePlugin.getAutoTranslationTargets(targetCacheMessage, targetCacheContext).length, 1);
    assert.equal(targetContentLookups, 1);
    assert.equal(targetReplyLookups, 1);
    const multiContentPlugin = new Plugin();
    multiContentPlugin.isAutoTranslationTargetInScanRange = () => true;
    multiContentPlugin.getCachedElementText = element => element.text;
    multiContentPlugin.getReplyPreviewElements = () => [];
    const multiContentA = {
        text: "first foreign",
        closest: () => null,
        contains: () => false
    };
    const multiContentB = {
        text: "second foreign",
        closest: () => null,
        contains: () => false
    };
    const multiContentMessage = {
        querySelectorAll: selector => selector.includes("messageContent") ? [multiContentA, multiContentB] : []
    };
    const multiContentTargets = multiContentPlugin.getAutoTranslationTargets(multiContentMessage, { targetsByMessage: new Map(), contentElementsByMessage: new Map() });
    assert.deepEqual(multiContentTargets.map(target => target.text), ["first foreign", "second foreign"]);
    global.document = savedDocumentForScanContext;
    global.window = savedWindowForViewport;
    global.document = savedDocumentForViewport;
    const jumpPlugin = new Plugin();
    global.window = { innerHeight: 800, scrollY: 0, pageYOffset: 0 };
    global.document = { body: {}, documentElement: { clientHeight: 800 } };
    const jumpFailure = { retryAt: Date.now() + 10000 };
    jumpPlugin.autoTranslationFailures.set("keep-failure", jumpFailure);
    jumpPlugin.markAutoTranslationViewportBusy("scroll", { target: { scrollTop: 5000 } });
    assert.equal(jumpPlugin.autoTranslationConfigVersion, 0);
    assert.equal(jumpPlugin.autoTranslationFailures.get("keep-failure"), jumpFailure);
    assert.equal(jumpPlugin.isAutoTranslationViewportSettling(), true);
    assert.equal(jumpPlugin.isAutoTranslationRenderPaused(), true);
    const nonChatScrollPlugin = new Plugin();
    let nonChatBusyCount = 0;
    let nonChatScanCount = 0;
    nonChatScrollPlugin.markAutoTranslationViewportBusy = () => { nonChatBusyCount++; };
    nonChatScrollPlugin.queueScan = () => { nonChatScanCount++; };
    const nonChatScrollTarget = {
        nodeType: 1,
        closest: selector => selector.includes(".dait-settings") ? {} : null,
        matches: () => false,
        querySelector: () => null,
        scrollTop: 1200
    };
    nonChatScrollPlugin.queueViewportScan({ type: "scroll", target: nonChatScrollTarget });
    assert.equal(nonChatBusyCount, 0);
    assert.equal(nonChatScanCount, 0);
    const disabledAutoScrollPlugin = new Plugin();
    let disabledAutoBusyCount = 0;
    let disabledAutoScanCount = 0;
    disabledAutoScrollPlugin.isDiscordMediaViewerViewportEvent = () => false;
    disabledAutoScrollPlugin.isAutoTranslationScrollEventRelevant = () => true;
    disabledAutoScrollPlugin.markAutoTranslationViewportBusy = () => { disabledAutoBusyCount++; };
    disabledAutoScrollPlugin.queueScan = () => { disabledAutoScanCount++; };
    disabledAutoScrollPlugin.queueViewportScan({ type: "scroll", target: { scrollTop: 500 } });
    assert.equal(disabledAutoBusyCount, 0);
    assert.equal(disabledAutoScanCount, 0);
    const incrementalScanPlugin = new Plugin();
    incrementalScanPlugin.settings.translation.provider = "sakuraLocal";
    incrementalScanPlugin.settings.ui.autoTranslateMessages = true;
    const incrementalCallbacks = [];
    const savedWindowForIncrementalScan = global.window;
    global.window = {
        requestIdleCallback(callback) {
            incrementalCallbacks.push(callback);
            return incrementalCallbacks.length;
        },
        cancelIdleCallback() {}
    };
    const incrementalMessages = [1, 2, 3].map(id => ({ id, isConnected: true }));
    const incrementalButtons = [];
    const incrementalCandidates = [];
    const incrementalTimingActions = [];
    let incrementalFinished = 0;
    incrementalScanPlugin.injectMessageButton = message => { incrementalButtons.push(message.id); };
    incrementalScanPlugin.logSlowOperation = action => { incrementalTimingActions.push(action); };
    incrementalScanPlugin.createAutoTranslationScanWork = context => ({
        context,
        scanState: {},
        scanStats: { candidates: 0 }
    });
    incrementalScanPlugin.createDomAutoTranslationCandidatesForMessage = message => [{ id: message.id }];
    incrementalScanPlugin.processAutoTranslationScanCandidates = (_work, candidates) => { incrementalCandidates.push(...candidates.map(candidate => candidate.id)); };
    incrementalScanPlugin.finishAutoTranslationScanWork = () => { incrementalFinished++; };
    const incrementalContext = { messageNodes: incrementalMessages };
    assert.equal(incrementalScanPlugin.shouldUseIncrementalMessageScan(incrementalContext), true);
    const cloudIncrementalPlugin = new Plugin();
    cloudIncrementalPlugin.settings.translation.provider = "deepseek";
    cloudIncrementalPlugin.settings.ui.autoTranslateMessages = true;
    assert.equal(cloudIncrementalPlugin.shouldUseIncrementalMessageScan(incrementalContext), true);
    const buttonOnlyIncrementalPlugin = new Plugin();
    buttonOnlyIncrementalPlugin.settings.ui.autoTranslateMessages = false;
    buttonOnlyIncrementalPlugin.settings.ui.injectMessageButtons = true;
    assert.equal(buttonOnlyIncrementalPlugin.shouldUseIncrementalMessageScan(incrementalContext), true);
    incrementalScanPlugin.scheduleIncrementalMessageScan(incrementalContext);
    assert.equal(incrementalCallbacks.length, 1);
    incrementalCallbacks.shift()({ timeRemaining: () => 50 });
    assert.deepEqual(incrementalButtons, []);
    assert.equal(incrementalFinished, 0);
    incrementalCallbacks.shift()({ timeRemaining: () => 50 });
    assert.deepEqual(incrementalButtons, [1]);
    assert.equal(incrementalFinished, 0);
    while (incrementalCallbacks.length) incrementalCallbacks.shift()({ timeRemaining: () => 50 });
    assert.deepEqual(incrementalButtons, [1, 2, 3]);
    assert.deepEqual(incrementalCandidates, [1, 2, 3]);
    assert.equal(incrementalFinished, 1);
    assert.equal(incrementalTimingActions.includes("scan.incremental-finish"), true);
    let buttonOnlyInjected = 0;
    buttonOnlyIncrementalPlugin.injectMessageButton = () => { buttonOnlyInjected++; };
    buttonOnlyIncrementalPlugin.createAutoTranslationScanWork = () => { throw new Error("button-only scan must not initialize auto translation"); };
    buttonOnlyIncrementalPlugin.scheduleIncrementalMessageScan(incrementalContext);
    while (incrementalCallbacks.length) incrementalCallbacks.shift()({ timeRemaining: () => 50 });
    assert.equal(buttonOnlyInjected, incrementalMessages.length);
    global.window = savedWindowForIncrementalScan;
    const multiScrollerPlugin = new Plugin();
    let multiScrollerInvalidations = 0;
    multiScrollerPlugin.invalidateAutoTranslationQueue = () => { multiScrollerInvalidations++; };
    global.window = { innerHeight: 800, scrollY: 0, pageYOffset: 0 };
    const scrollTargetA = { scrollTop: 20 };
    const scrollTargetB = { scrollTop: 5000 };
    multiScrollerPlugin.markAutoTranslationViewportBusy("scroll", { target: scrollTargetA });
    multiScrollerPlugin.markAutoTranslationViewportBusy("scroll", { target: scrollTargetB });
    assert.equal(multiScrollerInvalidations, 0);
    global.window = savedWindowForViewport;
    global.document = savedDocumentForViewport;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.ui.autoTranslateConcurrency = 99;
    assert.equal(plugin.getAutoTranslateConcurrency(), 10);
    plugin.settings.ui.autoTranslateConcurrency = 0;
    assert.equal(plugin.getAutoTranslateConcurrency(), 1);
    plugin.settings.ui.autoTranslateConcurrency = 4;
    plugin.settings.translation.provider = "sakuraLocal";
    assert.equal(plugin.getAutoTranslateConcurrency(), 4);
    plugin.settings.translation.provider = "deepseek";
    const numericInputCreated = [];
    global.document = {
        activeElement: null,
        createElement: tag => createFakeElement(tag, numericInputCreated),
        querySelectorAll: selector => numericInputCreated.filter(element => selector === "[data-dait-path]" || selector === `[data-dait-path='${element.dataset?.daitPath}']`)
    };
    const numericInputPlugin = new Plugin();
    let numericInputSaves = 0;
    numericInputPlugin.saveData = key => {
        if (key === "settings") numericInputSaves++;
        return true;
    };
    numericInputPlugin.createInputRow("ui.autoTranslateConcurrency", "Concurrency", "number", "4", { min: "1", max: "10", step: "1" });
    const numericInput = numericInputCreated.find(element => element.dataset?.daitPath === "ui.autoTranslateConcurrency");
    numericInput.value = "7";
    numericInput.listeners.input();
    assert.equal(numericInputPlugin.settings.ui.autoTranslateConcurrency, 7);
    assert.equal(numericInputSaves, 0);
    assert.equal(numericInputPlugin.flushSettings(), true);
    assert.equal(numericInputSaves, 1);
    numericInput.value = "8";
    numericInput.listeners.change();
    assert.equal(numericInputPlugin.settings.ui.autoTranslateConcurrency, 8);
    assert.equal(numericInputSaves, 2);
    numericInput.value = "6";
    numericInputPlugin.commitSettingsControls({ querySelectorAll: selector => selector === "[data-dait-path]" ? [numericInput] : [] });
    assert.equal(numericInputPlugin.settings.ui.autoTranslateConcurrency, 6);
    assert.equal(numericInputPlugin.flushSettings(), true);
    assert.equal(numericInputSaves, 3);
    clearTimeout(numericInputPlugin.settingsDirtyTimer);
    numericInputPlugin.settingsDirtyTimer = null;
    const sameValueSavePlugin = new Plugin();
    sameValueSavePlugin.settings.ui.autoTranslateConcurrency = 8;
    let sameValueSaved = null;
    sameValueSavePlugin.saveData = (key, value) => {
        if (key === "settings") sameValueSaved = sameValueSavePlugin.clone(value);
        return true;
    };
    sameValueSavePlugin.setSetting("ui.autoTranslateConcurrency", 8, { save: "immediate" });
    assert.equal(sameValueSaved.ui.autoTranslateConcurrency, 8);
    const localClampPlugin = new Plugin();
    localClampPlugin.settings.translation.provider = "sakuraLocal";
    localClampPlugin.settings.ui.autoTranslateConcurrency = 1;
    const localConcurrencyInput = { type: "number", value: "8", dataset: { daitPath: "ui.autoTranslateConcurrency" } };
    global.document = {
        activeElement: localConcurrencyInput,
        querySelectorAll: selector => selector === "[data-dait-path='ui.autoTranslateConcurrency']" ? [localConcurrencyInput] : []
    };
    localClampPlugin.setSetting("ui.autoTranslateConcurrency", 11);
    assert.equal(localClampPlugin.settings.ui.autoTranslateConcurrency, 10);
    assert.equal(localConcurrencyInput.value, 10);
    const localPrefetchCheckbox = { type: "checkbox", checked: true, dataset: { daitPath: "ui.autoTranslatePrefetch" } };
    global.document = {
        activeElement: localPrefetchCheckbox,
        querySelectorAll: selector => selector === "[data-dait-path='ui.autoTranslatePrefetch']" ? [localPrefetchCheckbox] : []
    };
    localClampPlugin.settings.ui.autoTranslatePrefetch = false;
    localClampPlugin.setSetting("ui.autoTranslatePrefetch", true);
    assert.equal(localClampPlugin.settings.ui.autoTranslatePrefetch, true);
    assert.equal(localPrefetchCheckbox.checked, true);
    const localStrictRetryCheckbox = { type: "checkbox", checked: true, dataset: { daitPath: "ui.autoTranslateStrictRetry" } };
    global.document = {
        activeElement: localStrictRetryCheckbox,
        querySelectorAll: selector => selector === "[data-dait-path='ui.autoTranslateStrictRetry']" ? [localStrictRetryCheckbox] : []
    };
    localClampPlugin.settings.ui.autoTranslateStrictRetry = false;
    localClampPlugin.setSetting("ui.autoTranslateStrictRetry", true);
    assert.equal(localClampPlugin.settings.ui.autoTranslateStrictRetry, true);
    assert.equal(localStrictRetryCheckbox.checked, true);
    clearTimeout(localClampPlugin.settingsDirtyTimer);
    localClampPlugin.settingsDirtyTimer = null;
    global.document = savedDocumentForViewport;
    assert.equal(plugin.getTestModeKind(), "translation");
    plugin.settings.ui.testModeKind = "bad-value";
    assert.equal(plugin.getTestModeKind(), "translation");
    plugin.settings.ui.testModeKind = "polish";
    assert.equal(plugin.getTestModeKind(), "polish");
    plugin.settings.ui.testModeKind = "translation";
    assert.equal(plugin.getHotkeyLabel(), "Ctrl+Alt+P");
    assert.equal(plugin.isModifierOnlyKey("Control"), true);
    assert.equal(plugin.isModifierOnlyKey("p"), false);
    assert.equal(plugin.shortcutFromEvent({ key: "p", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }), "Ctrl+Alt+P");
    assert.equal(plugin.shortcutFromEvent({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "");
    assert.equal(plugin.isHotkeyEvent({ key: "p", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }, "Ctrl+Alt+P"), true);
    assert.equal(plugin.normalizeLanguageName("English"), "英语");
    assert.equal(plugin.normalizeLanguageName("Simplified Chinese"), "汉语");
    assert.equal(plugin.normalizeLanguageName("Traditional Chinese"), "繁體中文");
    assert.equal(plugin.normalizeLanguageName("zh-TW"), "繁體中文");
    assert.equal(plugin.normalizeLanguageName("zh-Hant"), "繁體中文");
    assert.equal(plugin.normalizeLanguageName("繁体中文"), "繁體中文");
    assert.equal(plugin.normalizeLanguageName("繁體中文"), "繁體中文");
    assert.equal(plugin.isChineseLanguageAlias("繁體中文"), true);
    assert.equal(plugin.normalizeLanguageName("Korean"), "朝鲜语");
    assert.equal(plugin.normalizeLanguageName("German"), "德语");
    plugin.settings.translation.targetLanguage = "汉语";
    assert.equal(plugin.shouldAutoTranslateText("ВольныйКаменщик японские прокси"), true);
    assert.equal(plugin.shouldAutoTranslateText("भारत में इसे कैसे करें"), true);
    assert.equal(plugin.shouldAutoTranslateText("老哥最近搞啥呢"), false);
    assert.equal(plugin.shouldAutoTranslateText("ChatGPT"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d \u043f\u0440\u0438\u0432\u0435\u0442", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d please help", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d API", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d ChatGPT", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d ChatGPT API", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d please API help", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d https://example.com", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u6211\u7684bug team\u554a", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u4fee\u7a0b\u5e8f\u7684bug ok sure", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2aAPI cache\u6709bug", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u6211\u60f3\u627e\u4e2a\u51a4\u79cd\u5e2e\u6211\u62fc\u8f66team", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2afeature flag\u53ef\u4ee5\u5173", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("API \u662f\u4ec0\u4e48\u95ee\u9898", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2aplease help\u6211", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("bug team", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("need upi scan", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("UPI scan", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u4e2d\u6587\u5185\u5bb9\u5f88\u591a\nneed upi scan", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u4e2d\u6587\u5185\u5bb9\u5f88\u591a need upi scan", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("need upi scan\nAnyone who can do scans, please message me", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("hello \u0928\u092e\u0938\u094d\u0924\u0947", "English"), true);
    assert.equal(plugin.shouldAutoTranslateText("API"), false);
    assert.equal(plugin.shouldAutoTranslateText("привет."), true);
    assert.equal(plugin.shouldAutoTranslateText("bonjour."), true);
    assert.equal(plugin.shouldAutoTranslateText("hola-"), true);
    assert.equal(plugin.shouldAutoTranslateText("大丈夫"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u05e9\u05dc\u05d5\u05dd"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u03b3\u03b5\u03b9\u03ac \u03c3\u03bf\u03c5"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u6f22\u5b57"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u5b87\u5b99\u98db\u8239", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u9019\u5bb6", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u9019\u662f\u7e41\u9ad4\u4e2d\u6587", "Traditional Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u9019\u500bAPI cache\u6709bug", "zh-TW"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u662f\u7b80\u4f53\u4e2d\u6587", "Traditional Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2astatus code\u662f429 error", "Chinese"), false);
    assert.equal(plugin.shouldAutoTranslateText("status code error", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("ok", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("ok sure", "Chinese"), true);
    assert.equal(plugin.isLowInformationRepeatedText("dur dur dur dur"), true);
    assert.equal(plugin.shouldAutoTranslateText("dur dur dur dur", "Chinese"), false);
    assert.equal(plugin.computeAutoTranslationPrecheckSkipReason("dur dur dur dur", "Chinese"), "low-information-repeat");
    const turkishRepeatPlugin = new Plugin();
    turkishRepeatPlugin.settings.translation.sourceLanguage = "Turkish";
    assert.equal(turkishRepeatPlugin.isLowInformationRepeatedText("Dur! Dur! Dur!"), false);
    assert.equal(plugin.isLowInformationRepeatedText("durable systems need tests"), false);
    assert.equal(plugin.isLowInformationRepeatedText("no no no no"), false);
    assert.equal(plugin.shouldAutoTranslateText("\u7121\u6599\u767b\u9332\u5fc5\u8981\u78ba\u8a8d", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("\u5fc5\u8981", "Chinese"), false);
    assert.equal(plugin.isLikelyTargetLanguage("\u4f60\u597d", "\u6c49\u8bed"), true);
    assert.equal(plugin.hasSuspiciousChineseAutoTranslationOutput("\u6d63\u72b2\u30bd", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("hello", "\u6d63\u72b2\u30bd", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("hello", "\u4f60\u597d", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("This is Traditional Chinese.", "\u9019\u662f\u7e41\u9ad4\u4e2d\u6587\u3002", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("This is Simplified Chinese.", "\u8fd9\u662f\u7b80\u4f53\u4e2d\u6587\u3002", "Chinese"), false);
    const promptLeakOutput = [
        "\u60a8\u6b63\u5728\u4e3a\u5b9e\u65f6\u5b57\u5e55\u5c42\u7ffb\u8bd1Discord\u804a\u5929\u6d88\u606f\u3002",
        "\u4efb\u52a1\uff1a\u5c06\u4eba\u7c7b\u8bed\u8a00\u5185\u5bb9\u7ffb\u8bd1\u6210\u7b80\u4f53\u4e2d\u6587\uff08\u4e2d\u6587\uff0czh-CN\uff09\u3002",
        "\u8981\u6c42\uff1a",
        "- \u4fdd\u7559URL\u3001Markdown\u3001emoji\u548c\u4ee3\u7801\u5757\u3002",
        "\u4ec5\u8fd4\u56de\u7ffb\u8bd1\u540e\u7684\u6d88\u606f\u3002"
    ].join("\n");
    assert.equal(plugin.hasPromptLeakageAutoTranslationOutput("\u042d\u043c", promptLeakOutput, "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("\u042d\u043c", promptLeakOutput, "Chinese"), true);
    const genericShortPromptLeakOutput = [
        "\u4efb\u52a1\uff1a\u5c06\u8f93\u5165\u7ffb\u8bd1\u6210\u76ee\u6807\u8bed\u8a00\u3002",
        "\u8981\u6c42\uff1a\u4fdd\u7559 URL\u3001Markdown\u3001emoji \u548c\u4ee3\u7801\u5757\u3002",
        "\u76ee\u6807\u8bed\u8a00\uff1a\u7b80\u4f53\u4e2d\u6587\u3002",
        "\u4ec5\u8fd4\u56de\u7ffb\u8bd1\u540e\u7684\u6d88\u606f\uff0c\u4e0d\u8981\u89e3\u91ca\u3002"
    ].join("\n");
    assert.equal(plugin.hasPromptLeakageAutoTranslationOutput("\u042d\u043c", genericShortPromptLeakOutput, "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("\u042d\u043c", genericShortPromptLeakOutput, "Chinese"), true);
    const explanatoryNoiseOutput = "\u201cdur dur dur dur\u201d \u8fd9\u4e2a\u8868\u8fbe\u5728 Discord \u4e2d\u5e76\u4e0d\u5e38\u89c1\uff0c\u53ef\u80fd\u662f\u67d0\u79cd\u7279\u5b9a\u7684\u4fda\u8bed\u6216\u7f29\u5199\u3002\u5efa\u8bae\u63d0\u4f9b\u66f4\u591a\u7684\u4e0a\u4e0b\u6587\u4ee5\u4fbf\u66f4\u51c6\u786e\u5730\u7ffb\u8bd1\u3002";
    assert.equal(plugin.hasExplanatoryAutoTranslationOutput("dur dur dur dur", explanatoryNoiseOutput), true);
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("dur dur dur dur", explanatoryNoiseOutput, "Chinese"), "explanatory-output");
    assert.equal(plugin.getAutoTranslationOutputValidationResult("dur dur dur dur", explanatoryNoiseOutput, "Chinese").renderable, false);
    const longOrdinarySource = "Please keep this ordinary Discord message intact while discussing several unrelated project details and status updates.";
    assert.ok(longOrdinarySource.length > 80);
    assert.equal(plugin.getAutoTranslationInvalidOutputReason(longOrdinarySource, explanatoryNoiseOutput, "Chinese"), "explanatory-output");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("api \u0435\u0449\u0435 \u0435\u0441\u0442\u044c", "\u8fd8\u6709\u4e00\u90e8\u5206\u5185\u5bb9\u9700\u8981\u7ffb\u8bd1\u3002", "Chinese"), "explanatory-output");
    assert.equal(plugin.hasExplanatoryAutoTranslationOutput(
        "\u8fd9\u4e2a\u8868\u8fbe\u5e76\u4e0d\u5e38\u89c1\uff0c\u53ef\u80fd\u662f\u4fda\u8bed\u6216\u7f29\u5199\uff0c\u9700\u8981\u66f4\u591a\u4e0a\u4e0b\u6587\u624d\u80fd\u51c6\u786e\u7ffb\u8bd1\u3002",
        "This is not a common expression and may be slang or an abbreviation. Please provide more context for an accurate translation."
    ), false);
    assert.equal(plugin.hasExplanatoryAutoTranslationOutput(
        "\u8fd8\u6709\u4e00\u90e8\u5206\u5185\u5bb9\u9700\u8981\u7ffb\u8bd1\u3002",
        "Some remaining content still needs to be translated."
    ), false);
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86", "Chinese"), "emoji-mismatch");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86 :emoji_13:", "Chinese"), "emoji-mismatch");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86 :emoji_12: :emoji_12:", "Chinese"), "emoji-mismatch");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86 <:emoji_12:123456789012345678>", "Chinese"), "");
    assert.equal(plugin.isInvalidAutoTranslationOutput("\u042d\u043c", "\u55ef", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("What are the task requirements?", "\u8fd9\u4e2a\u4efb\u52a1\u6709\u54ea\u4e9b\u8981\u6c42\uff1f", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("ok", "OK", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("hello\nthanks", "\u4f60\u597d\uff0c\u8c22\u8c22\u3002", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Please check ABC-123\nthen restart API", "\u8bf7\u68c0\u67e5 ABC-123\uff0c\u7136\u540e\u91cd\u542f API\u3002", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("See you in Taiwan", "\u53f0\u7063\u898b\u3002", "Traditional Chinese"), false);
    assert.equal(plugin.isLikelyTargetLanguage("\u65e5\u672c\u4eba\u7684\u519b\u56fd\u4e3b\u4e49\uff0c\u5567\uff0c\u771f\u662f\u8ba9\u4eba\u76f4\u6cdb\u6076\u5fc3\u554a~", "繁体中文"), false);
    assert.equal(plugin.isLikelyTargetLanguage("\u65e5\u672c\u4eba\u7684\u8ecd\u570b\u4e3b\u7fa9\uff0c\u5616\uff0c\u771f\u662f\u8b93\u4eba\u76f4\u6cdb\u566c\u5fc3\u554a\uff5e", "繁体中文"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Japanese militarism is disgusting.", "\u65e5\u672c\u4eba\u7684\u519b\u56fd\u4e3b\u4e49\uff0c\u5567\uff0c\u771f\u662f\u8ba9\u4eba\u76f4\u6cdb\u6076\u5fc3\u554a~", "繁体中文"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Japanese militarism is disgusting.", "\u65e5\u672c\u4eba\u7684\u8ecd\u570b\u4e3b\u7fa9\uff0c\u5616\uff0c\u771f\u662f\u8b93\u4eba\u76f4\u6cdb\u566c\u5fc3\u554a\uff5e", "繁体中文"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "请不要争吵。"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "Пожалуйста, не ссорьтесь."), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "Please do not argue."), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "请不要争吵。 Please do not argue."), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("привет", "???????"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("есть схема по chatgpt бесплатно", "???????"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("ооо, лучший админ!!!!!!!\nцелую обнимаю брат", "亲亲抱抱，兄弟"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("ооо, лучший админ!!!!!!!\nцелую обнимаю брат", "哦哦，最好的管理员！\n亲亲抱抱，兄弟"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("есть схема\nпривет", "有方案\nпривет"), true);
    assert.equal(plugin.hasResidualAutoTranslationSourceText("你好\nChatGPT", "汉语"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("how to use chatgpt api", "\u5982\u4f55\u4f7f\u7528 ChatGPT API", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("how to use gpt", "\u4f60\u597d GPT-4o", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("how to use chatgpt api", "\u5982\u4f55\u4f7f\u7528 please help", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro Pro, no 429 error.", "\u6211\u6709 Kiro Pro\uff0c\u6ca1\u6709 429 \u9519\u8bef\u3002", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro pro no 429 error.", "\u6211\u9047\u5230 Kiro Pro 429 \u9519\u8bef\u3002", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro Pro.", "\u6211\u6709 Kiro Pro\u3002", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro Pro, please help.", "\u6211\u6709 Kiro Pro\uff0cplease help\u3002", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("please help with Kiro Pro", "\u8bf7\u5e2e\u6211\u5904\u7406 Kiro Pro", "Chinese"), false);
    assert.equal(plugin.hasResidualAutoTranslationSourceText("\u6211\u6709 Kiro Pro\uff0c\u6ca1\u6709 429 \u9519\u8bef\u3002", "Chinese", "I have Kiro Pro, no 429 error."), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Please help me fix the account login problem because the button keeps failing after refresh.", "\u8fd9\u4e2a\u8d26\u53f7\u767b\u5f55\u95ee\u9898\u9700\u8981\u4fee\u590d\uff0cplease help\u3002", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Pliny the Liberator just posted about Claude Fable 5.", "Pliny the Liberator \u521a\u521a\u53d1\u5e03\u4e86\u5173\u4e8e Claude Fable 5 \u7684\u5185\u5bb9\u3002", "Chinese"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("The server keeps failing after refresh.", "\u5237\u65b0\u540e\u6d41\u7a0b\u51fa\u73b0 server failing \u95ee\u9898\uff0c\u9700\u8981\u5904\u7406\u3002", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("Please verify the bank response before transfer.", "\u8bf7\u5148\u786e\u8ba4 bank verify \u4fe1\u606f\uff0c\u7136\u540e\u7ee7\u7eed\u5904\u7406\u3002", "Chinese"), true);
    const longRussianSource = "\u042d\u0442\u043e \u043e\u0447\u0435\u043d\u044c \u0434\u043b\u0438\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043f\u0440\u043e \u043e\u043f\u043b\u0430\u0442\u0443, \u0431\u0430\u043d\u043a, \u043a\u0430\u0440\u0442\u0443 \u0438 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0432\u0430\u0436\u043d\u044b\u0445 \u0434\u0435\u0442\u0430\u043b\u0435\u0439, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u043e\u043d\u044f\u0442\u044c.";
    assert.equal(plugin.isInvalidAutoTranslationOutput(longRussianSource, "\u6709\u65b9\u6848", "Chinese"), true);
    const mergedLongSource = "\u041f\u0435\u0440\u0432\u0430\u044f \u0441\u0442\u0440\u043e\u043a\u0430 \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435 \u0438 \u0431\u0430\u043d\u043a\u0435.\n\u0412\u0442\u043e\u0440\u0430\u044f \u0441\u0442\u0440\u043e\u043a\u0430 \u043e \u043a\u0430\u0440\u0442\u0435 \u0438 \u0441\u0445\u0435\u043c\u0435.\n\u0422\u0440\u0435\u0442\u044c\u044f \u0441\u0442\u0440\u043e\u043a\u0430 \u0441 \u0434\u0435\u0442\u0430\u043b\u044f\u043c\u0438 \u0434\u043b\u044f \u0447\u0430\u0442\u0430.";
    assert.equal(plugin.hasMissingAutoTranslationLines(mergedLongSource, "\u7b2c\u4e00\u90e8\u5206\u5728\u8bf4\u652f\u4ed8\u548c\u94f6\u884c\uff0c\u7b2c\u4e8c\u90e8\u5206\u5728\u8bf4\u5361\u548c\u65b9\u6848\uff0c\u7b2c\u4e09\u90e8\u5206\u662f\u7ed9\u804a\u5929\u7684\u7ec6\u8282\u3002", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput(mergedLongSource, "\u7b2c\u4e00\u90e8\u5206\u5728\u8bf4\u652f\u4ed8\u548c\u94f6\u884c\uff0c\u7b2c\u4e8c\u90e8\u5206\u5728\u8bf4\u5361\u548c\u65b9\u6848\uff0c\u7b2c\u4e09\u90e8\u5206\u662f\u7ed9\u804a\u5929\u7684\u7ec6\u8282\u3002", "Chinese"), true);
    const summarizedLongSingleLineSource = "This message has several details about payment, bank transfer, card verification, account access, risk review, timing, user contact, screenshots, retry steps, and the exact reason why the operation failed after the system refreshed. It should be translated as a complete Discord message, not reduced to one vague summary.";
    assert.equal(plugin.isInvalidAutoTranslationOutput(summarizedLongSingleLineSource, "\u8fd9\u6761\u6d88\u606f\u5728\u8bf4\u652f\u4ed8\u95ee\u9898\u3002", "Chinese"), true);
    const longTenSentenceSource = [
        "The payment request failed after the bank returned a delayed verification response.",
        "The card check included a temporary risk status and a second confirmation step.",
        "The user attached a screenshot showing the refresh time and the error message.",
        "The account access token expired before the retry button finished loading.",
        "The operator needs to contact support before changing the transfer amount.",
        "The next scan should keep the original order number and the same bank route.",
        "The server log says the request was accepted but the callback never arrived.",
        "The message also mentions timing, evidence, risk review, and manual recovery.",
        "The final note explains who should continue the process and when to retry.",
        "The translator must preserve these details instead of reducing them to a summary."
    ].join(" ");
    const fourSentenceChineseSummaryOver180HanChars = [
        "\u8fd9\u6bb5\u5185\u5bb9\u4e3b\u8981\u5728\u8bf4\u652f\u4ed8\u8bf7\u6c42\u3001\u94f6\u884c\u54cd\u5e94\u3001\u5361\u9a8c\u8bc1\u548c\u8d26\u6237\u8bbf\u95ee\u7684\u95ee\u9898\uff0c\u9700\u8981\u7ee7\u7eed\u68c0\u67e5\u5904\u7406",
        "\u5176\u4e2d\u63d0\u5230\u4e86\u622a\u56fe\u3001\u5237\u65b0\u65f6\u95f4\u3001\u9519\u8bef\u4fe1\u606f\u548c\u91cd\u8bd5\u6309\u94ae\u52a0\u8f7d\u8fc7\u7a0b\uff0c\u8fd9\u4e9b\u90fd\u548c\u5f53\u524d\u6d41\u7a0b\u6709\u5173",
        "\u540e\u9762\u8fd8\u8bf4\u5230\u9700\u8981\u8054\u7cfb\u652f\u6301\u3001\u4fdd\u7559\u539f\u59cb\u8ba2\u5355\u4fe1\u606f\u548c\u94f6\u884c\u8def\u7531\uff0c\u5e76\u7b49\u5f85\u56de\u8c03\u7ed3\u679c",
        "\u6574\u4f53\u6765\u770b\u8fd9\u662f\u4e00\u6761\u8f83\u957f\u7684\u6d41\u7a0b\u8bf4\u660e\uff0c\u9700\u8981\u5b8c\u6574\u7ffb\u8bd1\u800c\u4e0d\u662f\u53ea\u7ed9\u51fa\u5927\u6982\u6458\u8981"
    ].join("\u3002");
    assert.equal(plugin.isInvalidAutoTranslationOutput(longTenSentenceSource, fourSentenceChineseSummaryOver180HanChars, "Chinese"), true);
    const undercoveredMultilineSource = "This first line explains the payment status, bank response, card verification, and the exact reason the order failed.\nThis second line explains the retry timing, account access, screenshot evidence, and who should be contacted next.";
    assert.equal(plugin.isInvalidAutoTranslationOutput(undercoveredMultilineSource, "\u7b2c\u4e00\u884c\u89e3\u91ca\u652f\u4ed8\u72b6\u6001\u3001\u94f6\u884c\u54cd\u5e94\u3001\u5361\u9a8c\u8bc1\u548c\u8ba2\u5355\u5931\u8d25\u7684\u539f\u56e0\u3002\n\u597d", "Chinese"), true);
    const anchorMultilineSource = "The first line explains the payment status and bank response.\nThe second line explains the retry timing and screenshot evidence.\nThe third line contains OTP 829144 from BankNova transfer ID TRX-4452 and must not be skipped.";
    assert.equal(plugin.isInvalidAutoTranslationOutput(anchorMultilineSource, "\u7b2c\u4e00\u884c\u89e3\u91ca\u652f\u4ed8\u72b6\u6001\u548c\u94f6\u884c\u54cd\u5e94\u3002\n\u7b2c\u4e8c\u884c\u89e3\u91ca\u91cd\u8bd5\u65f6\u95f4\u548c\u622a\u56fe\u8bc1\u636e\u3002\n\u7b2c\u4e09\u884c\u4e5f\u662f\u7c7b\u4f3c\u7684\u6d41\u7a0b\u4fe1\u606f\uff0c\u6574\u4f53\u9700\u8981\u7ee7\u7eed\u5904\u7406\u3002", "Chinese"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("привет", "A", "Chinese"), true);
    plugin.settings.translation.targetLanguage = "英语";
    assert.equal(plugin.shouldAutoTranslateText("Are you Indian? Can you help me scan UPI", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("who had access to naver pay or kakaopay? can it be unlimited payment like earlier of gopay?", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("but now problem with getting QR", "Chinese"), true);
    assert.equal(plugin.shouldAutoTranslateText("hello"), false);
    assert.equal(plugin.isTargetLanguageDominantBySentence("\u4f60\u597d", "Chinese"), false);
    assert.equal(plugin.isTargetLanguageDominantBySentence("\u4f60\u597d", "Chinese", { allowPureTarget: true }), true);
    assert.equal(plugin.shouldAutoTranslateText("canal de soporte and help"), true);
    assert.equal(plugin.shouldAutoTranslateText("भारत में इसे कैसे करें"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("नमस्ते भाई", "Hello bro", "英语"), false);
    assert.equal(plugin.isInvalidAutoTranslationOutput("hola", "hola amigo", "英语"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("bonjour", "bonjour mon ami", "英语"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("¿Qué haces?", "What are you doing?", "英语"), false);
    assert.ok(plugin.getPromptTemplates("polish").length >= 3);
    assert.ok(plugin.getPromptTemplates("translation").length >= 2);
    assert.equal(plugin.getPromptTemplates("polish")[0].serial, "001");
    assert.equal(plugin.getPromptTemplateLabel(plugin.getPromptTemplates("polish")[0]), "001 · 自然聊天润色");
    assert.match(plugin.getPromptTemplateSearchText(plugin.getPromptTemplates("polish")[0]), /001/);
    assert.match(plugin.getPromptTemplateSearchText(plugin.getPromptTemplates("polish")[0]), /自然聊天润色/);

    const templateCount = plugin.getPromptTemplates("polish").length;
    plugin.savePromptTemplate("polish", "Test Template", "Test prompt in {targetLanguage}");
    assert.equal(plugin.getPromptTemplates("polish").length, templateCount + 1);
    const savedTemplateId = plugin.settings.polish.activePromptTemplate;
    const savedTemplate = plugin.getPromptTemplates("polish").find(item => item.id === savedTemplateId);
    assert.equal(savedTemplate.serial, String(templateCount + 1).padStart(3, "0"));
    plugin.settings.polish.prompt = "Edited prompt";
    plugin.updatePromptTemplate("polish", savedTemplateId, plugin.settings.polish.prompt);
    plugin.applyPromptTemplate("polish", savedTemplateId);
    assert.equal(plugin.settings.polish.prompt, "Edited prompt");
    plugin.deletePromptTemplate("polish", savedTemplateId);
    assert.equal(plugin.getPromptTemplates("polish").length, templateCount);

    plugin.settings.polish.model = "custom-model";
    plugin.applyProviderPreset("polish", "deepseek");
    assert.equal(plugin.settings.polish.model, "deepseek-v4-flash");

    plugin.settings.polish.apiKey = "sk-polish";
    plugin.settings.polish.endpoint = "https://api.example.test/v1/chat/completions";
    plugin.settings.polish.model = "polish-model";
    plugin.settings.polish.sourceLanguage = "auto";
    plugin.settings.polish.targetLanguage = "德语";
    plugin.settings.polish.temperature = 0.7;
    plugin.settings.polish.maxTokens = 500;
    plugin.settings.polish.prompt = "把输入润色得自然一点，输出为 {targetLanguage}。";
    const fakeStatus = { dataset: { daitKind: "polish" } };
    plugin.setApiStatus(fakeStatus, "success", plugin.t("apiStatusSuccess"), "");
    assert.equal(fakeStatus.className, "dait-api-status dait-api-status-success");
    assert.deepEqual(plugin.getApiStatus("polish"), { state: "success", message: "" });
    plugin.resetApiStatus("polish");
    assert.deepEqual(plugin.getApiStatus("polish"), { state: "untested", message: "" });

    plugin.settings.translation.apiKey = "sk-translation";
    plugin.settings.translation.endpoint = "https://api.translate.test/v1/chat/completions";
    plugin.settings.translation.model = "translation-model";
    plugin.settings.translation.sourceLanguage = "法语";
    plugin.settings.translation.targetLanguage = "英语";
    plugin.settings.translation.temperature = 0.1;
    plugin.settings.translation.maxTokens = 900;
    plugin.settings.translation.prompt = "自然翻译为 {{targetLanguage}}。";

    const polishRequest = plugin.buildModelRequest("polish", "hello world");
    assert.equal(polishRequest.endpoint, "https://api.example.test/v1/chat/completions");
    assert.equal(polishRequest.request.headers.Authorization, "Bearer sk-polish");
    assert.equal(polishRequest.request.body.model, "polish-model");
    assert.equal(polishRequest.request.body.temperature, 0.7);
    assert.equal(polishRequest.request.body.max_tokens, 500);
    assert.deepEqual(polishRequest.request.body.thinking, { type: "disabled" });
    assert.equal(polishRequest.request.body.messages[0].role, "system");
    assert.match(polishRequest.request.body.messages[0].content, /user template as behavior instructions/);
    assert.match(polishRequest.request.body.messages[0].content, /Input language: auto-detect/);
    assert.match(polishRequest.request.body.messages[0].content, /Output language: 德语/);
    assert.match(polishRequest.request.body.messages[0].content, /把输入润色得自然一点/);
    assert.equal(polishRequest.request.body.messages[1].content, "hello world");

    const polishTestRequest = plugin.buildConnectionTestRequest("polish");
    assert.equal(polishTestRequest.endpoint, "https://api.example.test/v1/chat/completions");
    assert.equal(polishTestRequest.request.headers.Authorization, "Bearer sk-polish");
    assert.equal(polishTestRequest.request.body.model, "polish-model");
    assert.equal(polishTestRequest.request.body.temperature, 0);
    assert.equal(polishTestRequest.request.body.max_tokens, 32);
    assert.deepEqual(polishTestRequest.request.body.thinking, { type: "disabled" });
    assert.equal(polishTestRequest.request.body.messages[0].content, "Reply with OK only.");

    plugin.settings.polish.enableThinking = true;
    const polishThinkingRequest = plugin.buildModelRequest("polish", "hello world");
    assert.deepEqual(polishThinkingRequest.request.body.thinking, { type: "enabled" });
    assert.equal("temperature" in polishThinkingRequest.request.body, false);
    plugin.settings.polish.enableThinking = false;

    const translationRequest = plugin.buildModelRequest("translation", "bonjour");
    assert.equal(translationRequest.endpoint, "https://api.translate.test/v1/chat/completions");
    assert.equal(translationRequest.request.headers.Authorization, "Bearer sk-translation");
    assert.equal(translationRequest.request.body.model, "translation-model");
    assert.equal(translationRequest.request.body.temperature, 0.1);
    assert.equal(translationRequest.request.body.max_tokens, 900);
    assert.deepEqual(translationRequest.request.body.thinking, { type: "disabled" });
    assert.match(translationRequest.request.body.messages[0].content, /Input language: 法语/);
    assert.match(translationRequest.request.body.messages[0].content, /Output language: 英语/);
    assert.match(translationRequest.request.body.messages[0].content, /自然翻译为 英语/);
    assert.equal(translationRequest.request.body.messages[1].content, "bonjour");

    plugin.settings.polish.targetLanguage = "繁体中文";
    plugin.settings.polish.prompt = "Rewrite in {targetLanguage}.";
    const traditionalPolishRequest = plugin.buildModelRequest("polish", "日本人的军国主义");
    assert.match(traditionalPolishRequest.request.body.messages[0].content, /Output language: Traditional Chinese/);
    assert.match(traditionalPolishRequest.request.body.messages[0].content, /do not use Simplified Chinese/);
    assert.match(traditionalPolishRequest.request.body.messages[0].content, /Rewrite in Traditional Chinese/);

    const sakuraPlugin = new Plugin();
    sakuraPlugin.settings.translation.provider = "sakuraLocal";
    sakuraPlugin.settings.translation.apiKey = "";
    sakuraPlugin.settings.translation.endpoint = "";
    sakuraPlugin.settings.translation.model = "";
    assert.equal(sakuraPlugin.hasUsableApiConfig("translation"), true);
    const sakuraRequest = sakuraPlugin.buildModelRequest("translation", "hello local");
    assert.equal(sakuraRequest.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
    assert.equal(sakuraRequest.request.headers.Authorization, undefined);
    assert.equal(sakuraRequest.request.body.model, "local-model");
    assert.equal(
        sakuraPlugin.getLocalProviderModelsEndpoint("http://127.0.0.1:8080/v1/chat/completions"),
        "http://127.0.0.1:8080/v1/models"
    );
    assert.equal(
        sakuraPlugin.parseLocalProviderModelsResponse(JSON.stringify({ data: [{ id: "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf" }] })),
        "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf"
    );
    assert.equal(sakuraPlugin.getDiagnosticModelLabel("C:\\models\\HY-MT1.5-1.8B-Q4_K_M_2.gguf"), "HY-MT1.5-1.8B-Q4_K_M_2.gguf");
    sakuraPlugin.setCachedLocalProviderDetectedModel(sakuraPlugin.settings.translation, "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf");
    const sakuraDetectedRequest = sakuraPlugin.buildModelRequest("translation", "hello detected local");
    assert.equal(sakuraDetectedRequest.request.body.model, "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf");
    sakuraPlugin.settings.translation.model = "manual-local.gguf";
    const sakuraExplicitRequest = sakuraPlugin.buildModelRequest("translation", "hello explicit local");
    assert.equal(sakuraExplicitRequest.request.body.model, "manual-local.gguf");
    sakuraPlugin.settings.translation.model = "";
    const sakuraTestRequest = sakuraPlugin.buildConnectionTestRequest("translation");
    assert.equal(sakuraTestRequest.request.headers.Authorization, undefined);
    sakuraPlugin.settings.translation.apiKey = "local-secret";
    const sakuraKeyedRequest = sakuraPlugin.buildModelRequest("translation", "hello keyed local");
    assert.equal(sakuraKeyedRequest.request.headers.Authorization, "Bearer local-secret");
    sakuraPlugin.settings.translation.apiKey = "";
    sakuraPlugin.applyProviderPreset("translation", "sakuraLocal");
    assert.equal(sakuraPlugin.settings.translation.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
    assert.equal(sakuraPlugin.settings.translation.model, "local-model");
    sakuraPlugin.settings.ui.autoTranslateMessages = true;
    sakuraPlugin.settings.ui.autoTranslateConcurrency = 8;
    assert.equal(sakuraPlugin.getAutoTranslateConcurrency(), 8);
    assert.equal(sakuraPlugin.getAutoTranslationRequestBatchSize(), 1);
    shared.longOrdinarySource = longOrdinarySource;
    shared.explanatoryNoiseOutput = explanatoryNoiseOutput;
    shared.promptLeakOutput = promptLeakOutput;
}

module.exports = { title: "Scroll stability, diagnostics & output guard", run };
