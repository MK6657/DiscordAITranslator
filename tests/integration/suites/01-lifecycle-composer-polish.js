"use strict";

// Artifact regression suite: Lifecycle, rollback, composer & polish sessions
function run(harness, shared) {
    const { assert, Plugin, fakeElementHasClass, findFakeElementsByClass, createFakeElement } = harness;
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
    shared.plugin = plugin;
    shared.FakeDataTransfer = FakeDataTransfer;
    shared.FakeClipboardEvent = FakeClipboardEvent;
}

module.exports = { title: "Lifecycle, rollback, composer & polish sessions", run };
