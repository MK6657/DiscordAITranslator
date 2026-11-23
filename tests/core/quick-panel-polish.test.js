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
    doc.layout = element => element.classList.contains("dait-quick-popover") ? { top: 0, left: 0, width: 360, height: 600, right: 360, bottom: 600 } : null;
    return doc;
}

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

function byId(root, id) {
    if (!root) return null;
    if (root.id === id) return root;
    for (const child of root.children) {
        const found = byId(child, id);
        if (found) return found;
    }
    return null;
}

function createHarness(t, options = {}) {
    t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 1_000_000 });
    const doc = createDocument();
    const win = new FakeEventTarget();
    win.innerWidth = 1280;
    win.innerHeight = 900;
    win.location = { pathname: "/channels/111/222" };
    useGlobals(t, { document: doc, window: win });
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.language = options.locale || "zh-CN";
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.toasts = [];
    plugin.showToast = (message, type) => plugin.toasts.push({ message, type });
    plugin.fullSettingsOpens = [];
    plugin.openQuickSettingsPanel = (source, launcher) => { plugin.fullSettingsOpens.push({ source, launcher }); return null; };
    plugin.getDiscordNamedStore = name => name === "ChannelStore"
        ? { getChannel: id => ({ 222: { name: "general" } })[id] || null }
        : null;
    const userPanel = doc.createElement("section");
    doc.body.appendChild(userPanel);
    const launcher = plugin.createQuickSettingsButton("panel", userPanel);
    userPanel.appendChild(launcher);
    launcher.rect = { left: 200, top: 850, width: 32, height: 32, right: 232, bottom: 882 };
    return { plugin, doc, win, launcher };
}

test("quick panel remembers the last active tab across close/reopen and supports keyboard tab navigation", t => {
    const { plugin, doc, launcher } = createHarness(t);
    let popover = plugin.openQuickPopover(launcher);
    const tabTrans = byId(popover, "dait-quick-popover-tab-translation");
    const tabPolish = byId(popover, "dait-quick-popover-tab-polish");
    const panelTrans = byId(popover, "dait-quick-popover-panel-translation");
    const panelPolish = byId(popover, "dait-quick-popover-panel-polish");

    assert.equal(plugin.settings.ui.quickPanelActiveTab, "translation");
    assert.equal(tabTrans.getAttribute("aria-selected"), "true");
    assert.equal(panelTrans.hidden, false);
    assert.equal(panelPolish.hidden, true);
    assert.equal(popover.querySelector(".dait-qp-footer-open-full").textContent, "打开完整设置");

    // Clicking the polish tab switches panels and persists the choice.
    dispatch(doc, tabPolish, "click");
    assert.equal(plugin.settings.ui.quickPanelActiveTab, "polish");
    assert.equal(popover.dataset.daitTab, "polish");
    assert.equal(tabPolish.getAttribute("aria-selected"), "true");
    assert.equal(tabTrans.getAttribute("aria-selected"), "false");
    assert.equal(panelTrans.hidden, true);
    assert.equal(panelPolish.hidden, false);
    assert.equal(popover.querySelector(".dait-qp-footer-open-full").textContent, "编辑模板与完整设置");

    // Focusables exclude hidden tabpanel controls.
    const focusables = plugin.quickPanel.getFocusableElements();
    assert.ok(focusables.every(node => !panelTrans.contains(node)), "hidden translation controls are skipped");
    assert.ok(focusables.some(node => panelPolish.contains(node)), "visible polish controls are included");

    // Closing and reopening brings back the polish tab automatically.
    plugin.closeQuickPopover("close");
    popover = plugin.openQuickPopover(launcher);
    assert.equal(popover.dataset.daitTab, "polish");
    assert.equal(byId(popover, "dait-quick-popover-panel-polish").hidden, false);
    assert.equal(byId(popover, "dait-quick-popover-panel-translation").hidden, true);

    // ArrowLeft on the tablist moves back to translation and focuses the tab.
    byId(popover, "dait-quick-popover-tab-polish").focus();
    key(doc, "ArrowLeft");
    assert.equal(plugin.settings.ui.quickPanelActiveTab, "translation");
    assert.equal(doc.activeElement, byId(popover, "dait-quick-popover-tab-translation"));

    // Invalid persisted tab values normalize back to translation.
    plugin.settings.ui.quickPanelActiveTab = "unknown-tab";
    plugin.ensureSettingsShape();
    assert.equal(plugin.settings.ui.quickPanelActiveTab, "translation");
});

