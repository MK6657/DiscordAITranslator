"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { el } = require("../fixtures/fake-dom");
const { CHANNEL, GUILD, createFakeDataApi, createV030Settings, installChatGlobals } = require("../fixtures/chat-harness");

const MESSAGE_ID = "300000000000000201";
const OTHER_ID = "300000000000000202";
const REPLY_ID = "300000000000000203";
const SOURCE = "Can someone pin the practice schedule for next week";
const TRANSLATED = "有人能把下周的训练安排置顶吗";
const NEW_TRANSLATION = "谁能把下周的训练计划置顶";

function openMessage(t, { preview = false } = {}) {
    const settings = createV030Settings({ remote: true });
    settings.ui.autoTranslateMessages = false;
    settings.ui.translationPosition = "after";
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings } });
    const { document, restore } = installChatGlobals({ bdApi });
    const plugin = new Plugin();
    t.after(() => {
        try {
            if (plugin.isStarted) plugin.stop();
        }
        finally { restore(); }
    });

    const replyLink = el("a", { href: `/channels/${GUILD}/${CHANNEL}/${REPLY_ID}` });
    const content = el("div", { class: preview ? "repliedTextPreview_test" : "markup_test messageContent_test" }, [SOURCE]);
    if (preview) content.appendChild(replyLink);
    const anchor = el("div", {}, [content]);
    anchor.insertBefore = node => anchor.appendChild(node);
    const messageNode = el("li", { id: `chat-messages-${CHANNEL}-${MESSAGE_ID}` }, [anchor]);
    const button = el("button");
    messageNode.appendChild(button);
    document.body.appendChild(messageNode);
    const textOptions = preview ? { includeReplyPreview: true } : null;

    const toasts = [];
    let nextReply = null;
    let modelCalls = 0;
    Object.assign(plugin, {
        injectStyles() {},
        removeStyles() {},
        startObserver() {},
        queueScan() {},
        showToast: (text, type) => toasts.push({ text, type }),
        scheduleTranslationCachePersist() { this.translationCacheDirty = true; },
        runModelTask(_kind, text) {
            modelCalls++;
            const reply = nextReply;
            nextReply = null;
            return reply?.promise || Promise.resolve(text);
        }
    });

    const start = () => {
        assert.equal(plugin.start(), true);
        toasts.length = 0;
    };
    start();

    const line = () => document.querySelector(".dait-translation-line");
    const translate = () => plugin.translateMessage(messageNode, content, button, textOptions);
    const retranslate = () => plugin.retranslateMessage(messageNode, content, textOptions);
    const begin = (run = translate) => {
        const reply = Promise.withResolvers();
        nextReply = reply;
        const done = run();
        assert.equal(nextReply, null, "the manual request reached the model");
        const loading = line();
        assert.ok(loading?.classList.contains("dait-translation-loading"));
        return { ...reply, done, loading };
    };
    const recycle = () => messageNode.setAttribute("id", `chat-messages-${CHANNEL}-${OTHER_ID}`);
    return { plugin, messageNode, content, button, replyLink, textOptions, toasts, start, line, translate, retranslate, begin, recycle, modelCalls: () => modelCalls };
}

function providerError() {
    return Object.assign(new Error("Synthetic provider failure"), { status: 401 });
}

function assertFinalLine(fixture, translated) {
    const line = fixture.line();
    assert.ok(line?.isConnected);
    assert.equal(line.dataset.daitMode, "manual");
    assert.equal(fixture.plugin.getTranslationLineRenderedText(line), translated);
    return line;
}

