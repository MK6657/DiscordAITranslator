"use strict";
// Upgrading from v0.3.0 keeps the translation cache working: lines v0.3.0 cached still draw at once
// after the upgrade and are never requested again, also once the plugin has detected the model a
// local server serves (v0.4.0 puts that model into its cache keys). The v0.3.0 data comes from
// tests/fixtures/v030-*-cache.json, which the released v0.3.0 artifact wrote for the chat in
// tests/fixtures/chat-harness.js.
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const fixture = require("../fixtures/v030-sakura-cache.json");
const remoteFixture = require("../fixtures/v030-remote-cache.json");
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
function loadV030Data(savedAgoMs = 60 * 1000, source = fixture) {
    const data = JSON.parse(JSON.stringify(source.data));
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

// A Discord window on the given data files. quit() writes the cache and stops the plugin; start() starts a
// new one on the same files; restart() does both, the way a Discord restart does.
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
        chat.remount();
        const session = startChatPlugin(Plugin, { server, chat });
        sessions.push(session);
        return session;
    };
    const quit = () => {
        const session = sessions.at(-1);
        session.plugin.translationCacheDirty = true;
        assert.equal(session.plugin.flushTranslationCache({ retryOnError: false }), true);
        session.plugin.stop();
    };
    const restart = () => {
        quit();
        return start();
    };
    return { bdApi, server, chat, globals, ...start(), quit, start, restart };
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

test("a cache saved without the key schema by a v0.4.0 preview (model list, same old keys) is read as old data", async t => {
    const data = loadV030Data();
    data.DiscordAITranslator.translationCache.localModels = [];
    const { server, plugin, scanUntilIdle, lineText } = openChat(t, { data });
    plugin.setCachedLocalProviderDetectedModel(plugin.settings.translation, SERVED_MODEL);
    await scanUntilIdle();
    assertLinesDrawn(lineText, AUTO_MESSAGES, "preview cache");
    assert.deepEqual(server.chatPhrases(), []);
});

