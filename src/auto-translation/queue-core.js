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
    AUTO_TRANSLATE_INTAKE_MODES,
    AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_IN_FLIGHT_STALE_MS,
    AUTO_TRANSLATE_LAST_DECISION_MAX,
    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
    AUTO_TRANSLATE_MAX_CONCURRENCY,
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

class AutoTranslationQueueCore {
    constructor(plugin) {
        this.plugin = plugin;
    }

    shouldInvalidateAutoTranslationForSetting(path) {
        if (["ui.autoTranslateMessages", "ui.autoTranslatePrefetch", "ui.autoTranslatePrefetchRange", "ui.autoTranslateIntakeMode", "ui.autoTranslateConcurrency", "ui.autoTranslateStrictRetry"].includes(path)) return true;
        if (["googleTranslate.keyPoolText", "googleTranslate.defaultMonthlyLimit", "googleTranslate.allowPrefetch"].includes(path)) return true;
        if (!path.startsWith("translation.")) return false;
        const field = path.split(".")[1];
        return [
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
        ].includes(field);
    }

    invalidateAutoTranslationQueue(options = {}) {
        if (!options.preserveVersion) this.plugin.autoTranslationConfigVersion++;
        this.plugin.cancelIncrementalMessageScan();
        this.plugin.cancelAutoTranslationRenderQueue();
        this.plugin.autoTranslationQueue = [];
        this.plugin.autoTranslationQueuedKeys.clear();
        if (!options.preserveVersion) {
            // The in-flight work below is orphaned: stop its HTTP requests too, so they do not
            // keep a local server busy while the next scan starts new ones.
            this.plugin.abortAutoTranslationRequests("invalidated");
            this.plugin.autoTranslationPartialResults?.clear?.();
            this.plugin.autoTranslationInFlight = 0;
            this.plugin.autoTranslationInFlightKeys.clear();
            this.plugin.autoTranslationVisibleLongInFlightKeys.clear();
            this.plugin.autoTranslationInFlightStartedAt.clear();
            this.plugin.autoTranslationInFlightTokens.clear();
            this.plugin.autoTranslationInFlightItems = 0;
            this.plugin.autoTranslationPrefetchInFlight = 0;
            this.plugin.autoTranslationPrecheckSkips.clear();
            this.plugin.autoTranslationRecentRenders.clear();
            this.plugin.lastAutoTranslationDecisions.clear();
        }
        if (!options.preserveFailures) {
            this.plugin.autoTranslationFailures.clear();
            this.plugin.autoTranslationProviderFailures.clear();
            this.plugin.autoTranslationProviderNoticeAt.clear();
        }
        if (this.plugin.autoTranslationRetryTimer && !options.preserveFailures && !options.preserveRetry) {
            clearTimeout(this.plugin.autoTranslationRetryTimer);
            this.plugin.autoTranslationRetryTimer = null;
            this.plugin.autoTranslationRetryAt = 0;
        }
        const preserveInFlightPendingTargets = Boolean(options.preserveNodes && options.preserveVersion);
        if (!options.preserveNodes) {
            for (const [cacheKey, entry] of this.plugin.autoTranslationPendingTargets) {
                for (const target of entry?.targets || []) {
                    this.plugin.removeAutoTranslationNode(target, cacheKey);
                }
            }
        }
        if (preserveInFlightPendingTargets) {
            for (const [cacheKey, entry] of [...this.plugin.autoTranslationPendingTargets]) {
                if (!this.plugin.autoTranslationInFlightKeys.has(cacheKey)) {
                    this.plugin.autoTranslationPendingTargets.delete(cacheKey);
                    continue;
                }
                const targets = (entry?.targets || []).filter(target => target?.messageNode?.isConnected && target?.content?.isConnected);
                if (targets.length) this.plugin.autoTranslationPendingTargets.set(cacheKey, { targets });
                else this.plugin.autoTranslationPendingTargets.delete(cacheKey);
            }
        }
        else {
            this.plugin.autoTranslationPendingTargets.clear();
        }
        if (!options.preserveNodes) this.plugin.removeAllAutoTranslationNodes();
    }

    getAutoTranslationQueueSnapshot() {
        return {
            queueLength: this.plugin.autoTranslationQueue?.length || 0,
            inFlight: this.plugin.autoTranslationInFlight || 0,
            inFlightItems: this.plugin.autoTranslationInFlightItems || 0,
            prefetchInFlight: this.plugin.autoTranslationPrefetchInFlight || 0,
            pendingTargets: this.plugin.autoTranslationPendingTargets?.size || 0
        };
    }

    getAutoTranslationDiagnosticQueueType(item = {}) {
        return this.plugin.translationScheduler.getQueueType(item);
    }

    getAutoTranslationDiagnosticQueuePriority(item = {}, queueType = null) {
        const rank = this.plugin.translationScheduler.getQueueTypeRank(item, queueType);
        const priority = Number(item?.priority ?? Number.MAX_SAFE_INTEGER);
        return rank * 1000000 + Math.min(999999, Math.max(0, Number.isFinite(priority) ? Math.round(priority) : 999999));
    }

    getAutoTranslationQueuedDiagnosticState(item = {}) {
        const queueType = this.plugin.getAutoTranslationDiagnosticQueueType(item);
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
        this.plugin.setAutoTranslationDiagnosticState(item, state, reasonCode);
        this.plugin.recordAutoTranslationDecision(item, {
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
        const key = this.plugin.getAutoTranslationDecisionKey(candidate, decision);
        if (!key) return null;
        if (!this.plugin.lastAutoTranslationDecisions?.set) this.plugin.lastAutoTranslationDecisions = new Map();
        const requestOptions = candidate?.requestOptions || decision?.requestOptions || this.plugin.getAutoTranslationOptions();
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        const reasonCode = this.plugin.getDiagnosticReasonCode(decision.reasonCode || candidate?.daitDiagnosticReason || "");
        const messageState = this.plugin.getDiagnosticMessageState(decision.state || candidate?.daitDiagnosticState || "");
        const previous = this.plugin.lastAutoTranslationDecisions.get(key) || {};
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
        const decisionQueueItem = candidate || decision?.item || {};
        const decisionQueueType = this.plugin.getAutoTranslationDiagnosticQueueType(decisionQueueItem);
        const entry = {
            at: Date.now(),
            iso: new Date().toISOString(),
            action: this.plugin.getAutoTranslationDecisionAction(decision.status, messageState, reasonCode),
            status: String(decision.status || ""),
            state: this.plugin.getAutoTranslationLastDecisionState(decision.status, messageState, reasonCode),
            messageState,
            reasonCode,
            provider: config.provider || "",
            providerKeyHash: this.plugin.getTextFingerprint(requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions)),
            targetLanguage: this.plugin.getAutoTranslationTargetLanguage(requestOptions),
            targetKind: candidate?.targetKind || (this.plugin.isReplyPreviewElement(candidate?.content) ? "reply-preview" : "message"),
            source: candidate?.source || "dom",
            queueType: decisionQueueType,
            queuePriority: this.plugin.getAutoTranslationDiagnosticQueuePriority(decisionQueueItem, decisionQueueType),
            identityHash: this.plugin.getTextFingerprint(requestOptions?.messageIdentity || candidate?.messageIdentity || ""),
            messageIdentityHash: this.plugin.getTextFingerprint(requestOptions?.messageIdentity || candidate?.messageIdentity || ""),
            messageIdentityKind: this.plugin.getTranslationIdentitySummary(requestOptions?.messageIdentity || candidate?.messageIdentity || "").kind || "",
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
        this.plugin.lastAutoTranslationDecisions.set(key, entry);
        while (this.plugin.lastAutoTranslationDecisions.size > AUTO_TRANSLATE_LAST_DECISION_MAX) {
            this.plugin.lastAutoTranslationDecisions.delete(this.plugin.lastAutoTranslationDecisions.keys().next().value);
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
        const entries = [...(this.plugin.lastAutoTranslationDecisions?.values?.() || [])]
            .sort((left, right) => Number(right.at || 0) - Number(left.at || 0))
            .slice(0, Math.max(1, Number(limit) || 80));
        return entries.map(entry => ({ ...entry }));
    }

    clearAutoTranslationProviderFailureForCurrentConfig(kind = "translation") {
        if (kind !== "translation") return;
        const key = this.plugin.getAutoTranslationProviderKey(this.plugin.getAutoTranslationOptions());
        if (key) this.plugin.autoTranslationProviderFailures.delete(key);
        if (key) this.plugin.autoTranslationProviderNoticeAt.delete(key);
    }

    releaseProviderBlockedAutoTranslationItems(providerKey) {
        const key = String(providerKey || "");
        if (!key) return;
        let released = 0;
        this.plugin.autoTranslationQueue.forEach(item => {
            if (this.plugin.getAutoTranslationItemProviderKey(item) !== key) return;
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

    isAutoTranslationScrollEventRelevant(event = null) {
        const target = event?.target;
        if (!target || typeof document === "undefined" || target === document || target === window || target === document.body || target === document.documentElement) return true;
        const element = target?.nodeType === 3 ? target.parentElement : target;
        if (!element || element.nodeType !== 1) return true;
        if (this.plugin.isInsideDiscordSettingsSurface(element)) return false;
        if (this.plugin.isInsideDiscordMediaViewer(element) || this.plugin.isMediaOnlyMutationElement(element)) return false;
        if (element.closest?.(".dait-settings, .dait-quick-settings-modal-root, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-line, .dait-translation-box")) return false;
        if (element.closest?.("[class*='channelTextArea'], [role='textbox']")) return false;
        const selector = [
            DISCORD_MESSAGE_NODE_SELECTOR,
            "[data-list-id*='chat-messages']",
            "[class*='messagesWrapper']",
            "[class*='scrollerInner']",
            "[class*='chatContent']"
        ].join(",");
        return Boolean(element.matches?.(selector) || element.closest?.(selector) || element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR));
    }

    markAutoTranslationViewportBusy(type = "scroll", event = null) {
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
            this.plugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
            this.plugin.resetAutoTranslationViewportStability();
            this.plugin.enterAutoTranslationJumpCooldown(type);
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
        if (this.plugin.autoTranslationQueue.length || this.plugin.autoTranslationPendingTargets.size) {
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
        if (this.plugin.isAutoTranslationViewportSettling(now)) return true;
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
        if (!this.plugin.autoTranslationLastRouteKey) {
            this.plugin.autoTranslationLastRouteKey = key;
            return false;
        }
        if (this.plugin.autoTranslationLastRouteKey === key) return false;
        this.plugin.autoTranslationLastRouteKey = key;
        this.plugin.markAutoTranslationViewportBusy("route");
        return true;
    }

    removeQueuedAutoTranslationItem(cacheKey) {
        if (!cacheKey || !this.plugin.autoTranslationQueue.length) return 0;
        const before = this.plugin.autoTranslationQueue.length;
        this.plugin.autoTranslationQueue = this.plugin.autoTranslationQueue.filter(item => item?.cacheKey !== cacheKey);
        const removed = before - this.plugin.autoTranslationQueue.length;
        if (removed && !this.plugin.autoTranslationInFlightKeys.has(cacheKey)) this.plugin.autoTranslationQueuedKeys.delete(cacheKey);
        return removed;
    }

    pruneAutoTranslationQueue() {
        if (!this.plugin.autoTranslationQueue.length) return;

        const next = [];
        for (const item of this.plugin.autoTranslationQueue) {
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(item);
            if (!readyTargets.length) {
                this.plugin.autoTranslationQueuedKeys.delete(item?.cacheKey);
                this.plugin.clearAutoTranslationPendingTargets(item?.cacheKey);
                continue;
            }

            this.plugin.autoTranslationPendingTargets.set(item.cacheKey, { targets: readyTargets });
            next.push(this.plugin.withAutoTranslationPriority({ ...item, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) }));
        }

        this.plugin.autoTranslationQueue = next;
        this.plugin.sortAutoTranslationQueue();
    }

    drainAutoTranslationQueue() {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return;
        }
        this.plugin.pruneAutoTranslationActiveState();
        if (this.plugin.isAutoTranslationJumpCoolingDown()) {
            this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                reasonCode: DIAGNOSTIC_REASON_CODES.API_WORK_BLOCKED,
                messageState: DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE,
                ...this.plugin.getAutoTranslationQueueSnapshot(),
                reason: "jump-cooldown",
                queueLength: this.plugin.autoTranslationQueue.length,
                inFlight: this.plugin.autoTranslationInFlight,
                retryMs: this.plugin.getAutoTranslationJumpCooldownRemainingMs()
            });
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationJumpCooldownRemainingMs());
            return;
        }
        if (this.plugin.isAutoTranslationViewportSettling()) {
            this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                reasonCode: DIAGNOSTIC_REASON_CODES.API_WORK_BLOCKED,
                messageState: DIAGNOSTIC_MESSAGE_STATES.QUEUED_VISIBLE,
                ...this.plugin.getAutoTranslationQueueSnapshot(),
                reason: "viewport-settling",
                queueLength: this.plugin.autoTranslationQueue.length,
                inFlight: this.plugin.autoTranslationInFlight,
                retryMs: this.plugin.getAutoTranslationViewportSettleRemainingMs()
            });
            this.plugin.scheduleAutoTranslationRetryScan(this.plugin.getAutoTranslationViewportSettleRemainingMs());
            return;
        }

