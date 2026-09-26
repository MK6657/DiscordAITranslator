"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { I18N } = require("../../src/i18n");

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

const tick = () => new Promise(resolve => setImmediate(resolve));

// Just enough DOM for the settings builders touched here: elements, class and [data-dait-path] lookups,
// attributes, listeners and select values.
function createFakeDocument() {
    const elements = [];
    const matches = (element, selector) => {
        const path = /^\[data-dait-path(?:='([^']*)')?\]$/.exec(selector);
        if (path) return typeof element.dataset.daitPath === "string" && (path[1] === undefined || element.dataset.daitPath === path[1]);
        if (selector.startsWith(".")) return String(element.className || "").split(/\s+/).includes(selector.slice(1));
        if (selector === "[role='dialog']") return element.attributes.role === "dialog";
        return false;
    };
    const descendants = (root, output = []) => {
        for (const child of root.children) {
            output.push(child);
            descendants(child, output);
        }
        return output;
    };
    const createElement = tag => {
        const element = {
            tagName: String(tag).toUpperCase(),
            children: [],
            dataset: {},
            attributes: {},
            listeners: {},
            style: {},
            className: "",
            isConnected: true,
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            appendChild(child) {
                this.children.push(child);
                child.parentNode = this;
                child.parentElement = this;
                return child;
            },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name]; },
            removeAttribute(name) { delete this.attributes[name]; },
            addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
            removeEventListener() {},
            dispatch(type, extra = {}) {
                return Promise.all((this.listeners[type] || []).map(handler => handler({ type, target: this, preventDefault() {}, stopPropagation() {}, ...extra })));
            },
            querySelectorAll(selector) { return descendants(this).filter(node => !node.removed && matches(node, selector)); },
            querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
            closest() { return null; },
            focus() { doc.activeElement = this; },
            remove() { this.removed = true; }
        };
        // Like the DOM, setting textContent replaces the children.
        let text = "";
        Object.defineProperty(element, "textContent", {
            get() { return element.children.length ? element.children.map(child => child.textContent).join("") : text; },
            set(next) {
                element.children = [];
                text = String(next ?? "");
            }
        });
        if (element.tagName === "SELECT") {
            Object.defineProperty(element, "value", {
                get() { return (element.children.find(option => option.selected) || element.children[0])?.value ?? ""; },
                set(next) { element.children.forEach(option => { option.selected = String(option.value) === String(next); }); }
            });
        }
        elements.push(element);
        return element;
    };
    const doc = {
        elements,
        activeElement: null,
        body: null,
        createElement,
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
        querySelectorAll(selector) { return elements.filter(node => !node.removed && matches(node, selector)); }
    };
    return doc;
}

function quietPlugin() {
    const plugin = new Plugin();
    plugin.toasts = [];
    plugin.showToast = (text, type) => plugin.toasts.push({ text, type });
    plugin.saveSettings = () => true;
    plugin.saveData = () => true;
    plugin.invalidateAutoTranslationQueue = () => {};
    plugin.queueScan = () => {};
    return plugin;
}

// A BetterDiscord stand-in whose confirmation modal records each call; the test answers it.
function createModalApi(extra = {}) {
    const calls = [];
    return {
        calls,
        api: {
            UI: {
                showConfirmationModal(title, content, options) {
                    calls.push({ title, content, options });
                    return `modal-${calls.length}`;
                }
            },
            ...extra
        }
    };
}

// Tiny React stand-in: elements are plain objects, a function component runs once with working useState.
function createFakeReact() {
    const createElement = (type, props, ...children) => ({ type, props: props || {}, children: children.flat().filter(child => child !== null && child !== undefined && child !== false) });
    return { createElement, useState: initial => [initial, () => {}] };
}

function renderTree(node) {
    if (node && typeof node.type === "function") return renderTree(node.type(node.props || {}));
    if (node && Array.isArray(node.children)) node.children = node.children.map(renderTree);
    return node;
}

function findNode(node, predicate) {
    if (!node || typeof node !== "object") return null;
    if (predicate(node)) return node;
    for (const child of node.children || []) {
        const found = findNode(child, predicate);
        if (found) return found;
    }
    return null;
}

function textOf(node) {
    if (node === null || node === undefined) return "";
    if (typeof node !== "object") return String(node);
    return (node.children || []).map(textOf).join("");
}

