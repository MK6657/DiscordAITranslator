// @ts-check
"use strict";

/**
 * Single-source-of-truth state machine for automatic translation tasks and render tasks.
 * Encapsulates queued, in-flight, pending-target, and render-queue collections with atomic
 * transitions so invariants I1-I5 hold by construction.
 */
class AutoTranslationStateMachine {
    constructor() {
        /** @type {any[]} */
        this.queue = [];
        /** @type {boolean} */
        this.queueSortDirty = false;
        /** @type {Set<string>} */
        this.queuedKeys = new Set();
        /** @type {Map<string, { targets: any[] }>} */
        this.pendingTargets = new Map();

        /** @type {number} */
        this.inFlight = 0;
        /** @type {Set<string>} */
        this.inFlightKeys = new Set();
        /** @type {Set<string>} */
        this.visibleLongInFlightKeys = new Set();
        /** @type {Map<string, number>} */
        this.inFlightStartedAt = new Map();
        /** @type {Map<string, number>} */
        this.inFlightTokens = new Map();
        /** @type {number} */
        this.inFlightTokenCounter = 0;
        /** @type {number} */
        this.inFlightItems = 0;
        /** @type {number} */
        this.prefetchInFlight = 0;

        /** @type {any[]} */
        this.renderQueue = [];
        /** @type {Set<string>} */
        this.renderQueuedKeys = new Set();
        /** @type {Map<string, any>} */
        this.renderQueuedTasks = new Map();
        /** @type {Set<string>} */
        this.renderPendingKeys = new Set();
        /** @type {boolean} */
        this.renderQueueDirty = false;
        /** @type {any} */
        this.renderRaf = null;
        /** @type {any} */
        this.renderTimer = null;
        /** @type {number} */
        this.renderDueAt = 0;

        /** @type {number} */
        this.configVersion = 0;
        /** @type {Map<string, any>} */
        this.recentRenders = new Map();
        /** @type {Map<string, any>} */
        this.lastDecisions = new Map();
    }

    /**
     * Atomically enqueues a translation item into queue + queuedKeys.
     * @param {any} item
     * @returns {boolean}
     */
    enqueue(item) {
        const key = String(item?.cacheKey || "");
        if (!key || this.queuedKeys.has(key)) return false;
        this.queue.push(item);
        this.queuedKeys.add(key);
        this.queueSortDirty = true;
        return true;
    }

    /**
     * Atomically removes a queued item by cacheKey.
     * @param {string} cacheKey
     * @returns {boolean}
     */
    removeQueued(cacheKey) {
        const key = String(cacheKey || "");
        if (!key) return false;
        const hadKey = this.queuedKeys.delete(key);
        const before = this.queue.length;
        this.queue = this.queue.filter(item => item?.cacheKey !== key);
        return hadKey || this.queue.length !== before;
    }

    /**
     * Atomically transitions a batch of items into the in-flight state.
     * @param {any[]} batch
     * @param {{ isPrefetch?: boolean, startedAt?: number, isVisibleLong?: (item: any) => boolean }} [options]
     * @returns {number[]} Allocated per-item tokens
     */
    beginInFlightBatch(batch, options = {}) {
        if (!Array.isArray(batch) || !batch.length) return [];
        const isPrefetch = Boolean(options.isPrefetch);
        const startedAt = Number(options.startedAt || Date.now());
        this.inFlight++;
        this.inFlightItems += batch.length;
        if (isPrefetch) this.prefetchInFlight++;

        const tokens = [];
        for (const item of batch) {
            const key = String(item?.cacheKey || "");
            const token = ++this.inFlightTokenCounter;
            tokens.push(token);
            if (!key) continue;
            this.inFlightKeys.add(key);
            this.inFlightStartedAt.set(key, startedAt);
            this.inFlightTokens.set(key, token);
            if (typeof options.isVisibleLong === "function" && options.isVisibleLong(item)) {
                this.visibleLongInFlightKeys.add(key);
            }
            if (item && typeof item === "object") {
                item.daitInFlightToken = token;
                item.daitPrefetchRequest = isPrefetch;
            }
        }
        return tokens;
    }

