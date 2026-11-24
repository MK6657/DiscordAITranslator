"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { createOpenAIChatAdapter } = require("../../src/providers/registry");

function createTestPlugin() {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveData = () => true;
    plugin.saveSettings = () => true;
    plugin.scheduleTranslationCachePersist = () => {};
    return plugin;
}

test("audit fix: custom provider credentials are redacted in snapshots and nested diagnostic array objects stay structured", () => {
    const plugin = createTestPlugin();
    plugin.providerLayer.registry.register(createOpenAIChatAdapter({
        id: "customVault",
        label: "Custom Vault",
        tasks: { polish: true, translation: true },
        credentialFields: ["accessToken", "tenantSecret"],
        defaultProfile: {
            endpoint: "https://vault.example.invalid/v1/chat/completions",
            model: "vault-v1"
        },
        hasUsableConfig: config => Boolean(String(config?.accessToken || "").trim())
    }));

    plugin.settings.translation.provider = "customVault";
    plugin.settings.translation.accessToken = "tok-live-secret-987654";
    plugin.settings.translation.providerProfiles.customVault = {
        endpoint: "https://vault.example.invalid/v1/chat/completions",
        model: "vault-v1",
        tenantSecret: "sec-profile-secret-123456"
    };
    plugin.settings.serviceConfigs = [{
        id: "svc-custom-1",
        name: "Vault",
        provider: "customVault",
        endpoint: "https://vault.example.invalid/v1/chat/completions",
        model: "vault-v1",
        accessToken: "tok-saved-secret-555555",
        tenantSecret: "sec-saved-secret-666666"
    }];

    assert.equal(plugin.isSensitiveDiagnosticKey("accessToken"), true);
    assert.equal(plugin.isSensitiveDiagnosticKey("tenantSecret"), true);

    const snapshotJson = JSON.stringify(plugin.createSettingsSnapshot());
    assert.equal(snapshotJson.includes("tok-live-secret-987654"), false);
    assert.equal(snapshotJson.includes("sec-profile-secret-123456"), false);
    assert.equal(snapshotJson.includes("tok-saved-secret-555555"), false);
    assert.equal(snapshotJson.includes("sec-saved-secret-666666"), false);

    const sanitizedMeta = plugin.diagnosticsRecorder.sanitizeDiagnosticMeta({
        candidateLengths: [
            { source: "dom-content", length: 42, confidence: "dom", accessToken: "tok-live-secret-987654" }
        ]
    });
    assert.equal(Array.isArray(sanitizedMeta.candidateLengths), true);
    assert.equal(sanitizedMeta.candidateLengths[0].source, "dom-content");
    assert.equal(sanitizedMeta.candidateLengths[0].length, 42);
    assert.equal("accessToken" in sanitizedMeta.candidateLengths[0], false);
    assert.equal(JSON.stringify(sanitizedMeta).includes("tok-live-secret-987654"), false);
});

