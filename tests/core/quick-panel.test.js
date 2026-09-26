"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");

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

// --- A small DOM: elements, attributes, capture/bubble events, focus and layout rectangles. ---

const toDatasetKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

function parseCompound(text) {
    const compound = { tag: "", classes: [], attributes: [] };
    const pattern = /^([a-zA-Z][\w-]*)|\.([\w-]+)|\[([\w-]+)(?:([*^]?=)(['"])(.*?)\5)?\]/g;
    let consumed = 0;
    let match = pattern.exec(text);
    while (match && match.index === consumed) {
        if (match[1]) compound.tag = match[1].toUpperCase();
        else if (match[2]) compound.classes.push(match[2]);
        else compound.attributes.push({ name: match[3], op: match[4] || "", value: match[6] ?? "" });
        consumed = pattern.lastIndex;
        match = pattern.exec(text);
    }
    return consumed === text.length ? compound : null;
}

function matchesCompound(element, compound) {
    if (!compound || element?.nodeType !== 1) return false;
    if (compound.tag && element.tagName !== compound.tag) return false;
    if (!compound.classes.every(name => element.classList.contains(name))) return false;
    return compound.attributes.every(({ name, op, value }) => {
        const actual = element.getAttribute(name);
        if (actual === null) return false;
        if (op === "=") return actual === value;
        if (op === "^=") return actual.startsWith(value);
        if (op === "*=") return actual.includes(value);
        return true;
    });
}

const parseSelectorList = selector => String(selector).split(",").map(part => parseCompound(part.trim()));

class FakeClassList {
    constructor() { this.names = new Set(); }
    add(...names) { names.forEach(name => this.names.add(name)); }
    remove(...names) { names.forEach(name => this.names.delete(name)); }
    contains(name) { return this.names.has(name); }
    toggle(name, force) {
        const enabled = force === undefined ? !this.names.has(name) : Boolean(force);
        if (enabled) this.names.add(name);
        else this.names.delete(name);
        return enabled;
    }
}

class FakeEventTarget {
    constructor() { this.listeners = new Map(); }
    addEventListener(type, handler, options) {
        const capture = options === true || Boolean(options?.capture);
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push({ handler, capture });
    }
    removeEventListener(type, handler, options) {
        const capture = options === true || Boolean(options?.capture);
        const list = this.listeners.get(type) || [];
        const index = list.findIndex(entry => entry.handler === handler && entry.capture === capture);
        if (index >= 0) list.splice(index, 1);
    }
    listenerCount(type) { return (this.listeners.get(type) || []).length; }
}

class FakeElement extends FakeEventTarget {
    constructor(tag, doc) {
        super();
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this.ownerDocument = doc;
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.attributes = new Map();
        this.classList = new FakeClassList();
        this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
        this.ownText = "";
        this.disabled = false;
        this.hidden = false;
        this.checked = false;
        this.value = "";
        this.type = "";
        this.id = "";
        this.rect = null;
    }

    get className() { return [...this.classList.names].join(" "); }
    set className(value) { this.classList.names = new Set(String(value).split(/\s+/).filter(Boolean)); }
    get title() { return this.getAttribute("title") || ""; }
    set title(value) { this.setAttribute("title", value); }
    get isConnected() {
        let node = this;
        while (node.parentElement) node = node.parentElement;
        return node === this.ownerDocument.body;
    }
    get textContent() { return this.ownText + this.children.map(child => child.textContent).join(""); }
    set textContent(value) {
        this.children.forEach(child => { child.parentElement = null; });
        this.children = [];
        this.ownText = String(value ?? "");
    }
    get options() { return this.tagName === "SELECT" ? this.children.filter(child => child.tagName === "OPTION") : undefined; }

    setAttribute(name, value) {
        if (name.startsWith("data-")) this.dataset[toDatasetKey(name)] = String(value);
        else if (name === "class") this.className = value;
        else if (name === "id") this.id = String(value);
        else this.attributes.set(name, String(value));
    }
    getAttribute(name) {
        if (name.startsWith("data-")) return this.dataset[toDatasetKey(name)] ?? null;
        if (name === "class") return this.className || null;
        if (name === "id") return this.id || null;
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    removeAttribute(name) {
        if (name.startsWith("data-")) delete this.dataset[toDatasetKey(name)];
        else this.attributes.delete(name);
    }

    appendChild(child) { return this.insertBefore(child, null); }
    insertBefore(child, reference) {
        child.remove();
        const index = reference ? this.children.indexOf(reference) : -1;
        if (index >= 0) this.children.splice(index, 0, child);
        else this.children.push(child);
        child.parentElement = this;
        return child;
    }
    remove() {
        if (!this.parentElement) return;
        const siblings = this.parentElement.children;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentElement = null;
    }
    contains(node) {
        for (let current = node; current; current = current.parentElement) if (current === this) return true;
        return false;
    }
    focus() { this.ownerDocument.activeElement = this; }
    matches(selector) { return parseSelectorList(selector).some(compound => matchesCompound(this, compound)); }
    closest(selector) {
        for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
        return null;
    }
    querySelectorAll(selector) {
        const compounds = parseSelectorList(selector);
        const results = [];
        const visit = node => {
            for (const child of node.children) {
                if (compounds.some(compound => matchesCompound(child, compound))) results.push(child);
                visit(child);
            }
        };
        visit(this);
        return results;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() {
        const layout = this.ownerDocument.layout?.(this);
        return this.rect || layout || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    }
}

function createDocument() {
    const doc = new FakeEventTarget();
    doc.activeElement = null;
    doc.documentElement = { clientWidth: 0, clientHeight: 0 };
    doc.createElement = tag => new FakeElement(tag, doc);
    doc.body = doc.createElement("body");
    doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
    doc.querySelector = selector => doc.body.querySelector(selector);
    // The quick panel's own size, as the browser would lay it out.
    doc.layout = element => element.classList.contains("dait-quick-popover") ? { top: 0, left: 0, width: 340, height: 520, right: 340, bottom: 520 } : null;
    return doc;
}

// Capture on the document and ancestors, then target and bubble, then the document again.
function dispatch(doc, target, type, init = {}) {
    const event = {
        type,
        target,
        defaultPrevented: false,
        propagationStopped: false,
        immediateStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        stopImmediatePropagation() { this.propagationStopped = true; this.immediateStopped = true; },
        ...init
    };
    const path = [];
    for (let node = target; node; node = node.parentElement) path.push(node);
    const run = (node, capture) => {
        for (const entry of [...(node.listeners.get(type) || [])]) {
            if (entry.capture !== capture && node !== target) continue;
            event.currentTarget = node;
            entry.handler(event);
            if (event.immediateStopped) return;
        }
    };
    const phases = [[doc, true], ...[...path].reverse().map(node => [node, true]), ...path.map(node => [node, false]), [doc, false]];
    const seenAtTarget = new Set();
    for (const [node, capture] of phases) {
        if (node === target) {
            if (seenAtTarget.has(node)) continue;
            seenAtTarget.add(node);
        }
        run(node, capture);
        if (event.propagationStopped) break;
    }
    return event;
}

const key = (doc, name, init = {}) => dispatch(doc, doc.activeElement || doc.body, "keydown", { key: name, ...init });

function createWindow(options = {}) {
    const win = new FakeEventTarget();
    win.innerWidth = options.width || 1280;
    win.innerHeight = options.height || 900;
    win.location = { pathname: options.pathname || "/channels/111/222" };
    return win;
}

// A started plugin with a launcher in a Discord-like user panel at the bottom left.
function createQuickPanelPlugin(t, options = {}) {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 });
    const doc = createDocument();
    const win = createWindow(options);
    useGlobals(t, { document: doc, window: win });
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.language = options.locale || "zh-CN";
    plugin.settings.translation.provider = options.provider || "sakuraLocal";
    plugin.saveSettings = () => true;
    // No chat to scan here (a scan would also start the local service's health probe).
    plugin.queueScan = () => {};
    plugin.toasts = [];
    plugin.showToast = (message, type) => plugin.toasts.push({ message, type });
    plugin.fullSettingsOpens = [];
    plugin.openQuickSettingsPanel = (source, launcher) => { plugin.fullSettingsOpens.push({ source, launcher }); return null; };
    plugin.getDiscordNamedStore = name => name === "ChannelStore"
        ? { getChannel: id => ({ 222: { name: "general" }, 333: { name: "random" } })[id] || null }
        : null;
    const userPanel = doc.createElement("section");
    doc.body.appendChild(userPanel);
    const launcher = plugin.createQuickSettingsButton("panel", userPanel);
    userPanel.appendChild(launcher);
    launcher.rect = options.launcherRect || { left: 200, top: 850, width: 32, height: 32, right: 232, bottom: 882 };
    const composer = doc.createElement("div");
    composer.className = "composer";
    doc.body.appendChild(composer);
    return { plugin, doc, win, launcher, composer };
}

function openByLauncher(t, doc, launcher) {
    dispatch(doc, launcher, "click");
    t.mock.timers.tick(1);
    return doc.querySelector(".dait-quick-popover");
}

const byClass = (root, className) => root.querySelector(`.${className}`);
function byId(root, id) {
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = byId(child, id);
        if (found) return found;
    }
    return null;
}
const segmentButton = (root, groupKey, value) => byId(root, `dait-quick-popover-${groupKey}`).children.find(button => button.dataset.daitValue === value);

// --- Opening, closing and focus ---

test("the user-panel launcher opens the quick panel above itself instead of the full settings window", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    assert.ok(popover, "the quick panel opened");
    assert.equal(plugin.fullSettingsOpens.length, 0, "the full settings window stays closed");
    assert.equal(popover.getAttribute("role"), "dialog");
    assert.equal(popover.getAttribute("aria-labelledby"), "dait-quick-popover-title");
    assert.equal(launcher.getAttribute("aria-expanded"), "true");
    assert.equal(launcher.getAttribute("aria-controls"), "dait-quick-popover");
    assert.equal(doc.activeElement, byClass(popover, "dait-qp-header-open-full"), "focus moves to the first control");
    // Centered on the launcher, 8 px above it, inside the viewport.
    assert.equal(popover.style.left, "46px");
    assert.equal(popover.style.top, "322px");
    assert.equal(popover.dataset.daitPlacement, "top");
    assert.equal(byClass(popover, "dait-qp-title").textContent, "AI 翻译助手");

    // The launcher toggles it closed again.
    t.mock.timers.tick(400);
    dispatch(doc, launcher, "click");
    t.mock.timers.tick(1);
    assert.equal(doc.querySelector(".dait-quick-popover"), null);
    assert.equal(launcher.getAttribute("aria-expanded"), "false");
    assert.equal(doc.activeElement, launcher);
});

test("opened with the mouse, the first control gets focus without a ring until a key is pressed", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    dispatch(doc, launcher, "pointerdown");
    t.mock.timers.tick(1);
    const popover = doc.querySelector(".dait-quick-popover");
    assert.equal(popover.classList.contains("dait-qp-pointer-opened"), true);
    assert.equal(doc.activeElement, byClass(popover, "dait-qp-header-open-full"), "focus still moves to the first control");
    key(doc, "Tab");
    assert.equal(popover.classList.contains("dait-qp-pointer-opened"), false, "the first key press brings the focus ring back");
    plugin.closeQuickPopover();

    // Enter or Space on the launcher fires a click with detail 0: the ring shows at once.
    t.mock.timers.tick(400);
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    assert.equal(doc.querySelector(".dait-quick-popover").classList.contains("dait-qp-pointer-opened"), false);
    assert.match(PLUGIN_CSS, /\.dait-quick-popover\.dait-qp-pointer-opened :focus-visible \{\s*outline: none;/);
});

test("Escape closes the quick panel and returns focus to the launcher", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    byClass(popover, "dait-qp-switch").focus();
    const event = key(doc, "Escape");
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true, "Discord does not also handle this Escape");
    assert.equal(plugin.isQuickPopoverOpen(), false);
    assert.equal(doc.querySelector(".dait-quick-popover"), null);
    assert.equal(doc.activeElement, launcher);
    assert.equal(launcher.getAttribute("aria-expanded"), "false");
    assert.equal(doc.listenerCount("keydown"), 0);
    assert.equal(doc.listenerCount("pointerdown"), 0);
});

