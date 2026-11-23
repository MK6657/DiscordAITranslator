"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { DEFAULT_PROMPT_TEMPLATES } = require("../../src/constants");
const { createFakeDocument } = require("../fixtures/fake-dom");

function setupDom(t) {
    const doc = createFakeDocument();
    const rawCreate = doc.createElement.bind(doc);
    doc.createElement = tag => {
        const el = rawCreate(tag);
        Object.defineProperty(el, "id", {
            configurable: true,
            get() { return this.getAttribute("id") || ""; },
            set(value) { this.setAttribute("id", String(value ?? "")); }
        });
        return el;
    };
    const prevDocument = globalThis.document;
    const prevWindow = globalThis.window;
    globalThis.document = doc;
    globalThis.window = {
        innerWidth: 1280,
        innerHeight: 800,
        addEventListener() {},
        removeEventListener() {}
    };
    t.after(() => {
        globalThis.document = prevDocument;
        globalThis.window = prevWindow;
    });
    return doc;
}

function createComposerTextbox(initialText) {
    const textbox = {
        text: initialText,
        isConnected: true,
        dataset: {},
        parentElement: { dataset: {} },
        closest: () => null,
        addEventListener() {},
        removeEventListener() {}
    };
    return textbox;
}

test("built-in prompt presets include expanded polish & translation scenarios with {targetLanguage} and bilingual labels", () => {
    const plugin = new Plugin();
    assert.equal(DEFAULT_PROMPT_TEMPLATES.polish.length, 59);
    assert.equal(DEFAULT_PROMPT_TEMPLATES.polish.filter(item => item.category === "general").length, 8);
    assert.equal(DEFAULT_PROMPT_TEMPLATES.polish.filter(item => item.category === "dialect").length, 22);
    assert.equal(DEFAULT_PROMPT_TEMPLATES.polish.filter(item => item.category === "persona").length, 29);
    assert.equal(DEFAULT_PROMPT_TEMPLATES.translation.length, 6);

    for (const kind of ["polish", "translation"]) {
        const list = plugin.getPromptTemplates(kind);
        assert.equal(list.length, DEFAULT_PROMPT_TEMPLATES[kind].length);
        const ids = new Set();
        const serials = new Set();
        for (const template of list) {
            assert.ok(template.id && !ids.has(template.id), `unique id ${template.id}`);
            assert.ok(template.serial && !serials.has(template.serial), `unique serial ${template.serial}`);
            ids.add(template.id);
            serials.add(template.serial);
            assert.ok(template.prompt.includes("{targetLanguage}"), `${template.id} includes {targetLanguage}`);
            if (kind === "polish") {
                assert.ok(["general", "dialect", "persona"].includes(template.category), `${template.id} valid category`);
                if (template.category === "dialect") {
                    assert.ok(["southChina", "southwest", "north", "eastCentral"].includes(template.region), `${template.id} valid region`);
                }
                if (template.category === "persona") {
                    assert.ok(["monarchs", "strategists", "literati", "global"].includes(template.personaGroup), `${template.id} valid personaGroup`);
                    assert.equal(typeof template.preferChineseOutput, "boolean", `${template.id} defines preferChineseOutput`);
                }
            }

            plugin.settings.ui.language = "zh-CN";
            assert.ok(plugin.getPromptTemplateDisplayName(template).trim().length > 0);
            plugin.settings.ui.language = "en";
            const enName = plugin.getPromptTemplateDisplayName(template);
            assert.ok(enName.trim().length > 0);
            assert.doesNotMatch(enName, /[\u4e00-\u9fff]/, `${template.id} English name has no Chinese`);
        }
    }
});

