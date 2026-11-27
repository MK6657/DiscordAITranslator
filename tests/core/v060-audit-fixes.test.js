"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { DIAGNOSTIC_REASON_CODES } = require("../../src/constants");
const { getDiagnosticCodeLabel } = require("../../src/diagnostics/diagnostic-labels");
const { el } = require("../fixtures/fake-dom");
const { createFakeDataApi, installChatGlobals } = require("../fixtures/chat-harness");

test("v0.6 audit: guardGeneratedMassMentions blocks multiline single-backtick and unclosed backtick mention smuggling", () => {
    const plugin = new Plugin();
    const smuggled = "`line1\n` @everyone @here <@&123456789012345678> `line2`";
    const res = plugin.guardGeneratedMassMentions("hello", smuggled);
    assert.equal(res.neutralized, true);
    assert.ok(res.text.includes("@\u200beveryone"));
    assert.ok(res.text.includes("@\u200bhere"));
    assert.ok(res.text.includes("<@\u200b&123456789012345678>"));

    // Mentions inside genuine single-backtick multiline code span remain untouched
    const genuineCode = "`first line\n@everyone inside code`";
    const safeRes = plugin.guardGeneratedMassMentions("hello", genuineCode);
    assert.equal(safeRes.neutralized, false);
    assert.equal(safeRes.text, genuineCode);
});

test("v0.6 audit: unstarted setSetting loads stored settings instead of wiping API keys, and headless stop() succeeds", t => {
    const savedDoc = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedBdApi = Object.getOwnPropertyDescriptor(globalThis, "BdApi");
    t.after(() => {
        if (savedDoc) Object.defineProperty(globalThis, "document", savedDoc);
        else delete globalThis.document;
        if (savedBdApi) Object.defineProperty(globalThis, "BdApi", savedBdApi);
        else delete globalThis.BdApi;
    });

    const fakeKey = ["sk", "stored", "precious", "key"].join("-");
    const dataApi = createFakeDataApi({
        DiscordAITranslator: {
            settings: {
                translation: { provider: "deepseek", apiKey: fakeKey },
                ui: { language: "zh-CN" }
            }
        }
    });
    let patchCount = 0;
    globalThis.BdApi = {
        ...dataApi,
        ContextMenu: {
            patch: () => {
                patchCount++;
                return () => {};
            },
            buildMenuChildren: groups => groups
        }
    };

    const unstarted = new Plugin();
    assert.equal(unstarted.lifecycleStarted, false);
    unstarted.setSetting("ui.language", "en");
    assert.equal(unstarted.settings.translation.apiKey, fakeKey);
    assert.equal(unstarted.settings.ui.language, "en");
    unstarted.flushSettings({ force: true, retryOnError: false });
    assert.equal(dataApi.Data.load("DiscordAITranslator", "settings").translation.apiKey, fakeKey);

    // Headless stop() without document must complete and emit lifecycle:stop, and post-stop patch is ignored
    delete globalThis.document;
    let stopEmitted = false;
    unstarted.events.on("lifecycle:stop", () => { stopEmitted = true; });
    assert.doesNotThrow(() => unstarted.stop());
    assert.equal(stopEmitted, true);
    patchCount = 0;
    assert.equal(unstarted.patchMessageContextMenu(), false);
    assert.equal(patchCount, 0);
});

test("v0.6 audit: manual long-text translation aborts remaining chunks when route or provider changes mid-flight", async () => {
    const { document, restore } = installChatGlobals({ bdApi: createFakeDataApi() });
    try {
        const plugin = new Plugin();
        plugin.settings.translation.provider = "deepseek";
        plugin.settings.translation.apiKey = ["sk", "old", "cloud"].join("-");
        let currentRoute = "100:200";
        plugin.getCurrentRouteKey = () => currentRoute;

        const longText = Array.from({ length: 5 }, (_, idx) => `Paragraph ${idx + 1}: ${"Detailed English release notes sentence for chunking test. ".repeat(14).trim()}`).join("\n");
        const contentNode = el("div", { id: "message-content-300000000000000001", class: "markup_test messageContent_test" }, [longText]);
        const messageNode = el("li", { id: "chat-messages-200-300000000000000001", class: "messageListItem_test" }, [contentNode]);
        document.body.appendChild(messageNode);

        let apiCalls = 0;
        plugin.fetchApiResponseText = async (_endpoint, _req, _timeout, callerOpts) => {
            apiCalls++;
            if (apiCalls === 1) {
                // Simulate user switching channel & switching provider to local mid-request
                currentRoute = "100:999";
                messageNode.remove();
                plugin.setTaskProvider("translation", "sakuraLocal");
                plugin.abortAutoTranslationRequests("route");
            }
            callerOpts?.signal?.throwIfAborted?.();
            return JSON.stringify({ choices: [{ message: { content: "中文分段译文内容。".repeat(25) }, finish_reason: "stop" }] });
        };

        const plan = plugin.createManualTranslationPlan(messageNode, contentNode, longText);
        await assert.rejects(plugin.runManualTranslationPlan(plan));
        assert.equal(apiCalls, 1, "must abort after first in-flight request without sending remaining chunks");
    }
    finally {
        restore();
    }
});

