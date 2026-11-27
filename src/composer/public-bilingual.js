"use strict";

const {
    AUTO_LANGUAGE_VALUE,
    MANUAL_TRANSLATION_REQUEST_BUDGET,
    MODEL_REQUEST_TIMEOUT_MS,
    DIAGNOSTIC_MESSAGE_STATES,
    DIAGNOSTIC_REASON_CODES,
    DISCORD_MESSAGE_MAX_LENGTH,
    DEFAULT_SETTINGS
} = require("../constants");

const methods = {
    isPublicBilingualUseInitialOriginalEnabled() {
        return this.plugin.settings.ui?.publicBilingualUseInitialOriginal === true;
    },

    isPublicBilingualAfterPolishEnabled() {
        return this.plugin.settings.ui?.publicBilingualAfterPolish === true;
    },

    isPublicBilingualPolishBeforeTranslateEnabled() {
        return this.plugin.settings.ui?.publicBilingualPolishBeforeTranslate === true;
    },

    isPublicBilingualFeatureEnabled() {
        return this.plugin.settings.translation?.enabled !== false;
    },

    isPublicBilingualInputButtonEnabled() {
        return this.isPublicBilingualFeatureEnabled() && Boolean(this.plugin.settings.ui?.publicBilingualInputButton);
    },

    getPublicBilingualTargetLanguage() {
        return this.plugin.normalizeLanguageName(this.plugin.settings.polish?.targetLanguage || this.plugin.settings.translation?.targetLanguage);
    },

    getPublicBilingualBaseConfig() {
        const polish = this.plugin.settings.polish || {};
        const translation = this.plugin.settings.translation || {};
        const polishCandidate = {
            provider: polish.provider,
            apiKey: polish.apiKey ?? "",
            apiKeyOrigin: polish.apiKeyOrigin,
            endpoint: polish.endpoint ?? "",
            model: polish.model ?? "",
            region: polish.region ?? "",
            deeplPlan: polish.deeplPlan ?? "free",
            appId: polish.appId ?? "",
            secretKey: polish.secretKey ?? ""
        };
        const polishCredentialFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(polish.provider) || [];
        polishCredentialFields.forEach(field => {
            if (!field || Object.prototype.hasOwnProperty.call(polishCandidate, field)) return;
            polishCandidate[field] = polish[field] ?? "";
        });
        const polishAllowedForTranslation = Boolean(polish.provider)
            && this.plugin.isProviderAllowedForTask("translation", polish.provider);
        return polishAllowedForTranslation && this.plugin.hasUsableApiConfig("translation", polishCandidate, { isolatedConfig: true })
            ? polish
            : translation;
    },

    getPublicBilingualTranslationOptions() {
        const configOverrides = this.getPublicBilingualTranslationOverrides();
        return {
            mode: "public-bilingual",
            isolatedConfig: true,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("publicBilingual"),
            targetLanguage: this.getPublicBilingualTargetLanguage(),
            providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides, isolatedConfig: true }),
            requestContext: {},
            configOverrides
        };
    },

    getPublicBilingualTranslationOverrides() {
        const baseConfig = this.getPublicBilingualBaseConfig();
        const targetLanguageValue = this.getPublicBilingualTargetLanguage();
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);
        const model = String(baseConfig.model || "");
        const isReasoning = Boolean(baseConfig.enableThinking)
            || Boolean(this.plugin.isAlwaysReasoningModelName?.(model))
            || /(?:reasoner|\br1\b|qwq|qwen3|(?:^|\/)(?:o[134]|gpt-5)(?:[-_:]|$)|gemini-2\.5|gemini-3|glm-z1|thinking)/i.test(model);
        const maxTokens = Math.max(
            this.plugin.normalizeRequestNumber(baseConfig.maxTokens, DEFAULT_SETTINGS.translation.maxTokens, { min: 1, integer: true }),
            this.plugin.normalizeRequestNumber(this.plugin.settings.translation?.maxTokens, DEFAULT_SETTINGS.translation.maxTokens, { min: 1, integer: true }),
            isReasoning ? 4096 : 0
        );

        const overrides = {
            provider: baseConfig.provider,
            apiKey: baseConfig.apiKey ?? "",
            apiKeyOrigin: baseConfig.apiKeyOrigin,
            endpoint: baseConfig.endpoint ?? "",
            model: baseConfig.model ?? "",
            region: baseConfig.region ?? "",
            deeplPlan: baseConfig.deeplPlan ?? "free",
            appId: baseConfig.appId ?? "",
            secretKey: baseConfig.secretKey ?? "",
            sourceLanguage: AUTO_LANGUAGE_VALUE,
            targetLanguage,
            targetLanguageCode: this.plugin.getTargetLanguageCode(targetLanguageValue),
            temperature: 0,
            maxTokens,
            enableThinking: false,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("publicBilingual"),
            prompt: this.plugin.buildPromptPolicyPublicBilingualPrompt(targetLanguageValue)
        };
        const credentialFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(baseConfig.provider) || [];
        credentialFields.forEach(field => {
            if (!field || Object.prototype.hasOwnProperty.call(overrides, field)) return;
            overrides[field] = baseConfig[field] ?? "";
        });
        return overrides;
    },

    getPublicBilingualRetryOptions(sourceText, badOutput = "", options = this.getPublicBilingualTranslationOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);

        return {
            mode: "public-bilingual-retry",
            isolatedConfig: true,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("publicBilingualRetry"),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            requestContext: options.requestContext,
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("publicBilingualRetry"),
                prompt: this.plugin.buildPromptPolicyPublicBilingualRetryPrompt(sourceText, badOutput, options)
            }
        };
    },

    getPublicBilingualFinalFallbackOptions(sourceText, options = this.getPublicBilingualTranslationOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);

        return {
            mode: "public-bilingual-final",
            isolatedConfig: true,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("publicBilingualFinal"),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            requestContext: options.requestContext,
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("publicBilingualFinal"),
                prompt: this.plugin.buildPromptPolicyPublicBilingualFinalPrompt(sourceText, options)
            }
        };
    },

    restoreCustomEmojiTokensFromSource(sourceText, translatedText) {
        const source = String(sourceText || "");
        const output = String(translatedText || "");
        if (!source || !output || !source.includes("<") || !output.includes(":")) return output;
        const byName = new Map();
        for (const match of source.matchAll(/<a?:([A-Za-z0-9_~]{1,64}):\d+>/g)) {
            const name = match[1];
            const full = match[0];
            const prev = byName.get(name);
            if (!prev) byName.set(name, full);
            else if (prev !== full) byName.set(name, null);
        }
        const validNames = [...byName.entries()]
            .filter(([, token]) => Boolean(token))
            .map(([name]) => name)
            .sort((left, right) => right.length - left.length);
        if (!validNames.length) return output;
        const escapedNames = validNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
        const pattern = new RegExp(`<a?:[A-Za-z0-9_~]{1,64}:\\d+>|<t:\\d+(?::[A-Za-z])?>|(?<!<[aA]?):(${escapedNames}):(?!\\/\\/)`, "g");
        return output.replace(pattern, (full, name) => {
            if (!name) return full;
            return byName.get(name) || full;
        });
    },

    async runPublicBilingualTranslationTask(text, options = this.getPublicBilingualTranslationOptions()) {
        const requestBudget = options?.requestBudget
            || this.plugin.createAutoTranslationRequestBudget?.(MANUAL_TRANSLATION_REQUEST_BUDGET)
            || null;
        const baseConfig = this.getPublicBilingualBaseConfig();
        const usesPolishProfile = Boolean(this.plugin.settings?.polish && baseConfig === this.plugin.settings.polish);
        const resetFallbackContext = ctx => {
            if (ctx && typeof ctx === "object") delete ctx.fallbackProvider;
        };
        const targetLangForLength = this.plugin.getAutoTranslationTargetLanguage(options);
        const dynamicMaxTokens = String(text || "").length >= 420 && typeof this.plugin.getLongTextMaxTokensForLength === "function"
            ? this.plugin.getLongTextMaxTokensForLength(String(text || "").length, targetLangForLength)
            : 0;
        let lastSuccessfulMaxTokens = 0;
        const withEffectiveMaxTokens = attemptOptions => {
            const configured = Number(attemptOptions?.configOverrides?.maxTokens || DEFAULT_SETTINGS.translation.maxTokens);
            const targetMax = Math.max(configured, dynamicMaxTokens, lastSuccessfulMaxTokens);
            if (targetMax <= configured) return attemptOptions;
            return {
                ...attemptOptions,
                configOverrides: {
                    ...attemptOptions.configOverrides,
                    maxTokens: targetMax
                }
            };
        };
        const runAttempt = async (mode, rawAttemptOptions) => {
            const attemptOptions = withEffectiveMaxTokens(rawAttemptOptions);
            const execute = async (overrideMaxTokens = 0, timeoutMs = MODEL_REQUEST_TIMEOUT_MS, extraOptions = {}) => {
                if (requestBudget) this.plugin.consumeAutoTranslationRequestBudget({ requestBudget });
                resetFallbackContext(attemptOptions.requestContext);
                const overrides = overrideMaxTokens > 0
                    ? { ...attemptOptions.configOverrides, maxTokens: overrideMaxTokens }
                    : attemptOptions.configOverrides;
                return this.plugin.runModelTask("translation", text, {
                    configOverrides: overrides,
                    timeoutMs,
                    mode,
                    requestContext: attemptOptions.requestContext,
                    providerProfilePinned: true,
                    isolatedConfig: true,
                    ...(extraOptions.truncationRetry ? { truncationRetry: true } : {}),
                    ...(requestBudget ? { requestBudget } : {})
                });
            };
            const usedMax = Math.max(1, Number(attemptOptions?.configOverrides?.maxTokens || DEFAULT_SETTINGS.translation.maxTokens));
            let rawTranslated = "";
            try {
                rawTranslated = await execute(0, MODEL_REQUEST_TIMEOUT_MS);
                lastSuccessfulMaxTokens = Math.max(lastSuccessfulMaxTokens, usedMax);
            }
            catch (error) {
                if (!error?.modelOutputTruncated) throw error;
                const minRetry = Number(error.partialOutputLength || 0) === 0 ? 4096 : 2400;
                const raisedMax = Math.min(65536, Math.max(usedMax + 512, Math.ceil(usedMax * 2), minRetry));
                if (raisedMax <= usedMax) throw error;
                const retryTimeout = Math.min(90000, Math.max(MODEL_REQUEST_TIMEOUT_MS, Math.round(MODEL_REQUEST_TIMEOUT_MS * Math.min(2.5, raisedMax / Math.max(256, usedMax)))));
                rawTranslated = await execute(raisedMax, retryTimeout, { truncationRetry: true });
                lastSuccessfulMaxTokens = Math.max(lastSuccessfulMaxTokens, raisedMax);
            }
            const targetLang = this.plugin.getAutoTranslationTargetLanguage(attemptOptions);
            const restoredEmojis = this.restoreCustomEmojiTokensFromSource(text, rawTranslated);
            const sanitized = this.plugin.sanitizeAutoTranslationOutput(text, restoredEmojis, targetLang);
            return this.restoreCustomEmojiTokensFromSource(text, sanitized);
        };

        try {
            const translated = await runAttempt("public-bilingual", options);
            if (!this.plugin.isInvalidAutoTranslationOutput(text, translated, this.plugin.getAutoTranslationTargetLanguage(options))) return translated;

            const retryOptions = this.getPublicBilingualRetryOptions(text, translated, options);
            const retried = await runAttempt("public-bilingual-retry", retryOptions);
            if (!this.plugin.isInvalidAutoTranslationOutput(text, retried, this.plugin.getAutoTranslationTargetLanguage(retryOptions))) return retried;

            const finalOptions = this.getPublicBilingualFinalFallbackOptions(text, options);
            const finalText = await runAttempt("public-bilingual-final", finalOptions);
            if (!this.plugin.isInvalidAutoTranslationOutput(text, finalText, this.plugin.getAutoTranslationTargetLanguage(finalOptions))) return finalText;
        }
        catch (error) {
            if (error?.modelOutputTruncated && usesPolishProfile) {
                error.taskKind = "polish";
            }
            if (!this.plugin.isAutoTranslationRequestBudgetError?.(error)) throw error;
        }

        throw this.plugin.createFinalInvalidAutoTranslationError();
    },

    async getPublicBilingualTranslation(text, options = this.getPublicBilingualTranslationOptions(), behavior = {}) {
        const cacheKey = this.plugin.getTranslationCacheKey(text, options);
        // An explicit re-run asks for a new translation, so it skips the cached one.
        const cached = behavior.bypassCache ? null : this.plugin.getTranslationCacheValue(cacheKey, this.plugin.getTranslationCacheAliases(text, options));
        if (cached !== null) return { text: cached, cacheKey, cached: true };

        const translated = await this.runPublicBilingualTranslationTask(text, options);
        const usedFallback = Boolean(options.requestContext?.fallbackProvider);
        if (!usedFallback) this.plugin.setTranslationCache(cacheKey, translated);
        return { text: translated, cacheKey, cached: false, fallbackProvider: options.requestContext?.fallbackProvider || "" };
    },

    // Text inside ||…||. Outside code every "|" is escaped and the user's own escapes are kept; a
    // lone trailing "\" is doubled so it cannot escape the closing "||". Discord shows code literally,
    // so a backslash there would be visible: "||" inside code is split with a zero-width space instead.
    escapeDiscordSpoilerText(text) {
        return this.splitDiscordCodeSegments(text).map(segment => segment.code
            ? segment.text.replace(/\|(?=\|)/g, "|\u200b")
            : this.escapeDiscordPlainText(segment.text, { escapeEveryPipe: true })).join("");
    },

    // Visible translation: only "||" outside code could open a spoiler.
    escapeDiscordVisibleText(text) {
        return this.splitDiscordCodeSegments(text).map(segment => segment.code
            ? segment.text
            : this.escapeDiscordPlainText(segment.text, { escapeEveryPipe: false })).join("");
    },

    escapeDiscordPlainText(text, options = {}) {
        const value = String(text || "");
        let output = "";
        for (let index = 0; index < value.length; index++) {
            const char = value[index];
            if (char === "\\") {
                if (index + 1 < value.length) {
                    output += char + value[index + 1];
                    index++;
                }
                else {
                    output += "\\\\";
                }
                continue;
            }
            if (char === "|" && (options.escapeEveryPipe || value[index + 1] === "|")) {
                if (options.escapeEveryPipe) {
                    output += "\\|";
                }
                else {
                    output += "\\|\\|";
                    index++;
                }
                continue;
            }
            output += char;
        }
        return output;
    },

    // Splits Discord markdown into code (`inline`, ``inline``, ```fenced```) and plain segments.
    // A backslash escapes the next character outside code, so "\`" never opens a code span.
    splitDiscordCodeSegments(text) {
        const value = String(text || "");
        const segments = [];
        let plainStart = 0;
        let index = 0;
        while (index < value.length) {
            const char = value[index];
            if (char === "\\") {
                index += 2;
                continue;
            }
            if (char !== "`") {
                index++;
                continue;
            }
            let runEnd = index;
            while (value[runEnd] === "`") runEnd++;
            const close = this.findDiscordCodeClose(value, runEnd, runEnd - index);
            if (close < 0) {
                index = runEnd;
                continue;
            }
            if (index > plainStart) segments.push({ code: false, text: value.slice(plainStart, index) });
            const end = close + (runEnd - index);
            segments.push({ code: true, text: value.slice(index, end) });
            index = plainStart = end;
        }
        if (plainStart < value.length) segments.push({ code: false, text: value.slice(plainStart) });
        return segments;
    },

    findDiscordCodeClose(value, from, length) {
        let index = from;
        while (index < value.length) {
            const start = value.indexOf("`", index);
            if (start < 0) return -1;
            let end = start;
            while (value[end] === "`") end++;
            if (end - start === length && start > from) return start;
            index = end;
        }
        return -1;
    },

    formatPublicBilingualMessage(translated, original) {
        const translation = this.escapeDiscordVisibleText(String(translated || "").trim());
        return `${translation}\n\n||${this.getPublicBilingualSpoilerText(original)}||`;
    },

    getPublicBilingualReservedLength(original) {
        return `\n\n||${this.getPublicBilingualSpoilerText(original)}||`.length;
    },

    // Discord's spoiler rule is non-greedy and ignores backslashes, so a trailing "|" (written "\|")
    // would join the closing "||" and end the spoiler one character early: a zero-width space
    // separates them.
    getPublicBilingualSpoilerText(original) {
        const escaped = this.escapeDiscordSpoilerText(this.normalizeDraftRawText(original));
        return escaped.endsWith("|") ? `${escaped}\u200b` : escaped;
    },

    getPublicBilingualSpoilerOriginal(session, draft, translationSource = draft) {
        if (this.isPublicBilingualUseInitialOriginalEnabled() && (session?.originalRawText || session?.originalText)) {
            return session.originalRawText ?? session.originalText;
        }
        return translationSource || draft;
    },

    async preparePublicBilingualDraft(textbox, draft, options = {}) {
        const session = this.getPolishSession(textbox, draft);
        const mentionBaseline = session.originalRawText ?? session.originalText ?? draft;
        // Running bilingual again on its own output translates what the first run translated,
        // instead of nesting the bilingual text (and its spoiler) inside a new one.
        const isBilingualOutput = Boolean(session.lastBilingualRawText && session.lastBilingualSourceRawText)
            && this.areDraftTextsEqualStrict(draft, session.lastBilingualRawText);
        const baseDraft = isBilingualOutput ? this.normalizeDraftRawText(session.lastBilingualSourceRawText) : draft;
        let translationSource = baseDraft;
        let usedPolish = false;
        let skippedPolish = false;
        const hasLifecycleToken = options.lifecycleToken !== undefined && options.lifecycleToken !== null;
        const writeToken = options.writeToken || null;

        if (!options.skipAutoPolish && this.isPublicBilingualPolishBeforeTranslateEnabled()) {
            if (!this.plugin.settings.polish.enabled) {
                skippedPolish = true;
            }
            else if (!this.isPolishSessionAlreadyPolished(session, baseDraft)) {
                const sourceText = this.getPolishSourceText(session) || draft;
                const result = await this.runPolishWithGuards(sourceText, {
                    chineseScriptOnly: true,
                    isStillCurrent: () => (!hasLifecycleToken || this.plugin.isLifecycleTokenCurrent(options.lifecycleToken))
                        && (!writeToken || this.plugin.composerWriter.isWriteTokenCurrent(writeToken))
                });
                if (!String(result || "").trim()) throw new Error(this.plugin.t("emptyResult"));
                if (hasLifecycleToken && !this.plugin.isLifecycleTokenCurrent(options.lifecycleToken)) {
                    return { stale: true, lifecycleStale: true, session, translationSource: draft, spoilerOriginal: this.getPublicBilingualSpoilerOriginal(session, draft, draft), usedPolish, skippedPolish };
                }
                const sessionComposerKey = session.composerKey || this.getTextboxComposerKey(textbox);
                if ((writeToken && !this.plugin.composerWriter.isWriteTokenCurrent(writeToken))
                    || (options.routeKey !== undefined && options.routeKey !== this.plugin.getCurrentRouteKey())
                    || this.getPolishSessionForComposer(sessionComposerKey, textbox) !== session
                    || textbox?.isConnected === false
                    || !this.isCurrentDraftText(textbox, draft)) {
                    return { stale: true, session, translationSource: draft, spoilerOriginal: this.getPublicBilingualSpoilerOriginal(session, draft, draft), usedPolish, skippedPolish };
                }
                const polished = this.sanitizeComposerGeneratedOutput(mentionBaseline, result, "public-bilingual.polish");
                this.updatePolishSessionAfterResult(session, textbox, polished, false);
                translationSource = this.normalizeDraftRawText(polished);
                usedPolish = true;
            }
        }

        return {
            stale: false,
            session,
            translationSource,
            spoilerOriginal: this.getPublicBilingualSpoilerOriginal(session, baseDraft, translationSource),
            mentionBaseline,
            expectedCurrentText: draft,
            // A bilingual result already exists in this session, so this click asks for a fresh one.
            rerun: Boolean(session.lastBilingualRawText),
            usedPolish,
            skippedPolish
        };
    },

    async publicBilingualCurrentDraft(button = null, behaviorOptions = {}) {
        if (!this.isPublicBilingualFeatureEnabled()) {
            // The bilingual-after-polish step stays quiet; a direct click explains why nothing happens.
            if (!behaviorOptions.skipAutoPolish) this.plugin.showToast(this.plugin.t("translationDisabled"), "info");
            return { ok: false, wrote: false, reason: "disabled" };
        }
        const textbox = this.plugin.resolveInputActionTextbox(button, behaviorOptions);
        if (!textbox) {
            this.plugin.showToast(this.plugin.t("textboxMissing"), "error");
            return { ok: false, wrote: false, reason: "missing-textbox" };
        }
        const expectedComposerKey = behaviorOptions.composerKey || button?.dataset?.daitComposerKey || "";
        if (!this.plugin.isInputActionTextboxCurrent(textbox, expectedComposerKey)) {
            this.plugin.queueInputButtonScan({ delayMs: 120, trailing: true });
            this.plugin.showToast(this.plugin.t("composerChanged"), "info");
            return { ok: false, wrote: false, reason: "stale-composer" };
        }

        const draft = this.plugin.getTextboxDraftText(textbox);
        if (!this.plugin.normalizeExtractedText(draft)) {
            this.plugin.showToast(this.plugin.t("inputEmpty"), "info");
            return { ok: false, wrote: false, reason: "empty" };
        }

        const writeToken = this.plugin.composerWriter.beginWrite(textbox, draft);
        const composer = this.getTextboxComposerRoot(textbox);
        const requestId = behaviorOptions.polishRequestId ?? writeToken.id;
        if (behaviorOptions.polishRequestId === undefined) this.plugin.latestPolishRequestIds.set(composer, requestId);
        const isLatestRequest = () => this.plugin.latestPolishRequestIds.get(composer) === requestId && !this.isComposerWriteSuperseded(writeToken);
        const originRouteKey = this.plugin.getCurrentRouteKey();
        const originComposerKey = writeToken.composerKey;
        const ownsButtonBusy = !behaviorOptions.parentBusyToken;
        const buttonBusyToken = behaviorOptions.parentBusyToken || Symbol("daitButtonBusy");
        if (ownsButtonBusy) {
            if (button) button.__daitBusyToken = buttonBusyToken;
            this.plugin.setButtonBusy(button, true, this.plugin.t("publicBilingualBusy"));
        }
        else if (button && button.__daitBusyToken === buttonBusyToken) {
            this.plugin.setButtonBusy(button, true, this.plugin.t("publicBilingualBusy"));
        }
        const lifecycleToken = this.plugin.getLifecycleToken();
        const startedAt = Date.now();
        const requestOptions = this.getPublicBilingualTranslationOptions();
        this.plugin.logDiagnostic("public.bilingual", "start", {
            ...this.plugin.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.REQUEST_STARTED, {
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                targetKind: "composer",
                sourceHash: this.plugin.getStrongTextFingerprint(draft),
                textLength: String(draft || "").length
            }),
            sourceHash: this.plugin.getStrongTextFingerprint(draft),
            length: String(draft || "").length,
            targetLanguage: this.plugin.getAutoTranslationTargetLanguage(requestOptions)
        });
        try {
            const payload = await this.preparePublicBilingualDraft(textbox, draft, { ...behaviorOptions, lifecycleToken, writeToken, routeKey: originRouteKey });
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: false, stale: true, phase: "lifecycle" };
            }
            if (!isLatestRequest()) return { ok: false, wrote: false, stale: true, phase: "superseded" };
            if (payload.stale || !this.plugin.composerWriter.isWriteTokenCurrent(writeToken)) {
                this.plugin.logDiagnostic("public.bilingual", "stale-input", {
                    ...this.plugin.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.STALE_DOM, {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        targetKind: "composer",
                        sourceHash: this.plugin.getStrongTextFingerprint(draft),
                        textLength: String(draft || "").length
                    }),
                    sourceHash: this.plugin.getStrongTextFingerprint(draft),
                    phase: payload.lifecycleStale ? "lifecycle" : "polish",
                    ms: Date.now() - startedAt
                });
                if (payload.lifecycleStale) return { ok: false, wrote: false, stale: true, phase: "lifecycle" };
                this.plugin.showToast(this.plugin.t("publicBilingualInputChanged"), "info");
                return { ok: false, wrote: false, stale: true, phase: "polish" };
            }
            const reservedLength = this.getPublicBilingualReservedLength(payload.spoilerOriginal);
            if (reservedLength >= DISCORD_MESSAGE_MAX_LENGTH) {
                throw new Error(this.plugin.t("publicBilingualTooLong", { length: reservedLength, limit: DISCORD_MESSAGE_MAX_LENGTH }));
            }

            const result = await this.plugin.getPublicBilingualTranslation(payload.translationSource, requestOptions, { bypassCache: payload.rerun });
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: false, stale: true, phase: "lifecycle" };
            }
            if (!isLatestRequest()) return { ok: false, wrote: false, stale: true, phase: "superseded" };
            if (!String(result.text || "").trim()) throw new Error(this.plugin.t("emptyResult"));
            const safeSpoiler = this.sanitizeComposerGeneratedOutput(payload.mentionBaseline, payload.spoilerOriginal, "public-bilingual");
            const safeTranslation = this.sanitizeComposerGeneratedOutput(payload.mentionBaseline, result.text, "public-bilingual", safeSpoiler);
            const composed = this.formatPublicBilingualMessage(safeTranslation, safeSpoiler);
            if (composed.length > DISCORD_MESSAGE_MAX_LENGTH) {
                throw new Error(this.plugin.t("publicBilingualTooLong", { length: composed.length, limit: DISCORD_MESSAGE_MAX_LENGTH }));
            }
            const isSessionCurrent = (targetBox = textbox) => this.getPolishSessionForComposer(originComposerKey, targetBox) === payload.session;
            // The panel's "Insert into input" writes the result: record it like this run's own write,
            // so running bilingual again translates the source instead of nesting, and Restore works.
            const recordPanelInsert = target => {
                if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !isLatestRequest() || !isSessionCurrent(target)) return;
                const nextKey = this.getTextboxComposerKey(target);
                if (payload.session.composerKey && payload.session.composerKey !== nextKey) {
                    this.getPolishSessionsMap().delete(payload.session.composerKey);
                }
                payload.session.composerKey = nextKey;
                this.updatePolishSessionAfterBilingual(payload.session, target, composed, payload.translationSource, true);
                this.plugin.showRestoreOriginalControl(target, payload.session, button);
            };
            const staleReason = this.plugin.getCurrentRouteKey() !== originRouteKey || this.getTextboxComposerKey(textbox) !== originComposerKey
                ? "composer-changed"
                : this.plugin.getComposerWriteStaleReason(textbox, writeToken, payload.expectedCurrentText);
            if (staleReason) {
                this.plugin.logDiagnostic("public.bilingual", "stale-input", {
                    ...this.plugin.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.STALE_DOM, {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        targetKind: "composer",
                        sourceHash: this.plugin.getStrongTextFingerprint(draft),
                        textLength: String(draft || "").length
                    }),
                    sourceHash: this.plugin.getStrongTextFingerprint(draft),
                    cached: Boolean(result.cached),
                    phase: "translation",
                    reason: staleReason,
                    ms: Date.now() - startedAt
                });
                // A finished result is never dropped silently: offer it for Copy or Apply instead.
                this.plugin.showPolishResultPanel(this.getComposerResultPanelAnchor(textbox), composed, {
                    sourceButton: button,
                    panelKind: "public-bilingual",
                    title: this.plugin.t("publicBilingualButton"),
                    ariaLabel: this.plugin.t("publicBilingualTitleAttr", { targetLanguage: this.plugin.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }),
                    adjustTextboxSelection: false,
                    originRouteKey,
                    originComposerKey,
                    sourceText: draft,
                    onApplied: recordPanelInsert
                });
                this.plugin.showToast(this.plugin.t("composerResultHeld"), "info");
                return { ok: false, wrote: false, stale: true, phase: "translation", reason: staleReason, fallbackText: composed };
            }

            const writeResult = await this.plugin.composerWriter.replaceTextSafely(textbox, composed, {
                blurAfterReplace: false,
                extraBlurTarget: button,
                expectedPreviousText: payload.expectedCurrentText,
                writeToken
            });
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: Boolean(writeResult?.ok), stale: true, phase: "lifecycle" };
            }
            if (!isLatestRequest() || !isSessionCurrent()) {
                return { ok: false, wrote: Boolean(writeResult?.ok), stale: true, phase: "superseded" };
            }
            if (!writeResult.ok) {
                this.plugin.logDiagnostic("public.bilingual", "write-failed", {
                    ...this.plugin.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", "write-failed", {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                        targetKind: "composer",
                        sourceHash: this.plugin.getStrongTextFingerprint(draft),
                        textLength: String(draft || "").length
                    }),
                    sourceHash: this.plugin.getStrongTextFingerprint(draft),
                    reason: writeResult.reason || "",
                    cached: Boolean(result.cached),
                    ms: Date.now() - startedAt
                });
                this.plugin.showPolishResultPanel(textbox, composed, {
                    sourceButton: button,
                    panelKind: "public-bilingual",
                    title: this.plugin.t("publicBilingualButton"),
                    ariaLabel: this.plugin.t("publicBilingualTitleAttr", { targetLanguage: this.plugin.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }),
                    adjustTextboxSelection: false,
                    originRouteKey,
                    originComposerKey,
                    sourceText: draft,
                    onApplied: recordPanelInsert
                });
                // The draft changed under us (typing, a newer write): the result stays in the panel.
                const stale = ["write-cancelled", "stale-input", "superseded", "user-input"].includes(writeResult.reason);
                if (stale) {
                    this.plugin.showToast(this.plugin.t("composerResultHeld"), "info");
                }
                else {
                    this.plugin.showToast(this.plugin.t("publicBilingualFailed", { error: this.plugin.t("errorComposerWriteFailed") }), "error");
                }
                return { ok: false, wrote: false, stale, reason: writeResult.reason || "verification-failed", fallbackText: composed };
            }

            this.updatePolishSessionAfterBilingual(payload.session, textbox, composed, payload.translationSource, true);
            if (!writeResult.userEditedAfter) {
                this.plugin.showRestoreOriginalControl(textbox, payload.session, button);
            }
            this.plugin.logDiagnostic("public.bilingual", result.cached ? "cache-hit" : "success", {
                ...this.plugin.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", result.cached ? DIAGNOSTIC_REASON_CODES.CACHE_HIT : DIAGNOSTIC_REASON_CODES.RENDERED, {
                    messageState: result.cached ? DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT : DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                    targetKind: "composer",
                    sourceHash: this.plugin.getStrongTextFingerprint(draft),
                    textLength: String(draft || "").length
                }),
                cacheHash: this.plugin.getTextFingerprint(result.cacheKey),
                sourceHash: this.plugin.getStrongTextFingerprint(draft),
                translateHash: this.plugin.getStrongTextFingerprint(payload.translationSource),
                originalHash: this.plugin.getStrongTextFingerprint(payload.spoilerOriginal),
                autoPolished: Boolean(payload.usedPolish),
                polishSkipped: Boolean(payload.skippedPolish),
                ms: Date.now() - startedAt
            });
            return { ok: true, wrote: true, cacheKey: result.cacheKey, cached: Boolean(result.cached) };
        }
        catch (error) {
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: false, stale: true, phase: "lifecycle", error };
            }
            if (!isLatestRequest()) return { ok: false, wrote: false, stale: true, phase: "superseded" };
            this.plugin.logDiagnostic("public.bilingual", "error", {
                ...this.plugin.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.FAILURE, {
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    targetKind: "composer",
                    sourceHash: this.plugin.getStrongTextFingerprint(draft),
                    textLength: String(draft || "").length,
                    failureType: this.plugin.getAutoTranslationFailureType(error)
                }),
                sourceHash: this.plugin.getStrongTextFingerprint(draft),
                type: this.plugin.getAutoTranslationFailureType(error),
                ms: Date.now() - startedAt
            });
            this.plugin.showToast(this.plugin.t("publicBilingualFailed", { error: this.plugin.formatError(error) }), "error");
            return { ok: false, wrote: false, error };
        }
        finally {
            this.plugin.composerWriter.finishWriteToken(writeToken);
            if (ownsButtonBusy && this.plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                if (button) {
                    if (button.__daitBusyToken === buttonBusyToken) {
                        delete button.__daitBusyToken;
                        this.plugin.setButtonBusy(button, false, this.plugin.t("publicBilingualButton"));
                    }
                }
                else if (!this.plugin.composerWriter?.hasActiveWrite?.(textbox)) {
                    this.plugin.setButtonBusy(button, false, this.plugin.t("publicBilingualButton"));
                }
            }
        }
    }
};

module.exports = methods;
