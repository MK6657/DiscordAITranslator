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
const { removeStandardEmoji } = require("../intake/emoji-text");

// The size limit counts messages (distinct cached translations): one message is stored under 2-3 keys (identity,
// auto-text, manual, promoted aliases) that share its text. Keys are still capped at this multiple of the limit,
// so many messages with the same short translation cannot grow the key count without bound.
const TRANSLATION_CACHE_MAX_KEYS_PER_MESSAGE = 4;

// The key format a saved cache was written with. Caches saved before 0.4.0 have neither this nor a model list.
// Their keys name a local server's "local-model" placeholder instead of the model it serves, and were built from
// message text without standard emoji (only ":name:" emoji were read then). Such entries stay reachable through
// compatibility aliases and move to their current key on their first hit.
const TRANSLATION_CACHE_KEY_SCHEMA = 2;
// Message texts with standard emoji, and the same text read the way versions before 0.4.0 read it.
const TRANSLATION_CACHE_PRE_EMOJI_TEXT_MAX = 2000;

class TranslationCacheStore {
    constructor(plugin) {
        this.plugin = plugin;
        // value -> number of keys holding it; valid only for valueRefsCache at size valueRefsSize (rebuilt otherwise).
        this.valueRefs = null;
        this.valueRefsCache = null;
        this.valueRefsSize = -1;
        // Keys of entries saved before 0.4.0 that have not moved to their current key yet.
        this.legacyKeys = new Set();
        this.preEmojiSourceTexts = new Map();
    }

    getTranslationCacheValueRefs() {
        const cache = this.plugin.translationCache;
        if (this.hasCurrentTranslationCacheValueRefs()) return this.valueRefs;
        const refs = new Map();
        for (const value of cache.values()) refs.set(value, (refs.get(value) || 0) + 1);
        this.valueRefs = refs;
        this.valueRefsCache = cache;
        this.valueRefsSize = cache.size;
        return refs;
    }

    hasCurrentTranslationCacheValueRefs() {
        const cache = this.plugin.translationCache;
        return Boolean(this.valueRefs) && this.valueRefsCache === cache && this.valueRefsSize === cache.size;
    }

    invalidateTranslationCacheValueRefs() {
        this.valueRefs = null;
        this.valueRefsCache = null;
        this.valueRefsSize = -1;
    }

    releaseTranslationCacheValueRef(value) {
        const count = (this.valueRefs.get(value) || 0) - 1;
        if (count > 0) this.valueRefs.set(value, count);
        else this.valueRefs.delete(value);
    }

    // Map writes that keep the value counts current (when they have been built).
    setTranslationCacheEntry(key, value) {
        const cache = this.plugin.translationCache;
        const tracked = this.hasCurrentTranslationCacheValueRefs();
        if (cache.has(key)) {
            if (tracked) this.releaseTranslationCacheValueRef(cache.get(key));
            cache.delete(key);
        }
        cache.set(key, value);
        // Written now, so it is a current entry.
        this.legacyKeys.delete(key);
        if (tracked) {
            this.valueRefs.set(value, (this.valueRefs.get(value) || 0) + 1);
            this.valueRefsSize = cache.size;
        }
    }

    deleteTranslationCacheEntry(key) {
        const cache = this.plugin.translationCache;
        this.legacyKeys.delete(key);
        if (!cache.has(key)) return false;
        const tracked = this.hasCurrentTranslationCacheValueRefs();
        if (tracked) this.releaseTranslationCacheValueRef(cache.get(key));
        cache.delete(key);
        if (tracked) this.valueRefsSize = cache.size;
        return true;
    }

    // --- Entries saved before 0.4.0 -------------------------------------------------------------------------

    isPreKeySchemaTranslationCachePayload(payload) {
        if (Array.isArray(payload)) return true;
        if (!payload || typeof payload !== "object") return false;
        return !(Number(payload.keySchema) >= TRANSLATION_CACHE_KEY_SCHEMA) && !Array.isArray(payload.localModels);
    }

