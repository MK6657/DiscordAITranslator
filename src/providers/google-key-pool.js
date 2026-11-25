"use strict";

const {
    PROVIDER_DEFAULTS,
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_PROVIDER_FAILURE_TTL,
    GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS,
    LANGUAGE_PRESETS
} = require("../constants");

// Text shaped like a Google API key ("AIza" and at least 10 more key characters; real keys have 35).
const GOOGLE_API_KEY_PATTERN = /AIza[0-9A-Za-z_-]{10,}/;
const GOOGLE_TRANSLATE_PROTECT_PATTERNS = [
    /```[\s\S]*?```/g,
    /`[^`\n]+`/g,
    /https?:\/\/[^\s<>"']+/gi,
    /<a?:[A-Za-z0-9_~.-]+:\d{15,}>/g,
    /<[@#][!&]?\d{15,}>/g,
    /<@&\d{15,}>/g,
    /<t:\d{1,12}(?::[tTdDfFR])?>/g,
    /:[A-Za-z0-9_~.-]{2,}:/g,
    /\b[A-Za-z]:\\[^\s]+/g
];

const methods = {
    getGoogleTranslateKeys() {
        const normalized = this.plugin.normalizeGoogleTranslateKeyPool(this.plugin.settings.googleTranslate || {});
        this.plugin.settings.googleTranslate.keys = normalized.keys;
        this.plugin.settings.googleTranslate.keyPoolText = normalized.keyPoolText;
        this.plugin.settings.googleTranslate.usageById = normalized.usageById;
        return normalized.keys;
    },

    countGoogleTranslateChars(texts) {
        const values = Array.isArray(texts) ? texts : [texts];
        return values.reduce((sum, text) => sum + [...String(text || "")].length, 0);
    },

    peekGoogleTranslateAvailableKey(charCount = 1, options = {}) {
        return this.plugin.selectGoogleTranslateKey(charCount, { ...options, persist: false });
    },

    selectGoogleTranslateKey(charCount = 1, options = {}) {
        const now = Date.now();
        const storedKeys = Array.isArray(this.plugin.settings?.googleTranslate?.keys) ? this.plugin.settings.googleTranslate.keys : [];
        const keys = this.plugin.getGoogleTranslateKeys();
        const needed = Math.max(1, Math.round(Number(charCount) || 1));
        const available = keys.find(key => key.enabled !== false
            && (options.ignoreCooldown || Number(key.cooldownUntil || 0) <= now)
            && Number(key.usedChars || 0) + (options.ignoreReservations ? 0 : this.plugin.getGoogleTranslateReservedChars(key)) + needed <= Number(key.monthlyLimit || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT));
        if (available || options.persist === false) return available || null;
        const monthRolledOver = keys.some((key, index) => storedKeys[index]?.monthKey && storedKeys[index].monthKey !== key.monthKey);
        if (monthRolledOver) this.plugin.saveGoogleTranslateRuntimeState();
        return null;
    },

    getGoogleTranslateReservedChars(keyOrId) {
        const id = typeof keyOrId === "string" ? keyOrId : keyOrId?.id;
        return Math.max(0, Number(this.plugin.googleTranslateReservedChars.get(String(id || "")) || 0) || 0);
    },

    reserveGoogleTranslateKey(key, charCount = 0) {
        const id = String(key?.id || "");
        const chars = Math.max(0, Math.round(Number(charCount) || 0));
        if (!id || !chars) return null;
        this.plugin.googleTranslateReservedChars.set(id, this.plugin.getGoogleTranslateReservedChars(id) + chars);
        return { keyId: id, charCount: chars };
    },

    releaseGoogleTranslateReservation(reservation) {
        const id = String(reservation?.keyId || "");
        const chars = Math.max(0, Math.round(Number(reservation?.charCount) || 0));
        if (!id || !chars) return;
        const next = this.plugin.getGoogleTranslateReservedChars(id) - chars;
        if (next > 0) this.plugin.googleTranslateReservedChars.set(id, next);
        else this.plugin.googleTranslateReservedChars.delete(id);
    },

    reserveGoogleTranslateRequest(request) {
        const meta = request?.googleTranslate;
        if (request?.provider !== "googleCloud" || !meta || meta.reservation) return;
        const key = this.plugin.getGoogleTranslateKeys().find(item => item.id === meta.keyId || item.apiKey === meta.apiKey);
        const needed = Math.max(1, Math.round(Number(meta.charCount) || 1));
        if (!key || Number(key.usedChars || 0) + this.plugin.getGoogleTranslateReservedChars(key) + needed > Number(key.monthlyLimit || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT)) {
            throw this.plugin.createGoogleTranslateQuotaError({ charCount: needed, key });
        }
        meta.reservation = this.plugin.reserveGoogleTranslateKey(key, needed);
    },

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
    },

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
    },

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
    },

    formatGoogleTranslateCooldownMessage(until) {
        return this.plugin.t("googleTranslateKeysCooling", { time: this.plugin.formatDiagnosticSummaryTime(until) });
    },

    // Names the pool key a Google error came from (by its label, never the key itself).
    formatGoogleTranslateKeyError(error, options = {}) {
        const message = this.plugin.formatError(error, options);
        const keyId = String(error?.googleTranslateKeyId || "");
        const apiKey = String(error?.googleTranslateApiKey || "");
        if (!keyId && !apiKey) return message;
        const keys = this.plugin.getGoogleTranslateKeys();
        const key = keys.find(item => (keyId && item.id === keyId) || (apiKey && item.apiKey === apiKey));
        if (!key) return message;
        return this.plugin.t("googleTranslateKeyError", { label: this.plugin.getGoogleTranslateKeyDisplayLabel(key, keys), error: message });
    },

    // The name a pool key is shown by on screen (the error toast, the service card, the overview checklist, the
    // status). A label that looks like a Google key or holds a key of the pool (a key typed into the label field)
    // is replaced by the key's generated name, so a key never appears where others can see the screen.
    getGoogleTranslateKeyDisplayLabel(key, keys = this.plugin.getGoogleTranslateKeys()) {
        const index = keys.findIndex(item => item === key || (key?.id && item?.id === key.id));
        const generated = `Google ${Math.max(0, index) + 1}`;
        const label = String(key?.label || "").trim();
        if (!label || GOOGLE_API_KEY_PATTERN.test(label)) return generated;
        const holdsPoolKey = keys.some(item => {
            const apiKey = String(item?.apiKey || "").trim();
            return Boolean(apiKey) && (label === apiKey || (apiKey.length >= 8 && label.includes(apiKey)));
        });
        return holdsPoolKey ? generated : label;
    },

    // A failure of one pool key needs the user only when no other key can take over.
    isGoogleTranslatePoolServing(error) {
        if (!error?.googleTranslateApiKey || error.googleTranslateKeysCooling) return false;
        return Boolean(this.plugin.peekGoogleTranslateAvailableKey(1, { ignoreReservations: true }));
    },

    createGoogleTranslateNoKeyError() {
        const error = new Error(this.plugin.t("googleTranslateNoKey"));
        error.googleTranslateNoKey = true;
        error.providerKey = this.plugin.getGoogleTranslateProviderKey();
        error.retryAfterMs = AUTO_TRANSLATE_FAILURE_MAX_TTL;
        return error;
    },

    // Google Cloud resets monthly Translation quotas at midnight Pacific Time on the 1st of the month.
    getGoogleTranslateQuotaRetryAfterMs(now = Date.now()) {
        const dayMs = 24 * 60 * 60 * 1000;
        const maxRetryMs = 7 * dayMs;
        try {
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Los_Angeles",
                hourCycle: "h23",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            }).formatToParts(new Date(now));
            const part = type => Number(parts.find(item => item.type === type)?.value || 0);
            const year = part("year");
            const month = part("month");
            const day = part("day");
            const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
            const elapsedTodayMs = ((part("hour") % 24) * 3600 + part("minute") * 60 + part("second")) * 1000;
            const remainingMs = Math.max(0, daysInMonth - day) * dayMs + (dayMs - elapsedTodayMs) + 5 * 60 * 1000;
            return Math.max(AUTO_TRANSLATE_FAILURE_MAX_TTL, Math.min(remainingMs, maxRetryMs));
        }
        catch {
            const date = new Date(now);
            const nextMonth = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 8, 5, 0, 0);
            return Math.max(AUTO_TRANSLATE_FAILURE_MAX_TTL, Math.min(nextMonth - now, maxRetryMs));
        }
    },

    releaseGoogleTranslateRequestReservation(request) {
        this.plugin.releaseGoogleTranslateReservation(request?.googleTranslate?.reservation);
        if (request?.googleTranslate) request.googleTranslate.reservation = null;
    },

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
    },

    saveGoogleTranslateRuntimeState() {
        this.plugin.scheduleGoogleTranslateRuntimeStatePersist();
        return true;
    },

    scheduleGoogleTranslateRuntimeStatePersist(delayMs = GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS) {
        const delay = Math.max(0, Number(delayMs) || 0);
        const persistAt = Date.now() + delay;
        this.plugin.googleTranslateRuntimeDirty = true;
        if (this.plugin.googleTranslateRuntimeDirtyTimer && this.plugin.googleTranslateRuntimeDirtyAt && this.plugin.googleTranslateRuntimeDirtyAt <= persistAt) return;
        if (this.plugin.googleTranslateRuntimeDirtyTimer) clearTimeout(this.plugin.googleTranslateRuntimeDirtyTimer);
        this.plugin.googleTranslateRuntimeDirtyAt = persistAt;
        this.plugin.googleTranslateRuntimeDirtyTimer = setTimeout(() => this.plugin.flushGoogleTranslateRuntimeState(), delay);
        this.plugin.unrefTimer(this.plugin.googleTranslateRuntimeDirtyTimer);
    },

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
    },

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
    },

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
    },

    markGoogleTranslateKeyFailure(apiKey, error, options = {}) {
        const keyHash = this.plugin.getTextFingerprint(String(apiKey || "").trim());
        const type = this.plugin.getAutoTranslationFailureType(error);
        const maxCooldownMs = this.plugin.getGoogleTranslateQuotaRetryAfterMs();
        const rawRetryAfterMs = Math.max(Number(error?.retryAfterMs || 0) || 0, options.retryAfterMs || (type === "rate-limit" ? 60000 : type === "auth" ? 30 * 60 * 1000 : 15000));
        const retryAfterMs = Math.min(maxCooldownMs, rawRetryAfterMs);
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
    },

    markGoogleTranslateProviderSuccess(request = null) {
        const providerKey = request?.providerKey || this.plugin.getGoogleTranslateProviderKey();
        if (providerKey) this.plugin.autoTranslationProviderFailures.delete(providerKey);
        this.plugin.autoTranslationProviderFailures.delete(this.plugin.getGoogleTranslateProviderKey());
        const currentConfig = this.plugin.getEffectiveTaskConfig("translation");
        if (this.plugin.isGoogleTranslateProvider(currentConfig)) {
            this.plugin.setApiRuntimeStatus("translation", "success", this.plugin.t("apiStatusSuccess"));
        }
    },

    getGoogleLanguageCode(language, options = {}) {
        if (options.source && (!language || language === AUTO_LANGUAGE_VALUE)) return "";
        const normalized = this.plugin.normalizeLanguageName(language);
        const legacyCodes = {
            "汉语": "zh-CN",
            "中文": "zh-CN",
            "简体中文": "zh-CN",
            "繁体中文": "zh-TW",
            "繁體中文": "zh-TW",
            "英语": "en",
            "西班牙语": "es",
            "法语": "fr",
            "印地语": "hi",
            "俄语": "ru",
            "德语": "de",
            "日语": "ja",
            "阿拉伯语": "ar",
            "越南语": "vi",
            "朝鲜语": "ko",
            "韩语": "ko",
            "意大利语": "it",
            // Legacy GBK-decoded config values migrated from early pre-release settings
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
        const bcpMatch = value.match(/^([A-Za-z]{2,3})([-_][A-Za-z0-9]+)?$/);
        if (bcpMatch) {
            const primary = bcpMatch[1].toLowerCase();
            const subtag = bcpMatch[2] ? bcpMatch[2].replace("_", "-") : "";
            if (primary === "zh" && !subtag) return "zh-CN";
            return `${primary}${subtag}`;
        }
        // LLM instruction labels end with the code, e.g. "Spanish (Español, es)". Prefer that
        // explicit code; \b alone treats ñ/ç/ế as boundaries and finds "ol" in "Español".
        const explicit = value.match(/[(,]\s*([a-z]{2,3}(?:-[A-Za-z0-9]+)?)\s*\)/);
        const embedded = explicit || value.match(/(?<![\p{L}\p{N}_-])([a-z]{2,3}(?:-[A-Za-z0-9]+)?)(?![\p{L}\p{N}_-])/u);
        if (embedded?.[1]) return embedded[1] === "zh" ? "zh-CN" : embedded[1];
        return value;
    },

    // The raw target of a request for direct translation APIs, resolved from the user's
    // language setting rather than from the LLM instruction text.
    getTargetLanguageCode(language) {
        if (!language || language === AUTO_LANGUAGE_VALUE) return "";
        return this.plugin.getGoogleLanguageCode(language);
    },

    getCurrentMonthKey(date = new Date()) {
        const target = date instanceof Date ? date : new Date(date);
        try {
            const parts = new Intl.DateTimeFormat("en-US", {
                timeZone: "America/Los_Angeles",
                year: "numeric",
                month: "2-digit"
            }).formatToParts(target);
            const year = parts.find(item => item.type === "year")?.value || "";
            const month = parts.find(item => item.type === "month")?.value || "";
            if (year && month) return `${year}-${month.padStart(2, "0")}`;
        }
        catch {}
        const year = target.getUTCFullYear();
        const month = String(target.getUTCMonth() + 1).padStart(2, "0");
        return `${year}-${month}`;
    },

    normalizeGoogleTranslateMonthlyLimit(value, fallback = GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT) {
        const number = Number(value);
        const normalized = Number.isFinite(number) && number > 0 ? Math.round(number) : Number(fallback);
        return Math.min(GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT, Math.max(1, normalized || GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT));
    },

    parseGoogleTranslateKeyPoolText(text, existingKeys = []) {
        const existingByKey = new Map((existingKeys || []).map(entry => [String(entry?.apiKey || "").trim(), entry]));
        return String(text || "")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean)
            .map((line, index) => {
                const parts = line.split(/[|\t]/).map(part => part.trim());
                while (parts.length > 1 && !parts[parts.length - 1]) parts.pop();
                let label = "";
                let apiKey = "";
                let monthlyLimit = "";
                // "KEY|limit" has no label: a whole number is never a Google key, so it is the monthly limit and
                // the key gets a generated label instead of being shown as one.
                if (parts.length === 2 && /^\d+$/.test(parts[1])) {
                    [apiKey, monthlyLimit] = parts;
                }
                else if (parts.length >= 2) {
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
    },

    formatGoogleTranslateKeyPoolText(keys = []) {
        return (keys || [])
            .filter(entry => String(entry?.apiKey || "").trim())
            .map(entry => [entry.label || "", entry.apiKey || "", entry.monthlyLimit || ""].map(value => String(value || "").trim()).join("|").replace(/\|+$/g, ""))
            .join("\n");
    },

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
    },

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
    },

    getGoogleTranslateProviderKey(key = null) {
        const apiKey = String(key?.apiKey || "").trim();
        return [
            "googleCloud",
            PROVIDER_DEFAULTS.googleCloud.endpoint,
            PROVIDER_DEFAULTS.googleCloud.model,
            apiKey ? this.plugin.getTextFingerprint(apiKey) : "pool"
        ].join("\n---\n");
    },

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
    },

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
    },

    protectGoogleTranslateText(text) {
        const source = String(text || "");
        const spans = [];
        for (const regex of GOOGLE_TRANSLATE_PROTECT_PATTERNS) {
            regex.lastIndex = 0;
            let match = null;
            while ((match = regex.exec(source)) !== null) {
                const value = String(match[0] || "");
                if (!value) continue;
                spans.push({ start: match.index, end: match.index + value.length, value });
                if (match.index === regex.lastIndex) regex.lastIndex++;
            }
        }

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
    },

    restoreGoogleTranslateText(text, tokens = []) {
        let output = String(text || "");
        if (!Array.isArray(tokens) || !tokens.length) return output;
        output = output.replace(/__\s*DAIT\s*_\s*KEEP\s*_\s*(\d{3})\s*__/gi, (full, rawIndex) => {
            const token = tokens[Number.parseInt(rawIndex, 10)];
            return token && token.value !== undefined ? String(token.value) : full;
        });
        tokens.forEach(token => {
            if (!token?.placeholder || token.value === undefined) return;
            if (/^__DAIT_KEEP_\d{3}__$/.test(token.placeholder) && !output.includes(token.placeholder)) return;
            if (output.includes(token.placeholder)) {
                output = output.split(token.placeholder).join(String(token.value));
            }
        });
        return output;
    }
};

module.exports = methods;