// --- copy ---------------------------------------------------------------------------------------

// Row descriptions are one short sentence. Weighted length: a CJK character counts 1, other visible
// characters 0.5, a {placeholder} 2 (zh budget 40); English counts characters (budget 90).
const DESCRIPTION_BUDGET = { zh: 40, en: 90 };
// Descriptions allowed to run longer. Keep this list short and explain each entry.
const DESCRIPTION_LENGTH_ALLOWLIST = new Set([]);

function zhWeight(text) {
    let weight = 0;
    for (const char of String(text).replace(/\{\w+\}/g, "\u0000\u0000\u0000\u0000")) {
        if (/\s/.test(char)) continue;
        weight += /[⺀-鿿　-〿＀-￯‘-”—·]/.test(char) ? 1 : 0.5;
    }
    return weight;
}

function enLength(text) {
    return String(text).replace(/\{\w+\}/g, "xx").length;
}

test("zh and en have the same keys", () => {
    const zhKeys = Object.keys(I18N["zh-CN"]).sort();
    const enKeys = Object.keys(I18N.en).sort();
    assert.deepEqual(zhKeys.filter(key => !enKeys.includes(key)), [], "keys only in zh");
    assert.deepEqual(enKeys.filter(key => !zhKeys.includes(key)), [], "keys only in en");
    for (const key of zhKeys) {
        assert.equal(typeof I18N["zh-CN"][key], "string", key);
        assert.equal(typeof I18N.en[key], "string", key);
    }
});

test("zh text says 服务商, never 'provider', and no string names internal tools", () => {
    const withoutPlaceholders = value => String(value).replace(/\{\w+\}/g, "");
    for (const [key, value] of Object.entries(I18N["zh-CN"])) {
        assert.doesNotMatch(withoutPlaceholders(value), /provider/i, `zh.${key}`);
        assert.doesNotMatch(value, /codex|同事/i, `zh.${key}`);
    }
    for (const [key, value] of Object.entries(I18N.en)) {
        assert.doesNotMatch(value, /codex/i, `en.${key}`);
    }
    // No raw error codes such as MODEL_OUTPUT_TRUNCATED in either language.
    for (const locale of ["zh-CN", "en"]) {
        for (const [key, value] of Object.entries(I18N[locale])) {
            assert.doesNotMatch(value, /\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b/, `${locale}.${key}`);
        }
    }
});

test("row descriptions stay within the one-sentence length budget", () => {
    const over = [];
    for (const key of Object.keys(I18N.en).filter(name => /Desc$/.test(name))) {
        if (DESCRIPTION_LENGTH_ALLOWLIST.has(key)) continue;
        const zh = zhWeight(I18N["zh-CN"][key]);
        const en = enLength(I18N.en[key]);
        if (zh > DESCRIPTION_BUDGET.zh) over.push(`zh.${key} (${zh})`);
        if (en > DESCRIPTION_BUDGET.en) over.push(`en.${key} (${en})`);
        // One sentence: at most one sentence end ("e.g." is not one).
        const zhEnds = (String(I18N["zh-CN"][key]).match(/[。！？]/g) || []).length;
        const enEnds = (String(I18N.en[key]).replace(/\be\.g\./g, "eg").match(/[.!?](\s|$)/g) || []).length;
        if (zhEnds > 1) over.push(`zh.${key} (${zhEnds} sentences)`);
        if (enEnds > 1) over.push(`en.${key} (${enEnds} sentences)`);
    }
    assert.deepEqual(over, []);
    // The language row appends the custom-language hint; the pair stays one short line as well.
    for (const key of ["targetLanguageDesc", "outputLanguageDesc", "inputLanguageDesc"]) {
        assert.ok(zhWeight(`${I18N["zh-CN"][key]}${I18N["zh-CN"].customLanguageDesc}`) <= DESCRIPTION_BUDGET.zh + 8, key);
        assert.ok(enLength(`${I18N.en[key]} ${I18N.en.customLanguageDesc}`) <= DESCRIPTION_BUDGET.en + 20, key);
    }
});

