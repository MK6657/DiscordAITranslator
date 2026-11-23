"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { DiscordStores } = require("../../src/discord/stores");
const {
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_IDLE_PERSIST_MS,
    TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS
} = require("../../src/constants");

test("drainAutoTranslationQueue terminates immediately on terminal auth/quota failures instead of looping", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-synth-term-1";
    plugin.settings.ui.autoTranslateMessages = true;

    const requestOptions = plugin.getAutoTranslationOptions();
    const providerKey = plugin.getAutoTranslationProviderKey(requestOptions);
    plugin.autoTranslationProviderFailures.set(providerKey, {
        at: Date.now(),
        retryAt: 0,
        terminal: true,
        type: "auth",
        count: 1
    });

    const makeItem = idx => {
        const messageNode = { isConnected: true, querySelector: () => null };
        const content = { isConnected: true, querySelector: () => null };
        const cacheKey = `term-key-${idx}`;
        plugin.autoTranslationQueuedKeys.add(cacheKey);
        plugin.autoTranslationPendingTargets.set(cacheKey, { targets: [{ messageNode, content, priority: idx }] });
        return { cacheKey, text: `Hello ${idx}`, requestOptions, messageNode, content };
    };
    // 8 visible items (> 1 batch of 6) so discardAutoTranslationProviderWork must also discard remaining visible items.
    plugin.autoTranslationQueue = [1, 2, 3, 4, 5, 6, 7, 8].map(makeItem);
    plugin.shouldRetainAutoTranslationProviderBlockedItem = () => true;
    plugin.getReadyAutoTranslationTargets = item => [{ messageNode: item.messageNode, content: item.content, priority: 1 }];
    let retryScans = 0;
    plugin.scheduleAutoTranslationRetryScan = () => { retryScans++; };

    plugin.drainAutoTranslationQueue();

    assert.equal(plugin.autoTranslationQueue.length, 0, "terminal auth failure discards ALL queued visible items across batches");
    assert.equal(plugin.autoTranslationPendingTargets.size, 0, "pending targets are cleared");
    assert.equal(retryScans, 0, "no pointless retry scan scheduled for terminal auth error");
});

test("drainAutoTranslationQueue handles non-terminal cooldown in one pass and breaks on blocked prefetch", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-synth-cool-1";
    plugin.settings.ui.autoTranslateMessages = true;

    const requestOptions = plugin.getAutoTranslationOptions();
    const providerKey = plugin.getAutoTranslationProviderKey(requestOptions);
    const now = Date.now();
    plugin.autoTranslationProviderFailures.set(providerKey, {
        at: now,
        retryAt: now + 30_000,
        terminal: false,
        type: "rate-limit",
        count: 1
    });

    // 8 visible items (> batch size 6) so a buggy continue-loop would pop 2+ batches.
    const items = [1, 2, 3, 4, 5, 6, 7, 8].map(idx => {
        const messageNode = { isConnected: true, querySelector: () => null };
        const content = { isConnected: true, querySelector: () => null };
        const cacheKey = `cool-key-${idx}`;
        plugin.autoTranslationQueuedKeys.add(cacheKey);
        plugin.autoTranslationPendingTargets.set(cacheKey, { targets: [{ messageNode, content, priority: idx, prefetch: false }] });
        return { cacheKey, text: `Hi ${idx}`, requestOptions, messageNode, content, prefetch: false };
    });
    plugin.autoTranslationQueue = [...items];
    plugin.getReadyAutoTranslationTargets = item => [{ messageNode: item.messageNode, content: item.content, priority: 1, prefetch: false }];
    plugin.isAutoTranslationPrefetchItem = () => false;
    let takeCalls = 0;
    const originalTake = plugin.takeAutoTranslationBatch.bind(plugin);
    plugin.takeAutoTranslationBatch = opts => {
        takeCalls++;
        return originalTake(opts);
    };
    const scheduledDelays = [];
    plugin.scheduleAutoTranslationRetryScan = delay => scheduledDelays.push(delay);

    plugin.drainAutoTranslationQueue();

    assert.equal(takeCalls, 1, "does not spin batch-by-batch across 8 items during provider cooldown");
    assert.equal(plugin.autoTranslationQueue.length, 8, "all 8 queued items are preserved for retry");
    assert.ok(plugin.autoTranslationQueue.every(item => Number(item.daitRequeueAfter) > now));
    assert.equal(scheduledDelays.length, 1);
    assert.ok(scheduledDelays[0] >= 1000);
});

