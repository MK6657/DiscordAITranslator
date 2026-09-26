"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { ComposerWriter } = require("../../src/composer/composer-writer");

// ---------------------------------------------------------------------------------------------
// A small fake DOM: enough of Node/Element for the composer reader, selection and event paths.
// cloneNode() returns a detached copy whose innerText equals textContent, like a real detached
// node (no rendered layout, so no block line breaks).
// ---------------------------------------------------------------------------------------------

class FakeText {
    constructor(value) {
        this.nodeType = 3;
        this.nodeValue = String(value);
        this.parentNode = null;
    }
    get parentElement() { return this.parentNode; }
    get textContent() { return this.nodeValue; }
    get isConnected() { return Boolean(this.parentNode?.isConnected); }
    cloneNode() { return new FakeText(this.nodeValue); }
}

function parseCompound(selector) {
    const match = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/.exec(selector.trim());
    if (!match) return null;
    const checks = [];
    if (match[1]) checks.push(element => element.tagName === match[1].toUpperCase());
    const tokenPattern = /\.([\w-]+)|\[([\w-]+)(?:([*^$]?=)(['"]?)(.*?)\4)?\]/g;
    let token;
    while ((token = tokenPattern.exec(match[2] || ""))) {
        const [, className, attribute, operator, , expected] = token;
        if (className) {
            checks.push(element => element.className.split(/\s+/).includes(className));
            continue;
        }
        checks.push(element => {
            const value = element.getAttribute(attribute);
            if (value === null) return false;
            if (!operator) return true;
            if (operator === "=") return value === expected;
            if (operator === "*=") return value.includes(expected);
            if (operator === "^=") return value.startsWith(expected);
            return value.endsWith(expected);
        });
    }
    return element => checks.every(check => check(element));
}

function matchesSelector(element, selector) {
    return String(selector).split(",").some(part => {
        const compounds = part.trim().split(/\s+/).map(parseCompound);
        if (!compounds.length || compounds.some(compound => !compound)) return false;
        if (!compounds[compounds.length - 1](element)) return false;
        let index = compounds.length - 2;
        for (let node = element.parentNode; node && index >= 0; node = node.parentNode) {
            if (node.nodeType === 1 && compounds[index](node)) index--;
        }
        return index < 0;
    });
}

class FakeElement {
    constructor(tag, attributes = {}, children = []) {
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this.attributes = new Map(Object.entries(attributes).map(([key, value]) => [key, String(value)]));
        this.childNodes = [];
        this.parentNode = null;
        this.dataset = {};
        this.listeners = new Map();
        this.isDocumentRoot = false;
        this.disabled = false;
        children.forEach(child => this.appendChild(typeof child === "string" ? new FakeText(child) : child));
    }
    get parentElement() { return this.parentNode; }
    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node.isDocumentRoot === true;
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get className() { return this.getAttribute("class") || ""; }
    set className(value) { this.setAttribute("class", value); }
    get id() { return this.getAttribute("id") || ""; }
    get textContent() { return this.childNodes.map(node => node.textContent).join(""); }
    set textContent(value) {
        this.childNodes.forEach(node => { node.parentNode = null; });
        this.childNodes = [];
        if (value) this.appendChild(new FakeText(value));
    }
    get classList() {
        const element = this;
        const read = () => element.className.split(/\s+/).filter(Boolean);
        return {
            contains: name => read().includes(name),
            add: (...names) => { element.className = [...new Set([...read(), ...names])].join(" "); },
            remove: (...names) => { element.className = read().filter(name => !names.includes(name)).join(" "); },
            toggle: (name, force) => {
                const on = force === undefined ? !read().includes(name) : Boolean(force);
                if (on) element.classList.add(name);
                else element.classList.remove(name);
                return on;
            }
        };
    }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    hasAttribute(name) { return this.attributes.has(name); }
    appendChild(child) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    insertBefore(child, reference) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        const index = this.childNodes.indexOf(reference);
        if (index >= 0) this.childNodes.splice(index, 0, child);
        else this.childNodes.push(child);
        return child;
    }
    removeChild(child) {
        const index = this.childNodes.indexOf(child);
        if (index >= 0) this.childNodes.splice(index, 1);
        child.parentNode = null;
        return child;
    }
    remove() { this.parentNode?.removeChild(this); }
    replaceChildren(...nodes) {
        this.childNodes.forEach(node => { node.parentNode = null; });
        this.childNodes = [];
        nodes.forEach(node => this.appendChild(node));
    }
    contains(node) {
        for (let current = node; current; current = current.parentNode) {
            if (current === this) return true;
        }
        return false;
    }
    matches(selector) { return matchesSelector(this, selector); }
    closest(selector) {
        for (let node = this; node && node.nodeType === 1; node = node.parentNode) {
            if (node.matches(selector)) return node;
        }
        return null;
    }
    querySelectorAll(selector) {
        const found = [];
        const walk = node => node.children.forEach(child => {
            if (child.matches(selector)) found.push(child);
            walk(child);
        });
        walk(this);
        return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    cloneNode(deep) {
        const clone = new FakeElement(this.tagName, Object.fromEntries(this.attributes));
        if (deep) this.childNodes.forEach(node => clone.appendChild(node.cloneNode(true)));
        Object.defineProperty(clone, "innerText", { get() { return this.textContent; } });
        return clone;
    }
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 40, width: 800, height: 40 }; }
    focus() { if (globalThis.document) globalThis.document.activeElement = this; }
    blur() {}
    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(handler);
    }
    removeEventListener(type, handler) {
        this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== handler));
    }
    dispatchEvent(event) {
        (this.listeners.get(event.type) || []).slice().forEach(handler => handler.call(this, event));
        return !event.defaultPrevented;
    }
}

