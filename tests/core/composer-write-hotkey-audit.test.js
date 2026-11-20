"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { el } = require("../fixtures/fake-dom");
const { createFakeDataApi, installChatGlobals } = require("../fixtures/chat-harness");

const DRAFT = "Polished draft";
const ORIGINAL = "Original  draft\nSecond line ";
const REPLACEMENT = "Replacement draft";

function installEvents(target) {
    const listeners = new Map();
    target.addEventListener = (type, listener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type).add(listener);
    };
    target.removeEventListener = (type, listener) => listeners.get(type)?.delete(listener);
    target.dispatchEvent = event => {
        for (const listener of [...(listeners.get(event.type) || [])]) listener(event);
        return !event.defaultPrevented;
    };
}

class TestClipboardEvent extends Event {
    constructor(type, options) {
        super(type, options);
        this.clipboardData = options.clipboardData;
    }
}

class TestInputEvent extends Event {
    constructor(type, options) {
        super(type, options);
        this.inputType = options.inputType;
        this.data = options.data;
    }
}

function openComposer(t, initial = DRAFT) {
    const { document, restore } = installChatGlobals({ bdApi: createFakeDataApi() });
    const plugin = new Plugin();
    t.after(() => {
        try {
            if (plugin.isStarted) plugin.stop();
        }
        finally { restore(); }
    });

    const editor = el("div", { role: "textbox", "data-slate-editor": "true", "data-slate-node": "value", contenteditable: "true" });
    document.body.appendChild(el("form", {}, [editor]));
    document.activeElement = editor;
    editor.focus = () => { document.activeElement = editor; };
    installEvents(document);
    installEvents(editor);

    const selection = {
        anchorNode: null,
        focusNode: null,
        removeAllRanges() { this.anchorNode = this.focusNode = null; },
        addRange(range) { this.anchorNode = this.focusNode = range.node; }
    };
    document.createRange = () => ({ selectNodeContents(node) { this.node = node; } });
    Object.assign(window, {
        getSelection: () => selection,
        ClipboardEvent: TestClipboardEvent,
        InputEvent: TestInputEvent,
        DataTransfer: MapClipboardData
    });

    const setDraft = text => {
        editor.textContent = "";
        for (const line of text.split("\n")) {
            editor.appendChild(el("div", { "data-slate-node": "element" }, [
                el("span", { "data-slate-string": "true" }, [line])
            ]));
        }
    };
    setDraft(initial);
    const edits = [];
    editor.addEventListener("paste", event => {
        edits.push("paste");
        assert.equal(selection.anchorNode, editor);
        setDraft(event.clipboardData.getData("text/plain"));
        event.preventDefault();
    });
    editor.addEventListener("beforeinput", event => {
        if (!event.isTrusted) edits.push(event.inputType);
    });
    document.execCommand = command => { edits.push(command); return false; };

    Object.assign(plugin, {
        injectStyles() {},
        removeStyles() {},
        startObserver() {},
        queueScan() {},
        showToast() {},
        injectInputButtons() {},
        waitForTextboxSettle: async () => {}
    });
    assert.equal(plugin.start(), true);

    const pauseSettle = delay => {
        const entered = Promise.withResolvers();
        const release = Promise.withResolvers();
        let paused = false;
        plugin.waitForTextboxSettle = async wait => {
            if (paused || wait !== delay) return;
            paused = true;
            entered.resolve();
            await release.promise;
        };
        return { entered: entered.promise, resume: release.resolve };
    };
    const startWrite = (options = {}) => plugin.composerWriter.replaceTextSafely(editor, REPLACEMENT, {
        expectedPreviousText: initial,
        ...options
    });
    const startRestore = () => {
        const session = plugin.createPolishSession(editor, ORIGINAL);
        plugin.updatePolishSessionAfterResult(session, editor, initial, true);
        return { session, done: plugin.restorePolishOriginal(editor, session) };
    };
    const draft = () => plugin.getTextboxDraftText(editor);
    const resultPanel = () => document.querySelector(".dait-polish-result-output");
    return { plugin, document, editor, selection, edits, setDraft, draft, pauseSettle, startWrite, startRestore, resultPanel };
}

class MapClipboardData extends Map {
    setData(type, value) { this.set(type, value); }
    getData(type) { return this.get(type) || ""; }
}

