"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

function useGlobals(t, values) {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
        globalThis[key] = value;
    }
    t.after(() => {
        for (const [key, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}

const tick = () => new Promise(resolve => setImmediate(resolve));

function quietPlugin() {
    const plugin = new Plugin();
    plugin.toasts = [];
    plugin.showToast = (text, type) => plugin.toasts.push({ text, type });
    plugin.saveSettings = () => true;
    plugin.saveData = () => true;
    plugin.invalidateAutoTranslationQueue = () => {};
    plugin.queueScan = () => {};
    return plugin;
}

// --- F3: "Ask before sending" sends through the composer, never through a composer button -------------

class FakeKeyboardEvent {
    constructor(type, init = {}) {
        Object.assign(this, { bubbles: false, cancelable: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }, init);
        this.type = type;
    }
}

// Enough of a selector engine for simple `tag[attr op 'value']` lists, so a guessed button selector finds
// the same button a browser would: the first match in document order.
function matchesSimpleSelector(element, selector) {
    const parsed = /^([a-z]*)((?:\[[^\]]+\])*)$/i.exec(selector.trim());
    if (!parsed) return false;
    if (parsed[1] && element.tagName !== parsed[1].toUpperCase()) return false;
    for (const [, name, op, quoted] of parsed[2].matchAll(/\[([\w-]+)(?:([*^$~]?=)['"]?([^'"\]]*)['"]?)?\]/g)) {
        const actual = element.attributes[name];
        if (actual === undefined) return false;
        if (!op) continue;
        if (op === "=" && actual !== quoted) return false;
        if (op === "*=" && !actual.includes(quoted)) return false;
        if (op === "^=" && !actual.startsWith(quoted)) return false;
        if (op === "$=" && !actual.endsWith(quoted)) return false;
        if (op === "~=" && !actual.split(/\s+/).includes(quoted)) return false;
    }
    return true;
}

function createComposerElement(tag, attributes = {}) {
    const element = {
        tagName: tag.toUpperCase(),
        attributes: { ...attributes },
        children: [],
        dataset: {},
        isConnected: true,
        parentElement: null,
        clicks: 0,
        events: [],
        disabled: false,
        appendChild(child) {
            this.children.push(child);
            child.parentElement = this;
            return child;
        },
        getAttribute(name) { return this.attributes[name] ?? null; },
        click() { this.clicks++; },
        dispatchEvent(event) { this.events.push(event); return true; },
        descendants() { return this.children.flatMap(child => [child, ...child.descendants()]); },
        querySelectorAll(selector) {
            const parts = selector.split(",");
            return this.descendants().filter(node => parts.some(part => matchesSimpleSelector(node, part)));
        },
        querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
        closest(selector) {
            for (let node = this; node; node = node.parentElement) {
                if (selector.split(",").some(part => matchesSimpleSelector(node, part))) return node;
            }
            return null;
        }
    };
    if (attributes.type) element.type = attributes.type;
    return element;
}

// Discord's composer: the toolbar (gift, GIF, stickers, emoji) sits in the same <form> as the editor, and
// on an English client the gift button is labelled "Send a gift". A submit-type button follows as well.
function createComposerWithGiftButton(t) {
    const doc = { activeElement: null, body: {}, documentElement: {}, querySelectorAll: () => [] };
    useGlobals(t, { document: doc, KeyboardEvent: FakeKeyboardEvent });
    const form = createComposerElement("form");
    const upload = form.appendChild(createComposerElement("button", { type: "button", "aria-label": "Upload a file" }));
    const textbox = form.appendChild(createComposerElement("div", { role: "textbox", contenteditable: "true" }));
    textbox.focus = () => { doc.activeElement = textbox; };
    const toolbar = form.appendChild(createComposerElement("div"));
    const buttons = [
        upload,
        toolbar.appendChild(createComposerElement("button", { type: "button", "aria-label": "Send a gift" })),
        toolbar.appendChild(createComposerElement("button", { type: "button", "aria-label": "Open GIF picker" })),
        toolbar.appendChild(createComposerElement("button", { type: "button", "aria-label": "Open sticker picker" })),
        toolbar.appendChild(createComposerElement("button", { type: "button", "aria-label": "Select emoji" })),
        toolbar.appendChild(createComposerElement("button", { type: "submit", "aria-label": "Apps" }))
    ];
    return { doc, form, buttons, textbox };
}

function assertSentWithEnter(textbox, doc) {
    const keydowns = textbox.events.filter(event => event.type === "keydown");
    assert.equal(keydowns.length, 1, "one Enter keydown on the composer");
    assert.equal(keydowns[0].key, "Enter");
    assert.equal(keydowns[0].shiftKey, false);
    assert.equal(keydowns[0].bubbles, true);
    assert.equal(doc.activeElement, textbox, "the composer has focus when Enter arrives");
}

test("submitTextbox sends with Enter on the focused composer and never clicks a composer button", t => {
    const { doc, buttons, textbox } = createComposerWithGiftButton(t);
    const plugin = quietPlugin();
    plugin.submitTextbox(textbox);
    assert.deepEqual(buttons.map(button => `${button.attributes["aria-label"]}:${button.clicks}`),
        buttons.map(button => `${button.attributes["aria-label"]}:0`));
    assertSentWithEnter(textbox, doc);
});

test("a confirmed Ask-before-sending sends the polished draft with Enter, not with the Send a gift button", async t => {
    const { doc, buttons, textbox } = createComposerWithGiftButton(t);
    const timers = [];
    useGlobals(t, { setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout: () => {} });
    const plugin = quietPlugin();
    plugin.settings.polish.afterAction = "confirmSend";
    textbox.text = "draft";
    plugin.getActiveTextbox = () => textbox;
    plugin.getElementText = box => box.text;
    plugin.runModelTask = async () => "polished draft";
    plugin.replaceTextboxTextSafelyAsync = async (box, text) => {
        box.text = text;
        return { ok: true };
    };
    plugin.showRestoreOriginalControl = () => {};
    plugin.setButtonBusy = () => {};
    const asked = [];
    plugin.confirmAction = async options => { asked.push(options); return true; };

    await plugin.polishCurrentDraft();
    assert.equal(asked.length, 1);
    assert.equal(asked[0].preview, "polished draft");
    assert.equal(timers.length, 1);
    timers[0]();
    assert.equal(buttons.reduce((sum, button) => sum + button.clicks, 0), 0, "no composer button was clicked");
    assertSentWithEnter(textbox, doc);
});

// --- F5: a confirmation always ends, also with BetterDiscord's fallback modal ---------------------------

// Elements with attributes, classes and a connected flag; the document finds them by [role='dialog'] or
// by one class name, like the lookups confirmAction makes.
function createDialogDocument() {
    const elements = [];
    const matches = (element, selector) => {
        if (selector === "[role='dialog']") return element.attributes.role === "dialog";
        if (/^\.[\w-]+$/.test(selector)) return element.classNames.has(selector.slice(1));
        return false;
    };
    const createElement = (className = "", attributes = {}) => {
        const element = {
            classNames: new Set(String(className).split(/\s+/).filter(Boolean)),
            attributes: { ...attributes },
            isConnected: true,
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name]; },
            removeAttribute(name) { delete this.attributes[name]; },
            closest() { return null; },
            remove() { this.isConnected = false; }
        };
        elements.push(element);
        return element;
    };
    return {
        elements,
        createElement,
        activeElement: null,
        body: {},
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
        querySelectorAll(selector) {
            const parts = String(selector).split(",").map(part => part.trim());
            return elements.filter(node => node.isConnected && parts.some(part => matches(node, part)));
        }
    };
}

