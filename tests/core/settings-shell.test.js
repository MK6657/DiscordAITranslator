"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");
const {
    SETTINGS_TAB_IDS,
    LEGACY_SETTINGS_TAB_MAP,
    normalizeSettingsTabId
} = require("../../src/settings/settings-schema");

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

// data-dait-path controls the v0.3.0 panel built for each provider setup (captured from f0cfa1e). Nothing may be lost.
const V030_COMMON = [
    "polish.afterAction", "polish.apiKey", "polish.enabled", "polish.endpoint", "polish.maxTokens", "polish.model", "polish.prompt",
    "polish.provider", "polish.repolishSource", "polish.temperature", "translation.enabled", "translation.provider",
    "ui.autoTranslateConcurrency", "ui.autoTranslateIntakeMode", "ui.autoTranslateMessages", "ui.autoTranslatePrefetch",
    "ui.autoTranslatePrefetchRange", "ui.autoTranslateStrictRetry", "ui.currentChannelAutoTranslatePolicy", "ui.diagnosticsEnabled",
    "ui.enablePolishHotkey", "ui.hideOriginalAfterTranslation", "ui.historyBackfillEnabled", "ui.historyBackfillLimit",
    "ui.injectInputButton", "ui.injectMessageButtons", "ui.injectMessageContextMenu", "ui.language", "ui.maskTranslations",
    "ui.messageButtonVisibility", "ui.providerFallbackEnabled", "ui.providerFallbackOrder", "ui.publicBilingualAfterPolish",
    "ui.publicBilingualInputButton", "ui.publicBilingualPolishBeforeTranslate", "ui.publicBilingualUseInitialOriginal",
    "ui.showAutoTranslateToasts", "ui.showAutoTranslateWarnings", "ui.showQuickSettingsPanelButton", "ui.testModeEnabled",
    "ui.translationCacheMaxEntries", "ui.translationCacheTtlHours", "ui.translationPosition", "ui.translationStyle",
    "ui.translationTextScale"
];
const V030_CHAT = ["translation.apiKey", "translation.endpoint", "translation.maxTokens", "translation.model", "translation.prompt", "translation.temperature"];
const V030_PATHS = {
    "deepseek/deepseek": [...V030_COMMON, ...V030_CHAT, "polish.enableThinking", "translation.enableThinking"],
    "openaiCompatible/openaiCompatible": [...V030_COMMON, ...V030_CHAT],
    "sakuraLocal/sakuraLocal": [...V030_COMMON, ...V030_CHAT],
    "googleCloud/deepseek": [...V030_COMMON, "polish.enableThinking", "googleTranslate.allowPrefetch", "googleTranslate.defaultMonthlyLimit", "googleTranslate.keyPoolText"],
    "microsoft/deepseek": [...V030_COMMON, "polish.enableThinking", "translation.apiKey", "translation.endpoint", "translation.region"],
    "deepl/deepseek": [...V030_COMMON, "polish.enableThinking", "translation.apiKey", "translation.deeplPlan"],
    "baidu/deepseek": [...V030_COMMON, "polish.enableThinking", "translation.appId", "translation.endpoint", "translation.secretKey"]
};
// Settings that now share one control.
const MERGED_PATHS = { "ui.injectMessageButtons": "ui.messageButtonMode", "ui.messageButtonVisibility": "ui.messageButtonMode" };

test("every v0.3.0 setting still has a control in the tabbed window", t => {
    const env = installDom(t);
    for (const [setup, before] of Object.entries(V030_PATHS)) {
        const [translationProvider, polishProvider] = setup.split("/");
        const { panel } = createShell(t, { translationProvider, polishProvider }, env);
        const after = pathsIn(panel);
        const expected = new Set(before.map(path => MERGED_PATHS[path] || path));
        const lost = [...expected].filter(path => !after.has(path));
        assert.deepEqual(lost, [], `${setup} lost ${lost.join(", ")}`);
        // Every control sits on exactly one visible-or-hidden tab page, inside a row or the prompt manager.
        panel.querySelectorAll("[data-dait-path]").forEach(control => {
            assert.ok(control.closest(".dait-settings-tabpanel"), control.dataset.daitPath);
        });
    }
});

