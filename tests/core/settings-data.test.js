"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { DEFAULT_SETTINGS, PROVIDER_DEFAULTS } = require("../../src/constants");

const HOUR = 60 * 60 * 1000;

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

// Just enough DOM for settings rows: elements, [data-dait-path] and class selectors, select values, events.
function createFakeDocument() {
    const elements = [];
    const matches = (element, selector) => {
        const path = /^\[data-dait-path(?:='([^']*)')?\]$/.exec(selector);
        if (path) return typeof element.dataset.daitPath === "string" && (path[1] === undefined || element.dataset.daitPath === path[1]);
        if (selector.startsWith(".")) return String(element.className || "").split(/\s+/).includes(selector.slice(1));
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
            textContent: "",
            classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
            appendChild(child) {
                this.children.push(child);
                child.parentNode = this;
                return child;
            },
            setAttribute(name, value) { this.attributes[name] = String(value); },
            getAttribute(name) { return this.attributes[name]; },
            addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); },
            removeEventListener() {},
            dispatch(type) {
                (this.listeners[type] || []).forEach(handler => handler({ type, target: this, preventDefault() {}, stopPropagation() {} }));
            },
            querySelectorAll(selector) { return descendants(this).filter(node => !node.removed && matches(node, selector)); },
            closest() { return null; },
            remove() { this.removed = true; },
            replaceWith(next) {
                const parent = this.parentNode;
                const index = parent ? parent.children.indexOf(this) : -1;
                if (index < 0) return;
                parent.children.splice(index, 1, next);
                next.parentNode = parent;
                this.parentNode = null;
                [this, ...descendants(this)].forEach(node => { node.removed = true; });
            }
        };
        if (element.tagName === "SELECT") {
            Object.defineProperty(element, "value", {
                get() { return (element.children.find(option => option.selected) || element.children[0])?.value ?? ""; },
                set(next) { element.children.forEach(option => { option.selected = String(option.value) === String(next); }); }
            });
        }
        elements.push(element);
        return element;
    };
    return {
        elements,
        activeElement: null,
        createElement,
        addEventListener() {},
        removeEventListener() {},
        getElementById: () => null,
        querySelectorAll(selector) { return elements.filter(node => !node.removed && matches(node, selector)); }
    };
}

// BetterDiscord's Data API: one JSON object per data name; save() returns undefined like the real one.
function createFakeDataApi(initial = {}) {
    const files = JSON.parse(JSON.stringify(initial));
    const failures = { load: new Set(), save: new Set(), delete: new Set() };
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    return {
        files,
        failures,
        Data: {
            load(name, key) {
                if (failures.load.has(name)) throw new Error(`unreadable ${name}`);
                return clone(files[name]?.[key]);
            },
            save(name, key, value) {
                if (failures.save.has(name)) throw new Error(`cannot write ${name}`);
                (files[name] ||= {})[key] = clone(value);
            },
            delete(name, key) {
                if (failures.delete.has(name)) throw new Error(`cannot delete from ${name}`);
                if (files[name]) delete files[name][key];
            }
        }
    };
}

function cachePayload(items, ttlHours = 48) {
    const strings = [];
    const index = value => {
        const found = strings.indexOf(value);
        if (found >= 0) return found;
        strings.push(value);
        return strings.length - 1;
    };
    return {
        version: 3,
        savedAt: Date.now(),
        ttlHours,
        maxEntries: 4000,
        strings,
        entries: items.map(item => ({ k: item.key.split("\n---\n").map(index), v: index(item.value), c: item.c, t: item.t, e: item.e }))
    };
}

function quietPlugin() {
    const plugin = new Plugin();
    plugin.warnSanitized = () => {};
    plugin.scheduleTranslationCachePersist = () => {};
    return plugin;
}

// --- Channel rule (UI-SPEC Q2) -------------------------------------------------------------------

test("channel rule: 'enabled' allow-lists, 'disabled' always wins, 'inherit' follows the main switch", () => {
    const plugin = quietPlugin();
    plugin.getCurrentRouteKey = () => "g1:c1:";
    const cases = [
        ["inherit", false, false],
        ["inherit", true, true],
        ["enabled", false, true],
        ["enabled", true, true],
        ["disabled", false, false],
        ["disabled", true, false]
    ];
    for (const [mode, mainSwitch, expected] of cases) {
        const label = `${mode} / main ${mainSwitch ? "on" : "off"}`;
        plugin.settings.ui.autoTranslateMessages = mainSwitch;
        plugin.settings.ui.channelAutoTranslatePolicies = mode === "inherit" ? {} : { "g1:c1": { mode } };
        plugin.settings.translation.enabled = true;
        assert.equal(plugin.isCurrentChannelAutoTranslateAllowed(), expected, label);
        assert.equal(plugin.isAutoTranslateEnabled(), expected, label);
        // Translation itself switched off stops everything.
        plugin.settings.translation.enabled = false;
        assert.equal(plugin.isAutoTranslateEnabled(), false, `${label}, translation off`);
    }
});

test("main switch off keeps an allow-listed channel running; 'inherit' then stops it", () => {
    const plugin = quietPlugin();
    plugin.getCurrentRouteKey = () => "g1:c1:";
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    const cancels = [];
    plugin.cancelAutoTranslationRuntimeWork = reason => { cancels.push(reason); return true; };
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.ui.channelAutoTranslatePolicies = { "g1:c1": { mode: "enabled" } };

    plugin.setSetting("ui.autoTranslateMessages", false);
    assert.deepEqual(cancels, []);
    assert.equal(plugin.isAutoTranslateEnabled(), true);
    assert.equal(plugin.getAutoTranslateConcurrency() > 0, true);

    plugin.setSetting("ui.currentChannelAutoTranslatePolicy", "inherit");
    assert.deepEqual(cancels, ["channel-policy-disabled"]);
    assert.equal(plugin.isAutoTranslateEnabled(), false);
    assert.equal(plugin.getAutoTranslateConcurrency(), 0);
});

// --- lifecycle-2 ---------------------------------------------------------------------------------