for (const preview of [false, true]) {
    for (const outcome of ["success", "failure"]) {
        test(`M01 drops a late ${outcome} after the ${preview ? "reply preview's host" : "message"} ID changes with identical text`, async t => {
            const fixture = openMessage(t, { preview });
            const { plugin, messageNode, content, button, textOptions, toasts } = fixture;
            const request = fixture.begin();
            const originalIdentity = plugin.getMessageIdentity(messageNode, content, SOURCE);
            fixture.recycle();
            assert.equal(plugin.getElementText(content, textOptions), SOURCE);
            assert.equal(plugin.getMessageIdentity(messageNode, content, SOURCE) === originalIdentity, preview);
            if (outcome === "success") request.resolve(TRANSLATED);
            else request.reject(providerError());
            await request.done;

            assert.equal(fixture.line(), null);
            assert.equal(button.disabled, false);
            assert.equal(plugin.translationCache.size, 0);
            assert.equal(plugin.autoTranslationProviderFailures.size, 0);
            assert.deepEqual(toasts, []);
        });
    }
}

test("M01 drops a result after navigation to a different route within the same channel", async t => {
    const fixture = openMessage(t);
    const { plugin, messageNode, content } = fixture;
    const request = fixture.begin();
    const identity = plugin.getMessageIdentity(messageNode, content, SOURCE);
    window.location.pathname += `/${OTHER_ID}`;
    assert.equal(plugin.getMessageIdentity(messageNode, content, SOURCE), identity);
    request.resolve(TRANSLATED);
    await request.done;

    assert.equal(fixture.line(), null);
    assert.equal(plugin.translationCache.size, 0);
});

test("M01 drops a reply preview result after the linked message changes", async t => {
    const fixture = openMessage(t, { preview: true });
    const { plugin, content, replyLink, textOptions } = fixture;
    const request = fixture.begin();
    replyLink.setAttribute("href", `/channels/${GUILD}/${CHANNEL}/${OTHER_ID}`);
    assert.equal(plugin.getElementText(content, textOptions), SOURCE);
    request.resolve(TRANSLATED);
    await request.done;

    assert.equal(fixture.line(), null);
    assert.equal(plugin.translationCache.size, 0);
});

test("M01 reads the current body when the DOM text memo still has the old text", async t => {
    const fixture = openMessage(t);
    const { plugin, content } = fixture;
    const request = fixture.begin();
    content.textContent = "The schedule was moved to Thursday.";
    assert.equal(plugin.getElementText(content), SOURCE);
    request.resolve(TRANSLATED);
    await request.done;

    assert.equal(fixture.line(), null);
    assert.equal(plugin.translationCache.size, 0);
});

for (const outcome of ["success", "failure"]) {
    test(`M01 drops a late ${outcome} after a target language change and clears its loading line`, async t => {
        const fixture = openMessage(t);
        const { plugin, button, toasts } = fixture;
        const request = fixture.begin();
        const version = plugin.autoTranslationConfigVersion;
        plugin.settings.translation.targetLanguage = "Japanese";
        assert.equal(plugin.autoTranslationConfigVersion, version);
        if (outcome === "success") request.resolve(TRANSLATED);
        else request.reject(providerError());
        await request.done;

        assert.equal(fixture.line(), null);
        assert.equal(button.disabled, false);
        assert.equal(plugin.translationCache.size, 0);
        assert.equal(plugin.autoTranslationProviderFailures.size, 0);
        assert.deepEqual(toasts, []);
    });
}

test("M01 a current message caches its translation and renders it again from cache", async t => {
    const fixture = openMessage(t);
    const request = fixture.begin();
    request.resolve(TRANSLATED);
    await request.done;

    const first = assertFinalLine(fixture, TRANSLATED);
    const { plugin } = fixture;
    const modes = [...plugin.translationCache.keys()].map(key => plugin.getTranslationCacheMode(key));
    assert.ok(modes.includes("manual"));
    assert.ok(modes.includes("auto"));
    first.remove();
    await fixture.translate();
    assertFinalLine(fixture, TRANSLATED);
    assert.equal(fixture.modelCalls(), 1);
});