test("tabs: six tabs with tab/tabpanel wiring, one page visible, the tab is saved", t => {
    const { plugin, panel } = createShell(t, { tab: "cache" });
    assert.deepEqual(tabs(panel).map(tab => tab.dataset.daitSettingsTab), SETTINGS_TAB_IDS);
    assert.deepEqual(tabs(panel).map(tab => tab.textContent), ["概览", "翻译消息", "输入框工具", "显示", "高级", "数据与诊断"]);
    const tablist = panel.querySelector("[role=tablist]");
    assert.equal(tablist.getAttribute("aria-orientation"), "vertical");
    assert.equal(tablist.getAttribute("aria-label"), "设置分类");
    tabs(panel).forEach((tab, index) => {
        const tabpanel = tabPanels(panel)[index];
        assert.equal(tab.getAttribute("aria-controls"), tabpanel.id);
        assert.equal(tabpanel.getAttribute("aria-labelledby"), tab.id);
        assert.ok(tab.id && tabpanel.id);
    });
    // v0.3.0 "cache" section lives on the data tab now.
    assert.deepEqual(visibleTab(panel), ["data"]);
    assert.deepEqual(tabs(panel).map(tab => tab.getAttribute("aria-selected")), ["false", "false", "false", "false", "false", "true"]);
    assert.deepEqual(tabs(panel).map(tab => tab.getAttribute("tabindex")), ["-1", "-1", "-1", "-1", "-1", "0"]);

    tabs(panel)[2].click();
    assert.deepEqual(visibleTab(panel), ["compose"]);
    assert.equal(plugin.settings.ui.settingsActiveTab, "compose");
    assert.equal(plugin.saves, 1);
    assert.equal(tabs(panel)[2].getAttribute("aria-selected"), "true");
});

test("tabs: arrow keys, Home and End move along the rail and focus the tab", t => {
    const { plugin, panel, doc } = createShell(t, { tab: "overview" });
    const tablist = panel.querySelector("[role=tablist]");
    const press = key => tablist.dispatch("keydown", { key });
    assert.equal(press("ArrowDown").defaultPrevented, true);
    assert.deepEqual(visibleTab(panel), ["translate"]);
    assert.equal(doc.activeElement, tabs(panel)[1]);
    press("ArrowRight");
    assert.deepEqual(visibleTab(panel), ["compose"]);
    press("ArrowUp");
    press("ArrowLeft");
    assert.deepEqual(visibleTab(panel), ["overview"]);
    press("ArrowUp");
    assert.deepEqual(visibleTab(panel), ["data"], "wraps around");
    press("Home");
    assert.deepEqual(visibleTab(panel), ["overview"]);
    press("End");
    assert.deepEqual(visibleTab(panel), ["data"]);
    assert.equal(doc.activeElement, tabs(panel)[5]);
    assert.equal(press("Enter").defaultPrevented, false);
    assert.equal(plugin.settings.ui.settingsActiveTab, "data");
});

test("saved v0.3.0 section ids migrate to the new tabs; unknown values open the overview", t => {
    const expected = {
        general: "overview",
        polish: "compose",
        polishControls: "compose",
        publicBilingual: "compose",
        translation: "translate",
        translationControls: "translate",
        autoTranslate: "translate",
        display: "display",
        cache: "data",
        diagnostics: "data"
    };
    assert.deepEqual(LEGACY_SETTINGS_TAB_MAP, expected);
    Object.entries(expected).forEach(([legacy, tab]) => assert.equal(normalizeSettingsTabId(legacy), tab, legacy));
    SETTINGS_TAB_IDS.forEach(tab => assert.equal(normalizeSettingsTabId(tab), tab));
    ["", "nope", undefined, null, "__proto__", "constructor"].forEach(value => assert.equal(normalizeSettingsTabId(value), "overview", String(value)));

    // Loading stored settings rewrites the old value once.
    const stored = { ui: { settingsActiveTab: "diagnostics" } };
    const plugin = new Plugin();
    plugin.warnSanitized = () => {};
    const saved = [];
    plugin.loadData = key => key === "settings" ? JSON.parse(JSON.stringify(stored)) : null;
    plugin.saveData = (key, value) => { if (key === "settings") saved.push(value); return true; };
    plugin.loadSettings();
    assert.equal(plugin.settings.ui.settingsActiveTab, "data");
    plugin.setSetting("ui.settingsActiveTab", "polishControls");
    assert.equal(plugin.settings.ui.settingsActiveTab, "compose");

    const { panel } = createShell(t, { tab: "translationControls" });
    assert.deepEqual(visibleTab(panel), ["translate"]);
});

