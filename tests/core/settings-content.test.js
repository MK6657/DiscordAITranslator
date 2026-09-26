"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { I18N } = require("../../src/i18n");
const { PLUGIN_CSS } = require("../../src/styles");

// Settings content (v0.4.0): overview checklist and service cards, the last connection test, model detection,
// "try a sentence" in the connection card, provider-specific help, and localized diagnostic chips.

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

const LOCAL_ENDPOINT = "http://127.0.0.1:18080/v1/chat/completions";

function createShell(t, setup = {}, env = null) {
    const { doc, win } = env || installDom(t);
    const plugin = new Plugin();
    plugin.saves = 0;
    plugin.saveSettings = () => { plugin.saves++; return true; };
    plugin.queueScan = () => {};
    plugin.toasts = [];
    plugin.showToast = (text, type) => plugin.toasts.push({ text, type });
    plugin.warnSanitized = () => {};
    plugin.getCurrentRouteKey = () => (setup.routeKey ?? "g1:c1:");
    if (setup.translationProvider) plugin.setTaskProvider("translation", setup.translationProvider);
    if (setup.polishProvider) plugin.setTaskProvider("polish", setup.polishProvider);
    if (setup.language) plugin.settings.ui.language = setup.language;
    if (setup.tab) plugin.settings.ui.settingsActiveTab = setup.tab;
    Object.assign(plugin.settings.ui, setup.ui || {});
    Object.assign(plugin.settings.translation, setup.translation || {});
    Object.assign(plugin.settings.polish, setup.polish || {});
    setup.before?.(plugin);
    const panel = plugin.getSettingsPanel({ quickSettings: true });
    doc.body.appendChild(panel);
    return { doc, win, plugin, panel, state: panel.__daitSettingsUi };
}

const rowOf = control => control.closest(".dait-settings-row");
const descriptionOf = control => rowOf(control).querySelector(".dait-row-description")?.textContent ?? "";
const visibleTab = panel => panel.querySelectorAll("[role=tabpanel]").filter(tabpanel => !tabpanel.hidden).map(tabpanel => tabpanel.dataset.daitSettingsTabPanel);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const chatReply = (content, model = "") => JSON.stringify({ ...(model ? { model } : {}), choices: [{ message: { content }, finish_reason: "stop" }] });

// ---------------------------------------------------------------------------------------------
// The last connection test (contract shared with the quick panel)
// ---------------------------------------------------------------------------------------------

test("getLastApiTestResult records ok, the model the local server reported, latency and time", async () => {
    const plugin = new Plugin();
    plugin.showToast = () => {};
    plugin.queueScan = () => {};
    plugin.saveSettings = () => true;
    plugin.scheduleTranslationCachePersist = () => {};
    plugin.setTaskProvider("translation", "sakuraLocal");
    plugin.settings.translation.endpoint = LOCAL_ENDPOINT;
    assert.equal(plugin.getLastApiTestResult("translation"), null);
    const requests = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        requests.push([endpoint, request.method || "POST"]);
        if (/\/models$/.test(endpoint)) return JSON.stringify({ data: [{ id: "models/Hy-MT2.gguf" }] });
        await new Promise(resolve => setTimeout(resolve, 15));
        return chatReply("OK", "C:/llm/models/Hy-MT2.gguf");
    };
    const before = Date.now();
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    const result = plugin.getLastApiTestResult("translation");
    assert.deepEqual(Object.keys(result).sort(), ["at", "latencyMs", "message", "model", "ok"]);
    assert.equal(result.ok, true);
    assert.equal(result.model, "Hy-MT2.gguf", "the server's model, shortened to its file name");
    assert.ok(result.latencyMs >= 10 && result.latencyMs < 5000, String(result.latencyMs));
    assert.ok(result.at >= before && result.at <= Date.now());
    assert.equal(result.message, "");
    assert.equal(plugin.getApiStatus("translation").state, "success");
    // A copy: callers cannot change the stored result.
    result.ok = false;
    assert.equal(plugin.getLastApiTestResult("translation").ok, true);
    // The model detection request comes first and is not part of the measured round trip.
    assert.deepEqual(requests.map(([endpoint, method]) => `${method} ${endpoint.replace(/^.*\/v1/, "/v1")}`), ["GET /v1/models", "POST /v1/chat/completions"]);
});