test("saved services can be picked independently for translation and polish, filtering machine engines out of polish", t => {
    const { plugin, doc, launcher } = createHarness(t);
    plugin.settings.serviceConfigs = plugin.normalizeSavedServiceConfigs([
        {
            id: "svc-openai",
            provider: "openaiCompatible",
            apiKey: "sk-synth-openai-1",
            endpoint: "https://api.example.test/v1/chat/completions",
            model: "chat-fast",
            latencyMs: 620
        },
        {
            id: "svc-deepseek",
            provider: "deepseek",
            apiKey: "sk-synth-deepseek-1",
            endpoint: "https://api.deepseek.com/chat/completions",
            model: "deepseek-v4-flash",
            latencyMs: 410
        },
        {
            id: "svc-google",
            provider: "googleCloud",
            endpoint: "https://translation.googleapis.com/language/translate/v2",
            model: "nmt",
            latencyMs: 180
        }
    ]);
    plugin.applySavedServiceConfig("translation", "svc-openai", { silent: true, save: false, refreshUi: false });
    plugin.applySavedServiceConfig("polish", "svc-openai", { silent: true, save: false, refreshUi: false });

    const popover = plugin.openQuickPopover(launcher);
    const transSvc = byId(popover, "dait-quick-popover-translation-service");
    const polishSvc = byId(popover, "dait-quick-popover-polish-service");
    const relationChip = popover.querySelector(".dait-qp-service-chip");
    const transTplRow = popover.querySelector(".dait-qp-template-row");

    assert.deepEqual(transSvc.options.map(option => option.value), ["svc-openai", "svc-deepseek", "svc-google"]);
    assert.deepEqual(polishSvc.options.map(option => option.value), ["svc-openai", "svc-deepseek"], "Google Cloud is excluded from polish");
    assert.equal(transSvc.value, "svc-openai");
    assert.equal(polishSvc.value, "svc-openai");
    assert.equal(relationChip.textContent, "与翻译共用");
    assert.equal(relationChip.dataset.daitRelation, "shared");
    assert.equal(transTplRow.hidden, false, "LLM translation shows translation template selector");

    // Switch polish service to DeepSeek without altering translation.
    dispatch(doc, byId(popover, "dait-quick-popover-tab-polish"), "click");
    polishSvc.value = "svc-deepseek";
    dispatch(doc, polishSvc, "change");
    assert.equal(plugin.settings.polish.provider, "deepseek");
    assert.equal(plugin.settings.polish.model, "deepseek-v4-flash");
    assert.equal(plugin.settings.translation.provider, "openaiCompatible", "translation service stays unchanged");
    assert.equal(plugin.settings.translation.model, "chat-fast");
    assert.equal(relationChip.textContent, "独立服务");
    assert.equal(relationChip.dataset.daitRelation, "separate");
    assert.equal(byId(popover, "dait-quick-popover-panel-polish").querySelector(".dait-qp-status-line").textContent, "DeepSeek · 连接正常");

    // Switch translation service to Google Cloud: hides LLM translation templates and keeps polish on DeepSeek.
    dispatch(doc, byId(popover, "dait-quick-popover-tab-translation"), "click");
    transSvc.value = "svc-google";
    dispatch(doc, transSvc, "change");
    assert.equal(plugin.settings.translation.provider, "googleCloud");
    assert.equal(plugin.settings.polish.provider, "deepseek", "polish service stays unchanged");
    assert.equal(transTplRow.hidden, true, "machine translation engine hides prompt templates");
});

