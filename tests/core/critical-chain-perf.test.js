"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const {
    AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS,
    INCREMENTAL_MESSAGE_WORK_AUTO_MAX_PER_SLICE
} = require("../../src/constants");

function useGlobals(t, overrides) {
    const saved = {};
    for (const [key, value] of Object.entries(overrides)) {
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

function makeChainNode({ parent = null, id = "", className = "wrap", tagName = "DIV", overflow = "visible", rect = null, hidden = false, ariaHidden = null } = {}) {
    return {
        nodeType: 1,
        isConnected: true,
        hidden,
        tagName,
        id,
        className,
        parentElement: parent,
        dataset: {},
        __overflow: overflow,
        getAttribute(name) {
            if (name === "aria-hidden") return ariaHidden;
            if (name === "id") return this.id || null;
            return null;
        },
        matches(selector) {
            const s = String(selector || "");
            if (this.id && this.id.startsWith("chat-messages-") && s.includes("chat-messages-")) return true;
            return false;
        },
        closest() { return null; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        contains(other) {
            for (let node = other; node; node = node.parentElement) {
                if (node === this) return true;
            }
            return false;
        },
        getBoundingClientRect() {
            return rect || { top: 100, bottom: 140, left: 100, right: 600, width: 500, height: 40 };
        }
    };
}

test("isElementVisibleInViewport short-circuits off-screen nodes and pruneAutoTranslationQueue shares ancestor scroll clips", t => {
    let computedStyleCalls = 0;
    let rectCalls = 0;

    useGlobals(t, {
        window: { innerHeight: 900, innerWidth: 1400, location: { pathname: "/channels/1/2" }, addEventListener() {}, removeEventListener() {} },
        document: { documentElement: { clientHeight: 900, clientWidth: 1400 }, querySelectorAll: () => [], querySelector: () => null },
        getComputedStyle(element) {
            computedStyleCalls++;
            return {
                display: element.__display || "block",
                visibility: element.__visibility || "visible",
                opacity: element.__opacity || "1",
                overflow: element.__overflow || "visible",
                overflowX: "visible",
                overflowY: element.__overflow || "visible"
            };
        }
    });

    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.ui.autoTranslateMessages = true;

    // Build a realistic shared 18-deep Discord ancestor chain containing a chat scroller.
    let sharedParent = null;
    for (let depth = 0; depth < 18; depth++) {
        const isScroller = depth === 10;
        const ancestor = makeChainNode({
            parent: sharedParent,
            className: isScroller ? "scroller_chat" : `layer_${depth}`,
            overflow: isScroller ? "auto" : "visible",
            rect: { top: 0, bottom: 900, left: 0, right: 1400, width: 1400, height: 900 }
        });
        const origRect = ancestor.getBoundingClientRect.bind(ancestor);
        ancestor.getBoundingClientRect = () => { rectCalls++; return origRect(); };
        sharedParent = ancestor;
    }

    // 1. Off-screen 19-deep node must trigger 0 getComputedStyle() calls.
    const offscreenNode = makeChainNode({
        parent: sharedParent,
        id: "chat-messages-1-offscreen",
        rect: { top: 2400, bottom: 2440, left: 100, right: 600, width: 500, height: 40 }
    });
    computedStyleCalls = 0;
    rectCalls = 0;
    assert.equal(plugin.isElementVisibleInViewport(offscreenNode), false);
    assert.equal(computedStyleCalls, 0);

    // 2. Single visible node walks ancestors ONCE (19 calls, not 37).
    const singleVisible = makeChainNode({
        parent: sharedParent,
        id: "chat-messages-1-single",
        rect: { top: 120, bottom: 160, left: 100, right: 600, width: 500, height: 40 }
    });
    computedStyleCalls = 0;
    assert.equal(plugin.isElementVisibleInViewport(singleVisible), true);
    assert.equal(computedStyleCalls, 19);

    // 3. Hidden / opacity:0 / clipped ancestors still properly return false.
    const hiddenChild = makeChainNode({ parent: singleVisible, hidden: true });
    assert.equal(plugin.isElementVisibleInViewport(hiddenChild), false);
    const invisibleParent = makeChainNode({ parent: sharedParent });
    invisibleParent.__opacity = "0";
    const childUnderZeroOpacity = makeChainNode({ parent: invisibleParent });
    assert.equal(plugin.isElementVisibleInViewport(childUnderZeroOpacity), false);

    // 4. pruneAutoTranslationQueue on 20 visible items sharing the 18-deep container tree.
    const requestOptions = plugin.getAutoTranslationOptions();
    for (let i = 0; i < 20; i++) {
        const msg = makeChainNode({
            parent: sharedParent,
            id: `chat-messages-1-${i + 1}`,
            rect: { top: 50 + i * 30, bottom: 80 + i * 30, left: 100, right: 600, width: 500, height: 30 }
        });
        const origMsgRect = msg.getBoundingClientRect.bind(msg);
        msg.getBoundingClientRect = () => { rectCalls++; return origMsgRect(); };

        const content = makeChainNode({
            parent: msg,
            className: "messageContent_abc",
            rect: { top: 50 + i * 30, bottom: 80 + i * 30, left: 100, right: 600, width: 500, height: 30 }
        });
        const origContentRect = content.getBoundingClientRect.bind(content);
        content.getBoundingClientRect = () => { rectCalls++; return origContentRect(); };
        content.textContent = `Message ${i}`;

        const cacheKey = `perf-key-${i}`;
        const item = { cacheKey, messageNode: msg, content, text: `Message ${i}`, domText: `Message ${i}`, requestOptions, priority: 50 + i * 30 };
        plugin.autoStateMachine.queue.push(item);
        plugin.autoStateMachine.queuedKeys.add(cacheKey);
        plugin.autoStateMachine.pendingTargets.set(cacheKey, {
            targets: [{ messageNode: msg, content, text: `Message ${i}`, domText: `Message ${i}`, requestOptions }]
        });
    }
    plugin.isAutoTranslationTargetDomTextCurrent = () => true;
    plugin.isAutoTranslationTargetIdentityCurrent = () => true;
    plugin.hasManualTranslationLine = () => false;
    plugin.hasTranslationLine = () => false;
    plugin.isTranslationLineDismissed = () => false;

    computedStyleCalls = 0;
    rectCalls = 0;
    plugin.pruneAutoTranslationQueue();
    assert.equal(plugin.autoStateMachine.queue.length, 20);
    // 18 shared ancestors + 20 messageNodes + 20 content nodes = 58 (was ~4,800 before optimization).
    assert.ok(computedStyleCalls <= 80, `expected <= 80 getComputedStyle calls, got ${computedStyleCalls}`);
    // 20 messageNodes + 20 content nodes + 1 scroll container = 41 (was ~240 before optimization).
    assert.ok(rectCalls <= 60, `expected <= 60 getBoundingClientRect calls, got ${rectCalls}`);
});

test("incremental scan dispatches ready batches mid-scan, drains on mutation interrupt, and prevents interrupted full-scan starvation", t => {
    const idleQueue = [];
    useGlobals(t, {
        window: {
            requestIdleCallback(cb) {
                idleQueue.push(cb);
                return idleQueue.length;
            },
            cancelIdleCallback() {}
        }
    });

    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-test";
    plugin.getAutoTranslationRequestBatchSize = () => 6;

    let drainCalls = 0;
    let drainedBatchCount = 0;
    plugin.drainAutoTranslationQueue = () => {
        drainCalls++;
        drainedBatchCount += plugin.autoTranslationQueue.length;
        plugin.autoTranslationQueue.length = 0;
        plugin.autoTranslationQueuedKeys.clear();
    };
    plugin.createAutoTranslationScanWork = ctx => ({
        context: ctx,
        requestOptions: plugin.getAutoTranslationOptions(),
        scanState: { context: ctx, apiWorkBlocked: false, enqueueSortPending: false },
        scanStats: { candidates: 0, enqueued: 0 }
    });
    plugin.createDomAutoTranslationCandidatesForMessage = node => [{ messageNode: node, content: node, text: `Hello ${node.id}` }];
    plugin.processAutoTranslationScanCandidates = (work, candidates) => {
        for (const candidate of candidates) {
            plugin.autoStateMachine.queue.push({ cacheKey: `k-${candidate.messageNode.id}`, text: candidate.text });
            plugin.autoStateMachine.queuedKeys.add(`k-${candidate.messageNode.id}`);
            work.scanStats.enqueued++;
            work.scanState.enqueueSortPending = true;
        }
    };
    plugin.finishAutoTranslationScanWork = () => { plugin.drainAutoTranslationQueue(); };

    let lastQueuedScanOptions = null;
    plugin.queueScan = options => { lastQueuedScanOptions = options; };

    const messageNodes = Array.from({ length: 12 }, (_, idx) => ({ isConnected: true, id: `m-${idx}` }));
    plugin.scheduleIncrementalMessageScan(
        { messageNodes, dirtyOnly: false },
        { skipButtons: true, maxPerSlice: INCREMENTAL_MESSAGE_WORK_AUTO_MAX_PER_SLICE }
    );

    // Slice 1: init only.
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 });
    assert.equal(drainCalls, 0);

    // Slice 2: processes 4 items (queued = 4 < batchSize 6) -> still batching.
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 });
    assert.equal(plugin.autoTranslationQueue.length, 4);
    assert.equal(drainCalls, 0);

    // Slice 3: processes 4 more items (queued = 8 >= batchSize 6) -> drains mid-scan!
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 });
    assert.equal(drainCalls, 1);
    assert.equal(drainedBatchCount, 8);

    // Slice 4: processes 2 items (simulate tight idle budget by passing remaining 2, or interrupt before finish).
    // Here we start another full scan of 12 messages, process 1 slice (4 queued < 6), then interrupt via queueMutationScan!
    idleQueue.length = 0;
    drainCalls = 0;
    drainedBatchCount = 0;
    plugin.scheduleIncrementalMessageScan(
        { messageNodes, dirtyOnly: false },
        { skipButtons: true, maxPerSlice: INCREMENTAL_MESSAGE_WORK_AUTO_MAX_PER_SLICE }
    );
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 }); // init
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 }); // 4 queued, 8 still unscanned
    assert.equal(drainCalls, 0);
    assert.equal(plugin.autoTranslationQueue.length, 4);

    // A single incoming message arrives mid-scan and calls queueMutationScan:
    const incomingMsg = {
        nodeType: 1,
        isConnected: true,
        matches: sel => String(sel || "").includes("chat-messages-"),
        closest: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
    };
    plugin.queueMutationScan([{ type: "childList", target: incomingMsg, addedNodes: [incomingMsg], removedNodes: [] }]);
    // 1) Already-enqueued 4 items MUST be drained immediately instead of starving.
    assert.equal(drainCalls, 1);
    assert.equal(drainedBatchCount, 4);
    // 2) Because a full scan was interrupted mid-way, the follow-up scan must NOT downgrade to dirtyOnly: true.
    assert.equal(lastQueuedScanOptions?.dirtyOnly, false);
});

