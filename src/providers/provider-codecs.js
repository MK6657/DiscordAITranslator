"use strict";

const { AUTO_LANGUAGE_VALUE, AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL, DEFAULT_SETTINGS } = require("../constants");

const MD5_S = Object.freeze([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
]);
const MD5_K = Object.freeze(Array.from({ length: 64 }, (_, index) => Math.floor(4294967296 * Math.abs(Math.sin(index + 1))) >>> 0));

function encodeMd5Utf8Bytes(text) {
    const value = String(text ?? "");
    if (typeof TextEncoder === "function") return new TextEncoder().encode(value);
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

// Pure-JS RFC 1321 MD5 fallback for BetterDiscord's sandboxed renderer where node:crypto is unavailable.
function md5HexFallback(text) {
    const bytes = encodeMd5Utf8Bytes(text);
    const totalLen = (((bytes.length + 8) >>> 6) + 1) << 6;
    const padded = new Uint8Array(totalLen);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLen - 8, (bytes.length << 3) >>> 0, true);
    view.setUint32(totalLen - 4, (bytes.length >>> 29) >>> 0, true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;
    const words = new Int32Array(16);

    for (let offset = 0; offset < totalLen; offset += 64) {
        for (let j = 0; j < 16; j++) words[j] = view.getInt32(offset + j * 4, true);
        let a = a0;
        let b = b0;
        let c = c0;
        let d = d0;
        for (let i = 0; i < 64; i++) {
            let f = 0;
            let g = 0;
            if (i < 16) {
                f = (b & c) | ((~b) & d);
                g = i;
            }
            else if (i < 32) {
                f = (d & b) | ((~d) & c);
                g = (5 * i + 1) & 15;
            }
            else if (i < 48) {
                f = b ^ c ^ d;
                g = (3 * i + 5) & 15;
            }
            else {
                f = c ^ (b | (~d));
                g = (7 * i) & 15;
            }
            const temp = d;
            d = c;
            c = b;
            const sum = (a + f + MD5_K[i] + words[g]) | 0;
            const shift = MD5_S[i];
            b = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
            a = temp;
        }
        a0 = (a0 + a) | 0;
        b0 = (b0 + b) | 0;
        c0 = (c0 + c) | 0;
        d0 = (d0 + d) | 0;
    }

    const out = new Uint8Array(16);
    const outView = new DataView(out.buffer);
    outView.setInt32(0, a0, true);
    outView.setInt32(4, b0, true);
    outView.setInt32(8, c0, true);
    outView.setInt32(12, d0, true);
    let hex = "";
    for (let i = 0; i < 16; i++) hex += out[i].toString(16).padStart(2, "0");
    return hex;
}

const methods = {
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
    },

    buildGoogleTranslateRequest(input, config, options = {}) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const protectedPayloads = texts.map(text => this.plugin.protectGoogleTranslateText(text));
        const protectedTexts = protectedPayloads.map(payload => payload.text);
        const charCount = this.plugin.countGoogleTranslateChars(protectedTexts);
        const endpoint = this.getEffectiveProviderEndpoint({ provider: "googleCloud" });
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
    },

    buildMicrosoftTranslateRequest(input, config) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const endpoint = this.getEffectiveProviderEndpoint({ ...config, provider: "microsoft" });
        const apiKey = this.plugin.getEffectiveRequestApiKey(config);
        if (!endpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (!apiKey) throw new Error(this.plugin.t("apiKeyMissingTranslation"));
        const target = this.plugin.getMicrosoftLanguageCode(config.targetLanguageCode || config.targetLanguage);
        if (!target || target === AUTO_LANGUAGE_VALUE) throw new Error(this.plugin.t("targetLanguageDesc"));
        return {
            endpoint,
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
    },

    buildDeepLTranslateRequest(input, config) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const plan = this.plugin.normalizeDeepLPlan(config.deeplPlan);
        const endpoint = this.getEffectiveProviderEndpoint({ provider: "deepl", deeplPlan: plan });
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
    },

    buildBaiduTranslateRequest(input, config) {
        const texts = Array.isArray(input) ? input.map(text => String(text || "")) : [String(input || "")];
        const endpoint = this.getEffectiveProviderEndpoint({ ...config, provider: "baidu" });
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
    },

    normalizeDeepLPlan(value) {
        return String(value || "").trim() === "pro" ? "pro" : "free";
    },

    getMicrosoftLanguageCode(language, options = {}) {
        const code = this.plugin.getGoogleLanguageCode(language, options);
        if (options.source && (!code || code === AUTO_LANGUAGE_VALUE)) return "";
        if (code === "zh-CN") return "zh-Hans";
        if (code === "zh-TW") return "zh-Hant";
        return code;
    },

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
    },

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
    },

    md5HexFallback(text) {
        return md5HexFallback(text);
    },

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
        return md5HexFallback(value);
    },

    buildSystemPrompt(kind, config) {
        return this.plugin.buildPromptPolicySystemPrompt(kind, config);
    },

    isModelFinishReasonTruncated(reason) {
        return /^(?:length|truncated|incomplete|max_tokens|max_output_tokens|token_limit)$/i.test(String(reason || "").trim());
    },

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
    },

    createModelOutputTruncatedError(output = "", finishReason = "") {
        const error = new Error("MODEL_OUTPUT_TRUNCATED");
        error.modelOutputTruncated = true;
        error.autoTranslationInvalidReason = "truncated";
        error.retryAfterMs = AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL;
        error.partialOutputLength = String(output || "").trim().length;
        error.finishReason = String(finishReason || "");
        return error;
    },

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
    },

    parseGoogleTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseApiJson(raw);
        const translations = data?.data?.translations;
        if (!Array.isArray(translations) || !translations.length) throw new Error(this.plugin.t("emptyResult"));
        const restoreMaps = Array.isArray(options.restoreMaps) ? options.restoreMaps : [];
        const values = translations.map((item, index) => {
            const text = item?.translatedText;
            if (typeof text !== "string") return "";
            return this.plugin.restoreGoogleTranslateText(this.plugin.decodeHtmlEntities(text), restoreMaps[index]).trim();
        });
        if (values.some(value => !value)) throw new Error(this.plugin.t("emptyResult"));
        const count = Math.max(1, Math.round(Number(expectedCount) || 1));
        if (values.length < count) throw new Error(this.plugin.t("emptyResult"));
        const result = values.slice(0, count);
        if (options.asArray) return result;
        return count === 1 ? result[0] : JSON.stringify(result);
    },

    parseMicrosoftTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseProviderJson(raw, "microsoft");
        if (!Array.isArray(data) || !data.length) throw this.plugin.createProviderParseError("microsoft", this.plugin.t("emptyResult"));
        const values = data.map(item => Array.isArray(item?.translations) ? item.translations[0]?.text : undefined);
        return this.plugin.normalizeDirectTranslateParseResult("microsoft", values, expectedCount, options);
    },

    parseDeepLTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseProviderJson(raw, "deepl");
        const translations = data?.translations;
        if (!Array.isArray(translations) || !translations.length) throw this.plugin.createProviderParseError("deepl", this.plugin.t("emptyResult"));
        const values = translations.map(item => item?.text);
        return this.plugin.normalizeDirectTranslateParseResult("deepl", values, expectedCount, options);
    },

    parseBaiduTranslateResponse(raw, expectedCount = 1, options = {}) {
        const data = this.plugin.parseProviderJson(raw, "baidu");
        // 52000 is Baidu's "success" code.
        if (data?.error_code && String(data.error_code) !== "52000") {
            throw this.plugin.createBaiduTranslateError(data);
        }
        const results = data?.trans_result;
        if (!Array.isArray(results) || !results.length) throw this.plugin.createProviderParseError("baidu", this.plugin.t("emptyResult"));
        const rows = results.map(item => typeof item?.dst === "string" ? item.dst.trim() : "");
        if (rows.some(row => !row)) throw this.plugin.createProviderParseError("baidu", this.plugin.t("emptyResult"));
        const values = this.plugin.regroupBaiduTranslateRows(rows, expectedCount, options.rowCounts);
        return this.plugin.normalizeDirectTranslateParseResult("baidu", values, expectedCount, options);
    },

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
    },

    normalizeDirectTranslateParseResult(provider, values, expectedCount = 1, options = {}) {
        const count = Math.max(1, Math.round(Number(expectedCount) || 1));
        const normalized = (Array.isArray(values) ? values : [])
            .map(value => typeof value === "string" ? value.trim() : "");
        if (normalized.length < count || normalized.some(value => !value)) {
            throw this.plugin.createProviderParseError(provider, this.plugin.t("emptyResult"));
        }
        const result = normalized.slice(0, count);
        if (options.asArray) return result;
        return count === 1 ? result[0] : JSON.stringify(result);
    },

    createProviderParseError(provider, message = this.plugin.t("invalidJson")) {
        const error = new Error(message);
        error.providerParseFailed = true;
        error.provider = String(provider || "");
        return error;
    },

    parseProviderJson(raw, provider) {
        try {
            return this.plugin.parseApiJson(raw);
        }
        catch {
            throw this.plugin.createProviderParseError(provider, this.plugin.t("invalidJson"));
        }
    },

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
    },

    decodeHtmlEntities(text) {
        const value = String(text || "");
        if (!value || !value.includes("&")) return value;
        const named = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
        return value.replace(/&(?:#(\d+)|#x([0-9a-fA-F]+)|(amp|lt|gt|quot|apos));/gi, (full, dec, hex, entity) => {
            if (entity) return named[entity.toLowerCase()] || full;
            const code = dec ? Number.parseInt(dec, 10) : Number.parseInt(hex, 16);
            if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return full;
            try { return String.fromCodePoint(code); }
            catch { return full; }
        });
    },

    extractModelContent(content) {
        const raw = Array.isArray(content)
            ? content.map(part => {
                if (typeof part === "string") return part;
                const type = String(part?.type || "").trim().toLowerCase();
                if (["thinking", "reasoning", "thought", "redacted_thinking"].includes(type)) return "";
                const text = part?.text ?? part?.content;
                return typeof text === "string" ? text : "";
            }).join("")
            : typeof content === "string" ? content : "";
        return raw
            .replace(/<(think|thought|reasoning)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
            .replace(/<(think|thought|reasoning)\b[^>]*>[\s\S]*$/gi, "")
            .trim();
    },

    parseApiJson(raw) {
        try {
            return JSON.parse(raw);
        }
        catch {
            throw new Error(this.plugin.t("invalidJson"));
        }
    }
};

module.exports = methods;