test("a click outside closes the quick panel; clicks inside it and on the launcher do not", t => {
    const { plugin, doc, launcher, composer } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    dispatch(doc, byClass(popover, "dait-qp-desc"), "pointerdown");
    assert.equal(plugin.isQuickPopoverOpen(), true);
    dispatch(doc, launcher.querySelector(".dait-launcher-status"), "pointerdown");
    assert.equal(plugin.isQuickPopoverOpen(), true, "the launcher's own handler decides");
    composer.focus();
    dispatch(doc, composer, "pointerdown");
    assert.equal(plugin.isQuickPopoverOpen(), false);
    assert.equal(doc.activeElement, composer, "an outside click keeps focus where the user put it");
});

test("Tab and Shift+Tab stay inside the quick panel", t => {
    const { doc, launcher } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    const first = byClass(popover, "dait-qp-header-open-full");
    const last = byClass(popover, "dait-qp-footer-open-full");
    last.focus();
    let event = key(doc, "Tab");
    assert.equal(event.defaultPrevented, true);
    assert.equal(doc.activeElement, first);
    event = key(doc, "Tab", { shiftKey: true });
    assert.equal(event.defaultPrevented, true);
    assert.equal(doc.activeElement, last);
    // Only the checked button of a radio group is in the Tab order.
    const unchecked = popover.querySelectorAll(".dait-qp-segment").filter(button => button.getAttribute("aria-checked") !== "true");
    assert.ok(unchecked.length > 0);
    assert.ok(unchecked.every(button => button.getAttribute("tabindex") === "-1"));
    // Keys typed in the panel do not reach Discord's document shortcuts.
    let reachedDocument = false;
    const probe = () => { reachedDocument = true; };
    doc.addEventListener("keydown", probe);
    byClass(popover, "dait-qp-switch").focus();
    key(doc, "k");
    assert.equal(reachedDocument, false);
    doc.removeEventListener("keydown", probe);
});

