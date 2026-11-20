"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

// Milestone 1 regressions: M-01 generated mass mentions, M-02 cooldown survival across
// runtime cancellation, M-03 total automatic retry budget + immediate stop on auth/quota/client,
// and cross-channel late-result apply guard.

test("M-01: guardGeneratedMassMentions defangs newly introduced @everyone/@here/role mentions while preserving user-authored ones", () => {
    const plugin = new Plugin();

    // Source has no mass mentions; model adds @everyone and @here.
    const added = plugin.guardGeneratedMassMentions(
        "请大家看一下这个更新",
        "@everyone @here Please take a look at this update."
    );
    assert.equal(added.neutralized, true);
    assert.deepEqual(added.addedMentions, ["@everyone", "@here"]);
    assert.ok(added.text.includes("@\u200beveryone"));
    assert.ok(added.text.includes("@\u200bhere"));
    assert.ok(!/(^|\s)@everyone\b/i.test(added.text));
    assert.ok(!/(^|\s)@here\b/i.test(added.text));

    // User intentionally wrote @here once; model keeps one @here and adds an extra @everyone.
    const partial = plugin.guardGeneratedMassMentions(
        "@here please review",
        "@here @everyone please review this PR"
    );
    assert.equal(partial.neutralized, true);
    assert.deepEqual(partial.addedMentions, ["@everyone"]);
    assert.ok(partial.text.startsWith("@here "));
    assert.ok(partial.text.includes("@\u200beveryone"));

    // User intentionally typed @everyone; model preserves it once -> untouched.
    const intentional = plugin.guardGeneratedMassMentions(
        "@everyone meeting at 3pm",
        "@everyone The meeting starts at 3 PM."
    );
    assert.equal(intentional.neutralized, false);
    assert.equal(intentional.text, "@everyone The meeting starts at 3 PM.");

    // Role mention added by model is defanged; mentions inside inline code are untouched.
    const roleAndCode = plugin.guardGeneratedMassMentions(
        "Use `@everyone` in code only",
        "Use `@everyone` in code only <@&123456789012345678>"
    );
    assert.equal(roleAndCode.neutralized, true);
    assert.deepEqual(roleAndCode.addedMentions, ["<@&123456789012345678>"]);
    assert.ok(roleAndCode.text.includes("`@everyone`"));
    assert.ok(roleAndCode.text.includes("<@\u200b&123456789012345678>"));
});

test("M-02: cancelAutoTranslationRuntimeWork cancels timers/queues but preserves failure cooldown maps", () => {
    const plugin = new Plugin();
    const now = Date.now();
    plugin.autoTranslationFailures.set("msg-key", { count: 2, retryAt: now + 30000, type: "rate-limit", terminal: false });
    plugin.autoTranslationProviderFailures.set("prov-key", { count: 1, retryAt: now + 60000, type: "rate-limit", terminal: false });
    plugin.autoTranslationRetryTimer = setTimeout(() => {}, 60000);
    plugin.autoTranslationRetryAt = now + 60000;
    try {
        const cancelled = plugin.cancelAutoTranslationRuntimeWork("channel-policy-disabled");
        assert.equal(cancelled, true);
        assert.equal(plugin.autoTranslationRetryTimer, null, "retry timer is cleared on channel cancellation");
        assert.equal(plugin.autoTranslationFailures.size, 1, "message failure cooldown survives channel switch");
        assert.equal(plugin.autoTranslationProviderFailures.size, 1, "provider failure cooldown survives channel switch");
    }
    finally {
        if (plugin.autoTranslationRetryTimer) clearTimeout(plugin.autoTranslationRetryTimer);
    }
});

