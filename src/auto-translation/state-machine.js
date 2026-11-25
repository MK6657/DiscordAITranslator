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
        /** @type {Map<string, string | number>} */
        this.inFlightTokens = new Map();
        /** @type {Map<symbol, { keys: Set<string>, isPrefetch: boolean, configVersion: number }>} */
        this.inFlightBatches = new Map();
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
     * @param {{ allowDuplicateKey?: boolean }} [options]
     * @returns {boolean}
     */
    enqueue(item, options = {}) {
        const key = String(item?.cacheKey || "");
        if (!key) return false;
        if (!options.allowDuplicateKey && this.queuedKeys.has(key)) return false;
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
        const before = this.queue.length;
        this.queue = this.queue.filter(item => item?.cacheKey !== key);
        const removed = before - this.queue.length;
        const hadKey = !this.inFlightKeys.has(key) ? this.queuedKeys.delete(key) : false;
        return hadKey || removed > 0;
    }

    /**
     * Atomically marks a single item as in-flight across keys, timestamps, tokens, and visible-long tracking.
     * @param {any} item
     * @param {{ token?: string | number, startedAt?: number, isVisibleLong?: boolean, isPrefetch?: boolean }} [options]
     * @returns {string | number | null}
     */
    markInFlightItem(item, options = {}) {
        const key = String(item?.cacheKey || "");
        if (!key) return null;
        const startedAt = Number(options.startedAt || Date.now());
        const token = options.token !== undefined ? options.token : ++this.inFlightTokenCounter;
        this.inFlightKeys.add(key);
        if (options.isVisibleLong) {
            this.visibleLongInFlightKeys.add(key);
        }
        this.inFlightStartedAt.set(key, startedAt);
        this.inFlightTokens.set(key, token);
        if (item && typeof item === "object") {
            item.daitInFlightToken = token;
            if (options.isPrefetch !== undefined) {
                item.daitPrefetchRequest = Boolean(options.isPrefetch && !item.daitHistoryRequest);
            }
        }
        return token;
    }

    /**
     * Atomically transitions a batch of items into the in-flight state.
     * @param {any[]} batch
     * @param {{ isPrefetch?: boolean, startedAt?: number, isVisibleLong?: (item: any) => boolean, createToken?: (cacheKey: string) => string | number, onItemMarked?: (item: any, startedAt: number, token: string | number | null) => void }} [options]
     * @returns {Array<string | number>} Allocated per-item tokens
     */
    beginInFlightBatch(batch, options = {}) {
        if (!Array.isArray(batch) || !batch.length) return [];
        const isPrefetch = Boolean(options.isPrefetch);
        const startedAt = Number(options.startedAt || Date.now());
        const batchId = Symbol("dait-in-flight-batch");
        const batchKeys = new Set();
        this.inFlight++;
        this.inFlightItems += batch.length;
        if (isPrefetch) this.prefetchInFlight++;

        /** @type {Array<string | number>} */
        const tokens = [];
        for (const item of batch) {
            const key = String(item?.cacheKey || "");
            const token = typeof options.createToken === "function"
                ? options.createToken(key)
                : ++this.inFlightTokenCounter;
            tokens.push(token);
            if (item && typeof item === "object") {
                item.daitBatchId = batchId;
            }
            if (!key) {
                if (item && typeof item === "object") item.daitPrefetchRequest = isPrefetch;
                continue;
            }
            batchKeys.add(key);
            const isVisibleLong = typeof options.isVisibleLong === "function"
                ? Boolean(options.isVisibleLong(item))
                : false;
            this.markInFlightItem(item, { token, startedAt, isVisibleLong, isPrefetch });
            if (typeof options.onItemMarked === "function") {
                options.onItemMarked(item, startedAt, token);
            }
        }
        this.inFlightBatches.set(batchId, {
            keys: batchKeys,
            isPrefetch,
            configVersion: this.configVersion
        });
        return tokens;
    }

    /**
     * Releases a single key from a tracked batch, decrementing batch concurrency counters
     * once and only once when the batch has no remaining keys.
     * @param {symbol | null | undefined} batchId
     * @param {string} [cacheKey]
     * @param {{ forceFinishBatch?: boolean }} [options]
     * @returns {boolean} True when the batch slot itself was freed
     */
    releaseBatchKey(batchId, cacheKey = "", options = {}) {
        if (!batchId || !this.inFlightBatches.has(batchId)) return false;
        const entry = this.inFlightBatches.get(batchId);
        if (!entry) return false;
        const key = String(cacheKey || "");
        if (key) entry.keys.delete(key);
        if (!options.forceFinishBatch && entry.keys.size > 0) return false;
        this.inFlightBatches.delete(batchId);
        this.inFlight = Math.max(0, this.inFlight - 1);
        if (entry.isPrefetch) {
            this.prefetchInFlight = Math.max(0, this.prefetchInFlight - 1);
        }
        if (this.prefetchInFlight > this.inFlight) {
            this.prefetchInFlight = this.inFlight;
        }
        return true;
    }

    /**
     * Prunes a key across all tracked batches (e.g. stale in-flight timeout) and returns
     * how many batch concurrency slots were reclaimed.
     * @param {string} cacheKey
     * @returns {number}
     */
    pruneKeyFromInFlightBatches(cacheKey) {
        const key = String(cacheKey || "");
        if (!key || !this.inFlightBatches.size) return 0;
        let freedBatches = 0;
        for (const [batchId, entry] of [...this.inFlightBatches.entries()]) {
            if (!entry.keys.has(key)) continue;
            if (this.releaseBatchKey(batchId, key)) freedBatches++;
        }
        return freedBatches;
    }

    /**
     * Atomically clears in-flight tracking for a single item when its token matches.
     * @param {string} cacheKey
     * @param {string | number} [token]
     * @param {{ keepQueuedKey?: boolean }} [options]
     * @returns {boolean}
     */
    finishInFlightItem(cacheKey, token, options = {}) {
        const key = String(cacheKey || "");
        if (!key) return false;
        if (token !== undefined && this.inFlightTokens.has(key) && this.inFlightTokens.get(key) !== token) {
            return false;
        }
        this.inFlightKeys.delete(key);
        this.visibleLongInFlightKeys.delete(key);
        this.inFlightStartedAt.delete(key);
        this.inFlightTokens.delete(key);
        if (!options.keepQueuedKey) {
            this.queuedKeys.delete(key);
        }
        return true;
    }

    /**
     * Decrements inFlightItems safely, clamping at 0.
     * @param {number} count
     */
    releaseInFlightItems(count = 1) {
        const size = Math.max(0, Number(count || 0));
        this.inFlightItems = Math.max(0, this.inFlightItems - size);
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
            const existing = this.renderQueuedTasks.get(key);
            if (existing && typeof existing === "object") {
                Object.assign(existing, task);
            }
            else {
                this.renderQueuedTasks.set(key, task);
                const idx = this.renderQueue.findIndex(item => item?.key === key);
                if (idx >= 0) this.renderQueue[idx] = task;
            }
            if (task?.cacheKey) this.renderPendingKeys.add(String(task.cacheKey));
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
        this.inFlightBatches.clear();
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
