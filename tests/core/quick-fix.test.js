"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

// v0.4.0 review fixes for the launcher and the quick panel: one toggle per press, a status that only says
// "testing" while something is tested, a Test button that matches, a panel that follows its launcher, Tab that
// stays with Discord once focus has left the panel, the channel rule's caption with translation off, and what
// counts as a channel for the channel rule.

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

// --- The small DOM of quick-panel.test.js: elements, attributes, capture/bubble events, focus and layout rectangles. ---

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
    if (options.endpoint) plugin.settings.translation.endpoint = options.endpoint;
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
    const composer = doc.createElement("textarea");
    composer.className = "composer";
    doc.body.appendChild(composer);
    return { plugin, doc, win, launcher, composer, userPanel };
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

// A mouse press on the launcher as Chromium sends it: pointerdown, (held for holdMs), pointerup, then click.
function press(t, doc, target, options = {}) {
    const pointer = { pointerId: options.pointerId ?? 1, pointerType: options.pointerType || "mouse", isPrimary: true, button: options.button ?? 0 };
    dispatch(doc, target, "pointerdown", pointer);
    t.mock.timers.tick(options.holdMs ?? 80);
    dispatch(doc, target, "pointerup", pointer);
    if (pointer.button === 0) dispatch(doc, target, "click", { detail: 1, pointerId: pointer.pointerId, pointerType: pointer.pointerType });
    t.mock.timers.tick(1);
}

// --- QP-2 / X1: one toggle per press ---

test("a press on the launcher toggles the quick panel once, however long the button is held", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    // A slow click (held 450 ms) opens the panel and leaves it open.
    press(t, doc, launcher, { holdMs: 450 });
    assert.equal(plugin.isQuickPopoverOpen(), true, "a slow click opens the panel");
    t.mock.timers.tick(2000);
    // A slow click on the open panel's launcher closes it and leaves it closed.
    press(t, doc, launcher, { holdMs: 700 });
    assert.equal(plugin.isQuickPopoverOpen(), false, "a slow click closes the panel");
    // Quick clicks toggle as before, one toggle per click.
    press(t, doc, launcher);
    assert.equal(plugin.isQuickPopoverOpen(), true);
    press(t, doc, launcher);
    assert.equal(plugin.isQuickPopoverOpen(), false);
    // A long touch press as well.
    press(t, doc, launcher, { holdMs: 900, pointerType: "touch", pointerId: 7 });
    assert.equal(plugin.isQuickPopoverOpen(), true);
});

test("the panel opens while the launcher is still held; release and click do not close it again", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    const pointer = { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 };
    dispatch(doc, launcher, "pointerdown", pointer);
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), true, "open on press");
    t.mock.timers.tick(400);
    const up = dispatch(doc, launcher, "pointerup", pointer);
    const click = dispatch(doc, launcher, "click", { detail: 1, pointerId: 1 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), true, "still open after release");
    // Discord never sees any part of the press.
    assert.equal(up.propagationStopped, true);
    assert.equal(click.propagationStopped, true);
});

test("right and middle presses do not toggle the quick panel", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    press(t, doc, launcher, { button: 2 });
    assert.equal(plugin.isQuickPopoverOpen(), false, "right button");
    press(t, doc, launcher, { button: 1 });
    assert.equal(plugin.isQuickPopoverOpen(), false, "middle button");
    // A second finger on a touch screen is not a press of its own.
    dispatch(doc, launcher, "pointerdown", { pointerId: 9, pointerType: "touch", isPrimary: false, button: 0 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), false, "secondary pointer");
    press(t, doc, launcher);
    assert.equal(plugin.isQuickPopoverOpen(), true);
    press(t, doc, launcher, { button: 2 });
    assert.equal(plugin.isQuickPopoverOpen(), true, "a right press leaves an open panel open");
});

test("Enter or Space, and a press whose first events Discord swallowed, still toggle once", t => {
    const { plugin, doc, launcher } = createQuickPanelPlugin(t);
    // Enter or Space: a click with detail 0 and no pointer events.
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), true);
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), false);
    // A click from assistive technology arrives without pointer events.
    dispatch(doc, launcher, "click", { detail: 1 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), true);
    // pointerdown never reached the launcher: its pointerup toggles, and the click that follows is the same press.
    dispatch(doc, launcher, "pointerup", { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 });
    dispatch(doc, launcher, "click", { detail: 1, pointerId: 1 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), false);
    // A press that never produced a click (released outside the launcher) does not swallow the next keyboard click.
    dispatch(doc, launcher, "pointerdown", { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), true);
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), false);
    // Nor a click that no pointer caused (Chromium gives it pointerId -1 and no pointer type).
    dispatch(doc, launcher, "pointerdown", { pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0 });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), true);
    dispatch(doc, launcher, "click", { detail: 1, pointerId: -1, pointerType: "" });
    t.mock.timers.tick(1);
    assert.equal(plugin.isQuickPopoverOpen(), false);
});

