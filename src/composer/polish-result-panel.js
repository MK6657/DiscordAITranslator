"use strict";

const methods = {
    showPolishResultPanel(textbox, text, options = {}) {
        if (typeof document === "undefined") return;
        this.removePolishResultPanel();
        this.removePolishRestoreControl();
        if (options.adjustTextboxSelection === true) {
            this.plugin.applyTextboxReplacementSelection(textbox, { blurAfterReplace: Boolean(options.blurAfterReplace), extraBlurTarget: options.sourceButton });
        }

        const panel = document.createElement("div");
        panel.className = "dait-polish-result-panel";
        this.plugin.applyPanelTheme(panel);
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", options.ariaLabel || options.title || this.plugin.t("polishResultTitle"));

        const header = document.createElement("div");
        header.className = "dait-polish-result-header";

        const title = document.createElement("div");
        title.className = "dait-polish-result-title";
        title.textContent = options.title || this.plugin.t("polishResultTitle");
        header.appendChild(title);

        const close = document.createElement("button");
        close.className = "dait-polish-result-icon";
        close.type = "button";
        close.appendChild(this.plugin.createWindowIcon("close"));
        close.title = this.plugin.t("polishResultClose");
        close.setAttribute("aria-label", this.plugin.t("polishResultClose"));
        close.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.removePolishResultPanel();
        });
        header.appendChild(close);
        panel.appendChild(header);

        const output = document.createElement("div");
        output.className = "dait-polish-result-output";
        output.tabIndex = 0;
        output.textContent = String(text || "");
        panel.appendChild(output);

        const actions = document.createElement("div");
        actions.className = "dait-polish-result-actions";

        if (textbox && options.allowApply !== false) {
            const panelOriginRouteKey = options.originRouteKey !== undefined ? String(options.originRouteKey || "") : this.plugin.getCurrentRouteKey();
            const panelOriginComposerKey = options.originComposerKey !== undefined ? String(options.originComposerKey || "") : this.getTextboxComposerKey(textbox);
            const apply = document.createElement("button");
            apply.className = "dait-polish-result-action dait-polish-result-apply";
            apply.type = "button";
            apply.textContent = this.plugin.t("polishResultReplace");
            apply.addEventListener("click", async event => {
                event.preventDefault();
                event.stopPropagation();
                if (apply.disabled) return;
                apply.disabled = true;
                try {
                    await this.plugin.applyPolishResultPanelText(textbox, String(text || ""), {
                        onApplied: options.onApplied,
                        originRouteKey: panelOriginRouteKey,
                        originComposerKey: panelOriginComposerKey,
                        sourceText: options.sourceText
                    });
                }
                finally {
                    apply.disabled = false;
                }
            });
            actions.appendChild(apply);
        }

        const copy = document.createElement("button");
        copy.className = "dait-polish-result-action primary";
        copy.type = "button";
        copy.textContent = this.plugin.t("polishResultCopy");
        copy.addEventListener("click", async event => {
            event.preventDefault();
            event.stopPropagation();
            try {
                await this.plugin.copyTextToClipboard(String(text || ""));
                this.removePolishResultPanel();
            }
            catch (error) {
                this.plugin.showToast(this.plugin.t("promptCopyFailed", { error: this.plugin.formatError(error) }), "error");
                this.focusPolishResultOutput(output);
            }
        });
        actions.appendChild(copy);

        panel.appendChild(actions);
        ["pointerdown", "mousedown", "click"].forEach(type => {
            panel.addEventListener(type, event => event.stopPropagation());
        });

        document.body.appendChild(panel);
        this.plugin.polishResultPanel = panel;
        const anchorNode = textbox || options.sourceButton;
        let repositionRaf = null;
        const reposition = () => {
            repositionRaf = null;
            if (!panel.isConnected) return;
            this.positionPolishResultPanel(panel, textbox, options.sourceButton);
        };
        const onResize = () => {
            if (repositionRaf !== null) {
                try { window.cancelAnimationFrame?.(repositionRaf); }
                catch {}
                repositionRaf = null;
            }
            if (!panel.isConnected) return;
            this.plugin.applyPanelTheme(panel);
            reposition();
        };
        const onScroll = event => {
            if (event?.target && event.target !== window && event.target !== document && anchorNode && !event.target.contains?.(anchorNode)) {
                return;
            }
            if (repositionRaf !== null) return;
            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
                repositionRaf = window.requestAnimationFrame(reposition);
            }
            else {
                reposition();
            }
        };
        const outsidePointerDown = event => {
            if (panel.contains?.(event.target)) return;
            this.removePolishResultPanel();
        };
        const escapeKeydown = event => {
            if (event.isComposing || event.keyCode === 229 || event.key !== "Escape") return;
            event.preventDefault?.();
            event.stopPropagation?.();
            this.removePolishResultPanel();
        };
        this.plugin.polishResultPanelCleanup = () => {
            if (repositionRaf !== null && typeof window !== "undefined") {
                window.cancelAnimationFrame?.(repositionRaf);
                repositionRaf = null;
            }
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", onResize, { capture: true });
                window.removeEventListener?.("scroll", onScroll, { capture: true });
            }
            document.removeEventListener?.("pointerdown", outsidePointerDown, true);
            document.removeEventListener?.("keydown", escapeKeydown, true);
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", onResize, { capture: true, passive: true });
            window.addEventListener?.("scroll", onScroll, { capture: true, passive: true });
        }
        document.addEventListener?.("pointerdown", outsidePointerDown, true);
        document.addEventListener?.("keydown", escapeKeydown, true);
        onResize();
    },

    focusPolishResultOutput(output) {
        if (!output) return;
        try { output.focus?.({ preventScroll: true }); }
        catch {
            try { output.focus?.(); }
            catch {}
        }
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange) return;
        try {
            const range = document.createRange();
            range.selectNodeContents(output);
            selection.removeAllRanges?.();
            selection.addRange?.(range);
        }
        catch {}
    },

    positionPolishResultPanel(panel, textbox, sourceButton = null) {
        if (!panel?.style || typeof window === "undefined") return;
        const anchor = textbox?.getBoundingClientRect?.() || sourceButton?.getBoundingClientRect?.() || null;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 900;
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 700;
        const width = Math.min(440, Math.max(260, viewportWidth - 32));
        const leftBase = anchor ? anchor.left : viewportWidth - width - 24;
        const left = Math.max(16, Math.min(leftBase, viewportWidth - width - 16));
        const bottom = anchor ? Math.max(16, viewportHeight - anchor.top + 10) : 96;
        const safeBottom = Math.min(Math.max(bottom, 16), Math.max(16, viewportHeight - 120));
        const maxHeight = Math.max(140, viewportHeight - safeBottom - 16);
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
        panel.style.bottom = `${safeBottom}px`;
        panel.style.maxHeight = `${maxHeight}px`;
        panel.style.width = `${width}px`;
    },

    removePolishResultPanel() {
        this.plugin.polishResultPanelCleanup?.();
        this.plugin.polishResultPanelCleanup = null;
        this.plugin.polishResultPanel?.remove?.();
        this.plugin.polishResultPanel = null;
    },

    // The panel's "Insert into input" action: an explicit user request, so it replaces whatever the
    // composer holds now (Discord's undo brings the previous draft back). `options.onApplied(target)`
    // runs after a verified write so the run that produced the text can record it.
    async applyPolishResultPanelText(textbox, text, options = {}) {
        const originRouteKey = String(options.originRouteKey || "");
        const currentRouteKey = this.plugin.getCurrentRouteKey();
        if (originRouteKey && currentRouteKey && originRouteKey !== currentRouteKey) {
            this.plugin.showToast(this.plugin.t("composerChannelChanged"), "info");
            return false;
        }
        const target = textbox && textbox.isConnected !== false ? textbox : this.plugin.resolveInputActionTextbox(null, {});
        if (!target) {
            this.plugin.showToast(this.plugin.t("textboxMissing"), "error");
            return false;
        }
        const originComposerKey = String(options.originComposerKey || "");
        const targetComposerKey = this.getTextboxComposerKey(target);
        if (originComposerKey && targetComposerKey && originComposerKey !== targetComposerKey) {
            this.plugin.showToast(this.plugin.t("composerChannelChanged"), "info");
            return false;
        }
        const safeText = options.sourceText !== undefined
            ? this.sanitizeComposerGeneratedOutput(options.sourceText, text, "panel")
            : String(text || "");
        const currentText = this.plugin.getTextboxDraftText(target);
        const writeToken = this.plugin.composerWriter.beginWrite(target, currentText);
        let result = null;
        try {
            result = await this.plugin.composerWriter.replaceTextSafely(target, safeText, {
                blurAfterReplace: false,
                expectedPreviousText: currentText,
                writeToken
            });
        }
        finally {
            this.plugin.composerWriter.finishWriteToken(writeToken);
        }
        if (result?.ok) {
            this.removePolishResultPanel();
            options.onApplied?.(target);
            return true;
        }
        if (result?.reason !== "write-cancelled") this.plugin.showToast(this.plugin.t("polishResultApplyFailed"), "error");
        return false;
    },

    showRestoreOriginalControl(textbox, session, sourceButton = null) {
        const originalText = session?.originalRawText ?? session?.originalText;
        if (typeof document === "undefined" || !originalText) return;
        this.removePolishRestoreControl();
        this.removeInputActionMenu();

        const container = this.plugin.getPolishButtonContainer(textbox);
        const group = container ? this.getInputActionGroup(container) : null;
        if (group) {
            this.syncInputRestoreButtonState(group, textbox, { restoreSession: session });
            this.plugin.syncInputActionButtonThemes(group, textbox || sourceButton || container);
            this.syncInputActionGroupState(group, textbox, container);
            return;
        }

        const button = document.createElement("button");
        button.className = "dait-polish-restore-control";
        this.plugin.syncDiscordThemeClasses(button, textbox || sourceButton);
        button.type = "button";
        button.textContent = this.plugin.t("restoreOriginal");
        ["pointerdown", "mousedown"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
            });
        });
        button.addEventListener("click", async event => {
            event.preventDefault();
            event.stopPropagation();
            await this.restorePolishOriginal(textbox, session, sourceButton);
        });

        document.body.appendChild(button);
        this.plugin.polishRestoreControl = button;
        const anchorNode = sourceButton || textbox;
        let repositionRaf = null;
        const reposition = () => {
            repositionRaf = null;
            if (!button.isConnected) return;
            this.positionPolishRestoreControl(button, textbox, sourceButton);
        };
        const onResize = () => {
            if (repositionRaf !== null) {
                try { window.cancelAnimationFrame?.(repositionRaf); }
                catch {}
                repositionRaf = null;
            }
            if (!button.isConnected) return;
            this.plugin.syncDiscordThemeClasses(button, textbox || sourceButton);
            reposition();
        };
        const onScroll = event => {
            if (event?.target && event.target !== window && event.target !== document && anchorNode && !event.target.contains?.(anchorNode)) {
                return;
            }
            if (repositionRaf !== null) return;
            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
                repositionRaf = window.requestAnimationFrame(reposition);
            }
            else {
                reposition();
            }
        };
        const timeout = typeof window !== "undefined" && typeof window.setTimeout === "function"
            ? window.setTimeout(() => this.removePolishRestoreControl(), 8000)
            : null;
        this.plugin.polishRestoreControlCleanup = () => {
            if (repositionRaf !== null && typeof window !== "undefined") {
                window.cancelAnimationFrame?.(repositionRaf);
                repositionRaf = null;
            }
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", onResize, { capture: true });
                window.removeEventListener?.("scroll", onScroll, { capture: true });
                if (timeout) window.clearTimeout?.(timeout);
            }
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", onResize, { capture: true, passive: true });
            window.addEventListener?.("scroll", onScroll, { capture: true, passive: true });
        }
        onResize();
    },

    async restorePolishOriginal(textbox, session, sourceButton = null) {
        const lifecycleToken = this.plugin.getLifecycleToken();
        if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return false;
        const originalText = session?.originalRawText ?? session?.originalText;
        if (!originalText) return false;
        if (!this.canRestorePolishOriginal(textbox, session)) {
            this.removePolishRestoreControl();
            this.removeInputActionMenu();
            this.plugin.injectInputButtons();
            this.plugin.showToast(this.plugin.t("restoreOriginalChanged"), "info");
            return false;
        }
        const currentText = this.plugin.getTextboxDraftText(textbox);
        const writeToken = this.plugin.composerWriter.beginWrite(textbox, currentText);
        try {
            const result = await this.plugin.composerWriter.replaceTextSafely(textbox, originalText, {
                blurAfterReplace: false,
                extraBlurTarget: sourceButton,
                expectedPreviousText: currentText,
                writeToken,
                lifecycleToken
            });
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || textbox.isConnected === false
                || this.getTextboxComposerKey(textbox) !== writeToken.composerKey) return false;
            const writeCurrent = this.plugin.composerWriter.isWriteTokenCurrent(writeToken);
            if (!writeCurrent && !this.plugin.isComposerWriteTakenOverByUser(textbox, { writeToken })) return false;
            if (result?.ok && (writeCurrent ? this.isCurrentDraftText(textbox, originalText) : result.userEditedAfter)) {
                // The draft is the original again: nothing is left to restore, and the original must not
                // count as already polished for the next bilingual-with-polish run.
                session.lastWrittenText = "";
                session.lastWrittenRawText = "";
                session.updatedAt = Date.now();
                this.plugin.polishSession = session;
                this.removePolishRestoreControl();
                this.removeInputActionMenu();
                this.plugin.injectInputButtons();
                return true;
            }
            this.plugin.showPolishResultPanel(textbox, originalText, { sourceButton });
            return false;
        }
        finally {
            this.plugin.composerWriter.finishWriteToken(writeToken);
        }
    },

    canRestorePolishOriginal(textbox, session) {
        if (!textbox || textbox.isConnected === false || !session) return false;
        if (session.composerKey && this.getTextboxComposerKey(textbox) !== session.composerKey) return false;
        const current = this.plugin.getTextboxDraftText(textbox);
        // Nothing to restore when the draft already is the original (for example right after a restore).
        if (this.areDraftTextsEqualStrict(current, session.originalRawText ?? session.originalText)) return false;
        const candidates = [
            session.lastWrittenRawText,
            session.lastResultRawText,
            session.lastBilingualRawText,
            session.lastWrittenText,
            session.lastResult,
            session.lastBilingualText
        ].filter(value => value !== undefined && value !== null && value !== "");
        return candidates.some(value => this.areDraftTextsEqualStrict(current, value));
    },

    positionPolishRestoreControl(button, textbox, sourceButton = null) {
        if (!button?.style || typeof window === "undefined") return;
        const anchor = sourceButton?.getBoundingClientRect?.() || textbox?.getBoundingClientRect?.() || null;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 900;
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 700;
        const width = 86;
        const leftBase = anchor ? anchor.left - width - 8 : viewportWidth - width - 24;
        const left = Math.max(16, Math.min(leftBase, viewportWidth - width - 16));
        const bottom = anchor ? Math.max(16, viewportHeight - anchor.bottom) : 72;
        button.style.left = `${left}px`;
        button.style.bottom = `${Math.min(Math.max(bottom, 16), Math.max(16, viewportHeight - 48))}px`;
    },

    removePolishRestoreControl() {
        this.plugin.polishRestoreControlCleanup?.();
        this.plugin.polishRestoreControlCleanup = null;
        this.plugin.polishRestoreControl?.remove?.();
        this.plugin.polishRestoreControl = null;
    },

    setTemporaryButtonText(button, text, fallback, delay = 1200) {
        if (!button) return;
        button.textContent = text;
        setTimeout(() => {
            if (button.isConnected) button.textContent = fallback;
        }, delay);
    }
};

module.exports = methods;