test("channel rule control stays bound to the channel it was built for (quick settings closed after a channel switch)", t => {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    let route = "g1:A:";
    plugin.getCurrentRouteKey = () => route;
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.settings.ui.channelAutoTranslatePolicies = { "g1:B": { mode: "disabled" } };

    const root = doc.createElement("div");
    root.appendChild(plugin.createCurrentChannelPolicyRow());
    // The channel rule is a segmented control (role=radiogroup) of three radio buttons.
    const [rule] = root.querySelectorAll("[data-dait-path='ui.currentChannelAutoTranslatePolicy']");
    assert.equal(rule.getAttribute("role"), "radiogroup");
    const checked = () => rule.children.filter(button => button.getAttribute("aria-checked") === "true").map(button => button.dataset.daitValue);
    assert.deepEqual(checked(), ["inherit"]);

    // Discord moves to channel B while the modal is open; closing it commits every control. (No scan has run
    // yet, so the control has not been rebuilt for B; see the refreshChannelRuleControls tests below.)
    route = "g1:B:";
    plugin.commitSettingsControls(root);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:B": { mode: "disabled" } });
    assert.equal(rule.dataset.daitRouteKey, "g1:A:");

    // Editing the control now changes A, the channel it shows.
    rule.children.find(button => button.dataset.daitValue === "enabled").dispatch("click");
    assert.deepEqual(checked(), ["enabled"]);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:B": { mode: "disabled" }, "g1:A": { mode: "enabled" } });

    // A change for B made elsewhere does not repaint the A-bound control, so a later commit cannot copy it.
    plugin.setSetting("ui.currentChannelAutoTranslatePolicy", "inherit");
    assert.deepEqual(checked(), ["enabled"]);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:A": { mode: "enabled" } });
    plugin.commitSettingsControls(root);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:A": { mode: "enabled" } });
});

test("after a channel switch the 'current channel' rule control is rebuilt for the channel now open", t => {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    let route = "g1:A:";
    plugin.getCurrentRouteKey = () => route;
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.settings.ui.channelAutoTranslatePolicies = { "g1:B": { mode: "disabled" } };
    const selectorFor = "[data-dait-path='ui.currentChannelAutoTranslatePolicy']";
    const checked = rule => rule.children.filter(button => button.getAttribute("aria-checked") === "true").map(button => button.dataset.daitValue);

    const section = doc.createElement("section");
    section.appendChild(doc.createElement("h3"));
    section.appendChild(plugin.createCurrentChannelPolicyRow());
    section.appendChild(plugin.createCheckboxRow("ui.historyBackfillEnabled", "History"));
    const [first] = section.querySelectorAll(selectorFor);
    assert.equal(first.getAttribute("role"), "radiogroup");
    assert.deepEqual(checked(first), ["inherit"]);
    assert.equal(plugin.refreshChannelRuleControls(), 0);

    // A notification click moves Discord to channel B while quick settings stays open.
    route = "g1:B:";
    assert.equal(plugin.refreshChannelRuleControls(), 1);
    const controls = section.querySelectorAll(selectorFor);
    assert.equal(controls.length, 1);
    const [rule] = controls;
    assert.notEqual(rule, first);
    assert.equal(rule.dataset.daitRouteKey, "g1:B:");
    assert.deepEqual(checked(rule), ["disabled"]);
    // The whole row was swapped in place: same position, nothing added.
    assert.equal(section.children.length, 3);
    // Editing it changes B, the channel it now shows; A keeps no rule.
    rule.children.find(button => button.dataset.daitValue === "enabled").dispatch("click");
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:B": { mode: "enabled" } });
    assert.equal(plugin.refreshChannelRuleControls(), 0);

    // A screen without a channel has nothing to set a rule for: every choice is disabled.
    route = "@me::";
    assert.equal(plugin.refreshChannelRuleControls(), 1);
    const [none] = section.querySelectorAll(selectorFor);
    assert.equal(plugin.isChannelRuleControlDisabled(none), true);
    assert.equal(none.children.every(button => button.disabled === true), true);
    assert.equal(plugin.refreshChannelRuleControls(), 0);
    route = "g1:A:";
    assert.equal(plugin.refreshChannelRuleControls(), 1);
    const [back] = section.querySelectorAll(selectorFor);
    assert.equal(plugin.isChannelRuleControlDisabled(back), false);
    assert.equal(back.children.some(button => button.disabled), false);
});

test("scans held while quick settings is open still rebuild the channel rule control after a switch", t => {
    const doc = createFakeDocument();
    useGlobals(t, { document: doc });
    const plugin = quietPlugin();
    let route = "g1:A:";
    plugin.getCurrentRouteKey = () => route;
    plugin.isStarted = true;
    Object.assign(plugin, {
        isDiscordMediaViewerQuiet: () => false,
        isDiscordMediaViewerOpen: () => false,
        isQuickSettingsPanelOpen: () => true,
        logSlowOperation() {}
    });
    const section = doc.createElement("section");
    section.appendChild(plugin.createCurrentChannelPolicyRow());
    route = "g1:B:";
    plugin.scanDiscordUi();
    assert.equal(plugin.quickSettingsScanDeferred, true);
    const [select] = section.querySelectorAll("[data-dait-path='ui.currentChannelAutoTranslatePolicy']");
    assert.equal(select.dataset.daitRouteKey, "g1:B:");
});

// --- reset-1 + lifecycle-7 -------------------------------------------------------------------------

function stubResetEffects(plugin) {
    const calls = [];
    [
        "unpatchContextMenus",
        "patchMessageContextMenu",
        "refreshLocalizedUi",
        "disableDiagnosticLogging",
        "applyMessageButtonVisibilityToButtons",
        "syncAllTranslationSourceVisibility",
        "syncAllTranslationDisplaySettings",
        "hideAutoTranslationWarningLines",
        "clampTranslationCacheExpiryToCurrentTtl",
        "pruneTranslationCache",
        "invalidateAutoTranslationQueue",
        "queueScan"
    ].forEach(name => { plugin[name] = () => { calls.push(name); }; });
    return calls;
}

function customizeSettings(plugin) {
    const settings = plugin.settings;
    Object.assign(settings.translation, {
        provider: "microsoft",
        apiKey: "sk-fake-ms",
        region: "eastasia",
        endpoint: "https://fake-ms.example/translate",
        targetLanguage: "English",
        providerProfiles: {
            deepseek: { apiKey: "sk-fake-ds", endpoint: "https://custom.example/v1", model: "custom-model" },
            deepl: { apiKey: "sk-fake-dl", deeplPlan: "pro" },
            broken: "not-a-profile"
        }
    });
    settings.translation.promptTemplates = [
        ...settings.translation.promptTemplates,
        { id: "translation-custom-1", serial: "009", name: "Mine", prompt: "my custom prompt" }
    ];
    settings.translation.activePromptTemplate = "translation-custom-1";
    settings.translation.prompt = "my custom prompt";
    Object.assign(settings.polish, { apiKey: "sk-fake-polish", enabled: false });
    settings.googleTranslate.keyPoolText = "Main|AIza-fake-1|400000";
    settings.googleTranslate.keys = [{ label: "Main", apiKey: "AIza-fake-1", monthlyLimit: 400000, usedChars: 12345, monthKey: plugin.getCurrentMonthKey() }];
    settings.googleTranslate.defaultMonthlyLimit = 400000;
    settings.googleTranslate.allowPrefetch = false;
    Object.assign(settings.ui, {
        language: "en",
        injectMessageContextMenu: false,
        diagnosticsEnabled: true,
        maskTranslations: true,
        messageButtonVisibility: "hover",
        autoTranslateMessages: true,
        publicBilingualInputButton: true,
        channelAutoTranslatePolicies: { "g:c": { mode: "disabled" } },
        translationCacheMaxEntries: 200
    });
}