test("strict retry means the same thing in zh and en, and switch labels are worded positively", () => {
    assert.match(I18N["zh-CN"].autoTranslateStrictRetry, /语言/);
    assert.match(I18N.en.autoTranslateStrictRetry, /language/i);
    for (const key of ["showAutoTranslateWarnings", "showAutoTranslateToasts"]) {
        assert.doesNotMatch(I18N["zh-CN"][key], /^开启后/, key);
        assert.doesNotMatch(I18N.en[key], /when enabled/i, key);
    }
    // The channel rule uses the spec's three labels.
    assert.deepEqual(["channelPolicyInherit", "channelPolicyEnabled", "channelPolicyDisabled"].map(key => I18N["zh-CN"][key]), ["跟随总开关", "总是翻译", "不翻译"]);
    assert.deepEqual(["channelPolicyInherit", "channelPolicyEnabled", "channelPolicyDisabled"].map(key => I18N.en[key]), ["Follow main switch", "Always translate", "Never translate"]);
});

test("copying test input or output does not claim a prompt was copied", async t => {
    useGlobals(t, { document: createFakeDocument() });
    const plugin = quietPlugin();
    plugin.copyTextToClipboard = async () => {};
    plugin.getSettingsScrollSnapshot = () => ({});
    await plugin.copyTextFromNode({ textContent: "model output" });
    await plugin.copyPromptText({ value: "prompt" });
    await plugin.copyPromptText({ value: "sample" }, "copiedToClipboard");
    assert.deepEqual(plugin.toasts.map(toast => toast.text), [plugin.t("copiedToClipboard"), plugin.t("promptCopied"), plugin.t("copiedToClipboard")]);
    assert.notEqual(plugin.t("copiedToClipboard"), plugin.t("promptCopied"));
});

test("diagnostic summary groups are labelled in the interface language", t => {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    const summary = { top: { failureLayers: [{ key: "request", count: 2 }], flowStages: [{ key: "queue", count: 1 }] } };
    for (const language of ["zh-CN", "en"]) {
        plugin.settings.ui.language = language;
        const panel = plugin.createDiagnosticSummaryPanel(summary);
        const titles = panel.querySelectorAll(".dait-diagnostic-summary-title").map(node => node.textContent);
        assert.deepEqual(titles, [plugin.t("diagnosticSummaryFailureLayers"), plugin.t("diagnosticSummaryFlowStages")]);
        assert.equal(titles.includes("failureLayer") || titles.includes("flowStage"), false);
    }
});

// --- confirmAction ------------------------------------------------------------------------------

test("confirmAction uses BetterDiscord's confirmation modal with danger styling and resolves on its callbacks", async t => {
    const doc = createFakeDocument();
    const quickRoot = doc.createElement("div");
    quickRoot.className = "dait-quick-settings-modal-root";
    const modal = createModalApi();
    let nativeCalls = 0;
    useGlobals(t, { document: doc, BdApi: modal.api, window: { confirm: () => { nativeCalls++; return true; } } });
    const plugin = quietPlugin();

    const first = plugin.confirmAction({ title: "Delete?", body: "Body text", confirmText: "Delete", danger: true });
    assert.equal(modal.calls.length, 1);
    const { title, content, options } = modal.calls[0];
    assert.equal(title, "Delete?");
    assert.equal(content, "Body text");
    assert.equal(options.danger, true);
    assert.equal(options.confirmText, "Delete");
    assert.equal(options.cancelText, plugin.t("dialogCancel"));
    // While the dialog is open the settings window steps below Discord's layers and ignores its own keys.
    assert.equal(plugin.isConfirmDialogOpen(), true);
    assert.equal(quickRoot.getAttribute("data-dait-confirm-open"), "true");
    options.onConfirm();
    options.onClose?.();
    assert.equal(await first, true);
    assert.equal(plugin.isConfirmDialogOpen(), false);
    assert.equal(quickRoot.getAttribute("data-dait-confirm-open"), undefined);

    const second = plugin.confirmAction({ title: "Again?" });
    modal.calls[1].options.onCancel();
    assert.equal(await second, false);

    // Escape or a backdrop click (reported as onClose) counts as cancel.
    const third = plugin.confirmAction({ title: "Dismiss?" });
    modal.calls[2].options.onClose();
    assert.equal(await third, false);
    assert.equal(nativeCalls, 0);
    assert.equal(plugin.isConfirmDialogOpen(), false);
});

