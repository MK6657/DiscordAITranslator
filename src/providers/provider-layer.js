"use strict";

// Phase 3 of the modularization plan: provider registry, endpoint policy, request builders, parsers, error mapping, fallback policy, Google key pool and local-provider health.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    API_TEST_REQUEST_TIMEOUT_MS,
    AUTO_LANGUAGE_VALUE,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_REASON_CODES,
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS,
    MODEL_REQUEST_TIMEOUT_MS,
    PROVIDER_DEFAULTS,
    PROVIDER_ORDER,
    SETTINGS_WRITE_DEBOUNCE_MS
} = require("../constants");
const { attachControllerMethods } = require("../core/delegate-methods");
const { createPluginContext } = require("../core/plugin-context");
const { createDefaultProviderRegistry } = require("./adapters");
const localModelHealthMethods = require("./local-model-health");
const googleKeyPoolMethods = require("./google-key-pool");
const providerCodecMethods = require("./provider-codecs");

const NON_REQUEST_TASK_CONFIG_KEYS = new Set([
    "providerProfiles",
    "promptTemplates",
    "activePromptTemplate",
    "apiStatus",
    "afterAction",
    "repolishSource"
]);

const FALLBACK_TASK_PARAM_KEYS = [
    "enabled",
    "sourceLanguage",
    "targetLanguage",
    "targetLanguageCode",
    "temperature",
    "maxTokens",
    "prompt",
    "promptPolicyVersion",
    "localCompactPrompt",
    "mode",
    "requestOrigin"
];

class ProviderLayer {
    constructor(plugin, ctx = createPluginContext(plugin)) {
        this.plugin = plugin;
        this.ctx = ctx;
        this.registry = createDefaultProviderRegistry();
        // The last connection test per task (in memory only): what the settings and the quick panel show next to
        // the status, e.g. "Hy-MT2 · 820 ms · just now".
        this.lastApiTestResults = new Map();
        // Connection tests in flight per task (the saved "testing" status can outlive its test, e.g. after a
        // settings change cut the test short).
        this.runningApiTests = new Map();
        // Origins where a fallback to BdApi.Net.fetch succeeded (session-only).
        this.bdNetPreferredOrigins = new Set();
    }

    getProviderDefaults(provider) {
        const id = String(provider || "").trim();
        const adapter = this.registry.get(id);
        if (adapter) {
            return {
                ...(PROVIDER_DEFAULTS[id] || {}),
                ...(adapter.defaultProfile || {}),
                ...(adapter.label && !adapter.defaultProfile?.label ? { label: adapter.label } : {})
            };
        }
        return PROVIDER_DEFAULTS[id] || null;
    }

    isGoogleTranslateProvider(configOrProvider) {
        const provider = typeof configOrProvider === "string" ? configOrProvider : configOrProvider?.provider;
        return provider === "googleCloud";
    }

    isMicrosoftTranslateProvider(configOrProvider) {
        const provider = typeof configOrProvider === "string" ? configOrProvider : configOrProvider?.provider;
        return provider === "microsoft";
    }

    isDeepLTranslateProvider(configOrProvider) {
        const provider = typeof configOrProvider === "string" ? configOrProvider : configOrProvider?.provider;
        return provider === "deepl";
    }

    isBaiduTranslateProvider(configOrProvider) {
        const provider = typeof configOrProvider === "string" ? configOrProvider : configOrProvider?.provider;
        return provider === "baidu";
    }

    isDirectTranslateProvider(configOrProvider) {
        if (this.registry.isDirectTranslate(configOrProvider)) return true;
        return this.isGoogleTranslateProvider(configOrProvider)
            || this.isMicrosoftTranslateProvider(configOrProvider)
            || this.isDeepLTranslateProvider(configOrProvider)
            || this.isBaiduTranslateProvider(configOrProvider);
    }

    isLocalTranslationProvider(configOrProvider) {
        return this.registry.isLocal(configOrProvider);
    }

    // Accepts either a full chat/completions URL or an OpenAI-style base URL (e.g. http://127.0.0.1:18080/v1
    // or https://host/openai/v1) and completes it to .../chat/completions without altering custom paths.
    normalizeChatCompletionEndpoint(endpoint) {
        const raw = String(endpoint || "").trim();
        if (!raw) return "";
        try {
            const url = new URL(raw);
            if (!["http:", "https:"].includes(url.protocol)) return raw;
            const trimmedPath = String(url.pathname || "").replace(/\/+$/g, "");
            if (/\/(?:chat\/completions|completions)$/i.test(trimmedPath)) return raw;
            if (/\/v\d+$/i.test(trimmedPath)) {
                url.pathname = `${trimmedPath}/chat/completions`;
                return url.toString();
            }
            if (!trimmedPath && this.isLoopbackEndpoint(raw)) {
                url.pathname = "/v1/chat/completions";
                return url.toString();
            }
            return raw;
        }
        catch {
            return raw;
        }
    }

    getEffectiveChatCompletionEndpoint(config = {}, defaultConfig = {}) {
        const providerDefault = this.getProviderDefaults(config.provider) || {};
        const raw = String(config.endpoint || providerDefault.endpoint || defaultConfig.endpoint || "").trim();
        return this.normalizeChatCompletionEndpoint(raw);
    }

    getEffectiveProviderEndpoint(config, defaultConfig = {}) {
        const adapter = this.registry.get(config);
        if (adapter?.getEffectiveEndpoint) return adapter.getEffectiveEndpoint(config, defaultConfig, this.plugin);
        return this.getEffectiveChatCompletionEndpoint(config, defaultConfig);
    }

    getProviderEndpointIdentity(config, defaultConfig = {}) {
        const endpoint = this.getEffectiveProviderEndpoint(config, defaultConfig);
        try {
            const url = new URL(endpoint);
            url.hash = "";
            return url.href;
        }
        catch {
            return endpoint;
        }
    }

    createProviderRequestCancelledError() {
        return Object.assign(new Error("Request cancelled"), { name: "AbortError", code: "REQUEST_CANCELLED" });
    }

    throwIfProviderRequestCancelled(signal, lifecycleToken = this.ctx.getLifecycleToken()) {
        if (signal?.aborted || this.plugin.apiRequestsClosed || lifecycleToken !== this.ctx.getLifecycleToken()) {
            throw this.createProviderRequestCancelledError();
        }
    }

    subscribeToProviderRequest(requests, key, signal, run, isCurrent = () => true) {
        this.throwIfProviderRequestCancelled(signal);
        let entry = requests.get(key);
        const startsRequest = !entry;
        if (startsRequest) {
            entry = { controller: new AbortController(), subscribers: new Set() };
            requests.set(key, entry);
        }

        const result = new Promise((resolve, reject) => {
            const subscriber = {
                resolve,
                reject,
                isCurrent,
                release: () => {
                    entry.subscribers.delete(subscriber);
                    signal?.removeEventListener("abort", cancel);
                }
            };
            const cancel = () => {
                subscriber.release();
                if (!entry.subscribers.size) entry.controller.abort();
                reject(this.createProviderRequestCancelledError());
            };
            entry.subscribers.add(subscriber);
            signal?.addEventListener("abort", cancel, { once: true });
        });

        if (startsRequest) {
            const { controller, subscribers } = entry;
            const settle = (method, value) => {
                controller.signal.removeEventListener("abort", cancel);
                if (requests.get(key) === entry) requests.delete(key);
                for (const subscriber of subscribers) {
                    subscriber.release();
                    subscriber[method](value);
                }
            };
            const cancel = () => settle("reject", this.createProviderRequestCancelledError());
            controller.signal.addEventListener("abort", cancel, { once: true });
            const hasCurrentSubscriber = () => [...subscribers].some(subscriber => subscriber.isCurrent());
            let runPromise;
            try {
                runPromise = Promise.resolve(run(controller.signal, hasCurrentSubscriber));
            }
            catch (syncError) {
                runPromise = Promise.reject(syncError);
            }
            runPromise.then(
                value => settle("resolve", value),
                error => settle("reject", error)
            );
        }
        return result;
    }

    isModelDetectionProvider(provider) {
        return this.registry.supportsModelDetection(provider);
    }

    getEffectiveRequestApiKey(config) {
        if (config?.provider === "googleCloud") {
            return this.peekGoogleTranslateAvailableKey(1)?.apiKey || "";
        }
        if (config?.provider === "baidu") {
            return String(config?.secretKey || "").trim();
        }
        const apiKey = String(config?.apiKey || "").trim();
        if (apiKey) return apiKey;
        return this.plugin.isProviderApiKeyOptional(config?.provider) ? "local" : "";
    }

