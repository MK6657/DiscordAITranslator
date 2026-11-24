"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { MANUAL_TRANSLATION_REQUEST_BUDGET } = require("../../src/constants");

function useGlobals(t, overrides) {
    const saved = {};
    for (const [key, value] of Object.entries(overrides)) {
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

test("manual translation click budget counts provider fallback requests and stays within limit", async () => {
    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-primary-test";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.targetLanguage = "Chinese (Simplified)";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible", "microsoft", "deepl", "baidu"];
    plugin.settings.translation.providerProfiles = {
        openaiCompatible: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", apiKey: "sk-fb-1" },
        microsoft: { endpoint: "https://api.cognitive.microsofttranslator.com/translate?api-version=3.0", apiKey: "ms-fb-2", region: "eastus" },
        deepl: { endpoint: "https://api-free.deepl.com/v2/translate", apiKey: "dl-fb-3", deeplPlan: "free" },
        baidu: { endpoint: "https://fanyi-api.baidu.com/api/trans/vip/translate", appId: "bd-app", secretKey: "bd-secret" }
    };

    const requests = [];
    const sourceText = "Hello world from Discord translation budget test";
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        requests.push(request.provider);
        // Primary and first 3 fallback providers fail with 500; 4th fallback echoes untranslated source text.
        if (request.provider === "baidu") {
            return JSON.stringify({ trans_result: [{ src: sourceText, dst: sourceText }] });
        }
        const err = new Error(`upstream 500 for ${request.provider}`);
        err.status = 500;
        throw err;
    };

    const plan = {
        text: sourceText,
        domText: sourceText,
        cacheKey: "manual-budget-key",
        sourceHash: plugin.getStrongTextFingerprint(sourceText),
        requestOptions: plugin.getManualTranslationRequestOptions()
    };

    await assert.rejects(() => plugin.runManualTranslationPlan(plan));
    assert.ok(requests.length <= MANUAL_TRANSLATION_REQUEST_BUDGET, `expected <= ${MANUAL_TRANSLATION_REQUEST_BUDGET} requests, got ${requests.length}: ${requests.join(", ")}`);
    assert.equal(requests.length, MANUAL_TRANSLATION_REQUEST_BUDGET);
});

test("long-text manual chunk rescue fallback respects reserved requests for remaining chunks", async () => {
    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-primary-test";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.targetLanguage = "Chinese (Simplified)";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible", "deepl"];
    plugin.settings.translation.providerProfiles = {
        openaiCompatible: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", apiKey: "sk-fb-1" },
        deepl: { endpoint: "https://api-free.deepl.com/v2/translate", apiKey: "dl-fb-2", deeplPlan: "free" }
    };

    const chunkTexts = [
        "First chunk sentence about engineering reliability.",
        "Second chunk sentence about preserving remaining chunk slots.",
        "Third chunk sentence about finishing cleanly."
    ];
    plugin.isLongAutoTranslationText = () => true;
    plugin.splitLongAutoTranslationText = () => chunkTexts;
    plugin.runManualLongTextWholePass = async () => null;

    const sent = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const payload = JSON.stringify(request.body || "");
        sent.push({ provider: request.provider, payload });
        // Chunk 0 fails with invalid output (echo) on primary and triggers rescue + fallback.
        if (payload.includes("First chunk")) {
            if (request.provider === "deepseek") {
                return JSON.stringify({ choices: [{ message: { content: chunkTexts[0] } }] });
            }
            const err = new Error("fallback 500");
            err.status = 500;
            throw err;
        }
        if (payload.includes("Second chunk")) {
            return JSON.stringify({ choices: [{ message: { content: "关于保留剩余分块名额的第二段译文。" } }] });
        }
        return JSON.stringify({ choices: [{ message: { content: "关于顺利结束的第三段译文。" } }] });
    };

    // Tight budget: 4 total requests for 3 chunks -> 1 request for chunk 0, 1 spare for rescue/fallback,
    // and 2 MUST remain reserved for chunks 1 and 2!
    const requestBudget = plugin.createAutoTranslationRequestBudget(4);
    const taskOptions = {
        retryInvalidOutput: false,
        manualRescue: true,
        requestBudget
    };
    const requestOptions = plugin.getManualTranslationRequestOptions();
    const translated = await plugin.runLongAutoTranslationTask(chunkTexts.join("\n\n"), requestOptions, taskOptions);

    assert.ok(sent.length <= 4, `expected <= 4 total requests, got ${sent.length}`);
    assert.ok(requestBudget.used <= 4);
    // Chunks 1 and 2 MUST both have received their reserved requests and rendered in the partial result.
    assert.ok(translated.includes("关于保留剩余分块名额的第二段译文。"));
    assert.ok(translated.includes("关于顺利结束的第三段译文。"));
});

test("public bilingual fallback uses actual request provider config instead of global translation provider", async () => {
    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "sakuraLocal";
    plugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    plugin.settings.translation.model = "local-model";
    plugin.settings.polish.enabled = true;
    plugin.settings.polish.provider = "deepseek";
    plugin.settings.polish.apiKey = "sk-polish-deepseek";
    plugin.settings.polish.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.polish.model = "deepseek-chat";
    plugin.settings.polish.targetLanguage = "English";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible"];
    plugin.settings.translation.providerProfiles = {
        openaiCompatible: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", apiKey: "sk-fallback-oai" }
    };

    // Case 1: global translation is local Sakura, actual public bilingual request uses cloud DeepSeek -> fallback MUST run!
    const providersHit = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        providersHit.push(request.provider);
        if (request.provider === "deepseek") {
            const err = new Error("deepseek 500");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ choices: [{ message: { content: "Hello, how are you doing today?" } }] });
    };

    const options = plugin.getPublicBilingualTranslationOptions();
    const result = await plugin.runPublicBilingualTranslationTask("你好，今天过得怎么样？", options);
    assert.equal(result, "Hello, how are you doing today?");
    assert.deepEqual(providersHit, ["deepseek", "openaiCompatible"]);
    assert.equal(options.requestContext.fallbackProvider, "openaiCompatible");

    // Case 2: global translation is cloud DeepSeek, actual public bilingual request uses local Sakura -> NEVER fall back to cloud!
    const localBilingualPlugin = new Plugin();
    localBilingualPlugin.settings.translation.enabled = true;
    localBilingualPlugin.settings.translation.provider = "deepseek";
    localBilingualPlugin.settings.translation.apiKey = "sk-cloud-translation";
    localBilingualPlugin.settings.polish.enabled = true;
    localBilingualPlugin.settings.polish.provider = "sakuraLocal";
    localBilingualPlugin.settings.polish.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localBilingualPlugin.settings.polish.model = "Hy-MT2";
    localBilingualPlugin.settings.polish.targetLanguage = "English";
    localBilingualPlugin.settings.ui.providerFallbackEnabled = true;
    localBilingualPlugin.settings.ui.providerFallbackOrder = ["openaiCompatible"];
    localBilingualPlugin.settings.translation.providerProfiles = {
        openaiCompatible: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", apiKey: "sk-fallback-oai" }
    };
    const localHits = [];
    localBilingualPlugin.fetchApiResponseText = async (_endpoint, request) => {
        localHits.push(request.provider);
        const err = new Error("local down");
        err.status = 503;
        throw err;
    };
    const localOpts = localBilingualPlugin.getPublicBilingualTranslationOptions();
    await assert.rejects(() => localBilingualPlugin.runPublicBilingualTranslationTask("你好世界", localOpts));
    assert.deepEqual(localHits, ["sakuraLocal"]);

    // Case 3: fallback order excludes the actual request provider (even when it differs from settings.translation.provider).
    localBilingualPlugin.settings.ui.providerFallbackOrder = ["openaiCompatible", "deepl"];
    assert.deepEqual(
        localBilingualPlugin.getProviderFallbackOrder("translation", { provider: "openaiCompatible" }),
        ["deepl"]
    );
});