test("M-03: auth/quota/client errors stop immediately, and repeated transient errors terminate at retry budget", () => {
    const plugin = new Plugin();

    // 401 auth stops immediately without looping.
    const authFailure = plugin.createAutoTranslationFailure("msg-auth", Object.assign(new Error("HTTP 401"), { status: 401 }));
    assert.equal(authFailure.type, "auth");
    assert.equal(authFailure.terminal, true);
    assert.equal(authFailure.retryAt, 0);

    // OpenAI 429 with insufficient_quota is classified as quota and stops immediately.
    const oaiQuotaErr = Object.assign(new Error("You exceeded your current quota, please check your plan."), {
        status: 429,
        apiErrorCode: "insufficient_quota"
    });
    const quotaFailure = plugin.createAutoTranslationFailure("msg-quota", oaiQuotaErr);
    assert.equal(quotaFailure.type, "quota");
    assert.equal(quotaFailure.terminal, true);
    assert.equal(quotaFailure.retryAt, 0);

    // DeepL 456 is classified as quota and stops immediately.
    const deeplQuotaFailure = plugin.createAutoTranslationFailure("msg-deepl", Object.assign(new Error("Quota exceeded"), { status: 456 }));
    assert.equal(deeplQuotaFailure.type, "quota");
    assert.equal(deeplQuotaFailure.terminal, true);

    // Transient 503 retries up to 5 times with backoff and terminates on the 6th attempt.
    const transientFailures = [];
    for (let attempt = 0; attempt < 7; attempt++) {
        const err = Object.assign(new Error("HTTP 503"), { status: 503 });
        const record = plugin.createAutoTranslationFailure("msg-transient", err);
        plugin.autoTranslationFailures.set("msg-transient", record);
        transientFailures.push(record);
    }
    assert.deepEqual(transientFailures.map(f => f.terminal), [false, false, false, false, false, true, true]);
    assert.equal(transientFailures[5].budgetExhausted, true);
    assert.equal(transientFailures[5].retryAt, 0);
});

test("late-result panel blocks applying into a different channel after switching routes", async () => {
    const plugin = new Plugin();
    let route = "guild-1/channel-a";
    plugin.getCurrentRouteKey = () => route;
    const toasts = [];
    plugin.showToast = (msg, type) => toasts.push({ msg, type });
    let replaced = false;
    plugin.composerWriter.replaceTextSafely = async () => {
        replaced = true;
        return { ok: true };
    };
    const textbox = { isConnected: true, tagName: "TEXTAREA", value: "draft" };
    route = "guild-1/channel-b";
    const applied = await plugin.applyPolishResultPanelText(textbox, "Polished result", {
        originRouteKey: "guild-1/channel-a",
        originComposerKey: "guild-1/channel-a::textarea"
    });
    assert.equal(applied, false);
    assert.equal(replaced, false);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].msg, plugin.t("composerChannelChanged"));
});

test("inline BD 1.14+ settings view fits inline column and caps height to zoomed viewport without popup modal width override", t => {
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedGcs = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
    t.after(() => {
        if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow); else delete globalThis.window;
        if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument); else delete globalThis.document;
        if (savedGcs) Object.defineProperty(globalThis, "getComputedStyle", savedGcs); else delete globalThis.getComputedStyle;
    });

    const props = {};
    const contentCol = { className: "contentColumn_abc123", dataset: {}, parentElement: null, getBoundingClientRect: () => ({ width: 680, height: 600, top: 0 }) };
    const sidebarView = { className: "standardSidebarView_xyz", dataset: {}, parentElement: null, getBoundingClientRect: () => ({ width: 1024, height: 600, top: 0 }) };
    const body = { className: "", dataset: {} };
    sidebarView.parentElement = body;
    contentCol.parentElement = sidebarView;
    const panel = {
        isConnected: true,
        className: "dait-settings",
        dataset: {},
        parentElement: contentCol,
        style: {
            setProperty(k, v) { props[k] = String(v); },
            removeProperty(k) { delete props[k]; }
        },
        getBoundingClientRect: () => ({ width: 680, height: 500, top: 136 })
    };
    globalThis.document = { body, documentElement: { clientWidth: 1024, clientHeight: 600 } };
    globalThis.window = { innerWidth: 1024, innerHeight: 600, visualViewport: { height: 600 }, addEventListener() {}, removeEventListener() {} };
    globalThis.getComputedStyle = () => ({ overflowY: "auto", paddingBottom: "0px", maxHeight: "none" });

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.watchSettingsModalSizingCleanup = () => {};
    plugin.applySettingsModalSizing(panel);

    assert.equal(panel.dataset.daitSettingsInline, "true");
    assert.equal(contentCol.dataset.daitSettingsModal, undefined, "inline BD column must not be forced to 920px modal width");
    assert.equal(props["--dait-host-chrome"], "0px");
    assert.equal(props["--dait-host-max"], "440px", "caps panel height to remaining visible viewport (600 - 136 - 24)");
});