test("interrupted local dirty incremental scan preserves unprocessed roots for the next scan and escalates over limit", t => {
    const idleQueue = [];
    useGlobals(t, {
        window: {
            location: { pathname: "/channels/g1/c1" },
            requestIdleCallback(cb) {
                idleQueue.push(cb);
                return idleQueue.length;
            },
            cancelIdleCallback() {}
        }
    });

    const plugin = new Plugin();
    plugin.settings.translation.enabled = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-test";
    plugin.drainAutoTranslationQueue = () => {};
    plugin.createAutoTranslationScanWork = ctx => ({
        context: ctx,
        requestOptions: plugin.getAutoTranslationOptions(),
        scanState: { context: ctx, apiWorkBlocked: false, enqueueSortPending: false },
        scanStats: { candidates: 0, enqueued: 0 }
    });
    const scannedIds = [];
    plugin.createDomAutoTranslationCandidatesForMessage = node => {
        scannedIds.push(node.id);
        return [{ messageNode: node, content: node, text: `Hello ${node.id}` }];
    };
    plugin.processAutoTranslationScanCandidates = () => {};
    plugin.finishAutoTranslationScanWork = () => {};

    let lastQueuedOptions = null;
    plugin.queueScan = opts => { lastQueuedOptions = opts; };

    const makeMsg = id => ({
        nodeType: 1,
        isConnected: true,
        id,
        matches: sel => String(sel || "").includes("chat-messages-"),
        closest: () => null,
        querySelector: () => null,
        querySelectorAll: () => []
    });

    const batch1 = [1, 2, 3, 4, 5].map(i => makeMsg(`chat-messages-1-${i}`));
    plugin.scheduleIncrementalMessageScan(
        { messageNodes: batch1, dirtyOnly: true },
        { skipButtons: true, maxPerSlice: INCREMENTAL_MESSAGE_WORK_AUTO_MAX_PER_SLICE }
    );

    // Slice 1: init; Slice 2: processes first 4 messages, leaving message 5 pending.
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 });
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 });
    assert.deepEqual(scannedIds, batch1.slice(0, 4).map(m => m.id));

    // Message 6 arrives mid-scan and interrupts the local dirty scan.
    const msg6 = makeMsg("chat-messages-1-6");
    plugin.queueMutationScan([{ type: "childList", target: msg6, addedNodes: [msg6], removedNodes: [] }]);
    assert.equal(lastQueuedOptions?.dirtyOnly, true);
    const nextRoots = plugin.consumePendingMutationScanRoots();
    assert.deepEqual(nextRoots.map(node => node.id), ["chat-messages-1-5", "chat-messages-1-6"]);

    // Run second dirty scan on preserved roots: message 5 and message 6 both enter candidates!
    idleQueue.length = 0;
    plugin.scheduleIncrementalMessageScan(
        { messageNodes: nextRoots, dirtyOnly: true },
        { skipButtons: true, maxPerSlice: INCREMENTAL_MESSAGE_WORK_AUTO_MAX_PER_SLICE }
    );
    while (idleQueue.length) idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 });
    assert.deepEqual(scannedIds, [...batch1.map(m => m.id), msg6.id]);

    // If remaining unprocessed dirty roots + new roots exceed MUTATION_DIRTY_SCAN_MAX_ROOTS (12), escalate to full scan.
    idleQueue.length = 0;
    const manyDirty = Array.from({ length: 12 }, (_, idx) => makeMsg(`chat-messages-2-${idx + 1}`));
    plugin.scheduleIncrementalMessageScan(
        { messageNodes: manyDirty, dirtyOnly: true },
        { skipButtons: true, maxPerSlice: 1 }
    );
    idleQueue.shift()({ didTimeout: false, timeRemaining: () => 40 }); // init only -> 12 remain unprocessed
    const extra1 = makeMsg("chat-messages-2-13");
    const extra2 = makeMsg("chat-messages-2-14");
    plugin.queueMutationScan([
        { type: "childList", target: extra1, addedNodes: [extra1], removedNodes: [] },
        { type: "childList", target: extra2, addedNodes: [extra2], removedNodes: [] }
    ]);
    assert.equal(lastQueuedOptions?.dirtyOnly, false);
    assert.equal(plugin.pendingMutationScanRoots.size, 0);
});