test("polish tab controls bind output language, template, creativity, behavior, bilingual options, and full-settings jump", t => {
    const { plugin, doc, launcher } = createHarness(t);
    plugin.settings.ui.quickPanelActiveTab = "polish";
    plugin.settings.polish.provider = "openaiCompatible";
    plugin.settings.polish.apiKey = "sk-synth-polish-1";
    plugin.settings.polish.endpoint = "https://api.example.test/v1/chat/completions";
    plugin.settings.polish.model = "chat-fast";

    const popover = plugin.openQuickPopover(launcher);
    const polishPanel = byId(popover, "dait-quick-popover-panel-polish");
    const enabledSwitch = byId(popover, "dait-quick-popover-polish-enabled");
    const targetSelect = byId(popover, "dait-quick-popover-polish-target");
    const tplSelect = byId(popover, "dait-quick-popover-polish-template");
    const tempRange = byId(popover, "dait-quick-popover-polish-temperature");
    const tempValue = popover.querySelector(".dait-qp-temp-value");
    const presets = popover.querySelectorAll(".dait-qp-preset");
    const bilingualSwitch = byId(popover, "dait-quick-popover-public-bilingual");
    const bilingualAfterSwitch = byId(popover, "dait-quick-popover-public-bilingual-after");
    const bilingualAfterRow = bilingualAfterSwitch.closest(".dait-qp-row");

    // Output language change updates settings and tab summary chip.
    targetSelect.value = "繁體中文";
    dispatch(doc, targetSelect, "change");
    assert.equal(plugin.settings.polish.targetLanguage, "繁體中文");
    assert.equal(byId(popover, "dait-quick-popover-tab-polish").querySelector(".dait-qp-tab-summary").textContent, "开 · 繁體中文");

    // Template selection applies prompt template.
    tplSelect.value = "polish-gaming-chat";
    dispatch(doc, tplSelect, "change");
    assert.equal(plugin.settings.polish.activePromptTemplate, "polish-gaming-chat");
    assert.match(plugin.settings.polish.prompt, /游戏/);

    // Creativity preset and slider both update polish.temperature.
    dispatch(doc, presets[2], "click");
    assert.equal(plugin.settings.polish.temperature, 1.2);
    assert.equal(tempRange.value, "1.2");
    assert.equal(tempValue.textContent, "1.2");
    assert.equal(presets[2].getAttribute("aria-pressed"), "true");

    tempRange.value = "0.6";
    dispatch(doc, tempRange, "change");
    assert.equal(plugin.settings.polish.temperature, 0.6);
    assert.equal(tempValue.textContent, "0.6");

    // After-action & repolish source segmented controls.
    const confirmBtn = byId(popover, "dait-quick-popover-polish-after").children.find(btn => btn.dataset.daitValue === "confirmSend");
    dispatch(doc, confirmBtn, "click");
    assert.equal(plugin.settings.polish.afterAction, "confirmSend");

    const lastBtn = byId(popover, "dait-quick-popover-polish-repolish").children.find(btn => btn.dataset.daitValue === "lastResult");
    dispatch(doc, lastBtn, "click");
    assert.equal(plugin.settings.polish.repolishSource, "lastResult");

    // Public bilingual reveals sub-toggle.
    assert.equal(bilingualAfterRow.hidden, true);
    bilingualSwitch.checked = true;
    dispatch(doc, bilingualSwitch, "change");
    assert.equal(plugin.settings.ui.publicBilingualInputButton, true);
    assert.equal(bilingualAfterRow.hidden, false);
    bilingualAfterSwitch.checked = true;
    dispatch(doc, bilingualAfterSwitch, "change");
    assert.equal(plugin.settings.ui.publicBilingualAfterPolish, true);

    // Turning polish off disables dependent polish controls while keeping service & test interactive.
    enabledSwitch.checked = false;
    dispatch(doc, enabledSwitch, "change");
    assert.equal(plugin.settings.polish.enabled, false);
    assert.equal(targetSelect.disabled, true);
    assert.equal(tplSelect.disabled, true);
    assert.equal(tempRange.disabled, true);
    assert.equal(polishPanel.querySelector(".dait-qp-test").disabled, false);
    assert.equal(bilingualSwitch.disabled, false);
    assert.equal(bilingualAfterSwitch.disabled, true);

    // Clicking "编辑模板与完整设置" opens full settings directly on the compose tab.
    dispatch(doc, popover.querySelector(".dait-qp-footer-open-full"), "click");
    assert.equal(plugin.settings.ui.settingsActiveTab, "compose");
    assert.deepEqual(plugin.fullSettingsOpens, [{ source: "quick-panel", launcher }]);
});