const h = (tag, attributes, ...children) => new FakeElement(tag, attributes || {}, children);

// Discord's Slate markup for one line of plain text, or an empty line.
function slateLine(...inline) {
    if (!inline.length) {
        return h("div", { "data-slate-node": "element" },
            h("span", { "data-slate-node": "text" },
                h("span", { "data-slate-leaf": "true" },
                    h("span", { "data-slate-zero-width": "n", "data-slate-length": "0" }, "\uFEFF", h("br")))));
    }
    return h("div", { "data-slate-node": "element" }, ...inline.map(part => typeof part === "string" ? slateText(part) : part));
}

function slateText(text) {
    return h("span", { "data-slate-node": "text" },
        h("span", { "data-slate-leaf": "true" },
            h("span", { "data-slate-string": "true" }, text)));
}

function slateVoid(content, slateElement = null) {
    const node = h("span", { "data-slate-node": "element", "data-slate-inline": "true", "data-slate-void": "true", contenteditable: "false" },
        content,
        h("span", { "data-slate-spacer": "true" },
            h("span", { "data-slate-node": "text" },
                h("span", { "data-slate-leaf": "true" },
                    h("span", { "data-slate-zero-width": "z", "data-slate-length": "0" }, "\uFEFF")))));
    // What React leaves on the node: a fiber whose parent component received the Slate element.
    if (slateElement) node["__reactFiber$test"] = { memoizedProps: {}, return: { memoizedProps: { element: slateElement } } };
    return node;
}

function renderSlateLines(editor, text) {
    editor.replaceChildren(...String(text).split("\n").map(line => line ? slateLine(line) : slateLine()));
}

function createSlateEditor(lines, options = {}) {
    const editor = h("div", { role: "textbox", "data-slate-editor": "true", "data-slate-node": "value", contenteditable: "true" });
    lines.forEach(line => editor.appendChild(line instanceof FakeElement ? line : (line ? slateLine(line) : slateLine())));
    const form = h("form", {}, h("div", { class: "channelTextArea_test" }, editor));
    if (options.connected !== false) {
        const root = h("html");
        root.isDocumentRoot = true;
        root.appendChild(form);
    }
    return editor;
}

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

class FakeDataTransfer {
    constructor() { this.data = {}; }
    setData(type, value) { this.data[type] = value; }
    getData(type) { return this.data[type] || ""; }
}

class FakeClipboardEvent extends Event {
    constructor(type, init = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData;
    }
}

class FakeInputEvent extends Event {
    constructor(type, init = {}) {
        super(type, init);
        this.inputType = init.inputType;
        this.data = init.data;
    }
}

class FakeKeyboardEvent extends Event {
    constructor(type, init = {}) {
        super(type, init);
        Object.assign(this, { key: init.key, code: init.code, ctrlKey: Boolean(init.ctrlKey), shiftKey: Boolean(init.shiftKey), altKey: Boolean(init.altKey), metaKey: Boolean(init.metaKey) });
    }
}

// Browser globals for the write path. Timers run on the next macrotask, so the settle waits are fast.
function useComposerBrowser(t, extras = {}) {
    const selection = {
        anchorNode: null,
        focusNode: null,
        removeAllRanges() { this.anchorNode = null; this.focusNode = null; },
        addRange(range) { this.anchorNode = range.node; this.focusNode = range.node; }
    };
    const fakeDocument = {
        activeElement: null,
        body: h("body"),
        createRange: () => ({ selectNodeContents(node) { this.node = node; }, setStart(node) { this.node = node; }, setEnd() {}, collapse() {} }),
        createElement: tag => new FakeElement(tag),
        createTextNode: value => new FakeText(value),
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
        querySelector: () => null,
        querySelectorAll: () => [],
        execCommand: () => false,
        ...extras.document
    };
    const fakeWindow = {
        getSelection: () => selection,
        setTimeout: callback => setImmediate(callback),
        clearTimeout() {},
        requestAnimationFrame: callback => setImmediate(callback),
        addEventListener() {},
        removeEventListener() {},
        DataTransfer: FakeDataTransfer,
        ClipboardEvent: FakeClipboardEvent,
        InputEvent: FakeInputEvent,
        innerWidth: 1200,
        innerHeight: 800,
        ...extras.window
    };
    useGlobals(t, { window: fakeWindow, document: fakeDocument, KeyboardEvent: FakeKeyboardEvent });
    return { window: fakeWindow, document: fakeDocument, selection };
}

// ---------------------------------------------------------------------------------------------
// composer-1: the reader keeps Slate line breaks
// ---------------------------------------------------------------------------------------------

