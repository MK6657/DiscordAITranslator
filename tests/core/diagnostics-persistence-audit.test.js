"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const {
    DATA_KEY,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_DATA_KEY,
    DIAGNOSTIC_DATA_STORE,
    DIAGNOSTICS_MAX_ENTRIES,
    PLUGIN_NAME
} = require("../../src/constants");
const { createFakeDataApi, installChatGlobals } = require("../fixtures/chat-harness");

const SETTINGS = `${PLUGIN_NAME}/${DATA_KEY}`;
const DIAGNOSTICS = `${DIAGNOSTIC_DATA_STORE}/${DIAGNOSTIC_DATA_KEY}`;
const LEGACY_DIAGNOSTICS = `${PLUGIN_NAME}/${DIAGNOSTIC_DATA_KEY}`;

function openDiagnostics(t, { entries = 2, legacy = false } = {}) {
    const settings = structuredClone(DEFAULT_SETTINGS);
    settings.ui.diagnosticsEnabled = true;
    const oldest = Date.now() - 30000;
    const original = {
        version: 1,
        savedAt: oldest + entries + 3,
        compressed: 2,
        logs: Array.from({ length: entries }, (_, index) => ({
            ts: oldest + index,
            ...(index === entries - 1 ? { lastTs: oldest + entries + 2 } : {}),
            action: `stored.${index}`,
            status: "ok",
            count: index === entries - 1 ? 3 : 1,
            meta: {}
        }))
    };
    const files = { [PLUGIN_NAME]: { [DATA_KEY]: settings } };
    const store = legacy ? PLUGIN_NAME : DIAGNOSTIC_DATA_STORE;
    (files[store] ||= {})[DIAGNOSTIC_DATA_KEY] = original;
    const bdApi = createFakeDataApi(files);
    const { load, save } = bdApi.Data;
    const unreadable = new Set();
    const unwritable = new Set();
    const diagnosticWrites = [];
    bdApi.Data.load = (name, key) => {
        const source = `${name}/${key}`;
        if (unreadable.has(source)) throw new Error(`Cannot read ${source}`);
        return load(name, key);
    };
    bdApi.Data.save = (name, key, payload) => {
        const target = `${name}/${key}`;
        if (target === DIAGNOSTICS) diagnosticWrites.push(payload);
        if (unwritable.has(target)) return false;
        return save(name, key, payload);
    };

    const { restore } = installChatGlobals({ bdApi });
    const instances = [];
    function newPlugin() {
        const plugin = new Plugin();
        Object.assign(plugin, {
            injectStyles() {},
            removeStyles() {},
            patchMessageContextMenu() {},
            startObserver() {},
            queueScan() {},
            showToast() {},
            warnSanitized() {}
        });
        instances.push(plugin);
        return plugin;
    }
    t.after(() => {
        try {
            for (const plugin of instances) {
                if (plugin.lifecycleStarted) plugin.stop();
            }
        }
        finally {
            restore();
        }
    });
    return {
        plugin: newPlugin(),
        newPlugin,
        bdApi,
        unreadable,
        unwritable,
        diagnosticWrites,
        original,
        stored: () => bdApi.files[DIAGNOSTIC_DATA_STORE]?.[DIAGNOSTIC_DATA_KEY]
    };
}

function history(logs) {
    return logs.map(({ action, ts, lastTs = ts, count }) => ({ action, ts, lastTs, count }));
}

test("a failed settings read keeps diagnostics on disk and restart loads them", t => {
    const { plugin, unreadable, diagnosticWrites, original, stored } = openDiagnostics(t);
    unreadable.add(SETTINGS);
    assert.equal(plugin.start(), true);
    assert.equal(plugin.settingsLoadBlocked, true);
    assert.equal(plugin.settings.ui.diagnosticsEnabled, false);
    plugin.stop();
    assert.deepEqual(diagnosticWrites, []);
    assert.deepEqual(stored(), original);

    unreadable.delete(SETTINGS);
    assert.equal(plugin.start(), true);
    assert.equal(plugin.settingsLoadBlocked, false);
    assert.equal(plugin.settings.ui.diagnosticsEnabled, true);
    assert.deepEqual(history(plugin.diagnosticLogs), history(original.logs));
    assert.equal(plugin.diagnosticCompressedCount, original.compressed);
});

