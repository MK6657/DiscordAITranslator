"use strict";
// Settings window fixes after the v0.4.0 review: the tab after a reset, BetterDiscord's settings wrap, the
// diagnostic summary after Clear logs, the prompt select chevron, tab rail semantics, the channel rule without a
// channel and the panel's minimum height; plus the wave-3 leftovers.
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");
const { I18N } = require("../../src/i18n");

// ---------------------------------------------------------------------------------------------
// A small fake DOM: elements with classes, attributes, data-* (through dataset), events, hidden,
// focus, closest/querySelectorAll for compound selectors, and select values.
// ---------------------------------------------------------------------------------------------

class FakeText {
    constructor(value) {
        this.nodeType = 3;
        this.nodeValue = String(value);
        this.parentNode = null;
    }
    get textContent() { return this.nodeValue; }
}

const dataKey = attribute => attribute.slice(5).replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

function parseCompound(selector) {
    const match = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+|\[[^\]]+\])*)$/.exec(selector.trim());
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
    get parentElement() { return this.parentNode; }
    get isConnected() {
        let node = this;
        while (node.parentNode) node = node.parentNode;
        return node.isDocumentRoot === true;
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get className() { return this.getAttribute("class") || ""; }
    set className(value) { this.setAttribute("class", value); }
    get textContent() { return this.childNodes.map(node => node.textContent).join(""); }
    set textContent(value) {
        this.childNodes.forEach(node => { node.parentNode = null; });
        this.childNodes = [];
        if (value !== "" && value !== undefined && value !== null) this.appendChild(new FakeText(value));
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
    removeAttribute(name) { this.attributes.delete(name); }
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
            if (child.matches(selector)) found.push(child);
            walk(child);
        });
        walk(this);
        return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 40, width: 800, height: 40 }; }
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
        const event = {
            type,
            target: this,
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.propagationStopped = true; },
            stopImmediatePropagation() { this.propagationStopped = true; },
            ...init
        };
        (this.listeners.get(type) || []).slice().forEach(handler => handler.call(this, event));
        return event;
    }
    click() { return this.dispatch("click"); }
}

function createDocument() {
    const root = new FakeElement("html");
    root.isDocumentRoot = true;
    const body = root.appendChild(new FakeElement("body"));
    const listeners = new Map();
    return {
        root,
        body,
        activeElement: null,
        documentElement: root,
        createElement: tag => new FakeElement(tag),
        createTextNode: text => new FakeText(text),
        querySelector: selector => root.querySelector(selector),
        querySelectorAll: selector => root.querySelectorAll(selector),
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); },
        getElementById: () => null
    };
}

