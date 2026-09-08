"use strict";

class TranslationRenderer {
    constructor(plugin, options = {}) {
        this.plugin = plugin;
        this.heavyTextLength = Math.max(1, Number(options.heavyTextLength) || 1);
    }

    getTaskKey(kind, target, cacheKey = "", text = "") {
        const ownerId = this.plugin.getTranslationOwnerId(target?.content);
        if (!ownerId && !cacheKey) return "";
        return [
            kind || "auto",
            this.plugin.getStrongTextFingerprint(cacheKey || ""),
            ownerId || "",
            this.plugin.getStrongTextFingerprint(text || target?.text || "")
        ].join(":");
    }

    getQueueDelayMs(now = Date.now()) {
        const mediaDelayMs = this.plugin.getDiscordMediaViewerDeferredDelayMs(now);
        if (mediaDelayMs > 0) return mediaDelayMs;
        return Math.max(
            this.plugin.getAutoTranslationRenderPauseRemainingMs(now),
            this.plugin.getAutoTranslationViewportSettleRemainingMs(now),
            this.plugin.getAutoTranslationJumpCooldownRemainingMs(now),
            this.plugin.getInputComposerBusyRemainingMs(now)
        );
    }

    isRequestRenderBlocked(now = Date.now()) {
        return this.plugin.isAutoTranslationRenderPaused(now)
            || this.plugin.isAutoTranslationViewportSettling(now)
            || this.plugin.isAutoTranslationJumpCoolingDown(now);
    }

    isTaskHeavy(task) {
        if (task?.kind === "cache") return false;
        const sourceLength = String(task?.target?.text || task?.text || "").length;
        const translatedLength = String(task?.translated || "").length;
        return sourceLength >= this.heavyTextLength || translatedLength >= this.heavyTextLength;
    }

    sortQueue(queue = []) {
        queue.sort((left, right) => (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER));
    }
}

module.exports = { TranslationRenderer };