test("audit fix: custom providers preserve UI capabilities, default model, health probe parser, cache isolation, and array dedupe", async t => {
    const plugin = createTestPlugin();
    plugin.providerLayer.registry.register(createOpenAIChatAdapter({
        id: "customLocalOne",
        label: "Custom Local One",
        tasks: { polish: true, translation: true },
        isLocal: true,
        apiKeyOptional: true,
        supportsModelDetection: true,
        credentialFields: ["authToken"],
        defaultProfile: {
            endpoint: "http://127.0.0.1:43101/v1/chat/completions",
            model: "custom-local-7b"
        },
        parseResponse: raw => JSON.parse(raw).customReply || ""
    }));
    plugin.providerLayer.registry.register({
        id: "customDirectAlpha",
        label: "Custom Direct Alpha",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: [],
        apiKeyOptional: true,
        defaultProfile: {
            endpoint: "https://alpha.example.invalid/translate",
            model: ""
        },
        getEffectiveEndpoint: (config, defaultConfig) => config?.endpoint || defaultConfig?.endpoint || "https://alpha.example.invalid/translate",
        buildRequest: (_kind, input, config, defaultConfig) => ({
            endpoint: config?.endpoint || defaultConfig?.endpoint || "https://alpha.example.invalid/translate",
            request: {
                provider: "customDirectAlpha",
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: { texts: Array.isArray(input) ? input : [input] }
            }
        }),
        parseResponse: (raw, _request, options) => {
            const list = JSON.parse(raw).translations;
            return options?.translateAsArray ? list : list[0];
        }
    });
    plugin.providerLayer.registry.register({
        id: "customDirectBeta",
        label: "Custom Direct Beta",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: [],
        apiKeyOptional: true,
        defaultProfile: {
            endpoint: "https://beta.example.invalid/translate",
            model: ""
        },
        getEffectiveEndpoint: (config, defaultConfig) => config?.endpoint || defaultConfig?.endpoint || "https://beta.example.invalid/translate",
        buildRequest: () => ({ endpoint: "https://beta.example.invalid/translate", request: { provider: "customDirectBeta", headers: {}, body: {} } }),
        parseResponse: raw => raw
    });

    const caps = plugin.settingsSchema.getProviderCapabilities("customLocalOne");
    assert.equal(Boolean(caps.ui), true);
    assert.equal(caps.ui.localModelPreset, true);
    assert.equal(caps.ui.model, true);
    assert.equal(caps.ui.apiKey, false);
    assert.equal(plugin.isModelDetectionProvider("customLocalOne"), true);

    plugin.settings.translation.provider = "customLocalOne";
    plugin.settings.translation.endpoint = "http://127.0.0.1:43101/v1/chat/completions";
    plugin.settings.translation.model = "";
    plugin.settings.translation.authToken = "local-token-1";

    assert.equal(
        plugin.getEffectiveChatCompletionModel("translation", plugin.getEffectiveTaskConfig("translation")),
        "custom-local-7b"
    );
    assert.equal(plugin.shouldInvalidateAutoTranslationForSetting("translation.authToken"), true);
    assert.equal(plugin.getAutoTranslationOverrides().authToken, "local-token-1");

    t.mock.method(globalThis, "fetch", async (_url, init) => {
        const parsedBody = init?.body ? JSON.parse(init.body) : null;
        if (parsedBody?.texts) {
            return new Response(JSON.stringify({
                translations: parsedBody.texts.map(item => `译:${item}`)
            }), { status: 200 });
        }
        return new Response(JSON.stringify({ customReply: "OK" }), { status: 200 });
    });

    const localRequestOptions = plugin.getAutoTranslationOptions();
    const localProviderKey = plugin.getAutoTranslationProviderKey(localRequestOptions);
    plugin.startLocalProviderHealthProbe(localProviderKey, localRequestOptions);
    await Promise.all([...plugin.localProviderHealthChecks.values()]);
    assert.equal(plugin.localProviderHealthyKeys.has(localProviderKey), true);

    const alphaKey = plugin.getTranslationCacheKey("Hello world", {
        mode: "auto",
        configOverrides: { provider: "customDirectAlpha", endpoint: "", model: "" }
    });
    const betaKey = plugin.getTranslationCacheKey("Hello world", {
        mode: "auto",
        configOverrides: { provider: "customDirectBeta", endpoint: "", model: "" }
    });
    assert.notEqual(alphaKey, betaKey);

    plugin.settings.translation.provider = "customDirectAlpha";
    plugin.settings.translation.endpoint = "https://alpha.example.invalid/translate";
    const [singleRes, arrayRes] = await Promise.all([
        plugin.runModelTaskWithResult("translation", ["Hello"], {
            mode: "auto",
            translateAsArray: false,
            configOverrides: { provider: "customDirectAlpha", endpoint: "https://alpha.example.invalid/translate" }
        }),
        plugin.runModelTaskWithResult("translation", ["Hello"], {
            mode: "auto",
            translateAsArray: true,
            configOverrides: { provider: "customDirectAlpha", endpoint: "https://alpha.example.invalid/translate" }
        })
    ]);
    assert.equal(singleRes.text, "译:Hello");
    assert.deepEqual(arrayRes.text, ["译:Hello"]);
});