test("resetSettingsToDefaults keeps keys, the Google pool with usage and the templates; resets the rest", () => {
    const plugin = quietPlugin();
    const calls = stubResetEffects(plugin);
    let saved = null;
    plugin.saveData = (key, value) => {
        if (key === "settings") saved = JSON.parse(JSON.stringify(value));
        return true;
    };
    customizeSettings(plugin);

    assert.equal(plugin.resetSettingsToDefaults(), true);
    const settings = plugin.settings;
    // Defaults are back.
    assert.equal(settings.translation.provider, DEFAULT_SETTINGS.translation.provider);
    assert.equal(settings.translation.targetLanguage, DEFAULT_SETTINGS.translation.targetLanguage);
    assert.equal(settings.translation.activePromptTemplate, DEFAULT_SETTINGS.translation.activePromptTemplate);
    assert.equal(settings.translation.prompt, DEFAULT_SETTINGS.translation.prompt);
    assert.equal(settings.polish.enabled, true);
    assert.equal(settings.googleTranslate.allowPrefetch, true);
    assert.equal(settings.ui.injectMessageContextMenu, true);
    assert.equal(settings.ui.diagnosticsEnabled, false);
    assert.equal(settings.ui.maskTranslations, false);
    assert.equal(settings.ui.autoTranslateMessages, false);
    assert.deepEqual(settings.ui.channelAutoTranslatePolicies, {});
    assert.equal(settings.ui.translationCacheMaxEntries, DEFAULT_SETTINGS.ui.translationCacheMaxEntries);
    // Credentials are kept: the default provider starts with its saved key, others keep theirs in profiles.
    // A key keeps the endpoint and model it was used with, so it is never sent to another host.
    assert.equal(settings.translation.apiKey, "sk-fake-ds");
    assert.equal(settings.translation.endpoint, "https://custom.example/v1");
    assert.equal(settings.translation.model, "custom-model");
    assert.equal(settings.translation.providerProfiles.microsoft.apiKey, "sk-fake-ms");
    assert.equal(settings.translation.providerProfiles.microsoft.region, "eastasia");
    assert.equal(settings.translation.providerProfiles.microsoft.endpoint, "https://fake-ms.example/translate");
    assert.equal(settings.translation.providerProfiles.deepl.apiKey, "sk-fake-dl");
    assert.equal(settings.translation.providerProfiles.deepl.deeplPlan, "pro");
    assert.equal(settings.translation.providerProfiles.deepseek.endpoint, "https://custom.example/v1");
    assert.equal(settings.translation.providerProfiles.deepseek.model, "custom-model");
    assert.equal(settings.translation.providerProfiles.broken, undefined);
    // The polish key was used with the preset endpoint and stays with it.
    assert.equal(settings.polish.endpoint, DEFAULT_SETTINGS.polish.endpoint);
    assert.equal(settings.polish.apiKey, "sk-fake-polish");
    assert.equal(settings.googleTranslate.keys.length, 1);
    assert.equal(settings.googleTranslate.keys[0].apiKey, "AIza-fake-1");
    assert.equal(settings.googleTranslate.keys[0].usedChars, 12345);
    assert.equal(settings.googleTranslate.defaultMonthlyLimit, 400000);
    assert.ok(settings.translation.promptTemplates.some(template => template.id === "translation-custom-1" && template.prompt === "my custom prompt"));
    assert.ok(DEFAULT_SETTINGS.translation.promptTemplates.every(template => settings.translation.promptTemplates.some(kept => kept.id === template.id)));
    // The UI language is a reading preference and stays.
    assert.equal(settings.ui.language, "en");
    // Written to disk right away.
    assert.equal(saved.translation.apiKey, "sk-fake-ds");
    assert.equal(saved.googleTranslate.keys[0].usedChars, 12345);
    // The runtime follows the new values like setSetting would.
    for (const name of ["unpatchContextMenus", "patchMessageContextMenu", "disableDiagnosticLogging", "applyMessageButtonVisibilityToButtons", "syncAllTranslationDisplaySettings", "pruneTranslationCache", "invalidateAutoTranslationQueue", "queueScan"]) {
        assert.ok(calls.includes(name), name);
    }
    assert.equal(calls.includes("refreshLocalizedUi"), false);
});

test("resetSettingsToDefaults({ keepCredentials: false }) clears secrets; keepLanguage: false refreshes the UI language", () => {
    const plugin = quietPlugin();
    const calls = stubResetEffects(plugin);
    plugin.saveData = () => true;
    customizeSettings(plugin);
    plugin.resetSettingsToDefaults({ keepCredentials: false, keepLanguage: false });
    assert.equal(plugin.settings.translation.apiKey, "");
    assert.deepEqual(plugin.settings.translation.providerProfiles, {});
    assert.equal(plugin.settings.polish.apiKey, "");
    assert.deepEqual(plugin.settings.googleTranslate.keys, []);
    assert.equal(plugin.settings.translation.promptTemplates.some(template => template.id === "translation-custom-1"), false);
    assert.equal(plugin.settings.ui.language, DEFAULT_SETTINGS.ui.language);
    assert.ok(calls.includes("refreshLocalizedUi"));
});

test("reset: the button keeps credentials, says so, and open controls cannot commit old values back", async t => {
    const doc = createFakeDocument();
    const confirms = [];
    useGlobals(t, { document: doc, window: { confirm: message => { confirms.push(message); return true; } } });
    const plugin = quietPlugin();
    stubResetEffects(plugin);
    plugin.saveData = () => true;
    plugin.replaceSettingsPanelElement = () => null;
    customizeSettings(plugin);
    plugin.settings.ui.language = "zh-CN";

    // An open quick-settings control still showing the old value.
    const root = doc.createElement("div");
    const mask = root.appendChild(doc.createElement("input"));
    mask.type = "checkbox";
    mask.dataset.daitPath = "ui.maskTranslations";
    mask.checked = true;

    // Reset sits in the danger zone at the end of the data tab.
    const dangerZone = plugin.createSettingsDangerZone();
    const [reset] = dangerZone.querySelectorAll(".dait-settings-reset-button");
    reset.dispatch("click");
    // The reset dialog is asynchronous (it resolves after the confirmation).
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(confirms.length, 1);
    assert.match(confirms[0], /API Key/);
    assert.match(confirms[0], /Google Key/);
    assert.match(confirms[0], /提示词模板/);
    assert.match(plugin.t("resetConfirm"), /保留/);
    assert.equal(plugin.settings.translation.apiKey, "sk-fake-ds");
    assert.equal(plugin.settings.ui.maskTranslations, false);
    assert.equal(mask.checked, false);
    // Closing quick settings commits the open controls; the reset values survive.
    plugin.commitSettingsControls(root);
    assert.equal(plugin.settings.ui.maskTranslations, false);
    plugin.settings.ui.language = "en";
    assert.match(plugin.t("resetConfirm"), /API keys.*Google key pool.*prompt templates are kept/);
});