    getRequestHeaders(config, effectiveApiKey) {
        if (this.plugin.hasApiKeyOriginMismatch(config)) {
            const error = new Error(this.plugin.t("apiKeyOriginMismatch"));
            error.code = "API_KEY_ORIGIN_MISMATCH";
            throw error;
        }
        const adapter = this.registry.get(config);
        if (typeof adapter?.buildHeaders === "function") {
            return adapter.buildHeaders(config, effectiveApiKey, this.plugin);
        }
        const headers = { "Content-Type": "application/json" };
        if (config?.provider === "microsoft") {
            if (effectiveApiKey) headers["Ocp-Apim-Subscription-Key"] = effectiveApiKey;
            const region = String(config?.region || "").trim();
            if (region) headers["Ocp-Apim-Subscription-Region"] = region;
            return headers;
        }
        if (config?.provider === "deepl") {
            if (effectiveApiKey) headers.Authorization = `DeepL-Auth-Key ${effectiveApiKey}`;
            return headers;
        }
        const actualApiKey = String(config?.apiKey || "").trim();
        const shouldSendAuth = Boolean(actualApiKey) || !this.plugin.isProviderApiKeyOptional(config?.provider);
        if (shouldSendAuth && effectiveApiKey) headers.Authorization = `Bearer ${actualApiKey || effectiveApiKey}`;
        return headers;
    }

    hasUsableApiConfig(kind, configOverrides = null, options = null) {
        const config = options?.isolatedConfig && configOverrides
            ? this.stripNonRequestTaskFields(configOverrides)
            : this.plugin.getEffectiveTaskConfig(kind, configOverrides);
        if (this.plugin.hasApiKeyOriginMismatch(config)) return false;
        const adapter = this.registry.get(config);
        if (typeof adapter?.hasUsableConfig === "function") {
            return Boolean(adapter.hasUsableConfig(config, this.plugin));
        }
        const defaults = DEFAULT_SETTINGS[kind] || {};
        const providerDefaults = this.getProviderDefaults(config.provider) || {};
        const endpoint = String(config.endpoint || providerDefaults.endpoint || defaults.endpoint || "").trim();
        const model = String(config.model || providerDefaults.model || defaults.model || "").trim();
        if (config.provider === "baidu") {
            return Boolean(endpoint && String(config.appId || "").trim() && String(config.secretKey || "").trim());
        }
        const requiresModel = this.plugin.isChatCompletionProvider(config);
        return Boolean(endpoint && (!requiresModel || model) && this.getEffectiveRequestApiKey(config));
    }

    // Badges are drawn by renderApiStatusBadge, which shows "Not set up" while a required field is missing.
    renderStatusBadge(status, kind, state, text, title) {
        if (typeof this.plugin.renderApiStatusBadge === "function") {
            this.plugin.renderApiStatusBadge(status, kind, state, text, title || "");
            return;
        }
        status.className = `dait-api-status dait-api-status-${state}`;
        status.textContent = text;
        status.title = title || "";
    }

    setApiStatus(status, state, text, title = "", kind = status?.dataset?.daitKind) {
        try {
            if (status) this.renderStatusBadge(status, kind, state, text, title);
            if (kind && this.plugin.settings[kind]) {
                this.plugin.settings[kind].apiStatus = { state, message: title || "" };
                this.plugin.saveSettings({ debounce: true });
            }
        }
        finally {
            if (status || kind) this.ctx.events?.emit("api:status", { kind, state });
        }
    }

    setApiRuntimeStatus(kind, state, text = this.plugin.getApiStatusText(state), title = "") {
        try {
            if (!kind || !this.plugin.settings[kind]) return;
            const next = { state, message: title || "" };
            const previous = this.getApiStatus(kind);
            if (previous.state !== next.state || previous.message !== next.message) {
                this.plugin.settings[kind].apiStatus = next;
                this.plugin.saveSettings({ debounce: true, delayMs: SETTINGS_WRITE_DEBOUNCE_MS });
                // An open overview's checklist and cards follow the new state.
                this.plugin.scheduleOverviewStatusRefresh?.(`${kind}.apiStatus`);
            }
            if (typeof document === "undefined") return;
            document.querySelectorAll(`.dait-api-status[data-dait-kind='${kind}']`).forEach(status => this.renderStatusBadge(status, kind, state, text, title));
        }
        finally {
            this.ctx.events?.emit("api:status", { kind, state });
        }
    }

    // { ok, model, latencyMs, at, message } of the last connection test of this task, or null when none ran since
    // the service settings last changed. model is the model the server reported (Sakura local, OpenAI-compatible),
    // else the configured one; "" for machine-translation services. latencyMs is the test request's round trip.
    getLastApiTestResult(kind) {
        const result = this.lastApiTestResults.get(kind);
        return result ? { ...result } : null;
    }

    recordApiTestResult(kind, result = {}) {
        if (!kind) return null;
        const latency = Number(result.latencyMs);
        const entry = {
            ok: Boolean(result.ok),
            model: String(result.model || ""),
            latencyMs: Number.isFinite(latency) && latency >= 0 ? Math.round(latency) : null,
            at: Number(result.at) || Date.now(),
            message: String(result.message || "")
        };
        this.lastApiTestResults.set(kind, entry);
        return { ...entry };
    }

    clearLastApiTestResult(kind) {
        return this.lastApiTestResults.delete(kind);
    }

    isApiTestRunning(kind) {
        return Number(this.runningApiTests.get(kind) || 0) > 0;
    }

    // The model named in a chat-completions reply ("model": "..."), shortened to its file name.
    getReportedResponseModel(raw) {
        try {
            const data = typeof raw === "string" ? this.parseApiJson(raw) : raw;
            const model = typeof data?.model === "string" ? data.model.trim() : "";
            return model ? this.plugin.getDiagnosticModelLabel(model) : "";
        }
        catch {
            return "";
        }
    }

    getApiTestModel(config = {}, request = {}, reportedModel = "") {
        if (this.isDirectTranslateProvider(config)) return "";
        if (reportedModel && (this.isLocalTranslationProvider(config) || this.registry.supportsModelDetection(config))) return reportedModel;
        return this.plugin.getDiagnosticModelLabel(String(request?.body?.model || config?.model || ""));
    }

    resetApiStatus(kind, options = {}) {
        this.plugin.clearLastApiTestResult?.(kind);
        if (this.plugin.settings[kind]) {
            this.plugin.settings[kind].apiStatus = { state: "untested", message: "" };
            if (options.save === "debounce") this.plugin.saveSettings({ debounce: true });
            else if (options.save !== false) this.plugin.saveSettings();
        }
        if (typeof document === "undefined") return;
        document.querySelectorAll(`.dait-api-status[data-dait-kind='${kind}']`).forEach(status => {
            this.plugin.setApiStatus(status, "untested", this.plugin.t("apiStatusUntested"), "", kind);
        });
    }

    getApiStatus(kind) {
        const status = this.plugin.settings[kind]?.apiStatus;
        if (!status || typeof status !== "object") return { state: "untested", message: "" };
        const state = ["untested", "testing", "success", "failed"].includes(status.state) ? status.state : "untested";
        return { state, message: String(status.message || "") };
    }

    getEligibleProviderFallbackCandidates(kind = "translation") {
        if (kind !== "translation") return [];
        const registeredOrder = this.registry.getOrder();
        const order = registeredOrder.length ? registeredOrder : PROVIDER_ORDER;
        return order.filter(provider => {
            const adapter = this.registry.get(provider);
            if (adapter) {
                if (adapter.tasks?.translation !== true) return false;
            }
            else if (this.plugin.isProviderAllowedForTask && !this.plugin.isProviderAllowedForTask("translation", provider)) {
                return false;
            }
            return this.registry.allowCloudFallback(provider) && !this.isLocalTranslationProvider({ provider });
        });
    }

    getProviderFallbackOrder(kind = "translation", currentConfig = null) {
        if (kind !== "translation") return [];
        if (this.plugin.settings.ui?.providerFallbackEnabled !== true) return [];
        const activeConfig = currentConfig && typeof currentConfig === "object"
            ? currentConfig
            : (this.plugin.settings.translation || {});
        const currentProvider = String(activeConfig.provider || this.plugin.settings.translation?.provider || "");
        if (!this.registry.allowCloudFallback(activeConfig) || this.isLocalTranslationProvider(activeConfig)) return [];
        const eligible = new Set(this.getEligibleProviderFallbackCandidates(kind));
        return (this.plugin.settings.ui?.providerFallbackOrder || [])
            .filter(provider => eligible.has(provider) && provider !== currentProvider);
    }