test("search finds rows on every tab by label or description, names the tab, opens it and focuses the control", t => {
    const { plugin, panel, state, doc } = createShell(t, { tab: "overview" });
    const input = panel.querySelector(".dait-settings-search-input");
    assert.equal(input.getAttribute("aria-label"), "搜索设置");
    assert.equal(input.getAttribute("aria-controls"), state.results.id);

    input.value = "缓存时间";
    input.dispatch("input");
    assert.equal(state.results.hidden, false);
    assert.deepEqual(visibleTab(panel), [], "tab pages hide while results show");
    const results = () => state.resultsList.querySelectorAll(".dait-settings-search-result");
    assert.equal(results().length, 1);
    assert.equal(results()[0].querySelector(".dait-settings-search-result-label").textContent, "缓存时间");
    assert.equal(results()[0].querySelector(".dait-settings-search-result-tab").textContent, "数据与诊断");

    // A word from a description finds the row too; several words must all match.
    input.value = "spoiler";
    input.dispatch("input");
    assert.ok(results().some(result => result.textContent.includes("当前链路")));
    input.value = "缓存 统计";
    input.dispatch("input");
    assert.deepEqual(results().map(result => result.querySelector(".dait-settings-search-result-label").textContent), ["缓存命中统计"]);

    // Enter opens the first result: its tab shows and its control has focus.
    input.value = "自动翻译并发数";
    input.dispatch("input");
    assert.equal(results()[0].querySelector(".dait-settings-search-result-label").textContent, "自动翻译并发数");
    const enter = input.dispatch("keydown", { key: "Enter" });
    assert.equal(enter.defaultPrevented, true);
    assert.deepEqual(visibleTab(panel), ["advanced"]);
    assert.equal(plugin.settings.ui.settingsActiveTab, "advanced");
    assert.equal(doc.activeElement.dataset.daitPath, "ui.autoTranslateConcurrency");
    assert.equal(input.value, "");
    assert.equal(state.results.hidden, true);

    // A result inside a collapsed <details> opens it; a click works like Enter.
    input.value = "最大输出";
    input.dispatch("input");
    results()[0].click();
    assert.deepEqual(visibleTab(panel), ["translate"]);
    assert.equal(doc.activeElement.dataset.daitPath, "translation.maxTokens");
    assert.equal(doc.activeElement.closest("details").open, true);

    // Esc clears the query and shows the current tab again.
    input.value = "xyz-no-such-setting";
    input.dispatch("input");
    assert.equal(results().length, 0);
    assert.match(state.resultsSummary.textContent, /xyz-no-such-setting/);
    input.focus();
    const escape = input.dispatch("keydown", { key: "Escape" });
    assert.equal(escape.defaultPrevented, true);
    assert.equal(escape.propagationStopped, true);
    assert.equal(input.value, "");
    assert.deepEqual(visibleTab(panel), ["translate"]);
});

test("search: Esc is caught before the quick-settings window closes; arrow keys walk the results", t => {
    const { plugin, panel, state, win, doc } = createShell(t);
    const input = panel.querySelector(".dait-settings-search-input");
    input.dispatch("focus");
    const capture = win.listeners.find(item => item.type === "keydown" && item.capture);
    assert.ok(capture, "a window capture listener runs before the document-level Escape handler");
    input.value = "翻译";
    input.dispatch("input");
    const results = state.resultsList.querySelectorAll(".dait-settings-search-result");
    assert.ok(results.length > 2);
    input.dispatch("keydown", { key: "ArrowDown" });
    assert.equal(doc.activeElement, results[0]);
    results[0].dispatch("keydown", { key: "ArrowDown" });
    assert.equal(doc.activeElement, results[1]);
    results[1].dispatch("keydown", { key: "ArrowUp" });
    results[0].dispatch("keydown", { key: "ArrowUp" });
    assert.equal(doc.activeElement, input);
    const event = { key: "Escape", preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stoppedNow = true; } };
    capture.handler(event);
    assert.equal(event.stoppedNow, true);
    assert.equal(input.value, "");
    // With an empty query Esc is left alone, so it still closes the window.
    const second = { key: "Escape", preventDefault() { this.prevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} };
    capture.handler(second);
    assert.equal(second.prevented, undefined);
    // Destroying the panel removes the listener.
    plugin.destroySettingsModalSizing(panel);
    assert.equal(win.listeners.some(item => item.type === "keydown" && item.capture), false);
});

test("search matches the current UI language", t => {
    const { panel, state } = createShell(t, { language: "en" });
    const input = panel.querySelector(".dait-settings-search-input");
    input.value = "cache lifetime";
    input.dispatch("input");
    const labels = state.resultsList.querySelectorAll(".dait-settings-search-result-label").map(node => node.textContent);
    assert.ok(labels.length >= 1, "English labels are searchable");
    assert.ok(state.resultsList.querySelectorAll(".dait-settings-search-result-tab").every(node => node.textContent === "Data & diagnostics"));
    input.value = "缓存";
    input.dispatch("input");
    assert.equal(state.resultsList.querySelectorAll(".dait-settings-search-result").length, 0);
});