test("audit fix: syncTaskServiceConfig scrubs stale custom credentials and fallback overlays live active provider credentials", () => {
    const plugin = createTestPlugin();
    plugin.providerLayer.registry.register(createOpenAIChatAdapter({
        id: "customWithToken",
        label: "Custom With Token",
        tasks: { polish: true, translation: true },
        credentialFields: ["customSecret"],
        defaultProfile: {
            endpoint: "https://token.example.invalid/v1/chat/completions",
            model: "token-m1"
        },
        hasUsableConfig: config => Boolean(String(config?.customSecret || "").trim())
    }));

    plugin.settings.polish.provider = "customWithToken";
    plugin.settings.polish.customSecret = "old-polish-secret";
    plugin.settings.translation.provider = "openaiCompatible";
    plugin.settings.translation.endpoint = "https://openai.example.invalid/v1/chat/completions";
    plugin.settings.translation.model = "gpt-4o-mini";
    plugin.settings.translation.apiKey = "sk-live-openai";

    assert.equal(plugin.syncTaskServiceConfig("translation", "polish", { silent: true }), true);
    assert.equal(plugin.settings.polish.provider, "openaiCompatible");
    assert.equal("customSecret" in plugin.settings.polish, false);

    // Live active provider credentials override stale providerProfiles during fallback resolution:
    plugin.settings.translation.providerProfiles.openaiCompatible = {
        endpoint: "https://openai.example.invalid/v1/chat/completions",
        model: "gpt-4o-mini",
        apiKey: "sk-stale-profile-key"
    };
    plugin.settings.translation.apiKey = "";
    const clearedFallback = plugin.providerLayer.getProviderFallbackConfig("translation", "openaiCompatible", {
        provider: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        apiKey: "sk-primary"
    });
    assert.equal(clearedFallback?.apiKey, "", "cleared live apiKey must not resurrect stale profile apiKey");
    assert.equal(plugin.hasUsableApiConfig("translation", clearedFallback), false);

    plugin.settings.translation.apiKey = "sk-fresh-live-key";
    const freshFallback = plugin.providerLayer.getProviderFallbackConfig("translation", "openaiCompatible", {
        provider: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        apiKey: "sk-primary"
    });
    assert.equal(freshFallback?.apiKey, "sk-fresh-live-key");
});

test("audit fix: editing googleTranslate.keyPoolText aborts in-flight connection test and never marks stale key success", async t => {
    const plugin = createTestPlugin();
    plugin.settings.translation.provider = "googleCloud";
    plugin.settings.translation.endpoint = "https://translation.googleapis.com/language/translate/v2";
    plugin.settings.googleTranslate.keyPoolText = "AIzaFirstKey123456";

    let resolvePendingFetch = null;
    t.mock.method(globalThis, "fetch", (_url, init) => new Promise(resolve => {
        resolvePendingFetch = () => resolve(new Response(JSON.stringify({
            data: { translations: [{ translatedText: "你好" }] }
        }), { status: 200 }));
        init?.signal?.addEventListener("abort", () => {
            // Simulate a late response racing with abort before read settles.
            resolvePendingFetch();
        }, { once: true });
    }));

    const badge = { dataset: { daitKind: "translation" } };
    const pendingTest = plugin.testApiConnection("translation", badge);
    await new Promise(resolve => setImmediate(resolve));

    plugin.setSetting("googleTranslate.keyPoolText", "");
    await pendingTest;

    assert.notEqual(plugin.getApiStatus("translation").state, "success");
    assert.notEqual(plugin.googleTranslateRuntime?.keys?.AIzaFirstKey123456?.lastStatus, "success");

    plugin.settings.serviceConfigs = [{
        id: "gc-1",
        name: "Google Cloud",
        provider: "googleCloud",
        endpoint: "https://translation.googleapis.com/language/translate/v2",
        model: ""
    }];
    assert.equal(plugin.applySavedServiceConfig("translation", "gc-1", { silent: true }), true);
    assert.notEqual(plugin.getApiStatus("translation").state, "success");
});