    hasLegacyTranslationCacheEntries() {
        return this.legacyKeys.size > 0;
    }

    // Called by text extraction while old entries remain: the same message text read without the standard
    // emoji images, which is what versions before 0.4.0 keyed it by.
    rememberPreEmojiSourceText(text, preEmojiText) {
        if (!this.legacyKeys.size) return;
        const value = String(text || "");
        const previous = String(preEmojiText || "");
        if (!value || value === previous) return;
        this.preEmojiSourceTexts.delete(value);
        this.preEmojiSourceTexts.set(value, previous);
        while (this.preEmojiSourceTexts.size > TRANSLATION_CACHE_PRE_EMOJI_TEXT_MAX) {
            this.preEmojiSourceTexts.delete(this.preEmojiSourceTexts.keys().next().value);
        }
    }

    getPreEmojiSourceText(text) {
        const value = String(text || "");
        if (removeStandardEmoji(value) === value) return "";
        // Read from the chat: exact. Otherwise each emoji is taken as a word of its own.
        const traced = this.preEmojiSourceTexts.get(value);
        const previous = traced ?? this.plugin.normalizeExtractedText(removeStandardEmoji(value));
        return previous && previous !== value ? previous : "";
    }

    // The message identity ends with the hash of the text it was built from.
    getPreEmojiMessageIdentity(identity, text, preEmojiText) {
        const value = this.plugin.normalizeTranslationMessageIdentity(identity);
        const suffix = `:${this.plugin.getTextFingerprint(text)}`;
        if (!value || !value.endsWith(suffix)) return value;
        return `${value.slice(0, -suffix.length)}:${this.plugin.getTextFingerprint(preEmojiText)}`;
    }

    // Whether cache keys name a detected model in place of the configured "local-model" placeholder (true),
    // still wait for the detection (false), or never name a detected model (null).
    getTranslationCacheServedModelState(options = {}) {
        const config = this.plugin.getEffectiveTaskConfig("translation", options.configOverrides);
        const defaults = DEFAULT_SETTINGS.translation || {};
        if (!this.plugin.shouldAutoDetectLocalProviderModel(config, defaults)) return null;
        return Boolean(this.plugin.getCachedLocalProviderDetectedModel(config, { defaultConfig: defaults }));
    }

    isServedModelInTranslationCacheKeys(options = {}) {
        return this.getTranslationCacheServedModelState(options) === true;
    }

    // The key as it was before the served model was detected (or before 0.4.0): the model part names the
    // configured placeholder. "" when keys name no detected model.
    getPlaceholderModelTranslationCacheKey(text, options = {}, servedModelState = this.getTranslationCacheServedModelState(options)) {
        if (servedModelState !== true) return "";
        return this.plugin.buildTranslationCacheKey(text, options, this.plugin.getStrongTextFingerprint(text), { legacyModel: true });
    }

    // Keys an entry saved before 0.4.0 has for this text and options, when they differ from the current key.
    // Only keys of such entries that are still cached are returned.
    getLegacyCompatTranslationCacheKeys(text, options = {}, primaryKey = "", servedModelState = this.getTranslationCacheServedModelState(options)) {
        if (!this.legacyKeys.size) return [];
        const candidates = [this.getPlaceholderModelTranslationCacheKey(text, options, servedModelState)];
        const preEmojiText = this.getPreEmojiSourceText(text);
        if (preEmojiText) {
            const preEmojiOptions = options.messageIdentity
                ? { ...options, messageIdentity: this.getPreEmojiMessageIdentity(options.messageIdentity, text, preEmojiText) }
                : options;
            candidates.push(this.plugin.buildTranslationCacheKey(preEmojiText, preEmojiOptions, this.plugin.getStrongTextFingerprint(preEmojiText), { legacyModel: true }));
        }
        return [...new Set(candidates)].filter(key => key
            && key !== primaryKey
            && this.legacyKeys.has(key)
            && this.plugin.translationCache.has(key));
    }

