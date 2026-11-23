"use strict";

// Artifact regression suite: Template invalidation, cooldowns & failure handling
function run(harness, shared) {
    const { assert, Plugin } = harness;

    const templateInvalidationPlugin = new Plugin();
    templateInvalidationPlugin.showToast = () => {};
    const translationTemplate = templateInvalidationPlugin.getPromptTemplates("translation")[0];
    const templateVersion = templateInvalidationPlugin.autoTranslationConfigVersion;
    templateInvalidationPlugin.applyPromptTemplate("translation", translationTemplate.id);
    assert.equal(templateInvalidationPlugin.autoTranslationConfigVersion, templateVersion + 1);

    const cacheRenderCalls = [];
    const cachedPlugin = new Plugin();
    cachedPlugin.settings.translation.enabled = true;
    cachedPlugin.settings.ui.autoTranslateMessages = true;
    cachedPlugin.settings.translation.apiKey = "sk-test";
    cachedPlugin.settings.translation.targetLanguage = "汉语";
    cachedPlugin.isElementVisibleInViewport = () => true;
    cachedPlugin.isAutoTranslationTargetInScanRange = () => true;
    cachedPlugin.getMessageContentElement = message => message.content;
    cachedPlugin.getCachedElementText = content => content.text;
    cachedPlugin.getElementText = content => content.text;
    cachedPlugin.getMessageIdentity = () => "cached-fanout-identity";
    cachedPlugin.shouldAutoTranslateText = text => text === "bonjour";
    cachedPlugin.hasCurrentTranslationLine = () => false;
    cachedPlugin.renderTranslation = (messageNode, content, translated) => cacheRenderCalls.push({ messageNode, content, translated });
    cachedPlugin.drainAutoTranslationQueue = () => {};
    const cachedMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const cachedOptions = cachedPlugin.withMessageIdentity(cachedPlugin.getAutoTranslationOptions(), cachedMessage, cachedMessage.content, "bonjour");
    const cachedKey = cachedPlugin.getTranslationCacheKey("bonjour", cachedOptions);
    cachedPlugin.setTranslationCache(cachedKey, "你好");
    const cachedPendingMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    cachedPlugin.addAutoTranslationPendingTarget(cachedKey, {
        messageNode: cachedPendingMessage,
        content: cachedPendingMessage.content,
        text: "bonjour",
        cacheKey: cachedKey,
        requestOptions: cachedOptions
    });
    cachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [cachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(cachedPlugin.autoTranslationQueue.length, 0);
    assert.equal(cacheRenderCalls.length, 2);
    assert.equal(cacheRenderCalls.every(call => call.translated === "你好"), true);
    assert.equal(cacheRenderCalls.some(call => call.messageNode === cachedPendingMessage), true);

    const pausedCacheRenderCalls = [];
    const pausedCachedPlugin = new Plugin();
    pausedCachedPlugin.settings.translation.enabled = true;
    pausedCachedPlugin.settings.ui.autoTranslateMessages = true;
    pausedCachedPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    // The chat is still scrolling: cached lines wait until it is still, not until the render pause ends.
    pausedCachedPlugin.autoTranslationLastExternalScrollAt = Date.now();
    pausedCachedPlugin.isAutoTranslationTargetInScanRange = () => true;
    pausedCachedPlugin.isElementVisibleInViewport = () => true;
    pausedCachedPlugin.getMessageContentElement = message => message.content;
    pausedCachedPlugin.getCachedElementText = content => content.text;
    pausedCachedPlugin.getElementText = content => content.text;
    pausedCachedPlugin.getMessageIdentity = message => `message:paused-cache:${message.id}`;
    pausedCachedPlugin.shouldAutoTranslateText = () => true;
    pausedCachedPlugin.hasCurrentTranslationLine = () => false;
    pausedCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
    pausedCachedPlugin.renderTranslation = (messageNode, content, translated) => pausedCacheRenderCalls.push({ messageNode, content, translated });
    pausedCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("paused cache hit should not start API work"); };
    pausedCachedPlugin.scheduleAutoTranslationRetryScan = () => {};
    const pausedCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour paused cache" } };
    const pausedCachedOptions = pausedCachedPlugin.withMessageIdentity(pausedCachedPlugin.getAutoTranslationOptions(), pausedCachedMessage, pausedCachedMessage.content, "bonjour paused cache");
    const pausedCachedKey = pausedCachedPlugin.getTranslationCacheKey("bonjour paused cache", pausedCachedOptions);
    pausedCachedPlugin.setTranslationCache(pausedCachedKey, "paused cached translation");
    pausedCachedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [pausedCachedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    }, { cacheOnly: true });
    assert.equal(pausedCachedPlugin.autoTranslationQueue.length, 0);
    assert.equal(pausedCacheRenderCalls.length, 0);
    assert.equal(pausedCachedPlugin.autoTranslationRenderQueue.length, 1);
    clearTimeout(pausedCachedPlugin.autoTranslationRenderTimer);
    pausedCachedPlugin.autoTranslationRenderTimer = null;
    pausedCachedPlugin.autoTranslationLastExternalScrollAt = 0;
    pausedCachedPlugin.processAutoTranslationRenderQueue();
    assert.equal(pausedCacheRenderCalls.length, 1);
    assert.equal(pausedCachedPlugin.isAutoTranslationRenderPaused(), true);

    const quickSettingsRenderPausePlugin = new Plugin();
    quickSettingsRenderPausePlugin.isStarted = true;
    quickSettingsRenderPausePlugin.settings.ui.diagnosticsEnabled = true;
    quickSettingsRenderPausePlugin.isQuickSettingsPanelOpen = () => true;
    let quickSettingsRenderRan = false;
    quickSettingsRenderPausePlugin.autoTranslationRenderQueue.push({
        target: { text: "bonjour quick settings" },
        run() { quickSettingsRenderRan = true; }
    });
    quickSettingsRenderPausePlugin.processAutoTranslationRenderQueue();
    assert.equal(quickSettingsRenderRan, false);
    assert.equal(quickSettingsRenderPausePlugin.quickSettingsRenderDeferred, true);
    assert.equal(quickSettingsRenderPausePlugin.autoTranslationRenderQueue.length, 1);
    assert.ok(quickSettingsRenderPausePlugin.diagnosticLogs.some(entry => entry.action === "auto.render.queue" && entry.status === "deferred" && entry.meta?.reason === "quick-settings-open"));

    const quickSettingsResumePlugin = new Plugin();
    quickSettingsResumePlugin.isStarted = true;
    quickSettingsResumePlugin.quickSettingsScanDeferred = true;
    quickSettingsResumePlugin.quickSettingsRenderDeferred = true;
    quickSettingsResumePlugin.autoTranslationRenderQueue.push({
        target: { text: "resume quick settings" },
        run() {}
    });
    quickSettingsResumePlugin.isQuickSettingsPanelOpen = () => false;
    let quickSettingsResumeScanDelay = 0;
    let quickSettingsResumeRenderDelay = 0;
    quickSettingsResumePlugin.queueScan = options => { quickSettingsResumeScanDelay = Number(options?.delayMs || 0); };
    quickSettingsResumePlugin.scheduleAutoTranslationRenderQueue = delay => { quickSettingsResumeRenderDelay = Number(delay || 0); };
    quickSettingsResumePlugin.resumeQuickSettingsDeferredWork("test-close");
    assert.ok(quickSettingsResumeScanDelay > 0);
    assert.ok(quickSettingsResumeRenderDelay > 0);
    assert.equal(quickSettingsResumePlugin.quickSettingsScanDeferred, false);
    assert.equal(quickSettingsResumePlugin.quickSettingsRenderDeferred, false);

    const activeCacheOnlyPlugin = new Plugin();
    activeCacheOnlyPlugin.settings.translation.enabled = true;
    activeCacheOnlyPlugin.settings.translation.apiKey = "sk-test";
    activeCacheOnlyPlugin.settings.translation.targetLanguage = "Chinese";
    activeCacheOnlyPlugin.isElementVisibleInViewport = () => true;
    activeCacheOnlyPlugin.getMessageContentElement = message => message.content;
    activeCacheOnlyPlugin.getCachedElementText = content => content.text;
    activeCacheOnlyPlugin.getElementText = content => content.text;
    activeCacheOnlyPlugin.getMessageIdentity = () => "active-cacheonly-identity";
    activeCacheOnlyPlugin.shouldAutoTranslateText = () => true;
    activeCacheOnlyPlugin.hasCurrentTranslationLine = () => false;
    activeCacheOnlyPlugin.renderTranslation = () => { throw new Error("active cache-only target should not render without cache"); };
    activeCacheOnlyPlugin.drainAutoTranslationQueue = () => { throw new Error("cache-only scan should not drain API queue"); };
    const activeCacheOnlyMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour active" } };
    const activeCacheOnlyOptions = activeCacheOnlyPlugin.withMessageIdentity(activeCacheOnlyPlugin.getAutoTranslationOptions(), activeCacheOnlyMessage, activeCacheOnlyMessage.content, "bonjour active");
    const activeCacheOnlyKey = activeCacheOnlyPlugin.getTranslationCacheKey("bonjour active", activeCacheOnlyOptions);
    activeCacheOnlyPlugin.autoTranslationInFlightKeys.add(activeCacheOnlyKey);
    activeCacheOnlyPlugin.autoTranslationInFlightStartedAt.set(activeCacheOnlyKey, Date.now());
    activeCacheOnlyPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [activeCacheOnlyMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    }, { cacheOnly: true });
    assert.equal(activeCacheOnlyPlugin.autoTranslationQueue.length, 0);
    assert.equal(activeCacheOnlyPlugin.getAutoTranslationPendingTargets({ cacheKey: activeCacheOnlyKey }).length, 1);

    const activeCacheHitPlugin = new Plugin();
    const activeCacheHitRenderCalls = [];
    activeCacheHitPlugin.settings.translation.enabled = true;
    activeCacheHitPlugin.settings.ui.autoTranslateMessages = true;
    activeCacheHitPlugin.settings.translation.apiKey = "sk-test";
    activeCacheHitPlugin.settings.translation.targetLanguage = "Chinese";
    activeCacheHitPlugin.isElementVisibleInViewport = () => true;
    activeCacheHitPlugin.getMessageContentElement = message => message.content;
    activeCacheHitPlugin.getCachedElementText = content => content.text;
    activeCacheHitPlugin.getElementText = content => content.text;
    activeCacheHitPlugin.getMessageIdentity = () => "active-cachehit-identity";
    activeCacheHitPlugin.shouldAutoTranslateText = text => text === "bonjour active cached";
    activeCacheHitPlugin.hasCurrentTranslationLine = () => false;
    activeCacheHitPlugin.renderTranslation = (messageNode, content, translated) => activeCacheHitRenderCalls.push({ messageNode, content, translated });
    activeCacheHitPlugin.drainAutoTranslationQueue = () => {};
    const activeCacheHitMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour active cached" } };
    const activeCacheHitOptions = activeCacheHitPlugin.withMessageIdentity(activeCacheHitPlugin.getAutoTranslationOptions(), activeCacheHitMessage, activeCacheHitMessage.content, "bonjour active cached");
    const activeCacheHitKey = activeCacheHitPlugin.getTranslationCacheKey("bonjour active cached", activeCacheHitOptions);
    activeCacheHitPlugin.autoTranslationInFlightKeys.add(activeCacheHitKey);
    activeCacheHitPlugin.autoTranslationInFlightStartedAt.set(activeCacheHitKey, Date.now());
    activeCacheHitPlugin.autoTranslationQueuedKeys.add(activeCacheHitKey);
    activeCacheHitPlugin.autoTranslationQueue.push({
        messageNode: activeCacheHitMessage,
        content: activeCacheHitMessage.content,
        text: "bonjour active cached",
        cacheKey: activeCacheHitKey,
        requestOptions: activeCacheHitOptions
    });
    activeCacheHitPlugin.addAutoTranslationPendingTarget(activeCacheHitKey, {
        messageNode: activeCacheHitMessage,
        content: activeCacheHitMessage.content,
        text: "bonjour active cached",
        cacheKey: activeCacheHitKey,
        requestOptions: activeCacheHitOptions
    });
    activeCacheHitPlugin.setTranslationCache(activeCacheHitKey, "\u5df2\u7ffb\u8bd1\u7684\u6d3b\u8dc3\u7f13\u5b58");
    activeCacheHitPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [activeCacheHitMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    }, { cacheOnly: true });
    assert.equal(activeCacheHitRenderCalls.length, 1);
    assert.equal(activeCacheHitRenderCalls[0].translated, "\u5df2\u7ffb\u8bd1\u7684\u6d3b\u8dc3\u7f13\u5b58");
    assert.equal(activeCacheHitPlugin.autoTranslationQueue.length, 0);
    assert.equal(activeCacheHitPlugin.autoTranslationInFlightKeys.has(activeCacheHitKey), true);
    assert.equal(activeCacheHitPlugin.autoTranslationPendingTargets.has(activeCacheHitKey), false);

    const autoTextCachePlugin = new Plugin();
    const autoTextRenderCalls = [];
    autoTextCachePlugin.settings.translation.enabled = true;
    autoTextCachePlugin.settings.ui.autoTranslateMessages = true;
    autoTextCachePlugin.settings.translation.apiKey = "sk-test";
    autoTextCachePlugin.settings.translation.targetLanguage = "Chinese";
    autoTextCachePlugin.settings.ui.diagnosticsEnabled = true;
    autoTextCachePlugin.isElementVisibleInViewport = () => true;
    autoTextCachePlugin.getMessageContentElement = message => message.content;
    autoTextCachePlugin.getCachedElementText = content => content.text;
    autoTextCachePlugin.getElementText = content => content.text;
    autoTextCachePlugin.shouldAutoTranslateText = text => text === "bonjour";
    autoTextCachePlugin.hasCurrentTranslationLine = () => false;
    autoTextCachePlugin.getMessageIdentity = message => `message:${message.id}:same-text`;
    autoTextCachePlugin.renderTranslation = (messageNode, content, translated, cacheKey) => autoTextRenderCalls.push({ messageNode, content, translated, cacheKey });
    let autoTextDrainCount = 0;
    autoTextCachePlugin.drainAutoTranslationQueue = () => { autoTextDrainCount++; };
    const autoTextFirst = { id: "one", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const autoTextFirstOptions = autoTextCachePlugin.withMessageIdentity(autoTextCachePlugin.getAutoTranslationOptions(), autoTextFirst, autoTextFirst.content, "bonjour");
    autoTextCachePlugin.setAutoTextTranslationCache("bonjour", autoTextFirstOptions, "\u4f60\u597d");
    const autoTextSecond = { id: "two", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const autoTextSecondOptions = autoTextCachePlugin.withMessageIdentity(autoTextCachePlugin.getAutoTranslationOptions(), autoTextSecond, autoTextSecond.content, "bonjour");
    const autoTextSecondScopedKey = autoTextCachePlugin.getTranslationCacheKey("bonjour", autoTextSecondOptions);
    assert.equal(autoTextCachePlugin.translationCache.has(autoTextSecondScopedKey), false);
    let autoTextIdentityLookups = 0;
    autoTextCachePlugin.getMessageIdentity = message => {
        autoTextIdentityLookups++;
        return `message:${message.id}:same-text`;
    };
    autoTextCachePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [autoTextSecond],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(autoTextCachePlugin.autoTranslationQueue.length, 0);
    assert.equal(autoTextDrainCount, 1);
    assert.equal(autoTextRenderCalls.length, 1);
    assert.equal(autoTextRenderCalls[0].translated, "\u4f60\u597d");
    assert.equal(autoTextRenderCalls[0].cacheKey, autoTextSecondScopedKey);
    assert.equal(autoTextCachePlugin.translationCache.has(autoTextSecondScopedKey), false);
    assert.equal(autoTextIdentityLookups > 0, true);
    const autoTextScanLog = autoTextCachePlugin.diagnosticLogs.find(entry => entry.action === "auto.scan");
    assert.equal(autoTextScanLog.meta.textCacheHits, 1);
    assert.equal(autoTextScanLog.meta.cacheHits, 0);
    clearTimeout(autoTextCachePlugin.translationCacheDirtyTimer);
    autoTextCachePlugin.translationCacheDirtyTimer = null;

    const persistentCachePlugin = new Plugin();
    let savedCachePayload = null;
    let persistentSaveCount = 0;
    persistentCachePlugin.saveData = (key, value) => {
        persistentSaveCount++;
        if (key === "translationCache") savedCachePayload = value;
        return true;
    };
    persistentCachePlugin.flushTranslationCache();
    assert.equal(persistentSaveCount, 0);
    persistentCachePlugin.setTranslationCache("persist-key", "persisted translation");
    persistentCachePlugin.flushTranslationCache();
    assert.equal(persistentSaveCount, 1);
    assert.equal(savedCachePayload.version, 3);
    assert.equal(Array.isArray(savedCachePayload.strings), true);
    assert.equal(savedCachePayload.entries.length, 1);
    const restoredCachePlugin = new Plugin();
    restoredCachePlugin.loadData = key => key === "translationCache" ? savedCachePayload : null;
    restoredCachePlugin.loadTranslationCache();
    assert.equal(restoredCachePlugin.getTranslationCacheValue("persist-key"), "persisted translation");
    assert.equal(restoredCachePlugin.translationCacheStats.hits, 1);
    assert.ok(restoredCachePlugin.translationCacheMeta.get("persist-key").expiresAt >= Date.now() + (6 * 60 * 60 * 1000) - 1000);
    clearTimeout(restoredCachePlugin.translationCacheDirtyTimer);
    restoredCachePlugin.translationCacheDirtyTimer = null;

    const ttlClampPlugin = new Plugin();
    const ttlClampNow = Date.now();
    ttlClampPlugin.translationCache.set("ttl-clamp", "translation");
    ttlClampPlugin.translationCacheMeta.set("ttl-clamp", {
        createdAt: ttlClampNow - 60 * 60 * 1000,
        touchedAt: ttlClampNow - 60 * 60 * 1000,
        expiresAt: ttlClampNow + 7 * 24 * 60 * 60 * 1000
    });
    ttlClampPlugin.settings.ui.translationCacheTtlHours = 3;
    assert.equal(ttlClampPlugin.clampTranslationCacheExpiryToCurrentTtl(ttlClampNow), true);
    assert.ok(ttlClampPlugin.translationCacheMeta.get("ttl-clamp").expiresAt <= ttlClampNow + 2 * 60 * 60 * 1000);

    const cacheLookupMemoPlugin = new Plugin();
    const cacheLookupMemoContext = { translationCacheLookupByKey: new Map() };
    assert.equal(cacheLookupMemoPlugin.getTranslationCacheValueCached("memo-missing", [], cacheLookupMemoContext), null);
    assert.equal(cacheLookupMemoPlugin.getTranslationCacheValueCached("memo-missing", [], cacheLookupMemoContext), null);
    assert.equal(cacheLookupMemoPlugin.translationCacheStats.misses, 1);
    cacheLookupMemoPlugin.setTranslationCache("memo-missing", "memo translation");
    cacheLookupMemoPlugin.clearScanTranslationCacheLookup(cacheLookupMemoContext);
    assert.equal(cacheLookupMemoPlugin.getTranslationCacheValueCached("memo-missing", [], cacheLookupMemoContext), "memo translation");
    assert.equal(cacheLookupMemoPlugin.translationCacheStats.hits, 1);
    clearTimeout(cacheLookupMemoPlugin.translationCacheDirtyTimer);
    cacheLookupMemoPlugin.translationCacheDirtyTimer = null;

    const cacheNegativeMemoPlugin = new Plugin();
    assert.equal(cacheNegativeMemoPlugin.getTranslationCacheValueCached("negative-missing", [], { translationCacheLookupByKey: new Map() }), null);
    assert.equal(cacheNegativeMemoPlugin.getTranslationCacheValueCached("negative-missing", [], { translationCacheLookupByKey: new Map() }), null);
    assert.equal(cacheNegativeMemoPlugin.translationCacheStats.misses, 1);
    cacheNegativeMemoPlugin.setTranslationCache("negative-missing", "negative memo translation");
    assert.equal(cacheNegativeMemoPlugin.getTranslationCacheValueCached("negative-missing", [], { translationCacheLookupByKey: new Map() }), "negative memo translation");
    assert.equal(cacheNegativeMemoPlugin.translationCacheStats.hits, 1);
    clearTimeout(cacheNegativeMemoPlugin.translationCacheDirtyTimer);
    cacheNegativeMemoPlugin.translationCacheDirtyTimer = null;

    const statsClearPlugin = new Plugin();
    let statsClearToast = "";
    statsClearPlugin.showToast = message => { statsClearToast = message; };
    statsClearPlugin.setTranslationCache("stats-key", "stats translation");
    statsClearPlugin.translationCacheStats = { hits: 7, misses: 3 };
    statsClearPlugin.clearTranslationCacheStats();
    assert.deepEqual(statsClearPlugin.translationCacheStats, { hits: 0, misses: 0 });
    assert.equal(statsClearPlugin.translationCache.get("stats-key"), "stats translation");
    assert.match(statsClearToast, /统计|Stats|stats/);
    assert.doesNotMatch(statsClearToast, /翻译缓存已清空|Translation cache cleared/);
    clearTimeout(statsClearPlugin.translationCacheDirtyTimer);
    statsClearPlugin.translationCacheDirtyTimer = null;

    const clearFailurePlugin = new Plugin();
    let clearFailureToastType = "";
    clearFailurePlugin.showToast = (message, type) => { clearFailureToastType = type; };
    clearFailurePlugin.setTranslationCache("clear-failure-key", "keep me");
    clearFailurePlugin.persistentTranslationCacheCount = 1;
    clearTimeout(clearFailurePlugin.translationCacheDirtyTimer);
    clearFailurePlugin.translationCacheDirtyTimer = null;
    clearFailurePlugin.saveData = () => { throw new Error("save unavailable"); };
    assert.equal(clearFailurePlugin.clearTranslationCache(), false);
    assert.equal(clearFailurePlugin.translationCache.get("clear-failure-key"), "keep me");
    assert.equal(clearFailurePlugin.persistentTranslationCacheCount, 1);
    assert.notEqual(clearFailurePlugin.translationCacheDirtyTimer, null);
    assert.equal(clearFailureToastType, "error");
    clearTimeout(clearFailurePlugin.translationCacheDirtyTimer);
    clearFailurePlugin.translationCacheDirtyTimer = null;

    const compactCachePlugin = new Plugin();
    compactCachePlugin.settings.translation.prompt = `compact prompt\n---\n${"x".repeat(160)}`;
    const compactOptionsA = { mode: "auto", messageIdentity: "message:guild:channel:111111111111111111:message:aaa" };
    const compactOptionsB = { mode: "auto", messageIdentity: "message:guild:channel:222222222222222222:message:bbb" };
    const compactKeyA = compactCachePlugin.getTranslationCacheKey("bonjour compact", compactOptionsA);
    const compactKeyB = compactCachePlugin.getTranslationCacheKey("hola compact", compactOptionsB);
    const compactFullKeyA = compactCachePlugin.getFullConfigTranslationCacheKey("bonjour compact", compactOptionsA);
    assert.equal(compactKeyA.includes("compact prompt"), false);
    assert.equal(compactFullKeyA.includes("compact prompt"), true);
    assert.equal(compactCachePlugin.getTranslationCacheAliases("bonjour compact", compactOptionsA).includes(compactFullKeyA), true);
    compactCachePlugin.setTranslationCache(compactKeyA, "translation a");
    compactCachePlugin.setTranslationCache(compactKeyB, "translation b");
    const compactPayload = compactCachePlugin.createPersistedTranslationCachePayload();
    assert.equal(compactPayload.version, 3);
    assert.equal(compactPayload.entries.length, 2);
    assert.equal(compactPayload.entries.every(entry => !entry.key && Array.isArray(entry.k) && Number.isInteger(entry.v)), true);
    assert.equal(compactPayload.entries.some(entry => JSON.stringify(entry).includes(compactKeyA)), false);
    assert.ok(compactPayload.strings.length < compactKeyA.split("\n---\n").length + compactKeyB.split("\n---\n").length);
    const compactRestorePlugin = new Plugin();
    compactRestorePlugin.loadData = key => key === "translationCache" ? compactPayload : null;
    compactRestorePlugin.loadTranslationCache();
    assert.equal(compactRestorePlugin.getTranslationCacheValue(compactKeyA), "translation a");
    assert.equal(compactRestorePlugin.getTranslationCacheValue(compactKeyB), "translation b");

    const valueDedupePlugin = new Plugin();
    valueDedupePlugin.setTranslationCache("dedupe-value-key-a", "same cached translation");
    valueDedupePlugin.setTranslationCache("dedupe-value-key-b", "same cached translation");
    const valueDedupePayload = valueDedupePlugin.createPersistedTranslationCachePayload();
    const valueIndexes = valueDedupePayload.entries.map(entry => entry.v);
    assert.equal(valueIndexes[0], valueIndexes[1]);
    const valueDedupeRestorePlugin = new Plugin();
    valueDedupeRestorePlugin.loadData = key => key === "translationCache" ? valueDedupePayload : null;
    valueDedupeRestorePlugin.loadTranslationCache();
    assert.equal(valueDedupeRestorePlugin.getTranslationCacheValue("dedupe-value-key-a"), "same cached translation");
    assert.equal(valueDedupeRestorePlugin.getTranslationCacheValue("dedupe-value-key-b"), "same cached translation");
    clearTimeout(compactCachePlugin.translationCacheDirtyTimer);
    compactCachePlugin.translationCacheDirtyTimer = null;
    clearTimeout(compactRestorePlugin.translationCacheDirtyTimer);
    compactRestorePlugin.translationCacheDirtyTimer = null;

    const legacyObjectMigrationPlugin = new Plugin();
    let migratedLegacyObjectPayload = null;
    legacyObjectMigrationPlugin.loadData = key => key === "translationCache" ? {
        version: 1,
        ttlHours: 48,
        entries: [{
            key: "legacy-object-key",
            value: "legacy object value",
            createdAt: Date.now(),
            touchedAt: Date.now(),
            expiresAt: Date.now() + 60000
        }]
    } : null;
    legacyObjectMigrationPlugin.saveData = (key, value) => {
        if (key === "translationCache") migratedLegacyObjectPayload = value;
        return true;
    };
    legacyObjectMigrationPlugin.loadTranslationCache();
    assert.equal(legacyObjectMigrationPlugin.getTranslationCacheValue("legacy-object-key"), "legacy object value");
    legacyObjectMigrationPlugin.flushTranslationCache();
    assert.equal(migratedLegacyObjectPayload.version, 3);
    assert.equal(migratedLegacyObjectPayload.entries[0].key, undefined);
    clearTimeout(legacyObjectMigrationPlugin.translationCacheDirtyTimer);
    legacyObjectMigrationPlugin.translationCacheDirtyTimer = null;

    const legacyArrayMigrationPlugin = new Plugin();
    let migratedLegacyArrayPayload = null;
    legacyArrayMigrationPlugin.loadData = key => key === "translationCache" ? [{
        key: "legacy-array-key",
        value: "legacy array value",
        createdAt: Date.now(),
        touchedAt: Date.now(),
        expiresAt: Date.now() + 60000
    }] : null;
    legacyArrayMigrationPlugin.saveData = (key, value) => {
        if (key === "translationCache") migratedLegacyArrayPayload = value;
        return true;
    };
    legacyArrayMigrationPlugin.loadTranslationCache();
    assert.equal(legacyArrayMigrationPlugin.getTranslationCacheValue("legacy-array-key"), "legacy array value");
    legacyArrayMigrationPlugin.flushTranslationCache();
    assert.equal(migratedLegacyArrayPayload.version, 3);
    assert.equal(migratedLegacyArrayPayload.entries[0].key, undefined);
    clearTimeout(legacyArrayMigrationPlugin.translationCacheDirtyTimer);
    legacyArrayMigrationPlugin.translationCacheDirtyTimer = null;

    const restartSeedPlugin = new Plugin();
    let restartSavedPayload = null;
    restartSeedPlugin.saveData = (key, value) => {
        if (key === "translationCache") restartSavedPayload = value;
        return true;
    };
    restartSeedPlugin.getMessageIdentity = message => `message:restart:${message.id}`;
    const restartMessage = { id: "111", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const restartOptions = restartSeedPlugin.withMessageIdentity(restartSeedPlugin.getAutoTranslationOptions(), restartMessage, restartMessage.content, "bonjour");
    const restartKey = restartSeedPlugin.getTranslationCacheKey("bonjour", restartOptions);
    restartSeedPlugin.setTranslationCache(restartKey, "\u4f60\u597d");
    restartSeedPlugin.flushTranslationCache();
    assert.equal(restartSavedPayload.entries.length, 1);

    const restartRestorePlugin = new Plugin();
    const restartRendered = [];
    let restartDrainCount = 0;
    restartRestorePlugin.loadData = key => key === "translationCache" ? restartSavedPayload : null;
    restartRestorePlugin.settings.translation.enabled = true;
    restartRestorePlugin.settings.ui.autoTranslateMessages = true;
    restartRestorePlugin.settings.translation.apiKey = "sk-test";
    restartRestorePlugin.settings.translation.targetLanguage = "Chinese";
    restartRestorePlugin.getMessageIdentity = message => `message:restart:${message.id}`;
    restartRestorePlugin.isElementVisibleInViewport = () => true;
    restartRestorePlugin.getMessageContentElement = message => message.content;
    restartRestorePlugin.getCachedElementText = content => content.text;
    restartRestorePlugin.getElementText = content => content.text;
    restartRestorePlugin.shouldAutoTranslateText = text => text === "bonjour" || text === "hola changed";
    restartRestorePlugin.hasCurrentTranslationLine = () => false;
    restartRestorePlugin.renderTranslation = (messageNode, content, translated, cacheKey) => restartRendered.push({ messageNode, content, translated, cacheKey });
    restartRestorePlugin.drainAutoTranslationQueue = () => { restartDrainCount++; };
    restartRestorePlugin.loadTranslationCache();
    restartRestorePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [restartMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(restartRestorePlugin.autoTranslationQueue.length, 0);
    assert.equal(restartDrainCount, 1);
    assert.equal(restartRendered.length, 1);
    assert.equal(restartRendered[0].translated, "\u4f60\u597d");
    assert.equal(restartRendered[0].cacheKey, restartKey);
    clearTimeout(restartRestorePlugin.translationCacheDirtyTimer);
    restartRestorePlugin.translationCacheDirtyTimer = null;

    const restartChangedMessage = { id: "111", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola changed" } };
    restartRestorePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [restartChangedMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(restartRestorePlugin.autoTranslationQueue.length, 1);
    assert.equal(restartRestorePlugin.autoTranslationQueue[0].text, "hola changed");

    const legacyKeyMigrationPlugin = new Plugin();
    const migrationOptions = { mode: "manual" };
    const migrationPrimaryKey = legacyKeyMigrationPlugin.getTranslationCacheKey("bonjour", migrationOptions);
    const migrationLegacyKey = legacyKeyMigrationPlugin.getLegacyTranslationCacheKey("bonjour", migrationOptions);
    legacyKeyMigrationPlugin.setTranslationCache(migrationLegacyKey, "legacy cached translation");
    legacyKeyMigrationPlugin.translationCache.delete(migrationPrimaryKey);
    legacyKeyMigrationPlugin.translationCacheMeta.delete(migrationPrimaryKey);
    assert.equal(
        legacyKeyMigrationPlugin.getTranslationCacheValue(migrationPrimaryKey, legacyKeyMigrationPlugin.getTranslationCacheAliases("bonjour", migrationOptions)),
        "legacy cached translation"
    );
    assert.equal(legacyKeyMigrationPlugin.translationCache.has(migrationPrimaryKey), true);
    legacyKeyMigrationPlugin.translationCacheMeta.set(migrationPrimaryKey, { createdAt: Date.now() - 10000, touchedAt: Date.now() - 10000, expiresAt: Date.now() - 1 });
    legacyKeyMigrationPlugin.translationCache.delete(migrationLegacyKey);
    legacyKeyMigrationPlugin.translationCache.set(migrationLegacyKey, "fresh legacy cached translation");
    legacyKeyMigrationPlugin.translationCacheMeta.set(migrationLegacyKey, { createdAt: Date.now(), touchedAt: Date.now(), expiresAt: Date.now() + 60000 });
    assert.equal(
        legacyKeyMigrationPlugin.getTranslationCacheValue(migrationPrimaryKey, legacyKeyMigrationPlugin.getTranslationCacheAliases("bonjour", migrationOptions)),
        "fresh legacy cached translation"
    );
    assert.equal(legacyKeyMigrationPlugin.translationCache.get(migrationPrimaryKey), "fresh legacy cached translation");
    clearTimeout(legacyKeyMigrationPlugin.translationCacheDirtyTimer);
    legacyKeyMigrationPlugin.translationCacheDirtyTimer = null;

    const legacyCachePlugin = new Plugin();
    const legacyCreatedAt = Date.now() - (47 * 60 * 60 * 1000);
    legacyCachePlugin.loadData = key => key === "translationCache" ? {
        ttlHours: 48,
        entries: [{
            key: "legacy-key",
            value: "legacy translation",
            createdAt: legacyCreatedAt,
            touchedAt: legacyCreatedAt
        }]
    } : null;
    legacyCachePlugin.loadTranslationCache();
    assert.equal(legacyCachePlugin.getTranslationCacheValue("legacy-key"), "legacy translation");
    assert.ok(legacyCachePlugin.translationCacheMeta.get("legacy-key").expiresAt >= Date.now() + (6 * 60 * 60 * 1000) - 1000);
    clearTimeout(legacyCachePlugin.translationCacheDirtyTimer);
    legacyCachePlugin.translationCacheDirtyTimer = null;

    const cacheSaveFailurePlugin = new Plugin();
    cacheSaveFailurePlugin.saveData = () => { throw new Error("save failed"); };
    cacheSaveFailurePlugin.setTranslationCache("fail-key", "fail");
    const savedWarnForCacheFailure = console.warn;
    console.warn = () => {};
    cacheSaveFailurePlugin.flushTranslationCache();
    console.warn = savedWarnForCacheFailure;
    assert.equal(cacheSaveFailurePlugin.translationCacheDirty, true);
    assert.notEqual(cacheSaveFailurePlugin.translationCacheDirtyTimer, null);
    clearTimeout(cacheSaveFailurePlugin.translationCacheDirtyTimer);
    cacheSaveFailurePlugin.translationCacheDirtyTimer = null;

    const savedBdApiForCacheUnavailable = global.BdApi;
    const savedWarnForCacheUnavailable = console.warn;
    global.BdApi = { Data: {} };
    console.warn = () => {};
    const cacheUnavailablePlugin = new Plugin();
    cacheUnavailablePlugin.setTranslationCache("unavailable-key", "unavailable");
    cacheUnavailablePlugin.flushTranslationCache();
    assert.equal(cacheUnavailablePlugin.translationCacheDirty, true);
    assert.notEqual(cacheUnavailablePlugin.translationCacheDirtyTimer, null);
    clearTimeout(cacheUnavailablePlugin.translationCacheDirtyTimer);
    cacheUnavailablePlugin.translationCacheDirtyTimer = null;
    console.warn = savedWarnForCacheUnavailable;
    if (savedBdApiForCacheUnavailable === undefined) delete global.BdApi;
    else global.BdApi = savedBdApiForCacheUnavailable;

    const stopSettingsPersistPlugin = new Plugin();
    stopSettingsPersistPlugin.showToast = () => {};
    const savedDocumentForStopSettingsPersist = global.document;
    const savedWindowForStopSettingsPersist = global.window;
    global.document = {
        getElementById() { return null; },
        removeEventListener() {},
        querySelectorAll() { return []; }
    };
    global.window = { removeEventListener() {} };
    let stopPersistedSettingsPayload = null;
    stopSettingsPersistPlugin.saveData = (key, value) => {
        if (key === "settings") stopPersistedSettingsPayload = JSON.parse(JSON.stringify(value));
        return true;
    };
    stopSettingsPersistPlugin.setSetting("ui.showAutoTranslateToasts", true);
    assert.equal(stopSettingsPersistPlugin.settingsDirty, true);
    assert.ok(stopSettingsPersistPlugin.settingsDirtyTimer);
    stopSettingsPersistPlugin.stop();
    assert.equal(stopPersistedSettingsPayload.ui.showAutoTranslateToasts, true);
    assert.equal(stopSettingsPersistPlugin.settingsDirty, false);
    assert.equal(stopSettingsPersistPlugin.settingsDirtyTimer, null);
    global.window = savedWindowForStopSettingsPersist;
    global.document = savedDocumentForStopSettingsPersist;

    const stopPersistFailurePlugin = new Plugin();
    stopPersistFailurePlugin.showToast = () => {};
    stopPersistFailurePlugin.setTranslationCache("stop-cache-key", "stop cache value");
    stopPersistFailurePlugin.settings.ui.diagnosticsEnabled = true;
    stopPersistFailurePlugin.logDiagnostic("stop.persist", "dirty", { count: 1 });
    const savedDocumentForStopPersistFailure = global.document;
    const savedWindowForStopPersistFailure = global.window;
    const savedWarnForStopPersistFailure = console.warn;
    global.document = {
        getElementById() { return null; },
        removeEventListener() {},
        querySelectorAll() { return []; }
    };
    global.window = { removeEventListener() {} };
    console.warn = () => {};
    stopPersistFailurePlugin.saveData = () => false;
    stopPersistFailurePlugin.stop();
    assert.equal(stopPersistFailurePlugin.translationCache.get("stop-cache-key"), "stop cache value");
    assert.equal(stopPersistFailurePlugin.translationCacheDirty, true);
    assert.ok(stopPersistFailurePlugin.diagnosticLogs.some(entry => entry.action === "stop.persist"));
    assert.equal(stopPersistFailurePlugin.diagnosticLogsDirty, true);
    let stopPersistedCachePayload = null;
    let stopPersistedDiagnosticPayload = null;
    stopPersistFailurePlugin.saveData = (key, value) => {
        if (key === "translationCache") stopPersistedCachePayload = value;
        if (key === "diagnosticLogs") stopPersistedDiagnosticPayload = value;
        return true;
    };
    assert.equal(stopPersistFailurePlugin.flushTranslationCache({ retryOnError: false }), true);
    assert.equal(stopPersistFailurePlugin.flushDiagnosticLogs({ retryOnError: false }), true);
    assert.equal(stopPersistedCachePayload.entries.length, 1);
    assert.ok(stopPersistedDiagnosticPayload.logs.some(entry => entry.action === "stop.persist"));
    console.warn = savedWarnForStopPersistFailure;
    global.window = savedWindowForStopPersistFailure;
    global.document = savedDocumentForStopPersistFailure;

    const lruCachePlugin = new Plugin();
    lruCachePlugin.settings.ui.translationCacheMaxEntries = 100;
    for (let index = 0; index < 100; index++) {
        lruCachePlugin.setTranslationCache(`lru-${index}`, `value-${index}`);
    }
    assert.equal(lruCachePlugin.getTranslationCacheValue("lru-0"), "value-0");
    lruCachePlugin.setTranslationCache("lru-100", "value-100");
    assert.equal(lruCachePlugin.translationCache.has("lru-0"), true);
    assert.equal(lruCachePlugin.translationCache.has("lru-1"), false);
    assert.equal(lruCachePlugin.translationCache.size, 100);
    clearTimeout(lruCachePlugin.translationCacheDirtyTimer);
    lruCachePlugin.translationCacheDirtyTimer = null;

    const volatileCachePlugin = new Plugin();
    let volatileSavedPayload = null;
    volatileCachePlugin.saveData = (key, value) => {
        if (key === "translationCache") volatileSavedPayload = value;
        return true;
    };
    const volatileIdentity = [
        "fallback",
        "guild",
        "channel",
        "unknown-author",
        "unknown-time",
        volatileCachePlugin.getTextFingerprint("guild/channel"),
        volatileCachePlugin.getTextFingerprint("no-dom-fingerprint"),
        volatileCachePlugin.getTextFingerprint("no-neighbor-context"),
        "message",
        volatileCachePlugin.getTextFingerprint("weak text")
    ].join(":");
    const volatileKey = volatileCachePlugin.getTranslationCacheKey("weak text", { mode: "auto", messageIdentity: volatileIdentity });
    volatileCachePlugin.setTranslationCache(volatileKey, "weak translation");
    volatileCachePlugin.flushTranslationCache();
    assert.equal(volatileCachePlugin.translationCache.has(volatileKey), true);
    assert.equal(volatileSavedPayload.entries.length, 0);

    const settlingPlugin = new Plugin();
    let settlingRetryDelay = 0;
    settlingPlugin.settings.translation.enabled = true;
    settlingPlugin.settings.ui.autoTranslateMessages = true;
    settlingPlugin.settings.translation.apiKey = "sk-test";
    settlingPlugin.settings.translation.targetLanguage = "汉语";
    settlingPlugin.autoTranslationViewportBusyUntil = Date.now() + 1000;
    settlingPlugin.isElementVisibleInViewport = () => true;
    settlingPlugin.getMessageContentElement = message => message.content;
    settlingPlugin.getCachedElementText = content => content.text;
    settlingPlugin.getElementText = content => content.text;
    settlingPlugin.shouldAutoTranslateText = () => true;
    settlingPlugin.hasCurrentTranslationLine = () => false;
    settlingPlugin.scheduleAutoTranslationRetryScan = delay => { settlingRetryDelay = Math.max(settlingRetryDelay, delay); };
    settlingPlugin.drainAutoTranslationQueue = () => { throw new Error("viewport settling should not start new API work"); };
    settlingPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(settlingPlugin.autoTranslationQueue.length, 0);
    assert.ok(settlingRetryDelay > 0);

    const stableGatePlugin = new Plugin();
    stableGatePlugin.settings.translation.enabled = true;
    stableGatePlugin.settings.ui.autoTranslateMessages = true;
    stableGatePlugin.settings.translation.apiKey = "sk-test";
    stableGatePlugin.settings.ui.diagnosticsEnabled = true;
    stableGatePlugin.settings.translation.targetLanguage = "汉语";
    stableGatePlugin.autoTranslationViewportRequiresStableScan = true;
    stableGatePlugin.getAutoTranslationViewportAnchor = () => "stable-anchor";
    stableGatePlugin.isElementVisibleInViewport = () => true;
    stableGatePlugin.getMessageContentElement = message => message.content;
    stableGatePlugin.getCachedElementText = content => content.text;
    stableGatePlugin.getElementText = content => content.text;
    stableGatePlugin.getMessageIdentity = message => `message:stable-gate:${message.id}`;
    stableGatePlugin.shouldAutoTranslateText = () => true;
    stableGatePlugin.hasCurrentTranslationLine = () => false;
    let stableGateRetryDelay = 0;
    let stableGateDrainCount = 0;
    stableGatePlugin.scheduleAutoTranslationRetryScan = delay => { stableGateRetryDelay = Math.max(stableGateRetryDelay, delay); };
    stableGatePlugin.drainAutoTranslationQueue = () => { stableGateDrainCount++; };
    const stableGateContext = {
        messageNodes: [{ id: "first", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola stable" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    };
    stableGatePlugin.queueAutoTranslateVisibleMessages(stableGateContext);
    assert.equal(stableGatePlugin.autoTranslationQueue.length, 0);
    assert.equal(stableGatePlugin.autoTranslationViewportRequiresStableScan, true);
    assert.ok(stableGateRetryDelay >= 180);
    const stableGateBlockedLog = stableGatePlugin.diagnosticLogs.find(entry => entry.action === "auto.scan" && entry.status === "blocked");
    assert.equal(stableGateBlockedLog.meta.viewportStabilityPending, true);
    assert.equal(stableGateBlockedLog.meta.blockReason, "stability-pending");
    stableGatePlugin.queueAutoTranslateVisibleMessages(stableGateContext);
    assert.equal(stableGatePlugin.autoTranslationViewportRequiresStableScan, false);
    assert.equal(stableGatePlugin.autoTranslationQueue.length, 1);
    assert.equal(stableGateDrainCount, 1);

    const terminalFailurePlugin = new Plugin();
    terminalFailurePlugin.settings.translation.enabled = true;
    terminalFailurePlugin.settings.ui.autoTranslateMessages = true;
    terminalFailurePlugin.settings.translation.apiKey = "sk-test";
    terminalFailurePlugin.settings.translation.targetLanguage = "Chinese";
    terminalFailurePlugin.isElementVisibleInViewport = () => true;
    terminalFailurePlugin.getMessageContentElement = message => message.content;
    terminalFailurePlugin.getCachedElementText = content => content.text;
    terminalFailurePlugin.getElementText = content => content.text;
    terminalFailurePlugin.getMessageIdentity = () => "terminal-identity";
    terminalFailurePlugin.shouldAutoTranslateText = () => true;
    terminalFailurePlugin.hasCurrentTranslationLine = () => false;
    let terminalDrainCount = 0;
    terminalFailurePlugin.drainAutoTranslationQueue = () => { terminalDrainCount++; };
    const terminalMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
    const terminalOptions = terminalFailurePlugin.withMessageIdentity(terminalFailurePlugin.getAutoTranslationOptions(), terminalMessage, terminalMessage.content, "hola");
    const terminalKey = terminalFailurePlugin.getTranslationCacheKey("hola", terminalOptions);
    terminalFailurePlugin.autoTranslationFailures.set(terminalKey, terminalFailurePlugin.createAutoTranslationFailure(terminalKey, terminalFailurePlugin.createFinalInvalidAutoTranslationError()));
    terminalFailurePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [terminalMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(terminalFailurePlugin.autoTranslationQueue.length, 0);
    assert.equal(terminalDrainCount, 1);
    const terminalDecision = terminalFailurePlugin.getLastAutoTranslationDecisionsSnapshot(1)[0];
    assert.equal(terminalDecision.state, "terminal-failed");
    terminalFailurePlugin.retryAutoTranslationTarget(terminalMessage, terminalMessage.content, "hola", null, { remove() { this.removed = true; } });
    terminalFailurePlugin.retryAutoTranslationTarget(terminalMessage, terminalMessage.content, "hola", null, { remove() { this.removed = true; } });
    assert.equal(terminalFailurePlugin.autoTranslationQueue.length, 1);
    assert.equal(terminalFailurePlugin.autoTranslationFailures.has(terminalKey), false);

    const scanReschedulePlugin = new Plugin();
    const savedSetTimeoutForScanReschedule = global.setTimeout;
    const savedClearTimeoutForScanReschedule = global.clearTimeout;
    let scanRescheduleDelay = 0;
    let scanRescheduleClearCount = 0;
    global.setTimeout = (_callback, delay) => {
        scanRescheduleDelay = delay;
        return { delay };
    };
    global.clearTimeout = () => { scanRescheduleClearCount++; };
    scanReschedulePlugin.queueScan({ delayMs: 2000 });
    scanReschedulePlugin.queueScan({ delayMs: 100 });
    assert.equal(scanRescheduleDelay, 100);
    assert.equal(scanRescheduleClearCount, 1);
    global.setTimeout = savedSetTimeoutForScanReschedule;
    global.clearTimeout = savedClearTimeoutForScanReschedule;

    const trailingScanPlugin = new Plugin();
    const savedSetTimeoutForTrailingScan = global.setTimeout;
    const savedClearTimeoutForTrailingScan = global.clearTimeout;
    let trailingScanDelay = 0;
    let trailingScanClearCount = 0;
    global.setTimeout = (_callback, delay) => {
        trailingScanDelay = delay;
        return { delay };
    };
    global.clearTimeout = () => { trailingScanClearCount++; };
    trailingScanPlugin.queueScan({ delayMs: 100, trailing: true });
    trailingScanPlugin.queueScan({ delayMs: 900, trailing: true });
    trailingScanPlugin.queueScan({ delayMs: 300, trailing: true });
    assert.equal(trailingScanDelay, 900);
    assert.equal(trailingScanClearCount, 1);
    global.setTimeout = savedSetTimeoutForTrailingScan;
    global.clearTimeout = savedClearTimeoutForTrailingScan;

    const protectedScanPlugin = new Plugin();
    const savedSetTimeoutForProtectedScan = global.setTimeout;
    const savedClearTimeoutForProtectedScan = global.clearTimeout;
    const savedDateNowForProtectedScan = Date.now;
    let protectedScanDelay = 0;
    let protectedScanClearCount = 0;
    Date.now = () => 200000;
    global.setTimeout = (_callback, delay) => {
        protectedScanDelay = delay;
        return { delay };
    };
    global.clearTimeout = () => { protectedScanClearCount++; };
    protectedScanPlugin.queueScan({ delayMs: 900, trailing: true, protectUntil: Date.now() + 900 });
    protectedScanPlugin.queueScan({ delayMs: 100 });
    assert.equal(protectedScanDelay, 900);
    assert.equal(protectedScanClearCount, 0);
    Date.now = savedDateNowForProtectedScan;
    global.setTimeout = savedSetTimeoutForProtectedScan;
    global.clearTimeout = savedClearTimeoutForProtectedScan;

    const mutationTrailingScanPlugin = new Plugin();
    const savedSetTimeoutForMutationTrailing = global.setTimeout;
    const savedClearTimeoutForMutationTrailing = global.clearTimeout;
    const savedDateNowForMutationTrailing = Date.now;
    let mutationTrailingDelay = 0;
    let mutationTrailingClearCount = 0;
    Date.now = () => 100000;
    global.setTimeout = (_callback, delay) => {
        mutationTrailingDelay = delay;
        return { delay };
    };
    global.clearTimeout = () => { mutationTrailingClearCount++; };
    mutationTrailingScanPlugin.queueScan({ delayMs: 900, trailing: true });
    mutationTrailingScanPlugin.autoTranslationViewportBusyUntil = Date.now() + 600;
    mutationTrailingScanPlugin.queueMutationScan();
    assert.equal(mutationTrailingDelay, 900);
    assert.equal(mutationTrailingClearCount, 0);
    mutationTrailingScanPlugin.scanTimer = null;
    mutationTrailingScanPlugin.scanDueAt = 0;
    mutationTrailingScanPlugin.autoTranslationViewportBusyUntil = 0;
    mutationTrailingScanPlugin.queueMutationScan();
    assert.equal(mutationTrailingDelay, 150);
    Date.now = savedDateNowForMutationTrailing;
    global.setTimeout = savedSetTimeoutForMutationTrailing;
    global.clearTimeout = savedClearTimeoutForMutationTrailing;

    const dirtyMutationQueuePlugin = new Plugin();
    const dirtyMutationMessage = {
        id: "chat-messages-dirty-queue",
        isConnected: true,
        nodeType: 1,
        matches: selector => String(selector || "").includes("chat-messages"),
        closest: () => null,
        querySelectorAll: () => [],
        getBoundingClientRect: () => ({ top: 100, bottom: 160, left: 10, right: 100, width: 90, height: 60 })
    };
    let dirtyMutationQueueOptions = null;
    dirtyMutationQueuePlugin.queueScan = options => { dirtyMutationQueueOptions = options || {}; };
    dirtyMutationQueuePlugin.getAutoTranslationRenderPauseRemainingMs = () => 0;
    dirtyMutationQueuePlugin.getAutoTranslationViewportSettleRemainingMs = () => 0;
    dirtyMutationQueuePlugin.queueMutationScan([{
        type: "childList",
        target: { nodeType: 1, isConnected: true, matches: () => false, querySelectorAll: () => [dirtyMutationMessage] },
        addedNodes: [dirtyMutationMessage],
        removedNodes: []
    }]);
    assert.equal(dirtyMutationQueueOptions.dirtyOnly, true);
    assert.equal(dirtyMutationQueuePlugin.pendingMutationScanRoots.has(dirtyMutationMessage), true);
    assert.equal(dirtyMutationQueuePlugin.consumePendingMutationScanRoots()[0], dirtyMutationMessage);

    const broadMutationQueuePlugin = new Plugin();
    let broadMutationDirtyOnly = true;
    broadMutationQueuePlugin.queueScan = options => { broadMutationDirtyOnly = Boolean(options?.dirtyOnly); };
    broadMutationQueuePlugin.getAutoTranslationRenderPauseRemainingMs = () => 0;
    broadMutationQueuePlugin.getAutoTranslationViewportSettleRemainingMs = () => 0;
    const broadMutationMessages = Array.from({ length: 13 }, (_, index) => ({
        id: `chat-messages-broad-${index}`,
        isConnected: true,
        nodeType: 1,
        matches: selector => String(selector || "").includes("chat-messages")
    }));
    broadMutationQueuePlugin.queueMutationScan([{
        type: "attributes",
        target: {
            nodeType: 1,
            isConnected: true,
            matches: selector => String(selector || "").includes("chatContent"),
            closest: () => null,
            querySelectorAll: () => broadMutationMessages
        },
        addedNodes: [],
        removedNodes: []
    }]);
    assert.equal(broadMutationDirtyOnly, false);
    assert.equal(broadMutationQueuePlugin.pendingMutationScanRoots.size, 0);

    const fastStableRetryPlugin = new Plugin();
    fastStableRetryPlugin.settings.ui.autoTranslateMessages = true;
    const savedSetTimeoutForFastStable = global.setTimeout;
    const savedClearTimeoutForFastStable = global.clearTimeout;
    let fastStableRetryDelay = 0;
    global.setTimeout = (_callback, delay) => {
        fastStableRetryDelay = delay;
        return { delay };
    };
    global.clearTimeout = () => {};
    fastStableRetryPlugin.scheduleAutoTranslationRetryScan(180, { minDelayMs: 180 });
    assert.equal(fastStableRetryDelay, 280);
    global.setTimeout = savedSetTimeoutForFastStable;
    global.clearTimeout = savedClearTimeoutForFastStable;

    const pausedScanPlugin = new Plugin();
    pausedScanPlugin.settings.ui.autoTranslateMessages = true;
    pausedScanPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    let pausedScanRetryDelay = 0;
    let pausedScanQueuedDelay = 0;
    let pausedScanContextCreated = false;
    let pausedScanCacheOnly = false;
    let pausedScanQuickSettingsInjected = false;
    let pausedScanCacheOnlyDelay = 0;
    pausedScanPlugin.scheduleAutoTranslationRetryScan = delay => { pausedScanRetryDelay = Math.max(pausedScanRetryDelay, delay); };
    pausedScanPlugin.queueScan = options => { pausedScanQueuedDelay = Number(options?.delayMs || 0); };
    pausedScanPlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { pausedScanCacheOnlyDelay = Math.max(pausedScanCacheOnlyDelay, Number(delay || 0)); };
    pausedScanPlugin.injectQuickSettingsButtons = () => { pausedScanQuickSettingsInjected = true; };
    pausedScanPlugin.createScanContext = () => {
        pausedScanContextCreated = true;
        return { messageNodes: [] };
    };
    pausedScanPlugin.queueAutoTranslateVisibleMessages = (_context, options) => { pausedScanCacheOnly = options?.cacheOnly === true; };
    const savedDocumentForPausedScan = global.document;
    global.document = { querySelectorAll: () => [], documentElement: { clientHeight: 800, clientWidth: 1200 } };
    pausedScanPlugin.scanDiscordUi();
    assert.equal(pausedScanQuickSettingsInjected, false);
    assert.equal(pausedScanContextCreated, false);
    assert.equal(pausedScanCacheOnly, false);
    assert.ok(pausedScanCacheOnlyDelay > 0);
    assert.ok(pausedScanRetryDelay > 0);
    assert.ok(pausedScanQueuedDelay > pausedScanRetryDelay);

    const pausedScanCachePlugin = new Plugin();
    const pausedScanCacheRendered = [];
    pausedScanCachePlugin.settings.translation.enabled = true;
    pausedScanCachePlugin.settings.ui.autoTranslateMessages = true;
    pausedScanCachePlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    pausedScanCachePlugin.isAutoTranslationTargetInScanRange = () => true;
    pausedScanCachePlugin.isElementVisibleInViewport = () => true;
    pausedScanCachePlugin.getMessageContentElement = message => message.content;
    pausedScanCachePlugin.getCachedElementText = content => content.text;
    pausedScanCachePlugin.getElementText = content => content.text;
    pausedScanCachePlugin.getMessageIdentity = message => `message:paused-scan-cache:${message.id}`;
    pausedScanCachePlugin.shouldAutoTranslateText = () => true;
    pausedScanCachePlugin.hasCurrentTranslationLine = () => false;
    pausedScanCachePlugin.isInvalidAutoTranslationCacheValue = () => false;
    pausedScanCachePlugin.renderTranslation = (_messageNode, _content, translated) => { pausedScanCacheRendered.push(translated); };
    pausedScanCachePlugin.injectQuickSettingsButtons = () => { throw new Error("paused scan should not inject quick settings"); };
    pausedScanCachePlugin.drainAutoTranslationQueue = () => { throw new Error("paused cache scan should not drain API queue"); };
    pausedScanCachePlugin.queueScan = () => {};
    pausedScanCachePlugin.scheduleAutoTranslationRetryScan = () => {};
    const pausedScanCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour paused scan cache" } };
    pausedScanCachePlugin.createScanContext = () => ({
        messageNodes: [pausedScanCacheMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    const pausedScanCacheOptions = pausedScanCachePlugin.withMessageIdentity(pausedScanCachePlugin.getAutoTranslationOptions(), pausedScanCacheMessage, pausedScanCacheMessage.content, "bonjour paused scan cache");
    pausedScanCachePlugin.setTranslationCache(pausedScanCachePlugin.getTranslationCacheKey("bonjour paused scan cache", pausedScanCacheOptions), "cached paused scan translation");
    let pausedScanCacheDeferredDelay = 0;
    pausedScanCachePlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { pausedScanCacheDeferredDelay = Math.max(pausedScanCacheDeferredDelay, Number(delay || 0)); };
    pausedScanCachePlugin.scanDiscordUi();
    assert.equal(pausedScanCacheRendered.length, 0);
    assert.equal(pausedScanCachePlugin.autoTranslationQueue.length, 0);
    assert.equal(pausedScanCachePlugin.autoTranslationRenderQueue.length, 0);
    assert.ok(pausedScanCacheDeferredDelay > 0);
    pausedScanCachePlugin.scheduleCacheOnlyAutoTranslationScan = Plugin.prototype.scheduleCacheOnlyAutoTranslationScan.bind(pausedScanCachePlugin);
    pausedScanCachePlugin.autoTranslationRenderPausedUntil = 0;
    pausedScanCachePlugin.autoTranslationViewportBusyUntil = 0;
    pausedScanCachePlugin.autoTranslationJumpCooldownUntil = 0;
    pausedScanCachePlugin.scheduleAutoTranslationRenderQueue = () => {};
    pausedScanCachePlugin.runCacheOnlyAutoTranslationScan("test");
    assert.equal(pausedScanCachePlugin.autoTranslationRenderQueue.length, 1);
    clearTimeout(pausedScanCachePlugin.autoTranslationRenderTimer);
    pausedScanCachePlugin.autoTranslationRenderTimer = null;
    pausedScanCachePlugin.processAutoTranslationRenderQueue();
    assert.deepEqual(pausedScanCacheRendered, ["cached paused scan translation"]);
    clearTimeout(pausedScanCachePlugin.translationCacheDirtyTimer);
    pausedScanCachePlugin.translationCacheDirtyTimer = null;
    if (savedDocumentForPausedScan === undefined) delete global.document;
    else global.document = savedDocumentForPausedScan;

    const settingsSurfaceScanPlugin = new Plugin();
    settingsSurfaceScanPlugin.isStarted = true;
    settingsSurfaceScanPlugin.settings.ui.diagnosticsEnabled = true;
    settingsSurfaceScanPlugin.isDiscordSettingsSurfaceOpen = () => true;
    let settingsSurfaceScanReachedHeavyPath = false;
    settingsSurfaceScanPlugin.trackAutoTranslationRouteChange = () => { settingsSurfaceScanReachedHeavyPath = true; };
    settingsSurfaceScanPlugin.injectQuickSettingsButtons = () => { settingsSurfaceScanReachedHeavyPath = true; };
    settingsSurfaceScanPlugin.createScanContext = () => {
        settingsSurfaceScanReachedHeavyPath = true;
        return { messageNodes: [] };
    };
    const savedDocumentForScanShortCircuitGroup = global.document;
    global.document = { querySelectorAll: () => [], documentElement: { clientHeight: 800, clientWidth: 1200 } };
    settingsSurfaceScanPlugin.scanDiscordUi();
    assert.equal(settingsSurfaceScanReachedHeavyPath, false);
    assert.ok(settingsSurfaceScanPlugin.diagnosticLogs.some(entry => entry.action === "scan.discord-ui" && entry.status === "blocked"));

    const quickSettingsOpenScanPlugin = new Plugin();
    quickSettingsOpenScanPlugin.isStarted = true;
    quickSettingsOpenScanPlugin.settings.ui.diagnosticsEnabled = true;
    quickSettingsOpenScanPlugin.isDiscordMediaViewerQuiet = () => false;
    quickSettingsOpenScanPlugin.isDiscordMediaViewerOpen = () => false;
    quickSettingsOpenScanPlugin.isQuickSettingsPanelOpen = () => true;
    let quickSettingsOpenScanReachedHeavyPath = false;
    quickSettingsOpenScanPlugin.isDiscordSettingsSurfaceOpen = () => {
        quickSettingsOpenScanReachedHeavyPath = true;
        return false;
    };
    quickSettingsOpenScanPlugin.trackAutoTranslationRouteChange = () => {
        quickSettingsOpenScanReachedHeavyPath = true;
        return false;
    };
    quickSettingsOpenScanPlugin.injectQuickSettingsButtons = () => { quickSettingsOpenScanReachedHeavyPath = true; };
    quickSettingsOpenScanPlugin.createScanContext = () => {
        quickSettingsOpenScanReachedHeavyPath = true;
        return { messageNodes: [] };
    };
    quickSettingsOpenScanPlugin.scanDiscordUi();
    assert.equal(quickSettingsOpenScanReachedHeavyPath, false);
    assert.equal(quickSettingsOpenScanPlugin.quickSettingsScanDeferred, true);
    assert.ok(quickSettingsOpenScanPlugin.diagnosticLogs.some(entry => entry.action === "scan.discord-ui" && entry.meta?.reason === "quick-settings-open"));

    const routeChangeScanPlugin = new Plugin();
    routeChangeScanPlugin.isStarted = true;
    routeChangeScanPlugin.settings.ui.diagnosticsEnabled = true;
    routeChangeScanPlugin.settings.ui.autoTranslateMessages = true;
    routeChangeScanPlugin.isDiscordSettingsSurfaceOpen = () => false;
    routeChangeScanPlugin.trackAutoTranslationRouteChange = () => true;
    routeChangeScanPlugin.getAutoTranslationViewportSettleRemainingMs = () => 320;
    let routeChangeQueuedDelay = 0;
    let routeChangeContextCreated = false;
    let routeChangeCacheOnly = false;
    let routeChangeQuickSettingsInjected = false;
    let routeChangeCacheOnlyDelay = 0;
    routeChangeScanPlugin.queueScan = options => { routeChangeQueuedDelay = Number(options?.delayMs || 0); };
    routeChangeScanPlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { routeChangeCacheOnlyDelay = Math.max(routeChangeCacheOnlyDelay, Number(delay || 0)); };
    routeChangeScanPlugin.injectQuickSettingsButtons = () => { routeChangeQuickSettingsInjected = true; };
    routeChangeScanPlugin.createScanContext = () => {
        routeChangeContextCreated = true;
        return { messageNodes: [] };
    };
    routeChangeScanPlugin.queueAutoTranslateVisibleMessages = (_context, options) => { routeChangeCacheOnly = options?.cacheOnly === true; };
    routeChangeScanPlugin.scanDiscordUi();
    assert.equal(routeChangeQuickSettingsInjected, false);
    assert.equal(routeChangeContextCreated, false);
    assert.equal(routeChangeCacheOnly, false);
    assert.ok(routeChangeCacheOnlyDelay > 0);
    assert.equal(routeChangeQueuedDelay, 440);
    assert.ok(routeChangeScanPlugin.diagnosticLogs.some(entry => entry.action === "scan.discord-ui" && entry.status === "deferred"));

    const routeChangeCachePlugin = new Plugin();
    const routeChangeCacheRendered = [];
    routeChangeCachePlugin.settings.translation.enabled = true;
    routeChangeCachePlugin.settings.ui.autoTranslateMessages = true;
    routeChangeCachePlugin.settings.translation.apiKey = "sk-test";
    routeChangeCachePlugin.isDiscordSettingsSurfaceOpen = () => false;
    routeChangeCachePlugin.trackAutoTranslationRouteChange = () => {
        routeChangeCachePlugin.autoTranslationViewportBusyUntil = Date.now() + 1000;
        return true;
    };
    routeChangeCachePlugin.isAutoTranslationTargetInScanRange = () => true;
    routeChangeCachePlugin.isElementVisibleInViewport = () => true;
    routeChangeCachePlugin.getMessageContentElement = message => message.content;
    routeChangeCachePlugin.getCachedElementText = content => content.text;
    routeChangeCachePlugin.getElementText = content => content.text;
    routeChangeCachePlugin.getMessageIdentity = message => `message:route-change-cache:${message.id}`;
    routeChangeCachePlugin.shouldAutoTranslateText = () => true;
    routeChangeCachePlugin.hasCurrentTranslationLine = () => false;
    routeChangeCachePlugin.isInvalidAutoTranslationCacheValue = () => false;
    routeChangeCachePlugin.renderTranslation = (_messageNode, _content, translated) => { routeChangeCacheRendered.push(translated); };
    routeChangeCachePlugin.injectQuickSettingsButtons = () => { throw new Error("route change cache scan should not inject quick settings"); };
    routeChangeCachePlugin.drainAutoTranslationQueue = () => { throw new Error("route change cache scan should not drain API queue"); };
    routeChangeCachePlugin.queueScan = () => {};
    routeChangeCachePlugin.scheduleAutoTranslationRetryScan = () => {};
    const routeChangeCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour route cache" } };
    routeChangeCachePlugin.createScanContext = () => ({
        messageNodes: [routeChangeCacheMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    const routeChangeCacheOptions = routeChangeCachePlugin.withMessageIdentity(routeChangeCachePlugin.getAutoTranslationOptions(), routeChangeCacheMessage, routeChangeCacheMessage.content, "bonjour route cache");
    routeChangeCachePlugin.setTranslationCache(routeChangeCachePlugin.getTranslationCacheKey("bonjour route cache", routeChangeCacheOptions), "cached route translation");
    let routeChangeCacheOnlyDeferredDelay = 0;
    routeChangeCachePlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { routeChangeCacheOnlyDeferredDelay = Math.max(routeChangeCacheOnlyDeferredDelay, Number(delay || 0)); };
    routeChangeCachePlugin.scanDiscordUi();
    assert.equal(routeChangeCacheRendered.length, 0);
    assert.equal(routeChangeCachePlugin.autoTranslationQueue.length, 0);
    assert.equal(routeChangeCachePlugin.autoTranslationRenderQueue.length, 0);
    assert.ok(routeChangeCacheOnlyDeferredDelay > 0);
    routeChangeCachePlugin.scheduleCacheOnlyAutoTranslationScan = Plugin.prototype.scheduleCacheOnlyAutoTranslationScan.bind(routeChangeCachePlugin);
    routeChangeCachePlugin.autoTranslationViewportBusyUntil = 0;
    routeChangeCachePlugin.autoTranslationJumpCooldownUntil = 0;
    routeChangeCachePlugin.autoTranslationRenderPausedUntil = 0;
    routeChangeCachePlugin.scheduleAutoTranslationRenderQueue = () => {};
    routeChangeCachePlugin.runCacheOnlyAutoTranslationScan("test");
    assert.equal(routeChangeCachePlugin.autoTranslationRenderQueue.length, 1);
    clearTimeout(routeChangeCachePlugin.autoTranslationRenderTimer);
    routeChangeCachePlugin.autoTranslationRenderTimer = null;
    routeChangeCachePlugin.processAutoTranslationRenderQueue();
    assert.deepEqual(routeChangeCacheRendered, ["cached route translation"]);
    clearTimeout(routeChangeCachePlugin.translationCacheDirtyTimer);
    routeChangeCachePlugin.translationCacheDirtyTimer = null;
    if (savedDocumentForScanShortCircuitGroup === undefined) delete global.document;
    else global.document = savedDocumentForScanShortCircuitGroup;

    const staleRouteCacheRenderPlugin = new Plugin();
    staleRouteCacheRenderPlugin.settings.translation.enabled = true;
    staleRouteCacheRenderPlugin.settings.ui.autoTranslateMessages = true;
    staleRouteCacheRenderPlugin.settings.translation.apiKey = "sk-test";
    staleRouteCacheRenderPlugin.settings.ui.diagnosticsEnabled = true;
    staleRouteCacheRenderPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    // Still scrolling, so the cached draw stays queued until after the route change below.
    staleRouteCacheRenderPlugin.autoTranslationLastExternalScrollAt = Date.now();
    let staleRouteCacheCurrentRoute = "guild-a:channel-old:";
    staleRouteCacheRenderPlugin.getCurrentRouteKey = () => staleRouteCacheCurrentRoute;
    staleRouteCacheRenderPlugin.isAutoTranslationTargetInScanRange = () => true;
    staleRouteCacheRenderPlugin.isElementVisibleInViewport = () => true;
    staleRouteCacheRenderPlugin.getMessageContentElement = message => message.content;
    staleRouteCacheRenderPlugin.getCachedElementText = content => content.text;
    staleRouteCacheRenderPlugin.getElementText = content => content.text;
    staleRouteCacheRenderPlugin.getMessageIdentity = message => `message:stale-route-cache:${message.id}`;
    staleRouteCacheRenderPlugin.shouldAutoTranslateText = () => true;
    staleRouteCacheRenderPlugin.hasCurrentTranslationLine = () => false;
    staleRouteCacheRenderPlugin.isInvalidAutoTranslationCacheValue = () => false;
    staleRouteCacheRenderPlugin.renderTranslation = () => { throw new Error("stale route cache render should be skipped"); };
    staleRouteCacheRenderPlugin.drainAutoTranslationQueue = () => { throw new Error("stale route cache scan should not start API work"); };
    staleRouteCacheRenderPlugin.queueScan = () => {};
    staleRouteCacheRenderPlugin.scheduleAutoTranslationRetryScan = () => {};
    const staleRouteCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour stale route cache" } };
    const staleRouteCacheOptions = staleRouteCacheRenderPlugin.withMessageIdentity(staleRouteCacheRenderPlugin.getAutoTranslationOptions(), staleRouteCacheMessage, staleRouteCacheMessage.content, "bonjour stale route cache");
    staleRouteCacheRenderPlugin.setTranslationCache(staleRouteCacheRenderPlugin.getTranslationCacheKey("bonjour stale route cache", staleRouteCacheOptions), "stale route cached translation");
    staleRouteCacheRenderPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [staleRouteCacheMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    }, { cacheOnly: true });
    assert.equal(staleRouteCacheRenderPlugin.autoTranslationRenderQueue.length, 1);
    clearTimeout(staleRouteCacheRenderPlugin.autoTranslationRenderTimer);
    staleRouteCacheRenderPlugin.autoTranslationRenderTimer = null;
    staleRouteCacheCurrentRoute = "guild-a:channel-new:";
    staleRouteCacheRenderPlugin.autoTranslationRenderPausedUntil = 0;
    staleRouteCacheRenderPlugin.autoTranslationLastExternalScrollAt = 0;
    staleRouteCacheRenderPlugin.processAutoTranslationRenderQueue();
    assert.ok(staleRouteCacheRenderPlugin.diagnosticLogs.some(entry => entry.meta?.reasonCode === "render-request-stale"));
    clearTimeout(staleRouteCacheRenderPlugin.translationCacheDirtyTimer);
    staleRouteCacheRenderPlugin.translationCacheDirtyTimer = null;

    const staleProviderCacheRenderPlugin = new Plugin();
    staleProviderCacheRenderPlugin.settings.translation.enabled = true;
    staleProviderCacheRenderPlugin.settings.ui.autoTranslateMessages = true;
    staleProviderCacheRenderPlugin.settings.translation.apiKey = "sk-old";
    staleProviderCacheRenderPlugin.settings.ui.diagnosticsEnabled = true;
    staleProviderCacheRenderPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    staleProviderCacheRenderPlugin.autoTranslationLastExternalScrollAt = Date.now();
    staleProviderCacheRenderPlugin.getCurrentRouteKey = () => "guild-a:channel-a:";
    staleProviderCacheRenderPlugin.isAutoTranslationTargetInScanRange = () => true;
    staleProviderCacheRenderPlugin.isElementVisibleInViewport = () => true;
    staleProviderCacheRenderPlugin.getMessageContentElement = message => message.content;
    staleProviderCacheRenderPlugin.getCachedElementText = content => content.text;
    staleProviderCacheRenderPlugin.getElementText = content => content.text;
    staleProviderCacheRenderPlugin.getMessageIdentity = message => `message:stale-provider-cache:${message.id}`;
    staleProviderCacheRenderPlugin.shouldAutoTranslateText = () => true;
    staleProviderCacheRenderPlugin.hasCurrentTranslationLine = () => false;
    staleProviderCacheRenderPlugin.isInvalidAutoTranslationCacheValue = () => false;
    staleProviderCacheRenderPlugin.renderTranslation = () => { throw new Error("stale provider cache render should be skipped"); };
    staleProviderCacheRenderPlugin.drainAutoTranslationQueue = () => { throw new Error("stale provider cache scan should not start API work"); };
    staleProviderCacheRenderPlugin.queueScan = () => {};
    staleProviderCacheRenderPlugin.scheduleAutoTranslationRetryScan = () => {};
    const staleProviderCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour stale provider cache" } };
    const staleProviderCacheOptions = staleProviderCacheRenderPlugin.withMessageIdentity(staleProviderCacheRenderPlugin.getAutoTranslationOptions(), staleProviderCacheMessage, staleProviderCacheMessage.content, "bonjour stale provider cache");
    staleProviderCacheRenderPlugin.setTranslationCache(staleProviderCacheRenderPlugin.getTranslationCacheKey("bonjour stale provider cache", staleProviderCacheOptions), "stale provider cached translation");
    staleProviderCacheRenderPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [staleProviderCacheMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    }, { cacheOnly: true });
    assert.equal(staleProviderCacheRenderPlugin.autoTranslationRenderQueue.length, 1);
    clearTimeout(staleProviderCacheRenderPlugin.autoTranslationRenderTimer);
    staleProviderCacheRenderPlugin.autoTranslationRenderTimer = null;
    staleProviderCacheRenderPlugin.settings.translation.apiKey = "sk-new";
    staleProviderCacheRenderPlugin.autoTranslationRenderPausedUntil = 0;
    staleProviderCacheRenderPlugin.autoTranslationLastExternalScrollAt = 0;
    staleProviderCacheRenderPlugin.processAutoTranslationRenderQueue();
    assert.ok(staleProviderCacheRenderPlugin.diagnosticLogs.some(entry => entry.meta?.reasonCode === "render-request-stale"));
    clearTimeout(staleProviderCacheRenderPlugin.translationCacheDirtyTimer);
    staleProviderCacheRenderPlugin.translationCacheDirtyTimer = null;

    const textTerminalPlugin = new Plugin();
    textTerminalPlugin.settings.translation.enabled = true;
    textTerminalPlugin.settings.ui.autoTranslateMessages = true;
    textTerminalPlugin.settings.translation.apiKey = "sk-test";
    textTerminalPlugin.settings.translation.targetLanguage = "Chinese";
    textTerminalPlugin.isElementVisibleInViewport = () => true;
    textTerminalPlugin.getMessageContentElement = message => message.content;
    textTerminalPlugin.getCachedElementText = content => content.text;
    textTerminalPlugin.getElementText = content => content.text;
    textTerminalPlugin.getMessageIdentity = message => `message:text-terminal:${message.id}`;
    textTerminalPlugin.shouldAutoTranslateText = () => true;
    textTerminalPlugin.hasCurrentTranslationLine = () => false;
    let textTerminalDrainCount = 0;
    textTerminalPlugin.drainAutoTranslationQueue = () => { textTerminalDrainCount++; };
    const textTerminalOptions = textTerminalPlugin.getAutoTranslationOptions();
    const textTerminalFailureKey = textTerminalPlugin.getAutoTextTranslationFailureKey("same bad text", textTerminalOptions);
    textTerminalPlugin.autoTranslationFailures.set(textTerminalFailureKey, textTerminalPlugin.createAutoTranslationFailure(textTerminalFailureKey, textTerminalPlugin.createFinalInvalidAutoTranslationError()));
    textTerminalPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ id: "different-message", isConnected: true, content: { dataset: {}, isConnected: true, text: "same bad text" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(textTerminalPlugin.autoTranslationQueue.length, 0);
    assert.equal(textTerminalDrainCount, 1);

    const textTerminalPathPlugin = new Plugin();
    textTerminalPathPlugin.settings.translation.enabled = true;
    textTerminalPathPlugin.settings.ui.autoTranslateMessages = true;
    textTerminalPathPlugin.settings.translation.apiKey = "sk-test";
    textTerminalPathPlugin.settings.translation.targetLanguage = "Chinese";
    textTerminalPathPlugin.isElementVisibleInViewport = () => true;
    textTerminalPathPlugin.getMessageContentElement = message => message.content;
    textTerminalPathPlugin.getCachedElementText = content => content.text;
    textTerminalPathPlugin.getElementText = content => content.text;
    textTerminalPathPlugin.getMessageIdentity = message => `message:text-path:${message.id}`;
    textTerminalPathPlugin.shouldAutoTranslateText = () => true;
    textTerminalPathPlugin.hasCurrentTranslationLine = () => false;
    textTerminalPathPlugin.removeAutoTranslationNode = () => {};
    textTerminalPathPlugin.renderAutoTranslationFailure = () => {};
    textTerminalPathPlugin.drainAutoTranslationQueue = () => {};
    const textTerminalPathMessage = { id: "failed-message", isConnected: true, content: { dataset: {}, isConnected: true, text: "path bad text" } };
    const textTerminalPathOptions = textTerminalPathPlugin.withMessageIdentity(textTerminalPathPlugin.getAutoTranslationOptions(), textTerminalPathMessage, textTerminalPathMessage.content, "path bad text");
    const textTerminalPathKey = textTerminalPathPlugin.getTranslationCacheKey("path bad text", textTerminalPathOptions);
    textTerminalPathPlugin.markAutoTranslationFailure({
        messageNode: textTerminalPathMessage,
        content: textTerminalPathMessage.content,
        text: "path bad text",
        cacheKey: textTerminalPathKey,
        requestOptions: textTerminalPathOptions
    }, textTerminalPathPlugin.createFinalInvalidAutoTranslationError());
    textTerminalPathPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ id: "different-failed-message", isConnected: true, content: { dataset: {}, isConnected: true, text: "path bad text" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(textTerminalPathPlugin.autoTranslationQueue.length, 1);
    clearTimeout(textTerminalPathPlugin.autoTranslationRetryTimer);
    textTerminalPathPlugin.autoTranslationRetryTimer = null;

    const textFailureTargetIsolationPlugin = new Plugin();
    textFailureTargetIsolationPlugin.settings.translation.enabled = true;
    textFailureTargetIsolationPlugin.settings.ui.autoTranslateMessages = true;
    textFailureTargetIsolationPlugin.settings.translation.apiKey = "sk-test";
    textFailureTargetIsolationPlugin.settings.translation.targetLanguage = "Chinese";
    textFailureTargetIsolationPlugin.isElementVisibleInViewport = () => true;
    textFailureTargetIsolationPlugin.getMessageContentElement = message => message.content;
    textFailureTargetIsolationPlugin.getCachedElementText = content => content.text;
    textFailureTargetIsolationPlugin.getElementText = content => content.text;
    textFailureTargetIsolationPlugin.getMessageIdentity = message => `message:text-target:${message.id}`;
    textFailureTargetIsolationPlugin.shouldAutoTranslateText = () => true;
    textFailureTargetIsolationPlugin.hasCurrentTranslationLine = () => false;
    textFailureTargetIsolationPlugin.drainAutoTranslationQueue = () => {};
    const textFailureChineseOptions = textFailureTargetIsolationPlugin.getAutoTranslationOptions();
    const textFailureChineseKey = textFailureTargetIsolationPlugin.getAutoTextTranslationFailureKey("same target text", textFailureChineseOptions);
    textFailureTargetIsolationPlugin.autoTranslationFailures.set(textFailureChineseKey, textFailureTargetIsolationPlugin.createAutoTranslationFailure(textFailureChineseKey, textFailureTargetIsolationPlugin.createFinalInvalidAutoTranslationError()));
    textFailureTargetIsolationPlugin.settings.translation.targetLanguage = "English";
    textFailureTargetIsolationPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ id: "english-target", isConnected: true, content: { dataset: {}, isConnected: true, text: "same target text" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(textFailureTargetIsolationPlugin.autoTranslationQueue.length, 1);

    const textSuccessCachePlugin = new Plugin();
    textSuccessCachePlugin.settings.translation.enabled = true;
    textSuccessCachePlugin.settings.ui.autoTranslateMessages = true;
    textSuccessCachePlugin.settings.translation.apiKey = "sk-test";
    textSuccessCachePlugin.settings.translation.targetLanguage = "Chinese";
    textSuccessCachePlugin.isElementVisibleInViewport = () => true;
    textSuccessCachePlugin.getMessageContentElement = message => message.content;
    textSuccessCachePlugin.getCachedElementText = content => content.text;
    textSuccessCachePlugin.getElementText = content => content.text;
    textSuccessCachePlugin.getMessageIdentity = message => `message:text-success:${message.id}`;
    textSuccessCachePlugin.shouldAutoTranslateText = text => text === "cached success text";
    textSuccessCachePlugin.hasCurrentTranslationLine = () => false;
    const textSuccessRendered = [];
    textSuccessCachePlugin.renderTranslation = (messageNode, content, translated) => textSuccessRendered.push({ messageNode, content, translated });
    textSuccessCachePlugin.drainAutoTranslationQueue = () => {};
    const textSuccessOptions = textSuccessCachePlugin.getAutoTranslationOptions();
    const textSuccessFailureKey = textSuccessCachePlugin.getAutoTextTranslationFailureKey("cached success text", textSuccessOptions);
    textSuccessCachePlugin.autoTranslationFailures.set(textSuccessFailureKey, textSuccessCachePlugin.createAutoTranslationFailure(textSuccessFailureKey, textSuccessCachePlugin.createFinalInvalidAutoTranslationError()));
    textSuccessCachePlugin.setAutoTextTranslationCache("cached success text", textSuccessOptions, "\u5df2\u7ffb\u8bd1\u7684\u7f13\u5b58");
    const textSuccessMessage = { id: "cache-hit", isConnected: true, content: { dataset: {}, isConnected: true, text: "cached success text" } };
    textSuccessCachePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [textSuccessMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(textSuccessRendered.length, 1);
    assert.equal(textSuccessRendered[0].translated, "\u5df2\u7ffb\u8bd1\u7684\u7f13\u5b58");
    assert.equal(textSuccessCachePlugin.autoTranslationFailures.has(textSuccessFailureKey), false);
    assert.equal(textSuccessCachePlugin.autoTranslationQueue.length, 0);
    clearTimeout(textSuccessCachePlugin.translationCacheDirtyTimer);
    textSuccessCachePlugin.translationCacheDirtyTimer = null;

    const retryTextFailurePlugin = new Plugin();
    retryTextFailurePlugin.settings.translation.enabled = true;
    retryTextFailurePlugin.settings.ui.autoTranslateMessages = true;
    retryTextFailurePlugin.settings.translation.apiKey = "sk-test";
    retryTextFailurePlugin.getMessageIdentity = () => "retry-text-identity";
    retryTextFailurePlugin.getElementText = content => content.text;
    retryTextFailurePlugin.isReplyPreviewElement = () => false;
    retryTextFailurePlugin.drainAutoTranslationQueue = () => {};
    const retryTextContent = { dataset: {}, isConnected: true, text: "same bad text" };
    const retryTextMessage = { isConnected: true };
    const retryTextOptions = retryTextFailurePlugin.withMessageIdentity(retryTextFailurePlugin.getAutoTranslationOptions(), retryTextMessage, retryTextContent, "same bad text");
    const retryTextCacheKey = retryTextFailurePlugin.getTranslationCacheKey("same bad text", retryTextOptions);
    const retryTextFailureKey = retryTextFailurePlugin.getAutoTextTranslationFailureKey("same bad text", retryTextOptions);
    retryTextFailurePlugin.autoTranslationFailures.set(retryTextCacheKey, retryTextFailurePlugin.createAutoTranslationFailure(retryTextCacheKey, retryTextFailurePlugin.createFinalInvalidAutoTranslationError()));
    retryTextFailurePlugin.autoTranslationFailures.set(retryTextFailureKey, retryTextFailurePlugin.createAutoTranslationFailure(retryTextFailureKey, retryTextFailurePlugin.createFinalInvalidAutoTranslationError()));
    retryTextFailurePlugin.retryAutoTranslationTarget(retryTextMessage, retryTextContent, "same bad text");
    assert.equal(retryTextFailurePlugin.autoTranslationFailures.has(retryTextCacheKey), false);
    assert.equal(retryTextFailurePlugin.autoTranslationFailures.has(retryTextFailureKey), false);
    assert.equal(retryTextFailurePlugin.autoTranslationQueue.length, 1);

    const routeSettlePlugin = new Plugin();
    const savedWindowForRouteSettle = global.window;
    const savedDocumentForRouteSettle = global.document;
    global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" }, innerHeight: 800, scrollY: 0, pageYOffset: 0 };
    global.document = { documentElement: { clientHeight: 800 } };
    assert.equal(routeSettlePlugin.trackAutoTranslationRouteChange(), false);
    global.window.location.pathname = "/channels/111111111111111111/333333333333333333";
    assert.equal(routeSettlePlugin.trackAutoTranslationRouteChange(), true);
    assert.equal(routeSettlePlugin.isAutoTranslationViewportSettling(), true);
    assert.equal(routeSettlePlugin.isAutoTranslationJumpCoolingDown(), true);
    routeSettlePlugin.settings.translation.enabled = true;
    routeSettlePlugin.settings.ui.autoTranslateMessages = true;
    routeSettlePlugin.settings.translation.apiKey = "sk-test";
    routeSettlePlugin.settings.translation.targetLanguage = "Chinese";
    routeSettlePlugin.isElementVisibleInViewport = () => true;
    routeSettlePlugin.getMessageContentElement = message => message.content;
    routeSettlePlugin.getCachedElementText = content => content.text;
    routeSettlePlugin.getElementText = content => content.text;
    routeSettlePlugin.shouldAutoTranslateText = () => true;
    routeSettlePlugin.hasCurrentTranslationLine = () => false;
    routeSettlePlugin.scheduleAutoTranslationRetryScan = () => {};
    routeSettlePlugin.drainAutoTranslationQueue = () => { throw new Error("route settling should not drain API work"); };
    routeSettlePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } }],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(routeSettlePlugin.autoTranslationQueue.length, 0);
    global.window = savedWindowForRouteSettle;
    global.document = savedDocumentForRouteSettle;

    const permalinkRoutePlugin = new Plugin();
    const savedWindowForPermalinkRoute = global.window;
    const savedDocumentForPermalinkRoute = global.document;
    global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" }, innerHeight: 800, scrollY: 0, pageYOffset: 0 };
    global.document = { documentElement: { clientHeight: 800 } };
    assert.equal(permalinkRoutePlugin.trackAutoTranslationRouteChange(), false);
    global.window.location.pathname = "/channels/111111111111111111/222222222222222222/444444444444444444";
    assert.equal(permalinkRoutePlugin.trackAutoTranslationRouteChange(), true);
    assert.equal(permalinkRoutePlugin.isAutoTranslationJumpCoolingDown(), true);
    global.window = savedWindowForPermalinkRoute;
    global.document = savedDocumentForPermalinkRoute;

    const routeMixedPlugin = new Plugin();
    const savedWindowForRouteMixed = global.window;
    const savedDocumentForRouteMixed = global.document;
    let routeMixedRetryDelay = 0;
    const routeMixedRendered = [];
    global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" }, innerHeight: 800, scrollY: 0, pageYOffset: 0 };
    global.document = { documentElement: { clientHeight: 800 }, querySelectorAll: () => [] };
    assert.equal(routeMixedPlugin.trackAutoTranslationRouteChange(), false);
    routeMixedPlugin.settings.translation.enabled = true;
    routeMixedPlugin.settings.ui.autoTranslateMessages = true;
    routeMixedPlugin.settings.translation.apiKey = "sk-test";
    routeMixedPlugin.settings.translation.targetLanguage = "Chinese";
    routeMixedPlugin.getMessageIdentity = message => `message:route-mixed:${message.id}`;
    routeMixedPlugin.isElementVisibleInViewport = () => true;
    routeMixedPlugin.getMessageContentElement = message => message.content;
    routeMixedPlugin.getCachedElementText = content => content.text;
    routeMixedPlugin.getElementText = content => content.text;
    routeMixedPlugin.shouldAutoTranslateText = () => true;
    routeMixedPlugin.hasCurrentTranslationLine = () => false;
    routeMixedPlugin.scheduleAutoTranslationRetryScan = delay => { routeMixedRetryDelay = Math.max(routeMixedRetryDelay, delay); };
    routeMixedPlugin.renderTranslation = (messageNode, content, translated) => routeMixedRendered.push({ messageNode, content, translated });
    routeMixedPlugin.drainAutoTranslationQueue = () => { throw new Error("route mixed settling should not drain API work"); };
    const routeMixedCached = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
    const routeMixedUncached = { id: "uncached", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
    const routeMixedCachedOptions = routeMixedPlugin.withMessageIdentity(routeMixedPlugin.getAutoTranslationOptions(), routeMixedCached, routeMixedCached.content, "bonjour");
    routeMixedPlugin.setTranslationCache(routeMixedPlugin.getTranslationCacheKey("bonjour", routeMixedCachedOptions), "\u4f60\u597d");
    global.window.location.pathname = "/channels/111111111111111111/333333333333333333";
    assert.equal(routeMixedPlugin.trackAutoTranslationRouteChange(), true);
    routeMixedPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [routeMixedUncached, routeMixedCached],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(routeMixedRendered.length, 0);
    assert.equal(routeMixedPlugin.autoTranslationQueue.length, 0);
    assert.ok(routeMixedRetryDelay > 0);
    clearTimeout(routeMixedPlugin.translationCacheDirtyTimer);
    routeMixedPlugin.translationCacheDirtyTimer = null;
    global.window = savedWindowForRouteMixed;
    global.document = savedDocumentForRouteMixed;

    const mutationSettlePlugin = new Plugin();
    const messageMutationNodes = Array.from({ length: 8 }, () => ({
        nodeType: 1,
        matches: selector => selector.includes("chat-messages"),
        querySelectorAll: () => []
    }));
    assert.equal(mutationSettlePlugin.hasLargeMessageMutation([{ type: "childList", addedNodes: messageMutationNodes, removedNodes: [] }]), true);
    const mediaOnlyImageNode = {
        nodeType: 1,
        innerText: "",
        textContent: "",
        matches: selector => String(selector || "").includes("img"),
        closest: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    assert.equal(mutationSettlePlugin.isMediaOnlyMutation({
        type: "attributes",
        attributeName: "style",
        target: mediaOnlyImageNode
    }), true);
    assert.equal(mutationSettlePlugin.getScanRelevantMutations([{
        type: "attributes",
        attributeName: "style",
        target: mediaOnlyImageNode
    }]).length, 0);
    assert.equal(mutationSettlePlugin.hasLargeMessageMutation([{
        type: "childList",
        addedNodes: [mediaOnlyImageNode],
        removedNodes: []
    }]), false);
    const mediaViewerNode = {
        nodeType: 1,
        innerText: "",
        textContent: "",
        matches: selector => String(selector || "").includes("imageModal"),
        closest: () => null,
        querySelector: () => null
    };
    const savedDocumentForMediaScroll = global.document;
    const savedWindowForMediaScroll = global.window;
    global.document = { body: {}, documentElement: {} };
    global.window = {};
    assert.equal(mutationSettlePlugin.isAutoTranslationScrollEventRelevant({ type: "scroll", target: mediaViewerNode }), false);
    const chatScrollProbePlugin = new Plugin();
    chatScrollProbePlugin.isInsideDiscordMediaViewer = () => false;
    chatScrollProbePlugin.isMediaOnlyMutationElement = () => false;
    chatScrollProbePlugin.isAutoTranslationScrollEventRelevant = () => true;
    chatScrollProbePlugin.isDiscordMediaViewerOpen = () => {
        throw new Error("ordinary chat scroll should not probe media viewer globally");
    };
    assert.equal(chatScrollProbePlugin.isDiscordMediaViewerViewportEvent({
        type: "scroll",
        target: { nodeType: 1 }
    }), false);
    const mediaOverlayNode = {
        nodeType: 1,
        innerText: "Open original Download",
        textContent: "Open original Download",
        matches: selector => String(selector || "").includes("[role='dialog']"),
        closest: () => null,
        querySelector: selector => String(selector || "").includes("chat-messages") ? null : (String(selector || "").includes("img") ? ({}) : null),
        querySelectorAll: selector => String(selector || "").includes("chat-messages") ? [] : []
    };
    assert.equal(mutationSettlePlugin.isDiscordMediaViewerElement(mediaOverlayNode), true);
    assert.equal(mutationSettlePlugin.isDiscordMediaViewerMutation({
        type: "childList",
        target: global.document.body,
        addedNodes: [mediaOverlayNode],
        removedNodes: []
    }), true);
    assert.equal(mutationSettlePlugin.getScanRelevantMutations([{
        type: "childList",
        target: global.document.body,
        addedNodes: [mediaOverlayNode],
        removedNodes: []
    }]).length, 0);
    const mediaFocusPlugin = new Plugin();
    mediaFocusPlugin.isStarted = true;
    let mediaFocusScanCount = 0;
    mediaFocusPlugin.queueScan = () => { mediaFocusScanCount++; };
    global.document = {
        body: {},
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: selector => String(selector || "").includes("[role='dialog']") ? [mediaOverlayNode] : []
    };
    mediaFocusPlugin.queueViewportScan({ type: "focus", target: global.document });
    assert.equal(mediaFocusScanCount, 0);
    let mediaScanQuickSettingsCount = 0;
    mediaFocusPlugin.injectQuickSettingsButtons = () => { mediaScanQuickSettingsCount++; };
    mediaFocusPlugin.scanDiscordUi();
    assert.equal(mediaScanQuickSettingsCount, 0);
    const savedSetTimeoutForMediaQuiet = global.setTimeout;
    const savedClearTimeoutForMediaQuiet = global.clearTimeout;
    let mediaQuietDelay = 0;
    global.setTimeout = (callback, delay) => {
        mediaQuietDelay = delay;
        return "media-quiet-timer";
    };
    global.clearTimeout = () => {};
    const mediaQuietPlugin = new Plugin();
    mediaQuietPlugin.isStarted = true;
    mediaQuietPlugin.mediaViewerQuietUntil = Date.now() + 500;
    mediaQuietPlugin.queueScan({ delayMs: 0 });
    assert.equal(mediaQuietPlugin.scanTimer, "media-quiet-timer");
    assert.ok(mediaQuietDelay >= 500);
    mediaQuietPlugin.scanTimer = null;
    mediaQuietPlugin.scanDueAt = 0;
    global.setTimeout = savedSetTimeoutForMediaQuiet;
    global.clearTimeout = savedClearTimeoutForMediaQuiet;

    const mediaInputQuietPlugin = new Plugin();
    mediaInputQuietPlugin.isStarted = true;
    mediaInputQuietPlugin.settings.ui.injectInputButton = true;
    mediaInputQuietPlugin.mediaViewerQuietUntil = Date.now() + 500;
    let mediaInputQuietInjected = 0;
    let mediaInputQuietDelay = 0;
    mediaInputQuietPlugin.injectInputButtons = () => { mediaInputQuietInjected++; };
    mediaInputQuietPlugin.queueInputButtonScan = options => { mediaInputQuietDelay = Math.max(mediaInputQuietDelay, Number(options?.delayMs) || 0); };
    mediaInputQuietPlugin.scanInputButtonsOnly();
    assert.equal(mediaInputQuietInjected, 0);
    assert.ok(mediaInputQuietDelay >= 500);

    const savedSetTimeoutForMediaRender = global.setTimeout;
    const savedClearTimeoutForMediaRender = global.clearTimeout;
    let mediaRenderQuietDelay = 0;
    global.setTimeout = (callback, delay) => {
        mediaRenderQuietDelay = delay;
        return "media-render-quiet-timer";
    };
    global.clearTimeout = () => {};
    const mediaRenderQuietPlugin = new Plugin();
    mediaRenderQuietPlugin.isStarted = true;
    mediaRenderQuietPlugin.mediaViewerQuietUntil = Date.now() + 500;
    let mediaRenderQuietRan = false;
    mediaRenderQuietPlugin.autoTranslationRenderQueue.push({
        key: "media-render-quiet",
        target: { content: { dataset: {} } },
        run: () => { mediaRenderQuietRan = true; }
    });
    mediaRenderQuietPlugin.processAutoTranslationRenderQueue();
    assert.equal(mediaRenderQuietRan, false);
    assert.equal(mediaRenderQuietPlugin.autoTranslationRenderTimer, "media-render-quiet-timer");
    assert.ok(mediaRenderQuietDelay >= 500);
    mediaRenderQuietPlugin.autoTranslationRenderTimer = null;
    global.setTimeout = savedSetTimeoutForMediaRender;
    global.clearTimeout = savedClearTimeoutForMediaRender;
    global.document = savedDocumentForMediaScroll;
    global.window = savedWindowForMediaScroll;
    shared.terminalFailurePlugin = terminalFailurePlugin;
}

module.exports = { title: "Template invalidation, cooldowns & failure handling", run };