test("v0.6 audit: truncation expands on primary before provider fallback, caps at 65536 without shrinking, and preserves token-only chunks", async () => {
    const plugin = new Plugin();
    const priKey = ["sk", "pri", "trunc"].join("-");
    const fbKey = ["sk", "fb", "trunc"].join("-");
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = priKey;
    plugin.settings.translation.maxTokens = 300;
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible"];
    plugin.settings.translation.providerProfiles = {
        openaiCompatible: {
            provider: "openaiCompatible",
            endpoint: "https://relay.example.com/v1/chat/completions",
            apiKey: fbKey,
            apiKeyOrigin: "https://relay.example.com",
            model: "gpt-4o-mini"
        }
    };

    const calls = [];
    plugin.fetchApiResponseText = async (endpoint, req) => {
        const maxTok = Number(req.body?.max_tokens || 0);
        calls.push({ endpoint, maxTok });
        if (maxTok <= 300) {
            return JSON.stringify({ choices: [{ message: { content: "部分" }, finish_reason: "length" }] });
        }
        return JSON.stringify({ choices: [{ message: { content: "完整的主服务扩容译文。" }, finish_reason: "stop" }] });
    };

    const plan = plugin.createManualTranslationPlan(null, null, "Short source message that needs more output tokens.");
    const res = await plugin.runManualTranslationPlan(plan);
    assert.equal(res.translated, "完整的主服务扩容译文。");
    assert.equal(calls.every(c => c.endpoint.includes("deepseek")), true, "primary expands and succeeds before touching fallback");
    assert.ok(calls.length >= 2 && calls[1].maxTok > 300);

    // Public bilingual configured above 8192 (e.g., 16384) must raise rather than shrink to 8192, and tag polish taskKind
    const biPlugin = new Plugin();
    biPlugin.settings.translation.provider = "deepl";
    biPlugin.settings.polish.provider = "deepseek";
    biPlugin.settings.polish.apiKey = priKey;
    biPlugin.settings.polish.maxTokens = 16384;
    const biSeen = [];
    biPlugin.fetchApiResponseText = async (_ep, req) => {
        biSeen.push(req.body?.max_tokens);
        return JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "length" }] });
    };
    await assert.rejects(
        biPlugin.runPublicBilingualTranslationTask("早上好，今天我们来测试高上限截断行为。"),
        err => {
            assert.equal(err.taskKind, "polish");
            assert.equal(biPlugin.formatError(err), biPlugin.t("errorOutputTruncatedPolish"));
            return true;
        }
    );
    assert.equal(biSeen[0], 16384);
    assert.ok(biSeen[1] > 16384, `expected retry > 16384, got ${JSON.stringify(biSeen)}`);

    // Long text with standalone URL/mention/emoji paragraph passes token-only chunk through without dropping it
    const tokenPlugin = new Plugin();
    tokenPlugin.settings.translation.apiKey = priKey;
    let chunkCalls = 0;
    tokenPlugin.fetchApiResponseText = async () => {
        chunkCalls++;
        return JSON.stringify({ choices: [{ message: { content: "这是第一段完整准确的中文公告译文内容。".repeat(25) }, finish_reason: "stop" }] });
    };
    const proseChunk = "Important server announcement regarding upcoming maintenance schedule. ".repeat(11).trim();
    const tokenChunk = "https://discord.com/channels/100/200/300 <@123456789012345678> <:pepe_ok:987654321098765432>";
    const merged = await tokenPlugin.runLongAutoTranslationTask(`${proseChunk}\n\n${tokenChunk}`, tokenPlugin.getAutoTranslationOptions());
    assert.equal(chunkCalls, 1);
    assert.ok(merged.includes("https://discord.com/channels/100/200/300"));
    assert.ok(merged.includes("<@123456789012345678>"));
    assert.equal(DIAGNOSTIC_REASON_CODES.AUTO_DISABLED, "auto-disabled");
});

