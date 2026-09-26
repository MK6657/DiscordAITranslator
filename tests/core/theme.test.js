"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");
const { I18N } = require("../../src/i18n");
const { DEFAULT_SETTINGS } = require("../../src/constants");
const { normalizePanelTheme, parseComputedColor, PANEL_THEME_ROOT_SELECTOR } = require("../../src/settings/panel-theme");

// v0.4.0 theme follow-up (THEME-SPEC): the plugin's own windows get one complete light or dark palette from
// data-dait-panel-theme (ui.panelTheme: auto / light / dark) instead of stitching Discord variables together, and
// one type scale. The user's report: in Discord's light theme the settings window drew every input and select with a
// near-black background and dark-grey text, because --dait-input-bg fell back to a hard-coded dark colour when
// Discord's --input-background/--background-tertiary were missing, while the text and window colours came from the
// light variables.

// ---------------------------------------------------------------------------------------------
// The fake DOM of settings-shell.test.js / window-polish.test.js.
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
    dispatch(type, init = {}) {
        const event = {
            type,
            target: this,
            defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() {},
            stopImmediatePropagation() {},
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

// prefers-color-scheme as the test sets it; "change" listeners can be fired.
function createMediaQueries(state) {
    return query => {
        const listeners = new Set();
        const result = {
            media: query,
            get matches() { return /prefers-color-scheme:\s*light/.test(query) ? state.system === "light" : state.system === "dark"; },
            addEventListener(type, handler) { if (type === "change") listeners.add(handler); },
            removeEventListener(type, handler) { listeners.delete(handler); }
        };
        state.queries.push({ result, listeners });
        return result;
    };
}

function createWindow(media) {
    const listeners = [];
    return {
        listeners,
        innerWidth: 1280,
        innerHeight: 900,
        matchMedia: createMediaQueries(media),
        addEventListener(type, handler, options) { listeners.push({ type, handler, capture: options === true }); },
        removeEventListener(type, handler) {
            const index = listeners.findIndex(item => item.type === type && item.handler === handler);
            if (index >= 0) listeners.splice(index, 1);
        },
        confirm: () => true
    };
}

// A MutationObserver the test can drive: observe() records the targets, fire() runs the callback.
class FakeMutationObserver {
    constructor(callback) {
        this.callback = callback;
        this.targets = [];
        FakeMutationObserver.instances.push(this);
    }
    observe(target, options) { this.targets.push({ target, options }); }
    disconnect() { this.targets = []; this.disconnected = true; }
    fire(records = []) { this.callback(records, this); }
}
FakeMutationObserver.instances = [];

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

// A started plugin on the fake DOM. discord: the class on <html> ("theme-light", "theme-dark theme-midnight", "").
function createPlugin(t, setup = {}) {
    const doc = createDocument();
    const media = { system: setup.system || "dark", queries: [] };
    const win = createWindow(media);
    FakeMutationObserver.instances = [];
    useGlobals(t, { document: doc, window: win, MutationObserver: FakeMutationObserver });
    if (setup.discord !== undefined) doc.root.className = setup.discord;
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.flushSettings = () => true;
    plugin.queueScan = () => {};
    plugin.showToast = () => {};
    plugin.warnSanitized = () => {};
    plugin.getCurrentRouteKey = () => "g1:c1:";
    plugin.settings.ui.language = setup.language || "zh-CN";
    if (setup.panelTheme) plugin.settings.ui.panelTheme = setup.panelTheme;
    if (setup.tab) plugin.settings.ui.settingsActiveTab = setup.tab;
    t.mock.method(console, "warn", () => {});
    t.mock.method(console, "info", () => {});
    t.after(() => {
        plugin.quickPanel?.destroy?.("test");
        plugin.panelTheme.stopWatching();
        plugin.isStarted = false;
    });
    return { plugin, doc, win, media };
}

// A React stand-in: createElement keeps the element tree, so the dialog content's props can be read.
const FakeReact = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: value => [value, () => {}]
};

function openAllWindows(plugin, doc) {
    const bdHost = doc.body.appendChild(doc.createElement("div"));
    const bdPanel = bdHost.appendChild(plugin.getSettingsPanel());
    const windowRoot = plugin.openQuickSettingsPanel("test");
    const windowPanel = windowRoot.querySelector(".dait-settings");
    const userPanel = doc.body.appendChild(doc.createElement("section"));
    const launcher = plugin.createQuickSettingsButton("panel", userPanel);
    userPanel.appendChild(launcher);
    const popover = plugin.openQuickPopover(launcher, { source: "test" });
    const textbox = doc.body.appendChild(doc.createElement("div"));
    plugin.showPolishResultPanel(textbox, "polished text", { allowApply: true });
    const polish = doc.querySelector(".dait-polish-result-panel");
    const group = doc.body.appendChild(doc.createElement("div"));
    const menuButton = group.appendChild(doc.createElement("button"));
    plugin.openInputActionMenu(group, null, group, menuButton);
    const menu = doc.querySelector(".dait-input-action-menu");
    return { bdPanel, windowRoot, windowPanel, popover, polish, menu };
}

// ---------------------------------------------------------------------------------------------
// A small CSS reader: the flattened rules of the plugin stylesheet, and custom-property resolution for a window root.
// ---------------------------------------------------------------------------------------------

function cssRules(css = PLUGIN_CSS) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const rules = [];
    const walk = (source, context = "") => {
        let index = 0;
        while (index < source.length) {
            const open = source.indexOf("{", index);
            if (open < 0) break;
            const prelude = source.slice(index, open).trim();
            let depth = 1;
            let cursor = open + 1;
            while (cursor < source.length && depth > 0) {
                if (source[cursor] === "{") depth++;
                else if (source[cursor] === "}") depth--;
                cursor++;
            }
            const body = source.slice(open + 1, cursor - 1);
            if (/^@(media|container|supports)/.test(prelude)) walk(body, prelude);
            else if (!prelude.startsWith("@")) rules.push({ selector: prelude, body, context });
            index = cursor;
        }
    };
    walk(text);
    return rules;
}

