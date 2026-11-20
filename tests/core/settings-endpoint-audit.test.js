"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_NAME, PROVIDER_DEFAULTS, SETTINGS_WRITE_DEBOUNCE_MS } = require("../../src/constants");
const { createFakeDataApi } = require("../fixtures/chat-harness");

for (const { name, kind, provider, origin } of [
    { name: "loopback", kind: "translation", provider: "sakuraLocal", origin: "http://[::1]:18080" },
    { name: "remote", kind: "polish", provider: "openaiCompatible", origin: "https://relay.example.invalid" }
]) {
    test(`S04 removes ${name} URL secrets from current, profile and saved settings`, () => {
        const plugin = new Plugin();
        const markers = [];
        const endpointFor = section => {
            const prefix = `s04-${name}-${section}`;
            const username = `${prefix}-user`;
            const password = `${prefix}-password`;
            const path = `${prefix}-secret%2Froute`;
            const query = `${prefix}-query`;
            const fragment = `${prefix}-fragment`;
            markers.push(username, password, path, `${prefix}-secret`, query, fragment);
            return origin.replace("://", `://${username}:${password}@`)
                + `/gateway/${path}/v1/chat/completions?route=${query}&route=secondary#${fragment}`;
        };
        Object.assign(plugin.settings[kind], {
            provider,
            endpoint: endpointFor("current"),
            providerProfiles: { [provider]: { endpoint: endpointFor("profile") } }
        });
        plugin.settings.serviceConfigs = [{ id: "saved-example", provider, endpoint: endpointFor("saved") }];
        const before = structuredClone(plugin.settings);

        const snapshot = plugin.createSettingsSnapshot();
        const exported = JSON.stringify(snapshot);
        for (const marker of markers) assert.equal(exported.includes(marker), false, marker);
        assert.equal(exported.includes("/gateway/"), false);
        const summary = `${origin}/[custom path, 2 segments]/v1/chat/completions [credentials removed]`;
        const { settings } = snapshot;
        assert.equal(settings[kind].endpoint, summary);
        assert.equal(settings[kind].providerProfiles[provider].endpoint, summary);
        assert.equal(settings.serviceConfigs[0].endpoint, summary);
        assert.deepEqual(plugin.settings, before);
    });
}

test("S04 preserves standard API paths and never echoes invalid endpoints", () => {
    const plugin = new Plugin();
    for (const { endpoint } of Object.values(PROVIDER_DEFAULTS)) {
        assert.equal(plugin.getSettingsSnapshotEndpoint(`${endpoint}?token=s04-query#s04-fragment`), endpoint);
    }
    for (const endpoint of ["http://localhost:18080/", "http://localhost:18080/v1", "https://relay.example.invalid/v1/models"]) {
        assert.equal(plugin.getSettingsSnapshotEndpoint(`${endpoint}?token=s04-query#s04-fragment`), endpoint);
    }
    assert.equal(
        plugin.getSettingsSnapshotEndpoint("https://relay.example.invalid/custom/s04-private?token=s04-query#s04-fragment"),
        "https://relay.example.invalid/[custom path, 2 segments]"
    );
    assert.equal(plugin.getSettingsSnapshotEndpoint("settings-snapshot-invalid-secret?token=private"), "[invalid]");
    assert.equal(plugin.getSettingsSnapshotEndpoint("file:///private/s04-path?token=s04-query#s04-fragment"), "[invalid]");
    assert.equal(plugin.getSettingsSnapshotEndpoint(""), "");
});