test("only one quick panel exists at a time and stop() removes it with its listeners and timers", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    plugin.openQuickPopover(launcher);
    plugin.openQuickPopover(launcher);
    assert.equal(doc.querySelectorAll(".dait-quick-popover").length, 1);
    assert.equal(doc.listenerCount("keydown"), 1);
    assert.equal(doc.listenerCount("pointerdown"), 1);
    assert.ok(plugin.quickPanel.routeTimer, "the open panel watches the route");
    plugin.stop();
    assert.equal(doc.querySelectorAll(".dait-quick-popover").length, 0);
    assert.equal(doc.listenerCount("pointerdown"), 0);
    assert.equal(window.listenerCount("resize"), 0);
    assert.equal(plugin.quickPanel.routeTimer, null);
    assert.equal(plugin.quickPanel.statusTimer, null);
    assert.equal(plugin.quickPanel.statusPending, false);
});

test("the quick panel flips below the launcher and stays inside a small viewport", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t, { launcherRect: { left: 1200, top: 20, width: 32, height: 32, right: 1232, bottom: 52 } });
    const popover = plugin.openQuickPopover(launcher);
    assert.equal(popover.dataset.daitPlacement, "bottom");
    assert.equal(popover.style.top, "60px");
    assert.equal(popover.style.left, "932px", "clamped to the right edge with an 8 px margin");
    plugin.closeQuickPopover();

    window.innerHeight = 400;
    launcher.rect = { left: 10, top: 360, width: 32, height: 32, right: 42, bottom: 392 };
    const small = plugin.openQuickPopover(launcher);
    assert.equal(small.style.top, "8px");
    assert.equal(small.style.left, "8px");
    // A resize repositions it.
    window.innerHeight = 900;
    launcher.rect = { left: 10, top: 850, width: 32, height: 32, right: 42, bottom: 882 };
    window.listeners.get("resize").forEach(entry => entry.handler({ type: "resize" }));
    assert.equal(small.style.top, "322px");
    assert.equal(doc.querySelectorAll(".dait-quick-popover").length, 1);
});

