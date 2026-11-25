"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_CSS } = require("../../src/styles");
const {
    UI_LOCALES,
    UI_LOCALE_CODES,
    normalizeUiLocale,
    isRtlLocale
} = require("../../src/i18n");

// --- Minimal DOM fixture supporting attributes, dataset, compound/descendant selectors, events, focus & replaceWith ---

const dataKey = attribute => attribute.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

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
    const tokenPattern = /\.([\w-]+)|\[([\w-]+)(?:([\^*]?=)(['"]?)(.*?)\4)?\]/g;
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
            if (operator === "^=") return value.startsWith(expected);
            if (operator === "*=") return value.includes(expected);
            return !operator || value === expected;
        });
    }
    return element => checks.every(check => check(element));
}

function matchesSelector(element, selector, scope = null) {
    return String(selector).split(",").some(part => {
        let text = part.trim();
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
    getBoundingClientRect() { return this.rect || { left: 24, top: 24, right: 824, bottom: 64, width: 800, height: 40 }; }
    focus() { globalThis.document.activeElement = this; }
    blur() {}
    scrollIntoView(options) { this.scrolledIntoView = options || true; }
    addEventListener(type, handler, options) {
        const capture = options === true || Boolean(options?.capture);
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        this.listeners.get(type).push({ handler, capture });
    }
    removeEventListener(type, handler, options) {
        const capture = options === true || Boolean(options?.capture);
        this.listeners.set(type, (this.listeners.get(type) || []).filter(item => !(item.handler === handler && item.capture === capture)));
    }
    dispatchEvent(event) {
        event.target ??= this;
        const path = [];
        for (let node = this; node; node = node.parentNode) path.push(node);
        if (globalThis.window) path.push(globalThis.window);
        const run = (node, capture) => {
            if (event.immediateStopped) return;
            for (const entry of (node.listeners?.get?.(event.type) || []).slice()) {
                if (entry.capture !== capture) continue;
                event.currentTarget = node;
                entry.handler.call(node, event);
                if (event.immediateStopped) return;
            }
        };
        for (let i = path.length - 1; i >= 1 && !event.stopped; i--) run(path[i], true);
        if (!event.stopped) run(this, true);
        if (!event.stopped) run(this, false);
        if (event.bubbles !== false) {
            for (let i = 1; i < path.length && !event.stopped; i++) run(path[i], false);
        }
        return !event.defaultPrevented;
    }
    dispatch(type, init = {}) {
        const event = createEvent(type, { target: this, ...init });
        this.dispatchEvent(event);
        return event;
    }
    click() { return this.dispatch("click"); }
}

function createEvent(type, init = {}) {
    return {
        type,
        bubbles: true,
        cancelable: true,
        defaultPrevented: false,
        stopped: false,
        immediateStopped: false,
        preventDefault() { if (this.cancelable !== false) this.defaultPrevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.stopped = true; this.immediateStopped = true; },
        ...init
    };
}

function installDom(t) {
    const savedDoc = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedWin = Object.getOwnPropertyDescriptor(globalThis, "window");
    const root = new FakeElement("html");
    root.isDocumentRoot = true;
    const body = new FakeElement("body");
    body.className = "theme-dark";
    root.appendChild(body);

    const winListeners = new Map();
    const win = {
        innerWidth: 1280,
        innerHeight: 820,
        listeners: winListeners,
        addEventListener(type, handler, options) {
            const capture = options === true || Boolean(options?.capture);
            if (!winListeners.has(type)) winListeners.set(type, []);
            winListeners.get(type).push({ handler, capture });
        },
        removeEventListener(type, handler, options) {
            const capture = options === true || Boolean(options?.capture);
            winListeners.set(type, (winListeners.get(type) || []).filter(item => !(item.handler === handler && item.capture === capture)));
        },
        getComputedStyle() {
            return { backgroundColor: "rgb(49, 51, 56)", color: "rgb(242, 243, 245)", display: "block", visibility: "visible" };
        },
        requestAnimationFrame(cb) { cb(); return 1; },
        cancelAnimationFrame() {}
    };

    const doc = {
        nodeType: 9,
        isDocumentRoot: true,
        documentElement: root,
        body,
        activeElement: body,
        listeners: root.listeners,
        createElement: tag => new FakeElement(tag),
        createTextNode: value => new FakeText(value),
        querySelector: selector => root.querySelector(selector),
        querySelectorAll: selector => root.querySelectorAll(selector),
        addEventListener: (type, handler, options) => root.addEventListener(type, handler, options),
        removeEventListener: (type, handler, options) => root.removeEventListener(type, handler, options),
        dispatchEvent: event => root.dispatchEvent(event)
    };
    body.parentNode = doc;

    globalThis.document = doc;
    globalThis.window = win;
    t.after(() => {
        if (savedDoc) Object.defineProperty(globalThis, "document", savedDoc);
        else delete globalThis.document;
        if (savedWin) Object.defineProperty(globalThis, "window", savedWin);
        else delete globalThis.window;
    });
    return { doc, body, win };
}

function createPlugin(t) {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => {};
    plugin.flushSettings = () => {};
    plugin.queueScan = () => {};
    plugin.unpatchContextMenus = () => {};
    plugin.patchMessageContextMenu = () => {};
    plugin.showToast = () => {};
    t.after(() => {
        try { plugin.quickPanel?.destroy?.("test-end"); }
        catch {}
        try { plugin.closeQuickSettingsPanel?.("test-end"); }
        catch {}
    });
    return plugin;
}

// --- 1. Locale Normalization, Presets, Formatting & Diagnostics ---

test("normalizeUiLocale maps BCP-47 variants to the 6 mainline UI locales", () => {
    assert.equal(normalizeUiLocale("zh-CN"), "zh-CN");
    assert.equal(normalizeUiLocale("zh-Hans-SG"), "zh-CN");
    assert.equal(normalizeUiLocale("zh-TW"), "zh-TW");
    assert.equal(normalizeUiLocale("zh-HK"), "zh-TW");
    assert.equal(normalizeUiLocale("zh-MO"), "zh-TW");
    assert.equal(normalizeUiLocale("zh-Hant"), "zh-TW");
    assert.equal(normalizeUiLocale("en-US"), "en");
    assert.equal(normalizeUiLocale("ru-RU"), "ru");
    assert.equal(normalizeUiLocale("ar-SA"), "ar");
    assert.equal(normalizeUiLocale("es-419"), "es");
    assert.equal(normalizeUiLocale("unknown-locale"), "zh-CN");
    assert.equal(isRtlLocale("ar"), true);
    assert.equal(isRtlLocale("ar-EG"), true);
    for (const ltr of ["zh-CN", "zh-TW", "en", "ru", "es"]) {
        assert.equal(isRtlLocale(ltr), false, `${ltr} must be LTR`);
    }
});

test("preset language labels, normalization aliases, error punctuation and part lists adapt across all 6 locales", t => {
    const plugin = createPlugin(t);

    const expectedDisplay = {
        "zh-CN": "俄语 - Russian",
        "zh-TW": "俄語 - Russian",
        en: "Russian",
        ru: "Русский - Russian",
        ar: "الروسية - Russian",
        es: "Ruso - Russian"
    };
    const expectedShortName = {
        "zh-CN": "俄语",
        "zh-TW": "俄語",
        en: "Russian",
        ru: "Русский",
        ar: "الروسية",
        es: "Ruso"
    };
    for (const [locale, expected] of Object.entries(expectedDisplay)) {
        plugin.settings.ui.language = locale;
        assert.equal(plugin.getDisplayLanguage("Русский"), expected, `display label in ${locale}`);
        assert.equal(plugin.quickPanel.getLanguageDisplayName("俄语"), expectedShortName[locale], `short name in ${locale}`);
    }

    // Localized target-language input aliases resolve back to canonical preset values
    assert.equal(plugin.normalizeLanguageName("Арабский"), "阿拉伯语");
    assert.equal(plugin.normalizeLanguageName("Árabe"), "阿拉伯语");
    assert.equal(plugin.normalizeLanguageName("الإسبانية"), "西班牙语");
    assert.equal(plugin.normalizeLanguageName("簡體中文"), "汉语");

    // Error status brackets and part-list conjunctions follow locale typography
    plugin.settings.ui.language = "zh-TW";
    assert.equal(plugin.formatTranslationPartList([1, 2, 3]), "1、2、3");
    assert.equal(plugin.formatTranslationErrorStatus({ status: 504 }), "（504）");

    plugin.settings.ui.language = "ru";
    assert.equal(plugin.formatTranslationPartList([1, 2, 3]), "1, 2 и 3");
    assert.equal(plugin.formatTranslationErrorStatus({ status: 504 }), " (504)");

    plugin.settings.ui.language = "es";
    assert.equal(plugin.formatTranslationPartList([1, 2, 3]), "1, 2 y 3");

    plugin.settings.ui.language = "ar";
    assert.equal(plugin.formatTranslationPartList([1, 2, 3]), "1، 2 و3");
});

// --- 2. Multiple Quick Language Switcher Bars & Focus-Trap Contracts ---

test("Settings Header and Overview quick language bars switch all 6 languages in place while preserving focus-trap contracts", t => {
    installDom(t);
    const plugin = createPlugin(t);
    const modal = plugin.openQuickSettingsPanel("test");
    assert.ok(modal, "quick settings modal opened");

    let dialog = plugin.findQuickSettingsDialog(modal);
    let panel = modal.querySelector(".dait-settings");
    const headerBar = panel.querySelector(".dait-lang-bar-header");
    const overviewBar = panel.querySelector(".dait-lang-bar-overview");
    assert.ok(headerBar, "header quick language bar exists");
    assert.ok(overviewBar, "overview quick language bar exists");
    assert.equal(headerBar.querySelectorAll(".dait-lang-pill").length, 6);
    assert.equal(overviewBar.querySelectorAll(".dait-lang-pill").length, 6);

    // Verify no quick language pill carries data-dait-path (which would corrupt commitSettingsControls on close)
    for (const pill of panel.querySelectorAll(".dait-lang-pill")) {
        assert.equal(pill.getAttribute("data-dait-path"), null);
    }

    // Focus-trap contract on Overview tab: first focusable is close button, last is ui.language select
    const initialFocusables = plugin.getQuickSettingsFocusableElements(dialog);
    assert.equal(initialFocusables[0], dialog.querySelector(".dait-settings-close"));
    assert.equal(initialFocusables.at(-1)?.dataset?.daitPath, "ui.language");

    // Switch through every locale via the Header quick language bar while on the Compose tab
    plugin.setSettingsActiveTab("compose", panel);
    for (const code of ["zh-TW", "en", "ru", "ar", "es", "zh-CN"]) {
        panel = modal.querySelector(".dait-settings");
        const pill = panel.querySelector(`.dait-lang-bar-header [data-dait-ui-lang='${code}']`);
        assert.ok(pill, `header pill for ${code}`);
        pill.focus();
        pill.click();

        const rebuilt = modal.querySelector(".dait-settings");
        dialog = plugin.findQuickSettingsDialog(modal);
        assert.equal(plugin.getLocale(), code);
        assert.equal(rebuilt.dataset.daitLocale, code);
        assert.equal(rebuilt.__daitSettingsUi.activeTab, "compose", "stays on active tab across language switch");
        const expectedDir = code === "ar" ? "rtl" : "ltr";
        assert.equal(rebuilt.getAttribute("dir"), expectedDir);
        assert.equal(modal.getAttribute("dir"), expectedDir);
        assert.equal(dialog.getAttribute("dir"), expectedDir);
        assert.equal(globalThis.document.activeElement?.dataset?.daitUiLang, code, "focus stays on active language pill");
    }

    // Closing the modal must NOT overwrite ui.language
    plugin.setSetting("ui.language", "ru");
    plugin.closeQuickSettingsPanel("test-close");
    assert.equal(plugin.settings.ui.language, "ru");
});

test("Quick Panel quick language bar switches all 6 languages in place, preserves focusables contract and try-polish output", t => {
    const { body } = installDom(t);
    const plugin = createPlugin(t);
    const launcher = new FakeElement("button");
    launcher.className = "dait-quick-settings-button dait-quick-settings-panel";
    body.appendChild(launcher);

    const root = plugin.quickPanel.open(launcher, { source: "test" });
    assert.ok(root, "quick panel opened");
    assert.equal(plugin.quickPanel.controls.focusables[0], plugin.quickPanel.controls.headerOpenFull);
    assert.equal(plugin.quickPanel.controls.focusables.at(-1), plugin.quickPanel.controls.footerOpenFull);
    assert.equal(plugin.quickPanel.controls.langButtons.length, 6);

    // Open polish tab & populate try-polish output, then switch to Arabic & Spanish via Quick Panel pills
    plugin.quickPanel.setActiveTab("polish");
    plugin.quickPanel.tryDrawerOpen = true;
    plugin.quickPanel.controls.tryInput.value = "hello world";
    plugin.quickPanel.controls.tryResult.hidden = false;
    plugin.quickPanel.controls.tryOutput.textContent = "Polished sample";
    plugin.quickPanel.update();

    const arButton = plugin.quickPanel.controls.langButtons.find(btn => btn.dataset.daitUiLang === "ar");
    arButton.focus();
    arButton.click();

    assert.equal(plugin.getLocale(), "ar");
    assert.equal(plugin.quickPanel.root.getAttribute("dir"), "rtl");
    assert.equal(plugin.quickPanel.root.getAttribute("lang"), "ar");
    assert.equal(plugin.quickPanel.getActiveTab(), "polish");
    assert.equal(plugin.quickPanel.controls.tryInput.value, "hello world");
    assert.equal(plugin.quickPanel.controls.tryResult.hidden, false);
    assert.equal(plugin.quickPanel.controls.tryOutput.textContent, "Polished sample");
    assert.equal(globalThis.document.activeElement?.dataset?.daitUiLang, "ar");

    // In Arabic RTL, ArrowLeft advances to the next pill ("es") while ArrowRight moves backward ("ru")
    plugin.quickPanel.controls.langBar.dispatch("keydown", { key: "ArrowLeft" });
    assert.equal(plugin.getLocale(), "es");
    assert.equal(plugin.quickPanel.root.getAttribute("dir"), "ltr");
});

// --- 3. Arabic RTL Surface Direction, Technical LTR Isolation & CSS Mirroring ---

test("Arabic RTL sets dir='rtl' on dialogs, floating menus and result panels while keeping credential inputs dir='ltr'", async t => {
    const { body } = installDom(t);
    const plugin = createPlugin(t);
    plugin.settings.ui.language = "ar";
    plugin.settings.translation.provider = "openai";

    const panel = plugin.getSettingsPanel();
    body.appendChild(panel);
    assert.equal(panel.getAttribute("dir"), "rtl");
    assert.equal(panel.getAttribute("lang"), "ar");

    for (const path of ["translation.apiKey", "translation.endpoint", "translation.model"]) {
        const input = panel.querySelector(`[data-dait-path='${path}']`);
        assert.ok(input, `control ${path} exists`);
        assert.equal(input.getAttribute("dir"), "ltr", `${path} keeps dir="ltr" under Arabic UI`);
    }

    // Polish Result Panel gets dir="rtl"
    const form = new FakeElement("form");
    const textbox = new FakeElement("div");
    textbox.setAttribute("role", "textbox");
    form.appendChild(textbox);
    body.appendChild(form);
    plugin.showPolishResultPanel(textbox, "نص مصقول");
    assert.equal(plugin.polishResultPanel?.getAttribute("dir"), "rtl");
    plugin.removePolishResultPanel();

    // Input Action Menu gets dir="rtl"
    const group = new FakeElement("span");
    group.className = "dait-input-action-group";
    form.appendChild(group);
    plugin.openInputActionMenu(group, textbox);
    assert.equal(plugin.inputActionMenu?.getAttribute("dir"), "rtl");
    plugin.removeInputActionMenu();

    // BetterDiscord Confirm Dialog content gets .dait-dialog with dir="rtl" & lang="ar"
    const savedBdApi = Object.getOwnPropertyDescriptor(globalThis, "BdApi");
    let cancelModal = null;
    globalThis.BdApi = {
        React: {
            createElement(tag, props, ...children) {
                const el = new FakeElement(tag);
                for (const [key, val] of Object.entries(props || {})) {
                    if (key === "className") el.className = String(val);
                    else if (key === "tabIndex") el.tabIndex = Number(val);
                    else if (key !== "key" && key !== "ref" && val !== undefined && val !== null) el.setAttribute(key, String(val));
                }
                for (const child of children.flat()) {
                    if (child === null || child === undefined || child === false) continue;
                    el.appendChild(typeof child === "string" ? new FakeText(child) : child);
                }
                if (typeof props?.ref === "function") props.ref(el);
                return el;
            }
        },
        UI: {
            showConfirmationModal(_title, content, opts) {
                const dialog = new FakeElement("div");
                dialog.setAttribute("role", "dialog");
                if (content?.nodeType === 1) dialog.appendChild(content);
                body.appendChild(dialog);
                cancelModal = () => {
                    dialog.remove();
                    opts?.onCancel?.();
                };
            }
        }
    };
    t.after(() => {
        if (savedBdApi) Object.defineProperty(globalThis, "BdApi", savedBdApi);
        else delete globalThis.BdApi;
    });
    const pendingConfirm = plugin.confirmAction({ title: plugin.t("confirmSend"), preview: "اختبار" });
    const confirmDialog = body.querySelector(".dait-dialog");
    assert.equal(confirmDialog?.getAttribute("dir"), "rtl");
    assert.equal(confirmDialog?.getAttribute("lang"), "ar");
    cancelModal?.();
    await pendingConfirm;

    assert.match(PLUGIN_CSS, /\[dir="rtl"\]/);
    assert.match(PLUGIN_CSS, /\.dait-lang-bar/);
    assert.match(PLUGIN_CSS, /\.dait-qp-lang-bar/);
});

// --- 4. Multi-Language Settings Search (Cyrillic, Spanish Accents, Arabic, CJK) ---

test("Settings search matches Cyrillic, accent-folded Spanish, mark-folded Arabic and Traditional Chinese", t => {
    const { body } = installDom(t);
    const plugin = createPlugin(t);

    // Spanish: unaccented "rapido" matches accented "rápido" / "rápidos"
    plugin.settings.ui.language = "es";
    let panel = plugin.getSettingsPanel();
    body.appendChild(panel);
    let state = panel.__daitSettingsUi;
    const esMatches = plugin.runSettingsSearch(state, "idioma");
    assert.ok(esMatches.length > 0, "Spanish search finds language rows");
    assert.equal(plugin.matchesSettingsSearchTerm("panel rápido de traducción", "rapido"), true);
    assert.equal(plugin.matchesSettingsSearchTerm("código de diagnóstico", "digo"), false, "mid-word Latin substring does not false-match");
    panel.remove();

    // Russian Cyrillic word-start matching
    plugin.settings.ui.language = "ru";
    panel = plugin.getSettingsPanel();
    body.appendChild(panel);
    state = panel.__daitSettingsUi;
    const ruMatches = plugin.runSettingsSearch(state, "перевод");
    assert.ok(ruMatches.length > 0, "Russian Cyrillic search finds translation rows");
    panel.remove();

    // Arabic search (including tashkeel-insensitive and Definite Article prefix)
    plugin.settings.ui.language = "ar";
    panel = plugin.getSettingsPanel();
    body.appendChild(panel);
    state = panel.__daitSettingsUi;
    const arMatches = plugin.runSettingsSearch(state, "ترجمة");
    assert.ok(arMatches.length > 0, "Arabic root word matches الترجمة rows");
    assert.equal(plugin.matchesSettingsSearchTerm("تَرْجَمَة الرَّسَائِل", "ترجمة"), true);
    panel.remove();

    // Traditional Chinese search
    plugin.settings.ui.language = "zh-TW";
    panel = plugin.getSettingsPanel();
    body.appendChild(panel);
    state = panel.__daitSettingsUi;
    const twMatches = plugin.runSettingsSearch(state, "自動翻譯");
    assert.ok(twMatches.length > 0, "Traditional Chinese search finds 自動翻譯 rows");
    panel.remove();
});

// --- 5. Audited Bug Fix Regressions ---

test("Bug regressions: ComposerWriter activeWrite key lookup, IME search guard, channel-mismatch apply lock, and stale tabpanel jump", async t => {
    const { body } = installDom(t);
    const plugin = createPlugin(t);

    // 1. ComposerWriter.hasActiveWrite / getActiveWrite resolve by composerKey or textbox
    const form = new FakeElement("form");
    const textbox = new FakeElement("div");
    textbox.setAttribute("role", "textbox");
    form.appendChild(textbox);
    body.appendChild(form);
    const token = plugin.composerWriter.beginWrite(textbox, "draft");
    assert.equal(plugin.composerWriter.hasActiveWrite(textbox), true);
    assert.equal(plugin.composerWriter.getActiveWrite(textbox), token);
    plugin.composerWriter.finishWriteToken(token);
    assert.equal(plugin.composerWriter.hasActiveWrite(textbox), false);

    // 2. Settings search ignores Enter / Escape during IME composition (isComposing / keyCode 229)
    const panel = plugin.getSettingsPanel();
    body.appendChild(panel);
    const state = panel.__daitSettingsUi;
    plugin.runSettingsSearch(state, "API");
    assert.ok(state.searchEntries.length > 0);
    state.searchInput.focus();
    plugin.bindSettingsSearchEscape(state);
    state.searchInput.dispatch("keydown", { key: "Enter", isComposing: true });
    assert.equal(state.results.hidden, false, "IME Enter does not trigger search jump");
    state.searchInput.dispatch("keydown", { key: "Escape", keyCode: 229 });
    assert.equal(state.searchQuery, "api", "IME Escape (229) does not clear search");

    // 3. openSettingsControl rebuilds a stale Translate tabpanel when provider changed before jumping
    plugin.settings.translation.provider = "deepl";
    const jumped = plugin.openSettingsControl(panel.querySelector(".dait-settings-header"), "translate", "translation.deeplPlan");
    assert.equal(jumped, true, "openSettingsControl rebuilt Translate tab for DeepL and focused deeplPlan");
    panel.remove();

    // 4. Polish Result Panel keeps Apply button disabled after channel mismatch
    let currentRoute = "guild-1:channel-a";
    plugin.getCurrentRouteKey = () => currentRoute;
    plugin.showPolishResultPanel(textbox, "Polished text", { originRouteKey: "guild-1:channel-a" });
    const applyBtn = plugin.polishResultPanel.querySelector(".dait-polish-result-apply");
    assert.ok(applyBtn);
    currentRoute = "guild-1:channel-b";
    applyBtn.click();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(applyBtn.disabled, true, "Apply stays disabled after channel mismatch");
    plugin.removePolishResultPanel();
});
