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

// --- UI-3: Escape while recording the polishing hotkey cancels the recording, not the window ---

function openHotkeyRecorder(t) {
    const context = createPlugin(t, { tab: "compose" });
    context.plugin.settings.ui.enablePolishHotkey = true;
    t.mock.timers.enable({ apis: ["setTimeout"] });
    context.root = context.plugin.openQuickSettingsPanel("test");
    context.recorder = context.root.querySelector(".dait-hotkey-recorder");
    context.label = context.recorder.textContent;
    context.isOpen = () => Boolean(context.doc.querySelector(".dait-quick-settings-modal-root"));
    return context;
}

test("settings window: Escape while recording the hotkey only cancels the recording", t => {
    const { plugin, doc, recorder, label, isOpen } = openHotkeyRecorder(t);
    recorder.click();
    t.mock.timers.tick(1);
    assert.equal(recorder.dataset.recording, "true");
    assert.equal(doc.count("keydown", true), 2, "the window's and the recorder's listeners");

    const event = doc.dispatchEvent("keydown", { key: "Escape" });
    assert.equal(event.defaultPrevented, true);
    assert.equal(isOpen(), true, "the window stays open");
    assert.equal(recorder.dataset.recording, undefined, "recording ended");
    assert.equal(recorder.textContent, label, "the saved shortcut shows again");
    assert.equal(plugin.hotkeyRecordCleanup, null);
    assert.equal(doc.count("keydown", true), 1, "the recorder's listener is gone");

    // The next Escape closes the window as usual.
    doc.dispatchEvent("keydown", { key: "Escape" });
    assert.equal(isOpen(), false);
});

test("settings window: Escape right after the recorder is clicked (before it listens) cancels the recording too", t => {
    const { recorder, label, doc, isOpen } = openHotkeyRecorder(t);
    recorder.click();
    assert.equal(recorder.dataset.recording, "true");
    doc.dispatchEvent("keydown", { key: "Escape" });
    assert.equal(isOpen(), true);
    assert.equal(recorder.dataset.recording, undefined);
    assert.equal(recorder.textContent, label);
    t.mock.timers.tick(1);
    assert.equal(doc.count("keydown", true), 1, "the cancelled recording never starts listening");
});

// --- UI-4: the data tab gives each action its own row, with unique labels ---

const tabPanel = (panel, id) => panel.querySelector(`[data-dait-settings-tab-panel='${id}']`);
const controlButtons = row => (row.children[1] ? row.children[1].querySelectorAll("button") : []);

test("data tab: every row label is unique and each destructive action has a row of its own", t => {
    const { plugin, doc } = createPlugin(t, { tab: "data" });
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const data = tabPanel(panel, "data");
    const labels = labelsIn(data);
    assert.deepEqual(labels.filter((label, index) => labels.indexOf(label) !== index), [], "no two rows share a label");

    const rows = data.querySelectorAll(".dait-settings-row");
    const danger = rows.filter(row => controlButtons(row).some(button => button.classList.contains("dait-small-button-danger")));
    danger.forEach(row => assert.equal(controlButtons(row).length, 1, `${row.querySelector(".dait-row-label").textContent} holds only its destructive button`));
    const dangerTexts = danger.map(row => controlButtons(row)[0].textContent);
    for (const key of ["clearTranslationCache", "clearDiagnosticLogs", "reset"]) assert.ok(dangerTexts.includes(plugin.t(key)), key);

    // One row holds a small group of related buttons (copy and export the logs); every other row one control.
    const groups = rows.filter(row => controlButtons(row).length > 1);
    assert.deepEqual(groups.map(row => row.querySelector(".dait-row-label").textContent), [plugin.t("exportDiagnosticLogs")]);
    assert.deepEqual(controlButtons(groups[0]).map(button => button.textContent), ["copyDiagnosticLogs", "exportDiagnosticJson", "exportDiagnosticTxt"].map(key => plugin.t(key)));
    const stats = rowByLabel(data, plugin.t("translationCacheStats"));
    assert.deepEqual(controlButtons(stats).map(button => button.textContent), [plugin.t("clearTranslationCacheStats")]);
    assert.equal(stats.querySelector(".dait-row-description").textContent, plugin.getTranslationCacheStatsText());
    assert.equal(groups[0].querySelector(".dait-row-description").textContent, plugin.getDiagnosticLogsStatsText());
    plugin.destroySettingsModalSizing(panel);
});

