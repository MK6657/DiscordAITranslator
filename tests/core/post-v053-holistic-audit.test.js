"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Plugin = require("../../src");
const { DEFAULT_SETTINGS } = require("../../src/constants");
const { convertDiscordMarkupToDisplayText } = require("../../src/intake/discord-markup");
const { getDiagnosticCodeLabel } = require("../../src/diagnostics/diagnostic-labels");

test("Polish defaults maxTokens to 2000, floors thinking/reasoning models to 4096, and retries once on MODEL_OUTPUT_TRUNCATED", async () => {
    assert.equal(DEFAULT_SETTINGS.polish.maxTokens, 2000);

    const plugin = new Plugin();
    plugin.settings.polish.provider = "deepseek";
    plugin.settings.polish.apiKey = ["sk", "test", "polish"].join("-");
    plugin.settings.polish.maxTokens = 800; // Legacy saved config from <= 0.5.3
    plugin.settings.polish.enableThinking = true;

    const observedMaxTokens = [];
    let callCount = 0;
    plugin.runModelTask = async (_kind, _input, options) => {
        callCount++;
        const maxTokens = options?.configOverrides?.maxTokens ?? plugin.settings.polish.maxTokens;
        observedMaxTokens.push(maxTokens);
        if (callCount === 1) {
            throw plugin.createModelOutputTruncatedError("", "length");
        }
        return "Hello! Let's sync up tomorrow afternoon.";
    };

    const result = await plugin.runPolishWithGuards("明天下午我们对一下进度吧");
    assert.equal(result, "Hello! Let's sync up tomorrow afternoon.");
    assert.equal(observedMaxTokens[0], 4096);
    assert.ok(observedMaxTokens[1] > observedMaxTokens[0], `expected raised retry maxTokens, got ${JSON.stringify(observedMaxTokens)}`);
});

test("Polish duplicate-repolish repair keeps valid first output when repair drifts into wrong script", async () => {
    const plugin = new Plugin();
    plugin.settings.polish.targetLanguage = "繁體中文";
    let call = 0;
    plugin.runModelTask = async () => {
        call++;
        if (call === 1) return "請確認這個檔案的設定。";
        return "请确认这个文件的设置。"; // Drifted into Simplified Chinese at high temperature
    };

    const output = await plugin.runPolishWithGuards("確認一下檔案設定", {
        previousResults: ["請確認這個檔案的設定。"],
        enforceRepolishVariation: true
    });
    assert.equal(output, "請確認這個檔案的設定。");
});