test("runModelTaskWithResult does not leak 90s generation timeoutMs into shared local /v1/models detection", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.provider = "sakuraLocal";
    plugin.settings.translation.endpoint = "http://127.0.0.1:18080/v1/chat/completions";
    plugin.settings.translation.model = "local-model";

    let capturedProbeOptions = null;
    plugin.refreshLocalProviderDetectedModel = async (config, options) => {
        capturedProbeOptions = options;
        return "HY-MT1.5-7B.gguf";
    };
    plugin.fetchModelResponse = async () => "你好";

    await plugin.runModelTaskWithResult("translation", "Hello", { timeoutMs: 90_000 });

    assert.ok(capturedProbeOptions, "local model detection ran");
    assert.equal(capturedProbeOptions.timeoutMs, undefined, "generation timeoutMs must not override 5s probe timeout");
});

test("autoTranslateQueuedBatch releases overflow fallback items early without leaking in-flight counters", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-synth-batch-1";
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.settings.ui.autoTranslateStrictRetry = true;
    plugin.drainAutoTranslationQueue = () => {};
    plugin.queueScan = () => {};

    const requestOptions = plugin.getAutoTranslationOptions();
    const items = [1, 2, 3, 4, 5].map(idx => {
        const messageNode = { isConnected: true, querySelector: () => null };
        const content = { isConnected: true, querySelector: () => null };
        const item = {
            cacheKey: `batch-key-${idx}`,
            text: `Message ${idx}`,
            requestOptions,
            messageNode,
            content,
            daitPrefetchRequest: false
        };
        plugin.markAutoTranslationInFlightItem(item);
        return item;
    });
    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = items.length;

    // Batch call triggers fallback; batch retry skips; fallback runs 3 items and requeues 2.
    plugin.runAutoTranslationBatchTask = async () => {
        const err = new Error("unusable batch");
        err.autoBatchFallback = true;
        throw err;
    };
    plugin.runAutoTranslationBatchRetryItems = async () => {};
    plugin.requeueAutoTranslationItem = item => {
        item.daitRequeued = true;
        // Simulate another drain picking up the requeued item immediately and overwriting its token.
        plugin.autoTranslationInFlightTokens.set(item.cacheKey, Symbol("new-owner"));
    };
    plugin.runAutoTranslationStrictFallbackTask = async text => `译:${text}`;
    plugin.renderAutoTranslationResultSafely = () => {};

    await plugin.autoTranslateQueuedBatch(items);

    assert.equal(plugin.autoTranslationInFlight, 0, "batch concurrency slot released cleanly");
    assert.equal(plugin.autoTranslationInFlightItems, 0, "no leaked in-flight item counts");
});

test("mediaMutationElementHasTextCandidate reads textContent without touching innerText (no forced layout)", () => {
    const plugin = new Plugin();
    let innerTextRead = false;
    const el = {
        nodeType: 1,
        textContent: "Hello world",
        get innerText() {
            innerTextRead = true;
            throw new Error("innerText triggers forced layout");
        }
    };
    assert.equal(plugin.mediaMutationElementHasTextCandidate(el), true);
    assert.equal(innerTextRead, false);
});

