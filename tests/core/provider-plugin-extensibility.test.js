"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { createOpenAIChatAdapter } = require("../../src/providers/registry");

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

    // Verify buildConnectionTestRequest also dispatches through ProviderRegistry for custom direct adapters
    const builtTest = plugin.buildConnectionTestRequest("translation", {
        provider: "mockCustom",
        endpoint: "",
        apiKey: "secret-custom",
        targetLanguage: "汉语"
    });
    assert.equal(builtTest.endpoint, "https://translate.example.invalid/v1/run");
    assert.equal(builtTest.request.body.text, "hello");

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

test("ProviderRegistry isolates shared responseParser keys, prioritizes provider adapter, and wires custom chat capabilities", async () => {
    const plugin = new Plugin();
    const registry = plugin.providerLayer.registry;

    // Canonical default chatCompletion parser stays bound to deepseek (first registered).
    assert.equal(registry.getByParser("chatCompletion")?.id, "deepseek");

    registry.register(createOpenAIChatAdapter({
        id: "mockCustomChat",
        label: "Mock Custom Chat",
        defaultProfile: {
            label: "Mock Custom Chat",
            endpoint: "https://chat.example.invalid/v1/chat/completions",
            model: "custom-chat-1"
        },
        credentialFields: ["customToken"],
        supportsModelDetection: true,
        apiKeyOptional: true,
        allowCloudFallback: false,
        buildHeaders(config, effectiveApiKey) {
            return { "Content-Type": "application/json", "X-Custom-Token": config.customToken || effectiveApiKey };
        },
        parseResponse(raw) {
            return `CUSTOM:${JSON.parse(raw).customText}`;
        }
    }));

    // Custom chat adapter capabilities flow through ProviderLayer & SettingsStore.
    assert.equal(
        plugin.getEffectiveChatCompletionEndpoint({ provider: "mockCustomChat", endpoint: "" }, {}),
        "https://chat.example.invalid/v1/chat/completions"
    );
    assert.equal(plugin.isModelDetectionProvider("mockCustomChat"), true);
    assert.equal(plugin.isProviderApiKeyOptional("mockCustomChat"), true);
    assert.equal(
        plugin.hasUsableApiConfig("translation", { provider: "mockCustomChat", endpoint: "", model: "custom-chat-1", apiKey: "" }),
        true
    );
    assert.equal(
        plugin.getRequestHeaders({ provider: "mockCustomChat", customToken: "tok-123" }, "local")["X-Custom-Token"],
        "tok-123"
    );

    // allowCloudFallback: false blocks cloud fallback even when isLocal is false.
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["deepseek", "mockCustomChat"];
    plugin.settings.translation.provider = "mockCustomChat";
    assert.deepEqual(plugin.getProviderFallbackOrder("translation"), []);
    assert.equal(
        plugin.shouldTryProviderFallback("translation", { mode: "manual" }, { provider: "mockCustomChat" }, { status: 500 }),
        false
    );
    // Custom adapter with allowCloudFallback: false is also excluded as a fallback target from another provider.
    plugin.settings.translation.provider = "deepseek";
    assert.deepEqual(plugin.getProviderFallbackOrder("translation"), []);

    // Custom credentialFields are preserved on resetSettingsToDefaults({ keepCredentials: true }).
    const carried = plugin.settingsStore.carryOverResetCredentials(
        {
            polish: {},
            translation: {
                provider: "mockCustomChat",
                endpoint: "https://chat.example.invalid/v1/chat/completions",
                model: "custom-chat-1",
                customToken: "tok-keep-me",
                providerProfiles: {}
            }
        },
        plugin.clone(plugin.settings)
    );
    assert.equal(carried.translation.providerProfiles.mockCustomChat?.customToken, "tok-keep-me");

    // DeepSeek parsing is NOT hijacked by mockCustomChat even when responseParser is "chatCompletion".
    plugin.fetchApiResponseText = async () => JSON.stringify({ choices: [{ message: { content: "DeepSeek OK" } }] });
    const dsBuilt = plugin.buildModelRequest("translation", "hello", {
        configOverrides: { provider: "deepseek", apiKey: "sk-test", targetLanguage: "汉语" }
    });
    const dsParsed = await plugin.fetchModelResponse(
        dsBuilt.endpoint,
        { ...dsBuilt.request, responseParser: "chatCompletion" },
        5000
    );
    assert.equal(dsParsed, "DeepSeek OK");

    // mockCustomChat invokes its own parseResponse.
    plugin.fetchApiResponseText = async () => JSON.stringify({ customText: "from-custom" });
    const customParsed = await plugin.fetchModelResponse(
        "https://chat.example.invalid/v1/chat/completions",
        { provider: "mockCustomChat", responseParser: "chatCompletion" },
        5000
    );
    assert.equal(customParsed, "CUSTOM:from-custom");

    // Unregistering mockCustomChat does NOT remove "chatCompletion" from byParser.
    assert.equal(registry.unregister("mockCustomChat"), true);
    assert.equal(registry.getByParser("chatCompletion")?.id, "deepseek");
});