test("composer reader joins Slate lines with \\n and drops zero-width placeholders", t => {
    useComposerBrowser(t);
    const plugin = new Plugin();
    const placeholder = h("span", { "data-slate-placeholder": "true", contenteditable: "false" }, "Message #general");
    const firstLine = slateLine("Hello there");
    firstLine.childNodes[0].childNodes[0].appendChild(placeholder);
    const editor = createSlateEditor([firstLine, "", "||你好||"]);

    // The fixture behaves like the browser: a detached clone has no line breaks and keeps U+FEFF.
    assert.equal(editor.cloneNode(true).innerText, "Hello thereMessage #general\uFEFF||你好||");

    assert.equal(plugin.getTextboxRawTextSafe(editor), "Hello there\n\n||你好||");
    assert.equal(plugin.getTextboxDraftText(editor), "Hello there\n\n||你好||");
    assert.equal(plugin.isTextboxTextEqual(editor, "Hello there\n\n||你好||"), true);
    assert.equal(plugin.isCurrentDraftText(editor, "Hello there\n\n||你好||"), true);

    const twoLines = createSlateEditor(["第一行", "第二行"]);
    assert.equal(plugin.getTextboxDraftText(twoLines), "第一行\n第二行");
    const withSpaces = createSlateEditor(["ok  then "]);
    assert.equal(plugin.getTextboxDraftText(withSpaces), "ok  then ", "raw spacing is kept");
    assert.equal(plugin.getTextboxDraftText(createSlateEditor([""])), "");
});

test("composer reader maps mentions, emoji and quotes to what Discord would send", t => {
    useComposerBrowser(t);
    const plugin = new Plugin();
    const mention = slateVoid(h("span", { class: "mention wrapper", role: "button" }, "@Alice"), { type: "userMention", userId: "123456789012345678", children: [{ text: "" }] });
    const role = slateVoid(h("span", { class: "mention" }, "@Mods"), { type: "roleMention", roleId: "223456789012345678", children: [{ text: "" }] });
    const channel = slateVoid(h("span", { class: "mention" }, "#general"), { type: "channelMention", channelId: "323456789012345678", children: [{ text: "" }] });
    const custom = slateVoid(h("img", { class: "emoji", alt: ":blobwave:", "data-id": "112233445566778899", src: "https://cdn.example/emojis/112233445566778899.webp" }));
    const animated = slateVoid(h("img", { class: "emoji", alt: ":party:", src: "https://cdn.example/emojis/998877665544332211.gif?size=48" }));
    const unicode = slateVoid(h("img", { class: "emoji", alt: "😀", src: "/assets/emoji.svg" }));
    const plainMention = slateVoid(h("span", { class: "mention" }, "@Bob"));
    const editor = createSlateEditor([
        slateLine("hi ", mention, " and ", role, " in ", channel, "!"),
        slateLine(custom, " ", animated, " ", unicode, " ", plainMention)
    ]);
    assert.equal(plugin.getTextboxDraftText(editor), [
        "hi <@123456789012345678> and <@&223456789012345678> in <#323456789012345678>!",
        "<:blobwave:112233445566778899> <a:party:998877665544332211> 😀 @Bob"
    ].join("\n"));

    const quote = slateLine("quoted line");
    quote["__reactFiber$test"] = { memoizedProps: { element: { type: "blockQuote", children: [{ text: "quoted line" }] } } };
    assert.equal(plugin.getTextboxDraftText(createSlateEditor([quote, "reply"])), "> quoted line\nreply");
});

test("a plain contenteditable keeps block and <br> line breaks", t => {
    useComposerBrowser(t);
    const plugin = new Plugin();
    const editor = h("div", { role: "textbox", contenteditable: "true" },
        h("div", {}, "a"), h("div", {}, h("br")), h("div", {}, "b", h("br"), "c"));
    assert.equal(plugin.getTextboxRawTextSafe(editor), "a\n\nb\nc");
});

// CMP-R2: a zero-width space the user typed ("@​everyone" does not ping) is part of the draft.
test("the reader keeps the user's zero-width spaces through Polish, the bilingual spoiler and Restore original", async t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    const typed = "@​everyone meeting moved";
    const editor = createSlateEditor([typed]);
    browser.document.activeElement = editor;
    assert.equal(plugin.getTextboxDraftText(editor), typed);
    assert.equal(plugin.formatPublicBilingualMessage("Meeting moved", typed), `Meeting moved\n\n||${typed}||`);

    const pasted = [];
    attachSlateBehaviour(editor, { initialText: typed, afterPaste: text => pasted.push(text) });
    const requests = [];
    plugin.runModelTask = async (kind, input) => {
        requests.push(input);
        return "The meeting has moved.";
    };
    plugin.showRestoreOriginalControl = () => {};
    plugin.injectInputButtons = () => {};
    await plugin.polishCurrentDraft(null, { textbox: editor });
    assert.deepEqual(requests, [typed], "the model gets the draft as typed");
    assert.equal(plugin.getTextboxDraftText(editor), "The meeting has moved.");
    assert.equal(plugin.polishSession.originalRawText, typed);

    assert.equal(await plugin.restorePolishOriginal(editor, plugin.polishSession), true);
    assert.equal(pasted[pasted.length - 1], typed, "Restore original pastes exactly what was typed");
    assert.equal(plugin.getTextboxDraftText(editor), typed);
});

// A Slate editor whose paste handler behaves like Discord: the pasted text replaces the content
// and every line becomes its own block. `onUndo` models Ctrl+Z (Slate history).
function attachSlateBehaviour(editor, options = {}) {
    const history = [];
    const events = [];
    editor.addEventListener("paste", event => {
        events.push("paste");
        if (options.ignorePaste) return;
        history.push(editor.__text ?? options.initialText ?? "");
        const text = options.pasteResult ? options.pasteResult(event.clipboardData.getData("text/plain")) : event.clipboardData.getData("text/plain");
        editor.__text = text;
        renderSlateLines(editor, text);
        options.afterPaste?.(text);
        event.preventDefault();
    });
    editor.addEventListener("beforeinput", event => {
        events.push(`beforeinput:${event.inputType}`);
        event.preventDefault();
    });
    const undo = () => {
        events.push("undo");
        if (!history.length) return;
        const previous = history.pop();
        editor.__text = previous;
        renderSlateLines(editor, previous);
    };
    editor.addEventListener("keydown", event => {
        if (event.ctrlKey && String(event.key).toLowerCase() === "z") undo();
    });
    return { history, events, undo };
}