// --- Bindings ---

test("the switches, target language and position write their settings, and outside changes show up", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    const [auto, mask, hide] = popover.querySelectorAll(".dait-qp-switch");
    assert.equal(auto.getAttribute("role"), "switch");
    assert.equal(auto.checked, false);

    auto.checked = true;
    dispatch(doc, auto, "change");
    assert.equal(plugin.settings.ui.autoTranslateMessages, true);
    mask.checked = true;
    dispatch(doc, mask, "change");
    assert.equal(plugin.settings.ui.maskTranslations, true);
    hide.checked = true;
    dispatch(doc, hide, "change");
    assert.equal(plugin.settings.ui.hideOriginalAfterTranslation, true);

    const below = segmentButton(popover, "position", "after");
    dispatch(doc, below, "click");
    assert.equal(plugin.settings.ui.translationPosition, "after");
    assert.equal(below.getAttribute("aria-checked"), "true");
    assert.equal(segmentButton(popover, "position", "before").getAttribute("aria-checked"), "false");
    // Arrow keys move the selection like native radio buttons.
    below.focus();
    key(doc, "ArrowLeft");
    assert.equal(plugin.settings.ui.translationPosition, "before");
    assert.equal(doc.activeElement, segmentButton(popover, "position", "before"));

    const target = byId(popover, "dait-quick-popover-target");
    assert.equal(target.value, "汉语");
    target.value = "日语";
    dispatch(doc, target, "change");
    assert.equal(plugin.settings.translation.targetLanguage, "日语");

    // Changes made elsewhere (the full settings window, another control) are shown.
    plugin.setSetting("ui.maskTranslations", false);
    plugin.setSetting("ui.autoTranslateMessages", false);
    plugin.setSetting("translation.targetLanguage", "Klingon");
    t.mock.timers.tick(20);
    assert.equal(mask.checked, false);
    assert.equal(auto.checked, false);
    assert.equal(target.value, "Klingon");
    assert.equal(target.options[0].value, "Klingon", "a custom target language stays selectable");
    assert.ok(target.options.some(option => option.value === "英语"));

    // Hiding the launcher closes its panel.
    plugin.setSetting("ui.showQuickSettingsPanelButton", false);
    assert.equal(plugin.isQuickPopoverOpen(), false);
});

