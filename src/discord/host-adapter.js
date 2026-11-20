"use strict";

// Unified Discord Host Adapter facade.
// Consolidates Discord DOM selectors, Webpack stores, context menu patches, and host health checks
// behind one boundary so future Discord client updates stay isolated inside src/discord/.

const { DiscordSelectors } = require("./selectors");
const { DiscordStores } = require("./stores");
const { DiscordContextMenuAdapter } = require("./context-menu");
const { runHostHealthCheck } = require("./host-health");

class DiscordHostAdapter {
    constructor(plugin) {
        this.plugin = plugin;
        this.selectors = new DiscordSelectors(plugin);
        this.stores = new DiscordStores(plugin);
        this.contextMenu = new DiscordContextMenuAdapter(plugin);
    }

    getNamedStore(name) {
        return this.stores.getStore(name);
    }

    getMessageStore() {
        return this.stores.getMessageStore();
    }

    getUnicodeEmojiUtils() {
        return this.stores.getUnicodeEmojiUtils();
    }

    getActiveRouteIds() {
        return this.stores.getActiveRouteIds();
    }

    getChatObserverSelectors() {
        return this.selectors.getChatObserverSelectors();
    }

    getUserPanelLookupRootSelector() {
        return this.selectors.getUserPanelLookupRootSelector();
    }

    findUserSettingsButtonStructural() {
        return this.selectors.findUserSettingsButtonStructural(node => this.plugin.isOwnPluginElement?.(node));
    }

    isUserSettingsLabel(label) {
        return this.selectors.isUserSettingsLabel(label);
    }

    isComposerToolbarAnchorLabel(label) {
        return this.selectors.isComposerToolbarAnchorLabel(label);
    }

    patchMessageContextMenu() {
        return this.contextMenu.patchMessageMenus();
    }

    unpatchContextMenus() {
        return this.contextMenu.unpatchAll();
    }

    runHealthCheck() {
        return runHostHealthCheck(this.plugin);
    }

    resetRuntimeCaches() {
        this.selectors.clearCache();
        this.stores.clearCache();
    }
}

module.exports = { DiscordHostAdapter };