function createConfirmHarness(t, showConfirmationModal) {
    const doc = createDialogDocument();
    const settingsRoot = doc.createElement("dait-quick-settings-modal-root");
    const intervals = [];
    const timeouts = [];
    const calls = [];
    useGlobals(t, {
        document: doc,
        window: { addEventListener() {}, removeEventListener() {} },
        BdApi: { UI: { showConfirmationModal: (title, content, options) => {
            calls.push({ title, content, options });
            return showConfirmationModal(doc, options);
        } } },
        setInterval: callback => { intervals.push(callback); return intervals.length; },
        clearInterval: id => { intervals[id - 1] = null; },
        setTimeout: callback => { timeouts.push(callback); return timeouts.length; },
        clearTimeout: id => { timeouts[id - 1] = null; }
    });
    const plugin = quietPlugin();
    const poll = (count = 1) => {
        for (let index = 0; index < count; index++) intervals.filter(Boolean).forEach(callback => callback());
    };
    const flushTimeouts = () => {
        while (timeouts.some(Boolean)) {
            const index = timeouts.findIndex(Boolean);
            const callback = timeouts[index];
            timeouts[index] = null;
            callback();
        }
    };
    return { doc, plugin, settingsRoot, calls, poll, flushTimeouts };
}

// BetterDiscord's Modals.default(): a .bd-modal-wrapper without role=dialog; a backdrop click only removes it.
function openFallbackModal(doc) {
    return doc.createElement("bd-modal-wrapper theme-dark");
}

