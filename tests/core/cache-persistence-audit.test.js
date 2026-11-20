"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { CACHE_DATA_KEY, CACHE_DATA_STORE, PLUGIN_NAME } = require("../../src/constants");
const { createFakeDataApi, installChatGlobals } = require("../fixtures/chat-harness");

const HOUR = 60 * 60 * 1000;

function cacheEntry(key, value, touchedAt, { createdAt = touchedAt, expiresAt = touchedAt + HOUR } = {}) {
    return { key, value, createdAt, touchedAt, expiresAt };
}

function cachePayload(savedAt, entries) {
    return { version: 3, savedAt, ttlHours: 48, maxEntries: 4000, entries };
}

function openStorage(t, { current, legacy } = {}) {
    const bdApi = createFakeDataApi({
        [PLUGIN_NAME]: { [CACHE_DATA_KEY]: legacy },
        [CACHE_DATA_STORE]: { [CACHE_DATA_KEY]: current }
    });
    const { restore } = installChatGlobals({ bdApi });
    const faults = { unreadable: false, rejectWrites: 0, discardWrites: false, afterWrite: null, rejectDeletes: false };
    const operations = [];
    const data = { ...bdApi.Data };
    bdApi.Data.load = (store, key) => {
        if (store === CACHE_DATA_STORE && key === CACHE_DATA_KEY) {
            operations.push("read");
            if (faults.unreadable) throw new Error("synthetic cache read failure");
        }
        return data.load(store, key);
    };
    bdApi.Data.save = (store, key, value) => {
        if (store === CACHE_DATA_STORE && key === CACHE_DATA_KEY) {
            operations.push("write");
            if (faults.rejectWrites > 0) {
                faults.rejectWrites--;
                return false;
            }
            if (faults.discardWrites) return true;
            const result = data.save(store, key, value);
            faults.afterWrite?.();
            return result;
        }
        return data.save(store, key, value);
    };
    bdApi.Data.delete = (store, key) => {
        if (store === PLUGIN_NAME && key === CACHE_DATA_KEY) {
            operations.push("delete-legacy");
            if (faults.rejectDeletes) return false;
        }
        return data.delete(store, key);
    };

    const plugins = [];
    const create = () => {
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
        plugins.push(plugin);
        return plugin;
    };
    const start = (plugin = create()) => {
        assert.equal(plugin.start(), true);
        return plugin;
    };
    t.after(() => {
        try {
            for (const plugin of plugins) {
                if (plugin.lifecycleStarted && plugin.isStarted) plugin.stop();
                clearTimeout(plugin.translationCacheDirtyTimer);
            }
        }
        finally { restore(); }
    });
    return {
        create, start, faults, operations,
        current: () => bdApi.files[CACHE_DATA_STORE][CACHE_DATA_KEY],
        legacy: () => bdApi.files[PLUGIN_NAME][CACHE_DATA_KEY],
        putCurrent: payload => data.save(CACHE_DATA_STORE, CACHE_DATA_KEY, payload),
        putLegacy: payload => data.save(PLUGIN_NAME, CACHE_DATA_KEY, payload)
    };
}

const entries = plugin => Object.fromEntries(plugin.translationCache);
const flush = plugin => plugin.flushTranslationCache({ retryOnError: false });

test("S02 failed cache reads block writes and clear until a reread merges the pending cache", t => {
    const now = Date.now();
    t.mock.method(Date, "now", () => now);
    const stored = cachePayload(now, [
        cacheEntry("old", "from disk", now - 200),
        cacheEntry("tie", "disk value at equal time", now),
        cacheEntry("newer", "newer disk value", now + 50),
        cacheEntry("expired", "discard expired", now - HOUR, { expiresAt: now - 1 })
    ]);
    const storage = openStorage(t, { current: stored });
    storage.faults.unreadable = true;
    const plugin = storage.start();
    assert.ok(plugin.dataLoadFailures.has(CACHE_DATA_KEY));
    plugin.setTranslationCache("tie", "pending value at equal time");
    plugin.setTranslationCache("newer", "older pending value");
    plugin.setTranslationCache("added", "pending new value");

    assert.equal(plugin.flushPendingPersistence().cache, false);
    assert.equal(plugin.clearTranslationCache(), false);
    assert.ok(plugin.translationCacheDirty);
    assert.deepEqual(storage.current(), stored);
    assert.equal(storage.operations.includes("write"), false);

    plugin.stop();
    storage.start(plugin);
    assert.equal(plugin.translationCache.get("added"), "pending new value");
    assert.ok(plugin.translationCacheDirty);
    assert.equal(storage.operations.includes("write"), false);

    storage.faults.unreadable = false;
    storage.operations.length = 0;
    assert.equal(plugin.flushPendingPersistence().cache, true);
    assert.deepEqual(storage.operations, ["read", "write"]);
    assert.equal(plugin.dataLoadFailures.has(CACHE_DATA_KEY), false);
    assert.deepEqual([...plugin.translationCache.keys()], ["old", "tie", "added", "newer"]);
    const expected = {
        old: "from disk",
        tie: "pending value at equal time",
        added: "pending new value",
        newer: "newer disk value"
    };
    assert.deepEqual(entries(plugin), expected);
    assert.equal(plugin.persistentTranslationCacheCount, 4);
    plugin.stop();
    assert.deepEqual(entries(storage.start()), expected);
});