test("the channel rule is bound to the channel the panel shows and follows route changes", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    const name = byClass(popover, "dait-qp-channel-name");
    const caption = byClass(popover, "dait-qp-rule-caption");
    const click = value => dispatch(doc, segmentButton(popover, "rule", value), "click");
    assert.equal(name.textContent, "#general");
    assert.equal(segmentButton(popover, "rule", "inherit").getAttribute("aria-checked"), "true");
    assert.equal(caption.textContent, "现在：不自动翻译（跟随总开关）");
    assert.deepEqual(popover.querySelectorAll(".dait-qp-segment").slice(0, 3).map(button => button.textContent), ["跟随总开关", "总是翻译", "不翻译"]);

    click("enabled");
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies["111:222"], { mode: "enabled" });
    assert.equal(caption.textContent, "总开关关闭时，这个频道也会自动翻译");

    // Discord navigated, the panel has not re-rendered yet: the rule still goes to the channel it shows.
    window.location.pathname = "/channels/111/333";
    click("disabled");
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies["111:222"], { mode: "disabled" });
    assert.equal(plugin.settings.ui.channelAutoTranslatePolicies["111:333"], undefined);

    // The open panel notices the route change and re-renders for the new channel.
    t.mock.timers.tick(800);
    assert.equal(name.textContent, "#random");
    assert.equal(segmentButton(popover, "rule", "inherit").getAttribute("aria-checked"), "true");
    click("enabled");
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies["111:333"], { mode: "enabled" });
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies["111:222"], { mode: "disabled" });

    // The scan's route-change hook re-renders as well.
    window.location.pathname = "/channels/111/222";
    plugin.quickPanel.handleRouteChange();
    assert.equal(name.textContent, "#general");
    assert.equal(segmentButton(popover, "rule", "disabled").getAttribute("aria-checked"), "true");
    assert.equal(caption.textContent, "这个频道不自动翻译；手动翻译不受影响");

    // "Follow main switch" says what really happens now.
    click("inherit");
    plugin.setSetting("ui.autoTranslateMessages", true);
    t.mock.timers.tick(20);
    assert.equal(caption.textContent, "现在：会自动翻译（跟随总开关）");
    plugin.setSetting("translation.enabled", false);
    t.mock.timers.tick(20);
    assert.equal(caption.textContent, "现在：不自动翻译（跟随总开关）", "with translation off nothing is auto-translated");
    plugin.setSetting("translation.enabled", true);

    // Without a channel the rule cannot be set.
    window.location.pathname = "/channels/@me";
    plugin.quickPanel.handleRouteChange();
    assert.equal(name.textContent, "未打开频道");
    assert.ok(popover.querySelectorAll(".dait-qp-segment").slice(0, 3).every(button => button.disabled));
    assert.equal(caption.textContent, "打开一个频道后可以单独设置");
});

test("in English the channel rule shows short labels and keeps the full rule names as accessible names", t => {
    const { doc, launcher } = createQuickPanelPlugin(t, { locale: "en" });
    const popover = openByLauncher(t, doc, launcher);
    const buttons = ["inherit", "enabled", "disabled"].map(value => segmentButton(popover, "rule", value));
    assert.deepEqual(buttons.map(button => button.textContent), ["Follow main", "Always", "Never"]);
    assert.deepEqual(buttons.map(button => button.getAttribute("aria-label")), ["Follow main switch", "Always translate", "Never translate"]);
    assert.deepEqual(buttons.map(button => button.title), ["Follow main switch", "Always translate", "Never translate"]);
    // The group itself is still named by its row label.
    assert.equal(byId(popover, "dait-quick-popover-rule").getAttribute("aria-labelledby"), "dait-quick-popover-rule-label");
});

test("open full settings closes the quick panel and opens the full window from the launcher", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    let popover = openByLauncher(t, doc, launcher);
    dispatch(doc, byClass(popover, "dait-qp-footer-open-full"), "click");
    assert.equal(plugin.isQuickPopoverOpen(), false);
    assert.deepEqual(plugin.fullSettingsOpens, [{ source: "quick-panel", launcher }]);
    popover = plugin.openQuickPopover(launcher);
    dispatch(doc, byClass(popover, "dait-qp-header-open-full"), "click");
    assert.equal(plugin.fullSettingsOpens.length, 2);
    assert.equal(plugin.isQuickPopoverOpen(), false);
});

test("the quick panel's Test button runs the translation API test and saves its result", async t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    plugin.settings.ui.autoTranslateMessages = true;
    const popover = openByLauncher(t, doc, launcher);
    const calls = [];
    plugin.testApiConnection = async (kind, button, status) => {
        calls.push({ kind, button, status });
        plugin.setApiStatus(status, "success", plugin.t("apiStatusSuccess"));
    };
    const testButton = byClass(popover, "dait-qp-test");
    dispatch(doc, testButton, "click");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "translation");
    assert.equal(calls[0].button, testButton);
    assert.equal(calls[0].status.dataset.daitKind, "translation");
    assert.equal(plugin.settings.translation.apiStatus.state, "success");
    assert.equal(byClass(popover, "dait-qp-status-line").textContent, "Sakura 本地 · 连接正常");
    assert.equal(byClass(popover, "dait-qp-dot").dataset.daitStatus, "ok");
});

// --- Launcher status ---

function statusPlugin(t, options = {}) {
    const context = createQuickPanelPlugin(t, options);
    context.plugin.settings.ui.autoTranslateMessages = true;
    context.plugin.settings.translation.apiStatus = { state: "success", message: "" };
    context.providerKey = () => context.plugin.getAutoTranslationProviderKey(context.plugin.getAutoTranslationOptions());
    return context;
}