test("a fallback modal dismissed by a backdrop click cancels and gives the settings window its keys back", async t => {
    let wrapper = null;
    const h = createConfirmHarness(t, doc => { wrapper = openFallbackModal(doc); return undefined; });
    let result = null;
    h.plugin.confirmAction({ title: "Clear the cache?" }).then(value => { result = value; });
    assert.equal(h.plugin.isConfirmDialogOpen(), true);
    assert.equal(h.settingsRoot.getAttribute("data-dait-confirm-open"), "true");
    h.poll(3);
    assert.equal(result, null, "still open");
    // Backdrop click: the wrapper gets .closing and is removed 300 ms later; no callback runs.
    wrapper.classNames.add("closing");
    h.poll();
    wrapper.remove();
    h.poll();
    await tick();
    assert.equal(result, false);
    assert.equal(h.plugin.isConfirmDialogOpen(), false);
    assert.equal(h.settingsRoot.getAttribute("data-dait-confirm-open"), undefined);
});

test("the fallback modal's own buttons still answer", async t => {
    const h = createConfirmHarness(t, doc => { openFallbackModal(doc); return undefined; });
    const pending = h.plugin.confirmAction({ title: "Reset?" });
    h.poll(2);
    h.calls[0].options.onConfirm();
    assert.equal(await pending, true);
    assert.equal(h.plugin.isConfirmDialogOpen(), false);
});

test("Confirm in the fallback modal counts after the first dialog closed because its content failed", async t => {
    let discordDialog = null;
    const h = createConfirmHarness(t, doc => {
        discordDialog = doc.createElement("bd-modal-root", { role: "dialog" });
        return "modal-1";
    });
    let result = null;
    h.plugin.confirmAction({ title: "Reset?" }).then(value => { result = value; });
    h.poll();
    // ErrorBoundary.onError: Discord's dialog closes (reporting onClose) and Modals.default() opens with the
    // same callbacks.
    discordDialog.remove();
    h.calls[0].options.onClose();
    openFallbackModal(h.doc);
    h.flushTimeouts();
    h.poll(2);
    await tick();
    assert.equal(result, null, "closing the failed dialog is not a cancel while the fallback is open");
    assert.equal(h.plugin.isConfirmDialogOpen(), true);
    h.calls[0].options.onConfirm();
    await tick();
    assert.equal(result, true);
});

test("a dialog that never shows up does not keep the settings window paused", async t => {
    const h = createConfirmHarness(t, () => "modal-1");
    let result = null;
    h.plugin.confirmAction({ title: "Clear?" }).then(value => { result = value; });
    h.poll(60);
    assert.equal(h.plugin.isConfirmDialogOpen(), false, "Escape and Tab work again");
    assert.equal(h.settingsRoot.getAttribute("data-dait-confirm-open"), undefined);
    // A late answer from the dialog still counts.
    h.calls[0].options.onConfirm();
    await tick();
    assert.equal(result, true);
});