test("model name memory persists user-typed custom models across provider switches", () => {
    const plugin = new Plugin();
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.setTaskProvider("translation", "deepseek");
    plugin.setSetting("translation.model", "deepseek-v5-next", { save: "immediate" });
    plugin.setSetting("translation.model", "deepseek-reasoner-2027", { save: "immediate" });

    assert.equal(plugin.settings.translation.model, "deepseek-reasoner-2027");
    assert.deepEqual(
        plugin.settings.translation.providerProfiles.deepseek.recentModels.slice(0, 2),
        ["deepseek-reasoner-2027", "deepseek-v5-next"]
    );

    // Switch away to OpenAI-compatible and enter another custom model, then switch back to DeepSeek.
    plugin.setTaskProvider("translation", "openaiCompatible");
    plugin.setSetting("translation.model", "gpt-6-mini", { save: "immediate" });
    plugin.setTaskProvider("translation", "deepseek");
    assert.equal(plugin.settings.translation.model, "deepseek-reasoner-2027", "remembers last custom DeepSeek model");

    plugin.setTaskProvider("translation", "openaiCompatible");
    assert.equal(plugin.settings.translation.model, "gpt-6-mini", "remembers last custom OpenAI-compatible model");
});

test("AI launcher switches to compact mode when overlapping or clipping Discord User Settings gear button", () => {
    const plugin = new Plugin();
    const button = {
        isConnected: true,
        dataset: {},
        getBoundingClientRect: () => ({ left: 178, right: 210, top: 760, bottom: 790, width: 32, height: 30 })
    };
    const settingsButton = {
        isConnected: true,
        getBoundingClientRect: () => ({ left: 200, right: 232, top: 760, bottom: 792, width: 32, height: 32 })
    };
    const container = {
        getBoundingClientRect: () => ({ left: 100, right: 232, top: 756, bottom: 796, width: 132, height: 40 }),
        closest: () => ({ getBoundingClientRect: () => ({ left: 0, right: 232, top: 740, bottom: 800, width: 232, height: 60 }) })
    };

    const adjusted = plugin.syncQuickSettingsLauncherLayout(button, settingsButton, container);
    assert.equal(adjusted, true);
    assert.equal(button.dataset.daitLauncherCompact, "true");
});

test("message button sync is strictly idempotent and ignores layout-only scroller mutations", () => {
    const plugin = new Plugin();
    let classWrites = 0;
    const classes = new Set(["dait-message-button", "theme-light"]);
    const button = {
        className: "dait-message-button theme-light",
        dataset: { daitDiscordTheme: "light", daitThemeEpoch: String(plugin.discordThemeCacheEpoch || 0) },
        classList: {
            contains: name => classes.has(name),
            add: name => { classWrites++; classes.add(name); },
            remove: name => { classWrites++; classes.delete(name); },
            toggle: (name, force) => { classWrites++; if (force) classes.add(name); else classes.delete(name); }
        },
        style: {
            getPropertyValue: () => "",
            setProperty: () => { classWrites++; },
            removeProperty: () => { classWrites++; }
        }
    };
    plugin.getDiscordThemeSource = () => ({ themeClass: "theme-light", node: null });
    plugin.applyMessageButtonVisibilityToButton(button, null);
    assert.equal(classWrites, 0, "no classList or inline style mutations on already-synced message button");

    // Layout-only style mutation on chat scroller must not trigger theme refresh or scan.
    const scroller = {
        nodeType: 1,
        className: "scrollerInner_abc theme-light",
        dataset: {},
        matches: selector => selector.includes("scrollerInner"),
        closest: () => null
    };
    assert.equal(plugin.hasDiscordThemeMutation([{ type: "attributes", attributeName: "style", target: scroller }]), false);
    assert.equal(plugin.isLayoutOnlyChatContainerMutation({ type: "attributes", attributeName: "style", target: scroller }), true);
});

