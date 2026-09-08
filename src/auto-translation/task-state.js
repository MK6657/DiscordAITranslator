"use strict";

// Phase 6.0 of the modularization plan (docs/refactor-direction-2026-07-26.md):
// a passive, read-only unified view over the auto-translation collections that
// still live on the plugin. It changes no storage and does no work unless asked
// (tests and diagnostics call it); the eventual task state machine will replace
// the underlying collections while keeping this view's shape stable, so callers
// written against the snapshot survive the migration.

class AutoTranslationTaskState {
    constructor(plugin) {
        this.plugin = plugin;
    }

    getTaskSnapshot(cacheKey) {
        const plugin = this.plugin;
        const key = String(cacheKey || "");
        const queuedItem = (plugin.autoTranslationQueue || []).find(item => item?.cacheKey === key) || null;
        // Note: autoTranslationRenderQueuedKeys holds render-task keys, not cache keys,
        // so render membership for a cache key is derived from the queued tasks.
        const renderQueued = (plugin.autoTranslationRenderQueue || []).some(task => task?.cacheKey === key);
        return {
            cacheKey: key,
            queued: Boolean(queuedItem),
            queuedKey: Boolean(plugin.autoTranslationQueuedKeys?.has?.(key)),
            inFlight: Boolean(plugin.autoTranslationInFlightKeys?.has?.(key)),
            visibleLongInFlight: Boolean(plugin.autoTranslationVisibleLongInFlightKeys?.has?.(key)),
            renderQueued,
            renderPending: Boolean(plugin.autoTranslationRenderPendingKeys?.has?.(key)),
            pendingTargets: Boolean(plugin.autoTranslationPendingTargets?.has?.(key)),
            failure: plugin.autoTranslationFailures?.get?.(key) || null,
            priority: queuedItem?.priority ?? null
        };
    }

    listTrackedKeys() {
        const plugin = this.plugin;
        const keys = new Set();
        (plugin.autoTranslationQueue || []).forEach(item => { if (item?.cacheKey) keys.add(item.cacheKey); });
        for (const key of plugin.autoTranslationQueuedKeys || []) keys.add(key);
        for (const key of plugin.autoTranslationInFlightKeys || []) keys.add(key);
        (plugin.autoTranslationRenderQueue || []).forEach(task => { if (task?.cacheKey) keys.add(task.cacheKey); });
        for (const key of plugin.autoTranslationRenderPendingKeys || []) keys.add(key);
        for (const key of (plugin.autoTranslationPendingTargets || new Map()).keys()) keys.add(key);
        return [...keys];
    }

    // Invariants the current parallel collections are expected to uphold. Each rule
    // was derived from the writer sites (enqueue/take/finish/remove/render queue).
    // Returns a list of violations; empty means consistent.
    checkInvariants() {
        const plugin = this.plugin;
        const violations = [];
        const queueKeys = new Set((plugin.autoTranslationQueue || []).map(item => item?.cacheKey).filter(Boolean));

        // I1: every queued item's key is tracked in queuedKeys.
        for (const key of queueKeys) {
            if (!plugin.autoTranslationQueuedKeys.has(key)) violations.push({ rule: "queued-item-without-key", key });
        }
        // I2: a tracked queued key belongs to a queue item unless the work is in flight
        //     (batched items keep their key until finishAutoTranslationInFlightItem).
        for (const key of plugin.autoTranslationQueuedKeys) {
            if (!queueKeys.has(key) && !plugin.autoTranslationInFlightKeys.has(key)) {
                violations.push({ rule: "queued-key-without-item", key });
            }
        }
        // I3: in-flight bookkeeping stays aligned: token/startedAt maps track exactly
        //     the in-flight key set, and visible-long keys are a subset of it.
        for (const key of plugin.autoTranslationInFlightKeys) {
            if (!plugin.autoTranslationInFlightTokens.has(key)) violations.push({ rule: "in-flight-without-token", key });
            if (!plugin.autoTranslationInFlightStartedAt.has(key)) violations.push({ rule: "in-flight-without-started-at", key });
        }
        for (const key of plugin.autoTranslationInFlightTokens.keys()) {
            if (!plugin.autoTranslationInFlightKeys.has(key)) violations.push({ rule: "token-without-in-flight", key });
        }
        for (const key of plugin.autoTranslationVisibleLongInFlightKeys) {
            if (!plugin.autoTranslationInFlightKeys.has(key)) violations.push({ rule: "visible-long-without-in-flight", key });
        }
        // I4: the three render-queue structures track the same render-task key set.
        const renderQueueKeys = new Set((plugin.autoTranslationRenderQueue || []).map(task => task?.key).filter(Boolean));
        for (const key of plugin.autoTranslationRenderQueuedKeys) {
            if (!renderQueueKeys.has(key)) violations.push({ rule: "render-key-without-task", key });
        }
        for (const key of renderQueueKeys) {
            if (!plugin.autoTranslationRenderQueuedKeys.has(key)) violations.push({ rule: "render-task-without-key", key });
            if (!plugin.autoTranslationRenderQueuedTasks.has(key)) violations.push({ rule: "render-task-without-map-entry", key });
        }
        for (const key of plugin.autoTranslationRenderQueuedTasks.keys()) {
            if (!renderQueueKeys.has(key)) violations.push({ rule: "render-map-entry-without-task", key });
        }
        // I5: counters are never negative and prefetch in-flight never exceeds total.
        if (plugin.autoTranslationInFlight < 0) violations.push({ rule: "negative-in-flight-count" });
        if (plugin.autoTranslationInFlightItems < 0) violations.push({ rule: "negative-in-flight-items" });
        if (plugin.autoTranslationPrefetchInFlight < 0) violations.push({ rule: "negative-prefetch-count" });
        if (plugin.autoTranslationPrefetchInFlight > plugin.autoTranslationInFlight) {
            violations.push({ rule: "prefetch-exceeds-in-flight" });
        }
        return violations;
    }
}

module.exports = { AutoTranslationTaskState };