    // Moves the old entries of this text and options to the current key, keeping their times, so every lookup
    // (and the saved cache) finds them there. Before the served model is detected the current key still names
    // the placeholder, so a moved entry stays an old one and moves again once the model is known.
    adoptLegacyTranslationCacheEntries(text, options = {}, primaryKey = "") {
        if (!this.legacyKeys.size || !primaryKey) return 0;
        const servedModelState = this.getTranslationCacheServedModelState(options);
        const stillPlaceholder = servedModelState === false;
        // An old entry under the current key itself is final, unless that key still waits for the served model.
        if (!stillPlaceholder) this.legacyKeys.delete(primaryKey);
        const found = this.getLegacyCompatTranslationCacheKeys(text, options, primaryKey, servedModelState);
        if (!found.length) {
            if (!this.legacyKeys.size) this.preEmojiSourceTexts.clear();
            return 0;
        }
        const cache = this.plugin.translationCache;
        const metaByKey = this.plugin.translationCacheMeta;
        const now = Date.now();
        let adopted = 0;
        for (const key of found) {
            const meta = metaByKey.get(key) || {};
            if (!cache.has(primaryKey) && !this.plugin.isTranslationCacheEntryExpired(meta, now)) {
                this.setTranslationCacheEntry(primaryKey, cache.get(key));
                metaByKey.set(primaryKey, {
                    createdAt: Number(meta.createdAt || now),
                    touchedAt: Number(meta.touchedAt || now),
                    expiresAt: this.plugin.getTranslationCacheEntryExpiresAt(meta, now),
                    volatile: Boolean(meta.volatile || this.plugin.isVolatileTranslationCacheKey(primaryKey))
                });
                if (stillPlaceholder) this.legacyKeys.add(primaryKey);
                adopted++;
            }
            this.deleteTranslationCacheEntry(key);
            metaByKey.delete(key);
        }
        if (!this.legacyKeys.size) this.preEmojiSourceTexts.clear();
        this.plugin.clearTranslationCacheNegativeLookups();
        this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
        this.plugin.logDiagnostic("cache.lookup", "legacy-adopted", {
            ...this.plugin.getDiagnosticBaseMeta("cache", this.getTranslationCacheMode(primaryKey), "cache-legacy-adopted"),
            cacheHash: this.plugin.getTextFingerprint(primaryKey),
            adopted,
            remaining: this.legacyKeys.size
        });
        return adopted;
    }

    pruneLegacyTranslationCacheKeys() {
        if (!this.legacyKeys.size) return;
        for (const key of [...this.legacyKeys]) {
            if (!this.plugin.translationCache.has(key)) this.legacyKeys.delete(key);
        }
        if (!this.legacyKeys.size) this.preEmojiSourceTexts.clear();
    }

