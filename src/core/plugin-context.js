// @ts-check
"use strict";

/**
 * Explicit dependency context facade passed to domain modules and controllers.
 * Resolves sibling subsystems lazily via getters so modules depend on a small,
 * documented contract instead of reaching into arbitrary plugin internals, while
 * remaining 100% compatible with standalone unit tests passing minimal mocks.
 *
 * @param {any} plugin
 */
function createPluginContext(plugin) {
    return {
        get plugin() { return plugin; },
        get events() { return plugin?.events; },
        get scope() { return plugin?.runtimeScope; },
        get settings() { return plugin?.settings; },
        get settingsStore() { return plugin?.settingsStore; },
        get providers() { return plugin?.providerLayer; },
        get cache() { return plugin?.translationCacheStore; },
        get outputGuard() { return plugin?.outputGuard; },
        get diagnostics() { return plugin?.diagnosticsRecorder; },
        get stateMachine() { return plugin?.autoStateMachine; },
        get cooldowns() { return plugin?.autoCooldowns; },
        get queue() { return plugin?.autoQueueCore; },
        get pipeline() { return plugin?.autoRequestPipeline; },
        get scheduler() { return plugin?.translationScheduler; },
        get renderer() { return plugin?.translationRenderer; },
        get host() { return plugin?.discordHost; },
        get quickPanel() { return plugin?.quickPanel; },
        get panelTheme() { return plugin?.panelTheme; },
        /** @param {string} key @param {Record<string, any>} [vars] */
        t(key, vars) { return plugin.t(key, vars); },
        getLocale() { return plugin.getLocale(); },
        getLifecycleToken() { return plugin.getLifecycleToken(); },
        /** @param {number} token */
        isLifecycleTokenCurrent(token) { return plugin.isLifecycleTokenCurrent(token); },
        /** @param {any} timer */
        unrefTimer(timer) { return plugin.unrefTimer?.(timer); },
        /** @param {string} message @param {string} [type] */
        showToast(message, type) { return plugin.showToast?.(message, type); },
        /** @param {any} error @param {any} [options] */
        formatError(error, options) { return plugin.formatError?.(error, options); }
    };
}

module.exports = { createPluginContext };
