"use strict";

// Resilient BetterDiscord ContextMenu patch manager.
// Uses exact Discord navIds ("message" and "message-actions") instead of regex patterns
// (BetterDiscord's ContextMenu.patch indexes exact string navIds) and prevents duplicate
// menu injection across re-renders or repeated enable cycles.

const { DISCORD_MESSAGE_NODE_SELECTOR } = require("../constants");

const MESSAGE_CONTEXT_NAV_IDS = Object.freeze(["message", "message-actions"]);
const PRIMARY_MENU_ITEM_ID = "dait-translate-message";

function hasExistingMenuItem(node, targetId, depth = 0) {
    if (!node || depth > 10) return false;
    if (Array.isArray(node)) {
        return node.some(child => hasExistingMenuItem(child, targetId, depth + 1));
    }
    if (typeof node !== "object") return false;
    if (node.id === targetId || node.props?.id === targetId) return true;
    if (Array.isArray(node.items) && hasExistingMenuItem(node.items, targetId, depth + 1)) return true;
    if (node.props?.children) return hasExistingMenuItem(node.props.children, targetId, depth + 1);
    return false;
}

class DiscordContextMenuAdapter {
    constructor(plugin) {
        this.plugin = plugin;
        this.messageMenuPatch = null;
    }

    isChannelCurrent(routeKey) {
        const current = this.plugin.getCurrentRouteKey();
        return current === routeKey || this.plugin.isSameAutoTranslationRouteScope(current, routeKey);
    }

    getMessageTarget(target) {
        if (!target || target.isConnected === false) return null;
        const element = target.nodeType === 3 ? target.parentElement : target;
        if (!element || element.isConnected === false) return null;
        if (typeof element.closest !== "function") return element.id ? { identity: String(element.id) } : null;
        const messageNode = element.closest(DISCORD_MESSAGE_NODE_SELECTOR);
        const content = messageNode && (
            this.plugin.resolveMessageContentForTarget?.(element, messageNode)
            || this.plugin.getMessageContentElement(messageNode)
        );
        if (!messageNode?.isConnected || !content?.isConnected || messageNode.contains?.(content) === false) return null;

        this.plugin.elementTextCache?.delete(content);
        const text = this.plugin.getElementText(content);
        return {
            messageNode,
            content,
            identity: this.plugin.getMessageIdentity(messageNode, content, text),
            textHash: this.plugin.getStrongTextFingerprint(text)
        };
    }

    isMessageTargetCurrent(target, expected) {
        if (!expected) return false;
        const current = this.getMessageTarget(target);
        return Boolean(current
            && current.messageNode === expected.messageNode
            && current.content === expected.content
            && current.identity === expected.identity
            && current.textHash === expected.textHash);
    }

    getLineTextHash(line) {
        const text = this.plugin.translationLineTexts?.get?.(line) ?? this.plugin.getTranslationLineRenderedText(line);
        return this.plugin.getStrongTextFingerprint(text);
    }

    getComposerMenuConfigKey(kind) {
        const plugin = this.plugin;
        const overrides = kind === "translation" ? plugin.getPublicBilingualTranslationOverrides() : null;
        const config = plugin.getEffectiveTaskConfig(kind, overrides);
        const behavior = kind === "polish" ? [
            plugin.settings.ui?.injectInputButton,
            plugin.getPolishAfterAction(),
            plugin.getPolishRepolishSource(),
            plugin.isPublicBilingualAfterPolishEnabled()
        ] : [
            plugin.settings.ui?.publicBilingualInputButton,
            plugin.isPublicBilingualUseInitialOriginalEnabled(),
            plugin.isPublicBilingualPolishBeforeTranslateEnabled()
        ];
        const customCredentials = (plugin.providerLayer?.registry?.getCredentialFields?.(config) || [])
            .filter(field => field && !["apiKey", "secretKey"].includes(field))
            .map(field => [field, config[field] ?? ""]);
        return plugin.getStrongTextFingerprint(JSON.stringify([
            plugin.getCacheConfigSnapshot(kind, config), config.apiKey, config.apiKeyOrigin, config.secretKey, customCredentials, behavior
        ]));
    }

