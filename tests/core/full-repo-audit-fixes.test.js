"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");
const Plugin = require("../../src");
const { EventBus } = require("../../src/core/event-bus");
const { convertDiscordMarkupToDisplayText } = require("../../src/intake/discord-markup");

test("EventBus.off removes pending once() listeners before they fire", () => {
    const bus = new EventBus();
    let calls = 0;
    const handler = () => { calls++; };
    bus.once("settings:changed", handler);
    bus.off("settings:changed", handler);
    bus.emit("settings:changed", { ok: true });
    assert.equal(calls, 0);
});

test("pure-JS RFC 1321 MD5 fallback matches Node crypto across ASCII, UTF-8, and lone surrogates, and decodeHtmlEntities is single-pass", () => {
    const plugin = new Plugin();
    for (const sample of ["", "a", "abc", "message digest", "你好，世界！🚀", "a".repeat(128)]) {
        const expected = crypto.createHash("md5").update(sample, "utf8").digest("hex");
        assert.equal(plugin.md5HexFallback(sample), expected);
        assert.equal(plugin.createMd5Hash(sample), expected);
    }
    assert.doesNotThrow(() => plugin.md5HexFallback("bad\uD800surrogate"));
    assert.equal(plugin.md5HexFallback("bad\uD800surrogate"), plugin.md5HexFallback("bad\uFFFDsurrogate"));

    assert.equal(plugin.decodeHtmlEntities("&amp;lt;script&gt; &#39; &#x26; &apos; &quot;ok&quot;"), "&lt;script> ' & ' \"ok\"");
});

test("API_REDIRECT_BLOCKED classifies as endpoint client error and BetterDiscord.Net blocks same-origin redirects", async () => {
    const plugin = new Plugin();
    const redirectErr = Object.assign(new Error("Redirect blocked"), { code: "API_REDIRECT_BLOCKED" });
    assert.equal(plugin.getAutoTranslationFailureType(redirectErr), "client");
    assert.equal(plugin.getTranslationAttentionType(redirectErr), "endpoint");

    const savedBdApi = globalThis.BdApi;
    try {
        globalThis.BdApi = {
            Net: {
                fetch: async () => ({
                    status: 200,
                    ok: true,
                    redirected: false,
                    url: "https://api.openai.com/v1/other-path",
                    text: async () => "{}"
                })
            }
        };
        await assert.rejects(
            () => plugin.providerLayer.fetchViaBetterDiscordNet("https://api.openai.com/v1/chat/completions", { method: "POST" }),
            error => error?.code === "API_REDIRECT_BLOCKED"
        );
    }
    finally {
        globalThis.BdApi = savedBdApi;
    }
});

test("subscribeToProviderRequest turns synchronous run() throws into rejected promises and cleans up request map", async () => {
    const plugin = new Plugin();
    const requests = new Map();
    await assert.rejects(
        () => plugin.providerLayer.subscribeToProviderRequest(requests, "sync-throw", null, () => {
            throw new Error("SYNC_BOOM");
        }),
        /SYNC_BOOM/
    );
    assert.equal(requests.size, 0);
});

test("Google Cloud key pool deduplicates identical concurrent requests and uses America/Los_Angeles billing month", async t => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.scheduleGoogleTranslateRuntimePersist = () => {};
    plugin.settings.translation.provider = "googleCloud";
    plugin.settings.googleTranslate.keyPoolText = ["AIza", "SyntheticTestKey01"].join("");
    const normalized = plugin.normalizeGoogleTranslateKeyPool(plugin.settings.googleTranslate);
    plugin.settings.googleTranslate.keys = normalized.keys;

    // 2026-04-01T03:30:00Z is still 2026-03-31 20:30 PDT in America/Los_Angeles.
    assert.equal(plugin.getCurrentMonthKey(new Date("2026-04-01T03:30:00.000Z")), "2026-03");
    assert.equal(
        plugin.restoreGoogleTranslateText("Hello __ dait_keep_000 __!", [{ placeholder: "__DAIT_KEEP_000__", value: "<:wave:123>" }]),
        "Hello <:wave:123>!"
    );

    let fetchCalls = 0;
    let releaseFetch;
    const gate = new Promise(resolve => { releaseFetch = resolve; });
    t.mock.method(globalThis, "fetch", async () => {
        fetchCalls++;
        await gate;
        return Response.json({ data: { translations: [{ translatedText: "你好世界" }] } }, { status: 200 });
    });

    const p1 = plugin.runModelTaskWithResult("translation", "Hello world", { mode: "auto" });
    const p2 = plugin.runModelTaskWithResult("translation", "Hello world", { mode: "auto" });
    assert.equal(fetchCalls, 1);
    releaseFetch();
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(fetchCalls, 1);
    assert.equal(r1.text, "你好世界");
    assert.equal(r2.text, "你好世界");
});

