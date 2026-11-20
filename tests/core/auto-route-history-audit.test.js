"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const {
    CHANNEL,
    GUILD,
    CHAT_MESSAGES,
    NEW_MESSAGE,
    REMOTE_TRANSLATION,
    createFakeDataApi,
    installChatGlobals,
    mountChat
} = require("../fixtures/chat-harness");

const CHANNEL_B = "222222222222222223";
const SOURCE = "Please review the release notes before the meeting.";
const TRANSLATED = "请在会议前查看发行说明。";
const isStale = error => error.autoTranslationStale === true;

function openChat(t, messages = []) {
    const { document, restore } = installChatGlobals({ bdApi: createFakeDataApi() });
    const plugin = new Plugin();
    Object.assign(plugin.settings.translation, REMOTE_TRANSLATION, { enabled: true, targetLanguage: "Chinese" });
    Object.assign(plugin.settings.ui, {
        autoTranslateMessages: true,
        autoTranslateIntakeMode: "dom",
        autoTranslateStrictRetry: true,
        historyBackfillEnabled: true,
        injectMessageButtons: false,
        injectInputButton: false,
        publicBilingualInputButton: false
    });
    plugin.injectQuickSettingsButtons = () => {};
    plugin.queueScan = () => {};
    plugin.scheduleTranslationCachePersist = () => {};
    plugin.scheduleAutoTranslationRenderQueue = () => {};
    plugin.renderTranslationLoading = () => {};
    plugin.fetchApiResponseText = () => assert.fail("Unexpected provider request");
    t.after(() => {
        clearTimeout(plugin.autoTranslationRetryTimer);
        clearTimeout(plugin.cacheOnlyScanTimer);
        plugin.cancelAutoTranslationRenderQueue();
        restore();
    });
    return { plugin, chat: mountChat(document, messages) };
}

function navigate(channel, message = "") {
    window.location.pathname = `/channels/${GUILD}/${channel}${message ? `/${message}` : ""}`;
}

function messageItem(plugin, { messageNode, content }) {
    const text = plugin.getElementText(content);
    const requestOptions = plugin.withMessageIdentity(plugin.getAutoTranslationOptions(), messageNode, content, text);
    return { messageNode, content, text, requestOptions, cacheKey: plugin.getTranslationCacheKey(text, requestOptions) };
}

function startMessage(plugin, item) {
    plugin.addAutoTranslationPendingTarget(item.cacheKey, item);
    plugin.markAutoTranslationInFlightItem(item);
    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = 1;
    return plugin.autoTranslateQueuedMessage(item);
}

function cacheMessage(plugin, chat, message) {
    const { cacheKey } = messageItem(plugin, chat.get(message.id));
    plugin.setTranslationCache(cacheKey, message.translation);
    return cacheKey;
}

function syntheticMessages(count, text) {
    return Array.from({ length: count }, (_, index) => ({
        id: String(400000000000000000n + BigInt(index)),
        parts: () => [text]
    }));
}

test("M04 fills the enqueue limit past cached and skipped history across slices", t => {
    const [cached, first, unseen] = CHAT_MESSAGES;
    const second = NEW_MESSAGE;
    const skipped = syntheticMessages(21, "这条消息已经是简体中文。");
    const { plugin, chat } = openChat(t, [cached, ...skipped, first, second, unseen]);
    const drain = t.mock.method(plugin, "drainAutoTranslationQueue", () => {});
    cacheMessage(plugin, chat, cached);

    const result = plugin.requestExplicitHistoryBackfill({ limit: 2 });

    assert.equal(result.candidates, 24);
    assert.equal(result.skipped, skipped.length);
    assert.equal(result.enqueued, 2);
    assert.equal(drain.mock.callCount(), 1);
    assert.deepEqual(
        new Set(plugin.autoTranslationQueue.map(item => item.cacheKey)),
        new Set([first, second].map(message => messageItem(plugin, chat.get(message.id)).cacheKey))
    );
    assert.ok(plugin.autoTranslationQueue.every(item => item.daitHistoryRequest));
});

test("M04 scans all cached history without enqueuing", t => {
    const messages = [...CHAT_MESSAGES.slice(0, 2), NEW_MESSAGE];
    const { plugin, chat } = openChat(t, messages);
    const drain = t.mock.method(plugin, "drainAutoTranslationQueue", () => {});
    messages.forEach(message => cacheMessage(plugin, chat, message));

    const result = plugin.requestExplicitHistoryBackfill({ limit: 1 });

    assert.equal(result.candidates, messages.length);
    assert.equal(result.enqueued, 0);
    assert.equal(result.blocked, 0);
    assert.equal(drain.mock.callCount(), 0);
});

