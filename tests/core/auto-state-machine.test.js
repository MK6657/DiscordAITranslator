"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { AutoTranslationStateMachine } = require("../../src/auto-translation/state-machine");
const { AutoTranslationCooldownStore } = require("../../src/auto-translation/cooldown-store");

test("AutoTranslationStateMachine maintains I1-I5 invariants across enqueue, in-flight, render, and reset transitions", () => {
    const sm = new AutoTranslationStateMachine();
    assert.deepEqual(sm.checkInvariants(), []);
    assert.equal(sm.hasActiveWork(), false);

    // Enqueue 2 items (duplicate ignored)
    assert.equal(sm.enqueue({ cacheKey: "k1", priority: 10 }), true);
    assert.equal(sm.enqueue({ cacheKey: "k1", priority: 10 }), false);
    assert.equal(sm.enqueue({ cacheKey: "k2", priority: 20, long: true }), true);
    assert.equal(sm.hasActiveWork(), true);
    assert.deepEqual(sm.checkInvariants(), []);

    // Move k1 and k2 to in-flight
    sm.removeQueued("k1");
    sm.removeQueued("k2");
    const tokens = sm.beginInFlightBatch(
        [{ cacheKey: "k1" }, { cacheKey: "k2", long: true }],
        { isPrefetch: false, isVisibleLong: item => Boolean(item.long) }
    );
    assert.equal(tokens.length, 2);
    assert.equal(sm.inFlight, 1);
    assert.equal(sm.inFlightItems, 2);
    assert.deepEqual(sm.checkInvariants(), []);

    const snap2 = sm.getTaskSnapshot("k2");
    assert.equal(snap2.inFlight, true);
    assert.equal(snap2.visibleLongInFlight, true);

    // Stale token cannot finish an active in-flight item
    assert.equal(sm.finishInFlightItem("k1", 999999), false);
    assert.equal(sm.inFlightKeys.has("k1"), true);

    // Matching token clears item cleanly
    assert.equal(sm.finishInFlightItem("k1", tokens[0]), true);
    assert.equal(sm.finishInFlightItem("k2", tokens[1]), true);
    sm.finishInFlightBatch({ batchSize: 2, isPrefetch: false });
    // Extra decrement clamps safely to 0
    sm.finishInFlightBatch({ batchSize: 5, isPrefetch: true });
    assert.equal(sm.inFlight, 0);
    assert.equal(sm.inFlightItems, 0);
    assert.equal(sm.prefetchInFlight, 0);
    assert.deepEqual(sm.checkInvariants(), []);

    // Enqueue render task atomically
    assert.equal(sm.enqueueRenderTask({ key: "r1", cacheKey: "k1" }), true);
    assert.equal(sm.enqueueRenderTask({ key: "r1", cacheKey: "k1", updated: true }), false);
    assert.equal(sm.getTaskSnapshot("k1").renderQueued, true);
    assert.equal(sm.getTaskSnapshot("k1").renderPending, true);
    assert.deepEqual(sm.checkInvariants(), []);

    const prevVersion = sm.configVersion;
    sm.resetAll();
    assert.equal(sm.configVersion, prevVersion + 1);
    assert.equal(sm.hasActiveWork(), false);
    assert.deepEqual(sm.checkInvariants(), []);
});

test("AutoTranslationCooldownStore isolates failure clearing and notice preservation", () => {
    const store = new AutoTranslationCooldownStore();
    store.failures.set("m1", { count: 2 });
    store.providerFailures.set("p1", { type: "rate-limit" });
    store.providerNoticeAt.set("p1", { at: 123 });
    store.precheckSkips.set("s1", 999);

    store.clearFailures({ preserveNotices: true });
    assert.equal(store.failures.size, 0);
    assert.equal(store.providerFailures.size, 0);
    assert.equal(store.providerNoticeAt.size, 1);

    store.clearAll();
    assert.equal(store.providerNoticeAt.size, 0);
    assert.equal(store.precheckSkips.size, 0);
});