function declarations(body) {
    const values = new Map();
    body.split(";").forEach(part => {
        const colon = part.indexOf(":");
        if (colon < 0) return;
        values.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim());
    });
    return values;
}

// The custom properties a window root ends up with: Discord's variables (inherited from the page) first, then every
// plugin rule whose selector list names the root the way it is marked (class and data-dait-panel-theme).
function panelTokens(rootSelectors, discordVariables = {}) {
    const tokens = new Map(Object.entries(discordVariables));
    cssRules().forEach(rule => {
        if (rule.context) return;
        const selectors = rule.selector.split(",").map(item => item.trim());
        if (!selectors.some(selector => rootSelectors.includes(selector))) return;
        declarations(rule.body).forEach((value, name) => { if (name.startsWith("--")) tokens.set(name, value); });
    });
    const resolve = (value, depth = 0) => {
        if (depth > 20) throw new Error(`var() loop in ${value}`);
        return String(value).replace(/var\((--[\w-]+)(?:,\s*((?:[^()]|\([^()]*(?:\([^()]*\))*[^()]*\))*))?\)/g, (match, name, fallback) => {
            if (tokens.has(name) && tokens.get(name) !== "initial") return resolve(tokens.get(name), depth + 1);
            if (fallback !== undefined) return resolve(fallback.trim(), depth + 1);
            return "<unset>";
        });
    };
    return name => resolve(tokens.get(name) ?? "<unset>");
}

