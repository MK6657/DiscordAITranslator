"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

test("settings snapshot keeps switches and numbers but hides secrets and private text", () => {
    const plugin = new Plugin();
    Object.assign(plugin.settings.translation, {provider:"sakuraLocal", endpoint:"http://127.0.0.1:18080/v1/chat/completions", apiKey:""});
    Object.assign(plugin.settings.polish, {
        apiKey:"sk-fake-snap-1",
        endpoint:"https://user:pass@api.example.com/v1/chat/completions?api-key=query-secret",
        prompt:"my private polish instructions"
    });
    plugin.settings.translation.providerProfiles = {deepseek:{apiKey:"sk-fake-profile-1", endpoint:"https://api.deepseek.com/chat/completions"}};
    plugin.settings.googleTranslate.keyPoolText = "AIza-fake-pool-1";
    plugin.settings.googleTranslate.keys = [{apiKey:"AIza-fake-pool-1"}];
    plugin.settings.ui.channelAutoTranslatePolicies = {"123456789012345678":"enabled"};
    Object.assign(plugin.settings.ui, {autoTranslateMessages:true, autoTranslatePrefetch:true, autoTranslateConcurrency:6});

    const snapshot = plugin.createSettingsSnapshot();
    const text = JSON.stringify(snapshot);
    for (const secret of ["sk-fake-snap-1", "sk-fake-profile-1", "AIza-fake-pool-1", "query-secret", "user:pass", "my private polish", "123456789012345678"]) {
        assert.equal(text.includes(secret), false, secret);
    }
    const {settings} = snapshot;
    assert.equal(settings.polish.apiKey, "[hidden]");
    assert.equal(settings.translation.apiKey, "");
    assert.equal(settings.translation.providerProfiles.deepseek.apiKey, "[hidden]");
    assert.equal(settings.googleTranslate.keys, "[hidden: 1]");
    // Local endpoints stay whole; remote ones keep only origin and path.
    assert.equal(settings.translation.endpoint, "http://127.0.0.1:18080/v1/chat/completions");
    assert.equal(settings.polish.endpoint, "https://api.example.com/v1/chat/completions [credentials removed]");
    assert.equal(settings.translation.prompt, "default");
    assert.equal(settings.polish.prompt, "custom (30 chars)");
    assert.deepEqual(Object.values(settings.ui.channelAutoTranslatePolicies), ["enabled"]);
    assert.equal(settings.ui.autoTranslateMessages, true);
    assert.equal(settings.ui.autoTranslatePrefetch, true);
    assert.equal(settings.ui.autoTranslateConcurrency, 6);
    assert.equal(snapshot.effective.localProvider, true);
});