test("data tab: clearing the cache or the logs updates the counts shown in the stats rows", async t => {
    const { plugin, doc } = createPlugin(t, { tab: "data" });
    plugin.confirmAction = async () => true;
    plugin.refreshDiagnosticSummary = () => {};
    let statsText = "hits 5";
    plugin.getTranslationCacheStatsText = () => statsText;
    let logsText = "logs 9";
    plugin.getDiagnosticLogsStatsText = () => logsText;
    plugin.clearTranslationCache = () => { statsText = "hits 0"; };
    plugin.clearDiagnosticLogs = () => { logsText = "logs 0"; };
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const data = tabPanel(panel, "data");
    const stats = rowByLabel(data, plugin.t("translationCacheStats"));
    const logs = rowByLabel(data, plugin.t("exportDiagnosticLogs"));
    assert.equal(stats.querySelector(".dait-row-description").textContent, "hits 5");
    assert.equal(logs.querySelector(".dait-row-description").textContent, "logs 9");

    data.querySelectorAll("button").find(button => button.textContent === plugin.t("clearTranslationCache")).click();
    data.querySelectorAll("button").find(button => button.textContent === plugin.t("clearDiagnosticLogs")).click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(stats.querySelector(".dait-row-description").textContent, "hits 0");
    assert.equal(logs.querySelector(".dait-row-description").textContent, "logs 0");
    plugin.destroySettingsModalSizing(panel);
});

test("settings: no tab page shows two rows with the same label", t => {
    for (const language of ["zh-CN", "en"]) {
        const { plugin, doc } = createPlugin(t, { language });
        const panel = plugin.getSettingsPanel({ quickSettings: true });
        doc.body.appendChild(panel);
        for (const tabpanel of panel.querySelectorAll("[role=tabpanel]")) {
            const labels = labelsIn(tabpanel);
            assert.deepEqual(labels.filter((label, index) => labels.indexOf(label) !== index), [], `${language} ${tabpanel.dataset.daitSettingsTabPanel}`);
        }
        plugin.destroySettingsModalSizing(panel);
    }
});

// --- UI-5: the source-language row says whose language it is ---

test("the source-language row names channel messages on the translate tab and the draft on the composer tab", t => {
    for (const language of ["zh-CN", "en"]) {
        const { plugin, doc } = createPlugin(t, { language });
        const panel = plugin.getSettingsPanel({ quickSettings: true });
        doc.body.appendChild(panel);
        // The source-language select is the one that offers auto-detect.
        const rowOf = tab => tabPanel(panel, tab).querySelectorAll(".dait-language-select")
            .find(select => select.querySelectorAll("option").some(option => option.textContent === plugin.t("autoDetectLanguage")))
            .closest(".dait-settings-row");
        const translation = rowOf("translate");
        assert.equal(translation.querySelector(".dait-row-label").textContent, plugin.t("messageLanguage"), language);
        assert.equal(translation.querySelector(".dait-row-description").textContent, plugin.t("messageLanguageDesc"), language);
        const polish = rowOf("compose");
        assert.equal(polish.querySelector(".dait-row-label").textContent, plugin.t("inputLanguage"), language);
        assert.equal(polish.querySelector(".dait-row-description").textContent, plugin.t("inputLanguageDesc"), language);
        // The custom field's accessible name follows the row.
        assert.match(translation.querySelector(".dait-language-custom").getAttribute("aria-label"), new RegExp(`^${plugin.t("messageLanguage")}:`));
        plugin.destroySettingsModalSizing(panel);
    }
    assert.equal(I18N["zh-CN"].messageLanguage, "原文语言");
    assert.equal(I18N.en.messageLanguage, "Message language");
    assert.match(I18N["zh-CN"].messageLanguageDesc, /频道消息/);
    assert.match(I18N.en.messageLanguageDesc, /channel messages/);
    assert.doesNotMatch(I18N["zh-CN"].messageLanguageDesc, /草稿/);
    assert.doesNotMatch(I18N.en.messageLanguageDesc, /draft/);
});

