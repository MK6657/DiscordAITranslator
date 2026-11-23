"use strict";

// Artifact regression suite: Theme variables, settings panel & stylesheet contracts
function run(harness, shared) {
    const { assert, Plugin, fakeElementHasClass, createFakeElement } = harness;
    const { plugin } = shared;

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
    assert.equal(versionChip.textContent, `v${require("../../../package.json").version}`);
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
    const panelSharedBlock = injectedCss.match(/\n\.dait-settings,\n\.dait-quick-settings-modal-root,\n\.dait-quick-popover,\n\.dait-polish-result-panel,\n\.dait-input-action-menu,\n\.dait-polish-preset-menu,\n\.dait-dialog \{([\s\S]*?)\n\}/)?.[1] || "";
    assert.match(panelDarkBlock, /--dait-bg: #1f2426;[\s\S]*?--dait-rail: #181c1e;[\s\S]*?--dait-surface: #262c2f;[\s\S]*?--dait-input-bg: #15191a;[\s\S]*?--dait-text: #eee8dc;[\s\S]*?--dait-heading: #faf4e6;[\s\S]*?--dait-placeholder: #9ca8a3;[\s\S]*?--dait-brand: #227a5f;/);
    // Control edges reach 3:1 against the window surfaces (WCAG 1.4.11).
    assert.match(panelDarkBlock, /--dait-input-border: #828c88;/);
    assert.match(panelDarkBlock, /color-scheme: dark;/);
    assert.match(panelLightBlock, /--dait-bg: #f7f3e9;[\s\S]*?--dait-rail: #ede6d6;[\s\S]*?--dait-surface: #fcf9f1;[\s\S]*?--dait-input-bg: #fffdf8;[\s\S]*?--dait-input-border: #716b5d;[\s\S]*?--dait-text: #24211b;[\s\S]*?--dait-heading: #171410;[\s\S]*?--dait-placeholder: #595449;/);
    assert.match(panelLightBlock, /--dait-danger: #9c2222;/);
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
    assert.equal(/\.theme-light\.dait-(settings|quick-settings-modal-root|polish-result-panel|input-action-menu|polish-preset-menu)/.test(injectedCss), false);
    assert.equal(/\.dait-(settings|quick-settings-modal-root|quick-popover|polish-result-panel|input-action-menu|polish-preset-menu)\[data-dait-discord-theme/.test(injectedCss), false);
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
    // Segmented options are as wide as their labels, the spare width shared out (theme audit).
    assert.match(injectedCss, /\.dait-segmented \{[\s\S]*?grid-auto-columns: auto;[\s\S]*?height: var\(--dait-control-h\);/);
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
    assert.match(panelLightBlock, /--dait-backdrop: rgba\(23, 20, 16, 0\.42\);/);
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
    assert.match(injectedCss, /\.theme-dark\.dait-polish-button:hover,[\s\S]*?\.theme-midnight\.dait-public-bilingual-button:focus-visible,[\s\S]*?background: color-mix\(in srgb, #227a5f 24%, rgba\(255, 255, 255, 0\.08\)\);/);
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
    assert.match(injectedCss, /\.dait-polish-result-panel \{[\s\S]*?background: var\(--dait-surface\);[\s\S]*?border: 2px solid var\(--dait-input-border\);[\s\S]*?box-shadow: var\(--dait-shadow\);[\s\S]*?color: var\(--dait-text\);/);
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
    assert.match(injectedCss, /\.dait-input-action-group\[data-dait-density="compact"\] \{[\s\S]*?max-width: 138px;/);
    assert.match(injectedCss, /\.dait-input-action-group\[data-dait-density="minimal"\] \{[\s\S]*?max-width: 34px;/);
    assert.match(injectedCss, /\.dait-input-action-menu \{[\s\S]*?position: fixed;/);
    assert.match(injectedCss, /\.dait-polish-preset-button \{[\s\S]*?max-width: 20px;/);
    assert.match(injectedCss, /\.dait-polish-preset-menu \{[\s\S]*?position: fixed;/);
    assert.match(injectedCss, /\.dait-public-bilingual-button \{/);
}

module.exports = { title: "Theme variables, settings panel & stylesheet contracts", run };