test("upgrade from v0.3.0 on a remote provider: messages with standard emoji hit their v0.3.0 entries too", async t => {
    const { bdApi, server, plugin, scanUntilIdle, lineText, translate, restart } = openChat(t, { data: loadV030Data(60 * 1000, remoteFixture) });
    assert.equal(plugin.settings.translation.provider, "deepseek");
    await scanUntilIdle();
    assertLinesDrawn(lineText, AUTO_MESSAGES, "after the upgrade");
    const manual = CHAT_MESSAGES.find(message => message.manual);
    await translate(manual.id);
    assert.equal(lineText(manual.id), manual.translation);
    assert.deepEqual(server.chatPhrases(), [], "nothing cached by v0.3.0 is requested again");

    const next = restart();
    const saved = bdApi.files["DiscordAITranslator.cache"].translationCache;
    assert.equal(saved.entries.filter(entry => entry.l && saved.strings[entry.k[0]] !== "auto-text").length, 0,
        "every entry a lookup reached is a current one now");
    await next.scanUntilIdle();
    assertLinesDrawn(next.lineText, AUTO_MESSAGES, "after a restart");
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

// --- Downgrade to v0.3.0 and upgrade again -----------------------------------------------------------

// What v0.3.0 saves after a downgrade: it cannot read the new cache file, so it starts empty and keeps
// only what it translates then (here: the given messages, in its own key format), in the settings file.
function v030CacheAfterDowngrade(messages, savedAgoMs) {
    const cache = loadV030Data(savedAgoMs).DiscordAITranslator.translationCache;
    const values = new Set(messages.map(message => message.translation));
    cache.entries = cache.entries.filter(entry => values.has(cache.strings[entry.v]));
    return cache;
}

// Moves every time stamp of a saved cache back, as if it was saved that long ago.
function ageSavedCache(payload, ms) {
    payload.savedAt -= ms;
    payload.entries.forEach(entry => {
        entry.c -= ms;
        entry.t -= ms;
    });
}

test("downgrade to v0.3.0 and upgrade again: the v0.4.0 cache and what v0.3.0 cached meanwhile are both kept", async t => {
    const { bdApi, server, chat, scanUntilIdle, quit, start } = openChat(t);
    await scanUntilIdle();
    chat.add(NEW_MESSAGE);
    await scanUntilIdle();
    quit();
    const requests = server.chatPhrases().length;

    // Two hours on v0.3.0, which translated one message again and saved its own small cache.
    ageSavedCache(bdApi.files["DiscordAITranslator.cache"].translationCache, 2 * HOUR);
    bdApi.files.DiscordAITranslator.translationCache = v030CacheAfterDowngrade([PLAIN_MESSAGES[1]], 60 * 1000);

    const upgraded = start();
    assert.equal(bdApi.files.DiscordAITranslator.translationCache, undefined, "the old copy was merged and removed");
    await upgraded.scanUntilIdle();
    assertLinesDrawn(upgraded.lineText, [...AUTO_MESSAGES, NEW_MESSAGE], "after upgrading again");
    assert.equal(server.chatPhrases().length, requests, "nothing cached in either version is requested again");
});

test("downgrade to v0.3.0 and upgrade again: a cache cleared in v0.3.0 stays cleared", async t => {
    const { bdApi, server, scanUntilIdle, quit, start } = openChat(t);
    await scanUntilIdle();
    quit();
    ageSavedCache(bdApi.files["DiscordAITranslator.cache"].translationCache, 2 * HOUR);
    // v0.3.0's "Clear translation cache" saves an empty cache.
    bdApi.files.DiscordAITranslator.translationCache = v030CacheAfterDowngrade([], 60 * 1000);

    const upgraded = start();
    assert.equal(upgraded.plugin.translationCache.size, 0);
    assert.deepEqual(bdApi.files["DiscordAITranslator.cache"].translationCache.entries, []);
    await upgraded.scanUntilIdle(PLAIN_MESSAGES.map(message => message.id));
    assert.deepEqual([...server.chatPhrases()].sort(), PLAIN_MESSAGES.map(message => message.phrase).sort());
});

// v0.4.0 logged a failed request, then the user went back to v0.3.0 and cleared the log or turned
// diagnostics off there, which saved an empty log to the settings file.
function downgradedDiagnosticsData({ enabled }) {
    const now = Date.now();
    const data = loadV030Data();
    delete data.DiscordAITranslator.translationCache;
    data.DiscordAITranslator.settings.ui.diagnosticsEnabled = enabled;
    data.DiscordAITranslator.diagnosticLogs = { version: 1, savedAt: now - HOUR, maxEntries: 500, compressed: 0, logs: [] };
    data["DiscordAITranslator.diagnostics"] = {
        diagnosticLogs: {
            version: 1,
            savedAt: now - 2 * HOUR,
            maxEntries: 500,
            compressed: 0,
            logs: [{ ts: now - 3 * HOUR, action: "model.request", status: "error", key: "", count: 1, meta: { type: "timeout" } }]
        }
    };
    return data;
}

for (const enabled of [true, false]) {
    test(`diagnostics cleared in v0.3.0 after a downgrade stay cleared when upgrading again (diagnostics ${enabled ? "on" : "off"})`, t => {
        const { bdApi, plugin, quit } = openChat(t, { data: downgradedDiagnosticsData({ enabled }) });
        assert.equal(bdApi.files.DiscordAITranslator.diagnosticLogs, undefined, "the old copy was merged and removed");
        assert.equal(plugin.diagnosticLogs.some(entry => entry.action === "model.request"), false);
        const stored = () => bdApi.files["DiscordAITranslator.diagnostics"]?.diagnosticLogs?.logs || [];
        assert.equal(stored().some(entry => entry.action === "model.request"), false, "the cleared entry is not back on disk");
        if (!enabled) assert.deepEqual(stored(), [], "with diagnostics off nothing stays on disk");
        quit();
        assert.equal(stored().some(entry => entry.action === "model.request"), false);
    });
}

test("diagnostics turned off: a log left in the data file is emptied at start", t => {
    const data = downgradedDiagnosticsData({ enabled: false });
    delete data.DiscordAITranslator.diagnosticLogs;
    const { bdApi } = openChat(t, { data });
    assert.deepEqual(bdApi.files["DiscordAITranslator.diagnostics"].diagnosticLogs.logs, []);
});