test("clearTranslationCache cancels pending idle cache persistence", () => {
    const plugin = new Plugin();
    plugin.saveData = () => true;
    plugin.showToast = () => {};
    const cancelled = [];
    plugin.cancelHeavyPersistenceIdle = kind => { cancelled.push(kind); };
    plugin.clearTranslationCache();
    assert.deepEqual(cancelled, ["cache"]);
});

test("custom provider adapter promptPolicyVersion scopes translation cache keys", () => {
    const plugin = new Plugin();
    plugin.providerLayer.registry.register({
        id: "customScoped",
        label: "Custom Scoped",
        defaultProfile: { endpoint: "https://scoped.example/v1/translate", model: "m1" },
        applyCacheScope(_config, snapshot) {
            snapshot.promptPolicyVersion = "custom-v1";
        }
    });
    const keyV1 = plugin.getTranslationCacheKey("Hello", { mode: "auto", configOverrides: { provider: "customScoped" } });

    plugin.providerLayer.registry.register({
        id: "customScoped",
        label: "Custom Scoped",
        defaultProfile: { endpoint: "https://scoped.example/v1/translate", model: "m1" },
        applyCacheScope(_config, snapshot) {
            snapshot.promptPolicyVersion = "custom-v2";
        }
    });
    const keyV2 = plugin.getTranslationCacheKey("Hello", { mode: "auto", configOverrides: { provider: "customScoped" } });
    assert.notEqual(keyV1, keyV2);
});

test("diagnostics redact DeepL-Auth-Key, strip URL query secrets from model paths, and traverse non-string model objects", () => {
    const plugin = new Plugin();
    const fakeSk = ["sk", "synthetic1234567890"].join("-");
    const label = plugin.getDiagnosticModelLabel(`http://127.0.0.1:8080/models/qwen2.5.gguf?api_key=${fakeSk}#secret`);
    assert.equal(label, "qwen2.5.gguf");

    const sanitized = plugin.sanitizeDiagnosticObject({
        authHeader: "DeepL-Auth-Key my-super-secret-deepl-token",
        colonHeader: "DeepL-Auth-Key: my-super-secret-deepl-token",
        modelMeta: { nestedKey: `Bearer ${fakeSk}` }
    });
    assert.equal(sanitized.authHeader.includes("my-super-secret-deepl-token"), false);
    assert.equal(sanitized.colonHeader.includes("my-super-secret-deepl-token"), false);
    assert.equal(sanitized.modelMeta.nestedKey.includes("synthetic1234567890"), false);
});

test("output guards, emoji token counts, mass-mention neutralization, Vietnamese & Japanese script validation, and markup normalization", () => {
    const plugin = new Plugin();

    // Chinese book title guillemets are not stripped as wrapper quotes.
    assert.equal(
        plugin.sanitizeAutoTranslationOutput("One Hundred Years of Solitude", "《百年孤独》", "简体中文"),
        "《百年孤独》"
    );

    // Timestamps and ratios do not count as Discord emoji shortcodes, while ~1 suffixed custom emojis do.
    const counts = plugin.getDiscordEmojiTokenCounts("Meet at 12:30:45 ratio 1:2:3 <:wave~1:123456> :party_blob~2:");
    assert.equal(counts.has("30"), false);
    assert.equal(counts.has("2"), false);
    assert.equal(counts.get("wave~1"), 1);
    assert.equal(counts.get("party_blob~2"), 1);

    // Mass-mention smuggling via @@everyone and 4-backtick fences is neutralized.
    const guarded = plugin.guardGeneratedMassMentions("hello world", "`````a``` @everyone @@here foo@everyone");
    assert.equal(guarded.neutralized, true);
    assert.equal(/(?<!\u200b)@(everyone|here)/i.test(guarded.text.replace(/```[\s\S]*?```/g, "")), false);

    // Vietnamese extended Latin and Japanese Kanji+kana outputs pass target validation, while pure-Han Japanese fails.
    assert.equal(
        plugin.getAutoTranslationInvalidOutputReason("Hello everyone, the weather is nice today.", "Xin chào mọi người, thời tiết hôm nay rất đẹp.", "Tiếng Việt"),
        ""
    );
    assert.equal(
        plugin.getAutoTranslationInvalidOutputReason("Please check today's meeting materials.", "本日の会議資料を確認してください。", "日语"),
        ""
    );
    assert.equal(
        plugin.getAutoTranslationInvalidOutputReason("工作完成了。", "仕事完了。", "日语"),
        "residual-source"
    );

    // Balanced-parenthesis Wikipedia masked links & CRLF empty blockquotes normalize cleanly.
    const markup = convertDiscordMarkupToDisplayText("> line 1\r\n>\r\n> [Rust](https://en.wikipedia.org/wiki/Rust_(programming_language))");
    assert.equal(markup.includes("Rust"), true);
    assert.equal(markup.includes("programming_language"), false);
    assert.equal(markup.includes("\r"), false);
});

