"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const {
    CHANNEL,
    GUILD,
    CHAT_MESSAGES,
    createFakeDataApi,
    installChatGlobals,
    mountChat,
    createV030Settings
} = require("../fixtures/chat-harness");
const { el } = require("../fixtures/fake-dom");

const MESSAGE_ITEMS = [
    "dait-translate-message",
    "dait-retranslate-message",
    "dait-copy-translation",
    "dait-hide-translation",
    "dait-history-backfill"
];
const OTHER_CHANNEL = "222222222222222223";
const TRANSLATION = "请查看新的版本。";
const COMPOSER_ITEMS = ["restoreOriginal", "polishButton", "publicBilingualButton", "inputActionOpenSettings"];

function openHost(t) {
    const settings = createV030Settings({ remote: true });
    settings.ui.historyBackfillEnabled = true;
    settings.ui.injectInputButton = true;
    settings.ui.publicBilingualInputButton = true;
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings } });
    const callbacks = new Map();
    bdApi.ContextMenu = {
        patch(navId, callback) {
            callbacks.set(navId, callback);
            return () => callbacks.delete(navId);
        },
        buildMenuChildren: groups => groups
    };
    const { document, restore } = installChatGlobals({ bdApi });
    const chat = mountChat(document, CHAT_MESSAGES.slice(0, 2));
    const plugin = new Plugin();
    Object.assign(plugin, {
        injectStyles() {},
        removeStyles() {},
        startObserver() {},
        queueScan() {},
        showToast() {},
        fetchApiResponseText() { assert.fail("Unexpected provider call"); }
    });
    t.after(() => {
        try {
            if (plugin.isStarted) plugin.stop();
        }
        finally {
            restore();
        }
    });
    assert.equal(plugin.start(), true);
    return { plugin, document, chat, callbacks };
}

function showLine(plugin, { messageNode, content }, text = TRANSLATION) {
    const line = content.appendChild(el("div", { class: "dait-translation-line" }, [
        el("span", { class: "dait-translation-text" }, [text])
    ]));
    plugin.setTranslationLineMetadata(line, messageNode, content, "menu-audit-key", plugin.getElementText(content));
    plugin.translationLineTexts.set(line, text);
    return line;
}

function buildMenu(patch, props) {
    const tree = { props: { children: [] } };
    patch(tree, props);
    return Object.fromEntries((tree.props.children[0]?.items || []).map(item => [item.id, item.action]));
}

function spyMessageEffects(t, plugin) {
    const translated = t.mock.method(plugin, "translateMessage", () => {});
    const copied = t.mock.method(plugin, "copyTextToClipboard", async () => {});
    const dismissed = t.mock.method(plugin, "dismissTranslationLine");
    const history = t.mock.method(plugin, "runExplicitHistoryBackfillFromUi", () => {});
    return { translated, copied, dismissed, history };
}

function effectCounts(effects) {
    return Object.values(effects).map(effect => effect.mock.callCount());
}

async function runMenu(items) {
    for (const action of Object.values(items)) await action();
}

function navigate(channelId, messageId = "") {
    window.location.pathname = `/channels/${GUILD}/${channelId}${messageId ? `/${messageId}` : ""}`;
}

function createComposer(plugin, document) {
    const form = document.body.appendChild(el("form"));
    const textbox = form.appendChild(el("textarea"));
    const group = form.appendChild(el("div"));
    const button = group.appendChild(el("button"));
    textbox.value = "This draft is ready for review.";
    return {
        form, textbox, group, button,
        openMenu: () => plugin.openInputActionMenu(group, textbox, form, button),
        setRestoreSession: () => {
            const session = plugin.createPolishSession(textbox, "This is the original draft.");
            plugin.updatePolishSessionAfterResult(session, textbox, textbox.value, true);
            return session;
        }
    };
}

function spyComposerEffects(t, plugin) {
    const restore = t.mock.method(plugin, "restorePolishOriginal", () => {});
    const polish = t.mock.method(plugin, "polishCurrentDraft", () => {});
    const bilingual = t.mock.method(plugin, "publicBilingualCurrentDraft", () => {});
    const settings = t.mock.method(plugin, "openQuickSettingsPanel", () => {});
    return { restore, polish, bilingual, settings };
}

function clickComposerItem(plugin, menu, key) {
    const item = menu.children.find(child => child.textContent === plugin.t(key));
    assert.ok(item, key);
    item.listeners.click.forEach(listener => listener({ preventDefault() {}, stopPropagation() {} }));
}

