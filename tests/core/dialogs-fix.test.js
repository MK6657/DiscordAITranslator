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