test("dialect & persona polish presets route Chinese-preferring styles to Chinese while global personas follow targetLanguage", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.showToast = () => {};
    Object.assign(plugin.settings.polish, {
        enabled: true,
        provider: "openaiCompatible",
        endpoint: "http://127.0.0.1:18080/v1/chat/completions",
        apiKey: "synthetic-key",
        model: "synthetic-model",
        targetLanguage: "英语",
        temperature: 0.6
    });

    // Apply Guangfu Cantonese dialect while polish targetLanguage is still English.
    plugin.applyPromptTemplate("polish", "polish-dialect-cantonese-guangfu");
    assert.equal(plugin.getEffectivePolishTargetLanguage(plugin.getTaskConfig("polish")), "汉语");

    const capturedBodies = [];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        capturedBodies.push(request.body);
        return JSON.stringify({ choices: [{ message: { content: "兄弟唔係吧，呢次更新又整冧晒，點解會咁㗎 😭" }, finish_reason: "stop" }] });
    };

    const result = await plugin.runPolishWithGuards("Bro this update broke everything again 😭");
    assert.equal(result, "兄弟唔係吧，呢次更新又整冧晒，點解會咁㗎 😭");
    assert.equal(capturedBodies.length, 1, "authentic Cantonese characters do not trigger false script-mismatch retry");
    assert.match(capturedBodies[0].messages[0].content, /Output language: Simplified Chinese/);

    // Traditional Chinese targetLanguage stays Traditional Chinese even for dialect presets.
    plugin.settings.polish.targetLanguage = "繁體中文";
    assert.equal(plugin.getEffectivePolishTargetLanguage(plugin.getTaskConfig("polish")), "繁體中文");

    // Chinese historical personas (e.g. Qin Shi Huang, Zhu Yuanzhang) auto-route non-Chinese targetLanguage to Chinese,
    // while keeping Traditional Chinese when configured.
    plugin.settings.polish.targetLanguage = "英语";
    plugin.applyPromptTemplate("polish", "polish-persona-qin-shihuang");
    assert.equal(plugin.getEffectivePolishTargetLanguage(plugin.getTaskConfig("polish")), "汉语");
    plugin.settings.polish.targetLanguage = "繁體中文";
    assert.equal(plugin.getEffectivePolishTargetLanguage(plugin.getTaskConfig("polish")), "繁體中文");

    // Overseas global personas (e.g. Trump, Shakespeare) follow configured targetLanguage directly.
    plugin.settings.polish.targetLanguage = "英语";
    plugin.applyPromptTemplate("polish", "polish-persona-trump");
    assert.equal(plugin.getEffectivePolishTargetLanguage(plugin.getTaskConfig("polish")), "英语");

    // Switching back to a general preset immediately restores English output language.
    plugin.applyPromptTemplate("polish", "polish-natural-chat");
    assert.equal(plugin.getEffectivePolishTargetLanguage(plugin.getTaskConfig("polish")), "英语");

    // Saving a custom template into the persona (大能) category persists its category cleanly.
    plugin.savePromptTemplate("polish", "自定义大能风格", "用独特口吻改写为 {targetLanguage}", { category: "persona" });
    const saved = plugin.getPromptTemplates("polish").find(item => item.name === "自定义大能风格");
    assert.ok(saved);
    assert.equal(saved.category, "persona");
});

test("upgrade auto-seeds new built-in presets, respects deleted presets on reload, and restores them on demand", t => {
    const doc = setupDom(t);
    let storedSettings = {
        polish: {
            activePromptTemplate: "polish-natural-chat",
            prompt: "my customized polish prompt",
            promptTemplates: [
                { id: "polish-natural-chat", serial: "001", name: "自然聊天润色", prompt: "custom 1" },
                { id: "polish-polite", serial: "002", name: "礼貌清晰", prompt: "custom 2" },
                { id: "polish-short", serial: "003", name: "简短直接", prompt: "custom 3" },
                { id: "polish-user-custom", serial: "004", name: "我的自定义", prompt: "keep me {targetLanguage}" }
            ]
        },
        translation: {
            activePromptTemplate: "translation-natural",
            promptTemplates: [
                { id: "translation-natural", serial: "001", name: "自然翻译", prompt: "custom trans 1" },
                { id: "translation-literal", serial: "002", name: "准确直译", prompt: "custom trans 2" }
            ]
        }
    };

    const makePlugin = () => {
        const plugin = new Plugin();
        plugin.loadData = key => (key === "settings" ? JSON.parse(JSON.stringify(storedSettings)) : null);
        plugin.saveData = (key, value) => {
            if (key === "settings") storedSettings = JSON.parse(JSON.stringify(value));
            return true;
        };
        plugin.showToast = () => {};
        plugin.invalidateAutoTranslationQueue = () => {};
        assert.equal(plugin.loadSettings(), true);
        return plugin;
    };

    const first = makePlugin();
    assert.equal(first.settings.polish.prompt, "my customized polish prompt", "active prompt stays untouched");
    assert.ok(first.settings.polish.promptTemplates.some(item => item.id === "polish-user-custom"), "custom template preserved");
    assert.ok(first.settings.polish.promptTemplates.some(item => item.id === "polish-native-casual"), "new polish preset seeded");
    assert.ok(first.settings.translation.promptTemplates.some(item => item.id === "translation-tech-dev"), "new translation preset seeded");
    assert.equal(first.getMissingBuiltInPromptTemplates("polish").length, 0);

    // Deleting a built-in preset must survive reload without being re-seeded.
    first.deletePromptTemplate("polish", "polish-gaming-chat");
    assert.equal(first.getMissingBuiltInPromptTemplates("polish").map(item => item.id).includes("polish-gaming-chat"), true);

    const reloaded = makePlugin();
    assert.equal(reloaded.settings.polish.promptTemplates.some(item => item.id === "polish-gaming-chat"), false);

    // Clicking the Restore built-in presets button brings it back cleanly.
    const manager = reloaded.createPromptManager("polish");
    doc.body.appendChild(manager);
    const restoreBtn = manager.querySelector("[data-dait-action='promptRestorePresets']");
    assert.ok(restoreBtn);
    assert.equal(restoreBtn.disabled, false);
    (restoreBtn.listeners.click || []).forEach(fn => fn({ type: "click", preventDefault() {}, stopPropagation() {} }));
    assert.equal(reloaded.settings.polish.promptTemplates.some(item => item.id === "polish-gaming-chat"), true);
    assert.equal(restoreBtn.disabled, true);
});