test("launcher status: ok, busy, waiting, needs-you and off each have their own text", t => {
    const { plugin, providerKey } = statusPlugin(t);
    let status = plugin.getLauncherStatus();
    assert.equal(status.state, "ok");
    assert.equal(status.title, "Sakura 本地 · 连接正常 · 本频道自动翻译中");
    assert.equal(status.ariaLabel, "AI 翻译助手：Sakura 本地 · 连接正常 · 本频道自动翻译中");

    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = 3;
    plugin.autoTranslationQueue = [{}, {}];
    status = plugin.getLauncherStatus();
    assert.equal(status.state, "busy");
    assert.equal(status.activity, "正在翻译 3 条，排队 2 条");
    plugin.autoTranslationInFlight = 0;
    plugin.autoTranslationInFlightItems = 0;
    plugin.autoTranslationQueue = [];

    plugin.settings.translation.apiStatus = { state: "testing", message: "" };
    status = plugin.getLauncherStatus();
    assert.equal(status.state, "busy");
    assert.equal(status.title, "Sakura 本地 · 检测中 · 正在测试连接…");
    plugin.settings.translation.apiStatus = { state: "success", message: "" };

    const now = Date.now();
    plugin.autoTranslationProviderFailures.set(providerKey(), { type: "rate-limit", count: 1, retryAt: now + 45000, retryAfterMs: 45000 });
    status = plugin.getLauncherStatus(now);
    assert.equal(status.state, "waiting");
    assert.equal(status.activity, "服务繁忙，稍后自动继续");
    assert.equal(plugin.quickPanel.getStatusDetailText(status, now), "服务繁忙，约 45 秒后自动继续");
    // An expired cooldown no longer counts.
    assert.equal(plugin.getLauncherStatus(now + 46000).state, "ok");

    plugin.autoTranslationProviderFailures.set(providerKey(), { type: "local-unavailable", count: 1, retryAt: now - 1 });
    plugin.settings.translation.apiStatus = { state: "failed", message: "connect ECONNREFUSED 127.0.0.1:8080" };
    status = plugin.getLauncherStatus(now);
    assert.equal(status.state, "needs-you");
    assert.equal(status.title, "Sakura 本地 · 连接失败 · 需要处理：本地服务没有响应");
    assert.equal(status.detail, "需要处理：本地服务没有响应");
    assert.equal(status.note, "connect ECONNREFUSED 127.0.0.1:8080", "the service's own error text is the note");
    // A running health probe shows as busy, not as an error.
    plugin.localProviderHealthChecks.set(providerKey(), Promise.resolve());
    assert.equal(plugin.getLauncherStatus(now).state, "busy");
    plugin.localProviderHealthChecks.clear();
    plugin.autoTranslationProviderFailures.clear();

    // A failed connection test also needs the user.
    status = plugin.getLauncherStatus(now);
    assert.equal(status.state, "needs-you");
    assert.equal(status.activity, "需要处理：连接测试没有通过");
    plugin.settings.translation.apiStatus = { state: "success", message: "" };

    plugin.settings.ui.autoTranslateMessages = false;
    status = plugin.getLauncherStatus(now);
    assert.equal(status.state, "off");
    assert.equal(status.title, "Sakura 本地 · 连接正常 · 本频道不自动翻译");
    assert.equal(status.detail, "本频道不自动翻译");
    assert.equal(status.note, "手动翻译仍可用");
    // The channel rule decides for this channel.
    plugin.setCurrentChannelAutoTranslatePolicyMode("enabled", "111:222:");
    assert.equal(plugin.getLauncherStatus(now).state, "ok");
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.setCurrentChannelAutoTranslatePolicyMode("disabled", "111:222:");
    assert.equal(plugin.getLauncherStatus(now).state, "off");
    plugin.setCurrentChannelAutoTranslatePolicyMode("inherit", "111:222:");

    plugin.settings.translation.enabled = false;
    status = plugin.getLauncherStatus(now);
    assert.equal(status.state, "off");
    assert.equal(status.activity, "频道翻译已关闭");
    assert.equal(status.note, "", "with translation off, manual translation is off too");
});