test("Public bilingual retries on truncation, restores <a?:name:id> custom emojis, and triggers confirmSend after auto-bilingual", async () => {
    const plugin = new Plugin();
    plugin.settings.polish.apiKey = ["sk", "test", "bilingual"].join("-");
    plugin.settings.polish.targetLanguage = "英语";
    plugin.settings.translation.maxTokens = 600;

    let attempts = 0;
    const seenMaxTokens = [];
    plugin.runModelTask = async (_kind, _text, options) => {
        attempts++;
        seenMaxTokens.push(options?.configOverrides?.maxTokens);
        if (attempts === 1) {
            throw plugin.createModelOutputTruncatedError("Good", "length");
        }
        return "Good morning! :pepe_happy:";
    };

    const translated = await plugin.runPublicBilingualTranslationTask("早上好！ <:pepe_happy:112233445566778899>");
    assert.equal(translated, "Good morning! <:pepe_happy:112233445566778899>");
    assert.equal(attempts, 2);
    assert.ok(seenMaxTokens[1] >= 2400);

    // Verify confirmSend fires after successful polish -> publicBilingualAfterPolish
    const confirmPlugin = new Plugin();
    confirmPlugin.isStarted = true;
    confirmPlugin.settings.polish.enabled = true;
    confirmPlugin.settings.polish.apiKey = ["sk", "confirm", "test"].join("-");
    confirmPlugin.settings.polish.targetLanguage = "汉语";
    confirmPlugin.settings.polish.afterAction = "confirmSend";
    confirmPlugin.settings.ui.publicBilingualInputButton = true;
    confirmPlugin.settings.ui.publicBilingualAfterPolish = true;

    const fakeTextbox = {
        nodeType: 1,
        isConnected: true,
        text: "明天见",
        dataset: {},
        closest: () => null,
        parentElement: { dataset: { daitComposerKey: "comp-1" } }
    };
    confirmPlugin.resolveInputActionTextbox = () => fakeTextbox;
    confirmPlugin.isInputActionTextboxCurrent = () => true;
    confirmPlugin.getTextboxDraftText = box => box.text;
    confirmPlugin.getElementText = box => box.text;
    confirmPlugin.getCurrentRouteKey = () => "100:200";
    confirmPlugin.runModelTask = async () => "明天老时间见！";
    confirmPlugin.composerWriter.replaceTextSafely = async (box, next) => {
        box.text = next;
        return { ok: true, userEditedAfter: false };
    };
    confirmPlugin.composerUi.publicBilingualCurrentDraft = async (_btn, opts) => {
        const composed = "See you tomorrow at the usual time!\n||明天老时间见！||";
        opts.textbox.text = composed;
        confirmPlugin.composerUi.updatePolishSessionAfterBilingual(confirmPlugin.polishSession, opts.textbox, composed, "明天老时间见！", true);
        return { ok: true, wrote: true };
    };
    confirmPlugin.publicBilingualCurrentDraft = confirmPlugin.composerUi.publicBilingualCurrentDraft;
    const previews = [];
    confirmPlugin.confirmAction = async ({ preview }) => {
        previews.push(preview);
        return false;
    };
    confirmPlugin.setButtonBusy = () => {};

    await confirmPlugin.polishCurrentDraft(null);
    assert.equal(previews.length, 1);
    assert.match(previews[0], /See you tomorrow/);
});

test("OpenAI o1/o3/o4/gpt-5 and DeepSeek reasoner body options, connection test, and orphan </think> stripping", () => {
    const plugin = new Plugin();
    plugin.settings.translation.provider = "openaiCompatible";
    plugin.settings.translation.endpoint = "https://api.openai.com/v1/chat/completions";
    plugin.settings.translation.apiKey = ["sk", "proj", "openai"].join("-");
    plugin.settings.translation.model = "o3-mini";
    plugin.settings.translation.maxTokens = 1200;
    plugin.settings.translation.temperature = 0.2;

    const builtOpenAI = plugin.buildModelRequest("translation", "hello");
    assert.equal(builtOpenAI.request.body.max_completion_tokens, 1200);
    assert.equal("max_tokens" in builtOpenAI.request.body, false);
    assert.equal("temperature" in builtOpenAI.request.body, false);

    const openAITest = plugin.buildConnectionTestRequest("translation", plugin.settings.translation);
    assert.equal(openAITest.request.body.max_completion_tokens, 512);
    assert.equal("temperature" in openAITest.request.body, false);

    // Hybrid DeepSeek with enableThinking: true disables thinking for the 32-token connectivity probe
    plugin.settings.polish.provider = "deepseek";
    plugin.settings.polish.apiKey = ["sk", "ds", "key"].join("-");
    plugin.settings.polish.model = "deepseek-v4-flash";
    plugin.settings.polish.enableThinking = true;
    const hybridProbe = plugin.buildConnectionTestRequest("polish", plugin.settings.polish);
    assert.deepEqual(hybridProbe.request.body.thinking, { type: "disabled" });
    assert.equal(hybridProbe.request.body.max_tokens, 32);

    // Dedicated deepseek-reasoner omits thinking: disabled and temperature, and uses 512 tokens on probe
    plugin.settings.polish.model = "deepseek-reasoner";
    plugin.settings.polish.enableThinking = false;
    const reasonerReq = plugin.buildModelRequest("polish", "hi");
    assert.equal("thinking" in reasonerReq.request.body, false);
    assert.equal("temperature" in reasonerReq.request.body, false);
    const reasonerProbe = plugin.buildConnectionTestRequest("polish", plugin.settings.polish);
    assert.equal(reasonerProbe.request.body.max_tokens, 512);

    // Prompt-prefixed reasoning servers emitting chain-of-thought before orphan </think>
    assert.equal(
        plugin.extractModelContent("Let me analyze the tone carefully...\n1. Casual\n2. Short\n</think>\nSounds great, see you then!"),
        "Sounds great, see you then!"
    );
});