test("getLastApiTestResult: configured model for DeepSeek, none for machine translation, message on failure", async () => {
    const plugin = new Plugin();
    plugin.showToast = () => {};
    plugin.queueScan = () => {};
    plugin.saveSettings = () => true;
    plugin.settings.translation.apiKey = "sk-fake-1";
    plugin.fetchApiResponseText = async () => chatReply("OK", "deepseek-served-name");
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.equal(plugin.getLastApiTestResult("translation").model, "deepseek-v4-flash");

    plugin.settings.polish.provider = "openaiCompatible";
    plugin.settings.polish.apiKey = "sk-fake-2";
    plugin.settings.polish.model = "gpt-configured";
    plugin.fetchApiResponseText = async () => chatReply("OK", "gpt-served-2026");
    await plugin.testApiConnection("polish", null, { dataset: { daitKind: "polish" } });
    assert.equal(plugin.getLastApiTestResult("polish").model, "gpt-served-2026", "OpenAI-compatible: what the server says it ran");

    plugin.setTaskProvider("translation", "deepl");
    plugin.settings.translation.apiKey = "deepl-fake-1";
    plugin.fetchApiResponseText = async () => JSON.stringify({ translations: [{ text: "hola" }] });
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.equal(plugin.getLastApiTestResult("translation").ok, true);
    assert.equal(plugin.getLastApiTestResult("translation").model, "");

    plugin.fetchApiResponseText = async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); };
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    const failed = plugin.getLastApiTestResult("translation");
    assert.equal(failed.ok, false);
    assert.ok(failed.message.length > 0);
    assert.equal(failed.message, plugin.getApiStatus("translation").message);
    assert.equal(typeof failed.latencyMs, "number");
});

test("the last test result is dropped when the service settings change", async () => {
    const plugin = new Plugin();
    plugin.showToast = () => {};
    plugin.queueScan = () => {};
    plugin.saveSettings = () => true;
    plugin.settings.translation.apiKey = "sk-fake-1";
    plugin.fetchApiResponseText = async () => chatReply("OK");
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.ok(plugin.getLastApiTestResult("translation"));
    plugin.setSetting("translation.apiKey", "sk-fake-2");
    assert.equal(plugin.getLastApiTestResult("translation"), null);
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    plugin.setTaskProvider("translation", "sakuraLocal");
    assert.equal(plugin.getLastApiTestResult("translation"), null);
});

// ---------------------------------------------------------------------------------------------
// Model detection
// ---------------------------------------------------------------------------------------------

test("parseLocalProviderModelsResponse lists every id with { all: true } and still picks one by default", () => {
    const plugin = new Plugin();
    const raw = JSON.stringify({ data: [{ id: "qwen3-8b" }, { id: "models/Hy-MT2.gguf" }, { id: "qwen3-8b" }, { id: "list" }] });
    assert.deepEqual(plugin.parseLocalProviderModelsResponse(raw, { all: true }), ["qwen3-8b", "models/Hy-MT2.gguf"]);
    assert.equal(plugin.parseLocalProviderModelsResponse(raw), "models/Hy-MT2.gguf");
    assert.deepEqual(plugin.parseLocalProviderModelsResponse("{}", { all: true }), []);
});