test("custom adapter credentials are isolated across fallback requests even with shared field names", async () => {
    const plugin = new Plugin();
    const makeCustomAdapter = (id, label, endpoint) => ({
        id,
        label,
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["customToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint, model: "" },
        hasUsableConfig(config) {
            return Boolean(String(config?.customToken || "").trim());
        },
        getEffectiveEndpoint(config, defaultConfig) {
            return config?.endpoint || defaultConfig?.endpoint || endpoint;
        },
        buildHeaders(config) {
            return { "X-Custom-Token": String(config?.customToken || "") };
        },
        buildRequest(_kind, input, config, defaultConfig, _options, p) {
            const url = this.getEffectiveEndpoint(config, defaultConfig, p);
            return {
                endpoint: url,
                request: {
                    provider: id,
                    responseParser: id,
                    headers: this.buildHeaders(config, "", p),
                    body: { text: input, endpoint: url }
                }
            };
        },
        parseResponse(raw) {
            return JSON.parse(raw).translated;
        }
    });

    plugin.providerLayer.registry.register(makeCustomAdapter("customAlpha", "Custom Alpha", "https://alpha.example/v1/translate"));
    plugin.providerLayer.registry.register(makeCustomAdapter("customBeta", "Custom Beta", "https://beta.example/v1/translate"));
    plugin.providerLayer.registry.register(makeCustomAdapter("customGamma", "Custom Gamma", "https://gamma.example/v1/translate"));

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "customAlpha";
    plugin.settings.translation.endpoint = "https://alpha.example/v1/translate";
    plugin.settings.translation.customToken = "ALPHA-SECRET-123";
    plugin.settings.ui.providerFallbackEnabled = true;
    // customGamma has NO customToken in its profile (must be skipped, never inherit ALPHA-SECRET-123);
    // customBeta has its own customToken BETA-SECRET-456.
    plugin.settings.ui.providerFallbackOrder = ["customGamma", "customBeta"];
    plugin.settings.translation.providerProfiles = {
        customGamma: { endpoint: "https://gamma.example/v1/translate" },
        customBeta: { endpoint: "https://beta.example/v1/translate", customToken: "BETA-SECRET-456" }
    };

    const seenHeaders = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        seenHeaders.push({ provider: request.provider, token: request.headers?.["X-Custom-Token"] });
        if (request.provider === "customAlpha") {
            const err = new Error("alpha failed");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ translated: "来自 Beta 的译文" });
    };

    const result = await plugin.runModelTask("translation", "hello", {
        mode: "manual",
        configOverrides: { provider: "customAlpha", customToken: "ALPHA-SECRET-123" }
    });
    assert.equal(result, "来自 Beta 的译文");
    // customGamma must NOT be called (missing credential, did not inherit Alpha's token).
    // customBeta MUST send its own BETA-SECRET-456, never ALPHA-SECRET-123.
    assert.deepEqual(seenHeaders, [
        { provider: "customAlpha", token: "ALPHA-SECRET-123" },
        { provider: "customBeta", token: "BETA-SECRET-456" }
    ]);
});

test("registered custom adapters integrate with settings options, task checks, fallback parsing, saved profiles, and testApiConnection", async t => {
    useGlobals(t, {
        document: { querySelectorAll: () => [] }
    });

    const plugin = new Plugin();
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.syncSettingControls = () => {};
    plugin.setApiRuntimeStatus = () => {};

    let testRequestToken = "";
    plugin.providerLayer.registry.register({
        id: "customTranslateOnly",
        label: "Custom Translate Only",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["customToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://translate.custom.example/v1" },
        hasUsableConfig(config) {
            return Boolean(String(config?.customToken || "").trim());
        },
        getEffectiveEndpoint(config, defaultConfig) {
            return config?.endpoint || defaultConfig?.endpoint || "https://translate.custom.example/v1";
        },
        buildTestRequest(_kind, config) {
            testRequestToken = String(config?.customToken || "");
            return {
                endpoint: this.getEffectiveEndpoint(config),
                request: {
                    provider: "customTranslateOnly",
                    responseParser: "customTranslateOnly",
                    headers: { "X-Custom-Token": testRequestToken },
                    body: { ping: true }
                }
            };
        },
        buildRequest(_kind, input, config) {
            return {
                provider: "customTranslateOnly",
                responseParser: "customTranslateOnly",
                headers: { "X-Custom-Token": String(config?.customToken || "") },
                body: { text: input }
            };
        },
        parseResponse(raw) {
            return JSON.parse(raw).text;
        }
    });

    // 1. Settings options & strict task capability validation.
    const translationOptions = plugin.getProviderOptionsForTask("translation");
    const polishOptions = plugin.getProviderOptionsForTask("polish");
    assert.ok(translationOptions.some(([id, label]) => id === "customTranslateOnly" && label === "Custom Translate Only"));
    assert.equal(polishOptions.some(([id]) => id === "customTranslateOnly"), false);
    assert.equal(plugin.isProviderAllowedForTask("translation", "customTranslateOnly"), true);
    assert.equal(plugin.isProviderAllowedForTask("polish", "customTranslateOnly"), false);
    assert.equal(plugin.isProviderAllowedForTask("polish", "unknownProviderId"), false);
    assert.equal(plugin.normalizeProviderForTask("polish", "customTranslateOnly"), "deepseek");

    // 2. Fallback order parsing preserves registered adapter ids.
    assert.deepEqual(
        plugin.parseProviderFallbackOrderText("customTranslateOnly, deepseek, unknownId"),
        ["customTranslateOnly", "deepseek"]
    );

    // 3. Saved service configs preserve registered adapter + custom credential fields, and switching isolates/restores them.
    const saved = plugin.normalizeSavedServiceConfigEntry({
        provider: "customTranslateOnly",
        endpoint: "https://translate.custom.example/v1",
        customToken: "SAVED-CUSTOM-TOKEN"
    });
    assert.ok(saved);
    assert.equal(saved.provider, "customTranslateOnly");
    assert.equal(saved.customToken, "SAVED-CUSTOM-TOKEN");
    assert.ok(plugin.getServiceConfigIdentityKey(saved));

    plugin.setTaskProvider("translation", "customTranslateOnly");
    plugin.settings.translation.customToken = "LIVE-CUSTOM-TOKEN";
    plugin.setTaskProvider("translation", "deepseek");
    // Switching away saves customToken to providerProfiles and clears it from live settings.translation.
    assert.equal(plugin.settings.translation.customToken, undefined);
    assert.equal(plugin.settings.translation.providerProfiles.customTranslateOnly.customToken, "LIVE-CUSTOM-TOKEN");
    plugin.setTaskProvider("translation", "customTranslateOnly");
    assert.equal(plugin.settings.translation.customToken, "LIVE-CUSTOM-TOKEN");

    // 4. testApiConnection snapshot includes custom credentialFields.
    plugin.fetchApiResponseText = async () => JSON.stringify({ text: "ok" });
    const ok = await plugin.testApiConnection("translation", null, null);
    assert.equal(ok, true);
    assert.equal(testRequestToken, "LIVE-CUSTOM-TOKEN");
});