test("H06 detaches old message menus across stop and restart", async t => {
    const { plugin, chat, callbacks } = openHost(t);
    const message = chat.get(CHAT_MESSAGES[0].id);
    showLine(plugin, message);
    const effects = spyMessageEffects(t, plugin);
    const oldPatch = callbacks.get("message");
    const props = { target: message.content };
    const oldMenu = buildMenu(oldPatch, props);
    assert.deepEqual(Object.keys(oldMenu), MESSAGE_ITEMS);

    plugin.stop();
    assert.equal(callbacks.size, 0);
    await runMenu(oldMenu);
    assert.deepEqual(buildMenu(oldPatch, props), {});
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);

    assert.equal(plugin.start(), true);
    const currentLine = showLine(plugin, message);
    await runMenu(oldMenu);
    assert.deepEqual(buildMenu(oldPatch, props), {});
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);
    assert.equal(currentLine.classList.contains("dait-translation-dismissed"), false);

    const currentMenu = buildMenu(callbacks.get("message-actions"), props);
    assert.deepEqual(Object.keys(currentMenu), MESSAGE_ITEMS);
    await runMenu(currentMenu);
    assert.deepEqual(effectCounts(effects), [2, 1, 1, 1]);
    assert.deepEqual(effects.translated.mock.calls[0].arguments, [message.messageNode, message.content]);
    assert.deepEqual(effects.translated.mock.calls[1].arguments, [
        message.messageNode, message.content, null, null, { bypassCache: true }
    ]);
    assert.deepEqual(effects.copied.mock.calls[0].arguments, [TRANSLATION]);
    assert.equal(currentLine.classList.contains("dait-translation-dismissed"), true);
    assert.deepEqual(effects.history.mock.calls[0].arguments, [null, { source: "context-menu" }]);
});

test("H06 rechecks message menu settings, service configuration and registration", async t => {
    const { plugin, chat, callbacks } = openHost(t);
    const message = chat.get(CHAT_MESSAGES[0].id);
    const props = { target: message.content };
    const openMenu = () => buildMenu(callbacks.get("message"), props);
    showLine(plugin, message);
    const effects = spyMessageEffects(t, plugin);
    for (const [settings, key, value] of [
        [plugin.settings.ui, "injectMessageContextMenu", false],
        [plugin.settings.translation, "enabled", false],
        [plugin.settings.translation, "targetLanguage", "Japanese"],
        [plugin.settings.translation, "apiKey", "synthetic-replacement-key"]
    ]) {
        const oldMenu = openMenu();
        const previous = settings[key];
        settings[key] = value;
        await runMenu(oldMenu);
        assert.deepEqual(effectCounts(effects), [0, 0, 0, 0], key);
        settings[key] = previous;
    }

    const oldMenu = openMenu();
    const token = plugin.getLifecycleToken();
    assert.equal(plugin.patchMessageContextMenu(), true);
    assert.equal(plugin.getLifecycleToken(), token);
    await runMenu(oldMenu);
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);
    await openMenu()["dait-copy-translation"]();
    assert.equal(effects.copied.mock.callCount(), 1);
});

test("H06 ignores reused, edited and disconnected message targets", async t => {
    const { plugin, chat, callbacks } = openHost(t);
    const message = chat.get(CHAT_MESSAGES[0].id);
    const other = chat.get(CHAT_MESSAGES[1].id);
    const { messageNode, content } = message;
    const props = { target: content };
    showLine(plugin, message);
    const effects = spyMessageEffects(t, plugin);
    const openMenu = () => buildMenu(callbacks.get("message"), props);
    const messageActions = async items => {
        for (const id of MESSAGE_ITEMS.slice(0, 4)) await items[id]();
    };

    const movedProps = openMenu();
    props.target = other.content;
    await messageActions(movedProps);
    props.target = content;

    const reusedRow = openMenu();
    const oldId = messageNode.id;
    messageNode.setAttribute("id", other.messageNode.id);
    await messageActions(reusedRow);
    messageNode.setAttribute("id", oldId);

    const editedRow = openMenu();
    const sourceNode = content.childNodes[0];
    const original = sourceNode.textContent;
    sourceNode.textContent = "A different message shown by the same node.";
    await messageActions(editedRow);
    sourceNode.textContent = original;

    const detachedRow = openMenu();
    messageNode.remove();
    await messageActions(detachedRow);
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);
});

test("H06 checks that translated line actions still name the displayed result", async t => {
    const { plugin, chat, callbacks } = openHost(t);
    const message = chat.get(CHAT_MESSAGES[0].id);
    const line = showLine(plugin, message);
    const effects = spyMessageEffects(t, plugin);
    const openMenu = () => buildMenu(callbacks.get("message"), { target: message.content });
    const oldMenu = openMenu();
    plugin.translationLineTexts.set(line, "新的结果。");
    for (const id of MESSAGE_ITEMS.slice(1, 4)) await oldMenu[id]();
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);

    const secondMenu = openMenu();
    line.remove();
    showLine(plugin, message, "新的结果。");
    for (const id of MESSAGE_ITEMS.slice(1, 4)) await secondMenu[id]();
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);
    await openMenu()["dait-copy-translation"]();
    assert.deepEqual(effects.copied.mock.calls[0].arguments, ["新的结果。"]);
});