test("stop() ends an open confirmation and clears the paused state", async t => {
    const h = createConfirmHarness(t, () => undefined);
    Object.assign(h.plugin, {
        loadSettings: () => true,
        loadDiagnosticLogs() {},
        loadTranslationCache() {},
        injectStyles() {},
        patchMessageContextMenu() {},
        startObserver() {},
        showSettingsUpgradeNotices() {}
    });
    h.plugin.start();
    const pending = h.plugin.confirmAction({ title: "Clear?" });
    assert.equal(h.plugin.isConfirmDialogOpen(), true);
    h.plugin.stop();
    assert.equal(await pending, false);
    assert.equal(h.plugin.isConfirmDialogOpen(), false);
    assert.equal(h.settingsRoot.getAttribute("data-dait-confirm-open"), undefined);
    h.plugin.start();
    assert.equal(h.plugin.isConfirmDialogOpen(), false);
    h.plugin.stop();
});

// --- F6: the prompt manager follows a prompt changed somewhere else --------------------------------------

// Just enough DOM for the prompt manager: elements, class and [data-dait-path] lookups, attributes,
// listeners and select values.
function createSettingsDocument() {
    const elements = [];
    const matches = (element, selector) => {
        const path = /^\[data-dait-path(?:='([^']*)')?\]$/.exec(selector);
        if (path) return typeof element.dataset.daitPath === "string" && (path[1] === undefined || element.dataset.daitPath === path[1]);
        if (selector.startsWith(".")) return String(element.className || "").split(/\s+/).includes(selector.slice(1));
        return false;
    };
    const descendants = (root, output = []) => {
        for (const child of root.children) {
            output.push(child);
            descendants(child, output);
        }
        return output;
    };
    const createElement = tag => {
        const element = {
            tagName: String(tag).toUpperCase(),
            children: [],
            dataset: {},
            attributes: {},
            listeners: {},
            style: {},
            className: "",
            isConnected: true,
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            appendChild(child) {
                this.children.push(child);
                child.parentNode = this;
                child.parentElement = this;
                return child;
            },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name]; },
            removeAttribute(name) { delete this.attributes[name]; },
            addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
            removeEventListener() {},
            dispatch(type, extra = {}) {
                return Promise.all((this.listeners[type] || []).map(handler => handler({ type, target: this, preventDefault() {}, stopPropagation() {}, ...extra })));
            },
            querySelectorAll(selector) { return descendants(this).filter(node => matches(node, selector)); },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
            closest() { return null; },
            focus() { doc.activeElement = this; }
        };
        let text = "";
        Object.defineProperty(element, "textContent", {
            get() { return element.children.length ? element.children.map(child => child.textContent).join("") : text; },
            set(next) {
                element.children = [];
                text = String(next ?? "");
            }
        });
        if (element.tagName === "SELECT") {
            Object.defineProperty(element, "value", {
                get() { return (element.children.find(option => option.selected) || element.children[0])?.value ?? ""; },
                set(next) { element.children.forEach(option => { option.selected = String(option.value) === String(next); }); }
            });
        }
        elements.push(element);
        return element;
    };
    const doc = {
        elements,
        activeElement: null,
        body: null,
        createElement,
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
        querySelectorAll(selector) { return elements.filter(node => matches(node, selector)); }
    };
    return doc;
}

