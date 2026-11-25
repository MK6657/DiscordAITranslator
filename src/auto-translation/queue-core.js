"use strict";

// Phase 6 pre-step A: auto-translation queue state, scheduling, failures, decisions, channel policy and timing windows.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    API_ENDPOINT_ERROR_MESSAGE_KEYS,
    AUTO_TRANSLATE_BATCH_MULTIPLIER,
    AUTO_TRANSLATE_DEFAULT_CONCURRENCY,
    AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE,
    AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT,
    AUTO_TRANSLATE_FAILURE_HISTORY_TTL,
    AUTO_TRANSLATE_FAILURE_LIMIT,
    AUTO_TRANSLATE_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_FAILURE_TTL,
    AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_IMMEDIATE_TERMINAL_TYPES,
    AUTO_TRANSLATE_INTAKE_MODES,
    AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_IN_FLIGHT_STALE_MS,
    AUTO_TRANSLATE_LAST_DECISION_MAX,
    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
    AUTO_TRANSLATE_MAX_CONCURRENCY,
    AUTO_TRANSLATE_MAX_RETRY_ATTEMPTS,
    AUTO_TRANSLATE_MIN_BATCH_SIZE,
    AUTO_TRANSLATE_MIN_CONCURRENCY,
    AUTO_TRANSLATE_PARTIAL_RESULT_MAX,
    AUTO_TRANSLATE_PARTIAL_RESULT_TTL_MS,
    AUTO_TRANSLATE_PREFETCH_RANGES,
    AUTO_TRANSLATE_PROVIDER_FAILURE_TTL,
    AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX,
    AUTO_TRANSLATE_QUEUE_MULTIPLIER,
    AUTO_TRANSLATE_RECENT_RENDER_MAX,
    AUTO_TRANSLATE_RECENT_RENDER_TTL_MS,
    AUTO_TRANSLATE_REQUEST_BATCH_SIZE,
    AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
    AUTO_TRANSLATE_RETAIN_MAX_FAILURE_COUNT,
    AUTO_TRANSLATE_SCROLL_RENDER_PAUSE_MS,
    AUTO_TRANSLATE_SCROLL_STILL_MS,
    AUTO_TRANSLATE_TERMINAL_FAILURE_TTL,
    AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL,
    AUTO_TRANSLATE_TRUNCATED_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_TRUNCATED_FAILURE_TTL,
    AUTO_TRANSLATE_VIEWPORT_JUMP_COOLDOWN_MS,
    AUTO_TRANSLATE_VIEWPORT_JUMP_SETTLE_MS,
    AUTO_TRANSLATE_VIEWPORT_SETTLE_MS,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    AUTO_TRANSLATION_QUEUE_TYPES,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_MESSAGE_STATES,
    DIAGNOSTIC_REASON_CODES,
    DISCORD_MESSAGE_NODE_SELECTOR,
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS
} = require("../constants");
const { createPluginContext } = require("../core/plugin-context");
const { getChannelRuleKey } = require("./channel-rule");

class AutoTranslationQueueCore {
    constructor(plugin, ctx = createPluginContext(plugin)) {
        this.plugin = plugin;
        this.ctx = ctx;
        this.routeChangePending = false;
        this.scrollRelevanceCache = new WeakMap();
    }

    get stateMachine() { return this.ctx.stateMachine; }
    get cooldowns() { return this.ctx.cooldowns; }

    shouldInvalidateAutoTranslationForSetting(path) {
        if (["ui.autoTranslateMessages", "ui.autoTranslatePrefetch", "ui.autoTranslatePrefetchRange", "ui.autoTranslateIntakeMode", "ui.autoTranslateConcurrency", "ui.autoTranslateStrictRetry"].includes(path)) return true;
        if (["googleTranslate.keyPoolText", "googleTranslate.defaultMonthlyLimit", "googleTranslate.allowPrefetch"].includes(path)) return true;
        if (!path.startsWith("translation.")) return false;
        const field = path.split(".")[1];
        if ([
            "enabled",
            "apiKey",
            "endpoint",
            "model",
            "provider",
            "region",
            "deeplPlan",
            "appId",
            "secretKey",
            "enableThinking",
            "sourceLanguage",
            "targetLanguage",
            "temperature",
            "maxTokens",
            "prompt"
        ].includes(field)) return true;
        const customFields = this.plugin.getRegisteredCredentialFieldNames?.()
            || this.plugin.providerLayer?.registry?.getCredentialFields?.(this.plugin.settings?.translation)
            || [];
        return customFields.includes(field);
    }

    invalidateAutoTranslationQueue(options = {}) {
        if (!options.preserveVersion) this.stateMachine.configVersion++;
        this.plugin.cancelIncrementalMessageScan();
        this.plugin.cancelAutoTranslationRenderQueue();
        this.stateMachine.queue = [];
        this.stateMachine.queueSortDirty = false;
        this.stateMachine.queuedKeys.clear();
        if (!options.preserveVersion) {
            this.scrollRelevanceCache = new WeakMap();
            if (this.plugin.cacheOnlyScanTimer) {
                clearTimeout(this.plugin.cacheOnlyScanTimer);
                this.plugin.cacheOnlyScanTimer = null;
                this.plugin.cacheOnlyScanDueAt = 0;
            }
            // The in-flight work below is orphaned: stop its HTTP requests too, so they do not
            // keep a local server busy while the next scan starts new ones.
            this.abortAutoTranslationRequests("invalidated");
            this.plugin.autoTranslationPartialResults?.clear?.();
            this.plugin.autoStateMachine.clearInFlight();
            this.plugin.autoCooldowns.precheckSkips.clear();
            this.plugin.autoStateMachine.recentRenders.clear();
            this.plugin.autoStateMachine.lastDecisions.clear();
        }
        if (!options.preserveFailures) {
            this.plugin.autoCooldowns.clearFailures({ preserveNotices: Boolean(options.preserveNotices) });
        }
        if (this.plugin.autoCooldowns.retryTimer && !options.preserveRetry && (!options.preserveFailures || options.clearRetryTimer)) {
            this.plugin.autoCooldowns.clearRetryTimer();
        }
        if (!options.preserveNodes) {
            for (const [cacheKey, entry] of this.stateMachine.pendingTargets) {
                for (const target of entry?.targets || []) {
                    this.plugin.removeAutoTranslationNode(target, cacheKey);
                }
            }
        }
        if (options.preserveNodes) {
            for (const [cacheKey, entry] of [...this.stateMachine.pendingTargets]) {
                if (!options.preserveVersion || !this.stateMachine.inFlightKeys.has(cacheKey)) {
                    for (const target of entry?.targets || []) {
                        this.plugin.removeAutoTranslationLoadingNode?.(target, cacheKey, { force: true });
                    }
                    this.stateMachine.pendingTargets.delete(cacheKey);
                    continue;
                }
                const targets = (entry?.targets || []).filter(target => target?.messageNode?.isConnected && target?.content?.isConnected);
                if (targets.length) this.stateMachine.pendingTargets.set(cacheKey, { targets });
                else this.stateMachine.pendingTargets.delete(cacheKey);
            }
        }
        else {
            this.stateMachine.pendingTargets.clear();
        }
        if (!options.preserveNodes) this.plugin.removeAllAutoTranslationNodes();
        this.ctx.events?.emit("auto:queue-invalidated", { options });
    }

    getAutoTranslationQueueSnapshot() {
        return {
            queueLength: this.stateMachine.queue?.length || 0,
            inFlight: this.stateMachine.inFlight || 0,
            inFlightItems: this.stateMachine.inFlightItems || 0,
            prefetchInFlight: this.stateMachine.prefetchInFlight || 0,
            pendingTargets: this.stateMachine.pendingTargets?.size || 0
        };
    }

    getAutoTranslationDiagnosticQueueType(item = {}, context = null, options = null) {
        return this.plugin.translationScheduler.getQueueType(item, context, options || undefined);
    }

    createAutoTranslationLayoutContext() {
        return {
            useViewportVisibility: true,
            rectByElement: new Map(),
            visibleByElement: new Map(),
            scrollClipByElement: new Map(),
            nearByElement: new Map(),
            priorityByElement: new Map()
        };
    }

    getAutoTranslationDiagnosticQueuePriority(item = {}, queueType = null) {
        const rank = this.plugin.translationScheduler.getQueueTypeRank(item, queueType);
        const priority = Number(item?.priority ?? Number.MAX_SAFE_INTEGER);
        return rank * 1000000 + Math.min(999999, Math.max(0, Number.isFinite(priority) ? Math.round(priority) : 999999));
    }

    getAutoTranslationQueuedDiagnosticState(item = {}) {
        const queueType = this.getAutoTranslationDiagnosticQueueType(item);
        if (queueType === AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT) return DIAGNOSTIC_MESSAGE_STATES.QUEUED_LONG_TEXT;
        if (queueType === AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH) return DIAGNOSTIC_MESSAGE_STATES.QUEUED_PREFETCH;
        return DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE;
    }

    getAutoTranslationBlockReasonCode(blockReason) {
        const value = String(blockReason || "").trim();
        const map = {
            "missing-api": "missing-api",
            "cache-only": "cache-only",
            "render-paused": "render-paused",
            "jump-cooldown": "jump-cooldown",
            "viewport-settling": "viewport-settling",
            "stability-pending": "stability-pending",
            "provider-cooldown": DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN,
            "local-provider-health": DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH
        };
        return map[value] || DIAGNOSTIC_REASON_CODES.API_WORK_BLOCKED;
    }

    setAutoTranslationDiagnosticState(item, state, reasonCode = "") {
        if (!item) return item;
        const messageState = this.plugin.getDiagnosticMessageState(state);
        const normalizedReasonCode = this.plugin.getDiagnosticReasonCode(reasonCode);
        if (messageState) item.daitDiagnosticState = messageState;
        if (normalizedReasonCode) item.daitDiagnosticReason = normalizedReasonCode;
        return item;
    }

    logAutoTranslationMessageState(action, status, item, state, reasonCode = "", extra = {}) {
        this.setAutoTranslationDiagnosticState(item, state, reasonCode);
        this.recordAutoTranslationDecision(item, {
            action,
            status,
            state,
            reasonCode,
            extra
        });
        if (!this.plugin.settings.ui?.diagnosticsEnabled) return null;
        return this.plugin.logDiagnostic(action, status, this.plugin.getAutoTranslationDiagnosticMeta(item, state, reasonCode, extra));
    }