test("OpenAI-compatible base URLs like http://127.0.0.1:18080/v1 complete to /v1/chat/completions", () => {
    const plugin = new Plugin();
    assert.equal(
        plugin.getEffectiveChatCompletionEndpoint({ provider: "openaiCompatible", endpoint: "http://127.0.0.1:18080/v1" }),
        "http://127.0.0.1:18080/v1/chat/completions"
    );
    assert.equal(
        plugin.getEffectiveChatCompletionEndpoint({ provider: "openaiCompatible", endpoint: "http://127.0.0.1:18080/v1/" }),
        "http://127.0.0.1:18080/v1/chat/completions"
    );
    assert.equal(
        plugin.getEffectiveChatCompletionEndpoint({ provider: "openaiCompatible", endpoint: "http://127.0.0.1:18080" }),
        "http://127.0.0.1:18080/v1/chat/completions"
    );
    assert.equal(
        plugin.getEffectiveChatCompletionEndpoint({ provider: "deepseek", endpoint: "https://api.deepseek.com/chat/completions" }),
        "https://api.deepseek.com/chat/completions"
    );
    assert.equal(
        plugin.getLocalProviderModelsEndpoint("http://127.0.0.1:18080/v1"),
        "http://127.0.0.1:18080/v1/models"
    );
});

test("fetchApiResponseText falls back to BdApi.Net.fetch on browser CORS/PNA Failed to fetch and still blocks redirects", async t => {
    const savedBdApi = Object.getOwnPropertyDescriptor(globalThis, "BdApi");
    t.after(() => {
        if (savedBdApi) Object.defineProperty(globalThis, "BdApi", savedBdApi);
        else delete globalThis.BdApi;
    });

    t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("Failed to fetch");
    });
    const calls = [];
    globalThis.BdApi = {
        Net: {
            fetch: async (url, options) => {
                calls.push({ url, options });
                if (url.endsWith("/302")) return { ok: false, status: 302, url, text: async () => "" };
                return { ok: true, status: 200, url, text: async () => JSON.stringify({ data: [{ id: "local-provider/chat-fast" }] }) };
            }
        }
    };

    const plugin = new Plugin();
    const raw = await plugin.fetchApiResponseText("http://127.0.0.1:18080/v1/models", { method: "GET", headers: { Authorization: "Bearer synthetic-local-key" } }, 2000);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.redirect, "manual");
    assert.equal(calls[0].options.maxRedirects, 0);
    assert.deepEqual(plugin.parseLocalProviderModelsResponse(raw, { all: true }), ["local-provider/chat-fast"]);

    await assert.rejects(
        plugin.fetchApiResponseText("http://127.0.0.1:18080/v1/302", { method: "GET", headers: {} }, 2000),
        error => error?.code === "API_REDIRECT_BLOCKED"
    );
});

test("dynamic settings sizing detects obfuscated BD 1.14+ inline column by geometry and prevents right-edge clipping", t => {
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    const savedDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    const savedGcs = Object.getOwnPropertyDescriptor(globalThis, "getComputedStyle");
    t.after(() => {
        if (savedWindow) Object.defineProperty(globalThis, "window", savedWindow); else delete globalThis.window;
        if (savedDocument) Object.defineProperty(globalThis, "document", savedDocument); else delete globalThis.document;
        if (savedGcs) Object.defineProperty(globalThis, "getComputedStyle", savedGcs); else delete globalThis.getComputedStyle;
    });

    const props = {};
    const body = { className: "", dataset: {} };
    // Obfuscated Discord Settings column with no recognizable class name, starting at x=260 inside a 960px zoomed window.
    const obfColumn = {
        className: "c_9f8e7d6",
        dataset: {},
        parentElement: body,
        getBoundingClientRect: () => ({ left: 260, right: 940, width: 680, height: 620, top: 0 })
    };
    const panel = {
        isConnected: true,
        className: "dait-settings",
        dataset: {},
        parentElement: obfColumn,
        style: {
            setProperty(k, v) { props[k] = String(v); },
            removeProperty(k) { delete props[k]; }
        },
        getBoundingClientRect: () => ({ left: 276, right: 924, width: 648, height: 500, top: 110 })
    };
    globalThis.document = { body, documentElement: { clientWidth: 960, clientHeight: 620 } };
    globalThis.window = { innerWidth: 960, innerHeight: 620, visualViewport: { width: 960, height: 620 }, addEventListener() {}, removeEventListener() {} };
    globalThis.getComputedStyle = () => ({ overflowX: "hidden", overflowY: "auto", paddingLeft: "16px", paddingRight: "16px", paddingBottom: "0px", maxHeight: "none" });

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.watchSettingsModalSizingCleanup = () => {};
    plugin.applySettingsModalSizing(panel);

    assert.equal(panel.dataset.daitSettingsInline, "true", "geometry detects right-hand inline settings column");
    assert.equal(obfColumn.dataset.daitSettingsModal, undefined, "obfuscated inline column is never forced to 920px");
    assert.equal(props["--dait-dynamic-max-w"], "648px", "dynamic max-width respects clipping ancestor inner width");
    assert.equal(props["--dait-host-max"], "486px", "dynamic max-height respects zoomed visualViewport height");
});