test("the panel's status shows the activity and a separate one-line note, and an unchanged status writes nothing", t => {
    const { plugin, doc, launcher, providerKey } = statusPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    const line = byClass(popover, "dait-qp-status-line");
    const detail = byClass(popover, "dait-qp-status-detail");
    const note = byClass(popover, "dait-qp-status-note");
    assert.equal(line.getAttribute("role"), "status", "the service line is announced");
    assert.equal(detail.getAttribute("role"), null, "the activity line (queue counts, countdown) is not");
    assert.equal(line.textContent, "Sakura 本地 · 连接正常");
    assert.equal(detail.textContent, "本频道自动翻译中");
    assert.equal(note.hidden, true);
    assert.equal(popover.style.top, "322px");
    // The note line makes the panel taller.
    doc.layout = element => element.classList.contains("dait-quick-popover")
        ? { top: 0, left: 0, width: 340, height: note.hidden ? 520 : 540, right: 340, bottom: note.hidden ? 520 : 540 }
        : null;

    plugin.autoTranslationProviderFailures.set(providerKey(), { type: "local-unavailable", count: 1, retryAt: 0 });
    plugin.setApiRuntimeStatus("translation", "failed", "failed", "connect ECONNREFUSED 127.0.0.1:8080");
    t.mock.timers.tick(250);
    assert.equal(popover.style.top, "302px", "a taller panel moves up instead of covering the launcher");
    assert.equal(popover.dataset.daitStatus, "needs-you");
    assert.equal(line.textContent, "Sakura 本地 · 连接失败");
    assert.equal(detail.textContent, "需要处理：本地服务没有响应");
    assert.equal(note.hidden, false);
    assert.equal(note.textContent, "connect ECONNREFUSED 127.0.0.1:8080");
    assert.equal(note.title, "connect ECONNREFUSED 127.0.0.1:8080", "the full text is in the tooltip");

    // The open panel's route watch keeps ticking; with the same route and status nothing is rewritten.
    let writes = 0;
    const textContent = Object.getOwnPropertyDescriptor(FakeElement.prototype, "textContent");
    [line, detail, note, launcher].forEach(node => Object.defineProperty(node, "textContent", {
        configurable: true,
        get: textContent.get,
        set(value) { writes++; textContent.set.call(this, value); }
    }));
    t.mock.timers.tick(800);
    t.mock.timers.tick(800);
    t.mock.timers.tick(800);
    t.mock.timers.tick(250);
    assert.equal(writes, 0);
    assert.equal(plugin.quickPanel.statusPending, false, "no status read is queued while nothing changes");

    // The test passes: the error note goes away.
    plugin.autoTranslationProviderFailures.clear();
    plugin.setApiRuntimeStatus("translation", "success", "ok");
    t.mock.timers.tick(250);
    assert.equal(detail.textContent, "本频道自动翻译中");
    assert.equal(note.hidden, true);
});

test("launcher status: a cloud service without a key, a rejected key or no quota needs the user", t => {
    const { plugin, providerKey } = statusPlugin(t, { provider: "deepseek" });
    plugin.settings.translation.apiKey = "";
    plugin.settings.ui.autoTranslateMessages = false;
    let status = plugin.getLauncherStatus();
    assert.equal(status.state, "needs-you", "a missing key shows even while auto-translate is off");
    assert.equal(status.title, "DeepSeek · 未配置 · 需要处理：缺少 API Key 等配置");

    plugin.settings.translation.apiKey = "sk-fake-1";
    plugin.settings.ui.autoTranslateMessages = true;
    const now = Date.now();
    plugin.autoTranslationProviderFailures.set(providerKey(), { type: "auth", count: 1, retryAt: now + 60000 });
    status = plugin.getLauncherStatus(now);
    assert.equal(status.state, "needs-you");
    assert.equal(status.activity, "需要处理：API Key 无效或没有权限");
    plugin.autoTranslationProviderFailures.set(providerKey(), { type: "quota", count: 1, retryAt: now + 60000 });
    assert.equal(plugin.getLauncherStatus(now).activity, "需要处理：额度用完或余额不足");

    plugin.settings.ui.language = "en";
    plugin.autoTranslationProviderFailures.clear();
    status = plugin.getLauncherStatus(now);
    assert.equal(status.title, "DeepSeek · Connected · Auto-translating in this channel");
    assert.equal(status.ariaLabel, "AI Translator: DeepSeek · Connected · Auto-translating in this channel");
});

test("the launcher badge updates once per burst of changes, only when the status changed, and not without a launcher", t => {
    const { plugin, launcher, providerKey } = statusPlugin(t);
    plugin.quickPanel.refreshStatus({ force: true });
    const dot = launcher.querySelector(".dait-launcher-status").querySelector(".dait-qp-dot");
    assert.equal(dot.dataset.daitStatus, "ok");
    assert.equal(launcher.dataset.daitStatus, "ok");
    assert.equal(launcher.title, "Sakura 本地 · 连接正常 · 本频道自动翻译中");

    let writes = 0;
    const setAttribute = launcher.setAttribute.bind(launcher);
    launcher.setAttribute = (...args) => { writes++; return setAttribute(...args); };

    // A burst of queue and status events is read once, after the throttle.
    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = 1;
    plugin.requestLauncherStatusUpdate();
    plugin.setApiRuntimeStatus("translation", "success");
    plugin.requestLauncherStatusUpdate();
    assert.equal(plugin.quickPanel.statusPending, true);
    assert.equal(dot.dataset.daitStatus, "ok", "nothing is written before the throttle ends");
    t.mock.timers.tick(250);
    assert.equal(dot.dataset.daitStatus, "busy");
    assert.equal(launcher.title, "Sakura 本地 · 连接正常 · 正在翻译 1 条，排队 0 条");
    assert.ok(writes > 0);

    // The same status again writes nothing.
    writes = 0;
    plugin.requestLauncherStatusUpdate();
    t.mock.timers.tick(250);
    assert.equal(writes, 0);

    // A cooldown ends without an event: the badge is looked at again when it is over.
    plugin.autoTranslationInFlight = 0;
    plugin.autoTranslationInFlightItems = 0;
    plugin.autoTranslationProviderFailures.set(providerKey(), { type: "server", count: 1, retryAt: Date.now() + 5000 });
    plugin.requestLauncherStatusUpdate();
    t.mock.timers.tick(250);
    assert.equal(dot.dataset.daitStatus, "waiting");
    t.mock.timers.tick(5000);
    t.mock.timers.tick(250);
    assert.equal(dot.dataset.daitStatus, "ok");

    // With no launcher on screen (and no open panel) nothing is scheduled.
    launcher.remove();
    plugin.requestLauncherStatusUpdate();
    assert.equal(plugin.quickPanel.statusPending, false);
});

