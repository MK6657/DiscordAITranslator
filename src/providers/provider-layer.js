"use strict";

// Phase 3 of the modularization plan: provider registry, endpoint policy, request builders, parsers, error mapping, fallback policy, Google key pool and local-provider health.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    API_TEST_REQUEST_TIMEOUT_MS,
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_PROVIDER_FAILURE_TTL,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_REASON_CODES,
    GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS,
    LANGUAGE_PRESETS,
    LOCAL_PROVIDER_AUTO_MODEL_VALUE,
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS,
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS,
    MODEL_REQUEST_TIMEOUT_MS,
    PROVIDER_DEFAULTS,
    PROVIDER_ORDER,
    SETTINGS_WRITE_DEBOUNCE_MS
} = require("../constants");

class ProviderLayer {
    constructor(plugin) {
        this.plugin = plugin;
    }

    getProviderDefaults(provider) {
        return PROVIDER_DEFAULTS[String(provider || "").trim()] || null;
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
        return this.plugin.isGoogleTranslateProvider(configOrProvider)
            || this.plugin.isMicrosoftTranslateProvider(configOrProvider)
            || this.plugin.isDeepLTranslateProvider(configOrProvider)
            || this.plugin.isBaiduTranslateProvider(configOrProvider);
    }

    isLocalTranslationProvider(configOrProvider) {
        const provider = typeof configOrProvider === "string" ? configOrProvider : configOrProvider?.provider;
        return provider === "sakuraLocal";
    }

    isLocalProviderAutoModelValue(model) {
        const value = String(model || "").trim();
        return !value || value === LOCAL_PROVIDER_AUTO_MODEL_VALUE;
    }

    getEffectiveChatCompletionEndpoint(config = {}, defaultConfig = {}) {
        const providerDefault = PROVIDER_DEFAULTS[config.provider] || {};
        return String(config.endpoint || providerDefault.endpoint || defaultConfig.endpoint || "").trim();
    }

    shouldAutoDetectLocalProviderModel(config = {}, defaultConfig = {}) {
        if (!this.plugin.isLocalTranslationProvider(config)) return false;
        const providerDefault = PROVIDER_DEFAULTS[config.provider] || {};
        const model = String(config.model || providerDefault.model || defaultConfig.model || "").trim();
        if (!this.plugin.isLocalProviderAutoModelValue(model)) return false;
        return this.plugin.isLoopbackEndpoint(this.plugin.getEffectiveChatCompletionEndpoint(config, defaultConfig));
    }