function createWindow() {
    const listeners = [];
    return {
        listeners,
        innerWidth: 1280,
        innerHeight: 900,
        addEventListener(type, handler, options) { listeners.push({ type, handler, capture: options === true }); },
        removeEventListener(type, handler) {
            const index = listeners.findIndex(item => item.type === type && item.handler === handler);
            if (index >= 0) listeners.splice(index, 1);
        },
        confirm: () => true
    };
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

function installDom(t) {
    const doc = createDocument();
    const win = createWindow();
    useGlobals(t, { document: doc, window: win });
    return { doc, win };
}

function createShell(t, setup = {}, env = null) {
    const { doc, win } = env || installDom(t);
    const plugin = new Plugin();
    plugin.saves = 0;
    plugin.saveSettings = () => { plugin.saves++; return true; };
    plugin.queueScan = () => {};
    plugin.showToast = () => {};
    plugin.warnSanitized = () => {};
    plugin.getCurrentRouteKey = () => "g1:c1:";
    if (setup.translationProvider) plugin.settings.translation.provider = setup.translationProvider;
    if (setup.polishProvider) plugin.settings.polish.provider = setup.polishProvider;
    if (setup.language) plugin.settings.ui.language = setup.language;
    if (setup.tab) plugin.settings.ui.settingsActiveTab = setup.tab;
    Object.assign(plugin.settings.ui, setup.ui || {});
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    return { doc, win, plugin, panel, state: panel.__daitSettingsUi };
}

const pathsIn = root => new Set(root.querySelectorAll("[data-dait-path]").map(control => control.dataset.daitPath));
const tabs = panel => panel.querySelectorAll("[role=tab]");
const tabPanels = panel => panel.querySelectorAll("[role=tabpanel]");
const visibleTab = panel => tabPanels(panel).filter(tabpanel => !tabpanel.hidden).map(tabpanel => tabpanel.dataset.daitSettingsTabPanel);
const rowOf = control => control.closest(".dait-settings-row");
const descriptionOf = control => rowOf(control).querySelector(".dait-row-description")?.textContent ?? "";
const allDisabled = control => control.querySelectorAll("input, button").every(node => node.disabled === true);

// ---------------------------------------------------------------------------------------------
// A small reading of the stylesheet: which declaration wins for an element (selectors the fake DOM can match:
// tags, classes, attributes, descendant combinators), and the value of a length expression for a window size.
// ---------------------------------------------------------------------------------------------

function cssRules(css = PLUGIN_CSS) {
    const rules = [];
    const pattern = /([^{}]+)\{([^{}]*)\}/g;
    let match;
    while ((match = pattern.exec(css))) {
        const selectors = match[1].replace(/\/\*[\s\S]*?\*\//g, "").split(",").map(part => part.trim()).filter(Boolean);
        rules.push({ selectors, body: match[2], order: rules.length });
    }
    return rules;
}

function declarationOf(body, property) {
    return new RegExp(`(?:^|[;\\s])${property}:\\s*([^;]+);`).exec(body)?.[1]?.trim() ?? null;
}

function winningDeclaration(element, property) {
    let best = null;
    for (const rule of cssRules()) {
        const value = declarationOf(rule.body, property);
        if (value === null) continue;
        for (const selector of rule.selectors) {
            if (/[:>+~@]/.test(selector) || !element.matches(selector)) continue;
            const key = [/!important/.test(value) ? 1 : 0, (selector.match(/[.[]/g) || []).length, rule.order];
            const wins = !best || key[0] !== best.key[0] ? !best || key[0] > best.key[0]
                : key[1] !== best.key[1] ? key[1] > best.key[1] : key[2] > best.key[2];
            if (wins) best = { key, value };
        }
    }
    return best?.value ?? null;
}

function cssRuleBody(selector) {
    const start = PLUGIN_CSS.indexOf(`\n${selector} {`);
    assert.ok(start >= 0, selector);
    return PLUGIN_CSS.slice(PLUGIN_CSS.indexOf("{", start) + 1, PLUGIN_CSS.indexOf("}", start));
}

// Evaluates calc()/min() lengths in px for a viewport height and the host variables syncSettingsPanelHeight sets.
function cssLength(expression, { vh, chrome, hostMax }) {
    const js = String(expression)
        .replace(/\s*!important/, "")
        .replace(/var\(--dait-host-max, 100vh\)/g, `${hostMax ?? vh}px`)
        .replace(/var\(--dait-host-chrome, 140px\)/g, `${chrome ?? 140}px`)
        .replace(/(\d+(?:\.\d+)?)vh/g, (match, value) => `${(Number(value) * vh) / 100}px`)
        .replace(/px/g, "")
        .replace(/\bcalc\(/g, "(")
        .replace(/\b(min|max)\(/g, "Math.$1(");
    assert.match(js, /^[\d\s.+\-*/(),]*(Math\.(min|max)\([\d\s.+\-*/(),Mathinax]*)*$/, js);
    return Function(`"use strict"; return ${js};`)();
}

function startedPlugin(plugin) {
    plugin.isStarted = true;
    plugin.lifecycleToken = 1;
    plugin.logDiagnostic = () => {};
    return plugin;
}

// BetterDiscord's confirmation dialog, confirmed straight away.
function confirmingBdApi(t) {
    const calls = [];
    useGlobals(t, {
        BdApi: {
            UI: {
                showConfirmationModal(title, content, options) {
                    calls.push(title);
                    options.onConfirm();
                    options.onClose?.();
                }
            }
        }
    });
    return calls;
}

// Timers the test runs by hand.
function manualTimers(t) {
    const timers = [];
    useGlobals(t, {
        setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
        clearTimeout: () => {}
    });
    return {
        timers,
        runAll() {
            const due = timers.splice(0);
            due.forEach(timer => timer.callback());
        }
    };
}

const resetButtonOf = panel => panel.querySelector("[data-dait-action=resetSettings]");
const selectedTabs = panel => tabs(panel).filter(tab => tab.getAttribute("aria-selected") === "true").map(tab => tab.dataset.daitSettingsTab);

// --- SS-1: a reset from the data tab ---------------------------------------------------------------

test("a reset from the data tab rebuilds the panel on the data tab, keeps its scroll position and focuses the new reset button", async t => {
    const { plugin, panel, doc, state } = createShell(t, { tab: "data" });
    startedPlugin(plugin);
    confirmingBdApi(t);
    const clock = manualTimers(t);
    plugin.settings.ui.translationStyle = "tag";
    state.content.scrollTop = 400;
    const button = resetButtonOf(panel);
    button.focus();

    assert.equal(await plugin.runSettingsResetFromUi(button), true);
    assert.equal(plugin.settings.ui.translationStyle, "tint", "the reset ran");

    const next = doc.body.querySelector(".dait-settings");
    assert.notEqual(next, panel);
    assert.deepEqual(visibleTab(next), ["data"], "the rebuilt panel shows the tab the user was on");
    assert.deepEqual(selectedTabs(next), ["data"]);
    assert.equal(next.__daitSettingsUi.activeTab, "data");
    assert.equal(plugin.settings.ui.settingsActiveTab, "data", "the stored tab matches the visible one");
    assert.equal(next.__daitSettingsUi.content.scrollTop, 400, "back at the danger zone");
    assert.equal(doc.activeElement, resetButtonOf(next), "focus is on the new reset button, not on <body>");

    // BetterDiscord's dialog hands the focus back to the removed button when it finishes closing: the focus is
    // put on the new reset button again.
    doc.activeElement = doc.body;
    clock.runAll();
    assert.equal(doc.activeElement, resetButtonOf(next));
    plugin.destroySettingsModalSizing(next);
});

test("a reset rebuilds every open panel on its own tab; the stored tab is the one of the panel the reset came from", async t => {
    const env = installDom(t);
    manualTimers(t);
    const quick = createShell(t, { tab: "translate" }, env);
    const quickRoot = env.doc.createElement("div");
    quickRoot.className = "dait-quick-settings-modal-root";
    env.doc.body.appendChild(quickRoot);
    quickRoot.appendChild(quick.panel);
    const plugin = startedPlugin(quick.plugin);
    plugin.settings.ui.settingsActiveTab = "data";
    const bdPanel = plugin.getSettingsPanel();
    env.doc.body.appendChild(bdPanel);
    confirmingBdApi(t);

    assert.equal(await plugin.runSettingsResetFromUi(resetButtonOf(bdPanel)), true);
    const [first, second] = env.doc.body.querySelectorAll(".dait-settings");
    const rebuiltQuick = quickRoot.querySelector(".dait-settings");
    const rebuiltBd = rebuiltQuick === first ? second : first;
    assert.deepEqual(visibleTab(rebuiltBd), ["data"]);
    assert.deepEqual(visibleTab(rebuiltQuick), ["translate"]);
    assert.equal(rebuiltQuick.dataset.daitQuickSettings, "true");
    assert.equal(plugin.settings.ui.settingsActiveTab, "data");
    [rebuiltQuick, rebuiltBd].forEach(item => plugin.destroySettingsModalSizing(item));
});

// --- SS-2: BetterDiscord's modal with its .bd-addon-settings-wrap -----------------------------------

test("BetterDiscord's modal: only the frame is widened; the scroller and BetterDiscord's settings wrap fill their parent", t => {
    const doc = createDocument();
    useGlobals(t, { document: doc, window: { innerWidth: 1600, innerHeight: 1000 } });
    const plugin = new Plugin();
    plugin.isStarted = true;
    const layer = doc.body.appendChild(doc.createElement("div"));
    const root = layer.appendChild(doc.createElement("div"));
    root.setAttribute("role", "dialog");
    const content = root.appendChild(doc.createElement("div"));
    const wrap = content.appendChild(doc.createElement("div"));
    wrap.className = "bd-addon-settings-wrap";
    const panel = wrap.appendChild(doc.createElement("div"));
    layer.getBoundingClientRect = () => ({ width: 1600 });
    root.getBoundingClientRect = () => ({ width: 600 });
    content.getBoundingClientRect = () => ({ width: 600 });
    wrap.getBoundingClientRect = () => ({ width: 576 });
    plugin.applySettingsModalSizing(panel);

    assert.deepEqual([root, content, wrap].map(node => node.dataset.daitSettingsModal), ["true", "true", "true"]);
    assert.equal(root.dataset.daitSettingsModalRoot, "true");
    assert.equal(layer.dataset.daitSettingsModal, undefined);
    // The frame gets the window width ...
    assert.equal(winningDeclaration(root, "width"), "min(920px, calc(100vw - 48px)) !important");
    assert.equal(winningDeclaration(root, "margin-left"), "auto !important");
    // ... and everything inside it fills its parent, so the panel never runs under the scroller's padding and scrollbar.
    for (const node of [content, wrap]) {
        assert.equal(winningDeclaration(node, "width"), "auto !important");
        assert.equal(winningDeclaration(node, "max-width"), "100% !important");
        assert.equal(winningDeclaration(node, "margin-left"), "0 !important");
        assert.equal(winningDeclaration(node, "margin-right"), "0 !important");
    }
    plugin.cleanupSettingsModalSizing(panel);
    assert.equal(wrap.dataset.daitSettingsModal, undefined);
});