test("confirmAction falls back to window.confirm only without BetterDiscord's modal", async t => {
    const prompts = [];
    useGlobals(t, { document: createFakeDocument(), BdApi: { Data: {} }, window: { confirm: text => { prompts.push(text); return prompts.length === 1; } } });
    const plugin = quietPlugin();
    assert.equal(await plugin.confirmAction({ title: "Clear?", body: ["First.", "Second."], preview: "quoted" }), true);
    assert.equal(prompts[0], "Clear?\n\nFirst.\n\nSecond.\n\nquoted");
    assert.equal(await plugin.confirmAction({ title: "Clear?" }), false);
});

test("confirmAction resolves false when the plugin stopped while the dialog was open", async t => {
    const modal = createModalApi();
    useGlobals(t, { document: createFakeDocument(), BdApi: modal.api });
    const plugin = quietPlugin();
    const pending = plugin.confirmAction({ title: "Clear?" });
    plugin.lifecycleToken++;
    modal.calls[0].options.onConfirm();
    assert.equal(await pending, false);
});

test("confirmAction treats a dialog that disappears without a callback as cancelled", async t => {
    const doc = createFakeDocument();
    const modal = createModalApi();
    let dialog = null;
    modal.api.UI.showConfirmationModal = (title, content, options) => {
        modal.calls.push({ title, content, options });
        dialog = doc.createElement("div");
        dialog.setAttribute("role", "dialog");
    };
    const intervals = [];
    useGlobals(t, {
        document: doc,
        BdApi: modal.api,
        setInterval: callback => { intervals.push(callback); return intervals.length; },
        clearInterval: () => {}
    });
    const plugin = quietPlugin();
    let result = null;
    plugin.confirmAction({ title: "Old BetterDiscord" }).then(value => { result = value; });
    intervals[0]();
    assert.equal(result, null);
    dialog.isConnected = false;
    intervals[0]();
    await tick();
    assert.equal(result, false);
    assert.equal(plugin.isConfirmDialogOpen(), false);
});

test("destructive settings actions ask first: clear cache, clear logs, Google usage reset", async t => {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    const asked = [];
    let answer = false;
    plugin.confirmAction = async options => { asked.push(options); return answer; };
    const done = [];
    plugin.clearTranslationCache = () => done.push("cache");
    plugin.clearDiagnosticLogs = () => done.push("logs");
    plugin.resetGoogleTranslateUsageStats = () => done.push("google");
    plugin.refreshDiagnosticSummary = () => {};

    const cacheButtons = plugin.createTranslationCacheStatsRow().querySelectorAll(".dait-small-button-danger");
    const logButtons = plugin.createDiagnosticLogsRow().querySelectorAll(".dait-small-button");
    const clearLogs = logButtons.find(button => button.textContent === plugin.t("clearDiagnosticLogs"));
    const googleReset = plugin.createGoogleTranslateStatsRow().querySelectorAll(".dait-small-button-danger")[0];
    for (const button of [cacheButtons[0], clearLogs, googleReset]) await button.dispatch("click");
    assert.deepEqual(done, [], "nothing happens when the dialog is cancelled");
    assert.equal(asked.length, 3);
    assert.ok(asked.every(options => options.danger === true && options.title && options.body));

    answer = true;
    for (const button of [cacheButtons[0], clearLogs, googleReset]) await button.dispatch("click");
    assert.deepEqual(done, ["cache", "logs", "google"]);
});

// --- reset dialog -------------------------------------------------------------------------------