test("M04 reports blocked rows when the history queue is full", t => {
    const messages = [...CHAT_MESSAGES.slice(0, 2), NEW_MESSAGE];
    const { plugin, chat } = openChat(t, messages);
    const [occupied, ...waiting] = messages.map(message => messageItem(plugin, chat.get(message.id)));
    const drain = t.mock.method(plugin, "drainAutoTranslationQueue", () => {});
    plugin.getAutoTranslateQueueLimit = () => 1;
    assert.equal(plugin.enqueueAutoTranslationItem(occupied), true);

    const result = plugin.requestExplicitHistoryBackfill({ limit: 1, messageNodes: waiting.map(item => item.messageNode) });

    assert.equal(result.enqueued, 0);
    assert.equal(result.blocked, waiting.length);
    assert.deepEqual(plugin.autoTranslationQueue.map(item => item.cacheKey), [occupied.cacheKey]);
    assert.equal(drain.mock.callCount(), 0);
});

test("M04 bounds history intake even when no rows can be enqueued", t => {
    const { plugin } = openChat(t);
    const messageNodes = Array.from({ length: 520 }, () => ({ isConnected: true }));
    const context = plugin.createScanContext({ messageNodes: [] });
    context.messageNodes = messageNodes;
    const batches = [];
    plugin.createAutoTranslationCandidates = sliceContext => {
        batches.push(sliceContext.messageNodes);
        return [];
    };

    const result = plugin.requestExplicitHistoryBackfill({ limit: 1, messageNodes, context });

    assert.equal(result.enqueued, 0);
    assert.equal(result.requested, messageNodes.length);
    assert.deepEqual(batches.map(batch => batch.length), Array(25).fill(20));
    assert.deepEqual(batches.flat(), messageNodes.slice(0, 500));
    assert.equal(context.messageNodes, messageNodes);
});

test("M05 cancels old-route requests and retry timers at the first scan", async t => {
    const scanStates = [
        ["normal channel scan", null],
        ["quiet media viewer", "isDiscordMediaViewerQuiet"],
        ["open media viewer", "isDiscordMediaViewerOpen"],
        ["open quick settings", "isQuickSettingsPanelOpen"],
        ["open Discord settings", "isDiscordSettingsSurfaceOpen"]
    ];
    for (const [name, blockedBy] of scanStates) {
        await t.test(name, async t => {
            const [message] = CHAT_MESSAGES;
            const { plugin, chat } = openChat(t, [message]);
            plugin.settings.ui.autoTranslateMessages = false;
            plugin.settings.ui.channelAutoTranslatePolicies = {
                [`${GUILD}:${CHANNEL}`]: { mode: "enabled" },
                [`${GUILD}:${CHANNEL_B}`]: { mode: "disabled" }
            };
            const reply = Promise.withResolvers();
            const attempts = [];
            plugin.runModelTask = async (_kind, _text, options) => {
                attempts.push(options);
                return attempts.length === 1 ? reply.promise : TRANSLATED;
            };
            const item = messageItem(plugin, chat.get(message.id));
            const inFlight = startMessage(plugin, item);
            assert.equal(attempts.length, 1);
            assert.equal(attempts[0].signal.aborted, false);
            plugin.scheduleAutoTranslationRetryScan(30000);
            assert.ok(plugin.autoTranslationRetryTimer);

            const track = t.mock.method(plugin, "trackAutoTranslationRouteChange");
            if (blockedBy) plugin[blockedBy] = () => true;
            navigate(CHANNEL_B);
            plugin.scanDiscordUi();

            assert.equal(plugin.isAutoTranslateEnabled(), false);
            assert.equal(attempts[0].signal.aborted, true);
            assert.equal(plugin.autoTranslationRetryTimer, null);
            assert.equal(plugin.autoTranslationRetryAt, 0);
            assert.equal(plugin.autoTranslationInFlightItems, 0);
            assert.equal(plugin.autoTranslationPendingTargets.size, 0);
            assert.equal(track.mock.callCount(), blockedBy ? 0 : 1);
            reply.resolve(item.text);
            await inFlight;
            assert.equal(attempts.length, 1);
            assert.equal(plugin.autoTranslationFailures.size, 0);

            if (blockedBy) {
                plugin[blockedBy] = () => false;
                plugin.cachedDrawScroller = {};
                plugin.scanDiscordUi();
                assert.equal(track.mock.callCount(), 1);
                assert.equal(plugin.cachedDrawScroller, null);
            }
        });
    }
});

test("M05 keeps retained history and provider cooldowns when returning to a channel", t => {
    const [message] = CHAT_MESSAGES;
    const { plugin, chat } = openChat(t, [message]);
    const item = { ...messageItem(plugin, chat.get(message.id)), daitHistoryRequest: true };
    plugin.settings.ui.channelAutoTranslatePolicies = { [`${GUILD}:${CHANNEL_B}`]: { mode: "disabled" } };
    plugin.markAutoTranslationFailure(item, Object.assign(new Error("Request timed out"), { name: "TimeoutError" }));
    assert.ok(plugin.autoTranslationQueue[0].daitRequeueAfter > Date.now());
    assert.equal(plugin.getAutoTranslationFailureHistoryCount(item.cacheKey), 1);
    const providerFailure = plugin.getAutoTranslationProviderFailure(item.requestOptions);
    assert.ok(providerFailure.retryAt > Date.now());

    navigate(CHANNEL_B);
    plugin.scanDiscordUi();
    assert.equal(plugin.autoTranslationQueue.length, 0);
    assert.equal(plugin.autoTranslationRetryTimer, null);
    navigate(CHANNEL);
    plugin.scanDiscordUi();

    const result = plugin.requestExplicitHistoryBackfill({ limit: 1 });
    assert.equal(result.enqueued, 0);
    assert.equal(result.blocked, 1);
    assert.ok(plugin.getAutoTranslationFailure(item.cacheKey).retryAt > Date.now());
    assert.equal(plugin.getAutoTranslationFailureHistoryCount(item.cacheKey), 1);
    assert.equal(plugin.getAutoTranslationProviderFailure(item.requestOptions), providerFailure);
});

