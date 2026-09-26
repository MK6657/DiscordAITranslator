"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { DEFAULT_SETTINGS } = require("../../src/constants");

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
            remove() { this.removed = true; }
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
    const [select] = root.querySelectorAll("[data-dait-path='ui.currentChannelAutoTranslatePolicy']");
    assert.equal(select.value, "inherit");

    // Discord moves to channel B while the modal is open; closing it commits every control.
    route = "g1:B:";
    plugin.commitSettingsControls(root);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:B": { mode: "disabled" } });
    assert.equal(select.dataset.daitRouteKey, "g1:A:");

    // Editing the control now changes A, the channel it shows.
    select.value = "enabled";
    select.dispatch("change");
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:B": { mode: "disabled" }, "g1:A": { mode: "enabled" } });

    // A change for B made elsewhere does not repaint the A-bound control, so a later commit cannot copy it.
    plugin.setSetting("ui.currentChannelAutoTranslatePolicy", "inherit");
    assert.equal(select.value, "enabled");
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:A": { mode: "enabled" } });
    plugin.commitSettingsControls(root);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, { "g1:A": { mode: "enabled" } });
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
    assert.equal(settings.translation.endpoint, DEFAULT_SETTINGS.translation.endpoint);
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
    assert.equal(settings.translation.apiKey, "sk-fake-ds");
    assert.equal(settings.translation.providerProfiles.microsoft.apiKey, "sk-fake-ms");
    assert.equal(settings.translation.providerProfiles.microsoft.region, "eastasia");
    assert.equal(settings.translation.providerProfiles.deepl.apiKey, "sk-fake-dl");
    assert.equal(settings.translation.providerProfiles.deepl.deeplPlan, "pro");
    assert.equal(settings.translation.providerProfiles.deepseek.endpoint, undefined);
    assert.equal(settings.translation.providerProfiles.deepseek.model, undefined);
    assert.equal(settings.translation.providerProfiles.broken, undefined);
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

    const sidebar = plugin.createSettingsSidebar(null);
    const [reset] = sidebar.querySelectorAll(".dait-settings-sidebar-reset");
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