test("scroll relevance cache short-circuits sidebar scrollers with 0 DOM queries while preserving media-viewer rejection", t => {
    useGlobals(t, {
        document: { body: {}, documentElement: {} },
        window: {}
    });

    let closestCalls = 0;
    let qsCalls = 0;
    const sidebarScroller = {
        nodeType: 1,
        isConnected: true,
        tagName: "DIV",
        className: "scroller_members",
        getAttribute() { return ""; },
        matches() { return false; },
        closest() { closestCalls++; return null; },
        querySelector() { qsCalls++; return null; },
        getBoundingClientRect() { return { width: 240, height: 800, top: 0, bottom: 800, left: 0, right: 240 }; }
    };

    const plugin = new Plugin();
    assert.equal(plugin.isAutoTranslationScrollEventRelevant({ type: "scroll", target: sidebarScroller }), false);

    closestCalls = 0;
    qsCalls = 0;
    for (let i = 0; i < 10; i++) {
        const event = { type: "scroll", target: sidebarScroller };
        const relevant = plugin.isAutoTranslationScrollEventRelevant(event);
        assert.equal(relevant, false);
        assert.equal(plugin.isDiscordMediaViewerViewportEvent(event, relevant), false);
    }
    assert.equal(closestCalls, 0);
    assert.equal(qsCalls, 0);

    // Media viewer node must still be rejected as irrelevant AND detected as a media viewer viewport event.
    let mediaViewerClosestCalls = 0;
    const mediaViewerNode = {
        nodeType: 1,
        isConnected: true,
        tagName: "DIV",
        className: "imageModal_abc",
        getAttribute() { return ""; },
        matches: sel => String(sel || "").includes("imageModal"),
        closest() { mediaViewerClosestCalls++; return null; },
        querySelector: () => null
    };
    const mvEvent = { type: "scroll", target: mediaViewerNode };
    assert.equal(plugin.isAutoTranslationScrollEventRelevant(mvEvent), false);
    assert.equal(plugin.isDiscordMediaViewerViewportEvent(mvEvent, false), true);
    // Second frame also hits cache with 0 closest calls and keeps mediaViewer = true.
    mediaViewerClosestCalls = 0;
    assert.equal(plugin.isAutoTranslationScrollEventRelevant(mvEvent), false);
    assert.equal(plugin.isDiscordMediaViewerViewportEvent(mvEvent, false), true);
    assert.equal(mediaViewerClosestCalls, 0);
});