test("detectProviderModels asks the server's /models, for local and remote OpenAI-compatible services", async () => {
    const plugin = new Plugin();
    plugin.saveSettings = () => true;
    plugin.scheduleTranslationCachePersist = () => {};
    const sent = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        sent.push({ endpoint, method: request.method, auth: request.headers.Authorization || "" });
        return JSON.stringify({ data: [{ id: "a-model" }, { id: "Hy-MT2.gguf" }] });
    };
    plugin.setTaskProvider("translation", "sakuraLocal");
    plugin.settings.translation.endpoint = LOCAL_ENDPOINT;
    const local = await plugin.detectProviderModels("translation");
    assert.deepEqual(local, { models: ["a-model", "Hy-MT2.gguf"], loaded: "Hy-MT2.gguf" });
    assert.deepEqual(sent.at(-1), { endpoint: "http://127.0.0.1:18080/v1/models", method: "GET", auth: "" });
    // The loaded model refreshes the detection cache used by local-model requests.
    assert.equal(plugin.getEffectiveChatCompletionModel("translation", plugin.settings.translation), "Hy-MT2.gguf");

    plugin.setTaskProvider("polish", "openaiCompatible");
    plugin.settings.polish.endpoint = "https://llm.example.test/v1/chat/completions";
    plugin.settings.polish.apiKey = "sk-fake-3";
    const remote = await plugin.detectProviderModels("polish");
    assert.deepEqual(remote, { models: ["a-model", "Hy-MT2.gguf"], loaded: "" });
    assert.deepEqual(sent.at(-1), { endpoint: "https://llm.example.test/v1/models", method: "GET", auth: "Bearer sk-fake-3" });
    // Automatic detection stays loopback-only: a remote service is never asked on its own.
    assert.equal(plugin.shouldAutoDetectLocalProviderModel({ ...plugin.settings.polish, provider: "sakuraLocal", model: "local-model" }), false);

    plugin.settings.translation.provider = "deepseek";
    await assert.rejects(plugin.detectProviderModels("translation"));
    assert.equal(sent.length, 2);
});

// ---------------------------------------------------------------------------------------------
// Overview: setup checklist and service cards
// ---------------------------------------------------------------------------------------------

const overviewOf = panel => panel.querySelector("[data-dait-settings-tab-panel=overview] .dait-overview-status");
const setupItems = panel => overviewOf(panel).querySelectorAll(".dait-setup-item");
const setupItem = (panel, id) => setupItems(panel).find(item => item.dataset.daitSetupItem === id);
const itemState = item => ["done", "todo", "error", "busy", "off"].find(state => item.classList.contains(`dait-setup-item-${state}`));

test("overview checklist: five steps with a state each; Set up opens the tab and focuses the missing field", t => {
    const { doc, panel } = createShell(t);
    const card = overviewOf(panel).querySelector(".dait-setup-card");
    assert.ok(card, "shown while something is left to do");
    assert.equal(card.getAttribute("role"), "region");
    assert.deepEqual(setupItems(panel).map(item => item.dataset.daitSetupItem), ["service", "test", "target", "auto", "channel"]);
    assert.deepEqual(setupItems(panel).map(itemState), ["todo", "todo", "done", "todo", "done"]);
    assert.match(card.querySelector(".dait-setup-title").textContent, /还差 3 步/);
    assert.match(card.querySelector(".dait-setup-progress").textContent, /^2 \/ 5/);
    // Every icon carries its state for screen readers.
    setupItems(panel).forEach(item => assert.ok(["已完成", "未完成"].includes(item.querySelector(".dait-visually-hidden").textContent)));
    // The service is missing its API key: "Set up" goes there.
    assert.match(setupItem(panel, "service").querySelector(".dait-setup-detail").textContent, /DeepSeek/);
    const setUp = setupItem(panel, "service").querySelector("button");
    assert.equal(setUp.textContent, "去设置");
    // Testing waits until the service is set up.
    assert.equal(setupItem(panel, "test").querySelector("button"), null);
    setUp.click();
    assert.deepEqual(visibleTab(panel), ["translate"]);
    assert.equal(doc.activeElement?.dataset?.daitPath, "translation.apiKey");
});

test("overview checklist: Turn on switches auto-translate on and the card hides once everything is done", async t => {
    const { plugin, panel } = createShell(t, { translation: { apiKey: "sk-fake-1", apiStatus: { state: "success", message: "" } } });
    assert.deepEqual(setupItems(panel).map(itemState), ["done", "done", "done", "todo", "done"]);
    const turnOn = setupItem(panel, "auto").querySelector("button");
    assert.equal(turnOn.textContent, "开启");
    turnOn.click();
    assert.equal(plugin.settings.ui.autoTranslateMessages, true);
    await flush();
    assert.equal(overviewOf(panel).querySelector(".dait-setup-card"), null, "all done: the checklist is gone");
    // The service cards stay.
    assert.deepEqual(overviewOf(panel).querySelectorAll(".dait-service-card").map(card => card.dataset.daitKind), ["translation", "polish"]);
});

