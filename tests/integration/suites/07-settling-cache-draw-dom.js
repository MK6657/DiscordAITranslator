"use strict";

// Artifact regression suite: Viewport settling, cached draw & chat DOM lines
function run(harness, shared) {
    const { assert, Plugin, expectThrowsMessage, fakeElementHasClass, createFakeElement } = harness;
    const { plugin, promptLeakOutput } = shared;

    const settlingCachedPlugin = new Plugin();
    let settlingCachedRendered = false;
    settlingCachedPlugin.settings.translation.enabled = true;
    settlingCachedPlugin.settings.ui.autoTranslateMessages = true;
    settlingCachedPlugin.settings.translation.apiKey = "sk-test";
    settlingCachedPlugin.settings.translation.targetLanguage = "汉语";
    settlingCachedPlugin.autoTranslationViewportBusyUntil = Date.now() + 1000;
    settlingCachedPlugin.isElementVisibleInViewport = () => true;
    settlingCachedPlugin.getMessageContentElement = message => message.content;
    settlingCachedPlugin.getCachedElementText = content => content.text;
    settlingCachedPlugin.getElementText = content => content.text;
    settlingCachedPlugin.getMessageIdentity = message => `message:settling-cache:${message.id}`;
    settlingCachedPlugin.shouldAutoTranslateText = () => true;
    settlingCachedPlugin.hasCurrentTranslationLine = () => false;
    settlingCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
    settlingCachedPlugin.renderTranslation = () => { settlingCachedRendered = true; };
    settlingCachedPlugin.scheduleAutoTranslationRetryScan = () => {};
    settlingCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("settling should not drain API queue"); };
    const settlingCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const settlingCachedOptions = settlingCachedPlugin.withMessageIdentity(settlingCachedPlugin.getAutoTranslationOptions(), settlingCachedMessage, settlingCachedMessage.content, "bonjour");
    const settlingCachedKey = settlingCachedPlugin.getTranslationCacheKey("bonjour", settlingCachedOptions);
    settlingCachedPlugin.setTranslationCache(settlingCachedKey, "你好");
    settlingCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [settlingCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    // Cached lines need no model request: drawn during the settle window once the chat is still.
    assert.equal(settlingCachedRendered, true);
    assert.equal(settlingCachedPlugin.autoTranslationRenderQueue.length, 0);
    clearTimeout(settlingCachedPlugin.autoTranslationRenderTimer);
    settlingCachedPlugin.autoTranslationRenderTimer = null;
    clearTimeout(settlingCachedPlugin.translationCacheDirtyTimer);
    settlingCachedPlugin.translationCacheDirtyTimer = null;

    const scrollPausedCachedPlugin = new Plugin();
    let scrollPausedCachedRendered = false;
    let scrollPausedRetryDelay = 0;
    scrollPausedCachedPlugin.settings.translation.enabled = true;
    scrollPausedCachedPlugin.settings.ui.autoTranslateMessages = true;
    scrollPausedCachedPlugin.settings.translation.apiKey = "sk-test";
    scrollPausedCachedPlugin.settings.translation.targetLanguage = "Chinese";
    scrollPausedCachedPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    scrollPausedCachedPlugin.isElementVisibleInViewport = () => true;
    scrollPausedCachedPlugin.getMessageContentElement = message => message.content;
    scrollPausedCachedPlugin.getCachedElementText = content => content.text;
    scrollPausedCachedPlugin.getElementText = content => content.text;
    scrollPausedCachedPlugin.getMessageIdentity = message => `message:scroll-paused-cache:${message.id}`;
    scrollPausedCachedPlugin.shouldAutoTranslateText = () => true;
    scrollPausedCachedPlugin.hasCurrentTranslationLine = () => false;
    scrollPausedCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
    scrollPausedCachedPlugin.renderTranslation = () => { scrollPausedCachedRendered = true; };
    scrollPausedCachedPlugin.scheduleAutoTranslationRetryScan = delay => { scrollPausedRetryDelay = Math.max(scrollPausedRetryDelay, delay); };
    scrollPausedCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("scroll pause should not drain API queue"); };
    const scrollPausedCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour paused" } };
    const scrollPausedCachedOptions = scrollPausedCachedPlugin.withMessageIdentity(scrollPausedCachedPlugin.getAutoTranslationOptions(), scrollPausedCachedMessage, scrollPausedCachedMessage.content, "bonjour paused");
    scrollPausedCachedPlugin.setTranslationCache(scrollPausedCachedPlugin.getTranslationCacheKey("bonjour paused", scrollPausedCachedOptions), "cached paused translation");
    scrollPausedCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [scrollPausedCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(scrollPausedCachedRendered, true);
    assert.equal(scrollPausedCachedPlugin.autoTranslationQueue.length, 0);
    assert.equal(scrollPausedCachedPlugin.autoTranslationRenderQueue.length, 0);
    assert.ok(scrollPausedRetryDelay > 0);
    clearTimeout(scrollPausedCachedPlugin.autoTranslationRenderTimer);
    scrollPausedCachedPlugin.autoTranslationRenderTimer = null;
    clearTimeout(scrollPausedCachedPlugin.autoTranslationRetryTimer);
    scrollPausedCachedPlugin.autoTranslationRetryTimer = null;
    clearTimeout(scrollPausedCachedPlugin.translationCacheDirtyTimer);
    scrollPausedCachedPlugin.translationCacheDirtyTimer = null;

    const jumpCooldownCachedPlugin = new Plugin();
    let jumpCooldownCachedRendered = false;
    let jumpCooldownRetryDelay = 0;
    jumpCooldownCachedPlugin.settings.translation.enabled = true;
    jumpCooldownCachedPlugin.settings.ui.autoTranslateMessages = true;
    jumpCooldownCachedPlugin.settings.translation.apiKey = "sk-test";
    jumpCooldownCachedPlugin.settings.translation.targetLanguage = "Chinese";
    jumpCooldownCachedPlugin.autoTranslationJumpCooldownUntil = Date.now() + 2000;
    jumpCooldownCachedPlugin.isElementVisibleInViewport = () => true;
    jumpCooldownCachedPlugin.getMessageContentElement = message => message.content;
    jumpCooldownCachedPlugin.getCachedElementText = content => content.text;
    jumpCooldownCachedPlugin.getElementText = content => content.text;
    jumpCooldownCachedPlugin.getMessageIdentity = message => `message:jump-cache:${message.id}`;
    jumpCooldownCachedPlugin.shouldAutoTranslateText = () => true;
    jumpCooldownCachedPlugin.hasCurrentTranslationLine = () => false;
    jumpCooldownCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
    jumpCooldownCachedPlugin.renderTranslation = (messageNode, content, translated) => {
        jumpCooldownCachedRendered = translated === "cached jump translation";
    };
    jumpCooldownCachedPlugin.scheduleAutoTranslationRetryScan = delay => { jumpCooldownRetryDelay = Math.max(jumpCooldownRetryDelay, delay); };
    jumpCooldownCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("jump cooldown should not drain API queue"); };
    const jumpCooldownCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour jump" } };
    const jumpCooldownUncachedMessage = { id: "uncached", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola jump" } };
    const jumpCooldownCachedOptions = jumpCooldownCachedPlugin.withMessageIdentity(jumpCooldownCachedPlugin.getAutoTranslationOptions(), jumpCooldownCachedMessage, jumpCooldownCachedMessage.content, "bonjour jump");
    jumpCooldownCachedPlugin.setTranslationCache(jumpCooldownCachedPlugin.getTranslationCacheKey("bonjour jump", jumpCooldownCachedOptions), "cached jump translation");
    jumpCooldownCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [jumpCooldownUncachedMessage, jumpCooldownCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    // The jump cooldown still blocks model requests for the uncached message, but not the cached line.
    assert.equal(jumpCooldownCachedRendered, true);
    assert.equal(jumpCooldownCachedPlugin.autoTranslationQueue.length, 0);
    assert.equal(jumpCooldownCachedPlugin.autoTranslationRenderQueue.length, 0);
    assert.ok(jumpCooldownRetryDelay > 0);
    clearTimeout(jumpCooldownCachedPlugin.autoTranslationRenderTimer);
    jumpCooldownCachedPlugin.autoTranslationRenderTimer = null;
    clearTimeout(jumpCooldownCachedPlugin.translationCacheDirtyTimer);
    jumpCooldownCachedPlugin.translationCacheDirtyTimer = null;

    const cooldownPlugin = new Plugin();
    cooldownPlugin.settings.translation.enabled = true;
    cooldownPlugin.settings.ui.autoTranslateMessages = true;
    cooldownPlugin.settings.translation.apiKey = "sk-test";
    cooldownPlugin.settings.translation.targetLanguage = "汉语";
    cooldownPlugin.isElementVisibleInViewport = () => true;
    cooldownPlugin.getMessageContentElement = message => message.content;
    cooldownPlugin.getCachedElementText = content => content.text;
    cooldownPlugin.getElementText = content => content.text;
    cooldownPlugin.shouldAutoTranslateText = () => true;
    cooldownPlugin.hasCurrentTranslationLine = () => false;
    let cooldownLoadingRendered = false;
    cooldownPlugin.renderPendingAutoTranslationLoading = () => { cooldownLoadingRendered = true; };
    cooldownPlugin.autoTranslationProviderFailures.set(cooldownPlugin.getAutoTranslationProviderKey(cooldownPlugin.getAutoTranslationOptions()), { retryAt: Date.now() + 30000 });
    cooldownPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(cooldownPlugin.autoTranslationQueue.length, 0);
    assert.equal(cooldownPlugin.autoTranslationInFlight, 0);
    assert.equal(cooldownLoadingRendered, false);
    assert.notEqual(cooldownPlugin.autoTranslationRetryTimer, null);
    clearTimeout(cooldownPlugin.autoTranslationRetryTimer);
    cooldownPlugin.autoTranslationRetryTimer = null;
    cooldownPlugin.autoTranslationRetryAt = 0;

    const cooldownCachedPlugin = new Plugin();
    let cooldownCachedRendered = false;
    cooldownCachedPlugin.settings.translation.enabled = true;
    cooldownCachedPlugin.settings.ui.autoTranslateMessages = true;
    cooldownCachedPlugin.settings.translation.apiKey = "sk-test";
    cooldownCachedPlugin.settings.translation.targetLanguage = "汉语";
    cooldownCachedPlugin.isElementVisibleInViewport = () => true;
    cooldownCachedPlugin.getMessageContentElement = message => message.content;
    cooldownCachedPlugin.getCachedElementText = content => content.text;
    cooldownCachedPlugin.getElementText = content => content.text;
    cooldownCachedPlugin.shouldAutoTranslateText = text => text === "bonjour";
    cooldownCachedPlugin.hasCurrentTranslationLine = () => false;
    cooldownCachedPlugin.renderTranslation = () => { cooldownCachedRendered = true; };
    const cooldownCachedMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const cooldownCachedOptions = cooldownCachedPlugin.withMessageIdentity(cooldownCachedPlugin.getAutoTranslationOptions(), cooldownCachedMessage, cooldownCachedMessage.content, "bonjour");
    const cooldownCachedKey = cooldownCachedPlugin.getTranslationCacheKey("bonjour", cooldownCachedOptions);
    cooldownCachedPlugin.setTranslationCache(cooldownCachedKey, "你好");
    cooldownCachedPlugin.autoTranslationProviderFailures.set(cooldownCachedPlugin.getAutoTranslationProviderKey(cooldownCachedPlugin.getAutoTranslationOptions()), { retryAt: Date.now() + 30000 });
    cooldownCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [cooldownCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(cooldownCachedRendered, true);
    assert.equal(cooldownCachedPlugin.autoTranslationQueue.length, 0);
    clearTimeout(cooldownCachedPlugin.autoTranslationRetryTimer);
    cooldownCachedPlugin.autoTranslationRetryTimer = null;
    cooldownCachedPlugin.autoTranslationRetryAt = 0;

    const noApiCachedPlugin = new Plugin();
    let noApiCachedRendered = false;
    noApiCachedPlugin.settings.translation.enabled = true;
    noApiCachedPlugin.settings.ui.autoTranslateMessages = true;
    noApiCachedPlugin.settings.translation.apiKey = "";
    noApiCachedPlugin.settings.translation.targetLanguage = "Chinese";
    noApiCachedPlugin.isElementVisibleInViewport = () => true;
    noApiCachedPlugin.getMessageContentElement = message => message.content;
    noApiCachedPlugin.getCachedElementText = content => content.text;
    noApiCachedPlugin.getElementText = content => content.text;
    noApiCachedPlugin.getMessageIdentity = message => `message:no-api-cache:${message.id}`;
    noApiCachedPlugin.shouldAutoTranslateText = text => text === "bonjour no api" || text === "hola no api";
    noApiCachedPlugin.hasCurrentTranslationLine = () => false;
    noApiCachedPlugin.renderTranslation = (messageNode, content, translated) => { noApiCachedRendered = translated === "\u65e0 API \u7f13\u5b58\u8bd1\u6587"; };
    noApiCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("missing API key should not drain API queue"); };
    const noApiCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour no api" } };
    const noApiUncachedMessage = { id: "uncached", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola no api" } };
    const noApiCachedOptions = noApiCachedPlugin.withMessageIdentity(noApiCachedPlugin.getAutoTranslationOptions(), noApiCachedMessage, noApiCachedMessage.content, "bonjour no api");
    noApiCachedPlugin.setTranslationCache(noApiCachedPlugin.getTranslationCacheKey("bonjour no api", noApiCachedOptions), "\u65e0 API \u7f13\u5b58\u8bd1\u6587");
    noApiCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [noApiUncachedMessage, noApiCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(noApiCachedRendered, true);
    assert.equal(noApiCachedPlugin.autoTranslationQueue.length, 0);
    assert.equal(noApiCachedPlugin.autoTranslationRetryTimer, null);
    clearTimeout(noApiCachedPlugin.translationCacheDirtyTimer);
    noApiCachedPlugin.translationCacheDirtyTimer = null;

    const noApiJumpCachedPlugin = new Plugin();
    let noApiJumpRetryDelay = 0;
    noApiJumpCachedPlugin.settings.translation.enabled = true;
    noApiJumpCachedPlugin.settings.ui.autoTranslateMessages = true;
    noApiJumpCachedPlugin.settings.translation.apiKey = "";
    noApiJumpCachedPlugin.settings.translation.targetLanguage = "Chinese";
    noApiJumpCachedPlugin.autoTranslationJumpCooldownUntil = Date.now() + 2000;
    noApiJumpCachedPlugin.isElementVisibleInViewport = () => true;
    noApiJumpCachedPlugin.getMessageContentElement = message => message.content;
    noApiJumpCachedPlugin.getCachedElementText = content => content.text;
    noApiJumpCachedPlugin.getElementText = content => content.text;
    noApiJumpCachedPlugin.getMessageIdentity = message => `message:no-api-jump-cache:${message.id}`;
    noApiJumpCachedPlugin.shouldAutoTranslateText = () => true;
    noApiJumpCachedPlugin.hasCurrentTranslationLine = () => false;
    noApiJumpCachedPlugin.renderTranslation = () => { throw new Error("jump cooldown should not render cache until layout is stable"); };
    noApiJumpCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("missing API key should not drain API queue during jump cooldown"); };
    noApiJumpCachedPlugin.scheduleAutoTranslationRetryScan = delay => { noApiJumpRetryDelay = Math.max(noApiJumpRetryDelay, Number(delay) || 0); };
    const noApiJumpMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour no api jump" } };
    const noApiJumpOptions = noApiJumpCachedPlugin.withMessageIdentity(noApiJumpCachedPlugin.getAutoTranslationOptions(), noApiJumpMessage, noApiJumpMessage.content, "bonjour no api jump");
    noApiJumpCachedPlugin.setTranslationCache(noApiJumpCachedPlugin.getTranslationCacheKey("bonjour no api jump", noApiJumpOptions), "cached no api jump");
    noApiJumpCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [noApiJumpMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(noApiJumpCachedPlugin.autoTranslationQueue.length, 0);
    assert.ok(noApiJumpRetryDelay > 0);
    clearTimeout(noApiJumpCachedPlugin.translationCacheDirtyTimer);
    noApiJumpCachedPlugin.translationCacheDirtyTimer = null;

    const sakuraHealthGatePlugin = new Plugin();
    sakuraHealthGatePlugin.settings.translation.enabled = true;
    sakuraHealthGatePlugin.settings.translation.provider = "sakuraLocal";
    sakuraHealthGatePlugin.settings.ui.autoTranslateMessages = true;
    sakuraHealthGatePlugin.settings.translation.apiKey = "";
    sakuraHealthGatePlugin.settings.translation.targetLanguage = "Chinese";
    sakuraHealthGatePlugin.isElementVisibleInViewport = () => true;
    sakuraHealthGatePlugin.getMessageContentElement = message => message.content;
    sakuraHealthGatePlugin.getCachedElementText = content => content.text;
    sakuraHealthGatePlugin.getElementText = content => content.text;
    sakuraHealthGatePlugin.shouldAutoTranslateText = () => true;
    sakuraHealthGatePlugin.hasCurrentTranslationLine = () => false;
    let sakuraHealthProbeStarted = "";
    let sakuraHealthGateDrainCount = 0;
    let sakuraHealthGateLoadingRendered = false;
    sakuraHealthGatePlugin.startLocalProviderHealthProbe = providerKey => { sakuraHealthProbeStarted = providerKey; };
    sakuraHealthGatePlugin.drainAutoTranslationQueue = () => { sakuraHealthGateDrainCount++; };
    sakuraHealthGatePlugin.renderPendingAutoTranslationLoading = () => { sakuraHealthGateLoadingRendered = true; };
    sakuraHealthGatePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ id: "sakura-health", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour sakura" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(sakuraHealthGatePlugin.autoTranslationQueue.length, 1);
    assert.equal(sakuraHealthGatePlugin.autoTranslationPendingTargets.size, 1);
    assert.equal(sakuraHealthGateDrainCount, 0);
    assert.equal(sakuraHealthGateLoadingRendered, false);
    assert.equal(sakuraHealthProbeStarted, sakuraHealthGatePlugin.getAutoTranslationProviderKey(sakuraHealthGatePlugin.getAutoTranslationOptions()));
    assert.notEqual(sakuraHealthGatePlugin.autoTranslationRetryTimer, null);
    clearTimeout(sakuraHealthGatePlugin.autoTranslationRetryTimer);
    sakuraHealthGatePlugin.autoTranslationRetryTimer = null;

    const sakuraUnavailablePlugin = new Plugin();
    sakuraUnavailablePlugin.settings.translation.enabled = true;
    sakuraUnavailablePlugin.settings.translation.provider = "sakuraLocal";
    sakuraUnavailablePlugin.settings.ui.autoTranslateMessages = true;
    sakuraUnavailablePlugin.settings.translation.apiKey = "";
    sakuraUnavailablePlugin.settings.translation.targetLanguage = "Chinese";
    sakuraUnavailablePlugin.settings.translation.apiStatus = { state: "success", message: "" };
    sakuraUnavailablePlugin.isElementVisibleInViewport = () => true;
    sakuraUnavailablePlugin.getMessageContentElement = message => message.content;
    sakuraUnavailablePlugin.getCachedElementText = content => content.text;
    sakuraUnavailablePlugin.getElementText = content => content.text;
    sakuraUnavailablePlugin.shouldAutoTranslateText = () => true;
    sakuraUnavailablePlugin.hasCurrentTranslationLine = () => false;
    let sakuraUnavailableLoadingRendered = false;
    sakuraUnavailablePlugin.renderPendingAutoTranslationLoading = () => { sakuraUnavailableLoadingRendered = true; };
    const sakuraUnavailableOptions = sakuraUnavailablePlugin.getAutoTranslationOptions();
    sakuraUnavailablePlugin.autoTranslationProviderFailures.set(sakuraUnavailableOptions.providerKey, {
        type: "local-unavailable",
        retryAt: Date.now() + 60000,
        retryAfterMs: 60000
    });
    sakuraUnavailablePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ id: "sakura-unavailable", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola sakura" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(sakuraUnavailablePlugin.autoTranslationQueue.length, 1);
    assert.equal(sakuraUnavailablePlugin.autoTranslationPendingTargets.size, 1);
    assert.equal(sakuraUnavailableLoadingRendered, false);
    assert.notEqual(sakuraUnavailablePlugin.autoTranslationRetryTimer, null);
    clearTimeout(sakuraUnavailablePlugin.autoTranslationRetryTimer);
    sakuraUnavailablePlugin.autoTranslationRetryTimer = null;
    sakuraUnavailablePlugin.autoTranslationRetryAt = 0;

    const sakuraUnavailableCachedPlugin = new Plugin();
    let sakuraUnavailableCachedRendered = "";
    sakuraUnavailableCachedPlugin.settings.translation.enabled = true;
    sakuraUnavailableCachedPlugin.settings.translation.provider = "sakuraLocal";
    sakuraUnavailableCachedPlugin.settings.ui.autoTranslateMessages = true;
    sakuraUnavailableCachedPlugin.settings.translation.apiKey = "";
    sakuraUnavailableCachedPlugin.settings.translation.targetLanguage = "Chinese";
    sakuraUnavailableCachedPlugin.settings.translation.apiStatus = { state: "success", message: "" };
    sakuraUnavailableCachedPlugin.isElementVisibleInViewport = () => true;
    sakuraUnavailableCachedPlugin.getMessageContentElement = message => message.content;
    sakuraUnavailableCachedPlugin.getCachedElementText = content => content.text;
    sakuraUnavailableCachedPlugin.getElementText = content => content.text;
    sakuraUnavailableCachedPlugin.shouldAutoTranslateText = text => text === "bonjour cached sakura";
    sakuraUnavailableCachedPlugin.hasCurrentTranslationLine = () => false;
    sakuraUnavailableCachedPlugin.renderTranslation = (messageNode, content, translated) => { sakuraUnavailableCachedRendered = translated; };
    const sakuraUnavailableCachedMessage = { id: "sakura-cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour cached sakura" } };
    const sakuraUnavailableCachedOptions = sakuraUnavailableCachedPlugin.withMessageIdentity(sakuraUnavailableCachedPlugin.getAutoTranslationOptions(), sakuraUnavailableCachedMessage, sakuraUnavailableCachedMessage.content, "bonjour cached sakura");
    const sakuraUnavailableCachedKey = sakuraUnavailableCachedPlugin.getTranslationCacheKey("bonjour cached sakura", sakuraUnavailableCachedOptions);
    sakuraUnavailableCachedPlugin.setTranslationCache(sakuraUnavailableCachedKey, "\u5df2\u7ffb\u8bd1\u7684 Sakura \u7f13\u5b58");
    sakuraUnavailableCachedPlugin.autoTranslationProviderFailures.set(sakuraUnavailableCachedOptions.providerKey, {
        type: "local-unavailable",
        retryAt: Date.now() + 60000,
        retryAfterMs: 60000
    });
    sakuraUnavailableCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [sakuraUnavailableCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(sakuraUnavailableCachedRendered, "\u5df2\u7ffb\u8bd1\u7684 Sakura \u7f13\u5b58");
    assert.equal(sakuraUnavailableCachedPlugin.autoTranslationQueue.length, 0);
    assert.equal(sakuraUnavailableCachedPlugin.autoTranslationProviderFailures.has(sakuraUnavailableCachedOptions.providerKey), true);
    clearTimeout(sakuraUnavailableCachedPlugin.autoTranslationRetryTimer);
    sakuraUnavailableCachedPlugin.autoTranslationRetryTimer = null;
    clearTimeout(sakuraUnavailableCachedPlugin.translationCacheDirtyTimer);
    sakuraUnavailableCachedPlugin.translationCacheDirtyTimer = null;

    let cleanupSelector = "";
    assert.equal(plugin.getElementText({
        cloneNode: () => ({
            querySelectorAll: selector => {
                cleanupSelector = selector;
                return [];
            },
            textContent: "@Alice hello"
        })
    }), "@Alice hello");
    assert.equal(plugin.normalizeExtractedText(" привет  \n\n есть схема  "), "привет\nесть схема");
    assert.equal(cleanupSelector.includes("[role='button']"), false);
    assert.equal(cleanupSelector.split(",").includes("button"), false);
    assert.equal(cleanupSelector.includes("[data-slate-placeholder='true']"), true);
    const directTextPlugin = new Plugin();
    const directMessageRoot = {
        nodeType: 1,
        parentElement: null,
        matches: selector => String(selector || "").includes("chat-messages")
    };
    const directTextNode = { nodeType: 3, nodeValue: "cached message text", parentElement: null };
    const directTextContent = {
        nodeType: 1,
        nodeName: "SPAN",
        tagName: "SPAN",
        isConnected: true,
        parentElement: directMessageRoot,
        childNodes: [directTextNode],
        dataset: {},
        className: "messageContent",
        getAttribute: () => "",
        matches: () => false,
        closest: selector => String(selector || "").includes("chat-messages") ? directMessageRoot : null,
        cloneNode: () => { throw new Error("direct extraction should not clone live message DOM"); }
    };
    directTextNode.parentElement = directTextContent;
    assert.equal(directTextPlugin.getElementText(directTextContent), "cached message text");
    directTextNode.nodeValue = "changed message text";
    assert.equal(directTextPlugin.getElementText(directTextContent), "cached message text");
    directTextPlugin.invalidateElementTextCacheForMutations([{ type: "characterData", target: directTextNode }]);
    assert.equal(directTextPlugin.getElementText(directTextContent), "changed message text");
    const foreignTranslationRoot = {
        nodeType: 1,
        className: "OtherTranslatorPanel",
        getAttribute: () => "",
        matches: () => false,
        cloneNode: () => { throw new Error("foreign translation root should not be cloned"); },
        textContent: "\u5df2\u7ffb\u8bd1\u7684\u5916\u90e8\u63d2\u4ef6\u6587\u672c"
    };
    assert.equal(plugin.getElementText(foreignTranslationRoot), "");
    assert.equal(plugin.getElementRawText(foreignTranslationRoot), "");
    const metadataPlugin = new Plugin();
    metadataPlugin.getElementText = () => {
        throw new Error("metadata should use provided source text");
    };
    const metadataLine = { dataset: {} };
    const metadataContent = { dataset: {} };
    metadataPlugin.getMessageIdentity = () => "metadata-identity";
    metadataPlugin.setTranslationLineMetadata(metadataLine, {}, metadataContent, "manual\n---\nmetadata-identity\n---\ncache", "source text");
    assert.equal(metadataLine.dataset.daitCacheSig, metadataPlugin.getStrongTextFingerprint("manual\n---\nmetadata-identity\n---\ncache"));
    assert.equal(metadataLine.dataset.daitSourceKey, metadataPlugin.getTextFingerprint("source text"));
    assert.equal(metadataLine.dataset.daitSourceSig, metadataPlugin.getStrongTextFingerprint("source text"));
    assert.equal(metadataLine.dataset.daitIdentityKey, metadataPlugin.getTextFingerprint("metadata-identity"));
    assert.equal(metadataLine.dataset.daitIdentitySig, metadataPlugin.getStrongTextFingerprint("metadata-identity"));

    const renderTextWrapperPlugin = new Plugin();
    renderTextWrapperPlugin.settings.ui.maskTranslations = true;
    const renderChildren = [];
    const renderLine = {
        dataset: {},
        classList: {
            add() {},
            remove() {}
        },
        appendChild(child) {
            renderChildren.push(child);
            return child;
        },
        set textContent(value) {
            this._textContent = value;
            if (value === "") renderChildren.length = 0;
        },
        get textContent() {
            return this._textContent || "";
        }
    };
    renderTextWrapperPlugin.ensureTranslationNode = () => renderLine;
    renderTextWrapperPlugin.setTranslationLineMetadata = () => {};
    const savedDocumentForRenderWrapper = global.document;
    global.document = { createElement: tag => createFakeElement(tag) };
    renderTextWrapperPlugin.renderTranslation({}, {}, "wrapped translation", "cache-key", "source");
    global.document = savedDocumentForRenderWrapper;
    // The text span first, then the empty anchor of the hover toolbar (copy / retranslate / hide), which adds no text;
    // the toolbar itself is built on the line's first pointerenter or focusin.
    assert.equal(renderChildren.length, 2);
    assert.equal(renderChildren[0].className, "dait-translation-text");
    assert.equal(renderChildren[0].textContent, "wrapped translation");
    assert.equal(renderChildren[1].className, "dait-translation-actions-anchor");
    assert.equal(renderChildren[1].children.length, 0);
    assert.equal(renderChildren[1].getAttribute("tabindex"), "0");

    const emojiRenderPlugin = new Plugin();
    const sourceEmoji = createFakeElement("img");
    sourceEmoji.setAttribute("alt", ":emoji_12:");
    sourceEmoji.setAttribute("src", "https://cdn.discord.test/emojis/12.webp");
    sourceEmoji.closest = () => null;
    sourceEmoji.cloneNode = () => {
        const clone = createFakeElement("img");
        clone.setAttribute("alt", sourceEmoji.getAttribute("alt"));
        clone.setAttribute("src", sourceEmoji.getAttribute("src"));
        return clone;
    };
    const emojiContent = {
        querySelectorAll: selector => selector === "img[alt]" ? [sourceEmoji] : []
    };
    const savedDocumentForEmojiRender = global.document;
    global.document = {
        createTextNode: value => ({ nodeType: 3, textContent: String(value), parentElement: null })
    };
    const emojiContainer = createFakeElement("span");
    assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(emojiContainer, "\u88ab\u9759\u97f3\u4e86 :emoji_12:", emojiContent), true);
    assert.equal(emojiContainer.children.length, 2);
    assert.equal(emojiContainer.children[0].textContent, "\u88ab\u9759\u97f3\u4e86 ");
    assert.equal(emojiContainer.children[1].getAttribute("alt"), ":emoji_12:");
    assert.equal(fakeElementHasClass(emojiContainer.children[1], "dait-translation-emoji"), true);

    const markupEmojiContainer = createFakeElement("span");
    assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(markupEmojiContainer, "\u88ab\u9759\u97f3\u4e86 <:emoji_12:123456789>", emojiContent), true);
    assert.equal(markupEmojiContainer.children.length, 2);
    assert.equal(markupEmojiContainer.children[1].getAttribute("alt"), ":emoji_12:");

    // A second ":emoji_12:" (literal text in the message) stays text instead of vetoing the line.
    const duplicateEmojiContainer = createFakeElement("span");
    assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(duplicateEmojiContainer, "A :emoji_12: :emoji_12:", emojiContent), true);
    assert.equal(duplicateEmojiContainer.children.filter(child => child.getAttribute?.("alt") === ":emoji_12:").length, 1);
    assert.equal(duplicateEmojiContainer.children[duplicateEmojiContainer.children.length - 1].textContent, " :emoji_12:");

    const uncloneableEmoji = { ...sourceEmoji, cloneNode: () => { throw new Error("clone failed"); } };
    const uncloneableContent = { querySelectorAll: () => [uncloneableEmoji] };
    const fallbackEmojiContainer = createFakeElement("span");
    assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(fallbackEmojiContainer, "\u88ab\u9759\u97f3\u4e86 :emoji_12:", uncloneableContent), false);
    assert.equal(fallbackEmojiContainer.children.length, 0);

    const unrelatedEmojiContainer = createFakeElement("span");
    assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(unrelatedEmojiContainer, "keep :not_from_source:", emojiContent), false);
    assert.equal(unrelatedEmojiContainer.children.length, 0);
    global.document = savedDocumentForEmojiRender;

    const hideOriginalPlugin = new Plugin();
    hideOriginalPlugin.settings.ui.hideOriginalAfterTranslation = true;
    const hideOriginalClasses = new Set();
    const hideOriginalLine = {
        dataset: {},
        classList: {
            add: name => hideOriginalClasses.add(name),
            remove: (...names) => names.forEach(name => hideOriginalClasses.delete(name)),
            contains: name => hideOriginalClasses.has(name),
            toggle: (name, enabled) => enabled ? hideOriginalClasses.add(name) : hideOriginalClasses.delete(name)
        },
        appendChild(child) {
            this.child = child;
            return child;
        },
        set textContent(value) { this._textContent = value; },
        get textContent() { return this._textContent || ""; }
    };
    const hideOriginalStyleOps = [];
    const hideOriginalContent = {
        dataset: {},
        style: {
            setProperty(name, value) { hideOriginalStyleOps.push(["set", name, value]); },
            removeProperty(name) { hideOriginalStyleOps.push(["remove", name]); }
        }
    };
    hideOriginalPlugin.ensureTranslationNode = () => hideOriginalLine;
    hideOriginalPlugin.setTranslationLineMetadata = () => {};
    hideOriginalPlugin.getElementText = () => "need upi scan\nAnyone who can do scans";
    hideOriginalPlugin.isReplyPreviewElement = () => false;
    const savedDocumentForHideOriginal = global.document;
    global.document = { createElement: tag => createFakeElement(tag) };
    hideOriginalPlugin.renderTranslation({}, hideOriginalContent, "translated", "cache-key", "need upi scan\nAnyone who can do scans");
    global.document = savedDocumentForHideOriginal;
    assert.equal(hideOriginalContent.dataset.daitSourceHidden, "true");
    assert.equal(hideOriginalStyleOps.some(op => op[0] === "set" && op[1] === "--dait-source-mask-lines" && op[2] === "2"), true);
    hideOriginalPlugin.renderTranslationLoading({}, hideOriginalContent, "cache-key", "source");
    assert.equal(hideOriginalContent.dataset.daitSourceHidden, undefined);

    const maskedHideOriginalPlugin = new Plugin();
    maskedHideOriginalPlugin.settings.ui.hideOriginalAfterTranslation = true;
    maskedHideOriginalPlugin.settings.ui.maskTranslations = true;
    const maskedHideClasses = new Set();
    const maskedHideLine = {
        dataset: {},
        parentElement: null,
        nextSibling: null,
        previousSibling: null,
        className: "",
        classList: {
            add: name => maskedHideClasses.add(name),
            remove: name => maskedHideClasses.delete(name),
            contains: name => maskedHideClasses.has(name),
            toggle: (name, enabled) => enabled ? maskedHideClasses.add(name) : maskedHideClasses.delete(name)
        },
        appendChild(child) { this.child = child; return child; },
        addEventListener(type, handler) { this.listener = handler; },
        remove() {},
        set textContent(value) { this._textContent = value; },
        get textContent() { return this._textContent || ""; }
    };
    const maskedHideContent = { dataset: {}, style: { setProperty() {}, removeProperty() {} }, parentElement: { insertBefore(node) { node.parentElement = this; } } };
    const savedDocumentForMaskedHide = global.document;
    let maskedHideLineCreated = false;
    // The first element created is the line; the text span and toolbar get their own elements.
    global.document = {
        createElement: tag => {
            if (maskedHideLineCreated) return createFakeElement(tag);
            maskedHideLineCreated = true;
            return maskedHideLine;
        }
    };
    maskedHideOriginalPlugin.getTranslationLine = () => null;
    maskedHideOriginalPlugin.getTranslationLines = () => [];
    maskedHideOriginalPlugin.isReplyPreviewElement = () => false;
    maskedHideOriginalPlugin.setTranslationLineMetadata = () => {};
    maskedHideOriginalPlugin.getElementText = () => "source";
    maskedHideOriginalPlugin.renderTranslation({}, maskedHideContent, "translated", "cache-key", "source");
    global.document = savedDocumentForMaskedHide;
    assert.equal(maskedHideContent.dataset.daitSourceHidden, undefined);
    maskedHideLine.listener({ preventDefault() {}, stopPropagation() {} });
    assert.equal(maskedHideContent.dataset.daitSourceHidden, "true");

    const maskedClickPlugin = new Plugin();
    const maskedClasses = new Set();
    const maskedLine = {
        dataset: {},
        parentElement: null,
        nextSibling: null,
        previousSibling: null,
        classList: {
            add: name => maskedClasses.add(name),
            remove: name => maskedClasses.delete(name),
            contains: name => maskedClasses.has(name),
            toggle: (name, enabled) => enabled ? maskedClasses.add(name) : maskedClasses.delete(name)
        },
        addEventListener(type, handler) {
            this.listenerType = type;
            this.listener = handler;
        },
        remove() {
            this.removed = true;
        }
    };
    const savedDocumentForMaskedClick = global.document;
    global.document = {
        createElement: () => maskedLine
    };
    maskedClickPlugin.getTranslationLine = () => null;
    maskedClickPlugin.getTranslationLines = () => [];
    maskedClickPlugin.isReplyPreviewElement = () => false;
    const maskedAnchor = {
        insertBefore(node) {
            node.parentElement = this;
        }
    };
    const maskedContent = { dataset: {}, parentElement: maskedAnchor };
    const ensuredMaskedLine = maskedClickPlugin.ensureTranslationNode({ isConnected: true }, maskedContent);
    global.document = savedDocumentForMaskedClick;
    maskedClasses.add("dait-translation-masked");
    let maskedPrevented = false;
    let maskedStopped = false;
    ensuredMaskedLine.listener({
        preventDefault: () => { maskedPrevented = true; },
        stopPropagation: () => { maskedStopped = true; }
    });
    assert.equal(ensuredMaskedLine.listenerType, "click");
    assert.equal(maskedPrevented, true);
    assert.equal(maskedStopped, true);
    assert.equal(maskedClasses.has("dait-translation-masked"), false);
    assert.equal(maskedClasses.has("dait-translation-revealed"), true);

    const previewAnchorPlugin = new Plugin();
    let previewCreatedTag = "";
    const previewLine = {
        dataset: {},
        parentElement: null,
        nextSibling: null,
        previousSibling: null,
        className: "",
        classList: {
            add: () => {},
            remove: () => {},
            contains: () => false,
            toggle: () => {}
        },
        addEventListener(type, handler) {
            this.listenerType = type;
            this.listener = handler;
        },
        remove() {
            this.parentElement = null;
        }
    };
    const savedDocumentForPreviewAnchor = global.document;
    global.document = {
        createElement: tag => {
            previewCreatedTag = tag;
            return previewLine;
        }
    };
    previewAnchorPlugin.getTranslationLine = () => null;
    previewAnchorPlugin.getTranslationLines = () => [];
    previewAnchorPlugin.isReplyPreviewElement = element => element?.isPreview === true;
    const previewOuter = {
        inserted: [],
        insertBefore(node) {
            this.inserted.push(node);
            node.parentElement = this;
        }
    };
    const previewContent = {
        dataset: {},
        isPreview: true,
        parentElement: previewOuter,
        firstChild: { nodeType: 3 },
        lastChild: null,
        insertBefore(node) {
            this.insertedBefore = node;
            node.parentElement = this;
        },
        appendChild(node) {
            this.appended = node;
            node.parentElement = this;
        }
    };
    const ensuredPreviewLine = previewAnchorPlugin.ensureTranslationNode({ isConnected: true }, previewContent);
    global.document = savedDocumentForPreviewAnchor;
    assert.equal(previewCreatedTag, "span");
    assert.equal(ensuredPreviewLine.parentElement, previewContent);
    assert.equal(previewOuter.inserted.length, 0);
    assert.equal(previewContent.insertedBefore, ensuredPreviewLine);

    let removedDuplicateLine = false;
    const duplicatePlugin = new Plugin();
    const duplicateOwner = `${duplicatePlugin.translationOwnerPrefix}-duplicate`;
    const duplicateLineA = {
        classList: { contains: name => name === "dait-translation-line" },
        dataset: { daitOwner: duplicateOwner, daitSourceKey: duplicatePlugin.getTextFingerprint("duplicate source") },
        parentElement: null,
        remove: () => {}
    };
    const duplicateLineB = {
        classList: { contains: name => name === "dait-translation-line" },
        dataset: { daitOwner: duplicateOwner, daitSourceKey: duplicatePlugin.getTextFingerprint("duplicate source") },
        parentElement: null,
        remove: () => { removedDuplicateLine = true; }
    };
    const duplicateContent = {
        dataset: { daitOwner: duplicateOwner },
        text: "duplicate source",
        classList: { contains: () => false },
        parentElement: { querySelectorAll: () => [duplicateLineA, duplicateLineB] },
        closest: selector => selector.includes("chat-messages") || selector.includes("data-list-item-id") ? ({ querySelectorAll: () => [] }) : null,
        querySelector: () => null
    };
    duplicateLineA.parentElement = { children: [duplicateLineA, duplicateContent] };
    duplicateLineB.parentElement = { children: [duplicateLineB, duplicateContent] };
    duplicatePlugin.getElementText = content => content.text || "";
    assert.equal(duplicatePlugin.getTranslationLine(duplicateContent), duplicateLineA);
    assert.equal(removedDuplicateLine, true);
    const childLinePlugin = new Plugin();
    const childOwner = `${childLinePlugin.translationOwnerPrefix}-child`;
    const childLine = {
        classList: { contains: name => name === "dait-translation-line" },
        dataset: { daitOwner: childOwner, daitSourceKey: childLinePlugin.getTextFingerprint("child source") },
        parentElement: null,
        remove: () => {}
    };
    const childContent = {
        dataset: { daitOwner: childOwner },
        text: "child source",
        classList: { contains: () => false },
        querySelectorAll: selector => selector.includes(childOwner) ? [childLine] : [],
        parentElement: { querySelectorAll: () => [] },
        closest: selector => selector.includes("chat-messages") || selector.includes("data-list-item-id") ? ({ querySelectorAll: () => [] }) : null
    };
    childLine.parentElement = childContent;
    childLinePlugin.getElementText = content => content.text || "";
    assert.equal(childLinePlugin.getTranslationLine(childContent), childLine);
    const ownerPlugin = new Plugin();
    ownerPlugin.translationOwnerPrefix = "run-test";
    const ownerContent = { dataset: { daitOwner: "old-run-99" } };
    assert.equal(ownerPlugin.getTranslationOwnerId(ownerContent), "run-test-1");
    assert.equal(ownerPlugin.getTranslationOwnerId(ownerContent), "run-test-1");
    let removedStaleLine = false;
    let removedOldOwnerLine = false;
    const staleContent = {
        dataset: { daitOwner: "owner-stale" },
        isConnected: true,
        text: "new source",
        classList: { contains: () => false }
    };
    const staleLine = {
        dataset: { daitOwner: "owner-stale", daitSourceKey: plugin.getTextFingerprint("old source") },
        parentElement: { children: [] },
        classList: { contains: () => false },
        remove: () => { removedStaleLine = true; }
    };
    staleLine.parentElement.children = [staleLine, staleContent];
    const oldOwnerLine = {
        dataset: { daitOwner: "old-owner-1", daitSourceKey: plugin.getTextFingerprint("old source") },
        classList: { contains: () => false },
        remove: () => { removedOldOwnerLine = true; }
    };
    const reconcilePlugin = new Plugin();
    reconcilePlugin.getElementText = content => content.text;
    const savedDocumentForReconcile = global.document;
    global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [staleLine, oldOwnerLine] : [] };
    reconcilePlugin.reconcileTranslationLines();
    assert.equal(removedStaleLine, true);
    assert.equal(removedOldOwnerLine, true);
    global.document = savedDocumentForReconcile;

    let removedRangeLine = false;
    let removedOutOfRangeLine = false;
    const rangeReconcilePlugin = new Plugin();
    rangeReconcilePlugin.translationOwnerPrefix = "range-reconcile";
    rangeReconcilePlugin.getElementText = content => content.text;
    const rangeContent = {
        dataset: { daitOwner: "range-reconcile-1" },
        isConnected: true,
        text: "new visible source",
        classList: { contains: () => false }
    };
    const rangeLine = {
        dataset: { daitOwner: "range-reconcile-1", daitSourceKey: rangeReconcilePlugin.getTextFingerprint("old visible source") },
        parentElement: { children: [] },
        classList: { contains: () => false },
        remove: () => { removedRangeLine = true; }
    };
    rangeLine.parentElement.children = [rangeLine, rangeContent];
    const outOfRangeContent = {
        dataset: { daitOwner: "range-reconcile-2" },
        isConnected: true,
        text: "new hidden source",
        classList: { contains: () => false }
    };
    const outOfRangeLine = {
        dataset: { daitOwner: "range-reconcile-2", daitSourceKey: rangeReconcilePlugin.getTextFingerprint("old hidden source") },
        parentElement: { children: [] },
        classList: { contains: () => false },
        remove: () => { removedOutOfRangeLine = true; }
    };
    outOfRangeLine.parentElement.children = [outOfRangeLine, outOfRangeContent];
    const rangeMessageNode = {
        querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [rangeLine] : []
    };
    const savedDocumentForRangeReconcile = global.document;
    global.document = { querySelectorAll: () => [rangeLine, outOfRangeLine] };
    rangeReconcilePlugin.reconcileTranslationLines({ messageNodes: [rangeMessageNode] });
    assert.equal(removedRangeLine, true);
    assert.equal(removedOutOfRangeLine, false);
    global.document = savedDocumentForRangeReconcile;

    let removedPausedAutoLine = false;
    const pausedReconcilePlugin = new Plugin();
    pausedReconcilePlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    pausedReconcilePlugin.translationOwnerPrefix = "paused-reconcile";
    pausedReconcilePlugin.getElementText = content => content.text;
    const pausedAutoContent = {
        dataset: { daitOwner: "paused-reconcile-1" },
        isConnected: true,
        text: "new paused source",
        classList: { contains: () => false }
    };
    const pausedAutoLine = {
        dataset: {
            daitOwner: "paused-reconcile-1",
            daitMode: "auto",
            daitSourceKey: pausedReconcilePlugin.getTextFingerprint("old paused source")
        },
        parentElement: { children: [] },
        classList: { contains: () => false },
        remove: () => { removedPausedAutoLine = true; }
    };
    pausedAutoLine.parentElement.children = [pausedAutoLine, pausedAutoContent];
    const savedDocumentForPausedReconcile = global.document;
    global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [pausedAutoLine] : [] };
    pausedReconcilePlugin.reconcileTranslationLines();
    assert.equal(removedPausedAutoLine, false);
    global.document = savedDocumentForPausedReconcile;

    let removedIdentityMismatchLine = false;
    const identityPlugin = new Plugin();
    identityPlugin.translationOwnerPrefix = "identity-test";
    identityPlugin.getElementText = content => content.text;
    identityPlugin.getMessageIdentity = () => "current-identity";
    const identityContent = {
        dataset: { daitOwner: "identity-test-1" },
        isConnected: true,
        text: "same text",
        classList: { contains: () => false }
    };
    const identityLine = {
        dataset: {
            daitOwner: "identity-test-1",
            daitSourceKey: identityPlugin.getTextFingerprint("same text"),
            daitIdentityKey: identityPlugin.getTextFingerprint("old-identity")
        },
        parentElement: { children: [] },
        classList: { contains: () => false },
        closest: () => ({ id: "chat-messages-1-2" }),
        remove: () => { removedIdentityMismatchLine = true; }
    };
    identityLine.parentElement.children = [identityLine, identityContent];
    const savedDocumentForIdentityReconcile = global.document;
    global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [identityLine] : [] };
    identityPlugin.reconcileTranslationLines();
    assert.equal(removedIdentityMismatchLine, true);
    global.document = savedDocumentForIdentityReconcile;

    let removedAutoTextIdentityLine = false;
    const autoTextIdentityPlugin = new Plugin();
    autoTextIdentityPlugin.translationOwnerPrefix = "auto-text-identity";
    autoTextIdentityPlugin.getElementText = content => content.text;
    autoTextIdentityPlugin.getMessageIdentity = () => "current-auto-text-identity";
    const autoTextIdentityContent = {
        dataset: { daitOwner: "auto-text-identity-1" },
        isConnected: true,
        text: "same auto text",
        classList: { contains: () => false }
    };
    const autoTextIdentityLine = {
        dataset: {
            daitOwner: "auto-text-identity-1",
            daitMode: "auto-text",
            daitSourceKey: autoTextIdentityPlugin.getTextFingerprint("same auto text"),
            daitIdentityKey: autoTextIdentityPlugin.getTextFingerprint("old-auto-text-identity")
        },
        parentElement: { children: [] },
        classList: { contains: () => false },
        closest: () => ({ id: "chat-messages-1-2" }),
        remove: () => { removedAutoTextIdentityLine = true; }
    };
    autoTextIdentityLine.parentElement.children = [autoTextIdentityLine, autoTextIdentityContent];
    const savedDocumentForAutoTextIdentityReconcile = global.document;
    global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [autoTextIdentityLine] : [] };
    autoTextIdentityPlugin.reconcileTranslationLines();
    assert.equal(removedAutoTextIdentityLine, false);
    global.document = savedDocumentForAutoTextIdentityReconcile;

    const legacyLinePlugin = new Plugin();
    const legacyLinePrimaryKey = legacyLinePlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    const legacyLineAliasKey = legacyLinePlugin.getLegacyTranslationCacheKey("bonjour", { mode: "manual" });
    const legacyLineContent = {
        dataset: { daitOwner: "owner-legacy-line" },
        text: "bonjour",
        parentElement: { querySelectorAll: () => [] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => legacyLine
    };
    const legacyLine = {
        classList: { contains: () => false },
        dataset: {
            daitOwner: "owner-legacy-line",
            daitCacheKey: legacyLinePlugin.getTextFingerprint(legacyLineAliasKey),
            daitMode: "manual",
            daitSourceKey: legacyLinePlugin.getTextFingerprint("bonjour")
        },
        parentElement: { children: [] },
        remove: () => { throw new Error("legacy cache line should stay current through alias"); }
    };
    legacyLine.parentElement.children = [legacyLine, legacyLineContent];
    legacyLineContent.parentElement.querySelectorAll = () => [legacyLine];
    assert.equal(legacyLinePlugin.hasCurrentTranslationLine(
        legacyLineContent,
        legacyLinePrimaryKey,
        "bonjour",
        legacyLinePlugin.getTranslationLineCacheAliases("bonjour", { mode: "manual" })
    ), true);

    let removedPreIdentityLine = false;
    const preIdentityLinePlugin = new Plugin();
    const preIdentityLineOptions = {
        ...preIdentityLinePlugin.getAutoTranslationOptions(),
        messageIdentity: "message:guild:channel:555555555555555555:source"
    };
    const preIdentityLinePrimaryKey = preIdentityLinePlugin.getTranslationCacheKey("bonjour", preIdentityLineOptions);
    const preIdentityLineAliasKey = preIdentityLinePlugin.getPreMessageIdentityTranslationCacheKey("bonjour", preIdentityLineOptions);
    const preIdentityLine = {
        classList: { contains: () => false },
        dataset: {
            daitCacheKey: preIdentityLinePlugin.getTextFingerprint(preIdentityLineAliasKey),
            daitMode: "auto",
            daitSourceKey: preIdentityLinePlugin.getTextFingerprint("bonjour")
        },
        remove: () => { removedPreIdentityLine = true; }
    };
    const preIdentityLineContent = {
        dataset: { daitOwner: "owner-pre-identity-line" },
        text: "bonjour",
        parentElement: { querySelectorAll: () => [preIdentityLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => preIdentityLine
    };
    assert.equal(preIdentityLinePlugin.hasCurrentTranslationLine(
        preIdentityLineContent,
        preIdentityLinePrimaryKey,
        "bonjour",
        preIdentityLinePlugin.getTranslationLineCacheAliases("bonjour", preIdentityLineOptions)
    ), false);
    assert.equal(removedPreIdentityLine, true);

    let removedInvalidAutoLine = false;
    const invalidAutoLinePlugin = new Plugin();
    const invalidAutoLineOptions = invalidAutoLinePlugin.getAutoTranslationOptions();
    const invalidAutoLinePrimaryKey = invalidAutoLinePlugin.getTranslationCacheKey("\u042d\u043c", invalidAutoLineOptions);
    const invalidAutoLineAliases = invalidAutoLinePlugin.getTranslationLineCacheAliases("\u042d\u043c", invalidAutoLineOptions);
    invalidAutoLinePlugin.setTranslationCache(invalidAutoLinePrimaryKey, promptLeakOutput);
    invalidAutoLinePlugin.setAutoTextTranslationCache("\u042d\u043c", invalidAutoLineOptions, promptLeakOutput);
    const invalidAutoLine = {
        classList: { contains: () => false },
        dataset: {
            daitCacheSig: invalidAutoLinePlugin.getStrongTextFingerprint(invalidAutoLinePrimaryKey),
            daitMode: "auto",
            daitSourceSig: invalidAutoLinePlugin.getStrongTextFingerprint("\u042d\u043c")
        },
        textContent: promptLeakOutput,
        querySelector: selector => selector === ".dait-translation-text" ? { textContent: promptLeakOutput } : null,
        remove: () => { removedInvalidAutoLine = true; }
    };
    const invalidAutoLineContent = {
        dataset: { daitOwner: "owner-invalid-auto-line" },
        text: "\u042d\u043c",
        parentElement: { querySelectorAll: () => [invalidAutoLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => invalidAutoLine
    };
    assert.equal(invalidAutoLinePlugin.hasCurrentTranslationLine(
        invalidAutoLineContent,
        invalidAutoLinePrimaryKey,
        "\u042d\u043c",
        invalidAutoLineAliases,
        invalidAutoLineOptions
    ), false);
    assert.equal(removedInvalidAutoLine, true);
    assert.equal(invalidAutoLinePlugin.getTranslationCacheValue(invalidAutoLinePrimaryKey), null);
    assert.equal(invalidAutoLinePlugin.getAutoTextTranslationCacheValue("\u042d\u043c", invalidAutoLineOptions), null);

    let removedPartialAutoLine = false;
    const partialAutoLinePlugin = new Plugin();
    const partialAutoLineOptions = partialAutoLinePlugin.getAutoTranslationOptions();
    const partialAutoLinePrimaryKey = partialAutoLinePlugin.getTranslationCacheKey("partial source", partialAutoLineOptions);
    partialAutoLinePlugin.getAutoTranslationOutputValidationResult = () => ({
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
    const partialAutoLine = {
        classList: { contains: name => name === "dait-translation-partial" },
        dataset: {
            daitCacheSig: partialAutoLinePlugin.getStrongTextFingerprint(partialAutoLinePrimaryKey),
            daitMode: "auto",
            daitSourceSig: partialAutoLinePlugin.getStrongTextFingerprint("partial source"),
            daitValidationQuality: "partial"
        },
        textContent: "\u90e8\u5206\u8bd1\u6587",
        querySelector: selector => selector === ".dait-translation-text" ? { textContent: "\u90e8\u5206\u8bd1\u6587" } : null,
        remove: () => { removedPartialAutoLine = true; }
    };
    const partialAutoLineContent = {
        dataset: { daitOwner: "owner-partial-auto-line" },
        text: "partial source",
        parentElement: { querySelectorAll: () => [partialAutoLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => partialAutoLine
    };
    assert.equal(partialAutoLinePlugin.hasCurrentTranslationLine(
        partialAutoLineContent,
        partialAutoLinePrimaryKey,
        "partial source",
        partialAutoLinePlugin.getTranslationLineCacheAliases("partial source", partialAutoLineOptions),
        partialAutoLineOptions
    ), true);
    assert.equal(removedPartialAutoLine, false);
    assert.equal(partialAutoLinePlugin.autoTranslationRecentRenders.size, 1);

    const ownerChangedLinePlugin = new Plugin();
    const ownerChangedOptions = ownerChangedLinePlugin.getAutoTranslationOptions();
    const ownerChangedCacheKey = ownerChangedLinePlugin.getTranslationCacheKey("owner changed source", ownerChangedOptions);
    ownerChangedLinePlugin.getElementText = content => content.text;
    ownerChangedLinePlugin.getAutoTranslationOutputValidationResult = () => ({
        quality: "good",
        reasonCode: "",
        renderable: true,
        cacheable: true,
        shouldRepair: false,
        targetLanguageRatio: 1,
        residualSourceRatio: 0,
        sameAsSource: false,
        refusal: false
    });
    const ownerChangedParent = {
        dataset: {},
        children: [],
        querySelectorAll: () => ownerChangedParent.children,
        insertBefore(node) {
            if (!ownerChangedParent.children.includes(node)) ownerChangedParent.children.push(node);
            node.parentElement = ownerChangedParent;
        },
        appendChild(node) {
            if (!ownerChangedParent.children.includes(node)) ownerChangedParent.children.push(node);
            node.parentElement = ownerChangedParent;
        }
    };
    const ownerChangedLine = {
        classList: { contains: () => false },
        dataset: {
            daitOwner: "old-owner",
            daitCacheSig: ownerChangedLinePlugin.getStrongTextFingerprint(ownerChangedCacheKey),
            daitMode: "auto",
            daitSourceSig: ownerChangedLinePlugin.getStrongTextFingerprint("owner changed source")
        },
        parentElement: ownerChangedParent,
        textContent: "\u5df2\u6709\u8bd1\u6587",
        querySelector: selector => selector === ".dait-translation-text" ? { textContent: "\u5df2\u6709\u8bd1\u6587" } : null,
        remove: () => { throw new Error("metadata-matched line should be retargeted, not removed"); }
    };
    const ownerChangedContent = {
        dataset: { daitOwner: "new-owner" },
        text: "owner changed source",
        classList: { contains: () => false },
        parentElement: ownerChangedParent,
        querySelector: () => null,
        closest: () => null
    };
    ownerChangedParent.children = [ownerChangedLine, ownerChangedContent];
    assert.equal(ownerChangedLinePlugin.hasCurrentTranslationLine(
        ownerChangedContent,
        ownerChangedCacheKey,
        "owner changed source",
        ownerChangedLinePlugin.getTranslationLineCacheAliases("owner changed source", ownerChangedOptions),
        ownerChangedOptions
    ), true);
    assert.equal(ownerChangedLine.dataset.daitOwner, ownerChangedContent.dataset.daitOwner);

    let removedLegacyAutoLine = false;
    const removeLegacyPlugin = new Plugin();
    const removeLegacyOptions = removeLegacyPlugin.getAutoTranslationOptions();
    const removeLegacyPrimaryKey = removeLegacyPlugin.getTranslationCacheKey("hola", removeLegacyOptions);
    const removeLegacyAliasKey = removeLegacyPlugin.getLegacyTranslationCacheKey("hola", removeLegacyOptions);
    const removeLegacyLine = {
        classList: { contains: () => false },
        dataset: {
            daitCacheKey: removeLegacyPlugin.getTextFingerprint(removeLegacyAliasKey),
            daitMode: "auto",
            daitSourceKey: removeLegacyPlugin.getTextFingerprint("hola")
        },
        remove: () => { removedLegacyAutoLine = true; }
    };
    const removeLegacyContent = {
        dataset: { daitOwner: "owner-remove-legacy" },
        text: "hola",
        parentElement: { querySelectorAll: () => [removeLegacyLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => removeLegacyLine
    };
    removeLegacyPlugin.removeAutoTranslationNode({
        content: removeLegacyContent,
        text: "hola",
        requestOptions: removeLegacyOptions
    }, removeLegacyPrimaryKey);
    assert.equal(removedLegacyAutoLine, true);

    let removedPausedCurrentLine = false;
    const pausedCurrentPlugin = new Plugin();
    pausedCurrentPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    const pausedCurrentLine = {
        classList: { contains: () => false },
        dataset: {
            daitCacheKey: pausedCurrentPlugin.getTextFingerprint("old-auto-cache"),
            daitMode: "auto",
            daitSourceKey: pausedCurrentPlugin.getTextFingerprint("old source")
        },
        remove: () => { removedPausedCurrentLine = true; }
    };
    const pausedCurrentContent = {
        dataset: { daitOwner: "paused-current-owner" },
        text: "new source",
        parentElement: { querySelectorAll: () => [pausedCurrentLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => pausedCurrentLine
    };
    assert.equal(pausedCurrentPlugin.hasCurrentTranslationLine(pausedCurrentContent, "new-auto-cache", "new source"), false);
    assert.equal(removedPausedCurrentLine, true);

    const sigOnlyPlugin = new Plugin();
    sigOnlyPlugin.getElementText = content => content.text;
    const sigOnlyLine = {
        dataset: {
            daitSourceSig: sigOnlyPlugin.getStrongTextFingerprint("sig source")
        },
        classList: { contains: () => false }
    };
    assert.equal(sigOnlyPlugin.isTranslationContentMatchForLine(sigOnlyLine, {
        text: "sig source",
        classList: { contains: () => false }
    }), true);
    assert.equal(sigOnlyPlugin.isTranslationContentMatchForLine(sigOnlyLine, {
        text: "changed source",
        classList: { contains: () => false }
    }), false);

    const errorLine = {
        classList: { contains: name => name === "dait-translation-error" },
        dataset: { daitCacheKey: plugin.getTextFingerprint("auto\n---\ncache"), daitMode: "manual", daitSourceKey: plugin.getTextFingerprint("source") },
        remove: () => { throw new Error("manual error line should not be removed"); }
    };
    const errorContent = {
        dataset: { daitOwner: "owner-error" },
        parentElement: { querySelectorAll: () => [errorLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => errorLine
    };
    assert.equal(plugin.hasCurrentTranslationLine(errorContent, "auto\n---\ncache", "source"), false);
    plugin.removeAutoTranslationNode({ content: errorContent }, "auto\n---\ncache");
    plugin.addAutoTranslationPendingTarget("auto\n---\ncache", { messageNode: {}, content: errorContent, text: "source" });
    plugin.clearPendingAutoTranslationItem({ cacheKey: "auto\n---\ncache" });
    const manualLoadingLine = {
        classList: { contains: name => name === "dait-translation-loading" },
        dataset: { daitCacheKey: plugin.getTextFingerprint("manual\n---\ncache"), daitMode: "manual", daitSourceKey: plugin.getTextFingerprint("source") },
        remove: () => { throw new Error("manual loading line should not be removed by auto check"); }
    };
    const manualLoadingContent = {
        dataset: { daitOwner: "owner-manual-loading" },
        parentElement: { querySelectorAll: () => [manualLoadingLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => manualLoadingLine
    };
    assert.equal(plugin.hasCurrentTranslationLine(manualLoadingContent, "auto\n---\ncache", "source"), false);
    const loadingLine = {
        classList: { contains: name => name === "dait-translation-loading" },
        dataset: { daitCacheKey: plugin.getTextFingerprint("auto\n---\ncache"), daitMode: "auto", daitSourceKey: plugin.getTextFingerprint("source") },
        remove: () => { throw new Error("loading line should not be removed by current check"); }
    };
    const loadingContent = {
        dataset: { daitOwner: "owner-loading" },
        parentElement: { querySelectorAll: () => [loadingLine] },
        closest: () => ({ querySelectorAll: () => [] }),
        querySelector: () => loadingLine
    };
    assert.equal(plugin.hasCurrentTranslationLine(loadingContent, "auto\n---\ncache", "source"), false);
    const staleLoadingPlugin = new Plugin();
    const staleLoadingKey = "auto\n---\nstale-loading";
    const staleLoadingLine = {
        classList: { contains: name => name === "dait-translation-loading" },
        dataset: {
            daitMode: "auto",
            daitLoadingAt: String(Date.now() - 10000),
            daitCacheKey: staleLoadingPlugin.getTextFingerprint(staleLoadingKey)
        }
    };
    assert.equal(staleLoadingPlugin.isStaleAutoTranslationLoadingLine(staleLoadingLine), true);
    const activeLoadingPlugin = new Plugin();
    const activeLoadingKey = "auto\n---\nactive-loading";
    const activeLoadingLine = {
        classList: { contains: name => name === "dait-translation-loading" },
        dataset: {
            daitMode: "auto",
            daitLoadingAt: String(Date.now() - 10000),
            daitCacheKey: activeLoadingPlugin.getTextFingerprint(activeLoadingKey)
        }
    };
    activeLoadingPlugin.autoTranslationQueue.push({ cacheKey: activeLoadingKey });
    activeLoadingPlugin.autoTranslationQueuedKeys.add(activeLoadingKey);
    assert.equal(activeLoadingPlugin.isStaleAutoTranslationLoadingLine(activeLoadingLine), false);
    const originalDocument = global.document;
    const createdErrorNodes = [];
    global.document = {
        createElement: tag => {
            const node = {
                tag,
                className: "",
                dataset: {},
                children: [],
                classList: {
                    add: () => {},
                    remove: () => {},
                    contains: () => false
                },
                appendChild(child) {
                    this.children.push(child);
                },
                addEventListener(type, handler) {
                    this.listenerType = type;
                    this.listener = handler;
                },
                set textContent(value) {
                    this._textContent = value;
                },
                get textContent() {
                    return this._textContent || "";
                }
            };
            createdErrorNodes.push(node);
            return node;
        }
    };
    const errorRenderPlugin = new Plugin();
    const errorRenderLine = {
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); },
        set textContent(value) { this._textContent = value; },
        get textContent() { return this._textContent || ""; }
    };
    errorRenderPlugin.ensureTranslationNode = () => errorRenderLine;
    errorRenderPlugin.setTranslationLineMetadata = () => {};
    const inlineError = new Error("API_ERROR");
    // A server error: Retry can fix it. (Auth errors offer "Open settings" instead; see tests/core/chat-lines.test.js.)
    inlineError.status = 500;
    errorRenderPlugin.renderTranslationError({ isConnected: true }, { isConnected: true }, inlineError, "manual\n---\ncache", "source");
    assert.equal(errorRenderLine.children.length, 2);
    assert.equal(errorRenderLine.children[0].className, "dait-translation-error-message");
    assert.equal(errorRenderLine.children[1].className, "dait-translation-retry");
    assert.equal(errorRenderLine.children[1].listenerType, "click");

    const retryOwnerPlugin = new Plugin();
    let retryFallbackLookup = false;
    let retriedContent = null;
    const retryOwnedContent = { isConnected: true, text: "source", dataset: {} };
    const retryLine = {
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); },
        remove: () => { throw new Error("current retry line should stay"); },
        set textContent(value) { this._textContent = value; },
        get textContent() { return this._textContent || ""; }
    };
    retryOwnerPlugin.ensureTranslationNode = () => retryLine;
    retryOwnerPlugin.setTranslationLineMetadata = (line, messageNode, content, cacheKey, sourceText) => {
        line.dataset.daitSourceKey = retryOwnerPlugin.getTextFingerprint(sourceText);
    };
    retryOwnerPlugin.getTranslationContentForLine = () => retryOwnedContent;
    retryOwnerPlugin.getMessageContentElement = () => {
        retryFallbackLookup = true;
        return { isConnected: true, text: "wrong" };
    };
    retryOwnerPlugin.getElementText = content => content.text;
    retryOwnerPlugin.translateMessage = (messageNode, content) => {
        retriedContent = content;
    };
    retryOwnerPlugin.renderTranslationError({ isConnected: true }, { isConnected: true, text: "fallback" }, inlineError, "manual\n---\ncache", "source");
    retryLine.children[1].listener({ preventDefault: () => {}, stopPropagation: () => {} });
    assert.equal(retriedContent, retryOwnedContent);
    assert.equal(retryFallbackLookup, false);

    const autoRetryPlugin = new Plugin();
    autoRetryPlugin.settings.translation.enabled = true;
    autoRetryPlugin.settings.ui.autoTranslateMessages = true;
    autoRetryPlugin.settings.translation.apiKey = "sk-test";
    const autoRetryContent = { isConnected: true, text: "source", dataset: {} };
    const autoRetryLine = {
        classList: { add: () => {}, remove: () => { autoRetryLine.removed = true; }, contains: () => false },
        dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); },
        remove: () => { autoRetryLine.removed = true; },
        set textContent(value) { this._textContent = value; },
        get textContent() { return this._textContent || ""; }
    };
    autoRetryPlugin.ensureTranslationNode = () => autoRetryLine;
    autoRetryPlugin.setTranslationLineMetadata = (line, messageNode, content, cacheKey, sourceText) => {
        line.dataset.daitSourceKey = autoRetryPlugin.getTextFingerprint(sourceText);
    };
    autoRetryPlugin.getTranslationContentForLine = () => autoRetryContent;
    autoRetryPlugin.getElementText = content => content.text;
    let autoRetryManualTarget = null;
    autoRetryPlugin.translateMessage = (messageNode, content, button, textOptions) => {
        autoRetryManualTarget = { messageNode, content, button, textOptions };
    };
    autoRetryPlugin.retryAutoTranslationTarget = () => { throw new Error("auto retry button should use manual rescue"); };
    let autoRetryDrained = false;
    autoRetryPlugin.drainAutoTranslationQueue = () => { autoRetryDrained = true; };
    const autoRetryCacheKey = autoRetryPlugin.getTranslationCacheKey("source", autoRetryPlugin.getAutoTranslationOptions());
    autoRetryPlugin.renderTranslationError({ isConnected: true }, autoRetryContent, inlineError, autoRetryCacheKey, "source");
    autoRetryLine.children[1].listener({ preventDefault: () => {}, stopPropagation: () => {} });
    assert.equal(autoRetryManualTarget.content, autoRetryContent);
    assert.equal(autoRetryManualTarget.button, null);
    assert.equal(autoRetryPlugin.autoTranslationQueue.length, 0);
    assert.equal(autoRetryPlugin.translationCache.has(autoRetryPlugin.getTranslationCacheKey("source", { mode: "manual" })), false);
    assert.equal(autoRetryDrained, false);

    const staleRetryPlugin = new Plugin();
    let staleRetryRemoved = false;
    let staleRetryCalled = false;
    const staleRetryLine = {
        classList: { add: () => {}, remove: () => {}, contains: () => false },
        dataset: {},
        children: [],
        appendChild(child) { this.children.push(child); },
        remove: () => { staleRetryRemoved = true; },
        set textContent(value) { this._textContent = value; },
        get textContent() { return this._textContent || ""; }
    };
    staleRetryPlugin.ensureTranslationNode = () => staleRetryLine;
    staleRetryPlugin.setTranslationLineMetadata = (line, content, cacheKey, sourceText) => {
        line.dataset.daitSourceKey = staleRetryPlugin.getTextFingerprint(sourceText);
    };
    staleRetryPlugin.getTranslationContentForLine = () => ({ isConnected: true, text: "changed source", dataset: {} });
    staleRetryPlugin.getElementText = content => content.text;
    staleRetryPlugin.translateMessage = () => { staleRetryCalled = true; };
    staleRetryPlugin.showToast = () => {};
    staleRetryPlugin.renderTranslationError({ isConnected: true }, { isConnected: true, text: "fallback" }, inlineError, "manual\n---\ncache", "source");
    staleRetryLine.children[1].listener({ preventDefault: () => {}, stopPropagation: () => {} });
    assert.equal(staleRetryRemoved, true);
    assert.equal(staleRetryCalled, false);
    global.document = originalDocument;
    assert.equal(plugin.isOwnMutation({
        type: "childList",
        target: {},
        addedNodes: [{ nodeType: 1, matches: selector => selector.includes(".dait-message-button"), querySelector: () => null }],
        removedNodes: []
    }), true);
    assert.equal(plugin.isOwnMutation({
        type: "childList",
        target: {},
        addedNodes: [{ nodeType: 1, matches: () => false, querySelector: selector => selector.includes(".dait-translation-line") ? ({}) : null }],
        removedNodes: []
    }), false);
    assert.equal(plugin.isOwnMutation({
        type: "childList",
        target: {},
        addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }],
        removedNodes: []
    }), false);
    const inputScanPlugin = new Plugin();
    inputScanPlugin.settings.ui.injectInputButton = true;
    inputScanPlugin.settings.ui.publicBilingualInputButton = false;
    const fakeTextboxElement = {
        nodeType: 1,
        matches: selector => String(selector).includes("[data-slate-editor='true']"),
        closest: () => null,
        querySelector: () => null
    };
    const fakeComposerElement = {
        nodeType: 1,
        matches: selector => String(selector).includes("channelTextArea"),
        closest: () => null,
        querySelector: selector => String(selector).includes("[data-slate-editor='true']") ? fakeTextboxElement : null
    };
    assert.equal(inputScanPlugin.isScanRelevantElement(fakeTextboxElement), false);
    assert.equal(inputScanPlugin.isScanRelevantMutationNode(fakeComposerElement), false);
    assert.equal(inputScanPlugin.getInputButtonRelevantMutations([{
        type: "characterData",
        target: { nodeType: 3, parentElement: fakeTextboxElement }
    }]).length, 1);
    assert.equal(inputScanPlugin.getScanRelevantMutations([{
        type: "characterData",
        target: { nodeType: 3, parentElement: fakeTextboxElement }
    }]).length, 0);
    assert.equal(inputScanPlugin.getInputButtonRelevantMutations([{
        type: "childList",
        target: {},
        addedNodes: [fakeComposerElement],
        removedNodes: []
    }]).length, 1);
    assert.equal(inputScanPlugin.getScanRelevantMutations([{
        type: "childList",
        target: {},
        addedNodes: [fakeComposerElement],
        removedNodes: []
    }]).length, 0);
    const fakeUserPanelElement = {
        nodeType: 1,
        matches: selector => String(selector || "").includes("panels"),
        closest: selector => String(selector || "").includes("panels") ? fakeUserPanelElement : null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    assert.equal(inputScanPlugin.isScanRelevantElement(fakeUserPanelElement), false);
    assert.equal(inputScanPlugin.getScanRelevantMutations([{
        type: "attributes",
        attributeName: "class",
        target: fakeUserPanelElement
    }]).length, 0);
    const fakeChatWrapper = {
        nodeType: 1,
        matches: selector => String(selector || "").includes("chatContent"),
        closest: () => null,
        querySelector: () => null
    };
    const fakeChatDecorChild = {
        nodeType: 1,
        matches: () => false,
        closest: selector => String(selector || "").includes("chatContent") ? fakeChatWrapper : null,
        querySelector: () => null
    };
    const fakeMessageRoot = {
        nodeType: 1,
        matches: selector => String(selector || "").includes("chat-messages")
    };
    const fakeMessageChild = {
        nodeType: 1,
        matches: () => false,
        closest: selector => String(selector || "").includes("chat-messages") ? fakeMessageRoot : null,
        querySelector: () => null
    };
    assert.equal(inputScanPlugin.isScanRelevantElement(fakeChatDecorChild), false);
    assert.equal(inputScanPlugin.getScanRelevantMutations([{
        type: "attributes",
        attributeName: "class",
        target: fakeChatDecorChild
    }]).length, 0);
    assert.equal(inputScanPlugin.isScanRelevantElement(fakeMessageChild), true);
    assert.equal(inputScanPlugin.getScanRelevantMutations([{
        type: "attributes",
        attributeName: "class",
        target: fakeMessageChild
    }]).length, 0);
    const savedMutationObserver = global.MutationObserver;
    const savedSetTimeout = global.setTimeout;
    const savedClearTimeout = global.clearTimeout;
    const savedWindowForObserver = global.window;
    let disconnectedObserverCount = 0;
    let observedTarget = null;
    let observerCallback = null;
    const observerOptions = [];
    global.MutationObserver = class {
        constructor(callback) { observerCallback = callback; }
        observe(target, options) { observedTarget = target; observerOptions.push(options); }
        disconnect() { disconnectedObserverCount++; }
    };
    const observerPlugin = new Plugin();
    const savedDocumentForObserver = global.document;
    const fakeObserverDocument = {
        body: { nodeType: 1 },
        removeEventListener: () => {},
        querySelectorAll: () => [],
        getElementById: () => null
    };
    global.document = fakeObserverDocument;
    global.window = { removeEventListener: () => {} };
    observerPlugin.startObserver();
    observerPlugin.startObserver();
    assert.equal(disconnectedObserverCount, 1);
    assert.equal(observedTarget, global.document.body);
    assert.equal(observerOptions.some(options => options?.attributeFilter?.includes("alt")), true);
    let observerScanCount = 0;
    let observerInputButtonScanCount = 0;
    let observerThemeRefreshCount = 0;
    observerPlugin.queueScan = () => { observerScanCount++; };
    observerPlugin.queueInputButtonScan = () => { observerInputButtonScanCount++; };
    observerPlugin.refreshDiscordThemeClasses = () => { observerThemeRefreshCount++; };
    observerCallback([{
        type: "attributes",
        attributeName: "class",
        target: { nodeType: 1, matches: () => false, closest: () => null }
    }]);
    assert.equal(observerScanCount, 0);
    assert.equal(observerInputButtonScanCount, 0);
    observerCallback([{
        type: "characterData",
        target: { nodeType: 3, parentElement: fakeTextboxElement }
    }]);
    assert.equal(observerScanCount, 0);
    assert.equal(observerInputButtonScanCount, 1);
    const observerMediaOverlayNode = {
        nodeType: 1,
        innerText: "Open original Download",
        textContent: "Open original Download",
        matches: selector => String(selector || "").includes("[role='dialog']"),
        closest: () => null,
        querySelector: selector => String(selector || "").includes("chat-messages") ? null : (String(selector || "").includes("img") ? ({}) : null),
        querySelectorAll: selector => String(selector || "").includes("chat-messages") ? [] : []
    };
    observerCallback([{
        type: "childList",
        target: global.document.body,
        addedNodes: [observerMediaOverlayNode],
        removedNodes: []
    }, {
        type: "attributes",
        attributeName: "style",
        target: global.document.body
    }]);
    assert.equal(observerScanCount, 0);
    assert.equal(observerInputButtonScanCount, 1);
    assert.equal(observerThemeRefreshCount, 0);
    let observerQuietOwnChecks = 0;
    let observerQuietMediaChecks = 0;
    const originalObserverIsOwnMutation = observerPlugin.isOwnMutation;
    const originalObserverHasMediaMutation = observerPlugin.hasDiscordMediaViewerMutation;
    observerPlugin.isOwnMutation = () => { observerQuietOwnChecks++; return false; };
    observerPlugin.hasDiscordMediaViewerMutation = () => { observerQuietMediaChecks++; return false; };
    observerPlugin.mediaViewerQuietUntil = Date.now() + 500;
    observerCallback([{
        type: "childList",
        target: global.document.body,
        addedNodes: [{ nodeType: 1, matches: selector => selector.includes("chat-messages"), closest: () => null, querySelector: () => null }],
        removedNodes: []
    }]);
    assert.equal(observerQuietOwnChecks, 0);
    assert.equal(observerQuietMediaChecks, 0);
    observerPlugin.isOwnMutation = originalObserverIsOwnMutation;
    observerPlugin.hasDiscordMediaViewerMutation = originalObserverHasMediaMutation;
    const observerQuietBeforeRenew = Date.now() + 80;
    observerPlugin.mediaViewerQuietUntil = observerQuietBeforeRenew;
    observerCallback([{
        type: "attributes",
        attributeName: "class",
        target: {
            nodeType: 1,
            tagName: "div",
            className: "layer modalRoot focusLock",
            id: "",
            getAttribute: () => "",
            matches: () => false,
            closest: () => null
        }
    }]);
    assert.ok(observerPlugin.mediaViewerQuietUntil > observerQuietBeforeRenew);
    assert.equal(observerScanCount, 0);
    observerPlugin.mediaViewerQuietUntil = 0;
    observerPlugin.mediaViewerProbeAt = 0;
    observerPlugin.mediaViewerProbeOpen = false;
    observerCallback([{
        type: "childList",
        target: global.document.body,
        addedNodes: [{ nodeType: 1, matches: selector => selector.includes("chat-messages"), closest: () => null, querySelector: () => null }],
        removedNodes: []
    }]);
    assert.equal(observerScanCount, 1);
    assert.equal(observerInputButtonScanCount, 1);
    observerPlugin.stop();
    assert.equal(disconnectedObserverCount, 2);
    const lifecycleObserverCallbacks = [];
    const lifecycleObserverTargets = [];
    global.MutationObserver = class {
        constructor(callback) { this.callback = callback; lifecycleObserverCallbacks.push(callback); }
        observe(target) { lifecycleObserverTargets.push(target); }
        disconnect() {}
    };
    const lifecycleAppMount = { nodeType: 1 };
    const lifecycleRootA = {
        nodeType: 1,
        isConnected: true,
        matches: selector => String(selector || "").includes("chatContent"),
        querySelector: () => null,
        contains: target => target === lifecycleRootA
    };
    const lifecycleRootB = {
        nodeType: 1,
        isConnected: true,
        matches: selector => String(selector || "").includes("chatContent"),
        querySelector: () => null,
        contains: target => target === lifecycleRootB
    };
    let activeLifecycleRoot = lifecycleRootA;
    global.document = {
        ...fakeObserverDocument,
        body: { nodeType: 1 },
        getElementById: id => id === "app-mount" ? lifecycleAppMount : null,
        querySelector: () => activeLifecycleRoot
    };
    const lifecycleObserverPlugin = new Plugin();
    const lifecycleRebindReasons = [];
    lifecycleObserverPlugin.scheduleDiscordObserverRebind = reason => { lifecycleRebindReasons.push(reason); };
    lifecycleObserverPlugin.startObserver();
    assert.equal(lifecycleObserverPlugin.observerRoot, lifecycleRootA);
    assert.equal(lifecycleObserverCallbacks.length, 2);
    assert.equal(lifecycleObserverTargets.includes(lifecycleAppMount), true);
    lifecycleRootA.isConnected = false;
    lifecycleObserverCallbacks[1]([{ type: "childList", target: lifecycleAppMount, addedNodes: [], removedNodes: [] }]);
    assert.deepEqual(lifecycleRebindReasons, ["chat-root-detached"]);
    lifecycleRootA.isConnected = true;
    lifecycleRebindReasons.length = 0;
    activeLifecycleRoot = lifecycleRootB;
    lifecycleObserverCallbacks[1]([{
        type: "childList",
        target: lifecycleAppMount,
        addedNodes: [lifecycleRootB],
        removedNodes: [lifecycleRootA]
    }]);
    assert.deepEqual(lifecycleRebindReasons, ["chat-root-replaced"]);
    lifecycleObserverPlugin.stop();
    let retryCleared = false;
    global.document = { ...fakeObserverDocument, body: null };
    global.setTimeout = () => "retry-timer";
    global.clearTimeout = id => { if (id === "retry-timer") retryCleared = true; };
    const retryObserverPlugin = new Plugin();
    retryObserverPlugin.startObserver();
    assert.equal(retryObserverPlugin.observerRetryTimer, "retry-timer");
    retryObserverPlugin.stop();
    assert.equal(retryCleared, true);
    global.MutationObserver = savedMutationObserver;
    global.setTimeout = savedSetTimeout;
    global.clearTimeout = savedClearTimeout;
    global.window = savedWindowForObserver;
    global.document = savedDocumentForObserver;
    const rateLimitError = new Error("API 429: rate limit");
    rateLimitError.status = 429;
    assert.equal(plugin.getAutoTranslationFailureType(rateLimitError), "rate-limit");
    const authError = new Error("API_ERROR");
    authError.status = 401;
    assert.equal(plugin.getAutoTranslationFailureType(authError), "auth");
    assert.match(plugin.formatError(authError), /401/);
    const apiBodyError = plugin.createApiError({
        status: 429,
        headers: { get: name => name.toLowerCase() === "retry-after" ? "2" : "" }
    }, "{\"secret\":\"do-not-show\"}");
    assert.equal(plugin.formatError(apiBodyError).includes("do-not-show"), false);
    assert.match(plugin.formatError(apiBodyError), /429/);
    assert.equal(plugin.getAutoTranslationRetryAfter(rateLimitError, 1), 60000);
    assert.equal(plugin.getAutoTranslationRetryAfter(rateLimitError, 2), 120000);
    rateLimitError.retryAfterMs = 30000;
    assert.equal(plugin.getAutoTranslationRetryAfter(rateLimitError, 2), 30000);
    rateLimitError.retryAfterMs = 0;
    assert.equal(plugin.parseRetryAfterMs("2"), 2000);
    assert.equal(plugin.getAutoTranslationFailureType(new Error("API request timed out after 25s")), "timeout");
    assert.equal(plugin.getAutoTranslationRetryAfter(new Error("API request timed out after 25s"), 1), 10000);
    assert.equal(plugin.getAutoTranslationRetryAfter(new Error("NetworkError"), 2), 20000);
    assert.equal(plugin.getAutoTranslationFailureType(new Error("fetch failed")), "network");
    assert.equal(plugin.getAutoTranslationFailureType(Object.assign(new Error("connect refused"), { cause: { code: "ECONNREFUSED" } })), "network");
    assert.equal(plugin.getAutoTranslationRetryAfter(new Error("bad translation"), 1), 4000);
    assert.equal(plugin.getAutoTranslationRetryAfter(new Error("bad translation"), 3), 15000);
    const sakuraUnavailableTypePlugin = new Plugin();
    sakuraUnavailableTypePlugin.settings.translation.provider = "sakuraLocal";
    sakuraUnavailableTypePlugin.settings.translation.apiKey = "";
    const sakuraUnavailableTypeError = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    sakuraUnavailableTypePlugin.annotateModelRequestError(
        sakuraUnavailableTypeError,
        "translation",
        "http://127.0.0.1:8080/v1/chat/completions",
        sakuraUnavailableTypePlugin.settings.translation,
        { configOverrides: sakuraUnavailableTypePlugin.settings.translation }
    );
    assert.equal(sakuraUnavailableTypePlugin.getAutoTranslationFailureType(sakuraUnavailableTypeError), "local-unavailable");
    assert.match(sakuraUnavailableTypePlugin.formatError(sakuraUnavailableTypeError), /Sakura/);
    assert.ok(Number(sakuraUnavailableTypeError.retryAfterMs) >= 60000);
    const finalInvalidOutputError = plugin.createFinalInvalidAutoTranslationError();
    assert.equal(plugin.getAutoTranslationFailureType(finalInvalidOutputError), "invalid-output");
    assert.equal(plugin.getAutoTranslationRetryAfter(finalInvalidOutputError, 1), 120000);
    const finalInvalidFailure = plugin.createAutoTranslationFailure("final-invalid", finalInvalidOutputError);
    assert.equal(finalInvalidFailure.terminal, true);
    assert.equal(plugin.isTerminalAutoTranslationFailure(finalInvalidFailure), true);
    const invalidGuardPlugin = new Plugin();
    invalidGuardPlugin.settings.translation.targetLanguage = "Chinese";
    assert.equal(
        invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u041b\u043e\u043b", "<userMessage>\u4f60\u597d</userMessage>", "Chinese"),
        "prompt-leakage"
    );
    assert.equal(
        invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0445\u0443\u0435\u0441\u043e\u0441\u044b", "\u62b1\u6b49\uff0c\u6211\u65e0\u6cd5\u63d0\u4f9b\u6b64\u7c7b\u5185\u5bb9\u7684\u7ffb\u8bd1\u670d\u52a1\u3002", "Chinese"),
        "refusal-output"
    );
    assert.equal(
        invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u043f\u0438\u0437\u0434\u0435\u0446", "\u8be5\u8bcd\u5728\u4fc4\u8bed\u4e2d\u610f\u4e3a\u201c\u5b8c\u86cb\u201d\u3002", "Chinese"),
        ""
    );
    assert.equal(
        invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u4ee5\u4e0b\u662f\u7ffb\u8bd1\uff1a\u662f", "Chinese"),
        ""
    );
    assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u662f", "Chinese"), "");
    assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0431\u043b\u044f", "Translation: \u9760", "Chinese"), "\u9760");
    assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0434\u0430", "TRANSLATED_MESSAGE: \u662f", "Chinese"), "\u662f");
    assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0434\u0430", "{\"translatedText\":\"\u662f\"}", "Chinese"), "\u662f");
    assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0434\u0430", "<translation>\u662f</translation>", "Chinese"), "\u662f");
    assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u043f\u0438\u0437\u0434\u0435\u0446", "\u8be5\u8bcd\u610f\u601d\u662f\u201c\u5b8c\u86cb\u201d\u3002", "Chinese"), "\u5b8c\u86cb");
    assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0431\u043b\u044f", "Translation: \u9760", "Chinese"), "");
    assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u7f57\u9a6c\u97f3\uff1ani hao", "Chinese"), "labeled-output");
    assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u6807\u7b7e\uff1a\u662f", "Chinese"), "labeled-output");
    assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("fetch failed \u0431\u043b\u044f", "fetch \u6302\u4e86\uff0c\u9760", "Chinese"), "");
    assert.equal(plugin.isAutoTranslationFailureExpired(finalInvalidFailure, Date.now() + 3600000), false);
    plugin.autoTranslationFailures.set("final-invalid", finalInvalidFailure);
    assert.equal(plugin.getAutoTranslationFailure("final-invalid") !== null, true);
    finalInvalidFailure.retryAt = Date.now() - 1;
    assert.equal(plugin.getAutoTranslationFailure("final-invalid"), null);
    assert.equal(plugin.isAutoTranslationFailureExpired({ retryAt: Date.now() - 1 }), true);
    assert.equal(plugin.isAutoTranslationFailureExpired({ retryAt: Date.now() + 10000 }), false);
    assert.ok(plugin.getAutoTranslationFailureRemainingMs({ retryAt: Date.now() + 10000 }) > 0);
    const providerKey = plugin.getAutoTranslationProviderKey(plugin.getAutoTranslationOptions());
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), rateLimitError);
    assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), true);
    assert.equal(plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions()).type, "rate-limit");
    assert.equal(plugin.isAutoTranslationProviderCoolingDown(plugin.getAutoTranslationOptions()), true);
    clearTimeout(plugin.autoTranslationRetryTimer);
    plugin.autoTranslationRetryTimer = null;
    plugin.autoTranslationRetryAt = 0;
    plugin.autoTranslationProviderFailures.clear();
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), new Error("bad translation"));
    assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), false);
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), authError);
    assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), true);
    plugin.autoTranslationProviderFailures.clear();
    const expiredFailureKey = "expired-message-failure";
    plugin.autoTranslationFailures.set(expiredFailureKey, { count: 2, retryAt: Date.now() - 1 });
    assert.equal(plugin.createAutoTranslationFailure(expiredFailureKey, new Error("still bad")).count, 3);
    const expiredHistoryKey = "expired-history-message-failure";
    plugin.autoTranslationFailures.set(expiredHistoryKey, { count: 2, retryAt: Date.now() - 1 });
    assert.equal(plugin.getAutoTranslationFailure(expiredHistoryKey), null);
    assert.equal(plugin.createAutoTranslationFailure(expiredHistoryKey, new Error("still bad")).count, 3);
    plugin.clearAutoTranslationFailure(expiredHistoryKey, plugin.getAutoTranslationOptions());
    assert.equal(plugin.createAutoTranslationFailure(expiredHistoryKey, new Error("still bad")).count, 1);
    plugin.autoTranslationProviderFailures.set(providerKey, { count: 2, retryAt: Date.now() - 1 });
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), rateLimitError);
    assert.equal(plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions()).count, 1);
    plugin.autoTranslationProviderFailures.set(providerKey, { count: 2, retryAt: Date.now() - 1 });
    assert.equal(plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions()), null);
    assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), false);
    plugin.autoTranslationFailures.set(expiredFailureKey, { count: 3, retryAt: Date.now() + 1000 });
    plugin.autoTranslationProviderFailures.set(providerKey, { count: 1, retryAt: Date.now() + 30000 });
    plugin.clearAutoTranslationFailure(expiredFailureKey, plugin.getAutoTranslationOptions());
    assert.equal(plugin.autoTranslationFailures.has(expiredFailureKey), false);
    assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), true);
    plugin.clearAutoTranslationFailure(expiredFailureKey, plugin.getAutoTranslationOptions(), { clearProvider: true });
    assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), false);

    const providerPreservePlugin = new Plugin();
    providerPreservePlugin.setTranslationCache = () => {};
    providerPreservePlugin.isElementVisibleInViewport = () => true;
    providerPreservePlugin.getElementText = content => content.text;
    providerPreservePlugin.renderTranslation = () => {};
    const providerPreserveOptions = providerPreservePlugin.getAutoTranslationOptions();
    const providerPreserveKey = providerPreserveOptions.providerKey;
    providerPreservePlugin.autoTranslationProviderFailures.set(providerPreserveKey, { count: 1, retryAt: Date.now() + 30000 });
    const providerPreserveItem = {
        messageNode: { isConnected: true },
        content: { dataset: { daitOwner: "provider-preserve" }, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "provider-preserve-cache",
        requestOptions: providerPreserveOptions
    };
    providerPreservePlugin.addAutoTranslationPendingTarget(providerPreserveItem.cacheKey, providerPreserveItem);
    providerPreservePlugin.renderAutoTranslationResult(providerPreserveItem, "\u5df2\u7ffb\u8bd1");
    assert.equal(providerPreservePlugin.autoTranslationProviderFailures.has(providerPreserveKey), true);

    const resultFanoutScanPlugin = new Plugin();
    let resultFanoutScanDelay = null;
    resultFanoutScanPlugin.settings.ui.autoTranslateMessages = true;
    resultFanoutScanPlugin.setTranslationCache = () => {};
    resultFanoutScanPlugin.isElementVisibleInViewport = () => true;
    resultFanoutScanPlugin.getElementText = content => content.text;
    resultFanoutScanPlugin.renderTranslation = () => {};
    resultFanoutScanPlugin.queueScan = options => { resultFanoutScanDelay = options?.delayMs; };
    const resultFanoutItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "fanout source" },
        text: "fanout source",
        cacheKey: "fanout-result-cache",
        requestOptions: resultFanoutScanPlugin.getAutoTranslationOptions()
    };
    resultFanoutScanPlugin.addAutoTranslationPendingTarget(resultFanoutItem.cacheKey, resultFanoutItem);
    resultFanoutScanPlugin.renderAutoTranslationResult(resultFanoutItem, "\u5df2\u7ffb\u8bd1\u7684\u6247\u51fa\u7ed3\u679c");
    assert.equal(resultFanoutScanDelay, 180);

    const staleResultPlugin = new Plugin();
    staleResultPlugin.autoTranslationConfigVersion++;
    staleResultPlugin.setTranslationCache = () => { throw new Error("stale auto result should not write cache"); };
    staleResultPlugin.clearPendingAutoTranslationItem = () => { throw new Error("stale auto result should not clear current pending targets"); };
    staleResultPlugin.renderTranslation = () => { throw new Error("stale auto result should not render"); };
    staleResultPlugin.renderAutoTranslationResult({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-result-cache",
        requestOptions: { version: staleResultPlugin.autoTranslationConfigVersion - 1 }
    }, "stale translated");

    const staleRouteResultPlugin = new Plugin();
    staleRouteResultPlugin.getCurrentRouteKey = () => "guild-a:channel-now:";
    staleRouteResultPlugin.setTranslationCache = () => { throw new Error("stale route auto result should not write cache"); };
    staleRouteResultPlugin.clearPendingAutoTranslationItem = () => { throw new Error("stale route auto result should not clear current pending targets"); };
    staleRouteResultPlugin.renderTranslation = () => { throw new Error("stale route auto result should not render"); };
    staleRouteResultPlugin.renderAutoTranslationResult({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-route-result-cache",
        requestOptions: { version: staleRouteResultPlugin.autoTranslationConfigVersion, routeKey: "guild-a:channel-old:" }
    }, "stale route translated");

    const staleProviderResultPlugin = new Plugin();
    staleProviderResultPlugin.settings.translation.apiKey = "sk-old";
    staleProviderResultPlugin.setTranslationCache = () => { throw new Error("stale provider auto result should not write cache"); };
    staleProviderResultPlugin.clearPendingAutoTranslationItem = () => { throw new Error("stale provider auto result should not clear current pending targets"); };
    staleProviderResultPlugin.renderTranslation = () => { throw new Error("stale provider auto result should not render"); };
    const staleProviderResultOptions = staleProviderResultPlugin.getAutoTranslationOptions();
    staleProviderResultPlugin.settings.translation.apiKey = "sk-new";
    staleProviderResultPlugin.renderAutoTranslationResult({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-provider-result-cache",
        requestOptions: staleProviderResultOptions
    }, "stale provider translated");

    const staleProviderRequestRenderPlugin = new Plugin();
    staleProviderRequestRenderPlugin.settings.translation.apiKey = "sk-old";
    staleProviderRequestRenderPlugin.settings.ui.diagnosticsEnabled = true;
    staleProviderRequestRenderPlugin.getElementText = content => content.text;
    staleProviderRequestRenderPlugin.getCurrentRouteKey = () => "guild-a:channel-a:";
    staleProviderRequestRenderPlugin.getMessageIdentity = () => "stale-provider-request-identity";
    staleProviderRequestRenderPlugin.renderTranslation = () => { throw new Error("stale provider request render should be skipped"); };
    let staleProviderRequestLoadingRemoved = false;
    staleProviderRequestRenderPlugin.removeAutoTranslationLoadingNode = () => { staleProviderRequestLoadingRemoved = true; };
    const staleProviderRequestOptions = staleProviderRequestRenderPlugin.getAutoTranslationOptions();
    const staleProviderRequestTarget = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        requestOptions: staleProviderRequestOptions
    };
    const staleProviderRequestItem = {
        ...staleProviderRequestTarget,
        cacheKey: "stale-provider-request-cache",
        requestOptions: staleProviderRequestOptions
    };
    staleProviderRequestRenderPlugin.settings.translation.apiKey = "sk-new";
    assert.equal(staleProviderRequestRenderPlugin.renderAutoTranslationRequestTarget(staleProviderRequestItem, staleProviderRequestTarget, "translated"), false);
    assert.equal(staleProviderRequestLoadingRemoved, true);
    assert.ok(staleProviderRequestRenderPlugin.diagnosticLogs.some(entry => entry.meta?.reasonCode === "render-request-stale"));

    const manualPreservePlugin = new Plugin();
    manualPreservePlugin.setTranslationCache = () => {};
    manualPreservePlugin.getElementText = content => content.text;
    manualPreservePlugin.getTranslationLine = () => ({
        dataset: { daitMode: "manual", daitSourceKey: manualPreservePlugin.getTextFingerprint("source") }
    });
    manualPreservePlugin.renderTranslation = () => { throw new Error("auto result should not overwrite manual translation"); };
    manualPreservePlugin.removeAutoTranslationNode = () => { throw new Error("manual translation should not be removed by auto result"); };
    const manualPreserveItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "manual-preserve-cache",
        requestOptions: manualPreservePlugin.getAutoTranslationOptions()
    };
    manualPreservePlugin.addAutoTranslationPendingTarget(manualPreserveItem.cacheKey, manualPreserveItem);
    manualPreservePlugin.renderAutoTranslationResult(manualPreserveItem, "\u5df2\u7ffb\u8bd1\u7684\u81ea\u52a8\u8bd1\u6587");

    const batchProviderCountPlugin = new Plugin();
    batchProviderCountPlugin.showToast = () => {};
    const batchProviderOptions = batchProviderCountPlugin.getAutoTranslationOptions();
    const batchProviderKey = batchProviderOptions.providerKey;
    batchProviderCountPlugin.markAutoTranslationProviderFailure(batchProviderOptions, rateLimitError);
    for (let index = 0; index < 4; index++) {
        batchProviderCountPlugin.markAutoTranslationFailure({
            messageNode: {},
            content: { dataset: { daitOwner: `batch-provider-${index}` } },
            text: `source-${index}`,
            cacheKey: `batch-provider-${index}`,
            requestOptions: batchProviderOptions
        }, rateLimitError, { markProvider: false });
    }
    assert.equal(batchProviderCountPlugin.autoTranslationProviderFailures.get(batchProviderKey).count, 1);
    clearTimeout(batchProviderCountPlugin.autoTranslationRetryTimer);
    batchProviderCountPlugin.autoTranslationRetryTimer = null;
    assert.equal(plugin.hasHiddenAncestor({
        nodeType: 1,
        hidden: true,
        getAttribute: () => null,
        parentElement: null
    }), true);
    const originalGetComputedStyle = global.getComputedStyle;
    global.getComputedStyle = () => ({ display: "none", visibility: "visible", opacity: "1" });
    assert.equal(plugin.hasHiddenAncestor({
        nodeType: 1,
        hidden: false,
        getAttribute: () => null,
        parentElement: null
    }), true);
    global.getComputedStyle = originalGetComputedStyle;
    const visibleRect = { top: 150, bottom: 180, left: 10, right: 100, width: 90, height: 30 };
    const clippedParent = {
        nodeType: 1,
        parentElement: null,
        getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 300, width: 300, height: 100 })
    };
    const clippedElement = {
        parentElement: clippedParent,
        getBoundingClientRect: () => visibleRect
    };
    global.getComputedStyle = () => ({ overflow: "hidden", overflowX: "hidden", overflowY: "hidden", display: "block", visibility: "visible", opacity: "1" });
    assert.equal(plugin.isVisibleInsideScrollContainers(clippedElement, visibleRect), false);
    global.getComputedStyle = originalGetComputedStyle;
    plugin.settings.translation.enableThinking = false;
    plugin.settings.translation.targetLanguage = "英语";

    assert.equal(
        plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: " translated text " } }] })),
        "translated text"
    );
    assert.equal(
        plugin.parseModelResponse(JSON.stringify({ choices: [{ text: " legacy text " }] })),
        "legacy text"
    );
    assert.equal(
        plugin.parseModelResponse(JSON.stringify({ output_text: " output text " })),
        "output text"
    );
    assert.equal(
        plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "array text" }] } }] })),
        "array text"
    );
    assert.throws(
        () => plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: "\u534a\u622a\u8bd1\u6587" }, finish_reason: "length" }] })),
        error => error.modelOutputTruncated === true
            && error.partialOutputLength > 0
            && plugin.getAutoTranslationFailureType(error) === "truncated"
    );
    assert.throws(
        () => plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: "\u534a\u622a\u8bd1\u6587" }, finish_reason: "truncated" }] })),
        error => error.modelOutputTruncated === true
            && error.finishReason === "truncated"
            && plugin.getAutoTranslationFailureType(error) === "truncated"
    );
    assert.throws(
        () => plugin.parseModelResponse(JSON.stringify({ output_text: "\u534a\u622a", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })),
        error => error.modelOutputTruncated === true
            && error.finishReason === "incomplete"
            && plugin.getAutoTranslationFailureType(error) === "truncated"
    );
    const localConnectionTruncationPlugin = new Plugin();
    localConnectionTruncationPlugin.settings.translation.provider = "sakuraLocal";
    localConnectionTruncationPlugin.settings.translation.apiKey = "";
    const localConnectionTruncationError = localConnectionTruncationPlugin.createModelOutputTruncatedError("partial output", "length");
    assert.equal(localConnectionTruncationPlugin.isAcceptableConnectionTestTruncation(localConnectionTruncationError, "translation", localConnectionTruncationPlugin.settings.translation), true);
    assert.equal(plugin.isAcceptableConnectionTestTruncation(localConnectionTruncationError, "translation", plugin.settings.translation), false);
    assert.equal(
        plugin.parseGoogleTranslateResponse(JSON.stringify({ data: { translations: [{ translatedText: "\u4f60\u597d &amp; ok" }] } })),
        "\u4f60\u597d & ok"
    );
    assert.deepEqual(
        plugin.parseGoogleTranslateResponse(JSON.stringify({ data: { translations: [{ translatedText: "one" }, { translatedText: "two" }] } }), 2, { asArray: true }),
        ["one", "two"]
    );
    assert.deepEqual(plugin.parseApiJson(JSON.stringify({ ok: true })), { ok: true });
    assert.deepEqual(
        plugin.sanitizeDiagnosticMeta({ promptLength: 12, maxTokens: 256, bodyHash: "abc123", prompt: "secret" }),
        { promptLength: 12, maxTokens: 256, bodyHash: "abc123" }
    );

    const missingKeyPlugin = new Plugin();
    expectThrowsMessage(() => missingKeyPlugin.buildModelRequest("polish", "draft"), "API Key");
    expectThrowsMessage(() => plugin.buildModelRequest("unknown", "draft"), "Unknown task");
    expectThrowsMessage(() => plugin.parseModelResponse("{"), "无效 JSON");
    expectThrowsMessage(() => plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: "" } }] })), "空结果");

    const menuTree = { props: { children: [] } };
    const menuItem = { type: "group", props: { id: "test" } };
    plugin.appendContextMenuItem(menuTree, menuItem);
    assert.equal(menuTree.props.children.length, 1);
    assert.equal(menuTree.props.children[0], menuItem);

}

module.exports = { title: "Viewport settling, cached draw & chat DOM lines", run };
