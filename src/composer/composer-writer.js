"use strict";

class ComposerWriter {
    constructor(plugin) {
        this.plugin = plugin;
        this.activeWriteTokens = new Map();
        this.writeTokenCounter = 0;
    }

    replaceTextSafely(textbox, text, options = {}) {
        if (options.writeToken && !this.isWriteTokenCurrent(options.writeToken)) {
            return Promise.resolve({ ok: false, reason: "write-cancelled", actual: this.plugin.getTextboxTextSafe(textbox) });
        }
        return this.plugin.replaceTextboxTextSafelyAsync(textbox, text, options);
    }

    submit(textbox) {
        return this.plugin.submitTextbox(textbox);
    }

    beginWrite(textbox, previousText = "") {
        const composerKey = this.plugin.getTextboxComposerKey(textbox);
        this.cancelActiveWrite(composerKey, "superseded");
        const token = {
            id: ++this.writeTokenCounter,
            composerKey,
            textbox,
            previousText: this.plugin.normalizeDraftRawText(previousText),
            cancelled: false,
            cleanup: null
        };
        token.cleanup = this.addUserInputCancelListeners(token);
        this.activeWriteTokens.set(composerKey, token);
        return token;
    }

    cancelActiveWrite(composerKey, reason = "cancelled") {
        const token = this.activeWriteTokens.get(composerKey);
        if (token) this.cancelWriteToken(token, reason);
    }

    cancelWriteToken(token, reason = "cancelled") {
        if (!token || token.cancelled) return;
        token.cancelled = true;
        token.reason = reason;
        if (this.activeWriteTokens.get(token.composerKey) === token) this.activeWriteTokens.delete(token.composerKey);
        try { token.cleanup?.(); }
        catch {}
        token.cleanup = null;
    }

    finishWriteToken(token) {
        if (!token) return;
        if (this.activeWriteTokens.get(token.composerKey) === token) this.activeWriteTokens.delete(token.composerKey);
        try { token.cleanup?.(); }
        catch {}
        token.cleanup = null;
    }

    cancelAll(reason = "cancelled") {
        [...this.activeWriteTokens.values()].forEach(token => this.cancelWriteToken(token, reason));
        this.activeWriteTokens.clear();
    }

    isWriteTokenCurrent(token) {
        return Boolean(token
            && !token.cancelled
            && token.textbox?.isConnected !== false
            && this.activeWriteTokens.get(token.composerKey) === token);
    }

    addUserInputCancelListeners(token) {
        const textbox = token?.textbox;
        if (!textbox?.addEventListener) return null;
        const cancel = event => {
            if (event?.isTrusted !== true) return;
            this.cancelWriteToken(token, "user-input");
        };
        // Only events that change the draft cancel the write. Arrow keys, Shift or Ctrl+C must not
        // throw a finished result away; other edits are caught by the stale-draft check before writing.
        const events = ["beforeinput", "input", "paste", "cut", "drop", "compositionstart"];
        events.forEach(type => textbox.addEventListener(type, cancel, true));
        return () => events.forEach(type => textbox.removeEventListener?.(type, cancel, true));
    }
}

module.exports = { ComposerWriter };