test("H06 scopes history to its channel and rechecks the history capability", async t => {
    const { plugin, chat, callbacks } = openHost(t);
    const message = chat.get(CHAT_MESSAGES[0].id);
    const effects = spyMessageEffects(t, plugin);
    const openMenu = () => buildMenu(callbacks.get("message"), { target: message.content });
    const history = openMenu()["dait-history-backfill"];

    plugin.settings.ui.historyBackfillEnabled = false;
    await history();
    plugin.settings.ui.historyBackfillEnabled = true;
    plugin.settings.ui.channelAutoTranslatePolicies[`${GUILD}:${CHANNEL}`] = { mode: "disabled" };
    await history();
    delete plugin.settings.ui.channelAutoTranslatePolicies[`${GUILD}:${CHANNEL}`];
    assert.equal(effects.history.mock.callCount(), 0);

    navigate(CHANNEL, CHAT_MESSAGES[0].id);
    await history();
    assert.equal(effects.history.mock.callCount(), 1);
    const beforeChannelChange = openMenu();
    navigate(OTHER_CHANNEL);
    await runMenu(beforeChannelChange);
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 1]);
});

test("H06 ignores old Composer menus and preserves current Composer actions", t => {
    const { plugin, document } = openHost(t);
    const composer = createComposer(plugin, document);
    const effects = spyComposerEffects(t, plugin);
    composer.setRestoreSession();
    const oldMenu = composer.openMenu();
    const clickAll = menu => COMPOSER_ITEMS.forEach(key => clickComposerItem(plugin, menu, key));

    plugin.stop();
    clickAll(oldMenu);
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);

    assert.equal(plugin.start(), true);
    const currentSession = composer.setRestoreSession();
    const replacedMenu = composer.openMenu();
    const currentMenu = composer.openMenu();
    clickAll(oldMenu);
    clickAll(replacedMenu);
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);
    assert.equal(plugin.inputActionMenu, currentMenu);
    assert.equal(currentMenu.isConnected, true);

    clickComposerItem(plugin, currentMenu, COMPOSER_ITEMS[0]);
    for (const key of COMPOSER_ITEMS.slice(1)) clickComposerItem(plugin, composer.openMenu(), key);
    assert.deepEqual(effectCounts(effects), [1, 1, 1, 1]);
    const { textbox, button } = composer;
    const composerKey = plugin.getTextboxComposerKey(textbox);
    assert.deepEqual(effects.restore.mock.calls[0].arguments, [textbox, currentSession, button]);
    assert.deepEqual(effects.polish.mock.calls[0].arguments, [button, { textbox, composerKey, fromMenu: true }]);
    assert.deepEqual(effects.bilingual.mock.calls[0].arguments, [button, { textbox, composerKey }]);
    assert.deepEqual(effects.settings.mock.calls[0].arguments, ["input-menu", button]);
});

test("H06 rechecks Composer action settings, configuration and restore session", t => {
    const { plugin, document } = openHost(t);
    const composer = createComposer(plugin, document);
    composer.group.appendChild(el("button", { class: "dait-polish-button" }));
    composer.group.appendChild(el("button", { class: "dait-public-bilingual-button" }));
    const effects = spyComposerEffects(t, plugin);
    const session = composer.setRestoreSession();
    const restoreMenu = composer.openMenu();
    plugin.polishSession = { ...session };
    clickComposerItem(plugin, restoreMenu, "restoreOriginal");

    for (const [key, settings, field, value] of [
        ["polishButton", plugin.settings.polish, "enabled", false],
        ["polishButton", plugin.settings.ui, "injectInputButton", false],
        ["polishButton", plugin.settings.polish, "afterAction", "confirmSend"],
        ["polishButton", plugin.settings.polish, "model", "synthetic-new-model"],
        ["publicBilingualButton", plugin.settings.translation, "enabled", false],
        ["publicBilingualButton", plugin.settings.ui, "publicBilingualInputButton", false],
        ["publicBilingualButton", plugin.settings.translation, "apiKey", "synthetic-new-key"]
    ]) {
        const menu = composer.openMenu();
        const previous = settings[field];
        settings[field] = value;
        clickComposerItem(plugin, menu, key);
        assert.equal(plugin.inputActionMenu, menu, field);
        assert.deepEqual(effectCounts(effects), [0, 0, 0, 0], field);
        settings[field] = previous;
    }
});

test("H06 rejects changed drafts, Composer identities and channels", t => {
    const { plugin, document } = openHost(t);
    const composer = createComposer(plugin, document);
    const { form, textbox } = composer;
    const effects = spyComposerEffects(t, plugin);
    const original = textbox.value;
    composer.setRestoreSession();
    const clickAll = menu => COMPOSER_ITEMS.forEach(key => clickComposerItem(plugin, menu, key));

    const editedMenu = composer.openMenu();
    textbox.value = "A new draft typed after opening the menu.";
    for (const key of COMPOSER_ITEMS.slice(0, 3)) clickComposerItem(plugin, editedMenu, key);
    textbox.value = original;

    const otherForm = document.body.appendChild(el("form"));
    const movedMenu = composer.openMenu();
    otherForm.appendChild(textbox);
    clickAll(movedMenu);
    form.appendChild(textbox);

    const channelMenu = composer.openMenu();
    navigate(OTHER_CHANNEL);
    clickAll(channelMenu);
    navigate(CHANNEL);

    const detachedMenu = composer.openMenu();
    textbox.remove();
    form.appendChild(el("textarea"));
    clickAll(detachedMenu);
    assert.deepEqual(effectCounts(effects), [0, 0, 0, 0]);
});