test("S06 saves, reloads and selects case-sensitive paths and ordered repeated queries", async t => {
    const previousBdApi = Object.getOwnPropertyDescriptor(globalThis, "BdApi");
    const bdApi = createFakeDataApi();
    globalThis.BdApi = bdApi;
    t.after(() => {
        if (previousBdApi) Object.defineProperty(globalThis, "BdApi", previousBdApi);
        else delete globalThis.BdApi;
    });
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
    const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("Unexpected network request"));
    t.after(() => assert.equal(fetch.mock.callCount(), 0));

    const plugin = new Plugin();
    Object.assign(plugin, { queueScan() {}, showToast() {} });
    const provider = "openaiCompatible";
    const origin = "https://relay.example.invalid";
    const query = "route=A%2FB&mode=fast%20lane&route=B&tenant=";
    const model = "relay-main";
    const alternateModel = "relay-canary";
    const verify = t.mock.method(plugin, "fetchApiResponseText", async (_endpoint, request) => JSON.stringify({
        model: request.body.model,
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }]
    }));

    const save = async (endpoint, path, search, modelName = model) => {
        Object.assign(plugin.settings.translation, { provider, endpoint, model: modelName, apiKey: "synthetic-s06-key" });
        assert.equal(await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } }), true);
        const [requestEndpoint, request] = verify.mock.calls.at(-1).arguments;
        const url = new URL(requestEndpoint);
        assert.equal(url.origin, origin);
        assert.equal(url.pathname, path);
        assert.equal(url.search, `?${search}`);
        assert.equal(request.body.model, modelName);
        const entry = plugin.findMatchingSavedServiceConfig("translation");
        assert.equal(entry?.endpoint, endpoint);
        return { id: entry.id, endpoint, path, search, model: modelName };
    };

    const firstEndpoint = `${origin}/Relay/v1?${query}`;
    const first = await save(firstEndpoint, "/Relay/v1/chat/completions", query);
    assert.equal(plugin.settings.polish.endpoint, firstEndpoint);
    assert.equal(plugin.settings.polish.apiStatus.state, "success");

    const equivalent = await save(`HTTPS://RELAY.EXAMPLE.INVALID:443/Relay/v1/chat/completions?${query}#client-only`, first.path, query);
    assert.equal(equivalent.id, first.id);
    const lowerPath = await save(`${origin}/relay/v1?${query}`, "/relay/v1/chat/completions", query);
    const reordered = "mode=fast%20lane&route=A%2FB&route=B&tenant=";
    const changedOrder = await save(`${origin}/Relay/v1?${reordered}`, first.path, reordered);
    const oneRoute = "route=A%2FB&mode=fast%20lane&tenant=";
    const changedMultiplicity = await save(`${origin}/Relay/v1?${oneRoute}`, first.path, oneRoute);
    const otherModel = await save(firstEndpoint, first.path, query, alternateModel);
    const configs = [equivalent, lowerPath, changedOrder, changedMultiplicity, otherModel];
    assert.equal(new Set(configs.map(config => config.id)).size, configs.length);
    assert.equal(plugin.settings.polish.endpoint, firstEndpoint);
    assert.equal(plugin.settings.polish.model, model);

    assert.equal(plugin.settingsDirty, true);
    t.mock.timers.tick(SETTINGS_WRITE_DEBOUNCE_MS);
    assert.equal(plugin.settingsDirty, false);
    assert.equal(bdApi.Data.load(PLUGIN_NAME, "settings").serviceConfigs.length, configs.length);
    const reloaded = new Plugin();
    assert.equal(reloaded.loadSettings(), true);
    assert.equal(reloaded.settings.serviceConfigs.length, configs.length);
    assert.deepEqual(reloaded.getTaskProviderProfile("translation", provider).recentModels, [alternateModel, model]);

    for (const config of configs) {
        assert.equal(reloaded.applySavedServiceConfig("translation", config.id, { silent: true, refreshUi: false }), true);
        assert.equal(reloaded.settings.translation.endpoint, config.endpoint);
        assert.equal(reloaded.findMatchingSavedServiceConfig("translation")?.id, config.id);
        const { endpoint, request } = reloaded.buildModelRequest("translation", "Synthetic request text");
        const url = new URL(endpoint);
        assert.equal(url.origin, origin);
        assert.equal(url.pathname, config.path);
        assert.equal(url.search, `?${config.search}`);
        assert.equal(request.body.model, config.model);
    }
    assert.deepEqual(reloaded.getTaskProviderProfile("translation", provider).recentModels, [alternateModel, model]);
    assert.equal(reloaded.settings.polish.endpoint, firstEndpoint);
});

test("S06 identity preserves expressed URLs and avoids collisions between endpoint and model", () => {
    const plugin = new Plugin();
    const key = (endpoint, model = "relay-model") => plugin.getServiceConfigIdentityKey({
        provider: "openaiCompatible", endpoint, model
    });
    const path = "https://relay.example.invalid/Custom";
    assert.equal(key(""), key(PROVIDER_DEFAULTS.openaiCompatible.endpoint));
    assert.equal(key(`${path}#first`), key("HTTPS://RELAY.EXAMPLE.INVALID:443/Custom#second"));
    assert.notEqual(key(path), key(`${path}/`));
    assert.notEqual(key(path), key(`${path}?`));
    assert.notEqual(key(`${path}?route=a|b`, "c"), key(`${path}?route=a`, "b|c"));
    assert.notEqual(key(`${path}?route=a&route=b`), key(`${path}?route=b&route=a`));
});

test("S06 Microsoft saved routes preserve base query order across language changes", () => {
    const plugin = new Plugin();
    const task = plugin.settings.translation;
    const endpoint = "https://relay.example.invalid/Translate?route=One&mode=A&route=Two";
    Object.assign(task, { provider: "microsoft", endpoint, apiKey: "synthetic-ms-key", region: "eastus" });
    const save = () => plugin.saveVerifiedServiceConfig("translation", null, {
        autoSync: false, save: false, refreshUi: false
    }).entry;
    const first = save();
    assert.ok(first);
    Object.assign(task, {
        endpoint: "HTTPS://RELAY.EXAMPLE.INVALID:443/Translate?route=One&mode=A&route=Two",
        targetLanguage: "French",
        sourceLanguage: "German"
    });
    assert.equal(plugin.findMatchingSavedServiceConfig("translation")?.id, first.id);
    const request = plugin.buildModelRequest("translation", "Synthetic request text");
    const actual = new URL(request.endpoint);
    assert.equal(actual.pathname, "/Translate");
    assert.equal(actual.search, "?route=One&mode=A&route=Two&api-version=3.0&to=fr&from=de");
    assert.equal(save().id, first.id);

    task.endpoint = "https://relay.example.invalid/Translate?mode=A&route=One&route=Two";
    assert.notEqual(save().id, first.id);
    assert.equal(plugin.normalizeSavedServiceConfigs(plugin.settings.serviceConfigs).length, 2);
});

test("S06 Google and DeepL saved configs use the effective fixed routes", () => {
    const plugin = new Plugin();
    const staleEndpoint = "https://relay.example.invalid/Unused?route=legacy";
    const entries = plugin.normalizeSavedServiceConfigs([
        { id: "google", provider: "googleCloud", endpoint: staleEndpoint },
        { id: "google-duplicate", provider: "googleCloud" },
        { id: "deepl-free", provider: "deepl", deeplPlan: "free", endpoint: staleEndpoint },
        { id: "deepl-free-duplicate", provider: "deepl", deeplPlan: "free" },
        { id: "deepl-pro", provider: "deepl", deeplPlan: "pro", endpoint: staleEndpoint },
        { id: "deepl-pro-duplicate", provider: "deepl", deeplPlan: "pro" }
    ]);
    assert.deepEqual(entries.map(entry => entry.id), ["google", "deepl-free", "deepl-pro"]);
});