// --- settings-1 ------------------------------------------------------------------------------------

test("damaged settings data loads: bad templates are dropped and an array 'ui' is repaired", () => {
    const plugin = quietPlugin();
    plugin.loadData = key => key === "settings"
        ? {
            ui: [],
            translation: { promptTemplates: [null, "oops", { id: "t-kept", name: "Kept", prompt: "kept prompt" }], activePromptTemplate: "t-kept" },
            polish: { promptTemplates: [null, 7] }
        }
        : null;
    let saved = null;
    plugin.saveData = (key, value) => {
        if (key === "settings") saved = JSON.parse(JSON.stringify(value));
        return true;
    };
    assert.equal(plugin.loadSettings(), true);
    assert.deepEqual(plugin.settings.translation.promptTemplates.map(template => template.id), ["t-kept"]);
    assert.equal(plugin.settings.translation.promptTemplates[0].serial, "001");
    assert.deepEqual(plugin.settings.polish.promptTemplates.map(template => template.id), DEFAULT_SETTINGS.polish.promptTemplates.map(template => template.id));
    assert.equal(Array.isArray(plugin.settings.ui), false);
    assert.equal(plugin.settings.ui.language, DEFAULT_SETTINGS.ui.language);
    assert.equal(Array.isArray(saved.ui), false);
    assert.equal(typeof saved.ui.autoTranslateMessages, "boolean");
    // Template helpers tolerate stray entries too.
    plugin.settings.translation.promptTemplates.push(null);
    assert.doesNotThrow(() => plugin.getPromptTemplates("translation"));
});

test("unreadable settings: saves stay blocked and the user is told once per episode", t => {
    const bdApi = createFakeDataApi();
    bdApi.failures.load.add("DiscordAITranslator");
    bdApi.failures.save.add("DiscordAITranslator");
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();
    const toasts = [];
    plugin.showToast = (message, type) => { toasts.push([message, type]); };
    assert.equal(plugin.loadSettings(), false);
    assert.equal(plugin.settingsLoadBlocked, true);
    assert.deepEqual(toasts, [[plugin.t("settingsLoadBlocked"), "error"]]);
    assert.equal(plugin.saveSettings(), false);
    assert.equal(plugin.saveSettings({ debounce: true }), false);
    assert.equal(toasts.length, 1);
    // The next start tries again and tells the user again.
    assert.equal(plugin.loadSettings(), false);
    assert.equal(toasts.length, 2);
    // Once readable, saves work and no notice is shown.
    bdApi.failures.load.delete("DiscordAITranslator");
    bdApi.failures.save.delete("DiscordAITranslator");
    assert.equal(plugin.loadSettings(), true);
    assert.equal(plugin.saveSettings(), true);
    assert.equal(toasts.length, 2);
});

// --- cache-2 ---------------------------------------------------------------------------------------

test("cache hits never extend an entry past the chosen lifetime", () => {
    const plugin = quietPlugin();
    plugin.settings.ui.translationCacheTtlHours = 3;
    plugin.setTranslationCache("ttl-key", "value");
    assert.equal(plugin.getTranslationCacheValue("ttl-key"), "value");
    assert.ok(plugin.translationCacheMeta.get("ttl-key").expiresAt <= Date.now() + 3 * HOUR);

    // Longer lifetimes still get the 6 h extension on a hit.
    plugin.settings.ui.translationCacheTtlHours = 48;
    plugin.translationCacheMeta.get("ttl-key").expiresAt = Date.now() + 1000;
    const before = Date.now();
    plugin.getTranslationCacheValue("ttl-key");
    assert.ok(plugin.translationCacheMeta.get("ttl-key").expiresAt >= before + 6 * HOUR);
});

test("loading the cache clamps stored expiry times to the current lifetime", () => {
    const plugin = quietPlugin();
    let scheduled = 0;
    plugin.scheduleTranslationCachePersist = () => { scheduled++; };
    plugin.settings.ui.translationCacheTtlHours = 3;
    const now = Date.now();
    const payload = cachePayload([
        { key: "k-fresh", value: "v1", c: now - HOUR, t: now - HOUR, e: now + 7 * 24 * HOUR },
        { key: "k-old", value: "v2", c: now - 5 * HOUR, t: now - 5 * HOUR, e: now + 24 * HOUR }
    ], 168);
    plugin.loadData = key => key === "translationCache" ? payload : null;
    plugin.loadTranslationCache();
    assert.ok(plugin.translationCacheMeta.get("k-fresh").expiresAt <= now - HOUR + 3 * HOUR);
    assert.equal(plugin.translationCache.has("k-old"), false);
    assert.ok(scheduled >= 1);
});

// --- cache-3 ---------------------------------------------------------------------------------------

test("the cache limit counts messages, not the 2-3 keys each message uses", () => {
    const plugin = quietPlugin();
    plugin.settings.ui.translationCacheMaxEntries = 100;
    for (let index = 0; index < 150; index++) {
        plugin.setTranslationCache(`auto\n---\nmsg-${index}`, `translation ${index}`);
        plugin.setTranslationCache(`auto-text\n---\ntext-${index}`, `translation ${index}`);
    }
    assert.equal(plugin.getTranslationCacheMessageCount(), 100);
    assert.equal(plugin.translationCache.size, 200);
    assert.equal(plugin.translationCache.has("auto\n---\nmsg-49"), false);
    assert.equal(plugin.translationCache.has("auto-text\n---\ntext-49"), false);
    assert.equal(plugin.translationCache.has("auto\n---\nmsg-50"), true);
    assert.equal(plugin.translationCacheMeta.size, 200);
    plugin.translationCacheStats = { hits: 0, misses: 0 };
    plugin.persistentTranslationCacheCount = 0;
    assert.match(plugin.getTranslationCacheStatsText(), /100/);

    // Many messages with the same short translation still cannot grow the key count without bound.
    plugin.saveData = () => true;
    plugin.showToast = () => {};
    assert.equal(plugin.clearTranslationCache(), true);
    assert.equal(plugin.getTranslationCacheMessageCount(), 0);
    for (let index = 0; index < 500; index++) plugin.setTranslationCache(`auto\n---\nsame-${index}`, "ok");
    assert.equal(plugin.translationCache.size, 400);
    assert.equal(plugin.getTranslationCacheMessageCount(), 1);
});