test("reset dialog lists what is erased and passes the keep-credentials checkbox to the reset", async t => {
    const React = createFakeReact();
    const modal = createModalApi({ React });
    useGlobals(t, { document: createFakeDocument(), BdApi: modal.api });
    const plugin = quietPlugin();
    const resets = [];
    const refreshed = [];
    plugin.resetSettingsToDefaults = options => { resets.push(options); return true; };
    plugin.refreshOpenSettingsPanels = panel => refreshed.push(panel);

    // Default: the box stays ticked.
    let pending = plugin.openResetSettingsDialog({ panel: "panel-a" });
    let call = modal.calls.at(-1);
    assert.equal(call.title, plugin.t("resetDialogTitle"));
    assert.equal(call.options.danger, true);
    assert.equal(call.options.confirmText, plugin.t("reset"));
    let tree = renderTree(call.content);
    const text = textOf(tree);
    for (const key of ["resetDialogItemSettings", "resetDialogItemChannelRules", "resetDialogItemDisplay", "resetDialogItemCredentials", "resetDialogItemCredentialsNote", "resetKeepCredentials"]) {
        assert.ok(text.includes(plugin.t(key)), key);
    }
    const checkbox = findNode(tree, node => node.type === "input" && node.props.type === "checkbox");
    assert.equal(checkbox.props.checked ?? checkbox.props.defaultChecked, true);
    call.options.onConfirm();
    assert.equal(await pending, true);
    assert.deepEqual(resets, [{ keepCredentials: true }]);
    assert.deepEqual(refreshed, ["panel-a"]);

    // Unticked: credentials, the key pool and templates go too.
    pending = plugin.openResetSettingsDialog();
    call = modal.calls.at(-1);
    tree = renderTree(call.content);
    findNode(tree, node => node.type === "input").props.onChange({ target: { checked: false } });
    call.options.onConfirm();
    await pending;
    assert.deepEqual(resets.at(-1), { keepCredentials: false });

    // Cancel changes nothing.
    pending = plugin.openResetSettingsDialog();
    modal.calls.at(-1).options.onCancel();
    assert.equal(await pending, false);
    assert.equal(resets.length, 2);
});

test("reset dialog without BdApi.React falls back to a plain confirmation that keeps credentials", async t => {
    const modal = createModalApi();
    useGlobals(t, { document: createFakeDocument(), BdApi: modal.api });
    const plugin = quietPlugin();
    const resets = [];
    plugin.resetSettingsToDefaults = options => resets.push(options);
    plugin.refreshOpenSettingsPanels = () => {};
    const pending = plugin.openResetSettingsDialog();
    assert.equal(modal.calls[0].content, plugin.t("resetConfirm"));
    modal.calls[0].options.onConfirm();
    await pending;
    assert.deepEqual(resets, [{ keepCredentials: true }]);
});

test("refreshOpenSettingsPanels rebuilds each open panel, the settings window with its own flag", t => {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    const pluginPanel = doc.createElement("div");
    pluginPanel.className = "dait-settings";
    const windowPanel = doc.createElement("div");
    windowPanel.className = "dait-settings";
    windowPanel.closest = selector => (selector === ".dait-quick-settings-modal-root" ? {} : null);
    const built = [];
    plugin.getSettingsPanel = options => { built.push(options); return { built: true }; };
    const replaced = [];
    plugin.replaceSettingsPanelElement = (panel, next) => { replaced.push(panel); return next; };
    assert.equal(plugin.refreshOpenSettingsPanels(), 2);
    assert.deepEqual(replaced, [pluginPanel, windowPanel]);
    assert.deepEqual(built, [{ quickSettings: false }, { quickSettings: true }]);
});

// --- polish "ask before sending" ------------------------------------------------------------------

function createConfirmSendFlow(t) {
    const timers = [];
    useGlobals(t, {
        document: { activeElement: null, body: {}, documentElement: {}, querySelectorAll: () => [] },
        setTimeout: callback => { timers.push(callback); return timers.length; },
        clearTimeout: () => {}
    });
    const plugin = quietPlugin();
    plugin.settings.polish.afterAction = "confirmSend";
    const textbox = { isConnected: true, text: "draft" };
    const calls = { submits: 0, busy: [], confirmOptions: [] };
    plugin.getActiveTextbox = () => textbox;
    plugin.getElementText = box => box.text;
    plugin.runModelTask = async () => "polished draft";
    plugin.replaceTextboxTextSafelyAsync = async (box, text) => {
        box.text = text;
        return { ok: true };
    };
    plugin.showRestoreOriginalControl = () => {};
    plugin.submitTextbox = () => { calls.submits++; };
    plugin.setButtonBusy = (_button, busy) => calls.busy.push(busy);
    let resolveConfirm = null;
    plugin.confirmAction = options => {
        calls.confirmOptions.push({ ...options, busyAtOpen: [...calls.busy] });
        return new Promise(resolve => { resolveConfirm = resolve; });
    };
    return { plugin, textbox, calls, timers, answer: value => resolveConfirm(value) };
}