test("audit fix: public bilingual sanitizes wrapper labels, caps request budget, and clears rejected fallback attribution", async t => {
    const plugin = createTestPlugin();
    plugin.settings.polish.enabled = false;
    plugin.settings.polish.apiKey = "";
    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "openaiCompatible";
    plugin.settings.translation.endpoint = "https://primary.example.invalid/v1/chat/completions";
    plugin.settings.translation.model = "primary-m";
    plugin.settings.translation.apiKey = "sk-primary";
    plugin.settings.translation.targetLanguage = "英语";
    plugin.settings.ui.publicBilingualTargetLanguage = "英语";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["deepseek"];
    plugin.settings.translation.providerProfiles.deepseek = {
        endpoint: "https://fallback.example.invalid/v1/chat/completions",
        model: "deepseek-chat",
        apiKey: "sk-fallback"
    };

    let callIndex = 0;
    t.mock.method(globalThis, "fetch", async url => {
        callIndex++;
        const href = String(url);
        if (callIndex === 1) {
            assert.match(href, /primary\.example\.invalid/);
            return new Response(JSON.stringify({ error: { message: "Temporary 503" } }), { status: 503 });
        }
        if (callIndex === 2) {
            assert.match(href, /fallback\.example\.invalid/);
            // Fallback returns untranslated source text -> rejected by validation!
            return new Response(JSON.stringify({
                choices: [{ message: { content: "今天下午三点开会讨论发布计划" }, finish_reason: "stop" }]
            }), { status: 200 });
        }
        // Attempt 2 succeeds on primary with a "Translation:" wrapper that must be sanitized!
        assert.match(href, /primary\.example\.invalid/);
        return new Response(JSON.stringify({
            choices: [{ message: { content: "Translation: Let's meet at 3 PM today to discuss the release plan." }, finish_reason: "stop" }]
        }), { status: 200 });
    });

    const options = plugin.getPublicBilingualTranslationOptions();
    const result = await plugin.getPublicBilingualTranslation("今天下午三点开会讨论发布计划", options);
    assert.equal(result.text, "Let's meet at 3 PM today to discuss the release plan.");
    assert.equal(result.fallbackProvider, "", "rejected fallback on attempt 1 must not taint primary success on attempt 2");
    assert.equal(plugin.translationCache.has(result.cacheKey), true);
});

test("audit fix: manual rescue resets fallbackProvider when fallback attempt output was rejected", async t => {
    const plugin = createTestPlugin();
    plugin.settings.translation.provider = "openaiCompatible";
    plugin.settings.translation.endpoint = "https://primary.example.invalid/v1/chat/completions";
    plugin.settings.translation.model = "primary-m";
    plugin.settings.translation.apiKey = "sk-primary";
    plugin.settings.translation.targetLanguage = "简体中文";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["deepseek"];
    plugin.settings.translation.providerProfiles.deepseek = {
        endpoint: "https://fallback.example.invalid/v1/chat/completions",
        model: "deepseek-chat",
        apiKey: "sk-fallback"
    };

    let callIndex = 0;
    t.mock.method(globalThis, "fetch", async () => {
        callIndex++;
        if (callIndex === 1) {
            return new Response(JSON.stringify({ error: { message: "Overloaded" } }), { status: 503 });
        }
        if (callIndex === 2) {
            // Fallback echoes English untranslated -> rejected!
            return new Response(JSON.stringify({
                choices: [{ message: { content: "Please check the deployment logs before restarting." }, finish_reason: "stop" }]
            }), { status: 200 });
        }
        // Rescue attempt 2 succeeds on primary!
        return new Response(JSON.stringify({
            choices: [{ message: { content: "重启前请先检查部署日志。" }, finish_reason: "stop" }]
        }), { status: 200 });
    });

    const source = "Please check the deployment logs before restarting.";
    const plan = {
        mode: "manual",
        text: source,
        domText: source,
        cacheKey: "manual-key",
        autoCacheKey: "auto-key",
        sourceHash: plugin.getStrongTextFingerprint(source),
        requestOptions: plugin.getManualTranslationRequestOptions()
    };

    const rescued = await plugin.runManualRescueTranslationPlan(plan);
    assert.equal(rescued.translated, "重启前请先检查部署日志。");
    assert.equal(Boolean(rescued.requestOptions.requestContext?.fallbackProvider), false);
    assert.equal(Boolean(plan.requestOptions.requestContext?.fallbackProvider), false);
});

