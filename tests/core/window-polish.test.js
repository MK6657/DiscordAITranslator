"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");

// v0.4.0 window polish: the full settings window's size and single title bar, the stylesheet cleanup, language
// switching in place, and the launcher status details (configuration errors, last test's model and latency).

// ---------------------------------------------------------------------------------------------
// The fake DOM of settings-shell.test.js: elements with classes, attributes, data-* (through dataset), events,
// hidden, focus, closest/querySelectorAll for compound and descendant selectors, and select values.
// ---------------------------------------------------------------------------------------------

const dataKey = attribute => attribute.slice(5).replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

class FakeText {
    constructor(value) {
        this.nodeType = 3;
        this.nodeValue = String(value);
        this.parentNode = null;
    }
    get textContent() { return this.nodeValue; }
}


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

// A started plugin on the fake DOM with its unrelated side effects (saving, scanning, toasts) stubbed.
function createPlugin(t, setup = {}) {
    const { doc, win } = installDom(t);
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
    t.mock.method(console, "warn", () => {});
    t.mock.method(console, "info", () => {});
    t.after(() => {
        plugin.quickPanel?.destroy?.("test");
        plugin.isStarted = false;
    });
    return { plugin, doc, win };
}

const visibleTab = panel => panel.querySelectorAll("[role=tabpanel]").filter(tabpanel => !tabpanel.hidden).map(tabpanel => tabpanel.dataset.daitSettingsTabPanel);

function cssRule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // The rule whose whole selector is this one (not the last line of a selector list).
    return PLUGIN_CSS.match(new RegExp(`(?:^|[^,]\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`))?.[1] || "";
}

// --- The full settings window ---

test("the settings window has one title bar: the panel's title, status and close button, no header or footer of its own", t => {
    const { plugin, doc } = createPlugin(t);
    const root = plugin.openQuickSettingsPanel("test");
    const dialog = root.querySelector(".dait-quick-settings-dialog");
    assert.equal(dialog.getAttribute("role"), "dialog");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.equal(dialog.getAttribute("aria-label"), plugin.t("settingsTitle"));
    ["dait-quick-settings-header", "dait-quick-settings-title", "dait-quick-settings-footer", "dait-quick-settings-done"].forEach(name => {
        assert.ok(!root.querySelector(`.${name}`), name);
    });
    const body = dialog.querySelector(".dait-quick-settings-body");
    assert.equal(dialog.children.length, 1, "the panel fills the window");
    assert.ok(dialog.children[0] === body);
    const panel = body.querySelector(".dait-settings");
    assert.equal(body.children.length, 1);
    assert.ok(body.children[0] === panel);
    assert.equal(panel.dataset.daitQuickSettings, "true");
    const titles = root.querySelectorAll(".dait-settings-title");
    assert.equal(titles.length, 1);
    assert.equal(titles[0].textContent, plugin.t("settingsTitle"));
    assert.ok(panel.querySelector(".dait-settings-header .dait-api-status"), "the live status sits in the same title bar");
    const closes = root.querySelectorAll(".dait-settings-close");
    assert.equal(closes.length, 1);
    assert.ok(doc.activeElement === closes[0], "focus starts on the close button");
    closes[0].click();
    assert.ok(!doc.querySelector(".dait-quick-settings-modal-root"), "the panel's close button closes the window");
});

test("when the panel cannot be built, the error card carries the window's close button", t => {
    const { plugin, doc } = createPlugin(t);
    plugin.getSettingsPanel = () => { throw new Error("boom"); };
    const root = plugin.openQuickSettingsPanel("test");
    const card = root.querySelector(".dait-quick-settings-error");
    assert.ok(card);
    const done = card.querySelector(".dait-quick-settings-done");
    assert.equal(done.textContent, plugin.t("quickSettingsDone"));
    assert.ok(doc.activeElement === done);
    done.click();
    assert.ok(!doc.querySelector(".dait-quick-settings-modal-root"));
});