    shouldTryProviderFallback(kind, options = {}, currentConfig = this.plugin.getTaskConfig(kind), error = null) {
        if (kind !== "translation") return false;
        if (options.allowProviderFallback === false) return false;
        if (this.plugin.settings.ui?.providerFallbackEnabled !== true) return false;
        if (!this.registry.allowCloudFallback(currentConfig) || this.isLocalTranslationProvider(currentConfig)) return false;
        const mode = String(options.mode || options.configOverrides?.mode || "");
        const origin = String(options.requestOrigin || options.configOverrides?.requestOrigin || "");
        const eligibleMode = /^manual/.test(mode) || /^public-bilingual(?:-|$)/.test(mode)
            || origin === "manual" || origin === "public-bilingual";
        if (!eligibleMode) return false;
        const type = this.plugin.getAutoTranslationFailureType(error);
        return ["auth", "quota", "rate-limit", "server", "timeout", "network", "parse", "client", "invalid-output", "truncated"].includes(type);
    }

    getIsolatedFallbackCredentialFields(baseConfig, targetProvider, extraConfig = null) {
        const fields = new Set(["apiKey", "apiKeyOrigin", "region", "deeplPlan", "appId", "secretKey"]);
        for (const source of [baseConfig, targetProvider, extraConfig]) {
            if (!source) continue;
            for (const field of this.registry.getCredentialFields(source)) {
                if (field) fields.add(field);
            }
        }
        return fields;
    }

    getProviderFallbackConfig(kind, provider, baseConfig = this.plugin.getTaskConfig(kind)) {
        if (kind !== "translation" || (!this.registry.has(provider) && !PROVIDER_ORDER.includes(provider))) return null;
        const defaults = this.getProviderDefaults(provider);
        if (!defaults) return null;
        const storedProfile = this.plugin.getTaskProviderProfile(kind, provider) || {};
        const liveTask = this.plugin.settings?.[kind];
        const profile = liveTask && String(liveTask.provider || "").trim() === provider
            ? {
                ...storedProfile,
                endpoint: liveTask.endpoint,
                model: liveTask.model,
                apiKey: liveTask.apiKey,
                apiKeyOrigin: liveTask.apiKeyOrigin,
                region: liveTask.region,
                deeplPlan: liveTask.deeplPlan,
                appId: liveTask.appId,
                secretKey: liveTask.secretKey,
                enableThinking: liveTask.enableThinking,
                ...Object.fromEntries(
                    this.registry.getCredentialFields(provider)
                        .filter(field => field && liveTask[field] !== undefined)
                        .map(field => [field, liveTask[field]])
                )
            }
            : storedProfile;
        const taskParams = {};
        if (baseConfig && typeof baseConfig === "object") {
            for (const key of FALLBACK_TASK_PARAM_KEYS) {
                if (baseConfig[key] !== undefined) taskParams[key] = baseConfig[key];
            }
        }
        const fallbackConfig = {
            ...taskParams,
            ...defaults,
            provider,
            endpoint: profile.endpoint ?? defaults.endpoint ?? "",
            model: profile.model ?? defaults.model ?? "",
            apiKey: profile.apiKey ?? "",
            apiKeyOrigin: profile.apiKeyOrigin,
            region: profile.region ?? defaults.region ?? "",
            deeplPlan: profile.deeplPlan ?? defaults.deeplPlan ?? "free",
            appId: profile.appId ?? "",
            secretKey: profile.secretKey ?? "",
            enableThinking: typeof profile.enableThinking === "boolean" ? profile.enableThinking : false,
            sourceLanguage: baseConfig?.sourceLanguage || AUTO_LANGUAGE_VALUE,
            targetLanguage: baseConfig?.targetLanguage || this.plugin.settings.translation?.targetLanguage
        };
        for (const field of this.registry.getCredentialFields(provider)) {
            if (field === "apiKey" || field === "appId" || field === "secretKey") continue;
            fallbackConfig[field] = profile[field] ?? defaults[field] ?? "";
        }
        return fallbackConfig;
    }

    async tryProviderFallbackModelTask(kind, input, options = {}, firstError = null, currentConfig = this.plugin.getTaskConfig(kind), diagnosticMode = kind) {
        if (!this.shouldTryProviderFallback(kind, options, currentConfig, firstError)) return null;
        const order = this.getProviderFallbackOrder(kind, currentConfig);
        if (!order.length) return null;
        const firstType = this.plugin.getAutoTranslationFailureType(firstError);
        let budgetReservedBlocked = false;
        let budgetExhaustedBlocked = false;
        for (const provider of order) {
            this.throwIfProviderRequestCancelled(options.signal);
            if (options.isCurrent?.() === false) break;
            const fallbackConfig = this.getProviderFallbackConfig(kind, provider, currentConfig);
            if (!fallbackConfig) continue;
            if (!this.plugin.hasUsableApiConfig(kind, fallbackConfig, { isolatedConfig: true })) {
                this.plugin.logDiagnostic("model.provider-fallback", "skipped", {
                    ...this.plugin.getDiagnosticBaseMeta("model", `${diagnosticMode}-fallback`, DIAGNOSTIC_REASON_CODES.CONFIG_MISSING),
                    fromProvider: currentConfig?.provider || "",
                    provider,
                    firstFailureType: firstType,
                    reason: "missing-config"
                });
                continue;
            }
            if (options.requestBudget) {
                try {
                    this.plugin.consumeAutoTranslationRequestBudget({ requestBudget: options.requestBudget });
                }
                catch (budgetError) {
                    if (this.plugin.isAutoTranslationRequestBudgetError?.(budgetError)) {
                        if (budgetError.requestBudgetReserved) budgetReservedBlocked = true;
                        else budgetExhaustedBlocked = true;
                        this.plugin.logDiagnostic("model.provider-fallback", "budget-exhausted", {
                            ...this.plugin.getDiagnosticBaseMeta("model", `${diagnosticMode}-fallback`, "budget-exhausted"),
                            fromProvider: currentConfig?.provider || "",
                            provider,
                            firstFailureType: firstType,
                            requestCount: Number(options.requestBudget?.used || 0),
                            limit: Number(options.requestBudget?.limit || 0)
                        });
                        break;
                    }
                    throw budgetError;
                }
            }
            try {
                this.plugin.logDiagnostic("model.provider-fallback", "start", {
                    ...this.plugin.getDiagnosticBaseMeta("model", `${diagnosticMode}-fallback`, DIAGNOSTIC_REASON_CODES.REQUEST_STARTED),
                    fromProvider: currentConfig?.provider || "",
                    provider,
                    firstFailureType: firstType,
                    inputHash: this.plugin.getStrongTextFingerprint(input),
                    inputLength: String(input || "").length
                });
                const sanitizedOverrides = {};
                if (options.configOverrides && typeof options.configOverrides === "object") {
                    for (const key of FALLBACK_TASK_PARAM_KEYS) {
                        const value = options.configOverrides[key];
                        if (value === undefined) continue;
                        if ((key === "sourceLanguage" || key === "targetLanguage") && !value) continue;
                        sanitizedOverrides[key] = value;
                    }
                }
                const fallbackOverrides = {
                    ...fallbackConfig,
                    ...sanitizedOverrides,
                    provider,
                    endpoint: fallbackConfig.endpoint,
                    model: fallbackConfig.model,
                    apiKey: fallbackConfig.apiKey,
                    apiKeyOrigin: fallbackConfig.apiKeyOrigin,
                    region: fallbackConfig.region,
                    deeplPlan: fallbackConfig.deeplPlan,
                    appId: fallbackConfig.appId,
                    secretKey: fallbackConfig.secretKey,
                    enableThinking: fallbackConfig.enableThinking
                };
                for (const field of this.registry.getCredentialFields(provider)) {
                    fallbackOverrides[field] = fallbackConfig[field] ?? "";
                }
                const result = await this.plugin.runModelTask(kind, input, {
                    ...options,
                    requestBudget: undefined,
                    mode: `${diagnosticMode}-provider-fallback`,
                    configOverrides: fallbackOverrides,
                    allowProviderFallback: false,
                    providerProfilePinned: true,
                    isolatedConfig: true
                });
                this.plugin.logDiagnostic("model.provider-fallback", "success", {
                    ...this.plugin.getDiagnosticBaseMeta("model", `${diagnosticMode}-fallback`, "request-success"),
                    fromProvider: currentConfig?.provider || "",
                    provider,
                    firstFailureType: firstType,
                    inputHash: this.plugin.getStrongTextFingerprint(input)
                });
                if (options.requestContext && typeof options.requestContext === "object") {
                    options.requestContext.fallbackProvider = provider;
                }
                return { used: true, result, provider };
            }
            catch (error) {
                // A cancelled attempt ends the fallback chain; never hand the text to the next provider.
                if (this.isRequestCancelled(error)) throw error;
                this.plugin.logDiagnostic("model.provider-fallback", "failed", {
                    ...this.plugin.getDiagnosticBaseMeta("model", `${diagnosticMode}-fallback`, "request-error", { failureType: this.plugin.getAutoTranslationFailureType(error) }),
                    fromProvider: currentConfig?.provider || "",
                    provider,
                    firstFailureType: firstType,
                    type: this.plugin.getAutoTranslationFailureType(error),
                    status: Number(error?.status || 0),
                    inputHash: this.plugin.getStrongTextFingerprint(input)
                });
            }
        }
        return budgetReservedBlocked || budgetExhaustedBlocked
            ? { used: false, budgetReservedBlocked, budgetExhaustedBlocked }
            : null;
    }

