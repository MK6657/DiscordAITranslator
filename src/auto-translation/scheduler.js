"use strict";

const {
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS,
    AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH,
    AUTO_TRANSLATE_ULTRA_LONG_TEXT_LENGTH,
    AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE,
    DIAGNOSTIC_MESSAGE_STATES,
    AUTO_TRANSLATION_QUEUE_TYPES,
    DIAGNOSTIC_REASON_CODES
} = require("../constants");

class TranslationScheduler {
    constructor(plugin) {
        this.plugin = plugin;
    }

    isLongText(text) {
        return String(text || "").length >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH;
    }

    isUltraLongText(text) {
        return String(text || "").length >= AUTO_TRANSLATE_ULTRA_LONG_TEXT_LENGTH;
    }

    isLongItem(item) {
        return this.isLongText(item?.text || "");
    }

    getQueueType(item = {}, context = null, options = {}) {
        if (!item) return "";
        if (item.daitManualRequest) return AUTO_TRANSLATION_QUEUE_TYPES.MANUAL;
        if (item.daitHistoryRequest) return AUTO_TRANSLATION_QUEUE_TYPES.HISTORY;
        if (item.daitPrefetchRequest) return AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH;
        if (Number.isFinite(Number(item.priority)) && Number(item.priority) >= AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE) return AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH;
        if (!options?.skipDomCheck && item.messageNode && item.content && this.isPrefetchItem(item, context)) return AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH;
        if (this.isLongItem(item)) return AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT;
        if (item.messageNode && item.content) return AUTO_TRANSLATION_QUEUE_TYPES.VISIBLE;
        return "";
    }