test("a new launcher shows the current status at once; settings and failures refresh it", t => {
    const { plugin, doc, launcher, providerKey } = statusPlugin(t);
    assert.ok(launcher.querySelector(".dait-launcher-status"), "created with its badge");
    plugin.settings.ui.autoTranslateMessages = false;
    const replacement = plugin.createQuickSettingsButton("panel", doc.body);
    launcher.parentElement.appendChild(replacement);
    launcher.remove();
    assert.equal(replacement.dataset.daitStatus, "off");
    assert.equal(replacement.querySelector(".dait-qp-dot").dataset.daitStatus, "off");

    plugin.setSetting("ui.autoTranslateMessages", true);
    t.mock.timers.tick(250);
    assert.equal(replacement.dataset.daitStatus, "ok");

    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), Object.assign(new Error("slow down"), { status: 429, providerKey: providerKey() }));
    t.mock.timers.tick(250);
    assert.equal(replacement.dataset.daitStatus, "waiting");
});

test("a launcher re-created after a language switch speaks the new language at once", t => {
    const { plugin, doc, launcher } = statusPlugin(t);
    plugin.quickPanel.refreshStatus({ force: true });
    assert.equal(launcher.title, "Sakura 本地 · 连接正常 · 本频道自动翻译中");
    plugin.settings.ui.language = "en";
    const replacement = plugin.createQuickSettingsButton("panel", doc.body);
    assert.equal(replacement.title, "Sakura local · Connected · Auto-translating in this channel");
    assert.equal(replacement.getAttribute("aria-label"), "AI Translator: Sakura local · Connected · Auto-translating in this channel");
});

// --- Integration with the rest of the plugin ---

test("the quick panel counts as the plugin's own UI and never as Discord's settings button", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    const popover = openByLauncher(t, doc, launcher);
    const footerLink = byClass(popover, "dait-qp-footer-open-full");
    assert.equal(plugin.isOwnPluginElement(footerLink), true);
    footerLink.setAttribute("aria-label", "打开完整设置");
    footerLink.rect = { left: 60, top: 820, width: 120, height: 32 };
    assert.equal(plugin.isLikelyDiscordUserSettingsButton(footerLink), false);
});

test("the quick panel styles follow the UI spec and respect reduced motion", () => {
    const rule = selector => {
        const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return [...PLUGIN_CSS.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`, "g"))].map(match => match[1]).join("\n");
    };
    const popover = rule(".dait-quick-popover");
    assert.match(popover, /width: 340px;/);
    assert.match(popover, /max-height: min\(600px, calc\(100vh - 96px\)\);/);
    assert.match(popover, /border-radius: 8px;/);
    assert.match(rule(".dait-qp-body"), /overflow-y: auto;/);
    assert.match(rule(".dait-qp-label"), /font-size: 14px;[\s\S]*font-weight: 500;/);
    assert.match(rule(".dait-qp-desc"), /font-size: 13px;/);
    assert.match(rule(".dait-qp-section"), /font-size: 12px;[\s\S]*font-weight: 700;/);
    assert.match(rule(".dait-qp-switch"), /height: 24px;[\s\S]*width: 40px;/);
    assert.match(rule(".dait-qp-segmented"), /min-height: 32px;/);
    assert.match(rule(".dait-qp-button"), /height: 32px;[\s\S]*padding: 0 14px;/);
    // Every status state has its own shape rule.
    ["ok", "busy", "waiting", "needs-you", "off"].forEach(state => {
        assert.ok(PLUGIN_CSS.includes(`.dait-qp-dot[data-dait-status="${state}"] {`), state);
    });
    // Motion only when the user allows it; the popover sheet comes last.
    assert.doesNotMatch(popover, /animation|transition/);
    assert.match(PLUGIN_CSS, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.dait-quick-popover \{\s*animation: dait-qp-enter/);
    const sizes = [...PLUGIN_CSS.slice(PLUGIN_CSS.indexOf(".dait-quick-popover,")).matchAll(/font-size: (\d+)px/g)].map(match => Number(match[1]));
    assert.ok(sizes.length > 0 && sizes.every(size => size >= 12), "no text below 12 px in the quick panel");
    assert.ok(PLUGIN_CSS.trimEnd().endsWith("}"));
    assert.ok(PLUGIN_CSS.lastIndexOf(".dait-quick-popover") > PLUGIN_CSS.lastIndexOf(".dait-translation-line"), "07-quick-popover is the last sheet");
});
