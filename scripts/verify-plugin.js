const assert = require("node:assert/strict");
const Plugin = require("../DiscordAITranslator.plugin.js");

const DEFAULT_TEST_BDAPI = {
    Data: {
        load: () => null,
        save: () => true
    }
};
if (global.BdApi === undefined) global.BdApi = DEFAULT_TEST_BDAPI;

function expectThrowsMessage(fn, messagePart) {
    assert.throws(fn, error => String(error.message).includes(messagePart));
}

function getFakeElementClasses(element) {
    return new Set([
        ...String(element?.className || "").split(/\s+/).filter(Boolean),
        ...Array.from(element?.__classes || [])
    ]);
}

function fakeElementHasClass(element, className) {
    return !element?.removed && getFakeElementClasses(element).has(className);
}

function findFakeElementsByClass(root, className, results = []) {
    if (!root || root.removed) return results;
    for (const child of root.children || []) {
        if (fakeElementHasClass(child, className)) results.push(child);
        findFakeElementsByClass(child, className, results);
    }
    return results;
}

function createFakeElement(tag, created = []) {
    const classes = new Set();
    const styleProperties = {};
    const element = {
        __classes: classes,
        tagName: String(tag || "").toUpperCase(),
        children: [],
        dataset: {},
        attributes: {},
        listeners: {},
        parentElement: null,
        className: "",
        textContent: "",
        value: "",
        type: "",
        style: {
            setProperty(name, value) {
                styleProperties[name] = String(value);
                this[name] = String(value);
            },
            removeProperty(name) {
                delete styleProperties[name];
                delete this[name];
            },
            getPropertyValue(name) {
                return styleProperties[name] || "";
            }
        },
        isConnected: true,
        hidden: false,
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        },
        appendChild(child) {
            if (child.parentElement?.children) {
                const previousIndex = child.parentElement.children.indexOf(child);
                if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
            }
            this.children.push(child);
            child.parentElement = this;
            child.removed = false;
            child.isConnected = true;
            return child;
        },
        insertBefore(child, reference) {
            if (child.parentElement?.children) {
                const previousIndex = child.parentElement.children.indexOf(child);
                if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
            }
            const index = this.children.indexOf(reference);
            if (index >= 0) this.children.splice(index, 0, child);
            else this.children.push(child);
            child.parentElement = this;
            child.removed = false;
            child.isConnected = true;
            return child;
        },
        contains(node) {
            if (node === this) return true;
            return this.children.some(child => child === node || child.contains?.(node));
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name];
        },
        addEventListener(type, handler) {
            this.listeners[type] = handler;
        },
        querySelector(selector) {
            if (String(selector || "").startsWith(".")) return findFakeElementsByClass(this, String(selector).slice(1))[0] || null;
            const sectionMatch = String(selector || "").match(/^\[data-dait-settings-section=['"]?([^'"\]]+)['"]?\]$/);
            if (sectionMatch) {
                return (this.querySelectorAll("[data-dait-settings-section]") || [])
                    .find(element => element.dataset?.daitSettingsSection === sectionMatch[1]) || null;
            }
            return null;
        },
        querySelectorAll(selector) {
            if (String(selector || "").startsWith(".")) return findFakeElementsByClass(this, String(selector).slice(1));
            if (String(selector || "") === "[data-dait-settings-section]") {
                const results = [];
                const visit = node => {
                    for (const child of node.children || []) {
                        if (!child.removed && child.dataset?.daitSettingsSection !== undefined) results.push(child);
                        visit(child);
                    }
                };
                visit(this);
                return results;
            }
            const daitPathMatch = String(selector || "").match(/^\[data-dait-path(?:=['"]?([^'"\]]+)['"]?)?\]$/);
            if (daitPathMatch) {
                const results = [];
                const visit = node => {
                    for (const child of node.children || []) {
                        if (!child.removed && child.dataset?.daitPath !== undefined) {
                            if (!daitPathMatch[1] || child.dataset.daitPath === daitPathMatch[1]) results.push(child);
                        }
                        visit(child);
                    }
                };
                visit(this);
                return results;
            }
            return [];
        },
        closest() {
            return null;
        },
        replaceWith() {},
        remove() {
            this.removed = true;
            this.isConnected = false;
            if (this.parentElement?.children) {
                const index = this.parentElement.children.indexOf(this);
                if (index >= 0) this.parentElement.children.splice(index, 1);
            }
            this.parentElement = null;
            (this.children || []).forEach(child => {
                child.removed = true;
                child.isConnected = false;
                child.parentElement = null;
            });
        },
        focus() { this.focused = true; global.document && (global.document.activeElement = this); },
        blur() { this.blurred = true; },
        select() { this.selected = true; },
        scrollIntoView(options) { this.scrolledIntoView = options || true; }
    };
    created.push(element);
    return element;
}

const plugin = new Plugin();
plugin.showToast = () => {};
const startRollbackPlugin = new Plugin();
let startRollbackCalls = 0;
let startRollbackWarnings = 0;
startRollbackPlugin.loadSettings = () => true;
startRollbackPlugin.loadDiagnosticLogs = () => {};
startRollbackPlugin.loadTranslationCache = () => {};
startRollbackPlugin.injectStyles = () => {};
startRollbackPlugin.patchMessageContextMenu = () => { throw new Error("context patch failed"); };
startRollbackPlugin.warnSanitized = () => { startRollbackWarnings++; };
startRollbackPlugin.stop = () => {
    startRollbackCalls++;
    startRollbackPlugin.isStarted = false;
    startRollbackPlugin.lifecycleToken++;
};
assert.throws(() => startRollbackPlugin.start(), /context patch failed/);
assert.equal(startRollbackCalls, 1);
assert.equal(startRollbackWarnings, 1);
assert.equal(startRollbackPlugin.isStarted, false);
const savedDocumentForStartIdempotence = global.document;
const savedWindowForStartIdempotence = global.window;
let startIdempotenceObserverStarts = 0;
let startIdempotencePatches = 0;
let startIdempotenceDocumentListeners = 0;
let startIdempotenceWindowListeners = 0;
global.document = {
    addEventListener() { startIdempotenceDocumentListeners++; }
};
global.window = {
    addEventListener() { startIdempotenceWindowListeners++; }
};
const startIdempotencePlugin = new Plugin();
startIdempotencePlugin.loadSettings = () => true;
startIdempotencePlugin.loadDiagnosticLogs = () => {};
startIdempotencePlugin.loadTranslationCache = () => {};
startIdempotencePlugin.injectStyles = () => {};
startIdempotencePlugin.patchMessageContextMenu = () => { startIdempotencePatches++; };
startIdempotencePlugin.startObserver = () => { startIdempotenceObserverStarts++; };
startIdempotencePlugin.queueScan = () => {};
startIdempotencePlugin.showToast = () => {};
assert.equal(startIdempotencePlugin.start(), true);
assert.equal(startIdempotencePlugin.start(), false);
assert.equal(startIdempotenceObserverStarts, 1);
assert.equal(startIdempotencePatches, 1);
assert.equal(startIdempotenceDocumentListeners, 2);
// scroll, resize, focus, plus pagehide and beforeunload (save pending data on reload or quit).
assert.equal(startIdempotenceWindowListeners, 5);
if (savedDocumentForStartIdempotence === undefined) delete global.document;
else global.document = savedDocumentForStartIdempotence;
if (savedWindowForStartIdempotence === undefined) delete global.window;
else global.window = savedWindowForStartIdempotence;
assert.equal(plugin.t("polishBusy").includes("..."), false);
plugin.settings.interfaceLanguage = "en";
assert.equal(plugin.t("polishBusy").includes("..."), false);
plugin.settings.interfaceLanguage = "zh-CN";
assert.deepEqual(plugin.getSettingsNavItems().map(item => item.id), ["overview", "translate", "compose", "display", "advanced", "data"]);
assert.deepEqual(plugin.getSettingsNavItems().map(item => item.label), ["概览", "翻译消息", "输入框工具", "显示", "高级", "数据与诊断"]);
assert.equal(plugin.getProviderOptionsForTask("polish").some(([provider]) => provider === "googleCloud"), false);
assert.equal(plugin.getProviderOptionsForTask("translation").some(([provider]) => provider === "googleCloud"), true);
assert.equal(plugin.getProviderOptionsForTask("translation").some(([provider]) => provider === "microsoft"), true);
assert.equal(plugin.getProviderOptionsForTask("translation").some(([provider]) => provider === "deepl"), true);
assert.equal(plugin.getProviderOptionsForTask("translation").some(([provider]) => provider === "baidu"), true);
assert.equal(plugin.isProviderAllowedForTask("translation", "googleCloud"), true);
assert.equal(plugin.isProviderAllowedForTask("polish", "googleCloud"), false);
assert.equal(plugin.isProviderAllowedForTask("translation", "microsoft"), true);
assert.equal(plugin.isProviderAllowedForTask("polish", "microsoft"), false);

const savedWindowForPolishReplace = global.window;
const savedDocumentForPolishReplace = global.document;
let polishReplaceToastCount = 0;
const polishReplacePlugin = new Plugin();
polishReplacePlugin.showToast = () => { polishReplaceToastCount++; };
const polishReplaceTextbox = {
    textContent: "old draft",
    focus() { this.focused = true; },
    blur() { this.blurred = true; },
    dispatchEvent(event) { this.lastEvent = event; return true; }
};
let polishReplaceRemoveAllRanges = 0;
let polishReplaceAddRange = 0;
let polishReplaceCollapsedToEnd = false;
global.window = {
    getSelection: () => ({
        removeAllRanges() { polishReplaceRemoveAllRanges++; },
        addRange() { polishReplaceAddRange++; }
    }),
    requestAnimationFrame: callback => { callback(); },
    setTimeout: callback => { callback(); }
};
global.document = {
    createRange: () => ({
        selectNodeContents() {},
        collapse(toStart) { polishReplaceCollapsedToEnd = toStart === false; }
    }),
    execCommand: () => false
};
polishReplacePlugin.replaceTextboxText(polishReplaceTextbox, "new draft");
assert.equal(polishReplaceTextbox.textContent, "new draft");
assert.equal(polishReplaceToastCount, 0);
assert.equal(polishReplaceTextbox.blurred, undefined);
assert.equal(polishReplaceCollapsedToEnd, true);
assert.ok(polishReplaceRemoveAllRanges >= 2);
assert.ok(polishReplaceAddRange >= 2);
polishReplacePlugin.replaceTextboxText(polishReplaceTextbox, "button draft", { blurAfterReplace: true });
assert.equal(polishReplaceTextbox.textContent, "button draft");
assert.equal(polishReplaceTextbox.blurred, true);
const plainValueTextbox = {
    tagName: "TEXTAREA",
    value: "before",
    focus() {},
    dispatchEvent() { return true; }
};
assert.equal(polishReplacePlugin.replaceTextboxText(plainValueTextbox, "plain after"), true);
assert.equal(plainValueTextbox.value, "plain after");
global.window = savedWindowForPolishReplace;
global.document = savedDocumentForPolishReplace;

const polishSessionPlugin = new Plugin();
const polishSessionTextbox = { isConnected: true };
const firstPolishSession = polishSessionPlugin.createPolishSession(polishSessionTextbox, "original draft");
polishSessionPlugin.updatePolishSessionAfterResult(firstPolishSession, polishSessionTextbox, "first polished", true);
assert.equal(polishSessionPlugin.getPolishSession(polishSessionTextbox, "first polished"), firstPolishSession);
assert.equal(polishSessionPlugin.getPolishSourceText(firstPolishSession), "original draft");
polishSessionPlugin.settings.polish.repolishSource = "lastResult";
assert.equal(polishSessionPlugin.getPolishSourceText(firstPolishSession), "first polished");
const editedPolishSession = polishSessionPlugin.getPolishSession(polishSessionTextbox, "manual edit");
assert.notEqual(editedPolishSession, firstPolishSession);
assert.equal(editedPolishSession.originalText, "manual edit");
assert.equal(editedPolishSession.originalRawText, "manual edit");
const restoreGuardPlugin = new Plugin();
const restoreGuardTextbox = { isConnected: true, text: "original  draft" };
restoreGuardPlugin.getElementText = textbox => textbox.text;
const restoreGuardSession = restoreGuardPlugin.createPolishSession(restoreGuardTextbox, restoreGuardTextbox.text);
restoreGuardPlugin.updatePolishSessionAfterResult(restoreGuardSession, restoreGuardTextbox, "polished draft", true);
restoreGuardTextbox.text = "polished draft";
assert.equal(restoreGuardPlugin.canRestorePolishOriginal(restoreGuardTextbox, restoreGuardSession), true);
restoreGuardTextbox.text = "manual edit";
assert.equal(restoreGuardPlugin.canRestorePolishOriginal(restoreGuardTextbox, restoreGuardSession), false);

const savedWindowForRichReplace = global.window;
const savedDocumentForRichReplace = global.document;
const richReplacePlugin = new Plugin();
let richReplaceDispatches = 0;
const richTextbox = {
    tagName: "DIV",
    textContent: "old rich",
    focus() {},
    getAttribute(name) { return name === "data-slate-editor" ? "true" : ""; },
    matches: selector => selector.includes("data-slate-editor"),
    dispatchEvent(event) {
        richReplaceDispatches++;
        if (event.type === "paste") event.preventDefault();
        return true;
    }
};
class FakeDataTransfer {
    constructor() { this.data = {}; }
    setData(type, value) { this.data[type] = value; }
    getData(type) { return this.data[type] || ""; }
}
class FakeClipboardEvent extends Event {
    constructor(type, init = {}) {
        super(type, init);
        this.clipboardData = init.clipboardData;
    }
}
global.window = {
    getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
    DataTransfer: FakeDataTransfer,
    ClipboardEvent: FakeClipboardEvent
};
global.document = {
    activeElement: richTextbox,
    createRange: () => ({ selectNodeContents() {}, collapse() {} }),
    execCommand: () => false
};
assert.equal(richReplacePlugin.replaceTextboxText(richTextbox, "paste text", { blurAfterReplace: false }), false);
assert.equal(richReplaceDispatches, 0);
assert.equal(richTextbox.textContent, "old rich");

const execReplacePlugin = new Plugin();
let execReplaceInputEvents = 0;
const execTextbox = {
    tagName: "DIV",
    textContent: "old exec",
    focus() {},
    dispatchEvent(event) {
        execReplaceInputEvents += event.type === "input" ? 1 : 0;
        return true;
    }
};
global.window = {
    getSelection: () => ({ removeAllRanges() {}, addRange() {} })
};
global.document = {
    activeElement: execTextbox,
    createRange: () => ({ selectNodeContents() {}, collapse() {} }),
    execCommand: () => true
};
execReplacePlugin.replaceTextboxText(execTextbox, "exec text", { blurAfterReplace: false });
assert.equal(execReplaceInputEvents, 1);
assert.equal(execTextbox.textContent, "exec text");
global.window = savedWindowForRichReplace;
global.document = savedDocumentForRichReplace;

const savedWindowForAppendRetry = global.window;
const savedDocumentForAppendRetry = global.document;
const appendRetryPlugin = new Plugin();
const appendRetryTextbox = {
    tagName: "DIV",
    textContent: "old text",
    focus() {},
    dispatchEvent() { return true; }
};
let appendRetryDeleted = false;
let appendRetrySelectedAll = false;
let appendRetryCommands = [];
global.window = {
    getSelection: () => ({ removeAllRanges() {}, addRange() {} })
};
global.document = {
    activeElement: appendRetryTextbox,
    createRange: () => ({ selectNodeContents() {}, collapse() {} }),
    execCommand(command, _ui, value) {
        appendRetryCommands.push(command);
        if (command === "selectAll") {
            appendRetrySelectedAll = true;
            return true;
        }
        if (command === "delete") {
            appendRetryDeleted = true;
            appendRetryTextbox.textContent = "";
            return true;
        }
        if (command === "insertText") {
            appendRetryTextbox.textContent = appendRetryDeleted || appendRetrySelectedAll ? value : `${appendRetryTextbox.textContent}${value}`;
            appendRetrySelectedAll = false;
            return true;
        }
        return false;
    }
};
const appendRetryResult = appendRetryPlugin.replaceTextboxTextSafely(appendRetryTextbox, "new text", { blurAfterReplace: false });
assert.equal(appendRetryResult.ok, true);
assert.equal(appendRetryResult.method, "primary");
assert.equal(appendRetryTextbox.textContent, "new text");
assert.deepEqual(appendRetryCommands, ["delete", "insertText"]);
global.window = savedWindowForAppendRetry;
global.document = savedDocumentForAppendRetry;

const savedWindowForCleanupCancel = global.window;
const savedDocumentForCleanupCancel = global.document;
const cleanupCancelPlugin = new Plugin();
let cleanupBlurCount = 0;
const cleanupTextbox = {
    tagName: "DIV",
    blur() { cleanupBlurCount++; },
    contains: () => false
};
const cleanupListeners = new Map();
const cleanupTimers = [];
global.window = {
    getSelection: () => ({ anchorNode: cleanupTextbox, focusNode: cleanupTextbox, removeAllRanges() {} }),
    requestAnimationFrame: callback => cleanupTimers.push(callback),
    setTimeout: callback => cleanupTimers.push(callback)
};
global.document = {
    activeElement: cleanupTextbox,
    addEventListener(type, handler) { cleanupListeners.set(type, handler); },
    removeEventListener(type) { cleanupListeners.delete(type); }
};
cleanupCancelPlugin.finishTextboxReplacement(cleanupTextbox, { blurAfterReplace: true });
assert.equal(cleanupBlurCount, 1);
cleanupListeners.get("pointerdown")();
cleanupTimers.splice(0).forEach(callback => callback());
assert.equal(cleanupBlurCount, 1);
global.window = savedWindowForCleanupCancel;
global.document = savedDocumentForCleanupCancel;

const savedWindowForCleanupStop = global.window;
const savedDocumentForCleanupStop = global.document;
const cleanupStopPlugin = new Plugin();
let cleanupStopBlurCount = 0;
const cleanupStopTextbox = {
    tagName: "DIV",
    blur() { cleanupStopBlurCount++; },
    contains: () => false
};
const cleanupStopListeners = new Map();
const cleanupStopTimers = [];
const cleanupStopRafs = [];
const cleanupStopClearedTimers = [];
const cleanupStopCanceledRafs = [];
global.window = {
    getSelection: () => ({ anchorNode: cleanupStopTextbox, focusNode: cleanupStopTextbox, removeAllRanges() {} }),
    requestAnimationFrame: callback => {
        cleanupStopRafs.push(callback);
        return `raf-${cleanupStopRafs.length}`;
    },
    cancelAnimationFrame: id => cleanupStopCanceledRafs.push(id),
    setTimeout: callback => {
        cleanupStopTimers.push(callback);
        return `timer-${cleanupStopTimers.length}`;
    },
    clearTimeout: id => cleanupStopClearedTimers.push(id),
    removeEventListener() {}
};
global.document = {
    activeElement: cleanupStopTextbox,
    addEventListener(type, handler) { cleanupStopListeners.set(type, handler); },
    removeEventListener(type) { cleanupStopListeners.delete(type); },
    getElementById: () => null,
    querySelectorAll: () => []
};
cleanupStopPlugin.finishTextboxReplacement(cleanupStopTextbox, { blurAfterReplace: true });
assert.equal(cleanupStopBlurCount, 1);
assert.equal(cleanupStopListeners.has("pointerdown"), true);
cleanupStopPlugin.stop();
assert.equal(cleanupStopClearedTimers.length, 2);
assert.equal(cleanupStopCanceledRafs.length, 1);
assert.equal(cleanupStopListeners.has("pointerdown"), false);
cleanupStopRafs.forEach(callback => callback());
cleanupStopTimers.forEach(callback => callback());
assert.equal(cleanupStopBlurCount, 1);
global.window = savedWindowForCleanupStop;
global.document = savedDocumentForCleanupStop;

const savedDocumentForPolishButton = global.document;
const polishButtonCreated = [];
global.document = { createElement: tag => createFakeElement(tag, polishButtonCreated) };
const polishButtonPlugin = new Plugin();
const polishButtonContainer = {
    appended: null,
    children: [],
    querySelector: () => null,
    appendChild(child) { this.appended = child; this.children.push(child); child.parentElement = this; return child; }
};
polishButtonPlugin.getActiveTextbox = () => ({});
polishButtonPlugin.getPolishButtonContainer = () => polishButtonContainer;
polishButtonPlugin.injectPolishButton();
const polishButtonGroup = polishButtonContainer.appended;
assert.equal(polishButtonGroup.className, "dait-input-action-group");
const polishButton = polishButtonGroup.children[0];
let polishPointerPrevented = false;
let polishPointerStopped = false;
polishButton.listeners.pointerdown({
    preventDefault() { polishPointerPrevented = true; },
    stopPropagation() { polishPointerStopped = true; }
});
assert.equal(polishPointerPrevented, true);
assert.equal(polishPointerStopped, true);
assert.equal(typeof polishButton.listeners.mousedown, "function");
const inputButtonsPlugin = new Plugin();
inputButtonsPlugin.settings.ui.publicBilingualInputButton = true;
let publicBilingualClicked = false;
const inputButtonsContainer = {
    children: [],
    querySelector(selector) {
        const className = String(selector || "").replace(/^\./, "");
        return this.children.find(child => child.className === className) || null;
    },
    appendChild(child) {
        this.children.push(child);
        child.parentElement = this;
        return child;
    }
};
inputButtonsPlugin.getActiveTextbox = () => ({});
inputButtonsPlugin.getInputButtonContainer = () => inputButtonsContainer;
inputButtonsPlugin.publicBilingualCurrentDraft = () => { publicBilingualClicked = true; };
inputButtonsPlugin.injectInputButtons();
const inputButtonGroup = inputButtonsContainer.children.find(child => fakeElementHasClass(child, "dait-input-action-group"));
assert.ok(inputButtonGroup);
assert.ok(inputButtonGroup.children.some(child => child.className === "dait-polish-button"));
assert.equal(fakeElementHasClass(inputButtonGroup, "dait-input-action-group-dual"), true);
const publicBilingualButton = inputButtonGroup.children.find(child => child.className === "dait-public-bilingual-button");
assert.ok(publicBilingualButton);
const inputActionMenuButton = inputButtonGroup.children.find(child => child.className === "dait-input-action-menu-button");
assert.ok(inputActionMenuButton);
assert.equal(inputButtonGroup.dataset.daitDensity, "roomy");
publicBilingualButton.listeners.click({
    preventDefault() {},
    stopPropagation() {}
});
assert.equal(publicBilingualClicked, true);
const adaptiveInputButtonsPlugin = new Plugin();
adaptiveInputButtonsPlugin.settings.ui.publicBilingualInputButton = true;
const adaptiveInputButtonsContainer = createFakeElement("div", []);
adaptiveInputButtonsContainer.getBoundingClientRect = () => ({ width: 420, height: 40 });
adaptiveInputButtonsPlugin.getActiveTextbox = () => ({});
adaptiveInputButtonsPlugin.getInputButtonContainer = () => adaptiveInputButtonsContainer;
adaptiveInputButtonsPlugin.injectInputButtons();
const adaptiveInputButtonGroup = adaptiveInputButtonsContainer.children.find(child => fakeElementHasClass(child, "dait-input-action-group"));
assert.equal(adaptiveInputButtonGroup.dataset.daitDensity, "minimal");
assert.ok(adaptiveInputButtonGroup.children.some(child => child.className === "dait-input-action-menu-button"));

const savedDocumentForHotkeyRecord = global.document;
const savedSetTimeoutForHotkeyRecord = global.setTimeout;
const savedClearTimeoutForHotkeyRecord = global.clearTimeout;
const hotkeyRecordPlugin = new Plugin();
const hotkeyRecordButton = createFakeElement("button", []);
const hotkeyRecordListeners = new Map();
const hotkeyRecordTimers = [];
global.document = {
    addEventListener(type, handler) { hotkeyRecordListeners.set(type, handler); },
    removeEventListener(type) { hotkeyRecordListeners.delete(type); }
};
global.setTimeout = callback => {
    hotkeyRecordTimers.push(callback);
    return hotkeyRecordTimers.length;
};
global.clearTimeout = id => { hotkeyRecordTimers[id - 1] = null; };
hotkeyRecordPlugin.recordHotkey(hotkeyRecordButton);
assert.equal(hotkeyRecordButton.dataset.recording, "true");
assert.equal(hotkeyRecordListeners.has("keydown"), false);
hotkeyRecordPlugin.isStarted = false;
hotkeyRecordPlugin.clearHotkeyRecording();
hotkeyRecordTimers.filter(Boolean).forEach(callback => callback());
assert.equal(hotkeyRecordButton.dataset.recording, undefined);
assert.equal(hotkeyRecordListeners.has("keydown"), false);
global.document = savedDocumentForHotkeyRecord;
global.setTimeout = savedSetTimeoutForHotkeyRecord;
global.clearTimeout = savedClearTimeoutForHotkeyRecord;

const quickOpenTimerPlugin = new Plugin();
const savedWindowForQuickOpenTimer = global.window;
const savedDocumentForQuickOpenTimer = global.document;
const savedSetTimeoutForQuickOpenTimer = global.setTimeout;
const savedClearTimeoutForQuickOpenTimer = global.clearTimeout;
const quickOpenCallbacks = [];
const quickOpenCleared = [];
let quickOpenCount = 0;
global.window = { removeEventListener() {} };
global.document = {
    removeEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => []
};
global.setTimeout = callback => {
    quickOpenCallbacks.push(callback);
    return quickOpenCallbacks.length;
};
global.clearTimeout = id => quickOpenCleared.push(id);
// The launcher's timer opens the quick panel (which can then open the full settings window).
quickOpenTimerPlugin.toggleQuickPopover = () => { quickOpenCount++; };
quickOpenTimerPlugin.openQuickSettingsPanel = () => { quickOpenCount++; };
quickOpenTimerPlugin.handleQuickSettingsButtonEvent({
    type: "click",
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
}, "panel");
assert.equal(quickOpenTimerPlugin.quickSettingsOpenTimer, 1);
quickOpenTimerPlugin.stop();
assert.equal(quickOpenCleared.includes(1), true);
quickOpenCallbacks.forEach(callback => callback());
assert.equal(quickOpenCount, 0);
global.window = savedWindowForQuickOpenTimer;
global.document = savedDocumentForQuickOpenTimer;
global.setTimeout = savedSetTimeoutForQuickOpenTimer;
global.clearTimeout = savedClearTimeoutForQuickOpenTimer;

const savedWindowForQuickSettings = global.window;
const quickSettingsCreated = [];
const quickSettingsBody = createFakeElement("body", quickSettingsCreated);
const quickSettingsUserPanel = createFakeElement("div", quickSettingsCreated);
const discordSettingsButton = createFakeElement("button", quickSettingsCreated);
discordSettingsButton.setAttribute("aria-label", "User Settings");
discordSettingsButton.getBoundingClientRect = () => ({ left: 280, top: 728, width: 32, height: 32 });
quickSettingsUserPanel.appendChild(discordSettingsButton);
quickSettingsBody.appendChild(quickSettingsUserPanel);
quickSettingsBody.classList.add("theme-light");
const findByClass = className => quickSettingsCreated.find(element => fakeElementHasClass(element, className)) || null;
const findAllByClass = className => quickSettingsCreated.filter(element => fakeElementHasClass(element, className));
const quickSettingsDocumentListeners = new Map();
const savedSetTimeoutForQuickSettings = global.setTimeout;
let quickSettingsButtonQueryCount = 0;
global.setTimeout = callback => {
    callback();
    return 0;
};
global.window = {
    innerWidth: 920,
    innerHeight: 760,
    getComputedStyle(node) {
        return {
            getPropertyValue(name) {
                if (node !== quickSettingsBody) return "";
                if (name === "--text-normal") return "#243040";
                if (name === "--bg-base-primary") return "#fbfcff";
                if (name === "--background-surface-high") return "#f1f3f8";
                if (name === "--modal-background") return "#ffffff";
                if (name === "--modal-footer-background") return "#eef1f6";
                if (name === "--border-subtle") return "#d8dde8";
                if (name === "--elevation-high") return "0 16px 40px rgba(24, 36, 61, 0.16)";
                if (name === "--scrollbar-thin-thumb") return "rgba(76, 86, 106, 0.3)";
                return "";
            }
        };
    }
};
global.document = {
    body: quickSettingsBody,
    documentElement: { clientWidth: 920, clientHeight: 760 },
    createElement: tag => createFakeElement(tag, quickSettingsCreated),
    querySelector(selector) {
        if (String(selector || "").startsWith(".")) return findByClass(String(selector).slice(1));
        return null;
    },
    querySelectorAll(selector) {
        if (selector === "button, [role='button']") {
            quickSettingsButtonQueryCount++;
            return [discordSettingsButton];
        }
        if (String(selector || "").startsWith(".")) return findAllByClass(String(selector).slice(1));
        return [];
    },
    addEventListener(type, handler) { quickSettingsDocumentListeners.set(type, handler); },
    removeEventListener(type) { quickSettingsDocumentListeners.delete(type); }
};
const quickSettingsPlugin = new Plugin();
const staleRailQuickSettings = createFakeElement("button", quickSettingsCreated);
staleRailQuickSettings.className = "dait-quick-settings-button dait-quick-settings-rail";
quickSettingsBody.appendChild(staleRailQuickSettings);
quickSettingsPlugin.injectQuickSettingsButtons();
const panelQuickSettings = findByClass("dait-quick-settings-panel");
assert.equal(quickSettingsButtonQueryCount, 1);
assert.equal(staleRailQuickSettings.removed, true);
assert.ok(panelQuickSettings);
assert.equal(quickSettingsUserPanel.children[0], panelQuickSettings);
assert.equal(fakeElementHasClass(panelQuickSettings, "theme-light"), true);
assert.equal(panelQuickSettings.dataset.daitDiscordTheme, "light");
quickSettingsPlugin.injectQuickSettingsButtons();
assert.equal(quickSettingsButtonQueryCount, 1);
global.document.activeElement = discordSettingsButton;
// The launcher carries a status badge and says what the translator is doing.
assert.ok(panelQuickSettings.children.some(child => fakeElementHasClass(child, "dait-launcher-status")));
assert.ok(["ok", "busy", "waiting", "needs-you", "off"].includes(panelQuickSettings.dataset.daitStatus));
assert.match(panelQuickSettings.getAttribute("aria-label"), /^AI 翻译助手：/);
panelQuickSettings.listeners.pointerup({ currentTarget: panelQuickSettings, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
// v0.4.0: the launcher opens the compact quick panel, not the full settings window.
const launcherQuickPopover = findByClass("dait-quick-popover");
assert.ok(launcherQuickPopover);
assert.equal(findByClass("dait-quick-settings-modal-root"), null);
assert.equal(launcherQuickPopover.parentElement, quickSettingsBody);
assert.equal(launcherQuickPopover.getAttribute("role"), "dialog");
// The quick panel is a plugin window: Discord's light theme gives it the light panel palette, and none of Discord's
// variables are copied onto it (the launcher itself, inside Discord's user panel, still follows Discord).
assert.equal(launcherQuickPopover.dataset.daitPanelTheme, "light");
assert.equal(launcherQuickPopover.dataset.daitDiscordTheme, undefined);
assert.equal(launcherQuickPopover.style.getPropertyValue("--text-normal"), "");
assert.equal(panelQuickSettings.getAttribute("aria-expanded"), "true");
assert.equal(fakeElementHasClass(panelQuickSettings, "dait-quick-settings-button-active"), true);
assert.equal(findByClass("dait-qp-header-open-full").focused, true);
assert.equal(quickSettingsDocumentListeners.has("keydown"), true);
assert.equal(quickSettingsDocumentListeners.has("pointerdown"), true);
// Its "open full settings" opens the full settings window from the launcher.
findByClass("dait-qp-footer-open-full").listeners.click({ preventDefault() {}, stopPropagation() {} });
assert.equal(launcherQuickPopover.removed, true);
assert.equal(quickSettingsDocumentListeners.has("pointerdown"), false);
const quickSettingsRoot = findByClass("dait-quick-settings-modal-root");
assert.ok(quickSettingsRoot);
assert.equal(panelQuickSettings.getAttribute("aria-expanded"), "true");
assert.equal(fakeElementHasClass(panelQuickSettings, "dait-quick-settings-button-active"), true);
assert.equal(quickSettingsRoot.dataset.daitQuickSettingsSource, "quick-panel");
assert.equal(quickSettingsRoot.dataset.daitPanelTheme, "light");
assert.equal(fakeElementHasClass(quickSettingsRoot, "theme-light"), false);
assert.equal(quickSettingsRoot.dataset.daitDiscordTheme, undefined);
const quickSettingsDialog = findByClass("dait-quick-settings-dialog");
assert.ok(quickSettingsDialog);
assert.equal(quickSettingsDialog.parentElement, quickSettingsRoot);
assert.equal(quickSettingsRoot.children.includes(quickSettingsDialog), true);
// The window's frame, backdrop and body inherit the palette from the root.
assert.equal(fakeElementHasClass(quickSettingsDialog, "theme-light"), false);
assert.equal(quickSettingsDialog.dataset.daitDiscordTheme, undefined);
const quickSettingsBackdrop = findByClass("dait-quick-settings-backdrop");
const quickSettingsBodyNode = findByClass("dait-quick-settings-body");
// v0.4.0: one title bar. The window has no header or footer of its own; the tabbed panel fills it and shows the
// title and the only close button.
assert.equal(findByClass("dait-quick-settings-header"), null);
assert.equal(findByClass("dait-quick-settings-footer"), null);
assert.equal(findByClass("dait-quick-settings-done"), null);
const quickSettingsTitle = findByClass("dait-settings-title");
const quickSettingsClose = findByClass("dait-settings-close");
assert.ok(quickSettingsBodyNode);
assert.ok(quickSettingsTitle);
assert.ok(quickSettingsClose);
assert.equal(findAllByClass("dait-settings-title").length, 1);
assert.equal(findAllByClass("dait-settings-close").length, 1);
assert.equal(quickSettingsBackdrop.dataset.daitDiscordTheme, undefined);
assert.equal(quickSettingsBodyNode.dataset.daitDiscordTheme, undefined);
// v0.4.0 theme follow-up: Discord's variables are no longer copied inline onto the window (mixing variables from
// differently themed parts of Discord drew dark inputs on a light window); the panel palette is complete.
assert.equal(quickSettingsRoot.style.getPropertyValue("--text-normal"), "");
assert.equal(quickSettingsDialog.style.getPropertyValue("--bg-base-primary"), "");
assert.equal(quickSettingsBodyNode.style.getPropertyValue("--modal-footer-background"), "");
assert.equal(quickSettingsBodyNode.style.getPropertyValue("--elevation-high"), "");
assert.equal(quickSettingsTitle.textContent, quickSettingsPlugin.t("settingsTitle"));
assert.equal(quickSettingsDialog.getAttribute("aria-label"), quickSettingsPlugin.t("settingsTitle"));
assert.equal(quickSettingsDialog.dataset.daitSettingsModal, undefined);
assert.equal(quickSettingsClose.focused, true);
assert.equal(quickSettingsBodyNode.parentElement, quickSettingsDialog);
assert.equal(quickSettingsDialog.children.length, 1);
assert.equal(quickSettingsDialog.children[0], quickSettingsBodyNode);
const quickSettingsSettingsPanel = findByClass("dait-settings");
assert.ok(quickSettingsSettingsPanel);
assert.equal(quickSettingsSettingsPanel.dataset.daitPanelTheme, "light");
assert.equal(quickSettingsSettingsPanel.dataset.daitDiscordTheme, undefined);
assert.equal(quickSettingsSettingsPanel.style.getPropertyValue("--background-surface-high"), "");
assert.ok(quickSettingsPlugin.quickSettingsDiagnosticLogs.some(entry => entry.action === "quick.settings.dom.attach" && entry.status === "success"));
// Settings tabs: one page shown at a time; a click or the arrow keys switch pages and save the tab (UI-SPEC Q4).
const settingsTabsPlugin = new Plugin();
const settingsTabsCreated = [];
const savedDocumentForSettingsTabsUi = global.document;
global.document = { createElement: tag => createFakeElement(tag, settingsTabsCreated) };
let settingsTabsSaves = 0;
settingsTabsPlugin.saveSettings = () => { settingsTabsSaves++; return true; };
// A v0.3.0 scroll-spy section id opens the tab that now holds it.
settingsTabsPlugin.settings.ui.settingsActiveTab = "autoTranslate";
const settingsTabsPanel = settingsTabsPlugin.getSettingsPanel({ quickSettings: true });
const settingsTabButtons = settingsTabsCreated.filter(element => element.getAttribute?.("role") === "tab");
const settingsTabPanels = settingsTabsCreated.filter(element => element.getAttribute?.("role") === "tabpanel");
const settingsTablist = settingsTabsCreated.find(element => element.getAttribute?.("role") === "tablist");
assert.deepEqual(settingsTabButtons.map(button => button.dataset.daitSettingsTab), ["overview", "translate", "compose", "display", "advanced", "data"]);
assert.deepEqual(settingsTabButtons.map(button => button.getAttribute("aria-selected")), ["false", "true", "false", "false", "false", "false"]);
assert.deepEqual(settingsTabButtons.map(button => button.getAttribute("tabindex")), ["-1", "0", "-1", "-1", "-1", "-1"]);
assert.deepEqual(settingsTabPanels.map(tabpanel => tabpanel.hidden), [true, false, true, true, true, true]);
settingsTabButtons.forEach((button, index) => {
    assert.equal(button.getAttribute("aria-controls"), settingsTabPanels[index].id);
    assert.equal(settingsTabPanels[index].getAttribute("aria-labelledby"), button.id);
});
assert.equal(settingsTablist.getAttribute("aria-orientation"), "vertical");
assert.equal(settingsTabsPlugin.getQuickSettingsPanelSectionCount({ querySelectorAll: selector => selector === "[data-dait-settings-section]" ? settingsTabPanels : [] }), 6);
settingsTabButtons[5].listeners.click();
assert.equal(settingsTabsPlugin.settings.ui.settingsActiveTab, "data");
assert.deepEqual(settingsTabPanels.map(tabpanel => tabpanel.hidden), [true, true, true, true, true, false]);
assert.equal(settingsTabsSaves, 1);
const pressSettingsTabKey = key => {
    let prevented = false;
    settingsTablist.listeners.keydown({ key, preventDefault() { prevented = true; }, stopPropagation() {} });
    return prevented;
};
assert.equal(pressSettingsTabKey("ArrowDown"), true);
assert.equal(settingsTabsPlugin.settings.ui.settingsActiveTab, "overview");
assert.equal(settingsTabButtons[0].focused, true);
pressSettingsTabKey("ArrowUp");
assert.equal(settingsTabsPlugin.settings.ui.settingsActiveTab, "data");
pressSettingsTabKey("Home");
assert.equal(settingsTabsPlugin.settings.ui.settingsActiveTab, "overview");
pressSettingsTabKey("End");
assert.equal(settingsTabsPlugin.settings.ui.settingsActiveTab, "data");
assert.equal(pressSettingsTabKey("a"), false);
assert.deepEqual(settingsTabPanels.map(tabpanel => tabpanel.hidden), [true, true, true, true, true, false]);
// Quick settings calls the old scroll-spy entry points after inserting the panel; they now show the saved tab.
settingsTabsPlugin.settings.ui.settingsActiveTab = "display";
settingsTabsPlugin.bindSettingsScrollTracking(settingsTabsPanel, null);
assert.deepEqual(settingsTabPanels.map(tabpanel => tabpanel.hidden), [true, true, true, false, true, true]);
settingsTabsPlugin.settings.ui.settingsActiveTab = "compose";
settingsTabsPlugin.syncSettingsScrollPosition(settingsTabsPanel, null);
assert.deepEqual(settingsTabPanels.map(tabpanel => tabpanel.hidden), [true, true, false, true, true, true]);
global.document = savedDocumentForSettingsTabsUi;
const settingsLazyReplacePlugin = new Plugin();
let settingsLazyPanelBuilt = false;
settingsLazyReplacePlugin.getSettingsPanel = () => {
    settingsLazyPanelBuilt = true;
    return createFakeElement("div", []);
};
assert.equal(settingsLazyReplacePlugin.replaceSettingsPanelElement(null), null);
assert.equal(settingsLazyPanelBuilt, false);
// Test mode is replaced by "Try a sentence" / "Try polishing" in the connection cards; the data tab has no test area.
const settingsTestModeLocalPlugin = new Plugin();
assert.equal(typeof settingsTestModeLocalPlugin.updateTestModeVisibility, "undefined");
assert.equal(typeof settingsTestModeLocalPlugin.createTestModeSection, "undefined");
assert.equal(typeof settingsTestModeLocalPlugin.createTryTaskRow, "function");
assert.equal(quickSettingsDocumentListeners.has("keydown"), true);
// Tab stays inside the window: the panel's close button is its first stop, the panel's last control its last.
const quickSettingsFocusables = quickSettingsPlugin.getQuickSettingsFocusableElements(quickSettingsDialog);
const quickSettingsLastFocusable = quickSettingsFocusables[quickSettingsFocusables.length - 1];
assert.equal(quickSettingsFocusables[0], quickSettingsClose);
assert.notEqual(quickSettingsLastFocusable, quickSettingsClose);
let quickSettingsTabPrevented = false;
quickSettingsClose.focused = false;
global.document.activeElement = quickSettingsLastFocusable;
quickSettingsDocumentListeners.get("keydown")({ key: "Tab", shiftKey: false, preventDefault() { quickSettingsTabPrevented = true; }, stopPropagation() {} });
assert.equal(quickSettingsTabPrevented, true);
assert.equal(quickSettingsClose.focused, true);
let quickSettingsShiftTabPrevented = false;
quickSettingsLastFocusable.focused = false;
global.document.activeElement = quickSettingsClose;
quickSettingsDocumentListeners.get("keydown")({ key: "Tab", shiftKey: true, preventDefault() { quickSettingsShiftTabPrevented = true; }, stopPropagation() {} });
assert.equal(quickSettingsShiftTabPrevented, true);
assert.equal(quickSettingsLastFocusable.focused, true);
// The panel's close button closes the window through closeSettingsWindow (the fake DOM has no closest()).
quickSettingsPlugin.closeQuickSettingsPanel(quickSettingsRoot, "button");
assert.equal(quickSettingsRoot.removed, true);
assert.equal(quickSettingsDocumentListeners.has("keydown"), false);
assert.equal(panelQuickSettings.focused, true);
assert.equal(panelQuickSettings.getAttribute("aria-expanded"), "false");
assert.equal(fakeElementHasClass(panelQuickSettings, "dait-quick-settings-button-active"), false);
const quickSettingsReuseRoot = createFakeElement("div", quickSettingsCreated);
quickSettingsReuseRoot.className = "dait-quick-settings-modal-root";
const quickSettingsReuseDialog = createFakeElement("div", quickSettingsCreated);
quickSettingsReuseDialog.className = "dait-quick-settings-dialog";
const quickSettingsReusePanel = createFakeElement("div", quickSettingsCreated);
quickSettingsReusePanel.className = "dait-settings";
const quickSettingsReuseClose = createFakeElement("button", quickSettingsCreated);
quickSettingsReuseClose.className = "dait-settings-close";
const quickSettingsReuseDone = createFakeElement("button", quickSettingsCreated);
quickSettingsReuseDone.className = "dait-small-button";
quickSettingsReusePanel.appendChild(quickSettingsReuseClose);
quickSettingsReusePanel.appendChild(quickSettingsReuseDone);
quickSettingsReuseDialog.appendChild(quickSettingsReusePanel);
quickSettingsReuseRoot.appendChild(quickSettingsReuseDialog);
quickSettingsBody.appendChild(quickSettingsReuseRoot);
quickSettingsPlugin.quickSettingsModalKeydown = null;
panelQuickSettings.focused = false;
quickSettingsPlugin.quickSettingsPreviousFocus = panelQuickSettings;
global.document.activeElement = quickSettingsReuseDone;
const reusedQuickSettingsRoot = quickSettingsPlugin.openQuickSettingsPanel("reuse-test");
assert.equal(reusedQuickSettingsRoot, quickSettingsReuseRoot);
assert.equal(quickSettingsDocumentListeners.has("keydown"), true);
assert.equal(quickSettingsReuseClose.focused, true);
global.document.activeElement = quickSettingsReuseDone;
let quickSettingsReuseTabPrevented = false;
quickSettingsDocumentListeners.get("keydown")({ key: "Tab", shiftKey: false, preventDefault() { quickSettingsReuseTabPrevented = true; }, stopPropagation() {} });
assert.equal(quickSettingsReuseTabPrevented, true);
assert.equal(quickSettingsReuseClose.focused, true);
quickSettingsPlugin.closeQuickSettingsPanel(quickSettingsReuseRoot, "reuse-test");
assert.equal(quickSettingsDocumentListeners.has("keydown"), false);
assert.equal(panelQuickSettings.focused, true);
const quickSettingsEmptyRoot = createFakeElement("div", quickSettingsCreated);
quickSettingsEmptyRoot.className = "dait-quick-settings-modal-root";
const quickSettingsEmptyDialog = createFakeElement("div", quickSettingsCreated);
quickSettingsEmptyDialog.className = "dait-quick-settings-dialog";
quickSettingsEmptyRoot.appendChild(quickSettingsEmptyDialog);
quickSettingsBody.appendChild(quickSettingsEmptyRoot);
global.document.activeElement = discordSettingsButton;
const rebuiltQuickSettingsRoot = quickSettingsPlugin.openQuickSettingsPanel("empty-rebuild-test");
assert.notEqual(rebuiltQuickSettingsRoot, quickSettingsEmptyRoot);
assert.equal(quickSettingsEmptyRoot.removed, true);
assert.ok(rebuiltQuickSettingsRoot?.querySelector?.(".dait-settings"));
quickSettingsPlugin.closeQuickSettingsPanel(rebuiltQuickSettingsRoot, "empty-rebuild-test");

const settingsSizingPlugin = new Plugin();
const sizingCreated = [];
const sizingBody = createFakeElement("body", sizingCreated);
const sizingOuter = createFakeElement("div", sizingCreated);
const sizingInner = createFakeElement("div", sizingCreated);
const sizingPanel = createFakeElement("div", sizingCreated);
sizingOuter.getBoundingClientRect = () => ({ width: 900 });
sizingInner.getBoundingClientRect = () => ({ width: 820 });
sizingBody.appendChild(sizingOuter);
sizingOuter.appendChild(sizingInner);
sizingInner.appendChild(sizingPanel);
const savedWindowForSizing = global.window;
const savedDocumentForSizing = global.document;
global.window = { innerWidth: 1100 };
global.document = { body: sizingBody, documentElement: { clientWidth: 1100 } };
settingsSizingPlugin.applySettingsModalSizing(sizingPanel);
assert.equal(sizingInner.dataset.daitSettingsModal, "true");
assert.equal(sizingOuter.dataset.daitSettingsModalRoot, "true");
// BetterDiscord's modal frame keeps Discord's colours: no theme marker and no copied Discord variables on it.
assert.equal(sizingInner.dataset.daitDiscordTheme, undefined);
assert.equal(sizingInner.dataset.daitPanelTheme, undefined);
assert.equal(sizingInner.style.getPropertyValue("--background-secondary"), "");
sizingInner.dataset.daitDiscordTheme = "dark";
sizingInner.style.setProperty("--background-secondary", "#2b2d31");
sizingPanel.isConnected = false;
sizingPanel.parentElement = null;
settingsSizingPlugin.cleanupSettingsModalSizing(sizingPanel);
assert.equal(sizingInner.dataset.daitSettingsModal, undefined);
assert.equal(sizingOuter.dataset.daitSettingsModalRoot, undefined);
assert.equal(sizingInner.dataset.daitDiscordTheme, undefined);
assert.equal(sizingInner.style.getPropertyValue("--background-secondary"), "");
global.window = savedWindowForSizing;
global.document = savedDocumentForSizing;

const sizingDestroyPlugin = new Plugin();
const sizingDestroyCreated = [];
const sizingDestroyBody = createFakeElement("body", sizingDestroyCreated);
const sizingDestroyOuter = createFakeElement("div", sizingDestroyCreated);
const sizingDestroyInner = createFakeElement("div", sizingDestroyCreated);
const sizingDestroyPanel = createFakeElement("div", sizingDestroyCreated);
sizingDestroyOuter.getBoundingClientRect = () => ({ width: 900 });
sizingDestroyInner.getBoundingClientRect = () => ({ width: 820 });
sizingDestroyBody.appendChild(sizingDestroyOuter);
sizingDestroyOuter.appendChild(sizingDestroyInner);
sizingDestroyInner.appendChild(sizingDestroyPanel);
const savedWindowForSizingDestroy = global.window;
const savedDocumentForSizingDestroy = global.document;
const savedSetTimeoutForSizingDestroy = global.setTimeout;
const savedClearTimeoutForSizingDestroy = global.clearTimeout;
const savedRequestAnimationFrameForSizingDestroy = global.requestAnimationFrame;
const savedCancelAnimationFrameForSizingDestroy = global.cancelAnimationFrame;
const savedMutationObserverForSizingDestroy = global.MutationObserver;
const sizingDestroyTimers = new Set();
let sizingDestroyCanceledRaf = 0;
let sizingDestroyObserverDisconnects = 0;
global.window = { innerWidth: 1100 };
global.document = { body: sizingDestroyBody, documentElement: { clientWidth: 1100 } };
global.setTimeout = () => {
    const id = sizingDestroyTimers.size + 1;
    sizingDestroyTimers.add(id);
    return id;
};
global.clearTimeout = id => sizingDestroyTimers.delete(id);
global.requestAnimationFrame = () => 99;
global.cancelAnimationFrame = id => { if (id === 99) sizingDestroyCanceledRaf++; };
global.MutationObserver = class {
    constructor(callback) { this.callback = callback; }
    observe() {}
    disconnect() { sizingDestroyObserverDisconnects++; }
};
sizingDestroyPlugin.scheduleSettingsModalSizing(sizingDestroyPanel);
assert.equal(sizingDestroyInner.dataset.daitSettingsModal, "true");
assert.equal(sizingDestroyTimers.size, 2);
assert.ok(sizingDestroyPanel.__daitSettingsModalCleanupObserver);
sizingDestroyPlugin.destroySettingsModalSizing(sizingDestroyPanel);
assert.equal(sizingDestroyTimers.size, 0);
assert.equal(sizingDestroyCanceledRaf, 1);
assert.equal(sizingDestroyObserverDisconnects, 1);
assert.equal(sizingDestroyInner.dataset.daitSettingsModal, undefined);
assert.equal(sizingDestroyOuter.dataset.daitSettingsModalRoot, undefined);

const sizingObserverPlugin = new Plugin();
const sizingObserverOuter = createFakeElement("div", sizingDestroyCreated);
const sizingObserverInner = createFakeElement("div", sizingDestroyCreated);
const sizingObserverPanel = createFakeElement("div", sizingDestroyCreated);
sizingObserverOuter.getBoundingClientRect = () => ({ width: 900 });
sizingObserverInner.getBoundingClientRect = () => ({ width: 820 });
sizingDestroyBody.appendChild(sizingObserverOuter);
sizingObserverOuter.appendChild(sizingObserverInner);
sizingObserverInner.appendChild(sizingObserverPanel);
sizingObserverPlugin.scheduleSettingsModalSizing(sizingObserverPanel);
assert.equal(sizingObserverInner.dataset.daitSettingsModal, "true");
assert.ok(sizingDestroyTimers.size > 0);
sizingObserverPanel.isConnected = false;
sizingObserverPanel.__daitSettingsModalCleanupObserver.callback();
assert.equal(sizingDestroyTimers.size, 0);
assert.equal(sizingObserverInner.dataset.daitSettingsModal, undefined);
assert.equal(sizingObserverOuter.dataset.daitSettingsModalRoot, undefined);
global.window = savedWindowForSizingDestroy;
global.document = savedDocumentForSizingDestroy;
global.setTimeout = savedSetTimeoutForSizingDestroy;
global.clearTimeout = savedClearTimeoutForSizingDestroy;
global.requestAnimationFrame = savedRequestAnimationFrameForSizingDestroy;
global.cancelAnimationFrame = savedCancelAnimationFrameForSizingDestroy;
global.MutationObserver = savedMutationObserverForSizingDestroy;

const quickSettingsFailurePlugin = new Plugin();
const quickSettingsFailureToasts = [];
quickSettingsFailurePlugin.showToast = (text, type) => quickSettingsFailureToasts.push({ text, type });
quickSettingsFailurePlugin.getSettingsPanel = () => { throw new Error("panel boom"); };
const savedWarnForQuickSettingsFailure = console.warn;
const quickSettingsFailureWarnings = [];
console.warn = (...args) => quickSettingsFailureWarnings.push(args);
let quickSettingsFailureRoot = null;
try {
    quickSettingsFailureRoot = quickSettingsFailurePlugin.openQuickSettingsPanel("failure-test");
}
finally {
    console.warn = savedWarnForQuickSettingsFailure;
}
assert.ok(quickSettingsFailureRoot);
// Without the panel (and its title bar) the error card carries the window's close button.
const quickSettingsFailureCard = findByClass("dait-quick-settings-error");
assert.ok(quickSettingsFailureCard);
assert.equal(findByClass("dait-quick-settings-footer"), null);
const quickSettingsFailureDone = findByClass("dait-quick-settings-done");
assert.ok(quickSettingsFailureDone);
assert.equal(quickSettingsFailureDone.parentElement, quickSettingsFailureCard);
assert.equal(quickSettingsFailureDone.focused, true);
assert.ok(quickSettingsFailurePlugin.quickSettingsDiagnosticLogs.some(entry => entry.action === "quick.settings.panel.build" && entry.status === "error"));
assert.equal(quickSettingsFailureWarnings.length, 1);
assert.equal(quickSettingsFailureToasts.some(toast => toast.type === "error"), true);
quickSettingsFailureDone.listeners.click({ preventDefault() {}, stopPropagation() {} });
assert.equal(quickSettingsFailureRoot.removed, true);
quickSettingsFailurePlugin.closeQuickSettingsPanel();
quickSettingsPlugin.isStarted = false;
quickSettingsPlugin.setSetting("ui.showQuickSettingsRailButton", false);
quickSettingsPlugin.setSetting("ui.showQuickSettingsPanelButton", false);
assert.equal(panelQuickSettings.removed, true);
const quickSettingsDisableTimerPlugin = new Plugin();
const savedSetTimeoutForQuickDisable = global.setTimeout;
const savedClearTimeoutForQuickDisable = global.clearTimeout;
const savedDocumentForQuickDisable = global.document;
const quickDisableTimers = [];
const quickDisableCleared = [];
global.setTimeout = callback => {
    const id = quickDisableTimers.length + 1;
    quickDisableTimers.push({ id, callback });
    return id;
};
global.clearTimeout = id => quickDisableCleared.push(id);
global.document = { body: {}, querySelectorAll: () => [] };
quickSettingsDisableTimerPlugin.scheduleQuickSettingsButtonRetry();
quickSettingsDisableTimerPlugin.handleQuickSettingsButtonEvent({
    type: "click",
    preventDefault() {},
    stopPropagation() {},
    stopImmediatePropagation() {}
}, "panel");
assert.equal(quickSettingsDisableTimerPlugin.quickSettingsRetryTimer, 1);
assert.equal(quickSettingsDisableTimerPlugin.quickSettingsOpenTimer, 2);
let quickDisableInjected = false;
let quickDisableOpened = false;
quickSettingsDisableTimerPlugin.injectQuickSettingsPanelButton = () => { quickDisableInjected = true; };
quickSettingsDisableTimerPlugin.toggleQuickPopover = () => { quickDisableOpened = true; };
quickSettingsDisableTimerPlugin.openQuickSettingsPanel = () => { quickDisableOpened = true; };
quickSettingsDisableTimerPlugin.settings.ui.showQuickSettingsPanelButton = false;
quickSettingsDisableTimerPlugin.injectQuickSettingsButtons();
assert.equal(quickSettingsDisableTimerPlugin.quickSettingsRetryTimer, null);
assert.equal(quickSettingsDisableTimerPlugin.quickSettingsOpenTimer, null);
assert.deepEqual(quickDisableCleared, [1, 2]);
quickDisableTimers.forEach(timer => timer.callback());
assert.equal(quickDisableInjected, false);
assert.equal(quickDisableOpened, false);
global.setTimeout = savedSetTimeoutForQuickDisable;
global.clearTimeout = savedClearTimeoutForQuickDisable;
global.document = savedDocumentForQuickDisable;
const quickSettingsSavedDocumentForMissingTarget = global.document;
const quickSettingsSavedDateNowForMissingTarget = Date.now;
let quickSettingsMissingTargetQueries = 0;
Date.now = () => 500000;
global.document = {
    querySelectorAll(selector) {
        if (selector === "button, [role='button']") quickSettingsMissingTargetQueries++;
        return [];
    }
};
const quickSettingsMissingTargetPlugin = new Plugin();
assert.equal(quickSettingsMissingTargetPlugin.findDiscordUserSettingsButton(), null);
assert.equal(quickSettingsMissingTargetPlugin.findDiscordUserSettingsButton(), null);
assert.equal(quickSettingsMissingTargetQueries, 1);
assert.equal(quickSettingsMissingTargetPlugin.findDiscordUserSettingsButton({ force: true }), null);
assert.equal(quickSettingsMissingTargetQueries, 2);
let quickSettingsSurfaceOpenQueries = 0;
global.document = {
    querySelectorAll(selector) {
        if (selector === "button, [role='button']") quickSettingsSurfaceOpenQueries++;
        return [];
    }
};
const quickSettingsSurfaceOpenPlugin = new Plugin();
quickSettingsSurfaceOpenPlugin.isDiscordSettingsSurfaceOpen = () => true;
assert.equal(quickSettingsSurfaceOpenPlugin.findDiscordUserSettingsButton({ force: true }), null);
assert.equal(quickSettingsSurfaceOpenQueries, 0);
const quickSettingsAriaCreated = [];
const quickSettingsAriaLabel = createFakeElement("span", quickSettingsAriaCreated);
quickSettingsAriaLabel.textContent = "User Settings";
const quickSettingsAriaButton = createFakeElement("button", quickSettingsAriaCreated);
quickSettingsAriaButton.setAttribute("aria-labelledby", "qs-user-settings-label");
quickSettingsAriaButton.getBoundingClientRect = () => ({ left: 760, top: 80, width: 32, height: 32 });
global.document = {
    documentElement: { clientWidth: 1000, clientHeight: 800 },
    getElementById: id => id === "qs-user-settings-label" ? quickSettingsAriaLabel : null,
    querySelectorAll(selector) {
        if (selector === "button, [role='button']") return [quickSettingsAriaButton];
        return [];
    }
};
const quickSettingsAriaPlugin = new Plugin();
assert.equal(quickSettingsAriaPlugin.findDiscordUserSettingsButton({ force: true }), quickSettingsAriaButton);
const quickSettingsNestedPlugin = new Plugin();
const quickSettingsNestedCreated = [];
const quickSettingsNestedGroup = createFakeElement("div", quickSettingsNestedCreated);
const quickSettingsNestedWrapper = createFakeElement("div", quickSettingsNestedCreated);
const quickSettingsNestedButton = createFakeElement("button", quickSettingsNestedCreated);
const quickSettingsNestedMic = createFakeElement("button", quickSettingsNestedCreated);
const quickSettingsNestedHeadset = createFakeElement("button", quickSettingsNestedCreated);
quickSettingsNestedButton.setAttribute("aria-label", "User Settings");
quickSettingsNestedGroup.appendChild(quickSettingsNestedMic);
quickSettingsNestedGroup.appendChild(quickSettingsNestedHeadset);
quickSettingsNestedGroup.appendChild(quickSettingsNestedWrapper);
quickSettingsNestedWrapper.appendChild(quickSettingsNestedButton);
quickSettingsNestedGroup.querySelectorAll = selector => selector === "button, [role='button']"
    ? [quickSettingsNestedMic, quickSettingsNestedHeadset, quickSettingsNestedButton]
    : [];
assert.equal(quickSettingsNestedPlugin.getDiscordUserSettingsButtonContainer(quickSettingsNestedButton), quickSettingsNestedGroup);
assert.equal(quickSettingsNestedPlugin.getQuickSettingsInsertReference(quickSettingsNestedGroup, quickSettingsNestedButton), quickSettingsNestedWrapper);
Date.now = quickSettingsSavedDateNowForMissingTarget;
global.document = quickSettingsSavedDocumentForMissingTarget;
global.setTimeout = savedSetTimeoutForQuickSettings;
global.window = savedWindowForQuickSettings;
global.document = savedDocumentForPolishButton;

const quickVerifyPlugin = new Plugin();
const quickVerifyCreated = [];
const quickVerifyBody = createFakeElement("body", quickVerifyCreated);
const quickVerifyRoot = createFakeElement("div", quickVerifyCreated);
quickVerifyRoot.className = "dait-quick-settings-modal-root";
const quickVerifyDialog = createFakeElement("div", quickVerifyCreated);
quickVerifyDialog.className = "dait-quick-settings-dialog";
quickVerifyRoot.appendChild(quickVerifyDialog);
quickVerifyBody.appendChild(quickVerifyRoot);
const savedWindowForQuickVerify = global.window;
const savedDocumentForQuickVerify = global.document;
const savedClearTimeoutForQuickVerify = global.clearTimeout;
let quickVerifyRafCallback = null;
let quickVerifyCanceledRaf = 0;
let quickVerifyRemovedKeydown = 0;
global.window = {
    requestAnimationFrame(callback) {
        quickVerifyRafCallback = callback;
        return 77;
    },
    cancelAnimationFrame(id) {
        if (id === 77) quickVerifyCanceledRaf++;
    }
};
global.document = {
    body: quickVerifyBody,
    querySelectorAll(selector) {
        if (selector === ".dait-quick-settings-modal-root") return findFakeElementsByClass(quickVerifyBody, "dait-quick-settings-modal-root");
        return [];
    },
    removeEventListener(type) {
        if (type === "keydown") quickVerifyRemovedKeydown++;
    }
};
quickVerifyPlugin.quickSettingsModalRoot = quickVerifyRoot;
quickVerifyPlugin.scheduleQuickSettingsModalVerify(quickVerifyRoot, quickVerifyDialog);
assert.equal(quickVerifyPlugin.quickSettingsVerifyRaf, 77);
quickVerifyPlugin.closeQuickSettingsPanel(quickVerifyRoot, "verify-cancel-test");
assert.equal(quickVerifyCanceledRaf, 1);
assert.equal(quickVerifyPlugin.quickSettingsVerifyRaf, null);
const quickVerifyCurrentRoot = createFakeElement("div", quickVerifyCreated);
quickVerifyCurrentRoot.className = "dait-quick-settings-modal-root";
quickVerifyPlugin.quickSettingsModalRoot = quickVerifyCurrentRoot;
quickVerifyRafCallback();
assert.equal(quickVerifyCurrentRoot.removed, undefined);
const quickVerifyOrphanA = createFakeElement("div", quickVerifyCreated);
quickVerifyOrphanA.className = "dait-quick-settings-modal-root";
const quickVerifyOrphanB = createFakeElement("div", quickVerifyCreated);
quickVerifyOrphanB.className = "dait-quick-settings-modal-root";
quickVerifyBody.appendChild(quickVerifyOrphanA);
quickVerifyBody.appendChild(quickVerifyOrphanB);
quickVerifyPlugin.closeQuickSettingsPanel(null, "orphan-sweep-test");
assert.equal(quickVerifyOrphanA.removed, true);
assert.equal(quickVerifyOrphanB.removed, true);
assert.ok(quickVerifyRemovedKeydown >= 0);
global.window = savedWindowForQuickVerify;
global.document = savedDocumentForQuickVerify;
global.clearTimeout = savedClearTimeoutForQuickVerify;

const savedDocumentForThemeProbe = global.document;
const themeProbeCreated = [];
const themeProbeBody = createFakeElement("body", themeProbeCreated);
const themeProbeHtml = createFakeElement("html", themeProbeCreated);
const stalePluginThemeRoot = createFakeElement("div", themeProbeCreated);
stalePluginThemeRoot.className = "dait-quick-settings-modal-root theme-light";
const discordAppMount = createFakeElement("div", themeProbeCreated);
discordAppMount.className = "theme-midnight";
global.document = {
    body: themeProbeBody,
    documentElement: themeProbeHtml,
    querySelector(selector) {
        if (selector === "#app-mount") return discordAppMount;
        return null;
    },
    querySelectorAll(selector) {
        if (selector === "[class*='theme-']") return [stalePluginThemeRoot, discordAppMount];
        if (String(selector || "").includes(".dait-")) {
            const classNames = String(selector).split(",")
                .map(part => part.trim().replace(/^\./, ""))
                .filter(Boolean);
            return themeProbeCreated.filter(element => {
                const classMatch = classNames.some(className => fakeElementHasClass(element, className));
                const modalMatch = String(selector).includes("[data-dait-settings-modal='true']") && element.dataset?.daitSettingsModal !== undefined;
                const rootMatch = String(selector).includes("[data-dait-settings-modal-root='true']") && element.dataset?.daitSettingsModalRoot !== undefined;
                return classMatch || modalMatch || rootMatch;
            });
        }
        return [];
    }
};
const themeProbePlugin = new Plugin();
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
const themeProbeAnchor = createFakeElement("div", themeProbeCreated);
themeProbeAnchor.className = "theme-light";
assert.equal(themeProbePlugin.getDiscordThemeClass(themeProbeAnchor), "theme-midnight");
const themeProbeTarget = createFakeElement("button", themeProbeCreated);
themeProbeTarget.classList.add("theme-light");
assert.equal(themeProbePlugin.syncDiscordThemeClasses(themeProbeTarget), "theme-midnight");
assert.equal(fakeElementHasClass(themeProbeTarget, "theme-light"), false);
assert.equal(fakeElementHasClass(themeProbeTarget, "theme-midnight"), true);
assert.equal(themeProbeTarget.dataset.daitDiscordTheme, "midnight");
themeProbeBody.className = "theme-light";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
discordAppMount.className = "";
discordAppMount.dataset.theme = "light";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-light");
delete discordAppMount.dataset.theme;
discordAppMount.setAttribute("theme", "darker");
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-darker");
delete discordAppMount.attributes.theme;
discordAppMount.className = "theme-dark";
discordAppMount.dataset.theme = "midnight";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
discordAppMount.dataset.theme = "darker";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-darker");
delete discordAppMount.dataset.theme;
discordAppMount.className = "theme-ash";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-darker");
discordAppMount.className = "theme-onyx";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
discordAppMount.className = "";
discordAppMount.dataset.theme = "ash";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-darker");
discordAppMount.dataset.theme = "onyx";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
delete discordAppMount.dataset.theme;
discordAppMount.className = "theme-dark";
themeProbeBody.dataset.theme = "midnight";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
delete themeProbeBody.dataset.theme;
themeProbeBody.className = "";
discordAppMount.className = "theme-dark theme-darker";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-darker");
discordAppMount.className = "theme-dark theme-midnight";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
themeProbeBody.className = "theme-dark";
discordAppMount.className = "theme-darker";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-darker");
discordAppMount.className = "theme-midnight";
assert.equal(themeProbePlugin.getDiscordThemeClass(), "theme-midnight");
discordAppMount.className = "theme-midnight";
themeProbeBody.className = "theme-light";
const themeRefreshButton = createFakeElement("button", themeProbeCreated);
themeRefreshButton.className = "dait-quick-settings-button";
const themeRefreshSettings = createFakeElement("div", themeProbeCreated);
themeRefreshSettings.className = "dait-settings";
const themeRefreshModal = createFakeElement("div", themeProbeCreated);
themeRefreshModal.className = "dait-quick-settings-modal-root";
const themeRefreshPanel = createFakeElement("div", themeProbeCreated);
themeRefreshPanel.className = "dait-polish-result-panel";
const themeRefreshRestore = createFakeElement("button", themeProbeCreated);
themeRefreshRestore.className = "dait-polish-restore-control";
const themeRefreshPolish = createFakeElement("button", themeProbeCreated);
themeRefreshPolish.className = "dait-polish-button";
const themeRefreshBilingual = createFakeElement("button", themeProbeCreated);
themeRefreshBilingual.className = "dait-public-bilingual-button";
const themeRefreshMessage = createFakeElement("button", themeProbeCreated);
themeRefreshMessage.className = "dait-message-button";
const themeRefreshWrapper = createFakeElement("div", themeProbeCreated);
themeRefreshWrapper.className = "theme-light";
themeRefreshWrapper.dataset.daitSettingsModal = "true";
const themeRefreshWrapperRoot = createFakeElement("div", themeProbeCreated);
themeRefreshWrapperRoot.className = "theme-light";
themeRefreshWrapperRoot.dataset.daitSettingsModalRoot = "true";
themeProbeBody.appendChild(themeRefreshButton);
themeProbeBody.appendChild(themeRefreshSettings);
themeProbeBody.appendChild(themeRefreshModal);
themeProbeBody.appendChild(themeRefreshPanel);
themeProbeBody.appendChild(themeRefreshRestore);
themeProbeBody.appendChild(themeRefreshPolish);
themeProbeBody.appendChild(themeRefreshBilingual);
themeProbeBody.appendChild(themeRefreshMessage);
themeProbeBody.appendChild(themeRefreshWrapper);
themeProbeBody.appendChild(themeRefreshWrapperRoot);
themeProbePlugin.refreshDiscordThemeClasses();
// The buttons that sit inside Discord's UI copy Discord's theme (here #app-mount's midnight)...
assert.equal(fakeElementHasClass(themeRefreshButton, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshRestore, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshPolish, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshBilingual, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshMessage, "theme-midnight"), true);
// ...while the plugin's own windows take the panel palette of the page theme (<body class="theme-light">), with no
// Discord theme classes or markers, and BetterDiscord's modal frame is left to Discord.
[themeRefreshSettings, themeRefreshModal, themeRefreshPanel].forEach(node => {
    assert.equal(node.dataset.daitPanelTheme, "light");
    assert.equal(fakeElementHasClass(node, "theme-midnight"), false);
    assert.equal(node.dataset.daitDiscordTheme, undefined);
});
assert.equal(fakeElementHasClass(themeRefreshWrapper, "theme-midnight"), false);
assert.equal(fakeElementHasClass(themeRefreshWrapperRoot, "theme-midnight"), false);
assert.equal(themeRefreshWrapper.dataset.daitDiscordTheme, undefined);
assert.equal(themeRefreshWrapperRoot.dataset.daitPanelTheme, undefined);
themeProbeBody.className = "theme-midnight";
assert.equal(themeProbePlugin.hasDiscordThemeMutation([{ type: "attributes", attributeName: "class", target: themeProbeBody }]), true);
discordAppMount.className = "";
discordAppMount.dataset.theme = "light";
assert.equal(themeProbePlugin.hasDiscordThemeMutation([{ type: "attributes", attributeName: "data-theme", target: discordAppMount }]), true);
assert.equal(themeProbePlugin.hasDiscordThemeMutation([{ type: "attributes", attributeName: "theme", target: discordAppMount }]), true);
assert.equal(themeProbePlugin.hasDiscordThemeMutation([{ type: "attributes", attributeName: "style", target: discordAppMount }]), true);
discordAppMount.className = "theme-midnight";
delete discordAppMount.dataset.theme;
themeProbePlugin.refreshDiscordThemeClasses();
assert.equal(fakeElementHasClass(themeRefreshButton, "theme-light"), false);
assert.equal(fakeElementHasClass(themeRefreshButton, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshRestore, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshPolish, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshBilingual, "theme-midnight"), true);
assert.equal(fakeElementHasClass(themeRefreshMessage, "theme-midnight"), true);
// Discord's page theme is midnight now: the open plugin windows switch to the dark palette in place.
[themeRefreshSettings, themeRefreshModal, themeRefreshPanel].forEach(node => {
    assert.equal(node.dataset.daitPanelTheme, "dark");
    assert.equal(fakeElementHasClass(node, "theme-midnight"), false);
});

const quickThemeRoot = createFakeElement("div", themeProbeCreated);
quickThemeRoot.className = "dait-quick-settings-modal-root";
quickThemeRoot.classList.add("theme-light");
const quickThemeBackdrop = createFakeElement("div", themeProbeCreated);
quickThemeBackdrop.className = "dait-quick-settings-backdrop";
const quickThemeDialog = createFakeElement("div", themeProbeCreated);
quickThemeDialog.className = "dait-quick-settings-dialog";
// The window: a body holding the settings panel (or, when the panel cannot be built, the error card with its button).
const quickThemeBody = createFakeElement("div", themeProbeCreated);
quickThemeBody.className = "dait-quick-settings-body";
const quickThemeError = createFakeElement("div", themeProbeCreated);
quickThemeError.className = "dait-quick-settings-error";
const quickThemeDone = createFakeElement("button", themeProbeCreated);
quickThemeDone.className = "dait-quick-settings-done";
const quickThemeSettings = createFakeElement("div", themeProbeCreated);
quickThemeSettings.className = "dait-settings";
quickThemeError.appendChild(quickThemeDone);
quickThemeBody.appendChild(quickThemeSettings);
quickThemeBody.appendChild(quickThemeError);
quickThemeDialog.appendChild(quickThemeBody);
quickThemeRoot.appendChild(quickThemeBackdrop);
quickThemeRoot.appendChild(quickThemeDialog);
themeProbeBody.appendChild(quickThemeRoot);
const quickThemeNodes = [
    quickThemeRoot,
    quickThemeBackdrop,
    quickThemeDialog,
    quickThemeBody,
    quickThemeError,
    quickThemeDone,
    quickThemeSettings
];
// Every Discord theme maps to one of the two panel palettes. The window root and the panel inside it carry it; the
// frame's other nodes inherit it and get no Discord theme class of their own.
quickThemeRoot.classList.remove("theme-light");
for (const [themeClass, panelTheme] of [["theme-light", "light"], ["theme-dark", "dark"], ["theme-darker", "dark"], ["theme-midnight", "dark"]]) {
    themeProbeBody.className = themeClass;
    discordAppMount.className = themeClass;
    assert.equal(themeProbePlugin.syncQuickSettingsThemeTree(quickThemeRoot), panelTheme);
    assert.equal(quickThemeRoot.dataset.daitPanelTheme, panelTheme);
    assert.equal(quickThemeSettings.dataset.daitPanelTheme, panelTheme);
    for (const node of quickThemeNodes) {
        assert.equal(node.dataset.daitDiscordTheme, undefined);
        for (const otherThemeClass of ["theme-light", "theme-dark", "theme-darker", "theme-midnight"]) {
            assert.equal(fakeElementHasClass(node, otherThemeClass), false);
        }
    }
}
assert.equal(themeProbePlugin.isPluginThemeCandidate(quickThemeBody), true);
assert.equal(themeProbePlugin.isPluginThemeCandidate(quickThemeError), true);
assert.equal(themeProbePlugin.isPluginThemeCandidate(quickThemeDone), true);
global.document = savedDocumentForThemeProbe;

const savedWindowForThemeVars = global.window;
const savedDocumentForThemeVars = global.document;
const themeVarsCreated = [];
const themeVarsBody = createFakeElement("body", themeVarsCreated);
const themeVarsHtml = createFakeElement("html", themeVarsCreated);
const themeVarsAppMount = createFakeElement("div", themeVarsCreated);
themeVarsAppMount.id = "app-mount";
themeVarsAppMount.className = "theme-darker";
themeVarsBody.className = "theme-light";
global.window = {
    getComputedStyle(node) {
        return {
            getPropertyValue(name) {
                if (node === themeVarsAppMount) return "";
                if (node === themeVarsBody) {
                    if (name === "--text-normal") return "#body-text";
                    if (name === "--background-surface-high") return "#body-surface";
                    if (name === "--modal-background") return "#body-modal";
                }
                if (node === themeVarsHtml && name === "--scrollbar-thin-thumb") return "rgba(1, 2, 3, 0.4)";
                return "";
            }
        };
    }
};
global.document = {
    body: themeVarsBody,
    documentElement: themeVarsHtml,
    querySelector(selector) {
        if (selector === "#app-mount") return themeVarsAppMount;
        return null;
    },
    querySelectorAll() {
        return [themeVarsAppMount, themeVarsBody];
    }
};
const themeVarsPlugin = new Plugin();
const themeVarsRoot = createFakeElement("div", themeVarsCreated);
themeVarsRoot.className = "dait-quick-settings-modal-root";
// Mixed sources (a light page, a darker #app-mount, variables spread over several nodes) used to be copied onto the
// window one variable at a time. Now the page theme picks one complete palette and nothing is copied.
themeVarsPlugin.syncQuickSettingsThemeTree(themeVarsRoot);
assert.equal(themeVarsRoot.dataset.daitPanelTheme, "light");
assert.equal(fakeElementHasClass(themeVarsRoot, "theme-darker"), false);
assert.equal(themeVarsRoot.dataset.daitDiscordTheme, undefined);
assert.equal(themeVarsRoot.style.getPropertyValue("--text-normal"), "");
assert.equal(themeVarsRoot.style.getPropertyValue("--background-surface-high"), "");
assert.equal(themeVarsRoot.style.getPropertyValue("--modal-background"), "");
assert.equal(themeVarsRoot.style.getPropertyValue("--scrollbar-thin-thumb"), "");
// The buttons inside Discord's UI still copy Discord's variables.
const themeVarsButton = createFakeElement("button", themeVarsCreated);
themeVarsButton.className = "dait-message-button";
themeVarsPlugin.syncDiscordThemeClasses(themeVarsButton);
assert.equal(themeVarsButton.style.getPropertyValue("--text-normal"), "#body-text");
global.window = savedWindowForThemeVars;
global.document = savedDocumentForThemeVars;

const savedWindowForPolishPanel = global.window;
const savedDocumentForPolishPanel = global.document;
const polishPanelCreated = [];
const polishPanelBody = {
    className: "theme-light",
    children: [],
    appendChild(child) { this.children.push(child); child.parentElement = this; return child; }
};
let polishPanelRemovedEvents = 0;
const polishPanelWindowListeners = new Map();
global.window = {
    innerWidth: 900,
    innerHeight: 700,
    getSelection: () => ({ anchorNode: polishPanelTextbox, focusNode: polishPanelTextbox, removeAllRanges() {} }),
    addEventListener(type, handler) { polishPanelWindowListeners.set(type, handler); },
    removeEventListener(type) { polishPanelWindowListeners.delete(type); polishPanelRemovedEvents++; }
};
const polishPanelDocumentListeners = new Map();
global.document = {
    body: polishPanelBody,
    documentElement: { clientWidth: 900, clientHeight: 700 },
    activeElement: null,
    createElement: tag => createFakeElement(tag, polishPanelCreated),
    addEventListener(type, handler) { polishPanelDocumentListeners.set(type, handler); },
    removeEventListener(type) { polishPanelDocumentListeners.delete(type); }
};
const polishPanelPlugin = new Plugin();
let polishPanelTextboxBlurred = false;
const polishPanelTextbox = {
    getBoundingClientRect: () => ({ left: 120, top: 500 }),
    contains: () => false,
    blur() { polishPanelTextboxBlurred = true; }
};
global.document.activeElement = polishPanelTextbox;
polishPanelPlugin.showPolishResultPanel(polishPanelTextbox, "polished text");
const polishPanel = polishPanelBody.children[0];
const polishPanelOutput = polishPanelCreated.find(element => element.className === "dait-polish-result-output");
assert.equal(polishPanel.className, "dait-polish-result-panel");
// A plugin window: the panel palette of the page theme, re-checked when the panel is placed again.
assert.equal(polishPanel.dataset.daitPanelTheme, "light");
assert.equal(polishPanel.dataset.daitDiscordTheme, undefined);
polishPanelBody.className = "theme-midnight";
polishPanelWindowListeners.get("resize")();
assert.equal(polishPanel.dataset.daitPanelTheme, "dark");
assert.equal(fakeElementHasClass(polishPanel, "theme-midnight"), false);
assert.equal(polishPanelOutput.tagName, "DIV");
assert.equal(polishPanelOutput.textContent, "polished text");
assert.equal(polishPanelTextboxBlurred, false);
assert.equal(polishPanelOutput.tabIndex, 0);
assert.equal(polishPanelOutput.focused, undefined);
assert.equal(polishPanelOutput.selected, undefined);
const polishPanelActionButtons = polishPanelCreated.filter(element => String(element.className || "").split(/\s+/).includes("dait-polish-result-action"));
// "Insert into input" (a held result can still be applied) and "Copy".
assert.deepEqual(polishPanelActionButtons.map(element => element.textContent), [polishPanelPlugin.t("polishResultReplace"), polishPanelPlugin.t("polishResultCopy")]);
assert.equal(typeof polishPanelDocumentListeners.get("pointerdown"), "function");
polishPanelDocumentListeners.get("pointerdown")({ target: {} });
assert.equal(polishPanel.removed, true);
polishPanelPlugin.showPolishResultPanel(polishPanelTextbox, "polished text");
const polishPanelEsc = polishPanelBody.children[0];
polishPanelDocumentListeners.get("keydown")({ key: "Escape", preventDefault() { this.prevented = true; } });
assert.equal(polishPanelEsc.removed, true);
polishPanelPlugin.removePolishResultPanel();
polishPanelPlugin.showRestoreOriginalControl(polishPanelTextbox, { originalRawText: "original text" });
const polishRestoreControl = polishPanelBody.children.find(element => element.className === "dait-polish-restore-control");
assert.ok(polishRestoreControl);
assert.equal(fakeElementHasClass(polishRestoreControl, "theme-midnight"), true);
assert.equal(polishRestoreControl.dataset.daitDiscordTheme, "midnight");
polishPanelBody.className = "theme-light";
polishPanelWindowListeners.get("resize")();
assert.equal(fakeElementHasClass(polishRestoreControl, "theme-midnight"), false);
assert.equal(fakeElementHasClass(polishRestoreControl, "theme-light"), true);
assert.equal(polishRestoreControl.dataset.daitDiscordTheme, "light");
polishPanelPlugin.removePolishRestoreControl();
assert.equal(polishRestoreControl.removed, true);
const restoreGroupPlugin = new Plugin();
const restoreGroupContainer = createFakeElement("div", polishPanelCreated);
restoreGroupContainer.getBoundingClientRect = () => ({ width: 820, height: 40 });
const restoreGroupTextbox = {
    textContent: "polished text",
    getBoundingClientRect: () => ({ left: 120, top: 500 }),
    contains: () => false
};
restoreGroupPlugin.getActiveTextbox = () => restoreGroupTextbox;
restoreGroupPlugin.getPolishButtonContainer = () => restoreGroupContainer;
restoreGroupPlugin.showRestoreOriginalControl(restoreGroupTextbox, {
    originalRawText: "original text",
    lastWrittenRawText: "polished text"
});
const restoreGroup = restoreGroupContainer.children.find(element => fakeElementHasClass(element, "dait-input-action-group"));
assert.ok(restoreGroup);
assert.ok(restoreGroup.children.some(element => element.className === "dait-polish-restore-button"));
assert.equal(polishPanelBody.children.some(element => element.className === "dait-polish-restore-control" && !element.removed), false);
assert.ok(polishPanelRemovedEvents >= 1);
global.window = savedWindowForPolishPanel;
global.document = savedDocumentForPolishPanel;

assert.equal(plugin.settings.ui.language, "zh-CN");
assert.equal(plugin.t("polishButton"), "润色");
assert.equal(plugin.getLanguageLabel({ zh: "汉语", en: "Chinese" }), "汉语 - Chinese");
plugin.settings.ui.language = "en";
assert.equal(plugin.t("polishButton"), "Polish");
assert.equal(plugin.getLanguageLabel({ zh: "汉语", en: "Chinese" }), "Chinese");
plugin.settings.ui.language = "zh-CN";
assert.equal(plugin.t("diagnosticLogs"), "诊断日志");

assert.equal(plugin.settings.polish.model, "deepseek-v4-flash");
assert.equal(plugin.settings.translation.model, "deepseek-v4-flash");
assert.equal(plugin.settings.polish.afterAction, "replace");
assert.equal(plugin.settings.polish.repolishSource, "original");
assert.equal(plugin.getPolishAfterAction(), "replace");
assert.equal(plugin.getPolishRepolishSource(), "original");
assert.equal(plugin.settings.polish.sourceLanguage, "auto");
assert.equal(plugin.settings.translation.sourceLanguage, "auto");
assert.equal(plugin.settings.polish.targetLanguage, "英语");
assert.equal(plugin.settings.translation.targetLanguage, "汉语");
assert.equal(plugin.settings.polish.enableThinking, false);
assert.equal(plugin.settings.translation.enableThinking, false);
assert.deepEqual(plugin.getApiStatus("polish"), { state: "untested", message: "" });
assert.equal(plugin.settings.ui.polishHotkey, "Ctrl+Alt+P");
assert.equal(plugin.settings.ui.testModeEnabled, false);
assert.equal(plugin.settings.ui.testModeKind, "translation");
assert.equal(plugin.settings.ui.showQuickSettingsRailButton, false);
assert.equal(plugin.settings.ui.showQuickSettingsPanelButton, true);
assert.equal(plugin.settings.ui.translationPosition, "before");
assert.equal(plugin.settings.ui.maskTranslations, false);
assert.equal(plugin.settings.ui.autoTranslateMessages, false);
assert.equal(plugin.settings.ui.publicBilingualInputButton, false);
assert.equal(plugin.settings.ui.publicBilingualUseInitialOriginal, false);
assert.equal(plugin.settings.googleTranslate.defaultMonthlyLimit, 450000);
assert.equal(plugin.settings.googleTranslate.allowPrefetch, true);
assert.deepEqual(plugin.settings.googleTranslate.keys, []);
assert.equal(plugin.settings.ui.publicBilingualAfterPolish, false);
assert.equal(plugin.settings.ui.publicBilingualPolishBeforeTranslate, false);
assert.equal(plugin.settings.ui.autoTranslatePrefetch, false);
assert.equal(plugin.settings.ui.autoTranslatePrefetchRange, 5);
assert.equal(plugin.settings.ui.autoTranslateConcurrency, 4);
assert.equal(plugin.settings.ui.autoTranslateStrictRetry, false);
assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, {});
assert.equal(plugin.settings.ui.historyBackfillEnabled, false);
assert.equal(plugin.settings.ui.historyBackfillLimit, 20);
assert.equal(plugin.settings.ui.providerFallbackEnabled, false);
assert.deepEqual(plugin.settings.ui.providerFallbackOrder, []);
assert.equal(plugin.settings.ui.showAutoTranslateWarnings, false);
assert.equal(plugin.settings.ui.showAutoTranslateToasts, false);
assert.equal(plugin.settings.ui.diagnosticsEnabled, false);
assert.equal(plugin.settings.ui.messageButtonVisibility, "always");
assert.equal(plugin.settings.ui.settingsVersion, 2);
assert.equal(plugin.settings.ui.settingsActiveTab, "overview");
assert.equal(plugin.settings.ui.translationCacheTtlHours, 48);
assert.equal(plugin.settings.ui.translationCacheMaxEntries, 4000);
assert.deepEqual(plugin.settings.polish.providerProfiles, {});
assert.deepEqual(plugin.settings.translation.providerProfiles, {});
const defaultTranslationPrompt = plugin.settings.translation.prompt;
const defaultNaturalTranslationTemplate = plugin.settings.translation.promptTemplates.find(template => template.id === "translation-natural");
assert.match(defaultTranslationPrompt, /real-time subtitle layer/);
assert.match(defaultTranslationPrompt, /slang/);
assert.match(defaultTranslationPrompt, /inline code/);
assert.match(defaultTranslationPrompt, /mixes languages/);
assert.equal(defaultNaturalTranslationTemplate.prompt, defaultTranslationPrompt);
assert.equal(plugin.normalizeMessageButtonVisibility("hover"), "hover");
assert.equal(plugin.normalizeMessageButtonVisibility("bad"), "always");
assert.equal(plugin.normalizeTranslationCacheMaxEntries(20000), 15000);
const prototypePollutionPayload = JSON.parse('{"__proto__":{"daitPolluted":"yes"},"ui":{"constructor":{"prototype":{"daitNestedPolluted":"yes"}}}}');
const prototypeSafeSettings = plugin.mergeSettings(plugin.settings, prototypePollutionPayload);
assert.equal(({}).daitPolluted, undefined);
assert.equal(({}).daitNestedPolluted, undefined);
assert.equal(Object.prototype.hasOwnProperty.call(prototypeSafeSettings, "__proto__"), false);
assert.equal(Object.prototype.hasOwnProperty.call(prototypeSafeSettings.ui, "constructor"), false);
const oldToastSettingPlugin = new Plugin();
oldToastSettingPlugin.loadData = key => key === "settings" ? { ui: { showAutoTranslateToasts: true } } : null;
let oldToastSettingsSaved = false;
oldToastSettingPlugin.saveData = key => { if (key === "settings") oldToastSettingsSaved = true; };
oldToastSettingPlugin.loadSettings();
assert.equal(oldToastSettingPlugin.settings.ui.showAutoTranslateToasts, false);
assert.equal(oldToastSettingPlugin.settings.ui.settingsVersion, 2);
assert.equal(oldToastSettingsSaved, true);
const explicitToastSettingPlugin = new Plugin();
explicitToastSettingPlugin.loadData = key => key === "settings" ? { ui: { settingsVersion: 2, showAutoTranslateToasts: true } } : null;
explicitToastSettingPlugin.loadSettings();
assert.equal(explicitToastSettingPlugin.settings.ui.showAutoTranslateToasts, true);
const invalidDiagnosticsSettingPlugin = new Plugin();
invalidDiagnosticsSettingPlugin.loadData = key => key === "settings" ? { ui: { settingsVersion: 2, diagnosticsEnabled: "yes" } } : null;
let invalidDiagnosticsSaved = false;
invalidDiagnosticsSettingPlugin.saveData = key => { if (key === "settings") invalidDiagnosticsSaved = true; };
invalidDiagnosticsSettingPlugin.loadSettings();
assert.equal(invalidDiagnosticsSettingPlugin.settings.ui.diagnosticsEnabled, false);
assert.equal(invalidDiagnosticsSaved, true);
const invalidTopLevelTaskSettingPlugin = new Plugin();
invalidTopLevelTaskSettingPlugin.loadData = key => key === "settings" ? { polish: "bad", translation: "bad" } : null;
let invalidTopLevelTaskSaved = false;
invalidTopLevelTaskSettingPlugin.saveData = key => { if (key === "settings") invalidTopLevelTaskSaved = true; };
invalidTopLevelTaskSettingPlugin.loadSettings();
assert.equal(invalidTopLevelTaskSettingPlugin.settings.polish.provider, "deepseek");
assert.equal(invalidTopLevelTaskSettingPlugin.settings.translation.provider, "deepseek");
assert.equal(invalidTopLevelTaskSaved, true);
const invalidUiBooleanPlugin = new Plugin();
invalidUiBooleanPlugin.loadData = key => key === "settings" ? {
    ui: {
        settingsVersion: 2,
        showQuickSettingsRailButton: "false",
        showQuickSettingsPanelButton: "false",
        injectInputButton: "false",
        injectMessageButtons: "false",
        injectMessageContextMenu: "false",
        enablePolishHotkey: "false"
    }
} : null;
let invalidUiBooleanSaved = false;
invalidUiBooleanPlugin.saveData = key => { if (key === "settings") invalidUiBooleanSaved = true; };
invalidUiBooleanPlugin.loadSettings();
assert.equal(invalidUiBooleanPlugin.settings.ui.injectInputButton, true);
assert.equal(invalidUiBooleanPlugin.settings.ui.showQuickSettingsRailButton, false);
assert.equal(invalidUiBooleanPlugin.settings.ui.showQuickSettingsPanelButton, true);
assert.equal(invalidUiBooleanPlugin.settings.ui.injectMessageButtons, true);
assert.equal(invalidUiBooleanPlugin.settings.ui.injectMessageContextMenu, true);
assert.equal(invalidUiBooleanPlugin.settings.ui.enablePolishHotkey, true);
assert.equal(invalidUiBooleanSaved, true);
const invalidGoogleSettingPlugin = new Plugin();
invalidGoogleSettingPlugin.loadData = key => key === "settings" ? {
    googleTranslate: {
        defaultMonthlyLimit: -1,
        allowPrefetch: "yes",
        keyPoolText: "main|AIza-main|-5\nmain-dupe|AIza-main|999999\nbackup|AIza-backup|100000"
    }
} : null;
let invalidGoogleSaved = false;
invalidGoogleSettingPlugin.saveData = key => { if (key === "settings") invalidGoogleSaved = true; };
invalidGoogleSettingPlugin.loadSettings();
assert.equal(invalidGoogleSettingPlugin.settings.googleTranslate.defaultMonthlyLimit, 450000);
assert.equal(invalidGoogleSettingPlugin.settings.googleTranslate.allowPrefetch, true);
assert.equal(invalidGoogleSettingPlugin.settings.googleTranslate.keys.length, 2);
assert.equal(invalidGoogleSettingPlugin.settings.googleTranslate.keys[0].monthlyLimit, 450000);
assert.equal(invalidGoogleSettingPlugin.settings.googleTranslate.keys[1].monthlyLimit, 100000);
assert.equal(invalidGoogleSaved, true);
const invalidPublicBilingualSettingPlugin = new Plugin();
invalidPublicBilingualSettingPlugin.loadData = key => key === "settings" ? {
    ui: {
        settingsVersion: 2,
        publicBilingualInputButton: "yes",
        publicBilingualUseInitialOriginal: "yes",
        publicBilingualAfterPolish: "yes",
        publicBilingualPolishBeforeTranslate: "yes"
    }
} : null;
let invalidPublicBilingualSaved = false;
invalidPublicBilingualSettingPlugin.saveData = key => { if (key === "settings") invalidPublicBilingualSaved = true; };
invalidPublicBilingualSettingPlugin.loadSettings();
assert.equal(invalidPublicBilingualSettingPlugin.settings.ui.publicBilingualInputButton, false);
assert.equal(invalidPublicBilingualSettingPlugin.settings.ui.publicBilingualUseInitialOriginal, false);
assert.equal(invalidPublicBilingualSettingPlugin.settings.ui.publicBilingualAfterPolish, false);
assert.equal(invalidPublicBilingualSettingPlugin.settings.ui.publicBilingualPolishBeforeTranslate, false);
assert.equal(invalidPublicBilingualSaved, true);
const invalidMessageButtonVisibilityPlugin = new Plugin();
invalidMessageButtonVisibilityPlugin.loadData = key => key === "settings" ? { ui: { messageButtonVisibility: "hidden" } } : null;
let invalidMessageButtonVisibilitySaved = false;
invalidMessageButtonVisibilityPlugin.saveData = key => { if (key === "settings") invalidMessageButtonVisibilitySaved = true; };
invalidMessageButtonVisibilityPlugin.loadSettings();
assert.equal(invalidMessageButtonVisibilityPlugin.settings.ui.messageButtonVisibility, "always");
assert.equal(invalidMessageButtonVisibilitySaved, true);
const invalidPolishAfterActionPlugin = new Plugin();
invalidPolishAfterActionPlugin.loadData = key => key === "settings" ? { polish: { afterAction: "unsafe" } } : null;
let invalidPolishAfterActionSaved = false;
invalidPolishAfterActionPlugin.saveData = key => { if (key === "settings") invalidPolishAfterActionSaved = true; };
invalidPolishAfterActionPlugin.loadSettings();
assert.equal(invalidPolishAfterActionPlugin.settings.polish.afterAction, "replace");
assert.equal(invalidPolishAfterActionSaved, true);
const directReplaceMigrationPlugin = new Plugin();
directReplaceMigrationPlugin.loadData = key => key === "settings" ? { polish: { afterAction: "directReplace", repolishSource: "bad" } } : null;
let directReplaceMigrationSaved = false;
directReplaceMigrationPlugin.saveData = key => { if (key === "settings") directReplaceMigrationSaved = true; };
directReplaceMigrationPlugin.loadSettings();
assert.equal(directReplaceMigrationPlugin.settings.polish.afterAction, "replace");
assert.equal(directReplaceMigrationPlugin.settings.polish.repolishSource, "original");
assert.equal(directReplaceMigrationSaved, true);
const userProvidedLegacyTranslationPrompt = [
    "Translate the Discord message into {targetLanguage}.",
    "Preserve URLs, mentions, code blocks, emoji names, and Markdown formatting.",
    "Return only the translation without explanations."
].join("\n");
const previousDefaultTranslationPrompt = [
    "You are a Discord message translator.",
    "Task: translate the message into {targetLanguage}.",
    "Requirements:",
    "- Preserve meaning, tone, names, mentions, URLs, Markdown, emoji, and code blocks.",
    "- Use natural {targetLanguage}; avoid literal, stiff wording.",
    "- If a phrase is ambiguous, choose the most likely meaning from context without adding notes.",
    "Return only the translation."
].join("\n");
const legacyPromptMigrationPlugin = new Plugin();
legacyPromptMigrationPlugin.loadData = key => key === "settings" ? {
    translation: {
        prompt: userProvidedLegacyTranslationPrompt,
        activePromptTemplate: "translation-natural",
        promptTemplates: [
            { id: "translation-natural", serial: "001", name: "Legacy", prompt: userProvidedLegacyTranslationPrompt },
            { id: "translation-literal", serial: "002", name: "Literal", prompt: "literal prompt" }
        ]
    }
} : null;
let legacyPromptMigrationSaved = false;
legacyPromptMigrationPlugin.saveData = key => { if (key === "settings") legacyPromptMigrationSaved = true; };
legacyPromptMigrationPlugin.loadSettings();
assert.equal(legacyPromptMigrationPlugin.settings.translation.prompt, defaultTranslationPrompt);
assert.equal(legacyPromptMigrationPlugin.settings.translation.promptTemplates.find(template => template.id === "translation-natural").prompt, defaultTranslationPrompt);
assert.equal(legacyPromptMigrationSaved, true);
const previousDefaultPromptMigrationPlugin = new Plugin();
previousDefaultPromptMigrationPlugin.loadData = key => key === "settings" ? {
    translation: {
        prompt: previousDefaultTranslationPrompt,
        activePromptTemplate: "translation-natural",
        promptTemplates: [
            { id: "translation-natural", serial: "001", name: "Previous", prompt: previousDefaultTranslationPrompt }
        ]
    }
} : null;
previousDefaultPromptMigrationPlugin.loadSettings();
assert.equal(previousDefaultPromptMigrationPlugin.settings.translation.prompt, defaultTranslationPrompt);
assert.equal(previousDefaultPromptMigrationPlugin.settings.translation.promptTemplates.find(template => template.id === "translation-natural").prompt, defaultTranslationPrompt);
const customPromptMigrationPlugin = new Plugin();
const customTranslationPrompt = "Custom channel translation prompt in {targetLanguage}. Keep my own rules.";
customPromptMigrationPlugin.loadData = key => key === "settings" ? {
    translation: {
        prompt: customTranslationPrompt,
        activePromptTemplate: "translation-natural",
        promptTemplates: [
            { id: "translation-natural", serial: "001", name: "Custom", prompt: customTranslationPrompt }
        ]
    }
} : null;
customPromptMigrationPlugin.loadSettings();
assert.equal(customPromptMigrationPlugin.settings.translation.prompt, customTranslationPrompt);
assert.equal(customPromptMigrationPlugin.settings.translation.promptTemplates.find(template => template.id === "translation-natural").prompt, customTranslationPrompt);
const savedDocumentForPolishSection = global.document;
const polishSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, polishSectionCreated) };
const polishSectionPlugin = new Plugin();
const polishTaskSection = polishSectionPlugin.createTaskSection("polish", "Polish", "Desc");
const polishPromptSection = polishSectionPlugin.createTaskPromptSection("polish");
const polishProviderControl = polishSectionCreated.find(element => element.dataset?.daitPath === "polish.provider");
assert.deepEqual(polishProviderControl.children.map(option => option.value), ["deepseek", "openaiCompatible", "sakuraLocal"]);
assert.ok(polishSectionCreated.some(element => element.dataset?.daitPath === "polish.apiKey"));
assert.ok(polishSectionCreated.some(element => element.dataset?.daitPath === "polish.endpoint"));
assert.ok(polishSectionCreated.some(element => element.dataset?.daitPath === "polish.model"));
assert.ok(polishSectionCreated.some(element => element.dataset?.daitPath === "polish.enableThinking"));
assert.ok(polishSectionCreated.some(element => element.dataset?.daitPath === "polish.prompt"));
assert.equal(polishSectionCreated.some(element => element.dataset?.daitPath === "googleTranslate.keyPoolText"), false);
const polishProviderBlock = polishSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(polishProviderBlock);
assert.equal(polishProviderBlock.dataset.daitProvider, "deepseek");
assert.equal(polishProviderBlock.contains(polishProviderControl), false);
assert.ok(polishProviderBlock.contains(polishSectionCreated.find(element => element.dataset?.daitPath === "polish.apiKey")));
assert.ok(polishProviderBlock.contains(polishSectionCreated.find(element => element.dataset?.daitPath === "polish.model")));
// Prompts belong to the task: their own group after the connection card, not inside it.
assert.equal(polishProviderBlock.contains(polishSectionCreated.find(element => element.dataset?.daitPath === "polish.prompt")), false);
assert.equal(polishTaskSection.contains(polishSectionCreated.find(element => element.dataset?.daitPath === "polish.prompt")), false);
assert.ok(polishPromptSection.contains(polishSectionCreated.find(element => element.dataset?.daitPath === "polish.prompt")));
const translationSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, translationSectionCreated) };
const translationSectionPlugin = new Plugin();
translationSectionPlugin.createTaskSection("translation", "Translation", "Desc");
const translationProviderControl = translationSectionCreated.find(element => element.dataset?.daitPath === "translation.provider");
// Translation providers come in two <optgroup>s: AI models, then machine translation.
assert.deepEqual(translationProviderControl.children.map(group => group.tagName), ["OPTGROUP", "OPTGROUP"]);
assert.deepEqual(translationProviderControl.children.map(group => group.children.map(option => option.value)), [["deepseek", "openaiCompatible", "sakuraLocal"], ["googleCloud", "microsoft", "deepl", "baidu"]]);
assert.equal(translationSectionCreated.some(element => element.dataset?.daitPath === "googleTranslate.keyPoolText"), false);
const translationProviderBlock = translationSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(translationProviderBlock);
assert.equal(translationProviderBlock.dataset.daitProvider, "deepseek");
assert.equal(translationProviderBlock.contains(translationProviderControl), false);
assert.ok(translationProviderBlock.contains(translationSectionCreated.find(element => element.dataset?.daitPath === "translation.model")));
const sakuraSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, sakuraSectionCreated) };
const sakuraSectionPlugin = new Plugin();
sakuraSectionPlugin.settings.polish.provider = "sakuraLocal";
sakuraSectionPlugin.createTaskSection("polish", "Polish", "Desc");
// Sakura's model presets live in the model field's picker (with "use the loaded model" first), not in a row of their own.
const localModelPresetOptions = select => select.children.flatMap(child => child.tagName === "OPTGROUP" ? child.children : [child]);
const localModelPresetControl = sakuraSectionCreated.find(element => element.tagName === "SELECT" && localModelPresetOptions(element).some(option => option.value === "HY-MT1.5-7B-Q4_K_M.gguf"));
assert.ok(localModelPresetControl);
assert.equal(localModelPresetControl.dataset.daitModelPreset, "polish");
assert.equal(localModelPresetOptions(localModelPresetControl)[0].value, "local-model");
assert.ok(localModelPresetOptions(localModelPresetControl).some(option => option.value === "Qwen3-8B-Q4_K_M_2.gguf"));
assert.equal(sakuraSectionCreated.some(element => element.dataset?.daitPath === "polish.enableThinking"), false);
const sakuraTranslationSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, sakuraTranslationSectionCreated) };
const sakuraTranslationSectionPlugin = new Plugin();
sakuraTranslationSectionPlugin.settings.translation.provider = "sakuraLocal";
sakuraTranslationSectionPlugin.createTaskSection("translation", "Translation", "Desc");
const sakuraTranslationProviderBlock = sakuraTranslationSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(sakuraTranslationProviderBlock);
assert.equal(sakuraTranslationProviderBlock.dataset.daitProvider, "sakuraLocal");
assert.equal(sakuraTranslationSectionCreated.some(element => element.dataset?.daitPath === "googleTranslate.keyPoolText"), false);
assert.equal(sakuraTranslationSectionCreated.some(element => element.dataset?.daitPath === "translation.enableThinking"), false);
assert.ok(sakuraTranslationProviderBlock.contains(sakuraTranslationSectionCreated.find(element => element.dataset?.daitPath === "translation.endpoint")));
assert.ok(sakuraTranslationProviderBlock.contains(sakuraTranslationSectionCreated.find(element => element.dataset?.daitPath === "translation.model")));
const googleSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, googleSectionCreated) };
const googleSectionPlugin = new Plugin();
googleSectionPlugin.settings.translation.provider = "googleCloud";
googleSectionPlugin.createTaskSection("translation", "Translation", "Desc");
assert.ok(googleSectionCreated.some(element => element.dataset?.daitPath === "googleTranslate.keyPoolText"));
assert.ok(googleSectionCreated.some(element => element.dataset?.daitPath === "googleTranslate.defaultMonthlyLimit"));
assert.ok(googleSectionCreated.some(element => element.dataset?.daitPath === "googleTranslate.allowPrefetch"));
assert.equal(googleSectionCreated.some(element => element.dataset?.daitPath === "translation.apiKey"), false);
assert.equal(googleSectionCreated.some(element => element.dataset?.daitPath === "translation.model"), false);
assert.equal(googleSectionCreated.some(element => element.dataset?.daitPath === "translation.temperature"), false);
assert.equal(googleSectionCreated.some(element => element.dataset?.daitPath === "translation.maxTokens"), false);
assert.equal(googleSectionCreated.some(element => element.dataset?.daitPath === "translation.prompt"), false);
const googleProviderBlock = googleSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(googleProviderBlock);
assert.equal(googleProviderBlock.dataset.daitProvider, "googleCloud");
assert.ok(googleProviderBlock.contains(googleSectionCreated.find(element => element.dataset?.daitPath === "googleTranslate.keyPoolText")));
const microsoftSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, microsoftSectionCreated) };
const microsoftSectionPlugin = new Plugin();
microsoftSectionPlugin.settings.translation.provider = "microsoft";
microsoftSectionPlugin.createTaskSection("translation", "Translation", "Desc");
const microsoftProviderBlock = microsoftSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(microsoftProviderBlock);
assert.equal(microsoftProviderBlock.dataset.daitProvider, "microsoft");
assert.ok(microsoftProviderBlock.contains(microsoftSectionCreated.find(element => element.dataset?.daitPath === "translation.apiKey")));
assert.ok(microsoftProviderBlock.contains(microsoftSectionCreated.find(element => element.dataset?.daitPath === "translation.region")));
assert.equal(microsoftSectionCreated.some(element => element.dataset?.daitPath === "translation.model"), false);
assert.equal(microsoftSectionCreated.some(element => element.dataset?.daitPath === "translation.prompt"), false);
const deeplSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, deeplSectionCreated) };
const deeplSectionPlugin = new Plugin();
deeplSectionPlugin.settings.translation.provider = "deepl";
deeplSectionPlugin.createTaskSection("translation", "Translation", "Desc");
const deeplProviderBlock = deeplSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(deeplProviderBlock);
assert.equal(deeplProviderBlock.dataset.daitProvider, "deepl");
assert.ok(deeplProviderBlock.contains(deeplSectionCreated.find(element => element.dataset?.daitPath === "translation.apiKey")));
assert.ok(deeplProviderBlock.contains(deeplSectionCreated.find(element => element.dataset?.daitPath === "translation.deeplPlan")));
assert.equal(deeplSectionCreated.some(element => element.dataset?.daitPath === "translation.model"), false);
const baiduSectionCreated = [];
global.document = { createElement: tag => createFakeElement(tag, baiduSectionCreated) };
const baiduSectionPlugin = new Plugin();
baiduSectionPlugin.settings.translation.provider = "baidu";
baiduSectionPlugin.createTaskSection("translation", "Translation", "Desc");
const baiduProviderBlock = baiduSectionCreated.find(element => element.className === "dait-provider-settings-block");
assert.ok(baiduProviderBlock);
assert.equal(baiduProviderBlock.dataset.daitProvider, "baidu");
assert.ok(baiduProviderBlock.contains(baiduSectionCreated.find(element => element.dataset?.daitPath === "translation.appId")));
assert.ok(baiduProviderBlock.contains(baiduSectionCreated.find(element => element.dataset?.daitPath === "translation.secretKey")));
assert.equal(baiduSectionCreated.some(element => element.dataset?.daitPath === "translation.apiKey"), false);
assert.equal(baiduSectionCreated.some(element => element.dataset?.daitPath === "translation.model"), false);
const polishAfterActionControl = polishSectionCreated.find(element => element.dataset?.daitPath === "polish.afterAction");
assert.deepEqual(polishAfterActionControl.children.map(option => option.value), ["replace", "confirmSend"]);
assert.equal(polishProviderBlock.contains(polishAfterActionControl), false);
const polishRepolishSourceControl = polishSectionCreated.find(element => element.dataset?.daitPath === "polish.repolishSource");
assert.deepEqual(polishRepolishSourceControl.children.map(option => option.value), ["original", "lastResult"]);
assert.equal(polishProviderBlock.contains(polishRepolishSourceControl), false);
global.document = savedDocumentForPolishSection;
const providerSwitchPlugin = new Plugin();
providerSwitchPlugin.settings.translation.provider = "openaiCompatible";
providerSwitchPlugin.settings.translation.apiKey = "openai-key";
providerSwitchPlugin.settings.translation.endpoint = "https://openai.example/v1/chat/completions";
providerSwitchPlugin.settings.translation.model = "custom-openai-model";
let providerSwitchSaves = 0;
providerSwitchPlugin.saveData = key => {
    if (key === "settings") providerSwitchSaves++;
    return true;
};
providerSwitchPlugin.setTaskProvider("translation", "googleCloud");
assert.equal(providerSwitchPlugin.settings.translation.provider, "googleCloud");
assert.equal(providerSwitchPlugin.settings.translation.endpoint, "https://translation.googleapis.com/language/translate/v2");
assert.equal(providerSwitchPlugin.settings.translation.model, "nmt");
assert.equal(providerSwitchPlugin.settings.translation.apiKey, "");
providerSwitchPlugin.setTaskProvider("translation", "openaiCompatible");
assert.equal(providerSwitchPlugin.settings.translation.apiKey, "openai-key");
assert.equal(providerSwitchPlugin.settings.translation.endpoint, "https://openai.example/v1/chat/completions");
assert.equal(providerSwitchPlugin.settings.translation.model, "custom-openai-model");
assert.equal(providerSwitchSaves, 0);
assert.equal(providerSwitchPlugin.settingsDirty, true);
assert.equal(providerSwitchPlugin.flushSettings(), true);
assert.equal(providerSwitchSaves, 1);
clearTimeout(providerSwitchPlugin.scanTimer);
providerSwitchPlugin.scanTimer = null;
const invalidPolishProviderPlugin = new Plugin();
invalidPolishProviderPlugin.loadData = key => key === "settings" ? { polish: { provider: "googleCloud" } } : null;
let invalidPolishProviderSaved = false;
invalidPolishProviderPlugin.saveData = key => { if (key === "settings") invalidPolishProviderSaved = true; };
invalidPolishProviderPlugin.loadSettings();
assert.equal(invalidPolishProviderPlugin.settings.polish.provider, "deepseek");
assert.equal(invalidPolishProviderSaved, true);
const savedDocumentForSettingsTabs = global.document;
const settingsPanelCreated = [];
global.document = { createElement: tag => createFakeElement(tag, settingsPanelCreated) };
const settingsPanelPlugin = new Plugin();
settingsPanelPlugin.settings.ui.settingsActiveTab = "translation";
settingsPanelPlugin.getSettingsPanel();
assert.ok(settingsPanelCreated.some(element => element.className === "dait-settings-header"));
assert.ok(settingsPanelCreated.some(element => element.className === "dait-settings-body"));
assert.ok(settingsPanelCreated.some(element => element.className === "dait-settings-rail"));
assert.ok(settingsPanelCreated.some(element => element.className === "dait-settings-tabs"));
assert.ok(settingsPanelCreated.some(element => element.className === "dait-settings-search-input"));
// Reset left the navigation: it is the danger-zone button at the end of the data tab.
assert.equal(settingsPanelCreated.some(element => fakeElementHasClass(element, "dait-settings-sidebar-reset")), false);
const tabValues = settingsPanelCreated.map(element => element.dataset?.daitSettingsTab).filter(Boolean);
assert.deepEqual(tabValues, ["overview", "translate", "compose", "display", "advanced", "data"]);
const anchorValues = settingsPanelCreated.map(element => element.dataset?.daitSettingsSection).filter(Boolean);
assert.deepEqual(anchorValues, tabValues);
const settingsPanelPaths = new Set(settingsPanelCreated.map(element => element.dataset?.daitPath).filter(Boolean));
assert.equal(settingsPanelPaths.has("polish.provider"), true);
assert.equal(settingsPanelPaths.has("ui.injectInputButton"), true);
assert.equal(settingsPanelPaths.has("ui.showQuickSettingsRailButton"), false);
assert.equal(settingsPanelPaths.has("ui.showQuickSettingsPanelButton"), true);
assert.equal(settingsPanelPaths.has("translation.provider"), true);
assert.equal(settingsPanelPaths.has("ui.publicBilingualInputButton"), true);
assert.equal(settingsPanelPaths.has("ui.translationCacheTtlHours"), true);
global.document = savedDocumentForSettingsTabs;
// Every setting lives on the tab UI-SPEC's information architecture gives it.
const settingsTabPanelPaths = Object.fromEntries(settingsPanelCreated
    .filter(element => element.getAttribute?.("role") === "tabpanel")
    .map(tabpanel => {
        const paths = new Set();
        const visit = node => (node.children || []).forEach(child => {
            if (child.dataset?.daitPath) paths.add(child.dataset.daitPath);
            visit(child);
        });
        visit(tabpanel);
        return [tabpanel.dataset.daitSettingsTabPanel, paths];
    }));
const settingsTabLayout = {
    overview: ["ui.autoTranslateMessages", "ui.currentChannelAutoTranslatePolicy", "ui.language"],
    translate: [
        "translation.enabled",
        "translation.provider",
        "translation.apiKey",
        "translation.endpoint",
        "translation.model",
        "translation.temperature",
        "translation.maxTokens",
        "translation.enableThinking",
        "ui.autoTranslateMessages",
        "ui.autoTranslatePrefetch",
        "ui.autoTranslatePrefetchRange",
        "ui.currentChannelAutoTranslatePolicy",
        "ui.messageButtonMode",
        "ui.injectMessageContextMenu",
        "translation.prompt"
    ],
    compose: [
        "polish.enabled",
        "polish.provider",
        "polish.apiKey",
        "polish.afterAction",
        "polish.repolishSource",
        "polish.prompt",
        "ui.injectInputButton",
        "ui.enablePolishHotkey",
        "ui.publicBilingualInputButton",
        "ui.publicBilingualUseInitialOriginal",
        "ui.publicBilingualAfterPolish",
        "ui.publicBilingualPolishBeforeTranslate"
    ],
    display: [
        "ui.translationPosition",
        "ui.translationStyle",
        "ui.translationTextScale",
        "ui.maskTranslations",
        "ui.hideOriginalAfterTranslation",
        "ui.showAutoTranslateWarnings",
        "ui.showAutoTranslateToasts",
        "ui.showQuickSettingsPanelButton"
    ],
    advanced: [
        "ui.autoTranslateConcurrency",
        "ui.autoTranslateIntakeMode",
        "ui.autoTranslateStrictRetry",
        "ui.historyBackfillEnabled",
        "ui.historyBackfillLimit",
        "ui.providerFallbackEnabled",
        "ui.providerFallbackOrder"
    ],
    data: ["ui.translationCacheTtlHours", "ui.translationCacheMaxEntries", "ui.diagnosticsEnabled"]
};
Object.entries(settingsTabLayout).forEach(([tab, paths]) => {
    paths.forEach(path => assert.equal(settingsTabPanelPaths[tab].has(path), true, `${path} on ${tab}`));
});
const translationTabPaths = settingsPanelPaths;
[
    "translation.provider",
    "ui.messageButtonMode",
    "ui.injectMessageContextMenu",
    "ui.autoTranslateMessages",
    "ui.autoTranslatePrefetch",
    "ui.autoTranslatePrefetchRange",
    "ui.autoTranslateConcurrency",
    "ui.autoTranslateStrictRetry",
    "ui.currentChannelAutoTranslatePolicy",
    "ui.historyBackfillEnabled",
    "ui.historyBackfillLimit",
    "ui.providerFallbackEnabled",
    "ui.providerFallbackOrder"
].forEach(path => assert.equal(translationTabPaths.has(path), true));
const savedDocumentForPublicBilingualSection = global.document;
const publicBilingualCreatedElements = [];
global.document = { createElement: tag => createFakeElement(tag, publicBilingualCreatedElements) };
const publicBilingualSectionPlugin = new Plugin();
const publicBilingualSection = publicBilingualSectionPlugin.createPublicBilingualSection();
const publicBilingualPaths = new Set(publicBilingualCreatedElements.map(element => element.dataset?.daitPath).filter(Boolean));
[
    "ui.publicBilingualInputButton",
    "ui.publicBilingualUseInitialOriginal",
    "ui.publicBilingualAfterPolish",
    "ui.publicBilingualPolishBeforeTranslate"
].forEach(path => assert.equal(publicBilingualPaths.has(path), true));
assert.ok(publicBilingualCreatedElements.some(element => element.className === "dait-provider-summary"));
assert.ok(publicBilingualSection.children.length > 0);
global.document = savedDocumentForPublicBilingualSection;
const savedDocumentForUiSections = global.document;
const uiCreatedElements = [];
global.document = { createElement: tag => createFakeElement(tag, uiCreatedElements) };
const uiSectionPlugin = new Plugin();
const translationControlsSection = uiSectionPlugin.createTranslationControlsSection();
const autoTranslateSection = uiSectionPlugin.createAutoTranslateSection();
const advancedSection = uiSectionPlugin.createAdvancedSection();
const historyBackfillSection = uiSectionPlugin.createHistoryBackfillSection();
const providerFallbackSection = uiSectionPlugin.createProviderFallbackSection(false);
const displaySection = uiSectionPlugin.createDisplayBehaviorSection();
const displayNoticesSection = uiSectionPlugin.createDisplayNoticesSection();
const cacheSection = uiSectionPlugin.createCacheSection();
const diagnosticsSection = uiSectionPlugin.createDiagnosticsSection();
const uiPaths = new Set(uiCreatedElements.map(element => element.dataset?.daitPath).filter(Boolean));
[
    "ui.autoTranslateMessages",
    "ui.autoTranslatePrefetch",
    "ui.autoTranslatePrefetchRange",
    "ui.autoTranslateConcurrency",
    "ui.autoTranslateStrictRetry",
    "ui.currentChannelAutoTranslatePolicy",
    "ui.historyBackfillEnabled",
    "ui.historyBackfillLimit",
    "ui.providerFallbackEnabled",
    "ui.providerFallbackOrder",
    "ui.showQuickSettingsPanelButton",
    "ui.showAutoTranslateWarnings",
    "ui.showAutoTranslateToasts",
    "ui.diagnosticsEnabled",
    "ui.messageButtonMode",
    "ui.translationCacheTtlHours",
    "ui.translationCacheMaxEntries",
    "ui.hideOriginalAfterTranslation"
].forEach(path => assert.equal(uiPaths.has(path), true));
// One select for the message Translate button: on hover / always / off.
const messageButtonModeControl = uiCreatedElements.find(element => element.dataset?.daitPath === "ui.messageButtonMode");
assert.deepEqual(messageButtonModeControl.children.map(option => option.value), ["hover", "always", "off"]);
assert.equal(messageButtonModeControl.children.find(option => option.selected).value, "always");
const cacheLimitControl = uiCreatedElements.find(element => element.dataset?.daitPath === "ui.translationCacheMaxEntries");
assert.equal(cacheLimitControl.attributes.max, "15000");
assert.equal(cacheLimitControl.attributes.min, "100");
const ttlControl = uiCreatedElements.find(element => element.dataset?.daitPath === "ui.translationCacheTtlHours");
assert.deepEqual(ttlControl.children.map(option => option.value), ["3", "6", "12", "24", "48", "168"]);
// The channel rule is a segmented control of three radio buttons.
const channelPolicyControl = uiCreatedElements.find(element => element.dataset?.daitPath === "ui.currentChannelAutoTranslatePolicy");
assert.equal(channelPolicyControl.getAttribute("role"), "radiogroup");
assert.deepEqual(channelPolicyControl.children.map(button => button.dataset.daitValue), ["inherit", "enabled", "disabled"]);
assert.deepEqual(channelPolicyControl.children.map(button => button.getAttribute("role")), ["radio", "radio", "radio"]);
const historyBackfillButton = uiCreatedElements.find(element => element.dataset?.daitAction === "historyBackfillRun");
assert.ok(historyBackfillButton);
// Backfill is off by default, so its run button is disabled until the switch is on.
assert.equal(historyBackfillButton.disabled, true);
let historyBackfillButtonCalled = false;
uiSectionPlugin.requestExplicitHistoryBackfill = () => {
    historyBackfillButtonCalled = true;
    return { requested: 1, candidates: 1, eligible: 1, enqueued: 1, skipped: 0, blocked: 0 };
};
uiSectionPlugin.showToast = () => {};
historyBackfillButton.listeners.click({ preventDefault() {}, stopPropagation() {} });
assert.equal(historyBackfillButtonCalled, true);
// Every data-tab action has a row of its own: clear stats, then clear cache (destructive, alone in its row).
const cacheActionControls = uiCreatedElements.filter(element => element.className === "dait-cache-actions");
assert.deepEqual(cacheActionControls.map(element => element.children.length), [1, 1]);
// Copy, export JSON and export TXT share one row; clearing the logs has a row of its own.
const diagnosticControls = uiCreatedElements.find(element => element.className === "dait-diagnostic-actions");
assert.ok(diagnosticControls);
assert.equal(diagnosticControls.children.length, 3);
[translationControlsSection, autoTranslateSection, advancedSection, historyBackfillSection, providerFallbackSection, displaySection, displayNoticesSection, cacheSection, diagnosticsSection]
    .forEach(section => assert.ok(section.children.length > 0));
// The description sits in the row's text column (div.dait-settings-row > div.dait-row-text > p.dait-row-description).
const getUiRow = (elements, path) => {
    let node = elements.find(element => element.dataset?.daitPath === path);
    while (node && !String(node.className || "").split(/\s+/).includes("dait-settings-row")) node = node.parentElement;
    return node;
};
const getUiRowDescription = (elements, path) => getUiRow(elements, path)?.children[0]?.children.find(child => child.className === "dait-row-description")?.textContent;
// A form field is disabled itself; a composite control (the fallback order list) through every button and box in it.
const isUiControlDisabled = element => {
    const isField = node => ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(node.tagName);
    if (isField(element)) return element.disabled === true;
    const fields = [];
    const visit = node => (node.children || []).forEach(child => {
        if (isField(child)) fields.push(child);
        visit(child);
    });
    visit(element);
    return fields.length > 0 && fields.every(field => field.disabled === true);
};
assert.match(getUiRowDescription(uiCreatedElements, "ui.autoTranslateConcurrency"), /默认 4，范围 1-10/);
["ui.autoTranslatePrefetch", "ui.autoTranslateIntakeMode", "ui.providerFallbackEnabled"]
    .forEach(path => assert.notEqual(uiCreatedElements.find(element => element.dataset?.daitPath === path).disabled, true, path));
// Dependent rows are disabled and say which switch to turn on while their parent is off.
[
    ["ui.autoTranslatePrefetchRange", "autoTranslatePrefetch"],
    ["ui.historyBackfillLimit", "historyBackfillEnabled"],
    ["ui.providerFallbackOrder", "providerFallbackEnabled"]
].forEach(([path, parentKey]) => {
    assert.equal(isUiControlDisabled(uiCreatedElements.find(element => element.dataset?.daitPath === path)), true, path);
    assert.equal(getUiRowDescription(uiCreatedElements, path), uiSectionPlugin.t("settingsRequiresParent", { parent: uiSectionPlugin.t(parentKey) }), path);
    assert.equal(fakeElementHasClass(getUiRow(uiCreatedElements, path), "dait-settings-row-dependent"), true, path);
});
uiSectionPlugin.settings.ui.providerFallbackEnabled = true;
uiSectionPlugin.syncSettingsDependentRows(providerFallbackSection, "ui.providerFallbackEnabled");
const providerFallbackOrderList = uiCreatedElements.find(element => element.dataset?.daitPath === "ui.providerFallbackOrder");
// The order is an ordered list of the cloud services (no typed ids): a tick box and up/down buttons per service.
assert.deepEqual(providerFallbackOrderList.children.map(item => item.dataset.daitProvider), ["deepseek", "openaiCompatible", "googleCloud", "microsoft", "deepl", "baidu"]);
assert.equal(providerFallbackOrderList.children.every(item => item.children.some(child => child.className === "dait-order-include")), true);
assert.equal(isUiControlDisabled(providerFallbackOrderList), false);
assert.equal(getUiRowDescription(uiCreatedElements, "ui.providerFallbackOrder"), uiSectionPlugin.t("providerFallbackOrderListDesc"));
uiSectionPlugin.settings.ui.providerFallbackEnabled = false;
const localUiCreatedElements = [];
global.document = { createElement: tag => createFakeElement(tag, localUiCreatedElements) };
const localUiSectionPlugin = new Plugin();
localUiSectionPlugin.settings.translation.provider = "sakuraLocal";
localUiSectionPlugin.settings.ui.autoTranslatePrefetch = true;
localUiSectionPlugin.createAutoTranslateSection();
localUiSectionPlugin.createAdvancedSection();
localUiSectionPlugin.createProviderFallbackSection();
// Locked local-provider controls are disabled and explain why instead of their normal description.
[
    ["ui.autoTranslateIntakeMode", "localIntakeFixed"],
    ["ui.providerFallbackEnabled", "localFallbackUnavailable"],
    ["ui.providerFallbackOrder", "localFallbackUnavailable"]
].forEach(([path, reasonKey]) => {
    assert.equal(isUiControlDisabled(localUiCreatedElements.find(element => element.dataset?.daitPath === path)), true, path);
    assert.equal(getUiRowDescription(localUiCreatedElements, path), localUiSectionPlugin.t(reasonKey), path);
});
// Local providers can prefetch nearby messages like cloud providers.
[
    ["ui.autoTranslatePrefetch", "autoTranslatePrefetchDesc"],
    ["ui.autoTranslatePrefetchRange", "autoTranslatePrefetchRangeDesc"]
].forEach(([path, descriptionKey]) => {
    assert.notEqual(localUiCreatedElements.find(element => element.dataset?.daitPath === path).disabled, true, path);
    assert.equal(getUiRowDescription(localUiCreatedElements, path), localUiSectionPlugin.t(descriptionKey), path);
});
assert.equal(getUiRowDescription(localUiCreatedElements, "ui.autoTranslateConcurrency"), localUiSectionPlugin.t("localConcurrencyDesc", { min: 1, max: 10 }));
assert.match(getUiRowDescription(localUiCreatedElements, "ui.autoTranslateConcurrency"), /1-10/);
const versionHero = uiSectionPlugin.createSettingsHero();
const versionChip = [...uiCreatedElements, ...localUiCreatedElements].find(element => element.dataset?.daitVersion);
assert.ok(versionHero && versionChip);
assert.equal(versionChip.textContent, `v${require("../package.json").version}`);
const settingsSnapshotButton = uiCreatedElements.find(element => element.dataset?.daitAction === "exportSettingsSnapshot");
assert.ok(settingsSnapshotButton);
const settingsSnapshotDownloads = [];
uiSectionPlugin.downloadTextFile = (filename, text) => {
    settingsSnapshotDownloads.push({ filename, text });
    return true;
};
uiSectionPlugin.settings.polish.apiKey = "sk-fake-verify-1";
settingsSnapshotButton.listeners.click();
assert.equal(settingsSnapshotDownloads.length, 1);
assert.match(settingsSnapshotDownloads[0].filename, /^DiscordAITranslator-settings-.+\.json$/);
assert.equal(settingsSnapshotDownloads[0].text.includes("sk-fake-verify-1"), false);
assert.equal(JSON.parse(settingsSnapshotDownloads[0].text).settings.polish.apiKey, "[hidden]");
global.document = savedDocumentForUiSections;
const diagnosticPlugin = new Plugin();
diagnosticPlugin.showToast = () => {};
diagnosticPlugin.messageTracker.getRouteIds = () => ({ guildId: "guild-secret", channelId: "channel-secret", messageId: "message-secret" });
diagnosticPlugin.logDiagnostic("auto.scan", "ok", { text: "secret source", apiKey: "sk-secret", provider: "deepseek", count: 1 });
assert.equal(diagnosticPlugin.diagnosticLogs.length, 0);
diagnosticPlugin.settings.ui.diagnosticsEnabled = true;
diagnosticPlugin.logDiagnostic("auto.scan", "ok", { text: "secret source", apiKey: "sk-secret", provider: "deepseek", count: 1, textCacheHits: 1, channelId: "channel-meta-secret", endpoint: "https://secret.invalid", message: "raw diagnostic message" });
diagnosticPlugin.logDiagnostic("auto.scan", "ok", { text: "another secret", provider: "deepseek", count: 2, textCacheHits: 2 });
assert.equal(diagnosticPlugin.diagnosticLogs.length, 1);
assert.equal(diagnosticPlugin.diagnosticLogs[0].count, 2);
assert.equal(diagnosticPlugin.diagnosticCompressedCount, 1);
assert.equal(diagnosticPlugin.diagnosticLogs[0].meta.text, undefined);
assert.equal(diagnosticPlugin.diagnosticLogs[0].meta.apiKey, undefined);
assert.equal(diagnosticPlugin.diagnosticLogs[0].meta.channelId, undefined);
assert.equal(diagnosticPlugin.diagnosticLogs[0].meta.endpoint, undefined);
assert.equal(diagnosticPlugin.diagnosticLogs[0].meta.message, undefined);
assert.equal(diagnosticPlugin.diagnosticLogs[0].meta.textCacheHits, 2);
const diagnosticJson = diagnosticPlugin.serializeDiagnosticLogs("json");
const diagnosticTxt = diagnosticPlugin.serializeDiagnosticLogs("txt");
assert.match(diagnosticJson, /"auto.scan"/);
assert.match(diagnosticTxt, /auto.scan ok/);
assert.doesNotMatch(diagnosticJson, /guild-secret|channel-secret|message-secret|channel-meta-secret|secret\.invalid|raw diagnostic message/);
assert.doesNotMatch(diagnosticTxt, /guild-secret|channel-secret|message-secret|channel-meta-secret|secret\.invalid|raw diagnostic message/);
assert.equal(JSON.parse(diagnosticJson).route.guildId, diagnosticPlugin.getTextFingerprint("guild-secret"));
diagnosticPlugin.clearDiagnosticLogs();
diagnosticPlugin.flushDiagnosticLogs();
assert.equal(diagnosticPlugin.diagnosticLogs.length, 0);
assert.equal(diagnosticPlugin.quickSettingsDiagnosticLogs.length, 0);

const redactionPlugin = new Plugin();
redactionPlugin.settings.ui.diagnosticsEnabled = true;
redactionPlugin.logDiagnostic("data.io", "error", {
    errorText: "Bearer secret-token-value sk-1234567890 at https://secret.invalid/path",
    lastError: "AIza1234567890abcdef"
});
const redactionJson = redactionPlugin.serializeDiagnosticLogs("json");
assert.match(redactionJson, /Bearer \[redacted\]/);
assert.match(redactionJson, /\[redacted-api-key\]/);
assert.match(redactionJson, /\[redacted-google-key\]/);
assert.match(redactionJson, /\[redacted-url\]/);
assert.doesNotMatch(redactionJson, /secret-token-value|sk-1234567890|secret\.invalid|AIza1234567890abcdef/);
clearTimeout(redactionPlugin.diagnosticLogsDirtyTimer);
redactionPlugin.diagnosticLogsDirtyTimer = null;
const warningRedactionPlugin = new Plugin();
const savedWarnForRedaction = console.warn;
const warningRedactionArgs = [];
console.warn = (...args) => warningRedactionArgs.push(args);
warningRedactionPlugin.warnSanitized("redaction test", Object.assign(new Error("Bearer secret-token-value sk-1234567890 https://secret.invalid/path AIza1234567890abcdef"), {
    googleTranslateApiKey: "AIza1234567890abcdef",
    requestId: "request-ok"
}));
console.warn = savedWarnForRedaction;
assert.equal(warningRedactionArgs.length, 1);
const warningRedactionText = JSON.stringify(warningRedactionArgs);
assert.doesNotMatch(warningRedactionText, /secret-token-value|sk-1234567890|secret\.invalid|AIza1234567890abcdef/);
assert.match(warningRedactionText, /redacted/);

const savedBdApiForDataIo = global.BdApi;
const savedConsoleWarnForDataIo = console.warn;
let dataIoWarnings = 0;
global.BdApi = {
    Data: {
        load() { throw new Error("load failed sk-1234567890"); },
        save() { throw new Error("save failed Bearer secret-token-value"); }
    }
};
console.warn = () => { dataIoWarnings++; };
const dataIoPlugin = new Plugin();
dataIoPlugin.settings.ui.diagnosticsEnabled = true;
assert.equal(dataIoPlugin.loadData("settings"), null);
assert.equal(dataIoPlugin.saveData("settings", {}), false);
console.warn = savedConsoleWarnForDataIo;
if (savedBdApiForDataIo === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForDataIo;
assert.equal(dataIoWarnings, 2);
const dataIoJson = dataIoPlugin.serializeDiagnosticLogs("json");
assert.match(dataIoJson, /data\.io/);
assert.doesNotMatch(dataIoJson, /sk-1234567890|secret-token-value/);
clearTimeout(dataIoPlugin.diagnosticLogsDirtyTimer);
dataIoPlugin.diagnosticLogsDirtyTimer = null;

const savedBdApiForDataReturn = global.BdApi;
const dataReturnPlugin = new Plugin();
global.BdApi = { Data: { save: () => undefined } };
assert.equal(dataReturnPlugin.saveData("settings", {}), true);
global.BdApi = { Data: { save: () => false } };
assert.equal(dataReturnPlugin.saveData("settings", {}), false);
global.BdApi = { Data: { save: () => true } };
assert.equal(dataReturnPlugin.saveData("settings", {}), true);
clearTimeout(dataReturnPlugin.diagnosticLogsDirtyTimer);
dataReturnPlugin.diagnosticLogsDirtyTimer = null;
if (savedBdApiForDataReturn === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForDataReturn;

const savedDocumentForSettingsDebounce = global.document;
global.document = { querySelectorAll: () => [] };
const settingsDebouncePlugin = new Plugin();
let settingsDebounceSaves = 0;
settingsDebouncePlugin.saveData = key => {
    if (key === "settings") settingsDebounceSaves++;
    return true;
};
settingsDebouncePlugin.setSetting("ui.autoTranslateMessages", true);
assert.equal(settingsDebouncePlugin.settings.ui.autoTranslateMessages, true);
assert.equal(settingsDebounceSaves, 0);
assert.equal(settingsDebouncePlugin.settingsDirty, true);
assert.ok(settingsDebouncePlugin.settingsDirtyTimer);
assert.equal(settingsDebouncePlugin.flushSettings(), true);
assert.equal(settingsDebounceSaves, 1);
assert.equal(settingsDebouncePlugin.settingsDirty, false);
assert.equal(settingsDebouncePlugin.settingsDirtyTimer, null);
const apiStatusDebouncePlugin = new Plugin();
let apiStatusDebounceSaves = 0;
apiStatusDebouncePlugin.saveData = key => {
    if (key === "settings") apiStatusDebounceSaves++;
    return true;
};
apiStatusDebouncePlugin.setApiRuntimeStatus("translation", "failed", "failed", "connection refused");
assert.equal(apiStatusDebounceSaves, 0);
assert.equal(apiStatusDebouncePlugin.getApiStatus("translation").state, "failed");
assert.equal(apiStatusDebouncePlugin.settingsDirty, true);
assert.ok(apiStatusDebouncePlugin.settingsDirtyTimer);
assert.equal(apiStatusDebouncePlugin.flushSettings(), true);
assert.equal(apiStatusDebounceSaves, 1);
assert.equal(apiStatusDebouncePlugin.settingsDirty, false);
apiStatusDebouncePlugin.setApiRuntimeStatus("translation", "failed", "failed", "connection refused");
assert.equal(apiStatusDebounceSaves, 1);
assert.equal(apiStatusDebouncePlugin.settingsDirty, false);
apiStatusDebouncePlugin.setApiRuntimeStatus("translation", "testing", "testing");
apiStatusDebouncePlugin.setApiRuntimeStatus("translation", "success", "success");
assert.equal(apiStatusDebounceSaves, 1);
assert.equal(apiStatusDebouncePlugin.settingsDirty, true);
assert.equal(apiStatusDebouncePlugin.flushSettings(), true);
assert.equal(apiStatusDebounceSaves, 2);
assert.equal(apiStatusDebouncePlugin.getApiStatus("translation").state, "success");
if (savedDocumentForSettingsDebounce === undefined) delete global.document;
else global.document = savedDocumentForSettingsDebounce;

const savedBdApiForUnavailableDataIo = global.BdApi;
const savedConsoleWarnForUnavailableDataIo = console.warn;
let unavailableDataIoWarnings = 0;
global.BdApi = { Data: {} };
console.warn = () => { unavailableDataIoWarnings++; };
const unavailableDataIoPlugin = new Plugin();
unavailableDataIoPlugin.settings.ui.diagnosticsEnabled = true;
assert.equal(unavailableDataIoPlugin.saveData("translationCache", {}), false);
assert.equal(unavailableDataIoWarnings, 1);
assert.ok(unavailableDataIoPlugin.diagnosticLogs.some(entry => entry.action === "data.io"));
clearTimeout(unavailableDataIoPlugin.diagnosticLogsDirtyTimer);
unavailableDataIoPlugin.diagnosticLogsDirtyTimer = null;
console.warn = savedConsoleWarnForUnavailableDataIo;
if (savedBdApiForUnavailableDataIo === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForUnavailableDataIo;

const savedBdApiForSettingsLoadFailure = global.BdApi;
const savedConsoleWarnForSettingsLoadFailure = console.warn;
let settingsLoadFailureWrites = 0;
global.BdApi = {
    Data: {
        load() { throw new Error("settings read failed"); },
        save(_pluginName, key) {
            if (key === "settings") settingsLoadFailureWrites++;
            return true;
        }
    }
};
console.warn = () => {};
const settingsLoadFailurePlugin = new Plugin();
settingsLoadFailurePlugin.settings.translation.apiKey = "in-memory-secret";
settingsLoadFailurePlugin.settings.translation.targetLanguage = "English";
assert.equal(settingsLoadFailurePlugin.loadSettings(), false);
assert.equal(settingsLoadFailurePlugin.settings.translation.apiKey, "in-memory-secret");
assert.equal(settingsLoadFailurePlugin.settings.translation.targetLanguage, "English");
assert.equal(settingsLoadFailureWrites, 0);
assert.equal(settingsLoadFailurePlugin.dataLoadFailures.has("settings"), true);
assert.equal(settingsLoadFailurePlugin.settingsLoadBlocked, true);
settingsLoadFailurePlugin.settings.translation.model = "must-not-persist";
assert.equal(settingsLoadFailurePlugin.saveSettings(), false);
assert.equal(settingsLoadFailureWrites, 0);
assert.equal(settingsLoadFailurePlugin.settingsDirty, true);
global.BdApi.Data.load = () => ({
    ui: { settingsVersion: 2 },
    translation: { apiKey: "stored-secret", targetLanguage: "\u6c49\u8bed" }
});
assert.equal(settingsLoadFailurePlugin.loadSettings(), true);
assert.equal(settingsLoadFailurePlugin.settingsLoadBlocked, false);
assert.equal(settingsLoadFailurePlugin.settingsDirty, false);
assert.equal(settingsLoadFailurePlugin.settings.translation.apiKey, "stored-secret");
assert.equal(settingsLoadFailurePlugin.settings.translation.model === "must-not-persist", false);
if (settingsLoadFailurePlugin.diagnosticLogsDirtyTimer) clearTimeout(settingsLoadFailurePlugin.diagnosticLogsDirtyTimer);
settingsLoadFailurePlugin.diagnosticLogsDirtyTimer = null;
console.warn = savedConsoleWarnForSettingsLoadFailure;
if (savedBdApiForSettingsLoadFailure === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForSettingsLoadFailure;

const savedBdApiForMissingDataIo = global.BdApi;
const savedConsoleWarnForMissingDataIo = console.warn;
let missingDataIoWarnings = 0;
delete global.BdApi;
console.warn = () => { missingDataIoWarnings++; };
const missingDataIoPlugin = new Plugin();
missingDataIoPlugin.settings.ui.diagnosticsEnabled = true;
assert.equal(missingDataIoPlugin.saveData("settings", {}), false);
missingDataIoPlugin.setTranslationCache("missing-bdapi-cache", "cached value");
missingDataIoPlugin.logDiagnostic("missing.bdapi", "dirty", { ok: true });
assert.equal(missingDataIoPlugin.flushTranslationCache({ retryOnError: false }), false);
assert.equal(missingDataIoPlugin.translationCache.get("missing-bdapi-cache"), "cached value");
assert.equal(missingDataIoPlugin.translationCacheDirty, true);
assert.equal(missingDataIoPlugin.flushDiagnosticLogs({ retryOnError: false }), false);
assert.equal(missingDataIoPlugin.diagnosticLogsDirty, true);
assert.ok(missingDataIoWarnings >= 3);
clearTimeout(missingDataIoPlugin.translationCacheDirtyTimer);
missingDataIoPlugin.translationCacheDirtyTimer = null;
clearTimeout(missingDataIoPlugin.diagnosticLogsDirtyTimer);
missingDataIoPlugin.diagnosticLogsDirtyTimer = null;
console.warn = savedConsoleWarnForMissingDataIo;
if (savedBdApiForMissingDataIo === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForMissingDataIo;

const savedBdApiForDiagnosticRetry = global.BdApi;
const savedConsoleWarnForDiagnosticRetry = console.warn;
const savedSetTimeoutForDiagnosticRetry = global.setTimeout;
const savedClearTimeoutForDiagnosticRetry = global.clearTimeout;
const diagnosticRetryDelays = [];
global.BdApi = { Data: { save() { throw new Error("diagnostic save failed"); } } };
console.warn = () => {};
global.setTimeout = (_callback, delay) => {
    diagnosticRetryDelays.push(delay);
    return { delay };
};
global.clearTimeout = () => {};
const diagnosticRetryPlugin = new Plugin();
diagnosticRetryPlugin.settings.ui.diagnosticsEnabled = true;
diagnosticRetryPlugin.logDiagnostic("diagnostic.retry", "start", { count: 1 });
diagnosticRetryPlugin.flushDiagnosticLogs();
assert.equal(diagnosticRetryDelays.at(-1), 30000);
diagnosticRetryDelays.length = 0;
diagnosticRetryPlugin.diagnosticLogsDirty = true;
diagnosticRetryPlugin.flushDiagnosticLogs({ retryOnError: false });
assert.deepEqual(diagnosticRetryDelays, []);
global.setTimeout = savedSetTimeoutForDiagnosticRetry;
global.clearTimeout = savedClearTimeoutForDiagnosticRetry;
console.warn = savedConsoleWarnForDiagnosticRetry;
if (savedBdApiForDiagnosticRetry === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForDiagnosticRetry;

const quickOnlyDiagnosticPlugin = new Plugin();
quickOnlyDiagnosticPlugin.showToast = () => {};
const savedConsoleInfoForQuickDiagnostics = console.info;
const savedConsoleWarnForQuickDiagnostics = console.warn;
let quickDiagnosticConsoleInfoCount = 0;
let quickDiagnosticConsoleWarnCount = 0;
console.info = () => { quickDiagnosticConsoleInfoCount++; };
console.warn = () => { quickDiagnosticConsoleWarnCount++; };
quickOnlyDiagnosticPlugin.logQuickSettingsDiagnostic("open.start", "start", { source: "panel" });
assert.equal(quickOnlyDiagnosticPlugin.diagnosticLogs.length, 0);
assert.equal(quickOnlyDiagnosticPlugin.quickSettingsDiagnosticLogs.length, 1);
assert.equal(quickDiagnosticConsoleInfoCount, 0);
assert.equal(quickDiagnosticConsoleWarnCount, 0);
quickOnlyDiagnosticPlugin.logQuickSettingsDiagnostic("open.error", "error", { source: "panel" });
assert.equal(quickDiagnosticConsoleWarnCount, 1);
quickOnlyDiagnosticPlugin.settings.ui.diagnosticsEnabled = true;
quickOnlyDiagnosticPlugin.logQuickSettingsDiagnostic("open.start", "start", { source: "panel" });
assert.equal(quickDiagnosticConsoleInfoCount, 1);
console.info = savedConsoleInfoForQuickDiagnostics;
console.warn = savedConsoleWarnForQuickDiagnostics;
const quickOnlyDiagnosticJson = JSON.parse(quickOnlyDiagnosticPlugin.serializeDiagnosticLogs("json"));
assert.equal(quickOnlyDiagnosticJson.logs.length, 1);
assert.equal(quickOnlyDiagnosticJson.quickSettings.length, 3);
quickOnlyDiagnosticPlugin.clearDiagnosticLogs();
quickOnlyDiagnosticPlugin.flushDiagnosticLogs();
assert.equal(quickOnlyDiagnosticPlugin.quickSettingsDiagnosticLogs.length, 0);

const diagnosticPersistPlugin = new Plugin();
diagnosticPersistPlugin.settings.ui.diagnosticsEnabled = true;
let persistedDiagnosticKey = "";
let persistedDiagnosticPayload = null;
diagnosticPersistPlugin.saveData = (key, value) => {
    persistedDiagnosticKey = key;
    persistedDiagnosticPayload = value;
    return true;
};
diagnosticPersistPlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "persisted-key", text: "secret text" });
diagnosticPersistPlugin.flushDiagnosticLogs();
assert.equal(persistedDiagnosticKey, "diagnosticLogs");
assert.equal(persistedDiagnosticPayload.version, 1);
assert.equal(persistedDiagnosticPayload.logs.length, 1);
assert.equal(persistedDiagnosticPayload.logs[0].meta.text, undefined);
const originalDiagnosticSanitizer = diagnosticPersistPlugin.sanitizeDiagnosticMeta;
diagnosticPersistPlugin.sanitizeDiagnosticMeta = () => { throw new Error("persisted diagnostics must reuse already-sanitized metadata"); };
assert.doesNotThrow(() => diagnosticPersistPlugin.createPersistedDiagnosticLogsPayload());
diagnosticPersistPlugin.sanitizeDiagnosticMeta = originalDiagnosticSanitizer;
const savedWindowForHeavyPersistence = global.window;
let diagnosticIdleCallback = null;
let cacheIdleCallback = null;
global.window = {
    ...(savedWindowForHeavyPersistence || {}),
    requestIdleCallback(callback, options) {
        if (!diagnosticIdleCallback) diagnosticIdleCallback = callback;
        else cacheIdleCallback = callback;
        assert.equal(options.timeout, 10000);
        return diagnosticIdleCallback === callback ? 71 : 72;
    },
    cancelIdleCallback() {}
};
const idlePersistencePlugin = new Plugin();
let diagnosticIdleRuns = 0;
idlePersistencePlugin.scheduleHeavyPersistenceIdle("diagnostics", () => { diagnosticIdleRuns++; });
assert.equal(typeof diagnosticIdleCallback, "function");
diagnosticIdleCallback({ didTimeout: false, timeRemaining: () => 20 });
assert.equal(diagnosticIdleRuns, 1);
let cacheIdleDefers = 0;
idlePersistencePlugin.scheduleTranslationCachePersist = delay => {
    assert.equal(delay, 1500);
    cacheIdleDefers++;
};
idlePersistencePlugin.scheduleHeavyPersistenceIdle("cache", () => { throw new Error("cache persistence should wait for a larger idle budget"); });
assert.equal(typeof cacheIdleCallback, "function");
cacheIdleCallback({ didTimeout: false, timeRemaining: () => 12 });
assert.equal(cacheIdleDefers, 1);
global.window = savedWindowForHeavyPersistence;
const diagnosticReloadPlugin = new Plugin();
diagnosticReloadPlugin.showToast = () => {};
diagnosticReloadPlugin.loadData = key => key === "diagnosticLogs" ? persistedDiagnosticPayload : null;
diagnosticReloadPlugin.loadDiagnosticLogs();
assert.equal(diagnosticReloadPlugin.diagnosticLogs.length, 1);
assert.equal(diagnosticReloadPlugin.diagnosticLogs[0].key, "persisted-key");
diagnosticReloadPlugin.saveData = (key, value) => {
    persistedDiagnosticKey = key;
    persistedDiagnosticPayload = value;
    return true;
};
diagnosticReloadPlugin.clearDiagnosticLogs();
diagnosticReloadPlugin.flushDiagnosticLogs();
assert.equal(persistedDiagnosticPayload.logs.length, 0);

const diagnosticClearFailurePlugin = new Plugin();
diagnosticClearFailurePlugin.settings.ui.diagnosticsEnabled = true;
diagnosticClearFailurePlugin.showToast = (message, type) => { diagnosticClearFailurePlugin.lastToastType = type; };
diagnosticClearFailurePlugin.logDiagnostic("diagnostic.clear", "before", { count: 1 });
clearTimeout(diagnosticClearFailurePlugin.diagnosticLogsDirtyTimer);
diagnosticClearFailurePlugin.diagnosticLogsDirtyTimer = null;
diagnosticClearFailurePlugin.saveData = () => false;
assert.equal(diagnosticClearFailurePlugin.clearDiagnosticLogs(), false);
assert.equal(diagnosticClearFailurePlugin.diagnosticLogs.length, 1);
assert.equal(diagnosticClearFailurePlugin.lastToastType, "error");
clearTimeout(diagnosticClearFailurePlugin.diagnosticLogsDirtyTimer);
diagnosticClearFailurePlugin.diagnosticLogsDirtyTimer = null;

const diagnosticMissCompressPlugin = new Plugin();
diagnosticMissCompressPlugin.settings.ui.diagnosticsEnabled = true;
let compressedDiagnosticPayload = null;
diagnosticMissCompressPlugin.saveData = (key, value) => {
    if (key === "diagnosticLogs") compressedDiagnosticPayload = value;
    return true;
};
diagnosticMissCompressPlugin.logDiagnostic("cache.lookup", "miss", { cacheHash: "miss-a", aliases: 3, size: 10 });
diagnosticMissCompressPlugin.logDiagnostic("cache.lookup", "miss", { cacheHash: "miss-b", aliases: 3, size: 10 });
assert.equal(diagnosticMissCompressPlugin.diagnosticLogs.length, 1);
assert.equal(diagnosticMissCompressPlugin.diagnosticLogs[0].count, 2);
diagnosticMissCompressPlugin.flushDiagnosticLogs();
assert.equal(compressedDiagnosticPayload.compressed, 1);
const diagnosticCompressedReloadPlugin = new Plugin();
diagnosticCompressedReloadPlugin.loadData = key => key === "diagnosticLogs" ? compressedDiagnosticPayload : null;
diagnosticCompressedReloadPlugin.loadDiagnosticLogs();
assert.equal(diagnosticCompressedReloadPlugin.diagnosticCompressedCount, 1);

const diagnosticLimitPlugin = new Plugin();
diagnosticLimitPlugin.settings.ui.diagnosticsEnabled = true;
for (let index = 0; index < 505; index++) {
    diagnosticLimitPlugin.logDiagnostic("auto.scan", "ok", { key: `diagnostic-${index}` });
}
assert.equal(diagnosticLimitPlugin.diagnosticLogs.length, 500);
assert.equal(diagnosticLimitPlugin.diagnosticLogs[0].key, "diagnostic-5");
assert.equal(diagnosticLimitPlugin.diagnosticLogs.at(-1).key, "diagnostic-504");
diagnosticLimitPlugin.flushDiagnosticLogs();
assert.equal(diagnosticLimitPlugin.diagnosticCompressedCount, 0);
const routineDiagnosticPlugin = new Plugin();
routineDiagnosticPlugin.settings.ui.diagnosticsEnabled = true;
routineDiagnosticPlugin.logDiagnostic("auto.message.state", "skipped", { key: "message-a", reasonCode: "not-eligible-language", messageState: "skipped", provider: "sakuraLocal", model: "local-model", mode: "auto" });
routineDiagnosticPlugin.logDiagnostic("auto.message.state", "skipped", { key: "message-b", reasonCode: "not-eligible-language", messageState: "skipped", provider: "sakuraLocal", model: "local-model", mode: "auto" });
assert.equal(routineDiagnosticPlugin.diagnosticLogs.length, 1);
assert.equal(routineDiagnosticPlugin.diagnosticLogs[0].count, 2);
clearTimeout(routineDiagnosticPlugin.diagnosticLogsDirtyTimer);
routineDiagnosticPlugin.diagnosticLogsDirtyTimer = null;
let disabledDiagnosticPayload = null;
routineDiagnosticPlugin.saveData = (key, value) => {
    if (key === "diagnosticLogs") disabledDiagnosticPayload = value;
    return true;
};
assert.equal(routineDiagnosticPlugin.disableDiagnosticLogging(), true);
assert.equal(routineDiagnosticPlugin.diagnosticLogs.length, 0);
assert.equal(disabledDiagnosticPayload.logs.length, 0);
const savedDocumentForMessageButtons = global.document;
const messageButtonCreated = [];
global.document = {
    createElement: tag => createFakeElement(tag, messageButtonCreated),
    querySelectorAll: () => []
};
const messageButtonPlugin = new Plugin();
messageButtonPlugin.settings.ui.messageButtonVisibility = "hover";
const messageButtonContent = {
    appended: null,
    querySelector() { return this.appended; },
    appendChild(child) {
        this.appended = child;
        child.parentElement = this;
        return child;
    }
};
messageButtonPlugin.getMessageContentElement = () => messageButtonContent;
messageButtonPlugin.getCachedElementText = () => "hello";
messageButtonPlugin.injectMessageButtons({ messageNodes: [{}] });
assert.equal(messageButtonContent.appended.className, "dait-message-button dait-message-button-hover-only");
messageButtonPlugin.settings.ui.messageButtonVisibility = "always";
messageButtonPlugin.injectMessageButtons({ messageNodes: [{}] });
assert.equal(messageButtonContent.appended.className, "dait-message-button");
const messageButtonCleanupPlugin = new Plugin();
let removedMessageButtons = 0;
global.document = {
    querySelectorAll: selector => selector === ".dait-message-button" ? [{ remove: () => { removedMessageButtons++; } }] : []
};
messageButtonCleanupPlugin.saveData = () => {};
messageButtonCleanupPlugin.setSetting("ui.injectMessageButtons", false);
assert.equal(removedMessageButtons, 1);
clearTimeout(messageButtonCleanupPlugin.scanTimer);
messageButtonCleanupPlugin.scanTimer = null;
global.document = savedDocumentForMessageButtons;
plugin.settings.translation.provider = "deepseek";
plugin.settings.ui.autoTranslateMessages = true;
plugin.settings.ui.autoTranslatePrefetch = true;
assert.equal(plugin.getAutoTranslateConcurrency(), 4);
assert.equal(plugin.getAutoTranslatePrefetchRange(), 5);
assert.equal(plugin.getAutoTranslateBatchSize(), 24);
assert.equal(plugin.getAutoTranslateQueueLimit(), 120);
const sakuraQueueLimitPlugin = new Plugin();
sakuraQueueLimitPlugin.settings.translation.provider = "sakuraLocal";
sakuraQueueLimitPlugin.settings.ui.autoTranslateMessages = true;
sakuraQueueLimitPlugin.settings.ui.autoTranslatePrefetch = true;
assert.equal(sakuraQueueLimitPlugin.getAutoTranslateConcurrency(), 4);
assert.equal(sakuraQueueLimitPlugin.getAutoTranslateBatchSize(), 4);
assert.equal(sakuraQueueLimitPlugin.getAutoTranslateQueueLimit(), 4);
// Local providers prefetch too; the scheduler only ever gives prefetch one spare slot.
assert.equal(sakuraQueueLimitPlugin.isAutoTranslationPrefetchConfigured(), true);
assert.equal(sakuraQueueLimitPlugin.getAutoTranslatePrefetchRange(), 5);
plugin.autoTranslationPrefetchInFlight = 1;
assert.equal(plugin.canStartAutoTranslationPrefetchRequest(4), false);
plugin.autoTranslationPrefetchInFlight = 0;
assert.equal(plugin.canStartAutoTranslationPrefetchRequest(4), true);
assert.equal(plugin.canStartAutoTranslationPrefetchRequest(1), false);
const polishContainerPlugin = new Plugin();
const unsafeTextbox = {
    parentElement: {},
    closest: () => ({ querySelector: () => null, querySelectorAll: () => [] })
};
assert.equal(polishContainerPlugin.getPolishButtonContainer(unsafeTextbox), null);
const safeToolbar = {
    className: "buttons-safe",
    contains: node => node === unsafeTextbox ? false : false,
    closest: () => null,
    querySelector: () => null
};
const safeRoot = {
    querySelector: selector => selector.includes("buttons") ? safeToolbar : null,
    querySelectorAll: () => []
};
const safeTextbox = {
    parentElement: safeRoot,
    closest: () => safeRoot
};
assert.equal(polishContainerPlugin.getPolishButtonContainer(safeTextbox), safeToolbar);
const wrongToolbar = {
    className: "buttonsWrong",
    contains: () => false,
    closest: () => null,
    querySelectorAll: () => []
};
const realToolbar = {
    className: "buttonsReal",
    contains: node => node === emojiButton,
    closest: () => null,
    querySelectorAll: () => [emojiButton]
};
const emojiButton = {
    isConnected: true,
    parentElement: realToolbar,
    contains: () => false,
    closest: () => null,
    getAttribute(name) { return name === "aria-label" ? "Select emoji" : ""; },
    title: ""
};
const multiToolbarRoot = {
    querySelector: selector => selector.includes("buttons") ? wrongToolbar : null,
    querySelectorAll(selector) {
        if (selector === "[class*='buttons']") return [wrongToolbar, realToolbar];
        if (selector === "button, [role='button']") return [emojiButton];
        return [];
    }
};
const multiToolbarTextbox = {
    parentElement: multiToolbarRoot,
    closest: () => multiToolbarRoot,
    contains: () => false
};
assert.equal(polishContainerPlugin.getPolishButtonContainer(multiToolbarTextbox), realToolbar);
const editorInnerToolbar = {
    className: "buttonsInsideEditor",
    contains: () => false,
    closest: selector => selector.includes("role='textbox'") ? {} : null,
    querySelectorAll: () => []
};
const editorRoot = {
    querySelector: () => editorInnerToolbar,
    querySelectorAll(selector) {
        if (selector === "[class*='buttons']") return [editorInnerToolbar];
        return [];
    }
};
assert.equal(polishContainerPlugin.getPolishButtonContainer({ parentElement: editorRoot, closest: () => editorRoot, contains: () => false }), null);
const savedBdApiForStyles = global.BdApi;
const savedDocumentForStyleFallback = global.document;
let injectedCss = "";
global.BdApi = { DOM: { addStyle: (id, css) => { injectedCss = css; } } };
plugin.injectStyles();
global.BdApi = savedBdApiForStyles;
let fallbackStyleNode = null;
let fallbackStyleRemoveCount = 0;
let fallbackStyleAppendCount = 0;
delete global.BdApi;
global.document = {
    createElement: tag => ({ tagName: String(tag || "").toUpperCase(), id: "", textContent: "" }),
    getElementById: id => id === "discord-ai-translator-style" && fallbackStyleNode
        ? { remove() { fallbackStyleRemoveCount++; fallbackStyleNode = null; } }
        : null,
    head: {
        appendChild(node) {
            fallbackStyleAppendCount++;
            fallbackStyleNode = node;
            return node;
        }
    }
};
assert.doesNotThrow(() => plugin.injectStyles());
assert.equal(fallbackStyleNode?.id, "discord-ai-translator-style");
assert.doesNotThrow(() => plugin.injectStyles());
assert.equal(fallbackStyleAppendCount, 2);
assert.equal(fallbackStyleRemoveCount, 1);
assert.doesNotThrow(() => plugin.patchMessageContextMenu());
const savedBdApiForContextMenu = global.BdApi;
const contextMenuPlugin = new Plugin();
contextMenuPlugin.settings.ui.injectMessageContextMenu = true;
contextMenuPlugin.settings.ui.historyBackfillEnabled = true;
let contextMenuPatchCallback = null;
let contextMenuTranslateCalled = false;
let contextMenuBackfillCalled = false;
global.BdApi = {
    ContextMenu: {
        patch(_matcher, callback) {
            contextMenuPatchCallback = callback;
            return () => {};
        },
        buildMenuChildren(groups) {
            return groups;
        }
    }
};
contextMenuPlugin.translateMessageFromContextTarget = () => { contextMenuTranslateCalled = true; };
contextMenuPlugin.runExplicitHistoryBackfillFromUi = (_button, options = {}) => {
    contextMenuBackfillCalled = options.source === "context-menu";
};
contextMenuPlugin.patchMessageContextMenu();
const contextMenuTree = { props: { children: [] } };
contextMenuPatchCallback(contextMenuTree, { target: { id: "target-message" } });
const contextMenuGroup = contextMenuTree.props.children[0];
assert.equal(contextMenuGroup.items.some(item => item.id === "dait-translate-message"), true);
assert.equal(contextMenuGroup.items.some(item => item.id === "dait-history-backfill"), true);
contextMenuGroup.items.find(item => item.id === "dait-translate-message").action();
contextMenuGroup.items.find(item => item.id === "dait-history-backfill").action();
assert.equal(contextMenuTranslateCalled, true);
assert.equal(contextMenuBackfillCalled, true);
global.BdApi = savedBdApiForContextMenu;
global.document = savedDocumentForStyleFallback;
if (savedBdApiForStyles === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForStyles;
let removeStyleCalled = false;
let domStyleRemoved = false;
global.BdApi = { DOM: { removeStyle: id => { if (id === "discord-ai-translator-style") removeStyleCalled = true; } } };
global.document = { getElementById: () => ({ remove() { domStyleRemoved = true; } }) };
plugin.removeStyles();
assert.equal(removeStyleCalled, true);
assert.equal(domStyleRemoved, true);
global.document = savedDocumentForStyleFallback;
if (savedBdApiForStyles === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForStyles;
// v0.4.0 theme follow-up (THEME-SPEC): the plugin's windows get one of two complete palettes from
// data-dait-panel-theme; no token of these windows reads a Discord variable, so differently themed parts of Discord
// cannot mix into them (the report: dark inputs and dark-grey text on a light window).
const panelDarkBlock = injectedCss.match(/\[data-dait-panel-theme="dark"\],\n:is\([^)]*\):not\(\[data-dait-panel-theme\]\) \{([\s\S]*?)\n\}/)?.[1] || "";
const panelLightBlock = injectedCss.match(/\n\[data-dait-panel-theme="light"\] \{([\s\S]*?)\n\}/)?.[1] || "";
const panelSharedBlock = injectedCss.match(/\n\.dait-settings,\n\.dait-quick-settings-modal-root,\n\.dait-quick-popover,\n\.dait-polish-result-panel,\n\.dait-input-action-menu,\n\.dait-dialog \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(panelDarkBlock, /--dait-bg: #2b2d31;[\s\S]*?--dait-rail: #232428;[\s\S]*?--dait-surface: #313338;[\s\S]*?--dait-input-bg: #1e1f22;[\s\S]*?--dait-text: #e3e5e8;[\s\S]*?--dait-heading: #f2f3f5;[\s\S]*?--dait-placeholder: #949ba4;[\s\S]*?--dait-brand: #4f5bd5;/);
assert.match(panelDarkBlock, /color-scheme: dark;/);
assert.match(panelLightBlock, /--dait-bg: #ffffff;[\s\S]*?--dait-rail: #f2f3f5;[\s\S]*?--dait-surface: #f6f7f8;[\s\S]*?--dait-input-bg: #ffffff;[\s\S]*?--dait-input-border: #c4c9ce;[\s\S]*?--dait-text: #2e3035;[\s\S]*?--dait-heading: #1f2124;[\s\S]*?--dait-placeholder: #6d6f78;/);
assert.match(panelLightBlock, /--dait-danger: #c42b2f;/);
assert.match(panelLightBlock, /color-scheme: light;/);
[panelDarkBlock, panelLightBlock, panelSharedBlock].forEach(block => {
    assert.ok(block.length > 0);
    assert.doesNotMatch(block, /var\(--(background|input|text|header|interactive|button|brand|status|border|focus|elevation|scrollbar)-/);
});
// One type scale: body 15 / 1.55, small 13, headings 16 / 18 / 20; 36 px controls; the shared control width stays.
assert.match(panelSharedBlock, /--dait-font-window: 18px;[\s\S]*?--dait-font-page: 20px;[\s\S]*?--dait-font-group: 16px;[\s\S]*?--dait-font-body: 15px;[\s\S]*?--dait-font-small: 13px;[\s\S]*?--dait-line: 1\.55;/);
assert.match(panelSharedBlock, /--dait-control-w: 240px;[\s\S]*?--dait-control-h: 36px;/);
// The v0.3.0 alias tokens and the per-theme Discord blocks of these windows are gone.
["--dait-card:", "--dait-muted-readable:", "--dait-disabled-text:", "--dait-text-muted:", "--dait-font-label:", "--dait-font-caption:", "--dait-font-chip:"].forEach(token => {
    assert.equal(injectedCss.includes(token), false, token);
});
["--dait-text:", "--dait-heading:", "--dait-input-bg:", "--dait-bg:"].forEach(token => {
    assert.equal(injectedCss.split(token).length - 1, 2, token + " once per palette");
});
assert.equal(/\.theme-light\.dait-(settings|quick-settings-modal-root|polish-result-panel|input-action-menu)/.test(injectedCss), false);
assert.equal(/\.dait-(settings|quick-settings-modal-root|quick-popover|polish-result-panel|input-action-menu)\[data-dait-discord-theme/.test(injectedCss), false);
// Chat error lines use Discord's readable danger text colour instead of the fixed brand red.
assert.match(injectedCss, /--dait-line-danger: var\(--text-danger, #fa777c\)/);
assert.match(injectedCss, /\.dait-translation-line\.dait-translation-error \{[\s\S]*?color: var\(--dait-line-danger\);/);
assert.equal(injectedCss.includes("opacity: 0.28"), false);
assert.equal(injectedCss.includes("background: transparent;\n    border: 1px solid transparent"), false);
assert.match(injectedCss, /@media \(prefers-reduced-motion: reduce\) \{\n    \.dait-settings,[\s\S]*?transition: none !important;/);
assert.match(injectedCss, /\.dait-settings :focus-visible,[\s\S]*?outline: 2px solid var\(--dait-focus\);/);
// Disabled controls fade as a whole (55 %) instead of turning a dim grey.
assert.match(injectedCss, /\.dait-settings-row input:disabled,[\s\S]*?\.dait-prompt-tools select:disabled \{\n    cursor: not-allowed;\n    opacity: 0\.55;\n\}/);
// BetterDiscord's modal becomes a moderate window: min(920px, 100vw - 48px) wide, min(760px, 100vh - 64px) high.
const settingsModalBlock = injectedCss.match(/\[data-dait-settings-modal="true"\] \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(settingsModalBlock, /max-height: min\(760px, calc\(100vh - 64px\)\) !important;/);
assert.match(settingsModalBlock, /width: min\(920px, calc\(100vw - 48px\)\) !important;/);
assert.equal(settingsModalBlock.includes("1280px"), false);
assert.match(injectedCss, /\.dait-settings \{[\s\S]*?height: calc\(min\(760px, 100vh - 64px, var\(--dait-host-max, 100vh\)\) - var\(--dait-host-chrome, 140px\)\);/);
assert.match(injectedCss, /\[data-dait-settings-modal="true"\] \{[\s\S]*?margin-left: auto !important;[\s\S]*?margin-right: auto !important;/);
assert.match(injectedCss, /\[data-dait-settings-modal-root="true"\] \{[\s\S]*?margin-bottom: clamp\(16px, 4vh, 32px\) !important;[\s\S]*?margin-top: clamp\(16px, 4vh, 32px\) !important;/);
assert.match(injectedCss, /\.dait-settings \{[\s\S]*?margin-left: auto;[\s\S]*?margin-right: auto;/);
// Thin standard scrollbars only where ::-webkit-scrollbar does not exist: in Chromium they would switch off the 8 px rules.
assert.match(injectedCss, /@supports not selector\(::-webkit-scrollbar\) \{\n    \[data-dait-settings-modal="true"\],[\s\S]*?\.dait-quick-settings-body,[\s\S]*?\.dait-settings-rail,[\s\S]*?\.dait-settings-content,[\s\S]*?\.dait-settings-row textarea[\s\S]*?scrollbar-width: thin;/);
assert.match(injectedCss, /\.dait-prompt-editor textarea,[\s\S]*?\.dait-polish-result-output \{[\s\S]*?scrollbar-width: thin;/);
assert.equal(injectedCss.includes(".dait-test-panel") || injectedCss.includes(".dait-test-output"), false);
assert.match(panelSharedBlock, /--dait-scrollbar-thumb: color-mix\(in srgb, var\(--dait-placeholder\) 55%, transparent\);/);
assert.match(injectedCss, /\[data-dait-settings-modal="true"\] \{\n    --dait-scrollbar-thumb: rgba\(128, 132, 142, 0\.45\);/);
assert.match(injectedCss, /\.dait-quick-settings-body::-webkit-scrollbar[\s\S]*?width: 8px;/);
assert.match(injectedCss, /\.dait-settings-row textarea::-webkit-scrollbar[\s\S]*?width: 8px;/);
assert.match(injectedCss, /\.dait-prompt-editor textarea::-webkit-scrollbar[\s\S]*?width: 8px;/);
assert.match(injectedCss, /\.dait-quick-settings-body::-webkit-scrollbar-thumb[\s\S]*?background: var\(--dait-scrollbar-thumb\);/);
assert.match(injectedCss, /\.dait-settings-row textarea::-webkit-scrollbar-thumb[\s\S]*?background: var\(--dait-scrollbar-thumb\);/);
assert.match(injectedCss, /\.dait-prompt-editor textarea::-webkit-scrollbar-thumb[\s\S]*?background: var\(--dait-scrollbar-thumb\);/);
assert.match(injectedCss, /\[data-dait-settings-modal="true"\]::-webkit-scrollbar-track[\s\S]*?background: var\(--dait-scrollbar-track\);/);
// Tab rail (184 px, with search) and a content pane that scrolls on its own; rows share one control width.
assert.match(injectedCss, /\.dait-settings \{[\s\S]*?--dait-rail-w: 184px;[\s\S]*?--dait-content-max: 680px;/);
assert.match(injectedCss, /\.dait-settings-body \{[\s\S]*?grid-template-columns: var\(--dait-rail-w\) minmax\(0, 1fr\);/);
assert.match(injectedCss, /\.dait-settings-row \{[\s\S]*?column-gap: var\(--dait-space-5\);[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto;/);
assert.match(injectedCss, /\.dait-row-control > select,\n\.dait-row-control > input:not\(\[type="checkbox"\]\),\n\.dait-row-control > \.dait-segmented,\n\.dait-row-control > \.dait-language-controls \{\n    width: var\(--dait-control-w\);/);
assert.match(injectedCss, /\.dait-settings input\.dait-switch \{[\s\S]*?height: 24px;[\s\S]*?width: 40px;/);
assert.match(injectedCss, /\.dait-segmented \{[\s\S]*?grid-auto-columns: minmax\(0, 1fr\);[\s\S]*?height: var\(--dait-control-h\);/);
// Labels and descriptions: the same size and colour, the label at 600.
assert.match(injectedCss, /\.dait-row-label \{\n    color: var\(--dait-text\);\n    font-size: var\(--dait-font-body\);\n    font-weight: 600;/);
assert.match(injectedCss, /\.dait-row-description \{\n    color: var\(--dait-text\);\n    font-size: var\(--dait-font-body\);\n    font-weight: 400;/);
assert.match(injectedCss, /\.dait-settings-rail \{[\s\S]*?overflow-y: auto;/);
assert.match(injectedCss, /\.dait-settings-content \{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
assert.match(injectedCss, /\.dait-settings-tab\[aria-selected="true"\] \{/);
assert.match(injectedCss, /\.dait-settings-danger-zone \.dait-settings-group-title \{/);
// The plugin's own settings window: a moderate window that the tabbed panel fills (one title bar, no footer);
// colours come from the shared tokens, with no per-theme palette copies.
const quickDialogBlock = injectedCss.match(/\.dait-quick-settings-dialog \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(quickDialogBlock, /width: min\(920px, calc\(100vw - 48px\)\);/);
assert.match(quickDialogBlock, /height: min\(760px, calc\(100vh - 64px\)\);/);
assert.match(quickDialogBlock, /background: var\(--dait-bg\);/);
assert.match(quickDialogBlock, /overflow: hidden;/);
assert.equal(injectedCss.includes("1280px"), false);
assert.match(injectedCss, /\.dait-quick-settings-modal-root \{[\s\S]*?background: var\(--dait-backdrop\);[\s\S]*?overflow: hidden;/);
assert.match(panelLightBlock, /--dait-backdrop: rgba\(0, 0, 0, 0\.36\);/);
assert.equal(/\.theme-(dark|darker|midnight)\.dait-quick-settings-modal-root/.test(injectedCss), false);
assert.equal(injectedCss.includes("--dait-quick-dialog-bg"), false);
const quickBodyBlock = injectedCss.match(/\.dait-quick-settings-body \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(quickBodyBlock, /min-height: 0;/);
assert.match(quickBodyBlock, /overflow-y: auto;/);
assert.equal(quickBodyBlock.includes("padding"), false);
assert.match(injectedCss, /\.dait-quick-settings-body > \.dait-settings \{[\s\S]*?flex: 1 1 auto;[\s\S]*?height: auto;[\s\S]*?min-height: 0;/);
["header", "footer", "title", "close"].forEach(part => assert.equal(injectedCss.includes(".dait-quick-settings-" + part + " {"), false, part));
assert.match(injectedCss, /\.dait-quick-settings-done \{[\s\S]*?background: var\(--dait-brand\);[\s\S]*?height: var\(--dait-control-h\);/);
// The v0.3.0 settings layout rules (sidebar, hero, nav, 2-column sections) and their modal width override are gone.
["dait-settings-sidebar", "dait-settings-layout", "dait-settings-hero", "dait-settings-nav", "dait-settings-mark", "dait-section-", "dait-api-key-row", "dait-api-controls", "dait-settings-row-wide"].forEach(name => {
    assert.equal(injectedCss.includes(name), false, name);
});
assert.equal(injectedCss.includes("@media (min-width: 760px)"), false);
assert.equal(injectedCss.includes("100vw - 28px"), false);
assert.equal(injectedCss.includes(".dait-quick-settings-rail {"), false);
assert.match(injectedCss, /\.dait-quick-settings-panel \{/);
assert.match(injectedCss, /\.theme-light\.dait-quick-settings-button,[\s\S]*?\.theme-light \.dait-quick-settings-button,[\s\S]*?\[data-dait-discord-theme="light"\] \.dait-quick-settings-button \{/);
assert.match(injectedCss, /\.theme-light \.dait-quick-settings-button,[\s\S]*?\[data-dait-discord-theme="light"\] \.dait-quick-settings-button \{[\s\S]*?--dait-quick-button-text: var\(--interactive-normal, var\(--text-secondary, #4f5660\)\);/);
assert.match(injectedCss, /\.dait-quick-settings-button\[data-dait-discord-theme="light"\],[\s\S]*?\[data-dait-discord-theme="light"\] \.dait-quick-settings-button \{/);
assert.match(injectedCss, /\.theme-dark\.dait-quick-settings-button,[\s\S]*?\.theme-darker\.dait-quick-settings-button,[\s\S]*?\.theme-midnight\.dait-quick-settings-button/);
assert.match(injectedCss, /\.theme-dark \.dait-quick-settings-button,[\s\S]*?\.theme-darker \.dait-quick-settings-button,[\s\S]*?\.theme-midnight \.dait-quick-settings-button/);
assert.match(injectedCss, /\.dait-quick-settings-button\[data-dait-discord-theme="dark"\],[\s\S]*?\.dait-quick-settings-button\[data-dait-discord-theme="darker"\],[\s\S]*?\.dait-quick-settings-button\[data-dait-discord-theme="midnight"\]/);
assert.match(injectedCss, /\[data-dait-discord-theme="dark"\] \.dait-quick-settings-button,[\s\S]*?\[data-dait-discord-theme="darker"\] \.dait-quick-settings-button,[\s\S]*?\[data-dait-discord-theme="midnight"\] \.dait-quick-settings-button/);
assert.match(injectedCss, /\.dait-quick-settings-button \{[\s\S]*?--dait-quick-button-bg:[\s\S]*?background: var\(--dait-quick-button-bg\);[\s\S]*?color: var\(--dait-quick-button-text\);/);
assert.match(injectedCss, /\.dait-quick-settings-button:hover,[\s\S]*?background: var\(--dait-quick-button-hover-bg\);[\s\S]*?color: var\(--dait-quick-button-hover-text\);/);
assert.match(injectedCss, /\.dait-quick-settings-error \{/);
// A narrow panel (BetterDiscord's own modal width) turns the tab rail into a scrolling row and stacks rows.
assert.match(injectedCss, /@container dait-settings \(max-width: 760px\) \{[\s\S]*?\.dait-settings-body \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
assert.match(injectedCss, /@container dait-settings \(max-width: 760px\) \{[\s\S]*?\.dait-settings-tabs \{[\s\S]*?flex-direction: row;[\s\S]*?overflow-x: auto;/);
assert.match(injectedCss, /@container dait-settings \(max-width: 600px\) \{[\s\S]*?\.dait-settings-row:not\(\.dait-settings-row-switch\) \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
assert.match(injectedCss, /\.dait-message-button \{[\s\S]*?border: 1px solid color-mix/);
assert.match(injectedCss, /\.theme-light\.dait-polish-button,[\s\S]*?\.dait-polish-button\[data-dait-discord-theme="light"\]/);
assert.match(injectedCss, /\.theme-dark\.dait-polish-button,[\s\S]*?\.theme-darker\.dait-polish-button,[\s\S]*?\.theme-midnight\.dait-polish-button/);
assert.match(injectedCss, /\.theme-dark\.dait-polish-button:hover,[\s\S]*?\.theme-midnight\.dait-public-bilingual-button:focus-visible,[\s\S]*?background: color-mix\(in srgb, var\(--brand-500, #5865f2\) 20%, rgba\(255, 255, 255, 0\.08\)\);/);
assert.match(injectedCss, /\.theme-light\.dait-message-button,[\s\S]*?\.dait-message-button\[data-dait-discord-theme="light"\]/);
assert.match(injectedCss, /\.theme-dark\.dait-message-button,[\s\S]*?\.theme-darker\.dait-message-button,[\s\S]*?\.theme-midnight\.dait-message-button/);
assert.match(injectedCss, /\.dait-message-button\.dait-message-button-hover-only \{/);
assert.match(injectedCss, /\.dait-message-button\.dait-message-button-hover-only \{[\s\S]*?pointer-events: none;/);
assert.match(injectedCss, /\[class\*="messageContent"\]:hover > \.dait-message-button[\s\S]*?pointer-events: auto;/);
assert.match(injectedCss, /\[class\*="messageContent"\]:hover \.dait-message-button[\s\S]*?pointer-events: auto;/);
assert.match(injectedCss, /\[class\*="markup"\]:hover \.dait-message-button[\s\S]*?pointer-events: auto;/);
assert.match(injectedCss, /\[id\^="chat-messages-"\]:hover \.dait-message-button[\s\S]*?pointer-events: auto;/);
assert.match(injectedCss, /\.dait-translation-line \{[\s\S]*?overflow-anchor: none;/);
assert.match(injectedCss, /\.dait-polish-result-panel \{/);
// The polish result panel reads the shared tokens instead of four per-theme colour blocks.
assert.match(injectedCss, /\.dait-polish-result-panel \{[\s\S]*?background: var\(--dait-surface\);[\s\S]*?border: 1px solid var\(--dait-divider\);[\s\S]*?box-shadow: var\(--dait-shadow\);[\s\S]*?color: var\(--dait-text\);/);
assert.match(injectedCss, /\.dait-polish-result-output \{[\s\S]*?background: var\(--dait-input-bg\);[\s\S]*?color: var\(--dait-text\);/);
assert.equal(/\.theme-(dark|darker|midnight)\.dait-polish-result-panel/.test(injectedCss), false);
assert.equal(/\[data-dait-discord-theme="(light|darker|midnight)"\] \.dait-polish-result-output/.test(injectedCss), false);
assert.match(injectedCss, /\.dait-polish-result-output \{/);
assert.match(injectedCss, /\.dait-polish-result-action\.primary \{/);
assert.match(injectedCss, /\.dait-polish-restore-control \{/);
assert.match(injectedCss, /\.theme-light\.dait-polish-restore-control,[\s\S]*?\.dait-polish-restore-control\[data-dait-discord-theme="light"\]/);
assert.match(injectedCss, /\.theme-dark\.dait-polish-restore-control,[\s\S]*?\.dait-polish-restore-control\[data-dait-discord-theme="dark"\]/);
const maskedRule = injectedCss.match(/\.dait-translation-line\.dait-translation-masked \{([\s\S]*?)\}/)?.[1] || "";
assert.equal(maskedRule.includes("max-height"), false);
assert.equal(maskedRule.includes("overflow: hidden"), false);
assert.equal(maskedRule.includes("min-width: 164px"), false);
assert.equal(maskedRule.includes("width: fit-content"), true);
assert.match(injectedCss, /\.dait-translation-line\.dait-translation-masked \.dait-translation-text::before/);
assert.match(injectedCss, /\.dait-input-action-group \{[\s\S]*?max-width: min\(188px, 36vw\);/);
assert.match(injectedCss, /\.dait-polish-button,\n\.dait-public-bilingual-button,\n\.dait-polish-restore-button,\n\.dait-input-action-menu-button \{[\s\S]*?flex: 0 0 auto;[\s\S]*?max-width: 74px;[\s\S]*?position: static;/);
assert.match(injectedCss, /\.dait-input-action-group-dual \.dait-polish-button,[\s\S]*?\.dait-input-action-group-dual \.dait-polish-restore-button \{[\s\S]*?max-width: 44px;/);
assert.match(injectedCss, /\.dait-input-action-group\[data-dait-density="compact"\] \{[\s\S]*?max-width: 116px;/);
assert.match(injectedCss, /\.dait-input-action-group\[data-dait-density="minimal"\] \{[\s\S]*?max-width: 34px;/);
assert.match(injectedCss, /\.dait-input-action-menu \{[\s\S]*?position: fixed;/);
assert.match(injectedCss, /\.dait-public-bilingual-button \{/);
const scrollStabilityPlugin = new Plugin();
const savedComputedStyleForScrollStability = global.getComputedStyle;
const savedDocumentForScrollStability = global.document;
let scrollStableTop = 120;
const scrollStableScroller = {
    nodeType: 1,
    parentElement: null,
    scrollTop: 300,
    scrollHeight: 3000,
    clientHeight: 600
};
const scrollStableContent = {
    isConnected: true,
    parentElement: scrollStableScroller,
    getBoundingClientRect: () => ({ top: scrollStableTop, bottom: scrollStableTop + 20, width: 100, height: 20 })
};
global.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });
global.document = { scrollingElement: null, documentElement: null };
scrollStabilityPlugin.withTranslationScrollStability(scrollStableContent, () => {
    scrollStableTop += 28;
});
assert.equal(scrollStableScroller.scrollTop, 328);
global.document = savedDocumentForScrollStability;
global.getComputedStyle = savedComputedStyleForScrollStability;

const pausedScrollStabilityPlugin = new Plugin();
pausedScrollStabilityPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
const savedComputedStyleForPausedScrollStability = global.getComputedStyle;
const savedDocumentForPausedScrollStability = global.document;
let pausedScrollStableTop = 120;
const pausedScrollStableScroller = {
    nodeType: 1,
    parentElement: null,
    scrollTop: 300,
    scrollHeight: 3000,
    clientHeight: 600
};
const pausedScrollStableContent = {
    isConnected: true,
    parentElement: pausedScrollStableScroller,
    getBoundingClientRect: () => ({ top: pausedScrollStableTop, bottom: pausedScrollStableTop + 20, width: 100, height: 20 })
};
global.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });
global.document = { scrollingElement: null, documentElement: null };
pausedScrollStabilityPlugin.withTranslationScrollStability(pausedScrollStableContent, () => {
    pausedScrollStableTop += 28;
});
assert.equal(pausedScrollStableScroller.scrollTop, 300);
global.document = savedDocumentForPausedScrollStability;
global.getComputedStyle = savedComputedStyleForPausedScrollStability;

const adjustedScrollStabilityPlugin = new Plugin();
const savedComputedStyleForAdjustedScrollStability = global.getComputedStyle;
const savedDocumentForAdjustedScrollStability = global.document;
let adjustedScrollStableTop = 120;
const adjustedScrollStableScroller = {
    nodeType: 1,
    parentElement: null,
    scrollTop: 300,
    scrollHeight: 3000,
    clientHeight: 600
};
const adjustedScrollStableContent = {
    isConnected: true,
    parentElement: adjustedScrollStableScroller,
    getBoundingClientRect: () => ({ top: adjustedScrollStableTop, bottom: adjustedScrollStableTop + 20, width: 100, height: 20 })
};
global.getComputedStyle = () => ({ overflowY: "auto", overflow: "auto" });
global.document = { scrollingElement: null, documentElement: null };
adjustedScrollStabilityPlugin.withTranslationScrollStability(adjustedScrollStableContent, () => {
    adjustedScrollStableTop += 28;
    adjustedScrollStableScroller.scrollTop = 340;
});
assert.equal(adjustedScrollStableScroller.scrollTop, 340);
global.document = savedDocumentForAdjustedScrollStability;
global.getComputedStyle = savedComputedStyleForAdjustedScrollStability;

const renderQueuePlugin = new Plugin();
const savedWindowForRenderQueue = global.window;
const renderQueueCallbacks = [];
global.window = {
    requestAnimationFrame(callback) {
        renderQueueCallbacks.push(callback);
        return renderQueueCallbacks.length;
    },
    cancelAnimationFrame() {}
};
let renderQueueRuns = 0;
for (let index = 0; index < 5; index++) {
    renderQueuePlugin.queueAutoTranslationRenderTask({
        key: `render-${index}`,
        target: {},
        priority: index,
        run: () => { renderQueueRuns++; }
    });
}
assert.equal(renderQueueCallbacks.length, 1);
renderQueueCallbacks.shift()();
assert.equal(renderQueueRuns, 3);
assert.equal(renderQueuePlugin.autoTranslationRenderQueue.length, 2);
assert.equal(renderQueueCallbacks.length, 1);
renderQueueCallbacks.shift()();
assert.equal(renderQueueRuns, 5);
assert.equal(renderQueuePlugin.autoTranslationRenderQueue.length, 0);
global.window = savedWindowForRenderQueue;

const renderQueuePriorityPlugin = new Plugin();
const savedWindowForRenderQueuePriority = global.window;
const renderQueuePriorityCallbacks = [];
global.window = {
    requestAnimationFrame(callback) {
        renderQueuePriorityCallbacks.push(callback);
        return renderQueuePriorityCallbacks.length;
    },
    cancelAnimationFrame() {}
};
const renderQueuePriorityOrder = [];
[4, 0, 3, 1, 2].forEach(priority => {
    renderQueuePriorityPlugin.queueAutoTranslationRenderTask({
        key: `render-priority-${priority}`,
        target: {},
        priority,
        run: () => { renderQueuePriorityOrder.push(priority); }
    });
});
renderQueuePriorityCallbacks.shift()();
assert.deepEqual(renderQueuePriorityOrder, [0, 1, 2]);
renderQueuePriorityCallbacks.shift()();
assert.deepEqual(renderQueuePriorityOrder, [0, 1, 2, 3, 4]);
global.window = savedWindowForRenderQueuePriority;

const renderQueueHeavyPlugin = new Plugin();
const savedWindowForRenderQueueHeavy = global.window;
const renderQueueHeavyCallbacks = [];
global.window = {
    requestAnimationFrame(callback) {
        renderQueueHeavyCallbacks.push(callback);
        return renderQueueHeavyCallbacks.length;
    },
    cancelAnimationFrame() {}
};
const renderQueueHeavyRuns = [];
[
    { key: "heavy-short-a", priority: 0, text: "short a" },
    { key: "heavy-long", priority: 1, text: "long ".repeat(120) },
    { key: "heavy-short-b", priority: 2, text: "short b" }
].forEach(item => {
    renderQueueHeavyPlugin.queueAutoTranslationRenderTask({
        key: item.key,
        target: { text: item.text },
        translated: item.text,
        priority: item.priority,
        run: () => { renderQueueHeavyRuns.push(item.key); }
    });
});
renderQueueHeavyCallbacks.shift()();
assert.deepEqual(renderQueueHeavyRuns, ["heavy-short-a"]);
assert.equal(renderQueueHeavyPlugin.autoTranslationRenderQueue.length, 2);
renderQueueHeavyCallbacks.shift()();
assert.deepEqual(renderQueueHeavyRuns, ["heavy-short-a", "heavy-long"]);
assert.equal(renderQueueHeavyPlugin.autoTranslationRenderQueue.length, 1);
renderQueueHeavyCallbacks.shift()();
assert.deepEqual(renderQueueHeavyRuns, ["heavy-short-a", "heavy-long", "heavy-short-b"]);
global.window = savedWindowForRenderQueueHeavy;

const renderQueueDedupePlugin = new Plugin();
const savedWindowForRenderQueueDedupe = global.window;
const renderQueueDedupeCallbacks = [];
global.window = {
    requestAnimationFrame(callback) {
        renderQueueDedupeCallbacks.push(callback);
        return renderQueueDedupeCallbacks.length;
    },
    cancelAnimationFrame() {}
};
const renderQueueDedupeRuns = [];
renderQueueDedupePlugin.queueAutoTranslationRenderTask({
    key: "render-dedupe",
    target: {},
    priority: 9,
    run: () => { renderQueueDedupeRuns.push("old"); }
});
renderQueueDedupePlugin.queueAutoTranslationRenderTask({
    key: "render-dedupe",
    target: {},
    priority: 1,
    run: () => { renderQueueDedupeRuns.push("new"); }
});
assert.equal(renderQueueDedupePlugin.autoTranslationRenderQueue.length, 1);
assert.equal(renderQueueDedupePlugin.autoTranslationRenderQueuedTasks.size, 1);
renderQueueDedupeCallbacks.shift()();
assert.deepEqual(renderQueueDedupeRuns, ["new"]);
assert.equal(renderQueueDedupePlugin.autoTranslationRenderQueuedTasks.size, 0);
global.window = savedWindowForRenderQueueDedupe;

const renderPendingActivePlugin = new Plugin();
const savedWindowForRenderPendingActive = global.window;
const renderPendingActiveCallbacks = [];
global.window = {
    requestAnimationFrame(callback) {
        renderPendingActiveCallbacks.push(callback);
        return renderPendingActiveCallbacks.length;
    },
    cancelAnimationFrame() {}
};
let renderPendingActiveRuns = 0;
renderPendingActivePlugin.isStarted = true;
renderPendingActivePlugin.queueAutoTranslationRenderTask({
    key: "render-pending-active",
    cacheKey: "render-pending-cache-key",
    target: {},
    run: () => { renderPendingActiveRuns++; }
});
assert.equal(renderPendingActivePlugin.hasActiveAutoTranslationKey("render-pending-cache-key"), true);
assert.equal(renderPendingActivePlugin.autoTranslationRenderPendingKeys.has("render-pending-cache-key"), true);
renderPendingActiveCallbacks.shift()();
assert.equal(renderPendingActiveRuns, 1);
assert.equal(renderPendingActivePlugin.autoTranslationRenderPendingKeys.has("render-pending-cache-key"), false);
assert.equal(renderPendingActivePlugin.hasActiveAutoTranslationKey("render-pending-cache-key"), false);
global.window = savedWindowForRenderPendingActive;

const renderPendingScanPlugin = new Plugin();
const savedWindowForRenderPendingScan = global.window;
const savedDocumentForRenderPendingScan = global.document;
const renderPendingScanCallbacks = [];
global.window = {
    innerHeight: 800,
    requestAnimationFrame(callback) {
        renderPendingScanCallbacks.push(callback);
        return renderPendingScanCallbacks.length;
    },
    cancelAnimationFrame() {}
};
global.document = {
    documentElement: { clientHeight: 800, clientWidth: 1200 }
};
renderPendingScanPlugin.isStarted = true;
renderPendingScanPlugin.settings.translation.enabled = true;
renderPendingScanPlugin.settings.translation.apiKey = "sk-test";
renderPendingScanPlugin.settings.translation.targetLanguage = "Chinese";
renderPendingScanPlugin.settings.ui.autoTranslateMessages = true;
renderPendingScanPlugin.queueScan = () => {};
renderPendingScanPlugin.isElementVisibleInViewport = () => true;
renderPendingScanPlugin.hasCurrentTranslationLine = () => false;
renderPendingScanPlugin.getMessageContentElement = message => message.content;
renderPendingScanPlugin.getCachedElementText = content => content.text;
renderPendingScanPlugin.getElementText = content => content.text;
renderPendingScanPlugin.getMessageIdentity = message => `render-pending-scan:${message.id}`;
renderPendingScanPlugin.getAutoTranslationOutputValidationResult = () => ({
    quality: "partial",
    reasonCode: "undertranslated",
    renderable: true,
    cacheable: false,
    shouldRepair: true,
    targetLanguageRatio: 0.4,
    residualSourceRatio: 0.2,
    sameAsSource: false,
    refusal: false
});
renderPendingScanPlugin.renderTranslation = () => {};
renderPendingScanPlugin.drainAutoTranslationQueue = () => {};
const renderPendingScanMessage = {
    id: "same",
    isConnected: true,
    getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 10, right: 300, width: 290, height: 40 }),
    content: {
        dataset: {},
        isConnected: true,
        text: "render pending source",
        getBoundingClientRect: () => ({ top: 100, bottom: 140, left: 10, right: 300, width: 290, height: 40 })
    }
};
const renderPendingScanOptions = renderPendingScanPlugin.withMessageIdentity(
    renderPendingScanPlugin.getAutoTranslationOptions(),
    renderPendingScanMessage,
    renderPendingScanMessage.content,
    "render pending source"
);
const renderPendingScanCacheKey = renderPendingScanPlugin.getTranslationCacheKey("render pending source", renderPendingScanOptions);
const renderPendingScanItem = {
    messageNode: renderPendingScanMessage,
    content: renderPendingScanMessage.content,
    text: "render pending source",
    cacheKey: renderPendingScanCacheKey,
    requestOptions: renderPendingScanOptions
};
renderPendingScanPlugin.addAutoTranslationPendingTarget(renderPendingScanCacheKey, renderPendingScanItem);
renderPendingScanPlugin.renderAutoTranslationResult(renderPendingScanItem, "部分译文");
assert.equal(renderPendingScanPlugin.autoTranslationRenderPendingKeys.has(renderPendingScanCacheKey), true);
assert.equal(renderPendingScanPlugin.autoTranslationQueue.length, 0);
renderPendingScanPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [renderPendingScanMessage],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(renderPendingScanPlugin.autoTranslationQueue.length, 0);
assert.equal(renderPendingScanPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0].reasonCode, "dedupe-active");
global.window = savedWindowForRenderPendingScan;
global.document = savedDocumentForRenderPendingScan;

const recentRenderDecisionPlugin = new Plugin();
recentRenderDecisionPlugin.isStarted = true;
recentRenderDecisionPlugin.settings.translation.enabled = true;
recentRenderDecisionPlugin.settings.translation.apiKey = "sk-test";
recentRenderDecisionPlugin.settings.translation.targetLanguage = "Chinese";
recentRenderDecisionPlugin.settings.ui.autoTranslateMessages = true;
recentRenderDecisionPlugin.isElementVisibleInViewport = () => true;
recentRenderDecisionPlugin.hasCurrentTranslationLine = () => false;
recentRenderDecisionPlugin.getMessageIdentity = () => "recent-render-identity";
const recentRenderMessage = { isConnected: true, contains: () => true };
const recentRenderContent = { dataset: {}, isConnected: true, text: "recent render source", closest: () => recentRenderMessage };
const recentRenderCandidate = {
    messageNode: recentRenderMessage,
    content: recentRenderContent,
    text: "recent render source",
    targetKind: "message"
};
const recentRenderOptions = recentRenderDecisionPlugin.withAutoTranslationCandidateIdentity(
    recentRenderDecisionPlugin.getAutoTranslationRequestOptionsForText("recent render source", recentRenderDecisionPlugin.getAutoTranslationOptions()),
    recentRenderCandidate
);
const recentRenderCacheKey = recentRenderDecisionPlugin.getTranslationCacheKey("recent render source", recentRenderOptions);
recentRenderDecisionPlugin.rememberRecentAutoTranslationRender(recentRenderCacheKey, "recent render source", recentRenderOptions, {
    validationQuality: "partial",
    validationReason: "undertranslated"
});
const recentRenderDecision = recentRenderDecisionPlugin.evaluateAutoTranslationCandidate(recentRenderCandidate, {
    requestOptions: recentRenderDecisionPlugin.getAutoTranslationOptions(),
    now: Date.now()
});
assert.equal(recentRenderDecision.action, "skip");
assert.equal(recentRenderDecision.reasonCode, "recent-render-present");
assert.equal(recentRenderDecisionPlugin.autoTranslationQueue.length, 0);
// Discord rebuilt the message and dropped its line: a cached translation is drawn again
// despite the recent render, still without a new request.
recentRenderDecisionPlugin.setTranslationCache(recentRenderCacheKey, "最近渲染的译文");
const recentRenderCachedDecision = recentRenderDecisionPlugin.evaluateAutoTranslationCandidate(recentRenderCandidate, {
    requestOptions: recentRenderDecisionPlugin.getAutoTranslationOptions(),
    now: Date.now()
});
assert.equal(recentRenderCachedDecision.action, "render-cache");
assert.equal(recentRenderCachedDecision.cachedTranslation, "最近渲染的译文");
assert.equal(recentRenderDecisionPlugin.autoTranslationQueue.length, 0);

const renderQueueBudgetPlugin = new Plugin();
const savedWindowForRenderQueueBudget = global.window;
const savedDateNowForRenderQueueBudget = Date.now;
const renderQueueBudgetCallbacks = [];
let renderQueueBudgetNow = 1000;
Date.now = () => renderQueueBudgetNow;
global.window = {
    requestAnimationFrame(callback) {
        renderQueueBudgetCallbacks.push(callback);
        return renderQueueBudgetCallbacks.length;
    },
    cancelAnimationFrame() {}
};
const renderQueueBudgetRuns = [];
["budget-a", "budget-b", "budget-c"].forEach((key, priority) => {
    renderQueueBudgetPlugin.queueAutoTranslationRenderTask({
        key,
        target: {},
        priority,
        run: () => {
            renderQueueBudgetRuns.push(key);
            renderQueueBudgetNow += 10;
        }
    });
});
renderQueueBudgetCallbacks.shift()();
assert.deepEqual(renderQueueBudgetRuns, ["budget-a"]);
assert.equal(renderQueueBudgetPlugin.autoTranslationRenderQueue.length, 2);
renderQueueBudgetCallbacks.shift()();
assert.deepEqual(renderQueueBudgetRuns, ["budget-a", "budget-b"]);
Date.now = savedDateNowForRenderQueueBudget;
global.window = savedWindowForRenderQueueBudget;

const inputBusyRenderPlugin = new Plugin();
const savedSetTimeoutForInputBusyRender = global.setTimeout;
const savedClearTimeoutForInputBusyRender = global.clearTimeout;
let inputBusyRenderDelay = 0;
global.setTimeout = (callback, delay) => {
    inputBusyRenderDelay = delay;
    return "input-busy-render-timer";
};
global.clearTimeout = () => {};
let inputBusyRenderRan = false;
inputBusyRenderPlugin.isStarted = true;
inputBusyRenderPlugin.markInputComposerBusy(220);
inputBusyRenderPlugin.autoTranslationRenderQueue.push({
    key: "input-busy-render",
    target: {},
    run: () => { inputBusyRenderRan = true; }
});
inputBusyRenderPlugin.processAutoTranslationRenderQueue();
assert.equal(inputBusyRenderRan, false);
assert.equal(inputBusyRenderPlugin.autoTranslationRenderTimer, "input-busy-render-timer");
assert.ok(inputBusyRenderDelay >= 200);
inputBusyRenderPlugin.autoTranslationRenderTimer = null;
global.setTimeout = savedSetTimeoutForInputBusyRender;
global.clearTimeout = savedClearTimeoutForInputBusyRender;

const renderQueueReschedulePlugin = new Plugin();
const savedSetTimeoutForRenderQueueReschedule = global.setTimeout;
const savedClearTimeoutForRenderQueueReschedule = global.clearTimeout;
const savedDateNowForRenderQueueReschedule = Date.now;
const renderQueueRescheduleDelays = [];
const renderQueueRescheduleCleared = [];
let renderQueueRescheduleNow = 1000;
Date.now = () => renderQueueRescheduleNow;
global.setTimeout = (_callback, delay) => {
    renderQueueRescheduleDelays.push(delay);
    return `render-reschedule-${renderQueueRescheduleDelays.length}`;
};
global.clearTimeout = timer => { renderQueueRescheduleCleared.push(timer); };
renderQueueReschedulePlugin.autoTranslationRenderQueue.push({
    key: "render-reschedule",
    target: {},
    run: () => {}
});
renderQueueReschedulePlugin.scheduleAutoTranslationRenderQueue(1000);
assert.equal(renderQueueReschedulePlugin.autoTranslationRenderTimer, "render-reschedule-1");
assert.equal(renderQueueReschedulePlugin.autoTranslationRenderDueAt, 2000);
renderQueueReschedulePlugin.scheduleAutoTranslationRenderQueue(120);
assert.equal(renderQueueReschedulePlugin.autoTranslationRenderTimer, "render-reschedule-2");
assert.equal(renderQueueReschedulePlugin.autoTranslationRenderDueAt, 1120);
assert.deepEqual(renderQueueRescheduleCleared, ["render-reschedule-1"]);
renderQueueReschedulePlugin.scheduleAutoTranslationRenderQueue(300);
assert.equal(renderQueueReschedulePlugin.autoTranslationRenderTimer, "render-reschedule-2");
assert.deepEqual(renderQueueRescheduleDelays, [1000, 120]);
Date.now = savedDateNowForRenderQueueReschedule;
global.setTimeout = savedSetTimeoutForRenderQueueReschedule;
global.clearTimeout = savedClearTimeoutForRenderQueueReschedule;
renderQueueReschedulePlugin.autoTranslationRenderTimer = null;
renderQueueReschedulePlugin.autoTranslationRenderDueAt = 0;

const inputBusyScanPlugin = new Plugin();
inputBusyScanPlugin.settings.ui.injectInputButton = true;
inputBusyScanPlugin.isDiscordMediaViewerQuiet = () => false;
inputBusyScanPlugin.isDiscordMediaViewerOpen = () => false;
inputBusyScanPlugin.isDiscordSettingsSurfaceOpen = () => false;
inputBusyScanPlugin.trackAutoTranslationRouteChange = () => false;
inputBusyScanPlugin.isAutoTranslationRenderPaused = () => false;
inputBusyScanPlugin.injectQuickSettingsButtons = () => {};
inputBusyScanPlugin.createScanContext = () => ({ messageNodes: [] });
inputBusyScanPlugin.reconcileTranslationLines = () => {};
inputBusyScanPlugin.injectMessageButtons = () => {};
inputBusyScanPlugin.queueAutoTranslateVisibleMessages = () => {};
let inputBusyScanInjected = 0;
let inputBusyScanDelay = 0;
inputBusyScanPlugin.injectInputButtons = () => { inputBusyScanInjected++; };
inputBusyScanPlugin.queueInputButtonScan = options => { inputBusyScanDelay = Number(options?.delayMs || 0); };
const savedDocumentForInputBusyScan = global.document;
global.document = { querySelectorAll: () => [], documentElement: { clientHeight: 800, clientWidth: 1200 } };
inputBusyScanPlugin.markInputComposerBusy(220);
inputBusyScanPlugin.scanDiscordUi();
if (savedDocumentForInputBusyScan === undefined) delete global.document;
else global.document = savedDocumentForInputBusyScan;
assert.equal(inputBusyScanInjected, 0);
assert.ok(inputBusyScanDelay >= 200);

const sourceStyleMutationPlugin = new Plugin();
const sourceStyleElement = createFakeElement("div", []);
sourceStyleMutationPlugin.markTranslationSourceStyleMutation(sourceStyleElement);
assert.equal(sourceStyleMutationPlugin.isOwnMutation({
    type: "attributes",
    attributeName: "style",
    target: sourceStyleElement
}), true);
assert.equal(sourceStyleMutationPlugin.isOwnMutation({
    type: "attributes",
    attributeName: "style",
    target: sourceStyleElement
}), false);
assert.equal(plugin.getTextFingerprint("same text"), plugin.getTextFingerprint("same text"));
assert.notEqual(plugin.getTextFingerprint("same text"), plugin.getTextFingerprint("changed text"));
const savedWindowForIdentity = global.window;
global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" } };
const identityHash = plugin.getTextFingerprint("hello");
assert.equal(plugin.getMessageIdentity({
    nodeType: 1,
    getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-333333333333333333" : "",
    parentElement: null,
    querySelector: () => null
}, { closest: () => null }, "hello"), `message:111111111111111111:222222222222222222:333333333333333333:message:${identityHash}`);
global.window = savedWindowForIdentity;
const fallbackNeighborMessage = {
    nodeType: 1,
    getAttribute: attribute => attribute === "data-list-item-id" ? "message-row-fallback" : "",
    parentElement: null,
    previousElementSibling: {
        nodeType: 1,
        getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-444444444444444444" : "",
        parentElement: null,
        querySelector: () => null
    },
    nextElementSibling: null,
    querySelector: selector => selector.includes("time") ? null : null
};
const fallbackIdentity = plugin.getMessageIdentity(fallbackNeighborMessage, { closest: () => null }, "same short text");
assert.match(fallbackIdentity, /^fallback:/);
assert.equal(fallbackIdentity.includes("unknown-author:unknown-time"), true);
assert.equal(fallbackIdentity.endsWith(`:message:${plugin.getTextFingerprint("same short text")}`), true);
const fallbackTimestampSummary = plugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:neighborhash:message:${plugin.getTextFingerprint("same short text")}`);
assert.equal(fallbackTimestampSummary.timestamp, "2026-06-15T04:00:00.000Z");
assert.equal(fallbackTimestampSummary.routeHash, "routehash");
assert.equal(fallbackTimestampSummary.domHash, "domhash");
assert.equal(fallbackTimestampSummary.neighborHash, "neighborhash");
const singleSnowflakeNode = {
    nodeType: 1,
    getAttribute: attribute => attribute === "aria-labelledby" ? "chat-messages-999999999999999999" : "",
    parentElement: null
};
assert.equal(plugin.messageTracker.getNodeMessageIds(singleSnowflakeNode).messageId, "");
const dataMessageNode = {
    nodeType: 1,
    getAttribute: attribute => attribute === "data-message-id" ? "555555555555555555" : "",
    parentElement: null
};
assert.equal(plugin.messageTracker.getNodeMessageIds(dataMessageNode).messageId, "555555555555555555");
const savedWindowForStoreIdentity = global.window;
global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" } };
const createStoreIdentityNode = ({ id = "", authorId = "999999999999999999", timestamp = "2026-06-15T04:00:00.000Z", previousElementSibling = null, nextElementSibling = null } = {}) => ({
    nodeType: 1,
    getAttribute: attribute => attribute === "id" ? id : "",
    parentElement: null,
    previousElementSibling,
    nextElementSibling,
    querySelector: selector => {
        if (selector.includes("data-author-id")) {
            return { getAttribute: attribute => attribute === "data-author-id" ? authorId : "" };
        }
        if (selector.includes("time")) {
            return { getAttribute: attribute => attribute === "datetime" ? timestamp : "" };
        }
        return null;
    }
});
const storeIdentityPlugin = new Plugin();
storeIdentityPlugin.getDiscordMessageStoreMessages = channelId => channelId === "222222222222222222" ? [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    guild_id: "111111111111111111",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "store backed text"
}] : [];
assert.equal(
    storeIdentityPlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "store backed text"),
    `message:111111111111111111:222222222222222222:777777777777777777:message:${storeIdentityPlugin.getTextFingerprint("store backed text")}`
);
const neighborAnchoredStorePlugin = new Plugin();
neighborAnchoredStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "666666666666666666",
    channel_id: "222222222222222222",
    content: "previous anchor"
}, {
    id: "777777777777777777",
    channel_id: "222222222222222222",
    content: "store text without metadata"
}];
assert.equal(
    neighborAnchoredStorePlugin.getMessageIdentity(createStoreIdentityNode({
        authorId: "",
        timestamp: "",
        previousElementSibling: {
            nodeType: 1,
            getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-666666666666666666" : "",
            parentElement: null,
            querySelector: () => null
        }
    }), { closest: () => null }, "store text without metadata"),
    `message:111111111111111111:222222222222222222:777777777777777777:message:${neighborAnchoredStorePlugin.getTextFingerprint("store text without metadata")}`
);
const noMetadataStorePlugin = new Plugin();
noMetadataStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    content: "store text without anchors"
}];
assert.match(noMetadataStorePlugin.getMessageIdentity(createStoreIdentityNode({ authorId: "", timestamp: "" }), { closest: () => null }, "store text without anchors"), /^fallback:/);
const duplicateStorePlugin = new Plugin();
duplicateStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "duplicate text"
}, {
    id: "888888888888888888",
    channel_id: "222222222222222222",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "duplicate text"
}];
assert.match(duplicateStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "duplicate text"), /^fallback:/);
const negativeStorePlugin = new Plugin();
const savedDateNowForNegativeStore = Date.now;
let negativeStoreNow = 100000;
let negativeStoreLookups = 0;
let negativeStoreMessages = [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "negative text"
}, {
    id: "888888888888888888",
    channel_id: "222222222222222222",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "negative text"
}];
Date.now = () => negativeStoreNow;
negativeStorePlugin.getDiscordMessageStoreMessages = () => {
    negativeStoreLookups++;
    return negativeStoreMessages;
};
assert.match(negativeStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "negative text"), /^fallback:/);
assert.match(negativeStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "negative text"), /^fallback:/);
assert.equal(negativeStoreLookups, 1);
negativeStoreNow += 4000;
negativeStoreMessages = [negativeStoreMessages[0]];
assert.equal(
    negativeStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "negative text"),
    `message:111111111111111111:222222222222222222:777777777777777777:message:${negativeStorePlugin.getTextFingerprint("negative text")}`
);
assert.equal(negativeStoreLookups, 2);
Date.now = savedDateNowForNegativeStore;
const crossChannelStorePlugin = new Plugin();
crossChannelStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "777777777777777777",
    channel_id: "333333333333333333",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "cross channel text"
}];
assert.match(crossChannelStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "cross channel text"), /^fallback:/);
const replyStorePlugin = new Plugin();
replyStorePlugin.isReplyPreviewElement = () => true;
replyStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "reply visible text"
}];
assert.match(replyStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "reply visible text"), /^fallback:/);
const domWinsStorePlugin = new Plugin();
domWinsStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    author: { id: "999999999999999999" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "dom wins text"
}];
assert.equal(
    domWinsStorePlugin.getMessageIdentity(createStoreIdentityNode({ id: "chat-messages-222222222222222222-666666666666666666" }), { closest: () => null }, "dom wins text"),
    `message:111111111111111111:222222222222222222:666666666666666666:message:${domWinsStorePlugin.getTextFingerprint("dom wins text")}`
);
const throwingStorePlugin = new Plugin();
throwingStorePlugin.getDiscordMessageStoreMessages = () => { throw new Error("store loading"); };
const savedConsoleWarnForStoreIdentity = console.warn;
console.warn = () => {};
assert.match(throwingStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "throwing text"), /^fallback:/);
console.warn = savedConsoleWarnForStoreIdentity;
const metadataMismatchStorePlugin = new Plugin();
metadataMismatchStorePlugin.getDiscordMessageStoreMessages = () => [{
    id: "777777777777777777",
    channel_id: "222222222222222222",
    author: { id: "101010101010101010" },
    timestamp: "2026-06-15T04:00:00.000Z",
    content: "metadata mismatch"
}];
assert.match(metadataMismatchStorePlugin.getMessageIdentity(createStoreIdentityNode(), { closest: () => null }, "metadata mismatch"), /^fallback:/);
global.window = savedWindowForStoreIdentity;
const savedWindowForReplyIdentity = global.window;
global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" } };
const replyLink = {
    getAttribute: attribute => attribute === "href" ? "/channels/111111111111111111/444444444444444444/555555555555555555" : "",
    href: ""
};
const replyContainer = {
    querySelector: selector => selector.includes("/channels/") ? replyLink : null,
    closest: () => null
};
const replyContent = {
    closest: selector => selector.includes("repliedMessage") ? replyContainer : null
};
const outerReplyMessage = {
    nodeType: 1,
    getAttribute: attribute => attribute === "id" ? "chat-messages-222222222222222222-333333333333333333" : "",
    parentElement: null,
    querySelector: () => null
};
const replyIdentityHash = plugin.getTextFingerprint("quoted text");
assert.equal(
    plugin.getMessageIdentity(outerReplyMessage, replyContent, "quoted text"),
    `reply:111111111111111111:444444444444444444:555555555555555555:reply-preview:${replyIdentityHash}`
);
global.window = savedWindowForReplyIdentity;
const savedWindowForViewport = global.window;
const savedDocumentForViewport = global.document;
global.window = { innerHeight: 800, innerWidth: 1200 };
global.document = { documentElement: { clientHeight: 800, clientWidth: 1200 } };
assert.equal(plugin.isElementNearViewport({
    isConnected: true,
    getBoundingClientRect: () => ({ top: -300, bottom: -260, left: 10, right: 100, width: 90, height: 40 })
}, 480), true);
assert.equal(plugin.isElementNearViewport({
    isConnected: true,
    getBoundingClientRect: () => ({ top: 1400, bottom: 1440, left: 10, right: 100, width: 90, height: 40 })
}, 480), false);
const viewportVisible = {
    isConnected: true,
    getBoundingClientRect: () => ({ top: 260, bottom: 320, left: 10, right: 100, width: 90, height: 60 })
};
const viewportNear = {
    isConnected: true,
    getBoundingClientRect: () => ({ top: 820, bottom: 880, left: 10, right: 100, width: 90, height: 60 })
};
const viewportTopVisible = {
    isConnected: true,
    getBoundingClientRect: () => ({ top: 40, bottom: 90, left: 10, right: 100, width: 90, height: 50 })
};
assert.ok(plugin.getViewportPriority(viewportVisible) < plugin.getViewportPriority(viewportNear));
assert.ok(plugin.getViewportPriority(viewportTopVisible) < plugin.getViewportPriority(viewportVisible));
const savedComputedStyleForViewportPriority = global.getComputedStyle;
const clippedPriorityContainer = {
    nodeType: 1,
    parentElement: null,
    hidden: false,
    getAttribute: () => "",
    getBoundingClientRect: () => ({ top: 400, bottom: 500, left: 0, right: 300, width: 300, height: 100 })
};
const clippedPriorityElement = {
    nodeType: 1,
    isConnected: true,
    hidden: false,
    parentElement: clippedPriorityContainer,
    getAttribute: () => "",
    getBoundingClientRect: () => ({ top: 100, bottom: 150, left: 10, right: 100, width: 90, height: 50 })
};
global.getComputedStyle = element => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
    overflow: element === clippedPriorityContainer ? "hidden" : "visible",
    overflowX: element === clippedPriorityContainer ? "hidden" : "visible",
    overflowY: element === clippedPriorityContainer ? "hidden" : "visible"
});
assert.ok(plugin.getViewportPriority(clippedPriorityElement) >= 100000);
global.getComputedStyle = savedComputedStyleForViewportPriority;
const savedDocumentForScanContext = global.document;
global.document = {
    documentElement: { clientHeight: 800, clientWidth: 1200 },
    querySelectorAll: () => [viewportNear, viewportVisible, viewportTopVisible]
};
assert.deepEqual(plugin.createScanContext().messageNodes, [viewportTopVisible, viewportVisible, viewportNear]);
plugin.settings.ui.autoTranslatePrefetch = false;
assert.deepEqual(plugin.createScanContext().messageNodes, [viewportTopVisible, viewportVisible]);
global.document = {
    documentElement: { clientHeight: 800, clientWidth: 1200 },
    querySelectorAll: () => [viewportNear]
};
assert.deepEqual(plugin.createScanContext().messageNodes, []);
plugin.settings.ui.autoTranslatePrefetch = true;
plugin.settings.ui.autoTranslatePrefetchRange = 5;
const createFarPrefetchMessage = (top, text) => {
    const message = {
        isConnected: true,
        nodeType: 1,
        parentElement: null,
        getAttribute: () => "",
        getBoundingClientRect: () => ({ top, bottom: top + 60, left: 10, right: 100, width: 90, height: 60 }),
        querySelectorAll: () => [],
        contains(node) { return node === this.content; }
    };
    const content = {
        isConnected: true,
        nodeType: 1,
        parentElement: message,
        textContent: text,
        getAttribute: () => "",
        getBoundingClientRect: () => ({ top, bottom: top + 60, left: 10, right: 100, width: 90, height: 60 }),
        closest: () => null
    };
    message.content = content;
    return message;
};
const indexedVisibleMessage = createFarPrefetchMessage(120, "visible indexed");
const indexedPrefetchMessages = [980, 1120, 1260, 1400, 1540].map((top, index) => createFarPrefetchMessage(top, `far indexed ${index}`));
const indexedFarMessage = indexedPrefetchMessages[4];
global.document = {
    documentElement: { clientHeight: 800, clientWidth: 1200 },
    querySelectorAll: () => [indexedVisibleMessage, ...indexedPrefetchMessages]
};
const indexedPrefetchContext = plugin.createScanContext();
assert.equal(indexedPrefetchContext.messageNodes.includes(indexedFarMessage), true);
assert.equal(plugin.isElementNearViewport(indexedFarMessage.content, 480, indexedPrefetchContext), false);
assert.equal(plugin.isAutoTranslationTargetInScanRange(indexedFarMessage.content, indexedPrefetchContext), true);
const classOnlyMessageNode = {
    className: "messageListItem__fake",
    isConnected: true,
    nodeType: 1,
    getBoundingClientRect: () => ({ top: 300, bottom: 360, left: 10, right: 100, width: 90, height: 60 })
};
global.document = {
    documentElement: { clientHeight: 800, clientWidth: 1200 },
    querySelectorAll: selector => {
        assert.doesNotMatch(selector, /messageListItem/);
        return [];
    }
};
assert.deepEqual(plugin.createScanContext().messageNodes, []);
const dirtyRootMessageNode = {
    id: "chat-messages-dirty",
    className: "",
    isConnected: true,
    nodeType: 1,
    matches: selector => String(selector || "").includes("chat-messages"),
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 300, bottom: 360, left: 10, right: 100, width: 90, height: 60 })
};
const dirtyScanRoot = {
    isConnected: true,
    nodeType: 1,
    matches: () => false,
    querySelectorAll: selector => String(selector || "").includes("chat-messages") ? [dirtyRootMessageNode] : [],
    getBoundingClientRect: () => ({ top: 260, bottom: 380, left: 0, right: 120, width: 120, height: 120 })
};
global.document = {
    documentElement: { clientHeight: 800, clientWidth: 1200 },
    querySelectorAll: () => { throw new Error("dirty scan context should not query all messages"); }
};
const dirtyContext = plugin.createScanContext({ roots: [dirtyScanRoot], dirtyOnly: true });
assert.deepEqual(dirtyContext.messageNodes, [dirtyRootMessageNode]);
assert.equal(dirtyContext.dirtyOnly, true);
let cachedRectCalls = 0;
const cachedRectNode = {
    isConnected: true,
    parentElement: null,
    getBoundingClientRect: () => {
        cachedRectCalls++;
        return { top: 260, bottom: 320, left: 10, right: 100, width: 90, height: 60 };
    }
};
const cachedRectContext = {
    rectByElement: new Map(),
    visibleByElement: new Map(),
    nearByElement: new Map(),
    priorityByElement: new Map()
};
assert.deepEqual(plugin.getScanMessageNodes([cachedRectNode], cachedRectContext), [cachedRectNode]);
assert.equal(plugin.isElementNearViewport(cachedRectNode, 480, cachedRectContext), true);
assert.ok(plugin.getViewportPriority(cachedRectNode, cachedRectContext) < 100000);
assert.equal(cachedRectCalls, 1);
const targetCachePlugin = new Plugin();
let targetContentLookups = 0;
let targetReplyLookups = 0;
targetCachePlugin.isAutoTranslationTargetInScanRange = () => true;
targetCachePlugin.getMessageContentElement = () => {
    targetContentLookups++;
    return { text: "bonjour" };
};
targetCachePlugin.getCachedElementText = element => element.text;
targetCachePlugin.getReplyPreviewElements = () => {
    targetReplyLookups++;
    return [];
};
const targetCacheContext = { targetsByMessage: new Map() };
const targetCacheMessage = {};
assert.equal(targetCachePlugin.getAutoTranslationTargets(targetCacheMessage, targetCacheContext).length, 1);
assert.equal(targetCachePlugin.getAutoTranslationTargets(targetCacheMessage, targetCacheContext).length, 1);
assert.equal(targetContentLookups, 1);
assert.equal(targetReplyLookups, 1);
const multiContentPlugin = new Plugin();
multiContentPlugin.isAutoTranslationTargetInScanRange = () => true;
multiContentPlugin.getCachedElementText = element => element.text;
multiContentPlugin.getReplyPreviewElements = () => [];
const multiContentA = {
    text: "first foreign",
    closest: () => null,
    contains: () => false
};
const multiContentB = {
    text: "second foreign",
    closest: () => null,
    contains: () => false
};
const multiContentMessage = {
    querySelectorAll: selector => selector.includes("messageContent") ? [multiContentA, multiContentB] : []
};
const multiContentTargets = multiContentPlugin.getAutoTranslationTargets(multiContentMessage, { targetsByMessage: new Map(), contentElementsByMessage: new Map() });
assert.deepEqual(multiContentTargets.map(target => target.text), ["first foreign", "second foreign"]);
global.document = savedDocumentForScanContext;
global.window = savedWindowForViewport;
global.document = savedDocumentForViewport;
const jumpPlugin = new Plugin();
global.window = { innerHeight: 800, scrollY: 0, pageYOffset: 0 };
global.document = { body: {}, documentElement: { clientHeight: 800 } };
const jumpFailure = { retryAt: Date.now() + 10000 };
jumpPlugin.autoTranslationFailures.set("keep-failure", jumpFailure);
jumpPlugin.markAutoTranslationViewportBusy("scroll", { target: { scrollTop: 5000 } });
assert.equal(jumpPlugin.autoTranslationConfigVersion, 0);
assert.equal(jumpPlugin.autoTranslationFailures.get("keep-failure"), jumpFailure);
assert.equal(jumpPlugin.isAutoTranslationViewportSettling(), true);
assert.equal(jumpPlugin.isAutoTranslationRenderPaused(), true);
const nonChatScrollPlugin = new Plugin();
let nonChatBusyCount = 0;
let nonChatScanCount = 0;
nonChatScrollPlugin.markAutoTranslationViewportBusy = () => { nonChatBusyCount++; };
nonChatScrollPlugin.queueScan = () => { nonChatScanCount++; };
const nonChatScrollTarget = {
    nodeType: 1,
    closest: selector => selector.includes(".dait-settings") ? {} : null,
    matches: () => false,
    querySelector: () => null,
    scrollTop: 1200
};
nonChatScrollPlugin.queueViewportScan({ type: "scroll", target: nonChatScrollTarget });
assert.equal(nonChatBusyCount, 0);
assert.equal(nonChatScanCount, 0);
const disabledAutoScrollPlugin = new Plugin();
let disabledAutoBusyCount = 0;
let disabledAutoScanCount = 0;
disabledAutoScrollPlugin.isDiscordMediaViewerViewportEvent = () => false;
disabledAutoScrollPlugin.isAutoTranslationScrollEventRelevant = () => true;
disabledAutoScrollPlugin.markAutoTranslationViewportBusy = () => { disabledAutoBusyCount++; };
disabledAutoScrollPlugin.queueScan = () => { disabledAutoScanCount++; };
disabledAutoScrollPlugin.queueViewportScan({ type: "scroll", target: { scrollTop: 500 } });
assert.equal(disabledAutoBusyCount, 0);
assert.equal(disabledAutoScanCount, 0);
const incrementalScanPlugin = new Plugin();
incrementalScanPlugin.settings.translation.provider = "sakuraLocal";
incrementalScanPlugin.settings.ui.autoTranslateMessages = true;
const incrementalCallbacks = [];
const savedWindowForIncrementalScan = global.window;
global.window = {
    requestIdleCallback(callback) {
        incrementalCallbacks.push(callback);
        return incrementalCallbacks.length;
    },
    cancelIdleCallback() {}
};
const incrementalMessages = [1, 2, 3].map(id => ({ id, isConnected: true }));
const incrementalButtons = [];
const incrementalCandidates = [];
const incrementalTimingActions = [];
let incrementalFinished = 0;
incrementalScanPlugin.injectMessageButton = message => { incrementalButtons.push(message.id); };
incrementalScanPlugin.logSlowOperation = action => { incrementalTimingActions.push(action); };
incrementalScanPlugin.createAutoTranslationScanWork = context => ({
    context,
    scanState: {},
    scanStats: { candidates: 0 }
});
incrementalScanPlugin.createDomAutoTranslationCandidatesForMessage = message => [{ id: message.id }];
incrementalScanPlugin.processAutoTranslationScanCandidates = (_work, candidates) => { incrementalCandidates.push(...candidates.map(candidate => candidate.id)); };
incrementalScanPlugin.finishAutoTranslationScanWork = () => { incrementalFinished++; };
const incrementalContext = { messageNodes: incrementalMessages };
assert.equal(incrementalScanPlugin.shouldUseIncrementalMessageScan(incrementalContext), true);
const cloudIncrementalPlugin = new Plugin();
cloudIncrementalPlugin.settings.translation.provider = "deepseek";
cloudIncrementalPlugin.settings.ui.autoTranslateMessages = true;
assert.equal(cloudIncrementalPlugin.shouldUseIncrementalMessageScan(incrementalContext), true);
const buttonOnlyIncrementalPlugin = new Plugin();
buttonOnlyIncrementalPlugin.settings.ui.autoTranslateMessages = false;
buttonOnlyIncrementalPlugin.settings.ui.injectMessageButtons = true;
assert.equal(buttonOnlyIncrementalPlugin.shouldUseIncrementalMessageScan(incrementalContext), true);
incrementalScanPlugin.scheduleIncrementalMessageScan(incrementalContext);
assert.equal(incrementalCallbacks.length, 1);
incrementalCallbacks.shift()({ timeRemaining: () => 50 });
assert.deepEqual(incrementalButtons, []);
assert.equal(incrementalFinished, 0);
incrementalCallbacks.shift()({ timeRemaining: () => 50 });
assert.deepEqual(incrementalButtons, [1]);
assert.equal(incrementalFinished, 0);
while (incrementalCallbacks.length) incrementalCallbacks.shift()({ timeRemaining: () => 50 });
assert.deepEqual(incrementalButtons, [1, 2, 3]);
assert.deepEqual(incrementalCandidates, [1, 2, 3]);
assert.equal(incrementalFinished, 1);
assert.equal(incrementalTimingActions.includes("scan.incremental-finish"), true);
let buttonOnlyInjected = 0;
buttonOnlyIncrementalPlugin.injectMessageButton = () => { buttonOnlyInjected++; };
buttonOnlyIncrementalPlugin.createAutoTranslationScanWork = () => { throw new Error("button-only scan must not initialize auto translation"); };
buttonOnlyIncrementalPlugin.scheduleIncrementalMessageScan(incrementalContext);
while (incrementalCallbacks.length) incrementalCallbacks.shift()({ timeRemaining: () => 50 });
assert.equal(buttonOnlyInjected, incrementalMessages.length);
global.window = savedWindowForIncrementalScan;
const multiScrollerPlugin = new Plugin();
let multiScrollerInvalidations = 0;
multiScrollerPlugin.invalidateAutoTranslationQueue = () => { multiScrollerInvalidations++; };
global.window = { innerHeight: 800, scrollY: 0, pageYOffset: 0 };
const scrollTargetA = { scrollTop: 20 };
const scrollTargetB = { scrollTop: 5000 };
multiScrollerPlugin.markAutoTranslationViewportBusy("scroll", { target: scrollTargetA });
multiScrollerPlugin.markAutoTranslationViewportBusy("scroll", { target: scrollTargetB });
assert.equal(multiScrollerInvalidations, 0);
global.window = savedWindowForViewport;
global.document = savedDocumentForViewport;
plugin.settings.translation.provider = "deepseek";
plugin.settings.ui.autoTranslateMessages = true;
plugin.settings.ui.autoTranslateConcurrency = 99;
assert.equal(plugin.getAutoTranslateConcurrency(), 10);
plugin.settings.ui.autoTranslateConcurrency = 0;
assert.equal(plugin.getAutoTranslateConcurrency(), 1);
plugin.settings.ui.autoTranslateConcurrency = 4;
plugin.settings.translation.provider = "sakuraLocal";
assert.equal(plugin.getAutoTranslateConcurrency(), 4);
plugin.settings.translation.provider = "deepseek";
const numericInputCreated = [];
global.document = {
    activeElement: null,
    createElement: tag => createFakeElement(tag, numericInputCreated),
    querySelectorAll: selector => numericInputCreated.filter(element => selector === "[data-dait-path]" || selector === `[data-dait-path='${element.dataset?.daitPath}']`)
};
const numericInputPlugin = new Plugin();
let numericInputSaves = 0;
numericInputPlugin.saveData = key => {
    if (key === "settings") numericInputSaves++;
    return true;
};
numericInputPlugin.createInputRow("ui.autoTranslateConcurrency", "Concurrency", "number", "4", { min: "1", max: "10", step: "1" });
const numericInput = numericInputCreated.find(element => element.dataset?.daitPath === "ui.autoTranslateConcurrency");
numericInput.value = "7";
numericInput.listeners.input();
assert.equal(numericInputPlugin.settings.ui.autoTranslateConcurrency, 7);
assert.equal(numericInputSaves, 0);
assert.equal(numericInputPlugin.flushSettings(), true);
assert.equal(numericInputSaves, 1);
numericInput.value = "8";
numericInput.listeners.change();
assert.equal(numericInputPlugin.settings.ui.autoTranslateConcurrency, 8);
assert.equal(numericInputSaves, 2);
numericInput.value = "6";
numericInputPlugin.commitSettingsControls({ querySelectorAll: selector => selector === "[data-dait-path]" ? [numericInput] : [] });
assert.equal(numericInputPlugin.settings.ui.autoTranslateConcurrency, 6);
assert.equal(numericInputPlugin.flushSettings(), true);
assert.equal(numericInputSaves, 3);
clearTimeout(numericInputPlugin.settingsDirtyTimer);
numericInputPlugin.settingsDirtyTimer = null;
const sameValueSavePlugin = new Plugin();
sameValueSavePlugin.settings.ui.autoTranslateConcurrency = 8;
let sameValueSaved = null;
sameValueSavePlugin.saveData = (key, value) => {
    if (key === "settings") sameValueSaved = sameValueSavePlugin.clone(value);
    return true;
};
sameValueSavePlugin.setSetting("ui.autoTranslateConcurrency", 8, { save: "immediate" });
assert.equal(sameValueSaved.ui.autoTranslateConcurrency, 8);
const localClampPlugin = new Plugin();
localClampPlugin.settings.translation.provider = "sakuraLocal";
localClampPlugin.settings.ui.autoTranslateConcurrency = 1;
const localConcurrencyInput = { type: "number", value: "8", dataset: { daitPath: "ui.autoTranslateConcurrency" } };
global.document = {
    activeElement: localConcurrencyInput,
    querySelectorAll: selector => selector === "[data-dait-path='ui.autoTranslateConcurrency']" ? [localConcurrencyInput] : []
};
localClampPlugin.setSetting("ui.autoTranslateConcurrency", 11);
assert.equal(localClampPlugin.settings.ui.autoTranslateConcurrency, 10);
assert.equal(localConcurrencyInput.value, 10);
const localPrefetchCheckbox = { type: "checkbox", checked: true, dataset: { daitPath: "ui.autoTranslatePrefetch" } };
global.document = {
    activeElement: localPrefetchCheckbox,
    querySelectorAll: selector => selector === "[data-dait-path='ui.autoTranslatePrefetch']" ? [localPrefetchCheckbox] : []
};
localClampPlugin.settings.ui.autoTranslatePrefetch = false;
localClampPlugin.setSetting("ui.autoTranslatePrefetch", true);
assert.equal(localClampPlugin.settings.ui.autoTranslatePrefetch, true);
assert.equal(localPrefetchCheckbox.checked, true);
const localStrictRetryCheckbox = { type: "checkbox", checked: true, dataset: { daitPath: "ui.autoTranslateStrictRetry" } };
global.document = {
    activeElement: localStrictRetryCheckbox,
    querySelectorAll: selector => selector === "[data-dait-path='ui.autoTranslateStrictRetry']" ? [localStrictRetryCheckbox] : []
};
localClampPlugin.settings.ui.autoTranslateStrictRetry = false;
localClampPlugin.setSetting("ui.autoTranslateStrictRetry", true);
assert.equal(localClampPlugin.settings.ui.autoTranslateStrictRetry, true);
assert.equal(localStrictRetryCheckbox.checked, true);
clearTimeout(localClampPlugin.settingsDirtyTimer);
localClampPlugin.settingsDirtyTimer = null;
global.document = savedDocumentForViewport;
assert.equal(plugin.getTestModeKind(), "translation");
plugin.settings.ui.testModeKind = "bad-value";
assert.equal(plugin.getTestModeKind(), "translation");
plugin.settings.ui.testModeKind = "polish";
assert.equal(plugin.getTestModeKind(), "polish");
plugin.settings.ui.testModeKind = "translation";
assert.equal(plugin.getHotkeyLabel(), "Ctrl+Alt+P");
assert.equal(plugin.isModifierOnlyKey("Control"), true);
assert.equal(plugin.isModifierOnlyKey("p"), false);
assert.equal(plugin.shortcutFromEvent({ key: "p", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }), "Ctrl+Alt+P");
assert.equal(plugin.shortcutFromEvent({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false }), "");
assert.equal(plugin.isHotkeyEvent({ key: "p", ctrlKey: true, altKey: true, shiftKey: false, metaKey: false }, "Ctrl+Alt+P"), true);
assert.equal(plugin.normalizeLanguageName("English"), "英语");
assert.equal(plugin.normalizeLanguageName("Simplified Chinese"), "汉语");
assert.equal(plugin.normalizeLanguageName("Traditional Chinese"), "繁體中文");
assert.equal(plugin.normalizeLanguageName("zh-TW"), "繁體中文");
assert.equal(plugin.normalizeLanguageName("zh-Hant"), "繁體中文");
assert.equal(plugin.normalizeLanguageName("繁体中文"), "繁體中文");
assert.equal(plugin.normalizeLanguageName("繁體中文"), "繁體中文");
assert.equal(plugin.isChineseLanguageAlias("繁體中文"), true);
assert.equal(plugin.normalizeLanguageName("Korean"), "朝鲜语");
assert.equal(plugin.normalizeLanguageName("German"), "德语");
plugin.settings.translation.targetLanguage = "汉语";
assert.equal(plugin.shouldAutoTranslateText("ВольныйКаменщик японские прокси"), true);
assert.equal(plugin.shouldAutoTranslateText("भारत में इसे कैसे करें"), true);
assert.equal(plugin.shouldAutoTranslateText("老哥最近搞啥呢"), false);
assert.equal(plugin.shouldAutoTranslateText("ChatGPT"), false);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d \u043f\u0440\u0438\u0432\u0435\u0442", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d please help", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d API", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d ChatGPT", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d ChatGPT API", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d please API help", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("\u4f60\u597d https://example.com", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u6211\u7684bug team\u554a", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u4fee\u7a0b\u5e8f\u7684bug ok sure", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2aAPI cache\u6709bug", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u6211\u60f3\u627e\u4e2a\u51a4\u79cd\u5e2e\u6211\u62fc\u8f66team", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2afeature flag\u53ef\u4ee5\u5173", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("API \u662f\u4ec0\u4e48\u95ee\u9898", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2aplease help\u6211", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("bug team", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("need upi scan", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("UPI scan", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("\u4e2d\u6587\u5185\u5bb9\u5f88\u591a\nneed upi scan", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("\u4e2d\u6587\u5185\u5bb9\u5f88\u591a need upi scan", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("need upi scan\nAnyone who can do scans, please message me", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("hello \u0928\u092e\u0938\u094d\u0924\u0947", "English"), true);
assert.equal(plugin.shouldAutoTranslateText("API"), false);
assert.equal(plugin.shouldAutoTranslateText("привет."), true);
assert.equal(plugin.shouldAutoTranslateText("bonjour."), true);
assert.equal(plugin.shouldAutoTranslateText("hola-"), true);
assert.equal(plugin.shouldAutoTranslateText("大丈夫"), true);
assert.equal(plugin.shouldAutoTranslateText("\u0e2a\u0e27\u0e31\u0e2a\u0e14\u0e35"), true);
assert.equal(plugin.shouldAutoTranslateText("\u05e9\u05dc\u05d5\u05dd"), true);
assert.equal(plugin.shouldAutoTranslateText("\u03b3\u03b5\u03b9\u03ac \u03c3\u03bf\u03c5"), true);
assert.equal(plugin.shouldAutoTranslateText("\u6f22\u5b57"), false);
assert.equal(plugin.shouldAutoTranslateText("\u5b87\u5b99\u98db\u8239", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u9019\u5bb6", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u9019\u662f\u7e41\u9ad4\u4e2d\u6587", "Traditional Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u9019\u500bAPI cache\u6709bug", "zh-TW"), false);
assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u662f\u7b80\u4f53\u4e2d\u6587", "Traditional Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("\u8fd9\u4e2astatus code\u662f429 error", "Chinese"), false);
assert.equal(plugin.shouldAutoTranslateText("status code error", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("ok", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("ok sure", "Chinese"), true);
assert.equal(plugin.isLowInformationRepeatedText("dur dur dur dur"), true);
assert.equal(plugin.shouldAutoTranslateText("dur dur dur dur", "Chinese"), false);
assert.equal(plugin.computeAutoTranslationPrecheckSkipReason("dur dur dur dur", "Chinese"), "low-information-repeat");
const turkishRepeatPlugin = new Plugin();
turkishRepeatPlugin.settings.translation.sourceLanguage = "Turkish";
assert.equal(turkishRepeatPlugin.isLowInformationRepeatedText("Dur! Dur! Dur!"), false);
assert.equal(plugin.isLowInformationRepeatedText("durable systems need tests"), false);
assert.equal(plugin.isLowInformationRepeatedText("no no no no"), false);
assert.equal(plugin.shouldAutoTranslateText("\u7121\u6599\u767b\u9332\u5fc5\u8981\u78ba\u8a8d", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("\u5fc5\u8981", "Chinese"), false);
assert.equal(plugin.isLikelyTargetLanguage("\u4f60\u597d", "\u6c49\u8bed"), true);
assert.equal(plugin.hasSuspiciousChineseAutoTranslationOutput("\u6d63\u72b2\u30bd", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("hello", "\u6d63\u72b2\u30bd", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("hello", "\u4f60\u597d", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("This is Traditional Chinese.", "\u9019\u662f\u7e41\u9ad4\u4e2d\u6587\u3002", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("This is Simplified Chinese.", "\u8fd9\u662f\u7b80\u4f53\u4e2d\u6587\u3002", "Chinese"), false);
const promptLeakOutput = [
    "\u60a8\u6b63\u5728\u4e3a\u5b9e\u65f6\u5b57\u5e55\u5c42\u7ffb\u8bd1Discord\u804a\u5929\u6d88\u606f\u3002",
    "\u4efb\u52a1\uff1a\u5c06\u4eba\u7c7b\u8bed\u8a00\u5185\u5bb9\u7ffb\u8bd1\u6210\u7b80\u4f53\u4e2d\u6587\uff08\u4e2d\u6587\uff0czh-CN\uff09\u3002",
    "\u8981\u6c42\uff1a",
    "- \u4fdd\u7559URL\u3001Markdown\u3001emoji\u548c\u4ee3\u7801\u5757\u3002",
    "\u4ec5\u8fd4\u56de\u7ffb\u8bd1\u540e\u7684\u6d88\u606f\u3002"
].join("\n");
assert.equal(plugin.hasPromptLeakageAutoTranslationOutput("\u042d\u043c", promptLeakOutput, "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("\u042d\u043c", promptLeakOutput, "Chinese"), true);
const genericShortPromptLeakOutput = [
    "\u4efb\u52a1\uff1a\u5c06\u8f93\u5165\u7ffb\u8bd1\u6210\u76ee\u6807\u8bed\u8a00\u3002",
    "\u8981\u6c42\uff1a\u4fdd\u7559 URL\u3001Markdown\u3001emoji \u548c\u4ee3\u7801\u5757\u3002",
    "\u76ee\u6807\u8bed\u8a00\uff1a\u7b80\u4f53\u4e2d\u6587\u3002",
    "\u4ec5\u8fd4\u56de\u7ffb\u8bd1\u540e\u7684\u6d88\u606f\uff0c\u4e0d\u8981\u89e3\u91ca\u3002"
].join("\n");
assert.equal(plugin.hasPromptLeakageAutoTranslationOutput("\u042d\u043c", genericShortPromptLeakOutput, "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("\u042d\u043c", genericShortPromptLeakOutput, "Chinese"), true);
const explanatoryNoiseOutput = "\u201cdur dur dur dur\u201d \u8fd9\u4e2a\u8868\u8fbe\u5728 Discord \u4e2d\u5e76\u4e0d\u5e38\u89c1\uff0c\u53ef\u80fd\u662f\u67d0\u79cd\u7279\u5b9a\u7684\u4fda\u8bed\u6216\u7f29\u5199\u3002\u5efa\u8bae\u63d0\u4f9b\u66f4\u591a\u7684\u4e0a\u4e0b\u6587\u4ee5\u4fbf\u66f4\u51c6\u786e\u5730\u7ffb\u8bd1\u3002";
assert.equal(plugin.hasExplanatoryAutoTranslationOutput("dur dur dur dur", explanatoryNoiseOutput), true);
assert.equal(plugin.getAutoTranslationInvalidOutputReason("dur dur dur dur", explanatoryNoiseOutput, "Chinese"), "explanatory-output");
assert.equal(plugin.getAutoTranslationOutputValidationResult("dur dur dur dur", explanatoryNoiseOutput, "Chinese").renderable, false);
const longOrdinarySource = "Please keep this ordinary Discord message intact while discussing several unrelated project details and status updates.";
assert.ok(longOrdinarySource.length > 80);
assert.equal(plugin.getAutoTranslationInvalidOutputReason(longOrdinarySource, explanatoryNoiseOutput, "Chinese"), "explanatory-output");
assert.equal(plugin.getAutoTranslationInvalidOutputReason("api \u0435\u0449\u0435 \u0435\u0441\u0442\u044c", "\u8fd8\u6709\u4e00\u90e8\u5206\u5185\u5bb9\u9700\u8981\u7ffb\u8bd1\u3002", "Chinese"), "explanatory-output");
assert.equal(plugin.hasExplanatoryAutoTranslationOutput(
    "\u8fd9\u4e2a\u8868\u8fbe\u5e76\u4e0d\u5e38\u89c1\uff0c\u53ef\u80fd\u662f\u4fda\u8bed\u6216\u7f29\u5199\uff0c\u9700\u8981\u66f4\u591a\u4e0a\u4e0b\u6587\u624d\u80fd\u51c6\u786e\u7ffb\u8bd1\u3002",
    "This is not a common expression and may be slang or an abbreviation. Please provide more context for an accurate translation."
), false);
assert.equal(plugin.hasExplanatoryAutoTranslationOutput(
    "\u8fd8\u6709\u4e00\u90e8\u5206\u5185\u5bb9\u9700\u8981\u7ffb\u8bd1\u3002",
    "Some remaining content still needs to be translated."
), false);
assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86", "Chinese"), "emoji-mismatch");
assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86 :emoji_13:", "Chinese"), "emoji-mismatch");
assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86 :emoji_12: :emoji_12:", "Chinese"), "emoji-mismatch");
assert.equal(plugin.getAutoTranslationInvalidOutputReason("get muted :emoji_12:", "\u88ab\u9759\u97f3\u4e86 <:emoji_12:123456789012345678>", "Chinese"), "");
assert.equal(plugin.isInvalidAutoTranslationOutput("\u042d\u043c", "\u55ef", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("What are the task requirements?", "\u8fd9\u4e2a\u4efb\u52a1\u6709\u54ea\u4e9b\u8981\u6c42\uff1f", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("ok", "OK", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("hello\nthanks", "\u4f60\u597d\uff0c\u8c22\u8c22\u3002", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("Please check ABC-123\nthen restart API", "\u8bf7\u68c0\u67e5 ABC-123\uff0c\u7136\u540e\u91cd\u542f API\u3002", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("See you in Taiwan", "\u53f0\u7063\u898b\u3002", "Traditional Chinese"), false);
assert.equal(plugin.isLikelyTargetLanguage("\u65e5\u672c\u4eba\u7684\u519b\u56fd\u4e3b\u4e49\uff0c\u5567\uff0c\u771f\u662f\u8ba9\u4eba\u76f4\u6cdb\u6076\u5fc3\u554a~", "繁体中文"), false);
assert.equal(plugin.isLikelyTargetLanguage("\u65e5\u672c\u4eba\u7684\u8ecd\u570b\u4e3b\u7fa9\uff0c\u5616\uff0c\u771f\u662f\u8b93\u4eba\u76f4\u6cdb\u566c\u5fc3\u554a\uff5e", "繁体中文"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("Japanese militarism is disgusting.", "\u65e5\u672c\u4eba\u7684\u519b\u56fd\u4e3b\u4e49\uff0c\u5567\uff0c\u771f\u662f\u8ba9\u4eba\u76f4\u6cdb\u6076\u5fc3\u554a~", "繁体中文"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("Japanese militarism is disgusting.", "\u65e5\u672c\u4eba\u7684\u8ecd\u570b\u4e3b\u7fa9\uff0c\u5616\uff0c\u771f\u662f\u8b93\u4eba\u76f4\u6cdb\u566c\u5fc3\u554a\uff5e", "繁体中文"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "请不要争吵。"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "Пожалуйста, не ссорьтесь."), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "Please do not argue."), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("Пожалуйста, не ссорьтесь.", "请不要争吵。 Please do not argue."), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("привет", "???????"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("есть схема по chatgpt бесплатно", "???????"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("ооо, лучший админ!!!!!!!\nцелую обнимаю брат", "亲亲抱抱，兄弟"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("ооо, лучший админ!!!!!!!\nцелую обнимаю брат", "哦哦，最好的管理员！\n亲亲抱抱，兄弟"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("есть схема\nпривет", "有方案\nпривет"), true);
assert.equal(plugin.hasResidualAutoTranslationSourceText("你好\nChatGPT", "汉语"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("how to use chatgpt api", "\u5982\u4f55\u4f7f\u7528 ChatGPT API", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("how to use gpt", "\u4f60\u597d GPT-4o", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("how to use chatgpt api", "\u5982\u4f55\u4f7f\u7528 please help", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro Pro, no 429 error.", "\u6211\u6709 Kiro Pro\uff0c\u6ca1\u6709 429 \u9519\u8bef\u3002", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro pro no 429 error.", "\u6211\u9047\u5230 Kiro Pro 429 \u9519\u8bef\u3002", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro Pro.", "\u6211\u6709 Kiro Pro\u3002", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("I have Kiro Pro, please help.", "\u6211\u6709 Kiro Pro\uff0cplease help\u3002", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("please help with Kiro Pro", "\u8bf7\u5e2e\u6211\u5904\u7406 Kiro Pro", "Chinese"), false);
assert.equal(plugin.hasResidualAutoTranslationSourceText("\u6211\u6709 Kiro Pro\uff0c\u6ca1\u6709 429 \u9519\u8bef\u3002", "Chinese", "I have Kiro Pro, no 429 error."), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("Please help me fix the account login problem because the button keeps failing after refresh.", "\u8fd9\u4e2a\u8d26\u53f7\u767b\u5f55\u95ee\u9898\u9700\u8981\u4fee\u590d\uff0cplease help\u3002", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("Pliny the Liberator just posted about Claude Fable 5.", "Pliny the Liberator \u521a\u521a\u53d1\u5e03\u4e86\u5173\u4e8e Claude Fable 5 \u7684\u5185\u5bb9\u3002", "Chinese"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("The server keeps failing after refresh.", "\u5237\u65b0\u540e\u6d41\u7a0b\u51fa\u73b0 server failing \u95ee\u9898\uff0c\u9700\u8981\u5904\u7406\u3002", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("Please verify the bank response before transfer.", "\u8bf7\u5148\u786e\u8ba4 bank verify \u4fe1\u606f\uff0c\u7136\u540e\u7ee7\u7eed\u5904\u7406\u3002", "Chinese"), true);
const longRussianSource = "\u042d\u0442\u043e \u043e\u0447\u0435\u043d\u044c \u0434\u043b\u0438\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043f\u0440\u043e \u043e\u043f\u043b\u0430\u0442\u0443, \u0431\u0430\u043d\u043a, \u043a\u0430\u0440\u0442\u0443 \u0438 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0432\u0430\u0436\u043d\u044b\u0445 \u0434\u0435\u0442\u0430\u043b\u0435\u0439, \u043a\u043e\u0442\u043e\u0440\u044b\u0435 \u043d\u0443\u0436\u043d\u043e \u043f\u043e\u043d\u044f\u0442\u044c.";
assert.equal(plugin.isInvalidAutoTranslationOutput(longRussianSource, "\u6709\u65b9\u6848", "Chinese"), true);
const mergedLongSource = "\u041f\u0435\u0440\u0432\u0430\u044f \u0441\u0442\u0440\u043e\u043a\u0430 \u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u0435 \u0438 \u0431\u0430\u043d\u043a\u0435.\n\u0412\u0442\u043e\u0440\u0430\u044f \u0441\u0442\u0440\u043e\u043a\u0430 \u043e \u043a\u0430\u0440\u0442\u0435 \u0438 \u0441\u0445\u0435\u043c\u0435.\n\u0422\u0440\u0435\u0442\u044c\u044f \u0441\u0442\u0440\u043e\u043a\u0430 \u0441 \u0434\u0435\u0442\u0430\u043b\u044f\u043c\u0438 \u0434\u043b\u044f \u0447\u0430\u0442\u0430.";
assert.equal(plugin.hasMissingAutoTranslationLines(mergedLongSource, "\u7b2c\u4e00\u90e8\u5206\u5728\u8bf4\u652f\u4ed8\u548c\u94f6\u884c\uff0c\u7b2c\u4e8c\u90e8\u5206\u5728\u8bf4\u5361\u548c\u65b9\u6848\uff0c\u7b2c\u4e09\u90e8\u5206\u662f\u7ed9\u804a\u5929\u7684\u7ec6\u8282\u3002", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput(mergedLongSource, "\u7b2c\u4e00\u90e8\u5206\u5728\u8bf4\u652f\u4ed8\u548c\u94f6\u884c\uff0c\u7b2c\u4e8c\u90e8\u5206\u5728\u8bf4\u5361\u548c\u65b9\u6848\uff0c\u7b2c\u4e09\u90e8\u5206\u662f\u7ed9\u804a\u5929\u7684\u7ec6\u8282\u3002", "Chinese"), true);
const summarizedLongSingleLineSource = "This message has several details about payment, bank transfer, card verification, account access, risk review, timing, user contact, screenshots, retry steps, and the exact reason why the operation failed after the system refreshed. It should be translated as a complete Discord message, not reduced to one vague summary.";
assert.equal(plugin.isInvalidAutoTranslationOutput(summarizedLongSingleLineSource, "\u8fd9\u6761\u6d88\u606f\u5728\u8bf4\u652f\u4ed8\u95ee\u9898\u3002", "Chinese"), true);
const longTenSentenceSource = [
    "The payment request failed after the bank returned a delayed verification response.",
    "The card check included a temporary risk status and a second confirmation step.",
    "The user attached a screenshot showing the refresh time and the error message.",
    "The account access token expired before the retry button finished loading.",
    "The operator needs to contact support before changing the transfer amount.",
    "The next scan should keep the original order number and the same bank route.",
    "The server log says the request was accepted but the callback never arrived.",
    "The message also mentions timing, evidence, risk review, and manual recovery.",
    "The final note explains who should continue the process and when to retry.",
    "The translator must preserve these details instead of reducing them to a summary."
].join(" ");
const fourSentenceChineseSummaryOver180HanChars = [
    "\u8fd9\u6bb5\u5185\u5bb9\u4e3b\u8981\u5728\u8bf4\u652f\u4ed8\u8bf7\u6c42\u3001\u94f6\u884c\u54cd\u5e94\u3001\u5361\u9a8c\u8bc1\u548c\u8d26\u6237\u8bbf\u95ee\u7684\u95ee\u9898\uff0c\u9700\u8981\u7ee7\u7eed\u68c0\u67e5\u5904\u7406",
    "\u5176\u4e2d\u63d0\u5230\u4e86\u622a\u56fe\u3001\u5237\u65b0\u65f6\u95f4\u3001\u9519\u8bef\u4fe1\u606f\u548c\u91cd\u8bd5\u6309\u94ae\u52a0\u8f7d\u8fc7\u7a0b\uff0c\u8fd9\u4e9b\u90fd\u548c\u5f53\u524d\u6d41\u7a0b\u6709\u5173",
    "\u540e\u9762\u8fd8\u8bf4\u5230\u9700\u8981\u8054\u7cfb\u652f\u6301\u3001\u4fdd\u7559\u539f\u59cb\u8ba2\u5355\u4fe1\u606f\u548c\u94f6\u884c\u8def\u7531\uff0c\u5e76\u7b49\u5f85\u56de\u8c03\u7ed3\u679c",
    "\u6574\u4f53\u6765\u770b\u8fd9\u662f\u4e00\u6761\u8f83\u957f\u7684\u6d41\u7a0b\u8bf4\u660e\uff0c\u9700\u8981\u5b8c\u6574\u7ffb\u8bd1\u800c\u4e0d\u662f\u53ea\u7ed9\u51fa\u5927\u6982\u6458\u8981"
].join("\u3002");
assert.equal(plugin.isInvalidAutoTranslationOutput(longTenSentenceSource, fourSentenceChineseSummaryOver180HanChars, "Chinese"), true);
const undercoveredMultilineSource = "This first line explains the payment status, bank response, card verification, and the exact reason the order failed.\nThis second line explains the retry timing, account access, screenshot evidence, and who should be contacted next.";
assert.equal(plugin.isInvalidAutoTranslationOutput(undercoveredMultilineSource, "\u7b2c\u4e00\u884c\u89e3\u91ca\u652f\u4ed8\u72b6\u6001\u3001\u94f6\u884c\u54cd\u5e94\u3001\u5361\u9a8c\u8bc1\u548c\u8ba2\u5355\u5931\u8d25\u7684\u539f\u56e0\u3002\n\u597d", "Chinese"), true);
const anchorMultilineSource = "The first line explains the payment status and bank response.\nThe second line explains the retry timing and screenshot evidence.\nThe third line contains OTP 829144 from BankNova transfer ID TRX-4452 and must not be skipped.";
assert.equal(plugin.isInvalidAutoTranslationOutput(anchorMultilineSource, "\u7b2c\u4e00\u884c\u89e3\u91ca\u652f\u4ed8\u72b6\u6001\u548c\u94f6\u884c\u54cd\u5e94\u3002\n\u7b2c\u4e8c\u884c\u89e3\u91ca\u91cd\u8bd5\u65f6\u95f4\u548c\u622a\u56fe\u8bc1\u636e\u3002\n\u7b2c\u4e09\u884c\u4e5f\u662f\u7c7b\u4f3c\u7684\u6d41\u7a0b\u4fe1\u606f\uff0c\u6574\u4f53\u9700\u8981\u7ee7\u7eed\u5904\u7406\u3002", "Chinese"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("привет", "A", "Chinese"), true);
plugin.settings.translation.targetLanguage = "英语";
assert.equal(plugin.shouldAutoTranslateText("Are you Indian? Can you help me scan UPI", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("who had access to naver pay or kakaopay? can it be unlimited payment like earlier of gopay?", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("but now problem with getting QR", "Chinese"), true);
assert.equal(plugin.shouldAutoTranslateText("hello"), false);
assert.equal(plugin.isTargetLanguageDominantBySentence("\u4f60\u597d", "Chinese"), false);
assert.equal(plugin.isTargetLanguageDominantBySentence("\u4f60\u597d", "Chinese", { allowPureTarget: true }), true);
assert.equal(plugin.shouldAutoTranslateText("canal de soporte and help"), true);
assert.equal(plugin.shouldAutoTranslateText("भारत में इसे कैसे करें"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("नमस्ते भाई", "Hello bro", "英语"), false);
assert.equal(plugin.isInvalidAutoTranslationOutput("hola", "hola amigo", "英语"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("bonjour", "bonjour mon ami", "英语"), true);
assert.equal(plugin.isInvalidAutoTranslationOutput("¿Qué haces?", "What are you doing?", "英语"), false);
assert.ok(plugin.getPromptTemplates("polish").length >= 3);
assert.ok(plugin.getPromptTemplates("translation").length >= 2);
assert.equal(plugin.getPromptTemplates("polish")[0].serial, "001");
assert.equal(plugin.getPromptTemplateLabel(plugin.getPromptTemplates("polish")[0]), "001 · 自然聊天润色");
assert.match(plugin.getPromptTemplateSearchText(plugin.getPromptTemplates("polish")[0]), /001/);
assert.match(plugin.getPromptTemplateSearchText(plugin.getPromptTemplates("polish")[0]), /自然聊天润色/);

const templateCount = plugin.getPromptTemplates("polish").length;
plugin.savePromptTemplate("polish", "Test Template", "Test prompt in {targetLanguage}");
assert.equal(plugin.getPromptTemplates("polish").length, templateCount + 1);
const savedTemplateId = plugin.settings.polish.activePromptTemplate;
const savedTemplate = plugin.getPromptTemplates("polish").find(item => item.id === savedTemplateId);
assert.equal(savedTemplate.serial, "004");
plugin.settings.polish.prompt = "Edited prompt";
plugin.updatePromptTemplate("polish", savedTemplateId, plugin.settings.polish.prompt);
plugin.applyPromptTemplate("polish", savedTemplateId);
assert.equal(plugin.settings.polish.prompt, "Edited prompt");
plugin.deletePromptTemplate("polish", savedTemplateId);
assert.equal(plugin.getPromptTemplates("polish").length, templateCount);

plugin.settings.polish.model = "custom-model";
plugin.applyProviderPreset("polish", "deepseek");
assert.equal(plugin.settings.polish.model, "deepseek-v4-flash");

plugin.settings.polish.apiKey = "sk-polish";
plugin.settings.polish.endpoint = "https://api.example.test/v1/chat/completions";
plugin.settings.polish.model = "polish-model";
plugin.settings.polish.sourceLanguage = "auto";
plugin.settings.polish.targetLanguage = "德语";
plugin.settings.polish.temperature = 0.7;
plugin.settings.polish.maxTokens = 500;
plugin.settings.polish.prompt = "把输入润色得自然一点，输出为 {targetLanguage}。";
const fakeStatus = { dataset: { daitKind: "polish" } };
plugin.setApiStatus(fakeStatus, "success", plugin.t("apiStatusSuccess"), "");
assert.equal(fakeStatus.className, "dait-api-status dait-api-status-success");
assert.deepEqual(plugin.getApiStatus("polish"), { state: "success", message: "" });
plugin.resetApiStatus("polish");
assert.deepEqual(plugin.getApiStatus("polish"), { state: "untested", message: "" });

plugin.settings.translation.apiKey = "sk-translation";
plugin.settings.translation.endpoint = "https://api.translate.test/v1/chat/completions";
plugin.settings.translation.model = "translation-model";
plugin.settings.translation.sourceLanguage = "法语";
plugin.settings.translation.targetLanguage = "英语";
plugin.settings.translation.temperature = 0.1;
plugin.settings.translation.maxTokens = 900;
plugin.settings.translation.prompt = "自然翻译为 {{targetLanguage}}。";

const polishRequest = plugin.buildModelRequest("polish", "hello world");
assert.equal(polishRequest.endpoint, "https://api.example.test/v1/chat/completions");
assert.equal(polishRequest.request.headers.Authorization, "Bearer sk-polish");
assert.equal(polishRequest.request.body.model, "polish-model");
assert.equal(polishRequest.request.body.temperature, 0.7);
assert.equal(polishRequest.request.body.max_tokens, 500);
assert.deepEqual(polishRequest.request.body.thinking, { type: "disabled" });
assert.equal(polishRequest.request.body.messages[0].role, "system");
assert.match(polishRequest.request.body.messages[0].content, /user template as behavior instructions/);
assert.match(polishRequest.request.body.messages[0].content, /Input language: auto-detect/);
assert.match(polishRequest.request.body.messages[0].content, /Output language: 德语/);
assert.match(polishRequest.request.body.messages[0].content, /把输入润色得自然一点/);
assert.equal(polishRequest.request.body.messages[1].content, "hello world");

const polishTestRequest = plugin.buildConnectionTestRequest("polish");
assert.equal(polishTestRequest.endpoint, "https://api.example.test/v1/chat/completions");
assert.equal(polishTestRequest.request.headers.Authorization, "Bearer sk-polish");
assert.equal(polishTestRequest.request.body.model, "polish-model");
assert.equal(polishTestRequest.request.body.temperature, 0);
assert.equal(polishTestRequest.request.body.max_tokens, 32);
assert.deepEqual(polishTestRequest.request.body.thinking, { type: "disabled" });
assert.equal(polishTestRequest.request.body.messages[0].content, "Reply with OK only.");

plugin.settings.polish.enableThinking = true;
const polishThinkingRequest = plugin.buildModelRequest("polish", "hello world");
assert.deepEqual(polishThinkingRequest.request.body.thinking, { type: "enabled" });
assert.equal("temperature" in polishThinkingRequest.request.body, false);
plugin.settings.polish.enableThinking = false;

const translationRequest = plugin.buildModelRequest("translation", "bonjour");
assert.equal(translationRequest.endpoint, "https://api.translate.test/v1/chat/completions");
assert.equal(translationRequest.request.headers.Authorization, "Bearer sk-translation");
assert.equal(translationRequest.request.body.model, "translation-model");
assert.equal(translationRequest.request.body.temperature, 0.1);
assert.equal(translationRequest.request.body.max_tokens, 900);
assert.deepEqual(translationRequest.request.body.thinking, { type: "disabled" });
assert.match(translationRequest.request.body.messages[0].content, /Input language: 法语/);
assert.match(translationRequest.request.body.messages[0].content, /Output language: 英语/);
assert.match(translationRequest.request.body.messages[0].content, /自然翻译为 英语/);
assert.equal(translationRequest.request.body.messages[1].content, "bonjour");

plugin.settings.polish.targetLanguage = "繁体中文";
plugin.settings.polish.prompt = "Rewrite in {targetLanguage}.";
const traditionalPolishRequest = plugin.buildModelRequest("polish", "日本人的军国主义");
assert.match(traditionalPolishRequest.request.body.messages[0].content, /Output language: Traditional Chinese/);
assert.match(traditionalPolishRequest.request.body.messages[0].content, /do not use Simplified Chinese/);
assert.match(traditionalPolishRequest.request.body.messages[0].content, /Rewrite in Traditional Chinese/);

const sakuraPlugin = new Plugin();
sakuraPlugin.settings.translation.provider = "sakuraLocal";
sakuraPlugin.settings.translation.apiKey = "";
sakuraPlugin.settings.translation.endpoint = "";
sakuraPlugin.settings.translation.model = "";
assert.equal(sakuraPlugin.hasUsableApiConfig("translation"), true);
const sakuraRequest = sakuraPlugin.buildModelRequest("translation", "hello local");
assert.equal(sakuraRequest.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
assert.equal(sakuraRequest.request.headers.Authorization, undefined);
assert.equal(sakuraRequest.request.body.model, "local-model");
assert.equal(
    sakuraPlugin.getLocalProviderModelsEndpoint("http://127.0.0.1:8080/v1/chat/completions"),
    "http://127.0.0.1:8080/v1/models"
);
assert.equal(
    sakuraPlugin.parseLocalProviderModelsResponse(JSON.stringify({ data: [{ id: "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf" }] })),
    "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf"
);
assert.equal(sakuraPlugin.getDiagnosticModelLabel("C:\\models\\HY-MT1.5-1.8B-Q4_K_M_2.gguf"), "HY-MT1.5-1.8B-Q4_K_M_2.gguf");
sakuraPlugin.setCachedLocalProviderDetectedModel(sakuraPlugin.settings.translation, "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf");
const sakuraDetectedRequest = sakuraPlugin.buildModelRequest("translation", "hello detected local");
assert.equal(sakuraDetectedRequest.request.body.model, "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf");
sakuraPlugin.settings.translation.model = "manual-local.gguf";
const sakuraExplicitRequest = sakuraPlugin.buildModelRequest("translation", "hello explicit local");
assert.equal(sakuraExplicitRequest.request.body.model, "manual-local.gguf");
sakuraPlugin.settings.translation.model = "";
const sakuraTestRequest = sakuraPlugin.buildConnectionTestRequest("translation");
assert.equal(sakuraTestRequest.request.headers.Authorization, undefined);
sakuraPlugin.settings.translation.apiKey = "local-secret";
const sakuraKeyedRequest = sakuraPlugin.buildModelRequest("translation", "hello keyed local");
assert.equal(sakuraKeyedRequest.request.headers.Authorization, "Bearer local-secret");
sakuraPlugin.settings.translation.apiKey = "";
sakuraPlugin.applyProviderPreset("translation", "sakuraLocal");
assert.equal(sakuraPlugin.settings.translation.endpoint, "http://127.0.0.1:8080/v1/chat/completions");
assert.equal(sakuraPlugin.settings.translation.model, "local-model");
sakuraPlugin.settings.ui.autoTranslateMessages = true;
sakuraPlugin.settings.ui.autoTranslateConcurrency = 8;
assert.equal(sakuraPlugin.getAutoTranslateConcurrency(), 8);
assert.equal(sakuraPlugin.getAutoTranslationRequestBatchSize(), 1);

const googlePlugin = new Plugin();
googlePlugin.settings.translation.provider = "googleCloud";
googlePlugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
googlePlugin.settings.translation.model = "";
googlePlugin.settings.translation.sourceLanguage = "auto";
googlePlugin.settings.translation.targetLanguage = "姹夎";
googlePlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|450000\nbackup|AIza-backup|450000";
googlePlugin.settings.googleTranslate.keys = googlePlugin.normalizeGoogleTranslateKeyPool(googlePlugin.settings.googleTranslate).keys;
assert.equal(googlePlugin.hasUsableApiConfig("translation"), true);
const googleRequest = googlePlugin.buildModelRequest("translation", "bonjour");
assert.equal(googleRequest.endpoint, "https://translation.googleapis.com/language/translate/v2");
assert.equal(googleRequest.request.headers["X-Goog-Api-Key"], "AIza-main");
assert.equal(googleRequest.request.provider, "googleCloud");
assert.equal(googleRequest.request.responseParser, "googleTranslate");
assert.equal(googleRequest.request.headers.Authorization, undefined);
assert.deepEqual(googleRequest.request.body, { q: "bonjour", target: "zh-CN", format: "text" });
assert.equal(googleRequest.request.googleTranslate.charCount, 7);
googlePlugin.settings.translation.targetLanguage = "Traditional Chinese";
const googleTraditionalRequest = googlePlugin.buildModelRequest("translation", "bonjour");
assert.deepEqual(googleTraditionalRequest.request.body, { q: "bonjour", target: "zh-TW", format: "text" });
googlePlugin.settings.translation.targetLanguage = "姹夎";
googlePlugin.settings.translation.sourceLanguage = "娉曡";
const googleSourceRequest = googlePlugin.buildModelRequest("translation", "bonjour");
assert.equal(googleSourceRequest.request.body.source, "fr");
assert.equal(googlePlugin.getAutoTranslationRequestBatchSize(), 20);
const googleProtectedRequest = googlePlugin.buildModelRequest("translation", "Fix `bug()` <@123456789012345678> https://example.invalid/a :ok_hand:");
const googleProtectedQ = googleProtectedRequest.request.body.q;
assert.match(googleProtectedQ, /__DAIT_KEEP_000__/);
assert.doesNotMatch(googleProtectedQ, /<@123456789012345678>|https:\/\/example\.invalid|`bug\(\)`|:ok_hand:/);
assert.equal(
    googlePlugin.parseGoogleTranslateResponse(
        JSON.stringify({ data: { translations: [{ translatedText: "修复 __DAIT_KEEP_000__ __DAIT_KEEP_001__ __DAIT_KEEP_002__ __DAIT_KEEP_003__" }] } }),
        1,
        { restoreMaps: googleProtectedRequest.request.googleTranslate.restoreMaps }
    ),
    "修复 `bug()` <@123456789012345678> https://example.invalid/a :ok_hand:"
);
const googleProtectedBatch = googlePlugin.buildGoogleTranslateRequest([
    "Open https://first.invalid",
    "Ping <#123456789012345678> and `x`"
], googlePlugin.settings.translation);
assert.equal(Array.isArray(googleProtectedBatch.request.body.q), true);
assert.doesNotMatch(googleProtectedBatch.request.body.q.join("\n"), /https:\/\/first\.invalid|<#123456789012345678>|`x`/);
assert.deepEqual(
    googlePlugin.parseGoogleTranslateResponse(
        JSON.stringify({ data: { translations: [{ translatedText: "打开 __DAIT_KEEP_000__" }, { translatedText: "查看 __DAIT_KEEP_000__ 和 __DAIT_KEEP_001__" }] } }),
        2,
        { asArray: true, restoreMaps: googleProtectedBatch.request.googleTranslate.restoreMaps }
    ),
    ["打开 https://first.invalid", "查看 <#123456789012345678> 和 `x`"]
);
const googleCacheSnapshotPlugin = new Plugin();
googleCacheSnapshotPlugin.settings.translation.provider = "googleCloud";
googleCacheSnapshotPlugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
googleCacheSnapshotPlugin.settings.translation.model = "deepseek-v4-flash";
googleCacheSnapshotPlugin.settings.translation.temperature = 1.7;
googleCacheSnapshotPlugin.settings.translation.maxTokens = 9999;
googleCacheSnapshotPlugin.settings.translation.prompt = "stale hidden prompt";
googleCacheSnapshotPlugin.settings.translation.targetLanguage = "English";
const googleCacheKeyA = googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
googleCacheSnapshotPlugin.settings.translation.endpoint = "https://api.openai.com/v1/chat/completions";
googleCacheSnapshotPlugin.settings.translation.model = "gpt-hidden";
googleCacheSnapshotPlugin.settings.translation.temperature = 0.1;
googleCacheSnapshotPlugin.settings.translation.maxTokens = 1;
googleCacheSnapshotPlugin.settings.translation.prompt = "another stale prompt";
const googleCacheKeyB = googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
assert.equal(googleCacheKeyA, googleCacheKeyB);
assert.equal(googleCacheKeyA.includes("deepseek"), false);
assert.equal(googleCacheKeyA.includes("stale hidden prompt"), false);
googleCacheSnapshotPlugin.settings.translation.targetLanguage = "zh-TW";
const googleCacheKeyC = googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
assert.notEqual(googleCacheKeyA, googleCacheKeyC);
assert.equal(
    googleCacheSnapshotPlugin.getTranslationCacheKey("bonjour", { mode: "manual", promptPolicyVersion: "ignored-google-policy" }),
    googleCacheKeyC
);
googlePlugin.settings.googleTranslate.keys[0].usedChars = 449998;
const googleSwitchRequest = googlePlugin.buildGoogleTranslateRequest("bonjour", googlePlugin.settings.translation);
assert.equal(googleSwitchRequest.request.headers["X-Goog-Api-Key"], "AIza-backup");
googlePlugin.settings.googleTranslate.keys[1].usedChars = 449998;
expectThrowsMessage(() => googlePlugin.buildGoogleTranslateRequest("bonjour", googlePlugin.settings.translation), "Google");

const microsoftPlugin = new Plugin();
microsoftPlugin.settings.translation.provider = "microsoft";
microsoftPlugin.settings.translation.apiKey = "ms-key";
microsoftPlugin.settings.translation.endpoint = "https://api.cognitive.microsofttranslator.com/translate";
microsoftPlugin.settings.translation.region = "eastasia";
microsoftPlugin.settings.translation.sourceLanguage = "auto";
microsoftPlugin.settings.translation.targetLanguage = "Traditional Chinese";
assert.equal(microsoftPlugin.hasUsableApiConfig("translation"), true);
const microsoftRequest = microsoftPlugin.buildModelRequest("translation", "bonjour");
assert.match(microsoftRequest.endpoint, /^https:\/\/api\.cognitive\.microsofttranslator\.com\/translate\?api-version=3\.0&to=zh-Hant$/);
assert.equal(microsoftRequest.request.provider, "microsoft");
assert.equal(microsoftRequest.request.responseParser, "microsoftTranslate");
assert.equal(microsoftRequest.request.headers["Ocp-Apim-Subscription-Key"], "ms-key");
assert.equal(microsoftRequest.request.headers["Ocp-Apim-Subscription-Region"], "eastasia");
assert.deepEqual(microsoftRequest.request.body, [{ Text: "bonjour" }]);
assert.equal(
    microsoftPlugin.parseMicrosoftTranslateResponse(JSON.stringify([{ translations: [{ text: "浣犲ソ" }] }])),
    "浣犲ソ"
);
assert.deepEqual(
    microsoftPlugin.parseMicrosoftTranslateResponse(JSON.stringify([{ translations: [{ text: "one" }] }, { translations: [{ text: "two" }] }]), 2, { asArray: true }),
    ["one", "two"]
);
const microsoftAuthError = Object.assign(new Error("unauthorized"), { status: 401 });
microsoftPlugin.annotateTranslateProviderApiError(microsoftAuthError, "401 unauthorized", microsoftRequest.request);
assert.equal(microsoftPlugin.getAutoTranslationFailureType(microsoftAuthError), "auth");
const microsoftRateError = Object.assign(new Error("too many"), { status: 429 });
microsoftPlugin.annotateTranslateProviderApiError(microsoftRateError, "too many requests", microsoftRequest.request);
assert.equal(microsoftPlugin.getAutoTranslationFailureType(microsoftRateError), "rate-limit");
const microsoftServerError = Object.assign(new Error("server"), { status: 503 });
microsoftPlugin.annotateTranslateProviderApiError(microsoftServerError, "server", microsoftRequest.request);
assert.equal(microsoftPlugin.getAutoTranslationFailureType(microsoftServerError), "server");
const microsoftRegionKey = microsoftPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
microsoftPlugin.settings.translation.region = "westus";
assert.notEqual(microsoftPlugin.getTranslationCacheKey("bonjour", { mode: "manual" }), microsoftRegionKey);

const deeplPlugin = new Plugin();
deeplPlugin.settings.translation.provider = "deepl";
deeplPlugin.settings.translation.apiKey = "deepl-key";
deeplPlugin.settings.translation.sourceLanguage = "auto";
deeplPlugin.settings.translation.targetLanguage = "Chinese";
deeplPlugin.settings.translation.deeplPlan = "free";
assert.equal(deeplPlugin.hasUsableApiConfig("translation"), true);
const deeplFreeRequest = deeplPlugin.buildModelRequest("translation", ["hello", "world"]);
assert.equal(deeplFreeRequest.endpoint, "https://api-free.deepl.com/v2/translate");
assert.equal(deeplFreeRequest.request.provider, "deepl");
assert.equal(deeplFreeRequest.request.headers.Authorization, "DeepL-Auth-Key deepl-key");
// As a target DeepL needs the explicit variant; plain "ZH" is only valid as source_lang.
assert.deepEqual(deeplFreeRequest.request.body, { text: ["hello", "world"], target_lang: "ZH-HANS" });
deeplPlugin.settings.translation.deeplPlan = "pro";
const deeplProRequest = deeplPlugin.buildModelRequest("translation", "hello");
assert.equal(deeplProRequest.endpoint, "https://api.deepl.com/v2/translate");
assert.equal(
    deeplPlugin.parseDeepLTranslateResponse(JSON.stringify({ translations: [{ text: "浣犲ソ" }] })),
    "浣犲ソ"
);
assert.deepEqual(
    deeplPlugin.parseDeepLTranslateResponse(JSON.stringify({ translations: [{ text: "one" }, { text: "two" }] }), 2, { asArray: true }),
    ["one", "two"]
);
assert.throws(
    () => deeplPlugin.parseDeepLTranslateResponse("{"),
    error => error.providerParseFailed === true && deeplPlugin.getAutoTranslationFailureType(error) === "parse"
);
const deeplAuthError = Object.assign(new Error("forbidden"), { status: 403 });
deeplPlugin.annotateTranslateProviderApiError(deeplAuthError, "403 forbidden", deeplProRequest.request);
assert.equal(deeplPlugin.getAutoTranslationFailureType(deeplAuthError), "auth");
const deeplLimitError = Object.assign(new Error("quota"), { status: 456 });
deeplPlugin.annotateTranslateProviderApiError(deeplLimitError, "456 character limit exceeded", deeplProRequest.request);
assert.equal(deeplPlugin.getAutoTranslationFailureType(deeplLimitError), "quota");
const deeplPlanKey = deeplPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
deeplPlugin.settings.translation.deeplPlan = "free";
assert.notEqual(deeplPlugin.getTranslationCacheKey("bonjour", { mode: "manual" }), deeplPlanKey);

const baiduPlugin = new Plugin();
baiduPlugin.settings.translation.provider = "baidu";
baiduPlugin.settings.translation.endpoint = "https://fanyi-api.baidu.com/api/trans/vip/translate";
baiduPlugin.settings.translation.appId = "baidu-app";
baiduPlugin.settings.translation.secretKey = "baidu-secret";
baiduPlugin.settings.translation.sourceLanguage = "auto";
baiduPlugin.settings.translation.targetLanguage = "Chinese";
assert.equal(baiduPlugin.hasUsableApiConfig("translation"), true);
assert.equal(baiduPlugin.createMd5Hash("abc"), "900150983cd24fb0d6963f7d28e17f72");
const savedDateNowForBaidu = Date.now;
Date.now = () => 12345;
const baiduRequest = baiduPlugin.buildModelRequest("translation", "bonjour");
Date.now = savedDateNowForBaidu;
assert.equal(baiduRequest.endpoint, "https://fanyi-api.baidu.com/api/trans/vip/translate");
assert.equal(baiduRequest.request.provider, "baidu");
assert.equal(baiduRequest.request.bodyEncoding, "form");
assert.equal(baiduRequest.request.body.appid, "baidu-app");
assert.equal(baiduRequest.request.body.from, "auto");
assert.equal(baiduRequest.request.body.to, "zh");
assert.equal(baiduRequest.request.body.sign, baiduPlugin.createMd5Hash("baidu-appbonjour12345baidu-secret"));
assert.equal(
    baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ trans_result: [{ src: "bonjour", dst: "浣犲ソ" }] })),
    "浣犲ソ"
);
assert.throws(
    () => baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "54003", error_msg: "too many requests" })),
    error => error.providerRateLimited === true && baiduPlugin.getAutoTranslationFailureType(error) === "rate-limit"
);
assert.throws(
    () => baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "54004", error_msg: "quota" })),
    error => error.providerQuotaExceeded === true && baiduPlugin.getAutoTranslationFailureType(error) === "quota"
);
assert.throws(
    () => baiduPlugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "52003", error_msg: "auth" })),
    error => error.providerAuthFailed === true && baiduPlugin.getAutoTranslationFailureType(error) === "auth"
);
const baiduAppKey = baiduPlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
baiduPlugin.settings.translation.appId = "baidu-app-2";
assert.notEqual(baiduPlugin.getTranslationCacheKey("bonjour", { mode: "manual" }), baiduAppKey);

const googleReservationPlugin = new Plugin();
googleReservationPlugin.settings.translation.provider = "googleCloud";
googleReservationPlugin.settings.translation.targetLanguage = "English";
googleReservationPlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|5\nbackup|AIza-backup|100";
googleReservationPlugin.settings.googleTranslate.keys = googleReservationPlugin.normalizeGoogleTranslateKeyPool(googleReservationPlugin.settings.googleTranslate).keys;
googleReservationPlugin.settings.googleTranslate.keys[0].usedChars = 3;
const googleReservedMain = googleReservationPlugin.buildGoogleTranslateRequest("ab", googleReservationPlugin.settings.translation, { reserve: true });
assert.equal(googleReservedMain.request.headers["X-Goog-Api-Key"], "AIza-main");
assert.equal(googleReservationPlugin.getGoogleTranslateReservedChars(googleReservedMain.request.googleTranslate.keyId), 2);
const googleReservedBackup = googleReservationPlugin.buildGoogleTranslateRequest("c", googleReservationPlugin.settings.translation, { reserve: true });
assert.equal(googleReservedBackup.request.headers["X-Goog-Api-Key"], "AIza-backup");
googleReservationPlugin.releaseGoogleTranslateRequestReservation(googleReservedMain.request);
googleReservationPlugin.releaseGoogleTranslateRequestReservation(googleReservedBackup.request);
assert.equal([...googleReservationPlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

const googleUsagePlugin = new Plugin();
googleUsagePlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|450000\nmain-dupe|AIza-main|450000\nbackup|AIza-backup|100000";
const normalizedGooglePool = googleUsagePlugin.normalizeGoogleTranslateKeyPool(googleUsagePlugin.settings.googleTranslate);
assert.equal(normalizedGooglePool.keys.length, 2);
assert.equal(normalizedGooglePool.keys[0].label, "main");
assert.equal(normalizedGooglePool.keys[1].monthlyLimit, 100000);
googleUsagePlugin.settings.googleTranslate.keys = normalizedGooglePool.keys;
googleUsagePlugin.markGoogleTranslateKeyUsage("AIza-main", 3);
assert.equal(googleUsagePlugin.settings.googleTranslate.keys[0].usedChars, 3);
clearTimeout(googleUsagePlugin.scanTimer);
googleUsagePlugin.scanTimer = null;

const sakuraBatchPlugin = new Plugin();
sakuraBatchPlugin.settings.translation.provider = "sakuraLocal";
sakuraBatchPlugin.settings.translation.apiKey = "";
const sakuraBatchOptions = sakuraBatchPlugin.getAutoTranslationOptions();
sakuraBatchPlugin.isElementVisibleInViewport = () => true;
sakuraBatchPlugin.getReadyAutoTranslationTargets = item => [item];
sakuraBatchPlugin.getAutoTranslationPrimaryTarget = target => target;
sakuraBatchPlugin.autoTranslationQueue = Array.from({ length: 5 }, (_, index) => ({
    messageNode: { isConnected: true },
    content: { isConnected: true },
    text: `local-${index}`,
    cacheKey: `local-${index}`,
    requestOptions: sakuraBatchOptions
}));
const sakuraBatch = sakuraBatchPlugin.takeAutoTranslationBatch();
assert.equal(sakuraBatch.length, 1);
assert.equal(sakuraBatchPlugin.autoTranslationQueue.length, 4);

const longSingleBatchPlugin = new Plugin();
const longSingleOptions = longSingleBatchPlugin.getAutoTranslationOptions();
longSingleBatchPlugin.isElementVisibleInViewport = () => true;
longSingleBatchPlugin.getReadyAutoTranslationTargets = item => [item];
longSingleBatchPlugin.getAutoTranslationPrimaryTarget = target => target;
const longSingleText = "bonjour ".repeat(80);
longSingleBatchPlugin.autoTranslationQueue = [
    {
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: longSingleText,
        cacheKey: "long-single",
        requestOptions: longSingleOptions
    },
    {
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: "short nearby",
        cacheKey: "short-nearby",
        requestOptions: longSingleOptions
    }
];
const longSingleBatch = longSingleBatchPlugin.takeAutoTranslationBatch();
assert.equal(longSingleBatch.length, 1);
assert.equal(longSingleBatch[0].cacheKey, "long-single");
assert.equal(longSingleBatchPlugin.autoTranslationQueue.length, 1);
assert.equal(longSingleBatchPlugin.autoTranslationQueue[0].cacheKey, "short-nearby");

const queueTypeSortPlugin = new Plugin();
queueTypeSortPlugin.isElementVisibleInViewport = element => element?.visible === true;
const queueTypeSortOptions = queueTypeSortPlugin.getAutoTranslationOptions();
const queueTypeVisibleShort = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "visible short" },
    text: "visible short",
    cacheKey: "queue-visible-short",
    requestOptions: queueTypeSortOptions,
    priority: 10
};
const queueTypeVisibleLong = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: longSingleText },
    text: longSingleText,
    cacheKey: "queue-visible-long",
    requestOptions: queueTypeSortOptions,
    priority: 1
};
const queueTypePrefetch = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "prefetch text" },
    text: "prefetch text",
    cacheKey: "queue-prefetch",
    requestOptions: queueTypeSortOptions,
    priority: 100001
};
queueTypeSortPlugin.autoTranslationQueue = [queueTypePrefetch, queueTypeVisibleLong, queueTypeVisibleShort];
queueTypeSortPlugin.sortAutoTranslationQueue();
assert.deepEqual(queueTypeSortPlugin.autoTranslationQueue.map(item => item.cacheKey), [
    "queue-visible-short",
    "queue-visible-long",
    "queue-prefetch"
]);
assert.equal(queueTypeSortPlugin.getAutoTranslationDiagnosticQueueType(queueTypeVisibleShort), "visible");
assert.equal(queueTypeSortPlugin.getAutoTranslationDiagnosticQueueType(queueTypeVisibleLong), "longText");
assert.equal(queueTypeSortPlugin.getAutoTranslationDiagnosticQueueType(queueTypePrefetch), "prefetch");
const queueTypeDiagnosticMeta = queueTypeSortPlugin.getAutoTranslationDiagnosticMeta(
    queueTypeVisibleShort,
    "queuedVisible",
    "enqueued"
);
assert.equal(queueTypeDiagnosticMeta.queueType, "visible");
assert.equal(Number.isFinite(queueTypeDiagnosticMeta.queuePriority), true);

const longVisibleYieldPlugin = new Plugin();
longVisibleYieldPlugin.settings.ui.autoTranslateMessages = true;
longVisibleYieldPlugin.settings.ui.autoTranslateConcurrency = 1;
longVisibleYieldPlugin.getViewportPriority = element => element?.priority ?? 9999;
longVisibleYieldPlugin.isElementVisibleInViewport = element => element?.visible === true;
longVisibleYieldPlugin.isAutoTranslationTargetInScanRange = () => true;
longVisibleYieldPlugin.hasCurrentTranslationLine = () => false;
longVisibleYieldPlugin.getElementText = content => content.text;
const longVisibleYieldOptions = longVisibleYieldPlugin.getAutoTranslationOptions();
const longVisibleYieldStarts = [];
longVisibleYieldPlugin.autoTranslateQueuedMessage = item => {
    longVisibleYieldStarts.push(item.cacheKey);
};
const longVisibleYieldLong = {
    messageNode: { isConnected: true, visible: true, priority: 1 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 1, text: longSingleText },
    text: longSingleText,
    cacheKey: "long-visible-yield",
    requestOptions: longVisibleYieldOptions
};
const longVisibleYieldShort = {
    messageNode: { isConnected: true, visible: true, priority: 2 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 2, text: "short visible nearby" },
    text: "short visible nearby",
    cacheKey: "short-visible-nearby",
    requestOptions: longVisibleYieldOptions
};
longVisibleYieldPlugin.enqueueAutoTranslationItem(longVisibleYieldLong);
longVisibleYieldPlugin.enqueueAutoTranslationItem(longVisibleYieldShort);
longVisibleYieldPlugin.addAutoTranslationPendingTarget(longVisibleYieldLong.cacheKey, longVisibleYieldLong);
longVisibleYieldPlugin.addAutoTranslationPendingTarget(longVisibleYieldShort.cacheKey, longVisibleYieldShort);
longVisibleYieldPlugin.drainAutoTranslationQueue();
assert.deepEqual(longVisibleYieldStarts, ["short-visible-nearby"]);
assert.equal(longVisibleYieldPlugin.autoTranslationQueue[0].cacheKey, "long-visible-yield");

const longVisibleBetterShortPlugin = new Plugin();
longVisibleBetterShortPlugin.settings.ui.autoTranslateMessages = true;
longVisibleBetterShortPlugin.settings.ui.autoTranslateConcurrency = 1;
longVisibleBetterShortPlugin.getViewportPriority = element => element?.priority ?? 9999;
longVisibleBetterShortPlugin.isElementVisibleInViewport = element => element?.visible === true;
longVisibleBetterShortPlugin.isAutoTranslationTargetInScanRange = () => true;
longVisibleBetterShortPlugin.hasCurrentTranslationLine = () => false;
longVisibleBetterShortPlugin.getElementText = content => content.text;
const longVisibleBetterShortOptions = longVisibleBetterShortPlugin.getAutoTranslationOptions();
const longVisibleBetterShortStarts = [];
longVisibleBetterShortPlugin.autoTranslateQueuedMessage = item => {
    longVisibleBetterShortStarts.push(item.cacheKey);
};
const longVisibleBetterLong = {
    messageNode: { isConnected: true, visible: true, priority: 1 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 1, text: longSingleText },
    text: longSingleText,
    cacheKey: "long-visible-better",
    requestOptions: longVisibleBetterShortOptions
};
const longVisibleBetterShort = {
    messageNode: { isConnected: true, visible: true, priority: 0 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 0, text: "higher priority short visible" },
    text: "higher priority short visible",
    cacheKey: "short-visible-better",
    requestOptions: longVisibleBetterShortOptions
};
longVisibleBetterShortPlugin.enqueueAutoTranslationItem(longVisibleBetterLong);
longVisibleBetterShortPlugin.enqueueAutoTranslationItem(longVisibleBetterShort);
longVisibleBetterShortPlugin.addAutoTranslationPendingTarget(longVisibleBetterLong.cacheKey, longVisibleBetterLong);
longVisibleBetterShortPlugin.addAutoTranslationPendingTarget(longVisibleBetterShort.cacheKey, longVisibleBetterShort);
longVisibleBetterShortPlugin.drainAutoTranslationQueue();
assert.deepEqual(longVisibleBetterShortStarts, ["short-visible-better"]);
assert.equal(longVisibleBetterShortPlugin.autoTranslationQueue[0].cacheKey, "long-visible-better");

const longVisibleActiveLongPlugin = new Plugin();
longVisibleActiveLongPlugin.settings.ui.autoTranslateMessages = true;
longVisibleActiveLongPlugin.settings.ui.autoTranslateConcurrency = 2;
longVisibleActiveLongPlugin.getViewportPriority = element => element?.priority ?? 9999;
longVisibleActiveLongPlugin.isElementVisibleInViewport = element => element?.visible === true;
longVisibleActiveLongPlugin.isAutoTranslationTargetInScanRange = () => true;
longVisibleActiveLongPlugin.hasCurrentTranslationLine = () => false;
longVisibleActiveLongPlugin.getElementText = content => content.text;
const longVisibleActiveLongOptions = longVisibleActiveLongPlugin.getAutoTranslationOptions();
const longVisibleActiveLongStarts = [];
longVisibleActiveLongPlugin.autoTranslateQueuedMessage = item => {
    longVisibleActiveLongStarts.push(item.cacheKey);
};
longVisibleActiveLongPlugin.autoTranslationInFlight = 1;
longVisibleActiveLongPlugin.autoTranslationInFlightItems = 1;
longVisibleActiveLongPlugin.autoTranslationInFlightKeys.add("already-running-long");
longVisibleActiveLongPlugin.autoTranslationVisibleLongInFlightKeys.add("already-running-long");
longVisibleActiveLongPlugin.autoTranslationInFlightStartedAt.set("already-running-long", Date.now());
const longVisibleActiveLong = {
    messageNode: { isConnected: true, visible: true, priority: 1 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 1, text: longSingleText },
    text: longSingleText,
    cacheKey: "long-visible-active-long",
    requestOptions: longVisibleActiveLongOptions
};
const longVisibleActiveShort = {
    messageNode: { isConnected: true, visible: true, priority: 2 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 2, text: "short runs while long is active" },
    text: "short runs while long is active",
    cacheKey: "short-with-active-long",
    requestOptions: longVisibleActiveLongOptions
};
longVisibleActiveLongPlugin.enqueueAutoTranslationItem(longVisibleActiveLong);
longVisibleActiveLongPlugin.enqueueAutoTranslationItem(longVisibleActiveShort);
longVisibleActiveLongPlugin.addAutoTranslationPendingTarget(longVisibleActiveLong.cacheKey, longVisibleActiveLong);
longVisibleActiveLongPlugin.addAutoTranslationPendingTarget(longVisibleActiveShort.cacheKey, longVisibleActiveShort);
longVisibleActiveLongPlugin.drainAutoTranslationQueue();
assert.deepEqual(longVisibleActiveLongStarts, ["short-with-active-long"]);
assert.equal(longVisibleActiveLongPlugin.autoTranslationQueue[0].cacheKey, "long-visible-active-long");

plugin.settings.translation.targetLanguage = "汉语";
plugin.settings.translation.enableThinking = true;
const autoTranslationRequest = plugin.buildModelRequest("translation", "bonjour", {
    configOverrides: plugin.getAutoTranslationOverrides()
});
assert.equal(autoTranslationRequest.request.body.temperature, 0);
assert.deepEqual(autoTranslationRequest.request.body.thinking, { type: "disabled" });
assert.match(autoTranslationRequest.request.body.messages[0].content, /Simplified Chinese \(中文, zh-CN\)/);
const autoRetryOptions = plugin.getAutoTranslationRetryOptions("source text", "???????");
assert.equal(autoRetryOptions.configOverrides.temperature, 0);
assert.equal(autoRetryOptions.configOverrides.enableThinking, false);
assert.match(autoRetryOptions.configOverrides.prompt, /Strict automatic channel translation retry/);
assert.match(autoRetryOptions.configOverrides.prompt, /previous_invalid_output/);
assert.match(autoRetryOptions.configOverrides.prompt, /\?\?\?\?\?\?\?/);
const promptLeakRetryOptions = plugin.getAutoTranslationRetryOptions("\u042d\u043c", promptLeakOutput);
assert.match(promptLeakRetryOptions.configOverrides.prompt, /Rejected prompt\/instruction leakage output/);
assert.equal(promptLeakRetryOptions.configOverrides.prompt.includes("\u5b9e\u65f6\u5b57\u5e55\u5c42"), false);
const autoBatchOptions = plugin.getAutoTranslationBatchOptions(2);
assert.equal(autoBatchOptions.routeKey, plugin.getCurrentRouteKey());
assert.equal(autoBatchOptions.configOverrides.temperature, 0);
assert.equal(autoBatchOptions.configOverrides.enableThinking, false);
assert.match(autoBatchOptions.configOverrides.prompt, /Batch automatic channel translation mode/);
assert.match(autoBatchOptions.configOverrides.prompt, /exactly 2 JSON objects/);
const autoBatchRetryOptions = plugin.getAutoTranslationBatchRetryOptions(2);
assert.equal(autoBatchRetryOptions.routeKey, plugin.getCurrentRouteKey());
assert.equal(autoBatchRetryOptions.configOverrides.temperature, 0);
assert.equal(autoBatchRetryOptions.configOverrides.enableThinking, false);
assert.match(autoBatchRetryOptions.configOverrides.prompt, /Strict batch automatic channel translation retry/);
assert.match(autoBatchRetryOptions.configOverrides.prompt, /exactly 2 JSON objects/);
const routeOptionsPlugin = new Plugin();
routeOptionsPlugin.getCurrentRouteKey = () => "guild-a:channel-a:jump-a";
const routeOptions = routeOptionsPlugin.getAutoTranslationOptions();
assert.equal(routeOptions.routeKey, "guild-a:channel-a:jump-a");
assert.equal(routeOptionsPlugin.isAutoTranslationRequestCurrent(routeOptions), true);
routeOptionsPlugin.getCurrentRouteKey = () => "guild-a:channel-b:";
assert.equal(routeOptionsPlugin.isAutoTranslationRequestCurrent(routeOptions), false);
const routeRetryOptions = routeOptionsPlugin.getAutoTranslationRetryOptions("hola", "hola", routeOptions);
assert.equal(routeRetryOptions.routeKey, "guild-a:channel-a:jump-a");
const routeFinalOptions = routeOptionsPlugin.getAutoTranslationFinalFallbackOptions("hola", routeOptions);
assert.equal(routeFinalOptions.routeKey, "guild-a:channel-a:jump-a");
const providerSnapshotPlugin = new Plugin();
providerSnapshotPlugin.settings.translation.apiKey = "sk-old";
providerSnapshotPlugin.settings.translation.endpoint = "https://old.example.test/v1/chat/completions";
providerSnapshotPlugin.settings.translation.model = "old-model";
const oldAutoOptions = providerSnapshotPlugin.getAutoTranslationOptions();
const oldProviderKey = providerSnapshotPlugin.getAutoTranslationProviderKey(oldAutoOptions);
providerSnapshotPlugin.settings.translation.apiKey = "sk-new";
providerSnapshotPlugin.settings.translation.endpoint = "https://new.example.test/v1/chat/completions";
providerSnapshotPlugin.settings.translation.model = "new-model";
assert.equal(providerSnapshotPlugin.getAutoTranslationProviderKey(oldAutoOptions), oldProviderKey);
assert.notEqual(providerSnapshotPlugin.getAutoTranslationProviderKey(providerSnapshotPlugin.getAutoTranslationOptions()), oldProviderKey);
providerSnapshotPlugin.settings.translation.apiKey = "";
providerSnapshotPlugin.settings.translation.endpoint = "";
providerSnapshotPlugin.settings.translation.model = "";
const oldAutoRequest = providerSnapshotPlugin.buildModelRequest("translation", "hola", {
    configOverrides: oldAutoOptions.configOverrides
});
assert.equal(oldAutoRequest.endpoint, "https://old.example.test/v1/chat/completions");
assert.equal(oldAutoRequest.request.headers.Authorization, "Bearer sk-old");
assert.equal(oldAutoRequest.request.body.model, "old-model");
const oldBatchOptions = providerSnapshotPlugin.getAutoTranslationBatchOptions(1, oldAutoOptions);
assert.equal(oldBatchOptions.configOverrides.apiKey, "sk-old");
assert.equal(oldBatchOptions.configOverrides.endpoint, "https://old.example.test/v1/chat/completions");
const oldRetryOptions = providerSnapshotPlugin.getAutoTranslationRetryOptions("hola", "hola", oldAutoOptions);
assert.equal(oldRetryOptions.configOverrides.apiKey, "sk-old");
assert.equal(oldRetryOptions.configOverrides.endpoint, "https://old.example.test/v1/chat/completions");
const oldRetryRequest = providerSnapshotPlugin.buildModelRequest("translation", "hola", {
    configOverrides: oldRetryOptions.configOverrides
});
assert.equal(oldRetryRequest.endpoint, "https://old.example.test/v1/chat/completions");
assert.equal(oldRetryRequest.request.headers.Authorization, "Bearer sk-old");
assert.notEqual(
    plugin.getModelRequestKey("https://api.example.test", { headers: { Authorization: "Bearer old" }, body: { model: "m", messages: [{ content: "p" }] } }, "input"),
    plugin.getModelRequestKey("https://api.example.test", { headers: { Authorization: "Bearer new" }, body: { model: "m", messages: [{ content: "p" }] } }, "input")
);
assert.notEqual(
    plugin.getModelRequestKey("https://translation.googleapis.com/language/translate/v2", {
        provider: "googleCloud",
        responseParser: "googleTranslate",
        googleTranslate: { apiKey: "AIza-same-key" },
        body: { q: ["a,b", "c"], target: "en" }
    }, ["a,b", "c"]),
    plugin.getModelRequestKey("https://translation.googleapis.com/language/translate/v2", {
        provider: "googleCloud",
        responseParser: "googleTranslate",
        googleTranslate: { apiKey: "AIza-same-key" },
        body: { q: ["a", "b,c"], target: "en" }
    }, ["a", "b,c"])
);
assert.deepEqual(
    plugin.parseAutoTranslationBatchOutput('[{"id":"001","translation":"one"},{"id":"002","translation":"two"}]'),
    [{ id: "001", translation: "one" }, { id: "002", translation: "two" }]
);
assert.deepEqual(
    plugin.parseAutoTranslationBatchOutput('```json\n{"translations":[{"id":"001","translation":"one"}]}\n```'),
    [{ id: "001", translation: "one" }]
);
assert.deepEqual(
    plugin.parseAutoTranslationBatchOutput('{"001":"one","002":"two"}'),
    [{ id: "001", translation: "one" }, { id: "002", translation: "two" }]
);
assert.deepEqual(
    plugin.parseAutoTranslationBatchOutput('{"translations":{"001":{"translated":"one"},"002":{"content":"two"}}}'),
    [{ id: "001", translated: "one" }, { id: "002", content: "two" }]
);
assert.deepEqual(
    plugin.parseAutoTranslationBatchOutput('{"id":1,"translated":"one"}'),
    [{ id: 1, translated: "one" }]
);
assert.deepEqual(
    plugin.parseAutoTranslationBatchOutput('note: {"warnings":[],"translations":{"1":"one","02":"two"}} done'),
    [{ id: "001", translation: "one" }, { id: "002", translation: "two" }]
);
assert.throws(
    () => plugin.parseAutoTranslationBatchOutput("not json"),
    error => error.code === "AUTO_BATCH_PARSE_FAILED"
);

const batchFieldPlugin = new Plugin();
assert.equal(batchFieldPlugin.normalizeBatchRowId("02"), "002");
assert.equal(batchFieldPlugin.extractBatchRowTranslation({ message: "one" }), "one");

const manualCacheKey = plugin.getTranslationCacheKey("bonjour", { mode: "manual" });
const legacyManualCacheKey = plugin.getLegacyTranslationCacheKey("bonjour", { mode: "manual" });
assert.notEqual(manualCacheKey, legacyManualCacheKey);
const manualCacheAliases = plugin.getTranslationCacheAliases("bonjour", { mode: "manual" });
assert.equal(manualCacheAliases.includes(legacyManualCacheKey), true);
assert.equal(manualCacheAliases.includes(plugin.getFullConfigTranslationCacheKey("bonjour", { mode: "manual" })), true);
assert.equal(manualCacheAliases.includes(plugin.getPreMessageIdentityTranslationCacheKey("bonjour", { mode: "manual" })), true);
assert.equal(manualCacheKey.includes(plugin.settings.translation.prompt), false);
const autoCacheKey = plugin.getTranslationCacheKey("bonjour", plugin.getAutoTranslationOptions());
assert.notEqual(manualCacheKey, autoCacheKey);
assert.notEqual(
    plugin.getTranslationCacheKey("bonjour", { mode: "manual", promptPolicyVersion: "translation-manual-vNEXT" }),
    manualCacheKey
);
assert.equal(
    plugin.getTranslationCacheAliases("bonjour", { mode: "manual", promptPolicyVersion: "translation-manual-vNEXT" }).includes(manualCacheKey),
    false
);
assert.equal(
    plugin.buildSystemPrompt("translation", plugin.settings.translation).includes(`Prompt policy version: ${plugin.getPromptPolicyVersion("manual")}.`),
    true
);
const promptPolicyBatchOptions = plugin.getAutoTranslationBatchOptions(2, plugin.getAutoTranslationOptions());
assert.equal(promptPolicyBatchOptions.promptPolicyVersion, plugin.getPromptPolicyVersion("autoBatch"));
assert.equal(promptPolicyBatchOptions.configOverrides.promptPolicyVersion, plugin.getPromptPolicyVersion("autoBatch"));
const promptPolicyRetryOptions = plugin.getAutoTranslationRetryOptions("source text", "bad output", plugin.getAutoTranslationOptions());
assert.equal(promptPolicyRetryOptions.promptPolicyVersion, plugin.getPromptPolicyVersion("autoRetry"));
assert.equal(promptPolicyRetryOptions.configOverrides.promptPolicyVersion, plugin.getPromptPolicyVersion("autoRetry"));
plugin.settings.translation.temperature = "0.20";
plugin.settings.translation.maxTokens = "900.2";
plugin.settings.translation.prompt = "  Cache prompt  ";
const normalizedCacheKey = plugin.getTranslationCacheKey("bonjour", { mode: "manual" });
plugin.settings.translation.temperature = 0.2;
plugin.settings.translation.maxTokens = 900;
plugin.settings.translation.prompt = "Cache prompt";
assert.equal(plugin.getTranslationCacheKey("bonjour", { mode: "manual" }), normalizedCacheKey);
const preIdentityCompatPlugin = new Plugin();
const preIdentityCompatOptions = {
    ...preIdentityCompatPlugin.getAutoTranslationOptions(),
    messageIdentity: "message:guild:channel:123456789012345678:source-hash"
};
const preIdentityModernKey = preIdentityCompatPlugin.getTranslationCacheKey("bonjour", preIdentityCompatOptions);
const preIdentityLegacyKey = preIdentityCompatPlugin.getPreMessageIdentityTranslationCacheKey("bonjour", preIdentityCompatOptions);
assert.notEqual(preIdentityModernKey, preIdentityLegacyKey);
assert.equal(preIdentityCompatPlugin.getTranslationCacheAliases("bonjour", preIdentityCompatOptions).includes(preIdentityLegacyKey), true);
assert.equal(preIdentityCompatPlugin.getTranslationLineCacheAliases("bonjour", preIdentityCompatOptions).includes(preIdentityLegacyKey), false);
preIdentityCompatPlugin.setTranslationCache(preIdentityLegacyKey, "legacy no identity translation");
preIdentityCompatPlugin.translationCache.delete(preIdentityModernKey);
preIdentityCompatPlugin.translationCacheMeta.delete(preIdentityModernKey);
assert.equal(
    preIdentityCompatPlugin.getTranslationCacheValue(preIdentityModernKey, preIdentityCompatPlugin.getTranslationCacheAliases("bonjour", preIdentityCompatOptions)),
    "legacy no identity translation"
);
assert.equal(preIdentityCompatPlugin.translationCache.get(preIdentityModernKey), "legacy no identity translation");
assert.equal(
    preIdentityCompatPlugin.getTranslationCacheValue(
        preIdentityCompatPlugin.getTranslationCacheKey("hola", preIdentityCompatOptions),
        preIdentityCompatPlugin.getTranslationCacheAliases("hola", preIdentityCompatOptions)
    ),
    null
);
clearTimeout(preIdentityCompatPlugin.translationCacheDirtyTimer);
preIdentityCompatPlugin.translationCacheDirtyTimer = null;
const cacheHitPersistPlugin = new Plugin();
const savedDateNowForCacheHitPersist = Date.now;
let cacheHitPersistNow = 1000000;
let cacheHitPersistPayload = null;
Date.now = () => cacheHitPersistNow;
cacheHitPersistPlugin.saveData = (key, value) => {
    if (key === "translationCache") cacheHitPersistPayload = value;
    return true;
};
cacheHitPersistPlugin.setTranslationCache("cache-hit-persist-key", "cache-hit-persist-value");
assert.equal(cacheHitPersistPlugin.flushTranslationCache({ retryOnError: false }), true);
const cacheHitPersistBefore = cacheHitPersistPlugin.translationCacheMeta.get("cache-hit-persist-key");
cacheHitPersistNow += 120000;
assert.equal(cacheHitPersistPlugin.getTranslationCacheValue("cache-hit-persist-key"), "cache-hit-persist-value");
assert.equal(cacheHitPersistPlugin.translationCacheDirty, true);
assert.equal(cacheHitPersistPlugin.flushTranslationCache({ retryOnError: false }), true);
const cacheHitPersistLoader = new Plugin();
cacheHitPersistLoader.loadData = key => key === "translationCache" ? cacheHitPersistPayload : null;
cacheHitPersistLoader.loadTranslationCache();
const cacheHitPersistAfter = cacheHitPersistLoader.translationCacheMeta.get("cache-hit-persist-key");
assert.equal(cacheHitPersistLoader.translationCache.get("cache-hit-persist-key"), "cache-hit-persist-value");
assert.ok(cacheHitPersistAfter.touchedAt > cacheHitPersistBefore.touchedAt);
assert.ok(cacheHitPersistAfter.expiresAt >= cacheHitPersistNow + 6 * 60 * 60 * 1000);
clearTimeout(cacheHitPersistPlugin.translationCacheDirtyTimer);
cacheHitPersistPlugin.translationCacheDirtyTimer = null;
Date.now = savedDateNowForCacheHitPersist;
const fakeTargetA = { messageNode: {}, content: { dataset: {} }, text: "same" };
const fakeTargetB = { messageNode: {}, content: { dataset: {} }, text: "same" };
plugin.addAutoTranslationPendingTarget("pending-key", fakeTargetA);
plugin.addAutoTranslationPendingTarget("pending-key", fakeTargetA);
plugin.addAutoTranslationPendingTarget("pending-key", fakeTargetB);
assert.equal(plugin.getAutoTranslationPendingTargets({ cacheKey: "pending-key" }).length, 2);
assert.equal(plugin.consumeAutoTranslationTargets({ cacheKey: "pending-key" }).length, 2);
assert.equal(plugin.autoTranslationPendingTargets.has("pending-key"), false);
const renderedFanout = [];
const fanoutPlugin = new Plugin();
fanoutPlugin.setTranslationCache = () => {};
fanoutPlugin.getElementText = content => content.text;
fanoutPlugin.isElementVisibleInViewport = () => true;
fanoutPlugin.renderTranslation = (messageNode, content, translated, cacheKey) => renderedFanout.push({ content, translated, cacheKey });
fanoutPlugin.removeTranslationNode = () => {};
const fanoutKey = "auto\n---\nkey";
const fanoutTargetA = { messageNode: { isConnected: true }, content: { dataset: {}, isConnected: true, text: "same" }, text: "same", cacheKey: fanoutKey };
const fanoutTargetB = { messageNode: { isConnected: true }, content: { dataset: {}, isConnected: true, text: "same" }, text: "same", cacheKey: fanoutKey };
fanoutPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetA);
fanoutPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetB);
fanoutPlugin.renderAutoTranslationResult(fanoutTargetA, "\u5df2\u7ffb\u8bd1");
assert.equal(renderedFanout.length, 2);
assert.equal(fanoutPlugin.autoTranslationPendingTargets.has(fanoutKey), false);

const invisibleResultPlugin = new Plugin();
let invisibleResultRemoved = false;
let invisibleResultRendered = false;
invisibleResultPlugin.getElementText = content => content.text;
invisibleResultPlugin.isElementVisibleInViewport = () => false;
invisibleResultPlugin.renderTranslation = () => { invisibleResultRendered = true; };
invisibleResultPlugin.removeAutoTranslationNode = () => { invisibleResultRemoved = true; };
const invisibleResultItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same invisible" },
    text: "same invisible",
    requestOptions: invisibleResultPlugin.getAutoTranslationOptions()
};
invisibleResultItem.cacheKey = invisibleResultPlugin.getTranslationCacheKey(invisibleResultItem.text, invisibleResultItem.requestOptions);
invisibleResultPlugin.addAutoTranslationPendingTarget(invisibleResultItem.cacheKey, invisibleResultItem);
invisibleResultPlugin.renderAutoTranslationResult(invisibleResultItem, "\u5df2\u7ffb\u8bd1\u7684\u9690\u85cf\u5185\u5bb9");
assert.equal(invisibleResultRendered, false);
assert.equal(invisibleResultRemoved, false);
assert.equal(invisibleResultPlugin.autoTranslationPendingTargets.has(invisibleResultItem.cacheKey), false);
assert.equal(invisibleResultPlugin.translationCache.get(invisibleResultItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u9690\u85cf\u5185\u5bb9");
clearTimeout(invisibleResultPlugin.translationCacheDirtyTimer);
invisibleResultPlugin.translationCacheDirtyTimer = null;

const longCacheRoundtripPlugin = new Plugin();
const longCacheRoundtripRendered = [];
longCacheRoundtripPlugin.settings.translation.enabled = true;
longCacheRoundtripPlugin.settings.ui.autoTranslateMessages = true;
longCacheRoundtripPlugin.settings.translation.apiKey = "sk-test";
longCacheRoundtripPlugin.settings.translation.targetLanguage = "Chinese";
longCacheRoundtripPlugin.isAutoTranslationTargetInScanRange = () => true;
longCacheRoundtripPlugin.isElementVisibleInViewport = element => element?.visible === true;
longCacheRoundtripPlugin.getMessageContentElement = message => message.content;
longCacheRoundtripPlugin.getCachedElementText = content => content.text;
longCacheRoundtripPlugin.getElementText = content => content.text;
longCacheRoundtripPlugin.getMessageIdentity = message => `message:long-cache:${message.id}`;
longCacheRoundtripPlugin.shouldAutoTranslateText = text => String(text || "").trim() === longSingleText.trim();
longCacheRoundtripPlugin.hasCurrentTranslationLine = () => false;
let longCacheRoundtripDrainCount = 0;
longCacheRoundtripPlugin.drainAutoTranslationQueue = () => {
    longCacheRoundtripDrainCount++;
    assert.equal(longCacheRoundtripPlugin.autoTranslationQueue.length, 0);
};
longCacheRoundtripPlugin.autoTranslateQueuedMessage = () => { throw new Error("long cache roundtrip should not start API work"); };
longCacheRoundtripPlugin.autoTranslateQueuedBatch = () => { throw new Error("long cache roundtrip should not start API work"); };
longCacheRoundtripPlugin.renderTranslation = (_messageNode, _content, translated) => longCacheRoundtripRendered.push(translated);
const longCacheRoundtripMessage = {
    id: "cached-long",
    isConnected: true,
    visible: false,
    content: { dataset: {}, isConnected: true, visible: false, text: longSingleText }
};
const longCacheRoundtripOptions = longCacheRoundtripPlugin.withMessageIdentity(
    longCacheRoundtripPlugin.getAutoTranslationRequestOptionsForText(longSingleText, longCacheRoundtripPlugin.getAutoTranslationOptions()),
    longCacheRoundtripMessage,
    longCacheRoundtripMessage.content,
    longSingleText
);
const longCacheRoundtripItem = {
    messageNode: longCacheRoundtripMessage,
    content: longCacheRoundtripMessage.content,
    text: longSingleText,
    cacheKey: longCacheRoundtripPlugin.getTranslationCacheKey(longSingleText, longCacheRoundtripOptions),
    requestOptions: longCacheRoundtripOptions
};
longCacheRoundtripPlugin.addAutoTranslationPendingTarget(longCacheRoundtripItem.cacheKey, longCacheRoundtripItem);
const longCacheRoundtripTranslation = "\u4f60\u597d\uff0c\u8fd9\u662f\u7f13\u5b58\u4e2d\u7684\u957f\u6587\u672c\u8bd1\u6587\u3002".repeat(80).trim();
longCacheRoundtripPlugin.renderAutoTranslationResult(longCacheRoundtripItem, longCacheRoundtripTranslation);
assert.equal(longCacheRoundtripRendered.length, 0);
assert.equal(longCacheRoundtripPlugin.translationCache.get(longCacheRoundtripItem.cacheKey), longCacheRoundtripTranslation);
longCacheRoundtripMessage.visible = true;
longCacheRoundtripMessage.content.visible = true;
longCacheRoundtripPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [longCacheRoundtripMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.deepEqual(longCacheRoundtripRendered, [longCacheRoundtripTranslation]);
assert.ok(longCacheRoundtripDrainCount > 0);
clearTimeout(longCacheRoundtripPlugin.translationCacheDirtyTimer);
longCacheRoundtripPlugin.translationCacheDirtyTimer = null;

const longPolicyPlugin = new Plugin();
const longPolicyBaseOptions = longPolicyPlugin.getAutoTranslationOptions();
const longPolicyOptions = longPolicyPlugin.getAutoTranslationRequestOptionsForText(longSingleText, longPolicyBaseOptions);
assert.equal(longPolicyOptions.mode, "long-text");
assert.equal(longPolicyOptions.promptPolicyVersion, longPolicyPlugin.getPromptPolicyVersion("longText"));
assert.equal(longPolicyOptions.configOverrides.promptPolicyVersion, longPolicyPlugin.getPromptPolicyVersion("longText"));
assert.equal(longPolicyOptions.configOverrides.maxTokens >= 1800, true);
assert.notEqual(
    longPolicyPlugin.getTranslationCacheKey(longSingleText, longPolicyBaseOptions),
    longPolicyPlugin.getTranslationCacheKey(longSingleText, longPolicyOptions)
);
assert.equal(
    longPolicyPlugin.getFullConfigTranslationCacheKey(longSingleText, longPolicyOptions).includes(longPolicyPlugin.getPromptPolicyVersion("longText")),
    true
);
assert.equal(longPolicyPlugin.isAutoTranslationCacheMode("long-text"), true);
assert.equal(longPolicyPlugin.isAutoTranslationCacheMode("manual"), false);

const disconnectedResultPlugin = new Plugin();
let disconnectedResultRendered = false;
disconnectedResultPlugin.getElementText = content => content.text;
disconnectedResultPlugin.renderTranslation = () => { disconnectedResultRendered = true; };
const disconnectedResultItem = {
    messageNode: { isConnected: false },
    content: { dataset: {}, isConnected: false, text: "disconnected text" },
    text: "disconnected text",
    requestOptions: disconnectedResultPlugin.getAutoTranslationOptions()
};
disconnectedResultItem.cacheKey = disconnectedResultPlugin.getTranslationCacheKey(disconnectedResultItem.text, disconnectedResultItem.requestOptions);
disconnectedResultPlugin.addAutoTranslationPendingTarget(disconnectedResultItem.cacheKey, disconnectedResultItem);
disconnectedResultPlugin.renderAutoTranslationResult(disconnectedResultItem, "\u5df2\u7ffb\u8bd1\u7684\u65ad\u5f00\u5185\u5bb9");
assert.equal(disconnectedResultRendered, false);
assert.equal(disconnectedResultPlugin.translationCache.get(disconnectedResultItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u65ad\u5f00\u5185\u5bb9");
assert.equal(disconnectedResultPlugin.getAutoTextTranslationCacheValue(disconnectedResultItem.text, disconnectedResultItem.requestOptions), "\u5df2\u7ffb\u8bd1\u7684\u65ad\u5f00\u5185\u5bb9");
assert.equal(disconnectedResultPlugin.autoTranslationPendingTargets.has(disconnectedResultItem.cacheKey), false);
clearTimeout(disconnectedResultPlugin.translationCacheDirtyTimer);
disconnectedResultPlugin.translationCacheDirtyTimer = null;

const changedResultPlugin = new Plugin();
let changedResultRemoved = false;
changedResultPlugin.setTranslationCache = () => {};
changedResultPlugin.getElementText = () => "changed source";
changedResultPlugin.isElementVisibleInViewport = () => false;
changedResultPlugin.renderTranslation = () => { throw new Error("changed source should not render"); };
changedResultPlugin.removeAutoTranslationNode = () => { changedResultRemoved = true; };
const changedResultItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "changed source" },
    text: "old source",
    cacheKey: "changed-result-cache",
    requestOptions: changedResultPlugin.getAutoTranslationOptions()
};
changedResultPlugin.addAutoTranslationPendingTarget(changedResultItem.cacheKey, changedResultItem);
changedResultPlugin.renderAutoTranslationResult(changedResultItem, "\u5df2\u7ffb\u8bd1\u7684\u53d8\u66f4\u5185\u5bb9");
assert.equal(changedResultRemoved, true);

const staleIdentityResultPlugin = new Plugin();
let staleIdentityRemoved = false;
staleIdentityResultPlugin.getElementText = content => content.text;
staleIdentityResultPlugin.isElementVisibleInViewport = () => true;
staleIdentityResultPlugin.getMessageIdentity = () => "message:guild:channel:new:message";
staleIdentityResultPlugin.renderTranslation = () => { throw new Error("stale identity should not render"); };
staleIdentityResultPlugin.removeAutoTranslationNode = () => { staleIdentityRemoved = true; };
staleIdentityResultPlugin.setTranslationCache = () => { throw new Error("stale identity should not write cache"); };
const staleIdentityOptions = {
    ...staleIdentityResultPlugin.getAutoTranslationOptions(),
    messageIdentity: "message:guild:channel:old:message"
};
const staleIdentityItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same identity text" },
    text: "same identity text",
    requestOptions: staleIdentityOptions
};
staleIdentityItem.cacheKey = staleIdentityResultPlugin.getTranslationCacheKey(staleIdentityItem.text, staleIdentityOptions);
staleIdentityResultPlugin.addAutoTranslationPendingTarget(staleIdentityItem.cacheKey, staleIdentityItem);
staleIdentityResultPlugin.renderAutoTranslationResult(staleIdentityItem, "\u5df2\u7ffb\u8bd1\u7684\u8fc7\u671f\u8eab\u4efd\u5185\u5bb9");
assert.equal(staleIdentityRemoved, true);
assert.equal(staleIdentityResultPlugin.autoTranslationPendingTargets.has(staleIdentityItem.cacheKey), false);

const staleIdentityFailurePlugin = new Plugin();
let staleIdentityFailureRemoved = false;
let staleIdentityFailureRendered = false;
staleIdentityFailurePlugin.getElementText = content => content.text;
staleIdentityFailurePlugin.isElementVisibleInViewport = () => true;
staleIdentityFailurePlugin.getMessageIdentity = () => "message:guild:channel:new:message";
staleIdentityFailurePlugin.renderTranslationError = () => { staleIdentityFailureRendered = true; };
staleIdentityFailurePlugin.removeAutoTranslationNode = () => { staleIdentityFailureRemoved = true; };
const staleIdentityFailureTarget = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same failure identity text" },
    text: "same failure identity text",
    requestOptions: {
        ...staleIdentityFailurePlugin.getAutoTranslationOptions(),
        messageIdentity: "message:guild:channel:old:message"
    }
};
staleIdentityFailurePlugin.renderAutoTranslationFailure(staleIdentityFailureTarget, "stale-failure-cache", staleIdentityFailurePlugin.createFinalInvalidAutoTranslationError());
assert.equal(staleIdentityFailureRemoved, true);
assert.equal(staleIdentityFailureRendered, false);

const identityUpgradePlugin = new Plugin();
let identityUpgradeRenderedKey = "";
let identityUpgradeRemoved = false;
identityUpgradePlugin.getElementText = content => content.text;
identityUpgradePlugin.isElementVisibleInViewport = () => true;
identityUpgradePlugin.renderTranslation = (_messageNode, _content, _translated, cacheKey) => { identityUpgradeRenderedKey = cacheKey; };
identityUpgradePlugin.removeAutoTranslationNode = () => { identityUpgradeRemoved = true; };
const identityUpgradeText = "identity upgrade text";
const identityUpgradeTextHash = identityUpgradePlugin.getTextFingerprint(identityUpgradeText);
const identityUpgradeContent = { dataset: {}, isConnected: true, text: identityUpgradeText };
identityUpgradePlugin.ensureTranslationOwnerId(identityUpgradeContent);
const identityUpgradeNode = {
    nodeType: 1,
    isConnected: true,
    parentElement: null,
    previousElementSibling: null,
    nextElementSibling: null,
    getAttribute: attribute => attribute === "data-list-item-id" ? "message-row-identity-upgrade" : "",
    querySelector: selector => {
        if (selector.includes("data-author-id")) return { getAttribute: attribute => attribute === "data-author-id" ? "999999999999999999" : "" };
        if (selector.includes("time")) return { getAttribute: attribute => attribute === "datetime" ? "2026-06-15T04:00:00.000Z" : "" };
        return null;
    }
};
const identityUpgradeFallback = identityUpgradePlugin.messageTracker.getFallbackIdentity(identityUpgradeNode, identityUpgradeContent, identityUpgradeText, {
    guildId: "111111111111111111",
    channelId: "222222222222222222"
});
const identityUpgradeMessage = `message:111111111111111111:222222222222222222:777777777777777777:message:${identityUpgradeTextHash}`;
const identityUpgradeOptions = {
    ...identityUpgradePlugin.getAutoTranslationOptions(),
    messageIdentity: identityUpgradeFallback
};
identityUpgradePlugin.getMessageIdentity = () => identityUpgradeMessage;
const identityUpgradeItem = {
    messageNode: identityUpgradeNode,
    content: identityUpgradeContent,
    text: identityUpgradeText,
    requestOptions: identityUpgradeOptions
};
identityUpgradeItem.cacheKey = identityUpgradePlugin.getTranslationCacheKey(identityUpgradeText, identityUpgradeOptions);
const identityUpgradeCurrentOptions = { ...identityUpgradeOptions, messageIdentity: identityUpgradeMessage };
const identityUpgradeCurrentKey = identityUpgradePlugin.getTranslationCacheKey(identityUpgradeText, identityUpgradeCurrentOptions);
identityUpgradePlugin.addAutoTranslationPendingTarget(identityUpgradeItem.cacheKey, identityUpgradeItem);
identityUpgradePlugin.renderAutoTranslationResult(identityUpgradeItem, "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
assert.equal(identityUpgradeRemoved, false);
assert.equal(identityUpgradeRenderedKey, identityUpgradeCurrentKey);
assert.equal(identityUpgradePlugin.translationCache.get(identityUpgradeItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
assert.equal(identityUpgradePlugin.translationCache.get(identityUpgradeCurrentKey), "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
assert.equal(identityUpgradePlugin.getAutoTextTranslationCacheValue(identityUpgradeText, identityUpgradeCurrentOptions), "\u5df2\u7ffb\u8bd1\u7684\u8eab\u4efd\u5347\u7ea7\u5185\u5bb9");
clearTimeout(identityUpgradePlugin.translationCacheDirtyTimer);
identityUpgradePlugin.translationCacheDirtyTimer = null;

const fallbackIdentityUpgradePlugin = new Plugin();
let fallbackIdentityUpgradeRenderedKey = "";
let fallbackIdentityUpgradeRemoved = false;
fallbackIdentityUpgradePlugin.getElementText = content => content.text;
fallbackIdentityUpgradePlugin.isElementVisibleInViewport = () => true;
fallbackIdentityUpgradePlugin.renderTranslation = (_messageNode, _content, _translated, cacheKey) => { fallbackIdentityUpgradeRenderedKey = cacheKey; };
fallbackIdentityUpgradePlugin.removeAutoTranslationNode = () => { fallbackIdentityUpgradeRemoved = true; };
const fallbackIdentityUpgradeText = "fallback identity upgrade text";
const fallbackIdentityUpgradeTextHash = fallbackIdentityUpgradePlugin.getTextFingerprint(fallbackIdentityUpgradeText);
const fallbackIdentityExpected = `fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:sameneighbor:message:${fallbackIdentityUpgradeTextHash}`;
const fallbackIdentityCurrent = `fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:sameneighbor:message:${fallbackIdentityUpgradeTextHash}`;
const fallbackIdentityOptions = {
    ...fallbackIdentityUpgradePlugin.getAutoTranslationOptions(),
    messageIdentity: fallbackIdentityExpected
};
fallbackIdentityUpgradePlugin.getMessageIdentity = () => fallbackIdentityCurrent;
const fallbackIdentityItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: fallbackIdentityUpgradeText },
    text: fallbackIdentityUpgradeText,
    requestOptions: fallbackIdentityOptions
};
fallbackIdentityUpgradePlugin.ensureTranslationOwnerId(fallbackIdentityItem.content);
fallbackIdentityItem.cacheKey = fallbackIdentityUpgradePlugin.getTranslationCacheKey(fallbackIdentityUpgradeText, fallbackIdentityOptions);
const fallbackIdentityCurrentOptions = { ...fallbackIdentityOptions, messageIdentity: fallbackIdentityCurrent };
const fallbackIdentityCurrentKey = fallbackIdentityUpgradePlugin.getTranslationCacheKey(fallbackIdentityUpgradeText, fallbackIdentityCurrentOptions);
fallbackIdentityUpgradePlugin.addAutoTranslationPendingTarget(fallbackIdentityItem.cacheKey, fallbackIdentityItem);
fallbackIdentityUpgradePlugin.renderAutoTranslationResult(fallbackIdentityItem, "\u5df2\u7ffb\u8bd1\u7684\u56de\u9000\u8eab\u4efd\u5185\u5bb9");
assert.equal(fallbackIdentityUpgradeRemoved, false);
assert.equal(fallbackIdentityUpgradeRenderedKey, fallbackIdentityCurrentKey);
assert.equal(fallbackIdentityUpgradePlugin.translationCache.get(fallbackIdentityItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u56de\u9000\u8eab\u4efd\u5185\u5bb9");
assert.equal(fallbackIdentityUpgradePlugin.translationCache.get(fallbackIdentityCurrentKey), "\u5df2\u7ffb\u8bd1\u7684\u56de\u9000\u8eab\u4efd\u5185\u5bb9");
clearTimeout(fallbackIdentityUpgradePlugin.translationCacheDirtyTimer);
fallbackIdentityUpgradePlugin.translationCacheDirtyTimer = null;
const fallbackStrictPlugin = new Plugin();
const fallbackStrictContent = { dataset: {}, isConnected: true };
fallbackStrictPlugin.ensureTranslationOwnerId(fallbackStrictContent);
const fallbackStrictTarget = { content: fallbackStrictContent };
const fallbackStrictTextHash = fallbackStrictPlugin.getTextFingerprint("strict identity text");
const fallbackStrictExpected = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:neighborhash:message:${fallbackStrictTextHash}`);
const fallbackStrictUnknown = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:unknown-author:unknown-time:routehash:domhash:neighborhash:message:${fallbackStrictTextHash}`);
const fallbackStrictNeighborMismatch = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:otherneighbor:message:${fallbackStrictTextHash}`);
const fallbackStrictSame = fallbackStrictPlugin.getTranslationIdentitySummary(`fallback:111111111111111111:222222222222222222:999999999999999999:2026-06-15T04:00:00.000Z:routehash:domhash:neighborhash:message:${fallbackStrictTextHash}`);
assert.equal(fallbackStrictPlugin.isSafeFallbackTranslationIdentityUpgrade(fallbackStrictExpected, fallbackStrictUnknown, fallbackStrictTarget), false);
assert.equal(fallbackStrictPlugin.isSafeFallbackTranslationIdentityUpgrade(fallbackStrictExpected, fallbackStrictNeighborMismatch, fallbackStrictTarget), false);
assert.equal(fallbackStrictPlugin.isSafeFallbackTranslationIdentityUpgrade(fallbackStrictExpected, fallbackStrictSame, fallbackStrictTarget), true);

const autoTextWritePlugin = new Plugin();
autoTextWritePlugin.isElementVisibleInViewport = () => true;
autoTextWritePlugin.getElementText = content => content.text;
autoTextWritePlugin.renderTranslation = () => {};
const autoTextWriteItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same text" },
    text: "same text",
    requestOptions: autoTextWritePlugin.getAutoTranslationOptions()
};
autoTextWriteItem.cacheKey = autoTextWritePlugin.getTranslationCacheKey(autoTextWriteItem.text, autoTextWriteItem.requestOptions);
autoTextWritePlugin.renderAutoTranslationResult(autoTextWriteItem, "\u5df2\u7ffb\u8bd1\u4e00\u6b21");
assert.equal(autoTextWritePlugin.translationCache.get(autoTextWriteItem.cacheKey), "\u5df2\u7ffb\u8bd1\u4e00\u6b21");
assert.equal(autoTextWritePlugin.getAutoTextTranslationCacheValue("same text", autoTextWriteItem.requestOptions), "\u5df2\u7ffb\u8bd1\u4e00\u6b21");
clearTimeout(autoTextWritePlugin.translationCacheDirtyTimer);
autoTextWritePlugin.translationCacheDirtyTimer = null;

const pausedResultPlugin = new Plugin();
let pausedResultRendered = false;
let pausedResultRetryDelay = 0;
pausedResultPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
pausedResultPlugin.isElementVisibleInViewport = () => true;
pausedResultPlugin.getElementText = content => content.text;
pausedResultPlugin.renderTranslation = () => { pausedResultRendered = true; };
pausedResultPlugin.scheduleAutoTranslationRetryScan = delay => { pausedResultRetryDelay = Math.max(pausedResultRetryDelay, delay); };
const pausedResultItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "paused text" },
    text: "paused text",
    requestOptions: pausedResultPlugin.getAutoTranslationOptions()
};
pausedResultItem.cacheKey = pausedResultPlugin.getTranslationCacheKey(pausedResultItem.text, pausedResultItem.requestOptions);
pausedResultPlugin.addAutoTranslationPendingTarget(pausedResultItem.cacheKey, pausedResultItem);
pausedResultPlugin.renderAutoTranslationResult(pausedResultItem, "\u5df2\u7ffb\u8bd1\u7684\u6682\u505c\u5185\u5bb9");
assert.equal(pausedResultRendered, false);
assert.equal(pausedResultPlugin.translationCache.get(pausedResultItem.cacheKey), "\u5df2\u7ffb\u8bd1\u7684\u6682\u505c\u5185\u5bb9");
assert.equal(pausedResultPlugin.autoTranslationPendingTargets.has(pausedResultItem.cacheKey), true);
assert.ok(pausedResultRetryDelay > 0);
clearTimeout(pausedResultPlugin.autoTranslationRetryTimer);
pausedResultPlugin.autoTranslationRetryTimer = null;
clearTimeout(pausedResultPlugin.translationCacheDirtyTimer);
pausedResultPlugin.translationCacheDirtyTimer = null;

let removedPendingCount = 0;
const pendingClearPlugin = new Plugin();
pendingClearPlugin.removeAutoTranslationNode = () => { removedPendingCount++; };
pendingClearPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetA);
pendingClearPlugin.addAutoTranslationPendingTarget(fanoutKey, fanoutTargetB);
pendingClearPlugin.clearPendingAutoTranslationItem({ cacheKey: fanoutKey });
assert.equal(removedPendingCount, 2);
assert.equal(pendingClearPlugin.autoTranslationPendingTargets.has(fanoutKey), false);

const inlineFailurePlugin = new Plugin();
let inlineFailureRendered = false;
let inlineFailureRemoved = false;
inlineFailurePlugin.isElementVisibleInViewport = () => true;
inlineFailurePlugin.getElementText = content => content.text;
inlineFailurePlugin.renderTranslationError = (messageNode, content, error, cacheKey, sourceText) => {
    inlineFailureRendered = { messageNode, content, error, cacheKey, sourceText };
};
inlineFailurePlugin.removeAutoTranslationNode = () => { inlineFailureRemoved = true; };
inlineFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
inlineFailurePlugin.showAutoTranslateError = () => {};
const inlineFailureError = new Error("invalid output");
const inlineFailureItem = {
    messageNode: { isConnected: true },
    content: { isConnected: true, text: "привет", dataset: {} },
    text: "привет",
    cacheKey: "inline-failure-cache",
    requestOptions: inlineFailurePlugin.getAutoTranslationOptions()
};
inlineFailurePlugin.markAutoTranslationFailure(inlineFailureItem, inlineFailureError);
assert.equal(inlineFailureRendered, false);
assert.equal(inlineFailureRemoved, true);

inlineFailurePlugin.settings.ui.showAutoTranslateWarnings = true;
inlineFailureRendered = false;
inlineFailureRemoved = false;
inlineFailurePlugin.removeAutoTranslationNode = () => { throw new Error("visible invalid auto output should render inline feedback"); };
inlineFailurePlugin.markAutoTranslationFailure(inlineFailureItem, inlineFailureError);
assert.equal(inlineFailureRendered.content, inlineFailureItem.content);
assert.equal(inlineFailureRendered.sourceText, "привет");

const warningToastPlugin = new Plugin();
let warningToasts = 0;
warningToastPlugin.showToast = () => { warningToasts++; };
warningToastPlugin.showAutoTranslateError(new Error("invalid output"));
assert.equal(warningToasts, 0);
warningToastPlugin.settings.ui.showAutoTranslateWarnings = true;
warningToastPlugin.showAutoTranslateError(new Error("invalid output"));
assert.equal(warningToasts, 0);
warningToastPlugin.settings.ui.showAutoTranslateToasts = true;
warningToastPlugin.showAutoTranslateError(new Error("invalid output"));
assert.equal(warningToasts, 1);
warningToastPlugin.settings.ui.showAutoTranslateToasts = false;
warningToastPlugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 500 }));
assert.equal(warningToasts, 1);
// An error only the user can fix (auth) is announced once per episode even with failure toasts off.
warningToastPlugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 401 }));
assert.equal(warningToasts, 2);
warningToastPlugin.showAutoTranslateError(Object.assign(new Error("API_ERROR"), { status: 401 }));
assert.equal(warningToasts, 2);

const networkFailurePlugin = new Plugin();
let networkFailureRemoved = false;
networkFailurePlugin.removeAutoTranslationNode = () => { networkFailureRemoved = true; };
networkFailurePlugin.renderTranslationError = () => { throw new Error("network failures should avoid noisy inline errors"); };
networkFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
networkFailurePlugin.showAutoTranslateError = () => {};
const networkFailureError = new Error("NetworkError");
networkFailurePlugin.markAutoTranslationFailure({
    messageNode: { isConnected: true },
    content: { isConnected: true, text: "привет", dataset: {} },
    text: "привет",
    cacheKey: "network-failure-cache",
    requestOptions: networkFailurePlugin.getAutoTranslationOptions()
}, networkFailureError);
assert.equal(networkFailureRemoved, true);

const queuePlugin = new Plugin();
queuePlugin.settings.translation.enabled = true;
queuePlugin.settings.ui.autoTranslateMessages = true;
queuePlugin.settings.translation.apiKey = "sk-test";
queuePlugin.settings.translation.targetLanguage = "汉语";
queuePlugin.isElementVisibleInViewport = () => true;
queuePlugin.getMessageContentElement = message => message.content;
queuePlugin.getCachedElementText = content => content.text;
queuePlugin.shouldAutoTranslateText = () => true;
queuePlugin.hasCurrentTranslationLine = () => false;
let queueDrainCount = 0;
queuePlugin.drainAutoTranslationQueue = () => { queueDrainCount++; };
const queuedA = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
const queuedB = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
queuePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [queuedA, queuedB],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(queuePlugin.autoTranslationQueue.length, 1);
assert.equal(queuePlugin.getAutoTranslationPendingTargets({ cacheKey: queuePlugin.autoTranslationQueue[0].cacheKey }).length, 2);
assert.equal(queueDrainCount, 1);

const repeatedScanPlugin = new Plugin();
repeatedScanPlugin.settings.translation.enabled = true;
repeatedScanPlugin.settings.ui.autoTranslateMessages = true;
repeatedScanPlugin.settings.translation.apiKey = "sk-test";
repeatedScanPlugin.settings.translation.targetLanguage = "Chinese";
repeatedScanPlugin.isElementVisibleInViewport = () => true;
repeatedScanPlugin.getMessageContentElement = message => message.content;
repeatedScanPlugin.getCachedElementText = content => content.text;
repeatedScanPlugin.getElementText = content => content.text;
repeatedScanPlugin.getMessageIdentity = message => `repeat:${message.id}`;
repeatedScanPlugin.shouldAutoTranslateText = () => true;
repeatedScanPlugin.hasCurrentTranslationLine = () => false;
repeatedScanPlugin.drainAutoTranslationQueue = () => {};
const repeatedScanMessage = { id: "same", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola repeated" } };
const repeatedScanContext = {
    messageNodes: [repeatedScanMessage],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
};
repeatedScanPlugin.queueAutoTranslateVisibleMessages(repeatedScanContext);
repeatedScanPlugin.queueAutoTranslateVisibleMessages(repeatedScanContext);
assert.equal(repeatedScanPlugin.autoTranslationQueue.length, 1);
assert.equal(repeatedScanPlugin.translationRequests.size, 0);
assert.equal(repeatedScanPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0].state, "queued");

const diagnosticDecisionPlugin = new Plugin();
diagnosticDecisionPlugin.settings.translation.provider = "sakuraLocal";
diagnosticDecisionPlugin.settings.translation.targetLanguage = "Chinese";
diagnosticDecisionPlugin.getMessageIdentity = message => `diagnostic:${message.id}`;
diagnosticDecisionPlugin.isElementVisibleInViewport = () => true;
const diagnosticDecisionMessage = { id: "message", isConnected: true };
const diagnosticDecisionContent = { dataset: {}, isConnected: true, text: "diagnostic foreign text" };
const diagnosticDecisionText = "diagnostic foreign text";
const diagnosticDecisionOptions = diagnosticDecisionPlugin.withMessageIdentity(
    diagnosticDecisionPlugin.getAutoTranslationOptions(),
    diagnosticDecisionMessage,
    diagnosticDecisionContent,
    diagnosticDecisionText
);
const diagnosticDecisionItem = {
    messageNode: diagnosticDecisionMessage,
    content: diagnosticDecisionContent,
    text: diagnosticDecisionText,
    cacheKey: diagnosticDecisionPlugin.getTranslationCacheKey(diagnosticDecisionText, diagnosticDecisionOptions),
    requestOptions: diagnosticDecisionOptions
};
diagnosticDecisionPlugin.logAutoTranslationMessageState("auto.message.state", "queued", diagnosticDecisionItem, "queuedVisible", "enqueued");
diagnosticDecisionPlugin.logAutoTranslationMessageState("auto.message.state", "start", diagnosticDecisionItem, "inFlight", "request-started");
diagnosticDecisionPlugin.logAutoTranslationMessageState("auto.message.state", "failed", diagnosticDecisionItem, "failed", "failure", {
    type: "invalid-output",
    validationQuality: "bad"
});
const diagnosticDecision = diagnosticDecisionPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0];
assert.equal(diagnosticDecision.requestCount, 1);
assert.equal(diagnosticDecision.lastErrorType, "invalid-output");
assert.equal(diagnosticDecision.validationQuality, "bad");
assert.equal(diagnosticDecision.queueType, "visible");
assert.ok(diagnosticDecision.messageIdentityHash);
assert.ok(diagnosticDecision.textHash);

const diagnosticFailureClassPlugin = new Plugin();
diagnosticFailureClassPlugin.settings.ui.diagnosticsEnabled = true;
diagnosticFailureClassPlugin.logDiagnostic("manual.long-text.whole-pass", "failed", {
    type: "invalid-output",
    wholePassFailed: true,
    sourceLength: 900,
    outputLength: 120
});
diagnosticFailureClassPlugin.logDiagnostic("auto.long-text.chunk", "failed", {
    type: "invalid-output",
    chunkIndex: 1,
    chunkTotal: 4,
    invalidReason: "residual-source"
});
const diagnosticFailureSummary = diagnosticFailureClassPlugin.createDiagnosticSummary(diagnosticFailureClassPlugin.diagnosticLogs);
assert.equal(diagnosticFailureClassPlugin.diagnosticLogs[0].meta.failureClass, "whole-pass-failed");
assert.equal(diagnosticFailureClassPlugin.diagnosticLogs[0].meta.failureLayer, "request");
assert.equal(diagnosticFailureClassPlugin.diagnosticLogs[1].meta.failureClass, "chunk-failed");
assert.ok(diagnosticFailureSummary.top.failureClasses.some(item => item.key === "whole-pass-failed"));
assert.ok(diagnosticFailureSummary.top.failureLayers.some(item => item.key === "validation"));
assert.ok(diagnosticFailureSummary.humanSummary.some(line => /top failure:/.test(line)));
assert.ok(diagnosticFailureClassPlugin.serializeDiagnosticLogs("txt").includes("humanSummary:"));

const providerFallbackFeaturePlugin = new Plugin();
providerFallbackFeaturePlugin.settings.ui.providerFallbackEnabled = true;
providerFallbackFeaturePlugin.settings.ui.providerFallbackOrder = ["microsoft", "deepl", "sakuraLocal"];
providerFallbackFeaturePlugin.settings.translation.provider = "sakuraLocal";
assert.deepEqual(providerFallbackFeaturePlugin.getProviderFallbackOrder("translation"), []);
providerFallbackFeaturePlugin.settings.translation.provider = "deepseek";
assert.deepEqual(providerFallbackFeaturePlugin.getProviderFallbackOrder("translation"), ["microsoft", "deepl"]);
providerFallbackFeaturePlugin.getCurrentRouteKey = () => "guild-shell:channel-shell:";
// 'inherit' follows the main auto-translate switch (off by default); 'enabled' works as an allow-list.
assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), false);
providerFallbackFeaturePlugin.settings.ui.autoTranslateMessages = true;
assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), true);
providerFallbackFeaturePlugin.settings.ui.channelAutoTranslatePolicies = {
    "guild-shell:channel-shell": { mode: "disabled" }
};
assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), false);
providerFallbackFeaturePlugin.saveSettings = () => true;
providerFallbackFeaturePlugin.setSetting("ui.currentChannelAutoTranslatePolicy", "enabled");
assert.equal(providerFallbackFeaturePlugin.getCurrentChannelAutoTranslatePolicyMode(), "enabled");
assert.equal(providerFallbackFeaturePlugin.isCurrentChannelAutoTranslateAllowed(), true);
providerFallbackFeaturePlugin.setSetting("ui.currentChannelAutoTranslatePolicy", "inherit");
assert.equal(providerFallbackFeaturePlugin.getCurrentChannelAutoTranslatePolicyMode(), "inherit");
assert.deepEqual(providerFallbackFeaturePlugin.settings.ui.channelAutoTranslatePolicies, {});
assert.deepEqual(providerFallbackFeaturePlugin.parseProviderFallbackOrderText("microsoft, deepl\nbad-provider sakuraLocal microsoft"), ["microsoft", "deepl", "sakuraLocal"]);
providerFallbackFeaturePlugin.setSetting("ui.providerFallbackOrder", "microsoft\nbad-provider deepl microsoft");
assert.deepEqual(providerFallbackFeaturePlugin.settings.ui.providerFallbackOrder, ["microsoft", "deepl"]);
assert.equal(providerFallbackFeaturePlugin.getSetting("ui.providerFallbackOrder"), "microsoft, deepl");

const historyBackfillPlugin = new Plugin();
historyBackfillPlugin.settings.translation.enabled = true;
historyBackfillPlugin.settings.translation.apiKey = "sk-test";
historyBackfillPlugin.settings.ui.autoTranslateMessages = true;
historyBackfillPlugin.settings.ui.historyBackfillEnabled = true;
historyBackfillPlugin.getScanContextMessageNodes = () => [
    { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola history uno" } },
    { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola history dos" } }
];
historyBackfillPlugin.getMessageContentElement = message => message.content;
historyBackfillPlugin.getCachedElementText = content => content.text;
historyBackfillPlugin.getElementText = content => content.text;
historyBackfillPlugin.getMessageIdentity = (_message, _content, text) => `history:${text}`;
historyBackfillPlugin.isElementVisibleInViewport = () => false;
historyBackfillPlugin.shouldAutoTranslateText = () => true;
historyBackfillPlugin.hasCurrentTranslationLine = () => false;
historyBackfillPlugin.drainAutoTranslationQueue = () => {};
const historyBackfillResult = historyBackfillPlugin.requestExplicitHistoryBackfill({ limit: 2 });
assert.equal(historyBackfillResult.enqueued, 2);
assert.equal(historyBackfillPlugin.autoTranslationQueue.length, 2);
assert.equal(historyBackfillPlugin.autoTranslationQueue.every(item => item.daitHistoryRequest === true), true);
assert.equal(historyBackfillPlugin.autoTranslationQueue.every(item => historyBackfillPlugin.getAutoTranslationDiagnosticQueueType(item) === "history"), true);
assert.equal(historyBackfillPlugin.isAutoTranslationPrefetchAllowed(historyBackfillPlugin.autoTranslationQueue[0]), true);

const historyDisabledPlugin = new Plugin();
historyDisabledPlugin.settings.translation.enabled = true;
historyDisabledPlugin.settings.ui.autoTranslateMessages = true;
historyDisabledPlugin.settings.ui.historyBackfillEnabled = false;
assert.equal(historyDisabledPlugin.requestExplicitHistoryBackfill({ messageNodes: [{ isConnected: true }] }).enqueued, 0);

const precheckDecisionPlugin = new Plugin();
precheckDecisionPlugin.settings.translation.enabled = true;
precheckDecisionPlugin.settings.ui.autoTranslateMessages = true;
precheckDecisionPlugin.settings.translation.apiKey = "sk-test";
precheckDecisionPlugin.settings.translation.targetLanguage = "Chinese";
precheckDecisionPlugin.isElementVisibleInViewport = () => true;
precheckDecisionPlugin.getMessageContentElement = message => message.content;
precheckDecisionPlugin.getCachedElementText = content => content.text;
precheckDecisionPlugin.getMessageIdentity = () => "precheck-decision";
precheckDecisionPlugin.shouldAutoTranslateText = () => false;
precheckDecisionPlugin.drainAutoTranslationQueue = () => {};
precheckDecisionPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "already target text" } }],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(precheckDecisionPlugin.autoTranslationQueue.length, 0);
const precheckDecision = precheckDecisionPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0];
assert.equal(precheckDecision.state, "skipped");
assert.equal(precheckDecision.reasonCode, "not-eligible-language");

const currentLineDecisionPlugin = new Plugin();
currentLineDecisionPlugin.settings.translation.enabled = true;
currentLineDecisionPlugin.settings.ui.autoTranslateMessages = true;
currentLineDecisionPlugin.settings.translation.apiKey = "sk-test";
currentLineDecisionPlugin.settings.translation.targetLanguage = "Chinese";
currentLineDecisionPlugin.isElementVisibleInViewport = () => true;
currentLineDecisionPlugin.getMessageContentElement = message => message.content;
currentLineDecisionPlugin.getCachedElementText = content => content.text;
currentLineDecisionPlugin.getMessageIdentity = () => "current-line-decision";
currentLineDecisionPlugin.shouldAutoTranslateText = () => true;
currentLineDecisionPlugin.hasCurrentTranslationLine = () => true;
currentLineDecisionPlugin.drainAutoTranslationQueue = () => {};
currentLineDecisionPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola current" } }],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(currentLineDecisionPlugin.autoTranslationQueue.length, 0);
assert.equal(currentLineDecisionPlugin.getLastAutoTranslationDecisionsSnapshot(1)[0].state, "current-line-present");

const savedWindowForBdfdbIntake = global.window;
global.window = { location: { pathname: "/channels/guild-bdfdb/channel-bdfdb" } };
const bdfdbFallbackPlugin = new Plugin();
bdfdbFallbackPlugin.settings.translation.enabled = true;
bdfdbFallbackPlugin.settings.ui.autoTranslateMessages = true;
bdfdbFallbackPlugin.settings.ui.autoTranslateIntakeMode = "bdfdb";
bdfdbFallbackPlugin.settings.ui.diagnosticsEnabled = true;
bdfdbFallbackPlugin.isElementVisibleInViewport = () => true;
bdfdbFallbackPlugin.getMessageContentElement = message => message.content;
bdfdbFallbackPlugin.getCachedElementText = content => content.text;
bdfdbFallbackPlugin.shouldAutoTranslateText = () => true;
const bdfdbFallbackMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola fallback" } };
const bdfdbFallbackCandidates = bdfdbFallbackPlugin.createAutoTranslationCandidates({
    messageNodes: [bdfdbFallbackMessage],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(bdfdbFallbackCandidates.length, 1);
assert.equal(bdfdbFallbackCandidates[0].source, "dom");
assert.ok(bdfdbFallbackPlugin.diagnosticLogs.some(entry => entry.action === "auto.intake" && entry.status === "fallback"));

global.window = {
    location: { pathname: "/channels/guild-bdfdb/222222222222222222" },
    BDFDB_Global: {
        loaded: true,
        started: true,
        BDFDB: {
            LibraryStores: {
                MessageStore: {
                    getMessages: () => [{
                        id: "111111111111111111",
                        guild_id: "guild-bdfdb",
                        channel_id: "222222222222222222",
                        content: "hola bdfdb",
                        author: { id: "author-bdfdb" },
                        timestamp: "2026-06-22T00:00:00.000Z"
                    }]
                }
            }
        }
    }
};
const bdfdbIntakePlugin = new Plugin();
bdfdbIntakePlugin.settings.translation.enabled = true;
bdfdbIntakePlugin.settings.ui.autoTranslateMessages = true;
bdfdbIntakePlugin.settings.ui.autoTranslateIntakeMode = "auto";
bdfdbIntakePlugin.settings.ui.diagnosticsEnabled = true;
bdfdbIntakePlugin.isElementVisibleInViewport = () => true;
bdfdbIntakePlugin.getMessageContentElement = message => message.content;
bdfdbIntakePlugin.getCachedElementText = content => content.text;
bdfdbIntakePlugin.shouldAutoTranslateText = () => true;
const bdfdbDomMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola bdfdb" } };
const bdfdbCandidates = bdfdbIntakePlugin.createAutoTranslationCandidates({
    messageNodes: [bdfdbDomMessage],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(bdfdbCandidates.length, 1);
assert.equal(bdfdbCandidates[0].source, "bdfdb");
assert.equal(bdfdbCandidates[0].messageId, "111111111111111111");
assert.equal(bdfdbCandidates[0].channelId, "222222222222222222");
assert.match(bdfdbCandidates[0].messageIdentity, /^message:guild-bdfdb:222222222222222222:111111111111111111:message:/);
bdfdbIntakePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(bdfdbIntakePlugin.autoTranslationQueue.length, 0);

global.window = { location: { pathname: "/channels/guild-store/333333333333333333" } };
const storeFullIntakePlugin = new Plugin();
storeFullIntakePlugin.settings.translation.enabled = true;
storeFullIntakePlugin.settings.ui.autoTranslateMessages = true;
storeFullIntakePlugin.settings.ui.autoTranslateIntakeMode = "auto";
storeFullIntakePlugin.settings.ui.diagnosticsEnabled = true;
storeFullIntakePlugin.isElementVisibleInViewport = () => true;
storeFullIntakePlugin.isAutoTranslationTargetInScanRange = () => true;
storeFullIntakePlugin.getMessageContentElement = message => message.content;
storeFullIntakePlugin.getCachedElementText = content => content.text;
storeFullIntakePlugin.getElementText = content => content.text;
storeFullIntakePlugin.shouldAutoTranslateText = () => true;
const storeShortDom = "step 4: paste model name";
const storeFullText = [
    "free access to GPT 5.5 and Grok 4.20",
    "platform Stack AI. free tier. no card needed",
    "step 1: sign in with Google",
    "step 2: create agent",
    "step 3: open Interface",
    storeShortDom
].join("\n");
storeFullIntakePlugin.getDiscordMessageStore = () => ({
    getMessages: () => [{
        id: "333333333333333334",
        guild_id: "guild-store",
        channel_id: "333333333333333333",
        content: storeFullText,
        author: { id: "author-store" },
        timestamp: "2026-06-23T00:00:00.000Z"
    }]
});
const storeFullMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: storeShortDom } };
const storeFullCandidates = storeFullIntakePlugin.createAutoTranslationCandidates({
    messageNodes: [storeFullMessage],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(storeFullCandidates.length, 1);
assert.equal(storeFullCandidates[0].source, "bdfdb");
assert.equal(storeFullCandidates[0].sourceTextKind, "store-full");
assert.equal(storeFullCandidates[0].domText, storeShortDom);
assert.equal(storeFullCandidates[0].text, storeFullText);
assert.equal(storeFullIntakePlugin.isAutoTranslationTargetReady({
    ...storeFullCandidates[0],
    cacheKey: "store-full-cache",
    requestOptions: storeFullIntakePlugin.getAutoTranslationOptions()
}), true);
global.window = savedWindowForBdfdbIntake;

const visibleBackfillPlugin = new Plugin();
visibleBackfillPlugin.settings.translation.enabled = true;
visibleBackfillPlugin.settings.ui.autoTranslateMessages = true;
visibleBackfillPlugin.settings.translation.apiKey = "sk-test";
visibleBackfillPlugin.settings.translation.targetLanguage = "Chinese";
visibleBackfillPlugin.settings.ui.diagnosticsEnabled = true;
visibleBackfillPlugin.isElementVisibleInViewport = () => true;
visibleBackfillPlugin.getMessageContentElement = message => message.content;
visibleBackfillPlugin.getCachedElementText = content => content.text;
visibleBackfillPlugin.getElementText = content => content.text;
visibleBackfillPlugin.getMessageIdentity = message => `visible-backfill:${message.id}`;
visibleBackfillPlugin.shouldAutoTranslateText = () => true;
visibleBackfillPlugin.hasCurrentTranslationLine = () => false;
visibleBackfillPlugin.getAutoTranslateBatchSize = () => 1;
visibleBackfillPlugin.getAutoTranslateQueueLimit = () => 8;
let visibleBackfillDrainCount = 0;
let visibleBackfillRetryDelay = 0;
visibleBackfillPlugin.drainAutoTranslationQueue = () => { visibleBackfillDrainCount++; };
visibleBackfillPlugin.scheduleAutoTranslationRetryScan = delay => { visibleBackfillRetryDelay = delay; };
visibleBackfillPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [
        { id: "a", content: { dataset: {}, isConnected: true, text: "hola uno" }, isConnected: true },
        { id: "b", content: { dataset: {}, isConnected: true, text: "hola dos" }, isConnected: true },
        { id: "c", content: { dataset: {}, isConnected: true, text: "hola tres" }, isConnected: true }
    ],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(visibleBackfillPlugin.autoTranslationQueue.length, 3);
assert.equal(visibleBackfillDrainCount, 1);
assert.equal(visibleBackfillRetryDelay, 0);
const visibleBackfillLog = visibleBackfillPlugin.diagnosticLogs.find(entry => entry.action === "auto.scan");
assert.equal(visibleBackfillLog.meta.visibleDeferred, 0);

const mixedChineseQueuePlugin = new Plugin();
mixedChineseQueuePlugin.settings.translation.enabled = true;
mixedChineseQueuePlugin.settings.ui.autoTranslateMessages = true;
mixedChineseQueuePlugin.settings.translation.apiKey = "sk-test";
mixedChineseQueuePlugin.settings.translation.targetLanguage = "Chinese";
mixedChineseQueuePlugin.isElementVisibleInViewport = () => true;
mixedChineseQueuePlugin.getMessageContentElement = message => message.content;
mixedChineseQueuePlugin.getCachedElementText = content => content.text;
mixedChineseQueuePlugin.hasCurrentTranslationLine = () => false;
let mixedChineseDrainCount = 0;
mixedChineseQueuePlugin.drainAutoTranslationQueue = () => { mixedChineseDrainCount++; };
mixedChineseQueuePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ content: { dataset: {}, text: "\u6211\u7684bug team\u554a" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(mixedChineseQueuePlugin.autoTranslationQueue.length, 0);
assert.equal(mixedChineseDrainCount, 1);

const previewQueuePlugin = new Plugin();
previewQueuePlugin.settings.translation.enabled = true;
previewQueuePlugin.settings.ui.autoTranslateMessages = true;
previewQueuePlugin.settings.translation.apiKey = "sk-test";
previewQueuePlugin.settings.translation.targetLanguage = "姹夎";
previewQueuePlugin.isElementVisibleInViewport = () => true;
previewQueuePlugin.getMessageContentElement = message => message.content;
previewQueuePlugin.getReplyPreviewElements = message => [message.preview];
previewQueuePlugin.getCachedElementText = content => content.text;
previewQueuePlugin.shouldAutoTranslateText = () => true;
previewQueuePlugin.hasCurrentTranslationLine = () => false;
previewQueuePlugin.drainAutoTranslationQueue = () => {};
const previewMessage = {
    isConnected: true,
    content: { dataset: {}, isConnected: true, text: "main foreign text" },
    preview: { dataset: {}, isConnected: true, text: "quoted foreign text" }
};
previewQueuePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [previewMessage],
    contentByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(previewQueuePlugin.autoTranslationQueue.length, 2);
assert.equal(previewQueuePlugin.autoTranslationQueue[0].targetKind, "message");
assert.equal(previewQueuePlugin.autoTranslationQueue[1].targetKind, "reply-preview");
assert.deepEqual(previewQueuePlugin.autoTranslationQueue[1].textOptions, { includeReplyPreview: true });

const previewParent = {
    contains: node => node?.name === "child",
    closest: selector => selector.includes("repliedTextPreview") ? previewParent : null,
    name: "parent"
};
const previewChild = {
    contains: () => false,
    closest: selector => selector.includes("repliedTextPreview") ? previewParent : null,
    name: "child"
};
const previewDedupPlugin = new Plugin();
const dedupedPreviewTargets = previewDedupPlugin.getReplyPreviewElements({
    querySelectorAll: () => [previewParent, previewChild]
});
assert.deepEqual(dedupedPreviewTargets, [previewChild]);
assert.deepEqual(previewDedupPlugin.getReplyPreviewElements({
    querySelector: () => null,
    querySelectorAll: () => { throw new Error("querySelectorAll should not run without a reply container"); }
}), []);

const previewReadyPlugin = new Plugin();
previewReadyPlugin.isElementVisibleInViewport = () => true;
previewReadyPlugin.hasCurrentTranslationLine = () => false;
previewReadyPlugin.getElementText = (content, options) => options?.includeReplyPreview ? content.previewText : content.text;
assert.equal(previewReadyPlugin.isAutoTranslationQueueItemReady({
    messageNode: { isConnected: true },
    content: { isConnected: true, previewText: "quoted foreign text", text: "" },
    text: "quoted foreign text",
    textOptions: { includeReplyPreview: true },
    cacheKey: "auto-preview"
}), true);

const prefetchPlugin = new Plugin();
prefetchPlugin.isElementVisibleInViewport = () => false;
prefetchPlugin.isElementNearViewport = () => true;
prefetchPlugin.getMessageContentElement = message => message.content;
prefetchPlugin.getReplyPreviewElements = () => [];
prefetchPlugin.getCachedElementText = content => content.text;
prefetchPlugin.hasCurrentTranslationLine = () => false;
prefetchPlugin.getElementText = content => content.text;
const prefetchMessage = {
    isConnected: true,
    content: { isConnected: true, dataset: {}, text: "texto extranjero" }
};
assert.equal(prefetchPlugin.getAutoTranslationTargets(prefetchMessage, {
    contentByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
}).length, 1);
assert.equal(prefetchPlugin.isAutoTranslationQueueItemReady({
    messageNode: prefetchMessage,
    content: prefetchMessage.content,
    text: "texto extranjero",
    cacheKey: "auto-prefetch"
}), true);
const nestedPrefetchReadyPlugin = new Plugin();
nestedPrefetchReadyPlugin.isElementVisibleInViewport = element => element?.visible === true;
nestedPrefetchReadyPlugin.isElementNearViewport = element => element?.near === true;
nestedPrefetchReadyPlugin.hasCurrentTranslationLine = () => false;
nestedPrefetchReadyPlugin.getElementText = content => content.text;
const nestedPrefetchContent = { isConnected: true, visible: false, near: false, text: "nested prefetch" };
const nestedPrefetchMessage = {
    isConnected: true,
    visible: false,
    near: true,
    contains: node => node === nestedPrefetchContent
};
assert.equal(nestedPrefetchReadyPlugin.isAutoTranslationQueueItemReady({
    messageNode: nestedPrefetchMessage,
    content: nestedPrefetchContent,
    text: "nested prefetch",
    cacheKey: "nested-prefetch"
}), true);
let prefetchLoadingRendered = false;
prefetchPlugin.renderTranslationLoading = () => { prefetchLoadingRendered = true; };
prefetchPlugin.addAutoTranslationPendingTarget("auto-prefetch", {
    messageNode: prefetchMessage,
    content: prefetchMessage.content,
    text: "texto extranjero",
    cacheKey: "auto-prefetch"
});
prefetchPlugin.renderPendingAutoTranslationLoading({ cacheKey: "auto-prefetch" });
assert.equal(prefetchLoadingRendered, false);

const legacyReadyPlugin = new Plugin();
legacyReadyPlugin.isAutoTranslationTargetInScanRange = () => true;
legacyReadyPlugin.getElementText = content => content.text;
const legacyReadyOptions = legacyReadyPlugin.getAutoTranslationOptions();
const legacyReadyPrimaryKey = legacyReadyPlugin.getTranslationCacheKey("bonjour", legacyReadyOptions);
const legacyReadyAliasKey = legacyReadyPlugin.getLegacyTranslationCacheKey("bonjour", legacyReadyOptions);
const legacyReadyLine = {
    classList: { contains: () => false },
    dataset: {
        daitCacheKey: legacyReadyPlugin.getTextFingerprint(legacyReadyAliasKey),
        daitMode: "auto",
        daitSourceKey: legacyReadyPlugin.getTextFingerprint("bonjour")
    },
    remove: () => { throw new Error("legacy ready line should not be removed"); }
};
const legacyReadyContent = {
    isConnected: true,
    text: "bonjour",
    dataset: { daitOwner: "owner-legacy-ready" },
    parentElement: { querySelectorAll: () => [legacyReadyLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => legacyReadyLine
};
assert.equal(legacyReadyPlugin.isAutoTranslationTargetReady({
    messageNode: { isConnected: true },
    content: legacyReadyContent,
    text: "bonjour",
    cacheKey: legacyReadyPrimaryKey,
    requestOptions: legacyReadyOptions
}), false);

const priorityQueuePlugin = new Plugin();
priorityQueuePlugin.settings.ui.autoTranslateMessages = true;
priorityQueuePlugin.getViewportPriority = element => element?.priority ?? 9999;
priorityQueuePlugin.clearPendingAutoTranslationItem = () => {};
const lowPriorityItem = {
    messageNode: { priority: 900 },
    content: { dataset: {}, priority: 900 },
    text: "low",
    cacheKey: "low",
    requestOptions: priorityQueuePlugin.getAutoTranslationOptions()
};
const highPriorityItem = {
    messageNode: { priority: 10 },
    content: { dataset: {}, priority: 10 },
    text: "high",
    cacheKey: "high",
    requestOptions: priorityQueuePlugin.getAutoTranslationOptions()
};
priorityQueuePlugin.enqueueAutoTranslationItem(lowPriorityItem);
priorityQueuePlugin.enqueueAutoTranslationItem(highPriorityItem);
assert.deepEqual(priorityQueuePlugin.autoTranslationQueue.map(item => item.cacheKey), ["high", "low"]);

const replacementPlugin = new Plugin();
replacementPlugin.settings.ui.autoTranslateMessages = true;
replacementPlugin.getViewportPriority = element => element?.priority ?? 9999;
let replacedCacheKey = "";
replacementPlugin.clearPendingAutoTranslationItem = item => { replacedCacheKey = item.cacheKey; };
replacementPlugin.enqueueAutoTranslationItem(lowPriorityItem);
replacementPlugin.autoTranslationInFlightItems = replacementPlugin.getAutoTranslateQueueLimit() - 1;
assert.equal(replacementPlugin.makeRoomForAutoTranslationItem(highPriorityItem, replacementPlugin.getAutoTranslateQueueLimit()), true);
assert.equal(replacedCacheKey, "low");
assert.equal(replacementPlugin.autoTranslationQueue.length, 0);
assert.equal(replacementPlugin.autoTranslationQueuedKeys.has("low"), false);

const queuePreemptPlugin = new Plugin();
queuePreemptPlugin.settings.translation.enabled = true;
queuePreemptPlugin.settings.ui.autoTranslateMessages = true;
queuePreemptPlugin.settings.translation.apiKey = "sk-test";
queuePreemptPlugin.settings.translation.targetLanguage = "汉语";
queuePreemptPlugin.getViewportPriority = element => element?.priority ?? 9999;
queuePreemptPlugin.isAutoTranslationTargetInScanRange = () => true;
queuePreemptPlugin.isElementVisibleInViewport = () => true;
queuePreemptPlugin.getMessageContentElement = message => message.content;
queuePreemptPlugin.getReplyPreviewElements = () => [];
queuePreemptPlugin.getCachedElementText = content => content.text;
queuePreemptPlugin.shouldAutoTranslateText = () => true;
queuePreemptPlugin.hasCurrentTranslationLine = () => false;
queuePreemptPlugin.drainAutoTranslationQueue = () => {};
queuePreemptPlugin.renderTranslation = () => {};
queuePreemptPlugin.translationCache.clear();
queuePreemptPlugin.clearPendingAutoTranslationItem = item => { replacedCacheKey = item.cacheKey; };
queuePreemptPlugin.enqueueAutoTranslationItem(lowPriorityItem);
queuePreemptPlugin.autoTranslationInFlightItems = queuePreemptPlugin.getAutoTranslateQueueLimit() - 1;
queuePreemptPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ isConnected: true, priority: 5, content: { dataset: {}, isConnected: true, priority: 5, text: "visible foreign" } }],
    contentByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(queuePreemptPlugin.autoTranslationQueue.length, 1);
assert.equal(queuePreemptPlugin.autoTranslationQueue[0].text, "visible foreign");
assert.equal(queuePreemptPlugin.autoTranslationQueuedKeys.has("low"), false);

const visibleScanBudgetPlugin = new Plugin();
visibleScanBudgetPlugin.settings.translation.enabled = true;
visibleScanBudgetPlugin.settings.ui.autoTranslateMessages = true;
visibleScanBudgetPlugin.settings.translation.apiKey = "sk-test";
visibleScanBudgetPlugin.getAutoTranslateBatchSize = () => 2;
visibleScanBudgetPlugin.getAutoTranslateQueueLimit = () => 10;
visibleScanBudgetPlugin.getViewportPriority = element => element?.priority ?? 9999;
visibleScanBudgetPlugin.isElementVisibleInViewport = element => element?.visible === true;
visibleScanBudgetPlugin.isAutoTranslationTargetInScanRange = () => true;
visibleScanBudgetPlugin.getMessageContentElement = message => message.content;
visibleScanBudgetPlugin.getCachedElementText = content => content.text;
visibleScanBudgetPlugin.shouldAutoTranslateText = () => true;
visibleScanBudgetPlugin.hasCurrentTranslationLine = () => false;
visibleScanBudgetPlugin.drainAutoTranslationQueue = () => {};
const visibleScanMessages = Array.from({ length: 5 }, (_, index) => ({
    isConnected: true,
    visible: true,
    priority: index,
    content: { dataset: {}, isConnected: true, visible: true, priority: index, text: `visible scan ${index}` }
}));
visibleScanBudgetPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: visibleScanMessages,
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(visibleScanBudgetPlugin.autoTranslationQueue.length, 5);

const contentVisibleFallbackPlugin = new Plugin();
contentVisibleFallbackPlugin.settings.translation.enabled = true;
contentVisibleFallbackPlugin.settings.ui.autoTranslateMessages = true;
contentVisibleFallbackPlugin.settings.translation.apiKey = "sk-test";
contentVisibleFallbackPlugin.getViewportPriority = element => element?.priority ?? 9999;
contentVisibleFallbackPlugin.isElementVisibleInViewport = element => element?.visible === true;
contentVisibleFallbackPlugin.isElementVisibleForScan = element => element?.visible === true;
contentVisibleFallbackPlugin.isElementNearViewport = element => element?.near === true;
contentVisibleFallbackPlugin.getCachedElementText = content => content.text;
contentVisibleFallbackPlugin.shouldAutoTranslateText = () => true;
contentVisibleFallbackPlugin.hasCurrentTranslationLine = () => false;
contentVisibleFallbackPlugin.drainAutoTranslationQueue = () => {};
const contentVisibleFallbackContent = {
    dataset: {},
    isConnected: true,
    visible: true,
    priority: 4,
    text: "visible inner foreign text",
    closest: selector => String(selector || "").includes("chat-messages") ? contentVisibleFallbackMessage : null
};
const contentVisibleFallbackMessage = {
    isConnected: true,
    visible: false,
    priority: 9999,
    getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
    querySelectorAll: selector => String(selector || "").includes("messageContent") ? [contentVisibleFallbackContent] : [],
    contains: node => node === contentVisibleFallbackContent
};
assert.equal(contentVisibleFallbackPlugin.getScanMessageNodes([contentVisibleFallbackMessage], {
    rectByElement: new Map(),
    visibleByElement: new Map(),
    nearByElement: new Map(),
    priorityByElement: new Map(),
    scanRangeElements: new Set()
}).length, 1);
contentVisibleFallbackPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [contentVisibleFallbackMessage],
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map(),
    scanRangeElements: new Set([contentVisibleFallbackMessage])
});
assert.equal(contentVisibleFallbackPlugin.autoTranslationQueue.length, 1);
assert.equal(contentVisibleFallbackPlugin.autoTranslationQueue[0].text, "visible inner foreign text");

const prefetchScanBudgetPlugin = new Plugin();
prefetchScanBudgetPlugin.settings.translation.enabled = true;
prefetchScanBudgetPlugin.settings.ui.autoTranslateMessages = true;
prefetchScanBudgetPlugin.settings.ui.autoTranslatePrefetch = true;
prefetchScanBudgetPlugin.settings.translation.apiKey = "sk-test";
prefetchScanBudgetPlugin.getAutoTranslateBatchSize = () => 2;
prefetchScanBudgetPlugin.getAutoTranslateQueueLimit = () => 10;
prefetchScanBudgetPlugin.getViewportPriority = element => element?.priority ?? 9999;
prefetchScanBudgetPlugin.isElementVisibleInViewport = () => false;
prefetchScanBudgetPlugin.isAutoTranslationTargetInScanRange = () => true;
prefetchScanBudgetPlugin.getMessageContentElement = message => message.content;
prefetchScanBudgetPlugin.getCachedElementText = content => content.text;
prefetchScanBudgetPlugin.shouldAutoTranslateText = () => true;
prefetchScanBudgetPlugin.hasCurrentTranslationLine = () => false;
prefetchScanBudgetPlugin.drainAutoTranslationQueue = () => {};
const prefetchScanMessages = Array.from({ length: 5 }, (_, index) => ({
    isConnected: true,
    visible: false,
    priority: 100000 + index,
    content: { dataset: {}, isConnected: true, visible: false, priority: 100000 + index, text: `prefetch scan ${index}` }
}));
prefetchScanBudgetPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: prefetchScanMessages,
    contentByMessage: new Map(),
    contentElementsByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(prefetchScanBudgetPlugin.autoTranslationQueue.length, 2);

const prefetchCapPlugin = new Plugin();
prefetchCapPlugin.settings.ui.autoTranslateMessages = true;
prefetchCapPlugin.settings.ui.autoTranslatePrefetch = true;
prefetchCapPlugin.settings.ui.autoTranslateConcurrency = 2;
prefetchCapPlugin.getViewportPriority = element => element?.priority ?? 9999;
prefetchCapPlugin.isAutoTranslationTargetInScanRange = () => true;
prefetchCapPlugin.isElementVisibleInViewport = item => item?.visible === true;
prefetchCapPlugin.hasCurrentTranslationLine = () => false;
prefetchCapPlugin.getElementText = content => content.text;
let prefetchStarted = 0;
prefetchCapPlugin.autoTranslateQueuedMessage = item => {
    prefetchStarted++;
    item.started = true;
};
const prefetchQueuedItem = {
    messageNode: { isConnected: true, visible: false, priority: 120000 },
    content: { dataset: {}, isConnected: true, visible: false, priority: 120000, text: "prefetch foreign" },
    text: "prefetch foreign",
    cacheKey: "prefetch-cap",
    requestOptions: prefetchCapPlugin.getAutoTranslationOptions()
};
prefetchCapPlugin.enqueueAutoTranslationItem(prefetchQueuedItem);
prefetchCapPlugin.addAutoTranslationPendingTarget(prefetchQueuedItem.cacheKey, prefetchQueuedItem);
prefetchCapPlugin.autoTranslationInFlight = 1;
prefetchCapPlugin.autoTranslationPrefetchInFlight = 1;
prefetchCapPlugin.markAutoTranslationInFlightItem({ cacheKey: "prefetch-cap-in-flight", requestOptions: prefetchCapPlugin.getAutoTranslationOptions() });
prefetchCapPlugin.drainAutoTranslationQueue();
assert.equal(prefetchStarted, 0);
assert.equal(prefetchCapPlugin.autoTranslationQueue.length, 1);
assert.equal(prefetchCapPlugin.autoTranslationQueuedKeys.has("prefetch-cap"), true);

const visibleReservePlugin = new Plugin();
visibleReservePlugin.settings.ui.autoTranslateMessages = true;
visibleReservePlugin.settings.ui.autoTranslateConcurrency = 2;
visibleReservePlugin.getViewportPriority = element => element?.priority ?? 9999;
visibleReservePlugin.isAutoTranslationTargetInScanRange = () => true;
visibleReservePlugin.isElementVisibleInViewport = item => item?.visible === true;
visibleReservePlugin.hasCurrentTranslationLine = () => false;
visibleReservePlugin.getElementText = content => content.text;
let visibleStarted = 0;
visibleReservePlugin.autoTranslateQueuedMessage = item => {
    visibleStarted++;
    item.started = true;
};
const visibleReserveItem = {
    messageNode: { isConnected: true, visible: true, priority: 3 },
    content: { dataset: {}, isConnected: true, visible: true, priority: 3, text: "visible foreign" },
    text: "visible foreign",
    cacheKey: "visible-reserve",
    requestOptions: visibleReservePlugin.getAutoTranslationOptions()
};
visibleReservePlugin.enqueueAutoTranslationItem(visibleReserveItem);
visibleReservePlugin.addAutoTranslationPendingTarget(visibleReserveItem.cacheKey, visibleReserveItem);
visibleReservePlugin.autoTranslationInFlight = 1;
visibleReservePlugin.autoTranslationPrefetchInFlight = 1;
visibleReservePlugin.markAutoTranslationInFlightItem({ cacheKey: "visible-reserve-prefetch-in-flight", requestOptions: visibleReservePlugin.getAutoTranslationOptions() });
visibleReservePlugin.drainAutoTranslationQueue();
assert.equal(visibleStarted, 1);
assert.equal(visibleReservePlugin.autoTranslationInFlight, 2);
assert.equal(visibleReservePlugin.autoTranslationPrefetchInFlight, 1);

const prefetchDisabledDrainPlugin = new Plugin();
prefetchDisabledDrainPlugin.settings.ui.autoTranslateMessages = true;
prefetchDisabledDrainPlugin.settings.ui.autoTranslatePrefetch = false;
prefetchDisabledDrainPlugin.isElementVisibleInViewport = item => item?.visible === true;
prefetchDisabledDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
prefetchDisabledDrainPlugin.hasCurrentTranslationLine = () => false;
prefetchDisabledDrainPlugin.getElementText = content => content.text;
let prefetchDisabledStarted = 0;
let prefetchDisabledRemoved = 0;
prefetchDisabledDrainPlugin.autoTranslateQueuedMessage = () => { prefetchDisabledStarted++; };
prefetchDisabledDrainPlugin.removeAutoTranslationLoadingForItem = () => { prefetchDisabledRemoved++; };
const prefetchDisabledQueuedItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "was visible before scroll" },
    text: "was visible before scroll",
    cacheKey: "prefetch-disabled-drain",
    requestOptions: prefetchDisabledDrainPlugin.getAutoTranslationOptions()
};
prefetchDisabledDrainPlugin.enqueueAutoTranslationItem(prefetchDisabledQueuedItem);
prefetchDisabledDrainPlugin.addAutoTranslationPendingTarget(prefetchDisabledQueuedItem.cacheKey, prefetchDisabledQueuedItem);
prefetchDisabledDrainPlugin.drainAutoTranslationQueue();
assert.equal(prefetchDisabledStarted, 0);
assert.equal(prefetchDisabledRemoved, 1);
assert.equal(prefetchDisabledDrainPlugin.autoTranslationQueue.length, 0);
assert.equal(prefetchDisabledDrainPlugin.autoTranslationQueuedKeys.has(prefetchDisabledQueuedItem.cacheKey), false);
assert.equal(prefetchDisabledDrainPlugin.autoTranslationPendingTargets.has(prefetchDisabledQueuedItem.cacheKey), false);

const googlePrefetchDisabledDrainPlugin = new Plugin();
googlePrefetchDisabledDrainPlugin.settings.translation.provider = "googleCloud";
googlePrefetchDisabledDrainPlugin.settings.googleTranslate.allowPrefetch = false;
googlePrefetchDisabledDrainPlugin.isElementVisibleInViewport = item => item?.visible === true;
googlePrefetchDisabledDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
googlePrefetchDisabledDrainPlugin.hasCurrentTranslationLine = () => false;
googlePrefetchDisabledDrainPlugin.getElementText = content => content.text;
let googlePrefetchDisabledStarted = 0;
googlePrefetchDisabledDrainPlugin.autoTranslateQueuedMessage = () => { googlePrefetchDisabledStarted++; };
const googlePrefetchDisabledItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "google was visible" },
    text: "google was visible",
    cacheKey: "google-prefetch-disabled-drain",
    requestOptions: googlePrefetchDisabledDrainPlugin.getAutoTranslationOptions()
};
googlePrefetchDisabledDrainPlugin.enqueueAutoTranslationItem(googlePrefetchDisabledItem);
googlePrefetchDisabledDrainPlugin.addAutoTranslationPendingTarget(googlePrefetchDisabledItem.cacheKey, googlePrefetchDisabledItem);
googlePrefetchDisabledDrainPlugin.drainAutoTranslationQueue();
assert.equal(googlePrefetchDisabledStarted, 0);
assert.equal(googlePrefetchDisabledDrainPlugin.autoTranslationQueue.length, 0);
assert.equal(googlePrefetchDisabledDrainPlugin.autoTranslationQueuedKeys.has(googlePrefetchDisabledItem.cacheKey), false);

const visibleBehindPrefetchPlugin = new Plugin();
visibleBehindPrefetchPlugin.settings.ui.autoTranslateConcurrency = 2;
visibleBehindPrefetchPlugin.settings.ui.autoTranslateMessages = true;
visibleBehindPrefetchPlugin.settings.ui.autoTranslatePrefetch = true;
visibleBehindPrefetchPlugin.isElementVisibleInViewport = item => item?.visible === true;
visibleBehindPrefetchPlugin.isAutoTranslationTargetInScanRange = () => true;
visibleBehindPrefetchPlugin.hasCurrentTranslationLine = () => false;
visibleBehindPrefetchPlugin.getElementText = content => content.text;
let startedBehindPrefetch = "";
visibleBehindPrefetchPlugin.autoTranslateQueuedMessage = item => {
    startedBehindPrefetch = item.cacheKey;
};
const blockedPrefetchItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "blocked prefetch" },
    text: "blocked prefetch",
    cacheKey: "blocked-prefetch",
    requestOptions: visibleBehindPrefetchPlugin.getAutoTranslationOptions()
};
const visibleBehindItem = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "visible behind" },
    text: "visible behind",
    cacheKey: "visible-behind",
    requestOptions: visibleBehindPrefetchPlugin.getAutoTranslationOptions()
};
visibleBehindPrefetchPlugin.enqueueAutoTranslationItem(blockedPrefetchItem);
visibleBehindPrefetchPlugin.enqueueAutoTranslationItem(visibleBehindItem);
visibleBehindPrefetchPlugin.addAutoTranslationPendingTarget(blockedPrefetchItem.cacheKey, blockedPrefetchItem);
visibleBehindPrefetchPlugin.addAutoTranslationPendingTarget(visibleBehindItem.cacheKey, visibleBehindItem);
visibleBehindPrefetchPlugin.autoTranslationInFlight = 1;
visibleBehindPrefetchPlugin.autoTranslationPrefetchInFlight = 1;
visibleBehindPrefetchPlugin.markAutoTranslationInFlightItem({ cacheKey: "visible-behind-prefetch-in-flight", requestOptions: visibleBehindPrefetchPlugin.getAutoTranslationOptions() });
visibleBehindPrefetchPlugin.drainAutoTranslationQueue();
assert.equal(startedBehindPrefetch, "visible-behind");
assert.equal(visibleBehindPrefetchPlugin.autoTranslationQueue.some(item => item.cacheKey === "blocked-prefetch"), true);
assert.equal(visibleBehindPrefetchPlugin.autoTranslationQueuedKeys.has("blocked-prefetch"), true);

const visibleBeforeAvailablePrefetchPlugin = new Plugin();
visibleBeforeAvailablePrefetchPlugin.settings.ui.autoTranslateConcurrency = 2;
visibleBeforeAvailablePrefetchPlugin.settings.ui.autoTranslateMessages = true;
visibleBeforeAvailablePrefetchPlugin.settings.ui.autoTranslatePrefetch = true;
visibleBeforeAvailablePrefetchPlugin.isElementVisibleInViewport = item => item?.visible === true;
visibleBeforeAvailablePrefetchPlugin.isAutoTranslationTargetInScanRange = () => true;
visibleBeforeAvailablePrefetchPlugin.hasCurrentTranslationLine = () => false;
visibleBeforeAvailablePrefetchPlugin.getElementText = content => content.text;
const visibleBeforeAvailableStarts = [];
visibleBeforeAvailablePrefetchPlugin.autoTranslateQueuedMessage = item => {
    visibleBeforeAvailableStarts.push(item.cacheKey);
};
const availablePrefetchItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "available prefetch" },
    text: "available prefetch",
    cacheKey: "available-prefetch",
    requestOptions: visibleBeforeAvailablePrefetchPlugin.getAutoTranslationOptions()
};
const visibleAfterAvailablePrefetchItem = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "visible after prefetch" },
    text: "visible after prefetch",
    cacheKey: "visible-after-prefetch",
    requestOptions: visibleBeforeAvailablePrefetchPlugin.getAutoTranslationOptions()
};
visibleBeforeAvailablePrefetchPlugin.enqueueAutoTranslationItem(availablePrefetchItem);
visibleBeforeAvailablePrefetchPlugin.enqueueAutoTranslationItem(visibleAfterAvailablePrefetchItem);
visibleBeforeAvailablePrefetchPlugin.addAutoTranslationPendingTarget(availablePrefetchItem.cacheKey, availablePrefetchItem);
visibleBeforeAvailablePrefetchPlugin.addAutoTranslationPendingTarget(visibleAfterAvailablePrefetchItem.cacheKey, visibleAfterAvailablePrefetchItem);
visibleBeforeAvailablePrefetchPlugin.drainAutoTranslationQueue();
assert.deepEqual(visibleBeforeAvailableStarts, ["visible-after-prefetch"]);
assert.equal(visibleBeforeAvailablePrefetchPlugin.autoTranslationQueue.some(item => item.cacheKey === "available-prefetch"), true);

const prefetchWaitsForVisiblePlugin = new Plugin();
prefetchWaitsForVisiblePlugin.settings.ui.autoTranslateConcurrency = 4;
prefetchWaitsForVisiblePlugin.settings.ui.autoTranslateMessages = true;
prefetchWaitsForVisiblePlugin.settings.ui.autoTranslatePrefetch = true;
prefetchWaitsForVisiblePlugin.isElementVisibleInViewport = item => item?.visible === true;
prefetchWaitsForVisiblePlugin.isAutoTranslationTargetInScanRange = () => true;
prefetchWaitsForVisiblePlugin.hasCurrentTranslationLine = () => false;
prefetchWaitsForVisiblePlugin.getElementText = content => content.text;
const prefetchWaitStarts = [];
prefetchWaitsForVisiblePlugin.autoTranslateQueuedMessage = item => {
    prefetchWaitStarts.push(item.cacheKey);
};
const prefetchWaitVisible = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "visible first" },
    text: "visible first",
    cacheKey: "prefetch-wait-visible",
    requestOptions: prefetchWaitsForVisiblePlugin.getAutoTranslationOptions()
};
const prefetchWaitItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "prefetch waits" },
    text: "prefetch waits",
    cacheKey: "prefetch-waits",
    requestOptions: prefetchWaitsForVisiblePlugin.getAutoTranslationOptions()
};
prefetchWaitsForVisiblePlugin.enqueueAutoTranslationItem(prefetchWaitItem);
prefetchWaitsForVisiblePlugin.enqueueAutoTranslationItem(prefetchWaitVisible);
prefetchWaitsForVisiblePlugin.addAutoTranslationPendingTarget(prefetchWaitItem.cacheKey, prefetchWaitItem);
prefetchWaitsForVisiblePlugin.addAutoTranslationPendingTarget(prefetchWaitVisible.cacheKey, prefetchWaitVisible);
prefetchWaitsForVisiblePlugin.drainAutoTranslationQueue();
assert.deepEqual(prefetchWaitStarts, ["prefetch-wait-visible"]);
assert.equal(prefetchWaitsForVisiblePlugin.autoTranslationQueue.some(item => item.cacheKey === "prefetch-waits"), true);

const prefetchInputBusyPlugin = new Plugin();
prefetchInputBusyPlugin.settings.ui.autoTranslateMessages = true;
prefetchInputBusyPlugin.settings.ui.autoTranslatePrefetch = true;
prefetchInputBusyPlugin.isElementVisibleInViewport = item => item?.visible === true;
const prefetchInputBusyItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "prefetch busy" },
    text: "prefetch busy",
    cacheKey: "prefetch-input-busy",
    requestOptions: prefetchInputBusyPlugin.getAutoTranslationOptions()
};
prefetchInputBusyPlugin.markInputComposerBusy(500);
assert.equal(prefetchInputBusyPlugin.isAutoTranslationPrefetchAllowed(prefetchInputBusyItem), false);

const prefetchTransientFailurePlugin = new Plugin();
prefetchTransientFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
prefetchTransientFailurePlugin.showAutoTranslateError = () => {};
const prefetchTransientOptions = prefetchTransientFailurePlugin.getAutoTranslationOptions();
const prefetchTransientItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "prefetch timeout" },
    text: "prefetch timeout",
    cacheKey: "prefetch-transient-failure",
    requestOptions: prefetchTransientOptions,
    daitPrefetchRequest: true
};
prefetchTransientFailurePlugin.markAutoTranslationFailure(prefetchTransientItem, new Error("API request timed out after 25s"));
assert.equal(prefetchTransientFailurePlugin.autoTranslationFailures.has(prefetchTransientItem.cacheKey), true);
assert.equal(prefetchTransientFailurePlugin.getAutoTranslationFailure(prefetchTransientItem.cacheKey).weak, true);
assert.equal(Boolean(prefetchTransientFailurePlugin.getAutoTranslationProviderFailure(prefetchTransientOptions)), false);

const prefetchInvalidFailurePlugin = new Plugin();
prefetchInvalidFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
prefetchInvalidFailurePlugin.showAutoTranslateError = () => {};
const prefetchInvalidOptions = prefetchInvalidFailurePlugin.getAutoTranslationOptions();
const prefetchInvalidItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "prefetch invalid" },
    text: "prefetch invalid",
    cacheKey: "prefetch-invalid-failure",
    requestOptions: prefetchInvalidOptions,
    daitPrefetchRequest: true
};
prefetchInvalidFailurePlugin.markAutoTranslationFailure(prefetchInvalidItem, prefetchInvalidFailurePlugin.createFinalInvalidAutoTranslationError("same-as-source"));
assert.equal(prefetchInvalidFailurePlugin.isTerminalAutoTranslationFailure(prefetchInvalidFailurePlugin.getAutoTranslationFailure(prefetchInvalidItem.cacheKey)), true);
assert.equal(prefetchInvalidFailurePlugin.getAutoTextTranslationFailure(prefetchInvalidItem.text, prefetchInvalidOptions), null);

const visibleAfterPrefetchFailurePlugin = new Plugin();
visibleAfterPrefetchFailurePlugin.settings.translation.enabled = true;
visibleAfterPrefetchFailurePlugin.settings.ui.autoTranslateMessages = true;
visibleAfterPrefetchFailurePlugin.settings.translation.apiKey = "sk-test";
visibleAfterPrefetchFailurePlugin.isElementVisibleInViewport = () => true;
visibleAfterPrefetchFailurePlugin.getMessageContentElement = message => message.content;
visibleAfterPrefetchFailurePlugin.getCachedElementText = content => content.text;
visibleAfterPrefetchFailurePlugin.getElementText = content => content.text;
visibleAfterPrefetchFailurePlugin.getMessageIdentity = message => `message:visible-after-prefetch-failure:${message.id}`;
visibleAfterPrefetchFailurePlugin.shouldAutoTranslateText = () => true;
visibleAfterPrefetchFailurePlugin.hasCurrentTranslationLine = () => false;
visibleAfterPrefetchFailurePlugin.drainAutoTranslationQueue = () => {};
const visibleAfterPrefetchMessage = { id: "retry", isConnected: true, content: { dataset: {}, isConnected: true, text: "prefetch invalid" } };
const visibleAfterPrefetchOptions = visibleAfterPrefetchFailurePlugin.withMessageIdentity(
    visibleAfterPrefetchFailurePlugin.getAutoTranslationOptions(),
    visibleAfterPrefetchMessage,
    visibleAfterPrefetchMessage.content,
    "prefetch invalid"
);
const visibleAfterPrefetchKey = visibleAfterPrefetchFailurePlugin.getTranslationCacheKey("prefetch invalid", visibleAfterPrefetchOptions);
const visibleAfterPrefetchError = Object.assign(new Error("weak invalid"), {
    autoTranslationWeakFailure: true,
    autoTranslationInvalidReason: "same-as-source"
});
visibleAfterPrefetchFailurePlugin.autoTranslationFailures.set(
    visibleAfterPrefetchKey,
    visibleAfterPrefetchFailurePlugin.createAutoTranslationFailure(visibleAfterPrefetchKey, visibleAfterPrefetchError)
);
visibleAfterPrefetchFailurePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [visibleAfterPrefetchMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(visibleAfterPrefetchFailurePlugin.autoTranslationQueue.length, 1);
assert.equal(visibleAfterPrefetchFailurePlugin.getAutoTranslationFailure(visibleAfterPrefetchKey), null);

const prefetchAuthFailurePlugin = new Plugin();
prefetchAuthFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
prefetchAuthFailurePlugin.showAutoTranslateError = () => {};
const prefetchAuthOptions = prefetchAuthFailurePlugin.getAutoTranslationOptions();
const prefetchAuthItem = {
    messageNode: { isConnected: true, visible: false },
    content: { dataset: {}, isConnected: true, visible: false, text: "prefetch auth" },
    text: "prefetch auth",
    cacheKey: "prefetch-auth-failure",
    requestOptions: prefetchAuthOptions,
    daitPrefetchRequest: true
};
const prefetchAuthError = new Error("Unauthorized");
prefetchAuthError.status = 401;
prefetchAuthFailurePlugin.markAutoTranslationFailure(prefetchAuthItem, prefetchAuthError);
assert.equal(prefetchAuthFailurePlugin.getAutoTranslationProviderFailure(prefetchAuthOptions)?.type, "auth");

const visibleTransientFailurePlugin = new Plugin();
visibleTransientFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
visibleTransientFailurePlugin.showAutoTranslateError = () => {};
const visibleTransientOptions = visibleTransientFailurePlugin.getAutoTranslationOptions();
const visibleTransientItem = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "visible timeout" },
    text: "visible timeout",
    cacheKey: "visible-transient-failure",
    requestOptions: visibleTransientOptions
};
visibleTransientFailurePlugin.markAutoTranslationFailure(visibleTransientItem, new Error("API request timed out after 25s"));
assert.equal(visibleTransientFailurePlugin.getAutoTranslationProviderFailure(visibleTransientOptions)?.type, "timeout");

const fullConcurrencyPlugin = new Plugin();
fullConcurrencyPlugin.settings.ui.autoTranslateMessages = true;
fullConcurrencyPlugin.settings.ui.autoTranslateConcurrency = 4;
fullConcurrencyPlugin.isElementVisibleInViewport = item => item?.visible === true;
fullConcurrencyPlugin.isAutoTranslationTargetInScanRange = () => true;
fullConcurrencyPlugin.hasCurrentTranslationLine = () => false;
fullConcurrencyPlugin.getElementText = content => content.text;
const fullConcurrencyBatches = [];
fullConcurrencyPlugin.autoTranslateQueuedBatch = batch => {
    fullConcurrencyBatches.push(batch.length);
};
Array.from({ length: 24 }, (_, index) => {
    const item = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: `visible-${index}` },
        text: `visible-${index}`,
        cacheKey: `full-concurrency-${index}`,
        requestOptions: fullConcurrencyPlugin.getAutoTranslationOptions()
    };
    fullConcurrencyPlugin.enqueueAutoTranslationItem(item);
    fullConcurrencyPlugin.addAutoTranslationPendingTarget(item.cacheKey, item);
});
fullConcurrencyPlugin.drainAutoTranslationQueue();
assert.deepEqual(fullConcurrencyBatches, [6, 6, 6, 6]);
assert.equal(fullConcurrencyPlugin.autoTranslationInFlight, 4);
assert.equal(fullConcurrencyPlugin.autoTranslationQueue.length, 0);

const localTenPlugin = new Plugin();
localTenPlugin.settings.translation.provider = "sakuraLocal";
localTenPlugin.settings.ui.autoTranslateMessages = true;
localTenPlugin.settings.ui.autoTranslateConcurrency = 10;
localTenPlugin.shouldBlockAutoTranslationForLocalProviderHealth = () => false;
localTenPlugin.isElementVisibleInViewport = item => item?.visible === true;
localTenPlugin.isAutoTranslationTargetInScanRange = () => true;
localTenPlugin.hasCurrentTranslationLine = () => false;
localTenPlugin.getElementText = content => content.text;
const localStarted = [];
localTenPlugin.autoTranslateQueuedMessage = item => localStarted.push(item);
for (let index = 0; index < 11; index++) {
    const item = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: `local-${index}` },
        text: `local-${index}`,
        cacheKey: `local-ten-${index}`,
        requestOptions: localTenPlugin.getAutoTranslationOptions()
    };
    localTenPlugin.enqueueAutoTranslationItem(item);
    localTenPlugin.addAutoTranslationPendingTarget(item.cacheKey, item);
}
localTenPlugin.drainAutoTranslationQueue();
assert.equal(localStarted.length, 10);
assert.equal(localTenPlugin.autoTranslationInFlight, 10);
assert.equal(localTenPlugin.autoTranslationQueue.length, 1);
localTenPlugin.drainAutoTranslationQueue();
assert.equal(localStarted.length, 10);
// Releasing one active request allows exactly one waiting message to start.
localTenPlugin.autoTranslationInFlight--;
localTenPlugin.autoTranslationInFlightItems--;
localTenPlugin.drainAutoTranslationQueue();
assert.equal(localStarted.length, 11);
assert.equal(localTenPlugin.autoTranslationInFlight, 10);
assert.equal(localTenPlugin.autoTranslationQueue.length, 0);

const googleBatchPlugin = new Plugin();
googleBatchPlugin.settings.ui.autoTranslateMessages = true;
googleBatchPlugin.settings.translation.provider = "googleCloud";
googleBatchPlugin.isElementVisibleInViewport = item => item?.visible === true;
googleBatchPlugin.isAutoTranslationTargetInScanRange = () => true;
googleBatchPlugin.hasCurrentTranslationLine = () => false;
googleBatchPlugin.getElementText = content => content.text;
const googleBatchLengths = [];
const googleBatchOptions = googleBatchPlugin.getAutoTranslationOptions();
googleBatchPlugin.autoTranslateQueuedBatch = batch => {
    googleBatchLengths.push(batch.length);
};
Array.from({ length: 20 }, (_, index) => {
    const item = {
        messageNode: { isConnected: true, visible: true },
        content: { dataset: {}, isConnected: true, visible: true, text: `google-visible-${index}` },
        text: `google-visible-${index}`,
        cacheKey: `google-batch-${index}`,
        requestOptions: googleBatchOptions
    };
    googleBatchPlugin.enqueueAutoTranslationItem(item);
    googleBatchPlugin.addAutoTranslationPendingTarget(item.cacheKey, item);
});
googleBatchPlugin.drainAutoTranslationQueue();
assert.deepEqual(googleBatchLengths, [20]);
assert.equal(googleBatchPlugin.autoTranslationQueue.length, 0);

const queueLimitVisiblePlugin = new Plugin();
queueLimitVisiblePlugin.getViewportPriority = element => element?.priority ?? 9999;
queueLimitVisiblePlugin.isElementVisibleInViewport = item => item?.visible === true;
queueLimitVisiblePlugin.autoTranslationInFlightItems = queueLimitVisiblePlugin.getAutoTranslateQueueLimit();
assert.equal(queueLimitVisiblePlugin.makeRoomForAutoTranslationItem(visibleReserveItem, queueLimitVisiblePlugin.getAutoTranslateQueueLimit()), true);

const hiddenPrefetchPlugin = new Plugin();
hiddenPrefetchPlugin.isElementVisibleInViewport = item => item?.visible === true;
assert.equal(hiddenPrefetchPlugin.isAutoTranslationVisibleItem({
    messageNode: { isConnected: true, visible: true },
    content: { isConnected: true, visible: false }
}), false);
assert.equal(hiddenPrefetchPlugin.isAutoTranslationPrefetchItem({
    messageNode: { isConnected: true, visible: true },
    content: { isConnected: true, visible: false }
}), true);

const promotionPlugin = new Plugin();
promotionPlugin.settings.ui.autoTranslateMessages = true;
promotionPlugin.getViewportPriority = element => element?.priority ?? 9999;
const promotedFar = {
    messageNode: { priority: 800 },
    content: { dataset: { daitOwner: "promoted-owner" }, priority: 800 },
    text: "same",
    cacheKey: "promoted",
    requestOptions: promotionPlugin.getAutoTranslationOptions()
};
const promotedNear = {
    messageNode: { priority: 5 },
    content: { dataset: { daitOwner: "promoted-owner" }, priority: 5 },
    text: "same",
    cacheKey: "promoted",
    requestOptions: promotionPlugin.getAutoTranslationOptions()
};
promotionPlugin.addAutoTranslationPendingTarget("promoted", promotedFar);
promotionPlugin.enqueueAutoTranslationItem(promotedFar);
promotionPlugin.addAutoTranslationPendingTarget("promoted", promotedNear);
promotionPlugin.promoteQueuedAutoTranslationItem("promoted", promotedNear);
assert.equal(promotionPlugin.autoTranslationQueue[0].priority, 5);
assert.equal(promotionPlugin.getAutoTranslationPendingTargets({ cacheKey: "promoted" })[0].priority, 5);

const pruneQueuePlugin = new Plugin();
pruneQueuePlugin.settings.translation.enabled = true;
pruneQueuePlugin.settings.ui.autoTranslateMessages = true;
pruneQueuePlugin.settings.translation.apiKey = "sk-test";
pruneQueuePlugin.settings.translation.targetLanguage = "姹夎";
pruneQueuePlugin.isElementVisibleInViewport = node => node.visible !== false;
pruneQueuePlugin.getElementText = content => content.text;
pruneQueuePlugin.getMessageContentElement = message => message.content;
pruneQueuePlugin.getCachedElementText = content => content.text;
pruneQueuePlugin.shouldAutoTranslateText = () => true;
pruneQueuePlugin.hasCurrentTranslationLine = () => false;
pruneQueuePlugin.drainAutoTranslationQueue = () => {};
const staleKey = "stale-cache-key";
const staleItem = {
    messageNode: { isConnected: false, visible: false },
    content: { isConnected: false, visible: false, text: "old" },
    text: "old",
    cacheKey: staleKey,
    requestOptions: pruneQueuePlugin.getAutoTranslationOptions()
};
pruneQueuePlugin.autoTranslationQueue.push(staleItem);
pruneQueuePlugin.autoTranslationQueuedKeys.add(staleKey);
pruneQueuePlugin.addAutoTranslationPendingTarget(staleKey, staleItem);
const freshMessage = {
    isConnected: true,
    content: { dataset: {}, isConnected: true, visible: true, text: "fresh foreign text" },
    visible: true
};
pruneQueuePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [freshMessage],
    contentByMessage: new Map(),
    textByElement: new Map(),
    replyTextByElement: new Map()
});
assert.equal(pruneQueuePlugin.autoTranslationQueuedKeys.has(staleKey), false);
assert.equal(pruneQueuePlugin.autoTranslationQueue.length, 1);
assert.equal(pruneQueuePlugin.autoTranslationQueue[0].text, "fresh foreign text");

const orphanPendingPlugin = new Plugin();
orphanPendingPlugin.settings.translation.enabled = true;
orphanPendingPlugin.settings.ui.autoTranslateMessages = true;
orphanPendingPlugin.settings.translation.apiKey = "sk-test";
orphanPendingPlugin.settings.translation.targetLanguage = "Chinese";
orphanPendingPlugin.isElementVisibleInViewport = node => node.visible !== false;
orphanPendingPlugin.getElementText = content => content.text;
orphanPendingPlugin.getMessageContentElement = message => message.content;
orphanPendingPlugin.getCachedElementText = content => content.text;
orphanPendingPlugin.shouldAutoTranslateText = () => true;
orphanPendingPlugin.hasCurrentTranslationLine = () => false;
orphanPendingPlugin.drainAutoTranslationQueue = () => {};
const orphanPendingMessage = {
    id: "orphan-pending",
    isConnected: true,
    visible: true,
    content: { dataset: {}, isConnected: true, visible: true, text: "I have Kiro pro no 429 error." }
};
const orphanPendingOptions = orphanPendingPlugin.withMessageIdentity(
    orphanPendingPlugin.getAutoTranslationOptions(),
    orphanPendingMessage,
    orphanPendingMessage.content,
    orphanPendingMessage.content.text
);
const orphanPendingKey = orphanPendingPlugin.getTranslationCacheKey(orphanPendingMessage.content.text, orphanPendingOptions);
orphanPendingPlugin.addAutoTranslationPendingTarget(orphanPendingKey, {
    messageNode: orphanPendingMessage,
    content: orphanPendingMessage.content,
    text: orphanPendingMessage.content.text,
    cacheKey: orphanPendingKey,
    requestOptions: orphanPendingOptions
});
orphanPendingPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [orphanPendingMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(orphanPendingPlugin.autoTranslationQueue.length, 1);
assert.equal(orphanPendingPlugin.autoTranslationQueue[0].cacheKey, orphanPendingKey);

const activePrunePlugin = new Plugin();
activePrunePlugin.autoTranslationQueuedKeys.add("ghost-queued-key");
assert.equal(activePrunePlugin.hasActiveAutoTranslationKey("ghost-queued-key"), false);
activePrunePlugin.autoTranslationInFlight = 1;
activePrunePlugin.autoTranslationInFlightItems = 1;
activePrunePlugin.autoTranslationInFlightKeys.add("ghost-in-flight-key");
activePrunePlugin.autoTranslationInFlightStartedAt.set("ghost-in-flight-key", Date.now() - 600000);
assert.equal(activePrunePlugin.hasActiveAutoTranslationKey("ghost-in-flight-key"), false);
assert.equal(activePrunePlugin.autoTranslationInFlight, 0);

const inFlightScanPlugin = new Plugin();
inFlightScanPlugin.settings.translation.enabled = true;
inFlightScanPlugin.settings.ui.autoTranslateMessages = true;
inFlightScanPlugin.settings.translation.apiKey = "sk-test";
inFlightScanPlugin.settings.translation.targetLanguage = "Chinese";
inFlightScanPlugin.settings.ui.diagnosticsEnabled = true;
inFlightScanPlugin.isElementVisibleInViewport = () => true;
inFlightScanPlugin.getElementText = content => content.text;
inFlightScanPlugin.getMessageContentElement = message => message.content;
inFlightScanPlugin.getCachedElementText = content => content.text;
inFlightScanPlugin.getMessageIdentity = () => "in-flight-scan-identity";
inFlightScanPlugin.shouldAutoTranslateText = () => true;
inFlightScanPlugin.hasCurrentTranslationLine = () => false;
let inFlightScanDrainCount = 0;
inFlightScanPlugin.drainAutoTranslationQueue = () => { inFlightScanDrainCount++; };
const inFlightScanMessage = {
    isConnected: true,
    content: { dataset: {}, isConnected: true, text: "same in flight" }
};
const inFlightScanOptions = inFlightScanPlugin.withMessageIdentity(
    inFlightScanPlugin.getAutoTranslationOptions(),
    inFlightScanMessage,
    inFlightScanMessage.content,
    inFlightScanMessage.content.text
);
const inFlightScanKey = inFlightScanPlugin.getTranslationCacheKey(inFlightScanMessage.content.text, inFlightScanOptions);
inFlightScanPlugin.autoTranslationQueuedKeys.add(inFlightScanKey);
inFlightScanPlugin.autoTranslationInFlightKeys.add(inFlightScanKey);
inFlightScanPlugin.autoTranslationInFlightStartedAt.set(inFlightScanKey, Date.now());
inFlightScanPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [inFlightScanMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(inFlightScanPlugin.autoTranslationQueue.length, 0);
assert.equal(inFlightScanDrainCount, 1);
assert.equal(inFlightScanPlugin.autoTranslationQueuedKeys.has(inFlightScanKey), false);
assert.equal(inFlightScanPlugin.autoTranslationInFlightKeys.has(inFlightScanKey), true);
assert.equal(inFlightScanPlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightScanKey }).length, 1);
assert.equal(inFlightScanPlugin.translationCacheStats.misses, 0);
const inFlightScanLog = inFlightScanPlugin.diagnosticLogs.find(entry => entry.action === "auto.scan");
assert.equal(inFlightScanLog.meta.active, 1);
assert.equal(inFlightScanLog.meta.cacheHits, 0);
assert.equal(inFlightScanLog.meta.textCacheHits, 0);

const alternateTargetPlugin = new Plugin();
alternateTargetPlugin.isElementVisibleInViewport = node => node.visible !== false;
alternateTargetPlugin.getElementText = content => content.text;
alternateTargetPlugin.hasCurrentTranslationLine = () => false;
const alternateKey = "alternate-cache-key";
const disconnectedTarget = {
    messageNode: { isConnected: false, visible: false },
    content: { dataset: { daitOwner: "old-target" }, isConnected: false, visible: false, text: "same" },
    text: "same",
    cacheKey: alternateKey
};
const visibleTarget = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: { daitOwner: "new-target" }, isConnected: true, visible: true, text: "same" },
    text: "same",
    cacheKey: alternateKey
};
alternateTargetPlugin.autoTranslationQueue.push({ ...disconnectedTarget, requestOptions: alternateTargetPlugin.getAutoTranslationOptions() });
alternateTargetPlugin.autoTranslationQueuedKeys.add(alternateKey);
alternateTargetPlugin.addAutoTranslationPendingTarget(alternateKey, disconnectedTarget);
alternateTargetPlugin.addAutoTranslationPendingTarget(alternateKey, visibleTarget);
const alternateBatch = alternateTargetPlugin.takeAutoTranslationBatch();
assert.equal(alternateBatch.length, 1);
assert.equal(alternateBatch[0].content, visibleTarget.content);
assert.equal(alternateTargetPlugin.getAutoTranslationPendingTargets({ cacheKey: alternateKey }).length, 1);
assert.equal(alternateTargetPlugin.autoTranslationQueuedKeys.has(alternateKey), false);

const groupedBatchPlugin = new Plugin();
groupedBatchPlugin.isElementVisibleInViewport = () => true;
groupedBatchPlugin.isAutoTranslationTargetInScanRange = () => true;
groupedBatchPlugin.getElementText = content => content.text;
groupedBatchPlugin.hasCurrentTranslationLine = () => false;
const groupedOptionsA = groupedBatchPlugin.getAutoTranslationOptions();
const groupedOptionsB = {
    ...groupedBatchPlugin.getAutoTranslationOptions(),
    targetLanguage: "English"
};
assert.notEqual(
    groupedBatchPlugin.getAutoTranslationBatchGroupKey({ ...groupedOptionsA, routeKey: "guild:channel-a:" }),
    groupedBatchPlugin.getAutoTranslationBatchGroupKey({ ...groupedOptionsA, routeKey: "guild:channel-b:" })
);
const groupedItemA = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "group-a" }, isConnected: true, text: "same-a" },
    text: "same-a",
    cacheKey: "group-a",
    requestOptions: groupedOptionsA
};
const groupedItemB = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "group-b" }, isConnected: true, text: "same-b" },
    text: "same-b",
    cacheKey: "group-b",
    requestOptions: groupedOptionsB
};
groupedBatchPlugin.autoTranslationQueue.push(groupedItemA, groupedItemB);
groupedBatchPlugin.addAutoTranslationPendingTarget(groupedItemA.cacheKey, groupedItemA);
groupedBatchPlugin.addAutoTranslationPendingTarget(groupedItemB.cacheKey, groupedItemB);
const groupedBatch = groupedBatchPlugin.takeAutoTranslationBatch();
assert.equal(groupedBatch.length, 1);
assert.equal(groupedBatch[0].cacheKey, "group-a");
assert.equal(groupedBatchPlugin.autoTranslationQueue.length, 1);
assert.equal(groupedBatchPlugin.autoTranslationQueue[0].cacheKey, "group-b");

const drainCooldownPlugin = new Plugin();
drainCooldownPlugin.settings.ui.autoTranslateMessages = true;
drainCooldownPlugin.isElementVisibleInViewport = () => true;
drainCooldownPlugin.isAutoTranslationTargetInScanRange = () => true;
drainCooldownPlugin.getElementText = content => content.text;
drainCooldownPlugin.hasCurrentTranslationLine = () => false;
const drainOptions = drainCooldownPlugin.getAutoTranslationOptions();
const drainItem = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "drain-a" }, isConnected: true, text: "same-a" },
    text: "same-a",
    cacheKey: "drain-a",
    requestOptions: drainOptions
};
drainCooldownPlugin.autoTranslationQueue.push(drainItem);
drainCooldownPlugin.addAutoTranslationPendingTarget(drainItem.cacheKey, drainItem);
drainCooldownPlugin.autoTranslationProviderFailures.set(drainOptions.providerKey, { retryAt: Date.now() + 30000 });
drainCooldownPlugin.drainAutoTranslationQueue();
assert.equal(drainCooldownPlugin.autoTranslationQueue.length, 1);
assert.equal(drainCooldownPlugin.autoTranslationInFlight, 0);
clearTimeout(drainCooldownPlugin.autoTranslationRetryTimer);
drainCooldownPlugin.autoTranslationRetryTimer = null;

const localHealthDrainPlugin = new Plugin();
localHealthDrainPlugin.settings.translation.provider = "sakuraLocal";
localHealthDrainPlugin.settings.ui.autoTranslateMessages = true;
localHealthDrainPlugin.settings.translation.apiKey = "";
localHealthDrainPlugin.settings.translation.apiStatus = { state: "untested", message: "" };
localHealthDrainPlugin.isElementVisibleInViewport = () => true;
localHealthDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
localHealthDrainPlugin.getElementText = content => content.text;
localHealthDrainPlugin.hasCurrentTranslationLine = () => false;
let localHealthDrainRemoved = 0;
let localHealthDrainProbeStarted = "";
localHealthDrainPlugin.removeAutoTranslationLoadingForItem = () => { localHealthDrainRemoved++; };
localHealthDrainPlugin.startLocalProviderHealthProbe = providerKey => { localHealthDrainProbeStarted = providerKey; };
const localHealthDrainOptions = localHealthDrainPlugin.getAutoTranslationOptions();
const localHealthDrainItem = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "local-health-drain" }, isConnected: true, text: "same local health" },
    text: "same local health",
    cacheKey: "local-health-drain",
    requestOptions: localHealthDrainOptions
};
localHealthDrainPlugin.autoTranslationQueue.push(localHealthDrainItem);
localHealthDrainPlugin.autoTranslationQueuedKeys.add(localHealthDrainItem.cacheKey);
localHealthDrainPlugin.addAutoTranslationPendingTarget(localHealthDrainItem.cacheKey, localHealthDrainItem);
localHealthDrainPlugin.drainAutoTranslationQueue();
assert.equal(localHealthDrainPlugin.autoTranslationQueue.length, 1);
assert.equal(localHealthDrainPlugin.autoTranslationQueuedKeys.has(localHealthDrainItem.cacheKey), true);
assert.equal(localHealthDrainPlugin.autoTranslationPendingTargets.has(localHealthDrainItem.cacheKey), true);
assert.ok(Number(localHealthDrainPlugin.autoTranslationQueue[0]?.daitRequeueAfter || 0) >= Date.now());
assert.equal(localHealthDrainRemoved, 1);
assert.equal(localHealthDrainPlugin.autoTranslationInFlight, 0);
assert.equal(localHealthDrainProbeStarted, localHealthDrainOptions.providerKey);
assert.notEqual(localHealthDrainPlugin.autoTranslationRetryTimer, null);
clearTimeout(localHealthDrainPlugin.autoTranslationRetryTimer);
localHealthDrainPlugin.autoTranslationRetryTimer = null;

const localUnavailableDrainPlugin = new Plugin();
localUnavailableDrainPlugin.settings.translation.provider = "sakuraLocal";
localUnavailableDrainPlugin.settings.ui.autoTranslateMessages = true;
localUnavailableDrainPlugin.settings.translation.apiKey = "";
localUnavailableDrainPlugin.settings.translation.apiStatus = { state: "success", message: "" };
localUnavailableDrainPlugin.isElementVisibleInViewport = () => true;
localUnavailableDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
localUnavailableDrainPlugin.getElementText = content => content.text;
localUnavailableDrainPlugin.hasCurrentTranslationLine = () => false;
let localUnavailableDrainRemoved = 0;
localUnavailableDrainPlugin.removeAutoTranslationLoadingForItem = () => { localUnavailableDrainRemoved++; };
localUnavailableDrainPlugin.startLocalProviderHealthProbe = () => { throw new Error("local-unavailable cooldown should be handled before health gate"); };
const localUnavailableDrainOptions = localUnavailableDrainPlugin.getAutoTranslationOptions();
const localUnavailableDrainItem = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "local-unavailable-drain" }, isConnected: true, text: "same local unavailable" },
    text: "same local unavailable",
    cacheKey: "local-unavailable-drain",
    requestOptions: localUnavailableDrainOptions
};
localUnavailableDrainPlugin.autoTranslationQueue.push(localUnavailableDrainItem);
localUnavailableDrainPlugin.autoTranslationQueuedKeys.add(localUnavailableDrainItem.cacheKey);
localUnavailableDrainPlugin.addAutoTranslationPendingTarget(localUnavailableDrainItem.cacheKey, localUnavailableDrainItem);
localUnavailableDrainPlugin.autoTranslationProviderFailures.set(localUnavailableDrainOptions.providerKey, {
    type: "local-unavailable",
    retryAt: Date.now() + 30000,
    retryAfterMs: 30000
});
localUnavailableDrainPlugin.drainAutoTranslationQueue();
assert.equal(localUnavailableDrainPlugin.autoTranslationQueue.length, 1);
assert.equal(localUnavailableDrainPlugin.autoTranslationQueuedKeys.has(localUnavailableDrainItem.cacheKey), true);
assert.equal(localUnavailableDrainPlugin.autoTranslationPendingTargets.has(localUnavailableDrainItem.cacheKey), true);
assert.ok(Number(localUnavailableDrainPlugin.autoTranslationQueue[0]?.daitRequeueAfter || 0) >= Date.now());
assert.equal(localUnavailableDrainRemoved, 1);
assert.equal(localUnavailableDrainPlugin.autoTranslationInFlight, 0);
assert.notEqual(localUnavailableDrainPlugin.autoTranslationRetryTimer, null);
clearTimeout(localUnavailableDrainPlugin.autoTranslationRetryTimer);
localUnavailableDrainPlugin.autoTranslationRetryTimer = null;

const localUnavailableInvisibleDrainPlugin = new Plugin();
localUnavailableInvisibleDrainPlugin.settings.translation.provider = "sakuraLocal";
localUnavailableInvisibleDrainPlugin.settings.ui.autoTranslateMessages = true;
localUnavailableInvisibleDrainPlugin.settings.translation.apiKey = "";
localUnavailableInvisibleDrainPlugin.settings.translation.apiStatus = { state: "success", message: "" };
localUnavailableInvisibleDrainPlugin.isElementVisibleInViewport = () => false;
localUnavailableInvisibleDrainPlugin.isAutoTranslationTargetInScanRange = () => true;
localUnavailableInvisibleDrainPlugin.getElementText = content => content.text;
localUnavailableInvisibleDrainPlugin.hasCurrentTranslationLine = () => false;
let localUnavailableInvisibleRemoved = 0;
localUnavailableInvisibleDrainPlugin.removeAutoTranslationLoadingForItem = () => { localUnavailableInvisibleRemoved++; };
const localUnavailableInvisibleOptions = localUnavailableInvisibleDrainPlugin.getAutoTranslationOptions();
const localUnavailableInvisibleItem = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "local-unavailable-invisible" }, isConnected: true, text: "same hidden local unavailable" },
    text: "same hidden local unavailable",
    cacheKey: "local-unavailable-invisible",
    requestOptions: localUnavailableInvisibleOptions
};
localUnavailableInvisibleDrainPlugin.autoTranslationQueue.push(localUnavailableInvisibleItem);
localUnavailableInvisibleDrainPlugin.autoTranslationQueuedKeys.add(localUnavailableInvisibleItem.cacheKey);
localUnavailableInvisibleDrainPlugin.addAutoTranslationPendingTarget(localUnavailableInvisibleItem.cacheKey, localUnavailableInvisibleItem);
localUnavailableInvisibleDrainPlugin.autoTranslationProviderFailures.set(localUnavailableInvisibleOptions.providerKey, {
    type: "local-unavailable",
    retryAt: Date.now() + 30000,
    retryAfterMs: 30000
});
localUnavailableInvisibleDrainPlugin.drainAutoTranslationQueue();
assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationQueue.length, 0);
assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationQueuedKeys.has(localUnavailableInvisibleItem.cacheKey), false);
assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationPendingTargets.has(localUnavailableInvisibleItem.cacheKey), false);
assert.equal(localUnavailableInvisibleRemoved, 1);
assert.equal(localUnavailableInvisibleDrainPlugin.autoTranslationInFlight, 0);
clearTimeout(localUnavailableInvisibleDrainPlugin.autoTranslationRetryTimer);
localUnavailableInvisibleDrainPlugin.autoTranslationRetryTimer = null;

const requeuePlugin = new Plugin();
requeuePlugin.settings.ui.autoTranslateMessages = true;
const requeueItem = { cacheKey: "requeue-key" };
requeuePlugin.requeueAutoTranslationItem(requeueItem);
requeuePlugin.requeueAutoTranslationItem(requeueItem);
assert.equal(requeueItem.daitRequeued, true);
assert.equal(requeuePlugin.autoTranslationQueue.length, 1);
assert.equal(requeuePlugin.autoTranslationQueuedKeys.has("requeue-key"), true);
assert.equal(requeuePlugin.autoTranslationQueue[0].daitRequeued, undefined);

const inFlightCounterDriftPlugin = new Plugin();
inFlightCounterDriftPlugin.autoTranslationInFlight = 2;
inFlightCounterDriftPlugin.autoTranslationInFlightItems = 3;
inFlightCounterDriftPlugin.autoTranslationPrefetchInFlight = 1;
inFlightCounterDriftPlugin.pruneAutoTranslationActiveState();
assert.equal(inFlightCounterDriftPlugin.autoTranslationInFlight, 0);
assert.equal(inFlightCounterDriftPlugin.autoTranslationInFlightItems, 0);
assert.equal(inFlightCounterDriftPlugin.autoTranslationPrefetchInFlight, 0);

const requeuePriorityPlugin = new Plugin();
requeuePriorityPlugin.settings.ui.autoTranslateMessages = true;
requeuePriorityPlugin.getViewportPriority = element => element?.priority ?? 9999;
const requeuePriorityItem = {
    messageNode: { priority: 4 },
    content: { dataset: {}, priority: 4 },
    cacheKey: "requeue-priority",
    priority: 900,
    daitPrefetchRequest: true
};
requeuePriorityPlugin.requeueAutoTranslationItem(requeuePriorityItem);
assert.equal(requeuePriorityPlugin.autoTranslationQueue[0].priority, 4);
assert.equal(requeuePriorityPlugin.autoTranslationQueue[0].daitPrefetchRequest, undefined);
assert.equal(requeuePriorityPlugin.autoTranslationQueue[0].daitRequeued, undefined);

const delayedRequeuePlugin = new Plugin();
delayedRequeuePlugin.settings.ui.autoTranslateMessages = true;
let delayedRequeueStarted = false;
let delayedRequeueRetryDelay = 0;
delayedRequeuePlugin.autoTranslateQueuedMessage = () => { delayedRequeueStarted = true; };
delayedRequeuePlugin.scheduleAutoTranslationRetryScan = delay => { delayedRequeueRetryDelay = delay; };
delayedRequeuePlugin.autoTranslationQueue.push({
    cacheKey: "delayed-requeue",
    daitRequeueAfter: Date.now() + 5000
});
delayedRequeuePlugin.autoTranslationQueuedKeys.add("delayed-requeue");
delayedRequeuePlugin.drainAutoTranslationQueue();
assert.equal(delayedRequeueStarted, false);
assert.equal(delayedRequeuePlugin.autoTranslationQueue.length, 1);
assert.equal(delayedRequeuePlugin.autoTranslationInFlight, 0);
assert.ok(delayedRequeueRetryDelay > 0);

const delayedBehindReadyPlugin = new Plugin();
delayedBehindReadyPlugin.settings.ui.autoTranslateMessages = true;
let delayedBehindReadyStarted = "";
delayedBehindReadyPlugin.getElementText = content => content.text;
delayedBehindReadyPlugin.isElementVisibleInViewport = item => item?.visible === true;
delayedBehindReadyPlugin.hasCurrentTranslationLine = () => false;
delayedBehindReadyPlugin.autoTranslateQueuedMessage = item => { delayedBehindReadyStarted = item.cacheKey; };
delayedBehindReadyPlugin.scheduleAutoTranslationRetryScan = () => {};
const delayedFrontItem = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "delayed" },
    text: "delayed",
    cacheKey: "delayed-front",
    requestOptions: delayedBehindReadyPlugin.getAutoTranslationOptions(),
    daitRequeueAfter: Date.now() + 5000
};
const readyBehindItem = {
    messageNode: { isConnected: true, visible: true },
    content: { dataset: {}, isConnected: true, visible: true, text: "ready" },
    text: "ready",
    cacheKey: "ready-behind",
    requestOptions: delayedBehindReadyPlugin.getAutoTranslationOptions()
};
delayedBehindReadyPlugin.enqueueAutoTranslationItem(delayedFrontItem);
delayedBehindReadyPlugin.enqueueAutoTranslationItem(readyBehindItem);
delayedBehindReadyPlugin.addAutoTranslationPendingTarget(delayedFrontItem.cacheKey, delayedFrontItem);
delayedBehindReadyPlugin.addAutoTranslationPendingTarget(readyBehindItem.cacheKey, readyBehindItem);
delayedBehindReadyPlugin.drainAutoTranslationQueue();
assert.equal(delayedBehindReadyStarted, "ready-behind");
assert.equal(delayedBehindReadyPlugin.autoTranslationQueue.some(item => item.cacheKey === "delayed-front"), true);

const invalidatePlugin = new Plugin();
let removedInvalidatedLoading = 0;
invalidatePlugin.removeAutoTranslationNode = () => { removedInvalidatedLoading++; };
const invalidatedItem = {
    messageNode: {},
    content: { dataset: {} },
    text: "old text",
    cacheKey: "old-cache",
    requestOptions: invalidatePlugin.getAutoTranslationOptions()
};
invalidatePlugin.autoTranslationQueue.push(invalidatedItem);
invalidatePlugin.autoTranslationQueuedKeys.add(invalidatedItem.cacheKey);
invalidatePlugin.addAutoTranslationPendingTarget(invalidatedItem.cacheKey, invalidatedItem);
invalidatePlugin.autoTranslationFailures.set("stale-failure", { retryAt: Date.now() + 10000 });
invalidatePlugin.autoTranslationProviderFailures.set("stale-provider", { retryAt: Date.now() + 10000 });
invalidatePlugin.autoTranslationRetryTimer = setTimeout(() => {}, 10000);
let removedAutoInvalidationLine = false;
let removedManualInvalidationLine = false;
const savedDocumentForInvalidation = global.document;
global.document = {
    querySelectorAll: selector => selector === ".dait-translation-line" ? [
        { dataset: { daitMode: "auto" }, remove: () => { removedAutoInvalidationLine = true; } },
        { dataset: { daitMode: "manual" }, remove: () => { removedManualInvalidationLine = true; } }
    ] : []
};
const oldVersion = invalidatePlugin.autoTranslationConfigVersion;
invalidatePlugin.invalidateAutoTranslationQueue();
global.document = savedDocumentForInvalidation;
assert.equal(invalidatePlugin.autoTranslationConfigVersion, oldVersion + 1);
assert.equal(invalidatePlugin.autoTranslationQueue.length, 0);
assert.equal(invalidatePlugin.autoTranslationQueuedKeys.size, 0);
assert.equal(invalidatePlugin.autoTranslationPendingTargets.size, 0);
assert.equal(invalidatePlugin.autoTranslationFailures.size, 0);
assert.equal(invalidatePlugin.autoTranslationProviderFailures.size, 0);
assert.equal(invalidatePlugin.autoTranslationRetryTimer, null);
assert.equal(removedAutoInvalidationLine, true);
assert.equal(removedManualInvalidationLine, false);
assert.equal(removedInvalidatedLoading, 1);
assert.equal(invalidatePlugin.isAutoTranslationRequestCurrent(invalidatedItem.requestOptions), false);

const inFlightInvalidatePlugin = new Plugin();
const inFlightInvalidateRendered = [];
inFlightInvalidatePlugin.isElementVisibleInViewport = () => true;
inFlightInvalidatePlugin.getElementText = content => content.text;
inFlightInvalidatePlugin.renderTranslation = (messageNode, content, translated) => {
    inFlightInvalidateRendered.push({ messageNode, content, translated });
};
inFlightInvalidatePlugin.queueScan = () => {};
const inFlightInvalidateKey = "in-flight-preserve-key";
const inFlightInvalidateTargetA = {
    messageNode: { id: "a", isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same in-flight text" },
    text: "same in-flight text",
    cacheKey: inFlightInvalidateKey,
    requestOptions: inFlightInvalidatePlugin.getAutoTranslationOptions()
};
const inFlightInvalidateTargetB = {
    messageNode: { id: "b", isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same in-flight text" },
    text: "same in-flight text",
    cacheKey: inFlightInvalidateKey,
    requestOptions: inFlightInvalidateTargetA.requestOptions
};
inFlightInvalidatePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightInvalidateTargetA);
inFlightInvalidatePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightInvalidateTargetB);
inFlightInvalidatePlugin.autoTranslationInFlightKeys.add(inFlightInvalidateKey);
inFlightInvalidatePlugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
assert.equal(inFlightInvalidatePlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightInvalidateKey }).length, 2);
inFlightInvalidatePlugin.renderAutoTranslationResult(inFlightInvalidateTargetA, "\u8df3\u8f6c\u540e\u5df2\u7ffb\u8bd1");
assert.equal(inFlightInvalidateRendered.length, 2);
assert.equal(inFlightInvalidatePlugin.autoTranslationPendingTargets.has(inFlightInvalidateKey), false);

const inFlightFailurePlugin = new Plugin();
let inFlightFailureRemoved = 0;
inFlightFailurePlugin.removeAutoTranslationNode = () => { inFlightFailureRemoved++; };
inFlightFailurePlugin.scheduleAutoTranslationRetryScan = () => {};
inFlightFailurePlugin.showAutoTranslateError = () => {};
const inFlightFailureTargetA = {
    messageNode: { id: "failure-a", isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same failure text" },
    text: "same failure text",
    cacheKey: inFlightInvalidateKey,
    requestOptions: inFlightFailurePlugin.getAutoTranslationOptions()
};
const inFlightFailureTargetB = {
    messageNode: { id: "failure-b", isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same failure text" },
    text: "same failure text",
    cacheKey: inFlightInvalidateKey,
    requestOptions: inFlightFailureTargetA.requestOptions
};
inFlightFailurePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightFailureTargetA);
inFlightFailurePlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightFailureTargetB);
inFlightFailurePlugin.autoTranslationInFlightKeys.add(inFlightInvalidateKey);
inFlightFailurePlugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
assert.equal(inFlightFailurePlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightInvalidateKey }).length, 2);
inFlightFailurePlugin.markAutoTranslationFailureSafely(inFlightFailureTargetA, new Error("invalid output"));
assert.equal(inFlightFailureRemoved, 2);
assert.equal(inFlightFailurePlugin.autoTranslationPendingTargets.has(inFlightInvalidateKey), false);
assert.equal(inFlightFailurePlugin.autoTranslationFailures.has(inFlightInvalidateKey), true);

const inFlightClearPlugin = new Plugin();
let inFlightClearRemoved = 0;
inFlightClearPlugin.removeAutoTranslationNode = () => { inFlightClearRemoved++; };
const inFlightClearTargetA = {
    messageNode: { id: "clear-a", isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same clear text" },
    text: "same clear text",
    cacheKey: inFlightInvalidateKey,
    requestOptions: inFlightClearPlugin.getAutoTranslationOptions()
};
const inFlightClearTargetB = {
    messageNode: { id: "clear-b", isConnected: true },
    content: { dataset: {}, isConnected: true, text: "same clear text" },
    text: "same clear text",
    cacheKey: inFlightInvalidateKey,
    requestOptions: inFlightClearTargetA.requestOptions
};
inFlightClearPlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightClearTargetA);
inFlightClearPlugin.addAutoTranslationPendingTarget(inFlightInvalidateKey, inFlightClearTargetB);
inFlightClearPlugin.autoTranslationInFlightKeys.add(inFlightInvalidateKey);
inFlightClearPlugin.invalidateAutoTranslationQueue({ preserveFailures: true, preserveRetry: true, preserveNodes: true, preserveVersion: true });
assert.equal(inFlightClearPlugin.getAutoTranslationPendingTargets({ cacheKey: inFlightInvalidateKey }).length, 2);
inFlightClearPlugin.clearPendingAutoTranslationItemSafely(inFlightClearTargetA);
assert.equal(inFlightClearRemoved, 2);
assert.equal(inFlightClearPlugin.autoTranslationPendingTargets.has(inFlightInvalidateKey), false);

const batchTargetPlugin = new Plugin();
batchTargetPlugin.settings.translation.targetLanguage = "姹夎";
const englishBatchOptions = {
    mode: "auto",
    version: batchTargetPlugin.autoTranslationConfigVersion,
    targetLanguage: "English",
    configOverrides: { prompt: "base prompt" }
};
assert.match(batchTargetPlugin.getAutoTranslationBatchOptions(1, englishBatchOptions).configOverrides.prompt, /English/);

const inFlightDedupePlugin = new Plugin();
inFlightDedupePlugin.settings.ui.autoTranslateMessages = true;
inFlightDedupePlugin.autoTranslationQueuedKeys.add("in-flight-key");
inFlightDedupePlugin.autoTranslationInFlightKeys.add("in-flight-key");
assert.equal(inFlightDedupePlugin.enqueueAutoTranslationItem({
    cacheKey: "in-flight-key",
    messageNode: { isConnected: true },
    content: { isConnected: true },
    text: "source"
}), false);
assert.equal(inFlightDedupePlugin.autoTranslationQueue.length, 0);
assert.equal(inFlightDedupePlugin.enqueueAutoTranslationItem({
    cacheKey: "new-key",
    messageNode: { isConnected: true },
    content: { isConnected: true },
    text: "source"
}), true);
assert.equal(inFlightDedupePlugin.autoTranslationQueue.length, 1);

const retryInFlightPlugin = new Plugin();
retryInFlightPlugin.settings.translation.enabled = true;
retryInFlightPlugin.settings.translation.apiKey = "sk-test";
retryInFlightPlugin.getMessageIdentity = () => "retry-in-flight-identity";
retryInFlightPlugin.getElementText = content => content.text;
retryInFlightPlugin.isReplyPreviewElement = () => false;
retryInFlightPlugin.drainAutoTranslationQueue = () => {};
const retryInFlightContent = { dataset: {}, isConnected: true, text: "retry active text" };
const retryInFlightMessage = { isConnected: true };
const retryInFlightOptions = retryInFlightPlugin.withMessageIdentity(retryInFlightPlugin.getAutoTranslationOptions(), retryInFlightMessage, retryInFlightContent, "retry active text");
const retryInFlightKey = retryInFlightPlugin.getTranslationCacheKey("retry active text", retryInFlightOptions);
retryInFlightPlugin.autoTranslationQueuedKeys.add(retryInFlightKey);
retryInFlightPlugin.autoTranslationInFlightKeys.add(retryInFlightKey);
retryInFlightPlugin.retryAutoTranslationTarget(retryInFlightMessage, retryInFlightContent, "retry active text");
assert.equal(retryInFlightPlugin.autoTranslationQueue.length, 0);
assert.equal(retryInFlightPlugin.getAutoTranslationPendingTargets({ cacheKey: retryInFlightKey }).length, 1);

const templateInvalidationPlugin = new Plugin();
templateInvalidationPlugin.showToast = () => {};
const translationTemplate = templateInvalidationPlugin.getPromptTemplates("translation")[0];
const templateVersion = templateInvalidationPlugin.autoTranslationConfigVersion;
templateInvalidationPlugin.applyPromptTemplate("translation", translationTemplate.id);
assert.equal(templateInvalidationPlugin.autoTranslationConfigVersion, templateVersion + 1);

const cacheRenderCalls = [];
const cachedPlugin = new Plugin();
cachedPlugin.settings.translation.enabled = true;
cachedPlugin.settings.ui.autoTranslateMessages = true;
cachedPlugin.settings.translation.apiKey = "sk-test";
cachedPlugin.settings.translation.targetLanguage = "汉语";
cachedPlugin.isElementVisibleInViewport = () => true;
cachedPlugin.isAutoTranslationTargetInScanRange = () => true;
cachedPlugin.getMessageContentElement = message => message.content;
cachedPlugin.getCachedElementText = content => content.text;
cachedPlugin.getElementText = content => content.text;
cachedPlugin.getMessageIdentity = () => "cached-fanout-identity";
cachedPlugin.shouldAutoTranslateText = text => text === "bonjour";
cachedPlugin.hasCurrentTranslationLine = () => false;
cachedPlugin.renderTranslation = (messageNode, content, translated) => cacheRenderCalls.push({ messageNode, content, translated });
cachedPlugin.drainAutoTranslationQueue = () => {};
const cachedMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const cachedOptions = cachedPlugin.withMessageIdentity(cachedPlugin.getAutoTranslationOptions(), cachedMessage, cachedMessage.content, "bonjour");
const cachedKey = cachedPlugin.getTranslationCacheKey("bonjour", cachedOptions);
cachedPlugin.setTranslationCache(cachedKey, "你好");
const cachedPendingMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
cachedPlugin.addAutoTranslationPendingTarget(cachedKey, {
    messageNode: cachedPendingMessage,
    content: cachedPendingMessage.content,
    text: "bonjour",
    cacheKey: cachedKey,
    requestOptions: cachedOptions
});
cachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [cachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(cachedPlugin.autoTranslationQueue.length, 0);
assert.equal(cacheRenderCalls.length, 2);
assert.equal(cacheRenderCalls.every(call => call.translated === "你好"), true);
assert.equal(cacheRenderCalls.some(call => call.messageNode === cachedPendingMessage), true);

const pausedCacheRenderCalls = [];
const pausedCachedPlugin = new Plugin();
pausedCachedPlugin.settings.translation.enabled = true;
pausedCachedPlugin.settings.ui.autoTranslateMessages = true;
pausedCachedPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
// The chat is still scrolling: cached lines wait until it is still, not until the render pause ends.
pausedCachedPlugin.autoTranslationLastExternalScrollAt = Date.now();
pausedCachedPlugin.isAutoTranslationTargetInScanRange = () => true;
pausedCachedPlugin.isElementVisibleInViewport = () => true;
pausedCachedPlugin.getMessageContentElement = message => message.content;
pausedCachedPlugin.getCachedElementText = content => content.text;
pausedCachedPlugin.getElementText = content => content.text;
pausedCachedPlugin.getMessageIdentity = message => `message:paused-cache:${message.id}`;
pausedCachedPlugin.shouldAutoTranslateText = () => true;
pausedCachedPlugin.hasCurrentTranslationLine = () => false;
pausedCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
pausedCachedPlugin.renderTranslation = (messageNode, content, translated) => pausedCacheRenderCalls.push({ messageNode, content, translated });
pausedCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("paused cache hit should not start API work"); };
pausedCachedPlugin.scheduleAutoTranslationRetryScan = () => {};
const pausedCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour paused cache" } };
const pausedCachedOptions = pausedCachedPlugin.withMessageIdentity(pausedCachedPlugin.getAutoTranslationOptions(), pausedCachedMessage, pausedCachedMessage.content, "bonjour paused cache");
const pausedCachedKey = pausedCachedPlugin.getTranslationCacheKey("bonjour paused cache", pausedCachedOptions);
pausedCachedPlugin.setTranslationCache(pausedCachedKey, "paused cached translation");
pausedCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [pausedCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
}, { cacheOnly: true });
assert.equal(pausedCachedPlugin.autoTranslationQueue.length, 0);
assert.equal(pausedCacheRenderCalls.length, 0);
assert.equal(pausedCachedPlugin.autoTranslationRenderQueue.length, 1);
clearTimeout(pausedCachedPlugin.autoTranslationRenderTimer);
pausedCachedPlugin.autoTranslationRenderTimer = null;
pausedCachedPlugin.autoTranslationLastExternalScrollAt = 0;
pausedCachedPlugin.processAutoTranslationRenderQueue();
assert.equal(pausedCacheRenderCalls.length, 1);
assert.equal(pausedCachedPlugin.isAutoTranslationRenderPaused(), true);

const quickSettingsRenderPausePlugin = new Plugin();
quickSettingsRenderPausePlugin.isStarted = true;
quickSettingsRenderPausePlugin.settings.ui.diagnosticsEnabled = true;
quickSettingsRenderPausePlugin.isQuickSettingsPanelOpen = () => true;
let quickSettingsRenderRan = false;
quickSettingsRenderPausePlugin.autoTranslationRenderQueue.push({
    target: { text: "bonjour quick settings" },
    run() { quickSettingsRenderRan = true; }
});
quickSettingsRenderPausePlugin.processAutoTranslationRenderQueue();
assert.equal(quickSettingsRenderRan, false);
assert.equal(quickSettingsRenderPausePlugin.quickSettingsRenderDeferred, true);
assert.equal(quickSettingsRenderPausePlugin.autoTranslationRenderQueue.length, 1);
assert.ok(quickSettingsRenderPausePlugin.diagnosticLogs.some(entry => entry.action === "auto.render.queue" && entry.status === "deferred" && entry.meta?.reason === "quick-settings-open"));

const quickSettingsResumePlugin = new Plugin();
quickSettingsResumePlugin.isStarted = true;
quickSettingsResumePlugin.quickSettingsScanDeferred = true;
quickSettingsResumePlugin.quickSettingsRenderDeferred = true;
quickSettingsResumePlugin.autoTranslationRenderQueue.push({
    target: { text: "resume quick settings" },
    run() {}
});
quickSettingsResumePlugin.isQuickSettingsPanelOpen = () => false;
let quickSettingsResumeScanDelay = 0;
let quickSettingsResumeRenderDelay = 0;
quickSettingsResumePlugin.queueScan = options => { quickSettingsResumeScanDelay = Number(options?.delayMs || 0); };
quickSettingsResumePlugin.scheduleAutoTranslationRenderQueue = delay => { quickSettingsResumeRenderDelay = Number(delay || 0); };
quickSettingsResumePlugin.resumeQuickSettingsDeferredWork("test-close");
assert.ok(quickSettingsResumeScanDelay > 0);
assert.ok(quickSettingsResumeRenderDelay > 0);
assert.equal(quickSettingsResumePlugin.quickSettingsScanDeferred, false);
assert.equal(quickSettingsResumePlugin.quickSettingsRenderDeferred, false);

const activeCacheOnlyPlugin = new Plugin();
activeCacheOnlyPlugin.settings.translation.enabled = true;
activeCacheOnlyPlugin.settings.translation.apiKey = "sk-test";
activeCacheOnlyPlugin.settings.translation.targetLanguage = "Chinese";
activeCacheOnlyPlugin.isElementVisibleInViewport = () => true;
activeCacheOnlyPlugin.getMessageContentElement = message => message.content;
activeCacheOnlyPlugin.getCachedElementText = content => content.text;
activeCacheOnlyPlugin.getElementText = content => content.text;
activeCacheOnlyPlugin.getMessageIdentity = () => "active-cacheonly-identity";
activeCacheOnlyPlugin.shouldAutoTranslateText = () => true;
activeCacheOnlyPlugin.hasCurrentTranslationLine = () => false;
activeCacheOnlyPlugin.renderTranslation = () => { throw new Error("active cache-only target should not render without cache"); };
activeCacheOnlyPlugin.drainAutoTranslationQueue = () => { throw new Error("cache-only scan should not drain API queue"); };
const activeCacheOnlyMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour active" } };
const activeCacheOnlyOptions = activeCacheOnlyPlugin.withMessageIdentity(activeCacheOnlyPlugin.getAutoTranslationOptions(), activeCacheOnlyMessage, activeCacheOnlyMessage.content, "bonjour active");
const activeCacheOnlyKey = activeCacheOnlyPlugin.getTranslationCacheKey("bonjour active", activeCacheOnlyOptions);
activeCacheOnlyPlugin.autoTranslationInFlightKeys.add(activeCacheOnlyKey);
activeCacheOnlyPlugin.autoTranslationInFlightStartedAt.set(activeCacheOnlyKey, Date.now());
activeCacheOnlyPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [activeCacheOnlyMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
}, { cacheOnly: true });
assert.equal(activeCacheOnlyPlugin.autoTranslationQueue.length, 0);
assert.equal(activeCacheOnlyPlugin.getAutoTranslationPendingTargets({ cacheKey: activeCacheOnlyKey }).length, 1);

const activeCacheHitPlugin = new Plugin();
const activeCacheHitRenderCalls = [];
activeCacheHitPlugin.settings.translation.enabled = true;
activeCacheHitPlugin.settings.ui.autoTranslateMessages = true;
activeCacheHitPlugin.settings.translation.apiKey = "sk-test";
activeCacheHitPlugin.settings.translation.targetLanguage = "Chinese";
activeCacheHitPlugin.isElementVisibleInViewport = () => true;
activeCacheHitPlugin.getMessageContentElement = message => message.content;
activeCacheHitPlugin.getCachedElementText = content => content.text;
activeCacheHitPlugin.getElementText = content => content.text;
activeCacheHitPlugin.getMessageIdentity = () => "active-cachehit-identity";
activeCacheHitPlugin.shouldAutoTranslateText = text => text === "bonjour active cached";
activeCacheHitPlugin.hasCurrentTranslationLine = () => false;
activeCacheHitPlugin.renderTranslation = (messageNode, content, translated) => activeCacheHitRenderCalls.push({ messageNode, content, translated });
activeCacheHitPlugin.drainAutoTranslationQueue = () => {};
const activeCacheHitMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour active cached" } };
const activeCacheHitOptions = activeCacheHitPlugin.withMessageIdentity(activeCacheHitPlugin.getAutoTranslationOptions(), activeCacheHitMessage, activeCacheHitMessage.content, "bonjour active cached");
const activeCacheHitKey = activeCacheHitPlugin.getTranslationCacheKey("bonjour active cached", activeCacheHitOptions);
activeCacheHitPlugin.autoTranslationInFlightKeys.add(activeCacheHitKey);
activeCacheHitPlugin.autoTranslationInFlightStartedAt.set(activeCacheHitKey, Date.now());
activeCacheHitPlugin.autoTranslationQueuedKeys.add(activeCacheHitKey);
activeCacheHitPlugin.autoTranslationQueue.push({
    messageNode: activeCacheHitMessage,
    content: activeCacheHitMessage.content,
    text: "bonjour active cached",
    cacheKey: activeCacheHitKey,
    requestOptions: activeCacheHitOptions
});
activeCacheHitPlugin.addAutoTranslationPendingTarget(activeCacheHitKey, {
    messageNode: activeCacheHitMessage,
    content: activeCacheHitMessage.content,
    text: "bonjour active cached",
    cacheKey: activeCacheHitKey,
    requestOptions: activeCacheHitOptions
});
activeCacheHitPlugin.setTranslationCache(activeCacheHitKey, "\u5df2\u7ffb\u8bd1\u7684\u6d3b\u8dc3\u7f13\u5b58");
activeCacheHitPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [activeCacheHitMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
}, { cacheOnly: true });
assert.equal(activeCacheHitRenderCalls.length, 1);
assert.equal(activeCacheHitRenderCalls[0].translated, "\u5df2\u7ffb\u8bd1\u7684\u6d3b\u8dc3\u7f13\u5b58");
assert.equal(activeCacheHitPlugin.autoTranslationQueue.length, 0);
assert.equal(activeCacheHitPlugin.autoTranslationInFlightKeys.has(activeCacheHitKey), true);
assert.equal(activeCacheHitPlugin.autoTranslationPendingTargets.has(activeCacheHitKey), false);

const autoTextCachePlugin = new Plugin();
const autoTextRenderCalls = [];
autoTextCachePlugin.settings.translation.enabled = true;
autoTextCachePlugin.settings.ui.autoTranslateMessages = true;
autoTextCachePlugin.settings.translation.apiKey = "sk-test";
autoTextCachePlugin.settings.translation.targetLanguage = "Chinese";
autoTextCachePlugin.settings.ui.diagnosticsEnabled = true;
autoTextCachePlugin.isElementVisibleInViewport = () => true;
autoTextCachePlugin.getMessageContentElement = message => message.content;
autoTextCachePlugin.getCachedElementText = content => content.text;
autoTextCachePlugin.getElementText = content => content.text;
autoTextCachePlugin.shouldAutoTranslateText = text => text === "bonjour";
autoTextCachePlugin.hasCurrentTranslationLine = () => false;
autoTextCachePlugin.getMessageIdentity = message => `message:${message.id}:same-text`;
autoTextCachePlugin.renderTranslation = (messageNode, content, translated, cacheKey) => autoTextRenderCalls.push({ messageNode, content, translated, cacheKey });
let autoTextDrainCount = 0;
autoTextCachePlugin.drainAutoTranslationQueue = () => { autoTextDrainCount++; };
const autoTextFirst = { id: "one", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const autoTextFirstOptions = autoTextCachePlugin.withMessageIdentity(autoTextCachePlugin.getAutoTranslationOptions(), autoTextFirst, autoTextFirst.content, "bonjour");
autoTextCachePlugin.setAutoTextTranslationCache("bonjour", autoTextFirstOptions, "\u4f60\u597d");
const autoTextSecond = { id: "two", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const autoTextSecondOptions = autoTextCachePlugin.withMessageIdentity(autoTextCachePlugin.getAutoTranslationOptions(), autoTextSecond, autoTextSecond.content, "bonjour");
const autoTextSecondScopedKey = autoTextCachePlugin.getTranslationCacheKey("bonjour", autoTextSecondOptions);
assert.equal(autoTextCachePlugin.translationCache.has(autoTextSecondScopedKey), false);
let autoTextIdentityLookups = 0;
autoTextCachePlugin.getMessageIdentity = message => {
    autoTextIdentityLookups++;
    return `message:${message.id}:same-text`;
};
autoTextCachePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [autoTextSecond],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(autoTextCachePlugin.autoTranslationQueue.length, 0);
assert.equal(autoTextDrainCount, 1);
assert.equal(autoTextRenderCalls.length, 1);
assert.equal(autoTextRenderCalls[0].translated, "\u4f60\u597d");
assert.equal(autoTextRenderCalls[0].cacheKey, autoTextSecondScopedKey);
assert.equal(autoTextCachePlugin.translationCache.has(autoTextSecondScopedKey), false);
assert.equal(autoTextIdentityLookups > 0, true);
const autoTextScanLog = autoTextCachePlugin.diagnosticLogs.find(entry => entry.action === "auto.scan");
assert.equal(autoTextScanLog.meta.textCacheHits, 1);
assert.equal(autoTextScanLog.meta.cacheHits, 0);
clearTimeout(autoTextCachePlugin.translationCacheDirtyTimer);
autoTextCachePlugin.translationCacheDirtyTimer = null;

const persistentCachePlugin = new Plugin();
let savedCachePayload = null;
let persistentSaveCount = 0;
persistentCachePlugin.saveData = (key, value) => {
    persistentSaveCount++;
    if (key === "translationCache") savedCachePayload = value;
    return true;
};
persistentCachePlugin.flushTranslationCache();
assert.equal(persistentSaveCount, 0);
persistentCachePlugin.setTranslationCache("persist-key", "persisted translation");
persistentCachePlugin.flushTranslationCache();
assert.equal(persistentSaveCount, 1);
assert.equal(savedCachePayload.version, 3);
assert.equal(Array.isArray(savedCachePayload.strings), true);
assert.equal(savedCachePayload.entries.length, 1);
const restoredCachePlugin = new Plugin();
restoredCachePlugin.loadData = key => key === "translationCache" ? savedCachePayload : null;
restoredCachePlugin.loadTranslationCache();
assert.equal(restoredCachePlugin.getTranslationCacheValue("persist-key"), "persisted translation");
assert.equal(restoredCachePlugin.translationCacheStats.hits, 1);
assert.ok(restoredCachePlugin.translationCacheMeta.get("persist-key").expiresAt >= Date.now() + (6 * 60 * 60 * 1000) - 1000);
clearTimeout(restoredCachePlugin.translationCacheDirtyTimer);
restoredCachePlugin.translationCacheDirtyTimer = null;

const ttlClampPlugin = new Plugin();
const ttlClampNow = Date.now();
ttlClampPlugin.translationCache.set("ttl-clamp", "translation");
ttlClampPlugin.translationCacheMeta.set("ttl-clamp", {
    createdAt: ttlClampNow - 60 * 60 * 1000,
    touchedAt: ttlClampNow - 60 * 60 * 1000,
    expiresAt: ttlClampNow + 7 * 24 * 60 * 60 * 1000
});
ttlClampPlugin.settings.ui.translationCacheTtlHours = 3;
assert.equal(ttlClampPlugin.clampTranslationCacheExpiryToCurrentTtl(ttlClampNow), true);
assert.ok(ttlClampPlugin.translationCacheMeta.get("ttl-clamp").expiresAt <= ttlClampNow + 2 * 60 * 60 * 1000);

const cacheLookupMemoPlugin = new Plugin();
const cacheLookupMemoContext = { translationCacheLookupByKey: new Map() };
assert.equal(cacheLookupMemoPlugin.getTranslationCacheValueCached("memo-missing", [], cacheLookupMemoContext), null);
assert.equal(cacheLookupMemoPlugin.getTranslationCacheValueCached("memo-missing", [], cacheLookupMemoContext), null);
assert.equal(cacheLookupMemoPlugin.translationCacheStats.misses, 1);
cacheLookupMemoPlugin.setTranslationCache("memo-missing", "memo translation");
cacheLookupMemoPlugin.clearScanTranslationCacheLookup(cacheLookupMemoContext);
assert.equal(cacheLookupMemoPlugin.getTranslationCacheValueCached("memo-missing", [], cacheLookupMemoContext), "memo translation");
assert.equal(cacheLookupMemoPlugin.translationCacheStats.hits, 1);
clearTimeout(cacheLookupMemoPlugin.translationCacheDirtyTimer);
cacheLookupMemoPlugin.translationCacheDirtyTimer = null;

const cacheNegativeMemoPlugin = new Plugin();
assert.equal(cacheNegativeMemoPlugin.getTranslationCacheValueCached("negative-missing", [], { translationCacheLookupByKey: new Map() }), null);
assert.equal(cacheNegativeMemoPlugin.getTranslationCacheValueCached("negative-missing", [], { translationCacheLookupByKey: new Map() }), null);
assert.equal(cacheNegativeMemoPlugin.translationCacheStats.misses, 1);
cacheNegativeMemoPlugin.setTranslationCache("negative-missing", "negative memo translation");
assert.equal(cacheNegativeMemoPlugin.getTranslationCacheValueCached("negative-missing", [], { translationCacheLookupByKey: new Map() }), "negative memo translation");
assert.equal(cacheNegativeMemoPlugin.translationCacheStats.hits, 1);
clearTimeout(cacheNegativeMemoPlugin.translationCacheDirtyTimer);
cacheNegativeMemoPlugin.translationCacheDirtyTimer = null;

const statsClearPlugin = new Plugin();
let statsClearToast = "";
statsClearPlugin.showToast = message => { statsClearToast = message; };
statsClearPlugin.setTranslationCache("stats-key", "stats translation");
statsClearPlugin.translationCacheStats = { hits: 7, misses: 3 };
statsClearPlugin.clearTranslationCacheStats();
assert.deepEqual(statsClearPlugin.translationCacheStats, { hits: 0, misses: 0 });
assert.equal(statsClearPlugin.translationCache.get("stats-key"), "stats translation");
assert.match(statsClearToast, /统计|Stats|stats/);
assert.doesNotMatch(statsClearToast, /翻译缓存已清空|Translation cache cleared/);
clearTimeout(statsClearPlugin.translationCacheDirtyTimer);
statsClearPlugin.translationCacheDirtyTimer = null;

const clearFailurePlugin = new Plugin();
let clearFailureToastType = "";
clearFailurePlugin.showToast = (message, type) => { clearFailureToastType = type; };
clearFailurePlugin.setTranslationCache("clear-failure-key", "keep me");
clearFailurePlugin.persistentTranslationCacheCount = 1;
clearTimeout(clearFailurePlugin.translationCacheDirtyTimer);
clearFailurePlugin.translationCacheDirtyTimer = null;
clearFailurePlugin.saveData = () => { throw new Error("save unavailable"); };
assert.equal(clearFailurePlugin.clearTranslationCache(), false);
assert.equal(clearFailurePlugin.translationCache.get("clear-failure-key"), "keep me");
assert.equal(clearFailurePlugin.persistentTranslationCacheCount, 1);
assert.notEqual(clearFailurePlugin.translationCacheDirtyTimer, null);
assert.equal(clearFailureToastType, "error");
clearTimeout(clearFailurePlugin.translationCacheDirtyTimer);
clearFailurePlugin.translationCacheDirtyTimer = null;

const compactCachePlugin = new Plugin();
compactCachePlugin.settings.translation.prompt = `compact prompt\n---\n${"x".repeat(160)}`;
const compactOptionsA = { mode: "auto", messageIdentity: "message:guild:channel:111111111111111111:message:aaa" };
const compactOptionsB = { mode: "auto", messageIdentity: "message:guild:channel:222222222222222222:message:bbb" };
const compactKeyA = compactCachePlugin.getTranslationCacheKey("bonjour compact", compactOptionsA);
const compactKeyB = compactCachePlugin.getTranslationCacheKey("hola compact", compactOptionsB);
const compactFullKeyA = compactCachePlugin.getFullConfigTranslationCacheKey("bonjour compact", compactOptionsA);
assert.equal(compactKeyA.includes("compact prompt"), false);
assert.equal(compactFullKeyA.includes("compact prompt"), true);
assert.equal(compactCachePlugin.getTranslationCacheAliases("bonjour compact", compactOptionsA).includes(compactFullKeyA), true);
compactCachePlugin.setTranslationCache(compactKeyA, "translation a");
compactCachePlugin.setTranslationCache(compactKeyB, "translation b");
const compactPayload = compactCachePlugin.createPersistedTranslationCachePayload();
assert.equal(compactPayload.version, 3);
assert.equal(compactPayload.entries.length, 2);
assert.equal(compactPayload.entries.every(entry => !entry.key && Array.isArray(entry.k) && Number.isInteger(entry.v)), true);
assert.equal(compactPayload.entries.some(entry => JSON.stringify(entry).includes(compactKeyA)), false);
assert.ok(compactPayload.strings.length < compactKeyA.split("\n---\n").length + compactKeyB.split("\n---\n").length);
const compactRestorePlugin = new Plugin();
compactRestorePlugin.loadData = key => key === "translationCache" ? compactPayload : null;
compactRestorePlugin.loadTranslationCache();
assert.equal(compactRestorePlugin.getTranslationCacheValue(compactKeyA), "translation a");
assert.equal(compactRestorePlugin.getTranslationCacheValue(compactKeyB), "translation b");

const valueDedupePlugin = new Plugin();
valueDedupePlugin.setTranslationCache("dedupe-value-key-a", "same cached translation");
valueDedupePlugin.setTranslationCache("dedupe-value-key-b", "same cached translation");
const valueDedupePayload = valueDedupePlugin.createPersistedTranslationCachePayload();
const valueIndexes = valueDedupePayload.entries.map(entry => entry.v);
assert.equal(valueIndexes[0], valueIndexes[1]);
const valueDedupeRestorePlugin = new Plugin();
valueDedupeRestorePlugin.loadData = key => key === "translationCache" ? valueDedupePayload : null;
valueDedupeRestorePlugin.loadTranslationCache();
assert.equal(valueDedupeRestorePlugin.getTranslationCacheValue("dedupe-value-key-a"), "same cached translation");
assert.equal(valueDedupeRestorePlugin.getTranslationCacheValue("dedupe-value-key-b"), "same cached translation");
clearTimeout(compactCachePlugin.translationCacheDirtyTimer);
compactCachePlugin.translationCacheDirtyTimer = null;
clearTimeout(compactRestorePlugin.translationCacheDirtyTimer);
compactRestorePlugin.translationCacheDirtyTimer = null;

const legacyObjectMigrationPlugin = new Plugin();
let migratedLegacyObjectPayload = null;
legacyObjectMigrationPlugin.loadData = key => key === "translationCache" ? {
    version: 1,
    ttlHours: 48,
    entries: [{
        key: "legacy-object-key",
        value: "legacy object value",
        createdAt: Date.now(),
        touchedAt: Date.now(),
        expiresAt: Date.now() + 60000
    }]
} : null;
legacyObjectMigrationPlugin.saveData = (key, value) => {
    if (key === "translationCache") migratedLegacyObjectPayload = value;
    return true;
};
legacyObjectMigrationPlugin.loadTranslationCache();
assert.equal(legacyObjectMigrationPlugin.getTranslationCacheValue("legacy-object-key"), "legacy object value");
legacyObjectMigrationPlugin.flushTranslationCache();
assert.equal(migratedLegacyObjectPayload.version, 3);
assert.equal(migratedLegacyObjectPayload.entries[0].key, undefined);
clearTimeout(legacyObjectMigrationPlugin.translationCacheDirtyTimer);
legacyObjectMigrationPlugin.translationCacheDirtyTimer = null;

const legacyArrayMigrationPlugin = new Plugin();
let migratedLegacyArrayPayload = null;
legacyArrayMigrationPlugin.loadData = key => key === "translationCache" ? [{
    key: "legacy-array-key",
    value: "legacy array value",
    createdAt: Date.now(),
    touchedAt: Date.now(),
    expiresAt: Date.now() + 60000
}] : null;
legacyArrayMigrationPlugin.saveData = (key, value) => {
    if (key === "translationCache") migratedLegacyArrayPayload = value;
    return true;
};
legacyArrayMigrationPlugin.loadTranslationCache();
assert.equal(legacyArrayMigrationPlugin.getTranslationCacheValue("legacy-array-key"), "legacy array value");
legacyArrayMigrationPlugin.flushTranslationCache();
assert.equal(migratedLegacyArrayPayload.version, 3);
assert.equal(migratedLegacyArrayPayload.entries[0].key, undefined);
clearTimeout(legacyArrayMigrationPlugin.translationCacheDirtyTimer);
legacyArrayMigrationPlugin.translationCacheDirtyTimer = null;

const restartSeedPlugin = new Plugin();
let restartSavedPayload = null;
restartSeedPlugin.saveData = (key, value) => {
    if (key === "translationCache") restartSavedPayload = value;
    return true;
};
restartSeedPlugin.getMessageIdentity = message => `message:restart:${message.id}`;
const restartMessage = { id: "111", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const restartOptions = restartSeedPlugin.withMessageIdentity(restartSeedPlugin.getAutoTranslationOptions(), restartMessage, restartMessage.content, "bonjour");
const restartKey = restartSeedPlugin.getTranslationCacheKey("bonjour", restartOptions);
restartSeedPlugin.setTranslationCache(restartKey, "\u4f60\u597d");
restartSeedPlugin.flushTranslationCache();
assert.equal(restartSavedPayload.entries.length, 1);

const restartRestorePlugin = new Plugin();
const restartRendered = [];
let restartDrainCount = 0;
restartRestorePlugin.loadData = key => key === "translationCache" ? restartSavedPayload : null;
restartRestorePlugin.settings.translation.enabled = true;
restartRestorePlugin.settings.ui.autoTranslateMessages = true;
restartRestorePlugin.settings.translation.apiKey = "sk-test";
restartRestorePlugin.settings.translation.targetLanguage = "Chinese";
restartRestorePlugin.getMessageIdentity = message => `message:restart:${message.id}`;
restartRestorePlugin.isElementVisibleInViewport = () => true;
restartRestorePlugin.getMessageContentElement = message => message.content;
restartRestorePlugin.getCachedElementText = content => content.text;
restartRestorePlugin.getElementText = content => content.text;
restartRestorePlugin.shouldAutoTranslateText = text => text === "bonjour" || text === "hola changed";
restartRestorePlugin.hasCurrentTranslationLine = () => false;
restartRestorePlugin.renderTranslation = (messageNode, content, translated, cacheKey) => restartRendered.push({ messageNode, content, translated, cacheKey });
restartRestorePlugin.drainAutoTranslationQueue = () => { restartDrainCount++; };
restartRestorePlugin.loadTranslationCache();
restartRestorePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [restartMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(restartRestorePlugin.autoTranslationQueue.length, 0);
assert.equal(restartDrainCount, 1);
assert.equal(restartRendered.length, 1);
assert.equal(restartRendered[0].translated, "\u4f60\u597d");
assert.equal(restartRendered[0].cacheKey, restartKey);
clearTimeout(restartRestorePlugin.translationCacheDirtyTimer);
restartRestorePlugin.translationCacheDirtyTimer = null;

const restartChangedMessage = { id: "111", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola changed" } };
restartRestorePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [restartChangedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(restartRestorePlugin.autoTranslationQueue.length, 1);
assert.equal(restartRestorePlugin.autoTranslationQueue[0].text, "hola changed");

const legacyKeyMigrationPlugin = new Plugin();
const migrationOptions = { mode: "manual" };
const migrationPrimaryKey = legacyKeyMigrationPlugin.getTranslationCacheKey("bonjour", migrationOptions);
const migrationLegacyKey = legacyKeyMigrationPlugin.getLegacyTranslationCacheKey("bonjour", migrationOptions);
legacyKeyMigrationPlugin.setTranslationCache(migrationLegacyKey, "legacy cached translation");
legacyKeyMigrationPlugin.translationCache.delete(migrationPrimaryKey);
legacyKeyMigrationPlugin.translationCacheMeta.delete(migrationPrimaryKey);
assert.equal(
    legacyKeyMigrationPlugin.getTranslationCacheValue(migrationPrimaryKey, legacyKeyMigrationPlugin.getTranslationCacheAliases("bonjour", migrationOptions)),
    "legacy cached translation"
);
assert.equal(legacyKeyMigrationPlugin.translationCache.has(migrationPrimaryKey), true);
legacyKeyMigrationPlugin.translationCacheMeta.set(migrationPrimaryKey, { createdAt: Date.now() - 10000, touchedAt: Date.now() - 10000, expiresAt: Date.now() - 1 });
legacyKeyMigrationPlugin.translationCache.delete(migrationLegacyKey);
legacyKeyMigrationPlugin.translationCache.set(migrationLegacyKey, "fresh legacy cached translation");
legacyKeyMigrationPlugin.translationCacheMeta.set(migrationLegacyKey, { createdAt: Date.now(), touchedAt: Date.now(), expiresAt: Date.now() + 60000 });
assert.equal(
    legacyKeyMigrationPlugin.getTranslationCacheValue(migrationPrimaryKey, legacyKeyMigrationPlugin.getTranslationCacheAliases("bonjour", migrationOptions)),
    "fresh legacy cached translation"
);
assert.equal(legacyKeyMigrationPlugin.translationCache.get(migrationPrimaryKey), "fresh legacy cached translation");
clearTimeout(legacyKeyMigrationPlugin.translationCacheDirtyTimer);
legacyKeyMigrationPlugin.translationCacheDirtyTimer = null;

const legacyCachePlugin = new Plugin();
const legacyCreatedAt = Date.now() - (47 * 60 * 60 * 1000);
legacyCachePlugin.loadData = key => key === "translationCache" ? {
    ttlHours: 48,
    entries: [{
        key: "legacy-key",
        value: "legacy translation",
        createdAt: legacyCreatedAt,
        touchedAt: legacyCreatedAt
    }]
} : null;
legacyCachePlugin.loadTranslationCache();
assert.equal(legacyCachePlugin.getTranslationCacheValue("legacy-key"), "legacy translation");
assert.ok(legacyCachePlugin.translationCacheMeta.get("legacy-key").expiresAt >= Date.now() + (6 * 60 * 60 * 1000) - 1000);
clearTimeout(legacyCachePlugin.translationCacheDirtyTimer);
legacyCachePlugin.translationCacheDirtyTimer = null;

const cacheSaveFailurePlugin = new Plugin();
cacheSaveFailurePlugin.saveData = () => { throw new Error("save failed"); };
cacheSaveFailurePlugin.setTranslationCache("fail-key", "fail");
const savedWarnForCacheFailure = console.warn;
console.warn = () => {};
cacheSaveFailurePlugin.flushTranslationCache();
console.warn = savedWarnForCacheFailure;
assert.equal(cacheSaveFailurePlugin.translationCacheDirty, true);
assert.notEqual(cacheSaveFailurePlugin.translationCacheDirtyTimer, null);
clearTimeout(cacheSaveFailurePlugin.translationCacheDirtyTimer);
cacheSaveFailurePlugin.translationCacheDirtyTimer = null;

const savedBdApiForCacheUnavailable = global.BdApi;
const savedWarnForCacheUnavailable = console.warn;
global.BdApi = { Data: {} };
console.warn = () => {};
const cacheUnavailablePlugin = new Plugin();
cacheUnavailablePlugin.setTranslationCache("unavailable-key", "unavailable");
cacheUnavailablePlugin.flushTranslationCache();
assert.equal(cacheUnavailablePlugin.translationCacheDirty, true);
assert.notEqual(cacheUnavailablePlugin.translationCacheDirtyTimer, null);
clearTimeout(cacheUnavailablePlugin.translationCacheDirtyTimer);
cacheUnavailablePlugin.translationCacheDirtyTimer = null;
console.warn = savedWarnForCacheUnavailable;
if (savedBdApiForCacheUnavailable === undefined) delete global.BdApi;
else global.BdApi = savedBdApiForCacheUnavailable;

const stopSettingsPersistPlugin = new Plugin();
stopSettingsPersistPlugin.showToast = () => {};
const savedDocumentForStopSettingsPersist = global.document;
const savedWindowForStopSettingsPersist = global.window;
global.document = {
    getElementById() { return null; },
    removeEventListener() {},
    querySelectorAll() { return []; }
};
global.window = { removeEventListener() {} };
let stopPersistedSettingsPayload = null;
stopSettingsPersistPlugin.saveData = (key, value) => {
    if (key === "settings") stopPersistedSettingsPayload = JSON.parse(JSON.stringify(value));
    return true;
};
stopSettingsPersistPlugin.setSetting("ui.showAutoTranslateToasts", true);
assert.equal(stopSettingsPersistPlugin.settingsDirty, true);
assert.ok(stopSettingsPersistPlugin.settingsDirtyTimer);
stopSettingsPersistPlugin.stop();
assert.equal(stopPersistedSettingsPayload.ui.showAutoTranslateToasts, true);
assert.equal(stopSettingsPersistPlugin.settingsDirty, false);
assert.equal(stopSettingsPersistPlugin.settingsDirtyTimer, null);
global.window = savedWindowForStopSettingsPersist;
global.document = savedDocumentForStopSettingsPersist;

const stopPersistFailurePlugin = new Plugin();
stopPersistFailurePlugin.showToast = () => {};
stopPersistFailurePlugin.setTranslationCache("stop-cache-key", "stop cache value");
stopPersistFailurePlugin.settings.ui.diagnosticsEnabled = true;
stopPersistFailurePlugin.logDiagnostic("stop.persist", "dirty", { count: 1 });
const savedDocumentForStopPersistFailure = global.document;
const savedWindowForStopPersistFailure = global.window;
const savedWarnForStopPersistFailure = console.warn;
global.document = {
    getElementById() { return null; },
    removeEventListener() {},
    querySelectorAll() { return []; }
};
global.window = { removeEventListener() {} };
console.warn = () => {};
stopPersistFailurePlugin.saveData = () => false;
stopPersistFailurePlugin.stop();
assert.equal(stopPersistFailurePlugin.translationCache.get("stop-cache-key"), "stop cache value");
assert.equal(stopPersistFailurePlugin.translationCacheDirty, true);
assert.ok(stopPersistFailurePlugin.diagnosticLogs.some(entry => entry.action === "stop.persist"));
assert.equal(stopPersistFailurePlugin.diagnosticLogsDirty, true);
let stopPersistedCachePayload = null;
let stopPersistedDiagnosticPayload = null;
stopPersistFailurePlugin.saveData = (key, value) => {
    if (key === "translationCache") stopPersistedCachePayload = value;
    if (key === "diagnosticLogs") stopPersistedDiagnosticPayload = value;
    return true;
};
assert.equal(stopPersistFailurePlugin.flushTranslationCache({ retryOnError: false }), true);
assert.equal(stopPersistFailurePlugin.flushDiagnosticLogs({ retryOnError: false }), true);
assert.equal(stopPersistedCachePayload.entries.length, 1);
assert.ok(stopPersistedDiagnosticPayload.logs.some(entry => entry.action === "stop.persist"));
console.warn = savedWarnForStopPersistFailure;
global.window = savedWindowForStopPersistFailure;
global.document = savedDocumentForStopPersistFailure;

const lruCachePlugin = new Plugin();
lruCachePlugin.settings.ui.translationCacheMaxEntries = 100;
for (let index = 0; index < 100; index++) {
    lruCachePlugin.setTranslationCache(`lru-${index}`, `value-${index}`);
}
assert.equal(lruCachePlugin.getTranslationCacheValue("lru-0"), "value-0");
lruCachePlugin.setTranslationCache("lru-100", "value-100");
assert.equal(lruCachePlugin.translationCache.has("lru-0"), true);
assert.equal(lruCachePlugin.translationCache.has("lru-1"), false);
assert.equal(lruCachePlugin.translationCache.size, 100);
clearTimeout(lruCachePlugin.translationCacheDirtyTimer);
lruCachePlugin.translationCacheDirtyTimer = null;

const volatileCachePlugin = new Plugin();
let volatileSavedPayload = null;
volatileCachePlugin.saveData = (key, value) => {
    if (key === "translationCache") volatileSavedPayload = value;
    return true;
};
const volatileIdentity = [
    "fallback",
    "guild",
    "channel",
    "unknown-author",
    "unknown-time",
    volatileCachePlugin.getTextFingerprint("guild/channel"),
    volatileCachePlugin.getTextFingerprint("no-dom-fingerprint"),
    volatileCachePlugin.getTextFingerprint("no-neighbor-context"),
    "message",
    volatileCachePlugin.getTextFingerprint("weak text")
].join(":");
const volatileKey = volatileCachePlugin.getTranslationCacheKey("weak text", { mode: "auto", messageIdentity: volatileIdentity });
volatileCachePlugin.setTranslationCache(volatileKey, "weak translation");
volatileCachePlugin.flushTranslationCache();
assert.equal(volatileCachePlugin.translationCache.has(volatileKey), true);
assert.equal(volatileSavedPayload.entries.length, 0);

const settlingPlugin = new Plugin();
let settlingRetryDelay = 0;
settlingPlugin.settings.translation.enabled = true;
settlingPlugin.settings.ui.autoTranslateMessages = true;
settlingPlugin.settings.translation.apiKey = "sk-test";
settlingPlugin.settings.translation.targetLanguage = "汉语";
settlingPlugin.autoTranslationViewportBusyUntil = Date.now() + 1000;
settlingPlugin.isElementVisibleInViewport = () => true;
settlingPlugin.getMessageContentElement = message => message.content;
settlingPlugin.getCachedElementText = content => content.text;
settlingPlugin.getElementText = content => content.text;
settlingPlugin.shouldAutoTranslateText = () => true;
settlingPlugin.hasCurrentTranslationLine = () => false;
settlingPlugin.scheduleAutoTranslationRetryScan = delay => { settlingRetryDelay = Math.max(settlingRetryDelay, delay); };
settlingPlugin.drainAutoTranslationQueue = () => { throw new Error("viewport settling should not start new API work"); };
settlingPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(settlingPlugin.autoTranslationQueue.length, 0);
assert.ok(settlingRetryDelay > 0);

const stableGatePlugin = new Plugin();
stableGatePlugin.settings.translation.enabled = true;
stableGatePlugin.settings.ui.autoTranslateMessages = true;
stableGatePlugin.settings.translation.apiKey = "sk-test";
stableGatePlugin.settings.ui.diagnosticsEnabled = true;
stableGatePlugin.settings.translation.targetLanguage = "汉语";
stableGatePlugin.autoTranslationViewportRequiresStableScan = true;
stableGatePlugin.getAutoTranslationViewportAnchor = () => "stable-anchor";
stableGatePlugin.isElementVisibleInViewport = () => true;
stableGatePlugin.getMessageContentElement = message => message.content;
stableGatePlugin.getCachedElementText = content => content.text;
stableGatePlugin.getElementText = content => content.text;
stableGatePlugin.getMessageIdentity = message => `message:stable-gate:${message.id}`;
stableGatePlugin.shouldAutoTranslateText = () => true;
stableGatePlugin.hasCurrentTranslationLine = () => false;
let stableGateRetryDelay = 0;
let stableGateDrainCount = 0;
stableGatePlugin.scheduleAutoTranslationRetryScan = delay => { stableGateRetryDelay = Math.max(stableGateRetryDelay, delay); };
stableGatePlugin.drainAutoTranslationQueue = () => { stableGateDrainCount++; };
const stableGateContext = {
    messageNodes: [{ id: "first", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola stable" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
};
stableGatePlugin.queueAutoTranslateVisibleMessages(stableGateContext);
assert.equal(stableGatePlugin.autoTranslationQueue.length, 0);
assert.equal(stableGatePlugin.autoTranslationViewportRequiresStableScan, true);
assert.ok(stableGateRetryDelay >= 180);
const stableGateBlockedLog = stableGatePlugin.diagnosticLogs.find(entry => entry.action === "auto.scan" && entry.status === "blocked");
assert.equal(stableGateBlockedLog.meta.viewportStabilityPending, true);
assert.equal(stableGateBlockedLog.meta.blockReason, "stability-pending");
stableGatePlugin.queueAutoTranslateVisibleMessages(stableGateContext);
assert.equal(stableGatePlugin.autoTranslationViewportRequiresStableScan, false);
assert.equal(stableGatePlugin.autoTranslationQueue.length, 1);
assert.equal(stableGateDrainCount, 1);

const terminalFailurePlugin = new Plugin();
terminalFailurePlugin.settings.translation.enabled = true;
terminalFailurePlugin.settings.ui.autoTranslateMessages = true;
terminalFailurePlugin.settings.translation.apiKey = "sk-test";
terminalFailurePlugin.settings.translation.targetLanguage = "Chinese";
terminalFailurePlugin.isElementVisibleInViewport = () => true;
terminalFailurePlugin.getMessageContentElement = message => message.content;
terminalFailurePlugin.getCachedElementText = content => content.text;
terminalFailurePlugin.getElementText = content => content.text;
terminalFailurePlugin.getMessageIdentity = () => "terminal-identity";
terminalFailurePlugin.shouldAutoTranslateText = () => true;
terminalFailurePlugin.hasCurrentTranslationLine = () => false;
let terminalDrainCount = 0;
terminalFailurePlugin.drainAutoTranslationQueue = () => { terminalDrainCount++; };
const terminalMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
const terminalOptions = terminalFailurePlugin.withMessageIdentity(terminalFailurePlugin.getAutoTranslationOptions(), terminalMessage, terminalMessage.content, "hola");
const terminalKey = terminalFailurePlugin.getTranslationCacheKey("hola", terminalOptions);
terminalFailurePlugin.autoTranslationFailures.set(terminalKey, terminalFailurePlugin.createAutoTranslationFailure(terminalKey, terminalFailurePlugin.createFinalInvalidAutoTranslationError()));
terminalFailurePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [terminalMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(terminalFailurePlugin.autoTranslationQueue.length, 0);
assert.equal(terminalDrainCount, 1);
const terminalDecision = terminalFailurePlugin.getLastAutoTranslationDecisionsSnapshot(1)[0];
assert.equal(terminalDecision.state, "terminal-failed");
terminalFailurePlugin.retryAutoTranslationTarget(terminalMessage, terminalMessage.content, "hola", null, { remove() { this.removed = true; } });
terminalFailurePlugin.retryAutoTranslationTarget(terminalMessage, terminalMessage.content, "hola", null, { remove() { this.removed = true; } });
assert.equal(terminalFailurePlugin.autoTranslationQueue.length, 1);
assert.equal(terminalFailurePlugin.autoTranslationFailures.has(terminalKey), false);

const scanReschedulePlugin = new Plugin();
const savedSetTimeoutForScanReschedule = global.setTimeout;
const savedClearTimeoutForScanReschedule = global.clearTimeout;
let scanRescheduleDelay = 0;
let scanRescheduleClearCount = 0;
global.setTimeout = (_callback, delay) => {
    scanRescheduleDelay = delay;
    return { delay };
};
global.clearTimeout = () => { scanRescheduleClearCount++; };
scanReschedulePlugin.queueScan({ delayMs: 2000 });
scanReschedulePlugin.queueScan({ delayMs: 100 });
assert.equal(scanRescheduleDelay, 100);
assert.equal(scanRescheduleClearCount, 1);
global.setTimeout = savedSetTimeoutForScanReschedule;
global.clearTimeout = savedClearTimeoutForScanReschedule;

const trailingScanPlugin = new Plugin();
const savedSetTimeoutForTrailingScan = global.setTimeout;
const savedClearTimeoutForTrailingScan = global.clearTimeout;
let trailingScanDelay = 0;
let trailingScanClearCount = 0;
global.setTimeout = (_callback, delay) => {
    trailingScanDelay = delay;
    return { delay };
};
global.clearTimeout = () => { trailingScanClearCount++; };
trailingScanPlugin.queueScan({ delayMs: 100, trailing: true });
trailingScanPlugin.queueScan({ delayMs: 900, trailing: true });
trailingScanPlugin.queueScan({ delayMs: 300, trailing: true });
assert.equal(trailingScanDelay, 900);
assert.equal(trailingScanClearCount, 1);
global.setTimeout = savedSetTimeoutForTrailingScan;
global.clearTimeout = savedClearTimeoutForTrailingScan;

const protectedScanPlugin = new Plugin();
const savedSetTimeoutForProtectedScan = global.setTimeout;
const savedClearTimeoutForProtectedScan = global.clearTimeout;
const savedDateNowForProtectedScan = Date.now;
let protectedScanDelay = 0;
let protectedScanClearCount = 0;
Date.now = () => 200000;
global.setTimeout = (_callback, delay) => {
    protectedScanDelay = delay;
    return { delay };
};
global.clearTimeout = () => { protectedScanClearCount++; };
protectedScanPlugin.queueScan({ delayMs: 900, trailing: true, protectUntil: Date.now() + 900 });
protectedScanPlugin.queueScan({ delayMs: 100 });
assert.equal(protectedScanDelay, 900);
assert.equal(protectedScanClearCount, 0);
Date.now = savedDateNowForProtectedScan;
global.setTimeout = savedSetTimeoutForProtectedScan;
global.clearTimeout = savedClearTimeoutForProtectedScan;

const mutationTrailingScanPlugin = new Plugin();
const savedSetTimeoutForMutationTrailing = global.setTimeout;
const savedClearTimeoutForMutationTrailing = global.clearTimeout;
const savedDateNowForMutationTrailing = Date.now;
let mutationTrailingDelay = 0;
let mutationTrailingClearCount = 0;
Date.now = () => 100000;
global.setTimeout = (_callback, delay) => {
    mutationTrailingDelay = delay;
    return { delay };
};
global.clearTimeout = () => { mutationTrailingClearCount++; };
mutationTrailingScanPlugin.queueScan({ delayMs: 900, trailing: true });
mutationTrailingScanPlugin.autoTranslationViewportBusyUntil = Date.now() + 600;
mutationTrailingScanPlugin.queueMutationScan();
assert.equal(mutationTrailingDelay, 900);
assert.equal(mutationTrailingClearCount, 0);
mutationTrailingScanPlugin.scanTimer = null;
mutationTrailingScanPlugin.scanDueAt = 0;
mutationTrailingScanPlugin.autoTranslationViewportBusyUntil = 0;
mutationTrailingScanPlugin.queueMutationScan();
assert.equal(mutationTrailingDelay, 150);
Date.now = savedDateNowForMutationTrailing;
global.setTimeout = savedSetTimeoutForMutationTrailing;
global.clearTimeout = savedClearTimeoutForMutationTrailing;

const dirtyMutationQueuePlugin = new Plugin();
const dirtyMutationMessage = {
    id: "chat-messages-dirty-queue",
    isConnected: true,
    nodeType: 1,
    matches: selector => String(selector || "").includes("chat-messages"),
    closest: () => null,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 100, bottom: 160, left: 10, right: 100, width: 90, height: 60 })
};
let dirtyMutationQueueOptions = null;
dirtyMutationQueuePlugin.queueScan = options => { dirtyMutationQueueOptions = options || {}; };
dirtyMutationQueuePlugin.getAutoTranslationRenderPauseRemainingMs = () => 0;
dirtyMutationQueuePlugin.getAutoTranslationViewportSettleRemainingMs = () => 0;
dirtyMutationQueuePlugin.queueMutationScan([{
    type: "childList",
    target: { nodeType: 1, isConnected: true, matches: () => false, querySelectorAll: () => [dirtyMutationMessage] },
    addedNodes: [dirtyMutationMessage],
    removedNodes: []
}]);
assert.equal(dirtyMutationQueueOptions.dirtyOnly, true);
assert.equal(dirtyMutationQueuePlugin.pendingMutationScanRoots.has(dirtyMutationMessage), true);
assert.equal(dirtyMutationQueuePlugin.consumePendingMutationScanRoots()[0], dirtyMutationMessage);

const broadMutationQueuePlugin = new Plugin();
let broadMutationDirtyOnly = true;
broadMutationQueuePlugin.queueScan = options => { broadMutationDirtyOnly = Boolean(options?.dirtyOnly); };
broadMutationQueuePlugin.getAutoTranslationRenderPauseRemainingMs = () => 0;
broadMutationQueuePlugin.getAutoTranslationViewportSettleRemainingMs = () => 0;
const broadMutationMessages = Array.from({ length: 13 }, (_, index) => ({
    id: `chat-messages-broad-${index}`,
    isConnected: true,
    nodeType: 1,
    matches: selector => String(selector || "").includes("chat-messages")
}));
broadMutationQueuePlugin.queueMutationScan([{
    type: "attributes",
    target: {
        nodeType: 1,
        isConnected: true,
        matches: selector => String(selector || "").includes("chatContent"),
        closest: () => null,
        querySelectorAll: () => broadMutationMessages
    },
    addedNodes: [],
    removedNodes: []
}]);
assert.equal(broadMutationDirtyOnly, false);
assert.equal(broadMutationQueuePlugin.pendingMutationScanRoots.size, 0);

const fastStableRetryPlugin = new Plugin();
fastStableRetryPlugin.settings.ui.autoTranslateMessages = true;
const savedSetTimeoutForFastStable = global.setTimeout;
const savedClearTimeoutForFastStable = global.clearTimeout;
let fastStableRetryDelay = 0;
global.setTimeout = (_callback, delay) => {
    fastStableRetryDelay = delay;
    return { delay };
};
global.clearTimeout = () => {};
fastStableRetryPlugin.scheduleAutoTranslationRetryScan(180, { minDelayMs: 180 });
assert.equal(fastStableRetryDelay, 280);
global.setTimeout = savedSetTimeoutForFastStable;
global.clearTimeout = savedClearTimeoutForFastStable;

const pausedScanPlugin = new Plugin();
pausedScanPlugin.settings.ui.autoTranslateMessages = true;
pausedScanPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
let pausedScanRetryDelay = 0;
let pausedScanQueuedDelay = 0;
let pausedScanContextCreated = false;
let pausedScanCacheOnly = false;
let pausedScanQuickSettingsInjected = false;
let pausedScanCacheOnlyDelay = 0;
pausedScanPlugin.scheduleAutoTranslationRetryScan = delay => { pausedScanRetryDelay = Math.max(pausedScanRetryDelay, delay); };
pausedScanPlugin.queueScan = options => { pausedScanQueuedDelay = Number(options?.delayMs || 0); };
pausedScanPlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { pausedScanCacheOnlyDelay = Math.max(pausedScanCacheOnlyDelay, Number(delay || 0)); };
pausedScanPlugin.injectQuickSettingsButtons = () => { pausedScanQuickSettingsInjected = true; };
pausedScanPlugin.createScanContext = () => {
    pausedScanContextCreated = true;
    return { messageNodes: [] };
};
pausedScanPlugin.queueAutoTranslateVisibleMessages = (_context, options) => { pausedScanCacheOnly = options?.cacheOnly === true; };
const savedDocumentForPausedScan = global.document;
global.document = { querySelectorAll: () => [], documentElement: { clientHeight: 800, clientWidth: 1200 } };
pausedScanPlugin.scanDiscordUi();
assert.equal(pausedScanQuickSettingsInjected, false);
assert.equal(pausedScanContextCreated, false);
assert.equal(pausedScanCacheOnly, false);
assert.ok(pausedScanCacheOnlyDelay > 0);
assert.ok(pausedScanRetryDelay > 0);
assert.ok(pausedScanQueuedDelay > pausedScanRetryDelay);

const pausedScanCachePlugin = new Plugin();
const pausedScanCacheRendered = [];
pausedScanCachePlugin.settings.translation.enabled = true;
pausedScanCachePlugin.settings.ui.autoTranslateMessages = true;
pausedScanCachePlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
pausedScanCachePlugin.isAutoTranslationTargetInScanRange = () => true;
pausedScanCachePlugin.isElementVisibleInViewport = () => true;
pausedScanCachePlugin.getMessageContentElement = message => message.content;
pausedScanCachePlugin.getCachedElementText = content => content.text;
pausedScanCachePlugin.getElementText = content => content.text;
pausedScanCachePlugin.getMessageIdentity = message => `message:paused-scan-cache:${message.id}`;
pausedScanCachePlugin.shouldAutoTranslateText = () => true;
pausedScanCachePlugin.hasCurrentTranslationLine = () => false;
pausedScanCachePlugin.isInvalidAutoTranslationCacheValue = () => false;
pausedScanCachePlugin.renderTranslation = (_messageNode, _content, translated) => { pausedScanCacheRendered.push(translated); };
pausedScanCachePlugin.injectQuickSettingsButtons = () => { throw new Error("paused scan should not inject quick settings"); };
pausedScanCachePlugin.drainAutoTranslationQueue = () => { throw new Error("paused cache scan should not drain API queue"); };
pausedScanCachePlugin.queueScan = () => {};
pausedScanCachePlugin.scheduleAutoTranslationRetryScan = () => {};
const pausedScanCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour paused scan cache" } };
pausedScanCachePlugin.createScanContext = () => ({
    messageNodes: [pausedScanCacheMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
const pausedScanCacheOptions = pausedScanCachePlugin.withMessageIdentity(pausedScanCachePlugin.getAutoTranslationOptions(), pausedScanCacheMessage, pausedScanCacheMessage.content, "bonjour paused scan cache");
pausedScanCachePlugin.setTranslationCache(pausedScanCachePlugin.getTranslationCacheKey("bonjour paused scan cache", pausedScanCacheOptions), "cached paused scan translation");
let pausedScanCacheDeferredDelay = 0;
pausedScanCachePlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { pausedScanCacheDeferredDelay = Math.max(pausedScanCacheDeferredDelay, Number(delay || 0)); };
pausedScanCachePlugin.scanDiscordUi();
assert.equal(pausedScanCacheRendered.length, 0);
assert.equal(pausedScanCachePlugin.autoTranslationQueue.length, 0);
assert.equal(pausedScanCachePlugin.autoTranslationRenderQueue.length, 0);
assert.ok(pausedScanCacheDeferredDelay > 0);
pausedScanCachePlugin.scheduleCacheOnlyAutoTranslationScan = Plugin.prototype.scheduleCacheOnlyAutoTranslationScan.bind(pausedScanCachePlugin);
pausedScanCachePlugin.autoTranslationRenderPausedUntil = 0;
pausedScanCachePlugin.autoTranslationViewportBusyUntil = 0;
pausedScanCachePlugin.autoTranslationJumpCooldownUntil = 0;
pausedScanCachePlugin.scheduleAutoTranslationRenderQueue = () => {};
pausedScanCachePlugin.runCacheOnlyAutoTranslationScan("test");
assert.equal(pausedScanCachePlugin.autoTranslationRenderQueue.length, 1);
clearTimeout(pausedScanCachePlugin.autoTranslationRenderTimer);
pausedScanCachePlugin.autoTranslationRenderTimer = null;
pausedScanCachePlugin.processAutoTranslationRenderQueue();
assert.deepEqual(pausedScanCacheRendered, ["cached paused scan translation"]);
clearTimeout(pausedScanCachePlugin.translationCacheDirtyTimer);
pausedScanCachePlugin.translationCacheDirtyTimer = null;
if (savedDocumentForPausedScan === undefined) delete global.document;
else global.document = savedDocumentForPausedScan;

const settingsSurfaceScanPlugin = new Plugin();
settingsSurfaceScanPlugin.isStarted = true;
settingsSurfaceScanPlugin.settings.ui.diagnosticsEnabled = true;
settingsSurfaceScanPlugin.isDiscordSettingsSurfaceOpen = () => true;
let settingsSurfaceScanReachedHeavyPath = false;
settingsSurfaceScanPlugin.trackAutoTranslationRouteChange = () => { settingsSurfaceScanReachedHeavyPath = true; };
settingsSurfaceScanPlugin.injectQuickSettingsButtons = () => { settingsSurfaceScanReachedHeavyPath = true; };
settingsSurfaceScanPlugin.createScanContext = () => {
    settingsSurfaceScanReachedHeavyPath = true;
    return { messageNodes: [] };
};
const savedDocumentForScanShortCircuitGroup = global.document;
global.document = { querySelectorAll: () => [], documentElement: { clientHeight: 800, clientWidth: 1200 } };
settingsSurfaceScanPlugin.scanDiscordUi();
assert.equal(settingsSurfaceScanReachedHeavyPath, false);
assert.ok(settingsSurfaceScanPlugin.diagnosticLogs.some(entry => entry.action === "scan.discord-ui" && entry.status === "blocked"));

const quickSettingsOpenScanPlugin = new Plugin();
quickSettingsOpenScanPlugin.isStarted = true;
quickSettingsOpenScanPlugin.settings.ui.diagnosticsEnabled = true;
quickSettingsOpenScanPlugin.isDiscordMediaViewerQuiet = () => false;
quickSettingsOpenScanPlugin.isDiscordMediaViewerOpen = () => false;
quickSettingsOpenScanPlugin.isQuickSettingsPanelOpen = () => true;
let quickSettingsOpenScanReachedHeavyPath = false;
quickSettingsOpenScanPlugin.isDiscordSettingsSurfaceOpen = () => {
    quickSettingsOpenScanReachedHeavyPath = true;
    return false;
};
quickSettingsOpenScanPlugin.trackAutoTranslationRouteChange = () => {
    quickSettingsOpenScanReachedHeavyPath = true;
    return false;
};
quickSettingsOpenScanPlugin.injectQuickSettingsButtons = () => { quickSettingsOpenScanReachedHeavyPath = true; };
quickSettingsOpenScanPlugin.createScanContext = () => {
    quickSettingsOpenScanReachedHeavyPath = true;
    return { messageNodes: [] };
};
quickSettingsOpenScanPlugin.scanDiscordUi();
assert.equal(quickSettingsOpenScanReachedHeavyPath, false);
assert.equal(quickSettingsOpenScanPlugin.quickSettingsScanDeferred, true);
assert.ok(quickSettingsOpenScanPlugin.diagnosticLogs.some(entry => entry.action === "scan.discord-ui" && entry.meta?.reason === "quick-settings-open"));

const routeChangeScanPlugin = new Plugin();
routeChangeScanPlugin.isStarted = true;
routeChangeScanPlugin.settings.ui.diagnosticsEnabled = true;
routeChangeScanPlugin.settings.ui.autoTranslateMessages = true;
routeChangeScanPlugin.isDiscordSettingsSurfaceOpen = () => false;
routeChangeScanPlugin.trackAutoTranslationRouteChange = () => true;
routeChangeScanPlugin.getAutoTranslationViewportSettleRemainingMs = () => 320;
let routeChangeQueuedDelay = 0;
let routeChangeContextCreated = false;
let routeChangeCacheOnly = false;
let routeChangeQuickSettingsInjected = false;
let routeChangeCacheOnlyDelay = 0;
routeChangeScanPlugin.queueScan = options => { routeChangeQueuedDelay = Number(options?.delayMs || 0); };
routeChangeScanPlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { routeChangeCacheOnlyDelay = Math.max(routeChangeCacheOnlyDelay, Number(delay || 0)); };
routeChangeScanPlugin.injectQuickSettingsButtons = () => { routeChangeQuickSettingsInjected = true; };
routeChangeScanPlugin.createScanContext = () => {
    routeChangeContextCreated = true;
    return { messageNodes: [] };
};
routeChangeScanPlugin.queueAutoTranslateVisibleMessages = (_context, options) => { routeChangeCacheOnly = options?.cacheOnly === true; };
routeChangeScanPlugin.scanDiscordUi();
assert.equal(routeChangeQuickSettingsInjected, false);
assert.equal(routeChangeContextCreated, false);
assert.equal(routeChangeCacheOnly, false);
assert.ok(routeChangeCacheOnlyDelay > 0);
assert.equal(routeChangeQueuedDelay, 440);
assert.ok(routeChangeScanPlugin.diagnosticLogs.some(entry => entry.action === "scan.discord-ui" && entry.status === "deferred"));

const routeChangeCachePlugin = new Plugin();
const routeChangeCacheRendered = [];
routeChangeCachePlugin.settings.translation.enabled = true;
routeChangeCachePlugin.settings.ui.autoTranslateMessages = true;
routeChangeCachePlugin.settings.translation.apiKey = "sk-test";
routeChangeCachePlugin.isDiscordSettingsSurfaceOpen = () => false;
routeChangeCachePlugin.trackAutoTranslationRouteChange = () => {
    routeChangeCachePlugin.autoTranslationViewportBusyUntil = Date.now() + 1000;
    return true;
};
routeChangeCachePlugin.isAutoTranslationTargetInScanRange = () => true;
routeChangeCachePlugin.isElementVisibleInViewport = () => true;
routeChangeCachePlugin.getMessageContentElement = message => message.content;
routeChangeCachePlugin.getCachedElementText = content => content.text;
routeChangeCachePlugin.getElementText = content => content.text;
routeChangeCachePlugin.getMessageIdentity = message => `message:route-change-cache:${message.id}`;
routeChangeCachePlugin.shouldAutoTranslateText = () => true;
routeChangeCachePlugin.hasCurrentTranslationLine = () => false;
routeChangeCachePlugin.isInvalidAutoTranslationCacheValue = () => false;
routeChangeCachePlugin.renderTranslation = (_messageNode, _content, translated) => { routeChangeCacheRendered.push(translated); };
routeChangeCachePlugin.injectQuickSettingsButtons = () => { throw new Error("route change cache scan should not inject quick settings"); };
routeChangeCachePlugin.drainAutoTranslationQueue = () => { throw new Error("route change cache scan should not drain API queue"); };
routeChangeCachePlugin.queueScan = () => {};
routeChangeCachePlugin.scheduleAutoTranslationRetryScan = () => {};
const routeChangeCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour route cache" } };
routeChangeCachePlugin.createScanContext = () => ({
    messageNodes: [routeChangeCacheMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
const routeChangeCacheOptions = routeChangeCachePlugin.withMessageIdentity(routeChangeCachePlugin.getAutoTranslationOptions(), routeChangeCacheMessage, routeChangeCacheMessage.content, "bonjour route cache");
routeChangeCachePlugin.setTranslationCache(routeChangeCachePlugin.getTranslationCacheKey("bonjour route cache", routeChangeCacheOptions), "cached route translation");
let routeChangeCacheOnlyDeferredDelay = 0;
routeChangeCachePlugin.scheduleCacheOnlyAutoTranslationScan = (_reason, delay) => { routeChangeCacheOnlyDeferredDelay = Math.max(routeChangeCacheOnlyDeferredDelay, Number(delay || 0)); };
routeChangeCachePlugin.scanDiscordUi();
assert.equal(routeChangeCacheRendered.length, 0);
assert.equal(routeChangeCachePlugin.autoTranslationQueue.length, 0);
assert.equal(routeChangeCachePlugin.autoTranslationRenderQueue.length, 0);
assert.ok(routeChangeCacheOnlyDeferredDelay > 0);
routeChangeCachePlugin.scheduleCacheOnlyAutoTranslationScan = Plugin.prototype.scheduleCacheOnlyAutoTranslationScan.bind(routeChangeCachePlugin);
routeChangeCachePlugin.autoTranslationViewportBusyUntil = 0;
routeChangeCachePlugin.autoTranslationJumpCooldownUntil = 0;
routeChangeCachePlugin.autoTranslationRenderPausedUntil = 0;
routeChangeCachePlugin.scheduleAutoTranslationRenderQueue = () => {};
routeChangeCachePlugin.runCacheOnlyAutoTranslationScan("test");
assert.equal(routeChangeCachePlugin.autoTranslationRenderQueue.length, 1);
clearTimeout(routeChangeCachePlugin.autoTranslationRenderTimer);
routeChangeCachePlugin.autoTranslationRenderTimer = null;
routeChangeCachePlugin.processAutoTranslationRenderQueue();
assert.deepEqual(routeChangeCacheRendered, ["cached route translation"]);
clearTimeout(routeChangeCachePlugin.translationCacheDirtyTimer);
routeChangeCachePlugin.translationCacheDirtyTimer = null;
if (savedDocumentForScanShortCircuitGroup === undefined) delete global.document;
else global.document = savedDocumentForScanShortCircuitGroup;

const staleRouteCacheRenderPlugin = new Plugin();
staleRouteCacheRenderPlugin.settings.translation.enabled = true;
staleRouteCacheRenderPlugin.settings.ui.autoTranslateMessages = true;
staleRouteCacheRenderPlugin.settings.translation.apiKey = "sk-test";
staleRouteCacheRenderPlugin.settings.ui.diagnosticsEnabled = true;
staleRouteCacheRenderPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
// Still scrolling, so the cached draw stays queued until after the route change below.
staleRouteCacheRenderPlugin.autoTranslationLastExternalScrollAt = Date.now();
let staleRouteCacheCurrentRoute = "guild-a:channel-old:";
staleRouteCacheRenderPlugin.getCurrentRouteKey = () => staleRouteCacheCurrentRoute;
staleRouteCacheRenderPlugin.isAutoTranslationTargetInScanRange = () => true;
staleRouteCacheRenderPlugin.isElementVisibleInViewport = () => true;
staleRouteCacheRenderPlugin.getMessageContentElement = message => message.content;
staleRouteCacheRenderPlugin.getCachedElementText = content => content.text;
staleRouteCacheRenderPlugin.getElementText = content => content.text;
staleRouteCacheRenderPlugin.getMessageIdentity = message => `message:stale-route-cache:${message.id}`;
staleRouteCacheRenderPlugin.shouldAutoTranslateText = () => true;
staleRouteCacheRenderPlugin.hasCurrentTranslationLine = () => false;
staleRouteCacheRenderPlugin.isInvalidAutoTranslationCacheValue = () => false;
staleRouteCacheRenderPlugin.renderTranslation = () => { throw new Error("stale route cache render should be skipped"); };
staleRouteCacheRenderPlugin.drainAutoTranslationQueue = () => { throw new Error("stale route cache scan should not start API work"); };
staleRouteCacheRenderPlugin.queueScan = () => {};
staleRouteCacheRenderPlugin.scheduleAutoTranslationRetryScan = () => {};
const staleRouteCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour stale route cache" } };
const staleRouteCacheOptions = staleRouteCacheRenderPlugin.withMessageIdentity(staleRouteCacheRenderPlugin.getAutoTranslationOptions(), staleRouteCacheMessage, staleRouteCacheMessage.content, "bonjour stale route cache");
staleRouteCacheRenderPlugin.setTranslationCache(staleRouteCacheRenderPlugin.getTranslationCacheKey("bonjour stale route cache", staleRouteCacheOptions), "stale route cached translation");
staleRouteCacheRenderPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [staleRouteCacheMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
}, { cacheOnly: true });
assert.equal(staleRouteCacheRenderPlugin.autoTranslationRenderQueue.length, 1);
clearTimeout(staleRouteCacheRenderPlugin.autoTranslationRenderTimer);
staleRouteCacheRenderPlugin.autoTranslationRenderTimer = null;
staleRouteCacheCurrentRoute = "guild-a:channel-new:";
staleRouteCacheRenderPlugin.autoTranslationRenderPausedUntil = 0;
staleRouteCacheRenderPlugin.autoTranslationLastExternalScrollAt = 0;
staleRouteCacheRenderPlugin.processAutoTranslationRenderQueue();
assert.ok(staleRouteCacheRenderPlugin.diagnosticLogs.some(entry => entry.meta?.reasonCode === "render-request-stale"));
clearTimeout(staleRouteCacheRenderPlugin.translationCacheDirtyTimer);
staleRouteCacheRenderPlugin.translationCacheDirtyTimer = null;

const staleProviderCacheRenderPlugin = new Plugin();
staleProviderCacheRenderPlugin.settings.translation.enabled = true;
staleProviderCacheRenderPlugin.settings.ui.autoTranslateMessages = true;
staleProviderCacheRenderPlugin.settings.translation.apiKey = "sk-old";
staleProviderCacheRenderPlugin.settings.ui.diagnosticsEnabled = true;
staleProviderCacheRenderPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
staleProviderCacheRenderPlugin.autoTranslationLastExternalScrollAt = Date.now();
staleProviderCacheRenderPlugin.getCurrentRouteKey = () => "guild-a:channel-a:";
staleProviderCacheRenderPlugin.isAutoTranslationTargetInScanRange = () => true;
staleProviderCacheRenderPlugin.isElementVisibleInViewport = () => true;
staleProviderCacheRenderPlugin.getMessageContentElement = message => message.content;
staleProviderCacheRenderPlugin.getCachedElementText = content => content.text;
staleProviderCacheRenderPlugin.getElementText = content => content.text;
staleProviderCacheRenderPlugin.getMessageIdentity = message => `message:stale-provider-cache:${message.id}`;
staleProviderCacheRenderPlugin.shouldAutoTranslateText = () => true;
staleProviderCacheRenderPlugin.hasCurrentTranslationLine = () => false;
staleProviderCacheRenderPlugin.isInvalidAutoTranslationCacheValue = () => false;
staleProviderCacheRenderPlugin.renderTranslation = () => { throw new Error("stale provider cache render should be skipped"); };
staleProviderCacheRenderPlugin.drainAutoTranslationQueue = () => { throw new Error("stale provider cache scan should not start API work"); };
staleProviderCacheRenderPlugin.queueScan = () => {};
staleProviderCacheRenderPlugin.scheduleAutoTranslationRetryScan = () => {};
const staleProviderCacheMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour stale provider cache" } };
const staleProviderCacheOptions = staleProviderCacheRenderPlugin.withMessageIdentity(staleProviderCacheRenderPlugin.getAutoTranslationOptions(), staleProviderCacheMessage, staleProviderCacheMessage.content, "bonjour stale provider cache");
staleProviderCacheRenderPlugin.setTranslationCache(staleProviderCacheRenderPlugin.getTranslationCacheKey("bonjour stale provider cache", staleProviderCacheOptions), "stale provider cached translation");
staleProviderCacheRenderPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [staleProviderCacheMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
}, { cacheOnly: true });
assert.equal(staleProviderCacheRenderPlugin.autoTranslationRenderQueue.length, 1);
clearTimeout(staleProviderCacheRenderPlugin.autoTranslationRenderTimer);
staleProviderCacheRenderPlugin.autoTranslationRenderTimer = null;
staleProviderCacheRenderPlugin.settings.translation.apiKey = "sk-new";
staleProviderCacheRenderPlugin.autoTranslationRenderPausedUntil = 0;
staleProviderCacheRenderPlugin.autoTranslationLastExternalScrollAt = 0;
staleProviderCacheRenderPlugin.processAutoTranslationRenderQueue();
assert.ok(staleProviderCacheRenderPlugin.diagnosticLogs.some(entry => entry.meta?.reasonCode === "render-request-stale"));
clearTimeout(staleProviderCacheRenderPlugin.translationCacheDirtyTimer);
staleProviderCacheRenderPlugin.translationCacheDirtyTimer = null;

const textTerminalPlugin = new Plugin();
textTerminalPlugin.settings.translation.enabled = true;
textTerminalPlugin.settings.ui.autoTranslateMessages = true;
textTerminalPlugin.settings.translation.apiKey = "sk-test";
textTerminalPlugin.settings.translation.targetLanguage = "Chinese";
textTerminalPlugin.isElementVisibleInViewport = () => true;
textTerminalPlugin.getMessageContentElement = message => message.content;
textTerminalPlugin.getCachedElementText = content => content.text;
textTerminalPlugin.getElementText = content => content.text;
textTerminalPlugin.getMessageIdentity = message => `message:text-terminal:${message.id}`;
textTerminalPlugin.shouldAutoTranslateText = () => true;
textTerminalPlugin.hasCurrentTranslationLine = () => false;
let textTerminalDrainCount = 0;
textTerminalPlugin.drainAutoTranslationQueue = () => { textTerminalDrainCount++; };
const textTerminalOptions = textTerminalPlugin.getAutoTranslationOptions();
const textTerminalFailureKey = textTerminalPlugin.getAutoTextTranslationFailureKey("same bad text", textTerminalOptions);
textTerminalPlugin.autoTranslationFailures.set(textTerminalFailureKey, textTerminalPlugin.createAutoTranslationFailure(textTerminalFailureKey, textTerminalPlugin.createFinalInvalidAutoTranslationError()));
textTerminalPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ id: "different-message", isConnected: true, content: { dataset: {}, isConnected: true, text: "same bad text" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(textTerminalPlugin.autoTranslationQueue.length, 0);
assert.equal(textTerminalDrainCount, 1);

const textTerminalPathPlugin = new Plugin();
textTerminalPathPlugin.settings.translation.enabled = true;
textTerminalPathPlugin.settings.ui.autoTranslateMessages = true;
textTerminalPathPlugin.settings.translation.apiKey = "sk-test";
textTerminalPathPlugin.settings.translation.targetLanguage = "Chinese";
textTerminalPathPlugin.isElementVisibleInViewport = () => true;
textTerminalPathPlugin.getMessageContentElement = message => message.content;
textTerminalPathPlugin.getCachedElementText = content => content.text;
textTerminalPathPlugin.getElementText = content => content.text;
textTerminalPathPlugin.getMessageIdentity = message => `message:text-path:${message.id}`;
textTerminalPathPlugin.shouldAutoTranslateText = () => true;
textTerminalPathPlugin.hasCurrentTranslationLine = () => false;
textTerminalPathPlugin.removeAutoTranslationNode = () => {};
textTerminalPathPlugin.renderAutoTranslationFailure = () => {};
textTerminalPathPlugin.drainAutoTranslationQueue = () => {};
const textTerminalPathMessage = { id: "failed-message", isConnected: true, content: { dataset: {}, isConnected: true, text: "path bad text" } };
const textTerminalPathOptions = textTerminalPathPlugin.withMessageIdentity(textTerminalPathPlugin.getAutoTranslationOptions(), textTerminalPathMessage, textTerminalPathMessage.content, "path bad text");
const textTerminalPathKey = textTerminalPathPlugin.getTranslationCacheKey("path bad text", textTerminalPathOptions);
textTerminalPathPlugin.markAutoTranslationFailure({
    messageNode: textTerminalPathMessage,
    content: textTerminalPathMessage.content,
    text: "path bad text",
    cacheKey: textTerminalPathKey,
    requestOptions: textTerminalPathOptions
}, textTerminalPathPlugin.createFinalInvalidAutoTranslationError());
textTerminalPathPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ id: "different-failed-message", isConnected: true, content: { dataset: {}, isConnected: true, text: "path bad text" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(textTerminalPathPlugin.autoTranslationQueue.length, 1);
clearTimeout(textTerminalPathPlugin.autoTranslationRetryTimer);
textTerminalPathPlugin.autoTranslationRetryTimer = null;

const textFailureTargetIsolationPlugin = new Plugin();
textFailureTargetIsolationPlugin.settings.translation.enabled = true;
textFailureTargetIsolationPlugin.settings.ui.autoTranslateMessages = true;
textFailureTargetIsolationPlugin.settings.translation.apiKey = "sk-test";
textFailureTargetIsolationPlugin.settings.translation.targetLanguage = "Chinese";
textFailureTargetIsolationPlugin.isElementVisibleInViewport = () => true;
textFailureTargetIsolationPlugin.getMessageContentElement = message => message.content;
textFailureTargetIsolationPlugin.getCachedElementText = content => content.text;
textFailureTargetIsolationPlugin.getElementText = content => content.text;
textFailureTargetIsolationPlugin.getMessageIdentity = message => `message:text-target:${message.id}`;
textFailureTargetIsolationPlugin.shouldAutoTranslateText = () => true;
textFailureTargetIsolationPlugin.hasCurrentTranslationLine = () => false;
textFailureTargetIsolationPlugin.drainAutoTranslationQueue = () => {};
const textFailureChineseOptions = textFailureTargetIsolationPlugin.getAutoTranslationOptions();
const textFailureChineseKey = textFailureTargetIsolationPlugin.getAutoTextTranslationFailureKey("same target text", textFailureChineseOptions);
textFailureTargetIsolationPlugin.autoTranslationFailures.set(textFailureChineseKey, textFailureTargetIsolationPlugin.createAutoTranslationFailure(textFailureChineseKey, textFailureTargetIsolationPlugin.createFinalInvalidAutoTranslationError()));
textFailureTargetIsolationPlugin.settings.translation.targetLanguage = "English";
textFailureTargetIsolationPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ id: "english-target", isConnected: true, content: { dataset: {}, isConnected: true, text: "same target text" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(textFailureTargetIsolationPlugin.autoTranslationQueue.length, 1);

const textSuccessCachePlugin = new Plugin();
textSuccessCachePlugin.settings.translation.enabled = true;
textSuccessCachePlugin.settings.ui.autoTranslateMessages = true;
textSuccessCachePlugin.settings.translation.apiKey = "sk-test";
textSuccessCachePlugin.settings.translation.targetLanguage = "Chinese";
textSuccessCachePlugin.isElementVisibleInViewport = () => true;
textSuccessCachePlugin.getMessageContentElement = message => message.content;
textSuccessCachePlugin.getCachedElementText = content => content.text;
textSuccessCachePlugin.getElementText = content => content.text;
textSuccessCachePlugin.getMessageIdentity = message => `message:text-success:${message.id}`;
textSuccessCachePlugin.shouldAutoTranslateText = text => text === "cached success text";
textSuccessCachePlugin.hasCurrentTranslationLine = () => false;
const textSuccessRendered = [];
textSuccessCachePlugin.renderTranslation = (messageNode, content, translated) => textSuccessRendered.push({ messageNode, content, translated });
textSuccessCachePlugin.drainAutoTranslationQueue = () => {};
const textSuccessOptions = textSuccessCachePlugin.getAutoTranslationOptions();
const textSuccessFailureKey = textSuccessCachePlugin.getAutoTextTranslationFailureKey("cached success text", textSuccessOptions);
textSuccessCachePlugin.autoTranslationFailures.set(textSuccessFailureKey, textSuccessCachePlugin.createAutoTranslationFailure(textSuccessFailureKey, textSuccessCachePlugin.createFinalInvalidAutoTranslationError()));
textSuccessCachePlugin.setAutoTextTranslationCache("cached success text", textSuccessOptions, "\u5df2\u7ffb\u8bd1\u7684\u7f13\u5b58");
const textSuccessMessage = { id: "cache-hit", isConnected: true, content: { dataset: {}, isConnected: true, text: "cached success text" } };
textSuccessCachePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [textSuccessMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(textSuccessRendered.length, 1);
assert.equal(textSuccessRendered[0].translated, "\u5df2\u7ffb\u8bd1\u7684\u7f13\u5b58");
assert.equal(textSuccessCachePlugin.autoTranslationFailures.has(textSuccessFailureKey), false);
assert.equal(textSuccessCachePlugin.autoTranslationQueue.length, 0);
clearTimeout(textSuccessCachePlugin.translationCacheDirtyTimer);
textSuccessCachePlugin.translationCacheDirtyTimer = null;

const retryTextFailurePlugin = new Plugin();
retryTextFailurePlugin.settings.translation.enabled = true;
retryTextFailurePlugin.settings.ui.autoTranslateMessages = true;
retryTextFailurePlugin.settings.translation.apiKey = "sk-test";
retryTextFailurePlugin.getMessageIdentity = () => "retry-text-identity";
retryTextFailurePlugin.getElementText = content => content.text;
retryTextFailurePlugin.isReplyPreviewElement = () => false;
retryTextFailurePlugin.drainAutoTranslationQueue = () => {};
const retryTextContent = { dataset: {}, isConnected: true, text: "same bad text" };
const retryTextMessage = { isConnected: true };
const retryTextOptions = retryTextFailurePlugin.withMessageIdentity(retryTextFailurePlugin.getAutoTranslationOptions(), retryTextMessage, retryTextContent, "same bad text");
const retryTextCacheKey = retryTextFailurePlugin.getTranslationCacheKey("same bad text", retryTextOptions);
const retryTextFailureKey = retryTextFailurePlugin.getAutoTextTranslationFailureKey("same bad text", retryTextOptions);
retryTextFailurePlugin.autoTranslationFailures.set(retryTextCacheKey, retryTextFailurePlugin.createAutoTranslationFailure(retryTextCacheKey, retryTextFailurePlugin.createFinalInvalidAutoTranslationError()));
retryTextFailurePlugin.autoTranslationFailures.set(retryTextFailureKey, retryTextFailurePlugin.createAutoTranslationFailure(retryTextFailureKey, retryTextFailurePlugin.createFinalInvalidAutoTranslationError()));
retryTextFailurePlugin.retryAutoTranslationTarget(retryTextMessage, retryTextContent, "same bad text");
assert.equal(retryTextFailurePlugin.autoTranslationFailures.has(retryTextCacheKey), false);
assert.equal(retryTextFailurePlugin.autoTranslationFailures.has(retryTextFailureKey), false);
assert.equal(retryTextFailurePlugin.autoTranslationQueue.length, 1);

const routeSettlePlugin = new Plugin();
const savedWindowForRouteSettle = global.window;
const savedDocumentForRouteSettle = global.document;
global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" }, innerHeight: 800, scrollY: 0, pageYOffset: 0 };
global.document = { documentElement: { clientHeight: 800 } };
assert.equal(routeSettlePlugin.trackAutoTranslationRouteChange(), false);
global.window.location.pathname = "/channels/111111111111111111/333333333333333333";
assert.equal(routeSettlePlugin.trackAutoTranslationRouteChange(), true);
assert.equal(routeSettlePlugin.isAutoTranslationViewportSettling(), true);
assert.equal(routeSettlePlugin.isAutoTranslationJumpCoolingDown(), true);
routeSettlePlugin.settings.translation.enabled = true;
routeSettlePlugin.settings.ui.autoTranslateMessages = true;
routeSettlePlugin.settings.translation.apiKey = "sk-test";
routeSettlePlugin.settings.translation.targetLanguage = "Chinese";
routeSettlePlugin.isElementVisibleInViewport = () => true;
routeSettlePlugin.getMessageContentElement = message => message.content;
routeSettlePlugin.getCachedElementText = content => content.text;
routeSettlePlugin.getElementText = content => content.text;
routeSettlePlugin.shouldAutoTranslateText = () => true;
routeSettlePlugin.hasCurrentTranslationLine = () => false;
routeSettlePlugin.scheduleAutoTranslationRetryScan = () => {};
routeSettlePlugin.drainAutoTranslationQueue = () => { throw new Error("route settling should not drain API work"); };
routeSettlePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(routeSettlePlugin.autoTranslationQueue.length, 0);
global.window = savedWindowForRouteSettle;
global.document = savedDocumentForRouteSettle;

const permalinkRoutePlugin = new Plugin();
const savedWindowForPermalinkRoute = global.window;
const savedDocumentForPermalinkRoute = global.document;
global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" }, innerHeight: 800, scrollY: 0, pageYOffset: 0 };
global.document = { documentElement: { clientHeight: 800 } };
assert.equal(permalinkRoutePlugin.trackAutoTranslationRouteChange(), false);
global.window.location.pathname = "/channels/111111111111111111/222222222222222222/444444444444444444";
assert.equal(permalinkRoutePlugin.trackAutoTranslationRouteChange(), true);
assert.equal(permalinkRoutePlugin.isAutoTranslationJumpCoolingDown(), true);
global.window = savedWindowForPermalinkRoute;
global.document = savedDocumentForPermalinkRoute;

const routeMixedPlugin = new Plugin();
const savedWindowForRouteMixed = global.window;
const savedDocumentForRouteMixed = global.document;
let routeMixedRetryDelay = 0;
const routeMixedRendered = [];
global.window = { location: { pathname: "/channels/111111111111111111/222222222222222222" }, innerHeight: 800, scrollY: 0, pageYOffset: 0 };
global.document = { documentElement: { clientHeight: 800 }, querySelectorAll: () => [] };
assert.equal(routeMixedPlugin.trackAutoTranslationRouteChange(), false);
routeMixedPlugin.settings.translation.enabled = true;
routeMixedPlugin.settings.ui.autoTranslateMessages = true;
routeMixedPlugin.settings.translation.apiKey = "sk-test";
routeMixedPlugin.settings.translation.targetLanguage = "Chinese";
routeMixedPlugin.getMessageIdentity = message => `message:route-mixed:${message.id}`;
routeMixedPlugin.isElementVisibleInViewport = () => true;
routeMixedPlugin.getMessageContentElement = message => message.content;
routeMixedPlugin.getCachedElementText = content => content.text;
routeMixedPlugin.getElementText = content => content.text;
routeMixedPlugin.shouldAutoTranslateText = () => true;
routeMixedPlugin.hasCurrentTranslationLine = () => false;
routeMixedPlugin.scheduleAutoTranslationRetryScan = delay => { routeMixedRetryDelay = Math.max(routeMixedRetryDelay, delay); };
routeMixedPlugin.renderTranslation = (messageNode, content, translated) => routeMixedRendered.push({ messageNode, content, translated });
routeMixedPlugin.drainAutoTranslationQueue = () => { throw new Error("route mixed settling should not drain API work"); };
const routeMixedCached = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const routeMixedUncached = { id: "uncached", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } };
const routeMixedCachedOptions = routeMixedPlugin.withMessageIdentity(routeMixedPlugin.getAutoTranslationOptions(), routeMixedCached, routeMixedCached.content, "bonjour");
routeMixedPlugin.setTranslationCache(routeMixedPlugin.getTranslationCacheKey("bonjour", routeMixedCachedOptions), "\u4f60\u597d");
global.window.location.pathname = "/channels/111111111111111111/333333333333333333";
assert.equal(routeMixedPlugin.trackAutoTranslationRouteChange(), true);
routeMixedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [routeMixedUncached, routeMixedCached],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(routeMixedRendered.length, 0);
assert.equal(routeMixedPlugin.autoTranslationQueue.length, 0);
assert.ok(routeMixedRetryDelay > 0);
clearTimeout(routeMixedPlugin.translationCacheDirtyTimer);
routeMixedPlugin.translationCacheDirtyTimer = null;
global.window = savedWindowForRouteMixed;
global.document = savedDocumentForRouteMixed;

const mutationSettlePlugin = new Plugin();
const messageMutationNodes = Array.from({ length: 8 }, () => ({
    nodeType: 1,
    matches: selector => selector.includes("chat-messages"),
    querySelectorAll: () => []
}));
assert.equal(mutationSettlePlugin.hasLargeMessageMutation([{ type: "childList", addedNodes: messageMutationNodes, removedNodes: [] }]), true);
const mediaOnlyImageNode = {
    nodeType: 1,
    innerText: "",
    textContent: "",
    matches: selector => String(selector || "").includes("img"),
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
};
assert.equal(mutationSettlePlugin.isMediaOnlyMutation({
    type: "attributes",
    attributeName: "style",
    target: mediaOnlyImageNode
}), true);
assert.equal(mutationSettlePlugin.getScanRelevantMutations([{
    type: "attributes",
    attributeName: "style",
    target: mediaOnlyImageNode
}]).length, 0);
assert.equal(mutationSettlePlugin.hasLargeMessageMutation([{
    type: "childList",
    addedNodes: [mediaOnlyImageNode],
    removedNodes: []
}]), false);
const mediaViewerNode = {
    nodeType: 1,
    innerText: "",
    textContent: "",
    matches: selector => String(selector || "").includes("imageModal"),
    closest: () => null,
    querySelector: () => null
};
const savedDocumentForMediaScroll = global.document;
const savedWindowForMediaScroll = global.window;
global.document = { body: {}, documentElement: {} };
global.window = {};
assert.equal(mutationSettlePlugin.isAutoTranslationScrollEventRelevant({ type: "scroll", target: mediaViewerNode }), false);
const chatScrollProbePlugin = new Plugin();
chatScrollProbePlugin.isInsideDiscordMediaViewer = () => false;
chatScrollProbePlugin.isMediaOnlyMutationElement = () => false;
chatScrollProbePlugin.isAutoTranslationScrollEventRelevant = () => true;
chatScrollProbePlugin.isDiscordMediaViewerOpen = () => {
    throw new Error("ordinary chat scroll should not probe media viewer globally");
};
assert.equal(chatScrollProbePlugin.isDiscordMediaViewerViewportEvent({
    type: "scroll",
    target: { nodeType: 1 }
}), false);
const mediaOverlayNode = {
    nodeType: 1,
    innerText: "Open original Download",
    textContent: "Open original Download",
    matches: selector => String(selector || "").includes("[role='dialog']"),
    closest: () => null,
    querySelector: selector => String(selector || "").includes("chat-messages") ? null : (String(selector || "").includes("img") ? ({}) : null),
    querySelectorAll: selector => String(selector || "").includes("chat-messages") ? [] : []
};
assert.equal(mutationSettlePlugin.isDiscordMediaViewerElement(mediaOverlayNode), true);
assert.equal(mutationSettlePlugin.isDiscordMediaViewerMutation({
    type: "childList",
    target: global.document.body,
    addedNodes: [mediaOverlayNode],
    removedNodes: []
}), true);
assert.equal(mutationSettlePlugin.getScanRelevantMutations([{
    type: "childList",
    target: global.document.body,
    addedNodes: [mediaOverlayNode],
    removedNodes: []
}]).length, 0);
const mediaFocusPlugin = new Plugin();
mediaFocusPlugin.isStarted = true;
let mediaFocusScanCount = 0;
mediaFocusPlugin.queueScan = () => { mediaFocusScanCount++; };
global.document = {
    body: {},
    documentElement: {},
    querySelector: () => null,
    querySelectorAll: selector => String(selector || "").includes("[role='dialog']") ? [mediaOverlayNode] : []
};
mediaFocusPlugin.queueViewportScan({ type: "focus", target: global.document });
assert.equal(mediaFocusScanCount, 0);
let mediaScanQuickSettingsCount = 0;
mediaFocusPlugin.injectQuickSettingsButtons = () => { mediaScanQuickSettingsCount++; };
mediaFocusPlugin.scanDiscordUi();
assert.equal(mediaScanQuickSettingsCount, 0);
const savedSetTimeoutForMediaQuiet = global.setTimeout;
const savedClearTimeoutForMediaQuiet = global.clearTimeout;
let mediaQuietDelay = 0;
global.setTimeout = (callback, delay) => {
    mediaQuietDelay = delay;
    return "media-quiet-timer";
};
global.clearTimeout = () => {};
const mediaQuietPlugin = new Plugin();
mediaQuietPlugin.isStarted = true;
mediaQuietPlugin.mediaViewerQuietUntil = Date.now() + 500;
mediaQuietPlugin.queueScan({ delayMs: 0 });
assert.equal(mediaQuietPlugin.scanTimer, "media-quiet-timer");
assert.ok(mediaQuietDelay >= 500);
mediaQuietPlugin.scanTimer = null;
mediaQuietPlugin.scanDueAt = 0;
global.setTimeout = savedSetTimeoutForMediaQuiet;
global.clearTimeout = savedClearTimeoutForMediaQuiet;

const mediaInputQuietPlugin = new Plugin();
mediaInputQuietPlugin.isStarted = true;
mediaInputQuietPlugin.settings.ui.injectInputButton = true;
mediaInputQuietPlugin.mediaViewerQuietUntil = Date.now() + 500;
let mediaInputQuietInjected = 0;
let mediaInputQuietDelay = 0;
mediaInputQuietPlugin.injectInputButtons = () => { mediaInputQuietInjected++; };
mediaInputQuietPlugin.queueInputButtonScan = options => { mediaInputQuietDelay = Math.max(mediaInputQuietDelay, Number(options?.delayMs) || 0); };
mediaInputQuietPlugin.scanInputButtonsOnly();
assert.equal(mediaInputQuietInjected, 0);
assert.ok(mediaInputQuietDelay >= 500);

const savedSetTimeoutForMediaRender = global.setTimeout;
const savedClearTimeoutForMediaRender = global.clearTimeout;
let mediaRenderQuietDelay = 0;
global.setTimeout = (callback, delay) => {
    mediaRenderQuietDelay = delay;
    return "media-render-quiet-timer";
};
global.clearTimeout = () => {};
const mediaRenderQuietPlugin = new Plugin();
mediaRenderQuietPlugin.isStarted = true;
mediaRenderQuietPlugin.mediaViewerQuietUntil = Date.now() + 500;
let mediaRenderQuietRan = false;
mediaRenderQuietPlugin.autoTranslationRenderQueue.push({
    key: "media-render-quiet",
    target: { content: { dataset: {} } },
    run: () => { mediaRenderQuietRan = true; }
});
mediaRenderQuietPlugin.processAutoTranslationRenderQueue();
assert.equal(mediaRenderQuietRan, false);
assert.equal(mediaRenderQuietPlugin.autoTranslationRenderTimer, "media-render-quiet-timer");
assert.ok(mediaRenderQuietDelay >= 500);
mediaRenderQuietPlugin.autoTranslationRenderTimer = null;
global.setTimeout = savedSetTimeoutForMediaRender;
global.clearTimeout = savedClearTimeoutForMediaRender;
global.document = savedDocumentForMediaScroll;
global.window = savedWindowForMediaScroll;

const settlingCachedPlugin = new Plugin();
let settlingCachedRendered = false;
settlingCachedPlugin.settings.translation.enabled = true;
settlingCachedPlugin.settings.ui.autoTranslateMessages = true;
settlingCachedPlugin.settings.translation.apiKey = "sk-test";
settlingCachedPlugin.settings.translation.targetLanguage = "汉语";
settlingCachedPlugin.autoTranslationViewportBusyUntil = Date.now() + 1000;
settlingCachedPlugin.isElementVisibleInViewport = () => true;
settlingCachedPlugin.getMessageContentElement = message => message.content;
settlingCachedPlugin.getCachedElementText = content => content.text;
settlingCachedPlugin.getElementText = content => content.text;
settlingCachedPlugin.getMessageIdentity = message => `message:settling-cache:${message.id}`;
settlingCachedPlugin.shouldAutoTranslateText = () => true;
settlingCachedPlugin.hasCurrentTranslationLine = () => false;
settlingCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
settlingCachedPlugin.renderTranslation = () => { settlingCachedRendered = true; };
settlingCachedPlugin.scheduleAutoTranslationRetryScan = () => {};
settlingCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("settling should not drain API queue"); };
const settlingCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const settlingCachedOptions = settlingCachedPlugin.withMessageIdentity(settlingCachedPlugin.getAutoTranslationOptions(), settlingCachedMessage, settlingCachedMessage.content, "bonjour");
const settlingCachedKey = settlingCachedPlugin.getTranslationCacheKey("bonjour", settlingCachedOptions);
settlingCachedPlugin.setTranslationCache(settlingCachedKey, "你好");
settlingCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [settlingCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
// Cached lines need no model request: drawn during the settle window once the chat is still.
assert.equal(settlingCachedRendered, true);
assert.equal(settlingCachedPlugin.autoTranslationRenderQueue.length, 0);
clearTimeout(settlingCachedPlugin.autoTranslationRenderTimer);
settlingCachedPlugin.autoTranslationRenderTimer = null;
clearTimeout(settlingCachedPlugin.translationCacheDirtyTimer);
settlingCachedPlugin.translationCacheDirtyTimer = null;

const scrollPausedCachedPlugin = new Plugin();
let scrollPausedCachedRendered = false;
let scrollPausedRetryDelay = 0;
scrollPausedCachedPlugin.settings.translation.enabled = true;
scrollPausedCachedPlugin.settings.ui.autoTranslateMessages = true;
scrollPausedCachedPlugin.settings.translation.apiKey = "sk-test";
scrollPausedCachedPlugin.settings.translation.targetLanguage = "Chinese";
scrollPausedCachedPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
scrollPausedCachedPlugin.isElementVisibleInViewport = () => true;
scrollPausedCachedPlugin.getMessageContentElement = message => message.content;
scrollPausedCachedPlugin.getCachedElementText = content => content.text;
scrollPausedCachedPlugin.getElementText = content => content.text;
scrollPausedCachedPlugin.getMessageIdentity = message => `message:scroll-paused-cache:${message.id}`;
scrollPausedCachedPlugin.shouldAutoTranslateText = () => true;
scrollPausedCachedPlugin.hasCurrentTranslationLine = () => false;
scrollPausedCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
scrollPausedCachedPlugin.renderTranslation = () => { scrollPausedCachedRendered = true; };
scrollPausedCachedPlugin.scheduleAutoTranslationRetryScan = delay => { scrollPausedRetryDelay = Math.max(scrollPausedRetryDelay, delay); };
scrollPausedCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("scroll pause should not drain API queue"); };
const scrollPausedCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour paused" } };
const scrollPausedCachedOptions = scrollPausedCachedPlugin.withMessageIdentity(scrollPausedCachedPlugin.getAutoTranslationOptions(), scrollPausedCachedMessage, scrollPausedCachedMessage.content, "bonjour paused");
scrollPausedCachedPlugin.setTranslationCache(scrollPausedCachedPlugin.getTranslationCacheKey("bonjour paused", scrollPausedCachedOptions), "cached paused translation");
scrollPausedCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [scrollPausedCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(scrollPausedCachedRendered, true);
assert.equal(scrollPausedCachedPlugin.autoTranslationQueue.length, 0);
assert.equal(scrollPausedCachedPlugin.autoTranslationRenderQueue.length, 0);
assert.ok(scrollPausedRetryDelay > 0);
clearTimeout(scrollPausedCachedPlugin.autoTranslationRenderTimer);
scrollPausedCachedPlugin.autoTranslationRenderTimer = null;
clearTimeout(scrollPausedCachedPlugin.autoTranslationRetryTimer);
scrollPausedCachedPlugin.autoTranslationRetryTimer = null;
clearTimeout(scrollPausedCachedPlugin.translationCacheDirtyTimer);
scrollPausedCachedPlugin.translationCacheDirtyTimer = null;

const jumpCooldownCachedPlugin = new Plugin();
let jumpCooldownCachedRendered = false;
let jumpCooldownRetryDelay = 0;
jumpCooldownCachedPlugin.settings.translation.enabled = true;
jumpCooldownCachedPlugin.settings.ui.autoTranslateMessages = true;
jumpCooldownCachedPlugin.settings.translation.apiKey = "sk-test";
jumpCooldownCachedPlugin.settings.translation.targetLanguage = "Chinese";
jumpCooldownCachedPlugin.autoTranslationJumpCooldownUntil = Date.now() + 2000;
jumpCooldownCachedPlugin.isElementVisibleInViewport = () => true;
jumpCooldownCachedPlugin.getMessageContentElement = message => message.content;
jumpCooldownCachedPlugin.getCachedElementText = content => content.text;
jumpCooldownCachedPlugin.getElementText = content => content.text;
jumpCooldownCachedPlugin.getMessageIdentity = message => `message:jump-cache:${message.id}`;
jumpCooldownCachedPlugin.shouldAutoTranslateText = () => true;
jumpCooldownCachedPlugin.hasCurrentTranslationLine = () => false;
jumpCooldownCachedPlugin.isInvalidAutoTranslationCacheValue = () => false;
jumpCooldownCachedPlugin.renderTranslation = (messageNode, content, translated) => {
    jumpCooldownCachedRendered = translated === "cached jump translation";
};
jumpCooldownCachedPlugin.scheduleAutoTranslationRetryScan = delay => { jumpCooldownRetryDelay = Math.max(jumpCooldownRetryDelay, delay); };
jumpCooldownCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("jump cooldown should not drain API queue"); };
const jumpCooldownCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour jump" } };
const jumpCooldownUncachedMessage = { id: "uncached", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola jump" } };
const jumpCooldownCachedOptions = jumpCooldownCachedPlugin.withMessageIdentity(jumpCooldownCachedPlugin.getAutoTranslationOptions(), jumpCooldownCachedMessage, jumpCooldownCachedMessage.content, "bonjour jump");
jumpCooldownCachedPlugin.setTranslationCache(jumpCooldownCachedPlugin.getTranslationCacheKey("bonjour jump", jumpCooldownCachedOptions), "cached jump translation");
jumpCooldownCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [jumpCooldownUncachedMessage, jumpCooldownCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
// The jump cooldown still blocks model requests for the uncached message, but not the cached line.
assert.equal(jumpCooldownCachedRendered, true);
assert.equal(jumpCooldownCachedPlugin.autoTranslationQueue.length, 0);
assert.equal(jumpCooldownCachedPlugin.autoTranslationRenderQueue.length, 0);
assert.ok(jumpCooldownRetryDelay > 0);
clearTimeout(jumpCooldownCachedPlugin.autoTranslationRenderTimer);
jumpCooldownCachedPlugin.autoTranslationRenderTimer = null;
clearTimeout(jumpCooldownCachedPlugin.translationCacheDirtyTimer);
jumpCooldownCachedPlugin.translationCacheDirtyTimer = null;

const cooldownPlugin = new Plugin();
cooldownPlugin.settings.translation.enabled = true;
cooldownPlugin.settings.ui.autoTranslateMessages = true;
cooldownPlugin.settings.translation.apiKey = "sk-test";
cooldownPlugin.settings.translation.targetLanguage = "汉语";
cooldownPlugin.isElementVisibleInViewport = () => true;
cooldownPlugin.getMessageContentElement = message => message.content;
cooldownPlugin.getCachedElementText = content => content.text;
cooldownPlugin.getElementText = content => content.text;
cooldownPlugin.shouldAutoTranslateText = () => true;
cooldownPlugin.hasCurrentTranslationLine = () => false;
let cooldownLoadingRendered = false;
cooldownPlugin.renderPendingAutoTranslationLoading = () => { cooldownLoadingRendered = true; };
cooldownPlugin.autoTranslationProviderFailures.set(cooldownPlugin.getAutoTranslationProviderKey(cooldownPlugin.getAutoTranslationOptions()), { retryAt: Date.now() + 30000 });
cooldownPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(cooldownPlugin.autoTranslationQueue.length, 0);
assert.equal(cooldownPlugin.autoTranslationInFlight, 0);
assert.equal(cooldownLoadingRendered, false);
assert.notEqual(cooldownPlugin.autoTranslationRetryTimer, null);
clearTimeout(cooldownPlugin.autoTranslationRetryTimer);
cooldownPlugin.autoTranslationRetryTimer = null;
cooldownPlugin.autoTranslationRetryAt = 0;

const cooldownCachedPlugin = new Plugin();
let cooldownCachedRendered = false;
cooldownCachedPlugin.settings.translation.enabled = true;
cooldownCachedPlugin.settings.ui.autoTranslateMessages = true;
cooldownCachedPlugin.settings.translation.apiKey = "sk-test";
cooldownCachedPlugin.settings.translation.targetLanguage = "汉语";
cooldownCachedPlugin.isElementVisibleInViewport = () => true;
cooldownCachedPlugin.getMessageContentElement = message => message.content;
cooldownCachedPlugin.getCachedElementText = content => content.text;
cooldownCachedPlugin.getElementText = content => content.text;
cooldownCachedPlugin.shouldAutoTranslateText = text => text === "bonjour";
cooldownCachedPlugin.hasCurrentTranslationLine = () => false;
cooldownCachedPlugin.renderTranslation = () => { cooldownCachedRendered = true; };
const cooldownCachedMessage = { isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour" } };
const cooldownCachedOptions = cooldownCachedPlugin.withMessageIdentity(cooldownCachedPlugin.getAutoTranslationOptions(), cooldownCachedMessage, cooldownCachedMessage.content, "bonjour");
const cooldownCachedKey = cooldownCachedPlugin.getTranslationCacheKey("bonjour", cooldownCachedOptions);
cooldownCachedPlugin.setTranslationCache(cooldownCachedKey, "你好");
cooldownCachedPlugin.autoTranslationProviderFailures.set(cooldownCachedPlugin.getAutoTranslationProviderKey(cooldownCachedPlugin.getAutoTranslationOptions()), { retryAt: Date.now() + 30000 });
cooldownCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [cooldownCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(cooldownCachedRendered, true);
assert.equal(cooldownCachedPlugin.autoTranslationQueue.length, 0);
clearTimeout(cooldownCachedPlugin.autoTranslationRetryTimer);
cooldownCachedPlugin.autoTranslationRetryTimer = null;
cooldownCachedPlugin.autoTranslationRetryAt = 0;

const noApiCachedPlugin = new Plugin();
let noApiCachedRendered = false;
noApiCachedPlugin.settings.translation.enabled = true;
noApiCachedPlugin.settings.ui.autoTranslateMessages = true;
noApiCachedPlugin.settings.translation.apiKey = "";
noApiCachedPlugin.settings.translation.targetLanguage = "Chinese";
noApiCachedPlugin.isElementVisibleInViewport = () => true;
noApiCachedPlugin.getMessageContentElement = message => message.content;
noApiCachedPlugin.getCachedElementText = content => content.text;
noApiCachedPlugin.getElementText = content => content.text;
noApiCachedPlugin.getMessageIdentity = message => `message:no-api-cache:${message.id}`;
noApiCachedPlugin.shouldAutoTranslateText = text => text === "bonjour no api" || text === "hola no api";
noApiCachedPlugin.hasCurrentTranslationLine = () => false;
noApiCachedPlugin.renderTranslation = (messageNode, content, translated) => { noApiCachedRendered = translated === "\u65e0 API \u7f13\u5b58\u8bd1\u6587"; };
noApiCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("missing API key should not drain API queue"); };
const noApiCachedMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour no api" } };
const noApiUncachedMessage = { id: "uncached", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola no api" } };
const noApiCachedOptions = noApiCachedPlugin.withMessageIdentity(noApiCachedPlugin.getAutoTranslationOptions(), noApiCachedMessage, noApiCachedMessage.content, "bonjour no api");
noApiCachedPlugin.setTranslationCache(noApiCachedPlugin.getTranslationCacheKey("bonjour no api", noApiCachedOptions), "\u65e0 API \u7f13\u5b58\u8bd1\u6587");
noApiCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [noApiUncachedMessage, noApiCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(noApiCachedRendered, true);
assert.equal(noApiCachedPlugin.autoTranslationQueue.length, 0);
assert.equal(noApiCachedPlugin.autoTranslationRetryTimer, null);
clearTimeout(noApiCachedPlugin.translationCacheDirtyTimer);
noApiCachedPlugin.translationCacheDirtyTimer = null;

const noApiJumpCachedPlugin = new Plugin();
let noApiJumpRetryDelay = 0;
noApiJumpCachedPlugin.settings.translation.enabled = true;
noApiJumpCachedPlugin.settings.ui.autoTranslateMessages = true;
noApiJumpCachedPlugin.settings.translation.apiKey = "";
noApiJumpCachedPlugin.settings.translation.targetLanguage = "Chinese";
noApiJumpCachedPlugin.autoTranslationJumpCooldownUntil = Date.now() + 2000;
noApiJumpCachedPlugin.isElementVisibleInViewport = () => true;
noApiJumpCachedPlugin.getMessageContentElement = message => message.content;
noApiJumpCachedPlugin.getCachedElementText = content => content.text;
noApiJumpCachedPlugin.getElementText = content => content.text;
noApiJumpCachedPlugin.getMessageIdentity = message => `message:no-api-jump-cache:${message.id}`;
noApiJumpCachedPlugin.shouldAutoTranslateText = () => true;
noApiJumpCachedPlugin.hasCurrentTranslationLine = () => false;
noApiJumpCachedPlugin.renderTranslation = () => { throw new Error("jump cooldown should not render cache until layout is stable"); };
noApiJumpCachedPlugin.drainAutoTranslationQueue = () => { throw new Error("missing API key should not drain API queue during jump cooldown"); };
noApiJumpCachedPlugin.scheduleAutoTranslationRetryScan = delay => { noApiJumpRetryDelay = Math.max(noApiJumpRetryDelay, Number(delay) || 0); };
const noApiJumpMessage = { id: "cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour no api jump" } };
const noApiJumpOptions = noApiJumpCachedPlugin.withMessageIdentity(noApiJumpCachedPlugin.getAutoTranslationOptions(), noApiJumpMessage, noApiJumpMessage.content, "bonjour no api jump");
noApiJumpCachedPlugin.setTranslationCache(noApiJumpCachedPlugin.getTranslationCacheKey("bonjour no api jump", noApiJumpOptions), "cached no api jump");
noApiJumpCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [noApiJumpMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(noApiJumpCachedPlugin.autoTranslationQueue.length, 0);
assert.ok(noApiJumpRetryDelay > 0);
clearTimeout(noApiJumpCachedPlugin.translationCacheDirtyTimer);
noApiJumpCachedPlugin.translationCacheDirtyTimer = null;

const sakuraHealthGatePlugin = new Plugin();
sakuraHealthGatePlugin.settings.translation.enabled = true;
sakuraHealthGatePlugin.settings.translation.provider = "sakuraLocal";
sakuraHealthGatePlugin.settings.ui.autoTranslateMessages = true;
sakuraHealthGatePlugin.settings.translation.apiKey = "";
sakuraHealthGatePlugin.settings.translation.targetLanguage = "Chinese";
sakuraHealthGatePlugin.isElementVisibleInViewport = () => true;
sakuraHealthGatePlugin.getMessageContentElement = message => message.content;
sakuraHealthGatePlugin.getCachedElementText = content => content.text;
sakuraHealthGatePlugin.getElementText = content => content.text;
sakuraHealthGatePlugin.shouldAutoTranslateText = () => true;
sakuraHealthGatePlugin.hasCurrentTranslationLine = () => false;
let sakuraHealthProbeStarted = "";
let sakuraHealthGateDrainCount = 0;
let sakuraHealthGateLoadingRendered = false;
sakuraHealthGatePlugin.startLocalProviderHealthProbe = providerKey => { sakuraHealthProbeStarted = providerKey; };
sakuraHealthGatePlugin.drainAutoTranslationQueue = () => { sakuraHealthGateDrainCount++; };
sakuraHealthGatePlugin.renderPendingAutoTranslationLoading = () => { sakuraHealthGateLoadingRendered = true; };
sakuraHealthGatePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ id: "sakura-health", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour sakura" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(sakuraHealthGatePlugin.autoTranslationQueue.length, 1);
assert.equal(sakuraHealthGatePlugin.autoTranslationPendingTargets.size, 1);
assert.equal(sakuraHealthGateDrainCount, 0);
assert.equal(sakuraHealthGateLoadingRendered, false);
assert.equal(sakuraHealthProbeStarted, sakuraHealthGatePlugin.getAutoTranslationProviderKey(sakuraHealthGatePlugin.getAutoTranslationOptions()));
assert.notEqual(sakuraHealthGatePlugin.autoTranslationRetryTimer, null);
clearTimeout(sakuraHealthGatePlugin.autoTranslationRetryTimer);
sakuraHealthGatePlugin.autoTranslationRetryTimer = null;

const sakuraUnavailablePlugin = new Plugin();
sakuraUnavailablePlugin.settings.translation.enabled = true;
sakuraUnavailablePlugin.settings.translation.provider = "sakuraLocal";
sakuraUnavailablePlugin.settings.ui.autoTranslateMessages = true;
sakuraUnavailablePlugin.settings.translation.apiKey = "";
sakuraUnavailablePlugin.settings.translation.targetLanguage = "Chinese";
sakuraUnavailablePlugin.settings.translation.apiStatus = { state: "success", message: "" };
sakuraUnavailablePlugin.isElementVisibleInViewport = () => true;
sakuraUnavailablePlugin.getMessageContentElement = message => message.content;
sakuraUnavailablePlugin.getCachedElementText = content => content.text;
sakuraUnavailablePlugin.getElementText = content => content.text;
sakuraUnavailablePlugin.shouldAutoTranslateText = () => true;
sakuraUnavailablePlugin.hasCurrentTranslationLine = () => false;
let sakuraUnavailableLoadingRendered = false;
sakuraUnavailablePlugin.renderPendingAutoTranslationLoading = () => { sakuraUnavailableLoadingRendered = true; };
const sakuraUnavailableOptions = sakuraUnavailablePlugin.getAutoTranslationOptions();
sakuraUnavailablePlugin.autoTranslationProviderFailures.set(sakuraUnavailableOptions.providerKey, {
    type: "local-unavailable",
    retryAt: Date.now() + 60000,
    retryAfterMs: 60000
});
sakuraUnavailablePlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [{ id: "sakura-unavailable", isConnected: true, content: { dataset: {}, isConnected: true, text: "hola sakura" } }],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(sakuraUnavailablePlugin.autoTranslationQueue.length, 1);
assert.equal(sakuraUnavailablePlugin.autoTranslationPendingTargets.size, 1);
assert.equal(sakuraUnavailableLoadingRendered, false);
assert.notEqual(sakuraUnavailablePlugin.autoTranslationRetryTimer, null);
clearTimeout(sakuraUnavailablePlugin.autoTranslationRetryTimer);
sakuraUnavailablePlugin.autoTranslationRetryTimer = null;
sakuraUnavailablePlugin.autoTranslationRetryAt = 0;

const sakuraUnavailableCachedPlugin = new Plugin();
let sakuraUnavailableCachedRendered = "";
sakuraUnavailableCachedPlugin.settings.translation.enabled = true;
sakuraUnavailableCachedPlugin.settings.translation.provider = "sakuraLocal";
sakuraUnavailableCachedPlugin.settings.ui.autoTranslateMessages = true;
sakuraUnavailableCachedPlugin.settings.translation.apiKey = "";
sakuraUnavailableCachedPlugin.settings.translation.targetLanguage = "Chinese";
sakuraUnavailableCachedPlugin.settings.translation.apiStatus = { state: "success", message: "" };
sakuraUnavailableCachedPlugin.isElementVisibleInViewport = () => true;
sakuraUnavailableCachedPlugin.getMessageContentElement = message => message.content;
sakuraUnavailableCachedPlugin.getCachedElementText = content => content.text;
sakuraUnavailableCachedPlugin.getElementText = content => content.text;
sakuraUnavailableCachedPlugin.shouldAutoTranslateText = text => text === "bonjour cached sakura";
sakuraUnavailableCachedPlugin.hasCurrentTranslationLine = () => false;
sakuraUnavailableCachedPlugin.renderTranslation = (messageNode, content, translated) => { sakuraUnavailableCachedRendered = translated; };
const sakuraUnavailableCachedMessage = { id: "sakura-cached", isConnected: true, content: { dataset: {}, isConnected: true, text: "bonjour cached sakura" } };
const sakuraUnavailableCachedOptions = sakuraUnavailableCachedPlugin.withMessageIdentity(sakuraUnavailableCachedPlugin.getAutoTranslationOptions(), sakuraUnavailableCachedMessage, sakuraUnavailableCachedMessage.content, "bonjour cached sakura");
const sakuraUnavailableCachedKey = sakuraUnavailableCachedPlugin.getTranslationCacheKey("bonjour cached sakura", sakuraUnavailableCachedOptions);
sakuraUnavailableCachedPlugin.setTranslationCache(sakuraUnavailableCachedKey, "\u5df2\u7ffb\u8bd1\u7684 Sakura \u7f13\u5b58");
sakuraUnavailableCachedPlugin.autoTranslationProviderFailures.set(sakuraUnavailableCachedOptions.providerKey, {
    type: "local-unavailable",
    retryAt: Date.now() + 60000,
    retryAfterMs: 60000
});
sakuraUnavailableCachedPlugin.queueAutoTranslateVisibleMessages({
    messageNodes: [sakuraUnavailableCachedMessage],
    contentByMessage: new Map(),
    textByElement: new Map()
});
assert.equal(sakuraUnavailableCachedRendered, "\u5df2\u7ffb\u8bd1\u7684 Sakura \u7f13\u5b58");
assert.equal(sakuraUnavailableCachedPlugin.autoTranslationQueue.length, 0);
assert.equal(sakuraUnavailableCachedPlugin.autoTranslationProviderFailures.has(sakuraUnavailableCachedOptions.providerKey), true);
clearTimeout(sakuraUnavailableCachedPlugin.autoTranslationRetryTimer);
sakuraUnavailableCachedPlugin.autoTranslationRetryTimer = null;
clearTimeout(sakuraUnavailableCachedPlugin.translationCacheDirtyTimer);
sakuraUnavailableCachedPlugin.translationCacheDirtyTimer = null;

let cleanupSelector = "";
assert.equal(plugin.getElementText({
    cloneNode: () => ({
        querySelectorAll: selector => {
            cleanupSelector = selector;
            return [];
        },
        textContent: "@Alice hello"
    })
}), "@Alice hello");
assert.equal(plugin.normalizeExtractedText(" привет  \n\n есть схема  "), "привет\nесть схема");
assert.equal(cleanupSelector.includes("[role='button']"), false);
assert.equal(cleanupSelector.split(",").includes("button"), false);
assert.equal(cleanupSelector.includes("[data-slate-placeholder='true']"), true);
const directTextPlugin = new Plugin();
const directMessageRoot = {
    nodeType: 1,
    parentElement: null,
    matches: selector => String(selector || "").includes("chat-messages")
};
const directTextNode = { nodeType: 3, nodeValue: "cached message text", parentElement: null };
const directTextContent = {
    nodeType: 1,
    nodeName: "SPAN",
    tagName: "SPAN",
    isConnected: true,
    parentElement: directMessageRoot,
    childNodes: [directTextNode],
    dataset: {},
    className: "messageContent",
    getAttribute: () => "",
    matches: () => false,
    closest: selector => String(selector || "").includes("chat-messages") ? directMessageRoot : null,
    cloneNode: () => { throw new Error("direct extraction should not clone live message DOM"); }
};
directTextNode.parentElement = directTextContent;
assert.equal(directTextPlugin.getElementText(directTextContent), "cached message text");
directTextNode.nodeValue = "changed message text";
assert.equal(directTextPlugin.getElementText(directTextContent), "cached message text");
directTextPlugin.invalidateElementTextCacheForMutations([{ type: "characterData", target: directTextNode }]);
assert.equal(directTextPlugin.getElementText(directTextContent), "changed message text");
const foreignTranslationRoot = {
    nodeType: 1,
    className: "OtherTranslatorPanel",
    getAttribute: () => "",
    matches: () => false,
    cloneNode: () => { throw new Error("foreign translation root should not be cloned"); },
    textContent: "\u5df2\u7ffb\u8bd1\u7684\u5916\u90e8\u63d2\u4ef6\u6587\u672c"
};
assert.equal(plugin.getElementText(foreignTranslationRoot), "");
assert.equal(plugin.getElementRawText(foreignTranslationRoot), "");
const metadataPlugin = new Plugin();
metadataPlugin.getElementText = () => {
    throw new Error("metadata should use provided source text");
};
const metadataLine = { dataset: {} };
const metadataContent = { dataset: {} };
metadataPlugin.getMessageIdentity = () => "metadata-identity";
metadataPlugin.setTranslationLineMetadata(metadataLine, {}, metadataContent, "manual\n---\nmetadata-identity\n---\ncache", "source text");
assert.equal(metadataLine.dataset.daitCacheSig, metadataPlugin.getStrongTextFingerprint("manual\n---\nmetadata-identity\n---\ncache"));
assert.equal(metadataLine.dataset.daitSourceKey, metadataPlugin.getTextFingerprint("source text"));
assert.equal(metadataLine.dataset.daitSourceSig, metadataPlugin.getStrongTextFingerprint("source text"));
assert.equal(metadataLine.dataset.daitIdentityKey, metadataPlugin.getTextFingerprint("metadata-identity"));
assert.equal(metadataLine.dataset.daitIdentitySig, metadataPlugin.getStrongTextFingerprint("metadata-identity"));

const renderTextWrapperPlugin = new Plugin();
renderTextWrapperPlugin.settings.ui.maskTranslations = true;
const renderChildren = [];
const renderLine = {
    dataset: {},
    classList: {
        add() {},
        remove() {}
    },
    appendChild(child) {
        renderChildren.push(child);
        return child;
    },
    set textContent(value) {
        this._textContent = value;
        if (value === "") renderChildren.length = 0;
    },
    get textContent() {
        return this._textContent || "";
    }
};
renderTextWrapperPlugin.ensureTranslationNode = () => renderLine;
renderTextWrapperPlugin.setTranslationLineMetadata = () => {};
const savedDocumentForRenderWrapper = global.document;
global.document = { createElement: tag => createFakeElement(tag) };
renderTextWrapperPlugin.renderTranslation({}, {}, "wrapped translation", "cache-key", "source");
global.document = savedDocumentForRenderWrapper;
// The text span first, then the empty anchor of the hover toolbar (copy / retranslate / hide), which adds no text;
// the toolbar itself is built on the line's first pointerenter or focusin.
assert.equal(renderChildren.length, 2);
assert.equal(renderChildren[0].className, "dait-translation-text");
assert.equal(renderChildren[0].textContent, "wrapped translation");
assert.equal(renderChildren[1].className, "dait-translation-actions-anchor");
assert.equal(renderChildren[1].children.length, 0);
assert.equal(renderChildren[1].getAttribute("tabindex"), "0");

const emojiRenderPlugin = new Plugin();
const sourceEmoji = createFakeElement("img");
sourceEmoji.setAttribute("alt", ":emoji_12:");
sourceEmoji.setAttribute("src", "https://cdn.discord.test/emojis/12.webp");
sourceEmoji.closest = () => null;
sourceEmoji.cloneNode = () => {
    const clone = createFakeElement("img");
    clone.setAttribute("alt", sourceEmoji.getAttribute("alt"));
    clone.setAttribute("src", sourceEmoji.getAttribute("src"));
    return clone;
};
const emojiContent = {
    querySelectorAll: selector => selector === "img[alt]" ? [sourceEmoji] : []
};
const savedDocumentForEmojiRender = global.document;
global.document = {
    createTextNode: value => ({ nodeType: 3, textContent: String(value), parentElement: null })
};
const emojiContainer = createFakeElement("span");
assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(emojiContainer, "\u88ab\u9759\u97f3\u4e86 :emoji_12:", emojiContent), true);
assert.equal(emojiContainer.children.length, 2);
assert.equal(emojiContainer.children[0].textContent, "\u88ab\u9759\u97f3\u4e86 ");
assert.equal(emojiContainer.children[1].getAttribute("alt"), ":emoji_12:");
assert.equal(fakeElementHasClass(emojiContainer.children[1], "dait-translation-emoji"), true);

const markupEmojiContainer = createFakeElement("span");
assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(markupEmojiContainer, "\u88ab\u9759\u97f3\u4e86 <:emoji_12:123456789>", emojiContent), true);
assert.equal(markupEmojiContainer.children.length, 2);
assert.equal(markupEmojiContainer.children[1].getAttribute("alt"), ":emoji_12:");

// A second ":emoji_12:" (literal text in the message) stays text instead of vetoing the line.
const duplicateEmojiContainer = createFakeElement("span");
assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(duplicateEmojiContainer, "A :emoji_12: :emoji_12:", emojiContent), true);
assert.equal(duplicateEmojiContainer.children.filter(child => child.getAttribute?.("alt") === ":emoji_12:").length, 1);
assert.equal(duplicateEmojiContainer.children[duplicateEmojiContainer.children.length - 1].textContent, " :emoji_12:");

const uncloneableEmoji = { ...sourceEmoji, cloneNode: () => { throw new Error("clone failed"); } };
const uncloneableContent = { querySelectorAll: () => [uncloneableEmoji] };
const fallbackEmojiContainer = createFakeElement("span");
assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(fallbackEmojiContainer, "\u88ab\u9759\u97f3\u4e86 :emoji_12:", uncloneableContent), false);
assert.equal(fallbackEmojiContainer.children.length, 0);

const unrelatedEmojiContainer = createFakeElement("span");
assert.equal(emojiRenderPlugin.appendTranslationTextWithDiscordEmoji(unrelatedEmojiContainer, "keep :not_from_source:", emojiContent), false);
assert.equal(unrelatedEmojiContainer.children.length, 0);
global.document = savedDocumentForEmojiRender;

const hideOriginalPlugin = new Plugin();
hideOriginalPlugin.settings.ui.hideOriginalAfterTranslation = true;
const hideOriginalClasses = new Set();
const hideOriginalLine = {
    dataset: {},
    classList: {
        add: name => hideOriginalClasses.add(name),
        remove: (...names) => names.forEach(name => hideOriginalClasses.delete(name)),
        contains: name => hideOriginalClasses.has(name),
        toggle: (name, enabled) => enabled ? hideOriginalClasses.add(name) : hideOriginalClasses.delete(name)
    },
    appendChild(child) {
        this.child = child;
        return child;
    },
    set textContent(value) { this._textContent = value; },
    get textContent() { return this._textContent || ""; }
};
const hideOriginalStyleOps = [];
const hideOriginalContent = {
    dataset: {},
    style: {
        setProperty(name, value) { hideOriginalStyleOps.push(["set", name, value]); },
        removeProperty(name) { hideOriginalStyleOps.push(["remove", name]); }
    }
};
hideOriginalPlugin.ensureTranslationNode = () => hideOriginalLine;
hideOriginalPlugin.setTranslationLineMetadata = () => {};
hideOriginalPlugin.getElementText = () => "need upi scan\nAnyone who can do scans";
hideOriginalPlugin.isReplyPreviewElement = () => false;
const savedDocumentForHideOriginal = global.document;
global.document = { createElement: tag => createFakeElement(tag) };
hideOriginalPlugin.renderTranslation({}, hideOriginalContent, "translated", "cache-key", "need upi scan\nAnyone who can do scans");
global.document = savedDocumentForHideOriginal;
assert.equal(hideOriginalContent.dataset.daitSourceHidden, "true");
assert.equal(hideOriginalStyleOps.some(op => op[0] === "set" && op[1] === "--dait-source-mask-lines" && op[2] === "2"), true);
hideOriginalPlugin.renderTranslationLoading({}, hideOriginalContent, "cache-key", "source");
assert.equal(hideOriginalContent.dataset.daitSourceHidden, undefined);

const maskedHideOriginalPlugin = new Plugin();
maskedHideOriginalPlugin.settings.ui.hideOriginalAfterTranslation = true;
maskedHideOriginalPlugin.settings.ui.maskTranslations = true;
const maskedHideClasses = new Set();
const maskedHideLine = {
    dataset: {},
    parentElement: null,
    nextSibling: null,
    previousSibling: null,
    className: "",
    classList: {
        add: name => maskedHideClasses.add(name),
        remove: name => maskedHideClasses.delete(name),
        contains: name => maskedHideClasses.has(name),
        toggle: (name, enabled) => enabled ? maskedHideClasses.add(name) : maskedHideClasses.delete(name)
    },
    appendChild(child) { this.child = child; return child; },
    addEventListener(type, handler) { this.listener = handler; },
    remove() {},
    set textContent(value) { this._textContent = value; },
    get textContent() { return this._textContent || ""; }
};
const maskedHideContent = { dataset: {}, style: { setProperty() {}, removeProperty() {} }, parentElement: { insertBefore(node) { node.parentElement = this; } } };
const savedDocumentForMaskedHide = global.document;
let maskedHideLineCreated = false;
// The first element created is the line; the text span and toolbar get their own elements.
global.document = {
    createElement: tag => {
        if (maskedHideLineCreated) return createFakeElement(tag);
        maskedHideLineCreated = true;
        return maskedHideLine;
    }
};
maskedHideOriginalPlugin.getTranslationLine = () => null;
maskedHideOriginalPlugin.getTranslationLines = () => [];
maskedHideOriginalPlugin.isReplyPreviewElement = () => false;
maskedHideOriginalPlugin.setTranslationLineMetadata = () => {};
maskedHideOriginalPlugin.getElementText = () => "source";
maskedHideOriginalPlugin.renderTranslation({}, maskedHideContent, "translated", "cache-key", "source");
global.document = savedDocumentForMaskedHide;
assert.equal(maskedHideContent.dataset.daitSourceHidden, undefined);
maskedHideLine.listener({ preventDefault() {}, stopPropagation() {} });
assert.equal(maskedHideContent.dataset.daitSourceHidden, "true");

const maskedClickPlugin = new Plugin();
const maskedClasses = new Set();
const maskedLine = {
    dataset: {},
    parentElement: null,
    nextSibling: null,
    previousSibling: null,
    classList: {
        add: name => maskedClasses.add(name),
        remove: name => maskedClasses.delete(name),
        contains: name => maskedClasses.has(name),
        toggle: (name, enabled) => enabled ? maskedClasses.add(name) : maskedClasses.delete(name)
    },
    addEventListener(type, handler) {
        this.listenerType = type;
        this.listener = handler;
    },
    remove() {
        this.removed = true;
    }
};
const savedDocumentForMaskedClick = global.document;
global.document = {
    createElement: () => maskedLine
};
maskedClickPlugin.getTranslationLine = () => null;
maskedClickPlugin.getTranslationLines = () => [];
maskedClickPlugin.isReplyPreviewElement = () => false;
const maskedAnchor = {
    insertBefore(node) {
        node.parentElement = this;
    }
};
const maskedContent = { dataset: {}, parentElement: maskedAnchor };
const ensuredMaskedLine = maskedClickPlugin.ensureTranslationNode({ isConnected: true }, maskedContent);
global.document = savedDocumentForMaskedClick;
maskedClasses.add("dait-translation-masked");
let maskedPrevented = false;
let maskedStopped = false;
ensuredMaskedLine.listener({
    preventDefault: () => { maskedPrevented = true; },
    stopPropagation: () => { maskedStopped = true; }
});
assert.equal(ensuredMaskedLine.listenerType, "click");
assert.equal(maskedPrevented, true);
assert.equal(maskedStopped, true);
assert.equal(maskedClasses.has("dait-translation-masked"), false);
assert.equal(maskedClasses.has("dait-translation-revealed"), true);

const previewAnchorPlugin = new Plugin();
let previewCreatedTag = "";
const previewLine = {
    dataset: {},
    parentElement: null,
    nextSibling: null,
    previousSibling: null,
    className: "",
    classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
        toggle: () => {}
    },
    addEventListener(type, handler) {
        this.listenerType = type;
        this.listener = handler;
    },
    remove() {
        this.parentElement = null;
    }
};
const savedDocumentForPreviewAnchor = global.document;
global.document = {
    createElement: tag => {
        previewCreatedTag = tag;
        return previewLine;
    }
};
previewAnchorPlugin.getTranslationLine = () => null;
previewAnchorPlugin.getTranslationLines = () => [];
previewAnchorPlugin.isReplyPreviewElement = element => element?.isPreview === true;
const previewOuter = {
    inserted: [],
    insertBefore(node) {
        this.inserted.push(node);
        node.parentElement = this;
    }
};
const previewContent = {
    dataset: {},
    isPreview: true,
    parentElement: previewOuter,
    firstChild: { nodeType: 3 },
    lastChild: null,
    insertBefore(node) {
        this.insertedBefore = node;
        node.parentElement = this;
    },
    appendChild(node) {
        this.appended = node;
        node.parentElement = this;
    }
};
const ensuredPreviewLine = previewAnchorPlugin.ensureTranslationNode({ isConnected: true }, previewContent);
global.document = savedDocumentForPreviewAnchor;
assert.equal(previewCreatedTag, "span");
assert.equal(ensuredPreviewLine.parentElement, previewContent);
assert.equal(previewOuter.inserted.length, 0);
assert.equal(previewContent.insertedBefore, ensuredPreviewLine);

let removedDuplicateLine = false;
const duplicatePlugin = new Plugin();
const duplicateOwner = `${duplicatePlugin.translationOwnerPrefix}-duplicate`;
const duplicateLineA = {
    classList: { contains: name => name === "dait-translation-line" },
    dataset: { daitOwner: duplicateOwner, daitSourceKey: duplicatePlugin.getTextFingerprint("duplicate source") },
    parentElement: null,
    remove: () => {}
};
const duplicateLineB = {
    classList: { contains: name => name === "dait-translation-line" },
    dataset: { daitOwner: duplicateOwner, daitSourceKey: duplicatePlugin.getTextFingerprint("duplicate source") },
    parentElement: null,
    remove: () => { removedDuplicateLine = true; }
};
const duplicateContent = {
    dataset: { daitOwner: duplicateOwner },
    text: "duplicate source",
    classList: { contains: () => false },
    parentElement: { querySelectorAll: () => [duplicateLineA, duplicateLineB] },
    closest: selector => selector.includes("chat-messages") || selector.includes("data-list-item-id") ? ({ querySelectorAll: () => [] }) : null,
    querySelector: () => null
};
duplicateLineA.parentElement = { children: [duplicateLineA, duplicateContent] };
duplicateLineB.parentElement = { children: [duplicateLineB, duplicateContent] };
duplicatePlugin.getElementText = content => content.text || "";
assert.equal(duplicatePlugin.getTranslationLine(duplicateContent), duplicateLineA);
assert.equal(removedDuplicateLine, true);
const childLinePlugin = new Plugin();
const childOwner = `${childLinePlugin.translationOwnerPrefix}-child`;
const childLine = {
    classList: { contains: name => name === "dait-translation-line" },
    dataset: { daitOwner: childOwner, daitSourceKey: childLinePlugin.getTextFingerprint("child source") },
    parentElement: null,
    remove: () => {}
};
const childContent = {
    dataset: { daitOwner: childOwner },
    text: "child source",
    classList: { contains: () => false },
    querySelectorAll: selector => selector.includes(childOwner) ? [childLine] : [],
    parentElement: { querySelectorAll: () => [] },
    closest: selector => selector.includes("chat-messages") || selector.includes("data-list-item-id") ? ({ querySelectorAll: () => [] }) : null
};
childLine.parentElement = childContent;
childLinePlugin.getElementText = content => content.text || "";
assert.equal(childLinePlugin.getTranslationLine(childContent), childLine);
const ownerPlugin = new Plugin();
ownerPlugin.translationOwnerPrefix = "run-test";
const ownerContent = { dataset: { daitOwner: "old-run-99" } };
assert.equal(ownerPlugin.getTranslationOwnerId(ownerContent), "run-test-1");
assert.equal(ownerPlugin.getTranslationOwnerId(ownerContent), "run-test-1");
let removedStaleLine = false;
let removedOldOwnerLine = false;
const staleContent = {
    dataset: { daitOwner: "owner-stale" },
    isConnected: true,
    text: "new source",
    classList: { contains: () => false }
};
const staleLine = {
    dataset: { daitOwner: "owner-stale", daitSourceKey: plugin.getTextFingerprint("old source") },
    parentElement: { children: [] },
    classList: { contains: () => false },
    remove: () => { removedStaleLine = true; }
};
staleLine.parentElement.children = [staleLine, staleContent];
const oldOwnerLine = {
    dataset: { daitOwner: "old-owner-1", daitSourceKey: plugin.getTextFingerprint("old source") },
    classList: { contains: () => false },
    remove: () => { removedOldOwnerLine = true; }
};
const reconcilePlugin = new Plugin();
reconcilePlugin.getElementText = content => content.text;
const savedDocumentForReconcile = global.document;
global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [staleLine, oldOwnerLine] : [] };
reconcilePlugin.reconcileTranslationLines();
assert.equal(removedStaleLine, true);
assert.equal(removedOldOwnerLine, true);
global.document = savedDocumentForReconcile;

let removedRangeLine = false;
let removedOutOfRangeLine = false;
const rangeReconcilePlugin = new Plugin();
rangeReconcilePlugin.translationOwnerPrefix = "range-reconcile";
rangeReconcilePlugin.getElementText = content => content.text;
const rangeContent = {
    dataset: { daitOwner: "range-reconcile-1" },
    isConnected: true,
    text: "new visible source",
    classList: { contains: () => false }
};
const rangeLine = {
    dataset: { daitOwner: "range-reconcile-1", daitSourceKey: rangeReconcilePlugin.getTextFingerprint("old visible source") },
    parentElement: { children: [] },
    classList: { contains: () => false },
    remove: () => { removedRangeLine = true; }
};
rangeLine.parentElement.children = [rangeLine, rangeContent];
const outOfRangeContent = {
    dataset: { daitOwner: "range-reconcile-2" },
    isConnected: true,
    text: "new hidden source",
    classList: { contains: () => false }
};
const outOfRangeLine = {
    dataset: { daitOwner: "range-reconcile-2", daitSourceKey: rangeReconcilePlugin.getTextFingerprint("old hidden source") },
    parentElement: { children: [] },
    classList: { contains: () => false },
    remove: () => { removedOutOfRangeLine = true; }
};
outOfRangeLine.parentElement.children = [outOfRangeLine, outOfRangeContent];
const rangeMessageNode = {
    querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [rangeLine] : []
};
const savedDocumentForRangeReconcile = global.document;
global.document = { querySelectorAll: () => [rangeLine, outOfRangeLine] };
rangeReconcilePlugin.reconcileTranslationLines({ messageNodes: [rangeMessageNode] });
assert.equal(removedRangeLine, true);
assert.equal(removedOutOfRangeLine, false);
global.document = savedDocumentForRangeReconcile;

let removedPausedAutoLine = false;
const pausedReconcilePlugin = new Plugin();
pausedReconcilePlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
pausedReconcilePlugin.translationOwnerPrefix = "paused-reconcile";
pausedReconcilePlugin.getElementText = content => content.text;
const pausedAutoContent = {
    dataset: { daitOwner: "paused-reconcile-1" },
    isConnected: true,
    text: "new paused source",
    classList: { contains: () => false }
};
const pausedAutoLine = {
    dataset: {
        daitOwner: "paused-reconcile-1",
        daitMode: "auto",
        daitSourceKey: pausedReconcilePlugin.getTextFingerprint("old paused source")
    },
    parentElement: { children: [] },
    classList: { contains: () => false },
    remove: () => { removedPausedAutoLine = true; }
};
pausedAutoLine.parentElement.children = [pausedAutoLine, pausedAutoContent];
const savedDocumentForPausedReconcile = global.document;
global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [pausedAutoLine] : [] };
pausedReconcilePlugin.reconcileTranslationLines();
assert.equal(removedPausedAutoLine, false);
global.document = savedDocumentForPausedReconcile;

let removedIdentityMismatchLine = false;
const identityPlugin = new Plugin();
identityPlugin.translationOwnerPrefix = "identity-test";
identityPlugin.getElementText = content => content.text;
identityPlugin.getMessageIdentity = () => "current-identity";
const identityContent = {
    dataset: { daitOwner: "identity-test-1" },
    isConnected: true,
    text: "same text",
    classList: { contains: () => false }
};
const identityLine = {
    dataset: {
        daitOwner: "identity-test-1",
        daitSourceKey: identityPlugin.getTextFingerprint("same text"),
        daitIdentityKey: identityPlugin.getTextFingerprint("old-identity")
    },
    parentElement: { children: [] },
    classList: { contains: () => false },
    closest: () => ({ id: "chat-messages-1-2" }),
    remove: () => { removedIdentityMismatchLine = true; }
};
identityLine.parentElement.children = [identityLine, identityContent];
const savedDocumentForIdentityReconcile = global.document;
global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [identityLine] : [] };
identityPlugin.reconcileTranslationLines();
assert.equal(removedIdentityMismatchLine, true);
global.document = savedDocumentForIdentityReconcile;

let removedAutoTextIdentityLine = false;
const autoTextIdentityPlugin = new Plugin();
autoTextIdentityPlugin.translationOwnerPrefix = "auto-text-identity";
autoTextIdentityPlugin.getElementText = content => content.text;
autoTextIdentityPlugin.getMessageIdentity = () => "current-auto-text-identity";
const autoTextIdentityContent = {
    dataset: { daitOwner: "auto-text-identity-1" },
    isConnected: true,
    text: "same auto text",
    classList: { contains: () => false }
};
const autoTextIdentityLine = {
    dataset: {
        daitOwner: "auto-text-identity-1",
        daitMode: "auto-text",
        daitSourceKey: autoTextIdentityPlugin.getTextFingerprint("same auto text"),
        daitIdentityKey: autoTextIdentityPlugin.getTextFingerprint("old-auto-text-identity")
    },
    parentElement: { children: [] },
    classList: { contains: () => false },
    closest: () => ({ id: "chat-messages-1-2" }),
    remove: () => { removedAutoTextIdentityLine = true; }
};
autoTextIdentityLine.parentElement.children = [autoTextIdentityLine, autoTextIdentityContent];
const savedDocumentForAutoTextIdentityReconcile = global.document;
global.document = { querySelectorAll: selector => selector === ".dait-translation-line[data-dait-owner]" ? [autoTextIdentityLine] : [] };
autoTextIdentityPlugin.reconcileTranslationLines();
assert.equal(removedAutoTextIdentityLine, false);
global.document = savedDocumentForAutoTextIdentityReconcile;

const legacyLinePlugin = new Plugin();
const legacyLinePrimaryKey = legacyLinePlugin.getTranslationCacheKey("bonjour", { mode: "manual" });
const legacyLineAliasKey = legacyLinePlugin.getLegacyTranslationCacheKey("bonjour", { mode: "manual" });
const legacyLineContent = {
    dataset: { daitOwner: "owner-legacy-line" },
    text: "bonjour",
    parentElement: { querySelectorAll: () => [] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => legacyLine
};
const legacyLine = {
    classList: { contains: () => false },
    dataset: {
        daitOwner: "owner-legacy-line",
        daitCacheKey: legacyLinePlugin.getTextFingerprint(legacyLineAliasKey),
        daitMode: "manual",
        daitSourceKey: legacyLinePlugin.getTextFingerprint("bonjour")
    },
    parentElement: { children: [] },
    remove: () => { throw new Error("legacy cache line should stay current through alias"); }
};
legacyLine.parentElement.children = [legacyLine, legacyLineContent];
legacyLineContent.parentElement.querySelectorAll = () => [legacyLine];
assert.equal(legacyLinePlugin.hasCurrentTranslationLine(
    legacyLineContent,
    legacyLinePrimaryKey,
    "bonjour",
    legacyLinePlugin.getTranslationLineCacheAliases("bonjour", { mode: "manual" })
), true);

let removedPreIdentityLine = false;
const preIdentityLinePlugin = new Plugin();
const preIdentityLineOptions = {
    ...preIdentityLinePlugin.getAutoTranslationOptions(),
    messageIdentity: "message:guild:channel:555555555555555555:source"
};
const preIdentityLinePrimaryKey = preIdentityLinePlugin.getTranslationCacheKey("bonjour", preIdentityLineOptions);
const preIdentityLineAliasKey = preIdentityLinePlugin.getPreMessageIdentityTranslationCacheKey("bonjour", preIdentityLineOptions);
const preIdentityLine = {
    classList: { contains: () => false },
    dataset: {
        daitCacheKey: preIdentityLinePlugin.getTextFingerprint(preIdentityLineAliasKey),
        daitMode: "auto",
        daitSourceKey: preIdentityLinePlugin.getTextFingerprint("bonjour")
    },
    remove: () => { removedPreIdentityLine = true; }
};
const preIdentityLineContent = {
    dataset: { daitOwner: "owner-pre-identity-line" },
    text: "bonjour",
    parentElement: { querySelectorAll: () => [preIdentityLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => preIdentityLine
};
assert.equal(preIdentityLinePlugin.hasCurrentTranslationLine(
    preIdentityLineContent,
    preIdentityLinePrimaryKey,
    "bonjour",
    preIdentityLinePlugin.getTranslationLineCacheAliases("bonjour", preIdentityLineOptions)
), false);
assert.equal(removedPreIdentityLine, true);

let removedInvalidAutoLine = false;
const invalidAutoLinePlugin = new Plugin();
const invalidAutoLineOptions = invalidAutoLinePlugin.getAutoTranslationOptions();
const invalidAutoLinePrimaryKey = invalidAutoLinePlugin.getTranslationCacheKey("\u042d\u043c", invalidAutoLineOptions);
const invalidAutoLineAliases = invalidAutoLinePlugin.getTranslationLineCacheAliases("\u042d\u043c", invalidAutoLineOptions);
invalidAutoLinePlugin.setTranslationCache(invalidAutoLinePrimaryKey, promptLeakOutput);
invalidAutoLinePlugin.setAutoTextTranslationCache("\u042d\u043c", invalidAutoLineOptions, promptLeakOutput);
const invalidAutoLine = {
    classList: { contains: () => false },
    dataset: {
        daitCacheSig: invalidAutoLinePlugin.getStrongTextFingerprint(invalidAutoLinePrimaryKey),
        daitMode: "auto",
        daitSourceSig: invalidAutoLinePlugin.getStrongTextFingerprint("\u042d\u043c")
    },
    textContent: promptLeakOutput,
    querySelector: selector => selector === ".dait-translation-text" ? { textContent: promptLeakOutput } : null,
    remove: () => { removedInvalidAutoLine = true; }
};
const invalidAutoLineContent = {
    dataset: { daitOwner: "owner-invalid-auto-line" },
    text: "\u042d\u043c",
    parentElement: { querySelectorAll: () => [invalidAutoLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => invalidAutoLine
};
assert.equal(invalidAutoLinePlugin.hasCurrentTranslationLine(
    invalidAutoLineContent,
    invalidAutoLinePrimaryKey,
    "\u042d\u043c",
    invalidAutoLineAliases,
    invalidAutoLineOptions
), false);
assert.equal(removedInvalidAutoLine, true);
assert.equal(invalidAutoLinePlugin.getTranslationCacheValue(invalidAutoLinePrimaryKey), null);
assert.equal(invalidAutoLinePlugin.getAutoTextTranslationCacheValue("\u042d\u043c", invalidAutoLineOptions), null);

let removedPartialAutoLine = false;
const partialAutoLinePlugin = new Plugin();
const partialAutoLineOptions = partialAutoLinePlugin.getAutoTranslationOptions();
const partialAutoLinePrimaryKey = partialAutoLinePlugin.getTranslationCacheKey("partial source", partialAutoLineOptions);
partialAutoLinePlugin.getAutoTranslationOutputValidationResult = () => ({
    quality: "partial",
    reasonCode: "undertranslated",
    renderable: true,
    cacheable: false,
    shouldRepair: true,
    targetLanguageRatio: 0.4,
    residualSourceRatio: 0.2,
    sameAsSource: false,
    refusal: false
});
const partialAutoLine = {
    classList: { contains: name => name === "dait-translation-partial" },
    dataset: {
        daitCacheSig: partialAutoLinePlugin.getStrongTextFingerprint(partialAutoLinePrimaryKey),
        daitMode: "auto",
        daitSourceSig: partialAutoLinePlugin.getStrongTextFingerprint("partial source"),
        daitValidationQuality: "partial"
    },
    textContent: "\u90e8\u5206\u8bd1\u6587",
    querySelector: selector => selector === ".dait-translation-text" ? { textContent: "\u90e8\u5206\u8bd1\u6587" } : null,
    remove: () => { removedPartialAutoLine = true; }
};
const partialAutoLineContent = {
    dataset: { daitOwner: "owner-partial-auto-line" },
    text: "partial source",
    parentElement: { querySelectorAll: () => [partialAutoLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => partialAutoLine
};
assert.equal(partialAutoLinePlugin.hasCurrentTranslationLine(
    partialAutoLineContent,
    partialAutoLinePrimaryKey,
    "partial source",
    partialAutoLinePlugin.getTranslationLineCacheAliases("partial source", partialAutoLineOptions),
    partialAutoLineOptions
), true);
assert.equal(removedPartialAutoLine, false);
assert.equal(partialAutoLinePlugin.autoTranslationRecentRenders.size, 1);

const ownerChangedLinePlugin = new Plugin();
const ownerChangedOptions = ownerChangedLinePlugin.getAutoTranslationOptions();
const ownerChangedCacheKey = ownerChangedLinePlugin.getTranslationCacheKey("owner changed source", ownerChangedOptions);
ownerChangedLinePlugin.getElementText = content => content.text;
ownerChangedLinePlugin.getAutoTranslationOutputValidationResult = () => ({
    quality: "good",
    reasonCode: "",
    renderable: true,
    cacheable: true,
    shouldRepair: false,
    targetLanguageRatio: 1,
    residualSourceRatio: 0,
    sameAsSource: false,
    refusal: false
});
const ownerChangedParent = {
    dataset: {},
    children: [],
    querySelectorAll: () => ownerChangedParent.children,
    insertBefore(node) {
        if (!ownerChangedParent.children.includes(node)) ownerChangedParent.children.push(node);
        node.parentElement = ownerChangedParent;
    },
    appendChild(node) {
        if (!ownerChangedParent.children.includes(node)) ownerChangedParent.children.push(node);
        node.parentElement = ownerChangedParent;
    }
};
const ownerChangedLine = {
    classList: { contains: () => false },
    dataset: {
        daitOwner: "old-owner",
        daitCacheSig: ownerChangedLinePlugin.getStrongTextFingerprint(ownerChangedCacheKey),
        daitMode: "auto",
        daitSourceSig: ownerChangedLinePlugin.getStrongTextFingerprint("owner changed source")
    },
    parentElement: ownerChangedParent,
    textContent: "\u5df2\u6709\u8bd1\u6587",
    querySelector: selector => selector === ".dait-translation-text" ? { textContent: "\u5df2\u6709\u8bd1\u6587" } : null,
    remove: () => { throw new Error("metadata-matched line should be retargeted, not removed"); }
};
const ownerChangedContent = {
    dataset: { daitOwner: "new-owner" },
    text: "owner changed source",
    classList: { contains: () => false },
    parentElement: ownerChangedParent,
    querySelector: () => null,
    closest: () => null
};
ownerChangedParent.children = [ownerChangedLine, ownerChangedContent];
assert.equal(ownerChangedLinePlugin.hasCurrentTranslationLine(
    ownerChangedContent,
    ownerChangedCacheKey,
    "owner changed source",
    ownerChangedLinePlugin.getTranslationLineCacheAliases("owner changed source", ownerChangedOptions),
    ownerChangedOptions
), true);
assert.equal(ownerChangedLine.dataset.daitOwner, ownerChangedContent.dataset.daitOwner);

let removedLegacyAutoLine = false;
const removeLegacyPlugin = new Plugin();
const removeLegacyOptions = removeLegacyPlugin.getAutoTranslationOptions();
const removeLegacyPrimaryKey = removeLegacyPlugin.getTranslationCacheKey("hola", removeLegacyOptions);
const removeLegacyAliasKey = removeLegacyPlugin.getLegacyTranslationCacheKey("hola", removeLegacyOptions);
const removeLegacyLine = {
    classList: { contains: () => false },
    dataset: {
        daitCacheKey: removeLegacyPlugin.getTextFingerprint(removeLegacyAliasKey),
        daitMode: "auto",
        daitSourceKey: removeLegacyPlugin.getTextFingerprint("hola")
    },
    remove: () => { removedLegacyAutoLine = true; }
};
const removeLegacyContent = {
    dataset: { daitOwner: "owner-remove-legacy" },
    text: "hola",
    parentElement: { querySelectorAll: () => [removeLegacyLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => removeLegacyLine
};
removeLegacyPlugin.removeAutoTranslationNode({
    content: removeLegacyContent,
    text: "hola",
    requestOptions: removeLegacyOptions
}, removeLegacyPrimaryKey);
assert.equal(removedLegacyAutoLine, true);

let removedPausedCurrentLine = false;
const pausedCurrentPlugin = new Plugin();
pausedCurrentPlugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
const pausedCurrentLine = {
    classList: { contains: () => false },
    dataset: {
        daitCacheKey: pausedCurrentPlugin.getTextFingerprint("old-auto-cache"),
        daitMode: "auto",
        daitSourceKey: pausedCurrentPlugin.getTextFingerprint("old source")
    },
    remove: () => { removedPausedCurrentLine = true; }
};
const pausedCurrentContent = {
    dataset: { daitOwner: "paused-current-owner" },
    text: "new source",
    parentElement: { querySelectorAll: () => [pausedCurrentLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => pausedCurrentLine
};
assert.equal(pausedCurrentPlugin.hasCurrentTranslationLine(pausedCurrentContent, "new-auto-cache", "new source"), false);
assert.equal(removedPausedCurrentLine, true);

const sigOnlyPlugin = new Plugin();
sigOnlyPlugin.getElementText = content => content.text;
const sigOnlyLine = {
    dataset: {
        daitSourceSig: sigOnlyPlugin.getStrongTextFingerprint("sig source")
    },
    classList: { contains: () => false }
};
assert.equal(sigOnlyPlugin.isTranslationContentMatchForLine(sigOnlyLine, {
    text: "sig source",
    classList: { contains: () => false }
}), true);
assert.equal(sigOnlyPlugin.isTranslationContentMatchForLine(sigOnlyLine, {
    text: "changed source",
    classList: { contains: () => false }
}), false);

const errorLine = {
    classList: { contains: name => name === "dait-translation-error" },
    dataset: { daitCacheKey: plugin.getTextFingerprint("auto\n---\ncache"), daitMode: "manual", daitSourceKey: plugin.getTextFingerprint("source") },
    remove: () => { throw new Error("manual error line should not be removed"); }
};
const errorContent = {
    dataset: { daitOwner: "owner-error" },
    parentElement: { querySelectorAll: () => [errorLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => errorLine
};
assert.equal(plugin.hasCurrentTranslationLine(errorContent, "auto\n---\ncache", "source"), false);
plugin.removeAutoTranslationNode({ content: errorContent }, "auto\n---\ncache");
plugin.addAutoTranslationPendingTarget("auto\n---\ncache", { messageNode: {}, content: errorContent, text: "source" });
plugin.clearPendingAutoTranslationItem({ cacheKey: "auto\n---\ncache" });
const manualLoadingLine = {
    classList: { contains: name => name === "dait-translation-loading" },
    dataset: { daitCacheKey: plugin.getTextFingerprint("manual\n---\ncache"), daitMode: "manual", daitSourceKey: plugin.getTextFingerprint("source") },
    remove: () => { throw new Error("manual loading line should not be removed by auto check"); }
};
const manualLoadingContent = {
    dataset: { daitOwner: "owner-manual-loading" },
    parentElement: { querySelectorAll: () => [manualLoadingLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => manualLoadingLine
};
assert.equal(plugin.hasCurrentTranslationLine(manualLoadingContent, "auto\n---\ncache", "source"), false);
const loadingLine = {
    classList: { contains: name => name === "dait-translation-loading" },
    dataset: { daitCacheKey: plugin.getTextFingerprint("auto\n---\ncache"), daitMode: "auto", daitSourceKey: plugin.getTextFingerprint("source") },
    remove: () => { throw new Error("loading line should not be removed by current check"); }
};
const loadingContent = {
    dataset: { daitOwner: "owner-loading" },
    parentElement: { querySelectorAll: () => [loadingLine] },
    closest: () => ({ querySelectorAll: () => [] }),
    querySelector: () => loadingLine
};
assert.equal(plugin.hasCurrentTranslationLine(loadingContent, "auto\n---\ncache", "source"), false);
const staleLoadingPlugin = new Plugin();
const staleLoadingKey = "auto\n---\nstale-loading";
const staleLoadingLine = {
    classList: { contains: name => name === "dait-translation-loading" },
    dataset: {
        daitMode: "auto",
        daitLoadingAt: String(Date.now() - 10000),
        daitCacheKey: staleLoadingPlugin.getTextFingerprint(staleLoadingKey)
    }
};
assert.equal(staleLoadingPlugin.isStaleAutoTranslationLoadingLine(staleLoadingLine), true);
const activeLoadingPlugin = new Plugin();
const activeLoadingKey = "auto\n---\nactive-loading";
const activeLoadingLine = {
    classList: { contains: name => name === "dait-translation-loading" },
    dataset: {
        daitMode: "auto",
        daitLoadingAt: String(Date.now() - 10000),
        daitCacheKey: activeLoadingPlugin.getTextFingerprint(activeLoadingKey)
    }
};
activeLoadingPlugin.autoTranslationQueue.push({ cacheKey: activeLoadingKey });
activeLoadingPlugin.autoTranslationQueuedKeys.add(activeLoadingKey);
assert.equal(activeLoadingPlugin.isStaleAutoTranslationLoadingLine(activeLoadingLine), false);
const originalDocument = global.document;
const createdErrorNodes = [];
global.document = {
    createElement: tag => {
        const node = {
            tag,
            className: "",
            dataset: {},
            children: [],
            classList: {
                add: () => {},
                remove: () => {},
                contains: () => false
            },
            appendChild(child) {
                this.children.push(child);
            },
            addEventListener(type, handler) {
                this.listenerType = type;
                this.listener = handler;
            },
            set textContent(value) {
                this._textContent = value;
            },
            get textContent() {
                return this._textContent || "";
            }
        };
        createdErrorNodes.push(node);
        return node;
    }
};
const errorRenderPlugin = new Plugin();
const errorRenderLine = {
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    set textContent(value) { this._textContent = value; },
    get textContent() { return this._textContent || ""; }
};
errorRenderPlugin.ensureTranslationNode = () => errorRenderLine;
errorRenderPlugin.setTranslationLineMetadata = () => {};
const inlineError = new Error("API_ERROR");
// A server error: Retry can fix it. (Auth errors offer "Open settings" instead; see tests/core/chat-lines.test.js.)
inlineError.status = 500;
errorRenderPlugin.renderTranslationError({ isConnected: true }, { isConnected: true }, inlineError, "manual\n---\ncache", "source");
assert.equal(errorRenderLine.children.length, 2);
assert.equal(errorRenderLine.children[0].className, "dait-translation-error-message");
assert.equal(errorRenderLine.children[1].className, "dait-translation-retry");
assert.equal(errorRenderLine.children[1].listenerType, "click");

const retryOwnerPlugin = new Plugin();
let retryFallbackLookup = false;
let retriedContent = null;
const retryOwnedContent = { isConnected: true, text: "source", dataset: {} };
const retryLine = {
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    remove: () => { throw new Error("current retry line should stay"); },
    set textContent(value) { this._textContent = value; },
    get textContent() { return this._textContent || ""; }
};
retryOwnerPlugin.ensureTranslationNode = () => retryLine;
retryOwnerPlugin.setTranslationLineMetadata = (line, messageNode, content, cacheKey, sourceText) => {
    line.dataset.daitSourceKey = retryOwnerPlugin.getTextFingerprint(sourceText);
};
retryOwnerPlugin.getTranslationContentForLine = () => retryOwnedContent;
retryOwnerPlugin.getMessageContentElement = () => {
    retryFallbackLookup = true;
    return { isConnected: true, text: "wrong" };
};
retryOwnerPlugin.getElementText = content => content.text;
retryOwnerPlugin.translateMessage = (messageNode, content) => {
    retriedContent = content;
};
retryOwnerPlugin.renderTranslationError({ isConnected: true }, { isConnected: true, text: "fallback" }, inlineError, "manual\n---\ncache", "source");
retryLine.children[1].listener({ preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(retriedContent, retryOwnedContent);
assert.equal(retryFallbackLookup, false);

const autoRetryPlugin = new Plugin();
autoRetryPlugin.settings.translation.enabled = true;
autoRetryPlugin.settings.ui.autoTranslateMessages = true;
autoRetryPlugin.settings.translation.apiKey = "sk-test";
const autoRetryContent = { isConnected: true, text: "source", dataset: {} };
const autoRetryLine = {
    classList: { add: () => {}, remove: () => { autoRetryLine.removed = true; }, contains: () => false },
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    remove: () => { autoRetryLine.removed = true; },
    set textContent(value) { this._textContent = value; },
    get textContent() { return this._textContent || ""; }
};
autoRetryPlugin.ensureTranslationNode = () => autoRetryLine;
autoRetryPlugin.setTranslationLineMetadata = (line, messageNode, content, cacheKey, sourceText) => {
    line.dataset.daitSourceKey = autoRetryPlugin.getTextFingerprint(sourceText);
};
autoRetryPlugin.getTranslationContentForLine = () => autoRetryContent;
autoRetryPlugin.getElementText = content => content.text;
let autoRetryManualTarget = null;
autoRetryPlugin.translateMessage = (messageNode, content, button, textOptions) => {
    autoRetryManualTarget = { messageNode, content, button, textOptions };
};
autoRetryPlugin.retryAutoTranslationTarget = () => { throw new Error("auto retry button should use manual rescue"); };
let autoRetryDrained = false;
autoRetryPlugin.drainAutoTranslationQueue = () => { autoRetryDrained = true; };
const autoRetryCacheKey = autoRetryPlugin.getTranslationCacheKey("source", autoRetryPlugin.getAutoTranslationOptions());
autoRetryPlugin.renderTranslationError({ isConnected: true }, autoRetryContent, inlineError, autoRetryCacheKey, "source");
autoRetryLine.children[1].listener({ preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(autoRetryManualTarget.content, autoRetryContent);
assert.equal(autoRetryManualTarget.button, null);
assert.equal(autoRetryPlugin.autoTranslationQueue.length, 0);
assert.equal(autoRetryPlugin.translationCache.has(autoRetryPlugin.getTranslationCacheKey("source", { mode: "manual" })), false);
assert.equal(autoRetryDrained, false);

const staleRetryPlugin = new Plugin();
let staleRetryRemoved = false;
let staleRetryCalled = false;
const staleRetryLine = {
    classList: { add: () => {}, remove: () => {}, contains: () => false },
    dataset: {},
    children: [],
    appendChild(child) { this.children.push(child); },
    remove: () => { staleRetryRemoved = true; },
    set textContent(value) { this._textContent = value; },
    get textContent() { return this._textContent || ""; }
};
staleRetryPlugin.ensureTranslationNode = () => staleRetryLine;
staleRetryPlugin.setTranslationLineMetadata = (line, content, cacheKey, sourceText) => {
    line.dataset.daitSourceKey = staleRetryPlugin.getTextFingerprint(sourceText);
};
staleRetryPlugin.getTranslationContentForLine = () => ({ isConnected: true, text: "changed source", dataset: {} });
staleRetryPlugin.getElementText = content => content.text;
staleRetryPlugin.translateMessage = () => { staleRetryCalled = true; };
staleRetryPlugin.showToast = () => {};
staleRetryPlugin.renderTranslationError({ isConnected: true }, { isConnected: true, text: "fallback" }, inlineError, "manual\n---\ncache", "source");
staleRetryLine.children[1].listener({ preventDefault: () => {}, stopPropagation: () => {} });
assert.equal(staleRetryRemoved, true);
assert.equal(staleRetryCalled, false);
global.document = originalDocument;
assert.equal(plugin.isOwnMutation({
    type: "childList",
    target: {},
    addedNodes: [{ nodeType: 1, matches: selector => selector.includes(".dait-message-button"), querySelector: () => null }],
    removedNodes: []
}), true);
assert.equal(plugin.isOwnMutation({
    type: "childList",
    target: {},
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: selector => selector.includes(".dait-translation-line") ? ({}) : null }],
    removedNodes: []
}), false);
assert.equal(plugin.isOwnMutation({
    type: "childList",
    target: {},
    addedNodes: [{ nodeType: 1, matches: () => false, querySelector: () => null }],
    removedNodes: []
}), false);
const inputScanPlugin = new Plugin();
inputScanPlugin.settings.ui.injectInputButton = true;
inputScanPlugin.settings.ui.publicBilingualInputButton = false;
const fakeTextboxElement = {
    nodeType: 1,
    matches: selector => String(selector).includes("[data-slate-editor='true']"),
    closest: () => null,
    querySelector: () => null
};
const fakeComposerElement = {
    nodeType: 1,
    matches: selector => String(selector).includes("channelTextArea"),
    closest: () => null,
    querySelector: selector => String(selector).includes("[data-slate-editor='true']") ? fakeTextboxElement : null
};
assert.equal(inputScanPlugin.isScanRelevantElement(fakeTextboxElement), false);
assert.equal(inputScanPlugin.isScanRelevantMutationNode(fakeComposerElement), false);
assert.equal(inputScanPlugin.getInputButtonRelevantMutations([{
    type: "characterData",
    target: { nodeType: 3, parentElement: fakeTextboxElement }
}]).length, 1);
assert.equal(inputScanPlugin.getScanRelevantMutations([{
    type: "characterData",
    target: { nodeType: 3, parentElement: fakeTextboxElement }
}]).length, 0);
assert.equal(inputScanPlugin.getInputButtonRelevantMutations([{
    type: "childList",
    target: {},
    addedNodes: [fakeComposerElement],
    removedNodes: []
}]).length, 1);
assert.equal(inputScanPlugin.getScanRelevantMutations([{
    type: "childList",
    target: {},
    addedNodes: [fakeComposerElement],
    removedNodes: []
}]).length, 0);
const fakeUserPanelElement = {
    nodeType: 1,
    matches: selector => String(selector || "").includes("panels"),
    closest: selector => String(selector || "").includes("panels") ? fakeUserPanelElement : null,
    querySelector: () => null,
    querySelectorAll: () => []
};
assert.equal(inputScanPlugin.isScanRelevantElement(fakeUserPanelElement), false);
assert.equal(inputScanPlugin.getScanRelevantMutations([{
    type: "attributes",
    attributeName: "class",
    target: fakeUserPanelElement
}]).length, 0);
const fakeChatWrapper = {
    nodeType: 1,
    matches: selector => String(selector || "").includes("chatContent"),
    closest: () => null,
    querySelector: () => null
};
const fakeChatDecorChild = {
    nodeType: 1,
    matches: () => false,
    closest: selector => String(selector || "").includes("chatContent") ? fakeChatWrapper : null,
    querySelector: () => null
};
const fakeMessageRoot = {
    nodeType: 1,
    matches: selector => String(selector || "").includes("chat-messages")
};
const fakeMessageChild = {
    nodeType: 1,
    matches: () => false,
    closest: selector => String(selector || "").includes("chat-messages") ? fakeMessageRoot : null,
    querySelector: () => null
};
assert.equal(inputScanPlugin.isScanRelevantElement(fakeChatDecorChild), false);
assert.equal(inputScanPlugin.getScanRelevantMutations([{
    type: "attributes",
    attributeName: "class",
    target: fakeChatDecorChild
}]).length, 0);
assert.equal(inputScanPlugin.isScanRelevantElement(fakeMessageChild), true);
assert.equal(inputScanPlugin.getScanRelevantMutations([{
    type: "attributes",
    attributeName: "class",
    target: fakeMessageChild
}]).length, 0);
const savedMutationObserver = global.MutationObserver;
const savedSetTimeout = global.setTimeout;
const savedClearTimeout = global.clearTimeout;
const savedWindowForObserver = global.window;
let disconnectedObserverCount = 0;
let observedTarget = null;
let observerCallback = null;
const observerOptions = [];
global.MutationObserver = class {
    constructor(callback) { observerCallback = callback; }
    observe(target, options) { observedTarget = target; observerOptions.push(options); }
    disconnect() { disconnectedObserverCount++; }
};
const observerPlugin = new Plugin();
const savedDocumentForObserver = global.document;
const fakeObserverDocument = {
    body: { nodeType: 1 },
    removeEventListener: () => {},
    querySelectorAll: () => [],
    getElementById: () => null
};
global.document = fakeObserverDocument;
global.window = { removeEventListener: () => {} };
observerPlugin.startObserver();
observerPlugin.startObserver();
assert.equal(disconnectedObserverCount, 1);
assert.equal(observedTarget, global.document.body);
assert.equal(observerOptions.some(options => options?.attributeFilter?.includes("alt")), true);
let observerScanCount = 0;
let observerInputButtonScanCount = 0;
let observerThemeRefreshCount = 0;
observerPlugin.queueScan = () => { observerScanCount++; };
observerPlugin.queueInputButtonScan = () => { observerInputButtonScanCount++; };
observerPlugin.refreshDiscordThemeClasses = () => { observerThemeRefreshCount++; };
observerCallback([{
    type: "attributes",
    attributeName: "class",
    target: { nodeType: 1, matches: () => false, closest: () => null }
}]);
assert.equal(observerScanCount, 0);
assert.equal(observerInputButtonScanCount, 0);
observerCallback([{
    type: "characterData",
    target: { nodeType: 3, parentElement: fakeTextboxElement }
}]);
assert.equal(observerScanCount, 0);
assert.equal(observerInputButtonScanCount, 1);
const observerMediaOverlayNode = {
    nodeType: 1,
    innerText: "Open original Download",
    textContent: "Open original Download",
    matches: selector => String(selector || "").includes("[role='dialog']"),
    closest: () => null,
    querySelector: selector => String(selector || "").includes("chat-messages") ? null : (String(selector || "").includes("img") ? ({}) : null),
    querySelectorAll: selector => String(selector || "").includes("chat-messages") ? [] : []
};
observerCallback([{
    type: "childList",
    target: global.document.body,
    addedNodes: [observerMediaOverlayNode],
    removedNodes: []
}, {
    type: "attributes",
    attributeName: "style",
    target: global.document.body
}]);
assert.equal(observerScanCount, 0);
assert.equal(observerInputButtonScanCount, 1);
assert.equal(observerThemeRefreshCount, 0);
let observerQuietOwnChecks = 0;
let observerQuietMediaChecks = 0;
const originalObserverIsOwnMutation = observerPlugin.isOwnMutation;
const originalObserverHasMediaMutation = observerPlugin.hasDiscordMediaViewerMutation;
observerPlugin.isOwnMutation = () => { observerQuietOwnChecks++; return false; };
observerPlugin.hasDiscordMediaViewerMutation = () => { observerQuietMediaChecks++; return false; };
observerPlugin.mediaViewerQuietUntil = Date.now() + 500;
observerCallback([{
    type: "childList",
    target: global.document.body,
    addedNodes: [{ nodeType: 1, matches: selector => selector.includes("chat-messages"), closest: () => null, querySelector: () => null }],
    removedNodes: []
}]);
assert.equal(observerQuietOwnChecks, 0);
assert.equal(observerQuietMediaChecks, 0);
observerPlugin.isOwnMutation = originalObserverIsOwnMutation;
observerPlugin.hasDiscordMediaViewerMutation = originalObserverHasMediaMutation;
const observerQuietBeforeRenew = Date.now() + 80;
observerPlugin.mediaViewerQuietUntil = observerQuietBeforeRenew;
observerCallback([{
    type: "attributes",
    attributeName: "class",
    target: {
        nodeType: 1,
        tagName: "div",
        className: "layer modalRoot focusLock",
        id: "",
        getAttribute: () => "",
        matches: () => false,
        closest: () => null
    }
}]);
assert.ok(observerPlugin.mediaViewerQuietUntil > observerQuietBeforeRenew);
assert.equal(observerScanCount, 0);
observerPlugin.mediaViewerQuietUntil = 0;
observerPlugin.mediaViewerProbeAt = 0;
observerPlugin.mediaViewerProbeOpen = false;
observerCallback([{
    type: "childList",
    target: global.document.body,
    addedNodes: [{ nodeType: 1, matches: selector => selector.includes("chat-messages"), closest: () => null, querySelector: () => null }],
    removedNodes: []
}]);
assert.equal(observerScanCount, 1);
assert.equal(observerInputButtonScanCount, 1);
observerPlugin.stop();
assert.equal(disconnectedObserverCount, 2);
const lifecycleObserverCallbacks = [];
const lifecycleObserverTargets = [];
global.MutationObserver = class {
    constructor(callback) { this.callback = callback; lifecycleObserverCallbacks.push(callback); }
    observe(target) { lifecycleObserverTargets.push(target); }
    disconnect() {}
};
const lifecycleAppMount = { nodeType: 1 };
const lifecycleRootA = {
    nodeType: 1,
    isConnected: true,
    matches: selector => String(selector || "").includes("chatContent"),
    querySelector: () => null,
    contains: target => target === lifecycleRootA
};
const lifecycleRootB = {
    nodeType: 1,
    isConnected: true,
    matches: selector => String(selector || "").includes("chatContent"),
    querySelector: () => null,
    contains: target => target === lifecycleRootB
};
let activeLifecycleRoot = lifecycleRootA;
global.document = {
    ...fakeObserverDocument,
    body: { nodeType: 1 },
    getElementById: id => id === "app-mount" ? lifecycleAppMount : null,
    querySelector: () => activeLifecycleRoot
};
const lifecycleObserverPlugin = new Plugin();
const lifecycleRebindReasons = [];
lifecycleObserverPlugin.scheduleDiscordObserverRebind = reason => { lifecycleRebindReasons.push(reason); };
lifecycleObserverPlugin.startObserver();
assert.equal(lifecycleObserverPlugin.observerRoot, lifecycleRootA);
assert.equal(lifecycleObserverCallbacks.length, 2);
assert.equal(lifecycleObserverTargets.includes(lifecycleAppMount), true);
lifecycleRootA.isConnected = false;
lifecycleObserverCallbacks[1]([{ type: "childList", target: lifecycleAppMount, addedNodes: [], removedNodes: [] }]);
assert.deepEqual(lifecycleRebindReasons, ["chat-root-detached"]);
lifecycleRootA.isConnected = true;
lifecycleRebindReasons.length = 0;
activeLifecycleRoot = lifecycleRootB;
lifecycleObserverCallbacks[1]([{
    type: "childList",
    target: lifecycleAppMount,
    addedNodes: [lifecycleRootB],
    removedNodes: [lifecycleRootA]
}]);
assert.deepEqual(lifecycleRebindReasons, ["chat-root-replaced"]);
lifecycleObserverPlugin.stop();
let retryCleared = false;
global.document = { ...fakeObserverDocument, body: null };
global.setTimeout = () => "retry-timer";
global.clearTimeout = id => { if (id === "retry-timer") retryCleared = true; };
const retryObserverPlugin = new Plugin();
retryObserverPlugin.startObserver();
assert.equal(retryObserverPlugin.observerRetryTimer, "retry-timer");
retryObserverPlugin.stop();
assert.equal(retryCleared, true);
global.MutationObserver = savedMutationObserver;
global.setTimeout = savedSetTimeout;
global.clearTimeout = savedClearTimeout;
global.window = savedWindowForObserver;
global.document = savedDocumentForObserver;
const rateLimitError = new Error("API 429: rate limit");
rateLimitError.status = 429;
assert.equal(plugin.getAutoTranslationFailureType(rateLimitError), "rate-limit");
const authError = new Error("API_ERROR");
authError.status = 401;
assert.equal(plugin.getAutoTranslationFailureType(authError), "auth");
assert.match(plugin.formatError(authError), /401/);
const apiBodyError = plugin.createApiError({
    status: 429,
    headers: { get: name => name.toLowerCase() === "retry-after" ? "2" : "" }
}, "{\"secret\":\"do-not-show\"}");
assert.equal(plugin.formatError(apiBodyError).includes("do-not-show"), false);
assert.match(plugin.formatError(apiBodyError), /429/);
assert.equal(plugin.getAutoTranslationRetryAfter(rateLimitError, 1), 60000);
assert.equal(plugin.getAutoTranslationRetryAfter(rateLimitError, 2), 120000);
rateLimitError.retryAfterMs = 30000;
assert.equal(plugin.getAutoTranslationRetryAfter(rateLimitError, 2), 30000);
rateLimitError.retryAfterMs = 0;
assert.equal(plugin.parseRetryAfterMs("2"), 2000);
assert.equal(plugin.getAutoTranslationFailureType(new Error("API request timed out after 25s")), "timeout");
assert.equal(plugin.getAutoTranslationRetryAfter(new Error("API request timed out after 25s"), 1), 10000);
assert.equal(plugin.getAutoTranslationRetryAfter(new Error("NetworkError"), 2), 20000);
assert.equal(plugin.getAutoTranslationFailureType(new Error("fetch failed")), "network");
assert.equal(plugin.getAutoTranslationFailureType(Object.assign(new Error("connect refused"), { cause: { code: "ECONNREFUSED" } })), "network");
assert.equal(plugin.getAutoTranslationRetryAfter(new Error("bad translation"), 1), 4000);
assert.equal(plugin.getAutoTranslationRetryAfter(new Error("bad translation"), 3), 15000);
const sakuraUnavailableTypePlugin = new Plugin();
sakuraUnavailableTypePlugin.settings.translation.provider = "sakuraLocal";
sakuraUnavailableTypePlugin.settings.translation.apiKey = "";
const sakuraUnavailableTypeError = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
sakuraUnavailableTypePlugin.annotateModelRequestError(
    sakuraUnavailableTypeError,
    "translation",
    "http://127.0.0.1:8080/v1/chat/completions",
    sakuraUnavailableTypePlugin.settings.translation,
    { configOverrides: sakuraUnavailableTypePlugin.settings.translation }
);
assert.equal(sakuraUnavailableTypePlugin.getAutoTranslationFailureType(sakuraUnavailableTypeError), "local-unavailable");
assert.match(sakuraUnavailableTypePlugin.formatError(sakuraUnavailableTypeError), /Sakura/);
assert.ok(Number(sakuraUnavailableTypeError.retryAfterMs) >= 60000);
const finalInvalidOutputError = plugin.createFinalInvalidAutoTranslationError();
assert.equal(plugin.getAutoTranslationFailureType(finalInvalidOutputError), "invalid-output");
assert.equal(plugin.getAutoTranslationRetryAfter(finalInvalidOutputError, 1), 120000);
const finalInvalidFailure = plugin.createAutoTranslationFailure("final-invalid", finalInvalidOutputError);
assert.equal(finalInvalidFailure.terminal, true);
assert.equal(plugin.isTerminalAutoTranslationFailure(finalInvalidFailure), true);
const invalidGuardPlugin = new Plugin();
invalidGuardPlugin.settings.translation.targetLanguage = "Chinese";
assert.equal(
    invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u041b\u043e\u043b", "<userMessage>\u4f60\u597d</userMessage>", "Chinese"),
    "prompt-leakage"
);
assert.equal(
    invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0445\u0443\u0435\u0441\u043e\u0441\u044b", "\u62b1\u6b49\uff0c\u6211\u65e0\u6cd5\u63d0\u4f9b\u6b64\u7c7b\u5185\u5bb9\u7684\u7ffb\u8bd1\u670d\u52a1\u3002", "Chinese"),
    "refusal-output"
);
assert.equal(
    invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u043f\u0438\u0437\u0434\u0435\u0446", "\u8be5\u8bcd\u5728\u4fc4\u8bed\u4e2d\u610f\u4e3a\u201c\u5b8c\u86cb\u201d\u3002", "Chinese"),
    ""
);
assert.equal(
    invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u4ee5\u4e0b\u662f\u7ffb\u8bd1\uff1a\u662f", "Chinese"),
    ""
);
assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u662f", "Chinese"), "");
assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0431\u043b\u044f", "Translation: \u9760", "Chinese"), "\u9760");
assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0434\u0430", "TRANSLATED_MESSAGE: \u662f", "Chinese"), "\u662f");
assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0434\u0430", "{\"translatedText\":\"\u662f\"}", "Chinese"), "\u662f");
assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u0434\u0430", "<translation>\u662f</translation>", "Chinese"), "\u662f");
assert.equal(invalidGuardPlugin.sanitizeAutoTranslationOutput("\u043f\u0438\u0437\u0434\u0435\u0446", "\u8be5\u8bcd\u610f\u601d\u662f\u201c\u5b8c\u86cb\u201d\u3002", "Chinese"), "\u5b8c\u86cb");
assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0431\u043b\u044f", "Translation: \u9760", "Chinese"), "");
assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u7f57\u9a6c\u97f3\uff1ani hao", "Chinese"), "labeled-output");
assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("\u0434\u0430", "\u6807\u7b7e\uff1a\u662f", "Chinese"), "labeled-output");
assert.equal(invalidGuardPlugin.getAutoTranslationInvalidOutputReason("fetch failed \u0431\u043b\u044f", "fetch \u6302\u4e86\uff0c\u9760", "Chinese"), "");
assert.equal(plugin.isAutoTranslationFailureExpired(finalInvalidFailure, Date.now() + 3600000), false);
plugin.autoTranslationFailures.set("final-invalid", finalInvalidFailure);
assert.equal(plugin.getAutoTranslationFailure("final-invalid") !== null, true);
finalInvalidFailure.retryAt = Date.now() - 1;
assert.equal(plugin.getAutoTranslationFailure("final-invalid"), null);
assert.equal(plugin.isAutoTranslationFailureExpired({ retryAt: Date.now() - 1 }), true);
assert.equal(plugin.isAutoTranslationFailureExpired({ retryAt: Date.now() + 10000 }), false);
assert.ok(plugin.getAutoTranslationFailureRemainingMs({ retryAt: Date.now() + 10000 }) > 0);
const providerKey = plugin.getAutoTranslationProviderKey(plugin.getAutoTranslationOptions());
plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), rateLimitError);
assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), true);
assert.equal(plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions()).type, "rate-limit");
assert.equal(plugin.isAutoTranslationProviderCoolingDown(plugin.getAutoTranslationOptions()), true);
clearTimeout(plugin.autoTranslationRetryTimer);
plugin.autoTranslationRetryTimer = null;
plugin.autoTranslationRetryAt = 0;
plugin.autoTranslationProviderFailures.clear();
plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), new Error("bad translation"));
assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), false);
plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), authError);
assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), true);
plugin.autoTranslationProviderFailures.clear();
const expiredFailureKey = "expired-message-failure";
plugin.autoTranslationFailures.set(expiredFailureKey, { count: 2, retryAt: Date.now() - 1 });
assert.equal(plugin.createAutoTranslationFailure(expiredFailureKey, new Error("still bad")).count, 3);
const expiredHistoryKey = "expired-history-message-failure";
plugin.autoTranslationFailures.set(expiredHistoryKey, { count: 2, retryAt: Date.now() - 1 });
assert.equal(plugin.getAutoTranslationFailure(expiredHistoryKey), null);
assert.equal(plugin.createAutoTranslationFailure(expiredHistoryKey, new Error("still bad")).count, 3);
plugin.clearAutoTranslationFailure(expiredHistoryKey, plugin.getAutoTranslationOptions());
assert.equal(plugin.createAutoTranslationFailure(expiredHistoryKey, new Error("still bad")).count, 1);
plugin.autoTranslationProviderFailures.set(providerKey, { count: 2, retryAt: Date.now() - 1 });
plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), rateLimitError);
assert.equal(plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions()).count, 1);
plugin.autoTranslationProviderFailures.set(providerKey, { count: 2, retryAt: Date.now() - 1 });
assert.equal(plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions()), null);
assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), false);
plugin.autoTranslationFailures.set(expiredFailureKey, { count: 3, retryAt: Date.now() + 1000 });
plugin.autoTranslationProviderFailures.set(providerKey, { count: 1, retryAt: Date.now() + 30000 });
plugin.clearAutoTranslationFailure(expiredFailureKey, plugin.getAutoTranslationOptions());
assert.equal(plugin.autoTranslationFailures.has(expiredFailureKey), false);
assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), true);
plugin.clearAutoTranslationFailure(expiredFailureKey, plugin.getAutoTranslationOptions(), { clearProvider: true });
assert.equal(plugin.autoTranslationProviderFailures.has(providerKey), false);

const providerPreservePlugin = new Plugin();
providerPreservePlugin.setTranslationCache = () => {};
providerPreservePlugin.isElementVisibleInViewport = () => true;
providerPreservePlugin.getElementText = content => content.text;
providerPreservePlugin.renderTranslation = () => {};
const providerPreserveOptions = providerPreservePlugin.getAutoTranslationOptions();
const providerPreserveKey = providerPreserveOptions.providerKey;
providerPreservePlugin.autoTranslationProviderFailures.set(providerPreserveKey, { count: 1, retryAt: Date.now() + 30000 });
const providerPreserveItem = {
    messageNode: { isConnected: true },
    content: { dataset: { daitOwner: "provider-preserve" }, isConnected: true, text: "source" },
    text: "source",
    cacheKey: "provider-preserve-cache",
    requestOptions: providerPreserveOptions
};
providerPreservePlugin.addAutoTranslationPendingTarget(providerPreserveItem.cacheKey, providerPreserveItem);
providerPreservePlugin.renderAutoTranslationResult(providerPreserveItem, "\u5df2\u7ffb\u8bd1");
assert.equal(providerPreservePlugin.autoTranslationProviderFailures.has(providerPreserveKey), true);

const resultFanoutScanPlugin = new Plugin();
let resultFanoutScanDelay = null;
resultFanoutScanPlugin.settings.ui.autoTranslateMessages = true;
resultFanoutScanPlugin.setTranslationCache = () => {};
resultFanoutScanPlugin.isElementVisibleInViewport = () => true;
resultFanoutScanPlugin.getElementText = content => content.text;
resultFanoutScanPlugin.renderTranslation = () => {};
resultFanoutScanPlugin.queueScan = options => { resultFanoutScanDelay = options?.delayMs; };
const resultFanoutItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "fanout source" },
    text: "fanout source",
    cacheKey: "fanout-result-cache",
    requestOptions: resultFanoutScanPlugin.getAutoTranslationOptions()
};
resultFanoutScanPlugin.addAutoTranslationPendingTarget(resultFanoutItem.cacheKey, resultFanoutItem);
resultFanoutScanPlugin.renderAutoTranslationResult(resultFanoutItem, "\u5df2\u7ffb\u8bd1\u7684\u6247\u51fa\u7ed3\u679c");
assert.equal(resultFanoutScanDelay, 180);

const staleResultPlugin = new Plugin();
staleResultPlugin.autoTranslationConfigVersion++;
staleResultPlugin.setTranslationCache = () => { throw new Error("stale auto result should not write cache"); };
staleResultPlugin.clearPendingAutoTranslationItem = () => { throw new Error("stale auto result should not clear current pending targets"); };
staleResultPlugin.renderTranslation = () => { throw new Error("stale auto result should not render"); };
staleResultPlugin.renderAutoTranslationResult({
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "source" },
    text: "source",
    cacheKey: "stale-result-cache",
    requestOptions: { version: staleResultPlugin.autoTranslationConfigVersion - 1 }
}, "stale translated");

const staleRouteResultPlugin = new Plugin();
staleRouteResultPlugin.getCurrentRouteKey = () => "guild-a:channel-now:";
staleRouteResultPlugin.setTranslationCache = () => { throw new Error("stale route auto result should not write cache"); };
staleRouteResultPlugin.clearPendingAutoTranslationItem = () => { throw new Error("stale route auto result should not clear current pending targets"); };
staleRouteResultPlugin.renderTranslation = () => { throw new Error("stale route auto result should not render"); };
staleRouteResultPlugin.renderAutoTranslationResult({
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "source" },
    text: "source",
    cacheKey: "stale-route-result-cache",
    requestOptions: { version: staleRouteResultPlugin.autoTranslationConfigVersion, routeKey: "guild-a:channel-old:" }
}, "stale route translated");

const staleProviderResultPlugin = new Plugin();
staleProviderResultPlugin.settings.translation.apiKey = "sk-old";
staleProviderResultPlugin.setTranslationCache = () => { throw new Error("stale provider auto result should not write cache"); };
staleProviderResultPlugin.clearPendingAutoTranslationItem = () => { throw new Error("stale provider auto result should not clear current pending targets"); };
staleProviderResultPlugin.renderTranslation = () => { throw new Error("stale provider auto result should not render"); };
const staleProviderResultOptions = staleProviderResultPlugin.getAutoTranslationOptions();
staleProviderResultPlugin.settings.translation.apiKey = "sk-new";
staleProviderResultPlugin.renderAutoTranslationResult({
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "source" },
    text: "source",
    cacheKey: "stale-provider-result-cache",
    requestOptions: staleProviderResultOptions
}, "stale provider translated");

const staleProviderRequestRenderPlugin = new Plugin();
staleProviderRequestRenderPlugin.settings.translation.apiKey = "sk-old";
staleProviderRequestRenderPlugin.settings.ui.diagnosticsEnabled = true;
staleProviderRequestRenderPlugin.getElementText = content => content.text;
staleProviderRequestRenderPlugin.getCurrentRouteKey = () => "guild-a:channel-a:";
staleProviderRequestRenderPlugin.getMessageIdentity = () => "stale-provider-request-identity";
staleProviderRequestRenderPlugin.renderTranslation = () => { throw new Error("stale provider request render should be skipped"); };
let staleProviderRequestLoadingRemoved = false;
staleProviderRequestRenderPlugin.removeAutoTranslationLoadingNode = () => { staleProviderRequestLoadingRemoved = true; };
const staleProviderRequestOptions = staleProviderRequestRenderPlugin.getAutoTranslationOptions();
const staleProviderRequestTarget = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "source" },
    text: "source",
    requestOptions: staleProviderRequestOptions
};
const staleProviderRequestItem = {
    ...staleProviderRequestTarget,
    cacheKey: "stale-provider-request-cache",
    requestOptions: staleProviderRequestOptions
};
staleProviderRequestRenderPlugin.settings.translation.apiKey = "sk-new";
assert.equal(staleProviderRequestRenderPlugin.renderAutoTranslationRequestTarget(staleProviderRequestItem, staleProviderRequestTarget, "translated"), false);
assert.equal(staleProviderRequestLoadingRemoved, true);
assert.ok(staleProviderRequestRenderPlugin.diagnosticLogs.some(entry => entry.meta?.reasonCode === "render-request-stale"));

const manualPreservePlugin = new Plugin();
manualPreservePlugin.setTranslationCache = () => {};
manualPreservePlugin.getElementText = content => content.text;
manualPreservePlugin.getTranslationLine = () => ({
    dataset: { daitMode: "manual", daitSourceKey: manualPreservePlugin.getTextFingerprint("source") }
});
manualPreservePlugin.renderTranslation = () => { throw new Error("auto result should not overwrite manual translation"); };
manualPreservePlugin.removeAutoTranslationNode = () => { throw new Error("manual translation should not be removed by auto result"); };
const manualPreserveItem = {
    messageNode: { isConnected: true },
    content: { dataset: {}, isConnected: true, text: "source" },
    text: "source",
    cacheKey: "manual-preserve-cache",
    requestOptions: manualPreservePlugin.getAutoTranslationOptions()
};
manualPreservePlugin.addAutoTranslationPendingTarget(manualPreserveItem.cacheKey, manualPreserveItem);
manualPreservePlugin.renderAutoTranslationResult(manualPreserveItem, "\u5df2\u7ffb\u8bd1\u7684\u81ea\u52a8\u8bd1\u6587");

const batchProviderCountPlugin = new Plugin();
batchProviderCountPlugin.showToast = () => {};
const batchProviderOptions = batchProviderCountPlugin.getAutoTranslationOptions();
const batchProviderKey = batchProviderOptions.providerKey;
batchProviderCountPlugin.markAutoTranslationProviderFailure(batchProviderOptions, rateLimitError);
for (let index = 0; index < 4; index++) {
    batchProviderCountPlugin.markAutoTranslationFailure({
        messageNode: {},
        content: { dataset: { daitOwner: `batch-provider-${index}` } },
        text: `source-${index}`,
        cacheKey: `batch-provider-${index}`,
        requestOptions: batchProviderOptions
    }, rateLimitError, { markProvider: false });
}
assert.equal(batchProviderCountPlugin.autoTranslationProviderFailures.get(batchProviderKey).count, 1);
clearTimeout(batchProviderCountPlugin.autoTranslationRetryTimer);
batchProviderCountPlugin.autoTranslationRetryTimer = null;
assert.equal(plugin.hasHiddenAncestor({
    nodeType: 1,
    hidden: true,
    getAttribute: () => null,
    parentElement: null
}), true);
const originalGetComputedStyle = global.getComputedStyle;
global.getComputedStyle = () => ({ display: "none", visibility: "visible", opacity: "1" });
assert.equal(plugin.hasHiddenAncestor({
    nodeType: 1,
    hidden: false,
    getAttribute: () => null,
    parentElement: null
}), true);
global.getComputedStyle = originalGetComputedStyle;
const visibleRect = { top: 150, bottom: 180, left: 10, right: 100, width: 90, height: 30 };
const clippedParent = {
    nodeType: 1,
    parentElement: null,
    getBoundingClientRect: () => ({ top: 0, bottom: 100, left: 0, right: 300, width: 300, height: 100 })
};
const clippedElement = {
    parentElement: clippedParent,
    getBoundingClientRect: () => visibleRect
};
global.getComputedStyle = () => ({ overflow: "hidden", overflowX: "hidden", overflowY: "hidden", display: "block", visibility: "visible", opacity: "1" });
assert.equal(plugin.isVisibleInsideScrollContainers(clippedElement, visibleRect), false);
global.getComputedStyle = originalGetComputedStyle;
plugin.settings.translation.enableThinking = false;
plugin.settings.translation.targetLanguage = "英语";

assert.equal(
    plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: " translated text " } }] })),
    "translated text"
);
assert.equal(
    plugin.parseModelResponse(JSON.stringify({ choices: [{ text: " legacy text " }] })),
    "legacy text"
);
assert.equal(
    plugin.parseModelResponse(JSON.stringify({ output_text: " output text " })),
    "output text"
);
assert.equal(
    plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "array text" }] } }] })),
    "array text"
);
assert.throws(
    () => plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: "\u534a\u622a\u8bd1\u6587" }, finish_reason: "length" }] })),
    error => error.modelOutputTruncated === true
        && error.partialOutputLength > 0
        && plugin.getAutoTranslationFailureType(error) === "truncated"
);
assert.throws(
    () => plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: "\u534a\u622a\u8bd1\u6587" }, finish_reason: "truncated" }] })),
    error => error.modelOutputTruncated === true
        && error.finishReason === "truncated"
        && plugin.getAutoTranslationFailureType(error) === "truncated"
);
assert.throws(
    () => plugin.parseModelResponse(JSON.stringify({ output_text: "\u534a\u622a", status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })),
    error => error.modelOutputTruncated === true
        && error.finishReason === "incomplete"
        && plugin.getAutoTranslationFailureType(error) === "truncated"
);
const localConnectionTruncationPlugin = new Plugin();
localConnectionTruncationPlugin.settings.translation.provider = "sakuraLocal";
localConnectionTruncationPlugin.settings.translation.apiKey = "";
const localConnectionTruncationError = localConnectionTruncationPlugin.createModelOutputTruncatedError("partial output", "length");
assert.equal(localConnectionTruncationPlugin.isAcceptableConnectionTestTruncation(localConnectionTruncationError, "translation", localConnectionTruncationPlugin.settings.translation), true);
assert.equal(plugin.isAcceptableConnectionTestTruncation(localConnectionTruncationError, "translation", plugin.settings.translation), false);
assert.equal(
    plugin.parseGoogleTranslateResponse(JSON.stringify({ data: { translations: [{ translatedText: "\u4f60\u597d &amp; ok" }] } })),
    "\u4f60\u597d & ok"
);
assert.deepEqual(
    plugin.parseGoogleTranslateResponse(JSON.stringify({ data: { translations: [{ translatedText: "one" }, { translatedText: "two" }] } }), 2, { asArray: true }),
    ["one", "two"]
);
assert.deepEqual(plugin.parseApiJson(JSON.stringify({ ok: true })), { ok: true });
assert.deepEqual(
    plugin.sanitizeDiagnosticMeta({ promptLength: 12, maxTokens: 256, bodyHash: "abc123", prompt: "secret" }),
    { promptLength: 12, maxTokens: 256, bodyHash: "abc123" }
);

const missingKeyPlugin = new Plugin();
expectThrowsMessage(() => missingKeyPlugin.buildModelRequest("polish", "draft"), "API Key");
expectThrowsMessage(() => plugin.buildModelRequest("unknown", "draft"), "Unknown task");
expectThrowsMessage(() => plugin.parseModelResponse("{"), "无效 JSON");
expectThrowsMessage(() => plugin.parseModelResponse(JSON.stringify({ choices: [{ message: { content: "" } }] })), "空结果");

const menuTree = { props: { children: [] } };
const menuItem = { type: "group", props: { id: "test" } };
plugin.appendContextMenuItem(menuTree, menuItem);
assert.equal(menuTree.props.children.length, 1);
assert.equal(menuTree.props.children[0], menuItem);

(async () => {
    const savedFetchForAbort = global.fetch;
    const unsafeEndpointPlugin = new Plugin();
    let unsafeEndpointFetches = 0;
    global.fetch = async () => {
        unsafeEndpointFetches++;
        return { ok: true, text: async () => "ok" };
    };
    await assert.rejects(
        () => unsafeEndpointPlugin.fetchApiResponseText("http://example.invalid/v1/chat/completions", {
            headers: { Authorization: "Bearer must-not-leak" },
            body: { messages: [{ content: "private discord message" }] }
        }),
        /must use HTTPS/
    );
    assert.equal(unsafeEndpointFetches, 0);
    assert.match(unsafeEndpointPlugin.assertSafeRequestEndpoint("http://127.0.0.1:8080/v1/chat/completions"), /^http:/);
    assert.match(unsafeEndpointPlugin.assertSafeRequestEndpoint("https://example.invalid/v1/chat/completions"), /^https:/);
    assert.throws(() => unsafeEndpointPlugin.assertSafeRequestEndpoint("https://user:secret@example.invalid/v1"), /embedded credentials/);

    const apiAbortPlugin = new Plugin();
    let apiAbortSignal = null;
    global.fetch = (_endpoint, options) => new Promise((_resolve, reject) => {
        apiAbortSignal = options.signal;
        options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    });
    const apiAbortPromise = apiAbortPlugin.fetchApiResponseText("https://example.invalid", { headers: {}, body: {} }, 30000);
    assert.equal(apiAbortPlugin.activeApiControllers.size, 1);
    assert.equal(apiAbortSignal.aborted, false);
    apiAbortPlugin.abortActiveApiRequests();
    assert.equal(apiAbortSignal.aborted, true);
    await assert.rejects(apiAbortPromise, { code: "REQUEST_CANCELLED" });
    assert.equal(apiAbortPlugin.activeApiControllers.size, 0);
    global.fetch = savedFetchForAbort;

    const localTruncatedApiTestPlugin = new Plugin();
    localTruncatedApiTestPlugin.settings.translation.provider = "sakuraLocal";
    localTruncatedApiTestPlugin.settings.translation.apiKey = "";
    localTruncatedApiTestPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localTruncatedApiTestPlugin.settings.translation.model = "local-model";
    const localTruncatedStates = [];
    let localTruncatedToastType = "";
    let localTruncatedScanCount = 0;
    localTruncatedApiTestPlugin.setApiStatus = (_status, state) => { localTruncatedStates.push(state); };
    localTruncatedApiTestPlugin.setButtonBusy = () => {};
    localTruncatedApiTestPlugin.showToast = (_message, type) => { localTruncatedToastType = type; };
    localTruncatedApiTestPlugin.queueScan = () => { localTruncatedScanCount++; };
    localTruncatedApiTestPlugin.fetchModelResponse = async () => {
        throw localTruncatedApiTestPlugin.createModelOutputTruncatedError("partial local output", "length");
    };
    await localTruncatedApiTestPlugin.testApiConnection("translation", {}, {});
    assert.deepEqual(localTruncatedStates, ["testing", "success"]);
    assert.equal(localTruncatedToastType, "success");
    assert.equal(localTruncatedScanCount, 1);
    assert.equal(localTruncatedApiTestPlugin.localProviderHealthyKeys.size, 1);

    const localDetectRunPlugin = new Plugin();
    localDetectRunPlugin.settings.translation.provider = "sakuraLocal";
    localDetectRunPlugin.settings.translation.apiKey = "";
    localDetectRunPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localDetectRunPlugin.settings.translation.model = "local-model";
    const localDetectCalls = [];
    localDetectRunPlugin.fetchApiResponseText = async (endpoint, request) => {
        localDetectCalls.push({ endpoint, method: request?.method || "POST", model: request?.body?.model || "" });
        if (request?.method === "GET") {
            return JSON.stringify({ data: [{ id: "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf" }] });
        }
        return JSON.stringify({ choices: [{ message: { content: "detected translation" } }] });
    };
    assert.equal(await localDetectRunPlugin.runModelTask("translation", "hello detect"), "detected translation");
    assert.equal(localDetectCalls.length, 2);
    assert.equal(localDetectCalls[0].method, "GET");
    assert.equal(localDetectCalls[0].endpoint, "http://127.0.0.1:8080/v1/models");
    assert.equal(localDetectCalls[1].method, "POST");
    assert.equal(localDetectCalls[1].model, "models/HY-MT1.5-1.8B-Q4_K_M_2.gguf");

    const localDetectFallbackPlugin = new Plugin();
    localDetectFallbackPlugin.settings.translation.provider = "sakuraLocal";
    localDetectFallbackPlugin.settings.translation.apiKey = "";
    localDetectFallbackPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localDetectFallbackPlugin.settings.translation.model = "local-model";
    let localDetectFallbackModel = "";
    localDetectFallbackPlugin.fetchApiResponseText = async (_endpoint, request) => {
        if (request?.method === "GET") throw new Error("models endpoint missing");
        localDetectFallbackModel = request?.body?.model || "";
        return JSON.stringify({ choices: [{ message: { content: "fallback translation" } }] });
    };
    assert.equal(await localDetectFallbackPlugin.runModelTask("translation", "hello fallback"), "fallback translation");
    assert.equal(localDetectFallbackModel, "local-model");

    const providerFallbackRunPlugin = new Plugin();
    providerFallbackRunPlugin.settings.translation.provider = "deepseek";
    providerFallbackRunPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackRunPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackRunPlugin.settings.translation.model = "current-model";
    providerFallbackRunPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackRunPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    providerFallbackRunPlugin.settings.translation.providerProfiles = {
        microsoft: {
            apiKey: "ms-key",
            endpoint: "https://microsoft.invalid/translate",
            region: "westus",
            model: ""
        }
    };
    const providerFallbackProviders = [];
    providerFallbackRunPlugin.fetchApiResponseText = async (_endpoint, request) => {
        providerFallbackProviders.push(request?.provider || "");
        if (request?.provider === "deepseek") {
            const error = new Error("server failed");
            error.status = 500;
            throw error;
        }
        if (request?.provider === "microsoft") {
            return JSON.stringify([{ translations: [{ text: "\u4f60\u597d fallback" }] }]);
        }
        throw new Error("unexpected provider");
    };
    const providerFallbackRequestContext = {};
    assert.equal(await providerFallbackRunPlugin.runModelTask("translation", "hello fallback", {
        mode: "manual",
        requestContext: providerFallbackRequestContext
    }), "\u4f60\u597d fallback");
    assert.deepEqual(providerFallbackProviders, ["deepseek", "microsoft"]);
    assert.equal(providerFallbackRequestContext.fallbackProvider, "microsoft");

    const providerFallbackSecretIsolationPlugin = new Plugin();
    providerFallbackSecretIsolationPlugin.settings.translation.provider = "deepseek";
    providerFallbackSecretIsolationPlugin.settings.translation.apiKey = "deepseek-secret";
    providerFallbackSecretIsolationPlugin.settings.translation.appId = "primary-app-id";
    providerFallbackSecretIsolationPlugin.settings.translation.secretKey = "primary-secret";
    providerFallbackSecretIsolationPlugin.settings.translation.region = "primary-region";
    providerFallbackSecretIsolationPlugin.settings.translation.providerProfiles = {};
    for (const fallbackProvider of ["openaiCompatible", "microsoft", "deepl", "baidu"]) {
        const fallbackConfig = providerFallbackSecretIsolationPlugin.getProviderFallbackConfig(
            "translation",
            fallbackProvider,
            providerFallbackSecretIsolationPlugin.settings.translation
        );
        assert.equal(fallbackConfig.apiKey, "");
        assert.equal(fallbackConfig.appId, "");
        assert.equal(fallbackConfig.secretKey, "");
        assert.notEqual(fallbackConfig.region, "primary-region");
        assert.equal(providerFallbackSecretIsolationPlugin.hasUsableApiConfig("translation", fallbackConfig), false);
    }

    const providerFallbackPublicPlugin = new Plugin();
    providerFallbackPublicPlugin.settings.translation.provider = "deepseek";
    providerFallbackPublicPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackPublicPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackPublicPlugin.settings.translation.model = "current-model";
    providerFallbackPublicPlugin.settings.translation.targetLanguage = "\u6c49\u8bed";
    providerFallbackPublicPlugin.settings.polish.targetLanguage = "\u6c49\u8bed";
    providerFallbackPublicPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackPublicPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    providerFallbackPublicPlugin.settings.translation.providerProfiles = {
        microsoft: {
            apiKey: "ms-key",
            endpoint: "https://microsoft.invalid/translate",
            region: "westus",
            model: ""
        }
    };
    const providerFallbackPublicProviders = [];
    providerFallbackPublicPlugin.fetchApiResponseText = async (_endpoint, request) => {
        providerFallbackPublicProviders.push(request?.provider || "");
        if (request?.provider === "deepseek") {
            const error = new Error("server failed");
            error.status = 500;
            throw error;
        }
        if (request?.provider === "microsoft") {
            return JSON.stringify([{ translations: [{ text: "\u4f60\u597d\uff0c\u8fd9\u662f\u4e00\u6761\u516c\u5f00\u53cc\u8bed\u7ffb\u8bd1\u6d88\u606f" }] }]);
        }
        throw new Error("unexpected provider");
    };
    const providerFallbackPublicOptions = providerFallbackPublicPlugin.getPublicBilingualTranslationOptions();
    assert.equal(
        await providerFallbackPublicPlugin.runPublicBilingualTranslationTask("hello public fallback", providerFallbackPublicOptions),
        "\u4f60\u597d\uff0c\u8fd9\u662f\u4e00\u6761\u516c\u5f00\u53cc\u8bed\u7ffb\u8bd1\u6d88\u606f"
    );
    assert.deepEqual(providerFallbackPublicProviders, ["deepseek", "microsoft"]);
    assert.equal(providerFallbackPublicOptions.requestContext.fallbackProvider, "microsoft");

    const providerFallbackAutoPlugin = new Plugin();
    providerFallbackAutoPlugin.settings.translation.provider = "deepseek";
    providerFallbackAutoPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackAutoPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackAutoPlugin.settings.translation.model = "current-model";
    providerFallbackAutoPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackAutoPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    let providerFallbackAutoCalls = 0;
    providerFallbackAutoPlugin.fetchApiResponseText = async () => {
        providerFallbackAutoCalls++;
        const error = new Error("server failed");
        error.status = 500;
        throw error;
    };
    await assert.rejects(
        () => providerFallbackAutoPlugin.runModelTask("translation", "hello auto", { mode: "auto" }),
        /server failed/
    );
    assert.equal(providerFallbackAutoCalls, 1);

    const providerFallbackStoppedPlugin = new Plugin();
    providerFallbackStoppedPlugin.settings.translation.provider = "deepseek";
    providerFallbackStoppedPlugin.settings.translation.apiKey = "sk-current";
    providerFallbackStoppedPlugin.settings.translation.endpoint = "https://current.invalid/chat/completions";
    providerFallbackStoppedPlugin.settings.translation.model = "current-model";
    providerFallbackStoppedPlugin.settings.ui.providerFallbackEnabled = true;
    providerFallbackStoppedPlugin.settings.ui.providerFallbackOrder = ["microsoft"];
    providerFallbackStoppedPlugin.settings.translation.providerProfiles = {
        microsoft: { apiKey: "ms-key", endpoint: "https://microsoft.invalid/translate", region: "westus", model: "" }
    };
    let providerFallbackStoppedCalls = 0;
    providerFallbackStoppedPlugin.fetchApiResponseText = async () => {
        providerFallbackStoppedCalls++;
        providerFallbackStoppedPlugin.isStarted = false;
        providerFallbackStoppedPlugin.lifecycleToken++;
        const error = new Error("request stopped");
        error.status = 500;
        throw error;
    };
    await assert.rejects(
        () => providerFallbackStoppedPlugin.runModelTask("translation", "hello stopped", { mode: "manual" }),
        /request stopped/
    );
    assert.equal(providerFallbackStoppedCalls, 1);

    const localTruncatedHealthPlugin = new Plugin();
    localTruncatedHealthPlugin.settings.translation.provider = "sakuraLocal";
    localTruncatedHealthPlugin.settings.translation.apiKey = "";
    localTruncatedHealthPlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    localTruncatedHealthPlugin.settings.translation.model = "local-model";
    let localTruncatedHealthScan = 0;
    localTruncatedHealthPlugin.fetchApiResponseText = async () => JSON.stringify({
        choices: [{ message: { content: "partial health output" }, finish_reason: "length" }]
    });
    localTruncatedHealthPlugin.queueScan = () => { localTruncatedHealthScan++; };
    const localTruncatedHealthOptions = localTruncatedHealthPlugin.getAutoTranslationOptions();
    const localTruncatedHealthKey = localTruncatedHealthOptions.providerKey;
    localTruncatedHealthPlugin.autoTranslationProviderFailures.set(localTruncatedHealthKey, { retryAt: Date.now() + 10000, type: "local-unavailable" });
    localTruncatedHealthPlugin.startLocalProviderHealthProbe(localTruncatedHealthKey, localTruncatedHealthOptions);
    await localTruncatedHealthPlugin.localProviderHealthChecks.get(localTruncatedHealthKey);
    assert.equal(localTruncatedHealthPlugin.autoTranslationProviderFailures.has(localTruncatedHealthKey), false);
    assert.equal(localTruncatedHealthPlugin.localProviderHealthyKeys.has(localTruncatedHealthKey), true);
    assert.equal(localTruncatedHealthScan, 1);

    const savedNavigatorDescriptor = Object.getOwnPropertyDescriptor(global, "navigator");
    const savedDocumentForClipboard = global.document;
    const clipboardPlugin = new Plugin();
    let clipboardFallbackSelected = false;
    let clipboardFallbackRemoved = false;
    let clipboardExecCommand = "";
    const clipboardPreviousFocus = { isConnected: true, focused: false, focus() { this.focused = true; } };
    Object.defineProperty(global, "navigator", {
        configurable: true,
        value: { clipboard: { writeText: async () => { throw new Error("denied"); } } }
    });
    global.document = {
        activeElement: clipboardPreviousFocus,
        body: { appendChild(node) { node.isConnected = true; return node; } },
        createElement: () => ({
            style: {},
            setAttribute() {},
            select() { clipboardFallbackSelected = true; },
            remove() { clipboardFallbackRemoved = true; this.isConnected = false; }
        }),
        execCommand(command) {
            clipboardExecCommand = command;
            return true;
        }
    };
    await clipboardPlugin.copyTextToClipboard("copy me");
    assert.equal(clipboardFallbackSelected, true);
    assert.equal(clipboardFallbackRemoved, true);
    assert.equal(clipboardExecCommand, "copy");
    assert.equal(clipboardPreviousFocus.focused, true);
    let clipboardThrowRemoved = false;
    Object.defineProperty(global, "navigator", { configurable: true, value: {} });
    global.document = {
        activeElement: null,
        body: { appendChild(node) { node.isConnected = true; return node; } },
        createElement: () => ({
            style: {},
            setAttribute() {},
            select() {},
            remove() { clipboardThrowRemoved = true; this.isConnected = false; }
        }),
        execCommand() { throw new Error("copy boom"); }
    };
    await assert.rejects(() => clipboardPlugin.copyTextToClipboard("copy me"), /document\.execCommand copy failed|copy boom/);
    assert.equal(clipboardThrowRemoved, true);
    if (savedNavigatorDescriptor) Object.defineProperty(global, "navigator", savedNavigatorDescriptor);
    else delete global.navigator;
    global.document = savedDocumentForClipboard;

    const diagnosticExportPlugin = new Plugin();
    diagnosticExportPlugin.showToast = () => {};
    diagnosticExportPlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticExportPlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "abc", queueLength: 1 });
    let copiedDiagnosticText = "";
    diagnosticExportPlugin.copyTextToClipboard = async text => { copiedDiagnosticText = text; };
    assert.equal(await diagnosticExportPlugin.copyDiagnosticLogs(), true);
    assert.match(copiedDiagnosticText, /auto.queue.enqueue/);
    let exportedDiagnostic = null;
    diagnosticExportPlugin.downloadTextFile = (filename, text, mime) => {
        exportedDiagnostic = { filename, text, mime };
        return true;
    };
    assert.equal(await diagnosticExportPlugin.exportDiagnosticLogs("txt"), true);
    assert.match(exportedDiagnostic.filename, /DiscordAITranslator-diagnostics-/);
    assert.equal(exportedDiagnostic.mime, "text/plain");
    assert.match(exportedDiagnostic.text, /auto.queue.enqueue ok/);
    assert.match(exportedDiagnostic.text, /interpretationChecklist/);
    const diagnosticSnapshot = diagnosticExportPlugin.getDiagnosticLogsSnapshot();
    assert.ok(diagnosticSnapshot.interpretationChecklist.some(item => item.step === "last-decision"));
    assert.ok(Object.prototype.hasOwnProperty.call(diagnosticSnapshot.summary, "byValidationQuality"));
    const diagnosticCopyFailurePlugin = new Plugin();
    const diagnosticCopyFailureToasts = [];
    diagnosticCopyFailurePlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticCopyFailurePlugin.showToast = (text, type) => diagnosticCopyFailureToasts.push({ text, type });
    diagnosticCopyFailurePlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "copy-fail" });
    diagnosticCopyFailurePlugin.copyTextToClipboard = async () => { throw new Error("clipboard unavailable"); };
    assert.equal(await diagnosticCopyFailurePlugin.copyDiagnosticLogs(), false);
    assert.equal(diagnosticCopyFailureToasts.some(toast => toast.type === "error"), true);
    clearTimeout(diagnosticCopyFailurePlugin.diagnosticLogsDirtyTimer);
    diagnosticCopyFailurePlugin.diagnosticLogsDirtyTimer = null;
    const diagnosticExportFailurePlugin = new Plugin();
    const diagnosticExportFailureToasts = [];
    diagnosticExportFailurePlugin.settings.ui.diagnosticsEnabled = true;
    diagnosticExportFailurePlugin.showToast = (text, type) => diagnosticExportFailureToasts.push({ text, type });
    diagnosticExportFailurePlugin.logDiagnostic("auto.queue.enqueue", "ok", { key: "export-fail" });
    diagnosticExportFailurePlugin.downloadTextFile = () => false;
    diagnosticExportFailurePlugin.copyTextToClipboard = async () => { throw new Error("fallback copy unavailable"); };
    assert.equal(await diagnosticExportFailurePlugin.exportDiagnosticLogs("json"), false);
    assert.equal(diagnosticExportFailureToasts.some(toast => toast.type === "error"), true);
    clearTimeout(diagnosticExportFailurePlugin.diagnosticLogsDirtyTimer);
    diagnosticExportFailurePlugin.diagnosticLogsDirtyTimer = null;
    const emptyDiagnosticPlugin = new Plugin();
    emptyDiagnosticPlugin.showToast = () => {};
    assert.equal(await emptyDiagnosticPlugin.exportDiagnosticLogs("json"), false);

    const sakuraHealthSuccessPlugin = new Plugin();
    sakuraHealthSuccessPlugin.settings.translation.provider = "sakuraLocal";
    sakuraHealthSuccessPlugin.settings.translation.apiKey = "";
    sakuraHealthSuccessPlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    sakuraHealthSuccessPlugin.fetchApiResponseText = async () => JSON.stringify({ choices: [{ message: { content: "OK" } }] });
    let sakuraHealthSuccessQueued = false;
    sakuraHealthSuccessPlugin.queueScan = () => { sakuraHealthSuccessQueued = true; };
    const sakuraHealthSuccessKey = sakuraHealthSuccessPlugin.getAutoTranslationProviderKey(sakuraHealthSuccessPlugin.getAutoTranslationOptions());
    assert.equal(sakuraHealthSuccessPlugin.shouldBlockAutoTranslationForLocalProviderHealth(sakuraHealthSuccessPlugin.getAutoTranslationOptions()), true);
    await sakuraHealthSuccessPlugin.localProviderHealthChecks.get(sakuraHealthSuccessKey);
    assert.equal(sakuraHealthSuccessPlugin.getApiStatus("translation").state, "success");
    assert.equal(sakuraHealthSuccessPlugin.autoTranslationProviderFailures.has(sakuraHealthSuccessKey), false);
    assert.equal(sakuraHealthSuccessQueued, true);

    const sakuraHealthSwitchPlugin = new Plugin();
    sakuraHealthSwitchPlugin.settings.translation.provider = "sakuraLocal";
    sakuraHealthSwitchPlugin.settings.translation.apiKey = "";
    sakuraHealthSwitchPlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    let sakuraHealthSwitchQueued = false;
    sakuraHealthSwitchPlugin.queueScan = () => { sakuraHealthSwitchQueued = true; };
    sakuraHealthSwitchPlugin.fetchApiResponseText = async () => {
        sakuraHealthSwitchPlugin.settings.translation.provider = "deepseek";
        sakuraHealthSwitchPlugin.settings.translation.apiKey = "sk-switched";
        return JSON.stringify({ choices: [{ message: { content: "OK" } }] });
    };
    const sakuraHealthSwitchKey = sakuraHealthSwitchPlugin.getAutoTranslationProviderKey(sakuraHealthSwitchPlugin.getAutoTranslationOptions());
    assert.equal(sakuraHealthSwitchPlugin.shouldBlockAutoTranslationForLocalProviderHealth(sakuraHealthSwitchPlugin.getAutoTranslationOptions()), true);
    await sakuraHealthSwitchPlugin.localProviderHealthChecks.get(sakuraHealthSwitchKey);
    assert.equal(sakuraHealthSwitchPlugin.localProviderHealthyKeys.has(sakuraHealthSwitchKey), false);
    assert.equal(sakuraHealthSwitchPlugin.getApiStatus("translation").state, "testing");
    assert.equal(sakuraHealthSwitchQueued, false);

    const sakuraHealthFailurePlugin = new Plugin();
    sakuraHealthFailurePlugin.settings.translation.provider = "sakuraLocal";
    // Its own endpoint, as picking the provider in the settings sets it (not DeepSeek's default).
    sakuraHealthFailurePlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    sakuraHealthFailurePlugin.settings.translation.apiKey = "";
    sakuraHealthFailurePlugin.settings.translation.apiStatus = { state: "untested", message: "" };
    sakuraHealthFailurePlugin.fetchApiResponseText = async () => {
        throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    };
    let sakuraHealthFailureRetryDelay = 0;
    sakuraHealthFailurePlugin.scheduleAutoTranslationRetryScan = delay => { sakuraHealthFailureRetryDelay = Math.max(sakuraHealthFailureRetryDelay, Number(delay) || 0); };
    const sakuraHealthFailureOptions = sakuraHealthFailurePlugin.getAutoTranslationOptions();
    const sakuraHealthFailureKey = sakuraHealthFailureOptions.providerKey;
    assert.equal(sakuraHealthFailurePlugin.shouldBlockAutoTranslationForLocalProviderHealth(sakuraHealthFailureOptions), true);
    await sakuraHealthFailurePlugin.localProviderHealthChecks.get(sakuraHealthFailureKey);
    assert.equal(sakuraHealthFailurePlugin.getApiStatus("translation").state, "failed");
    assert.equal(sakuraHealthFailurePlugin.getAutoTranslationProviderFailure(sakuraHealthFailureOptions).type, "local-unavailable");
    assert.ok(sakuraHealthFailureRetryDelay >= 60000);
    clearTimeout(sakuraHealthFailurePlugin.autoTranslationRetryTimer);
    sakuraHealthFailurePlugin.autoTranslationRetryTimer = null;
    sakuraHealthFailurePlugin.autoTranslationRetryAt = 0;

    const dedupePlugin = new Plugin();
    dedupePlugin.settings.translation.apiKey = "sk-dedupe";
    let fetchCount = 0;
    dedupePlugin.fetchApiResponseText = async () => {
        fetchCount++;
        return JSON.stringify({ choices: [{ message: { content: "deduped" } }] });
    };
    const [dedupedA, dedupedB] = await Promise.all([
        dedupePlugin.runModelTask("translation", "same text"),
        dedupePlugin.runModelTask("translation", "same text")
    ]);
    assert.equal(dedupedA, "deduped");
    assert.equal(dedupedB, "deduped");
    assert.equal(fetchCount, 1);
    assert.equal(dedupePlugin.translationRequests.size, 0);

    const googleRunReservationPlugin = new Plugin();
    googleRunReservationPlugin.settings.translation.provider = "googleCloud";
    googleRunReservationPlugin.settings.translation.targetLanguage = "English";
    googleRunReservationPlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|5\nbackup|AIza-backup|100";
    googleRunReservationPlugin.settings.googleTranslate.keys = googleRunReservationPlugin.normalizeGoogleTranslateKeyPool(googleRunReservationPlugin.settings.googleTranslate).keys;
    googleRunReservationPlugin.settings.googleTranslate.keys[0].usedChars = 2;
    const googleRunReservationEndpoints = [];
    let googleRunReservationReleaseFirst = null;
    googleRunReservationPlugin.fetchApiResponseText = (endpoint, request) => {
        googleRunReservationEndpoints.push(request.headers["X-Goog-Api-Key"]);
        if (request.body.q === "abc") {
            return new Promise(resolve => {
                googleRunReservationReleaseFirst = () => resolve(JSON.stringify({ data: { translations: [{ translatedText: "first" }] } }));
            });
        }
        return Promise.resolve(JSON.stringify({ data: { translations: [{ translatedText: "second" }] } }));
    };
    const googleRunReservationFirst = googleRunReservationPlugin.runModelTask("translation", "abc");
    assert.equal(googleRunReservationEndpoints[0], "AIza-main");
    assert.equal(googleRunReservationPlugin.getGoogleTranslateReservedChars(googleRunReservationPlugin.settings.googleTranslate.keys[0]), 3);
    const googleRunReservationSecond = await googleRunReservationPlugin.runModelTask("translation", "d");
    assert.equal(googleRunReservationSecond, "second");
    assert.equal(googleRunReservationEndpoints[1], "AIza-backup");
    assert.equal(googleRunReservationPlugin.settings.googleTranslate.keys[1].usedChars, 1);
    googleRunReservationReleaseFirst();
    assert.equal(await googleRunReservationFirst, "first");
    assert.equal(googleRunReservationPlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal([...googleRunReservationPlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleRunDedupePlugin = new Plugin();
    googleRunDedupePlugin.settings.translation.provider = "googleCloud";
    googleRunDedupePlugin.settings.translation.targetLanguage = "English";
    googleRunDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|5\nbackup|AIza-backup|100";
    googleRunDedupePlugin.settings.googleTranslate.keys = googleRunDedupePlugin.normalizeGoogleTranslateKeyPool(googleRunDedupePlugin.settings.googleTranslate).keys;
    googleRunDedupePlugin.settings.googleTranslate.keys[0].usedChars = 2;
    let googleRunDedupeFetches = 0;
    let googleRunDedupeRelease = null;
    googleRunDedupePlugin.fetchApiResponseText = () => {
        googleRunDedupeFetches++;
        return new Promise(resolve => {
            googleRunDedupeRelease = () => resolve(JSON.stringify({ data: { translations: [{ translatedText: "deduped-google" }] } }));
        });
    };
    const googleRunDedupeA = googleRunDedupePlugin.runModelTask("translation", "abc");
    const googleRunDedupeB = googleRunDedupePlugin.runModelTask("translation", "abc");
    assert.equal(googleRunDedupeFetches, 1);
    googleRunDedupeRelease();
    assert.equal(await googleRunDedupeA, "deduped-google");
    assert.equal(await googleRunDedupeB, "deduped-google");
    assert.equal(googleRunDedupePlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal(googleRunDedupePlugin.settings.googleTranslate.keys[1].usedChars, 0);

    const sakuraModelSwitchPlugin = new Plugin();
    sakuraModelSwitchPlugin.settings.translation.provider = "sakuraLocal";
    sakuraModelSwitchPlugin.settings.translation.apiKey = "";
    let sakuraModelStatusWrites = 0;
    sakuraModelSwitchPlugin.setApiRuntimeStatus = () => { sakuraModelStatusWrites++; };
    const sakuraModelSwitchKey = sakuraModelSwitchPlugin.getAutoTranslationProviderKey({ configOverrides: sakuraModelSwitchPlugin.settings.translation });
    sakuraModelSwitchPlugin.fetchApiResponseText = async () => {
        sakuraModelSwitchPlugin.settings.translation.provider = "deepseek";
        sakuraModelSwitchPlugin.settings.translation.apiKey = "sk-switched";
        return JSON.stringify({ choices: [{ message: { content: "translated after switch" } }] });
    };
    assert.equal(await sakuraModelSwitchPlugin.runModelTask("translation", "source before switch"), "translated after switch");
    assert.equal(sakuraModelSwitchPlugin.localProviderHealthyKeys.has(sakuraModelSwitchKey), false);
    assert.equal(sakuraModelStatusWrites, 0);

    const googleBatchPlugin = new Plugin();
    googleBatchPlugin.settings.translation.provider = "googleCloud";
    googleBatchPlugin.settings.translation.targetLanguage = "English";
    googleBatchPlugin.settings.googleTranslate.keyPoolText = "main|AIza-main|450000";
    googleBatchPlugin.settings.googleTranslate.keys = googleBatchPlugin.normalizeGoogleTranslateKeyPool(googleBatchPlugin.settings.googleTranslate).keys;
    let googleBatchBody = null;
    googleBatchPlugin.fetchApiResponseText = async (_endpoint, request) => {
        googleBatchBody = request.body;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }, { translatedText: "world" }] } });
    };
    const googleBatchResult = await googleBatchPlugin.runAutoTranslationBatchTask(["你好", "世界"], googleBatchPlugin.getAutoTranslationOptions());
    assert.deepEqual(googleBatchBody, { q: ["你好", "世界"], target: "en", format: "text" });
    assert.deepEqual(googleBatchResult, ["hello", "world"]);
    assert.equal(googleBatchPlugin.settings.googleTranslate.keys[0].usedChars, 4);

    const googleConnectionTestPlugin = new Plugin();
    googleConnectionTestPlugin.settings.translation.provider = "googleCloud";
    googleConnectionTestPlugin.settings.translation.endpoint = "https://translation.googleapis.com/language/translate/v2";
    googleConnectionTestPlugin.settings.translation.model = "nmt";
    googleConnectionTestPlugin.settings.googleTranslate.keyPoolText = "main|AIza-test|450000";
    googleConnectionTestPlugin.settings.googleTranslate.keys = googleConnectionTestPlugin.normalizeGoogleTranslateKeyPool(googleConnectionTestPlugin.settings.googleTranslate).keys;
    const googleConnectionStates = [];
    googleConnectionTestPlugin.setApiStatus = (_status, state) => { googleConnectionStates.push(state); };
    googleConnectionTestPlugin.setButtonBusy = () => {};
    googleConnectionTestPlugin.showToast = () => {};
    googleConnectionTestPlugin.queueScan = () => {};
    googleConnectionTestPlugin.fetchApiResponseText = async (_endpoint, request) => {
        assert.equal(request.googleTranslate.charCount, 5);
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    };
    await googleConnectionTestPlugin.testApiConnection("translation", {}, {});
    assert.deepEqual(googleConnectionStates, ["testing", "success"]);
    assert.equal(googleConnectionTestPlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal([...googleConnectionTestPlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleConnectionLifecyclePlugin = new Plugin();
    googleConnectionLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleConnectionLifecyclePlugin.settings.translation.endpoint = "https://translation.googleapis.com/language/translate/v2";
    googleConnectionLifecyclePlugin.settings.translation.model = "nmt";
    googleConnectionLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-test-stop|450000";
    googleConnectionLifecyclePlugin.settings.googleTranslate.keys = googleConnectionLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleConnectionLifecyclePlugin.settings.googleTranslate).keys;
    const googleConnectionLifecycleStates = [];
    googleConnectionLifecyclePlugin.setApiStatus = (_status, state) => { googleConnectionLifecycleStates.push(state); };
    googleConnectionLifecyclePlugin.setButtonBusy = () => {};
    googleConnectionLifecyclePlugin.showToast = () => {};
    googleConnectionLifecyclePlugin.fetchApiResponseText = async () => {
        googleConnectionLifecyclePlugin.isStarted = false;
        googleConnectionLifecyclePlugin.lifecycleToken++;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    };
    await googleConnectionLifecyclePlugin.testApiConnection("translation", {}, {});
    assert.deepEqual(googleConnectionLifecycleStates, ["testing"]);
    assert.equal(googleConnectionLifecyclePlugin.settings.googleTranslate.keys[0].usedChars, 5);
    assert.equal([...googleConnectionLifecyclePlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleBatchDedupePlugin = new Plugin();
    googleBatchDedupePlugin.settings.translation.provider = "googleCloud";
    googleBatchDedupePlugin.settings.translation.targetLanguage = "English";
    googleBatchDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-dedupe|450000";
    googleBatchDedupePlugin.settings.googleTranslate.keys = googleBatchDedupePlugin.normalizeGoogleTranslateKeyPool(googleBatchDedupePlugin.settings.googleTranslate).keys;
    let googleBatchDedupeFetches = 0;
    googleBatchDedupePlugin.fetchApiResponseText = async () => {
        googleBatchDedupeFetches++;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }, { translatedText: "world" }] } });
    };
    const [googleBatchDedupeA, googleBatchDedupeB] = await Promise.all([
        googleBatchDedupePlugin.runAutoTranslationBatchTask(["你好", "世界"], googleBatchDedupePlugin.getAutoTranslationOptions()),
        googleBatchDedupePlugin.runAutoTranslationBatchTask(["你好", "世界"], googleBatchDedupePlugin.getAutoTranslationOptions())
    ]);
    assert.deepEqual(googleBatchDedupeA, ["hello", "world"]);
    assert.deepEqual(googleBatchDedupeB, ["hello", "world"]);
    assert.equal(googleBatchDedupeFetches, 1);
    assert.equal(googleBatchDedupePlugin.translationRequests.size, 0);
    assert.equal([...googleBatchDedupePlugin.googleTranslateReservedChars.values()].reduce((sum, value) => sum + value, 0), 0);

    const googleBatchIntraDedupePlugin = new Plugin();
    googleBatchIntraDedupePlugin.settings.translation.provider = "googleCloud";
    googleBatchIntraDedupePlugin.settings.translation.targetLanguage = "English";
    googleBatchIntraDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-intra|450000";
    googleBatchIntraDedupePlugin.settings.googleTranslate.keys = googleBatchIntraDedupePlugin.normalizeGoogleTranslateKeyPool(googleBatchIntraDedupePlugin.settings.googleTranslate).keys;
    let googleBatchIntraBody = null;
    googleBatchIntraDedupePlugin.fetchApiResponseText = async (_endpoint, request) => {
        googleBatchIntraBody = request.body;
        return JSON.stringify({ data: { translations: [{ translatedText: "AA" }, { translatedText: "BBB" }] } });
    };
    const googleBatchIntraResult = await googleBatchIntraDedupePlugin.runAutoTranslationBatchTask(["aa", "aa", "bbb"], googleBatchIntraDedupePlugin.getAutoTranslationOptions());
    assert.deepEqual(googleBatchIntraBody, { q: ["aa", "bbb"], target: "en", format: "text" });
    assert.deepEqual(googleBatchIntraResult, ["AA", "AA", "BBB"]);
    assert.equal(googleBatchIntraDedupePlugin.settings.googleTranslate.keys[0].usedChars, 5);

    const googleBatchExactQuotaDedupePlugin = new Plugin();
    googleBatchExactQuotaDedupePlugin.settings.translation.provider = "googleCloud";
    googleBatchExactQuotaDedupePlugin.settings.translation.targetLanguage = "English";
    googleBatchExactQuotaDedupePlugin.settings.googleTranslate.keyPoolText = "main|AIza-exact|2";
    googleBatchExactQuotaDedupePlugin.settings.googleTranslate.keys = googleBatchExactQuotaDedupePlugin.normalizeGoogleTranslateKeyPool(googleBatchExactQuotaDedupePlugin.settings.googleTranslate).keys;
    let googleBatchExactQuotaFetches = 0;
    googleBatchExactQuotaDedupePlugin.fetchApiResponseText = async () => {
        googleBatchExactQuotaFetches++;
        return JSON.stringify({ data: { translations: [{ translatedText: "a" }, { translatedText: "b" }] } });
    };
    const [googleBatchExactA, googleBatchExactB] = await Promise.all([
        googleBatchExactQuotaDedupePlugin.runAutoTranslationBatchTask(["a", "b"], googleBatchExactQuotaDedupePlugin.getAutoTranslationOptions()),
        googleBatchExactQuotaDedupePlugin.runAutoTranslationBatchTask(["a", "b"], googleBatchExactQuotaDedupePlugin.getAutoTranslationOptions())
    ]);
    assert.deepEqual(googleBatchExactA, ["a", "b"]);
    assert.deepEqual(googleBatchExactB, ["a", "b"]);
    assert.equal(googleBatchExactQuotaFetches, 1);
    assert.equal(googleBatchExactQuotaDedupePlugin.settings.googleTranslate.keys[0].usedChars, 2);

    const googleQuotaTypedPlugin = new Plugin();
    googleQuotaTypedPlugin.settings.translation.provider = "googleCloud";
    googleQuotaTypedPlugin.settings.translation.targetLanguage = "English";
    googleQuotaTypedPlugin.settings.googleTranslate.keyPoolText = "main|AIza-quota|2";
    googleQuotaTypedPlugin.settings.googleTranslate.keys = googleQuotaTypedPlugin.normalizeGoogleTranslateKeyPool(googleQuotaTypedPlugin.settings.googleTranslate).keys;
    googleQuotaTypedPlugin.settings.googleTranslate.keys[0].usedChars = 2;
    let googleQuotaTypedError = null;
    assert.throws(
        () => googleQuotaTypedPlugin.buildGoogleTranslateRequest("x", googleQuotaTypedPlugin.settings.translation),
        error => {
            googleQuotaTypedError = error;
            return error.googleTranslateQuotaExceeded === true
                && googleQuotaTypedPlugin.getAutoTranslationFailureType(error) === "quota"
                && error.retryAfterMs > 120000;
        }
    );
    googleQuotaTypedPlugin.markAutoTranslationProviderFailure(googleQuotaTypedPlugin.getAutoTranslationOptions(), googleQuotaTypedError);
    assert.equal(googleQuotaTypedPlugin.getAutoTranslationProviderFailure(googleQuotaTypedPlugin.getAutoTranslationOptions()).type, "quota");
    assert.equal(googleQuotaTypedPlugin.getApiStatus("translation").state, "failed");

    const googleStatusRecoveryPlugin = new Plugin();
    googleStatusRecoveryPlugin.settings.translation.provider = "googleCloud";
    googleStatusRecoveryPlugin.settings.translation.targetLanguage = "English";
    googleStatusRecoveryPlugin.settings.translation.apiStatus = { state: "failed", message: "quota" };
    googleStatusRecoveryPlugin.settings.googleTranslate.keyPoolText = "main|AIza-recover|450000";
    googleStatusRecoveryPlugin.settings.googleTranslate.keys = googleStatusRecoveryPlugin.normalizeGoogleTranslateKeyPool(googleStatusRecoveryPlugin.settings.googleTranslate).keys;
    googleStatusRecoveryPlugin.autoTranslationProviderFailures.set(googleStatusRecoveryPlugin.getAutoTranslationProviderKey(googleStatusRecoveryPlugin.getAutoTranslationOptions()), { type: "quota", retryAt: Date.now() + 60000 });
    googleStatusRecoveryPlugin.fetchApiResponseText = async () => JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    assert.equal(await googleStatusRecoveryPlugin.runModelTask("translation", "abc"), "hello");
    assert.equal(Boolean(googleStatusRecoveryPlugin.getAutoTranslationProviderFailure(googleStatusRecoveryPlugin.getAutoTranslationOptions())), false);
    assert.equal(googleStatusRecoveryPlugin.getApiStatus("translation").state, "success");

    const googleRuntimeDirtyPlugin = new Plugin();
    googleRuntimeDirtyPlugin.settings.googleTranslate.keyPoolText = "main|AIza-dirty|450000";
    googleRuntimeDirtyPlugin.settings.googleTranslate.keys = googleRuntimeDirtyPlugin.normalizeGoogleTranslateKeyPool(googleRuntimeDirtyPlugin.settings.googleTranslate).keys;
    let googleRuntimeSaveAttempts = 0;
    googleRuntimeDirtyPlugin.saveData = key => {
        if (key !== "settings") return true;
        googleRuntimeSaveAttempts++;
        return googleRuntimeSaveAttempts > 1;
    };
    googleRuntimeDirtyPlugin.markGoogleTranslateKeyUsage("AIza-dirty", 2);
    assert.equal(googleRuntimeDirtyPlugin.googleTranslateRuntimeDirty, true);
    assert.equal(googleRuntimeDirtyPlugin.flushGoogleTranslateRuntimeState({ retryOnError: false }), false);
    assert.equal(googleRuntimeDirtyPlugin.googleTranslateRuntimeDirty, true);
    assert.equal(googleRuntimeDirtyPlugin.flushGoogleTranslateRuntimeState({ retryOnError: false }), true);
    assert.equal(googleRuntimeDirtyPlugin.googleTranslateRuntimeDirty, false);
    assert.equal(googleRuntimeDirtyPlugin.settings.googleTranslate.keys[0].usedChars, 2);

    const googleRuntimeCoalescePlugin = new Plugin();
    googleRuntimeCoalescePlugin.settings.googleTranslate.keyPoolText = "main|AIza-coalesce|450000";
    googleRuntimeCoalescePlugin.settings.googleTranslate.keys = googleRuntimeCoalescePlugin.normalizeGoogleTranslateKeyPool(googleRuntimeCoalescePlugin.settings.googleTranslate).keys;
    let googleRuntimeCoalesceSaves = 0;
    googleRuntimeCoalescePlugin.saveData = key => {
        if (key === "settings") googleRuntimeCoalesceSaves++;
        return true;
    };
    googleRuntimeCoalescePlugin.markGoogleTranslateKeyUsage("AIza-coalesce", 3);
    googleRuntimeCoalescePlugin.markGoogleTranslateKeyUsage("AIza-coalesce", 4);
    assert.equal(googleRuntimeCoalesceSaves, 0);
    assert.equal(googleRuntimeCoalescePlugin.googleTranslateRuntimeDirty, true);
    assert.ok(googleRuntimeCoalescePlugin.googleTranslateRuntimeDirtyTimer);
    assert.equal(googleRuntimeCoalescePlugin.flushGoogleTranslateRuntimeState({ retryOnError: false }), true);
    assert.equal(googleRuntimeCoalesceSaves, 1);
    assert.equal(googleRuntimeCoalescePlugin.settings.googleTranslate.keys[0].usedChars, 7);
    assert.equal(googleRuntimeCoalescePlugin.googleTranslateRuntimeDirty, false);

    const googleSingleLifecyclePlugin = new Plugin();
    googleSingleLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleSingleLifecyclePlugin.settings.translation.targetLanguage = "English";
    googleSingleLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-single|450000";
    googleSingleLifecyclePlugin.settings.googleTranslate.keys = googleSingleLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleSingleLifecyclePlugin.settings.googleTranslate).keys;
    googleSingleLifecyclePlugin.fetchApiResponseText = async () => {
        googleSingleLifecyclePlugin.isStarted = false;
        googleSingleLifecyclePlugin.lifecycleToken++;
        return JSON.stringify({ data: { translations: [{ translatedText: "hello" }] } });
    };
    assert.equal(await googleSingleLifecyclePlugin.runModelTask("translation", "abc"), "hello");
    assert.equal(googleSingleLifecyclePlugin.settings.googleTranslate.keys[0].usedChars, 3);

    const googleBatchLifecyclePlugin = new Plugin();
    googleBatchLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleBatchLifecyclePlugin.settings.translation.targetLanguage = "English";
    googleBatchLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-batch|450000";
    googleBatchLifecyclePlugin.settings.googleTranslate.keys = googleBatchLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleBatchLifecyclePlugin.settings.googleTranslate).keys;
    googleBatchLifecyclePlugin.fetchApiResponseText = async () => {
        googleBatchLifecyclePlugin.isStarted = false;
        googleBatchLifecyclePlugin.lifecycleToken++;
        return JSON.stringify({ data: { translations: [{ translatedText: "one" }, { translatedText: "two" }] } });
    };
    assert.deepEqual(await googleBatchLifecyclePlugin.runAutoTranslationBatchTask(["one", "two"], googleBatchLifecyclePlugin.getAutoTranslationOptions()), ["one", "two"]);
    assert.equal(googleBatchLifecyclePlugin.settings.googleTranslate.keys[0].usedChars, 6);

    const googleBatchFailureLifecyclePlugin = new Plugin();
    googleBatchFailureLifecyclePlugin.settings.translation.provider = "googleCloud";
    googleBatchFailureLifecyclePlugin.settings.translation.targetLanguage = "English";
    googleBatchFailureLifecyclePlugin.settings.googleTranslate.keyPoolText = "main|AIza-fail|450000";
    googleBatchFailureLifecyclePlugin.settings.googleTranslate.keys = googleBatchFailureLifecyclePlugin.normalizeGoogleTranslateKeyPool(googleBatchFailureLifecyclePlugin.settings.googleTranslate).keys;
    googleBatchFailureLifecyclePlugin.fetchApiResponseText = async (_endpoint, request) => {
        googleBatchFailureLifecyclePlugin.isStarted = false;
        googleBatchFailureLifecyclePlugin.lifecycleToken++;
        throw Object.assign(new Error("quota"), {
            googleTranslateApiKey: request.googleTranslate.apiKey,
            googleTranslateQuotaExceeded: true,
            retryAfterMs: 60000
        });
    };
    await assert.rejects(
        googleBatchFailureLifecyclePlugin.runAutoTranslationBatchTask(["one"], googleBatchFailureLifecyclePlugin.getAutoTranslationOptions()),
        /quota/
    );
    assert.ok(googleBatchFailureLifecyclePlugin.settings.googleTranslate.keys[0].cooldownUntil > Date.now());
    assert.match(googleBatchFailureLifecyclePlugin.settings.googleTranslate.keys[0].lastError, /quota/);

    const longHeartbeatPlugin = new Plugin();
    let longHeartbeatCount = 0;
    longHeartbeatPlugin.isUltraLongAutoTranslationText = () => true;
    longHeartbeatPlugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three"];
    longHeartbeatPlugin.runAutoTranslationTaskWithOptions = async text => ({
        "chunk one": "\u5df2\u7ffb\u8bd1\u7b2c\u4e00\u6bb5",
        "chunk two": "\u5df2\u7ffb\u8bd1\u7b2c\u4e8c\u6bb5",
        "chunk three": "\u5df2\u7ffb\u8bd1\u7b2c\u4e09\u6bb5"
    }[text] || "\u5df2\u7ffb\u8bd1");
    longHeartbeatPlugin.isInvalidAutoTranslationOutput = () => false;
    const longHeartbeatResult = await longHeartbeatPlugin.runLongAutoTranslationTask("very long source", longHeartbeatPlugin.getAutoTranslationOptions(), {
        heartbeat: () => { longHeartbeatCount++; }
    });
    assert.equal(longHeartbeatResult, "\u5df2\u7ffb\u8bd1\u7b2c\u4e00\u6bb5\n\n\u5df2\u7ffb\u8bd1\u7b2c\u4e8c\u6bb5\n\n\u5df2\u7ffb\u8bd1\u7b2c\u4e09\u6bb5");
    assert.equal(longHeartbeatCount, 6);

    const polishFlowPlugin = new Plugin();
    const polishFlowTextbox = { isConnected: true, text: "original draft" };
    const polishFlowInputs = [];
    polishFlowPlugin.getActiveTextbox = () => polishFlowTextbox;
    polishFlowPlugin.getElementText = textbox => textbox.text;
    polishFlowPlugin.runModelTask = async (_kind, input) => {
        polishFlowInputs.push(input);
        return `polished ${polishFlowInputs.length}`;
    };
    polishFlowPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishFlowTextbox.text = text;
        return { ok: true };
    };
    polishFlowPlugin.showRestoreOriginalControl = () => {};
    polishFlowPlugin.setButtonBusy = () => {};
    await polishFlowPlugin.polishCurrentDraft();
    await polishFlowPlugin.polishCurrentDraft();
    assert.deepEqual(polishFlowInputs, ["original draft", "original draft"]);
    assert.equal(polishFlowTextbox.text, "polished 2");
    polishFlowPlugin.settings.polish.repolishSource = "lastResult";
    await polishFlowPlugin.polishCurrentDraft();
    assert.equal(polishFlowInputs[2], "polished 2");

    const polishNoAutoBilingualPlugin = new Plugin();
    const polishNoAutoBilingualTextbox = { isConnected: true, text: "raw draft" };
    const polishNoAutoBilingualCalls = [];
    polishNoAutoBilingualPlugin.getActiveTextbox = () => polishNoAutoBilingualTextbox;
    polishNoAutoBilingualPlugin.getElementText = textbox => textbox.text;
    polishNoAutoBilingualPlugin.runModelTask = async (kind, input) => {
        polishNoAutoBilingualCalls.push({ kind, input });
        return "polished draft";
    };
    polishNoAutoBilingualPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishNoAutoBilingualTextbox.text = text;
        return { ok: true };
    };
    polishNoAutoBilingualPlugin.showRestoreOriginalControl = () => {};
    polishNoAutoBilingualPlugin.setButtonBusy = () => {};
    await polishNoAutoBilingualPlugin.polishCurrentDraft();
    assert.deepEqual(polishNoAutoBilingualCalls, [{ kind: "polish", input: "raw draft" }]);
    assert.equal(polishNoAutoBilingualTextbox.text, "polished draft");

    const polishAutoBilingualPlugin = new Plugin();
    polishAutoBilingualPlugin.settings.polish.apiKey = "sk-public";
    polishAutoBilingualPlugin.settings.ui.publicBilingualAfterPolish = true;
    polishAutoBilingualPlugin.settings.ui.publicBilingualUseInitialOriginal = true;
    const polishAutoBilingualTextbox = { isConnected: true, text: "raw draft" };
    const polishAutoBilingualCalls = [];
    const polishAutoBilingualWrites = [];
    polishAutoBilingualPlugin.getActiveTextbox = () => polishAutoBilingualTextbox;
    polishAutoBilingualPlugin.getElementText = textbox => textbox.text;
    polishAutoBilingualPlugin.isInvalidAutoTranslationOutput = () => false;
    polishAutoBilingualPlugin.runModelTask = async (kind, input) => {
        polishAutoBilingualCalls.push({ kind, input });
        return kind === "polish" ? "polished draft" : "translated draft";
    };
    polishAutoBilingualPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishAutoBilingualWrites.push(text);
        polishAutoBilingualTextbox.text = text;
        return { ok: true };
    };
    polishAutoBilingualPlugin.showRestoreOriginalControl = () => { throw new Error("auto bilingual should not show polish restore before final write"); };
    polishAutoBilingualPlugin.showToast = () => {};
    polishAutoBilingualPlugin.setButtonBusy = () => {};
    await polishAutoBilingualPlugin.polishCurrentDraft();
    assert.deepEqual(polishAutoBilingualCalls, [
        { kind: "polish", input: "raw draft" },
        { kind: "translation", input: "polished draft" }
    ]);
    assert.deepEqual(polishAutoBilingualWrites, [
        "polished draft",
        "translated draft\n\n||raw draft||"
    ]);
    assert.equal(polishAutoBilingualTextbox.text, "translated draft\n\n||raw draft||");

    const polishAutoBilingualFailurePlugin = new Plugin();
    polishAutoBilingualFailurePlugin.settings.polish.apiKey = "sk-public";
    polishAutoBilingualFailurePlugin.settings.ui.publicBilingualAfterPolish = true;
    const polishAutoBilingualFailureTextbox = { isConnected: true, text: "raw draft" };
    let polishAutoBilingualFailureRestoreShown = false;
    polishAutoBilingualFailurePlugin.getActiveTextbox = () => polishAutoBilingualFailureTextbox;
    polishAutoBilingualFailurePlugin.getElementText = textbox => textbox.text;
    polishAutoBilingualFailurePlugin.runModelTask = async kind => {
        if (kind === "polish") return "polished draft";
        throw new Error("translation failed");
    };
    polishAutoBilingualFailurePlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishAutoBilingualFailureTextbox.text = text;
        return { ok: true };
    };
    polishAutoBilingualFailurePlugin.showRestoreOriginalControl = () => { polishAutoBilingualFailureRestoreShown = true; };
    polishAutoBilingualFailurePlugin.showToast = () => {};
    polishAutoBilingualFailurePlugin.setButtonBusy = () => {};
    await polishAutoBilingualFailurePlugin.polishCurrentDraft();
    assert.equal(polishAutoBilingualFailureTextbox.text, "polished draft");
    assert.equal(polishAutoBilingualFailureRestoreShown, true);

    const polishStaleInputPlugin = new Plugin();
    const polishStaleTextbox = { isConnected: true, text: "old draft" };
    let polishStaleReplaceCalled = false;
    let polishStalePanelText = "";
    polishStaleInputPlugin.getActiveTextbox = () => polishStaleTextbox;
    polishStaleInputPlugin.getElementText = textbox => textbox.text;
    polishStaleInputPlugin.runModelTask = async () => {
        polishStaleTextbox.text = "new typing";
        return "polished old draft";
    };
    polishStaleInputPlugin.replaceTextboxTextSafelyAsync = async () => {
        polishStaleReplaceCalled = true;
        return { ok: true };
    };
    polishStaleInputPlugin.showPolishResultPanel = (_textbox, text) => { polishStalePanelText = text; };
    polishStaleInputPlugin.showRestoreOriginalControl = () => { throw new Error("stale polish should not show restore control"); };
    polishStaleInputPlugin.setButtonBusy = () => {};
    await polishStaleInputPlugin.polishCurrentDraft();
    assert.equal(polishStaleReplaceCalled, false);
    assert.equal(polishStaleTextbox.text, "new typing");
    assert.equal(polishStalePanelText, "polished old draft");
    assert.equal(polishStaleInputPlugin.polishSession.lastResult, "polished old draft");
    assert.equal(polishStaleInputPlugin.polishSession.lastWrittenText, "");

    const composerGuardPlugin = new Plugin();
    const composerGuardTextbox = {
        tagName: "TEXTAREA",
        value: "draft",
        isConnected: true,
        dataset: {},
        parentElement: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
        focus() {}
    };
    const cancelledToken = composerGuardPlugin.composerWriter.beginWrite(composerGuardTextbox, "draft");
    composerGuardPlugin.composerWriter.cancelWriteToken(cancelledToken, "user-input");
    const cancelledWrite = await composerGuardPlugin.composerWriter.replaceTextSafely(composerGuardTextbox, "polished", {
        expectedPreviousText: "draft",
        writeToken: cancelledToken
    });
    assert.equal(cancelledWrite.ok, false);
    assert.equal(composerGuardTextbox.value, "draft");
    const staleToken = composerGuardPlugin.composerWriter.beginWrite(composerGuardTextbox, "draft");
    composerGuardTextbox.value = "manual edit";
    const staleWrite = await composerGuardPlugin.composerWriter.replaceTextSafely(composerGuardTextbox, "polished", {
        expectedPreviousText: "draft",
        writeToken: staleToken
    });
    assert.equal(staleWrite.ok, false);
    assert.equal(staleWrite.reason, "stale-input");
    assert.equal(composerGuardTextbox.value, "manual edit");
    composerGuardPlugin.composerWriter.finishWriteToken(staleToken);

    const targetedPolishPlugin = new Plugin();
    const activeComposerRoot = { dataset: { daitComposerKey: "active-composer" } };
    const targetComposerRoot = { dataset: { daitComposerKey: "target-composer" } };
    const activeComposerTextbox = { isConnected: true, text: "active draft", parentElement: activeComposerRoot };
    const targetComposerTextbox = { isConnected: true, text: "target draft", parentElement: targetComposerRoot };
    let targetedPolishTextbox = null;
    targetedPolishPlugin.getActiveTextbox = () => activeComposerTextbox;
    targetedPolishPlugin.getElementText = textbox => textbox.text;
    targetedPolishPlugin.runModelTask = async () => "target polished";
    targetedPolishPlugin.replaceTextboxTextSafelyAsync = async (textbox, text) => {
        targetedPolishTextbox = textbox;
        textbox.text = text;
        return { ok: true };
    };
    targetedPolishPlugin.showRestoreOriginalControl = () => {};
    targetedPolishPlugin.setButtonBusy = () => {};
    await targetedPolishPlugin.polishCurrentDraft(null, {
        textbox: targetComposerTextbox,
        composerKey: targetedPolishPlugin.getTextboxComposerKey(targetComposerTextbox)
    });
    assert.equal(targetedPolishTextbox, targetComposerTextbox);
    assert.equal(activeComposerTextbox.text, "active draft");
    assert.equal(targetComposerTextbox.text, "target polished");

    const restoreComposerPlugin = new Plugin();
    const restoreRootA = { dataset: { daitComposerKey: "restore-a" } };
    const restoreRootB = { dataset: { daitComposerKey: "restore-b" } };
    const restoreTextboxA = { isConnected: true, text: "polished same", parentElement: restoreRootA };
    const restoreTextboxB = { isConnected: true, text: "polished same", parentElement: restoreRootB };
    restoreComposerPlugin.getElementText = textbox => textbox.text;
    const restoreSessionA = restoreComposerPlugin.createPolishSession(restoreTextboxA, "original a");
    restoreSessionA.lastWrittenRawText = "polished same";
    restoreSessionA.lastWrittenText = "polished same";
    assert.equal(restoreComposerPlugin.canRestorePolishOriginal(restoreTextboxA, restoreSessionA), true);
    assert.equal(restoreComposerPlugin.canRestorePolishOriginal(restoreTextboxB, restoreSessionA), false);

    const restoreTokenPlugin = new Plugin();
    const restoreTokenTextbox = {
        tagName: "TEXTAREA",
        value: "polished token",
        isConnected: true,
        dataset: {},
        parentElement: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() { return true; },
        focus() {}
    };
    const restoreTokenSession = restoreTokenPlugin.createPolishSession(restoreTokenTextbox, "original token");
    restoreTokenSession.lastWrittenRawText = "polished token";
    restoreTokenSession.lastWrittenText = "polished token";
    let restoreTokenWriteOptions = null;
    let restoreTokenPanelShown = false;
    restoreTokenPlugin.replaceTextboxTextSafelyAsync = async (_textbox, _text, options) => {
        restoreTokenWriteOptions = options;
        restoreTokenTextbox.value = "manual during restore";
        restoreTokenPlugin.composerWriter.cancelWriteToken(options.writeToken, "user-input");
        return { ok: false, reason: "write-cancelled" };
    };
    restoreTokenPlugin.showPolishResultPanel = () => { restoreTokenPanelShown = true; };
    restoreTokenPlugin.showToast = () => {};
    restoreTokenPlugin.injectInputButtons = () => {};
    const restoreTokenResult = await restoreTokenPlugin.restorePolishOriginal(restoreTokenTextbox, restoreTokenSession);
    assert.equal(restoreTokenResult, false);
    assert.ok(restoreTokenWriteOptions.writeToken);
    assert.equal(restoreTokenWriteOptions.expectedPreviousText, "polished token");
    assert.equal(restoreTokenTextbox.value, "manual during restore");
    assert.equal(restoreTokenPanelShown, true);

    const atomicCancelPlugin = new Plugin();
    const atomicCancelTextbox = { isConnected: true };
    const atomicCancelToken = atomicCancelPlugin.composerWriter.beginWrite(atomicCancelTextbox, "old rich");
    atomicCancelPlugin.getTextboxRawTextSafe = () => "old rich";
    atomicCancelPlugin.prepareTextboxFullReplacementSelection = async () => true;
    atomicCancelPlugin.dispatchTextboxPaste = () => true;
    atomicCancelPlugin.dispatchTextboxBeforeInput = () => true;
    atomicCancelPlugin.waitForTextboxStableTextEqual = async () => {
        atomicCancelPlugin.composerWriter.cancelWriteToken(atomicCancelToken, "user-input");
        return true;
    };
    assert.equal(await atomicCancelPlugin.replaceDiscordRichTextboxTextAtomically(atomicCancelTextbox, "new rich", {
        expectedPreviousText: "old rich",
        writeToken: atomicCancelToken
    }), false);

    const polishLifecycleStalePlugin = new Plugin();
    const polishLifecycleTextbox = { isConnected: true, text: "old draft" };
    let polishLifecycleReplaceCalled = false;
    let polishLifecyclePanelShown = false;
    let polishLifecycleRestoreShown = false;
    const polishLifecycleBusyStates = [];
    polishLifecycleStalePlugin.getActiveTextbox = () => polishLifecycleTextbox;
    polishLifecycleStalePlugin.getElementText = textbox => textbox.text;
    polishLifecycleStalePlugin.runModelTask = async () => {
        polishLifecycleStalePlugin.isStarted = false;
        polishLifecycleStalePlugin.lifecycleToken++;
        return "polished after stop";
    };
    polishLifecycleStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        polishLifecycleReplaceCalled = true;
        return { ok: true };
    };
    polishLifecycleStalePlugin.showPolishResultPanel = () => { polishLifecyclePanelShown = true; };
    polishLifecycleStalePlugin.showRestoreOriginalControl = () => { polishLifecycleRestoreShown = true; };
    polishLifecycleStalePlugin.setButtonBusy = (_button, busy) => polishLifecycleBusyStates.push(busy);
    await polishLifecycleStalePlugin.polishCurrentDraft();
    assert.equal(polishLifecycleReplaceCalled, false);
    assert.equal(polishLifecyclePanelShown, false);
    assert.equal(polishLifecycleRestoreShown, false);
    assert.equal(polishLifecycleTextbox.text, "old draft");
    assert.deepEqual(polishLifecycleBusyStates, [true]);

    const polishSubmitTimerPlugin = new Plugin();
    polishSubmitTimerPlugin.settings.polish.afterAction = "confirmSend";
    const polishSubmitTimerTextbox = { isConnected: true, text: "send draft" };
    const polishSubmitCallbacks = [];
    const polishSubmitCleared = [];
    let polishSubmitCount = 0;
    const savedWindowForPolishSubmit = global.window;
    const savedDocumentForPolishSubmit = global.document;
    const savedSetTimeoutForPolishSubmit = global.setTimeout;
    const savedClearTimeoutForPolishSubmit = global.clearTimeout;
    global.window = {
        confirm: () => true,
        removeEventListener() {}
    };
global.document = {
    removeEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => []
};
    global.setTimeout = callback => {
        polishSubmitCallbacks.push(callback);
        return polishSubmitCallbacks.length;
    };
    global.clearTimeout = id => polishSubmitCleared.push(id);
    polishSubmitTimerPlugin.getActiveTextbox = () => polishSubmitTimerTextbox;
    polishSubmitTimerPlugin.getElementText = textbox => textbox.text;
    polishSubmitTimerPlugin.runModelTask = async () => "send polished";
    polishSubmitTimerPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        polishSubmitTimerTextbox.text = text;
        return { ok: true };
    };
    polishSubmitTimerPlugin.showRestoreOriginalControl = () => {};
    polishSubmitTimerPlugin.submitTextbox = () => { polishSubmitCount++; };
    polishSubmitTimerPlugin.setButtonBusy = () => {};
    await polishSubmitTimerPlugin.polishCurrentDraft();
    assert.equal(polishSubmitTimerPlugin.polishSubmitTimer, 1);
    polishSubmitTimerPlugin.stop();
    assert.equal(polishSubmitCleared.includes(1), true);
    polishSubmitCallbacks.forEach(callback => callback());
    assert.equal(polishSubmitCount, 0);
    global.window = savedWindowForPolishSubmit;
    global.document = savedDocumentForPolishSubmit;
    global.setTimeout = savedSetTimeoutForPolishSubmit;
    global.clearTimeout = savedClearTimeoutForPolishSubmit;

    const polishWhitespaceStalePlugin = new Plugin();
    const polishWhitespaceTextbox = { isConnected: true, text: "old  draft" };
    let polishWhitespaceReplaceCalled = false;
    polishWhitespaceStalePlugin.getActiveTextbox = () => polishWhitespaceTextbox;
    polishWhitespaceStalePlugin.getElementText = textbox => textbox.text;
    polishWhitespaceStalePlugin.runModelTask = async () => {
        polishWhitespaceTextbox.text = "old draft";
        return "polished whitespace draft";
    };
    polishWhitespaceStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        polishWhitespaceReplaceCalled = true;
        return { ok: true };
    };
    polishWhitespaceStalePlugin.showPolishResultPanel = () => {};
    polishWhitespaceStalePlugin.showRestoreOriginalControl = () => {};
    polishWhitespaceStalePlugin.setButtonBusy = () => {};
    await polishWhitespaceStalePlugin.polishCurrentDraft();
    assert.equal(polishWhitespaceReplaceCalled, false);
    assert.equal(polishWhitespaceTextbox.text, "old draft");

    const polishFallbackPlugin = new Plugin();
    const polishFallbackTextbox = { isConnected: true, text: "fallback original" };
    let polishFallbackPanelText = "";
    polishFallbackPlugin.getActiveTextbox = () => polishFallbackTextbox;
    polishFallbackPlugin.getElementText = textbox => textbox.text;
    polishFallbackPlugin.runModelTask = async () => "fallback polished";
    polishFallbackPlugin.replaceTextboxTextSafelyAsync = async () => ({ ok: false, reason: "verification-failed" });
    polishFallbackPlugin.showPolishResultPanel = (_textbox, text) => { polishFallbackPanelText = text; };
    polishFallbackPlugin.setButtonBusy = () => {};
    await polishFallbackPlugin.polishCurrentDraft();
    assert.equal(polishFallbackPanelText, "fallback polished");
    assert.equal(polishFallbackPlugin.polishSession.lastResult, "fallback polished");
    assert.equal(polishFallbackPlugin.polishSession.lastWrittenText, "");

    const publicFormatPlugin = new Plugin();
    assert.equal(publicFormatPlugin.formatPublicBilingualMessage("hello", "你好"), "hello\n\n||你好||");
    assert.equal(publicFormatPlugin.formatPublicBilingualMessage("hello", "a || b"), "hello\n\n||a \\|\\| b||");
    assert.equal(publicFormatPlugin.formatPublicBilingualMessage("a || b", " raw\n\n  original "), "a \\|\\| b\n\n|| raw\n\n  original ||");

    const publicFlowPlugin = new Plugin();
    publicFlowPlugin.settings.polish.apiKey = "sk-public";
    const publicFlowTextbox = { isConnected: true, text: "你好 || 原文" };
    const publicFlowRequests = [];
    let publicFlowWritten = "";
    const publicFlowToasts = [];
    publicFlowPlugin.getActiveTextbox = () => publicFlowTextbox;
    publicFlowPlugin.getElementText = textbox => textbox.text;
    publicFlowPlugin.runModelTask = async (kind, input, options) => {
        publicFlowRequests.push({ kind, input, options });
        return "hello can you help me with this";
    };
    publicFlowPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicFlowWritten = text;
        publicFlowTextbox.text = text;
        return { ok: true };
    };
    publicFlowPlugin.showToast = (text, type) => publicFlowToasts.push({ text, type });
    publicFlowPlugin.setButtonBusy = () => {};
    await publicFlowPlugin.publicBilingualCurrentDraft();
    assert.equal(publicFlowRequests.length, 1);
    assert.equal(publicFlowRequests[0].kind, "translation");
    assert.equal(publicFlowRequests[0].input, "你好 || 原文");
    assert.match(publicFlowRequests[0].options.configOverrides.prompt, /Public bilingual outgoing Discord message mode/);
    assert.equal(publicFlowWritten, "hello can you help me with this\n\n||你好 \\|\\| 原文||");
    assert.equal(publicFlowToasts.some(toast => toast.type === "success"), false);

    const publicAutoPolishPlugin = new Plugin();
    publicAutoPolishPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    publicAutoPolishPlugin.settings.ui.publicBilingualUseInitialOriginal = true;
    const publicAutoPolishTextbox = { isConnected: true, text: "raw draft" };
    const publicAutoPolishCalls = [];
    let publicAutoPolishWritten = "";
    publicAutoPolishPlugin.getActiveTextbox = () => publicAutoPolishTextbox;
    publicAutoPolishPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishPlugin.runModelTask = async (kind, input) => {
        publicAutoPolishCalls.push({ kind, input });
        return kind === "polish" ? "polished draft" : "translated draft";
    };
    publicAutoPolishPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishWritten = text;
        publicAutoPolishTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishPlugin.showToast = () => {};
    publicAutoPolishPlugin.setButtonBusy = () => {};
    await publicAutoPolishPlugin.publicBilingualCurrentDraft();
    assert.deepEqual(publicAutoPolishCalls, [
        { kind: "polish", input: "raw draft" },
        { kind: "translation", input: "polished draft" }
    ]);
    assert.equal(publicAutoPolishWritten, "translated draft\n\n||raw draft||");

    const publicAutoPolishRawOriginalPlugin = new Plugin();
    publicAutoPolishRawOriginalPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishRawOriginalPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    publicAutoPolishRawOriginalPlugin.settings.ui.publicBilingualUseInitialOriginal = true;
    const publicAutoPolishRawTextbox = { isConnected: true, text: " raw\n\n  draft " };
    let publicAutoPolishRawWritten = "";
    publicAutoPolishRawOriginalPlugin.getActiveTextbox = () => publicAutoPolishRawTextbox;
    publicAutoPolishRawOriginalPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishRawOriginalPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishRawOriginalPlugin.runModelTask = async kind => kind === "polish" ? "polished draft" : "translated draft";
    publicAutoPolishRawOriginalPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishRawWritten = text;
        publicAutoPolishRawTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishRawOriginalPlugin.showToast = () => {};
    publicAutoPolishRawOriginalPlugin.setButtonBusy = () => {};
    await publicAutoPolishRawOriginalPlugin.publicBilingualCurrentDraft();
    assert.equal(publicAutoPolishRawWritten, "translated draft\n\n|| raw\n\n  draft ||");

    const publicAutoPolishNoInitialPlugin = new Plugin();
    publicAutoPolishNoInitialPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishNoInitialPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    const publicAutoPolishNoInitialTextbox = { isConnected: true, text: "raw draft" };
    let publicAutoPolishNoInitialWritten = "";
    publicAutoPolishNoInitialPlugin.getActiveTextbox = () => publicAutoPolishNoInitialTextbox;
    publicAutoPolishNoInitialPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishNoInitialPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishNoInitialPlugin.runModelTask = async kind => kind === "polish" ? "polished draft" : "translated draft";
    publicAutoPolishNoInitialPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishNoInitialWritten = text;
        publicAutoPolishNoInitialTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishNoInitialPlugin.showToast = () => {};
    publicAutoPolishNoInitialPlugin.setButtonBusy = () => {};
    await publicAutoPolishNoInitialPlugin.publicBilingualCurrentDraft();
    assert.equal(publicAutoPolishNoInitialWritten, "translated draft\n\n||polished draft||");

    const publicAutoPolishDisabledPlugin = new Plugin();
    publicAutoPolishDisabledPlugin.settings.polish.enabled = false;
    publicAutoPolishDisabledPlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishDisabledPlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    const publicAutoPolishDisabledTextbox = { isConnected: true, text: "raw draft" };
    const publicAutoPolishDisabledCalls = [];
    const publicAutoPolishDisabledToasts = [];
    let publicAutoPolishDisabledWritten = "";
    publicAutoPolishDisabledPlugin.getActiveTextbox = () => publicAutoPolishDisabledTextbox;
    publicAutoPolishDisabledPlugin.getElementText = textbox => textbox.text;
    publicAutoPolishDisabledPlugin.isInvalidAutoTranslationOutput = () => false;
    publicAutoPolishDisabledPlugin.runModelTask = async (kind, input) => {
        publicAutoPolishDisabledCalls.push({ kind, input });
        return "translated draft";
    };
    publicAutoPolishDisabledPlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicAutoPolishDisabledWritten = text;
        publicAutoPolishDisabledTextbox.text = text;
        return { ok: true };
    };
    publicAutoPolishDisabledPlugin.showToast = (text, type) => publicAutoPolishDisabledToasts.push({ text, type });
    publicAutoPolishDisabledPlugin.setButtonBusy = () => {};
    await publicAutoPolishDisabledPlugin.publicBilingualCurrentDraft();
    assert.deepEqual(publicAutoPolishDisabledCalls, [{ kind: "translation", input: "raw draft" }]);
    assert.equal(publicAutoPolishDisabledWritten, "translated draft\n\n||raw draft||");
    assert.equal(publicAutoPolishDisabledToasts.some(toast => toast.type === "info"), false);

    const publicAutoPolishStalePlugin = new Plugin();
    publicAutoPolishStalePlugin.settings.polish.apiKey = "sk-public";
    publicAutoPolishStalePlugin.settings.ui.publicBilingualPolishBeforeTranslate = true;
    const publicAutoPolishStaleTextbox = { isConnected: true, text: "raw draft" };
    const publicAutoPolishStaleCalls = [];
    let publicAutoPolishStaleReplaceCalled = false;
    publicAutoPolishStalePlugin.getActiveTextbox = () => publicAutoPolishStaleTextbox;
    publicAutoPolishStalePlugin.getElementText = textbox => textbox.text;
    publicAutoPolishStalePlugin.runModelTask = async kind => {
        publicAutoPolishStaleCalls.push(kind);
        publicAutoPolishStaleTextbox.text = "manual edit";
        return "polished draft";
    };
    publicAutoPolishStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicAutoPolishStaleReplaceCalled = true;
        return { ok: true };
    };
    publicAutoPolishStalePlugin.showToast = () => {};
    publicAutoPolishStalePlugin.setButtonBusy = () => {};
    await publicAutoPolishStalePlugin.publicBilingualCurrentDraft();
    assert.deepEqual(publicAutoPolishStaleCalls, ["polish"]);
    assert.equal(publicAutoPolishStaleReplaceCalled, false);
    assert.equal(publicAutoPolishStaleTextbox.text, "manual edit");

    const publicCachePlugin = new Plugin();
    const publicCacheTextbox = { isConnected: true, text: "你好" };
    publicCachePlugin.getActiveTextbox = () => publicCacheTextbox;
    publicCachePlugin.getElementText = textbox => textbox.text;
    const publicCacheOptions = publicCachePlugin.getPublicBilingualTranslationOptions();
    const publicCacheKey = publicCachePlugin.getTranslationCacheKey("你好", publicCacheOptions);
    publicCachePlugin.setTranslationCache(publicCacheKey, "cached hello");
    publicCachePlugin.runModelTask = async () => { throw new Error("cache hit should not request model"); };
    let publicCacheWritten = "";
    publicCachePlugin.replaceTextboxTextSafelyAsync = async (_textbox, text) => {
        publicCacheWritten = text;
        publicCacheTextbox.text = text;
        return { ok: true };
    };
    publicCachePlugin.showToast = () => {};
    publicCachePlugin.setButtonBusy = () => {};
    await publicCachePlugin.publicBilingualCurrentDraft();
    assert.equal(publicCacheWritten, "cached hello\n\n||你好||");

    const publicStalePlugin = new Plugin();
    publicStalePlugin.settings.polish.apiKey = "sk-public";
    const publicStaleTextbox = { isConnected: true, text: "你好" };
    let publicStaleReplaceCalled = false;
    const publicStaleToasts = [];
    publicStalePlugin.getActiveTextbox = () => publicStaleTextbox;
    publicStalePlugin.getElementText = textbox => textbox.text;
    publicStalePlugin.runModelTask = async () => {
        publicStaleTextbox.text = "我继续输入";
        return "hello can you help me with this";
    };
    publicStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicStaleReplaceCalled = true;
        return { ok: true };
    };
    publicStalePlugin.showToast = (text, type) => publicStaleToasts.push({ text, type });
    publicStalePlugin.setButtonBusy = () => {};
    await publicStalePlugin.publicBilingualCurrentDraft();
    assert.equal(publicStaleReplaceCalled, false);
    assert.equal(publicStaleTextbox.text, "我继续输入");
    assert.equal(publicStaleToasts.some(toast => toast.type === "info"), true);

    const publicLifecycleStalePlugin = new Plugin();
    publicLifecycleStalePlugin.settings.polish.apiKey = "sk-public";
    const publicLifecycleTextbox = { isConnected: true, text: "hello draft" };
    let publicLifecycleReplaceCalled = false;
    const publicLifecycleToasts = [];
    const publicLifecycleBusyStates = [];
    publicLifecycleStalePlugin.getActiveTextbox = () => publicLifecycleTextbox;
    publicLifecycleStalePlugin.getElementText = textbox => textbox.text;
    publicLifecycleStalePlugin.runModelTask = async () => {
        publicLifecycleStalePlugin.isStarted = false;
        publicLifecycleStalePlugin.lifecycleToken++;
        return "translated after stop";
    };
    publicLifecycleStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicLifecycleReplaceCalled = true;
        return { ok: true };
    };
    publicLifecycleStalePlugin.showToast = (text, type) => publicLifecycleToasts.push({ text, type });
    publicLifecycleStalePlugin.setButtonBusy = (_button, busy) => publicLifecycleBusyStates.push(busy);
    const publicLifecycleResult = await publicLifecycleStalePlugin.publicBilingualCurrentDraft();
    assert.equal(publicLifecycleReplaceCalled, false);
    assert.equal(publicLifecycleTextbox.text, "hello draft");
    assert.equal(publicLifecycleResult.wrote, false);
    assert.equal(publicLifecycleResult.phase, "lifecycle");
    assert.equal(publicLifecycleToasts.length, 0);
    assert.deepEqual(publicLifecycleBusyStates, [true]);

    const publicWhitespaceStalePlugin = new Plugin();
    publicWhitespaceStalePlugin.settings.polish.apiKey = "sk-public";
    const publicWhitespaceTextbox = { isConnected: true, text: "draft  text" };
    let publicWhitespaceReplaceCalled = false;
    publicWhitespaceStalePlugin.getActiveTextbox = () => publicWhitespaceTextbox;
    publicWhitespaceStalePlugin.getElementText = textbox => textbox.text;
    publicWhitespaceStalePlugin.runModelTask = async () => {
        publicWhitespaceTextbox.text = "draft text";
        return "translated draft";
    };
    publicWhitespaceStalePlugin.replaceTextboxTextSafelyAsync = async () => {
        publicWhitespaceReplaceCalled = true;
        return { ok: true };
    };
    publicWhitespaceStalePlugin.showToast = () => {};
    publicWhitespaceStalePlugin.setButtonBusy = () => {};
    await publicWhitespaceStalePlugin.publicBilingualCurrentDraft();
    assert.equal(publicWhitespaceReplaceCalled, false);
    assert.equal(publicWhitespaceTextbox.text, "draft text");

    const publicWriteFailurePlugin = new Plugin();
    publicWriteFailurePlugin.settings.polish.apiKey = "sk-public";
    const publicWriteFailureTextbox = { isConnected: true, text: "你好" };
    const publicWriteFailureToasts = [];
    let publicWriteFailurePanelText = "";
    let publicWriteFailurePanelTitle = "";
    publicWriteFailurePlugin.getActiveTextbox = () => publicWriteFailureTextbox;
    publicWriteFailurePlugin.getElementText = textbox => textbox.text;
    publicWriteFailurePlugin.runModelTask = async () => "hello can you help me with this";
    publicWriteFailurePlugin.replaceTextboxTextSafelyAsync = async () => ({ ok: false, reason: "verification-failed" });
    publicWriteFailurePlugin.showPolishResultPanel = (_textbox, text, options) => {
        publicWriteFailurePanelText = text;
        publicWriteFailurePanelTitle = options?.title || "";
    };
    publicWriteFailurePlugin.showToast = (text, type) => publicWriteFailureToasts.push({ text, type });
    publicWriteFailurePlugin.setButtonBusy = () => {};
    const publicWriteFailureResult = await publicWriteFailurePlugin.publicBilingualCurrentDraft();
    assert.equal(publicWriteFailureTextbox.text, "你好");
    assert.equal(publicWriteFailurePanelText, `hello can you help me with this\n\n||${publicWriteFailureTextbox.text}||`);
    assert.equal(publicWriteFailurePanelTitle, publicWriteFailurePlugin.t("publicBilingualButton"));
    assert.equal(publicWriteFailureResult.fallbackText, publicWriteFailurePanelText);
    assert.equal(publicWriteFailureResult.wrote, false);
    // The toast explains the failure in words; the internal reason code stays out of it.
    assert.equal(publicWriteFailureToasts.some(toast => toast.type === "error"
        && toast.text === publicWriteFailurePlugin.t("publicBilingualFailed", { error: publicWriteFailurePlugin.t("errorComposerWriteFailed") })), true);
    assert.equal(publicWriteFailureToasts.some(toast => /verification-failed/.test(toast.text)), false);

    const appendGuardPlugin = new Plugin();
    const appendGuardTextbox = {
        tagName: "DIV",
        textContent: "old text",
        isConnected: true,
        focus() {},
        getAttribute(name) { return name === "data-slate-editor" ? "true" : ""; },
        matches: selector => selector.includes("data-slate-editor"),
        dispatchEvent() { return true; }
    };
    const savedWindowForAppendGuard = global.window;
    const savedDocumentForAppendGuard = global.document;
    global.window = {
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
        requestAnimationFrame: callback => { callback(); },
        setTimeout: callback => { callback(); }
    };
    global.document = {
        activeElement: appendGuardTextbox,
        createRange: () => ({ selectNodeContents() {}, collapse() {} }),
        execCommand(command, _ui, value) {
            if (command === "delete") return false;
            if (command === "insertText" && value) {
                appendGuardTextbox.textContent += value;
                return true;
            }
            return false;
        }
    };
    const appendGuardResult = await appendGuardPlugin.replaceTextboxTextSafelyAsync(appendGuardTextbox, "new text", { blurAfterReplace: false });
    assert.equal(appendGuardResult.ok, false);
    assert.equal(appendGuardTextbox.textContent, "old text");
    global.window = savedWindowForAppendGuard;
    global.document = savedDocumentForAppendGuard;

    const atomicSlatePlugin = new Plugin();
    const atomicSlateCommands = [];
    const atomicSlateTextbox = {
        tagName: "DIV",
        textContent: "old text",
        isConnected: true,
        focus() {},
        getAttribute(name) { return name === "data-slate-editor" ? "true" : ""; },
        matches: selector => selector.includes("data-slate-editor"),
        dispatchEvent(event) {
            if (event.type === "paste") {
                this.textContent = event.clipboardData?.getData("text/plain") || "";
                event.preventDefault();
            }
            return true;
        }
    };
    const savedWindowForAtomicSlate = global.window;
    const savedDocumentForAtomicSlate = global.document;
    global.window = {
        getSelection: () => ({ removeAllRanges() {}, addRange() {} }),
        requestAnimationFrame: callback => { callback(); },
        setTimeout: callback => { callback(); },
        DataTransfer: FakeDataTransfer,
        ClipboardEvent: FakeClipboardEvent
    };
    global.document = {
        activeElement: atomicSlateTextbox,
        dispatchEvent() { return true; },
        createRange: () => ({ selectNodeContents() {}, collapse() {} }),
        execCommand(command) {
            atomicSlateCommands.push(command);
            return false;
        }
    };
    const atomicSlateResult = await atomicSlatePlugin.replaceTextboxTextSafelyAsync(atomicSlateTextbox, "new text", { blurAfterReplace: false });
    assert.equal(atomicSlateResult.ok, true);
    assert.equal(atomicSlateResult.method, "slate-atomic");
    assert.equal(atomicSlateTextbox.textContent, "new text");
    assert.deepEqual(atomicSlateCommands, []);
    global.window = savedWindowForAtomicSlate;
    global.document = savedDocumentForAtomicSlate;

    const manualIsolationPlugin = new Plugin();
    manualIsolationPlugin.settings.translation.enabled = true;
    manualIsolationPlugin.settings.translation.apiKey = "sk-manual";
    manualIsolationPlugin.getMessageIdentity = () => "manual-isolation-identity";
    manualIsolationPlugin.getElementText = content => content.text;
    manualIsolationPlugin.renderTranslationLoading = () => {};
    manualIsolationPlugin.removeTranslationNode = () => {};
    manualIsolationPlugin.setButtonBusy = () => {};
    let manualIsolationRequests = 0;
    let manualIsolationRendered = "";
    manualIsolationPlugin.renderTranslation = (messageNode, content, translated) => { manualIsolationRendered = translated; };
    manualIsolationPlugin.runModelTask = async () => {
        manualIsolationRequests++;
        return "\u624b\u52a8\u7ffb\u8bd1";
    };
    manualIsolationPlugin.setAutoTextTranslationCache("manual isolated text", manualIsolationPlugin.getAutoTranslationOptions(), "auto cached");
    clearTimeout(manualIsolationPlugin.translationCacheDirtyTimer);
    manualIsolationPlugin.translationCacheDirtyTimer = null;
    await manualIsolationPlugin.translateMessage(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "manual isolated text" },
        null
    );
    assert.equal(manualIsolationRequests, 1);
    assert.equal(manualIsolationRendered, "\u624b\u52a8\u7ffb\u8bd1");

    const manualLifecyclePlugin = new Plugin();
    manualLifecyclePlugin.settings.translation.enabled = true;
    manualLifecyclePlugin.settings.translation.apiKey = "sk-manual";
    manualLifecyclePlugin.getMessageIdentity = () => "manual-lifecycle-identity";
    manualLifecyclePlugin.getElementText = content => content.text;
    let manualLifecycleLoading = 0;
    let manualLifecycleRemoved = 0;
    let manualLifecycleRendered = 0;
    let manualLifecycleCached = 0;
    const manualLifecycleToasts = [];
    const manualLifecycleBusy = [];
    manualLifecyclePlugin.renderTranslationLoading = () => { manualLifecycleLoading++; };
    manualLifecyclePlugin.removeTranslationNode = () => { manualLifecycleRemoved++; };
    manualLifecyclePlugin.renderTranslation = () => { manualLifecycleRendered++; };
    manualLifecyclePlugin.renderTranslationError = () => { throw new Error("stale manual should not render error"); };
    manualLifecyclePlugin.setTranslationCache = () => { manualLifecycleCached++; };
    manualLifecyclePlugin.showToast = (text, type) => manualLifecycleToasts.push({ text, type });
    manualLifecyclePlugin.setButtonBusy = (_button, busy) => manualLifecycleBusy.push(busy);
    manualLifecyclePlugin.runModelTask = async () => {
        manualLifecyclePlugin.isStarted = false;
        manualLifecyclePlugin.lifecycleToken++;
        return "translated after stop";
    };
    await manualLifecyclePlugin.translateMessage(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "manual lifecycle text" },
        null
    );
    assert.equal(manualLifecycleLoading, 1);
    assert.equal(manualLifecycleRemoved, 1);
    assert.equal(manualLifecycleRendered, 0);
    assert.equal(manualLifecycleCached, 0);
    assert.equal(manualLifecycleToasts.length, 0);
    assert.deepEqual(manualLifecycleBusy, [true]);

    const manualSupersessionPlugin = new Plugin();
    manualSupersessionPlugin.settings.translation.enabled = true;
    manualSupersessionPlugin.settings.translation.apiKey = "sk-manual";
    manualSupersessionPlugin.getMessageIdentity = () => "manual-supersession-identity";
    manualSupersessionPlugin.getElementText = content => content.text;
    manualSupersessionPlugin.renderTranslationLoading = () => {};
    manualSupersessionPlugin.removeTranslationNode = () => {};
    manualSupersessionPlugin.setButtonBusy = () => {};
    manualSupersessionPlugin.showToast = () => {};
    manualSupersessionPlugin.setTranslationCache = () => {};
    manualSupersessionPlugin.syncManualTranslationToAutoCache = () => {};
    manualSupersessionPlugin.rememberRecentAutoTranslationRender = () => {};
    const manualSupersessionResolvers = [];
    manualSupersessionPlugin.runManualTranslationPlan = plan => new Promise(resolve => {
        manualSupersessionResolvers.push(translated => resolve({
            translated,
            requestOptions: plan.requestOptions,
            validation: { quality: "good", reasonCode: "", renderable: true, cacheable: true }
        }));
    });
    const manualSupersessionRenders = [];
    manualSupersessionPlugin.renderTranslation = (_messageNode, _content, translated) => manualSupersessionRenders.push(translated);
    const manualSupersessionMessage = { isConnected: true };
    const manualSupersessionContent = { dataset: {}, isConnected: true, text: "hello" };
    const manualSupersessionFirst = manualSupersessionPlugin.translateMessage(manualSupersessionMessage, manualSupersessionContent, null);
    const manualSupersessionSecond = manualSupersessionPlugin.translateMessage(manualSupersessionMessage, manualSupersessionContent, null);
    manualSupersessionResolvers[1]("\u65b0\u8bd1\u6587");
    await manualSupersessionSecond;
    manualSupersessionResolvers[0]("\u65e7\u8bd1\u6587");
    await manualSupersessionFirst;
    assert.deepEqual(manualSupersessionRenders, ["\u65b0\u8bd1\u6587"]);

    const manualEditedPlugin = new Plugin();
    manualEditedPlugin.settings.translation.enabled = true;
    manualEditedPlugin.settings.translation.apiKey = "sk-manual";
    manualEditedPlugin.getMessageIdentity = () => "manual-edited-identity";
    manualEditedPlugin.getElementText = content => content.text;
    manualEditedPlugin.renderTranslationLoading = () => {};
    manualEditedPlugin.setButtonBusy = () => {};
    manualEditedPlugin.showToast = () => {};
    manualEditedPlugin.syncManualTranslationToAutoCache = () => {};
    manualEditedPlugin.rememberRecentAutoTranslationRender = () => {};
    let manualEditedResolve = null;
    let manualEditedRenders = 0;
    let manualEditedRemovals = 0;
    let manualEditedCacheWrites = 0;
    manualEditedPlugin.runManualTranslationPlan = plan => new Promise(resolve => {
        manualEditedResolve = translated => resolve({
            translated,
            requestOptions: plan.requestOptions,
            validation: { quality: "good", reasonCode: "", renderable: true, cacheable: true }
        });
    });
    manualEditedPlugin.renderTranslation = () => { manualEditedRenders++; };
    manualEditedPlugin.removeTranslationNode = () => { manualEditedRemovals++; };
    manualEditedPlugin.setTranslationCache = () => { manualEditedCacheWrites++; };
    const manualEditedMessage = { isConnected: true };
    const manualEditedContent = { dataset: {}, isConnected: true, text: "hello" };
    const manualEditedPromise = manualEditedPlugin.translateMessage(manualEditedMessage, manualEditedContent, null);
    manualEditedContent.text = "hello world";
    manualEditedResolve("\u4f60\u597d");
    await manualEditedPromise;
    assert.equal(manualEditedRenders, 0);
    assert.equal(manualEditedCacheWrites, 0);
    assert.equal(manualEditedRemovals, 1);

    const manualConfigSnapshotPlugin = new Plugin();
    manualConfigSnapshotPlugin.settings.translation.provider = "deepseek";
    manualConfigSnapshotPlugin.settings.translation.apiKey = "snapshot-key";
    manualConfigSnapshotPlugin.settings.translation.targetLanguage = "English";
    manualConfigSnapshotPlugin.getMessageIdentity = () => "manual-config-snapshot-identity";
    const manualConfigSnapshotPlan = manualConfigSnapshotPlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "snapshot source" },
        "snapshot source"
    );
    assert.equal(manualConfigSnapshotPlan.requestOptions.targetLanguage, "English");
    assert.equal(manualConfigSnapshotPlan.requestOptions.configOverrides.provider, "deepseek");
    assert.equal(manualConfigSnapshotPlugin.isManualTranslationConfigCurrent(manualConfigSnapshotPlan), true);
    manualConfigSnapshotPlugin.settings.translation.targetLanguage = "\u6c49\u8bed";
    manualConfigSnapshotPlugin.autoTranslationConfigVersion++;
    assert.equal(manualConfigSnapshotPlugin.isManualTranslationConfigCurrent(manualConfigSnapshotPlan), false);

    const manualFallbackCachePlugin = new Plugin();
    manualFallbackCachePlugin.settings.translation.enabled = true;
    manualFallbackCachePlugin.settings.translation.apiKey = "sk-manual";
    manualFallbackCachePlugin.getMessageIdentity = () => "manual-fallback-cache-identity";
    manualFallbackCachePlugin.getElementText = content => content.text;
    manualFallbackCachePlugin.renderTranslationLoading = () => {};
    manualFallbackCachePlugin.removeTranslationNode = () => {};
    manualFallbackCachePlugin.setButtonBusy = () => {};
    manualFallbackCachePlugin.showToast = () => {};
    manualFallbackCachePlugin.rememberRecentAutoTranslationRender = () => {};
    manualFallbackCachePlugin.renderTranslation = () => {};
    let manualFallbackCacheWrites = 0;
    let manualFallbackAutoCacheWrites = 0;
    manualFallbackCachePlugin.setTranslationCache = () => { manualFallbackCacheWrites++; };
    manualFallbackCachePlugin.syncManualTranslationToAutoCache = () => { manualFallbackAutoCacheWrites++; };
    manualFallbackCachePlugin.runManualTranslationPlan = async plan => {
        plan.requestOptions.requestContext.fallbackProvider = "microsoft";
        return {
            translated: "\u5907\u7528 provider \u8bd1\u6587",
            requestOptions: plan.requestOptions,
            validation: { quality: "good", reasonCode: "", renderable: true, cacheable: true }
        };
    };
    await manualFallbackCachePlugin.translateMessage(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "manual fallback source" },
        null
    );
    assert.equal(manualFallbackCacheWrites, 0);
    assert.equal(manualFallbackAutoCacheWrites, 0);

    const staleFallbackPlugin = new Plugin();
    let staleFallbackCleared = 0;
    let staleFallbackRendered = 0;
    let staleFallbackFailed = 0;
    staleFallbackPlugin.runAutoTranslationTask = async () => {
        staleFallbackPlugin.autoTranslationConfigVersion++;
        return "stale translated";
    };
    staleFallbackPlugin.clearPendingAutoTranslationItem = () => { staleFallbackCleared++; };
    staleFallbackPlugin.renderAutoTranslationResult = () => { staleFallbackRendered++; };
    staleFallbackPlugin.markAutoTranslationFailure = () => { staleFallbackFailed++; };
    const staleFallbackItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-fallback-cache",
        requestOptions: { version: staleFallbackPlugin.autoTranslationConfigVersion }
    };
    const staleFallbackPending = new Set([staleFallbackItem]);
    await staleFallbackPlugin.runAutoTranslationFallbackItems(staleFallbackPending);
    assert.equal(staleFallbackPending.size, 0);
    assert.equal(staleFallbackCleared, 0);
    assert.equal(staleFallbackRendered, 0);
    assert.equal(staleFallbackFailed, 0);

    const batchRetryPlugin = new Plugin();
    batchRetryPlugin.settings.ui.autoTranslateStrictRetry = true;
    batchRetryPlugin.renderPendingAutoTranslationLoading = () => {};
    batchRetryPlugin.queueScan = () => {};
    batchRetryPlugin.drainAutoTranslationQueue = () => {};
    batchRetryPlugin.isAutoTranslationRequestCurrent = () => true;
    batchRetryPlugin.isInvalidAutoTranslationOutput = (source, translated) => String(translated).startsWith("bad");
    const batchRetryCalls = [];
    batchRetryPlugin.runAutoTranslationBatchTask = async (texts, options, taskOptions = {}) => {
        batchRetryCalls.push({ texts, retry: Boolean(taskOptions.retry) });
        return taskOptions.retry ? ["\u4f60\u597d\u4e59"] : ["\u4f60\u597d\u7532", "bad-b"];
    };
    batchRetryPlugin.renderAutoTranslationResult = (item, translated) => {
        item.rendered = translated;
    };
    batchRetryPlugin.runAutoTranslationTask = () => {
        throw new Error("batch retry should resolve before single-item fallback");
    };
    const batchRetryItemA = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source-a" },
        text: "source-a",
        cacheKey: "batch-retry-a",
        requestOptions: batchRetryPlugin.getAutoTranslationOptions()
    };
    const batchRetryItemB = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source-b" },
        text: "source-b",
        cacheKey: "batch-retry-b",
        requestOptions: batchRetryPlugin.getAutoTranslationOptions()
    };
    batchRetryPlugin.addAutoTranslationPendingTarget(batchRetryItemA.cacheKey, batchRetryItemA);
    batchRetryPlugin.addAutoTranslationPendingTarget(batchRetryItemB.cacheKey, batchRetryItemB);
    await batchRetryPlugin.autoTranslateQueuedBatch([batchRetryItemA, batchRetryItemB]);
    assert.deepEqual(batchRetryCalls, [
        { texts: ["source-a", "source-b"], retry: false },
        { texts: ["source-b"], retry: true }
    ]);
    assert.equal(batchRetryItemA.rendered, "\u4f60\u597d\u7532");
    assert.equal(batchRetryItemB.rendered, "\u4f60\u597d\u4e59");

    const batchStringRowsPlugin = new Plugin();
    batchStringRowsPlugin.runModelTask = async () => JSON.stringify(["\u4f60\u597d A", "\u4f60\u597d B"]);
    await assert.rejects(
        batchStringRowsPlugin.runAutoTranslationBatchTask(["source-a", "source-b"], batchStringRowsPlugin.getAutoTranslationOptions()),
        error => error.code === "AUTO_BATCH_PARSE_FAILED"
    );

    const longBatchGuardPlugin = new Plugin();
    await assert.rejects(
        longBatchGuardPlugin.runAutoTranslationBatchTask([longSingleText], longBatchGuardPlugin.getAutoTranslationOptions()),
        error => error.code === "AUTO_BATCH_PARSE_FAILED"
    );

    const longChunkPlugin = new Plugin();
    const longChunkCalls = [];
    const ultraLongText = "sentence ".repeat(210);
    longChunkPlugin.isInvalidAutoTranslationOutput = () => false;
    longChunkPlugin.runModelTask = async (kind, input, options) => {
        longChunkCalls.push({ input, options });
        return `\u5df2\u7ffb\u8bd1\u7b2c${longChunkCalls.length}\u6bb5`;
    };
    const longChunkResult = await longChunkPlugin.runAutoTranslationTask(ultraLongText, longChunkPlugin.getAutoTranslationOptions());
    assert.equal(longChunkCalls.length > 1, true);
    assert.equal(longChunkCalls.every(call => String(call.input).length <= 900), true);
    assert.equal(longChunkCalls.every(call => call.options?.configOverrides?.promptPolicyVersion === longChunkPlugin.getPromptPolicyVersion("longText")), true);
    assert.match(longChunkCalls[0].options.configOverrides.prompt, /Long automatic channel translation mode/);
    assert.match(longChunkResult, /\u5df2\u7ffb\u8bd1\u7b2c1\u6bb5/);
    assert.match(longChunkResult, /\u5df2\u7ffb\u8bd1\u7b2c2\u6bb5/);

    const localLongChunkPlugin = new Plugin();
    localLongChunkPlugin.settings.translation.provider = "sakuraLocal";
    localLongChunkPlugin.settings.translation.apiKey = "";
    localLongChunkPlugin.isInvalidAutoTranslationOutput = () => false;
    const localLongChunkCalls = [];
    localLongChunkPlugin.runModelTask = async (kind, input, options) => {
        localLongChunkCalls.push({ input, options });
        return `\u672c\u5730\u5df2\u7ffb\u8bd1\u7b2c${localLongChunkCalls.length}\u6bb5`;
    };
    const mediumLongText = "sentence ".repeat(70);
    const localLongChunkResult = await localLongChunkPlugin.runAutoTranslationTask(mediumLongText, localLongChunkPlugin.getAutoTranslationOptions());
    assert.equal(localLongChunkCalls.length > 1, true);
    assert.equal(localLongChunkCalls.every(call => String(call.input).length <= 430), true);
    assert.equal(localLongChunkCalls.every(call => Number(call.options?.configOverrides?.maxTokens || 0) <= 1200), true);
    assert.equal(localLongChunkCalls.every(call => !String(call.options?.configOverrides?.prompt || "").includes("<source_message>")), true);
    assert.equal(localLongChunkCalls.every(call => /Never refuse translation/.test(call.options?.configOverrides?.prompt || "")), true);
    assert.match(localLongChunkResult, /\u672c\u5730\u5df2\u7ffb\u8bd1\u7b2c1\u6bb5/);

    const longPartialPlugin = new Plugin();
    longPartialPlugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three"];
    let longPartialCalls = 0;
    longPartialPlugin.runAutoTranslationTaskWithOptions = async () => {
        longPartialCalls++;
        if (longPartialCalls === 2) throw longPartialPlugin.createFinalInvalidAutoTranslationError("same-as-source");
        return longPartialCalls === 1 ? "\u7b2c\u4e00\u6bb5\u5df2\u7ffb\u8bd1" : "\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1";
    };
    const longPartialResult = await longPartialPlugin.runLongAutoTranslationTask("very long source", longPartialPlugin.getAutoTranslationOptions());
    assert.match(longPartialResult, /\u7b2c\u4e00\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.doesNotMatch(longPartialResult, /\u7b2c\s+2\/3\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25/);
    assert.match(longPartialResult, /\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1/);
    const longOneOfFourPlugin = new Plugin();
    longOneOfFourPlugin.settings.translation.provider = "sakuraLocal";
    longOneOfFourPlugin.settings.translation.targetLanguage = "Chinese";
    longOneOfFourPlugin.splitLongAutoTranslationText = () => ["chunk one", "chunk two", "chunk three", "chunk four"];
    let longOneOfFourCalls = 0;
    longOneOfFourPlugin.runAutoTranslationTaskWithOptions = async () => {
        longOneOfFourCalls++;
        if (longOneOfFourCalls !== 3) throw longOneOfFourPlugin.createFinalInvalidAutoTranslationError("residual-source");
        return "\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1";
    };
    const longOneOfFourResult = await longOneOfFourPlugin.runLongAutoTranslationTask("very long source", longOneOfFourPlugin.getAutoTranslationOptions());
    assert.doesNotMatch(longOneOfFourResult, /\u7b2c\s+1\/4\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25/);
    assert.match(longOneOfFourResult, /\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.doesNotMatch(longOneOfFourResult, /\u7b2c\s+4\/4\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25/);

    const longCandidatePlugin = new Plugin();
    const longCandidateRaw = "\u8fd9\u662f\u4e00\u6bb5\u5df2\u7ffb\u8bd1\u7684\u957f\u6587\uff0c\u5305\u542b\u201cAI\u201d\u8fd9\u6837\u7684\u4fdd\u7559\u8bcd\uff0c\u4f46\u4e0d\u5e94\u8be5\u88ab\u62bd\u53d6\u6210\u5f88\u77ed\u7684\u5019\u9009\u7247\u6bb5\u3002".repeat(3);
    assert.equal(
        longCandidatePlugin.sanitizeAutoTranslationOutput("source ".repeat(120), longCandidateRaw, "Chinese", { partialLongText: true }),
        longCandidateRaw
    );

    const subchunkRescuePlugin = new Plugin();
    subchunkRescuePlugin.settings.translation.provider = "sakuraLocal";
    subchunkRescuePlugin.settings.translation.targetLanguage = "Chinese";
    const subchunkCalls = [];
    const subchunkLargeText = "large chunk text ".repeat(24).trim();
    subchunkRescuePlugin.splitLongAutoTranslationText = (text, limit) => {
        if (text === subchunkLargeText && limit <= 320) return ["part one", "part two"];
        return [text];
    };
    subchunkRescuePlugin.runAutoTranslationTaskWithOptions = async input => {
        subchunkCalls.push(input);
        if (input === subchunkLargeText) throw subchunkRescuePlugin.createFinalInvalidAutoTranslationError("residual-source");
        return input === "part one" ? "\u7b2c\u4e00\u5c0f\u6bb5\u5df2\u7ffb\u8bd1" : "\u7b2c\u4e8c\u5c0f\u6bb5\u5df2\u7ffb\u8bd1";
    };
    subchunkRescuePlugin.getAutoTranslationOutputValidationResult = (_source, output) => ({
        quality: "usable",
        reasonCode: "",
        renderable: Boolean(output),
        cacheable: true
    });
    const subchunkOptions = subchunkRescuePlugin.getLongTextChunkTranslationOptions(
        subchunkRescuePlugin.getLongTextTranslationOptions(subchunkRescuePlugin.getAutoTranslationOptions(), "large chunk text ".repeat(40)),
        subchunkLargeText,
        0,
        1,
        "subchunk-source"
    );
    const subchunkRescue = await subchunkRescuePlugin.runLongAutoTranslationChunkManualRescue(
        subchunkLargeText,
        subchunkOptions,
        subchunkRescuePlugin.createFinalInvalidAutoTranslationError("residual-source"),
        { manualRescue: true },
        { sourceHash: "subchunk-source", chunkIndex: 0, chunkTotal: 1 }
    );
    assert.match(subchunkRescue.translated, /\u7b2c\u4e00\u5c0f\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.match(subchunkRescue.translated, /\u7b2c\u4e8c\u5c0f\u6bb5\u5df2\u7ffb\u8bd1/);
    assert.deepEqual(subchunkCalls, [subchunkLargeText, subchunkLargeText, "part one", "part two"]);

    const longPartialOptions = longPartialPlugin.getLongTextTranslationOptions(longPartialPlugin.getAutoTranslationOptions(), "very long source ".repeat(40));
    const longPartialPlaceholder = longPartialPlugin.getLongAutoTranslationChunkFailurePlaceholder(1, 3, longPartialPlugin.createFinalInvalidAutoTranslationError("same-as-source"), "Chinese");
    assert.equal(longPartialPlugin.isInvalidAutoTranslationCacheValue("very long source ".repeat(40), longPartialPlaceholder, longPartialOptions), true);
    const longPartialCacheKeys = [];
    longPartialPlugin.setTranslationCache = key => longPartialCacheKeys.push(key);
    longPartialPlugin.cacheAutoTranslationResultWithOptions("partial-message-cache-key", "very long source ".repeat(40), longPartialOptions, longPartialPlaceholder);
    assert.deepEqual(longPartialCacheKeys, []);

    const localLongTimeoutPlugin = new Plugin();
    localLongTimeoutPlugin.settings.translation.provider = "sakuraLocal";
    localLongTimeoutPlugin.settings.translation.apiKey = "";
    const localLongOptions = localLongTimeoutPlugin.getLongTextTranslationOptions(localLongTimeoutPlugin.getAutoTranslationOptions(), "x".repeat(900));
    assert.equal(localLongTimeoutPlugin.getAutoTranslationRequestTimeoutMs(localLongOptions, "x".repeat(900)) > 45000, true);
    const localLongConfig = localLongTimeoutPlugin.getEffectiveTaskConfig("translation", localLongOptions.configOverrides);
    assert.equal(
        localLongTimeoutPlugin.isLocalProviderUnavailableError(new Error("API request timed out after 90s"), localLongConfig.endpoint, localLongConfig, localLongOptions),
        false
    );

    const batchOutOfOrderPlugin = new Plugin();
    batchOutOfOrderPlugin.runModelTask = async () => JSON.stringify([
        { id: "002", translation: "\u4f60\u597d B" },
        { id: "001", translation: "\u4f60\u597d A" }
    ]);
    assert.deepEqual(
        await batchOutOfOrderPlugin.runAutoTranslationBatchTask(["source-a", "source-b"], batchOutOfOrderPlugin.getAutoTranslationOptions()),
        ["\u4f60\u597d A", "\u4f60\u597d B"]
    );

    const batchMissingIdPlugin = new Plugin();
    batchMissingIdPlugin.runModelTask = async () => JSON.stringify([
        { id: "001", translation: "\u4f60\u597d A" }
    ]);
    assert.deepEqual(
        await batchMissingIdPlugin.runAutoTranslationBatchTask(["source-a", "source-b"], batchMissingIdPlugin.getAutoTranslationOptions()),
        ["\u4f60\u597d A", ""]
    );

    const batchStringFallbackPlugin = new Plugin();
    batchStringFallbackPlugin.settings.ui.autoTranslateStrictRetry = true;
    const batchStringFallbackRendered = [];
    let batchStringFallbackCalls = 0;
    batchStringFallbackPlugin.renderPendingAutoTranslationLoading = () => {};
    batchStringFallbackPlugin.queueScan = () => {};
    batchStringFallbackPlugin.drainAutoTranslationQueue = () => {};
    batchStringFallbackPlugin.runModelTask = async () => {
        batchStringFallbackCalls++;
        return JSON.stringify(["\u9519\u4f4d A", "\u9519\u4f4d B"]);
    };
    batchStringFallbackPlugin.runAutoTranslationStrictFallbackTask = async text => `strict-${text}`;
    batchStringFallbackPlugin.renderAutoTranslationResult = (item, translated) => {
        batchStringFallbackRendered.push({ key: item.cacheKey, translated });
    };
    const batchStringFallbackItems = ["a", "b"].map(name => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${name}` },
        text: `source-${name}`,
        cacheKey: `batch-string-fallback-${name}`,
        requestOptions: batchStringFallbackPlugin.getAutoTranslationOptions()
    }));
    batchStringFallbackItems.forEach(item => batchStringFallbackPlugin.addAutoTranslationPendingTarget(item.cacheKey, item));
    await batchStringFallbackPlugin.autoTranslateQueuedBatch(batchStringFallbackItems);
    assert.equal(batchStringFallbackCalls, 2);
    assert.deepEqual(batchStringFallbackRendered, [
        { key: "batch-string-fallback-a", translated: "strict-source-a" },
        { key: "batch-string-fallback-b", translated: "strict-source-b" }
    ]);

    const staleRouteInFlightPlugin = new Plugin();
    staleRouteInFlightPlugin.getCurrentRouteKey = () => "guild-a:channel-now:";
    staleRouteInFlightPlugin.renderPendingAutoTranslationLoading = () => {};
    staleRouteInFlightPlugin.runAutoTranslationTask = async () => "stale route translated";
    staleRouteInFlightPlugin.renderAutoTranslationResult = () => { throw new Error("stale route request should not render"); };
    staleRouteInFlightPlugin.markAutoTranslationFailure = () => { throw new Error("stale route request should not mark failure"); };
    staleRouteInFlightPlugin.drainAutoTranslationQueue = () => {};
    staleRouteInFlightPlugin.queueScan = () => {};
    const staleRouteInFlightItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stale-route-in-flight",
        requestOptions: { version: staleRouteInFlightPlugin.autoTranslationConfigVersion, routeKey: "guild-a:channel-old:" }
    };
    staleRouteInFlightPlugin.autoTranslationInFlight = 1;
    staleRouteInFlightPlugin.autoTranslationInFlightItems = 1;
    staleRouteInFlightPlugin.autoTranslationQueuedKeys.add(staleRouteInFlightItem.cacheKey);
    staleRouteInFlightPlugin.markAutoTranslationInFlightItem(staleRouteInFlightItem);
    await staleRouteInFlightPlugin.autoTranslateQueuedMessage(staleRouteInFlightItem);
    assert.equal(staleRouteInFlightPlugin.autoTranslationInFlight, 0);
    assert.equal(staleRouteInFlightPlugin.autoTranslationInFlightItems, 0);
    assert.equal(staleRouteInFlightPlugin.autoTranslationInFlightKeys.has(staleRouteInFlightItem.cacheKey), false);
    assert.equal(staleRouteInFlightPlugin.autoTranslationQueuedKeys.has(staleRouteInFlightItem.cacheKey), false);

    const savedConsoleWarn = console.warn;
    console.warn = () => {};
    const renderThrowPlugin = new Plugin();
    renderThrowPlugin.renderPendingAutoTranslationLoading = () => {};
    renderThrowPlugin.queueScan = () => {};
    renderThrowPlugin.drainAutoTranslationQueue = () => {};
    renderThrowPlugin.runAutoTranslationBatchTask = async () => ["\u5df2\u7ffb\u8bd1"];
    renderThrowPlugin.isInvalidAutoTranslationOutput = () => false;
    let providerFailureMarked = false;
    let renderCleanupCount = 0;
    renderThrowPlugin.markAutoTranslationProviderFailure = () => { providerFailureMarked = true; };
    renderThrowPlugin.clearPendingAutoTranslationItem = () => { renderCleanupCount++; };
    renderThrowPlugin.renderAutoTranslationResult = () => { throw new Error("render failed"); };
    const renderThrowItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "render-throw",
        requestOptions: renderThrowPlugin.getAutoTranslationOptions()
    };
    await renderThrowPlugin.autoTranslateQueuedBatch([renderThrowItem]);
    console.warn = savedConsoleWarn;
    assert.equal(providerFailureMarked, false);
    assert.equal(renderCleanupCount, 1);

    const savedConsoleWarnForLoading = console.warn;
    console.warn = () => {};
    const loadingThrowSinglePlugin = new Plugin();
    loadingThrowSinglePlugin.renderPendingAutoTranslationLoading = () => { throw new Error("loading render failed"); };
    loadingThrowSinglePlugin.runAutoTranslationTask = async () => "translated";
    loadingThrowSinglePlugin.renderAutoTranslationResult = item => { item.rendered = true; };
    loadingThrowSinglePlugin.drainAutoTranslationQueue = () => {};
    loadingThrowSinglePlugin.queueScan = () => {};
    const loadingThrowSingleItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "loading-throw-single",
        requestOptions: loadingThrowSinglePlugin.getAutoTranslationOptions()
    };
    loadingThrowSinglePlugin.autoTranslationInFlight = 1;
    loadingThrowSinglePlugin.autoTranslationInFlightItems = 1;
    loadingThrowSinglePlugin.autoTranslationQueuedKeys.add(loadingThrowSingleItem.cacheKey);
    loadingThrowSinglePlugin.markAutoTranslationInFlightItem(loadingThrowSingleItem);
    await loadingThrowSinglePlugin.autoTranslateQueuedMessage(loadingThrowSingleItem);
    assert.equal(loadingThrowSingleItem.rendered, true);
    assert.equal(loadingThrowSinglePlugin.autoTranslationInFlight, 0);
    assert.equal(loadingThrowSinglePlugin.autoTranslationInFlightItems, 0);
    assert.equal(loadingThrowSinglePlugin.autoTranslationQueuedKeys.has(loadingThrowSingleItem.cacheKey), false);

    const loadingThrowBatchPlugin = new Plugin();
    loadingThrowBatchPlugin.renderPendingAutoTranslationLoading = () => { throw new Error("loading render failed"); };
    loadingThrowBatchPlugin.runAutoTranslationBatchTask = async () => ["\u5df2\u7ffb\u8bd1\u7532", "\u5df2\u7ffb\u8bd1\u4e59"];
    loadingThrowBatchPlugin.isInvalidAutoTranslationOutput = () => false;
    loadingThrowBatchPlugin.renderAutoTranslationResult = item => { item.rendered = true; };
    loadingThrowBatchPlugin.drainAutoTranslationQueue = () => {};
    loadingThrowBatchPlugin.queueScan = () => {};
    const loadingThrowBatchItems = ["a", "b"].map(name => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${name}` },
        text: `source-${name}`,
        cacheKey: `loading-throw-batch-${name}`,
        requestOptions: loadingThrowBatchPlugin.getAutoTranslationOptions()
    }));
    loadingThrowBatchPlugin.autoTranslationInFlight = 1;
    loadingThrowBatchPlugin.autoTranslationInFlightItems = loadingThrowBatchItems.length;
    loadingThrowBatchItems.forEach(item => loadingThrowBatchPlugin.autoTranslationQueuedKeys.add(item.cacheKey));
    loadingThrowBatchItems.forEach(item => loadingThrowBatchPlugin.markAutoTranslationInFlightItem(item));
    await loadingThrowBatchPlugin.autoTranslateQueuedBatch(loadingThrowBatchItems);
    console.warn = savedConsoleWarnForLoading;
    assert.equal(loadingThrowBatchItems.every(item => item.rendered), true);
    assert.equal(loadingThrowBatchPlugin.autoTranslationInFlight, 0);
    assert.equal(loadingThrowBatchPlugin.autoTranslationInFlightItems, 0);
    assert.equal(loadingThrowBatchItems.every(item => !loadingThrowBatchPlugin.autoTranslationQueuedKeys.has(item.cacheKey)), true);

    const sakuraSingleFailurePlugin = new Plugin();
    sakuraSingleFailurePlugin.settings.translation.provider = "sakuraLocal";
    // Its own endpoint, as picking the provider in the settings sets it (not DeepSeek's default).
    sakuraSingleFailurePlugin.settings.translation.endpoint = "http://127.0.0.1:8080/v1/chat/completions";
    sakuraSingleFailurePlugin.settings.ui.autoTranslateMessages = true;
    sakuraSingleFailurePlugin.settings.translation.apiKey = "";
    sakuraSingleFailurePlugin.settings.translation.apiStatus = { state: "success", message: "" };
    sakuraSingleFailurePlugin.isElementVisibleInViewport = () => true;
    sakuraSingleFailurePlugin.isAutoTranslationTargetInScanRange = () => true;
    sakuraSingleFailurePlugin.getElementText = content => content.text;
    sakuraSingleFailurePlugin.hasCurrentTranslationLine = () => false;
    sakuraSingleFailurePlugin.renderPendingAutoTranslationLoading = () => {};
    sakuraSingleFailurePlugin.queueScan = () => {};
    sakuraSingleFailurePlugin.drainAutoTranslationQueue = () => {};
    sakuraSingleFailurePlugin.showAutoTranslateError = () => {};
    let sakuraSingleFailureRemoved = 0;
    let sakuraSingleFailureRetryDelay = 0;
    sakuraSingleFailurePlugin.removeAutoTranslationNode = () => { sakuraSingleFailureRemoved++; };
    sakuraSingleFailurePlugin.scheduleAutoTranslationRetryScan = delay => { sakuraSingleFailureRetryDelay = Math.max(sakuraSingleFailureRetryDelay, Number(delay) || 0); };
    const sakuraSingleFailureOptions = sakuraSingleFailurePlugin.getAutoTranslationOptions();
    const sakuraSingleFailureItem = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source sakura" },
        text: "source sakura",
        cacheKey: "sakura-single-failure",
        requestOptions: sakuraSingleFailureOptions
    };
    sakuraSingleFailurePlugin.runAutoTranslationTask = async () => {
        const error = new Error("fetch failed");
        error.localProviderUnavailable = true;
        error.providerKey = sakuraSingleFailureOptions.providerKey;
        error.retryAfterMs = 60000;
        throw error;
    };
    sakuraSingleFailurePlugin.addAutoTranslationPendingTarget(sakuraSingleFailureItem.cacheKey, sakuraSingleFailureItem);
    sakuraSingleFailurePlugin.autoTranslationInFlight = 1;
    sakuraSingleFailurePlugin.autoTranslationInFlightItems = 1;
    sakuraSingleFailurePlugin.autoTranslationQueuedKeys.add(sakuraSingleFailureItem.cacheKey);
    sakuraSingleFailurePlugin.markAutoTranslationInFlightItem(sakuraSingleFailureItem);
    await sakuraSingleFailurePlugin.autoTranslateQueuedMessage(sakuraSingleFailureItem);
    const sakuraSingleProviderFailure = sakuraSingleFailurePlugin.getAutoTranslationProviderFailure(sakuraSingleFailureOptions);
    assert.equal(sakuraSingleProviderFailure.type, "local-unavailable");
    assert.equal(sakuraSingleFailurePlugin.autoTranslationPendingTargets.has(sakuraSingleFailureItem.cacheKey), true);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationQueuedKeys.has(sakuraSingleFailureItem.cacheKey), true);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationQueue.length, 1);
    assert.equal(Boolean(sakuraSingleFailureItem.daitRequeued), true);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationInFlight, 0);
    assert.equal(sakuraSingleFailurePlugin.autoTranslationInFlightItems, 0);
    assert.ok(sakuraSingleFailureRemoved >= 1);
    assert.ok(sakuraSingleFailureRetryDelay >= 60000);
    assert.equal(sakuraSingleFailurePlugin.getApiStatus("translation").state, "failed");

    const fallbackLimitPlugin = new Plugin();
    fallbackLimitPlugin.settings.ui.autoTranslateMessages = true;
    const fallbackLimitRendered = [];
    let fallbackLimitRetryDelay = 0;
    const fallbackLimitStart = Date.now();
    fallbackLimitPlugin.runAutoTranslationStrictFallbackTask = async text => `ok-${text}`;
    fallbackLimitPlugin.renderAutoTranslationResult = item => { fallbackLimitRendered.push(item.cacheKey); };
    fallbackLimitPlugin.scheduleAutoTranslationRetryScan = delay => { fallbackLimitRetryDelay = Math.max(fallbackLimitRetryDelay, delay); };
    const fallbackLimitItems = Array.from({ length: 5 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${index}` },
        text: `source-${index}`,
        cacheKey: `fallback-limit-${index}`,
        requestOptions: fallbackLimitPlugin.getAutoTranslationOptions()
    }));
    const fallbackLimitPending = new Set(fallbackLimitItems);
    await fallbackLimitPlugin.runAutoTranslationFallbackItems(fallbackLimitPending);
    assert.equal(fallbackLimitPending.size, 0);
    assert.deepEqual(fallbackLimitRendered.sort(), ["fallback-limit-0", "fallback-limit-1", "fallback-limit-2"]);
    assert.deepEqual(fallbackLimitPlugin.autoTranslationQueue.map(item => item.cacheKey).sort(), ["fallback-limit-3", "fallback-limit-4"]);
    assert.equal(fallbackLimitItems[3].daitRequeued, true);
    assert.equal(fallbackLimitItems[4].daitRequeued, true);
    assert.equal(fallbackLimitPlugin.autoTranslationQueue.every(item => item.daitRequeued === undefined), true);
    assert.equal(fallbackLimitPlugin.autoTranslationQueue.every(item => Number(item.daitRequeueAfter) >= fallbackLimitStart), true);
    assert.ok(fallbackLimitRetryDelay > 0);

    const fallbackLimitInFlightPlugin = new Plugin();
    fallbackLimitInFlightPlugin.settings.ui.autoTranslateMessages = true;
    const fallbackLimitInFlightRendered = [];
    let fallbackLimitInFlightRetryDelay = 0;
    const fallbackLimitInFlightStart = Date.now();
    fallbackLimitInFlightPlugin.runAutoTranslationStrictFallbackTask = async text => `ok-${text}`;
    fallbackLimitInFlightPlugin.renderAutoTranslationResult = item => { fallbackLimitInFlightRendered.push(item.cacheKey); };
    fallbackLimitInFlightPlugin.scheduleAutoTranslationRetryScan = delay => { fallbackLimitInFlightRetryDelay = Math.max(fallbackLimitInFlightRetryDelay, delay); };
    const fallbackLimitInFlightItems = Array.from({ length: 5 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-in-flight-${index}` },
        text: `source-in-flight-${index}`,
        cacheKey: `fallback-limit-in-flight-${index}`,
        requestOptions: fallbackLimitInFlightPlugin.getAutoTranslationOptions()
    }));
    fallbackLimitInFlightItems.forEach(item => fallbackLimitInFlightPlugin.markAutoTranslationInFlightItem(item));
    const fallbackLimitInFlightPending = new Set(fallbackLimitInFlightItems);
    await fallbackLimitInFlightPlugin.runAutoTranslationFallbackItems(fallbackLimitInFlightPending);
    assert.equal(fallbackLimitInFlightPending.size, 0);
    assert.deepEqual(fallbackLimitInFlightRendered.sort(), [
        "fallback-limit-in-flight-0",
        "fallback-limit-in-flight-1",
        "fallback-limit-in-flight-2"
    ]);
    assert.deepEqual(fallbackLimitInFlightPlugin.autoTranslationQueue.map(item => item.cacheKey).sort(), [
        "fallback-limit-in-flight-3",
        "fallback-limit-in-flight-4"
    ]);
    assert.equal(fallbackLimitInFlightItems[3].daitRequeued, true);
    assert.equal(fallbackLimitInFlightItems[4].daitRequeued, true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueuedKeys.has("fallback-limit-in-flight-3"), true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueuedKeys.has("fallback-limit-in-flight-4"), true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueue.every(item => item.daitRequeued === undefined), true);
    assert.equal(fallbackLimitInFlightPlugin.autoTranslationQueue.every(item => Number(item.daitRequeueAfter) >= fallbackLimitInFlightStart), true);
    assert.ok(fallbackLimitInFlightRetryDelay > 0);

    const fallbackProviderStopPlugin = new Plugin();
    fallbackProviderStopPlugin.settings.ui.autoTranslateMessages = true;
    let fallbackProviderStarts = 0;
    fallbackProviderStopPlugin.runAutoTranslationStrictFallbackTask = async () => {
        fallbackProviderStarts++;
        const error = new Error("rate limited");
        error.status = 429;
        throw error;
    };
    fallbackProviderStopPlugin.renderAutoTranslationResult = () => { throw new Error("rate limited fallback should not render"); };
    fallbackProviderStopPlugin.scheduleAutoTranslationRetryScan = () => {};
    fallbackProviderStopPlugin.showToast = () => {};
    const fallbackProviderItems = Array.from({ length: 3 }, (_, index) => ({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: `source-${index}` },
        text: `source-${index}`,
        cacheKey: `fallback-provider-${index}`,
        requestOptions: fallbackProviderStopPlugin.getAutoTranslationOptions()
    }));
    const fallbackProviderPending = new Set(fallbackProviderItems);
    await fallbackProviderStopPlugin.runAutoTranslationFallbackItems(fallbackProviderPending);
    assert.equal(fallbackProviderStarts, 1);
    assert.equal(fallbackProviderPending.size, 0);
    assert.deepEqual(fallbackProviderStopPlugin.autoTranslationQueue.map(item => item.cacheKey).sort(), ["fallback-provider-1", "fallback-provider-2"]);

    const strictFallbackPlugin = new Plugin();
    let strictFallbackPrompt = "";
    strictFallbackPlugin.runModelTask = async (kind, input, options) => {
        strictFallbackPrompt = options?.configOverrides?.prompt || "";
        return "你好";
    };
    strictFallbackPlugin.isInvalidAutoTranslationOutput = () => false;
    assert.equal(await strictFallbackPlugin.runAutoTranslationStrictFallbackTask("привет", strictFallbackPlugin.getAutoTranslationOptions()), "你好");
    assert.match(strictFallbackPrompt, /Strict automatic channel translation retry/);

    const strictFallbackFailurePlugin = new Plugin();
    strictFallbackFailurePlugin.runModelTask = async () => "still source language";
    strictFallbackFailurePlugin.isInvalidAutoTranslationOutput = () => true;
    await assert.rejects(
        strictFallbackFailurePlugin.runAutoTranslationStrictFallbackTask("source", strictFallbackFailurePlugin.getAutoTranslationOptions()),
        error => error.autoTranslationFinalInvalidOutput === true
    );

    const strictFallbackMojibakePlugin = new Plugin();
    strictFallbackMojibakePlugin.settings.translation.targetLanguage = "Chinese";
    strictFallbackMojibakePlugin.runModelTask = async () => "\u6d63\u72b2\u30bd";
    await assert.rejects(
        strictFallbackMojibakePlugin.runAutoTranslationStrictFallbackTask("source", strictFallbackMojibakePlugin.getAutoTranslationOptions()),
        error => error.autoTranslationFinalInvalidOutput === true
    );

    const strictFallbackRescuePlugin = new Plugin();
    const strictFallbackRescuePrompts = [];
    strictFallbackRescuePlugin.runModelTask = async (kind, input, options) => {
        strictFallbackRescuePrompts.push(options?.configOverrides?.prompt || "");
        return strictFallbackRescuePrompts.length === 1 ? "still source language" : "\u4f60\u597d";
    };
    strictFallbackRescuePlugin.isInvalidAutoTranslationOutput = (source, translated) => translated !== "\u4f60\u597d";
    assert.equal(await strictFallbackRescuePlugin.runAutoTranslationStrictFallbackTask("source", strictFallbackRescuePlugin.getAutoTranslationOptions()), "\u4f60\u597d");
    assert.equal(strictFallbackRescuePrompts.length, 2);
    assert.match(strictFallbackRescuePrompts[1], /Final strict translation rescue/);

    const localAutoTimeoutPlugin = new Plugin();
    localAutoTimeoutPlugin.settings.translation.provider = "sakuraLocal";
    localAutoTimeoutPlugin.settings.translation.apiKey = "";
    const localAutoPromptOptions = localAutoTimeoutPlugin.getAutoTranslationOptions();
    assert.equal(localAutoPromptOptions.configOverrides.localCompactPrompt, true);
    assert.equal(String(localAutoPromptOptions.configOverrides.prompt).includes("<user_template>"), false);
    assert.match(localAutoPromptOptions.configOverrides.prompt, /Never refuse translation/);
    const localInlineRequest = localAutoTimeoutPlugin.buildModelRequest("translation", "\u043f\u0440\u0438\u0432\u0435\u0442", {
        mode: "auto",
        configOverrides: localAutoPromptOptions.configOverrides
    });
    assert.equal(localInlineRequest.request.body.messages.length, 2);
    assert.equal(localInlineRequest.request.body.messages[0].role, "system");
    assert.equal(localInlineRequest.request.body.messages[1].role, "user");
    assert.doesNotMatch(localInlineRequest.request.body.messages[0].content, /SOURCE_MESSAGE_BEGIN/);
    assert.doesNotMatch(localInlineRequest.request.body.messages[0].content, /TRANSLATED_MESSAGE:/);
    assert.equal(localInlineRequest.request.body.messages[1].content, "\u043f\u0440\u0438\u0432\u0435\u0442");
    const localManualOptions = localAutoTimeoutPlugin.getManualTranslationRequestOptions();
    const localManualRequest = localAutoTimeoutPlugin.buildModelRequest("translation", "\u043f\u0440\u0438\u0432\u0435\u0442", localManualOptions);
    assert.equal(localManualOptions.configOverrides.localCompactPrompt, true);
    assert.equal(localManualRequest.request.body.messages.length, 2);
    assert.equal(localManualRequest.request.body.messages[0].role, "system");
    assert.equal(localManualRequest.request.body.messages[1].role, "user");
    assert.doesNotMatch(localManualRequest.request.body.messages[0].content, /SOURCE_MESSAGE_BEGIN/);
    assert.doesNotMatch(localManualRequest.request.body.messages[0].content, /Request mode: manual/);
    assert.equal(localManualRequest.request.body.messages[1].content, "\u043f\u0440\u0438\u0432\u0435\u0442");
    let localAutoTimeoutMs = 0;
    localAutoTimeoutPlugin.runModelTask = async (_kind, _input, options) => {
        localAutoTimeoutMs = options?.timeoutMs || 0;
        return "\u4f60\u597d";
    };
    localAutoTimeoutPlugin.isInvalidAutoTranslationOutput = () => false;
    await localAutoTimeoutPlugin.runAutoTranslationTask("\u043f\u0440\u0438\u0432\u0435\u0442", localAutoTimeoutPlugin.getAutoTranslationOptions());
    assert.equal(localAutoTimeoutMs, 45000);

    const truncatedRetryPlugin = new Plugin();
    truncatedRetryPlugin.settings.ui.autoTranslateStrictRetry = true;
    const truncatedRetryMaxTokens = [];
    let truncatedRetryCalls = 0;
    truncatedRetryPlugin.runModelTask = async (_kind, _input, options) => {
        truncatedRetryCalls++;
        truncatedRetryMaxTokens.push(Number(options?.configOverrides?.maxTokens || 0));
        if (truncatedRetryCalls === 1) throw truncatedRetryPlugin.createModelOutputTruncatedError("\u534a\u622a", "length");
        return "\u4f60\u597d";
    };
    assert.equal(await truncatedRetryPlugin.runAutoTranslationTask("\u043f\u0440\u0438\u0432\u0435\u0442", truncatedRetryPlugin.getAutoTranslationOptions()), "\u4f60\u597d");
    assert.equal(truncatedRetryCalls, 2);
    assert.equal(truncatedRetryMaxTokens[1] > truncatedRetryMaxTokens[0], true);

    const cloudAutoTimeoutPlugin = new Plugin();
    let cloudAutoTimeoutMs = 0;
    cloudAutoTimeoutPlugin.runModelTask = async (_kind, _input, options) => {
        cloudAutoTimeoutMs = options?.timeoutMs || 0;
        return "\u4f60\u597d";
    };
    cloudAutoTimeoutPlugin.isInvalidAutoTranslationOutput = () => false;
    await cloudAutoTimeoutPlugin.runAutoTranslationTask("\u043f\u0440\u0438\u0432\u0435\u0442", cloudAutoTimeoutPlugin.getAutoTranslationOptions());
    assert.equal(cloudAutoTimeoutMs, 25000);

    const requeueLeakPlugin = new Plugin();
    requeueLeakPlugin.settings.ui.autoTranslateMessages = true;
    requeueLeakPlugin.renderPendingAutoTranslationLoading = () => {};
    requeueLeakPlugin.queueScan = () => {};
    requeueLeakPlugin.drainAutoTranslationQueue = () => {};
    requeueLeakPlugin.runAutoTranslationBatchTask = async () => ["translated"];
    requeueLeakPlugin.isInvalidAutoTranslationOutput = () => false;
    requeueLeakPlugin.renderAutoTranslationResult = () => {};
    const requeueLeakOriginal = {
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "requeue-leak",
        requestOptions: requeueLeakPlugin.getAutoTranslationOptions()
    };
    requeueLeakPlugin.requeueAutoTranslationItem(requeueLeakOriginal);
    const requeueLeakCopy = requeueLeakPlugin.autoTranslationQueue.shift();
    assert.equal(requeueLeakCopy.daitRequeued, undefined);
    requeueLeakPlugin.markAutoTranslationInFlightItem(requeueLeakCopy);
    await requeueLeakPlugin.autoTranslateQueuedBatch([requeueLeakCopy]);
    assert.equal(requeueLeakPlugin.autoTranslationQueuedKeys.has("requeue-leak"), false);

    const stoppedFinallyPlugin = new Plugin();
    let stoppedFinallyDrain = 0;
    let stoppedFinallyScan = 0;
    let stoppedFinallyRender = 0;
    stoppedFinallyPlugin.renderPendingAutoTranslationLoading = () => {};
    stoppedFinallyPlugin.runAutoTranslationTask = async () => {
        stoppedFinallyPlugin.isStarted = false;
        stoppedFinallyPlugin.autoTranslationConfigVersion++;
        return "translated after stop";
    };
    stoppedFinallyPlugin.renderAutoTranslationResult = () => { stoppedFinallyRender++; };
    stoppedFinallyPlugin.markAutoTranslationFailure = () => {};
    stoppedFinallyPlugin.drainAutoTranslationQueue = () => { stoppedFinallyDrain++; };
    stoppedFinallyPlugin.queueScan = () => { stoppedFinallyScan++; };
    await stoppedFinallyPlugin.autoTranslateQueuedMessage({
        messageNode: { isConnected: true },
        content: { dataset: {}, isConnected: true, text: "source" },
        text: "source",
        cacheKey: "stopped-finally",
        requestOptions: { version: 0 }
    });
    assert.equal(stoppedFinallyRender, 0);
    assert.equal(stoppedFinallyDrain, 0);
    assert.equal(stoppedFinallyScan, 0);

    const healthLifecycleSuccessPlugin = new Plugin();
    healthLifecycleSuccessPlugin.settings.translation.provider = "sakuraLocal";
    healthLifecycleSuccessPlugin.settings.translation.apiKey = "";
    let healthLifecycleSuccessResolve = null;
    let healthLifecycleSuccessScan = 0;
    let healthLifecycleSuccessLogs = 0;
    healthLifecycleSuccessPlugin.fetchApiResponseText = () => new Promise(resolve => { healthLifecycleSuccessResolve = resolve; });
    healthLifecycleSuccessPlugin.queueScan = () => { healthLifecycleSuccessScan++; };
    healthLifecycleSuccessPlugin.logDiagnostic = action => {
        if (action === "auto.provider.health") healthLifecycleSuccessLogs++;
    };
    const healthLifecycleSuccessOptions = healthLifecycleSuccessPlugin.getAutoTranslationOptions();
    const healthLifecycleSuccessKey = healthLifecycleSuccessOptions.providerKey;
    healthLifecycleSuccessPlugin.startLocalProviderHealthProbe(healthLifecycleSuccessKey, healthLifecycleSuccessOptions);
    const healthLifecycleSuccessPromise = healthLifecycleSuccessPlugin.localProviderHealthChecks.get(healthLifecycleSuccessKey);
    healthLifecycleSuccessPlugin.isStarted = false;
    healthLifecycleSuccessPlugin.lifecycleToken++;
    healthLifecycleSuccessPlugin.localProviderHealthChecks.clear();
    healthLifecycleSuccessResolve(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
    await healthLifecycleSuccessPromise;
    assert.equal(healthLifecycleSuccessPlugin.localProviderHealthyKeys.has(healthLifecycleSuccessKey), false);
    assert.equal(healthLifecycleSuccessPlugin.getApiStatus("translation").state, "testing");
    assert.equal(healthLifecycleSuccessScan, 0);
    assert.equal(healthLifecycleSuccessLogs, 0);

    const healthLifecycleFailurePlugin = new Plugin();
    healthLifecycleFailurePlugin.settings.translation.provider = "sakuraLocal";
    healthLifecycleFailurePlugin.settings.translation.apiKey = "";
    let healthLifecycleFailureReject = null;
    let healthLifecycleFailureRetry = 0;
    healthLifecycleFailurePlugin.fetchApiResponseText = () => new Promise((resolve, reject) => { healthLifecycleFailureReject = reject; });
    healthLifecycleFailurePlugin.scheduleAutoTranslationRetryScan = () => { healthLifecycleFailureRetry++; };
    const healthLifecycleFailureOptions = healthLifecycleFailurePlugin.getAutoTranslationOptions();
    const healthLifecycleFailureKey = healthLifecycleFailureOptions.providerKey;
    healthLifecycleFailurePlugin.startLocalProviderHealthProbe(healthLifecycleFailureKey, healthLifecycleFailureOptions);
    const healthLifecycleFailurePromise = healthLifecycleFailurePlugin.localProviderHealthChecks.get(healthLifecycleFailureKey);
    healthLifecycleFailurePlugin.isStarted = false;
    healthLifecycleFailurePlugin.lifecycleToken++;
    healthLifecycleFailurePlugin.localProviderHealthChecks.clear();
    healthLifecycleFailureReject(Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } }));
    await healthLifecycleFailurePromise;
    assert.equal(healthLifecycleFailurePlugin.autoTranslationProviderFailures.has(healthLifecycleFailureKey), false);
    assert.equal(healthLifecycleFailurePlugin.getApiStatus("translation").state, "testing");
    assert.equal(healthLifecycleFailureRetry, 0);

    const modelLifecyclePlugin = new Plugin();
    modelLifecyclePlugin.settings.translation.provider = "sakuraLocal";
    modelLifecyclePlugin.settings.translation.apiKey = "";
    let modelLifecycleResolve = null;
    let modelLifecycleStatusWrites = 0;
    modelLifecyclePlugin.fetchApiResponseText = () => new Promise(resolve => { modelLifecycleResolve = resolve; });
    modelLifecyclePlugin.setApiRuntimeStatus = () => { modelLifecycleStatusWrites++; };
    const modelLifecyclePromise = modelLifecyclePlugin.runModelTask("translation", "hello lifecycle");
    const modelLifecycleKey = modelLifecyclePlugin.getAutoTranslationProviderKey({ configOverrides: modelLifecyclePlugin.settings.translation });
    modelLifecyclePlugin.isStarted = false;
    modelLifecyclePlugin.lifecycleToken++;
    modelLifecycleResolve(JSON.stringify({ choices: [{ message: { content: "translated lifecycle" } }] }));
    assert.equal(await modelLifecyclePromise, "translated lifecycle");
    assert.equal(modelLifecyclePlugin.localProviderHealthyKeys.has(modelLifecycleKey), false);
    assert.equal(modelLifecycleStatusWrites, 0);

    const apiTestLifecyclePlugin = new Plugin();
    apiTestLifecyclePlugin.settings.translation.provider = "sakuraLocal";
    apiTestLifecyclePlugin.settings.translation.apiKey = "";
    let apiTestLifecycleResolve = null;
    const apiTestLifecycleStates = [];
    apiTestLifecyclePlugin.fetchApiResponseText = () => new Promise(resolve => { apiTestLifecycleResolve = resolve; });
    apiTestLifecyclePlugin.setApiStatus = (status, state) => { apiTestLifecycleStates.push(state); };
    apiTestLifecyclePlugin.setButtonBusy = () => {};
    apiTestLifecyclePlugin.showToast = () => {};
    const apiTestLifecyclePromise = apiTestLifecyclePlugin.testApiConnection("translation", {}, {});
    apiTestLifecyclePlugin.isStarted = false;
    apiTestLifecyclePlugin.lifecycleToken++;
    apiTestLifecycleResolve(JSON.stringify({ choices: [{ message: { content: "OK" } }] }));
    await apiTestLifecyclePromise;
    assert.deepEqual(apiTestLifecycleStates, ["testing"]);

    const stoppedStalePlugin = new Plugin();
    const stoppedCurrent = {
        cacheKey: "current",
        requestOptions: { version: stoppedStalePlugin.autoTranslationConfigVersion }
    };
    const stoppedStale = {
        cacheKey: "stale",
        requestOptions: { version: stoppedStalePlugin.autoTranslationConfigVersion - 1 }
    };
    let requeuedCurrent = false;
    stoppedStalePlugin.requeueAutoTranslationItem = item => {
        if (item.cacheKey === "current") requeuedCurrent = true;
    };
    stoppedStalePlugin.isAutoTranslationProviderCoolingDown = itemOptions => itemOptions === stoppedCurrent.requestOptions;
    const stoppedPending = new Set([stoppedCurrent, stoppedStale]);
    await stoppedStalePlugin.runAutoTranslationFallbackItems(stoppedPending);
    assert.equal(requeuedCurrent, true);
    assert.equal(stoppedPending.size, 0);

    const localRepairPlugin = new Plugin();
    localRepairPlugin.settings.translation.provider = "sakuraLocal";
    localRepairPlugin.settings.translation.targetLanguage = "Chinese";
    localRepairPlugin.settings.ui.autoTranslateStrictRetry = false;
    const localRepairSource = "I have chat gpt plus new date, only 1.25$";
    const localRepairOutputs = [
        localRepairSource,
        "\u6211\u6709 ChatGPT Plus \u7684\u65b0\u65e5\u671f\uff0c\u53ea\u8981 1.25 \u7f8e\u5143"
    ];
    const localRepairModes = [];
    localRepairPlugin.runAutoTranslationModelAttempt = async (_text, requestOptions) => {
        localRepairModes.push(requestOptions?.mode || "");
        return localRepairOutputs.shift();
    };
    assert.equal(
        await localRepairPlugin.runAutoTranslationTask(localRepairSource, localRepairPlugin.getAutoTranslationOptions(), { longTextStrategy: false }),
        "\u6211\u6709 ChatGPT Plus \u7684\u65b0\u65e5\u671f\uff0c\u53ea\u8981 1.25 \u7f8e\u5143"
    );
    assert.deepEqual(localRepairModes, ["auto", "auto-final-fallback"]);

    const localNoRepairPlugin = new Plugin();
    localNoRepairPlugin.settings.translation.provider = "sakuraLocal";
    localNoRepairPlugin.settings.translation.targetLanguage = "Chinese";
    let localNoRepairCalls = 0;
    localNoRepairPlugin.runAutoTranslationModelAttempt = async () => {
        localNoRepairCalls++;
        return "same source";
    };
    await assert.rejects(
        () => localNoRepairPlugin.runAutoTranslationTask("same source", localNoRepairPlugin.getAutoTranslationOptions(), { longTextStrategy: false, retryInvalidOutput: false }),
        /目标语言|target language|不是目标|模型输出/
    );
    assert.equal(localNoRepairCalls, 1);

    const bestEffortValidationPlugin = new Plugin();
    bestEffortValidationPlugin.settings.translation.provider = "sakuraLocal";
    bestEffortValidationPlugin.settings.translation.targetLanguage = "Chinese";
    const bestEffortOptions = bestEffortValidationPlugin.getAutoTranslationOptions();
    const bestEffortResult = bestEffortValidationPlugin.getAutoTranslationOutputValidationResult(
        "refund address 123 Main St price $20",
        "\u9000\u6b3e\u5730\u5740 price $20 address 123 Main St",
        "Chinese",
        {},
        bestEffortOptions
    );
    assert.equal(bestEffortResult.renderable, true);
    assert.notEqual(bestEffortResult.quality, "bad");
    const sameSourceValidation = bestEffortValidationPlugin.getAutoTranslationOutputValidationResult(
        "same source",
        "same source",
        "Chinese",
        {},
        bestEffortOptions
    );
    assert.equal(sameSourceValidation.renderable, false);
    assert.equal(sameSourceValidation.reasonCode, "same-as-source");
    const refusalValidation = bestEffortValidationPlugin.getAutoTranslationOutputValidationResult(
        "\u0443\u0433\u0440\u043e\u0437\u0430",
        "\u62b1\u6b49\uff0c\u6211\u65e0\u6cd5\u63d0\u4f9b\u6b64\u7c7b\u5185\u5bb9\u7684\u7ffb\u8bd1\u670d\u52a1\u3002",
        "Chinese",
        {},
        bestEffortOptions
    );
    assert.equal(refusalValidation.renderable, false);
    assert.equal(refusalValidation.shouldRepair, true);

    const coveragePrecheckPlugin = new Plugin();
    coveragePrecheckPlugin.settings.translation.targetLanguage = "Chinese";
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("\u8fd9\u4e2a refund address 123 Main St price $20", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("ChatGPT Plus refund address price $20", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("hi", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("\u4f60\u597d refund", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("Alice sent Bob the address 123 Main St", "Chinese"),
        ""
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("https://example.invalid/test", "Chinese"),
        "link-only"
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("```const value = 1;```", "Chinese"),
        "code-only"
    );
    assert.equal(
        coveragePrecheckPlugin.computeAutoTranslationPrecheckSkipReason("12345 !!!", "Chinese"),
        "no-letters"
    );

    const directValidationPlugin = new Plugin();
    directValidationPlugin.settings.translation.provider = "microsoft";
    directValidationPlugin.settings.translation.targetLanguage = "Chinese";
    const directValidation = directValidationPlugin.getAutoTranslationOutputValidationResult(
        "bonjour",
        "hello",
        "Chinese",
        {},
        directValidationPlugin.getAutoTranslationOptions()
    );
    assert.equal(directValidation.quality, "good");
    assert.equal(directValidation.renderable, true);
    assert.equal(directValidation.cacheable, true);
    const directExplanatoryValidation = directValidationPlugin.getAutoTranslationOutputValidationResult(
        longOrdinarySource,
        explanatoryNoiseOutput,
        "Chinese",
        {},
        directValidationPlugin.getAutoTranslationOptions()
    );
    assert.equal(directExplanatoryValidation.reasonCode, "explanatory-output");
    assert.equal(directExplanatoryValidation.renderable, false);
    assert.equal(directExplanatoryValidation.cacheable, false);
    const directEmojiMismatchValidation = directValidationPlugin.getAutoTranslationOutputValidationResult(
        "get muted :emoji_12:",
        "\u88ab\u9759\u97f3\u4e86",
        "Chinese",
        {},
        directValidationPlugin.getAutoTranslationOptions()
    );
    assert.equal(directEmojiMismatchValidation.reasonCode, "emoji-mismatch");
    assert.equal(directEmojiMismatchValidation.renderable, false);
    assert.equal(directEmojiMismatchValidation.cacheable, false);

    const manualRescuePlugin = new Plugin();
    manualRescuePlugin.settings.translation.provider = "sakuraLocal";
    manualRescuePlugin.settings.translation.targetLanguage = "Chinese";
    manualRescuePlugin.getMessageIdentity = () => "manual-rescue-identity";
    const manualRescueAttempts = [];
    manualRescuePlugin.logDiagnostic = (scope, status, meta = {}) => {
        if (scope === "manual.rescue" && status === "attempt") manualRescueAttempts.push(meta);
    };
    let manualRescueModelCalls = 0;
    manualRescuePlugin.runAutoTranslationModelAttempt = async (_text, options) => {
        manualRescueModelCalls++;
        assert.ok(["manual", "manual-force-target"].includes(String(options?.mode || "")));
        return manualRescueModelCalls === 1 ? "hello" : "\u4f60\u597d";
    };
    const manualRescuePlan = manualRescuePlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: "hello" },
        "hello"
    );
    const manualRescueResult = await manualRescuePlugin.runManualRescueTranslationPlan(manualRescuePlan);
    assert.equal(manualRescueResult.translated, "\u4f60\u597d");
    assert.equal(manualRescueResult.validation.renderable, true);
    assert.deepEqual(manualRescueAttempts.map(item => item.attemptName), ["manual-normal", "manual-force-target"]);
    assert.equal(manualRescueAttempts[0].invalidReason, "same-as-source");
    assert.equal(manualRescueAttempts[1].validationQuality, "good");

    const manualWholePassPlugin = new Plugin();
    manualWholePassPlugin.settings.translation.provider = "sakuraLocal";
    manualWholePassPlugin.settings.translation.targetLanguage = "Chinese";
    manualWholePassPlugin.getMessageIdentity = () => "manual-whole-pass-identity";
    const manualWholePassCalls = [];
    manualWholePassPlugin.runAutoTranslationTaskWithOptions = async (_text, options) => {
        manualWholePassCalls.push(options);
        return "\u6574\u6761\u957f\u6587\u8bd1\u6587";
    };
    const manualWholePassText = "long source sentence ".repeat(32);
    const manualWholePassPlan = manualWholePassPlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: manualWholePassText },
        manualWholePassText
    );
    assert.equal(
        await manualWholePassPlugin.runManualRescueModelAttempt(manualWholePassPlan, manualWholePassPlan.requestOptions),
        "\u6574\u6761\u957f\u6587\u8bd1\u6587"
    );
    assert.equal(manualWholePassCalls.length, 1);
    assert.equal(manualWholePassCalls[0].longTextWholePass, true);
    assert.match(manualWholePassCalls[0].mode, /manual-whole/);

    const manualWholeFallbackPlugin = new Plugin();
    manualWholeFallbackPlugin.settings.translation.provider = "sakuraLocal";
    manualWholeFallbackPlugin.settings.translation.targetLanguage = "Chinese";
    manualWholeFallbackPlugin.getMessageIdentity = () => "manual-whole-fallback-identity";
    manualWholeFallbackPlugin.runAutoTranslationTaskWithOptions = async () => {
        throw manualWholeFallbackPlugin.createFinalInvalidAutoTranslationError("residual-source");
    };
    let manualWholeFallbackChunked = false;
    manualWholeFallbackPlugin.runAutoTranslationTask = async () => {
        manualWholeFallbackChunked = true;
        return "\u5206\u5757\u6551\u56de\u7684\u8bd1\u6587";
    };
    const manualWholeFallbackText = "fallback long source sentence ".repeat(28);
    const manualWholeFallbackPlan = manualWholeFallbackPlugin.createManualTranslationPlan(
        { isConnected: true },
        { dataset: {}, isConnected: true, text: manualWholeFallbackText },
        manualWholeFallbackText
    );
    assert.equal(
        await manualWholeFallbackPlugin.runManualRescueModelAttempt(manualWholeFallbackPlan, manualWholeFallbackPlan.requestOptions),
        "\u5206\u5757\u6551\u56de\u7684\u8bd1\u6587"
    );
    assert.equal(manualWholeFallbackChunked, true);

    const manualRescueFailurePlugin = new Plugin();
    manualRescueFailurePlugin.settings.translation.enabled = true;
    manualRescueFailurePlugin.settings.translation.provider = "sakuraLocal";
    manualRescueFailurePlugin.settings.translation.targetLanguage = "Chinese";
    manualRescueFailurePlugin.getMessageIdentity = () => "manual-rescue-failure-identity";
    manualRescueFailurePlugin.getElementText = content => content.text;
    manualRescueFailurePlugin.runAutoTranslationModelAttempt = async () => "hello";
    manualRescueFailurePlugin.renderTranslationLoading = () => {};
    let manualRescueFailureRendered = 0;
    let manualRescueFailureRemoved = 0;
    let manualRescueFailureProviderMarked = 0;
    manualRescueFailurePlugin.renderTranslationError = () => { manualRescueFailureRendered++; };
    manualRescueFailurePlugin.removeTranslationNode = () => { manualRescueFailureRemoved++; };
    manualRescueFailurePlugin.markAutoTranslationProviderFailure = () => { manualRescueFailureProviderMarked++; };
    manualRescueFailurePlugin.setButtonBusy = () => {};
    manualRescueFailurePlugin.showToast = () => {};
    const manualRescueFailureMessage = { isConnected: true };
    const manualRescueFailureContent = { dataset: {}, isConnected: true, text: "hello" };
    const manualRescueFailurePlan = manualRescueFailurePlugin.createManualTranslationPlan(
        manualRescueFailureMessage,
        manualRescueFailureContent,
        "hello"
    );
    manualRescueFailurePlugin.autoTranslationFailures.set(
        manualRescueFailurePlan.autoCacheKey,
        manualRescueFailurePlugin.createAutoTranslationFailure(
            manualRescueFailurePlan.autoCacheKey,
            manualRescueFailurePlugin.createFinalInvalidAutoTranslationError("same-as-source")
        )
    );
    await manualRescueFailurePlugin.translateMessage(manualRescueFailureMessage, manualRescueFailureContent, null);
    assert.equal(manualRescueFailureRendered, 0);
    assert.equal(manualRescueFailureRemoved, 1);
    assert.equal(manualRescueFailureProviderMarked, 0);
    assert.equal(manualRescueFailurePlugin.autoTranslationFailures.has(manualRescueFailurePlan.autoCacheKey), false);

    const manualClearPlugin = new Plugin();
    manualClearPlugin.settings.translation.provider = "sakuraLocal";
    manualClearPlugin.settings.translation.targetLanguage = "Chinese";
    manualClearPlugin.getMessageIdentity = () => "manual-clear-identity";
    const manualClearMessage = { isConnected: true };
    const manualClearContent = { dataset: {}, isConnected: true, text: "manual source" };
    const manualClearPlan = manualClearPlugin.createManualTranslationPlan(manualClearMessage, manualClearContent, "manual source");
    const manualClearError = manualClearPlugin.createFinalInvalidAutoTranslationError("target-language");
    manualClearPlugin.autoTranslationFailures.set(manualClearPlan.autoCacheKey, manualClearPlugin.createAutoTranslationFailure(manualClearPlan.autoCacheKey, manualClearError));
    manualClearPlugin.autoTranslationFailures.set(
        manualClearPlugin.getAutoTextTranslationFailureKey("manual source", manualClearPlan.autoRequestOptions),
        manualClearPlugin.createAutoTranslationFailure("manual-text-failure", manualClearError)
    );
    manualClearPlugin.autoTranslationQueue.push({ cacheKey: manualClearPlan.autoCacheKey });
    manualClearPlugin.autoTranslationQueuedKeys.add(manualClearPlan.autoCacheKey);
    manualClearPlugin.addAutoTranslationPendingTarget(manualClearPlan.autoCacheKey, {
        messageNode: manualClearMessage,
        content: manualClearContent,
        text: "manual source",
        cacheKey: manualClearPlan.autoCacheKey,
        requestOptions: manualClearPlan.autoRequestOptions
    });
    manualClearPlugin.clearManualBlockingState(manualClearPlan);
    assert.equal(manualClearPlugin.autoTranslationFailures.has(manualClearPlan.autoCacheKey), false);
    assert.equal(manualClearPlugin.autoTranslationFailures.has(manualClearPlugin.getAutoTextTranslationFailureKey("manual source", manualClearPlan.autoRequestOptions)), false);
    assert.equal(manualClearPlugin.autoTranslationQueue.length, 0);
    assert.equal(manualClearPlugin.autoTranslationQueuedKeys.has(manualClearPlan.autoCacheKey), false);
    assert.equal(manualClearPlugin.autoTranslationPendingTargets.has(manualClearPlan.autoCacheKey), false);

    const manualSourcePlugin = new Plugin();
    manualSourcePlugin.settings.translation.enabled = true;
    manualSourcePlugin.settings.translation.provider = "sakuraLocal";
    manualSourcePlugin.settings.translation.targetLanguage = "Chinese";
    const manualSourceShort = "step 3: open Interface";
    const manualSourceFull = [
        "free access to GPT 5.5 and Grok 4.20",
        "platform Stack AI. free tier. no card needed",
        "step 1: sign in with Google",
        "step 2: create agent",
        manualSourceShort
    ].join("\n");
    manualSourcePlugin.getElementText = content => content.text;
    manualSourcePlugin.messageTracker.getRouteIds = () => ({ guildId: "guild-source", channelId: "channel-source", messageId: "" });
    manualSourcePlugin.messageTracker.getNodeMessageIds = () => ({ guildId: "guild-source", channelId: "channel-source", messageId: "message-source" });
    manualSourcePlugin.getMessageContentElements = (_messageNode, _context) => [manualSourceContent];
    manualSourcePlugin.getBdfdbMessageStoreMessages = () => [{
        id: "message-source",
        guildId: "guild-source",
        channelId: "channel-source",
        content: manualSourceFull
    }];
    manualSourcePlugin.renderTranslationLoading = () => {};
    manualSourcePlugin.setButtonBusy = () => {};
    manualSourcePlugin.showToast = () => {};
    manualSourcePlugin.syncManualTranslationToAutoCache = () => {};
    manualSourcePlugin.setTranslationCache = () => {};
    let manualSourceRequestedText = "";
    let manualSourceRendered = null;
    manualSourcePlugin.runManualTranslationPlan = async plan => {
        manualSourceRequestedText = plan.text;
        return {
            translated: "\u5b8c\u6574\u8bd1\u6587",
            requestOptions: plan.requestOptions,
            validation: {
                quality: "good",
                reasonCode: "",
                renderable: true,
                cacheable: true
            }
        };
    };
    manualSourcePlugin.renderTranslation = (_messageNode, _content, translated, _cacheKey, sourceText) => {
        manualSourceRendered = { translated, sourceText };
    };
    const manualSourceMessage = { isConnected: true };
    const manualSourceContent = { dataset: {}, isConnected: true, text: manualSourceShort };
    await manualSourcePlugin.translateMessage(manualSourceMessage, manualSourceContent, null);
    assert.equal(manualSourceRequestedText, manualSourceFull);
    // The store text is only the request text: the line is keyed on the text on screen.
    assert.equal(manualSourceRendered.sourceText, manualSourceShort);

    const manualPartialPlugin = new Plugin();
    manualPartialPlugin.settings.translation.enabled = true;
    manualPartialPlugin.settings.translation.provider = "sakuraLocal";
    manualPartialPlugin.settings.translation.targetLanguage = "Chinese";
    manualPartialPlugin.getMessageIdentity = () => "manual-partial-identity";
    manualPartialPlugin.getElementText = content => content.text;
    manualPartialPlugin.renderTranslationLoading = () => { manualPartialPlugin.loadingRendered = true; };
    manualPartialPlugin.setButtonBusy = () => {};
    manualPartialPlugin.removeTranslationNode = () => {};
    manualPartialPlugin.showToast = () => {};
    let manualPartialCacheWrites = 0;
    let manualPartialAutoSyncs = 0;
    let manualPartialRendered = null;
    manualPartialPlugin.setTranslationCache = () => { manualPartialCacheWrites++; };
    manualPartialPlugin.syncManualTranslationToAutoCache = () => { manualPartialAutoSyncs++; };
    manualPartialPlugin.runManualTranslationPlan = async () => ({
        translated: [
            "\u7b2c\u4e00\u6bb5\u5df2\u7ffb\u8bd1",
            "\u7b2c\u4e09\u6bb5\u5df2\u7ffb\u8bd1"
        ].join("\n\n"),
        requestOptions: manualPartialPlugin.getLongTextTranslationOptions(manualPartialPlugin.getAutoTranslationOptions(), "manual partial source"),
        validation: {
            quality: "partial",
            reasonCode: "long-text-partial",
            renderable: true,
            cacheable: false
        }
    });
    manualPartialPlugin.renderTranslation = (_messageNode, _content, translated, _cacheKey, _sourceText, options) => {
        manualPartialRendered = { translated, options };
    };
    const manualPartialMessage = { isConnected: true };
    const manualPartialContent = { dataset: {}, isConnected: true, text: "manual partial source" };
    const manualPartialPlan = manualPartialPlugin.createManualTranslationPlan(
        manualPartialMessage,
        manualPartialContent,
        "manual partial source"
    );
    await manualPartialPlugin.translateMessage(
        manualPartialMessage,
        manualPartialContent,
        null
    );
    assert.equal(manualPartialPlugin.loadingRendered, true);
    assert.equal(manualPartialRendered.options.partial, true);
    assert.doesNotMatch(manualPartialRendered.translated, /\u6bb5\u7ffb\u8bd1\u5931\u8d25/);
    assert.equal(manualPartialCacheWrites, 0);
    assert.equal(manualPartialAutoSyncs, 0);
    assert.ok(manualPartialPlugin.getRecentAutoTranslationRender(
        manualPartialPlan.autoCacheKey,
        "manual partial source",
        manualPartialPlan.autoRequestOptions
    ));

    const manualFailurePlugin = new Plugin();
    manualFailurePlugin.settings.translation.enabled = true;
    manualFailurePlugin.settings.translation.provider = "sakuraLocal";
    manualFailurePlugin.settings.translation.targetLanguage = "Chinese";
    manualFailurePlugin.getMessageIdentity = () => "manual-failure-identity";
    manualFailurePlugin.getElementText = content => content.text;
    let manualFailureLoading = 0;
    let manualFailureErrorRendered = 0;
    let manualFailureRemoved = 0;
    const manualFailureBusy = [];
    manualFailurePlugin.renderTranslationLoading = () => { manualFailureLoading++; };
    manualFailurePlugin.renderTranslationError = () => { manualFailureErrorRendered++; };
    manualFailurePlugin.removeTranslationNode = () => { manualFailureRemoved++; };
    manualFailurePlugin.setButtonBusy = (_button, busy) => manualFailureBusy.push(busy);
    manualFailurePlugin.showToast = () => {};
    manualFailurePlugin.markAutoTranslationProviderFailure = () => {};
    manualFailurePlugin.runManualTranslationPlan = async () => {
        throw manualFailurePlugin.createFinalInvalidAutoTranslationError("target-language");
    };
    const manualFailureMessage = { isConnected: true };
    const manualFailureContent = { dataset: {}, isConnected: true, text: "manual failure source" };
    const manualFailurePlan = manualFailurePlugin.createManualTranslationPlan(manualFailureMessage, manualFailureContent, "manual failure source");
    manualFailurePlugin.autoTranslationFailures.set(
        manualFailurePlan.autoCacheKey,
        manualFailurePlugin.createAutoTranslationFailure(manualFailurePlan.autoCacheKey, manualFailurePlugin.createFinalInvalidAutoTranslationError("target-language"))
    );
    const manualFailurePromise = manualFailurePlugin.translateMessage(manualFailureMessage, manualFailureContent, null);
    assert.equal(manualFailureLoading, 1);
    await manualFailurePromise;
    assert.equal(manualFailureErrorRendered, 0);
    assert.equal(manualFailureRemoved, 1);
    assert.deepEqual(manualFailureBusy, [true, false]);
    assert.equal(manualFailurePlugin.autoTranslationFailures.has(manualFailurePlan.autoCacheKey), false);
    assert.equal(manualFailurePlugin.autoTranslationFailures.has(manualFailurePlugin.getAutoTextTranslationFailureKey("manual failure source", manualFailurePlan.autoRequestOptions)), false);

    const fallbackNoRetryPlugin = new Plugin();
    fallbackNoRetryPlugin.runModelTask = async () => "bad output";
    fallbackNoRetryPlugin.isInvalidAutoTranslationOutput = () => true;
    let fallbackRetryPromptUsed = false;
    fallbackNoRetryPlugin.getAutoTranslationRetryOptions = () => {
        fallbackRetryPromptUsed = true;
        return Plugin.prototype.getAutoTranslationRetryOptions.call(fallbackNoRetryPlugin, "source", "bad output");
    };
    await assert.rejects(
        () => fallbackNoRetryPlugin.runAutoTranslationTask("source", fallbackNoRetryPlugin.getAutoTranslationOptions(), { retryInvalidOutput: false }),
        /目标语言|target language|不是目标/
    );
    assert.equal(fallbackRetryPromptUsed, false);

    // --- Focused regressions: Baidu line handling, emoji token subset, pinned provider
    // --- profiles, dedupe fallback metadata, prompt template deletion, request keys,
    // --- terminal failure expiry, queue batch/sort behavior, migrated i18n keys.

    const baiduLinePlugin = new Plugin();
    const baiduLineRequest = baiduLinePlugin.buildBaiduTranslateRequest(["line one\nline two", "solo"], {
        endpoint: "https://fanyi-api.baidu.com/api/trans/vip/translate",
        appId: "baidu-app",
        secretKey: "baidu-secret",
        targetLanguage: "Chinese"
    });
    assert.equal(baiduLineRequest.request.body.q, "line one\nline two\nsolo");
    assert.deepEqual(baiduLineRequest.request.translate.rowCounts, [2, 1]);
    assert.equal(baiduLineRequest.request.translate.expectedCount, 2);
    const baiduRegrouped = baiduLinePlugin.parseBaiduTranslateResponse(JSON.stringify({
        trans_result: [{ dst: "第一行" }, { dst: "第二行" }, { dst: "单独" }]
    }), 2, { asArray: true, rowCounts: [2, 1] });
    assert.deepEqual(baiduRegrouped, ["第一行\n第二行", "单独"]);
    assert.deepEqual(baiduLinePlugin.regroupBaiduTranslateRows(["a", "b"], 1), ["a\nb"]);
    assert.throws(
        () => baiduLinePlugin.regroupBaiduTranslateRows(["a", "b", "c"], 2, null),
        error => error.providerParseFailed === true
    );

    const mixedTokenPlugin = new Plugin();
    const mixedTokenEmoji = createFakeElement("img");
    mixedTokenEmoji.setAttribute("alt", ":emoji_12:");
    mixedTokenEmoji.setAttribute("src", "https://cdn.discord.test/emojis/12.webp");
    mixedTokenEmoji.closest = () => null;
    mixedTokenEmoji.cloneNode = () => {
        const clone = createFakeElement("img");
        clone.setAttribute("alt", mixedTokenEmoji.getAttribute("alt"));
        clone.setAttribute("src", mixedTokenEmoji.getAttribute("src"));
        return clone;
    };
    const mixedTokenContent = {
        querySelectorAll: selector => selector === "img[alt]" ? [mixedTokenEmoji] : []
    };
    const savedDocumentForMixedToken = global.document;
    global.document = {
        createTextNode: value => ({ nodeType: 3, textContent: String(value), parentElement: null })
    };
    const mixedTokenContainer = createFakeElement("span");
    assert.equal(
        mixedTokenPlugin.appendTranslationTextWithDiscordEmoji(mixedTokenContainer, "会议在 12:30:45 :emoji_12:", mixedTokenContent),
        true
    );
    assert.equal(mixedTokenContainer.children.length, 2);
    assert.equal(mixedTokenContainer.children[0].textContent, "会议在 12:30:45 ");
    assert.equal(mixedTokenContainer.children[1].getAttribute("alt"), ":emoji_12:");
    const missingEmojiContainer = createFakeElement("span");
    assert.equal(
        mixedTokenPlugin.appendTranslationTextWithDiscordEmoji(missingEmojiContainer, "12:30:45 only", mixedTokenContent),
        false
    );
    global.document = savedDocumentForMixedToken;

    const pinnedFallbackPlugin = new Plugin();
    pinnedFallbackPlugin.settings.translation.enabled = true;
    pinnedFallbackPlugin.settings.translation.provider = "openaiCompatible";
    pinnedFallbackPlugin.settings.translation.apiKey = "live-key";
    pinnedFallbackPlugin.settings.translation.endpoint = "https://live.example.com/v1/chat/completions";
    pinnedFallbackPlugin.settings.translation.model = "live-model";
    pinnedFallbackPlugin.fetchModelResponse = async () => {
        const error = new Error("HTTP 429");
        error.status = 429;
        throw error;
    };
    let pinnedFallbackUsed = 0;
    pinnedFallbackPlugin.tryProviderFallbackModelTask = async () => {
        pinnedFallbackUsed++;
        return { used: true, result: "fallback-result", provider: "googleCloud" };
    };
    const pinnedFallbackResult = await pinnedFallbackPlugin.runModelTask("translation", "hello world", {
        mode: "public-bilingual",
        providerProfilePinned: true,
        requestContext: {},
        configOverrides: {
            provider: "deepseek",
            apiKey: "polish-key",
            endpoint: "https://api.deepseek.com/chat/completions",
            model: "deepseek-chat",
            prompt: "Translate.",
            targetLanguage: "Chinese",
            temperature: 0,
            maxTokens: 400
        }
    });
    assert.equal(pinnedFallbackResult, "fallback-result");
    assert.equal(pinnedFallbackUsed, 1);

    const publicBilingualPinnedPlugin = new Plugin();
    const publicBilingualPinnedCalls = [];
    publicBilingualPinnedPlugin.runModelTask = async (kind, input, options) => {
        publicBilingualPinnedCalls.push(options);
        return "双语译文";
    };
    publicBilingualPinnedPlugin.isInvalidAutoTranslationOutput = () => false;
    await publicBilingualPinnedPlugin.runPublicBilingualTranslationTask("hello");
    assert.equal(publicBilingualPinnedCalls.length, 1);
    assert.equal(publicBilingualPinnedCalls[0].providerProfilePinned, true);

    const dedupFallbackPlugin = new Plugin();
    const sharedFallbackPromise = Promise.resolve({ text: "shared-result", fallbackProvider: "googleCloud" });
    const dedupFallbackContext = {};
    const adoptedShared = await dedupFallbackPlugin.adoptSharedModelResult(sharedFallbackPromise, { requestContext: dedupFallbackContext });
    assert.equal(adoptedShared.text, "shared-result");
    assert.equal(adoptedShared.fallbackProvider, "googleCloud");
    assert.equal(dedupFallbackContext.fallbackProvider, "googleCloud");
    const dedupCleanContext = {};
    const adoptedClean = await dedupFallbackPlugin.adoptSharedModelResult(
        Promise.resolve({ text: "clean", fallbackProvider: "" }),
        { requestContext: dedupCleanContext }
    );
    assert.equal(adoptedClean.text, "clean");
    assert.equal(dedupCleanContext.fallbackProvider, undefined);
    // End-to-end: a deduped runModelTask caller still receives the plain text while its
    // requestContext learns about the shared fallback result.
    const dedupEndToEndPlugin = new Plugin();
    dedupEndToEndPlugin.settings.translation.enabled = true;
    dedupEndToEndPlugin.settings.translation.provider = "deepseek";
    dedupEndToEndPlugin.settings.translation.apiKey = "dedup-key";
    dedupEndToEndPlugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    dedupEndToEndPlugin.settings.translation.model = "deepseek-chat";
    let dedupFetchCalls = 0;
    dedupEndToEndPlugin.fetchModelResponse = async () => {
        dedupFetchCalls++;
        await new Promise(resolve => setTimeout(resolve, 10));
        const error = new Error("HTTP 429");
        error.status = 429;
        throw error;
    };
    dedupEndToEndPlugin.tryProviderFallbackModelTask = async (kind, input, options) => {
        if (options.requestContext && typeof options.requestContext === "object") {
            options.requestContext.fallbackProvider = "googleCloud";
        }
        return { used: true, result: "dedup-fallback-text", provider: "googleCloud" };
    };
    const dedupRequestOptions = () => ({
        mode: "manual",
        requestContext: {},
        configOverrides: {
            provider: "deepseek",
            apiKey: "dedup-key",
            endpoint: "https://api.deepseek.com/chat/completions",
            model: "deepseek-chat",
            prompt: "Translate.",
            targetLanguage: "Chinese",
            temperature: 0,
            maxTokens: 400
        }
    });
    const dedupFirstOptions = dedupRequestOptions();
    const dedupSecondOptions = dedupRequestOptions();
    const dedupFirstPromise = dedupEndToEndPlugin.runModelTask("translation", "dedup source", dedupFirstOptions);
    const dedupSecondPromise = dedupEndToEndPlugin.runModelTask("translation", "dedup source", dedupSecondOptions);
    assert.equal(await dedupFirstPromise, "dedup-fallback-text");
    assert.equal(await dedupSecondPromise, "dedup-fallback-text");
    assert.equal(dedupFetchCalls, 1);
    assert.equal(dedupFirstOptions.requestContext.fallbackProvider, "googleCloud");
    assert.equal(dedupSecondOptions.requestContext.fallbackProvider, "googleCloud");

    const promptTemplatePlugin = new Plugin();
    promptTemplatePlugin.syncSettingControls = () => {};
    promptTemplatePlugin.showToast = () => {};
    promptTemplatePlugin.saveSettings = () => {};
    let promptTemplateInvalidated = 0;
    promptTemplatePlugin.invalidateAutoTranslationQueue = () => { promptTemplateInvalidated++; };
    promptTemplatePlugin.settings.translation.promptTemplates = [
        { id: "tpl-a", serial: "001", name: "A", prompt: "prompt-a" },
        { id: "tpl-b", serial: "002", name: "B", prompt: "prompt-b" }
    ];
    promptTemplatePlugin.settings.translation.activePromptTemplate = "tpl-b";
    promptTemplatePlugin.settings.translation.prompt = "hand-edited";
    promptTemplatePlugin.deletePromptTemplate("translation", "tpl-a");
    assert.equal(promptTemplatePlugin.settings.translation.activePromptTemplate, "tpl-b");
    assert.equal(promptTemplatePlugin.settings.translation.prompt, "hand-edited");
    assert.equal(promptTemplateInvalidated, 0);
    promptTemplatePlugin.deletePromptTemplate("translation", "tpl-b");
    assert.equal(promptTemplatePlugin.settings.translation.activePromptTemplate, "");
    assert.equal(promptTemplateInvalidated, 1);

    const requestKeyPlugin = new Plugin();
    const deeplKeyZh = requestKeyPlugin.getModelRequestKey(
        "https://api-free.deepl.com/v2/translate",
        { provider: "deepl", responseParser: "deepLTranslate", headers: {}, body: { text: ["hello"], target_lang: "ZH" } },
        ["hello"]
    );
    const deeplKeyEn = requestKeyPlugin.getModelRequestKey(
        "https://api-free.deepl.com/v2/translate",
        { provider: "deepl", responseParser: "deepLTranslate", headers: {}, body: { text: ["hello"], target_lang: "EN" } },
        ["hello"]
    );
    assert.notEqual(deeplKeyZh, deeplKeyEn);
    const baiduKeyZh = requestKeyPlugin.getModelRequestKey(
        "https://fanyi-api.baidu.com/api/trans/vip/translate",
        { provider: "baidu", responseParser: "baiduTranslate", headers: {}, body: { q: "hello", from: "auto", to: "zh", appid: "a" } },
        "hello"
    );
    const baiduKeyJp = requestKeyPlugin.getModelRequestKey(
        "https://fanyi-api.baidu.com/api/trans/vip/translate",
        { provider: "baidu", responseParser: "baiduTranslate", headers: {}, body: { q: "hello", from: "auto", to: "jp", appid: "a" } },
        "hello"
    );
    assert.notEqual(baiduKeyZh, baiduKeyJp);

    const terminalFailurePlugin = new Plugin();
    const terminalFailureRecord = terminalFailurePlugin.createAutoTranslationFailure(
        "terminal-key",
        terminalFailurePlugin.createFinalInvalidAutoTranslationError("invalid-output")
    );
    assert.equal(terminalFailureRecord.terminal, true);
    assert.equal(terminalFailurePlugin.isAutoTranslationFailureExpired(terminalFailureRecord), false);
    assert.equal(
        terminalFailurePlugin.isAutoTranslationFailureExpired(terminalFailureRecord, Date.now() + 7 * 60 * 60 * 1000),
        true
    );
    terminalFailurePlugin.autoTranslationFailures.clear();
    for (let index = 0; index < 2100; index++) {
        terminalFailurePlugin.autoTranslationFailures.set(`terminal-${index}`, { at: Date.now(), retryAt: 0, terminal: true, count: 1 });
    }
    terminalFailurePlugin.pruneAutoTranslationFailureMapSize();
    assert.ok(terminalFailurePlugin.autoTranslationFailures.size <= 2000);

    const sortRankPlugin = new Plugin();
    const sortRankQueue = [
        { cacheKey: "history", daitHistoryRequest: true },
        { cacheKey: "manual-late", daitManualRequest: true },
        { cacheKey: "manual-early", daitManualRequest: true, priority: 1 },
        { cacheKey: "typeless", priority: 2, text: "short" }
    ];
    sortRankPlugin.translationScheduler.sortQueue(sortRankQueue);
    assert.deepEqual(sortRankQueue.map(item => item.cacheKey), ["manual-early", "manual-late", "history", "typeless"]);

    const batchLimitPlugin = new Plugin();
    batchLimitPlugin.settings.translation.enabled = true;
    batchLimitPlugin.getAutoTranslationRequestBatchSize = () => 1;
    let batchReadyComputations = 0;
    batchLimitPlugin.getReadyAutoTranslationTargets = item => {
        batchReadyComputations++;
        return [{ messageNode: { isConnected: true }, content: { isConnected: true }, text: item.text }];
    };
    batchLimitPlugin.getAutoTranslationPrimaryTarget = target => target;
    batchLimitPlugin.isAutoTranslationPrefetchItem = () => false;
    batchLimitPlugin.shouldRunAutoTranslationItemSingle = () => false;
    batchLimitPlugin.getAutoTranslationBatchGroupKey = () => "group";
    batchLimitPlugin.sortAutoTranslationQueue = () => {};
    batchLimitPlugin.autoTranslationQueue = [1, 2, 3, 4, 5].map(index => ({
        cacheKey: `batch-${index}`,
        text: `text-${index}`,
        requestOptions: {}
    }));
    const limitedBatch = batchLimitPlugin.takeAutoTranslationBatch();
    assert.equal(limitedBatch.length, 1);
    assert.equal(batchReadyComputations, 1);
    assert.equal(batchLimitPlugin.autoTranslationQueue.length, 4);

    const quietInvalidatePlugin = new Plugin();
    const savedDocumentForQuietInvalidate = global.document;
    global.document = { body: {} };
    quietInvalidatePlugin.isDiscordMediaViewerQuiet = () => true;
    quietInvalidatePlugin.hasLightweightDiscordMediaViewerMutation = () => false;
    quietInvalidatePlugin.isPresentationOnlyMessageMutation = () => false;
    quietInvalidatePlugin.isDiscordMessageElement = () => true;
    const quietEditedElement = { nodeType: 1, parentElement: null };
    quietInvalidatePlugin.elementTextCache.set(quietEditedElement, "stale text");
    quietInvalidatePlugin.handleDiscordObservedMutations([{ type: "characterData", target: quietEditedElement }]);
    assert.equal(quietInvalidatePlugin.elementTextCache.has(quietEditedElement), false);
    global.document = savedDocumentForQuietInvalidate;

    const migratedI18nPlugin = new Plugin();
    assert.equal(migratedI18nPlugin.t("publicBilingualButton"), "双语");
    assert.ok(migratedI18nPlugin.t("publicBilingualTooLong", { length: 2100, limit: 2000 }).includes("2100"));
    assert.notEqual(migratedI18nPlugin.t("errorLocalProviderUnavailable"), "errorLocalProviderUnavailable");

    // --- Intake regressions: the incremental scan must honor ui.autoTranslateIntakeMode
    // --- and produce the same candidates as the one-shot createAutoTranslationCandidates path.

    const intakeProjection = candidate => ({
        text: candidate.text,
        source: candidate.source,
        sourceTextKind: candidate.sourceTextKind,
        messageId: candidate.messageId,
        channelId: candidate.channelId,
        messageIdentity: candidate.messageIdentity
    });
    const createIntakeFixturePlugin = mode => {
        const plugin = new Plugin();
        plugin.settings.translation.enabled = true;
        plugin.settings.ui.autoTranslateMessages = true;
        plugin.settings.ui.injectMessageButtons = false;
        plugin.settings.ui.autoTranslateIntakeMode = mode;
        plugin.settings.ui.diagnosticsEnabled = true;
        plugin.isElementVisibleInViewport = () => true;
        plugin.getMessageContentElement = message => message.content;
        plugin.getCachedElementText = content => content.text;
        plugin.getElementText = content => content.text;
        plugin.shouldAutoTranslateText = () => true;
        return plugin;
    };
    const createIntakeContext = messageNodes => ({
        messageNodes,
        contentByMessage: new Map(),
        contentElementsByMessage: new Map(),
        textByElement: new Map(),
        replyTextByElement: new Map()
    });
    const runIncrementalIntakeScan = (plugin, context, options = {}) => {
        const collected = [];
        plugin.processAutoTranslationScanCandidates = (work, candidates = []) => {
            collected.push(...candidates);
            return candidates.length;
        };
        plugin.finishAutoTranslationScanWork = () => {};
        const pending = [];
        plugin.scheduleIncrementalMessageScanCallback = callback => { pending.push(callback); };
        plugin.scheduleIncrementalMessageScan(context);
        let slices = 0;
        while (pending.length) {
            if (typeof options.betweenSlices === "function") options.betweenSlices(slices, plugin);
            const next = pending.shift();
            slices++;
            if (slices > 200) throw new Error("incremental intake scan did not settle");
            next({ didTimeout: false, timeRemaining: () => 50 });
        }
        return { collected, slices };
    };

    const savedWindowForIntakeParity = global.window;

    // Combo 1: mode "dom" — both paths identical, intake reports dom.
    global.window = { location: { pathname: "/channels/guild-parity/channel-parity" } };
    const intakeDomMessages = () => [{ isConnected: true, content: { dataset: {}, isConnected: true, text: "hola parity" } }];
    const intakeDomReference = createIntakeFixturePlugin("dom")
        .createAutoTranslationCandidates(createIntakeContext(intakeDomMessages()));
    const intakeDomIncrementalPlugin = createIntakeFixturePlugin("dom");
    const intakeDomIncrementalContext = createIntakeContext(intakeDomMessages());
    const intakeDomIncremental = runIncrementalIntakeScan(intakeDomIncrementalPlugin, intakeDomIncrementalContext);
    assert.deepEqual(intakeDomIncremental.collected.map(intakeProjection), intakeDomReference.map(intakeProjection));
    assert.equal(intakeDomIncrementalContext.autoTranslateIntake.mode, "dom");
    assert.equal(intakeDomIncrementalContext.autoTranslateIntake.source, "dom");
    assert.equal(intakeDomIncrementalContext.autoTranslateIntake.domCandidates, 1);

    // Combo 2: mode "auto" + BDFDB store available — incremental must produce the same
    // bdfdb-enhanced candidates (store-full upgrade included) as the one-shot path.
    const intakeStoreShortDom = "step 4: paste model name";
    const intakeStoreFullText = [
        "free access to GPT 5.5 and Grok 4.20",
        "platform Stack AI. free tier. no card needed",
        "step 1: sign in with Google",
        "step 2: create agent",
        "step 3: open Interface",
        intakeStoreShortDom
    ].join("\n");
    const intakeStoreWindow = () => ({
        location: { pathname: "/channels/guild-parity/444444444444444444" },
        BDFDB_Global: {
            loaded: true,
            started: true,
            BDFDB: {
                LibraryStores: {
                    MessageStore: {
                        getMessages: () => [{
                            id: "444444444444444445",
                            guild_id: "guild-parity",
                            channel_id: "444444444444444444",
                            content: intakeStoreFullText,
                            author: { id: "author-parity" },
                            timestamp: "2026-07-26T00:00:00.000Z"
                        }]
                    }
                }
            }
        }
    });
    const intakeStoreMessages = () => [{ isConnected: true, content: { dataset: {}, isConnected: true, text: intakeStoreShortDom } }];
    global.window = intakeStoreWindow();
    const intakeStoreReference = createIntakeFixturePlugin("auto")
        .createAutoTranslationCandidates(createIntakeContext(intakeStoreMessages()));
    assert.equal(intakeStoreReference[0].source, "bdfdb");
    assert.equal(intakeStoreReference[0].sourceTextKind, "store-full");
    global.window = intakeStoreWindow();
    const intakeStoreIncrementalPlugin = createIntakeFixturePlugin("auto");
    const intakeStoreIncrementalContext = createIntakeContext(intakeStoreMessages());
    const intakeStoreIncremental = runIncrementalIntakeScan(intakeStoreIncrementalPlugin, intakeStoreIncrementalContext);
    assert.deepEqual(intakeStoreIncremental.collected.map(intakeProjection), intakeStoreReference.map(intakeProjection));
    assert.equal(intakeStoreIncremental.collected[0].text, intakeStoreFullText);
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.mode, "auto");
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.source, "bdfdb");
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.bdfdbAvailable, true);
    assert.equal(intakeStoreIncrementalContext.autoTranslateIntake.bdfdbEnhanced, 1);
    assert.ok(intakeStoreIncrementalPlugin.diagnosticLogs.some(entry => entry.action === "auto.intake" && entry.status === "bdfdb"));

    // Combos 3/4: modes "auto" and "bdfdb" without BDFDB — incremental falls back to DOM
    // candidates but must report the configured mode and the fallback reason.
    for (const fallbackMode of ["auto", "bdfdb"]) {
        global.window = { location: { pathname: "/channels/guild-parity/channel-parity" } };
        const fallbackReference = createIntakeFixturePlugin(fallbackMode)
            .createAutoTranslationCandidates(createIntakeContext(intakeDomMessages()));
        const fallbackPlugin = createIntakeFixturePlugin(fallbackMode);
        const fallbackContext = createIntakeContext(intakeDomMessages());
        const fallbackRun = runIncrementalIntakeScan(fallbackPlugin, fallbackContext);
        assert.deepEqual(fallbackRun.collected.map(intakeProjection), fallbackReference.map(intakeProjection));
        assert.equal(fallbackContext.autoTranslateIntake.mode, fallbackMode);
        assert.equal(fallbackContext.autoTranslateIntake.source, "dom");
        assert.equal(fallbackContext.autoTranslateIntake.reason, "bdfdb-unavailable");
        if (fallbackMode === "bdfdb") {
            assert.ok(fallbackPlugin.diagnosticLogs.some(entry => entry.action === "auto.intake" && entry.status === "fallback"));
        }
    }

    // One store snapshot per incremental scan, even across multiple slices/messages.
    global.window = { location: { pathname: "/channels/guild-parity/555555555555555555" } };
    const snapshotCountPlugin = createIntakeFixturePlugin("auto");
    let snapshotFetches = 0;
    snapshotCountPlugin.getBdfdbMessageStoreMessages = () => {
        snapshotFetches++;
        return [{
            id: "555555555555555556",
            guild_id: "guild-parity",
            channel_id: "555555555555555555",
            content: "hola uno",
            author: { id: "author-count" },
            timestamp: "2026-07-26T00:00:00.000Z"
        }];
    };
    snapshotCountPlugin.isBdfdbMessageIntakeAvailable = () => true;
    const snapshotContext = createIntakeContext([
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola uno" } },
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola dos" } },
        { isConnected: true, content: { dataset: {}, isConnected: true, text: "hola tres" } }
    ]);
    const snapshotRun = runIncrementalIntakeScan(snapshotCountPlugin, snapshotContext);
    assert.equal(snapshotRun.collected.length, 3);
    assert.equal(snapshotFetches, 1);
    // Slice budget still enforced with enhancement on: init slice + one task per slice.
    assert.equal(snapshotRun.slices, 4);

    // Stale generation stops slices without producing candidates.
    global.window = { location: { pathname: "/channels/guild-parity/channel-parity" } };
    const staleGenerationPlugin = createIntakeFixturePlugin("dom");
    const staleGenerationContext = createIntakeContext(intakeDomMessages());
    const staleGenerationRun = runIncrementalIntakeScan(staleGenerationPlugin, staleGenerationContext, {
        betweenSlices: (slice, plugin) => {
            if (slice === 1) plugin.incrementalMessageScanGeneration++;
        }
    });
    assert.equal(staleGenerationRun.collected.length, 0);

    global.window = savedWindowForIntakeParity;

    // --- Phase 6.0 regressions: the task-state view stays consistent with the
    // --- parallel collections across enqueue / take / in-flight / finish / remove
    // --- and the render queue structures.

    const taskStatePlugin = new Plugin();
    taskStatePlugin.settings.translation.enabled = true;
    taskStatePlugin.settings.ui.autoTranslateMessages = true;
    taskStatePlugin.getAutoTranslationRequestBatchSize = () => 1;
    taskStatePlugin.getReadyAutoTranslationTargets = item => [{
        messageNode: { isConnected: true },
        content: { isConnected: true },
        text: item.text
    }];
    taskStatePlugin.getAutoTranslationPrimaryTarget = target => target;
    taskStatePlugin.isAutoTranslationPrefetchItem = () => false;
    taskStatePlugin.shouldRunAutoTranslationItemSingle = () => false;
    taskStatePlugin.getAutoTranslationBatchGroupKey = () => "group";
    taskStatePlugin.isLongAutoTranslationItem = () => false;
    const assertNoTaskViolations = stage => {
        const violations = taskStatePlugin.checkAutoTranslationTaskInvariants();
        assert.deepEqual(violations, [], `task-state invariants violated at ${stage}: ${JSON.stringify(violations)}`);
    };

    assertNoTaskViolations("initial");
    for (const index of [1, 2, 3]) {
        taskStatePlugin.enqueueAutoTranslationItem({
            cacheKey: `task-state-${index}`,
            text: `hola ${index}`,
            requestOptions: {}
        });
    }
    assertNoTaskViolations("after-enqueue");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-1").queued, true);
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-1").queuedKey, true);
    assert.equal(taskStatePlugin.listAutoTranslationTaskKeys().length, 3);

    const taskStateBatch = taskStatePlugin.takeAutoTranslationBatch();
    assert.equal(taskStateBatch.length, 1);
    assertNoTaskViolations("after-take");
    const takenKey = taskStateBatch[0].cacheKey;
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(takenKey).queued, false);

    taskStatePlugin.markAutoTranslationInFlightItem(taskStateBatch[0]);
    assertNoTaskViolations("after-mark-in-flight");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(takenKey).inFlight, true);

    assert.equal(taskStatePlugin.finishAutoTranslationInFlightItem(taskStateBatch[0]), true);
    assertNoTaskViolations("after-finish");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(takenKey).inFlight, false);

    const removeTarget = taskStatePlugin.autoTranslationQueue[0]?.cacheKey;
    assert.ok(removeTarget);
    taskStatePlugin.removeQueuedAutoTranslationItem(removeTarget);
    assertNoTaskViolations("after-remove");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(removeTarget).queued, false);
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot(removeTarget).queuedKey, false);

    taskStatePlugin.scheduleAutoTranslationRenderQueue = () => {};
    const renderTaskTarget = { messageNode: { isConnected: true }, content: { isConnected: true }, text: "render me" };
    assert.equal(taskStatePlugin.queueAutoTranslationRenderTask({
        kind: "cache",
        target: renderTaskTarget,
        cacheKey: "task-state-render",
        run: () => {}
    }), true);
    assertNoTaskViolations("after-render-queue");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-render").renderQueued, true);
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-render").renderPending, true);
    taskStatePlugin.cancelAutoTranslationRenderQueue();
    assertNoTaskViolations("after-render-cancel");
    assert.equal(taskStatePlugin.getAutoTranslationTaskSnapshot("task-state-render").renderQueued, false);

    console.log("Plugin verification passed.");
})().catch(error => {
    console.error(error);
    process.exit(1);
});