function luminance(hex) {
    const value = hex.replace("#", "");
    const channels = [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255)
        .map(channel => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a, b) {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
}

// Discord's refreshed light theme as the user had it: light page variables, but no --input-background and no
// --background-tertiary (so the old token layer fell back to #1e1f22), plus a dark part of Discord whose variables
// the old code could copy onto the window.
const LIGHT_PAGE_WITHOUT_INPUT_VARIABLES = {
    "--background-base-low": "#ffffff",
    "--background-base-lower": "#f2f3f5",
    "--background-primary": "#ffffff",
    "--background-secondary": "#f2f3f5",
    "--text-default": "#313338",
    "--text-normal": "#313338",
    "--header-primary": "#060607",
    "--input-background": "initial",
    "--background-tertiary": "initial",
    "--background-base-lowest": "initial"
};
const DARK_REGION_VARIABLES = {
    "--background-base-low": "#313338",
    "--background-primary": "#313338",
    "--input-background": "#1e1f22",
    "--background-tertiary": "#1e1f22",
    "--text-default": "#dbdee1",
    "--text-normal": "#dbdee1"
};

// --- The reported bug, kept as a regression test ---

test("regression: Discord's light theme without --input-background no longer gives the settings window dark inputs", () => {
    const root = [".dait-settings", '[data-dait-panel-theme="light"]'];
    for (const discord of [LIGHT_PAGE_WITHOUT_INPUT_VARIABLES, { ...LIGHT_PAGE_WITHOUT_INPUT_VARIABLES, ...DARK_REGION_VARIABLES }]) {
        const token = panelTokens(root, discord);
        assert.equal(token("--dait-bg"), "#ffffff");
        assert.equal(token("--dait-input-bg"), "#ffffff", "inputs and selects are light");
        assert.equal(token("--dait-text"), "#2e3035");
        assert.ok(contrast(token("--dait-text"), token("--dait-input-bg")) >= 7, "control text reads at 7:1");
        assert.ok(contrast(token("--dait-placeholder"), token("--dait-input-bg")) >= 4.5, "placeholders read at 4.5:1");
    }
    // The same page in the dark palette: one coherent set too.
    const dark = panelTokens([".dait-settings", '[data-dait-panel-theme="dark"]'], LIGHT_PAGE_WITHOUT_INPUT_VARIABLES);
    assert.equal(dark("--dait-bg"), "#2b2d31");
    assert.equal(dark("--dait-input-bg"), "#1e1f22");
    assert.equal(dark("--dait-text"), "#e3e5e8");
});

test("regression: a light Discord page resolves every plugin window to the light palette, whatever the launcher's area says", t => {
    const { plugin, doc } = createPlugin(t, { discord: "theme-light" });
    // The launcher's part of Discord is themed dark (Discord's refreshed UI can do that); it must not matter.
    const sidebar = doc.body.appendChild(doc.createElement("div"));
    sidebar.className = "theme-dark";
    const windows = openAllWindows(plugin, doc);
    Object.entries(windows).forEach(([name, node]) => {
        assert.equal(node.dataset.daitPanelTheme, "light", name);
        assert.equal(node.dataset.daitDiscordTheme, undefined, `${name} carries no Discord theme marker`);
        ["--input-background", "--background-tertiary", "--text-normal", "--background-primary"].forEach(variable => {
            assert.equal(node.style.getPropertyValue(variable), "", `${name} gets no copied ${variable}`);
        });
        ["theme-light", "theme-dark"].forEach(themeClass => assert.equal(node.classList.contains(themeClass), false, `${name} ${themeClass}`));
    });
});

// --- Theme resolution ---

test("auto follows Discord's theme classes and data-theme on <html> or <body>", t => {
    const { plugin, doc } = createPlugin(t);
    const cases = [
        ["theme-light", "light"],
        ["theme-dark", "dark"],
        ["theme-darker", "dark"],
        ["theme-midnight", "dark"],
        ["theme-dark theme-midnight", "dark"],
        ["theme-dark theme-darker", "dark"],
        ["visual-refresh theme-light font-size-16", "light"]
    ];
    for (const [className, expected] of cases) {
        doc.root.className = className;
        assert.equal(plugin.resolvePanelTheme(), expected, `<html class="${className}">`);
    }
    doc.root.className = "";
    doc.body.className = "theme-light";
    assert.equal(plugin.resolvePanelTheme(), "light", "<body> counts when <html> says nothing");
    doc.body.className = "";
    doc.root.dataset.theme = "light";
    assert.equal(plugin.resolvePanelTheme(), "light", "data-theme");
    doc.root.dataset.theme = "midnight";
    assert.equal(plugin.resolvePanelTheme(), "dark");
    delete doc.root.dataset.theme;
    // Classes that merely contain "light" or "dark" are not themes.
    doc.root.className = "highlight-dark-links lightbox";
    assert.equal(plugin.panelTheme.getDiscordTheme(), "");
});

test("auto without a Discord theme follows prefers-color-scheme; a missing matchMedia means dark", t => {
    const { plugin, doc, win, media } = createPlugin(t, { system: "light" });
    doc.root.className = "";
    assert.equal(plugin.resolvePanelTheme(), "light");
    media.system = "dark";
    assert.equal(plugin.resolvePanelTheme(), "dark");
    win.matchMedia = undefined;
    assert.equal(plugin.resolvePanelTheme(), "dark");
    // Discord's own theme wins over the system.
    win.matchMedia = createMediaQueries({ system: "light", queries: [] });
    doc.root.className = "theme-dark";
    assert.equal(plugin.resolvePanelTheme(), "dark");
});

test("an explicit light or dark choice overrides Discord's theme", t => {
    const { plugin, doc } = createPlugin(t, { discord: "theme-dark" });
    plugin.settings.ui.panelTheme = "light";
    assert.equal(plugin.resolvePanelTheme(), "light");
    doc.root.className = "theme-light";
    plugin.settings.ui.panelTheme = "dark";
    assert.equal(plugin.resolvePanelTheme(), "dark");
    plugin.settings.ui.panelTheme = "auto";
    assert.equal(plugin.resolvePanelTheme(), "light");
});

test("ui.panelTheme: default auto, normalized on load and on change", t => {
    assert.equal(DEFAULT_SETTINGS.ui.panelTheme, "auto");
    assert.equal(normalizePanelTheme("LIGHT"), "light");
    assert.equal(normalizePanelTheme(" dark "), "dark");
    assert.equal(normalizePanelTheme("sepia"), "auto");
    assert.equal(normalizePanelTheme(undefined), "auto");
    const { plugin } = createPlugin(t);
    plugin.settings.ui.panelTheme = "purple";
    plugin.ensureSettingsShape();
    assert.equal(plugin.settings.ui.panelTheme, "auto");
    delete plugin.settings.ui.panelTheme;
    plugin.ensureSettingsShape();
    assert.equal(plugin.settings.ui.panelTheme, "auto");
    plugin.setSetting("ui.panelTheme", "Dark");
    assert.equal(plugin.settings.ui.panelTheme, "dark");
    plugin.setSetting("ui.panelTheme", 42);
    assert.equal(plugin.settings.ui.panelTheme, "auto");
});

// --- The attribute on every plugin window ---

test("every plugin window root carries data-dait-panel-theme", t => {
    const { plugin, doc } = createPlugin(t, { discord: "theme-dark theme-midnight" });
    const windows = openAllWindows(plugin, doc);
    Object.entries(windows).forEach(([name, node]) => assert.equal(node.dataset.daitPanelTheme, "dark", name));
    // Each of them is one of the roots the refresh looks for.
    Object.entries(windows).forEach(([name, node]) => assert.ok(node.matches(PANEL_THEME_ROOT_SELECTOR), name));
    // BetterDiscord's modal frame around the panel keeps Discord's own look: no palette, no copied variables.
    const frame = windows.bdPanel.parentElement;
    frame.getBoundingClientRect = () => ({ width: 700 });
    plugin.applySettingsModalSizing(windows.bdPanel);
    assert.equal(frame.dataset.daitSettingsModal, "true");
    assert.equal(frame.dataset.daitPanelTheme, undefined);
    assert.equal(frame.dataset.daitDiscordTheme, undefined);
    assert.equal(frame.style.getPropertyValue("--background-primary"), "");
});

// Discord's modal around dialog content: the layer's backdrop, the modal (background as given) and the content
// wrapper (transparent), with getComputedStyle reading the inline backgrounds.
function mountInModal(doc, win, props, modalBackground) {
    win.getComputedStyle = element => ({ backgroundColor: element.style.getPropertyValue("background-color") || "rgba(0, 0, 0, 0)" });
    const layer = doc.body.appendChild(doc.createElement("div"));
    layer.style.setProperty("background-color", "rgba(0, 0, 0, 0.7)");
    const modal = layer.appendChild(doc.createElement("div"));
    modal.setAttribute("role", "dialog");
    if (modalBackground) modal.style.setProperty("background-color", modalBackground);
    const wrapper = modal.appendChild(doc.createElement("div"));
    const node = wrapper.appendChild(doc.createElement("div"));
    Object.entries(props).forEach(([name, value]) => {
        if (name === "className") node.className = value;
        else if (name !== "ref") node.setAttribute(name, value);
    });
    props.ref(node);
    return { node, modal, layer };
}

test("dialog content takes the palette of Discord's modal around it, whatever the window theme says", t => {
    const { plugin, doc, win } = createPlugin(t, { discord: "theme-light" });
    useGlobals(t, { BdApi: { React: FakeReact } });
    let content = plugin.createConfirmDialogContent(["Delete the template?"], "preview text");
    assert.equal(content.props.className, "dait-dialog");
    assert.equal(content.props["data-dait-panel-theme"], "light", "before it is mounted: Discord's theme");
    assert.equal(content.props["data-dait-dialog-surface"], undefined, "no box inside the modal");
    assert.equal(typeof content.props.ref, "function");
    const resetBody = plugin.createResetDialogContent(FakeReact, { keepCredentials: true }).type();
    assert.equal(resetBody.props.className, "dait-dialog");
    assert.equal(resetBody.props["data-dait-panel-theme"], "light");
    assert.equal(typeof resetBody.props.ref, "function");

    // An explicit dark choice does not turn the content into a dark box inside Discord's light modal.
    plugin.settings.ui.panelTheme = "dark";
    content = plugin.createConfirmDialogContent(["Delete the template?"]);
    assert.equal(content.props["data-dait-panel-theme"], "light");
    assert.equal(content.props["data-dait-dialog-surface"], undefined);
    const light = mountInModal(doc, win, content.props, "rgb(255, 255, 255)");
    assert.equal(light.node.dataset.daitPanelTheme, "light");
    assert.equal(light.node.getAttribute("data-dait-dialog-surface"), null);

    // Once mounted it goes by the modal's real background: a dark modal on a page whose class says light (a themed
    // region, a client theme) gets the dark palette, so the text is never dark on dark.
    const dark = mountInModal(doc, win, plugin.createConfirmDialogContent(["x"]).props, "rgb(49, 51, 56)");
    assert.equal(dark.node.dataset.daitPanelTheme, "dark");
    assert.equal(dark.node.getAttribute("data-dait-dialog-surface"), null);
    const resetDark = mountInModal(doc, win, plugin.createResetDialogContent(FakeReact, { keepCredentials: true }).type().props, "#313338");
    assert.equal(resetDark.node.dataset.daitPanelTheme, "dark", "a modal background the parser cannot read is skipped: the layer's dark backdrop decides");
});

test("dialog content without a Discord theme or a readable modal background brings its own background", t => {
    // No theme class anywhere, the system says light, Discord's modal is dark (the audit's case a).
    const { plugin, doc, win, media } = createPlugin(t, { discord: "", system: "light" });
    useGlobals(t, { BdApi: { React: FakeReact } });
    const props = plugin.createConfirmDialogContent(["Delete the template?"]).props;
    assert.equal(props["data-dait-panel-theme"], "light", "before it is mounted: the resolved palette");
    assert.equal(props["data-dait-dialog-surface"], "true", "…on its own background, so it reads on any modal");
    const { node } = mountInModal(doc, win, props, "rgb(49, 51, 56)");
    assert.equal(node.dataset.daitPanelTheme, "dark", "mounted: the modal's palette");
    assert.equal(node.getAttribute("data-dait-dialog-surface"), null);

    // Neither palette reads on a mid-grey modal: the content keeps its own background.
    const grey = mountInModal(doc, win, plugin.createConfirmDialogContent(["x"]).props, "rgb(128, 128, 128)");
    assert.equal(grey.node.getAttribute("data-dait-dialog-surface"), "true");
    // No background to read at all (every ancestor transparent, or no getComputedStyle): its own background in
    // the resolved palette.
    const bare = doc.body.appendChild(doc.createElement("div"));
    win.getComputedStyle = () => ({ backgroundColor: "rgba(0, 0, 0, 0)" });
    plugin.syncDialogPanelTheme(bare.appendChild(Object.assign(doc.createElement("div"), { className: "dait-dialog" })));
    assert.equal(bare.children[0].dataset.daitPanelTheme, "light");
    assert.equal(bare.children[0].getAttribute("data-dait-dialog-surface"), "true");
    delete win.getComputedStyle;
    media.system = "dark";
    plugin.syncDialogPanelTheme(bare.children[0]);
    assert.equal(bare.children[0].dataset.daitPanelTheme, "dark");
    assert.equal(bare.children[0].getAttribute("data-dait-dialog-surface"), "true");
    const surface = cssRules().find(rule => rule.selector === '.dait-dialog[data-dait-dialog-surface="true"]');
    assert.ok(surface, "the dialog surface rule exists");
    assert.match(surface.body, /background: var\(--dait-bg\);/);
});

test("open dialog content follows its modal when the window theme or Discord's theme changes", t => {
    const { plugin, doc, win } = createPlugin(t, { discord: "theme-dark" });
    useGlobals(t, { BdApi: { React: FakeReact } });
    plugin.panelTheme.startWatching();
    const observer = FakeMutationObserver.instances.at(-1);
    const { node, modal } = mountInModal(doc, win, plugin.createResetDialogContent(FakeReact, { keepCredentials: true }).type().props, "rgb(49, 51, 56)");
    assert.equal(node.dataset.daitPanelTheme, "dark");
    // The window theme changes while the dialog is open (audit case b): the other windows restyle, the dialog
    // content still matches Discord's dark modal and gains no box.
    plugin.setSetting("ui.panelTheme", "light");
    assert.equal(node.dataset.daitPanelTheme, "dark");
    assert.equal(node.getAttribute("data-dait-dialog-surface"), null);
    // Discord switches to light: the modal turns white and the content follows, though the window theme (an
    // explicit "light") did not change.
    doc.root.className = "theme-light";
    modal.style.setProperty("background-color", "rgb(255, 255, 255)");
    observer.fire([{ type: "attributes", attributeName: "class", target: doc.root }]);
    assert.equal(node.dataset.daitPanelTheme, "light");
    plugin.setSetting("ui.panelTheme", "dark");
    assert.equal(node.dataset.daitPanelTheme, "light", "still the modal's palette");
    assert.equal(node.getAttribute("data-dait-dialog-surface"), null);
    // The plugin's own Discord observer path re-checks it too.
    doc.root.className = "theme-dark";
    modal.style.setProperty("background-color", "rgb(49, 51, 56)");
    plugin.refreshDiscordThemeClasses();
    assert.equal(node.dataset.daitPanelTheme, "dark");
});

test("computed background colours are read in the forms browsers report", () => {
    assert.deepEqual(parseComputedColor("rgb(49, 51, 56)"), { rgb: [49, 51, 56], alpha: 1 });
    assert.deepEqual(parseComputedColor("rgba(0, 0, 0, 0)"), { rgb: [0, 0, 0], alpha: 0 });
    assert.deepEqual(parseComputedColor("rgb(255 255 255 / 50%)"), { rgb: [255, 255, 255], alpha: 0.5 });
    assert.deepEqual(parseComputedColor("transparent"), { rgb: [0, 0, 0], alpha: 0 });
    assert.deepEqual(parseComputedColor("color(srgb 1 1 1)"), { rgb: [255, 255, 255], alpha: 1 });
    assert.equal(parseComputedColor("oklch(0.5 0.1 200)"), null);
    assert.equal(parseComputedColor("#313338"), null);
});

// --- Live restyling ---

test("changing the setting restyles every open window in place, without rebuilding it", t => {
    const { plugin, doc } = createPlugin(t, { discord: "theme-light" });
    const windows = openAllWindows(plugin, doc);
    let builds = 0;
    const getSettingsPanel = plugin.getSettingsPanel.bind(plugin);
    plugin.getSettingsPanel = options => { builds++; return getSettingsPanel(options); };
    Object.values(windows).forEach(node => assert.equal(node.dataset.daitPanelTheme, "light"));
    plugin.setSetting("ui.panelTheme", "dark");
    Object.entries(windows).forEach(([name, node]) => {
        assert.equal(node.dataset.daitPanelTheme, "dark", name);
        assert.ok(node.isConnected, `${name} is the same element, still open`);
    });
    assert.equal(builds, 0, "no panel was rebuilt");
    assert.ok(doc.querySelector(".dait-quick-popover") === windows.popover);
    plugin.setSetting("ui.panelTheme", "auto");
    Object.values(windows).forEach(node => assert.equal(node.dataset.daitPanelTheme, "light"));
    // A reset back to the defaults restyles too.
    plugin.setSetting("ui.panelTheme", "dark");
    plugin.resetSettingsToDefaults({ keepCredentials: true });
    assert.equal(plugin.settings.ui.panelTheme, "auto");
    assert.equal(windows.popover.dataset.daitPanelTheme, "light");
});

test("the windows follow Discord's theme switch and the system theme while they are open", t => {
    const { plugin, doc, media } = createPlugin(t, { discord: "theme-light" });
    plugin.panelTheme.startWatching();
    const observer = FakeMutationObserver.instances.at(-1);
    assert.deepEqual(observer.targets.map(item => item.target), [doc.root, doc.body], "watches <html> and <body>");
    assert.deepEqual(observer.targets[0].options.attributeFilter, ["class", "data-theme", "theme"]);
    const windows = openAllWindows(plugin, doc);
    doc.root.className = "theme-dark theme-darker";
    observer.fire([{ type: "attributes", attributeName: "class", target: doc.root }]);
    Object.entries(windows).forEach(([name, node]) => assert.equal(node.dataset.daitPanelTheme, "dark", name));
    doc.root.className = "theme-light";
    observer.fire([{ type: "attributes", attributeName: "class", target: doc.root }]);
    Object.values(windows).forEach(node => assert.equal(node.dataset.daitPanelTheme, "light"));

    // The plugin's own Discord observer path (a theme mutation somewhere else) refreshes them too.
    doc.root.className = "theme-midnight";
    plugin.refreshDiscordThemeClasses();
    Object.values(windows).forEach(node => assert.equal(node.dataset.daitPanelTheme, "dark"));

    // No Discord theme at all: the system theme decides, and its change event restyles.
    doc.root.className = "";
    media.system = "light";
    const query = media.queries.find(item => item.listeners.size > 0);
    assert.ok(query, "listens for prefers-color-scheme changes");
    query.listeners.forEach(listener => listener({ matches: true }));
    Object.values(windows).forEach(node => assert.equal(node.dataset.daitPanelTheme, "light"));

    plugin.panelTheme.stopWatching();
    assert.equal(observer.disconnected, true);
    assert.equal(query.listeners.size, 0);
});

test("start() begins watching the theme right after the styles are injected; stop() lets go", () => {
    const source = require("node:fs").readFileSync(require.resolve("../../src/discord-ai-translator.js"), "utf8");
    const start = source.slice(source.indexOf("    start() {"), source.indexOf("    stop() {"));
    const stop = source.slice(source.indexOf("    stop() {"), source.indexOf("    stop() {") + 4000);
    assert.match(start, /this\.injectStyles\(\);\n\s*this\.panelTheme\.startWatching\(\);/);
    assert.match(stop, /this\.panelTheme\.stopWatching\(\);/);
});

// --- Setting row, strings, snapshot and diagnostics ---

for (const language of ["zh-CN", "en"]) test(`the Display tab has the window theme as a segmented control, and search finds it (${language})`, t => {
    {
        const { plugin, doc } = createPlugin(t, { discord: "theme-light", language, tab: "display" });
        const panel = plugin.getSettingsPanel({ quickSettings: true });
        doc.body.appendChild(panel);
        const control = panel.querySelector("[data-dait-path='ui.panelTheme']");
        assert.ok(control, language);
        assert.equal(control.getAttribute("role"), "radiogroup");
        assert.equal(control.closest("[role=tabpanel]").dataset.daitSettingsTabPanel, "display");
        const options = control.querySelectorAll("[role=radio]");
        assert.deepEqual(options.map(option => option.dataset.daitValue), ["auto", "light", "dark"]);
        assert.deepEqual(options.map(option => option.textContent), [plugin.t("panelThemeAuto"), plugin.t("panelThemeLight"), plugin.t("panelThemeDark")]);
        assert.deepEqual(options.map(option => option.getAttribute("aria-checked")), ["true", "false", "false"]);
        const row = control.closest(".dait-settings-row");
        assert.equal(row.querySelector(".dait-row-label").textContent, plugin.t("panelTheme"));
        assert.equal(row.querySelector(".dait-row-description").textContent, plugin.t("panelThemeDesc"));
        options[2].click();
        assert.equal(plugin.settings.ui.panelTheme, "dark");
        assert.equal(panel.dataset.daitPanelTheme, "dark", "the window it sits in restyles at once");
        const found = plugin.runSettingsSearch(panel.__daitSettingsUi, plugin.t("panelTheme"));
        assert.ok(found.some(entry => entry.label === plugin.t("panelTheme") && entry.tabId === "display"), language);
        plugin.destroySettingsModalSizing(panel);
    }
    assert.equal(I18N["zh-CN"].panelThemeAuto, "跟随 Discord");
    assert.equal(I18N["zh-CN"].panelThemeLight, "浅色");
    assert.equal(I18N["zh-CN"].panelThemeDark, "深色");
    assert.equal(I18N.en.panelThemeAuto, "Follow Discord");
    ["panelTheme", "panelThemeDesc", "panelThemeAuto", "panelThemeLight", "panelThemeDark", "settingsGroupWindows"].forEach(key => {
        assert.ok(I18N["zh-CN"][key] && I18N.en[key], key);
    });
});

test("the settings snapshot and the diagnostics export include the window theme", t => {
    const { plugin } = createPlugin(t, { discord: "theme-light" });
    plugin.settings.ui.panelTheme = "auto";
    const snapshot = plugin.createSettingsSnapshot();
    assert.equal(snapshot.settings.ui.panelTheme, "auto");
    assert.equal(snapshot.effective.panelTheme, "light");
    const diagnostics = plugin.getDiagnosticLogsSnapshot();
    assert.equal(diagnostics.settings.panelTheme, "auto");
    assert.equal(diagnostics.settings.panelThemeResolved, "light");
});

// --- The stylesheet ---

// Rules that style the plugin's own windows (not the chat lines and the buttons that live inside Discord's UI).
const WINDOW_PARTS = /\.dait-(settings|row-|segmented|small-button|order-|provider-|google-settings|diagnostic-|setup-|service-|status-mark|api-|model-|try-|prompt-|language-controls|hotkey-|cache-actions|history-backfill-actions|visually-hidden|quick-settings-(modal-root|backdrop|dialog|body|error|done)|quick-popover|qp-|polish-result-|input-action-menu(?!-button)|dialog)|\[data-dait-panel-theme/;
const DISCORD_UI_PARTS = /\.dait-(quick-settings-button|quick-settings-panel|launcher-status|polish-button|public-bilingual-button|polish-restore|input-action-menu-button|message-button|translation-|input-action-group)/;

test("no plugin-window rule reads Discord's colour variables (--input-background, --background-*, --text-*...)", () => {
    const windowRules = cssRules().filter(rule => {
        const selectors = rule.selector.split(",").map(item => item.trim());
        return selectors.every(selector => WINDOW_PARTS.test(selector) && !DISCORD_UI_PARTS.test(selector));
    });
    assert.ok(windowRules.length > 150, `found ${windowRules.length} window rules`);
    const offending = windowRules.filter(rule => /var\(--(input-background|background-|text-|header-|interactive-|brand-|button-|status-|border-|focus-|elevation-|white-|scrollbar-)/.test(rule.body));
    assert.deepEqual(offending.map(rule => rule.selector), []);
    // And the old per-theme copies for these windows are gone.
    assert.equal(/\.theme-light[ .]\.?dait-(settings|quick-settings-modal-root|quick-popover|polish-result-panel|input-action-menu)\b/.test(PLUGIN_CSS), false);
    assert.equal(/dait-(settings|quick-popover|input-action-menu|polish-result-panel|quick-settings-modal-root)\[data-dait-discord-theme/.test(PLUGIN_CSS), false);
});

test("the two palettes: every text colour on every surface reaches 4.5:1, body text 7:1", () => {
    for (const theme of ["light", "dark"]) {
        const token = panelTokens([".dait-settings", `[data-dait-panel-theme="${theme}"]`]);
        const surfaces = ["--dait-bg", "--dait-rail", "--dait-surface", "--dait-input-bg"].map(token);
        for (const surface of surfaces) {
            assert.ok(contrast(token("--dait-text"), surface) >= 7, `${theme} body text on ${surface}`);
            assert.ok(contrast(token("--dait-heading"), surface) >= 7, `${theme} headings on ${surface}`);
            for (const name of ["--dait-link", "--dait-danger", "--dait-warning"]) {
                assert.ok(contrast(token(name), surface) >= 4.5, `${theme} ${name} on ${surface}`);
            }
        }
        for (const surface of ["--dait-bg", "--dait-surface", "--dait-input-bg"].map(token)) {
            assert.ok(contrast(token("--dait-success"), surface) >= 4.5, `${theme} success text on ${surface}`);
        }
        // Text on the raised surface (tab hover, chips, secondary buttons), placeholders in inputs.
        assert.ok(contrast(token("--dait-text"), token("--dait-raised")) >= 7, `${theme} text on raised`);
        assert.ok(contrast(token("--dait-placeholder"), token("--dait-input-bg")) >= 4.5, `${theme} placeholder`);
        // White on the accent (filled buttons, selected tab and segment) and on the danger fill.
        assert.ok(contrast(token("--dait-on-fill"), token("--dait-brand")) >= 4.5, `${theme} white on accent`);
        assert.ok(contrast(token("--dait-on-fill"), token("--dait-danger-fill")) >= 4.5, `${theme} white on danger`);
    }
});

test("one type scale for every window: body 15/1.55, small 13, headings 16/18/20, weights 400-600", () => {
    const token = panelTokens([".dait-settings", '[data-dait-panel-theme="light"]']);
    assert.equal(token("--dait-font-body"), "15px");
    assert.equal(token("--dait-font-small"), "13px");
    assert.equal(token("--dait-font-group"), "16px");
    assert.equal(token("--dait-font-window"), "18px");
    assert.equal(token("--dait-font-page"), "20px");
    assert.equal(token("--dait-line"), "1.55");
    assert.equal(token("--dait-control-h"), "36px");
    const windowRules = cssRules().filter(rule => rule.selector.split(",").every(selector => WINDOW_PARTS.test(selector) && !DISCORD_UI_PARTS.test(selector)));
    const smallUsers = [];
    windowRules.forEach(rule => {
        const values = declarations(rule.body);
        const size = values.get("font-size");
        const weight = values.get("font-weight");
        if (weight) assert.ok(["400", "500", "600"].includes(weight), `${rule.selector}: font-weight ${weight}`);
        if (!size) return;
        // Every text size comes from the scale: icons are drawn shapes, not glyphs with a pixel size of their own.
        assert.match(size, /^var\(--dait-font-(body|small|group|window|page)\)$/, rule.selector);
        if (size === "var(--dait-font-small)") smallUsers.push(rule.selector);
    });
    // Small text only for the version chips and the search box's hint. The header status, the connection card's
    // status and test details, the search results' tab chips and the setup progress are body text (theme audit).
    assert.deepEqual(smallUsers.sort(), [".dait-qp-chip", ".dait-settings .dait-settings-search-input::placeholder", ".dait-settings-version"]);
    const bodyRule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    for (const selector of [".dait-settings-header-status", ".dait-settings .dait-api-status", ".dait-settings .dait-api-test-detail",
        ".dait-settings-search-result-tab", ".dait-setup-progress"]) {
        assert.equal(bodyRule(selector).get("font-size"), "var(--dait-font-body)", selector);
    }
    assert.equal(bodyRule(".dait-settings .dait-api-status").get("font-weight"), "500", "status word");
    assert.equal(bodyRule(".dait-settings .dait-api-test-detail").get("font-weight"), "400", "test details");
    assert.equal(bodyRule(".dait-settings-header-status").get("font-weight"), "400", "the service name next to the status word");
    assert.equal(bodyRule(".dait-setup-progress").get("font-weight"), "400");
    // Window titles: settings window, quick panel, polish result panel.
    for (const selector of [".dait-settings-title", ".dait-qp-title", ".dait-polish-result-title"]) {
        assert.equal(bodyRule(selector).get("font-size"), "var(--dait-font-window)", selector);
    }
    // The "!" marks are drawn with the fill colours, not typed.
    for (const rule of cssRules().filter(item => /::(before|after)/.test(item.selector) && WINDOW_PARTS.test(item.selector))) {
        assert.equal(/content: "!"/.test(rule.body), false, rule.selector);
    }
    // Labels and descriptions share size and colour; the label's weight sets them apart.
    const rule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    for (const [label, description] of [[".dait-row-label", ".dait-row-description"], [".dait-qp-label", ".dait-qp-desc"]]) {
        assert.equal(rule(label).get("font-size"), "var(--dait-font-body)", label);
        assert.equal(rule(description).get("font-size"), "var(--dait-font-body)", description);
        assert.equal(rule(label).get("color"), "var(--dait-text)", label);
        assert.equal(rule(description).get("color"), "var(--dait-text)", description);
        assert.equal(rule(label).get("font-weight"), "600", label);
        assert.equal(rule(description).get("font-weight"), "400", description);
    }
});

test("disabled controls fade as a whole to 55 % instead of turning a dim grey", () => {
    const disabled = cssRules().filter(rule => /(?<!:not\():disabled|\[aria-disabled="true"\]|row-inactive/.test(rule.selector)
        && rule.selector.split(",").every(selector => WINDOW_PARTS.test(selector)));
    assert.ok(disabled.length >= 6);
    disabled.forEach(rule => {
        const values = declarations(rule.body);
        if (values.has("opacity")) assert.equal(values.get("opacity"), "0.55", rule.selector);
        assert.equal(values.has("color"), false, `${rule.selector} keeps its colour`);
        assert.equal(values.has("-webkit-text-fill-color"), false, rule.selector);
    });
});

// --- Theme audit, round 1 ---

test("the connection card: title, status word and Test on one line, the test details or error on their own line at the body size", t => {
    const rule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    const header = rule(".dait-provider-settings-header");
    assert.equal(header.get("display"), "grid");
    assert.match(header.get("grid-template-areas"), /"title status test"\s+"detail detail detail"/);
    assert.equal(rule(".dait-provider-connection").get("display"), "contents");
    const detail = rule(".dait-settings .dait-provider-connection > .dait-api-test-detail");
    assert.equal(detail.get("grid-area"), "detail");
    assert.equal(detail.get("white-space"), "normal", "wraps instead of an ellipsis");
    // No width cap and no small size left on the card's status.
    assert.equal(cssRules().some(item => /provider-connection[^,{]*api-test-detail/.test(item.selector) && /max-width/.test(item.body)), false);
    assert.equal(cssRules().some(item => /provider-connection/.test(item.selector) && /font-small/.test(item.body)), false);

    const { plugin, doc } = createPlugin(t, { discord: "theme-light", tab: "translate" });
    plugin.settings.translation.apiStatus = { state: "failed", message: "The service rejected the API key (401)." };
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const card = panel.querySelector(".dait-provider-settings-header");
    const connection = card.querySelector(".dait-provider-connection");
    assert.deepEqual(connection.children.map(child => child.className.split(" ")[0]), ["dait-api-status", "dait-api-test-detail", "dait-small-button"]);
    plugin.destroySettingsModalSizing(panel);
});

test("close buttons are 36 px icon buttons with a drawn icon, not a × glyph", t => {
    const { plugin, doc } = createPlugin(t, { discord: "theme-dark" });
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const close = panel.querySelector(".dait-settings-close");
    assert.equal(close.textContent, "");
    assert.equal(close.getAttribute("aria-label"), plugin.t("settingsClose"));
    assert.equal(close.children[0].className, "dait-icon dait-icon-close");
    const rule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    assert.equal(rule(".dait-settings-close").get("height"), "var(--dait-control-h)");
    assert.equal(rule(".dait-settings-close").has("font-size"), false);
    assert.match(rule(".dait-icon").get("mask"), /var\(--dait-icon-image\)/);
    assert.match(rule(".dait-icon-close").get("--dait-icon-image"), /^url\("data:image\/svg\+xml,/);
    plugin.destroySettingsModalSizing(panel);
});

test("controls and single-line text use the body line height too", () => {
    const rule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    for (const selector of [".dait-small-button", ".dait-segmented-option", ".dait-settings-tab", ".dait-settings .dait-api-status",
        ".dait-status-mark", ".dait-diagnostic-summary-title", ".dait-qp-button", ".dait-qp-select", ".dait-qp-segment",
        ".dait-polish-result-action", ".dait-input-action-menu-item", ".dait-quick-settings-done", ".dait-prompt-preview-label"]) {
        assert.equal(rule(selector).get("line-height"), "var(--dait-line)", selector);
    }
    const controls = cssRules().find(item => item.selector.startsWith(".dait-settings :where(input:not([type=\"checkbox\"]):not([type=\"radio\"]), select, textarea)") && !item.context);
    assert.equal(declarations(controls.body).get("line-height"), "var(--dait-line)");
});

test("control edges reach 3:1 against every window surface in both palettes", () => {
    for (const theme of ["light", "dark"]) {
        const token = panelTokens([".dait-settings", `[data-dait-panel-theme="${theme}"]`]);
        for (const surface of ["--dait-bg", "--dait-rail", "--dait-surface"]) {
            const ratio = contrast(token("--dait-input-border"), token(surface));
            assert.ok(ratio >= 3, `${theme} input border on ${surface}: ${ratio.toFixed(2)}`);
        }
    }
    // Every input, select, textarea and segmented control draws its edge with that token.
    const rule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    assert.equal(rule(".dait-segmented").get("border"), "1px solid var(--dait-input-border)");
    assert.equal(rule(".dait-qp-select").get("border"), "1px solid var(--dait-input-border)");
    assert.equal(rule(".dait-qp-segmented").get("border"), "1px solid var(--dait-input-border)");
});

test("inactive rows keep their label readable; only the disabled controls fade", t => {
    assert.equal(cssRules().some(rule => /row-inactive/.test(rule.selector) && /opacity/.test(rule.body)), false);
    const { plugin, doc } = createPlugin(t, { discord: "theme-light", tab: "advanced" });
    plugin.settings.ui.historyBackfillEnabled = false;
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    const inactive = panel.querySelectorAll(".dait-settings-row-inactive");
    assert.ok(inactive.length > 0, "a dependent row is off");
    inactive.forEach(row => {
        const controls = plugin.getSettingsRowControls(row.children[1]);
        assert.ok(controls.length > 0 && controls.every(control => control.disabled), "its controls are disabled (and fade)");
    });
    plugin.destroySettingsModalSizing(panel);
});

test("one secondary button style, and the danger zone heading in the heading colour with a danger mark", () => {
    assert.equal(cssRules().some(rule => /small-button-outline/.test(rule.selector)), false, "outline buttons look like every secondary button");
    const rule = selector => declarations(cssRules().find(item => item.selector === selector && !item.context)?.body || "");
    assert.equal(rule(".dait-small-button").get("background"), "var(--dait-raised)");
    assert.equal(rule(".dait-small-button").get("border"), "1px solid var(--dait-input-border)");
    assert.equal(rule(".dait-polish-result-action").get("background"), "var(--dait-raised)");
    assert.equal(rule(".dait-qp-button-secondary").get("background"), "var(--dait-raised)");
    const heading = rule(".dait-settings-danger-zone .dait-settings-group-title");
    assert.equal(heading.has("color"), false, "the heading colour of every group title");
    const mark = rule(".dait-settings-danger-zone .dait-settings-group-title::before");
    assert.match(mark.get("background"), /var\(--dait-danger-fill\)$/);
    // Group headings carry a rule, so a heading does not read like the row label right under it.
    assert.equal(rule(".dait-settings-group-title").get("border-bottom"), "1px solid var(--dait-divider)");
});
