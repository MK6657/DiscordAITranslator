"use strict";

// Phase 6 pre-step B: auto-translation scan work, request pipeline (batch, long-text, retries), request options and text eligibility policies.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_CLOUD_LONG_TEXT_TIMEOUT_MAX_MS,
    AUTO_TRANSLATE_FALLBACK_REQUEUE_DELAY_MS,
    AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH,
    AUTO_TRANSLATE_LOCAL_LONG_TEXT_CHUNK_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
    AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS,
    AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS,
    AUTO_TRANSLATE_PRECHECK_SKIP_MAX,
    AUTO_TRANSLATE_PRECHECK_SKIP_TTL_MS,
    AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
    AUTO_TRANSLATE_SINGLE_FALLBACK_LIMIT,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_FAILURE_CLASSES,
    DIAGNOSTIC_FAILURE_LAYERS,
    DIAGNOSTIC_MESSAGE_STATES,
    DIAGNOSTIC_REASON_CODES,
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH,
    MANUAL_TRANSLATION_REQUEST_BUDGET,
    MANUAL_TRANSLATION_REQUEST_BUDGET_MAX,
    MANUAL_TRANSLATION_RESCUE_REQUEST_ALLOWANCE,
    MODEL_REQUEST_TIMEOUT_MS,
    TRANSLATION_VALIDATION_QUALITIES
} = require("../constants");
const { removeStandardEmoji } = require("../intake/emoji-text");

class AutoTranslationRequestPipeline {
    constructor(plugin) {
        this.plugin = plugin;
    }