test("M05 preserves work on same-channel jumps and cancels it on enabled channel changes", t => {
    const [message] = CHAT_MESSAGES;
    const { plugin, chat } = openChat(t, [message]);
    const cacheKey = cacheMessage(plugin, chat, message);
    const requestOptions = plugin.getAutoTranslationOptions();
    const signal = plugin.getAutoTranslationAbortSignal();
    plugin.scheduleAutoTranslationRetryScan(30000);
    const timer = plugin.autoTranslationRetryTimer;

    navigate(CHANNEL, message.id);
    plugin.isQuickSettingsPanelOpen = () => true;
    plugin.scanDiscordUi();
    assert.equal(signal.aborted, false);
    assert.equal(plugin.autoTranslationRetryTimer, timer);
    plugin.isQuickSettingsPanelOpen = () => false;
    plugin.scanDiscordUi();
    assert.equal(signal.aborted, false);
    assert.equal(plugin.autoTranslationRetryTimer, timer);
    assert.equal(plugin.isAutoTranslationRequestCurrent(requestOptions), true);

    navigate(CHANNEL_B);
    plugin.scanDiscordUi();
    assert.equal(plugin.isAutoTranslateEnabled(), true);
    assert.equal(signal.aborted, true);
    assert.equal(plugin.autoTranslationRetryTimer, null);
    assert.equal(plugin.getTranslationCacheValue(cacheKey), message.translation);
});

test("M05 checks scope and signal before single and batch attempts", async t => {
    const { plugin } = openChat(t);
    const attempts = t.mock.method(plugin, "runModelTask", async () => TRANSLATED);
    const autoOptions = plugin.getAutoTranslationOptions();
    const directOptions = { ...autoOptions, configOverrides: { ...autoOptions.configOverrides, provider: "microsoft" } };
    const texts = [SOURCE, "Please check the meeting agenda."];
    const runAttempts = [
        signal => plugin.runAutoTranslationTask(SOURCE, autoOptions, { signal }),
        signal => plugin.runAutoTranslationBatchTask(texts, autoOptions, { signal }),
        signal => plugin.runAutoTranslationBatchTask(texts, autoOptions, { signal, retry: true }),
        signal => plugin.runAutoTranslationBatchTask(texts, directOptions, { signal })
    ];
    const controller = new AbortController();

    navigate(CHANNEL_B);
    for (const attempt of runAttempts) await assert.rejects(attempt(controller.signal), isStale);
    navigate(CHANNEL);
    controller.abort();
    for (const attempt of runAttempts) await assert.rejects(attempt(controller.signal), isStale);
    assert.equal(attempts.mock.callCount(), 0);
});

test("M05 rechecks scope before strict retry while the route scan is pending", async t => {
    const { plugin } = openChat(t);
    const attempts = t.mock.method(plugin, "runModelTask", async (_kind, input) => {
        navigate(CHANNEL_B);
        return input;
    });
    const signal = plugin.getAutoTranslationAbortSignal();

    await assert.rejects(plugin.runAutoTranslationTask(SOURCE, plugin.getAutoTranslationOptions(), { signal }), isStale);

    assert.equal(signal.aborted, false);
    assert.equal(attempts.mock.callCount(), 1);
});

test("M05 rechecks scope before sending another long-text chunk", async t => {
    const { plugin } = openChat(t);
    plugin.splitLongAutoTranslationText = () => [SOURCE, "Read the remaining pages."];
    const attempts = t.mock.method(plugin, "runModelTask", async () => {
        navigate(CHANNEL_B);
        return TRANSLATED;
    });

    await assert.rejects(plugin.runLongAutoTranslationTask(SOURCE), isStale);
    assert.equal(attempts.mock.callCount(), 1);
});

test("M05 rechecks the signal before final strict fallback", async t => {
    const { plugin } = openChat(t);
    const controller = new AbortController();
    const attempts = t.mock.method(plugin, "runModelTask", async (_kind, input) => {
        controller.abort();
        return input;
    });

    await assert.rejects(plugin.runAutoTranslationStrictFallbackTask(SOURCE, plugin.getAutoTranslationOptions(), { signal: controller.signal }), isStale);
    assert.equal(attempts.mock.callCount(), 1);
});