for (const restart of [false, true]) {
    test(`H01 stops a selected Slate write ${restart ? "across stop/start without a write token" : "when stop cancels its token"}`, async t => {
        const fixture = openComposer(t);
        const { plugin, editor, selection, edits } = fixture;
        const pause = fixture.pauseSettle(16);
        const writeToken = restart ? null : plugin.composerWriter.beginWrite(editor, DRAFT);
        const done = fixture.startWrite({ writeToken });
        await pause.entered;
        assert.equal(selection.anchorNode, editor);
        assert.deepEqual(edits, []);
        plugin.stop();
        if (restart) assert.equal(plugin.start(), true);
        else assert.equal(writeToken.reason, "stop");
        pause.resume();

        const result = await done;
        assert.equal(result.ok, false);
        assert.equal(result.reason, "write-cancelled");
        assert.deepEqual(edits, []);
        assert.equal(fixture.draft(), DRAFT);
    });
}

test("H01 trusted input cancels a selected Slate write before the draft changes", async t => {
    const fixture = openComposer(t);
    const { plugin, editor, edits } = fixture;
    const writeToken = plugin.composerWriter.beginWrite(editor, DRAFT);
    const pause = fixture.pauseSettle(16);
    const done = fixture.startWrite({ writeToken });
    await pause.entered;
    editor.dispatchEvent({ type: "beforeinput", isTrusted: true, inputType: "insertText" });
    pause.resume();

    assert.equal((await done).reason, "write-cancelled");
    assert.equal(writeToken.reason, "user-input");
    assert.deepEqual(edits, []);
    assert.equal(fixture.draft(), DRAFT);
});

test("H01 a newer write token owns the composer after selection settles", async t => {
    const fixture = openComposer(t);
    const { plugin, editor, edits } = fixture;
    const oldToken = plugin.composerWriter.beginWrite(editor, DRAFT);
    const pause = fixture.pauseSettle(16);
    const oldWrite = fixture.startWrite({ writeToken: oldToken });
    await pause.entered;
    const newToken = plugin.composerWriter.beginWrite(editor, DRAFT);
    pause.resume();

    assert.equal((await oldWrite).reason, "write-cancelled");
    assert.equal(oldToken.reason, "superseded");
    assert.deepEqual(edits, []);
    assert.equal((await fixture.startWrite({ writeToken: newToken })).ok, true);
    assert.deepEqual(edits, ["paste"]);
    assert.equal(fixture.draft(), REPLACEMENT);
});

for (const [initial, edited] of [["", "New draft"], ["Draft  ", "Draft "]]) {
    test(`H01 preserves a ${initial ? "spacing-only change" : "newly populated draft"} made after Slate selection`, async t => {
        const fixture = openComposer(t, initial);
        const writeToken = fixture.plugin.composerWriter.beginWrite(fixture.editor, initial);
        const pause = fixture.pauseSettle(16);
        const done = fixture.startWrite({ writeToken });
        await pause.entered;
        fixture.setDraft(edited);
        pause.resume();

        assert.equal((await done).reason, "stale-input");
        assert.deepEqual(fixture.edits, []);
        assert.equal(fixture.draft(), edited);
    });
}

test("H01 verification leaves a changed draft alone when no write was needed", async t => {
    const fixture = openComposer(t, REPLACEMENT);
    const pause = fixture.pauseSettle(120);
    const done = fixture.startWrite();
    await pause.entered;
    fixture.setDraft("Changed during verification");
    pause.resume();

    assert.equal((await done).reason, "stale-input");
    assert.deepEqual(fixture.edits, []);
    assert.equal(fixture.draft(), "Changed during verification");
});

test("H01 an interrupted restore makes no edit or fallback panel after stop", async t => {
    const fixture = openComposer(t);
    const { plugin, edits } = fixture;
    const panel = t.mock.method(plugin, "showPolishResultPanel");
    const pause = fixture.pauseSettle(16);
    const { session, done } = fixture.startRestore();
    await pause.entered;
    plugin.stop();
    pause.resume();

    assert.equal(await done, false);
    assert.deepEqual(edits, []);
    assert.equal(fixture.draft(), DRAFT);
    assert.equal(fixture.resultPanel(), null);
    assert.equal(panel.mock.callCount(), 0);
    assert.equal(session.lastWrittenRawText, DRAFT);
    assert.equal(plugin.composerWriter.activeWriteTokens.size, 0);
});

test("H01 a user edit during restore keeps the draft and offers the original while active", async t => {
    const fixture = openComposer(t);
    const pause = fixture.pauseSettle(16);
    const { session, done } = fixture.startRestore();
    await pause.entered;
    fixture.setDraft("User kept typing");
    fixture.editor.dispatchEvent({ type: "input", isTrusted: true, inputType: "insertText" });
    pause.resume();

    assert.equal(await done, false);
    assert.deepEqual(fixture.edits, []);
    assert.equal(fixture.draft(), "User kept typing");
    assert.equal(fixture.resultPanel()?.textContent, ORIGINAL);
    assert.equal(session.lastWrittenRawText, DRAFT);
});

