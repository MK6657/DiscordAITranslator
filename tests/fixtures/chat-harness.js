"use strict";

// One small Discord chat, a fake local translation server and BetterDiscord's data store, for running
// the same chat through two plugin builds: tests/fixtures/make-v030-cache.js runs it through the
// v0.3.0 artifact to record the cache that version saves, and tests/core/cache-compat.test.js runs it
// through the current source to check that the upgrade keeps every cached line.
//
// Every message and translation here is invented.
const { createFakeDocument, el } = require("./fake-dom");

const GUILD = "111111111111111111";
const CHANNEL = "222222222222222222";
const LOCAL_ENDPOINT = "http://127.0.0.1:18080/v1/chat/completions";
const SERVED_MODEL = "fake-sakura-7b-q4.gguf";

// Discord draws a standard emoji as an image whose alt text is the emoji itself; a custom emoji's
// alt text is its ":name:".
const unicodeEmoji = (character, name) => el("img", { class: "emoji", alt: character, "aria-label": character, "data-type": "emoji", "data-name": `:${name}:`, src: "/assets/emoji.svg" });
const customEmoji = name => el("img", { class: "emoji", alt: `:${name}:`, "aria-label": `:${name}:`, "data-type": "emoji", "data-name": `:${name}:`, "data-id": "555555555555555555", src: "https://cdn.example/emojis/555555555555555555.webp" });

// phrase: a word only this message has, so the fake server knows what it is asked to translate.
// manual: translated with the message's Translate button instead of automatically.
const CHAT_MESSAGES = [
    { id: "300000000000000001", phrase: "map editor", parts: () => ["Has anyone tried the new build of the map editor yet"], translation: "有人试过地图编辑器的新版本了吗" },
    { id: "300000000000000002", phrase: "export bug", parts: () => ["The patch notes say the export bug is fixed now"], translation: "补丁说明里说导出的问题现在已经修好了" },
    { id: "300000000000000003", phrase: "server restart", parts: () => ["good morning ", unicodeEmoji("☀️", "sunny"), " the server restart is done ", unicodeEmoji("👍", "thumbsup")], translation: "早上好，服务器已经重启完成了" },
    { id: "300000000000000004", phrase: "イベント", parts: () => ["今日のイベントは夜九時から始まります", unicodeEmoji("🎉", "tada"), "みんな遅れないでね"], translation: "今天的活动晚上九点开始，大家别迟到哦" },
    { id: "300000000000000005", phrase: "great match", parts: () => ["that was a great match ", customEmoji("gg"), " well played everyone"], translation: "那是一场精彩的比赛 :gg: 大家都打得很好" },
    // Emoji with and without spaces around them in one message.
    { id: "300000000000000006", phrase: "that clip", parts: () => ["lol", unicodeEmoji("😂", "joy"), "that clip from the stream ", unicodeEmoji("😂", "joy"), " is still going around"], translation: "哈哈，直播里的那段片段还在到处传" },
    { id: "300000000000000007", phrase: "schedule", manual: true, parts: () => ["Can someone pin the practice schedule for next week"], translation: "有人能把下周的训练安排置顶吗" }
];

// Not cached by v0.3.0: its request makes the plugin detect the model the local server serves.
const NEW_MESSAGE = { id: "300000000000000099", phrase: "tournament bracket", parts: () => ["Where can I find the tournament bracket for tonight"], translation: "今晚的比赛对阵表在哪里可以找到" };

// The settings of a v0.3.0 user on Sakura with the model left on "local-model".
function createV030Settings() {
    return {
        translation: {
            enabled: true,
            provider: "sakuraLocal",
            endpoint: LOCAL_ENDPOINT,
            model: "local-model",
            apiKey: "",
            sourceLanguage: "auto",
            targetLanguage: "Chinese",
            temperature: 0.2,
            maxTokens: 1200
        },
        ui: {
            settingsVersion: 2,
            language: "en",
            autoTranslateMessages: true,
            autoTranslateIntakeMode: "dom",
            autoTranslateConcurrency: 2,
            autoTranslatePrefetch: false,
            diagnosticsEnabled: false,
            translationCacheTtlHours: 48,
            translationCacheMaxEntries: 4000
        }
    };
}