test("the message count stays exact through overwrites, deletes, aliases and expiry", () => {
    const plugin = quietPlugin();
    plugin.settings.ui.translationCacheMaxEntries = 100;
    let seed = 7;
    const random = limit => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % limit;
    };
    for (let step = 0; step < 3000; step++) {
        const key = `key-${random(400)}`;
        const action = random(10);
        if (action < 6) plugin.setTranslationCache(key, `value-${random(160)}`);
        else if (action < 7) plugin.deleteTranslationCacheCandidates(key, `key-${random(400)}`);
        else if (action < 8) plugin.promoteTranslationCacheAlias(key, `key-${random(400)}`);
        else if (action < 9) plugin.getTranslationCacheValue(key);
        else if (plugin.translationCacheMeta.has(key)) plugin.translationCacheMeta.get(key).expiresAt = 1;
        if (step % 500 === 0) plugin.pruneTranslationCache({ scanExpired: true });
        assert.equal(plugin.getTranslationCacheMessageCount(), new Set(plugin.translationCache.values()).size, `step ${step}`);
        assert.ok(plugin.getTranslationCacheMessageCount() <= 100, `step ${step}`);
    }
});

test("existing caches keep their data: 3000 messages in 6000 keys fit the default 4000-message limit", () => {
    const plugin = quietPlugin();
    const now = Date.now();
    const items = [];
    for (let index = 0; index < 3000; index++) {
        items.push({ key: `auto\n---\nmessage:g:c:${index}\n---\nhash-${index}`, value: `translation ${index}`, c: now, t: now + index, e: now + 40 * HOUR });
        items.push({ key: `auto-text\n---\ntext:${index}\n---\nhash-${index}`, value: `translation ${index}`, c: now, t: now + index, e: now + 40 * HOUR });
    }
    plugin.loadData = key => key === "translationCache" ? cachePayload(items) : null;
    plugin.loadTranslationCache();
    assert.equal(plugin.translationCache.size, 6000);
    assert.equal(plugin.getTranslationCacheMessageCount(), 3000);
    assert.equal(plugin.persistentTranslationCacheCount, 3000);
    let savedPayload = null;
    plugin.saveData = (key, value) => {
        if (key === "translationCache") savedPayload = value;
        return true;
    };
    plugin.translationCacheDirty = true;
    assert.equal(plugin.flushTranslationCache({ retryOnError: false }), true);
    assert.equal(savedPayload.entries.length, 6000);
    assert.equal(plugin.persistentTranslationCacheCount, 3000);
});

// --- persist-2 -------------------------------------------------------------------------------------

test("pagehide saves pending cache, Google usage, settings and diagnostics; stop() removes the listener", t => {
    const windowListeners = new Map();
    const fakeWindow = {
        addEventListener(type, handler) { windowListeners.set(type, handler); },
        removeEventListener(type, handler) { if (windowListeners.get(type) === handler) windowListeners.delete(type); }
    };
    useGlobals(t, { window: fakeWindow, document: createFakeDocument() });
    const plugin = quietPlugin();
    Object.assign(plugin, {
        loadSettings: () => true,
        migrateLegacyDataStores: () => ({}),
        loadDiagnosticLogs() {},
        loadTranslationCache() {},
        injectStyles() {},
        removeStyles() {},
        patchMessageContextMenu() {},
        startObserver() {},
        queueScan() {},
        showToast() {}
    });
    const flushed = [];
    plugin.flushTranslationCache = options => { flushed.push(["cache", options]); return true; };
    plugin.flushGoogleTranslateRuntimeState = options => { flushed.push(["google", options]); return true; };
    plugin.flushSettings = options => { flushed.push(["settings", options]); return true; };
    plugin.flushDiagnosticLogs = options => { flushed.push(["diagnostics", options]); return true; };
    plugin.start();
    assert.equal(typeof windowListeners.get("pagehide"), "function");
    assert.equal(typeof windowListeners.get("beforeunload"), "function");
    windowListeners.get("pagehide")({ type: "pagehide" });
    assert.deepEqual(flushed.map(([name]) => name), ["cache", "google", "settings", "diagnostics"]);
    assert.ok(flushed.every(([, options]) => options?.retryOnError === false));
    plugin.stop();
    assert.equal(windowListeners.has("pagehide"), false);
    assert.equal(windowListeners.has("beforeunload"), false);
});

test("pagehide writes a busy-deferred cache right away", () => {
    const plugin = quietPlugin();
    plugin.shouldDeferHeavyPersistence = () => true;
    const saves = [];
    plugin.saveData = key => { saves.push(key); return true; };
    plugin.setTranslationCache("pending-key", "pending translation");
    plugin.translationCacheDirty = true;
    // A scheduled write while Discord is busy is pushed back...
    assert.equal(plugin.flushTranslationCache({ scheduled: true }), true);
    assert.deepEqual(saves, []);
    assert.equal(plugin.translationCacheDirty, true);
    // ...but the page going away writes it now.
    const results = plugin.flushPendingPersistence("pagehide");
    assert.equal(results.cache, true);
    assert.ok(saves.includes("translationCache"));
    assert.equal(plugin.translationCacheDirty, false);
});

// --- persist-1 -------------------------------------------------------------------------------------

test("the cache and diagnostics use their own data files; settings saves no longer carry them", t => {
    const bdApi = createFakeDataApi();
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();
    assert.equal(plugin.saveData("translationCache", { version: 3, entries: [] }), true);
    assert.equal(plugin.saveData("diagnosticLogs", { version: 1, logs: [] }), true);
    assert.equal(plugin.saveData("settings", { ui: {} }), true);
    assert.deepEqual(Object.keys(bdApi.files).sort(), ["DiscordAITranslator", "DiscordAITranslator.cache", "DiscordAITranslator.diagnostics"]);
    assert.deepEqual(Object.keys(bdApi.files.DiscordAITranslator), ["settings"]);
    assert.deepEqual(plugin.loadData("translationCache"), { version: 3, entries: [] });
});

test("migration moves the old cache and diagnostics out of the settings file without losing entries", t => {
    const now = Date.now();
    const legacyCache = cachePayload([
        { key: "auto\n---\nk1", value: "one", c: now, t: now + 1, e: now + 40 * HOUR },
        { key: "auto\n---\nk2", value: "two", c: now, t: now + 2, e: now + 40 * HOUR }
    ]);
    const legacyDiagnostics = { version: 1, compressed: 2, logs: [{ ts: now - 10, action: "old.entry", status: "ok", key: "", count: 1, meta: {} }] };
    const bdApi = createFakeDataApi({
        DiscordAITranslator: { settings: { ui: { settingsVersion: 2, language: "en" } }, translationCache: legacyCache, diagnosticLogs: legacyDiagnostics }
    });
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();
    assert.equal(plugin.loadSettings(), true);
    assert.deepEqual(plugin.migrateLegacyDataStores(), { translationCache: "migrated", diagnosticLogs: "migrated" });
    assert.deepEqual(Object.keys(bdApi.files.DiscordAITranslator), ["settings"]);
    assert.deepEqual(bdApi.files["DiscordAITranslator.cache"].translationCache, legacyCache);
    assert.deepEqual(bdApi.files["DiscordAITranslator.diagnostics"].diagnosticLogs, legacyDiagnostics);
    assert.equal(plugin.settings.ui.language, "en");
    plugin.loadTranslationCache();
    assert.equal(plugin.getTranslationCacheValue("auto\n---\nk1"), "one");
    assert.equal(plugin.getTranslationCacheValue("auto\n---\nk2"), "two");
    // Nothing left to do on the next start.
    assert.deepEqual(plugin.migrateLegacyDataStores(), { translationCache: "none", diagnosticLogs: "none" });
});