test("public bilingual writes a multi-line message into a Slate composer and verifies it", async t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    const editor = createSlateEditor(["你好", "第二行"]);
    attachSlateBehaviour(editor, { initialText: "你好\n第二行" });
    browser.document.activeElement = editor;
    const requests = [];
    plugin.runModelTask = async (kind, input) => {
        requests.push({ kind, input });
        return "Hello\nSecond line";
    };
    plugin.isInvalidAutoTranslationOutput = () => false;
    const toasts = [];
    plugin.showToast = (text, type) => toasts.push({ text, type });
    plugin.showPolishResultPanel = () => { throw new Error("a verified write must not open the fallback panel"); };

    const result = await plugin.publicBilingualCurrentDraft(null, { textbox: editor });
    assert.deepEqual(requests, [{ kind: "translation", input: "你好\n第二行" }], "the model gets the real line breaks");
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.wrote, true);
    assert.equal(plugin.getTextboxDraftText(editor), "Hello\nSecond line\n\n||你好\n第二行||");
    assert.equal(toasts.filter(toast => toast.type === "error").length, 0);
    assert.equal(plugin.polishSession.originalRawText, "你好\n第二行", "Restore original keeps the typed lines");
});

// ---------------------------------------------------------------------------------------------
// composer-3: rollback respects cancellation and never over-undoes
// ---------------------------------------------------------------------------------------------

test("a failed write is not rolled back over the user's new input", async t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    const editor = createSlateEditor(["draft"]);
    browser.document.activeElement = editor;
    const token = plugin.composerWriter.beginWrite(editor, "draft");
    const behaviour = attachSlateBehaviour(editor, {
        initialText: "draft",
        // Discord mangles the write, and the user starts typing right away.
        pasteResult: () => "draft typed by user",
        afterPaste: () => plugin.composerWriter.cancelWriteToken(token, "user-input")
    });
    const result = await plugin.replaceTextboxTextSafelyAsync(editor, "polished", { expectedPreviousText: "draft", writeToken: token });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "write-cancelled");
    assert.deepEqual(behaviour.events, ["paste"], "no undo, clear or re-insert after the user took over");
    assert.equal(plugin.getTextboxDraftText(editor), "draft typed by user");
});

test("an ignored paste on a draft with trailing spaces sends no undo", async t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    const editor = createSlateEditor(["好的 "]);
    browser.document.activeElement = editor;
    const behaviour = attachSlateBehaviour(editor, { initialText: "好的 ", ignorePaste: true });
    const token = plugin.composerWriter.beginWrite(editor, "好的 ");
    const result = await plugin.replaceTextboxTextSafelyAsync(editor, "Okay", { expectedPreviousText: "好的 ", writeToken: token });
    assert.equal(result.ok, false);
    assert.equal(behaviour.events.includes("undo"), false);
    assert.equal(behaviour.events.some(event => event.startsWith("beforeinput:history")), false);
    assert.equal(plugin.getTextboxDraftText(editor), "好的 ");
});

test("a result that only changes spacing is still written", async t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    const editor = createSlateEditor(["ok  then "]);
    browser.document.activeElement = editor;
    attachSlateBehaviour(editor, { initialText: "ok  then " });
    const token = plugin.composerWriter.beginWrite(editor, "ok  then ");
    const result = await plugin.replaceTextboxTextSafelyAsync(editor, "ok then", { expectedPreviousText: "ok  then ", writeToken: token });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(plugin.getTextboxDraftText(editor), "ok then");
});

test("a wrong write is undone by exactly one step, keeping the user's earlier typing", async t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    const editor = createSlateEditor(["好的 "]);
    browser.document.activeElement = editor;
    const behaviour = attachSlateBehaviour(editor, { initialText: "好的 ", pasteResult: () => "WRONG" });
    behaviour.history.push("好");
    // The browser's own undo command reaches the same history.
    browser.document.execCommand = command => {
        if (command !== "undo") return false;
        behaviour.undo();
        return true;
    };
    const token = plugin.composerWriter.beginWrite(editor, "好的 ");
    const result = await plugin.replaceTextboxTextSafelyAsync(editor, "Okay", { expectedPreviousText: "好的 ", writeToken: token });
    assert.equal(result.ok, false);
    assert.equal(behaviour.events.filter(event => event === "undo").length, 1);
    assert.deepEqual(behaviour.history, ["好"], "the user's earlier step is still in the undo history");
    assert.equal(plugin.getTextboxDraftText(editor), "好的 ");
});

// ---------------------------------------------------------------------------------------------
// composer-2 / composer-4: late results, focus, cancellation and feedback
// ---------------------------------------------------------------------------------------------

function createFlowTextbox(text, parent = null) {
    return { isConnected: true, text, parentElement: parent, contains: node => node === parent };
}