test("passing a connection test saves a reusable service config and auto-syncs untouched polish without overwriting configured polish", async () => {
    const plugin = new Plugin();
    plugin.showToast = () => {};
    plugin.queueScan = () => {};
    plugin.saveSettings = () => true;
    plugin.setTaskProvider("translation", "openaiCompatible");
    plugin.settings.translation.apiKey = "synthetic-local-key";
    plugin.settings.translation.endpoint = "http://127.0.0.1:18080/v1";
    plugin.settings.translation.model = "local-provider/chat-fast";
    plugin.fetchApiResponseText = async () => JSON.stringify({
        model: "local-provider/chat-fast",
        choices: [{ message: { content: "OK" }, finish_reason: "stop" }]
    });

    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.equal(plugin.settings.serviceConfigs.length, 1);
    assert.equal(plugin.settings.serviceConfigs[0].provider, "openaiCompatible");
    assert.equal(plugin.settings.serviceConfigs[0].model, "local-provider/chat-fast");
    // Untouched default polish is auto-synced on first verified LLM config.
    assert.equal(plugin.settings.polish.provider, "openaiCompatible");
    assert.equal(plugin.settings.polish.apiKey, "synthetic-local-key");
    assert.equal(plugin.settings.polish.endpoint, "http://127.0.0.1:18080/v1");
    assert.equal(plugin.settings.polish.model, "local-provider/chat-fast");
    assert.equal(plugin.settings.polish.apiStatus.state, "success");

    // Re-testing the same endpoint+model deduplicates instead of creating duplicates.
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.equal(plugin.settings.serviceConfigs.length, 1);

    // Testing a second model saves a second config and does NOT overwrite already-configured polish.
    plugin.settings.translation.model = "local-provider/chat-alt";
    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.equal(plugin.settings.serviceConfigs.length, 2);
    assert.equal(plugin.settings.polish.model, "local-provider/chat-fast", "already-configured polish is preserved");

    // Picking the newly saved config on polish applies it immediately with verified status.
    const secondId = plugin.settings.serviceConfigs[0].id;
    assert.equal(plugin.applySavedServiceConfig("polish", secondId, { silent: true }), true);
    assert.equal(plugin.settings.polish.model, "local-provider/chat-alt");
    assert.equal(plugin.settings.polish.apiStatus.state, "success");
});