test("migration merges an old copy left next to a new one (downgrade and upgrade again)", t => {
    const now = Date.now();
    const current = cachePayload([
        { key: "k-shared", value: "newer", c: now, t: now + 20, e: now + 40 * HOUR },
        { key: "k-current", value: "current only", c: now, t: now + 10, e: now + 40 * HOUR }
    ]);
    const legacy = cachePayload([
        { key: "k-shared", value: "older", c: now, t: now + 5, e: now + 40 * HOUR },
        { key: "k-legacy", value: "legacy only", c: now, t: now + 30, e: now + 40 * HOUR }
    ]);
    // Saved at the same time: neither copy is newer, so the entries of both are kept.
    legacy.savedAt = current.savedAt;
    const bdApi = createFakeDataApi({
        DiscordAITranslator: { translationCache: legacy, diagnosticLogs: { logs: [{ ts: 5, action: "b", status: "ok", count: 1 }, { ts: 1, action: "a", status: "ok", count: 1 }], compressed: 1 } },
        "DiscordAITranslator.cache": { translationCache: current },
        "DiscordAITranslator.diagnostics": { diagnosticLogs: { logs: [{ ts: 3, action: "c", status: "ok", count: 1 }, { ts: 5, action: "b", status: "ok", count: 1 }], compressed: 2 } }
    });
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();
    assert.deepEqual(plugin.migrateLegacyDataStores(), { translationCache: "merged", diagnosticLogs: "merged" });
    assert.equal(bdApi.files.DiscordAITranslator.translationCache, undefined);
    plugin.loadTranslationCache();
    assert.deepEqual([...plugin.translationCache.entries()], [
        ["k-current", "current only"],
        ["k-shared", "newer"],
        ["k-legacy", "legacy only"]
    ]);
    const diagnostics = bdApi.files["DiscordAITranslator.diagnostics"].diagnosticLogs;
    assert.deepEqual(diagnostics.logs.map(entry => entry.action), ["a", "c", "b"]);
    assert.equal(diagnostics.compressed, 3);
});

test("migration keeps the old copy whenever a step fails, and finishes on a later start", t => {
    const now = Date.now();
    const legacy = cachePayload([{ key: "k1", value: "one", c: now, t: now, e: now + 40 * HOUR }]);
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings: {}, translationCache: legacy } });
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();

    bdApi.failures.save.add("DiscordAITranslator.cache");
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "save-failed");
    assert.deepEqual(bdApi.files.DiscordAITranslator.translationCache, legacy);
    // Until the move succeeds the session still reads the old copy.
    assert.deepEqual(plugin.loadData("translationCache"), legacy);
    bdApi.failures.save.delete("DiscordAITranslator.cache");

    bdApi.failures.load.add("DiscordAITranslator.cache");
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "store-unreadable");
    assert.deepEqual(bdApi.files.DiscordAITranslator.translationCache, legacy);
    assert.deepEqual(plugin.loadData("translationCache"), legacy);
    bdApi.failures.load.delete("DiscordAITranslator.cache");

    bdApi.failures.load.add("DiscordAITranslator");
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "legacy-unreadable");
    assert.equal(bdApi.files["DiscordAITranslator.cache"], undefined);
    bdApi.failures.load.delete("DiscordAITranslator");

    bdApi.failures.delete.add("DiscordAITranslator");
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "delete-failed");
    assert.deepEqual(bdApi.files.DiscordAITranslator.translationCache, legacy);
    assert.deepEqual(bdApi.files["DiscordAITranslator.cache"].translationCache, legacy);
    bdApi.failures.delete.delete("DiscordAITranslator");

    // Retrying merges the identical copies without duplicating anything.
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "merged");
    assert.equal(bdApi.files.DiscordAITranslator.translationCache, undefined);
    assert.deepEqual(bdApi.files.DiscordAITranslator.settings, {});
    plugin.loadTranslationCache();
    assert.deepEqual([...plugin.translationCache.entries()], [["k1", "one"]]);
});

test("start() migrates before loading, so the old cache is available right away", t => {
    const now = Date.now();
    const legacy = cachePayload([{ key: "k-start", value: "restored", c: now, t: now, e: now + 40 * HOUR }]);
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings: { ui: { settingsVersion: 2 } }, translationCache: legacy } });
    useGlobals(t, {
        BdApi: bdApi,
        window: { addEventListener() {}, removeEventListener() {} },
        document: createFakeDocument()
    });
    const plugin = quietPlugin();
    Object.assign(plugin, { injectStyles() {}, removeStyles() {}, patchMessageContextMenu() {}, startObserver() {}, queueScan() {}, showToast() {} });
    plugin.start();
    assert.equal(plugin.translationCache.get("k-start"), "restored");
    assert.equal(bdApi.files.DiscordAITranslator.translationCache, undefined);
    plugin.stop();
    assert.deepEqual(Object.keys(bdApi.files.DiscordAITranslator), ["settings"]);
    assert.ok(bdApi.files["DiscordAITranslator.cache"].translationCache.entries.length >= 1);
});

// --- review 1: SD-1 (diagnostics moved while diagnostics are on) -----------------------------------

function startablePlugin() {
    const plugin = quietPlugin();
    Object.assign(plugin, { injectStyles() {}, removeStyles() {}, patchMessageContextMenu() {}, startObserver() {}, queueScan() {}, showToast() {} });
    return plugin;
}

test("start() keeps the moved diagnostics log when the move itself is logged (diagnostics on)", t => {
    const now = Date.now();
    const oldLogs = [0, 1, 2, 3, 4].map(index => ({ ts: now - 1000 + index, action: `old.entry.${index}`, status: "ok", key: "", count: 1, meta: {} }));
    const bdApi = createFakeDataApi({
        DiscordAITranslator: { settings: { ui: { settingsVersion: 2, diagnosticsEnabled: true } }, diagnosticLogs: { version: 1, compressed: 2, logs: oldLogs } }
    });
    useGlobals(t, { BdApi: bdApi, window: { addEventListener() {}, removeEventListener() {} }, document: createFakeDocument() });
    const plugin = startablePlugin();
    plugin.start();
    const actions = plugin.diagnosticLogs.map(entry => entry.action);
    assert.deepEqual(actions.slice(0, 5), oldLogs.map(entry => entry.action));
    assert.ok(actions.includes("data.migrate"));
    assert.equal(plugin.diagnosticCompressedCount, 2);
    assert.equal(bdApi.files.DiscordAITranslator.diagnosticLogs, undefined);
    plugin.stop();
    const stored = bdApi.files["DiscordAITranslator.diagnostics"].diagnosticLogs;
    assert.deepEqual(stored.logs.slice(0, 5).map(entry => entry.action), oldLogs.map(entry => entry.action));
    assert.ok(stored.logs.some(entry => entry.action === "data.migrate"));
});