test("processAutoTranslationRenderQueue caches scroller/band per frame across same-scroller tasks", t => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    let scrollerStyleCalls = 0;
    let scrollerRectCalls = 0;
    let contentRectCalls = 0;

    const scroller = {
        nodeType: 1,
        isConnected: true,
        scrollTop: 200,
        scrollHeight: 2000,
        clientHeight: 800,
        parentElement: null,
        contains() { return true; },
        getBoundingClientRect() {
            scrollerRectCalls++;
            return { top: 0, bottom: 800, left: 0, right: 1200, width: 1200, height: 800 };
        }
    };

    useGlobals(t, {
        window: { innerHeight: 900, innerWidth: 1400 },
        document: {
            documentElement: { clientHeight: 900, clientWidth: 1400 },
            scrollingElement: null
        },
        getComputedStyle(el) {
            if (el === scroller) scrollerStyleCalls++;
            return { overflowY: el === scroller ? "auto" : "visible", overflow: el === scroller ? "auto" : "visible" };
        }
    });

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.isQuickSettingsPanelOpen = () => false;
    plugin.getAutoTranslationRenderQueueDelayMs = () => 0;
    plugin.getAutoTranslationScrollStillRemainingMs = () => 0;
    plugin.getDiagnosticTime = () => 1000;
    plugin.scheduleAutoTranslationRenderQueue = () => {};

    const targets = [0, 1, 2].map(i => {
        const msg = { nodeType: 1, isConnected: true, parentElement: scroller, contains: () => true };
        const content = {
            nodeType: 1,
            isConnected: true,
            parentElement: msg,
            closest: () => msg,
            getBoundingClientRect() {
                contentRectCalls++;
                return { top: 100 + i * 50, bottom: 130 + i * 50, left: 100, right: 500, width: 400, height: 30 };
            }
        };
        return { messageNode: msg, content, text: `line ${i}` };
    });

    plugin.isAutoTranslationRenderRequestCurrent = () => true;
    plugin.isAutoTranslationTargetDomTextCurrent = () => true;
    plugin.isAutoTranslationTargetIdentityCurrent = () => true;
    plugin.hasManualTranslationLine = () => false;
    plugin.rememberRecentAutoTranslationRender = () => {};
    plugin.renderTranslation = (_msg, content, _translated, _key, _src, opts) => {
        // Call getTranslationScrollSnapshot directly to confirm anchorRect + frame cache reuse.
        const snapshot = plugin.getTranslationScrollSnapshot(content, {
            allowScrollCorrectionWhilePaused: Boolean(opts?.allowScrollCorrectionWhilePaused),
            anchorRect: opts?.anchorRect
        });
        assert.ok(snapshot);
        assert.equal(snapshot.scroller, scroller);
        return {};
    };

    targets.forEach((target, idx) => {
        plugin.autoStateMachine.enqueueRenderTask({
            key: `render-${idx}`,
            kind: "cache",
            target,
            cacheKey: `cache-${idx}`,
            priority: idx,
            run: () => plugin.renderAutoTranslationCacheTarget(target, `译文 ${idx}`, `cache-${idx}`, null)
        });
    });

    plugin.processAutoTranslationRenderQueue();
    // Across all 3 tasks (6 scroller lookups + 6 band lookups before): only 1 style read & 1 scroller rect read!
    assert.equal(scrollerStyleCalls, 1);
    assert.equal(scrollerRectCalls, 1);
    // Each content measured once (pre-render drawability), reused as anchorRect in getTranslationScrollSnapshot!
    assert.equal(contentRectCalls, 3);
    assert.equal(plugin.renderFrameScrollCache, null);
});