test("overview checklist: a channel set to never translate, and a screen without a channel", t => {
    const env = installDom(t);
    const blocked = createShell(t, {
        ui: { autoTranslateMessages: true },
        translation: { apiKey: "sk-fake-1", apiStatus: { state: "success", message: "" } },
        before: plugin => plugin.setCurrentChannelAutoTranslatePolicyMode("disabled", "g1:c1:")
    }, env);
    const channel = setupItem(blocked.panel, "channel");
    assert.equal(itemState(channel), "todo");
    assert.match(channel.querySelector(".dait-setup-detail").textContent, /不翻译/);
    channel.querySelector("button").click();
    assert.deepEqual(visibleTab(blocked.panel), ["overview"]);
    assert.equal(env.doc.activeElement?.closest(".dait-settings-row")?.dataset.daitRowPath, "ui.currentChannelAutoTranslatePolicy");

    // With the main switch off, an "always translate" channel still counts as auto-translating: all done.
    const allowList = createShell(t, {
        translation: { apiKey: "sk-fake-1", apiStatus: { state: "success", message: "" } },
        before: plugin => plugin.setCurrentChannelAutoTranslatePolicyMode("enabled", "g1:c1:")
    }, env);
    assert.equal(allowList.plugin.settings.ui.autoTranslateMessages, false);
    const auto = allowList.plugin.getOverviewSetupItems().find(item => item.id === "auto");
    assert.deepEqual([auto.done, auto.detail], [true, "总开关关闭，本频道总是翻译"]);
    assert.equal(overviewOf(allowList.panel).querySelector(".dait-setup-card"), null);

    const noChannel = createShell(t, { routeKey: "@me::", ui: { autoTranslateMessages: true }, translation: { apiKey: "sk-fake-1", apiStatus: { state: "success", message: "" } } }, env);
    assert.equal(overviewOf(noChannel.panel).querySelector(".dait-setup-card"), null, "no channel counts as done");
});

test("overview service cards: state, last test details, Test runs the test and every view follows", async t => {
    const { plugin, panel } = createShell(t, {
        translationProvider: "sakuraLocal",
        translation: { endpoint: LOCAL_ENDPOINT },
        polish: { enabled: false },
        before: plugin => {
            plugin.scheduleTranslationCachePersist = () => {};
            plugin.fetchApiResponseText = async endpoint => /\/models$/.test(endpoint)
                ? JSON.stringify({ data: [{ id: "Hy-MT2.gguf" }] })
                : chatReply("OK", "Hy-MT2.gguf");
        }
    });
    const cards = overviewOf(panel).querySelectorAll(".dait-service-card");
    assert.equal(cards[0].querySelector(".dait-service-card-title").textContent, "翻译消息 · Sakura 本地");
    assert.equal(cards[0].querySelector(".dait-api-status").textContent, "未检测");
    // Polishing is off: a dash, "Off" and Set up instead of Test.
    assert.equal(cards[1].querySelector(".dait-status-mark-off").textContent, "已关闭");
    assert.equal(cards[1].querySelector("button").dataset.daitOverviewAction, "setup");

    await plugin.runOverviewApiTest("translation", cards[0].querySelector("button"), cards[0].querySelector(".dait-api-status"));
    await flush();
    assert.equal(plugin.getApiStatus("translation").state, "success");
    const card = overviewOf(panel).querySelectorAll(".dait-service-card")[0];
    assert.equal(card.querySelector(".dait-api-status").textContent, "连接正常");
    assert.match(card.querySelector(".dait-api-test-detail").textContent, /^Hy-MT2\.gguf · \d+ ms · 刚刚$/);
    // The connection card header on the translate tab shows the same.
    const header = panel.querySelector("[data-dait-settings-tab-panel=translate] .dait-provider-settings-header");
    assert.equal(header.querySelector(".dait-api-status").textContent, "连接正常");
    assert.match(header.querySelector(".dait-api-test-detail").textContent, /^Hy-MT2\.gguf · \d+ ms · 刚刚$/);
    // And the checklist's test step is done with the same details.
    const testStep = setupItem(panel, "test");
    assert.equal(itemState(testStep), "done");
    assert.match(testStep.querySelector(".dait-setup-detail").textContent, /^连接正常 · Hy-MT2\.gguf · \d+ ms · 刚刚$/);
});