test("start() keeps the stored diagnostics log when a failing data step logs before it is loaded", t => {
    const now = Date.now();
    const bdApi = createFakeDataApi({
        DiscordAITranslator: { settings: { ui: { settingsVersion: 2, diagnosticsEnabled: true } }, translationCache: cachePayload([{ key: "k1", value: "one", c: now, t: now, e: now + 40 * HOUR }]) },
        "DiscordAITranslator.diagnostics": { diagnosticLogs: { version: 1, compressed: 0, logs: [{ ts: now - 5000, action: "kept.entry", status: "ok", key: "", count: 1, meta: {} }] } }
    });
    // The old cache cannot be removed from the settings file, so every start logs a data.io error first.
    bdApi.failures.delete.add("DiscordAITranslator");
    useGlobals(t, { BdApi: bdApi, window: { addEventListener() {}, removeEventListener() {} }, document: createFakeDocument() });
    const plugin = startablePlugin();
    plugin.start();
    const actions = plugin.diagnosticLogs.map(entry => entry.action);
    assert.equal(actions[0], "kept.entry");
    assert.ok(actions.includes("data.io"));
    plugin.stop();
    assert.equal(bdApi.files["DiscordAITranslator.diagnostics"].diagnosticLogs.logs[0].action, "kept.entry");
});

// --- review 1: SD-2 / SD-3 (credentials kept by a reset) -------------------------------------------

// Every provider key that would be sent somewhere, with the host it would go to.
function keyedHosts(settings) {
    const result = {};
    for (const kind of ["polish", "translation"]) {
        const task = settings[kind];
        for (const provider of Object.keys(PROVIDER_DEFAULTS)) {
            const source = provider === task.provider ? task : task.providerProfiles?.[provider];
            const apiKey = String(source?.apiKey || "");
            if (!apiKey) continue;
            result[`${kind}:${provider}`] = { apiKey, endpoint: String(source.endpoint || PROVIDER_DEFAULTS[provider].endpoint) };
        }
    }
    return result;
}

test("reset keeps a relay key together with its endpoint and model, never with the preset host", () => {
    const plugin = quietPlugin();
    stubResetEffects(plugin);
    plugin.saveData = () => true;
    const relay = { provider: "deepseek", apiKey: "sk-fake-relay", endpoint: "https://relay.example/v1/chat/completions", model: "relay-model" };
    Object.assign(plugin.settings.polish, relay, { apiKey: "sk-fake-relay-polish" });
    Object.assign(plugin.settings.translation, relay, {
        providerProfiles: {
            openaiCompatible: { apiKey: "sk-fake-relay-2", endpoint: "https://relay-2.example/v1/chat/completions", model: "relay-2-model" },
            sakuraLocal: { apiKey: "", endpoint: "http://127.0.0.1:5000/v1/chat/completions" },
            // An endpoint that cannot be read leaves no safe host for the key: the key is dropped.
            microsoft: { apiKey: "sk-fake-ms", endpoint: 42, region: "eastasia" }
        }
    });
    const before = keyedHosts(plugin.settings);

    assert.equal(plugin.resetSettingsToDefaults(), true);
    const after = keyedHosts(plugin.settings);
    for (const [name, pair] of Object.entries(after)) {
        assert.deepEqual(pair, before[name], name);
    }
    // The relay keys are kept, with their hosts.
    assert.equal(plugin.settings.translation.provider, "deepseek");
    assert.equal(plugin.settings.translation.endpoint, relay.endpoint);
    assert.equal(plugin.settings.translation.model, "relay-model");
    assert.equal(plugin.settings.translation.apiKey, "sk-fake-relay");
    assert.equal(plugin.settings.polish.endpoint, relay.endpoint);
    assert.equal(plugin.settings.polish.apiKey, "sk-fake-relay-polish");
    assert.equal(plugin.hasUsableApiConfig("translation"), true);
    assert.equal(plugin.settings.translation.providerProfiles.microsoft.apiKey, undefined);
    assert.equal(plugin.settings.translation.providerProfiles.microsoft.region, "eastasia");
    // A profile without a key keeps nothing but what a reset always keeps.
    assert.equal(plugin.settings.translation.providerProfiles.sakuraLocal, undefined);

    // Switching to the kept profile later brings its own host back, not the preset one.
    plugin.setTaskProvider("translation", "openaiCompatible");
    assert.equal(plugin.settings.translation.endpoint, "https://relay-2.example/v1/chat/completions");
    assert.equal(plugin.settings.translation.model, "relay-2-model");
    assert.equal(plugin.settings.translation.apiKey, "sk-fake-relay-2");
});

test("reset does not bring back a key the user cleared from the active provider", () => {
    const plugin = quietPlugin();
    stubResetEffects(plugin);
    plugin.saveData = () => true;
    plugin.setSetting("translation.apiKey", "sk-fake-old-k1");
    plugin.setTaskProvider("translation", "microsoft");
    plugin.setTaskProvider("translation", "deepseek");
    assert.equal(plugin.settings.translation.apiKey, "sk-fake-old-k1");
    // The stored profile still holds the old key; the live field is what the user sees and cleared.
    plugin.setSetting("translation.apiKey", "");
    assert.equal(plugin.settings.translation.providerProfiles.deepseek.apiKey, "sk-fake-old-k1");

    assert.equal(plugin.resetSettingsToDefaults(), true);
    assert.equal(plugin.settings.translation.apiKey, "");
    assert.equal(plugin.settings.translation.providerProfiles.deepseek?.apiKey, undefined);
    assert.equal(plugin.hasUsableApiConfig("translation"), false);
});

// --- review 1: SD-5 / X7 (merged cache copies keep the detected local models) ----------------------