test("the window is a moderate size the panel fills, with no per-theme palette copies", () => {
    const dialog = cssRule(".dait-quick-settings-dialog");
    assert.match(dialog, /width: min\(920px, calc\(100vw - 48px\)\);/);
    assert.match(dialog, /height: min\(760px, calc\(100vh - 64px\)\);/);
    assert.match(dialog, /background: var\(--dait-bg\);/);
    assert.match(dialog, /border-radius: var\(--dait-radius-card\);/);
    const body = cssRule(".dait-quick-settings-body");
    assert.equal(body.includes("padding"), false, "the window adds no padding around the panel");
    assert.match(body, /min-height: 0;/);
    const panel = cssRule(".dait-quick-settings-body > .dait-settings");
    assert.match(panel, /flex: 1 1 auto;/);
    assert.match(panel, /height: auto;/);
    assert.match(panel, /min-height: 0;/);
    assert.equal(PLUGIN_CSS.includes("1280px"), false);
    assert.equal(PLUGIN_CSS.includes("--dait-quick-dialog-bg"), false);
    assert.equal(/\.theme-(dark|darker|midnight)\.dait-quick-settings-modal-root/.test(PLUGIN_CSS), false);
    ["header", "title", "footer", "close"].forEach(part => assert.equal(PLUGIN_CSS.includes(`.dait-quick-settings-${part} {`), false, part));
});

test("the v0.3.0 settings layout rules are gone from the stylesheet, and nothing in src still uses their classes", () => {
    const fs = require("node:fs");
    const path = require("node:path");
    const legacy = [
        "dait-settings-sidebar", "dait-settings-layout", "dait-settings-hero", "dait-settings-nav", "dait-settings-mark",
        "dait-section-", "dait-api-key-row", "dait-api-controls", "dait-settings-row-wide"
    ];
    const sources = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith(".js")) sources.push(fs.readFileSync(file, "utf8"));
    });
    walk(path.join(__dirname, "../../src"));
    legacy.forEach(name => {
        assert.equal(PLUGIN_CSS.includes(name), false, `${name} in the stylesheet`);
        assert.equal(sources.some(source => source.includes(name)), false, `${name} in src`);
    });
    assert.equal(PLUGIN_CSS.includes("@media (min-width: 760px)"), false);
    assert.equal(PLUGIN_CSS.includes("100vw - 28px"), false, "no width override for BetterDiscord's modal below 860 px");
    // The narrow-window rules that still match something stay.
    assert.match(PLUGIN_CSS, /@media \(max-width: 860px\) \{\n    \.dait-prompt-tools \{\n        grid-template-columns: 1fr;/);
});

