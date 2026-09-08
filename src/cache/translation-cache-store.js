"use strict";

// Phase 4 of the modularization plan: translation cache keys, aliases, TTL, compact codec, negative lookups and persistence.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    CACHE_DATA_KEY,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_REASON_CODES,
    HEAVY_PERSISTENCE_DEFER_MS,
    PROVIDER_DEFAULTS,
    TRANSLATION_CACHE_DEFAULT_LIMIT,
    TRANSLATION_CACHE_DEFAULT_TTL_HOURS,
    TRANSLATION_CACHE_HIT_EXTEND_MS,
    TRANSLATION_CACHE_MAX_LIMIT,
    TRANSLATION_CACHE_MIN_LIMIT,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_MAX,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_TTL_MS,
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD,
    TRANSLATION_CACHE_TTL_OPTIONS,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS
} = require("../constants");

class TranslationCacheStore {
    constructor(plugin) {
        this.plugin = plugin;
    }

    normalizeTranslationCacheTtlHours(value) {
        const number = Number(value);
        if (TRANSLATION_CACHE_TTL_OPTIONS.includes(number)) return number;
        return TRANSLATION_CACHE_DEFAULT_TTL_HOURS;
    }

    normalizeTranslationCacheMaxEntries(value) {
        const number = Number(value);
        const normalized = Number.isFinite(number) ? Math.round(number) : TRANSLATION_CACHE_DEFAULT_LIMIT;
        return Math.min(TRANSLATION_CACHE_MAX_LIMIT, Math.max(TRANSLATION_CACHE_MIN_LIMIT, normalized));
    }

    isInvalidAutoTranslationCacheValue(text, translated, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const targetLanguage = this.plugin.getAutoTranslationTargetLanguage(requestOptions);
        const validation = this.plugin.getAutoTranslationOutputValidationResult(
            text,
            translated,
            targetLanguage,
            this.plugin.getAutoTranslationOutputValidationOptions(text, translated, requestOptions),
            requestOptions
        );
        return !validation.cacheable;
    }

    shouldStoreAutoTextTranslationCache(text, requestOptions, translated) {
        const validationOptions = this.plugin.getAutoTranslationOutputValidationOptions(text, translated, requestOptions);
        return !validationOptions.partialLongText;
    }

    getTranslationCacheMode(cacheKey) {
        return String(cacheKey || "").split("\n---\n")[0] || "manual";
    }

    isAutoTranslationCacheMode(mode) {
        return this.plugin.translationScheduler.isAutoCacheMode(mode);
    }

    isVolatileTranslationCacheKey(cacheKey) {
        return this.plugin.isVolatileTranslationIdentity(this.plugin.getTranslationIdentityFromCacheKey(cacheKey));
    }

    getTranslationCacheKey(text, options = {}) {
        return this.plugin.buildTranslationCacheKey(text, options, this.plugin.getStrongTextFingerprint(text));
    }

    getLegacyTranslationCacheKey(text, options = {}) {
        return this.plugin.buildTranslationCacheKey(text, options, this.plugin.getTextFingerprint(text));
    }

    getTranslationCacheAliases(text, options = {}, aliasOptions = {}) {
        const primaryKey = this.plugin.getTranslationCacheKey(text, options);
        const strongTextHash = this.plugin.getStrongTextFingerprint(text);
        const legacyTextHash = this.plugin.getTextFingerprint(text);
        const legacyKey = this.plugin.getLegacyTranslationCacheKey(text, options);
        const fullConfigKey = this.plugin.getFullConfigTranslationCacheKey(text, options, strongTextHash);
        const fullConfigLegacyKey = this.plugin.getFullConfigTranslationCacheKey(text, options, legacyTextHash);
        const aliases = [
            legacyKey,
            fullConfigKey,
            fullConfigLegacyKey
        ];
        if (aliasOptions.includePreMessageIdentity !== false) {
            aliases.push(
                this.plugin.getPreMessageIdentityTranslationCacheKey(text, options, strongTextHash),
                this.plugin.getPreMessageIdentityTranslationCacheKey(text, options, legacyTextHash),
                this.plugin.getPreMessageIdentityTranslationCacheKey(text, options, strongTextHash, { fullConfig: true }),
                this.plugin.getPreMessageIdentityTranslationCacheKey(text, options, legacyTextHash, { fullConfig: true })
            );
        }
        return [...new Set(aliases.filter(key => key && key !== primaryKey))];
    }