test("a failed test shows its message next to the status; the detail follows the badge's state", async t => {
    const { plugin, panel } = createShell(t, { tab: "translate", translation: { apiKey: "sk-fake-1" } });
    plugin.fetchApiResponseText = async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); };
    const header = panel.querySelector("[data-dait-settings-tab-panel=translate] .dait-provider-settings-header");
    header.querySelector("[data-dait-action=apiTest]").click();
    await flush();
    await flush();
    const detail = header.querySelector(".dait-api-test-detail");
    assert.equal(detail.dataset.daitFor, "failed");
    assert.equal(detail.textContent, plugin.getApiStatus("translation").message);
    assert.ok(detail.textContent.length > 0);
    const item = setupItem(panel, "test");
    assert.equal(itemState(item), "error");
    assert.equal(item.querySelector(".dait-setup-detail").textContent, plugin.getApiStatus("translation").message);
    // The CSS hides a detail whose state no longer matches the badge.
    assert.match(PLUGIN_CSS, /\.dait-api-status:not\(\.dait-api-status-failed\) \+ \.dait-api-test-detail\[data-dait-for="failed"\]/);
    assert.match(PLUGIN_CSS, /\.dait-api-status:not\(\.dait-api-status-success\) \+ \.dait-api-test-detail\[data-dait-for="success"\]/);
});

test("time and latency formats", () => {
    const plugin = new Plugin();
    const now = Date.now();
    assert.equal(plugin.formatLatency(820), "820 ms");
    assert.equal(plugin.formatLatency(1100), "1.1 s");
    assert.equal(plugin.formatLatency(null), "");
    assert.equal(plugin.formatTimeAgo(now - 5000, now), "刚刚");
    assert.equal(plugin.formatTimeAgo(now - 5 * 60000, now), "5 分钟前");
    assert.equal(plugin.formatTimeAgo(now - 3 * 3600000, now), "3 小时前");
    plugin.settings.ui.language = "en";
    assert.equal(plugin.formatTimeAgo(now - 5000, now), "just now");
    assert.equal(plugin.formatApiTestResult({ ok: true, model: "Hy-MT2", latencyMs: 820, at: now }), "Hy-MT2 · 820 ms · just now");
    assert.equal(plugin.formatApiTestResult({ ok: true, model: "", latencyMs: 90, at: now }), "90 ms · just now");
});

// ---------------------------------------------------------------------------------------------
// Connection card: model detection, try a sentence, provider-specific help
// ---------------------------------------------------------------------------------------------

const cardOf = (panel, kind) => panel.querySelector(`[data-dait-settings-tab-panel=${kind === "polish" ? "compose" : "translate"}] .dait-provider-settings-block`);

