"use strict";

// Live read-only Discord + BetterDiscord host health check.
// Lets maintainers and users see immediately which Discord anchor broke after a client update.

const { PLUGIN_VERSION } = require("../version");

function runHostHealthCheck(plugin) {
    const checks = [];
    const add = (id, labelKey, status, detail, meta = {}) => {
        checks.push({ id, labelKey, status, detail, meta });
    };

    const bdApi = globalThis.BdApi || null;
    const bdCaps = {
        Data: Boolean(bdApi?.Data?.load && bdApi?.Data?.save),
        DOM: Boolean(bdApi?.DOM?.addStyle && bdApi?.DOM?.removeStyle),
        UI: Boolean(bdApi?.UI?.showToast),
        Webpack: Boolean(bdApi?.Webpack?.getStore || bdApi?.Webpack?.getByKeys),
        ContextMenu: Boolean(bdApi?.ContextMenu?.patch && bdApi?.ContextMenu?.buildMenuChildren)
    };
    const missingBd = Object.entries(bdCaps).filter(([, ok]) => !ok).map(([name]) => name);
    add(
        "bdApi",
        "hostHealthItemBdApi",
        missingBd.length === 0 ? "ok" : bdApi ? "warn" : "error",
        missingBd.length === 0
            ? "Data / DOM / UI / Webpack / ContextMenu"
            : bdApi ? `Missing: ${missingBd.join(", ")}` : "BdApi unavailable",
        bdCaps
    );

    const storeHealth = {
        messageStore: Boolean(plugin.getDiscordMessageStore?.()),
        channelStore: Boolean(plugin.getDiscordNamedStore?.("ChannelStore") || plugin.getDiscordNamedStore?.("SelectedChannelStore")),
        guildRoleStore: Boolean(plugin.getDiscordNamedStore?.("GuildRoleStore") || plugin.getDiscordNamedStore?.("GuildStore"))
    };
    const storeParts = [
        `MessageStore:${storeHealth.messageStore ? "ok" : "miss"}`,
        `ChannelStore:${storeHealth.channelStore ? "ok" : "miss"}`,
        `RoleStore:${storeHealth.guildRoleStore ? "ok" : "miss"}`
    ];
    add(
        "stores",
        "hostHealthItemStores",
        storeHealth.messageStore ? (storeHealth.channelStore ? "ok" : "warn") : "warn",
        storeParts.join(" · "),
        storeHealth
    );

    const hasDoc = typeof document !== "undefined" && typeof document.querySelector === "function";
    const settingsOverlayOpen = hasDoc
        && Boolean(plugin.isDiscordSettingsSurfaceOpen?.({ force: true }))
        && !document.querySelector?.(".dait-quick-settings-modal-root");
    const chatRoot = hasDoc ? plugin.getDiscordChatMutationObserverRoot?.() : null;
    add(
        "chatRoot",
        "hostHealthItemChatRoot",
        chatRoot ? "ok" : "warn",
        chatRoot
            ? `<${String(chatRoot.tagName || "div").toLowerCase()}> (${plugin.observerRoot ? "observer bound" : "observer idle"})`
            : settingsOverlayOpen
                ? "Discord settings view active (return to a chat channel to inspect live DOM)"
                : "Chat container not mounted on current view",
        { found: Boolean(chatRoot), observerBound: Boolean(plugin.observerRoot), settingsOverlayOpen }
    );

    const messageSelector = plugin.discordHost?.selectors?.getMessageNodeSelector?.() || "[id^='chat-messages-'], [data-list-item-id*='chat-messages']";
    const messageNodes = hasDoc ? [...(document.querySelectorAll?.(messageSelector) || [])] : [];
    const sampleContent = messageNodes.slice(0, 5).filter(node => Boolean(plugin.getMessageContentElement?.(node))).length;
    add(
        "messages",
        "hostHealthItemMessages",
        messageNodes.length > 0 && sampleContent > 0 ? "ok" : "warn",
        messageNodes.length > 0
            ? `${messageNodes.length} nodes (${sampleContent}/${Math.min(5, messageNodes.length)} readable)`
            : settingsOverlayOpen
                ? "Hidden behind Discord settings overlay"
                : "No chat messages mounted in current view",
        { messageCount: messageNodes.length, readableSample: sampleContent, settingsOverlayOpen }
    );

    const textbox = hasDoc ? (plugin.getActiveTextbox?.() || plugin.getTextbox?.()) : null;
    const toolbar = textbox ? plugin.getPolishButtonContainer?.(textbox) : null;
    add(
        "composer",
        "hostHealthItemComposer",
        textbox && toolbar ? "ok" : textbox ? "warn" : "warn",
        textbox && toolbar
            ? "Textbox + toolbar anchor ready"
            : textbox
                ? "Textbox found, toolbar anchor missing"
                : settingsOverlayOpen
                    ? "Hidden behind Discord settings overlay"
                    : "No editable composer on current view",
        { hasTextbox: Boolean(textbox), hasToolbar: Boolean(toolbar), settingsOverlayOpen }
    );

    const launcherEnabled = plugin.settings?.ui?.showQuickSettingsPanelButton !== false;
    const userSettingsBtn = hasDoc && launcherEnabled ? plugin.findDiscordUserSettingsButton?.({ force: true }) : null;
    const launcher = hasDoc ? document.querySelector?.(".dait-quick-settings-button") : null;
    add(
        "userPanel",
        "hostHealthItemUserPanel",
        !launcherEnabled ? "ok" : launcher ? "ok" : (userSettingsBtn || settingsOverlayOpen) ? "warn" : "error",
        !launcherEnabled
            ? "Disabled in settings"
            : launcher
                ? "AI launcher mounted in user panel"
                : settingsOverlayOpen
                    ? "Discord settings overlay open (user panel hidden)"
                    : userSettingsBtn
                        ? "Settings button found, AI launcher not mounted"
                        : "User panel settings anchor not found",
        { enabled: launcherEnabled, hasSettingsButton: Boolean(userSettingsBtn), hasLauncher: Boolean(launcher), settingsOverlayOpen }
    );

    const contextEnabled = plugin.settings?.ui?.injectMessageContextMenu !== false;
    const patchCount = Array.isArray(plugin.unpatches) ? plugin.unpatches.length : 0;
    add(
        "contextMenu",
        "hostHealthItemContextMenu",
        !contextEnabled ? "ok" : patchCount > 0 ? "ok" : (bdCaps.ContextMenu ? "warn" : "error"),
        !contextEnabled
            ? "Disabled in settings"
            : patchCount > 0
                ? `${patchCount} menu patch(es) active`
                : "No context menu patches registered",
        { enabled: contextEnabled, patchCount }
    );

    const discordTheme = plugin.getDiscordThemeClass?.() || "unknown";
    const resolvedPanelTheme = plugin.resolvePanelTheme?.() || "dark";
    add(
        "theme",
        "hostHealthItemTheme",
        "ok",
        `Discord: ${discordTheme} → Panel: ${resolvedPanelTheme}`,
        { discordTheme, resolvedPanelTheme, setting: plugin.settings?.ui?.panelTheme || "auto" }
    );

    const ok = checks.filter(item => item.status === "ok").length;
    const warn = checks.filter(item => item.status === "warn").length;
    const error = checks.filter(item => item.status === "error").length;
    const overall = error > 0 ? "error" : warn > 0 ? "warn" : "ok";

    return {
        timestamp: new Date().toISOString(),
        version: PLUGIN_VERSION,
        route: plugin.getCurrentRouteKey?.() || "",
        summary: { ok, warn, error, total: checks.length, overall },
        checks
    };
}

module.exports = { runHostHealthCheck };