test("processAutoTranslationRenderQueue enforces frame budget via both getDiagnosticTime and Date.now", t => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    let diagNowMs = 1000;

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.isQuickSettingsPanelOpen = () => false;
    plugin.getAutoTranslationRenderQueueDelayMs = () => 0;
    plugin.getDiagnosticTime = () => diagNowMs;
    plugin.scheduleAutoTranslationRenderQueue = () => {};

    // 1. Advancing getDiagnosticTime() past budget defers remaining tasks to the next frame.
    let ran = 0;
    plugin.autoStateMachine.enqueueRenderTask({
        key: "diag-budget-1",
        kind: "cache",
        target: {},
        priority: 1,
        run: () => { ran++; diagNowMs += AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS + 1; }
    });
    plugin.autoStateMachine.enqueueRenderTask({
        key: "diag-budget-2",
        kind: "cache",
        target: {},
        priority: 2,
        run: () => { ran++; }
    });
    plugin.processAutoTranslationRenderQueue();
    assert.equal(ran, 1);
    assert.equal(plugin.autoTranslationRenderQueue.length, 1);
    plugin.autoStateMachine.clearRenderQueue();

    // 2. Advancing Date.now past budget (even if getDiagnosticTime stays flat) also defers remaining tasks.
    ran = 0;
    plugin.autoStateMachine.enqueueRenderTask({
        key: "wall-budget-1",
        kind: "cache",
        target: {},
        priority: 1,
        run: () => { ran++; t.mock.timers.tick(AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS + 2); }
    });
    plugin.autoStateMachine.enqueueRenderTask({
        key: "wall-budget-2",
        kind: "cache",
        target: {},
        priority: 2,
        run: () => { ran++; }
    });
    plugin.processAutoTranslationRenderQueue();
    assert.equal(ran, 1);
    assert.equal(plugin.autoTranslationRenderQueue.length, 1);
});