test("saved configs filter machine translation engines out of polish and syncTaskServiceConfig respects task capabilities", () => {
    const plugin = new Plugin();
    plugin.toasts = [];
    plugin.showToast = (text, type) => plugin.toasts.push({ text, type });
    plugin.queueScan = () => {};
    plugin.saveSettings = () => true;

    plugin.setTaskProvider("translation", "deepl");
    plugin.settings.translation.apiKey = "deepl-key-1";
    plugin.settings.translation.apiStatus = { state: "success", message: "" };
    plugin.saveVerifiedServiceConfig("translation", plugin.settings.translation, { autoSync: false, save: false, refreshUi: false });

    plugin.setTaskProvider("translation", "openaiCompatible");
    plugin.settings.translation.apiKey = "synthetic-local-key";
    plugin.settings.translation.endpoint = "http://127.0.0.1:18080/v1";
    plugin.settings.translation.model = "local-provider/chat-fast";
    plugin.settings.translation.apiStatus = { state: "success", message: "" };
    plugin.saveVerifiedServiceConfig("translation", plugin.settings.translation, { autoSync: false, save: false, refreshUi: false });

    assert.equal(plugin.getSavedServiceConfigsForTask("translation").length, 2);
    assert.equal(plugin.getSavedServiceConfigsForTask("polish").length, 1);
    assert.equal(plugin.getSavedServiceConfigsForTask("polish")[0].provider, "openaiCompatible");
    assert.match(plugin.formatServiceConfigLabel(plugin.getSavedServiceConfigsForTask("polish")[0]), /chat-fast.*127\.0\.0\.1:18080/);

    // Explicit sync from LLM translation -> polish succeeds.
    assert.equal(plugin.syncTaskServiceConfig("translation", "polish"), true);
    assert.equal(plugin.settings.polish.provider, "openaiCompatible");
    assert.equal(plugin.settings.polish.model, "local-provider/chat-fast");

    // Switching translation to DeepL blocks sync to polish cleanly.
    plugin.setTaskProvider("translation", "deepl");
    plugin.settings.translation.apiKey = "deepl-key-1";
    assert.equal(plugin.syncTaskServiceConfig("translation", "polish"), false);
    assert.equal(plugin.settings.polish.provider, "openaiCompatible");
});

test("ensureSettingsShape seeds already-verified configs on upgrade and respects explicit empty list, while snapshot redacts secrets", () => {
    const plugin = new Plugin();
    plugin.saveData = () => true;
    plugin.loadData = key => key === "settings" ? {
        translation: {
            provider: "openaiCompatible",
            apiKey: "sk-secret-upgrade-1",
            endpoint: "https://user:pass@relay.example.com/v1/chat/completions?token=qs-secret",
            model: "C:/Users/alice/models/custom.gguf",
            apiStatus: { state: "success", message: "" }
        }
    } : null;
    plugin.loadSettings();
    assert.equal(plugin.settings.serviceConfigs.length, 1, "already-verified translation config is seeded on upgrade");

    const snapshotText = JSON.stringify(plugin.createSettingsSnapshot());
    assert.equal(snapshotText.includes("sk-secret-upgrade-1"), false, "serviceConfigs apiKey is redacted");
    assert.equal(snapshotText.includes("qs-secret"), false, "serviceConfigs endpoint query is redacted");
    assert.equal(snapshotText.includes("user:pass"), false, "serviceConfigs endpoint credentials are redacted");
    assert.equal(snapshotText.includes("alice"), false, "serviceConfigs local model path user name is redacted");

    // Keeping credentials on reset keeps valid serviceConfigs; clearing credentials drops them.
    plugin.resetSettingsToDefaults({ keepCredentials: true });
    assert.equal(plugin.settings.serviceConfigs.length, 1);
    plugin.resetSettingsToDefaults({ keepCredentials: false });
    assert.deepEqual(plugin.settings.serviceConfigs, []);

    // An explicitly stored empty serviceConfigs array is not re-seeded.
    const clearedPlugin = new Plugin();
    clearedPlugin.loadData = key => key === "settings" ? {
        translation: {
            provider: "deepseek",
            apiKey: "sk-secret-2",
            apiStatus: { state: "success", message: "" }
        },
        serviceConfigs: []
    } : null;
    clearedPlugin.loadSettings();
    assert.deepEqual(clearedPlugin.settings.serviceConfigs, []);
});