// BdApi.Data: one JSON object per data name, like BetterDiscord's <name>.config.json files.
function createFakeDataApi(initial = {}) {
    const files = JSON.parse(JSON.stringify(initial));
    const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    return {
        files,
        Data: {
            load: (name, key) => clone(files[name]?.[key]),
            save: (name, key, value) => { (files[name] ||= {})[key] = clone(value); },
            delete: (name, key) => { if (files[name]) delete files[name][key]; }
        }
    };
}

// A local OpenAI-compatible server: GET .../models names the loaded model, a chat request is answered with
// the translation of the message it carries. Every request is logged. hold(kind) makes the next requests
// of that kind wait until release(kind).
function createFakeLocalServer({ messages = [...CHAT_MESSAGES, NEW_MESSAGE], servedModel = SERVED_MODEL } = {}) {
    const log = [];
    const gates = new Map();
    const waiting = new Map();
    const wait = kind => {
        if (!gates.get(kind)) return Promise.resolve();
        return new Promise(resolve => {
            if (!waiting.has(kind)) waiting.set(kind, []);
            waiting.get(kind).push(resolve);
        });
    };
    const server = {
        log,
        chatPhrases: () => log.filter(entry => entry.kind === "chat").map(entry => entry.phrase),
        modelRequests: () => log.filter(entry => entry.kind === "models").length,
        hold(kind) { gates.set(kind, true); },
        release(kind) {
            gates.set(kind, false);
            (waiting.get(kind) || []).splice(0).forEach(resolve => resolve());
        },
        waitingCount: kind => (waiting.get(kind) || []).length,
        async fetchApiResponseText(endpoint, request = {}) {
            const url = String(endpoint || "");
            if (/\/models$/.test(url)) {
                log.push({ kind: "models" });
                await wait("models");
                return JSON.stringify({ object: "list", data: [{ id: servedModel, object: "model" }] });
            }
            const body = JSON.stringify(request.body || {});
            const message = messages.find(item => body.includes(JSON.stringify(item.phrase).slice(1, -1)));
            if (!message && body.includes("Reply with OK only")) {
                // The plugin checks that a local server is up before it sends messages to it.
                log.push({ kind: "health" });
                return JSON.stringify({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "OK" } }] });
            }
            log.push({ kind: "chat", phrase: message?.phrase || "?" });
            await wait("chat");
            if (!message) throw Object.assign(new Error("unknown message"), { status: 400 });
            return JSON.stringify({ choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: message.translation } }] });
        }
    };
    return server;
}

function buildMessageNode(message) {
    const content = el("div", { class: "markup_abc messageContent_abc", id: `message-content-${message.id}` }, message.parts());
    const messageNode = el("li", { id: `chat-messages-${CHANNEL}-${message.id}`, class: "messageListItem_abc" }, [
        el("div", { class: "message_abc", role: "article" }, [content])
    ]);
    return { messageNode, content };
}

// The chat list. remount() replaces message elements with new ones, the way Discord rebuilds messages
// that scroll out of view and back.
function mountChat(document, messages = CHAT_MESSAGES) {
    const list = el("ol", { class: "scrollerInner_abc", "data-list-id": "chat-messages" });
    document.body.appendChild(list);
    const nodes = new Map();
    const mount = message => {
        const built = buildMessageNode(message);
        const previous = nodes.get(message.id);
        if (previous) {
            const index = list.childNodes.indexOf(previous.messageNode);
            previous.messageNode.remove();
            built.messageNode.parentNode = list;
            list.childNodes.splice(index, 0, built.messageNode);
        }
        else {
            list.appendChild(built.messageNode);
        }
        nodes.set(message.id, { ...built, message });
        return built;
    };
    messages.forEach(mount);
    return {
        list,
        nodes,
        add: mount,
        remount: (ids = [...nodes.keys()]) => ids.forEach(id => mount(nodes.get(id).message)),
        get: id => nodes.get(id)
    };
}

function useGlobal(name, value, restore) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
    globalThis[name] = value;
    restore.push(() => {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
    });
}

// Installs document, window and BdApi. Returns a function that puts the previous globals back.
function installChatGlobals({ bdApi, document = createFakeDocument() }) {
    const restore = [];
    useGlobal("document", document, restore);
    useGlobal("window", { location: { pathname: `/channels/${GUILD}/${CHANNEL}` }, innerHeight: 900, innerWidth: 1200, addEventListener() {}, removeEventListener() {} }, restore);
    useGlobal("BdApi", bdApi, restore);
    return { document, restore: () => restore.reverse().forEach(undo => undo()) };
}

