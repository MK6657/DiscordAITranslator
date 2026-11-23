"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DisposableScope } = require("../../src/core/disposable-scope");
const { EventBus } = require("../../src/core/event-bus");
const { createPluginContext } = require("../../src/core/plugin-context");
const { installClassPrototypeBridge } = require("../../src/core/delegate-methods");
const Plugin = require("../../src");

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

test("installClassPrototypeBridge forwards public methods without invoking getters or leaking private/excluded helpers", () => {
    let getterCalls = 0;
    class SampleService {
        get computed() { getterCalls++; return 42; }
        _privateHelper() { return "private"; }
        excludedHelper() { return "excluded"; }
        existingOverride() { return "service"; }
        greet(name) { return `hi ${name}`; }
    }
    class Host {
        constructor() { this.svc = new SampleService(); }
        existingOverride() { return "host"; }
    }
    const installed = installClassPrototypeBridge(Host.prototype, "svc", SampleService, ["excludedHelper"]);
    assert.deepEqual(installed, ["greet"]);
    assert.equal(getterCalls, 0);
    const host = new Host();
    assert.equal(host.greet("world"), "hi world");
    assert.equal(host.existingOverride(), "host");
    assert.equal(typeof host._privateHelper, "undefined");
    assert.equal(typeof host.excludedHelper, "undefined");
});

test("createPluginContext and EventBus connect ProviderLayer, QueueCore, and QuickPanel cleanly", () => {
    const plugin = new Plugin();
    const ctx = createPluginContext(plugin);
    assert.equal(ctx.events, plugin.events);
    assert.equal(ctx.scope, plugin.runtimeScope);
    assert.equal(ctx.settings, plugin.settings);
    assert.equal(ctx.providers, plugin.providerLayer);
    assert.equal(ctx.cache, plugin.translationCacheStore);
    assert.equal(ctx.stateMachine, plugin.autoStateMachine);
    assert.equal(ctx.cooldowns, plugin.autoCooldowns);
    assert.equal(ctx.host, plugin.discordHost);

    const observed = [];
    plugin.events.on("api:status", payload => observed.push(`api:${payload.kind}:${payload.state}`));
    plugin.events.on("auto:queue-invalidated", () => observed.push("queue:invalidated"));
    plugin.events.on("auto:config-error-cleared", payload => observed.push(`cleared:${payload.kind}`));

    plugin.setApiRuntimeStatus("translation", "success", "OK");
    plugin.invalidateAutoTranslationQueue({ preserveNodes: true });
    plugin.clearAutoTranslationProviderFailureForCurrentConfig("translation");

    assert.deepEqual(observed, [
        "api:translation:success",
        "queue:invalidated",
        "cleared:translation"
    ]);
    if (plugin.settingsDirtyTimer) clearTimeout(plugin.settingsDirtyTimer);
    plugin.quickPanel?.destroy?.("test");
});

test("stop() aborts in-flight apiTestRuns and modelDetectionRuns, clears runningApiTests, and preserves EventBus subscriptions", () => {
    const { installChatGlobals } = require("../fixtures/chat-harness");
    const { restore } = installChatGlobals({});
    try {
        const plugin = new Plugin();
        const apiController = new AbortController();
        const detectController = new AbortController();
        plugin.providerLayer.apiTestRuns = new Map([["translation", { sequence: 1, controller: apiController }]]);
        plugin.providerLayer.runningApiTests.set("translation", 1);
        plugin.modelDetectionRuns = new Map([["translation", { sequence: 1, controller: detectController }]]);

        let statusEvents = 0;
        plugin.events.on("api:status", () => { statusEvents++; });

        plugin.stop();
        assert.equal(apiController.signal.aborted, true);
        assert.equal(detectController.signal.aborted, true);
        assert.equal(plugin.isApiTestRunning("translation"), false);

        // Domain event bus subscriptions remain active after a stop() cycle.
        plugin.setApiRuntimeStatus("translation", "success", "OK");
        assert.equal(statusEvents, 1);
        if (plugin.settingsDirtyTimer) clearTimeout(plugin.settingsDirtyTimer);
        plugin.quickPanel?.destroy?.("test");
    }
    finally {
        restore();
    }
});