    getAutoTranslationProviderKey(requestOptions = this.plugin.getAutoTranslationOptions()) {
        if (requestOptions?.providerKey) return requestOptions.providerKey;
        const rawConfig = requestOptions?.isolatedConfig && requestOptions?.configOverrides
            ? requestOptions.configOverrides
            : this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        const config = this.plugin.getCacheConfigSnapshot("translation", rawConfig);
        if (config.provider === "googleCloud") return this.getGoogleTranslateProviderKey();
        const adapter = this.registry.get(rawConfig);
        let apiKeySource = "";
        if (typeof adapter?.getAuthFingerprint === "function") {
            apiKeySource = String(adapter.getAuthFingerprint(rawConfig, null, this.plugin) || "");
        }
        else if (rawConfig.provider === "baidu") {
            apiKeySource = `${rawConfig.appId || ""}:${rawConfig.secretKey || ""}`;
        }
        else {
            const credentialFields = this.registry.getCredentialFields(rawConfig);
            const hasCustomFields = credentialFields.some(field => field !== "apiKey");
            apiKeySource = hasCustomFields
                ? credentialFields.map(field => `${field}=${String(rawConfig[field] ?? "").trim()}`).join("|")
                : (requestOptions?.isolatedConfig
                    ? String(rawConfig.apiKey ?? "")
                    : (requestOptions?.configOverrides?.apiKey ?? this.plugin.settings.translation?.apiKey));
        }
        const apiKeyFingerprint = this.plugin.getTextFingerprint(String(apiKeySource || "").trim());
        return [
            config.provider,
            config.endpoint,
            config.model,
            config.region || "",
            config.deeplPlan || "",
            config.appIdHash || "",
            apiKeyFingerprint
        ].join("\n---\n");
    }

    async runModelTask(kind, input, options = {}) {
        const result = await this.plugin.runModelTaskWithResult(kind, input, options);
        return result.text;
    }

    // Phase 1 of the modularization plan: the model-task core resolves to an explicit
    // TranslationResult value ({ text, fallbackProvider }) instead of signalling
    // fallback usage through promise stamping. runModelTask stays as the string-typed
    // facade the rest of the plugin (and the regression suite) programs against.

    stripNonRequestTaskFields(config) {
        if (!config || typeof config !== "object") return {};
        const cleaned = { ...config };
        for (const key of NON_REQUEST_TASK_CONFIG_KEYS) {
            delete cleaned[key];
        }
        return cleaned;
    }

    resolveEffectiveRequestConfig(kind, options = {}) {
        const baseConfig = this.stripNonRequestTaskFields(this.plugin.getTaskConfig(kind));
        if (!options?.configOverrides) return baseConfig;
        const overrides = this.stripNonRequestTaskFields(options.configOverrides);
        if (options.isolatedConfig) return overrides;
        const overrideProvider = String(overrides.provider || "").trim();
        const baseProvider = String(baseConfig?.provider || "").trim();
        if (overrideProvider && baseProvider && overrideProvider !== baseProvider) {
            const sanitizedBase = { ...baseConfig };
            for (const field of this.getIsolatedFallbackCredentialFields(baseConfig, overrideProvider)) {
                delete sanitizedBase[field];
            }
            return { ...sanitizedBase, ...overrides };
        }
        return { ...baseConfig, ...overrides };
    }

    async runModelTaskWithResult(kind, input, options = {}) {
        const { signal, requestContext } = options;
        const diagnosticMode = options?.mode || options?.configOverrides?.mode || kind;
        const lifecycleToken = this.ctx.getLifecycleToken();
        const startedAt = Date.now();
        let endpoint = "";
        let request;
        let body = {};
        let taskConfig;
        let providerSnapshotKey = "";
        const requestStillCurrent = () => this.ctx.isLifecycleTokenCurrent(lifecycleToken)
            && (!providerSnapshotKey || this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, { configOverrides: taskConfig }));

        this.throwIfProviderRequestCancelled(signal, lifecycleToken);
        try {
            taskConfig = this.resolveEffectiveRequestConfig(kind, options);
            const defaultConfig = DEFAULT_SETTINGS[kind] || {};
            if (this.shouldAutoDetectLocalProviderModel(taskConfig, defaultConfig)) {
                // Never forward generation timeoutMs (45-90s) into the shared /v1/models probe,
                // so a stalled local server fails fast at LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS (5s).
                await this.plugin.refreshLocalProviderDetectedModel(taskConfig, {
                    defaultConfig,
                    signal: options.signal,
                    isCurrent: options.isCurrent,
                    force: options.force,
                    omitApiKey: options.omitApiKey
                });
                this.throwIfProviderRequestCancelled(signal, lifecycleToken);
            }
            if (kind === "translation" && !options.providerProfilePinned) {
                providerSnapshotKey = this.getAutoTranslationProviderKey({ configOverrides: taskConfig });
            }

            const buildOptions = { ...options, configOverrides: taskConfig, reserveGoogleTranslateQuota: false };
            const translateAsArray = Boolean(options.translateAsArray || options.googleTranslateAsArray);
            const getRequestKey = () => JSON.stringify([
                this.getModelRequestKey(endpoint, request, input, taskConfig),
                Boolean((request?.responseParser || this.isDirectTranslateProvider(request?.provider || taskConfig)) && translateAsArray)
            ]);
            const requests = this.plugin.translationRequests;
            ({ endpoint, request } = this.buildModelRequest(kind, input, { ...buildOptions, deferGoogleTranslateReservation: true }));
            let requestKey = getRequestKey();
            if (request?.provider === "googleCloud" && !requests.has(requestKey)) {
                let matchedActiveKey = false;
                for (const candidateKey of this.plugin.getGoogleTranslateKeys?.() || []) {
                    const candidateApiKey = String(candidateKey?.apiKey || "").trim();
                    if (!candidateApiKey || candidateKey?.enabled === false) continue;
                    const probeRequest = {
                        ...request,
                        headers: { ...(request.headers || {}), "X-Goog-Api-Key": candidateApiKey },
                        googleTranslate: { ...(request.googleTranslate || {}), apiKey: candidateApiKey }
                    };
                    const probeKey = JSON.stringify([
                        this.getModelRequestKey(endpoint, probeRequest, input, taskConfig),
                        Boolean((probeRequest?.responseParser || this.isDirectTranslateProvider(probeRequest?.provider || taskConfig)) && translateAsArray)
                    ]);
                    if (requests.has(probeKey)) {
                        request = probeRequest;
                        requestKey = probeKey;
                        matchedActiveKey = true;
                        break;
                    }
                }
                if (!matchedActiveKey) {
                    ({ endpoint, request } = this.buildModelRequest(kind, input, { ...buildOptions, deferGoogleTranslateReservation: false }));
                    requestKey = getRequestKey();
                }
            }
            body = request?.body || {};
            const timeoutMs = options.timeoutMs || MODEL_REQUEST_TIMEOUT_MS;
            const joining = requests.has(requestKey);
            this.plugin.logDiagnostic("model.request", joining ? "dedupe-hit" : "start", {
                ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, joining ? "request-dedupe" : DIAGNOSTIC_REASON_CODES.REQUEST_STARTED),
                kind,
                provider: taskConfig.provider,
                model: body.model,
                inputHash: this.plugin.getStrongTextFingerprint(input),
                inputLength: String(input || "").length,
                ...(!joining && {
                    promptLength: String(body?.messages?.[0]?.content || "").length,
                    maxTokens: Number(body?.max_tokens || 0),
                    longTextChunk: Boolean(options.longTextChunk),
                    longTextSourceLength: Number(options.longTextSourceLength || 0) || 0,
                    timeoutMs
                })
            });