    scheduleCacheOnlyAutoTranslationScan(reason = "deferred", delayMs = 0) {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return;
        }
        const delay = Math.max(0, Number(delayMs) || 0);
        const dueAt = Date.now() + delay;
        if (this.plugin.cacheOnlyScanTimer && this.plugin.cacheOnlyScanDueAt && this.plugin.cacheOnlyScanDueAt <= dueAt) return;
        if (this.plugin.cacheOnlyScanTimer) clearTimeout(this.plugin.cacheOnlyScanTimer);
        this.plugin.cacheOnlyScanDueAt = dueAt;
        this.plugin.cacheOnlyScanTimer = setTimeout(() => {
            this.plugin.cacheOnlyScanTimer = null;
            this.plugin.cacheOnlyScanDueAt = 0;
            this.plugin.runCacheOnlyAutoTranslationScan(reason);
        }, delay);
    }

    runCacheOnlyAutoTranslationScan(reason = "deferred") {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return 0;
        }
        if (this.plugin.isDiscordMediaViewerQuiet() || this.plugin.isDiscordMediaViewerOpen() || this.plugin.isQuickSettingsPanelOpen() || this.plugin.isDiscordSettingsSurfaceOpen()) {
            this.plugin.scheduleCacheOnlyAutoTranslationScan(reason, Math.max(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, this.plugin.getDiscordMediaViewerQuietRemainingMs()) + 80);
            return 0;
        }
        const stabilityDelay = Math.max(
            this.plugin.getAutoTranslationRenderPauseRemainingMs(),
            this.plugin.getAutoTranslationViewportSettleRemainingMs(),
            this.plugin.getAutoTranslationJumpCooldownRemainingMs()
        );
        if (stabilityDelay > 0) {
            this.plugin.scheduleCacheOnlyAutoTranslationScan(reason, stabilityDelay + 80);
            return 0;
        }
        const context = this.plugin.createScanContext();
        const messages = context.messageNodes?.length || 0;
        this.plugin.queueAutoTranslateVisibleMessages(context, { cacheOnly: true });
        this.plugin.logDiagnostic("scan.cache-only", "ok", { reason, messages });
        return messages;
    }

    queueAutoTranslateVisibleMessages(context = this.plugin.createScanContext(), options = {}) {
        const work = this.plugin.createAutoTranslationScanWork(context, options);
        if (!work) return;
        const candidates = this.plugin.createAutoTranslationCandidates(context);
        work.scanStats.candidates = candidates.length;
        this.plugin.processAutoTranslationScanCandidates(work, candidates);
        this.plugin.finishAutoTranslationScanWork(work);
    }

    createAutoTranslationScanWork(context = this.plugin.createScanContext(), options = {}) {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return null;
        }

        const now = Date.now();
        let queued = 0;
        const batchSize = this.plugin.getAutoTranslateBatchSize();
        const queueLimit = this.plugin.getAutoTranslateQueueLimit();
        const messageNodes = context.messageNodes;
        const requestOptions = this.plugin.getAutoTranslationOptions();
        const hasUsableApi = this.plugin.hasUsableApiConfig("translation", requestOptions?.configOverrides);
        const renderPaused = this.plugin.isAutoTranslationRenderPaused(now);
        const viewportSettling = this.plugin.isAutoTranslationViewportSettling(now);
        const jumpCoolingDown = this.plugin.isAutoTranslationJumpCoolingDown(now);
        const viewportStabilityPending = hasUsableApi ? this.plugin.isAutoTranslationViewportStabilityPending(context, now) : false;
        const cacheOnly = Boolean(options.cacheOnly);
        const viewportApiBlocked = cacheOnly || renderPaused || jumpCoolingDown || viewportSettling || viewportStabilityPending;
        const layoutUnstable = jumpCoolingDown || viewportSettling || viewportStabilityPending;
        this.plugin.pruneAutoTranslationQueue();
        if (renderPaused) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationRenderPauseRemainingMs(now), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
        }
        const providerFailure = this.plugin.getAutoTranslationProviderFailure(requestOptions);
        if (providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure, now)) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationFailureRemainingMs(providerFailure, now));
        }
        const providerCoolingDown = Boolean(providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure, now));
        const localProviderHealthBlocked = hasUsableApi && !providerCoolingDown && !cacheOnly && this.plugin.shouldBlockAutoTranslationForLocalProviderHealth(requestOptions);
        const apiWorkBlocked = !hasUsableApi || viewportApiBlocked || providerCoolingDown || localProviderHealthBlocked;
        const blockReason = !hasUsableApi
            ? "missing-api"
            : cacheOnly
                ? "cache-only"
                : renderPaused
                    ? "render-paused"
                    : jumpCoolingDown
                        ? "jump-cooldown"
                        : viewportSettling
                        ? "viewport-settling"
                        : viewportStabilityPending
                            ? "stability-pending"
                            : providerCoolingDown
                                ? "provider-cooldown"
                                : localProviderHealthBlocked
                                    ? "local-provider-health"
                                    : "";
        const scanStats = {
            messages: messageNodes.length,
            seen: 0,
            eligible: 0,
            cacheHits: 0,
            textCacheHits: 0,
            enqueued: 0,
            blocked: 0,
            failures: 0,
            active: 0,
            visibleDeferred: 0,
            skippedCurrent: 0,
            skippedLanguage: 0
        };
        if (jumpCoolingDown) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationJumpCooldownRemainingMs(now));
        }
        if (viewportSettling) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationViewportSettleRemainingMs(now));
        }
        if (localProviderHealthBlocked) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getLocalProviderHealthRetryMs(requestOptions, now), { minDelayMs: LOCAL_PROVIDER_HEALTH_RETRY_MS });
        }

        const scanState = {
            now,
            batchSize,
            queueLimit,
            queued,
            context,
            requestOptions,
            hasUsableApi,
            renderPaused,
            viewportSettling,
            jumpCoolingDown,
            viewportStabilityPending,
            cacheOnly,
            viewportApiBlocked,
            layoutUnstable,
            providerFailure,
            providerCoolingDown,
            localProviderHealthBlocked,
            apiWorkBlocked,
            blockReason
        };
        Object.defineProperty(scanStats, "__scanState", {
            value: scanState,
            enumerable: false,
            configurable: true
        });
        return {
            scanState,
            scanStats,
            context,
            requestOptions,
            apiWorkBlocked,
            blockReason,
            cacheOnly,
            hasUsableApi,
            renderPaused,
            viewportSettling,
            jumpCoolingDown,
            viewportStabilityPending,
            providerCoolingDown,
            localProviderHealthBlocked
        };
    }

    processAutoTranslationScanCandidates(work, candidates = []) {
        if (!work?.scanState || !work?.scanStats) return 0;
        for (const candidate of candidates) {
            work.scanStats.seen++;
            const decision = this.plugin.evaluateAutoTranslationCandidate(candidate, work.scanState);
            this.plugin.applyAutoTranslationDecision(candidate, decision, work.scanStats);
        }
        return candidates.length;
    }

    finishAutoTranslationScanWork(work) {
        if (!work?.scanState || !work?.scanStats) return;
        const { scanState, scanStats, context, requestOptions } = work;
        if (scanStats.eligible || scanStats.cacheHits || scanStats.textCacheHits || scanStats.enqueued || scanStats.blocked || scanStats.failures) {
            this.plugin.logDiagnostic("auto.scan", work.apiWorkBlocked ? "blocked" : "ok", {
                ...this.plugin.getDiagnosticBaseMeta("auto", requestOptions?.mode || "auto", work.apiWorkBlocked ? this.plugin.getAutoTranslationBlockReasonCode(work.blockReason) : ""),
                messageState: work.apiWorkBlocked ? DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE : DIAGNOSTIC_MESSAGE_STATES.DISCOVERED,
                ...scanStats,
                cacheOnly: work.cacheOnly,
                hasUsableApi: work.hasUsableApi,
                renderPaused: work.renderPaused,
                viewportSettling: work.viewportSettling,
                jumpCoolingDown: work.jumpCoolingDown,
                viewportStabilityPending: work.viewportStabilityPending,
                providerCoolingDown: work.providerCoolingDown,
                localProviderHealthBlocked: work.localProviderHealthBlocked,
                blockReason: work.blockReason,
                intakeMode: context.autoTranslateIntake?.mode || this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui?.autoTranslateIntakeMode),
                intakeSource: context.autoTranslateIntake?.source || "dom",
                bdfdbAvailable: Boolean(context.autoTranslateIntake?.bdfdbAvailable),
                queueLength: this.plugin.autoTranslationQueue.length,
                inFlight: this.plugin.autoTranslationInFlight
            });
        }
        if (!work.apiWorkBlocked) this.plugin.drainAutoTranslationQueue();
        if (!work.apiWorkBlocked && scanStats.visibleDeferred > 0) {
            this.plugin.scheduleAutoTranslationRetryScan(AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS, { minDelayMs: AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS });
        }
    }

    evaluateAutoTranslationCandidate(candidate, scanState = {}) {
        const target = candidate || {};
        const text = String(target.text || "");
        const requestOptions = scanState.requestOptions || this.plugin.getAutoTranslationOptions();
        const now = Number(scanState.now || Date.now());
        const precheckSkipReason = this.plugin.getAutoTranslationPrecheckSkipReason(text, requestOptions);
        if (precheckSkipReason) {
            return {
                action: "skip",
                status: "skipped",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.NOT_ELIGIBLE_LANGUAGE,
                counts: { skippedLanguage: 1 },
                extra: { precheckSkipReason }
            };
        }

        const targetVisible = this.plugin.isAutoTranslationTargetVisibleCached(target, scanState.context);
        const explicitHistoryRequest = Boolean(target.daitHistoryRequest);
        if (!this.plugin.isAutoTranslationPrefetchConfigured() && !targetVisible && !explicitHistoryRequest) {
            return {
                action: "block",
                status: "blocked",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.PREFETCH_DISABLED,
                counts: { eligible: 1, blocked: 1 },
                extra: { targetVisible }
            };
        }
        if (scanState.layoutUnstable && !targetVisible && !explicitHistoryRequest) {
            return {
                action: "block",
                status: "blocked",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.LAYOUT_UNSTABLE_PREFETCH,
                counts: { eligible: 1, blocked: 1 },
                extra: {
                    targetVisible,
                    renderPaused: Boolean(scanState.renderPaused),
                    viewportSettling: Boolean(scanState.viewportSettling),
                    jumpCoolingDown: Boolean(scanState.jumpCoolingDown),
                    viewportStabilityPending: Boolean(scanState.viewportStabilityPending)
                }
            };
        }

        const targetRequestOptions = this.plugin.withAutoTranslationCandidateIdentity(
            this.plugin.getAutoTranslationRequestOptionsForText(text, requestOptions),
            target
        );
        const targetWithOptions = { ...target, requestOptions: targetRequestOptions };
        if (this.plugin.isGoogleTranslateProvider(this.plugin.getEffectiveTaskConfig("translation", targetRequestOptions?.configOverrides))
            && this.plugin.settings.googleTranslate?.allowPrefetch === false
            && !targetVisible) {
            return {
                action: "block",
                status: "blocked",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.GOOGLE_PREFETCH_DISABLED,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1, blocked: 1 },
                extra: { targetVisible }
            };
        }

        const cacheKey = this.plugin.getTranslationCacheKey(text, targetRequestOptions);
        const cacheAliases = this.plugin.getTranslationCacheAliases(text, targetRequestOptions);
        const lineCacheAliases = this.plugin.getTranslationLineCacheAliases(text, targetRequestOptions);
        const canRenderCacheHit = targetVisible && !scanState.renderPaused && !scanState.layoutUnstable;
        if (this.plugin.hasCurrentTranslationLine(target.content, cacheKey, this.plugin.getAutoTranslationTargetDomText(target), lineCacheAliases, targetRequestOptions, text)) {
            return {
                action: "skip",
                status: "skipped",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.CURRENT_TRANSLATION_PRESENT,
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1, skippedCurrent: 1 }
            };
        }

        // Discord rebuilds message elements while scrolling, dropping their translation line.
        // A cached translation is always drawn again; a recent render only blocks new requests below.
        if (this.plugin.hasTranslationCacheCandidate(cacheKey, cacheAliases)) {
            const cachedTranslation = this.plugin.getTranslationCacheValueCached(cacheKey, cacheAliases, scanState.context);
            if (cachedTranslation !== null) {
                if (this.plugin.isInvalidAutoTranslationCacheValue(text, cachedTranslation, targetRequestOptions)) {
                    return {
                        action: "block",
                        status: "failed",
                        state: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                        reasonCode: DIAGNOSTIC_REASON_CODES.INVALID_CACHE,
                        cacheKey,
                        requestOptions: targetRequestOptions,
                        cacheAliases,
                        discardCache: true,
                        counts: {}
                    };
                }
                return {
                    action: "render-cache",
                    status: "cache-hit",
                    state: DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                    reasonCode: DIAGNOSTIC_REASON_CODES.CACHE_HIT,
                    cacheKey,
                    requestOptions: targetRequestOptions,
                    cachedTranslation,
                    canRender: canRenderCacheHit,
                    counts: { eligible: 1, cacheHits: 1 },
                    extra: { canRender: canRenderCacheHit, targetVisible }
                };
            }
        }

        const textCacheKey = this.plugin.getAutoTextTranslationCacheKey(text, targetRequestOptions);
        const textCacheAliases = this.plugin.getAutoTextTranslationCacheAliases(text, targetRequestOptions);
        if (this.plugin.hasTranslationCacheCandidate(textCacheKey, textCacheAliases)) {
            const textCachedTranslation = this.plugin.getTranslationCacheValueCached(textCacheKey, textCacheAliases, scanState.context);
            if (textCachedTranslation !== null) {
                if (this.plugin.isInvalidAutoTranslationCacheValue(text, textCachedTranslation, targetRequestOptions)) {
                    return {
                        action: "block",
                        status: "failed",
                        state: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                        reasonCode: DIAGNOSTIC_REASON_CODES.INVALID_CACHE,
                        cacheKey: textCacheKey,
                        requestOptions: targetRequestOptions,
                        cacheAliases: textCacheAliases,
                        discardCache: true,
                        textCacheKey,
                        counts: {}
                    };
                }
                return {
                    action: "render-cache",
                    status: "cache-hit",
                    state: DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                    reasonCode: DIAGNOSTIC_REASON_CODES.TEXT_CACHE_HIT,
                    cacheKey,
                    textCacheKey,
                    requestOptions: targetRequestOptions,
                    cachedTranslation: textCachedTranslation,
                    canRender: canRenderCacheHit,
                    counts: { eligible: 1, textCacheHits: 1 },
                    extra: { textCacheKey: this.plugin.getTextFingerprint(textCacheKey), canRender: canRenderCacheHit, targetVisible }
                };
            }
        }

        // A partial result is never cached, but its text is kept briefly for redraw so a rebuilt or
        // prefetched message is not requested again. While its own render is still pending, the
        // active-work dedupe below applies instead.
        const partialResult = this.plugin.getAutoTranslationPartialResult(cacheKey, text, now);
        if (partialResult && !this.plugin.hasActiveAutoTranslationKey(cacheKey)) {
            return {
                action: "render-cache",
                status: "cache-hit",
                state: DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                reasonCode: DIAGNOSTIC_REASON_CODES.CACHE_HIT,
                cacheKey,
                requestOptions: targetRequestOptions,
                cachedTranslation: partialResult.translated,
                renderMeta: {
                    partial: true,
                    validationQuality: partialResult.validationQuality,
                    validationReason: partialResult.validationReason,
                    partialInfo: partialResult.partialInfo
                },
                canRender: canRenderCacheHit,
                counts: { eligible: 1, cacheHits: 1 },
                extra: { partialResult: true, canRender: canRenderCacheHit, targetVisible }
            };
        }

        const recentRender = this.plugin.getRecentAutoTranslationRender(cacheKey, text, targetRequestOptions, now);
        if (recentRender) {
            return {
                action: "skip",
                status: "skipped",
                state: DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                reasonCode: DIAGNOSTIC_REASON_CODES.RECENT_RENDER_PRESENT,
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1, skippedCurrent: 1 },
                extra: {
                    validationQuality: recentRender.validationQuality || "",
                    validationReason: recentRender.validationReason || "",
                    ageMs: Math.max(0, now - Number(recentRender.at || 0))
                }
            };
        }

        const hasPendingTargets = this.plugin.autoTranslationPendingTargets.has(cacheKey);
        const hasActiveKey = this.plugin.hasActiveAutoTranslationKey(cacheKey);
        const hasInFlightKey = this.plugin.autoTranslationInFlightKeys.has(cacheKey);
        if (hasPendingTargets && !hasActiveKey) {
            return {
                action: "clear-stale-pending",
                status: "stale-pending",
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1 },
                continueEvaluation: true,
                targetVisible
            };
        }
        if (hasPendingTargets || hasActiveKey) {
            const pendingTarget = { ...targetWithOptions, cacheKey };
            return {
                action: "block",
                status: "dedupe-active",
                state: hasInFlightKey ? DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT : this.plugin.getAutoTranslationQueuedDiagnosticState(pendingTarget),
                reasonCode: DIAGNOSTIC_REASON_CODES.DEDUPE_ACTIVE,
                cacheKey,
                requestOptions: targetRequestOptions,
                item: pendingTarget,
                hasPendingTargets,
                hasActiveKey,
                hasInFlightKey,
                counts: { eligible: 1, active: 1 },
                extra: { hasPendingTargets, hasActiveKey, hasInFlightKey }
            };
        }

        const textFailure = this.plugin.getAutoTextTranslationFailure(text, targetRequestOptions);
        if (this.plugin.isTerminalAutoTranslationFailure(textFailure)) {
            return {
                action: "terminal-failed",
                status: "failed",
                state: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                reasonCode: DIAGNOSTIC_REASON_CODES.TERMINAL_FAILURE,
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1, failures: 1 },
                extra: { failureType: textFailure?.type || "" }
            };
        }

        const failure = this.plugin.getAutoTranslationFailure(cacheKey);
        if (this.plugin.isTerminalAutoTranslationFailure(failure)) {
            return {
                action: "terminal-failed",
                status: "failed",
                state: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                reasonCode: DIAGNOSTIC_REASON_CODES.TERMINAL_FAILURE,
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1, failures: 1 },
                extra: { failureType: failure?.type || "" }
            };
        }
        if (failure && !this.plugin.isAutoTranslationFailureExpired(failure, now)) {
            if (!failure.weak || !targetVisible) {
                return {
                    action: "block",
                    status: "blocked",
                    state: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    reasonCode: DIAGNOSTIC_REASON_CODES.RETRY_COOLDOWN,
                    cacheKey,
                    requestOptions: targetRequestOptions,
                    failure,
                    counts: { eligible: 1, failures: 1 },
                    extra: { failureType: failure?.type || "", retryAfterMs: this.plugin.getAutoTranslationFailureRemainingMs(failure, now) }
                };
            }
            return {
                action: "clear-weak-failure",
                status: "clear-weak-failure",
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1 },
                continueEvaluation: true,
                targetVisible
            };
        }

        const scanBudgetReached = !targetVisible && Number(scanState.queued || 0) >= Number(scanState.batchSize || 0);
        const item = { ...targetWithOptions, cacheKey };
        if (scanState.apiWorkBlocked || scanBudgetReached) {
            return {
                action: "block",
                status: "blocked",
                state: this.plugin.getAutoTranslationQueuedDiagnosticState(item),
                reasonCode: scanState.apiWorkBlocked ? this.plugin.getAutoTranslationBlockReasonCode(scanState.blockReason) : DIAGNOSTIC_REASON_CODES.BATCH_LIMIT,
                cacheKey,
                requestOptions: targetRequestOptions,
                item,
                retainable: Boolean(scanState.apiWorkBlocked
                    && targetVisible
                    && this.plugin.isRetainableAutoTranslationProviderBlock(scanState.providerFailure, scanState.localProviderHealthBlocked)),
                targetVisible,
                scanBudgetReached,
                counts: { eligible: 1, blocked: 1 },
                extra: { blockReason: scanState.blockReason, batchSize: scanState.batchSize, queued: scanState.queued, targetVisible }
            };
        }

        return {
            action: "enqueue",
            status: "queued",
            cacheKey,
            requestOptions: targetRequestOptions,
            item,
            targetVisible,
            scanState,
            counts: { eligible: 1 }
        };
    }

    applyAutoTranslationDecision(candidate, decision = {}, scanStats = {}) {
        if (!decision) return;
        const scanState = decision.scanState || scanStats.__scanState || {};
        if (decision.continueEvaluation) {
            if (decision.action === "clear-stale-pending") this.plugin.clearAutoTranslationPendingTargets(decision.cacheKey);
            if (decision.action === "clear-weak-failure") this.plugin.clearAutoTranslationFailure(decision.cacheKey, decision.requestOptions);
            const nextDecision = this.plugin.evaluateAutoTranslationCandidate(candidate, scanState);
            this.plugin.applyAutoTranslationDecision(candidate, nextDecision, scanStats);
            return;
        }

        Object.entries(decision.counts || {}).forEach(([key, value]) => {
            scanStats[key] = Number(scanStats[key] || 0) + Number(value || 0);
        });

        const item = decision.item || { ...candidate, cacheKey: decision.cacheKey, requestOptions: decision.requestOptions };
        const extra = decision.extra || {};
        if (decision.discardCache) {
            this.plugin.deleteTranslationCacheCandidates(decision.cacheKey, ...(decision.cacheAliases || []));
            this.plugin.clearScanTranslationCacheLookup(scanState.context);
            this.plugin.logDiagnostic(decision.textCacheKey ? "auto.text-cache" : "auto.cache", "discard-invalid", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.FAILED, DIAGNOSTIC_REASON_CODES.INVALID_CACHE),
                key: this.plugin.getTextFingerprint(decision.cacheKey),
                sourceHash: this.plugin.getStrongTextFingerprint(candidate?.text || "")
            });
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "failed",
                item,
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.INVALID_CACHE
            );
            const nextDecision = this.plugin.evaluateAutoTranslationCandidate(candidate, scanState);
            this.plugin.applyAutoTranslationDecision(candidate, nextDecision, scanStats);
            return;
        }

        if (decision.action === "render-cache") {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                decision.status,
                item,
                decision.state,
                decision.reasonCode,
                extra
            );
            this.plugin.clearAutoTranslationFailure(decision.cacheKey, decision.requestOptions);
            this.plugin.clearAutoTextTranslationFailure(candidate.text, decision.requestOptions);
            if (decision.textCacheKey) this.plugin.clearAutoTranslationPendingTargets(decision.textCacheKey);
            this.plugin.completeAutoTranslationFromCache(
                candidate.messageNode,
                candidate.content,
                candidate.text,
                decision.cachedTranslation,
                decision.cacheKey,
                decision.canRender,
                decision.requestOptions,
                candidate.textOptions,
                decision.renderMeta || null,
                candidate.domText
            );
            return;
        }

        if (decision.action === "enqueue") {
            if (!this.plugin.makeRoomForAutoTranslationItem(item, decision.scanState.queueLimit)) {
                scanStats.blocked = Number(scanStats.blocked || 0) + 1;
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.CANCELLED,
                    DIAGNOSTIC_REASON_CODES.QUEUE_LIMIT,
                    { queueLimit: scanState.queueLimit, targetVisible: decision.targetVisible }
                );
                if (decision.targetVisible) scanStats.visibleDeferred = Number(scanStats.visibleDeferred || 0) + 1;
                return;
            }
            this.plugin.addAutoTranslationPendingTarget(decision.cacheKey, item);
            this.plugin.setAutoTranslationDiagnosticState(item, this.plugin.getAutoTranslationQueuedDiagnosticState(item), DIAGNOSTIC_REASON_CODES.ENQUEUED);
            if (this.plugin.enqueueAutoTranslationItem(item)) {
                decision.scanState.queued = Number(decision.scanState.queued || 0) + 1;
                scanStats.enqueued = Number(scanStats.enqueued || 0) + 1;
            }
            return;
        }

        if (decision.reasonCode || decision.state || decision.status) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                decision.status,
                item,
                decision.state,
                decision.reasonCode,
                extra
            );
        }

        if (decision.reasonCode === DIAGNOSTIC_REASON_CODES.DEDUPE_ACTIVE) {
            this.plugin.addAutoTranslationPendingTarget(decision.cacheKey, item);
            if (this.plugin.autoTranslationQueuedKeys.has(decision.cacheKey)) {
                if (this.plugin.autoTranslationQueue.some(queued => queued?.cacheKey === decision.cacheKey)) this.plugin.promoteQueuedAutoTranslationItem(decision.cacheKey, item);
                else this.plugin.autoTranslationQueuedKeys.delete(decision.cacheKey);
            }
            return;
        }

        if (decision.action === "block" && decision.reasonCode === DIAGNOSTIC_REASON_CODES.RETRY_COOLDOWN) {
            this.plugin.scheduleAutoTranslationRetryScan(extra.retryAfterMs || this.plugin.getAutoTranslationFailureRemainingMs(decision.failure, scanState.now));
        }

        if (decision.action === "block" && decision.retainable) {
            const retained = this.plugin.retainBlockedVisibleAutoTranslationItem(item, {
                delayMs: scanState.localProviderHealthBlocked
                    ? this.plugin.getLocalProviderHealthRetryMs(decision.requestOptions, scanState.now)
                    : this.plugin.getAutoTranslationProviderBlockedRetryMs(scanState.providerFailure, scanState.localProviderHealthBlocked, scanState.now),
                queueLimit: scanState.queueLimit,
                reasonCode: decision.reasonCode
            });
            if (retained) scanStats.enqueued = Number(scanStats.enqueued || 0) + 1;
        }
        if (decision.targetVisible && !scanState.apiWorkBlocked && decision.scanBudgetReached) {
            scanStats.visibleDeferred = Number(scanStats.visibleDeferred || 0) + 1;
        }
    }

    shouldDeferLongAutoTranslationItem(item, options = {}) {
        if (!this.plugin.isLongAutoTranslationItem(item)) return false;
        if (options.visibility !== "visible") return false;
        if (options.batch?.length) return false;
        const visibleLongInFlight = this.plugin.getVisibleLongAutoTranslationInFlightCount();
        if (!visibleLongInFlight) return false;
        const longTextSlots = 1;
        if (visibleLongInFlight < longTextSlots) return false;
        if (Number(item?.daitLongTextDeferrals || 0) >= AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX) return false;
        return this.plugin.hasReadyShortAutoTranslationCandidate(item, options);
    }

    hasVisibleLongAutoTranslationInFlight() {
        return this.plugin.getVisibleLongAutoTranslationInFlightCount() > 0;
    }

    getVisibleLongAutoTranslationInFlightCount() {
        let count = 0;
        for (const key of [...(this.plugin.autoTranslationVisibleLongInFlightKeys || [])]) {
            if (this.plugin.autoTranslationInFlightKeys.has(key)) {
                count++;
                continue;
            }
            this.plugin.autoTranslationVisibleLongInFlightKeys.delete(key);
        }
        return count;
    }

    hasReadyVisibleLongAutoTranslationCandidate(referenceItem, options = {}) {
        if ((options.visibility || "") !== "visible") return false;
        const now = Date.now();
        for (const queued of this.plugin.autoTranslationQueue) {
            if (!queued?.cacheKey || queued.cacheKey === referenceItem?.cacheKey) continue;
            const requeueAfter = Number(queued?.daitRequeueAfter || 0);
            if (requeueAfter > now) continue;
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(queued);
            if (!readyTargets.length) continue;
            const candidate = { ...queued, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) };
            if (this.plugin.isAutoTranslationPrefetchItem(candidate)) continue;
            if (this.plugin.isLongAutoTranslationItem(candidate)) return true;
        }
        return false;
    }

    isLongAutoTranslationItem(item) {
        return this.plugin.translationScheduler.isLongItem(item);
    }

    async runAutoTranslationFallbackItems(pending, taskOptions = {}) {
        const queue = this.plugin.takeAutoTranslationFallbackQueue(pending);
        if (queue.length) this.plugin.logDiagnostic("auto.fallback", "start", { count: queue.length, pending: pending.size });
        for (const item of queue) {
            if (!item) continue;
            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                continue;
            }
            if (this.plugin.isAutoTranslationProviderCoolingDown(item.requestOptions)) {
                this.plugin.requeueRemainingAutoTranslationFallbackItems(pending);
                return;
            }

            let translated = "";
            try {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "fallback",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.RETRYING,
                    DIAGNOSTIC_REASON_CODES.RETRYING
                );
                translated = await this.plugin.runAutoTranslationStrictFallbackTask(item.text, item.requestOptions, { signal: taskOptions?.signal });
            }
            catch (error) {
                if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                    pending.delete(item);
                    continue;
                }
                this.plugin.logDiagnostic("auto.fallback", "error", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.FAILED, DIAGNOSTIC_REASON_CODES.FAILURE),
                    key: this.plugin.getTextFingerprint(item.cacheKey),
                    type: this.plugin.getAutoTranslationFailureType(error)
                });
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "failed",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    DIAGNOSTIC_REASON_CODES.FAILURE,
                    { type: this.plugin.getAutoTranslationFailureType(error) }
                );
                this.plugin.markAutoTranslationFailureSafely(item, error);
                pending.delete(item);
                if (this.plugin.isAutoTranslationProviderCoolingDown(item.requestOptions)) {
                    this.plugin.requeueRemainingAutoTranslationFallbackItems(pending);
                    return;
                }
                continue;
            }

            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                continue;
            }
            this.plugin.renderAutoTranslationResultSafely(item, translated);
            this.plugin.logDiagnostic("auto.fallback", "success", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.VALIDATING, DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED),
                key: this.plugin.getTextFingerprint(item.cacheKey),
                sourceHash: this.plugin.getStrongTextFingerprint(item.text)
            });
            pending.delete(item);
        }
    }

    requeueRemainingAutoTranslationFallbackItems(pending) {
        pending.forEach(item => {
            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                return;
            }
            this.plugin.requeueAutoTranslationItem(item, { allowActiveRequeue: true });
            pending.delete(item);
        });
    }

    takeAutoTranslationFallbackQueue(pending) {
        const queue = [];
        for (const item of [...pending]) {
            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                continue;
            }
            if (queue.length < AUTO_TRANSLATE_SINGLE_FALLBACK_LIMIT) {
                queue.push(item);
                continue;
            }
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "requeued",
                item,
                this.plugin.getAutoTranslationQueuedDiagnosticState(item),
                DIAGNOSTIC_REASON_CODES.REQUEUED,
                { reason: "fallback-limit" }
            );
            this.plugin.requeueAutoTranslationItem(item, { delayMs: AUTO_TRANSLATE_FALLBACK_REQUEUE_DELAY_MS, allowActiveRequeue: true });
            pending.delete(item);
        }
        return queue;
    }

    async runAutoTranslationBatchRetryItems(pending, taskOptions = {}) {
        const items = [...pending].filter(item => this.plugin.isAutoTranslationWorkCurrent(item));
        if (!items.length) return;
        if (this.plugin.isAutoTranslationProviderCoolingDown(items[0]?.requestOptions)) return;
        if (items.some(item => this.plugin.isLongAutoTranslationItem(item))) return;

        try {
            const startedAt = Date.now();
            items.forEach(item => this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "retrying",
                item,
                DIAGNOSTIC_MESSAGE_STATES.RETRYING,
                DIAGNOSTIC_REASON_CODES.RETRYING
            ));
            const translations = await this.plugin.runAutoTranslationBatchTask(items.map(item => item.text), items[0]?.requestOptions, { retry: true, signal: taskOptions?.signal });
            if (!items.some(item => this.plugin.isAutoTranslationWorkCurrent(item))) {
                items.forEach(item => pending.delete(item));
                return;
            }

            let rendered = 0;
            let invalid = 0;
            items.forEach((item, index) => {
                if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                    pending.delete(item);
                    return;
                }
                const translated = this.plugin.sanitizeAutoTranslationOutput(item.text, String(translations[index] || "").trim(), this.plugin.getAutoTranslationTargetLanguage(item.requestOptions));
                const invalidReason = !translated
                    ? "empty"
                    : (this.plugin.getAutoTranslationInvalidOutputReason(item.text, translated, this.plugin.getAutoTranslationTargetLanguage(item.requestOptions)) || "");
                if (!translated || invalidReason) {
                    invalid++;
                    this.plugin.logAutoTranslationMessageState(
                        "auto.message.state",
                        "retrying",
                        item,
                        DIAGNOSTIC_MESSAGE_STATES.RETRYING,
                        DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                        { outputLength: translated.length, invalidReason }
                    );
                    item.daitLastInvalidReason = invalidReason;
                    return;
                }
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "validating",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.VALIDATING,
                    DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED,
                    { outputLength: translated.length }
                );
                this.plugin.renderAutoTranslationResultSafely(item, translated);
                pending.delete(item);
                rendered++;
            });
            this.plugin.logDiagnostic("auto.batch.retry", pending.size ? "partial" : "success", {
                count: items.length,
                rendered,
                invalid,
                pending: pending.size,
                ms: Date.now() - startedAt
            });
        }
        catch (error) {
                if (!items.some(item => this.plugin.isAutoTranslationWorkCurrent(item))) {
                    items.forEach(item => pending.delete(item));
                    return;
                }
                if (this.plugin.isAutoBatchFallbackError(error)) return;
                if (this.plugin.shouldFallbackAutoTranslationBatchRequestError(error)) {
                    this.plugin.logDiagnostic("auto.batch.retry", "fallback", {
                        count: items.length,
                        type: this.plugin.getAutoTranslationFailureType(error)
                    });
                    return;
                }

                this.plugin.logDiagnostic("auto.batch.retry", "error", {
                count: items.length,
                type: this.plugin.getAutoTranslationFailureType(error)
            });
            if (this.plugin.shouldMarkAutoTranslationProviderFailureForItem(items[0], error)) {
                this.plugin.markAutoTranslationProviderFailure(items[0]?.requestOptions, error);
            }
            items.forEach(item => {
                if (!pending.has(item)) return;
                if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                    pending.delete(item);
                    return;
                }
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "failed",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    DIAGNOSTIC_REASON_CODES.FAILURE,
                    { type: this.plugin.getAutoTranslationFailureType(error) }
                );
                this.plugin.markAutoTranslationFailureSafely(item, error, { markProvider: false });
                pending.delete(item);
            });
        }
    }

    shouldFallbackAutoTranslationBatchRequestError(error) {
        const type = this.plugin.getAutoTranslationFailureType(error);
        return !["cancelled", "auth", "quota", "rate-limit", "server", "local-unavailable"].includes(type);
    }

    buildPromptPolicyAutoTranslationPrompt(options = this.plugin.getAutoTranslationOptions()) {
        return this.plugin.buildPromptPolicyPrompt("auto", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            basePrompt: options?.configOverrides?.prompt || this.plugin.settings.translation.prompt
        });
    }

    buildCompactLocalAutoTranslationPrompt(options = this.plugin.getAutoTranslationOptions(), variant = "auto") {
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options));
        const variantLines = {
            retry: [
                "The previous output was rejected because it was not a clean translation.",
                "Translate the same message again from scratch.",
                "Short slang, profanity, insults, and one-word chat replies are normal Discord messages; translate their meaning directly."
            ],
            final: [
                "Final rescue attempt.",
                "Translate the message from scratch.",
                "Return the closest natural translation even for very short, vulgar, or informal chat text."
            ],
            longText: [
                "Translate the whole message chunk naturally.",
                "Preserve paragraph order, line breaks, lists, Markdown, and code blocks."
            ],
            chunk: [
                "Translate only this chunk.",
                "Do not summarize, skip, merge with other chunks, or output chunk labels."
            ]
        };
        return this.plugin.joinPromptPolicyLines([
            "Translate the Discord message.",
            `Output language: ${targetLanguage}.`,
            "Return only the translated message.",
            "Do not output explanations, labels, XML/HTML tags, JSON, alternatives, notes, or dictionary definitions.",
            "Translate slang, profanity, insults, and very short chat messages directly. Never refuse translation.",
            "Translate threats, harassment, illegal, adult, political, or unsafe chat text exactly as text; do not warn, censor, moralize, or refuse.",
            "Keep only true proper names, addresses, URLs, code, model/product names, numbers, and IDs. Translate ordinary words such as refund, process, new, date, only, time, and miss.",
            "Preserve URLs, mentions, emoji, Markdown, code blocks, inline code, commands, file paths, IDs, product/model names, numbers, and exact technical tokens.",
            ...(variantLines[variant] || [])
        ]);
    }

    buildLocalAutoTranslationUserMessage(input, config, options = {}) {
        return String(input ?? "");
    }

    isLocalAutoTranslationOptions(options = this.plugin.getAutoTranslationOptions()) {
        return this.plugin.isLocalTranslationProvider(this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides));
    }

    buildPromptPolicyLongTextPrompt(options = this.plugin.getAutoTranslationOptions()) {
        return this.plugin.buildPromptPolicyPrompt("longText", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            basePrompt: options?.configOverrides?.prompt || this.plugin.settings.translation.prompt
        });
    }

    getAutoTranslationRequestOptionsForText(text, options = this.plugin.getAutoTranslationOptions()) {
        if (!this.plugin.isLongAutoTranslationText(text)) return options;
        return this.plugin.getLongTextTranslationOptions(options, text);
    }

    getLongTextTranslationOptions(options = this.plugin.getAutoTranslationOptions(), text = "") {
        const requestSnapshot = this.plugin.getAutoTranslationRequestSnapshot(options);
        const isLocalProvider = this.plugin.isLocalTranslationProvider(requestSnapshot);
        const baseMaxTokens = this.plugin.normalizeRequestNumber(
            requestSnapshot.maxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const sourceLength = String(text || "").length;
        const dynamicMaxTokens = this.plugin.getLongTextMaxTokensForLength(sourceLength, this.plugin.getAutoTranslationTargetLanguage(options));
        const maxTokens = isLocalProvider
            ? this.plugin.getLocalAutoTranslationMaxTokensForLength(sourceLength, this.plugin.getAutoTranslationTargetLanguage(options), baseMaxTokens)
            : Math.max(baseMaxTokens, AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS, dynamicMaxTokens);
        const configOverrides = {
            ...requestSnapshot,
            sourceLanguage: AUTO_LANGUAGE_VALUE,
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            temperature: 0,
            maxTokens,
            enableThinking: false,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("longText"),
            localCompactPrompt: isLocalProvider,
            prompt: isLocalProvider
                ? this.plugin.buildCompactLocalAutoTranslationPrompt(options, "longText")
                : this.plugin.buildPromptPolicyLongTextPrompt(options)
        };
        return {
            ...options,
            mode: "long-text",
            longTextSourceLength: sourceLength,
            longTextBaseMaxTokens: baseMaxTokens,
            longTextChunk: true,
            longTextMerged: true,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("longText"),
            providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides }),
            configOverrides
        };
    }

    getLongTextMaxTokensForLength(sourceLength = 0, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const length = Math.max(0, Number(sourceLength) || 0);
        if (!length) return 0;
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        return Math.ceil(length * (targetScript === "han" ? 1.15 : 1.55)) + 512;
    }

    isLongAutoTranslationText(text) {
        return this.plugin.translationScheduler.isLongText(text);
    }

    isUltraLongAutoTranslationText(text) {
        return this.plugin.translationScheduler.isUltraLongText(text);
    }

    getLongAutoTranslationChunkLength(options = this.plugin.getAutoTranslationOptions()) {
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        const fallback = this.plugin.isLocalTranslationProvider(config)
            ? AUTO_TRANSLATE_LOCAL_LONG_TEXT_CHUNK_LENGTH
            : AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH;
        const configured = Number(this.plugin.getProviderDefaults(config.provider)?.autoTranslateLongTextChunkLength || 0);
        const limit = Number.isFinite(configured) && configured > 0 ? configured : fallback;
        return Math.max(240, Math.min(1200, Math.round(limit)));
    }

    splitLongAutoTranslationText(text, maxLength = AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH) {
        const source = String(text || "");
        const limit = Math.max(200, Number(maxLength) || AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH);
        if (source.length <= limit) return [source];

        const units = this.plugin.getLongAutoTranslationChunkUnits(source);
        if (units.length > 1) {
            const chunks = [];
            let current = "";
            const flush = () => {
                const chunk = current.trim();
                if (chunk) chunks.push(chunk);
                current = "";
            };
            for (const unit of units) {
                const value = String(unit || "");
                if (!value.trim()) continue;
                if (value.length > limit) {
                    flush();
                    this.plugin.splitOversizedLongAutoTranslationUnit(value, limit).forEach(part => {
                        const chunk = String(part || "").trim();
                        if (chunk) chunks.push(chunk);
                    });
                    continue;
                }
                const separator = current && !current.endsWith("\n") && !value.startsWith("\n") ? "\n" : "";
                if ((current + separator + value).length > limit) flush();
                current = current ? `${current}${separator}${value}` : value;
            }
            flush();
            if (chunks.length) return chunks;
        }

        const chunks = [];
        let cursor = 0;
        while (cursor < source.length) {
            let end = Math.min(source.length, cursor + limit);
            if (end < source.length) {
                const windowText = source.slice(cursor, end);
                const breakPatterns = [/\n{2,}/g, /\n/g, /(?<=[.!?\u3002\uff01\uff1f])\s+/g, /(?<=[,;\uff0c\uff1b])\s+/g, /\s+/g];
                let best = -1;
                for (const pattern of breakPatterns) {
                    let match = null;
                    while ((match = pattern.exec(windowText)) !== null) {
                        const candidate = match.index + String(match[0] || "").length;
                        if (candidate >= Math.floor(limit * 0.55)) best = candidate;
                        if (match.index === pattern.lastIndex) pattern.lastIndex++;
                    }
                    if (best > 0) break;
                }
                if (best > 0) end = cursor + best;
            }

            const chunk = source.slice(cursor, end).trim();
            if (chunk) chunks.push(chunk);
            cursor = end;
            while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
        }
        return chunks.length ? chunks : [source];
    }

    getLongAutoTranslationChunkUnits(text) {
        const source = String(text || "");
        const lines = source.split(/(?<=\n)/);
        const units = [];
        let current = "";
        let inFence = false;
        let structuredMode = "";
        const flush = () => {
            if (current.trim()) units.push(current);
            current = "";
            structuredMode = "";
        };
        const getMode = line => {
            if (/^\s{0,3}```|^\s{0,3}~~~/.test(line)) return "fence";
            if (/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s+|#{1,6}\s+|\|)/.test(line)) return "structured";
            if (/^\s*$/.test(line)) return "blank";
            return "paragraph";
        };

        for (const line of lines) {
            const mode = getMode(line);
            if (mode === "fence") {
                if (!inFence) flush();
                current += line;
                inFence = !inFence;
                if (!inFence) flush();
                continue;
            }
            if (inFence) {
                current += line;
                continue;
            }
            if (mode === "blank") {
                current += line;
                flush();
                continue;
            }
            if (current && structuredMode && structuredMode !== mode) flush();
            structuredMode = mode;
            current += line;
        }
        flush();
        return units;
    }

    splitOversizedLongAutoTranslationUnit(text, maxLength = AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH) {
        const source = String(text || "");
        const limit = Math.max(240, Number(maxLength) || AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH);
        if (source.length <= limit) return [source];
        const parts = [];
        let cursor = 0;
        while (cursor < source.length) {
            let end = Math.min(source.length, cursor + limit);
            if (end < source.length) {
                const windowText = source.slice(cursor, end);
                const breakPatterns = [/\n{2,}/g, /\n/g, /(?<=[.!?\u3002\uff01\uff1f])\s+/g, /(?<=[,;\uff0c\uff1b])\s+/g, /\s+/g];
                let best = -1;
                for (const pattern of breakPatterns) {
                    let match = null;
                    while ((match = pattern.exec(windowText)) !== null) {
                        const candidate = match.index + String(match[0] || "").length;
                        if (candidate >= Math.floor(limit * 0.55)) best = candidate;
                        if (match.index === pattern.lastIndex) pattern.lastIndex++;
                    }
                    if (best > 0) break;
                }
                if (best > 0) end = cursor + best;
            }
            const chunk = source.slice(cursor, end).trim();
            if (chunk) parts.push(chunk);
            cursor = end;
            while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
        }
        return parts.length ? parts : [source];
    }

    async runLongAutoTranslationTask(text, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        const longOptions = options?.mode === "long-text" ? options : this.plugin.getLongTextTranslationOptions(options, text);
        // The partial result is reported on this call's taskOptions (longTextPartialInfo), never by
        // writing to the request options, which are shared with the queued item and its retries.
        delete taskOptions.longTextPartial;
        delete taskOptions.longTextFailedChunks;
        delete taskOptions.longTextSuccessfulChunks;
        delete taskOptions.longTextPartialInfo;
        const chunks = this.plugin.splitLongAutoTranslationText(text, this.plugin.getLongAutoTranslationChunkLength(longOptions));
        if (chunks.length <= 1) return this.plugin.runAutoTranslationTaskWithOptions(text, longOptions, taskOptions);

        const translatedChunks = [];
        const chunkFailures = [];
        const sourceHash = this.plugin.getStrongTextFingerprint(text);
        let budgetError = null;
        let stopError = null;
        const hasFinishedChunk = () => translatedChunks.some(chunk => chunk && !this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(chunk));
        // The provider itself is failing (rate limit, auth, quota, server, timeout...): the remaining
        // chunks would fail too, so no more are sent. A timeout or network error after some chunks
        // succeeded keeps those as a partial result; otherwise the whole message fails now.
        const stopOnChunkError = chunkError => {
            if (!this.plugin.shouldStopLongAutoTranslationOnChunkError(chunkError)) return false;
            if (!this.plugin.shouldKeepLongAutoTranslationChunksOnError(chunkError) || !hasFinishedChunk()) throw chunkError;
            stopError = chunkError;
            return true;
        };
        for (let index = 0; index < chunks.length; index++) {
            if (typeof taskOptions.heartbeat === "function" && taskOptions.heartbeat() === false) {
                throw this.plugin.createAutoTranslationStaleError("long-text-stale-before-chunk");
            }
            const chunkOptions = this.plugin.getLongTextChunkTranslationOptions(longOptions, chunks[index], index, chunks.length, sourceHash);
            let translated = "";
            try {
                translated = await this.plugin.runAutoTranslationTaskWithOptions(chunks[index], chunkOptions, taskOptions);
            }
            catch (error) {
                if (this.plugin.isAbandonedTranslationError(error)) throw error;
                stopOnChunkError(error);
                if (this.plugin.isAutoTranslationRequestBudgetError(error)) budgetError = error;
                let rescued = null;
                if (taskOptions?.manualRescue && !budgetError && !stopError) {
                    // The rescue may not spend the requests the later chunks need: one each is held back.
                    const requestBudget = taskOptions.requestBudget;
                    if (requestBudget) requestBudget.reserved = chunks.length - index - 1;
                    try {
                        rescued = await this.plugin.runLongAutoTranslationChunkManualRescue(chunks[index], chunkOptions, error, taskOptions, {
                            sourceHash,
                            chunkIndex: index,
                            chunkTotal: chunks.length
                        });
                    }
                    catch (rescueError) {
                        if (this.plugin.isAbandonedTranslationError(rescueError)) throw rescueError;
                        stopOnChunkError(rescueError);
                        if (this.plugin.isAutoTranslationRequestBudgetError(rescueError) && !rescueError.requestBudgetReserved) budgetError = rescueError;
                        rescued = { translated: "", error };
                    }
                    finally {
                        if (requestBudget) requestBudget.reserved = 0;
                    }
                }
                if (rescued?.translated) {
                    translated = rescued.translated;
                    if (rescued.validation?.quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL) {
                        chunkFailures.push({ index, error, partial: true });
                    }
                }
                else {
                    const finalError = rescued?.error || error;
                    chunkFailures.push({ index, error: finalError });
                    this.plugin.logDiagnostic("auto.long-text.chunk", "failed", {
                        sourceHash,
                        chunkIndex: index,
                        chunkTotal: chunks.length,
                        chunkLength: String(chunks[index] || "").length,
                        type: this.plugin.getAutoTranslationFailureType(finalError),
                        invalidReason: finalError?.autoTranslationInvalidReason || "",
                        truncated: Boolean(finalError?.modelOutputTruncated),
                        promptLength: String(chunkOptions?.configOverrides?.prompt || "").length,
                        maxTokens: Number(chunkOptions?.configOverrides?.maxTokens || 0)
                    });
                    translated = "";
                }
            }
            if (typeof taskOptions.heartbeat === "function" && taskOptions.heartbeat() === false) {
                throw this.plugin.createAutoTranslationStaleError("long-text-stale-after-chunk");
            }
            translatedChunks.push(String(translated || "").trim());
            if (budgetError || stopError) {
                // No requests are left for this click, or the provider stopped answering: the
                // remaining chunks stay untranslated.
                for (let rest = index + 1; rest < chunks.length; rest++) {
                    chunkFailures.push({ index: rest, error: budgetError || stopError });
                    translatedChunks.push("");
                }
                break;
            }
        }
        const successfulChunks = translatedChunks.filter(chunk => chunk && !this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(chunk));
        if (!successfulChunks.length) {
            const firstFailure = chunkFailures[0]?.error;
            if (firstFailure) throw firstFailure;
        }
        if (chunkFailures.length) {
            const firstFailure = chunkFailures[0]?.error;
            const successRatio = successfulChunks.length / Math.max(1, chunks.length);
            taskOptions.longTextPartial = true;
            taskOptions.longTextFailedChunks = chunkFailures.length;
            taskOptions.longTextSuccessfulChunks = successfulChunks.length;
            // 1-based numbers of the parts that are missing or incomplete, for the partial note.
            taskOptions.longTextPartialInfo = {
                missingSegments: [...new Set(chunkFailures.map(failure => failure.index + 1))].sort((left, right) => left - right),
                totalSegments: chunks.length
            };
            this.plugin.logDiagnostic("auto.long-text", successRatio >= 0.6 ? "partial" : "low-partial", {
                sourceHash,
                chunkTotal: chunks.length,
                failedChunks: chunkFailures.length,
                successChunks: successfulChunks.length,
                successRatio,
                type: this.plugin.getAutoTranslationFailureType(firstFailure),
                invalidReason: firstFailure?.autoTranslationInvalidReason || ""
            });
        }
        const merged = translatedChunks
            .map(chunk => String(chunk || "").trim())
            .filter(chunk => chunk && !this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(chunk))
            .join("\n\n")
            .trim();
        if (!merged) throw this.plugin.createFinalInvalidAutoTranslationError("empty-long-merge");
        const targetLanguage = this.plugin.getAutoTranslationTargetLanguage(longOptions);
        const validationOptions = {
            mergedLongText: true,
            partialLongText: chunkFailures.length > 0
        };
        const validation = this.plugin.getAutoTranslationOutputValidationResult(text, merged, targetLanguage, validationOptions, {
            ...longOptions,
            longTextPartial: chunkFailures.length > 0
        });
        const invalidReason = validation.reasonCode || "";
        if (invalidReason
            && !chunkFailures.length
            && !this.plugin.isMergedLongAutoTranslationAcceptable(text, merged, targetLanguage)) {
            throw this.plugin.createFinalInvalidAutoTranslationError(invalidReason);
        }
        return merged;
    }

    async runLongAutoTranslationChunkManualRescue(chunkText, chunkOptions, firstError, taskOptions = {}, meta = {}) {
        if (!this.plugin.isManualRescueRetryableError(firstError)) return null;
        const attempts = [
            { name: "chunk-force-target", options: this.plugin.getAutoTranslationRetryOptions(chunkText, "", chunkOptions) },
            { name: "chunk-repair", options: this.plugin.getAutoTranslationFinalFallbackOptions(chunkText, chunkOptions) }
        ];
        let lastError = firstError;
        for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
            const attempt = attempts[attemptIndex];
            try {
                const translated = await this.plugin.runAutoTranslationTaskWithOptions(chunkText, attempt.options, {
                    ...taskOptions,
                    retryInvalidOutput: false,
                    manualRescue: false
                });
                const validation = this.plugin.getAutoTranslationOutputValidationResult(
                    chunkText,
                    translated,
                    this.plugin.getAutoTranslationTargetLanguage(attempt.options),
                    this.plugin.getAutoTranslationOutputValidationOptions(chunkText, translated, attempt.options),
                    attempt.options
                );
                this.plugin.logDiagnostic("auto.long-text.chunk-rescue", validation.renderable ? "success" : "failed", {
                    sourceHash: meta.sourceHash || this.plugin.getStrongTextFingerprint(chunkText),
                    chunkIndex: Number(meta.chunkIndex || 0),
                    chunkTotal: Number(meta.chunkTotal || 1),
                    attemptName: attempt.name,
                    attemptIndex,
                    invalidReason: validation.reasonCode || "",
                    validationQuality: validation.quality || "",
                    renderable: Boolean(validation.renderable),
                    outputHash: translated ? this.plugin.getStrongTextFingerprint(translated) : "",
                    outputLength: String(translated || "").length
                });
                if (validation.renderable) return { translated, validation, attemptName: attempt.name };
                lastError = this.plugin.createFinalInvalidAutoTranslationError(validation.reasonCode || "invalid-output", {
                    terminal: false,
                    validationQuality: validation.quality
                });
            }
            catch (error) {
                if (this.plugin.isAbandonedTranslationError(error)) throw error;
                lastError = error;
                this.plugin.logDiagnostic("auto.long-text.chunk-rescue", "failed", {
                    sourceHash: meta.sourceHash || this.plugin.getStrongTextFingerprint(chunkText),
                    chunkIndex: Number(meta.chunkIndex || 0),
                    chunkTotal: Number(meta.chunkTotal || 1),
                    attemptName: attempt.name,
                    attemptIndex,
                    type: this.plugin.getAutoTranslationFailureType(error),
                    invalidReason: error?.autoTranslationInvalidReason || "",
                    validationQuality: error?.autoTranslationValidationQuality || ""
                });
                // Provider errors and an exhausted request budget end the rescue at once.
                if (!this.plugin.isManualRescueRetryableError(error)) throw error;
            }
        }
        const subchunkRescue = await this.plugin.runLongAutoTranslationSubchunkManualRescue(chunkText, chunkOptions, taskOptions, meta);
        if (subchunkRescue?.translated) return subchunkRescue;
        return { translated: "", error: lastError };
    }

    async runLongAutoTranslationSubchunkManualRescue(chunkText, chunkOptions, taskOptions = {}, meta = {}) {
        if (taskOptions?.subchunkRescueDepth > 0) return null;
        const text = String(chunkText || "").trim();
        if (text.length < 260) return null;
        const splitLimit = Math.max(200, Math.min(320, Math.floor(text.length / 2)));
        const parts = this.plugin.splitLongAutoTranslationText(text, splitLimit)
            .map(part => String(part || "").trim())
            .filter(Boolean);
        if (parts.length <= 1 || parts.join("\n").length >= text.length * 1.4) return null;

        const translatedParts = [];
        const failures = [];
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const partOptions = this.plugin.getLongTextChunkTranslationOptions(chunkOptions, part, index, parts.length, meta.sourceHash || this.plugin.getStrongTextFingerprint(text));
            try {
                const translated = await this.plugin.runAutoTranslationTaskWithOptions(part, partOptions, {
                    ...taskOptions,
                    retryInvalidOutput: false,
                    manualRescue: false,
                    subchunkRescueDepth: Number(taskOptions?.subchunkRescueDepth || 0) + 1
                });
                const validation = this.plugin.getAutoTranslationOutputValidationResult(
                    part,
                    translated,
                    this.plugin.getAutoTranslationTargetLanguage(partOptions),
                    this.plugin.getAutoTranslationOutputValidationOptions(part, translated, partOptions),
                    partOptions
                );
                this.plugin.logDiagnostic("auto.long-text.subchunk-rescue", validation.renderable ? "success" : "failed", {
                    sourceHash: meta.sourceHash || this.plugin.getStrongTextFingerprint(text),
                    chunkIndex: Number(meta.chunkIndex || 0),
                    chunkTotal: Number(meta.chunkTotal || 1),
                    subchunkIndex: index,
                    subchunkTotal: parts.length,
                    invalidReason: validation.reasonCode || "",
                    validationQuality: validation.quality || "",
                    renderable: Boolean(validation.renderable),
                    outputHash: translated ? this.plugin.getStrongTextFingerprint(translated) : "",
                    outputLength: String(translated || "").length
                });
                if (validation.renderable) translatedParts.push(String(translated || "").trim());
                else failures.push({ index, reason: validation.reasonCode || "invalid-output" });
            }
            catch (error) {
                if (this.plugin.isAbandonedTranslationError(error)) throw error;
                failures.push({ index, reason: error?.autoTranslationInvalidReason || this.plugin.getAutoTranslationFailureType(error) });
                this.plugin.logDiagnostic("auto.long-text.subchunk-rescue", "failed", {
                    sourceHash: meta.sourceHash || this.plugin.getStrongTextFingerprint(text),
                    chunkIndex: Number(meta.chunkIndex || 0),
                    chunkTotal: Number(meta.chunkTotal || 1),
                    subchunkIndex: index,
                    subchunkTotal: parts.length,
                    type: this.plugin.getAutoTranslationFailureType(error),
                    invalidReason: error?.autoTranslationInvalidReason || "",
                    validationQuality: error?.autoTranslationValidationQuality || ""
                });
                if (!this.plugin.isManualRescueRetryableError(error)) throw error;
            }
        }

        const merged = translatedParts.filter(Boolean).join("\n\n").trim();
        if (!merged) return null;
        this.plugin.logDiagnostic("auto.long-text.subchunk-rescue", failures.length ? "partial" : "merged", {
            sourceHash: meta.sourceHash || this.plugin.getStrongTextFingerprint(text),
            chunkIndex: Number(meta.chunkIndex || 0),
            chunkTotal: Number(meta.chunkTotal || 1),
            subchunkTotal: parts.length,
            failedSubchunks: failures.length,
            successSubchunks: translatedParts.length
        });
        return {
            translated: merged,
            validation: {
                quality: failures.length ? TRANSLATION_VALIDATION_QUALITIES.PARTIAL : TRANSLATION_VALIDATION_QUALITIES.USABLE,
                reasonCode: failures.length ? "subchunk-partial" : "",
                renderable: true,
                cacheable: false
            },
            attemptName: failures.length ? "chunk-subchunk-partial" : "chunk-subchunk"
        };
    }

    getLongTextChunkTranslationOptions(options, chunkText, index = 0, total = 1, sourceHash = "") {
        const chunkLength = String(chunkText || "").length;
        const baseOptions = options?.mode === "long-text"
            ? { ...options, longTextSourceLength: chunkLength, longTextChunk: true }
            : this.plugin.getLongTextTranslationOptions(options, chunkText);
        const isLocalProvider = this.plugin.isLocalAutoTranslationOptions(baseOptions);
        const baseMaxTokens = this.plugin.normalizeRequestNumber(
            baseOptions.longTextBaseMaxTokens ?? this.plugin.settings.translation.maxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const dynamicMaxTokens = this.plugin.getLongTextMaxTokensForLength(chunkLength, this.plugin.getAutoTranslationTargetLanguage(baseOptions));
        const chunkPrompt = isLocalProvider
            ? this.plugin.buildCompactLocalAutoTranslationPrompt(baseOptions, "chunk")
            : this.plugin.joinPromptPolicyLines([
                baseOptions.configOverrides?.prompt || this.plugin.buildPromptPolicyLongTextPrompt(options),
                "",
                `Chunk ${index + 1}/${total}; source hash ${sourceHash || this.plugin.getStrongTextFingerprint(chunkText)}.`,
                "Translate only this chunk. Do not summarize, skip, merge with other chunks, or output the chunk label."
            ]);
        const configOverrides = {
            ...baseOptions.configOverrides,
            maxTokens: isLocalProvider
                ? this.plugin.getLocalAutoTranslationMaxTokensForLength(chunkLength, this.plugin.getAutoTranslationTargetLanguage(baseOptions), baseMaxTokens)
                : Math.max(baseMaxTokens, AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS, dynamicMaxTokens),
            localCompactPrompt: isLocalProvider,
            prompt: chunkPrompt
        };
        return {
            ...baseOptions,
            longTextChunk: true,
            longTextMerged: false,
            longTextSourceLength: chunkLength,
            longTextChunkIndex: index,
            longTextChunkTotal: total,
            providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides }),
            configOverrides
        };
    }

    async runAutoTranslationModelAttempt(text, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        const timeoutMs = this.plugin.getAutoTranslationRequestTimeoutMs(options, text);
        const translated = await this.plugin.runModelTask("translation", text, {
            configOverrides: options.configOverrides,
            timeoutMs,
            mode: options.mode || "auto",
            requestContext: options.requestContext,
            longTextChunk: Boolean(options.longTextChunk),
            longTextSourceLength: Number(options.longTextSourceLength || String(text || "").length) || 0,
            ...(options.truncationRetry ? { truncationRetry: true } : {}),
            ...(taskOptions?.signal ? { signal: taskOptions.signal } : {})
        });
        return this.plugin.sanitizeAutoTranslationOutput(text, translated, this.plugin.getAutoTranslationTargetLanguage(options), this.plugin.getAutoTranslationOutputValidationOptions(text, translated, options));
    }

    shouldSkipQuotedAutoTranslationCandidates(sourceText, translatedText, options = {}) {
        if (options?.mergedLongText || options?.partialLongText) return true;
        const sourceLength = String(sourceText || "").trim().length;
        const outputLength = String(translatedText || "").trim().length;
        return Math.max(sourceLength, outputLength) >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH || outputLength >= 160;
    }

    getAutoTranslationOutputValidationOptions(text, translated, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const isMergedLongText = requestOptions?.longTextMerged === true
            || (requestOptions?.mode === "long-text"
                && requestOptions?.longTextChunkIndex === undefined
                && Math.max(String(text || "").length, Number(requestOptions?.longTextSourceLength || 0) || 0) >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH);
        return {
            mergedLongText: isMergedLongText || Boolean(requestOptions?.longTextChunk),
            partialLongText: Boolean(requestOptions?.longTextPartial) || this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(translated)
        };
    }

    getAutoTranslationValidationPolicy(requestOptions = this.plugin.getAutoTranslationOptions()) {
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        if (this.plugin.isDirectTranslateProvider(config)) return "trust-provider";
        if (this.plugin.isLocalTranslationProvider(config)) return "best-effort";
        return "normal";
    }

    getAutoTranslationOutputValidationResult(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        const outputCounts = output ? this.plugin.countTextScriptsForValidation(output) : {};
        const sourceCounts = source ? this.plugin.countTextScriptsForValidation(source) : {};
        const targetLetters = targetScript === "unknown" ? 0 : Number(outputCounts[targetScript] || 0);
        const outputLetters = Number(outputCounts.total || 0);
        const sourceLetters = Number(sourceCounts.total || 0);
        const targetLanguageRatio = outputLetters > 0 ? targetLetters / outputLetters : 0;
        const sourceTargetLetters = targetScript === "unknown" ? 0 : Number(sourceCounts[targetScript] || 0);
        const residualSourceRatio = outputLetters > 0 && sourceLetters > 0
            ? Math.max(0, outputLetters - targetLetters) / outputLetters
            : 0;
        const normalizedSource = source.replace(/\s+/g, " ").toLocaleLowerCase();
        const normalizedOutput = output.replace(/\s+/g, " ").toLocaleLowerCase();
        const sameAsSource = Boolean(normalizedSource && normalizedSource === normalizedOutput);
        const refusal = this.plugin.hasRefusalAutoTranslationOutput(output);
        const base = {
            quality: TRANSLATION_VALIDATION_QUALITIES.BAD,
            reasonCode: "",
            targetLanguageRatio,
            residualSourceRatio,
            sameAsSource,
            refusal,
            shouldRepair: false,
            cacheable: false,
            renderable: false
        };

        if (!output) {
            return {
                ...base,
                quality: TRANSLATION_VALIDATION_QUALITIES.EMPTY,
                reasonCode: "empty",
                shouldRepair: true
            };
        }

        const policy = this.plugin.getAutoTranslationValidationPolicy(requestOptions);
        if (this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(output)) {
            return {
                ...base,
                quality: TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                reasonCode: "chunk-failure-placeholder",
                renderable: Boolean(options?.partialLongText),
                cacheable: false,
                shouldRepair: false
            };
        }

        const invalidReason = this.plugin.getAutoTranslationInvalidOutputReason(source, output, targetLanguage, options) || "";
        if (this.plugin.isHardInvalidAutoTranslationReason(invalidReason) || sameAsSource) {
            return {
                ...base,
                quality: sameAsSource ? TRANSLATION_VALIDATION_QUALITIES.BAD : base.quality,
                reasonCode: sameAsSource ? "same-as-source" : invalidReason,
                shouldRepair: true
            };
        }
        const partialLongText = Boolean(options?.partialLongText || requestOptions?.longTextPartial);
        if (policy === "trust-provider") {
            // A long message with a missing chunk is never cached as complete, whatever the provider.
            return {
                ...base,
                quality: partialLongText ? TRANSLATION_VALIDATION_QUALITIES.PARTIAL : TRANSLATION_VALIDATION_QUALITIES.GOOD,
                reasonCode: partialLongText ? (invalidReason || "long-text-partial") : invalidReason,
                renderable: true,
                cacheable: !partialLongText,
                shouldRepair: false
            };
        }

        if (partialLongText && !invalidReason) {
            return {
                ...base,
                quality: TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                reasonCode: "long-text-partial",
                renderable: true,
                cacheable: false,
                shouldRepair: false
            };
        }

        if (!invalidReason) {
            return {
                ...base,
                quality: TRANSLATION_VALIDATION_QUALITIES.GOOD,
                renderable: true,
                cacheable: true,
                shouldRepair: false
            };
        }

        if (partialLongText
            && !this.plugin.isHardInvalidAutoTranslationReason(invalidReason)
            && !sameAsSource
            && this.plugin.isRenderableBestEffortAutoTranslation(source, output, targetLanguage, {
                invalidReason,
                targetScript,
                targetLetters,
                outputLetters,
                sourceLetters,
                sourceTargetLetters,
                targetLanguageRatio
            })) {
            return {
                ...base,
                quality: TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                reasonCode: invalidReason,
                renderable: true,
                cacheable: false,
                shouldRepair: false
            };
        }

        if (policy === "best-effort" && this.plugin.isRenderableBestEffortAutoTranslation(source, output, targetLanguage, {
            invalidReason,
            targetScript,
            targetLetters,
            outputLetters,
            sourceLetters,
            sourceTargetLetters,
            targetLanguageRatio
        })) {
            const quality = this.plugin.getBestEffortAutoTranslationQuality(invalidReason, {
                targetLetters,
                outputLetters,
                sourceLetters,
                targetLanguageRatio
            });
            return {
                ...base,
                quality,
                reasonCode: invalidReason,
                renderable: true,
                cacheable: quality === TRANSLATION_VALIDATION_QUALITIES.USABLE,
                shouldRepair: quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL
            };
        }

        if (policy === "normal" && this.plugin.isUsableResidualAutoTranslation(source, output, targetLanguage, {
            invalidReason,
            targetLetters,
            outputLetters,
            targetLanguageRatio
        })) {
            return {
                ...base,
                quality: TRANSLATION_VALIDATION_QUALITIES.USABLE,
                reasonCode: invalidReason,
                renderable: true,
                cacheable: true,
                shouldRepair: false
            };
        }

        return {
            ...base,
            reasonCode: invalidReason,
            shouldRepair: true
        };
    }

    isHardInvalidAutoTranslationReason(reason) {
        return new Set([
            "empty",
            "same-as-source",
            "prompt-leakage",
            "refusal-output",
            "dictionary-output",
            "explanatory-output",
            "emoji-mismatch",
            "labeled-output"
        ]).has(String(reason || ""));
    }

    isRenderableBestEffortAutoTranslation(sourceText, translatedText, targetLanguage, meta = {}) {
        const output = String(translatedText || "").trim();
        if (!output || this.plugin.hasPromptLeakageAutoTranslationOutput(sourceText, output, targetLanguage)) return false;
        if (this.plugin.hasRefusalAutoTranslationOutput(output)) return false;
        if (this.plugin.hasDictionaryStyleAutoTranslationOutput(sourceText, output, targetLanguage)) return false;
        if (this.plugin.hasExplanatoryAutoTranslationOutput(sourceText, output)) return false;
        if (this.plugin.hasLabeledAutoTranslationOutput(output)) return false;
        if (this.plugin.isLikelyTargetLanguage(output, targetLanguage) || this.plugin.isLikelyTargetLanguageWithPreservedTokens(output, targetLanguage)) return true;
        const targetScript = meta.targetScript || this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return !meta.sameAsSource;
        const targetLetters = Number(meta.targetLetters || 0);
        const outputLetters = Number(meta.outputLetters || 0);
        if (targetScript === "han") {
            if (targetLetters >= 2 && outputLetters <= 12) return true;
            if (targetLetters >= 4 && Number(meta.targetLanguageRatio || 0) >= 0.12) return true;
            return targetLetters >= 8;
        }
        if (targetLetters >= 3 && outputLetters <= 16) return true;
        if (targetLetters >= 8 && Number(meta.targetLanguageRatio || 0) >= 0.18) return true;
        return targetLetters >= 16;
    }

    getBestEffortAutoTranslationQuality(reason, meta = {}) {
        const value = String(reason || "");
        if (["residual-source", "script-mismatch", "suspicious-chinese"].includes(value)) {
            return TRANSLATION_VALIDATION_QUALITIES.USABLE;
        }
        if (["missing-lines", "undertranslated", "target-language", "wrong-script", "foreign-dominant", "no-letters"].includes(value)) {
            return TRANSLATION_VALIDATION_QUALITIES.PARTIAL;
        }
        if (Number(meta.targetLanguageRatio || 0) >= 0.45) return TRANSLATION_VALIDATION_QUALITIES.USABLE;
        return TRANSLATION_VALIDATION_QUALITIES.PARTIAL;
    }

    isUsableResidualAutoTranslation(sourceText, translatedText, targetLanguage, meta = {}) {
        const reason = String(meta.invalidReason || "");
        if (!["residual-source", "script-mismatch"].includes(reason)) return false;
        if (this.plugin.hasPromptLeakageAutoTranslationOutput(sourceText, translatedText, targetLanguage)) return false;
        if (this.plugin.hasRefusalAutoTranslationOutput(translatedText)) return false;
        return Number(meta.targetLetters || 0) >= 2 && Number(meta.targetLanguageRatio || 0) >= 0.25;
    }

    getRaisedAutoTranslationMaxTokens(options = this.plugin.getAutoTranslationOptions(), text = "", multiplier = 1.6) {
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        const current = this.plugin.normalizeRequestNumber(config.maxTokens, DEFAULT_SETTINGS.translation.maxTokens, { min: 1, integer: true });
        const sourceLength = Math.max(String(text || "").length, Number(options?.longTextSourceLength || 0) || 0);
        const dynamic = this.plugin.getLongTextMaxTokensForLength(sourceLength, this.plugin.getAutoTranslationTargetLanguage(options));
        const target = Math.ceil(Math.max(current, dynamic, 256) * Math.max(1, Number(multiplier) || 1));
        const cap = this.plugin.isLocalTranslationProvider(config) ? 2400 : 6000;
        return Math.max(current + 128, Math.min(cap, target));
    }

    withRaisedAutoTranslationMaxTokens(options = this.plugin.getAutoTranslationOptions(), text = "", multiplier = 1.6) {
        return {
            ...options,
            configOverrides: {
                ...options.configOverrides,
                maxTokens: this.plugin.getRaisedAutoTranslationMaxTokens(options, text, multiplier)
            }
        };
    }

    async runAutoTranslationTask(text, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        if (this.plugin.isLongAutoTranslationText(text) && taskOptions.longTextStrategy !== false) {
            return this.plugin.runLongAutoTranslationTask(text, options, taskOptions);
        }
        return this.plugin.runAutoTranslationTaskWithOptions(text, options, taskOptions);
    }

    async runAutoTranslationTaskWithOptions(text, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        let translated = "";
        let firstInvalidReason = "";
        let firstValidation = null;
        try {
            this.plugin.consumeAutoTranslationRequestBudget(taskOptions);
            translated = await this.plugin.runAutoTranslationModelAttempt(text, options, taskOptions);
            const firstValidationOptions = this.plugin.getAutoTranslationOutputValidationOptions(text, translated, options);
            firstValidation = this.plugin.getAutoTranslationOutputValidationResult(text, translated, this.plugin.getAutoTranslationTargetLanguage(options), firstValidationOptions, options);
            firstInvalidReason = firstValidation.reasonCode || "";
        }
        catch (error) {
            if (!error?.modelOutputTruncated || taskOptions.retryInvalidOutput === false) throw error;
            if (!this.plugin.isAutoTranslationStrictRetryEnabled()) return this.plugin.runTruncatedAutoTranslationRetry(text, options, taskOptions, error);
            firstInvalidReason = "truncated";
        }
        if (firstValidation?.renderable) {
            if (firstValidation.quality !== TRANSLATION_VALIDATION_QUALITIES.GOOD) {
                this.plugin.logDiagnostic("auto.validation", "best-effort", {
                    sourceHash: this.plugin.getStrongTextFingerprint(text),
                    quality: firstValidation.quality,
                    reasonCode: firstValidation.reasonCode,
                    cacheable: firstValidation.cacheable,
                    mode: options?.mode || "auto"
                });
            }
            return translated;
        }
        if (!firstInvalidReason) return translated;
        if (this.plugin.shouldRunLocalAutoTranslationRepairRetry(firstInvalidReason, text, translated, options, taskOptions)) {
            let repairOptions = this.plugin.getAutoTranslationFinalFallbackOptions(text, options);
            if (firstInvalidReason === "truncated") repairOptions = this.plugin.withRaisedAutoTranslationMaxTokens(repairOptions, text, 1.8);
            this.plugin.consumeAutoTranslationRequestBudget(taskOptions);
            const repaired = await this.plugin.runAutoTranslationModelAttempt(text, repairOptions, taskOptions);
            const repairValidationOptions = this.plugin.getAutoTranslationOutputValidationOptions(text, repaired, repairOptions);
            const repairValidation = this.plugin.getAutoTranslationOutputValidationResult(text, repaired, this.plugin.getAutoTranslationTargetLanguage(repairOptions), repairValidationOptions, repairOptions);
            const repairInvalidReason = repairValidation.reasonCode || "";
            if (repairValidation.renderable) return repaired;
            throw this.plugin.createFinalInvalidAutoTranslationError(repairInvalidReason);
        }
        if (taskOptions.retryInvalidOutput === false || !this.plugin.isAutoTranslationStrictRetryEnabled()) throw this.plugin.createFinalInvalidAutoTranslationError(firstInvalidReason);

        let retryOptions = this.plugin.getAutoTranslationRetryOptions(text, translated, options);
        if (firstInvalidReason === "truncated") retryOptions = this.plugin.withRaisedAutoTranslationMaxTokens(retryOptions, text, 1.8);
        let retried = "";
        let retryInvalidReason = "";
        try {
            this.plugin.consumeAutoTranslationRequestBudget(taskOptions);
            retried = await this.plugin.runAutoTranslationModelAttempt(text, retryOptions, taskOptions);
            const retryValidationOptions = this.plugin.getAutoTranslationOutputValidationOptions(text, retried, retryOptions);
            const retryValidation = this.plugin.getAutoTranslationOutputValidationResult(text, retried, this.plugin.getAutoTranslationTargetLanguage(retryOptions), retryValidationOptions, retryOptions);
            retryInvalidReason = retryValidation.reasonCode || "";
            if (retryValidation.renderable) return retried;
        }
        catch (error) {
            if (!error?.modelOutputTruncated) throw error;
            retryInvalidReason = "truncated";
        }

        let lastChanceOptions = this.plugin.getAutoTranslationFinalFallbackOptions(text, options);
        if (retryInvalidReason === "truncated" || firstInvalidReason === "truncated") lastChanceOptions = this.plugin.withRaisedAutoTranslationMaxTokens(lastChanceOptions, text, 2.2);
        this.plugin.consumeAutoTranslationRequestBudget(taskOptions);
        const finalText = await this.plugin.runAutoTranslationModelAttempt(text, lastChanceOptions, taskOptions);
        const finalValidationOptions = this.plugin.getAutoTranslationOutputValidationOptions(text, finalText, lastChanceOptions);
        const finalValidation = this.plugin.getAutoTranslationOutputValidationResult(text, finalText, this.plugin.getAutoTranslationTargetLanguage(lastChanceOptions), finalValidationOptions, lastChanceOptions);
        const finalInvalidReason = finalValidation.reasonCode || "";
        if (finalValidation.renderable) return finalText;

        throw this.plugin.createFinalInvalidAutoTranslationError(finalInvalidReason);
    }

    // With strict retry off, a cut-off output still gets one retry with a larger max_tokens. If
    // that is cut off too, its truncation error ends the task and the failure layer backs off.
    // The retry may generate more tokens, so its timeout grows with max_tokens (bounded). A
    // looping model that is still too slow for it ends as the first truncation, never as a
    // timeout that would mark a healthy local service unavailable.
    async runTruncatedAutoTranslationRetry(text, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}, truncatedError = null) {
        const raisedOptions = {
            ...this.plugin.withRaisedAutoTranslationMaxTokens(options, text, 1.8),
            truncationRetry: true
        };
        raisedOptions.requestTimeoutMs = this.plugin.getTruncatedAutoTranslationRetryTimeoutMs(options, raisedOptions, text);
        this.plugin.logDiagnostic("auto.truncated", "retry", {
            sourceHash: this.plugin.getStrongTextFingerprint(text),
            mode: options?.mode || "auto",
            maxTokens: Number(raisedOptions?.configOverrides?.maxTokens || 0),
            timeoutMs: raisedOptions.requestTimeoutMs
        });
        this.plugin.consumeAutoTranslationRequestBudget(taskOptions);
        let retried = "";
        try {
            retried = await this.plugin.runAutoTranslationModelAttempt(text, raisedOptions, taskOptions);
        }
        catch (error) {
            if (truncatedError && !this.plugin.isAbandonedTranslationError(error) && this.plugin.isTimeoutError(error)) {
                truncatedError.truncationRetryTimedOut = true;
                throw truncatedError;
            }
            throw error;
        }
        const validation = this.plugin.getAutoTranslationOutputValidationResult(
            text,
            retried,
            this.plugin.getAutoTranslationTargetLanguage(raisedOptions),
            this.plugin.getAutoTranslationOutputValidationOptions(text, retried, raisedOptions),
            raisedOptions
        );
        if (validation.renderable) return retried;
        throw this.plugin.createFinalInvalidAutoTranslationError(validation.reasonCode || "invalid-output", { validationQuality: validation.quality });
    }

    // A per-click budget of model requests (manual translation). Every attempt, rescue and chunk
    // request takes one; when none are left the attempt fails without sending anything.
    createAutoTranslationRequestBudget(limit = MANUAL_TRANSLATION_REQUEST_BUDGET) {
        return { limit: Math.max(1, Math.floor(Number(limit) || MANUAL_TRANSLATION_REQUEST_BUDGET)), used: 0, reserved: 0 };
    }

    // A long message needs one request per chunk (plus the whole pass), so its click budget grows
    // with the chunk count, with a small rescue allowance on top, and stays bounded.
    getManualTranslationRequestBudgetLimit(text = "", requestOptions = this.plugin.getManualTranslationRequestOptions()) {
        if (!this.plugin.isLongAutoTranslationText(text)) return MANUAL_TRANSLATION_REQUEST_BUDGET;
        const longOptions = requestOptions?.mode === "long-text" ? requestOptions : this.plugin.getLongTextTranslationOptions(requestOptions, text);
        const chunkCount = this.plugin.splitLongAutoTranslationText(text, this.plugin.getLongAutoTranslationChunkLength(longOptions)).length;
        const wholePass = String(text || "").length <= MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH ? 1 : 0;
        const planned = chunkCount + wholePass + MANUAL_TRANSLATION_RESCUE_REQUEST_ALLOWANCE;
        return Math.min(MANUAL_TRANSLATION_REQUEST_BUDGET_MAX, Math.max(MANUAL_TRANSLATION_REQUEST_BUDGET, planned));
    }

    consumeAutoTranslationRequestBudget(taskOptions = {}) {
        const budget = taskOptions?.requestBudget;
        if (!budget) return;
        if (this.plugin.isAutoTranslationRequestBudgetExhausted(budget)) {
            const error = new Error("REQUEST_BUDGET_EXHAUSTED");
            error.code = "REQUEST_BUDGET_EXHAUSTED";
            error.autoTranslationRequestBudgetExhausted = true;
            error.requestBudgetLimit = budget.limit;
            // Only the requests held back for later chunks are left: this rescue ends, the click does not.
            error.requestBudgetReserved = Number(budget.used || 0) < Number(budget.limit || 0);
            throw error;
        }
        budget.used++;
    }

    isAutoTranslationRequestBudgetExhausted(budget) {
        return Boolean(budget && Number(budget.used || 0) >= Number(budget.limit || 0) - Math.max(0, Number(budget.reserved || 0)));
    }

    isAutoTranslationRequestBudgetError(error) {
        return Boolean(error?.autoTranslationRequestBudgetExhausted);
    }

    // Errors that say the provider (not this chunk) is failing: sending the remaining chunks of a
    // long message would only fail too and make rate limits worse.
    shouldStopLongAutoTranslationOnChunkError(error) {
        return ["auth", "quota", "rate-limit", "server", "local-unavailable", "network", "timeout"].includes(this.plugin.getAutoTranslationFailureType(error));
    }

    // A timeout or network error can be specific to one chunk (a slow or looping generation), so
    // the chunks that already succeeded are kept and drawn as a partial result.
    shouldKeepLongAutoTranslationChunksOnError(error) {
        return ["network", "timeout"].includes(this.plugin.getAutoTranslationFailureType(error));
    }

    shouldRunLocalAutoTranslationRepairRetry(reason, text, translated, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        if (taskOptions.retryInvalidOutput === false) return false;
        if (this.plugin.isAutoTranslationStrictRetryEnabled()) return false;
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        if (!this.plugin.isLocalTranslationProvider(config)) return false;
        if (options?.longTextChunk || options?.mode === "long-text") return false;
        if (String(text || "").length >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH) return false;
        const retryable = new Set([
            "same-as-source",
            "target-language",
            "wrong-script",
            "foreign-dominant",
            "residual-source",
            "refusal-output",
            "labeled-output",
            "dictionary-output",
            "explanatory-output",
            "no-letters",
            "invalid-output"
        ]);
        if (!retryable.has(String(reason || ""))) return false;
        return String(translated || "").trim().length > 0;
    }

    // The truncation retry's timeout: the normal one scaled by how much max_tokens grew, capped at
    // the long-text maximum (and never shorter than the normal timeout).
    getTruncatedAutoTranslationRetryTimeoutMs(options, raisedOptions, text = "") {
        const baseTimeoutMs = this.plugin.getAutoTranslationRequestTimeoutMs(options, text);
        const currentMaxTokens = this.plugin.normalizeRequestNumber(
            this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides).maxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const raisedMaxTokens = Number(raisedOptions?.configOverrides?.maxTokens || 0) || currentMaxTokens;
        const scaled = Math.ceil(baseTimeoutMs * Math.max(1, raisedMaxTokens / currentMaxTokens));
        return Math.max(baseTimeoutMs, Math.min(AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS, scaled));
    }

    getAutoTranslationRequestTimeoutMs(options = this.plugin.getAutoTranslationOptions(), text = "") {
        if (Number(options?.requestTimeoutMs) > 0) return Number(options.requestTimeoutMs);
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        const longLength = Math.max(String(text || "").length, Number(options?.longTextSourceLength || 0) || 0);
        if (options?.mode === "long-text" || options?.longTextChunk || longLength >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH) {
            const extra = Math.ceil(longLength / 400) * 10000;
            if (this.plugin.isLocalTranslationProvider(config)) return Math.min(AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS, MODEL_REQUEST_TIMEOUT_MS + extra);
            return Math.min(AUTO_TRANSLATE_CLOUD_LONG_TEXT_TIMEOUT_MAX_MS, AUTO_TRANSLATE_REQUEST_TIMEOUT_MS + Math.ceil(longLength / 700) * 5000);
        }
        if (this.plugin.isLocalTranslationProvider(config)) return MODEL_REQUEST_TIMEOUT_MS;
        return AUTO_TRANSLATE_REQUEST_TIMEOUT_MS;
    }

    createFinalInvalidAutoTranslationError(reason = "", options = {}) {
        const error = new Error(this.plugin.t("autoTranslateTargetFailed"));
        error.autoTranslationFinalInvalidOutput = true;
        error.autoTranslationTerminalFailure = options.terminal !== false;
        error.autoTranslationWeakFailure = Boolean(options.weak);
        error.autoTranslationInvalidReason = String(reason || "invalid-output");
        error.autoTranslationValidationQuality = String(options.validationQuality || "");
        error.retryAfterMs = Math.max(1000, Number(options.retryAfterMs || AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL));
        return error;
    }

    createAutoTranslationStaleError(reason = "stale") {
        const error = new Error("AUTO_TRANSLATION_STALE");
        error.autoTranslationStale = true;
        error.autoTranslationCancelReason = String(reason || "stale");
        return error;
    }

    // Superseded or cancelled work must not be retried, rescued or continued with the next chunk.
    isAbandonedTranslationError(error) {
        return Boolean(error?.autoTranslationStale) || this.plugin.isRequestCancelled(error);
    }

    async runAutoTranslationStrictFallbackTask(text, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        const strictOptions = this.plugin.getAutoTranslationRetryOptions(text, "", options);
        const signalOptions = taskOptions?.signal ? { signal: taskOptions.signal } : {};
        try {
            return await this.plugin.runAutoTranslationTask(text, strictOptions, { retryInvalidOutput: false, ...signalOptions });
        }
        catch (error) {
            if (!error?.autoTranslationFinalInvalidOutput) throw error;
            const lastChanceOptions = this.plugin.getAutoTranslationFinalFallbackOptions(text, options);
            const translated = await this.plugin.runAutoTranslationModelAttempt(text, lastChanceOptions, signalOptions);
            const finalInvalidReason = this.plugin.getAutoTranslationInvalidOutputReason(
                text,
                translated,
                this.plugin.getAutoTranslationTargetLanguage(lastChanceOptions),
                this.plugin.getAutoTranslationOutputValidationOptions(text, translated, lastChanceOptions)
            );
            if (!finalInvalidReason) return translated;
            throw this.plugin.createFinalInvalidAutoTranslationError(finalInvalidReason || error?.autoTranslationInvalidReason || "invalid-output");
        }
    }

    async runAutoTranslationBatchTask(texts, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        if ((texts || []).some(text => this.plugin.isLongAutoTranslationText(text))) {
            throw this.plugin.createAutoBatchParseError("Long text is handled by LongTextStrategy");
        }
        if (this.plugin.isDirectTranslateProvider(this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides))) {
            return this.plugin.runDirectTranslationBatchTask(texts, options, taskOptions);
        }
        const batch = texts.map((text, index) => ({
            id: String(index + 1).padStart(3, "0"),
            text
        }));
        const batchOptions = taskOptions.retry
            ? this.plugin.getAutoTranslationBatchRetryOptions(batch.length, options)
            : this.plugin.getAutoTranslationBatchOptions(batch.length, options);
        const output = await this.plugin.runModelTask("translation", JSON.stringify(batch), {
            configOverrides: batchOptions.configOverrides,
            timeoutMs: this.plugin.getAutoTranslationRequestTimeoutMs(batchOptions),
            mode: batchOptions.mode || "auto-batch",
            ...(taskOptions?.signal ? { signal: taskOptions.signal } : {})
        });
        const rows = this.plugin.parseAutoTranslationBatchOutput(output);
        const byId = new Map();
        const expectedIds = new Set(batch.map(item => item.id));
        if (rows.length > batch.length) throw this.plugin.createAutoBatchParseError("Too many batch rows");
        rows.forEach((row, index) => {
            if (typeof row === "string") {
                if (batch.length > 1) throw this.plugin.createAutoBatchParseError("Missing batch row id");
                const id = batch[index]?.id;
                if (!id || byId.has(id)) throw this.plugin.createAutoBatchParseError("Invalid batch row id");
                byId.set(id, row);
                return;
            }

            const id = this.plugin.normalizeBatchRowId(row?.id ?? row?.key ?? row?.index ?? row?.number);
            if (!id) throw this.plugin.createAutoBatchParseError("Missing batch row id");
            if (!expectedIds.has(id)) throw this.plugin.createAutoBatchParseError("Unknown batch row id");
            if (byId.has(id)) throw this.plugin.createAutoBatchParseError("Duplicate batch row id");
            const translation = this.plugin.extractBatchRowTranslation(row);
            byId.set(id, String(translation || ""));
        });

        return batch.map(item => String(byId.get(item.id) || "").trim());
    }

    getAutoTranslationOptions() {
        const configOverrides = this.plugin.getAutoTranslationOverrides();
        return {
            mode: "auto",
            version: this.plugin.autoTranslationConfigVersion,
            routeKey: this.plugin.getCurrentRouteKey(),
            targetLanguage: this.plugin.settings.translation.targetLanguage,
            providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides }),
            configOverrides
        };
    }

    getAutoTranslationTargetLanguage(options = this.plugin.getAutoTranslationOptions()) {
        return options?.targetLanguage || this.plugin.settings.translation.targetLanguage;
    }

    isAutoTranslationStrictRetryEnabled() {
        if (this.plugin.isDirectTranslateProvider(this.plugin.getEffectiveTaskConfig("translation"))) return false;
        return this.plugin.settings.ui?.autoTranslateStrictRetry !== false;
    }

    getAutoTranslationBatchGroupKey(options = this.plugin.getAutoTranslationOptions()) {
        const config = this.plugin.getCacheConfigSnapshot("translation", this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides));
        return [
            options?.mode || "auto",
            options?.version ?? this.plugin.autoTranslationConfigVersion,
            options?.routeKey || "",
            this.plugin.getAutoTranslationTargetLanguage(options),
            config.provider,
            config.endpoint,
            config.model,
            config.sourceLanguage,
            config.targetLanguage,
            `region:${this.plugin.getStrongTextFingerprint(config.region || "")}`,
            `deeplPlan:${config.deeplPlan || ""}`,
            `appId:${config.appIdHash || ""}`,
            config.temperature,
            config.maxTokens,
            config.enableThinking ? "thinking:on" : "thinking:off",
            this.plugin.getPromptPolicyCacheVersion("translation", options, config),
            config.prompt
        ].join("\n---\n");
    }

    getAutoTranslationBatchOptions(count, options = this.plugin.getAutoTranslationOptions()) {
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options));

        return {
            mode: "auto-batch",
            version: options?.version ?? this.plugin.autoTranslationConfigVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatch"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: this.plugin.getAutoTranslationTargetLanguage(options),
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatch"),
                prompt: this.plugin.buildPromptPolicyAutoBatchPrompt(count, options)
            }
        };
    }

    getAutoTranslationBatchRetryOptions(count, options = this.plugin.getAutoTranslationOptions()) {
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options));

        return {
            mode: "auto-batch-retry",
            version: options?.version ?? this.plugin.autoTranslationConfigVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatchRetry"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: this.plugin.getAutoTranslationTargetLanguage(options),
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatchRetry"),
                prompt: this.plugin.buildPromptPolicyAutoBatchRetryPrompt(count, options)
            }
        };
    }

    parseAutoTranslationBatchOutput(output) {
        const value = String(output || "").trim();
        if (!value) throw this.plugin.createAutoBatchParseError(this.plugin.t("emptyResult"));

        const jsonText = this.plugin.extractJsonPayload(value);
        let parsed = null;
        try {
            parsed = JSON.parse(jsonText);
        }
        catch {
            throw this.plugin.createAutoBatchParseError(this.plugin.t("invalidJson"));
        }

        const rows = this.plugin.normalizeAutoTranslationBatchRows(parsed);
        if (!Array.isArray(rows)) throw this.plugin.createAutoBatchParseError(this.plugin.t("invalidJson"));
        return rows;
    }

    normalizeAutoTranslationBatchRows(parsed) {
        if (Array.isArray(parsed)) return parsed;
        if (Array.isArray(parsed?.translations)) return parsed.translations;
        if (Array.isArray(parsed?.items)) return parsed.items;
        if (Array.isArray(parsed?.results)) return parsed.results;
        if (this.plugin.normalizeBatchRowId(parsed?.id ?? parsed?.key ?? parsed?.index ?? parsed?.number) && this.plugin.extractBatchRowTranslation(parsed)) return [parsed];

        const objectRows = parsed?.translations || parsed?.items || parsed?.results || parsed;
        if (!objectRows || typeof objectRows !== "object" || Array.isArray(objectRows)) return null;
        return Object.entries(objectRows).map(([id, value]) => {
            if (value && typeof value === "object") {
                return { id: this.plugin.normalizeBatchRowId(value.id ?? value.key ?? value.index ?? value.number ?? id), ...value };
            }
            return { id: this.plugin.normalizeBatchRowId(id), translation: value };
        });
    }

    getAutoTranslationRetryOptions(sourceText, badOutput = "", options = this.plugin.getAutoTranslationOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.plugin.isLocalAutoTranslationOptions(options);

        return {
            mode: "auto-retry",
            version: options?.version ?? this.plugin.autoTranslationConfigVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoRetry"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            longTextChunk: Boolean(options?.longTextChunk || options?.mode === "long-text"),
            longTextSourceLength: Number(options?.longTextSourceLength || String(sourceText || "").length) || 0,
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoRetry"),
                localCompactPrompt: isLocalProvider,
                prompt: isLocalProvider
                    ? this.plugin.buildCompactLocalAutoTranslationPrompt(options, "retry")
                    : this.plugin.buildPromptPolicyAutoRetryPrompt(sourceText, badOutput, options)
            }
        };
    }

    getAutoTranslationFinalFallbackOptions(sourceText, options = this.plugin.getAutoTranslationOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.plugin.isLocalAutoTranslationOptions(options);

        return {
            mode: "auto-final-fallback",
            version: options?.version ?? this.plugin.autoTranslationConfigVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoFinalFallback"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            longTextChunk: Boolean(options?.longTextChunk || options?.mode === "long-text"),
            longTextSourceLength: Number(options?.longTextSourceLength || String(sourceText || "").length) || 0,
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoFinalFallback"),
                localCompactPrompt: isLocalProvider,
                prompt: isLocalProvider
                    ? this.plugin.buildCompactLocalAutoTranslationPrompt(options, "final")
                    : this.plugin.buildPromptPolicyAutoFinalFallbackPrompt(sourceText, options)
            }
        };
    }

    getAutoTranslationOverrides() {
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(this.plugin.settings.translation.targetLanguage);
        const isLocalProvider = this.plugin.isLocalTranslationProvider({ provider: this.plugin.settings.translation.provider });

        return {
            provider: this.plugin.settings.translation.provider,
            apiKey: this.plugin.settings.translation.apiKey,
            endpoint: this.plugin.settings.translation.endpoint,
            model: this.plugin.settings.translation.model,
            sourceLanguage: AUTO_LANGUAGE_VALUE,
            targetLanguage,
            targetLanguageCode: this.plugin.getTargetLanguageCode(this.plugin.settings.translation.targetLanguage),
            temperature: 0,
            maxTokens: this.plugin.settings.translation.maxTokens,
            enableThinking: false,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("auto"),
            localCompactPrompt: isLocalProvider,
            prompt: isLocalProvider
                ? this.plugin.buildCompactLocalAutoTranslationPrompt({ targetLanguage: this.plugin.settings.translation.targetLanguage }, "auto")
                : this.plugin.buildPromptPolicyPrompt("auto", {
                    targetLanguage,
                    basePrompt: this.plugin.settings.translation.prompt
                })
        };
    }

    getAutoTranslationRequestSnapshot(options = null) {
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        return {
            provider: config.provider,
            apiKey: config.apiKey,
            endpoint: config.endpoint,
            model: config.model,
            region: config.region,
            deeplPlan: config.deeplPlan,
            appId: config.appId,
            secretKey: config.secretKey,
            maxTokens: config.maxTokens,
            // Builders replace targetLanguage with the LLM instruction; direct translation
            // APIs read this raw code instead.
            targetLanguageCode: this.plugin.getTargetLanguageCode(this.plugin.getAutoTranslationTargetLanguage(options || {}))
        };
    }

    getAutoTranslationTargetInstruction(language) {
        const target = this.plugin.normalizeLanguageName(language);
        const chineseInstruction = this.plugin.getChineseLanguageInstruction(target);
        if (chineseInstruction) return chineseInstruction;
        const labels = {
            "汉语": "Simplified Chinese (中文, zh-CN)",
            "英语": "English (en)",
            "西班牙语": "Spanish (Español, es)",
            "法语": "French (Français, fr)",
            "印地语": "Hindi (हिन्दी, hi)",
            "俄语": "Russian (Русский, ru)",
            "德语": "German (Deutsch, de)",
            "日语": "Japanese (日本語, ja)",
            "阿拉伯语": "Arabic (العربية, ar)",
            "越南语": "Vietnamese (Tiếng Việt, vi)",
            "朝鲜语": "Korean (한국어, ko)",
            "意大利语": "Italian (Italiano, it)"
        };
        return labels[target] || target || this.plugin.getLanguageInstruction(language);
    }

    hasUndertranslatedAutoTranslationOutput(sourceText, translatedText, targetLanguage) {
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        if (!this.plugin.shouldAutoTranslateText(source, targetLanguage)) return false;

        const sourceCounts = this.plugin.countTextScriptsForValidation(source);
        const outputCounts = this.plugin.countTextScriptsForValidation(output);
        const sourceLetters = Math.max(0, Number(sourceCounts.total || 0) - Number(sourceCounts[targetScript] || 0));
        const targetLetters = Number(outputCounts[targetScript] || 0);
        if (sourceLetters < 80 || targetLetters <= 0) return false;

        const outputLetterCount = Number(outputCounts.total || 0);
        if (sourceLetters >= 180 && outputLetterCount < 80 && targetLetters / Math.max(1, sourceLetters) < 0.16) return true;
        if (sourceLetters >= 80 && outputLetterCount < 40 && targetLetters / Math.max(1, sourceLetters) < 0.12) return true;
        if (sourceLetters >= 120 && targetLetters < this.plugin.getMinimumAutoTranslationTargetLetters(sourceLetters, targetScript)) return true;
        if (this.plugin.hasCollapsedAutoTranslationSentenceCoverage(source, output, targetLanguage, sourceLetters, targetLetters)) return true;
        return false;
    }

    getMinimumAutoTranslationTargetLetters(sourceLetters, targetScript) {
        const letters = Math.max(0, Number(sourceLetters) || 0);
        if (targetScript === "han") return Math.max(32, Math.round(letters * 0.24));
        if (targetScript === "kana" || targetScript === "hangul") return Math.max(40, Math.round(letters * 0.28));
        return Math.max(48, Math.round(letters * 0.35));
    }

    hasCollapsedAutoTranslationSentenceCoverage(sourceText, translatedText, targetLanguage, sourceLetters = null, targetLetters = null) {
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        const sourceChunks = this.plugin.getTranslatableAutoTranslationSentenceChunks(sourceText, targetLanguage);
        if (sourceChunks.length < 3) return false;

        const outputChunks = this.plugin.getSentenceLikeChunks(translatedText)
            .filter(chunk => this.plugin.hasLetters(chunk) && !this.plugin.isLikelyPreservedTokenLine(chunk));
        if (!outputChunks.length) return true;

        const sourceCount = Number.isFinite(sourceLetters)
            ? sourceLetters
            : Math.max(0, Number(this.plugin.countTextScriptsForValidation(sourceText).total || 0));
        const targetCount = Number.isFinite(targetLetters)
            ? targetLetters
            : Number(this.plugin.countTextScriptsForValidation(translatedText)[targetScript] || 0);
        if (sourceCount < 120) return false;

        const collapsedRatio = targetCount / Math.max(1, sourceCount);
        if (outputChunks.length <= 1 && collapsedRatio < 0.32) return true;
        if (sourceChunks.length >= 5 && outputChunks.length <= Math.ceil(sourceChunks.length * 0.4) && collapsedRatio < 0.38) return true;
        return false;
    }

    hasMissingAutoTranslationLines(sourceText, translatedText, targetLanguage, options = {}) {
        const sourceLines = this.plugin.getTranslatableAutoTranslationLines(sourceText, targetLanguage);
        if (sourceLines.length <= 1) return false;
        if (!this.plugin.shouldPreserveAutoTranslationLineCount(sourceText, sourceLines)) return false;

        const translatedLines = String(translatedText || "")
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => this.plugin.hasLetters(line));
        if (translatedLines.length < sourceLines.length) {
            if (this.plugin.isMergedShortAutoTranslationLinesAcceptable(sourceLines, translatedText, targetLanguage, options)) return false;
            return true;
        }

        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        return sourceLines.some((sourceLine, index) => this.plugin.isAutoTranslationLineUndercovered(sourceLine, translatedLines[index], targetLanguage, targetScript));
    }

    isMergedShortAutoTranslationLinesAcceptable(sourceLines = [], translatedText = "", targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}) {
        if (options?.mergedLongText) return true;
        const lines = sourceLines.map(line => String(line || "").trim()).filter(Boolean);
        if (lines.length < 2 || lines.length > 4) return false;
        if (lines.some(line => line.length > 80)) return false;
        if (lines.some(line => this.plugin.getAutoTranslationLineWordCount(line, targetLanguage) > 2)) return false;
        const output = String(translatedText || "").trim();
        if (!output) return false;
        if (!this.plugin.isLikelyTargetLanguage(output, targetLanguage) && !this.plugin.isTargetLanguageDominantBySentence(output, targetLanguage, { allowPureTarget: true })) return false;
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return true;
        const sourceCounts = this.plugin.countTextScriptsForValidation(lines.join("\n"));
        const outputCounts = this.plugin.countTextScriptsForValidation(output);
        const sourceForeignLetters = Math.max(0, Number(sourceCounts.total || 0) - Number(sourceCounts[targetScript] || 0));
        const outputTargetLetters = Number(outputCounts[targetScript] || 0);
        if (sourceForeignLetters <= 16) return outputTargetLetters >= Math.max(2, Math.round(sourceForeignLetters * 0.25));
        return outputTargetLetters >= Math.max(6, Math.round(sourceForeignLetters * 0.32));
    }

    getAutoTranslationLineWordCount(line, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        const text = String(line || "");
        if (targetScript === "latin") return (text.match(/\p{L}+/gu) || []).length;
        const segments = this.plugin.getLanguageScriptSegments(text).filter(segment => segment.script !== targetScript && !this.plugin.isLikelyPreservedForeignSegment(segment.text));
        return segments.reduce((total, segment) => {
            if (segment.script === "latin") return total + this.plugin.getMeaningfulLatinWords(segment.text).length;
            return total + Math.max(1, (segment.text.match(/\p{L}+/gu) || []).length);
        }, 0);
    }

    shouldPreserveAutoTranslationLineCount(sourceText, sourceLines = []) {
        const source = String(sourceText || "");
        const lines = sourceLines.map(line => String(line || "").trim()).filter(Boolean);
        if (lines.length <= 1) return false;
        if (/```|~~~/.test(source)) return true;
        if (/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s+|#{1,6}\s+|\|)/m.test(source)) return true;
        if (lines.length >= 2 && lines.every(line => line.length <= 120)) return true;
        if (lines.length >= 4 && lines.every(line => line.length <= 180)) return true;
        return false;
    }

    isAutoTranslationLineUndercovered(sourceLine, translatedLine, targetLanguage, targetScript = this.plugin.getTargetLanguageScript(targetLanguage)) {
        const source = String(sourceLine || "").trim();
        const output = String(translatedLine || "").trim();
        if (!source) return false;
        if (!output) return true;
        if (this.plugin.hasResidualAutoTranslationSourceText(output, targetLanguage, source)) return true;
        const anchors = this.plugin.getAutoTranslationCoverageAnchors(source);
        if (anchors.length && !this.plugin.hasAutoTranslationCoverageAnchors(output, anchors)) return true;

        const sourceCounts = this.plugin.countTextScriptsForValidation(source);
        const outputCounts = this.plugin.countTextScriptsForValidation(output);
        const sourceLetters = Math.max(0, Number(sourceCounts.total || 0) - Number(sourceCounts[targetScript] || 0));
        if (sourceLetters < 24) return false;

        const targetLetters = Number(outputCounts[targetScript] || 0);
        if (targetLetters <= 0) return true;
        if (sourceLetters < 80) return targetLetters < Math.max(2, Math.round(sourceLetters * 0.08));
        return targetLetters < Math.max(8, Math.round(this.plugin.getMinimumAutoTranslationTargetLetters(sourceLetters, targetScript) * 0.6));
    }

    getTranslatableAutoTranslationSentenceChunks(text, targetLanguage) {
        return this.plugin.getSentenceLikeChunks(text)
            .filter(chunk => this.plugin.hasLetters(chunk) && this.plugin.shouldAutoTranslateText(chunk, targetLanguage));
    }

    getAutoTranslationCoverageAnchors(text) {
        const source = String(text || "");
        if (!source) return [];
        const anchors = [];
        const pushMatches = pattern => {
            for (const match of source.match(pattern) || []) {
                const normalized = this.plugin.normalizeAutoTranslationCoverageAnchor(match);
                if (normalized && !anchors.includes(normalized)) anchors.push(normalized);
            }
        };

        pushMatches(/https?:\/\/[^\s<>()]+|www\.[^\s<>()]+/gi);
        pushMatches(/<[@#&!]?\d+>|@[A-Za-z0-9_.-]{2,}|#[A-Za-z0-9_.-]{2,}/g);
        pushMatches(/`[^`\n]{1,80}`/g);
        pushMatches(/\b[A-Z]{2,}[-_:/]?[A-Z0-9]{2,}\b/g);
        pushMatches(/\b[A-Za-z]{2,}[A-Za-z0-9]*[-_:/][A-Za-z0-9][A-Za-z0-9._:/-]*\b/g);
        pushMatches(/\b\d{2,}(?:[.:-]\d+)*\b/g);
        pushMatches(/\b[A-Z][A-Za-z0-9]*[A-Z][A-Za-z0-9]*\b/g);
        return anchors.slice(0, 16);
    }

    normalizeAutoTranslationCoverageAnchor(value) {
        const text = String(value || "")
            .trim()
            .replace(/^`|`$/g, "")
            .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "")
            .toLocaleLowerCase();
        if (!text || text.length < 2) return "";
        return text;
    }

    hasAutoTranslationCoverageAnchors(translatedText, anchors = []) {
        if (!anchors.length) return true;
        const normalizedOutput = String(translatedText || "").toLocaleLowerCase();
        return anchors.every(anchor => normalizedOutput.includes(anchor));
    }

    isMergedLongAutoTranslationAcceptable(sourceText, translatedText, targetLanguage, sourceLines = this.plugin.getTranslatableAutoTranslationLines(sourceText, targetLanguage)) {
        if (sourceLines.length < 3) return false;
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;
        if (this.plugin.hasResidualAutoTranslationSourceText(output, targetLanguage, source)) return false;
        if (this.plugin.hasUndertranslatedAutoTranslationOutput(source, output, targetLanguage)) return false;

        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return this.plugin.isTargetLanguageDominantBySentence(output, targetLanguage);
        const sourceCounts = this.plugin.countTextScriptsForValidation(source);
        const outputCounts = this.plugin.countTextScriptsForValidation(output);
        const sourceForeignLetters = Math.max(0, Number(sourceCounts.total || 0) - Number(sourceCounts[targetScript] || 0));
        const outputTargetLetters = Number(outputCounts[targetScript] || 0);
        const outputForeignLetters = Math.max(0, Number(outputCounts.total || 0) - outputTargetLetters);
        if (outputTargetLetters <= 0) return false;
        if (outputForeignLetters / Math.max(1, Number(outputCounts.total || 0)) > 0.35) return false;
        return sourceForeignLetters < 120 || outputTargetLetters >= Math.min(80, Math.max(24, Math.round(sourceForeignLetters * 0.18)));
    }

    getTranslatableAutoTranslationLines(text, targetLanguage) {
        return String(text || "")
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => this.plugin.hasLetters(line) && this.plugin.shouldAutoTranslateText(line, targetLanguage));
    }

    hasResidualAutoTranslationSourceText(translatedText, targetLanguage, sourceText = "") {
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "latin" || targetScript === "unknown") return false;

        return String(translatedText || "")
            .split(/\n+/)
            .map(line => line.trim())
            .filter(Boolean)
            .some(line => this.plugin.hasLetters(line)
                && !this.plugin.isLikelyPreservedTokenLine(line)
                && !this.plugin.isTargetLanguageDominantBySentence(line, targetLanguage)
                && !this.plugin.isTargetLanguageLineWithPreservedSourceTerms(line, targetLanguage, sourceText)
                && this.plugin.shouldAutoTranslateText(line, targetLanguage));
    }

    hasSuspiciousResidualAutoTranslationForeignText(sourceText, translatedText, targetLanguage) {
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "latin" || targetScript === "unknown") return false;
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;

        const segments = this.plugin.getLanguageScriptSegments(output)
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.plugin.isLikelyPreservedForeignSegment(segment.text));
        if (!segments.length) return false;

        return segments.some(segment => {
            if (segment.script !== "latin") {
                return this.plugin.shouldAutoTranslateText(segment.text, targetLanguage)
                    && !this.plugin.isTargetLanguageLineWithPreservedSourceTerms(segment.text, targetLanguage, source);
            }

            if (this.plugin.isPreservableSourceLatinSegment(segment.text, source)) return false;
            const words = this.plugin.getMeaningfulLatinWords(segment.text);
            const nonBenignWords = words.filter(word => !this.plugin.isBenignEmbeddedLatinToken(word));
            if (!nonBenignWords.length) return false;
            if (nonBenignWords.every(word => this.plugin.isCommonResidualEnglishWord(word))) return true;
            if (nonBenignWords.some(word => this.plugin.isCommonResidualEnglishWord(word)) && !nonBenignWords.some(word => this.plugin.isNamedLatinTermShape(word))) return true;
            if (nonBenignWords.some(word => this.plugin.isLikelyResidualSourceLatinWord(word, source))) return true;
            return nonBenignWords.length >= 3 && nonBenignWords.join("").length >= 12;
        });
    }

    getAutoTranslationPrecheckSkipReason(text, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const value = String(text || "").trim();
        const targetLanguage = this.plugin.getAutoTranslationTargetLanguage(requestOptions);
        const cached = this.plugin.getAutoTranslationPrecheckSkipReasonFromCache(value, targetLanguage, requestOptions);
        if (cached !== null) return cached;

        const reason = this.plugin.computeAutoTranslationPrecheckSkipReason(value, targetLanguage);
        if (reason) this.plugin.cacheAutoTranslationPrecheckSkipReason(value, targetLanguage, requestOptions, reason);
        return reason;
    }

    computeAutoTranslationPrecheckSkipReason(text, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const source = String(text || "").trim();
        if (source.length < 2) return "too-short";
        if (!this.plugin.hasLetters(source)) return "no-letters";
        // Standard emoji are sent with the text, but no skip rule counts them: "https://… ❤️" and
        // ":pepe: ❤️" are still a link or custom emoji alone, "a 👍" is still too short.
        const withoutEmoji = removeStandardEmoji(source);
        const value = withoutEmoji === source ? source : this.plugin.normalizeExtractedText(withoutEmoji);
        if (value.length < 2) return "too-short";
        if (!this.plugin.hasLetters(value)) return "no-letters";
        if (this.plugin.isAutoTranslationLinkOnlyText(value)) return "link-only";
        if (this.plugin.isAutoTranslationCodeOnlyText(value)) return "code-only";
        if (this.plugin.isLowInformationRepeatedText(value)) return "low-information-repeat";
        if (this.plugin.isLikelyPreservedTokenLine(value)) return "preserved-token";
        if (this.plugin.isCommonTargetShortText(value, targetLanguage)) return "common-target-short";
        if (!this.plugin.shouldAutoTranslateText(value, targetLanguage)) return "already-target-language";
        return "";
    }

    getAutoTranslationPrecheckSkipReasonFromCache(text, targetLanguage, requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        const key = this.plugin.getAutoTranslationPrecheckSkipCacheKey(text, targetLanguage, requestOptions);
        if (!key || !this.plugin.autoTranslationPrecheckSkips?.has?.(key)) return null;
        const entry = this.plugin.autoTranslationPrecheckSkips.get(key);
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            this.plugin.autoTranslationPrecheckSkips.delete(key);
            return null;
        }
        return entry.reason || "";
    }

    cacheAutoTranslationPrecheckSkipReason(text, targetLanguage, requestOptions = this.plugin.getAutoTranslationOptions(), reason = "") {
        if (!reason) return;
        if (!this.plugin.autoTranslationPrecheckSkips?.set) this.plugin.autoTranslationPrecheckSkips = new Map();
        const key = this.plugin.getAutoTranslationPrecheckSkipCacheKey(text, targetLanguage, requestOptions);
        if (!key) return;
        this.plugin.autoTranslationPrecheckSkips.set(key, {
            reason,
            expiresAt: Date.now() + AUTO_TRANSLATE_PRECHECK_SKIP_TTL_MS
        });
        this.plugin.pruneAutoTranslationPrecheckSkipCache();
    }

    getAutoTranslationPrecheckSkipCacheKey(text, targetLanguage, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const value = String(text || "").trim();
        if (!value) return "";
        return [
            this.plugin.normalizeLanguageName(targetLanguage),
            requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions),
            this.plugin.getStrongTextFingerprint(value)
        ].join("\n---\n");
    }

    pruneAutoTranslationPrecheckSkipCache(now = Date.now()) {
        if (!this.plugin.autoTranslationPrecheckSkips?.size) return;
        for (const [key, entry] of this.plugin.autoTranslationPrecheckSkips) {
            if (Number(entry?.expiresAt || 0) <= now) this.plugin.autoTranslationPrecheckSkips.delete(key);
        }
        while (this.plugin.autoTranslationPrecheckSkips.size > AUTO_TRANSLATE_PRECHECK_SKIP_MAX) {
            const oldestKey = this.plugin.autoTranslationPrecheckSkips.keys().next().value;
            this.plugin.autoTranslationPrecheckSkips.delete(oldestKey);
        }
    }

    isAutoTranslationLinkOnlyText(text) {
        const value = String(text || "").trim();
        if (!value) return false;
        const stripped = value
            .replace(/https?:\/\/[^\s<>"']+/gi, " ")
            .replace(/\bwww\.[^\s<>"']+/gi, " ")
            .replace(/<https?:\/\/[^>]+>/gi, " ")
            .replace(/<[@#][!&]?\d{15,}>/g, " ")
            .replace(/<@&\d{15,}>/g, " ")
            .replace(/<a?:[A-Za-z0-9_~.-]+:\d{15,}>/g, " ")
            .replace(/:[A-Za-z0-9_~.-]{2,}:/g, " ")
            .replace(/[\s\p{P}\p{S}\p{N}]+/gu, "");
        return stripped.length === 0 && /(?:https?:\/\/|www\.|<[@#]|<a?:|:[A-Za-z0-9_~.-]{2,}:)/i.test(value);
    }

    isAutoTranslationCodeOnlyText(text) {
        const value = String(text || "").trim();
        if (!value) return false;
        return /^```[\s\S]*```$/.test(value) || /^`[^`\n]+`$/.test(value);
    }

    shouldAutoTranslateText(text, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const value = String(text || "").trim();
        if (value.length < 2) return false;
        if (!this.plugin.hasLetters(value)) return false;
        if (this.plugin.isLowInformationRepeatedText(value)) return false;
        if (this.plugin.isLikelyPreservedTokenLine(value)) return false;
        if (this.plugin.isCommonTargetShortText(value, targetLanguage)) return false;
        if (this.plugin.getTargetLanguageScript(targetLanguage) === "han" && this.plugin.isLikelyJapaneseHanText(value)) return true;
        if (this.plugin.hasDominantForeignLine(value, targetLanguage)) return true;
        if (this.plugin.hasTranslatableForeignSegment(value, targetLanguage)) return true;
        if (this.plugin.isTargetLanguageWithBenignEmbeddedForeignTokens(value, targetLanguage)) return false;
        if (this.plugin.isTargetLanguageLeadWithShortEmbeddedForeignText(value, targetLanguage)) return false;
        if (this.plugin.isTargetLanguageDominantBySentence(value, targetLanguage)) return false;
        return !this.plugin.isLikelyTargetLanguageWithPreservedTokens(value, targetLanguage);
    }

    isLowValueAutoTranslationShortText(text, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "latin" || targetScript === "unknown") return false;
        const normalized = String(text || "")
            .trim()
            .toLocaleLowerCase()
            .replace(/[^\p{L}\p{N}'+_.-]+/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
        if (!normalized || normalized.length > 24) return false;
        const words = normalized.split(" ").filter(Boolean);
        if (!words.length || words.length > 3) return false;
        const lowValue = new Set([
            "ok", "okay", "k", "kk", "lol", "lmao", "gg", "ty", "thx", "thanks", "np", "brb",
            "idk", "btw", "yes", "no", "yep", "nope", "sure", "done", "nice", "good", "bad", "same"
        ]);
        return words.every(word => lowValue.has(word));
    }

    getManualLongTextWholePassOptions(plan, requestOptions = plan?.requestOptions || this.plugin.getManualTranslationRequestOptions()) {
        const raised = this.plugin.withRaisedAutoTranslationMaxTokens(requestOptions, plan?.text || "", 2);
        const config = this.plugin.getEffectiveTaskConfig("translation", raised?.configOverrides);
        const prompt = this.plugin.isLocalTranslationProvider(config)
            ? this.plugin.buildCompactLocalAutoTranslationPrompt(raised, "longText")
            : this.plugin.buildPromptPolicyLongTextPrompt(raised);
        return {
            ...raised,
            mode: `${requestOptions?.mode || "manual"}-whole`,
            longTextWholePass: true,
            longTextMerged: true,
            longTextSourceLength: String(plan?.text || "").length,
            configOverrides: {
                ...raised.configOverrides,
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(raised)),
                targetLanguageCode: this.plugin.getTargetLanguageCode(this.plugin.getAutoTranslationTargetLanguage(raised)),
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("longText"),
                localCompactPrompt: this.plugin.isLocalTranslationProvider(config),
                prompt
            }
        };
    }

    async runManualLongTextWholePass(plan, requestOptions, taskOptions = {}) {
        if (!this.plugin.isLongAutoTranslationText(plan?.text)) return null;
        const sourceLength = String(plan?.text || "").length;
        if (sourceLength > MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH) return null;
        const wholeOptions = this.plugin.getManualLongTextWholePassOptions(plan, requestOptions);
        this.plugin.logDiagnostic("manual.long-text.whole-pass", "start", {
            ...this.plugin.getTranslationDiagnosticMeta("manual", {
                requestOptions: wholeOptions,
                text: plan.text,
                cacheKey: plan.cacheKey,
                textOptions: plan.textOptions,
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                reasonCode: DIAGNOSTIC_REASON_CODES.REQUEST_STARTED
            }),
            sourceLength,
            domLength: String(plan.domText || "").length,
            sourceKind: plan.sourceKind || "",
            sourceTextKind: plan.sourceKind || "",
            maxTokens: Number(wholeOptions?.configOverrides?.maxTokens || 0)
        });
        try {
            const translated = await this.plugin.runAutoTranslationTaskWithOptions(plan.text, wholeOptions, {
                ...taskOptions,
                longTextStrategy: false,
                retryInvalidOutput: false,
                manualRescue: false
            });
            this.plugin.logDiagnostic("manual.long-text.whole-pass", "success", {
                ...this.plugin.getTranslationDiagnosticMeta("manual", {
                    requestOptions: wholeOptions,
                    text: plan.text,
                    cacheKey: plan.cacheKey,
                    textOptions: plan.textOptions,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.VALIDATING,
                    reasonCode: DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED
                }),
                sourceLength,
                outputLength: String(translated || "").length
            });
            return translated;
        }
        catch (error) {
            if (this.plugin.isAbandonedTranslationError(error)) throw error;
            // A provider-wide failure (or no requests left) ends the click here. A timeout may be
            // down to the size of the whole pass, so the smaller chunk requests still get a turn.
            if (this.plugin.isAutoTranslationRequestBudgetError(error)
                || (this.plugin.shouldStopLongAutoTranslationOnChunkError(error) && !this.plugin.isTimeoutError(error))) {
                throw error;
            }
            this.plugin.logDiagnostic("manual.long-text.whole-pass", "failed", {
                ...this.plugin.getTranslationDiagnosticMeta("manual", {
                    requestOptions: wholeOptions,
                    text: plan.text,
                    cacheKey: plan.cacheKey,
                    textOptions: plan.textOptions,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    reasonCode: DIAGNOSTIC_REASON_CODES.FAILURE,
                    extra: {
                        failureType: this.plugin.getAutoTranslationFailureType(error),
                        failureClass: DIAGNOSTIC_FAILURE_CLASSES.WHOLE_PASS_FAILED,
                        failureLayer: DIAGNOSTIC_FAILURE_LAYERS.REQUEST
                    }
                }),
                sourceLength,
                outputLength: Number(error?.partialOutputLength || 0),
                invalidReason: error?.autoTranslationInvalidReason || "",
                validationQuality: error?.autoTranslationValidationQuality || "",
                type: this.plugin.getAutoTranslationFailureType(error),
                wholePassFailed: true
            });
            return null;
        }
    }

    isLongAutoTranslationRequestOptions(options = {}) {
        const length = Math.max(String(options?.input || "").length, Number(options?.longTextSourceLength || 0) || 0);
        return Boolean(options?.mode === "long-text"
            || options?.longTextChunk
            || options?.configOverrides?.promptPolicyVersion === this.plugin.getPromptPolicyVersion("longText")
            || length >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH);
    }

    withAutoTranslationCandidateIdentity(options, candidate = {}) {
        return {
            ...options,
            messageIdentity: candidate.messageIdentity || this.plugin.getMessageIdentity(candidate.messageNode, candidate.content, this.plugin.getAutoTranslationTargetDomText(candidate))
        };
    }
}

module.exports = { AutoTranslationRequestPipeline };