test("startup clears diagnostics for a stored false and preserves them for missing or invalid settings", t => {
    const { plugin, bdApi, diagnosticWrites, original, stored } = openDiagnostics(t);
    for (const value of [undefined, "false"]) {
        bdApi.files[PLUGIN_NAME][DATA_KEY].ui.diagnosticsEnabled = value;
        assert.equal(plugin.start(), true);
        assert.equal(plugin.settingsLoadBlocked, false);
        assert.equal(plugin.settings.ui.diagnosticsEnabled, false);
        plugin.stop();
        assert.deepEqual(diagnosticWrites, []);
        assert.deepEqual(stored(), original);
    }

    bdApi.files[PLUGIN_NAME][DATA_KEY].ui.diagnosticsEnabled = false;
    assert.equal(plugin.start(), true);
    assert.equal(diagnosticWrites.length, 1);
    assert.deepEqual(stored().logs, []);
    assert.equal(stored().compressed, 0);
});

test("startup preserves diagnostics when dirty settings cannot be saved and reloaded", t => {
    const { plugin, unwritable, diagnosticWrites, original, stored } = openDiagnostics(t);
    unwritable.add(SETTINGS);
    plugin.settings.ui.diagnosticsEnabled = false;
    plugin.settingsDirty = true;
    assert.equal(plugin.start(), true);
    assert.equal(plugin.settingsDirty, true);
    assert.deepEqual(diagnosticWrites, []);
    assert.deepEqual(stored(), original);
});

test("diagnostic read failures across stop and start merge the backlog once before saving", t => {
    const { plugin, newPlugin, unreadable, unwritable, diagnosticWrites, original, stored } = openDiagnostics(t);
    unreadable.add(DIAGNOSTICS);
    assert.equal(plugin.start(), true);
    const loggedAt = Date.now();
    t.mock.method(Date, "now", () => loggedAt);
    plugin.logDiagnostic("backlog.event", "ok");
    plugin.logDiagnostic("backlog.event", "ok");
    assert.equal(plugin.flushDiagnosticLogs({ scheduled: true }), false);
    assert.ok(plugin.diagnosticLogsDirtyTimer);
    assert.equal(plugin.flushPendingPersistence().diagnostics, false);
    assert.equal(plugin.diagnosticLogsDirtyTimer, null);
    plugin.stop();
    assert.equal(plugin.diagnosticLogsDirty, true);
    assert.equal(plugin.diagnosticLogsDirtyTimer, null);
    assert.equal(plugin.start(), true);
    assert.deepEqual(diagnosticWrites, []);
    assert.deepEqual(stored(), original);

    const backlog = history(plugin.diagnosticLogs);
    assert.equal(backlog.find(entry => entry.action === "backlog.event").count, 2);
    const expected = [...history(original.logs), ...backlog];
    const compressed = original.compressed + plugin.diagnosticCompressedCount;
    unreadable.delete(DIAGNOSTICS);
    unwritable.add(DIAGNOSTICS);
    assert.equal(plugin.flushPendingPersistence().diagnostics, false);
    assert.equal(diagnosticWrites.length, 1);
    assert.deepEqual(stored(), original);
    assert.deepEqual(history(plugin.diagnosticLogs), expected);
    assert.equal(plugin.diagnosticCompressedCount, compressed);
    plugin.stop();
    assert.equal(plugin.diagnosticLogsDirty, true);

    unwritable.delete(DIAGNOSTICS);
    assert.equal(plugin.start(), true);
    assert.deepEqual(history(stored().logs), expected);
    assert.equal(stored().compressed, compressed);
    plugin.stop();
    const restarted = newPlugin();
    assert.equal(restarted.start(), true);
    assert.deepEqual(history(restarted.diagnosticLogs), expected);
    assert.equal(restarted.diagnosticCompressedCount, compressed);
});

