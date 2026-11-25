"use strict";

const {
    PROVIDER_DEFAULTS,
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS,
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    LOCAL_PROVIDER_AUTO_MODEL_VALUE,
    LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS,
    API_TEST_REQUEST_TIMEOUT_MS,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    DEFAULT_SETTINGS
} = require("../constants");

const methods = {
    isLocalProviderAutoModelValue(model) {
        const value = String(model || "").trim();
        return !value || value === LOCAL_PROVIDER_AUTO_MODEL_VALUE;
    },

    shouldAutoDetectLocalProviderModel(config = {}, defaultConfig = {}) {
        if (!this.plugin.isLocalTranslationProvider(config)) return false;
        const providerDefault = this.plugin.getProviderDefaults?.(config.provider) || PROVIDER_DEFAULTS[config.provider] || {};
        const model = String(config.model || providerDefault.model || defaultConfig.model || "").trim();
        if (!this.plugin.isLocalProviderAutoModelValue(model)) return false;
        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, defaultConfig);
        if (!this.plugin.isLoopbackEndpoint(endpoint)) return false;
        if (typeof config.apiKeyOrigin === "string") {
            return config.apiKeyOrigin === this.plugin.getProviderEndpointOrigin({ ...config, endpoint });
        }
        return !this.plugin.hasApiKeyOriginMismatch(config);
    },

    getLocalProviderModelDetectionCacheKey(config = {}, defaultConfig = {}) {
        if (!this.plugin.isLocalTranslationProvider(config)) return "";
        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, defaultConfig);
        if (!endpoint) return "";
        const credentialFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(config) || ["apiKey"];
        const hasCustomFields = credentialFields.some(field => field !== "apiKey");
        const credSource = hasCustomFields
            ? credentialFields.map(field => `${field}=${String(config[field] ?? "").trim()}`).join("|")
            : String(config.apiKey || "").trim();
        return [
            config.provider || "sakuraLocal",
            endpoint,
            this.plugin.getTextFingerprint(credSource)
        ].join("\n---\n");
    },

    getCachedLocalProviderDetectedModel(config = {}, options = {}) {
        const key = this.plugin.getLocalProviderModelDetectionCacheKey(config, options.defaultConfig);
        if (!key) return "";
        const entry = this.plugin.localProviderDetectedModels?.get?.(key);
        const model = String(entry?.model || "").trim();
        if (!model) return "";
        if (options.allowExpired === false && Number(entry.expiresAt || 0) <= Date.now()) return "";
        return model;
    },

    setCachedLocalProviderDetectedModel(config = {}, model = "", options = {}) {
        const normalized = this.plugin.normalizeLocalProviderModelId(model);
        const key = this.plugin.getLocalProviderModelDetectionCacheKey(config, options.defaultConfig);
        if (!key || !normalized) return "";
        const now = Date.now();
        const previousModel = String(this.plugin.localProviderDetectedModels.get(key)?.model || "");
        this.plugin.localProviderDetectedModels.set(key, {
            model: normalized,
            detectedAt: now,
            expiresAt: now + Math.max(1000, Number(options.ttlMs || LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS) || LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS),
            retryAt: 0
        });
        // The served model is part of the cache key, so it is saved with the cache, and hits the
        // cached-draw memo remembered under the old model's keys must not be drawn again.
        if (previousModel !== normalized) {
            // Lines drawn before a server's first detection carry keys that name the placeholder model.
            if (!previousModel) this.plugin.localProviderModelFirstDetected = true;
            this.plugin.scheduleTranslationCachePersist();
            this.plugin.cachedDrawMemo?.clear?.();
        }
        return normalized;
    },

    getPersistableLocalProviderDetectedModels() {
        return [...(this.plugin.localProviderDetectedModels?.entries?.() || [])]
            .filter(([key, entry]) => key && String(entry?.model || "").trim())
            .sort((left, right) => Number(right[1].detectedAt || 0) - Number(left[1].detectedAt || 0))
            .slice(0, 8)
            .map(([key, entry]) => ({ key, model: String(entry.model).trim() }));
    },

    // Restores the last served model per local server after a restart, so cached lines keep
    // their keys (and draw) before the server answers again; the next request re-detects.
    restoreLocalProviderDetectedModels(list) {
        if (!Array.isArray(list)) return;
        list.slice(0, 8).forEach(item => {
            const key = String(item?.key || "");
            const model = this.plugin.normalizeLocalProviderModelId(item?.model);
            if (!key || !model || this.plugin.localProviderDetectedModels.get(key)?.model) return;
            this.plugin.localProviderDetectedModels.set(key, { model, detectedAt: 0, expiresAt: 0, retryAt: 0 });
        });
    },

    getEffectiveChatCompletionModel(kind, config = {}, defaultConfig = DEFAULT_SETTINGS[kind] || {}) {
        const providerDefault = this.plugin.getProviderDefaults?.(config.provider) || PROVIDER_DEFAULTS[config.provider] || {};
        const configured = String(config.model || providerDefault.model || defaultConfig.model || "").trim();
        if (this.plugin.shouldAutoDetectLocalProviderModel(config, defaultConfig)) {
            return this.plugin.getCachedLocalProviderDetectedModel(config, { defaultConfig }) || configured || LOCAL_PROVIDER_AUTO_MODEL_VALUE;
        }
        return configured;
    },

    async refreshLocalProviderDetectedModel(config = {}, options = {}) {
        const { defaultConfig, force, signal, timeoutMs } = options;
        const lifecycleToken = this.plugin.getLifecycleToken();
        const isCurrent = () => !signal?.aborted && !this.plugin.apiRequestsClosed
            && this.plugin.getLifecycleToken() === lifecycleToken && options.isCurrent?.() !== false;
        if (!isCurrent()) throw this.createProviderRequestCancelledError();
        config = { ...config };
        if (!this.plugin.shouldAutoDetectLocalProviderModel(config, defaultConfig)) return "";
        const key = this.plugin.getLocalProviderModelDetectionCacheKey(config, defaultConfig);
        if (!key) return "";
        const now = Date.now();
        const cached = this.plugin.localProviderDetectedModels.get(key);
        if (!force && cached?.model && Number(cached.expiresAt || 0) > now) return cached.model;
        if (!force && Number(cached?.retryAt || 0) > now) return String(cached.model || "");

        const model = await this.subscribeToProviderRequest(this.plugin.localProviderModelDetections, key, signal, async (sharedSignal, hasCurrentSubscriber) => {
            const startedAt = Date.now();
            const assertCurrent = () => {
                if (sharedSignal.aborted || !hasCurrentSubscriber()) throw this.createProviderRequestCancelledError();
            };
            try {
                const model = await this.plugin.fetchLocalProviderDetectedModel(config, { defaultConfig, timeoutMs, signal: sharedSignal });
                assertCurrent();
                if (!model) throw new Error("NO_LOCAL_PROVIDER_MODEL");
                this.plugin.setCachedLocalProviderDetectedModel(config, model, options);
                this.plugin.logDiagnostic("local.model.detect", "success", {
                    provider: config.provider || "sakuraLocal",
                    model: this.plugin.getDiagnosticModelLabel(model),
                    modelHash: this.plugin.getTextFingerprint(model),
                    ms: Date.now() - startedAt
                });
                return model;
            }
            catch (error) {
                if (this.plugin.isRequestCancelled(error)) throw error;
                assertCurrent();
                const previous = this.plugin.localProviderDetectedModels.get(key) || {};
                this.plugin.localProviderDetectedModels.set(key, {
                    ...previous,
                    retryAt: Date.now() + Math.max(1000, Number(options.retryMs || LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS) || LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS)
                });
                this.plugin.logDiagnostic("local.model.detect", "failed", {
                    provider: config.provider || "sakuraLocal",
                    failureType: this.plugin.getAutoTranslationFailureType(error),
                    status: Number(error?.status || 0),
                    ms: Date.now() - startedAt
                });
                return String(previous.model || "");
            }
        }, isCurrent);
        if (!isCurrent()) throw this.createProviderRequestCancelledError();
        return model;
    },

    async fetchLocalProviderDetectedModel(config = {}, options = {}) {
        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, options.defaultConfig);
        const modelsEndpoint = this.plugin.getLocalProviderModelsEndpoint(endpoint);
        if (!modelsEndpoint) return "";
        const raw = await this.plugin.fetchApiResponseText(modelsEndpoint, {
            method: "GET",
            provider: config.provider,
            headers: this.plugin.getRequestHeaders(config, this.plugin.getEffectiveRequestApiKey(config))
        }, Math.max(1000, Number(options.timeoutMs || LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS) || LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS), {
            signal: options.signal
        });
        return this.plugin.parseLocalProviderModelsResponse(raw);
    },

    getLocalProviderModelsEndpoint(endpoint) {
        const source = String(endpoint || PROVIDER_DEFAULTS.sakuraLocal.endpoint || "").trim();
        if (!source) return "";
        try {
            const url = new URL(source);
            let path = String(url.pathname || "").replace(/\/+$/g, "");
            if (/\/models$/i.test(path)) {
                // Already a models endpoint.
            }
            else if (/\/chat\/completions$/i.test(path)) {
                path = path.replace(/\/chat\/completions$/i, "/models");
            }
            else if (/\/completions$/i.test(path)) {
                path = path.replace(/\/completions$/i, "/models");
            }
            else if (/\/v\d+$/i.test(path)) {
                path = `${path}/models`;
            }
            else if (!path) {
                path = "/v1/models";
            }
            else {
                path = `${path}/models`;
            }
            url.pathname = path || "/v1/models";
            const routeParams = new URLSearchParams();
            for (const [name, value] of url.searchParams) {
                if (/^api[-_]version$/i.test(name)) routeParams.append(name, value);
            }
            url.search = routeParams.toString();
            url.hash = "";
            return url.toString();
        }
        catch {
            const clean = source.split(/[?#]/)[0].replace(/\/+$/g, "");
            if (/\/models$/i.test(clean)) return clean;
            if (/\/chat\/completions$/i.test(clean)) return clean.replace(/\/chat\/completions$/i, "/models");
            if (/\/completions$/i.test(clean)) return clean.replace(/\/completions$/i, "/models");
            if (/\/v\d+$/i.test(clean)) return `${clean}/models`;
            return `${clean || "http://127.0.0.1:8080/v1"}/models`;
        }
    },

    parseLocalProviderModelsResponse(raw, options = {}) {
        const data = typeof raw === "string" ? this.plugin.parseApiJson(raw) : raw;
        const candidates = new Set();
        const ids = new Set();
        const files = new Set();
        const normalize = value => typeof value === "string" ? this.plugin.normalizeLocalProviderModelId(value) : "";
        const isModelFile = value => /\.gguf(?:$|[?#])/i.test(value);
        const addModel = (model, group) => {
            if (!model) return;
            candidates.add(model);
            group.add(model);
        };
        const add = value => {
            if (!value) return;
            if (typeof value === "string") {
                addModel(normalize(value), ids);
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(add);
                return;
            }
            if (typeof value !== "object") return;
            const id = [value.id, value.model, value.name].map(normalize).find(Boolean);
            if (id) addModel(id, ids);
            else addModel([value.path, value.filename].map(normalize).find(isModelFile), files);
            ["data", "models", "items", "result", "results"].forEach(field => {
                if (Array.isArray(value[field])) add(value[field]);
            });
        };

        add(data?.data);
        add(data?.models);
        add(data?.items);
        if (!candidates.size) add(data);
        if (options?.all) return [...candidates];
        const preferred = [...(ids.size ? ids : files)];
        return preferred.find(isModelFile) || preferred[0] || "";
    },

    async detectProviderModels(kind, options = {}) {
        const rawConfig = options.config || this.plugin.getTaskConfig(kind);
        const { provider, endpoint: configuredEndpoint, apiKey, apiKeyOrigin, model } = rawConfig;
        const snapshotBase = { provider, endpoint: configuredEndpoint, apiKey, apiKeyOrigin, model };
        const extraFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(provider) || [];
        extraFields.forEach(field => {
            if (field && !Object.prototype.hasOwnProperty.call(snapshotBase, field)) snapshotBase[field] = rawConfig[field];
        });
        const snapshot = Object.freeze(snapshotBase);
        const omitBase = { ...snapshot, apiKey: "" };
        if (options.omitApiKey) {
            extraFields.forEach(field => { if (field) omitBase[field] = ""; });
        }
        const config = options.omitApiKey ? Object.freeze(omitBase) : snapshot;
        const assertCurrent = () => {
            if (options.signal?.aborted || options.isCurrent?.() === false || !this.plugin.matchesModelDetectionConfig(kind, snapshot)) {
                throw new DOMException("Model detection superseded", "AbortError");
            }
        };
        assertCurrent();
        const defaultConfig = DEFAULT_SETTINGS[kind] || {};
        if (!this.plugin.isModelDetectionProvider(config.provider)) {
            const error = new Error(this.plugin.t("modelDetectUnsupported"));
            error.code = "MODEL_DETECTION_UNSUPPORTED";
            throw error;
        }
        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, defaultConfig);
        const modelsEndpoint = this.plugin.getLocalProviderModelsEndpoint(endpoint);
        const local = this.plugin.isLocalTranslationProvider(config);
        const timeoutMs = Math.max(1000, Number(options.timeoutMs || (local ? LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS : API_TEST_REQUEST_TIMEOUT_MS)) || API_TEST_REQUEST_TIMEOUT_MS);
        const startedAt = Date.now();
        try {
            const request = {
                method: "GET",
                provider: config.provider,
                headers: this.plugin.getRequestHeaders(config, this.plugin.getEffectiveRequestApiKey(config))
            };
            assertCurrent();
            const raw = await this.plugin.fetchApiResponseText(modelsEndpoint, request, timeoutMs, { signal: options.signal });
            assertCurrent();
            const models = this.plugin.parseLocalProviderModelsResponse(raw, { all: true });
            const loaded = local ? this.plugin.parseLocalProviderModelsResponse(raw) : "";
            if (loaded && this.plugin.shouldAutoDetectLocalProviderModel(config, defaultConfig)) {
                assertCurrent();
                this.plugin.setCachedLocalProviderDetectedModel(config, loaded, { defaultConfig });
            }
            this.plugin.logDiagnostic("provider.models.detect", "success", {
                kind,
                provider: config.provider,
                count: models.length,
                ms: Date.now() - startedAt
            });
            return { models, loaded };
        }
        catch (error) {
            assertCurrent();
            if (this.plugin.isRequestCancelled(error)) throw error;
            this.plugin.logDiagnostic("provider.models.detect", "failed", {
                kind,
                provider: config.provider,
                failureType: this.plugin.getAutoTranslationFailureType(error),
                status: Number(error?.status || 0),
                ms: Date.now() - startedAt
            });
            throw error;
        }
    },

    normalizeLocalProviderModelId(value) {
        const text = String(value || "").trim();
        if (!text || /^(?:list|model|models)$/i.test(text)) return "";
        return text;
    },

    getLocalProviderDetectedModelSnapshot(config = this.plugin.settings.translation) {
        const key = this.plugin.getLocalProviderModelDetectionCacheKey(config);
        const entry = key ? this.plugin.localProviderDetectedModels?.get?.(key) : null;
        const model = String(entry?.model || "").trim();
        return {
            autoDetectEnabled: this.plugin.shouldAutoDetectLocalProviderModel(config),
            detected: Boolean(model),
            model: this.plugin.getDiagnosticModelLabel(model),
            modelHash: model ? this.plugin.getTextFingerprint(model) : "",
            detectedAt: Number(entry?.detectedAt || 0) || 0,
            expiresAt: Number(entry?.expiresAt || 0) || 0,
            retryAt: Number(entry?.retryAt || 0) || 0
        };
    },

    markLocalProviderHealthy(providerKey) {
        if (!providerKey) return;
        this.plugin.localProviderHealthyKeys.add(providerKey);
        this.plugin.releaseProviderBlockedAutoTranslationItems(providerKey);
    },

    shouldBlockAutoTranslationForLocalProviderHealth(requestOptions = this.plugin.getAutoTranslationOptions()) {
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        if (!this.plugin.isLocalTranslationProvider(config)) return false;
        const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
        if (!providerKey) return true;
        if (this.plugin.localProviderHealthyKeys.has(providerKey) && this.plugin.getApiStatus("translation").state === "success") return false;
        this.plugin.startLocalProviderHealthProbe(providerKey, requestOptions, { reason: this.plugin.getApiStatus("translation").state || "untested" });
        return true;
    },

    getLocalProviderHealthProbeRetryMs(requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
        if (!providerKey) return LOCAL_PROVIDER_HEALTH_RETRY_MS;
        const startedAt = Number(this.plugin.localProviderHealthProbeStartedAt.get(providerKey) || 0);
        if (!startedAt || !this.plugin.localProviderHealthChecks.has(providerKey)) return LOCAL_PROVIDER_HEALTH_RETRY_MS;
        return Math.max(
            LOCAL_PROVIDER_HEALTH_RETRY_MS,
            API_TEST_REQUEST_TIMEOUT_MS + 500 - Math.max(0, now - startedAt)
        );
    },

    getLocalProviderHealthRetryMs(requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        const providerFailure = this.plugin.getAutoTranslationProviderFailure(requestOptions);
        if (providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure, now)) {
            return this.plugin.getAutoTranslationFailureRemainingMs(providerFailure, now);
        }
        return this.plugin.getLocalProviderHealthProbeRetryMs(requestOptions, now);
    },

    startLocalProviderHealthProbe(providerKey, requestOptions = this.plugin.getAutoTranslationOptions(), options = {}) {
        if (!providerKey || this.plugin.localProviderHealthChecks.has(providerKey)) return;
        const config = this.plugin.clone(this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides));
        if (!this.plugin.isLocalTranslationProvider(config)) return;
        const lifecycleToken = this.plugin.getLifecycleToken();
        const signal = this.plugin.getAutoTranslationAbortSignal();
        const isCurrent = () => !signal?.aborted
            && this.plugin.isLifecycleTokenCurrent(lifecycleToken)
            && this.plugin.isAutoTranslationProviderSnapshotCurrent(providerKey, requestOptions);
        if (!isCurrent()) return;
        this.plugin.setApiRuntimeStatus("translation", "testing", this.plugin.t("apiStatusTesting"));
        const startedAt = Date.now();
        this.plugin.localProviderHealthProbeStartedAt.set(providerKey, startedAt);
        const promise = (async () => {
            let endpoint = "";
            try {
                if (this.plugin.shouldAutoDetectLocalProviderModel(config, DEFAULT_SETTINGS.translation)) {
                    await this.plugin.refreshLocalProviderDetectedModel(config, { defaultConfig: DEFAULT_SETTINGS.translation, signal, isCurrent });
                }
                if (!isCurrent()) return;
                const test = this.plugin.buildConnectionTestRequest("translation", config);
                endpoint = test.endpoint;
                try {
                    await this.plugin.fetchModelResponse(test.endpoint, test.request, API_TEST_REQUEST_TIMEOUT_MS, {
                        signal,
                        connectionTest: true
                    });
                    if (!isCurrent()) return;
                }
                catch (error) {
                    if (!isCurrent()) return;
                    if (!this.plugin.isAcceptableConnectionTestTruncation(error, "translation", config)) throw error;
                    this.plugin.logDiagnostic("auto.provider.health", "truncated-ok", {
                        key: this.plugin.getTextFingerprint(providerKey),
                        reason: options.reason || "",
                        partialOutputLength: Number(error.partialOutputLength || 0),
                        finishReason: error.finishReason || "",
                        ms: Date.now() - startedAt
                    });
                }
                this.plugin.autoTranslationProviderFailures.delete(providerKey);
                // The "needs you" episode stays open: a server that answers this tiny request can still
                // fail real messages (HTTP 5xx). A successful translation request ends it.
                this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
                this.plugin.markLocalProviderHealthy(providerKey);
                this.plugin.logDiagnostic("auto.provider.health", "success", {
                    key: this.plugin.getTextFingerprint(providerKey),
                    reason: options.reason || "",
                    ms: Date.now() - startedAt
                });
                if (this.plugin.isStarted) this.plugin.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            }
            catch (error) {
                if (!isCurrent() || this.plugin.isRequestCancelled(error)) return;
                this.plugin.annotateModelRequestError(error, "translation", endpoint || config.endpoint, config, requestOptions);
                if (!error.localProviderUnavailable) {
                    error.localProviderUnavailable = true;
                    error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
                    error.providerKey = providerKey;
                    error.localProviderEndpoint = error.localProviderEndpoint || String(endpoint || config.endpoint || "");
                }
                this.plugin.markAutoTranslationProviderFailure(requestOptions, error);
                // Failures the provider cooldown does not record (an invalid or unsafe API URL) still end the
                // "testing" status this probe set, with the reason.
                if (this.plugin.getApiStatus("translation").state === "testing" && !this.plugin.isRequestCancelled(error)) {
                    this.plugin.setApiRuntimeStatus("translation", "failed", this.plugin.t("apiStatusFailed"), this.plugin.formatError(error));
                }
                this.plugin.logDiagnostic("auto.provider.health", "failed", {
                    key: this.plugin.getTextFingerprint(providerKey),
                    reason: options.reason || "",
                    type: this.plugin.getAutoTranslationFailureType(error),
                    ms: Date.now() - startedAt
                });
                this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRetryAfter(error, 1));
            }
        })().finally(() => {
            if (this.plugin.localProviderHealthChecks.get(providerKey) === promise) {
                this.plugin.localProviderHealthChecks.delete(providerKey);
                this.plugin.localProviderHealthProbeStartedAt.delete(providerKey);
                if (signal?.aborted
                    && this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                    && this.plugin.isAutoTranslationProviderSnapshotCurrent(providerKey, requestOptions)
                    && !this.plugin.isApiTestRunning?.("translation")
                    && this.plugin.getApiStatus("translation").state === "testing") {
                    this.plugin.setApiRuntimeStatus("translation", "untested", this.plugin.t("apiStatusUntested"));
                }
            }
        });
        this.plugin.localProviderHealthChecks.set(providerKey, promise);
    }
};

module.exports = methods;