test("Task-scoped truncation & local-unavailable error messages and Google/DeepL/Baidu language code normalization", () => {
    const plugin = new Plugin();
    const polishTrunc = plugin.createModelOutputTruncatedError("", "length");
    plugin.annotateModelRequestError(polishTrunc, "polish", "https://api.deepseek.com/chat/completions", plugin.settings.polish);
    assert.equal(plugin.formatError(polishTrunc), plugin.t("errorOutputTruncatedPolish"));

    const transTrunc = plugin.createModelOutputTruncatedError("", "length");
    plugin.annotateModelRequestError(transTrunc, "translation", "https://api.deepseek.com/chat/completions", plugin.settings.translation);
    assert.equal(plugin.formatError(transTrunc), plugin.t("errorOutputTruncatedTranslation"));

    // Untyped truncation error still returns base errorOutputTruncated
    assert.equal(plugin.formatError(plugin.createModelOutputTruncatedError("x", "length")), plugin.t("errorOutputTruncated"));

    // Sakura local down during Polish produces errorLocalProviderUnavailable
    const localDown = new TypeError("Failed to fetch");
    plugin.annotateModelRequestError(localDown, "polish", "http://127.0.0.1:8080/v1/chat/completions", {
        provider: "sakuraLocal",
        endpoint: "http://127.0.0.1:8080/v1/chat/completions"
    });
    assert.equal(localDown.localProviderUnavailable, true);
    assert.equal(plugin.formatError(localDown), plugin.t("errorLocalProviderUnavailable"));

    // Legacy Chinese language names (previously GBK mojibake) and uppercase/regional BCP-47 codes
    assert.equal(plugin.getGoogleLanguageCode("汉语"), "zh-CN");
    assert.equal(plugin.getGoogleLanguageCode("印地语"), "hi");
    assert.equal(plugin.getGoogleLanguageCode("朝鲜语"), "ko");
    assert.equal(plugin.getGoogleLanguageCode("JA"), "ja");
    assert.equal(plugin.getBaiduLanguageCode("JA"), "jp");
    assert.equal(plugin.getDeepLLanguageCode("en-US", { source: true }), "EN");
    assert.equal(plugin.getDeepLLanguageCode("pt-BR", { source: true }), "PT");
});

test("Saved service configs survive normalizeSavedServiceConfigs across multi-key and thinking variants", () => {
    const plugin = new Plugin();
    const keyA = ["sk", "account", "alpha"].join("-");
    const keyB = ["sk", "account", "bravo"].join("-");
    plugin.saveVerifiedServiceConfig("translation", {
        provider: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-v4-flash",
        apiKey: keyA,
        enableThinking: false
    }, { autoSync: false, save: false, refreshUi: false });
    plugin.saveVerifiedServiceConfig("polish", {
        provider: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-v4-flash",
        apiKey: keyB,
        enableThinking: false
    }, { autoSync: false, save: false, refreshUi: false });
    plugin.saveVerifiedServiceConfig("polish", {
        provider: "deepseek",
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-v4-flash",
        apiKey: keyB,
        enableThinking: true
    }, { autoSync: false, save: false, refreshUi: false });

    assert.equal(plugin.settings.serviceConfigs.length, 3);
    plugin.ensureSettingsShape();
    assert.equal(plugin.settings.serviceConfigs.length, 3);
});

