"use strict";

// Phase 4 of the modularization plan: translation cache keys, aliases, TTL, compact codec, negative lookups and persistence.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    CACHE_DATA_KEY,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_REASON_CODES,
    HEAVY_PERSISTENCE_DEFER_MS,
    PLUGIN_NAME,
    PROVIDER_DEFAULTS,
    TRANSLATION_CACHE_DEFAULT_LIMIT,
    TRANSLATION_CACHE_DEFAULT_TTL_HOURS,
    TRANSLATION_CACHE_HIT_EXTEND_MS,
    TRANSLATION_CACHE_MAX_LIMIT,
    TRANSLATION_CACHE_MIN_LIMIT,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_MAX,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_TTL_MS,
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_IDLE_PERSIST_MS,
    TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD,
    TRANSLATION_CACHE_TTL_OPTIONS,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS
} = require("../constants");
const { createPluginContext } = require("../core/plugin-context");
const { removeStandardEmoji } = require("../intake/emoji-text");

// The size limit counts messages (distinct cached translations): one message is stored under 2-3 keys (identity,
// auto-text, manual, promoted aliases) that share its text. Keys are still capped at this multiple of the limit,
// so many messages with the same short translation cannot grow the key count without bound.
const TRANSLATION_CACHE_MAX_KEYS_PER_MESSAGE = 4;

// The key format a saved cache was written with; caches saved before 0.4.0 (and by its previews) have none.
// Their keys name a local server's "local-model" placeholder instead of the model it serves, and were built from
// message text without standard emoji (only ":name:" emoji were read then). Such entries stay reachable through
// compatibility aliases and move to their current key on their first hit.
const TRANSLATION_CACHE_KEY_SCHEMA = 2;
// Message texts with standard emoji, and the same text read the way versions before 0.4.0 read it.
const TRANSLATION_CACHE_PRE_EMOJI_TEXT_MAX = 2000;

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

let sharedTextEncoder = null;

