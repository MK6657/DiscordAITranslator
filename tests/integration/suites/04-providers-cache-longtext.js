"use strict";

// Artifact regression suite: Providers, cache codec & long-text handling
function run(harness, shared) {
    const { assert, Plugin, expectThrowsMessage } = harness;
    const { plugin, promptLeakOutput } = shared;

    const googlePlugin = new Plugin();
    googlePlugin.settings.translation.provider = "googleCloud";
    googlePlugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    googlePlugin.settings.translation.model = "";
    googlePlugin.settings.translation.sourceLanguage = "auto";
    googlePlugin.settings.translation.targetLanguage = "姹夎";
    googlePlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|450000\nbackup|AIza-backup|450000";
    googlePlugin.settings.googleTranslate.keys = googlePlugin.normalizeGoogleTranslateKeyPool(googlePlugin.settings.googleTranslate).keys;
    assert.equal(googlePlugin.hasUsableApiConfig("translation"), true);
    const googleRequest = googlePlugin.buildModelRequest("translation", "bonjour");
    assert.equal(googleRequest.endpoint, "https://translation.googleapis.com/language/translate/v2");
    assert.equal(googleRequest.request.headers["X-Goog-Api-Key"], "AIza-main");
    assert.equal(googleRequest.request.provider, "googleCloud");
    assert.equal(googleRequest.request.responseParser, "googleTranslate");
    assert.equal(googleRequest.request.headers.Authorization, undefined);
    assert.deepEqual(googleRequest.request.body, { q: "bonjour", target: "zh-CN", format: "text" });
    assert.equal(googleRequest.request.googleTranslate.charCount, 7);
    googlePlugin.settings.translation.targetLanguage = "Traditional Chinese";
    const googleTraditionalRequest = googlePlugin.buildModelRequest("translation", "bonjour");
    assert.deepEqual(googleTraditionalRequest.request.body, { q: "bonjour", target: "zh-TW", format: "text" });
    googlePlugin.settings.translation.targetLanguage = "姹夎";
    googlePlugin.settings.translation.sourceLanguage = "娉曡";
    const googleSourceRequest = googlePlugin.buildModelRequest("translation", "bonjour");
    assert.equal(googleSourceRequest.request.body.source, "fr");
    assert.equal(googlePlugin.getAutoTranslationRequestBatchSize(), 20);
    const googleProtectedRequest = googlePlugin.buildModelRequest("translation", "Fix `bug()` <@123456789012345678> https://example.invalid/a :ok_hand:");
    const googleProtectedQ = googleProtectedRequest.request.body.q;
    assert.match(googleProtectedQ, /__DAIT_KEEP_000__/);
    assert.doesNotMatch(googleProtectedQ, /<@123456789012345678>|https:\/\/example\.invalid|`bug\(\)`|:ok_hand:/);
    assert.equal(
        googlePlugin.parseGoogleTranslateResponse(
            JSON.stringify({ data: { translations: [{ translatedText: "修复 __DAIT_KEEP_000__ __DAIT_KEEP_001__ __DAIT_KEEP_002__ __DAIT_KEEP_003__" }] } }),
            1,
            { restoreMaps: googleProtectedRequest.request.googleTranslate.restoreMaps }
        ),
        "修复 `bug()` <@123456789012345678> https://example.invalid/a :ok_hand:"
    );
    const googleProtectedBatch = googlePlugin.buildGoogleTranslateRequest([
        "Open https://first.invalid",
        "Ping <#123456789012345678> and `x`"
    ], googlePlugin.settings.translation);
    assert.equal(Array.isArray(googleProtectedBatch.request.body.q), true);
    assert.doesNotMatch(googleProtectedBatch.request.body.q.join("\n"), /https:\/\/first\.invalid|<#123456789012345678>|`x`/);
    assert.deepEqual(
        googlePlugin.parseGoogleTranslateResponse(
            JSON.stringify({ data: { translations: [{ translatedText: "打开 __DAIT_KEEP_000__" }, { translatedText: "查看 __DAIT_KEEP_000__ 和 __DAIT_KEEP_001__" }] } }),
            2,
            { asArray: true, restoreMaps: googleProtectedBatch.request.googleTranslate.restoreMaps }
        ),
        ["打开 https://first.invalid", "查看 <#123456789012345678> 和 `x`"]
    );
    const googleCacheSnapshotPlugin = new Plugin();
    googleCacheSnapshotPlugin.settings.translation.provider = "googleCloud";
    googleCacheSnapshotPlugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    googleCacheSnapshotPlugin.settings.translation.model = "deepseek-v4-flash";
    googleCacheSnapshotPlugin.settings.translation.temperature = 1.7;
    googleCacheSnapshotPlugin.settings.translation.maxTokens = 9999;
    googleCacheSnapshotPlugin.settings.translation.prompt = "stale hidden prompt";
    googleCacheSnapshotPlugin.settings.translation.targetLanguage = "English";
    const googleCacheKeyA = googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    googleCacheSnapshotPlugin.settings.translation.endpoint = "https://api.openai.com/v1/chat/completions";
    googleCacheSnapshotPlugin.settings.translation.model = "gpt-hidden";
    googleCacheSnapshotPlugin.settings.translation.temperature = 0.1;
    googleCacheSnapshotPlugin.settings.translation.maxTokens = 1;
    googleCacheSnapshotPlugin.settings.translation.prompt = "another stale prompt";
    const googleCacheKeyB = googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    assert.equal(googleCacheKeyA, googleCacheKeyB);
    assert.equal(googleCacheKeyA.includes("deepseek"), false);
    assert.equal(googleCacheKeyA.includes("stale hidden prompt"), false);
    googleCacheSnapshotPlugin.settings.translation.targetLanguage = "zh-TW";
    const googleCacheKeyC = googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    assert.notEqual(googleCacheKeyA, googleCacheKeyC);
    assert.equal(
        googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual", promptPolicyVersion: "ignored-google-policy" }),
        googleCacheKeyC
    );
    googlePlugin.settings.googleTranslate.keys[0].usedChars = 449998;
    const googleSwitchRequest = googlePlugin.buildGoogleTranslateRequest("bonjour", googlePlugin.settings.translation);
    assert.equal(googleSwitchRequest.request.headers["X-Goog-Api-Key"], "AIza-backup");
    googlePlugin.settings.googleTranslate.keys[1].usedChars = 449998;
    expectThrowsMessage(() => googlePlugin.buildGoogleTranslateRequest("bonjour", googlePlugin.settings.translation), "Google");

    const microsoftPlugin = new Plugin();
    microsoftPlugin.settings.translation.provider = "microsoft";
    microsoftPlugin.settings.translation.apiKey = "ms-key";
    microsoftPlugin.settings.translation.endpoint = "https://api.cognitive.microsofttranslator.com/translate";
    microsoftPlugin.settings.translation.region = "eastasia";
    microsoftPlugin.settings.translation.sourceLanguage = "auto";
    microsoftPlugin.settings.translation.targetLanguage = "Traditional Chinese";
    assert.equal(microsoftPlugin.hasUsableApiConfig("translation"), true);
    const microsoftRequest = microsoftPlugin.buildModelRequest("translation", "bonjour");
    assert.match(microsoftRequest.endpoint, /^https:\/\/api\.cognitive\.microsofttranslator\.com\/translate\?api-version=3\.0&to=zh-Hant$/);
    assert.equal(microsoftRequest.request.provider, "microsoft");
    assert.equal(microsoftRequest.request.responseParser, "microsoftTranslate");
    assert.equal(microsoftRequest.request.headers["Ocp-Apim-Subscription-Key"], "ms-key");
    assert.equal(microsoftRequest.request.headers["Ocp-Apim-Subscription-Region"], "eastasia");
    assert.deepEqual(microsoftRequest.request.body, [{ Text: "bonjour" }]);
    assert.equal(
        microsoftPlugin.parseMicrosoftTranslateResponse(JSON.stringify([{ translations: [{ text: "浣犲ソ" }] }])),
        "浣犲ソ"
    );
    assert.deepEqual(
        microsoftPlugin.parseMicrosoftTranslateResponse(JSON.stringify([{ translations: [{ text: "one" }] }, { translations: [{ text: "two" }] }]), 2, { asArray: true }),
        ["one", "two"]
    );
    const microsoftAuthError = Object.assign(new Error("unauthorized"), { status: 401 });
    microsoftPlugin.annotateTranslateProviderApiError(microsoftAuthError, "401 unauthorized", microsoftRequest.request);
    assert.equal(microsoftPlugin.getAutoTranslationFailureType(microsoftAuthError), "auth");
    const microsoftRateError = Object.assign(new Error("too many"), { status: 429 });
    microsoftPlugin.annotateTranslateProviderApiError(microsoftRateError, "too many requests", microsoftRequest.request);
    assert.equal(microsoftPlugin.getAutoTranslationFailureType(microsoftRateError), "rate-limit");
    const microsoftServerError = Object.assign(new Error("server"), { status: 503 });
    microsoftPlugin.annotateTranslateProviderApiError(microsoftServerError, "server", microsoftRequest.request);
    assert.equal(microsoftPlugin.getAutoTranslationFailureType(microsoftServerError), "server");
    const microsoftRegionKey = microsoftPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    microsoftPlugin.settings.translation.region = "westus";
    assert.notEqual(microsoftPlugin.getTranslationCacheKey("bonjour", { mode: "manual" }), microsoftRegionKey);

    const deeplPlugin = new Plugin();
    deeplPlugin.settings.translation.provider = "deepl";
    deeplPlugin.settings.translation.apiKey = "deepl-key";
    deeplPlugin.settings.translation.sourceLanguage = "auto";
    deeplPlugin.settings.translation.targetLanguage = "Chinese";
    deeplPlugin.settings.translation.deeplPlan = "free";
    assert.equal(deeplPlugin.hasUsableApiConfig("translation"), true);
    const deeplFreeRequest = deeplPlugin.buildModelRequest("translation", ["hello", "world"]);
    assert.equal(deeplFreeRequest.endpoint, "https://api-free.deepl.com/v2/translate");
    assert.equal(deeplFreeRequest.request.provider, "deepl");
    assert.equal(deeplFreeRequest.request.headers.Authorization, "DeepL-Auth-Key deepl-key");
    // As a target DeepL needs the explicit variant; plain "ZH" is only valid as source_lang.
    assert.deepEqual(deeplFreeRequest.request.body, { text: ["hello", "world"], target_lang: "ZH-HANS" });
    deeplPlugin.settings.translation.deeplPlan = "pro";
    const deeplProRequest = deeplPlugin.buildModelRequest("translation", "hello");
    assert.equal(deeplProRequest.endpoint, "https://api.deepl.com/v2/translate");
    assert.equal(
        deeplPlugin.parseDeepLTranslateResponse(JSON.stringify({ translations: [{ text: "浣犲ソ" }] })),
        "浣犲ソ"
    );
    assert.deepEqual(
        deeplPlugin.parseDeepLTranslateResponse(JSON.stringify({ translations: [{ text: "one" }, { text: "two" }] }), 2, { asArray: true }),
        ["one", "two"]
    );
    assert.throws(
        () => deeplPlugin.parseDeepLTranslateResponse("{"),
        error => error.providerParseFailed === true && deeplPlugin.getAutoTranslationFailureType(error) === "parse"
    );
    const deeplAuthError = Object.assign(new Error("forbidden"), { status: 403 });
    deeplPlugin.annotateTranslateProviderApiError(deeplAuthError, "403 forbidden", deeplProRequest.request);
    assert.equal(deeplPlugin.getAutoTranslationFailureType(deeplAuthError), "auth");
    const deeplLimitError = Object.assign(new Error("quota"), { status: 456 });
    deeplPlugin.annotateTranslateProviderApiError(deeplLimitError, "456 character limit exceeded", deeplProRequest.request);
    assert.equal(deeplPlugin.getAutoTranslationFailureType(deeplLimitError), "quota");
    const deeplPlanKey = deeplPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    deeplPlugin.settings.translation.deeplPlan = "free";
    assert.notEqual(deeplPlugin.getTranslationCacheKey("bonjour", { mode: "manual" }), deeplPlanKey);

    const baiduPlugin = new Plugin();
    baiduPlugin.settings.translation.provider = "baidu";
    baiduPlugin.settings.translation.endpoint = "https://fanyi-api.baidu.com/api/trans/vip/translate";
    baiduPlugin.settings.translation.appId = "baidu-app";
    baiduPlugin.settings.translation.secretKey = "baidu-secret";
    baiduPlugin.settings.translation.sourceLanguage = "auto";
    baiduPlugin.settings.translation.targetLanguage = "Chinese";
    assert.equal(baiduPlugin.hasUsableApiConfig("translation"), true);
    assert.equal(baiduPlugin.createMd5Hash("abc"), "900150983cd24fb0d6963f7d28e17f72");
    const savedDateNowForBaidu = Date.now;
    Date.now = () => 12345;
    const baiduRequest = baiduPlugin.buildModelRequest("translation", "bonjour");
    Date.now = savedDateNowForBaidu;
    assert.equal(baiduRequest.endpoint, "https://fanyi-api.baidu.com/api/trans/vip/translate");
    assert.equal(baiduRequest.request.provider, "baidu");
    assert.equal(baiduRequest.request.bodyEncoding, "form");
    assert.equal(baiduRequest.request.body.appid, "baidu-app");
    assert.equal(baiduRequest.request.body.from, "auto");
    assert.equal(baiduRequest.request.body.to, "zh");
    assert.equal(baiduRequest.request.body.sign, baiduPlugin.createMd5Hash("baidu-appbonjour12345baidu-secret"));
    assert.equal(
        baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ trans_result: [{ src: "bonjour", dst: "浣犲ソ" }] })),
        "浣犲ソ"
    );
    assert.throws(
        () => baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "54003", error_msg: "too many requests" })),
        error => error.providerRateLimited === true && baiduPlugin.getAutoTranslationFailureType(error) === "rate-limit"
    );
    assert.throws(
        () => baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "54004", error_msg: "quota" })),
        error => error.providerQuotaExceeded === true && baiduPlugin.getAutoTranslationFailureType(error) === "quota"
    );
    assert.throws(
        () => baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "52003", error_msg: "auth" })),
        error => error.providerAuthFailed === true && baiduPlugin.getAutoTranslationFailureType(error) === "auth"
    );
    const baiduAppKey = baiduPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    baiduPlugin.settings.translation.appId = "baidu-app-2";
    assert.notEqual(baiduPlugin.getTranslationCacheKey("bonjour", { mode: "manual" }), baiduAppKey);

    const googleReservationPlugin = new Plugin();
    googleReservationPlugin.settings.translation.provider = "googleCloud";
    googleReservationPlugin.settings.translation.targetLanguage = "English";
    googleReservationPlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|5\nbackup|AIza-backup|100";
    googleReservationPlugin.settings.googleTranslate.keys = googleReservationPlugin.normalizeGoogleTranslateKeyPool(googleReservationPlugin.settings.googleTranslate).keys;
    googleReservationPlugin.settings.googleTranslate.keys[0].usedChars = 3;
    const googleReservedMain = googleReservationPlugin.buildGoogleTranslateRequest("ab", googleReservationPlugin.settings.translation, { reserve: true });
    assert.equal(googleReservedMain.request.headers["X-Goog-Api-Key"], "AIza-main");
    assert.equal(googleReservationPlugin.getGoogleTranslateReservedChars(googleReservedMain.request.googleTranslate.keyId), 2);
    const googleReservedBackup = googleReservationPlugin.buildGoogleTranslateRequest("c", googleReservationPlugin.settings.translation, { reserve: true });
    assert.equal(googleReservedBackup.request.headers["X-Goog-Api-Key"], "AIza-backup");
    googleReservationPlugin.releaseGoogleTranslateRequestReservation(googleReservedMain.request);
    googleReservationPlugin.releaseGoogleTranslateRequestReservation(googleReservedBackup.request);
    assert.equal([...googleReservationPlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleUsagePlugin = new Plugin();
    googleUsagePlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|450000\nmain-dupe|AIza-main|450000\nbackup|AIza-backup|100000";
    const normalizedGooglePool = googleUsagePlugin.normalizeGoogleTranslateKeyPool(googleUsagePlugin.settings.googleTranslate);
    assert.equal(normalizedGooglePool.keys.length, 2);
    assert.equal(normalizedGooglePool.keys[0].label, "main");
    assert.equal(normalizedGooglePool.keys[1].monthlyLimit, 100000);
    googleUsagePlugin.settings.googleTranslate.keys = normalizedGooglePool.keys;
    googleUsagePlugin.markGoogleTranslateKeyUsage("AIza-main", 3);
    assert.equal(googleUsagePlugin.settings.googleTranslate.keys[0].usedChars, 3);
    clearTimeout(googleUsagePlugin.scanTimer);
    googleUsagePlugin.scanTimer = null;

    const sakuraBatchPlugin = new Plugin();
    sakuraBatchPlugin.settings.translation.provider = "sakuraLocal";
    sakuraBatchPlugin.settings.translation.apiKey = "";
    const sakuraBatchOptions = sakuraBatchPlugin.getAutoTranslationOptions();
    sakuraBatchPlugin.isElementVisibleInViewport = () => true;
    sakuraBatchPlugin.getReadyAutoTranslationTargets = item => [item];
    sakuraBatchPlugin.getAutoTranslationPrimaryTarget = target => target;
    sakuraBatchPlugin.autoTranslationQueue = Array.from({ length: 5 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: `local-${index}`,
        cacheKey: `local-${index}`,
        requestOptions: sakuraBatchOptions
    }));
    const sakuraBatch = sakuraBatchPlugin.takeAutoTranslationBatch();
    assert.equal(sakuraBatch.length, 1);
    assert.equal(sakuraBatchPlugin.autoTranslationQueue.length, 4);

    const longSingleBatchPlugin = new Plugin();
    const longSingleOptions = longSingleBatchPlugin.getAutoTranslationOptions();
    longSingleBatchPlugin.isElementVisibleInViewport = () => true;
    longSingleBatchPlugin.getReadyAutoTranslationTargets = item => [item];
    longSingleBatchPlugin.getAutoTranslationPrimaryTarget = target => target;
    const longSingleText = "bonjour ".repeat(80);
    longSingleBatchPlugin.autoTranslationQueue = [
        {
            messageNode: { isConnected: true },
            content: { isConnected: true },
            text: longSingleText,
            cacheKey: "long-single",
            requestOptions: longSingleOptions
        },
        {
            messageNode: { isConnected: true },
            content: { isConnected: true },
            text: "short nearby",
            cacheKey: "short-nearby",
            requestOptions: longSingleOptions
        }
    ];
    const longSingleBatch = longSingleBatchPlugin.takeAutoTranslationBatch();
    assert.equal(longSingleBatch.length, 1);
    assert.equal(longSingleBatch[0].cacheKey, "long-single");
    assert.equal(longSingleBatchPlugin.autoTranslationQueue.length, 1);
    assert.equal(longSingleBatchPlugin.autoTranslationQueue[0].cacheKey, "short-nearby");

    const queueTypeSortPlugin = new Plugin();
    queueTypeSortPlugin.isElementVisibleInViewport = element => element?.visible === true;
    const queueTypeSortOptions = queueTypeSortPlugin.getAutoTranslationOptions();
    const queueTypeVisibleShort = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: "visible short" },
        text: "visible short",
        cacheKey: "queue-visible-short",
        requestOptions: queueTypeSortOptions,
        priority: 10
    };
    const queueTypeVisibleLong = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: longSingleText },
        text: longSingleText,
        cacheKey: "queue-visible-long",
        requestOptions: queueTypeSortOptions,
        priority: 1
    };
    const queueTypePrefetch = {
        messageNode: { isConnected: true, visible: false },
        content: { dataset: {}, isConnected: true, visible: false, text: "prefetch text" },
        text: "prefetch text",
        cacheKey: "queue-prefetch",
        requestOptions: queueTypeSortOptions,
        priority: 100001
    };
    queueTypeSortPlugin.autoTranslationQueue = [queueTypePrefetch, queueTypeVisibleLong, queueTypeVisibleShort];
    queueTypeSortPlugin.sortAutoTranslationQueue();
    assert.deepEqual(queueTypeSortPlugin.autoTranslationQueue.map(item => item.cacheKey), [
        "queue-visible-short",
        "queue-visible-long",
        "queue-prefetch"
    ]);
    assert.equal(queueTypeSortPlugin.getAutoTranslationDiagnosticQueueType(queueTypeVisibleShort), "visible");
    assert.equal(queueTypeSortPlugin.getAutoTranslationDiagnosticQueueType(queueTypeVisibleLong), "longText");
    assert.equal(queueTypeSortPlugin.getAutoTranslationDiagnosticQueueType(queueTypePrefetch), "prefetch");
    const queueTypeDiagnosticMeta = queueTypeSortPlugin.getAutoTranslationDiagnosticMeta(
        queueTypeVisibleShort,
        "queuedVisible",
        "enqueued"
    );
    assert.equal(queueTypeDiagnosticMeta.queueType, "visible");
    assert.equal(Number.isFinite(queueTypeDiagnosticMeta.queuePriority), true);

    const longVisibleYieldPlugin = new Plugin();
    longVisibleYieldPlugin.settings.ui.autoTranslateMessages = true;
    longVisibleYieldPlugin.settings.ui.autoTranslateConcurrency = 1;
    longVisibleYieldPlugin.getViewportPriority = element => element?.priority ?? 9999;
    longVisibleYieldPlugin.isElementVisibleInViewport = element => element?.visible === true;
    longVisibleYieldPlugin.isAutoTranslationTargetInScanRange = () => true;
    longVisibleYieldPlugin.hasCurrentTranslationLine = () => false;
    longVisibleYieldPlugin.getElementText = content => content.text;
    const longVisibleYieldOptions = longVisibleYieldPlugin.getAutoTranslationOptions();
    const longVisibleYieldStarts = [];
    longVisibleYieldPlugin.autoTranslateQueuedMessage = item => {
        longVisibleYieldStarts.push(item.cacheKey);
    };
    const longVisibleYieldLong = {
        messageNode: { isConnected: true, visible: true, priority: 1 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 1, text: longSingleText },
        text: longSingleText,
        cacheKey: "long-visible-yield",
        requestOptions: longVisibleYieldOptions
    };
    const longVisibleYieldShort = {
        messageNode: { isConnected: true, visible: true, priority: 2 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 2, text: "short visible nearby" },
        text: "short visible nearby",
        cacheKey: "short-visible-nearby",
        requestOptions: longVisibleYieldOptions
    };
    longVisibleYieldPlugin.enqueueAutoTranslationItem(longVisibleYieldLong);
    longVisibleYieldPlugin.enqueueAutoTranslationItem(longVisibleYieldShort);
    longVisibleYieldPlugin.addAutoTranslationPendingTarget(longVisibleYieldLong.cacheKey, longVisibleYieldLong);
    longVisibleYieldPlugin.addAutoTranslationPendingTarget(longVisibleYieldShort.cacheKey, longVisibleYieldShort);
    longVisibleYieldPlugin.drainAutoTranslationQueue();
    assert.deepEqual(longVisibleYieldStarts, ["short-visible-nearby"]);
    assert.equal(longVisibleYieldPlugin.autoTranslationQueue[0].cacheKey, "long-visible-yield");

    const longVisibleBetterShortPlugin = new Plugin();
    longVisibleBetterShortPlugin.settings.ui.autoTranslateMessages = true;
    longVisibleBetterShortPlugin.settings.ui.autoTranslateConcurrency = 1;
    longVisibleBetterShortPlugin.getViewportPriority = element => element?.priority ?? 9999;
    longVisibleBetterShortPlugin.isElementVisibleInViewport = element => element?.visible === true;
    longVisibleBetterShortPlugin.isAutoTranslationTargetInScanRange = () => true;
    longVisibleBetterShortPlugin.hasCurrentTranslationLine = () => false;
    longVisibleBetterShortPlugin.getElementText = content => content.text;
    const longVisibleBetterShortOptions = longVisibleBetterShortPlugin.getAutoTranslationOptions();
    const longVisibleBetterShortStarts = [];
    longVisibleBetterShortPlugin.autoTranslateQueuedMessage = item => {
        longVisibleBetterShortStarts.push(item.cacheKey);
    };
    const longVisibleBetterLong = {
        messageNode: { isConnected: true, visible: true, priority: 1 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 1, text: longSingleText },
        text: longSingleText,
        cacheKey: "long-visible-better",
        requestOptions: longVisibleBetterShortOptions
    };
    const longVisibleBetterShort = {
        messageNode: { isConnected: true, visible: true, priority: 0 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 0, text: "higher priority short visible" },
        text: "higher priority short visible",
        cacheKey: "short-visible-better",
        requestOptions: longVisibleBetterShortOptions
    };
    longVisibleBetterShortPlugin.enqueueAutoTranslationItem(longVisibleBetterLong);
    longVisibleBetterShortPlugin.enqueueAutoTranslationItem(longVisibleBetterShort);
    longVisibleBetterShortPlugin.addAutoTranslationPendingTarget(longVisibleBetterLong.cacheKey, longVisibleBetterLong);
    longVisibleBetterShortPlugin.addAutoTranslationPendingTarget(longVisibleBetterShort.cacheKey, longVisibleBetterShort);
    longVisibleBetterShortPlugin.drainAutoTranslationQueue();
    assert.deepEqual(longVisibleBetterShortStarts, ["short-visible-better"]);
    assert.equal(longVisibleBetterShortPlugin.autoTranslationQueue[0].cacheKey, "long-visible-better");

    const longVisibleActiveLongPlugin = new Plugin();
    longVisibleActiveLongPlugin.settings.ui.autoTranslateMessages = true;
    longVisibleActiveLongPlugin.settings.ui.autoTranslateConcurrency = 2;
    longVisibleActiveLongPlugin.getViewportPriority = element => element?.priority ?? 9999;
    longVisibleActiveLongPlugin.isElementVisibleInViewport = element => element?.visible === true;
    longVisibleActiveLongPlugin.isAutoTranslationTargetInScanRange = () => true;
    longVisibleActiveLongPlugin.hasCurrentTranslationLine = () => false;
    longVisibleActiveLongPlugin.getElementText = content => content.text;
    const longVisibleActiveLongOptions = longVisibleActiveLongPlugin.getAutoTranslationOptions();
    const longVisibleActiveLongStarts = [];
    longVisibleActiveLongPlugin.autoTranslateQueuedMessage = item => {
        longVisibleActiveLongStarts.push(item.cacheKey);
    };
    longVisibleActiveLongPlugin.autoTranslationInFlight = 1;
    longVisibleActiveLongPlugin.autoTranslationInFlightItems = 1;
    longVisibleActiveLongPlugin.autoTranslationInFlightKeys.add("already-running-long");
    longVisibleActiveLongPlugin.autoTranslationVisibleLongInFlightKeys.add("already-running-long");
    longVisibleActiveLongPlugin.autoTranslationInFlightStartedAt.set("already-running-long", Date.now());
    const longVisibleActiveLong = {
        messageNode: { isConnected: true, visible: true, priority: 1 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 1, text: longSingleText },
        text: longSingleText,
        cacheKey: "long-visible-active-long",
        requestOptions: longVisibleActiveLongOptions
    };
    const longVisibleActiveShort = {
        messageNode: { isConnected: true, visible: true, priority: 2 },
        content: { dataset: {}, isConnected: true, visible: true, priority: 2, text: "short runs while long is active" },
        text: "short runs while long is active",
        cacheKey: "short-with-active-long",
        requestOptions: longVisibleActiveLongOptions
    };
    longVisibleActiveLongPlugin.enqueueAutoTranslationItem(longVisibleActiveLong);
    longVisibleActiveLongPlugin.enqueueAutoTranslationItem(longVisibleActiveShort);
    longVisibleActiveLongPlugin.addAutoTranslationPendingTarget(longVisibleActiveLong.cacheKey, longVisibleActiveLong);
    longVisibleActiveLongPlugin.addAutoTranslationPendingTarget(longVisibleActiveShort.cacheKey, longVisibleActiveShort);
    longVisibleActiveLongPlugin.drainAutoTranslationQueue();
    assert.deepEqual(longVisibleActiveLongStarts, ["short-with-active-long"]);
    assert.equal(longVisibleActiveLongPlugin.autoTranslationQueue[0].cacheKey, "long-visible-active-long");

    plugin.settings.translation.targetLanguage = "汉语";
    plugin.settings.translation.enableThinking = true;
    const autoTranslationRequest = plugin.buildModelRequest("translation", "bonjour", {
        configOverrides: plugin.getAutoTranslationOverrides()
    });
    assert.equal(autoTranslationRequest.request.body.temperature, 0);
    assert.deepEqual(autoTranslationRequest.request.body.thinking, { type: "disabled" });
    assert.match(autoTranslationRequest.request.body.messages[0].content, /Simplified Chinese \(中文, zh-CN\)/);
    const autoRetryOptions = plugin.getAutoTranslationRetryOptions("source text", "???????");
    assert.equal(autoRetryOptions.configOverrides.temperature, 0);
    assert.equal(autoRetryOptions.configOverrides.enableThinking, false);
    assert.match(autoRetryOptions.configOverrides.prompt, /Strict automatic channel translation retry/);
    assert.match(autoRetryOptions.configOverrides.prompt, /previous_invalid_output/);
    assert.match(autoRetryOptions.configOverrides.prompt, /\?\?\?\?\?\?\?/);
    const promptLeakRetryOptions = plugin.getAutoTranslationRetryOptions("\u042d\u043c", promptLeakOutput);
    assert.match(promptLeakRetryOptions.configOverrides.prompt, /Rejected prompt\/instruction leakage output/);
    assert.equal(promptLeakRetryOptions.configOverrides.prompt.includes("\u5b9e\u65f6\u5b57\u5e55\u5c42"), false);
    const autoBatchOptions = plugin.getAutoTranslationBatchOptions(2);
    assert.equal(autoBatchOptions.routeKey, plugin.getCurrentRouteKey());
    assert.equal(autoBatchOptions.configOverrides.temperature, 0);
    assert.equal(autoBatchOptions.configOverrides.enableThinking, false);
    assert.match(autoBatchOptions.configOverrides.prompt, /Batch automatic channel translation mode/);
    assert.match(autoBatchOptions.configOverrides.prompt, /exactly 2 JSON objects/);
    const autoBatchRetryOptions = plugin.getAutoTranslationBatchRetryOptions(2);
    assert.equal(autoBatchRetryOptions.routeKey, plugin.getCurrentRouteKey());
    assert.equal(autoBatchRetryOptions.configOverrides.temperature, 0);
    assert.equal(autoBatchRetryOptions.configOverrides.enableThinking, false);
    assert.match(autoBatchRetryOptions.configOverrides.prompt, /Strict batch automatic channel translation retry/);
    assert.match(autoBatchRetryOptions.configOverrides.prompt, /exactly 2 JSON objects/);
    const routeOptionsPlugin = new Plugin();
    routeOptionsPlugin.getCurrentRouteKey = () => "guild-a:channel-a:jump-a";
    const routeOptions = routeOptionsPlugin.getAutoTranslationOptions();
    assert.equal(routeOptions.routeKey, "guild-a:channel-a:jump-a");
    assert.equal(routeOptionsPlugin.isAutoTranslationRequestCurrent(routeOptions), true);
    routeOptionsPlugin.getCurrentRouteKey = () => "guild-a:channel-b:";
    assert.equal(routeOptionsPlugin.isAutoTranslationRequestCurrent(routeOptions), false);
    const routeRetryOptions = routeOptionsPlugin.getAutoTranslationRetryOptions("hola", "hola", routeOptions);
    assert.equal(routeRetryOptions.routeKey, "guild-a:channel-a:jump-a");
    const routeFinalOptions = routeOptionsPlugin.getAutoTranslationFinalFallbackOptions("hola", routeOptions);
    assert.equal(routeFinalOptions.routeKey, "guild-a:channel-a:jump-a");
    const providerSnapshotPlugin = new Plugin();
    providerSnapshotPlugin.settings.translation.apiKey = "sk-old";
    providerSnapshotPlugin.settings.translation.endpoint = "https://old.example.test/v1/chat/completions";
    providerSnapshotPlugin.settings.translation.model = "old-model";
    const oldAutoOptions = providerSnapshotPlugin.getAutoTranslationOptions();
    const oldProviderKey = providerSnapshotPlugin.getAutoTranslationProviderKey(oldAutoOptions);
    providerSnapshotPlugin.settings.translation.apiKey = "sk-new";
    providerSnapshotPlugin.settings.translation.endpoint = "https://new.example.test/v1/chat/completions";
    providerSnapshotPlugin.settings.translation.model = "new-model";
    assert.equal(providerSnapshotPlugin.getAutoTranslationProviderKey(oldAutoOptions), oldProviderKey);
    assert.notEqual(providerSnapshotPlugin.getAutoTranslationProviderKey(providerSnapshotPlugin.getAutoTranslationOptions()), oldProviderKey);
    providerSnapshotPlugin.settings.translation.apiKey = "";
    providerSnapshotPlugin.settings.translation.endpoint = "";
    providerSnapshotPlugin.settings.translation.model = "";
    const oldAutoRequest = providerSnapshotPlugin.buildModelRequest("translation", "hola", {
        configOverrides: oldAutoOptions.configOverrides
    });
    assert.equal(oldAutoRequest.endpoint, "https://old.example.test/v1/chat/completions");
    assert.equal(oldAutoRequest.request.headers.Authorization, "Bearer sk-old");
    assert.equal(oldAutoRequest.request.body.model, "old-model");
    const oldBatchOptions = providerSnapshotPlugin.getAutoTranslationBatchOptions(1, oldAutoOptions);
    assert.equal(oldBatchOptions.configOverrides.apiKey, "sk-old");
    assert.equal(oldBatchOptions.configOverrides.endpoint, "https://old.example.test/v1/chat/completions");
    const oldRetryOptions = providerSnapshotPlugin.getAutoTranslationRetryOptions("hola", "hola", oldAutoOptions);
    assert.equal(oldRetryOptions.configOverrides.apiKey, "sk-old");
    assert.equal(oldRetryOptions.configOverrides.endpoint, "https://old.example.test/v1/chat/completions");
    const oldRetryRequest = providerSnapshotPlugin.buildModelRequest("translation", "hola", {
        configOverrides: oldRetryOptions.configOverrides
    });
    assert.equal(oldRetryRequest.endpoint, "https://old.example.test/v1/chat/completions");
    assert.equal(oldRetryRequest.request.headers.Authorization, "Bearer sk-old");
    assert.notEqual(
        plugin.getModelRequestKey("https://api.example.test", { headers: { Authorization: "Bearer old" }, body: { model: "m", messages: [{ content: "p" }] } }, "input"),
        plugin.getModelRequestKey("https://api.example.test", { headers: { Authorization: "Bearer new" }, body: { model: "m", messages: [{ content: "p" }] } }, "input")
    );
    assert.notEqual(
        plugin.getModelRequestKey("https://translation.googleapis.com/language/translate/v2", {
            provider: "googleCloud",
            responseParser: "googleTranslate",
            googleTranslate: { apiKey: "AIza-same-key" },
            body: { q: ["a,b", "c"], target: "en" }
        }, ["a,b", "c"]),
        plugin.getModelRequestKey("https://translation.googleapis.com/language/translate/v2", {
            provider: "googleCloud",
            responseParser: "googleTranslate",
            googleTranslate: { apiKey: "AIza-same-key" },
            body: { q: ["a", "b,c"], target: "en" }
        }, ["a", "b,c"])
    );
    assert.deepEqual(
        plugin.parseAutoTranslationBatchOutput('[{"id":"001","translation":"one"},{"id":"002","translation":"two"}]'),
        [{ id: "001", translation: "one" }, { id: "002", translation: "two" }]
    );
    assert.deepEqual(
        plugin.parseAutoTranslationBatchOutput('```json\n{"translations":[{"id":"001","translation":"one"}]}\n```'),
        [{ id: "001", translation: "one" }]
    );
    assert.deepEqual(
        plugin.parseAutoTranslationBatchOutput('{"001":"one","002":"two"}'),
        [{ id: "001", translation: "one" }, { id: "002", translation: "two" }]
    );
    assert.deepEqual(
        plugin.parseAutoTranslationBatchOutput('{"translations":{"001":{"translated":"one"},"002":{"content":"two"}}}'),
        [{ id: "001", translated: "one" }, { id: "002", content: "two" }]
    );
    assert.deepEqual(
        plugin.parseAutoTranslationBatchOutput('{"id":1,"translated":"one"}'),
        [{ id: 1, translated: "one" }]
    );
    assert.deepEqual(
        plugin.parseAutoTranslationBatchOutput('note: {"warnings":[],"translations":{"1":"one","02":"two"}} done'),
        [{ id: "001", translation: "one" }, { id: "002", translation: "two" }]
    );
    assert.throws(
        () => plugin.parseAutoTranslationBatchOutput("not json"),
        error => error.code === "AUTO_BATCH_PARSE_FAILED"
    );

    const batchFieldPlugin = new Plugin();
    assert.equal(batchFieldPlugin.normalizeBatchRowId("02"), "002");
    assert.equal(batchFieldPlugin.extractBatchRowTranslation({ message: "one" }), "one");

    const manualCacheKey = plugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    const legacyManualCacheKey = plugin.getLegacyTranslationCacheKey("bonjour", { mode: "manual" });
    assert.notEqual(manualCacheKey, legacyManualCacheKey);
    const manualCacheAliases = plugin.getTranslationCacheAliases("bonjour", { mode: "manual" });
    assert.equal(manualCacheAliases.includes(legacyManualCacheKey), true);
    assert.equal(manualCacheAliases.includes(plugin.getFullConfigTranslationCacheKey("bonjour", { mode: "manual" })), true);
    assert.equal(manualCacheAliases.includes(plugin.getPreMessageIdentityTranslationCacheKey("bonjour", { mode: "manual" })), true);
    assert.equal(manualCacheKey.includes(plugin.settings.translation.prompt), false);
    const autoCacheKey = plugin.getTranslationCacheKey("bonjour", plugin.getAutoTranslationOptions());
    assert.notEqual(manualCacheKey, autoCacheKey);
    assert.notEqual(
        plugin.getTranslationCacheKey("bonjour", { mode: "manual", promptPolicyVersion: "translation-manual-vNEXT" }),
        manualCacheKey
    );
    assert.equal(
        plugin.getTranslationCacheAliases("bonjour", { mode: "manual", promptPolicyVersion: "translation-manual-vNEXT" }).includes(manualCacheKey),
        false
    );
    assert.equal(
        plugin.buildSystemPrompt("translation", plugin.settings.translation).includes(`Prompt policy version: ${plugin.getPromptPolicyVersion("manual")}.`),
        true
    );
    const promptPolicyBatchOptions = plugin.getAutoTranslationBatchOptions(2, plugin.getAutoTranslationOptions());
    assert.equal(promptPolicyBatchOptions.promptPolicyVersion, plugin.getPromptPolicyVersion("autoBatch"));
    assert.equal(promptPolicyBatchOptions.configOverrides.promptPolicyVersion, plugin.getPromptPolicyVersion("autoBatch"));
    const promptPolicyRetryOptions = plugin.getAutoTranslationRetryOptions("source text", "bad output", plugin.getAutoTranslationOptions());
    assert.equal(promptPolicyRetryOptions.promptPolicyVersion, plugin.getPromptPolicyVersion("autoRetry"));
    assert.equal(promptPolicyRetryOptions.configOverrides.promptPolicyVersion, plugin.getPromptPolicyVersion("autoRetry"));
    plugin.settings.translation.temperature = "0.20";
    plugin.settings.translation.maxTokens = "900.2";
    plugin.settings.translation.prompt = "  Cache prompt  ";
    const normalizedCacheKey = plugin.getTranslationCacheKey("bonjour", { mode: "manual" });
    plugin.settings.translation.temperature = 0.2;
    plugin.settings.translation.maxTokens = 900;
    plugin.settings.translation.prompt = "Cache prompt";
    assert.equal(plugin.getTranslationCacheKey("bonjour", { mode: "manual" }), normalizedCacheKey);
    const preIdentityCompatPlugin = new Plugin();
    const preIdentityCompatOptions = {
        ...preIdentityCompatPlugin.getAutoTranslationOptions(),
        messageIdentity: "message:guild:channel:123456789012345678:source-hash"
    };
    const preIdentityModernKey = preIdentityCompatPlugin.getTranslationCacheKey("bonjour", preIdentityCompatOptions);
    const preIdentityLegacyKey = preIdentityCompatPlugin.getPreMessageIdentityTranslationCacheKey("bonjour", preIdentityCompatOptions);
    assert.notEqual(preIdentityModernKey, preIdentityLegacyKey);
    assert.equal(preIdentityCompatPlugin.getTranslationCacheAliases("bonjour", preIdentityCompatOptions).includes(preIdentityLegacyKey), true);
    assert.equal(preIdentityCompatPlugin.getTranslationLineCacheAliases("bonjour", preIdentityCompatOptions).includes(preIdentityLegacyKey), false);
    preIdentityCompatPlugin.setTranslationCache(preIdentityLegacyKey, "legacy no identity translation");
    preIdentityCompatPlugin.translationCache.delete(preIdentityModernKey);
    preIdentityCompatPlugin.translationCacheMeta.delete(preIdentityModernKey);
    assert.equal(
        preIdentityCompatPlugin.getTranslationCacheValue(preIdentityModernKey, preIdentityCompatPlugin.getTranslationCacheAliases("bonjour", preIdentityCompatOptions)),
        "legacy no identity translation"
    );
    assert.equal(preIdentityCompatPlugin.translationCache.get(preIdentityModernKey), "legacy no identity translation");
    assert.equal(
        preIdentityCompatPlugin.getTranslationCacheValue(
            preIdentityCompatPlugin.getTranslationCacheKey("hola", preIdentityCompatOptions),
            preIdentityCompatPlugin.getTranslationCacheAliases("hola", preIdentityCompatOptions)
        ),
        null
    );
    clearTimeout(preIdentityCompatPlugin.translationCacheDirtyTimer);
    preIdentityCompatPlugin.translationCacheDirtyTimer = null;
    const cacheHitPersistPlugin = new Plugin();
    const savedDateNowForCacheHitPersist = Date.now;
    let cacheHitPersistNow = 1000000;
    let cacheHitPersistPayload = null;
    Date.now = () => cacheHitPersistNow;
    cacheHitPersistPlugin.saveData = (key, value) => {
        if (key === "translationCache") cacheHitPersistPayload = value;
        return true;
    };
    cacheHitPersistPlugin.setTranslationCache("cache-hit-persist-key", "cache-hit-persist-value");
    assert.equal(cacheHitPersistPlugin.flushTranslationCache({ retryOnError: false }), true);
    const cacheHitPersistBefore = cacheHitPersistPlugin.translationCacheMeta.get("cache-hit-persist-key");
    cacheHitPersistNow += 120000;
    assert.equal(cacheHitPersistPlugin.getTranslationCacheValue("cache-hit-persist-key"), "cache-hit-persist-value");
    assert.equal(cacheHitPersistPlugin.translationCacheDirty, true);
    assert.equal(cacheHitPersistPlugin.flushTranslationCache({ retryOnError: false }), true);
    const cacheHitPersistLoader = new Plugin();
    cacheHitPersistLoader.loadData = key => key === "translationCache" ? cacheHitPersistPayload : null;
    cacheHitPersistLoader.loadTranslationCache();
    const cacheHitPersistAfter = cacheHitPersistLoader.translationCacheMeta.get("cache-hit-persist-key");
    assert.equal(cacheHitPersistLoader.translationCache.get("cache-hit-persist-key"), "cache-hit-persist-value");
    assert.ok(cacheHitPersistAfter.touchedAt > cacheHitPersistBefore.touchedAt);
    assert.ok(cacheHitPersistAfter.expiresAt >= cacheHitPersistNow + 6 * 60 * 60 * 1000);
    clearTimeout(cacheHitPersistPlugin.translationCacheDirtyTimer);
    cacheHitPersistPlugin.translationCacheDirtyTimer = null;
    Date.now = savedDateNowForCacheHitPersist;
    const fakeTargetA = { messageNode: {}, content: { dataset: {} }, text: "same" };
    const fakeTargetB = { messageNode: {}, content: { dataset: {} }, text: "same" };
    plugin.addAutoTranslationPendingTarget("pending-key", fakeTargetA);
    plugin.addAutoTranslationPendingTarget("pending-key", fakeTargetA);
    plugin.addAutoTranslationPendingTarget("pending-key", fakeTargetB);
    assert.equal(plugin.getAutoTranslationPendingTargets({ cacheKey: "pending-key" }).length, 2);
    assert.equal(plugin.consumeAutoTranslationTargets({ cacheKey: "pending-key" }).length, 2);
    assert.equal(plugin.autoTranslationPendingTargets.has("pending-key"), false);
    const renderedFanout = [];
    const fanoutPlugin = new Plugin();
    fanoutPlugin.setTranslationCache = () => {};
    fanoutPlugin.getElementText = content => content.text;
    fanoutPlugin.isElementVisibleInViewport = () => true;
    fanoutPlugin.renderTranslation = (messageNode, content, translated, cacheKey) => renderedFanout.push({ content, translated, cacheKey });
    fanoutPlugin.removeTranslationNode = () => {};
    const fanoutKey = "auto\n---\nkey";
    const fanoutTargetA = { messageNode: { isConnected: true }, content: { dataset: {}, isConnected: true, text: "same" }, text: "same", cacheKey: fanoutKey };
    const fanoutTargetB = { messageNode: { isConnected: true }, content: { dataset: {}, isConnected: true, text: "same" }, text: "same", cacheKey: fanoutKey };
    fanoutPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetA);
    fanoutPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetB);
    fanoutPlugin.renderAutoTranslationResult(fanoutTargetA, "\u5df2\u7ffb\u8bd1");
    assert.equal(renderedFanout.length, 2);
    assert.equal(fanoutPlugin.autoTranslationPendingTargets.has(fanoutKey), false);

    const invisibleResultPlugin = new Plugin();
    let invisibleResultRemoved = false;
    let invisibleResultRendered = false;
    invisibleResultPlugin.getElementText = content => content.text;
    invisibleResultPlugin.isElementVisibleInViewport = () => false;
    invisibleResultPlugin.renderTranslation = () => { invisibleResultRendered = true; };
    invisibleResultPlugin.removeAutoTranslationNode = () => { invisibleResultRemoved = true; };
    const invisibleResultItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same invisible" },
        text: "same invisible",
        requestOptions: invisibleResultPlugin.getAutoTranslationOptions()
    };
    invisibleResultItem.cacheKey = invisibleResultPlugin.getTranslationCacheKey(invisibleResultItem.text, invisibleResultItem.requestOptions);
    invisibleResultPlugin.addAutoTranslationPendingTarget(invisibleResultItem.cacheKey, invisibleResultItem);
    invisibleResultPlugin.renderAutoTranslationResult(invisibleResultItem, "\u5df2\u7ffb\u8bd1\u7684\u9690\u85cf\u5185\u5bb9");
    assert.equal(invisibleResultRendered, false);
    assert.equal(invisibleResultRemoved, false);
    assert.equal(invisibleResultPlugin.autoTranslationPendingTargets.has(invisibleResultItem.cacheKey), false);
    assert.equal(invisibleResultPlugin.translationCache.get(invisibleResultItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u9690\u85cf\u5185\u5bb9");
    clearTimeout(invisibleResultPlugin.translationCacheDirtyTimer);
    invisibleResultPlugin.translationCacheDirtyTimer = null;

    const longCacheRoundtripPlugin = new Plugin();
    const longCacheRoundtripRendered = [];
    longCacheRoundtripPlugin.settings.translation.enabled = true;
    longCacheRoundtripPlugin.settings.ui.autoTranslateMessages = true;
    longCacheRoundtripPlugin.settings.translation.apiKey = "sk-test";
    longCacheRoundtripPlugin.settings.translation.targetLanguage = "Chinese";
    longCacheRoundtripPlugin.isAutoTranslationTargetInScanRange = () => true;
    longCacheRoundtripPlugin.isElementVisibleInViewport = element => element?.visible === true;
    longCacheRoundtripPlugin.getMessageContentElement = message => message.content;
    longCacheRoundtripPlugin.getCachedElementText = content => content.text;
    longCacheRoundtripPlugin.getElementText = content => content.text;
    longCacheRoundtripPlugin.getMessageIdentity = message => `message:long-cache:${message.id}`;
    longCacheRoundtripPlugin.shouldAutoTranslateText = text => String(text || "").trim() === longSingleText.trim();
    longCacheRoundtripPlugin.hasCurrentTranslationLine = () => false;
    let longCacheRoundtripDrainCount = 0;
    longCacheRoundtripPlugin.drainAutoTranslationQueue = () => {
        longCacheRoundtripDrainCount++;
        assert.equal(longCacheRoundtripPlugin.autoTranslationQueue.length, 0);
    };
    longCacheRoundtripPlugin.autoTranslateQueuedMessage = () => { throw new Error("long cache roundtrip should not start API work"); };
    longCacheRoundtripPlugin.autoTranslateQueuedBatch = () => { throw new Error("long cache roundtrip should not start API work"); };
    longCacheRoundtripPlugin.renderTranslation = (_messageNode, _content, translated) => longCacheRoundtripRendered.push(translated);
    const longCacheRoundtripMessage = {
        id: "cached-long",
        isConnected: true,
        visible: false,
        content: { dataset: {}, isConnected: true, visible: false, text: longSingleText }
    };
    const longCacheRoundtripOptions = longCacheRoundtripPlugin.withMessageIdentity(
        longCacheRoundtripPlugin.getAutoTranslationRequestOptionsForText(longSingleText, longCacheRoundtripPlugin.getAutoTranslationOptions()),
        longCacheRoundtripMessage,
        longCacheRoundtripMessage.content,
        longSingleText
    );
    const longCacheRoundtripItem = {
        messageNode: longCacheRoundtripMessage,
        content: longCacheRoundtripMessage.content,
        text: longSingleText,
        cacheKey: longCacheRoundtripPlugin.getTranslationCacheKey(longSingleText, longCacheRoundtripOptions),
        requestOptions: longCacheRoundtripOptions
    };
    longCacheRoundtripPlugin.addAutoTranslationPendingTarget(longCacheRoundtripItem.cacheKey, longCacheRoundtripItem);
    const longCacheRoundtripTranslation = "\u4f60\u597d\uff0c\u8fd9\u662f\u7f13\u5b58\u4e2d\u7684\u957f\u6587\u672c\u8bd1\u6587\u3002".repeat(80).trim();
    longCacheRoundtripPlugin.renderAutoTranslationResult(longCacheRoundtripItem, longCacheRoundtripTranslation);
    assert.equal(longCacheRoundtripRendered.length, 0);
    assert.equal(longCacheRoundtripPlugin.translationCache.get(longCacheRoundtripItem.cacheKey), longCacheRoundtripTranslation);
    longCacheRoundtripMessage.visible = true;
    longCacheRoundtripMessage.content.visible = true;
    longCacheRoundtripPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [longCacheRoundtripMessage],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.deepEqual(longCacheRoundtripRendered, [longCacheRoundtripTranslation]);
    assert.ok(longCacheRoundtripDrainCount > 0);
    clearTimeout(longCacheRoundtripPlugin.translationCacheDirtyTimer);
    longCacheRoundtripPlugin.translationCacheDirtyTimer = null;

    const longPolicyPlugin = new Plugin();
    const longPolicyBaseOptions = longPolicyPlugin.getAutoTranslationOptions();
    const longPolicyOptions = longPolicyPlugin.getAutoTranslationRequestOptionsForText(longSingleText, longPolicyBaseOptions);
    assert.equal(longPolicyOptions.mode, "long-text");
    assert.equal(longPolicyOptions.promptPolicyVersion, longPolicyPlugin.getPromptPolicyVersion("longText"));
    assert.equal(longPolicyOptions.configOverrides.promptPolicyVersion, longPolicyPlugin.getPromptPolicyVersion("longText"));
    assert.equal(longPolicyOptions.configOverrides.maxTokens >= 1800, true);
    assert.notEqual(
        longPolicyPlugin.getTranslationCacheKey(longSingleText, longPolicyBaseOptions),
        longPolicyPlugin.getTranslationCacheKey(longSingleText, longPolicyOptions)
    );
    assert.equal(
        longPolicyPlugin.getFullConfigTranslationCacheKey(longSingleText, longPolicyOptions).includes(longPolicyPlugin.getPromptPolicyVersion("longText")),
        true
    );
    assert.equal(longPolicyPlugin.isAutoTranslationCacheMode("long-text"), true);
    assert.equal(longPolicyPlugin.isAutoTranslationCacheMode("manual"), false);

    const disconnectedResultPlugin = new Plugin();
    let disconnectedResultRendered = false;
    disconnectedResultPlugin.getElementText = content => content.text;
    disconnectedResultPlugin.renderTranslation = () => { disconnectedResultRendered = true; };
    const disconnectedResultItem = {
        messageNode: { isConnected: false },
        content: { dataset: {}, isConnected: false, text: "disconnected text" },
        text: "disconnected text",
        requestOptions: disconnectedResultPlugin.getAutoTranslationOptions()
    };
    disconnectedResultItem.cacheKey = disconnectedResultPlugin.getTranslationCacheKey(disconnectedResultItem.text, disconnectedResultItem.requestOptions);
    disconnectedResultPlugin.addAutoTranslationPendingTarget(disconnectedResultItem.cacheKey, disconnectedResultItem);
    disconnectedResultPlugin.renderAutoTranslationResult(disconnectedResultItem, "\u5df2\u7ffb\u8bd1\u7684\u65ad\u5f00\u5185\u5bb9");
    assert.equal(disconnectedResultRendered, false);
    assert.equal(disconnectedResultPlugin.translationCache.get(disconnectedResultItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u65ad\u5f00\u5185\u5bb9");
    assert.equal(disconnectedResultPlugin.getAutoTextTranslationCacheValue(disconnectedResultItem.text, disconnectedResultItem.requestOptions), "\u5df2\u7ffb\u8bd1\u7684\u65ad\u5f00\u5185\u5bb9");
    assert.equal(disconnectedResultPlugin.autoTranslationPendingTargets.has(disconnectedResultItem.cacheKey), false);
    clearTimeout(disconnectedResultPlugin.translationCacheDirtyTimer);
    disconnectedResultPlugin.translationCacheDirtyTimer = null;

    const changedResultPlugin = new Plugin();
    let changedResultRemoved = false;
    changedResultPlugin.setTranslationCache = () => {};
    changedResultPlugin.getElementText = () => "changed source";
    changedResultPlugin.isElementVisibleInViewport = () => false;
    changedResultPlugin.renderTranslation = () => { throw new Error("changed source should not render"); };
    changedResultPlugin.removeAutoTranslationNode = () => { changedResultRemoved = true; };
    const changedResultItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "changed source" },
        text: "old source",
        cacheKey: "changed-result-cache",
        requestOptions: changedResultPlugin.getAutoTranslationOptions()
    };
    changedResultPlugin.addAutoTranslationPendingTarget(changedResultItem.cacheKey, changedResultItem);
    changedResultPlugin.renderAutoTranslationResult(changedResultItem, "\u5df2\u7ffb\u8bd1\u7684\u53d8\u66f4\u5185\u5bb9");
    assert.equal(changedResultRemoved, true);

    const staleIdentityResultPlugin = new Plugin();
    let staleIdentityRemoved = false;
    staleIdentityResultPlugin.getElementText = content => content.text;
    staleIdentityResultPlugin.isElementVisibleInViewport = () => true;
    staleIdentityResultPlugin.getMessageIdentity = () => "message:guild:channel:new:message";
    staleIdentityResultPlugin.renderTranslation = () => { throw new Error("stale identity should not render"); };
    staleIdentityResultPlugin.removeAutoTranslationNode = () => { staleIdentityRemoved = true; };
    staleIdentityResultPlugin.setTranslationCache = () => { throw new Error("stale identity should not write cache"); };
    const staleIdentityOptions = {
        ...staleIdentityResultPlugin.getAutoTranslationOptions(),
        messageIdentity: "message:guild:channel:old:message"
    };
    const staleIdentityItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same identity text" },
        text: "same identity text",
        requestOptions: staleIdentityOptions
    };
    staleIdentityItem.cacheKey = staleIdentityResultPlugin.getTranslationCacheKey(staleIdentityItem.text, staleIdentityOptions);
    staleIdentityResultPlugin.addAutoTranslationPendingTarget(staleIdentityItem.cacheKey, staleIdentityItem);
    staleIdentityResultPlugin.renderAutoTranslationResult(staleIdentityItem, "\u5df2\u7ffb\u8bd1\u7684\u8fc7\u671f\u8eab\u4efd\u5185\u5bb9");
    assert.equal(staleIdentityRemoved, true);
    assert.equal(staleIdentityResultPlugin.autoTranslationPendingTargets.has(staleIdentityItem.cacheKey), false);

    const staleIdentityFailurePlugin = new Plugin();
    let staleIdentityFailureRemoved = false;
    let staleIdentityFailureRendered = false;
    staleIdentityFailurePlugin.getElementText = content => content.text;
    staleIdentityFailurePlugin.isElementVisibleInViewport = () => true;
    staleIdentityFailurePlugin.getMessageIdentity = () => "message:guild:channel:new:message";
    staleIdentityFailurePlugin.renderTranslationError = () => { staleIdentityFailureRendered = true; };
    staleIdentityFailurePlugin.removeAutoTranslationNode = () => { staleIdentityFailureRemoved = true; };
    const staleIdentityFailureTarget = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same failure identity text" },
        text: "same failure identity text",
        requestOptions: {
            ...staleIdentityFailurePlugin.getAutoTranslationOptions(),
            messageIdentity: "message:guild:channel:old:message"
        }
    };
    staleIdentityFailurePlugin.renderAutoTranslationFailure(staleIdentityFailureTarget, "stale-failure-cache", staleIdentityFailurePlugin.createFinalInvalidAutoTranslationError());
    assert.equal(staleIdentityFailureRemoved, true);
    assert.equal(staleIdentityFailureRendered, false);

    const identityUpgradePlugin = new Plugin();
    let identityUpgradeRenderedKey = "";
    let identityUpgradeRemoved = false;
    identityUpgradePlugin.getElementText = content => content.text;
    identityUpgradePlugin.isElementVisibleInViewport = () => true;
    identityUpgradePlugin.renderTranslation = (_messageNode, _content, _translated, cacheKey) => { identityUpgradeRenderedKey = cacheKey; };
    identityUpgradePlugin.removeAutoTranslationNode = () => { identityUpgradeRemoved = true; };
    const identityUpgradeText = "identity upgrade text";
    const identityUpgradeTextHash = identityUpgradePlugin.getTextFingerprint(identityUpgradeText);
    const identityUpgradeContent = { dataset: {}, isConnected: true, text: identityUpgradeText };
    identityUpgradePlugin.ensureTranslationOwnerId(identityUpgradeContent);
    const identityUpgradeNode = {
        nodeType: 1,
        isConnected: true,
        parentElement: null,
        previousElementSibling: null,
        nextElementSibling: null,
        getAttribute: attribute => attribute === "data-list-item-id" ? "message-row-identity-upgrade" : "",
        querySelector: selector => {
            if (selector.includes("data-author-id")) return { getAttribute: attribute => attribute === "data-author-id" ? "999999999999999999" : "" };
            if (selector.includes("time")) return { getAttribute: attribute => attribute === "datetime" ? "2026-06-15T04:00:00.000Z" : "" };
            return null;
        }
    };
    const identityUpgradeFallback = identityUpgradePlugin.messageTracker.getFallbackIdentity(identityUpgradeNode, identityUpgradeContent, identityUpgradeText, {
        guildId: "111111111111111111",
        channelId: "222222222222222222"
    });
    const identityUpgradeMessage = `message:111111111111111111:222222222222222222:777777777777777777:message:${identityUpgradeTextHash}`;
    const identityUpgradeOptions = {
        ...identityUpgradePlugin.getAutoTranslationOptions(),
        messageIdentity: identityUpgradeFallback
    };
    identityUpgradePlugin.getMessageIdentity = () => identityUpgradeMessage;
    const identityUpgradeItem = {
        messageNode: identityUpgradeNode,
        content: identityUpgradeContent,
        text: identityUpgradeText,
        requestOptions: identityUpgradeOptions
    };
    identityUpgradeItem.cacheKey = identityUpgradePlugin.getTranslationCacheKey(identityUpgradeText, identityUpgradeOptions);
    const identityUpgradeCurrentOptions = { ...identityUpgradeOptions, messageIdentity: identityUpgradeMessage };
    const identityUpgradeCurrentKey = identityUpgradePlugin.getTranslationCacheKey(identityUpgradeText, identityUpgradeCurrentOptions);
    identityUpgradePlugin.addAutoTranslationPendingTarget(identityUpgradeItem.cacheKey, identityUpgradeItem);
    identityUpgradePlugin.renderAutoTranslationResult(identityUpgradeItem, "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
    assert.equal(identityUpgradeRemoved, false);
    assert.equal(identityUpgradeRenderedKey, identityUpgradeCurrentKey);
    assert.equal(identityUpgradePlugin.translationCache.get(identityUpgradeItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
    assert.equal(identityUpgradePlugin.translationCache.get(identityUpgradeCurrentKey), "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
    assert.equal(identityUpgradePlugin.getAutoTextTranslationCacheValue(identityUpgradeText, identityUpgradeCurrentOptions), "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
    clearTimeout(identityUpgradePlugin.translationCacheDirtyTimer);
    identityUpgradePlugin.translationCacheDirtyTimer = null;

    const fallbackIdentityUpgradePlugin = new Plugin();
    let fallbackIdentityUpgradeRenderedKey = "";
    let fallbackIdentityUpgradeRemoved = false;
    fallbackIdentityUpgradePlugin.getElementText = content => content.text;
    fallbackIdentityUpgradePlugin.isElementVisibleInViewport = () => true;
    fallbackIdentityUpgradePlugin.renderTranslation = (_messageNode, _content, _translated, cacheKey) => { fallbackIdentityUpgradeRenderedKey = cacheKey; };
    fallbackIdentityUpgradePlugin.removeAutoTranslationNode = () => { fallbackIdentityUpgradeRemoved = true; };
    const fallbackIdentityUpgradeText = "fallback identity upgrade text";
    const fallbackIdentityUpgradeTextHash = fallbackIdentityUpgradePlugin.getTextFingerprint(fallbackIdentityUpgradeText);
    const fallbackIdentityExpected = `fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:sameneighbor:message:${fallbackIdentityUpgradeTextHash}`;
    const fallbackIdentityCurrent = `fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:sameneighbor:message:${fallbackIdentityUpgradeTextHash}`;
    const fallbackIdentityOptions = {
        ...fallbackIdentityUpgradePlugin.getAutoTranslationOptions(),
        messageIdentity: fallbackIdentityExpected
    };
    fallbackIdentityUpgradePlugin.getMessageIdentity = () => fallbackIdentityCurrent;
    const fallbackIdentityItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: fallbackIdentityUpgradeText },
        text: fallbackIdentityUpgradeText,
        requestOptions: fallbackIdentityOptions
    };
    fallbackIdentityUpgradePlugin.ensureTranslationOwnerId(fallbackIdentityItem.content);
    fallbackIdentityItem.cacheKey = fallbackIdentityUpgradePlugin.getTranslationCacheKey(fallbackIdentityUpgradeText, fallbackIdentityOptions);
    const fallbackIdentityCurrentOptions = { ...fallbackIdentityOptions, messageIdentity: fallbackIdentityCurrent };
    const fallbackIdentityCurrentKey = fallbackIdentityUpgradePlugin.getTranslationCacheKey(fallbackIdentityUpgradeText, fallbackIdentityCurrentOptions);
    fallbackIdentityUpgradePlugin.addAutoTranslationPendingTarget(fallbackIdentityItem.cacheKey, fallbackIdentityItem);
    fallbackIdentityUpgradePlugin.renderAutoTranslationResult(fallbackIdentityItem, "\u5df2\u7ffb\u8bd1\u7684\u56de\u9000\u8eab\u4efd\u5185\u5bb9");
    assert.equal(fallbackIdentityUpgradeRemoved, false);
    assert.equal(fallbackIdentityUpgradeRenderedKey, fallbackIdentityCurrentKey);
    assert.equal(fallbackIdentityUpgradePlugin.translationCache.get(fallbackIdentityItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u56de\u9000\u8eab\u4efd\u5185\u5bb9");
    assert.equal(fallbackIdentityUpgradePlugin.translationCache.get(fallbackIdentityCurrentKey), "\u5df2\u7ffb\u8bd1\u7684\u56de\u9000\u8eab\u4efd\u5185\u5bb9");
    clearTimeout(fallbackIdentityUpgradePlugin.translationCacheDirtyTimer);
    fallbackIdentityUpgradePlugin.translationCacheDirtyTimer = null;
    const fallbackStrictPlugin = new Plugin();
    const fallbackStrictContent = { dataset: {}, isConnected: true };
    fallbackStrictPlugin.ensureTranslationOwnerId(fallbackStrictContent);
    const fallbackStrictTarget = { content: fallbackStrictContent };
    const fallbackStrictTextHash = fallbackStrictPlugin.getTextFingerprint("strict identity text");
    const fallbackStrictExpected = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:neighborhash:message:${fallbackStrictTextHash}`);
    const fallbackStrictUnknown = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:unknown-author:unknown-time:routehash:domhash:neighborhash:message:${fallbackStrictTextHash}`);
    const fallbackStrictNeighborMismatch = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:otherneighbor:message:${fallbackStrictTextHash}`);
    const fallbackStrictSame = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:neighborhash:message:${fallbackStrictTextHash}`);
    assert.equal(fallbackStrictPlugin.isSafeFallbackTranslationIdentityUpgrade(fallbackStrictExpected, fallbackStrictUnknown, fallbackStrictTarget), false);
    assert.equal(fallbackStrictPlugin.isSafeFallbackTranslationIdentityUpgrade(fallbackStrictExpected, fallbackStrictNeighborMismatch, fallbackStrictTarget), false);
    assert.equal(fallbackStrictPlugin.isSafeFallbackTranslationIdentityUpgrade(fallbackStrictExpected, fallbackStrictSame, fallbackStrictTarget), true);

    const autoTextWritePlugin = new Plugin();
    autoTextWritePlugin.isElementVisibleInViewport = () => true;
    autoTextWritePlugin.getElementText = content => content.text;
    autoTextWritePlugin.renderTranslation = () => {};
    const autoTextWriteItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "same text" },
        text: "same text",
        requestOptions: autoTextWritePlugin.getAutoTranslationOptions()
    };
    autoTextWriteItem.cacheKey = autoTextWritePlugin.getTranslationCacheKey(autoTextWriteItem.text, autoTextWriteItem.requestOptions);
    autoTextWritePlugin.renderAutoTranslationResult(autoTextWriteItem, "\u5df2\u7ffb\u8bd1\u4e00\u6b21");
    assert.equal(autoTextWritePlugin.translationCache.get(autoTextWriteItem.cacheKey), "\u5df2\u7ffb\u8bd1\u4e00\u6b21");
    assert.equal(autoTextWritePlugin.getAutoTextTranslationCacheValue("same text", autoTextWriteItem.requestOptions), "\u5df2\u7ffb\u8bd1\u4e00\u6b21");
    clearTimeout(autoTextWritePlugin.translationCacheDirtyTimer);
    autoTextWritePlugin.translationCacheDirtyTimer = null;

    const pausedResultPlugin = new Plugin();
    let pausedResultRendered = false;
    let pausedResultRetryDelay = 0;
    pausedResultPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    pausedResultPlugin.isElementVisibleInViewport = () => true;
    pausedResultPlugin.getElementText = content => content.text;
    pausedResultPlugin.renderTranslation = () => { pausedResultRendered = true; };
    pausedResultPlugin.scheduleAutoTranslationRetryScan = delay => { pausedResultRetryDelay = Math.max(pausedResultRetryDelay, delay); };
    const pausedResultItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "paused text" },
        text: "paused text",
        requestOptions: pausedResultPlugin.getAutoTranslationOptions()
    };
    pausedResultItem.cacheKey = pausedResultPlugin.getTranslationCacheKey(pausedResultItem.text, pausedResultItem.requestOptions);
    pausedResultPlugin.addAutoTranslationPendingTarget(pausedResultItem.cacheKey, pausedResultItem);
    pausedResultPlugin.renderAutoTranslationResult(pausedResultItem, "\u5df2\u7ffb\u8bd1\u7684\u6682\u505c\u5185\u5bb9");
    assert.equal(pausedResultRendered, false);
    assert.equal(pausedResultPlugin.translationCache.get(pausedResultItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u6682\u505c\u5185\u5bb9");
    assert.equal(pausedResultPlugin.autoTranslationPendingTargets.has(pausedResultItem.cacheKey), true);
    assert.ok(pausedResultRetryDelay > 0);
    clearTimeout(pausedResultPlugin.autoTranslationRetryTimer);
    pausedResultPlugin.autoTranslationRetryTimer = null;
    clearTimeout(pausedResultPlugin.translationCacheDirtyTimer);
    pausedResultPlugin.translationCacheDirtyTimer = null;

    let removedPendingCount = 0;
    const pendingClearPlugin = new Plugin();
    pendingClearPlugin.removeAutoTranslationNode = () => { removedPendingCount++; };
    pendingClearPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetA);
    pendingClearPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetB);
    pendingClearPlugin.clearPendingAutoTranslationItem({ cacheKey: fanoutKey });
    assert.equal(removedPendingCount, 2);
    assert.equal(pendingClearPlugin.autoTranslationPendingTargets.has(fanoutKey), false);

    const inlineFailurePlugin = new Plugin();
    let inlineFailureRendered = false;
    let inlineFailureRemoved = false;
    inlineFailurePlugin.isElementVisibleInViewport = () => true;
    inlineFailurePlugin.getElementText = content => content.text;
    inlineFailurePlugin.renderTranslationError = (messageNode, content, error, cacheKey, sourceText) => {
        inlineFailureRendered = { messageNode, content, error, cacheKey, sourceText };
    };
    inlineFailurePlugin.removeAutoTranslationNode = () => { inlineFailureRemoved = true; };
    inlineFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    inlineFailurePlugin.showAutoTranslateError = () => {};
    const inlineFailureError = new Error("invalid output");
    const inlineFailureItem = {
        messageNode: { isConnected: true },
        content: { isConnected: true, text: "привет", dataset: {} },
        text: "привет",
        cacheKey: "inline-failure-cache",
        requestOptions: inlineFailurePlugin.getAutoTranslationOptions()
    };
    inlineFailurePlugin.markAutoTranslationFailure(inlineFailureItem, inlineFailureError);
    assert.equal(inlineFailureRendered, false);
    assert.equal(inlineFailureRemoved, true);

    inlineFailurePlugin.settings.ui.showAutoTranslateWarnings = true;
    inlineFailureRendered = false;
    inlineFailureRemoved = false;
    inlineFailurePlugin.removeAutoTranslationNode = () => { throw new Error("visible invalid auto output should render inline feedback"); };
    inlineFailurePlugin.markAutoTranslationFailure(inlineFailureItem, inlineFailureError);
    assert.equal(inlineFailureRendered.content, inlineFailureItem.content);
    assert.equal(inlineFailureRendered.sourceText, "привет");

    const warningToastPlugin = new Plugin();
    let warningToasts = 0;
    warningToastPlugin.showToast = () => { warningToasts++; };
    warningToastPlugin.showAutoTranslateError(new Error("invalid output"));
    assert.equal(warningToasts, 0);
    warningToastPlugin.settings.ui.showAutoTranslateWarnings = true;
    warningToastPlugin.showAutoTranslateError(new Error("invalid output"));
    assert.equal(warningToasts, 0);
    warningToastPlugin.settings.ui.showAutoTranslateToasts = true;
    warningToastPlugin.showAutoTranslateError(new Error("invalid output"));
    assert.equal(warningToasts, 1);
    warningToastPlugin.settings.ui.showAutoTranslateToasts = false;
    warningToastPlugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 500 }));
    assert.equal(warningToasts, 1);
    // An error only the user can fix (auth) is announced once per episode even with failure toasts off.
    warningToastPlugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 401 }));
    assert.equal(warningToasts, 2);
    warningToastPlugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 401 }));
    assert.equal(warningToasts, 2);

    const networkFailurePlugin = new Plugin();
    let networkFailureRemoved = false;
    networkFailurePlugin.removeAutoTranslationNode = () => { networkFailureRemoved = true; };
    networkFailurePlugin.renderTranslationError = () => { throw new Error("network failures should avoid noisy inline errors"); };
    networkFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
    networkFailurePlugin.showAutoTranslateError = () => {};
    const networkFailureError = new Error("NetworkError");
    networkFailurePlugin.markAutoTranslationFailure({
        messageNode: { isConnected: true },
        content: { isConnected: true, text: "привет", dataset: {} },
        text: "привет",
        cacheKey: "network-failure-cache",
        requestOptions: networkFailurePlugin.getAutoTranslationOptions()
    }, networkFailureError);
    assert.equal(networkFailureRemoved, true);

    const queuePlugin = new Plugin();
    queuePlugin.settings.translation.enabled = true;
    queuePlugin.settings.ui.autoTranslateMessages = true;
    queuePlugin.settings.translation.apiKey = "sk-test";
    queuePlugin.settings.translation.targetLanguage = "汉语";
    queuePlugin.isElementVisibleInViewport = () => true;
    queuePlugin.getMessageContentElement = message => message.content;
    queuePlugin.getCachedElementText = content => content.text;
    queuePlugin.shouldAutoTranslateText = () => true;
    queuePlugin.hasCurrentTranslationLine = () => false;
    let queueDrainCount = 0;
    queuePlugin.drainAutoTranslationQueue = () => { queueDrainCount++; };
    const queuedA = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
    const queuedB = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
    queuePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [queuedA, queuedB],
        contentByMessage: new Map(),
        textByElement: new Map()
    });
    assert.equal(queuePlugin.autoTranslationQueue.length, 1);
    assert.equal(queuePlugin.getAutoTranslationPendingTargets({ cacheKey: queuePlugin.autoTranslationQueue[0].cacheKey }).length, 2);
    assert.equal(queueDrainCount, 1);

    const repeatedScanPlugin = new Plugin();
    repeatedScanPlugin.settings.translation.enabled = true;
    repeatedScanPlugin.settings.ui.autoTranslateMessages = true;
    repeatedScanPlugin.settings.translation.apiKey = "sk-test";
    repeatedScanPlugin.settings.translation.targetLanguage = "Chinese";
    repeatedScanPlugin.isElementVisibleInViewport = () => true;
    repeatedScanPlugin.getMessageContentElement = message => message.content;
    repeatedScanPlugin.getCachedElementText = content => content.text;
    repeatedScanPlugin.getElementText = content => content.text;
    repeatedScanPlugin.getMessageIdentity = message => `repeat:${message.id}`;
    repeatedScanPlugin.shouldAutoTranslateText = () => true;
    repeatedScanPlugin.hasCurrentTranslationLine = () => false;
    repeatedScanPlugin.drainAutoTranslationQueue = () => {};
    const repeatedScanMessage = { id: "same", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola repeated" } };
    const repeatedScanContext = {
        messageNodes: [repeatedScanMessage],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    };
    repeatedScanPlugin.queueAutoTranslateVisibleMessages(repeatedScanContext);
    repeatedScanPlugin.queueAutoTranslateVisibleMessages(repeatedScanContext);
    assert.equal(repeatedScanPlugin.autoTranslationQueue.length, 1);
    assert.equal(repeatedScanPlugin.translationRequests.size, 0);
    assert.equal(repeatedScanPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0].state, "queued");

    const diagnosticDecisionPlugin = new Plugin();
    diagnosticDecisionPlugin.settings.translation.provider = "sakuraLocal";
    diagnosticDecisionPlugin.settings.translation.targetLanguage = "Chinese";
    diagnosticDecisionPlugin.getMessageIdentity = message => `diagnostic:${message.id}`;
    diagnosticDecisionPlugin.isElementVisibleInViewport = () => true;
    const diagnosticDecisionMessage = { id: "message", isConnected: true };
    const diagnosticDecisionContent = { dataset: {}, isConnected: true, text: "diagnostic foreign text" };
    const diagnosticDecisionText = "diagnostic foreign text";
    const diagnosticDecisionOptions = diagnosticDecisionPlugin.withMessageIdentity(
        diagnosticDecisionPlugin.getAutoTranslationOptions(),
        diagnosticDecisionMessage,
        diagnosticDecisionContent,
        diagnosticDecisionText
    );
    const diagnosticDecisionItem = {
        messageNode: diagnosticDecisionMessage,
        content: diagnosticDecisionContent,
        text: diagnosticDecisionText,
        cacheKey: diagnosticDecisionPlugin.getTranslationCacheKey(diagnosticDecisionText, diagnosticDecisionOptions),
        requestOptions: diagnosticDecisionOptions
    };
    diagnosticDecisionPlugin.logAutoTranslationMessageState("auto.message.state", "queued", diagnosticDecisionItem, "queuedVisible", "enqueued");
    diagnosticDecisionPlugin.logAutoTranslationMessageState("auto.message.state", "start", diagnosticDecisionItem, "inFlight", "request-started");
    diagnosticDecisionPlugin.logAutoTranslationMessageState("auto.message.state", "failed", diagnosticDecisionItem, "failed", "failure", {
        type: "invalid-output",
        validationQuality: "bad"
    });
    const diagnosticDecision = diagnosticDecisionPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0];
    assert.equal(diagnosticDecision.requestCount, 1);
    assert.equal(diagnosticDecision.lastErrorType, "invalid-output");
    assert.equal(diagnosticDecision.validationQuality, "bad");
    assert.equal(diagnosticDecision.queueType, "visible");
    assert.ok(diagnosticDecision.messageIdentityHash);
    assert.ok(diagnosticDecision.textHash);

    const diagnosticFailureClassPlugin = new Plugin();
    diagnosticFailureClassPlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticFailureClassPlugin.logDiagnostic("manual.long-text.whole-pass", "failed", {
        type: "invalid-output",
        wholePassFailed: true,
        sourceLength: 900,
        outputLength: 120
    });
    diagnosticFailureClassPlugin.logDiagnostic("auto.long-text.chunk", "failed", {
        type: "invalid-output",
        chunkIndex: 1,
        chunkTotal: 4,
        invalidReason: "residual-source"
    });
    const diagnosticFailureSummary = diagnosticFailureClassPlugin.createDiagnosticSummary(diagnosticFailureClassPlugin.diagnosticLogs);
    assert.equal(diagnosticFailureClassPlugin.diagnosticLogs[0].meta.failureClass, "whole-pass-failed");
    assert.equal(diagnosticFailureClassPlugin.diagnosticLogs[0].meta.failureLayer, "request");
    assert.equal(diagnosticFailureClassPlugin.diagnosticLogs[1].meta.failureClass, "chunk-failed");
    assert.ok(diagnosticFailureSummary.top.failureClasses.some(item => item.key === "whole-pass-failed"));
    assert.ok(diagnosticFailureSummary.top.failureLayers.some(item => item.key === "validation"));
    assert.ok(diagnosticFailureSummary.humanSummary.some(line => /top failure:/.test(line)));
    assert.ok(diagnosticFailureClassPlugin.serializeDiagnosticLogs("txt").includes("humanSummary:"));

    const providerFallbackFeaturePlugin = new Plugin();
    providerFallbackFeaturePlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackFeaturePlugin.settings.ui.providerFallbackOrder = ["microsoft", "deepl", "sakuraLocal"];
    providerFallbackFeaturePlugin.settings.translation.provider = "sakuraLocal";
    assert.deepEqual(providerFallbackFeaturePlugin.getProviderFallbackOrder("translation"), []);
    providerFallbackFeaturePlugin.settings.translation.provider = "deepseek";
    assert.deepEqual(providerFallbackFeaturePlugin.getProviderFallbackOrder("translation"), ["microsoft", "deepl"]);
    providerFallbackFeaturePlugin.getCurrentRouteKey = () => "guild-shell:channel-shell:";
    // 'inherit' follows the main auto-translate switch (off by default); 'enabled' works as an allow-list.
    assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), false);
    providerFallbackFeaturePlugin.settings.ui.autoTranslateMessages = true;
    assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), true);
    providerFallbackFeaturePlugin.settings.ui.channelAutoTranslatePolicies = {
        "guild-shell:channel-shell": { mode: "disabled" }
    };
    assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), false);
    providerFallbackFeaturePlugin.saveSettings = () => true;
    providerFallbackFeaturePlugin.setSetting("ui.currentChannelAutoTranslatePolicy", "enabled");
    assert.equal(providerFallbackFeaturePlugin.getCurrentChannelAutoTranslatePolicyMode(), "enabled");
    assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), true);
    providerFallbackFeaturePlugin.setSetting("ui.currentChannelAutoTranslatePolicy", "inherit");
    assert.equal(providerFallbackFeaturePlugin.getCurrentChannelAutoTranslatePolicyMode(), "inherit");
    assert.deepEqual(providerFallbackFeaturePlugin.settings.ui.channelAutoTranslatePolicies, {});
    assert.deepEqual(providerFallbackFeaturePlugin.parseProviderFallbackOrderText("microsoft, deepl\nbad-provider sakuraLocal microsoft"), ["microsoft", "deepl", "sakuraLocal"]);
    providerFallbackFeaturePlugin.setSetting("ui.providerFallbackOrder", "microsoft\nbad-provider deepl microsoft");
    assert.deepEqual(providerFallbackFeaturePlugin.settings.ui.providerFallbackOrder, ["microsoft", "deepl"]);
    assert.equal(providerFallbackFeaturePlugin.getSetting("ui.providerFallbackOrder"), "microsoft, deepl");

    const historyBackfillPlugin = new Plugin();
    historyBackfillPlugin.settings.translation.enabled = true;
    historyBackfillPlugin.settings.translation.apiKey = "sk-test";
    historyBackfillPlugin.settings.ui.autoTranslateMessages = true;
    historyBackfillPlugin.settings.ui.historyBackfillEnabled = true;
    historyBackfillPlugin.getScanContextMessageNodes = () => [
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola history uno" } },
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola history dos" } }
    ];
    historyBackfillPlugin.getMessageContentElement = message => message.content;
    historyBackfillPlugin.getCachedElementText = content => content.text;
    historyBackfillPlugin.getElementText = content => content.text;
    historyBackfillPlugin.getMessageIdentity = (_message, _content, text) => `history:${text}`;
    historyBackfillPlugin.isElementVisibleInViewport = () => false;
    historyBackfillPlugin.shouldAutoTranslateText = () => true;
    historyBackfillPlugin.hasCurrentTranslationLine = () => false;
    historyBackfillPlugin.drainAutoTranslationQueue = () => {};
    const historyBackfillResult = historyBackfillPlugin.requestExplicitHistoryBackfill({ limit: 2 });
    assert.equal(historyBackfillResult.enqueued, 2);
    assert.equal(historyBackfillPlugin.autoTranslationQueue.length, 2);
    assert.equal(historyBackfillPlugin.autoTranslationQueue.every(item => item.daitHistoryRequest === true), true);
    assert.equal(historyBackfillPlugin.autoTranslationQueue.every(item => historyBackfillPlugin.getAutoTranslationDiagnosticQueueType(item) === "history"), true);
    assert.equal(historyBackfillPlugin.isAutoTranslationPrefetchAllowed(historyBackfillPlugin.autoTranslationQueue[0]), true);

    const historyDisabledPlugin = new Plugin();
    historyDisabledPlugin.settings.translation.enabled = true;
    historyDisabledPlugin.settings.ui.autoTranslateMessages = true;
    historyDisabledPlugin.settings.ui.historyBackfillEnabled = false;
    assert.equal(historyDisabledPlugin.requestExplicitHistoryBackfill({ messageNodes: [{ isConnected: true }] }).enqueued, 0);

    const precheckDecisionPlugin = new Plugin();
    precheckDecisionPlugin.settings.translation.enabled = true;
    precheckDecisionPlugin.settings.ui.autoTranslateMessages = true;
    precheckDecisionPlugin.settings.translation.apiKey = "sk-test";
    precheckDecisionPlugin.settings.translation.targetLanguage = "Chinese";
    precheckDecisionPlugin.isElementVisibleInViewport = () => true;
    precheckDecisionPlugin.getMessageContentElement = message => message.content;
    precheckDecisionPlugin.getCachedElementText = content => content.text;
    precheckDecisionPlugin.getMessageIdentity = () => "precheck-decision";
    precheckDecisionPlugin.shouldAutoTranslateText = () => false;
    precheckDecisionPlugin.drainAutoTranslationQueue = () => {};
    precheckDecisionPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "already target text" } }],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(precheckDecisionPlugin.autoTranslationQueue.length, 0);
    const precheckDecision = precheckDecisionPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0];
    assert.equal(precheckDecision.state, "skipped");
    assert.equal(precheckDecision.reasonCode, "not-eligible-language");

    const currentLineDecisionPlugin = new Plugin();
    currentLineDecisionPlugin.settings.translation.enabled = true;
    currentLineDecisionPlugin.settings.ui.autoTranslateMessages = true;
    currentLineDecisionPlugin.settings.translation.apiKey = "sk-test";
    currentLineDecisionPlugin.settings.translation.targetLanguage = "Chinese";
    currentLineDecisionPlugin.isElementVisibleInViewport = () => true;
    currentLineDecisionPlugin.getMessageContentElement = message => message.content;
    currentLineDecisionPlugin.getCachedElementText = content => content.text;
    currentLineDecisionPlugin.getMessageIdentity = () => "current-line-decision";
    currentLineDecisionPlugin.shouldAutoTranslateText = () => true;
    currentLineDecisionPlugin.hasCurrentTranslationLine = () => true;
    currentLineDecisionPlugin.drainAutoTranslationQueue = () => {};
    currentLineDecisionPlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola current" } }],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(currentLineDecisionPlugin.autoTranslationQueue.length, 0);
    assert.equal(currentLineDecisionPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0].state, "current-line-present");

    const savedWindowForBdfdbIntake = global.window;
    global.window = { location: { pathname: "/channels/guild-bdfdb/channel-bdfdb" } };
    const bdfdbFallbackPlugin = new Plugin();
    bdfdbFallbackPlugin.settings.translation.enabled = true;
    bdfdbFallbackPlugin.settings.ui.autoTranslateMessages = true;
    bdfdbFallbackPlugin.settings.ui.autoTranslateIntakeMode = "bdfdb";
    bdfdbFallbackPlugin.settings.ui.diagnosticsEnabled = true;
    bdfdbFallbackPlugin.isElementVisibleInViewport = () => true;
    bdfdbFallbackPlugin.getMessageContentElement = message => message.content;
    bdfdbFallbackPlugin.getCachedElementText = content => content.text;
    bdfdbFallbackPlugin.shouldAutoTranslateText = () => true;
    const bdfdbFallbackMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola fallback" } };
    const bdfdbFallbackCandidates = bdfdbFallbackPlugin.createAutoTranslationCandidates({
        messageNodes: [bdfdbFallbackMessage],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(bdfdbFallbackCandidates.length, 1);
    assert.equal(bdfdbFallbackCandidates[0].source, "dom");
    assert.ok(bdfdbFallbackPlugin.diagnosticLogs.some(entry => entry.action === "auto.intake" && entry.status === "fallback"));

    global.window = {
        location: { pathname: "/channels/guild-bdfdb/222222222222222222" },
        BDFDB_Global: {
            loaded: true,
            started: true,
            BDFDB: {
                LibraryStores: {
                    MessageStore: {
                        getMessages: () => [{
                            id: "111111111111111111",
                            guild_id: "guild-bdfdb",
                            channel_id: "222222222222222222",
                            content: "hola bdfdb",
                            author: { id: "author-bdfdb" },
                            timestamp: "2026-06-22T00:00:00.000Z"
                        }]
                    }
                }
            }
        }
    };
    const bdfdbIntakePlugin = new Plugin();
    bdfdbIntakePlugin.settings.translation.enabled = true;
    bdfdbIntakePlugin.settings.ui.autoTranslateMessages = true;
    bdfdbIntakePlugin.settings.ui.autoTranslateIntakeMode = "auto";
    bdfdbIntakePlugin.settings.ui.diagnosticsEnabled = true;
    bdfdbIntakePlugin.isElementVisibleInViewport = () => true;
    bdfdbIntakePlugin.getMessageContentElement = message => message.content;
    bdfdbIntakePlugin.getCachedElementText = content => content.text;
    bdfdbIntakePlugin.shouldAutoTranslateText = () => true;
    const bdfdbDomMessage = {
        nodeType: 1,
        isConnected: true,
        getAttribute: name => name === "data-message-id" ? "111111111111111111" : null,
        content: { dataset: {}, isConnected: true, text: "hola bdfdb" }
    };
    const bdfdbCandidates = bdfdbIntakePlugin.createAutoTranslationCandidates({
        messageNodes: [bdfdbDomMessage],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(bdfdbCandidates.length, 1);
    assert.equal(bdfdbCandidates[0].source, "bdfdb");
    assert.equal(bdfdbCandidates[0].messageId, "111111111111111111");
    assert.equal(bdfdbCandidates[0].channelId, "222222222222222222");
    assert.match(bdfdbCandidates[0].messageIdentity, /^message:guild-bdfdb:222222222222222222:111111111111111111:message:/);
    bdfdbIntakePlugin.queueAutoTranslateVisibleMessages({
        messageNodes: [],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(bdfdbIntakePlugin.autoTranslationQueue.length, 0);

    global.window = { location: { pathname: "/channels/guild-store/333333333333333333" } };
    const storeFullIntakePlugin = new Plugin();
    storeFullIntakePlugin.settings.translation.enabled = true;
    storeFullIntakePlugin.settings.ui.autoTranslateMessages = true;
    storeFullIntakePlugin.settings.ui.autoTranslateIntakeMode = "auto";
    storeFullIntakePlugin.settings.ui.diagnosticsEnabled = true;
    storeFullIntakePlugin.isElementVisibleInViewport = () => true;
    storeFullIntakePlugin.isAutoTranslationTargetInScanRange = () => true;
    storeFullIntakePlugin.getMessageContentElement = message => message.content;
    storeFullIntakePlugin.getCachedElementText = content => content.text;
    storeFullIntakePlugin.getElementText = content => content.text;
    storeFullIntakePlugin.shouldAutoTranslateText = () => true;
    const storeShortDom = "step 4: paste model name";
    const storeFullText = [
        "free access to GPT 5.5 and Grok 4.20",
        "platform Stack AI. free tier. no card needed",
        "step 1: sign in with Google",
        "step 2: create agent",
        "step 3: open Interface",
        storeShortDom
    ].join("\n");
    storeFullIntakePlugin.getDiscordMessageStore = () => ({
        getMessages: () => [{
            id: "333333333333333334",
            guild_id: "guild-store",
            channel_id: "333333333333333333",
            content: storeFullText,
            author: { id: "author-store" },
            timestamp: "2026-06-23T00:00:00.000Z"
        }]
    });
    const storeFullMessage = {
        nodeType: 1,
        isConnected: true,
        getAttribute: name => name === "data-message-id" ? "333333333333333334" : null,
        content: { dataset: {}, isConnected: true, text: storeShortDom }
    };
    const storeFullCandidates = storeFullIntakePlugin.createAutoTranslationCandidates({
        messageNodes: [storeFullMessage],
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    assert.equal(storeFullCandidates.length, 1);
    assert.equal(storeFullCandidates[0].source, "bdfdb");
    assert.equal(storeFullCandidates[0].sourceTextKind, "store-full");
    assert.equal(storeFullCandidates[0].domText, storeShortDom);
    assert.equal(storeFullCandidates[0].text, storeFullText);
    assert.equal(storeFullIntakePlugin.isAutoTranslationTargetReady({
        ...storeFullCandidates[0],
        cacheKey: "store-full-cache",
        requestOptions: storeFullIntakePlugin.getAutoTranslationOptions()
    }), true);
    global.window = savedWindowForBdfdbIntake;
    shared.longSingleText = longSingleText;
}

module.exports = { title: "Providers, cache codec & long-text handling", run };
