"use strict";

// Unified Discord Host Adapter facade.
// Consolidates Discord DOM selectors, Webpack stores, context menu patches, chat observer,
// launcher/theme detection, message extraction, scroll anchoring, translation DOM rendering,
// Slate composer integration, and host health checks behind one boundary so future Discord
// client updates stay isolated inside src/discord/.

const { DiscordSelectors } = require("./selectors");
const { DiscordStores } = require("./stores");
const { DiscordContextMenuAdapter } = require("./context-menu");
const { MessageTracker } = require("./message-tracker");
const { DiscordChatObserverController, CHAT_OBSERVER_METHOD_NAMES } = require("./chat-observer");
const { DiscordLauncherThemeController, LAUNCHER_THEME_METHOD_NAMES } = require("./launcher-and-theme");
const { DiscordMessageExtractorController, MESSAGE_EXTRACTOR_METHOD_NAMES } = require("./message-extractor");
const { DiscordScrollAnchorController, SCROLL_ANCHOR_METHOD_NAMES } = require("./scroll-anchor");
const { DiscordTranslationLineDomController, TRANSLATION_LINE_DOM_METHOD_NAMES } = require("./translation-line-dom");
const { DiscordSlateComposerController, SLATE_COMPOSER_METHOD_NAMES } = require("./slate-composer");
const { runHostHealthCheck } = require("./host-health");

const DISCORD_HOST_BRIDGES = Object.freeze([
    ["chatObserver", CHAT_OBSERVER_METHOD_NAMES],
    ["launcherTheme", LAUNCHER_THEME_METHOD_NAMES],
    ["messageExtractor", MESSAGE_EXTRACTOR_METHOD_NAMES],
    ["scrollAnchor", SCROLL_ANCHOR_METHOD_NAMES],
    ["translationLineDom", TRANSLATION_LINE_DOM_METHOD_NAMES],
    ["slateComposer", SLATE_COMPOSER_METHOD_NAMES]
]);

class DiscordHostAdapter {
    constructor(plugin) {
        this.plugin = plugin;
        this.selectors = new DiscordSelectors(plugin);
        this.stores = new DiscordStores(plugin);
        this.contextMenu = new DiscordContextMenuAdapter(plugin);
        this.messageTracker = new MessageTracker(plugin);
        this.chatObserver = new DiscordChatObserverController(plugin);
        this.launcherTheme = new DiscordLauncherThemeController(plugin);
        this.messageExtractor = new DiscordMessageExtractorController(plugin);
        this.scrollAnchor = new DiscordScrollAnchorController(plugin);
        this.translationLineDom = new DiscordTranslationLineDomController(plugin);
        this.slateComposer = new DiscordSlateComposerController(plugin);
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

module.exports = { DiscordHostAdapter, DISCORD_HOST_BRIDGES };
