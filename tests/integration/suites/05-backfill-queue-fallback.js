"use strict";

// Artifact regression suite: Visible backfill, queue scheduling & fallback policies
function run(harness, shared) {
    const { assert, Plugin } = harness;

    const visibleBackfillPlugin = new Plugin();
    visibleBackfillPlugin.settings.translation.enabled = true;
    visibleBackfillPlugin.settings.ui.autoTranslateMessages = true;
    visibleBackfillPlugin.settings.translation.apiKey = "sk-test";
    visibleBackfillPlugin.settings.translation.targetLanguage = "Chinese";
    visibleBackfillPlugin.settings.ui.diagnosticsEnabled = true;
    visibleBackfillPlugin.isElementVisibleInViewport = () => true;
    visibleBackfillPlugin.getMessageContentElement = message => message.content;
    visibleBackfillPlugin.getCachedElementText = content => content.text;
    visibleBackfillPlugin.getElementText = content => content.text;
    visibleBackfillPlugin.getMessageIdentity = message => `visible-backfill:${message.id}`;
    visibleBackfillPlugin.shouldAutoTranslateText = () => true;
    visibleBackfillPlugin.hasCurrentTranslationLine = () => false;
    visibleBackfillPlugin.getAutoTranslateBatchSize = () => 1;
    visibleBackfillPlugin.getAutoTranslateQueueLimit = () => 8;
    let visibleBackfillDrainCount = 0;
    let visibleBackfillRetryDelay = 0;
    visibleBackfillPlugin.drainAutoTranslationQueue = () => { visibleBackfillDrainCount++; };
    visibleBackfillPlugin.scheduleAutoTranslationRetryScan = delay => { visibleBackfillRetryDelay = delay; };
    visibleBackfillPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [
            { id: "a", content: { dataset: {}, isConnected: true, text: "hola uno" }, isConnected: true },
            { id: "b", content: { dataset: {}, isConnected: true, text: "hola dos" }, isConnected: true },
            { id: "c", content: { dataset: {}, isConnected: true, text: "hola tres" }, isConnected: true }
        ],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(visibleBackfillPlugin.autoTranslationQueue.length, 3);
    assert.equal(visibleBackfillDrainCount, 1);
    assert.equal(visibleBackfillRetryDelay, 0);
    const visibleBackfillLog = visibleBackfillPlugin.diagnosticLogs.find(entry => entry.action === "auto.scan");
    assert.equal(visibleBackfillLog.meta.visibleDeferred, 0);

    const mixedChineseQueuePlugin = new Plugin();
    mixedChineseQueuePlugin.settings.translation.enabled = true;
    mixedChineseQueuePlugin.settings.ui.autoTranslateMessages = true;
    mixedChineseQueuePlugin.settings.translation.apiKey = "sk-test";
    mixedChineseQueuePlugin.settings.translation.targetLanguage = "Chinese";
    mixedChineseQueuePlugin.isElementVisibleInViewport = () => true;
    mixedChineseQueuePlugin.getMessageContentElement = message => message.content;
    mixedChineseQueuePlugin.getCachedElementText = content => content.text;
    mixedChineseQueuePlugin.hasCurrentTranslationLine = () => false;
    let mixedChineseDrainCount = 0;
    mixedChineseQueuePlugin.drainAutoTranslationQueue = () => { mixedChineseDrainCount++; };
    mixedChineseQueuePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ content: { dataset: {}, text: "\u6211\u7684bug team\u554a" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(mixedChineseQueuePlugin.autoTranslationQueue.length, 0);
    assert.equal(mixedChineseDrainCount, 1);

    const previewQueuePlugin = new Plugin();
    previewQueuePlugin.settings.translation.enabled = true;
    previewQueuePlugin.settings.ui.autoTranslateMessages = true;
    previewQueuePlugin.settings.translation.apiKey = "sk-test";
    previewQueuePlugin.settings.translation.targetLanguage = "姹夎";
    previewQueuePlugin.isElementVisibleInViewport = () => true;
    previewQueuePlugin.getMessageContentElement = message => message.content;
    previewQueuePlugin.getReplyPreviewElements = message => [message.preview];
    previewQueuePlugin.getCachedElementText = content => content.text;
    previewQueuePlugin.shouldAutoTranslateText = () => true;
    previewQueuePlugin.hasCurrentTranslationLine = () => false;
    previewQueuePlugin.drainAutoTranslationQueue = () => {};
    const previewMessage = {
        isConnected: true,
        content: { dataset: {}, isConnected: true, text: "main foreign text" },
        preview: { dataset: {}, isConnected: true, text: "quoted foreign text" }
    };
    previewQueuePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [previewMessage],
        contentByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(previewQueuePlugin.autoTranslationQueue.length, 2);
    assert.equal(previewQueuePlugin.autoTranslationQueue[0].targetKind, "message");
    assert.equal(previewQueuePlugin.autoTranslationQueue[1].targetKind, "reply-preview");
    assert.deepEqual(previewQueuePlugin.autoTranslationQueue[1].textOptions, { includeReplyPreview: true });

    const previewParent = {
        contains: node => node?.name === "child",
        closest: selector => selector.includes("repliedTextPreview") ? previewParent : null,
        name: "parent"
    };
    const previewChild = {
        contains: () => false,
        closest: selector => selector.includes("repliedTextPreview") ? previewParent : null,
        name: "child"
    };
    const previewDedupPlugin = new Plugin();
    const dedupedPreviewTargets = previewDedupPlugin.getReplyPreviewElements({
        querySelectorAll: () => [previewParent, previewChild]
    });
    assert.deepEqual(dedupedPreviewTargets, [previewChild]);
    assert.deepEqual(previewDedupPlugin.getReplyPreviewElements({
        querySelector: () => null,
        querySelectorAll: () => { throw new Error("querySelectorAll should not run without a reply container"); }
    }), []);

    const previewReadyPlugin = new Plugin();
    previewReadyPlugin.isElementVisibleInViewport = () => true;
    previewReadyPlugin.hasCurrentTranslationLine = () => false;
    previewReadyPlugin.getElementText = (content, options) => options?.includeReplyPreview ? content.previewText : content.text;
    assert.equal(previewReadyPlugin.isAutoTranslationQueueItemReady({
        messageNode: { isConnected: true },
        content: { isConnected: true, previewText: "quoted foreign text", text: "" },
        text: "quoted foreign text",
        textOptions: { includeReplyPreview: true },
        cacheKey: "auto-preview"
    }), true);

    const prefetchPlugin = new Plugin();
    prefetchPlugin.isElementVisibleInViewport = () => false;
    prefetchPlugin.isElementNearViewport = () => true;
    prefetchPlugin.getMessageContentElement = message => message.content;
    prefetchPlugin.getReplyPreviewElements = () => [];
    prefetchPlugin.getCachedElementText = content => content.text;
    prefetchPlugin.hasCurrentTranslationLine = () => false;
    prefetchPlugin.getElementText = content => content.text;
    const prefetchMessage = {
        isConnected: true,
        content: { isConnected: true, dataset: {}, text: "texto extranjero" }
    };
    assert.equal(prefetchPlugin.getAutoTranslationTargets(prefetchMessage, {
        contentByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    }).length, 1);
    assert.equal(prefetchPlugin.isAutoTranslationQueueItemReady({
        messageNode: prefetchMessage,
        content: prefetchMessage.content,
        text: "texto extranjero",
        cacheKey: "auto-prefetch"
    }), true);
    const nestedPrefetchReadyPlugin = new Plugin();
    nestedPrefetchReadyPlugin.isElementVisibleInViewport = element => element?.visible === true;
    nestedPrefetchReadyPlugin.isElementNearViewport = element => element?.near === true;
    nestedPrefetchReadyPlugin.hasCurrentTranslationLine = () => false;
    nestedPrefetchReadyPlugin.getElementText = content => content.text;
    const nestedPrefetchContent = { isConnected: true, visible: false, near: false, text: "nested prefetch" };
    const nestedPrefetchMessage = {
        isConnected: true,
        visible: false,
        near: true,
        contains: node => node === nestedPrefetchContent
    };
    assert.equal(nestedPrefetchReadyPlugin.isAutoTranslationQueueItemReady({
        messageNode: nestedPrefetchMessage,
        content: nestedPrefetchContent,
        text: "nested prefetch",
        cacheKey: "nested-prefetch"
    }), true);
    let prefetchLoadingRendered = false;
    prefetchPlugin.renderTranslationLoading = () => { prefetchLoadingRendered = true; };
    prefetchPlugin.addAutoTranslationPendingTarget("auto-prefetch", {
        messageNode: prefetchMessage,
        content: prefetchMessage.content,
        text: "texto extranjero",
        cacheKey: "auto-prefetch"
    });
    prefetchPlugin.renderPendingAutoTranslationLoading({ cacheKey: "auto-prefetch" });
    assert.equal(prefetchLoadingRendered, false);

    const legacyReadyPlugin = new Plugin();
    legacyReadyPlugin.isAutoTranslationTargetInScanRange = () => true;
    legacyReadyPlugin.getElementText = content => content.text;
    const legacyReadyOptions = legacyReadyPlugin.getAutoTranslationOptions();
    const legacyReadyPrimaryKey = legacyReadyPlugin.getTranslationCacheKey("bonjour", legacyReadyOptions);
    const legacyReadyAliasKey = legacyReadyPlugin.getLegacyTranslationCacheKey("bonjour", legacyReadyOptions);
    const legacyReadyLine = {
        classList: { contains: () => false },
        dataset: {
            daitCacheKey: legacyReadyPlugin.getTextFingerprint(legacyReadyAliasKey),
            daitMode: "auto",
            daitSourceKey: legacyReadyPlugin.getTextFingerprint("bonjour")
        },
        remove: () => { throw new Error("legacy ready line should not be removed"); }
    };
    const legacyReadyContent = {
        isConnected: true,
        text: "bonjour",
        dataset: { daitOwner: "owner-legacy-ready" },
        parentElement: { querySelectorAll: () => [legacyReadyLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => legacyReadyLine
    };
    assert.equal(legacyReadyPlugin.isAutoTranslationTargetReady({
        messageNode: { isConnected: true },
        content: legacyReadyContent,
        text: "bonjour",
        cacheKey: legacyReadyPrimaryKey,
        requestOptions: legacyReadyOptions
    }), false);

    const priorityQueuePlugin = new Plugin();
    priorityQueuePlugin.settings.ui.autoTranslateMessages = true;
    priorityQueuePlugin.getViewportPriority = element => element?.priority ?? 9999;
    priorityQueuePlugin.clearPendingAutoTranslationItem = () => {};
    const lowPriorityItem = {
        messageNode: { priority: 900 },
        content: { dataset: {}, priority: 900 },
        text: "low",
        cacheKey: "low",
        requestOptions: priorityQueuePlugin.getAutoTranslationOptions()
    };
    const highPriorityItem = {
        messageNode: { priority: 10 },
        content: { dataset: {}, priority: 10 },
        text: "high",
        cacheKey: "high",
        requestOptions: priorityQueuePlugin.getAutoTranslationOptions()
    };
    priorityQueuePlugin.enqueueAutoTranslationItem(lowPriorityItem);
    priorityQueuePlugin.enqueueAutoTranslationItem(highPriorityItem);
    assert.deepEqual(priorityQueuePlugin.autoTranslationQueue.map(item => item.cacheKey), ["high", "low"]);

    const replacementPlugin = new Plugin();
    replacementPlugin.settings.ui.autoTranslateMessages = true;
    replacementPlugin.getViewportPriority = element => element?.priority ?? 9999;
    let replacedCacheKey = "";
    replacementPlugin.clearPendingAutoTranslationItem = item => { replacedCacheKey = item.cacheKey; };
    replacementPlugin.enqueueAutoTranslationItem(lowPriorityItem);
    replacementPlugin.autoTranslationInFlightItems = replacementPlugin.getAutoTranslateQueueLimit() - 1;
    assert.equal(replacementPlugin.makeRoomForAutoTranslationItem(highPriorityItem, replacementPlugin.getAutoTranslateQueueLimit()), true);
    assert.equal(replacedCacheKey, "low");
    assert.equal(replacementPlugin.autoTranslationQueue.length, 0);
    assert.equal(replacementPlugin.autoTranslationQueuedKeys.has("low"), false);

    const queuePreemptPlugin = new Plugin();
    queuePreemptPlugin.settings.translation.enabled = true;
    queuePreemptPlugin.settings.ui.autoTranslateMessages = true;
    queuePreemptPlugin.settings.translation.apiKey = "sk-test";
    queuePreemptPlugin.settings.translation.targetLanguage = "汉语";
    queuePreemptPlugin.getViewportPriority = element => element?.priority ?? 9999;
    queuePreemptPlugin.isAutoTranslationTargetInScanRange = () => true;
    queuePreemptPlugin.isElementVisibleInViewport = () => true;
    queuePreemptPlugin.getMessageContentElement = message => message.content;
    queuePreemptPlugin.getReplyPreviewElements = () => [];
    queuePreemptPlugin.getCachedElementText = content => content.text;
    queuePreemptPlugin.shouldAutoTranslateText = () => true;
    queuePreemptPlugin.hasCurrentTranslationLine = () => false;
    queuePreemptPlugin.drainAutoTranslationQueue = () => {};
    queuePreemptPlugin.renderTranslation = () => {};
    queuePreemptPlugin.translationCache.clear();
    queuePreemptPlugin.clearPendingAutoTranslationItem = item => { replacedCacheKey = item.cacheKey; };
    queuePreemptPlugin.enqueueAutoTranslationItem(lowPriorityItem);
    queuePreemptPlugin.autoTranslationInFlightItems = queuePreemptPlugin.getAutoTranslateQueueLimit() - 1;
    queuePreemptPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ isConnected: true, priority: 5, content: { dataset: {}, isConnected: true, priority: 5, text: "visible foreign" } }],
        contentByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(queuePreemptPlugin.autoTranslationQueue.length, 1);
    assert.equal(queuePreemptPlugin.autoTranslationQueue[0].text, "visible foreign");
    assert.equal(queuePreemptPlugin.autoTranslationQueuedKeys.has("low"), false);

    const visibleScanBudgetPlugin = new Plugin();
    visibleScanBudgetPlugin.settings.translation.enabled = true;
    visibleScanBudgetPlugin.settings.ui.autoTranslateMessages = true;
    visibleScanBudgetPlugin.settings.translation.apiKey = "sk-test";
    visibleScanBudgetPlugin.getAutoTranslateBatchSize = () => 2;
    visibleScanBudgetPlugin.getAutoTranslateQueueLimit = () => 10;
    visibleScanBudgetPlugin.getViewportPriority = element => element?.priority ?? 9999;
    visibleScanBudgetPlugin.isElementVisibleInViewport = element => element?.visible === true;
    visibleScanBudgetPlugin.isAutoTranslationTargetInScanRange = () => true;
    visibleScanBudgetPlugin.getMessageContentElement = message => message.content;
    visibleScanBudgetPlugin.getCachedElementText = content => content.text;
    visibleScanBudgetPlugin.shouldAutoTranslateText = () => true;
    visibleScanBudgetPlugin.hasCurrentTranslationLine = () => false;
    visibleScanBudgetPlugin.drainAutoTranslationQueue = () => {};
    const visibleScanMessages = Array.from({ length: 5 }, (_, index) => ({
        isConnected: true,
        visible: true,
        priority: index,
        content: { dataset: {}, isConnected: true, visible: true, priority: index, text: `visible scan ${index}` }
    }));
    visibleScanBudgetPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: visibleScanMessages,
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(visibleScanBudgetPlugin.autoTranslationQueue.length, 5);

    const contentVisibleFallbackPlugin = new Plugin();
    contentVisibleFallbackPlugin.settings.translation.enabled = true;
    contentVisibleFallbackPlugin.settings.ui.autoTranslateMessages = true;
    contentVisibleFallbackPlugin.settings.translation.apiKey = "sk-test";
    contentVisibleFallbackPlugin.getViewportPriority = element => element?.priority ?? 9999;
    contentVisibleFallbackPlugin.isElementVisibleInViewport = element => element?.visible === true;
    contentVisibleFallbackPlugin.isElementVisibleForScan = element => element?.visible === true;
    contentVisibleFallbackPlugin.isElementNearViewport = element => element?.near === true;
    contentVisibleFallbackPlugin.getCachedElementText = content => content.text;
    contentVisibleFallbackPlugin.shouldAutoTranslateText = () => true;
    contentVisibleFallbackPlugin.hasCurrentTranslationLine = () => false;
    contentVisibleFallbackPlugin.drainAutoTranslationQueue = () => {};
    const contentVisibleFallbackContent = {
        dataset: {},
        isConnected: true,
        visible: true,
        priority: 4,
        text: "visible inner foreign text",
        closest: selector => String(selector || "").includes("chat-messages") ? contentVisibleFallbackMessage : null
    };
    const contentVisibleFallbackMessage = {
        isConnected: true,
        visible: false,
        priority: 9999,
        getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
        querySelectorAll: selector => String(selector || "").includes("messageContent") ? [contentVisibleFallbackContent] : [],
        contains: node => node === contentVisibleFallbackContent
    };
    assert.equal(contentVisibleFallbackPlugin.getScanMessageNodes([contentVisibleFallbackMessage], {
        rectByElement: new Map(),
        visibleByElement: new Map(),
        nearByElement: new Map(),
        priorityByElement: new Map(),
        scanRangeElements: new Set()
    }).length, 1);
    contentVisibleFallbackPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [contentVisibleFallbackMessage],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map(),
        scanRangeElements: new Set([contentVisibleFallbackMessage])
    });
    assert.equal(contentVisibleFallbackPlugin.autoTranslationQueue.length, 1);
    assert.equal(contentVisibleFallbackPlugin.autoTranslationQueue[0].text, "visible inner foreign text");

    const prefetchScanBudgetPlugin = new Plugin();
    prefetchScanBudgetPlugin.settings.translation.enabled = true;
    prefetchScanBudgetPlugin.settings.ui.autoTranslateMessages = true;
    prefetchScanBudgetPlugin.settings.ui.autoTranslatePrefetch = true;
    prefetchScanBudgetPlugin.settings.translation.apiKey = "sk-test";
    prefetchScanBudgetPlugin.getAutoTranslateBatchSize = () => 2;
    prefetchScanBudgetPlugin.getAutoTranslateQueueLimit = () => 10;
    prefetchScanBudgetPlugin.getViewportPriority = element => element?.priority ?? 9999;
    prefetchScanBudgetPlugin.isElementVisibleInViewport = () => false;
    prefetchScanBudgetPlugin.isAutoTranslationTargetInScanRange = () => true;
    prefetchScanBudgetPlugin.getMessageContentElement = message => message.content;
    prefetchScanBudgetPlugin.getCachedElementText = content => content.text;
    prefetchScanBudgetPlugin.shouldAutoTranslateText = () => true;
    prefetchScanBudgetPlugin.hasCurrentTranslationLine = () => false;
    prefetchScanBudgetPlugin.drainAutoTranslationQueue = () => {};
    const prefetchScanMessages = Array.from({ length: 5 }, (_, index) => ({
        isConnected: true,
        visible: false,
        priority: 100000 + index,
        content: { dataset: {}, isConnected: true, visible: false, priority: 100000 + index, text: `prefetch scan ${index}` }
    }));
    prefetchScanBudgetPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: prefetchScanMessages,
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(prefetchScanBudgetPlugin.autoTranslationQueue.length, 2);

    const prefetchCapPlugin = new Plugin();
    prefetchCapPlugin.settings.ui.autoTranslateMessages = true;
    prefetchCapPlugin.settings.ui.autoTranslatePrefetch = true;
    prefetchCapPlugin.settings.ui.autoTranslateConcurrency = 2;
    prefetchCapPlugin.getViewportPriority = element => element?.priority ?? 9999;
    prefetchCapPlugin.isAutoTranslationTargetInScanRange = () => true;
    prefetchCapPlugin.isElementVisibleInViewport = item => item?.visible === true;
    prefetchCapPlugin.hasCurrentTranslationLine = () => false;
    prefetchCapPlugin.getElementText = content => content.text;
    let prefetchStarted = 0;
    prefetchCapPlugin.autoTranslateQueuedMessage = item => {
        prefetchStarted++;
        item.started = true;
    };
    const prefetchQueuedItem = {
        messageNode: { isConnected: true, visible: false, priority: 120000 },
        content: { dataset: {}, isConnected: true, visible: false, priority: 120000, text: "prefetch foreign" },
        text: "prefetch foreign",
        cacheKey: "prefetch-cap",
        requestOptions: prefetchCapPlugin.getAutoTranslationOptions()
    };
    prefetchCapPlugin.enqueueAutoTranslationItem(prefetchQueuedItem);
    prefetchCapPlugin.addAutoTranslationPendingTarget(prefetchQueuedItem.cacheKey, prefetchQueuedItem);
    prefetchCapPlugin.autoTranslationInFlight = 1;
    prefetchCapPlugin.autoTranslationPrefetchInFlight = 1;
    prefetchCapPlugin.markAutoTranslationInFlightItem({ cacheKey: "prefetch-cap-in-flight", requestOptions: prefetchCapPlugin.getAutoTranslationOptions() });
    prefetchCapPlugin.drainAutoTranslationQueue();
    assert.equal(prefetchStarted, 0);
    assert.equal(prefetchCapPlugin.autoTranslationQueue.length, 1);
    assert.equal(prefetchCapPlugin.autoTranslationQueuedKeys.has("prefetch-cap"), true);

    const visibleReservePlugin = new Plugin();
    visibleReservePlugin.settings.ui.autoTranslateMessages = true;
    visibleReservePlugin.settings.ui.autoTranslateConcurrency = 2;
    visibleReservePlugin.getViewportPriority = element => element?.priority ?? 9999;
    visibleReservePlugin.isAutoTranslationTargetInScanRange = () => true;
    visibleReservePlugin.isElementVisibleInViewport = item => item?.visible === true;
    visibleReservePlugin.hasCurrentTranslationLine = () => false;
    visibleReservePlugin.getElementText = content => content.text;
    let visibleStarted = 0;
    visibleReservePlugin.autoTranslateQueuedMessage = item => {
        visibleStarted++;
        item.started = true;
    };
    const visibleReserveItem = {
        messageNode: { isConnected: true, visible: true, priority: 3 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 3, text: "visible foreign" },
        text: "visible foreign",
        cacheKey: "visible-reserve",
        requestOptions: visibleReservePlugin.getAutoTranslationOptions()
    };
    visibleReservePlugin.enqueueAutoTranslationItem(visibleReserveItem);
    visibleReservePlugin.addAutoTranslationPendingTarget(visibleReserveItem.cacheKey, visibleReserveItem);
    visibleReservePlugin.autoTranslationInFlight = 1;
    visibleReservePlugin.autoTranslationPrefetchInFlight = 1;
    visibleReservePlugin.markAutoTranslationInFlightItem({ cacheKey: "visible-reserve-prefetch-in-flight", requestOptions: visibleReservePlugin.getAutoTranslationOptions() });
    visibleReservePlugin.drainAutoTranslationQueue();
    assert.equal(visibleStarted, 1);
    assert.equal(visibleReservePlugin.autoTranslationInFlight, 2);
    assert.equal(visibleReservePlugin.autoTranslationPrefetchInFlight, 1);

    const prefetchDisabledDrainPlugin = new Plugin();
    prefetchDisabledDrainPlugin.settings.ui.autoTranslateMessages = true;
    prefetchDisabledDrainPlugin.settings.ui.autoTranslatePrefetch = false;
    prefetchDisabledDrainPlugin.isElementVisibleInViewport = item => item?.visible === true;
    prefetchDisabledDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
    prefetchDisabledDrainPlugin.hasCurrentTranslationLine = () => false;
    prefetchDisabledDrainPlugin.getElementText = content => content.text;
    let prefetchDisabledStarted = 0;
    let prefetchDisabledRemoved = 0;
    prefetchDisabledDrainPlugin.autoTranslateQueuedMessage = () => { prefetchDisabledStarted++; };
    prefetchDisabledDrainPlugin.removeAutoTranslationLoadingForItem = () => { prefetchDisabledRemoved++; };
    const prefetchDisabledQueuedItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "was visible before scroll" },
        text: "was visible before scroll",
        cacheKey: "prefetch-disabled-drain",
        requestOptions: prefetchDisabledDrainPlugin.getAutoTranslationOptions()
    };
    prefetchDisabledDrainPlugin.enqueueAutoTranslationItem(prefetchDisabledQueuedItem);
    prefetchDisabledDrainPlugin.addAutoTranslationPendingTarget(prefetchDisabledQueuedItem.cacheKey, prefetchDisabledQueuedItem);
    prefetchDisabledDrainPlugin.drainAutoTranslationQueue();
    assert.equal(prefetchDisabledStarted, 0);
    assert.equal(prefetchDisabledRemoved, 1);
    assert.equal(prefetchDisabledDrainPlugin.autoTranslationQueue.length, 0);
    assert.equal(prefetchDisabledDrainPlugin.autoTranslationQueuedKeys.has(prefetchDisabledQueuedItem.cacheKey), false);
    assert.equal(prefetchDisabledDrainPlugin.autoTranslationPendingTargets.has(prefetchDisabledQueuedItem.cacheKey), false);

    const googlePrefetchDisabledDrainPlugin = new Plugin();
    googlePrefetchDisabledDrainPlugin.settings.translation.provider = "googleCloud";
    googlePrefetchDisabledDrainPlugin.settings.googleTranslate.allowPrefetch = false;
    googlePrefetchDisabledDrainPlugin.isElementVisibleInViewport = item => item?.visible === true;
    googlePrefetchDisabledDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
    googlePrefetchDisabledDrainPlugin.hasCurrentTranslationLine = () => false;
    googlePrefetchDisabledDrainPlugin.getElementText = content => content.text;
    let googlePrefetchDisabledStarted = 0;
    googlePrefetchDisabledDrainPlugin.autoTranslateQueuedMessage = () => { googlePrefetchDisabledStarted++; };
    const googlePrefetchDisabledItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "google was visible" },
        text: "google was visible",
        cacheKey: "google-prefetch-disabled-drain",
        requestOptions: googlePrefetchDisabledDrainPlugin.getAutoTranslationOptions()
    };
    googlePrefetchDisabledDrainPlugin.enqueueAutoTranslationItem(googlePrefetchDisabledItem);
    googlePrefetchDisabledDrainPlugin.addAutoTranslationPendingTarget(googlePrefetchDisabledItem.cacheKey, googlePrefetchDisabledItem);
    googlePrefetchDisabledDrainPlugin.drainAutoTranslationQueue();
    assert.equal(googlePrefetchDisabledStarted, 0);
    assert.equal(googlePrefetchDisabledDrainPlugin.autoTranslationQueue.length, 0);
    assert.equal(googlePrefetchDisabledDrainPlugin.autoTranslationQueuedKeys.has(googlePrefetchDisabledItem.cacheKey), false);

    const visibleBehindPrefetchPlugin = new Plugin();
    visibleBehindPrefetchPlugin.settings.ui.autoTranslateConcurrency = 2;
    visibleBehindPrefetchPlugin.settings.ui.autoTranslateMessages = true;
    visibleBehindPrefetchPlugin.settings.ui.autoTranslatePrefetch = true;
    visibleBehindPrefetchPlugin.isElementVisibleInViewport = item => item?.visible === true;
    visibleBehindPrefetchPlugin.isAutoTranslationTargetInScanRange = () => true;
    visibleBehindPrefetchPlugin.hasCurrentTranslationLine = () => false;
    visibleBehindPrefetchPlugin.getElementText = content => content.text;
    let startedBehindPrefetch = "";
    visibleBehindPrefetchPlugin.autoTranslateQueuedMessage = item => {
        startedBehindPrefetch = item.cacheKey;
    };
    const blockedPrefetchItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "blocked prefetch" },
        text: "blocked prefetch",
        cacheKey: "blocked-prefetch",
        requestOptions: visibleBehindPrefetchPlugin.getAutoTranslationOptions()
    };
    const visibleBehindItem = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "visible behind" },
        text: "visible behind",
        cacheKey: "visible-behind",
        requestOptions: visibleBehindPrefetchPlugin.getAutoTranslationOptions()
    };
    visibleBehindPrefetchPlugin.enqueueAutoTranslationItem(blockedPrefetchItem);
    visibleBehindPrefetchPlugin.enqueueAutoTranslationItem(visibleBehindItem);
    visibleBehindPrefetchPlugin.addAutoTranslationPendingTarget(blockedPrefetchItem.cacheKey, blockedPrefetchItem);
    visibleBehindPrefetchPlugin.addAutoTranslationPendingTarget(visibleBehindItem.cacheKey, visibleBehindItem);
    visibleBehindPrefetchPlugin.autoTranslationInFlight = 1;
    visibleBehindPrefetchPlugin.autoTranslationPrefetchInFlight = 1;
    visibleBehindPrefetchPlugin.markAutoTranslationInFlightItem({ cacheKey: "visible-behind-prefetch-in-flight", requestOptions: visibleBehindPrefetchPlugin.getAutoTranslationOptions() });
    visibleBehindPrefetchPlugin.drainAutoTranslationQueue();
    assert.equal(startedBehindPrefetch, "visible-behind");
    assert.equal(visibleBehindPrefetchPlugin.autoTranslationQueue.some(item => item.cacheKey === "blocked-prefetch"), true);
    assert.equal(visibleBehindPrefetchPlugin.autoTranslationQueuedKeys.has("blocked-prefetch"), true);

    const visibleBeforeAvailablePrefetchPlugin = new Plugin();
    visibleBeforeAvailablePrefetchPlugin.settings.ui.autoTranslateConcurrency = 2;
    visibleBeforeAvailablePrefetchPlugin.settings.ui.autoTranslateMessages = true;
    visibleBeforeAvailablePrefetchPlugin.settings.ui.autoTranslatePrefetch = true;
    visibleBeforeAvailablePrefetchPlugin.isElementVisibleInViewport = item => item?.visible === true;
    visibleBeforeAvailablePrefetchPlugin.isAutoTranslationTargetInScanRange = () => true;
    visibleBeforeAvailablePrefetchPlugin.hasCurrentTranslationLine = () => false;
    visibleBeforeAvailablePrefetchPlugin.getElementText = content => content.text;
    const visibleBeforeAvailableStarts = [];
    visibleBeforeAvailablePrefetchPlugin.autoTranslateQueuedMessage = item => {
        visibleBeforeAvailableStarts.push(item.cacheKey);
    };
    const availablePrefetchItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "available prefetch" },
        text: "available prefetch",
        cacheKey: "available-prefetch",
        requestOptions: visibleBeforeAvailablePrefetchPlugin.getAutoTranslationOptions()
    };
    const visibleAfterAvailablePrefetchItem = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "visible after prefetch" },
        text: "visible after prefetch",
        cacheKey: "visible-after-prefetch",
        requestOptions: visibleBeforeAvailablePrefetchPlugin.getAutoTranslationOptions()
    };
    visibleBeforeAvailablePrefetchPlugin.enqueueAutoTranslationItem(availablePrefetchItem);
    visibleBeforeAvailablePrefetchPlugin.enqueueAutoTranslationItem(visibleAfterAvailablePrefetchItem);
    visibleBeforeAvailablePrefetchPlugin.addAutoTranslationPendingTarget(availablePrefetchItem.cacheKey, availablePrefetchItem);
    visibleBeforeAvailablePrefetchPlugin.addAutoTranslationPendingTarget(visibleAfterAvailablePrefetchItem.cacheKey, visibleAfterAvailablePrefetchItem);
    visibleBeforeAvailablePrefetchPlugin.drainAutoTranslationQueue();
    assert.deepEqual(visibleBeforeAvailableStarts, ["visible-after-prefetch"]);
    assert.equal(visibleBeforeAvailablePrefetchPlugin.autoTranslationQueue.some(item => item.cacheKey === "available-prefetch"), true);

    const prefetchWaitsForVisiblePlugin = new Plugin();
    prefetchWaitsForVisiblePlugin.settings.ui.autoTranslateConcurrency = 4;
    prefetchWaitsForVisiblePlugin.settings.ui.autoTranslateMessages = true;
    prefetchWaitsForVisiblePlugin.settings.ui.autoTranslatePrefetch = true;
    prefetchWaitsForVisiblePlugin.isElementVisibleInViewport = item => item?.visible === true;
    prefetchWaitsForVisiblePlugin.isAutoTranslationTargetInScanRange = () => true;
    prefetchWaitsForVisiblePlugin.hasCurrentTranslationLine = () => false;
    prefetchWaitsForVisiblePlugin.getElementText = content => content.text;
    const prefetchWaitStarts = [];
    prefetchWaitsForVisiblePlugin.autoTranslateQueuedMessage = item => {
        prefetchWaitStarts.push(item.cacheKey);
    };
    const prefetchWaitVisible = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "visible first" },
        text: "visible first",
        cacheKey: "prefetch-wait-visible",
        requestOptions: prefetchWaitsForVisiblePlugin.getAutoTranslationOptions()
    };
    const prefetchWaitItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "prefetch waits" },
        text: "prefetch waits",
        cacheKey: "prefetch-waits",
        requestOptions: prefetchWaitsForVisiblePlugin.getAutoTranslationOptions()
    };
    prefetchWaitsForVisiblePlugin.enqueueAutoTranslationItem(prefetchWaitItem);
    prefetchWaitsForVisiblePlugin.enqueueAutoTranslationItem(prefetchWaitVisible);
    prefetchWaitsForVisiblePlugin.addAutoTranslationPendingTarget(prefetchWaitItem.cacheKey, prefetchWaitItem);
    prefetchWaitsForVisiblePlugin.addAutoTranslationPendingTarget(prefetchWaitVisible.cacheKey, prefetchWaitVisible);
    prefetchWaitsForVisiblePlugin.drainAutoTranslationQueue();
    assert.deepEqual(prefetchWaitStarts, ["prefetch-wait-visible"]);
    assert.equal(prefetchWaitsForVisiblePlugin.autoTranslationQueue.some(item => item.cacheKey === "prefetch-waits"), true);

    const prefetchInputBusyPlugin = new Plugin();
    prefetchInputBusyPlugin.settings.ui.autoTranslateMessages = true;
    prefetchInputBusyPlugin.settings.ui.autoTranslatePrefetch = true;
    prefetchInputBusyPlugin.isElementVisibleInViewport = item => item?.visible === true;
    const prefetchInputBusyItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "prefetch busy" },
        text: "prefetch busy",
        cacheKey: "prefetch-input-busy",
        requestOptions: prefetchInputBusyPlugin.getAutoTranslationOptions()
    };
    prefetchInputBusyPlugin.markInputComposerBusy(500);
    assert.equal(prefetchInputBusyPlugin.isAutoTranslationPrefetchAllowed(prefetchInputBusyItem), false);

    const prefetchTransientFailurePlugin = new Plugin();
    prefetchTransientFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    prefetchTransientFailurePlugin.showAutoTranslateError = () => {};
    const prefetchTransientOptions = prefetchTransientFailurePlugin.getAutoTranslationOptions();
    const prefetchTransientItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "prefetch timeout" },
        text: "prefetch timeout",
        cacheKey: "prefetch-transient-failure",
        requestOptions: prefetchTransientOptions,
        daitPrefetchRequest: true
    };
    prefetchTransientFailurePlugin.markAutoTranslationFailure(prefetchTransientItem, new Error("API request timed out after 25s"));
    assert.equal(prefetchTransientFailurePlugin.autoTranslationFailures.has(prefetchTransientItem.cacheKey), true);
    assert.equal(prefetchTransientFailurePlugin.getAutoTranslationFailure(prefetchTransientItem.cacheKey).weak, true);
    assert.equal(Boolean(prefetchTransientFailurePlugin.getAutoTranslationProviderFailure(prefetchTransientOptions)), false);

    const prefetchInvalidFailurePlugin = new Plugin();
    prefetchInvalidFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    prefetchInvalidFailurePlugin.showAutoTranslateError = () => {};
    const prefetchInvalidOptions = prefetchInvalidFailurePlugin.getAutoTranslationOptions();
    const prefetchInvalidItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "prefetch invalid" },
        text: "prefetch invalid",
        cacheKey: "prefetch-invalid-failure",
        requestOptions: prefetchInvalidOptions,
        daitPrefetchRequest: true
    };
    prefetchInvalidFailurePlugin.markAutoTranslationFailure(prefetchInvalidItem, prefetchInvalidFailurePlugin.createFinalInvalidAutoTranslationError("same-as-source"));
    assert.equal(prefetchInvalidFailurePlugin.isTerminalAutoTranslationFailure(prefetchInvalidFailurePlugin.getAutoTranslationFailure(prefetchInvalidItem.cacheKey)), true);
    assert.equal(prefetchInvalidFailurePlugin.getAutoTextTranslationFailure(prefetchInvalidItem.text, prefetchInvalidOptions), null);

    const visibleAfterPrefetchFailurePlugin = new Plugin();
    visibleAfterPrefetchFailurePlugin.settings.translation.enabled = true;
    visibleAfterPrefetchFailurePlugin.settings.ui.autoTranslateMessages = true;
    visibleAfterPrefetchFailurePlugin.settings.translation.apiKey = "sk-test";
    visibleAfterPrefetchFailurePlugin.isElementVisibleInViewport = () => true;
    visibleAfterPrefetchFailurePlugin.getMessageContentElement = message => message.content;
    visibleAfterPrefetchFailurePlugin.getCachedElementText = content => content.text;
    visibleAfterPrefetchFailurePlugin.getElementText = content => content.text;
    visibleAfterPrefetchFailurePlugin.getMessageIdentity = message => `message:visible-after-prefetch-failure:${message.id}`;
    visibleAfterPrefetchFailurePlugin.shouldAutoTranslateText = () => true;
    visibleAfterPrefetchFailurePlugin.hasCurrentTranslationLine = () => false;
    visibleAfterPrefetchFailurePlugin.drainAutoTranslationQueue = () => {};
    const visibleAfterPrefetchMessage = { id: "retry", isConnected: true, content: { dataset: {}, isConnected: true, text: "prefetch invalid" } };
    const visibleAfterPrefetchOptions = visibleAfterPrefetchFailurePlugin.withMessageIdentity(
        visibleAfterPrefetchFailurePlugin.getAutoTranslationOptions(),
        visibleAfterPrefetchMessage,
        visibleAfterPrefetchMessage.content,
        "prefetch invalid"
    );
    const visibleAfterPrefetchKey = visibleAfterPrefetchFailurePlugin.getTranslationCacheKey("prefetch invalid", visibleAfterPrefetchOptions);
    const visibleAfterPrefetchError = Object.assign(new Error("weak invalid"), {
        autoTranslationWeakFailure: true,
        autoTranslationInvalidReason: "same-as-source"
    });
    visibleAfterPrefetchFailurePlugin.autoTranslationFailures.set(
        visibleAfterPrefetchKey,
        visibleAfterPrefetchFailurePlugin.createAutoTranslationFailure(visibleAfterPrefetchKey, visibleAfterPrefetchError)
    );
    visibleAfterPrefetchFailurePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [visibleAfterPrefetchMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(visibleAfterPrefetchFailurePlugin.autoTranslationQueue.length, 1);
    assert.equal(visibleAfterPrefetchFailurePlugin.getAutoTranslationFailure(visibleAfterPrefetchKey), null);

    const prefetchAuthFailurePlugin = new Plugin();
    prefetchAuthFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    prefetchAuthFailurePlugin.showAutoTranslateError = () => {};
    const prefetchAuthOptions = prefetchAuthFailurePlugin.getAutoTranslationOptions();
    const prefetchAuthItem = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "prefetch auth" },
        text: "prefetch auth",
        cacheKey: "prefetch-auth-failure",
        requestOptions: prefetchAuthOptions,
        daitPrefetchRequest: true
    };
    const prefetchAuthError = new Error("Unauthorized");
    prefetchAuthError.status = 401;
    prefetchAuthFailurePlugin.markAutoTranslationFailure(prefetchAuthItem, prefetchAuthError);
    assert.equal(prefetchAuthFailurePlugin.getAutoTranslationProviderFailure(prefetchAuthOptions)?.type, "auth");

    const visibleTransientFailurePlugin = new Plugin();
    visibleTransientFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    visibleTransientFailurePlugin.showAutoTranslateError = () => {};
    const visibleTransientOptions = visibleTransientFailurePlugin.getAutoTranslationOptions();
    const visibleTransientItem = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "visible timeout" },
        text: "visible timeout",
        cacheKey: "visible-transient-failure",
        requestOptions: visibleTransientOptions
    };
    visibleTransientFailurePlugin.markAutoTranslationFailure(visibleTransientItem, new Error("API request timed out after 25s"));
    assert.equal(visibleTransientFailurePlugin.getAutoTranslationProviderFailure(visibleTransientOptions)?.type, "timeout");

    const fullConcurrencyPlugin = new Plugin();
    fullConcurrencyPlugin.settings.ui.autoTranslateMessages = true;
    fullConcurrencyPlugin.settings.ui.autoTranslateConcurrency = 4;
    fullConcurrencyPlugin.isElementVisibleInViewport = item => item?.visible === true;
    fullConcurrencyPlugin.isAutoTranslationTargetInScanRange = () => true;
    fullConcurrencyPlugin.hasCurrentTranslationLine = () => false;
    fullConcurrencyPlugin.getElementText = content => content.text;
    const fullConcurrencyBatches = [];
    fullConcurrencyPlugin.autoTranslateQueuedBatch = batch => {
        fullConcurrencyBatches.push(batch.length);
    };
    Array.from({ length: 24 }, (_, index) => {
        const item = {
            messageNode: { isConnected: true, visible: true },
            content: { dataset: {}, isConnected: true, visible: true, text: `visible-${index}` },
            text: `visible-${index}`,
            cacheKey: `full-concurrency-${index}`,
            requestOptions: fullConcurrencyPlugin.getAutoTranslationOptions()
        };
        fullConcurrencyPlugin.enqueueAutoTranslationItem(item);
        fullConcurrencyPlugin.addAutoTranslationPendingTarget(item.cacheKey, item);
    });
    fullConcurrencyPlugin.drainAutoTranslationQueue();
    assert.deepEqual(fullConcurrencyBatches, [6, 6, 6, 6]);
    assert.equal(fullConcurrencyPlugin.autoTranslationInFlight, 4);
    assert.equal(fullConcurrencyPlugin.autoTranslationQueue.length, 0);

    const localTenPlugin = new Plugin();
    localTenPlugin.settings.translation.provider = "sakuraLocal";
    localTenPlugin.settings.ui.autoTranslateMessages = true;
    localTenPlugin.settings.ui.autoTranslateConcurrency = 10;
    localTenPlugin.shouldBlockAutoTranslationForLocalProviderHealth = () => false;
    localTenPlugin.isElementVisibleInViewport = item => item?.visible === true;
    localTenPlugin.isAutoTranslationTargetInScanRange = () => true;
    localTenPlugin.hasCurrentTranslationLine = () => false;
    localTenPlugin.getElementText = content => content.text;
    const localStarted = [];
    localTenPlugin.autoTranslateQueuedMessage = item => localStarted.push(item);
    for (let index = 0; index < 11; index++) {
        const item = {
            messageNode: { isConnected: true, visible: true },
            content: { dataset: {}, isConnected: true, visible: true, text: `local-${index}` },
            text: `local-${index}`,
            cacheKey: `local-ten-${index}`,
            requestOptions: localTenPlugin.getAutoTranslationOptions()
        };
        localTenPlugin.enqueueAutoTranslationItem(item);
        localTenPlugin.addAutoTranslationPendingTarget(item.cacheKey, item);
    }
    localTenPlugin.drainAutoTranslationQueue();
    assert.equal(localStarted.length, 10);
    assert.equal(localTenPlugin.autoTranslationInFlight, 10);
    assert.equal(localTenPlugin.autoTranslationQueue.length, 1);
    localTenPlugin.drainAutoTranslationQueue();
    assert.equal(localStarted.length, 10);
    // Releasing one active request allows exactly one waiting message to start.
    localTenPlugin.autoTranslationInFlight--;
    localTenPlugin.autoTranslationInFlightItems--;
    localTenPlugin.drainAutoTranslationQueue();
    assert.equal(localStarted.length, 11);
    assert.equal(localTenPlugin.autoTranslationInFlight, 10);
    assert.equal(localTenPlugin.autoTranslationQueue.length, 0);

    const googleBatchPlugin = new Plugin();
    googleBatchPlugin.settings.ui.autoTranslateMessages = true;
    googleBatchPlugin.settings.translation.provider = "googleCloud";
    googleBatchPlugin.isElementVisibleInViewport = item => item?.visible === true;
    googleBatchPlugin.isAutoTranslationTargetInScanRange = () => true;
    googleBatchPlugin.hasCurrentTranslationLine = () => false;
    googleBatchPlugin.getElementText = content => content.text;
    const googleBatchLengths = [];
    const googleBatchOptions = googleBatchPlugin.getAutoTranslationOptions();
    googleBatchPlugin.autoTranslateQueuedBatch = batch => {
        googleBatchLengths.push(batch.length);
    };
    Array.from({ length: 20 }, (_, index) => {
        const item = {
            messageNode: { isConnected: true, visible: true },
            content: { dataset: {}, isConnected: true, visible: true, text: `google-visible-${index}` },
            text: `google-visible-${index}`,
            cacheKey: `google-batch-${index}`,
            requestOptions: googleBatchOptions
        };
        googleBatchPlugin.enqueueAutoTranslationItem(item);
        googleBatchPlugin.addAutoTranslationPendingTarget(item.cacheKey, item);
    });
    googleBatchPlugin.drainAutoTranslationQueue();
    assert.deepEqual(googleBatchLengths, [20]);
    assert.equal(googleBatchPlugin.autoTranslationQueue.length, 0);

    const queueLimitVisiblePlugin = new Plugin();
    queueLimitVisiblePlugin.getViewportPriority = element => element?.priority ?? 9999;
    queueLimitVisiblePlugin.isElementVisibleInViewport = item => item?.visible === true;
    queueLimitVisiblePlugin.autoTranslationInFlightItems = queueLimitVisiblePlugin.getAutoTranslateQueueLimit();
    assert.equal(queueLimitVisiblePlugin.makeRoomForAutoTranslationItem(visibleReserveItem, queueLimitVisiblePlugin.getAutoTranslateQueueLimit()), true);

    const hiddenPrefetchPlugin = new Plugin();
    hiddenPrefetchPlugin.isElementVisibleInViewport = item => item?.visible === true;
    assert.equal(hiddenPrefetchPlugin.isAutoTranslationVisibleItem({
        messageNode: { isConnected: true, visible: true },
        content: { isConnected: true, visible: false }
    }), false);
    assert.equal(hiddenPrefetchPlugin.isAutoTranslationPrefetchItem({
        messageNode: { isConnected: true, visible: true },
        content: { isConnected: true, visible: false }
    }), true);

    const promotionPlugin = new Plugin();
    promotionPlugin.settings.ui.autoTranslateMessages = true;
    promotionPlugin.getViewportPriority = element => element?.priority ?? 9999;
    const promotedFar = {
        messageNode: { priority: 800 },
        content: { dataset: { daitOwner: "promoted-owner" }, priority: 800 },
        text: "same",
        cacheKey: "promoted",
        requestOptions: promotionPlugin.getAutoTranslationOptions()
    };
    const promotedNear = {
        messageNode: { priority: 5 },
        content: { dataset: { daitOwner: "promoted-owner" }, priority: 5 },
        text: "same",
        cacheKey: "promoted",
        requestOptions: promotionPlugin.getAutoTranslationOptions()
    };
    promotionPlugin.addAutoTranslationPendingTarget("promoted", promotedFar);
    promotionPlugin.enqueueAutoTranslationItem(promotedFar);
    promotionPlugin.addAutoTranslationPendingTarget("promoted", promotedNear);
    promotionPlugin.promoteQueuedAutoTranslationItem("promoted", promotedNear);
    assert.equal(promotionPlugin.autoTranslationQueue[0].priority, 5);
    assert.equal(promotionPlugin.getAutoTranslationPendingTargets({ cacheKey: "promoted" })[0].priority, 5);

    const pruneQueuePlugin = new Plugin();
    pruneQueuePlugin.settings.translation.enabled = true;
    pruneQueuePlugin.settings.ui.autoTranslateMessages = true;
    pruneQueuePlugin.settings.translation.apiKey = "sk-test";
    pruneQueuePlugin.settings.translation.targetLanguage = "姹夎";
    pruneQueuePlugin.isElementVisibleInViewport = node => node.visible !== false;
    pruneQueuePlugin.getElementText = content => content.text;
    pruneQueuePlugin.getMessageContentElement = message => message.content;
    pruneQueuePlugin.getCachedElementText = content => content.text;
    pruneQueuePlugin.shouldAutoTranslateText = () => true;
    pruneQueuePlugin.hasCurrentTranslationLine = () => false;
    pruneQueuePlugin.drainAutoTranslationQueue = () => {};
    const staleKey = "stale-cache-key";
    const staleItem = {
        messageNode: { isConnected: false, visible: false },
        content: { isConnected: false, visible: false, text: "old" },
        text: "old",
        cacheKey: staleKey,
        requestOptions: pruneQueuePlugin.getAutoTranslationOptions()
    };
    pruneQueuePlugin.autoTranslationQueue.push(staleItem);
    pruneQueuePlugin.autoTranslationQueuedKeys.add(staleKey);
    pruneQueuePlugin.addAutoTranslationPendingTarget(staleKey, staleItem);
    const freshMessage = {
        isConnected: true,
        content: { dataset: {}, isConnected: true, visible: true, text: "fresh foreign text" },
        visible: true
    };
    pruneQueuePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [freshMessage],
        contentByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(pruneQueuePlugin.autoTranslationQueuedKeys.has(staleKey), false);
    assert.equal(pruneQueuePlugin.autoTranslationQueue.length, 1);
    assert.equal(pruneQueuePlugin.autoTranslationQueue[0].text, "fresh foreign text");

    const orphanPendingPlugin = new Plugin();
    orphanPendingPlugin.settings.translation.enabled = true;
    orphanPendingPlugin.settings.ui.autoTranslateMessages = true;
    orphanPendingPlugin.settings.translation.apiKey = "sk-test";
    orphanPendingPlugin.settings.translation.targetLanguage = "Chinese";
    orphanPendingPlugin.isElementVisibleInViewport = node => node.visible !== false;
    orphanPendingPlugin.getElementText = content => content.text;
    orphanPendingPlugin.getMessageContentElement = message => message.content;
    orphanPendingPlugin.getCachedElementText = content => content.text;
    orphanPendingPlugin.shouldAutoTranslateText = () => true;
    orphanPendingPlugin.hasCurrentTranslationLine = () => false;
    orphanPendingPlugin.drainAutoTranslationQueue = () => {};
    const orphanPendingMessage = {
        id: "orphan-pending",
        isConnected: true,
        visible: true,
        content: { dataset: {}, isConnected: true, visible: true, text: "I have Kiro pro no 429 error." }
    };
    const orphanPendingOptions = orphanPendingPlugin.withMessageIdentity(
        orphanPendingPlugin.getAutoTranslationOptions(),
        orphanPendingMessage,
        orphanPendingMessage.content,
        orphanPendingMessage.content.text
    );
    const orphanPendingKey = orphanPendingPlugin.getTranslationCacheKey(orphanPendingMessage.content.text, orphanPendingOptions);
    orphanPendingPlugin.addAutoTranslationPendingTarget(orphanPendingKey, {
        messageNode: orphanPendingMessage,
        content: orphanPendingMessage.content,
        text: orphanPendingMessage.content.text,
        cacheKey: orphanPendingKey,
        requestOptions: orphanPendingOptions
    });
    orphanPendingPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [orphanPendingMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(orphanPendingPlugin.autoTranslationQueue.length, 1);
    assert.equal(orphanPendingPlugin.autoTranslationQueue[0].cacheKey, orphanPendingKey);

    const activePrunePlugin = new Plugin();
    activePrunePlugin.autoTranslationQueuedKeys.add("ghost-queued-key");
    assert.equal(activePrunePlugin.hasActiveAutoTranslationKey("ghost-queued-key"), false);
    activePrunePlugin.autoTranslationInFlight = 1;
    activePrunePlugin.autoTranslationInFlightItems = 1;
    activePrunePlugin.autoTranslationInFlightKeys.add("ghost-in-flight-key");
    activePrunePlugin.autoTranslationInFlightStartedAt.set("ghost-in-flight-key", Date.now() - 600000);
    assert.equal(activePrunePlugin.hasActiveAutoTranslationKey("ghost-in-flight-key"), false);
    assert.equal(activePrunePlugin.autoTranslationInFlight, 0);

    const inFlightScanPlugin = new Plugin();
    inFlightScanPlugin.settings.translation.enabled = true;
    inFlightScanPlugin.settings.ui.autoTranslateMessages = true;
    inFlightScanPlugin.settings.translation.apiKey = "sk-test";
    inFlightScanPlugin.settings.translation.targetLanguage = "Chinese";
    inFlightScanPlugin.settings.ui.diagnosticsEnabled = true;
    inFlightScanPlugin.isElementVisibleInViewport = () => true;
    inFlightScanPlugin.getElementText = content => content.text;
    inFlightScanPlugin.getMessageContentElement = message => message.content;
    inFlightScanPlugin.getCachedElementText = content => content.text;
    inFlightScanPlugin.getMessageIdentity = () => "in-flight-scan-identity";
    inFlightScanPlugin.shouldAutoTranslateText = () => true;
    inFlightScanPlugin.hasCurrentTranslationLine = () => false;
    let inFlightScanDrainCount = 0;
    inFlightScanPlugin.drainAutoTranslationQueue = () => { inFlightScanDrainCount++; };
    const inFlightScanMessage = {
        isConnected: true,
        content: { dataset: {}, isConnected: true, text: "same in flight" }
    };
    const inFlightScanOptions = inFlightScanPlugin.withMessageIdentity(
        inFlightScanPlugin.getAutoTranslationOptions(),
        inFlightScanMessage,
        inFlightScanMessage.content,
        inFlightScanMessage.content.text
    );
    const inFlightScanKey = inFlightScanPlugin.getTranslationCacheKey(inFlightScanMessage.content.text, inFlightScanOptions);
    inFlightScanPlugin.autoTranslationQueuedKeys.add(inFlightScanKey);
    inFlightScanPlugin.autoTranslationInFlightKeys.add(inFlightScanKey);
    inFlightScanPlugin.autoTranslationInFlightStartedAt.set(inFlightScanKey, Date.now());
    inFlightScanPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [inFlightScanMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(inFlightScanPlugin.autoTranslationQueue.length, 0);
    assert.equal(inFlightScanDrainCount, 1);
    assert.equal(inFlightScanPlugin.autoTranslationQueuedKeys.has(inFlightScanKey), false);
    assert.equal(inFlightScanPlugin.autoTranslationInFlightKeys.has(inFlightScanKey), true);
    assert.equal(inFlightScanPlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightScanKey }).length, 1);
    assert.equal(inFlightScanPlugin.translationCacheStats.misses, 0);
    const inFlightScanLog = inFlightScanPlugin.diagnosticLogs.find(entry => entry.action === "auto.scan");
    assert.equal(inFlightScanLog.meta.active, 1);
    assert.equal(inFlightScanLog.meta.cacheHits, 0);
    assert.equal(inFlightScanLog.meta.textCacheHits, 0);

    const alternateTargetPlugin = new Plugin();
    alternateTargetPlugin.isElementVisibleInViewport = node => node.visible !== false;
    alternateTargetPlugin.getElementText = content => content.text;
    alternateTargetPlugin.hasCurrentTranslationLine = () => false;
    const alternateKey = "alternate-cache-key";
    const disconnectedTarget = {
        messageNode: { isConnected: false, visible: false },
        content: { dataset: { daitOwner: "old-target" }, isConnected: false, visible: false, text: "same" },
        text: "same",
        cacheKey: alternateKey
    };
    const visibleTarget = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: { daitOwner: "new-target" }, isConnected: true, visible: true, text: "same" },
        text: "same",
        cacheKey: alternateKey
    };
    alternateTargetPlugin.autoTranslationQueue.push({ ...disconnectedTarget, requestOptions: alternateTargetPlugin.getAutoTranslationOptions() });
    alternateTargetPlugin.autoTranslationQueuedKeys.add(alternateKey);
    alternateTargetPlugin.addAutoTranslationPendingTarget(alternateKey, disconnectedTarget);
    alternateTargetPlugin.addAutoTranslationPendingTarget(alternateKey, visibleTarget);
    const alternateBatch = alternateTargetPlugin.takeAutoTranslationBatch();
    assert.equal(alternateBatch.length, 1);
    assert.equal(alternateBatch[0].content, visibleTarget.content);
    assert.equal(alternateTargetPlugin.getAutoTranslationPendingTargets({ cacheKey: alternateKey }).length, 1);
    assert.equal(alternateTargetPlugin.autoTranslationQueuedKeys.has(alternateKey), false);

    const groupedBatchPlugin = new Plugin();
    groupedBatchPlugin.isElementVisibleInViewport = () => true;
    groupedBatchPlugin.isAutoTranslationTargetInScanRange = () => true;
    groupedBatchPlugin.getElementText = content => content.text;
    groupedBatchPlugin.hasCurrentTranslationLine = () => false;
    const groupedOptionsA = groupedBatchPlugin.getAutoTranslationOptions();
    const groupedOptionsB = {
        ...groupedBatchPlugin.getAutoTranslationOptions(),
        targetLanguage: "English"
    };
    assert.notEqual(
        groupedBatchPlugin.getAutoTranslationBatchGroupKey({ ...groupedOptionsA, routeKey: "guild:channel-a:" }),
        groupedBatchPlugin.getAutoTranslationBatchGroupKey({ ...groupedOptionsA, routeKey: "guild:channel-b:" })
    );
    const groupedItemA = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "group-a" }, isConnected: true, text: "same-a" },
        text: "same-a",
        cacheKey: "group-a",
        requestOptions: groupedOptionsA
    };
    const groupedItemB = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "group-b" }, isConnected: true, text: "same-b" },
        text: "same-b",
        cacheKey: "group-b",
        requestOptions: groupedOptionsB
    };
    groupedBatchPlugin.autoTranslationQueue.push(groupedItemA, groupedItemB);
    groupedBatchPlugin.addAutoTranslationPendingTarget(groupedItemA.cacheKey, groupedItemA);
    groupedBatchPlugin.addAutoTranslationPendingTarget(groupedItemB.cacheKey, groupedItemB);
    const groupedBatch = groupedBatchPlugin.takeAutoTranslationBatch();
    assert.equal(groupedBatch.length, 1);
    assert.equal(groupedBatch[0].cacheKey, "group-a");
    assert.equal(groupedBatchPlugin.autoTranslationQueue.length, 1);
    assert.equal(groupedBatchPlugin.autoTranslationQueue[0].cacheKey, "group-b");

    const drainCooldownPlugin = new Plugin();
    drainCooldownPlugin.settings.ui.autoTranslateMessages = true;
    drainCooldownPlugin.isElementVisibleInViewport = () => true;
    drainCooldownPlugin.isAutoTranslationTargetInScanRange = () => true;
    drainCooldownPlugin.getElementText = content => content.text;
    drainCooldownPlugin.hasCurrentTranslationLine = () => false;
    const drainOptions = drainCooldownPlugin.getAutoTranslationOptions();
    const drainItem = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "drain-a" }, isConnected: true, text: "same-a" },
        text: "same-a",
        cacheKey: "drain-a",
        requestOptions: drainOptions
    };
    drainCooldownPlugin.autoTranslationQueue.push(drainItem);
    drainCooldownPlugin.addAutoTranslationPendingTarget(drainItem.cacheKey, drainItem);
    drainCooldownPlugin.autoTranslationProviderFailures.set(drainOptions.providerKey, { retryAt: Date.now() + 30000 });
    drainCooldownPlugin.drainAutoTranslationQueue();
    assert.equal(drainCooldownPlugin.autoTranslationQueue.length, 1);
    assert.equal(drainCooldownPlugin.autoTranslationInFlight, 0);
    clearTimeout(drainCooldownPlugin.autoTranslationRetryTimer);
    drainCooldownPlugin.autoTranslationRetryTimer = null;

    const localHealthDrainPlugin = new Plugin();
    localHealthDrainPlugin.settings.translation.provider = "sakuraLocal";
    localHealthDrainPlugin.settings.ui.autoTranslateMessages = true;
    localHealthDrainPlugin.settings.translation.apiKey = "";
    localHealthDrainPlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    localHealthDrainPlugin.isElementVisibleInViewport = () => true;
    localHealthDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
    localHealthDrainPlugin.getElementText = content => content.text;
    localHealthDrainPlugin.hasCurrentTranslationLine = () => false;
    let localHealthDrainRemoved = 0;
    let localHealthDrainProbeStarted = "";
    localHealthDrainPlugin.removeAutoTranslationLoadingForItem = () => { localHealthDrainRemoved++; };
    localHealthDrainPlugin.startLocalProviderHealthProbe = providerKey => { localHealthDrainProbeStarted = providerKey; };
    const localHealthDrainOptions = localHealthDrainPlugin.getAutoTranslationOptions();
    const localHealthDrainItem = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "local-health-drain" }, isConnected: true, text: "same local health" },
        text: "same local health",
        cacheKey: "local-health-drain",
        requestOptions: localHealthDrainOptions
    };
    localHealthDrainPlugin.autoTranslationQueue.push(localHealthDrainItem);
    localHealthDrainPlugin.autoTranslationQueuedKeys.add(localHealthDrainItem.cacheKey);
    localHealthDrainPlugin.addAutoTranslationPendingTarget(localHealthDrainItem.cacheKey, localHealthDrainItem);
    localHealthDrainPlugin.drainAutoTranslationQueue();
    assert.equal(localHealthDrainPlugin.autoTranslationQueue.length, 1);
    assert.equal(localHealthDrainPlugin.autoTranslationQueuedKeys.has(localHealthDrainItem.cacheKey), true);
    assert.equal(localHealthDrainPlugin.autoTranslationPendingTargets.has(localHealthDrainItem.cacheKey), true);
    assert.ok(Number(localHealthDrainPlugin.autoTranslationQueue[0]?.daitRequeueAfter || 0) >= Date.now());
    assert.equal(localHealthDrainRemoved, 1);
    assert.equal(localHealthDrainPlugin.autoTranslationInFlight, 0);
    assert.equal(localHealthDrainProbeStarted, localHealthDrainOptions.providerKey);
    assert.notEqual(localHealthDrainPlugin.autoTranslationRetryTimer, null);
    clearTimeout(localHealthDrainPlugin.autoTranslationRetryTimer);
    localHealthDrainPlugin.autoTranslationRetryTimer = null;

    const localUnavailableDrainPlugin = new Plugin();
    localUnavailableDrainPlugin.settings.translation.provider = "sakuraLocal";
    localUnavailableDrainPlugin.settings.ui.autoTranslateMessages = true;
    localUnavailableDrainPlugin.settings.translation.apiKey = "";
    localUnavailableDrainPlugin.settings.translation.apiStatus = { state: "success", message: "" };
    localUnavailableDrainPlugin.isElementVisibleInViewport = () => true;
    localUnavailableDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
    localUnavailableDrainPlugin.getElementText = content => content.text;
    localUnavailableDrainPlugin.hasCurrentTranslationLine = () => false;
    let localUnavailableDrainRemoved = 0;
    localUnavailableDrainPlugin.removeAutoTranslationLoadingForItem = () => { localUnavailableDrainRemoved++; };
    localUnavailableDrainPlugin.startLocalProviderHealthProbe = () => { throw new Error("local-unavailable cooldown should be handled before health gate"); };
    const localUnavailableDrainOptions = localUnavailableDrainPlugin.getAutoTranslationOptions();
    const localUnavailableDrainItem = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "local-unavailable-drain" }, isConnected: true, text: "same local unavailable" },
        text: "same local unavailable",
        cacheKey: "local-unavailable-drain",
        requestOptions: localUnavailableDrainOptions
    };
    localUnavailableDrainPlugin.autoTranslationQueue.push(localUnavailableDrainItem);
    localUnavailableDrainPlugin.autoTranslationQueuedKeys.add(localUnavailableDrainItem.cacheKey);
    localUnavailableDrainPlugin.addAutoTranslationPendingTarget(localUnavailableDrainItem.cacheKey, localUnavailableDrainItem);
    localUnavailableDrainPlugin.autoTranslationProviderFailures.set(localUnavailableDrainOptions.providerKey, {
        type: "local-unavailable",
        retryAt: Date.now() + 30000,
        retryAfterMs: 30000
    });
    localUnavailableDrainPlugin.drainAutoTranslationQueue();
    assert.equal(localUnavailableDrainPlugin.autoTranslationQueue.length, 1);
    assert.equal(localUnavailableDrainPlugin.autoTranslationQueuedKeys.has(localUnavailableDrainItem.cacheKey), true);
    assert.equal(localUnavailableDrainPlugin.autoTranslationPendingTargets.has(localUnavailableDrainItem.cacheKey), true);
    assert.ok(Number(localUnavailableDrainPlugin.autoTranslationQueue[0]?.daitRequeueAfter || 0) >= Date.now());
    assert.equal(localUnavailableDrainRemoved, 1);
    assert.equal(localUnavailableDrainPlugin.autoTranslationInFlight, 0);
    assert.notEqual(localUnavailableDrainPlugin.autoTranslationRetryTimer, null);
    clearTimeout(localUnavailableDrainPlugin.autoTranslationRetryTimer);
    localUnavailableDrainPlugin.autoTranslationRetryTimer = null;

    const localUnavailableInvisibleDrainPlugin = new Plugin();
    localUnavailableInvisibleDrainPlugin.settings.translation.provider = "sakuraLocal";
    localUnavailableInvisibleDrainPlugin.settings.ui.autoTranslateMessages = true;
    localUnavailableInvisibleDrainPlugin.settings.translation.apiKey = "";
    localUnavailableInvisibleDrainPlugin.settings.translation.apiStatus = { state: "success", message: "" };
    localUnavailableInvisibleDrainPlugin.isElementVisibleInViewport = () => false;
    localUnavailableInvisibleDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
    localUnavailableInvisibleDrainPlugin.getElementText = content => content.text;
    localUnavailableInvisibleDrainPlugin.hasCurrentTranslationLine = () => false;
    let localUnavailableInvisibleRemoved = 0;
    localUnavailableInvisibleDrainPlugin.removeAutoTranslationLoadingForItem = () => { localUnavailableInvisibleRemoved++; };
    const localUnavailableInvisibleOptions = localUnavailableInvisibleDrainPlugin.getAutoTranslationOptions();
    const localUnavailableInvisibleItem = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "local-unavailable-invisible" }, isConnected: true, text: "same hidden local unavailable" },
        text: "same hidden local unavailable",
        cacheKey: "local-unavailable-invisible",
        requestOptions: localUnavailableInvisibleOptions
    };
    localUnavailableInvisibleDrainPlugin.autoTranslationQueue.push(localUnavailableInvisibleItem);
    localUnavailableInvisibleDrainPlugin.autoTranslationQueuedKeys.add(localUnavailableInvisibleItem.cacheKey);
    localUnavailableInvisibleDrainPlugin.addAutoTranslationPendingTarget(localUnavailableInvisibleItem.cacheKey, localUnavailableInvisibleItem);
    localUnavailableInvisibleDrainPlugin.autoTranslationProviderFailures.set(localUnavailableInvisibleOptions.providerKey, {
        type: "local-unavailable",
        retryAt: Date.now() + 30000,
        retryAfterMs: 30000
    });
    localUnavailableInvisibleDrainPlugin.drainAutoTranslationQueue();
    assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationQueue.length, 0);
    assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationQueuedKeys.has(localUnavailableInvisibleItem.cacheKey), false);
    assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationPendingTargets.has(localUnavailableInvisibleItem.cacheKey), false);
    assert.equal(localUnavailableInvisibleRemoved, 1);
    assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationInFlight, 0);
    clearTimeout(localUnavailableInvisibleDrainPlugin.autoTranslationRetryTimer);
    localUnavailableInvisibleDrainPlugin.autoTranslationRetryTimer = null;

    const requeuePlugin = new Plugin();
    requeuePlugin.settings.ui.autoTranslateMessages = true;
    const requeueItem = { cacheKey: "requeue-key" };
    requeuePlugin.requeueAutoTranslationItem(requeueItem);
    requeuePlugin.requeueAutoTranslationItem(requeueItem);
    assert.equal(requeueItem.daitRequeued, true);
    assert.equal(requeuePlugin.autoTranslationQueue.length, 1);
    assert.equal(requeuePlugin.autoTranslationQueuedKeys.has("requeue-key"), true);
    assert.equal(requeuePlugin.autoTranslationQueue[0].daitRequeued, undefined);

    const inFlightCounterDriftPlugin = new Plugin();
    inFlightCounterDriftPlugin.autoTranslationInFlight = 2;
    inFlightCounterDriftPlugin.autoTranslationInFlightItems = 3;
    inFlightCounterDriftPlugin.autoTranslationPrefetchInFlight = 1;
    inFlightCounterDriftPlugin.pruneAutoTranslationActiveState();
    assert.equal(inFlightCounterDriftPlugin.autoTranslationInFlight, 0);
    assert.equal(inFlightCounterDriftPlugin.autoTranslationInFlightItems, 0);
    assert.equal(inFlightCounterDriftPlugin.autoTranslationPrefetchInFlight, 0);

    const requeuePriorityPlugin = new Plugin();
    requeuePriorityPlugin.settings.ui.autoTranslateMessages = true;
    requeuePriorityPlugin.getViewportPriority = element => element?.priority ?? 9999;
    const requeuePriorityItem = {
        messageNode: { priority: 4 },
        content: { dataset: {}, priority: 4 },
        cacheKey: "requeue-priority",
        priority: 900,
        daitPrefetchRequest: true
    };
    requeuePriorityPlugin.requeueAutoTranslationItem(requeuePriorityItem);
    assert.equal(requeuePriorityPlugin.autoTranslationQueue[0].priority, 4);
    assert.equal(requeuePriorityPlugin.autoTranslationQueue[0].daitPrefetchRequest, undefined);
    assert.equal(requeuePriorityPlugin.autoTranslationQueue[0].daitRequeued, undefined);

    const delayedRequeuePlugin = new Plugin();
    delayedRequeuePlugin.settings.ui.autoTranslateMessages = true;
    let delayedRequeueStarted = false;
    let delayedRequeueRetryDelay = 0;
    delayedRequeuePlugin.autoTranslateQueuedMessage = () => { delayedRequeueStarted = true; };
    delayedRequeuePlugin.scheduleAutoTranslationRetryScan = delay => { delayedRequeueRetryDelay = delay; };
    delayedRequeuePlugin.autoTranslationQueue.push({
        cacheKey: "delayed-requeue",
        daitRequeueAfter: Date.now() + 5000
    });
    delayedRequeuePlugin.autoTranslationQueuedKeys.add("delayed-requeue");
    delayedRequeuePlugin.drainAutoTranslationQueue();
    assert.equal(delayedRequeueStarted, false);
    assert.equal(delayedRequeuePlugin.autoTranslationQueue.length, 1);
    assert.equal(delayedRequeuePlugin.autoTranslationInFlight, 0);
    assert.ok(delayedRequeueRetryDelay > 0);

    const delayedBehindReadyPlugin = new Plugin();
    delayedBehindReadyPlugin.settings.ui.autoTranslateMessages = true;
    let delayedBehindReadyStarted = "";
    delayedBehindReadyPlugin.getElementText = content => content.text;
    delayedBehindReadyPlugin.isElementVisibleInViewport = item => item?.visible === true;
    delayedBehindReadyPlugin.hasCurrentTranslationLine = () => false;
    delayedBehindReadyPlugin.autoTranslateQueuedMessage = item => { delayedBehindReadyStarted = item.cacheKey; };
    delayedBehindReadyPlugin.scheduleAutoTranslationRetryScan = () => {};
    const delayedFrontItem = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "delayed" },
        text: "delayed",
        cacheKey: "delayed-front",
        requestOptions: delayedBehindReadyPlugin.getAutoTranslationOptions(),
        daitRequeueAfter: Date.now() + 5000
    };
    const readyBehindItem = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "ready" },
        text: "ready",
        cacheKey: "ready-behind",
        requestOptions: delayedBehindReadyPlugin.getAutoTranslationOptions()
    };
    delayedBehindReadyPlugin.enqueueAutoTranslationItem(delayedFrontItem);
    delayedBehindReadyPlugin.enqueueAutoTranslationItem(readyBehindItem);
    delayedBehindReadyPlugin.addAutoTranslationPendingTarget(delayedFrontItem.cacheKey, delayedFrontItem);
    delayedBehindReadyPlugin.addAutoTranslationPendingTarget(readyBehindItem.cacheKey, readyBehindItem);
    delayedBehindReadyPlugin.drainAutoTranslationQueue();
    assert.equal(delayedBehindReadyStarted, "ready-behind");
    assert.equal(delayedBehindReadyPlugin.autoTranslationQueue.some(item => item.cacheKey === "delayed-front"), true);

    const invalidatePlugin = new Plugin();
    let removedInvalidatedLoading = 0;
    invalidatePlugin.removeAutoTranslationNode = () => { removedInvalidatedLoading++; };
    const invalidatedItem = {
        messageNode: {},
        content: { dataset: {} },
        text: "old text",
        cacheKey: "old-cache",
        requestOptions: invalidatePlugin.getAutoTranslationOptions()
    };
    invalidatePlugin.autoTranslationQueue.push(invalidatedItem);
    invalidatePlugin.autoTranslationQueuedKeys.add(invalidatedItem.cacheKey);
    invalidatePlugin.addAutoTranslationPendingTarget(invalidatedItem.cacheKey, invalidatedItem);
    invalidatePlugin.autoTranslationFailures.set("stale-failure", { retryAt: Date.now() + 10000 });
    invalidatePlugin.autoTranslationProviderFailures.set("stale-provider", { retryAt: Date.now() + 10000 });
    invalidatePlugin.autoTranslationRetryTimer = setTimeout(() => {}, 10000);
    let removedAutoInvalidationLine = false;
    let removedManualInvalidationLine = false;
    const savedDocumentForInvalidation = global.document;
    global.document = {
        querySelectorAll: selector => selector === ".dait-translation-line" ? [
            { dataset: { daitMode: "auto" }, remove: () => { removedAutoInvalidationLine = true; } },
            { dataset: { daitMode: "manual" }, remove: () => { removedManualInvalidationLine = true; } }
        ] : []
    };
    const oldVersion = invalidatePlugin.autoTranslationConfigVersion;
    invalidatePlugin.invalidateAutoTranslationQueue();
    global.document = savedDocumentForInvalidation;
    assert.equal(invalidatePlugin.autoTranslationConfigVersion, oldVersion + 1);
    assert.equal(invalidatePlugin.autoTranslationQueue.length, 0);
    assert.equal(invalidatePlugin.autoTranslationQueuedKeys.size, 0);
    assert.equal(invalidatePlugin.autoTranslationPendingTargets.size, 0);
    assert.equal(invalidatePlugin.autoTranslationFailures.size, 0);
    assert.equal(invalidatePlugin.autoTranslationProviderFailures.size, 0);
    assert.equal(invalidatePlugin.autoTranslationRetryTimer, null);
    assert.equal(removedAutoInvalidationLine, true);
    assert.equal(removedManualInvalidationLine, false);
    assert.equal(removedInvalidatedLoading, 1);
    assert.equal(invalidatePlugin.isAutoTranslationRequestCurrent(invalidatedItem.requestOptions), false);

    const inFlightInvalidatePlugin = new Plugin();
    const inFlightInvalidateRendered = [];
    inFlightInvalidatePlugin.isElementVisibleInViewport = () => true;
    inFlightInvalidatePlugin.getElementText = content => content.text;
    inFlightInvalidatePlugin.renderTranslation = (messageNode, content, translated) => {
        inFlightInvalidateRendered.push({ messageNode, content, translated });
    };
    inFlightInvalidatePlugin.queueScan = () => {};
    const inFlightInvalidateKey = "in-flight-preserve-key";
    const inFlightInvalidateTargetA = {
        messageNode: { id: "a", isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same in-flight text" },
        text: "same in-flight text",
        cacheKey: inFlightInvalidateKey,
        requestOptions: inFlightInvalidatePlugin.getAutoTranslationOptions()
    };
    const inFlightInvalidateTargetB = {
        messageNode: { id: "b", isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same in-flight text" },
        text: "same in-flight text",
        cacheKey: inFlightInvalidateKey,
        requestOptions: inFlightInvalidateTargetA.requestOptions
    };
    inFlightInvalidatePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightInvalidateTargetA);
    inFlightInvalidatePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightInvalidateTargetB);
    inFlightInvalidatePlugin.autoTranslationInFlightKeys.add(inFlightInvalidateKey);
    inFlightInvalidatePlugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
    assert.equal(inFlightInvalidatePlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightInvalidateKey }).length, 2);
    inFlightInvalidatePlugin.renderAutoTranslationResult(inFlightInvalidateTargetA, "\u8df3\u8f6c\u540e\u5df2\u7ffb\u8bd1");
    assert.equal(inFlightInvalidateRendered.length, 2);
    assert.equal(inFlightInvalidatePlugin.autoTranslationPendingTargets.has(inFlightInvalidateKey), false);

    const inFlightFailurePlugin = new Plugin();
    let inFlightFailureRemoved = 0;
    inFlightFailurePlugin.removeAutoTranslationNode = () => { inFlightFailureRemoved++; };
    inFlightFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    inFlightFailurePlugin.showAutoTranslateError = () => {};
    const inFlightFailureTargetA = {
        messageNode: { id: "failure-a", isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same failure text" },
        text: "same failure text",
        cacheKey: inFlightInvalidateKey,
        requestOptions: inFlightFailurePlugin.getAutoTranslationOptions()
    };
    const inFlightFailureTargetB = {
        messageNode: { id: "failure-b", isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same failure text" },
        text: "same failure text",
        cacheKey: inFlightInvalidateKey,
        requestOptions: inFlightFailureTargetA.requestOptions
    };
    inFlightFailurePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightFailureTargetA);
    inFlightFailurePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightFailureTargetB);
    inFlightFailurePlugin.autoTranslationInFlightKeys.add(inFlightInvalidateKey);
    inFlightFailurePlugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
    assert.equal(inFlightFailurePlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightInvalidateKey }).length, 2);
    inFlightFailurePlugin.markAutoTranslationFailureSafely(inFlightFailureTargetA, new Error("invalid output"));
    assert.equal(inFlightFailureRemoved, 2);
    assert.equal(inFlightFailurePlugin.autoTranslationPendingTargets.has(inFlightInvalidateKey), false);
    assert.equal(inFlightFailurePlugin.autoTranslationFailures.has(inFlightInvalidateKey), true);

    const inFlightClearPlugin = new Plugin();
    let inFlightClearRemoved = 0;
    inFlightClearPlugin.removeAutoTranslationNode = () => { inFlightClearRemoved++; };
    const inFlightClearTargetA = {
        messageNode: { id: "clear-a", isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same clear text" },
        text: "same clear text",
        cacheKey: inFlightInvalidateKey,
        requestOptions: inFlightClearPlugin.getAutoTranslationOptions()
    };
    const inFlightClearTargetB = {
        messageNode: { id: "clear-b", isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same clear text" },
        text: "same clear text",
        cacheKey: inFlightInvalidateKey,
        requestOptions: inFlightClearTargetA.requestOptions
    };
    inFlightClearPlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightClearTargetA);
    inFlightClearPlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightClearTargetB);
    inFlightClearPlugin.autoTranslationInFlightKeys.add(inFlightInvalidateKey);
    inFlightClearPlugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
    assert.equal(inFlightClearPlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightInvalidateKey }).length, 2);
    inFlightClearPlugin.clearPendingAutoTranslationItemSafely(inFlightClearTargetA);
    assert.equal(inFlightClearRemoved, 2);
    assert.equal(inFlightClearPlugin.autoTranslationPendingTargets.has(inFlightInvalidateKey), false);

    const batchTargetPlugin = new Plugin();
    batchTargetPlugin.settings.translation.targetLanguage = "姹夎";
    const englishBatchOptions = {
        mode: "auto",
        version: batchTargetPlugin.autoTranslationConfigVersion,
        targetLanguage: "English",
        configOverrides: { prompt: "base prompt" }
    };
    assert.match(batchTargetPlugin.getAutoTranslationBatchOptions(1, englishBatchOptions).configOverrides.prompt, /English/);

    const inFlightDedupePlugin = new Plugin();
    inFlightDedupePlugin.settings.ui.autoTranslateMessages = true;
    inFlightDedupePlugin.autoTranslationQueuedKeys.add("in-flight-key");
    inFlightDedupePlugin.autoTranslationInFlightKeys.add("in-flight-key");
    assert.equal(inFlightDedupePlugin.enqueueAutoTranslationItem({
        cacheKey: "in-flight-key",
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: "source"
    }), false);
    assert.equal(inFlightDedupePlugin.autoTranslationQueue.length, 0);
    assert.equal(inFlightDedupePlugin.enqueueAutoTranslationItem({
        cacheKey: "new-key",
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: "source"
    }), true);
    assert.equal(inFlightDedupePlugin.autoTranslationQueue.length, 1);

    const retryInFlightPlugin = new Plugin();
    retryInFlightPlugin.settings.translation.enabled = true;
    retryInFlightPlugin.settings.translation.apiKey = "sk-test";
    retryInFlightPlugin.getMessageIdentity = () => "retry-in-flight-identity";
    retryInFlightPlugin.getElementText = content => content.text;
    retryInFlightPlugin.isReplyPreviewElement = () => false;
    retryInFlightPlugin.drainAutoTranslationQueue = () => {};
    const retryInFlightContent = { dataset: {}, isConnected: true, text: "retry active text" };
    const retryInFlightMessage = { isConnected: true };
    const retryInFlightOptions = retryInFlightPlugin.withMessageIdentity(retryInFlightPlugin.getAutoTranslationOptions(), retryInFlightMessage, retryInFlightContent, "retry active text");
    const retryInFlightKey = retryInFlightPlugin.getTranslationCacheKey("retry active text", retryInFlightOptions);
    retryInFlightPlugin.autoTranslationQueuedKeys.add(retryInFlightKey);
    retryInFlightPlugin.autoTranslationInFlightKeys.add(retryInFlightKey);
    retryInFlightPlugin.retryAutoTranslationTarget(retryInFlightMessage, retryInFlightContent, "retry active text");
    assert.equal(retryInFlightPlugin.autoTranslationQueue.length, 0);
    assert.equal(retryInFlightPlugin.getAutoTranslationPendingTargets({ cacheKey: retryInFlightKey }).length, 1);
    shared.googleBatchPlugin = googleBatchPlugin;
}

module.exports = { title: "Visible backfill, queue scheduling & fallback policies", run };
