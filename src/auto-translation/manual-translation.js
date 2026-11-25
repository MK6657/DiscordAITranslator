"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const {
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    DIAGNOSTIC_MESSAGE_STATES,
    TRANSLATION_VALIDATION_QUALITIES,
    DIAGNOSTIC_REASON_CODES,
    DEFAULT_SETTINGS
} = require("../constants");

class ManualTranslationController {
    constructor(plugin) {
        this.plugin = plugin;
        this.activeContentRuns = typeof WeakMap === "function" ? new WeakMap() : null;
    }
}

const methods = {
    resolveManualTranslationSource(messageNode, content, textOptions = null, fallbackText = "") {
        const domText = this.plugin.normalizeExtractedText(fallbackText || this.plugin.getElementText(content, textOptions));
        const candidates = [];
        const pushCandidate = (source, text, confidence = "normal") => {
            const value = this.plugin.normalizeExtractedText(text);
            if (!value) return;
            if (candidates.some(candidate => candidate.text === value && candidate.source === source)) return;
            candidates.push({ source, text: value, confidence, length: value.length });
        };

        pushCandidate("dom-content", domText, "dom");

        if (!textOptions?.includeReplyPreview) {
            try {
                for (const candidate of this.plugin.getMessageContentElements(messageNode) || []) {
                    pushCandidate("dom-message-content", this.plugin.getElementText(candidate), "dom");
                }
            }
            catch {}

            // Store text is display text and, as in auto translation, only a request text for a
            // content element that shows part of its message.
            const storeCandidate = this.getManualTranslationStoreSourceCandidate(messageNode, content, domText);
            if (this.plugin.isStoreFullRequestText(storeCandidate?.text, domText)) pushCandidate(storeCandidate.source, storeCandidate.text, storeCandidate.confidence || "store");
        }

        const selected = this.selectManualTranslationSourceCandidate(candidates, domText) || candidates[0] || { source: "dom-content", text: domText, length: domText.length };
        this.plugin.logDiagnostic("manual.source", selected.source === "dom-content" ? "dom" : "resolved", {
            source: selected.source,
            confidence: selected.confidence || "",
            selectedLength: String(selected.text || "").length,
            domLength: domText.length,
            candidateCount: candidates.length,
            candidateLengths: candidates.map(candidate => ({
                source: candidate.source,
                length: candidate.length,
                confidence: candidate.confidence
            })),
            selectedHash: this.plugin.getStrongTextFingerprint(selected.text || ""),
            domHash: this.plugin.getStrongTextFingerprint(domText)
        });
        return {
            text: selected.text || domText,
            domText,
            source: selected.source || "dom-content",
            confidence: selected.confidence || "",
            candidates
        };
    },

    getManualTranslationStoreSourceCandidate(messageNode, content, referenceText = "") {
        if (!messageNode || !content || this.plugin.isReplyPreviewElement(content)) return null;
        const route = this.plugin.messageTracker.getRouteIds?.() || {};
        const ids = this.plugin.messageTracker.getNodeMessageIds?.(messageNode) || {};
        const channelId = ids.channelId || route.channelId || "";
        if (!channelId) return null;
        const messageId = ids.messageId || "";
        const base = {
            channelId,
            messageId,
            authorId: this.plugin.messageTracker.getAuthorId?.(messageNode) || "",
            timestamp: this.plugin.messageTracker.getTimestamp?.(messageNode) || ""
        };
        try {
            const message = this.plugin.findBdfdbStoreMessageForCandidate({ messageNode, text: referenceText }, base);
            if (!message) return null;
            return {
                source: messageId ? "store-message-id" : "store-compatible-text",
                confidence: messageId ? "id" : "compatible",
                text: this.plugin.getDiscordStoreMessageText(message)
            };
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to read message store for manual translation source", error);
            return null;
        }
    },

    selectManualTranslationSourceCandidate(candidates = [], referenceText = "") {
        const values = candidates
            .map(candidate => ({
                ...candidate,
                text: this.plugin.normalizeExtractedText(candidate?.text || ""),
                length: this.plugin.normalizeExtractedText(candidate?.text || "").length
            }))
            .filter(candidate => candidate.text);
        if (!values.length) return null;

        const compatible = values.filter(candidate => this.isManualTranslationSourceCompatible(candidate.text, referenceText));
        const pool = compatible.length ? compatible : values.filter(candidate => candidate.confidence === "id");
        const list = pool.length ? pool : values;
        return list.reduce((best, candidate) => {
            if (!best) return candidate;
            const bestBonus = best.confidence === "id" ? 12 : 0;
            const candidateBonus = candidate.confidence === "id" ? 12 : 0;
            if (candidate.length + candidateBonus > best.length + bestBonus + 4) return candidate;
            return best;
        }, null);
    },

    isManualTranslationSourceCompatible(candidateText, referenceText = "") {
        const candidate = this.plugin.messageTracker.normalizeComparableText(candidateText);
        const reference = this.plugin.messageTracker.normalizeComparableText(referenceText);
        if (!candidate) return false;
        if (!reference) return true;
        if (candidate === reference) return true;
        if (candidate.includes(reference) || reference.includes(candidate)) return true;
        if (reference.length < 24) return false;
        const referenceTokens = new Set((reference.match(/[\p{L}\p{N}_:+.-]{2,}/gu) || []).map(token => token.toLocaleLowerCase()));
        const candidateTokens = new Set((candidate.match(/[\p{L}\p{N}_:+.-]{2,}/gu) || []).map(token => token.toLocaleLowerCase()));
        if (!referenceTokens.size || !candidateTokens.size) return false;
        let overlap = 0;
        referenceTokens.forEach(token => {
            if (candidateTokens.has(token)) overlap++;
        });
        return overlap / Math.max(1, referenceTokens.size) >= 0.75;
    },

    isManualTranslationSourceStillCurrent(plan) {
        const messageNode = plan?.messageNode;
        const content = plan?.content;
        if (!messageNode?.isConnected || !content?.isConnected || messageNode.contains?.(content) === false) return false;
        if (this.plugin.getCurrentRouteKey() !== plan.requestOptions.routeKey) return false;
        const messageId = this.plugin.messageTracker.getNodeMessageIds(messageNode)?.messageId || "";
        if (messageId !== plan.domMessageId) return false;
        this.plugin.elementTextCache?.delete(content);
        const currentText = this.plugin.normalizeExtractedText(this.plugin.getElementText(content, plan.textOptions));
        return Boolean(currentText)
            && currentText === this.plugin.normalizeExtractedText(plan.domText ?? plan.text)
            && this.plugin.getMessageIdentity(messageNode, content, currentText) === plan.requestOptions.messageIdentity;
    },

    beginManualTranslationRequest(content) {
        const token = ++this.plugin.manualTranslationRequestCounter;
        if (this.plugin.manualTranslationRequestTokens && content && (typeof content === "object" || typeof content === "function")) {
            this.plugin.manualTranslationRequestTokens.set(content, token);
        }
        return token;
    },

    isManualTranslationRequestCurrent(plan) {
        if (!plan?.requestToken) return true;
        if (!this.plugin.manualTranslationRequestTokens || !plan.content) return true;
        return this.plugin.manualTranslationRequestTokens.get(plan.content) === plan.requestToken;
    },

    isManualTranslationConfigCurrent(plan) {
        const options = plan?.requestOptions;
        if (!options) return true;
        const settings = this.plugin.settings.translation;
        if (!settings.enabled || options.targetLanguage !== settings.targetLanguage) return false;
        if (Number(options.version ?? this.plugin.autoTranslationConfigVersion) !== this.plugin.autoTranslationConfigVersion) return false;
        const providerKey = String(options.providerKey || "");
        return !providerKey || this.plugin.isAutoTranslationProviderSnapshotCurrent(providerKey, options);
    },

    // text is the request text; domText is what the message shows, which keys the message identity
    // and the line (as in auto translation, so both share cache entries).
    createManualTranslationPlan(messageNode, content, text, textOptions = null, sourceMeta = null) {
        const domText = sourceMeta?.domText ?? text;
        const requestOptions = this.plugin.withMessageIdentity(this.plugin.getManualTranslationRequestOptions(), messageNode, content, domText);
        const autoRequestOptions = this.plugin.withMessageIdentity(this.plugin.getAutoTranslationRequestOptionsForText(text, this.plugin.getAutoTranslationOptions()), messageNode, content, domText);
        const cacheKey = this.plugin.getTranslationCacheKey(text, requestOptions);
        const autoCacheKey = this.plugin.getTranslationCacheKey(text, autoRequestOptions);
        return {
            mode: "manual",
            messageNode,
            content,
            text,
            textOptions,
            requestOptions,
            autoRequestOptions,
            cacheKey,
            autoCacheKey,
            domText,
            domMessageId: this.plugin.messageTracker.getNodeMessageIds(messageNode)?.messageId || "",
            sourceKind: sourceMeta?.source || "dom-content",
            sourceConfidence: sourceMeta?.confidence || "",
            sourceHash: this.plugin.getStrongTextFingerprint(text),
            startedAt: Date.now(),
            lifecycleToken: this.plugin.getLifecycleToken(),
            requestToken: this.beginManualTranslationRequest(content)
        };
    },

    clearManualBlockingState(planOrCacheKey, requestOptions = null) {
        const plan = typeof planOrCacheKey === "object" && planOrCacheKey !== null ? planOrCacheKey : null;
        const cacheKey = plan?.autoCacheKey || plan?.cacheKey || String(planOrCacheKey || "");
        const options = plan?.autoRequestOptions || plan?.requestOptions || requestOptions || this.plugin.getAutoTranslationOptions();
        const servedKey = cacheKey && typeof this.plugin.getServedModelTranslationCacheKey === "function"
            ? this.plugin.getServedModelTranslationCacheKey(cacheKey, options)
            : "";
        const text = plan?.text || "";
        this.plugin.clearAutoTranslationFailure(cacheKey, options);
        if (servedKey && servedKey !== cacheKey) this.plugin.clearAutoTranslationFailure(servedKey, options);
        if (text) this.plugin.clearAutoTextTranslationFailure(text, options);
        this.plugin.clearAutoTranslationPendingTargets(cacheKey);
        this.plugin.removeQueuedAutoTranslationItem(cacheKey);
        // A kept partial result must not be drawn back over a manual retranslation.
        this.plugin.clearAutoTranslationPartialResult(cacheKey, plan?.cacheKey, servedKey !== cacheKey ? servedKey : "");
        if (plan?.cacheKey && plan.cacheKey !== cacheKey) {
            this.plugin.clearAutoTranslationFailure(plan.cacheKey, plan.requestOptions || options);
            this.plugin.clearAutoTranslationPendingTargets(plan.cacheKey);
            this.plugin.removeQueuedAutoTranslationItem(plan.cacheKey);
        }
        return true;
    },

    renderManualLoading(plan) {
        return this.plugin.renderTranslationLoading(plan.messageNode, plan.content, plan.cacheKey, plan.domText ?? plan.text);
    },

    removeManualTranslationLoading(plan) {
        if (!this.plugin.isManualTranslationRequestCurrent(plan)) return;
        this.plugin.removeTranslationNode(plan.messageNode, plan.content, { manualLoadingLine: plan.loadingLine });
    },

    runManualTranslationPlan(plan) {
        return this.runManualRescueTranslationPlan(plan);
    },

    getManualRescueAttemptOptions(plan, attemptName, previousOutput = "", previousReason = "", previousError = null) {
        let nextOptions = plan.requestOptions;
        if (attemptName === "manual-force-target") {
            nextOptions = this.plugin.getManualForceTargetTranslationOptions(plan.text, previousOutput, previousReason, plan.requestOptions);
        }
        else if (attemptName === "manual-repair") {
            nextOptions = this.plugin.getManualRepairTranslationOptions(plan.text, previousOutput, previousReason, plan.requestOptions);
        }
        if ((previousReason === "truncated" || previousError?.modelOutputTruncated) && attemptName !== "manual-normal") {
            const multiplier = attemptName === "manual-repair" ? 2.2 : 1.8;
            const raised = this.plugin.withRaisedAutoTranslationMaxTokens(nextOptions, plan.text, multiplier, previousError);
            nextOptions = {
                ...raised,
                truncationRetry: true,
                requestTimeoutMs: this.plugin.getTruncatedAutoTranslationRetryTimeoutMs(plan.requestOptions, raised, plan.text)
            };
        }
        return nextOptions;
    },

    // requestOptions is this attempt's own copy: a partial long result is recorded on it for
    // validation and for the partial note (longTextPartialInfo).
    async runManualRescueModelAttempt(plan, requestOptions, requestBudget = null) {
        if (this.plugin.isLongAutoTranslationText(plan.text)) {
            const taskOptions = {
                retryInvalidOutput: false,
                manualRescue: true,
                ...(requestBudget ? { requestBudget } : {})
            };
            const wholePass = await this.plugin.runManualLongTextWholePass(plan, requestOptions, taskOptions);
            if (wholePass !== null) return wholePass;
            const translated = await this.plugin.runAutoTranslationTask(plan.text, requestOptions, taskOptions);
            if (taskOptions.longTextPartial) {
                requestOptions.longTextPartial = true;
                requestOptions.longTextFailedChunks = Number(taskOptions.longTextFailedChunks || 0);
                requestOptions.longTextSuccessfulChunks = Number(taskOptions.longTextSuccessfulChunks || 0);
                if (taskOptions.longTextPartialInfo) requestOptions.longTextPartialInfo = taskOptions.longTextPartialInfo;
            }
            return translated;
        }
        this.plugin.consumeAutoTranslationRequestBudget({ requestBudget });
        return this.plugin.runAutoTranslationModelAttempt(plan.text, requestOptions, requestBudget ? { requestBudget } : {});
    },

    getManualRescueValidation(plan, translated, requestOptions) {
        return this.plugin.getAutoTranslationOutputValidationResult(
            plan.text,
            translated,
            this.plugin.getAutoTranslationTargetLanguage(requestOptions),
            this.plugin.getAutoTranslationOutputValidationOptions(plan.text, translated, requestOptions),
            requestOptions
        );
    },

    logManualRescueAttempt(plan, attemptName, attemptIndex, requestOptions, translated = "", validation = null, error = null) {
        const invalidReason = validation?.reasonCode || error?.autoTranslationInvalidReason || "";
        this.plugin.logDiagnostic("manual.rescue", "attempt", {
            ...this.plugin.getTranslationDiagnosticMeta("manual", {
                requestOptions,
                text: plan.text,
                cacheKey: plan.cacheKey,
                textOptions: plan.textOptions,
                messageState: validation?.renderable ? DIAGNOSTIC_MESSAGE_STATES.RENDERED : DIAGNOSTIC_MESSAGE_STATES.FAILED,
                reasonCode: validation?.renderable ? DIAGNOSTIC_REASON_CODES.RENDERED : DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                extra: error ? { failureType: this.plugin.getAutoTranslationFailureType(error) } : null
            }),
            key: this.plugin.getTextFingerprint(plan.cacheKey),
            sourceHash: plan.sourceHash,
            attemptName,
            attemptIndex,
            requestCount: attemptIndex + 1,
            invalidReason,
            validationQuality: validation?.quality || error?.autoTranslationValidationQuality || "",
            renderable: Boolean(validation?.renderable),
            cacheable: Boolean(validation?.cacheable),
            outputHash: translated ? this.plugin.getStrongTextFingerprint(translated) : "",
            outputLength: String(translated || "").length,
            failureType: error ? this.plugin.getAutoTranslationFailureType(error) : ""
        });
    },

    isManualRescueRetryableError(error) {
        return Boolean(error?.autoTranslationFinalInvalidOutput || error?.modelOutputTruncated);
    },

    // True when a manual partial result leaves out a smaller share of the message than the kept
    // one (or either share is unknown).
    isManualPartialResultBetter(manualInfo, keptInfo) {
        const missingShare = info => {
            const total = Number(info?.totalSegments || 0);
            return total > 0 && Array.isArray(info?.missingSegments) ? info.missingSegments.length / total : null;
        };
        const manualShare = missingShare(manualInfo);
        const keptShare = missingShare(keptInfo);
        if (manualShare === null || keptShare === null) return true;
        return manualShare < keptShare;
    },

    createManualRescueFailureError(reason = "invalid-output", validationQuality = "", attempts = []) {
        const error = this.plugin.createFinalInvalidAutoTranslationError(reason || "invalid-output", {
            terminal: false,
            validationQuality
        });
        error.message = this.plugin.t("manualTranslateRescueFailed");
        error.manualTranslationRescueFailed = true;
        error.manualRescueAttempts = attempts;
        return error;
    },

    async runManualRescueTranslationPlan(plan) {
        const attemptNames = ["manual-normal", "manual-force-target", "manual-repair"];
        const attempts = [];
        let previousOutput = "";
        let previousReason = "";
        let lastValidation = null;
        let lastError = null;
        // One click may cause at most this many model requests across all attempts and chunks.
        const requestBudget = this.plugin.createAutoTranslationRequestBudget(this.plugin.getManualTranslationRequestBudgetLimit(plan.text, plan.requestOptions));

        for (let index = 0; index < attemptNames.length; index++) {
            const attemptName = attemptNames[index];
            if (this.plugin.isAutoTranslationRequestBudgetExhausted(requestBudget)) {
                this.plugin.logDiagnostic("manual.rescue", "budget-exhausted", {
                    key: this.plugin.getTextFingerprint(plan.cacheKey),
                    sourceHash: plan.sourceHash,
                    attemptName,
                    requestCount: requestBudget.used
                });
                break;
            }
            const baseAttemptOptions = this.getManualRescueAttemptOptions(plan, attemptName, previousOutput, previousReason, lastError);
            const requestOptions = {
                ...baseAttemptOptions,
                requestContext: {}
            };
            let translated = "";
            let validation = null;
            try {
                translated = await this.plugin.runManualRescueModelAttempt(plan, requestOptions, requestBudget);
                validation = this.getManualRescueValidation(plan, translated, requestOptions);
                this.logManualRescueAttempt(plan, attemptName, index, requestOptions, translated, validation, null);
                attempts.push({
                    attemptName,
                    invalidReason: validation.reasonCode || "",
                    validationQuality: validation.quality || "",
                    renderable: Boolean(validation.renderable),
                    cacheable: Boolean(validation.cacheable)
                });
                if (validation.renderable) {
                    if (plan?.requestOptions?.requestContext && typeof plan.requestOptions.requestContext === "object") {
                        if (requestOptions.requestContext.fallbackProvider) {
                            plan.requestOptions.requestContext.fallbackProvider = requestOptions.requestContext.fallbackProvider;
                        }
                        else {
                            delete plan.requestOptions.requestContext.fallbackProvider;
                        }
                    }
                    return { translated, validation, requestOptions, attemptName, attempts };
                }
                previousOutput = String(translated || "");
                previousReason = validation.reasonCode || "invalid-output";
                lastValidation = validation;
                lastError = this.plugin.createFinalInvalidAutoTranslationError(previousReason, {
                    terminal: false,
                    validationQuality: validation.quality
                });
            }
            catch (error) {
                if (this.plugin.isAutoTranslationRequestBudgetError(error)) break;
                lastError = error;
                previousReason = error?.autoTranslationInvalidReason || error?.autoTranslationCancelReason || this.plugin.getAutoTranslationFailureType(error) || "invalid-output";
                this.logManualRescueAttempt(plan, attemptName, index, requestOptions, previousOutput, null, error);
                attempts.push({
                    attemptName,
                    invalidReason: previousReason,
                    validationQuality: error?.autoTranslationValidationQuality || "",
                    renderable: false,
                    cacheable: false,
                    failureType: this.plugin.getAutoTranslationFailureType(error)
                });
                if (!this.isManualRescueRetryableError(error)) throw error;
            }
        }

        const finalReason = previousReason || lastValidation?.reasonCode || lastError?.autoTranslationInvalidReason || "invalid-output";
        const finalQuality = lastValidation?.quality || lastError?.autoTranslationValidationQuality || "";
        throw this.createManualRescueFailureError(finalReason, finalQuality, attempts);
    },

    renderManualFailure(plan, error) {
        return this.plugin.renderTranslationError(plan.messageNode, plan.content, error, plan.cacheKey, plan.domText ?? plan.text);
    },

    // What a finished translation line shows, so a failed Retranslate can draw it again.
    getRestorableTranslationLineState(plan) {
        const line = this.plugin.getTranslationLine(plan.content);
        if (!line || line.classList?.contains?.("dait-translation-loading") || line.classList?.contains?.("dait-translation-error")) return null;
        const metadata = line.dataset || {};
        if ((metadata.daitSourceSig || metadata.daitSourceKey) && !this.plugin.isTranslationLineSourceMatch(line, plan.domText)) return null;
        if (metadata.daitCacheSig || metadata.daitCacheKey) {
            let options = this.plugin.isAutoTranslationCacheMode(metadata.daitMode) ? plan.autoRequestOptions : plan.requestOptions;
            if (metadata.daitMode === "auto-text") options = this.plugin.getAutoTextTranslationCacheOptions(options);
            const cacheKey = this.plugin.getTranslationCacheKey(plan.text, options);
            if (!this.plugin.isTranslationLineCacheMatch(line, cacheKey)
                && !this.plugin.isTranslationLineCacheMatch(line, cacheKey, this.plugin.getTranslationLineCacheAliases(plan.text, options))) return null;
        }
        const text = String(this.plugin.translationLineTexts?.get?.(line) ?? this.plugin.getTranslationLineRenderedText(line) ?? "");
        if (!text.trim()) return null;
        return {
            text,
            partial: line.classList?.contains?.("dait-translation-partial") === true,
            validationQuality: String(line.dataset?.daitValidationQuality || ""),
            validationReason: String(line.dataset?.daitValidationReason || ""),
            partialInfo: line.__daitPartialInfo || null
        };
    },

    restoreTranslationLineState(plan, state, keptAutoPartial = null) {
        // A kept auto partial that was on screen also goes back into memory for redraw.
        const partialInfo = state.partial
            ? ((keptAutoPartial?.translated === state.text ? keptAutoPartial.partialInfo : null) || state.partialInfo || null)
            : null;
        if (partialInfo && keptAutoPartial?.translated === state.text) {
            this.plugin.rememberAutoTranslationPartialResult(plan.autoCacheKey, plan.text, keptAutoPartial.translated, keptAutoPartial);
        }
        return this.plugin.renderTranslation(plan.messageNode, plan.content, state.text, plan.cacheKey, plan.domText ?? plan.text, {
            partial: state.partial,
            validationQuality: state.validationQuality,
            validationReason: state.validationReason,
            ...(partialInfo ? { partialInfo } : {})
        });
    },

    async translateMessage(messageNode, content, button, textOptions = null, translateOptions = {}) {
        if (!this.plugin.settings.translation.enabled) {
            this.plugin.showToast(this.plugin.t("translationDisabled"), "info");
            return;
        }

        this.plugin.elementTextCache?.delete(content);
        const initialText = this.plugin.getElementText(content, textOptions);
        if (!this.plugin.hasTranslatableMessageText(initialText)) {
            this.plugin.showToast(this.plugin.t("noTranslatableText"), "info");
            return;
        }
        // Translating again brings back a line the user hid.
        this.plugin.clearTranslationLineDismissal(messageNode, content, textOptions);

        const source = this.plugin.resolveManualTranslationSource(messageNode, content, textOptions, initialText);
        const text = source.text || initialText;
        if (this.plugin.isLowInformationRepeatedText(text)) {
            this.plugin.showToast(this.plugin.t("noTranslatableText"), "info");
            return;
        }
        const priorRun = content && this.activeContentRuns ? (this.activeContentRuns.get(content) || null) : null;
        const plan = this.plugin.createManualTranslationPlan(messageNode, content, text, textOptions, source);
        const requestOptions = plan.requestOptions;
        const cacheKey = plan.cacheKey;
        const startedAt = plan.startedAt;
        const lifecycleToken = plan.lifecycleToken;
        const releaseSupersededButton = () => {
            if (priorRun?.button && priorRun.button !== button && this.plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                this.plugin.setButtonBusy(priorRun.button, false, this.plugin.t("translateButton"));
            }
        };
        if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !this.plugin.isManualTranslationConfigCurrent(plan)
            || !this.plugin.isManualTranslationSourceStillCurrent(plan)) {
            releaseSupersededButton();
            return;
        }
        // Retranslate on a kept auto partial: that partial is drawn back unless the manual result
        // leaves out fewer parts of the message.
        const keptAutoPartial = this.plugin.getAutoTranslationPartialResult(plan.autoCacheKey, text);
        this.clearManualBlockingState(plan);
        this.plugin.logDiagnostic("manual.translate", "start", {
            ...this.plugin.getTranslationDiagnosticMeta("manual", {
                requestOptions,
                text,
                cacheKey,
                textOptions,
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                reasonCode: DIAGNOSTIC_REASON_CODES.REQUEST_STARTED
            }),
            key: this.plugin.getTextFingerprint(cacheKey),
            sourceHash: this.plugin.getStrongTextFingerprint(text),
            length: String(text || "").length,
            domLength: String(plan.domText || "").length,
            sourceKind: plan.sourceKind,
            sourceConfidence: plan.sourceConfidence
        });
        const cachedTranslation = translateOptions?.bypassCache
            ? null
            : this.plugin.getTranslationCacheValue(cacheKey, this.plugin.getTranslationCacheAliases(text, requestOptions));
        if (cachedTranslation !== null) {
            if (this.plugin.isInvalidAutoTranslationCacheValue(text, cachedTranslation, requestOptions)) {
                this.plugin.deleteTranslationCacheCandidates(cacheKey, ...this.plugin.getTranslationCacheAliases(text, requestOptions));
            }
            else {
                this.plugin.logDiagnostic("manual.translate", "cache-hit", {
                    ...this.plugin.getTranslationDiagnosticMeta("manual", {
                        requestOptions,
                        text,
                        cacheKey,
                        textOptions,
                        messageState: DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                        reasonCode: DIAGNOSTIC_REASON_CODES.CACHE_HIT
                    }),
                    key: this.plugin.getTextFingerprint(cacheKey),
                    ms: Date.now() - startedAt
                });
                this.plugin.syncManualTranslationToAutoCache(messageNode, content, text, cachedTranslation, textOptions, plan.domText);
                this.plugin.renderTranslation(messageNode, content, cachedTranslation, cacheKey, plan.domText);
                releaseSupersededButton();
                if (content && this.activeContentRuns) this.activeContentRuns.delete(content);
                if (button) this.plugin.setButtonBusy(button, false, this.plugin.t("translateButton"));
                return;
            }
        }

        // Retranslate replaces a line the user was reading: keep what it showed in case the new
        // request produces nothing usable.
        const previousLineState = translateOptions?.bypassCache
            ? (this.getRestorableTranslationLineState(plan)
                || (priorRun?.domText === plan.domText ? priorRun.previousLineState || null : null))
            : null;
        releaseSupersededButton();
        const runEntry = { button, previousLineState, domText: plan.domText };
        if (content && this.activeContentRuns) this.activeContentRuns.set(content, runEntry);
        plan.loadingLine = this.plugin.renderManualLoading(plan);
        this.plugin.setButtonBusy(button, true, this.plugin.t("translateBusy"));
        try {
            const manualResult = await this.plugin.runManualTranslationPlan(plan);
            const translated = manualResult && typeof manualResult === "object" && Object.prototype.hasOwnProperty.call(manualResult, "translated")
                ? manualResult.translated
                : manualResult;
            const resultRequestOptions = manualResult?.requestOptions || requestOptions;
            if (!this.plugin.isManualTranslationRequestCurrent(plan)) return;
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !this.plugin.isManualTranslationConfigCurrent(plan)) {
                this.removeManualTranslationLoading(plan);
                return;
            }
            if (!this.plugin.isManualTranslationSourceStillCurrent(plan)) {
                this.removeManualTranslationLoading(plan);
                this.plugin.logDiagnostic("manual.translate", "stale-dom", {
                    ...this.plugin.getTranslationDiagnosticMeta("manual", {
                        requestOptions,
                        text,
                        cacheKey,
                        textOptions,
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        reasonCode: DIAGNOSTIC_REASON_CODES.STALE_DOM
                    }),
                    key: this.plugin.getTextFingerprint(cacheKey),
                    ms: Date.now() - startedAt
                });
                return;
            }
            const validation = manualResult?.validation || this.plugin.getAutoTranslationOutputValidationResult(
                text,
                translated,
                this.plugin.getAutoTranslationTargetLanguage(resultRequestOptions),
                this.plugin.getAutoTranslationOutputValidationOptions(text, translated, resultRequestOptions),
                resultRequestOptions
            );
            if (!validation.renderable) {
                throw this.createManualRescueFailureError(validation.reasonCode || "invalid-output", validation.quality || "", manualResult?.attempts || []);
            }
            if (keptAutoPartial
                && validation.quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL
                && !this.isManualPartialResultBetter(resultRequestOptions.longTextPartialInfo, keptAutoPartial.partialInfo)) {
                this.plugin.rememberAutoTranslationPartialResult(plan.autoCacheKey, text, keptAutoPartial.translated, keptAutoPartial);
                this.plugin.renderTranslation(messageNode, content, keptAutoPartial.translated, cacheKey, plan.domText, {
                    partial: true,
                    validationQuality: keptAutoPartial.validationQuality || TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                    validationReason: keptAutoPartial.validationReason || "",
                    ...(keptAutoPartial.partialInfo ? { partialInfo: keptAutoPartial.partialInfo } : {})
                });
                this.plugin.logDiagnostic("manual.translate", "kept-auto-partial", {
                    key: this.plugin.getTextFingerprint(cacheKey),
                    ms: Date.now() - startedAt
                });
                return;
            }
            const usedProviderFallback = Boolean(resultRequestOptions.requestContext?.fallbackProvider);
            // The request may have detected the local model: the result belongs under the served model's key,
            // which the next lookup of this message builds.
            const resultCacheKey = this.plugin.getServedModelTranslationCacheKey(cacheKey, requestOptions);
            const renderedLine = this.plugin.renderTranslation(messageNode, content, translated, resultCacheKey, plan.domText, {
                partial: validation.quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || "",
                ...(resultRequestOptions.longTextPartialInfo ? { partialInfo: resultRequestOptions.longTextPartialInfo } : {})
            });
            if (renderedLine === null) {
                throw this.createManualRescueFailureError("emoji-restore-failed", validation.quality || "", manualResult?.attempts || []);
            }
            if (validation.cacheable && !usedProviderFallback) {
                this.plugin.setTranslationCache(resultCacheKey, translated);
                this.plugin.syncManualTranslationToAutoCache(messageNode, content, text, translated, textOptions, plan.domText);
            }
            this.plugin.rememberRecentAutoTranslationRender(plan.autoCacheKey, text, plan.autoRequestOptions, {
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || ""
            });
            this.plugin.logDiagnostic("manual.translate", "success", {
                ...this.plugin.getTranslationDiagnosticMeta("manual", {
                    requestOptions: resultRequestOptions,
                    text,
                    cacheKey,
                    textOptions,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                    reasonCode: DIAGNOSTIC_REASON_CODES.RENDERED
                }),
                key: this.plugin.getTextFingerprint(cacheKey),
                ms: Date.now() - startedAt,
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || "",
                cacheable: validation.cacheable && !usedProviderFallback,
                fallbackProvider: resultRequestOptions.requestContext?.fallbackProvider || ""
            });
        }
        catch (error) {
            if (!this.plugin.isManualTranslationRequestCurrent(plan)) return;
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !this.plugin.isManualTranslationConfigCurrent(plan)
                || !this.plugin.isManualTranslationSourceStillCurrent(plan)) {
                this.removeManualTranslationLoading(plan);
                return;
            }
            this.plugin.logDiagnostic("manual.translate", "error", {
                ...this.plugin.getTranslationDiagnosticMeta("manual", {
                    requestOptions,
                    text,
                    cacheKey,
                    textOptions,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    reasonCode: DIAGNOSTIC_REASON_CODES.FAILURE,
                    extra: { failureType: this.plugin.getAutoTranslationFailureType(error) }
                }),
                key: this.plugin.getTextFingerprint(cacheKey),
                type: this.plugin.getAutoTranslationFailureType(error),
                ms: Date.now() - startedAt
            });
            const silentManualFailure = Boolean(error?.manualTranslationRescueFailed || error?.autoTranslationFinalInvalidOutput);
            // The manual toast below already tells the user; do not repeat it as an auto-translate notice.
            if (!silentManualFailure) this.plugin.rememberTranslationAttentionNotice(error, this.plugin.getTranslationAttentionProviderKey(error, requestOptions));
            if (!error?.autoTranslationFinalInvalidOutput) this.plugin.markAutoTranslationProviderFailure(requestOptions, error);
            // A failed Retranslate puts back the line the user was reading and says why.
            if (silentManualFailure && previousLineState) {
                this.restoreTranslationLineState(plan, previousLineState, keptAutoPartial);
            }
            else if (silentManualFailure) this.removeManualTranslationLoading(plan);
            else this.renderManualFailure(plan, error);
            if (!silentManualFailure || translateOptions?.bypassCache) this.plugin.showToast(this.plugin.formatError(error), "error");
        }
        finally {
            if (content && this.activeContentRuns?.get(content) === runEntry) {
                this.activeContentRuns.delete(content);
            }
            if (this.plugin.isLifecycleTokenCurrent(lifecycleToken) && this.plugin.isManualTranslationRequestCurrent(plan)) {
                this.plugin.setButtonBusy(button, false, this.plugin.t("translateButton"));
            }
        }
    },

    syncManualTranslationToAutoCache(messageNode, content, text, translated, textOptions = null, domText = text) {
        if (!messageNode || !content || !text || !translated) return false;
        const requestOptions = this.plugin.withMessageIdentity(
            this.plugin.getAutoTranslationRequestOptionsForText(text, this.plugin.getAutoTranslationOptions()),
            messageNode,
            content,
            domText || text
        );
        if (this.plugin.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) return false;
        const cacheKey = this.plugin.getTranslationCacheKey(text, requestOptions);
        this.plugin.cacheAutoTranslationResultWithOptions(cacheKey, text, requestOptions, translated);
        const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
        if (providerKey) this.plugin.autoTranslationProviderFailures.delete(providerKey);
        this.plugin.clearAutoTranslationPendingTargets(cacheKey);
        this.plugin.logDiagnostic("manual.translate", "auto-cache-sync", {
            ...this.plugin.getTranslationDiagnosticMeta("manual", {
                requestOptions,
                text,
                cacheKey,
                textOptions,
                messageState: DIAGNOSTIC_MESSAGE_STATES.CACHED,
                reasonCode: DIAGNOSTIC_REASON_CODES.CACHE_HIT
            }),
            key: this.plugin.getTextFingerprint(cacheKey),
            sourceHash: this.plugin.getStrongTextFingerprint(text),
            preview: Boolean(textOptions?.includeReplyPreview)
        });
        if (this.plugin.isAutoTranslateEnabled()) this.plugin.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
        return true;
    },

    translateMessageFromContextTarget(target) {
        const messageNode = target?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        const content = messageNode ? this.plugin.getMessageContentElement(messageNode) : null;
        if (!messageNode || !content) {
            this.plugin.showToast(this.plugin.t("messageMissing"), "error");
            return;
        }

        this.plugin.translateMessage(messageNode, content);
    },

    getErrorSignalText(error) {
        const values = [
            error?.name,
            error?.code,
            error?.message,
            error?.cause?.name,
            error?.cause?.code,
            error?.cause?.message
        ];
        return values.map(value => String(value || "")).filter(Boolean).join(" ");
    },

    createApiError(response, raw = "") {
        const error = new Error("API_ERROR");
        error.status = Number(response?.status || 0);
        error.retryAfterMs = this.parseRetryAfterMs(response?.headers?.get?.("retry-after"));
        error.requestId = response?.headers?.get?.("x-request-id")
            || response?.headers?.get?.("cf-ray")
            || response?.headers?.get?.("x-ratelimit-request-id")
            || "";
        error.bodyHash = this.plugin.getTextFingerprint(String(raw || "").slice(0, 2000));
        try {
            const payload = JSON.parse(raw);
            const code = [payload?.error?.code, payload?.code, payload?.error?.type]
                .find(value => typeof value === "string" && /^[a-z0-9_.:-]{1,96}$/i.test(value));
            if (code) error.apiErrorCode = code;
        }
        catch {}
        return error;
    },

    annotateTranslateProviderApiError(error, raw = "", request = {}) {
        if (!error || !["microsoft", "deepl", "baidu"].includes(String(request?.provider || ""))) return error;
        error.providerKey = request.providerKey || "";
        // Decide by the HTTP status and whole words only: digits such as "456" also appear in
        // request ids. Baidu error codes arrive with HTTP 200 and are mapped by its parser.
        const status = Number(error.status || 0);
        const text = String(raw || "").slice(0, 4000);
        if (status === 456 || /\b(?:quota|limit exceeded|daily limit|monthly limit|character limit)\b/i.test(text)) {
            error.providerQuotaExceeded = true;
        }
        if (status === 401 || status === 403 || /\b(?:invalid (?:auth(?:entication)? )?key|unauthorized|forbidden)\b/i.test(text)) {
            error.providerAuthFailed = true;
        }
        if (status === 429 || /\b(?:too many requests|rate.?limit(?:ed)?)\b/i.test(text)) {
            error.providerRateLimited = true;
        }
        if (status >= 500) {
            error.providerServerError = true;
        }
        return error;
    },

    parseRetryAfterMs(value) {
        const text = String(value || "").trim();
        if (!text) return 0;
        const seconds = Number(text);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const date = Date.parse(text);
        return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
    },

    appendQueryParam(url, key, value) {
        const separator = String(url || "").includes("?") ? "&" : "?";
        return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    },

    normalizeRequestNumber(value, fallback, options = {}) {
        const number = Number(value);
        let normalized = Number.isFinite(number) ? number : Number(fallback);
        if (!Number.isFinite(normalized)) normalized = 0;
        if (options.integer) normalized = Math.round(normalized);
        if (typeof options.min === "number") normalized = Math.max(options.min, normalized);
        if (typeof options.max === "number") normalized = Math.min(options.max, normalized);
        return normalized;
    },

    getApiConfig(kind) {
        const config = this.plugin.getTaskConfig(kind);

        const apiKey = this.plugin.getEffectiveRequestApiKey(config);
        if (!apiKey) throw new Error(kind === "polish" ? this.plugin.t("apiKeyMissingPolish") : this.plugin.t("apiKeyMissingTranslation"));

        const endpoint = this.plugin.getEffectiveChatCompletionEndpoint(config, DEFAULT_SETTINGS[kind] || {});
        const model = this.plugin.getEffectiveChatCompletionModel(kind, config, DEFAULT_SETTINGS[kind] || {});
        if (!endpoint) throw new Error(this.plugin.t("endpointMissing"));
        if (this.plugin.isChatCompletionProvider(config) && !model) throw new Error(this.plugin.t("modelMissing"));

        return { config, endpoint, apiKey, model };
    },

    getLanguageInstruction(language, options = {}) {
        if (options.source && (!language || language === AUTO_LANGUAGE_VALUE)) return "auto-detect";
        const normalized = this.plugin.normalizeLanguageName(language);
        return this.plugin.getChineseLanguageInstruction(normalized) || normalized || (options.source ? "auto-detect" : "");
    },

    expandPrompt(prompt, targetLanguage) {
        return String(prompt || "")
            .replaceAll("{{targetLanguage}}", targetLanguage || "")
            .replaceAll("{targetLanguage}", targetLanguage || "");
    }
};

const MANUAL_TRANSLATION_METHOD_NAMES = attachControllerMethods(ManualTranslationController, [methods]);

module.exports = {
    ManualTranslationController,
    MANUAL_TRANSLATION_METHOD_NAMES
};