test("rows: div grid rows, <label for> on form fields, aria-describedby, role=switch", t => {
    const { panel } = createShell(t);
    const rows = panel.querySelectorAll(".dait-settings-row");
    assert.ok(rows.length > 40);
    rows.forEach(row => {
        assert.equal(row.tagName, "DIV", "rows are never <label>s");
        assert.equal(row.children.length, 2);
        assert.ok(row.children[0].classList.contains("dait-row-text"));
        assert.ok(row.children[1].classList.contains("dait-row-control"));
    });
    panel.querySelectorAll("[data-dait-path]").forEach(control => {
        const row = rowOf(control);
        if (!row) return;
        const label = row.querySelector(".dait-row-label");
        const description = row.querySelector(".dait-row-description");
        if (["INPUT", "SELECT", "TEXTAREA"].includes(control.tagName)) {
            assert.equal(label.tagName, "LABEL", control.dataset.daitPath);
            assert.equal(label.getAttribute("for"), control.id, control.dataset.daitPath);
            if (description) assert.equal(control.getAttribute("aria-describedby"), description.id, control.dataset.daitPath);
        }
        else {
            // Composite controls (the segmented radiogroup) are named with aria-labelledby.
            assert.equal(control.getAttribute("aria-labelledby"), label.id, control.dataset.daitPath);
        }
    });
    const ids = panel.querySelectorAll("[data-dait-path]").map(control => control.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, "control ids are unique even when a setting shows on two tabs");
    const switches = panel.querySelectorAll("input.dait-switch");
    assert.ok(switches.length > 20);
    switches.forEach(input => {
        assert.equal(input.getAttribute("role"), "switch");
        assert.ok(rowOf(input).classList.contains("dait-settings-row-switch"));
    });
});

test("action rows use a text label, so clicking the row text cannot press a button", t => {
    const { panel } = createShell(t);
    const actionButtons = ["historyBackfillRun", "exportSettingsSnapshot", "resetSettings"]
        .map(action => panel.querySelector(`[data-dait-action=${action}]`));
    const logActions = panel.querySelector(".dait-diagnostic-actions");
    const cacheActions = panel.querySelector(".dait-cache-actions");
    [...actionButtons, logActions, cacheActions].forEach(control => {
        const label = rowOf(control).querySelector(".dait-row-label");
        assert.equal(label.tagName, "SPAN", label.textContent);
        assert.equal(label.getAttribute("for"), null);
    });
    // Long values use the stacked field: label, full-width control, help below.
    ["translation.endpoint", "translation.model", "translation.apiKey", "ui.providerFallbackOrder"].forEach(path => {
        assert.ok(rowOf(panel.querySelector(`[data-dait-path='${path}']`)).classList.contains("dait-settings-row-stacked"), path);
    });
});

test("dependent rows sit under their switch, disabled with the reason while it is off", t => {
    const { plugin, panel } = createShell(t);
    const range = panel.querySelector("[data-dait-path='ui.autoTranslatePrefetchRange']");
    const limit = panel.querySelector("[data-dait-path='ui.historyBackfillLimit']");
    const run = panel.querySelector("[data-dait-action=historyBackfillRun]");
    const order = panel.querySelector("[data-dait-path='ui.providerFallbackOrder']");
    const hotkey = panel.querySelector(".dait-hotkey-recorder");
    [range, limit, run, order, hotkey].forEach(control => {
        assert.ok(rowOf(control).classList.contains("dait-settings-row-dependent"));
    });
    assert.equal(range.disabled, true);
    assert.equal(descriptionOf(range), "先开启“预翻译附近消息”");
    assert.ok(rowOf(range).classList.contains("dait-settings-row-inactive"));
    assert.equal(limit.disabled, true);
    assert.equal(run.disabled, true);
    assert.equal(allDisabled(order), true);
    // The hotkey switch is on by default, so the recorder is usable.
    assert.equal(hotkey.disabled, false);

    const prefetch = panel.querySelector("[data-dait-path='ui.autoTranslatePrefetch']");
    prefetch.checked = true;
    prefetch.dispatch("change");
    assert.equal(plugin.settings.ui.autoTranslatePrefetch, true);
    assert.equal(range.disabled, false);
    assert.equal(descriptionOf(range), plugin.t("autoTranslatePrefetchRangeDesc"));
    assert.equal(rowOf(range).classList.contains("dait-settings-row-inactive"), false);

    // A change made elsewhere (quick panel, reset) updates open rows too.
    plugin.setSetting("ui.historyBackfillEnabled", true);
    assert.equal(limit.disabled, false);
    assert.equal(run.disabled, false);
    plugin.setSetting("ui.enablePolishHotkey", false);
    assert.equal(hotkey.disabled, true);
    assert.equal(descriptionOf(hotkey), plugin.t("settingsRequiresParent", { parent: plugin.t("enableHotkey") }));
    assert.equal(descriptionOf(hotkey), "先开启“启用输入润色快捷键”");
});