test("S02 an unsuccessful reload preserves memory and a failed recovery save remains retryable", t => {
    const now = Date.now();
    const storage = openStorage(t, { current: cachePayload(now - 100, [
        cacheEntry("initial", "initial saved value", now - 200)
    ]) });
    const plugin = storage.start();
    plugin.setTranslationCache("pending", "pending value");
    storage.faults.unreadable = true;
    assert.equal(plugin.loadTranslationCache(), false);
    assert.deepEqual(entries(plugin), { initial: "initial saved value", pending: "pending value" });

    const recovered = cachePayload(now, [
        cacheEntry("initial", "initial saved value", now - 200),
        cacheEntry("on-disk", "recovered disk value", now - 50)
    ]);
    storage.putCurrent(recovered);
    storage.faults.unreadable = false;
    storage.faults.rejectWrites = 1;
    assert.equal(flush(plugin), false);
    assert.ok(plugin.translationCacheDirty);
    assert.deepEqual(storage.current(), recovered);
    const expected = { initial: "initial saved value", "on-disk": "recovered disk value", pending: "pending value" };
    assert.deepEqual(entries(plugin), expected);
    assert.equal(flush(plugin), true);
    plugin.stop();
    assert.deepEqual(entries(storage.start()), expected);
});

test("S02 a readable legacy fallback does not authorize overwriting an unreadable dedicated cache", t => {
    const now = Date.now();
    const current = cachePayload(now, [cacheEntry("current", "saved in dedicated cache", now)]);
    const legacy = cachePayload(now, [cacheEntry("legacy", "saved in legacy cache", now)]);
    const storage = openStorage(t, { current, legacy });
    storage.faults.unreadable = true;
    const plugin = storage.start();
    assert.deepEqual(plugin.loadData(CACHE_DATA_KEY), legacy);
    plugin.setTranslationCache("pending", "queued translation");
    assert.equal(flush(plugin), false);
    assert.deepEqual(storage.current(), current);
    assert.deepEqual(storage.legacy(), legacy);
    assert.equal(storage.operations.includes("write"), false);

    storage.faults.unreadable = false;
    assert.equal(flush(plugin), true);
    plugin.stop();
    assert.deepEqual(entries(storage.start()), {
        current: "saved in dedicated cache",
        legacy: "saved in legacy cache",
        pending: "queued translation"
    });
});

test("S03 a normal save after a failed migration preserves the downgrade cache for the next merge", t => {
    const now = Date.now();
    const current = cachePayload(now - 2000, [cacheEntry("current", "from current version", now - 2500)]);
    const legacy = cachePayload(now - 1000, [cacheEntry("legacy", "translated during downgrade", now - 1250)]);
    const storage = openStorage(t, { current, legacy });
    storage.faults.rejectWrites = 1;
    const plugin = storage.start();
    assert.deepEqual(storage.current(), current);
    assert.deepEqual(storage.legacy(), legacy);
    assert.equal(storage.operations.includes("delete-legacy"), false);
    plugin.setTranslationCache("new", "translated after upgrade");
    assert.equal(flush(plugin), true);
    assert.ok(storage.current().savedAt > legacy.savedAt);
    assert.equal(storage.current().mergedLegacy, undefined);
    assert.deepEqual(storage.legacy(), legacy);

    plugin.stop();
    assert.deepEqual(entries(storage.start()), {
        current: "from current version",
        legacy: "translated during downgrade",
        new: "translated after upgrade"
    });
    assert.equal(storage.legacy(), undefined);
    assert.ok(storage.current().mergedLegacy?.fingerprint);
});

test("S03 retains the legacy copy when save reports success but dedicated readback is unchanged", t => {
    const now = Date.now();
    const current = cachePayload(now - 200, [cacheEntry("current", "dedicated copy", now - 300)]);
    const legacy = cachePayload(now - 100, [cacheEntry("legacy", "downgrade copy", now - 150)]);
    const storage = openStorage(t, { current, legacy });
    storage.faults.discardWrites = true;

    assert.equal(storage.create().migrateLegacyDataStoreKey(CACHE_DATA_KEY), "save-failed");
    assert.deepEqual(storage.operations, ["read", "write", "read"]);
    assert.deepEqual(storage.current(), current);
    assert.deepEqual(storage.legacy(), legacy);

    storage.faults.discardWrites = false;
    storage.operations.length = 0;
    assert.equal(storage.create().migrateLegacyDataStoreKey(CACHE_DATA_KEY), "merged");
    assert.deepEqual(storage.operations, ["read", "write", "read", "delete-legacy"]);
    assert.equal(storage.legacy(), undefined);
    assert.deepEqual(entries(storage.start()), { current: "dedicated copy", legacy: "downgrade copy" });
});