    getLocalProviderModelDetectionCacheKey(config = {}, defaultConfig = {}) {
        if (!this.plugin.isLocalTranslationProvider(config)) return "";
        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, defaultConfig);
        if (!endpoint) return "";
        return [
            config.provider || "sakuraLocal",
            endpoint,
            this.plugin.getTextFingerprint(String(config.apiKey || "").trim())
        ].join("\n---\n");
    }

    getCachedLocalProviderDetectedModel(config = {}, options = {}) {
        const key = this.plugin.getLocalProviderModelDetectionCacheKey(config, options.defaultConfig);
        if (!key) return "";
        const entry = this.plugin.localProviderDetectedModels?.get?.(key);
        const model = String(entry?.model || "").trim();
        if (!model) return "";
        if (options.allowExpired === false && Number(entry.expiresAt || 0) <= Date.now()) return "";
        return model;
    }

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
            this.plugin.scheduleTranslationCachePersist();
            this.plugin.cachedDrawMemo?.clear?.();
        }
        return normalized;
    }

    getPersistableLocalProviderDetectedModels() {
        return [...(this.plugin.localProviderDetectedModels?.entries?.() || [])]
            .filter(([key, entry]) => key && String(entry?.model || "").trim())
            .sort((left, right) => Number(right[1].detectedAt || 0) - Number(left[1].detectedAt || 0))
            .slice(0, 8)
            .map(([key, entry]) => ({ key, model: String(entry.model).trim() }));
    }

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
    }

    getEffectiveChatCompletionModel(kind, config = {}, defaultConfig = DEFAULT_SETTINGS[kind] || {}) {
        const providerDefault = PROVIDER_DEFAULTS[config.provider] || {};
        const configured = String(config.model || providerDefault.model || defaultConfig.model || "").trim();
        if (this.plugin.shouldAutoDetectLocalProviderModel(config, defaultConfig)) {
            return this.plugin.getCachedLocalProviderDetectedModel(config, { defaultConfig }) || configured || LOCAL_PROVIDER_AUTO_MODEL_VALUE;
        }
        return configured;
    }

    async refreshLocalProviderDetectedModel(config = {}, options = {}) {
        if (!this.plugin.shouldAutoDetectLocalProviderModel(config, options.defaultConfig)) return "";
        const key = this.plugin.getLocalProviderModelDetectionCacheKey(config, options.defaultConfig);
        if (!key) return "";
        const now = Date.now();
        const cached = this.plugin.localProviderDetectedModels.get(key);
        if (!options.force && cached?.model && Number(cached.expiresAt || 0) > now) return cached.model;
        if (!options.force && Number(cached?.retryAt || 0) > now) return String(cached.model || "");
        if (this.plugin.localProviderModelDetections.has(key)) return this.plugin.localProviderModelDetections.get(key);

        const promise = (async () => {
            const startedAt = Date.now();
            try {
                const model = await this.plugin.fetchLocalProviderDetectedModel(config, options);
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
            finally {
                this.plugin.localProviderModelDetections.delete(key);
            }
        })();
        this.plugin.localProviderModelDetections.set(key, promise);
        return promise;
    }

    async fetchLocalProviderDetectedModel(config = {}, options = {}) {
        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, options.defaultConfig);
        const modelsEndpoint = this.plugin.getLocalProviderModelsEndpoint(endpoint);
        if (!modelsEndpoint) return "";
        const raw = await this.plugin.fetchApiResponseText(modelsEndpoint, {
            method: "GET",
            provider: config.provider,
            headers: this.plugin.getRequestHeaders(config, this.plugin.getEffectiveRequestApiKey(config))
        }, Math.max(1000, Number(options.timeoutMs || LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS) || LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS));
        return this.plugin.parseLocalProviderModelsResponse(raw);
    }

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
            url.search = "";
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
    }

    parseLocalProviderModelsResponse(raw) {
        const data = typeof raw === "string" ? this.plugin.parseApiJson(raw) : raw;
        const candidates = [];
        const addModel = value => {
            const model = this.plugin.normalizeLocalProviderModelId(value);
            if (model && !candidates.includes(model)) candidates.push(model);
        };
        const add = value => {
            if (!value) return;
            if (typeof value === "string") {
                addModel(value);
                return;
            }
            if (Array.isArray(value)) {
                value.forEach(add);
                return;
            }
            if (typeof value !== "object") return;
            ["id", "model", "name", "path", "filename"].forEach(field => addModel(value[field]));
            ["data", "models", "items", "result", "results"].forEach(field => {
                if (Array.isArray(value[field])) add(value[field]);
            });
        };

        add(data?.data);
        add(data?.models);
        add(data?.items);
        if (!candidates.length) add(data);
        return candidates.find(model => /\.gguf(?:$|[?#])/i.test(model)) || candidates[0] || "";
    }

    normalizeLocalProviderModelId(value) {
        const text = String(value || "").trim();
        if (!text || /^(?:list|model|models)$/i.test(text)) return "";
        return text;
    }

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
    }

    getGoogleTranslateKeys() {
        const normalized = this.plugin.normalizeGoogleTranslateKeyPool(this.plugin.settings.googleTranslate || {});
        this.plugin.settings.googleTranslate.keys = normalized.keys;
        this.plugin.settings.googleTranslate.keyPoolText = normalized.keyPoolText;
        this.plugin.settings.googleTranslate.usageById = normalized.usageById;
        return normalized.keys;
    }

    countGoogleTranslateChars(texts) {
        const values = Array.isArray(texts) ? texts : [texts];
        return values.reduce((sum, text) => sum + [...String(text || "")].length, 0);
    }

    peekGoogleTranslateAvailableKey(charCount = 1, options = {}) {
        return this.plugin.selectGoogleTranslateKey(charCount, { ...options, persist: false });
    }

    selectGoogleTranslateKey(charCount = 1, options = {}) {
        const now = Date.now();
        const keys = this.plugin.getGoogleTranslateKeys();
        const needed = Math.max(1, Math.round(Number(charCount) || 1));
        const available = keys.find(key => key.enabled !== false
            && (options.ignoreCooldown || Number(key.cooldownUntil || 0) <= now)
            && Number(key.usedChars || 0) + (options.ignoreReservations ? 0 : this.plugin.getGoogleTranslateReservedChars(key)) + needed <= Number(key.monthlyLimit || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT));
        if (available || options.persist === false) return available || null;
        this.plugin.saveGoogleTranslateRuntimeState();
        return null;
    }

    getGoogleTranslateReservedChars(keyOrId) {
        const id = typeof keyOrId === "string" ? keyOrId : keyOrId?.id;
        return Math.max(0, Number(this.plugin.googleTranslateReservedChars.get(String(id || "")) || 0) || 0);
    }

    reserveGoogleTranslateKey(key, charCount = 0) {
        const id = String(key?.id || "");
        const chars = Math.max(0, Math.round(Number(charCount) || 0));
        if (!id || !chars) return null;
        this.plugin.googleTranslateReservedChars.set(id, this.plugin.getGoogleTranslateReservedChars(id) + chars);
        return { keyId: id, charCount: chars };
    }

    releaseGoogleTranslateReservation(reservation) {
        const id = String(reservation?.keyId || "");
        const chars = Math.max(0, Math.round(Number(reservation?.charCount) || 0));
        if (!id || !chars) return;
        const next = this.plugin.getGoogleTranslateReservedChars(id) - chars;
        if (next > 0) this.plugin.googleTranslateReservedChars.set(id, next);
        else this.plugin.googleTranslateReservedChars.delete(id);
    }

    reserveGoogleTranslateRequest(request) {
        const meta = request?.googleTranslate;
        if (request?.provider !== "googleCloud" || !meta || meta.reservation) return;
        const key = this.plugin.getGoogleTranslateKeys().find(item => item.id === meta.keyId || item.apiKey === meta.apiKey);
        const needed = Math.max(1, Math.round(Number(meta.charCount) || 1));
        if (!key || Number(key.usedChars || 0) + this.plugin.getGoogleTranslateReservedChars(key) + needed > Number(key.monthlyLimit || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT)) {
            throw this.plugin.createGoogleTranslateQuotaError({ charCount: needed, key });
        }
        meta.reservation = this.plugin.reserveGoogleTranslateKey(key, needed);
    }

    createGoogleTranslateQuotaError(options = {}) {
        const error = new Error(this.plugin.t("googleTranslateQuotaExceeded"));
        error.googleTranslateQuotaExceeded = true;
        error.providerKey = this.plugin.getGoogleTranslateProviderKey(options.key || null);
        error.retryAfterMs = Math.max(Number(options.retryAfterMs || 0), this.plugin.getGoogleTranslateQuotaRetryAfterMs());
        if (options.key?.apiKey) {
            error.googleTranslateApiKey = options.key.apiKey;
            error.googleTranslateKeyId = options.key.id || "";
        }
        if (options.charCount !== undefined) error.googleTranslateCharCount = Math.max(0, Math.round(Number(options.charCount) || 0));
        return error;
    }

    // No key can take the request, but one with room this month only waits out a cooldown
    // (a per-minute limit, a rejected request). Returns when the first of those comes back, or 0.
    getGoogleTranslateCoolingKeyReadyAt(charCount = 1, options = {}) {
        const now = Date.now();
        const needed = Math.max(1, Math.round(Number(charCount) || 1));
        const readyAt = this.plugin.getGoogleTranslateKeys()
            .filter(key => key.enabled !== false
                && Number(key.cooldownUntil || 0) > now
                && Number(key.usedChars || 0) + (options.ignoreReservations ? 0 : this.plugin.getGoogleTranslateReservedChars(key)) + needed <= Number(key.monthlyLimit || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT))
            .map(key => Number(key.cooldownUntil));
        return readyAt.length ? Math.min(...readyAt) : 0;
    }

    // Every usable key is cooling down: the pool waits until the first one is back. This is a
    // rate limit for the whole pool, not an exhausted quota.
    createGoogleTranslateCooldownError(options = {}) {
        const until = Math.max(Date.now() + 1000, Number(options.until) || 0);
        const error = new Error(this.plugin.formatGoogleTranslateCooldownMessage(until));
        error.googleTranslateKeysCooling = true;
        error.googleTranslateCooldownUntil = until;
        error.providerRateLimited = true;
        error.providerKey = this.plugin.getGoogleTranslateProviderKey();
        error.retryAfterMs = until - Date.now();
        if (options.charCount !== undefined) error.googleTranslateCharCount = Math.max(0, Math.round(Number(options.charCount) || 0));
        return error;
    }

    formatGoogleTranslateCooldownMessage(until) {
        return this.plugin.t("googleTranslateKeysCooling", { time: this.plugin.formatDiagnosticSummaryTime(until) });
    }

    // Names the pool key a Google error came from (by its label, never the key itself).
    formatGoogleTranslateKeyError(error, options = {}) {
        const message = this.plugin.formatError(error, options);
        const keyId = String(error?.googleTranslateKeyId || "");
        const apiKey = String(error?.googleTranslateApiKey || "");
        if (!keyId && !apiKey) return message;
        const key = this.plugin.getGoogleTranslateKeys().find(item => (keyId && item.id === keyId) || (apiKey && item.apiKey === apiKey));
        return key?.label ? this.plugin.t("googleTranslateKeyError", { label: key.label, error: message }) : message;
    }

    // A failure of one pool key needs the user only when no other key can take over.
    isGoogleTranslatePoolServing(error) {
        if (!error?.googleTranslateApiKey || error.googleTranslateKeysCooling) return false;
        return Boolean(this.plugin.peekGoogleTranslateAvailableKey(1, { ignoreReservations: true }));
    }

    createGoogleTranslateNoKeyError() {
        const error = new Error(this.plugin.t("googleTranslateNoKey"));
        error.googleTranslateNoKey = true;
        error.providerKey = this.plugin.getGoogleTranslateProviderKey();
        error.retryAfterMs = AUTO_TRANSLATE_FAILURE_MAX_TTL;
        return error;
    }

    getGoogleTranslateQuotaRetryAfterMs(now = Date.now()) {
        const date = new Date(now);
        const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 5, 0, 0).getTime();
        return Math.max(AUTO_TRANSLATE_FAILURE_MAX_TTL, Math.min(nextMonth - now, 7 * 24 * 60 * 60 * 1000));
    }

    releaseGoogleTranslateRequestReservation(request) {
        this.plugin.releaseGoogleTranslateReservation(request?.googleTranslate?.reservation);
        if (request?.googleTranslate) request.googleTranslate.reservation = null;
    }

    getGoogleTranslateUsageSummary() {
        const keys = this.plugin.getGoogleTranslateKeys();
        const now = Date.now();
        const coolingUntil = keys
            .filter(key => key.enabled !== false && Number(key.cooldownUntil || 0) > now)
            .map(key => Number(key.cooldownUntil));
        return {
            monthKey: this.plugin.getCurrentMonthKey(),
            total: keys.length,
            available: keys.filter(key => key.enabled !== false && Number(key.cooldownUntil || 0) <= now && Number(key.usedChars || 0) + this.plugin.getGoogleTranslateReservedChars(key) < Number(key.monthlyLimit || 0)).length,
            used: keys.reduce((sum, key) => sum + Math.max(0, Number(key.usedChars || 0) || 0), 0),
            limit: keys.reduce((sum, key) => sum + Math.max(0, Number(key.monthlyLimit || 0) || 0), 0),
            coolingDown: coolingUntil.length,
            nextCooldownEndsAt: coolingUntil.length ? Math.min(...coolingUntil) : 0
        };
    }

    saveGoogleTranslateRuntimeState() {
        this.plugin.scheduleGoogleTranslateRuntimeStatePersist();
        return true;
    }

    scheduleGoogleTranslateRuntimeStatePersist(delayMs = GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS) {
        const delay = Math.max(0, Number(delayMs) || 0);
        const persistAt = Date.now() + delay;
        this.plugin.googleTranslateRuntimeDirty = true;
        if (this.plugin.googleTranslateRuntimeDirtyTimer && this.plugin.googleTranslateRuntimeDirtyAt && this.plugin.googleTranslateRuntimeDirtyAt <= persistAt) return;
        if (this.plugin.googleTranslateRuntimeDirtyTimer) clearTimeout(this.plugin.googleTranslateRuntimeDirtyTimer);
        this.plugin.googleTranslateRuntimeDirtyAt = persistAt;
        this.plugin.googleTranslateRuntimeDirtyTimer = setTimeout(() => this.plugin.flushGoogleTranslateRuntimeState(), delay);
        this.plugin.unrefTimer(this.plugin.googleTranslateRuntimeDirtyTimer);
    }

    flushGoogleTranslateRuntimeState(options = {}) {
        if (!this.plugin.googleTranslateRuntimeDirty && options.force !== true) return true;
        if (this.plugin.googleTranslateRuntimeDirtyTimer) {
            clearTimeout(this.plugin.googleTranslateRuntimeDirtyTimer);
            this.plugin.googleTranslateRuntimeDirtyTimer = null;
        }
        this.plugin.googleTranslateRuntimeDirtyAt = 0;
        const normalized = this.plugin.normalizeGoogleTranslateKeyPool(this.plugin.settings.googleTranslate || {});
        this.plugin.settings.googleTranslate.keys = normalized.keys;
        this.plugin.settings.googleTranslate.keyPoolText = normalized.keyPoolText;
        this.plugin.settings.googleTranslate.usageById = normalized.usageById;
        if (this.plugin.saveSettings() === true) {
            this.plugin.googleTranslateRuntimeDirty = false;
            return true;
        }
        this.plugin.googleTranslateRuntimeDirty = true;
        if (options.retryOnError !== false) this.plugin.scheduleGoogleTranslateRuntimeStatePersist(GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS);
        return false;
    }

    resetGoogleTranslateUsageStats() {
        const monthKey = this.plugin.getCurrentMonthKey();
        this.plugin.settings.googleTranslate.keys = this.plugin.getGoogleTranslateKeys().map(key => ({
            ...key,
            usedChars: 0,
            monthKey,
            cooldownUntil: 0,
            lastError: ""
        }));
        // Also forget the remembered usage of keys no longer in the pool.
        this.plugin.settings.googleTranslate.usageById = {};
        this.plugin.saveGoogleTranslateRuntimeState();
        this.plugin.showToast(this.plugin.t("googleTranslateStatsReset"), "success");
    }

    markGoogleTranslateKeyUsage(apiKey, charCount, options = {}) {
        const keyHash = this.plugin.getTextFingerprint(String(apiKey || "").trim());
        const monthKey = this.plugin.getCurrentMonthKey();
        const usedDelta = Math.max(0, Math.round(Number(charCount) || 0));
        const keys = this.plugin.getGoogleTranslateKeys().map(key => {
            if (this.plugin.getTextFingerprint(key.apiKey) !== keyHash) return key;
            return {
                ...key,
                monthKey,
                usedChars: Math.max(0, Number(key.usedChars || 0) || 0) + usedDelta,
                // A passing API test brings a cooling key back right away.
                ...(options.clearCooldown ? { cooldownUntil: 0 } : {}),
                lastError: ""
            };
        });
        this.plugin.settings.googleTranslate.keys = keys;
        const usageById = this.plugin.settings.googleTranslate.usageById || {};
        keys.forEach(key => {
            if (key.id && key.usedChars > 0) usageById[key.id] = { monthKey, usedChars: key.usedChars };
        });
        this.plugin.settings.googleTranslate.usageById = usageById;
        this.plugin.saveGoogleTranslateRuntimeState();
    }

    markGoogleTranslateKeyFailure(apiKey, error, options = {}) {
        const keyHash = this.plugin.getTextFingerprint(String(apiKey || "").trim());
        const type = this.plugin.getAutoTranslationFailureType(error);
        const retryAfterMs = Math.max(Number(error?.retryAfterMs || 0) || 0, options.retryAfterMs || (type === "rate-limit" ? 60000 : type === "auth" ? 30 * 60 * 1000 : 15000));
        const cooldownUntil = Date.now() + retryAfterMs;
        this.plugin.settings.googleTranslate.keys = this.plugin.getGoogleTranslateKeys().map(key => {
            if (this.plugin.getTextFingerprint(key.apiKey) !== keyHash) return key;
            return {
                ...key,
                cooldownUntil,
                lastError: this.plugin.formatError(error)
            };
        });
        this.plugin.saveGoogleTranslateRuntimeState();
    }

    markGoogleTranslateProviderSuccess(request = null) {
        const providerKey = request?.providerKey || this.plugin.getGoogleTranslateProviderKey();
        if (providerKey) this.plugin.autoTranslationProviderFailures.delete(providerKey);
        this.plugin.autoTranslationProviderFailures.delete(this.plugin.getGoogleTranslateProviderKey());
        const currentConfig = this.plugin.getEffectiveTaskConfig("translation");
        if (this.plugin.isGoogleTranslateProvider(currentConfig)) {
            this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
        }
    }

    getGoogleLanguageCode(language, options = {}) {
        if (options.source && (!language || language === AUTO_LANGUAGE_VALUE)) return "";
        const normalized = this.plugin.normalizeLanguageName(language);
        const legacyCodes = {
            "姹夎": "zh-CN",
            "鑻辫": "en",
            "瑗跨彮鐗欒": "es",
            "娉曡": "fr",
            "鍗板湴璇?": "hi",
            "淇勮": "ru",
            "寰疯": "de",
            "鏃ヨ": "ja",
            "闃挎媺浼": "ar",
            "瓒婂崡璇?": "vi",
            "鏈濋矞璇?": "ko",
            "鎰忓ぇ鍒╄": "it"
        };
        if (legacyCodes[normalized]) return legacyCodes[normalized];
        const preset = LANGUAGE_PRESETS.find(item => item.value === normalized || item.en.toLowerCase() === String(language || "").toLowerCase());
        if (preset?.code) return preset.code === "zh" ? "zh-CN" : preset.code;
        const value = String(language || "").trim();
        if (/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(value)) return value;
        // LLM instruction labels end with the code, e.g. "Spanish (Español, es)". Prefer that
        // explicit code; \b alone treats ñ/ç/ế as boundaries and finds "ol" in "Español".
        const explicit = value.match(/[(,]\s*([a-z]{2,3}(?:-[A-Za-z0-9]+)?)\s*\)/);
        const embedded = explicit || value.match(/(?<![\p{L}\p{N}_-])([a-z]{2,3}(?:-[A-Za-z0-9]+)?)(?![\p{L}\p{N}_-])/u);
        if (embedded?.[1]) return embedded[1] === "zh" ? "zh-CN" : embedded[1];
        return value;
    }

    // The raw target of a request for direct translation APIs, resolved from the user's
    // language setting rather than from the LLM instruction text.
    getTargetLanguageCode(language) {
        if (!language || language === AUTO_LANGUAGE_VALUE) return "";
        return this.plugin.getGoogleLanguageCode(language);
    }

    getEffectiveRequestApiKey(config) {
        if (config?.provider === "googleCloud") {
            return this.plugin.peekGoogleTranslateAvailableKey(1)?.apiKey || "";
        }
        if (config?.provider === "baidu") {
            return String(config?.secretKey || "").trim();
        }
        const apiKey = String(config?.apiKey || "").trim();
        if (apiKey) return apiKey;
        return this.plugin.isProviderApiKeyOptional(config?.provider) ? "local" : "";
    }

    getRequestHeaders(config, effectiveApiKey) {
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

    hasUsableApiConfig(kind, configOverrides = null) {
        const config = this.plugin.getEffectiveTaskConfig(kind, configOverrides);
        const defaults = DEFAULT_SETTINGS[kind] || {};
        const providerDefaults = this.plugin.getProviderDefaults(config.provider) || {};
        const endpoint = String(config.endpoint || providerDefaults.endpoint || defaults.endpoint || "").trim();
        const model = String(config.model || providerDefaults.model || defaults.model || "").trim();
        if (config.provider === "baidu") {
            return Boolean(endpoint && String(config.appId || "").trim() && String(config.secretKey || "").trim());
        }
        const requiresModel = this.plugin.isChatCompletionProvider(config);
        return Boolean(endpoint && (!requiresModel || model) && this.plugin.getEffectiveRequestApiKey(config));
    }

    setApiStatus(status, state, text, title = "", kind = status?.dataset?.daitKind) {
        if (!status) return;
        status.className = `dait-api-status dait-api-status-${state}`;
        status.textContent = text;
        status.title = title;
        if (kind && this.plugin.settings[kind]) {
            this.plugin.settings[kind].apiStatus = { state, message: title || "" };
            this.plugin.saveSettings({ debounce: true });
        }
    }

    setApiRuntimeStatus(kind, state, text = this.plugin.getApiStatusText(state), title = "") {
        if (!kind || !this.plugin.settings[kind]) return;
        const next = { state, message: title || "" };
        const previous = this.plugin.getApiStatus(kind);
        if (previous.state !== next.state || previous.message !== next.message) {
            this.plugin.settings[kind].apiStatus = next;
            this.plugin.saveSettings({ debounce: true, delayMs: SETTINGS_WRITE_DEBOUNCE_MS });
        }
        if (typeof document === "undefined") return;
        document.querySelectorAll(`.dait-api-status[data-dait-kind='${kind}']`).forEach(status => {
            status.className = `dait-api-status dait-api-status-${state}`;
            status.textContent = text;
            status.title = title || "";
        });
    }

    markLocalProviderHealthy(providerKey) {
        if (!providerKey) return;
        this.plugin.localProviderHealthyKeys.add(providerKey);
        this.plugin.releaseProviderBlockedAutoTranslationItems(providerKey);
    }

    shouldBlockAutoTranslationForLocalProviderHealth(requestOptions = this.plugin.getAutoTranslationOptions()) {
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        if (!this.plugin.isLocalTranslationProvider(config)) return false;
        const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
        if (!providerKey) return true;
        if (this.plugin.localProviderHealthyKeys.has(providerKey) && this.plugin.getApiStatus("translation").state === "success") return false;
        this.plugin.startLocalProviderHealthProbe(providerKey, requestOptions, { reason: this.plugin.getApiStatus("translation").state || "untested" });
        return true;
    }

    getLocalProviderHealthProbeRetryMs(requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
        if (!providerKey) return LOCAL_PROVIDER_HEALTH_RETRY_MS;
        const startedAt = Number(this.plugin.localProviderHealthProbeStartedAt.get(providerKey) || 0);
        if (!startedAt || !this.plugin.localProviderHealthChecks.has(providerKey)) return LOCAL_PROVIDER_HEALTH_RETRY_MS;
        return Math.max(
            LOCAL_PROVIDER_HEALTH_RETRY_MS,
            API_TEST_REQUEST_TIMEOUT_MS + 500 - Math.max(0, now - startedAt)
        );
    }

    getLocalProviderHealthRetryMs(requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        const providerFailure = this.plugin.getAutoTranslationProviderFailure(requestOptions);
        if (providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure, now)) {
            return this.plugin.getAutoTranslationFailureRemainingMs(providerFailure, now);
        }
        return this.plugin.getLocalProviderHealthProbeRetryMs(requestOptions, now);
    }

    startLocalProviderHealthProbe(providerKey, requestOptions = this.plugin.getAutoTranslationOptions(), options = {}) {
        if (!providerKey || this.plugin.localProviderHealthChecks.has(providerKey)) return;
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        if (!this.plugin.isLocalTranslationProvider(config)) return;
        const lifecycleToken = this.plugin.getLifecycleToken();
        const providerSnapshotKey = providerKey;
        this.plugin.setApiRuntimeStatus("translation", "testing", this.plugin.t("apiStatusTesting"));
        const startedAt = Date.now();
        this.plugin.localProviderHealthProbeStartedAt.set(providerKey, startedAt);
        let promise = null;
        promise = (async () => {
            let endpoint = "";
            try {
                const test = this.plugin.buildConnectionTestRequest("translation");
                endpoint = test.endpoint;
                const raw = await this.plugin.fetchApiResponseText(test.endpoint, test.request, API_TEST_REQUEST_TIMEOUT_MS);
                if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, requestOptions)) return;
                try {
                    this.plugin.parseModelResponse(raw);
                }
                catch (error) {
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
                this.plugin.autoTranslationProviderNoticeAt.delete(providerKey);
                this.plugin.markLocalProviderHealthy(providerKey);
                this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
                this.plugin.logDiagnostic("auto.provider.health", "success", {
                    key: this.plugin.getTextFingerprint(providerKey),
                    reason: options.reason || "",
                    ms: Date.now() - startedAt
                });
                if (this.plugin.isStarted) this.plugin.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            }
            catch (error) {
                if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, requestOptions)) return;
                this.plugin.annotateModelRequestError(error, "translation", endpoint || config.endpoint, config, requestOptions);
                if (!error.localProviderUnavailable) {
                    error.localProviderUnavailable = true;
                    error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
                    error.providerKey = providerKey;
                }
                this.plugin.markAutoTranslationProviderFailure(requestOptions, error);
                this.plugin.logDiagnostic("auto.provider.health", "failed", {
                    key: this.plugin.getTextFingerprint(providerKey),
                    reason: options.reason || "",
                    type: this.plugin.getAutoTranslationFailureType(error),
                    ms: Date.now() - startedAt
                });
                this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRetryAfter(error, 1));
            }
            finally {
                if (this.plugin.localProviderHealthChecks.get(providerKey) === promise) this.plugin.localProviderHealthChecks.delete(providerKey);
                this.plugin.localProviderHealthProbeStartedAt.delete(providerKey);
            }
        })();
        this.plugin.localProviderHealthChecks.set(providerKey, promise);
    }

    resetApiStatus(kind, options = {}) {
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

    getProviderFallbackOrder(kind = "translation") {
        if (kind !== "translation") return [];
        if (this.plugin.settings.ui?.providerFallbackEnabled !== true) return [];
        const currentProvider = String(this.plugin.settings.translation?.provider || "");
        if (this.plugin.isLocalTranslationProvider({ provider: currentProvider })) return [];
        return (this.plugin.settings.ui?.providerFallbackOrder || [])
            .filter(provider => PROVIDER_ORDER.includes(provider))
            .filter(provider => provider !== currentProvider)
            .filter(provider => !this.plugin.isLocalTranslationProvider({ provider }));
    }

    shouldTryProviderFallback(kind, options = {}, currentConfig = this.plugin.getTaskConfig(kind), error = null) {
        if (kind !== "translation") return false;
        if (options.allowProviderFallback === false) return false;
        if (this.plugin.settings.ui?.providerFallbackEnabled !== true) return false;
        if (this.plugin.isLocalTranslationProvider(currentConfig)) return false;
        const mode = String(options.mode || options.configOverrides?.mode || "");
        if (!/^manual/.test(mode) && !/^public-bilingual(?:-|$)/.test(mode)) return false;
        const type = this.plugin.getAutoTranslationFailureType(error);
        return ["auth", "quota", "rate-limit", "server", "timeout", "network", "parse", "client", "invalid-output", "truncated"].includes(type);
    }

    getProviderFallbackConfig(kind, provider, baseConfig = this.plugin.getTaskConfig(kind)) {
        if (kind !== "translation" || !PROVIDER_ORDER.includes(provider)) return null;
        const defaults = this.plugin.getProviderDefaults(provider);
        if (!defaults) return null;
        const profile = this.plugin.getTaskProviderProfile(kind, provider) || {};
        return {
            ...baseConfig,
            ...defaults,
            provider,
            endpoint: profile.endpoint ?? defaults.endpoint ?? "",
            model: profile.model ?? defaults.model ?? "",
            apiKey: profile.apiKey ?? "",
            region: profile.region ?? defaults.region ?? "",
            deeplPlan: profile.deeplPlan ?? defaults.deeplPlan ?? "free",
            appId: profile.appId ?? "",
            secretKey: profile.secretKey ?? "",
            enableThinking: typeof profile.enableThinking === "boolean" ? profile.enableThinking : false,
            sourceLanguage: baseConfig.sourceLanguage || AUTO_LANGUAGE_VALUE,
            targetLanguage: baseConfig.targetLanguage || this.plugin.settings.translation?.targetLanguage
        };
    }

    async tryProviderFallbackModelTask(kind, input, options = {}, firstError = null, currentConfig = this.plugin.getTaskConfig(kind), diagnosticMode = kind) {
        if (!this.plugin.shouldTryProviderFallback(kind, options, currentConfig, firstError)) return null;
        const order = this.plugin.getProviderFallbackOrder(kind);
        if (!order.length) return null;
        const firstType = this.plugin.getAutoTranslationFailureType(firstError);
        for (const provider of order) {
            const fallbackConfig = this.plugin.getProviderFallbackConfig(kind, provider, currentConfig);
            if (!fallbackConfig) continue;
            if (!this.plugin.hasUsableApiConfig(kind, fallbackConfig)) {
                this.plugin.logDiagnostic("model.provider-fallback", "skipped", {
                    ...this.plugin.getDiagnosticBaseMeta("model", `${diagnosticMode}-fallback`, DIAGNOSTIC_REASON_CODES.CONFIG_MISSING),
                    fromProvider: currentConfig?.provider || "",
                    provider,
                    firstFailureType: firstType,
                    reason: "missing-config"
                });
                continue;
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
                const result = await this.plugin.runModelTask(kind, input, {
                    ...options,
                    mode: `${diagnosticMode}-provider-fallback`,
                    configOverrides: {
                        ...fallbackConfig,
                        ...(options.configOverrides || {}),
                        provider,
                        endpoint: fallbackConfig.endpoint,
                        model: fallbackConfig.model,
                        apiKey: fallbackConfig.apiKey,
                        region: fallbackConfig.region,
                        deeplPlan: fallbackConfig.deeplPlan,
                        appId: fallbackConfig.appId,
                        secretKey: fallbackConfig.secretKey
                    },
                    allowProviderFallback: false,
                    providerProfilePinned: true
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
                if (this.plugin.isRequestCancelled(error)) throw error;
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
        return null;
    }

    getCurrentMonthKey(date = new Date()) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
    }

    normalizeGoogleTranslateMonthlyLimit(value, fallback = GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT) {
        const number = Number(value);
        const normalized = Number.isFinite(number) && number > 0 ? Math.round(number) : Number(fallback);
        return Math.min(GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT, Math.max(1, normalized || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT));
    }

    parseGoogleTranslateKeyPoolText(text, existingKeys = []) {
        const existingByKey = new Map((existingKeys || []).map(entry => [String(entry?.apiKey || "").trim(), entry]));
        return String(text || "")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map((line, index) => {
                const parts = line.split(/[|\t]/).map(part => part.trim());
                let label = "";
                let apiKey = "";
                let monthlyLimit = "";
                if (parts.length >= 2) {
                    [label, apiKey, monthlyLimit = ""] = parts;
                }
                else {
                    apiKey = parts[0];
                }
                return {
                    ...(existingByKey.get(apiKey) || {}),
                    label: label || existingByKey.get(apiKey)?.label || `Google ${index + 1}`,
                    apiKey,
                    monthlyLimit
                };
            });
    }

    formatGoogleTranslateKeyPoolText(keys = []) {
        return (keys || [])
            .filter(entry => String(entry?.apiKey || "").trim())
            .map(entry => [entry.label || "", entry.apiKey || "", entry.monthlyLimit || ""].map(value => String(value || "").trim()).join("|").replace(/\|+$/g, ""))
            .join("\n");
    }

    normalizeGoogleTranslateKeyPool(settings = this.plugin.settings.googleTranslate || {}) {
        const currentMonth = this.plugin.getCurrentMonthKey();
        const defaultLimit = this.plugin.normalizeGoogleTranslateMonthlyLimit(settings.defaultMonthlyLimit, GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT);
        const hasKeyPoolText = Object.prototype.hasOwnProperty.call(settings || {}, "keyPoolText");
        const source = hasKeyPoolText
            ? this.plugin.parseGoogleTranslateKeyPoolText(settings.keyPoolText, settings.keys)
            : Array.isArray(settings.keys) ? settings.keys : [];
        const usageById = this.plugin.getGoogleTranslateUsageLedger(settings, currentMonth);
        const seen = new Set();
        const keys = [];
        source.forEach((entry, index) => {
            const apiKey = String(entry?.apiKey || "").trim();
            if (!apiKey || seen.has(apiKey)) return;
            seen.add(apiKey);
            const id = this.plugin.getTextFingerprint(apiKey);
            const monthKey = /^\d{4}-\d{2}$/.test(String(entry?.monthKey || "")) ? String(entry.monthKey) : currentMonth;
            const sameMonth = monthKey === currentMonth;
            const usedChars = sameMonth ? Math.max(0, Math.round(Number(entry?.usedChars || 0) || 0)) : 0;
            keys.push({
                id,
                label: String(entry?.label || `Google ${index + 1}`).trim() || `Google ${index + 1}`,
                apiKey,
                enabled: entry?.enabled !== false,
                monthlyLimit: this.plugin.normalizeGoogleTranslateMonthlyLimit(entry?.monthlyLimit, defaultLimit),
                // A key pasted back after its line was removed keeps this month's usage.
                usedChars: Math.max(usedChars, Number(usageById[id]?.usedChars || 0)),
                monthKey: currentMonth,
                cooldownUntil: Math.max(0, Math.round(Number(entry?.cooldownUntil || 0) || 0)),
                lastError: String(entry?.lastError || "").slice(0, 160)
            });
        });
        keys.forEach(key => {
            if (key.usedChars > 0) usageById[key.id] = { monthKey: currentMonth, usedChars: key.usedChars };
        });
        return {
            keys,
            keyPoolText: this.plugin.formatGoogleTranslateKeyPoolText(keys),
            usageById
        };
    }

    // This month's usage per key fingerprint (never the key itself). It outlives the key's
    // line in the pool, so removing a key and pasting it back cannot reset its usage.
    getGoogleTranslateUsageLedger(settings = this.plugin.settings.googleTranslate || {}, currentMonth = this.plugin.getCurrentMonthKey()) {
        const ledger = {};
        const remember = (id, value) => {
            const usedChars = Math.max(0, Math.round(Number(value) || 0));
            if (!id || !usedChars || Number(ledger[id]?.usedChars || 0) >= usedChars) return;
            ledger[id] = { monthKey: currentMonth, usedChars };
        };
        const stored = settings?.usageById;
        if (stored && typeof stored === "object" && !Array.isArray(stored)) {
            Object.entries(stored).forEach(([id, record]) => {
                if (/^[a-z0-9]{1,16}$/.test(id) && record?.monthKey === currentMonth) remember(id, record.usedChars);
            });
        }
        // Keys still in the pool before this change count too, so a line removed right now
        // keeps its latest usage.
        (Array.isArray(settings?.keys) ? settings.keys : []).forEach(entry => {
            const apiKey = String(entry?.apiKey || "").trim();
            const monthKey = /^\d{4}-\d{2}$/.test(String(entry?.monthKey || "")) ? String(entry.monthKey) : currentMonth;
            if (apiKey && monthKey === currentMonth) remember(this.plugin.getTextFingerprint(apiKey), entry?.usedChars);
        });
        return ledger;
    }

    getAutoTranslationProviderKey(requestOptions = this.plugin.getAutoTranslationOptions()) {
        if (requestOptions?.providerKey) return requestOptions.providerKey;
        const config = this.plugin.getCacheConfigSnapshot("translation", this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides));
        if (config.provider === "googleCloud") return this.plugin.getGoogleTranslateProviderKey();
        const rawConfig = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        const apiKeySource = rawConfig.provider === "baidu"
            ? `${rawConfig.appId || ""}:${rawConfig.secretKey || ""}`
            : requestOptions?.configOverrides?.apiKey ?? this.plugin.settings.translation?.apiKey;
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

    getGoogleTranslateProviderKey(key = null) {
        const apiKey = String(key?.apiKey || "").trim();
        return [
            "googleCloud",
            PROVIDER_DEFAULTS.googleCloud.endpoint,
            PROVIDER_DEFAULTS.googleCloud.model,
            apiKey ? this.plugin.getTextFingerprint(apiKey) : "pool"
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

    async runModelTaskWithResult(kind, input, options = {}) {
        const detectionConfig = this.plugin.getEffectiveTaskConfig(kind, options.configOverrides);
        if (this.plugin.shouldAutoDetectLocalProviderModel(detectionConfig, DEFAULT_SETTINGS[kind] || {})) {
            await this.plugin.refreshLocalProviderDetectedModel(detectionConfig, options);
        }
        let { endpoint, request } = this.plugin.buildModelRequest(kind, input, { ...options, deferGoogleTranslateReservation: true });
        let requestKey = this.plugin.getModelRequestKey(endpoint, request, input);
        const taskConfig = this.plugin.getEffectiveTaskConfig(kind, options.configOverrides);
        const diagnosticMode = options?.mode || options?.configOverrides?.mode || kind;
        const lifecycleToken = this.plugin.getLifecycleToken();
        // The provider snapshot only guards requests built from the live translation
        // settings; pinned profiles (public bilingual on the polish profile, provider
        // fallback) never match the live key and rely on their own commit guards.
        const providerSnapshotKey = kind === "translation" && !options.providerProfilePinned
            ? this.plugin.getAutoTranslationProviderKey({ configOverrides: taskConfig })
            : "";
        if (this.plugin.translationRequests.has(requestKey)) {
            const body = request?.body || {};
            this.plugin.logDiagnostic("model.request", "dedupe-hit", {
                ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, "request-dedupe"),
                kind,
                provider: taskConfig?.provider,
                model: body.model,
                inputHash: this.plugin.getStrongTextFingerprint(input),
                inputLength: String(input || "").length
            });
            return this.plugin.adoptSharedModelResult(this.plugin.translationRequests.get(requestKey), options);
        }
        if (request?.provider === "googleCloud") {
            ({ endpoint, request } = this.plugin.buildModelRequest(kind, input, options));
            requestKey = this.plugin.getModelRequestKey(endpoint, request, input);
            if (this.plugin.translationRequests.has(requestKey)) {
                const body = request?.body || {};
                this.plugin.logDiagnostic("model.request", "dedupe-hit", {
                    ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, "request-dedupe"),
                    kind,
                    provider: taskConfig?.provider,
                    model: body.model,
                    inputHash: this.plugin.getStrongTextFingerprint(input),
                    inputLength: String(input || "").length
                });
                return this.plugin.adoptSharedModelResult(this.plugin.translationRequests.get(requestKey), options);
            }
        }
        const body = request?.body || {};
        this.plugin.reserveGoogleTranslateRequest(request);

        const startedAt = Date.now();
        this.plugin.logDiagnostic("model.request", "start", {
            ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, DIAGNOSTIC_REASON_CODES.REQUEST_STARTED),
            kind,
                provider: taskConfig?.provider,
                model: body.model,
                inputHash: this.plugin.getStrongTextFingerprint(input),
                inputLength: String(input || "").length,
                promptLength: String(body?.messages?.[0]?.content || "").length,
                maxTokens: Number(body?.max_tokens || 0),
                longTextChunk: Boolean(options?.longTextChunk),
                longTextSourceLength: Number(options?.longTextSourceLength || 0) || 0,
                timeoutMs: options.timeoutMs || MODEL_REQUEST_TIMEOUT_MS
            });
        let promise = null;
        promise = this.plugin.fetchModelResponse(endpoint, request, options.timeoutMs || MODEL_REQUEST_TIMEOUT_MS, {
            googleTranslateAsArray: Boolean(options.googleTranslateAsArray),
            translateAsArray: Boolean(options.translateAsArray || options.googleTranslateAsArray),
            lifecycleToken,
            signal: options.signal
        })
            .then(result => {
                const requestStillCurrent = this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                    && (!providerSnapshotKey || this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, { configOverrides: taskConfig }));
                if (requestStillCurrent && providerSnapshotKey && kind === "translation" && this.plugin.isLocalTranslationProvider(taskConfig)) {
                    this.plugin.markLocalProviderHealthy(providerSnapshotKey);
                    this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
                }
                // A working request ends the provider's "needs your attention" episode.
                if (requestStillCurrent && kind === "translation" && this.plugin.autoTranslationProviderNoticeAt?.size) {
                    this.plugin.endTranslationAttentionEpisode?.(providerSnapshotKey || this.plugin.getAutoTranslationProviderKey({ configOverrides: taskConfig }));
                }
                if (requestStillCurrent) {
                    this.plugin.logDiagnostic("model.request", "success", {
                        ...this.plugin.getDiagnosticBaseMeta("model", diagnosticMode, "request-success"),
                        kind,
                        provider: taskConfig?.provider,
                        model: body.model,
                        inputHash: this.plugin.getStrongTextFingerprint(input),
                        ms: Date.now() - startedAt
                    });
                }
                return { text: result, fallbackProvider: "" };
            })
            .catch(async error => {
                this.plugin.annotateModelRequestError(error, kind, endpoint, taskConfig, options);
                const requestStillCurrent = this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                    && (!providerSnapshotKey || this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, { configOverrides: taskConfig }));
                if (error?.googleTranslateApiKey) {
                    this.plugin.markGoogleTranslateKeyFailure(error.googleTranslateApiKey, error);
                }
                if (!requestStillCurrent) throw error;
                if (requestStillCurrent) {
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
                        longTextChunk: Boolean(options?.longTextChunk),
                        longTextSourceLength: Number(options?.longTextSourceLength || 0) || 0,
                        ms: Date.now() - startedAt
                    });
                }
                const fallbackResult = await this.plugin.tryProviderFallbackModelTask(kind, input, options, error, taskConfig, diagnosticMode);
                if (fallbackResult?.used) {
                    // The shared promise resolves to a TranslationResult, so deduped
                    // callers see the fallback provider in-band and keep the result out
                    // of the primary provider cache.
                    return { text: fallbackResult.result, fallbackProvider: fallbackResult.provider };
                }
                throw error;
            })
            .finally(() => {
                if (this.plugin.translationRequests.get(requestKey) === promise) this.plugin.translationRequests.delete(requestKey);
            });
        this.plugin.translationRequests.set(requestKey, promise);
        return promise;
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
            if (request?.responseParser === "googleTranslate") {
                const result = this.plugin.parseGoogleTranslateResponse(raw, request?.googleTranslate?.expectedCount || 1, {
                    asArray: Boolean(options.googleTranslateAsArray || options.translateAsArray),
                    restoreMaps: request?.googleTranslate?.restoreMaps
                });
                this.plugin.markGoogleTranslateKeyUsage(request.googleTranslate?.apiKey, request.googleTranslate?.charCount || 0, {
                    clearCooldown: Boolean(options.connectionTest)
                });
                this.plugin.markGoogleTranslateProviderSuccess(request);
                return result;
            }
            if (request?.responseParser === "microsoftTranslate") {
                return this.plugin.parseMicrosoftTranslateResponse(raw, request?.translate?.expectedCount || 1, {
                    asArray: Boolean(options.translateAsArray)
                });
            }
            if (request?.responseParser === "deepLTranslate") {
                return this.plugin.parseDeepLTranslateResponse(raw, request?.translate?.expectedCount || 1, {
                    asArray: Boolean(options.translateAsArray)
                });
            }
            if (request?.responseParser === "baiduTranslate") {
                return this.plugin.parseBaiduTranslateResponse(raw, request?.translate?.expectedCount || 1, {
                    asArray: Boolean(options.translateAsArray),
                    rowCounts: request?.translate?.rowCounts
                });
            }
            return this.plugin.parseModelResponse(raw);
        }
        catch (error) {
            // Queued work orphaned by a settings change is aborted, but Google already received the
            // request and counts its characters: so does the key's monthly usage.
            if (request?.responseParser === "googleTranslate" && error?.requestSent && this.plugin.isRequestCancelled(error)) {
                this.plugin.markGoogleTranslateKeyUsage(request.googleTranslate?.apiKey, request.googleTranslate?.charCount || 0);
            }
            throw error;
        }
        finally {
            this.plugin.releaseGoogleTranslateRequestReservation(request);
        }
    }

    annotateModelRequestError(error, kind, endpoint, config, options = {}) {
        if (!error || kind !== "translation") return error;
        if (this.plugin.isLocalProviderUnavailableError(error, endpoint, config, options)) {
            error.localProviderUnavailable = true;
            error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
            error.providerKey = error.providerKey || this.plugin.getAutoTranslationProviderKey({ configOverrides: options.configOverrides });
        }
        return error;
    }

    isLocalProviderUnavailableError(error, endpoint, config, options = {}) {
        if (error?.localProviderUnavailable) return true;
        if (!this.plugin.isLocalTranslationProvider(config) || !this.plugin.isLoopbackEndpoint(endpoint || config?.endpoint)) return false;
        const status = Number(error?.status || 0);
        // A long request, or the larger retry after a cut-off output, can time out on a healthy
        // service that is just generating slowly.
        if (this.plugin.isTimeoutError(error)) return !options?.truncationRetry && !this.plugin.isLongAutoTranslationRequestOptions(options);
        if (this.plugin.isNetworkError(error)) return true;
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
        if (parsed.protocol === "http:" && this.plugin.isLoopbackEndpoint(parsed.href)) return parsed.href;
        const error = new Error("Remote API endpoints must use HTTPS; HTTP is allowed only for loopback endpoints.");
        error.code = "UNSAFE_API_ENDPOINT";
        throw error;
    }

    isTimeoutError(error) {
        if (this.plugin.isRequestCancelled(error)) return false;
        return error?.code === "REQUEST_TIMEOUT" || error?.name === "TimeoutError" || /timed out|timeout|ETIMEDOUT/i.test(this.plugin.getErrorSignalText(error));
    }

    isRequestCancelled(error) {
        return error?.code === "REQUEST_CANCELLED" || error?.name === "AbortError";
    }

    isNetworkError(error) {
        if (this.plugin.isRequestCancelled(error)) return false;
        return /Failed to fetch|NetworkError|Load failed|fetch failed|Network request failed|ERR_[A-Z_]+|ECONNREFUSED|ECONNRESET|ECONNABORTED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|connection refused|connection reset|socket hang up|NS_ERROR_CONNECTION_REFUSED/i
            .test(this.plugin.getErrorSignalText(error));
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
        this.plugin.assertSafeRequestEndpoint(endpoint);
        const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
        if (controller) this.plugin.activeApiControllers.add(controller);
        // abort() keeps its first reason, so the signal records whether the timer or a cancel came first.
        const timeout = controller ? setTimeout(() => controller.abort(new DOMException("API request timed out", "TimeoutError")), timeoutMs) : null;
        // The caller's signal (queued auto-translation work) cancels this request when that work is
        // orphaned by a settings change, so it does not keep a local server busy.
        const callerSignal = callerOptions?.signal || null;
        const abortFromCaller = () => controller?.abort();
        if (callerSignal && controller) {
            if (callerSignal.aborted) controller.abort();
            else callerSignal.addEventListener?.("abort", abortFromCaller, { once: true });
        }
        // Whether the request left the plugin: a service may bill a request it received, even when
        // the answer is thrown away.
        let sent = false;
        try {
            if (this.plugin.apiRequestsClosed) throw new DOMException("API requests are closed until the plugin starts", "AbortError");
            controller?.signal.throwIfAborted();
            const method = String(request?.method || "POST").trim().toUpperCase() || "POST";
            const fetchOptions = {
                method,
                headers: request.headers,
                // Endpoint validation applies only to this explicit destination.
                // Never forward message bodies or provider headers via redirects,
                // including redirects from a local provider to another service.
                redirect: "error",
                signal: controller?.signal
            };
            if (method !== "GET" && method !== "HEAD") {
                fetchOptions.body = request?.bodyEncoding === "form"
                    ? new URLSearchParams(request.body || {}).toString()
                    : JSON.stringify(request.body);
            }
            sent = true;
            const response = await fetch(endpoint, fetchOptions);

            const raw = await response.text();
            // Some transports resolve despite aborting. Never expose their late data.
            controller?.signal.throwIfAborted();
            if (!response.ok) {
                const apiError = this.plugin.createApiError(response, raw);
                if (request?.provider === "googleCloud") {
                    this.plugin.annotateGoogleTranslateApiError(apiError, raw, request);
                }
                this.plugin.annotateTranslateProviderApiError(apiError, raw, request);
                this.plugin.annotateChatCompletionApiError(apiError, raw, request);
                throw apiError;
            }

            return raw;
        }
        catch (error) {
            if (!controller?.signal.aborted && error?.name !== "AbortError") throw error;
            const timedOut = controller?.signal.reason?.name === "TimeoutError";
            throw Object.assign(new Error(timedOut
                ? `API request timed out after ${Math.round(timeoutMs / 1000)}s`
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

    abortActiveApiRequests() {
        if (!this.plugin.activeApiControllers?.size) return;
        for (const controller of [...this.plugin.activeApiControllers]) {
            try { controller.abort?.(); }
            catch {}
        }
        this.plugin.activeApiControllers.clear();
    }

    annotateGoogleTranslateApiError(error, raw = "", request = {}) {
        if (!error) return error;
        error.providerKey = request.providerKey || this.plugin.getGoogleTranslateProviderKey();
        error.googleTranslateApiKey = request.googleTranslate?.apiKey || "";
        error.googleTranslateKeyId = request.googleTranslate?.keyId || "";
        const status = Number(error.status || 0);
        const text = String(raw || "").slice(0, 4000);
        // Google's per-minute 429 also says RESOURCE_EXHAUSTED and "Quota exceeded", so the
        // short-window limits are checked first and only lock the key for about a minute.
        const dailyLimit = /dailyLimitExceeded|daily limit|per\s*day\b/i.test(text);
        const shortWindowLimit = /userRateLimitExceeded|rateLimitExceeded|per\s*(?:minute|second|100\s*seconds)\b/i.test(text);
        if (!dailyLimit && (shortWindowLimit || status === 429)) {
            error.providerRateLimited = true;
            error.retryAfterMs = Number(error.retryAfterMs || 0) > 0 ? Number(error.retryAfterMs) : AUTO_TRANSLATE_PROVIDER_FAILURE_TTL;
        }
        else if (dailyLimit) {
            error.googleTranslateQuotaExceeded = true;
            error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), this.plugin.getGoogleTranslateDailyQuotaRetryAfterMs());
        }
        else if (/RESOURCE_EXHAUSTED|quota|limit exceeded|monthly limit/i.test(text)) {
            error.googleTranslateQuotaExceeded = true;
            error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), this.plugin.getGoogleTranslateQuotaRetryAfterMs());
        }
        else if (/API_KEY_INVALID|API_KEY_EXPIRED|API key not valid|API key expired|PERMISSION_DENIED/i.test(text)) {
            // Google answers a mistyped or expired key with HTTP 400: the key is rejected, so it
            // cools like one and the message says the key is invalid.
            error.providerAuthFailed = true;
            error.googleTranslateKeyInvalid = true;
        }
        return error;
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

    // Google resets daily quota at midnight Pacific Time.
    getGoogleTranslateDailyQuotaRetryAfterMs(now = Date.now()) {
        const day = 24 * 60 * 60 * 1000;
        try {
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Los_Angeles",
                hourCycle: "h23",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }).formatToParts(new Date(now));
            const part = type => Number(parts.find(item => item.type === type)?.value || 0);
            const elapsedMs = ((part("hour") % 24) * 3600 + part("minute") * 60 + part("second")) * 1000;
            return Math.max(AUTO_TRANSLATE_FAILURE_MAX_TTL, day - elapsedMs + 5 * 60 * 1000);
        }
        catch {
            return day;
        }
    }

    getModelRequestKey(endpoint, request, input) {
        const body = request?.body || {};
        const authFingerprint = request?.provider === "googleCloud"
            ? this.plugin.getTextFingerprint(String(request?.googleTranslate?.apiKey || ""))
            : this.plugin.getTextFingerprint([
                request?.headers?.Authorization || "",
                request?.headers?.["Ocp-Apim-Subscription-Key"] || "",
                body?.appid || "",
                request?.providerKey || ""
            ].join("|"));
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

    async testApiConnection(kind, button, status) {
        const lifecycleToken = this.plugin.getLifecycleToken();
        this.plugin.setApiStatus(status, "testing", this.plugin.t("apiStatusTesting"));
        this.plugin.setButtonBusy(button, true, this.plugin.t("apiTestBusy"));
        let endpoint = "";
        let providerSnapshotKey = "";
        let testConfig = null;

        try {
            testConfig = this.plugin.clone(this.plugin.getTaskConfig(kind));
            providerSnapshotKey = kind === "translation"
                ? this.plugin.getAutoTranslationProviderKey({ configOverrides: testConfig })
                : "";
            if (this.plugin.shouldAutoDetectLocalProviderModel(testConfig, DEFAULT_SETTINGS[kind] || {})) {
                await this.plugin.refreshLocalProviderDetectedModel(testConfig, { configOverrides: testConfig, force: true });
            }
            const test = this.plugin.buildConnectionTestRequest(kind);
            endpoint = test.endpoint;
            await this.plugin.fetchModelResponse(test.endpoint, test.request, API_TEST_REQUEST_TIMEOUT_MS, { lifecycleToken, connectionTest: true });
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                || (kind === "translation" && !this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, { configOverrides: testConfig }))) return;
            this.plugin.clearAutoTranslationProviderFailureForCurrentConfig(kind);
            if (kind === "translation" && this.plugin.isLocalTranslationProvider(testConfig)) this.plugin.markLocalProviderHealthy(providerSnapshotKey);
            this.plugin.setApiStatus(status, "success", this.plugin.t("apiStatusSuccess"));
            if (kind === "translation") this.plugin.queueScan();
            this.plugin.showToast(this.plugin.t("apiTestSuccess", { name: this.plugin.getTaskDisplayName(kind) }), "success");
        }
        catch (error) {
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                || (kind === "translation" && providerSnapshotKey && !this.plugin.isAutoTranslationProviderSnapshotCurrent(providerSnapshotKey, { configOverrides: testConfig }))) return;
            if (this.plugin.isAcceptableConnectionTestTruncation(error, kind, testConfig)) {
                this.plugin.logDiagnostic("api.test", "truncated-ok", {
                    ...this.plugin.getDiagnosticBaseMeta(kind, "test", "request-success"),
                    provider: testConfig?.provider || "",
                    partialOutputLength: Number(error.partialOutputLength || 0),
                    finishReason: error.finishReason || ""
                });
                if (kind === "translation") {
                    this.plugin.clearAutoTranslationProviderFailureForCurrentConfig(kind);
                    this.plugin.markLocalProviderHealthy(providerSnapshotKey);
                    this.plugin.queueScan();
                }
                this.plugin.setApiStatus(status, "success", this.plugin.t("apiStatusSuccess"));
                this.plugin.showToast(this.plugin.t("apiTestSuccess", { name: this.plugin.getTaskDisplayName(kind) }), "success");
                return;
            }
            if (kind === "translation") {
                const config = this.plugin.getTaskConfig(kind);
                this.plugin.annotateModelRequestError(error, kind, endpoint || config.endpoint, config, { configOverrides: config });
                if (error?.googleTranslateApiKey) this.plugin.markGoogleTranslateKeyFailure(error.googleTranslateApiKey, error);
                if (error.localProviderUnavailable) this.plugin.markAutoTranslationProviderFailure(this.plugin.getAutoTranslationOptions(), error);
            }
            const message = this.plugin.formatGoogleTranslateKeyError(error);
            this.plugin.setApiStatus(status, "failed", this.plugin.t("apiStatusFailed"), message);
            this.plugin.showToast(this.plugin.t("apiTestFailed", { name: this.plugin.getTaskDisplayName(kind), error: message }), "error");
        }
        finally {
            if (this.plugin.isLifecycleTokenCurrent(lifecycleToken)) this.plugin.setButtonBusy(button, false, this.plugin.t("apiTest"));
        }
    }

    buildConnectionTestRequest(kind) {
        const taskConfig = this.plugin.getTaskConfig(kind);
        if (this.plugin.isDirectTranslateProvider(taskConfig)) {
            // Test the language pair the user actually translates into: some targets are
            // rejected by some services. When every Google key is cooling down, a cooling key
            // is tested, so a passing test can bring it back.
            const targetLanguage = taskConfig.targetLanguage || this.plugin.settings.translation?.targetLanguage;
            return this.plugin.buildModelRequest("translation", "hello", {
                configOverrides: {
                    ...taskConfig,
                    sourceLanguage: AUTO_LANGUAGE_VALUE,
                    targetLanguage,
                    targetLanguageCode: this.plugin.getTargetLanguageCode(targetLanguage)
                },
                ignoreGoogleTranslateCooldown: true
            });
        }
        const { config, endpoint, apiKey, model } = this.plugin.getApiConfig(kind);
        const body = this.plugin.applyProviderBodyOptions(config, {
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
                provider: config.provider,
                providerKey: kind === "translation" ? this.plugin.getAutoTranslationProviderKey({ configOverrides: config }) : "",
                headers: this.plugin.getRequestHeaders(config, apiKey),
                body
            }
        };
    }

    buildModelRequest(kind, input, options = {}) {
        const config = this.plugin.getTaskConfig(kind);
        const defaultConfig = DEFAULT_SETTINGS[kind] || {};
        const effectiveConfig = options.configOverrides
            ? { ...config, ...options.configOverrides }
            : config;
        if (this.plugin.isGoogleTranslateProvider(effectiveConfig)) {
            if (kind !== "translation") throw new Error(this.plugin.t("translationDisabled"));
            return this.plugin.buildGoogleTranslateRequest(input, effectiveConfig, {
                ignoreReservations: Boolean(options.deferGoogleTranslateReservation),
                ignoreCooldown: Boolean(options.ignoreGoogleTranslateCooldown),
                reserve: Boolean(options.reserveGoogleTranslateQuota)
            });
        }
        if (this.plugin.isMicrosoftTranslateProvider(effectiveConfig)) {
            if (kind !== "translation") throw new Error(this.plugin.t("translationDisabled"));
            return this.plugin.buildMicrosoftTranslateRequest(input, effectiveConfig);
        }
        if (this.plugin.isDeepLTranslateProvider(effectiveConfig)) {
            if (kind !== "translation") throw new Error(this.plugin.t("translationDisabled"));
            return this.plugin.buildDeepLTranslateRequest(input, effectiveConfig);
        }
        if (this.plugin.isBaiduTranslateProvider(effectiveConfig)) {
            if (kind !== "translation") throw new Error(this.plugin.t("translationDisabled"));
            return this.plugin.buildBaiduTranslateRequest(input, effectiveConfig);
        }
        return this.plugin.buildChatCompletionRequest(kind, input, effectiveConfig, defaultConfig);
    }

    buildChatCompletionRequest(kind, input, effectiveConfig, defaultConfig = DEFAULT_SETTINGS[kind] || {}) {
        const effectiveApiKey = this.plugin.getEffectiveRequestApiKey(effectiveConfig);
        if (!effectiveApiKey) throw new Error(kind === "polish" ? this.plugin.t("apiKeyMissingPolish") : this.plugin.t("apiKeyMissingTranslation"));
        const effectiveEndpoint = this.plugin.getEffectiveChatCompletionEndpoint(effectiveConfig, defaultConfig);
        const effectiveModel = this.plugin.getEffectiveChatCompletionModel(kind, effectiveConfig, defaultConfig);
        if (!effectiveEndpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (!effectiveModel) throw new Error(this.plugin.t("modelMissing"));
        const temperature = this.plugin.normalizeRequestNumber(effectiveConfig.temperature, defaultConfig.temperature ?? 0.2, { min: 0, max: 2 });
        const maxTokens = this.plugin.normalizeRequestNumber(effectiveConfig.maxTokens, defaultConfig.maxTokens ?? 800, { min: 1, integer: true });

        const systemPrompt = this.plugin.buildSystemPrompt(kind, effectiveConfig);
        const body = this.plugin.applyProviderBodyOptions(effectiveConfig, {
            model: effectiveModel,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: input }
            ],
            temperature,
            max_tokens: maxTokens,
            stream: false
        });

        return {
            endpoint: effectiveEndpoint,
            request: {
                provider: effectiveConfig.provider,
                providerKey: kind === "translation" ? this.plugin.getAutoTranslationProviderKey({ configOverrides: effectiveConfig }) : "",
                headers: this.plugin.getRequestHeaders(effectiveConfig, effectiveApiKey),
                body
            }
        };
    }

    buildGoogleTranslateRequest(input, config, options = {}) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const protectedPayloads = texts.map(text => this.plugin.protectGoogleTranslateText(text));
        const protectedTexts = protectedPayloads.map(payload => payload.text);
        const charCount = this.plugin.countGoogleTranslateChars(protectedTexts);
        const endpoint = String(PROVIDER_DEFAULTS.googleCloud.endpoint).trim();
        const target = this.plugin.getGoogleLanguageCode(config.targetLanguageCode || config.targetLanguage);
        if (!target || target === AUTO_LANGUAGE_VALUE) throw new Error(this.plugin.t("targetLanguageDesc"));
        const source = this.plugin.getGoogleLanguageCode(config.sourceLanguage, { source: true });
        const selectOptions = { ignoreReservations: Boolean(options.ignoreReservations) };
        // ignoreCooldown (the API test) still prefers a key that is not cooling down; a cooling
        // key is used only when every key is cooling, so a passing test can bring it back.
        const key = options.ignoreCooldown
            ? this.plugin.selectGoogleTranslateKey(charCount, { ...selectOptions, persist: false })
                || this.plugin.selectGoogleTranslateKey(charCount, { ...selectOptions, ignoreCooldown: true })
            : this.plugin.selectGoogleTranslateKey(charCount, selectOptions);
        if (!key) {
            if (!this.plugin.getGoogleTranslateKeys().length) throw this.plugin.createGoogleTranslateNoKeyError();
            const coolingReadyAt = this.plugin.getGoogleTranslateCoolingKeyReadyAt(charCount, { ignoreReservations: Boolean(options.ignoreReservations) });
            throw coolingReadyAt
                ? this.plugin.createGoogleTranslateCooldownError({ until: coolingReadyAt, charCount })
                : this.plugin.createGoogleTranslateQuotaError({ charCount });
        }
        const reservation = options.reserve ? this.plugin.reserveGoogleTranslateKey(key, charCount) : null;
        const body = {
            q: Array.isArray(input) ? protectedTexts : protectedTexts[0],
            target,
            format: "text"
        };
        if (source) body.source = source;
        return {
            // The key goes in a header so it never shows up in logged or wrapped request URLs.
            endpoint,
            request: {
                provider: "googleCloud",
                providerKey: this.plugin.getGoogleTranslateProviderKey(key),
                responseParser: "googleTranslate",
                headers: {
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": key.apiKey
                },
                body,
                googleTranslate: {
                    apiKey: key.apiKey,
                    keyId: key.id,
                    charCount,
                    expectedCount: texts.length,
                    restoreMaps: protectedPayloads.map(payload => payload.tokens),
                    reservation
                }
            }
        };
    }

    buildMicrosoftTranslateRequest(input, config) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const endpoint = String(config.endpoint || PROVIDER_DEFAULTS.microsoft.endpoint).trim();
        const apiKey = this.plugin.getEffectiveRequestApiKey(config);
        if (!endpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (!apiKey) throw new Error(this.plugin.t("apiKeyMissingTranslation"));
        const target = this.plugin.getMicrosoftLanguageCode(config.targetLanguageCode || config.targetLanguage);
        if (!target || target === AUTO_LANGUAGE_VALUE) throw new Error(this.plugin.t("targetLanguageDesc"));
        const source = this.plugin.getMicrosoftLanguageCode(config.sourceLanguage, { source: true });
        const params = new URLSearchParams({ "api-version": "3.0", to: target });
        if (source) params.set("from", source);
        return {
            endpoint: `${endpoint}${String(endpoint).includes("?") ? "&" : "?"}${params.toString()}`,
            request: {
                provider: "microsoft",
                providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides: config }),
                responseParser: "microsoftTranslate",
                headers: this.plugin.getRequestHeaders(config, apiKey),
                body: texts.map(text => ({ Text: text })),
                translate: {
                    expectedCount: texts.length
                }
            }
        };
    }

    buildDeepLTranslateRequest(input, config) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const plan = this.plugin.normalizeDeepLPlan(config.deeplPlan);
        const endpoint = plan === "pro"
            ? String(PROVIDER_DEFAULTS.deepl.endpoint).replace("api-free.deepl.com", "api.deepl.com")
            : String(PROVIDER_DEFAULTS.deepl.endpoint);
        const apiKey = this.plugin.getEffectiveRequestApiKey(config);
        if (!endpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (!apiKey) throw new Error(this.plugin.t("apiKeyMissingTranslation"));
        const target = this.plugin.getDeepLLanguageCode(config.targetLanguageCode || config.targetLanguage);
        if (!target || target === AUTO_LANGUAGE_VALUE) throw new Error(this.plugin.t("targetLanguageDesc"));
        const source = this.plugin.getDeepLLanguageCode(config.sourceLanguage, { source: true });
        const body = {
            text: texts,
            target_lang: target
        };
        if (source) body.source_lang = source;
        return {
            endpoint,
            request: {
                provider: "deepl",
                providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides: { ...config, deeplPlan: plan, endpoint } }),
                responseParser: "deepLTranslate",
                headers: this.plugin.getRequestHeaders(config, apiKey),
                body,
                translate: {
                    expectedCount: texts.length
                }
            }
        };
    }

    buildBaiduTranslateRequest(input, config) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const endpoint = String(config.endpoint || PROVIDER_DEFAULTS.baidu.endpoint).trim();
        const appId = String(config.appId || "").trim();
        const secretKey = String(config.secretKey || "").trim();
        if (!endpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (!appId || !secretKey) throw new Error(this.plugin.t("apiKeyMissingTranslation"));
        const target = this.plugin.getBaiduLanguageCode(config.targetLanguageCode || config.targetLanguage);
        if (!target || target === AUTO_LANGUAGE_VALUE) throw new Error(this.plugin.t("targetLanguageDesc"));
        const source = this.plugin.getBaiduLanguageCode(config.sourceLanguage, { source: true }) || "auto";
        // Baidu returns one trans_result row per line of q, so multi-line texts must be
        // tracked as line groups and reassembled by the parser; whitespace-only lines are
        // dropped because Baidu does not echo them back as rows.
        const lineGroups = texts.map(text => {
            const lines = String(text || "").split(/\r?\n/).filter(line => line.trim());
            return lines.length ? lines : [String(text || "")];
        });
        const q = lineGroups.flat().join("\n");
        const salt = String(Date.now());
        const sign = this.plugin.createMd5Hash(`${appId}${q}${salt}${secretKey}`);
        const body = {
            q,
            from: source,
            to: target,
            appid: appId,
            salt,
            sign
        };
        return {
            endpoint,
            request: {
                provider: "baidu",
                providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides: config }),
                responseParser: "baiduTranslate",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body,
                bodyEncoding: "form",
                translate: {
                    expectedCount: texts.length,
                    rowCounts: lineGroups.map(group => group.length)
                }
            }
        };
    }

    normalizeDeepLPlan(value) {
        return String(value || "").trim() === "pro" ? "pro" : "free";
    }

    getMicrosoftLanguageCode(language, options = {}) {
        const code = this.plugin.getGoogleLanguageCode(language, options);
        if (options.source && (!code || code === AUTO_LANGUAGE_VALUE)) return "";
        if (code === "zh-CN") return "zh-Hans";
        if (code === "zh-TW") return "zh-Hant";
        return code;
    }

    getDeepLLanguageCode(language, options = {}) {
        const code = this.plugin.getGoogleLanguageCode(language, options);
        if (options.source && (!code || code === AUTO_LANGUAGE_VALUE)) return "";
        const upper = String(code || "").replace("_", "-").toUpperCase();
        if (upper === "ZH-CN" || upper === "ZH-TW" || upper === "ZH-HANS" || upper === "ZH-HANT") {
            // source_lang only knows "ZH"; as a target, "ZH" means Simplified Chinese.
            if (options.source) return "ZH";
            return upper === "ZH-TW" || upper === "ZH-HANT" ? "ZH-HANT" : "ZH-HANS";
        }
        if (upper === "EN") return "EN";
        if (upper === "PT") return "PT";
        return upper;
    }

    getBaiduLanguageCode(language, options = {}) {
        const code = this.plugin.getGoogleLanguageCode(language, options);
        if (options.source && (!code || code === AUTO_LANGUAGE_VALUE)) return "";
        const normalized = String(code || "").trim();
        const map = {
            "zh": "zh",
            "zh-CN": "zh",
            "zh-Hans": "zh",
            "zh-TW": "cht",
            "zh-Hant": "cht",
            "ja": "jp",
            "ko": "kor",
            "fr": "fra",
            "es": "spa",
            "ar": "ara",
            "bg": "bul",
            "et": "est",
            "da": "dan",
            "fi": "fin",
            "ro": "rom",
            "sl": "slo",
            "sv": "swe",
            "vi": "vie"
        };
        return map[normalized] || normalized;
    }

    createMd5Hash(text) {
        const value = String(text || "");
        try {
            if (typeof require === "function") {
                const crypto = (() => {
                    try { return require("node:crypto"); }
                    catch { return require("crypto"); }
                })();
                return crypto.createHash("md5").update(value, "utf8").digest("hex");
            }
        }
        catch {}
        throw new Error("MD5_UNAVAILABLE");
    }

    protectGoogleTranslateText(text) {
        const source = String(text || "");
        const spans = [];
        const addMatches = pattern => {
            const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
            let match = null;
            while ((match = regex.exec(source)) !== null) {
                const value = String(match[0] || "");
                if (!value) continue;
                spans.push({ start: match.index, end: match.index + value.length, value });
                if (match.index === regex.lastIndex) regex.lastIndex++;
            }
        };
        [
            /```[\s\S]*?```/g,
            /`[^`\n]+`/g,
            /https?:\/\/[^\s<>"']+/gi,
            /<a?:[A-Za-z0-9_~.-]+:\d{15,}>/g,
            /<[@#][!&]?\d{15,}>/g,
            /<@&\d{15,}>/g,
            /<t:\d{1,12}(?::[tTdDfFR])?>/g,
            /:[A-Za-z0-9_~.-]{2,}:/g,
            /\b[A-Za-z]:\\[^\s]+/g
        ].forEach(addMatches);

        spans.sort((left, right) => left.start - right.start || right.end - left.end);
        const selected = [];
        let lastEnd = -1;
        spans.forEach(span => {
            if (span.start < lastEnd) return;
            selected.push(span);
            lastEnd = span.end;
        });
        if (!selected.length) return { text: source, tokens: [] };

        let output = "";
        let cursor = 0;
        const tokens = [];
        selected.forEach((span, index) => {
            const placeholder = `__DAIT_KEEP_${String(index).padStart(3, "0")}__`;
            output += source.slice(cursor, span.start);
            output += placeholder;
            cursor = span.end;
            tokens.push({ placeholder, value: span.value });
        });
        output += source.slice(cursor);
        return { text: output, tokens };
    }

    restoreGoogleTranslateText(text, tokens = []) {
        let output = String(text || "");
        if (!Array.isArray(tokens) || !tokens.length) return output;
        tokens.forEach(token => {
            const placeholder = String(token?.placeholder || "");
            if (!placeholder) return;
            output = output.split(placeholder).join(String(token?.value || ""));
        });
        return output;
    }

    applyProviderBodyOptions(config, body) {
        if (config?.provider !== "deepseek") return body;

        if (config.enableThinking) {
            body.thinking = { type: "enabled" };
            delete body.temperature;
        }
        else {
            body.thinking = { type: "disabled" };
        }
        return body;
    }

    buildSystemPrompt(kind, config) {
        return this.plugin.buildPromptPolicySystemPrompt(kind, config);
    }

    isModelFinishReasonTruncated(reason) {
        return /^(?:length|truncated|incomplete|max_tokens|max_output_tokens|token_limit)$/i.test(String(reason || "").trim());
    }

    getModelResponseTruncationReason(value) {
        if (!value || typeof value !== "object") return "";
        const reasons = [
            value.finish_reason,
            value.finishReason,
            value.stop_reason,
            value.stopReason,
            value.status,
            value.incomplete_details?.reason,
            value.incompleteDetails?.reason
        ];
        return String(reasons.find(reason => this.plugin.isModelFinishReasonTruncated(reason)) || "");
    }

    createModelOutputTruncatedError(output = "", finishReason = "") {
        const error = new Error("MODEL_OUTPUT_TRUNCATED");
        error.modelOutputTruncated = true;
        error.autoTranslationInvalidReason = "truncated";
        error.retryAfterMs = AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL;
        error.partialOutputLength = String(output || "").trim().length;
        error.finishReason = String(finishReason || "");
        return error;
    }

    parseModelResponse(raw) {
        const data = this.plugin.parseApiJson(raw);

        let output = "";
        for (const choice of data?.choices || []) {
            output = this.plugin.extractModelContent(choice?.message?.content ?? choice?.text);
            const choiceTruncationReason = this.plugin.getModelResponseTruncationReason(choice);
            if (choiceTruncationReason) {
                throw this.plugin.createModelOutputTruncatedError(output, choiceTruncationReason);
            }
            if (output && String(output).trim()) break;
        }
        if (!output) output = this.plugin.extractModelContent(data?.output_text);
        const responseTruncationReason = this.plugin.getModelResponseTruncationReason(data);
        if (responseTruncationReason) {
            throw this.plugin.createModelOutputTruncatedError(output, responseTruncationReason);
        }
        if (!output || !String(output).trim()) throw new Error(this.plugin.t("emptyResult"));
        return String(output).trim();
    }

    parseGoogleTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseApiJson(raw);
        const translations = data?.data?.translations;
        if (!Array.isArray(translations) || !translations.length) throw new Error(this.plugin.t("emptyResult"));
        const restoreMaps = Array.isArray(options.restoreMaps) ? options.restoreMaps : [];
        const values = translations
            .map((item, index) => this.plugin.restoreGoogleTranslateText(this.plugin.decodeHtmlEntities(String(item?.translatedText || "")), restoreMaps[index]))
            .map(value => value.trim());
        if (values.some(value => !value)) throw new Error(this.plugin.t("emptyResult"));
        const count = Math.max(1, Math.round(Number(expectedCount) || 1));
        if (values.length < count) throw new Error(this.plugin.t("emptyResult"));
        const result = values.slice(0, count);
        if (options.asArray) return result;
        return count === 1 ? result[0] : JSON.stringify(result);
    }

    parseMicrosoftTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseProviderJson(raw, "microsoft");
        if (!Array.isArray(data) || !data.length) throw this.plugin.createProviderParseError("microsoft", this.plugin.t("emptyResult"));
        const values = data
            .map(item => {
                const translations = Array.isArray(item?.translations) ? item.translations : [];
                return String(translations[0]?.text || "").trim();
            });
        return this.plugin.normalizeDirectTranslateParseResult("microsoft", values, expectedCount, options);
    }

    parseDeepLTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseProviderJson(raw, "deepl");
        const translations = data?.translations;
        if (!Array.isArray(translations) || !translations.length) throw this.plugin.createProviderParseError("deepl", this.plugin.t("emptyResult"));
        const values = translations.map(item => String(item?.text || "").trim());
        return this.plugin.normalizeDirectTranslateParseResult("deepl", values, expectedCount, options);
    }

    parseBaiduTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseProviderJson(raw, "baidu");
        // 52000 is Baidu's "success" code.
        if (data?.error_code && String(data.error_code) !== "52000") {
            throw this.plugin.createBaiduTranslateError(data);
        }
        const results = data?.trans_result;
        if (!Array.isArray(results) || !results.length) throw this.plugin.createProviderParseError("baidu", this.plugin.t("emptyResult"));
        const rows = results.map(item => String(item?.dst || "").trim());
        const values = this.plugin.regroupBaiduTranslateRows(rows, expectedCount, options.rowCounts);
        return this.plugin.normalizeDirectTranslateParseResult("baidu", values, expectedCount, options);
    }

    regroupBaiduTranslateRows(rows, expectedCount = 1, rowCounts = null) {
        const count = Math.max(1, Math.round(Number(expectedCount) || 1));
        const counts = Array.isArray(rowCounts) ? rowCounts.map(value => Math.max(1, Math.round(Number(value) || 1))) : null;
        // Baidu answers with one row per input line; rejoin rows into per-text groups so
        // multi-line messages keep every line and batches stay aligned.
        if (counts && counts.length === count && counts.reduce((sum, value) => sum + value, 0) === rows.length) {
            const values = [];
            let cursor = 0;
            for (const groupSize of counts) {
                values.push(rows.slice(cursor, cursor + groupSize).join("\n"));
                cursor += groupSize;
            }
            return values;
        }
        if (rows.length === count) return rows;
        // A single text whose lines Baidu split apart is unambiguous even without counts.
        if (count === 1) return [rows.join("\n")];
        // Ambiguous row/text alignment: refuse rather than attach wrong translations.
        throw this.plugin.createProviderParseError("baidu", this.plugin.t("emptyResult"));
    }

    normalizeDirectTranslateParseResult(provider, values, expectedCount = 1, options = {}) {
        const count = Math.max(1, Math.round(Number(expectedCount) || 1));
        const result = (Array.isArray(values) ? values : [])
            .map(value => String(value || "").trim())
            .slice(0, count);
        if (result.length < count || result.some(value => !value)) {
            throw this.plugin.createProviderParseError(provider, this.plugin.t("emptyResult"));
        }
        if (options.asArray) return result;
        return count === 1 ? result[0] : JSON.stringify(result);
    }

    createProviderParseError(provider, message = this.plugin.t("invalidJson")) {
        const error = new Error(message);
        error.providerParseFailed = true;
        error.provider = String(provider || "");
        return error;
    }

    parseProviderJson(raw, provider) {
        try {
            return this.plugin.parseApiJson(raw);
        }
        catch {
            throw this.plugin.createProviderParseError(provider, this.plugin.t("invalidJson"));
        }
    }

    createBaiduTranslateError(data = {}) {
        const code = String(data?.error_code || "");
        const message = String(data?.error_msg || code || "BAIDU_TRANSLATE_ERROR");
        const error = new Error(message);
        error.baiduApiError = true;
        error.baiduErrorCode = code;
        // Baidu answers HTTP 200 with an error_code, so every code needs a type here;
        // otherwise it would look like a bad translation and be retried forever, silently.
        if (["52003", "54001", "58002", "90107"].includes(code)) error.providerAuthFailed = true;
        else if (code === "58000") {
            error.providerAuthFailed = true;
            error.providerIpRejected = true;
        }
        else if (["54000", "58001"].includes(code)) {
            // Missing parameter or unsupported language pair: every message fails the same
            // way until the settings change, so pause the provider and tell the user.
            error.providerAuthFailed = true;
            error.providerRequestRejected = true;
            if (code === "58001") error.providerLanguageUnsupported = true;
        }
        else if (code === "54003") error.providerRateLimited = true;
        else if (code === "54005") {
            // Too many long requests; Baidu asks to wait 3 s.
            error.providerRateLimited = true;
            error.retryAfterMs = 3000;
        }
        else if (code === "54004") error.providerQuotaExceeded = true;
        else if (code === "20003") {
            // Baidu refuses this text; retrying the same message cannot help.
            error.providerRequestRejected = true;
            error.autoTranslationTerminalFailure = true;
        }
        else if (["52001", "52002"].includes(code)) error.providerServerError = true;
        else {
            // Unknown code: pause the provider like a server error and show the code.
            error.providerServerError = true;
            error.providerRequestRejected = true;
        }
        return error;
    }

    decodeHtmlEntities(text) {
        const value = String(text || "");
        if (typeof document !== "undefined") {
            const textarea = document.createElement?.("textarea");
            if (textarea) {
                textarea.innerHTML = value;
                return textarea.value;
            }
        }
        return value
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'");
    }

    extractModelContent(content) {
        if (Array.isArray(content)) {
            return content.map(part => {
                if (typeof part === "string") return part;
                return part?.text ?? part?.content ?? "";
            }).join("");
        }
        return content ?? "";
    }

    parseApiJson(raw) {
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new Error(this.plugin.t("invalidJson"));
        }
    }
}

module.exports = { ProviderLayer };