test("a locked row keeps its reason even when its parent switch turns on", t => {
    const { plugin, panel } = createShell(t, { translationProvider: "sakuraLocal" });
    const order = panel.querySelector("[data-dait-path='ui.providerFallbackOrder']");
    assert.equal(allDisabled(order), true);
    assert.equal(descriptionOf(order), plugin.t("localFallbackUnavailable"));
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.syncSettingsDependentRows(panel);
    assert.equal(allDisabled(order), true);
    assert.equal(descriptionOf(order), plugin.t("localFallbackUnavailable"));
    plugin.setSetting("ui.providerFallbackOrder", "microsoft");
    assert.equal(allDisabled(order), true, "a re-render keeps the lock");
});

test("fallback services are an ordered list: tick to use, arrows to reorder, no typed ids", t => {
    const { plugin, panel, doc } = createShell(t, { tab: "advanced", ui: { providerFallbackEnabled: true, providerFallbackOrder: ["microsoft", "deepl"] } });
    const list = panel.querySelector("[data-dait-path='ui.providerFallbackOrder']");
    assert.equal(list.getAttribute("role"), "group");
    assert.equal(list.getAttribute("aria-labelledby"), rowOf(list).querySelector(".dait-row-label").id);
    const providers = () => list.querySelectorAll(".dait-order-item").map(item => item.dataset.daitProvider);
    const ticked = () => list.querySelectorAll(".dait-order-item").filter(item => item.querySelector(".dait-order-include").checked).map(item => item.dataset.daitProvider);
    const item = provider => list.querySelectorAll(".dait-order-item").find(node => node.dataset.daitProvider === provider);
    const button = (provider, part) => item(provider).querySelectorAll(".dait-order-move").find(node => node.dataset.daitMove === part);
    // Chosen services first in their order; local services are never offered.
    assert.deepEqual(providers(), ["microsoft", "deepl", "deepseek", "openaiCompatible", "googleCloud", "baidu"]);
    assert.deepEqual(ticked(), ["microsoft", "deepl"]);
    assert.equal(providers().includes("sakuraLocal"), false);
    assert.deepEqual(list.querySelectorAll(".dait-order-position").map(node => node.textContent), ["1", "2", "", "", "", ""]);
    // The current translation service is marked.
    assert.match(item("deepseek").querySelector(".dait-order-name").textContent, /当前服务/);
    // Each tick box is labelled by the service name; arrows name the service too.
    const include = item("baidu").querySelector(".dait-order-include");
    assert.equal(item("baidu").querySelector(".dait-order-name").getAttribute("for"), include.id);
    assert.equal(button("deepl", "up").getAttribute("aria-label"), "把 DeepL 上移");
    // Edge arrows are disabled.
    assert.equal(button("microsoft", "up").disabled, true);
    assert.equal(button("deepl", "down").disabled, true);
    assert.equal(button("baidu", "up").disabled, true, "unticked services have no position to move");

    include.checked = true;
    include.dispatch("change");
    assert.deepEqual(plugin.settings.ui.providerFallbackOrder, ["microsoft", "deepl", "baidu"]);
    assert.deepEqual(ticked(), ["microsoft", "deepl", "baidu"]);
    assert.equal(doc.activeElement, item("baidu").querySelector(".dait-order-include"), "focus stays on the service");

    button("baidu", "up").click();
    assert.deepEqual(plugin.settings.ui.providerFallbackOrder, ["microsoft", "baidu", "deepl"]);
    assert.equal(doc.activeElement, button("baidu", "up"));
    button("microsoft", "down").click();
    assert.deepEqual(plugin.settings.ui.providerFallbackOrder, ["baidu", "microsoft", "deepl"]);

    const untick = item("microsoft").querySelector(".dait-order-include");
    untick.checked = false;
    untick.dispatch("change");
    assert.deepEqual(plugin.settings.ui.providerFallbackOrder, ["baidu", "deepl"]);
    // Nothing to commit on close: the list saves as it changes.
    plugin.commitSettingsControls(panel);
    assert.deepEqual(plugin.settings.ui.providerFallbackOrder, ["baidu", "deepl"]);
    // Turning the switch off disables the whole list.
    plugin.setSetting("ui.providerFallbackEnabled", false);
    assert.equal(allDisabled(list), true);
    plugin.setSetting("ui.providerFallbackEnabled", true);
    assert.equal(button("baidu", "up").disabled, true, "edge arrows stay disabled after the switch comes back");
    assert.equal(button("baidu", "down").disabled, false);
});

