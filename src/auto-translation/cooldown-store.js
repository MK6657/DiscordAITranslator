// @ts-check
"use strict";

/**
 * Encapsulates auto-translation failure backoff, provider cooldowns, user-attention notice
 * deduplication, precheck skip cache, and retry timer bookkeeping.
 */
class AutoTranslationCooldownStore {
    constructor() {
        /** @type {Map<string, any>} */
        this.failures = new Map();
        /** @type {Map<string, any>} */
        this.failureHistory = new Map();
        /** @type {Map<string, any>} */
        this.providerFailures = new Map();
        /** @type {Map<string, any>} */
        this.providerNoticeAt = new Map();
        /** @type {Map<string, any>} */
        this.precheckSkips = new Map();
        /** @type {any} */
        this.retryTimer = null;
        /** @type {number} */
        this.retryAt = 0;
        /** @type {number} */
        this.lastToastAt = 0;
    }

    /**
     * Clears the scheduled retry timer if active.
     */
    clearRetryTimer() {
        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }
        this.retryAt = 0;
    }

    /**
     * Clears message & provider cooldown maps with optional notice preservation.
     * @param {{ preserveNotices?: boolean }} [options]
     */
    clearFailures(options = {}) {
        this.failures.clear();
        this.providerFailures.clear();
        if (!options.preserveNotices) {
            this.providerNoticeAt.clear();
        }
    }

    /**
     * Clears all cooldown, history, skip, and timer state on plugin stop.
     */
    clearAll() {
        this.clearRetryTimer();
        this.failures.clear();
        this.failureHistory.clear();
        this.providerFailures.clear();
        this.providerNoticeAt.clear();
        this.precheckSkips.clear();
    }
}

module.exports = { AutoTranslationCooldownStore };
