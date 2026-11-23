"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DisposableScope } = require("../../src/core/disposable-scope");
const { EventBus } = require("../../src/core/event-bus");

test("DisposableScope cleans up custom callbacks, timers, listeners, controllers, and child scopes idempotently", async () => {
    const scope = new DisposableScope();
    const calls = [];
    scope.add(() => calls.push("root"));

    let timerFired = false;
    scope.setTimeout(() => { timerFired = true; }, 20);

    let intervalFired = 0;
    scope.setInterval(() => { intervalFired++; }, 15);

    const added = [];
    const removed = [];
    const fakeTarget = {
        addEventListener(ev, fn, opts) { added.push({ ev, fn, opts }); },
        removeEventListener(ev, fn, opts) { removed.push({ ev, fn, opts }); }
    };
    const handler = () => {};
    scope.on(fakeTarget, "click", handler, true);

    const controller = scope.createAbortController();
    assert.equal(controller.signal.aborted, false);

    const child = scope.createChild();
    child.add(() => calls.push("child"));

    scope.dispose();
    scope.dispose(); // idempotent

    assert.deepEqual(calls, ["child", "root"]);
    assert.equal(controller.signal.aborted, true);
    assert.equal(added.length, 1);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].ev, "click");
    assert.equal(removed[0].fn, handler);

    // Registering on an already-disposed scope invokes cleanup immediately.
    let lateCleaned = false;
    scope.add(() => { lateCleaned = true; });
    assert.equal(lateCleaned, true);

    await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(timerFired, false);
    assert.equal(intervalFired, 0);

    // reset() allows reusing root scope across stop/start cycles.
    scope.reset();
    assert.equal(scope.disposed, false);
    let afterReset = false;
    scope.add(() => { afterReset = true; });
    assert.equal(afterReset, false);
    scope.dispose();
    assert.equal(afterReset, true);
});

test("EventBus isolates listener errors, supports once/off/clear, and reports counts", () => {
    const bus = new EventBus();
    const seen = [];

    const offA = bus.on("settings:changed", payload => {
        seen.push(`a:${payload.key}`);
        throw new Error("boom");
    });
    bus.on("settings:changed", payload => {
        seen.push(`b:${payload.key}`);
    });
    bus.once("settings:changed", payload => {
        seen.push(`once:${payload.key}`);
    });

    assert.equal(bus.listenerCount("settings:changed"), 3);
    assert.equal(bus.emit("settings:changed", { key: "lang" }), 3);
    assert.deepEqual(seen, ["a:lang", "b:lang", "once:lang"]);
    assert.equal(bus.listenerCount("settings:changed"), 2);

    offA();
    assert.equal(bus.emit("settings:changed", { key: "theme" }), 1);
    assert.deepEqual(seen, ["a:lang", "b:lang", "once:lang", "b:theme"]);

    bus.clear();
    assert.equal(bus.listenerCount(), 0);
});