test("segmented controls: radiogroup of radios, arrow keys choose, saved through setSetting", t => {
    const { plugin, panel, doc } = createShell(t, { tab: "display" });
    const position = panel.querySelector("[data-dait-path='ui.translationPosition']");
    assert.equal(position.getAttribute("role"), "radiogroup");
    const radios = position.querySelectorAll("[role=radio]");
    assert.deepEqual(radios.map(radio => radio.textContent), ["在原文上方", "在原文下方"]);
    assert.deepEqual(radios.map(radio => radio.getAttribute("aria-checked")), ["true", "false"]);
    assert.deepEqual(radios.map(radio => radio.getAttribute("tabindex")), ["0", "-1"]);
    position.dispatch("keydown", { key: "ArrowRight" });
    assert.equal(plugin.settings.ui.translationPosition, "after");
    assert.deepEqual(radios.map(radio => radio.getAttribute("aria-checked")), ["false", "true"]);
    assert.equal(doc.activeElement, radios[1]);
    position.dispatch("keydown", { key: "Home" });
    assert.equal(plugin.settings.ui.translationPosition, "before");
    radios[1].click();
    assert.equal(plugin.settings.ui.translationPosition, "after");
    // The value set elsewhere shows on the control.
    plugin.setSetting("ui.translationPosition", "before");
    assert.deepEqual(radios.map(radio => radio.getAttribute("aria-checked")), ["true", "false"]);

    // Channel rule: three choices; "always translate" stores 'enabled' for this channel.
    const rules = panel.querySelectorAll("[data-dait-path='ui.currentChannelAutoTranslatePolicy']");
    assert.equal(rules.length, 2, "overview and translate tab");
    assert.deepEqual(rules[0].querySelectorAll("[role=radio]").map(radio => radio.textContent), ["跟随总开关", "总是翻译", "不翻译"]);
    rules[0].querySelectorAll("[role=radio]")[1].click();
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:c1": { mode: "enabled" } });
    assert.deepEqual(rules[1].querySelectorAll("[role=radio]").map(radio => radio.getAttribute("aria-checked")), ["false", "true", "false"]);
});

test("segmented labels that do not fit the shared width make the row stacked", t => {
    const plugin = new Plugin();
    assert.equal(plugin.segmentedLabelsFit(["跟随总开关", "总是翻译", "不翻译"]), true);
    assert.equal(plugin.segmentedLabelsFit(["在原文上方", "在原文下方"]), true);
    assert.equal(plugin.segmentedLabelsFit(["Above original", "Below original"]), true);
    assert.equal(plugin.segmentedLabelsFit(["Follow main switch", "Always translate", "Never translate"]), false);
    const { panel } = createShell(t, { language: "en" });
    const rule = panel.querySelector("[data-dait-path='ui.currentChannelAutoTranslatePolicy']");
    assert.ok(rowOf(rule).classList.contains("dait-settings-row-stacked"));
    const position = panel.querySelector("[data-dait-path='ui.translationPosition']");
    assert.equal(rowOf(position).classList.contains("dait-settings-row-stacked"), false);
});

test("the model preset select follows the model field", t => {
    const { plugin, panel } = createShell(t, { tab: "translate" });
    const preset = panel.querySelector("[data-dait-model-preset=translation]");
    const model = panel.querySelector("[data-dait-path='translation.model']");
    assert.equal(preset.value, "deepseek-v4-flash");
    model.value = "my-own-model";
    model.dispatch("change");
    assert.equal(plugin.settings.translation.model, "my-own-model");
    assert.equal(preset.value, "", "custom");
    plugin.setSetting("translation.model", "deepseek-v4-pro");
    assert.equal(preset.value, "deepseek-v4-pro");
});

test("one select for the message Translate button maps onto injectMessageButtons + messageButtonVisibility", t => {
    const { plugin, panel } = createShell(t);
    const select = panel.querySelector("[data-dait-path='ui.messageButtonMode']");
    assert.deepEqual(select.options.map(option => option.textContent), ["悬停时显示", "一直显示", "不显示"]);
    assert.equal(select.value, "always");
    const choose = value => {
        select.value = value;
        select.dispatch("change");
        return [plugin.settings.ui.injectMessageButtons, plugin.settings.ui.messageButtonVisibility];
    };
    assert.deepEqual(choose("hover"), [true, "hover"]);
    assert.deepEqual(choose("off"), [false, "hover"]);
    assert.equal(plugin.getMessageButtonMode(), "off");
    assert.deepEqual(choose("always"), [true, "always"]);
    // Changing either stored setting elsewhere updates the select.
    plugin.setSetting("ui.injectMessageButtons", false);
    assert.equal(select.value, "off");
    plugin.setSetting("ui.injectMessageButtons", true);
    plugin.setSetting("ui.messageButtonVisibility", "hover");
    assert.equal(select.value, "hover");
    // Closing the window commits it without changing anything.
    plugin.commitSettingsControls(panel);
    assert.deepEqual([plugin.settings.ui.injectMessageButtons, plugin.settings.ui.messageButtonVisibility], [true, "hover"]);
});