function encodeUtf8Bytes(text) {
    const value = String(text ?? "");
    if (typeof TextEncoder === "function") {
        if (!sharedTextEncoder) sharedTextEncoder = new TextEncoder();
        return sharedTextEncoder.encode(value);
    }
    const bytes = [];
    for (let index = 0; index < value.length; index++) {
        let code = value.charCodeAt(index);
        if (code >= 0xd800 && code <= 0xdbff) {
            const next = index + 1 < value.length ? value.charCodeAt(index + 1) : 0;
            if (next >= 0xdc00 && next <= 0xdfff) {
                code = ((code - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
                index++;
            }
            else {
                code = 0xfffd;
            }
        }
        else if (code >= 0xdc00 && code <= 0xdfff) {
            code = 0xfffd;
        }
        if (code < 0x80) bytes.push(code);
        else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
        else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
        else {
            bytes.push(
                0xf0 | (code >> 18),
                0x80 | ((code >> 12) & 0x3f),
                0x80 | ((code >> 6) & 0x3f),
                0x80 | (code & 0x3f)
            );
        }
    }
    return new Uint8Array(bytes);
}

// Pure-JS SHA-256 so BetterDiscord's renderer never depends on Node's require("node:crypto").
function sha256Hex(text) {
    const bytes = encodeUtf8Bytes(text);
    const bitLen = bytes.length * 8;
    const totalLen = Math.ceil((bytes.length + 9) / 64) * 64;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLen - 8, Math.floor(bitLen / 0x100000000), false);
    view.setUint32(totalLen - 4, bitLen >>> 0, false);

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    for (let offset = 0; offset < totalLen; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
        for (let i = 16; i < 64; i++) {
            const w15 = w[i - 15];
            const s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
            const w2 = w[i - 2];
            const s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;
        for (let i = 0; i < 64; i++) {
            const s1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
            const s0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (s0 + maj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + temp1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (temp1 + temp2) >>> 0;
        }
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }
    return [h0, h1, h2, h3, h4, h5, h6, h7].map(part => (part >>> 0).toString(16).padStart(8, "0")).join("");
}

class TranslationCacheStore {
    constructor(plugin, ctx = createPluginContext(plugin)) {
        this.plugin = plugin;
        this.ctx = ctx;
        // value -> number of keys holding it; valid only for valueRefsCache at size valueRefsSize (rebuilt otherwise).
        this.valueRefs = null;
        this.valueRefsCache = null;
        this.valueRefsSize = -1;
        // Keys of entries saved before 0.4.0 that have not moved to their current key yet.
        this.legacyKeys = new Set();
        this.preEmojiSourceTexts = new Map();
        this.cacheNeedsReload = false;
        this.clearedAt = 0;
        this.mergedLegacy = null;
        this.unmarkedLegacyCommit = null;
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
        return !(Number(payload.keySchema) >= TRANSLATION_CACHE_KEY_SCHEMA);
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
        return this.buildTranslationCacheKey(text, options, this.plugin.getStrongTextFingerprint(text), { legacyModel: true });
    }

    // Keys an entry saved before 0.4.0 has for this text and options, when they differ from the current key.
    // Only keys of such entries that are still cached are returned.
    getLegacyCompatTranslationCacheKeys(text, options = {}, primaryKey = "", servedModelState = this.getTranslationCacheServedModelState(options)) {
        if (!this.legacyKeys.size) return [];
        const candidates = [this.getPlaceholderModelTranslationCacheKey(text, options, servedModelState)];
        const endpoints = [undefined, ...this.getCompatibleLegacyTranslationCacheEndpoints(options)];
        if (servedModelState === true) {
            for (const legacyEndpoint of endpoints.slice(1)) {
                candidates.push(this.buildTranslationCacheKey(text, options, this.plugin.getStrongTextFingerprint(text), { legacyModel: true, legacyEndpoint }));
            }
        }
        const preEmojiText = this.getPreEmojiSourceText(text);
        if (preEmojiText) {
            const preEmojiOptions = options.messageIdentity
                ? { ...options, messageIdentity: this.getPreEmojiMessageIdentity(options.messageIdentity, text, preEmojiText) }
                : options;
            for (const legacyEndpoint of endpoints) {
                candidates.push(this.buildTranslationCacheKey(preEmojiText, preEmojiOptions, this.plugin.getStrongTextFingerprint(preEmojiText), { legacyModel: true, legacyEndpoint }));
            }
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
            if (!cache.has(primaryKey) && !this.isTranslationCacheEntryExpired(meta, now)) {
                this.setTranslationCacheEntry(primaryKey, cache.get(key));
                metaByKey.set(primaryKey, {
                    createdAt: Number(meta.createdAt || now),
                    touchedAt: Number(meta.touchedAt || now),
                    expiresAt: this.getTranslationCacheEntryExpiresAt(meta, now),
                    volatile: Boolean(meta.volatile || this.isVolatileTranslationCacheKey(primaryKey))
                });
                if (stillPlaceholder) this.legacyKeys.add(primaryKey);
                adopted++;
            }
            this.deleteTranslationCacheEntry(key);
            metaByKey.delete(key);
        }
        if (!this.legacyKeys.size) this.preEmojiSourceTexts.clear();
        this.clearTranslationCacheNegativeLookups();
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
        return this.buildTranslationCacheKey(text, options, this.plugin.getStrongTextFingerprint(text));
    }

    getLegacyTranslationCacheKey(text, options = {}) {
        return this.buildTranslationCacheKey(text, options, this.plugin.getTextFingerprint(text));
    }

    getTranslationCacheAliases(text, options = {}, aliasOptions = {}) {
        const strongTextHash = this.plugin.getStrongTextFingerprint(text);
        const legacyTextHash = this.plugin.getTextFingerprint(text);
        const taskConfig = this.plugin.getEffectiveTaskConfig("translation", options.configOverrides);
        const config = this.getCacheConfigSnapshot("translation", taskConfig, {
            servedModel: true,
            legacyModel: false
        });
        config.endpoint = this.getTranslationCacheEndpoint(taskConfig);
        if (!config._adapterScopedPolicy) {
            config.promptPolicyVersion = this.plugin.getPromptPolicyCacheVersion("translation", options, config);
        }
        const mode = options.mode || "manual";
        const normalizedIdentity = this.plugin.normalizeTranslationMessageIdentity(options.messageIdentity);
        const strongIdentity = normalizedIdentity || `text:${strongTextHash}`;
        const legacyIdentity = normalizedIdentity || `text:${legacyTextHash}`;
        const compactParts = this.plugin.getCompactTranslationCacheConfigParts(config);
        const fullParts = [
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
        ];
        const compactBody = compactParts.join("\n---\n");
        const fullBody = fullParts.join("\n---\n");
        const joinWith = (body, hash, identity, omitIdentity = false) => omitIdentity
            ? `${mode}\n---\n${body}\n---\n${hash}`
            : `${mode}\n---\n${identity}\n---\n${body}\n---\n${hash}`;

        const primaryKey = joinWith(compactBody, strongTextHash, strongIdentity);
        const aliases = [
            joinWith(compactBody, legacyTextHash, legacyIdentity),
            joinWith(fullBody, strongTextHash, strongIdentity),
            joinWith(fullBody, legacyTextHash, legacyIdentity)
        ];
        const includePreMessageIdentity = aliasOptions.includePreMessageIdentity !== false;
        if (includePreMessageIdentity) {
            aliases.push(
                joinWith(compactBody, strongTextHash, strongIdentity, true),
                joinWith(compactBody, legacyTextHash, legacyIdentity, true),
                joinWith(fullBody, strongTextHash, strongIdentity, true),
                joinWith(fullBody, legacyTextHash, legacyIdentity, true)
            );
        }
        // A line drawn before the served model was first detected carries the placeholder-model key.
        if (aliasOptions.includePlaceholderModel && this.plugin.localProviderModelFirstDetected) {
            aliases.push(this.getPlaceholderModelTranslationCacheKey(text, options));
        }
        for (const legacyEndpoint of this.getCompatibleLegacyTranslationCacheEndpoints(options, taskConfig, config.endpoint)) {
            const legacyCompactParts = compactParts.slice();
            legacyCompactParts[1] = `endpoint:${this.plugin.getStrongTextFingerprint(legacyEndpoint)}`;
            const legacyCompactBody = legacyCompactParts.join("\n---\n");
            const legacyFullParts = fullParts.slice();
            legacyFullParts[1] = legacyEndpoint;
            const legacyFullBody = legacyFullParts.join("\n---\n");
            aliases.push(
                joinWith(legacyCompactBody, strongTextHash, strongIdentity),
                joinWith(legacyCompactBody, legacyTextHash, legacyIdentity),
                joinWith(legacyFullBody, strongTextHash, strongIdentity),
                joinWith(legacyFullBody, legacyTextHash, legacyIdentity)
            );
            if (includePreMessageIdentity) {
                aliases.push(
                    joinWith(legacyCompactBody, strongTextHash, strongIdentity, true),
                    joinWith(legacyCompactBody, legacyTextHash, legacyIdentity, true),
                    joinWith(legacyFullBody, strongTextHash, strongIdentity, true),
                    joinWith(legacyFullBody, legacyTextHash, legacyIdentity, true)
                );
            }
            if (aliasOptions.includePlaceholderModel && this.plugin.localProviderModelFirstDetected && this.getTranslationCacheServedModelState(options) === true) {
                aliases.push(this.buildTranslationCacheKey(text, options, strongTextHash, { legacyModel: true, legacyEndpoint }));
            }
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
        return this.getTranslationCacheKey(text, this.getAutoTextTranslationCacheOptions(options));
    }

    getAutoTextTranslationCacheAliases(text, options = {}) {
        return this.plugin.getTranslationCacheAliases(text, this.getAutoTextTranslationCacheOptions(options));
    }

    getAutoTextTranslationCacheValue(text, options = {}) {
        const key = this.getAutoTextTranslationCacheKey(text, options);
        return this.plugin.getTranslationCacheValue(key, this.getAutoTextTranslationCacheAliases(text, options));
    }

    getAutoTextTranslationCacheValueCached(text, options = {}, context = null) {
        const key = this.getAutoTextTranslationCacheKey(text, options);
        return this.getTranslationCacheValueCached(key, this.getAutoTextTranslationCacheAliases(text, options), context);
    }

    setAutoTextTranslationCache(text, options = {}, value = "") {
        const key = this.getAutoTextTranslationCacheKey(text, options);
        this.plugin.setTranslationCache(key, value);
    }

    getFullConfigTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text)) {
        return this.buildTranslationCacheKey(text, options, sourceTextHash, { fullConfig: true });
    }

    getPreMessageIdentityTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text), cacheOptions = {}) {
        return this.buildTranslationCacheKey(text, options, sourceTextHash, { ...cacheOptions, omitMessageIdentity: true });
    }

    getTranslationCacheEndpoint(config) {
        const defaults = DEFAULT_SETTINGS.translation;
        const provider = this.plugin.providerLayer;
        const endpoint = provider.getProviderEndpointIdentity(config, defaults);
        const legacyFallback = String(defaults.endpoint || "").trim();
        if (config.provider === "microsoft" || (endpoint === legacyFallback
            && endpoint !== provider.getProviderEndpointIdentity({ ...config, endpoint: "" }, defaults))) {
            return `resolved:${endpoint}`;
        }
        return endpoint;
    }

    getCompatibleLegacyTranslationCacheEndpoints(options, precomputedTaskConfig = null, precomputedCacheEndpoint = null) {
        const config = precomputedTaskConfig || this.plugin.getEffectiveTaskConfig("translation", options.configOverrides);
        const defaults = DEFAULT_SETTINGS.translation;
        const provider = this.plugin.providerLayer;
        const endpoint = provider.getProviderEndpointIdentity(config, defaults);
        const cacheEndpoint = precomputedCacheEndpoint || this.getTranslationCacheEndpoint(config);
        const legacyFallback = String(defaults.endpoint || "").trim();
        const oldEndpoint = this.getCacheConfigSnapshot("translation", config).endpoint;
        const providerDefaultEndpoint = this.plugin.getProviderDefaults?.(config.provider)?.endpoint || PROVIDER_DEFAULTS[config.provider]?.endpoint;
        const candidates = new Set([oldEndpoint, endpoint, providerDefaultEndpoint]);
        return [...candidates].filter(candidate => {
            if (!candidate || candidate === cacheEndpoint) return false;
            if (candidate === legacyFallback && endpoint !== provider.getProviderEndpointIdentity({ ...config, endpoint: "" }, defaults)) return false;
            return endpoint === provider.getProviderEndpointIdentity({ ...config, endpoint: candidate }, defaults);
        });
    }

    // cacheOptions.legacyModel: keep the configured model (the "local-model" placeholder) instead of the model
    // the local server was detected to serve, as keys saved before the detection (or before 0.4.0) do.
    buildTranslationCacheKey(text, options = {}, sourceTextHash = this.plugin.getStrongTextFingerprint(text), cacheOptions = {}) {
        const taskConfig = this.plugin.getEffectiveTaskConfig("translation", options.configOverrides);
        const config = this.getCacheConfigSnapshot("translation", taskConfig, {
            servedModel: true,
            legacyModel: Boolean(cacheOptions.legacyModel)
        });
        config.endpoint = cacheOptions.legacyEndpoint ?? this.getTranslationCacheEndpoint(taskConfig);
        if (!config._adapterScopedPolicy) {
            config.promptPolicyVersion = this.plugin.getPromptPolicyCacheVersion("translation", options, config);
        }
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
        const servedModel = this.getCacheConfigSnapshot("translation", config, { servedModel: true }).model;
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
        const adapter = this.plugin.providerLayer?.registry?.get?.(provider) || null;
        const customDefaults = !PROVIDER_DEFAULTS[provider] && adapter?.defaultProfile ? adapter.defaultProfile : null;
        const snapshot = {
            provider,
            endpoint: String(config.endpoint || customDefaults?.endpoint || defaults.endpoint || "").trim(),
            model: String(config.model || adapter?.defaultProfile?.model || PROVIDER_DEFAULTS[provider]?.model || defaults.model || "").trim(),
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
        if (this.plugin.isDirectTranslateProvider(provider)) {
            snapshot.model = adapter?.defaultProfile?.model || PROVIDER_DEFAULTS[provider]?.model || "";
            snapshot.temperature = 0;
            snapshot.maxTokens = 0;
            snapshot.enableThinking = false;
            snapshot.promptPolicyVersion = `${provider}-v1`;
            snapshot.prompt = "";
        }
        const beforeScopePolicy = snapshot.promptPolicyVersion;
        if (typeof adapter?.applyCacheScope === "function") {
            adapter.applyCacheScope(config, snapshot, this.plugin, options);
            if (snapshot.promptPolicyVersion !== beforeScopePolicy) {
                Object.defineProperty(snapshot, "_adapterScopedPolicy", {
                    value: true,
                    enumerable: false,
                    configurable: true
                });
            }
        }
        if (options.servedModel && !options.legacyModel && this.plugin.shouldAutoDetectLocalProviderModel(config, defaults)) {
            snapshot.model = this.plugin.getCachedLocalProviderDetectedModel(config, { defaultConfig: defaults }) || snapshot.model;
        }
        return snapshot;
    }

    getTranslationCacheValueCached(key, aliases = [], context = null) {
        if (!context?.translationCacheLookupByKey) return this.plugin.getTranslationCacheValue(key, aliases);
        const lookupKey = [key, ...aliases].filter(Boolean).join("\n@@\n");
        if (context.translationCacheLookupByKey.has(lookupKey)) {
            return context.translationCacheLookupByKey.get(lookupKey);
        }
        if (this.isTranslationCacheNegativeLookupFresh(lookupKey)) {
            context.translationCacheLookupByKey.set(lookupKey, null);
            return null;
        }
        const value = this.plugin.getTranslationCacheValue(key, aliases);
        context.translationCacheLookupByKey.set(lookupKey, value);
        if (value === null) this.rememberTranslationCacheNegativeLookup(lookupKey);
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
        this.pruneTranslationCacheNegativeLookups(now);
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
            if (this.isTranslationCacheEntryExpired(meta)) {
                this.deleteTranslationCacheEntry(hitKey);
                this.plugin.translationCacheMeta.delete(hitKey);
                this.plugin.scheduleTranslationCachePersist();
                if (this.plugin.settings.ui?.diagnosticsEnabled) {
                    this.plugin.logDiagnostic("cache.lookup", "expired", {
                        ...this.plugin.getDiagnosticBaseMeta("cache", this.getTranslationCacheMode(hitKey), "cache-expired"),
                        cacheHash: this.plugin.getTextFingerprint(hitKey)
                    });
                }
                continue;
            }

            this.plugin.translationCacheStats.hits++;
            this.touchTranslationCache(hitKey, { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
            const value = this.plugin.translationCache.get(hitKey);
            if (this.plugin.settings.ui?.diagnosticsEnabled) {
                this.plugin.logDiagnostic("cache.lookup", "hit", {
                    ...this.plugin.getDiagnosticBaseMeta("cache", this.getTranslationCacheMode(hitKey), DIAGNOSTIC_REASON_CODES.CACHE_HIT),
                    cacheHash: this.plugin.getTextFingerprint(hitKey),
                    alias: Boolean(key && hitKey !== key),
                    size: this.plugin.translationCache.size
                });
            }
            if (key && hitKey !== key) this.promoteTranslationCacheAlias(hitKey, key);
            return value;
        }

        this.plugin.translationCacheStats.misses++;
        if (this.plugin.settings.ui?.diagnosticsEnabled) {
            this.plugin.logDiagnostic("cache.lookup", "miss", {
                ...this.plugin.getDiagnosticBaseMeta("cache", this.getTranslationCacheMode(key), "cache-miss"),
                cacheHash: this.plugin.getTextFingerprint(key),
                aliases: aliases.length,
                size: this.plugin.translationCache.size
            });
        }
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
            expiresAt: this.getTranslationCacheEntryExpiresAt(sourceMeta, now),
            volatile: Boolean(sourceMeta.volatile || this.isVolatileTranslationCacheKey(targetKey))
        });
        this.pruneTranslationCache({ scanExpired: false });
        this.clearTranslationCacheNegativeLookups();
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
            expiresAt: now + this.getTranslationCacheTtlMs(),
            volatile: this.isVolatileTranslationCacheKey(key)
        });
        this.clearTranslationCacheNegativeLookups();
        this.plugin.logDiagnostic("cache.set", "ok", {
            ...this.plugin.getDiagnosticBaseMeta("cache", this.getTranslationCacheMode(key), "cache-set"),
            cacheHash: this.plugin.getTextFingerprint(key),
            valueLength: String(value || "").length,
            size: this.plugin.translationCache.size,
            volatile: this.isVolatileTranslationCacheKey(key)
        });
        this.pruneTranslationCache({ scanExpired: false });
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
        this.clearTranslationCacheNegativeLookups();
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
        const currentExpiresAt = this.getTranslationCacheEntryExpiresAt(meta, now);
        // A hit never extends an entry past the lifetime the user picked (3 h stays 3 h).
        const nextExpiresAt = options.extendExpiry
            ? Math.max(currentExpiresAt, now + Math.min(TRANSLATION_CACHE_HIT_EXTEND_MS, this.getTranslationCacheTtlMs()))
            : currentExpiresAt;
        this.plugin.translationCacheMeta.set(key, {
            createdAt: Number(meta.createdAt || now),
            touchedAt: now,
            expiresAt: nextExpiresAt,
            volatile: Boolean(meta.volatile || this.isVolatileTranslationCacheKey(key))
        });
        const expiryExtended = nextExpiresAt > currentExpiresAt;
        if (options.extendExpiry || options.persistDelayMs) {
            if (expiryExtended) {
                this.plugin.translationCacheTouchDirtyCount = Math.max(0, Number(this.plugin.translationCacheTouchDirtyCount || 0)) + 1;
                const thresholdReached = this.plugin.translationCacheTouchDirtyCount >= TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD;
                this.plugin.scheduleTranslationCachePersist(thresholdReached
                    ? TRANSLATION_CACHE_WRITE_DEBOUNCE_MS
                    : (options.persistDelayMs || TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS));
                if (thresholdReached) this.plugin.translationCacheTouchDirtyCount = 0;
            }
            else {
                // Pure LRU timestamp refresh (no expiry extension): mark dirty so stop()/pagehide
                // and normal writes persist it, and use a low-frequency idle persist instead of
                // triggering 5s/30s full-cache disk writes while scrolling cached channels.
                this.plugin.scheduleTranslationCachePersist(Math.max(
                    Number(options.persistDelayMs || 0),
                    TRANSLATION_CACHE_TOUCH_IDLE_PERSIST_MS
                ));
            }
        }
    }

    loadTranslationCache(options = {}) {
        const mergePending = this.plugin.translationCacheDirty
            && (this.cacheNeedsReload || this.plugin.dataLoadFailures.has(CACHE_DATA_KEY));
        const payload = this.plugin.loadData(CACHE_DATA_KEY);
        if (this.plugin.dataLoadFailures.has(CACHE_DATA_KEY)) {
            this.cacheNeedsReload = true;
            return false;
        }
        const pending = mergePending ? {
            cache: this.plugin.translationCache,
            meta: this.plugin.translationCacheMeta,
            legacyKeys: this.legacyKeys,
            preEmojiSourceTexts: this.preEmojiSourceTexts,
            clearedAt: this.clearedAt
        } : null;
        this.plugin.translationCache = new Map();
        this.plugin.translationCacheMeta = new Map();
        this.invalidateTranslationCacheValueRefs();
        this.clearTranslationCacheNegativeLookups();
        this.legacyKeys = new Set();
        this.preEmojiSourceTexts = new Map();
        this.clearedAt = this.getPersistedTranslationCacheClearedAt(payload);
        this.mergedLegacy = payload?.mergedLegacy || null;
        if (!this.mergedLegacy && this.unmarkedLegacyCommit && payload
            && this.getLegacyTranslationCacheReceipt(payload).fingerprint === this.unmarkedLegacyCommit.fingerprint) {
            this.mergedLegacy = this.unmarkedLegacyCommit;
        }
        this.unmarkedLegacyCommit = null;
        this.plugin.restoreLocalProviderDetectedModels(payload?.localModels);
        const entries = Array.isArray(payload) ? payload : payload?.entries;
        const now = Date.now();
        const storedTtlMs = this.normalizeTranslationCacheTtlHours(payload?.ttlHours) * 60 * 60 * 1000;
        const persistedStrings = Array.isArray(payload?.strings) ? payload.strings.map(value => String(value || "")) : [];
        const savedBeforeKeySchema = this.isPreKeySchemaTranslationCachePayload(payload);
        for (const entry of Array.isArray(entries) ? entries : []) {
            const key = this.decodePersistedTranslationCacheKey(entry, persistedStrings);
            const value = this.decodePersistedTranslationCacheValue(entry, persistedStrings);
            if (!key || !value) continue;
            const createdAt = Number(entry?.createdAt ?? entry?.c ?? now);
            const meta = {
                createdAt,
                touchedAt: Number(entry?.touchedAt ?? entry?.lastUsedAt ?? entry?.t ?? now),
                expiresAt: Number(entry?.expiresAt ?? entry?.e ?? (createdAt + storedTtlMs)),
                volatile: Boolean(entry?.volatile)
            };
            if (this.isTranslationCacheEntryExpired(meta, now)) continue;
            this.plugin.translationCache.set(key, value);
            this.plugin.translationCacheMeta.set(key, meta);
            if (savedBeforeKeySchema || entry?.l) this.legacyKeys.add(key);
        }
        // Stored expiry times may come from a longer lifetime (or an older, uncapped hit extension).
        const clamped = this.clampTranslationCacheExpiryToCurrentTtl(now);
        this.pruneTranslationCache({ scanExpired: true });
        this.plugin.persistentTranslationCacheCount = this.getTranslationCacheMessageCount();
        const needsCleanup = Array.isArray(entries)
            && (clamped || this.plugin.translationCache.size !== entries.length || payload?.version !== 3);
        if (pending) this.mergePendingTranslationCache(pending, now);
        this.cacheNeedsReload = false;
        if (needsCleanup && options.scheduleCleanup !== false) this.plugin.scheduleTranslationCachePersist();
        return true;
    }

    mergePendingTranslationCache(pending, now) {
        const cache = this.plugin.translationCache;
        const metaByKey = this.plugin.translationCacheMeta;
        for (const [key, value] of pending.cache) {
            const meta = pending.meta.get(key) || {};
            if (this.clearedAt > pending.clearedAt && Number(meta.createdAt || 0) <= this.clearedAt) continue;
            if (this.isTranslationCacheEntryExpired(meta, now)) continue;
            if (Number(metaByKey.get(key)?.touchedAt || 0) > Number(meta.touchedAt || 0)) continue;
            cache.set(key, value);
            metaByKey.set(key, meta);
            if (pending.legacyKeys.has(key)) this.legacyKeys.add(key);
            else this.legacyKeys.delete(key);
        }
        this.plugin.translationCache = new Map([...cache].sort(([left], [right]) =>
            Number(metaByKey.get(left)?.touchedAt || 0) - Number(metaByKey.get(right)?.touchedAt || 0)));
        this.preEmojiSourceTexts = pending.preEmojiSourceTexts;
        this.clampTranslationCacheExpiryToCurrentTtl(now);
        this.pruneTranslationCache({ scanExpired: true });
    }

    prepareTranslationCacheWrite() {
        return (!this.cacheNeedsReload && !this.plugin.dataLoadFailures.has(CACHE_DATA_KEY))
            || this.loadTranslationCache({ scheduleCleanup: false });
    }

    getPersistedTranslationCacheClearedAt(payload) {
        const oldEmptySnapshot = Array.isArray(payload?.entries) && payload.entries.length === 0;
        const time = Number(payload?.clearedAt ?? (oldEmptySnapshot ? payload.savedAt : 0));
        return Number.isFinite(time) && time > 0 ? time : 0;
    }

    getLegacyTranslationCacheReceipt(payload) {
        return {
            fingerprint: sha256Hex(JSON.stringify(payload) ?? "undefined"),
            savedAt: Number(payload?.savedAt) || 0
        };
    }

    readTranslationCacheForMigration(storeName) {
        try {
            return { payload: this.plugin.settingsStore.readDataStore(storeName, CACHE_DATA_KEY) };
        }
        catch (error) {
            const legacy = storeName === PLUGIN_NAME;
            if (!legacy) this.plugin.dataLoadFailures.add(CACHE_DATA_KEY);
            this.plugin.recordDataIoFailure("load", legacy ? `legacy:${CACHE_DATA_KEY}` : CACHE_DATA_KEY, error);
            return null;
        }
    }

    migrateLegacyTranslationCache() {
        const storeName = this.plugin.getDataStoreName(CACHE_DATA_KEY);
        if (storeName === PLUGIN_NAME) return "not-separated";
        const storage = this.plugin.settingsStore;
        const legacyRead = this.readTranslationCacheForMigration(PLUGIN_NAME);
        if (!legacyRead) return "legacy-unreadable";
        const legacy = legacyRead.payload;
        if (legacy === null || legacy === undefined) return "none";
        this.cacheNeedsReload = true;
        const currentRead = this.readTranslationCacheForMigration(storeName);
        if (!currentRead) return "store-unreadable";
        const current = currentRead.payload;
        const hasCurrent = current !== null && current !== undefined;
        const receipt = this.getLegacyTranslationCacheReceipt(legacy);
        const previousCommit = current?.mergedLegacy;
        const committed = previousCommit ? previousCommit.fingerprint === receipt.fingerprint
            : (hasCurrent && this.getLegacyTranslationCacheReceipt(current).fingerprint === receipt.fingerprint);
        const payload = committed ? current : (hasCurrent ? this.mergePersistedTranslationCachePayloads(current, legacy, receipt) : legacy);
        if (!committed) {
            const expectedFingerprint = payload === legacy
                ? receipt.fingerprint
                : this.getLegacyTranslationCacheReceipt(payload).fingerprint;
            try {
                if (storage.writeDataStore(storeName, CACHE_DATA_KEY, payload) !== true) throw new Error("DATA_SAVE_FAILED");
            }
            catch (error) {
                this.plugin.recordDataIoFailure("save", CACHE_DATA_KEY, error);
                return "save-failed";
            }
            const readback = this.readTranslationCacheForMigration(storeName);
            if (!readback) return "store-unreadable";
            if (readback.payload === null || readback.payload === undefined
                || this.getLegacyTranslationCacheReceipt(readback.payload).fingerprint !== expectedFingerprint) {
                this.plugin.recordDataIoFailure("save", CACHE_DATA_KEY, new Error("DATA_SAVE_VERIFICATION_FAILED"));
                return "save-failed";
            }
        }
        if (payload === legacy || (committed && !payload?.mergedLegacy)) this.unmarkedLegacyCommit = receipt;
        const latestLegacy = this.readTranslationCacheForMigration(PLUGIN_NAME);
        if (!latestLegacy) return "legacy-unreadable";
        if (latestLegacy.payload === null || latestLegacy.payload === undefined
            || this.getLegacyTranslationCacheReceipt(latestLegacy.payload).fingerprint !== receipt.fingerprint) return "legacy-changed";
        try {
            if (storage.deleteDataStoreKey(PLUGIN_NAME, CACHE_DATA_KEY) !== true) throw new Error("DATA_DELETE_FAILED");
        }
        catch (error) {
            this.plugin.recordDataIoFailure("save", `legacy:${CACHE_DATA_KEY}`, error);
            return "delete-failed";
        }
        try {
            this.plugin.logDiagnostic("data.migrate", "ok", { key: CACHE_DATA_KEY, merged: hasCurrent });
        }
        catch {}
        return hasCurrent ? "merged" : "migrated";
    }

    mergePersistedTranslationCachePayloads(current, legacy, legacyReceipt = null) {
        const now = Date.now();
        const decode = payload => {
            const entries = Array.isArray(payload) ? payload : payload?.entries;
            if (!Array.isArray(entries)) return null;
            const strings = Array.isArray(payload?.strings) ? payload.strings.map(value => String(value || "")) : [];
            const ttlMs = this.normalizeTranslationCacheTtlHours(payload?.ttlHours) * 60 * 60 * 1000;
            const savedBeforeKeySchema = this.isPreKeySchemaTranslationCachePayload(payload);
            return entries.map(entry => {
                const key = this.decodePersistedTranslationCacheKey(entry, strings);
                const value = this.decodePersistedTranslationCacheValue(entry, strings);
                if (!key || !value) return null;
                const createdAt = Number(entry?.createdAt ?? entry?.c ?? now);
                return {
                    key,
                    value,
                    createdAt,
                    recordedCreatedAt: Number(entry?.createdAt ?? entry?.c ?? payload?.savedAt) || 0,
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
        const receipt = legacyReceipt || this.getLegacyTranslationCacheReceipt(legacy);
        if (current?.mergedLegacy?.fingerprint === receipt.fingerprint) return current;
        const currentClearedAt = this.getPersistedTranslationCacheClearedAt(current);
        const legacyClearedAt = this.getPersistedTranslationCacheClearedAt(legacy);
        const previousLegacySave = Number(current?.mergedLegacy?.savedAt) || 0;
        if (legacyClearedAt > currentClearedAt) currentEntries = currentEntries.filter(item => item.recordedCreatedAt > legacyClearedAt);
        if (currentClearedAt >= legacyClearedAt && currentClearedAt) legacyEntries = legacyEntries.filter(item => item.recordedCreatedAt > currentClearedAt);
        if (previousLegacySave) legacyEntries = legacyEntries.filter(item => item.touchedAt >= previousLegacySave);
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
            clearedAt: Math.max(currentClearedAt, legacyClearedAt),
            mergedLegacy: receipt,
            ttlHours: this.normalizeTranslationCacheTtlHours(current?.ttlHours ?? legacy?.ttlHours),
            maxEntries: Number(current?.maxEntries || legacy?.maxEntries || 0) || this.getTranslationCacheMaxEntries(),
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
            return !meta.volatile && !this.isVolatileTranslationCacheKey(key);
        }).map(([key, value]) => {
            const meta = this.plugin.translationCacheMeta.get(key) || {};
            const entry = {
                k: encodeKey(key),
                v: encodeValue(value),
                c: Number(meta.createdAt || Date.now()),
                t: Number(meta.touchedAt || Date.now()),
                e: this.getTranslationCacheEntryExpiresAt(meta)
            };
            // Saved before 0.4.0 and not moved to its current key yet.
            if (this.legacyKeys.has(key)) entry.l = 1;
            return entry;
        });
        return {
            version: 3,
            keySchema: TRANSLATION_CACHE_KEY_SCHEMA,
            savedAt: Date.now(),
            clearedAt: this.clearedAt,
            ...(this.mergedLegacy ? { mergedLegacy: this.mergedLegacy } : {}),
            ttlHours: this.normalizeTranslationCacheTtlHours(this.plugin.settings.ui?.translationCacheTtlHours),
            maxEntries: this.getTranslationCacheMaxEntries(),
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
        this.ctx.unrefTimer(this.plugin.translationCacheDirtyTimer);
    }

    flushTranslationCache(options = {}) {
        if (!this.plugin.translationCacheDirty) return true;
        if (!options.scheduled) this.plugin.cancelHeavyPersistenceIdle("cache");
        if (options.scheduled && this.plugin.shouldDeferHeavyPersistence("cache")) {
            this.plugin.scheduleTranslationCachePersist(HEAVY_PERSISTENCE_DEFER_MS);
            return true;
        }
        this.plugin.cancelHeavyPersistenceIdle("cache");
        if (this.plugin.translationCacheDirtyTimer) {
            clearTimeout(this.plugin.translationCacheDirtyTimer);
            this.plugin.translationCacheDirtyTimer = null;
        }
        this.plugin.translationCacheDirtyAt = 0;
        try {
            if (!this.prepareTranslationCacheWrite()) throw new Error("DATA_LOAD_FAILED");
            this.pruneTranslationCache({ scanExpired: true });
            const payload = this.createPersistedTranslationCachePayload();
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
        if (!this.prepareTranslationCacheWrite()) {
            this.plugin.showToast(this.plugin.formatError(new Error("DATA_LOAD_FAILED")), "error");
            return false;
        }
        const previousCache = new Map(this.plugin.translationCache);
        const previousMeta = new Map(this.plugin.translationCacheMeta);
        const previousStats = { ...this.plugin.translationCacheStats };
        const previousPersistentCount = this.plugin.persistentTranslationCacheCount;
        const previousDirty = this.plugin.translationCacheDirty;
        const previousDirtyAt = this.plugin.translationCacheDirtyAt;
        const previousLegacyKeys = this.legacyKeys;
        const previousPreEmojiSourceTexts = this.preEmojiSourceTexts;
        const previousClearedAt = this.clearedAt;
        this.plugin.cancelHeavyPersistenceIdle("cache");
        if (this.plugin.translationCacheDirtyTimer) {
            clearTimeout(this.plugin.translationCacheDirtyTimer);
            this.plugin.translationCacheDirtyTimer = null;
        }
        this.plugin.translationCacheDirtyAt = 0;
        this.plugin.translationCacheDirty = false;
        this.plugin.translationCache.clear();
        this.plugin.translationCacheMeta.clear();
        this.legacyKeys = new Set();
        this.preEmojiSourceTexts = new Map();
        this.clearedAt = Math.max(this.clearedAt, Date.now());
        this.invalidateTranslationCacheValueRefs();
        this.clearTranslationCacheNegativeLookups();
        this.plugin.translationCacheStats = { hits: 0, misses: 0 };
        this.plugin.persistentTranslationCacheCount = 0;
        try {
            if (this.plugin.saveData(CACHE_DATA_KEY, this.createPersistedTranslationCachePayload()) !== true) throw new Error("DATA_SAVE_FAILED");
            this.plugin.showToast(this.plugin.t("translationCacheCleared"), "success");
            return true;
        }
        catch (error) {
            this.plugin.translationCache = previousCache;
            this.plugin.translationCacheMeta = previousMeta;
            this.legacyKeys = previousLegacyKeys;
            this.preEmojiSourceTexts = previousPreEmojiSourceTexts;
            this.clearedAt = previousClearedAt;
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
        const ttlMs = this.getTranslationCacheTtlMs();
        let changed = false;
        for (const [key, meta] of this.plugin.translationCacheMeta) {
            const baseAt = Number(meta?.touchedAt || meta?.createdAt || now);
            const maxExpiresAt = baseAt + ttlMs;
            const currentExpiresAt = this.getTranslationCacheEntryExpiresAt(meta, now);
            if (!currentExpiresAt || currentExpiresAt <= maxExpiresAt) continue;
            this.plugin.translationCacheMeta.set(key, {
                ...meta,
                expiresAt: maxExpiresAt
            });
            changed = true;
        }
        if (changed) this.clearTranslationCacheNegativeLookups();
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
                if (this.isTranslationCacheEntryExpired(meta, now)) {
                    this.plugin.translationCache.delete(key);
                    this.plugin.translationCacheMeta.delete(key);
                    removed = true;
                }
            }
            this.pruneLegacyTranslationCacheKeys();
        }

        const cache = this.plugin.translationCache;
        const maxMessages = this.getTranslationCacheMaxEntries();
        const maxKeys = maxMessages * TRANSLATION_CACHE_MAX_KEYS_PER_MESSAGE;
        // Oldest keys go first; a message leaves the count once its last key is gone.
        while (cache.size > maxKeys || (cache.size > maxMessages && this.getTranslationCacheValueRefs().size > maxMessages)) {
            const oldestKey = cache.keys().next().value;
            this.deleteTranslationCacheEntry(oldestKey);
            this.plugin.translationCacheMeta.delete(oldestKey);
            removed = true;
        }
        if (removed) this.clearTranslationCacheNegativeLookups();
    }

    isTranslationCacheEntryExpired(meta, now = Date.now()) {
        const expiresAt = this.getTranslationCacheEntryExpiresAt(meta, now);
        if (!expiresAt) return false;
        return now > expiresAt;
    }

    getTranslationCacheEntryExpiresAt(meta, now = Date.now()) {
        const explicit = Number(meta?.expiresAt || 0);
        if (explicit > 0) return explicit;
        const createdAt = Number(meta?.createdAt || 0);
        if (!createdAt) return now + this.getTranslationCacheTtlMs();
        return createdAt + this.getTranslationCacheTtlMs();
    }

    getTranslationCacheTtlMs() {
        return this.normalizeTranslationCacheTtlHours(this.plugin.settings.ui?.translationCacheTtlHours) * 60 * 60 * 1000;
    }

    getTranslationCacheMaxEntries() {
        return this.normalizeTranslationCacheMaxEntries(this.plugin.settings.ui?.translationCacheMaxEntries);
    }
}

module.exports = { TranslationCacheStore };