test("audit fix: code-only detection, multi-fence candidate extraction, contraction apostrophes, and 404 batch retry guard", () => {
    const plugin = createTestPlugin();

    assert.equal(plugin.isAutoTranslationCodeOnlyText("```js\nconsole.log(1);\n```"), true);
    assert.equal(plugin.isAutoTranslationCodeOnlyText("```js\na();\n```\n\n```js\nb();\n```"), true);
    assert.equal(
        plugin.isAutoTranslationCodeOnlyText("```js\na();\n```\nPlease explain why this throws\n```js\nb();\n```"),
        false
    );

    const multiFence = "```js\nconst a = 1;\n```\n这是中间的翻译说明。\n```js\nconst b = 2;\n```";
    const fenceCandidates = plugin.outputGuard.extractAutoTranslationOutputCandidates(multiFence);
    assert.deepEqual(fenceCandidates, [multiFence]);

    const refusalWithContractions = "I'm sorry, I can't translate that message.";
    const refusalCandidates = plugin.outputGuard.extractAutoTranslationOutputCandidates(refusalWithContractions);
    assert.equal(refusalCandidates.includes("m sorry, I can"), false);
    assert.equal(
        plugin.getAutoTranslationInvalidOutputReason("Bonjour tout le monde", refusalWithContractions, "英语"),
        "refusal-output"
    );

    const doubleQuotedContraction = "Translation: \"I'm ready to ship this today.\"";
    const doubleQuotedCandidates = plugin.outputGuard.extractAutoTranslationOutputCandidates(doubleQuotedContraction);
    assert.equal(doubleQuotedCandidates.includes("I'm ready to ship this today."), true);

    const notFoundError = Object.assign(new Error("HTTP 404"), { status: 404 });
    const modelNotFoundError = Object.assign(new Error("HTTP 400"), { status: 400, providerModelNotFound: true });
    assert.equal(plugin.autoRequestPipeline.shouldFallbackAutoTranslationBatchRequestError(notFoundError), false);
    assert.equal(plugin.autoRequestPipeline.shouldFallbackAutoTranslationBatchRequestError(modelNotFoundError), false);
});

test("audit fix: renderAutoTranslationFailure preserves manual line, retryAutoTranslationTarget uses long-text key, Discord settings close rescans, and stop() clears settingsDirtyTimer", () => {
    const plugin = createTestPlugin();

    // 1. renderAutoTranslationFailure must not overwrite a manual translation line
    const manualLine = {
        dataset: {
            daitMode: "manual",
            daitSourceSig: plugin.getStrongTextFingerprint("Hello there")
        },
        classList: { contains: () => false }
    };
    const contentNode = { isConnected: true };
    const messageNode = {
        isConnected: true,
        id: "chat-messages-1001-2002",
        getAttribute: name => (name === "id" ? "chat-messages-1001-2002" : null)
    };
    let errorRendered = false;
    plugin.isAutoTranslationRenderPaused = () => false;
    plugin.isElementVisibleInViewport = () => true;
    plugin.isAutoTranslationTargetDomTextCurrent = () => true;
    plugin.isAutoTranslationTargetIdentityCurrent = () => true;
    plugin.getTranslationLine = node => (node === contentNode ? manualLine : null);
    plugin.renderTranslationError = () => { errorRendered = true; };

    plugin.renderAutoTranslationFailure(
        { messageNode, content: contentNode, text: "Hello there", domText: "Hello there", requestOptions: { mode: "auto" } },
        "auto-cache-key",
        Object.assign(new Error("invalid"), { autoTranslationFinalInvalidOutput: true, autoTranslationFailureCount: 3 })
    );
    assert.equal(errorRendered, false);

    // 2. retryAutoTranslationTarget uses long-text options/cacheKey for >= 420 char messages
    plugin.settings.translation.apiKey = "sk-test-long-retry";
    const longSource = "Long paragraph for translation retry verification. ".repeat(12).trim();
    const expectedLongOptions = plugin.withMessageIdentity(
        plugin.getAutoTranslationRequestOptionsForText(longSource, plugin.getAutoTranslationOptions()),
        messageNode,
        contentNode,
        longSource
    );
    const expectedLongCacheKey = plugin.getTranslationCacheKey(longSource, expectedLongOptions);
    plugin.setTranslationCache(
        expectedLongCacheKey,
        "这是一段用于测试长文本自动翻译重试逻辑的完整中文译文段落，确保重试读取正确的长文本缓存键。".repeat(6)
    );
    let renderedRetryCacheKey = "";
    plugin.renderTranslation = (_msg, _cnt, _txt, key) => { renderedRetryCacheKey = key; };
    plugin.retryAutoTranslationTarget(messageNode, contentNode, longSource);
    assert.equal(renderedRetryCacheKey, expectedLongCacheKey);

    // 3. Closing Discord settings triggers deferred scans
    let queuedScanCalls = 0;
    let queuedInputCalls = 0;
    plugin.queueScan = () => { queuedScanCalls++; };
    plugin.queueInputButtonScan = () => { queuedInputCalls++; };
    plugin.discordSettingsScanDeferred = true;
    plugin.settingsSurfaceProbeOpen = true;
    plugin.isDiscordSettingsSurfaceOpen = () => false;

    const removedSettingsLayer = {
        nodeType: 1,
        matches: selector => String(selector).includes("standardSidebarView"),
        querySelector: () => null
    };
    plugin.chatObserver.maybeResumeAfterDiscordSettingsClose([
        { type: "childList", removedNodes: [removedSettingsLayer], addedNodes: [] }
    ]);
    assert.equal(plugin.discordSettingsScanDeferred, false);
    assert.equal(queuedScanCalls, 1);
    assert.equal(queuedInputCalls, 1);

    // 4. stop() commits unblurred controls, persists settings, and leaves no dangling settingsDirtyTimer
    const stopPlugin = createTestPlugin();
    let savedSnapshots = 0;
    stopPlugin.saveSettings = () => {
        savedSnapshots++;
        return true;
    };
    stopPlugin.commitSettingsControls = () => {
        stopPlugin.setSetting("translation.model", "committed-on-stop-model", { persist: true });
    };
    const prevDocument = globalThis.document;
    globalThis.document = {
        querySelectorAll: selector => (selector === ".dait-settings" ? [{}] : []),
        removeEventListener() {}
    };
    try {
        stopPlugin.stop();
    }
    finally {
        if (prevDocument === undefined) delete globalThis.document;
        else globalThis.document = prevDocument;
    }
    assert.equal(stopPlugin.settings.translation.model, "committed-on-stop-model");
    assert.equal(stopPlugin.settingsDirtyTimer, null);
    assert.equal(savedSnapshots >= 1, true);
});