test("header: title, version chip, live translation status, close; no static provider chip", t => {
    const { plugin, doc } = createShell(t);
    const panel = plugin.getSettingsPanel();
    doc.body.appendChild(panel);
    const header = panel.querySelector(".dait-settings-header");
    assert.equal(header.querySelector(".dait-settings-title").textContent, plugin.t("settingsTitle"));
    const version = header.querySelector(".dait-settings-version");
    assert.equal(version.dataset.daitVersion, require("../../package.json").version);
    assert.equal(version.textContent, `v${require("../../package.json").version}`);
    assert.equal(header.textContent.includes("DeepSeek V4"), false);
    const status = header.querySelector(".dait-api-status");
    assert.equal(status.dataset.daitKind, "translation");
    assert.equal(status.textContent, plugin.t("apiStatusUntested"));
    assert.equal(header.querySelector(".dait-settings-header-provider").textContent, "DeepSeek");
    plugin.setApiRuntimeStatus("translation", "success");
    assert.equal(status.className, "dait-api-status dait-api-status-success");
    assert.equal(status.textContent, plugin.t("apiStatusSuccess"));
    const close = header.querySelector(".dait-settings-close");
    assert.equal(close.getAttribute("aria-label"), plugin.t("settingsClose"));
    plugin.destroySettingsModalSizing(panel);
});

test("the close button closes the window that holds the panel", t => {
    const { plugin, doc } = createShell(t);
    // BetterDiscord's modal: its own footer button closes it.
    const modal = doc.body.appendChild(doc.createElement("div"));
    modal.setAttribute("role", "dialog");
    const content = modal.appendChild(doc.createElement("div"));
    const footer = modal.appendChild(doc.createElement("div"));
    const done = footer.appendChild(doc.createElement("button"));
    let doneClicks = 0;
    done.addEventListener("click", () => { doneClicks++; });
    const panel = plugin.getSettingsPanel();
    content.appendChild(panel);
    panel.querySelector(".dait-settings-close").click();
    assert.equal(doneClicks, 1);
    plugin.destroySettingsModalSizing(panel);

    // The plugin's own window closes through closeQuickSettingsPanel.
    const quickRoot = doc.body.appendChild(doc.createElement("div"));
    quickRoot.className = "dait-quick-settings-modal-root";
    const second = plugin.getSettingsPanel();
    quickRoot.appendChild(second);
    const closed = [];
    plugin.closeQuickSettingsPanel = (root, reason) => closed.push([root, reason]);
    second.querySelector(".dait-settings-close").click();
    assert.deepEqual(closed, [[quickRoot, "button"]]);
    plugin.destroySettingsModalSizing(second);
});

test("reset lives in the danger zone of the data tab and prefers the reset dialog", async t => {
    const { plugin, panel } = createShell(t);
    const dataTab = panel.querySelector("[data-dait-settings-tab-panel=data]");
    const zone = dataTab.querySelector(".dait-settings-danger-zone");
    assert.equal(dataTab.children[dataTab.children.length - 1], zone, "the last block of the data tab");
    assert.equal(zone.querySelector(".dait-settings-group-title").textContent, "危险操作");
    assert.equal(panel.querySelector(".dait-settings-rail").querySelector(".dait-small-button-danger"), null, "nothing destructive next to the tabs");
    const button = zone.querySelector("[data-dait-action=resetSettings]");
    let dialogCalls = 0;
    let resets = 0;
    let rebuilt = 0;
    plugin.resetSettingsToDefaults = () => { resets++; return true; };
    plugin.replaceSettingsPanelElement = () => { rebuilt++; return null; };
    plugin.openResetSettingsDialog = source => {
        dialogCalls++;
        assert.equal(source, button);
        return Promise.resolve(true);
    };
    button.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dialogCalls, 1);
    assert.equal(resets, 0, "the dialog does the reset");
    assert.equal(rebuilt, 1);

    // Without the dialog: confirm, then reset keeping credentials.
    delete plugin.openResetSettingsDialog;
    let keepCredentials = null;
    plugin.resetSettingsToDefaults = options => { keepCredentials = options.keepCredentials; return true; };
    globalThis.window.confirm = () => false;
    button.click();
    assert.equal(keepCredentials, null);
    globalThis.window.confirm = () => true;
    button.click();
    assert.equal(keepCredentials, true);
});

test("rebuilding the panel (provider or language change) keeps the tab, the scroll position and the focus", t => {
    const { plugin, panel, doc, state } = createShell(t, { tab: "translate" });
    state.content.scrollTop = 420;
    const provider = panel.querySelector("[data-dait-path='translation.provider']");
    provider.focus();
    provider.value = "sakuraLocal";
    provider.dispatch("change");
    const next = doc.body.querySelector(".dait-settings");
    assert.notEqual(next, panel);
    assert.equal(next.__daitSettingsUi.activeTab, "translate");
    assert.deepEqual(visibleTab(next), ["translate"]);
    assert.equal(next.__daitSettingsUi.content.scrollTop, 420);
    assert.equal(doc.activeElement.dataset.daitPath, "translation.provider");
    assert.equal(next.dataset.daitQuickSettings, "true", "a quick-settings panel is rebuilt as one");
    // The connection card now shows the local provider with its optional key collapsed.
    const card = next.querySelector(".dait-provider-settings-block");
    assert.equal(card.dataset.daitProvider, "sakuraLocal");
    const keyDetails = next.querySelector("[data-dait-path='translation.apiKey']").closest("details");
    assert.ok(keyDetails);
    assert.equal(keyDetails.open, false);
    plugin.destroySettingsModalSizing(next);
});