    getAutoTextTranslationCacheOptions(options = {}) {
        return {
            ...options,
            mode: "auto-text",
            messageIdentity: ""
        };
    }

    getAutoTextTranslationCacheKey(text, options = {}) {
        return this.plugin.getTranslationCacheKey(text, this.plugin.getAutoTextTranslationCacheOptions(options));
    }

    getAutoTextTranslationCacheAliases(text, options = {}) {
        return this.plugin.getTranslationCacheAliases(text, this.plugin.getAutoTextTranslationCacheOptions(options));
    }

    getAutoTextTranslationCacheValue(text, options = {}) {
        const key = this.plugin.getAutoTextTranslationCacheKey(text, options);
        return this.plugin.getTranslationCacheValue(key, this.plugin.getAutoTextTranslationCacheAliases(text, options));
    }

    getAutoTextTranslationCacheValueCached(text, options = {}, context = null) {
        const key = this.plugin.getAutoTextTranslationCacheKey(text, options);
        return this.plugin.getTranslationCacheValueCached(key, this.plugin.getAutoTextTranslationCacheAliases(text, options), context);
    }

    setAutoTextTranslationCache(text, options = {}, value = "") {
        const key = this.plugin.getAutoTextTranslationCacheKey(text, options);
        this.plugin.setTranslationCache(key, value);
    }

    getFullConfigTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text)) {
        return this.plugin.buildTranslationCacheKey(text, options, sourceTextHash, { fullConfig: true });
    }

    getPreMessageIdentityTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text), cacheOptions = {}) {
        return this.plugin.buildTranslationCacheKey(text, options, sourceTextHash, { ...cacheOptions, omitMessageIdentity: true });
    }

    buildTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text), cacheOptions = {}) {
        const config = this.plugin.getCacheConfigSnapshot("translation", this.plugin.getEffectiveTaskConfig("translation", options.configOverrides));
        config.promptPolicyVersion = this.plugin.getPromptPolicyCacheVersion("translation", options, config);
        const messageIdentity = this.plugin.normalizeTranslationMessageIdentity(options.messageIdentity) || `text:${sourceTextHash}`;
        const configParts = cacheOptions.fullConfig
            ? [
                config.provider,
                config.endpoint,
                config.model,
                config.sourceLanguage,
                config.targetLanguage,
                config.region || "",
                config.deeplPlan || "",
                config.appIdHash || "",
                config.temperature,
                config.maxTokens,
                config.enableThinking ? "thinking:on" : "thinking:off",
                config.promptPolicyVersion,
                config.prompt
            ]
            : this.plugin.getCompactTranslationCacheConfigParts(config);
        const parts = [options.mode || "manual"];
        if (!cacheOptions.omitMessageIdentity) parts.push(messageIdentity);
        return [
            ...parts,
            ...configParts,
            sourceTextHash
        ].join("\n---\n");
    }

    getCompactTranslationCacheConfigParts(config) {
        return [
            `provider:${this.plugin.getStrongTextFingerprint(config.provider)}`,
            `endpoint:${this.plugin.getStrongTextFingerprint(config.endpoint)}`,
            `model:${this.plugin.getStrongTextFingerprint(config.model)}`,
            config.sourceLanguage,
            config.targetLanguage,
            `region:${this.plugin.getStrongTextFingerprint(config.region || "")}`,
            `deeplPlan:${config.deeplPlan || ""}`,
            `appId:${config.appIdHash || ""}`,
            config.temperature,
            config.maxTokens,
            config.enableThinking ? "thinking:on" : "thinking:off",
            `promptPolicy:${this.plugin.getStrongTextFingerprint(config.promptPolicyVersion)}`,
            `prompt:${this.plugin.getStrongTextFingerprint(config.prompt)}`
        ];
    }

    getCacheConfigSnapshot(kind, config) {
        const defaults = DEFAULT_SETTINGS[kind] || {};
        const provider = String(config.provider || defaults.provider || "").trim();
        const snapshot = {
            provider,
            endpoint: String(config.endpoint || defaults.endpoint || "").trim(),
            model: String(config.model || defaults.model || "").trim(),
            sourceLanguage: String(config.sourceLanguage || defaults.sourceLanguage || "").trim(),
            targetLanguage: String(config.targetLanguage || defaults.targetLanguage || "").trim(),
            temperature: this.plugin.normalizeRequestNumber(config.temperature, defaults.temperature ?? 0.2, { min: 0, max: 2 }),
            maxTokens: this.plugin.normalizeRequestNumber(config.maxTokens, defaults.maxTokens ?? 800, { min: 1, integer: true }),
            enableThinking: Boolean(config.enableThinking),
            region: String(config.region || "").trim(),
            deeplPlan: this.plugin.normalizeDeepLPlan(config.deeplPlan),
            appIdHash: this.plugin.getTextFingerprint(String(config.appId || "").trim()),
            promptPolicyVersion: String(config.promptPolicyVersion || "").trim(),
            prompt: String(config.prompt || "").trim()
        };
        if (provider === "googleCloud") {
            snapshot.endpoint = PROVIDER_DEFAULTS.googleCloud.endpoint;
            snapshot.model = PROVIDER_DEFAULTS.googleCloud.model;
            snapshot.temperature = 0;
            snapshot.maxTokens = 0;
            snapshot.enableThinking = false;
            snapshot.promptPolicyVersion = this.plugin.getPromptPolicyVersion("googleCloud");
            snapshot.prompt = "";
        }
        else if (this.plugin.isDirectTranslateProvider(provider)) {
            snapshot.model = PROVIDER_DEFAULTS[provider]?.model || "";
            snapshot.temperature = 0;
            snapshot.maxTokens = 0;
            snapshot.enableThinking = false;
            snapshot.promptPolicyVersion = `${provider}-v1`;
            snapshot.prompt = "";
            if (provider === "deepl") {
                snapshot.endpoint = this.plugin.normalizeDeepLPlan(config.deeplPlan) === "pro"
                    ? PROVIDER_DEFAULTS.deepl.endpoint.replace("api-free.deepl.com", "api.deepl.com")
                    : PROVIDER_DEFAULTS.deepl.endpoint;
            }
        }
        return snapshot;
    }

    getTranslationCacheValueCached(key, aliases = [], context = null) {
        if (!context?.translationCacheLookupByKey) return this.plugin.getTranslationCacheValue(key, aliases);
        const lookupKey = [key, ...aliases].filter(Boolean).join("\n@@\n");
        if (context.translationCacheLookupByKey.has(lookupKey)) {
            return context.translationCacheLookupByKey.get(lookupKey);
        }
        if (this.plugin.isTranslationCacheNegativeLookupFresh(lookupKey)) {
            context.translationCacheLookupByKey.set(lookupKey, null);
            return null;
        }
        const value = this.plugin.getTranslationCacheValue(key, aliases);
        context.translationCacheLookupByKey.set(lookupKey, value);
        if (value === null) this.plugin.rememberTranslationCacheNegativeLookup(lookupKey);
        return value;
    }

    hasTranslationCacheCandidate(key, aliases = []) {
        return [key, ...aliases].filter(Boolean).some(cacheKey => this.plugin.translationCache.has(cacheKey));
    }

    clearScanTranslationCacheLookup(context = null) {
        context?.translationCacheLookupByKey?.clear?.();
    }

    isTranslationCacheNegativeLookupFresh(lookupKey, now = Date.now()) {
        if (!lookupKey || !this.plugin.translationCacheNegativeLookup?.size) return false;
        const expiresAt = Number(this.plugin.translationCacheNegativeLookup.get(lookupKey) || 0);
        if (!expiresAt) return false;
        if (expiresAt > now) return true;
        this.plugin.translationCacheNegativeLookup.delete(lookupKey);
        return false;
    }

    rememberTranslationCacheNegativeLookup(lookupKey, now = Date.now()) {
        if (!lookupKey) return;
        this.plugin.translationCacheNegativeLookup.set(lookupKey, now + TRANSLATION_CACHE_NEGATIVE_LOOKUP_TTL_MS);
        this.plugin.pruneTranslationCacheNegativeLookups(now);
    }

    clearTranslationCacheNegativeLookups() {
        this.plugin.translationCacheNegativeLookup?.clear?.();
    }

    pruneTranslationCacheNegativeLookups(now = Date.now()) {
        if (!this.plugin.translationCacheNegativeLookup?.size) return;
        for (const [lookupKey, expiresAt] of this.plugin.translationCacheNegativeLookup) {
            if (Number(expiresAt || 0) <= now) this.plugin.translationCacheNegativeLookup.delete(lookupKey);
        }
        while (this.plugin.translationCacheNegativeLookup.size > TRANSLATION_CACHE_NEGATIVE_LOOKUP_MAX) {
            const oldestKey = this.plugin.translationCacheNegativeLookup.keys().next().value;
            if (!oldestKey) break;
            this.plugin.translationCacheNegativeLookup.delete(oldestKey);
        }
    }

    getTranslationCacheValue(key, aliases = []) {
        const keys = [key, ...aliases].filter(Boolean);
        for (const hitKey of keys) {
            if (!this.plugin.translationCache.has(hitKey)) continue;

            const meta = this.plugin.translationCacheMeta.get(hitKey) || {};
            if (this.plugin.isTranslationCacheEntryExpired(meta)) {
                this.plugin.translationCache.delete(hitKey);
                this.plugin.translationCacheMeta.delete(hitKey);
                this.plugin.scheduleTranslationCachePersist();
                this.plugin.logDiagnostic("cache.lookup", "expired", {
                    ...this.plugin.getDiagnosticBaseMeta("cache", this.plugin.getTranslationCacheMode(hitKey), "cache-expired"),
                    cacheHash: this.plugin.getTextFingerprint(hitKey)
                });
                continue;
            }

            this.plugin.translationCacheStats.hits++;
            this.plugin.touchTranslationCache(hitKey, { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
            const value = this.plugin.translationCache.get(hitKey);
            this.plugin.logDiagnostic("cache.lookup", "hit", {
                ...this.plugin.getDiagnosticBaseMeta("cache", this.plugin.getTranslationCacheMode(hitKey), DIAGNOSTIC_REASON_CODES.CACHE_HIT),
                cacheHash: this.plugin.getTextFingerprint(hitKey),
                alias: Boolean(key && hitKey !== key),
                size: this.plugin.translationCache.size
            });
            if (key && hitKey !== key) this.plugin.promoteTranslationCacheAlias(hitKey, key);
            return value;
        }

        this.plugin.translationCacheStats.misses++;
        this.plugin.logDiagnostic("cache.lookup", "miss", {
            ...this.plugin.getDiagnosticBaseMeta("cache", this.plugin.getTranslationCacheMode(key), "cache-miss"),
            cacheHash: this.plugin.getTextFingerprint(key),
            aliases: aliases.length,
            size: this.plugin.translationCache.size
        });
        return null;
    }

    promoteTranslationCacheAlias(sourceKey, targetKey) {
        if (!sourceKey || !targetKey || sourceKey === targetKey || !this.plugin.translationCache.has(sourceKey)) return;
        const now = Date.now();
        const sourceMeta = this.plugin.translationCacheMeta.get(sourceKey) || {};
        const value = this.plugin.translationCache.get(sourceKey);
        if (this.plugin.translationCache.has(targetKey)) this.plugin.translationCache.delete(targetKey);
        this.plugin.translationCache.set(targetKey, value);
        this.plugin.translationCacheMeta.set(targetKey, {
            createdAt: Number(sourceMeta.createdAt || now),
            touchedAt: now,
            expiresAt: this.plugin.getTranslationCacheEntryExpiresAt(sourceMeta, now),
            volatile: Boolean(sourceMeta.volatile || this.plugin.isVolatileTranslationCacheKey(targetKey))
        });
        this.plugin.pruneTranslationCache({ scanExpired: false });
        this.plugin.clearTranslationCacheNegativeLookups();
        this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
    }

    setTranslationCache(key, value) {
        if (!key) return;
        const now = Date.now();
        const previous = this.plugin.translationCacheMeta.get(key);
        if (this.plugin.translationCache.has(key)) this.plugin.translationCache.delete(key);
        this.plugin.translationCache.set(key, String(value || ""));
        this.plugin.translationCacheMeta.set(key, {
            createdAt: Number(previous?.createdAt || now),
            touchedAt: now,
            expiresAt: now + this.plugin.getTranslationCacheTtlMs(),
            volatile: this.plugin.isVolatileTranslationCacheKey(key)
        });
        this.plugin.clearTranslationCacheNegativeLookups();
        this.plugin.logDiagnostic("cache.set", "ok", {
            ...this.plugin.getDiagnosticBaseMeta("cache", this.plugin.getTranslationCacheMode(key), "cache-set"),
            cacheHash: this.plugin.getTextFingerprint(key),
            valueLength: String(value || "").length,
            size: this.plugin.translationCache.size,
            volatile: this.plugin.isVolatileTranslationCacheKey(key)
        });
        this.plugin.pruneTranslationCache({ scanExpired: false });
        this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
    }

    deleteTranslationCacheCandidates(...keys) {
        const uniqueKeys = [...new Set(keys.filter(Boolean))];
        let removed = 0;
        uniqueKeys.forEach(key => {
            if (this.plugin.translationCache.delete(key)) removed++;
            if (this.plugin.translationCacheMeta.delete(key) && !this.plugin.translationCache.has(key)) removed++;
        });
        if (!removed) return false;
        this.plugin.clearTranslationCacheNegativeLookups();
        this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
        this.plugin.logDiagnostic("cache.delete", "ok", {
            ...this.plugin.getDiagnosticBaseMeta("cache", "mixed", "cache-delete"),
            count: uniqueKeys.length
        });
        return true;
    }

    touchTranslationCache(key, options = {}) {
        if (!this.plugin.translationCache.has(key)) return;
        const value = this.plugin.translationCache.get(key);
        this.plugin.translationCache.delete(key);
        this.plugin.translationCache.set(key, value);
        const meta = this.plugin.translationCacheMeta.get(key) || {};
        const now = Date.now();
        const currentExpiresAt = this.plugin.getTranslationCacheEntryExpiresAt(meta, now);
        const nextExpiresAt = options.extendExpiry
            ? Math.max(currentExpiresAt, now + TRANSLATION_CACHE_HIT_EXTEND_MS)
            : currentExpiresAt;
        this.plugin.translationCacheMeta.set(key, {
            createdAt: Number(meta.createdAt || now),
            touchedAt: now,
            expiresAt: nextExpiresAt,
            volatile: Boolean(meta.volatile || this.plugin.isVolatileTranslationCacheKey(key))
        });
        if (options.extendExpiry || options.persistDelayMs) {
            this.plugin.translationCacheTouchDirtyCount = Math.max(0, Number(this.plugin.translationCacheTouchDirtyCount || 0)) + 1;
            const thresholdReached = this.plugin.translationCacheTouchDirtyCount >= TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD;
            this.plugin.scheduleTranslationCachePersist(thresholdReached
                ? TRANSLATION_CACHE_WRITE_DEBOUNCE_MS
                : (options.persistDelayMs || TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS));
            if (thresholdReached) this.plugin.translationCacheTouchDirtyCount = 0;
        }
    }

    loadTranslationCache() {
        this.plugin.translationCache.clear();
        this.plugin.translationCacheMeta.clear();
        this.plugin.clearTranslationCacheNegativeLookups();
        const payload = this.plugin.loadData(CACHE_DATA_KEY);
        const entries = Array.isArray(payload) ? payload : payload?.entries;
        if (!Array.isArray(entries)) {
            this.plugin.persistentTranslationCacheCount = 0;
            return;
        }

        const now = Date.now();
        const storedTtlMs = this.plugin.normalizeTranslationCacheTtlHours(payload?.ttlHours) * 60 * 60 * 1000;
        const persistedStrings = Array.isArray(payload?.strings) ? payload.strings.map(value => String(value || "")) : [];
        let restoredEntries = 0;
        for (const entry of entries) {
            const key = this.plugin.decodePersistedTranslationCacheKey(entry, persistedStrings);
            const value = this.plugin.decodePersistedTranslationCacheValue(entry, persistedStrings);
            if (!key || !value) continue;
            const createdAt = Number(entry?.createdAt ?? entry?.c ?? now);
            const meta = {
                createdAt,
                touchedAt: Number(entry?.touchedAt ?? entry?.lastUsedAt ?? entry?.t ?? now),
                expiresAt: Number(entry?.expiresAt ?? entry?.e ?? (createdAt + storedTtlMs)),
                volatile: Boolean(entry?.volatile)
            };
            if (this.plugin.isTranslationCacheEntryExpired(meta, now)) continue;
            this.plugin.translationCache.set(key, value);
            this.plugin.translationCacheMeta.set(key, meta);
            restoredEntries++;
        }
        this.plugin.pruneTranslationCache({ scanExpired: true });
        this.plugin.persistentTranslationCacheCount = this.plugin.translationCache.size;
        if (this.plugin.translationCache.size !== entries.length || restoredEntries !== entries.length || payload?.version !== 3) this.plugin.scheduleTranslationCachePersist();
    }

    decodePersistedTranslationCacheKey(entry, strings = []) {
        const direct = String(entry?.key || "");
        if (direct) return direct;
        const keyParts = Array.isArray(entry?.keyParts) ? entry.keyParts : Array.isArray(entry?.k) ? entry.k : null;
        if (!keyParts) return "";

        const parts = [];
        for (const index of keyParts) {
            const number = Number(index);
            if (!Number.isInteger(number) || number < 0 || number >= strings.length) return "";
            parts.push(strings[number]);
        }
        return parts.join("\n---\n");
    }

    decodePersistedTranslationCacheValue(entry, strings = []) {
        if (entry && Object.prototype.hasOwnProperty.call(entry, "value")) return String(entry.value ?? "");
        const compact = entry?.v;
        if (Number.isInteger(compact)) return String(strings[compact] || "");
        return String(compact ?? "");
    }

    createPersistedTranslationCachePayload() {
        const strings = [];
        const stringIndexes = new Map();
        const encodeString = value => {
            const text = String(value || "");
            if (stringIndexes.has(text)) return stringIndexes.get(text);
            const index = strings.length;
            strings.push(text);
            stringIndexes.set(text, index);
            return index;
        };
        const encodeKey = key => String(key || "").split("\n---\n").map(encodeString);
        const encodeValue = value => encodeString(value);

        const entries = [...this.plugin.translationCache.entries()].filter(([key]) => {
            const meta = this.plugin.translationCacheMeta.get(key) || {};
            return !meta.volatile && !this.plugin.isVolatileTranslationCacheKey(key);
        }).map(([key, value]) => {
            const meta = this.plugin.translationCacheMeta.get(key) || {};
            return {
                k: encodeKey(key),
                v: encodeValue(value),
                c: Number(meta.createdAt || Date.now()),
                t: Number(meta.touchedAt || Date.now()),
                e: this.plugin.getTranslationCacheEntryExpiresAt(meta)
            };
        });
        return {
            version: 3,
            savedAt: Date.now(),
            ttlHours: this.plugin.normalizeTranslationCacheTtlHours(this.plugin.settings.ui?.translationCacheTtlHours),
            maxEntries: this.plugin.getTranslationCacheMaxEntries(),
            strings,
            entries
        };
    }

    scheduleTranslationCachePersist(delayMs = TRANSLATION_CACHE_WRITE_DEBOUNCE_MS) {
        const delay = Math.max(0, Number(delayMs) || 0);
        const persistAt = Date.now() + delay;
        this.plugin.translationCacheDirty = true;
        if (this.plugin.translationCacheDirtyTimer && this.plugin.translationCacheDirtyAt && this.plugin.translationCacheDirtyAt <= persistAt) return;
        if (this.plugin.translationCacheDirtyTimer) clearTimeout(this.plugin.translationCacheDirtyTimer);
        this.plugin.translationCacheDirtyAt = persistAt;
        this.plugin.translationCacheDirtyTimer = setTimeout(() => {
            this.plugin.translationCacheDirtyTimer = null;
            this.plugin.translationCacheDirtyAt = 0;
            this.plugin.scheduleHeavyPersistenceIdle("cache", () => this.plugin.flushTranslationCache({ scheduled: true }));
        }, delay);
        this.plugin.unrefTimer(this.plugin.translationCacheDirtyTimer);
    }

    flushTranslationCache(options = {}) {
        if (!this.plugin.translationCacheDirty) return true;
        if (!options.scheduled) this.plugin.cancelHeavyPersistenceIdle("cache");
        if (options.scheduled && this.plugin.shouldDeferHeavyPersistence("cache")) {
            this.plugin.scheduleTranslationCachePersist(HEAVY_PERSISTENCE_DEFER_MS);
            return true;
        }
        if (this.plugin.translationCacheDirtyTimer) {
            clearTimeout(this.plugin.translationCacheDirtyTimer);
            this.plugin.translationCacheDirtyTimer = null;
        }
        this.plugin.translationCacheDirtyAt = 0;
        this.plugin.pruneTranslationCache({ scanExpired: true });
        try {
            const payload = this.plugin.createPersistedTranslationCachePayload();
            if (this.plugin.saveData(CACHE_DATA_KEY, payload) !== true) throw new Error("DATA_SAVE_FAILED");
            this.plugin.persistentTranslationCacheCount = payload.entries.length;
            this.plugin.translationCacheDirty = false;
            this.plugin.translationCacheTouchDirtyCount = 0;
            this.plugin.translationCachePersistenceDeferredSince = 0;
            this.plugin.logDiagnostic("cache.persist", "success", {
                ...this.plugin.getDiagnosticBaseMeta("cache", "persist", "cache-persist"),
                entries: payload.entries.length,
                memory: this.plugin.translationCache.size
            });
            return true;
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to persist translation cache", error);
            this.plugin.logDiagnostic("cache.persist", "error", {
                ...this.plugin.getDiagnosticBaseMeta("cache", "persist", "cache-persist-error", { failureType: this.plugin.getAutoTranslationFailureType(error) }),
                type: this.plugin.getAutoTranslationFailureType(error),
                message: this.plugin.formatError(error)
            });
            this.plugin.translationCacheDirty = true;
            if (options.retryOnError !== false) this.plugin.scheduleTranslationCachePersist(30000);
            return false;
        }
    }

    clearTranslationCache() {
        const previousCache = new Map(this.plugin.translationCache);
        const previousMeta = new Map(this.plugin.translationCacheMeta);
        const previousStats = { ...this.plugin.translationCacheStats };
        const previousPersistentCount = this.plugin.persistentTranslationCacheCount;
        const previousDirty = this.plugin.translationCacheDirty;
        const previousDirtyAt = this.plugin.translationCacheDirtyAt;
        if (this.plugin.translationCacheDirtyTimer) {
            clearTimeout(this.plugin.translationCacheDirtyTimer);
            this.plugin.translationCacheDirtyTimer = null;
        }
        this.plugin.translationCacheDirtyAt = 0;
        this.plugin.translationCacheDirty = false;
        this.plugin.translationCache.clear();
        this.plugin.translationCacheMeta.clear();
        this.plugin.clearTranslationCacheNegativeLookups();
        this.plugin.translationCacheStats = { hits: 0, misses: 0 };
        this.plugin.persistentTranslationCacheCount = 0;
        try {
            if (this.plugin.saveData(CACHE_DATA_KEY, this.plugin.createPersistedTranslationCachePayload()) !== true) throw new Error("DATA_SAVE_FAILED");
            this.plugin.showToast(this.plugin.t("translationCacheCleared"), "success");
            return true;
        }
        catch (error) {
            this.plugin.translationCache = previousCache;
            this.plugin.translationCacheMeta = previousMeta;
            this.plugin.translationCacheStats = previousStats;
            this.plugin.persistentTranslationCacheCount = previousPersistentCount;
            this.plugin.translationCacheDirty = previousDirty;
            this.plugin.translationCacheDirtyAt = previousDirtyAt;
            if (previousDirty) {
                const remainingMs = previousDirtyAt ? Math.max(0, previousDirtyAt - Date.now()) : TRANSLATION_CACHE_WRITE_DEBOUNCE_MS;
                this.plugin.scheduleTranslationCachePersist(remainingMs);
            }
            this.plugin.showToast(this.plugin.formatError(error), "error");
            return false;
        }
    }

    clearTranslationCacheStats() {
        this.plugin.translationCacheStats = { hits: 0, misses: 0 };
        this.plugin.showToast(this.plugin.t("translationCacheStatsCleared"), "success");
    }

    clampTranslationCacheExpiryToCurrentTtl(now = Date.now()) {
        const ttlMs = this.plugin.getTranslationCacheTtlMs();
        let changed = false;
        for (const [key, meta] of this.plugin.translationCacheMeta) {
            const baseAt = Number(meta?.touchedAt || meta?.createdAt || now);
            const maxExpiresAt = baseAt + ttlMs;
            const currentExpiresAt = this.plugin.getTranslationCacheEntryExpiresAt(meta, now);
            if (!currentExpiresAt || currentExpiresAt <= maxExpiresAt) continue;
            this.plugin.translationCacheMeta.set(key, {
                ...meta,
                expiresAt: maxExpiresAt
            });
            changed = true;
        }
        if (changed) this.plugin.clearTranslationCacheNegativeLookups();
        return changed;
    }

    pruneTranslationCache(options = {}) {
        const now = Date.now();
        const scanExpired = options.scanExpired !== false;
        let removed = false;
        if (scanExpired) {
            for (const [key, meta] of this.plugin.translationCacheMeta) {
                if (this.plugin.isTranslationCacheEntryExpired(meta, now)) {
                    this.plugin.translationCache.delete(key);
                    this.plugin.translationCacheMeta.delete(key);
                    removed = true;
                }
            }
        }

        while (this.plugin.translationCache.size > this.plugin.getTranslationCacheMaxEntries()) {
            const oldestKey = this.plugin.translationCache.keys().next().value;
            this.plugin.translationCache.delete(oldestKey);
            this.plugin.translationCacheMeta.delete(oldestKey);
            removed = true;
        }
        if (removed) this.plugin.clearTranslationCacheNegativeLookups();
    }

    isTranslationCacheEntryExpired(meta, now = Date.now()) {
        const expiresAt = this.plugin.getTranslationCacheEntryExpiresAt(meta, now);
        if (!expiresAt) return false;
        return now > expiresAt;
    }

    getTranslationCacheEntryExpiresAt(meta, now = Date.now()) {
        const explicit = Number(meta?.expiresAt || 0);
        if (explicit > 0) return explicit;
        const createdAt = Number(meta?.createdAt || 0);
        if (!createdAt) return now + this.plugin.getTranslationCacheTtlMs();
        return createdAt + this.plugin.getTranslationCacheTtlMs();
    }

    getTranslationCacheTtlMs() {
        return this.plugin.normalizeTranslationCacheTtlHours(this.plugin.settings.ui?.translationCacheTtlHours) * 60 * 60 * 1000;
    }

    getTranslationCacheMaxEntries() {
        return this.plugin.normalizeTranslationCacheMaxEntries(this.plugin.settings.ui?.translationCacheMaxEntries);
    }
}

module.exports = { TranslationCacheStore };
