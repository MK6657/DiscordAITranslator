"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");
const { DEFAULT_SETTINGS } = require("../../src/constants");

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

// --- A small DOM: enough elements, attributes, events and selectors for the chat-line code. ---

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

function parseSelectorList(selector) {
    return String(selector).split(",").map(part => {
        const trimmed = part.trim();
        const scoped = trimmed.startsWith(":scope >");
        return { scoped, compound: parseCompound(scoped ? trimmed.slice(8).trim() : trimmed) };
    });
}

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

class FakeElement {
    constructor(tag, doc) {
        this.nodeType = 1;
        this.tagName = String(tag).toUpperCase();
        this.ownerDocument = doc;
        this.children = [];
        this.parentElement = null;
        this.dataset = {};
        this.attributes = new Map();
        this.listeners = new Map();
        this.classList = new FakeClassList();
        this.style = { setProperty() {}, removeProperty() {}, getPropertyValue: () => "" };
        this.ownText = "";
        this.disabled = false;
        this.type = "";
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
    get firstChild() { return this.children[0] || null; }
    get lastChild() { return this.children[this.children.length - 1] || null; }
    get nextSibling() {
        const siblings = this.parentElement?.children || [];
        return siblings[siblings.indexOf(this) + 1] || null;
    }
    get previousSibling() {
        const siblings = this.parentElement?.children || [];
        return siblings[siblings.indexOf(this) - 1] || null;
    }

    setAttribute(name, value) {
        if (name.startsWith("data-")) this.dataset[toDatasetKey(name)] = String(value);
        else if (name === "class") this.className = value;
        else this.attributes.set(name, String(value));
    }
    getAttribute(name) {
        if (name.startsWith("data-")) return this.dataset[toDatasetKey(name)] ?? null;
        if (name === "class") return this.className || null;
        if (name === "id") return this.id ?? null;
        return this.attributes.has(name) ? this.attributes.get(name) : null;
    }
    removeAttribute(name) {
        if (name.startsWith("data-")) delete this.dataset[toDatasetKey(name)];
        else this.attributes.delete(name);
    }
    hasAttribute(name) { return this.getAttribute(name) !== null; }

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

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push(handler);
    }
    dispatch(type, init = {}) {
        const event = {
            type,
            target: this,
            defaultPrevented: false,
            propagationStopped: false,
            preventDefault() { this.defaultPrevented = true; },
            stopPropagation() { this.propagationStopped = true; },
            ...init
        };
        for (let node = this; node && !event.propagationStopped; node = node.parentElement) {
            (node.listeners.get(type) || []).forEach(handler => handler(event));
        }
        return event;
    }
    click() { return this.dispatch("click"); }
    focus() { this.ownerDocument.activeElement = this; }