for (const change of ["message ID", "target language"]) {
    test(`M01 skips the cache lookup when the ${change} changes after planning`, async t => {
        const fixture = openMessage(t);
        const { plugin } = fixture;
        const original = fixture.begin();
        original.resolve(TRANSLATED);
        await original.done;
        assertFinalLine(fixture, TRANSLATED).remove();
        const cache = new Map(plugin.translationCache);

        const createPlan = plugin.createManualTranslationPlan.bind(plugin);
        t.mock.method(plugin, "createManualTranslationPlan", (...args) => {
            const plan = createPlan(...args);
            if (change === "message ID") fixture.recycle();
            else plugin.settings.translation.targetLanguage = "Japanese";
            return plan;
        });
        const lookup = t.mock.method(plugin, "getTranslationCacheValue");
        await fixture.translate();

        assert.equal(lookup.mock.callCount(), 0);
        assert.equal(fixture.modelCalls(), 1);
        assert.equal(fixture.line(), null);
        assert.deepEqual(plugin.translationCache, cache);
    });
}

test("M01 a provider failure for a current message draws its error line", async t => {
    const fixture = openMessage(t);
    const request = fixture.begin();
    request.reject(providerError());
    await request.done;

    assert.ok(fixture.line()?.classList.contains("dait-translation-error"));
    assert.equal(fixture.button.disabled, false);
    assert.deepEqual(fixture.toasts.map(toast => toast.type), ["error"]);
});

for (const change of ["none", "ID before retry", "ID during retry", "target before retry", "target during retry"]) {
    test(`M01 handles a failed retranslation with ${change === "none" ? "a current previous line" : `a changed ${change}`}`, async t => {
        const fixture = openMessage(t);
        const { plugin, toasts } = fixture;
        const original = fixture.begin();
        original.resolve(TRANSLATED);
        await original.done;
        assertFinalLine(fixture, TRANSLATED);
        const cache = new Map(plugin.translationCache);
        const changeTarget = () => { plugin.settings.translation.targetLanguage = "Japanese"; };

        if (change === "ID before retry") fixture.recycle();
        if (change === "target before retry") changeTarget();
        const retry = fixture.begin(fixture.retranslate);
        if (change === "ID during retry") fixture.recycle();
        if (change === "target during retry") changeTarget();
        retry.resolve(SOURCE);
        await retry.done;

        if (change === "none") assertFinalLine(fixture, TRANSLATED);
        else assert.equal(fixture.line(), null);
        assert.deepEqual(plugin.translationCache, cache);
        assert.equal(toasts.length, change.endsWith("during retry") ? 0 : 1);
    });
}

for (const outcome of ["success", "failure"]) {
    for (const newerState of ["loading", "final"]) {
        test(`M02 an old ${outcome} after stop/start keeps the newer ${newerState} line`, async t => {
            const fixture = openMessage(t);
            const { plugin, toasts } = fixture;
            const older = fixture.begin();
            plugin.stop();
            assert.equal(older.loading.isConnected, false);
            fixture.start();

            const newer = fixture.begin();
            if (newerState === "final") {
                newer.resolve(NEW_TRANSLATION);
                await newer.done;
            }
            const expected = fixture.line();
            assert.equal(expected.classList.contains("dait-translation-loading"), newerState === "loading");
            const cache = new Map(plugin.translationCache);

            if (outcome === "success") older.resolve(TRANSLATED);
            else older.reject(providerError());
            await older.done;
            assert.equal(fixture.line(), expected);
            assert.deepEqual(plugin.translationCache, cache);
            assert.deepEqual(toasts, []);

            if (newerState === "loading") {
                assert.ok(expected.classList.contains("dait-translation-loading"));
                assert.equal(fixture.button.disabled, true);
                newer.resolve(NEW_TRANSLATION);
                await newer.done;
            }
            assertFinalLine(fixture, NEW_TRANSLATION);
        });
    }
}

test("M02 stale config cleanup preserves a final line rendered into the former loading node", async t => {
    const fixture = openMessage(t);
    const { plugin, messageNode, content } = fixture;
    const pending = fixture.begin();
    plugin.autoTranslationConfigVersion++;
    const replacement = plugin.renderTranslation(messageNode, content, NEW_TRANSLATION, "", SOURCE);
    assert.equal(replacement, pending.loading);
    pending.resolve(TRANSLATED);
    await pending.done;

    assert.equal(assertFinalLine(fixture, NEW_TRANSLATION), replacement);
    assert.equal(plugin.translationCache.size, 0);
});