test("the polish result panel reads the shared tokens instead of per-theme colour blocks", () => {
    const panel = cssRule(".dait-polish-result-panel");
    assert.match(panel, /background: var\(--dait-surface\);/);
    assert.match(panel, /border: 1px solid var\(--dait-divider\);/);
    assert.match(panel, /box-shadow: var\(--dait-shadow\);/);
    assert.match(panel, /color: var\(--dait-text\);/);
    const output = cssRule(".dait-polish-result-output");
    assert.match(output, /background: var\(--dait-input-bg\);/);
    assert.match(output, /color: var\(--dait-text\);/);
    assert.equal(/\.theme-(dark|darker|midnight)\.dait-polish-result-panel/.test(PLUGIN_CSS), false);
    assert.equal(/\.dait-polish-result-panel\[data-dait-discord-theme="(light|dark|darker|midnight)"\] \.dait-polish-result-output/.test(PLUGIN_CSS), false);
    [panel, output].forEach(rule => assert.equal(/#[0-9a-f]{3,8}\b|rgba?\(/i.test(rule), false, "no hard-coded colours"));
});

// --- Interface language ---

test("changing the interface language rebuilds the open settings window in place, on the same tab", t => {
    const { plugin, doc } = createPlugin(t, { tab: "overview" });
    const root = plugin.openQuickSettingsPanel("test");
    const panel = root.querySelector(".dait-settings");
    assert.equal(panel.dataset.daitLocale, "zh-CN");
    const select = panel.querySelector("[data-dait-path='ui.language']");
    select.focus();
    const getSettingsPanel = plugin.getSettingsPanel.bind(plugin);
    let builds = 0;
    plugin.getSettingsPanel = options => { builds++; return getSettingsPanel(options); };
    select.value = "en";
    select.dispatch("change");

    assert.equal(plugin.settings.ui.language, "en");
    assert.ok(doc.querySelector(".dait-quick-settings-modal-root") === root, "the window stays open");
    const next = root.querySelector(".dait-settings");
    assert.ok(next && next !== panel);
    assert.equal(builds, 1, "rebuilt once, not again by the language select");
    assert.equal(doc.querySelectorAll(".dait-settings").length, 1);
    assert.equal(next.dataset.daitLocale, "en");
    assert.equal(next.dataset.daitQuickSettings, "true");
    assert.equal(next.querySelector(".dait-settings-title").textContent, "Discord AI Translator");
    assert.equal(root.querySelector(".dait-quick-settings-dialog").getAttribute("aria-label"), "Discord AI Translator");
    assert.deepEqual(visibleTab(next), ["overview"]);
    assert.equal(doc.activeElement?.dataset?.daitPath, "ui.language", "focus stays on the language select");
    assert.equal(doc.activeElement.value, "en");

    // Nothing to do when every open panel already speaks the current language.
    assert.equal(plugin.refreshSettingsWindowsLocale(), 0);
    assert.equal(builds, 1);
});

test("a settings panel in BetterDiscord's own modal also switches language in place, once", t => {
    const { plugin, doc } = createPlugin(t, { tab: "overview" });
    const host = doc.body.appendChild(doc.createElement("div"));
    const panel = plugin.getSettingsPanel();
    host.appendChild(panel);
    const getSettingsPanel = plugin.getSettingsPanel.bind(plugin);
    let builds = 0;
    plugin.getSettingsPanel = options => { builds++; return getSettingsPanel(options); };
    const select = panel.querySelector("[data-dait-path='ui.language']");
    select.value = "en";
    select.dispatch("change");
    const next = host.querySelector(".dait-settings");
    assert.ok(next && next !== panel);
    assert.equal(builds, 1);
    assert.equal(next.dataset.daitLocale, "en");
    assert.equal(next.dataset.daitQuickSettings, undefined);
    assert.equal(next.querySelector(".dait-settings-title").textContent, "Discord AI Translator");
    plugin.destroySettingsModalSizing(next);
    plugin.destroySettingsModalSizing(panel);
});

test("changing the interface language re-renders the open quick panel in place", t => {
    const { plugin, doc } = createPlugin(t);
    const userPanel = doc.body.appendChild(doc.createElement("section"));
    const launcher = plugin.createQuickSettingsButton("panel", userPanel);
    userPanel.appendChild(launcher);
    launcher.getBoundingClientRect = () => ({ left: 200, top: 850, width: 32, height: 32, right: 232, bottom: 882 });
    plugin.openQuickPopover(launcher, { source: "test" });
    const before = doc.querySelector(".dait-quick-popover");
    assert.ok(before);
    const position = [before.style.left, before.style.top];
    const target = before.querySelector(".dait-qp-select");
    target.focus();

    plugin.setSetting("ui.language", "en");

    const popovers = doc.querySelectorAll(".dait-quick-popover");
    assert.equal(popovers.length, 1);
    const after = popovers[0];
    assert.ok(after !== before);
    assert.equal(before.isConnected, false);
    assert.equal(plugin.quickPanel.isOpen(), true, "still open");
    assert.equal(after.querySelector(".dait-qp-title").textContent, "AI Translator");
    assert.equal(after.querySelector(".dait-qp-footer-open-full").textContent, plugin.t("quickPanelOpenFull"));
    assert.deepEqual([after.style.left, after.style.top], position, "same place, although the launcher is being re-created");
    assert.ok(doc.activeElement === after.querySelector(".dait-qp-select"), "focus stays on the same control");

    // Keyboard handling moved to the new panel: Escape closes it.
    plugin.quickPanel.handleDocumentKeydown({ key: "Escape", preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    assert.ok(!doc.querySelector(".dait-quick-popover"));
});

// --- Launcher status ---

function statusPlugin(t, provider = "deepseek") {
    const context = createPlugin(t);
    const { plugin } = context;
    plugin.settings.translation.provider = provider;
    plugin.settings.translation.apiKey = "sk-fake-1";
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.translation.apiStatus = { state: "success", message: "" };
    context.options = () => plugin.getAutoTranslationOptions();
    return context;
}

const endpointError = code => Object.assign(new Error("API endpoint must be a valid absolute URL."), { code });
const httpError = (status, extra = {}) => Object.assign(new Error("API_ERROR"), { status, ...extra });

test("launcher status: an invalid or unsafe API URL needs the user until a test or request succeeds", t => {
    const { plugin, options } = statusPlugin(t);
    assert.equal(plugin.getLauncherStatus().state, "ok");

    const invalid = endpointError("INVALID_API_ENDPOINT");
    plugin.markAutoTranslationProviderFailure(options(), invalid);
    let status = plugin.getLauncherStatus();
    assert.equal(status.state, "needs-you");
    assert.equal(status.connection, plugin.getApiStatusText("failed"));
    assert.equal(status.activity, "需要处理：接口地址无效或不安全");
    assert.equal(status.title, "DeepSeek · 连接失败 · 需要处理：接口地址无效或不安全");
    assert.equal(status.note, plugin.formatError(invalid), "the localized error is the note");
    assert.equal(plugin.toasts.length, 0, "the toast rules are unchanged: no extra toast from the status");

    plugin.markAutoTranslationProviderFailure(options(), endpointError("UNSAFE_API_ENDPOINT"));
    assert.equal(plugin.getLauncherStatus().activity, "需要处理：接口地址无效或不安全");
    // A running test shows as busy, not as the error.
    plugin.settings.translation.apiStatus = { state: "testing", message: "" };
    assert.equal(plugin.getLauncherStatus().state, "busy");
    // The test passes: the error is over.
    plugin.setApiRuntimeStatus("translation", "success");
    assert.equal(plugin.getLauncherStatus().state, "ok");

    // In English.
    plugin.markAutoTranslationProviderFailure(options(), invalid);
    plugin.settings.ui.language = "en";
    assert.equal(plugin.getLauncherStatus().activity, "Needs attention: API URL invalid or unsafe");
    // A connection test from the settings (setApiStatus on the status badge) ends it too.
    const badge = { dataset: { daitKind: "translation" } };
    plugin.setApiStatus(badge, "success", "ok");
    assert.equal(plugin.getLauncherStatus().state, "ok");
});

test("launcher status: an unknown API URL or model (404, or a named unknown model) needs the user; fixing the settings ends it", async t => {
    const { plugin, options } = statusPlugin(t);
    plugin.markAutoTranslationProviderFailure(options(), httpError(404));
    let status = plugin.getLauncherStatus();
    assert.equal(status.state, "needs-you");
    assert.equal(status.activity, "需要处理：找不到接口地址或模型");
    assert.match(status.note, /404/);

    // A different model is a different configuration: the old error no longer shows.
    const model = plugin.settings.translation.model;
    plugin.settings.translation.model = "deepseek-other-fake";
    assert.equal(plugin.getLauncherStatus().state, "ok");
    plugin.settings.translation.model = model;
    assert.equal(plugin.getLauncherStatus().state, "needs-you", "the same broken settings still need the user");

    // A working request with these settings ends it.
    plugin.providerLayer.runModelTaskWithResult = async () => ({ text: "ok" });
    await plugin.runModelTaskWithResult("translation", "hello", options());
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(plugin.getLauncherStatus().state, "ok");

    // A 400 that names an unknown model counts too; a failed request does not end it.
    plugin.markAutoTranslationProviderFailure(options(), httpError(400, { providerModelNotFound: true }));
    assert.equal(plugin.getLauncherStatus().activity, "需要处理：找不到接口地址或模型");
    plugin.providerLayer.runModelTaskWithResult = async () => { throw httpError(404); };
    await assert.rejects(plugin.runModelTaskWithResult("translation", "hello", options()));
    assert.equal(plugin.getLauncherStatus().state, "needs-you");
});

test("launcher status: other failures and other services are not configuration errors", t => {
    const { plugin, options } = statusPlugin(t);
    const quickPanel = plugin.quickPanel;
    [httpError(429), httpError(500), httpError(401), Object.assign(new Error("timeout"), { code: "REQUEST_TIMEOUT" }), Object.assign(httpError(404), { name: "AbortError" })]
        .forEach(error => assert.equal(quickPanel.noteRequestFailure(options(), error), false, String(error.status || error.code)));
    // A fallback service answering 404 does not mark the configured one.
    const fallback = { configOverrides: { ...plugin.settings.translation, provider: "openai", endpoint: "https://api.example.invalid/v1/chat/completions" } };
    plugin.markAutoTranslationProviderFailure(fallback, httpError(404));
    assert.equal(plugin.getLauncherStatus().state, "ok");
    // Polish requests never touch the translation status.
    plugin.markAutoTranslationProviderFailure(options(), httpError(404));
    plugin.setApiRuntimeStatus("polish", "success");
    assert.equal(plugin.getLauncherStatus().state, "needs-you");
});

test("the status detail shows the last passed test's model and response time when the provider layer reports it", t => {
    const { plugin } = statusPlugin(t, "sakuraLocal");
    let status = plugin.getLauncherStatus();
    assert.equal(status.detail, "本频道自动翻译中", "without getLastApiTestResult the detail is the activity");

    let result = { ok: true, model: "Hy-MT2", latencyMs: 820.4, at: Date.now() };
    plugin.getLastApiTestResult = kind => kind === "translation" ? result : null;
    status = plugin.getLauncherStatus();
    assert.equal(status.detail, "Hy-MT2 · 820 ms · 本频道自动翻译中");
    assert.equal(status.title, "Sakura 本地 · 连接正常 · 本频道自动翻译中", "the launcher tooltip stays short");

    // Machine translation services have no model name.
    result = { ok: true, model: "", latencyMs: 95, at: Date.now() };
    assert.equal(plugin.getLauncherStatus().detail, "95 ms · 本频道自动翻译中");
    result = { ok: true, model: "Hy-MT2", at: Date.now() };
    assert.equal(plugin.getLauncherStatus().detail, "Hy-MT2 · 本频道自动翻译中");

    // A failed test, or settings changed since the test (the status is no longer "connected"), show nothing.
    result = { ok: false, model: "Hy-MT2", latencyMs: 820, at: Date.now() };
    assert.equal(plugin.getLauncherStatus().detail, "本频道自动翻译中");
    result = { ok: true, model: "Hy-MT2", latencyMs: 820, at: Date.now() };
    plugin.settings.translation.apiStatus = { state: "untested", message: "" };
    assert.equal(plugin.getLauncherStatus().detail, "本频道自动翻译中");
    plugin.settings.translation.apiStatus = { state: "success", message: "" };

    // Busy and off keep it; "needs you" shows the problem instead.
    plugin.settings.ui.autoTranslateMessages = false;
    assert.equal(plugin.getLauncherStatus().detail, "Hy-MT2 · 820 ms · 本频道不自动翻译");
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), httpError(404));
    assert.equal(plugin.getLauncherStatus().detail, "需要处理：找不到接口地址或模型");
    plugin.setApiRuntimeStatus("translation", "success");

    plugin.settings.ui.language = "en";
    assert.equal(plugin.getLauncherStatus().detail, "Hy-MT2 · 820 ms · Auto-translating in this channel");
    plugin.getLastApiTestResult = () => { throw new Error("not ready"); };
    assert.equal(plugin.getLauncherStatus().detail, "Auto-translating in this channel");
});

test("the open quick panel shows the test summary in its status detail", t => {
    const { plugin, doc } = statusPlugin(t, "sakuraLocal");
    plugin.getLastApiTestResult = () => ({ ok: true, model: "Hy-MT2", latencyMs: 820, at: Date.now() });
    const userPanel = doc.body.appendChild(doc.createElement("section"));
    const launcher = plugin.createQuickSettingsButton("panel", userPanel);
    userPanel.appendChild(launcher);
    plugin.openQuickPopover(launcher, { source: "test" });
    const popover = doc.querySelector(".dait-quick-popover");
    assert.equal(popover.querySelector(".dait-qp-status-detail").textContent, "Hy-MT2 · 820 ms · 本频道自动翻译中");
    assert.equal(popover.querySelector(".dait-qp-status-line").textContent, "Sakura 本地 · 连接正常");
});