test("Sakura's model field: presets and 'use the loaded model' in the picker; Detect models adds the server's models", async t => {
    const { plugin, panel } = createShell(t, {
        translationProvider: "sakuraLocal",
        translation: { endpoint: LOCAL_ENDPOINT },
        before: plugin => { plugin.scheduleTranslationCachePersist = () => {}; }
    });
    const card = cardOf(panel, "translation");
    const input = card.querySelector("[data-dait-path='translation.model']");
    const row = rowOf(input);
    assert.ok(row.classList.contains("dait-settings-row-stacked"));
    assert.equal(row.querySelector(".dait-row-label").getAttribute("for"), input.id);
    const picker = card.querySelector(".dait-model-picker");
    assert.equal(picker.hidden, false);
    assert.equal(picker.dataset.daitModelPreset, "translation");
    assert.equal(picker.options[0].value, "local-model");
    assert.equal(picker.options[0].textContent, "使用服务端已加载的模型（local-model）");
    assert.equal(picker.value, "local-model");
    assert.ok(picker.options.some(option => option.value === "HY-MT1.5-7B-Q4_K_M.gguf"));
    assert.equal(descriptionOf(input), "local-model 表示使用服务端已加载的模型。");
    // No separate preset row any more.
    assert.equal(card.querySelectorAll("select").filter(select => select.dataset.daitModelPreset === "translation").length, 1);

    const sent = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        sent.push(`${request.method} ${endpoint}`);
        return JSON.stringify({ data: [{ id: "Hy-MT2.gguf" }, { id: "qwen3-8b" }] });
    };
    const detect = card.querySelector("[data-dait-action=detectModels]");
    assert.equal(detect.textContent, "检测模型");
    assert.equal(sent.length, 0, "nothing is asked before the click");
    detect.click();
    await flush();
    assert.deepEqual(sent, ["GET http://127.0.0.1:18080/v1/models"]);
    const detected = picker.querySelectorAll("optgroup")[0];
    assert.equal(detected.getAttribute("label"), "服务端列出的模型");
    assert.deepEqual(detected.children.map(option => [option.value, option.textContent]), [["Hy-MT2.gguf", "Hy-MT2.gguf（已加载）"], ["qwen3-8b", "qwen3-8b"]]);
    assert.equal(descriptionOf(input), "检测到 2 个模型，已加载：Hy-MT2.gguf。");
    assert.equal(detect.disabled, false);
    // Picking one writes the model field; "use the loaded model" goes back to local-model.
    picker.value = "qwen3-8b";
    picker.dispatch("change");
    assert.equal(plugin.settings.translation.model, "qwen3-8b");
    assert.equal(input.value, "qwen3-8b");
    picker.value = "local-model";
    picker.dispatch("change");
    assert.equal(plugin.settings.translation.model, "local-model");
    // A typed name the picker does not know shows as "other".
    input.value = "my-own.gguf";
    input.dispatch("change");
    assert.equal(picker.value, "");
});

test("OpenAI-compatible: the picker appears after detection; a failed detection says why; DeepSeek has no Detect", async t => {
    const env = installDom(t);
    const { plugin, panel } = createShell(t, { polishProvider: "openaiCompatible", polish: { apiKey: "sk-fake-2", endpoint: "https://llm.example.test/v1/chat/completions" } }, env);
    const card = cardOf(panel, "polish");
    const picker = card.querySelector(".dait-model-picker");
    assert.equal(picker.hidden, true);
    assert.equal(descriptionOf(card.querySelector("[data-dait-path='polish.model']")), "服务提供的模型名，可点“检测模型”列出。");
    plugin.fetchApiResponseText = async () => JSON.stringify({ data: [{ id: "gpt-a" }, { id: "gpt-b" }] });
    card.querySelector("[data-dait-action=detectModels]").click();
    await flush();
    assert.equal(picker.hidden, false);
    assert.equal(picker.options[0].value, "gpt-a", "no local-model entry for a remote service");
    assert.equal(descriptionOf(card.querySelector("[data-dait-path='polish.model']")), "检测到 2 个模型，可在列表中选择。");

    plugin.fetchApiResponseText = async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); };
    card.querySelector("[data-dait-action=detectModels]").click();
    await flush();
    const description = rowOf(card.querySelector("[data-dait-path='polish.model']")).querySelector(".dait-row-description");
    assert.match(description.textContent, /^检测失败：/);
    assert.ok(description.classList.contains("dait-row-description-error"));

    const deepseek = createShell(t, {}, env);
    assert.equal(cardOf(deepseek.panel, "translation").querySelector("[data-dait-action=detectModels]"), null);
    assert.ok(cardOf(deepseek.panel, "translation").querySelector("[data-dait-path='translation.model']"));
});