    getQueueTypeRank(item = {}, queueType = null, context = null) {
        const type = queueType === null || queueType === undefined ? this.getQueueType(item, context) : queueType;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.MANUAL) return 0;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.VISIBLE) return 10;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT) return 20;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH) return 30;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.HISTORY) return 40;
        return 50;
    }

    canStartPrefetchRequest(concurrency) {
        const total = Math.max(0, Number(concurrency) || 0);
        if (total <= 0) return false;
        if (this.plugin.hasActiveVisibleAutoTranslationWork()) return false;
        const limit = Math.min(1, Math.max(0, total - 1));
        const maxTotalInFlight = Math.max(0, total - 1);
        return this.plugin.autoTranslationPrefetchInFlight < limit
            && this.plugin.autoTranslationInFlight < maxTotalInFlight;
    }

    isPrefetchBatch(batch, context = null) {
        return Array.isArray(batch) && batch.length > 0 && batch.every(item => this.isPrefetchItem(item, context));
    }

    isPrefetchItem(item, context = null) {
        return !this.isVisibleItem(item, context);
    }

    isVisibleItem(item, context = null) {
        if (!item?.messageNode?.isConnected || !item?.content?.isConnected) return false;
        const isVisible = context
            ? element => this.plugin.isElementVisibleInViewportCached(element, context)
            : element => this.plugin.isElementVisibleInViewport(element);
        if (!isVisible(item.content)) return false;
        return isVisible(item.messageNode)
            || this.plugin.isAutoTranslationContentInsideMessage(item);
    }

    shouldRunItemSingle(item) {
        if (!item) return false;
        // Sent again alone after its batch reply could not be used.
        if (item.daitSingleRequest) return true;
        const config = this.plugin.getEffectiveTaskConfig("translation", item?.requestOptions?.configOverrides);
        if (this.plugin.isLocalTranslationProvider(config)) return true;
        return this.isLongItem(item);
    }

    getItemProviderKey(item) {
        if (!item?.requestOptions) return "";
        return item?.requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(item?.requestOptions);
    }

    markProviderFailure(requestOptions, error, itemFailure = null, options = {}) {
        const plugin = this.plugin;
        const type = plugin.getAutoTranslationFailureType(error);
        if (!["auth", "quota", "rate-limit", "server", "timeout", "network", "parse", "local-unavailable"].includes(type)) return;

        const key = error?.providerKey || plugin.getAutoTranslationProviderKey(requestOptions);
        if (!key) return;
        const previous = plugin.autoTranslationProviderFailures.get(key);
        if (previous && plugin.isAutoTranslationFailureExpired(previous)) plugin.autoTranslationProviderFailures.delete(key);
        const previousCount = previous && !plugin.isAutoTranslationFailureExpired(previous) ? Number(previous.count || 0) : 0;
        const count = Math.min(5, previousCount + 1);
        // The cooldown blocks every message on this provider, so it grows only with provider-level
        // evidence: the provider's own count, or a server hint (Retry-After) carried by the error.
        // One message's growing failure count (itemFailure) backs off that message alone.
        const retryAfterMs = plugin.getAutoTranslationRetryAfter(error, count);
        const terminal = (type === "auth" || type === "quota") && !plugin.isGoogleTranslatePoolServing?.(error);
        const now = Date.now();
        plugin.autoTranslationProviderFailures.set(key, {
            at: now,
            count,
            retryAfterMs,
            retryAt: terminal ? 0 : now + retryAfterMs,
            terminal,
            type
        });
        if (type === "local-unavailable") {
            plugin.localProviderHealthyKeys.delete(key);
            plugin.discardAutoTranslationProviderWork(key, { retryMs: retryAfterMs, skipCacheKeys: options.skipCacheKeys });
            plugin.setApiRuntimeStatus("translation", "failed", plugin.t("apiStatusFailed"), plugin.formatError(error));
        }
        else if ((type === "quota" || type === "auth") && !plugin.isGoogleTranslatePoolServing?.(error)) {
            plugin.setApiRuntimeStatus("translation", "failed", plugin.t("apiStatusFailed"), plugin.formatError(error));
        }
        plugin.notifyTranslationNeedsAttention?.(error, key);
        plugin.logDiagnostic("auto.provider.failure", "cooldown", {
            key: plugin.getTextFingerprint(key),
            type,
            count,
            retryAfterMs,
            status: Number(error?.status || 0)
        });
    }

    getProviderFailure(requestOptions) {
        const plugin = this.plugin;
        const key = plugin.getAutoTranslationProviderKey(requestOptions);
        const failure = plugin.autoTranslationProviderFailures.get(key);
        if (failure && plugin.isAutoTranslationFailureExpired(failure)) {
            if (failure.type === "local-unavailable") {
                const retryAfterMs = Math.max(Number(failure.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
                const next = {
                    ...failure,
                    at: Date.now(),
                    retryAfterMs,
                    retryAt: Date.now() + retryAfterMs
                };
                plugin.autoTranslationProviderFailures.set(key, next);
                plugin.startLocalProviderHealthProbe(key, requestOptions, { reason: "cooldown-expired" });
                return next;
            }
            plugin.autoTranslationProviderFailures.delete(key);
            return null;
        }
        return failure;
    }

    isProviderCoolingDown(requestOptions, now = Date.now()) {
        const plugin = this.plugin;
        const key = plugin.getAutoTranslationProviderKey(requestOptions);
        const failure = plugin.autoTranslationProviderFailures.get(key);
        if (!failure) return false;
        if (plugin.isAutoTranslationFailureExpired(failure, now)) {
            if (failure.type === "local-unavailable") {
                const retryAfterMs = Math.max(Number(failure.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
                const next = {
                    ...failure,
                    at: now,
                    retryAfterMs,
                    retryAt: now + retryAfterMs
                };
                plugin.autoTranslationProviderFailures.set(key, next);
                plugin.startLocalProviderHealthProbe(key, requestOptions, { reason: "cooldown-expired" });
                plugin.scheduleAutoTranslationRetryScan(retryAfterMs);
                return true;
            }
            plugin.autoTranslationProviderFailures.delete(key);
            return false;
        }
        if (!failure.terminal) {
            plugin.scheduleAutoTranslationRetryScan(plugin.getAutoTranslationFailureRemainingMs(failure, now));
        }
        return true;
    }

    sortQueue(queue = [], context = null) {
        if (!Array.isArray(queue) || queue.length < 2) return;
        const layoutContext = context || this.plugin.createAutoTranslationLayoutContext?.() || null;
        // Rank resolution can hit the DOM (viewport visibility); compute it once per item
        // with a shared layout context so shared ancestors are only measured once.
        const ranks = new Map();
        for (const item of queue) {
            if (!ranks.has(item)) ranks.set(item, this.getQueueTypeRank(item, null, layoutContext));
        }
        queue.sort((left, right) => {
            const typeDelta = ranks.get(left) - ranks.get(right);
            if (typeDelta) return typeDelta;
            const priorityDelta = (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER);
            if (priorityDelta) return priorityDelta;
            return String(left?.cacheKey || "").localeCompare(String(right?.cacheKey || ""));
        });
    }

    makeRoomForItem(item, queueLimit) {
        const plugin = this.plugin;
        const limit = Math.max(1, Number(queueLimit) || plugin.getAutoTranslateQueueLimit());
        const isAlreadyInFlight = Boolean(item?.cacheKey && plugin.autoTranslationInFlightKeys?.has?.(item.cacheKey));
        const effectiveInFlightItems = Math.max(0, plugin.autoTranslationInFlightItems - (isAlreadyInFlight ? 1 : 0));
        if (plugin.autoTranslationQueue.length + effectiveInFlightItems < limit) return true;

        const incoming = plugin.withAutoTranslationPriority(item);
        if (!plugin.autoTranslationQueue.length && (isAlreadyInFlight || !this.isPrefetchItem(incoming))) return true;
        const incomingPriority = incoming.priority ?? Number.MAX_SAFE_INTEGER;
        let worstIndex = -1;
        let worstPriority = incomingPriority;
        plugin.autoTranslationQueue.forEach((queued, index) => {
            const priority = queued?.priority ?? Number.MAX_SAFE_INTEGER;
            if (priority <= worstPriority) return;
            worstPriority = priority;
            worstIndex = index;
        });
        if (worstIndex < 0) return false;

        const [removed] = plugin.autoTranslationQueue.splice(worstIndex, 1);
        plugin.autoTranslationQueuedKeys.delete(removed?.cacheKey);
        plugin.clearPendingAutoTranslationItem(removed);
        plugin.logDiagnostic("auto.queue.drop", "queue-limit", {
            ...plugin.getAutoTranslationDiagnosticMeta(removed, DIAGNOSTIC_MESSAGE_STATES.CANCELLED, DIAGNOSTIC_REASON_CODES.QUEUE_LIMIT),
            key: plugin.getTextFingerprint(removed?.cacheKey || ""),
            incomingKey: plugin.getTextFingerprint(item?.cacheKey || ""),
            queueLength: plugin.autoTranslationQueue.length,
            limit
        });
        plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "cancelled",
            removed,
            DIAGNOSTIC_MESSAGE_STATES.CANCELLED,
            DIAGNOSTIC_REASON_CODES.QUEUE_LIMIT,
            { incomingKey: plugin.getTextFingerprint(item?.cacheKey || ""), limit }
        );
        return true;
    }

    isAutoCacheMode(mode) {
        const value = String(mode || "");
        return value.startsWith("auto") || value === "long-text";
    }
}

module.exports = { TranslationScheduler };