test("repolish passes previous attempts and user temperature=1.2, and auto-repairs Simplified Chinese drift when target is Traditional Chinese", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.showToast = () => {};
    plugin.showRestoreOriginalControl = () => {};
    plugin.injectInputButtons = () => {};
    plugin.isInputActionTextboxCurrent = () => true;
    plugin.getComposerWriteStaleReason = () => "";
    plugin.resolveInputActionTextbox = (_button, opts) => opts.textbox;
    plugin.getTextboxDraftText = box => box.text;

    Object.assign(plugin.settings.polish, {
        enabled: true,
        provider: "openaiCompatible",
        endpoint: "http://127.0.0.1:18080/v1/chat/completions",
        apiKey: "synthetic-key",
        model: "synthetic-model",
        targetLanguage: "繁體中文",
        temperature: 1.2
    });

    const textbox = createComposerTextbox("这个功能现在没问题了，大家可以试试看。");
    plugin.composerWriter.replaceTextSafely = async (box, text) => {
        box.text = text;
        return { ok: true, actual: text };
    };

    const capturedBodies = [];
    const responses = [
        // Attempt 1: compliant Traditional Chinese
        "這個功能現在沒問題了，大家可以直接試試看！",
        // Attempt 2 (repolish): drifts back to Simplified Chinese at temperature 1.2
        "这个功能现在已经稳了，大家可以换个方式试试。",
        // Automatic repair retry for Attempt 2: strictly Traditional Chinese & fresh wording
        "這項功能目前已相當穩定，歡迎各位馬上體驗看看！"
    ];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        capturedBodies.push(request.body);
        const content = responses.shift();
        assert.ok(content, "unexpected extra API call");
        return JSON.stringify({ choices: [{ message: { content }, finish_reason: "stop" }] });
    };

    // Round 1
    await plugin.polishCurrentDraft(null, { textbox });
    assert.equal(textbox.text, "這個功能現在沒問題了，大家可以直接試試看！");
    assert.equal(capturedBodies.length, 1);
    assert.equal(capturedBodies[0].temperature, 1.2);
    assert.match(capturedBodies[0].messages[0].content, /嚴禁輸出簡體字/);
    assert.doesNotMatch(capturedBodies[0].messages[0].content, /<previous_attempts>/);

    // Round 2 (repolish: model drifts to Simplified -> plugin auto-repairs to Traditional!)
    await plugin.polishCurrentDraft(null, { textbox });
    assert.equal(textbox.text, "這項功能目前已相當穩定，歡迎各位馬上體驗看看！");
    assert.equal(capturedBodies.length, 3);

    // First call of Round 2 carries <previous_attempts> + user temperature 1.2 + high-creativity guidance
    assert.equal(capturedBodies[1].temperature, 1.2);
    assert.match(capturedBodies[1].messages[0].content, /<previous_attempts>/);
    assert.ok(capturedBodies[1].messages[0].content.includes("這個功能現在沒問題了，大家可以直接試試看！"));
    assert.match(capturedBodies[1].messages[0].content, /higher creativity/i);

    // Repair call caps temperature <= 0.35 and includes mandatory correction + invalid simplified output
    assert.ok(capturedBodies[2].temperature <= 0.35);
    assert.match(capturedBodies[2].messages[0].content, /Mandatory correction:/);
    assert.match(capturedBodies[2].messages[0].content, /ZERO Simplified Chinese characters/);
    assert.ok(capturedBodies[2].messages[0].content.includes("这个功能现在已经稳了"));
});