test("BdApi.Net.fetch receives explicit timeout, caches CORS-blocked origins, and maps transport AbortError to retryable REQUEST_TIMEOUT", async t => {
    const savedBdApi = globalThis.BdApi;
    t.after(() => { globalThis.BdApi = savedBdApi; });

    let browserFetchCalls = 0;
    t.mock.method(globalThis, "fetch", async () => {
        browserFetchCalls++;
        throw new TypeError("Failed to fetch");
    });

    const bdCalls = [];
    globalThis.BdApi = {
        Net: {
            fetch: async (url, options) => {
                bdCalls.push({ url, options });
                if (url.endsWith("/transport-abort")) {
                    throw new DOMException("The operation was aborted", "AbortError");
                }
                return { ok: true, status: 200, url, text: async () => "{\"ok\":true}" };
            }
        }
    };

    const plugin = new Plugin();
    const relay = "https://relay.example.invalid/v1";
    const first = await plugin.fetchApiResponseText(`${relay}/models`, { method: "GET", headers: {} }, 40000);
    assert.equal(first, "{\"ok\":true}");
    assert.equal(browserFetchCalls, 1);
    assert.equal(bdCalls.length, 1);
    assert.equal(bdCalls[0].options.timeout, 40000);

    await plugin.fetchApiResponseText(`${relay}/chat/completions`, { method: "POST", headers: {}, body: {} }, 35000);
    assert.equal(browserFetchCalls, 1, "origin cached for BdApi.Net.fetch");
    assert.equal(bdCalls.length, 2);
    assert.equal(bdCalls[1].options.timeout, 35000);

    // If transport aborts internally while neither caller nor plugin aborted, classify as REQUEST_TIMEOUT (not silent REQUEST_CANCELLED).
    await assert.rejects(
        plugin.fetchApiResponseText(`${relay}/transport-abort`, { method: "POST", headers: {}, body: {} }, 25000),
        error => error?.code === "REQUEST_TIMEOUT" && plugin.getAutoTranslationFailureType(error) === "timeout"
    );
    assert.equal(browserFetchCalls, 1);
    assert.equal(bdCalls.length, 3);
    assert.equal(bdCalls[2].options.timeout, 25000);
});

test("extractModelContent strips <think> tags and skips reasoning content parts", () => {
    const plugin = new Plugin();
    assert.equal(
        plugin.extractModelContent("<think>internal reasoning</think>\n[{\"id\":\"001\",\"translation\":\"你好\"}]"),
        "[{\"id\":\"001\",\"translation\":\"你好\"}]"
    );
    assert.equal(
        plugin.extractModelContent([
            { type: "reasoning", text: "chain of thought" },
            { type: "text", text: "最终译文" }
        ]),
        "最终译文"
    );
    assert.equal(plugin.isAcceptableTargetShortTranslation("yes", "英语", "是的"), true);
});

test("omitted rows in a partial JSON batch requeue once as single requests and stale in-flight items clean up loading lines", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.ui.autoTranslateStrictRetry = false;
    plugin.settings.translation.targetLanguage = "汉语";
    plugin.queueScan = () => {};
    plugin.drainAutoTranslationQueue = () => {};
    plugin.saveSettings = () => true;
    plugin.showAutoTranslateError = () => {};
    plugin.isAutoTranslationVisibleItem = () => true;
    plugin.isElementVisibleInViewport = () => true;
    plugin.renderPendingAutoTranslationLoadingSafely = () => {};
    const removedLoading = [];
    plugin.removeAutoTranslationLoadingForItem = item => { removedLoading.push(item.cacheKey); };
    const rendered = [];
    plugin.renderAutoTranslationResultSafely = (item, text) => { rendered.push([item.cacheKey, text]); };

    const make = (key, text) => {
        const node = { isConnected: true };
        const content = { isConnected: true };
        const item = { cacheKey: key, text, messageNode: node, content, requestOptions: plugin.getAutoTranslationOptions() };
        plugin.markAutoTranslationInFlightItem(item);
        return item;
    };

    const items = [make("k1", "Hello world"), make("k2", "Needs jailbreak")];
    // Model returns row 001 and omits row 002 completely from the JSON array.
    plugin.runModelTask = async () => JSON.stringify([{ id: "001", translation: "你好世界" }]);
    await plugin.autoTranslateQueuedBatch(items);

    assert.deepEqual(rendered, [["k1", "你好世界"]]);
    assert.equal(plugin.autoTranslationFailures.size, 0, "omitted batch row is not marked as permanent failure");
    assert.equal(plugin.autoTranslationQueue.length, 1);
    assert.equal(plugin.autoTranslationQueue[0].cacheKey, "k2");
    assert.equal(plugin.autoTranslationQueue[0].daitSingleRequest, true);

    // A stale single in-flight item cleans up its loading line in finally instead of leaving "翻译中…" stuck.
    const stale = make("k-stale", "This is jails");
    plugin.runAutoTranslationTask = async () => {
        plugin.autoTranslationConfigVersion++;
        return "这是越狱";
    };
    await plugin.autoTranslateQueuedMessage(stale);
    assert.ok(removedLoading.includes("k-stale"), "stale in-flight item clears its loading indicator");
});