test("processAutoTranslationRenderQueue picks the nearest nested scroll container in the same frame", t => {
    t.mock.timers.enable({ apis: ["Date"], now: 1_000_000 });
    const outer = {
        nodeType: 1,
        isConnected: true,
        scrollTop: 100,
        scrollHeight: 2000,
        clientHeight: 800,
        parentElement: null,
        contains(other) {
            for (let n = other; n; n = n.parentElement) if (n === this) return true;
            return false;
        },
        getBoundingClientRect: () => ({ top: 0, bottom: 800, left: 0, right: 1200, width: 1200, height: 800 })
    };
    const inner = {
        nodeType: 1,
        isConnected: true,
        scrollTop: 50,
        scrollHeight: 900,
        clientHeight: 300,
        parentElement: outer,
        contains(other) {
            for (let n = other; n; n = n.parentElement) if (n === this) return true;
            return false;
        },
        getBoundingClientRect: () => ({ top: 200, bottom: 500, left: 100, right: 700, width: 600, height: 300 })
    };

    useGlobals(t, {
        window: { innerHeight: 900, innerWidth: 1400 },
        document: { documentElement: { clientHeight: 900, clientWidth: 1400 }, scrollingElement: null },
        getComputedStyle(el) {
            const scrollable = el === outer || el === inner;
            return { overflowY: scrollable ? "auto" : "visible", overflow: scrollable ? "auto" : "visible" };
        }
    });

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.isQuickSettingsPanelOpen = () => false;
    plugin.getAutoTranslationRenderQueueDelayMs = () => 0;
    plugin.getAutoTranslationScrollStillRemainingMs = () => 0;
    plugin.getDiagnosticTime = () => 1000;
    plugin.scheduleAutoTranslationRenderQueue = () => {};

    let outerTop = 100;
    const outerMsg = { nodeType: 1, isConnected: true, parentElement: outer, getBoundingClientRect: () => ({ top: outerTop, bottom: outerTop + 30, left: 0, right: 400, width: 400, height: 30 }) };
    const outerContent = { nodeType: 1, isConnected: true, parentElement: outerMsg, closest: () => outerMsg, getBoundingClientRect: () => ({ top: outerTop, bottom: outerTop + 30, left: 0, right: 400, width: 400, height: 30 }) };

    let innerTop = 260;
    const innerMsg = { nodeType: 1, isConnected: true, parentElement: inner, getBoundingClientRect: () => ({ top: innerTop, bottom: innerTop + 30, left: 120, right: 520, width: 400, height: 30 }) };
    const innerContent = { nodeType: 1, isConnected: true, parentElement: innerMsg, closest: () => innerMsg, getBoundingClientRect: () => ({ top: innerTop, bottom: innerTop + 30, left: 120, right: 520, width: 400, height: 30 }) };

    plugin.autoStateMachine.enqueueRenderTask({
        key: "nested-outer",
        kind: "cache",
        target: { messageNode: outerMsg, content: outerContent },
        priority: 1,
        run: () => plugin.withTranslationScrollStability(outerContent, () => { outerTop += 20; })
    });
    plugin.autoStateMachine.enqueueRenderTask({
        key: "nested-inner",
        kind: "cache",
        target: { messageNode: innerMsg, content: innerContent },
        priority: 2,
        run: () => plugin.withTranslationScrollStability(innerContent, () => { innerTop += 30; })
    });

    plugin.processAutoTranslationRenderQueue();
    // Outer got its own +20px compensation, inner got its own +30px compensation (not written to outer!).
    assert.equal(outer.scrollTop, 120);
    assert.equal(inner.scrollTop, 80);
});