test("v0.6 audit: numeric/adjacent custom emojis, Latin short phrases, language aliases, and blank request numbers", () => {
    const plugin = new Plugin();

    // Numeric & adjacent custom emojis
    assert.equal(plugin.hasDiscordEmojiTokenMismatch("Nice <:666:123456789012345678>", "厉害 :666:"), false);
    assert.equal(plugin.hasDiscordEmojiTokenMismatch("Press <:a:123456789012345678>", "按 :a:"), false);
    assert.equal(plugin.hasDiscordEmojiTokenMismatch("Score 100 <:pepe:123456789012345678>", "得分100:pepe:"), false);
    assert.equal(
        plugin.restoreCustomEmojiTokensFromSource("Score 100 <:pepe:123456789012345678> <:666:987654321098765432>", "得分100:pepe::666:"),
        "得分100<:pepe:123456789012345678><:666:987654321098765432>"
    );

    // Everyday short Spanish / French / German / Italian phrases from non-Latin sources
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("非常感谢！", "Muchas gracias!", "西班牙语"), "");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("干得好！", "Bon travail !", "法语"), "");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("完全明白！", "Alles klar!", "德语"), "");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("没问题。", "Va bene.", "意大利语"), "");

    // Localized Chinese aliases in ru / ar / es, case-insensitive English/Spanish, and zh-TW Simplified label
    for (const alias of ["Китайский", "الصينية", "Chino", "漢語", "簡體中文"]) {
        assert.equal(plugin.normalizeLanguageName(alias), "汉语", alias);
        assert.equal(plugin.getGoogleLanguageCode(alias), "zh-CN", alias);
    }
    assert.equal(plugin.normalizeLanguageName("english"), "英语");
    assert.equal(plugin.normalizeLanguageName("spanish"), "西班牙语");
    plugin.settings.ui.language = "zh-TW";
    assert.match(plugin.getDisplayLanguage("汉语"), /^簡體中文/);

    // Blank / null request numbers fall back to defaults instead of clamping to 1 or 0
    assert.equal(plugin.normalizeRequestNumber("", 1200, { min: 1, integer: true }), 1200);
    assert.equal(plugin.normalizeRequestNumber("   ", 1200, { min: 1, integer: true }), 1200);
    assert.equal(plugin.normalizeRequestNumber(null, 1200, { min: 1, integer: true }), 1200);
    assert.equal(plugin.normalizeTaskMaxTokens("translation", "   "), 1200);

    // Connection test truncation symmetry for Polish local & Gemini 2.5 reasoning probe
    const truncErr = Object.assign(plugin.createModelOutputTruncatedError("OK", "length"), { partialOutputLength: 2 });
    assert.equal(plugin.isAcceptableConnectionTestTruncation(truncErr, "polish", {
        provider: "sakuraLocal",
        endpoint: "http://127.0.0.1:8080/v1/chat/completions"
    }), true);
    assert.equal(plugin.isAlwaysReasoningModelName("gemini-2.5-pro"), true);
    assert.notEqual(getDiagnosticCodeLabel("parse", "zh-CN"), "parse");
    assert.notEqual(getDiagnosticCodeLabel("budget-exhausted", "ar"), "budget-exhausted");
});