test("Google key pool concurrent reservation contention yields short cooldown instead of 7-day quota lockout", () => {
    const plugin = new Plugin();
    const gKey = ["AIza", "SyTestKeyPoolReservation0000000001"].join("");
    plugin.settings.googleTranslate.keyPoolText = `Primary|${gKey}|100`;
    const normalized = plugin.normalizeGoogleTranslateKeyPool(plugin.settings.googleTranslate);
    normalized.keys[0].usedChars = 50;
    plugin.settings.googleTranslate.keys = normalized.keys;

    // Request 1 reserves 40 chars in flight (50 + 40 = 90 <= 100)
    const req1 = plugin.buildGoogleTranslateRequest("a".repeat(40), {
        provider: "googleCloud",
        sourceLanguage: "auto",
        targetLanguage: "汉语"
    }, { reserve: true });
    assert.ok(req1.request.googleTranslate.reservation);

    // Concurrent Request 2 needs 30 chars: unspent quota fits (50 + 30 = 80 <= 100), only reservation blocks it
    assert.throws(
        () => plugin.buildGoogleTranslateRequest("b".repeat(30), {
            provider: "googleCloud",
            sourceLanguage: "auto",
            targetLanguage: "汉语"
        }),
        err => err.googleTranslateKeysCooling === true && !err.googleTranslateQuotaExceeded
    );
    plugin.releaseGoogleTranslateRequestReservation(req1.request);
});

test("getCacheConfigSnapshot uses provider default model instead of deepseek-v4-flash when model is empty", () => {
    const plugin = new Plugin();
    const openAISnap = plugin.getCacheConfigSnapshot("translation", {
        provider: "openaiCompatible",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: ""
    });
    assert.equal(openAISnap.model, "gpt-4o-mini");

    const sakuraSnap = plugin.getCacheConfigSnapshot("translation", {
        provider: "sakuraLocal",
        endpoint: "http://127.0.0.1:8080/v1/chat/completions",
        model: ""
    });
    assert.equal(sakuraSnap.model, "local-model");
});

test("StateMachine batch slot reclamation, sakuraLocal history retention, cross-channel disabled policy, and batch preamble JSON", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.enabled = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.ui.autoTranslateConcurrency = 2;

    // 1. Batch A ([k1, k2], k2 released early, k1 goes stale) + Batch B ([k3, k4] active)
    const bA = [{ cacheKey: "k1", text: "one" }, { cacheKey: "k2", text: "two" }];
    const bB = [{ cacheKey: "k3", text: "three" }, { cacheKey: "k4", text: "four" }];
    const stalePast = Date.now() - 600000;
    plugin.autoStateMachine.beginInFlightBatch(bA, { startedAt: stalePast });
    plugin.autoStateMachine.beginInFlightBatch(bB, { startedAt: Date.now() });
    assert.equal(plugin.autoStateMachine.inFlight, 2);

    // Simulate k2 released early while k1 hangs and gets pruned
    plugin.finishAutoTranslationInFlightItem(bA[1]);
    plugin.autoStateMachine.releaseInFlightItems(1);
    plugin.autoStateMachine.releaseBatchKey(bA[1].daitBatchId, "k2");
    assert.equal(plugin.autoStateMachine.inFlight, 2);

    plugin.pruneAutoTranslationActiveState(Date.now());
    assert.equal(plugin.autoStateMachine.inFlight, 1, "pruning stale k1 must reclaim Batch A concurrency slot even while Batch B has 2 keys");

    // 2. sakuraLocal concurrency=1 history retention while item is still inFlight
    const localPlugin = new Plugin();
    localPlugin.isStarted = true;
    localPlugin.settings.translation.enabled = true;
    localPlugin.settings.translation.provider = "sakuraLocal";
    localPlugin.settings.ui.autoTranslateMessages = true;
    localPlugin.settings.ui.autoTranslateConcurrency = 1;
    localPlugin.getCurrentRouteKey = () => "1:10";
    const histItem = {
        cacheKey: "hist-1",
        text: "hello history",
        daitHistoryRequest: true,
        requestOptions: localPlugin.getAutoTranslationOptions()
    };
    localPlugin.autoStateMachine.beginInFlightBatch([histItem]);
    assert.equal(localPlugin.makeRoomForAutoTranslationItem(histItem, localPlugin.getAutoTranslateQueueLimit()), true);
    const retained = localPlugin.retainBlockedVisibleAutoTranslationItem(histItem, { delayMs: 5000, allowActiveRequeue: true });
    assert.equal(retained, true);
    assert.equal("daitInFlightToken" in localPlugin.autoTranslationQueue[0], false);

    // 3. Cross-channel "disabled" policy respected for Search/Inbox/Thread messages
    plugin.settings.ui.channelAutoTranslatePolicies = { "100:999000000000000001": { mode: "disabled" } };
    const crossNode = {
        nodeType: 1,
        id: "chat-messages-999000000000000001-123456789012345678",
        isConnected: true,
        getAttribute(name) {
            return name === "id" ? this.id : null;
        }
    };
    const decision = plugin.evaluateAutoTranslationCandidate({
        messageNode: crossNode,
        content: { isConnected: true },
        text: "Hello from disabled channel"
    });
    assert.equal(decision.action, "skip");
    assert.equal(decision.extra?.channelPolicyDisabled, true);

    // 4. Batch JSON parsing skips preamble "[1]" before actual batch array
    const parsedRows = plugin.parseAutoTranslationBatchOutput('Batch [1]: [{"id":"001","translation":"你好"},{"id":"002","translation":"世界"}]');
    assert.equal(parsedRows.length, 2);
    assert.equal(parsedRows[0].translation, "你好");
});