function createPolishFlow(t, options = {}) {
    const plugin = new Plugin();
    const textbox = options.textbox || createFlowTextbox("draft");
    const calls = { writes: [], panels: [], toasts: [], busy: [] };
    plugin.getActiveTextbox = () => textbox;
    plugin.getElementText = box => box.text;
    plugin.runModelTask = options.runModelTask || (async () => "polished draft");
    plugin.replaceTextboxTextSafelyAsync = async (box, text) => {
        calls.writes.push(text);
        box.text = text;
        return { ok: true };
    };
    plugin.showPolishResultPanel = (_box, text) => calls.panels.push(text);
    plugin.showRestoreOriginalControl = () => {};
    plugin.showToast = (text, type) => calls.toasts.push({ text, type });
    return { plugin, textbox, calls };
}

test("a late polish result is held while the user types in another field", async t => {
    const otherInput = { tagName: "INPUT", type: "text", getAttribute: () => null };
    useGlobals(t, { document: { activeElement: otherInput, body: {}, documentElement: {} } });
    const { plugin, textbox, calls } = createPolishFlow(t);
    await plugin.polishCurrentDraft();
    assert.deepEqual(calls.writes, [], "focus is not taken from the other field");
    assert.deepEqual(calls.panels, ["polished draft"]);
    assert.deepEqual(calls.toasts, [{ text: plugin.t("composerResultHeld"), type: "info" }]);
    assert.equal(textbox.text, "draft");

    // Focus in the target composer (or nowhere editable) lets the write happen.
    globalThis.document.activeElement = textbox;
    await plugin.polishCurrentDraft();
    assert.deepEqual(calls.writes, ["polished draft"]);
    globalThis.document.activeElement = { tagName: "BUTTON", getAttribute: () => null };
    textbox.text = "second draft";
    await plugin.polishCurrentDraft();
    assert.equal(calls.writes.length, 2);
});

test("only content-changing events cancel a composer write", () => {
    const listeners = new Map();
    const textbox = {
        isConnected: true,
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); }
    };
    const writer = new ComposerWriter({ getTextboxComposerKey: () => "composer", normalizeDraftRawText: String });
    const token = writer.beginWrite(textbox, "draft");
    assert.equal(listeners.has("keydown"), false, "arrow keys, Shift and Ctrl+C do not drop the result");
    for (const type of ["beforeinput", "input", "paste", "cut", "drop", "compositionstart"]) assert.equal(listeners.has(type), true, type);
    listeners.get("cut")({ isTrusted: true });
    assert.equal(token.cancelled, true);
    assert.equal(token.reason, "user-input");
});

test("a result dropped by user input or a remount is offered in the panel; a newer run stays silent", async t => {
    const typed = createPolishFlow(t, {
        runModelTask: async () => {
            typed.plugin.composerWriter.cancelWriteToken(typed.plugin.composerWriter.activeWriteTokens.values().next().value, "user-input");
            return "polished draft";
        }
    });
    await typed.plugin.polishCurrentDraft();
    assert.deepEqual(typed.calls.writes, []);
    assert.deepEqual(typed.calls.panels, ["polished draft"]);
    assert.equal(typed.calls.toasts[0].text, typed.plugin.t("composerResultHeld"));

    const remount = createPolishFlow(t, {
        runModelTask: async () => {
            remount.textbox.isConnected = false;
            return "polished draft";
        }
    });
    await remount.plugin.polishCurrentDraft();
    assert.deepEqual(remount.calls.panels, ["polished draft"]);

    const superseded = createPolishFlow(t, {
        runModelTask: async () => {
            const token = superseded.plugin.composerWriter.activeWriteTokens.values().next().value;
            superseded.plugin.composerWriter.cancelWriteToken(token, "superseded");
            return "old result";
        }
    });
    await superseded.plugin.polishCurrentDraft();
    assert.deepEqual(superseded.calls.panels, []);
    assert.deepEqual(superseded.calls.toasts, []);
});

test("the polish hotkey shows progress on the composer's Polish button, or a toast", t => {
    useComposerBrowser(t);
    const plugin = new Plugin();
    plugin.isStarted = true;
    const editor = createSlateEditor(["draft"]);
    globalThis.document.activeElement = editor;
    const group = h("span", { class: "dait-input-action-group" });
    const button = plugin.createInputActionButton("dait-polish-button", "润色", "title", () => {}, { shortText: "润", textbox: editor });
    group.appendChild(button);
    // Discord's toolbar sits inside the same channel text area as the editor.
    editor.closest("form, [class*='channelTextArea']").appendChild(group);
    const runs = [];
    plugin.polishCurrentDraft = (runButton, options) => runs.push({ runButton, options });
    let prevented = false;
    const event = { key: "p", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, target: editor, preventDefault() { prevented = true; }, stopPropagation() {} };
    plugin.handleKeydown(event);
    assert.equal(prevented, true);
    assert.equal(runs[0].runButton, button);
    assert.equal(runs[0].options.textbox, editor);
    assert.equal(runs[0].options.fromHotkey, true);
    assert.equal(plugin.isInputActionButtonShown(button), true);
    group.dataset.daitDensity = "minimal";
    assert.equal(plugin.isInputActionButtonShown(button), false, "minimal density hides it behind the AI menu, so a toast is used");

    // Without a visible button the run itself announces progress.
    const bare = createPolishFlow(t);
    const toasts = bare.calls.toasts;
    let release;
    bare.plugin.runModelTask = () => new Promise(resolve => { release = resolve; });
    const pending = bare.plugin.polishCurrentDraft(null, { fromHotkey: true });
    assert.deepEqual(toasts, [{ text: bare.plugin.t("polishRunning"), type: "info" }]);
    release("done");
    return pending;
});