test("ask-before-sending opens after the button is free and sends only the unchanged draft", async t => {
    const flow = createConfirmSendFlow(t);
    const run = flow.plugin.polishCurrentDraft();
    await tick();
    assert.equal(flow.calls.confirmOptions.length, 1);
    const [options] = flow.calls.confirmOptions;
    assert.deepEqual(options.busyAtOpen, [true, false], "the busy state is cleared before the dialog opens");
    assert.equal(options.title, flow.plugin.t("confirmSend"));
    assert.equal(options.preview, "polished draft");
    assert.equal(options.confirmText, flow.plugin.t("confirmSendAction"));
    flow.answer(true);
    await run;
    assert.equal(flow.timers.length, 1);
    flow.timers[0]();
    assert.equal(flow.calls.submits, 1);
});

test("ask-before-sending does not send when the draft changed while the dialog was open", async t => {
    const flow = createConfirmSendFlow(t);
    const run = flow.plugin.polishCurrentDraft();
    await tick();
    flow.textbox.text = "polished draft, then edited";
    flow.answer(true);
    await run;
    assert.equal(flow.timers.length, 0);
    assert.equal(flow.calls.submits, 0);
    assert.deepEqual(flow.plugin.toasts.map(toast => toast.text), [flow.plugin.t("confirmSendDraftChanged")]);
});

test("ask-before-sending does not send to a disconnected composer, after stop, or when cancelled", async t => {
    const flow = createConfirmSendFlow(t);
    let run = flow.plugin.polishCurrentDraft();
    await tick();
    flow.textbox.isConnected = false;
    flow.answer(true);
    await run;
    assert.equal(flow.timers.length, 0);

    flow.textbox.isConnected = true;
    flow.textbox.text = "draft";
    run = flow.plugin.polishCurrentDraft();
    await tick();
    flow.plugin.lifecycleToken++;
    flow.answer(true);
    await run;
    assert.equal(flow.timers.length, 0);

    flow.plugin.lifecycleToken = flow.plugin.getLifecycleToken();
    flow.textbox.text = "draft";
    run = flow.plugin.polishCurrentDraft();
    await tick();
    flow.answer(false);
    await run;
    assert.equal(flow.timers.length, 0);
    assert.equal(flow.calls.submits, 0);
});

test("a confirmed send that the draft changed after still stops at the submit timer", async t => {
    const flow = createConfirmSendFlow(t);
    const run = flow.plugin.polishCurrentDraft();
    await tick();
    flow.answer(true);
    await run;
    flow.textbox.text = "typed during the 80 ms";
    flow.timers[0]();
    assert.equal(flow.calls.submits, 0);
});

// --- prompt templates -----------------------------------------------------------------------------

function createPromptManagerFixture(t, options = {}) {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc, window: { prompt: () => { throw new Error("window.prompt must not be used"); } }, ...options.globals });
    const plugin = quietPlugin();
    plugin.preserveSettingsScroll = (_anchor, action) => action();
    plugin.settings.translation.promptTemplates = [
        { id: "tpl-a", serial: "001", name: "Natural", prompt: "prompt A" },
        { id: "tpl-b", serial: "002", name: "Literal", prompt: "prompt B" }
    ];
    plugin.settings.translation.activePromptTemplate = "tpl-a";
    plugin.settings.translation.prompt = "prompt A";
    const manager = plugin.createPromptManager("translation");
    const all = manager.querySelectorAll.bind(manager);
    const byAction = action => all(".dait-small-button").find(button => button.dataset.daitAction === action);
    return {
        plugin,
        doc,
        manager,
        select: all(".dait-prompt-select")[0],
        preview: all(".dait-prompt-preview")[0],
        textarea: all("[data-dait-path='translation.prompt']")[0],
        nameInput: all(".dait-prompt-save")[0].children.find(child => child.tagName === "INPUT"),
        status: all(".dait-prompt-status")[0],
        apply: byAction("promptApply"),
        save: byAction("promptSave"),
        update: byAction("promptUpdate"),
        remove: byAction("promptDelete")
    };
}

