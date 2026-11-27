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
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_FAILURE_CLASSES,
    DIAGNOSTIC_FAILURE_LAYERS,
    DIAGNOSTIC_MESSAGE_STATES,
    DIAGNOSTIC_REASON_CODES,
    MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH,
    MANUAL_TRANSLATION_REQUEST_BUDGET,
    MANUAL_TRANSLATION_REQUEST_BUDGET_MAX,
    MANUAL_TRANSLATION_RESCUE_REQUEST_ALLOWANCE,
    MODEL_REQUEST_TIMEOUT_MS,
    TRANSLATION_VALIDATION_QUALITIES
} = require("../constants");
const { createPluginContext } = require("../core/plugin-context");
const { removeStandardEmoji } = require("../intake/emoji-text");

class AutoTranslationRequestPipeline {
    constructor(plugin, ctx = createPluginContext(plugin)) {
        this.plugin = plugin;
        this.ctx = ctx;
    }

    _createCancelledError() {
        if (typeof this.plugin.createProviderRequestCancelledError === "function") {
            return this.plugin.createProviderRequestCancelledError();
        }
        if (typeof this.plugin.providerLayer?.createProviderRequestCancelledError === "function") {
            return this.plugin.providerLayer.createProviderRequestCancelledError();
        }
        return Object.assign(new Error("Request cancelled"), { name: "AbortError", code: "REQUEST_CANCELLED" });
    }

