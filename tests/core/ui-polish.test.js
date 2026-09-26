"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");
const { I18N } = require("../../src/i18n");

// v0.4.0 final-review UI polish: BetterDiscord's modal in a narrow Discord window, the settings window's keyboard
// handling, the data tab's action rows, wording, the polish result panel, the translation line toolbar (built on
// first use), and timers and listeners that outlived their panel or line.

// ---------------------------------------------------------------------------------------------
// A small fake DOM: elements with classes, attributes, data-* (through dataset), events, hidden, focus,
// closest/querySelectorAll for compound and descendant selectors, select values and settable layout boxes.
// The document and window keep every listener with its capture flag and run them in the order they were added.
// ---------------------------------------------------------------------------------------------

const dataKey = attribute => attribute.slice(5).replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

class FakeText {
    constructor(value) {
        this.nodeType = 3;
        this.nodeValue = String(value);
        this.parentNode = null;
    }
    get textContent() { return this.nodeValue; }
    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node.isDocumentRoot === true;
    }
    remove() { this.parentNode?.removeChild(this); }
}

function parseCompound(selector) {
    const match = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\]|:scope)*)$/.exec(selector.trim());
    if (!match) return null;
    const checks = [];
    if (match[1]) checks.push(element => element.tagName === match[1].toUpperCase());
    const tokenPattern = /\.([\w-]+)|\[([\w-]+)(?:(=)(['"]?)(.*?)\4)?\]/g;
    let token;
    while ((token = tokenPattern.exec(match[2] || ""))) {
        const [, className, attribute, operator, , expected] = token;
        if (className) {
            checks.push(element => element.className.split(/\s+/).includes(className));
            continue;
        }
        checks.push(element => {
            const value = element.getAttribute(attribute);
            if (value === null || value === undefined) return false;
            return !operator || value === expected;
        });
    }
    return element => checks.every(check => check(element));
}

function matchesSelector(element, selector, scope = null) {
    return String(selector).split(",").some(part => {
        let text = part.trim();
        // ":scope > x" (the only child combinator the plugin uses here).
        const child = /^:scope\s*>\s*(.+)$/.exec(text);
        if (child) {
            if (!scope || element.parentNode !== scope) return false;
            text = child[1];
            const compound = parseCompound(text);
            return Boolean(compound && compound(element));
        }
        const compounds = text.split(/\s+/).map(parseCompound);
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
    constructor(tag) {
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this.attributes = new Map();
        this.childNodes = [];
        this.parentNode = null;
        this.dataset = {};
        this.listeners = new Map();
        this.hidden = false;
        this.disabled = false;
        this.scrollTop = 0;
        this.rect = null;
        const properties = {};
        this.style = {
            setProperty(name, value) { properties[name] = String(value); },
            removeProperty(name) { delete properties[name]; },
            getPropertyValue(name) { return properties[name] || ""; }
        };
        if (this.tagName !== "SELECT") {
            this.value = "";
            this.checked = false;
        }
        else {
            Object.defineProperty(this, "value", {
                get() { return (this.options.find(option => option.selected) || this.options[0])?.value ?? ""; },
                set(next) { this.options.forEach(option => { option.selected = String(option.value) === String(next); }); }
            });
        }
    }
    get options() { return this.querySelectorAll("option"); }
    get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node.isDocumentRoot === true;
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get firstChild() { return this.childNodes[0] || null; }
    get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
    get nextSibling() {
        const siblings = this.parentNode?.childNodes || [];
        return siblings[siblings.indexOf(this) + 1] || null;
    }
    get previousSibling() {
        const siblings = this.parentNode?.childNodes || [];
        return siblings[siblings.indexOf(this) - 1] || null;
    }
    get className() { return this.getAttribute("class") || ""; }
    set className(value) { this.setAttribute("class", value); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(""); }
    set textContent(value) {
        this.childNodes.forEach(node => { node.parentNode = null; });
        this.childNodes = [];
        if (value !== "" && value !== undefined && value !== null) this.appendChild(new FakeText(value));
    }
    get tabIndex() { return Number(this.getAttribute("tabindex") ?? -1); }
    set tabIndex(value) { this.setAttribute("tabindex", String(value)); }
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
    getAttribute(name) {
        if (name.startsWith("data-")) return this.dataset[dataKey(name)] ?? null;
        if (name === "id") return this.id || null;
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    setAttribute(name, value) {
        if (name.startsWith("data-")) this.dataset[dataKey(name)] = String(value);
        else if (name === "id") this.id = String(value);
        else this.attributes.set(name, String(value));
    }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    removeAttribute(name) {
        if (name.startsWith("data-")) delete this.dataset[dataKey(name)];
        else this.attributes.delete(name);
    }
    appendChild(child) {
        child.parentNode?.removeChild?.(child);
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    append(...children) { children.forEach(child => this.appendChild(child)); }
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
    replaceWith(next) {
        const parent = this.parentNode;
        if (!parent) return;
        parent.insertBefore(next, this);
        parent.removeChild(this);
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
            if (matchesSelector(child, selector, this)) found.push(child);
            walk(child);
        });
        walk(this);
        return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return this.rect || { left: 0, top: 0, right: 800, bottom: 40, width: 800, height: 40 }; }
    focus() { globalThis.document.activeElement = this; }
    blur() {}
    scrollIntoView(options) { this.scrolledIntoView = options || true; }
    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(handler);
    }
    removeEventListener(type, handler) {
        this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== handler));
    }
    // Runs this element's listeners with a plain event object; returns the event.
    dispatch(type, init = {}) {
        const event = createEvent(type, { target: this, ...init });
        (this.listeners.get(type) || []).slice().forEach(handler => handler.call(this, event));
        return event;
    }
    click() { return this.dispatch("click"); }
}

function createEvent(type, init = {}) {
    return {
        type,
        defaultPrevented: false,
        propagationStopped: false,
        immediateStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true; },
        ...init
    };
}

// Listeners of a document or window: kept in order with their capture flag. A listener removed while an event is
// being dispatched does not run any more, as in the DOM.
function createListenerTarget(target) {
    const listeners = [];
    target.listeners = listeners;
    target.addEventListener = (type, handler, options) => {
        const capture = options === true || Boolean(options?.capture);
        if (!listeners.some(item => item.type === type && item.handler === handler && item.capture === capture)) {
            listeners.push({ type, handler, capture });
        }
    };
    target.removeEventListener = (type, handler, options) => {
        const capture = options === true || Boolean(options?.capture);
        const index = listeners.findIndex(item => item.type === type && item.handler === handler && item.capture === capture);
        if (index >= 0) listeners.splice(index, 1)[0].removed = true;
    };
    target.dispatchEvent = (type, init = {}, capture = true) => {
        const event = createEvent(type, init);
        for (const item of listeners.filter(entry => entry.type === type && entry.capture === capture)) {
            if (item.removed) continue;
            item.handler(event);
            if (event.immediateStopped) break;
        }
        return event;
    };
    target.count = (type, capture = null) => listeners.filter(item => item.type === type && (capture === null || item.capture === capture)).length;
    return target;
}

function createDocument() {
    const root = new FakeElement("html");
    root.isDocumentRoot = true;
    const body = root.appendChild(new FakeElement("body"));
    return createListenerTarget({
        root,
        body,
        activeElement: null,
        documentElement: root,
        createElement: tag => new FakeElement(tag),
        createTextNode: text => new FakeText(text),
        querySelector: selector => root.querySelector(selector),
        querySelectorAll: selector => root.querySelectorAll(selector),
        getElementById: () => null
    });
}

function createWindow(width = 1280, height = 900) {
    return createListenerTarget({ innerWidth: width, innerHeight: height, confirm: () => true });
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

function installDom(t, width, height) {
    const doc = createDocument();
    const win = createWindow(width, height);
    useGlobals(t, { document: doc, window: win });
    return { doc, win };
}

// A started plugin on the fake DOM with its unrelated side effects (saving, scanning, toasts) stubbed.
function createPlugin(t, setup = {}) {
    const { doc, win } = installDom(t, setup.width, setup.height);
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.flushSettings = () => true;
    plugin.queueScan = () => {};
    plugin.toasts = [];
    plugin.showToast = (message, type) => plugin.toasts.push({ message, type });
    plugin.warnSanitized = () => {};
    plugin.getCurrentRouteKey = () => "g1:c1:";
    plugin.settings.ui.language = setup.language || "zh-CN";
    if (setup.tab) plugin.settings.ui.settingsActiveTab = setup.tab;
    if (setup.apiKey) {
        plugin.settings.translation.apiKey = setup.apiKey;
        plugin.settings.polish.apiKey = setup.apiKey;
    }
    t.mock.method(console, "warn", () => {});
    t.mock.method(console, "info", () => {});
    t.after(() => {
        plugin.quickPanel?.destroy?.("test");
        plugin.isStarted = false;
    });
    return { plugin, doc, win };
}

const rect = width => ({ left: 0, top: 0, right: width, bottom: 600, width, height: 600 });
const rowByLabel = (root, label) => root.querySelectorAll(".dait-settings-row").find(row => row.querySelector(".dait-row-label")?.textContent === label) || null;
const buttonsOf = row => row.querySelectorAll("button");
const labelsIn = root => root.querySelectorAll(".dait-settings-row").map(row => row.querySelector(".dait-row-label")?.textContent);
// A short name for an element in assertion messages (the fake elements are circular).
const describe = element => `${element.tagName.toLowerCase()}${element.dataset.daitPath ? `[${element.dataset.daitPath}]` : ""} ${String(element.textContent || "").slice(0, 20)}`.trim();

// --- UI-1: BetterDiscord's plugin-settings modal in a Discord window 1000 px wide or narrower ---

// BetterDiscord's own modal (bd-modal-wrapper > bd-modal-root > bd-modal-content > bd-addon-settings-wrap) and
// Discord's layer (layer > focusLock > root > content > bd-addon-settings-wrap): the full-viewport layer is never
// marked, the modal frame is the root.
function buildModal(doc, layout, viewportWidth) {
    const nodes = {};
    const add = (parent, name, width) => {
        const node = parent.appendChild(doc.createElement("div"));
        node.className = name;
        node.rect = rect(width);
        nodes[name] = node;
        return node;
    };
    if (layout === "bd") {
        const wrapper = add(doc.body, "bd-modal-wrapper", viewportWidth);
        const root = add(wrapper, "bd-modal-root", 600);
        const content = add(root, "bd-modal-content", 600);
        add(content, "bd-addon-settings-wrap", 576);
        nodes.frame = root;
        nodes.layer = wrapper;
    }
    else {
        const container = add(doc.body, "layerContainer_x", viewportWidth);
        const layer = add(container, "layer_x", viewportWidth);
        const focusLock = add(layer, "focusLock_x", 600);
        const root = add(focusLock, "root_x", 600);
        const content = add(root, "content_x", 600);
        add(content, "bd-addon-settings-wrap", 576);
        nodes.frame = focusLock;
        nodes.layer = layer;
        nodes.container = container;
    }
    const panel = nodes["bd-addon-settings-wrap"].appendChild(doc.createElement("div"));
    panel.className = "dait-settings";
    return { ...nodes, panel };
}

for (const layout of ["bd", "discord"]) {
    for (const width of [1280, 1001, 1000, 960, 940, 800]) {
        test(`plugin-settings modal (${layout} layout) at a ${width} px window: only the modal frame and what is inside it are sized`, t => {
            const { plugin, doc } = createPlugin(t, { width, height: 800 });
            const modal = buildModal(doc, layout, width);
            plugin.applySettingsModalSizing(modal.panel);
            const marked = doc.querySelectorAll("[data-dait-settings-modal='true']");
            assert.equal(modal.layer.dataset.daitSettingsModal, undefined, "the full-viewport layer is left alone");
            assert.equal(modal.container?.dataset?.daitSettingsModal, undefined);
            assert.equal(modal.frame.dataset.daitSettingsModalRoot, "true", "the modal frame is the root");
            assert.equal(doc.querySelectorAll("[data-dait-settings-modal-root='true']").length, 1);
            assert.ok(marked.includes(modal["bd-addon-settings-wrap"]));
            assert.ok(marked.every(node => node.getBoundingClientRect().width < width), "nothing as wide as the window is marked");
            plugin.cleanupSettingsModalSizing(modal.panel);
            assert.equal(doc.querySelectorAll("[data-dait-settings-modal='true']").length, 0);
        });
    }
}

// --- UI-2: the settings window's focus trap only counts controls the user can see ---

const insideHidden = (element, root) => {
    for (let node = element; node && node !== root; node = node.parentNode) {
        if (node.hidden) return true;
    }
    return false;
};

test("settings window: Tab and Shift+Tab wrap between the first and the last control of the tab on show", t => {
    const { plugin, doc } = createPlugin(t, { tab: "overview" });
    const root = plugin.openQuickSettingsPanel("test");
    const dialog = root.querySelector(".dait-quick-settings-dialog");
    const focusable = plugin.getQuickSettingsFocusableElements(dialog);
    assert.ok(focusable.length > 3);
    assert.deepEqual(focusable.filter(element => insideHidden(element, dialog)).map(describe), [], "no control of a hidden tab page");
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    assert.ok(first === dialog.querySelector(".dait-settings-close"));
    assert.equal(last.dataset.daitPath, "ui.language", "the overview's last control");

    last.focus();
    let event = doc.dispatchEvent("keydown", { key: "Tab", shiftKey: false });
    assert.equal(event.defaultPrevented, true);
    assert.ok(doc.activeElement === first, "Tab from the last control goes back to the first");
    event = doc.dispatchEvent("keydown", { key: "Tab", shiftKey: true });
    assert.equal(event.defaultPrevented, true);
    assert.ok(doc.activeElement === last, "Shift+Tab from the first control goes to the last visible one");

    // Another tab: its own last control closes the loop.
    plugin.showSettingsTab(dialog.querySelector(".dait-settings").__daitSettingsUi, "display");
    const displayControls = plugin.getQuickSettingsFocusableElements(dialog);
    assert.deepEqual(displayControls.filter(element => insideHidden(element, dialog)).map(describe), []);
    assert.equal(displayControls[displayControls.length - 1].dataset.daitPath, "ui.showQuickSettingsPanelButton");
    plugin.closeQuickSettingsPanel(root, "test");
});