test("choosing a template only previews it; the prompt stays as it is", async t => {
    const ui = createPromptManagerFixture(t);
    assert.equal(ui.select.value, "tpl-a");
    assert.equal(ui.preview.textContent, "prompt A");
    ui.select.value = "tpl-b";
    await ui.select.dispatch("change");
    assert.equal(ui.preview.textContent, "prompt B");
    assert.equal(ui.plugin.settings.translation.prompt, "prompt A");
    assert.equal(ui.plugin.settings.translation.activePromptTemplate, "tpl-a");
    assert.equal(ui.textarea.value, "prompt A");
});

test("Use template applies at once when nothing unsaved would be lost", async t => {
    const ui = createPromptManagerFixture(t);
    let asked = 0;
    ui.plugin.confirmAction = async () => { asked++; return false; };
    ui.select.value = "tpl-b";
    await ui.select.dispatch("change");
    await ui.apply.dispatch("click");
    assert.equal(asked, 0);
    assert.equal(ui.plugin.settings.translation.prompt, "prompt B");
    assert.equal(ui.plugin.settings.translation.activePromptTemplate, "tpl-b");
    assert.equal(ui.textarea.value, "prompt B");
});

test("Use template asks before replacing unsaved edits", async t => {
    const ui = createPromptManagerFixture(t);
    const asked = [];
    let answer = false;
    ui.plugin.confirmAction = async options => { asked.push(options); return answer; };
    ui.textarea.value = "prompt A, edited by hand";
    await ui.textarea.dispatch("change");
    ui.select.value = "tpl-b";
    await ui.select.dispatch("change");

    await ui.apply.dispatch("click");
    assert.equal(asked.length, 1);
    assert.equal(asked[0].title, ui.plugin.t("promptApplyUnsavedTitle"));
    assert.equal(asked[0].danger, true);
    assert.equal(ui.plugin.settings.translation.prompt, "prompt A, edited by hand");
    assert.equal(ui.textarea.value, "prompt A, edited by hand");

    answer = true;
    await ui.apply.dispatch("click");
    assert.equal(ui.plugin.settings.translation.prompt, "prompt B");
    assert.equal(ui.textarea.value, "prompt B");
});

test("Save names the template inline instead of window.prompt", async t => {
    const ui = createPromptManagerFixture(t);
    ui.textarea.value = "my own prompt";
    await ui.textarea.dispatch("change");

    await ui.save.dispatch("click");
    assert.deepEqual(ui.plugin.toasts.map(toast => toast.text), [ui.plugin.t("promptNameRequired")]);
    assert.equal(ui.plugin.settings.translation.promptTemplates.length, 2);

    ui.nameInput.value = "  Mine  ";
    await ui.save.dispatch("click");
    const saved = ui.plugin.settings.translation.promptTemplates.at(-1);
    assert.equal(saved.name, "Mine");
    assert.equal(saved.prompt, "my own prompt");
    assert.equal(ui.plugin.settings.translation.activePromptTemplate, saved.id);
    assert.equal(ui.select.value, saved.id);
    assert.equal(ui.nameInput.value, "");
    assert.equal(ui.status.textContent, ui.plugin.t("promptUsingTemplate", { code: saved.serial, name: "Mine" }));

    // Enter in the name field saves too, but not while an IME is composing.
    ui.textarea.value = "second prompt";
    await ui.textarea.dispatch("change");
    ui.nameInput.value = "Second";
    await ui.nameInput.dispatch("keydown", { key: "Enter", isComposing: true });
    assert.equal(ui.plugin.settings.translation.promptTemplates.length, 3);
    await ui.nameInput.dispatch("keydown", { key: "Enter" });
    assert.equal(ui.plugin.settings.translation.promptTemplates.length, 4);
});

test("Update overwrites the template in use, not the one being previewed", async t => {
    const ui = createPromptManagerFixture(t);
    assert.equal(ui.update.disabled, true, "nothing to update while the prompt matches its template");
    ui.textarea.value = "prompt A v2";
    await ui.textarea.dispatch("input");
    assert.equal(ui.update.disabled, false);
    ui.select.value = "tpl-b";
    await ui.select.dispatch("change");
    await ui.update.dispatch("click");
    const templates = ui.plugin.settings.translation.promptTemplates;
    assert.equal(templates.find(template => template.id === "tpl-a").prompt, "prompt A v2");
    assert.equal(templates.find(template => template.id === "tpl-b").prompt, "prompt B");
});

