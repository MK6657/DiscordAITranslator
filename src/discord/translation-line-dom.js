"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const { I18N } = require("../i18n");
const {
    DISCORD_MESSAGE_NODE_SELECTOR,
    PROVIDER_ORDER,
    AUTO_TRANSLATE_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT,
    AUTO_TRANSLATE_ORPHAN_LOADING_REQUEUE_MS,
    API_ENDPOINT_ERROR_MESSAGE_KEYS,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    MESSAGE_BUTTON_VISIBILITY_ALWAYS,
    MESSAGE_BUTTON_VISIBILITY_HOVER,
    RTL_LANGUAGE_CODES,
    DIAGNOSTIC_MESSAGE_STATES,
    TRANSLATION_VALIDATION_QUALITIES,
    DIAGNOSTIC_REASON_CODES,
    LANGUAGE_PRESETS
} = require("../constants");
const { SETTINGS_TAB_TRANSLATE } = require("../settings/settings-schema");

class DiscordTranslationLineDomController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    removeAllAutoTranslationNodes() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        document.querySelectorAll(".dait-translation-line").forEach(/** @param {any} line */ line => {
            if (line.dataset?.daitMode === "manual") return;
            this.plugin.restoreTranslationSourceVisibility(this.plugin.getTranslationContentForLine(line));
            line.remove();
        });
    },

    parseProviderFallbackOrderText(value) {
        const raw = Array.isArray(value)
            ? value
            : String(value || "").split(/[\s,;|]+/);
        const seen = new Set();
        const order = [];
        const registry = this.plugin.providerLayer?.registry;
        raw.forEach(provider => {
            const normalized = String(provider || "").trim();
            if (!(registry?.has?.(normalized) || PROVIDER_ORDER.includes(normalized)) || seen.has(normalized)) return;
            seen.add(normalized);
            order.push(normalized);
        });
        return order;
    },

    formatProviderFallbackOrder(order = this.plugin.settings.ui?.providerFallbackOrder) {
        return this.parseProviderFallbackOrderText(order).join(", ");
    },

    normalizeMessageButtonVisibility(value) {
        return value === MESSAGE_BUTTON_VISIBILITY_HOVER
            ? MESSAGE_BUTTON_VISIBILITY_HOVER
            : MESSAGE_BUTTON_VISIBILITY_ALWAYS;
    },

    renderAutoTranslationResult(item, translated, resultMeta = {}) {
        if (!this.plugin.isAutoTranslationRenderRequestCurrent(item.requestOptions)) return;
        // A long message with failed chunks arrives with partialInfo: it is validated as partial,
        // never cached as complete, and drawn with its missing parts noted.
        const partialInfo = resultMeta?.partialInfo || null;
        const validationRequestOptions = partialInfo ? { ...item.requestOptions, longTextPartial: true } : item.requestOptions;
        translated = this.plugin.sanitizeAutoTranslationOutput(item.text, translated, this.plugin.getAutoTranslationTargetLanguage(item.requestOptions), this.plugin.getAutoTranslationOutputValidationOptions(item.text, translated, validationRequestOptions));
        const validation = this.plugin.getAutoTranslationOutputValidationResult(
            item.text,
            translated,
            this.plugin.getAutoTranslationTargetLanguage(item.requestOptions),
            this.plugin.getAutoTranslationOutputValidationOptions(item.text, translated, validationRequestOptions),
            validationRequestOptions
        );
        if (!validation.renderable) {
            const error = this.plugin.createFinalInvalidAutoTranslationError(validation.reasonCode || "invalid-output");
            this.plugin.logDiagnostic("auto.render", "reject-invalid-output", {
                key: this.plugin.getTextFingerprint(item?.cacheKey || ""),
                sourceHash: this.plugin.getStrongTextFingerprint(item?.text || ""),
                valueLength: String(translated || "").length,
                invalidReason: validation.reasonCode || "",
                validationQuality: validation.quality
            });
            error.autoTranslationValidationQuality = validation.quality;
            this.plugin.markAutoTranslationFailureSafely(item, error, { markProvider: false });
            return;
        }
        if (validation.quality !== TRANSLATION_VALIDATION_QUALITIES.GOOD) {
            this.plugin.logDiagnostic("auto.render", "validation-accepted", {
                key: this.plugin.getTextFingerprint(item?.cacheKey || ""),
                sourceHash: this.plugin.getStrongTextFingerprint(item?.text || ""),
                valueLength: String(translated || "").length,
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || "",
                cacheable: validation.cacheable
            });
        }

        const now = Date.now();
        const renderBlocked = this.plugin.translationRenderer.isRequestRenderBlocked(now);
        if (renderBlocked && validation.cacheable) {
            if (validation.cacheable && (this.plugin.hasCacheableAutoTranslationTarget(item) || (!this.plugin.hasInvalidAutoTranslationTarget(item) && this.plugin.shouldCacheAutoTranslationResultFromRequest(item)))) {
                this.plugin.cacheAutoTranslationResult(item, translated);
                this.plugin.cacheAutoTranslationIdentityUpgrades(item, translated);
            }
            const retryMs = Math.max(
                this.plugin.getAutoTranslationRenderPauseRemainingMs(now),
                this.plugin.getAutoTranslationViewportSettleRemainingMs(now),
                this.plugin.getAutoTranslationJumpCooldownRemainingMs(now),
                AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS
            );
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                item,
                DIAGNOSTIC_MESSAGE_STATES.CACHED,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                {
                    retryMs,
                    renderPaused: this.plugin.isAutoTranslationRenderPaused(now),
                    viewportSettling: this.plugin.isAutoTranslationViewportSettling(now),
                    jumpCoolingDown: this.plugin.isAutoTranslationJumpCoolingDown(now)
                }
            );
            this.plugin.scheduleAutoTranslationRetryScan(retryMs, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        let cacheable = false;
        let sawInvalidTarget = false;
        const upgradedCacheTargets = new Map();
        const targets = this.plugin.getAutoTranslationPendingTargets(item);
        try {
            targets.forEach(target => {
                try {
                    if (!target.messageNode.isConnected || !target.content.isConnected) {
                        this.logAutoTranslationRenderSkip(item, target, "disconnected");
                        return;
                    }
                    if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) {
                        // The message changed while it was translated. The result is still the
                        // translation of item.text, so it is cached below and not requested again.
                        this.plugin.removeAutoTranslationNode(target, item.cacheKey);
                        this.logAutoTranslationRenderSkip(item, target, "text-changed");
                        return;
                    }
                    const identityUpgrade = this.plugin.getAutoTranslationTargetIdentityUpgrade(target, item);
                    if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target, item) && !identityUpgrade) {
                        this.plugin.removeAutoTranslationNode(target, item.cacheKey);
                        this.logAutoTranslationRenderSkip(item, target, "identity-changed");
                        sawInvalidTarget = true;
                        return;
                    }
                    // The request may have detected the local model: the line carries the key the result is cached under.
                    const renderCacheKey = identityUpgrade?.cacheKey || this.plugin.getServedModelTranslationCacheKey(item.cacheKey, item.requestOptions);
                    if (identityUpgrade?.cacheKey) upgradedCacheTargets.set(identityUpgrade.cacheKey, identityUpgrade);
                    cacheable = true;
                    if (this.plugin.hasManualTranslationLine(target.content, this.plugin.getAutoTranslationTargetDomText(target))) {
                        this.logAutoTranslationRenderSkip(item, target, "manual-line");
                        return;
                    }
                    if (this.plugin.isElementVisibleInViewport(target.messageNode) && this.plugin.isElementVisibleInViewport(target.content)) {
                        this.plugin.queueAutoTranslationRenderTask({
                            kind: "request",
                            target,
                            translated,
                            cacheKey: renderCacheKey,
                            requestOptions: target?.requestOptions || item?.requestOptions,
                            priority: target.priority,
                            run: () => this.plugin.renderAutoTranslationRequestTarget(item, target, translated, validation, partialInfo ? { partialInfo } : {})
                        });
                    }
                    else {
                        this.logAutoTranslationRenderSkip(item, target, "outside-viewport");
                    }
                }
                catch (error) {
                    try { this.plugin.removeAutoTranslationNode(target, item.cacheKey); }
                    catch {}
                    this.plugin.warnSanitized("Failed to render auto translation target", error);
                }
            });
        }
        finally {
            this.plugin.clearAutoTranslationPendingTargets(item.cacheKey);
        }
        if (validation.cacheable && (cacheable || (!sawInvalidTarget && this.plugin.shouldCacheAutoTranslationResultFromRequest(item)))) {
            this.plugin.cacheAutoTranslationResult(item, translated);
            upgradedCacheTargets.forEach(upgrade => this.plugin.cacheAutoTranslationResultWithOptions(upgrade.cacheKey, item.text, upgrade.requestOptions, translated));
        }
        else if (!validation.cacheable && (cacheable || (!sawInvalidTarget && this.plugin.shouldCacheAutoTranslationResultFromRequest(item)))) {
            // Not cacheable, but kept in memory so a prefetched or rebuilt message is redrawn
            // instead of requested (and paid for) again.
            const partialMeta = {
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || "",
                partialInfo
            };
            this.plugin.rememberAutoTranslationPartialResult(item.cacheKey, item.text, translated, partialMeta);
            const servedCacheKey = this.plugin.getServedModelTranslationCacheKey(item.cacheKey, item.requestOptions);
            if (servedCacheKey !== item.cacheKey) this.plugin.rememberAutoTranslationPartialResult(servedCacheKey, item.text, translated, partialMeta);
            upgradedCacheTargets.forEach(upgrade => this.plugin.rememberAutoTranslationPartialResult(upgrade.cacheKey, item.text, translated, partialMeta));
        }
        if (this.plugin.isAutoTranslateEnabled()) {
            this.plugin.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
        }
    },

    renderAutoTranslationRequestTarget(item, target, translated, validation = null, resultMeta = {}) {
        const requestOptions = target?.requestOptions || item?.requestOptions;
        const validationResult = validation || this.plugin.getAutoTranslationOutputValidationResult(
            target?.text || item?.text || "",
            translated,
            this.plugin.getAutoTranslationTargetLanguage(requestOptions),
            this.plugin.getAutoTranslationOutputValidationOptions(target?.text || item?.text || "", translated, requestOptions),
            requestOptions
        );
        if (!this.plugin.isAutoTranslationRenderRequestCurrent(requestOptions)) {
            this.plugin.removeAutoTranslationLoadingNode(target, item?.cacheKey, { force: true });
            this.plugin.removeAutoTranslationNode(target, item?.cacheKey);
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey: item?.cacheKey, requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_REQUEST_STALE
            );
            return false;
        }
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
            this.logAutoTranslationRenderSkip(item, target, "disconnected");
            return false;
        }
        if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) {
            this.plugin.removeAutoTranslationNode(target, item.cacheKey);
            this.logAutoTranslationRenderSkip(item, target, "text-changed");
            return false;
        }
        const identityUpgrade = this.plugin.getAutoTranslationTargetIdentityUpgrade(target, item);
        if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target, item) && !identityUpgrade) {
            this.plugin.removeAutoTranslationNode(target, item.cacheKey);
            this.logAutoTranslationRenderSkip(item, target, "identity-changed");
            return false;
        }
        const renderCacheKey = identityUpgrade?.cacheKey || this.plugin.getServedModelTranslationCacheKey(item.cacheKey, item.requestOptions);
        if (identityUpgrade?.cacheKey && validationResult.cacheable) this.plugin.cacheAutoTranslationResultWithOptions(identityUpgrade.cacheKey, item.text, identityUpgrade.requestOptions, translated);
        const domText = this.plugin.getAutoTranslationTargetDomText(target);
        if (this.plugin.hasManualTranslationLine(target.content, domText)) {
            this.logAutoTranslationRenderSkip(item, target, "manual-line");
            return false;
        }
        if (!this.plugin.isElementVisibleInViewport(target.messageNode) || !this.plugin.isElementVisibleInViewport(target.content)) {
            this.logAutoTranslationRenderSkip(item, target, "outside-viewport");
            return false;
        }
        const renderedLine = this.plugin.renderTranslation(target.messageNode, target.content, translated, renderCacheKey, domText, {
            partial: validationResult.quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
            validationQuality: validationResult.quality,
            validationReason: validationResult.reasonCode || "",
            ...(resultMeta?.partialInfo ? { partialInfo: resultMeta.partialInfo } : {})
        });
        if (!renderedLine) {
            // Emoji images could not be restored: drop the cached result, report a skip instead of
            // marking the message as rendered, and remember the failure so the next scan does not
            // request the same message again.
            this.plugin.deleteTranslationCacheCandidates(renderCacheKey);
            if (item?.cacheKey && item.cacheKey !== renderCacheKey) this.plugin.deleteTranslationCacheCandidates(item.cacheKey);
            this.plugin.markAutoTranslationUndrawableResult(renderCacheKey, "emoji-restore-failed", { text: item?.text || target.text, requestOptions: item?.requestOptions || requestOptions });
            if (item?.cacheKey && item.cacheKey !== renderCacheKey) this.plugin.markAutoTranslationUndrawableResult(item.cacheKey, "emoji-restore-failed");
            this.logAutoTranslationRenderSkip(item, target, "emoji-restore-failed");
            return false;
        }
        this.plugin.rememberRecentAutoTranslationRender(renderCacheKey, target.text, requestOptions, {
            validationQuality: validationResult.quality,
            validationReason: validationResult.reasonCode || ""
        });
        if (item?.cacheKey && item.cacheKey !== renderCacheKey) {
            this.plugin.rememberRecentAutoTranslationRender(item.cacheKey, target.text, item.requestOptions || requestOptions, {
                validationQuality: validationResult.quality,
                validationReason: validationResult.reasonCode || ""
            });
        }
        this.plugin.logDiagnostic("auto.render", "ok", {
            ...this.plugin.getAutoTranslationDiagnosticMeta({ ...target, cacheKey: renderCacheKey, requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest }, DIAGNOSTIC_MESSAGE_STATES.RENDERED, DIAGNOSTIC_REASON_CODES.RENDERED),
            key: this.plugin.getTextFingerprint(renderCacheKey),
            sourceHash: this.plugin.getStrongTextFingerprint(target.text),
            prefetch: Boolean(item?.daitPrefetchRequest),
            identityUpgrade: Boolean(identityUpgrade),
            validationQuality: validationResult.quality,
            validationReason: validationResult.reasonCode || ""
        });
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "rendered",
            { ...target, cacheKey: renderCacheKey, requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
            DIAGNOSTIC_MESSAGE_STATES.RENDERED,
            DIAGNOSTIC_REASON_CODES.RENDERED,
            { identityUpgrade: Boolean(identityUpgrade), validationQuality: validationResult.quality, validationReason: validationResult.reasonCode || "" }
        );
        return true;
    },

    isSafeTranslationIdentityUpgrade(expectedIdentity, currentIdentity, target = null) {
        const expected = this.getTranslationIdentitySummary(expectedIdentity);
        const current = this.getTranslationIdentitySummary(currentIdentity);
        if (!expected.channelId || expected.channelId !== current.channelId) return false;
        if (!expected.targetKind || expected.targetKind !== current.targetKind) return false;
        if (!expected.sourceHash || expected.sourceHash !== current.sourceHash) return false;
        if (expected.kind === "fallback" && current.kind === "message") {
            return this.isSafeFallbackToMessageIdentityUpgrade(expected, current, target);
        }
        if (expected.kind === "fallback" && current.kind === "fallback") {
            return this.isSafeFallbackTranslationIdentityUpgrade(expected, current, target);
        }
        return false;
    },

    isSafeFallbackToMessageIdentityUpgrade(expected, current, target = null) {
        if (!current.messageId || !target?.messageNode || !target?.content) return false;
        const fallback = this.getCurrentFallbackTranslationIdentitySummary(target, {
            guildId: current.guildId,
            channelId: current.channelId
        });
        if (!fallback) return false;
        if (expected.channelId !== fallback.channelId || expected.sourceHash !== fallback.sourceHash || expected.targetKind !== fallback.targetKind) return false;
        return this.isSafeFallbackTranslationIdentityUpgrade(expected, fallback, target);
    },

    isSafeFallbackTranslationIdentityUpgrade(expected, current, target = null) {
        if (expected.guildId && current.guildId && expected.guildId !== current.guildId) return false;
        const expectedAuthor = this.normalizeFallbackIdentityField(expected.authorId, "unknown-author");
        const currentAuthor = this.normalizeFallbackIdentityField(current.authorId, "unknown-author");
        if (expectedAuthor && currentAuthor && expectedAuthor !== currentAuthor) return false;
        if (expectedAuthor && !currentAuthor) return false;
        const expectedTimestamp = this.normalizeFallbackIdentityField(expected.timestamp, "unknown-time");
        const currentTimestamp = this.normalizeFallbackIdentityField(current.timestamp, "unknown-time");
        if (expectedTimestamp && currentTimestamp && expectedTimestamp !== currentTimestamp) return false;
        if (expectedTimestamp && !currentTimestamp) return false;

        const ownerId = this.peekTranslationOwnerId(target?.content);
        if (!ownerId) return false;
        const sameAuthor = Boolean(expectedAuthor && currentAuthor && expectedAuthor === currentAuthor);
        const sameTimestamp = Boolean(expectedTimestamp && currentTimestamp && expectedTimestamp === currentTimestamp);
        const sameDomFingerprint = this.isUsableFallbackIdentityHash(expected.domHash, "no-dom-fingerprint")
            && this.isUsableFallbackIdentityHash(current.domHash, "no-dom-fingerprint")
            && expected.domHash === current.domHash;
        const sameNeighborFingerprint = this.isUsableFallbackIdentityHash(expected.neighborHash, "no-neighbor-context")
            && this.isUsableFallbackIdentityHash(current.neighborHash, "no-neighbor-context")
            && expected.neighborHash === current.neighborHash;
        if (this.hasConflictingFallbackIdentityHash(expected.domHash, current.domHash, "no-dom-fingerprint")) return false;
        if (this.hasConflictingFallbackIdentityHash(expected.neighborHash, current.neighborHash, "no-neighbor-context")) return false;
        return Boolean(sameTimestamp || (sameAuthor && (sameDomFingerprint || sameNeighborFingerprint)) || (sameDomFingerprint && sameNeighborFingerprint));
    },

    getCurrentFallbackTranslationIdentitySummary(target, ids = {}) {
        if (!target?.messageNode || !target?.content) return null;
        const text = this.plugin.getAutoTranslationTargetDomText(target) || this.plugin.getElementText(target.content, target.textOptions);
        const identity = this.plugin.messageTracker.getFallbackIdentity(target.messageNode, target.content, text, ids);
        return this.getTranslationIdentitySummary(identity);
    },

    isUsableFallbackIdentityHash(value, emptyMarker) {
        const text = String(value || "");
        return Boolean(text && text !== this.plugin.getTextFingerprint(emptyMarker));
    },

    hasConflictingFallbackIdentityHash(left, right, emptyMarker) {
        return this.isUsableFallbackIdentityHash(left, emptyMarker)
            && this.isUsableFallbackIdentityHash(right, emptyMarker)
            && left !== right;
    },

    normalizeFallbackIdentityField(value, unknownValue) {
        const text = String(value || "").trim();
        return text && text !== unknownValue ? text : "";
    },

    getTranslationIdentitySummary(identity) {
        const parts = String(identity || "").split(":");
        const summary = {
            kind: parts[0] || "",
            guildId: parts[1] || "",
            channelId: parts[2] || "",
            targetKind: parts.length >= 2 ? parts[parts.length - 2] : "",
            sourceHash: parts.length >= 1 ? parts[parts.length - 1] : ""
        };
        if (summary.kind === "fallback") {
            const tailIndex = Math.max(5, parts.length - 5);
            summary.authorId = parts[3] || "";
            summary.timestamp = parts.slice(4, tailIndex).join(":") || "";
            summary.routeHash = parts[tailIndex] || "";
            summary.domHash = parts[tailIndex + 1] || "";
            summary.neighborHash = parts[tailIndex + 2] || "";
        }
        else if (summary.kind === "message" || summary.kind === "reply") {
            summary.messageId = parts[3] || "";
        }
        return summary;
    },

    logAutoTranslationRenderSkip(item, target, reason) {
        const reasonMap = {
            disconnected: DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED,
            "text-changed": DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED,
            "identity-changed": DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED,
            "manual-line": DIAGNOSTIC_REASON_CODES.MANUAL_LINE_PRESENT,
            "outside-viewport": DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT
        };
        const staleReasons = new Set(["disconnected", "text-changed", "identity-changed"]);
        const reasonCode = reasonMap[reason] || reason;
        const messageState = staleReasons.has(reason)
            ? DIAGNOSTIC_MESSAGE_STATES.STALE
            : DIAGNOSTIC_MESSAGE_STATES.CACHED;
        this.plugin.logDiagnostic("auto.render", "skip", {
            ...this.plugin.getAutoTranslationDiagnosticMeta({ ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest }, messageState, reasonCode),
            reason,
            reasonCode,
            messageState,
            key: this.plugin.getTextFingerprint(item?.cacheKey || ""),
            sourceHash: this.plugin.getStrongTextFingerprint(target?.text || item?.text || ""),
            prefetch: Boolean(item?.daitPrefetchRequest)
        });
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "render-skip",
            { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
            messageState,
            reasonCode
        );
    },

    renderAutoTranslationResultSafely(item, translated, resultMeta) {
        try {
            this.plugin.renderAutoTranslationResult(item, translated, resultMeta);
            return true;
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to render auto translation", error);
            try {
                this.plugin.clearPendingAutoTranslationItem(item);
            }
            catch (cleanupError) {
                this.plugin.warnSanitized("Failed to clean up auto translation after render error", cleanupError);
            }
            return false;
        }
    },

    renderPendingAutoTranslationLoadingSafely(item) {
        if (this.plugin.getAutoTranslationProviderFailure(item?.requestOptions)?.type === "local-unavailable") {
            this.plugin.removeAutoTranslationLoadingForItem(item, { force: true });
            return false;
        }
        try {
            this.plugin.renderPendingAutoTranslationLoading(item);
            return true;
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to render auto translation loading", error);
            return false;
        }
    },

    hasManualTranslationLine(content, sourceText = null, messageNode = null) {
        const line = this.plugin.getTranslationLine(content);
        if (!line || line.dataset?.daitMode !== "manual") return false;
        const text = sourceText ?? this.plugin.getElementText(content);
        return this.isTranslationLineSourceMatch(line, text)
            && (!messageNode || this.isTranslationLineMessageMatch(line, messageNode, content, text));
    },

    // A translation the user asked for (translate, retranslate, retry) owns its line until it settles:
    // the cached-draw pass and the scan must not draw the old cached translation over its loading line.
    isManualTranslationInFlight(content, sourceText = null, messageNode = null) {
        return Boolean(this.plugin.getTranslationLine(content)?.classList?.contains?.("dait-translation-loading"))
            && this.plugin.hasManualTranslationLine(content, sourceText, messageNode);
    },

    clearAutoTextTranslationFailure(text, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const key = this.getAutoTextTranslationFailureKey(text, requestOptions);
        if (key) {
            this.plugin.autoTranslationFailures.delete(key);
            this.plugin.autoTranslationFailureHistory.delete(key);
        }
    },

    markAutoTextTranslationFailure(item, error, failure = null) {
        if (!error?.autoTranslationTerminalFailure) return;
        if (item?.daitPrefetchRequest) return;
        if (this.plugin.getAutoTranslationFailureType(error) === "invalid-output") return;
        const key = this.getAutoTextTranslationFailureKey(item?.text || "", item?.requestOptions || this.plugin.getAutoTranslationOptions());
        if (!key) return;
        this.plugin.autoTranslationFailures.set(key, failure || this.plugin.createAutoTranslationFailure(key, error));
        this.plugin.pruneAutoTranslationFailureMapSize();
    },

    removeAutoTranslationNode(target, cacheKey) {
        if (this.plugin.isAutoTranslationRenderPaused()) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        const line = this.plugin.getTranslationLine(target.content);
        if (!line) return;
        if (line.dataset.daitMode === "manual") return;
        if (cacheKey && !this.isTranslationLineCacheMatch(line, cacheKey, this.getTranslationLineCacheAliases(target?.text || "", target?.requestOptions || {}))) return;
        this.plugin.restoreTranslationSourceVisibility(target.content);
        line.remove();
    },

    removeAutoTranslationLoadingForItem(item, options = {}) {
        if (!item?.cacheKey) return;
        this.plugin.getAutoTranslationPendingTargets(item).forEach(target => this.plugin.removeAutoTranslationLoadingNode(target, item.cacheKey, options));
    },

    removeAutoTranslationLoadingNode(target, cacheKey, options = {}) {
        if (!options.force && this.plugin.isAutoTranslationRenderPaused()) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        const line = this.plugin.getTranslationLine(target?.content);
        if (!line?.classList?.contains?.("dait-translation-loading")) return;
        if (line.dataset?.daitMode === "manual") return;
        if (cacheKey && !this.isTranslationLineCacheMatch(line, cacheKey, this.getTranslationLineCacheAliases(target?.text || "", target?.requestOptions || {}))) return;
        this.plugin.restoreTranslationSourceVisibility(target.content);
        line.remove();
    },

    isTranslationLineCacheMatch(line, cacheKey, cacheAliases = []) {
        const keys = [cacheKey, ...cacheAliases].filter(Boolean);
        if (!keys.length) return true;
        const cacheSigs = new Set(keys.map(key => this.plugin.getStrongTextFingerprint(key)));
        const cacheKeys = new Set(keys.map(key => this.plugin.getTextFingerprint(key)));
        if (line?.dataset?.daitCacheSig && cacheSigs.has(line.dataset.daitCacheSig)) return true;
        return Boolean(line?.dataset?.daitCacheKey && cacheKeys.has(line.dataset.daitCacheKey));
    },

    shouldRenderAutoTranslationFailure(error) {
        if (this.plugin.getAutoTranslationFailureType(error) !== "invalid-output") return false;
        if (this.plugin.shouldShowAutoTranslationWarning(error)) return true;
        return Boolean(error?.autoTranslationFinalInvalidOutput
            && Number(error?.autoTranslationFailureCount || 0) >= AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT);
    },

    renderAutoTranslationFailure(target, cacheKey, error) {
        if (this.plugin.isAutoTranslationRenderPaused()) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                { type: this.plugin.getAutoTranslationFailureType(error) }
            );
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED,
                { type: this.plugin.getAutoTranslationFailureType(error) }
            );
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        if (!this.plugin.isElementVisibleInViewport(target.messageNode) || !this.plugin.isElementVisibleInViewport(target.content)) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT,
                { type: this.plugin.getAutoTranslationFailureType(error) }
            );
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED,
                { type: this.plugin.getAutoTranslationFailureType(error) }
            );
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        const requestOptions = target?.requestOptions || {};
        if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target, { cacheKey, requestOptions })) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED,
                { type: this.plugin.getAutoTranslationFailureType(error) }
            );
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        const domText = this.plugin.getAutoTranslationTargetDomText(target);
        if (this.plugin.hasManualTranslationLine(target.content, domText)) {
            this.logAutoTranslationRenderSkip({ ...target, cacheKey, requestOptions }, target, "manual-line");
            return;
        }
        this.plugin.renderTranslationError(target.messageNode, target.content, error, cacheKey, domText);
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "failure-rendered",
            { ...target, cacheKey },
            DIAGNOSTIC_MESSAGE_STATES.FAILED,
            DIAGNOSTIC_REASON_CODES.RENDERED,
            { type: this.plugin.getAutoTranslationFailureType(error) }
        );
    },

    renderPendingAutoTranslationLoading(item) {
        if (this.plugin.isAutoTranslationRenderPaused()) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                item,
                DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED
            );
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        this.plugin.getAutoTranslationPendingTargets(item).forEach(target => {
            if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target, item)) {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED
                );
                return;
            }
            if (target.messageNode.isConnected && target.content.isConnected && this.plugin.isElementVisibleInViewport(target.messageNode) && this.plugin.isElementVisibleInViewport(target.content) && this.plugin.isAutoTranslationTargetDomTextCurrent(target)) {
                this.plugin.renderTranslationLoading(target.messageNode, target.content, item.cacheKey, this.plugin.getAutoTranslationTargetDomText(target));
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "loading",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                    DIAGNOSTIC_REASON_CODES.REQUEST_STARTED
                );
            }
            else {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    target.messageNode?.isConnected && target.content?.isConnected ? DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT : DIAGNOSTIC_MESSAGE_STATES.STALE,
                    target.messageNode?.isConnected && target.content?.isConnected ? DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT : DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED
                );
            }
        });
    },

    showAutoTranslateError(error) {
        // Errors that need the user get one toast per episode, even with failure toasts off.
        if (this.isTranslationAttentionError(error)) {
            this.notifyTranslationNeedsAttention(error);
            return;
        }
        if (this.plugin.settings.ui?.showAutoTranslateToasts === false) return;
        if (!this.plugin.shouldShowAutoTranslationWarning(error)) return;
        const now = Date.now();
        if (now - this.plugin.autoTranslationLastToastAt < 10000) return;
        this.plugin.autoTranslationLastToastAt = now;
        this.plugin.showToast(this.plugin.t("autoTranslateFailed", { error: this.plugin.formatError(error, { includeRetry: true }) }), "error");
    },

    // sourceText is the text on screen (the line's source signature); requestText, when it differs
    // (store-full), is what was translated and what the drawn translation is validated against.
    hasCurrentTranslationLine(content, cacheKey, sourceText = null, cacheAliases = [], requestOptions = null, requestText = null) {
        let line = this.plugin.getTranslationLine(content);
        if (!line) line = this.findTranslationLineByMetadata(content, cacheKey, sourceText, cacheAliases);
        if (!line) return false;
        if (this.plugin.getTranslationContentForLine(line) !== content && this.isTranslationContentMatchForLine(line, content)) {
            this.retargetTranslationLineToContent(line, content);
        }

        const cacheKeys = [cacheKey, ...cacheAliases].filter(Boolean);
        const requestFingerprints = new Set(cacheKeys.map(key => this.plugin.getTextFingerprint(key)));
        const requestSignatures = new Set(cacheKeys.map(key => this.plugin.getStrongTextFingerprint(key)));
        const sourceFingerprint = this.plugin.getTextFingerprint(sourceText ?? this.plugin.getElementText(content));
        const sourceSignature = this.plugin.getStrongTextFingerprint(sourceText ?? this.plugin.getElementText(content));
        const requestedMode = this.plugin.getTranslationCacheMode(cacheKey);
        if (line.dataset.daitSourceSig ? line.dataset.daitSourceSig !== sourceSignature : line.dataset.daitSourceKey !== sourceFingerprint) {
            line.remove();
            return false;
        }
        if (line.classList?.contains?.("dait-translation-error")) return false;
        if (line.classList?.contains?.("dait-translation-loading")) return false;
        if (line.dataset.daitMode === "manual" && this.plugin.isAutoTranslationCacheMode(requestedMode)) return true;
        if (line.dataset.daitMode === "auto-text" && this.plugin.isAutoTranslationCacheMode(requestedMode)) {
            if (this.removeInvalidCurrentAutoTranslationLine(line, content, requestText ?? sourceText, cacheKey, cacheAliases, requestOptions)) return false;
            return true;
        }

        const identityFingerprint = this.getTranslationIdentityFingerprintFromCacheKey(cacheKey);
        const identitySignature = this.getTranslationIdentitySignatureFromCacheKey(cacheKey);
        if (line.dataset.daitIdentitySig && identitySignature && line.dataset.daitIdentitySig !== identitySignature) {
            line.remove();
            return false;
        }
        if (!line.dataset.daitIdentitySig && line.dataset.daitIdentityKey && identityFingerprint && line.dataset.daitIdentityKey !== identityFingerprint) {
            line.remove();
            return false;
        }

        if (line.dataset.daitCacheSig && requestSignatures.has(line.dataset.daitCacheSig)) {
            if (this.removeInvalidCurrentAutoTranslationLine(line, content, requestText ?? sourceText, cacheKey, cacheAliases, requestOptions)) return false;
            return true;
        }
        if (line.dataset.daitCacheKey && requestFingerprints.has(line.dataset.daitCacheKey)) {
            if (this.removeInvalidCurrentAutoTranslationLine(line, content, requestText ?? sourceText, cacheKey, cacheAliases, requestOptions)) return false;
            return true;
        }

        if (this.plugin.isAutoTranslationRenderPaused() && this.plugin.isAutoTranslationCacheMode(line.dataset?.daitMode)) return false;
        line.remove();
        return false;
    },

    findTranslationLineByMetadata(content, cacheKey, sourceText = null, cacheAliases = []) {
        if (!content) return null;
        const text = sourceText ?? this.plugin.getElementText(content);
        const sourceSig = this.plugin.getStrongTextFingerprint(text);
        const sourceKey = this.plugin.getTextFingerprint(text);
        const cacheKeys = [cacheKey, ...cacheAliases].filter(Boolean);
        const cacheSigs = new Set(cacheKeys.map(key => this.plugin.getStrongTextFingerprint(key)));
        const cacheFingerprints = new Set(cacheKeys.map(key => this.plugin.getTextFingerprint(key)));
        const identitySig = this.getTranslationIdentitySignatureFromCacheKey(cacheKey);
        const identityKey = this.getTranslationIdentityFingerprintFromCacheKey(cacheKey);
        const isPreview = this.plugin.isReplyPreviewElement(content);
        const scopes = [
            content?.parentElement,
            content?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']")
        ].filter(Boolean);
        const seen = new Set();
        for (const scope of scopes) {
            for (const line of scope?.querySelectorAll?.(".dait-translation-line[data-dait-owner]") || []) {
                if (!line || seen.has(line)) continue;
                seen.add(line);
                if (Boolean(line.classList?.contains?.("dait-translation-preview")) !== isPreview) continue;
                const sourceMatches = line.dataset?.daitSourceSig
                    ? line.dataset.daitSourceSig === sourceSig
                    : line.dataset?.daitSourceKey === sourceKey;
                if (!sourceMatches) continue;
                const cacheMatches = (line.dataset?.daitCacheSig && cacheSigs.has(line.dataset.daitCacheSig))
                    || (line.dataset?.daitCacheKey && cacheFingerprints.has(line.dataset.daitCacheKey));
                const identityMatches = (identitySig && line.dataset?.daitIdentitySig === identitySig)
                    || (identityKey && line.dataset?.daitIdentityKey === identityKey);
                if (cacheMatches || identityMatches) return line;
            }
        }
        return null;
    },

    retargetTranslationLineToContent(line, content) {
        if (!line?.dataset || !content?.dataset) return;
        line.dataset.daitOwner = this.ensureTranslationOwnerId(content);
        this.positionExistingTranslationLine(line, content);
        this.plugin.syncTranslationSourceVisibility(line, content);
    },

    removeInvalidCurrentAutoTranslationLine(line, content, sourceText = null, cacheKey = "", cacheAliases = [], requestOptions = null) {
        if (!line || !this.plugin.isAutoTranslationCacheMode(line.dataset?.daitMode)) return false;
        const options = requestOptions || this.plugin.getAutoTranslationOptions();
        const renderedText = this.getTranslationLineRenderedText(line);
        if (!renderedText) return false;
        const text = sourceText ?? this.plugin.getElementText(content);
        // A partial line drawn from a kept partial result (a long message with a missing part)
        // would fail validation as a complete translation; removing it would only make the scan
        // draw it again. While it is shown, its kept result stays alive.
        const partialLine = line.classList?.contains?.("dait-translation-partial") === true;
        if (partialLine && this.plugin.touchAutoTranslationPartialResult(cacheKey, text)) return false;
        // Once the kept result has expired, the line is still checked as the partial it is, so a
        // line on screen (or hidden by the user) is not torn down and the message paid for again.
        const validationOptions = partialLine ? { ...options, longTextPartial: true } : options;
        const validation = this.plugin.getAutoTranslationOutputValidationResult(
            text,
            renderedText,
            this.plugin.getAutoTranslationTargetLanguage(options),
            this.plugin.getAutoTranslationOutputValidationOptions(text, renderedText, validationOptions),
            validationOptions
        );
        if (validation.cacheable || (validation.renderable && this.isAcceptedNonCacheableCurrentTranslationLine(line, validation))) {
            this.plugin.rememberRecentAutoTranslationRender(cacheKey, text, options, {
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || ""
            });
            return false;
        }

        this.plugin.restoreTranslationSourceVisibility(content);
        line.remove?.();
        this.plugin.deleteTranslationCacheCandidates(
            cacheKey,
            ...cacheAliases,
            this.plugin.getAutoTextTranslationCacheKey(text, options),
            ...this.plugin.getAutoTextTranslationCacheAliases(text, options)
        );
        this.plugin.clearAutoTranslationFailure(cacheKey, options);
        this.clearAutoTextTranslationFailure(text, options);
        this.plugin.logDiagnostic("auto.render", "remove-invalid-current-line", {
            key: this.plugin.getTextFingerprint(cacheKey || ""),
            sourceHash: this.plugin.getStrongTextFingerprint(text || ""),
            valueLength: String(renderedText || "").length
        });
        return true;
    },

    isAcceptedNonCacheableCurrentTranslationLine(line, validation = {}) {
        if (!validation?.renderable) return false;
        const quality = String(validation.quality || line?.dataset?.daitValidationQuality || "");
        return quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL
            || line?.classList?.contains?.("dait-translation-partial") === true;
    },

    getTranslationLineRenderedText(line) {
        const textNode = line?.querySelector?.(".dait-translation-text");
        return this.plugin.normalizeExtractedText(textNode?.textContent ?? line?.textContent ?? "");
    },

    getTranslationLine(content) {
        const lines = this.plugin.getTranslationLines(content);
        const ownedLines = lines.filter(line => this.plugin.getTranslationContentForLine(line) === content);
        if (ownedLines.length > 1) {
            ownedLines.slice(1).forEach(line => {
                if (this.plugin.isAutoTranslationRenderPaused() && this.plugin.isAutoTranslationCacheMode(line.dataset?.daitMode)) return;
                line.remove();
            });
        }
        if (ownedLines[0]) return ownedLines[0];
        return content?.querySelector?.(":scope > .dait-translation-line") || null;
    },

    reconcileTranslationLines(context = null) {
        if (typeof document === "undefined") return;
        const preserveAutoLines = this.plugin.isAutoTranslationRenderPaused();
        this.getTranslationLinesForReconcile(context).forEach(line => {
            const isAutoLine = this.plugin.isAutoTranslationCacheMode(line.dataset?.daitMode);
            const ownerId = String(line.dataset?.daitOwner || "");
            if (!ownerId.startsWith(`${this.plugin.translationOwnerPrefix}-`)) {
                if (preserveAutoLines && isAutoLine) return;
                this.plugin.restoreTranslationSourceVisibility(this.plugin.getTranslationContentForLine(line));
                line.remove();
                return;
            }

            const content = this.plugin.getTranslationContentForLine(line);
            if (!content?.isConnected) {
                if (preserveAutoLines && isAutoLine) return;
                this.plugin.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }

            const textOptions = line.classList?.contains?.("dait-translation-preview")
                ? { includeReplyPreview: true }
                : null;
            const sourceText = this.plugin.getCachedElementText(content, context, textOptions || {});
            const sourceKey = this.plugin.getTextFingerprint(sourceText);
            const sourceSig = this.plugin.getStrongTextFingerprint(sourceText);
            if (line.dataset.daitSourceSig ? line.dataset.daitSourceSig !== sourceSig : line.dataset.daitSourceKey && line.dataset.daitSourceKey !== sourceKey) {
                this.plugin.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }
            if (line.dataset.daitMode === "auto-text") {
                this.plugin.syncTranslationSourceVisibility(line, content, sourceText);
                return;
            }
            if (line.dataset.daitIdentitySig) {
                const currentIdentitySig = this.getCurrentTranslationIdentitySignature(line, content, textOptions, sourceText);
                if (currentIdentitySig && line.dataset.daitIdentitySig !== currentIdentitySig) {
                    this.plugin.restoreTranslationSourceVisibility(content);
                    line.remove();
                    return;
                }
            }
            else if (line.dataset.daitIdentityKey) {
                const currentIdentityKey = this.getCurrentTranslationIdentityFingerprint(line, content, textOptions, sourceText);
                if (currentIdentityKey && line.dataset.daitIdentityKey !== currentIdentityKey) {
                    this.plugin.restoreTranslationSourceVisibility(content);
                    line.remove();
                    return;
                }
            }
            if (isAutoLine && this.isStaleAutoTranslationLoadingLine(line)) {
                if (preserveAutoLines) return;
                this.plugin.logDiagnostic("render.loading", "stale-removed", {
                    cacheHash: line.dataset?.daitCacheKey || "",
                    ageMs: Date.now() - Number(line.dataset?.daitLoadingAt || 0)
                });
                this.plugin.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }
            this.plugin.syncTranslationSourceVisibility(line, content, sourceText);
        });
    },

    getTranslationLinesForReconcile(context = null) {
        const selector = ".dait-translation-line[data-dait-owner]";
        const messageNodes = [...new Set(context?.messageNodes || [])].filter(node => node?.querySelectorAll);
        if (!messageNodes.length) return [...(document.querySelectorAll?.(selector) || [])];
        const lines = [];
        const seen = new Set();
        messageNodes.forEach(messageNode => {
            for (const line of messageNode.querySelectorAll?.(selector) || []) {
                if (!line || seen.has(line)) continue;
                seen.add(line);
                lines.push(line);
            }
        });
        return lines;
    },

    isStaleAutoTranslationLoadingLine(line, now = Date.now()) {
        if (!line?.classList?.contains?.("dait-translation-loading")) return false;
        if (line.dataset?.daitMode === "manual") return false;
        if (this.hasActiveAutoTranslationLine(line)) return false;
        const loadingAt = Number(line.dataset?.daitLoadingAt || 0);
        return !loadingAt || now - loadingAt >= AUTO_TRANSLATE_ORPHAN_LOADING_REQUEUE_MS;
    },

    hasActiveAutoTranslationLine(line) {
        if (!line) return false;
        this.plugin.pruneAutoTranslationActiveState();
        const activeKeys = [...this.plugin.autoTranslationQueuedKeys, ...this.plugin.autoTranslationInFlightKeys];
        return activeKeys.some(key => this.isTranslationLineCacheMatch(line, key));
    },

    getTranslationContentForLine(line) {
        const ownerId = line?.dataset?.daitOwner;
        if (!ownerId) return null;
        const parent = line.parentElement;
        if (parent?.dataset?.daitOwner === ownerId && this.isTranslationContentMatchForLine(line, parent)) return parent;
        const siblings = [...(line.parentElement?.children || [])];
        const sibling = siblings.find(node => node !== line
            && node?.dataset?.daitOwner === ownerId
            && this.isTranslationContentMatchForLine(line, node));
        if (sibling) return sibling;

        const messageNode = line.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        if (!messageNode) return null;
        return [...messageNode.querySelectorAll("[data-dait-owner]")]
            .find(node => node !== line
                && node.dataset?.daitOwner === ownerId
                && this.isTranslationContentMatchForLine(line, node)) || null;
    },

    isTranslationContentMatchForLine(line, content) {
        if (!content || content.classList?.contains?.("dait-translation-line")) return false;
        const isPreviewLine = line.classList?.contains?.("dait-translation-preview");
        if (this.plugin.isReplyPreviewElement(content) !== Boolean(isPreviewLine)) return false;
        if (!line.dataset?.daitSourceKey && !line.dataset?.daitSourceSig) return true;
        const textOptions = isPreviewLine ? { includeReplyPreview: true } : null;
        const text = this.plugin.getElementText(content, textOptions);
        if (line.dataset?.daitSourceSig) return this.plugin.getStrongTextFingerprint(text) === line.dataset.daitSourceSig;
        return this.plugin.getTextFingerprint(text) === line.dataset.daitSourceKey;
    },

    getTranslationLines(content) {
        const ownerId = this.peekTranslationOwnerId(content);
        if (!ownerId) return [];
        const escapedOwner = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(ownerId) : ownerId.replace(/"/g, '\\"');
        const selector = `.dait-translation-line[data-dait-owner="${escapedOwner}"]`;
        return [
            ...(content?.querySelectorAll?.(`:scope > ${selector}`) || []),
            ...(content?.parentElement?.querySelectorAll?.(`:scope > ${selector}`) || []),
            ...(content?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']")?.querySelectorAll?.(selector) || [])
        ].filter((line, index, all) => all.indexOf(line) === index);
    },

    peekTranslationOwnerId(content) {
        const ownerId = String(content?.dataset?.daitOwner || "");
        return ownerId.startsWith(`${this.plugin.translationOwnerPrefix}-`) ? ownerId : "";
    },

    ensureTranslationOwnerId(content) {
        if (!content?.dataset) return "";
        if (!this.peekTranslationOwnerId(content)) {
            this.plugin.translationOwnerCounter++;
            content.dataset.daitOwner = `${this.plugin.translationOwnerPrefix}-${this.plugin.translationOwnerCounter}`;
        }
        return content.dataset.daitOwner;
    },

    getTranslationOwnerId(content) {
        return this.ensureTranslationOwnerId(content);
    },

    getTranslationIdentityFromCacheKey(cacheKey) {
        return String(cacheKey || "").split("\n---\n")[1] || "";
    },

    getTranslationIdentityFingerprintFromCacheKey(cacheKey) {
        const identity = this.getTranslationIdentityFromCacheKey(cacheKey);
        return identity ? this.plugin.getTextFingerprint(identity) : "";
    },

    getTranslationIdentitySignatureFromCacheKey(cacheKey) {
        const identity = this.getTranslationIdentityFromCacheKey(cacheKey);
        return identity ? this.plugin.getStrongTextFingerprint(identity) : "";
    },

    isVolatileTranslationIdentity(identity) {
        const value = String(identity || "");
        if (!value.startsWith("fallback:")) return false;
        return value.includes(":unknown-author:unknown-time:")
            && value.includes(`:${this.plugin.getTextFingerprint("no-dom-fingerprint")}:`)
            && value.includes(`:${this.plugin.getTextFingerprint("no-neighbor-context")}:`);
    },

    getCurrentTranslationIdentityFingerprint(line, content, textOptions = null, sourceText = null) {
        const messageNode = line?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        if (!messageNode || !content) return "";
        const text = sourceText ?? this.plugin.getElementText(content, textOptions);
        if (!text) return "";
        return this.plugin.getTextFingerprint(this.plugin.getMessageIdentity(messageNode, content, text));
    },

    getCurrentTranslationIdentitySignature(line, content, textOptions = null, sourceText = null) {
        const messageNode = line?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        if (!messageNode || !content) return "";
        const text = sourceText ?? this.plugin.getElementText(content, textOptions);
        if (!text) return "";
        return this.plugin.getStrongTextFingerprint(this.plugin.getMessageIdentity(messageNode, content, text));
    },

    shouldHideOriginalForTranslationLine(line, content) {
        if (!this.plugin.settings.ui?.hideOriginalAfterTranslation) return false;
        if (!line || !content) return false;
        if (this.plugin.isReplyPreviewElement(content)) return false;
        if (line.classList?.contains?.("dait-translation-loading")) return false;
        if (line.classList?.contains?.("dait-translation-error")) return false;
        if (line.classList?.contains?.("dait-translation-masked")) return false;
        // A partial translation may miss whole parts; the original must stay readable.
        if (line.classList?.contains?.("dait-translation-partial")) return false;
        if (line.classList?.contains?.("dait-translation-dismissed")) return false;
        return line.classList?.contains?.("dait-translation-revealed") !== false;
    },

    syncTranslationSourceVisibility(line, content, sourceText = null) {
        if (!content?.dataset) return;
        if (!this.shouldHideOriginalForTranslationLine(line, content)) {
            this.plugin.restoreTranslationSourceVisibility(content);
            return;
        }

        const text = sourceText ?? this.plugin.getElementText(content);
        const lines = String(text || "")
            .split(/\n+/)
            .map(value => value.trim())
            .filter(Boolean);
        const lineCount = Math.max(1, Math.min(4, lines.length || 1));
        const maxLength = Math.max(8, ...lines.map(value => value.length));
        const width = Math.min(42, Math.max(7, Math.ceil(maxLength * 0.72)));
        content.dataset.daitSourceHidden = "true";
        this.setTranslationSourceStyleProperty(content, "--dait-source-mask-lines", String(lineCount));
        this.setTranslationSourceStyleProperty(content, "--dait-source-mask-width", `${width}ch`);
    },

    restoreTranslationSourceVisibility(content) {
        if (!content?.dataset) return;
        delete content.dataset.daitSourceHidden;
        this.removeTranslationSourceStyleProperty(content, "--dait-source-mask-lines");
        this.removeTranslationSourceStyleProperty(content, "--dait-source-mask-width");
    },

    setTranslationSourceStyleProperty(content, name, value) {
        if (!content?.style?.setProperty) return;
        if (content.style.getPropertyValue?.(name) === value) return;
        this.plugin.markTranslationSourceStyleMutation(content);
        content.style.setProperty(name, value);
    },

    removeTranslationSourceStyleProperty(content, name) {
        if (!content?.style?.removeProperty) return;
        if (!content.style.getPropertyValue?.(name) && content.style[name] === undefined) return;
        this.plugin.markTranslationSourceStyleMutation(content);
        content.style.removeProperty(name);
    },

    restoreAllTranslationSourceVisibility() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        document.querySelectorAll("[data-dait-source-hidden='true']").forEach(node => this.plugin.restoreTranslationSourceVisibility(node));
    },

    syncAllTranslationSourceVisibility() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        if (!this.plugin.settings.ui?.hideOriginalAfterTranslation) {
            this.restoreAllTranslationSourceVisibility();
            return;
        }
        document.querySelectorAll(".dait-translation-line[data-dait-owner]").forEach(line => {
            this.plugin.syncTranslationSourceVisibility(line, this.plugin.getTranslationContentForLine(line));
        });
    },

    syncAllTranslationDisplaySettings() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        const lines = [...document.querySelectorAll(".dait-translation-line[data-dait-owner]")];
        if (!lines.length) return;
        // A new text size, style or position changes the height of every line at once. One snapshot
        // around the whole restyle keeps the first message in view where it was.
        this.plugin.withTranslationScrollStability(this.getTranslationRestyleScrollAnchor(lines), () => lines.forEach(line => {
            const content = this.plugin.getTranslationContentForLine(line);
            if (!content?.isConnected) return;
            const isStateLine = line.classList?.contains?.("dait-translation-loading")
                || line.classList?.contains?.("dait-translation-error");
            if (!isStateLine) {
                line.classList?.toggle?.("dait-translation-masked", Boolean(this.plugin.settings.ui?.maskTranslations));
                line.classList?.toggle?.("dait-translation-revealed", !this.plugin.settings.ui?.maskTranslations);
                this.applyTranslationLineMaskState(line);
                this.applyTranslationLineDisplayClasses(line);
            }
            this.positionExistingTranslationLine(line, content);
            this.plugin.syncTranslationSourceVisibility(line, content);
        }), { allowScrollCorrectionWhilePaused: true, keepAnchorTop: true });
    },

    // The first message whose top is inside the visible chat (else the one partly in view): lines
    // above its top may change height, and keeping that top in place keeps what the user reads in place.
    getTranslationRestyleScrollAnchor(lines) {
        const first = lines.find(line => line?.isConnected);
        const scroller = first ? this.plugin.getTranslationScrollContainer(first) : null;
        const band = scroller ? this.plugin.getScrollContainerBand(scroller) : null;
        if (!band) return null;
        const root = this.plugin.isDocumentScroller(scroller) ? document : scroller;
        let partlyVisible = null;
        for (const message of root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR) || []) {
            const rect = message.getBoundingClientRect?.();
            if (!rect || !(Number(rect.bottom) > band.top)) continue;
            if (Number(rect.top) >= band.bottom) break;
            if (Number(rect.top) >= band.top) return message;
            if (!partlyVisible) partlyVisible = message;
        }
        return partlyVisible;
    },

    positionExistingTranslationLine(line, content) {
        if (!line || !content) return;
        const anchor = this.getTranslationAnchor(null, content);
        if (!anchor) return;
        if (anchor === content) {
            if (this.plugin.settings.ui.translationPosition === "before") {
                if (line.parentElement !== anchor || line !== anchor.firstChild) anchor.insertBefore(line, anchor.firstChild || null);
            }
            else if (line.parentElement !== anchor || line !== anchor.lastChild) {
                anchor.appendChild(line);
            }
            return;
        }

        if (this.plugin.settings.ui.translationPosition === "before") {
            if (line.nextSibling !== content) anchor.insertBefore(line, content || anchor.firstChild);
            return;
        }

        const reference = content?.nextSibling || null;
        if (line.previousSibling !== content) anchor.insertBefore(line, reference);
    },

    getTranslationEmojiDescriptors(content) {
        const images = Array.from(content?.querySelectorAll?.("img[alt]") || []);
        // Skip the same subtrees text extraction skips (hidden parts, other translators' markup),
        // otherwise an emoji the model never saw would have to be restored and the line would fail.
        const skippedSelector = [
            "[aria-hidden='true']",
            "[hidden]",
            ...this.plugin.getForeignTranslationExcludedSelectors()
        ].filter(Boolean).join(", ");
        return images.map(image => {
            try {
                if (image.closest?.(".dait-translation-line, .dait-translation-box")) return null;
                const skipped = image.closest?.(skippedSelector);
                if (skipped && (skipped === content || content?.contains?.(skipped))) return null;
            }
            catch {}
            const alt = String(image.getAttribute?.("alt") || "").trim();
            const match = alt.match(/^:([A-Za-z0-9_]{1,64}):$/);
            if (!match) return null;
            return { name: match[1], alt, image };
        }).filter(Boolean);
    },

    cloneTranslationEmojiNode(descriptor) {
        try {
            const clone = descriptor?.image?.cloneNode?.(true);
            if (!clone) return null;
            clone.removeAttribute?.("id");
            clone.removeAttribute?.("aria-describedby");
            clone.classList?.add?.("dait-translation-emoji");
            clone.setAttribute?.("alt", descriptor.alt);
            clone.setAttribute?.("aria-label", descriptor.alt);
            clone.setAttribute?.("draggable", "false");
            return clone;
        }
        catch {
            return null;
        }
    },

    appendTranslationTextWithDiscordEmoji(container, translatedText, content, descriptors = this.getTranslationEmojiDescriptors(content)) {
        if (!container || typeof document === "undefined" || typeof document.createTextNode !== "function") return false;
        if (!descriptors.length) return false;

        const descriptorCounts = new Map();
        descriptors.forEach(descriptor => descriptorCounts.set(descriptor.name, Number(descriptorCounts.get(descriptor.name) || 0) + 1));
        const outputCounts = this.plugin.getDiscordEmojiTokenCounts(translatedText);
        // Every real emoji (backed by a DOM image descriptor) needs a token in the output. Extra
        // tokens of the same name (a literal ":name:" typed in the message) stay plain text, as does
        // other ":token:"-shaped text such as "12:30:45"; neither may veto the render.
        for (const [name, count] of descriptorCounts) {
            if (Number(outputCounts.get(name) || 0) < count) return false;
        }

        const queues = new Map();
        descriptors.forEach(descriptor => {
            if (!queues.has(descriptor.name)) queues.set(descriptor.name, []);
            queues.get(descriptor.name).push(descriptor);
        });

        const value = String(translatedText || "");
        const tokenPattern = /<a?:([A-Za-z0-9_]{1,64}):\d+>|:([A-Za-z0-9_]{1,64}):/g;
        const parts = [];
        let cursor = 0;
        let handled = false;
        let match = tokenPattern.exec(value);
        while (match) {
            const name = match[1] || match[2] || "";
            const queue = queues.get(name);
            if (queue?.length) {
                const before = value.slice(cursor, match.index);
                if (before) parts.push(document.createTextNode(before));
                const descriptor = queue.shift();
                const emoji = this.cloneTranslationEmojiNode(descriptor);
                if (!emoji) return false;
                parts.push(emoji);
                cursor = tokenPattern.lastIndex;
                handled = true;
            }
            match = tokenPattern.exec(value);
        }

        if (!handled) return false;
        const remainder = value.slice(cursor);
        if (remainder) parts.push(document.createTextNode(remainder));
        parts.forEach(node => container.appendChild(node));
        return true;
    },

    renderTranslation(messageNode, content, translatedText, cacheKey = "", sourceText = null, renderOptions = {}) {
        const scrollOptions = {
            allowScrollCorrectionWhilePaused: Boolean(renderOptions?.allowScrollCorrectionWhilePaused),
            ...(renderOptions?.anchorRect ? { anchorRect: renderOptions.anchorRect } : {})
        };
        return this.plugin.withTranslationScrollStability(content, () => {
            const line = this.plugin.ensureTranslationNode(messageNode, content);
            line.classList.remove("dait-translation-error", "dait-translation-loading", "dait-translation-masked", "dait-translation-revealed");
            if (renderOptions?.partial) line.classList.add("dait-translation-partial");
            else line.classList.remove("dait-translation-partial");
            line.classList.add(this.plugin.settings.ui.maskTranslations ? "dait-translation-masked" : "dait-translation-revealed");
            this.plugin.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
            delete line.dataset.daitFailureType;
            delete line.dataset.daitLoadingAt;
            if (renderOptions?.validationQuality) line.dataset.daitValidationQuality = String(renderOptions.validationQuality);
            else delete line.dataset.daitValidationQuality;
            if (renderOptions?.validationReason) line.dataset.daitValidationReason = String(renderOptions.validationReason);
            else delete line.dataset.daitValidationReason;
            this.resetTranslationLineState(line);
            this.applyTranslationLineDisplayClasses(line);
            this.applyTranslationLineMaskState(line);
            this.applyTranslationLineDismissal(line, messageNode, content);
            line.textContent = "";
            const text = document.createElement("span");
            text.className = "dait-translation-text";
            this.applyTranslationLineLanguage(text);
            const emojiDescriptors = this.getTranslationEmojiDescriptors(content);
            if (emojiDescriptors.length && !this.appendTranslationTextWithDiscordEmoji(text, translatedText, content, emojiDescriptors)) {
                this.plugin.removeTranslationNode(messageNode, content);
                return null;
            }
            if (!emojiDescriptors.length) {
                text.textContent = translatedText;
            }
            line.appendChild(text);
            this.plugin.translationLineTexts?.set?.(line, String(translatedText ?? ""));
            if (!line.classList?.contains?.("dait-translation-preview")) {
                // The toolbar is built on first use (see ensureTranslationLineActions), so drawing a line, e.g. the
                // cached lines on scroll-back, costs no more layout than a line without one.
                line.appendChild(this.createTranslationLineActionsAnchor(messageNode, content));
                const note = this.createTranslationPartialNote(line, messageNode, content, renderOptions?.partialInfo);
                if (note) line.appendChild(note);
            }
            this.plugin.syncTranslationSourceVisibility(line, content, sourceText);
            return line;
        }, scrollOptions);
    },

    renderTranslationLoading(messageNode, content, cacheKey = "", sourceText = null) {
        return this.plugin.withTranslationScrollStability(content, () => {
            const line = this.plugin.ensureTranslationNode(messageNode, content);
            line.classList.remove("dait-translation-error", "dait-translation-masked", "dait-translation-revealed", "dait-translation-partial");
            line.classList.add("dait-translation-loading");
            this.plugin.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
            this.plugin.restoreTranslationSourceVisibility(content);
            delete line.dataset.daitFailureType;
            delete line.dataset.daitValidationQuality;
            delete line.dataset.daitValidationReason;
            line.dataset.daitLoadingAt = String(Date.now());
            this.resetTranslationLineState(line);
            this.applyTranslationLineDismissal(line, messageNode, content);
            line.setAttribute?.("role", "status");
            line.setAttribute?.("aria-busy", "true");
            line.textContent = this.plugin.t("translationLoading");
            return line;
        });
    },

    renderTranslationError(messageNode, content, error, cacheKey = "", sourceText = null) {
        return this.plugin.withTranslationScrollStability(content, () => {
            const line = this.plugin.ensureTranslationNode(messageNode, content);
            line.classList.remove("dait-translation-loading", "dait-translation-masked", "dait-translation-revealed", "dait-translation-partial");
            line.classList.add("dait-translation-error");
            this.plugin.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
            this.plugin.restoreTranslationSourceVisibility(content);
            line.dataset.daitFailureType = this.plugin.getAutoTranslationFailureType(error);
            delete line.dataset.daitLoadingAt;
            delete line.dataset.daitValidationQuality;
            delete line.dataset.daitValidationReason;
            this.resetTranslationLineState(line);
            this.applyTranslationLineDismissal(line, messageNode, content);
            this.fillTranslationErrorLine(line, messageNode, content, error);
            return line;
        });
    },

    // Error lines say what went wrong in plain words and offer the action that fixes it:
    // settings for configuration problems, a connection test for a local service that is down,
    // the wait time for rate limits, and Retry for everything else.
    fillTranslationErrorLine(line, messageNode, content, error) {
        const presentation = this.getTranslationErrorPresentation(error);
        line.dataset.daitErrorAction = presentation.action;
        if (presentation.action !== "retry") line.title = this.plugin.formatError(error);
        line.textContent = "";
        const message = document.createElement("span");
        message.className = "dait-translation-error-message";
        message.textContent = presentation.message;
        line.appendChild(message);
        if (presentation.action === "settings") {
            line.appendChild(this.createTranslationErrorButton("translationOpenSettings", "translationOpenSettingsTitle", button => this.openTranslationSettingsFromChat(button)));
        }
        else if (presentation.action === "test") {
            line.appendChild(this.createTranslationErrorButton("translationTestConnection", "translationTestConnectionTitle", button => this.testTranslationConnectionFromChat(button)));
            line.appendChild(this.createTranslationRetryButton(line, messageNode, content));
        }
        else if (presentation.action === "wait") {
            this.scheduleTranslationErrorWaitEnd(line, messageNode, content, presentation.waitMs);
        }
        else {
            line.appendChild(this.createTranslationRetryButton(line, messageNode, content));
        }
        return presentation;
    },

    getTranslationErrorPresentation(error) {
        const attention = this.getTranslationAttentionType(error);
        if (attention === "config-endpoint") return { action: "settings", reason: attention, message: this.plugin.t("translationErrorMissingEndpoint") };
        if (attention === "config-model") return { action: "settings", reason: attention, message: this.plugin.t("translationErrorMissingModel") };
        if (attention === "config-key") return { action: "settings", reason: attention, message: this.plugin.t("translationErrorMissingKey") };
        if (attention === "endpoint") return { action: "settings", reason: attention, message: this.plugin.t(API_ENDPOINT_ERROR_MESSAGE_KEYS[error.code]) };
        if (attention === "auth") {
            // Some rejections pause the provider like a bad key, but the key is fine: say what is wrong.
            const rejection = this.getTranslationRejectionMessageKey(error);
            const text = rejection ? this.plugin.t(rejection).replace(/[。.]\s*$/, "") : this.plugin.t("translationErrorAuth");
            return { action: "settings", reason: attention, message: `${text}${this.formatTranslationErrorStatus(error)}` };
        }
        if (attention === "quota") {
            return { action: "settings", reason: attention, message: `${this.plugin.t("translationErrorQuota")}${this.formatTranslationErrorStatus(error)}` };
        }
        if (attention === "local-unavailable") {
            const host = this.getTranslationEndpointHost(error);
            return {
                action: "test",
                reason: attention,
                message: host ? this.plugin.t("translationErrorLocalAt", { host }) : this.plugin.t("translationErrorLocal")
            };
        }
        const type = this.plugin.getAutoTranslationFailureType(error);
        if (error?.googleTranslateKeysCooling) {
            // Say when the pool is back. A key cooling for hours (daily limit, rejected key) is not a
            // short wait: the settings can add a key or reset the cooldowns.
            const until = Number(error.googleTranslateCooldownUntil || 0);
            const waitMs = Math.max(0, until - Date.now());
            const message = this.plugin.formatGoogleTranslateCooldownMessage(until).replace(/[。.]\s*$/, "");
            return waitMs > AUTO_TRANSLATE_FAILURE_MAX_TTL
                ? { action: "settings", reason: type, message }
                : { action: "wait", reason: type, waitMs, message };
        }
        if (type === "rate-limit") {
            const waitMs = this.getTranslationErrorWaitMs(error);
            return {
                action: "wait",
                reason: type,
                waitMs,
                message: waitMs > 0
                    ? this.plugin.t("translationErrorRateLimitWait", { seconds: String(Math.ceil(waitMs / 1000)) })
                    : this.plugin.t("translationErrorRateLimit")
            };
        }
        return { action: "retry", reason: type, message: this.plugin.t("translationFailedInline", { error: this.plugin.formatError(error) }) };
    },

    // The HTTP status and, for Baidu (which answers HTTP 200), its own error code.
    formatTranslationErrorStatus(error) {
        const codes = [Number(error?.status || 0) || "", String(error?.baiduErrorCode || "")].filter(Boolean);
        if (!codes.length) return "";
        const text = codes.join(", ");
        return this.plugin.getLocale() === "en" ? ` (${text})` : `（${text}）`;
    },

    getTranslationRejectionMessageKey(error) {
        if (error?.providerLanguageUnsupported) return "errorLanguageUnsupported";
        if (error?.providerIpRejected) return "errorIpNotAllowed";
        if (error?.providerRequestRejected) return "errorProviderRequestRejected";
        return "";
    },

    // The local service that did not answer when the error says which; else the translation service set up now.
    getTranslationEndpointHost(error = null) {
        try {
            const endpoint = String(error?.localProviderEndpoint || this.plugin.getEffectiveTaskConfig("translation")?.endpoint || this.plugin.settings.translation?.endpoint || "").trim();
            return endpoint ? new URL(endpoint).host : "";
        }
        catch {
            return "";
        }
    },

    getTranslationErrorWaitMs(error, now = Date.now()) {
        const direct = Number(error?.retryAfterMs || 0);
        if (direct > 0) return direct;
        const failure = this.plugin.autoTranslationProviderFailures?.get?.(this.getTranslationAttentionProviderKey(error));
        const remaining = Number(failure?.retryAt || 0) - now;
        return remaining > 0 ? remaining : 0;
    },

    // Missing configuration shows up as plain errors thrown while building the request.
    getTranslationConfigMissingKind(error) {
        if (error?.googleTranslateNoKey) return "key";
        const message = String(error?.message || "");
        if (!message) return "";
        const matches = key => Object.values(I18N).some(table => table?.[key] === message);
        if (matches("apiKeyMissingTranslation")) return "key";
        if (matches("endpointMissing")) return "endpoint";
        if (matches("modelMissing")) return "model";
        return "";
    },

    // Errors only the user can fix; they get a settings or test action and one notice per episode.
    getTranslationAttentionType(error) {
        if (!error || this.plugin.isRequestCancelled(error)) return "";
        const missing = this.getTranslationConfigMissingKind(error);
        if (missing) return `config-${missing}`;
        if (Object.hasOwn(API_ENDPOINT_ERROR_MESSAGE_KEYS, error?.code)) return "endpoint";
        const type = this.plugin.getAutoTranslationFailureType(error);
        if (!["auth", "quota", "local-unavailable"].includes(type)) return "";
        // One Google key failing is not the user's problem while another key keeps translating.
        return this.plugin.isGoogleTranslatePoolServing(error) ? "" : type;
    },

    isTranslationAttentionError(error) {
        return Boolean(this.getTranslationAttentionType(error));
    },

    getTranslationAttentionProviderKey(error, requestOptions = undefined) {
        try {
            return String(error?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions) || "");
        }
        catch {
            return "";
        }
    },

    // An episode lasts until a request to that provider succeeds, the connection test passes or
    // its settings change; each error type is announced once per episode, whatever the toast switch says.
    rememberTranslationAttentionNotice(error, providerKey = "", type = this.getTranslationAttentionType(error)) {
        if (!type) return false;
        const key = this.getTranslationAttentionEpisodeKey(providerKey || this.getTranslationAttentionProviderKey(error));
        const notices = this.plugin.autoTranslationProviderNoticeAt;
        if (!notices?.set) return false;
        const episode = notices.get(key);
        if (episode?.types?.has?.(type)) return false;
        const types = episode?.types instanceof Set ? episode.types : new Set();
        types.add(type);
        notices.set(key, { at: Date.now(), types });
        while (notices.size > 32) notices.delete(notices.keys().next().value);
        return true;
    },

    notifyTranslationNeedsAttention(error, providerKey = "") {
        const type = this.getTranslationAttentionType(error);
        if (!type || !this.rememberTranslationAttentionNotice(error, providerKey, type)) return false;
        this.plugin.showToast(this.plugin.t("autoTranslateNeedsAttention", { error: this.getTranslationErrorPresentation(error).message }), "error");
        return true;
    },

    endTranslationAttentionEpisode(providerKey) {
        if (!providerKey || !this.plugin.autoTranslationProviderNoticeAt?.size) return false;
        return this.plugin.autoTranslationProviderNoticeAt.delete(this.getTranslationAttentionEpisodeKey(providerKey));
    },

    // Google errors carry the key that failed; for the user the whole key pool is one provider.
    getTranslationAttentionEpisodeKey(providerKey) {
        const key = String(providerKey || "");
        return key.startsWith("googleCloud\n---\n") ? this.plugin.getGoogleTranslateProviderKey() : key;
    },

    createTranslationErrorButton(labelKey, titleKey, run) {
        const button = document.createElement("button");
        button.className = "dait-translation-error-button";
        button.type = "button";
        button.textContent = this.plugin.t(labelKey);
        button.title = this.plugin.t(titleKey);
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            run(button);
        });
        return button;
    },

    createTranslationRetryButton(line, messageNode, content) {
        const retry = document.createElement("button");
        retry.className = "dait-translation-retry";
        retry.type = "button";
        retry.textContent = this.plugin.t("translateRetry");
        retry.title = this.plugin.t("translateRetryTitle");
        retry.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const currentContent = this.plugin.getTranslationContentForLine(line) || content;
            const textOptions = line.classList?.contains?.("dait-translation-preview")
                ? { includeReplyPreview: true }
                : null;
            if (!messageNode?.isConnected || !currentContent?.isConnected) {
                this.removeTranslationLineStably(line, currentContent);
                this.plugin.showToast(this.plugin.t("messageMissing"), "error");
                return;
            }

            const currentText = this.plugin.getElementText(currentContent, textOptions);
            if (!currentText || !this.isTranslationLineSourceMatch(line, currentText)) {
                this.removeTranslationLineStably(line, currentContent);
                this.plugin.showToast(this.plugin.t("messageMissing"), "error");
                return;
            }

            this.plugin.translateMessage(messageNode, currentContent, null, textOptions);
        });
        return retry;
    },

    removeTranslationLineStably(line, anchor = null) {
        if (!line) return;
        this.plugin.withTranslationScrollStability(anchor?.isConnected ? anchor : line, () => {
            if (anchor) this.plugin.restoreTranslationSourceVisibility(anchor);
            line.remove?.();
        });
    },

    // A rate-limit line has no button while the wait lasts; afterwards it offers Retry. One timer per line: a new
    // wait, a re-render, removing the line and stop() clear it, so it never holds a gone line for up to two minutes.
    scheduleTranslationErrorWaitEnd(line, messageNode, content, waitMs) {
        this.clearTranslationErrorWaitTimer(line);
        const delay = Number(waitMs || 0);
        if (!(delay > 0) || typeof setTimeout !== "function") return;
        const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
        line.dataset.daitErrorToken = token;
        const lifecycleToken = this.plugin.getLifecycleToken();
        const timer = setTimeout(() => {
            this.plugin.translationErrorWaitTimers?.delete?.(timer);
            if (line.__daitWaitTimer === timer) line.__daitWaitTimer = null;
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || !line.isConnected) return;
            if (line.dataset?.daitErrorToken !== token || line.dataset?.daitErrorAction !== "wait") return;
            const currentContent = this.plugin.getTranslationContentForLine(line) || content;
            this.plugin.withTranslationScrollStability(currentContent, () => {
                line.dataset.daitErrorAction = "retry";
                const message = line.querySelector?.(".dait-translation-error-message");
                if (message) message.textContent = this.plugin.t("translationErrorRateLimit");
                line.appendChild(this.createTranslationRetryButton(line, messageNode, currentContent));
            });
        }, Math.min(delay, AUTO_TRANSLATE_FAILURE_MAX_TTL) + 250);
        this.plugin.unrefTimer(timer);
        line.__daitWaitTimer = timer;
        if (!this.plugin.translationErrorWaitTimers) this.plugin.translationErrorWaitTimers = new Set();
        this.plugin.translationErrorWaitTimers.add(timer);
    },

    clearTranslationErrorWaitTimer(line) {
        const timer = line?.__daitWaitTimer;
        if (!timer) return;
        clearTimeout(timer);
        this.plugin.translationErrorWaitTimers?.delete?.(timer);
        line.__daitWaitTimer = null;
    },

    clearTranslationErrorWaitTimers() {
        (this.plugin.translationErrorWaitTimers || []).forEach(timer => clearTimeout(timer));
        this.plugin.translationErrorWaitTimers?.clear?.();
    },

    openTranslationSettingsFromChat(source = null) {
        if (this.plugin.settings?.ui) this.plugin.settings.ui.settingsActiveTab = SETTINGS_TAB_TRANSLATE;
        this.plugin.saveSettings({ debounce: true });
        return this.plugin.openQuickSettingsPanel("chat-line", source);
    },

    async testTranslationConnectionFromChat(button = null) {
        if (button?.disabled) return false;
        const lifecycleToken = this.plugin.getLifecycleToken();
        if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return false;
        const label = button?.textContent || this.plugin.t("translationTestConnection");
        // The test reports its own result; a failure must not also raise the auto-translate notice.
        this.rememberTranslationAttentionNotice(null, this.getTranslationAttentionProviderKey(null), "local-unavailable");
        this.plugin.setButtonBusy(button, true, this.plugin.t("apiTestBusy"));
        try {
            return (await this.plugin.testApiConnection("translation", null, null)) !== false;
        }
        finally {
            if (this.plugin.isLifecycleTokenCurrent(lifecycleToken)) this.plugin.setButtonBusy(button, false, label);
        }
    },

    resetTranslationLineState(line) {
        if (!line) return;
        this.clearTranslationErrorWaitTimer(line);
        ["role", "aria-busy", "aria-label", "aria-expanded", "tabindex", "title", "lang", "dir"].forEach(name => line.removeAttribute?.(name));
        if (line.dataset) {
            delete line.dataset.daitErrorAction;
            delete line.dataset.daitErrorToken;
            delete line.dataset.daitTag;
        }
        ["dait-translation-style-tint", "dait-translation-style-muted", "dait-translation-style-tag", "dait-translation-scale-90", "dait-translation-dismissed"]
            .forEach(name => line.classList?.remove?.(name));
        this.plugin.translationLineTexts?.delete?.(line);
    },

    getTranslationLineLanguage(targetLanguage = this.plugin.settings.translation?.targetLanguage) {
        const raw = String(targetLanguage || "").trim();
        if (this.plugin.translationLineLanguageMemo?.key === raw) return this.plugin.translationLineLanguageMemo.value;
        const normalized = this.plugin.normalizeLanguageName(raw);
        let code = LANGUAGE_PRESETS.find(item => item.value === normalized)?.code || "";
        if (!code && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(raw)) code = raw;
        if (!code) {
            /** @type {Array<[RegExp, string]>} */
            const namedRules = [
                [/arab|阿拉伯/i, "ar"],
                [/hebrew|希伯来/i, "he"],
                [/persian|farsi|波斯/i, "fa"],
                [/urdu|乌尔都/i, "ur"],
                [/pashto|普什图/i, "ps"],
                [/yiddish|意第绪/i, "yi"]
            ];
            const named = namedRules.find(([pattern]) => pattern.test(raw));
            code = named?.[1] || "";
        }
        if (code === "zh") code = "zh-CN";
        const primary = code.split("-")[0].toLowerCase();
        const value = { lang: code, dir: RTL_LANGUAGE_CODES.includes(primary) ? "rtl" : "auto" };
        this.plugin.translationLineLanguageMemo = { key: raw, value };
        return value;
    },

    // The translated text is in the target language: give it that language and a direction of its own,
    // so right-to-left targets read and align correctly. Only the text span gets them: the toolbar and
    // the partial note are in the interface language and follow the page's direction.
    applyTranslationLineLanguage(textElement) {
        const { lang, dir } = this.getTranslationLineLanguage();
        if (lang) textElement.setAttribute?.("lang", lang);
        textElement.setAttribute?.("dir", dir);
    },

    // Laid out right to left: the computed direction where there is layout, else the nearest dir attribute.
    isRightToLeftElement(element) {
        if (!element) return false;
        try {
            if (typeof getComputedStyle === "function" && element.nodeType === 1) return getComputedStyle(element)?.direction === "rtl";
        }
        catch {}
        return element.closest?.("[dir]")?.getAttribute?.("dir") === "rtl";
    },

    applyTranslationLineDisplayClasses(line) {
        if (!line) return;
        const style = ["tint", "muted", "tag"].includes(this.plugin.settings.ui?.translationStyle) ? this.plugin.settings.ui.translationStyle : "tint";
        ["tint", "muted", "tag"].forEach(name => line.classList?.toggle?.(`dait-translation-style-${name}`, name === style));
        line.classList?.toggle?.("dait-translation-scale-90", Number(this.plugin.settings.ui?.translationTextScale) === 90);
        if (!line.dataset) return;
        if (style === "tag") line.dataset.daitTag = this.plugin.t("translationTag");
        else delete line.dataset.daitTag;
    },

    // A masked translation is a real button: focusable, and Enter or Space reveals it.
    applyTranslationLineMaskState(line) {
        if (!line) return;
        if (line.classList?.contains?.("dait-translation-masked")) {
            line.setAttribute?.("role", "button");
            line.setAttribute?.("tabindex", "0");
            line.setAttribute?.("aria-expanded", "false");
            line.setAttribute?.("aria-label", this.plugin.t("translationRevealLabel"));
            return;
        }
        if (line.getAttribute?.("role") !== "button") return;
        ["role", "aria-expanded", "aria-label"].forEach(name => line.removeAttribute?.(name));
        if (typeof document !== "undefined" && document?.activeElement === line) line.setAttribute?.("tabindex", "-1");
        else line.removeAttribute?.("tabindex");
    },

    revealMaskedTranslationLine(line, content = null) {
        if (!line?.classList?.contains?.("dait-translation-masked")) return false;
        line.classList.remove("dait-translation-masked");
        line.classList.add("dait-translation-revealed");
        this.applyTranslationLineMaskState(line);
        this.plugin.syncTranslationSourceVisibility(line, content || this.plugin.getTranslationContentForLine(line));
        return true;
    },

    // Stands where the toolbar goes until the line is first hovered or focused: an empty span that keeps the
    // toolbar's one tab stop, so keyboard users reach it too.
    createTranslationLineActionsAnchor(messageNode, content) {
        /** @type {any} */
        const anchor = document.createElement("span");
        anchor.className = "dait-translation-actions-anchor";
        anchor.setAttribute?.("tabindex", "0");
        anchor.setAttribute?.("role", "toolbar");
        anchor.setAttribute?.("aria-label", this.plugin.t("translationActionsLabel"));
        anchor.__daitActionTarget = { messageNode, content };
        return anchor;
    },

    // Builds the toolbar in place of the anchor on the line's first pointerenter or focusin; keyboard focus that
    // landed on the anchor moves to the toolbar's first button.
    ensureTranslationLineActions(line) {
        const existing = line?.querySelector?.(":scope > .dait-translation-actions");
        if (existing) return existing;
        const anchor = line?.querySelector?.(":scope > .dait-translation-actions-anchor");
        if (!anchor) return null;
        const target = anchor.__daitActionTarget || {};
        const content = target.content || this.plugin.getTranslationContentForLine(line);
        const toolbar = this.plugin.createTranslationLineActions(line, target.messageNode || content?.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || null, content);
        const focused = typeof document !== "undefined" && document.activeElement === anchor;
        line.insertBefore(toolbar, anchor);
        anchor.remove?.();
        if (focused) toolbar.querySelector?.(".dait-translation-action")?.focus?.();
        return toolbar;
    },

    createTranslationLineActions(line, messageNode, content) {
        const toolbar = document.createElement("span");
        toolbar.className = "dait-translation-actions";
        toolbar.setAttribute?.("role", "toolbar");
        toolbar.setAttribute?.("aria-label", this.plugin.t("translationActionsLabel"));
        const currentContent = () => this.plugin.getTranslationContentForLine(line) || content;
        /** @type {Array<[string, string, () => any]>} */
        const actionSpecs = [
            ["copy", "translationActionCopy", () => this.plugin.copyTranslationLineText(line)],
            ["retranslate", "translationActionRetranslate", () => this.plugin.retranslateMessage(messageNode, currentContent())],
            ["hide", "translationActionHide", () => this.plugin.dismissTranslationLine(line, messageNode, currentContent())]
        ];
        actionSpecs.forEach(([name, labelKey, run], index) => {
            const button = document.createElement("button");
            const label = this.plugin.t(labelKey);
            button.className = `dait-translation-action dait-translation-action-${name}`;
            button.type = "button";
            button.title = label;
            button.setAttribute?.("aria-label", label);
            // One tab stop per toolbar; the arrow keys move between its buttons.
            button.setAttribute?.("tabindex", index === 0 ? "0" : "-1");
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                run();
            });
            toolbar.appendChild(button);
        });
        toolbar.addEventListener("keydown", event => this.handleTranslationActionsKeydown(toolbar, event));
        return toolbar;
    },

    handleTranslationActionsKeydown(toolbar, event) {
        // The arrow keys follow the visual order: in a right-to-left toolbar the next button is to the left.
        const forward = this.isRightToLeftElement(toolbar) ? "ArrowLeft" : "ArrowRight";
        const keys = { [forward]: 1, [forward === "ArrowRight" ? "ArrowLeft" : "ArrowRight"]: -1, Home: "first", End: "last" };
        const move = keys[event?.key];
        if (move === undefined) return;
        const buttons = [...(toolbar?.querySelectorAll?.(".dait-translation-action") || [])];
        if (!buttons.length) return;
        const current = Math.max(0, buttons.indexOf(event.target));
        const next = move === "first" ? 0 : move === "last" ? buttons.length - 1 : (current + Number(move) + buttons.length) % buttons.length;
        event.preventDefault?.();
        event.stopPropagation?.();
        buttons.forEach((button, index) => button.setAttribute?.("tabindex", index === next ? "0" : "-1"));
        buttons[next].focus?.();
    },

    // The toolbar sits after the end of a short line; when the line fills the message width it moves
    // inside the line's bottom-right corner so it is never cut off.
    placeTranslationLineActions(line) {
        const toolbar = line?.querySelector?.(":scope > .dait-translation-actions");
        if (!toolbar?.dataset || !line.getBoundingClientRect) return;
        const lineRect = line.getBoundingClientRect();
        const bounds = (line.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || line.parentElement)?.getBoundingClientRect?.();
        if (!lineRect || !bounds) return;
        const width = Number(toolbar.offsetWidth || 0) || 96;
        // The toolbar goes after the line's inline end: on the left when the line runs right to left.
        const room = this.isRightToLeftElement(line) ? lineRect.left - bounds.left : bounds.right - lineRect.right;
        const placement = room >= width + 8 ? "end" : "inside";
        if (toolbar.dataset.daitPlacement !== placement) toolbar.dataset.daitPlacement = placement;
    },

    // Contract with the long-text pipeline: renderOptions.partialInfo = { missingSegments: [1-based], totalSegments }.
    createTranslationPartialNote(line, messageNode, content, partialInfo) {
        if (!partialInfo || typeof partialInfo !== "object") return null;
        const total = Number(partialInfo.totalSegments);
        const hasTotal = Number.isInteger(total) && total > 0;
        const missing = Array.isArray(partialInfo.missingSegments)
            ? [...new Set(partialInfo.missingSegments.map(Number))]
                .filter(index => Number.isInteger(index) && index > 0 && (!hasTotal || index <= total))
                .sort((left, right) => left - right)
            : [];
        const text = missing.length && hasTotal
            ? this.plugin.t(missing.length === 1 ? "translationPartialOne" : "translationPartialMany", {
                parts: this.formatTranslationPartList(missing),
                total: String(total)
            })
            : this.plugin.t("translationPartialUnknown");
        const note = document.createElement("div");
        note.className = "dait-translation-note";
        note.setAttribute?.("role", "note");
        const message = document.createElement("span");
        message.className = "dait-translation-note-message";
        message.textContent = text;
        note.appendChild(message);
        const button = document.createElement("button");
        button.className = "dait-translation-note-button";
        button.type = "button";
        button.textContent = this.plugin.t("translationRetranslate");
        button.title = this.plugin.t("translationRetranslateTitle");
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.retranslateMessage(messageNode, this.plugin.getTranslationContentForLine(line) || content);
        });
        note.appendChild(button);
        return note;
    },

    formatTranslationPartList(parts) {
        const values = parts.map(String);
        if (this.plugin.getLocale() !== "en") return values.join("、");
        if (values.length < 2) return values.join("");
        return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
    },

    retranslateMessage(messageNode, content, textOptions = null) {
        if (!messageNode || !content?.isConnected) {
            this.plugin.showToast(this.plugin.t("messageMissing"), "error");
            return null;
        }
        return this.plugin.translateMessage(messageNode, content, null, textOptions, { bypassCache: true });
    },

    async copyTranslationLineText(line) {
        const text = this.plugin.translationLineTexts?.get?.(line) ?? this.getTranslationLineRenderedText(line);
        if (!text) return false;
        try {
            await this.plugin.copyTextToClipboard(text);
            this.plugin.showToast(this.plugin.t("translationCopied"), "success");
            return true;
        }
        catch (error) {
            this.plugin.showToast(this.plugin.t("promptCopyFailed", { error: this.plugin.formatError(error) }), "error");
            return false;
        }
    },

    getTranslatedLineForContextTarget(target) {
        const messageNode = target?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        const content = messageNode ? this.plugin.getMessageContentElement(messageNode) : null;
        const line = content ? this.plugin.getTranslationLine(content) : null;
        if (!line || ["dait-translation-loading", "dait-translation-error", "dait-translation-dismissed"].some(name => line.classList?.contains?.(name))) return null;
        return { messageNode, content, line };
    },

    // "Hide" keeps a hidden line for that message (so nothing redraws it) until the user translates it again.
    getTranslationDismissKey(messageNode, content, textOptions = null) {
        const kind = this.plugin.isReplyPreviewElement(content) ? "reply-preview" : "message";
        const ids = this.plugin.messageTracker?.getNodeMessageIds?.(messageNode) || {};
        if (ids.messageId) return `${ids.channelId || ""}:${ids.messageId}:${kind}`;
        const text = content ? this.plugin.getElementText(content, textOptions || (kind === "reply-preview" ? { includeReplyPreview: true } : null)) : "";
        return text ? `text:${kind}:${this.plugin.getStrongTextFingerprint(text)}` : "";
    },

    isTranslationLineDismissed(messageNode, content, textOptions = null) {
        if (!this.plugin.dismissedTranslationMessages?.size) return false;
        const key = this.getTranslationDismissKey(messageNode, content, textOptions);
        return Boolean(key && this.plugin.dismissedTranslationMessages.has(key));
    },

    clearTranslationLineDismissal(messageNode, content, textOptions = null) {
        if (!this.plugin.dismissedTranslationMessages?.size) return false;
        const key = this.getTranslationDismissKey(messageNode, content, textOptions);
        return Boolean(key && this.plugin.dismissedTranslationMessages.delete(key));
    },

    applyTranslationLineDismissal(line, messageNode, content) {
        line?.classList?.toggle?.("dait-translation-dismissed", this.isTranslationLineDismissed(messageNode, content));
    },

    dismissTranslationLine(line, messageNode = null, content = null) {
        if (!line) return false;
        const target = content || this.plugin.getTranslationContentForLine(line);
        const owner = messageNode || line.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || null;
        const key = this.getTranslationDismissKey(owner, target);
        if (key) {
            this.plugin.dismissedTranslationMessages.delete(key);
            this.plugin.dismissedTranslationMessages.set(key, Date.now());
            while (this.plugin.dismissedTranslationMessages.size > 500) {
                this.plugin.dismissedTranslationMessages.delete(this.plugin.dismissedTranslationMessages.keys().next().value);
            }
        }
        const hadFocus = typeof document !== "undefined" && Boolean(document?.activeElement && line.contains?.(document.activeElement));
        this.plugin.withTranslationScrollStability(target?.isConnected ? target : line, () => {
            line.classList?.add?.("dait-translation-dismissed");
            if (target) this.plugin.restoreTranslationSourceVisibility(target);
        });
        if (hadFocus) {
            // The focused button is gone. Discord's focusable message element is the inner
            // [data-list-item-id] one; the outer list item is not focusable, so focus would drop to <body>.
            const focusTarget = line.closest?.("[data-list-item-id][tabindex]")
                || owner?.querySelector?.("[data-list-item-id][tabindex]")
                || owner;
            try { focusTarget?.focus?.({ preventScroll: true }); }
            catch {}
        }
        return true;
    },

    retryAutoTranslationTarget(messageNode, content, text, textOptions = null, line = null) {
        if (!this.plugin.settings.translation.enabled) {
            this.plugin.showToast(this.plugin.t("translationDisabled"), "info");
            return;
        }
        if (!this.plugin.hasUsableApiConfig("translation")) {
            this.plugin.showToast(this.plugin.t("apiKeyMissingTranslation"), "error");
            return;
        }

        const baseOptions = this.plugin.getAutoTranslationRequestOptionsForText(text, this.plugin.getAutoTranslationOptions());
        const requestOptions = this.withMessageIdentity(baseOptions, messageNode, content, text);
        const cacheKey = this.plugin.getTranslationCacheKey(text, requestOptions);
        this.plugin.clearAutoTranslationFailure(cacheKey, requestOptions, { clearProvider: true });
        this.clearAutoTextTranslationFailure(text, requestOptions);
        line?.remove?.();

        const cachedTranslation = this.plugin.getTranslationCacheValue(cacheKey, this.plugin.getTranslationCacheAliases(text, requestOptions));
        if (cachedTranslation !== null) {
            if (this.plugin.isInvalidAutoTranslationCacheValue(text, cachedTranslation, requestOptions)) {
                this.plugin.deleteTranslationCacheCandidates(cacheKey, ...this.plugin.getTranslationCacheAliases(text, requestOptions));
            }
            else {
            this.plugin.renderTranslation(messageNode, content, cachedTranslation, cacheKey, text);
            return;
            }
        }
        const textCachedTranslation = this.plugin.getAutoTextTranslationCacheValue(text, requestOptions);
        if (textCachedTranslation !== null) {
            if (this.plugin.isInvalidAutoTranslationCacheValue(text, textCachedTranslation, requestOptions)) {
                this.plugin.deleteTranslationCacheCandidates(this.plugin.getAutoTextTranslationCacheKey(text, requestOptions), ...this.plugin.getAutoTextTranslationCacheAliases(text, requestOptions));
            }
            else {
                this.plugin.renderTranslation(messageNode, content, textCachedTranslation, cacheKey, text);
                return;
            }
        }

        const item = { messageNode, content, text, textOptions, targetKind: this.plugin.isReplyPreviewElement(content) ? "reply-preview" : "message", cacheKey, requestOptions };
        this.plugin.addAutoTranslationPendingTarget(cacheKey, item);
        this.plugin.enqueueAutoTranslationItem(item);
        this.plugin.drainAutoTranslationQueue();
    },

    ensureTranslationNode(messageNode, content) {
        let line = this.plugin.getTranslationLine(content);
        if (line && this.plugin.getTranslationContentForLine(line) !== content) {
            line = null;
        }

        if (!line) {
            line = document.createElement(this.plugin.isReplyPreviewElement(content) ? "span" : "div");
            line.className = "dait-translation-line";
            line.dataset.daitOwner = this.ensureTranslationOwnerId(content);
            line.addEventListener("keydown", event => {
                if (event.target !== line || !line.classList.contains("dait-translation-masked")) return;
                if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
                event.preventDefault();
                event.stopPropagation();
                this.plugin.withTranslationScrollStability(content, () => this.revealMaskedTranslationLine(line, content));
            });
            line.addEventListener("pointerenter", () => {
                this.ensureTranslationLineActions(line);
                this.placeTranslationLineActions(line);
            });
            line.addEventListener("focusin", () => {
                this.ensureTranslationLineActions(line);
                this.placeTranslationLineActions(line);
            });
            line.addEventListener("click", event => {
                if (!line.classList.contains("dait-translation-masked")) return;
                event.preventDefault();
                event.stopPropagation();
                this.plugin.withTranslationScrollStability(content, () => this.revealMaskedTranslationLine(line, content));
            });
        }

        const anchor = this.getTranslationAnchor(messageNode, content);
        if (line.parentElement !== anchor) {
            line.remove();
        }
        this.plugin.getTranslationLines(content).forEach(existing => {
            if (existing !== line) existing.remove();
        });

        if (anchor === content) {
            if (this.plugin.settings.ui.translationPosition === "before") {
                if (line.parentElement !== anchor || line !== anchor.firstChild) anchor.insertBefore(line, anchor.firstChild || null);
            }
            else if (line.parentElement !== anchor || line !== anchor.lastChild) {
                anchor.appendChild(line);
            }
        }
        else if (this.plugin.settings.ui.translationPosition === "before") {
            if (line.nextSibling !== content) anchor.insertBefore(line, content || anchor.firstChild);
        }
        else {
            const reference = content?.nextSibling || null;
            if (line.previousSibling !== content) anchor.insertBefore(line, reference);
        }

        return line;
    },

    getTranslationAnchor(messageNode, content) {
        if (this.plugin.isReplyPreviewElement(content)) return content;
        return content?.parentElement || content || messageNode;
    },

    setTranslationLineMetadata(line, messageNode, content, cacheKey = "", sourceText = null) {
        const text = sourceText ?? this.plugin.getElementText(content);
        const effectiveCacheKey = cacheKey || this.plugin.getTranslationCacheKey(text, this.withMessageIdentity({ mode: "manual" }, messageNode, content, text));
        line.dataset.daitCacheKey = this.plugin.getTextFingerprint(effectiveCacheKey);
        line.dataset.daitCacheSig = this.plugin.getStrongTextFingerprint(effectiveCacheKey);
        line.dataset.daitSourceKey = this.plugin.getTextFingerprint(text);
        line.dataset.daitSourceSig = this.plugin.getStrongTextFingerprint(text);
        line.dataset.daitIdentityKey = this.getTranslationIdentityFingerprintFromCacheKey(effectiveCacheKey)
            || this.plugin.getTextFingerprint(this.plugin.getMessageIdentity(messageNode, content, text));
        line.dataset.daitIdentitySig = this.getTranslationIdentitySignatureFromCacheKey(effectiveCacheKey)
            || this.plugin.getStrongTextFingerprint(this.plugin.getMessageIdentity(messageNode, content, text));
        line.dataset.daitMode = this.plugin.getTranslationCacheMode(effectiveCacheKey);
        line.dataset.daitOwner = this.ensureTranslationOwnerId(content);
        line.classList?.toggle?.("dait-translation-preview", this.plugin.isReplyPreviewElement(content));
        this.removeDuplicateTranslationLinesForLine(line, messageNode, content);
    },

    removeDuplicateTranslationLinesForLine(line, messageNode, content) {
        if (!line || !content) return;
        const sourceSig = line.dataset?.daitSourceSig || "";
        const sourceKey = line.dataset?.daitSourceKey || "";
        const cacheSig = line.dataset?.daitCacheSig || "";
        const cacheKey = line.dataset?.daitCacheKey || "";
        const identitySig = line.dataset?.daitIdentitySig || "";
        const identityKey = line.dataset?.daitIdentityKey || "";
        if (!sourceSig && !sourceKey) return;
        const isPreview = Boolean(line.classList?.contains?.("dait-translation-preview"));
        const scopes = [
            messageNode?.querySelectorAll ? messageNode : null,
            content?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']"),
            content?.parentElement
        ].filter(Boolean);
        const seen = new Set();
        for (const scope of scopes) {
            for (const other of scope?.querySelectorAll?.(".dait-translation-line[data-dait-owner]") || []) {
                if (!other || other === line || seen.has(other)) continue;
                seen.add(other);
                if (other.dataset?.daitMode === "manual") continue;
                if (Boolean(other.classList?.contains?.("dait-translation-preview")) !== isPreview) continue;
                const sourceMatches = sourceSig
                    ? other.dataset?.daitSourceSig === sourceSig
                    : other.dataset?.daitSourceKey === sourceKey;
                if (!sourceMatches) continue;
                const cacheMatches = (cacheSig && other.dataset?.daitCacheSig === cacheSig)
                    || (cacheKey && other.dataset?.daitCacheKey === cacheKey);
                const identityMatches = (identitySig && other.dataset?.daitIdentitySig === identitySig)
                    || (identityKey && other.dataset?.daitIdentityKey === identityKey);
                if (!cacheMatches && !identityMatches) continue;
                this.plugin.restoreTranslationSourceVisibility(this.plugin.getTranslationContentForLine(other));
                other.remove?.();
            }
        }
    },

    isTranslationLineSourceMatch(line, text) {
        const value = String(text || "");
        if (line?.dataset?.daitSourceSig) return line.dataset.daitSourceSig === this.plugin.getStrongTextFingerprint(value);
        return line?.dataset?.daitSourceKey === this.plugin.getTextFingerprint(value);
    },

    isTranslationLineMessageMatch(line, messageNode, content, text) {
        const identity = this.plugin.getMessageIdentity(messageNode, content, text);
        if (line.dataset?.daitIdentitySig) return line.dataset.daitIdentitySig === this.plugin.getStrongTextFingerprint(identity);
        return line.dataset?.daitIdentityKey === this.plugin.getTextFingerprint(identity);
    },

    removeTranslationNode(messageNode, content = null, options = null) {
        if (options) {
            const line = options.manualLoadingLine;
            if (line?.isConnected && line.dataset?.daitMode === "manual"
                && line.dataset.daitOwner === this.peekTranslationOwnerId(content)
                && line.classList?.contains?.("dait-translation-loading")) {
                this.clearTranslationErrorWaitTimer(line);
                line.remove();
            }
            return;
        }
        if (content) {
            this.plugin.getTranslationLines(content).forEach(line => {
                this.plugin.restoreTranslationSourceVisibility(content);
                this.clearTranslationErrorWaitTimer(line);
                line.remove();
            });
            const childLine = content.querySelector(":scope > .dait-translation-line");
            if (childLine) {
                this.plugin.restoreTranslationSourceVisibility(content);
                this.clearTranslationErrorWaitTimer(childLine);
                childLine.remove();
            }
            return;
        }

        const line = messageNode.querySelector(".dait-translation-line");
        if (line) {
            this.plugin.restoreTranslationSourceVisibility(this.plugin.getTranslationContentForLine(line));
            this.clearTranslationErrorWaitTimer(line);
            line.remove();
        }
    },

    hideAutoTranslationWarningLines() {
        if (typeof document === "undefined") return;
        document.querySelectorAll(".dait-translation-line.dait-translation-error").forEach(/** @param {any} line */ line => {
            const mode = String(line.dataset?.daitMode || "");
            if (!this.plugin.isAutoTranslationCacheMode(mode)) return;
            const type = String(line.dataset?.daitFailureType || "invalid-output");
            if (["auth", "rate-limit", "server", "client"].includes(type)) return;
            this.plugin.restoreTranslationSourceVisibility(this.plugin.getTranslationContentForLine(line));
            line.remove();
        });
    },

    setButtonBusy(button, busy, text) {
        if (!button) return;
        if (button.dataset?.daitFullLabel || button.classList?.contains?.("dait-input-action-menu-button")) {
            // Composer buttons keep their (density-aware) label and show busy as a state instead.
            button.disabled = Boolean(busy);
            button.classList?.toggle?.("dait-busy", Boolean(busy));
            if (busy) button.setAttribute?.("aria-busy", "true");
            else button.removeAttribute?.("aria-busy");
            this.plugin.renderInputActionButtonLabel(button);
            return;
        }
        button.disabled = busy;
        button.textContent = text;
    },

    getTranslationLineCacheAliases(text, options = {}) {
        return this.plugin.getTranslationCacheAliases(text, options, { includePreMessageIdentity: false, includePlaceholderModel: true });
    },

    getAutoTextTranslationFailureKey(text, options = {}) {
        return this.plugin.getAutoTextTranslationCacheKey(text, options);
    },

    getAutoTextTranslationFailure(text, options = {}) {
        const key = this.getAutoTextTranslationFailureKey(text, options);
        const failure = key ? this.plugin.autoTranslationFailures.get(key) : null;
        if (failure && this.plugin.isAutoTranslationFailureExpired(failure)) {
            this.plugin.rememberAutoTranslationFailureHistory(key, failure);
            this.plugin.autoTranslationFailures.delete(key);
            return null;
        }
        return failure || null;
    },

    normalizeTranslationMessageIdentity(identity) {
        return String(identity || "").trim().replace(/\s+/g, " ");
    },

    withMessageIdentity(options, messageNode, content, text) {
        return {
            ...options,
            messageIdentity: this.plugin.getMessageIdentity(messageNode, content, text)
        };
    },

    getMessageIdentity(messageNode, content, text) {
        return this.plugin.messageTracker.getIdentity(messageNode, content, text);
    }
};

const TRANSLATION_LINE_DOM_METHOD_NAMES = attachControllerMethods(DiscordTranslationLineDomController, [methods]);

module.exports = {
    DiscordTranslationLineDomController,
    TRANSLATION_LINE_DOM_METHOD_NAMES
};
