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

// --- PRIV-3: a Google key never shows as a key's label ------------------------------------------------------

// Obvious fakes shaped like Google keys ("AIza" + 35 characters), so any check for key-like text sees them.
const FAKE_KEY = "AIzaFAKE-test-key-not-real-000000000000";
const FAKE_KEY_2 = "AIzaFAKE-test-key-not-real-222222222222";
const GOOGLE_KEY_INVALID_BODY = { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT", details: [{ reason: "API_KEY_INVALID" }] } };

function createGooglePoolPlugin(poolText, locale = "en") {
    const plugin = new Plugin();
    plugin.settings.ui.language = locale;
    plugin.settings.ui.showAutoTranslateToasts = false;
    plugin.settings.translation.provider = "googleCloud";
    plugin.saveSettings = () => true;
    plugin.setSetting("googleTranslate.keyPoolText", poolText, { save: false });
    plugin.toasts = [];
    plugin.showToast = (text, type) => plugin.toasts.push({ text, type });
    return plugin;
}

test("a Google pool line 'KEY|limit' is a key with its monthly limit and a generated label", () => {
    const plugin = createGooglePoolPlugin(`${FAKE_KEY}|450000\n${FAKE_KEY_2}`);
    const keys = plugin.settings.googleTranslate.keys;
    assert.deepEqual(keys.map(key => [key.label, key.apiKey]), [["Google 1", FAKE_KEY], ["Google 2", FAKE_KEY_2]]);
    assert.equal(keys[0].monthlyLimit, 450000);
    const built = plugin.buildModelRequest("translation", "hola");
    assert.equal(built.request.headers["X-Goog-Api-Key"], FAKE_KEY, "the key is sent, not the limit");

    // The documented "Label|KEY|limit" and "Label|KEY" forms are unchanged.
    plugin.setSetting("googleTranslate.keyPoolText", `main|${FAKE_KEY}|400000\nbackup|${FAKE_KEY_2}`, { save: false });
    assert.deepEqual(plugin.settings.googleTranslate.keys.map(key => [key.label, key.apiKey]), [["main", FAKE_KEY], ["backup", FAKE_KEY_2]]);
    assert.equal(plugin.settings.googleTranslate.keys[0].monthlyLimit, 400000);
});

test("a failing Google key is named by a label that is never the key, on every surface", async () => {
    const cases = [
        // [pool text, the label the error names]
        [`${FAKE_KEY}|450000`, "Google 1"],
        [`${FAKE_KEY}|${FAKE_KEY}|450000`, "Google 1"],
        [`${FAKE_KEY_2}|${FAKE_KEY}|450000`, "Google 1"],
        [`backup ${FAKE_KEY}|${FAKE_KEY}`, "Google 1"],
        [`main|${FAKE_KEY_2}|450000\n${FAKE_KEY}|450000`, "Google 2"],
        [`main|${FAKE_KEY}|450000`, "main"]
    ];
    for (const locale of ["zh-CN", "en"]) {
        for (const [poolText, label] of cases) {
            const plugin = createGooglePoolPlugin(poolText, locale);
            const failing = plugin.settings.googleTranslate.keys.find(key => key.apiKey === FAKE_KEY);
            assert.ok(failing, `${poolText}: the key is in the pool`);
            plugin.settings.googleTranslate.keys.forEach(key => { if (key !== failing) key.cooldownUntil = Date.now() + 60 * 60 * 1000; });
            plugin.fetchApiResponseText = async (_endpoint, request) => {
                const error = Object.assign(new Error("API_ERROR"), { status: 400, retryAfterMs: 0 });
                plugin.annotateGoogleTranslateApiError(error, JSON.stringify(GOOGLE_KEY_INVALID_BODY), request);
                throw error;
            };
            await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
            const failure = plugin.toasts.at(-1);
            assert.equal(failure?.type, "error", JSON.stringify(plugin.toasts));
            const surfaces = {
                toast: failure.text,
                status: plugin.getApiStatus("translation").message,
                card: plugin.getLastApiTestResult("translation").message,
                checklist: plugin.getApiTestSummaryText("translation"),
                stats: plugin.getGoogleTranslateStatsText(),
                keyError: plugin.settings.googleTranslate.keys.map(key => key.lastError).join(" ")
            };
            for (const [surface, text] of Object.entries(surfaces)) {
                assert.equal(text.includes("AIza"), false, `${locale} ${poolText} ${surface}: ${text}`);
            }
            assert.ok(surfaces.toast.includes(label), `${locale} ${poolText}: ${surfaces.toast}`);
            assert.ok(surfaces.status.includes(label), `${locale} ${poolText}: ${surfaces.status}`);
        }
    }
});
