"use strict";
// Upgrading from v0.3.0 keeps the translation cache working: lines v0.3.0 cached still draw at once
// after the upgrade and are never requested again, also once the plugin has detected the model a
// local server serves (v0.4.0 puts that model into its cache keys). The v0.3.0 data comes from
// tests/fixtures/v030-sakura-cache.json, which the released v0.3.0 artifact wrote for the chat in
// tests/fixtures/chat-harness.js.
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const fixture = require("../fixtures/v030-sakura-cache.json");
const {
    CHAT_MESSAGES,
    NEW_MESSAGE,
    SERVED_MODEL,
    createV030Settings,
    createFakeDataApi,
    createFakeLocalServer,
    mountChat,
    installChatGlobals,
    startChatPlugin
} = require("../fixtures/chat-harness");

const HOUR = 60 * 60 * 1000;
const AUTO_MESSAGES = CHAT_MESSAGES.filter(message => !message.manual);
// Messages without standard emoji: their text reads the same as in v0.3.0.
const PLAIN_MESSAGES = AUTO_MESSAGES.filter(message => ["300000000000000001", "300000000000000002", "300000000000000005"].includes(message.id));

// The v0.3.0 settings file, saved a minute ago (the fixture's time stamps are moved to now).
function loadV030Data(savedAgoMs = 60 * 1000) {
    const data = JSON.parse(JSON.stringify(fixture.data));
    const cache = data.DiscordAITranslator.translationCache;
    const shift = Date.now() - savedAgoMs - cache.savedAt;
    cache.savedAt += shift;
    cache.entries.forEach(entry => {
        entry.c += shift;
        entry.t += shift;
        entry.e += shift;
    });
    return data;
}

// A Discord window on the given data files. restart() writes the cache, stops the plugin and starts a
// new one on the same files, the way a Discord restart does.
function openChat(t, { data = loadV030Data(), bdApi = createFakeDataApi(data), settingsPatch = null } = {}) {
    if (settingsPatch) settingsPatch(bdApi.files.DiscordAITranslator.settings);
    const globals = installChatGlobals({ bdApi });
    const sessions = [];
    t.after(() => {
        sessions.forEach(session => {
            if (session.plugin.isStarted) session.plugin.stop();
        });
        globals.restore();
    });
    const server = createFakeLocalServer();
    const chat = mountChat(globals.document, CHAT_MESSAGES);
    const start = () => {
        const session = startChatPlugin(Plugin, { server, chat });
        sessions.push(session);
        return session;
    };
    const restart = () => {
        const session = sessions.at(-1);
        session.plugin.translationCacheDirty = true;
        assert.equal(session.plugin.flushTranslationCache({ retryOnError: false }), true);
        session.plugin.stop();
        chat.remount();
        return start();
    };
    return { bdApi, server, chat, globals, ...start(), restart };
}

function assertLinesDrawn(lineText, messages, label) {
    for (const message of messages) {
        assert.equal(lineText(message.id), message.translation, `${label}: ${message.id} shows its cached translation`);
    }
}

function detectedModel(plugin) {
    return plugin.getCachedLocalProviderDetectedModel(plugin.settings.translation);
}

test("fixture: the v0.3.0 payload is what that version saves (Sakura, model local-model, no model list)", () => {
    const cache = fixture.data.DiscordAITranslator.translationCache;
    assert.equal(fixture.plugin.version, "0.3.0");
    assert.equal(cache.version, 3);
    assert.equal(cache.localModels, undefined);
    assert.equal(cache.keySchema, undefined);
    assert.equal(cache.entries.length, 15);
    assert.equal(fixture.data.DiscordAITranslator.settings.translation.model, "local-model");
});

test("upgrade from v0.3.0 on Sakura: cached lines draw at once and are never requested again, before and after model detection", async t => {
    const { bdApi, server, chat, plugin, scanUntilIdle, lineText, translate, restart } = openChat(t);
    assert.ok(bdApi.files["DiscordAITranslator.cache"]?.translationCache, "the cache moved to its own file");
    assert.equal(bdApi.files.DiscordAITranslator.translationCache, undefined);

    // Right after the upgrade, before the local server was asked anything.
    await scanUntilIdle();
    assertLinesDrawn(lineText, AUTO_MESSAGES, "after the upgrade");
    assert.deepEqual(server.chatPhrases(), [], "no cached message is requested (messages with standard emoji included)");
    assert.equal(detectedModel(plugin), "");

    // A new message is translated; that request detects the model the server serves.
    chat.add(NEW_MESSAGE);
    await scanUntilIdle();
    assert.equal(lineText(NEW_MESSAGE.id), NEW_MESSAGE.translation);
    assert.equal(detectedModel(plugin), SERVED_MODEL);
    assert.deepEqual(server.chatPhrases(), [NEW_MESSAGE.phrase]);

    // Scrolling back: Discord rebuilds the messages and every v0.3.0 line is drawn from the cache again.
    chat.remount();
    await scanUntilIdle();
    assertLinesDrawn(lineText, [...AUTO_MESSAGES, NEW_MESSAGE], "after model detection");
    assert.deepEqual(server.chatPhrases(), [NEW_MESSAGE.phrase], "nothing cached by v0.3.0 is requested again");

    // A message v0.3.0 translated with its Translate button is still a cache hit.
    const manual = CHAT_MESSAGES.find(message => message.manual);
    await translate(manual.id);
    assert.equal(lineText(manual.id), manual.translation);
    assert.deepEqual(server.chatPhrases(), [NEW_MESSAGE.phrase]);

    // After a restart the lines are found under the served model's keys.
    const next = restart();
    const saved = bdApi.files["DiscordAITranslator.cache"].translationCache;
    assert.equal(saved.keySchema, 2, "the saved cache names its key format");
    assert.deepEqual(saved.localModels.map(item => item.model), [SERVED_MODEL]);
    const stillOld = saved.entries.filter(entry => entry.l).map(entry => saved.strings[entry.k[0]]);
    assert.ok(stillOld.every(mode => mode === "auto-text" || mode === "auto"), "only keys no lookup reached are still marked as old");
    await next.scanUntilIdle();
    assertLinesDrawn(next.lineText, [...AUTO_MESSAGES, NEW_MESSAGE], "after a restart");
    await next.translate(manual.id);
    assert.equal(next.lineText(manual.id), manual.translation);
    assert.deepEqual(server.chatPhrases(), [NEW_MESSAGE.phrase]);
    assert.equal(detectedModel(next.plugin), SERVED_MODEL);
});