test("repolish retries once when the model repeats an earlier result verbatim, and code spans do not false-trigger Traditional Chinese repair", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => true;
    plugin.showToast = () => {};
    plugin.showRestoreOriginalControl = () => {};
    plugin.injectInputButtons = () => {};
    plugin.isInputActionTextboxCurrent = () => true;
    plugin.getComposerWriteStaleReason = () => "";
    plugin.resolveInputActionTextbox = (_button, opts) => opts.textbox;
    plugin.getTextboxDraftText = box => box.text;
    Object.assign(plugin.settings.polish, {
        enabled: true,
        provider: "openaiCompatible",
        endpoint: "http://127.0.0.1:18080/v1/chat/completions",
        apiKey: "synthetic-key",
        model: "synthetic-model",
        targetLanguage: "繁體中文",
        temperature: 0.7
    });

    // Preserved Simplified text inside backticks must NOT trigger script-mismatch repair.
    assert.equal(
        plugin.getPolishOutputLanguageViolation("测试 `这个参数没问题`", "請確認 `这个参数没问题` 是否生效。", "繁體中文"),
        ""
    );
    assert.equal(
        plugin.getPolishOutputLanguageViolation("测试", "请确认这个参数没问题。", "繁體中文"),
        "script-mismatch"
    );
    // Legitimate Taiwan Traditional Chinese terms like 台灣 / 平台 / 批准 must NOT false-trigger.
    assert.equal(
        plugin.getPolishOutputLanguageViolation("测试", "這個台灣平台已經批准更新了。", "繁體中文"),
        ""
    );

    const textbox = createComposerTextbox("大家辛苦了");
    plugin.composerWriter.replaceTextSafely = async (box, text) => {
        box.text = text;
        return { ok: true, actual: text };
    };

    const calls = [];
    const replies = [
        "各位辛苦了，謝謝大家！",
        "各位辛苦了，謝謝大家！", // verbatim repeat on repolish
        "感謝大家這段時間的付出，辛苦各位囉！"
    ];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        calls.push(request.body);
        return JSON.stringify({ choices: [{ message: { content: replies.shift() }, finish_reason: "stop" }] });
    };

    await plugin.polishCurrentDraft(null, { textbox });
    assert.equal(textbox.text, "各位辛苦了，謝謝大家！");
    await plugin.polishCurrentDraft(null, { textbox });
    assert.equal(textbox.text, "感謝大家這段時間的付出，辛苦各位囉！");
    assert.equal(calls.length, 3);
    assert.ok(calls[2].temperature >= 0.95);
    assert.match(calls[2].messages[0].content, /repeated an earlier attempt verbatim/i);
});

test("try-polish in settings tracks repeated attempts and enforces Traditional Chinese output guard", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    Object.assign(plugin.settings.polish, {
        enabled: true,
        provider: "openaiCompatible",
        endpoint: "http://127.0.0.1:18080/v1/chat/completions",
        apiKey: "synthetic-key",
        model: "synthetic-model",
        targetLanguage: "繁體中文",
        temperature: 1.2
    });
    const history = { text: "", results: [] };
    const calls = [];
    const replies = [
        "這版看起來不錯！",
        "这版看起来不错，可以试试。",
        "這個版本表現很棒，不妨試用看看！"
    ];
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        calls.push(request.body);
        return JSON.stringify({ choices: [{ message: { content: replies.shift() }, finish_reason: "stop" }] });
    };

    const first = await plugin.runTryTask("polish", "这版看起来不错", { tryHistory: history });
    assert.equal(first, "這版看起來不錯！");
    const second = await plugin.runTryTask("polish", "这版看起来不错", { tryHistory: history });
    assert.equal(second, "這個版本表現很棒，不妨試用看看！");
    assert.equal(calls.length, 3);
    assert.match(calls[1].messages[0].content, /<previous_attempts>/);
    assert.ok(calls[2].temperature <= 0.35);
});