    get stateMachine() { return this.ctx.stateMachine; }
    get cooldowns() { return this.ctx.cooldowns; }

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
            this.runCacheOnlyAutoTranslationScan(reason);
        }, delay);
        this.plugin.unrefTimer?.(this.plugin.cacheOnlyScanTimer);
    }

    runCacheOnlyAutoTranslationScan(reason = "deferred") {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return 0;
        }
        if (this.plugin.isQuickSettingsPanelOpen()) {
            this.plugin.quickSettingsScanDeferred = true;
            return 0;
        }
        if (this.plugin.isDiscordSettingsSurfaceOpen()) {
            this.plugin.discordSettingsScanDeferred = true;
            return 0;
        }
        const mediaQuietMs = this.plugin.getDiscordMediaViewerQuietRemainingMs();
        if (mediaQuietMs > 0) {
            this.plugin.scheduleCacheOnlyAutoTranslationScan(reason, Math.max(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, mediaQuietMs) + 80);
            return 0;
        }
        if (this.plugin.isDiscordMediaViewerOpen()) {
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
        const requestOptions = this.getAutoTranslationOptions();
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
        if (providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure, now) && !providerFailure.terminal) {
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationFailureRemainingMs(providerFailure, now));
        }
        const providerCoolingDown = Boolean(providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure, now));
        const apiWorkBlocked = !hasUsableApi || viewportApiBlocked || providerCoolingDown;
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
            checkLocalProviderHealth: !apiWorkBlocked,
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
            cacheOnly,
            hasUsableApi,
            renderPaused,
            viewportSettling,
            jumpCoolingDown,
            viewportStabilityPending,
            providerCoolingDown
        };
    }

    processAutoTranslationScanCandidates(work, candidates = []) {
        if (!work?.scanState || !work?.scanStats) return 0;
        if (candidates.length) {
            this.plugin.pruneAutoTranslationActiveState();
            work.scanState.deferEnqueueSort = true;
        }
        try {
            for (const candidate of candidates) {
                work.scanStats.seen++;
                const decision = this.plugin.evaluateAutoTranslationCandidate(candidate, work.scanState);
                this.applyAutoTranslationDecision(candidate, decision, work.scanStats);
            }
        }
        finally {
            work.scanState.deferEnqueueSort = false;
        }
        return candidates.length;
    }

    finishAutoTranslationScanWork(work) {
        if (!work?.scanState || !work?.scanStats) return;
        const { scanState, scanStats, context, requestOptions } = work;
        if (scanState.enqueueSortPending) {
            scanState.enqueueSortPending = false;
            this.plugin.sortAutoTranslationQueue();
        }
        const { apiWorkBlocked, blockReason, localProviderHealthBlocked } = scanState;
        if (scanStats.eligible || scanStats.cacheHits || scanStats.textCacheHits || scanStats.enqueued || scanStats.blocked || scanStats.failures) {
            this.plugin.logDiagnostic("auto.scan", apiWorkBlocked ? "blocked" : "ok", {
                ...this.plugin.getDiagnosticBaseMeta("auto", requestOptions?.mode || "auto", apiWorkBlocked ? this.plugin.getAutoTranslationBlockReasonCode(blockReason) : ""),
                messageState: apiWorkBlocked ? DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE : DIAGNOSTIC_MESSAGE_STATES.DISCOVERED,
                ...scanStats,
                cacheOnly: work.cacheOnly,
                hasUsableApi: work.hasUsableApi,
                renderPaused: work.renderPaused,
                viewportSettling: work.viewportSettling,
                jumpCoolingDown: work.jumpCoolingDown,
                viewportStabilityPending: work.viewportStabilityPending,
                providerCoolingDown: work.providerCoolingDown,
                localProviderHealthBlocked: Boolean(localProviderHealthBlocked),
                blockReason,
                intakeMode: context.autoTranslateIntake?.mode || this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui?.autoTranslateIntakeMode),
                intakeSource: context.autoTranslateIntake?.source || "dom",
                bdfdbAvailable: Boolean(context.autoTranslateIntake?.bdfdbAvailable),
                queueLength: this.stateMachine.queue.length,
                inFlight: this.stateMachine.inFlight
            });
        }
        if (!apiWorkBlocked) this.plugin.drainAutoTranslationQueue();
        if (!apiWorkBlocked && scanStats.visibleDeferred > 0) {
            this.plugin.scheduleAutoTranslationRetryScan(AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS, { minDelayMs: AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS });
        }
    }

    isCandidateChannelPolicyDisabled(target) {
        if (!target?.messageNode) return false;
        const policies = this.plugin.settings?.ui?.channelAutoTranslatePolicies;
        if (!policies || typeof policies !== "object" || Array.isArray(policies)) return false;
        const nodeIds = this.plugin.messageTracker?.getNodeMessageIds?.(target.messageNode);
        const channelId = String(nodeIds?.channelId || "").trim();
        if (!channelId) return false;
        const routeIds = this.plugin.messageTracker?.getRouteIds?.() || {};
        const directKey = `${nodeIds?.guildId || routeIds.guildId || ""}:${channelId}`;
        if (policies[directKey]?.mode === "disabled") return true;
        if (policies[directKey]?.mode === "enabled") return false;
        const suffix = `:${channelId}`;
        for (const [key, policy] of Object.entries(policies)) {
            if (key.endsWith(suffix) && policy && typeof policy === "object") {
                if (policy.mode === "disabled") return true;
                if (policy.mode === "enabled") return false;
            }
        }
        return false;
    }

    evaluateAutoTranslationCandidate(candidate, scanState = {}) {
        const target = candidate || {};
        const text = String(target.text || "");
        const requestOptions = scanState.requestOptions || this.getAutoTranslationOptions();
        const now = Number(scanState.now || Date.now());
        if (this.isCandidateChannelPolicyDisabled(target)) {
            return {
                action: "skip",
                status: "skipped",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.AUTO_DISABLED,
                counts: { blocked: 1 },
                extra: { channelPolicyDisabled: true }
            };
        }
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

        const targetRequestOptions = this.withAutoTranslationCandidateIdentity(
            this.getAutoTranslationRequestOptionsForText(text, requestOptions),
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
        // A translation the user asked for owns the message until it settles: no cached draw, no request.
        if (this.plugin.isManualTranslationInFlight(target.content, this.plugin.getAutoTranslationTargetDomText(target))) {
            return {
                action: "skip",
                status: "skipped",
                state: DIAGNOSTIC_MESSAGE_STATES.SKIPPED,
                reasonCode: DIAGNOSTIC_REASON_CODES.MANUAL_LINE_PRESENT,
                cacheKey,
                requestOptions: targetRequestOptions,
                counts: { eligible: 1, skippedCurrent: 1 }
            };
        }

        const cacheAliases = this.plugin.getTranslationCacheAliases(text, targetRequestOptions);
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

        // Work for this message may run under its key naming the local model known when it was queued.
        const activeKey = this.plugin.resolveActiveAutoTranslationKey(cacheKey);
        const workKey = activeKey || cacheKey;
        const hasPendingTargets = this.stateMachine.pendingTargets.has(workKey);
        const hasActiveKey = Boolean(activeKey);
        const hasInFlightKey = this.stateMachine.inFlightKeys.has(workKey);
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
            const pendingTarget = { ...targetWithOptions, cacheKey: workKey };
            return {
                action: "block",
                status: "dedupe-active",
                state: hasInFlightKey ? DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT : this.plugin.getAutoTranslationQueuedDiagnosticState(pendingTarget),
                reasonCode: DIAGNOSTIC_REASON_CODES.DEDUPE_ACTIVE,
                cacheKey: workKey,
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
        if (!scanBudgetReached && scanState.checkLocalProviderHealth) {
            scanState.checkLocalProviderHealth = false;
            if (this.plugin.shouldBlockAutoTranslationForLocalProviderHealth(requestOptions)) {
                scanState.localProviderHealthBlocked = true;
                scanState.apiWorkBlocked = true;
                scanState.blockReason = "local-provider-health";
                this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getLocalProviderHealthRetryMs(requestOptions, now), { minDelayMs: LOCAL_PROVIDER_HEALTH_RETRY_MS });
            }
        }
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
            this.applyAutoTranslationDecision(candidate, nextDecision, scanStats);
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
            this.applyAutoTranslationDecision(candidate, nextDecision, scanStats);
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
            const deferEnqueueSort = Boolean(decision.scanState?.deferEnqueueSort);
            if (this.plugin.enqueueAutoTranslationItem(item, deferEnqueueSort ? { deferSort: true, skipPrune: true } : undefined)) {
                decision.scanState.queued = Number(decision.scanState.queued || 0) + 1;
                scanStats.enqueued = Number(scanStats.enqueued || 0) + 1;
                if (deferEnqueueSort) decision.scanState.enqueueSortPending = true;
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
            if (this.stateMachine.queuedKeys.has(decision.cacheKey)) {
                if (this.stateMachine.queue.some(queued => queued?.cacheKey === decision.cacheKey)) this.plugin.promoteQueuedAutoTranslationItem(decision.cacheKey, item);
                else this.stateMachine.queuedKeys.delete(decision.cacheKey);
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
        const visibleLongInFlight = this.getVisibleLongAutoTranslationInFlightCount();
        if (!visibleLongInFlight) return false;
        const longTextSlots = 1;
        if (visibleLongInFlight < longTextSlots) return false;
        if (Number(item?.daitLongTextDeferrals || 0) >= AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX) return false;
        return this.plugin.hasReadyShortAutoTranslationCandidate(item, options);
    }

    hasVisibleLongAutoTranslationInFlight() {
        return this.getVisibleLongAutoTranslationInFlightCount() > 0;
    }

    getVisibleLongAutoTranslationInFlightCount() {
        let count = 0;
        for (const key of [...(this.stateMachine.visibleLongInFlightKeys || [])]) {
            if (this.stateMachine.inFlightKeys.has(key)) {
                count++;
                continue;
            }
            this.stateMachine.visibleLongInFlightKeys.delete(key);
        }
        return count;
    }

    hasReadyVisibleLongAutoTranslationCandidate(referenceItem, options = {}) {
        if ((options.visibility || "") !== "visible") return false;
        const now = Date.now();
        for (const queued of this.stateMachine.queue) {
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
        const queue = this.takeAutoTranslationFallbackQueue(pending, taskOptions);
        if (queue.length) this.plugin.logDiagnostic("auto.fallback", "start", { count: queue.length, pending: pending.size });
        for (const item of queue) {
            if (!item) continue;
            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                continue;
            }
            if (this.plugin.isAutoTranslationProviderCoolingDown(item.requestOptions)) {
                this.requeueRemainingAutoTranslationFallbackItems(pending, taskOptions);
                return;
            }
            taskOptions?.heartbeat?.(pending);

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
                taskOptions?.releaseBatchItem?.(item);
                this.plugin.markAutoTranslationFailureSafely(item, error);
                pending.delete(item);
                if (this.plugin.isAutoTranslationProviderCoolingDown(item.requestOptions)) {
                    this.requeueRemainingAutoTranslationFallbackItems(pending, taskOptions);
                    return;
                }
                continue;
            }

            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                continue;
            }
            if (this.plugin.renderAutoTranslationResultSafely(item, translated)) {
                taskOptions?.markRendered?.(item);
            }
            this.plugin.logDiagnostic("auto.fallback", "success", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.VALIDATING, DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED),
                key: this.plugin.getTextFingerprint(item.cacheKey),
                sourceHash: this.plugin.getStrongTextFingerprint(item.text)
            });
            pending.delete(item);
        }
    }

    requeueRemainingAutoTranslationFallbackItems(pending, taskOptions = {}) {
        pending.forEach(item => {
            if (!this.plugin.isAutoTranslationWorkCurrent(item)) {
                pending.delete(item);
                return;
            }
            item.daitSingleRequest = true;
            taskOptions?.releaseBatchItem?.(item);
            this.plugin.requeueAutoTranslationItem(item, { allowActiveRequeue: true });
            pending.delete(item);
        });
    }

    takeAutoTranslationFallbackQueue(pending, taskOptions = {}) {
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
            item.daitSingleRequest = true;
            taskOptions?.releaseBatchItem?.(item);
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
                const { translated, invalidReason } = this.validateAutoTranslationBatchRow(item, translations[index]);
                if (invalidReason) {
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
                if (this.plugin.renderAutoTranslationResultSafely(item, translated)) {
                taskOptions?.markRendered?.(item);
            }
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
                if (this.shouldFallbackAutoTranslationBatchRequestError(error)) {
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
        if (["cancelled", "auth", "quota", "rate-limit", "server", "local-unavailable"].includes(type)) return false;
        const status = Number(error?.status || 0);
        if (status === 404 || status === 405 || error?.providerModelNotFound) return false;
        const code = String(error?.code || "");
        if (["INVALID_API_ENDPOINT", "UNSAFE_API_ENDPOINT", "API_KEY_ORIGIN_MISMATCH", "API_REDIRECT_BLOCKED"].includes(code)) return false;
        return true;
    }

    buildPromptPolicyAutoTranslationPrompt(options = this.getAutoTranslationOptions()) {
        return this.plugin.buildPromptPolicyPrompt("auto", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            basePrompt: options?.configOverrides?.prompt || this.plugin.settings.translation.prompt
        });
    }

    buildCompactLocalAutoTranslationPrompt(options = this.getAutoTranslationOptions(), variant = "auto") {
        const targetLanguage = this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options));
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

    buildLocalAutoTranslationUserMessage(input, _config, _options = {}) {
        return String(input ?? "");
    }

    isLocalAutoTranslationOptions(options = this.getAutoTranslationOptions()) {
        return this.plugin.isLocalTranslationProvider(this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides));
    }

    buildPromptPolicyLongTextPrompt(options = this.getAutoTranslationOptions()) {
        return this.plugin.buildPromptPolicyPrompt("longText", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            basePrompt: options?.configOverrides?.prompt || this.plugin.settings.translation.prompt
        });
    }

    getAutoTranslationRequestOptionsForText(text, options = this.getAutoTranslationOptions()) {
        if (!this.isLongAutoTranslationText(text)) return options;
        return this.getLongTextTranslationOptions(options, text);
    }

    getLongTextTranslationOptions(options = this.getAutoTranslationOptions(), text = "") {
        const requestSnapshot = this.getAutoTranslationRequestSnapshot(options);
        const isLocalProvider = this.plugin.isLocalTranslationProvider(requestSnapshot);
        const baseMaxTokens = this.plugin.normalizeRequestNumber(
            requestSnapshot.maxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const sourceLength = String(text || "").length;
        const dynamicMaxTokens = this.getLongTextMaxTokensForLength(sourceLength, this.getAutoTranslationTargetLanguage(options));
        const maxTokens = isLocalProvider
            ? this.plugin.getLocalAutoTranslationMaxTokensForLength(sourceLength, this.getAutoTranslationTargetLanguage(options), baseMaxTokens)
            : Math.max(baseMaxTokens, AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS, dynamicMaxTokens);
        const configOverrides = {
            ...requestSnapshot,
            sourceLanguage: AUTO_LANGUAGE_VALUE,
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            temperature: 0,
            maxTokens,
            enableThinking: false,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("longText"),
            localCompactPrompt: isLocalProvider,
            prompt: isLocalProvider
                ? this.buildCompactLocalAutoTranslationPrompt(options, "longText")
                : this.buildPromptPolicyLongTextPrompt(options)
        };
        const requestOrigin = options?.requestOrigin
            || (/^manual(?:-|$)/.test(String(options?.mode || ""))
                ? "manual"
                : (/^public-bilingual(?:-|$)/.test(String(options?.mode || "")) ? "public-bilingual" : ""));
        return {
            ...options,
            ...(requestOrigin ? { requestOrigin } : {}),
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

    getLongAutoTranslationChunkLength(options = this.getAutoTranslationOptions()) {
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

        const units = this.getLongAutoTranslationChunkUnits(source);
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
                    if (this.isAutoTranslationCodeOnlyText(value)) {
                        const codeChunk = value.trim();
                        if (codeChunk) chunks.push(codeChunk);
                        continue;
                    }
                    this.splitOversizedLongAutoTranslationUnit(value, limit).forEach(part => {
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
                else if (end > cursor + 1 && end < source.length) {
                    const prevCode = source.charCodeAt(end - 1);
                    const nextCode = source.charCodeAt(end);
                    if (prevCode >= 0xd800 && prevCode <= 0xdbff && nextCode >= 0xdc00 && nextCode <= 0xdfff) end--;
                }
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
        let inFence = null;
        let structuredMode = "";
        const flush = () => {
            if (current.trim()) units.push(current);
            current = "";
            structuredMode = "";
        };
        const getMode = line => {
            if (/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+|>\s+|#{1,6}\s+|\|)/.test(line)) return "structured";
            if (/^\s*$/.test(line)) return "blank";
            return "paragraph";
        };

        for (const line of lines) {
            if (!inFence) {
                const fenceOpen = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
                if (fenceOpen) {
                    const marker = fenceOpen[1];
                    const rest = String(fenceOpen[2] || "");
                    flush();
                    current += line;
                    const singleLineClosed = new RegExp(`${marker[0]}{${marker.length},}\\s*$`).test(rest);
                    if (singleLineClosed) flush();
                    else inFence = { char: marker[0], length: marker.length };
                    continue;
                }
            }
            else {
                current += line;
                const fenceClose = new RegExp(`^\\s{0,3}${inFence.char}{${inFence.length},}\\s*$`);
                if (fenceClose.test(line)) {
                    inFence = null;
                    flush();
                }
                continue;
            }
            const mode = getMode(line);
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
                else if (end > cursor + 1 && end < source.length) {
                    const prevCode = source.charCodeAt(end - 1);
                    const nextCode = source.charCodeAt(end);
                    if (prevCode >= 0xd800 && prevCode <= 0xdbff && nextCode >= 0xdc00 && nextCode <= 0xdfff) end--;
                }
            }
            const chunk = source.slice(cursor, end).trim();
            if (chunk) parts.push(chunk);
            cursor = end;
            while (cursor < source.length && /\s/.test(source[cursor])) cursor++;
        }
        return parts.length ? parts : [source];
    }

    async runLongAutoTranslationTask(text, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        const longOptions = options?.mode === "long-text" ? options : this.getLongTextTranslationOptions(options, text);
        // The partial result is reported on this call's taskOptions (longTextPartialInfo), never by
        // writing to the request options, which are shared with the queued item and its retries.
        delete taskOptions.longTextPartial;
        delete taskOptions.longTextFailedChunks;
        delete taskOptions.longTextSuccessfulChunks;
        delete taskOptions.longTextPartialInfo;
        const chunks = this.plugin.splitLongAutoTranslationText(text, this.getLongAutoTranslationChunkLength(longOptions));
        if (chunks.length <= 1) return this.plugin.runAutoTranslationTaskWithOptions(text, longOptions, taskOptions);

        const translatedChunks = [];
        const chunkFailures = [];
        const sourceHash = this.plugin.getStrongTextFingerprint(text);
        let budgetError = null;
        let stopError = null;
        let consecutiveReservedStopFailures = 0;
        let translatedProseChunks = 0;
        const hasFinishedChunk = () => translatedProseChunks > 0;
        // When a chunk's fallback chain was cut short solely by later-chunk budget reservations
        // (rather than exhausting all providers), allow a single transient failure
        // (server/timeout/network) to probe the next reserved chunk instead of discarding the
        // reserved slots. Keep hard account/rate-limit failures fatal, stop on a second
        // consecutive failure so a truly down primary is not hammered across every remaining
        // chunk, and preserve any already-translated chunks as a partial result when stopping.
        const isTransientReservedStopError = chunkError => {
            const type = this.plugin.getAutoTranslationFailureType(chunkError);
            return ["server", "timeout", "network"].includes(type);
        };
        const canContinueAfterReservedFallbackStop = chunkError => {
            if (!chunkError?.fallbackBudgetReserved) return false;
            if (!isTransientReservedStopError(chunkError)) return false;
            return consecutiveReservedStopFailures === 0;
        };
        // The provider itself is failing (rate limit, auth, quota, server, timeout...): the remaining
        // chunks would fail too, so no more are sent. A timeout or network error after some chunks
        // succeeded keeps those as a partial result; otherwise the whole message fails now.
        const stopOnChunkError = chunkError => {
            if (!this.shouldStopLongAutoTranslationOnChunkError(chunkError)) return false;
            if (canContinueAfterReservedFallbackStop(chunkError)) {
                consecutiveReservedStopFailures++;
                return false;
            }
            const keepAfterBudgetCappedTransient = isTransientReservedStopError(chunkError)
                && Boolean(chunkError?.fallbackBudgetReserved || chunkError?.fallbackBudgetExhausted || consecutiveReservedStopFailures > 0);
            if ((!this.shouldKeepLongAutoTranslationChunksOnError(chunkError) && !keepAfterBudgetCappedTransient) || !hasFinishedChunk()) {
                throw chunkError;
            }
            stopError = chunkError;
            return true;
        };
        const parentRequestContext = longOptions?.requestContext && typeof longOptions.requestContext === "object"
            ? longOptions.requestContext
            : null;
        const isManualLongTask = Boolean(
            taskOptions?.manualRescue
            || longOptions?.requestOrigin === "manual"
            || options?.requestOrigin === "manual"
            || /^manual(?:-|$)/.test(String(options?.mode || longOptions?.mode || ""))
        );
        for (let index = 0; index < chunks.length; index++) {
            if (taskOptions?.signal?.aborted || (typeof taskOptions.heartbeat === "function" && taskOptions.heartbeat() === false)) {
                throw isManualLongTask
                    ? this._createCancelledError()
                    : this.createAutoTranslationStaleError("long-text-stale-before-chunk");
            }
            if (this.isAutoTranslationCodeOnlyText(chunks[index]) || this.isAutoTranslationTokenOnlyText(chunks[index])) {
                translatedChunks.push(String(chunks[index] || "").trim());
                continue;
            }
            const chunkOptions = this.getLongTextChunkTranslationOptions(longOptions, chunks[index], index, chunks.length, sourceHash);
            const requestBudget = taskOptions.requestBudget;
            const remainingLaterChunks = chunks.length - index - 1;
            const previousReserved = requestBudget ? Math.max(0, Number(requestBudget.reserved || 0)) : 0;
            let translated = "";
            try {
                if (requestBudget) {
                    // Hold back one request for each remaining chunk across this chunk's entire
                    // initial attempt (including provider fallbacks and strict retries), while still
                    // permitting this chunk's own primary request whenever any budget remains.
                    const remainingTotal = Math.max(0, Number(requestBudget.limit || 0) - Number(requestBudget.used || 0));
                    const initialReserved = Math.min(remainingLaterChunks, Math.max(0, remainingTotal - 1));
                    requestBudget.reserved = Math.max(previousReserved, initialReserved);
                }
                const attemptContext = parentRequestContext ? {} : null;
                const initialChunkOptions = attemptContext ? { ...chunkOptions, requestContext: attemptContext } : chunkOptions;
                try {
                    translated = await this.plugin.runAutoTranslationTaskWithOptions(chunks[index], initialChunkOptions, taskOptions);
                    if (parentRequestContext
                        && attemptContext?.fallbackProvider
                        && !parentRequestContext.fallbackProvider
                        && String(translated || "").trim()
                        && !this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(translated)) {
                        parentRequestContext.fallbackProvider = attemptContext.fallbackProvider;
                    }
                }
                finally {
                    if (requestBudget) requestBudget.reserved = previousReserved;
                }
            }
            catch (error) {
                if (this.isAbandonedTranslationError(error)) throw error;
                stopOnChunkError(error);
                if (this.isAutoTranslationRequestBudgetError(error) && !error.requestBudgetReserved) budgetError = error;
                let rescued = null;
                if (taskOptions?.manualRescue && !budgetError && !stopError) {
                    // The rescue may not spend the requests the later chunks need: one each is held back.
                    if (requestBudget) requestBudget.reserved = Math.max(previousReserved, remainingLaterChunks);
                    try {
                        rescued = await this.plugin.runLongAutoTranslationChunkManualRescue(chunks[index], chunkOptions, error, taskOptions, {
                            sourceHash,
                            chunkIndex: index,
                            chunkTotal: chunks.length
                        });
                    }
                    catch (rescueError) {
                        if (this.isAbandonedTranslationError(rescueError)) throw rescueError;
                        stopOnChunkError(rescueError);
                        if (this.isAutoTranslationRequestBudgetError(rescueError) && !rescueError.requestBudgetReserved) budgetError = rescueError;
                        rescued = { translated: "", error };
                    }
                    finally {
                        if (requestBudget) requestBudget.reserved = previousReserved;
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
            if (taskOptions?.signal?.aborted || (typeof taskOptions.heartbeat === "function" && taskOptions.heartbeat() === false)) {
                throw isManualLongTask
                    ? this._createCancelledError()
                    : this.createAutoTranslationStaleError("long-text-stale-after-chunk");
            }
            const trimmedTranslated = String(translated || "").trim();
            if (trimmedTranslated && !this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(trimmedTranslated)) {
                consecutiveReservedStopFailures = 0;
                translatedProseChunks++;
            }
            translatedChunks.push(trimmedTranslated);
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
        if (!successfulChunks.length || (translatedProseChunks === 0 && chunkFailures.length)) {
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
        if (!merged) throw this.createFinalInvalidAutoTranslationError("empty-long-merge");
        const targetLanguage = this.getAutoTranslationTargetLanguage(longOptions);
        const validationOptions = {
            mergedLongText: true,
            partialLongText: chunkFailures.length > 0
        };
        const validation = this.plugin.getAutoTranslationOutputValidationResult(text, merged, targetLanguage, validationOptions, {
            ...longOptions,
            longTextPartial: chunkFailures.length > 0
        });
        const invalidReason = validation.reasonCode || "";
        if (!validation.renderable
            && invalidReason
            && !chunkFailures.length
            && !this.isMergedLongAutoTranslationAcceptable(text, merged, targetLanguage)) {
            throw this.createFinalInvalidAutoTranslationError(invalidReason);
        }
        return merged;
    }

    async runLongAutoTranslationChunkManualRescue(chunkText, chunkOptions, firstError, taskOptions = {}, meta = {}) {
        if (!this.plugin.isManualRescueRetryableError(firstError)) return null;
        const parentRequestContext = chunkOptions?.requestContext && typeof chunkOptions.requestContext === "object"
            ? chunkOptions.requestContext
            : null;
        const attempts = [
            { name: "chunk-force-target", options: this.plugin.getAutoTranslationRetryOptions(chunkText, "", chunkOptions) },
            { name: "chunk-repair", options: this.getAutoTranslationFinalFallbackOptions(chunkText, chunkOptions) }
        ];
        let lastError = firstError;
        let truncatedError = firstError?.modelOutputTruncated ? firstError : null;
        for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
            if (taskOptions?.signal?.aborted || (typeof taskOptions?.heartbeat === "function" && taskOptions.heartbeat() === false)) {
                throw this._createCancelledError();
            }
            const attempt = attempts[attemptIndex];
            const attemptContext = parentRequestContext ? {} : null;
            let attemptOptions = attemptContext ? { ...attempt.options, requestContext: attemptContext } : attempt.options;
            const effectiveTruncatedError = lastError?.modelOutputTruncated ? lastError : truncatedError;
            if (effectiveTruncatedError) {
                attemptOptions = this.buildTruncationRetryOptions(attemptOptions, chunkOptions, chunkText, attemptIndex === 0 ? 1.8 : 2.2, effectiveTruncatedError);
            }
            else if (attemptIndex === attempts.length - 1) {
                attemptOptions = { ...attemptOptions, allowTruncationFallback: true };
            }
            try {
                const translated = await this.plugin.runAutoTranslationTaskWithOptions(chunkText, attemptOptions, {
                    ...taskOptions,
                    retryInvalidOutput: false,
                    manualRescue: false
                });
                const validation = this.plugin.getAutoTranslationOutputValidationResult(
                    chunkText,
                    translated,
                    this.getAutoTranslationTargetLanguage(attemptOptions),
                    this.getAutoTranslationOutputValidationOptions(chunkText, translated, attemptOptions),
                    attemptOptions
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
                if (validation.renderable) {
                    if (parentRequestContext && attemptContext?.fallbackProvider && !parentRequestContext.fallbackProvider) {
                        parentRequestContext.fallbackProvider = attemptContext.fallbackProvider;
                    }
                    return { translated, validation, attemptName: attempt.name };
                }
                lastError = this.createFinalInvalidAutoTranslationError(validation.reasonCode || "invalid-output", {
                    terminal: false,
                    validationQuality: validation.quality
                });
            }
            catch (error) {
                if (this.isAbandonedTranslationError(error)) throw error;
                lastError = error;
                if (error?.modelOutputTruncated) truncatedError = error;
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
        if (taskOptions?.signal?.aborted || (typeof taskOptions?.heartbeat === "function" && taskOptions.heartbeat() === false)) {
            throw this._createCancelledError();
        }
        const subchunkRescue = await this.runLongAutoTranslationSubchunkManualRescue(chunkText, chunkOptions, taskOptions, meta);
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

        const parentRequestContext = chunkOptions?.requestContext && typeof chunkOptions.requestContext === "object"
            ? chunkOptions.requestContext
            : null;
        const translatedParts = [];
        const failures = [];
        for (let index = 0; index < parts.length; index++) {
            if (taskOptions?.signal?.aborted || (typeof taskOptions?.heartbeat === "function" && taskOptions.heartbeat() === false)) {
                throw this._createCancelledError();
            }
            const part = parts[index];
            const partOptions = this.getLongTextChunkTranslationOptions(chunkOptions, part, index, parts.length, meta.sourceHash || this.plugin.getStrongTextFingerprint(text));
            const partContext = parentRequestContext ? {} : null;
            const effectivePartOptions = partContext ? { ...partOptions, requestContext: partContext } : partOptions;
            try {
                const translated = await this.plugin.runAutoTranslationTaskWithOptions(part, effectivePartOptions, {
                    ...taskOptions,
                    retryInvalidOutput: false,
                    manualRescue: false,
                    subchunkRescueDepth: Number(taskOptions?.subchunkRescueDepth || 0) + 1
                });
                const validation = this.plugin.getAutoTranslationOutputValidationResult(
                    part,
                    translated,
                    this.getAutoTranslationTargetLanguage(effectivePartOptions),
                    this.getAutoTranslationOutputValidationOptions(part, translated, effectivePartOptions),
                    effectivePartOptions
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
                if (validation.renderable) {
                    if (parentRequestContext && partContext?.fallbackProvider && !parentRequestContext.fallbackProvider) {
                        parentRequestContext.fallbackProvider = partContext.fallbackProvider;
                    }
                    translatedParts.push(String(translated || "").trim());
                }
                else failures.push({ index, reason: validation.reasonCode || "invalid-output" });
            }
            catch (error) {
                if (this.isAbandonedTranslationError(error)) throw error;
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
            : this.getLongTextTranslationOptions(options, chunkText);
        const isLocalProvider = this.isLocalAutoTranslationOptions(baseOptions);
        const baseMaxTokens = this.plugin.normalizeRequestNumber(
            baseOptions.longTextBaseMaxTokens ?? this.plugin.settings.translation.maxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const dynamicMaxTokens = this.getLongTextMaxTokensForLength(chunkLength, this.getAutoTranslationTargetLanguage(baseOptions));
        const chunkPrompt = isLocalProvider
            ? this.buildCompactLocalAutoTranslationPrompt(baseOptions, "chunk")
            : this.plugin.joinPromptPolicyLines([
                baseOptions.configOverrides?.prompt || this.buildPromptPolicyLongTextPrompt(options),
                "",
                `Chunk ${index + 1}/${total}; source hash ${sourceHash || this.plugin.getStrongTextFingerprint(chunkText)}.`,
                "Translate only this chunk. Do not summarize, skip, merge with other chunks, or output the chunk label."
            ]);
        const configOverrides = {
            ...baseOptions.configOverrides,
            maxTokens: isLocalProvider
                ? this.plugin.getLocalAutoTranslationMaxTokensForLength(chunkLength, this.getAutoTranslationTargetLanguage(baseOptions), baseMaxTokens)
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

    async runAutoTranslationModelAttempt(text, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        const timeoutMs = this.getAutoTranslationRequestTimeoutMs(options, text);
        const isCurrent = () => this.isAutoTranslationAttemptCurrent(options, taskOptions);
        const requestOrigin = options?.requestOrigin
            || (taskOptions?.manualRescue || /^manual(?:-|$)/.test(String(options?.mode || ""))
                ? "manual"
                : (/^public-bilingual(?:-|$)/.test(String(options?.mode || "")) ? "public-bilingual" : ""));
        if (!isCurrent()) {
            if (requestOrigin === "manual") {
                throw this._createCancelledError();
            }
            throw this.createAutoTranslationStaleError("model-attempt-stale");
        }
        const signal = taskOptions?.signal || options?.signal || null;
        const allowProviderFallback = taskOptions?.allowProviderFallback === false || options?.allowProviderFallback === false
            ? false
            : undefined;
        const allowTruncationFallback = Boolean(taskOptions?.allowTruncationFallback || options?.allowTruncationFallback);
        const translated = await this.plugin.runModelTask("translation", text, {
            configOverrides: options.configOverrides,
            timeoutMs,
            mode: options.mode || "auto",
            ...(requestOrigin ? { requestOrigin } : {}),
            requestContext: options.requestContext,
            isCurrent,
            longTextChunk: Boolean(options.longTextChunk),
            longTextSourceLength: Number(options.longTextSourceLength || String(text || "").length) || 0,
            ...(options.truncationRetry || taskOptions?.truncationRetry ? { truncationRetry: true } : {}),
            ...(allowTruncationFallback ? { allowTruncationFallback: true } : {}),
            ...(allowProviderFallback === false ? { allowProviderFallback: false } : {}),
            ...(signal ? { signal } : {}),
            ...(taskOptions?.requestBudget ? { requestBudget: taskOptions.requestBudget } : {})
        });
        return this.plugin.sanitizeAutoTranslationOutput(text, translated, this.getAutoTranslationTargetLanguage(options), this.getAutoTranslationOutputValidationOptions(text, translated, options));
    }

    shouldSkipQuotedAutoTranslationCandidates(sourceText, translatedText, options = {}) {
        if (options?.mergedLongText || options?.partialLongText) return true;
        const sourceLength = String(sourceText || "").trim().length;
        const outputLength = String(translatedText || "").trim().length;
        return Math.max(sourceLength, outputLength) >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH || outputLength >= 160;
    }

    getAutoTranslationOutputValidationOptions(text, translated, requestOptions = this.getAutoTranslationOptions()) {
        const isMergedLongText = requestOptions?.longTextMerged === true
            || (requestOptions?.mode === "long-text"
                && requestOptions?.longTextChunkIndex === undefined
                && Math.max(String(text || "").length, Number(requestOptions?.longTextSourceLength || 0) || 0) >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH);
        return {
            mergedLongText: isMergedLongText || Boolean(requestOptions?.longTextChunk),
            partialLongText: Boolean(requestOptions?.longTextPartial) || this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(translated)
        };
    }

    validateAutoTranslationBatchRow(item, output) {
        const { text, requestOptions } = item;
        const targetLanguage = this.getAutoTranslationTargetLanguage(requestOptions);
        const outputOptions = this.getAutoTranslationOutputValidationOptions(text, output, requestOptions);
        const translated = this.plugin.sanitizeAutoTranslationOutput(text, output, targetLanguage, outputOptions);
        if (!translated) return { translated, invalidReason: "empty" };
        const validationOptions = this.getAutoTranslationOutputValidationOptions(text, translated, requestOptions);
        const validation = this.plugin.getAutoTranslationOutputValidationResult(text, translated, targetLanguage, validationOptions, requestOptions);
        return { translated, invalidReason: validation.renderable ? "" : (validation.reasonCode || "invalid-output") };
    }

    getAutoTranslationValidationPolicy(requestOptions = this.getAutoTranslationOptions()) {
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        if (this.plugin.isDirectTranslateProvider(config)) return "trust-provider";
        if (this.plugin.isLocalTranslationProvider(config)) return "best-effort";
        return "normal";
    }

    getAutoTranslationOutputValidationResult(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}, requestOptions = this.getAutoTranslationOptions()) {
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

        const policy = this.getAutoTranslationValidationPolicy(requestOptions);
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
        if (this.isHardInvalidAutoTranslationReason(invalidReason) || sameAsSource) {
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
            && !this.isHardInvalidAutoTranslationReason(invalidReason)
            && !sameAsSource
            && this.isRenderableBestEffortAutoTranslation(source, output, targetLanguage, {
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

        if (policy === "best-effort" && this.isRenderableBestEffortAutoTranslation(source, output, targetLanguage, {
            invalidReason,
            targetScript,
            targetLetters,
            outputLetters,
            sourceLetters,
            sourceTargetLetters,
            targetLanguageRatio
        })) {
            const quality = this.getBestEffortAutoTranslationQuality(invalidReason, {
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

        if (policy === "normal" && this.isUsableResidualAutoTranslation(source, output, targetLanguage, {
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

    getRaisedAutoTranslationMaxTokens(options = this.getAutoTranslationOptions(), text = "", multiplier = 1.6, truncatedError = null) {
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        const current = this.plugin.normalizeRequestNumber(config.maxTokens, DEFAULT_SETTINGS.translation.maxTokens, { min: 1, integer: true });
        const sourceLength = Math.max(String(text || "").length, Number(options?.longTextSourceLength || 0) || 0);
        const dynamic = this.getLongTextMaxTokensForLength(sourceLength, this.getAutoTranslationTargetLanguage(options));
        const rawTarget = Math.ceil(Math.max(current, dynamic, 256) * Math.max(1, Number(multiplier) || 1));
        const cap = this.plugin.isLocalTranslationProvider(config) ? Math.max(2400, current + 256) : Math.max(6000, current + 256);
        const target = truncatedError && Number(truncatedError.partialOutputLength || 0) === 0
            ? Math.max(rawTarget, Math.min(cap, 4096))
            : rawTarget;
        return Math.max(current + 128, Math.min(cap, target));
    }

    withRaisedAutoTranslationMaxTokens(options = this.getAutoTranslationOptions(), text = "", multiplier = 1.6, truncatedError = null) {
        return {
            ...options,
            configOverrides: {
                ...options.configOverrides,
                maxTokens: this.getRaisedAutoTranslationMaxTokens(options, text, multiplier, truncatedError)
            }
        };
    }

    buildTruncationRetryOptions(targetOptions, baseOptions, text = "", multiplier = 1.8, truncatedError = null) {
        const raised = {
            ...this.withRaisedAutoTranslationMaxTokens(targetOptions, text, multiplier, truncatedError),
            truncationRetry: true
        };
        raised.requestTimeoutMs = this.getTruncatedAutoTranslationRetryTimeoutMs(baseOptions || targetOptions, raised, text);
        return raised;
    }

    rethrowTruncationRetryTimeout(error, truncatedError) {
        if (truncatedError && !this.isAbandonedTranslationError(error) && this.plugin.isTimeoutError(error)) {
            truncatedError.truncationRetryTimedOut = true;
            throw truncatedError;
        }
        throw error;
    }

    async runAutoTranslationTask(text, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        if (this.isLongAutoTranslationText(text) && taskOptions.longTextStrategy !== false) {
            return this.runLongAutoTranslationTask(text, options, taskOptions);
        }
        return this.plugin.runAutoTranslationTaskWithOptions(text, options, taskOptions);
    }

    async runAutoTranslationTaskWithOptions(text, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        let translated = "";
        let firstInvalidReason = "";
        let firstValidation = null;
        let lastTruncatedError = null;
        try {
            this.consumeAutoTranslationRequestBudget(taskOptions);
            translated = await this.plugin.runAutoTranslationModelAttempt(text, options, taskOptions);
            const firstValidationOptions = this.getAutoTranslationOutputValidationOptions(text, translated, options);
            firstValidation = this.plugin.getAutoTranslationOutputValidationResult(text, translated, this.getAutoTranslationTargetLanguage(options), firstValidationOptions, options);
            firstInvalidReason = firstValidation.reasonCode || "";
        }
        catch (error) {
            if (!error?.modelOutputTruncated || taskOptions.retryInvalidOutput === false) throw error;
            if (!this.isAutoTranslationStrictRetryEnabled()) return this.runTruncatedAutoTranslationRetry(text, options, taskOptions, error);
            firstInvalidReason = "truncated";
            lastTruncatedError = error;
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
        if (this.shouldRunLocalAutoTranslationRepairRetry(firstInvalidReason, text, translated, options, taskOptions)) {
            let repairOptions = this.getAutoTranslationFinalFallbackOptions(text, options);
            if (firstInvalidReason === "truncated") repairOptions = this.buildTruncationRetryOptions(repairOptions, options, text, 1.8, lastTruncatedError);
            this.consumeAutoTranslationRequestBudget(taskOptions);
            let repaired = "";
            try {
                repaired = await this.plugin.runAutoTranslationModelAttempt(text, repairOptions, taskOptions);
            }
            catch (error) {
                this.rethrowTruncationRetryTimeout(error, lastTruncatedError);
            }
            const repairValidationOptions = this.getAutoTranslationOutputValidationOptions(text, repaired, repairOptions);
            const repairValidation = this.plugin.getAutoTranslationOutputValidationResult(text, repaired, this.getAutoTranslationTargetLanguage(repairOptions), repairValidationOptions, repairOptions);
            const repairInvalidReason = repairValidation.reasonCode || "";
            if (repairValidation.renderable) return repaired;
            throw this.createFinalInvalidAutoTranslationError(repairInvalidReason);
        }
        if (taskOptions.retryInvalidOutput === false || !this.isAutoTranslationStrictRetryEnabled()) throw this.createFinalInvalidAutoTranslationError(firstInvalidReason);

        let retryOptions = this.plugin.getAutoTranslationRetryOptions(text, translated, options);
        if (firstInvalidReason === "truncated") retryOptions = this.buildTruncationRetryOptions(retryOptions, options, text, 1.8, lastTruncatedError);
        let retried = "";
        let retryInvalidReason = "";
        try {
            this.consumeAutoTranslationRequestBudget(taskOptions);
            retried = await this.plugin.runAutoTranslationModelAttempt(text, retryOptions, taskOptions);
            const retryValidationOptions = this.getAutoTranslationOutputValidationOptions(text, retried, retryOptions);
            const retryValidation = this.plugin.getAutoTranslationOutputValidationResult(text, retried, this.getAutoTranslationTargetLanguage(retryOptions), retryValidationOptions, retryOptions);
            retryInvalidReason = retryValidation.reasonCode || "";
            if (retryValidation.renderable) return retried;
        }
        catch (error) {
            if (!error?.modelOutputTruncated) {
                this.rethrowTruncationRetryTimeout(error, lastTruncatedError);
            }
            retryInvalidReason = "truncated";
            lastTruncatedError = error;
        }

        let lastChanceOptions = this.getAutoTranslationFinalFallbackOptions(text, options);
        if (retryInvalidReason === "truncated" || firstInvalidReason === "truncated") {
            lastChanceOptions = this.buildTruncationRetryOptions(lastChanceOptions, options, text, 2.2, lastTruncatedError);
        }
        this.consumeAutoTranslationRequestBudget(taskOptions);
        let finalText = "";
        try {
            finalText = await this.plugin.runAutoTranslationModelAttempt(text, lastChanceOptions, taskOptions);
        }
        catch (error) {
            this.rethrowTruncationRetryTimeout(error, lastTruncatedError);
        }
        const finalValidationOptions = this.getAutoTranslationOutputValidationOptions(text, finalText, lastChanceOptions);
        const finalValidation = this.plugin.getAutoTranslationOutputValidationResult(text, finalText, this.getAutoTranslationTargetLanguage(lastChanceOptions), finalValidationOptions, lastChanceOptions);
        const finalInvalidReason = finalValidation.reasonCode || "";
        if (finalValidation.renderable) return finalText;

        throw this.createFinalInvalidAutoTranslationError(finalInvalidReason);
    }

    // With strict retry off, a cut-off output still gets one retry with a larger max_tokens. If
    // that is cut off too, its truncation error ends the task and the failure layer backs off.
    // The retry may generate more tokens, so its timeout grows with max_tokens (bounded). A
    // looping model that is still too slow for it ends as the first truncation, never as a
    // timeout that would mark a healthy local service unavailable.
    async runTruncatedAutoTranslationRetry(text, options = this.getAutoTranslationOptions(), taskOptions = {}, truncatedError = null) {
        const raisedOptions = this.buildTruncationRetryOptions(options, options, text, 1.8, truncatedError);
        this.plugin.logDiagnostic("auto.truncated", "retry", {
            sourceHash: this.plugin.getStrongTextFingerprint(text),
            mode: options?.mode || "auto",
            maxTokens: Number(raisedOptions?.configOverrides?.maxTokens || 0),
            timeoutMs: raisedOptions.requestTimeoutMs
        });
        this.consumeAutoTranslationRequestBudget(taskOptions);
        let retried = "";
        try {
            retried = await this.plugin.runAutoTranslationModelAttempt(text, raisedOptions, taskOptions);
        }
        catch (error) {
            if (truncatedError && !this.isAbandonedTranslationError(error) && this.plugin.isTimeoutError(error)) {
                truncatedError.truncationRetryTimedOut = true;
                throw truncatedError;
            }
            throw error;
        }
        const validation = this.plugin.getAutoTranslationOutputValidationResult(
            text,
            retried,
            this.getAutoTranslationTargetLanguage(raisedOptions),
            this.getAutoTranslationOutputValidationOptions(text, retried, raisedOptions),
            raisedOptions
        );
        if (validation.renderable) return retried;
        throw this.createFinalInvalidAutoTranslationError(validation.reasonCode || "invalid-output", { validationQuality: validation.quality });
    }

    // A per-click budget of model requests (manual translation). Every attempt, rescue and chunk
    // request takes one; when none are left the attempt fails without sending anything.
    createAutoTranslationRequestBudget(limit = MANUAL_TRANSLATION_REQUEST_BUDGET) {
        return { limit: Math.max(1, Math.floor(Number(limit) || MANUAL_TRANSLATION_REQUEST_BUDGET)), used: 0, reserved: 0 };
    }

    // A long message needs one request per chunk (plus the whole pass), so its click budget grows
    // with the chunk count, with a small rescue allowance on top, and stays bounded.
    getManualTranslationRequestBudgetLimit(text = "", requestOptions = this.plugin.getManualTranslationRequestOptions()) {
        if (!this.isLongAutoTranslationText(text)) return MANUAL_TRANSLATION_REQUEST_BUDGET;
        const longOptions = requestOptions?.mode === "long-text" ? requestOptions : this.getLongTextTranslationOptions(requestOptions, text);
        const chunkCount = this.plugin.splitLongAutoTranslationText(text, this.getLongAutoTranslationChunkLength(longOptions)).length;
        const wholePass = String(text || "").length <= MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH ? 1 : 0;
        const planned = chunkCount + wholePass + MANUAL_TRANSLATION_RESCUE_REQUEST_ALLOWANCE;
        return Math.min(MANUAL_TRANSLATION_REQUEST_BUDGET_MAX, Math.max(MANUAL_TRANSLATION_REQUEST_BUDGET, planned));
    }

    consumeAutoTranslationRequestBudget(taskOptions = {}) {
        const budget = taskOptions?.requestBudget;
        if (!budget) return;
        if (this.isAutoTranslationRequestBudgetExhausted(budget)) {
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

    shouldRunLocalAutoTranslationRepairRetry(reason, text, translated, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        if (taskOptions.retryInvalidOutput === false) return false;
        if (this.isAutoTranslationStrictRetryEnabled()) return false;
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
        const baseTimeoutMs = this.getAutoTranslationRequestTimeoutMs(options, text);
        const currentMaxTokens = this.plugin.normalizeRequestNumber(
            this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides).maxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const raisedMaxTokens = Number(raisedOptions?.configOverrides?.maxTokens || 0) || currentMaxTokens;
        const scaled = Math.ceil(baseTimeoutMs * Math.max(1, raisedMaxTokens / currentMaxTokens));
        return Math.max(baseTimeoutMs, Math.min(AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS, scaled));
    }

    getAutoTranslationRequestTimeoutMs(options = this.getAutoTranslationOptions(), text = "") {
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

    isAutoTranslationAttemptCurrent(options, taskOptions) {
        if (options?.signal?.aborted || taskOptions?.signal?.aborted) return false;
        if (typeof options?.heartbeat === "function" && options.heartbeat() === false) return false;
        if (typeof taskOptions?.heartbeat === "function" && taskOptions.heartbeat() === false) return false;
        if (taskOptions?.requestBudget || taskOptions?.manualRescue || /^manual(?:-|$)/.test(options?.mode || "")) return true;
        return this.plugin.isAutoTranslationRequestCurrent(options);
    }

    // Superseded or cancelled work must not be retried, rescued or continued with the next chunk.
    isAbandonedTranslationError(error) {
        return Boolean(error?.autoTranslationStale) || this.plugin.isRequestCancelled(error);
    }

    async runAutoTranslationStrictFallbackTask(text, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        const strictOptions = this.plugin.getAutoTranslationRetryOptions(text, "", options);
        const signalOptions = {
            ...(taskOptions?.signal ? { signal: taskOptions.signal } : {}),
            ...(typeof taskOptions?.heartbeat === "function" ? { heartbeat: taskOptions.heartbeat } : {})
        };
        try {
            return await this.plugin.runAutoTranslationTask(text, strictOptions, { retryInvalidOutput: false, ...signalOptions });
        }
        catch (error) {
            if (!error?.autoTranslationFinalInvalidOutput && !error?.modelOutputTruncated) throw error;
            const lastChanceOptions = error?.modelOutputTruncated
                ? this.buildTruncationRetryOptions(this.getAutoTranslationFinalFallbackOptions(text, options), options, text, 2, error)
                : this.getAutoTranslationFinalFallbackOptions(text, options);
            const targetLanguage = this.getAutoTranslationTargetLanguage(lastChanceOptions);
            let rawTranslated = "";
            try {
                rawTranslated = await this.plugin.runAutoTranslationModelAttempt(text, lastChanceOptions, signalOptions);
            }
            catch (lastChanceError) {
                if (error?.modelOutputTruncated) this.rethrowTruncationRetryTimeout(lastChanceError, error);
                throw lastChanceError;
            }
            const outputOptions = this.getAutoTranslationOutputValidationOptions(text, rawTranslated, lastChanceOptions);
            const translated = this.plugin.sanitizeAutoTranslationOutput(text, rawTranslated, targetLanguage, outputOptions);
            const validation = this.plugin.getAutoTranslationOutputValidationResult(
                text,
                translated,
                targetLanguage,
                this.getAutoTranslationOutputValidationOptions(text, translated, lastChanceOptions),
                lastChanceOptions
            );
            if (validation.renderable) return translated;
            throw this.createFinalInvalidAutoTranslationError(validation.reasonCode || error?.autoTranslationInvalidReason || "invalid-output");
        }
    }

    async runAutoTranslationBatchTask(texts, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        const isCurrent = () => this.isAutoTranslationAttemptCurrent(options, taskOptions);
        if (!isCurrent()) throw this.createAutoTranslationStaleError("batch-attempt-stale");
        if ((texts || []).some(text => this.isLongAutoTranslationText(text))) {
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
            ? this.getAutoTranslationBatchRetryOptions(batch.length, options)
            : this.getAutoTranslationBatchOptions(batch.length, options);
        const baseTimeoutMs = this.getAutoTranslationRequestTimeoutMs(batchOptions);
        const batchTimeoutMs = Math.min(
            AUTO_TRANSLATE_CLOUD_LONG_TEXT_TIMEOUT_MAX_MS,
            baseTimeoutMs + Math.max(0, batch.length - 1) * 3000
        );
        const output = await this.plugin.runModelTask("translation", JSON.stringify(batch), {
            configOverrides: batchOptions.configOverrides,
            timeoutMs: batchTimeoutMs,
            mode: batchOptions.mode || "auto-batch",
            isCurrent,
            ...(taskOptions?.signal ? { signal: taskOptions.signal } : {})
        });
        const rows = this.parseAutoTranslationBatchOutput(output);
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

        const omittedIndexes = new Set();
        const translated = batch.map((item, index) => {
            if (!byId.has(item.id)) omittedIndexes.add(index);
            return String(byId.get(item.id) || "").trim();
        });
        if (omittedIndexes.size) {
            Object.defineProperty(translated, "omittedIndexes", {
                value: omittedIndexes,
                enumerable: false,
                configurable: true
            });
        }
        return translated;
    }

    getAutoTranslationOptions() {
        const configOverrides = this.getAutoTranslationOverrides();
        return {
            mode: "auto",
            version: this.stateMachine.configVersion,
            routeKey: this.plugin.getCurrentRouteKey(),
            targetLanguage: this.plugin.settings.translation.targetLanguage,
            providerKey: this.plugin.getAutoTranslationProviderKey({ configOverrides }),
            configOverrides
        };
    }

    getAutoTranslationTargetLanguage(options = this.getAutoTranslationOptions()) {
        return options?.targetLanguage || this.plugin.settings.translation.targetLanguage;
    }

    isAutoTranslationStrictRetryEnabled() {
        if (this.plugin.isDirectTranslateProvider(this.plugin.getEffectiveTaskConfig("translation"))) return false;
        return this.plugin.settings.ui?.autoTranslateStrictRetry !== false;
    }

    getAutoTranslationBatchGroupKey(options = this.getAutoTranslationOptions()) {
        const config = this.plugin.getCacheConfigSnapshot("translation", this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides));
        return [
            options?.mode || "auto",
            options?.version ?? this.stateMachine.configVersion,
            options?.routeKey || "",
            this.getAutoTranslationTargetLanguage(options),
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

    getAutoTranslationBatchOptions(count, options = this.getAutoTranslationOptions()) {
        const targetLanguage = this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options));

        return {
            mode: "auto-batch",
            version: options?.version ?? this.stateMachine.configVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatch"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: this.getAutoTranslationTargetLanguage(options),
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatch"),
                prompt: this.plugin.buildPromptPolicyAutoBatchPrompt(count, options)
            }
        };
    }

    getAutoTranslationBatchRetryOptions(count, options = this.getAutoTranslationOptions()) {
        const targetLanguage = this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options));

        return {
            mode: "auto-batch-retry",
            version: options?.version ?? this.stateMachine.configVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoBatchRetry"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: this.getAutoTranslationTargetLanguage(options),
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
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

        const primaryJsonText = this.plugin.extractJsonPayload(value);
        const candidates = [primaryJsonText];
        if (typeof this.plugin.findJsonPayloads === "function") {
            for (const candidate of this.plugin.findJsonPayloads(value)) {
                if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
            }
        }
        const isUsableBatchRowsShape = rows => Array.isArray(rows)
            && rows.length > 0
            && rows.every(item => typeof item === "string" || (item && typeof item === "object" && !Array.isArray(item)));

        let chosenJsonText = primaryJsonText;
        let parsed = null;
        let parsedOk = false;
        for (let idx = 0; idx < candidates.length; idx++) {
            const candidateText = candidates[idx];
            try {
                const candidateParsed = JSON.parse(candidateText);
                const candidateRows = this.normalizeAutoTranslationBatchRows(candidateParsed);
                if (!parsedOk) {
                    chosenJsonText = candidateText;
                    parsed = candidateParsed;
                    parsedOk = true;
                }
                if (isUsableBatchRowsShape(candidateRows)) {
                    chosenJsonText = candidateText;
                    parsed = candidateParsed;
                    break;
                }
            }
            catch {}
        }
        if (!parsedOk) {
            throw this.plugin.createAutoBatchParseError(this.plugin.t("invalidJson"));
        }

        const objectKeys = [];
        for (const [token, quotedKey, separator] of chosenJsonText.matchAll(/("(?:[^"\\]|\\.)*")(\s*:)?|[{}\[\]]/g)) {
            if (token === "{") objectKeys.push(new Set());
            else if (token === "[") objectKeys.push(null);
            else if (token === "}" || token === "]") objectKeys.pop();
            else if (separator) {
                const keys = objectKeys.at(-1);
                const key = JSON.parse(quotedKey);
                if (keys.has(key)) throw this.plugin.createAutoBatchParseError("Duplicate batch JSON member");
                keys.add(key);
            }
        }

        const rows = this.normalizeAutoTranslationBatchRows(parsed);
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
            const normalizedId = this.plugin.normalizeBatchRowId(id);
            if (value && typeof value === "object") {
                const explicitId = value.id ?? value.key ?? value.index ?? value.number;
                if (explicitId != null && this.plugin.normalizeBatchRowId(explicitId) !== normalizedId) {
                    throw this.plugin.createAutoBatchParseError("Conflicting batch row id");
                }
                return { ...value, id: value.id ?? normalizedId };
            }
            return { id: normalizedId, translation: value };
        });
    }

    getAutoTranslationRetryOptions(sourceText, badOutput = "", options = this.getAutoTranslationOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.isLocalAutoTranslationOptions(options);
        const requestOrigin = options?.requestOrigin
            || (/^manual(?:-|$)/.test(String(options?.mode || ""))
                ? "manual"
                : (/^public-bilingual(?:-|$)/.test(String(options?.mode || "")) ? "public-bilingual" : ""));

        return {
            mode: "auto-retry",
            ...(requestOrigin ? { requestOrigin } : {}),
            ...(options?.requestContext ? { requestContext: options.requestContext } : {}),
            ...(options?.isolatedConfig ? { isolatedConfig: true } : {}),
            version: options?.version ?? this.stateMachine.configVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoRetry"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            longTextChunk: Boolean(options?.longTextChunk || options?.mode === "long-text"),
            longTextSourceLength: Number(options?.longTextSourceLength || String(sourceText || "").length) || 0,
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoRetry"),
                localCompactPrompt: isLocalProvider,
                prompt: isLocalProvider
                    ? this.buildCompactLocalAutoTranslationPrompt(options, "retry")
                    : this.plugin.buildPromptPolicyAutoRetryPrompt(sourceText, badOutput, options)
            }
        };
    }

    getAutoTranslationFinalFallbackOptions(sourceText, options = this.getAutoTranslationOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.isLocalAutoTranslationOptions(options);
        const requestOrigin = options?.requestOrigin
            || (/^manual(?:-|$)/.test(String(options?.mode || ""))
                ? "manual"
                : (/^public-bilingual(?:-|$)/.test(String(options?.mode || "")) ? "public-bilingual" : ""));

        return {
            mode: "auto-final-fallback",
            ...(requestOrigin ? { requestOrigin } : {}),
            ...(options?.requestContext ? { requestContext: options.requestContext } : {}),
            ...(options?.isolatedConfig ? { isolatedConfig: true } : {}),
            version: options?.version ?? this.stateMachine.configVersion,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoFinalFallback"),
            routeKey: options?.routeKey || this.plugin.getCurrentRouteKey(),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            longTextChunk: Boolean(options?.longTextChunk || options?.mode === "long-text"),
            longTextSourceLength: Number(options?.longTextSourceLength || String(sourceText || "").length) || 0,
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("autoFinalFallback"),
                localCompactPrompt: isLocalProvider,
                prompt: isLocalProvider
                    ? this.buildCompactLocalAutoTranslationPrompt(options, "final")
                    : this.plugin.buildPromptPolicyAutoFinalFallbackPrompt(sourceText, options)
            }
        };
    }

    getAutoTranslationOverrides() {
        const translation = this.plugin.settings.translation;
        const targetLanguage = this.getAutoTranslationTargetInstruction(translation.targetLanguage);
        const isLocalProvider = this.plugin.isLocalTranslationProvider({ provider: translation.provider });
        const overrides = {
            provider: translation.provider,
            apiKey: translation.apiKey,
            apiKeyOrigin: translation.apiKeyOrigin,
            endpoint: translation.endpoint,
            model: translation.model,
            region: translation.region,
            deeplPlan: translation.deeplPlan,
            appId: translation.appId,
            secretKey: translation.secretKey,
            sourceLanguage: AUTO_LANGUAGE_VALUE,
            targetLanguage,
            targetLanguageCode: this.plugin.getTargetLanguageCode(translation.targetLanguage),
            temperature: 0,
            maxTokens: translation.maxTokens,
            enableThinking: false,
            promptPolicyVersion: this.plugin.getPromptPolicyVersion("auto"),
            localCompactPrompt: isLocalProvider,
            prompt: isLocalProvider
                ? this.buildCompactLocalAutoTranslationPrompt({ targetLanguage: translation.targetLanguage }, "auto")
                : this.plugin.buildPromptPolicyPrompt("auto", {
                    targetLanguage,
                    basePrompt: translation.prompt
                })
        };
        const credentialFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(translation) || [];
        credentialFields.forEach(field => {
            if (!field || Object.prototype.hasOwnProperty.call(overrides, field)) return;
            overrides[field] = translation[field] ?? "";
        });
        return overrides;
    }

    getAutoTranslationRequestSnapshot(options = null) {
        const config = options?.isolatedConfig && options?.configOverrides
            ? options.configOverrides
            : this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        const snapshot = {
            provider: config.provider,
            apiKey: config.apiKey,
            apiKeyOrigin: config.apiKeyOrigin,
            endpoint: config.endpoint,
            model: config.model,
            region: config.region,
            deeplPlan: config.deeplPlan,
            appId: config.appId,
            secretKey: config.secretKey,
            maxTokens: config.maxTokens,
            // Builders replace targetLanguage with the LLM instruction; direct translation
            // APIs read this raw code instead.
            targetLanguageCode: this.plugin.getTargetLanguageCode(this.getAutoTranslationTargetLanguage(options || {}))
        };
        const credentialFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(config) || [];
        credentialFields.forEach(field => {
            if (!field || Object.prototype.hasOwnProperty.call(snapshot, field)) return;
            snapshot[field] = config[field] ?? "";
        });
        return snapshot;
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
        if (sourceLetters >= 120 && targetLetters < this.getMinimumAutoTranslationTargetLetters(sourceLetters, targetScript)) return true;
        if (this.hasCollapsedAutoTranslationSentenceCoverage(source, output, targetLanguage, sourceLetters, targetLetters)) return true;
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
        const sourceChunks = this.getTranslatableAutoTranslationSentenceChunks(sourceText, targetLanguage);
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
        const sourceLines = this.getTranslatableAutoTranslationLines(sourceText, targetLanguage);
        if (sourceLines.length <= 1) return false;
        if (!this.shouldPreserveAutoTranslationLineCount(sourceText, sourceLines)) return false;

        const translatedLines = String(translatedText || "")
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => this.plugin.hasLetters(line));
        if (translatedLines.length < sourceLines.length) {
            if (this.isMergedShortAutoTranslationLinesAcceptable(sourceLines, translatedText, targetLanguage, options)) return false;
            return true;
        }

        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        return sourceLines.some((sourceLine, index) => this.isAutoTranslationLineUndercovered(sourceLine, translatedLines[index], targetLanguage, targetScript));
    }

    isMergedShortAutoTranslationLinesAcceptable(sourceLines = [], translatedText = "", targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}) {
        if (options?.mergedLongText) return true;
        const lines = sourceLines.map(line => String(line || "").trim()).filter(Boolean);
        if (lines.length < 2 || lines.length > 4) return false;
        if (lines.some(line => line.length > 80)) return false;
        if (lines.some(line => this.getAutoTranslationLineWordCount(line, targetLanguage) > 2)) return false;
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
        if (this.hasResidualAutoTranslationSourceText(output, targetLanguage, source)) return true;
        const anchors = this.getAutoTranslationCoverageAnchors(source);
        if (anchors.length && !this.hasAutoTranslationCoverageAnchors(output, anchors)) return true;

        const sourceCounts = this.plugin.countTextScriptsForValidation(source);
        const outputCounts = this.plugin.countTextScriptsForValidation(output);
        const sourceLetters = Math.max(0, Number(sourceCounts.total || 0) - Number(sourceCounts[targetScript] || 0));
        if (sourceLetters < 24) return false;

        const targetLetters = Number(outputCounts[targetScript] || 0);
        if (targetLetters <= 0) return true;
        if (sourceLetters < 80) return targetLetters < Math.max(2, Math.round(sourceLetters * 0.08));
        return targetLetters < Math.max(8, Math.round(this.getMinimumAutoTranslationTargetLetters(sourceLetters, targetScript) * 0.6));
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
                const normalized = this.normalizeAutoTranslationCoverageAnchor(match);
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

    isMergedLongAutoTranslationAcceptable(sourceText, translatedText, targetLanguage, sourceLines = this.getTranslatableAutoTranslationLines(sourceText, targetLanguage)) {
        if (sourceLines.length < 3) return false;
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;
        if (this.hasResidualAutoTranslationSourceText(output, targetLanguage, source)) return false;
        if (this.hasUndertranslatedAutoTranslationOutput(source, output, targetLanguage)) return false;

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
        const source = String(sourceText || "");
        const stripPreservedKaomojiKana = line => {
            if (!source || targetScript === "kana") return line;
            const sourceKana = Number(this.plugin.countTextScripts(source)?.kana || 0);
            if (sourceKana <= 0 || sourceKana > 2) return line;
            return line.replace(/[\u3040-\u30ff\u31f0-\u31ff]{1,2}/gu, token => (source.includes(token) ? " " : token));
        };

        return String(translatedText || "")
            .split(/\n+/)
            .map(line => stripPreservedKaomojiKana(line).trim())
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

        const japaneseOutputHasKana = targetScript === "kana" && (this.plugin.countTextScripts(output)?.kana || 0) > 0;
        const segments = this.plugin.getLanguageScriptSegments(output)
            .filter(segment => segment.script !== targetScript && !(japaneseOutputHasKana && segment.script === "han"))
            .filter(segment => !this.plugin.isLikelyPreservedForeignSegment(segment.text));
        if (!segments.length) return false;

        return segments.some(segment => {
            if (segment.script !== "latin") {
                const segmentLetters = segment.text.replace(/[^\p{L}]/gu, "");
                if (segmentLetters.length > 0 && segmentLetters.length <= 2 && source.includes(segmentLetters)) {
                    const sourceScriptTotal = Number(this.plugin.countTextScripts(source)?.[segment.script] || 0);
                    if (sourceScriptTotal <= 2) return false;
                }
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

    getAutoTranslationPrecheckSkipReason(text, requestOptions = this.getAutoTranslationOptions()) {
        const value = String(text || "").trim();
        const targetLanguage = this.getAutoTranslationTargetLanguage(requestOptions);
        const cached = this.getAutoTranslationPrecheckSkipReasonFromCache(value, targetLanguage, requestOptions);
        if (cached !== null) return cached;

        const reason = this.computeAutoTranslationPrecheckSkipReason(value, targetLanguage);
        if (reason) this.cacheAutoTranslationPrecheckSkipReason(value, targetLanguage, requestOptions, reason);
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
        if (this.isAutoTranslationLinkOnlyText(value)) return "link-only";
        if (this.isAutoTranslationCodeOnlyText(value)) return "code-only";
        if (this.plugin.isLowInformationRepeatedText(value)) return "low-information-repeat";
        if (this.plugin.isLikelyPreservedTokenLine(value)) return "preserved-token";
        if (this.plugin.isCommonTargetShortText(value, targetLanguage)) return "common-target-short";
        if (!this.plugin.shouldAutoTranslateText(value, targetLanguage)) return "already-target-language";
        return "";
    }

    getAutoTranslationPrecheckSkipReasonFromCache(text, targetLanguage, requestOptions = this.getAutoTranslationOptions(), now = Date.now()) {
        const key = this.getAutoTranslationPrecheckSkipCacheKey(text, targetLanguage, requestOptions);
        if (!key || !this.cooldowns.precheckSkips?.has?.(key)) return null;
        const entry = this.cooldowns.precheckSkips.get(key);
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            this.cooldowns.precheckSkips.delete(key);
            return null;
        }
        return entry.reason || "";
    }

    cacheAutoTranslationPrecheckSkipReason(text, targetLanguage, requestOptions = this.getAutoTranslationOptions(), reason = "") {
        if (!reason) return;
        if (!this.cooldowns.precheckSkips?.set) this.cooldowns.precheckSkips = new Map();
        const key = this.getAutoTranslationPrecheckSkipCacheKey(text, targetLanguage, requestOptions);
        if (!key) return;
        const now = Date.now();
        this.cooldowns.precheckSkips.delete(key);
        this.cooldowns.precheckSkips.set(key, {
            reason,
            expiresAt: now + AUTO_TRANSLATE_PRECHECK_SKIP_TTL_MS
        });
        this.pruneAutoTranslationPrecheckSkipCache(now);
    }

    getAutoTranslationPrecheckSkipCacheKey(text, targetLanguage, requestOptions = this.getAutoTranslationOptions()) {
        const value = String(text || "").trim();
        if (!value) return "";
        return [
            this.plugin.normalizeLanguageName(targetLanguage),
            requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions),
            this.plugin.getStrongTextFingerprint(value)
        ].join("\n---\n");
    }

    pruneAutoTranslationPrecheckSkipCache(now = Date.now()) {
        const map = this.cooldowns.precheckSkips;
        if (!map?.size) return;
        // Fixed TTL + delete-before-set guarantees oldest-expiry entries are first.
        for (const [key, entry] of map) {
            if (Number(entry?.expiresAt || 0) <= now) map.delete(key);
            else break;
        }
        while (map.size > AUTO_TRANSLATE_PRECHECK_SKIP_MAX) {
            const oldestKey = map.keys().next().value;
            map.delete(oldestKey);
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
        if (!value || !value.includes("`")) return false;
        const withoutCode = value
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/~~~[\s\S]*?~~~/g, " ")
            .replace(/`[^`\n]+`/g, " ")
            .trim();
        return withoutCode.length === 0;
    }

    isAutoTranslationTokenOnlyText(text) {
        const raw = String(text || "");
        const withoutEmoji = String(
            typeof this.plugin.removeStandardEmoji === "function"
                ? this.plugin.removeStandardEmoji(raw)
                : removeStandardEmoji(raw)
        );
        const trimmed = withoutEmoji.trim();
        if (!trimmed) return true;
        if (!this.plugin.hasLetters(trimmed)) return true;
        if (this.isAutoTranslationLinkOnlyText(trimmed) || this.isAutoTranslationCodeOnlyText(trimmed)) return true;
        const strippedTokens = trimmed
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/~~~[\s\S]*?~~~/g, " ")
            .replace(/`[^`]+`/g, " ")
            .replace(/<(?:https?|steam|discord):\/\/[^\s<>]+>/gi, " ")
            .replace(/(?:https?|steam|discord):\/\/[^\s<>"']+/gi, " ")
            .replace(/\bwww\.[^\s<>"']+/gi, " ")
            .replace(/<a?:[A-Za-z0-9_~.-]{1,64}:\d+>/g, " ")
            .replace(/<[@#][!&]?\d+>/g, " ")
            .replace(/<\/[^:<>\n]{1,100}:\d+>/g, " ")
            .replace(/<t:-?\d{1,13}(?::[tTdDfFR])?>/g, " ")
            .replace(/<id:[A-Za-z0-9_:-]+>/g, " ")
            .replace(/:[A-Za-z0-9_~]{2,64}:/g, " ")
            .replace(/(?<![\p{L}\p{N}_])[@#][A-Za-z0-9_.-]{1,64}(?![\p{L}\p{N}_])/gu, " ")
            .trim();
        if (!strippedTokens || !this.plugin.hasLetters(strippedTokens)) return true;
        const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        return lines.length > 0 && lines.every(line => this.plugin.isLikelyPreservedTokenLine(line));
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
        const raised = this.withRaisedAutoTranslationMaxTokens(requestOptions, plan?.text || "", 2);
        const config = this.plugin.getEffectiveTaskConfig("translation", raised?.configOverrides);
        const prompt = this.plugin.isLocalTranslationProvider(config)
            ? this.buildCompactLocalAutoTranslationPrompt(raised, "longText")
            : this.buildPromptPolicyLongTextPrompt(raised);
        const wholeOptions = {
            ...raised,
            mode: `${requestOptions?.mode || "manual"}-whole`,
            allowProviderFallback: false,
            longTextWholePass: true,
            longTextMerged: true,
            longTextSourceLength: String(plan?.text || "").length,
            configOverrides: {
                ...raised.configOverrides,
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(raised)),
                targetLanguageCode: this.plugin.getTargetLanguageCode(this.getAutoTranslationTargetLanguage(raised)),
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.plugin.getPromptPolicyVersion("longText"),
                localCompactPrompt: this.plugin.isLocalTranslationProvider(config),
                prompt
            }
        };
        delete wholeOptions.truncationRetry;
        delete wholeOptions.allowTruncationFallback;
        return wholeOptions;
    }

    async runManualLongTextWholePass(plan, requestOptions, taskOptions = {}) {
        if (!this.isLongAutoTranslationText(plan?.text)) return null;
        const sourceLength = String(plan?.text || "").length;
        if (sourceLength > MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH) return null;
        const wholeOptions = this.getManualLongTextWholePassOptions(plan, requestOptions);
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
                allowProviderFallback: false,
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
            if (this.isAbandonedTranslationError(error)) throw error;
            // A provider-wide failure (or no requests left) ends the click here unless an eligible
            // fallback provider is configured and ready for the chunked pipeline. A timeout may be
            // down to the size of the whole pass, so the smaller chunk requests still get a turn.
            if (this.isAutoTranslationRequestBudgetError(error)) throw error;
            if (this.shouldStopLongAutoTranslationOnChunkError(error) && !this.plugin.isTimeoutError(error)) {
                const currentConfig = this.plugin.getEffectiveTaskConfig("translation", wholeOptions?.configOverrides);
                const hasUsableFallback = Boolean(
                    this.plugin.shouldTryProviderFallback?.("translation", requestOptions || { mode: "manual" }, currentConfig, error)
                    && (this.plugin.getProviderFallbackOrder?.("translation", currentConfig) || []).some(provider => {
                        const fallbackConfig = this.plugin.getProviderFallbackConfig?.("translation", provider, currentConfig);
                        return fallbackConfig && this.plugin.hasUsableApiConfig?.("translation", fallbackConfig, { isolatedConfig: true });
                    })
                );
                if (!hasUsableFallback) throw error;
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