test("reconcileTranslationLines computes getMessageIdentity at most once per translated line", t => {
    const lines = [];
    useGlobals(t, { document: { querySelectorAll: () => lines } });
    const plugin = new Plugin();
    plugin.isStarted = true;
    let identityCalls = 0;
    plugin.getMessageIdentity = () => {
        identityCalls++;
        return "guild:chan:msg-1";
    };
    plugin.syncTranslationSourceVisibility = () => {};
    plugin.restoreTranslationSourceVisibility = () => {};
    plugin.getCachedElementText = () => "hello world";

    const messageNode = { nodeType: 1, isConnected: true };
    const content = { nodeType: 1, isConnected: true, dataset: {} };
    const ownerId = `${plugin.translationOwnerPrefix}-1`;
    plugin.getTranslationContentForLine = () => content;

    lines.push({
        dataset: {
            daitOwner: ownerId,
            daitMode: "auto",
            daitSourceSig: plugin.getStrongTextFingerprint("hello world"),
            daitIdentitySig: plugin.getStrongTextFingerprint("guild:chan:msg-1")
        },
        classList: { contains: () => false },
        closest: () => messageNode,
        remove() { throw new Error("valid line should not be removed"); }
    });
    lines.push({
        dataset: {
            daitOwner: ownerId,
            daitMode: "auto",
            daitSourceSig: plugin.getStrongTextFingerprint("hello world")
        },
        classList: { contains: () => false },
        closest: () => messageNode,
        remove() { throw new Error("valid line should not be removed"); }
    });

    plugin.reconcileTranslationLines({});
    // 1 call for lineWithSig, 0 calls for lineWithoutIdentity (was 4 calls before optimization).
    assert.equal(identityCalls, 1);
});

test("isMessageNodeVisibleForScan skips candidate queries for clearly off-screen rows and caches candidates on context", t => {
    useGlobals(t, {
        window: { innerHeight: 900, innerWidth: 1400 },
        document: { documentElement: { clientHeight: 900, clientWidth: 1400 } }
    });

    const plugin = new Plugin();
    let offscreenQueries = 0;
    const offscreenMessage = {
        nodeType: 1,
        isConnected: true,
        getBoundingClientRect: () => ({ top: 2400, bottom: 2440, left: 0, right: 500, width: 500, height: 40 }),
        querySelectorAll: () => { offscreenQueries++; return []; }
    };
    const context = {
        contentCandidatesByMessage: new Map(),
        rectByElement: new Map(),
        visibleByElement: new Map(),
        scrollClipByElement: new Map()
    };
    assert.equal(plugin.isMessageNodeVisibleForScan(offscreenMessage, context), false);
    assert.equal(offscreenQueries, 0);

    // Caching getMessageContentCandidates on context avoids repeated querySelectorAll on the same message.
    let visibleQueries = 0;
    const candidateEl = { nodeType: 1, closest: () => null };
    const visibleMessage = {
        nodeType: 1,
        isConnected: true,
        querySelectorAll(selector) {
            visibleQueries++;
            return String(selector || "").includes("messageContent") ? [candidateEl] : [];
        }
    };
    assert.deepEqual(plugin.getMessageContentCandidates(visibleMessage, context), [candidateEl]);
    assert.deepEqual(plugin.getMessageContentCandidates(visibleMessage, context), [candidateEl]);
    assert.equal(visibleQueries, 1);
});