test("upgrade from v0.3.0: the cache stays usable when the model is detected before the first scan", async t => {
    // The API test or the model list in settings can detect the model before any line is drawn.
    const { server, plugin, scanUntilIdle, lineText } = openChat(t);
    plugin.setCachedLocalProviderDetectedModel(plugin.settings.translation, SERVED_MODEL);
    await scanUntilIdle();
    assertLinesDrawn(lineText, AUTO_MESSAGES, "detected first");
    assert.deepEqual(server.chatPhrases(), []);
});

test("upgrade from v0.3.0: a line drawn before model detection stays up after it", async t => {
    const { server, plugin, drawn, scanUntilIdle, lineText } = openChat(t);
    const ids = PLAIN_MESSAGES.map(message => message.id);
    await scanUntilIdle(ids);
    assertLinesDrawn(lineText, PLAIN_MESSAGES, "before detection");
    assert.equal(detectedModel(plugin), "", "nothing was requested, so nothing was detected yet");
    const draws = drawn.length;
    plugin.setCachedLocalProviderDetectedModel(plugin.settings.translation, SERVED_MODEL);
    await scanUntilIdle(ids);
    assertLinesDrawn(lineText, PLAIN_MESSAGES, "after detection");
    assert.deepEqual(drawn.slice(draws).map(entry => `${entry.kind}:${entry.id}`), [], "no line is torn down and drawn again");
    assert.deepEqual(server.chatPhrases(), []);
});

// --- The first model detection happens while work is queued (fresh install, upgrade, model switch) ----

function freshInstallData(uiPatch = {}) {
    const settings = createV030Settings();
    Object.assign(settings.ui, uiPatch);
    return { DiscordAITranslator: { settings } };
}

async function ticks(count = 20) {
    for (let index = 0; index < count; index++) await new Promise(resolve => setImmediate(resolve));
}

// The message a queued or in-flight cache key belongs to.
function messageIdOfKey(key) {
    return String(key || "").split("\n---\n")[1]?.split(":")[3] || "";
}

test("first model detection with messages queued and in flight: no message is requested twice, no finished line is redrawn", async t => {
    const { server, plugin, drawn, scan, scanUntilIdle, lineText } = openChat(t, { data: freshInstallData({ autoTranslateConcurrency: 1 }) });
    const ids = AUTO_MESSAGES.map(message => message.id);
    // The local server has answered the plugin's health check already (Discord has been open a while).
    plugin.shouldBlockAutoTranslationForLocalProviderHealth(plugin.getAutoTranslationOptions());
    await ticks();
    assert.equal(plugin.shouldBlockAutoTranslationForLocalProviderHealth(plugin.getAutoTranslationOptions()), false);
    server.hold("models");
    server.hold("chat");
    scan(ids);
    await ticks();
    scan(ids);
    assert.equal(server.waitingCount("models"), 1, "the first request waits for the model lookup");
    assert.ok(plugin.autoTranslationQueue.length >= 1, "more messages wait in the queue, keyed before the detection");

    server.release("models");
    await ticks();
    assert.equal(detectedModel(plugin), SERVED_MODEL);
    // Scans after the detection build keys with the served model for the same messages.
    scan(ids);
    scan(ids);
    const active = [...plugin.autoTranslationQueue.map(item => item.cacheKey), ...plugin.autoTranslationInFlightKeys].map(messageIdOfKey);
    assert.deepEqual(active.filter((id, index) => active.indexOf(id) !== index), [], "a message waits or runs once");

    server.release("chat");
    await scanUntilIdle(ids);
    assertLinesDrawn(lineText, AUTO_MESSAGES, "all translated");
    assert.deepEqual([...server.chatPhrases()].sort(), AUTO_MESSAGES.map(message => message.phrase).sort(), "each message is requested once");
    const finals = drawn.filter(entry => entry.kind === "final").map(entry => entry.id);
    assert.deepEqual(finals.filter((id, index) => finals.indexOf(id) !== index), [], "no finished line is torn down and drawn again");
});

test("a message translated with its button before the model was detected is a cache hit afterwards", async t => {
    const { server, chat, translate, lineText } = openChat(t, { data: freshInstallData({ autoTranslateMessages: false }) });
    const message = PLAIN_MESSAGES[0];
    await translate(message.id);
    assert.equal(lineText(message.id), message.translation);
    assert.deepEqual(server.chatPhrases(), [message.phrase]);
    // Discord rebuilds the message; the Translate button is clicked again.
    chat.remount([message.id]);
    await translate(message.id);
    assert.equal(lineText(message.id), message.translation);
    assert.deepEqual(server.chatPhrases(), [message.phrase], "the stored result is found");
});