// --- UI-6: settings search finds actions by their button text; Latin terms match at word starts ---

function searchShell(t, language) {
    const { plugin, doc } = createPlugin(t, { language, tab: "overview" });
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const state = panel.__daitSettingsUi;
    const search = query => plugin.runSettingsSearch(state, query);
    t.after(() => plugin.destroySettingsModalSizing(panel));
    return { plugin, doc, panel, state, search };
}

test("settings search finds buttons: clear, test and export in Chinese", t => {
    const { plugin, doc, state, search } = searchShell(t, "zh-CN");
    const labels = query => search(query).map(entry => entry.label);
    assert.ok(labels("清空统计").includes(plugin.t("translationCacheStats")), "a row is found by its button");
    assert.ok(labels("清空").length >= 3);
    assert.ok(labels("导出 JSON").includes(plugin.t("exportDiagnosticLogs")));
    // Chinese matches anywhere in a word, as before.
    assert.ok(labels("缓存").includes(plugin.t("translationCacheStats")));
    const test = search("测试");
    const card = test.find(entry => entry.tabId === "translate" && entry.row.classList.contains("dait-provider-settings-header"));
    assert.ok(card, "the translation connection card's Test action is a search target");
    assert.ok(test.some(entry => entry.tabId === "compose" && entry.row.classList.contains("dait-provider-settings-header")));
    // Opening that result shows the tab and focuses Test.
    plugin.openSettingsSearchResult(state, card);
    assert.equal(doc.activeElement?.dataset?.daitAction, "apiTest");
    assert.equal(doc.activeElement?.dataset?.daitKind, "translation");
});

test("settings search in English: clear, test and cache find the actions; 'reset' does not match 'preset'", t => {
    const { plugin, search } = searchShell(t, "en");
    const labels = query => search(query).map(entry => entry.label);
    assert.ok(labels("clear").includes(plugin.t("translationCacheStats")), "Clear stats");
    assert.ok(labels("clear cache").includes(plugin.t("clearTranslationCache")));
    assert.ok(labels("test").some(label => label.startsWith(plugin.t("providerSettingsTitle"))));
    assert.ok(labels("json").includes(plugin.t("exportDiagnosticLogs")));
    const reset = labels("reset");
    assert.ok(reset.includes(plugin.t("reset")));
    assert.deepEqual(reset.filter(label => /preset/i.test(label)), [], "no match inside another word");
    assert.ok(labels("preset").some(label => /preset/i.test(label)), "the whole word still matches");
    assert.ok(labels("api").length > 0, "a word start in the middle of a label");
});

// --- UI-7: the polish result panel uses the settings type scale ---