function createPromptManagerUi(t) {
    const doc = createSettingsDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    plugin.preserveSettingsScroll = (_anchor, action) => action();
    plugin.settings.translation.promptTemplates = [
        { id: "tpl-a", serial: "001", name: "Natural", prompt: "prompt A" },
        { id: "tpl-b", serial: "002", name: "Literal", prompt: "prompt B" }
    ];
    plugin.settings.translation.activePromptTemplate = "tpl-a";
    plugin.settings.translation.prompt = "prompt A";
    const manager = plugin.createPromptManager("translation");
    const all = manager.querySelectorAll.bind(manager);
    return {
        plugin,
        textarea: all("[data-dait-path='translation.prompt']")[0],
        status: all(".dait-prompt-status")[0],
        previewLabel: all(".dait-prompt-preview-label")[0],
        update: all(".dait-small-button").find(button => button.dataset.daitAction === "promptUpdate")
    };
}

test("the prompt status and Update follow a prompt edited in another settings panel", t => {
    const ui = createPromptManagerUi(t);
    assert.equal(ui.status.textContent, ui.plugin.t("promptUsingTemplate", { code: "001", name: "Natural" }));
    assert.equal(ui.update.disabled, true);
    // The same prompt saved from the other panel (BetterDiscord's plugin settings or the settings window).
    ui.plugin.setSetting("translation.prompt", "prompt A, tuned elsewhere");
    assert.equal(ui.textarea.value, "prompt A, tuned elsewhere");
    assert.equal(ui.status.textContent, ui.plugin.t("promptTemplateEdited", { code: "001", name: "Natural" }));
    assert.equal(ui.update.disabled, false, "the tuned prompt can be stored in the template right away");
});

test("the prompt status and preview label follow a template applied in another settings panel", t => {
    const ui = createPromptManagerUi(t);
    assert.equal(ui.previewLabel.textContent, `${ui.plugin.t("promptPreview")} · ${ui.plugin.t("promptPreviewActive")}`);
    ui.plugin.applyPromptTemplate("translation", "tpl-b");
    assert.equal(ui.textarea.value, "prompt B");
    assert.equal(ui.status.textContent, ui.plugin.t("promptUsingTemplate", { code: "002", name: "Literal" }));
    assert.equal(ui.update.disabled, true);
    // The previewed template (001) is no longer the one in use.
    assert.equal(ui.previewLabel.textContent, ui.plugin.t("promptPreview"));
});

// --- F7: the hotkey description names the control the row really has -------------------------------------

test("the hotkey row's recorder is the control its description names", t => {
    useGlobals(t, { document: createSettingsDocument() });
    const plugin = quietPlugin();
    for (const language of ["zh-CN", "en"]) {
        plugin.settings.ui.language = language;
        const row = plugin.createHotkeyRow();
        const buttons = row.querySelectorAll(".dait-small-button");
        const recorder = buttons.find(button => button.textContent === plugin.getHotkeyLabel());
        assert.ok(recorder, "the recorder shows the current shortcut");
        // Its tooltip says what clicking it does.
        assert.equal(recorder.title, plugin.t("hotkeyRecord"), language);
        // A label the description quotes is the text or tooltip of a button in the row.
        const names = buttons.flatMap(button => [button.textContent, button.title]).filter(Boolean);
        const description = plugin.t("polishHotkeyDesc");
        for (const [, quoted] of description.matchAll(/[“"]([^”"]+)[”"]/g)) {
            assert.ok(names.includes(quoted), `${language}: "${quoted}" is not a control in the row`);
        }
        // No button reads "Record" / 录制快捷键: the recorder shows the shortcut itself.
        assert.doesNotMatch(description, /\bClick Record\b|点“录制快捷键”/, language);
    }
});

test("while a confirmation is open the settings window sits below BetterDiscord's fallback modal", () => {
    const css = require("../../src/css/08-dialogs.js");
    const rule = /\.dait-quick-settings-modal-root\[data-dait-confirm-open="true"\]\s*\{([^}]*)\}/.exec(css);
    assert.ok(rule, "the confirm-open rule exists");
    const zIndex = Number(/z-index:\s*(\d+)/.exec(rule[1])?.[1]);
    // .bd-modal-wrapper uses z-index 1000 and comes earlier in the document than the settings window.
    assert.ok(zIndex < 1000, `z-index ${zIndex}`);
});