    /**
     * Atomically clears in-flight tracking for a single item when its token matches.
     * @param {string} cacheKey
     * @param {number} [token]
     * @returns {boolean}
     */
    finishInFlightItem(cacheKey, token) {
        const key = String(cacheKey || "");
        if (!key) return false;
        if (token !== undefined && this.inFlightTokens.has(key) && this.inFlightTokens.get(key) !== token) {
            return false;
        }
        this.inFlightKeys.delete(key);
        this.visibleLongInFlightKeys.delete(key);
        this.inFlightStartedAt.delete(key);
        this.inFlightTokens.delete(key);
        this.queuedKeys.delete(key);
        return true;
    }

    /**
     * Atomically decrements batch counters, clamping at 0 so I5 never breaks.
     * @param {{ batchSize?: number, isPrefetch?: boolean }} [options]
     */
    finishInFlightBatch(options = {}) {
        const size = Math.max(0, Number(options.batchSize || 0));
        this.inFlight = Math.max(0, this.inFlight - 1);
        this.inFlightItems = Math.max(0, this.inFlightItems - size);
        if (options.isPrefetch) {
            this.prefetchInFlight = Math.max(0, this.prefetchInFlight - 1);
        }
        if (this.prefetchInFlight > this.inFlight) {
            this.prefetchInFlight = this.inFlight;
        }
    }

    /**
     * Atomically enqueues a render task across renderQueue, renderQueuedKeys, and renderQueuedTasks.
     * @param {any} task
     * @returns {boolean}
     */
    enqueueRenderTask(task) {
        const key = String(task?.key || "");
        if (!key) return false;
        if (this.renderQueuedKeys.has(key)) {
            this.renderQueuedTasks.set(key, task);
            const idx = this.renderQueue.findIndex(item => item?.key === key);
            if (idx >= 0) this.renderQueue[idx] = task;
            this.renderQueueDirty = true;
            return false;
        }
        this.renderQueue.push(task);
        this.renderQueuedKeys.add(key);
        this.renderQueuedTasks.set(key, task);
        if (task?.cacheKey) this.renderPendingKeys.add(String(task.cacheKey));
        this.renderQueueDirty = true;
        return true;
    }

    /**
     * Atomically clears the render queue and its auxiliary index structures.
     */
    clearRenderQueue() {
        this.renderQueue = [];
        this.renderQueuedKeys.clear();
        this.renderQueuedTasks.clear();
        this.renderPendingKeys.clear();
        this.renderQueueDirty = false;
        this.renderDueAt = 0;
    }

    /**
     * Clears in-flight structures and counters atomically.
     */
    clearInFlight() {
        this.inFlight = 0;
        this.inFlightKeys.clear();
        this.visibleLongInFlightKeys.clear();
        this.inFlightStartedAt.clear();
        this.inFlightTokens.clear();
        this.inFlightItems = 0;
        this.prefetchInFlight = 0;
    }

    /**
     * Resets all runtime task/render/queue collections on plugin stop.
     */
    resetAll() {
        this.queue = [];
        this.queueSortDirty = false;
        this.queuedKeys.clear();
        this.pendingTargets.clear();
        this.clearInFlight();
        this.clearRenderQueue();
        this.recentRenders.clear();
        this.lastDecisions.clear();
        this.configVersion++;
    }

    /**
     * Returns whether any runtime queue/in-flight/render work exists.
     * @returns {boolean}
     */
    hasActiveWork() {
        return Boolean(
            this.queue.length
            || this.queuedKeys.size
            || this.pendingTargets.size
            || this.inFlightKeys.size
            || this.inFlightItems
            || this.renderQueue.length
        );
    }