    matches(selector) {
        return parseSelectorList(selector).some(({ scoped, compound }) => !scoped && matchesCompound(this, compound));
    }
    closest(selector) {
        for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node;
        return null;
    }
    querySelectorAll(selector) {
        const selectors = parseSelectorList(selector);
        const results = [];
        const visit = (node, depth) => {
            for (const child of node.children) {
                if (selectors.some(({ scoped, compound }) => (!scoped || depth === 0) && matchesCompound(child, compound))) results.push(child);
                visit(child, depth + 1);
            }
        };
        visit(this, 0);
        return results;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return this.rect || { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
}

function createDocument() {
    const doc = { activeElement: null, scrollingElement: null, documentElement: null };
    doc.createElement = tag => new FakeElement(tag, doc);
    doc.createTextNode = value => {
        const node = new FakeElement("#text", doc);
        node.nodeType = 3;
        node.ownText = String(value);
        return node;
    };
    doc.body = doc.createElement("body");
    doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
    doc.querySelector = selector => doc.body.querySelector(selector);
    return doc;
}

// A chat message: <li id="chat-messages-…"><div class="contents"><div class="messageContent">text</div></div></li>
function createMessage(doc, text, id = "chat-messages-111111111111111111-222222222222222222") {
    const messageNode = doc.createElement("li");
    messageNode.id = id;
    const contents = doc.createElement("div");
    contents.className = "contents";
    const content = doc.createElement("div");
    content.className = "messageContent";
    content.text = text;
    content.textContent = text;
    contents.appendChild(content);
    messageNode.appendChild(contents);
    doc.body.appendChild(messageNode);
    return { messageNode, contents, content };
}

function createChatPlugin(t, options = {}) {
    const doc = createDocument();
    useGlobals(t, { document: doc, window: { innerHeight: 800, innerWidth: 1200, location: { pathname: "/channels/1/2" } } });
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.targetLanguage = options.targetLanguage || "汉语";
    plugin.settings.ui.language = options.locale || "zh-CN";
    plugin.getElementText = element => element?.text || "";
    plugin.isReplyPreviewElement = element => Boolean(element?.isPreview);
    plugin.getMessageContentElement = messageNode => messageNode.querySelector(".messageContent");
    plugin.saveSettings = () => true;
    plugin.toasts = [];
    plugin.showToast = (message, type) => plugin.toasts.push({ message, type });
    plugin.stableRenders = 0;
    const stability = plugin.withTranslationScrollStability.bind(plugin);
    plugin.withTranslationScrollStability = (...args) => {
        plugin.stableRenders++;
        return stability(...args);
    };
    return { plugin, doc };
}

// The bodies of every rule whose selector is exactly `selector`, joined.
function getCssRule(selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return [...PLUGIN_CSS.matchAll(new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`, "g"))].map(match => match[1]).join("\n");
}

// --- render-8: language and direction ---

test("translation lines carry the target language and a direction; right-to-left targets get dir=rtl", t => {
    const { plugin, doc } = createChatPlugin(t, { targetLanguage: "阿拉伯语" });
    const { messageNode, content } = createMessage(doc, "See you tomorrow");
    const line = plugin.renderTranslation(messageNode, content, "أراك غدا @user", "cache-key", content.text);
    assert.equal(line.getAttribute("lang"), "ar");
    assert.equal(line.getAttribute("dir"), "rtl");

    plugin.settings.translation.targetLanguage = "Chinese";
    plugin.renderTranslation(messageNode, content, "明天见", "cache-key", content.text);
    assert.equal(line.getAttribute("lang"), "zh-CN");
    assert.equal(line.getAttribute("dir"), "auto");

    // State lines are in the interface language, so they drop the translation's language and direction.
    plugin.renderTranslationLoading(messageNode, content, "cache-key", content.text);
    assert.equal(line.getAttribute("lang"), null);
    assert.equal(line.getAttribute("dir"), null);

    assert.deepEqual(plugin.getTranslationLineLanguage("Hebrew"), { lang: "he", dir: "rtl" });
    assert.deepEqual(plugin.getTranslationLineLanguage("fa-IR"), { lang: "fa-IR", dir: "rtl" });
    assert.deepEqual(plugin.getTranslationLineLanguage("my own dialect"), { lang: "", dir: "auto" });

    const lineRule = getCssRule(".dait-translation-line");
    assert.match(lineRule, /text-align: start;/);
    const chatLineRules = PLUGIN_CSS.match(/[^{}]*\.dait-translation-[^{}]*\{[^}]*\}/g) || [];
    assert.ok(chatLineRules.length > 10);
    assert.equal(chatLineRules.some(rule => rule.includes("text-align: left")), false, "no chat-line rule forces left alignment");
});

// --- render-7: reply-preview loading line ---

test("the reply-preview loading line stays inline inside the one-line reply bar", () => {
    const loadingRule = ".dait-translation-line.dait-translation-loading {";
    const previewLoadingRule = ".dait-translation-line.dait-translation-preview.dait-translation-loading {";
    const blockAt = PLUGIN_CSS.indexOf(loadingRule);
    const inlineAt = PLUGIN_CSS.indexOf(previewLoadingRule);
    assert.ok(blockAt >= 0 && inlineAt > blockAt, "the preview rule follows the general loading rule");
    const rule = getCssRule(".dait-translation-line.dait-translation-preview.dait-translation-loading");
    assert.match(rule, /display: inline-block;/);
    assert.match(rule, /vertical-align: baseline;/);
    assert.match(rule, /min-width: 0;/);
    assert.match(rule, /height: auto;/);
});

// --- loading line ---

test("the loading line says it is translating, is a busy status and does not animate with reduced motion", t => {
    const { plugin, doc } = createChatPlugin(t);
    const { messageNode, content } = createMessage(doc, "Raid starts at 9");
    const line = plugin.renderTranslationLoading(messageNode, content, "cache-key", content.text);
    assert.equal(line.textContent, "翻译中…");
    assert.equal(line.getAttribute("role"), "status");
    assert.equal(line.getAttribute("aria-busy"), "true");
    assert.equal(plugin.stableRenders, 1, "inserted through the scroll-stability wrapper");

    plugin.settings.ui.language = "en";
    plugin.renderTranslationLoading(messageNode, content, "cache-key", content.text);
    assert.equal(line.textContent, "Translating…");

    // A finished translation is no longer a busy status.
    plugin.renderTranslation(messageNode, content, "Raid at 9", "cache-key", content.text);
    assert.equal(line.getAttribute("role"), null);
    assert.equal(line.getAttribute("aria-busy"), null);

    assert.doesNotMatch(getCssRule(".dait-translation-line.dait-translation-loading::after"), /animation/);
    assert.match(PLUGIN_CSS, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.dait-translation-line\.dait-translation-loading::after \{\s*animation: dait-loading-sheen/);
    assert.equal((PLUGIN_CSS.match(/animation: dait-loading-sheen/g) || []).length, 1, "the sheen only runs when motion is allowed");
});

// --- render-9: masked translations and hidden originals ---

test("a masked translation is a keyboard button: Enter or Space reveals it", t => {
    const { plugin, doc } = createChatPlugin(t);
    plugin.settings.ui.maskTranslations = true;
    plugin.settings.ui.hideOriginalAfterTranslation = true;
    const { messageNode, content } = createMessage(doc, "gg that fight was insane");
    const line = plugin.renderTranslation(messageNode, content, "刚才那波团战太离谱了", "cache-key", content.text);
    assert.equal(line.getAttribute("role"), "button");
    assert.equal(line.getAttribute("tabindex"), "0");
    assert.equal(line.getAttribute("aria-expanded"), "false");
    assert.equal(line.getAttribute("aria-label"), "显示被遮蔽的译文");
    assert.equal(content.dataset.daitSourceHidden, undefined, "the original stays while the translation is masked");

    // Keys pressed on the toolbar buttons inside the line do not reveal it.
    const copyButton = line.querySelector(".dait-translation-action-copy");
    copyButton.dispatch("keydown", { key: "Enter" });
    assert.equal(line.classList.contains("dait-translation-masked"), true);
    line.dispatch("keydown", { key: "a" });
    assert.equal(line.classList.contains("dait-translation-masked"), true);

    line.focus();
    const event = line.dispatch("keydown", { key: "Enter" });
    assert.equal(event.defaultPrevented, true);
    assert.equal(line.classList.contains("dait-translation-masked"), false);
    assert.equal(line.classList.contains("dait-translation-revealed"), true);
    assert.equal(line.getAttribute("role"), null);
    assert.equal(line.getAttribute("aria-expanded"), null);
    assert.equal(line.getAttribute("tabindex"), "-1", "focus stays on the revealed line");
    assert.equal(content.dataset.daitSourceHidden, "true", "revealing applies hide-original");

    const second = createMessage(doc, "see you", "chat-messages-111111111111111111-333333333333333333");
    const spaceLine = plugin.renderTranslation(second.messageNode, second.content, "再见", "cache-key-2", second.content.text);
    spaceLine.dispatch("keydown", { key: " " });
    assert.equal(spaceLine.classList.contains("dait-translation-revealed"), true);
    assert.equal(spaceLine.getAttribute("tabindex"), null);

    const clickLine = plugin.renderTranslation(messageNode, content, "刚才那波团战太离谱了", "cache-key", content.text);
    assert.equal(clickLine.getAttribute("role"), "button");
    clickLine.click();
    assert.equal(clickLine.classList.contains("dait-translation-revealed"), true);
});

test("hide original: hovering the mask or focusing the message shows the original again", () => {
    const masked = '[data-dait-source-hidden="true"]:not(:hover):not(:focus-within):not(:is([id^="chat-messages-"], [data-list-item-id*="chat-messages"]):focus-within *)';
    assert.ok(PLUGIN_CSS.includes(`${masked} {`), "the gray bar only applies while not hovered or focused");
    assert.ok(PLUGIN_CSS.includes(`${masked} > :not(.dait-message-button):not(.dait-translation-line) {`));
    assert.ok(PLUGIN_CSS.includes(`${masked}::before {`));
    // The masked text has font-size 0 and shrinks to fit, so the bar needs a real font size for its ch
    // width and must not size itself from its parent (a percentage width collapsed it to its border).
    const bar = getCssRule(`${masked}::before`);
    assert.match(bar, /font-size: 1rem;/);
    assert.match(bar, /\n    width: var\(--dait-source-mask-width, 18ch\);/);
    assert.doesNotMatch(bar, /width: min\([^)]*100%/);
    assert.doesNotMatch(PLUGIN_CSS, /\n\[data-dait-source-hidden="true"\] \{/, "no unconditional hiding rule is left");
    assert.match(getCssRule(".dait-translation-line.dait-translation-masked:focus-visible"), /outline: 2px solid/);
});

// --- error lines ---

test("error lines name the cause and offer the fix: settings, connection test, wait, or retry", async t => {
    const { plugin, doc } = createChatPlugin(t);
    const { messageNode, content } = createMessage(doc, "hello there");
    const buttonsOf = line => line.querySelectorAll("button").map(button => button.textContent);
    const messageOf = line => line.querySelector(".dait-translation-error-message").textContent;

    const auth = Object.assign(new Error("API_ERROR"), { status: 401 });
    let line = plugin.renderTranslationError(messageNode, content, auth, "cache-key", content.text);
    assert.equal(messageOf(line), "翻译服务拒绝了 API Key（401）");
    assert.deepEqual(buttonsOf(line), ["打开设置"]);
    assert.equal(line.dataset.daitErrorAction, "settings");
    assert.ok(line.title.includes("401"), "the raw detail stays in the tooltip");
    let opened = null;
    plugin.openQuickSettingsPanel = (source, launcher) => { opened = { source, launcher, tab: plugin.settings.ui.settingsActiveTab }; };
    const settingsClick = line.querySelector(".dait-translation-error-button").click();
    assert.equal(settingsClick.propagationStopped, true);
    assert.deepEqual({ source: opened.source, tab: opened.tab }, { source: "chat-line", tab: "translate" });

    line = plugin.renderTranslationError(messageNode, content, new Error(plugin.t("apiKeyMissingTranslation")), "cache-key", content.text);
    assert.equal(messageOf(line), "还没有填写翻译用的 API Key");
    assert.deepEqual(buttonsOf(line), ["打开设置"]);
    line = plugin.renderTranslationError(messageNode, content, Object.assign(new Error("x"), { googleTranslateNoKey: true }), "cache-key", content.text);
    assert.deepEqual(buttonsOf(line), ["打开设置"]);
    line = plugin.renderTranslationError(messageNode, content, new Error(plugin.t("endpointMissing")), "cache-key", content.text);
    assert.equal(messageOf(line), "还没有填写翻译接口地址");
    line = plugin.renderTranslationError(messageNode, content, Object.assign(new Error("bad"), { code: "INVALID_API_ENDPOINT" }), "cache-key", content.text);
    assert.equal(messageOf(line), plugin.t("errorInvalidEndpoint"));
    assert.deepEqual(buttonsOf(line), ["打开设置"]);
    line = plugin.renderTranslationError(messageNode, content, Object.assign(new Error("quota"), { providerQuotaExceeded: true }), "cache-key", content.text);
    assert.equal(messageOf(line), "翻译服务的额度用完了");
    assert.deepEqual(buttonsOf(line), ["打开设置"]);

    plugin.settings.translation.endpoint = "http://127.0.0.1:18080/v1/chat/completions";
    plugin.getEffectiveTaskConfig = () => ({ endpoint: "http://127.0.0.1:18080/v1/chat/completions" });
    const local = Object.assign(new Error("fetch failed"), { localProviderUnavailable: true });
    line = plugin.renderTranslationError(messageNode, content, local, "cache-key", content.text);
    assert.equal(messageOf(line), "本地翻译服务没有响应（127.0.0.1:18080）");
    assert.deepEqual(buttonsOf(line), ["测试连接", "重试"]);
    let tested = null;
    let finishTest;
    plugin.testApiConnection = (kind, button, status) => {
        tested = { kind, button, status };
        return new Promise(resolve => { finishTest = resolve; });
    };
    const testButton = line.querySelector(".dait-translation-error-button");
    testButton.click();
    assert.deepEqual(tested, { kind: "translation", button: null, status: null });
    assert.equal(testButton.disabled, true);
    assert.equal(testButton.textContent, plugin.t("apiTestBusy"));
    finishTest();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(testButton.disabled, false);
    assert.equal(testButton.textContent, "测试连接");

    const limited = Object.assign(new Error("API_ERROR"), { status: 429, retryAfterMs: 45000 });
    line = plugin.renderTranslationError(messageNode, content, limited, "cache-key", content.text);
    assert.equal(messageOf(line), "请求太多，请 45 秒后再试");
    assert.deepEqual(buttonsOf(line), [], "rate limits only say how long to wait");
    assert.equal(line.dataset.daitErrorAction, "wait");

    const server = Object.assign(new Error("API_ERROR"), { status: 500 });
    line = plugin.renderTranslationError(messageNode, content, server, "cache-key", content.text);
    assert.match(messageOf(line), /^翻译失败：/);
    assert.deepEqual(buttonsOf(line), ["重试"]);
    assert.equal(line.title, "", "a retry line keeps no stale tooltip");
    let retried = null;
    plugin.translateMessage = (...args) => { retried = args; };
    line.querySelector(".dait-translation-retry").click();
    assert.equal(retried[0], messageNode);
    assert.equal(retried[1], content);

    // Every insertion went through the scroll-stability wrapper.
    assert.ok(plugin.stableRenders >= 9);

    plugin.settings.ui.language = "en";
    line = plugin.renderTranslationError(messageNode, content, auth, "cache-key", content.text);
    assert.equal(messageOf(line), "The translation service rejected the API key (401)");
    assert.deepEqual(buttonsOf(line), ["Open settings"]);
});

test("a rate-limit line offers Retry once the wait is over, and a stale retry removes the line stably", async t => {
    const { plugin, doc } = createChatPlugin(t);
    const { messageNode, content } = createMessage(doc, "hello there");
    const limited = Object.assign(new Error("API_ERROR"), { status: 429, retryAfterMs: 1 });
    const line = plugin.renderTranslationError(messageNode, content, limited, "cache-key", content.text);
    assert.equal(line.querySelectorAll("button").length, 0);
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(line.dataset.daitErrorAction, "retry");
    assert.equal(line.querySelector(".dait-translation-error-message").textContent, "请求太多，请稍后再试");
    assert.equal(line.querySelectorAll(".dait-translation-retry").length, 1);

    content.text = "edited text";
    const before = plugin.stableRenders;
    line.querySelector(".dait-translation-retry").click();
    assert.equal(line.isConnected, false);
    assert.equal(plugin.stableRenders, before + 1);
    assert.equal(plugin.toasts.at(-1).message, plugin.t("messageMissing"));
});

// --- UI-SPEC Q9: one notice per episode for errors that need the user ---

test("errors that need the user toast once per provider episode even with failure toasts off", t => {
    const { plugin } = createChatPlugin(t);
    plugin.settings.ui.showAutoTranslateToasts = false;
    plugin.settings.translation.apiKey = "sk-fake-1";
    const auth = Object.assign(new Error("API_ERROR"), { status: 401 });

    plugin.showAutoTranslateError(auth);
    plugin.showAutoTranslateError(auth);
    assert.equal(plugin.toasts.length, 1);
    assert.equal(plugin.toasts[0].message, "自动翻译需要你处理：翻译服务拒绝了 API Key（401）");
    assert.equal(plugin.toasts[0].type, "error");

    plugin.showAutoTranslateError(Object.assign(new Error("quota"), { providerQuotaExceeded: true }));
    assert.equal(plugin.toasts.length, 2, "another error type is its own notice");

    plugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 500 }));
    plugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 429 }));
    assert.equal(plugin.toasts.length, 2, "errors that fix themselves stay quiet while toasts are off");

    // The provider-failure path (also used by the local health probe) raises the same notice once.
    plugin.setApiRuntimeStatus = () => {};
    plugin.discardAutoTranslationProviderWork = () => {};
    const local = Object.assign(new Error("fetch failed"), { localProviderUnavailable: true });
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), local);
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), local);
    plugin.showAutoTranslateError(local);
    assert.equal(plugin.toasts.length, 3);

    // A success ends the episode; the same problem later is announced again.
    plugin.endTranslationAttentionEpisode(plugin.getAutoTranslationProviderKey());
    plugin.showAutoTranslateError(auth);
    assert.equal(plugin.toasts.length, 4);

    // A new key is a new provider, so a new episode.
    plugin.settings.translation.apiKey = "sk-fake-2";
    plugin.showAutoTranslateError(auth);
    assert.equal(plugin.toasts.length, 5);

    // A manual failure already shows its own toast, so it only records the episode.
    plugin.settings.translation.apiKey = "sk-fake-3";
    plugin.rememberTranslationAttentionNotice(auth, plugin.getTranslationAttentionProviderKey(auth));
    plugin.showAutoTranslateError(auth);
    assert.equal(plugin.toasts.length, 5);
});

test("a successful translation request ends the provider's attention episode", async t => {
    const { plugin } = createChatPlugin(t);
    plugin.settings.translation.apiKey = "sk-fake-1";
    const auth = Object.assign(new Error("API_ERROR"), { status: 401 });
    plugin.showAutoTranslateError(auth);
    assert.equal(plugin.toasts.length, 1);
    plugin.fetchModelResponse = async () => "你好";
    const result = await plugin.runModelTaskWithResult("translation", "hello");
    assert.equal(result.text, "你好");
    assert.equal(plugin.autoTranslationProviderNoticeAt.size, 0);
    plugin.showAutoTranslateError(auth);
    assert.equal(plugin.toasts.length, 2);
});

// --- display settings ---

test("translation style and text size have defaults, are normalized and restyle existing lines", t => {
    const { plugin, doc } = createChatPlugin(t);
    assert.equal(DEFAULT_SETTINGS.ui.translationStyle, "tint");
    assert.equal(DEFAULT_SETTINGS.ui.translationTextScale, 100);

    plugin.settings.ui.translationStyle = "neon";
    plugin.settings.ui.translationTextScale = "85";
    plugin.ensureSettingsShape();
    assert.equal(plugin.settings.ui.translationStyle, "tint");
    assert.equal(plugin.settings.ui.translationTextScale, 100);

    const { messageNode, content } = createMessage(doc, "See you tomorrow");
    const line = plugin.renderTranslation(messageNode, content, "明天见", "cache-key", content.text);
    assert.equal(line.classList.contains("dait-translation-style-tint"), true);
    assert.equal(line.classList.contains("dait-translation-scale-90"), false);

    plugin.setSetting("ui.translationStyle", "tag");
    plugin.setSetting("ui.translationTextScale", "90");
    assert.equal(plugin.settings.ui.translationStyle, "tag");
    assert.equal(plugin.settings.ui.translationTextScale, 90);
    assert.equal(line.classList.contains("dait-translation-style-tag"), true, "existing lines follow the setting");
    assert.equal(line.classList.contains("dait-translation-style-tint"), false);
    assert.equal(line.classList.contains("dait-translation-scale-90"), true);
    assert.equal(line.dataset.daitTag, "译");

    plugin.setSetting("ui.translationStyle", "bogus");
    assert.equal(plugin.settings.ui.translationStyle, "tint");
    plugin.setSetting("ui.translationStyle", "muted");
    assert.equal(line.classList.contains("dait-translation-style-muted"), true);
    assert.equal(line.dataset.daitTag, undefined);

    // Loading and error lines keep their own look.
    plugin.renderTranslationLoading(messageNode, content, "cache-key", content.text);
    assert.equal(line.classList.contains("dait-translation-style-muted"), false);
    assert.equal(line.classList.contains("dait-translation-scale-90"), false);

    assert.match(getCssRule(".dait-translation-line.dait-translation-revealed.dait-translation-style-muted"), /color: var\(--dait-line-muted\)/);
    assert.match(getCssRule(".dait-translation-line.dait-translation-style-tag:not(.dait-translation-preview)::before"), /content: attr\(data-dait-tag\)/);
    assert.match(getCssRule(".dait-translation-line.dait-translation-scale-90:not(.dait-translation-preview)"), /font-size: 0\.9rem/);
});

test("the Display section offers the style and text size selects", t => {
    const { plugin } = createChatPlugin(t);
    const selects = [];
    plugin.createSelectRow = (path, label, options) => {
        selects.push({ path, label, values: options.map(([value]) => value) });
        return document.createElement("div");
    };
    plugin.createCheckboxRow = () => document.createElement("div");
    plugin.createDisplayBehaviorSection();
    assert.deepEqual(selects.find(row => row.path === "ui.translationStyle"), { path: "ui.translationStyle", label: "译文样式", values: ["tint", "muted", "tag"] });
    assert.deepEqual(selects.find(row => row.path === "ui.translationTextScale"), { path: "ui.translationTextScale", label: "译文字号", values: ["100", "90"] });
});

// --- hover toolbar ---

test("a translated line has a keyboard-operable toolbar that never takes layout space", async t => {
    const { plugin, doc } = createChatPlugin(t);
    const { messageNode, content } = createMessage(doc, "See you tomorrow");
    const line = plugin.renderTranslation(messageNode, content, "明天见", "cache-key", content.text);
    const toolbar = line.querySelector(".dait-translation-actions");
    assert.equal(line.children[0].className, "dait-translation-text");
    assert.equal(toolbar.getAttribute("role"), "toolbar");
    assert.equal(toolbar.getAttribute("aria-label"), "译文操作");
    const buttons = toolbar.querySelectorAll("button");
    assert.deepEqual(buttons.map(button => button.getAttribute("aria-label")), ["复制译文", "重新翻译（不用缓存）", "隐藏译文"]);
    assert.deepEqual(buttons.map(button => button.title), ["复制译文", "重新翻译（不用缓存）", "隐藏译文"]);
    assert.deepEqual(buttons.map(button => button.getAttribute("tabindex")), ["0", "-1", "-1"], "one tab stop");
    assert.equal(line.textContent, "明天见", "the toolbar adds no text to the line");

    buttons[0].focus();
    toolbar.dispatch("keydown", { key: "ArrowRight", target: buttons[0] });
    assert.equal(doc.activeElement, buttons[1]);
    assert.deepEqual(buttons.map(button => button.getAttribute("tabindex")), ["-1", "0", "-1"]);
    toolbar.dispatch("keydown", { key: "End", target: buttons[1] });
    assert.equal(doc.activeElement, buttons[2]);
    toolbar.dispatch("keydown", { key: "ArrowRight", target: buttons[2] });
    assert.equal(doc.activeElement, buttons[0]);

    let copied = null;
    plugin.copyTextToClipboard = async text => { copied = text; };
    buttons[0].click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(copied, "明天见");
    assert.equal(plugin.toasts.at(-1).message, "已复制译文。");

    let retranslated = null;
    plugin.translateMessage = (...args) => { retranslated = args; };
    const click = buttons[1].click();
    assert.equal(click.propagationStopped, true);
    assert.equal(retranslated[0], messageNode);
    assert.equal(retranslated[1], content);
    assert.deepEqual(retranslated[4], { bypassCache: true });

    const actionsRule = getCssRule(".dait-translation-actions");
    assert.match(actionsRule, /position: absolute;/);
    assert.match(actionsRule, /opacity: 0;/);
    assert.match(getCssRule(".dait-translation-line.dait-translation-revealed:hover > .dait-translation-actions,\n.dait-translation-line.dait-translation-revealed:focus-within > .dait-translation-actions"), /opacity: 1;/);

    // Placement: after a short line, inside the corner when the line fills the message width.
    messageNode.rect = { left: 0, right: 600, top: 0, bottom: 40 };
    toolbar.offsetWidth = 88;
    line.rect = { left: 72, right: 200, top: 10, bottom: 32 };
    line.dispatch("pointerenter");
    assert.equal(toolbar.dataset.daitPlacement, "end");
    line.rect = { left: 72, right: 560, top: 10, bottom: 54 };
    line.dispatch("focusin");
    assert.equal(toolbar.dataset.daitPlacement, "inside");

    const preview = doc.createElement("div");
    preview.isPreview = true;
    preview.text = "quoted reply";
    messageNode.appendChild(preview);
    const previewLine = plugin.renderTranslation(messageNode, preview, "引用", "preview-key", preview.text);
    assert.equal(previewLine.querySelector(".dait-translation-actions"), null, "reply previews get no toolbar");
});

test("hiding a line keeps it hidden for that message until the user translates it again", async t => {
    const { plugin, doc } = createChatPlugin(t);
    plugin.settings.ui.hideOriginalAfterTranslation = true;
    const { messageNode, content } = createMessage(doc, "See you tomorrow");
    let line = plugin.renderTranslation(messageNode, content, "明天见", "cache-key", content.text);
    assert.equal(content.dataset.daitSourceHidden, "true");
    const before = plugin.stableRenders;
    line.querySelector(".dait-translation-action-hide").click();
    assert.equal(plugin.stableRenders, before + 1, "hiding goes through the scroll-stability wrapper");
    assert.equal(line.classList.contains("dait-translation-dismissed"), true);
    assert.equal(content.dataset.daitSourceHidden, undefined, "the original comes back");
    assert.match(getCssRule(".dait-translation-line.dait-translation-dismissed"), /display: none !important;/);

    // Discord re-mounts the message and the cached draw pass draws it again: it stays hidden.
    messageNode.remove();
    const remounted = createMessage(doc, "See you tomorrow", messageNode.id);
    line = plugin.renderTranslation(remounted.messageNode, remounted.content, "明天见", "cache-key", remounted.content.text);
    assert.equal(line.classList.contains("dait-translation-dismissed"), true);
    assert.equal(remounted.content.dataset.daitSourceHidden, undefined);
    line = plugin.renderTranslationLoading(remounted.messageNode, remounted.content, "cache-key", remounted.content.text);
    assert.equal(line.classList.contains("dait-translation-dismissed"), true, "no loading flash for a hidden message");

    // Translating it again (message button, context menu or retry) brings it back.
    plugin.settings.translation.enabled = false;
    plugin.translateMessage(remounted.messageNode, remounted.content, null);
    line = plugin.renderTranslation(remounted.messageNode, remounted.content, "明天见", "cache-key", remounted.content.text);
    assert.equal(line.classList.contains("dait-translation-dismissed"), true, "a disabled translation does not count");
    plugin.settings.translation.enabled = true;
    plugin.createManualTranslationPlan = () => { throw new Error("stop after the dismissal is cleared"); };
    plugin.resolveManualTranslationSource = (node, element) => ({ text: element.text });
    plugin.isLowInformationRepeatedText = () => false;
    await assert.rejects(() => plugin.translateMessage(remounted.messageNode, remounted.content, null), /stop after the dismissal is cleared/);
    line = plugin.renderTranslation(remounted.messageNode, remounted.content, "明天见", "cache-key", remounted.content.text);
    assert.equal(line.classList.contains("dait-translation-dismissed"), false);
    assert.equal(remounted.content.dataset.daitSourceHidden, "true");
});

test("retranslating skips the cache and renders the fresh result", async t => {
    const { plugin, doc } = createChatPlugin(t);
    plugin.settings.translation.enabled = true;
    const { messageNode, content } = createMessage(doc, "See you tomorrow");
    plugin.resolveManualTranslationSource = (node, element) => ({ text: element.text, domText: element.text, source: "dom-content" });
    plugin.isLowInformationRepeatedText = () => false;
    plugin.getTranslationCacheValue = () => "旧译文";
    plugin.isInvalidAutoTranslationCacheValue = () => false;
    plugin.syncManualTranslationToAutoCache = () => true;
    plugin.setTranslationCache = () => {};
    plugin.rememberRecentAutoTranslationRender = () => {};
    let requests = 0;
    plugin.runManualTranslationPlan = async () => {
        requests++;
        return { translated: "新译文", validation: { renderable: true, cacheable: true, quality: "good" } };
    };
    const rendered = [];
    const render = plugin.renderTranslation.bind(plugin);
    plugin.renderTranslation = (...args) => {
        rendered.push(args[2]);
        return render(...args);
    };

    await plugin.translateMessage(messageNode, content, null);
    assert.deepEqual(rendered, ["旧译文"], "a normal translate uses the cache");
    assert.equal(requests, 0);

    await plugin.retranslateMessage(messageNode, content);
    assert.equal(requests, 1);
    assert.deepEqual(rendered, ["旧译文", "新译文"]);
});

// --- partial long-message results (contract with the queue branch) ---

test("a partial long-message result shows which parts are missing and offers a full retranslation", t => {
    const { plugin, doc } = createChatPlugin(t);
    const { messageNode, content } = createMessage(doc, "a long message");
    let line = plugin.renderTranslation(messageNode, content, "第一段……", "cache-key", content.text, {
        partialInfo: { missingSegments: [2], totalSegments: 4 }
    });
    const note = line.querySelector(".dait-translation-note");
    assert.equal(note.getAttribute("role"), "note");
    assert.equal(note.querySelector(".dait-translation-note-message").textContent, "第 2 段（共 4 段）没有翻译出来");
    const button = note.querySelector("button");
    assert.equal(button.textContent, "重新翻译");
    let retranslated = null;
    plugin.translateMessage = (...args) => { retranslated = args; };
    button.click();
    assert.deepEqual(retranslated.slice(0, 2), [messageNode, content]);
    assert.deepEqual(retranslated[4], { bypassCache: true });
    assert.equal(plugin.translationLineTexts.get(line), "第一段……", "copy takes only the translation, not the note");

    plugin.settings.ui.language = "en";
    line = plugin.renderTranslation(messageNode, content, "part one", "cache-key", content.text, {
        partialInfo: { missingSegments: [3, 2, 3, 9, "x"], totalSegments: 4 }
    });
    assert.equal(line.querySelector(".dait-translation-note-message").textContent, "Parts 2 and 3 of 4 could not be translated");
    assert.equal(line.querySelector(".dait-translation-note-button").textContent, "Retranslate");

    line = plugin.renderTranslation(messageNode, content, "part one", "cache-key", content.text, { partialInfo: {} });
    assert.equal(line.querySelector(".dait-translation-note-message").textContent, "Part of this message could not be translated");

    line = plugin.renderTranslation(messageNode, content, "whole", "cache-key", content.text, { partial: true });
    assert.equal(line.querySelector(".dait-translation-note"), null, "no partialInfo, no note");
    line = plugin.renderTranslation(messageNode, content, "whole", "cache-key", content.text);
    assert.equal(line.querySelector(".dait-translation-note"), null);
});

// --- message context menu ---

test("the message context menu offers retranslate, copy and hide for a translated message", t => {
    const { plugin, doc } = createChatPlugin(t);
    const { messageNode, content } = createMessage(doc, "See you tomorrow");
    let patchCallback = null;
    useGlobals(t, {
        BdApi: {
            ContextMenu: {
                patch: (_filter, callback) => { patchCallback = callback; return () => {}; },
                buildMenuChildren: groups => groups
            }
        }
    });
    plugin.settings.ui.injectMessageContextMenu = true;
    plugin.patchMessageContextMenu();
    const idsFor = target => {
        const tree = { props: { children: [] } };
        patchCallback(tree, { target });
        return tree.props.children[0].items.map(item => item.id);
    };
    assert.deepEqual(idsFor(content), ["dait-translate-message"]);

    const line = plugin.renderTranslation(messageNode, content, "明天见", "cache-key", content.text);
    assert.deepEqual(idsFor(content), ["dait-translate-message", "dait-retranslate-message", "dait-copy-translation", "dait-hide-translation"]);
    const tree = { props: { children: [] } };
    patchCallback(tree, { target: content });
    tree.props.children[0].items.find(item => item.id === "dait-hide-translation").action();
    assert.equal(line.classList.contains("dait-translation-dismissed"), true);
    assert.deepEqual(idsFor(content), ["dait-translate-message"], "a hidden line offers nothing to copy");
});
