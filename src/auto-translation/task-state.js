"use strict";

// Phase 6 unified task-state view backed by AutoTranslationStateMachine + AutoTranslationCooldownStore.
// Preserves the snapshot and invariant-checker surface used by tests and diagnostics.

class AutoTranslationTaskState {
    constructor(plugin) {
        this.plugin = plugin;
    }

    getTaskSnapshot(cacheKey) {
        const failure = this.plugin.autoCooldowns?.failures?.get?.(String(cacheKey || ""))
            || this.plugin.autoTranslationFailures?.get?.(String(cacheKey || ""))
            || null;
        return this.plugin.autoStateMachine.getTaskSnapshot(cacheKey, failure);
    }

    listTrackedKeys() {
        return this.plugin.autoStateMachine.listTrackedKeys();
    }

    checkInvariants() {
        return this.plugin.autoStateMachine.checkInvariants();
    }
}

module.exports = { AutoTranslationTaskState };