test("try a sentence / try polishing: current settings, result with the time it took, errors inline", async t => {
    const { plugin, panel } = createShell(t, { translation: { apiKey: "sk-fake-1" }, polish: { apiKey: "sk-fake-2" } });
    const calls = [];
    plugin.runModelTask = async (kind, text, options) => {
        calls.push({ kind, text, options, target: plugin.settings.translation.targetLanguage });
        return kind === "polish" ? "polished!" : "translated!";
    };
    const translateRow = cardOf(panel, "translation").querySelector(".dait-try-row");
    assert.equal(translateRow.querySelector(".dait-row-label").textContent, "试译一句");
    const input = translateRow.querySelector("input");
    assert.equal(translateRow.querySelector(".dait-row-label").getAttribute("for"), input.id);
    assert.equal(input.dataset.daitPath, undefined, "not a setting");
    const run = translateRow.querySelector("[data-dait-action=tryTask]");
    const result = translateRow.querySelector(".dait-try-result");
    assert.equal(result.hidden, true);

    run.click();
    await flush();
    assert.equal(calls.length, 0);
    assert.equal(result.hidden, false);
    assert.equal(result.querySelector(".dait-try-output").textContent, "先输入一句话。");

    // Unsaved-to-disk settings are used as they are now.
    plugin.settings.translation.targetLanguage = "日语";
    input.value = "See you tomorrow";
    input.dispatch("keydown", { key: "Enter", isComposing: false });
    await flush();
    assert.deepEqual(calls[0], { kind: "translation", text: "See you tomorrow", options: { mode: "test" }, target: "日语" });
    assert.equal(result.querySelector(".dait-try-output").textContent, "translated!");
    assert.match(result.querySelector(".dait-try-time").textContent, /^用时 \d+ ms$/);
    assert.equal(result.classList.contains("dait-try-result-error"), false);
    assert.equal(run.textContent, "试译");
    assert.equal(run.disabled, false);

    const polishRow = cardOf(panel, "polish").querySelector(".dait-try-row");
    assert.equal(polishRow.querySelector(".dait-row-label").textContent, "试润色");
    polishRow.querySelector("input").value = "see u tmrw";
    polishRow.querySelector("[data-dait-action=tryTask]").click();
    await flush();
    assert.equal(calls[1].kind, "polish");
    assert.equal(polishRow.querySelector(".dait-try-output").textContent, "polished!");

    plugin.runModelTask = async () => { throw Object.assign(new Error("Unauthorized"), { status: 401 }); };
    run.click();
    await flush();
    assert.ok(result.classList.contains("dait-try-result-error"));
    assert.ok(result.querySelector(".dait-try-output").textContent.length > 0);
});

test("endpoint, model and API key help fit the selected service; Sakura's key says optional", t => {
    const env = installDom(t);
    const texts = provider => {
        const { panel } = createShell(t, { translationProvider: provider }, env);
        const card = cardOf(panel, "translation");
        const read = path => {
            const control = card.querySelector(`[data-dait-path='${path}']`);
            return control ? { description: descriptionOf(control), placeholder: control.placeholder } : null;
        };
        return { endpoint: read("translation.endpoint"), model: read("translation.model"), apiKey: read("translation.apiKey") };
    };
    const deepseek = texts("deepseek");
    assert.match(deepseek.endpoint.description, /DeepSeek/);
    assert.match(deepseek.apiKey.description, /DeepSeek/);
    assert.equal(deepseek.apiKey.placeholder, "sk-...");
    assert.equal(deepseek.endpoint.placeholder, "https://api.deepseek.com/chat/completions");

    const sakura = texts("sakuraLocal");
    assert.match(sakura.endpoint.description, /本机/);
    assert.match(sakura.apiKey.description, /^可选/);
    assert.equal(sakura.apiKey.placeholder, "可留空");

    const openai = texts("openaiCompatible");
    assert.match(openai.endpoint.description, /chat\/completions/);

    for (const provider of ["microsoft", "baidu", "sakuraLocal", "deepl"]) {
        const all = Object.values(texts(provider)).filter(Boolean).map(item => item.description).join(" ");
        assert.doesNotMatch(all, /DeepSeek|OpenAI|chat\/completions|Sakura 本地可以留空/, provider);
    }
    assert.match(texts("microsoft").endpoint.description, /Azure/);
    assert.match(texts("baidu").endpoint.description, /百度/);
});