test("S03 retains the legacy copy when dedicated readback throws after writing the merge", t => {
    const now = Date.now();
    const current = cachePayload(now - 200, [cacheEntry("current", "dedicated copy", now - 300)]);
    const legacy = cachePayload(now - 100, [cacheEntry("legacy", "downgrade copy", now - 150)]);
    const storage = openStorage(t, { current, legacy });
    storage.faults.afterWrite = () => { storage.faults.unreadable = true; };
    const plugin = storage.create();

    assert.equal(plugin.migrateLegacyDataStoreKey(CACHE_DATA_KEY), "store-unreadable");
    assert.deepEqual(storage.operations, ["read", "write", "read"]);
    assert.ok(plugin.dataLoadFailures.has(CACHE_DATA_KEY));
    assert.deepEqual(storage.legacy(), legacy);

    storage.faults.unreadable = false;
    storage.faults.afterWrite = null;
    storage.operations.length = 0;
    assert.equal(storage.create().migrateLegacyDataStoreKey(CACHE_DATA_KEY), "merged");
    assert.deepEqual(storage.operations, ["read", "delete-legacy"]);
    assert.equal(storage.legacy(), undefined);
    assert.deepEqual(entries(storage.start()), { current: "dedicated copy", legacy: "downgrade copy" });
});

test("S03 retries a legacy copy that changes during the merge even if its savedAt is unchanged", t => {
    const now = Date.now();
    const current = cachePayload(now - 200, [cacheEntry("current", "dedicated copy", now - 300)]);
    const legacy = cachePayload(now - 100, [cacheEntry("legacy", "downgrade copy", now - 150)]);
    const updatedLegacy = {
        ...legacy,
        entries: [...legacy.entries, cacheEntry("arrived", "new legacy translation", legacy.savedAt)]
    };
    const storage = openStorage(t, { current, legacy });
    storage.faults.afterWrite = () => storage.putLegacy(updatedLegacy);

    assert.equal(storage.create().migrateLegacyDataStoreKey(CACHE_DATA_KEY), "legacy-changed");
    assert.deepEqual(storage.operations, ["read", "write", "read"]);
    assert.deepEqual(storage.legacy(), updatedLegacy);

    storage.faults.afterWrite = null;
    storage.operations.length = 0;
    assert.equal(storage.create().migrateLegacyDataStoreKey(CACHE_DATA_KEY), "merged");
    assert.deepEqual(storage.operations, ["read", "write", "read", "delete-legacy"]);
    assert.equal(storage.legacy(), undefined);
    assert.deepEqual(entries(storage.start()), {
        current: "dedicated copy",
        legacy: "downgrade copy",
        arrived: "new legacy translation"
    });
});

test("S03 an explicit clear survives ordinary saves and admits only new downgrade entries", t => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const legacy = cachePayload(now - 500, [cacheEntry("stale-legacy", "legacy before clear", now - 1000)]);
    const storage = openStorage(t, {
        current: cachePayload(now - 800, [cacheEntry("stale-current", "current before clear", now - 1200)]),
        legacy
    });
    storage.faults.rejectWrites = 1;
    const plugin = storage.start();
    assert.equal(plugin.clearTranslationCache(), true);
    const clearedAt = now;
    assert.deepEqual(storage.legacy(), legacy);
    assert.deepEqual(storage.current().entries, []);

    now += 100;
    plugin.setTranslationCache("fresh-current", "current after clear");
    now += 300;
    assert.equal(flush(plugin), true);
    assert.equal(storage.current().clearedAt, clearedAt);
    storage.putLegacy(cachePayload(now - 100, [
        cacheEntry("stale-legacy", "legacy before clear", now - 150, { createdAt: clearedAt - 1000 }),
        cacheEntry("fresh-legacy", "legacy after clear", now - 120)
    ]));
    plugin.stop();
    assert.deepEqual(entries(storage.start()), {
        "fresh-current": "current after clear",
        "fresh-legacy": "legacy after clear"
    });
    assert.equal(storage.legacy(), undefined);
});