    getTranslationCacheMessageCount() {
        return this.getTranslationCacheValueRefs().size;
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
        // Public bilingual entries are translations of unsent drafts (DMs included): memory only.
        if (String(this.getTranslationCacheMode(cacheKey)).startsWith("public-bilingual")) return true;
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
        // A line drawn before the served model was first detected carries the placeholder-model key.
        if (aliasOptions.includePlaceholderModel && this.plugin.localProviderModelFirstDetected) {
            aliases.push(this.getPlaceholderModelTranslationCacheKey(text, options));
        }
        this.adoptLegacyTranslationCacheEntries(text, options, primaryKey);
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

    // cacheOptions.legacyModel: keep the configured model (the "local-model" placeholder) instead of the model
    // the local server was detected to serve, as keys saved before the detection (or before 0.4.0) do.
    buildTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text), cacheOptions = {}) {
        const config = this.plugin.getCacheConfigSnapshot("translation", this.plugin.getEffectiveTaskConfig("translation", options.configOverrides), {
            servedModel: true,
            legacyModel: Boolean(cacheOptions.legacyModel)
        });
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

    // A queued item's key names the local model detected when it was queued, but the request
    // re-detects the model first. Its result belongs under the model that answered, so the model
    // part of the key is swapped for the currently served one; everything else stays.
    getServedModelTranslationCacheKey(cacheKey, options = {}) {
        const key = String(cacheKey || "");
        const config = this.plugin.getEffectiveTaskConfig("translation", options.configOverrides);
        if (!key || !this.plugin.shouldAutoDetectLocalProviderModel(config, DEFAULT_SETTINGS.translation || {})) return key;
        const parts = key.split("\n---\n");
        const index = parts.findIndex((part, position) => position > 0 && part.startsWith("model:") && parts[position - 1].startsWith("endpoint:"));
        if (index < 0) return key;
        const servedModel = this.plugin.getCacheConfigSnapshot("translation", config, { servedModel: true }).model;
        const servedPart = `model:${this.plugin.getStrongTextFingerprint(servedModel)}`;
        if (parts[index] === servedPart) return key;
        parts[index] = servedPart;
        return parts.join("\n---\n");
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

    // options.servedModel: for cache keys, name the model the local server actually serves
    // when the setting is the "local-model" placeholder, so swapping the loaded model stops
    // matching the old model's translations. Provider keys leave it out on purpose: health
    // and cooldowns belong to the server, not to the model it has loaded.
    getCacheConfigSnapshot(kind, config, options = {}) {
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
        if (options.servedModel) {
            if (provider === "deepl" && this.plugin.getDeepLLanguageCode(config.targetLanguageCode || config.targetLanguage) === "ZH-HANT") {
                // DeepL used to receive "ZH" (Simplified) for Traditional Chinese; a distinct
                // value retires the Simplified text cached as Traditional.
                snapshot.model = "zh-hant";
            }
            else if (!options.legacyModel && this.plugin.shouldAutoDetectLocalProviderModel(config, defaults)) {
                snapshot.model = this.plugin.getCachedLocalProviderDetectedModel(config, { defaultConfig: defaults }) || snapshot.model;
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
                this.deleteTranslationCacheEntry(hitKey);
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
        this.setTranslationCacheEntry(targetKey, value);
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
        this.setTranslationCacheEntry(key, String(value || ""));
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
            if (this.deleteTranslationCacheEntry(key)) removed++;
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
        // A hit never extends an entry past the lifetime the user picked (3 h stays 3 h).
        const nextExpiresAt = options.extendExpiry
            ? Math.max(currentExpiresAt, now + Math.min(TRANSLATION_CACHE_HIT_EXTEND_MS, this.plugin.getTranslationCacheTtlMs()))
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
        this.invalidateTranslationCacheValueRefs();
        this.plugin.clearTranslationCacheNegativeLookups();
        this.legacyKeys.clear();
        this.preEmojiSourceTexts.clear();
        const payload = this.plugin.loadData(CACHE_DATA_KEY);
        this.plugin.restoreLocalProviderDetectedModels(payload?.localModels);
        const entries = Array.isArray(payload) ? payload : payload?.entries;
        if (!Array.isArray(entries)) {
            this.plugin.persistentTranslationCacheCount = 0;
            return;
        }

        const now = Date.now();
        const storedTtlMs = this.plugin.normalizeTranslationCacheTtlHours(payload?.ttlHours) * 60 * 60 * 1000;
        const persistedStrings = Array.isArray(payload?.strings) ? payload.strings.map(value => String(value || "")) : [];
        const savedBeforeKeySchema = this.isPreKeySchemaTranslationCachePayload(payload);
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
            if (savedBeforeKeySchema || entry?.l) this.legacyKeys.add(key);
            restoredEntries++;
        }
        // Stored expiry times may come from a longer lifetime (or an older, uncapped hit extension).
        const clamped = this.plugin.clampTranslationCacheExpiryToCurrentTtl(now);
        this.plugin.pruneTranslationCache({ scanExpired: true });
        this.plugin.persistentTranslationCacheCount = this.plugin.getTranslationCacheMessageCount();
        if (clamped || this.plugin.translationCache.size !== entries.length || restoredEntries !== entries.length || payload?.version !== 3) this.plugin.scheduleTranslationCachePersist();
    }

    // Used once when the cache moves to its own data file (and after a downgrade left an old copy behind):
    // keeps the keys of both payloads that are not older than the newer copy, the more recently used copy of a
    // key wins, oldest first (LRU order).
    mergePersistedTranslationCachePayloads(current, legacy) {
        const now = Date.now();
        const decode = payload => {
            const entries = Array.isArray(payload) ? payload : payload?.entries;
            if (!Array.isArray(entries)) return null;
            const strings = Array.isArray(payload?.strings) ? payload.strings.map(value => String(value || "")) : [];
            const ttlMs = this.plugin.normalizeTranslationCacheTtlHours(payload?.ttlHours) * 60 * 60 * 1000;
            const savedBeforeKeySchema = this.isPreKeySchemaTranslationCachePayload(payload);
            return entries.map(entry => {
                const key = this.plugin.decodePersistedTranslationCacheKey(entry, strings);
                const value = this.plugin.decodePersistedTranslationCacheValue(entry, strings);
                if (!key || !value) return null;
                const createdAt = Number(entry?.createdAt ?? entry?.c ?? now);
                return {
                    key,
                    value,
                    createdAt,
                    touchedAt: Number(entry?.touchedAt ?? entry?.lastUsedAt ?? entry?.t ?? createdAt),
                    expiresAt: Number(entry?.expiresAt ?? entry?.e ?? (createdAt + ttlMs)),
                    legacy: savedBeforeKeySchema || Boolean(entry?.l)
                };
            }).filter(Boolean);
        };
        let currentEntries = decode(current);
        let legacyEntries = decode(legacy);
        if (!legacyEntries) return current;
        if (!currentEntries) return legacy;
        // Each copy is the whole cache as it was when saved. Nothing older than the newer copy's save time is taken
        // from the older copy: it was cleared, evicted or expired there (0.3.0 after a downgrade writes an empty
        // payload on "Clear translation cache"), or that version could not read it. A cleared cache must not come
        // back; a missed entry is only translated again.
        const currentSavedAt = Number(current?.savedAt) || 0;
        const legacySavedAt = Number(legacy?.savedAt) || 0;
        if (legacySavedAt > currentSavedAt) currentEntries = currentEntries.filter(item => item.touchedAt >= legacySavedAt);
        else if (currentSavedAt > legacySavedAt) legacyEntries = legacyEntries.filter(item => item.touchedAt >= currentSavedAt);
        const byKey = new Map();
        [...legacyEntries, ...currentEntries].forEach(item => {
            const existing = byKey.get(item.key);
            if (!existing || item.touchedAt >= existing.touchedAt) byKey.set(item.key, item);
        });
        const strings = [];
        const stringIndexes = new Map();
        const encodeString = value => {
            const text = String(value || "");
            if (!stringIndexes.has(text)) {
                stringIndexes.set(text, strings.length);
                strings.push(text);
            }
            return stringIndexes.get(text);
        };
        const entries = [...byKey.values()]
            .sort((left, right) => left.touchedAt - right.touchedAt)
            .map(item => {
                const entry = {
                    k: item.key.split("\n---\n").map(encodeString),
                    v: encodeString(item.value),
                    c: item.createdAt,
                    t: item.touchedAt,
                    e: item.expiresAt
                };
                if (item.legacy) entry.l = 1;
                return entry;
            });
        return {
            version: 3,
            keySchema: TRANSLATION_CACHE_KEY_SCHEMA,
            savedAt: now,
            ttlHours: this.plugin.normalizeTranslationCacheTtlHours(current?.ttlHours ?? legacy?.ttlHours),
            maxEntries: Number(current?.maxEntries || legacy?.maxEntries || 0) || this.plugin.getTranslationCacheMaxEntries(),
            // Local-model cache keys name the served model; without the list those lines stop matching.
            localModels: this.mergePersistedLocalModels(current?.localModels, legacy?.localModels),
            strings,
            entries
        };
    }

    // One entry per local server, the current copy's model first; restoreLocalProviderDetectedModels reads 8.
    mergePersistedLocalModels(current, legacy) {
        const seen = new Set();
        return [...(Array.isArray(current) ? current : []), ...(Array.isArray(legacy) ? legacy : [])]
            .filter(item => {
                const key = String(item?.key || "");
                if (!key || !String(item?.model || "").trim() || seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 8)
            .map(item => ({ key: String(item.key), model: String(item.model).trim() }));
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
            const entry = {
                k: encodeKey(key),
                v: encodeValue(value),
                c: Number(meta.createdAt || Date.now()),
                t: Number(meta.touchedAt || Date.now()),
                e: this.plugin.getTranslationCacheEntryExpiresAt(meta)
            };
            // Saved before 0.4.0 and not moved to its current key yet.
            if (this.legacyKeys.has(key)) entry.l = 1;
            return entry;
        });
        return {
            version: 3,
            keySchema: TRANSLATION_CACHE_KEY_SCHEMA,
            savedAt: Date.now(),
            ttlHours: this.plugin.normalizeTranslationCacheTtlHours(this.plugin.settings.ui?.translationCacheTtlHours),
            maxEntries: this.plugin.getTranslationCacheMaxEntries(),
            // Cache keys of local models name the served model; see getCacheConfigSnapshot.
            localModels: this.plugin.getPersistableLocalProviderDetectedModels(),
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
            // Saved messages: entries of one message share its value index.
            this.plugin.persistentTranslationCacheCount = new Set(payload.entries.map(entry => entry.v)).size;
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
        const previousLegacyKeys = this.legacyKeys;
        if (this.plugin.translationCacheDirtyTimer) {
            clearTimeout(this.plugin.translationCacheDirtyTimer);
            this.plugin.translationCacheDirtyTimer = null;
        }
        this.plugin.translationCacheDirtyAt = 0;
        this.plugin.translationCacheDirty = false;
        this.plugin.translationCache.clear();
        this.plugin.translationCacheMeta.clear();
        this.legacyKeys = new Set();
        this.preEmojiSourceTexts.clear();
        this.invalidateTranslationCacheValueRefs();
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
            this.legacyKeys = previousLegacyKeys;
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
            // Full passes also recount values, so direct Map writes elsewhere cannot skew the count for long.
            this.invalidateTranslationCacheValueRefs();
            for (const [key, meta] of this.plugin.translationCacheMeta) {
                if (this.plugin.isTranslationCacheEntryExpired(meta, now)) {
                    this.plugin.translationCache.delete(key);
                    this.plugin.translationCacheMeta.delete(key);
                    removed = true;
                }
            }
            this.pruneLegacyTranslationCacheKeys();
        }

        const cache = this.plugin.translationCache;
        const maxMessages = this.plugin.getTranslationCacheMaxEntries();
        const maxKeys = maxMessages * TRANSLATION_CACHE_MAX_KEYS_PER_MESSAGE;
        // Oldest keys go first; a message leaves the count once its last key is gone.
        while (cache.size > maxKeys || (cache.size > maxMessages && this.getTranslationCacheValueRefs().size > maxMessages)) {
            const oldestKey = cache.keys().next().value;
            this.deleteTranslationCacheEntry(oldestKey);
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