test("language rows: one-sentence description; the custom-language note is the custom field's own description", t => {
    const { panel } = createShell(t, { tab: "translate" });
    const card = panel.querySelector("[data-dait-settings-tab-panel=translate]");
    const customs = card.querySelectorAll(".dait-language-custom");
    assert.ok(customs.length >= 2);
    customs.forEach(custom => {
        assert.equal(custom.title, I18N["zh-CN"].customLanguageDesc);
        assert.equal(custom.getAttribute("aria-description"), I18N["zh-CN"].customLanguageDesc);
        const description = rowOf(custom).querySelector(".dait-row-description").textContent;
        assert.equal(description.includes(I18N["zh-CN"].customLanguageDesc), false);
        assert.ok((description.match(/。/g) || []).length <= 1, description);
    });
});

// ---------------------------------------------------------------------------------------------
// Diagnostic summary chips, and the data tab without test mode
// ---------------------------------------------------------------------------------------------

test("diagnostic summary chips show short localized labels; unknown codes stay as they are", t => {
    installDom(t);
    const plugin = new Plugin();
    const summary = {
        top: {
            messageStates: [{ key: "cacheHit", count: 2 }],
            reasonCodes: [{ key: "provider-cooldown", count: 3 }, { key: "brand-new-code", count: 1 }],
            providers: [{ key: "sakuraLocal", count: 4 }],
            failureLayers: [{ key: "request", count: 1 }]
        },
        queue: {}
    };
    const chips = plugin.createDiagnosticSummaryPanel(summary).querySelectorAll(".dait-diagnostic-chip");
    assert.deepEqual(chips.map(chip => chip.textContent), ["缓存命中: 2", "服务冷却中: 3", "brand-new-code: 1", "Sakura 本地: 4", "请求: 1"]);
    assert.deepEqual(chips.map(chip => chip.title), ["cacheHit", "provider-cooldown", "brand-new-code", "sakuraLocal", "request"]);
    plugin.settings.ui.language = "en";
    const english = plugin.createDiagnosticSummaryPanel(summary).querySelectorAll(".dait-diagnostic-chip");
    assert.deepEqual(english.map(chip => chip.textContent), ["Cache hit: 2", "Service cooling down: 3", "brand-new-code: 1", "Sakura local: 4", "Request: 1"]);
});

test("the chip label table covers every enumerated code in both languages", () => {
    const { DIAGNOSTIC_CODE_LABELS } = require("../../src/diagnostics/diagnostic-labels");
    const constants = require("../../src/constants");
    const zh = Object.keys(DIAGNOSTIC_CODE_LABELS["zh-CN"]).sort();
    assert.deepEqual(Object.keys(DIAGNOSTIC_CODE_LABELS.en).sort(), zh);
    const codes = [
        ...Object.values(constants.DIAGNOSTIC_REASON_CODES),
        ...Object.values(constants.DIAGNOSTIC_MESSAGE_STATES),
        ...Object.values(constants.DIAGNOSTIC_FAILURE_CLASSES),
        ...Object.values(constants.DIAGNOSTIC_FAILURE_LAYERS)
    ];
    assert.deepEqual([...new Set(codes)].filter(code => !zh.includes(code)), []);
    for (const locale of ["zh-CN", "en"]) {
        for (const [code, label] of Object.entries(DIAGNOSTIC_CODE_LABELS[locale])) {
            assert.ok(label && label.length <= 24, `${locale}.${code}`);
        }
    }
});

test("styles: new overview, model and try components use the shared type scale", () => {
    for (const selector of [".dait-setup-card", ".dait-setup-item", ".dait-service-card", ".dait-model-field", ".dait-try-result", ".dait-api-test-detail"]) {
        assert.ok(PLUGIN_CSS.includes(selector), selector);
    }
    assert.equal(PLUGIN_CSS.includes(".dait-test-mode-section"), false, "test-mode styles are gone");
    // Nothing in the new components is smaller than 12 px.
    const block = PLUGIN_CSS.slice(PLUGIN_CSS.indexOf(".dait-settings .dait-visually-hidden"), PLUGIN_CSS.indexOf("/* Prompt templates and the prompt editor"));
    for (const [, size] of block.matchAll(/font-size:\s*(\d+)px/g)) assert.ok(Number(size) >= 12, size);
});