test("merging the old and new cache copies keeps the detected local models", t => {
    const now = Date.now();
    const localKey = ["sakuraLocal", "http://127.0.0.1:8080/v1/chat/completions", "fp-1"].join("\n---\n");
    const otherKey = ["sakuraLocal", "http://127.0.0.1:5000/v1/chat/completions", "fp-2"].join("\n---\n");
    const current = cachePayload([{ key: "k-current", value: "current", c: now, t: now + 10, e: now + 40 * HOUR }]);
    current.localModels = [{ key: localKey, model: "sakura-14b" }];
    const legacy = cachePayload([{ key: "k-legacy", value: "legacy", c: now, t: now + 20, e: now + 40 * HOUR }]);
    legacy.savedAt = current.savedAt;
    // A copy that also names models: the newer copy's model wins for a server both name.
    legacy.localModels = [{ key: localKey, model: "sakura-7b" }, { key: otherKey, model: "sakura-1.5b" }];
    const bdApi = createFakeDataApi({
        DiscordAITranslator: { translationCache: legacy },
        "DiscordAITranslator.cache": { translationCache: current }
    });
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "merged");
    assert.deepEqual(bdApi.files["DiscordAITranslator.cache"].translationCache.localModels, [
        { key: localKey, model: "sakura-14b" },
        { key: otherKey, model: "sakura-1.5b" }
    ]);
    plugin.loadTranslationCache();
    assert.equal(plugin.localProviderDetectedModels.get(localKey)?.model, "sakura-14b");
    assert.equal(plugin.localProviderDetectedModels.get(otherKey)?.model, "sakura-1.5b");
    // A 0.3.0 copy has no list; the current one is kept as it is.
    const merged = plugin.mergePersistedTranslationCachePayloads(current, cachePayload([]));
    assert.deepEqual(merged.localModels, current.localModels);
});

// --- review 1: SD-8 (a cache cleared in the other version stays cleared) ---------------------------

test("a cache cleared in 0.3.0 after a downgrade stays cleared on the next upgrade", t => {
    const now = Date.now();
    const current = cachePayload([{ key: "k-before-downgrade", value: "cleared translation", c: now - 3 * HOUR, t: now - 2 * HOUR, e: now + 40 * HOUR }]);
    current.savedAt = now - 2 * HOUR;
    // 0.3.0 cannot see the new file; its "Clear translation cache" writes an empty payload to the old key.
    const cleared = cachePayload([]);
    cleared.savedAt = now - HOUR;
    const bdApi = createFakeDataApi({
        DiscordAITranslator: { translationCache: cleared },
        "DiscordAITranslator.cache": { translationCache: current }
    });
    useGlobals(t, { BdApi: bdApi });
    const plugin = quietPlugin();
    assert.equal(plugin.migrateLegacyDataStoreKey("translationCache"), "merged");
    assert.deepEqual(bdApi.files["DiscordAITranslator.cache"].translationCache.entries, []);
    plugin.loadTranslationCache();
    assert.equal(plugin.translationCache.size, 0);

    // What 0.3.0 translated after the clear is kept; nothing from before it comes back.
    const usedAfterClear = cachePayload([{ key: "k-after-clear", value: "new translation", c: now - 50 * 60 * 1000, t: now - 40 * 60 * 1000, e: now + 40 * HOUR }]);
    usedAfterClear.savedAt = now - 30 * 60 * 1000;
    const merged = plugin.mergePersistedTranslationCachePayloads(current, usedAfterClear);
    assert.deepEqual(merged.entries.map(entry => merged.strings[entry.v]), ["new translation"]);

    // The same holds the other way: a cache cleared here while the old copy could not be deleted yet.
    const oldCopy = cachePayload([{ key: "k-old-copy", value: "old copy", c: now - 5 * HOUR, t: now - 4 * HOUR, e: now + 40 * HOUR }]);
    oldCopy.savedAt = now - 4 * HOUR;
    const clearedHere = cachePayload([]);
    clearedHere.savedAt = now - HOUR;
    assert.deepEqual(plugin.mergePersistedTranslationCachePayloads(clearedHere, oldCopy).entries, []);
});

// --- review 1: SD-6 (the 'Always translate' channels are counted in the snapshot and the diagnostics) --------
// Rules stored by v0.3.0 keep their v0.3.0 meaning on upgrade (tests/core/privacy-settings.test.js, PRIV-1).

test("the settings snapshot and the diagnostics export count the 'Always translate' channels", t => {
    const storedUi = {
        settingsVersion: 2,
        autoTranslateMessages: false,
        diagnosticsEnabled: true,
        channelAutoTranslatePoliciesVersion: DEFAULT_SETTINGS.ui.channelAutoTranslatePoliciesVersion,
        // Two channels are allow-listed (one of them also under an old per-message key), one is blocked.
        channelAutoTranslatePolicies: { "g1:c1": { mode: "enabled" }, "g1:c2": { mode: "enabled" }, "g1:c2:m9": { mode: "enabled" }, "g1:c3": { mode: "disabled" } }
    };
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings: { ui: storedUi } } });
    useGlobals(t, { BdApi: bdApi, window: { addEventListener() {}, removeEventListener() {} }, document: createFakeDocument() });
    const plugin = startablePlugin();
    const toasts = [];
    plugin.showToast = (message, type) => { toasts.push([message, type]); };
    plugin.start();
    assert.equal(toasts.length, 1, "only the start toast");
    assert.equal(plugin.getChannelAutoTranslateAllowListCount(), 2);
    assert.equal(plugin.createSettingsSnapshot().effective.allowListedChannels, 2);
    assert.equal(plugin.getDiagnosticLogsSnapshot().settings.allowListedChannels, 2);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, storedUi.channelAutoTranslatePolicies);
    plugin.stop();
});

test("a new install and settings without an 'enabled' rule store the channel-rule version and show no notice", t => {
    for (const stored of [{}, { settings: { ui: { settingsVersion: 2, channelAutoTranslatePolicies: { "g1:c3": { mode: "disabled" } } } } }]) {
        const bdApi = createFakeDataApi({ DiscordAITranslator: stored });
        useGlobals(t, { BdApi: bdApi, window: { addEventListener() {}, removeEventListener() {} }, document: createFakeDocument() });
        const plugin = startablePlugin();
        const toasts = [];
        plugin.showToast = (message, type) => { toasts.push([message, type]); };
        plugin.start();
        assert.equal(toasts.length, 1, JSON.stringify(stored));
        assert.equal(bdApi.files.DiscordAITranslator.settings.ui.channelAutoTranslatePoliciesVersion, DEFAULT_SETTINGS.ui.channelAutoTranslatePoliciesVersion);
        plugin.stop();
    }
});

test("start() still writes diagnostics a previous stop() could not save before it reloads the log", t => {
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings: { ui: { settingsVersion: 2, diagnosticsEnabled: true } } } });
    useGlobals(t, { BdApi: bdApi, window: { addEventListener() {}, removeEventListener() {} }, document: createFakeDocument() });
    const plugin = startablePlugin();
    plugin.settings.ui.diagnosticsEnabled = true;
    plugin.logDiagnostic("unsaved.entry", "ok", {});
    assert.equal(plugin.diagnosticLogsDirty, true);
    plugin.start();
    assert.deepEqual(bdApi.files["DiscordAITranslator.diagnostics"].diagnosticLogs.logs.map(entry => entry.action), ["unsaved.entry"]);
    assert.deepEqual(plugin.diagnosticLogs.map(entry => entry.action), ["unsaved.entry"]);
    plugin.stop();
});