test("Everyday English outputs, kaomoji, natural apologies, meaning sentences, markup >_<, and diagnostic labels", () => {
    const plugin = new Plugin();

    // Everyday English sentences must pass target-language validation
    for (const [src, en] of [
        ["你好", "Hello!"],
        ["早上好！", "Good morning!"],
        ["明天见！", "See you tomorrow!"],
        ["没问题", "No problem!"],
        ["我马上到", "I'll be right there!"],
        ["今晚玩原神吗？", "Want to play 原神 tonight?"]
    ]) {
        assert.equal(plugin.getAutoTranslationInvalidOutputReason(src, en, "英语"), "", `${src} -> ${en}`);
    }

    // Spanish/French untranslated outputs must still be rejected for English target
    assert.equal(plugin.isInvalidAutoTranslationOutput("hola", "hola amigo", "英语"), true);
    assert.equal(plugin.isInvalidAutoTranslationOutput("bonjour", "bonjour mon ami", "英语"), true);

    // Ordinary sentences with "meaning"/"意思是", human apologies, and kaomoji ツ
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("这是什么意思？", "What is the meaning of this?", "英语"), "");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("Sorry, I can't help right now", "抱歉，我现在无法提供帮助。", "汉语"), "");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("Oh well ¯\\_(ツ)_/¯", "好吧 ¯\\_(ツ)_/¯", "汉语"), "");

    // Dictionary definitions and model translation refusals are still caught
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("пиздец", "该词意思是“完蛋”。", "汉语"), "");
    assert.equal(plugin.sanitizeAutoTranslationOutput("пиздец", "该词意思是“完蛋”。", "汉语"), "完蛋");
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("хуесосы", "抱歉，我无法提供此类内容的翻译服务。", "汉语"), "refusal-output");

    // Discord markup preserves leading >_< and >= 10 while stripping real "> quote"
    assert.equal(convertDiscordMarkupToDisplayText(">_< >= 10"), ">_< >= 10");
    assert.equal(convertDiscordMarkupToDisplayText("> quoted line"), "quoted line");

    // Newly added diagnostic flowStage labels exist in both locales
    for (const stage of ["intake", "persist", "settings", "mixed"]) {
        assert.notEqual(getDiagnosticCodeLabel(stage, "zh-CN"), stage);
        assert.notEqual(getDiagnosticCodeLabel(stage, "en"), stage);
    }
});