test("polish tab runs its own API test and quick try-polish drawer, and preserves tab on language switch", async t => {
    const { plugin, doc, launcher } = createHarness(t);
    plugin.settings.ui.quickPanelActiveTab = "polish";
    plugin.settings.polish.provider = "openaiCompatible";
    plugin.settings.polish.apiKey = "sk-synth-polish-2";
    plugin.settings.polish.endpoint = "https://api.example.test/v1/chat/completions";
    plugin.settings.polish.model = "chat-fast";

    const popover = plugin.openQuickPopover(launcher);
    const polishPanel = byId(popover, "dait-quick-popover-panel-polish");
    const testCalls = [];
    plugin.testApiConnection = async (kind, button, statusSink) => {
        testCalls.push({ kind, statusKind: statusSink?.dataset?.daitKind });
        plugin.setApiStatus(statusSink, "success", plugin.t("apiStatusSuccess"));
        plugin.recordApiTestResult(kind, { ok: true, model: "chat-fast", latencyMs: 320, at: Date.now() });
    };

    const polishTestBtn = polishPanel.querySelector(".dait-qp-test");
    dispatch(doc, polishTestBtn, "click");
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(testCalls, [{ kind: "polish", statusKind: "polish" }]);
    assert.equal(polishPanel.querySelector(".dait-qp-status-line").textContent, "OpenAI 兼容 · 连接正常");
    assert.equal(polishPanel.querySelector(".dait-qp-status-test").textContent, "chat-fast · 320 ms");

    // Expand quick try-polish drawer and run a sample.
    const tryToggle = popover.querySelector(".dait-qp-try-toggle");
    const tryBody = popover.querySelector(".dait-qp-try-body");
    const tryInput = byId(popover, "dait-quick-popover-try-polish-input");
    const tryRun = popover.querySelector(".dait-qp-try-run");
    const tryOutput = popover.querySelector(".dait-qp-try-output");
    const tryResult = popover.querySelector(".dait-qp-try-result");
    assert.equal(tryBody.hidden, true);
    dispatch(doc, tryToggle, "click");
    assert.equal(tryBody.hidden, false);

    const tryCalls = [];
    plugin.runTryTask = async (kind, text, opts) => {
        tryCalls.push({ kind, text, historySize: opts?.tryHistory?.results?.length || 0 });
        opts.output.textContent = "明晚八點一起打兩把嗎？";
        opts.result.hidden = false;
        opts.tryHistory.text = text;
        opts.tryHistory.results.push("明晚八點一起打兩把嗎？");
        return "明晚八點一起打兩把嗎？";
    };
    tryInput.value = "明天晚上一起打两把吗";
    dispatch(doc, tryRun, "click");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(tryCalls.length, 1);
    assert.equal(tryCalls[0].kind, "polish");
    assert.equal(tryResult.hidden, false);
    assert.equal(tryOutput.textContent, "明晚八點一起打兩把嗎？");
    assert.equal(tryRun.textContent, "再润一次");

    // Switching interface language while open on polish tab keeps polish tab active and translates labels.
    byId(popover, "dait-quick-popover-polish-target").focus();
    plugin.setSetting("ui.language", "en");
    const rebuilt = doc.querySelector(".dait-quick-popover");
    assert.equal(rebuilt.dataset.daitTab, "polish");
    assert.equal(byId(rebuilt, "dait-quick-popover-tab-polish").textContent.includes("Polish"), true);
    assert.equal(rebuilt.querySelector(".dait-qp-footer-open-full").textContent, "Templates & full settings");
    assert.equal(doc.activeElement, byId(rebuilt, "dait-quick-popover-polish-target"));

    // IME Escape inside the quick panel does not close it.
    let imePrevented = false;
    plugin.quickPanel.handleDocumentKeydown({ key: "Escape", isComposing: true, preventDefault() { imePrevented = true; }, stopPropagation() {}, stopImmediatePropagation() {} });
    assert.equal(imePrevented, false);
    assert.equal(plugin.quickPanel.isOpen(), true);

    // Rerendering for language change while a quick try-polish request is in flight does not leave the new Try button stuck disabled.
    const tryToggle2 = rebuilt.querySelector(".dait-qp-try-toggle");
    if (rebuilt.querySelector(".dait-qp-try-body").hidden) dispatch(doc, tryToggle2, "click");
    const tryInput2 = byId(rebuilt, "dait-quick-popover-try-polish-input");
    const tryRun2 = rebuilt.querySelector(".dait-qp-try-run");
    let resolveInFlight;
    plugin.runTryTask = () => new Promise(resolve => { resolveInFlight = resolve; });
    tryInput2.value = "test line";
    dispatch(doc, tryRun2, "click");
    assert.equal(plugin.quickPanel.tryRunning, true);
    plugin.setSetting("ui.language", "zh-CN");
    const rebuiltDuringRun = doc.querySelector(".dait-quick-popover");
    const tryRunDuring = rebuiltDuringRun.querySelector(".dait-qp-try-run");
    assert.equal(tryRunDuring.disabled, true);
    resolveInFlight("polished");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(plugin.quickPanel.tryRunning, false);
    assert.equal(tryRunDuring.disabled, false, "new Try button recovers once the in-flight run finishes");
});
