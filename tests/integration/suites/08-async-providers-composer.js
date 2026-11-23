"use strict";

// Artifact regression suite: Async local model detection, polish & Slate composer
async function run(harness, shared) {
    const { assert, Plugin } = harness;
    const { FakeDataTransfer, FakeClipboardEvent } = shared;
    const savedFetchForAbort = global.fetch;
    const unsafeEndpointPlugin = new Plugin();
    let unsafeEndpointFetches = 0;
    global.fetch = async () => {
        unsafeEndpointFetches++;
        return { ok: true, text: async () => "ok" };
    };
    await assert.rejects(
        () => unsafeEndpointPlugin.fetchApiResponseText("http://example.invalid/v1/chat/completions", {
            headers: { Authorization: "Bearer must-not-leak" },
            body: { messages: [{ content: "private discord message" }] }
        }),
        /must use HTTPS/
    );
    assert.equal(unsafeEndpointFetches, 0);
    assert.match(unsafeEndpointPlugin.assertSafeRequestEndpoint("http://127.0.0.1:8080/v1/chat/completions"), /^http:/);
    assert.match(unsafeEndpointPlugin.assertSafeRequestEndpoint("https://example.invalid/v1/chat/completions"), /^https:/);
    assert.throws(() => unsafeEndpointPlugin.assertSafeRequestEndpoint("https://user:secret@example.invalid/v1"), /embedded credentials/);

    const apiAbortPlugin = new Plugin();
    let apiAbortSignal = null;
    global.fetch = (_endpoint, options) => new Promise((_resolve, reject) => {
        apiAbortSignal = options.signal;
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const apiAbortPromise = apiAbortPlugin.fetchApiResponseText("https://example.invalid", { headers: {}, body: {} }, 30000);
    assert.equal(apiAbortPlugin.activeApiControllers.size, 1);
    assert.equal(apiAbortSignal.aborted, false);
    apiAbortPlugin.abortActiveApiRequests();
    assert.equal(apiAbortSignal.aborted, true);
    await assert.rejects(apiAbortPromise, { code: "REQUEST_CANCELLED" });
    assert.equal(apiAbortPlugin.activeApiControllers.size, 0);
    global.fetch = savedFetchForAbort;

    const localTruncatedApiTestPlugin = new Plugin();
    localTruncatedApiTestPlugin.settings.translation.provider = "sakuraLocal";
    localTruncatedApiTestPlugin.settings.translation.apiKey = "";
    localTruncatedApiTestPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localTruncatedApiTestPlugin.settings.translation.model = "local-model";
    const localTruncatedStates = [];
    let localTruncatedToastType = "";
    let localTruncatedScanCount = 0;
    localTruncatedApiTestPlugin.setApiStatus = (_status, state) => { localTruncatedStates.push(state); };
    localTruncatedApiTestPlugin.setButtonBusy = () => {};
    localTruncatedApiTestPlugin.showToast = (_message, type) => { localTruncatedToastType = type; };
    localTruncatedApiTestPlugin.queueScan = () => { localTruncatedScanCount++; };
    localTruncatedApiTestPlugin.fetchModelResponse = async () => {
        throw localTruncatedApiTestPlugin.createModelOutputTruncatedError("partial local output", "length");
    };
    await localTruncatedApiTestPlugin.testApiConnection("translation", {}, {});
    assert.deepEqual(localTruncatedStates, ["testing", "success"]);
    assert.equal(localTruncatedToastType, "success");
    assert.equal(localTruncatedScanCount, 1);
    assert.equal(localTruncatedApiTestPlugin.localProviderHealthyKeys.size, 1);

    const localDetectRunPlugin = new Plugin();
    localDetectRunPlugin.settings.translation.provider = "sakuraLocal";
    localDetectRunPlugin.settings.translation.apiKey = "";
    localDetectRunPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localDetectRunPlugin.settings.translation.model = "local-model";
    const localDetectCalls = [];
    localDetectRunPlugin.fetchApiResponseText = async (endpoint, request) => {
        localDetectCalls.push({ endpoint, method: request?.method || "POST", model: request?.body?.model || "" });
        if (request?.method === "GET") {
            return JSON.stringify({ data: [{ id: "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf" }] });
        }
        return JSON.stringify({ choices: [{ message: { content: "detected translation" } }] });
    };
    assert.equal(await localDetectRunPlugin.runModelTask("translation", "hello detect"), "detected translation");
    assert.equal(localDetectCalls.length, 2);
    assert.equal(localDetectCalls[0].method, "GET");
    assert.equal(localDetectCalls[0].endpoint, "http://127.0.0.1:8080/v1/models");
    assert.equal(localDetectCalls[1].method, "POST");
    assert.equal(localDetectCalls[1].model, "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf");

    const localDetectFallbackPlugin = new Plugin();
    localDetectFallbackPlugin.settings.translation.provider = "sakuraLocal";
    localDetectFallbackPlugin.settings.translation.apiKey = "";
    localDetectFallbackPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localDetectFallbackPlugin.settings.translation.model = "local-model";
    let localDetectFallbackModel = "";
    localDetectFallbackPlugin.fetchApiResponseText = async (_endpoint, request) => {
        if (request?.method === "GET") throw new Error("models endpoint missing");
        localDetectFallbackModel = request?.body?.model || "";
        return JSON.stringify({ choices: [{ message: { content: "fallback translation" } }] });
    };
    assert.equal(await localDetectFallbackPlugin.runModelTask("translation", "hello fallback"), "fallback translation");
    assert.equal(localDetectFallbackModel, "local-model");

    const providerFallbackRunPlugin = new Plugin();
    providerFallbackRunPlugin.settings.translation.provider = "deepseek";
    providerFallbackRunPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackRunPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackRunPlugin.settings.translation.model = "current-model";
    providerFallbackRunPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackRunPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    providerFallbackRunPlugin.settings.translation.providerProfiles = {
        microsoft: {
            apiKey: "ms-key",
            endpoint: "https://microsoft.invalid/translate",
            region: "westus",
            model: ""
        }
    };
    const providerFallbackProviders = [];
    providerFallbackRunPlugin.fetchApiResponseText = async (_endpoint, request) => {
        providerFallbackProviders.push(request?.provider || "");
        if (request?.provider === "deepseek") {
            const error = new Error("server failed");
            error.status = 500;
            throw error;
        }
        if (request?.provider === "microsoft") {
            return JSON.stringify([{ translations: [{ text: "\u4f60\u597d fallback" }] }]);
        }
        throw new Error("unexpected provider");
    };
    const providerFallbackRequestContext = {};
    assert.equal(await providerFallbackRunPlugin.runModelTask("translation", "hello fallback", {
        mode: "manual",
        requestContext: providerFallbackRequestContext
    }), "\u4f60\u597d fallback");
    assert.deepEqual(providerFallbackProviders, ["deepseek", "microsoft"]);
    assert.equal(providerFallbackRequestContext.fallbackProvider, "microsoft");

    const providerFallbackSecretIsolationPlugin = new Plugin();
    providerFallbackSecretIsolationPlugin.settings.translation.provider = "deepseek";
    providerFallbackSecretIsolationPlugin.settings.translation.apiKey = "deepseek-secret";
    providerFallbackSecretIsolationPlugin.settings.translation.appId = "primary-app-id";
    providerFallbackSecretIsolationPlugin.settings.translation.secretKey = "primary-secret";
    providerFallbackSecretIsolationPlugin.settings.translation.region = "primary-region";
    providerFallbackSecretIsolationPlugin.settings.translation.providerProfiles = {};
    for (const fallbackProvider of ["openaiCompatible", "microsoft", "deepl", "baidu"]) {
        const fallbackConfig = providerFallbackSecretIsolationPlugin.getProviderFallbackConfig(
            "translation",
            fallbackProvider,
            providerFallbackSecretIsolationPlugin.settings.translation
        );
        assert.equal(fallbackConfig.apiKey, "");
        assert.equal(fallbackConfig.appId, "");
        assert.equal(fallbackConfig.secretKey, "");
        assert.notEqual(fallbackConfig.region, "primary-region");
        assert.equal(providerFallbackSecretIsolationPlugin.hasUsableApiConfig("translation", fallbackConfig), false);
    }

    const providerFallbackPublicPlugin = new Plugin();
    providerFallbackPublicPlugin.settings.translation.provider = "deepseek";
    providerFallbackPublicPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackPublicPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackPublicPlugin.settings.translation.model = "current-model";
    providerFallbackPublicPlugin.settings.translation.targetLanguage = "\u6c49\u8bed";
    providerFallbackPublicPlugin.settings.polish.targetLanguage = "\u6c49\u8bed";
    providerFallbackPublicPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackPublicPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    providerFallbackPublicPlugin.settings.translation.providerProfiles = {
        microsoft: {
            apiKey: "ms-key",
            endpoint: "https://microsoft.invalid/translate",
            region: "westus",
            model: ""
        }
    };
    const providerFallbackPublicProviders = [];
    providerFallbackPublicPlugin.fetchApiResponseText = async (_endpoint, request) => {
        providerFallbackPublicProviders.push(request?.provider || "");
        if (request?.provider === "deepseek") {
            const error = new Error("server failed");
            error.status = 500;
            throw error;
        }
        if (request?.provider === "microsoft") {
            return JSON.stringify([{ translations: [{ text: "\u4f60\u597d\uff0c\u8fd9\u662f\u4e00\u6761\u516c\u5f00\u53cc\u8bed\u7ffb\u8bd1\u6d88\u606f" }] }]);
        }
        throw new Error("unexpected provider");
    };
    const providerFallbackPublicOptions = providerFallbackPublicPlugin.getPublicBilingualTranslationOptions();
    assert.equal(
        await providerFallbackPublicPlugin.runPublicBilingualTranslationTask("hello public fallback", providerFallbackPublicOptions),
        "\u4f60\u597d\uff0c\u8fd9\u662f\u4e00\u6761\u516c\u5f00\u53cc\u8bed\u7ffb\u8bd1\u6d88\u606f"
    );
    assert.deepEqual(providerFallbackPublicProviders, ["deepseek", "microsoft"]);
    assert.equal(providerFallbackPublicOptions.requestContext.fallbackProvider, "microsoft");

    const providerFallbackAutoPlugin = new Plugin();
    providerFallbackAutoPlugin.settings.translation.provider = "deepseek";
    providerFallbackAutoPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackAutoPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackAutoPlugin.settings.translation.model = "current-model";
    providerFallbackAutoPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackAutoPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    let providerFallbackAutoCalls = 0;
    providerFallbackAutoPlugin.fetchApiResponseText = async () => {
        providerFallbackAutoCalls++;
        const error = new Error("server failed");
        error.status = 500;
        throw error;
    };
    await assert.rejects(
        () => providerFallbackAutoPlugin.runModelTask("translation", "hello auto", { mode: "auto" }),
        /server failed/
    );
    assert.equal(providerFallbackAutoCalls, 1);

    const providerFallbackStoppedPlugin = new Plugin();
    providerFallbackStoppedPlugin.settings.translation.provider = "deepseek";
    providerFallbackStoppedPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackStoppedPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackStoppedPlugin.settings.translation.model = "current-model";
    providerFallbackStoppedPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackStoppedPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    providerFallbackStoppedPlugin.settings.translation.providerProfiles = {
        microsoft: { apiKey: "ms-key", endpoint: "https://microsoft.invalid/translate", region: "westus", model: "" }
    };
    let providerFallbackStoppedCalls = 0;
    providerFallbackStoppedPlugin.fetchApiResponseText = async () => {
        providerFallbackStoppedCalls++;
        providerFallbackStoppedPlugin.isStarted = false;
        providerFallbackStoppedPlugin.lifecycleToken++;
        const error = new Error("request stopped");
        error.status = 500;
        throw error;
    };
    await assert.rejects(
        () => providerFallbackStoppedPlugin.runModelTask("translation", "hello stopped", { mode: "manual" }),
        /request stopped/
    );
    assert.equal(providerFallbackStoppedCalls, 1);

    const localTruncatedHealthPlugin = new Plugin();
    localTruncatedHealthPlugin.settings.translation.provider = "sakuraLocal";
    localTruncatedHealthPlugin.settings.translation.apiKey = "";
    localTruncatedHealthPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localTruncatedHealthPlugin.settings.translation.model = "local-model";
    let localTruncatedHealthScan = 0;
    localTruncatedHealthPlugin.fetchApiResponseText = async () => JSON.stringify({
        choices: [{ message: { content: "partial health output" }, finish_reason: "length" }]
    });
    localTruncatedHealthPlugin.queueScan = () => { localTruncatedHealthScan++; };
    const localTruncatedHealthOptions = localTruncatedHealthPlugin.getAutoTranslationOptions();
    const localTruncatedHealthKey = localTruncatedHealthOptions.providerKey;
    localTruncatedHealthPlugin.autoTranslationProviderFailures.set(localTruncatedHealthKey, { retryAt: Date.now() + 10000, type: "local-unavailable" });
    localTruncatedHealthPlugin.startLocalProviderHealthProbe(localTruncatedHealthKey, localTruncatedHealthOptions);
    await localTruncatedHealthPlugin.localProviderHealthChecks.get(localTruncatedHealthKey);
    assert.equal(localTruncatedHealthPlugin.autoTranslationProviderFailures.has(localTruncatedHealthKey), false);
    assert.equal(localTruncatedHealthPlugin.localProviderHealthyKeys.has(localTruncatedHealthKey), true);
    assert.equal(localTruncatedHealthScan, 1);

    const savedNavigatorDescriptor = Object.getOwnPropertyDescriptor(global, "navigator");
    const savedDocumentForClipboard = global.document;
    const clipboardPlugin = new Plugin();
    let clipboardFallbackSelected = false;
    let clipboardFallbackRemoved = false;
    let clipboardExecCommand = "";
    const clipboardPreviousFocus = { isConnected: true, focused: false, focus() { this.focused = true; } };
    Object.defineProperty(global, "navigator", {
        configurable: true,
        value: { clipboard: { writeText: async () => { throw new Error("denied"); } } }
    });
    global.document = {
        activeElement: clipboardPreviousFocus,
        body: { appendChild(node) { node.isConnected = true; return node; } },
        createElement: () => ({
            style: {},
            setAttribute() {},
            select() { clipboardFallbackSelected = true; },
            remove() { clipboardFallbackRemoved = true; this.isConnected = false; }
        }),
        execCommand(command) {
            clipboardExecCommand = command;
            return true;
        }
    };
    await clipboardPlugin.copyTextToClipboard("copy me");
    assert.equal(clipboardFallbackSelected, true);
    assert.equal(clipboardFallbackRemoved, true);
    assert.equal(clipboardExecCommand, "copy");
    assert.equal(clipboardPreviousFocus.focused, true);
    let clipboardThrowRemoved = false;
    Object.defineProperty(global, "navigator", { configurable: true, value: {} });
    global.document = {
        activeElement: null,
        body: { appendChild(node) { node.isConnected = true; return node; } },
        createElement: () => ({
            style: {},
            setAttribute() {},
            select() {},
            remove() { clipboardThrowRemoved = true; this.isConnected = false; }
        }),
        execCommand() { throw new Error("copy boom"); }
    };
    await assert.rejects(() => clipboardPlugin.copyTextToClipboard("copy me"), /document\.execCommand copy failed|copy boom/);
    assert.equal(clipboardThrowRemoved, true);
    if (savedNavigatorDescriptor) Object.defineProperty(global, "navigator", savedNavigatorDescriptor);
    else delete global.navigator;
    global.document = savedDocumentForClipboard;

    const diagnosticExportPlugin = new Plugin();
    diagnosticExportPlugin.showToast = () => {};
    diagnosticExportPlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticExportPlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "abc", queueLength: 1 });
    let copiedDiagnosticText = "";
    diagnosticExportPlugin.copyTextToClipboard = async text => { copiedDiagnosticText = text; };
    assert.equal(await diagnosticExportPlugin.copyDiagnosticLogs(), true);
    assert.match(copiedDiagnosticText, /auto.queue.enqueue/);
    let exportedDiagnostic = null;
    diagnosticExportPlugin.downloadTextFile = (filename, text, mime) => {
        exportedDiagnostic = { filename, text, mime };
        return true;
    };
    assert.equal(await diagnosticExportPlugin.exportDiagnosticLogs("txt"), true);
    assert.match(exportedDiagnostic.filename, /DiscordAITranslator-diagnostics-/);
    assert.equal(exportedDiagnostic.mime, "text/plain");
    assert.match(exportedDiagnostic.text, /auto.queue.enqueue ok/);
    assert.match(exportedDiagnostic.text, /interpretationChecklist/);
    const diagnosticSnapshot = diagnosticExportPlugin.getDiagnosticLogsSnapshot();
    assert.ok(diagnosticSnapshot.interpretationChecklist.some(item => item.step === "last-decision"));
    assert.ok(Object.prototype.hasOwnProperty.call(diagnosticSnapshot.summary, "byValidationQuality"));
    const diagnosticCopyFailurePlugin = new Plugin();
    const diagnosticCopyFailureToasts = [];
    diagnosticCopyFailurePlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticCopyFailurePlugin.showToast = (text, type) => diagnosticCopyFailureToasts.push({ text, type });
    diagnosticCopyFailurePlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "copy-fail" });
    diagnosticCopyFailurePlugin.copyTextToClipboard = async () => { throw new Error("clipboard unavailable"); };
    assert.equal(await diagnosticCopyFailurePlugin.copyDiagnosticLogs(), false);
    assert.equal(diagnosticCopyFailureToasts.some(toast => toast.type === "error"), true);
    clearTimeout(diagnosticCopyFailurePlugin.diagnosticLogsDirtyTimer);
    diagnosticCopyFailurePlugin.diagnosticLogsDirtyTimer = null;
    const diagnosticExportFailurePlugin = new Plugin();
    const diagnosticExportFailureToasts = [];
    diagnosticExportFailurePlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticExportFailurePlugin.showToast = (text, type) => diagnosticExportFailureToasts.push({ text, type });
    diagnosticExportFailurePlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "export-fail" });
    diagnosticExportFailurePlugin.downloadTextFile = () => false;
    diagnosticExportFailurePlugin.copyTextToClipboard = async () => { throw new Error("fallback copy unavailable"); };
    assert.equal(await diagnosticExportFailurePlugin.exportDiagnosticLogs("json"), false);
    assert.equal(diagnosticExportFailureToasts.some(toast => toast.type === "error"), true);
    clearTimeout(diagnosticExportFailurePlugin.diagnosticLogsDirtyTimer);
    diagnosticExportFailurePlugin.diagnosticLogsDirtyTimer = null;
    const emptyDiagnosticPlugin = new Plugin();
    emptyDiagnosticPlugin.showToast = () => {};
    assert.equal(await emptyDiagnosticPlugin.exportDiagnosticLogs("json"), false);

    const sakuraHealthSuccessPlugin = new Plugin();
    sakuraHealthSuccessPlugin.settings.translation.provider = "sakuraLocal";
    sakuraHealthSuccessPlugin.settings.translation.apiKey = "";
    sakuraHealthSuccessPlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    sakuraHealthSuccessPlugin.fetchApiResponseText = async () => JSON.stringify({ choices: [{ message: { content: "OK" } }] });
    let sakuraHealthSuccessQueued = false;
    sakuraHealthSuccessPlugin.queueScan = () => { sakuraHealthSuccessQueued = true; };
    const sakuraHealthSuccessKey = sakuraHealthSuccessPlugin.getAutoTranslationProviderKey(sakuraHealthSuccessPlugin.getAutoTranslationOptions());
    assert.equal(sakuraHealthSuccessPlugin.shouldBlockAutoTranslationForLocalProviderHealth(sakuraHealthSuccessPlugin.getAutoTranslationOptions()), true);
    await sakuraHealthSuccessPlugin.localProviderHealthChecks.get(sakuraHealthSuccessKey);
    assert.equal(sakuraHealthSuccessPlugin.getApiStatus("translation").state, "success");
    assert.equal(sakuraHealthSuccessPlugin.autoTranslationProviderFailures.has(sakuraHealthSuccessKey), false);
    assert.equal(sakuraHealthSuccessQueued, true);

    const sakuraHealthSwitchPlugin = new Plugin();
    sakuraHealthSwitchPlugin.settings.translation.provider = "sakuraLocal";
    sakuraHealthSwitchPlugin.settings.translation.apiKey = "";
    sakuraHealthSwitchPlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    let sakuraHealthSwitchQueued = false;
    sakuraHealthSwitchPlugin.queueScan = () => { sakuraHealthSwitchQueued = true; };
    sakuraHealthSwitchPlugin.fetchApiResponseText = async () => {
        sakuraHealthSwitchPlugin.settings.translation.provider = "deepseek";
        sakuraHealthSwitchPlugin.settings.translation.apiKey = "sk-switched";
        return JSON.stringify({ choices: [{ message: { content: "OK" } }] });
    };
    const sakuraHealthSwitchKey = sakuraHealthSwitchPlugin.getAutoTranslationProviderKey(sakuraHealthSwitchPlugin.getAutoTranslationOptions());
    assert.equal(sakuraHealthSwitchPlugin.shouldBlockAutoTranslationForLocalProviderHealth(sakuraHealthSwitchPlugin.getAutoTranslationOptions()), true);
    await sakuraHealthSwitchPlugin.localProviderHealthChecks.get(sakuraHealthSwitchKey);
    assert.equal(sakuraHealthSwitchPlugin.localProviderHealthyKeys.has(sakuraHealthSwitchKey), false);
    assert.equal(sakuraHealthSwitchPlugin.getApiStatus("translation").state, "testing");
    assert.equal(sakuraHealthSwitchQueued, false);

    const sakuraHealthFailurePlugin = new Plugin();
    sakuraHealthFailurePlugin.settings.translation.provider = "sakuraLocal";
    // Its own endpoint, as picking the provider in the settings sets it (not DeepSeek's default).
    sakuraHealthFailurePlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    sakuraHealthFailurePlugin.settings.translation.apiKey = "";
    sakuraHealthFailurePlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    sakuraHealthFailurePlugin.fetchApiResponseText = async () => {
        throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    };
    let sakuraHealthFailureRetryDelay = 0;
    sakuraHealthFailurePlugin.scheduleAutoTranslationRetryScan = delay => { sakuraHealthFailureRetryDelay = Math.max(sakuraHealthFailureRetryDelay, Number(delay) || 0); };
    const sakuraHealthFailureOptions = sakuraHealthFailurePlugin.getAutoTranslationOptions();
    const sakuraHealthFailureKey = sakuraHealthFailureOptions.providerKey;
    assert.equal(sakuraHealthFailurePlugin.shouldBlockAutoTranslationForLocalProviderHealth(sakuraHealthFailureOptions), true);
    await sakuraHealthFailurePlugin.localProviderHealthChecks.get(sakuraHealthFailureKey);
    assert.equal(sakuraHealthFailurePlugin.getApiStatus("translation").state, "failed");
    assert.equal(sakuraHealthFailurePlugin.getAutoTranslationProviderFailure(sakuraHealthFailureOptions).type, "local-unavailable");
    assert.ok(sakuraHealthFailureRetryDelay >= 60000);
    clearTimeout(sakuraHealthFailurePlugin.autoTranslationRetryTimer);
    sakuraHealthFailurePlugin.autoTranslationRetryTimer = null;
    sakuraHealthFailurePlugin.autoTranslationRetryAt = 0;

    const dedupePlugin = new Plugin();
    dedupePlugin.settings.translation.apiKey = "sk-dedupe";
    let fetchCount = 0;
    dedupePlugin.fetchApiResponseText = async () => {
        fetchCount++;
        return JSON.stringify({ choices: [{ message: { content: "deduped" } }] });
    };
    const [dedupedA, dedupedB] = await Promise.all([
        dedupePlugin.runModelTask("translation", "same text"),
        dedupePlugin.runModelTask("translation", "same text")
    ]);
    assert.equal(dedupedA, "deduped");
    assert.equal(dedupedB, "deduped");
    assert.equal(fetchCount, 1);
    assert.equal(dedupePlugin.translationRequests.size, 0);

    const googleRunReservationPlugin = new Plugin();
    googleRunReservationPlugin.settings.translation.provider = "googleCloud";
    googleRunReservationPlugin.settings.translation.targetLanguage = "English";
    googleRunReservationPlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|5\nbackup|AIza-backup|100";
    googleRunReservationPlugin.settings.googleTranslate.keys = googleRunReservationPlugin.normalizeGoogleTranslateKeyPool(googleRunReservationPlugin.settings.googleTranslate).keys;
    googleRunReservationPlugin.settings.googleTranslate.keys[0].usedChars = 2;
    const googleRunReservationEndpoints = [];
    let googleRunReservationReleaseFirst = null;
    googleRunReservationPlugin.fetchApiResponseText = (endpoint, request) => {
        googleRunReservationEndpoints.push(request.headers["X-Goog-Api-Key"]);
        if (request.body.q === "abc") {
            return new Promise(resolve => {
                googleRunReservationReleaseFirst = () => resolve(JSON.stringify({ data: { translations: [{ translatedText: "first" }] } }));
            });
        }
        return Promise.resolve(JSON.stringify({ data: { translations: [{ translatedText: "second" }] } }));
    };
    const googleRunReservationFirst = googleRunReservationPlugin.runModelTask("translation", "abc");
    assert.equal(googleRunReservationEndpoints[0], "AIza-main");
    assert.equal(googleRunReservationPlugin.getGoogleTranslateReservedChars(googleRunReservationPlugin.settings.googleTranslate.keys[0]), 3);
    const googleRunReservationSecond = await googleRunReservationPlugin.runModelTask("translation", "d");
    assert.equal(googleRunReservationSecond, "second");
    assert.equal(googleRunReservationEndpoints[1], "AIza-backup");
    assert.equal(googleRunReservationPlugin.settings.googleTranslate.keys[1].usedChars, 1);
    googleRunReservationReleaseFirst();
    assert.equal(await googleRunReservationFirst, "first");
    assert.equal(googleRunReservationPlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal([...googleRunReservationPlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleRunDedupePlugin = new Plugin();
    googleRunDedupePlugin.settings.translation.provider = "googleCloud";
    googleRunDedupePlugin.settings.translation.targetLanguage = "English";
    googleRunDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|5\nbackup|AIza-backup|100";
    googleRunDedupePlugin.settings.googleTranslate.keys = googleRunDedupePlugin.normalizeGoogleTranslateKeyPool(googleRunDedupePlugin.settings.googleTranslate).keys;
    googleRunDedupePlugin.settings.googleTranslate.keys[0].usedChars = 2;
    let googleRunDedupeFetches = 0;
    let googleRunDedupeRelease = null;
    googleRunDedupePlugin.fetchApiResponseText = () => {
        googleRunDedupeFetches++;
        return new Promise(resolve => {
            googleRunDedupeRelease = () => resolve(JSON.stringify({ data: { translations: [{ translatedText: "deduped-google" }] } }));
        });
    };
    const googleRunDedupeA = googleRunDedupePlugin.runModelTask("translation", "abc");
    const googleRunDedupeB = googleRunDedupePlugin.runModelTask("translation", "abc");
    assert.equal(googleRunDedupeFetches, 1);
    googleRunDedupeRelease();
    assert.equal(await googleRunDedupeA, "deduped-google");
    assert.equal(await googleRunDedupeB, "deduped-google");
    assert.equal(googleRunDedupePlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal(googleRunDedupePlugin.settings.googleTranslate.keys[1].usedChars, 0);

    const sakuraModelSwitchPlugin = new Plugin();
    sakuraModelSwitchPlugin.settings.translation.provider = "sakuraLocal";
    sakuraModelSwitchPlugin.settings.translation.apiKey = "";
    let sakuraModelStatusWrites = 0;
    sakuraModelSwitchPlugin.setApiRuntimeStatus = () => { sakuraModelStatusWrites++; };
    const sakuraModelSwitchKey = sakuraModelSwitchPlugin.getAutoTranslationProviderKey({ configOverrides: sakuraModelSwitchPlugin.settings.translation });
    sakuraModelSwitchPlugin.fetchApiResponseText = async () => {
        sakuraModelSwitchPlugin.settings.translation.provider = "deepseek";
        sakuraModelSwitchPlugin.settings.translation.apiKey = "sk-switched";
        return JSON.stringify({ choices: [{ message: { content: "translated after switch" } }] });
    };
    assert.equal(await sakuraModelSwitchPlugin.runModelTask("translation", "source before switch"), "translated after switch");
    assert.equal(sakuraModelSwitchPlugin.localProviderHealthyKeys.has(sakuraModelSwitchKey), false);
    assert.equal(sakuraModelStatusWrites, 0);

    const googleBatchPlugin = new Plugin();
    googleBatchPlugin.settings.translation.provider = "googleCloud";
    googleBatchPlugin.settings.translation.targetLanguage = "English";
    googleBatchPlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|450000";
    googleBatchPlugin.settings.googleTranslate.keys = googleBatchPlugin.normalizeGoogleTranslateKeyPool(googleBatchPlugin.settings.googleTranslate).keys;
    let googleBatchBody = null;
    googleBatchPlugin.fetchApiResponseText = async (_endpoint, request) => {
        googleBatchBody = request.body;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }, { translatedText: "world" }] } });
    };
    const googleBatchResult = await googleBatchPlugin.runAutoTranslationBatchTask(["你好", "世界"], googleBatchPlugin.getAutoTranslationOptions());
    assert.deepEqual(googleBatchBody, { q: ["你好", "世界"], target: "en", format: "text" });
    assert.deepEqual(googleBatchResult, ["hello", "world"]);
    assert.equal(googleBatchPlugin.settings.googleTranslate.keys[0].usedChars, 4);

    const googleConnectionTestPlugin = new Plugin();
    googleConnectionTestPlugin.settings.translation.provider = "googleCloud";
    googleConnectionTestPlugin.settings.translation.endpoint = "https://translation.googleapis.com/language/translate/v2";
    googleConnectionTestPlugin.settings.translation.model = "nmt";
    googleConnectionTestPlugin.settings.googleTranslate.keyPoolText = "main|AIza-test|450000";
    googleConnectionTestPlugin.settings.googleTranslate.keys = googleConnectionTestPlugin.normalizeGoogleTranslateKeyPool(googleConnectionTestPlugin.settings.googleTranslate).keys;
    const googleConnectionStates = [];
    googleConnectionTestPlugin.setApiStatus = (_status, state) => { googleConnectionStates.push(state); };
    googleConnectionTestPlugin.setButtonBusy = () => {};
    googleConnectionTestPlugin.showToast = () => {};
    googleConnectionTestPlugin.queueScan = () => {};
    googleConnectionTestPlugin.fetchApiResponseText = async (_endpoint, request) => {
        assert.equal(request.googleTranslate.charCount, 5);
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    };
    await googleConnectionTestPlugin.testApiConnection("translation", {}, {});
    assert.deepEqual(googleConnectionStates, ["testing", "success"]);
    assert.equal(googleConnectionTestPlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal([...googleConnectionTestPlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleConnectionLifecyclePlugin = new Plugin();
    googleConnectionLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleConnectionLifecyclePlugin.settings.translation.endpoint = "https://translation.googleapis.com/language/translate/v2";
    googleConnectionLifecyclePlugin.settings.translation.model = "nmt";
    googleConnectionLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-test-stop|450000";
    googleConnectionLifecyclePlugin.settings.googleTranslate.keys = googleConnectionLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleConnectionLifecyclePlugin.settings.googleTranslate).keys;
    const googleConnectionLifecycleStates = [];
    googleConnectionLifecyclePlugin.setApiStatus = (_status, state) => { googleConnectionLifecycleStates.push(state); };
    googleConnectionLifecyclePlugin.setButtonBusy = () => {};
    googleConnectionLifecyclePlugin.showToast = () => {};
    googleConnectionLifecyclePlugin.fetchApiResponseText = async () => {
        googleConnectionLifecyclePlugin.isStarted = false;
        googleConnectionLifecyclePlugin.lifecycleToken++;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    };
    await googleConnectionLifecyclePlugin.testApiConnection("translation", {}, {});
    assert.deepEqual(googleConnectionLifecycleStates, ["testing"]);
    assert.equal(googleConnectionLifecyclePlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal([...googleConnectionLifecyclePlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleBatchDedupePlugin = new Plugin();
    googleBatchDedupePlugin.settings.translation.provider = "googleCloud";
    googleBatchDedupePlugin.settings.translation.targetLanguage = "English";
    googleBatchDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-dedupe|450000";
    googleBatchDedupePlugin.settings.googleTranslate.keys = googleBatchDedupePlugin.normalizeGoogleTranslateKeyPool(googleBatchDedupePlugin.settings.googleTranslate).keys;
    let googleBatchDedupeFetches = 0;
    googleBatchDedupePlugin.fetchApiResponseText = async () => {
        googleBatchDedupeFetches++;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }, { translatedText: "world" }] } });
    };
    const [googleBatchDedupeA, googleBatchDedupeB] = await Promise.all([
        googleBatchDedupePlugin.runAutoTranslationBatchTask(["你好", "世界"], googleBatchDedupePlugin.getAutoTranslationOptions()),
        googleBatchDedupePlugin.runAutoTranslationBatchTask(["你好", "世界"], googleBatchDedupePlugin.getAutoTranslationOptions())
    ]);
    assert.deepEqual(googleBatchDedupeA, ["hello", "world"]);
    assert.deepEqual(googleBatchDedupeB, ["hello", "world"]);
    assert.equal(googleBatchDedupeFetches, 1);
    assert.equal(googleBatchDedupePlugin.translationRequests.size, 0);
    assert.equal([...googleBatchDedupePlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleBatchIntraDedupePlugin = new Plugin();
    googleBatchIntraDedupePlugin.settings.translation.provider = "googleCloud";
    googleBatchIntraDedupePlugin.settings.translation.targetLanguage = "English";
    googleBatchIntraDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-intra|450000";
    googleBatchIntraDedupePlugin.settings.googleTranslate.keys = googleBatchIntraDedupePlugin.normalizeGoogleTranslateKeyPool(googleBatchIntraDedupePlugin.settings.googleTranslate).keys;
    let googleBatchIntraBody = null;
    googleBatchIntraDedupePlugin.fetchApiResponseText = async (_endpoint, request) => {
        googleBatchIntraBody = request.body;
        return JSON.stringify({ data: { translations: [{ translatedText: "AA" }, { translatedText: "BBB" }] } });
    };
    const googleBatchIntraResult = await googleBatchIntraDedupePlugin.runAutoTranslationBatchTask(["aa", "aa", "bbb"], googleBatchIntraDedupePlugin.getAutoTranslationOptions());
    assert.deepEqual(googleBatchIntraBody, { q: ["aa", "bbb"], target: "en", format: "text" });
    assert.deepEqual(googleBatchIntraResult, ["AA", "AA", "BBB"]);
    assert.equal(googleBatchIntraDedupePlugin.settings.googleTranslate.keys[0].usedChars, 5);

    const googleBatchExactQuotaDedupePlugin = new Plugin();
    googleBatchExactQuotaDedupePlugin.settings.translation.provider = "googleCloud";
    googleBatchExactQuotaDedupePlugin.settings.translation.targetLanguage = "English";
    googleBatchExactQuotaDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-exact|2";
    googleBatchExactQuotaDedupePlugin.settings.googleTranslate.keys = googleBatchExactQuotaDedupePlugin.normalizeGoogleTranslateKeyPool(googleBatchExactQuotaDedupePlugin.settings.googleTranslate).keys;
    let googleBatchExactQuotaFetches = 0;
    googleBatchExactQuotaDedupePlugin.fetchApiResponseText = async () => {
        googleBatchExactQuotaFetches++;
        return JSON.stringify({ data: { translations: [{ translatedText: "a" }, { translatedText: "b" }] } });
    };
    const [googleBatchExactA, googleBatchExactB] = await Promise.all([
        googleBatchExactQuotaDedupePlugin.runAutoTranslationBatchTask(["a", "b"], googleBatchExactQuotaDedupePlugin.getAutoTranslationOptions()),
        googleBatchExactQuotaDedupePlugin.runAutoTranslationBatchTask(["a", "b"], googleBatchExactQuotaDedupePlugin.getAutoTranslationOptions())
    ]);
    assert.deepEqual(googleBatchExactA, ["a", "b"]);
    assert.deepEqual(googleBatchExactB, ["a", "b"]);
    assert.equal(googleBatchExactQuotaFetches, 1);
    assert.equal(googleBatchExactQuotaDedupePlugin.settings.googleTranslate.keys[0].usedChars, 2);

    const googleQuotaTypedPlugin = new Plugin();
    googleQuotaTypedPlugin.settings.translation.provider = "googleCloud";
    googleQuotaTypedPlugin.settings.translation.targetLanguage = "English";
    googleQuotaTypedPlugin.settings.googleTranslate.keyPoolText = "main|AIza-quota|2";
    googleQuotaTypedPlugin.settings.googleTranslate.keys = googleQuotaTypedPlugin.normalizeGoogleTranslateKeyPool(googleQuotaTypedPlugin.settings.googleTranslate).keys;
    googleQuotaTypedPlugin.settings.googleTranslate.keys[0].usedChars = 2;
    let googleQuotaTypedError = null;
    assert.throws(
        () => googleQuotaTypedPlugin.buildGoogleTranslateRequest("x", googleQuotaTypedPlugin.settings.translation),
        error => {
            googleQuotaTypedError = error;
            return error.googleTranslateQuotaExceeded === true
                && googleQuotaTypedPlugin.getAutoTranslationFailureType(error) === "quota"
                && error.retryAfterMs > 120000;
        }
    );
    googleQuotaTypedPlugin.markAutoTranslationProviderFailure(googleQuotaTypedPlugin.getAutoTranslationOptions(), googleQuotaTypedError);
    assert.equal(googleQuotaTypedPlugin.getAutoTranslationProviderFailure(googleQuotaTypedPlugin.getAutoTranslationOptions()).type, "quota");
    assert.equal(googleQuotaTypedPlugin.getApiStatus("translation").state, "failed");

    const googleStatusRecoveryPlugin = new Plugin();
    googleStatusRecoveryPlugin.settings.translation.provider = "googleCloud";
    googleStatusRecoveryPlugin.settings.translation.targetLanguage = "English";
    googleStatusRecoveryPlugin.settings.translation.apiStatus = { state: "failed", message: "quota" };
    googleStatusRecoveryPlugin.settings.googleTranslate.keyPoolText = "main|AIza-recover|450000";
    googleStatusRecoveryPlugin.settings.googleTranslate.keys = googleStatusRecoveryPlugin.normalizeGoogleTranslateKeyPool(googleStatusRecoveryPlugin.settings.googleTranslate).keys;
    googleStatusRecoveryPlugin.autoTranslationProviderFailures.set(googleStatusRecoveryPlugin.getAutoTranslationProviderKey(googleStatusRecoveryPlugin.getAutoTranslationOptions()), { type: "quota", retryAt: Date.now() + 60000 });
    googleStatusRecoveryPlugin.fetchApiResponseText = async () => JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    assert.equal(await googleStatusRecoveryPlugin.runModelTask("translation", "abc"), "hello");
    assert.equal(Boolean(googleStatusRecoveryPlugin.getAutoTranslationProviderFailure(googleStatusRecoveryPlugin.getAutoTranslationOptions())), false);
    assert.equal(googleStatusRecoveryPlugin.getApiStatus("translation").state, "success");

    const googleRuntimeDirtyPlugin = new Plugin();
    googleRuntimeDirtyPlugin.settings.googleTranslate.keyPoolText = "main|AIza-dirty|450000";
    googleRuntimeDirtyPlugin.settings.googleTranslate.keys = googleRuntimeDirtyPlugin.normalizeGoogleTranslateKeyPool(googleRuntimeDirtyPlugin.settings.googleTranslate).keys;
    let googleRuntimeSaveAttempts = 0;
    googleRuntimeDirtyPlugin.saveData = key => {
        if (key !== "settings") return true;
        googleRuntimeSaveAttempts++;
        return googleRuntimeSaveAttempts > 1;
    };
    googleRuntimeDirtyPlugin.markGoogleTranslateKeyUsage("AIza-dirty", 2);
    assert.equal(googleRuntimeDirtyPlugin.googleTranslateRuntimeDirty, true);
    assert.equal(googleRuntimeDirtyPlugin.flushGoogleTranslateRuntimeState({ retryOnError: false }), false);
    assert.equal(googleRuntimeDirtyPlugin.googleTranslateRuntimeDirty, true);
    assert.equal(googleRuntimeDirtyPlugin.flushGoogleTranslateRuntimeState({ retryOnError: false }), true);
    assert.equal(googleRuntimeDirtyPlugin.googleTranslateRuntimeDirty, false);
    assert.equal(googleRuntimeDirtyPlugin.settings.googleTranslate.keys[0].usedChars, 2);

    const googleRuntimeCoalescePlugin = new Plugin();
    googleRuntimeCoalescePlugin.settings.googleTranslate.keyPoolText = "main|AIza-coalesce|450000";
    googleRuntimeCoalescePlugin.settings.googleTranslate.keys = googleRuntimeCoalescePlugin.normalizeGoogleTranslateKeyPool(googleRuntimeCoalescePlugin.settings.googleTranslate).keys;
    let googleRuntimeCoalesceSaves = 0;
    googleRuntimeCoalescePlugin.saveData = key => {
        if (key === "settings") googleRuntimeCoalesceSaves++;
        return true;
    };
    googleRuntimeCoalescePlugin.markGoogleTranslateKeyUsage("AIza-coalesce", 3);
    googleRuntimeCoalescePlugin.markGoogleTranslateKeyUsage("AIza-coalesce", 4);
    assert.equal(googleRuntimeCoalesceSaves, 0);
    assert.equal(googleRuntimeCoalescePlugin.googleTranslateRuntimeDirty, true);
    assert.ok(googleRuntimeCoalescePlugin.googleTranslateRuntimeDirtyTimer);
    assert.equal(googleRuntimeCoalescePlugin.flushGoogleTranslateRuntimeState({ retryOnError: false }), true);
    assert.equal(googleRuntimeCoalesceSaves, 1);
    assert.equal(googleRuntimeCoalescePlugin.settings.googleTranslate.keys[0].usedChars, 7);
    assert.equal(googleRuntimeCoalescePlugin.googleTranslateRuntimeDirty, false);

    const googleSingleLifecyclePlugin = new Plugin();
    googleSingleLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleSingleLifecyclePlugin.settings.translation.targetLanguage = "English";
    googleSingleLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-single|450000";
    googleSingleLifecyclePlugin.settings.googleTranslate.keys = googleSingleLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleSingleLifecyclePlugin.settings.googleTranslate).keys;
    googleSingleLifecyclePlugin.fetchApiResponseText = async () => {
        googleSingleLifecyclePlugin.isStarted = false;
        googleSingleLifecyclePlugin.lifecycleToken++;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    };
    assert.equal(await googleSingleLifecyclePlugin.runModelTask("translation", "abc"), "hello");
    assert.equal(googleSingleLifecyclePlugin.settings.googleTranslate.keys[0].usedChars, 3);

    const googleBatchLifecyclePlugin = new Plugin();
    googleBatchLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleBatchLifecyclePlugin.settings.translation.targetLanguage = "English";
    googleBatchLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-batch|450000";
    googleBatchLifecyclePlugin.settings.googleTranslate.keys = googleBatchLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleBatchLifecyclePlugin.settings.googleTranslate).keys;
    googleBatchLifecyclePlugin.fetchApiResponseText = async () => {
        googleBatchLifecyclePlugin.isStarted = false;
        googleBatchLifecyclePlugin.lifecycleToken++;
        return JSON.stringify({ data: { translations: [{ translatedText: "one" }, { translatedText: "two" }] } });
    };
    assert.deepEqual(await googleBatchLifecyclePlugin.runAutoTranslationBatchTask(["one", "two"], googleBatchLifecyclePlugin.getAutoTranslationOptions()), ["one", "two"]);
    assert.equal(googleBatchLifecyclePlugin.settings.googleTranslate.keys[0].usedChars, 6);

    const googleBatchFailureLifecyclePlugin = new Plugin();
    googleBatchFailureLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleBatchFailureLifecyclePlugin.settings.translation.targetLanguage = "English";
    googleBatchFailureLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-fail|450000";
    googleBatchFailureLifecyclePlugin.settings.googleTranslate.keys = googleBatchFailureLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleBatchFailureLifecyclePlugin.settings.googleTranslate).keys;
    googleBatchFailureLifecyclePlugin.fetchApiResponseText = async (_endpoint, request) => {
        googleBatchFailureLifecyclePlugin.isStarted = false;
        googleBatchFailureLifecyclePlugin.lifecycleToken++;
        throw Object.assign(new Error("quota"), {
            googleTranslateApiKey: request.googleTranslate.apiKey,
            googleTranslateQuotaExceeded: true,
            retryAfterMs: 60000
        });
    };
    await assert.rejects(
        googleBatchFailureLifecyclePlugin.runAutoTranslationBatchTask(["one"], googleBatchFailureLifecyclePlugin.getAutoTranslationOptions()),
        /quota/
    );
    assert.ok(googleBatchFailureLifecyclePlugin.settings.googleTranslate.keys[0].cooldownUntil > Date.now());
    assert.match(googleBatchFailureLifecyclePlugin.settings.googleTranslate.keys[0].lastError, /quota/);

    const longHeartbeatPlugin = new Plugin();
    let longHeartbeatCount = 0;
    longHeartbeatPlugin.isUltraLongAutoTranslationText = () => true;
    longHeartbeatPlugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three"];
    longHeartbeatPlugin.runAutoTranslationTaskWithOptions = async text => ({
        "chunk one": "\u5df2\u7ffb\u8bd1\u7b2c\u4e00\u6bb5",
        "chunk two": "\u5df2\u7ffb\u8bd1\u7b2c\u4e8c\u6bb5",
        "chunk three": "\u5df2\u7ffb\u8bd1\u7b2c\u4e09\u6bb5"
    }[text] || "\u5df2\u7ffb\u8bd1");
    longHeartbeatPlugin.isInvalidAutoTranslationOutput = () => false;
    const longHeartbeatResult = await longHeartbeatPlugin.runLongAutoTranslationTask("very long source", longHeartbeatPlugin.getAutoTranslationOptions(), {
        heartbeat: () => { longHeartbeatCount++; }
    });
    assert.equal(longHeartbeatResult, "\u5df2\u7ffb\u8bd1\u7b2c\u4e00\u6bb5\n\n\u5df2\u7ffb\u8bd1\u7b2c\u4e8c\u6bb5\n\n\u5df2\u7ffb\u8bd1\u7b2c\u4e09\u6bb5");
    assert.equal(longHeartbeatCount, 6);

    const polishFlowPlugin = new Plugin();
    const polishFlowTextbox = { isConnected: true, text: "original draft" };
    const polishFlowInputs = [];
    polishFlowPlugin.getActiveTextbox = () => polishFlowTextbox;
    polishFlowPlugin.getElementText = textbox => textbox.text;
    polishFlowPlugin.runModelTask = async (_kind, input) => {
        polishFlowInputs.push(input);
        return `polished ${polishFlowInputs.length}`;
    };
    polishFlowPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishFlowTextbox.text = text;
        return { ok: true };
    };
    polishFlowPlugin.showRestoreOriginalControl = () => {};
    polishFlowPlugin.setButtonBusy = () => {};
    await polishFlowPlugin.polishCurrentDraft();
    await polishFlowPlugin.polishCurrentDraft();
    assert.deepEqual(polishFlowInputs, ["original draft", "original draft"]);
    assert.equal(polishFlowTextbox.text, "polished 2");
    polishFlowPlugin.settings.polish.repolishSource = "lastResult";
    await polishFlowPlugin.polishCurrentDraft();
    assert.equal(polishFlowInputs[2], "polished 2");

    const polishNoAutoBilingualPlugin = new Plugin();
    const polishNoAutoBilingualTextbox = { isConnected: true, text: "raw draft" };
    const polishNoAutoBilingualCalls = [];
    polishNoAutoBilingualPlugin.getActiveTextbox = () => polishNoAutoBilingualTextbox;
    polishNoAutoBilingualPlugin.getElementText = textbox => textbox.text;
    polishNoAutoBilingualPlugin.runModelTask = async (kind, input) => {
        polishNoAutoBilingualCalls.push({ kind, input });
        return "polished draft";
    };
    polishNoAutoBilingualPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishNoAutoBilingualTextbox.text = text;
        return { ok: true };
    };
    polishNoAutoBilingualPlugin.showRestoreOriginalControl = () => {};
    polishNoAutoBilingualPlugin.setButtonBusy = () => {};
    await polishNoAutoBilingualPlugin.polishCurrentDraft();
    assert.deepEqual(polishNoAutoBilingualCalls, [{ kind: "polish", input: "raw draft" }]);
    assert.equal(polishNoAutoBilingualTextbox.text, "polished draft");

    const polishAutoBilingualPlugin = new Plugin();
    polishAutoBilingualPlugin.settings.polish.apiKey = "sk-public";
    polishAutoBilingualPlugin.settings.ui.publicBilingualAfterPolish = true;
    polishAutoBilingualPlugin.settings.ui.publicBilingualUseInitialOriginal = true;
    const polishAutoBilingualTextbox = { isConnected: true, text: "raw draft" };
    const polishAutoBilingualCalls = [];
    const polishAutoBilingualWrites = [];
    polishAutoBilingualPlugin.getActiveTextbox = () => polishAutoBilingualTextbox;
    polishAutoBilingualPlugin.getElementText = textbox => textbox.text;
    polishAutoBilingualPlugin.isInvalidAutoTranslationOutput = () => false;
    polishAutoBilingualPlugin.runModelTask = async (kind, input) => {
        polishAutoBilingualCalls.push({ kind, input });
        return kind === "polish" ? "polished draft" : "translated draft";
    };
    polishAutoBilingualPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishAutoBilingualWrites.push(text);
        polishAutoBilingualTextbox.text = text;
        return { ok: true };
    };
    polishAutoBilingualPlugin.showRestoreOriginalControl = () => { throw new Error("auto bilingual should not show polish restore before final write"); };
    polishAutoBilingualPlugin.showToast = () => {};
    polishAutoBilingualPlugin.setButtonBusy = () => {};
    await polishAutoBilingualPlugin.polishCurrentDraft();
    assert.deepEqual(polishAutoBilingualCalls, [
        { kind: "polish", input: "raw draft" },
        { kind: "translation", input: "polished draft" }
    ]);
    assert.deepEqual(polishAutoBilingualWrites, [
        "polished draft",
        "translated draft\n\n||raw draft||"
    ]);
    assert.equal(polishAutoBilingualTextbox.text, "translated draft\n\n||raw draft||");

    const polishAutoBilingualFailurePlugin = new Plugin();
    polishAutoBilingualFailurePlugin.settings.polish.apiKey = "sk-public";
    polishAutoBilingualFailurePlugin.settings.ui.publicBilingualAfterPolish = true;
    const polishAutoBilingualFailureTextbox = { isConnected: true, text: "raw draft" };
    let polishAutoBilingualFailureRestoreShown = false;
    polishAutoBilingualFailurePlugin.getActiveTextbox = () => polishAutoBilingualFailureTextbox;
    polishAutoBilingualFailurePlugin.getElementText = textbox => textbox.text;
    polishAutoBilingualFailurePlugin.runModelTask = async kind => {
        if (kind === "polish") return "polished draft";
        throw new Error("translation failed");
    };
    polishAutoBilingualFailurePlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishAutoBilingualFailureTextbox.text = text;
        return { ok: true };
    };
    polishAutoBilingualFailurePlugin.showRestoreOriginalControl = () => { polishAutoBilingualFailureRestoreShown = true; };
    polishAutoBilingualFailurePlugin.showToast = () => {};
    polishAutoBilingualFailurePlugin.setButtonBusy = () => {};
    await polishAutoBilingualFailurePlugin.polishCurrentDraft();
    assert.equal(polishAutoBilingualFailureTextbox.text, "polished draft");
    assert.equal(polishAutoBilingualFailureRestoreShown, true);

    const polishStaleInputPlugin = new Plugin();
    const polishStaleTextbox = { isConnected: true, text: "old draft" };
    let polishStaleReplaceCalled = false;
    let polishStalePanelText = "";
    polishStaleInputPlugin.getActiveTextbox = () => polishStaleTextbox;
    polishStaleInputPlugin.getElementText = textbox => textbox.text;
    polishStaleInputPlugin.runModelTask = async () => {
        polishStaleTextbox.text = "new typing";
        return "polished old draft";
    };
    polishStaleInputPlugin.replaceTextboxTextSafelyAsync = async () => {
        polishStaleReplaceCalled = true;
        return { ok: true };
    };
    polishStaleInputPlugin.showPolishResultPanel = (_textbox, text) => { polishStalePanelText = text; };
    polishStaleInputPlugin.showRestoreOriginalControl = () => { throw new Error("stale polish should not show restore control"); };
    polishStaleInputPlugin.setButtonBusy = () => {};
    await polishStaleInputPlugin.polishCurrentDraft();
    assert.equal(polishStaleReplaceCalled, false);
    assert.equal(polishStaleTextbox.text, "new typing");
    assert.equal(polishStalePanelText, "polished old draft");
    assert.equal(polishStaleInputPlugin.polishSession.lastResult, "polished old draft");
    assert.equal(polishStaleInputPlugin.polishSession.lastWrittenText, "");

    const composerGuardPlugin = new Plugin();
    const composerGuardTextbox = {
        tagName: "TEXTAREA",
        value: "draft",
        isConnected: true,
        dataset: {},
        parentElement: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
        focus() {}
    };
    const cancelledToken = composerGuardPlugin.composerWriter.beginWrite(composerGuardTextbox, "draft");
    composerGuardPlugin.composerWriter.cancelWriteToken(cancelledToken, "user-input");
    const cancelledWrite = await composerGuardPlugin.composerWriter.replaceTextSafely(composerGuardTextbox, "polished", {
        expectedPreviousText: "draft",
        writeToken: cancelledToken
    });
    assert.equal(cancelledWrite.ok, false);
    assert.equal(composerGuardTextbox.value, "draft");
    const staleToken = composerGuardPlugin.composerWriter.beginWrite(composerGuardTextbox, "draft");
    composerGuardTextbox.value = "manual edit";
    const staleWrite = await composerGuardPlugin.composerWriter.replaceTextSafely(composerGuardTextbox, "polished", {
        expectedPreviousText: "draft",
        writeToken: staleToken
    });
    assert.equal(staleWrite.ok, false);
    assert.equal(staleWrite.reason, "stale-input");
    assert.equal(composerGuardTextbox.value, "manual edit");
    composerGuardPlugin.composerWriter.finishWriteToken(staleToken);

    const targetedPolishPlugin = new Plugin();
    const activeComposerRoot = { dataset: { daitComposerKey: "active-composer" } };
    const targetComposerRoot = { dataset: { daitComposerKey: "target-composer" } };
    const activeComposerTextbox = { isConnected: true, text: "active draft", parentElement: activeComposerRoot };
    const targetComposerTextbox = { isConnected: true, text: "target draft", parentElement: targetComposerRoot };
    let targetedPolishTextbox = null;
    targetedPolishPlugin.getActiveTextbox = () => activeComposerTextbox;
    targetedPolishPlugin.getElementText = textbox => textbox.text;
    targetedPolishPlugin.runModelTask = async () => "target polished";
    targetedPolishPlugin.replaceTextboxTextSafelyAsync = async (textbox, text) => {
        targetedPolishTextbox = textbox;
        textbox.text = text;
        return { ok: true };
    };
    targetedPolishPlugin.showRestoreOriginalControl = () => {};
    targetedPolishPlugin.setButtonBusy = () => {};
    await targetedPolishPlugin.polishCurrentDraft(null, {
        textbox: targetComposerTextbox,
        composerKey: targetedPolishPlugin.getTextboxComposerKey(targetComposerTextbox)
    });
    assert.equal(targetedPolishTextbox, targetComposerTextbox);
    assert.equal(activeComposerTextbox.text, "active draft");
    assert.equal(targetComposerTextbox.text, "target polished");

    const restoreComposerPlugin = new Plugin();
    const restoreRootA = { dataset: { daitComposerKey: "restore-a" } };
    const restoreRootB = { dataset: { daitComposerKey: "restore-b" } };
    const restoreTextboxA = { isConnected: true, text: "polished same", parentElement: restoreRootA };
    const restoreTextboxB = { isConnected: true, text: "polished same", parentElement: restoreRootB };
    restoreComposerPlugin.getElementText = textbox => textbox.text;
    const restoreSessionA = restoreComposerPlugin.createPolishSession(restoreTextboxA, "original a");
    restoreSessionA.lastWrittenRawText = "polished same";
    restoreSessionA.lastWrittenText = "polished same";
    assert.equal(restoreComposerPlugin.canRestorePolishOriginal(restoreTextboxA, restoreSessionA), true);
    assert.equal(restoreComposerPlugin.canRestorePolishOriginal(restoreTextboxB, restoreSessionA), false);

    const restoreTokenPlugin = new Plugin();
    const restoreTokenTextbox = {
        tagName: "TEXTAREA",
        value: "polished token",
        isConnected: true,
        dataset: {},
        parentElement: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
        focus() {}
    };
    const restoreTokenSession = restoreTokenPlugin.createPolishSession(restoreTokenTextbox, "original token");
    restoreTokenSession.lastWrittenRawText = "polished token";
    restoreTokenSession.lastWrittenText = "polished token";
    let restoreTokenWriteOptions = null;
    let restoreTokenPanelShown = false;
    restoreTokenPlugin.replaceTextboxTextSafelyAsync = async (_textbox, _text, options) => {
        restoreTokenWriteOptions = options;
        restoreTokenTextbox.value = "manual during restore";
        restoreTokenPlugin.composerWriter.cancelWriteToken(options.writeToken, "user-input");
        return { ok: false, reason: "write-cancelled" };
    };
    restoreTokenPlugin.showPolishResultPanel = () => { restoreTokenPanelShown = true; };
    restoreTokenPlugin.showToast = () => {};
    restoreTokenPlugin.injectInputButtons = () => {};
    const restoreTokenResult = await restoreTokenPlugin.restorePolishOriginal(restoreTokenTextbox, restoreTokenSession);
    assert.equal(restoreTokenResult, false);
    assert.ok(restoreTokenWriteOptions.writeToken);
    assert.equal(restoreTokenWriteOptions.expectedPreviousText, "polished token");
    assert.equal(restoreTokenTextbox.value, "manual during restore");
    assert.equal(restoreTokenPanelShown, true);

    const atomicCancelPlugin = new Plugin();
    const atomicCancelTextbox = { isConnected: true };
    const atomicCancelToken = atomicCancelPlugin.composerWriter.beginWrite(atomicCancelTextbox, "old rich");
    atomicCancelPlugin.getTextboxRawTextSafe = () => "old rich";
    atomicCancelPlugin.prepareTextboxFullReplacementSelection = async () => true;
    atomicCancelPlugin.dispatchTextboxPaste = () => true;
    atomicCancelPlugin.dispatchTextboxBeforeInput = () => true;
    atomicCancelPlugin.waitForTextboxStableTextEqual = async () => {
        atomicCancelPlugin.composerWriter.cancelWriteToken(atomicCancelToken, "user-input");
        return true;
    };
    assert.equal(await atomicCancelPlugin.replaceDiscordRichTextboxTextAtomically(atomicCancelTextbox, "new rich", {
        expectedPreviousText: "old rich",
        writeToken: atomicCancelToken
    }), false);

    const polishLifecycleStalePlugin = new Plugin();
    const polishLifecycleTextbox = { isConnected: true, text: "old draft" };
    let polishLifecycleReplaceCalled = false;
    let polishLifecyclePanelShown = false;
    let polishLifecycleRestoreShown = false;
    const polishLifecycleBusyStates = [];
    polishLifecycleStalePlugin.getActiveTextbox = () => polishLifecycleTextbox;
    polishLifecycleStalePlugin.getElementText = textbox => textbox.text;
    polishLifecycleStalePlugin.runModelTask = async () => {
        polishLifecycleStalePlugin.isStarted = false;
        polishLifecycleStalePlugin.lifecycleToken++;
        return "polished after stop";
    };
    polishLifecycleStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        polishLifecycleReplaceCalled = true;
        return { ok: true };
    };
    polishLifecycleStalePlugin.showPolishResultPanel = () => { polishLifecyclePanelShown = true; };
    polishLifecycleStalePlugin.showRestoreOriginalControl = () => { polishLifecycleRestoreShown = true; };
    polishLifecycleStalePlugin.setButtonBusy = (_button, busy) => polishLifecycleBusyStates.push(busy);
    await polishLifecycleStalePlugin.polishCurrentDraft();
    assert.equal(polishLifecycleReplaceCalled, false);
    assert.equal(polishLifecyclePanelShown, false);
    assert.equal(polishLifecycleRestoreShown, false);
    assert.equal(polishLifecycleTextbox.text, "old draft");
    assert.deepEqual(polishLifecycleBusyStates, [true]);

    const polishSubmitTimerPlugin = new Plugin();
    polishSubmitTimerPlugin.settings.polish.afterAction = "confirmSend";
    const polishSubmitTimerTextbox = { isConnected: true, text: "send draft" };
    const polishSubmitCallbacks = [];
    const polishSubmitCleared = [];
    let polishSubmitCount = 0;
    const savedWindowForPolishSubmit = global.window;
    const savedDocumentForPolishSubmit = global.document;
    const savedSetTimeoutForPolishSubmit = global.setTimeout;
    const savedClearTimeoutForPolishSubmit = global.clearTimeout;
    global.window = {
        confirm: () => true,
        removeEventListener() {}
    };
