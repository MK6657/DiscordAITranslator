"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
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

// BetterDiscord's Data API: one JSON object per data name.
function createFakeDataApi(initial = {}) {
    const files = JSON.parse(JSON.stringify(initial));
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    return {
        files,
        Data: {
            load(name, key) { return clone(files[name]?.[key]); },
            save(name, key, value) { (files[name] ||= {})[key] = clone(value); },
            delete(name, key) { if (files[name]) delete files[name][key]; }
        }
    };
}

function useHost(t, stored) {
    const bdApi = createFakeDataApi({ DiscordAITranslator: stored });
    useGlobals(t, {
        BdApi: bdApi,
        window: { addEventListener() {}, removeEventListener() {} },
        document: { addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null }
    });
    return bdApi;
}

function startablePlugin(routeKey) {
    const plugin = new Plugin();
    plugin.warnSanitized = () => {};
    plugin.scheduleTranslationCachePersist = () => {};
    plugin.toasts = [];
    Object.assign(plugin, {
        injectStyles() {},
        removeStyles() {},
        patchMessageContextMenu() {},
        startObserver() {},
        queueScan() {},
        showToast(message, type) { plugin.toasts.push({ message, type }); }
    });
    plugin.getCurrentRouteKey = () => routeKey;
    return plugin;
}

// --- PRIV-1: a v0.3.0 'enabled' channel rule keeps its v0.3.0 meaning after the upgrade -------------------

// Settings as v0.3.0 saved them: no channel-rule version yet. In v0.3.0 'enabled' behaved like 'inherit'
// (the main switch decided), so with the main switch off nothing was sent from these channels.
function v030Settings(autoTranslateMessages) {
    return {
        settings: {
            translation: { enabled: true },
            ui: {
                settingsVersion: 2,
                autoTranslateMessages,
                diagnosticsEnabled: true,
                channelAutoTranslatePolicies: {
                    "111:222": { mode: "enabled" },
                    "111:333": { mode: "disabled" },
                    // A rule under an old per-message key shadows the channel's own rule, as it did in v0.3.0.
                    "111:444:555": { mode: "enabled" },
                    "111:444": { mode: "disabled" }
                }
            }
        }
    };
}

test("upgrading from v0.3.0 with the main switch off: an 'enabled' channel sends nothing to the service", t => {
    const bdApi = useHost(t, v030Settings(false));
    const plugin = startablePlugin("111:222:");
    plugin.start();
    assert.equal(plugin.settings.ui.autoTranslateMessages, false);
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:222:"), false, "the main switch is off, as in v0.3.0");
    assert.equal(plugin.isAutoTranslateEnabled(), false);
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:444:555"), false);
    assert.equal(plugin.getChannelAutoTranslateAllowListCount(), 0, "no channel became allow-listed");
    // The rule now reads "Follow main switch", which is what it did in v0.3.0; the stored file says so too.
    assert.equal(plugin.getCurrentChannelAutoTranslatePolicyMode("111:222:"), "inherit");
    const saved = bdApi.files.DiscordAITranslator.settings.ui;
    assert.equal(saved.channelAutoTranslatePoliciesVersion, DEFAULT_SETTINGS.ui.channelAutoTranslatePoliciesVersion);
    assert.equal(Object.values(saved.channelAutoTranslatePolicies).some(policy => policy.mode === "enabled"), false);
    assert.equal(saved.channelAutoTranslatePolicies["111:333"].mode, "disabled", "'disabled' rules are unchanged");
    // Nothing starts translating, so there is nothing to announce: only the start toast.
    assert.deepEqual(plugin.toasts.map(toast => toast.type), ["success"], JSON.stringify(plugin.toasts));
    assert.ok(plugin.diagnosticLogs.some(entry => entry.action === "settings.channel-rules" && entry.meta.converted === 2),
        JSON.stringify(plugin.diagnosticLogs.map(entry => [entry.action, entry.meta])));
    plugin.stop();
});

test("upgrading from v0.3.0 with the main switch on: every channel translates exactly as before", t => {
    useHost(t, v030Settings(true));
    const plugin = startablePlugin("111:222:");
    plugin.start();
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:222:"), true);
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:333:"), false);
    // v0.3.0 read the per-message key first, and 'enabled' there followed the main switch.
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:444:555"), true);
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:444:"), false);
    // Turning the main switch off stops them all, as in v0.3.0.
    plugin.settings.ui.autoTranslateMessages = false;
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:222:"), false);
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:444:555"), false);
    plugin.stop();
});

test("a rule set to 'Always translate' after the upgrade keeps its allow-list meaning across restarts", t => {
    const bdApi = useHost(t, v030Settings(false));
    const plugin = startablePlugin("111:222:");
    plugin.start();
    plugin.setCurrentChannelAutoTranslatePolicyMode("enabled", "111:222:", { save: "immediate" });
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:222:"), true);
    plugin.stop();
    assert.equal(bdApi.files.DiscordAITranslator.settings.ui.channelAutoTranslatePolicies["111:222"].mode, "enabled");

    const again = startablePlugin("111:222:");
    again.start();
    assert.equal(again.getCurrentChannelAutoTranslatePolicyMode("111:222:"), "enabled");
    assert.equal(again.isCurrentChannelAutoTranslateAllowed("111:222:"), true, "allow-listed while the main switch is off");
    assert.equal(again.getChannelAutoTranslateAllowListCount(), 1);
    assert.equal(again.diagnosticLogs.filter(entry => entry.action === "settings.channel-rules").length, 1, "converted once only");
    again.stop();
});

test("settings saved by v0.4.0 keep their 'Always translate' rules", t => {
    const stored = v030Settings(false);
    stored.settings.ui.channelAutoTranslatePoliciesVersion = DEFAULT_SETTINGS.ui.channelAutoTranslatePoliciesVersion;
    useHost(t, stored);
    const plugin = startablePlugin("111:222:");
    plugin.start();
    assert.equal(plugin.getCurrentChannelAutoTranslatePolicyMode("111:222:"), "enabled");
    assert.equal(plugin.isCurrentChannelAutoTranslateAllowed("111:222:"), true);
    assert.deepEqual(plugin.settings.ui.channelAutoTranslatePolicies, stored.settings.ui.channelAutoTranslatePolicies);
    assert.equal(plugin.diagnosticLogs.some(entry => entry.action === "settings.channel-rules"), false);
    assert.deepEqual(plugin.toasts.map(toast => toast.type), ["success"]);
    plugin.stop();
});
