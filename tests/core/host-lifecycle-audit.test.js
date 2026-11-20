"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { el } = require("../fixtures/fake-dom");
const { CHANNEL, createFakeDataApi, installChatGlobals } = require("../fixtures/chat-harness");

function createHostFixture(t, host = {}) {
    const { document, restore } = installChatGlobals({ bdApi: { ...createFakeDataApi(), ...host } });
    const observers = [];
    const savedObserver = Object.getOwnPropertyDescriptor(globalThis, "MutationObserver");
    globalThis.MutationObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.targets = new Map();
            observers.push(this);
        }
        observe(target, options) { this.targets.set(target, options); }
        disconnect() { this.targets.clear(); }
    };
    t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
    const plugin = new Plugin();
    Object.assign(plugin, { injectStyles() {}, removeStyles() {}, queueScan() {}, showToast() {} });
    t.mock.method(plugin.panelTheme, "startWatching", () => {});
    t.after(() => {
        try {
            if (plugin.isStarted) plugin.stop();
        }
        finally {
            if (savedObserver) Object.defineProperty(globalThis, "MutationObserver", savedObserver);
            else delete globalThis.MutationObserver;
            restore();
        }
    });
    const childList = (target, { addedNodes = [], removedNodes = [] } = {}) => {
        for (const observer of observers) {
            const observed = [...observer.targets].some(([root, options]) =>
                options.childList && (root === target || (options.subtree && root.contains(target))));
            if (observed) observer.callback([{ type: "childList", target, addedNodes, removedNodes }]);
        }
    };
    return { plugin, document, childList };
}

function createMount({ mountIsChat = false } = {}) {
    const textbox = el("div", { "data-slate-editor": "true", role: "textbox", contenteditable: "true" });
    const composer = el("form", { class: "channelTextArea_test" }, [textbox]);
    const mount = el("div", { id: "app-mount" }, [composer]);
    const chat = mountIsChat ? mount : mount.appendChild(el("main"));
    chat.className = "chatContent_test";
    return { mount, chat, textbox };
}

for (const layout of ["direct mount", "nested mount", "mount as chat root"]) {
    test(`H05 rebinds after replacing the ${layout} and scans the new composer`, t => {
        const { plugin, document, childList } = createHostFixture(t);
        const parent = layout === "nested mount" ? document.body.appendChild(el("div")) : document.body;
        const options = { mountIsChat: layout === "mount as chat root" };
        const previous = createMount(options);
        parent.appendChild(previous.mount);
        const inject = t.mock.method(plugin, "injectInputButtons", () => document.querySelector("[data-slate-editor='true']"));
        const queueScan = t.mock.method(plugin, "queueScan");
        const queueMutationScan = t.mock.method(plugin, "queueMutationScan", () => {});

        assert.equal(plugin.start(), true);
        plugin.settings.ui.injectInputButton = true;
        const previousObserver = plugin.observer;
        const previousLifecycle = plugin.observerLifecycle;
        assert.equal(plugin.observerRoot, previous.chat);
        assert.equal(previousObserver.targets.get(previous.chat)?.characterData, true);
        assert.equal(previousObserver.targets.get(document.body)?.childList, false);
        assert.deepEqual(previousLifecycle.targets.get(document.body), { childList: true, subtree: false });

        queueScan.mock.resetCalls();
        const unrelated = document.body.appendChild(el("div"));
        childList(document.body, { addedNodes: [unrelated] });
        assert.equal(plugin.observerRebindTimer, null);
        assert.equal(queueMutationScan.mock.callCount(), 0);

        const replacement = createMount(options);
        previous.mount.remove();
        parent.appendChild(replacement.mount);
        childList(parent, { addedNodes: [replacement.mount], removedNodes: [previous.mount] });

        assert.equal(previous.chat.isConnected, false);
        assert.ok(plugin.observerRebindTimer);
        t.mock.timers.tick(40);
        assert.equal(plugin.observerRoot, replacement.chat);
        assert.equal(plugin.observer.targets.get(replacement.chat)?.subtree, true);
        assert.equal(previousObserver.targets.size, 0);
        assert.equal(previousLifecycle.targets.size, 0);
        assert.equal(queueScan.mock.callCount(), 1);
        t.mock.timers.tick(120);
        assert.deepEqual(inject.mock.calls.map(call => call.result), [replacement.textbox]);

        inject.mock.resetCalls();
        const newText = replacement.textbox.appendChild(document.createTextNode("New draft"));
        childList(replacement.textbox, { addedNodes: [newText] });
        t.mock.timers.tick(500);
        assert.deepEqual(inject.mock.calls.map(call => call.result), [replacement.textbox]);
        assert.equal(queueMutationScan.mock.callCount(), 0);

        const message = replacement.chat.appendChild(el("li", { id: `chat-messages-${CHANNEL}-300000000000000201` }));
        childList(replacement.chat, { addedNodes: [message] });
        assert.equal(queueMutationScan.mock.callCount(), 1);

        const activeObserver = plugin.observer;
        const activeLifecycle = plugin.observerLifecycle;
        replacement.mount.remove();
        childList(parent, { removedNodes: [replacement.mount] });
        assert.ok(plugin.observerRebindTimer);
        plugin.stop();
        t.mock.timers.tick(1000);
        assert.equal(activeObserver.targets.size, 0);
        assert.equal(activeLifecycle.targets.size, 0);
        assert.equal(plugin.observerRoot, null);
        assert.equal(queueScan.mock.callCount(), 1);
        assert.equal(inject.mock.callCount(), 1);
    });
}