// ---------------------------------------------------------------------------------------------
// composer-6: public bilingual escaping
// ---------------------------------------------------------------------------------------------

test("public bilingual escaping leaves code alone and keeps the spoiler closed", () => {
    const plugin = new Plugin();
    assert.equal(plugin.formatPublicBilingualMessage("hello", "a || b"), "hello\n\n||a \\|\\| b||");
    assert.equal(plugin.formatPublicBilingualMessage("run it", "run `ps aux | grep node`"), "run it\n\n||run `ps aux | grep node`||");
    assert.equal(plugin.formatPublicBilingualMessage("use `a || b`", "x"), "use `a || b`\n\n||x||");
    assert.equal(plugin.formatPublicBilingualMessage("t", "`a || b`"), "t\n\n||`a |\u200b| b`||", "|| inside code cannot close the spoiler");
    assert.equal(plugin.formatPublicBilingualMessage("t", "```\nx || y\n```"), "t\n\n||```\nx |\u200b| y\n```||");
    assert.equal(plugin.formatPublicBilingualMessage("path", "path is C:\\temp\\"), "path\n\n||path is C:\\temp\\\\||", "a trailing backslash cannot escape the closing marker");
    assert.equal(plugin.formatPublicBilingualMessage("t", "a \\| b"), "t\n\n||a \\| b||", "the user's own escape is kept, not doubled");
    assert.equal(plugin.formatPublicBilingualMessage("t", "\\`not code | x\\`"), "t\n\n||\\`not code \\| x\\`||");
    assert.equal(plugin.getPublicBilingualReservedLength("a|"), "\n\n||a\\|||".length);
});

// ---------------------------------------------------------------------------------------------
// composer-7: re-running public bilingual
// ---------------------------------------------------------------------------------------------

test("running public bilingual again re-translates the source instead of nesting, and skips the cache", async t => {
    const { plugin, textbox, calls } = createPolishFlow(t, { textbox: createFlowTextbox("你好") });
    plugin.isInvalidAutoTranslationOutput = () => false;
    const requests = [];
    let answer = 0;
    plugin.runModelTask = async (kind, input) => {
        requests.push({ kind, input });
        answer++;
        return `hello ${answer}`;
    };
    await plugin.publicBilingualCurrentDraft();
    assert.equal(textbox.text, "hello 1\n\n||你好||");
    await plugin.publicBilingualCurrentDraft();
    assert.deepEqual(requests.map(request => request.input), ["你好", "你好"], "the second run translates the original draft");
    assert.equal(textbox.text, "hello 2\n\n||你好||", "no nested bilingual text");
    assert.deepEqual(calls.writes, ["hello 1\n\n||你好||", "hello 2\n\n||你好||"]);

    const cacheKey = plugin.getTranslationCacheKey("你好", plugin.getPublicBilingualTranslationOptions());
    assert.equal(plugin.isVolatileTranslationCacheKey(cacheKey), true);
    const persisted = plugin.createPersistedTranslationCachePayload();
    assert.equal(persisted.entries.length, 0, "unsent draft translations stay in memory only");
});

// CMP-R1: the result panel's "Insert into input" counts as a write for the polish session.
function useRealResultPanel(plugin) {
    delete plugin.showPolishResultPanel;
    const applyPanelText = plugin.applyPolishResultPanelText.bind(plugin);
    let pending = null;
    plugin.applyPolishResultPanelText = (...args) => (pending = applyPanelText(...args));
    return async () => {
        const apply = globalThis.document.body.querySelector(".dait-polish-result-apply");
        assert.ok(apply, "the result panel offers Insert into input");
        apply.dispatchEvent({ type: "click", preventDefault() {}, stopPropagation() {} });
        return pending;
    };
}

function createBilingualPanelFlow(t, options = {}) {
    const browser = useComposerBrowser(t);
    const flow = createPolishFlow(t, { textbox: createFlowTextbox("你好") });
    const clickInsert = useRealResultPanel(flow.plugin);
    flow.plugin.isInvalidAutoTranslationOutput = () => false;
    const requests = [];
    let answer = 0;
    flow.plugin.runModelTask = async (kind, input) => {
        requests.push(input);
        answer++;
        return `hello ${answer}`;
    };
    if (options.failFirstWrite) {
        const write = flow.plugin.replaceTextboxTextSafelyAsync;
        let writes = 0;
        flow.plugin.replaceTextboxTextSafelyAsync = async (box, text, writeOptions) => {
            if (++writes === 1) return { ok: false, reason: "verification-failed" };
            return write(box, text, writeOptions);
        };
    }
    return { ...flow, browser, clickInsert, requests };
}

for (const variant of ["held because focus moved", "after a failed write"]) {
    test(`Insert into input on a bilingual result ${variant}: running bilingual again does not nest, and Restore is offered`, async t => {
        const { plugin, textbox, browser, clickInsert, requests } = createBilingualPanelFlow(t, { failFirstWrite: variant !== "held because focus moved" });
        if (variant === "held because focus moved") browser.document.activeElement = h("input", { type: "text" });
        const first = await plugin.publicBilingualCurrentDraft();
        assert.equal(first.ok, false);
        assert.equal(textbox.text, "你好", "nothing was written by the run itself");

        browser.document.activeElement = null;
        assert.equal(await clickInsert(), true);
        assert.equal(textbox.text, "hello 1\n\n||你好||");
        assert.equal(plugin.canRestorePolishOriginal(textbox, plugin.polishSession), true, "Restore original is offered after Insert");

        const second = await plugin.publicBilingualCurrentDraft();
        assert.equal(second.ok, true);
        assert.deepEqual(requests, ["你好", "你好"], "the second run translates the original draft, not the bilingual text");
        assert.equal(textbox.text, "hello 2\n\n||你好||", "no nested bilingual text");
    });
}