test("audit fix: public bilingual enforces shared requestBudget across fallbacks and long-text retry options preserve requestOrigin", async t => {
    const plugin = createTestPlugin();
    plugin.settings.polish.enabled = false;
    plugin.settings.polish.apiKey = "";
    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "openaiCompatible";
    plugin.settings.translation.endpoint = "https://primary.example.invalid/v1/chat/completions";
    plugin.settings.translation.model = "primary-m";
    plugin.settings.translation.apiKey = "sk-primary";
    plugin.settings.ui.publicBilingualTargetLanguage = "英语";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["deepseek", "microsoft", "deepl"];
    plugin.settings.translation.providerProfiles.deepseek = {
        endpoint: "https://fb1.example.invalid/v1/chat/completions",
        model: "deepseek-chat",
        apiKey: "sk-fb1"
    };
    plugin.settings.translation.providerProfiles.microsoft = {
        endpoint: "https://fb2.example.invalid/translate",
        apiKey: "ms-fb2"
    };
    plugin.settings.translation.providerProfiles.deepl = {
        endpoint: "https://api-free.deepl.com/v2/translate",
        deeplPlan: "free",
        apiKey: "dl-fb3"
    };

    let totalCalls = 0;
    t.mock.method(globalThis, "fetch", async url => {
        totalCalls++;
        const href = String(url);
        if (href.includes("deepl") || href.includes("fb2")) {
            return new Response(JSON.stringify({ error: { message: "503 unavailable" } }), { status: 503 });
        }
        if (href.includes("primary")) {
            return new Response(JSON.stringify({ error: { message: "503 unavailable" } }), { status: 503 });
        }
        // Fallback 1 returns untranslated source so public bilingual tries rescue attempts until budget caps out:
        return new Response(JSON.stringify({
            choices: [{ message: { content: "请帮我把这段话翻成英文" }, finish_reason: "stop" }]
        }), { status: 200 });
    });

    await assert.rejects(() => plugin.runPublicBilingualTranslationTask("请帮我把这段话翻成英文"));
    assert.equal(totalCalls <= 6, true, `expected public bilingual requests <= 6, got ${totalCalls}`);

    const manualLongOptions = plugin.getLongTextTranslationOptions(plugin.getManualTranslationRequestOptions(), "A".repeat(500));
    const retryOpts = plugin.getAutoTranslationRetryOptions("A".repeat(500), "", manualLongOptions);
    const finalOpts = plugin.autoRequestPipeline.getAutoTranslationFinalFallbackOptions("A".repeat(500), manualLongOptions);
    assert.equal(retryOpts.requestOrigin, "manual");
    assert.equal(finalOpts.requestOrigin, "manual");
});