    /**
     * Projects the per-key task snapshot (compatible with AutoTranslationTaskState).
     * @param {string} cacheKey
     * @param {any} [failure]
     */
    getTaskSnapshot(cacheKey, failure = null) {
        const key = String(cacheKey || "");
        const queuedItem = this.queue.find(item => item?.cacheKey === key) || null;
        const renderQueued = this.renderQueue.some(task => task?.cacheKey === key);
        return {
            cacheKey: key,
            queued: Boolean(queuedItem),
            queuedKey: this.queuedKeys.has(key),
            inFlight: this.inFlightKeys.has(key),
            visibleLongInFlight: this.visibleLongInFlightKeys.has(key),
            renderQueued,
            renderPending: this.renderPendingKeys.has(key),
            pendingTargets: this.pendingTargets.has(key),
            failure,
            priority: queuedItem?.priority ?? null
        };
    }

    /**
     * Lists every cacheKey currently tracked across all active task stages.
     * @returns {string[]}
     */
    listTrackedKeys() {
        const keys = new Set();
        for (const item of this.queue) { if (item?.cacheKey) keys.add(item.cacheKey); }
        for (const key of this.queuedKeys) keys.add(key);
        for (const key of this.inFlightKeys) keys.add(key);
        for (const task of this.renderQueue) { if (task?.cacheKey) keys.add(task.cacheKey); }
        for (const key of this.renderPendingKeys) keys.add(key);
        for (const key of this.pendingTargets.keys()) keys.add(key);
        return [...keys];
    }

    /**
     * Verifies all five structural invariants (I1-I5). Empty array means consistent.
     * @returns {Array<{ rule: string, key?: string }>}
     */
    checkInvariants() {
        /** @type {Array<{ rule: string, key?: string }>} */
        const violations = [];
        const queueKeys = new Set(this.queue.map(item => item?.cacheKey).filter(Boolean));

        for (const key of queueKeys) {
            if (!this.queuedKeys.has(key)) violations.push({ rule: "queued-item-without-key", key });
        }
        for (const key of this.queuedKeys) {
            if (!queueKeys.has(key) && !this.inFlightKeys.has(key)) {
                violations.push({ rule: "queued-key-without-item", key });
            }
        }
        for (const key of this.inFlightKeys) {
            if (!this.inFlightTokens.has(key)) violations.push({ rule: "in-flight-without-token", key });
            if (!this.inFlightStartedAt.has(key)) violations.push({ rule: "in-flight-without-started-at", key });
        }
        for (const key of this.inFlightTokens.keys()) {
            if (!this.inFlightKeys.has(key)) violations.push({ rule: "token-without-in-flight", key });
        }
        for (const key of this.visibleLongInFlightKeys) {
            if (!this.inFlightKeys.has(key)) violations.push({ rule: "visible-long-without-in-flight", key });
        }
        const renderQueueKeys = new Set(this.renderQueue.map(task => task?.key).filter(Boolean));
        for (const key of this.renderQueuedKeys) {
            if (!renderQueueKeys.has(key)) violations.push({ rule: "render-key-without-task", key });
        }
        for (const key of renderQueueKeys) {
            if (!this.renderQueuedKeys.has(key)) violations.push({ rule: "render-task-without-key", key });
            if (!this.renderQueuedTasks.has(key)) violations.push({ rule: "render-task-without-map-entry", key });
        }
        for (const key of this.renderQueuedTasks.keys()) {
            if (!renderQueueKeys.has(key)) violations.push({ rule: "render-map-entry-without-task", key });
        }
        if (this.inFlight < 0) violations.push({ rule: "negative-in-flight-count" });
        if (this.inFlightItems < 0) violations.push({ rule: "negative-in-flight-items" });
        if (this.prefetchInFlight < 0) violations.push({ rule: "negative-prefetch-count" });
        if (this.prefetchInFlight > this.inFlight) {
            violations.push({ rule: "prefetch-exceeds-in-flight" });
        }
        return violations;
    }
}

module.exports = { AutoTranslationStateMachine };