// --- QP-3: "testing" means a test or probe is running ---

const LOOPBACK_SAKURA = "http://127.0.0.1:8080/v1/chat/completions";
const LAN_SAKURA = "http://192.168.1.10:8080/v1/chat/completions";

function statusPlugin(t, options = {}) {
    const context = createQuickPanelPlugin(t, { endpoint: LOOPBACK_SAKURA, ...options });
    context.plugin.settings.translation.apiKey = "";
    context.plugin.settings.ui.autoTranslateMessages = true;
    context.plugin.settings.translation.apiStatus = { state: "success", message: "" };
    context.options = () => context.plugin.getAutoTranslationOptions();
    context.providerKey = () => context.plugin.getAutoTranslationProviderKey(context.options());
    return context;
}

test("a health probe of a LAN http endpoint ends as a failed status the user has to fix, not as a test that never ends", async t => {
    const { plugin, doc, launcher, options, providerKey } = statusPlugin(t, { endpoint: LAN_SAKURA });
    plugin.startLocalProviderHealthProbe(providerKey(), options(), { reason: "test" });
    assert.equal(plugin.getLauncherStatus().state, "busy", "busy while the probe runs");
    await plugin.localProviderHealthChecks.get(providerKey());
    assert.equal(plugin.localProviderHealthChecks.size, 0);
    const api = plugin.getApiStatus("translation");
    assert.equal(api.state, "failed", "the probe records its failure");
    assert.equal(api.message, plugin.t("errorUnsafeEndpoint"));
    const status = plugin.getLauncherStatus();
    assert.equal(status.state, "needs-you");
    assert.equal(status.title, "Sakura 本地 · 连接失败 · 需要处理：接口地址不可用");
    assert.equal(status.testing, false);
    // The panel's Test button is the way to see the error: it is not blocked.
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    const popover = doc.querySelector(".dait-quick-popover");
    assert.equal(byClass(popover, "dait-qp-test").disabled, false);
    assert.equal(launcher.dataset.daitStatus, "needs-you");
});

test("a saved 'testing' status with nothing running is not shown as a running test", t => {
    const { plugin, doc, launcher } = statusPlugin(t);
    plugin.settings.translation.apiStatus = { state: "testing", message: "" };
    const status = plugin.getLauncherStatus();
    assert.equal(status.testing, false);
    assert.equal(status.state, "ok");
    assert.equal(status.title, "Sakura 本地 · 未检测 · 本频道自动翻译中");
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    const popover = doc.querySelector(".dait-quick-popover");
    assert.equal(byClass(popover, "dait-qp-test").disabled, false, "nothing runs, so the Test button works");
    assert.equal(byClass(popover, "dait-qp-status-line").textContent, "Sakura 本地 · 未检测");
});

test("a connection test started in the full settings window shows as testing until it ends", async t => {
    const { plugin, doc, launcher } = statusPlugin(t);
    let fail = null;
    plugin.fetchModelResponse = () => new Promise((resolve, reject) => { fail = reject; });
    const statusNode = doc.createElement("span");
    statusNode.dataset.daitKind = "translation";
    const running = plugin.testApiConnection("translation", null, statusNode);
    await Promise.resolve();
    assert.equal(plugin.isApiTestRunning("translation"), true);
    assert.equal(plugin.isApiTestRunning("polish"), false);
    let status = plugin.getLauncherStatus();
    assert.equal(status.state, "busy");
    assert.equal(status.title, "Sakura 本地 · 检测中 · 正在测试连接…");
    dispatch(doc, launcher, "click", { detail: 0 });
    t.mock.timers.tick(1);
    const popover = doc.querySelector(".dait-quick-popover");
    assert.equal(byClass(popover, "dait-qp-test").disabled, true, "a second test waits for the first");
    fail(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    await running;
    assert.equal(plugin.isApiTestRunning("translation"), false);
    status = plugin.getLauncherStatus();
    assert.equal(status.testing, false);
    assert.equal(status.state, "needs-you");
    t.mock.timers.tick(250);
    assert.equal(byClass(popover, "dait-qp-test").disabled, false);
});