test("S03 an old-version empty clear filters previously created entries despite a later ordinary save", t => {
    const now = Date.now();
    const storage = openStorage(t, {
        current: cachePayload(now, [
            cacheEntry("before-clear", "touched again after clear", now - 50, { createdAt: now - 200 }),
            cacheEntry("after-clear", "created after clear", now - 20)
        ]),
        legacy: cachePayload(now - 100, [])
    });
    const plugin = storage.start();
    assert.deepEqual(entries(plugin), { "after-clear": "created after clear" });
    assert.equal(storage.current().clearedAt, now - 100);
    assert.equal(storage.legacy(), undefined);
});

for (const firstCopy of [true, false]) {
    test(`S03 retries a failed legacy delete after ${firstCopy ? "the initial copy" : "a merge"} without rewriting or reviving removed entries`, t => {
        const now = Date.now();
        const legacy = cachePayload(now - 200, [
            cacheEntry("removed", "remove from current cache", now - 500),
            cacheEntry("keep", "keep from legacy", now - 400)
        ]);
        const current = firstCopy ? undefined : cachePayload(now - 150, [
            cacheEntry("current", "already in dedicated cache", now - 300)
        ]);
        const storage = openStorage(t, { current, legacy });
        storage.faults.rejectDeletes = true;
        const plugin = storage.start();
        assert.deepEqual(storage.legacy(), legacy);
        assert.equal(plugin.translationCache.get("keep"), "keep from legacy");
        assert.equal(plugin.deleteTranslationCacheCandidates("removed"), true);
        assert.equal(flush(plugin), true);
        const committed = storage.current();
        assert.ok(committed.mergedLegacy?.fingerprint);
        plugin.stop();

        storage.faults.rejectDeletes = false;
        storage.faults.rejectWrites = 1;
        storage.operations.length = 0;
        assert.equal(storage.create().migrateLegacyDataStoreKey(CACHE_DATA_KEY), "merged");
        assert.deepEqual(storage.operations, ["read", "delete-legacy"]);
        assert.deepEqual(storage.current(), committed);
        assert.equal(storage.legacy(), undefined);
        const reloaded = storage.start();
        assert.equal(reloaded.translationCache.has("removed"), false);
        assert.equal(reloaded.translationCache.get("keep"), "keep from legacy");
    });
}

test("S03 startup merges a later downgrade with dirty in-memory entries after a failed stop save", t => {
    let now = Date.now();
    t.mock.method(Date, "now", () => now);
    const storage = openStorage(t, {
        current: cachePayload(now - 100, [
            cacheEntry("updated", "older value from current version", now - 150)
        ]),
        legacy: cachePayload(now - 200, [cacheEntry("legacy-old", "previously merged", now - 300)])
    });
    const plugin = storage.start();
    assert.equal(storage.legacy(), undefined);
    plugin.setTranslationCache("pending", "unsaved value");
    storage.faults.rejectWrites = 1;
    plugin.stop();
    assert.ok(plugin.translationCacheDirty);

    now += 100;
    storage.putLegacy(cachePayload(now, [
        cacheEntry("updated", "newer value from downgrade", now - 50),
        cacheEntry("legacy-new", "new from downgrade", now - 60)
    ]));
    storage.start(plugin);
    const expected = {
        "legacy-old": "previously merged",
        "legacy-new": "new from downgrade",
        pending: "unsaved value",
        updated: "newer value from downgrade"
    };
    assert.deepEqual(entries(plugin), expected);
    assert.equal(storage.legacy(), undefined);
    plugin.stop();
    assert.deepEqual(entries(storage.start()), expected);
});

test("S03 pure-JS cache receipt SHA-256 matches node:crypto without requiring node:crypto at runtime", t => {
    const { createHash } = require("node:crypto");
    const plugin = new Plugin();
    const samples = [
        { savedAt: 0, entries: [] },
        { savedAt: 123456789, entries: [["k1", "你好世界 🌍🎉", 1, 2, 3]] },
        { savedAt: 999, entries: Array.from({ length: 12 }, (_, index) => [`key-${index}`, "长文本边界测试".repeat(9), index]) }
    ];
    for (const sample of samples) {
        const expected = createHash("sha256").update(JSON.stringify(sample), "utf8").digest("hex");
        assert.equal(plugin.translationCacheStore.getLegacyTranslationCacheReceipt(sample).fingerprint, expected);
    }
    const originalTextEncoder = globalThis.TextEncoder;
    Object.defineProperty(globalThis, "TextEncoder", { configurable: true, writable: true, value: undefined });
    t.after(() => {
        Object.defineProperty(globalThis, "TextEncoder", { configurable: true, writable: true, value: originalTextEncoder });
    });
    for (const sample of samples) {
        const expected = createHash("sha256").update(JSON.stringify(sample), "utf8").digest("hex");
        assert.equal(plugin.translationCacheStore.getLegacyTranslationCacheReceipt(sample).fingerprint, expected);
    }
});