test("a recovered diagnostic store keeps the newest entries up to the limit in order", t => {
    const { plugin, unreadable, original, stored } = openDiagnostics(t, { entries: DIAGNOSTICS_MAX_ENTRIES });
    unreadable.add(DIAGNOSTICS);
    assert.equal(plugin.start(), true);
    plugin.logDiagnostic("backlog.newest", "ok");
    const pending = history(plugin.diagnosticLogs);
    assert.deepEqual(stored(), original);

    unreadable.delete(DIAGNOSTICS);
    assert.equal(plugin.flushPendingPersistence().diagnostics, true);
    const expected = [...history(original.logs), ...pending].slice(-DIAGNOSTICS_MAX_ENTRIES);
    assert.equal(stored().logs.length, DIAGNOSTICS_MAX_ENTRIES);
    assert.deepEqual(history(stored().logs), expected);
});

test("diagnostic persistence waits for an unreadable legacy fallback before saving", t => {
    const { plugin, unreadable, diagnosticWrites, original, stored } = openDiagnostics(t, { legacy: true });
    unreadable.add(LEGACY_DIAGNOSTICS);
    assert.equal(plugin.start(), true);
    plugin.logDiagnostic("backlog.from-legacy", "ok");
    assert.equal(plugin.flushPendingPersistence().diagnostics, false);
    assert.deepEqual(diagnosticWrites, []);
    const pending = history(plugin.diagnosticLogs);

    unreadable.delete(LEGACY_DIAGNOSTICS);
    assert.equal(plugin.flushPendingPersistence().diagnostics, true);
    assert.deepEqual(history(stored().logs), [...history(original.logs), ...pending]);
});

test("a save-only host cannot overwrite diagnostics before the read API returns", t => {
    const { plugin, bdApi, diagnosticWrites, original, stored } = openDiagnostics(t);
    const load = bdApi.Data.load;
    delete bdApi.Data.load;
    plugin.settings.ui.diagnosticsEnabled = true;
    plugin.logDiagnostic("backlog.without-read-api", "ok");
    assert.equal(plugin.flushPendingPersistence().diagnostics, false);
    assert.deepEqual(diagnosticWrites, []);
    assert.deepEqual(stored(), original);
    const pending = history(plugin.diagnosticLogs);

    bdApi.Data.load = load;
    assert.equal(plugin.flushPendingPersistence().diagnostics, true);
    assert.deepEqual(history(stored().logs), [...history(original.logs), ...pending]);
});

test("explicit diagnostic clear rolls back on write failure and drops unreadable history on success", t => {
    const { plugin, unreadable, unwritable, original, stored } = openDiagnostics(t);
    unreadable.add(DIAGNOSTICS);
    assert.equal(plugin.start(), true);
    plugin.logDiagnostic("backlog.before-clear", "ok");
    const pending = history(plugin.diagnosticLogs);

    unwritable.add(DIAGNOSTICS);
    assert.equal(plugin.clearDiagnosticLogs(), false);
    assert.deepEqual(history(plugin.diagnosticLogs), pending);
    assert.deepEqual(stored(), original);
    assert.equal(plugin.flushPendingPersistence().diagnostics, false);

    unwritable.delete(DIAGNOSTICS);
    assert.equal(plugin.clearDiagnosticLogs(), true);
    assert.deepEqual(stored().logs, []);
    assert.equal(stored().compressed, 0);
    plugin.logDiagnostic("after.clear", "ok");
    assert.equal(plugin.flushPendingPersistence().diagnostics, true);
    assert.deepEqual(stored().logs.map(entry => entry.action), ["after.clear"]);
});

test("disabling diagnostics retries a failed clear without bringing back old logs", t => {
    const { plugin, unreadable, unwritable, original, stored } = openDiagnostics(t);
    unreadable.add(DIAGNOSTICS);
    assert.equal(plugin.start(), true);
    plugin.logDiagnostic("backlog.before-disable", "ok");

    unwritable.add(DIAGNOSTICS);
    plugin.setSetting("ui.diagnosticsEnabled", false);
    assert.deepEqual(plugin.diagnosticLogs, []);
    assert.deepEqual(stored(), original);
    assert.equal(plugin.diagnosticLogsDirty, true);

    unwritable.delete(DIAGNOSTICS);
    plugin.setSetting("ui.diagnosticsEnabled", true);
    plugin.logDiagnostic("after.enable", "ok");
    assert.equal(plugin.flushPendingPersistence().diagnostics, true);
    assert.deepEqual(stored().logs.map(entry => entry.action), ["after.enable"]);
    assert.equal(stored().compressed, 0);
});