    recordAutoTranslationDecision(candidate, decision = {}) {
        const key = this.getAutoTranslationDecisionKey(candidate, decision);
        if (!key) return null;
        if (!this.stateMachine.lastDecisions?.set) this.stateMachine.lastDecisions = new Map();
        const requestOptions = candidate?.requestOptions || decision?.requestOptions || this.plugin.getAutoTranslationOptions();
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        const reasonCode = this.plugin.getDiagnosticReasonCode(decision.reasonCode || candidate?.daitDiagnosticReason || "");
        const messageState = this.plugin.getDiagnosticMessageState(decision.state || candidate?.daitDiagnosticState || "");
        const previous = this.stateMachine.lastDecisions.get(key) || {};
        const failureType = decision?.extra?.failureType || decision?.extra?.type || decision?.extra?.lastErrorType || "";
        const validationQuality = decision?.extra?.validationQuality || decision?.validationQuality || previous.validationQuality || "";
        const failureDetails = this.plugin.classifyDiagnosticFailure(decision.action || "auto.message.state", decision.status || "", {
            ...decision.extra,
            failureType,
            reasonCode,
            messageState,
            validationQuality
        }, decision?.extra?.flowStage || "");
        const requestStarted = reasonCode === DIAGNOSTIC_REASON_CODES.REQUEST_STARTED
            || (messageState === DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT && String(decision.status || "").toLowerCase() === "start");
        // Queue type resolution may touch the DOM; compute it once for both fields.
        // Avoid forcing a post-render layout reflow right after inserting a translation line.
        const decisionQueueItem = candidate || decision?.item || {};
        const skipDomQueueType = Boolean(decision?.status === "rendered" || decision?.extra?.skipDomQueueType || this.plugin.renderFrameScrollCache);
        const decisionQueueType = this.getAutoTranslationDiagnosticQueueType(decisionQueueItem, null, skipDomQueueType ? { skipDomCheck: true } : null);
        const decisionIdentity = requestOptions?.messageIdentity || candidate?.messageIdentity || "";
        const decisionIdentityHash = this.plugin.getTextFingerprint(decisionIdentity);
        const now = Date.now();
        const entry = {
            at: now,
            iso: new Date(now).toISOString(),
            action: this.getAutoTranslationDecisionAction(decision.status, messageState, reasonCode),
            status: String(decision.status || ""),
            state: this.getAutoTranslationLastDecisionState(decision.status, messageState, reasonCode),
            messageState,
            reasonCode,
            provider: config.provider || "",
            providerKeyHash: this.plugin.getTextFingerprint(requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions)),
            targetLanguage: this.plugin.getAutoTranslationTargetLanguage(requestOptions),
            targetKind: candidate?.targetKind || (this.plugin.isReplyPreviewElement(candidate?.content) ? "reply-preview" : "message"),
            source: candidate?.source || "dom",
            queueType: decisionQueueType,
            queuePriority: this.getAutoTranslationDiagnosticQueuePriority(decisionQueueItem, decisionQueueType),
            identityHash: decisionIdentityHash,
            messageIdentityHash: decisionIdentityHash,
            messageIdentityKind: this.plugin.getTranslationIdentitySummary(decisionIdentity).kind || "",
            textHash: this.plugin.getStrongTextFingerprint(candidate?.text || ""),
            cacheHash: this.plugin.getTextFingerprint(candidate?.cacheKey || decision?.cacheKey || ""),
            canRender: Boolean(decision?.extra?.canRender),
            retryAfterMs: Number(decision?.extra?.retryAfterMs || 0) || 0,
            requestCount: Math.max(0, Number(previous.requestCount || 0) || 0) + (requestStarted ? 1 : 0),
            validationQuality,
            failureType,
            failureClass: failureDetails.failureClass || previous.failureClass || "",
            failureLayer: failureDetails.failureLayer || previous.failureLayer || "",
            flowStage: decision?.extra?.flowStage || previous.flowStage || "",
            lastErrorType: failureType || previous.lastErrorType || ""
        };
        this.stateMachine.lastDecisions.set(key, entry);
        while (this.stateMachine.lastDecisions.size > AUTO_TRANSLATE_LAST_DECISION_MAX) {
            this.stateMachine.lastDecisions.delete(this.stateMachine.lastDecisions.keys().next().value);
        }
        return entry;
    }

    getAutoTranslationDecisionKey(candidate, decision = {}) {
        const requestOptions = candidate?.requestOptions || decision?.requestOptions || this.plugin.getAutoTranslationOptions();
        const providerKey = requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions);
        const targetLanguage = this.plugin.getAutoTranslationTargetLanguage(requestOptions);
        const identity = requestOptions?.messageIdentity
            || candidate?.messageIdentity
            || (candidate?.messageNode && candidate?.content ? this.plugin.getMessageIdentity(candidate.messageNode, candidate.content, candidate.text || "") : "");
        const textHash = this.plugin.getStrongTextFingerprint(candidate?.text || "");
        if (!providerKey || !targetLanguage || (!identity && !textHash)) return "";
        return [
            this.plugin.getTextFingerprint(providerKey),
            this.plugin.normalizeLanguageName(targetLanguage),
            this.plugin.getTextFingerprint(identity || `text:${textHash}`),
            textHash
        ].join(":");
    }

    getAutoTranslationDecisionAction(status, messageState, reasonCode) {
        if (reasonCode === DIAGNOSTIC_REASON_CODES.TERMINAL_FAILURE) return "terminal-failed";
        if ([DIAGNOSTIC_REASON_CODES.CACHE_HIT, DIAGNOSTIC_REASON_CODES.TEXT_CACHE_HIT].includes(reasonCode)) return "render-cache";
        if ([DIAGNOSTIC_REASON_CODES.ENQUEUED, DIAGNOSTIC_REASON_CODES.REQUEUED].includes(reasonCode)) return "enqueue";
        if (messageState === DIAGNOSTIC_MESSAGE_STATES.SKIPPED || String(status || "") === "skipped") return "skip";
        if (String(status || "") === "blocked" || String(status || "") === "failed") return "block";
        return String(status || "") || "state";
    }

    getAutoTranslationLastDecisionState(status, messageState, reasonCode) {
        if (reasonCode === DIAGNOSTIC_REASON_CODES.TERMINAL_FAILURE) return "terminal-failed";
        if (reasonCode === DIAGNOSTIC_REASON_CODES.CURRENT_TRANSLATION_PRESENT) return "current-line-present";
        if (reasonCode === DIAGNOSTIC_REASON_CODES.RECENT_RENDER_PRESENT) return "current-line-present";
        if ([DIAGNOSTIC_REASON_CODES.CACHE_HIT, DIAGNOSTIC_REASON_CODES.TEXT_CACHE_HIT].includes(reasonCode)) return "cache-hit";
        if (reasonCode === DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED) return "render-deferred";
        if (reasonCode === DIAGNOSTIC_REASON_CODES.RENDERED || messageState === DIAGNOSTIC_MESSAGE_STATES.RENDERED) return "rendered";
        if (messageState === DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT) return "in-flight";
        if ([DIAGNOSTIC_REASON_CODES.ENQUEUED, DIAGNOSTIC_REASON_CODES.REQUEUED, DIAGNOSTIC_REASON_CODES.DEDUPE_ACTIVE].includes(reasonCode)
            || [DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE, DIAGNOSTIC_MESSAGE_STATES.QUEUED_PREFETCH, DIAGNOSTIC_MESSAGE_STATES.QUEUED_LONG_TEXT].includes(messageState)) return "queued";
        if (messageState === DIAGNOSTIC_MESSAGE_STATES.SKIPPED || String(status || "") === "skipped") return "skipped";
        if (String(status || "") === "blocked" || messageState === DIAGNOSTIC_MESSAGE_STATES.FAILED || messageState === DIAGNOSTIC_MESSAGE_STATES.CANCELLED) return "blocked";
        return String(status || "") || String(messageState || "") || "unknown";
    }

    getLastAutoTranslationDecisionsSnapshot(limit = 80) {
        const entries = [...(this.stateMachine.lastDecisions?.values?.() || [])]
            .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
            .slice(0, Math.max(1, Number(limit) || 80));
        return entries.map(entry => ({ ...entry }));
    }

    clearAutoTranslationProviderFailureForCurrentConfig(kind = "translation") {
        try {
            if (kind !== "translation") return;
            const key = this.plugin.getAutoTranslationProviderKey(this.plugin.getAutoTranslationOptions());
            if (key) this.cooldowns.providerFailures.delete(key);
            if (key) this.cooldowns.providerNoticeAt.delete(key);
        }
        finally {
            this.ctx.events?.emit("auto:config-error-cleared", { kind });
        }
    }

    releaseProviderBlockedAutoTranslationItems(providerKey) {
        const key = String(providerKey || "");
        if (!key) return;
        let released = 0;
        this.stateMachine.queue.forEach(item => {
            if (this.getAutoTranslationItemProviderKey(item) !== key) return;
            if (!Number(item?.daitRequeueAfter || 0)) return;
            delete item.daitRequeueAfter;
            released++;
        });
        if (!released) return;
        this.plugin.sortAutoTranslationQueue();
        this.plugin.logDiagnostic("auto.queue.requeue", "release-provider", {
            key: this.plugin.getTextFingerprint(key),
            released
        });
        if (this.plugin.isStarted) this.plugin.drainAutoTranslationQueue();
    }

    isAutoTranslationProviderSnapshotCurrent(providerKey, requestOptions = this.plugin.getAutoTranslationOptions()) {
        const expected = String(providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions) || "");
        if (!expected) return false;
        return expected === String(this.plugin.getAutoTranslationProviderKey(this.plugin.getAutoTranslationOptions()) || "");
    }

    getCachedScrollRelevance(element, now = Date.now()) {
        if (!element || element.nodeType !== 1) return null;
        const cached = this.scrollRelevanceCache?.get?.(element);
        if (cached && now >= cached.at && now - cached.at < 500) return cached;
        return null;
    }

    isAutoTranslationScrollEventRelevant(event = null) {
        const target = event?.target;
        if (!target || typeof document === "undefined" || target === document || target === window || target === document.body || target === document.documentElement) return true;
        const element = target?.nodeType === 3 ? target.parentElement : target;
        if (!element || element.nodeType !== 1) return true;
        const now = Date.now();
        const cached = this.getCachedScrollRelevance(element, now);
        if (cached) return cached.relevant;
        let relevant = false;
        let mediaViewer = false;
        if (this.plugin.isInsideDiscordSettingsSurface(element)) {
            relevant = false;
        }
        else if (this.plugin.isInsideDiscordMediaViewer(element) || this.plugin.isMediaOnlyMutationElement(element)) {
            relevant = false;
            mediaViewer = true;
        }
        else if (element.closest?.(".dait-settings, .dait-quick-settings-modal-root, .dait-quick-popover, .dait-polish-result-panel, .dait-polish-restore-control, .dait-input-action-menu, .dait-polish-preset-menu, .dait-translation-line, .dait-translation-box")
            || element.closest?.("[class*='channelTextArea'], [role='textbox']")) {
            relevant = false;
        }
        else {
            const selector = [
                DISCORD_MESSAGE_NODE_SELECTOR,
                "[data-list-id*='chat-messages']",
                "[class*='messagesWrapper']",
                "[class*='scrollerInner']",
                "[class*='chatContent']"
            ].join(",");
            relevant = Boolean(element.matches?.(selector) || element.closest?.(selector) || element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR));
        }
        this.scrollRelevanceCache?.set?.(element, { relevant, mediaViewer, at: now });
        return relevant;
    }

    markAutoTranslationViewportBusy(type = "scroll", event = null, { routeScopeChanged = false } = {}) {
        const now = Date.now();
        const scrollY = this.plugin.getViewportScrollPosition(event);
        const documentHeight = typeof document !== "undefined" ? Number(document.documentElement?.clientHeight || 0) : 0;
        const height = typeof window !== "undefined" ? Number(window.innerHeight || documentHeight || 0) : 0;
        const previousScrollY = this.plugin.getPreviousViewportScrollPosition(event, scrollY);
        const jumped = ["mutation", "resize", "route"].includes(type) || Math.abs(scrollY - previousScrollY) > Math.max(600, height * 0.8);
        this.plugin.setPreviousViewportScrollPosition(event, scrollY);
        this.plugin.autoTranslationLastScrollY = scrollY;
        this.plugin.autoTranslationLastExternalScrollAt = now;
        if (type === "scroll" || type === "resize") {
            this.plugin.autoTranslationRenderPausedUntil = Math.max(
                Number(this.plugin.autoTranslationRenderPausedUntil || 0),
                now + (jumped ? AUTO_TRANSLATE_VIEWPORT_JUMP_SETTLE_MS : AUTO_TRANSLATE_SCROLL_RENDER_PAUSE_MS)
            );
        }
        if (jumped) {
            this.plugin.invalidateAutoTranslationQueue({
                preserveFailures: true,
                preserveRetry: !routeScopeChanged,
                preserveNodes: true,
                preserveVersion: !routeScopeChanged,
                clearRetryTimer: routeScopeChanged
            });
            this.resetAutoTranslationViewportStability();
            this.enterAutoTranslationJumpCooldown(type);
        }
        this.plugin.autoTranslationViewportBusyUntil = Math.max(
            this.plugin.autoTranslationViewportBusyUntil || 0,
            now + (jumped ? AUTO_TRANSLATE_VIEWPORT_JUMP_SETTLE_MS : AUTO_TRANSLATE_VIEWPORT_SETTLE_MS)
        );
    }

    isAutoTranslationViewportSettling(now = Date.now()) {
        return now < Number(this.plugin.autoTranslationViewportBusyUntil || 0);
    }

    isAutoTranslationRenderPaused(now = Date.now()) {
        return now < Number(this.plugin.autoTranslationRenderPausedUntil || 0);
    }

    // Scroll events arrive every frame while the user or a Discord animation moves the chat,
    // so a short silence means nothing is animating and scroll corrections are safe.
    getAutoTranslationScrollStillRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.plugin.autoTranslationLastExternalScrollAt || 0) + AUTO_TRANSLATE_SCROLL_STILL_MS - now);
    }

    getAutoTranslationRenderPauseRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.plugin.autoTranslationRenderPausedUntil || 0) - now);
    }

    enterAutoTranslationJumpCooldown(type = "jump") {
        const now = Date.now();
        this.plugin.autoTranslationJumpCooldownUntil = Math.max(
            Number(this.plugin.autoTranslationJumpCooldownUntil || 0),
            now + AUTO_TRANSLATE_VIEWPORT_JUMP_COOLDOWN_MS
        );
        if (this.stateMachine.queue.length || this.stateMachine.pendingTargets.size) {
            this.plugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
        }
    }

    isAutoTranslationJumpCoolingDown(now = Date.now()) {
        return now < Number(this.plugin.autoTranslationJumpCooldownUntil || 0);
    }

    getAutoTranslationJumpCooldownRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.plugin.autoTranslationJumpCooldownUntil || 0) - now);
    }

    getAutoTranslationViewportSettleRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.plugin.autoTranslationViewportBusyUntil || 0) - now);
    }

    resetAutoTranslationViewportStability() {
        this.plugin.autoTranslationViewportRequiresStableScan = true;
        this.plugin.autoTranslationViewportStableAnchor = "";
        this.plugin.autoTranslationViewportStableScans = 0;
    }

    isAutoTranslationViewportStabilityPending(context = this.plugin.createScanContext(), now = Date.now()) {
        if (!this.plugin.autoTranslationViewportRequiresStableScan) return false;
        if (this.isAutoTranslationViewportSettling(now)) return true;
        if (!context?.messageNodes?.length) {
            this.plugin.autoTranslationViewportRequiresStableScan = false;
            this.plugin.autoTranslationViewportStableAnchor = "";
            this.plugin.autoTranslationViewportStableScans = 0;
            return false;
        }

        const anchor = this.plugin.getAutoTranslationViewportAnchor(context);
        if (!anchor) {
            this.plugin.scheduleAutoTranslationRetryScan(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return true;
        }

        if (anchor === this.plugin.autoTranslationViewportStableAnchor) {
            this.plugin.autoTranslationViewportStableScans++;
        }
        else {
            this.plugin.autoTranslationViewportStableAnchor = anchor;
            this.plugin.autoTranslationViewportStableScans = 1;
        }

        if (this.plugin.autoTranslationViewportStableScans >= 2) {
            this.plugin.autoTranslationViewportRequiresStableScan = false;
            return false;
        }

        this.plugin.scheduleAutoTranslationRetryScan(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
        return true;
    }

    getAutoTranslationViewportAnchor(context = this.plugin.createScanContext()) {
        const nodes = [...new Set(context?.messageNodes || [])]
            .filter(node => node?.isConnected && node?.getBoundingClientRect)
            .filter(node => this.plugin.isElementVisibleInViewportCached(node, context))
            .slice(0, 4);
        if (!nodes.length) return "";

        return nodes.map(node => {
            const rect = this.plugin.getCachedElementRect(node, context) || {};
            const id = String(node.getAttribute?.("id") || node.getAttribute?.("data-list-item-id") || "").trim();
            const content = this.plugin.getMessageContentElement(node, context);
            const text = content ? this.plugin.getCachedElementText(content, context) : "";
            return [
                id || "no-dom-id",
                Math.round(Number(rect.top || 0) / 12),
                Math.round(Number(rect.height || 0) / 12),
                this.plugin.getTextFingerprint(text)
            ].join(":");
        }).join("|");
    }

    trackAutoTranslationRouteChange() {
        const key = this.plugin.getCurrentRouteKey();
        if (!key) return false;
        const previousKey = this.plugin.autoTranslationLastRouteKey;
        const pending = this.routeChangePending;
        this.routeChangePending = false;
        this.plugin.autoTranslationLastRouteKey = key;
        if (!previousKey || (previousKey === key && !pending)) return false;
        const routeScopeChanged = previousKey !== key && !this.isSameAutoTranslationRouteScope(previousKey, key);
        this.plugin.markAutoTranslationViewportBusy("route", null, { routeScopeChanged });
        return true;
    }

    removeQueuedAutoTranslationItem(cacheKey) {
        if (!cacheKey || !this.stateMachine.queue.length) return 0;
        const before = this.stateMachine.queue.length;
        this.stateMachine.removeQueued(cacheKey);
        return before - this.stateMachine.queue.length;
    }

    pruneAutoTranslationQueue() {
        if (!this.stateMachine.queue.length) return;

        const layoutContext = this.createAutoTranslationLayoutContext();
        const next = [];
        for (const item of this.stateMachine.queue) {
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(item, layoutContext);
            if (!readyTargets.length) {
                this.plugin.removeAutoTranslationLoadingForItem?.(item, { force: true });
                this.stateMachine.queuedKeys.delete(item?.cacheKey);
                this.clearAutoTranslationPendingTargets(item?.cacheKey);
                continue;
            }

            this.stateMachine.pendingTargets.set(item.cacheKey, { targets: readyTargets });
            next.push(this.plugin.withAutoTranslationPriority(
                { ...item, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) },
                { preserveExisting: true, context: layoutContext }
            ));
        }

        this.stateMachine.queue = next;
        this.plugin.sortAutoTranslationQueue(layoutContext);
    }

    drainAutoTranslationQueue() {
        try {
            return this._drainAutoTranslationQueue();
        }
        finally {
            this.ctx.events?.emit("auto:queue-drained");
        }
    }

    _drainAutoTranslationQueue() {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return;
        }
        this.pruneAutoTranslationActiveState();
        if (this.isAutoTranslationJumpCoolingDown()) {
            this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                reasonCode: DIAGNOSTIC_REASON_CODES.API_WORK_BLOCKED,
                messageState: DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE,
                ...this.getAutoTranslationQueueSnapshot(),
                reason: "jump-cooldown",
                queueLength: this.stateMachine.queue.length,
                inFlight: this.stateMachine.inFlight,
                retryMs: this.getAutoTranslationJumpCooldownRemainingMs()
            });
            this.plugin.scheduleAutoTranslationRetryScan(this.getAutoTranslationJumpCooldownRemainingMs());
            return;
        }
        if (this.isAutoTranslationViewportSettling()) {
            this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                reasonCode: DIAGNOSTIC_REASON_CODES.API_WORK_BLOCKED,
                messageState: DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE,
                ...this.getAutoTranslationQueueSnapshot(),
                reason: "viewport-settling",
                queueLength: this.stateMachine.queue.length,
                inFlight: this.stateMachine.inFlight,
                retryMs: this.plugin.getAutoTranslationViewportSettleRemainingMs()
            });
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationViewportSettleRemainingMs());
            return;
        }

        const concurrency = this.getAutoTranslateConcurrency();
        const blockedPrefetch = [];

        while (this.stateMachine.inFlight < concurrency && this.stateMachine.queue.length) {
            const layoutContext = this.createAutoTranslationLayoutContext();
            let batch = this.plugin.takeAutoTranslationBatch({ visibility: "visible", layoutContext });
            if (!batch.length) batch = this.plugin.takeAutoTranslationBatch({ visibility: "prefetch", layoutContext });
            if (!batch.length) break;
            const providerFailure = this.getAutoTranslationProviderFailure(batch[0]?.requestOptions);
            if (providerFailure && !this.isAutoTranslationFailureExpired(providerFailure)) {
                this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                    reasonCode: providerFailure.type === "local-unavailable" ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN,
                    messageState: this.getAutoTranslationQueuedDiagnosticState(batch[0]),
                    ...this.getAutoTranslationQueueSnapshot(),
                    reason: "provider-cooldown",
                    type: providerFailure.type || "",
                    batchSize: batch.length,
                    queueLength: this.stateMachine.queue.length,
                    inFlight: this.stateMachine.inFlight
                });
                batch.forEach(item => this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    this.getAutoTranslationQueuedDiagnosticState(item),
                    providerFailure.type === "local-unavailable" ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN,
                    { type: providerFailure.type || "", retryAfterMs: this.getAutoTranslationFailureRemainingMs(providerFailure) }
                ));
                if (providerFailure.type === "local-unavailable") {
                    const providerKey = this.getAutoTranslationItemProviderKey(batch[0]);
                    const retryMs = this.getAutoTranslationFailureRemainingMs(providerFailure);
                    const retainedKeys = this.retainProviderBlockedVisibleAutoTranslationBatch(batch, retryMs, DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE);
                    this.plugin.discardAutoTranslationProviderWork(providerKey, { retryMs, skipCacheKeys: retainedKeys });
                }
                else if (providerFailure.terminal) {
                    const providerKey = this.getAutoTranslationItemProviderKey(batch[0]);
                    batch.forEach(item => {
                        this.plugin.removeAutoTranslationLoadingForItem(item, { force: true });
                        this.discardAutoTranslationItemWork(item);
                    });
                    this.plugin.discardAutoTranslationProviderWork(providerKey, { retryMs: 0, retainVisible: false });
                }
                else {
                    const providerKey = this.getAutoTranslationItemProviderKey(batch[0]);
                    const retryMs = this.getAutoTranslationFailureRemainingMs(providerFailure);
                    const delayMs = Math.max(1000, retryMs);
                    const requeueAfter = Date.now() + delayMs;
                    batch.forEach(item => {
                        item.daitRequeueAfter = requeueAfter;
                        this.plugin.removeAutoTranslationLoadingForItem(item);
                    });
                    this.stateMachine.queue.forEach(item => {
                        if (!item || this.getAutoTranslationItemProviderKey(item) !== providerKey) return;
                        item.daitRequeueAfter = Math.max(Number(item.daitRequeueAfter || 0), requeueAfter);
                        this.plugin.removeAutoTranslationLoadingForItem(item);
                    });
                    this.restoreAutoTranslationBatch(batch);
                    this.plugin.scheduleAutoTranslationRetryScan(delayMs);
                }
                if (blockedPrefetch.length) this.restoreBlockedAutoTranslationPrefetch(blockedPrefetch);
                return;
            }
            const localProviderHealthBlocked = this.plugin.shouldBlockAutoTranslationForLocalProviderHealth(batch[0]?.requestOptions);
            if (localProviderHealthBlocked) {
                const retryMs = this.plugin.getLocalProviderHealthRetryMs(batch[0]?.requestOptions);
                this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                    reasonCode: DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH,
                    messageState: this.getAutoTranslationQueuedDiagnosticState(batch[0]),
                    ...this.getAutoTranslationQueueSnapshot(),
                    reason: "local-provider-health",
                    batchSize: batch.length,
                    queueLength: this.stateMachine.queue.length,
                    inFlight: this.stateMachine.inFlight,
                    retryMs
                });
                batch.forEach(item => this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    this.getAutoTranslationQueuedDiagnosticState(item),
                    DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH
                ));
                this.retainProviderBlockedVisibleAutoTranslationBatch(batch, retryMs, DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH);
                this.plugin.scheduleAutoTranslationRetryScan(retryMs);
                if (blockedPrefetch.length) this.restoreBlockedAutoTranslationPrefetch(blockedPrefetch);
                return;
            }
            const isPrefetchBatch = this.isAutoTranslationPrefetchBatch(batch);
            if (isPrefetchBatch && !this.canStartAutoTranslationPrefetchRequest(concurrency)) {
                this.plugin.logDiagnostic("auto.queue.prefetch", "blocked", {
                    reasonCode: DIAGNOSTIC_REASON_CODES.PREFETCH_SLOT,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.QUEUED_PREFETCH,
                    ...this.getAutoTranslationQueueSnapshot(),
                    reason: "prefetch-slot",
                    batchSize: batch.length,
                    concurrency,
                    prefetchInFlight: this.stateMachine.prefetchInFlight
                });
                batch.forEach(item => this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.QUEUED_PREFETCH,
                    DIAGNOSTIC_REASON_CODES.PREFETCH_SLOT,
                    { concurrency }
                ));
                blockedPrefetch.push(...batch);
                break;
            }

            const startedAt = Date.now();
            this.stateMachine.beginInFlightBatch(batch, {
                isPrefetch: isPrefetchBatch,
                startedAt,
                createToken: key => this.createAutoTranslationInFlightToken(key),
                isVisibleLong: item => this.plugin.isLongAutoTranslationItem(item) && !this.plugin.isAutoTranslationPrefetchItem(item),
                onItemMarked: (item, itemStartedAt) => {
                    this.setAutoTranslationDiagnosticState(item, DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT, DIAGNOSTIC_REASON_CODES.REQUEST_STARTED);
                    this.logAutoTranslationMessageState(
                        "auto.message.state",
                        "in-flight",
                        item,
                        DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                        DIAGNOSTIC_REASON_CODES.REQUEST_STARTED,
                        { startedAt: itemStartedAt }
                    );
                }
            });
            this.plugin.logDiagnostic("auto.batch.start", "start", {
                ...this.plugin.getDiagnosticBaseMeta("auto", batch[0]?.requestOptions?.mode || "auto", DIAGNOSTIC_REASON_CODES.REQUEST_STARTED),
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                batchSize: batch.length,
                prefetch: isPrefetchBatch,
                concurrency,
                queueLength: this.stateMachine.queue.length,
                inFlight: this.stateMachine.inFlight,
                inFlightItems: this.stateMachine.inFlightItems,
                prefetchInFlight: this.stateMachine.prefetchInFlight,
                provider: batch[0]?.requestOptions?.configOverrides?.provider,
                model: batch[0]?.requestOptions?.configOverrides?.model
            });
            if (batch.length > 1) this.plugin.autoTranslateQueuedBatch(batch);
            else this.plugin.autoTranslateQueuedMessage(batch[0]);
        }

        if (blockedPrefetch.length) this.restoreBlockedAutoTranslationPrefetch(blockedPrefetch);
    }

    retainProviderBlockedVisibleAutoTranslationBatch(batch = [], retryMs = 0, reasonCode = DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE) {
        const retainedKeys = new Set();
        const queueLimit = this.plugin.getAutoTranslateQueueLimit();
        batch.forEach(item => {
            if (this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item)) {
                const retained = this.retainBlockedVisibleAutoTranslationItem(item, {
                    delayMs: retryMs,
                    queueLimit,
                    reasonCode
                });
                if (retained && item?.cacheKey) retainedKeys.add(item.cacheKey);
                return;
            }
            this.discardAutoTranslationItemWork(item);
        });
        return retainedKeys;
    }

    restoreBlockedAutoTranslationPrefetch(items) {
        this.stateMachine.queue.unshift(...items);
        items.forEach(item => {
            if (item?.cacheKey) this.stateMachine.queuedKeys.add(item.cacheKey);
        });
        this.plugin.sortAutoTranslationQueue();
    }

    restoreAutoTranslationBatch(items) {
        this.stateMachine.queue.unshift(...items);
        items.forEach(item => {
            if (item?.cacheKey) this.stateMachine.queuedKeys.add(item.cacheKey);
        });
        this.plugin.sortAutoTranslationQueue();
    }

    retainBlockedVisibleAutoTranslationItem(item, options = {}) {
        if (!item?.cacheKey || !this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item)) return false;
        const queueLimit = Math.max(1, Number(options.queueLimit) || this.plugin.getAutoTranslateQueueLimit());
        if (!this.makeRoomForAutoTranslationItem(item, queueLimit)) return false;
        const retryMs = Math.max(0, Number(options.delayMs) || 0);
        const retained = { ...item };
        delete retained.daitInFlightToken;
        delete retained.daitBatchId;
        delete retained.daitPrefetchRequest;
        delete retained.daitRequeued;
        if (options.allowActiveRequeue) retained.daitAllowActiveRequeue = true;
        if (retryMs) {
            retained.daitRequeueAfter = Date.now() + retryMs;
            this.plugin.scheduleAutoTranslationRetryScan(retryMs);
        }
        else {
            delete retained.daitRequeueAfter;
        }
        this.plugin.removeAutoTranslationLoadingForItem(retained, { force: true });
        this.addAutoTranslationPendingTarget(retained.cacheKey, retained);
        const enqueued = this.enqueueAutoTranslationItem(retained);
        if (enqueued) {
            item.daitRequeued = true;
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "requeued",
                retained,
                this.getAutoTranslationQueuedDiagnosticState(retained),
                options.reasonCode || DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE,
                { delayMs: retryMs, retained: true }
            );
        }
        return enqueued;
    }

    shouldRetainAutoTranslationProviderBlockedItem(item) {
        return Boolean(item?.cacheKey
            && this.plugin.isAutoTranslationRequestCurrent(item?.requestOptions)
            && (this.plugin.isAutoTranslationVisibleItem(item) || item?.daitHistoryRequest));
    }

    shouldRetainAutoTranslationFailureItem(item, error, failure = null) {
        if (!item?.cacheKey || item?.daitPrefetchRequest) return false;
        if (failure?.terminal) return false;
        const type = this.getAutoTranslationFailureType(error);
        // A truncated output is not retained: it already had a retry with a larger limit, and
        // requeueing it every few seconds re-sent a full-length generation forever.
        if (!["local-unavailable", "timeout", "network", "server", "rate-limit"].includes(type)) return false;
        // A message that keeps timing out stops holding a queue slot: its failure record paces it.
        if (["timeout", "network"].includes(type) && Number(failure?.count || 0) >= AUTO_TRANSLATE_RETAIN_MAX_FAILURE_COUNT) return false;
        return this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item);
    }

    getAutoTranslationProviderBlockedRetryMs(providerFailure = null, localProviderHealthBlocked = false, now = Date.now()) {
        if (providerFailure) return this.getAutoTranslationFailureRemainingMs(providerFailure, now);
        if (localProviderHealthBlocked) return LOCAL_PROVIDER_HEALTH_RETRY_MS;
        return AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS;
    }

    isRetainableAutoTranslationProviderBlock(providerFailure = null, localProviderHealthBlocked = false) {
        return Boolean(localProviderHealthBlocked
            || ["local-unavailable", "timeout", "network", "server", "rate-limit"].includes(String(providerFailure?.type || "")));
    }

    discardAutoTranslationProviderWork(providerKey, options = {}) {
        if (!providerKey) return;
        const rawRetryMs = options.retryMs === undefined ? LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS : Number(options.retryMs);
        const retryMs = Number.isFinite(rawRetryMs) ? Math.max(0, rawRetryMs) : LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS;
        const retainVisible = options.retainVisible !== false;
        const skipCacheKeys = options.skipCacheKeys instanceof Set ? options.skipCacheKeys : new Set();
        const keep = [];
        for (const item of this.stateMachine.queue) {
            if (item?.cacheKey && skipCacheKeys.has(item.cacheKey)) {
                keep.push(item);
                continue;
            }
            if (this.getAutoTranslationItemProviderKey(item) === providerKey) {
                if (retainVisible && this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item)) {
                    const retained = { ...item, daitRequeueAfter: Date.now() + retryMs };
                    delete retained.daitInFlightToken;
                    delete retained.daitBatchId;
                    delete retained.daitPrefetchRequest;
                    this.plugin.removeAutoTranslationLoadingForItem(retained, { force: true });
                    this.addAutoTranslationPendingTarget(retained.cacheKey, retained);
                    keep.push(retained);
                    if (retained.cacheKey) this.stateMachine.queuedKeys.add(retained.cacheKey);
                }
                else {
                    this.discardAutoTranslationItemWork(item);
                }
            }
            else {
                keep.push(item);
            }
        }
        this.stateMachine.queue = keep;

        for (const [cacheKey, entry] of [...this.stateMachine.pendingTargets.entries()]) {
            if (skipCacheKeys.has(cacheKey)) continue;
            const targets = Array.isArray(entry?.targets) ? entry.targets : [];
            const remaining = [];
            for (const target of targets) {
                if (this.getAutoTranslationItemProviderKey(target) === providerKey) {
                    this.plugin.removeAutoTranslationLoadingNode(target, cacheKey, { force: true });
                    if (retainVisible && this.plugin.shouldRetainAutoTranslationProviderBlockedItem({ ...target, cacheKey })) {
                        remaining.push(target);
                    }
                    continue;
                }
                remaining.push(target);
            }
            if (remaining.length) this.stateMachine.pendingTargets.set(cacheKey, { targets: remaining });
            else this.stateMachine.pendingTargets.delete(cacheKey);
        }
        if (retryMs) this.plugin.scheduleAutoTranslationRetryScan(retryMs);
        this.plugin.sortAutoTranslationQueue();
    }

    discardAutoTranslationItemWork(item) {
        if (!item?.cacheKey) return;
        this.plugin.removeAutoTranslationLoadingForItem(item, { force: true });
        this.stateMachine.queuedKeys.delete(item.cacheKey);
        this.clearAutoTranslationPendingTargets(item.cacheKey);
    }

    getAutoTranslationItemProviderKey(item) {
        return this.plugin.translationScheduler.getItemProviderKey(item);
    }

    canStartAutoTranslationPrefetchRequest(concurrency = this.getAutoTranslateConcurrency()) {
        return this.plugin.translationScheduler.canStartPrefetchRequest(concurrency);
    }

    isAutoTranslationPrefetchBatch(batch, context = null) {
        return this.plugin.translationScheduler.isPrefetchBatch(batch, context);
    }

    isAutoTranslationPrefetchItem(item, context = null) {
        return this.plugin.translationScheduler.isPrefetchItem(item, context);
    }

    isAutoTranslationVisibleItem(item, context = null) {
        return this.plugin.translationScheduler.isVisibleItem(item, context);
    }

    hasActiveVisibleAutoTranslationWork() {
        return this.hasVisibleAutoTranslationInFlight() || this.hasQueuedVisibleAutoTranslationWork();
    }

    hasVisibleAutoTranslationInFlight() {
        return Math.max(0, Number(this.stateMachine.inFlight || 0) - Number(this.stateMachine.prefetchInFlight || 0)) > 0;
    }

    hasQueuedVisibleAutoTranslationWork(context = null) {
        const queue = this.stateMachine.queue || [];
        const layoutContext = context || (queue.length > 1 ? this.createAutoTranslationLayoutContext() : null);
        return queue.some(item => {
            const queueType = this.getAutoTranslationDiagnosticQueueType(item, layoutContext);
            return queueType === AUTO_TRANSLATION_QUEUE_TYPES.VISIBLE
                || queueType === AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT;
        });
    }

    takeAutoTranslationBatch(options = {}) {
        const layoutContext = options.layoutContext || this.createAutoTranslationLayoutContext();
        if (this.stateMachine.queueSortDirty && this.stateMachine.queue.length > 1) {
            this.plugin.sortAutoTranslationQueue(layoutContext);
        }
        else {
            this.stateMachine.queueSortDirty = false;
        }
        const batch = [];
        const deferred = [];
        let batchGroupKey = "";
        let batchPrefetchState = null;
        let batchLimit = AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX;
        let nextReadyAt = 0;
        const now = Date.now();
        const visibility = options.visibility || "";
        while (batch.length < batchLimit && this.stateMachine.queue.length) {
            const item = this.stateMachine.queue.shift();
            const requeueAfter = Number(item?.daitRequeueAfter || 0);
            if (requeueAfter > now) {
                nextReadyAt = nextReadyAt ? Math.min(nextReadyAt, requeueAfter) : requeueAfter;
                deferred.push(item);
                continue;
            }
            delete item.daitRequeueAfter;
            if (batch.length && batch.length >= this.plugin.getAutoTranslationRequestBatchSize(item.requestOptions)) {
                // Batch already full for this provider: defer without paying the per-item
                // readiness cost (DOM queries and rect reads) for the rest of the queue.
                deferred.push(item);
                continue;
            }
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(item, layoutContext);
            if (!readyTargets.length) {
                this.plugin.removeAutoTranslationLoadingForItem?.(item, { force: true });
                this.stateMachine.queuedKeys.delete(item?.cacheKey);
                this.clearAutoTranslationPendingTargets(item?.cacheKey);
                continue;
            }

            this.stateMachine.pendingTargets.set(item.cacheKey, { targets: readyTargets });
            const readyItem = { ...item, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) };
            const itemPrefetchState = this.plugin.isAutoTranslationPrefetchItem(readyItem, layoutContext);
            if (itemPrefetchState && !this.isAutoTranslationPrefetchAllowed(readyItem, layoutContext)) {
                this.discardAutoTranslationItemWork(readyItem);
                continue;
            }
            if ((visibility === "visible" && itemPrefetchState) || (visibility === "prefetch" && !itemPrefetchState)) {
                deferred.push(readyItem);
                continue;
            }
            if (batch.length >= this.plugin.getAutoTranslationRequestBatchSize(readyItem.requestOptions)) {
                deferred.push(readyItem);
                continue;
            }
            if (this.shouldDeferShortAutoTranslationItemForVisibleLong(readyItem, { visibility, batch, layoutContext })) {
                deferred.push(readyItem);
                continue;
            }
            if (this.plugin.shouldDeferLongAutoTranslationItem(readyItem, { visibility, batch, layoutContext })) {
                readyItem.daitLongTextDeferrals = Math.min(
                    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
                    Math.max(0, Number(readyItem.daitLongTextDeferrals) || 0) + 1
                );
                deferred.push(readyItem);
                this.plugin.logDiagnostic("auto.queue.defer", "long-text", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(readyItem, this.getAutoTranslationQueuedDiagnosticState(readyItem), DIAGNOSTIC_REASON_CODES.BATCH_LIMIT),
                    key: this.plugin.getTextFingerprint(readyItem.cacheKey),
                    deferrals: readyItem.daitLongTextDeferrals,
                    queueLength: this.stateMachine.queue.length
                });
                continue;
            }
            if (this.plugin.shouldRunAutoTranslationItemSingle(readyItem)) {
                if (batch.length) {
                    deferred.push(readyItem);
                    continue;
                }
                delete readyItem.daitLongTextDeferrals;
                batch.push(readyItem);
                if (readyItem?.cacheKey) this.stateMachine.queuedKeys.delete(readyItem.cacheKey);
                break;
            }
            const itemGroupKey = this.plugin.getAutoTranslationBatchGroupKey(readyItem.requestOptions);
            if (!batchGroupKey) batchGroupKey = itemGroupKey;
            if (batchPrefetchState === null) batchPrefetchState = itemPrefetchState;
            if (itemGroupKey !== batchGroupKey) {
                deferred.push(readyItem);
                continue;
            }
            if (itemPrefetchState !== batchPrefetchState) {
                deferred.push(readyItem);
                continue;
            }

            batch.push(readyItem);
            if (batch.length === 1) {
                batchLimit = Math.min(
                    AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX,
                    Math.max(1, Number(this.plugin.getAutoTranslationRequestBatchSize(readyItem.requestOptions)) || 1)
                );
            }
            delete readyItem.daitLongTextDeferrals;
            if (readyItem?.cacheKey) this.stateMachine.queuedKeys.delete(readyItem.cacheKey);
        }

        if (deferred.length) {
            this.stateMachine.queue.unshift(...deferred);
            this.plugin.sortAutoTranslationQueue(layoutContext);
        }
        if (nextReadyAt) this.plugin.scheduleAutoTranslationRetryScan(Math.max(0, nextReadyAt - now));
        return batch;
    }

    shouldDeferShortAutoTranslationItemForVisibleLong(item, options = {}) {
        return false;
    }

    hasReadyShortAutoTranslationCandidate(referenceItem, options = {}) {
        const visibility = options.visibility || "";
        const layoutContext = options.layoutContext || this.createAutoTranslationLayoutContext();
        const now = Date.now();
        for (const queued of this.stateMachine.queue) {
            if (!queued?.cacheKey || queued.cacheKey === referenceItem?.cacheKey) continue;
            const requeueAfter = Number(queued?.daitRequeueAfter || 0);
            if (requeueAfter > now) continue;
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(queued, layoutContext);
            if (!readyTargets.length) continue;
            const candidate = { ...queued, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) };
            const candidatePrefetch = this.plugin.isAutoTranslationPrefetchItem(candidate, layoutContext);
            if ((visibility === "visible" && candidatePrefetch) || (visibility === "prefetch" && !candidatePrefetch)) continue;
            if (candidatePrefetch && !this.isAutoTranslationPrefetchAllowed(candidate, layoutContext)) continue;
            if (this.plugin.isLongAutoTranslationItem(candidate)) continue;
            return true;
        }
        return false;
    }

    shouldRunAutoTranslationItemSingle(item) {
        return this.plugin.translationScheduler.shouldRunItemSingle(item);
    }

    isAutoTranslationPrefetchAllowed(item, context = null) {
        if (item?.daitHistoryRequest) return true;
        if (!this.plugin.isAutoTranslationPrefetchItem(item, context)) return true;
        if (!this.isAutoTranslationPrefetchConfigured()) return false;
        const now = Date.now();
        if (this.plugin.isAutoTranslationRenderPaused(now)
            || this.isAutoTranslationViewportSettling(now)
            || this.isAutoTranslationJumpCoolingDown(now)
            || this.plugin.getInputComposerBusyRemainingMs(now) > 0) return false;
        const config = this.plugin.getEffectiveTaskConfig("translation", item?.requestOptions?.configOverrides);
        if (this.plugin.isGoogleTranslateProvider(config) && this.plugin.settings.googleTranslate?.allowPrefetch === false) return false;
        return true;
    }

    isAutoTranslationQueueItemReady(item, context = null) {
        return this.isAutoTranslationTargetReady(item, item?.cacheKey, context);
    }

    isAutoTranslationTargetReady(target, cacheKey = target?.cacheKey, context = null) {
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
        if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target)) return false;
        const domText = this.plugin.getAutoTranslationTargetDomText(target);
        if (this.plugin.hasCurrentTranslationLine(target.content, cacheKey, domText, this.plugin.getTranslationLineCacheAliases(target.text, target.requestOptions || {}), null, target.text)) return false;
        const messageInRange = this.plugin.isAutoTranslationTargetInScanRange(target.messageNode, context);
        const contentInRange = this.plugin.isAutoTranslationTargetInScanRange(target.content, context);
        if (!target.daitHistoryRequest) {
            if (!messageInRange && !contentInRange) return false;
            if (!contentInRange && !this.plugin.isAutoTranslationContentInsideMessage(target)) return false;
        }
        // The message must still show the text the target was built from; a store-full request text
        // was checked against that text when the candidate was made.
        return this.plugin.isAutoTranslationTargetDomTextCurrent(target);
    }

    getAutoTranslateConcurrency() {
        if (!this.plugin.isAutoTranslateEnabled()) return 0;
        return this.normalizeAutoTranslateConcurrency(this.plugin.settings.ui?.autoTranslateConcurrency);
    }

    getAutoTranslatePrefetchRange() {
        if (!this.plugin.isAutoTranslateEnabled() || !this.isAutoTranslationPrefetchConfigured()) return 0;
        return this.normalizeAutoTranslatePrefetchRange(this.plugin.settings.ui?.autoTranslatePrefetchRange);
    }

    isAutoTranslationPrefetchConfigured() {
        return Boolean(this.plugin.settings.ui?.autoTranslatePrefetch);
    }

    // Channel rule (v0.4.0): 'enabled' is an allow-list that works even while the main
    // auto-translate switch is off, 'disabled' always wins, 'inherit' follows the main switch.
    isAutoTranslateEnabled() {
        return Boolean(this.plugin.isStarted
            && this.plugin.settings?.translation?.enabled
            && this.isCurrentChannelAutoTranslateAllowed());
    }

    cancelAutoTranslationRuntimeWork(reason = "disabled", { staleRouteOnly = false } = {}) {
        const hasRetryTimer = Boolean(this.plugin.autoCooldowns.retryTimer);
        const hasWork = Boolean(
            this.plugin.autoStateMachine.hasActiveWork()
            || (staleRouteOnly && this.plugin.localProviderHealthChecks?.size)
        );
        if (!hasRetryTimer && !hasWork) return false;
        if (staleRouteOnly) {
            const previousKey = this.plugin.autoTranslationLastRouteKey;
            if (!previousKey) return false;
            const key = this.plugin.getCurrentRouteKey();
            if (!key || key === previousKey || this.isSameAutoTranslationRouteScope(previousKey, key)) return false;
            this.plugin.autoTranslationLastRouteKey = key;
            this.routeChangePending = true;
        }
        // M-02: Passing through a channel without auto-translate stops active requests/timers
        // without wiping failure cooldown maps, so returning cannot bypass backoff or retry budgets.
        this.plugin.invalidateAutoTranslationQueue({
            preserveNodes: staleRouteOnly,
            preserveNotices: true,
            preserveFailures: true,
            clearRetryTimer: true
        });
        this.plugin.logDiagnostic("auto.queue.cancel", "ok", { reason });
        return true;
    }

    getAutoTranslateBatchSize() {
        const requestBatchSize = this.plugin.getAutoTranslationRequestBatchSize();
        if (this.plugin.isLocalTranslationProvider(this.plugin.settings.translation)) {
            return Math.max(1, this.getAutoTranslateConcurrency() * requestBatchSize);
        }
        const perConcurrency = Math.max(AUTO_TRANSLATE_BATCH_MULTIPLIER, requestBatchSize);
        return Math.max(AUTO_TRANSLATE_MIN_BATCH_SIZE, this.getAutoTranslateConcurrency() * perConcurrency);
    }

    getAutoTranslateQueueLimit() {
        const batchSize = this.plugin.getAutoTranslateBatchSize();
        if (this.plugin.isLocalTranslationProvider(this.plugin.settings.translation)) return batchSize;
        const requestWindow = this.getAutoTranslateConcurrency() * this.plugin.getAutoTranslationRequestBatchSize() * 2;
        return Math.max(batchSize, requestWindow, batchSize * AUTO_TRANSLATE_QUEUE_MULTIPLIER);
    }

    getAutoTranslationRequestBatchSize(options = null) {
        const config = this.plugin.getEffectiveTaskConfig("translation", options?.configOverrides);
        const limit = Number(this.plugin.getProviderDefaults(config.provider)?.autoTranslateRequestBatchSize || AUTO_TRANSLATE_REQUEST_BATCH_SIZE);
        const normalized = Number.isFinite(limit) ? Math.round(limit) : AUTO_TRANSLATE_REQUEST_BATCH_SIZE;
        return Math.min(AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX, Math.max(1, normalized));
    }

    normalizeAutoTranslateConcurrency(value) {
        const number = Number(value);
        const normalized = Number.isFinite(number) ? Math.round(number) : AUTO_TRANSLATE_DEFAULT_CONCURRENCY;
        return Math.min(AUTO_TRANSLATE_MAX_CONCURRENCY, Math.max(AUTO_TRANSLATE_MIN_CONCURRENCY, normalized));
    }

    normalizeAutoTranslateIntakeMode(value) {
        const mode = String(value || "").trim();
        return AUTO_TRANSLATE_INTAKE_MODES.includes(mode) ? mode : DEFAULT_SETTINGS.ui.autoTranslateIntakeMode;
    }

    normalizeAutoTranslatePrefetchRange(value) {
        const number = Number(value);
        if (AUTO_TRANSLATE_PREFETCH_RANGES.includes(number)) return number;
        return AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE;
    }

    normalizeChannelAutoTranslatePolicyMode(value) {
        const mode = String(value || "").trim();
        return ["inherit", "enabled", "disabled"].includes(mode) ? mode : "inherit";
    }

    getCurrentChannelAutoTranslatePolicyMode(routeKey = this.plugin.getCurrentRouteKey()) {
        return this.normalizeChannelAutoTranslatePolicyMode(this.getCurrentChannelAutoTranslatePolicy(routeKey)?.mode);
    }

    // "" on a screen that is not a channel (channel-rule.js decides): such a screen gets no rule.
    getChannelAutoTranslatePolicyStorageKey(routeKey = this.plugin.getCurrentRouteKey()) {
        return getChannelRuleKey(routeKey);
    }

    setCurrentChannelAutoTranslatePolicyMode(mode, routeKey = this.plugin.getCurrentRouteKey(), options = {}) {
        const normalized = this.normalizeChannelAutoTranslatePolicyMode(mode);
        const key = this.getChannelAutoTranslatePolicyStorageKey(routeKey);
        // Controls bound to the rule carry the route they were built for; only those showing this channel are synced.
        const syncOptions = { includeActive: true, routeKey };
        if (!key) {
            this.plugin.syncSettingControls("ui.currentChannelAutoTranslatePolicy", "inherit", syncOptions);
            return false;
        }
        if (!this.plugin.settings.ui.channelAutoTranslatePolicies || typeof this.plugin.settings.ui.channelAutoTranslatePolicies !== "object" || Array.isArray(this.plugin.settings.ui.channelAutoTranslatePolicies)) {
            this.plugin.settings.ui.channelAutoTranslatePolicies = {};
        }
        const policies = this.plugin.settings.ui.channelAutoTranslatePolicies;
        const previous = this.getCurrentChannelAutoTranslatePolicyMode(routeKey);
        const exactKey = String(routeKey || "");
        if (exactKey && exactKey !== key) delete policies[exactKey];
        if (normalized === "inherit") delete policies[key];
        else policies[key] = { mode: normalized };
        if (previous === normalized) {
            this.plugin.syncSettingControls("ui.currentChannelAutoTranslatePolicy", normalized, syncOptions);
            if (options.save === "immediate" || options.forceSave === true) this.plugin.saveSettings({ retryOnError: options.retryOnError });
            else if (options.save === "debounce") this.plugin.saveSettings({ debounce: true, delayMs: options.delayMs });
            return false;
        }
        if (options.save === false) {}
        else if (options.save === "immediate") this.plugin.saveSettings({ retryOnError: options.retryOnError });
        else this.plugin.saveSettings({ debounce: true, delayMs: options.delayMs });
        this.plugin.syncSettingControls("ui.currentChannelAutoTranslatePolicy", normalized, syncOptions);
        this.plugin.invalidateAutoTranslationQueue();
        // 'inherit' with the main switch off stops auto-translation here as well as 'disabled' does.
        if (!this.plugin.isAutoTranslateEnabled()) this.plugin.cancelAutoTranslationRuntimeWork("channel-policy-disabled");
        this.plugin.logDiagnostic("auto.channel-policy", "updated", {
            ...this.plugin.getDiagnosticBaseMeta("auto", "settings", normalized === "disabled" ? "channel-disabled" : "channel-policy"),
            routeKeyHash: this.plugin.getDiagnosticRouteKeyHash(routeKey),
            mode: normalized
        });
        this.plugin.queueScan();
        return true;
    }

    getCurrentChannelAutoTranslatePolicy(routeKey = this.plugin.getCurrentRouteKey()) {
        const policies = this.plugin.settings.ui?.channelAutoTranslatePolicies;
        if (!policies || typeof policies !== "object" || Array.isArray(policies)) return { mode: "inherit" };
        const key = String(routeKey || this.plugin.getCurrentRouteKey() || "").trim();
        const channelKey = this.getChannelAutoTranslatePolicyStorageKey(key);
        const policy = policies[key] || policies[channelKey] || null;
        if (!policy || typeof policy !== "object") return { mode: "inherit" };
        const mode = this.normalizeChannelAutoTranslatePolicyMode(policy.mode);
        return {
            ...policy,
            mode,
            enabled: mode === "enabled" ? true : mode === "disabled" ? false : undefined
        };
    }

    // Quick settings can stay open across a channel switch (a notification click or a keybind) while scans are
    // held, so a "current channel" rule control would keep showing and editing the channel it was built for.
    // Each control bound to another channel is rebuilt, row and all, for the channel open now; on a screen with
    // no channel there is nothing to set a rule for, so the rebuilt control is disabled. Returns the rows rebuilt.
    refreshChannelRuleControls(routeKey = this.plugin.getCurrentRouteKey()) {
        const path = "ui.currentChannelAutoTranslatePolicy";
        const selector = `[data-dait-path='${path}']`;
        let controls = [];
        try {
            if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") controls = [...document.querySelectorAll(selector)];
        }
        catch {}
        const channel = this.getChannelAutoTranslatePolicyStorageKey(routeKey);
        let rebuilt = 0;
        controls.forEach(control => {
            const bound = control?.dataset?.daitRouteKey;
            if (typeof bound !== "string") return;
            const boundChannel = this.getChannelAutoTranslatePolicyStorageKey(bound);
            if (boundChannel === channel && (channel || this.plugin.isChannelRuleControlDisabled(control))) return;
            const row = this.plugin.createCurrentChannelPolicyRow();
            const fresh = row?.dataset?.daitPath === path ? row : row?.querySelectorAll?.(selector)?.[0];
            if (!fresh) return;
            // The old row holds its control as deep as the new row holds its own; swap the whole row when it matches.
            // Only the first class is compared: a row without a channel is also locked (dait-settings-row-inactive).
            let depth = 0;
            for (let node = fresh; node && node !== row; node = node.parentNode) depth++;
            let oldRow = control;
            for (let step = 0; step < depth && oldRow; step++) oldRow = oldRow.parentNode;
            const rowClass = node => String(node?.className || "").trim().split(/\s+/)[0];
            if (oldRow && oldRow.tagName === row.tagName && rowClass(oldRow) === rowClass(row) && typeof oldRow.replaceWith === "function") {
                oldRow.replaceWith(row);
            }
            else if (typeof control.replaceWith === "function") control.replaceWith(fresh);
            else return;
            rebuilt++;
        });
        return rebuilt;
    }

    // Channels whose rule is 'enabled': they auto-translate even while the main switch is off.
    getChannelAutoTranslateAllowListCount(policies = this.plugin.settings.ui?.channelAutoTranslatePolicies) {
        if (!policies || typeof policies !== "object" || Array.isArray(policies)) return 0;
        const channels = new Set();
        Object.entries(policies).forEach(([key, policy]) => {
            if (!policy || typeof policy !== "object") return;
            if (this.normalizeChannelAutoTranslatePolicyMode(policy.mode) !== "enabled") return;
            const channel = this.getChannelAutoTranslatePolicyStorageKey(key);
            if (channel) channels.add(channel);
        });
        return channels.size;
    }

    isCurrentChannelAutoTranslateAllowed(routeKey = this.plugin.getCurrentRouteKey()) {
        const policy = this.getCurrentChannelAutoTranslatePolicy(routeKey);
        if (policy.mode === "enabled") return true;
        if (policy.mode === "disabled") return false;
        return Boolean(this.plugin.settings?.ui?.autoTranslateMessages);
    }

    isAutoTranslationRequestCurrent(requestOptions) {
        const versionCurrent = Number(requestOptions?.version ?? this.stateMachine.configVersion) === this.stateMachine.configVersion;
        if (!versionCurrent) return false;
        const routeKey = String(requestOptions?.routeKey || "");
        if (!routeKey) return true;
        const currentRouteKey = this.plugin.getCurrentRouteKey();
        if (routeKey === currentRouteKey) return true;
        return this.isSameAutoTranslationRouteScope(routeKey, currentRouteKey);
    }

    isAutoTranslationRenderRequestCurrent(requestOptions) {
        if (!requestOptions) return true;
        if (!this.plugin.isAutoTranslationRequestCurrent(requestOptions)) return false;
        const providerKey = String(requestOptions.providerKey || "");
        if (providerKey && !this.isAutoTranslationProviderSnapshotCurrent(providerKey, requestOptions)) return false;
        return true;
    }

    isSameAutoTranslationRouteScope(left, right) {
        const leftParts = String(left || "").split(":");
        const rightParts = String(right || "").split(":");
        const leftGuild = leftParts[0] || "";
        const leftChannel = leftParts[1] || "";
        const rightGuild = rightParts[0] || "";
        const rightChannel = rightParts[1] || "";
        return Boolean(leftChannel && rightChannel && leftGuild === rightGuild && leftChannel === rightChannel);
    }

    async autoTranslateQueuedMessage(item) {
        const startedAt = Date.now();
        let rendered = false;
        try {
            if (this.isAutoTranslationWorkCurrent(item)) this.plugin.renderPendingAutoTranslationLoadingSafely(item);
            const taskOptions = {
                heartbeat: () => this.heartbeatAutoTranslationInFlightItem(item),
                signal: this.getAutoTranslationAbortSignal()
            };
            const translated = await this.plugin.runAutoTranslationTask(item.text, item.requestOptions, taskOptions);
            if (this.isAutoTranslationWorkCurrent(item)) {
                this.plugin.logDiagnostic("auto.message", "success", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.VALIDATING, DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED),
                    key: this.plugin.getTextFingerprint(item.cacheKey),
                    sourceHash: this.plugin.getStrongTextFingerprint(item.text),
                    length: String(item.text || "").length,
                    ms: Date.now() - startedAt
                });
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "validating",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.VALIDATING,
                    DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED,
                    { ms: Date.now() - startedAt }
                );
                this.plugin.renderAutoTranslationResultSafely(item, translated, taskOptions.longTextPartialInfo
                    ? { partialInfo: taskOptions.longTextPartialInfo }
                    : undefined);
                rendered = true;
            }
        }
        catch (error) {
            if (this.isAutoTranslationWorkCurrent(item)) {
                this.plugin.logDiagnostic("auto.message", "error", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.FAILED, DIAGNOSTIC_REASON_CODES.FAILURE),
                    key: this.plugin.getTextFingerprint(item.cacheKey),
                    sourceHash: this.plugin.getStrongTextFingerprint(item.text),
                    type: this.getAutoTranslationFailureType(error),
                    ms: Date.now() - startedAt
                });
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "failed",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    DIAGNOSTIC_REASON_CODES.FAILURE,
                    { type: this.getAutoTranslationFailureType(error), ms: Date.now() - startedAt, validationQuality: error?.autoTranslationValidationQuality || "" }
                );
                this.markAutoTranslationFailureSafely(item, error);
            }
        }
        finally {
            const batchId = item?.daitBatchId || null;
            const finishedCurrent = this.finishAutoTranslationInFlightItem(item);
            if (batchId) {
                if (finishedCurrent) {
                    this.stateMachine.releaseInFlightItems(1);
                    this.stateMachine.releaseBatchKey(batchId, item.cacheKey, { forceFinishBatch: true });
                }
            }
            else if (finishedCurrent) {
                this.stateMachine.finishInFlightBatch({
                    batchSize: 1,
                    isPrefetch: Boolean(item.daitPrefetchRequest)
                });
            }
            if (!rendered && !item.daitRequeued && !this.hasActiveAutoTranslationKey(item.cacheKey)) {
                this.plugin.removeAutoTranslationLoadingForItem?.(item, { force: true });
            }
            delete item.daitBatchId;
            delete item.daitPrefetchRequest;
            if (this.plugin.isStarted && this.plugin.isAutoTranslationRequestCurrent(item.requestOptions)) {
                this.plugin.drainAutoTranslationQueue();
                this.plugin.queueScan();
            }
        }
    }

    async autoTranslateQueuedBatch(items) {
        const pending = new Set(items);
        const renderedItems = new Set();
        const startedAt = Date.now();
        const batchConfigVersion = Number(this.stateMachine.configVersion || 0);
        const batchResetVersion = Number(this.plugin.autoTranslationInFlightResetVersion || 0);
        const isPrefetchBatch = items.some(item => Boolean(item?.daitPrefetchRequest));
        const batchId = items.find(item => item?.daitBatchId)?.daitBatchId || null;
        let releasedEarlyCount = 0;
        const heartbeat = (targetItems = pending) => {
            const now = Date.now();
            targetItems.forEach(item => {
                if (item?.cacheKey && this.isAutoTranslationInFlightItemCurrent(item)) {
                    this.stateMachine.inFlightStartedAt.set(item.cacheKey, now);
                }
            });
        };
        const releaseBatchItem = item => {
            if (!item || !this.finishAutoTranslationInFlightItem(item)) return false;
            releasedEarlyCount++;
            this.stateMachine.releaseInFlightItems(1);
            if (batchId) this.stateMachine.releaseBatchKey(batchId, item.cacheKey);
            return true;
        };
        try {
            items.forEach(item => {
                if (this.isAutoTranslationWorkCurrent(item)) this.plugin.renderPendingAutoTranslationLoadingSafely(item);
            });

            let translations = [];
            let requestError = null;
            const taskOptions = {
                signal: this.getAutoTranslationAbortSignal(),
                heartbeat,
                releaseBatchItem
            };
            try {
                translations = await this.plugin.runAutoTranslationBatchTask(items.map(item => item.text), items[0]?.requestOptions, taskOptions);
            }
            catch (error) {
                if (!items.some(item => this.isAutoTranslationWorkCurrent(item))) {
                    pending.clear();
                }
                else if (this.plugin.shouldFallbackAutoTranslationBatchRequestError(error)) {
                    requestError = error;
                    this.plugin.logDiagnostic("auto.batch", "fallback", {
                        type: this.getAutoTranslationFailureType(error),
                        batchSize: items.length,
                        ms: Date.now() - startedAt
                    });
                }
                else if (!this.plugin.isAutoBatchFallbackError(error)) {
                    this.plugin.logDiagnostic("auto.batch", "error", {
                        type: this.getAutoTranslationFailureType(error),
                        batchSize: items.length,
                        ms: Date.now() - startedAt
                    });
                    if (this.shouldMarkAutoTranslationProviderFailureForItem(items[0], error)) {
                        this.plugin.markAutoTranslationProviderFailure(items[0]?.requestOptions, error);
                    }
                    pending.forEach(item => {
                        if (this.isAutoTranslationWorkCurrent(item)) {
                            this.logAutoTranslationMessageState(
                                "auto.message.state",
                                "failed",
                                item,
                                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                                DIAGNOSTIC_REASON_CODES.FAILURE,
                                { type: this.getAutoTranslationFailureType(error), ms: Date.now() - startedAt }
                            );
                            this.markAutoTranslationFailureSafely(item, error, { markProvider: false });
                        }
                    });
                    pending.clear();
                }
            }

            if (translations.length && items.some(item => this.isAutoTranslationWorkCurrent(item))) {
                let rendered = 0;
                let invalid = 0;
                const omittedIndexes = translations.omittedIndexes instanceof Set ? translations.omittedIndexes : null;
                items.forEach((item, index) => {
                    if (!this.isAutoTranslationWorkCurrent(item)) {
                        pending.delete(item);
                        return;
                    }
                    const { translated, invalidReason } = this.plugin.validateAutoTranslationBatchRow(item, translations[index]);
                    if (invalidReason) {
                        invalid++;
                        if (omittedIndexes?.has(index)) item.daitBatchRowOmitted = true;
                        this.logAutoTranslationMessageState(
                            "auto.message.state",
                            "retrying",
                            item,
                            DIAGNOSTIC_MESSAGE_STATES.RETRYING,
                            DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                            { batchSize: items.length, outputLength: translated.length, invalidReason }
                        );
                        item.daitLastInvalidReason = invalidReason;
                        return;
                    }
                    this.logAutoTranslationMessageState(
                        "auto.message.state",
                        "validating",
                        item,
                        DIAGNOSTIC_MESSAGE_STATES.VALIDATING,
                        DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED,
                        { batchSize: items.length, outputLength: translated.length }
                    );
                    this.plugin.renderAutoTranslationResultSafely(item, translated);
                    renderedItems.add(item);
                    pending.delete(item);
                    rendered++;
                });
                this.plugin.logDiagnostic("auto.batch", pending.size ? "partial" : "success", {
                    batchSize: items.length,
                    rendered,
                    invalid,
                    pending: pending.size,
                    ms: Date.now() - startedAt
                });
            }

            if (pending.size && requestError && !translations.length && !this.plugin.isAutoTranslationStrictRetryEnabled()) {
                this.settleFailedAutoTranslationBatchRequest(pending, requestError);
            }
            else if (pending.size && !this.plugin.isAutoTranslationStrictRetryEnabled()) {
                pending.forEach(item => {
                    if (this.isAutoTranslationWorkCurrent(item)) {
                        // When a model simply omits a message ID from a JSON batch array, retry that message once
                        // as a standalone request instead of marking it permanently failed for hours.
                        if (item.daitBatchRowOmitted && !item.daitSingleRequest) {
                            delete item.daitBatchRowOmitted;
                            item.daitSingleRequest = true;
                            this.plugin.requeueAutoTranslationItem(item, { allowActiveRequeue: true, preserveLoading: true });
                            pending.delete(item);
                            return;
                        }
                        this.logAutoTranslationMessageState(
                            "auto.message.state",
                            "failed",
                            item,
                            DIAGNOSTIC_MESSAGE_STATES.FAILED,
                            DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                            { strictRetry: false, invalidReason: item.daitLastInvalidReason || "invalid-output" }
                        );
                        this.markAutoTranslationFailureSafely(item, this.plugin.createFinalInvalidAutoTranslationError(item.daitLastInvalidReason || "invalid-output"));
                    }
                    pending.delete(item);
                });
            }
            else {
                const retryTaskOptions = {
                    ...taskOptions,
                    markRendered: item => renderedItems.add(item)
                };
                heartbeat(pending);
                await this.plugin.runAutoTranslationBatchRetryItems(pending, retryTaskOptions);
                heartbeat(pending);
                await this.plugin.runAutoTranslationFallbackItems(pending, retryTaskOptions);
            }

            pending.forEach(item => {
                if (this.isAutoTranslationWorkCurrent(item)) this.clearPendingAutoTranslationItemSafely(item);
                pending.delete(item);
            });
        }
        catch (error) {
            this.plugin.warnSanitized("Auto translation batch failed outside provider flow", error);
            this.plugin.logDiagnostic("auto.batch", "error", {
                type: this.getAutoTranslationFailureType(error),
                batchSize: items.length,
                pending: pending.size,
                ms: Date.now() - startedAt
            });
            pending.forEach(item => {
                if (this.isAutoTranslationWorkCurrent(item)) this.clearPendingAutoTranslationItemSafely(item);
            });
        }
        finally {
            const currentItems = items.filter(item => this.finishAutoTranslationInFlightItem(item));
            const sameConfigGeneration = Number(this.stateMachine.configVersion || 0) === batchConfigVersion;
            const sameResetVersion = Number(this.plugin.autoTranslationInFlightResetVersion || 0) === batchResetVersion;
            if (batchId) {
                if (currentItems.length) this.stateMachine.releaseInFlightItems(currentItems.length);
                if (sameConfigGeneration) {
                    currentItems.forEach(item => this.stateMachine.releaseBatchKey(batchId, item.cacheKey));
                    this.stateMachine.releaseBatchKey(batchId, "", { forceFinishBatch: true });
                }
                else {
                    this.stateMachine.inFlightBatches.delete(batchId);
                }
            }
            else if (sameConfigGeneration && (currentItems.length > 0 || (releasedEarlyCount === items.length && sameResetVersion))) {
                this.stateMachine.finishInFlightBatch({
                    batchSize: currentItems.length,
                    isPrefetch: isPrefetchBatch
                });
            }
            else if (currentItems.length) {
                this.stateMachine.releaseInFlightItems(currentItems.length);
            }
            items.forEach(item => {
                if (!renderedItems.has(item) && !item.daitRequeued && !this.hasActiveAutoTranslationKey(item.cacheKey)) {
                    this.plugin.removeAutoTranslationLoadingForItem?.(item, { force: true });
                }
                delete item.daitBatchId;
                delete item.daitBatchRowOmitted;
                delete item.daitRequeued;
                delete item.daitPrefetchRequest;
            });
            if (this.plugin.isStarted && this.plugin.isAutoTranslationRequestCurrent(items[0]?.requestOptions)) {
                this.plugin.drainAutoTranslationQueue();
                this.plugin.queueScan();
            }
        }
    }

    // A batch request that failed as a whole says nothing about each message's output, so it must
    // not end as a final invalid-output failure. An unusable batch reply (unreadable, empty or cut
    // off) is sent again as single requests; a request error (timeout, network, client error) gets
    // that error's own backoff, with the provider marked once for the whole batch.
    settleFailedAutoTranslationBatchRequest(pending, error) {
        const current = [...pending].filter(item => this.isAutoTranslationWorkCurrent(item));
        const formatError = this.isAutoTranslationBatchFormatError(error);
        this.plugin.logDiagnostic("auto.batch", formatError ? "single-fallback" : "request-failed", {
            type: this.getAutoTranslationFailureType(error),
            batchSize: pending.size,
            current: current.length
        });
        if (!formatError && current.length && this.shouldMarkAutoTranslationProviderFailureForItem(current[0], error)) {
            this.plugin.markAutoTranslationProviderFailure(current[0]?.requestOptions, error);
        }
        current.forEach(item => {
            pending.delete(item);
            if (formatError) {
                item.daitSingleRequest = true;
                this.plugin.requeueAutoTranslationItem(item, { allowActiveRequeue: true, preserveLoading: true });
                return;
            }
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "failed",
                item,
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.FAILURE,
                { type: this.getAutoTranslationFailureType(error), batchRequestFailed: true }
            );
            this.markAutoTranslationFailureSafely(item, error, { markProvider: false });
        });
    }

    isAutoTranslationBatchFormatError(error) {
        if (this.plugin.isAutoBatchFallbackError(error) || error?.modelOutputTruncated) return true;
        return this.getAutoTranslationFailureType(error) === "invalid-output";
    }

    requeueAutoTranslationItem(item, options = {}) {
        if (!item?.cacheKey) return;

        if (this.stateMachine.queue.some(queued => queued.cacheKey === item.cacheKey)) return;
        const delayMs = Math.max(0, Number(options.delayMs) || 0);
        const next = { ...item };
        delete next.priority;
        delete next.daitInFlightToken;
        delete next.daitBatchId;
        delete next.daitPrefetchRequest;
        delete next.daitRequeued;
        if (options.allowActiveRequeue) next.daitAllowActiveRequeue = true;
        if (delayMs) {
            next.daitRequeueAfter = Date.now() + delayMs;
            this.plugin.scheduleAutoTranslationRetryScan(delayMs);
        }
        else {
            delete next.daitRequeueAfter;
        }
        if (options.preserveLoading !== true) this.plugin.removeAutoTranslationLoadingForItem(next);
        if (this.enqueueAutoTranslationItem(next)) {
            item.daitRequeued = true;
            this.plugin.logDiagnostic("auto.queue.requeue", "ok", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(item, this.getAutoTranslationQueuedDiagnosticState(item), DIAGNOSTIC_REASON_CODES.REQUEUED),
                key: this.plugin.getTextFingerprint(item.cacheKey),
                delayMs,
                queueLength: this.stateMachine.queue.length
            });
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "requeued",
                item,
                this.getAutoTranslationQueuedDiagnosticState(item),
                DIAGNOSTIC_REASON_CODES.REQUEUED,
                { delayMs }
            );
        }
    }

    enqueueAutoTranslationItem(item, options = {}) {
        if (!item?.cacheKey) return false;
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return false;
        }
        if (!options.skipPrune) this.pruneAutoTranslationActiveState();
        const queuedItem = this.plugin.withAutoTranslationPriority(item);
        const allowActiveRequeue = Boolean(queuedItem.daitAllowActiveRequeue);
        delete queuedItem.daitAllowActiveRequeue;
        const existingIndex = this.stateMachine.queue.findIndex(queued => queued.cacheKey === queuedItem.cacheKey);
        if (existingIndex >= 0) {
            const existing = this.stateMachine.queue[existingIndex];
            this.stateMachine.queue[existingIndex] = (queuedItem.priority ?? Number.MAX_SAFE_INTEGER) < (existing.priority ?? Number.MAX_SAFE_INTEGER)
                ? { ...existing, ...queuedItem }
                : { ...queuedItem, ...existing };
            this.stateMachine.queuedKeys.add(queuedItem.cacheKey);
        }
        else if (this.hasActiveAutoTranslationKey(queuedItem.cacheKey) && !allowActiveRequeue) {
            this.plugin.logDiagnostic("auto.queue.enqueue", "dedupe-active", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(queuedItem, DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT, DIAGNOSTIC_REASON_CODES.DEDUPE_ACTIVE),
                key: this.plugin.getTextFingerprint(queuedItem.cacheKey)
            });
            return false;
        }
        else {
            this.stateMachine.enqueue(queuedItem, { allowDuplicateKey: allowActiveRequeue });
        }
        if (options.deferSort) this.stateMachine.queueSortDirty = true;
        else this.plugin.sortAutoTranslationQueue();
        this.plugin.logDiagnostic("auto.queue.enqueue", "ok", {
            ...this.plugin.getAutoTranslationDiagnosticMeta(queuedItem, this.getAutoTranslationQueuedDiagnosticState(queuedItem), DIAGNOSTIC_REASON_CODES.ENQUEUED),
            key: this.plugin.getTextFingerprint(queuedItem.cacheKey),
            queueLength: this.stateMachine.queue.length,
            priority: Math.round(Number(queuedItem.priority || 0))
        });
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "queued",
            queuedItem,
            this.getAutoTranslationQueuedDiagnosticState(queuedItem),
            DIAGNOSTIC_REASON_CODES.ENQUEUED,
            { priority: Math.round(Number(queuedItem.priority || 0)) }
        );
        return true;
    }

    hasActiveAutoTranslationKey(cacheKey) {
        this.pruneAutoTranslationActiveState();
        return Boolean(this.findActiveAutoTranslationKey(cacheKey));
    }

    // The key this message's work is queued, in flight or waiting to render under: the key itself or, for a
    // local server whose model is detected, the same key naming the model known when the work was queued.
    // (Work queued before the first detection is keyed with the "local-model" placeholder, and a scan after
    // it keys the same message with the served model.) "" when there is no such work.
    resolveActiveAutoTranslationKey(cacheKey) {
        this.pruneAutoTranslationActiveState();
        return this.findActiveAutoTranslationKey(cacheKey);
    }

    findActiveAutoTranslationKey(cacheKey) {
        if (!cacheKey) return "";
        const activeSets = [
            this.stateMachine.queuedKeys,
            this.stateMachine.inFlightKeys,
            this.stateMachine.renderPendingKeys
        ].filter(keys => keys?.size);
        if (activeSets.some(keys => keys.has(cacheKey))) return cacheKey;
        if (!activeSets.length) return "";
        if (!this.plugin.shouldAutoDetectLocalProviderModel(this.plugin.getEffectiveTaskConfig("translation"), DEFAULT_SETTINGS.translation || {})) return "";
        const wanted = this.getModelAgnosticAutoTranslationKey(cacheKey);
        if (!wanted) return "";
        for (const keys of activeSets) {
            for (const key of keys) {
                if (key !== cacheKey && this.getModelAgnosticAutoTranslationKey(key) === wanted) return key;
            }
        }
        return "";
    }

    getModelAgnosticAutoTranslationKey(cacheKey) {
        const parts = String(cacheKey || "").split("\n---\n");
        const index = parts.findIndex((part, position) => position > 0 && part.startsWith("model:") && parts[position - 1].startsWith("endpoint:"));
        if (index < 0) return "";
        parts[index] = "model:";
        return parts.join("\n---\n");
    }

    pruneAutoTranslationActiveState(now = Date.now()) {
        this.pruneAutoTranslationRenderPendingKeys();
        if (this.stateMachine.queuedKeys.size) {
            const queuedKeys = new Set(this.stateMachine.queue.map(item => item?.cacheKey).filter(Boolean));
            [...this.stateMachine.queuedKeys].forEach(key => {
                if (!queuedKeys.has(key) && !this.stateMachine.inFlightKeys.has(key) && !this.stateMachine.renderPendingKeys?.has?.(key)) {
                    this.stateMachine.queuedKeys.delete(key);
                    this.plugin.logDiagnostic("auto.queue.active", "prune", {
                        reason: "ghost-queued-key",
                        key: this.plugin.getTextFingerprint(key)
                    });
                }
            });
        }

        if (this.stateMachine.pendingTargets?.size) {
            for (const [cacheKey, entry] of this.stateMachine.pendingTargets) {
                if (this.stateMachine.queuedKeys.has(cacheKey)
                    || this.stateMachine.inFlightKeys.has(cacheKey)
                    || this.stateMachine.renderPendingKeys?.has?.(cacheKey)) {
                    continue;
                }
                const targets = entry?.targets || [];
                const connected = targets.filter(target => target?.messageNode?.isConnected && target?.content?.isConnected);
                if (!connected.length) this.stateMachine.pendingTargets.delete(cacheKey);
                else if (connected.length !== targets.length) this.stateMachine.pendingTargets.set(cacheKey, { targets: connected });
            }
        }

        if (!this.stateMachine.inFlightKeys.size) {
            this.stateMachine.inFlightStartedAt.clear();
            this.stateMachine.inFlightTokens.clear();
            this.stateMachine.inFlightBatches.clear();
            this.stateMachine.visibleLongInFlightKeys.clear();
            if (this.stateMachine.inFlight || this.stateMachine.inFlightItems || this.stateMachine.prefetchInFlight) {
                this.plugin.autoTranslationInFlightResetVersion = Number(this.plugin.autoTranslationInFlightResetVersion || 0) + 1;
                this.stateMachine.inFlight = 0;
                this.stateMachine.inFlightItems = 0;
                this.stateMachine.prefetchInFlight = 0;
            }
            return;
        }

        let removed = 0;
        let freedBatches = 0;
        const staleAfterMs = Math.max(AUTO_TRANSLATE_IN_FLIGHT_STALE_MS, AUTO_TRANSLATE_REQUEST_TIMEOUT_MS * 2);
        [...this.stateMachine.inFlightKeys].forEach(key => {
            const startedAt = Number(this.stateMachine.inFlightStartedAt.get(key) || 0);
            if (!startedAt) {
                this.stateMachine.inFlightStartedAt.set(key, now);
                return;
            }
            if (now - startedAt < staleAfterMs) return;
            this.stateMachine.inFlightKeys.delete(key);
            this.stateMachine.visibleLongInFlightKeys.delete(key);
            this.stateMachine.inFlightStartedAt.delete(key);
            this.stateMachine.inFlightTokens.delete(key);
            freedBatches += this.stateMachine.pruneKeyFromInFlightBatches(key);
            removed++;
            this.plugin.logDiagnostic("auto.queue.active", "prune", {
                reason: "stale-in-flight",
                key: this.plugin.getTextFingerprint(key),
                ageMs: now - startedAt
            });
        });

        if (!removed) return;
        this.stateMachine.inFlightItems = Math.min(this.stateMachine.inFlightItems, this.stateMachine.inFlightKeys.size);
        if (!this.stateMachine.inFlightKeys.size) {
            this.plugin.autoTranslationInFlightResetVersion = Number(this.plugin.autoTranslationInFlightResetVersion || 0) + 1;
            this.stateMachine.inFlightBatches.clear();
            this.stateMachine.inFlight = 0;
            this.stateMachine.inFlightItems = 0;
            this.stateMachine.prefetchInFlight = 0;
            this.stateMachine.visibleLongInFlightKeys.clear();
            return;
        }
        if (freedBatches > 0) {
            this.plugin.autoTranslationInFlightResetVersion = Number(this.plugin.autoTranslationInFlightResetVersion || 0) + 1;
        }
        const nextInFlight = Math.min(this.stateMachine.inFlight, this.stateMachine.inFlightKeys.size);
        if (nextInFlight !== this.stateMachine.inFlight) {
            this.plugin.autoTranslationInFlightResetVersion = Number(this.plugin.autoTranslationInFlightResetVersion || 0) + 1;
            this.stateMachine.inFlight = nextInFlight;
        }
        this.stateMachine.prefetchInFlight = Math.min(this.stateMachine.prefetchInFlight, this.stateMachine.inFlight);
    }

    pruneAutoTranslationRenderPendingKeys() {
        if (!this.stateMachine.renderPendingKeys?.size) return;
        const queuedCacheKeys = new Set(this.stateMachine.renderQueue.map(task => task?.cacheKey).filter(Boolean));
        [...this.stateMachine.renderPendingKeys].forEach(cacheKey => {
            if (!queuedCacheKeys.has(cacheKey)) this.stateMachine.renderPendingKeys.delete(cacheKey);
        });
    }

    getAutoTranslationRecentRenderKey(cacheKey, text, requestOptions = null) {
        if (!cacheKey) return "";
        const sourceSig = this.plugin.getStrongTextFingerprint(text || "");
        const routeKey = requestOptions?.routeKey || this.plugin.getCurrentRouteKey();
        return [
            this.plugin.getStrongTextFingerprint(cacheKey),
            sourceSig,
            this.plugin.getTextFingerprint(routeKey || "")
        ].join(":");
    }

    rememberRecentAutoTranslationRender(cacheKey, text, requestOptions = null, meta = {}) {
        const key = this.getAutoTranslationRecentRenderKey(cacheKey, text, requestOptions);
        if (!key) return;
        if (!this.stateMachine.recentRenders?.set) this.stateMachine.recentRenders = new Map();
        const now = Date.now();
        this.stateMachine.recentRenders.delete(key);
        this.stateMachine.recentRenders.set(key, {
            at: now,
            expiresAt: now + AUTO_TRANSLATE_RECENT_RENDER_TTL_MS,
            validationQuality: meta.validationQuality || "",
            validationReason: meta.validationReason || ""
        });
        this.pruneRecentAutoTranslationRenders(now);
    }

    getRecentAutoTranslationRender(cacheKey, text, requestOptions = null, now = Date.now()) {
        const key = this.getAutoTranslationRecentRenderKey(cacheKey, text, requestOptions);
        if (!key || !this.stateMachine.recentRenders?.has?.(key)) return null;
        const entry = this.stateMachine.recentRenders.get(key);
        if (!entry || Number(entry.expiresAt || 0) <= now) {
            this.stateMachine.recentRenders.delete(key);
            return null;
        }
        return entry;
    }

    pruneRecentAutoTranslationRenders(now = Date.now()) {
        const map = this.stateMachine.recentRenders;
        if (!map?.size) return;
        // Fixed TTL + delete-before-set guarantees oldest-expiry entries are first.
        for (const [key, entry] of map) {
            if (Number(entry?.expiresAt || 0) <= now) map.delete(key);
            else break;
        }
        while (map.size > AUTO_TRANSLATE_RECENT_RENDER_MAX) {
            map.delete(map.keys().next().value);
        }
    }

    // Partial results (for example a long message with a failed chunk) must not enter the
    // persistent cache, but are kept here briefly so a rebuilt or prefetched message is redrawn
    // instead of requested again. A complete cached result replaces them.
    rememberAutoTranslationPartialResult(cacheKey, text, translated, meta = {}) {
        const key = String(cacheKey || "");
        const value = String(translated || "").trim();
        if (!key || !value) return;
        if (!this.plugin.autoTranslationPartialResults?.set) this.plugin.autoTranslationPartialResults = new Map();
        const now = Date.now();
        const partialInfo = meta.partialInfo && typeof meta.partialInfo === "object"
            ? {
                missingSegments: Array.isArray(meta.partialInfo.missingSegments) ? [...meta.partialInfo.missingSegments] : [],
                totalSegments: Number(meta.partialInfo.totalSegments || 0) || 0
            }
            : null;
        this.plugin.autoTranslationPartialResults.delete(key);
        this.plugin.autoTranslationPartialResults.set(key, {
            sourceSig: this.plugin.getStrongTextFingerprint(text),
            translated: value,
            partialInfo,
            validationQuality: String(meta.validationQuality || ""),
            validationReason: String(meta.validationReason || ""),
            at: now,
            expiresAt: now + AUTO_TRANSLATE_PARTIAL_RESULT_TTL_MS
        });
        this.pruneAutoTranslationPartialResults(now);
    }

    getAutoTranslationPartialResult(cacheKey, text, now = Date.now()) {
        const key = String(cacheKey || "");
        const entry = key ? this.plugin.autoTranslationPartialResults?.get?.(key) : null;
        if (!entry) return null;
        if (Number(entry.expiresAt || 0) <= now || entry.sourceSig !== this.plugin.getStrongTextFingerprint(text)) {
            this.plugin.autoTranslationPartialResults.delete(key);
            return null;
        }
        return entry;
    }

    // A partial line that is still shown keeps its kept result alive (and last to be pruned), so a
    // rebuilt message is redrawn from it instead of requested again.
    touchAutoTranslationPartialResult(cacheKey, text, now = Date.now()) {
        const entry = this.getAutoTranslationPartialResult(cacheKey, text, now);
        if (!entry) return null;
        entry.expiresAt = now + AUTO_TRANSLATE_PARTIAL_RESULT_TTL_MS;
        this.plugin.autoTranslationPartialResults.delete(String(cacheKey));
        this.plugin.autoTranslationPartialResults.set(String(cacheKey), entry);
        return entry;
    }

    clearAutoTranslationPartialResult(...cacheKeys) {
        if (!this.plugin.autoTranslationPartialResults?.size) return;
        cacheKeys.forEach(cacheKey => {
            if (cacheKey) this.plugin.autoTranslationPartialResults.delete(String(cacheKey));
        });
    }

    pruneAutoTranslationPartialResults(now = Date.now()) {
        const results = this.plugin.autoTranslationPartialResults;
        if (!results?.size) return;
        for (const [key, entry] of [...results.entries()]) {
            if (Number(entry?.expiresAt || 0) <= now) results.delete(key);
        }
        while (results.size > AUTO_TRANSLATE_PARTIAL_RESULT_MAX) {
            results.delete(results.keys().next().value);
        }
    }

    // Every request made for queued auto-translation work carries this signal. A full invalidation
    // orphans that work and aborts the signal; work started afterwards gets a fresh one.
    getAutoTranslationAbortSignal() {
        this.plugin.autoTranslationLastRouteKey ||= this.plugin.getCurrentRouteKey();
        if (typeof AbortController === "undefined") return undefined;
        if (!this.plugin.autoTranslationAbortController || this.plugin.autoTranslationAbortController.signal.aborted) {
            this.plugin.autoTranslationAbortController = new AbortController();
        }
        return this.plugin.autoTranslationAbortController.signal;
    }

    abortAutoTranslationRequests(reason = "invalidated") {
        const controller = this.plugin.autoTranslationAbortController;
        this.plugin.autoTranslationAbortController = null;
        if (!controller || controller.signal.aborted) return false;
        const inFlight = Number(this.stateMachine.inFlight || 0);
        try {
            controller.abort();
        }
        catch {}
        if (inFlight) this.plugin.logDiagnostic("auto.queue.abort", "ok", { reason, inFlight });
        return true;
    }

    createAutoTranslationInFlightToken(cacheKey = "") {
        this.stateMachine.inFlightTokenCounter++;
        return `${Date.now().toString(36)}:${this.stateMachine.inFlightTokenCounter.toString(36)}:${this.plugin.getTextFingerprint(cacheKey)}`;
    }

    markAutoTranslationInFlightItem(item, startedAt = Date.now()) {
        if (!item?.cacheKey) return;
        const token = this.createAutoTranslationInFlightToken(item.cacheKey);
        this.stateMachine.markInFlightItem(item, {
            token,
            startedAt,
            isVisibleLong: this.plugin.isLongAutoTranslationItem(item) && !this.plugin.isAutoTranslationPrefetchItem(item)
        });
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "in-flight",
            item,
            DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
            DIAGNOSTIC_REASON_CODES.REQUEST_STARTED,
            { startedAt }
        );
    }

    heartbeatAutoTranslationInFlightItem(item, now = Date.now()) {
        if (!this.isAutoTranslationInFlightItemCurrent(item)) return false;
        this.stateMachine.inFlightStartedAt.set(item.cacheKey, now);
        return true;
    }

    isAutoTranslationInFlightItemCurrent(item) {
        if (!item?.cacheKey || !this.isAutoTranslationRenderRequestCurrent(item.requestOptions)) return false;
        if (!this.stateMachine.inFlightKeys.has(item.cacheKey)) return false;
        if (!item.daitInFlightToken) return !this.stateMachine.inFlightTokens.has(item.cacheKey);
        return this.stateMachine.inFlightTokens.get(item.cacheKey) === item.daitInFlightToken;
    }

    isAutoTranslationInFlightTokenOwned(item) {
        if (!item?.cacheKey || !this.stateMachine.inFlightKeys.has(item.cacheKey)) return false;
        if (!item.daitInFlightToken) return !this.stateMachine.inFlightTokens.has(item.cacheKey);
        return this.stateMachine.inFlightTokens.get(item.cacheKey) === item.daitInFlightToken;
    }

    isAutoTranslationWorkCurrent(item) {
        if (!item?.daitInFlightToken) return this.isAutoTranslationRenderRequestCurrent(item?.requestOptions);
        return this.isAutoTranslationInFlightItemCurrent(item);
    }

    finishAutoTranslationInFlightItem(item) {
        const owned = this.isAutoTranslationInFlightTokenOwned(item);
        if (owned) {
            this.stateMachine.finishInFlightItem(item.cacheKey, item.daitInFlightToken, {
                keepQueuedKey: Boolean(item.daitRequeued)
            });
        }
        delete item.daitInFlightToken;
        return owned;
    }

    promoteQueuedAutoTranslationItem(cacheKey, target) {
        const index = this.stateMachine.queue.findIndex(item => item.cacheKey === cacheKey);
        if (index < 0) return;
        const candidate = { ...this.stateMachine.queue[index], ...target };
        delete candidate.priority;
        const promoted = this.plugin.withAutoTranslationPriority(candidate);
        if ((promoted.priority ?? Number.MAX_SAFE_INTEGER) >= (this.stateMachine.queue[index].priority ?? Number.MAX_SAFE_INTEGER)) return;
        this.stateMachine.queue[index] = promoted;
        this.plugin.sortAutoTranslationQueue();
        this.plugin.logDiagnostic("auto.queue.promote", "ok", {
            key: this.plugin.getTextFingerprint(cacheKey),
            priority: Math.round(Number(promoted.priority || 0))
        });
    }

    makeRoomForAutoTranslationItem(item, queueLimit) {
        return this.plugin.translationScheduler.makeRoomForItem(item, queueLimit);
    }

    sortAutoTranslationQueue(context = null) {
        this.stateMachine.queueSortDirty = false;
        this.plugin.translationScheduler.sortQueue(this.stateMachine.queue, context);
    }

    withAutoTranslationPriority(target, options = {}) {
        if (!target) return target;
        const priority = options.preserveExisting && Number.isFinite(Number(target.priority))
            ? Number(target.priority)
            : this.getAutoTranslationTargetPriority(target, options.context || null);
        return { ...target, priority };
    }

    getAutoTranslationTargetPriority(target, context = null) {
        const contentPriority = this.plugin.getViewportPriority(target?.content, context);
        const messagePriority = this.plugin.getViewportPriority(target?.messageNode, context);
        const kindOffset = target?.targetKind === "reply-preview" ? 20 : 0;
        return Math.min(contentPriority, messagePriority) + kindOffset;
    }

    cacheAutoTranslationResult(item, translated) {
        this.cacheAutoTranslationResultWithOptions(item?.cacheKey, item?.text, item?.requestOptions, translated);
    }

    cacheAutoTranslationResultWithOptions(cacheKey, text, requestOptions, translated) {
        if (!cacheKey || !text || !requestOptions) return;
        translated = this.plugin.sanitizeAutoTranslationOutput(text, translated, this.plugin.getAutoTranslationTargetLanguage(requestOptions), this.plugin.getAutoTranslationOutputValidationOptions(text, translated, requestOptions));
        if (this.plugin.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) {
            this.plugin.deleteTranslationCacheCandidates(
                cacheKey,
                ...this.plugin.getTranslationCacheAliases(text, requestOptions),
                this.plugin.getAutoTextTranslationCacheKey(text, requestOptions),
                ...this.plugin.getAutoTextTranslationCacheAliases(text, requestOptions)
            );
            this.plugin.logDiagnostic("cache.set", "reject-invalid-auto-output", {
                cacheHash: this.plugin.getTextFingerprint(cacheKey),
                sourceHash: this.plugin.getStrongTextFingerprint(text),
                valueLength: String(translated || "").length
            });
            return;
        }
        const servedKey = this.plugin.getServedModelTranslationCacheKey(cacheKey, requestOptions);
        this.plugin.setTranslationCache(servedKey, translated);
        this.clearAutoTranslationPartialResult(cacheKey, servedKey !== cacheKey ? servedKey : "");
        if (this.plugin.shouldStoreAutoTextTranslationCache(text, requestOptions, translated)) {
            this.plugin.setAutoTextTranslationCache(text, requestOptions, translated);
        }
        else {
            this.plugin.logDiagnostic("cache.set", "skip-text-cache-partial", {
                cacheHash: this.plugin.getTextFingerprint(cacheKey),
                sourceHash: this.plugin.getStrongTextFingerprint(text),
                valueLength: String(translated || "").length
            });
        }
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "cached",
            { cacheKey, text, requestOptions },
            DIAGNOSTIC_MESSAGE_STATES.CACHED,
            DIAGNOSTIC_REASON_CODES.CACHE_HIT,
            { valueLength: String(translated || "").length }
        );
        this.clearAutoTranslationFailure(cacheKey, requestOptions);
        if (servedKey && servedKey !== cacheKey) this.clearAutoTranslationFailure(servedKey, requestOptions);
        this.plugin.clearAutoTextTranslationFailure(text, requestOptions);
    }

    hasCacheableAutoTranslationTarget(item) {
        return this.getAutoTranslationPendingTargets(item).some(target => {
            if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
            if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) return false;
            return this.plugin.isAutoTranslationTargetIdentityCurrent(target, item)
                || Boolean(this.getAutoTranslationTargetIdentityUpgrade(target, item));
        });
    }

    hasInvalidAutoTranslationTarget(item) {
        return this.getAutoTranslationPendingTargets(item).some(target => {
            if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
            // A message that changed meanwhile does not make the result wrong: it is still the
            // translation of item.text (renderAutoTranslationResult caches it too).
            if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) return false;
            return !this.plugin.isAutoTranslationTargetIdentityCurrent(target, item)
                && !this.getAutoTranslationTargetIdentityUpgrade(target, item);
        });
    }

    shouldCacheAutoTranslationResultFromRequest(item) {
        if (!item?.cacheKey || !item?.text || !item?.requestOptions) return false;
        if (!this.plugin.isAutoTranslationRequestCurrent(item.requestOptions)) return false;
        if (!this.plugin.isVolatileTranslationCacheKey(item.cacheKey)) return true;
        return Boolean(this.plugin.getAutoTextTranslationCacheKey(item.text, item.requestOptions));
    }

    cacheAutoTranslationIdentityUpgrades(item, translated) {
        this.getAutoTranslationPendingTargets(item).forEach(target => {
            const upgrade = this.getAutoTranslationTargetIdentityUpgrade(target, item);
            if (upgrade?.cacheKey) this.cacheAutoTranslationResultWithOptions(upgrade.cacheKey, item.text, upgrade.requestOptions, translated);
        });
    }

    getAutoTranslationTargetIdentityUpgrade(target, item = {}) {
        if (!target?.messageNode || !target?.content) return null;
        const text = target.text || item.text || "";
        const requestOptions = target?.requestOptions || item?.requestOptions || {};
        const expected = this.plugin.normalizeTranslationMessageIdentity(requestOptions.messageIdentity);
        if (!expected || !text) return null;
        // The identity describes the message on screen; the cache key keeps the request text.
        const domText = this.plugin.getAutoTranslationTargetDomText(target.text ? target : item);
        const current = this.plugin.normalizeTranslationMessageIdentity(this.plugin.getMessageIdentity(target.messageNode, target.content, domText));
        if (!current || current === expected || !this.plugin.isSafeTranslationIdentityUpgrade(expected, current, target)) return null;
        const upgradedOptions = { ...requestOptions, messageIdentity: current };
        return {
            identity: current,
            requestOptions: upgradedOptions,
            cacheKey: this.plugin.getTranslationCacheKey(text, upgradedOptions)
        };
    }

    isAutoTranslationTargetIdentityCurrent(target, item = {}) {
        const requestOptions = target?.requestOptions || item?.requestOptions || {};
        const expected = this.plugin.normalizeTranslationMessageIdentity(requestOptions.messageIdentity);
        if (!expected) return true;
        const current = this.plugin.normalizeTranslationMessageIdentity(this.plugin.getMessageIdentity(target.messageNode, target.content, this.plugin.getAutoTranslationTargetDomText(target)));
        return current === expected;
    }

    markAutoTranslationFailureSafely(item, error, options = {}) {
        try {
            this.plugin.markAutoTranslationFailure(item, error, options);
            return true;
        }
        catch (renderError) {
            this.plugin.warnSanitized("Failed to render auto translation failure", renderError);
            const failure = this.createAutoTranslationFailure(item.cacheKey, error);
            let retained = false;
            if (this.shouldRetainAutoTranslationFailureItem(item, error, failure)) {
                retained = this.retainBlockedVisibleAutoTranslationItem(item, {
                    delayMs: failure.retryAfterMs,
                    allowActiveRequeue: true,
                    reasonCode: this.getAutoTranslationFailureType(error) === "local-unavailable"
                        ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE
                        : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN
                });
            }
            this.cooldowns.failures.set(item.cacheKey, failure);
            this.pruneAutoTranslationFailureMapSize();
            if (retained) {
                this.rememberAutoTranslationFailureHistory(item.cacheKey, failure);
            }
            else {
                this.plugin.markAutoTextTranslationFailure(item, error, failure);
            }
            if (options.markProvider !== false) {
                const retainedKeys = retained && item?.cacheKey ? new Set([item.cacheKey]) : new Set();
                this.plugin.markAutoTranslationProviderFailure(item.requestOptions, error, failure, { skipCacheKeys: retainedKeys });
            }
            if (!failure.terminal) this.plugin.scheduleAutoTranslationRetryScan(failure.retryAfterMs);
            if (!retained) this.plugin.showAutoTranslateError(error);
            return false;
        }
    }

    clearPendingAutoTranslationItemSafely(item) {
        try {
            this.plugin.clearPendingAutoTranslationItem(item);
            return true;
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to clear pending auto translation", error);
            this.clearAutoTranslationPendingTargets(item?.cacheKey);
            return false;
        }
    }

    clearPendingAutoTranslationItem(item) {
        this.consumeAutoTranslationTargets(item).forEach(target => {
            this.plugin.removeAutoTranslationLoadingNode(target, item.cacheKey, { force: true });
            this.plugin.removeAutoTranslationNode(target, item.cacheKey);
        });
    }

    clearAutoTranslationFailure(cacheKey, requestOptions = this.plugin.getAutoTranslationOptions(), options = {}) {
        if (cacheKey) {
            this.cooldowns.failures.delete(cacheKey);
            this.cooldowns.failureHistory.delete(cacheKey);
        }
        if (options.clearProvider) {
            const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
            if (providerKey) this.cooldowns.providerFailures.delete(providerKey);
        }
    }

    markAutoTranslationFailure(item, error, options = {}) {
        if (this.plugin.isAbandonedTranslationError(error)) {
            this.clearPendingAutoTranslationItemSafely(item);
            return;
        }
        const storageError = this.getAutoTranslationStorageErrorForItem(item, error);
        const failure = this.createAutoTranslationFailure(item.cacheKey, storageError);
        storageError.autoTranslationFailureCount = failure.count;
        this.consumeAutoTranslationTargets(item).forEach(target => {
            if (this.plugin.shouldRenderAutoTranslationFailure(storageError)) {
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "failed",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    DIAGNOSTIC_REASON_CODES.FAILURE,
                    {
                        type: this.getAutoTranslationFailureType(storageError),
                        renderFailure: true,
                        invalidReason: storageError?.autoTranslationInvalidReason || "",
                        validationQuality: storageError?.autoTranslationValidationQuality || ""
                    }
                );
                this.plugin.renderAutoTranslationFailure(target, item.cacheKey, storageError);
                return;
            }
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "failed",
                { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.FAILURE,
                {
                    type: this.getAutoTranslationFailureType(storageError),
                    renderFailure: false,
                    invalidReason: storageError?.autoTranslationInvalidReason || "",
                    validationQuality: storageError?.autoTranslationValidationQuality || ""
                }
            );
            this.plugin.removeAutoTranslationLoadingNode(target, item.cacheKey, { force: true });
            this.plugin.removeAutoTranslationNode(target, item.cacheKey);
        });
        this.cooldowns.failures.set(item.cacheKey, failure);
        this.pruneAutoTranslationFailureMapSize();
        this.plugin.markAutoTextTranslationFailure(item, storageError, failure);
        const retainedKeys = new Set();
        if (this.shouldRetainAutoTranslationFailureItem(item, error, failure)) {
            const retained = this.retainBlockedVisibleAutoTranslationItem(item, {
                delayMs: failure.retryAfterMs,
                allowActiveRequeue: true,
                reasonCode: this.getAutoTranslationFailureType(error) === "local-unavailable"
                    ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE
                    : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN
            });
            if (retained && item?.cacheKey) retainedKeys.add(item.cacheKey);
        }
        if (item?.cacheKey && retainedKeys.has(item.cacheKey)) {
            // The retained item retries on its own delay, but its count must survive so the
            // next failure backs off further.
            this.rememberAutoTranslationFailureHistory(item.cacheKey, failure);
            this.plugin.clearAutoTextTranslationFailure(item.text, item.requestOptions);
        }
        if (this.shouldMarkAutoTranslationProviderFailureForItem(item, error, options)) this.plugin.markAutoTranslationProviderFailure(item.requestOptions, error, failure, { skipCacheKeys: retainedKeys });
        if (!failure.terminal) this.plugin.scheduleAutoTranslationRetryScan(failure.retryAfterMs);
        if (!storageError?.autoTranslationWeakFailure) this.plugin.showAutoTranslateError(error);
    }

    // A result that cannot be drawn (its emoji images cannot be restored) is recorded as a final
    // invalid output, so the scan does not request the same message again on every pass.
    // The auto-text cache holds the same result under the text alone; it is dropped too, otherwise
    // the scan would draw it again from there (clearing this failure) on every pass.
    markAutoTranslationUndrawableResult(cacheKey, reason = "emoji-restore-failed", source = null) {
        const key = String(cacheKey || "");
        if (!key) return null;
        if (source?.text && source?.requestOptions) {
            this.plugin.deleteTranslationCacheCandidates(
                this.plugin.getAutoTextTranslationCacheKey(source.text, source.requestOptions),
                ...this.plugin.getAutoTextTranslationCacheAliases(source.text, source.requestOptions)
            );
        }
        const failure = this.createAutoTranslationFailure(key, this.plugin.createFinalInvalidAutoTranslationError(reason));
        this.cooldowns.failures.set(key, failure);
        this.pruneAutoTranslationFailureMapSize();
        this.clearAutoTranslationPartialResult(key);
        return failure;
    }

    getAutoTranslationStorageErrorForItem(item, error) {
        if (!item?.daitPrefetchRequest || !this.isWeakAutoTranslationPrefetchFailure(error)) return error;
        const storageError = new Error(error?.message || this.plugin.t("autoTranslateTargetFailed"));
        storageError.autoTranslationFinalInvalidOutput = Boolean(error?.autoTranslationFinalInvalidOutput);
        storageError.autoTranslationTerminalFailure = Boolean(error?.autoTranslationTerminalFailure);
        storageError.autoTranslationInvalidReason = error?.autoTranslationInvalidReason || this.getAutoTranslationFailureType(error) || "invalid-output";
        storageError.autoTranslationWeakFailure = true;
        // Keep the truncated type so its growing backoff applies to prefetch too.
        if (error?.modelOutputTruncated) storageError.modelOutputTruncated = true;
        if (["timeout", "network", "server"].includes(this.getAutoTranslationFailureType(error))) {
            // A slow or failing provider is not a bad answer: the weak failure waits longer with each
            // repeat instead of sending the same (billed) prefetch request again every few seconds.
            const count = this.getNextAutoTranslationFailureCount(item.cacheKey);
            storageError.retryAfterMs = Math.min(
                AUTO_TRANSLATE_FAILURE_MAX_TTL,
                Math.max(Number(error?.retryAfterMs || 0), AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL * Math.pow(2, Math.max(0, count - 1)))
            );
            return storageError;
        }
        storageError.retryAfterMs = Math.min(
            storageError.autoTranslationTerminalFailure ? AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL : AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
            Math.max(1000, Number(error?.retryAfterMs || AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL))
        );
        return storageError;
    }

    isWeakAutoTranslationPrefetchFailure(error) {
        return ["invalid-output", "timeout", "network", "server", "rate-limit", "local-unavailable", "truncated"].includes(this.getAutoTranslationFailureType(error));
    }

    pruneAutoTranslationFailureMapSize(now = Date.now()) {
        if (this.cooldowns.failures.size <= AUTO_TRANSLATE_FAILURE_LIMIT) return;
        for (const [key, failure] of this.cooldowns.failures.entries()) {
            if (this.isAutoTranslationFailureExpired(failure, now)
                || this.cooldowns.failures.size > AUTO_TRANSLATE_FAILURE_LIMIT) {
                this.cooldowns.failures.delete(key);
            }
            if (this.cooldowns.failures.size <= AUTO_TRANSLATE_FAILURE_LIMIT) break;
        }
    }

    shouldMarkAutoTranslationProviderFailureForItem(item, error, options = {}) {
        if (options.markProvider === false) return false;
        if (!item?.daitPrefetchRequest) return true;
        return this.isProviderWideAutoTranslationPrefetchFailure(error);
    }

    isProviderWideAutoTranslationPrefetchFailure(error) {
        return ["auth", "quota", "rate-limit", "client", "local-unavailable"].includes(this.getAutoTranslationFailureType(error));
    }

    markAutoTranslationProviderFailure(requestOptions, error, itemFailure = null, options = {}) {
        const result = this.plugin.translationScheduler.markProviderFailure(requestOptions, error, itemFailure, options);
        this.ctx.events?.emit("auto:provider-failure", { requestOptions, error, result });
        return result;
    }

    getAutoTranslationProviderFailure(requestOptions = this.plugin.getAutoTranslationOptions()) {
        return this.plugin.translationScheduler.getProviderFailure(requestOptions);
    }

    isAutoTranslationProviderCoolingDown(requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        return this.plugin.translationScheduler.isProviderCoolingDown(requestOptions, now);
    }

    // The count the next failure of this message gets: one more than its live record or its
    // remembered history, capped at the total automatic retry budget.
    getNextAutoTranslationFailureCount(cacheKey) {
        const previous = this.cooldowns.failures.get(cacheKey);
        const previousCount = typeof previous === "object" ? Number(previous.count || 0) : 0;
        const historyCount = this.getAutoTranslationFailureHistoryCount(cacheKey);
        return Math.min(AUTO_TRANSLATE_MAX_RETRY_ATTEMPTS, Math.max(previousCount, historyCount) + 1);
    }

    createAutoTranslationFailure(cacheKey, error) {
        const count = this.getNextAutoTranslationFailureCount(cacheKey);
        const type = this.getAutoTranslationFailureType(error);
        const backoffCount = Math.min(5, count);
        const retryAfterMs = this.getAutoTranslationRetryAfter(error, backoffCount);
        const now = Date.now();
        const immediateTerminal = AUTO_TRANSLATE_IMMEDIATE_TERMINAL_TYPES.includes(type)
            && !this.plugin.isGoogleTranslatePoolServing?.(error);
        const budgetExhausted = count >= AUTO_TRANSLATE_MAX_RETRY_ATTEMPTS;
        const terminal = Boolean(error?.autoTranslationTerminalFailure || immediateTerminal || budgetExhausted);
        const failure = {
            at: now,
            count,
            retryAfterMs,
            retryAt: terminal ? 0 : now + retryAfterMs,
            type,
            terminal,
            budgetExhausted: Boolean(budgetExhausted && !error?.autoTranslationTerminalFailure),
            weak: Boolean(error?.autoTranslationWeakFailure),
            invalidReason: String(error?.autoTranslationInvalidReason || "")
        };
        if (error && typeof error === "object") error.autoTranslationFailureCount = count;
        this.plugin.logDiagnostic("auto.failure", failure.terminal ? "terminal" : "retry", {
            key: this.plugin.getTextFingerprint(cacheKey),
            type: failure.type,
            count,
            retryAfterMs,
            budgetExhausted: failure.budgetExhausted,
            invalidReason: failure.invalidReason
        });
        return failure;
    }

    rememberAutoTranslationFailureHistory(cacheKey, failure) {
        const key = String(cacheKey || "");
        if (!key || !failure || typeof failure !== "object") return;
        const count = Number(failure.count || 0);
        if (count <= 0) return;
        const now = Date.now();
        this.cooldowns.failureHistory.set(key, {
            count,
            at: now,
            type: String(failure.type || "")
        });
        if (this.cooldowns.failureHistory.size <= AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT) return;
        for (const [entryKey, entry] of this.cooldowns.failureHistory.entries()) {
            if (now - Number(entry?.at || 0) > AUTO_TRANSLATE_FAILURE_HISTORY_TTL
                || this.cooldowns.failureHistory.size > AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT) {
                this.cooldowns.failureHistory.delete(entryKey);
            }
            if (this.cooldowns.failureHistory.size <= AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT) break;
        }
    }

    getAutoTranslationFailureHistoryCount(cacheKey, now = Date.now()) {
        const key = String(cacheKey || "");
        if (!key) return 0;
        const history = this.cooldowns.failureHistory.get(key);
        if (!history) return 0;
        if (now - Number(history.at || 0) > AUTO_TRANSLATE_FAILURE_HISTORY_TTL) {
            this.cooldowns.failureHistory.delete(key);
            return 0;
        }
        return Math.max(0, Number(history.count || 0) || 0);
    }

    isAutoTranslationFailureExpired(failure, now = Date.now()) {
        if (!failure) return true;
        if (typeof failure === "number") return now - failure >= AUTO_TRANSLATE_FAILURE_TTL;
        if (this.isTerminalAutoTranslationFailure(failure) && !Number(failure.retryAt || 0)) {
            // Terminal failures block retries for a long-but-finite window so the map
            // cannot grow forever across a multi-hour session.
            return now - Number(failure.at || 0) >= AUTO_TRANSLATE_TERMINAL_FAILURE_TTL;
        }
        return now >= Number(failure.retryAt || 0);
    }

    getAutoTranslationFailureRemainingMs(failure, now = Date.now()) {
        if (!failure) return 0;
        if (typeof failure === "number") return Math.max(0, AUTO_TRANSLATE_FAILURE_TTL - (now - failure));
        return Math.max(0, Number(failure.retryAt || 0) - now);
    }

    isTerminalAutoTranslationFailure(failure) {
        return Boolean(failure && typeof failure === "object" && failure.terminal);
    }

    getAutoTranslationFailureTypeFromRecord(failure) {
        return failure && typeof failure === "object" ? String(failure.type || "") : "";
    }

    getAutoTranslationFailure(cacheKey) {
        const key = String(cacheKey || "");
        if (!key) return null;
        const failure = this.cooldowns.failures.get(key);
        if (failure && this.isAutoTranslationFailureExpired(failure)) {
            this.rememberAutoTranslationFailureHistory(key, failure);
            this.cooldowns.failures.delete(key);
            return null;
        }
        return failure || null;
    }

    getAutoTranslationRetryAfter(error, count = 1) {
        const type = this.getAutoTranslationFailureType(error);
        // A truncated output normally reaches this point after a retry with a larger max_tokens, so
        // its fixed provider hint (a few seconds) is ignored and the wait doubles with each failure.
        if (type === "truncated") {
            return Math.min(AUTO_TRANSLATE_TRUNCATED_FAILURE_MAX_TTL, AUTO_TRANSLATE_TRUNCATED_FAILURE_TTL * Math.pow(2, Math.max(0, count - 1)));
        }
        if (Number(error?.retryAfterMs) > 0) return Math.min(AUTO_TRANSLATE_FAILURE_MAX_TTL, Number(error.retryAfterMs));
        if (type === "local-unavailable") return LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS;
        if (["quota", "rate-limit", "server", "parse"].includes(type)) {
            return Math.min(AUTO_TRANSLATE_FAILURE_MAX_TTL, AUTO_TRANSLATE_PROVIDER_FAILURE_TTL * Math.pow(2, Math.max(0, count - 1)));
        }
        if (["timeout", "network"].includes(type)) {
            return Math.min(AUTO_TRANSLATE_FAILURE_MAX_TTL, AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL * Math.pow(2, Math.max(0, count - 1)));
        }
        if (type === "invalid-output") {
            if (error?.autoTranslationFinalInvalidOutput) return AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL;
            return Math.min(AUTO_TRANSLATE_FAILURE_TTL, AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL * Math.pow(2, Math.max(0, count - 1)));
        }
        return Math.min(AUTO_TRANSLATE_FAILURE_MAX_TTL, AUTO_TRANSLATE_FAILURE_TTL * Math.pow(2, Math.max(0, count - 1)));
    }

    getAutoTranslationFailureType(error) {
        if (this.plugin.isAbandonedTranslationError(error)) return "cancelled";
        if (Object.hasOwn(API_ENDPOINT_ERROR_MESSAGE_KEYS, error?.code)) return "client";
        const status = Number(error?.status || 0);
        if (error?.modelOutputTruncated) return "truncated";
        if (error?.localProviderUnavailable) return "local-unavailable";
        if (error?.providerQuotaExceeded) return "quota";
        if (error?.providerRateLimited) return "rate-limit";
        if (error?.providerAuthFailed) return "auth";
        if (error?.providerServerError) return "server";
        if (error?.providerParseFailed) return "parse";
        if (error?.googleTranslateQuotaExceeded) return "quota";
        if (error?.googleTranslateNoKey) return "auth";
        if (status === 401 || status === 403) return "auth";
        // 402 Payment Required (e.g. DeepSeek "Insufficient Balance"), 456 DeepL quota,
        // or OpenAI-compatible 429 with explicit insufficient_quota / billing exhaustion.
        if (status === 402 || status === 456) return "quota";
        const errorText = `${String(error?.apiErrorCode || error?.code || "")} ${String(error?.message || "")}`;
        if (status === 429 && /insufficient_quota|exceeded your current quota|billing.*quota|quota.*exhausted/i.test(errorText)) {
            return "quota";
        }
        if (status === 429) return "rate-limit";
        if (status >= 500) return "server";
        if (this.plugin.isTimeoutError(error)) return "timeout";
        if (this.plugin.isNetworkError(error)) return "network";
        if (status >= 400) return "client";
        return "invalid-output";
    }

    shouldShowAutoTranslationWarning(error) {
        return this.isMajorAutoTranslationFailure(error) || this.plugin.settings.ui?.showAutoTranslateWarnings === true;
    }

    isMajorAutoTranslationFailure(error) {
        return ["auth", "quota", "rate-limit", "server", "client", "parse", "local-unavailable"].includes(this.getAutoTranslationFailureType(error));
    }

    addAutoTranslationPendingTarget(cacheKey, target) {
        if (!cacheKey || !target?.messageNode || !target?.content) return;
        const entry = this.stateMachine.pendingTargets.get(cacheKey) || { targets: [] };
        const ownerId = this.plugin.getTranslationOwnerId(target.content);
        const pendingTarget = this.plugin.withAutoTranslationPriority(target);
        const existingIndex = entry.targets.findIndex(item => this.plugin.getTranslationOwnerId(item.content) === ownerId);
        if (existingIndex >= 0) {
            const existing = entry.targets[existingIndex];
            entry.targets[existingIndex] = (pendingTarget.priority ?? Number.MAX_SAFE_INTEGER) < (existing.priority ?? Number.MAX_SAFE_INTEGER)
                ? { ...existing, ...pendingTarget }
                : { ...pendingTarget, ...existing };
        }
        else {
            entry.targets.push(pendingTarget);
        }
        this.sortAutoTranslationTargets(entry.targets);
        this.stateMachine.pendingTargets.set(cacheKey, entry);
    }

    sortAutoTranslationTargets(targets) {
        targets.sort((left, right) => {
            const priorityDelta = (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER);
            if (priorityDelta) return priorityDelta;
            return String(this.plugin.peekTranslationOwnerId(left?.content) || "").localeCompare(String(this.plugin.peekTranslationOwnerId(right?.content) || ""));
        });
    }

    getAutoTranslationPendingTargets(item) {
        const targets = this.stateMachine.pendingTargets.get(item.cacheKey)?.targets || [];
        return targets.length ? targets : [item];
    }

    consumeAutoTranslationTargets(item) {
        const targets = this.getAutoTranslationPendingTargets(item);
        this.stateMachine.pendingTargets.delete(item.cacheKey);
        return targets;
    }

    clearAutoTranslationPendingTargets(cacheKey) {
        if (!cacheKey) return;
        this.stateMachine.pendingTargets.delete(cacheKey);
    }

    scheduleAutoTranslationRetryScan(delayMs = AUTO_TRANSLATE_FAILURE_TTL, options = {}) {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return;
        }
        const minDelayMs = Math.max(0, Number(options.minDelayMs ?? 1000) || 0);
        const normalizedDelay = Math.max(minDelayMs, Number(delayMs) || AUTO_TRANSLATE_FAILURE_TTL);
        const retryAt = Date.now() + normalizedDelay;
        this.plugin.autoTranslationLastRouteKey ||= this.plugin.getCurrentRouteKey();
        if (this.cooldowns.retryTimer && this.cooldowns.retryAt && this.cooldowns.retryAt <= retryAt) return;
        if (this.cooldowns.retryTimer) clearTimeout(this.cooldowns.retryTimer);
        this.cooldowns.retryAt = retryAt;
        this.cooldowns.retryTimer = setTimeout(() => {
            this.cooldowns.retryTimer = null;
            this.cooldowns.retryAt = 0;
            if (!this.plugin.isStarted) return;
            this.plugin.queueScan();
        }, normalizedDelay + 100);
        this.ctx.unrefTimer(this.cooldowns.retryTimer);
    }

    getLocalAutoTranslationMaxTokensForLength(sourceLength = 0, targetLanguage = this.plugin.settings.translation.targetLanguage, baseMaxTokens = DEFAULT_SETTINGS.translation.maxTokens) {
        const configured = this.plugin.normalizeRequestNumber(
            baseMaxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const dynamic = this.plugin.getLongTextMaxTokensForLength(sourceLength, targetLanguage);
        return Math.max(256, configured, Math.min(1200, dynamic));
    }
}

module.exports = { AutoTranslationQueueCore };
