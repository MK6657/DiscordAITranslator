"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");

class DiscordSlateComposerController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    replaceTextboxText(textbox, text, options = {}) {
        return this.replaceTextboxTextSafely(textbox, text, options).ok;
    },

    async replaceTextboxTextSafelyAsync(textbox, text, options = {}) {
        const value = String(text || "");
        if (!textbox || textbox.isConnected === false) return { ok: false, reason: "missing-textbox", actual: "" };
        // Shared by the write attempt and the rollback so the draft is undone at most once.
        const writeOptions = {
            ...options,
            lifecycleToken: options.lifecycleToken ?? this.plugin.getLifecycleToken(),
            rollback: { undoAttempted: false },
            writeState: { userEditedAfter: false, blockedReason: "" }
        };
        if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions, { checkExpected: true })) {
            return { ok: false, reason: this.getTextboxReplacementBlockedReason(writeOptions), actual: this.getTextboxTextSafe(textbox) };
        }
        const previousRawText = this.plugin.getTextboxRawTextSafe(textbox);
        const failAfterAttempt = async () => {
            // The value was in the composer before the user typed on: the write happened. Nothing is
            // undone or re-selected under the user's typing, and the caller records it as written.
            if (this.plugin.isLifecycleTokenCurrent(writeOptions.lifecycleToken) && writeOptions.writeState.userEditedAfter) {
                return { ok: true, method: "written-then-edited", userEditedAfter: true, actual: this.getTextboxTextSafe(textbox) };
            }
            // Never roll back over the user's new input, a newer write, or a remounted composer.
            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) {
                return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
            }
            if (writeOptions.writeState.blockedReason) {
                return { ok: false, reason: writeOptions.writeState.blockedReason, actual: this.getTextboxTextSafe(textbox) };
            }
            await this.restoreTextboxSnapshotAfterFailedReplace(textbox, previousRawText, value, writeOptions);
            return { ok: false, reason: "verification-failed", actual: this.getTextboxTextSafe(textbox) };
        };

        if (this.isPlainTextTextbox(textbox)) {
            const result = this.replaceTextboxTextSafely(textbox, value, writeOptions);
            if (result.ok || result.reason === "missing-textbox") return result;

            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
            if (await this.waitForTextboxTextEqual(textbox, value)) {
                if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "settled", actual: value };
            }

            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
            this.replaceTextboxTextRetry(textbox, value);
            if (await this.waitForTextboxTextEqual(textbox, value)) {
                if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "async-retry", actual: value };
            }

            return failAfterAttempt();
        }

        if (this.isRichDiscordTextbox(textbox)) {
            if (await this.replaceDiscordRichTextboxTextAtomically(textbox, value, writeOptions)) {
                if (this.isTextboxReplacementWriteAllowed(textbox, writeOptions) && this.isTextboxTextEqual(textbox, value)) {
                    this.finishTextboxReplacement(textbox, options);
                    return { ok: true, method: "slate-atomic", actual: value };
                }
                writeOptions.writeState.userEditedAfter = this.isComposerWriteTakenOverByUser(textbox, writeOptions);
                writeOptions.writeState.blockedReason = "stale-input";
            }
            return failAfterAttempt();
        }

        if (await this.replaceRichTextboxTextAsync(textbox, value, writeOptions)
            && this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) {
            this.finishTextboxReplacement(textbox, options);
            return { ok: true, method: "async-rich", actual: value };
        }

        return failAfterAttempt();
    },

    replaceTextboxTextSafely(textbox, text, options = {}) {
        const value = String(text || "");
        if (!textbox || textbox.isConnected === false) return { ok: false, reason: "missing-textbox", actual: "" };
        if (!this.isTextboxReplacementWriteAllowed(textbox, options, { checkExpected: true })) {
            return { ok: false, reason: this.getTextboxReplacementBlockedReason(options), actual: this.getTextboxTextSafe(textbox) };
        }

        this.replaceTextboxTextAttempt(textbox, value);
        if (this.isTextboxTextEqual(textbox, value)) {
            this.finishTextboxReplacement(textbox, options);
            return { ok: true, method: "primary", actual: value };
        }

        const firstActual = this.getTextboxTextSafe(textbox);
        if (this.isWrongTextboxReplacement(firstActual, value)) {
            this.replaceTextboxTextRetry(textbox, value);
            if (this.isTextboxTextEqual(textbox, value)) {
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "retry", actual: value };
            }
        }

        return { ok: false, reason: "verification-failed", actual: this.getTextboxTextSafe(textbox) };
    },

    replaceTextboxTextAttempt(textbox, value) {
        textbox.focus?.();

        if (this.isPlainTextTextbox(textbox)) {
            return this.replacePlainTextTextboxValue(textbox, value);
        }
        if (this.isRichDiscordTextbox(textbox)) return false;
        return this.replaceRichTextboxText(textbox, value);
    },

    replaceTextboxTextRetry(textbox, value) {
        if (this.isPlainTextTextbox(textbox)) {
            return this.replacePlainTextTextboxValue(textbox, value);
        }

        if (this.isRichDiscordTextbox(textbox)) return false;
        if (this.replaceRichTextboxText(textbox, value)) return true;
        if (!this.canUseTextboxDomFallback(textbox)) return false;
        return this.replaceTextboxTextDomFallback(textbox, value);
    },

    isTextboxReplacementWriteAllowed(textbox, options = {}, checks = {}) {
        if (!textbox || textbox.isConnected === false) return false;
        if (!this.plugin.isLifecycleTokenCurrent(options.lifecycleToken ?? this.plugin.getLifecycleToken())) return false;
        if (options.writeToken && !this.plugin.composerWriter.isWriteTokenCurrent(options.writeToken)) return false;
        if (checks.checkExpected && Object.prototype.hasOwnProperty.call(options, "expectedPreviousText")) {
            return this.plugin.areDraftTextsEqualStrict(
                this.plugin.getTextboxRawTextSafe(textbox),
                this.plugin.normalizeDraftRawText(options.expectedPreviousText)
            );
        }
        return true;
    },

    getTextboxReplacementBlockedReason(options = {}) {
        if (!this.plugin.isLifecycleTokenCurrent(options.lifecycleToken ?? this.plugin.getLifecycleToken())
            || (options.writeToken && !this.plugin.composerWriter.isWriteTokenCurrent(options.writeToken))) return "write-cancelled";
        return "stale-input";
    },

    getTextboxTextSafe(textbox) {
        if (this.isPlainTextTextbox(textbox)) {
            return this.plugin.normalizeExtractedText(textbox?.value ?? "");
        }
        try {
            return this.plugin.normalizeExtractedText(this.plugin.getElementText(textbox));
        }
        catch {
            return this.plugin.normalizeExtractedText(textbox?.value ?? textbox?.textContent ?? "");
        }
    },

    getTextboxRawTextSafe(textbox) {
        if (this.isPlainTextTextbox(textbox)) {
            return this.plugin.normalizeDraftRawText(textbox?.value ?? "");
        }
        try {
            return this.plugin.getElementRawText(textbox);
        }
        catch {
            return this.plugin.normalizeDraftRawText(textbox?.value ?? textbox?.textContent ?? "");
        }
    },

    isWrongTextboxReplacement(actual, expected) {
        const left = this.plugin.normalizeExtractedText(actual);
        const right = this.plugin.normalizeExtractedText(expected);
        if (left === right) return false;
        if (!left || !right) return true;
        return true;
    },

    isPlainTextTextbox(element) {
        const tag = String(element?.tagName || "").toUpperCase();
        return tag === "TEXTAREA" || tag === "INPUT";
    },

    replacePlainTextTextboxValue(textbox, text) {
        const proto = Object.getPrototypeOf(textbox);
        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
        if (descriptor?.set) descriptor.set.call(textbox, text);
        else textbox.value = text;
        this.dispatchInput(textbox, text, { inputType: "insertReplacementText" });
        return true;
    },

    replaceRichTextboxText(textbox, text) {
        if (this.isRichDiscordTextbox(textbox)) return false;
        if (!this.clearRichTextboxText(textbox)) return false;
        return this.insertRichTextboxText(textbox, text) && this.isTextboxTextEqual(textbox, text);
    },

    replaceRichTextboxSelection(textbox, text, inputType = "insertReplacementText") {
        textbox.focus?.();
        this.selectTextboxContents(textbox);
        if (this.plugin.dispatchTextboxPaste(textbox, text) && this.isTextboxTextEqual(textbox, text)) return true;

        this.selectTextboxContents(textbox);
        if (this.plugin.dispatchTextboxBeforeInput(textbox, text, inputType) && this.isTextboxTextEqual(textbox, text)) return true;

        this.selectTextboxContents(textbox);
        try {
            return Boolean(document.execCommand?.("insertText", false, text));
        }
        catch {
            return false;
        }
    },

    async replaceRichTextboxTextAsync(textbox, text, options = {}) {
        if (this.isRichDiscordTextbox(textbox)) return this.replaceDiscordRichTextboxTextAtomically(textbox, text, options);
        if (!await this.clearRichTextboxTextAsync(textbox, options)) return false;
        return this.insertRichTextboxTextAsync(textbox, text, options);
    },

    async replaceDiscordRichTextboxTextAtomically(textbox, text, options = {}) {
        const value = String(text || "");
        const nextText = this.plugin.normalizeDraftRawText(value);
        const previousText = Object.prototype.hasOwnProperty.call(options, "expectedPreviousText")
            ? this.plugin.normalizeDraftRawText(options.expectedPreviousText)
            : this.plugin.getTextboxRawTextSafe(textbox);
        /** @type {Record<string, any>} */
        const writeOptions = {
            ...options,
            lifecycleToken: options.lifecycleToken ?? this.plugin.getLifecycleToken(),
            expectedPreviousText: previousText
        };
        if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions, { checkExpected: true })) return false;
        if (previousText === nextText) {
            const stable = await this.plugin.waitForTextboxStableTextEqual(textbox, value);
            if (!stable && writeOptions.writeState) writeOptions.writeState.blockedReason = "stale-input";
            return stable && this.isTextboxReplacementWriteAllowed(textbox, writeOptions);
        }

        const attempts = [
            () => this.plugin.dispatchTextboxPaste(textbox, value),
            () => this.plugin.dispatchTextboxBeforeInput(textbox, value, "insertReplacementText"),
            () => this.plugin.dispatchTextboxBeforeInput(textbox, value, "insertFromPaste")
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return false;
            const selected = await this.plugin.prepareTextboxFullReplacementSelection(textbox);
            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions, { checkExpected: true })) {
                if (writeOptions.writeState) writeOptions.writeState.blockedReason = this.getTextboxReplacementBlockedReason(writeOptions);
                return false;
            }
            if (!selected) return false;
            attempt();
            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return false;
            const observed = { equal: false };
            const stable = await this.plugin.waitForTextboxStableTextEqual(textbox, value, observed);
            if (stable && this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) return true;
            // The value landed and the user's own input came before the settle check ended.
            if (observed.equal && this.isComposerWriteTakenOverByUser(textbox, writeOptions)) {
                if (writeOptions.writeState) writeOptions.writeState.userEditedAfter = true;
                return false;
            }
            if (stable) return false;

            // Raw against raw: a normalized read never equals a draft with double or trailing spaces.
            const actual = this.plugin.getTextboxRawTextSafe(textbox);
            if (actual !== previousText && actual !== nextText) {
                if (actual && this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) await this.tryUndoTextboxEdit(textbox, previousText, writeOptions);
                return false;
            }
        }

        return false;
    },

    async clearRichTextboxTextAsync(textbox, options = {}) {
        if (this.isTextboxEmpty(textbox)) return true;

        const attempts = [
            () => {
                this.selectTextboxContents(textbox);
                return this.plugin.dispatchTextboxBeforeInput(textbox, "", "deleteByCut");
            },
            () => {
                this.selectTextboxContents(textbox);
                return this.plugin.dispatchTextboxBeforeInput(textbox, "", "deleteContentBackward");
            },
            () => {
                this.selectTextboxContents(textbox);
                return this.runComposerExecCommand("delete");
            },
            () => {
                this.clearRichTextboxTextWithKeyboard(textbox);
                return true;
            },
            () => {
                this.selectTextboxContents(textbox);
                return this.runComposerExecCommand("insertText", "");
            }
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            attempt();
            if (await this.waitForTextboxStableEmpty(textbox)) return true;
        }

        return false;
    },

    // document.execCommand fires trusted "input" events: they are the plugin's own edit, not the user
    // typing, so they must not cancel the write (or rollback) in progress.
    runComposerExecCommand(command, value = null) {
        return this.plugin.composerWriter.runOwnEdit(() => {
            try {
                return Boolean(document.execCommand?.(command, false, value));
            }
            catch {
                return false;
            }
        });
    },

    async insertRichTextboxTextAsync(textbox, text, options = {}) {
        const attempts = [
            () => this.plugin.dispatchTextboxPaste(textbox, text),
            () => this.plugin.dispatchTextboxBeforeInput(textbox, text, "insertFromPaste"),
            () => this.plugin.dispatchTextboxBeforeInput(textbox, text, "insertText"),
            () => this.runComposerExecCommand("insertText", text)
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxEmpty(textbox) && !await this.clearRichTextboxTextAsync(textbox, options)) return false;
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            attempt();
            if (await this.plugin.waitForTextboxStableTextEqual(textbox, text)) return true;
            if (!this.isTextboxEmpty(textbox) && !this.isTextboxTextEqual(textbox, text)) {
                if (!await this.clearRichTextboxTextAsync(textbox, options)) return false;
            }
        }

        return false;
    },

    async tryRestoreTextboxTextAfterFailedReplace(textbox, text, options = {}) {
        if (!text) return;
        if (!await this.clearRichTextboxTextAsync(textbox, options)) return;
        if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return;
        await this.insertRichTextboxTextAsync(textbox, text, options);
    },

    // Stops as soon as options.writeToken is no longer current (user input, a newer write, remount).
    async restoreTextboxSnapshotAfterFailedReplace(textbox, previousText, attemptedText = "", options = {}) {
        if (!textbox || textbox.isConnected === false) return false;
        const previous = this.plugin.normalizeDraftRawText(previousText);
        if (!previous) return false;
        if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
        const current = this.plugin.getTextboxRawTextSafe(textbox);
        if (current === previous || current === this.plugin.normalizeDraftRawText(attemptedText)) return false;

        if (this.isPlainTextTextbox(textbox)) {
            this.replacePlainTextTextboxValue(textbox, previous);
            return this.isTextboxTextEqual(textbox, previous);
        }

        if (this.isRichDiscordTextbox(textbox)) {
            if (!options.rollback?.undoAttempted && await this.tryUndoTextboxEdit(textbox, previous, options)) return true;
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            if (this.isTextboxTextEqual(textbox, previous)) return true;
            await this.tryRestoreTextboxTextAfterFailedReplace(textbox, previous, options);
            return this.isTextboxTextEqual(textbox, previous);
        }

        await this.tryRestoreTextboxTextAfterFailedReplace(textbox, previous, options);
        return this.isTextboxTextEqual(textbox, previous);
    },

    clearRichTextboxText(textbox) {
        this.selectTextboxContents(textbox);
        try {
            document.execCommand?.("delete", false, null);
        }
        catch {}
        if (this.isTextboxEmpty(textbox)) return true;

        try {
            if (this.plugin.dispatchTextboxBeforeInput(textbox, "", "deleteContentBackward") && this.isTextboxEmpty(textbox)) return true;
        }
        catch {}

        this.selectTextboxContents(textbox);
        try {
            document.execCommand?.("insertText", false, "");
        }
        catch {}
        return this.isTextboxEmpty(textbox);
    },

    clearRichTextboxTextWithKeyboard(textbox) {
        this.selectTextboxContents(textbox);
        ["keydown", "keypress", "keyup"].forEach(type => {
            try {
                textbox.dispatchEvent(new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key: "a",
                    code: "KeyA",
                    keyCode: 65,
                    which: 65,
                    ctrlKey: true,
                    metaKey: false
                }));
            }
            catch {}
        });
        ["keydown", "keypress", "keyup"].forEach(type => {
            try {
                textbox.dispatchEvent(new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key: "Backspace",
                    code: "Backspace",
                    keyCode: 8,
                    which: 8
                }));
            }
            catch {}
        });
    },

    insertRichTextboxText(textbox, text) {
        if (this.plugin.dispatchTextboxPaste(textbox, text) && this.isTextboxTextEqual(textbox, text)) return true;
        if (this.plugin.dispatchTextboxBeforeInput(textbox, text, "insertText") && this.isTextboxTextEqual(textbox, text)) return true;

        try {
            return Boolean(document.execCommand?.("insertText", false, text));
        }
        catch {
            return false;
        }
    },

    isTextboxEmpty(textbox) {
        return !this.getTextboxTextSafe(textbox);
    },

    replaceTextboxTextDomFallback(textbox, text) {
        textbox.textContent = text;
        return this.dispatchInput(textbox, text, { inputType: "insertReplacementText" });
    },

    canUseTextboxDomFallback(textbox) {
        return !this.isRichDiscordTextbox(textbox);
    },

    isRichDiscordTextbox(textbox) {
        if (!textbox) return false;
        const contentEditable = String(textbox.getAttribute?.("contenteditable") || textbox.contentEditable || "").toLowerCase();
        return textbox.getAttribute?.("data-slate-editor") === "true"
            || contentEditable === "true"
            || textbox.matches?.("[role='textbox'][contenteditable='true'], [data-slate-editor='true']");
    },

    isTextboxTextEqual(textbox, text) {
        const expectedRaw = this.plugin.normalizeDraftRawText(text);
        const actualRaw = this.plugin.getTextboxRawTextSafe(textbox);
        if (actualRaw || expectedRaw) return actualRaw === expectedRaw;
        return this.getTextboxTextSafe(textbox) === this.plugin.normalizeExtractedText(text);
    },

    async waitForTextboxTextEqual(textbox, text) {
        if (this.isTextboxTextEqual(textbox, text)) return true;
        for (const delay of [0, 16, 50, 100, 200, 350]) {
            await this.plugin.waitForTextboxSettle(delay);
            if (this.isTextboxTextEqual(textbox, text)) return true;
        }
        return false;
    },

    // `observed.equal` is set once the text was seen equal, even if it changes before it settles.
    async waitForTextboxStableTextEqual(textbox, text, observed = null) {
        if (!await this.waitForTextboxTextEqual(textbox, text)) return false;
        if (observed) observed.equal = true;
        await this.plugin.waitForTextboxSettle(120);
        return this.isTextboxTextEqual(textbox, text);
    },

    // The write token was cancelled by the user's own input (not a newer write or a remount).
    isComposerWriteTakenOverByUser(textbox, options = {}) {
        const token = options.writeToken;
        return Boolean(textbox && textbox.isConnected !== false && token?.cancelled && token.reason === "user-input");
    },

    async waitForTextboxEmpty(textbox) {
        if (this.isTextboxEmpty(textbox)) return true;
        for (const delay of [0, 16, 50, 100, 200, 350]) {
            await this.plugin.waitForTextboxSettle(delay);
            if (this.isTextboxEmpty(textbox)) return true;
        }
        return false;
    },

    async waitForTextboxStableEmpty(textbox) {
        if (!await this.waitForTextboxEmpty(textbox)) return false;
        await this.plugin.waitForTextboxSettle(120);
        return this.isTextboxEmpty(textbox);
    },

    waitForTextboxSettle(delay = 0) {
        return new Promise(resolve => {
            const win = typeof window !== "undefined" ? window : null;
            const done = () => resolve(undefined);
            if (delay > 0) {
                const timer = typeof win?.setTimeout === "function" ? win.setTimeout.bind(win) : setTimeout;
                timer(done, delay);
                return;
            }
            if (typeof win?.requestAnimationFrame === "function") {
                win.requestAnimationFrame(done);
                return;
            }
            setTimeout(done, 0);
        });
    },

    async prepareTextboxFullReplacementSelection(textbox) {
        textbox?.focus?.();
        if (!this.selectTextboxContents(textbox)) return false;
        this.dispatchSelectionChange();
        await this.plugin.waitForTextboxSettle(0);
        await this.plugin.waitForTextboxSettle(16);
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        return this.isSelectionInsideElement(selection, textbox);
    },

    async tryUndoTextboxEdit(textbox, expectedText = "", options = {}) {
        const expected = this.plugin.normalizeDraftRawText(expectedText);
        if (!this.plugin.normalizeExtractedText(expected)) return false;
        if (options.rollback) options.rollback.undoAttempted = true;
        const attempts = [
            () => this.plugin.dispatchTextboxBeforeInput(textbox, "", "historyUndo"),
            () => this.dispatchTextboxKeyboardShortcut(textbox, "z", "KeyZ", { ctrlKey: true }),
            () => this.runComposerExecCommand("undo")
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            const before = this.plugin.getTextboxRawTextSafe(textbox);
            attempt();
            if (await this.plugin.waitForTextboxStableTextEqual(textbox, expected)) return true;
            // One undo step at most: a second one would unwind the user's own earlier typing.
            if (this.plugin.getTextboxRawTextSafe(textbox) !== before) return false;
        }
        return false;
    },

    dispatchTextboxKeyboardShortcut(textbox, key, code, modifiers = {}) {
        if (typeof textbox?.dispatchEvent !== "function") return false;
        let dispatched = false;
        ["keydown", "keypress", "keyup"].forEach(type => {
            try {
                const event = new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key,
                    code,
                    keyCode: String(key || "").toUpperCase().charCodeAt(0),
                    which: String(key || "").toUpperCase().charCodeAt(0),
                    ctrlKey: Boolean(modifiers.ctrlKey),
                    metaKey: Boolean(modifiers.metaKey),
                    altKey: Boolean(modifiers.altKey),
                    shiftKey: Boolean(modifiers.shiftKey)
                });
                dispatched = textbox.dispatchEvent(event) !== false || dispatched;
            }
            catch {}
        });
        return dispatched;
    },

    dispatchSelectionChange() {
        try {
            document.dispatchEvent?.(new Event("selectionchange", { bubbles: false, cancelable: false }));
            return true;
        }
        catch {
            return false;
        }
    },

    selectTextboxContents(textbox) {
        textbox?.focus?.();
        return this.selectTextboxTextNodes(textbox) || this.selectElementContents(textbox);
    },

    selectTextboxTextNodes(element) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange || !document.createTreeWalker || !element) return false;

        try {
            const textNodes = [];
            const walker = document.createTreeWalker(element, 4, {
                acceptNode: node => {
                    /** @type {any} */
                    const parent = node?.parentElement || node?.parentNode;
                    if (!parent) return 2;
                    if (parent.closest?.(".dait-polish-result-panel, .dait-polish-restore-control, [data-slate-placeholder='true']")) return 2;
                    if (!String(node.nodeValue || "").replace(/\u200b/g, "").length) return 2;
                    return 1;
                }
            });
            let node = walker.nextNode();
            while (node) {
                textNodes.push(node);
                node = walker.nextNode();
            }
            if (!textNodes.length) return false;

            const first = textNodes[0];
            const last = textNodes[textNodes.length - 1];
            const range = document.createRange();
            const voidStart = first?.parentElement?.closest?.("[data-slate-void='true']");
            const voidEnd = last?.parentElement?.closest?.("[data-slate-void='true']");
            if (voidStart && element.contains?.(voidStart) && typeof range.setStartBefore === "function") {
                range.setStartBefore(voidStart);
            }
            else {
                range.setStart(first, 0);
            }
            if (voidEnd && element.contains?.(voidEnd) && typeof range.setEndAfter === "function") {
                range.setEndAfter(voidEnd);
            }
            else {
                range.setEnd(last, String(last.nodeValue || "").length);
            }
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        }
        catch {
            return false;
        }
    },

    selectElementContents(element) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange) return false;

        try {
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        }
        catch {
            return false;
        }
    },

    dispatchTextboxPaste(target, text) {
        try {
            const clipboardData = this.createClipboardData(text);
            const EventCtor = typeof window !== "undefined" ? window.ClipboardEvent : null;
            if (!EventCtor || !clipboardData) return false;

            const event = new EventCtor("paste", {
                bubbles: true,
                cancelable: true,
                clipboardData
            });
            if (!event.clipboardData) {
                Object.defineProperty(event, "clipboardData", { value: clipboardData });
            }
            const dispatched = target.dispatchEvent(event);
            return dispatched === false || event.defaultPrevented;
        }
        catch {
            return false;
        }
    },

    createClipboardData(text) {
        const DataTransferCtor = typeof window !== "undefined" ? window.DataTransfer : null;
        if (!DataTransferCtor) return null;
        const data = new DataTransferCtor();
        data.setData("text/plain", text);
        return data;
    },

    dispatchTextboxBeforeInput(target, text, inputType = "insertReplacementText") {
        try {
            const EventCtor = typeof window !== "undefined" ? window.InputEvent : null;
            if (!EventCtor) return false;
            const event = new EventCtor("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType,
                data: text
            });
            const dispatched = target.dispatchEvent(event);
            return dispatched === false || event.defaultPrevented;
        }
        catch {
            return false;
        }
    },

    finishTextboxReplacement(textbox, options = {}) {
        const token = ++this.plugin.textboxReplacementCleanupToken;
        this.removeTextboxReplacementCleanupListener();
        this.clearTextboxReplacementCleanupTimers();
        if (this.isRichDiscordTextbox(textbox)) {
            this.applyDiscordTextboxReplacementSelection(textbox, options);
            return;
        }
        this.plugin.textboxReplacementCleanupRemove = this.addTextboxReplacementCleanupCancelListeners(token);

        this.applyTextboxReplacementSelection(textbox, options);
        const schedule = typeof window !== "undefined" ? window.requestAnimationFrame : null;
        if (typeof schedule === "function") {
            const firstRaf = schedule(() => {
                this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options);
                if (token !== this.plugin.textboxReplacementCleanupToken || !this.plugin.isStarted) return;
                const secondRaf = schedule(() => this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options));
                this.plugin.textboxReplacementCleanupRafs.push(secondRaf);
            });
            this.plugin.textboxReplacementCleanupRafs.push(firstRaf);
        }
        const delayed = typeof window !== "undefined" ? window.setTimeout : null;
        if (typeof delayed === "function") {
            this.plugin.textboxReplacementCleanupTimers.push(delayed(() => this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options), 60));
            this.plugin.textboxReplacementCleanupTimers.push(delayed(() => {
                this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options);
                this.removeTextboxReplacementCleanupListener();
            }, 180));
        }
        else {
            this.removeTextboxReplacementCleanupListener();
        }
    },

    applyDiscordTextboxReplacementSelection(textbox, options = {}) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (options.blurAfterReplace) {
            if (!selection || this.isSelectionInsideElement(selection, textbox)) selection?.removeAllRanges?.();
            this.blurElement(textbox);
            this.blurElement(options.extraBlurTarget);
            return;
        }
        this.placeCaretAtTextboxTextEnd(textbox);
    },

    placeCaretAtTextboxTextEnd(textbox) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange || !document.createTreeWalker || !textbox) return false;
        try {
            const walker = document.createTreeWalker(textbox, 4, {
                acceptNode: node => {
                    /** @type {any} */
                    const parent = node?.parentElement || node?.parentNode;
                    if (!parent) return 2;
                    if (parent.closest?.(".dait-polish-result-panel, .dait-polish-restore-control, [data-slate-placeholder='true']")) return 2;
                    return String(node?.nodeValue || "").replace(/\u200b/g, "").length ? 1 : 2;
                }
            });
            let last = null;
            let node = walker.nextNode();
            while (node) {
                last = node;
                node = walker.nextNode();
            }
            if (!last) return false;
            const range = document.createRange();
            const voidEnd = last?.parentElement?.closest?.("[data-slate-void='true']");
            if (voidEnd && textbox.contains?.(voidEnd) && typeof range.setStartAfter === "function") {
                range.setStartAfter(voidEnd);
            }
            else {
                range.setStart(last, String(last.nodeValue || "").length);
            }
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            this.dispatchSelectionChange();
            return true;
        }
        catch {
            return false;
        }
    },

    applyTextboxReplacementSelectionIfCurrent(token, textbox, options = {}) {
        if (token !== this.plugin.textboxReplacementCleanupToken) return;
        if (!this.plugin.isStarted) return;
        this.applyTextboxReplacementSelection(textbox, options);
    },

    addTextboxReplacementCleanupCancelListeners(token) {
        if (typeof document === "undefined" || !document.addEventListener) return null;
        const cancel = () => this.cancelTextboxReplacementCleanup(token);
        const events = ["pointerdown", "mousedown", "touchstart", "keydown", "copy", "cut", "contextmenu"];
        events.forEach(type => document.addEventListener(type, cancel, true));
        return () => events.forEach(type => document.removeEventListener?.(type, cancel, true));
    },

    cancelTextboxReplacementCleanup(token = this.plugin.textboxReplacementCleanupToken) {
        if (token !== this.plugin.textboxReplacementCleanupToken) return;
        this.plugin.textboxReplacementCleanupToken++;
        this.clearTextboxReplacementCleanupTimers();
        this.removeTextboxReplacementCleanupListener();
    },

    clearTextboxReplacementCleanupTimers() {
        if (typeof window !== "undefined") {
            this.plugin.textboxReplacementCleanupTimers.forEach(timer => window.clearTimeout?.(timer));
            this.plugin.textboxReplacementCleanupRafs.forEach(raf => window.cancelAnimationFrame?.(raf));
        }
        this.plugin.textboxReplacementCleanupTimers = [];
        this.plugin.textboxReplacementCleanupRafs = [];
    },

    removeTextboxReplacementCleanupListener() {
        if (!this.plugin.textboxReplacementCleanupRemove) return;
        const remove = this.plugin.textboxReplacementCleanupRemove;
        this.plugin.textboxReplacementCleanupRemove = null;
        remove();
    },

    applyTextboxReplacementSelection(textbox, options = {}) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (options.blurAfterReplace) {
            if (!selection || this.isSelectionInsideElement(selection, textbox)) {
                selection?.removeAllRanges?.();
            }
            this.blurElement(textbox);
            this.blurElement(options.extraBlurTarget);
            return;
        }

        if (!selection || !document.createRange) return;
        if (!this.isSelectionInsideElement(selection, textbox) && !this.isActiveElementInside(textbox)) return;
        try {
            const range = document.createRange();
            range.selectNodeContents(textbox);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        catch {
            selection.removeAllRanges?.();
        }
    },

    isActiveElementInside(element) {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        return Boolean(active && (active === element || element?.contains?.(active)));
    },

    isSelectionInsideElement(selection, element) {
        if (!selection || !element) return false;
        const anchor = selection.anchorNode;
        const focus = selection.focusNode;
        if (!anchor && !focus) return true;
        return this.isNodeInsideElement(anchor, element) || this.isNodeInsideElement(focus, element);
    },

    isNodeInsideElement(node, element) {
        if (!node || !element) return false;
        if (node === element) return true;
        const parent = node.nodeType === 1 ? node : node.parentElement || node.parentNode;
        return Boolean(parent && (parent === element || element.contains?.(parent)));
    },

    blurElement(element) {
        if (!element) return;
        /** @type {any} */
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (active && (active === element || element.contains?.(active))) {
            active.blur?.();
            return;
        }
        element.blur?.();
    },

    dispatchInput(target, data, options = {}) {
        if (typeof target?.dispatchEvent !== "function") return false;
        try {
            target.dispatchEvent(new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                inputType: options.inputType || "insertText",
                data
            }));
            return true;
        }
        catch {
            try {
                target.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
                return true;
            }
            catch {
                return false;
            }
        }
    },

    // Sends the way the user does: Enter on the focused composer, which Discord's editor turns into a send.
    // Never clicks a button: Discord shows no send button by default, and the toolbar in the same form holds
    // controls such as "Send a gift", GIF, stickers and emoji that must never be pressed for the user.
    submitTextbox(textbox) {
        if (!textbox || textbox.isConnected === false || typeof textbox.dispatchEvent !== "function") return false;
        if (typeof KeyboardEvent !== "function") return false;
        textbox.focus?.();
        ["keydown", "keypress", "keyup"].forEach(type => {
            textbox.dispatchEvent(new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13
            }));
        });
        if (this.plugin.polishSession && (this.plugin.polishSession.textbox === textbox || this.plugin.polishSession.composerKey === this.plugin.getTextboxComposerKey?.(textbox))) {
            this.plugin.polishSession = null;
        }
        return true;
    }
};

const SLATE_COMPOSER_METHOD_NAMES = attachControllerMethods(DiscordSlateComposerController, [methods]);

module.exports = {
    DiscordSlateComposerController,
    SLATE_COMPOSER_METHOD_NAMES
};
