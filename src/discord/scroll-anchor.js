"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const {
    DISCORD_MESSAGE_NODE_SELECTOR,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    AUTO_TRANSLATE_RENDER_MAX_PER_FRAME,
    AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS,
    AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE,
    AUTO_TRANSLATE_SCROLL_STILL_MS,
    AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX,
    AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR,
    AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS,
    AUTO_TRANSLATE_CACHE_DRAW_MAX_EVALUATIONS,
    AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES,
    AUTO_TRANSLATE_CACHE_DRAW_MEMO_MAX,
    AUTO_TRANSLATE_FINISHED_LINE_SELECTOR,
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
    DIAGNOSTIC_MESSAGE_STATES,
    TRANSLATION_VALIDATION_QUALITIES,
    DIAGNOSTIC_REASON_CODES,
    DEFAULT_SETTINGS
} = require("../constants");

class DiscordScrollAnchorController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    completeAutoTranslationFromCache(messageNode, content, text, translated, cacheKey, canRender = true, requestOptions = null, textOptions = null, renderMeta = null, domText = "") {
        // A kept partial result was validated when it arrived; it is by definition not cacheable.
        if (requestOptions && !renderMeta?.partial && this.plugin.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) {
            this.plugin.deleteTranslationCacheCandidates(cacheKey, ...this.plugin.getTranslationCacheAliases(text, requestOptions));
            return;
        }
        this.plugin.removeQueuedAutoTranslationItem(cacheKey);
        const currentTarget = { messageNode, content, text, domText, textOptions, cacheKey, requestOptions };
        const pendingTargets = this.plugin.getAutoTranslationPendingTargets(currentTarget);
        const ownerId = this.plugin.getTranslationOwnerId(content);
        const targets = pendingTargets.some(target => this.plugin.getTranslationOwnerId(target?.content) === ownerId)
            ? pendingTargets
            : [currentTarget, ...pendingTargets];