global.document = {
    removeEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => []
};
    global.setTimeout = callback => {
        polishSubmitCallbacks.push(callback);
        return polishSubmitCallbacks.length;
    };
    global.clearTimeout = id => polishSubmitCleared.push(id);
    polishSubmitTimerPlugin.getActiveTextbox = () => polishSubmitTimerTextbox;
    polishSubmitTimerPlugin.getElementText = textbox => textbox.text;
    polishSubmitTimerPlugin.runModelTask = async () => "send polished";
    polishSubmitTimerPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishSubmitTimerTextbox.text = text;
        return { ok: true };
    };
    polishSubmitTimerPlugin.showRestoreOriginalControl = () => {};
    polishSubmitTimerPlugin.submitTextbox = () => { polishSubmitCount++; };
    polishSubmitTimerPlugin.setButtonBusy = () => {};
    await polishSubmitTimerPlugin.polishCurrentDraft();
    assert.equal(polishSubmitTimerPlugin.polishSubmitTimer, 1);
    polishSubmitTimerPlugin.stop();
    assert.equal(polishSubmitCleared.includes(1), true);
    polishSubmitCallbacks.forEach(callback => callback());
    assert.equal(polishSubmitCount, 0);
    global.window = savedWindowForPolishSubmit;
    global.document = savedDocumentForPolishSubmit;
    global.setTimeout = savedSetTimeoutForPolishSubmit;
    global.clearTimeout = savedClearTimeoutForPolishSubmit;

    const polishWhitespaceStalePlugin = new Plugin();
    const polishWhitespaceTextbox = { isConnected: true, text: "old  draft" };
    let polishWhitespaceReplaceCalled = false;
    polishWhitespaceStalePlugin.getActiveTextbox = () => polishWhitespaceTextbox;
    polishWhitespaceStalePlugin.getElementText = textbox => textbox.text;
    polishWhitespaceStalePlugin.runModelTask = async () => {
        polishWhitespaceTextbox.text = "old draft";
        return "polished whitespace draft";
    };
    polishWhitespaceStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        polishWhitespaceReplaceCalled = true;
        return { ok: true };
    };
    polishWhitespaceStalePlugin.showPolishResultPanel = () => {};
    polishWhitespaceStalePlugin.showRestoreOriginalControl = () => {};
    polishWhitespaceStalePlugin.setButtonBusy = () => {};
    await polishWhitespaceStalePlugin.polishCurrentDraft();
    assert.equal(polishWhitespaceReplaceCalled, false);
    assert.equal(polishWhitespaceTextbox.text, "old draft");

    const polishFallbackPlugin = new Plugin();
    const polishFallbackTextbox = { isConnected: true, text: "fallback original" };
    let polishFallbackPanelText = "";
    polishFallbackPlugin.getActiveTextbox = () => polishFallbackTextbox;
    polishFallbackPlugin.getElementText = textbox => textbox.text;
    polishFallbackPlugin.runModelTask = async () => "fallback polished";
    polishFallbackPlugin.replaceTextboxTextSafelyAsync = async () => ({ ok: false, reason: "verification-failed" });
    polishFallbackPlugin.showPolishResultPanel = (_textbox, text) => { polishFallbackPanelText = text; };
    polishFallbackPlugin.setButtonBusy = () => {};
    await polishFallbackPlugin.polishCurrentDraft();
    assert.equal(polishFallbackPanelText, "fallback polished");
    assert.equal(polishFallbackPlugin.polishSession.lastResult, "fallback polished");
    assert.equal(polishFallbackPlugin.polishSession.lastWrittenText, "");

    const publicFormatPlugin = new Plugin();
    assert.equal(publicFormatPlugin.formatPublicBilingualMessage("hello", "你好"), "hello\n\n||你好||");
    assert.equal(publicFormatPlugin.formatPublicBilingualMessage("hello", "a || b"), "hello\n\n||a \\|\\| b||");
    assert.equal(publicFormatPlugin.formatPublicBilingualMessage("a || b", " raw\n\n  original "), "a \\|\\| b\n\n|| raw\n\n  original ||");

    const publicFlowPlugin = new Plugin();
    publicFlowPlugin.settings.polish.apiKey = "sk-public";
    const publicFlowTextbox = { isConnected: true, text: "你好 || 原文" };
    const publicFlowRequests = [];
    let publicFlowWritten = "";
    const publicFlowToasts = [];
    publicFlowPlugin.getActiveTextbox = () => publicFlowTextbox;
    publicFlowPlugin.getElementText = textbox => textbox.text;
    publicFlowPlugin.runModelTask = async (kind, input, options) => {
        publicFlowRequests.push({ kind, input, options });
        return "hello can you help me with this";
    };
    publicFlowPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicFlowWritten = text;
        publicFlowTextbox.text = text;
        return { ok: true };
    };
    publicFlowPlugin.showToast = (text, type) => publicFlowToasts.push({ text, type });
    publicFlowPlugin.setButtonBusy = () => {};
    await publicFlowPlugin.publicBilingualCurrentDraft();
    assert.equal(publicFlowRequests.length, 1);
    assert.equal(publicFlowRequests[0].kind, "translation");
    assert.equal(publicFlowRequests[0].input, "你好 || 原文");
    assert.match(publicFlowRequests[0].options.configOverrides.prompt, /Public bilingual outgoing Discord message mode/);
    assert.equal(publicFlowWritten, "hello can you help me with this\n\n||你好 \\|\\| 原文||");
    assert.equal(publicFlowToasts.some(toast => toast.type === "success"), false);

    const publicAutoPolishPlugin = new Plugin();
    publicAutoPolishPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    publicAutoPolishPlugin.settings.ui.publicBilingualUseInitialOriginal = true;
    const publicAutoPolishTextbox = { isConnected: true, text: "raw draft" };
    const publicAutoPolishCalls = [];
    let publicAutoPolishWritten = "";
    publicAutoPolishPlugin.getActiveTextbox = () => publicAutoPolishTextbox;
    publicAutoPolishPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishPlugin.runModelTask = async (kind, input) => {
        publicAutoPolishCalls.push({ kind, input });
        return kind === "polish" ? "polished draft" : "translated draft";
    };
    publicAutoPolishPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishWritten = text;
        publicAutoPolishTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishPlugin.showToast = () => {};
    publicAutoPolishPlugin.setButtonBusy = () => {};
    await publicAutoPolishPlugin.publicBilingualCurrentDraft();
    assert.deepEqual(publicAutoPolishCalls, [
        { kind: "polish", input: "raw draft" },
        { kind: "translation", input: "polished draft" }
    ]);
    assert.equal(publicAutoPolishWritten, "translated draft\n\n||raw draft||");

    const publicAutoPolishRawOriginalPlugin = new Plugin();
    publicAutoPolishRawOriginalPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishRawOriginalPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    publicAutoPolishRawOriginalPlugin.settings.ui.publicBilingualUseInitialOriginal = true;
    const publicAutoPolishRawTextbox = { isConnected: true, text: " raw\n\n  draft " };
    let publicAutoPolishRawWritten = "";
    publicAutoPolishRawOriginalPlugin.getActiveTextbox = () => publicAutoPolishRawTextbox;
    publicAutoPolishRawOriginalPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishRawOriginalPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishRawOriginalPlugin.runModelTask = async kind => kind === "polish" ? "polished draft" : "translated draft";
    publicAutoPolishRawOriginalPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishRawWritten = text;
        publicAutoPolishRawTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishRawOriginalPlugin.showToast = () => {};
    publicAutoPolishRawOriginalPlugin.setButtonBusy = () => {};
    await publicAutoPolishRawOriginalPlugin.publicBilingualCurrentDraft();
    assert.equal(publicAutoPolishRawWritten, "translated draft\n\n|| raw\n\n  draft ||");

    const publicAutoPolishNoInitialPlugin = new Plugin();
    publicAutoPolishNoInitialPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishNoInitialPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    const publicAutoPolishNoInitialTextbox = { isConnected: true, text: "raw draft" };
    let publicAutoPolishNoInitialWritten = "";
    publicAutoPolishNoInitialPlugin.getActiveTextbox = () => publicAutoPolishNoInitialTextbox;
    publicAutoPolishNoInitialPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishNoInitialPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishNoInitialPlugin.runModelTask = async kind => kind === "polish" ? "polished draft" : "translated draft";
    publicAutoPolishNoInitialPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishNoInitialWritten = text;
        publicAutoPolishNoInitialTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishNoInitialPlugin.showToast = () => {};
    publicAutoPolishNoInitialPlugin.setButtonBusy = () => {};
    await publicAutoPolishNoInitialPlugin.publicBilingualCurrentDraft();
    assert.equal(publicAutoPolishNoInitialWritten, "translated draft\n\n||polished draft||");

    const publicAutoPolishDisabledPlugin = new Plugin();
    publicAutoPolishDisabledPlugin.settings.polish.enabled = false;
    publicAutoPolishDisabledPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishDisabledPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    const publicAutoPolishDisabledTextbox = { isConnected: true, text: "raw draft" };
    const publicAutoPolishDisabledCalls = [];
    const publicAutoPolishDisabledToasts = [];
    let publicAutoPolishDisabledWritten = "";
    publicAutoPolishDisabledPlugin.getActiveTextbox = () => publicAutoPolishDisabledTextbox;
    publicAutoPolishDisabledPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishDisabledPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishDisabledPlugin.runModelTask = async (kind, input) => {
        publicAutoPolishDisabledCalls.push({ kind, input });
        return "translated draft";
    };
    publicAutoPolishDisabledPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishDisabledWritten = text;
        publicAutoPolishDisabledTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishDisabledPlugin.showToast = (text, type) => publicAutoPolishDisabledToasts.push({ text, type });
    publicAutoPolishDisabledPlugin.setButtonBusy = () => {};
    await publicAutoPolishDisabledPlugin.publicBilingualCurrentDraft();
    assert.deepEqual(publicAutoPolishDisabledCalls, [{ kind: "translation", input: "raw draft" }]);
    assert.equal(publicAutoPolishDisabledWritten, "translated draft\n\n||raw draft||");
    assert.equal(publicAutoPolishDisabledToasts.some(toast => toast.type === "info"), false);

    const publicAutoPolishStalePlugin = new Plugin();
    publicAutoPolishStalePlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishStalePlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    const publicAutoPolishStaleTextbox = { isConnected: true, text: "raw draft" };
    const publicAutoPolishStaleCalls = [];
    let publicAutoPolishStaleReplaceCalled = false;
    publicAutoPolishStalePlugin.getActiveTextbox = () => publicAutoPolishStaleTextbox;
    publicAutoPolishStalePlugin.getElementText = textbox => textbox.text;
    publicAutoPolishStalePlugin.runModelTask = async kind => {
        publicAutoPolishStaleCalls.push(kind);
        publicAutoPolishStaleTextbox.text = "manual edit";
        return "polished draft";
    };
    publicAutoPolishStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicAutoPolishStaleReplaceCalled = true;
        return { ok: true };
    };
    publicAutoPolishStalePlugin.showToast = () => {};
    publicAutoPolishStalePlugin.setButtonBusy = () => {};
    await publicAutoPolishStalePlugin.publicBilingualCurrentDraft();
    assert.deepEqual(publicAutoPolishStaleCalls, ["polish"]);
    assert.equal(publicAutoPolishStaleReplaceCalled, false);
    assert.equal(publicAutoPolishStaleTextbox.text, "manual edit");

    const publicCachePlugin = new Plugin();
    const publicCacheTextbox = { isConnected: true, text: "你好" };
    publicCachePlugin.getActiveTextbox = () => publicCacheTextbox;
    publicCachePlugin.getElementText = textbox => textbox.text;
    const publicCacheOptions = publicCachePlugin.getPublicBilingualTranslationOptions();
    const publicCacheKey = publicCachePlugin.getTranslationCacheKey("你好", publicCacheOptions);
    publicCachePlugin.setTranslationCache(publicCacheKey, "cached hello");
    publicCachePlugin.runModelTask = async () => { throw new Error("cache hit should not request model"); };
    let publicCacheWritten = "";
    publicCachePlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicCacheWritten = text;
        publicCacheTextbox.text = text;
        return { ok: true };
    };
    publicCachePlugin.showToast = () => {};
    publicCachePlugin.setButtonBusy = () => {};
    await publicCachePlugin.publicBilingualCurrentDraft();
    assert.equal(publicCacheWritten, "cached hello\n\n||你好||");

    const publicStalePlugin = new Plugin();
    publicStalePlugin.settings.polish.apiKey = "sk-public";
    const publicStaleTextbox = { isConnected: true, text: "你好" };
    let publicStaleReplaceCalled = false;
    const publicStaleToasts = [];
    publicStalePlugin.getActiveTextbox = () => publicStaleTextbox;
    publicStalePlugin.getElementText = textbox => textbox.text;
    publicStalePlugin.runModelTask = async () => {
        publicStaleTextbox.text = "我继续输入";
        return "hello can you help me with this";
    };
    publicStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicStaleReplaceCalled = true;
        return { ok: true };
    };
    publicStalePlugin.showToast = (text, type) => publicStaleToasts.push({ text, type });
    publicStalePlugin.setButtonBusy = () => {};
    await publicStalePlugin.publicBilingualCurrentDraft();
    assert.equal(publicStaleReplaceCalled, false);
    assert.equal(publicStaleTextbox.text, "我继续输入");
    assert.equal(publicStaleToasts.some(toast => toast.type === "info"), true);

    const publicLifecycleStalePlugin = new Plugin();
    publicLifecycleStalePlugin.settings.polish.apiKey = "sk-public";
    const publicLifecycleTextbox = { isConnected: true, text: "hello draft" };
    let publicLifecycleReplaceCalled = false;
    const publicLifecycleToasts = [];
    const publicLifecycleBusyStates = [];
    publicLifecycleStalePlugin.getActiveTextbox = () => publicLifecycleTextbox;
    publicLifecycleStalePlugin.getElementText = textbox => textbox.text;
    publicLifecycleStalePlugin.runModelTask = async () => {
        publicLifecycleStalePlugin.isStarted = false;
        publicLifecycleStalePlugin.lifecycleToken++;
        return "translated after stop";
    };
    publicLifecycleStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicLifecycleReplaceCalled = true;
        return { ok: true };
    };
    publicLifecycleStalePlugin.showToast = (text, type) => publicLifecycleToasts.push({ text, type });
    publicLifecycleStalePlugin.setButtonBusy = (_button, busy) => publicLifecycleBusyStates.push(busy);
    const publicLifecycleResult = await publicLifecycleStalePlugin.publicBilingualCurrentDraft();
    assert.equal(publicLifecycleReplaceCalled, false);
    assert.equal(publicLifecycleTextbox.text, "hello draft");
    assert.equal(publicLifecycleResult.wrote, false);
    assert.equal(publicLifecycleResult.phase, "lifecycle");
    assert.equal(publicLifecycleToasts.length, 0);
    assert.deepEqual(publicLifecycleBusyStates, [true]);

    const publicWhitespaceStalePlugin = new Plugin();
    publicWhitespaceStalePlugin.settings.polish.apiKey = "sk-public";
    const publicWhitespaceTextbox = { isConnected: true, text: "draft  text" };
    let publicWhitespaceReplaceCalled = false;
    publicWhitespaceStalePlugin.getActiveTextbox = () => publicWhitespaceTextbox;
    publicWhitespaceStalePlugin.getElementText = textbox => textbox.text;
    publicWhitespaceStalePlugin.runModelTask = async () => {
        publicWhitespaceTextbox.text = "draft text";
        return "translated draft";
    };
    publicWhitespaceStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicWhitespaceReplaceCalled = true;
        return { ok: true };
    };
    publicWhitespaceStalePlugin.showToast = () => {};
    publicWhitespaceStalePlugin.setButtonBusy = () => {};
    await publicWhitespaceStalePlugin.publicBilingualCurrentDraft();
    assert.equal(publicWhitespaceReplaceCalled, false);
    assert.equal(publicWhitespaceTextbox.text, "draft text");

    const publicWriteFailurePlugin = new Plugin();
    publicWriteFailurePlugin.settings.polish.apiKey = "sk-public";
    const publicWriteFailureTextbox = { isConnected: true, text: "你好" };
    const publicWriteFailureToasts = [];
    let publicWriteFailurePanelText = "";
    let publicWriteFailurePanelTitle = "";
    publicWriteFailurePlugin.getActiveTextbox = () => publicWriteFailureTextbox;
    publicWriteFailurePlugin.getElementText = textbox => textbox.text;
    publicWriteFailurePlugin.runModelTask = async () => "hello can you help me with this";
    publicWriteFailurePlugin.replaceTextboxTextSafelyAsync = async () => ({ ok: false, reason: "verification-failed" });
    publicWriteFailurePlugin.showPolishResultPanel = (_textbox, text, options) => {
        publicWriteFailurePanelText = text;
        publicWriteFailurePanelTitle = options?.title || "";
    };
    publicWriteFailurePlugin.showToast = (text, type) => publicWriteFailureToasts.push({ text, type });
    publicWriteFailurePlugin.setButtonBusy = () => {};
    const publicWriteFailureResult = await publicWriteFailurePlugin.publicBilingualCurrentDraft();
    assert.equal(publicWriteFailureTextbox.text, "你好");
    assert.equal(publicWriteFailurePanelText, `hello can you help me with this\n\n||${publicWriteFailureTextbox.text}||`);
    assert.equal(publicWriteFailurePanelTitle, publicWriteFailurePlugin.t("publicBilingualButton"));
    assert.equal(publicWriteFailureResult.fallbackText, publicWriteFailurePanelText);
    assert.equal(publicWriteFailureResult.wrote, false);
    // The toast explains the failure in words; the internal reason code stays out of it.
    assert.equal(publicWriteFailureToasts.some(toast => toast.type === "error"
        && toast.text === publicWriteFailurePlugin.t("publicBilingualFailed", { error: publicWriteFailurePlugin.t("errorComposerWriteFailed") })), true);
    assert.equal(publicWriteFailureToasts.some(toast => /verification-failed/.test(toast.text)), false);

    const appendGuardPlugin = new Plugin();
    const appendGuardTextbox = {
        tagName: "DIV",
        textContent: "old text",
        isConnected: true,
        focus() {},
        getAttribute(name) { return name === "data-slate-editor" ? "true" : ""; },
        matches: selector => selector.includes("data-slate-editor"),
        dispatchEvent() { return true; }
    };
    const savedWindowForAppendGuard = global.window;
    const savedDocumentForAppendGuard = global.document;
    global.window = {
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
        requestAnimationFrame: callback => { callback(); },
        setTimeout: callback => { callback(); }
    };
    global.document = {
        activeElement: appendGuardTextbox,
        createRange: () => ({ selectNodeContents() {}, collapse() {} }),
        execCommand(command, _ui, value) {
            if (command === "delete") return false;
            if (command === "insertText" && value) {
                appendGuardTextbox.textContent += value;
                return true;
            }
            return false;
        }
    };
    const appendGuardResult = await appendGuardPlugin.replaceTextboxTextSafelyAsync(appendGuardTextbox, "new text", { blurAfterReplace: false });
    assert.equal(appendGuardResult.ok, false);
    assert.equal(appendGuardTextbox.textContent, "old text");
    global.window = savedWindowForAppendGuard;
    global.document = savedDocumentForAppendGuard;

    const atomicSlatePlugin = new Plugin();
    const atomicSlateCommands = [];
    const atomicSlateTextbox = {
        tagName: "DIV",
        textContent: "old text",
        isConnected: true,
        focus() {},
        getAttribute(name) { return name === "data-slate-editor" ? "true" : ""; },
        matches: selector => selector.includes("data-slate-editor"),
        dispatchEvent(event) {
            if (event.type === "paste") {
                this.textContent = event.clipboardData?.getData("text/plain") || "";
                event.preventDefault();
            }
            return true;
        }
    };
    const savedWindowForAtomicSlate = global.window;
    const savedDocumentForAtomicSlate = global.document;
    global.window = {
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
        requestAnimationFrame: callback => { callback(); },
        setTimeout: callback => { callback(); },
        DataTransfer: FakeDataTransfer,
        ClipboardEvent: FakeClipboardEvent
    };
    global.document = {
        activeElement: atomicSlateTextbox,
        dispatchEvent() { return true; },
        createRange: () => ({ selectNodeContents() {}, collapse() {} }),
        execCommand(command) {
            atomicSlateCommands.push(command);
            return false;
        }
    };
    const atomicSlateResult = await atomicSlatePlugin.replaceTextboxTextSafelyAsync(atomicSlateTextbox, "new text", { blurAfterReplace: false });
    assert.equal(atomicSlateResult.ok, true);
    assert.equal(atomicSlateResult.method, "slate-atomic");
    assert.equal(atomicSlateTextbox.textContent, "new text");
    assert.deepEqual(atomicSlateCommands, []);
    global.window = savedWindowForAtomicSlate;
    global.document = savedDocumentForAtomicSlate;

    const manualIsolationPlugin = new Plugin();
    manualIsolationPlugin.settings.translation.enabled = true;
    manualIsolationPlugin.settings.translation.apiKey = "sk-manual";
    manualIsolationPlugin.getMessageIdentity = () => "manual-isolation-identity";
    manualIsolationPlugin.getElementText = content => content.text;
    manualIsolationPlugin.renderTranslationLoading = () => {};
    manualIsolationPlugin.removeTranslationNode = () => {};
    manualIsolationPlugin.setButtonBusy = () => {};
    let manualIsolationRequests = 0;
    let manualIsolationRendered = "";
    manualIsolationPlugin.renderTranslation = (messageNode, content, translated) => { manualIsolationRendered = translated; };
    manualIsolationPlugin.runModelTask = async () => {
        manualIsolationRequests++;
        return "\u624b\u52a8\u7ffb\u8bd1";
    };
    manualIsolationPlugin.setAutoTextTranslationCache("manual isolated text", manualIsolationPlugin.getAutoTranslationOptions(), "auto cached");
    clearTimeout(manualIsolationPlugin.translationCacheDirtyTimer);
    manualIsolationPlugin.translationCacheDirtyTimer = null;
    await manualIsolationPlugin.translateMessage(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "manual isolated text" },
        null
    );
    assert.equal(manualIsolationRequests, 1);
    assert.equal(manualIsolationRendered, "\u624b\u52a8\u7ffb\u8bd1");

    const manualLifecyclePlugin = new Plugin();
    manualLifecyclePlugin.settings.translation.enabled = true;
    manualLifecyclePlugin.settings.translation.apiKey = "sk-manual";
    manualLifecyclePlugin.getMessageIdentity = () => "manual-lifecycle-identity";
    manualLifecyclePlugin.getElementText = content => content.text;
    let manualLifecycleLoading = 0;
    let manualLifecycleRemoved = 0;
    let manualLifecycleRendered = 0;
    let manualLifecycleCached = 0;
    const manualLifecycleToasts = [];
    const manualLifecycleBusy = [];
    manualLifecyclePlugin.renderTranslationLoading = () => { manualLifecycleLoading++; };
    manualLifecyclePlugin.removeTranslationNode = () => { manualLifecycleRemoved++; };
    manualLifecyclePlugin.renderTranslation = () => { manualLifecycleRendered++; };
    manualLifecyclePlugin.renderTranslationError = () => { throw new Error("stale manual should not render error"); };
    manualLifecyclePlugin.setTranslationCache = () => { manualLifecycleCached++; };
    manualLifecyclePlugin.showToast = (text, type) => manualLifecycleToasts.push({ text, type });
    manualLifecyclePlugin.setButtonBusy = (_button, busy) => manualLifecycleBusy.push(busy);
    manualLifecyclePlugin.runModelTask = async () => {
        manualLifecyclePlugin.isStarted = false;
        manualLifecyclePlugin.lifecycleToken++;
        return "translated after stop";
    };
    await manualLifecyclePlugin.translateMessage(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "manual lifecycle text" },
        null
    );
    assert.equal(manualLifecycleLoading, 1);
    assert.equal(manualLifecycleRemoved, 1);
    assert.equal(manualLifecycleRendered, 0);
    assert.equal(manualLifecycleCached, 0);
    assert.equal(manualLifecycleToasts.length, 0);
    assert.deepEqual(manualLifecycleBusy, [true]);
}

module.exports = { title: "Async local model detection, polish & Slate composer", run };