test("H01 a verified restore writes the exact original and clears the restore action", async t => {
    const fixture = openComposer(t);
    const { plugin, document, editor } = fixture;
    const button = el("button", { class: "dait-polish-restore-control" });
    document.body.appendChild(button);
    plugin.polishRestoreControl = button;
    const { session, done } = fixture.startRestore();

    assert.equal(await done, true);
    assert.equal(fixture.draft(), ORIGINAL);
    assert.deepEqual(fixture.edits, ["paste"]);
    assert.equal(button.isConnected, false);
    assert.equal(fixture.resultPanel(), null);
    assert.equal(session.lastWrittenRawText, "");
    assert.equal(plugin.canRestorePolishOriginal(editor, session), false);
    assert.equal(plugin.isPolishSessionAlreadyPolished(session, ORIGINAL), false);
});

test("H01 typing after the original was observed keeps both the verified restore and the new input", async t => {
    const fixture = openComposer(t);
    const pause = fixture.pauseSettle(120);
    const { session, done } = fixture.startRestore();
    await pause.entered;
    assert.equal(fixture.draft(), ORIGINAL);
    fixture.setDraft(`${ORIGINAL}typed`);
    fixture.editor.dispatchEvent({ type: "input", isTrusted: true, inputType: "insertText" });
    pause.resume();

    assert.equal(await done, true);
    assert.deepEqual(fixture.edits, ["paste"]);
    assert.equal(fixture.draft(), `${ORIGINAL}typed`);
    assert.equal(fixture.resultPanel(), null);
    assert.equal(session.lastWrittenRawText, "");
});

for (const restart of [false, true]) {
    test(`H01 a verified writer result ${restart ? "from the prior lifecycle" : "with a changed draft"} cannot clear the restore state`, async t => {
        const fixture = openComposer(t);
        const { plugin } = fixture;
        const verified = Promise.withResolvers();
        const release = Promise.withResolvers();
        const write = plugin.composerWriter.replaceTextSafely.bind(plugin.composerWriter);
        t.mock.method(plugin.composerWriter, "replaceTextSafely", async (...args) => {
            const result = await write(...args);
            verified.resolve(result);
            await release.promise;
            return result;
        });
        const { session, done } = fixture.startRestore();
        assert.equal((await verified.promise).ok, true);
        assert.equal(fixture.draft(), ORIGINAL);
        if (restart) {
            plugin.stop();
            assert.equal(plugin.start(), true);
        }
        fixture.setDraft("Newer draft");
        release.resolve();

        assert.equal(await done, false);
        assert.equal(fixture.draft(), "Newer draft");
        assert.equal(session.lastWrittenRawText, DRAFT);
        assert.equal(fixture.resultPanel()?.textContent ?? null, restart ? null : ORIGINAL);
    });
}

function hotkeyEvent(target, { key = "p", repeat = false, type = "keydown" } = {}) {
    return {
        type, key, repeat, target, ctrlKey: true, altKey: true,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() {}
    };
}

test("H07 holding the polish shortcut runs one action and a fresh press runs another", t => {
    const { plugin, document, editor } = openComposer(t);
    const polish = t.mock.method(plugin, "polishCurrentDraft", () => {});
    const first = hotkeyEvent(editor);
    document.dispatchEvent(first);
    assert.equal(first.defaultPrevented, true);
    for (let index = 0; index < 3; index++) {
        const held = hotkeyEvent(editor, { repeat: true });
        document.dispatchEvent(held);
        assert.equal(held.defaultPrevented, false);
    }
    assert.equal(polish.mock.callCount(), 1);
    assert.equal(polish.mock.calls[0].arguments[1].textbox, editor);

    document.dispatchEvent(hotkeyEvent(editor, { type: "keyup" }));
    document.dispatchEvent(hotkeyEvent(editor));
    assert.equal(polish.mock.callCount(), 2);
});

test("H07 the separate recorder still captures a shortcut without invoking polish", async t => {
    const { plugin, document } = openComposer(t);
    const polish = t.mock.method(plugin, "polishCurrentDraft", () => {});
    const button = el("button");
    document.body.appendChild(el("div", { class: "dait-settings" }, [button]));
    plugin.recordHotkey(button);
    await new Promise(resolve => setTimeout(resolve, 0));
    const event = hotkeyEvent(button, { key: "k", repeat: true });
    document.dispatchEvent(event);

    assert.equal(event.defaultPrevented, true);
    assert.equal(plugin.settings.ui.polishHotkey, "Ctrl+Alt+K");
    assert.equal(button.dataset.recording, undefined);
    assert.equal(polish.mock.callCount(), 0);
});