        if (!canRender) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                currentTarget,
                DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                { canRender }
            );
        }
        targets.forEach(target => {
            if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED
                );
                return;
            }
            if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) {
                this.plugin.removeAutoTranslationNode(target, cacheKey);
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED
                );
                return;
            }
            if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target, currentTarget)) {
                this.plugin.removeAutoTranslationNode(target, cacheKey);
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED
                );
                return;
            }
            if (this.plugin.isManualTranslationInFlight(target.content, this.plugin.getAutoTranslationTargetDomText(target))) {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.CACHED,
                    DIAGNOSTIC_REASON_CODES.MANUAL_LINE_PRESENT
                );
                return;
            }
            if (this.plugin.isAutoTranslationCacheTargetDrawable(target)) {
                this.plugin.queueAutoTranslationRenderTask({
                    kind: "cache",
                    target,
                    translated,
                    cacheKey,
                    requestOptions,
                    priority: target.priority,
                    run: () => this.renderAutoTranslationCacheTarget(target, translated, cacheKey, requestOptions, renderMeta ? { renderMeta } : {})
                });
            }
            else {
                this.plugin.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                    DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT,
                    { fromCache: true }
                );
            }
        });
        this.plugin.clearAutoTranslationPendingTargets(cacheKey);
    },

    // A cached translation may be drawn when its message is in the visible chat or within the draw
    // buffer around it. Without layout (offline tests), fall back to the strict visibility check.
    isAutoTranslationCacheTargetDrawable(target, context = null) {
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
        const near = this.isElementNearChatBand(target.content, context);
        if (near !== null) return near;
        return this.plugin.isElementVisibleInViewport(target.messageNode) && this.plugin.isElementVisibleInViewport(target.content);
    },

    isElementNearChatBand(element, context = null) {
        const rect = this.plugin.getCachedElementRect(element, context);
        if (!rect || !(Number(rect.width) > 0) || !(Number(rect.height) > 0)) return null;
        const band = context?.cacheDrawBand || this.getScrollContainerBand(this.getTranslationScrollContainer(element));
        if (!band) return null;
        const buffer = this.getCachedDrawBufferPx(band);
        return Number(rect.bottom) > band.top - buffer && Number(rect.top) < band.bottom + buffer;
    },

    getCachedDrawBufferPx(band) {
        return Math.max(AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX, (band.bottom - band.top) * AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR);
    },

    // Cached translations need no model request. Discord mounts messages just outside the visible chat
    // as it scrolls; drawing their cached lines there once the chat is still means messages scrolled
    // back into view already show them. Scheduled only where idle callbacks exist (Discord), so offline
    // tests run the pass directly.
    scheduleCachedTranslationDrawPass(delayMs = 0) {
        if (!this.plugin.isStarted || this.plugin.cachedTranslationDrawTimer || this.plugin.cachedTranslationDrawIdle != null) return;
        if (typeof window === "undefined" || typeof window?.requestIdleCallback !== "function") return;
        if (!this.plugin.isAutoTranslateEnabled()) return;
        const waitMs = Math.max(Number(delayMs) || 0, this.plugin.getAutoTranslationScrollStillRemainingMs());
        this.plugin.cachedTranslationDrawTimer = this.plugin.unrefTimer(setTimeout(() => {
            this.plugin.cachedTranslationDrawTimer = null;
            if (!this.plugin.isStarted || typeof window?.requestIdleCallback !== "function") return;
            this.plugin.cachedTranslationDrawIdle = window.requestIdleCallback(deadline => {
                this.plugin.cachedTranslationDrawIdle = null;
                this.runCachedTranslationDrawPass(deadline);
            }, { timeout: AUTO_TRANSLATE_SCROLL_STILL_MS });
        }, waitMs));
    },

    cancelCachedTranslationDrawPass() {
        if (this.plugin.cachedTranslationDrawTimer) clearTimeout(this.plugin.cachedTranslationDrawTimer);
        this.plugin.cachedTranslationDrawTimer = null;
        if (this.plugin.cachedTranslationDrawIdle != null) {
            try { window.cancelIdleCallback?.(this.plugin.cachedTranslationDrawIdle); }
            catch {}
        }
        this.plugin.cachedTranslationDrawIdle = null;
    },

    runCachedTranslationDrawPass(deadline = null) {
        const stats = { messages: 0, settledMessages: 0, candidates: 0, memoHits: 0, evaluations: 0, queued: 0, pending: false };
        if (!this.plugin.isStarted || !this.plugin.isAutoTranslateEnabled()) return stats;
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return stats;
        if (this.plugin.isDiscordMediaViewerQuiet() || this.plugin.isDiscordMediaViewerOpen() || this.plugin.isQuickSettingsPanelOpen() || this.plugin.isDiscordSettingsSurfaceOpen()) return stats;
        const stillRemainingMs = this.plugin.getAutoTranslationScrollStillRemainingMs();
        if (stillRemainingMs > 0) {
            this.scheduleCachedTranslationDrawPass(stillRemainingMs);
            stats.pending = true;
            return stats;
        }
        const passStartedAt = this.plugin.getDiagnosticTime();
        try {
            const context = this.plugin.createScanContext({ messageNodes: [] });
            const selection = this.plugin.getCachedDrawMessageNodes(context);
            if (!selection.nodes.length) return stats;
            context.messageNodes = selection.nodes;
            context.cacheDrawBand = selection.band;
            this.plugin.rememberScanRangeElements(selection.nodes, context);
            const requestOptions = this.plugin.getAutoTranslationOptions();
            const intakeMode = this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui?.autoTranslateIntakeMode);
            const enhance = intakeMode !== "dom" && this.plugin.isBdfdbMessageIntakeAvailable();
            // The budget covers message work, not selection, and the nearest message is always handled.
            const startedAt = this.plugin.getDiagnosticTime();
            const idleMs = Number(deadline?.timeRemaining?.());
            const budgetMs = Number.isFinite(idleMs) && idleMs > 1 ? Math.min(AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS, idleMs) : AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS;
            for (const messageNode of selection.nodes) {
                if (this.isCachedDrawMessageSettled(messageNode)) {
                    stats.settledMessages++;
                    continue;
                }
                if (stats.messages > 0 && this.plugin.getDiagnosticTime() - startedAt >= budgetMs) {
                    stats.pending = true;
                    break;
                }
                stats.messages++;
                const domCandidates = this.plugin.createDomAutoTranslationCandidatesForMessage(messageNode, context);
                const candidates = enhance ? this.plugin.createBdfdbAutoTranslationCandidates(context, domCandidates) : domCandidates;
                const record = { configVersion: this.plugin.autoTranslationConfigVersion, drawnCount: 0, pendingKeys: [] };
                let settled = true;
                for (const candidate of candidates) {
                    stats.candidates++;
                    const outcome = this.queueCachedDrawForCandidate(candidate, requestOptions, context, stats.evaluations < AUTO_TRANSLATE_CACHE_DRAW_MAX_EVALUATIONS);
                    if (outcome.evaluated) stats.evaluations++;
                    if (outcome.status === "queued") {
                        stats.queued++;
                        if (!outcome.evaluated) stats.memoHits++;
                    }
                    if (outcome.status === "deferred") stats.pending = true;
                    if (outcome.status === "drawn") record.drawnCount++;
                    else if (outcome.status === "nothing") {
                        if (outcome.memoKey) record.pendingKeys.push(outcome.memoKey);
                    }
                    else settled = false;
                }
                if (settled) this.plugin.cachedDrawMessageMemo.set(messageNode, record);
                else this.plugin.cachedDrawMessageMemo.delete(messageNode);
            }
        }
        catch (error) {
            this.plugin.warnSanitized("Cached translation draw pass failed", error);
            return stats;
        }
        if (stats.pending) this.scheduleCachedTranslationDrawPass(AUTO_TRANSLATE_SCROLL_STILL_MS);
        if (stats.queued) {
            this.plugin.logDiagnostic("auto.cache-draw", "queued", {
                ...stats,
                ms: Math.round((this.plugin.getDiagnosticTime() - passStartedAt) * 10) / 10
            });
        }
        return stats;
    },

    // A message needs no work while its drawn lines are still there and its other targets are
    // still known to have nothing cached (or nothing worth translating) under the current settings.
    isCachedDrawMessageSettled(messageNode) {
        const record = this.plugin.cachedDrawMessageMemo?.get?.(messageNode);
        if (!record || record.configVersion !== this.plugin.autoTranslationConfigVersion) return false;
        const finishedLines = messageNode.querySelectorAll?.(AUTO_TRANSLATE_FINISHED_LINE_SELECTOR)?.length || 0;
        if (finishedLines < record.drawnCount) return false;
        return record.pendingKeys.every(memoKey => {
            const entry = this.getCachedDrawMemoEntry(memoKey);
            return Boolean(entry) && entry.result !== "hit";
        });
    },

    isDocumentScroller(scroller) {
        return !scroller || (typeof document !== "undefined" && (scroller === document.scrollingElement || scroller === document.documentElement));
    },

    // Mounted messages in and around the visible chat, nearest first. Messages are in document order,
    // top to bottom: a binary search finds the first one not above the chat, then the walk goes outward.
    getCachedDrawMessageNodes(context = null) {
        const firstMessage = document.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR);
        if (!firstMessage) {
            // No chat is mounted: do not keep the last channel's detached message list alive.
            this.plugin.cachedDrawScroller = null;
            return { nodes: [], band: null };
        }
        let scroller = this.plugin.cachedDrawScroller;
        if (!scroller?.isConnected || !scroller.contains?.(firstMessage)) {
            scroller = this.getTranslationScrollContainer(firstMessage);
            // The document fallback only means the chat does not overflow yet, so it is not kept.
            this.plugin.cachedDrawScroller = this.isDocumentScroller(scroller) ? null : scroller;
        }
        const band = this.getScrollContainerBand(scroller);
        if (!band) return { nodes: [], band: null };
        const root = this.plugin.cachedDrawScroller || firstMessage.closest?.("[data-list-id*='chat-messages']") || firstMessage.parentElement || document;
        const messages = [...(root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR) || [])]
            .filter(node => node?.isConnected && !node.parentElement?.closest?.(DISCORD_MESSAGE_NODE_SELECTOR));
        const buffer = this.getCachedDrawBufferPx(band);
        const measure = index => {
            const rect = this.plugin.getCachedElementRect(messages[index], context);
            if (!rect || !(Number(rect.height) > 0)) return null;
            const top = Number(rect.top);
            const bottom = Number(rect.bottom);
            const distance = bottom <= band.top ? band.top - bottom : top >= band.bottom ? top - band.bottom : 0;
            return { node: messages[index], top, bottom, distance };
        };
        let low = 0;
        let high = messages.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            const rect = this.plugin.getCachedElementRect(messages[middle], context);
            if (rect && Number(rect.bottom) <= band.top) low = middle + 1;
            else high = middle;
        }
        const nearby = [];
        let below = 0;
        for (let index = low; index < messages.length && below < AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES; index++) {
            const entry = measure(index);
            if (!entry) continue;
            if (entry.top >= band.bottom + buffer) break;
            nearby.push(entry);
            below++;
        }
        let above = 0;
        for (let index = low - 1; index >= 0 && above < AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES; index--) {
            const entry = measure(index);
            if (!entry) continue;
            if (entry.bottom <= band.top - buffer) break;
            nearby.push(entry);
            above++;
        }
        nearby.sort((left, right) => left.distance - right.distance || left.top - right.top);
        return { nodes: nearby.slice(0, AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES).map(entry => entry.node), band };
    },

    // Outcome statuses: drawn (already shows a finished line), nothing (memoised skip or miss),
    // queued, deferred (evaluation cap reached) or pending (a hit that cannot be drawn yet, or a
    // translation the user asked for is still in flight).
    queueCachedDrawForCandidate(candidate, baseOptions, context = null, allowEvaluation = true) {
        const messageNode = candidate?.messageNode;
        const content = candidate?.content;
        const text = String(candidate?.text || "");
        if (!text || !messageNode?.isConnected || !content?.isConnected) return { status: "nothing" };
        const domText = candidate.domText || text;
        if (this.hasFinishedTranslationLine(content, messageNode, domText)) return { status: "drawn" };
        if (this.plugin.isManualTranslationInFlight(content, domText, messageNode)) return { status: "pending" };
        const memoKey = this.getCachedDrawMemoKey(candidate, text);
        let entry = this.getCachedDrawMemoEntry(memoKey);
        const evaluated = !entry;
        if (!entry) {
            if (!allowEvaluation) return { status: "deferred" };
            entry = this.lookupCachedDrawTranslation(candidate, baseOptions, context);
            this.rememberCachedDrawMemoEntry(memoKey, entry);
        }
        if (entry.result !== "hit") return { status: "nothing", memoKey, evaluated };
        if (!this.plugin.isAutoTranslationCacheTargetDrawable({ messageNode, content }, context)) return { status: "pending", evaluated };
        // Drawing from the memo counts as a cache hit: keep the entry fresh like a regular lookup would.
        if (!evaluated && entry.valueKey) this.plugin.touchTranslationCache(entry.valueKey, { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
        this.plugin.removeQueuedAutoTranslationItem(entry.cacheKey);
        const target = {
            messageNode,
            content,
            text,
            domText: candidate.domText || "",
            textOptions: candidate.textOptions || null,
            targetKind: candidate.targetKind || "message",
            cacheKey: entry.cacheKey,
            requestOptions: entry.requestOptions,
            priority: this.getCachedDrawPriority(content, context)
        };
        this.plugin.queueAutoTranslationRenderTask({
            kind: "cache",
            target,
            translated: entry.translated,
            cacheKey: entry.cacheKey,
            requestOptions: entry.requestOptions,
            priority: target.priority,
            run: () => this.renderAutoTranslationCacheTarget(target, entry.translated, entry.cacheKey, entry.requestOptions, { drawPass: true, deleteKeys: entry.keys })
        });
        return { status: "queued", evaluated };
    },

    hasFinishedTranslationLine(content, messageNode, text) {
        return this.plugin.getTranslationLines(content).some(line => !line.classList?.contains?.("dait-translation-loading")
            && !line.classList?.contains?.("dait-translation-error")
            && this.plugin.isTranslationLineSourceMatch(line, text)
            && this.plugin.isTranslationLineMessageMatch(line, messageNode, content, text));
    },

    // Same lookups as the regular scan (evaluateAutoTranslationCandidate), without its side effects.
    lookupCachedDrawTranslation(candidate, baseOptions, context = null) {
        const text = String(candidate?.text || "");
        if (this.plugin.getAutoTranslationPrecheckSkipReason(text, baseOptions)) return { result: "skip" };
        const requestOptions = this.plugin.withAutoTranslationCandidateIdentity(this.plugin.getAutoTranslationRequestOptionsForText(text, baseOptions), candidate);
        const cacheKey = this.plugin.getTranslationCacheKey(text, requestOptions);
        const cacheAliases = this.plugin.getTranslationCacheAliases(text, requestOptions);
        const textCacheKey = this.plugin.getAutoTextTranslationCacheKey(text, requestOptions);
        const textCacheAliases = this.plugin.getAutoTextTranslationCacheAliases(text, requestOptions);
        const keys = [cacheKey, ...cacheAliases, textCacheKey, ...textCacheAliases].filter(Boolean);
        let translated = this.plugin.hasTranslationCacheCandidate(cacheKey, cacheAliases)
            ? this.plugin.getTranslationCacheValueCached(cacheKey, cacheAliases, context)
            : null;
        if (translated === null && this.plugin.hasTranslationCacheCandidate(textCacheKey, textCacheAliases)) {
            translated = this.plugin.getTranslationCacheValueCached(textCacheKey, textCacheAliases, context);
        }
        // Invalid entries are left for the regular scan to discard.
        if (translated === null || this.plugin.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) return { result: "miss", keys };
        return { result: "hit", cacheKey, translated, requestOptions, keys };
    },

    getCachedDrawMemoKey(candidate, text) {
        const messageNode = candidate?.messageNode;
        if (!messageNode?.id && !messageNode?.getAttribute?.("data-list-item-id")) return "";
        const identity = this.plugin.getMessageIdentity(messageNode, candidate.content, candidate.domText || text);
        return [this.plugin.getCurrentRouteKey(), identity, candidate.targetKind || "message", this.plugin.getStrongTextFingerprint(text)].join("|");
    },

    // Entries last until settings change. A hit also needs its cached value to be unchanged and
    // unexpired; a miss ends as soon as one of the keys it looked up is cached.
    getCachedDrawMemoEntry(memoKey) {
        const entry = memoKey ? this.plugin.cachedDrawMemo?.get?.(memoKey) : null;
        if (!entry) return null;
        let stale = entry.configVersion !== this.plugin.autoTranslationConfigVersion;
        if (!stale && entry.result === "miss") stale = entry.keys.some(key => this.plugin.translationCache.has(key));
        if (!stale && entry.result === "hit") {
            entry.valueKey = entry.keys.find(key => this.plugin.translationCache.get(key) === entry.translated) || "";
            stale = !entry.valueKey || this.plugin.isTranslationCacheEntryExpired(this.plugin.translationCacheMeta.get(entry.valueKey) || {});
        }
        if (!stale) return entry;
        this.plugin.cachedDrawMemo.delete(memoKey);
        return null;
    },

    rememberCachedDrawMemoEntry(memoKey, entry) {
        if (!memoKey || !entry) return;
        if (!this.plugin.cachedDrawMemo?.set) this.plugin.cachedDrawMemo = new Map();
        entry.configVersion = this.plugin.autoTranslationConfigVersion;
        this.plugin.cachedDrawMemo.delete(memoKey);
        this.plugin.cachedDrawMemo.set(memoKey, entry);
        while (this.plugin.cachedDrawMemo.size > AUTO_TRANSLATE_CACHE_DRAW_MEMO_MAX) {
            this.plugin.cachedDrawMemo.delete(this.plugin.cachedDrawMemo.keys().next().value);
        }
    },

    getCachedDrawPriority(content, context = null) {
        const rect = this.plugin.getCachedElementRect(content, context);
        const band = context?.cacheDrawBand;
        if (!rect || !band) return undefined;
        if (Number(rect.bottom) <= band.top) return AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE + band.top - Number(rect.bottom);
        if (Number(rect.top) >= band.bottom) return AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE + Number(rect.top) - band.bottom;
        return Math.max(0, Number(rect.top));
    },

    queueAutoTranslationRenderTask(task) {
        if (!task?.target || typeof task.run !== "function") return false;
        const key = task.key || this.getAutoTranslationRenderTaskKey(task.kind, task.target, task.cacheKey, task.target?.text);
        if (!key) return false;
        const queuedTask = { ...task, key };
        this.plugin.autoStateMachine.enqueueRenderTask(queuedTask);
        this.plugin.scheduleAutoTranslationRenderQueue();
        return true;
    },

    getAutoTranslationRenderTaskKey(kind, target, cacheKey = "", text = "") {
        return this.plugin.translationRenderer.getTaskKey(kind, target, cacheKey, text);
    },

    scheduleAutoTranslationRenderQueue(delayMs = 0) {
        if (!this.plugin.autoTranslationRenderQueue.length || !this.plugin.isStarted) return;
        const delay = Math.max(0, Number(delayMs) || 0);
        const dueAt = Date.now() + delay;
        if (this.plugin.autoTranslationRenderRaf) {
            if (delay > 0) return;
            return;
        }
        if (this.plugin.autoTranslationRenderTimer) {
            if (this.plugin.autoTranslationRenderDueAt && this.plugin.autoTranslationRenderDueAt <= dueAt) return;
            clearTimeout(this.plugin.autoTranslationRenderTimer);
            this.plugin.autoTranslationRenderTimer = null;
            this.plugin.autoTranslationRenderDueAt = 0;
        }
        if (delay > 0) {
            this.plugin.autoTranslationRenderDueAt = dueAt;
            this.plugin.autoTranslationRenderTimer = setTimeout(() => {
                this.plugin.autoTranslationRenderTimer = null;
                this.plugin.autoTranslationRenderDueAt = 0;
                this.processAutoTranslationRenderQueue();
            }, delay);
            return;
        }
        const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
        if (raf) {
            this.plugin.autoTranslationRenderRaf = raf(() => {
                this.plugin.autoTranslationRenderRaf = null;
                this.processAutoTranslationRenderQueue();
            });
            return;
        }
        this.processAutoTranslationRenderQueue();
    },

    cancelAutoTranslationRenderQueue(options = {}) {
        this.plugin.autoStateMachine.clearRenderQueue();
        if (this.plugin.autoTranslationRenderTimer) {
            clearTimeout(this.plugin.autoTranslationRenderTimer);
            this.plugin.autoTranslationRenderTimer = null;
            this.plugin.autoTranslationRenderDueAt = 0;
        }
        if (this.plugin.autoTranslationRenderRaf) {
            const cancel = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
                ? window.cancelAnimationFrame.bind(window)
                : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
            try { cancel?.(this.plugin.autoTranslationRenderRaf); }
            catch {}
            this.plugin.autoTranslationRenderRaf = null;
        }
        if (options.log) {
            this.plugin.logDiagnostic("auto.render.queue", "cancelled", {
                reasonCode: DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED
            });
        }
    },

    getAutoTranslationRenderQueueDelayMs(now = Date.now(), options = {}) {
        return this.plugin.translationRenderer.getQueueDelayMs(now, options);
    },

    isAutoTranslationRenderTaskHeavy(task) {
        return this.plugin.translationRenderer.isTaskHeavy(task);
    },

    processAutoTranslationRenderQueue() {
        if (!this.plugin.isStarted) {
            this.plugin.cancelAutoTranslationRenderQueue();
            return;
        }
        if (!this.plugin.autoTranslationRenderQueue.length) return;
        if (this.plugin.isQuickSettingsPanelOpen()) {
            this.plugin.quickSettingsRenderDeferred = true;
            this.plugin.logDiagnostic("auto.render.queue", "deferred", {
                reasonCode: DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                reason: "quick-settings-open",
                remaining: this.plugin.autoTranslationRenderQueue.length
            });
            return;
        }
        const now = Date.now();
        const delayMs = this.getAutoTranslationRenderQueueDelayMs(now);
        // While scroll pauses block other renders, cached translations may still be drawn.
        let cacheTasksOnly = false;
        if (delayMs > 0) {
            const hasCacheTasks = this.plugin.autoTranslationRenderQueue.some(task => task?.kind === "cache");
            const cacheDelayMs = hasCacheTasks ? this.getAutoTranslationRenderQueueDelayMs(now, { cacheTasks: true }) : delayMs;
            if (!hasCacheTasks || cacheDelayMs > 0) {
                this.plugin.scheduleAutoTranslationRenderQueue(Math.min(delayMs, cacheDelayMs));
                return;
            }
            cacheTasksOnly = true;
        }

        const startedAt = this.plugin.getDiagnosticTime();
        const startedWallAt = Date.now();
        const budgetExceeded = () => (this.plugin.getDiagnosticTime() - startedAt >= AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS)
            || (Date.now() - startedWallAt >= AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS);
        let rendered = 0;
        if (this.plugin.autoTranslationRenderQueueDirty) {
            this.plugin.translationRenderer.sortQueue(this.plugin.autoTranslationRenderQueue);
            this.plugin.autoTranslationRenderQueueDirty = false;
        }
        const previousFrameScrollCache = this.plugin.renderFrameScrollCache;
        this.plugin.renderFrameScrollCache = {
            nearestByNode: new Map(),
            scrollableByNode: new Map(),
            bandByScroller: new Map()
        };
        try {
            while (this.plugin.autoTranslationRenderQueue.length && rendered < AUTO_TRANSLATE_RENDER_MAX_PER_FRAME) {
                if (rendered > 0 && budgetExceeded()) break;
                const index = cacheTasksOnly ? this.plugin.autoTranslationRenderQueue.findIndex(task => task?.kind === "cache") : 0;
                if (index < 0) break;
                const task = this.plugin.autoTranslationRenderQueue[index];
                if (rendered > 0 && this.isAutoTranslationRenderTaskHeavy(task)) break;
                this.plugin.autoTranslationRenderQueue.splice(index, 1);
                if (task?.key) {
                    const queuedTask = this.plugin.autoTranslationRenderQueuedTasks?.get?.(task.key);
                    if (!queuedTask || queuedTask === task) {
                        this.plugin.autoTranslationRenderQueuedTasks?.delete?.(task.key);
                        this.plugin.autoTranslationRenderQueuedKeys.delete(task.key);
                    }
                }
                try {
                    task?.run?.();
                }
                catch (error) {
                    this.plugin.warnSanitized("Failed to run queued auto translation render", error);
                }
                finally {
                    // Another queued render for the same translation keeps it counted as active.
                    if (task?.cacheKey && !this.plugin.autoTranslationRenderQueue.some(queued => queued?.cacheKey === task.cacheKey)) {
                        this.plugin.autoTranslationRenderPendingKeys?.delete?.(task.cacheKey);
                    }
                }
                rendered++;
                if (this.isAutoTranslationRenderTaskHeavy(task)) break;
                if (budgetExceeded()) break;
            }
        }
        finally {
            this.plugin.renderFrameScrollCache = previousFrameScrollCache;
        }

        if (this.plugin.autoTranslationRenderQueue.length) {
            const remainingCacheTasks = this.plugin.autoTranslationRenderQueue.some(task => task?.kind === "cache");
            this.plugin.scheduleAutoTranslationRenderQueue(cacheTasksOnly && !remainingCacheTasks ? this.getAutoTranslationRenderQueueDelayMs(Date.now()) : 0);
        }
        this.plugin.logSlowOperation("auto.render.queue", startedAt, {
            rendered,
            remaining: this.plugin.autoTranslationRenderQueue.length
        });
    },

    renderAutoTranslationCacheTarget(target, translated, cacheKey, requestOptions = null, options = {}) {
        if (!this.plugin.isAutoTranslationRenderRequestCurrent(requestOptions)) {
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_REQUEST_STALE
            );
            return false;
        }
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED
            );
            return false;
        }
        if (!this.plugin.isAutoTranslationTargetDomTextCurrent(target)) {
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED
            );
            return false;
        }
        if (!this.plugin.isAutoTranslationTargetIdentityCurrent(target, { cacheKey, requestOptions })) {
            this.plugin.removeAutoTranslationNode(target, cacheKey);
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED
            );
            return false;
        }
        if (this.plugin.hasManualTranslationLine(target.content, this.plugin.getAutoTranslationTargetDomText(target), target.messageNode)) {
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.CACHED,
                DIAGNOSTIC_REASON_CODES.MANUAL_LINE_PRESENT
            );
            return false;
        }
        const preRenderContext = { rectByElement: new Map() };
        if (!this.plugin.isAutoTranslationCacheTargetDrawable(target, preRenderContext)) {
            // The draw pass re-checks on its next run, so it needs no rescan of its own.
            if (options.drawPass) return false;
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT,
                { fromCache: true }
            );
            this.plugin.scheduleAutoTranslationRetryScan(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return false;
        }
        // Cache tasks only run once the scroller is still, so scroll correction is safe even during the pause.
        const renderMeta = options.renderMeta || null;
        const anchorRect = preRenderContext.rectByElement.get(target.content) || null;
        const renderedLine = this.plugin.renderTranslation(target.messageNode, target.content, translated, cacheKey, this.plugin.getAutoTranslationTargetDomText(target), {
            allowScrollCorrectionWhilePaused: true,
            ...(anchorRect ? { anchorRect } : {}),
            ...(renderMeta?.partial
                ? {
                    partial: true,
                    validationQuality: renderMeta.validationQuality || TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                    validationReason: renderMeta.validationReason || "",
                    ...(renderMeta.partialInfo ? { partialInfo: renderMeta.partialInfo } : {})
                }
                : {})
        });
        if (!renderedLine) {
            // Emoji images could not be restored: per contract the translation must be neither
            // shown nor kept cached. The failure is recorded so the scan does not request the
            // same message again on every pass.
            this.plugin.deleteTranslationCacheCandidates(cacheKey, ...(options.deleteKeys || []));
            this.plugin.markAutoTranslationUndrawableResult(cacheKey, "emoji-restore-failed", { text: target.text, requestOptions });
            this.plugin.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                { fromCache: true, invalidReason: "emoji-restore-failed" }
            );
            return false;
        }
        this.plugin.rememberRecentAutoTranslationRender(cacheKey, target.text, requestOptions, {
            validationQuality: renderMeta?.partial ? (renderMeta.validationQuality || TRANSLATION_VALIDATION_QUALITIES.PARTIAL) : TRANSLATION_VALIDATION_QUALITIES.GOOD,
            validationReason: renderMeta?.partial ? (renderMeta.validationReason || "") : ""
        });
        this.plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "rendered",
            { ...target, cacheKey, requestOptions },
            DIAGNOSTIC_MESSAGE_STATES.RENDERED,
            DIAGNOSTIC_REASON_CODES.RENDERED,
            { fromCache: true }
        );
        return true;
    },

    getAutoTranslationTargets(messageNode, context = this.plugin.createScanContext()) {
        if (context?.targetsByMessage?.has(messageNode)) return context.targetsByMessage.get(messageNode);
        const targets = [];
        if (!this.plugin.isAutoTranslationTargetInScanRange(messageNode, context)) {
            context?.targetsByMessage?.set(messageNode, targets);
            return targets;
        }

        for (const content of this.plugin.getMessageContentElements(messageNode, context)) {
            if (!content || !this.plugin.isAutoTranslationTargetInScanRange(content, context)) continue;
            const text = this.plugin.getCachedElementText(content, context);
            if (text) targets.push({ messageNode, content, text, textOptions: null, targetKind: "message" });
        }

        for (const preview of this.plugin.getReplyPreviewElements(messageNode)) {
            if (!this.plugin.isAutoTranslationTargetInScanRange(preview, context)) continue;
            const textOptions = { includeReplyPreview: true };
            const text = this.plugin.getCachedElementText(preview, context, textOptions);
            if (text) targets.push({ messageNode, content: preview, text, textOptions, targetKind: "reply-preview" });
        }

        context?.targetsByMessage?.set(messageNode, targets);
        return targets;
    },

    getReplyPreviewElements(messageNode) {
        if (messageNode?.querySelector && !messageNode.querySelector("[class*='repliedMessage'], [class*='repliedTextPreview'], [class*='quotedChatMessage']")) {
            return [];
        }

        const selectors = [
            "[class*='repliedTextPreview']",
            "[class*='repliedTextContent']",
            "[class*='quotedChatMessage'] [class*='markup']",
            "[class*='repliedMessage'] [class*='markup']"
        ].join(",");
        const candidates = [...(messageNode?.querySelectorAll?.(selectors) || [])];
        return candidates.filter((candidate, index, all) => {
            if (!candidate || all.indexOf(candidate) !== index) return false;
            if (all.some(other => other !== candidate && candidate.contains?.(other))) return false;
            if (candidate.closest(".dait-translation-box, .dait-translation-line, [class*='embed'], [class*='attachment']")) return false;
            if (!this.plugin.isReplyPreviewElement(candidate)) return false;
            return true;
        });
    },

    getReadyAutoTranslationTargets(item, context = null) {
        if (!this.plugin.isAutoTranslationRequestCurrent(item?.requestOptions)) return [];
        const priorityOptions = context ? { context } : undefined;
        return this.plugin.getAutoTranslationPendingTargets(item)
            .map(target => {
                const next = { ...target };
                delete next.priority;
                return this.plugin.withAutoTranslationPriority(next, priorityOptions);
            })
            .filter(target => this.plugin.isAutoTranslationTargetReady(target, item?.cacheKey, context))
            .sort((left, right) => (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER));
    },

    getAutoTranslationPrimaryTarget(target) {
        return {
            messageNode: target.messageNode,
            content: target.content,
            text: target.text,
            domText: target.domText || "",
            textOptions: target.textOptions,
            targetKind: target.targetKind,
            priority: target.priority
        };
    },

    isAutoTranslationTargetVisibleCached(target, context = null) {
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
        const contentVisible = this.plugin.isElementVisibleInViewportCached(target.content, context);
        if (!contentVisible) return false;
        return this.plugin.isElementVisibleInViewportCached(target.messageNode, context)
            || this.isAutoTranslationContentInsideMessage(target);
    },

    isAutoTranslationContentInsideMessage(target) {
        const messageNode = target?.messageNode;
        const content = target?.content;
        if (!messageNode || !content) return false;
        if (messageNode === content) return true;
        return Boolean(messageNode.contains?.(content) || content.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) === messageNode);
    },

    normalizeHistoryBackfillLimit(value) {
        const number = Number(value);
        const normalized = Number.isFinite(number) ? Math.round(number) : DEFAULT_SETTINGS.ui.historyBackfillLimit;
        return Math.min(100, Math.max(1, normalized || DEFAULT_SETTINGS.ui.historyBackfillLimit));
    },

    isElementVisibleInViewport(element, rect = null, context = null) {
        if (!element?.isConnected) return false;
        if (context?.visibleByElement?.has(element)) return context.visibleByElement.get(element);
        const elementRect = rect || this.plugin.getCachedElementRect(element, context);
        if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) {
            context?.visibleByElement?.set(element, false);
            return false;
        }
        const documentHeight = typeof document !== "undefined" ? Number(document.documentElement?.clientHeight || 0) : 0;
        const documentWidth = typeof document !== "undefined" ? Number(document.documentElement?.clientWidth || 0) : 0;
        const height = typeof window !== "undefined" ? Number(window.innerHeight || documentHeight || 0) : documentHeight;
        const width = typeof window !== "undefined" ? Number(window.innerWidth || documentWidth || 0) : documentWidth;
        if (!(elementRect.bottom > 0 && elementRect.right > 0 && elementRect.top < height && elementRect.left < width)) {
            context?.visibleByElement?.set(element, false);
            return false;
        }
        if (element.hidden || element.getAttribute?.("aria-hidden") === "true") {
            context?.visibleByElement?.set(element, false);
            return false;
        }
        if (typeof getComputedStyle === "function") {
            const style = getComputedStyle(element);
            if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") {
                context?.visibleByElement?.set(element, false);
                return false;
            }
        }
        const visible = this.isRectInsideScrollClips(element, elementRect, context, { checkHidden: true });
        context?.visibleByElement?.set(element, visible);
        return visible;
    },

    hasHiddenAncestor(element) {
        let current = element;
        while (current && current.nodeType === 1) {
            if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return true;
            if (typeof getComputedStyle === "function") {
                const style = getComputedStyle(current);
                if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return true;
            }
            current = current.parentElement;
        }
        return false;
    },

    isVisibleInsideScrollContainers(element, rect = element?.getBoundingClientRect?.()) {
        return this.isRectInsideScrollClips(element, rect);
    },

    // The rect must overlap every overflow-clipping ancestor (touching edges count as outside;
    // zero-size ancestors are ignored). The scan also rejects ancestors hidden by style.
    isRectInsideScrollClips(element, rect, context = null, options = {}) {
        if (!rect) return true;
        let current = element?.parentElement;
        while (current && current.nodeType === 1) {
            const info = this.getScrollClipInfo(current, context);
            if (options.checkHidden && info.hidden) return false;
            const clip = info.rect;
            if (clip && (rect.bottom <= clip.top || rect.top >= clip.bottom || rect.right <= clip.left || rect.left >= clip.right)) return false;
            current = current.parentElement;
        }
        return true;
    },

    getScrollClipInfo(element, context = null) {
        const memo = context?.scrollClipByElement;
        if (memo?.has(element)) return memo.get(element);
        const attrHidden = Boolean(element.hidden || element.getAttribute?.("aria-hidden") === "true");
        const info = { hidden: attrHidden, rect: null };
        if (!attrHidden && typeof getComputedStyle === "function") {
            const style = getComputedStyle(element);
            info.hidden = style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0";
            if (!info.hidden && /(auto|scroll|hidden|clip)/.test(`${style.overflow || ""} ${style.overflowX || ""} ${style.overflowY || ""}`)) {
                const clipRect = this.plugin.getCachedElementRect(element, context);
                if (clipRect && clipRect.width > 0 && clipRect.height > 0) info.rect = clipRect;
            }
        }
        memo?.set(element, info);
        return info;
    },

    withTranslationScrollStability(anchor, render, options = {}) {
        const snapshot = this.getTranslationScrollSnapshot(anchor, options);
        const result = render();
        this.restoreTranslationScrollSnapshot(snapshot);
        return result;
    },

    // Where the new line lands decides the correction: above the visible chat, keep what is
    // visible in place; below it, change nothing; inside it, keep the translated text in place.
    // A chat pinned to its newest message stays pinned.
    getTranslationScrollSnapshot(anchor, options = {}) {
        if (!anchor?.isConnected || !anchor.getBoundingClientRect) return null;
        // Never write scrollTop while the chat is moving: that cuts smooth scrolling and Discord's scroll animations short.
        if (this.plugin.getAutoTranslationScrollStillRemainingMs() > 0) return null;
        const scroller = this.getTranslationScrollContainer(anchor);
        if (!scroller) return null;
        const rect = options.anchorRect || anchor.getBoundingClientRect();
        const scrollTop = this.getScrollContainerTop(scroller);
        if (!Number.isFinite(scrollTop) || !rect) return null;
        const atBottom = this.isScrollContainerAtBottom(scroller, scrollTop);
        // A restyle of every line keeps the anchor's top edge in place, wherever the lines are.
        if (options.keepAnchorTop) return { anchor, edge: "top", top: Number(rect.top || 0), scroller, scrollTop, atBottom };
        const band = this.getScrollContainerBand(scroller);
        const insertY = Number(this.plugin.settings.ui?.translationPosition === "after" ? rect.bottom : rect.top);
        const placement = !band ? "visible" : insertY <= band.top ? "above" : insertY >= band.bottom ? "below" : "visible";
        if (placement === "below"
            || (placement === "visible" && this.plugin.isAutoTranslationRenderPaused() && !options.allowScrollCorrectionWhilePaused)) {
            return atBottom ? { scroller, scrollTop, atBottom, anchor: null } : null;
        }
        if (placement === "above") {
            // Every line lands inside the message, so its bottom edge moves exactly as far as the visible chat would.
            const message = anchor.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || anchor;
            const messageRect = message === anchor ? rect : message.getBoundingClientRect?.();
            if (!messageRect) return null;
            return { anchor: message, edge: "bottom", top: Number(messageRect.bottom || 0), scroller, scrollTop, atBottom };
        }
        return { anchor, edge: "top", top: Number(rect.top || 0), scroller, scrollTop, atBottom };
    },

    restoreTranslationScrollSnapshot(snapshot) {
        if (!snapshot?.scroller) return;
        const currentTop = this.getScrollContainerTop(snapshot.scroller);
        if (!Number.isFinite(currentTop)) return;
        // Native scroll anchoring or clamping already moved the chat during the render.
        if (Math.abs(currentTop - Number(snapshot.scrollTop || 0)) > 1) {
            this.rememberOwnScrollAdjustment(snapshot.scroller, currentTop);
            return;
        }
        let nextTop = currentTop;
        if (snapshot.atBottom) {
            nextTop = Math.max(0, Number(snapshot.scroller.scrollHeight || 0) - Number(snapshot.scroller.clientHeight || 0));
        }
        else {
            if (!snapshot.anchor?.isConnected) return;
            const nextRect = snapshot.anchor.getBoundingClientRect?.();
            if (!nextRect) return;
            const delta = Number(nextRect[snapshot.edge || "top"] || 0) - Number(snapshot.top || 0);
            if (!Number.isFinite(delta)) return;
            nextTop = currentTop + delta;
        }
        if (Math.abs(nextTop - currentTop) < 0.5) return;
        this.setScrollContainerTop(snapshot.scroller, nextTop);
        const writtenTop = this.getScrollContainerTop(snapshot.scroller);
        if (Number.isFinite(writtenTop) && Math.abs(writtenTop - currentTop) >= 0.5) this.rememberOwnScrollAdjustment(snapshot.scroller, writtenTop);
    },

    // Whether Discord's chat scroller uses native scroll anchoring decides if the plugin's own
    // scroll corrections ever run; recorded in diagnostics.
    getChatScrollerOverflowAnchor() {
        try {
            if (typeof document === "undefined" || typeof getComputedStyle !== "function") return "";
            const message = document.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR);
            const scroller = message ? this.getTranslationScrollContainer(message) : null;
            if (!message) return "";
            return this.isDocumentScroller(scroller) ? "not-scrollable" : String(getComputedStyle(scroller).overflowAnchor || "");
        }
        catch {
            return "";
        }
    },

    isScrollContainerAtBottom(scroller, scrollTop = this.getScrollContainerTop(scroller)) {
        const scrollHeight = Number(scroller?.scrollHeight || 0);
        const clientHeight = Number(scroller?.clientHeight || 0);
        if (!Number.isFinite(scrollTop) || scrollHeight <= clientHeight + 1) return false;
        return scrollTop + clientHeight >= scrollHeight - 2;
    },

    // The visible part of a scroller: its box clipped to the window.
    getScrollContainerBand(scroller) {
        const frameCache = this.plugin.renderFrameScrollCache;
        if (frameCache?.bandByScroller?.has(scroller)) return frameCache.bandByScroller.get(scroller);
        if (typeof window === "undefined" || !window) return null;
        const height = Number(window.innerHeight || 0);
        if (!(height > 0)) return null;
        let band = null;
        if (this.isDocumentScroller(scroller)) {
            band = { top: 0, bottom: height };
        }
        else {
            const rect = scroller.getBoundingClientRect?.();
            if (!rect || !(rect.height > 0)) return null;
            const top = Math.max(0, Number(rect.top || 0));
            const bottom = Math.min(height, Number(rect.bottom || 0));
            band = bottom > top ? { top, bottom } : null;
        }
        if (frameCache?.bandByScroller && band) frameCache.bandByScroller.set(scroller, band);
        return band;
    },

    // The plugin's own scrollTop writes fire scroll events; the next one from that scroller is not a user scroll.
    rememberOwnScrollAdjustment(scroller, top) {
        if (!scroller || !Number.isFinite(Number(top))) return;
        if (!this.plugin.autoTranslationOwnScrolls?.set) this.plugin.autoTranslationOwnScrolls = new WeakMap();
        this.plugin.autoTranslationOwnScrolls.set(scroller, { top: Number(top), at: Date.now() });
    },

    consumeOwnScrollEvent(event) {
        const target = typeof document !== "undefined" && event?.target === document ? document.scrollingElement : event?.target;
        const record = target ? this.plugin.autoTranslationOwnScrolls?.get?.(target) : null;
        if (!record) return false;
        this.plugin.autoTranslationOwnScrolls.delete(target);
        const top = this.getScrollContainerTop(target);
        if (Date.now() - record.at > AUTO_TRANSLATE_SCROLL_STILL_MS || !Number.isFinite(top) || Math.abs(top - record.top) > 1) return false;
        this.plugin.setPreviousViewportScrollPosition(event, top);
        this.plugin.autoTranslationLastScrollY = top;
        return true;
    },

    getTranslationScrollContainer(anchor) {
        if (typeof document === "undefined") return null;
        const frameCache = this.plugin.renderFrameScrollCache;
        const startNode = anchor?.parentElement;
        if (frameCache?.nearestByNode && startNode && frameCache.nearestByNode.has(startNode)) {
            const cached = frameCache.nearestByNode.get(startNode);
            if (!cached || cached.isConnected !== false) return cached;
            frameCache.nearestByNode.delete(startNode);
        }
        // Outside a render frame, keep the cachedDrawScroller fast-path; inside a render frame, walk
        // through memoized nearestByNode / scrollableByNode so nested inner scrollers are never bypassed.
        if (!frameCache && this.plugin.cachedDrawScroller?.isConnected && anchor && this.plugin.cachedDrawScroller.contains?.(anchor)
            && this.isVerticalScrollContainer(this.plugin.cachedDrawScroller)) {
            return this.plugin.cachedDrawScroller;
        }
        const isScrollable = node => {
            if (!frameCache?.scrollableByNode) return this.isVerticalScrollContainer(node);
            if (frameCache.scrollableByNode.has(node)) return frameCache.scrollableByNode.get(node);
            const result = this.isVerticalScrollContainer(node);
            frameCache.scrollableByNode.set(node, result);
            return result;
        };
        let scroller = null;
        const visited = frameCache?.nearestByNode ? [] : null;
        let node = startNode;
        while (node && node.nodeType === 1) {
            if (frameCache?.nearestByNode?.has(node)) {
                const cached = frameCache.nearestByNode.get(node);
                if (!cached || cached.isConnected !== false) {
                    scroller = cached;
                    break;
                }
                frameCache.nearestByNode.delete(node);
            }
            if (isScrollable(node)) {
                scroller = node;
                break;
            }
            visited?.push(node);
            node = node.parentElement;
        }
        scroller ||= document.scrollingElement || document.documentElement || null;
        if (visited) {
            for (const ancestor of visited) frameCache.nearestByNode.set(ancestor, scroller);
        }
        return scroller;
    },

    isVerticalScrollContainer(node) {
        if (!node || node.nodeType !== 1) return false;
        if (!Number.isFinite(Number(node.scrollTop))) return false;
        const scrollHeight = Number(node.scrollHeight || 0);
        const clientHeight = Number(node.clientHeight || 0);
        if (scrollHeight <= clientHeight + 1) return false;
        if (typeof getComputedStyle !== "function") return true;
        const style = getComputedStyle(node);
        return /(auto|scroll|overlay)/.test(`${style.overflowY || ""} ${style.overflow || ""}`);
    },

    getScrollContainerTop(scroller) {
        if (!scroller) return NaN;
        if (scroller === window) return Number(window.scrollY || window.pageYOffset || 0);
        return Number(scroller.scrollTop);
    },

    setScrollContainerTop(scroller, value) {
        const top = Math.max(0, Number(value) || 0);
        if (scroller === window) {
            window.scrollTo?.(window.scrollX || window.pageXOffset || 0, top);
            return;
        }
        scroller.scrollTop = top;
    }
};

const SCROLL_ANCHOR_METHOD_NAMES = attachControllerMethods(DiscordScrollAnchorController, [methods]);

module.exports = {
    DiscordScrollAnchorController,
    SCROLL_ANCHOR_METHOD_NAMES
};