// A started plugin wired to the fake chat: everything counts as visible and still, lines are drawn inside
// the content element with the plugin's own metadata, and the only network is the fake server.
function startChatPlugin(Plugin, { server, chat }) {
    const plugin = new Plugin();
    Object.assign(plugin, {
        injectStyles() {},
        removeStyles() {},
        patchMessageContextMenu() {},
        startObserver() {},
        showToast() {},
        warnSanitized() {},
        showSettingsUpgradeNotices() {}
    });
    plugin.queueScan = () => {};
    plugin.scheduleAutoTranslationRetryScan = () => {};
    // Writes happen when the test flushes, like a debounced write that has come due.
    plugin.scheduleTranslationCachePersist = () => { plugin.translationCacheDirty = true; };
    plugin.isElementVisibleInViewport = () => true;
    plugin.isElementVisibleInViewportCached = () => true;
    plugin.isAutoTranslationTargetInScanRange = () => true;
    plugin.isAutoTranslationViewportStabilityPending = () => false;
    plugin.restoreTranslationSourceVisibility = () => {};
    plugin.syncTranslationSourceVisibility = () => {};
    plugin.queueAutoTranslationRenderTask = task => {
        task.run();
        return true;
    };
    plugin.fetchApiResponseText = (endpoint, request) => server.fetchApiResponseText(endpoint, request);

    const drawn = [];
    const drawLine = (kind, messageNode, content, cacheKey, sourceText, text = "") => {
        plugin.getTranslationLines(content).forEach(line => line.remove());
        const line = el("div", { class: `dait-translation-line${kind === "loading" ? " dait-translation-loading" : ""}${kind === "error" ? " dait-translation-error" : ""}` });
        content.appendChild(line);
        plugin.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
        line.appendChild(el("span", { class: "dait-translation-text" }, text ? [text] : []));
        const id = String(messageNode?.id || "").split("-").pop();
        drawn.push({ kind, id, text, cacheKey });
        return line;
    };
    plugin.renderTranslation = (messageNode, content, translated, cacheKey, sourceText) => drawLine("final", messageNode, content, cacheKey, sourceText, translated);
    plugin.renderTranslationLoading = (messageNode, content, cacheKey, sourceText) => drawLine("loading", messageNode, content, cacheKey, sourceText);
    plugin.renderTranslationError = (messageNode, content, error, cacheKey, sourceText) => drawLine("error", messageNode, content, cacheKey, sourceText, "failed");

    plugin.start();
    plugin.isStarted = true;

    const autoIds = () => [...chat.nodes.values()].filter(entry => !entry.message.manual).map(entry => entry.message.id);
    const scan = (ids = autoIds()) => {
        const context = plugin.createScanContext({ messageNodes: [] });
        context.messageNodes = ids.map(id => chat.get(id).messageNode);
        plugin.queueAutoTranslateVisibleMessages(context);
        return context;
    };
    // Lets queued requests run and finish (the fake server answers at once unless held).
    const settle = async (rounds = 200) => {
        for (let round = 0; round < rounds; round++) {
            await new Promise(resolve => setImmediate(resolve));
            if (!plugin.autoTranslationQueue.length && !plugin.autoTranslationInFlight) return;
        }
    };
    // Scans and lets the requests finish until a scan queues nothing new: a scan queues only a few
    // messages at a time.
    const scanUntilIdle = async (ids, maxScans = 20) => {
        for (let index = 0; index < maxScans; index++) {
            const before = server.log.length;
            scan(ids);
            await settle();
            if (server.log.length === before && !plugin.autoTranslationQueue.length) return;
        }
    };
    const lineText = id => {
        const content = chat.get(id).content;
        const line = plugin.getTranslationLines(content).find(item => item.isConnected
            && !item.classList.contains("dait-translation-loading")
            && !item.classList.contains("dait-translation-error"));
        return line ? line.textContent : null;
    };
    const translate = id => plugin.translateMessage(chat.get(id).messageNode, chat.get(id).content, null);
    return { plugin, drawn, scan, settle, scanUntilIdle, lineText, translate };
}

module.exports = {
    GUILD,
    CHANNEL,
    LOCAL_ENDPOINT,
    SERVED_MODEL,
    CHAT_MESSAGES,
    NEW_MESSAGE,
    createV030Settings,
    createFakeDataApi,
    createFakeLocalServer,
    mountChat,
    installChatGlobals,
    startChatPlugin
};