test("AutoTranslationStateMachine keeps daitHistoryRequest distinct from daitPrefetchRequest and retains history on provider block", () => {
    const plugin = new Plugin();
    const historyItem = {
        cacheKey: "history-key-1",
        text: "Hello history",
        daitHistoryRequest: true,
        priority: 200000
    };
    plugin.enqueueAutoTranslationItem(historyItem);
    assert.equal(Boolean(historyItem.daitPrefetchRequest), false);
    assert.equal(plugin.shouldRetainAutoTranslationProviderBlockedItem(historyItem), true);
});

test("runLongAutoTranslationTask passes standalone fenced code chunks through without LLM calls or dropping them", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    const prose = `${"Please review the configuration carefully before deploying to production. ".repeat(14).trim()}`;
    const codeBlock = `\`\`\`js\n${"const value = computeSomethingImportant(42);\n".repeat(12)}\`\`\``;
    const longSource = `${prose}\n\n${codeBlock}`;

    const calls = [];
    plugin.runModelTask = async (_kind, text) => {
        calls.push(text);
        return "请在部署到生产环境之前仔细检查配置。".repeat(14);
    };

    const merged = await plugin.runLongAutoTranslationTask(longSource, {
        mode: "auto",
        targetLanguage: "简体中文"
    });
    assert.equal(calls.some(chunk => chunk.trim().startsWith("```js")), false);
    assert.equal(merged.includes("const value = computeSomethingImportant(42);"), true);
    assert.equal(merged.includes("请在部署到生产环境之前仔细检查配置。"), true);
});

test("SettingsStore normalizes numeric bounds, deduplicates saved service configs by credentials/thinking, and guards unconfigured sharing", () => {
    const plugin = new Plugin();
    plugin.saveSettings = () => true;

    assert.equal(plugin.quickPanel.isPolishSharingTranslationService(), false);

    plugin.setSetting("translation.temperature", Number.NaN);
    assert.equal(plugin.settings.translation.temperature, 0.2);
    plugin.setSetting("translation.temperature", 9);
    assert.equal(plugin.settings.translation.temperature, 2);
    plugin.setSetting("translation.maxTokens", 0);
    assert.equal(plugin.settings.translation.maxTokens, 1);

    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.endpoint = "https://api.deepseek.com/chat/completions";
    plugin.settings.translation.model = "deepseek-chat";
    plugin.settings.translation.apiKey = ["sk", "fake-alpha"].join("-");
    plugin.settings.translation.enableThinking = false;
    plugin.saveVerifiedServiceConfig("translation", plugin.settings.translation, { autoSync: false, save: false, refreshUi: false });

    plugin.settings.translation.apiKey = ["sk", "fake-beta"].join("-");
    plugin.saveVerifiedServiceConfig("translation", plugin.settings.translation, { autoSync: false, save: false, refreshUi: false });

    plugin.settings.translation.enableThinking = true;
    plugin.saveVerifiedServiceConfig("translation", plugin.settings.translation, { autoSync: false, save: false, refreshUi: false });

    assert.equal(plugin.settings.serviceConfigs.length, 3);
});
