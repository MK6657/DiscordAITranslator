"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { PLUGIN_VERSION } = require("../../src/version");
const packageJson = require("../../package.json");

function useGlobals(t, values) {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
        globalThis[key] = value;
    }
    t.after(() => {
        for (const [key, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}

function rectAt(top, height = 40) {
    return { top, bottom: top + height, left: 0, right: 600, width: 600, height };
}

// A chat scroller whose visible part is 50..750 of an 800 px window.
function createScroller(overrides = {}) {
    return {
        nodeType: 1,
        parentElement: null,
        isConnected: true,
        scrollTop: 1000,
        scrollHeight: 5000,
        clientHeight: 700,
        getBoundingClientRect: () => rectAt(50, 700),
        closest: () => null,
        contains: () => true,
        ...overrides
    };
}

const scrollerStyle = element => ({
    overflow: element?.isScroller ? "auto" : "visible",
    overflowX: "visible",
    overflowY: element?.isScroller ? "auto" : "visible",
    display: "block",
    visibility: "visible",
    opacity: "1"
});

test("version comes from package.json", () => {
    assert.equal(PLUGIN_VERSION, packageJson.version);
    const plugin = new Plugin();
    assert.equal(plugin.createSettingsSnapshot().version, packageJson.version);
    assert.match(plugin.t("pluginStarted", { version: PLUGIN_VERSION }), new RegExp(`v${PLUGIN_VERSION.replace(/\./g, "\\.")}`));
});

test("cached lines draw during the scroll pause once the chat is still; other renders wait", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    plugin.autoTranslationLastExternalScrollAt = Date.now();
    const ran = [];
    const makeTask = (kind, cacheKey) => ({
        kind,
        cacheKey,
        target: { content: { dataset: {} }, text: `${kind} text` },
        priority: kind === "cache" ? 1 : 0,
        run: () => ran.push(kind)
    });
    plugin.queueAutoTranslationRenderTask(makeTask("request", "request-key"));
    clearTimeout(plugin.autoTranslationRenderTimer);
    plugin.autoTranslationRenderTimer = null;
    plugin.queueAutoTranslationRenderTask(makeTask("cache", "cache-key"));
    assert.ok(plugin.autoTranslationRenderDueAt - Date.now() <= 100, "waits only for the scroller to be still");
    clearTimeout(plugin.autoTranslationRenderTimer);
    plugin.autoTranslationRenderTimer = null;
    assert.deepEqual(ran, []);

    plugin.autoTranslationLastExternalScrollAt = 0;
    plugin.processAutoTranslationRenderQueue();
    clearTimeout(plugin.autoTranslationRenderTimer);
    plugin.autoTranslationRenderTimer = null;
    assert.deepEqual(ran, ["cache"]);
    assert.deepEqual(plugin.autoTranslationRenderQueue.map(task => task.kind), ["request"]);
    assert.equal([...plugin.autoTranslationRenderQueuedTasks.values()].some(task => task.kind === "cache"), false);
    assert.equal(plugin.autoTranslationRenderPendingKeys.has("request-key"), true);
    assert.equal(plugin.autoTranslationRenderPendingKeys.has("cache-key"), false);

    plugin.autoTranslationRenderPausedUntil = 0;
    plugin.processAutoTranslationRenderQueue();
    assert.deepEqual(ran, ["cache", "request"]);
});

test("scroll correction keeps the visible chat in place for lines drawn above it, not below it", t => {
    useGlobals(t, { window: { innerHeight: 800 }, document: { scrollingElement: null, documentElement: null }, getComputedStyle: scrollerStyle });
    const plugin = new Plugin();
    plugin.autoTranslationRenderPausedUntil = Date.now() + 1000;
    const scroller = createScroller({ isScroller: true });

    let aboveGrowth = 0;
    const messageAbove = { nodeType: 1, parentElement: scroller, isConnected: true, getBoundingClientRect: () => rectAt(-260, 120 + aboveGrowth) };
    const contentAbove = { nodeType: 1, parentElement: messageAbove, isConnected: true, closest: () => messageAbove, getBoundingClientRect: () => rectAt(-230, 40) };
    plugin.withTranslationScrollStability(contentAbove, () => { aboveGrowth = 30; });
    assert.equal(scroller.scrollTop, 1030, "a line above the visible chat is compensated even while scrolling is paused");
    assert.equal(plugin.consumeOwnScrollEvent({ type: "scroll", target: scroller }), true);
    assert.equal(plugin.consumeOwnScrollEvent({ type: "scroll", target: scroller }), false, "the record is used once");

    const messageBelow = { nodeType: 1, parentElement: scroller, isConnected: true, getBoundingClientRect: () => rectAt(900, 80) };
    const contentBelow = { nodeType: 1, parentElement: messageBelow, isConnected: true, closest: () => messageBelow, getBoundingClientRect: () => rectAt(910, 40) };
    plugin.withTranslationScrollStability(contentBelow, () => {}, { allowScrollCorrectionWhilePaused: true });
    assert.equal(scroller.scrollTop, 1030, "a line below the visible chat changes nothing");

    const pinned = createScroller({ isScroller: true, scrollTop: 4300, scrollHeight: 5000, clientHeight: 700 });
    const lastMessage = { nodeType: 1, parentElement: pinned, isConnected: true, getBoundingClientRect: () => rectAt(600, 100) };
    const lastContent = { nodeType: 1, parentElement: lastMessage, isConnected: true, closest: () => lastMessage, getBoundingClientRect: () => rectAt(620, 40) };
    plugin.withTranslationScrollStability(lastContent, () => { pinned.scrollHeight = 5030; });
    assert.equal(pinned.scrollTop, 4330, "a chat pinned to its newest message stays pinned");
});

test("scan visibility rejects messages clipped by the chat scroller or hidden by style", t => {
    let styleReads = 0;
    const clip = { nodeType: 1, parentElement: null, isScroller: true, getBoundingClientRect: () => rectAt(100, 600) };
    useGlobals(t, {
        window: { innerHeight: 800, innerWidth: 1200 },
        getComputedStyle: element => {
            styleReads++;
            return { ...scrollerStyle(element), opacity: element?.faded ? "0" : "1" };
        }
    });
    const plugin = new Plugin();
    const context = plugin.createScanContext({ messageNodes: [] });
    const inside = { nodeType: 1, parentElement: clip, isConnected: true, getAttribute: () => null };
    const behindHeader = { nodeType: 1, parentElement: clip, isConnected: true, getAttribute: () => null };
    assert.equal(plugin.isElementVisibleForScan(inside, rectAt(300), context), true);
    assert.equal(plugin.isElementVisibleForScan(behindHeader, rectAt(20, 60), context), false);
    assert.equal(styleReads, 1, "each ancestor is inspected once per scan");
    const faded = { nodeType: 1, parentElement: null, faded: true, getBoundingClientRect: () => rectAt(0, 800) };
    const insideFaded = { nodeType: 1, parentElement: faded, isConnected: true, getAttribute: () => null };
    assert.equal(plugin.isElementVisibleForScan(insideFaded, rectAt(300), context), false);
});

test("the draw pass draws cached lines in and around the visible chat and reuses its memo", t => {
    const scroller = createScroller({ isScroller: true, getBoundingClientRect: () => rectAt(0, 800) });
    const messages = [];
    const makeMessage = (id, top, text) => {
        const message = {
            id: `chat-messages-1-${id}`,
            nodeType: 1,
            parentElement: scroller,
            isConnected: true,
            text,
            getAttribute: () => null,
            getBoundingClientRect: () => rectAt(top, 60)
        };
        message.content = { nodeType: 1, parentElement: message, isConnected: true, dataset: {}, text, getBoundingClientRect: () => rectAt(top + 10, 40) };
        messages.push(message);
        return message;
    };
    // Document order is top to bottom, as in Discord.
    const above = makeMessage("above", -300, "hello from above");
    const visible = makeMessage("visible", 100, "hello on screen");
    const uncached = makeMessage("uncached", 400, "not translated yet");
    const below = makeMessage("below", 1000, "hello from below");
    const far = makeMessage("far", 3000, "hello far away");
    scroller.querySelectorAll = () => messages;
    useGlobals(t, {
        window: { innerHeight: 800, innerWidth: 1200 },
        document: { querySelector: () => messages[0], querySelectorAll: () => messages, scrollingElement: null, documentElement: { clientHeight: 800, clientWidth: 1200 } },
        getComputedStyle: scrollerStyle
    });

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.targetLanguage = "Chinese";
    plugin.isAutoTranslateEnabled = () => true;
    // The pass stops at a 3 ms budget; freeze its clock so a cold test process does not cut it short.
    plugin.getDiagnosticTime = () => 0;
    plugin.isDiscordMediaViewerQuiet = () => false;
    plugin.isDiscordMediaViewerOpen = () => false;
    plugin.isQuickSettingsPanelOpen = () => false;
    plugin.isDiscordSettingsSurfaceOpen = () => false;
    plugin.getAutoTranslationPrecheckSkipReason = () => "";
    plugin.isInvalidAutoTranslationCacheValue = () => false;
    plugin.isAutoTranslationTargetIdentityCurrent = () => true;
    plugin.getElementText = content => content.text;
    plugin.createDomAutoTranslationCandidatesForMessage = message => [{ messageNode: message, content: message.content, text: message.content.text, targetKind: "message" }];
    const drawn = [];
    plugin.renderTranslation = (messageNode, content, translated) => {
        drawn.push({ id: messageNode.id, translated });
        return {};
    };
    let aliasLookups = 0;
    const getAliases = plugin.getTranslationCacheAliases.bind(plugin);
    plugin.getTranslationCacheAliases = (...args) => {
        aliasLookups++;
        return getAliases(...args);
    };
    const baseOptions = plugin.getAutoTranslationOptions();
    for (const message of [above, visible, below, far]) {
        const candidate = { messageNode: message, content: message.content, text: message.text, targetKind: "message" };
        const options = plugin.withAutoTranslationCandidateIdentity(plugin.getAutoTranslationRequestOptionsForText(message.text, baseOptions), candidate);
        plugin.setTranslationCache(plugin.getTranslationCacheKey(message.text, options), `译文:${message.text}`);
    }
    clearTimeout(plugin.translationCacheDirtyTimer);
    plugin.translationCacheDirtyTimer = null;

    const first = plugin.runCachedTranslationDrawPass();
    assert.deepEqual(drawn.map(entry => entry.id).sort(), [above.id, visible.id, below.id].sort());
    assert.equal(drawn.find(entry => entry.id === visible.id).translated, "译文:hello on screen");
    assert.equal(first.evaluations, 4, "three hits and one miss were looked up");
    const lookupsAfterFirst = aliasLookups;

    // Discord rebuilds the messages with new content elements: the memo redraws them without new lookups.
    for (const message of messages) message.content = { ...message.content, dataset: {} };
    drawn.length = 0;
    const second = plugin.runCachedTranslationDrawPass();
    assert.equal(drawn.length, 3);
    assert.equal(second.memoHits, 3);
    assert.equal(aliasLookups, lookupsAfterFirst, "hits and the remembered miss need no new lookups");

    // A new cache entry makes the remembered miss worth another look.
    const uncachedCandidate = { messageNode: uncached, content: uncached.content, text: uncached.text, targetKind: "message" };
    const uncachedOptions = plugin.withAutoTranslationCandidateIdentity(plugin.getAutoTranslationRequestOptionsForText(uncached.text, baseOptions), uncachedCandidate);
    plugin.setTranslationCache(plugin.getTranslationCacheKey(uncached.text, uncachedOptions), "刚翻译好");
    clearTimeout(plugin.translationCacheDirtyTimer);
    plugin.translationCacheDirtyTimer = null;
    drawn.length = 0;
    plugin.runCachedTranslationDrawPass();
    assert.ok(drawn.some(entry => entry.id === uncached.id && entry.translated === "刚翻译好"));
});

function createDrawPassPlugin(t, messages, scroller, windowHeight = 800) {
    useGlobals(t, {
        window: { innerHeight: windowHeight, innerWidth: 1200 },
        document: { querySelector: () => messages[0], querySelectorAll: () => messages, scrollingElement: null, documentElement: { clientHeight: windowHeight, clientWidth: 1200 } },
        getComputedStyle: scrollerStyle
    });
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.isAutoTranslateEnabled = () => true;
    plugin.getDiagnosticTime = () => 0;
    plugin.isDiscordMediaViewerQuiet = () => false;
    plugin.isDiscordMediaViewerOpen = () => false;
    plugin.isQuickSettingsPanelOpen = () => false;
    plugin.isDiscordSettingsSurfaceOpen = () => false;
    plugin.createDomAutoTranslationCandidatesForMessage = message => [{ messageNode: message, content: message.content, text: message.text, targetKind: "message" }];
    return plugin;
}

function createShortMessages(scroller, count, firstTop, height) {
    return Array.from({ length: count }, (_, index) => {
        const top = firstTop + index * height;
        const message = { id: `chat-messages-2-${index}`, nodeType: 1, parentElement: scroller, isConnected: true, text: `short ${index}`, getAttribute: () => null, getBoundingClientRect: () => rectAt(top, height) };
        message.content = { nodeType: 1, parentElement: message, isConnected: true, dataset: {}, text: message.text, getBoundingClientRect: () => rectAt(top + 2, height - 4) };
        return message;
    });
}

test("the draw pass always includes every visible message, nearest first, however many are mounted above", t => {
    const scroller = createScroller({ isScroller: true, getBoundingClientRect: () => rectAt(0, 1200) });
    // 80 short messages above a 1200 px chat, 50 visible, 40 below.
    const messages = createShortMessages(scroller, 170, -80 * 24, 24);
    scroller.querySelectorAll = () => messages;
    const plugin = createDrawPassPlugin(t, messages, scroller, 1200);
    const context = plugin.createScanContext({ messageNodes: [] });
    const selection = plugin.getCachedDrawMessageNodes(context);
    const visible = messages.filter((_, index) => index >= 80 && index < 130);
    assert.equal(selection.nodes.length, 60);
    assert.ok(visible.every(message => selection.nodes.includes(message)), "every visible message is selected");
    const distance = message => {
        const rect = message.getBoundingClientRect();
        return rect.bottom <= 0 ? -rect.bottom : rect.top >= 1200 ? rect.top - 1200 : 0;
    };
    const distances = selection.nodes.map(distance);
    assert.deepEqual(distances, [...distances].sort((left, right) => left - right), "nearest first");
});

test("a steady-state pass settles: nothing to draw is remembered and the pass stops re-arming", t => {
    const scroller = createScroller({ isScroller: true, getBoundingClientRect: () => rectAt(0, 800) });
    const messages = createShortMessages(scroller, 40, 0, 40);
    scroller.querySelectorAll = () => messages;
    const plugin = createDrawPassPlugin(t, messages, scroller);
    let prechecks = 0;
    plugin.getAutoTranslationPrecheckSkipReason = () => {
        prechecks++;
        return "target-language";
    };
    const passes = [];
    for (let index = 0; index < 6; index++) passes.push(plugin.runCachedTranslationDrawPass());
    assert.equal(prechecks, 40, "every message is judged once");
    const last = passes[passes.length - 1];
    assert.equal(last.pending, false);
    assert.equal(last.messages, 0);
    assert.equal(last.settledMessages, 40);
});

test("scroll corrections are never written while the chat is moving", t => {
    useGlobals(t, { window: { innerHeight: 800 }, document: { scrollingElement: null, documentElement: null }, getComputedStyle: scrollerStyle });
    const plugin = new Plugin();
    plugin.autoTranslationLastExternalScrollAt = Date.now();
    const scroller = createScroller({ isScroller: true });
    let growth = 0;
    const message = { nodeType: 1, parentElement: scroller, isConnected: true, getBoundingClientRect: () => rectAt(-260, 120 + growth) };
    const content = { nodeType: 1, parentElement: message, isConnected: true, closest: () => message, getBoundingClientRect: () => rectAt(-230, 40) };
    plugin.withTranslationScrollStability(content, () => { growth = 30; }, { allowScrollCorrectionWhilePaused: true });
    assert.equal(scroller.scrollTop, 1000);
});

test("a chat that does not overflow yet is not kept as the draw pass scroller", t => {
    const flat = createScroller({ isScroller: false, scrollHeight: 700, clientHeight: 700 });
    const messages = createShortMessages(flat, 5, 100, 40);
    const plugin = createDrawPassPlugin(t, messages, flat);
    plugin.getCachedDrawMessageNodes(plugin.createScanContext({ messageNodes: [] }));
    assert.equal(plugin.cachedDrawScroller, null);
});