            const text = await this.subscribeToProviderRequest(requests, requestKey, signal, async sharedSignal => {
                try {
                    this.plugin.reserveGoogleTranslateRequest(request);
                    return await this.plugin.fetchModelResponse(endpoint, request, timeoutMs, {
                        googleTranslateAsArray: Boolean(options.googleTranslateAsArray),
                        translateAsArray,
                        lifecycleToken,
                        signal: sharedSignal,
                        isCurrent: () => requestStillCurrent() && !options.providerProfilePinned
                    });
                }
                catch (error) {
                    if (error?.googleTranslateApiKey && !sharedSignal.aborted) {
                        this.plugin.markGoogleTranslateKeyFailure(error.googleTranslateApiKey, error);
                    }
                    throw error;
                }
            });
            this.throwIfProviderRequestCancelled(signal);
            if (requestStillCurrent()) {
                if (providerSnapshotKey && this.isLocalTranslationProvider(taskConfig)) {
                    this.markLocalProviderHealthy(providerSnapshotKey);
                    this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
                }
                else if (providerSnapshotKey && taskConfig.provider === this.plugin.settings.translation?.provider
                    && this.getApiStatus("translation").state === "failed") {
                    this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
                }
                if (kind === "translation" && this.plugin.autoTranslationProviderNoticeAt?.size) {
                    this.plugin.endTranslationAttentionEpisode?.(providerSnapshotKey || this.getAutoTranslationProviderKey({ configOverrides: taskConfig }));
                }
                this.plugin.logDiagnostic("model.request", "success", {
                    ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, "request-success"),
                    kind,
                    provider: taskConfig.provider,
                    model: body.model,
                    inputHash: this.plugin.getStrongTextFingerprint(input),
                    ms: Date.now() - startedAt
                });
            }
            this.throwIfProviderRequestCancelled(signal);
            return { text, fallbackProvider: "" };
        }
        catch (failure) {
            this.throwIfProviderRequestCancelled(signal);
            if (this.isRequestCancelled(failure)) throw failure;
            const error = failure instanceof Error
                ? Object.assign(new Error(failure.message, { cause: failure.cause }), failure, { name: failure.name, stack: failure.stack })
                : failure;
            this.annotateModelRequestError(error, kind, endpoint, taskConfig, options);
            if (!requestStillCurrent()) throw error;
            this.plugin.logDiagnostic("model.request", "error", {
                ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, "request-error", { failureType: this.plugin.getAutoTranslationFailureType(error) }),
                kind,
                provider: taskConfig?.provider,
                model: body.model,
                inputHash: this.plugin.getStrongTextFingerprint(input),
                inputLength: String(input || "").length,
                promptLength: String(body?.messages?.[0]?.content || "").length,
                maxTokens: Number(body?.max_tokens || 0),
                type: this.plugin.getAutoTranslationFailureType(error),
                status: Number(error?.status || 0),
                retryAfterMs: Number(error?.retryAfterMs || 0),
                requestId: error?.requestId || "",
                bodyHash: error?.bodyHash || "",
                finishReason: error?.finishReason || "",
                partialOutputLength: Number(error?.partialOutputLength || 0),
                invalidReason: error?.autoTranslationInvalidReason || "",
                longTextChunk: Boolean(options.longTextChunk),
                longTextSourceLength: Number(options.longTextSourceLength || 0) || 0,
                ms: Date.now() - startedAt
            });
            const fallback = await this.plugin.tryProviderFallbackModelTask(kind, input, { ...options, requestContext: undefined }, error, taskConfig, diagnosticMode);
            this.throwIfProviderRequestCancelled(signal, lifecycleToken);
            if (!fallback?.used) {
                if (error && typeof error === "object") {
                    if (fallback?.budgetReservedBlocked) error.fallbackBudgetReserved = true;
                    if (fallback?.budgetExhaustedBlocked) error.fallbackBudgetExhausted = true;
                }
                throw error;
            }
            if (requestContext && typeof requestContext === "object") requestContext.fallbackProvider = fallback.provider;
            return { text: fallback.result, fallbackProvider: fallback.provider };
        }
    }

    adoptSharedModelResult(sharedPromise, options = {}) {
        if (!sharedPromise?.then) return sharedPromise;
        return sharedPromise.then(result => {
            const fallbackProvider = result?.fallbackProvider || "";
            if (fallbackProvider && options.requestContext && typeof options.requestContext === "object" && !options.requestContext.fallbackProvider) {
                options.requestContext.fallbackProvider = fallbackProvider;
            }
            return result;
        });
    }

    async fetchModelResponse(endpoint, request, timeoutMs = MODEL_REQUEST_TIMEOUT_MS, options = {}) {
        try {
            const raw = await this.plugin.fetchApiResponseText(endpoint, request, timeoutMs, options.signal ? { signal: options.signal } : undefined);
            // The connection test reads the model the server names in its reply.
            if (typeof options.onRawResponse === "function") {
                try { options.onRawResponse(raw); }
                catch {}
            }
            const providerAdapter = this.registry.get(request?.provider);
            const parserAdapter = request?.responseParser ? this.registry.getByParser(request.responseParser) : null;
            const adapter = (providerAdapter && (!request?.responseParser || !providerAdapter.responseParser || providerAdapter.responseParser === request.responseParser))
                ? providerAdapter
                : (parserAdapter || providerAdapter);
            if (adapter?.parseResponse) {
                return adapter.parseResponse(raw, request, options, this.plugin);
            }
            return this.parseModelResponse(raw);
        }
        catch (error) {
            // Queued work orphaned by a settings change is aborted, but Google already received the
            // request and counts its characters: so does the key's monthly usage.
            if (request?.responseParser === "googleTranslate" && error?.requestSent && this.isRequestCancelled(error)) {
                this.markGoogleTranslateKeyUsage(request.googleTranslate?.apiKey, request.googleTranslate?.charCount || 0);
            }
            throw error;
        }
        finally {
            this.releaseGoogleTranslateRequestReservation(request);
        }
    }

    annotateModelRequestError(error, kind, endpoint, config, options = {}) {
        if (!error || kind !== "translation") return error;
        if (this.isLocalProviderUnavailableError(error, endpoint, config, options)) {
            error.localProviderUnavailable = true;
            error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
            error.providerKey = error.providerKey || this.getAutoTranslationProviderKey({ configOverrides: options.configOverrides });
            // The address that did not answer, for the message: the settings may name another service by then.
            error.localProviderEndpoint = error.localProviderEndpoint || String(endpoint || config?.endpoint || "");
        }
        return error;
    }

    isLocalProviderUnavailableError(error, endpoint, config, options = {}) {
        if (error?.localProviderUnavailable) return true;
        if (!this.isLocalTranslationProvider(config) || !this.isLoopbackEndpoint(endpoint || config?.endpoint)) return false;
        const status = Number(error?.status || 0);
        // A long request, or the larger retry after a cut-off output, can time out on a healthy
        // service that is just generating slowly.
        if (this.isTimeoutError(error)) return !options?.truncationRetry && !this.plugin.isLongAutoTranslationRequestOptions(options);
        if (this.isNetworkError(error)) return true;
        // An empty or unparseable reply to a successful HTTP request is a bad answer to
        // this one message, not a sign that the service is down.
        return status >= 500;
    }

    isLoopbackEndpoint(endpoint) {
        const value = String(endpoint || "").trim();
        if (!value) return false;
        try {
            const host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, "");
            return host === "localhost"
                || host === "::1"
                || host === "0:0:0:0:0:0:0:1"
                || host === "0.0.0.0"
                || /^127(?:\.\d{1,3}){3}$/.test(host);
        }
        catch {
            return /^(?:https?:\/\/)?(?:localhost|127\.|0\.0\.0\.0|\[?::1\]?)/i.test(value);
        }
    }

    assertSafeRequestEndpoint(endpoint) {
        const value = String(endpoint || "").trim();
        let parsed = null;
        try { parsed = new URL(value); }
        catch {
            const error = new Error("API endpoint must be a valid absolute URL.");
            error.code = "INVALID_API_ENDPOINT";
            throw error;
        }
        if (parsed.username || parsed.password) {
            const error = new Error("API endpoint must not contain embedded credentials.");
            error.code = "UNSAFE_API_ENDPOINT";
            throw error;
        }
        if (parsed.protocol === "https:") return parsed.href;
        if (parsed.protocol === "http:" && this.isLoopbackEndpoint(parsed.href)) return parsed.href;
        const error = new Error("Remote API endpoints must use HTTPS; HTTP is allowed only for loopback endpoints.");
        error.code = "UNSAFE_API_ENDPOINT";
        throw error;
    }

    isTimeoutError(error) {
        if (this.isRequestCancelled(error)) return false;
        return error?.code === "REQUEST_TIMEOUT" || error?.name === "TimeoutError" || /timed out|timeout|ETIMEDOUT/i.test(this.plugin.getErrorSignalText(error));
    }

    isRequestCancelled(error) {
        return error?.code === "REQUEST_CANCELLED" || error?.name === "AbortError";
    }

    isNetworkError(error) {
        if (this.isRequestCancelled(error)) return false;
        return /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed|ERR_[A-Z_]+|ECONNREFUSED|ECONNRESET|ECONNABORTED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|connection refused|connection reset|socket hang up|NS_ERROR_CONNECTION_REFUSED/i
            .test(this.plugin.getErrorSignalText(error));
    }

    isBrowserRequestUnsent(error) {
        if (typeof error?.requestSent === "boolean") return !error.requestSent;
        const cause = error?.cause ?? error;
        return (cause?.code === "ECONNREFUSED" && cause.syscall === "connect")
            || (cause?.code === "ENOTFOUND" && cause.syscall === "getaddrinfo");
    }

    isLocalProviderEmptyResponseError(error) {
        const message = String(error?.message || "");
        return message === this.plugin.t("emptyResult") || /empty result|empty response|空结果|空結果/i.test(message);
    }

    isLocalProviderInvalidResponseError(error) {
        const message = String(error?.message || "");
        return message === this.plugin.t("invalidJson") || /invalid json|unexpected token|not valid json/i.test(message);
    }

    async fetchApiResponseText(endpoint, request, timeoutMs = MODEL_REQUEST_TIMEOUT_MS, callerOptions = {}) {
        const { origin, protocol } = new URL(this.assertSafeRequestEndpoint(endpoint));
        const effectiveTimeoutMs = Number(timeoutMs) > 0 ? Number(timeoutMs) : MODEL_REQUEST_TIMEOUT_MS;
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (controller) this.plugin.activeApiControllers.add(controller);
        // abort() keeps its first reason, so the signal records whether the timer or a cancel came first.
        const timeout = controller ? setTimeout(() => controller.abort(new DOMException("API request timed out", "TimeoutError")), effectiveTimeoutMs) : null;
        // The caller's signal (queued auto-translation work) cancels this request when that work is
        // orphaned by a settings change, so it does not keep a local server busy.
        const callerSignal = callerOptions?.signal || null;
        const abortFromCaller = () => controller?.abort(callerSignal?.reason);
        if (callerSignal && controller) {
            if (callerSignal.aborted) controller.abort(callerSignal.reason);
            else callerSignal.addEventListener?.("abort", abortFromCaller, { once: true });
        }
        // Whether the request left the plugin: a service may bill a request it received, even when
        // the answer is thrown away.
        let sent = false;
        try {
            if (this.plugin.apiRequestsClosed) throw new DOMException("API requests are closed until the plugin starts", "AbortError");
            controller?.signal.throwIfAborted();
            const method = String(request?.method || "POST").trim().toUpperCase() || "POST";
            const readOnly = method === "GET" || method === "HEAD";
            const fetchOptions = {
                method,
                headers: request.headers,
                // Endpoint validation applies only to this explicit destination.
                // Never forward message bodies or provider headers via redirects,
                // including redirects from a local provider to another service.
                redirect: "error",
                signal: controller?.signal
            };
            if (!readOnly) {
                fetchOptions.body = request?.bodyEncoding === "form"
                    ? new URLSearchParams(request.body || {}).toString()
                    : JSON.stringify(request.body);
            }
            const hasBdNet = typeof globalThis.BdApi?.Net?.fetch === "function";
            const rendererLocation = globalThis.location ?? globalThis.window?.location;
            const crossOriginWrite = !readOnly && rendererLocation?.origin && rendererLocation.origin !== origin;
            const useBdNet = hasBdNet && (this.bdNetPreferredOrigins.has(origin)
                || (rendererLocation?.protocol === "https:" && (protocol === "http:" || crossOriginWrite)));
            sent = true;
            let response;
            if (useBdNet) {
                response = await this.fetchViaBetterDiscordNet(endpoint, fetchOptions, controller?.signal || null, effectiveTimeoutMs);
            }
            else {
                try {
                    response = await fetch(endpoint, fetchOptions);
                }
                catch (fetchError) {
                    sent = !this.isBrowserRequestUnsent(fetchError);
                    const canFallbackBdNet = hasBdNet && !controller?.signal.aborted
                        && !this.isRequestCancelled(fetchError) && !this.isTimeoutError(fetchError)
                        && (!sent || (readOnly && this.isNetworkError(fetchError)));
                    if (!canFallbackBdNet) throw fetchError;
                    sent = true;
                    response = await this.fetchViaBetterDiscordNet(endpoint, fetchOptions, controller?.signal || null, effectiveTimeoutMs);
                    controller?.signal.throwIfAborted();
                    this.bdNetPreferredOrigins.add(origin);
                }
            }

            const raw = await this.readResponseTextWithAbort(response, controller?.signal || null);
            // Some transports resolve despite aborting. Never expose their late data.
            controller?.signal.throwIfAborted();
            if (!response.ok) {
                const apiError = this.plugin.createApiError(response, raw);
                if (request?.provider === "googleCloud") {
                    this.annotateGoogleTranslateApiError(apiError, raw, request);
                }
                this.plugin.annotateTranslateProviderApiError(apiError, raw, request);
                this.annotateChatCompletionApiError(apiError, raw, request);
                throw apiError;
            }

            return raw;
        }
        catch (error) {
            const callerTimedOut = Boolean(callerSignal?.aborted && callerSignal?.reason?.name === "TimeoutError");
            const callerCancelled = Boolean(this.plugin.apiRequestsClosed || (callerSignal?.aborted && !callerTimedOut));
            const controllerAborted = Boolean(controller?.signal.aborted);
            const controllerTimedOut = controller?.signal.reason?.name === "TimeoutError";
            // If the transport (e.g. BdApi.Net.fetch) aborted/timed out internally while neither the caller
            // nor our own cancel path aborted, treat it as a retryable timeout instead of silent cancellation.
            const transportTimedOut = !callerCancelled
                && (!controllerAborted || controllerTimedOut)
                && (controllerTimedOut || error?.name === "TimeoutError" || error?.name === "AbortError" || this.isTimeoutError(error));
            if (!controllerAborted && error?.name !== "AbortError" && !transportTimedOut) throw error;
            const timedOut = !callerCancelled && Boolean(controllerTimedOut || callerTimedOut || transportTimedOut);
            throw Object.assign(new Error(timedOut
                ? `API request timed out after ${Math.round(effectiveTimeoutMs / 1000)}s`
                : "Request cancelled", { cause: error }), {
                name: timedOut ? "TimeoutError" : "AbortError",
                code: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED",
                requestSent: sent
            });
        }
        finally {
            if (timeout) clearTimeout(timeout);
            if (controller) this.plugin.activeApiControllers.delete(controller);
            if (callerSignal) callerSignal.removeEventListener?.("abort", abortFromCaller);
        }
    }

    async readResponseTextWithAbort(response, signal = null) {
        if (!signal) return response.text();
        if (signal.aborted) throw signal.reason || new DOMException("Aborted", "AbortError");
        let onAbort = null;
        return new Promise((resolve, reject) => {
            onAbort = () => reject(signal.reason || new DOMException("Aborted", "AbortError"));
            signal.addEventListener?.("abort", onAbort, { once: true });
            Promise.resolve(response.text()).then(resolve, reject);
        }).finally(() => {
            if (onAbort) signal.removeEventListener?.("abort", onAbort);
        });
    }

    async fetchViaBetterDiscordNet(endpoint, fetchOptions, signal = null, timeoutMs = MODEL_REQUEST_TIMEOUT_MS) {
        const bdFetch = globalThis.BdApi?.Net?.fetch;
        if (typeof bdFetch !== "function") throw new Error("BdApi.Net.fetch unavailable");
        const rawHeaders = fetchOptions.headers;
        const bdHeaders = this.serializeHeadersForBetterDiscordNet(rawHeaders);
        const bdOptions = {
            method: fetchOptions.method,
            headers: bdHeaders,
            timeout: Math.max(1000, Number(timeoutMs) || MODEL_REQUEST_TIMEOUT_MS),
            redirect: "manual",
            maxRedirects: 0
        };
        if (fetchOptions.body !== undefined) bdOptions.body = fetchOptions.body;
        if (signal) bdOptions.signal = signal;

        let onAbort = null;
        const response = await new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(signal.reason || new DOMException("Aborted", "AbortError"));
                return;
            }
            if (signal) {
                onAbort = () => reject(signal.reason || new DOMException("Aborted", "AbortError"));
                signal.addEventListener?.("abort", onAbort, { once: true });
            }
            Promise.resolve(bdFetch(endpoint, bdOptions)).then(resolve, reject);
        }).finally(() => {
            if (signal && onAbort) signal.removeEventListener?.("abort", onAbort);
        });

        const status = Number(response?.status || 0);
        if (status >= 300 && status < 400) {
            throw Object.assign(new Error(`Redirect blocked (${status})`), { code: "API_REDIRECT_BLOCKED", status });
        }
        if (response?.redirected === true) {
            throw Object.assign(new Error("Redirect blocked"), { code: "API_REDIRECT_BLOCKED" });
        }
        if (response?.url) {
            try {
                const actualUrl = new URL(response.url);
                const expectedUrl = new URL(endpoint);
                actualUrl.hash = "";
                expectedUrl.hash = "";
                if (actualUrl.href !== expectedUrl.href) {
                    throw Object.assign(new Error("Redirect blocked"), { code: "API_REDIRECT_BLOCKED" });
                }
            }
            catch (err) {
                if (err?.code === "API_REDIRECT_BLOCKED") throw err;
            }
        }
        return response;
    }

    abortActiveApiRequests() {
        this.bdNetPreferredOrigins?.clear?.();
        for (const entry of [...this.plugin.translationRequests.values(), ...this.plugin.localProviderModelDetections.values()]) {
            entry.controller.abort();
        }
        if (!this.plugin.activeApiControllers?.size) return;
        for (const controller of [...this.plugin.activeApiControllers]) {
            try { controller.abort?.(); }
            catch {}
        }
        this.plugin.activeApiControllers.clear();
    }

    // OpenAI-compatible services answer a model name they do not know with 400 or 404 (DeepSeek:
    // "Model Not Exist"); the message then points to the model setting, not to account permissions.
    annotateChatCompletionApiError(error, raw = "", request = {}) {
        if (!error || !Array.isArray(request?.body?.messages)) return error;
        if (![400, 404, 422].includes(Number(error.status || 0))) return error;
        const text = String(raw || "").slice(0, 4000);
        if (/model_not_found|no such model|\b(?:unknown|invalid|unsupported) model\b|\bmodel\b[^.]{0,80}?\b(?:not exists?|does not exist|not found|is not (?:available|supported))\b/i.test(text)) {
            error.providerModelNotFound = true;
        }
        return error;
    }

    normalizeRequestHeadersMap(headers) {
        const normalized = new Map();
        if (!headers || typeof headers !== "object") return normalized;
        const append = (key, value) => {
            const rawName = String(key || "").trim();
            const lowerName = rawName.toLowerCase();
            if (!lowerName || value === undefined || value === null) return;
            const textValue = String(value).trim();
            const existing = normalized.get(lowerName);
            if (existing) {
                existing.value = `${existing.value}, ${textValue}`;
            }
            else {
                normalized.set(lowerName, { name: rawName, value: textValue });
            }
        };
        if (Array.isArray(headers)) {
            for (const entry of headers) {
                if (Array.isArray(entry) && entry.length >= 2) append(entry[0], entry[1]);
            }
        }
        else if (typeof headers.entries === "function") {
            for (const entry of headers.entries()) {
                if (Array.isArray(entry) && entry.length >= 2) append(entry[0], entry[1]);
            }
        }
        else if (typeof headers.forEach === "function") {
            headers.forEach((value, key) => append(key, value));
        }
        else {
            for (const [key, value] of Object.entries(headers)) {
                append(key, value);
            }
        }
        return normalized;
    }

    serializeHeadersForBetterDiscordNet(headers) {
        if (!headers || typeof headers !== "object") return headers;
        const isStructured = Array.isArray(headers)
            || typeof headers.entries === "function"
            || typeof headers.forEach === "function";
        if (!isStructured) {
            const keys = Object.keys(headers);
            const seenLower = new Set();
            let hasDuplicateCase = false;
            for (const key of keys) {
                const lower = String(key || "").trim().toLowerCase();
                if (!lower) continue;
                if (seenLower.has(lower)) {
                    hasDuplicateCase = true;
                    break;
                }
                seenLower.add(lower);
            }
            if (!hasDuplicateCase) return headers;
        }
        const normalized = this.normalizeRequestHeadersMap(headers);
        return Object.fromEntries([...normalized.values()].map(item => [item.name, item.value]));
    }

    getRequestHeaderEntries(headers) {
        return [...this.normalizeRequestHeadersMap(headers).entries()]
            .map(([lowerName, item]) => [lowerName, item.value])
            .sort((a, b) => a[0].localeCompare(b[0]));
    }

    getModelRequestKey(endpoint, request, input, effectiveConfig = null) {
        const body = request?.body || {};
        let authFingerprint = "";
        if (request?.provider === "googleCloud") {
            authFingerprint = this.plugin.getTextFingerprint(String(request?.googleTranslate?.apiKey || ""));
        }
        else {
            const adapter = this.registry.get(request?.provider || effectiveConfig);
            const adapterAuth = typeof adapter?.getAuthFingerprint === "function"
                ? String(adapter.getAuthFingerprint(effectiveConfig || {}, request, this.plugin) || "")
                : "";
            const headerEntries = this.getRequestHeaderEntries(request?.headers)
                .map(([k, v]) => `${k}:${v}`)
                .join("\n");
            const configCreds = effectiveConfig && typeof effectiveConfig === "object"
                ? this.registry.getCredentialFields(request?.provider || effectiveConfig)
                    .map(field => `${field}=${String(effectiveConfig[field] ?? "").trim()}`)
                    .join("|")
                : "";
            authFingerprint = this.plugin.getStrongTextFingerprint([
                adapterAuth,
                headerEntries,
                configCreds,
                body?.appid || "",
                request?.providerKey || ""
            ].join("\n--\n"));
        }
        const requestText = body?.messages?.[0]?.content ?? body?.q ?? body?.text ?? body?.target ?? body?.to ?? "";
        const serializedRequestText = Array.isArray(requestText) ? JSON.stringify(requestText) : String(requestText ?? "");
        const serializedInput = Array.isArray(input) ? JSON.stringify(input) : String(input ?? "");
        // Direct-translate bodies carry the language pair outside the text (Google
        // target, DeepL target_lang, Baidu from/to); include it so same-text requests
        // with different language pairs never share one promise.
        const targetLanguage = body?.target ?? body?.target_lang ?? body?.to ?? "";
        const sourceLanguage = body?.source ?? body?.source_lang ?? body?.from ?? "";
        return [
            endpoint,
            authFingerprint,
            request?.provider || "",
            request?.responseParser || "",
            body?.model,
            body?.temperature ?? "",
            body?.max_tokens ?? "",
            body?.thinking?.type ?? "",
            String(targetLanguage ?? ""),
            String(sourceLanguage ?? ""),
            serializedRequestText,
            serializedInput
        ].join("\n---\n");
    }

    async testApiConnection(kind, button, status, { onStart } = {}) {
        const lifecycleToken = this.ctx.getLifecycleToken();
        if (!this.ctx.isLifecycleTokenCurrent(lifecycleToken)) return false;
        const config = this.plugin.getTaskConfig(kind);
        const fields = [...new Set([
            "enabled", "provider", "endpoint", "apiKey", "apiKeyOrigin", "model", "enableThinking",
            "region", "deeplPlan", "appId", "secretKey", "targetLanguage",
            ...this.registry.getCredentialFields(config)
        ])];
        const testConfig = Object.freeze(Object.fromEntries(fields.map(field => [field, config[field]])));
        const getGooglePoolConfig = () => this.normalizeGoogleTranslateKeyPool().keyPoolText;
        const googlePoolConfig = testConfig.provider === "googleCloud" ? getGooglePoolConfig() : null;
        const runs = this.apiTestRuns ??= new Map();
        const previous = runs.get(kind);
        const sequence = (previous?.sequence || 0) + 1;
        const controller = new AbortController();
        const { signal } = controller;
        const isLatest = () => runs.get(kind)?.sequence === sequence;
        const isCurrent = () => {
            if (!isLatest() || signal.aborted || !this.ctx.isLifecycleTokenCurrent(lifecycleToken)) return false;
            const current = this.plugin.getTaskConfig(kind);
            return fields.every(field => testConfig[field] === current[field])
                && (googlePoolConfig === null || googlePoolConfig === getGooglePoolConfig());
        };

        runs.set(kind, { sequence, controller, button, lifecycleToken });
        this.runningApiTests.set(kind, sequence);
        previous?.controller?.abort();
        if (previous?.button && previous.button !== button && this.ctx.isLifecycleTokenCurrent(previous.lifecycleToken)) {
            this.plugin.setButtonBusy(previous.button, false, this.plugin.t("apiTest"));
        }

        let endpoint = "";
        let providerSnapshotKey = "";
        // Round trip of the test request, and the model the server named in its reply.
        let testRequest = null;
        let requestStartedAt = 0;
        let reportedModel = "";
        const record = (ok, message = "") => this.plugin.recordApiTestResult?.(kind, {
            ok,
            model: this.getApiTestModel(testConfig, testRequest, reportedModel),
            latencyMs: requestStartedAt ? Date.now() - requestStartedAt : null,
            message
        });

        const completeSuccess = () => {
            if (!isCurrent()) return false;
            const recorded = record(true);
            if (kind === "translation" && testConfig.provider === "googleCloud") {
                this.plugin.markGoogleTranslateProviderSuccess?.(testRequest);
            }
            this.plugin.setApiStatus(status, "success", this.plugin.t("apiStatusSuccess"), "", kind);
            this.plugin.clearAutoTranslationProviderFailureForCurrentConfig(kind);
            if (kind === "translation" && this.isLocalTranslationProvider(testConfig)) this.markLocalProviderHealthy(providerSnapshotKey);
            if (!isCurrent()) return false;
            const saved = this.plugin.saveVerifiedServiceConfig?.(kind, testConfig, {
                latencyMs: recorded?.latencyMs,
                model: recorded?.model
            }) || null;
            if (saved?.syncedTo) this.plugin.refreshApiTestViews?.(saved.syncedTo);
            this.plugin.refreshSavedServiceConfigControls?.();
            if (kind === "translation") this.plugin.queueScan();
            const toastKey = saved?.syncedTo
                ? "apiTestSuccessSynced"
                : saved?.entry
                    ? "apiTestSuccessSaved"
                    : "apiTestSuccess";
            const toastVars = saved?.syncedTo
                ? { name: this.plugin.getTaskDisplayName(kind), target: this.plugin.getTaskDisplayName(saved.syncedTo) }
                : { name: this.plugin.getTaskDisplayName(kind) };
            this.plugin.showToast(this.plugin.t(toastKey, toastVars), "success");
            return true;
        };

        try {
            onStart?.(isCurrent);
            if (!isCurrent()) return false;
            this.plugin.setApiStatus(status, "testing", this.plugin.t("apiStatusTesting"), "", kind);
            this.plugin.setButtonBusy(button, true, this.plugin.t("apiTestBusy"));
            providerSnapshotKey = kind === "translation"
                ? this.getAutoTranslationProviderKey({ configOverrides: testConfig })
                : "";
            const defaultConfig = DEFAULT_SETTINGS[kind] || {};
            if (this.shouldAutoDetectLocalProviderModel(testConfig, defaultConfig)) {
                if (!isCurrent()) return false;
                await this.plugin.refreshLocalProviderDetectedModel(testConfig, {
                    configOverrides: testConfig, defaultConfig, force: true, signal, isCurrent
                });
            }
            if (!isCurrent()) return false;
            const test = this.buildConnectionTestRequest(kind, testConfig);
            if (!isCurrent()) return false;
            endpoint = test.endpoint;
            testRequest = test.request;
            requestStartedAt = Date.now();
            await this.plugin.fetchModelResponse(test.endpoint, test.request, API_TEST_REQUEST_TIMEOUT_MS, {
                lifecycleToken,
                signal,
                connectionTest: true,
                onRawResponse: raw => { reportedModel = this.getReportedResponseModel(raw); }
            });
            return completeSuccess();
        }
        catch (error) {
            if (!isCurrent() || this.isRequestCancelled(error)) return false;
            if (this.plugin.isAcceptableConnectionTestTruncation(error, kind, testConfig)) {
                this.plugin.logDiagnostic("api.test", "truncated-ok", {
                    ...this.plugin.getDiagnosticBaseMeta(kind, "test", "request-success"),
                    provider: testConfig?.provider || "",
                    partialOutputLength: Number(error.partialOutputLength || 0),
                    finishReason: error.finishReason || ""
                });
                return completeSuccess();
            }
            if (kind === "translation") {
                this.annotateModelRequestError(error, kind, endpoint || testConfig.endpoint, testConfig, { configOverrides: testConfig });
                if (error?.googleTranslateApiKey) this.plugin.markGoogleTranslateKeyFailure(error.googleTranslateApiKey, error);
                if (error.localProviderUnavailable) this.plugin.markAutoTranslationProviderFailure(this.plugin.getAutoTranslationOptions(), error);
            }
            const message = this.formatGoogleTranslateKeyError(error);
            if (!isCurrent()) return false;
            record(false, message);
            this.plugin.setApiStatus(status, "failed", this.plugin.t("apiStatusFailed"), message, kind);
            this.plugin.showToast(this.plugin.t("apiTestFailed", { name: this.plugin.getTaskDisplayName(kind), error: message }), "error");
            return true;
        }
        finally {
            if (isLatest()) {
                runs.set(kind, { sequence });
                this.runningApiTests.delete(kind);
                if (this.ctx.isLifecycleTokenCurrent(lifecycleToken)) {
                    this.plugin.setButtonBusy(button, false, this.plugin.t("apiTest"));
                    this.plugin.requestLauncherStatusUpdate?.();
                }
            }
        }
    }

    buildConnectionTestRequest(kind, config = this.plugin.getTaskConfig(kind)) {
        const safeConfig = this.stripNonRequestTaskFields(config);
        const defaultConfig = DEFAULT_SETTINGS[kind] || {};
        const adapter = this.registry.get(safeConfig?.provider);
        if (typeof adapter?.buildTestRequest === "function") {
            return adapter.buildTestRequest(kind, safeConfig, defaultConfig, this.plugin);
        }
        if (this.isDirectTranslateProvider(safeConfig)) {
            // Test the language pair the user actually translates into: some targets are
            // rejected by some services. When every Google key is cooling down, a cooling key
            // is tested, so a passing test can bring it back.
            const testConfig = {
                ...safeConfig,
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguageCode: this.getTargetLanguageCode(safeConfig.targetLanguage)
            };
            if (adapter?.buildRequest) {
                return adapter.buildRequest("translation", "hello", testConfig, defaultConfig, {
                    ignoreGoogleTranslateCooldown: true,
                    connectionTest: true
                }, this.plugin);
            }
            if (this.isGoogleTranslateProvider(safeConfig)) return this.buildGoogleTranslateRequest("hello", testConfig, { ignoreCooldown: true });
            if (this.isMicrosoftTranslateProvider(safeConfig)) return this.buildMicrosoftTranslateRequest("hello", testConfig);
            if (this.isDeepLTranslateProvider(safeConfig)) return this.buildDeepLTranslateRequest("hello", testConfig);
            return this.buildBaiduTranslateRequest("hello", testConfig);
        }
        const apiKey = this.getEffectiveRequestApiKey(safeConfig);
        if (!apiKey) throw new Error(kind === "polish" ? this.plugin.t("apiKeyMissingPolish") : this.plugin.t("apiKeyMissingTranslation"));
        const endpoint = this.getEffectiveChatCompletionEndpoint(safeConfig, defaultConfig);
        const model = this.getEffectiveChatCompletionModel(kind, safeConfig, defaultConfig);
        if (!endpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (this.plugin.isChatCompletionProvider(safeConfig) && !model) throw new Error(this.plugin.t("modelMissing"));
        const body = this.applyProviderBodyOptions(safeConfig, {
            model,
            messages: [
                { role: "user", content: "Reply with OK only." }
            ],
            temperature: 0,
            max_tokens: 32,
            stream: false
        });

        return {
            endpoint,
            request: {
                provider: safeConfig.provider,
                providerKey: kind === "translation" ? this.getAutoTranslationProviderKey({ configOverrides: safeConfig, isolatedConfig: true }) : "",
                headers: this.getRequestHeaders(safeConfig, apiKey),
                body
            }
        };
    }

    buildModelRequest(kind, input, options = {}) {
        const defaultConfig = DEFAULT_SETTINGS[kind] || {};
        const effectiveConfig = this.resolveEffectiveRequestConfig(kind, options);
        const adapter = this.registry.get(effectiveConfig);
        if (adapter?.buildRequest) {
            return adapter.buildRequest(kind, input, effectiveConfig, defaultConfig, options, this.plugin);
        }
        return this.buildChatCompletionRequest(kind, input, effectiveConfig, defaultConfig);
    }

    applyProviderBodyOptions(config, body) {
        const adapter = this.registry.get(config);
        return typeof adapter?.applyBodyOptions === "function" ? adapter.applyBodyOptions(config, body) : body;
    }

}

attachControllerMethods(ProviderLayer, [localModelHealthMethods, googleKeyPoolMethods, providerCodecMethods]);

module.exports = { ProviderLayer };