test("v0.6 audit: custom credential origin guard, cache endpoint scope, composer isolation, and in-place locale refresh", async () => {
    const { document, restore } = installChatGlobals({ bdApi: createFakeDataApi() });
    try {
        const plugin = new Plugin();
        plugin.saveSettings = () => {};
        plugin.flushSettings = () => {};
        plugin.showToast = () => {};

        // 1. Custom adapter credential origin guard & scoped cache endpoint
        plugin.providerLayer.registry.register({
            id: "customRelayAudit",
            label: "Custom Relay",
            kind: "chat",
            tasks: { translation: true, polish: true },
            supportsModelDetection: true,
            credentialFields: ["relayToken"],
            defaultProfile: {
                endpoint: "https://trusted.relay.example/v1/chat/completions",
                model: "relay-v1"
            },
            hasUsableConfig: cfg => Boolean(cfg?.endpoint && cfg?.relayToken),
            buildHeaders: cfg => ({ "Content-Type": "application/json", "X-Relay-Token": cfg.relayToken }),
            applyCacheScope: (_cfg, snap) => { snap.endpoint = "https://scoped.relay.example"; }
        });
        plugin.setTaskProvider("translation", "customRelayAudit");
        plugin.setSetting("translation.endpoint", "https://trusted.relay.example/v1/chat/completions");
        plugin.setSetting("translation.relayToken", ["tok", "secret", "relay"].join("-"));
        assert.equal(plugin.settings.translation.apiKeyOrigin, "https://trusted.relay.example");
        plugin.setSetting("translation.endpoint", "https://untrusted.other.example/v1/chat/completions");
        assert.equal(plugin.hasApiKeyOriginMismatch(plugin.settings.translation), true);
        assert.equal(plugin.getMissingServiceSettingPath("translation"), "translation.endpoint");

        const keyNodeA = plugin.getTranslationCacheKey("Hello", {
            configOverrides: { provider: "customRelayAudit", endpoint: "https://node1.relay.example/v1", relayToken: "t1" }
        });
        const keyNodeB = plugin.getTranslationCacheKey("Hello", {
            configOverrides: { provider: "customRelayAudit", endpoint: "https://node2.relay.example/v1", relayToken: "t1" }
        });
        assert.equal(keyNodeA, keyNodeB, "custom applyCacheScope endpoint must be preserved");
        plugin.providerLayer.registry.unregister("customRelayAudit");

        // 2. Forwarded message with emoji-only first block resolves translatable second block
        const emojiComment = el("div", { id: "message-content-1", class: "messageContent_test markup_test" }, [
            el("img", { class: "emoji", alt: "👀" })
        ]);
        const forwardedText = el("div", { id: "message-content-2", class: "messageContent_test markup_test" }, [
            "今日のイベントは夜九時から始まります"
        ]);
        const msgLi = el("li", { id: "chat-messages-100-200" }, [emojiComment, forwardedText]);
        msgLi.insertBefore = child => msgLi.appendChild(child);
        forwardedText.insertBefore = child => forwardedText.appendChild(child);
        document.body.appendChild(msgLi);
        assert.equal(plugin.getMessageContentElement(msgLi), forwardedText);

        // 3. In-place refreshLocalizedUi preserves manual translation line & PolishResultPanel
        const manualLine = plugin.renderTranslation(msgLi, forwardedText, "今晚的活动从九点开始", "manual-key", "今日のイベントは夜九時から始まります", {
            mode: "manual"
        });
        assert.ok(manualLine?.isConnected);

        const mainBox = el("div", { "data-slate-editor": "true", role: "textbox", contenteditable: "true" }, ["draft A"]);
        const mainForm = el("form", { class: "channelTextArea_main" }, [mainBox]);
        const threadBox = el("div", { "data-slate-editor": "true", role: "textbox", contenteditable: "true" }, ["draft B"]);
        const threadForm = el("form", { class: "channelTextArea_thread" }, [threadBox]);
        document.body.appendChild(mainForm);
        document.body.appendChild(threadForm);

        // resolveInputActionTextbox falls back to getTextbox() when activeElement is null/body
        document.activeElement = document.body;
        assert.equal(plugin.resolveInputActionTextbox(null, {}), mainBox);

        plugin.showPolishResultPanel(mainBox, "Polished draft A");
        assert.ok(plugin.polishResultPanel?.isConnected);

        plugin.setSetting("ui.language", "ar");
        assert.equal(manualLine.isConnected, true, "manual translation line stays mounted across locale switch");
        assert.equal(plugin.polishResultPanel?.isConnected, true, "PolishResultPanel stays mounted across locale switch");
        assert.equal(plugin.polishResultPanel.getAttribute("dir"), "rtl");
        plugin.removePolishResultPanel();

        // 4. Multi-composer session isolation: thread session never overwrites main session
        const sMain = plugin.getPolishSession(mainBox, "draft A");
        const sThread = plugin.getPolishSession(threadBox, "draft B");
        assert.notEqual(sMain, sThread);
        assert.equal(plugin.getPolishSession(mainBox, "draft A"), sMain);
        assert.equal(plugin.getPolishSession(threadBox, "draft B"), sThread);
    }
    finally {
        restore();
    }
});