        const concurrency = this.plugin.getAutoTranslateConcurrency();
        const blockedPrefetch = [];

        while (this.plugin.autoTranslationInFlight < concurrency && this.plugin.autoTranslationQueue.length) {
            let batch = this.plugin.takeAutoTranslationBatch({ visibility: "visible" });
            if (!batch.length) batch = this.plugin.takeAutoTranslationBatch({ visibility: "prefetch" });
            if (!batch.length) break;
            const providerFailure = this.plugin.getAutoTranslationProviderFailure(batch[0]?.requestOptions);
            if (providerFailure && !this.plugin.isAutoTranslationFailureExpired(providerFailure)) {
                this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                    reasonCode: providerFailure.type === "local-unavailable" ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN,
                    messageState: this.plugin.getAutoTranslationQueuedDiagnosticState(batch[0]),
                    ...this.plugin.getAutoTranslationQueueSnapshot(),
                    reason: "provider-cooldown",
                    type: providerFailure.type || "",
                    batchSize: batch.length,
                    queueLength: this.plugin.autoTranslationQueue.length,
                    inFlight: this.plugin.autoTranslationInFlight
                });
                batch.forEach(item => this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    this.plugin.getAutoTranslationQueuedDiagnosticState(item),
                    providerFailure.type === "local-unavailable" ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN,
                    { type: providerFailure.type || "", retryAfterMs: this.plugin.getAutoTranslationFailureRemainingMs(providerFailure) }
                ));
                if (providerFailure.type === "local-unavailable") {
                    const providerKey = this.plugin.getAutoTranslationItemProviderKey(batch[0]);
                    const retryMs = this.plugin.getAutoTranslationFailureRemainingMs(providerFailure);
                    const retainedKeys = this.plugin.retainProviderBlockedVisibleAutoTranslationBatch(batch, retryMs, DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE);
                    this.plugin.discardAutoTranslationProviderWork(providerKey, { retryMs, skipCacheKeys: retainedKeys });
                }
                else {
                    const retryMs = this.plugin.getAutoTranslationFailureRemainingMs(providerFailure);
                    batch.forEach(item => {
                        item.daitRequeueAfter = Date.now() + retryMs;
                        this.plugin.removeAutoTranslationLoadingForItem(item);
                    });
                    this.plugin.restoreAutoTranslationBatch(batch);
                    this.plugin.scheduleAutoTranslationRetryScan(retryMs);
                    continue;
                }
                if (blockedPrefetch.length) this.plugin.restoreBlockedAutoTranslationPrefetch(blockedPrefetch);
                return;
            }
            const localProviderHealthBlocked = this.plugin.shouldBlockAutoTranslationForLocalProviderHealth(batch[0]?.requestOptions);
            if (localProviderHealthBlocked) {
                const retryMs = this.plugin.getLocalProviderHealthRetryMs(batch[0]?.requestOptions);
                this.plugin.logDiagnostic("auto.queue.drain", "blocked", {
                    reasonCode: DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH,
                    messageState: this.plugin.getAutoTranslationQueuedDiagnosticState(batch[0]),
                    ...this.plugin.getAutoTranslationQueueSnapshot(),
                    reason: "local-provider-health",
                    batchSize: batch.length,
                    queueLength: this.plugin.autoTranslationQueue.length,
                    inFlight: this.plugin.autoTranslationInFlight,
                    retryMs
                });
                batch.forEach(item => this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    this.plugin.getAutoTranslationQueuedDiagnosticState(item),
                    DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH
                ));
                this.plugin.retainProviderBlockedVisibleAutoTranslationBatch(batch, retryMs, DIAGNOSTIC_REASON_CODES.LOCAL_PROVIDER_HEALTH);
                this.plugin.scheduleAutoTranslationRetryScan(retryMs);
                if (blockedPrefetch.length) this.plugin.restoreBlockedAutoTranslationPrefetch(blockedPrefetch);
                return;
            }
            const isPrefetchBatch = this.plugin.isAutoTranslationPrefetchBatch(batch);
            if (isPrefetchBatch && !this.plugin.canStartAutoTranslationPrefetchRequest(concurrency)) {
                this.plugin.logDiagnostic("auto.queue.prefetch", "blocked", {
                    reasonCode: DIAGNOSTIC_REASON_CODES.PREFETCH_SLOT,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.QUEUED_PREFETCH,
                    ...this.plugin.getAutoTranslationQueueSnapshot(),
                    reason: "prefetch-slot",
                    batchSize: batch.length,
                    concurrency,
                    prefetchInFlight: this.plugin.autoTranslationPrefetchInFlight
                });
                batch.forEach(item => this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "blocked",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.QUEUED_PREFETCH,
                    DIAGNOSTIC_REASON_CODES.PREFETCH_SLOT,
                    { concurrency }
                ));
                blockedPrefetch.push(...batch);
                if (!this.plugin.autoTranslationQueue.length) break;
                continue;
            }

            this.plugin.autoTranslationInFlight++;
            this.plugin.autoTranslationInFlightItems += batch.length;
            if (isPrefetchBatch) this.plugin.autoTranslationPrefetchInFlight++;
            const startedAt = Date.now();
            batch.forEach(item => {
                item.daitPrefetchRequest = isPrefetchBatch;
                this.plugin.setAutoTranslationDiagnosticState(item, DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT, DIAGNOSTIC_REASON_CODES.REQUEST_STARTED);
                this.plugin.markAutoTranslationInFlightItem(item, startedAt);
            });
            this.plugin.logDiagnostic("auto.batch.start", "start", {
                ...this.plugin.getDiagnosticBaseMeta("auto", batch[0]?.requestOptions?.mode || "auto", DIAGNOSTIC_REASON_CODES.REQUEST_STARTED),
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                batchSize: batch.length,
                prefetch: isPrefetchBatch,
                concurrency,
                queueLength: this.plugin.autoTranslationQueue.length,
                inFlight: this.plugin.autoTranslationInFlight,
                inFlightItems: this.plugin.autoTranslationInFlightItems,
                prefetchInFlight: this.plugin.autoTranslationPrefetchInFlight,
                provider: batch[0]?.requestOptions?.configOverrides?.provider,
                model: batch[0]?.requestOptions?.configOverrides?.model
            });
            if (batch.length > 1) this.plugin.autoTranslateQueuedBatch(batch);
            else this.plugin.autoTranslateQueuedMessage(batch[0]);
        }

        if (blockedPrefetch.length) this.plugin.restoreBlockedAutoTranslationPrefetch(blockedPrefetch);
    }

    retainProviderBlockedVisibleAutoTranslationBatch(batch = [], retryMs = 0, reasonCode = DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE) {
        const retainedKeys = new Set();
        const queueLimit = this.plugin.getAutoTranslateQueueLimit();
        batch.forEach(item => {
            if (this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item)) {
                const retained = this.plugin.retainBlockedVisibleAutoTranslationItem(item, {
                    delayMs: retryMs,
                    queueLimit,
                    reasonCode
                });
                if (retained && item?.cacheKey) retainedKeys.add(item.cacheKey);
                return;
            }
            this.plugin.discardAutoTranslationItemWork(item);
        });
        return retainedKeys;
    }

    restoreBlockedAutoTranslationPrefetch(items) {
        this.plugin.autoTranslationQueue.unshift(...items);
        items.forEach(item => {
            if (item?.cacheKey) this.plugin.autoTranslationQueuedKeys.add(item.cacheKey);
        });
        this.plugin.sortAutoTranslationQueue();
    }

    restoreAutoTranslationBatch(items) {
        this.plugin.autoTranslationQueue.unshift(...items);
        items.forEach(item => {
            if (item?.cacheKey) this.plugin.autoTranslationQueuedKeys.add(item.cacheKey);
        });
        this.plugin.sortAutoTranslationQueue();
    }

    retainBlockedVisibleAutoTranslationItem(item, options = {}) {
        if (!item?.cacheKey || !this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item)) return false;
        const queueLimit = Math.max(1, Number(options.queueLimit) || this.plugin.getAutoTranslateQueueLimit());
        if (!this.plugin.makeRoomForAutoTranslationItem(item, queueLimit)) return false;
        const retryMs = Math.max(0, Number(options.delayMs) || 0);
        const retained = { ...item };
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
        this.plugin.addAutoTranslationPendingTarget(retained.cacheKey, retained);
        const enqueued = this.plugin.enqueueAutoTranslationItem(retained);
        if (enqueued) {
            item.daitRequeued = true;
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "requeued",
                retained,
                this.plugin.getAutoTranslationQueuedDiagnosticState(retained),
                options.reasonCode || DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE,
                { delayMs: retryMs, retained: true }
            );
        }
        return enqueued;
    }

    shouldRetainAutoTranslationProviderBlockedItem(item) {
        return Boolean(item?.cacheKey
            && this.plugin.isAutoTranslationRequestCurrent(item?.requestOptions)
            && this.plugin.isAutoTranslationVisibleItem(item));
    }

    shouldRetainAutoTranslationFailureItem(item, error) {
        if (!item?.cacheKey || item?.daitPrefetchRequest) return false;
        const type = this.plugin.getAutoTranslationFailureType(error);
        // A truncated output is not retained: it already had a retry with a larger limit, and
        // requeueing it every few seconds re-sent a full-length generation forever.
        if (!["local-unavailable", "timeout", "network", "server", "rate-limit"].includes(type)) return false;
        return this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item);
    }

    getAutoTranslationProviderBlockedRetryMs(providerFailure = null, localProviderHealthBlocked = false, now = Date.now()) {
        if (providerFailure) return this.plugin.getAutoTranslationFailureRemainingMs(providerFailure, now);
        if (localProviderHealthBlocked) return LOCAL_PROVIDER_HEALTH_RETRY_MS;
        return AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS;
    }

    isRetainableAutoTranslationProviderBlock(providerFailure = null, localProviderHealthBlocked = false) {
        return Boolean(localProviderHealthBlocked
            || ["local-unavailable", "timeout", "network", "server", "rate-limit"].includes(String(providerFailure?.type || "")));
    }

    discardAutoTranslationProviderWork(providerKey, options = {}) {
        if (!providerKey) return;
        const retryMs = Math.max(0, Number(options.retryMs) || LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
        const skipCacheKeys = options.skipCacheKeys instanceof Set ? options.skipCacheKeys : new Set();
        const keep = [];
        for (const item of this.plugin.autoTranslationQueue) {
            if (item?.cacheKey && skipCacheKeys.has(item.cacheKey)) {
                keep.push(item);
                continue;
            }
            if (this.plugin.getAutoTranslationItemProviderKey(item) === providerKey) {
                if (this.plugin.shouldRetainAutoTranslationProviderBlockedItem(item)) {
                    const retained = { ...item, daitRequeueAfter: Date.now() + retryMs };
                    delete retained.daitPrefetchRequest;
                    this.plugin.removeAutoTranslationLoadingForItem(retained, { force: true });
                    this.plugin.addAutoTranslationPendingTarget(retained.cacheKey, retained);
                    keep.push(retained);
                    if (retained.cacheKey) this.plugin.autoTranslationQueuedKeys.add(retained.cacheKey);
                }
                else {
                    this.plugin.discardAutoTranslationItemWork(item);
                }
            }
            else {
                keep.push(item);
            }
        }
        this.plugin.autoTranslationQueue = keep;

        for (const [cacheKey, entry] of [...this.plugin.autoTranslationPendingTargets.entries()]) {
            if (skipCacheKeys.has(cacheKey)) continue;
            const targets = Array.isArray(entry?.targets) ? entry.targets : [];
            const remaining = [];
            for (const target of targets) {
                if (this.plugin.getAutoTranslationItemProviderKey(target) === providerKey) {
                    this.plugin.removeAutoTranslationLoadingNode(target, cacheKey, { force: true });
                    if (this.plugin.shouldRetainAutoTranslationProviderBlockedItem({ ...target, cacheKey })) {
                        remaining.push(target);
                    }
                    continue;
                }
                remaining.push(target);
            }
            if (remaining.length) this.plugin.autoTranslationPendingTargets.set(cacheKey, { targets: remaining });
            else this.plugin.autoTranslationPendingTargets.delete(cacheKey);
        }
        if (retryMs) this.plugin.scheduleAutoTranslationRetryScan(retryMs);
        this.plugin.sortAutoTranslationQueue();
    }

    discardAutoTranslationItemWork(item) {
        if (!item?.cacheKey) return;
        this.plugin.removeAutoTranslationLoadingForItem(item, { force: true });
        this.plugin.autoTranslationQueuedKeys.delete(item.cacheKey);
        this.plugin.clearAutoTranslationPendingTargets(item.cacheKey);
    }

    getAutoTranslationItemProviderKey(item) {
        return this.plugin.translationScheduler.getItemProviderKey(item);
    }

    canStartAutoTranslationPrefetchRequest(concurrency = this.plugin.getAutoTranslateConcurrency()) {
        return this.plugin.translationScheduler.canStartPrefetchRequest(concurrency);
    }

    isAutoTranslationPrefetchBatch(batch) {
        return this.plugin.translationScheduler.isPrefetchBatch(batch);
    }

    isAutoTranslationPrefetchItem(item) {
        return this.plugin.translationScheduler.isPrefetchItem(item);
    }

    isAutoTranslationVisibleItem(item) {
        return this.plugin.translationScheduler.isVisibleItem(item);
    }

    hasActiveVisibleAutoTranslationWork() {
        return this.plugin.hasVisibleAutoTranslationInFlight() || this.plugin.hasQueuedVisibleAutoTranslationWork();
    }

    hasVisibleAutoTranslationInFlight() {
        return Math.max(0, Number(this.plugin.autoTranslationInFlight || 0) - Number(this.plugin.autoTranslationPrefetchInFlight || 0)) > 0;
    }

    hasQueuedVisibleAutoTranslationWork() {
        return (this.plugin.autoTranslationQueue || []).some(item => {
            const queueType = this.plugin.getAutoTranslationDiagnosticQueueType(item);
            return queueType === AUTO_TRANSLATION_QUEUE_TYPES.VISIBLE
                || queueType === AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT;
        });
    }

    takeAutoTranslationBatch(options = {}) {
        const batch = [];
        const deferred = [];
        let batchGroupKey = "";
        let batchPrefetchState = null;
        let nextReadyAt = 0;
        const now = Date.now();
        const visibility = options.visibility || "";
        while (batch.length < AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX && this.plugin.autoTranslationQueue.length) {
            const item = this.plugin.autoTranslationQueue.shift();
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
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(item);
            if (!readyTargets.length) {
                this.plugin.autoTranslationQueuedKeys.delete(item?.cacheKey);
                this.plugin.clearAutoTranslationPendingTargets(item?.cacheKey);
                continue;
            }

            this.plugin.autoTranslationPendingTargets.set(item.cacheKey, { targets: readyTargets });
            const readyItem = { ...item, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) };
            const itemPrefetchState = this.plugin.isAutoTranslationPrefetchItem(readyItem);
            if (itemPrefetchState && !this.plugin.isAutoTranslationPrefetchAllowed(readyItem)) {
                this.plugin.discardAutoTranslationItemWork(readyItem);
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
            if (this.plugin.shouldDeferShortAutoTranslationItemForVisibleLong(readyItem, { visibility, batch })) {
                deferred.push(readyItem);
                continue;
            }
            if (this.plugin.shouldDeferLongAutoTranslationItem(readyItem, { visibility, batch })) {
                readyItem.daitLongTextDeferrals = Math.min(
                    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
                    Math.max(0, Number(readyItem.daitLongTextDeferrals) || 0) + 1
                );
                deferred.push(readyItem);
                this.plugin.logDiagnostic("auto.queue.defer", "long-text", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(readyItem, this.plugin.getAutoTranslationQueuedDiagnosticState(readyItem), DIAGNOSTIC_REASON_CODES.BATCH_LIMIT),
                    key: this.plugin.getTextFingerprint(readyItem.cacheKey),
                    deferrals: readyItem.daitLongTextDeferrals,
                    queueLength: this.plugin.autoTranslationQueue.length
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
                if (readyItem?.cacheKey) this.plugin.autoTranslationQueuedKeys.delete(readyItem.cacheKey);
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
            delete readyItem.daitLongTextDeferrals;
            if (readyItem?.cacheKey) this.plugin.autoTranslationQueuedKeys.delete(readyItem.cacheKey);
        }

        if (deferred.length) {
            this.plugin.autoTranslationQueue.unshift(...deferred);
            this.plugin.sortAutoTranslationQueue();
        }
        if (nextReadyAt) this.plugin.scheduleAutoTranslationRetryScan(Math.max(0, nextReadyAt - now));
        return batch;
    }

    shouldDeferShortAutoTranslationItemForVisibleLong(item, options = {}) {
        return false;
    }

    hasReadyShortAutoTranslationCandidate(referenceItem, options = {}) {
        const visibility = options.visibility || "";
        const now = Date.now();
        for (const queued of this.plugin.autoTranslationQueue) {
            if (!queued?.cacheKey || queued.cacheKey === referenceItem?.cacheKey) continue;
            const requeueAfter = Number(queued?.daitRequeueAfter || 0);
            if (requeueAfter > now) continue;
            const readyTargets = this.plugin.getReadyAutoTranslationTargets(queued);
            if (!readyTargets.length) continue;
            const candidate = { ...queued, ...this.plugin.getAutoTranslationPrimaryTarget(readyTargets[0]) };
            const candidatePrefetch = this.plugin.isAutoTranslationPrefetchItem(candidate);
            if ((visibility === "visible" && candidatePrefetch) || (visibility === "prefetch" && !candidatePrefetch)) continue;
            if (candidatePrefetch && !this.plugin.isAutoTranslationPrefetchAllowed(candidate)) continue;
            if (this.plugin.isLongAutoTranslationItem(candidate)) continue;
            return true;
        }
        return false;
    }

    shouldRunAutoTranslationItemSingle(item) {
        return this.plugin.translationScheduler.shouldRunItemSingle(item);
    }

    isAutoTranslationPrefetchAllowed(item) {
        if (item?.daitHistoryRequest) return true;
        if (!this.plugin.isAutoTranslationPrefetchItem(item)) return true;
        if (!this.plugin.isAutoTranslationPrefetchConfigured()) return false;
        const now = Date.now();
        if (this.plugin.isAutoTranslationRenderPaused(now)
            || this.plugin.isAutoTranslationViewportSettling(now)
            || this.plugin.isAutoTranslationJumpCoolingDown(now)
            || this.plugin.getInputComposerBusyRemainingMs(now) > 0) return false;
        const config = this.plugin.getEffectiveTaskConfig("translation", item?.requestOptions?.configOverrides);
        if (this.plugin.isGoogleTranslateProvider(config) && this.plugin.settings.googleTranslate?.allowPrefetch === false) return false;
        return true;
    }

    isAutoTranslationQueueItemReady(item) {
        return this.plugin.isAutoTranslationTargetReady(item, item?.cacheKey);
    }

    isAutoTranslationTargetReady(target, cacheKey = target?.cacheKey) {
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
        if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target)) return false;
        const domText = this.plugin.getAutoTranslationTargetDomText(target);
        if (this.plugin.hasCurrentTranslationLine(target.content, cacheKey, domText, this.plugin.getTranslationLineCacheAliases(target.text, target.requestOptions || {}), null, target.text)) return false;
        const messageInRange = this.plugin.isAutoTranslationTargetInScanRange(target.messageNode);
        const contentInRange = this.plugin.isAutoTranslationTargetInScanRange(target.content);
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
        return this.plugin.normalizeAutoTranslateConcurrency(this.plugin.settings.ui?.autoTranslateConcurrency);
    }

    getAutoTranslatePrefetchRange() {
        if (!this.plugin.isAutoTranslateEnabled() || !this.plugin.isAutoTranslationPrefetchConfigured()) return 0;
        return this.plugin.normalizeAutoTranslatePrefetchRange(this.plugin.settings.ui?.autoTranslatePrefetchRange);
    }

    isAutoTranslationPrefetchConfigured() {
        return Boolean(this.plugin.settings.ui?.autoTranslatePrefetch);
    }

    // Channel rule (v0.4.0): 'enabled' is an allow-list that works even while the main
    // auto-translate switch is off, 'disabled' always wins, 'inherit' follows the main switch.
    isAutoTranslateEnabled() {
        return Boolean(this.plugin.isStarted
            && this.plugin.settings?.translation?.enabled
            && this.plugin.isCurrentChannelAutoTranslateAllowed());
    }

    cancelAutoTranslationRuntimeWork(reason = "disabled") {
        const hasRetryTimer = Boolean(this.plugin.autoTranslationRetryTimer);
        const hasWork = Boolean(
            this.plugin.autoTranslationQueue?.length
            || this.plugin.autoTranslationQueuedKeys?.size
            || this.plugin.autoTranslationPendingTargets?.size
            || this.plugin.autoTranslationInFlightKeys?.size
            || this.plugin.autoTranslationInFlightItems
            || this.plugin.autoTranslationRenderQueue?.length
        );
        if (!hasRetryTimer && !hasWork) return false;
        this.plugin.invalidateAutoTranslationQueue();
        this.plugin.logDiagnostic("auto.queue.cancel", "ok", { reason });
        return true;
    }

    getAutoTranslateBatchSize() {
        const requestBatchSize = this.plugin.getAutoTranslationRequestBatchSize();
        if (this.plugin.isLocalTranslationProvider(this.plugin.settings.translation)) {
            return Math.max(1, this.plugin.getAutoTranslateConcurrency() * requestBatchSize);
        }
        const perConcurrency = Math.max(AUTO_TRANSLATE_BATCH_MULTIPLIER, requestBatchSize);
        return Math.max(AUTO_TRANSLATE_MIN_BATCH_SIZE, this.plugin.getAutoTranslateConcurrency() * perConcurrency);
    }

    getAutoTranslateQueueLimit() {
        const batchSize = this.plugin.getAutoTranslateBatchSize();
        if (this.plugin.isLocalTranslationProvider(this.plugin.settings.translation)) return batchSize;
        const requestWindow = this.plugin.getAutoTranslateConcurrency() * this.plugin.getAutoTranslationRequestBatchSize() * 2;
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
        return this.plugin.normalizeChannelAutoTranslatePolicyMode(this.plugin.getCurrentChannelAutoTranslatePolicy(routeKey)?.mode);
    }

    getChannelAutoTranslatePolicyStorageKey(routeKey = this.plugin.getCurrentRouteKey()) {
        const parts = String(routeKey || "").split(":");
        const guildId = parts[0] || "";
        const channelId = parts[1] || "";
        if (!channelId) return "";
        return `${guildId}:${channelId}`;
    }

    setCurrentChannelAutoTranslatePolicyMode(mode, routeKey = this.plugin.getCurrentRouteKey(), options = {}) {
        const normalized = this.plugin.normalizeChannelAutoTranslatePolicyMode(mode);
        const key = this.plugin.getChannelAutoTranslatePolicyStorageKey(routeKey);
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
        const previous = this.plugin.getCurrentChannelAutoTranslatePolicyMode(routeKey);
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
        const channelKey = this.plugin.getChannelAutoTranslatePolicyStorageKey(key);
        const policy = policies[key] || policies[channelKey] || null;
        if (!policy || typeof policy !== "object") return { mode: "inherit" };
        const mode = this.plugin.normalizeChannelAutoTranslatePolicyMode(policy.mode);
        return {
            ...policy,
            mode,
            enabled: mode === "enabled" ? true : mode === "disabled" ? false : undefined
        };
    }

    // Channels whose rule is 'enabled': they auto-translate even while the main switch is off.
    getChannelAutoTranslateAllowListCount(policies = this.plugin.settings.ui?.channelAutoTranslatePolicies) {
        if (!policies || typeof policies !== "object" || Array.isArray(policies)) return 0;
        const channels = new Set();
        Object.entries(policies).forEach(([key, policy]) => {
            if (!policy || typeof policy !== "object") return;
            if (this.plugin.normalizeChannelAutoTranslatePolicyMode(policy.mode) !== "enabled") return;
            const channel = this.plugin.getChannelAutoTranslatePolicyStorageKey(key);
            if (channel) channels.add(channel);
        });
        return channels.size;
    }

    isCurrentChannelAutoTranslateAllowed(routeKey = this.plugin.getCurrentRouteKey()) {
        const policy = this.plugin.getCurrentChannelAutoTranslatePolicy(routeKey);
        if (policy.mode === "enabled") return true;
        if (policy.mode === "disabled") return false;
        return Boolean(this.plugin.settings?.ui?.autoTranslateMessages);
    }

    isAutoTranslationRequestCurrent(requestOptions) {
        const versionCurrent = Number(requestOptions?.version ?? this.plugin.autoTranslationConfigVersion) === this.plugin.autoTranslationConfigVersion;
        if (!versionCurrent) return false;
        const routeKey = String(requestOptions?.routeKey || "");
        if (!routeKey) return true;
        const currentRouteKey = this.plugin.getCurrentRouteKey();
        if (routeKey === currentRouteKey) return true;
        return this.plugin.isSameAutoTranslationRouteScope(routeKey, currentRouteKey);
    }

    isAutoTranslationRenderRequestCurrent(requestOptions) {
        if (!requestOptions) return true;
        if (!this.plugin.isAutoTranslationRequestCurrent(requestOptions)) return false;
        const providerKey = String(requestOptions.providerKey || "");
        if (providerKey && !this.plugin.isAutoTranslationProviderSnapshotCurrent(providerKey, requestOptions)) return false;
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
        try {
            if (this.plugin.isAutoTranslationWorkCurrent(item)) this.plugin.renderPendingAutoTranslationLoadingSafely(item);
            const taskOptions = {
                heartbeat: () => this.plugin.heartbeatAutoTranslationInFlightItem(item),
                signal: this.plugin.getAutoTranslationAbortSignal()
            };
            const translated = await this.plugin.runAutoTranslationTask(item.text, item.requestOptions, taskOptions);
            if (this.plugin.isAutoTranslationWorkCurrent(item)) {
                this.plugin.logDiagnostic("auto.message", "success", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.VALIDATING, DIAGNOSTIC_REASON_CODES.OUTPUT_RECEIVED),
                    key: this.plugin.getTextFingerprint(item.cacheKey),
                    sourceHash: this.plugin.getStrongTextFingerprint(item.text),
                    length: String(item.text || "").length,
                    ms: Date.now() - startedAt
                });
                this.plugin.logAutoTranslationMessageState(
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
            }
        }
        catch (error) {
            if (this.plugin.isAutoTranslationWorkCurrent(item)) {
                this.plugin.logDiagnostic("auto.message", "error", {
                    ...this.plugin.getAutoTranslationDiagnosticMeta(item, DIAGNOSTIC_MESSAGE_STATES.FAILED, DIAGNOSTIC_REASON_CODES.FAILURE),
                    key: this.plugin.getTextFingerprint(item.cacheKey),
                    sourceHash: this.plugin.getStrongTextFingerprint(item.text),
                    type: this.plugin.getAutoTranslationFailureType(error),
                    ms: Date.now() - startedAt
                });
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "failed",
                    item,
                    DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    DIAGNOSTIC_REASON_CODES.FAILURE,
                    { type: this.plugin.getAutoTranslationFailureType(error), ms: Date.now() - startedAt, validationQuality: error?.autoTranslationValidationQuality || "" }
                );
                this.plugin.markAutoTranslationFailureSafely(item, error);
            }
        }
        finally {
            const finishedCurrent = this.plugin.finishAutoTranslationInFlightItem(item);
            if (finishedCurrent) {
                this.plugin.autoTranslationInFlight = Math.max(0, this.plugin.autoTranslationInFlight - 1);
                this.plugin.autoTranslationInFlightItems = Math.max(0, this.plugin.autoTranslationInFlightItems - 1);
                if (item.daitPrefetchRequest) this.plugin.autoTranslationPrefetchInFlight = Math.max(0, this.plugin.autoTranslationPrefetchInFlight - 1);
            }
            delete item.daitPrefetchRequest;
            if (this.plugin.isStarted) {
                this.plugin.drainAutoTranslationQueue();
                this.plugin.queueScan();
            }
        }
    }

    async autoTranslateQueuedBatch(items) {
        const pending = new Set(items);
        const startedAt = Date.now();
        try {
            items.forEach(item => {
                if (this.plugin.isAutoTranslationWorkCurrent(item)) this.plugin.renderPendingAutoTranslationLoadingSafely(item);
            });

            let translations = [];
            let requestError = null;
            const taskOptions = { signal: this.plugin.getAutoTranslationAbortSignal() };
            try {
                translations = await this.plugin.runAutoTranslationBatchTask(items.map(item => item.text), items[0]?.requestOptions, taskOptions);
            }
            catch (error) {
                if (!items.some(item => this.plugin.isAutoTranslationWorkCurrent(item))) {
                    pending.clear();
                }
                else if (this.plugin.shouldFallbackAutoTranslationBatchRequestError(error)) {
                    requestError = error;
                    this.plugin.logDiagnostic("auto.batch", "fallback", {
                        type: this.plugin.getAutoTranslationFailureType(error),
                        batchSize: items.length,
                        ms: Date.now() - startedAt
                    });
                }
                else if (!this.plugin.isAutoBatchFallbackError(error)) {
                    this.plugin.logDiagnostic("auto.batch", "error", {
                        type: this.plugin.getAutoTranslationFailureType(error),
                        batchSize: items.length,
                        ms: Date.now() - startedAt
                    });
                    if (this.plugin.shouldMarkAutoTranslationProviderFailureForItem(items[0], error)) {
                        this.plugin.markAutoTranslationProviderFailure(items[0]?.requestOptions, error);
                    }
                    pending.forEach(item => {
                        if (this.plugin.isAutoTranslationWorkCurrent(item)) {
                            this.plugin.logAutoTranslationMessageState(
                                "auto.message.state",
                                "failed",
                                item,
                                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                                DIAGNOSTIC_REASON_CODES.FAILURE,
                                { type: this.plugin.getAutoTranslationFailureType(error), ms: Date.now() - startedAt }
                            );
                            this.plugin.markAutoTranslationFailureSafely(item, error, { markProvider: false });
                        }
                    });
                    pending.clear();
                }
            }

            if (translations.length && items.some(item => this.plugin.isAutoTranslationWorkCurrent(item))) {
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
                            { batchSize: items.length, outputLength: translated.length, invalidReason }
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
                        { batchSize: items.length, outputLength: translated.length }
                    );
                    this.plugin.renderAutoTranslationResultSafely(item, translated);
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
                this.plugin.settleFailedAutoTranslationBatchRequest(pending, requestError);
            }
            else if (pending.size && !this.plugin.isAutoTranslationStrictRetryEnabled()) {
                pending.forEach(item => {
                    if (this.plugin.isAutoTranslationWorkCurrent(item)) {
                        this.plugin.logAutoTranslationMessageState(
                            "auto.message.state",
                            "failed",
                            item,
                            DIAGNOSTIC_MESSAGE_STATES.FAILED,
                            DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                            { strictRetry: false, invalidReason: item.daitLastInvalidReason || "invalid-output" }
                        );
                        this.plugin.markAutoTranslationFailureSafely(item, this.plugin.createFinalInvalidAutoTranslationError(item.daitLastInvalidReason || "invalid-output"));
                    }
                    pending.delete(item);
                });
            }
            else {
                await this.plugin.runAutoTranslationBatchRetryItems(pending, taskOptions);
                await this.plugin.runAutoTranslationFallbackItems(pending, taskOptions);
            }

            pending.forEach(item => {
                if (this.plugin.isAutoTranslationWorkCurrent(item)) this.plugin.clearPendingAutoTranslationItemSafely(item);
                pending.delete(item);
            });
        }
        catch (error) {
            this.plugin.warnSanitized("Auto translation batch failed outside provider flow", error);
            this.plugin.logDiagnostic("auto.batch", "error", {
                type: this.plugin.getAutoTranslationFailureType(error),
                batchSize: items.length,
                pending: pending.size,
                ms: Date.now() - startedAt
            });
            pending.forEach(item => {
                if (this.plugin.isAutoTranslationWorkCurrent(item)) this.plugin.clearPendingAutoTranslationItemSafely(item);
            });
        }
        finally {
            const currentItems = items.filter(item => this.plugin.finishAutoTranslationInFlightItem(item));
            if (currentItems.length) {
                this.plugin.autoTranslationInFlight = Math.max(0, this.plugin.autoTranslationInFlight - 1);
                this.plugin.autoTranslationInFlightItems = Math.max(0, this.plugin.autoTranslationInFlightItems - currentItems.length);
                if (currentItems.some(item => item.daitPrefetchRequest)) this.plugin.autoTranslationPrefetchInFlight = Math.max(0, this.plugin.autoTranslationPrefetchInFlight - 1);
            }
            items.forEach(item => {
                delete item.daitRequeued;
                delete item.daitPrefetchRequest;
            });
            if (this.plugin.isStarted) {
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
        const current = [...pending].filter(item => this.plugin.isAutoTranslationWorkCurrent(item));
        const formatError = this.plugin.isAutoTranslationBatchFormatError(error);
        this.plugin.logDiagnostic("auto.batch", formatError ? "single-fallback" : "request-failed", {
            type: this.plugin.getAutoTranslationFailureType(error),
            batchSize: pending.size,
            current: current.length
        });
        if (!formatError && current.length && this.plugin.shouldMarkAutoTranslationProviderFailureForItem(current[0], error)) {
            this.plugin.markAutoTranslationProviderFailure(current[0]?.requestOptions, error);
        }
        current.forEach(item => {
            pending.delete(item);
            if (formatError) {
                item.daitSingleRequest = true;
                this.plugin.requeueAutoTranslationItem(item, { allowActiveRequeue: true, preserveLoading: true });
                return;
            }
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "failed",
                item,
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.FAILURE,
                { type: this.plugin.getAutoTranslationFailureType(error), batchRequestFailed: true }
            );
            this.plugin.markAutoTranslationFailureSafely(item, error, { markProvider: false });
        });
    }

    isAutoTranslationBatchFormatError(error) {
        if (this.plugin.isAutoBatchFallbackError(error) || error?.modelOutputTruncated) return true;
        return this.plugin.getAutoTranslationFailureType(error) === "invalid-output";
    }

    requeueAutoTranslationItem(item, options = {}) {
        if (!item?.cacheKey) return;

        if (this.plugin.autoTranslationQueue.some(queued => queued.cacheKey === item.cacheKey)) return;
        const delayMs = Math.max(0, Number(options.delayMs) || 0);
        const next = { ...item };
        delete next.priority;
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
        if (this.plugin.enqueueAutoTranslationItem(next)) {
            item.daitRequeued = true;
            this.plugin.logDiagnostic("auto.queue.requeue", "ok", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(item, this.plugin.getAutoTranslationQueuedDiagnosticState(item), DIAGNOSTIC_REASON_CODES.REQUEUED),
                key: this.plugin.getTextFingerprint(item.cacheKey),
                delayMs,
                queueLength: this.plugin.autoTranslationQueue.length
            });
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "requeued",
                item,
                this.plugin.getAutoTranslationQueuedDiagnosticState(item),
                DIAGNOSTIC_REASON_CODES.REQUEUED,
                { delayMs }
            );
        }
    }

    enqueueAutoTranslationItem(item) {
        if (!item?.cacheKey) return false;
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return false;
        }
        this.plugin.pruneAutoTranslationActiveState();
        const queuedItem = this.plugin.withAutoTranslationPriority(item);
        const allowActiveRequeue = Boolean(queuedItem.daitAllowActiveRequeue);
        delete queuedItem.daitAllowActiveRequeue;
        const existingIndex = this.plugin.autoTranslationQueue.findIndex(queued => queued.cacheKey === queuedItem.cacheKey);
        if (existingIndex >= 0) {
            const existing = this.plugin.autoTranslationQueue[existingIndex];
            this.plugin.autoTranslationQueue[existingIndex] = (queuedItem.priority ?? Number.MAX_SAFE_INTEGER) < (existing.priority ?? Number.MAX_SAFE_INTEGER)
                ? { ...existing, ...queuedItem }
                : { ...queuedItem, ...existing };
        }
        else if (this.plugin.hasActiveAutoTranslationKey(queuedItem.cacheKey) && !allowActiveRequeue) {
            this.plugin.logDiagnostic("auto.queue.enqueue", "dedupe-active", {
                ...this.plugin.getAutoTranslationDiagnosticMeta(queuedItem, DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT, DIAGNOSTIC_REASON_CODES.DEDUPE_ACTIVE),
                key: this.plugin.getTextFingerprint(queuedItem.cacheKey)
            });
            return false;
        }
        else {
            this.plugin.autoTranslationQueue.push(queuedItem);
        }
        this.plugin.autoTranslationQueuedKeys.add(queuedItem.cacheKey);
        this.plugin.sortAutoTranslationQueue();
        this.plugin.logDiagnostic("auto.queue.enqueue", "ok", {
            ...this.plugin.getAutoTranslationDiagnosticMeta(queuedItem, this.plugin.getAutoTranslationQueuedDiagnosticState(queuedItem), DIAGNOSTIC_REASON_CODES.ENQUEUED),
            key: this.plugin.getTextFingerprint(queuedItem.cacheKey),
            queueLength: this.plugin.autoTranslationQueue.length,
            priority: Math.round(Number(queuedItem.priority || 0))
        });
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "queued",
            queuedItem,
            this.plugin.getAutoTranslationQueuedDiagnosticState(queuedItem),
            DIAGNOSTIC_REASON_CODES.ENQUEUED,
            { priority: Math.round(Number(queuedItem.priority || 0)) }
        );
        return true;
    }

    hasActiveAutoTranslationKey(cacheKey) {
        this.plugin.pruneAutoTranslationActiveState();
        return Boolean(cacheKey && (
            this.plugin.autoTranslationQueuedKeys.has(cacheKey)
            || this.plugin.autoTranslationInFlightKeys.has(cacheKey)
            || this.plugin.autoTranslationRenderPendingKeys?.has?.(cacheKey)
        ));
    }

    pruneAutoTranslationActiveState(now = Date.now()) {
        this.plugin.pruneAutoTranslationRenderPendingKeys();
        if (this.plugin.autoTranslationQueuedKeys.size) {
            const queuedKeys = new Set(this.plugin.autoTranslationQueue.map(item => item?.cacheKey).filter(Boolean));
            [...this.plugin.autoTranslationQueuedKeys].forEach(key => {
                if (!queuedKeys.has(key) && !this.plugin.autoTranslationInFlightKeys.has(key) && !this.plugin.autoTranslationRenderPendingKeys?.has?.(key)) {
                    this.plugin.autoTranslationQueuedKeys.delete(key);
                    this.plugin.logDiagnostic("auto.queue.active", "prune", {
                        reason: "ghost-queued-key",
                        key: this.plugin.getTextFingerprint(key)
                    });
                }
            });
        }

        if (!this.plugin.autoTranslationInFlightKeys.size) {
            this.plugin.autoTranslationInFlightStartedAt.clear();
            this.plugin.autoTranslationInFlightTokens.clear();
            this.plugin.autoTranslationVisibleLongInFlightKeys.clear();
            if (this.plugin.autoTranslationInFlight || this.plugin.autoTranslationInFlightItems || this.plugin.autoTranslationPrefetchInFlight) {
                this.plugin.autoTranslationInFlight = 0;
                this.plugin.autoTranslationInFlightItems = 0;
                this.plugin.autoTranslationPrefetchInFlight = 0;
            }
            return;
        }

        let removed = 0;
        const staleAfterMs = Math.max(AUTO_TRANSLATE_IN_FLIGHT_STALE_MS, AUTO_TRANSLATE_REQUEST_TIMEOUT_MS * 2);
        [...this.plugin.autoTranslationInFlightKeys].forEach(key => {
            const startedAt = Number(this.plugin.autoTranslationInFlightStartedAt.get(key) || 0);
            if (!startedAt) {
                this.plugin.autoTranslationInFlightStartedAt.set(key, now);
                return;
            }
            if (now - startedAt < staleAfterMs) return;
            this.plugin.autoTranslationInFlightKeys.delete(key);
            this.plugin.autoTranslationVisibleLongInFlightKeys.delete(key);
            this.plugin.autoTranslationInFlightStartedAt.delete(key);
            this.plugin.autoTranslationInFlightTokens.delete(key);
            removed++;
            this.plugin.logDiagnostic("auto.queue.active", "prune", {
                reason: "stale-in-flight",
                key: this.plugin.getTextFingerprint(key),
                ageMs: now - startedAt
            });
        });

        if (!removed) return;
        this.plugin.autoTranslationInFlightItems = Math.min(this.plugin.autoTranslationInFlightItems, this.plugin.autoTranslationInFlightKeys.size);
        if (!this.plugin.autoTranslationInFlightKeys.size) {
            this.plugin.autoTranslationInFlight = 0;
            this.plugin.autoTranslationInFlightItems = 0;
            this.plugin.autoTranslationPrefetchInFlight = 0;
            this.plugin.autoTranslationVisibleLongInFlightKeys.clear();
            return;
        }
        this.plugin.autoTranslationInFlight = Math.min(this.plugin.autoTranslationInFlight, this.plugin.autoTranslationInFlightKeys.size);
        this.plugin.autoTranslationPrefetchInFlight = Math.min(this.plugin.autoTranslationPrefetchInFlight, this.plugin.autoTranslationInFlight);
    }

    pruneAutoTranslationRenderPendingKeys() {
        if (!this.plugin.autoTranslationRenderPendingKeys?.size) return;
        const queuedCacheKeys = new Set(this.plugin.autoTranslationRenderQueue.map(task => task?.cacheKey).filter(Boolean));
        [...this.plugin.autoTranslationRenderPendingKeys].forEach(cacheKey => {
            if (!queuedCacheKeys.has(cacheKey)) this.plugin.autoTranslationRenderPendingKeys.delete(cacheKey);
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
        const key = this.plugin.getAutoTranslationRecentRenderKey(cacheKey, text, requestOptions);
        if (!key) return;
        if (!this.plugin.autoTranslationRecentRenders?.set) this.plugin.autoTranslationRecentRenders = new Map();
        this.plugin.autoTranslationRecentRenders.set(key, {
            at: Date.now(),
            expiresAt: Date.now() + AUTO_TRANSLATE_RECENT_RENDER_TTL_MS,
            validationQuality: meta.validationQuality || "",
            validationReason: meta.validationReason || ""
        });
        this.plugin.pruneRecentAutoTranslationRenders();
    }

    getRecentAutoTranslationRender(cacheKey, text, requestOptions = null, now = Date.now()) {
        this.plugin.pruneRecentAutoTranslationRenders(now);
        const key = this.plugin.getAutoTranslationRecentRenderKey(cacheKey, text, requestOptions);
        if (!key) return null;
        return this.plugin.autoTranslationRecentRenders?.get?.(key) || null;
    }

    pruneRecentAutoTranslationRenders(now = Date.now()) {
        if (!this.plugin.autoTranslationRecentRenders?.size) return;
        for (const [key, entry] of [...this.plugin.autoTranslationRecentRenders.entries()]) {
            if (Number(entry?.expiresAt || 0) <= now) this.plugin.autoTranslationRecentRenders.delete(key);
        }
        while (this.plugin.autoTranslationRecentRenders.size > AUTO_TRANSLATE_RECENT_RENDER_MAX) {
            this.plugin.autoTranslationRecentRenders.delete(this.plugin.autoTranslationRecentRenders.keys().next().value);
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
        this.plugin.pruneAutoTranslationPartialResults(now);
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
        const inFlight = Number(this.plugin.autoTranslationInFlight || 0);
        try {
            controller.abort();
        }
        catch {}
        if (inFlight) this.plugin.logDiagnostic("auto.queue.abort", "ok", { reason, inFlight });
        return true;
    }

    createAutoTranslationInFlightToken(cacheKey = "") {
        this.plugin.autoTranslationInFlightTokenCounter++;
        return `${Date.now().toString(36)}:${this.plugin.autoTranslationInFlightTokenCounter.toString(36)}:${this.plugin.getTextFingerprint(cacheKey)}`;
    }

    markAutoTranslationInFlightItem(item, startedAt = Date.now()) {
        if (!item?.cacheKey) return;
        const token = this.plugin.createAutoTranslationInFlightToken(item.cacheKey);
        item.daitInFlightToken = token;
        this.plugin.autoTranslationInFlightKeys.add(item.cacheKey);
        if (this.plugin.isLongAutoTranslationItem(item) && !this.plugin.isAutoTranslationPrefetchItem(item)) {
            this.plugin.autoTranslationVisibleLongInFlightKeys.add(item.cacheKey);
        }
        this.plugin.autoTranslationInFlightStartedAt.set(item.cacheKey, startedAt);
        this.plugin.autoTranslationInFlightTokens.set(item.cacheKey, token);
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "in-flight",
            item,
            DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
            DIAGNOSTIC_REASON_CODES.REQUEST_STARTED,
            { startedAt }
        );
    }

    heartbeatAutoTranslationInFlightItem(item, now = Date.now()) {
        if (!this.plugin.isAutoTranslationInFlightItemCurrent(item)) return false;
        this.plugin.autoTranslationInFlightStartedAt.set(item.cacheKey, now);
        return true;
    }

    isAutoTranslationInFlightItemCurrent(item) {
        if (!item?.cacheKey || !this.plugin.isAutoTranslationRenderRequestCurrent(item.requestOptions)) return false;
        if (!this.plugin.autoTranslationInFlightKeys.has(item.cacheKey)) return false;
        if (!item.daitInFlightToken) return !this.plugin.autoTranslationInFlightTokens.has(item.cacheKey);
        return this.plugin.autoTranslationInFlightTokens.get(item.cacheKey) === item.daitInFlightToken;
    }

    isAutoTranslationInFlightTokenOwned(item) {
        if (!item?.cacheKey || !this.plugin.autoTranslationInFlightKeys.has(item.cacheKey)) return false;
        if (!item.daitInFlightToken) return !this.plugin.autoTranslationInFlightTokens.has(item.cacheKey);
        return this.plugin.autoTranslationInFlightTokens.get(item.cacheKey) === item.daitInFlightToken;
    }

    isAutoTranslationWorkCurrent(item) {
        if (!item?.daitInFlightToken) return this.plugin.isAutoTranslationRenderRequestCurrent(item?.requestOptions);
        return this.plugin.isAutoTranslationInFlightItemCurrent(item);
    }

    finishAutoTranslationInFlightItem(item) {
        const owned = this.plugin.isAutoTranslationInFlightTokenOwned(item);
        if (owned) {
            if (!item.daitRequeued) this.plugin.autoTranslationQueuedKeys.delete(item.cacheKey);
            this.plugin.autoTranslationInFlightKeys.delete(item.cacheKey);
            this.plugin.autoTranslationVisibleLongInFlightKeys.delete(item.cacheKey);
            this.plugin.autoTranslationInFlightStartedAt.delete(item.cacheKey);
            this.plugin.autoTranslationInFlightTokens.delete(item.cacheKey);
        }
        delete item.daitInFlightToken;
        return owned;
    }

    promoteQueuedAutoTranslationItem(cacheKey, target) {
        const index = this.plugin.autoTranslationQueue.findIndex(item => item.cacheKey === cacheKey);
        if (index < 0) return;
        const candidate = { ...this.plugin.autoTranslationQueue[index], ...target };
        delete candidate.priority;
        const promoted = this.plugin.withAutoTranslationPriority(candidate);
        if ((promoted.priority ?? Number.MAX_SAFE_INTEGER) >= (this.plugin.autoTranslationQueue[index].priority ?? Number.MAX_SAFE_INTEGER)) return;
        this.plugin.autoTranslationQueue[index] = promoted;
        this.plugin.sortAutoTranslationQueue();
        this.plugin.logDiagnostic("auto.queue.promote", "ok", {
            key: this.plugin.getTextFingerprint(cacheKey),
            priority: Math.round(Number(promoted.priority || 0))
        });
    }

    makeRoomForAutoTranslationItem(item, queueLimit) {
        return this.plugin.translationScheduler.makeRoomForItem(item, queueLimit);
    }

    sortAutoTranslationQueue() {
        this.plugin.translationScheduler.sortQueue(this.plugin.autoTranslationQueue);
    }

    withAutoTranslationPriority(target, options = {}) {
        if (!target) return target;
        const priority = options.preserveExisting && Number.isFinite(Number(target.priority))
            ? Number(target.priority)
            : this.plugin.getAutoTranslationTargetPriority(target);
        return { ...target, priority };
    }

    getAutoTranslationTargetPriority(target) {
        const contentPriority = this.plugin.getViewportPriority(target?.content);
        const messagePriority = this.plugin.getViewportPriority(target?.messageNode);
        const kindOffset = target?.targetKind === "reply-preview" ? 20 : 0;
        return Math.min(contentPriority, messagePriority) + kindOffset;
    }

    cacheAutoTranslationResult(item, translated) {
        this.plugin.cacheAutoTranslationResultWithOptions(item?.cacheKey, item?.text, item?.requestOptions, translated);
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
        this.plugin.setTranslationCache(cacheKey, translated);
        this.plugin.clearAutoTranslationPartialResult(cacheKey);
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
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "cached",
            { cacheKey, text, requestOptions },
            DIAGNOSTIC_MESSAGE_STATES.CACHED,
            DIAGNOSTIC_REASON_CODES.CACHE_HIT,
            { valueLength: String(translated || "").length }
        );
        this.plugin.clearAutoTranslationFailure(cacheKey, requestOptions);
        this.plugin.clearAutoTextTranslationFailure(text, requestOptions);
    }

    hasCacheableAutoTranslationTarget(item) {
        return this.plugin.getAutoTranslationPendingTargets(item).some(target => {
            if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
            if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) return false;
            return this.plugin.isAutoTranslationTargetIdentityCurrent(target, item)
                || Boolean(this.plugin.getAutoTranslationTargetIdentityUpgrade(target, item));
        });
    }

    hasInvalidAutoTranslationTarget(item) {
        return this.plugin.getAutoTranslationPendingTargets(item).some(target => {
            if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
            // A message that changed meanwhile does not make the result wrong: it is still the
            // translation of item.text (renderAutoTranslationResult caches it too).
            if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) return false;
            return !this.plugin.isAutoTranslationTargetIdentityCurrent(target, item)
                && !this.plugin.getAutoTranslationTargetIdentityUpgrade(target, item);
        });
    }

    shouldCacheAutoTranslationResultFromRequest(item) {
        if (!item?.cacheKey || !item?.text || !item?.requestOptions) return false;
        if (!this.plugin.isAutoTranslationRequestCurrent(item.requestOptions)) return false;
        if (!this.plugin.isVolatileTranslationCacheKey(item.cacheKey)) return true;
        return Boolean(this.plugin.getAutoTextTranslationCacheKey(item.text, item.requestOptions));
    }

    cacheAutoTranslationIdentityUpgrades(item, translated) {
        this.plugin.getAutoTranslationPendingTargets(item).forEach(target => {
            const upgrade = this.plugin.getAutoTranslationTargetIdentityUpgrade(target, item);
            if (upgrade?.cacheKey) this.plugin.cacheAutoTranslationResultWithOptions(upgrade.cacheKey, item.text, upgrade.requestOptions, translated);
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
            const failure = this.plugin.createAutoTranslationFailure(item.cacheKey, error);
            let retained = false;
            if (this.plugin.shouldRetainAutoTranslationFailureItem(item, error)) {
                retained = this.plugin.retainBlockedVisibleAutoTranslationItem(item, {
                    delayMs: failure.retryAfterMs,
                    allowActiveRequeue: true,
                    reasonCode: this.plugin.getAutoTranslationFailureType(error) === "local-unavailable"
                        ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE
                        : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN
                });
            }
            if (!retained) {
                this.plugin.autoTranslationFailures.set(item.cacheKey, failure);
                this.plugin.pruneAutoTranslationFailureMapSize();
                this.plugin.markAutoTextTranslationFailure(item, error, failure);
            }
            else {
                this.plugin.rememberAutoTranslationFailureHistory(item.cacheKey, failure);
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
            this.plugin.clearAutoTranslationPendingTargets(item?.cacheKey);
            return false;
        }
    }

    clearPendingAutoTranslationItem(item) {
        this.plugin.consumeAutoTranslationTargets(item).forEach(target => {
            this.plugin.removeAutoTranslationLoadingNode(target, item.cacheKey, { force: true });
            this.plugin.removeAutoTranslationNode(target, item.cacheKey);
        });
    }

    clearAutoTranslationFailure(cacheKey, requestOptions = this.plugin.getAutoTranslationOptions(), options = {}) {
        if (cacheKey) {
            this.plugin.autoTranslationFailures.delete(cacheKey);
            this.plugin.autoTranslationFailureHistory.delete(cacheKey);
        }
        if (options.clearProvider) {
            const providerKey = this.plugin.getAutoTranslationProviderKey(requestOptions);
            if (providerKey) this.plugin.autoTranslationProviderFailures.delete(providerKey);
        }
    }

    markAutoTranslationFailure(item, error, options = {}) {
        if (this.plugin.isRequestCancelled(error)) {
            this.plugin.clearPendingAutoTranslationItemSafely(item);
            return;
        }
        const storageError = this.plugin.getAutoTranslationStorageErrorForItem(item, error);
        const failure = this.plugin.createAutoTranslationFailure(item.cacheKey, storageError);
        storageError.autoTranslationFailureCount = failure.count;
        this.plugin.consumeAutoTranslationTargets(item).forEach(target => {
            if (this.plugin.shouldRenderAutoTranslationFailure(storageError)) {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "failed",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    DIAGNOSTIC_REASON_CODES.FAILURE,
                    {
                        type: this.plugin.getAutoTranslationFailureType(storageError),
                        renderFailure: true,
                        invalidReason: storageError?.autoTranslationInvalidReason || "",
                        validationQuality: storageError?.autoTranslationValidationQuality || ""
                    }
                );
                this.plugin.renderAutoTranslationFailure(target, item.cacheKey, storageError);
                return;
            }
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "failed",
                { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.FAILURE,
                {
                    type: this.plugin.getAutoTranslationFailureType(storageError),
                    renderFailure: false,
                    invalidReason: storageError?.autoTranslationInvalidReason || "",
                    validationQuality: storageError?.autoTranslationValidationQuality || ""
                }
            );
            this.plugin.removeAutoTranslationLoadingNode(target, item.cacheKey, { force: true });
            this.plugin.removeAutoTranslationNode(target, item.cacheKey);
        });
        this.plugin.autoTranslationFailures.set(item.cacheKey, failure);
        this.plugin.pruneAutoTranslationFailureMapSize();
        this.plugin.markAutoTextTranslationFailure(item, storageError, failure);
        const retainedKeys = new Set();
        if (this.plugin.shouldRetainAutoTranslationFailureItem(item, error)) {
            const retained = this.plugin.retainBlockedVisibleAutoTranslationItem(item, {
                delayMs: failure.retryAfterMs,
                allowActiveRequeue: true,
                reasonCode: this.plugin.getAutoTranslationFailureType(error) === "local-unavailable"
                    ? DIAGNOSTIC_REASON_CODES.LOCAL_UNAVAILABLE
                    : DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN
            });
            if (retained && item?.cacheKey) retainedKeys.add(item.cacheKey);
        }
        if (item?.cacheKey && retainedKeys.has(item.cacheKey)) {
            // The retained item retries on its own delay, but its count must survive so the
            // next failure backs off further.
            this.plugin.rememberAutoTranslationFailureHistory(item.cacheKey, failure);
            this.plugin.autoTranslationFailures.delete(item.cacheKey);
            this.plugin.clearAutoTextTranslationFailure(item.text, item.requestOptions);
        }
        if (this.plugin.shouldMarkAutoTranslationProviderFailureForItem(item, error, options)) this.plugin.markAutoTranslationProviderFailure(item.requestOptions, error, failure, { skipCacheKeys: retainedKeys });
        if (!failure.terminal) this.plugin.scheduleAutoTranslationRetryScan(failure.retryAfterMs);
        if (!storageError?.autoTranslationWeakFailure) this.plugin.showAutoTranslateError(error);
    }

    // A result that cannot be drawn (its emoji images cannot be restored) is recorded as a final
    // invalid output, so the scan does not request the same message again on every pass.
    markAutoTranslationUndrawableResult(cacheKey, reason = "emoji-restore-failed") {
        const key = String(cacheKey || "");
        if (!key) return null;
        const failure = this.plugin.createAutoTranslationFailure(key, this.plugin.createFinalInvalidAutoTranslationError(reason));
        this.plugin.autoTranslationFailures.set(key, failure);
        this.plugin.pruneAutoTranslationFailureMapSize();
        this.plugin.clearAutoTranslationPartialResult(key);
        return failure;
    }

    getAutoTranslationStorageErrorForItem(item, error) {
        if (!item?.daitPrefetchRequest || !this.plugin.isWeakAutoTranslationPrefetchFailure(error)) return error;
        const storageError = new Error(error?.message || this.plugin.t("autoTranslateTargetFailed"));
        storageError.autoTranslationFinalInvalidOutput = Boolean(error?.autoTranslationFinalInvalidOutput);
        storageError.autoTranslationTerminalFailure = Boolean(error?.autoTranslationTerminalFailure);
        storageError.autoTranslationInvalidReason = error?.autoTranslationInvalidReason || this.plugin.getAutoTranslationFailureType(error) || "invalid-output";
        storageError.autoTranslationWeakFailure = true;
        // Keep the truncated type so its growing backoff applies to prefetch too.
        if (error?.modelOutputTruncated) storageError.modelOutputTruncated = true;
        storageError.retryAfterMs = Math.min(
            storageError.autoTranslationTerminalFailure ? AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL : AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
            Math.max(1000, Number(error?.retryAfterMs || AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL))
        );
        return storageError;
    }

    isWeakAutoTranslationPrefetchFailure(error) {
        return ["invalid-output", "timeout", "network", "server", "rate-limit", "local-unavailable", "truncated"].includes(this.plugin.getAutoTranslationFailureType(error));
    }

    pruneAutoTranslationFailureMapSize(now = Date.now()) {
        if (this.plugin.autoTranslationFailures.size <= AUTO_TRANSLATE_FAILURE_LIMIT) return;
        for (const [key, failure] of this.plugin.autoTranslationFailures.entries()) {
            if (this.plugin.isAutoTranslationFailureExpired(failure, now)
                || this.plugin.autoTranslationFailures.size > AUTO_TRANSLATE_FAILURE_LIMIT) {
                this.plugin.autoTranslationFailures.delete(key);
            }
            if (this.plugin.autoTranslationFailures.size <= AUTO_TRANSLATE_FAILURE_LIMIT) break;
        }
    }

    shouldMarkAutoTranslationProviderFailureForItem(item, error, options = {}) {
        if (options.markProvider === false) return false;
        if (!item?.daitPrefetchRequest) return true;
        return this.plugin.isProviderWideAutoTranslationPrefetchFailure(error);
    }

    isProviderWideAutoTranslationPrefetchFailure(error) {
        return ["auth", "quota", "rate-limit", "client", "local-unavailable"].includes(this.plugin.getAutoTranslationFailureType(error));
    }

    markAutoTranslationProviderFailure(requestOptions, error, itemFailure = null, options = {}) {
        return this.plugin.translationScheduler.markProviderFailure(requestOptions, error, itemFailure, options);
    }

    getAutoTranslationProviderFailure(requestOptions = this.plugin.getAutoTranslationOptions()) {
        return this.plugin.translationScheduler.getProviderFailure(requestOptions);
    }

    isAutoTranslationProviderCoolingDown(requestOptions = this.plugin.getAutoTranslationOptions(), now = Date.now()) {
        return this.plugin.translationScheduler.isProviderCoolingDown(requestOptions, now);
    }

    createAutoTranslationFailure(cacheKey, error) {
        const previous = this.plugin.autoTranslationFailures.get(cacheKey);
        const previousCount = typeof previous === "object" ? Number(previous.count || 0) : 0;
        const historyCount = this.plugin.getAutoTranslationFailureHistoryCount(cacheKey);
        const count = Math.min(5, Math.max(previousCount, historyCount) + 1);
        const retryAfterMs = this.plugin.getAutoTranslationRetryAfter(error, count);
        const now = Date.now();
        const terminal = Boolean(error?.autoTranslationTerminalFailure);
        const failure = {
            at: now,
            count,
            retryAfterMs,
            retryAt: terminal ? 0 : now + retryAfterMs,
            type: this.plugin.getAutoTranslationFailureType(error),
            terminal,
            weak: Boolean(error?.autoTranslationWeakFailure),
            invalidReason: String(error?.autoTranslationInvalidReason || "")
        };
        if (error && typeof error === "object") error.autoTranslationFailureCount = count;
        this.plugin.logDiagnostic("auto.failure", failure.terminal ? "terminal" : "retry", {
            key: this.plugin.getTextFingerprint(cacheKey),
            type: failure.type,
            count,
            retryAfterMs,
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
        this.plugin.autoTranslationFailureHistory.set(key, {
            count,
            at: now,
            type: String(failure.type || "")
        });
        if (this.plugin.autoTranslationFailureHistory.size <= AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT) return;
        for (const [entryKey, entry] of this.plugin.autoTranslationFailureHistory.entries()) {
            if (now - Number(entry?.at || 0) > AUTO_TRANSLATE_FAILURE_HISTORY_TTL
                || this.plugin.autoTranslationFailureHistory.size > AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT) {
                this.plugin.autoTranslationFailureHistory.delete(entryKey);
            }
            if (this.plugin.autoTranslationFailureHistory.size <= AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT) break;
        }
    }

    getAutoTranslationFailureHistoryCount(cacheKey, now = Date.now()) {
        const key = String(cacheKey || "");
        if (!key) return 0;
        const history = this.plugin.autoTranslationFailureHistory.get(key);
        if (!history) return 0;
        if (now - Number(history.at || 0) > AUTO_TRANSLATE_FAILURE_HISTORY_TTL) {
            this.plugin.autoTranslationFailureHistory.delete(key);
            return 0;
        }
        return Math.max(0, Number(history.count || 0) || 0);
    }

    isAutoTranslationFailureExpired(failure, now = Date.now()) {
        if (!failure) return true;
        if (typeof failure === "number") return now - failure >= AUTO_TRANSLATE_FAILURE_TTL;
        if (this.plugin.isTerminalAutoTranslationFailure(failure) && !Number(failure.retryAt || 0)) {
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
        const failure = this.plugin.autoTranslationFailures.get(key);
        if (failure && this.plugin.isAutoTranslationFailureExpired(failure)) {
            this.plugin.rememberAutoTranslationFailureHistory(key, failure);
            this.plugin.autoTranslationFailures.delete(key);
            return null;
        }
        return failure || null;
    }

    getAutoTranslationRetryAfter(error, count = 1) {
        const type = this.plugin.getAutoTranslationFailureType(error);
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
        if (this.plugin.isRequestCancelled(error)) return "cancelled";
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
        // 402 Payment Required: e.g. DeepSeek "Insufficient Balance".
        if (status === 402) return "quota";
        if (status === 429) return "rate-limit";
        if (status >= 500) return "server";
        if (this.plugin.isTimeoutError(error)) return "timeout";
        if (this.plugin.isNetworkError(error)) return "network";
        if (status >= 400) return "client";
        return "invalid-output";
    }

    shouldShowAutoTranslationWarning(error) {
        return this.plugin.isMajorAutoTranslationFailure(error) || this.plugin.settings.ui?.showAutoTranslateWarnings === true;
    }

    isMajorAutoTranslationFailure(error) {
        return ["auth", "quota", "rate-limit", "server", "client", "parse", "local-unavailable"].includes(this.plugin.getAutoTranslationFailureType(error));
    }

    addAutoTranslationPendingTarget(cacheKey, target) {
        if (!cacheKey || !target?.messageNode || !target?.content) return;
        const entry = this.plugin.autoTranslationPendingTargets.get(cacheKey) || { targets: [] };
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
        this.plugin.sortAutoTranslationTargets(entry.targets);
        this.plugin.autoTranslationPendingTargets.set(cacheKey, entry);
    }

    sortAutoTranslationTargets(targets) {
        targets.sort((left, right) => {
            const priorityDelta = (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER);
            if (priorityDelta) return priorityDelta;
            return String(this.plugin.peekTranslationOwnerId(left?.content) || "").localeCompare(String(this.plugin.peekTranslationOwnerId(right?.content) || ""));
        });
    }

    getAutoTranslationPendingTargets(item) {
        const targets = this.plugin.autoTranslationPendingTargets.get(item.cacheKey)?.targets || [];
        return targets.length ? targets : [item];
    }

    consumeAutoTranslationTargets(item) {
        const targets = this.plugin.getAutoTranslationPendingTargets(item);
        this.plugin.autoTranslationPendingTargets.delete(item.cacheKey);
        return targets;
    }

    clearAutoTranslationPendingTargets(cacheKey) {
        if (!cacheKey) return;
        this.plugin.autoTranslationPendingTargets.delete(cacheKey);
    }

    scheduleAutoTranslationRetryScan(delayMs = AUTO_TRANSLATE_FAILURE_TTL, options = {}) {
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("auto-disabled");
            return;
        }
        const minDelayMs = Math.max(0, Number(options.minDelayMs ?? 1000) || 0);
        const normalizedDelay = Math.max(minDelayMs, Number(delayMs) || AUTO_TRANSLATE_FAILURE_TTL);
        const retryAt = Date.now() + normalizedDelay;
        if (this.plugin.autoTranslationRetryTimer && this.plugin.autoTranslationRetryAt && this.plugin.autoTranslationRetryAt <= retryAt) return;
        if (this.plugin.autoTranslationRetryTimer) clearTimeout(this.plugin.autoTranslationRetryTimer);
        this.plugin.autoTranslationRetryAt = retryAt;
        this.plugin.autoTranslationRetryTimer = setTimeout(() => {
            this.plugin.autoTranslationRetryTimer = null;
            this.plugin.autoTranslationRetryAt = 0;
            if (!this.plugin.isStarted) return;
            this.plugin.queueScan();
        }, normalizedDelay + 100);
        this.plugin.unrefTimer(this.plugin.autoTranslationRetryTimer);
    }

    getLocalAutoTranslationMaxTokensForLength(sourceLength = 0, targetLanguage = this.plugin.settings.translation.targetLanguage, baseMaxTokens = DEFAULT_SETTINGS.translation.maxTokens) {
        const configured = this.plugin.normalizeRequestNumber(
            baseMaxTokens,
            DEFAULT_SETTINGS.translation.maxTokens,
            { min: 1, integer: true }
        );
        const dynamic = this.plugin.getLongTextMaxTokensForLength(sourceLength, targetLanguage);
        return Math.max(256, Math.min(1200, Math.max(configured, dynamic)));
    }
}

module.exports = { AutoTranslationQueueCore };