test("Insert into input on a held polish result records the write and offers Restore original", async t => {
    const browser = useComposerBrowser(t);
    const { plugin, textbox } = createPolishFlow(t, { textbox: createFlowTextbox("original draft") });
    const clickInsert = useRealResultPanel(plugin);
    const restoreControls = [];
    plugin.showRestoreOriginalControl = (box, session) => restoreControls.push({ box, session });
    browser.document.activeElement = h("input", { type: "text" });
    await plugin.polishCurrentDraft();
    assert.equal(textbox.text, "original draft");
    assert.deepEqual(restoreControls, []);

    browser.document.activeElement = null;
    assert.equal(await clickInsert(), true);
    assert.equal(textbox.text, "polished draft");
    const session = plugin.polishSession;
    assert.equal(session.lastWrittenRawText, "polished draft");
    assert.deepEqual(restoreControls, [{ box: textbox, session }]);
    assert.equal(plugin.canRestorePolishOriginal(textbox, session), true);
});

// ---------------------------------------------------------------------------------------------
// composer-8: Restore original disappears after restoring
// ---------------------------------------------------------------------------------------------

test("after Restore original the restore action is gone and the original counts as unpolished", async t => {
    const { plugin, textbox } = createPolishFlow(t, { textbox: createFlowTextbox("original draft") });
    await plugin.polishCurrentDraft();
    const session = plugin.polishSession;
    assert.equal(plugin.canRestorePolishOriginal(textbox, session), true);
    plugin.injectInputButtons = () => {};
    assert.equal(await plugin.restorePolishOriginal(textbox, session), true);
    assert.equal(textbox.text, "original draft");
    assert.equal(plugin.canRestorePolishOriginal(textbox, session), false);
    assert.equal(plugin.isPolishSessionAlreadyPolished(session, "original draft"), false);
    assert.equal(plugin.getPolishSession(textbox, "original draft"), session, "polishing again continues the session");
});

// ---------------------------------------------------------------------------------------------
// composer-9: busy state keeps the density-aware label
// ---------------------------------------------------------------------------------------------

test("busy composer buttons keep their compact label and use aria-busy", t => {
    useComposerBrowser(t);
    const plugin = new Plugin();
    const group = h("span", { class: "dait-input-action-group" });
    group.dataset.daitDensity = "compact";
    const button = plugin.createInputActionButton("dait-polish-button", plugin.t("polishButton"), "title", () => {}, { shortText: plugin.t("polishButtonShort") });
    group.appendChild(button);
    plugin.syncInputActionButtonLabels(group, "compact");
    assert.equal(button.textContent, plugin.t("polishButtonShort"));
    plugin.setButtonBusy(button, true, plugin.t("publicBilingualBusy"));
    assert.equal(button.textContent, plugin.t("polishButtonShort"));
    assert.equal(button.getAttribute("aria-busy"), "true");
    assert.equal(button.disabled, true);
    plugin.setButtonBusy(button, false, plugin.t("publicBilingualButton"));
    assert.equal(button.textContent, plugin.t("polishButtonShort"));
    assert.equal(button.getAttribute("aria-busy"), null);
    assert.equal(button.disabled, false);

    // Other buttons (message translate, connection tests) keep the text form.
    const other = h("button");
    plugin.setButtonBusy(other, true, "Translating...");
    assert.equal(other.textContent, "Translating...");
});

// ---------------------------------------------------------------------------------------------
// Composer buttons follow polish.enabled / translation.enabled
// ---------------------------------------------------------------------------------------------

test("composer buttons and the polish hotkey follow the feature switches", t => {
    const browser = useComposerBrowser(t);
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => {};
    plugin.queueScan = () => {};
    plugin.settings.ui.publicBilingualInputButton = true;
    const editor = createSlateEditor(["draft"]);
    browser.document.activeElement = editor;
    const container = editor.closest("form");
    const groups = () => container.querySelectorAll(".dait-input-action-group");
    browser.document.querySelectorAll = selector => container.querySelectorAll(selector);
    plugin.getInputButtonContainer = () => container;
    plugin.syncInputActionButtonThemes = () => {};
    plugin.syncDiscordThemeClasses = () => "";
    const buttons = () => groups().flatMap(group => group.children.map(child => child.className.split(" ")[0]));

    plugin.injectInputButtons();
    assert.deepEqual(buttons().filter(name => name !== "dait-input-action-menu-button"), ["dait-polish-button", "dait-public-bilingual-button"]);

    plugin.setSetting("polish.enabled", false);
    assert.deepEqual(buttons().filter(name => name !== "dait-input-action-menu-button"), ["dait-public-bilingual-button"]);
    let prevented = false;
    plugin.polishCurrentDraft = () => { throw new Error("hotkey must be off while polish is disabled"); };
    plugin.handleKeydown({ key: "p", ctrlKey: true, altKey: true, target: editor, preventDefault() { prevented = true; }, stopPropagation() {} });
    assert.equal(prevented, false, "the key goes to Discord untouched");

    plugin.setSetting("translation.enabled", false);
    assert.deepEqual(buttons(), [], "an empty group is removed");

    plugin.setSetting("polish.enabled", true);
    plugin.setSetting("translation.enabled", true);
    assert.deepEqual(buttons().filter(name => name !== "dait-input-action-menu-button"), ["dait-polish-button", "dait-public-bilingual-button"]);
});