test("DiscordStores.getMessageStore caches fallback Webpack.getByKeys lookups (hits and misses)", t => {
    const savedBdApi = Object.getOwnPropertyDescriptor(globalThis, "BdApi");
    t.after(() => {
        if (savedBdApi) Object.defineProperty(globalThis, "BdApi", savedBdApi);
        else delete globalThis.BdApi;
    });

    let byKeysCalls = 0;
    let storeResult = null;
    globalThis.BdApi = {
        Webpack: {
            getStore: () => null,
            getByKeys: () => {
                byKeysCalls++;
                return storeResult;
            }
        }
    };

    const stores = new DiscordStores(null);
    assert.equal(stores.getMessageStore(), null);
    assert.equal(stores.getMessageStore(), null);
    assert.equal(byKeysCalls, 1, "negative lookup is cached");

    stores.clearCache();
    storeResult = { getMessage: () => null, getMessages: () => null };
    assert.equal(stores.getMessageStore(), storeResult);
    assert.equal(stores.getMessageStore(), storeResult);
    assert.equal(byKeysCalls, 2, "positive lookup is cached");
});

test("touchTranslationCache avoids 5s/30s write storms on read-only hits whose expiry does not extend", t => {
    const plugin = new Plugin();
    t.after(() => clearTimeout(plugin.translationCacheDirtyTimer));
    const scheduledDelays = [];
    plugin.scheduleTranslationCachePersist = delay => {
        plugin.translationCacheDirty = true;
        scheduledDelays.push(delay);
    };

    const now = Date.now();
    // Fresh entry with 48h TTL: hit extension (6h) does not advance expiresAt.
    plugin.translationCache.set("fresh-key", "你好");
    plugin.translationCacheMeta.set("fresh-key", {
        createdAt: now,
        touchedAt: now,
        expiresAt: now + 48 * 60 * 60 * 1000
    });
    for (let i = 0; i < TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD + 5; i++) {
        plugin.touchTranslationCache("fresh-key", { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
    }
    assert.equal(plugin.translationCacheDirty, true, "dirty flag still marks LRU update for shutdown flush");
    assert.equal(plugin.translationCacheTouchDirtyCount, 0, "non-extending hits do not increment write-storm counter");
    assert.ok(
        scheduledDelays.every(delay => delay >= TRANSLATION_CACHE_TOUCH_IDLE_PERSIST_MS),
        "non-extending hits schedule only low-frequency idle persistence"
    );

    // Near-expiry entry (1h left): hit extends expiresAt to now + 6h and preserves normal 30s / 5s threshold.
    scheduledDelays.length = 0;
    plugin.translationCache.set("expiring-key", "世界");
    plugin.translationCacheMeta.set("expiring-key", {
        createdAt: now - 47 * 60 * 60 * 1000,
        touchedAt: now - 60_000,
        expiresAt: now + 60 * 60 * 1000
    });
    plugin.touchTranslationCache("expiring-key", { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
    assert.equal(scheduledDelays[0], TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS);
    assert.equal(plugin.translationCacheTouchDirtyCount, 1);

    plugin.translationCacheTouchDirtyCount = TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD - 1;
    plugin.translationCacheMeta.get("expiring-key").expiresAt = now + 60 * 60 * 1000;
    plugin.touchTranslationCache("expiring-key", { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
    assert.equal(scheduledDelays[1], TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
});

test("getTranslationCacheAliases computes config parts once and matches legacy builder outputs", () => {
    const plugin = new Plugin();
    plugin.settings.translation.provider = "openaiCompatible";
    plugin.settings.translation.endpoint = "https://example.invalid/v1/chat/completions";
    plugin.settings.translation.model = "demo-model";

    let compactCalls = 0;
    const origCompact = plugin.getCompactTranslationCacheConfigParts.bind(plugin);
    plugin.getCompactTranslationCacheConfigParts = config => {
        compactCalls++;
        return origCompact(config);
    };

    const options = { mode: "auto", messageIdentity: "ch1:m1" };
    const aliases = plugin.getTranslationCacheAliases("Hello world", options);

    assert.equal(compactCalls, 1, "compact config/prompt hashes are computed only once per getTranslationCacheAliases call");
    assert.equal(aliases.includes(plugin.getLegacyTranslationCacheKey("Hello world", options)), true);
    assert.equal(aliases.includes(plugin.getFullConfigTranslationCacheKey("Hello world", options)), true);
    assert.equal(aliases.includes(plugin.getPreMessageIdentityTranslationCacheKey("Hello world", options)), true);
    assert.equal(aliases.includes(plugin.getPreMessageIdentityTranslationCacheKey("Hello world", options, undefined, { fullConfig: true })), true);
});

test("processAutoTranslationScanCandidates defers per-item queue sort until finishAutoTranslationScanWork", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.drainAutoTranslationQueue = () => {};
    plugin.withAutoTranslationPriority = item => ({ ...item, priority: item.priority ?? 10 });

    let sortCalls = 0;
    const origSort = plugin.sortAutoTranslationQueue.bind(plugin);
    plugin.sortAutoTranslationQueue = () => {
        sortCalls++;
        return origSort();
    };

    const scanState = { queueLimit: 50, queued: 0, apiWorkBlocked: false };
    const scanStats = { seen: 0, eligible: 0, enqueued: 0, blocked: 0, failures: 0, cacheHits: 0, textCacheHits: 0, visibleDeferred: 0 };
    const work = { scanState, scanStats, context: {}, requestOptions: { mode: "auto" } };
    plugin.evaluateAutoTranslationCandidate = (candidate, state) => ({
        action: "enqueue",
        cacheKey: candidate.cacheKey,
        requestOptions: { mode: "auto" },
        targetVisible: true,
        scanState: state
    });

    const candidates = [30, 10, 20].map((priority, idx) => ({
        cacheKey: `scan-key-${idx}`,
        text: `Message ${idx}`,
        messageNode: { isConnected: true },
        content: { isConnected: true },
        priority
    }));

    plugin.processAutoTranslationScanCandidates(work, candidates);
    assert.equal(sortCalls, 0, "no redundant O(N^2) sorts while scanning candidates");
    assert.equal(plugin.autoTranslationQueue.length, 3);

    plugin.finishAutoTranslationScanWork(work);
    assert.equal(sortCalls, 1, "sorts queued items once when scan batch completes");
    assert.deepEqual(plugin.autoTranslationQueue.map(i => i.priority), [10, 20, 30]);
});

test("isDiscordMediaViewerElement fast-rejects layers enclosing observerRoot without subtree queries", () => {
    const plugin = new Plugin();
    const chatRoot = { nodeType: 1 };
    plugin.observerRoot = chatRoot;

    let queried = false;
    const appLayer = {
        nodeType: 1,
        contains: node => node === chatRoot,
        matches: () => false,
        closest: () => null,
        querySelector: () => {
            queried = true;
            return null;
        }
    };

    assert.equal(plugin.isDiscordMediaViewerElement(appLayer), false);
    assert.equal(queried, false, "skips expensive DOM message/media subtree queries on app/chat root layers");
});

test("buildHostHealthCard supports lazy rendering until the Data tab becomes active", () => {
    const { buildHostHealthCard } = require("../../src/ui/host-health-card");
    const savedDoc = globalThis.document;
    try {
        const makeEl = tag => ({
            tagName: tag.toUpperCase(),
            className: "",
            dataset: {},
            children: [],
            textContent: "",
            title: "",
            firstChild: null,
            setAttribute() {},
            addEventListener() {},
            appendChild(child) {
                this.children.push(child);
                this.firstChild = this.children[0] || null;
                return child;
            },
            remove() {}
        });
        globalThis.document = { createElement: makeEl };

        const plugin = new Plugin();
        let healthChecks = 0;
        plugin.runHostHealthCheck = () => {
            healthChecks++;
            return { summary: { overall: "ok", ok: 1, warn: 0, error: 0, total: 1 }, checks: [] };
        };

        const lazyCard = buildHostHealthCard(plugin, { lazy: true });
        assert.equal(healthChecks, 0, "lazy card does not probe host while Data tab is hidden");
        lazyCard.__daitEnsureHostHealthRendered();
        assert.equal(healthChecks, 1, "first tab visit triggers host health check");
        lazyCard.__daitEnsureHostHealthRendered();
        assert.equal(healthChecks, 1, "subsequent calls reuse existing report until user clicks Recheck");

        const eagerCard = buildHostHealthCard(plugin);
        assert.ok(eagerCard);
        assert.equal(healthChecks, 2, "standalone non-lazy callers retain immediate render");
    }
    finally {
        globalThis.document = savedDoc;
    }
});

test("takeAutoTranslationBatch sorts dirty deferred queue even if incremental scan is cancelled before finish", () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.withAutoTranslationPriority = item => ({ ...item, priority: item.priority ?? 10 });
    plugin.getReadyAutoTranslationTargets = item => [{ messageNode: item.messageNode, content: item.content, priority: item.priority }];
    plugin.isAutoTranslationPrefetchItem = () => false;
    plugin.getAutoTranslationRequestBatchSize = () => 2;

    const requestOptions = plugin.getAutoTranslationOptions();
    const enqueue = (idx, priority) => plugin.enqueueAutoTranslationItem({
        cacheKey: `dirty-sort-${idx}`,
        text: `Message ${idx}`,
        requestOptions,
        messageNode: { isConnected: true },
        content: { isConnected: true },
        priority
    }, { deferSort: true, skipPrune: true });

    enqueue(1, 50);
    enqueue(2, 5);
    enqueue(3, 20);
    assert.equal(plugin.autoTranslationQueueSortDirty, true);

    // Simulate incremental scan cancellation before finishAutoTranslationScanWork:
    const batch = plugin.takeAutoTranslationBatch();
    assert.equal(plugin.autoTranslationQueueSortDirty, false);
    assert.deepEqual(batch.map(item => item.priority), [5, 20], "highest-priority items are dequeued first");
});

test("autoTranslateQueuedBatch does not steal another batch's in-flight slot after partial early release and stale prune", async () => {
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.settings.translation.provider = "deepseek";
    plugin.settings.translation.apiKey = "sk-synth-prune-1";
    plugin.settings.ui.autoTranslateMessages = true;
    plugin.drainAutoTranslationQueue = () => {};
    plugin.queueScan = () => {};

    const requestOptions = plugin.getAutoTranslationOptions();
    const makeItem = idx => {
        const item = {
            cacheKey: `prune-key-${idx}`,
            text: `Msg ${idx}`,
            requestOptions,
            messageNode: { isConnected: true, querySelector: () => null },
            content: { isConnected: true, querySelector: () => null }
        };
        plugin.markAutoTranslationInFlightItem(item);
        return item;
    };
    const items = [1, 2, 3, 4].map(makeItem);
    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = items.length;

    let releaseFallback;
    const fallbackBarrier = new Promise(resolve => { releaseFallback = resolve; });
    plugin.runAutoTranslationBatchTask = async () => {
        const err = new Error("fallback");
        err.autoBatchFallback = true;
        throw err;
    };
    plugin.runAutoTranslationBatchRetryItems = async () => {};
    plugin.requeueAutoTranslationItem = item => { item.daitRequeued = true; };
    plugin.runAutoTranslationStrictFallbackTask = async () => {
        await fallbackBarrier;
        return "译文";
    };
    plugin.renderAutoTranslationResultSafely = () => {};

    const batchPromise = plugin.autoTranslateQueuedBatch(items);
    // Let batch reach fallback where item 4 is released early and item 1 awaits fallbackBarrier.
    await new Promise(resolve => setTimeout(resolve, 20));

    // Simulate remaining items 1..3 timing out as stale-in-flight and pruning resetting inFlight to 0.
    for (const key of plugin.autoTranslationInFlightKeys) {
        plugin.autoTranslationInFlightStartedAt.set(key, 1);
    }
    plugin.pruneAutoTranslationActiveState();
    assert.equal(plugin.autoTranslationInFlight, 0);

    // Simulate Batch2 starting on the same config version.
    const batch2Item = makeItem(99);
    plugin.autoTranslationInFlight = 1;
    plugin.autoTranslationInFlightItems = 1;

    // Now Batch1's hung fallback settles.
    releaseFallback();
    await batchPromise;

    assert.equal(plugin.autoTranslationInFlight, 1, "Batch2's active concurrency slot must remain intact");
    assert.equal(plugin.autoTranslationInFlightItems, 1, "Batch2's active item count must remain intact");
    assert.ok(plugin.autoTranslationInFlightKeys.has(batch2Item.cacheKey));
});