    getComposerMenuItems(menu, group, textbox, button) {
        const plugin = this.plugin;
        const lifecycleToken = plugin.getLifecycleToken();
        const routeKey = plugin.getCurrentRouteKey();
        const composerKey = textbox ? plugin.getTextboxComposerKey(textbox) : "";
        const draft = textbox ? plugin.getTextboxDraftText(textbox) : "";
        const anchor = button || group;
        const isCurrent = () => plugin.isLifecycleTokenCurrent(lifecycleToken)
            && plugin.inputActionMenu === menu && menu.isConnected && anchor?.isConnected !== false
            && this.isChannelCurrent(routeKey)
            && (!textbox || plugin.isInputActionTextboxCurrent(textbox, composerKey));
        const isDraftCurrent = () => Boolean(textbox && plugin.isCurrentDraftText(textbox, draft) && !plugin.isComposerFocusElsewhere(textbox));
        const items = [];
        const addItem = (label, title, action, canRun = () => true) => {
            items.push({
                label,
                title,
                action: () => {
                    if (!isCurrent() || !canRun()) return;
                    plugin.removeInputActionMenu();
                    return action();
                }
            });
        };

        const session = plugin.polishSession;
        if (session && plugin.canRestorePolishOriginal(textbox, session)) {
            addItem(plugin.t("restoreOriginal"), plugin.t("restoreOriginal"),
                () => plugin.restorePolishOriginal(textbox, session, button),
                () => isDraftCurrent() && plugin.polishSession === session && plugin.canRestorePolishOriginal(textbox, session));
        }
        const canPolish = () => plugin.settings.polish?.enabled !== false
            && (plugin.settings.ui?.injectInputButton || group?.querySelector?.(".dait-polish-button"));
        if (canPolish()) {
            const configKey = this.getComposerMenuConfigKey("polish");
            addItem(plugin.t("polishButton"), plugin.getPolishButtonTitleAttr?.() || plugin.t("polishTitleAttr", { shortcut: plugin.getHotkeyLabel() }),
                () => plugin.polishCurrentDraft(group?.querySelector?.(".dait-polish-button") || button, { textbox, composerKey, fromMenu: true }),
                () => isDraftCurrent() && canPolish() && this.getComposerMenuConfigKey("polish") === configKey);
            addItem(plugin.t("polishPresetMenuItemAction"), plugin.getPolishPresetPickerTitleAttr?.() || plugin.t("polishPresetPicker"),
                () => plugin.openPolishPresetMenu?.(anchor, { group, textbox }),
                () => canPolish());
        }
        const canBilingual = () => plugin.isPublicBilingualFeatureEnabled()
            && (plugin.settings.ui?.publicBilingualInputButton || group?.querySelector?.(".dait-public-bilingual-button"));
        if (canBilingual()) {
            const configKey = this.getComposerMenuConfigKey("translation");
            addItem(plugin.t("publicBilingualButton"), plugin.t("publicBilingualTitleAttr", {
                targetLanguage: plugin.getDisplayLanguage(plugin.getPublicBilingualTargetLanguage())
            }), () => plugin.publicBilingualCurrentDraft(group?.querySelector?.(".dait-public-bilingual-button") || button, { textbox, composerKey }),
            () => isDraftCurrent() && canBilingual() && this.getComposerMenuConfigKey("translation") === configKey);
        }
        addItem(plugin.t("inputActionOpenSettings"), plugin.t("quickSettingsOpen"),
            () => plugin.openQuickSettingsPanel("input-menu", anchor));
        return items;
    }