test("different-named primary custom credentials never enter fallback adapter buildRequest config", async () => {
    const plugin = new Plugin();
    let fallbackEffectiveConfig = null;
    plugin.providerLayer.registry.register({
        id: "customPrimaryDiff",
        label: "Primary Diff",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["alphaSecret"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://alpha-diff.example/v1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.alphaSecret || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://alpha-diff.example/v1",
        buildRequest(_kind, input, cfg) {
            return {
                endpoint: "https://alpha-diff.example/v1",
                request: { provider: "customPrimaryDiff", responseParser: "customPrimaryDiff", headers: { "X-Alpha": String(cfg?.alphaSecret || "") }, body: { text: input } }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });
    plugin.providerLayer.registry.register({
        id: "customFallbackDiff",
        label: "Fallback Diff",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["betaSecret"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://beta-diff.example/v1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.betaSecret || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://beta-diff.example/v1",
        buildRequest(_kind, input, cfg) {
            fallbackEffectiveConfig = { ...cfg };
            return {
                endpoint: "https://beta-diff.example/v1",
                request: { provider: "customFallbackDiff", responseParser: "customFallbackDiff", headers: { "X-Beta": String(cfg?.betaSecret || "") }, body: { text: input } }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "customPrimaryDiff";
    plugin.settings.translation.endpoint = "https://alpha-diff.example/v1";
    plugin.settings.translation.alphaSecret = "ALPHA-UNIQUE-SECRET";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["customFallbackDiff"];
    plugin.settings.translation.providerProfiles = {
        customFallbackDiff: { endpoint: "https://beta-diff.example/v1", betaSecret: "BETA-UNIQUE-SECRET" }
    };

    plugin.fetchApiResponseText = async (_endpoint, request) => {
        if (request.provider === "customPrimaryDiff") {
            const err = new Error("primary failed");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ text: "备用译文" });
    };

    const result = await plugin.runModelTask("translation", "hello", { mode: "manual" });
    assert.equal(result, "备用译文");
    assert.ok(fallbackEffectiveConfig);
    assert.equal(fallbackEffectiveConfig.betaSecret, "BETA-UNIQUE-SECRET");
    assert.equal(Object.prototype.hasOwnProperty.call(fallbackEffectiveConfig, "alphaSecret"), false);
    assert.equal(fallbackEffectiveConfig.alphaSecret, undefined);
});

test("loading settings with a removed provider clears old credentials when falling back to DeepSeek", () => {
    // Case 1: DeepSeek has no independent saved profile -> old provider's apiKey/custom fields must NOT leak to DeepSeek.
    const plugin = new Plugin();
    plugin.loadData = key => key === "settings"
        ? {
            translation: {
                enabled: true,
                provider: "removedCustomProvider",
                endpoint: "https://removed.example/v1/chat/completions",
                model: "removed-model",
                apiKey: "sk-removed-provider-secret",
                apiKeyOrigin: "https://removed.example",
                customRemovedToken: "REMOVED-CUSTOM-SECRET",
                apiStatus: { state: "success", message: "" }
            }
        }
        : null;
    plugin.saveData = () => true;
    plugin.loadSettings();

    assert.equal(plugin.settings.translation.provider, "deepseek");
    assert.equal(plugin.settings.translation.endpoint, "https://api.deepseek.com/chat/completions");
    assert.equal(plugin.settings.translation.apiKey, "");
    assert.equal(plugin.settings.translation.apiKeyOrigin, undefined);
    assert.equal(plugin.settings.translation.customRemovedToken, undefined);
    assert.equal(plugin.settings.translation.apiStatus.state, "untested");
    assert.equal(plugin.hasUsableApiConfig("translation"), false);
    // Attempting to build a DeepSeek request must throw missing-key, never putting the old key in Authorization.
    assert.throws(() => plugin.buildModelRequest("translation", "hello"));
    // Old provider's credentials are archived under its own providerProfile key rather than overwritten onto DeepSeek.
    assert.equal(plugin.settings.translation.providerProfiles.removedCustomProvider.apiKey, "sk-removed-provider-secret");

    // Case 2: DeepSeek already has its own independent profile -> rebinds to DeepSeek's own key, not the removed provider's key.
    const pluginWithDs = new Plugin();
    pluginWithDs.loadData = key => key === "settings"
        ? {
            translation: {
                enabled: true,
                provider: "removedCustomProvider",
                endpoint: "https://removed.example/v1/chat/completions",
                model: "removed-model",
                apiKey: "sk-removed-provider-secret",
                providerProfiles: {
                    deepseek: {
                        endpoint: "https://api.deepseek.com/chat/completions",
                        model: "deepseek-chat",
                        apiKey: "sk-independent-deepseek"
                    }
                }
            }
        }
        : null;
    pluginWithDs.saveData = () => true;
    pluginWithDs.loadSettings();

    assert.equal(pluginWithDs.settings.translation.provider, "deepseek");
    assert.equal(pluginWithDs.settings.translation.apiKey, "sk-independent-deepseek");
    const built = pluginWithDs.buildModelRequest("translation", "hello");
    assert.equal(built.request.headers.Authorization, "Bearer sk-independent-deepseek");
});

test("public bilingual pairs selected polish or translation endpoint strictly with its own custom credentials", async () => {
    const plugin = new Plugin();
    plugin.providerLayer.registry.register({
        id: "customDual",
        label: "Custom Dual",
        kind: "chat",
        tasks: { polish: true, translation: true },
        credentialFields: ["customToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://default.dual.example/v1/chat", model: "dual-1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.endpoint || "").trim() && String(cfg?.customToken || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://default.dual.example/v1/chat",
        buildRequest(_kind, input, cfg, def) {
            const endpoint = this.getEffectiveEndpoint(cfg, def);
            return {
                endpoint,
                request: {
                    provider: "customDual",
                    responseParser: "customDual",
                    headers: { "X-Dual-Token": String(cfg?.customToken || "") },
                    body: { model: cfg?.model || "dual-1", messages: [{ role: "user", content: input }] }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "customDual";
    plugin.settings.translation.endpoint = "https://translation.dual.example/v1/chat";
    plugin.settings.translation.model = "dual-translate";
    plugin.settings.translation.customToken = "TRANSLATION-PROFILE-TOKEN";

    plugin.settings.polish.enabled = true;
    plugin.settings.polish.provider = "customDual";
    plugin.settings.polish.endpoint = "https://polish.dual.example/v1/chat";
    plugin.settings.polish.model = "dual-polish";
    plugin.settings.polish.targetLanguage = "English";
    plugin.settings.polish.customToken = "POLISH-PROFILE-TOKEN";

    const calls = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        calls.push({ endpoint, token: request.headers?.["X-Dual-Token"] });
        // First attempt echoes Chinese to also exercise public-bilingual-retry snapshot preservation!
        if (calls.length === 1) return JSON.stringify({ text: "你好，今天过得怎么样？" });
        return JSON.stringify({ text: "Hello, how are you doing today?" });
    };

    const polishResult = await plugin.runPublicBilingualTranslationTask("你好，今天过得怎么样？");
    assert.equal(polishResult, "Hello, how are you doing today?");
    assert.deepEqual(calls, [
        { endpoint: "https://polish.dual.example/v1/chat", token: "POLISH-PROFILE-TOKEN" },
        { endpoint: "https://polish.dual.example/v1/chat", token: "POLISH-PROFILE-TOKEN" }
    ]);

    // When polish lacks its custom credential, public bilingual falls back to translation endpoint + translation token.
    calls.length = 0;
    plugin.settings.polish.customToken = "";
    plugin.fetchApiResponseText = async (endpoint, request) => {
        calls.push({ endpoint, token: request.headers?.["X-Dual-Token"] });
        return JSON.stringify({ text: "Hello, how are you doing today?" });
    };
    const translationResult = await plugin.runPublicBilingualTranslationTask("你好，今天过得怎么样？");
    assert.equal(translationResult, "Hello, how are you doing today?");
    assert.deepEqual(calls, [
        { endpoint: "https://translation.dual.example/v1/chat", token: "TRANSLATION-PROFILE-TOKEN" }
    ]);
});

test("concurrent custom-header requests with different credentials are not deduped and keys store digests only", async () => {
    const plugin = new Plugin();
    plugin.providerLayer.registry.register({
        id: "customHeaderAuth",
        label: "Custom Header Auth",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["accountToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://shared-endpoint.example/v1/translate" },
        hasUsableConfig: cfg => Boolean(String(cfg?.accountToken || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://shared-endpoint.example/v1/translate",
        buildRequest(_kind, input, cfg, def) {
            const endpoint = this.getEffectiveEndpoint(cfg, def);
            return {
                endpoint,
                request: {
                    provider: "customHeaderAuth",
                    responseParser: "customHeaderAuth",
                    headers: { "X-Account-Token": String(cfg?.accountToken || "") },
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "customHeaderAuth";
    plugin.settings.translation.endpoint = "https://shared-endpoint.example/v1/translate";

    const transportTokens = [];
    const gates = [];
    plugin.fetchApiResponseText = (_endpoint, request) => {
        const token = request.headers?.["X-Account-Token"];
        transportTokens.push(token);
        return new Promise(resolve => {
            gates.push(() => resolve(JSON.stringify({ text: `resp-for-${token}` })));
        });
    };

    const reqA = plugin.runModelTask("translation", "same text", {
        isolatedConfig: true,
        providerProfilePinned: true,
        configOverrides: { provider: "customHeaderAuth", endpoint: "https://shared-endpoint.example/v1/translate", accountToken: "SECRET-ACCOUNT-A" }
    });
    const reqB = plugin.runModelTask("translation", "same text", {
        isolatedConfig: true,
        providerProfilePinned: true,
        configOverrides: { provider: "customHeaderAuth", endpoint: "https://shared-endpoint.example/v1/translate", accountToken: "SECRET-ACCOUNT-B" }
    });
    // Also send a duplicate of Account A concurrently to verify same-account dedupe still works.
    const reqA2 = plugin.runModelTask("translation", "same text", {
        isolatedConfig: true,
        providerProfilePinned: true,
        configOverrides: { provider: "customHeaderAuth", endpoint: "https://shared-endpoint.example/v1/translate", accountToken: "SECRET-ACCOUNT-A" }
    });

    // Keys stored in translationRequests must not contain plaintext secrets.
    for (const key of plugin.translationRequests.keys()) {
        assert.equal(key.includes("SECRET-ACCOUNT-A"), false);
        assert.equal(key.includes("SECRET-ACCOUNT-B"), false);
    }

    assert.equal(transportTokens.length, 2);
    assert.deepEqual(transportTokens, ["SECRET-ACCOUNT-A", "SECRET-ACCOUNT-B"]);
    gates.forEach(release => release());

    const [resA, resB, resA2] = await Promise.all([reqA, reqB, reqA2]);
    assert.equal(resA, "resp-for-SECRET-ACCOUNT-A");
    assert.equal(resA2, "resp-for-SECRET-ACCOUNT-A");
    assert.equal(resB, "resp-for-SECRET-ACCOUNT-B");
});

test("manual long-text chunking invokes configured fallback provider on chunk error while auto long-text does not", async () => {
    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-primary-ds";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.targetLanguage = "Chinese (Simplified)";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible"];
    plugin.settings.translation.providerProfiles = {
        openaiCompatible: { endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o-mini", apiKey: "sk-fallback-oai" }
    };

    // Build a realistic 3,200+ char multi-paragraph message so chunking triggers naturally.
    const para1 = "Paragraph one explains distributed system reliability and careful failure isolation. ".repeat(14).trim();
    const para2 = "Paragraph two covers backpressure, timeouts, and deterministic retry scheduling. ".repeat(14).trim();
    const para3 = "Paragraph three summarizes verification metrics and rollback guarantees cleanly. ".repeat(14).trim();
    const longMessage = [para1, para2, para3].join("\n\n");
    assert.ok(longMessage.length > 3000);
    assert.equal(plugin.isLongAutoTranslationText(longMessage), true);

    const calls = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        calls.push({ provider: request.provider, isPara1: userText.includes("Paragraph one") });
        // Primary fails with 500 on chunk 1; fallback succeeds on chunk 1; primary succeeds on remaining chunks.
        if (request.provider === "deepseek" && userText.includes("Paragraph one")) {
            const err = new Error("primary chunk 500");
            err.status = 500;
            throw err;
        }
        if (userText.includes("Paragraph one")) {
            return JSON.stringify({ choices: [{ message: { content: "第一段详细说明了分布式系统的可靠性设计与故障隔离机制。".repeat(4) } }] });
        }
        if (userText.includes("Paragraph two")) {
            return JSON.stringify({ choices: [{ message: { content: "第二段讨论了背压控制、超时策略与确定性的重试调度方案。".repeat(4) } }] });
        }
        return JSON.stringify({ choices: [{ message: { content: "第三段总结了自动化验证指标以及安全回滚的工程保障措施。".repeat(4) } }] });
    };

    // Skip whole-pass so chunked path runs directly (3,200+ chars also skips whole pass naturally if > max length).
    plugin.runManualLongTextWholePass = async () => null;
    const plan = {
        text: longMessage,
        domText: longMessage,
        cacheKey: "manual-long-fallback-key",
        sourceHash: plugin.getStrongTextFingerprint(longMessage),
        requestOptions: plugin.getManualTranslationRequestOptions()
    };
    const result = await plugin.runManualTranslationPlan(plan);
    const translated = typeof result === "string" ? result : String(result?.translated || "");
    assert.ok(translated.includes("第一段详细说明了分布式系统的可靠性设计与故障隔离机制。"));
    assert.ok(calls.some(entry => entry.provider === "openaiCompatible" && entry.isPara1),
        `expected openaiCompatible fallback call for chunk 1, got: ${JSON.stringify(calls)}`);

    // Contrast: automatic long-text translation must NOT call manual cloud fallback.
    const autoCalls = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        autoCalls.push(request.provider);
        const err = new Error("auto primary 500");
        err.status = 500;
        throw err;
    };
    await assert.rejects(() => plugin.runLongAutoTranslationTask(longMessage, plugin.getAutoTranslationOptions()));
    assert.equal(autoCalls.includes("openaiCompatible"), false);
});

test("verified custom provider archive preserves custom credentials across switch/reapply and shares fallback candidate filtering", async t => {
    useGlobals(t, {
        document: { querySelectorAll: () => [] }
    });

    const plugin = new Plugin();
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.syncSettingControls = () => {};
    plugin.setApiRuntimeStatus = () => {};
    plugin.refreshApiTestViews = () => {};
    plugin.refreshSavedServiceConfigControls = () => {};
    plugin.syncTaskControlsInOpenPanels = () => {};
    plugin.showToast = () => {};

    plugin.providerLayer.registry.register({
        id: "customEndToEnd",
        label: "Custom EndToEnd",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["customToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://e2e.custom.example/v1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.customToken || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://e2e.custom.example/v1",
        buildTestRequest(_kind, cfg, def) {
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "customEndToEnd",
                    responseParser: "customEndToEnd",
                    headers: { "X-E2E-Token": String(cfg?.customToken || "") },
                    body: { ping: true }
                }
            };
        },
        buildRequest(_kind, input, cfg, def) {
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "customEndToEnd",
                    responseParser: "customEndToEnd",
                    headers: { "X-E2E-Token": String(cfg?.customToken || "") },
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.providerLayer.registry.register({
        id: "customPolishOnly",
        label: "Custom Polish Only",
        kind: "chat",
        tasks: { polish: true, translation: false },
        credentialFields: ["apiKey"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://polish-only.example/v1/chat", model: "po-1" },
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://polish-only.example/v1/chat",
        buildRequest: () => ({ endpoint: "https://polish-only.example/v1/chat", request: { provider: "customPolishOnly", body: {} } }),
        parseResponse: raw => raw
    });

    // 1. Settings UI and runtime fallback candidate lists both include customEndToEnd and exclude customPolishOnly + sakuraLocal.
    const uiCandidates = plugin.getProviderFallbackCandidates();
    assert.equal(uiCandidates.includes("customEndToEnd"), true);
    assert.equal(uiCandidates.includes("customPolishOnly"), false);
    assert.equal(uiCandidates.includes("sakuraLocal"), false);

    plugin.settings.translation.provider = "deepseek";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["customPolishOnly", "customEndToEnd", "sakuraLocal"];
    assert.deepEqual(plugin.getProviderFallbackOrder("translation"), ["customEndToEnd"]);

    // 2. End-to-end: testApiConnection -> saveVerifiedServiceConfig -> switch away -> applySavedServiceConfig -> runModelTask.
    const sentTokens = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        sentTokens.push(request.headers?.["X-E2E-Token"]);
        return JSON.stringify({ text: "E2E成功译文" });
    };
    plugin.setTaskProvider("translation", "customEndToEnd");
    plugin.settings.translation.customToken = "E2E-VERIFIED-TOKEN";
    const tested = await plugin.testApiConnection("translation", null, null);
    assert.equal(tested, true);

    const savedEntry = plugin.settings.serviceConfigs.find(entry => entry.provider === "customEndToEnd");
    assert.ok(savedEntry);
    assert.equal(savedEntry.customToken, "E2E-VERIFIED-TOKEN");

    // Switch away and even wipe providerProfiles to ensure restoration comes from the saved serviceConfig archive itself.
    plugin.setTaskProvider("translation", "deepseek");
    delete plugin.settings.translation.providerProfiles.customEndToEnd;
    assert.equal(plugin.settings.translation.customToken, undefined);

    assert.equal(plugin.applySavedServiceConfig("translation", savedEntry.id, { silent: true, save: false, refreshUi: false }), true);
    assert.equal(plugin.settings.translation.provider, "customEndToEnd");
    assert.equal(plugin.settings.translation.customToken, "E2E-VERIFIED-TOKEN");
    assert.equal(plugin.hasUsableApiConfig("translation"), true);

    const translated = await plugin.runModelTask("translation", "hello", { mode: "manual" });
    assert.equal(translated, "E2E成功译文");
    assert.deepEqual(sentTokens, ["E2E-VERIFIED-TOKEN", "E2E-VERIFIED-TOKEN"]);
});

test("public bilingual ignores polish profile when its custom credential field is completely absent", async () => {
    const plugin = new Plugin();
    plugin.providerLayer.registry.register({
        id: "customAbsentCred",
        label: "Custom Absent Cred",
        kind: "chat",
        tasks: { polish: true, translation: true },
        credentialFields: ["customToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://default.absent.example/v1/chat", model: "abs-1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.endpoint || "").trim() && String(cfg?.customToken || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://default.absent.example/v1/chat",
        buildRequest(_kind, input, cfg, def) {
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "customAbsentCred",
                    responseParser: "customAbsentCred",
                    headers: { "X-Custom-Token": String(cfg?.customToken || "") },
                    body: { model: cfg?.model || "abs-1", messages: [{ role: "user", content: input }] }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "customAbsentCred";
    plugin.settings.translation.endpoint = "https://translation.absent.example/v1/chat";
    plugin.settings.translation.model = "abs-translate";
    plugin.settings.translation.customToken = "TRANSLATION-VALID-TOKEN";

    plugin.settings.polish.enabled = true;
    plugin.settings.polish.provider = "customAbsentCred";
    plugin.settings.polish.endpoint = "https://polish.absent.example/v1/chat";
    plugin.settings.polish.model = "abs-polish";
    plugin.settings.polish.targetLanguage = "English";
    // Crucial: completely omit customToken property on polish (undefined, not "").
    delete plugin.settings.polish.customToken;

    const calls = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        const token = request.headers?.["X-Custom-Token"] || "";
        calls.push({ endpoint, token });
        if (!token) {
            const err = new Error("Unauthorized");
            err.status = 401;
            throw err;
        }
        return JSON.stringify({ text: "Hello, how are you doing today?" });
    };

    const result = await plugin.runPublicBilingualTranslationTask("你好，今天过得怎么样？");
    assert.equal(result, "Hello, how are you doing today?");
    assert.deepEqual(calls, [
        { endpoint: "https://translation.absent.example/v1/chat", token: "TRANSLATION-VALID-TOKEN" }
    ]);
});

test("reloading with a removed provider updates its existing archive with live values, preserves recentModels, and reflects cleared credentials", () => {
    const plugin = new Plugin();
    plugin.loadData = key => key === "settings"
        ? {
            translation: {
                enabled: true,
                provider: "removedUpdatingCustom",
                endpoint: "https://live-updated.example/v1",
                model: "live-model-v2",
                apiKey: "sk-live-updated-key",
                customToken: "",
                providerProfiles: {
                    removedUpdatingCustom: {
                        endpoint: "https://stale-old.example/v1",
                        model: "stale-model-v1",
                        apiKey: "sk-stale-old-key",
                        apiKeyOrigin: "https://stale-old.example",
                        customToken: "tok-stale-old",
                        droppedSecret: "tok-removed-from-live",
                        recentModels: ["hist-model-a", "hist-model-b"]
                    }
                }
            }
        }
        : null;
    plugin.saveData = () => true;
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.syncSettingControls = () => {};
    plugin.invalidateAutoTranslationQueue = () => {};
    plugin.loadSettings();

    // Active provider safely fell back to DeepSeek without leaking the removed provider's key.
    assert.equal(plugin.settings.translation.provider, "deepseek");
    assert.equal(plugin.settings.translation.apiKey, "");
    assert.equal(plugin.settings.translation.customToken, undefined);

    // Existing archive was updated with latest live fields, cleared credentials stayed cleared, and recentModels survived.
    const archived = plugin.settings.translation.providerProfiles.removedUpdatingCustom;
    assert.equal(archived.endpoint, "https://live-updated.example/v1");
    assert.equal(archived.model, "live-model-v2");
    assert.equal(archived.apiKey, "sk-live-updated-key");
    assert.equal(archived.customToken, "");
    assert.equal(archived.droppedSecret, undefined);
    assert.equal(archived.apiKeyOrigin, undefined);
    assert.deepEqual(archived.recentModels, ["hist-model-a", "hist-model-b"]);

    // Re-registering and selecting the provider restores the updated live config, not the stale archive.
    plugin.providerLayer.registry.register({
        id: "removedUpdatingCustom",
        label: "Removed Updating Custom",
        kind: "chat",
        tasks: { polish: false, translation: true },
        credentialFields: ["apiKey", "customToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://default.example/v1", model: "default-m" }
    });
    plugin.setTaskProvider("translation", "removedUpdatingCustom");
    assert.equal(plugin.settings.translation.endpoint, "https://live-updated.example/v1");
    assert.equal(plugin.settings.translation.model, "live-model-v2");
    assert.equal(plugin.settings.translation.apiKey, "sk-live-updated-key");
    assert.equal(plugin.settings.translation.customToken, "");
    assert.deepEqual(plugin.settings.translation.providerProfiles.removedUpdatingCustom.recentModels, ["hist-model-a", "hist-model-b"]);
});

test("concurrent custom requests using Web Headers objects or tuple arrays do not dedupe across distinct accounts", async () => {
    const plugin = new Plugin();
    plugin.providerLayer.registry.register({
        id: "customHeadersObj",
        label: "Custom Headers Object",
        kind: "direct",
        tasks: { polish: false, translation: true },
        // Deliberately empty: accounts are distinguished ONLY via request headers.
        credentialFields: [],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://headers-obj.example/v1/translate" },
        hasUsableConfig: () => true,
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://headers-obj.example/v1/translate",
        buildRequest(_kind, input, cfg, def, options) {
            const token = String(options?.accountHeaderToken || "");
            const headers = options?.useTupleHeaders
                ? [["Content-Type", "application/json"], ["X-Tenant-Auth", token]]
                : new Headers({ "Content-Type": "application/json", "X-Tenant-Auth": token });
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "customHeadersObj",
                    responseParser: "customHeadersObj",
                    headers,
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "customHeadersObj";

    const readToken = headers => {
        if (typeof headers?.get === "function") return headers.get("X-Tenant-Auth") || "";
        if (Array.isArray(headers)) return headers.find(([k]) => String(k).toLowerCase() === "x-tenant-auth")?.[1] || "";
        return headers?.["X-Tenant-Auth"] || "";
    };

    // 1. Standard Web Headers instance.
    const transportTokens = [];
    const gates = [];
    plugin.fetchApiResponseText = (_endpoint, request) => {
        const token = readToken(request.headers);
        transportTokens.push(token);
        return new Promise(resolve => {
            gates.push(() => resolve(JSON.stringify({ text: `headers-resp-${token}` })));
        });
    };

    const reqA = plugin.runModelTask("translation", "identical payload", {
        providerProfilePinned: true,
        accountHeaderToken: "HEADER-ACCT-ALPHA"
    });
    const reqB = plugin.runModelTask("translation", "identical payload", {
        providerProfilePinned: true,
        accountHeaderToken: "HEADER-ACCT-BETA"
    });
    const reqA2 = plugin.runModelTask("translation", "identical payload", {
        providerProfilePinned: true,
        accountHeaderToken: "HEADER-ACCT-ALPHA"
    });

    for (const key of plugin.translationRequests.keys()) {
        assert.equal(key.includes("HEADER-ACCT-ALPHA"), false);
        assert.equal(key.includes("HEADER-ACCT-BETA"), false);
    }
    assert.deepEqual(transportTokens, ["HEADER-ACCT-ALPHA", "HEADER-ACCT-BETA"]);
    gates.forEach(release => release());
    assert.deepEqual(await Promise.all([reqA, reqB, reqA2]), [
        "headers-resp-HEADER-ACCT-ALPHA",
        "headers-resp-HEADER-ACCT-BETA",
        "headers-resp-HEADER-ACCT-ALPHA"
    ]);

    // 2. Tuple array header representation ([key, value][]).
    transportTokens.length = 0;
    gates.length = 0;
    const tupleA = plugin.runModelTask("translation", "tuple payload", {
        providerProfilePinned: true,
        useTupleHeaders: true,
        accountHeaderToken: "TUPLE-ACCT-1"
    });
    const tupleB = plugin.runModelTask("translation", "tuple payload", {
        providerProfilePinned: true,
        useTupleHeaders: true,
        accountHeaderToken: "TUPLE-ACCT-2"
    });
    assert.deepEqual(transportTokens, ["TUPLE-ACCT-1", "TUPLE-ACCT-2"]);
    gates.forEach(release => release());
    assert.deepEqual(await Promise.all([tupleA, tupleB]), [
        "headers-resp-TUPLE-ACCT-1",
        "headers-resp-TUPLE-ACCT-2"
    ]);
});

test("long-text chunk 1 multi-fallback reserves budget for remaining chunks so chunk 5 is never starved", async () => {
    const plugin = new Plugin();
    const fallbackIds = ["fbOne", "fbTwo", "fbThree", "fbFour", "fbFive"];
    for (const id of fallbackIds) {
        plugin.providerLayer.registry.register({
            id,
            label: id,
            kind: "chat",
            tasks: { polish: false, translation: true },
            credentialFields: ["apiKey"],
            allowCloudFallback: true,
            defaultProfile: { endpoint: `https://${id}.example/v1/chat`, model: `${id}-m` },
            getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || `https://${id}.example/v1/chat`,
            buildRequest(_kind, input, cfg, def) {
                return {
                    endpoint: this.getEffectiveEndpoint(cfg, def),
                    request: {
                        provider: id,
                        headers: { Authorization: `Bearer ${cfg?.apiKey || ""}` },
                        body: { model: cfg?.model || `${id}-m`, messages: [{ role: "user", content: input }] }
                    }
                };
            }
        });
    }

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-primary-long";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.targetLanguage = "Chinese (Simplified)";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = [...fallbackIds];
    plugin.settings.translation.providerProfiles = Object.fromEntries(
        fallbackIds.map(id => [id, { endpoint: `https://${id}.example/v1/chat`, model: `${id}-m`, apiKey: `sk-${id}` }])
    );

    // Build a 5-chunk long message (~3,600 chars -> 5 chunks at default 900-char chunk length).
    const paragraphs = [
        "ChunkOne describes distributed storage replication and quorum durability invariants clearly. ".repeat(8).trim(),
        "ChunkTwo explains deterministic scheduler backpressure and bounded queue admission policies. ".repeat(8).trim(),
        "ChunkThree outlines streaming transport cancellation semantics and cleanup guarantees safely. ".repeat(8).trim(),
        "ChunkFour details adaptive chunking heuristics and output validation boundary checks well. ".repeat(8).trim(),
        "ChunkFive summarizes end-to-end telemetry diagnostics and budget accounting safeguards fully. ".repeat(8).trim()
    ];
    const longText = paragraphs.join("\n\n");
    const manualOptions = plugin.getManualTranslationRequestOptions();
    const longOptions = plugin.getLongTextTranslationOptions(manualOptions, longText);
    const chunks = plugin.splitLongAutoTranslationText(longText, plugin.getLongAutoTranslationChunkLength(longOptions));
    assert.equal(chunks.length, 5);

    const chineseReplies = {
        ChunkOne: "第一部分详细描述了分布式存储副本复制以及法定人数持久性不变式。".repeat(4),
        ChunkTwo: "第二部分解释了确定性调度器的背压机制与有界队列准入策略。".repeat(4),
        ChunkThree: "第三部分概述了流式传输取消语义以及资源清理的安全保证。".repeat(4),
        ChunkFour: "第四部分介绍了自适应分块启发式规则与输出校验边界检查。".repeat(4),
        ChunkFive: "第五部分总结了端到端遥测诊断指标以及请求预算记账保护措施。".repeat(4)
    };
    const matchKey = text => Object.keys(chineseReplies).find(k => text.includes(k)) || "";

    // Case A: Budget = 9 for 5 chunks (4 reserved for chunks 2..5).
    // Chunk 1 fails primary + fbOne..fbThree, succeeds on fbFour (5th request total).
    // Chunks 2..5 all succeed on primary (requests 6..9). All 5 chunks translated!
    const callsA = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsA.push({ provider: request.provider, key });
        if (key === "ChunkOne" && ["deepseek", "fbOne", "fbTwo", "fbThree"].includes(request.provider)) {
            const err = new Error("chunk 1 failure");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ choices: [{ message: { content: chineseReplies[key] } }] });
    };
    const budgetA = plugin.createAutoTranslationRequestBudget(9);
    const taskOptionsA = { requestBudget: budgetA, manualRescue: true };
    const resultA = await plugin.runLongAutoTranslationTask(longText, manualOptions, taskOptionsA);
    assert.equal(budgetA.used, 9);
    assert.equal(budgetA.reserved, 0);
    for (const expected of Object.values(chineseReplies)) {
        assert.ok(resultA.includes(expected));
    }

    // Case B: Budget = 9 for 5 chunks, and Chunk 1 fails primary + fbOne..fbFour with a non-stop
    // client error (400) so fbFive MUST be blocked by the reservation (preserving 4 slots for chunks 2..5).
    const callsB = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsB.push({ provider: request.provider, key });
        if (key === "ChunkOne") {
            const err = new Error("bad chunk 1");
            err.status = 400;
            throw err;
        }
        return JSON.stringify({ choices: [{ message: { content: chineseReplies[key] } }] });
    };
    const budgetB = plugin.createAutoTranslationRequestBudget(9);
    const taskOptionsB = { requestBudget: budgetB, manualRescue: true };
    const resultB = await plugin.runLongAutoTranslationTask(longText, manualOptions, taskOptionsB);
    assert.equal(callsB.some(c => c.provider === "fbFive"), false, "chunk 1 must not consume chunk 5's reserved slot");
    assert.equal(callsB.some(c => c.key === "ChunkFive"), true, "chunk 5 must still run with its reserved request");
    assert.ok(resultB.includes(chineseReplies.ChunkFive));
    assert.equal(budgetB.used, 9);
    assert.equal(budgetB.reserved, 0);

    // Case C: Extreme tight budget (limit = 3 < 5 chunks) still lets chunks 1..3 execute their
    // own primary attempts without chunk 1 fallbacks stealing chunk 2/3 slots.
    const callsC = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsC.push({ provider: request.provider, key });
        if (key === "ChunkOne") {
            const err = new Error("chunk 1 client error");
            err.status = 400;
            throw err;
        }
        return JSON.stringify({ choices: [{ message: { content: chineseReplies[key] } }] });
    };
    const budgetC = plugin.createAutoTranslationRequestBudget(3);
    const taskOptionsC = { requestBudget: budgetC, manualRescue: true };
    const resultC = await plugin.runLongAutoTranslationTask(longText, manualOptions, taskOptionsC);
    assert.deepEqual(callsC, [
        { provider: "deepseek", key: "ChunkOne" },
        { provider: "deepseek", key: "ChunkTwo" },
        { provider: "deepseek", key: "ChunkThree" }
    ]);
    assert.ok(resultC.includes(chineseReplies.ChunkTwo));
    assert.ok(resultC.includes(chineseReplies.ChunkThree));
    assert.equal(budgetC.used, 3);
    assert.equal(budgetC.reserved, 0);
});

test("primary and fallback request builders never receive providerProfiles or other providers' historical credentials", async () => {
    const plugin = new Plugin();
    const seenPrimaryConfigs = [];
    const seenFallbackConfigs = [];

    plugin.providerLayer.registry.register({
        id: "primaryInspect",
        label: "Primary Inspect",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["primaryToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://primary-inspect.example/v1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.primaryToken || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://primary-inspect.example/v1",
        buildRequest(_kind, input, cfg, def) {
            seenPrimaryConfigs.push({ ...cfg });
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "primaryInspect",
                    responseParser: "primaryInspect",
                    headers: { "X-Primary": String(cfg?.primaryToken || "") },
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.providerLayer.registry.register({
        id: "backupInspect",
        label: "Backup Inspect",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: ["backupSecret"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://backup-inspect.example/v1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.backupSecret || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://backup-inspect.example/v1",
        buildRequest(_kind, input, cfg, def) {
            seenFallbackConfigs.push({ ...cfg });
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "backupInspect",
                    responseParser: "backupInspect",
                    headers: { "X-Backup": String(cfg?.backupSecret || "") },
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "primaryInspect";
    plugin.settings.translation.primaryToken = "PRIMARY-SECRET-VALUE";
    plugin.settings.translation.providerProfiles = {
        deepseek: { apiKey: "HISTORICAL-DEEPSEEK-SECRET" },
        openaiCompatible: { apiKey: "HISTORICAL-OPENAI-SECRET" },
        primaryInspect: { primaryToken: "HISTORICAL-PRIMARY-SECRET" },
        backupInspect: { endpoint: "https://backup-inspect.example/v1", backupSecret: "BACKUP-SECRET-VALUE" }
    };
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["backupInspect"];

    // Direct check on getProviderFallbackConfig.
    const fbCfg = plugin.getProviderFallbackConfig("translation", "backupInspect", plugin.settings.translation);
    assert.equal("providerProfiles" in fbCfg, false);
    assert.equal("promptTemplates" in fbCfg, false);
    assert.equal("apiStatus" in fbCfg, false);
    assert.equal("primaryToken" in fbCfg, false);
    assert.equal(fbCfg.backupSecret, "BACKUP-SECRET-VALUE");

    // End-to-end runtime check through primary -> fallback.
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        if (request.provider === "primaryInspect") {
            const err = new Error("primary 500");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ text: "备用隔离成功" });
    };

    const result = await plugin.runModelTask("translation", "hello isolation", { mode: "manual" });
    assert.equal(result, "备用隔离成功");
    assert.equal(seenPrimaryConfigs.length, 1);
    assert.equal(seenFallbackConfigs.length, 1);

    const primarySerialized = JSON.stringify(seenPrimaryConfigs[0]);
    assert.equal("providerProfiles" in seenPrimaryConfigs[0], false);
    assert.equal(primarySerialized.includes("HISTORICAL-DEEPSEEK-SECRET"), false);
    assert.equal(primarySerialized.includes("BACKUP-SECRET-VALUE"), false);

    const fallbackSerialized = JSON.stringify(seenFallbackConfigs[0]);
    assert.equal("providerProfiles" in seenFallbackConfigs[0], false);
    assert.equal("promptTemplates" in seenFallbackConfigs[0], false);
    assert.equal("apiStatus" in seenFallbackConfigs[0], false);
    assert.equal("primaryToken" in seenFallbackConfigs[0], false);
    assert.equal(fallbackSerialized.includes("PRIMARY-SECRET-VALUE"), false);
    assert.equal(fallbackSerialized.includes("HISTORICAL-DEEPSEEK-SECRET"), false);
    assert.equal(fallbackSerialized.includes("HISTORICAL-OPENAI-SECRET"), false);
    assert.equal(fallbackSerialized.includes("HISTORICAL-PRIMARY-SECRET"), false);
    assert.equal(seenFallbackConfigs[0].backupSecret, "BACKUP-SECRET-VALUE");
});

test("long-text chunk 1 500 hitting reserved fallback budget continues to remaining chunks instead of aborting whole message", async () => {
    const plugin = new Plugin();
    const fallbackIds = ["sfbOne", "sfbTwo", "sfbThree", "sfbFour", "sfbFive"];
    for (const id of fallbackIds) {
        plugin.providerLayer.registry.register({
            id,
            label: id,
            kind: "chat",
            tasks: { polish: false, translation: true },
            credentialFields: ["apiKey"],
            allowCloudFallback: true,
            defaultProfile: { endpoint: `https://${id}.example/v1/chat`, model: `${id}-m` },
            getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || `https://${id}.example/v1/chat`,
            buildRequest(_kind, input, cfg, def) {
                return {
                    endpoint: this.getEffectiveEndpoint(cfg, def),
                    request: {
                        provider: id,
                        headers: { Authorization: `Bearer ${cfg?.apiKey || ""}` },
                        body: { model: cfg?.model || `${id}-m`, messages: [{ role: "user", content: input }] }
                    }
                };
            }
        });
    }

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-primary-500";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.targetLanguage = "Chinese (Simplified)";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = [...fallbackIds];
    plugin.settings.translation.providerProfiles = Object.fromEntries(
        fallbackIds.map(id => [id, { endpoint: `https://${id}.example/v1/chat`, model: `${id}-m`, apiKey: `sk-${id}` }])
    );

    const paragraphs = [
        "SegOne describes distributed storage replication and quorum durability invariants clearly. ".repeat(8).trim(),
        "SegTwo explains deterministic scheduler backpressure and bounded queue admission policies. ".repeat(8).trim(),
        "SegThree outlines streaming transport cancellation semantics and cleanup guarantees safely. ".repeat(8).trim(),
        "SegFour details adaptive chunking heuristics and output validation boundary checks well. ".repeat(8).trim(),
        "SegFive summarizes end-to-end telemetry diagnostics and budget accounting safeguards fully. ".repeat(8).trim()
    ];
    const longText = paragraphs.join("\n\n");
    const manualOptions = plugin.getManualTranslationRequestOptions();
    const longOptions = plugin.getLongTextTranslationOptions(manualOptions, longText);
    assert.equal(plugin.splitLongAutoTranslationText(longText, plugin.getLongAutoTranslationChunkLength(longOptions)).length, 5);

    const chineseReplies = {
        SegOne: "第一部分详细描述了分布式存储副本复制以及法定人数持久性不变式。".repeat(4),
        SegTwo: "第二部分解释了确定性调度器的背压机制与有界队列准入策略。".repeat(4),
        SegThree: "第三部分概述了流式传输取消语义以及资源清理的安全保证。".repeat(4),
        SegFour: "第四部分介绍了自适应分块启发式规则与输出校验边界检查。".repeat(4),
        SegFive: "第五部分总结了端到端遥测诊断指标以及请求预算记账保护措施。".repeat(4)
    };
    const matchKey = text => Object.keys(chineseReplies).find(k => text.includes(k)) || "";

    // Case A (exact Codex repro): chunk 1 fails primary + sfbOne..sfbFour with 500, sfbFive is blocked
    // by the 4-request reservation for chunks 2..5, and primary succeeds on chunks 2..5.
    const callsA = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsA.push({ provider: request.provider, key });
        if (key === "SegOne" && ["deepseek", "sfbOne", "sfbTwo", "sfbThree", "sfbFour"].includes(request.provider)) {
            const err = new Error("server 500 on chunk 1");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ choices: [{ message: { content: chineseReplies[key] } }] });
    };
    const budgetA = plugin.createAutoTranslationRequestBudget(9);
    const taskOptionsA = { requestBudget: budgetA, manualRescue: true };
    const resultA = await plugin.runLongAutoTranslationTask(longText, manualOptions, taskOptionsA);
    assert.equal(callsA.some(c => c.provider === "sfbFive"), false, "sfbFive must remain blocked by chunk reservation");
    assert.deepEqual(
        callsA.filter(c => c.key !== "SegOne").map(c => c.key),
        ["SegTwo", "SegThree", "SegFour", "SegFive"]
    );
    assert.equal(budgetA.used, 9);
    assert.equal(budgetA.reserved, 0);
    assert.equal(taskOptionsA.longTextPartial, true);
    assert.deepEqual(taskOptionsA.longTextPartialInfo, { missingSegments: [1], totalSegments: 5 });
    for (const key of ["SegTwo", "SegThree", "SegFour", "SegFive"]) {
        assert.ok(resultA.includes(chineseReplies[key]));
    }

    // Case B: Truly dead primary returning 500 on every chunk aborts after chunk 2 confirms outage
    // instead of hammering chunks 3..5.
    const callsB = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsB.push({ provider: request.provider, key });
        const err = new Error("global server outage");
        err.status = 500;
        throw err;
    };
    const budgetB = plugin.createAutoTranslationRequestBudget(9);
    await assert.rejects(
        () => plugin.runLongAutoTranslationTask(longText, manualOptions, { requestBudget: budgetB, manualRescue: true }),
        err => err?.status === 500
    );
    assert.equal(callsB.some(c => ["SegThree", "SegFour", "SegFive"].includes(c.key)), false);
    assert.equal(budgetB.reserved, 0);

    // Case C: Hard auth error (401) on chunk 1 still aborts immediately without probing chunk 2.
    const callsC = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsC.push({ provider: request.provider, key });
        const err = new Error("unauthorized");
        err.status = 401;
        throw err;
    };
    const budgetC = plugin.createAutoTranslationRequestBudget(9);
    await assert.rejects(
        () => plugin.runLongAutoTranslationTask(longText, manualOptions, { requestBudget: budgetC, manualRescue: true }),
        err => err?.status === 401
    );
    assert.equal(callsC.some(c => c.key !== "SegOne"), false);
    assert.equal(budgetC.reserved, 0);
});

test("public bilingual skips polish-only custom adapters and falls back to the usable translation profile", async () => {
    const plugin = new Plugin();
    let polishOnlyBuildCalls = 0;
    plugin.providerLayer.registry.register({
        id: "strictPolishOnly",
        label: "Strict Polish Only",
        kind: "chat",
        tasks: { polish: true, translation: false },
        credentialFields: ["polishToken"],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://polish-only-bilingual.example/v1/chat", model: "po-v1" },
        hasUsableConfig: cfg => Boolean(String(cfg?.endpoint || "").trim() && String(cfg?.polishToken || "").trim()),
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://polish-only-bilingual.example/v1/chat",
        buildRequest(kind) {
            polishOnlyBuildCalls++;
            if (kind === "translation") throw new Error("polish-only adapter cannot run translation tasks");
            return {
                endpoint: "https://polish-only-bilingual.example/v1/chat",
                request: { provider: "strictPolishOnly", body: {} }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.polish.enabled = true;
    plugin.settings.polish.provider = "strictPolishOnly";
    plugin.settings.polish.endpoint = "https://polish-only-bilingual.example/v1/chat";
    plugin.settings.polish.model = "po-v1";
    plugin.settings.polish.polishToken = "VALID-POLISH-ONLY-TOKEN";
    plugin.settings.polish.targetLanguage = "English";

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.apiKey = "sk-usable-translation";

    const calls = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        calls.push({ endpoint, provider: request.provider, auth: request.headers?.Authorization });
        return JSON.stringify({ choices: [{ message: { content: "Hello, how are you doing today?" } }] });
    };

    const result = await plugin.runPublicBilingualTranslationTask("你好，今天过得怎么样？");
    assert.equal(result, "Hello, how are you doing today?");
    assert.equal(polishOnlyBuildCalls, 0);
    assert.deepEqual(calls, [{
        endpoint: "https://api.deepseek.com/chat/completions",
        provider: "deepseek",
        auth: "Bearer sk-usable-translation"
    }]);
});

test("duplicate request headers preserve order and comma-joined values consistently across BetterDiscord transport and dedupe keys", async t => {
    const bdCalls = [];
    useGlobals(t, {
        BdApi: {
            Net: {
                fetch: async (endpoint, options) => {
                    bdCalls.push({ endpoint, headers: options.headers });
                    return { ok: true, status: 200, url: endpoint, text: async () => JSON.stringify({ text: "ok" }) };
                }
            }
        }
    });

    const plugin = new Plugin();

    // 1. BetterDiscord transport folds duplicate tuple/Headers/case-variant names via comma-join in insertion order.
    await plugin.providerLayer.fetchViaBetterDiscordNet("https://dup-headers.example/v1", {
        method: "POST",
        headers: [["X-Scope", "alpha"], ["X-Scope", "beta"]],
        body: "{}"
    });
    await plugin.providerLayer.fetchViaBetterDiscordNet("https://dup-headers.example/v1", {
        method: "POST",
        headers: [["X-Scope", "beta"], ["x-scope", "alpha"]],
        body: "{}"
    });
    await plugin.providerLayer.fetchViaBetterDiscordNet("https://dup-headers.example/v1", {
        method: "POST",
        headers: new Headers([["X-Scope", "alpha"], ["X-Scope", "beta"]]),
        body: "{}"
    });
    assert.deepEqual(bdCalls.map(entry => entry.headers), [
        { "X-Scope": "alpha, beta" },
        { "X-Scope": "beta, alpha" },
        { "x-scope": "alpha, beta" }
    ]);

    // 2. Dedupe key distinguishes reversed duplicate header order and matches equivalent Headers / tuple representations.
    plugin.providerLayer.registry.register({
        id: "dupHeaderOrder",
        label: "Duplicate Header Order",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: [],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://dup-order.example/v1/translate" },
        hasUsableConfig: () => true,
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://dup-order.example/v1/translate",
        buildRequest(_kind, input, cfg, def, options) {
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "dupHeaderOrder",
                    responseParser: "dupHeaderOrder",
                    headers: options.customHeaders,
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "dupHeaderOrder";

    const transportScopes = [];
    const gates = [];
    plugin.fetchApiResponseText = (_endpoint, request) => {
        const normalized = plugin.providerLayer.getRequestHeaderEntries(request.headers);
        const scope = normalized.find(([k]) => k === "x-scope")?.[1] || "";
        transportScopes.push(scope);
        return new Promise(resolve => {
            gates.push(() => resolve(JSON.stringify({ text: `scope:${scope}` })));
        });
    };

    const reqAB = plugin.runModelTask("translation", "same body", {
        providerProfilePinned: true,
        customHeaders: [["X-Scope", "alpha"], ["X-Scope", "beta"]]
    });
    const reqBA = plugin.runModelTask("translation", "same body", {
        providerProfilePinned: true,
        customHeaders: [["X-Scope", "beta"], ["X-Scope", "alpha"]]
    });
    const reqHeadersAB = plugin.runModelTask("translation", "same body", {
        providerProfilePinned: true,
        customHeaders: new Headers([["X-Scope", "alpha"], ["X-Scope", "beta"]])
    });

    assert.deepEqual(transportScopes, ["alpha, beta", "beta, alpha"]);
    gates.forEach(release => release());
    assert.deepEqual(await Promise.all([reqAB, reqBA, reqHeadersAB]), [
        "scope:alpha, beta",
        "scope:beta, alpha",
        "scope:alpha, beta"
    ]);
});

test("mid-message persistent 500 stops on consecutive failure without draining budget and keeps finished chunks", async () => {
    const plugin = new Plugin();
    const fallbackIds = ["mfbOne", "mfbTwo", "mfbThree", "mfbFour", "mfbFive"];
    for (const id of fallbackIds) {
        plugin.providerLayer.registry.register({
            id,
            label: id,
            kind: "chat",
            tasks: { polish: false, translation: true },
            credentialFields: ["apiKey"],
            allowCloudFallback: true,
            defaultProfile: { endpoint: `https://${id}.example/v1/chat`, model: `${id}-m` },
            getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || `https://${id}.example/v1/chat`,
            buildRequest(_kind, input, cfg, def) {
                return {
                    endpoint: this.getEffectiveEndpoint(cfg, def),
                    request: {
                        provider: id,
                        headers: { Authorization: `Bearer ${cfg?.apiKey || ""}` },
                        body: { model: cfg?.model || `${id}-m`, messages: [{ role: "user", content: input }] }
                    }
                };
            }
        });
    }

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-primary-mid";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.targetLanguage = "Chinese (Simplified)";
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = [...fallbackIds];
    plugin.settings.translation.providerProfiles = Object.fromEntries(
        fallbackIds.map(id => [id, { endpoint: `https://${id}.example/v1/chat`, model: `${id}-m`, apiKey: `sk-${id}` }])
    );

    const paragraphs = [
        "MidOne describes distributed storage replication and quorum durability invariants clearly. ".repeat(8).trim(),
        "MidTwo explains deterministic scheduler backpressure and bounded queue admission policies. ".repeat(8).trim(),
        "MidThree outlines streaming transport cancellation semantics and cleanup guarantees safely. ".repeat(8).trim(),
        "MidFour details adaptive chunking heuristics and output validation boundary checks well. ".repeat(8).trim(),
        "MidFive summarizes end-to-end telemetry diagnostics and budget accounting safeguards fully. ".repeat(8).trim()
    ];
    const longText = paragraphs.join("\n\n");
    const manualOptions = plugin.getManualTranslationRequestOptions();
    const longOptions = plugin.getLongTextTranslationOptions(manualOptions, longText);
    assert.equal(plugin.splitLongAutoTranslationText(longText, plugin.getLongAutoTranslationChunkLength(longOptions)).length, 5);

    const chineseReplies = {
        MidOne: "第一部分详细描述了分布式存储副本复制以及法定人数持久性不变式。".repeat(4),
        MidTwo: "第二部分解释了确定性调度器的背压机制与有界队列准入策略。".repeat(4),
        MidThree: "第三部分概述了流式传输取消语义以及资源清理的安全保证。".repeat(4),
        MidFour: "第四部分介绍了自适应分块启发式规则与输出校验边界检查。".repeat(4),
        MidFive: "第五部分总结了端到端遥测诊断指标以及请求预算记账保护措施。".repeat(4)
    };
    const matchKey = text => Object.keys(chineseReplies).find(k => text.includes(k)) || "";

    // Case A (exact round-4 repro): Chunk 1 succeeds, then all subsequent primary and fallback calls
    // return 500. Must stop after chunk 3 confirms ongoing outage (without draining budget across
    // chunks 4 & 5) and preserve chunk 1 as a partial result.
    const callsA = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        callsA.push({ provider: request.provider, key });
        if (key === "MidOne") {
            return JSON.stringify({ choices: [{ message: { content: chineseReplies.MidOne } }] });
        }
        const err = new Error("mid-message persistent 500");
        err.status = 500;
        throw err;
    };
    const budgetA = plugin.createAutoTranslationRequestBudget(9);
    const taskOptionsA = { requestBudget: budgetA, manualRescue: true };
    const resultA = await plugin.runLongAutoTranslationTask(longText, manualOptions, taskOptionsA);
    assert.ok(resultA.includes(chineseReplies.MidOne));
    assert.equal(taskOptionsA.longTextPartial, true);
    assert.deepEqual(taskOptionsA.longTextPartialInfo, { missingSegments: [2, 3, 4, 5], totalSegments: 5 });
    assert.equal(callsA.some(c => c.key === "MidFour" || c.key === "MidFive"), false, "must stop before hammering chunks 4 & 5");
    assert.ok(budgetA.used < 9, `expected budget not to be drained, got used=${budgetA.used}`);
    assert.equal(budgetA.reserved, 0);

    // Case B: Mid-message transient 500 only on chunk 2 (chunks 1, 3, 4, 5 succeed) recovers 4/5 chunks.
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        if (key === "MidTwo") {
            const err = new Error("transient chunk 2 500");
            err.status = 500;
            throw err;
        }
        return JSON.stringify({ choices: [{ message: { content: chineseReplies[key] } }] });
    };
    const budgetB = plugin.createAutoTranslationRequestBudget(9);
    const taskOptionsB = { requestBudget: budgetB, manualRescue: true };
    const resultB = await plugin.runLongAutoTranslationTask(longText, manualOptions, taskOptionsB);
    assert.deepEqual(taskOptionsB.longTextPartialInfo, { missingSegments: [2], totalSegments: 5 });
    for (const key of ["MidOne", "MidThree", "MidFour", "MidFive"]) {
        assert.ok(resultB.includes(chineseReplies[key]));
    }

    // Case C: Hard auth error (401) on chunk 2 still throws immediately instead of returning partial.
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const userText = String(request?.body?.messages?.at(-1)?.content || "");
        const key = matchKey(userText);
        if (key === "MidOne") {
            return JSON.stringify({ choices: [{ message: { content: chineseReplies.MidOne } }] });
        }
        const err = new Error("mid-message auth failure");
        err.status = 401;
        throw err;
    };
    const budgetC = plugin.createAutoTranslationRequestBudget(9);
    await assert.rejects(
        () => plugin.runLongAutoTranslationTask(longText, manualOptions, { requestBudget: budgetC, manualRescue: true }),
        err => err?.status === 401
    );
});

test("explicit empty request header is not deduped with omitted header and matches across Headers/tuple/object forms", async t => {
    const bdCalls = [];
    useGlobals(t, {
        BdApi: {
            Net: {
                fetch: async (endpoint, options) => {
                    bdCalls.push(options.headers);
                    return { ok: true, status: 200, url: endpoint, text: async () => JSON.stringify({ text: "ok" }) };
                }
            }
        }
    });

    const plugin = new Plugin();

    // Verify BetterDiscord Net transport preserves explicit empty header vs omitted header identically.
    await plugin.providerLayer.fetchViaBetterDiscordNet("https://empty-header.example/v1", {
        method: "POST",
        headers: [["X-Mode", ""], ["Content-Type", "application/json"]],
        body: "{}"
    });
    await plugin.providerLayer.fetchViaBetterDiscordNet("https://empty-header.example/v1", {
        method: "POST",
        headers: [["Content-Type", "application/json"]],
        body: "{}"
    });
    assert.deepEqual(bdCalls, [
        { "X-Mode": "", "Content-Type": "application/json" },
        { "Content-Type": "application/json" }
    ]);

    plugin.providerLayer.registry.register({
        id: "emptyHeaderMode",
        label: "Empty Header Mode",
        kind: "direct",
        tasks: { polish: false, translation: true },
        credentialFields: [],
        allowCloudFallback: true,
        defaultProfile: { endpoint: "https://empty-header.example/v1/translate" },
        hasUsableConfig: () => true,
        getEffectiveEndpoint: (cfg, def) => cfg?.endpoint || def?.endpoint || "https://empty-header.example/v1/translate",
        buildRequest(_kind, input, cfg, def, options) {
            return {
                endpoint: this.getEffectiveEndpoint(cfg, def),
                request: {
                    provider: "emptyHeaderMode",
                    responseParser: "emptyHeaderMode",
                    headers: options.customHeaders,
                    body: { text: input }
                }
            };
        },
        parseResponse: raw => JSON.parse(raw).text
    });

    plugin.settings.translation.enabled = true;
    plugin.settings.translation.provider = "emptyHeaderMode";

    const transportKinds = [];
    const gates = [];
    plugin.fetchApiResponseText = (_endpoint, request) => {
        const entries = plugin.providerLayer.getRequestHeaderEntries(request.headers);
        const hasModeHeader = entries.some(([k]) => k === "x-mode");
        const kind = hasModeHeader ? "present-empty" : "omitted";
        transportKinds.push(kind);
        return new Promise(resolve => {
            gates.push(() => resolve(JSON.stringify({ text: `mode:${kind}` })));
        });
    };

    const reqEmptyObj = plugin.runModelTask("translation", "same text", {
        providerProfilePinned: true,
        customHeaders: { "Content-Type": "application/json", "X-Mode": "" }
    });
    const reqOmitted = plugin.runModelTask("translation", "same text", {
        providerProfilePinned: true,
        customHeaders: { "Content-Type": "application/json" }
    });
    const reqEmptyHeaders = plugin.runModelTask("translation", "same text", {
        providerProfilePinned: true,
        customHeaders: new Headers({ "Content-Type": "application/json", "X-Mode": "" })
    });
    const reqEmptyTuple = plugin.runModelTask("translation", "same text", {
        providerProfilePinned: true,
        customHeaders: [["Content-Type", "application/json"], ["X-Mode", ""]]
    });

    assert.deepEqual(transportKinds, ["present-empty", "omitted"]);
    gates.forEach(release => release());
    assert.deepEqual(await Promise.all([reqEmptyObj, reqOmitted, reqEmptyHeaders, reqEmptyTuple]), [
        "mode:present-empty",
        "mode:omitted",
        "mode:present-empty",
        "mode:present-empty"
    ]);
});