test("test mode tools appear under their switch without rebuilding the panel", t => {
    const { plugin, panel } = createShell(t, { tab: "data" });
    const toggle = panel.querySelector("[data-dait-path='ui.testModeEnabled']");
    toggle.checked = true;
    toggle.dispatch("change");
    const slot = panel.querySelector(".dait-test-mode-slot");
    assert.ok(slot.querySelector(".dait-test-mode-section"));
    assert.equal(panel.isConnected, true);
    toggle.checked = false;
    toggle.dispatch("change");
    assert.equal(slot.querySelector(".dait-test-mode-section"), null);
    assert.equal(plugin.settings.ui.testModeEnabled, false);
});

test("BetterDiscord's modal is widened to a moderate window, never 1280 px", t => {
    const doc = createDocument();
    useGlobals(t, { document: doc, window: { innerWidth: 1600, innerHeight: 1000 } });
    const plugin = new Plugin();
    const layer = doc.body.appendChild(doc.createElement("div"));
    const root = layer.appendChild(doc.createElement("div"));
    const content = root.appendChild(doc.createElement("div"));
    const panel = content.appendChild(doc.createElement("div"));
    layer.getBoundingClientRect = () => ({ width: 1600 });
    root.getBoundingClientRect = () => ({ width: 600 });
    content.getBoundingClientRect = () => ({ width: 576 });
    plugin.applySettingsModalSizing(panel);
    assert.equal(content.dataset.daitSettingsModal, "true");
    assert.equal(root.dataset.daitSettingsModalRoot, "true");
    assert.equal(layer.dataset.daitSettingsModal, undefined, "the full-width layer is left alone");
    plugin.cleanupSettingsModalSizing(panel);
    assert.equal(root.dataset.daitSettingsModalRoot, undefined);
});

test("styles: one control width, readable sizes, a 40x24 switch, focus ring and reduced motion", () => {
    const rule = selector => {
        const start = PLUGIN_CSS.indexOf(`
${selector} {`);
        assert.ok(start >= 0, selector);
        return PLUGIN_CSS.slice(start, PLUGIN_CSS.indexOf("}", start));
    };
    assert.match(PLUGIN_CSS, /--dait-control-w: 240px;/);
    // Selects, text/number inputs and segmented controls share the width, so their edges line up.
    assert.match(PLUGIN_CSS, /\.dait-row-control > select,\n\.dait-row-control > input:not\(\[type="checkbox"\]\),\n\.dait-row-control > \.dait-segmented,\n\.dait-row-control > \.dait-language-controls \{\n    width: var\(--dait-control-w\);/);
    assert.match(rule(".dait-settings-row"), /grid-template-columns: minmax\(0, 1fr\) auto;/);
    assert.match(rule(".dait-settings-row"), /column-gap: var\(--dait-space-5\);/);
    assert.match(rule(".dait-row-control"), /justify-content: flex-end;/);
    assert.match(rule(".dait-settings input.dait-switch"), /height: 24px;[\s\S]*width: 40px;/);
    assert.match(rule(".dait-segmented"), /height: var\(--dait-control-h\);/);
    assert.match(PLUGIN_CSS, /--dait-control-h: 32px;/);
    // Nothing in the settings stylesheet is smaller than 12 px.
    const settingsCss = require("../../src/css/04-settings.js");
    const sizes = [...settingsCss.matchAll(/font-size: (\d+)px/g)].map(match => Number(match[1]));
    assert.ok(sizes.length > 0);
    assert.ok(sizes.every(size => size >= 12), sizes.join(","));
    assert.equal([...settingsCss.matchAll(/font-weight: (\d+)/g)].every(match => [400, 500, 600, 700].includes(Number(match[1]))), true);
    assert.match(PLUGIN_CSS, /\.dait-settings :focus-visible,[\s\S]*?outline: 2px solid var\(--dait-focus\);/);
    assert.match(PLUGIN_CSS, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.dait-settings \*,[\s\S]*?transition: none !important;/);
    // The window is moderate: at most 920 px wide and 760 px high.
    assert.match(rule(".dait-settings"), /height: calc\(min\(760px, 100vh - 64px/);
    assert.match(PLUGIN_CSS, /width: min\(920px, calc\(100vw - 48px\)\) !important;/);
});
