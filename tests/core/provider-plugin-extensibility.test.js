"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

test("M4 ProviderRegistry supports registering a custom 8th provider adapter without modifying core code", async () => {
    const plugin = new Plugin();
    const registry = plugin.providerLayer.registry;

    assert.deepEqual(registry.getOrder(), [
        "deepseek",
        "openaiCompatible",
        "sakuraLocal",
        "googleCloud",
        "microsoft",
        "deepl",
        "baidu"
    ]);
    assert.equal(registry.allowCloudFallback("sakuraLocal"), false);
    assert.equal(registry.allowCloudFallback("deepseek"), true);
    assert.equal(registry.isDirectTranslate("deepl"), true);
    assert.equal(registry.isDirectTranslate("deepseek"), false);

    // Register a brand-new 8th custom direct-translate provider dynamically
    registry.register({
        id: "mockCustom",
        label: "Mock Custom Translate",
        kind: "direct",
        tasks: { polish: false, translation: true },
        defaultProfile: {
            label: "Mock Custom Translate",
            endpoint: "https://translate.example.invalid/v1/run",
            model: "custom-v1"
        },
        credentialFields: ["apiKey"],
        responseParser: "mockCustomParser",
        getEffectiveEndpoint(config) {
            return String(config?.endpoint || this.defaultProfile.endpoint);
        },
        buildRequest(kind, input, config) {
            if (kind !== "translation") throw new Error("translation only");
            return {
                endpoint: this.getEffectiveEndpoint(config),
                request: {
                    provider: "mockCustom",
                    responseParser: "mockCustomParser",
                    headers: { "X-Custom-Key": config.apiKey || "k" },
                    body: { text: input, target: config.targetLanguage }
                }
            };
        },
        parseResponse(raw) {
            return JSON.parse(raw).translated;
        },
        applyCacheScope(_config, snapshot) {
            snapshot.promptPolicyVersion = "mockCustom-custom-scope";
        }
    });

    assert.equal(plugin.isDirectTranslateProvider("mockCustom"), true);
    assert.equal(plugin.getProviderDefaults("mockCustom")?.endpoint, "https://translate.example.invalid/v1/run");

    const built = plugin.buildModelRequest("translation", "Hello world", {
        configOverrides: { provider: "mockCustom", endpoint: "", apiKey: "secret-custom", targetLanguage: "汉语" }
    });
    assert.equal(built.endpoint, "https://translate.example.invalid/v1/run");
    assert.equal(built.request.responseParser, "mockCustomParser");

    // Verify fetchModelResponse dispatches to the custom adapter parser
    plugin.fetchApiResponseText = async () => JSON.stringify({ translated: "你好世界" });
    const parsed = await plugin.fetchModelResponse(built.endpoint, built.request, 5000);
    assert.equal(parsed, "你好世界");

    // Verify cache snapshot delegates to custom adapter's applyCacheScope
    const snap = plugin.translationCacheStore.getCacheConfigSnapshot("translation", {
        provider: "mockCustom",
        targetLanguage: "汉语"
    });
    assert.equal(snap.promptPolicyVersion, "mockCustom-custom-scope");

    assert.equal(registry.unregister("mockCustom"), true);
    assert.equal(registry.has("mockCustom"), false);
});