test("Delete template asks first", async t => {
    const ui = createPromptManagerFixture(t);
    const asked = [];
    let answer = false;
    ui.plugin.confirmAction = async options => { asked.push(options); return answer; };
    ui.select.value = "tpl-b";
    await ui.select.dispatch("change");
    await ui.remove.dispatch("click");
    assert.equal(ui.plugin.settings.translation.promptTemplates.length, 2);
    assert.equal(asked[0].danger, true);
    assert.equal(asked[0].body, "002 · Literal");
    answer = true;
    await ui.remove.dispatch("click");
    assert.deepEqual(ui.plugin.settings.translation.promptTemplates.map(template => template.id), ["tpl-a"]);
    assert.equal(ui.plugin.settings.translation.prompt, "prompt A");
});

test("deleting the template in use says which template the prompt switches to", async t => {
    const ui = createPromptManagerFixture(t);
    const asked = [];
    ui.plugin.confirmAction = async options => { asked.push(options); return true; };
    assert.equal(ui.select.value, "tpl-a");
    await ui.remove.dispatch("click");
    assert.deepEqual(asked[0].body, ["001 · Natural", ui.plugin.t("promptDeleteActiveNote", { code: "002", name: "Literal" })]);
    assert.equal(ui.plugin.settings.translation.activePromptTemplate, "tpl-b");
    assert.equal(ui.plugin.settings.translation.prompt, "prompt B");
    assert.equal(ui.textarea.value, "prompt B");
    assert.equal(ui.status.textContent, ui.plugin.t("promptUsingTemplate", { code: "002", name: "Literal" }));
});

test("the status names the template that Update would overwrite while the prompt differs from it", async t => {
    const ui = createPromptManagerFixture(t);
    assert.equal(ui.status.textContent, ui.plugin.t("promptUsingTemplate", { code: "001", name: "Natural" }));
    ui.textarea.value = "prompt A, edited";
    await ui.textarea.dispatch("input");
    assert.equal(ui.status.textContent, ui.plugin.t("promptTemplateEdited", { code: "001", name: "Natural" }));
    assert.equal(ui.update.disabled, false);
    // Text that another template holds counts as that template.
    ui.textarea.value = "prompt B";
    await ui.textarea.dispatch("input");
    assert.equal(ui.status.textContent, ui.plugin.t("promptUsingTemplate", { code: "002", name: "Literal" }));
});

// --- public bilingual "current flow" ----------------------------------------------------------------

test("public bilingual current flow shows the service and language the bilingual message really uses", t => {
    useGlobals(t, { document: createFakeDocument() });
    const plugin = quietPlugin();
    plugin.settings.ui.language = "en";
    plugin.settings.polish.provider = "deepseek";
    plugin.settings.polish.apiKey = "sk-fake-1";
    plugin.settings.polish.targetLanguage = "English";
    plugin.settings.polish.enabled = true;
    plugin.settings.translation.provider = "sakuraLocal";
    plugin.settings.translation.targetLanguage = "汉语";
    plugin.settings.ui.publicBilingualPolishBeforeTranslate = false;
    plugin.settings.ui.publicBilingualAfterPolish = false;

    const deepseek = plugin.getProviderDisplayName("deepseek");
    const usable = plugin.getPublicBilingualFlowText();
    assert.equal(usable, plugin.t("publicBilingualDependencyStatus", {
        polishProvider: plugin.t("publicBilingualDependencyPolishOff"),
        translationProvider: deepseek,
        targetLanguage: plugin.getDisplayLanguage("English")
    }));
    assert.equal(plugin.getProviderDisplayName(plugin.getPublicBilingualBaseConfig().provider), deepseek);

    plugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    assert.match(plugin.getPublicBilingualFlowText(), new RegExp(`^Polish: ${deepseek};`));

    // Without a usable polish service the translation service translates; the language still follows polish.
    plugin.settings.polish.apiKey = "";
    const text = plugin.getPublicBilingualFlowText();
    assert.ok(text.includes(`translation: ${plugin.getProviderDisplayName("sakuraLocal")}`), text);
    assert.ok(text.includes(`target: ${plugin.getDisplayLanguage("English")}`), text);

    const row = plugin.createPublicBilingualDependencyRow();
    const summary = row.querySelectorAll(".dait-provider-summary")[0];
    assert.equal(summary.textContent, text);
});