// The body of the rule whose whole selector is this one.
function cssRule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return PLUGIN_CSS.match(new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`))?.[1] || "";
}

test("polish result panel: readable title and buttons on the shared scale, a labelled × close button", t => {
    const title = cssRule(".dait-polish-result-title");
    assert.match(title, /font-size: var\(--dait-font-label\);/);
    assert.match(title, /font-weight: 600;/);
    const action = cssRule(".dait-polish-result-action");
    assert.match(action, /font-family: inherit;/);
    assert.match(action, /font-size: var\(--dait-font-body\);/);
    assert.match(action, /font-weight: 500;/);
    assert.match(action, /height: var\(--dait-control-h\);/);
    assert.match(action, /border-radius: var\(--dait-radius-control\);/);
    const close = cssRule(".dait-polish-result-icon");
    assert.match(close, /font-family: inherit;/);
    // Weights 400-700 only, nothing under 12 px, no hard-coded colours in the panel's rules.
    const rules = PLUGIN_CSS.match(/\n\.dait-polish-result-[\w-]+(?:[.:][\w-]+(?:\([^)]*\))?)* \{[\s\S]*?\n\}/g) || [];
    assert.ok(rules.length >= 6);
    // The token definitions (custom properties with their fallbacks) are not declarations of the panel's rules.
    for (const rule of rules.map(text => text.replace(/^\s*--[^\n]*$/gm, ""))) {
        for (const [, weight] of rule.matchAll(/font-weight: (\d+);/g)) assert.ok([400, 500, 600, 700].includes(Number(weight)), rule);
        for (const [, size] of rule.matchAll(/font-size: (\d+)px;/g)) assert.ok(Number(size) >= 12, rule);
        assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(/i.test(rule), false, rule);
    }

    const { plugin, doc } = createPlugin(t);
    const textbox = doc.body.appendChild(doc.createElement("div"));
    plugin.showPolishResultPanel(textbox, "polished text", { allowApply: true });
    const panel = doc.querySelector(".dait-polish-result-panel");
    const icon = panel.querySelector(".dait-polish-result-icon");
    assert.equal(icon.textContent, "×");
    assert.equal(icon.getAttribute("aria-label"), plugin.t("polishResultClose"));
    assert.equal(icon.title, plugin.t("polishResultClose"));
    plugin.removePolishResultPanel();
});

// --- UI-8: one name for a service that is missing a required field ---

test("a service without its API key reads 'Not set up' everywhere: title bar, connection card, overview card and quick panel", t => {
    for (const language of ["zh-CN", "en"]) {
        const { plugin, doc } = createPlugin(t, { language, tab: "overview" });
        const panel = plugin.getSettingsPanel({ quickSettings: true });
        doc.body.appendChild(panel);
        const notSetUp = plugin.t("quickStatusNotConfigured");
        const header = panel.querySelector(".dait-settings-header .dait-api-status");
        const card = tabPanel(panel, "translate").querySelector(".dait-provider-settings-header .dait-api-status");
        for (const badge of [header, card]) {
            assert.equal(badge.textContent, notSetUp, language);
            assert.equal(badge.className, "dait-api-status dait-api-status-unconfigured");
            assert.equal(badge.title, plugin.t("overviewServiceMissing", { field: plugin.t("apiKey") }));
        }
        const mark = tabPanel(panel, "overview").querySelector(".dait-service-card .dait-status-mark-needs");
        assert.equal(mark.textContent, plugin.t("overviewServiceMissing", { field: plugin.t("apiKey") }));
        assert.ok(mark.textContent.startsWith(notSetUp), `${language}: the overview card uses the same name`);
        assert.equal(plugin.getLauncherStatus().connection, notSetUp);

        // With the key the badges say the service has not been tested yet.
        plugin.setSetting("translation.apiKey", "sk-fake-1");
        for (const badge of [header, card]) {
            assert.equal(badge.textContent, plugin.t("apiStatusUntested"));
            assert.equal(badge.className, "dait-api-status dait-api-status-untested");
        }
        // A result reported while the key is missing again still shows as not set up; a running test shows as testing.
        plugin.settings.translation.apiKey = "";
        plugin.setApiRuntimeStatus("translation", "success");
        assert.equal(header.textContent, notSetUp);
        plugin.setApiStatus(header, "testing", plugin.t("apiStatusTesting"), "", "translation");
        assert.equal(header.textContent, plugin.t("apiStatusTesting"));
        // The test ends (failed: the key is missing); every badge shows what to fix.
        plugin.settings.translation.apiStatus = { state: "failed", message: "missing key" };
        plugin.refreshApiTestViews("translation");
        assert.equal(header.className, "dait-api-status dait-api-status-unconfigured");
        assert.equal(card.className, "dait-api-status dait-api-status-unconfigured");
        plugin.destroySettingsModalSizing(panel);
    }
    // The "needs you" mark: the same "!" as a failed connection.
    assert.match(PLUGIN_CSS, /\.dait-settings \.dait-api-status\.dait-api-status-failed,\n\.dait-settings \.dait-api-status\.dait-api-status-unconfigured \{\n    color: var\(--dait-danger\);/);
    assert.match(PLUGIN_CSS, /\.dait-settings \.dait-api-status\.dait-api-status-failed::before,\n\.dait-settings \.dait-api-status\.dait-api-status-unconfigured::before \{[\s\S]*?content: "!";/);
});

// --- UI-9: consistent wording ---

test("English wording: 'hide original' in both places and sentence-case group headings", () => {
    assert.equal(I18N.en.hideOriginalAfterTranslation, "Hide original after translation");
    assert.equal(I18N.en.quickPanelHideOriginal, I18N.en.hideOriginalAfterTranslation);
    assert.equal(I18N.en.polishTitle, "Input polishing");
    assert.equal(I18N.en.translationTitle, "Channel translation");
    assert.doesNotMatch(I18N.en.hideOriginalAfterTranslation, /mask/i, "mask means masking translations");
});

test("built-in prompt templates show a localised name in English; renamed and custom ones keep their name", t => {
    const { plugin, doc } = createPlugin(t, { language: "en", tab: "translate" });
    const templates = plugin.getPromptTemplates("translation");
    const custom = { id: "translation-custom-fake", serial: "003", name: "My style", prompt: "Translate into {targetLanguage}." };
    templates.push(custom);
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const manager = tabPanel(panel, "translate").querySelector(".dait-prompt-manager");
    const options = manager.querySelector("select").querySelectorAll("option").map(option => option.textContent);
    assert.deepEqual(options, ["001 · Natural", "002 · Literal", "003 · My style"]);
    assert.ok(options.every(text => !/[一-鿿]/.test(text)), "no Chinese names in the English UI");
    assert.ok(manager.textContent.includes(plugin.t("promptUsingTemplate", { code: "001", name: "Natural" })));
    assert.equal(plugin.getPromptTemplateDisplayName(templates[0]), "Natural");
    // A search for the English name finds the template.
    assert.ok(plugin.getPromptTemplateSearchText(templates[1]).includes("literal"));
    // A built-in template the user renamed keeps the new name.
    assert.equal(plugin.getPromptTemplateDisplayName({ ...templates[0], name: "Casual" }), "Casual");
    // The polish templates too.
    assert.deepEqual(plugin.getPromptTemplates("polish").map(template => plugin.getPromptTemplateDisplayName(template)), ["Natural chat", "Polite and clear", "Short and direct"]);
    // Toasts name it the same way.
    plugin.applyPromptTemplate("translation", "translation-literal");
    assert.equal(plugin.toasts.at(-1).message, plugin.t("promptApplied", { name: "Literal", code: "002" }));
    plugin.settings.ui.language = "zh-CN";
    assert.equal(plugin.getPromptTemplateLabel(templates[0]), "001 · 自然翻译");
    assert.equal(plugin.getPromptTemplateDisplayName(templates[1]), "准确直译");
    plugin.destroySettingsModalSizing(panel);
});

test("the bilingual flow line says whether polishing runs before the bilingual message, not whether polishing is on", t => {
    const { plugin } = createPlugin(t);
    plugin.settings.polish.enabled = true;
    plugin.settings.ui.publicBilingualPolishBeforeTranslate = false;
    plugin.settings.ui.publicBilingualAfterPolish = false;
    assert.match(plugin.getPublicBilingualFlowText(), /^双语前润色：不润色；/);
    plugin.settings.ui.language = "en";
    assert.match(plugin.getPublicBilingualFlowText(), /^Polish before bilingual: no; /);
    plugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    assert.match(plugin.getPublicBilingualFlowText(), new RegExp(`^Polish before bilingual: ${plugin.getProviderDisplayName(plugin.settings.polish.provider)}; `));
});

// --- UI-10: the quick panel shows the whole actionable error; segment labels stay on one line ---

test("quick panel: the status note wraps (up to three lines) instead of being cut to one", () => {
    const note = cssRule(".dait-qp-status-note");
    assert.doesNotMatch(note, /white-space: nowrap;/);
    assert.doesNotMatch(note, /text-overflow: ellipsis;/);
    assert.match(note, /-webkit-line-clamp: 3;/);
    assert.match(note, /display: -webkit-box;/);
    assert.match(note, /overflow-wrap: anywhere;/);
    // Hidden still hides it (the clamp's display must not win over [hidden]).
    assert.match(PLUGIN_CSS, /\.dait-qp-status-note\[hidden\] \{\n    display: none;/);
    const segment = cssRule(".dait-qp-segment");
    assert.match(segment, /white-space: nowrap;/);
    assert.match(segment, /padding: 4px;/);
});

test("settings window: a key that ends an IME composition does not close the window", t => {
    const { doc, isOpen } = openHotkeyRecorder(t);
    doc.dispatchEvent("keydown", { key: "Escape", isComposing: true });
    assert.equal(isOpen(), true);
    doc.dispatchEvent("keydown", { key: "Escape" });
    assert.equal(isOpen(), false);
});