    patchMessageMenus() {
        if (!this.plugin.isStarted) return false;
        const bdApi = globalThis.BdApi;
        if (!this.plugin.settings?.ui?.injectMessageContextMenu || !bdApi?.ContextMenu?.patch || !bdApi.ContextMenu?.buildMenuChildren) {
            return false;
        }
        // Unpatch any stale registrations first so repeated calls never stack duplicate items.
        this.unpatchAll();

        const lifecycleToken = this.plugin.getLifecycleToken();
        const isPatchCurrent = () => this.messageMenuPatch === patch
            && this.plugin.isLifecycleTokenCurrent(lifecycleToken)
            && this.plugin.shouldInjectMessageContextMenu();
        const patch = (tree, props) => {
            if (!isPatchCurrent()) return;
            if (hasExistingMenuItem(tree, PRIMARY_MENU_ITEM_ID)) return;

            const target = props?.target;
            const expectedTarget = this.getMessageTarget(target);
            const { routeKey, version, targetLanguage, providerKey } = this.plugin.getAutoTranslationOptions();
            const requestOptions = { version, targetLanguage, providerKey };
            const isMenuCurrent = () => isPatchCurrent()
                && this.isChannelCurrent(routeKey)
                && this.plugin.isManualTranslationConfigCurrent({ requestOptions });
            const forCurrentMessage = action => () => {
                if (!isMenuCurrent() || props?.target !== target || !this.isMessageTargetCurrent(target, expectedTarget)) return;
                return action();
            };

            const items = [{
                id: PRIMARY_MENU_ITEM_ID,
                label: this.plugin.t("translateMenu", {
                    targetLanguage: this.plugin.getDisplayLanguage(targetLanguage)
                }),
                action: forCurrentMessage(() => this.plugin.translateMessageFromContextTarget(target))
            }];

            const translated = expectedTarget?.messageNode && this.plugin.getTranslatedLineForContextTarget(target);
            if (translated) {
                const lineTextHash = this.getLineTextHash(translated.line);
                const forCurrentLine = action => forCurrentMessage(() => {
                    const current = this.plugin.getTranslatedLineForContextTarget(target);
                    if (!current?.line?.isConnected || current.line !== translated.line
                        || current.content !== translated.content || current.messageNode !== translated.messageNode
                        || this.getLineTextHash(current.line) !== lineTextHash) return;
                    return action(current);
                });
                items.push(
                    {
                        id: "dait-retranslate-message",
                        label: this.plugin.t("translationActionRetranslate"),
                        action: forCurrentLine(({ messageNode, content }) => this.plugin.retranslateMessage(messageNode, content))
                    },
                    {
                        id: "dait-copy-translation",
                        label: this.plugin.t("translationActionCopy"),
                        action: forCurrentLine(({ line }) => this.plugin.copyTranslationLineText(line))
                    },
                    {
                        id: "dait-hide-translation",
                        label: this.plugin.t("translationActionHide"),
                        action: forCurrentLine(({ line, messageNode, content }) => this.plugin.dismissTranslationLine(line, messageNode, content))
                    }
                );
            }

            if (this.plugin.settings.ui?.historyBackfillEnabled === true) {
                const autoTranslateEnabled = this.plugin.isAutoTranslateEnabled();
                items.push({
                    id: "dait-history-backfill",
                    label: this.plugin.t("historyBackfillContextMenu"),
                    action: () => {
                        if (!isMenuCurrent() || this.plugin.settings.ui?.historyBackfillEnabled !== true
                            || this.plugin.isAutoTranslateEnabled() !== autoTranslateEnabled) return;
                        return this.plugin.runExplicitHistoryBackfillFromUi(null, { source: "context-menu" });
                    }
                });
            }

            const built = bdApi.ContextMenu.buildMenuChildren([{
                type: "group",
                items
            }])?.[0];

            if (built) this.plugin.appendContextMenuItem(tree, built);
        };

        this.messageMenuPatch = patch;
        let patchedCount = 0;
        for (const navId of MESSAGE_CONTEXT_NAV_IDS) {
            try {
                const unpatch = bdApi.ContextMenu.patch(navId, patch);
                if (typeof unpatch === "function") {
                    this.plugin.unpatches.push(unpatch);
                    patchedCount++;
                }
            }
            catch (error) {
                if (navId === "message") {
                    this.plugin.showToast(this.plugin.t("contextPatchFailed", { error: this.plugin.formatError(error) }), "error");
                }
                else {
                    this.plugin.warnSanitized?.(`Optional context menu patch failed (${navId})`, error);
                }
            }
        }
        if (!patchedCount) this.messageMenuPatch = null;
        return patchedCount > 0;
    }

    unpatchAll() {
        this.messageMenuPatch = null;
        const list = this.plugin.unpatches;
        if (!Array.isArray(list)) return;
        list.splice(0).forEach(unpatch => {
            try { unpatch?.(); }
            catch (error) {
                this.plugin.warnSanitized?.("Failed to unpatch context menu", error);
            }
        });
    }
}

module.exports = {
    DiscordContextMenuAdapter,
    MESSAGE_CONTEXT_NAV_IDS,
    hasExistingMenuItem
};