// ---------------------------------------------------------------------------------------------
// lifecycle-1: the hotkey recorder never outlives its panel
// ---------------------------------------------------------------------------------------------

function useRecorderDocument(t) {
    const listeners = new Map();
    const timers = [];
    useGlobals(t, {
        document: {
            addEventListener(type, handler) { listeners.set(type, handler); },
            removeEventListener(type, handler) { if (listeners.get(type) === handler) listeners.delete(type); },
            querySelectorAll: () => []
        },
        setTimeout: (callback, delay) => {
            timers.push({ callback, delay });
            return timers.length;
        },
        clearTimeout: id => { if (timers[id - 1]) timers[id - 1].callback = null; }
    });
    const runTimers = maxDelay => timers.forEach(timer => {
        if (!timer.callback || timer.delay > maxDelay) return;
        const callback = timer.callback;
        timer.callback = null;
        callback();
    });
    return { listeners, runTimers };
}

function createRecorder(t) {
    const env = useRecorderDocument(t);
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => {};
    plugin.queueScan = () => {};
    const toasts = [];
    plugin.showToast = (text, type) => toasts.push({ text, type });
    const panel = h("div", { class: "dait-settings" });
    const root = h("html");
    root.isDocumentRoot = true;
    root.appendChild(panel);
    const button = h("button");
    panel.appendChild(button);
    plugin.recordHotkey(button);
    env.runTimers(0);
    return { ...env, plugin, panel, button, toasts };
}

const keyEvent = (key, modifiers = {}) => {
    const event = { key, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...modifiers, prevented: false };
    event.preventDefault = () => { event.prevented = true; };
    event.stopPropagation = () => {};
    return event;
};

test("closing the quick-settings window or the settings panel stops hotkey recording", t => {
    const quick = createRecorder(t);
    assert.equal(quick.listeners.has("keydown"), true);
    const modalRoot = h("div", { class: "dait-quick-settings-modal-root" }, quick.panel);
    quick.plugin.commitSettingsControls = () => {};
    quick.plugin.flushSettings = () => {};
    quick.plugin.closeQuickSettingsPanel(modalRoot, "done");
    assert.equal(quick.listeners.has("keydown"), false);
    assert.equal(quick.button.dataset.recording, undefined);

    const panel = createRecorder(t);
    panel.plugin.destroySettingsModalSizing(panel.panel);
    assert.equal(panel.listeners.has("keydown"), false);
});

test("a recorder whose button is gone, clicked away from or timed out never swallows keys", t => {
    const detached = createRecorder(t);
    detached.panel.remove();
    const typed = keyEvent("H", { shiftKey: true });
    detached.listeners.get("keydown")(typed);
    assert.equal(typed.prevented, false);
    assert.equal(detached.listeners.has("keydown"), false);
    assert.equal(detached.plugin.settings.ui.polishHotkey, "Ctrl+Alt+P");

    const clickedAway = createRecorder(t);
    clickedAway.listeners.get("pointerdown")({ target: h("button") });
    assert.equal(clickedAway.listeners.has("keydown"), false);

    const timedOut = createRecorder(t);
    timedOut.runTimers(Infinity);
    assert.equal(timedOut.listeners.has("keydown"), false);
    assert.equal(timedOut.button.dataset.recording, undefined);
});

test("the recorder rejects Shift+letter and editing shortcuts, and accepts a real hotkey", t => {
    const recorder = createRecorder(t);
    recorder.listeners.get("keydown")(keyEvent("H", { shiftKey: true }));
    assert.equal(recorder.plugin.settings.ui.polishHotkey, "Ctrl+Alt+P");
    assert.equal(recorder.toasts[0].type, "error");
    assert.equal(recorder.listeners.has("keydown"), false);

    assert.equal(recorder.plugin.isAllowedPolishHotkey("Ctrl+V"), false);
    assert.equal(recorder.plugin.isAllowedPolishHotkey("Ctrl+Shift+Z"), false);
    assert.equal(recorder.plugin.isAllowedPolishHotkey("Shift+F5"), true);
    assert.equal(recorder.plugin.isAllowedPolishHotkey("Ctrl+Alt+P"), true);

    const saved = createRecorder(t);
    saved.listeners.get("keydown")(keyEvent("k", { ctrlKey: true, shiftKey: true }));
    assert.equal(saved.plugin.settings.ui.polishHotkey, "Ctrl+Shift+K");
    assert.equal(saved.listeners.has("keydown"), false);
});

test("a Shift+letter hotkey saved by an older version no longer hijacks typing", t => {
    useComposerBrowser(t);
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.polishHotkey = "Shift+H";
    const editor = createSlateEditor(["draft"]);
    globalThis.document.activeElement = editor;
    plugin.polishCurrentDraft = () => { throw new Error("typing a capital H must not polish"); };
    const event = keyEvent("H", { shiftKey: true, target: editor });
    plugin.handleKeydown(event);
    assert.equal(event.prevented, false);
});