function messageStoreAvailable(plugin) {
    return plugin.runHostHealthCheck().checks.find(check => check.id === "stores").meta.messageStore;
}

test("H08 shares Store resolution with health and refreshes hits, misses and message identities on restart", t => {
    const authorId = "400000000000000001";
    const text = "The test service has restarted.";
    const first = { id: "300000000000000201", channel_id: CHANNEL, author: { id: authorId }, content: text };
    const next = { ...first, id: "300000000000000202" };
    const firstStore = { getMessages: () => [first] };
    const nextStore = { getMessages: () => [next] };
    let currentStore = firstStore;
    const lookups = [];
    const { plugin } = createHostFixture(t, {
        Webpack: {
            getStore(name) {
                if (name !== "MessageStore") return null;
                lookups.push(currentStore);
                return currentStore;
            }
        }
    });
    const resolveStore = t.mock.method(plugin, "getDiscordMessageStore");
    const messageNode = el("li", { "data-author-id": authorId });
    const content = messageNode.appendChild(el("div", {}, [text]));

    assert.equal(plugin.start(), true);
    assert.deepEqual(plugin.getDiscordMessageStoreMessages(CHANNEL), [first]);
    const firstIdentity = plugin.getMessageIdentity(messageNode, content, text);
    assert.equal(firstIdentity.split(":")[3], first.id);
    currentStore = null;
    assert.equal(messageStoreAvailable(plugin), true);
    assert.equal(resolveStore.mock.calls.at(-1).result, firstStore);
    assert.deepEqual(lookups, [firstStore]);

    plugin.stop();
    assert.equal(messageStoreAvailable(plugin), false);
    assert.deepEqual(plugin.getDiscordMessageStoreMessages(CHANNEL), []);
    assert.match(plugin.getMessageIdentity(messageNode, content, text), /^fallback:/);
    currentStore = nextStore;
    assert.equal(plugin.getDiscordMessageStore(), null);
    assert.deepEqual(lookups, [firstStore, null]);

    assert.equal(plugin.start(), true);
    assert.equal(messageStoreAvailable(plugin), true);
    assert.equal(resolveStore.mock.calls.at(-1).result, nextStore);
    assert.deepEqual(plugin.getDiscordMessageStoreMessages(CHANNEL), [next]);
    assert.equal(plugin.getMessageIdentity(messageNode, content, text).split(":")[3], next.id);
    assert.deepEqual(lookups, [firstStore, null, nextStore]);
});

test("H08 discards a Store cached by diagnostics before start", t => {
    const firstStore = { getMessages: () => [] };
    const nextStore = { getMessages: () => [] };
    let currentStore = firstStore;
    const { plugin } = createHostFixture(t, {
        Webpack: { getStore: name => name === "MessageStore" ? currentStore : null }
    });
    assert.equal(messageStoreAvailable(plugin), true);
    assert.equal(plugin.getDiscordMessageStore(), firstStore);
    currentStore = nextStore;
    assert.equal(plugin.start(), true);
    assert.equal(plugin.getDiscordMessageStore(), nextStore);
});

for (const resolution of ["named", "Webpack keys", "legacy props"]) {
    test(`H08 resolves ${resolution} and reads older channel collection shapes`, t => {
        const record = { messageId: "300000000000000201", channelId: CHANNEL, content: "Synthetic message" };
        let collection;
        const store = {
            getMessagesForChannel(channelId) {
                assert.equal(this, store);
                assert.equal(channelId, CHANNEL);
                return collection;
            }
        };
        const keys = ["getMessage", "getMessages"];
        const lookups = [];
        const { plugin } = createHostFixture(t, {
            Webpack: {
                getStore(name) {
                    if (name !== "MessageStore") return null;
                    lookups.push("named");
                    if (resolution === "legacy props") throw new Error("Named stores unavailable");
                    return resolution === "named" ? store : { getMessage() {} };
                },
                getByKeys(...properties) {
                    assert.deepEqual(properties, keys);
                    lookups.push("Webpack keys");
                    return resolution === "Webpack keys" ? store : null;
                }
            },
            findModuleByProps(...properties) {
                assert.deepEqual(properties, keys);
                lookups.push("legacy props");
                return store;
            }
        });
        t.mock.method(plugin, "warnSanitized", () => {});
        assert.equal(messageStoreAvailable(plugin), true);
        assert.equal(plugin.getDiscordMessageStore(), store);

        for (const shape of [
            [record, null],
            { _array: [record] },
            { messages: [record] },
            { toArray: () => [record] },
            { valueSeq: () => ({ toArray: () => [record] }) },
            new Map([[record.messageId, record]]),
            { forEach: callback => callback(record) },
            { _map: { [record.messageId]: record } },
            { [record.messageId]: record }
        ]) {
            collection = shape;
            assert.deepEqual(plugin.getDiscordMessageStoreMessages(CHANNEL), [record]);
        }
        assert.equal(lookups.at(-1), resolution);
        assert.deepEqual(lookups, ["named", "Webpack keys", "legacy props"].slice(0, lookups.length));
    });
}