test("PanelTheme.startWatching ignores non-theme class toggles on html/body without DOM queries", t => {
    let qsaCalls = 0;
    let observerCallback = null;
    const root = {
        nodeType: 1,
        className: "theme-dark",
        getAttribute: () => null
    };
    const body = {
        nodeType: 1,
        className: "",
        getAttribute: () => null
    };
    useGlobals(t, {
        document: {
            documentElement: root,
            body,
            querySelectorAll() {
                qsaCalls++;
                return [];
            }
        },
        window: { matchMedia: () => null },
        MutationObserver: class {
            constructor(cb) { observerCallback = cb; }
            observe() {}
            disconnect() {}
        }
    });

    const plugin = new Plugin();
    plugin.isStarted = true;
    let themeClassResyncs = 0;
    plugin.refreshDiscordThemeClasses = () => { themeClassResyncs++; };

    plugin.panelTheme.startWatching();
    qsaCalls = 0;
    themeClassResyncs = 0;

    // Routine Discord focus/input class toggle: must do 0 DOM queries and 0 full-page resyncs.
    root.className = "theme-dark mouse-mode";
    observerCallback([]);
    body.className = "app-focused";
    observerCallback([]);
    assert.equal(qsaCalls, 0);
    assert.equal(themeClassResyncs, 0);

    // Actual Discord theme switch must still refresh panels and resync classes.
    root.className = "theme-light mouse-mode";
    observerCallback([]);
    assert.equal(qsaCalls, 1);
    assert.equal(themeClassResyncs, 1);

    plugin.panelTheme.stopWatching();
});

test("handleKeydown short-circuits ordinary typing without calling event.target.closest", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.enablePolishHotkey = true;
    plugin.settings.polish.enabled = true;
    plugin.settings.ui.polishHotkey = "Ctrl+Shift+P";
    plugin.getActiveTextbox = () => null;

    let closestCalls = 0;
    const target = {
        closest() { closestCalls++; return null; }
    };

    // Plain character, Enter, and Shift+A must return before touching DOM closest().
    plugin.handleKeydown({ key: "a", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, repeat: false, target });
    plugin.handleKeydown({ key: "Enter", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, repeat: false, target });
    plugin.handleKeydown({ key: "A", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false, repeat: false, target });
    assert.equal(closestCalls, 0);

    // Shift+F2 is an allowed hotkey shape so it must reach the settings-surface check.
    plugin.handleKeydown({ key: "F2", ctrlKey: false, altKey: false, shiftKey: true, metaKey: false, repeat: false, target });
    assert.equal(closestCalls, 1);

    // Ctrl+Shift+P also reaches the check.
    plugin.handleKeydown({ key: "P", ctrlKey: true, altKey: false, shiftKey: true, metaKey: false, repeat: false, target });
    assert.equal(closestCalls, 2);
});

test("lifecycle observer fast-skips outside mutations in member lists and emoji pickers", t => {
    let lifecycleCb = null;
    const chatRoot = { nodeType: 1, isConnected: true, contains: () => false };
    const memberListItem = {
        nodeType: 1,
        isConnected: true,
        tagName: "DIV",
        matches: sel => String(sel || "").includes("membersWrap"),
        closest: () => null,
        querySelector() { throw new Error("should not querySelector ignored member list mutation"); }
    };
    const appMount = {
        nodeType: 1,
        isConnected: true,
        parentElement: null,
        contains: node => node === memberListItem || node === chatRoot
    };
    useGlobals(t, {
        document: {
            body: appMount,
            getElementById: id => id === "app-mount" ? appMount : null
        },
        MutationObserver: class {
            constructor(cb) { lifecycleCb = cb; }
            observe() {}
            disconnect() {}
        }
    });

    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.observerRoot = chatRoot;
    let forwarded = 0;
    plugin.handleDiscordObservedMutations = () => { forwarded++; };
    plugin.startDiscordObserverLifecycle(chatRoot);

    assert.equal(typeof lifecycleCb, "function");
    lifecycleCb([
        { type: "childList", target: memberListItem, addedNodes: [memberListItem], removedNodes: [] }
    ]);
    assert.equal(forwarded, 0);
});
