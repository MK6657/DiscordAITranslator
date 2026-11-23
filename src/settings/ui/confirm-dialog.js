"use strict";

const methods = {
    // The one confirmation helper: BetterDiscord's confirmation modal (danger style for destructive actions),
    // window.confirm only when that API is missing. Resolves true only when the user confirmed and the plugin
    // is still running. body is a string or a list of paragraphs; preview is quoted text shown as typed;
    // content (a React element) replaces both.
    confirmAction({ title = "", body = "", preview = "", content = null, confirmText = "", cancelText = "", danger = false } = {}) {
        const ui = globalThis.BdApi?.UI;
        const lifecycleToken = this.plugin.getLifecycleToken();
        const paragraphs = (Array.isArray(body) ? body : [body]).map(text => String(text ?? "").trim()).filter(Boolean);
        const previewText = String(preview ?? "").trim();
        const confirmNatively = () => {
            const text = [String(title || "").trim(), ...paragraphs, previewText].filter(Boolean).join("\n\n");
            try {
                return typeof window !== "undefined" && typeof window.confirm === "function" && Boolean(window.confirm(text));
            }
            catch {
                return false;
            }
        };
        if (typeof ui?.showConfirmationModal !== "function") {
            return Promise.resolve(confirmNatively() && this.plugin.isLifecycleTokenCurrent(lifecycleToken));
        }
        return new Promise(resolve => {
            let settled = false;
            let stopWatching = null;
            const release = this.holdConfirmDialogLayer();
            // stop() answers every open confirmation with "no" (see cancelPendingConfirmDialogs).
            const pending = this.plugin.pendingConfirmDialogs || (this.plugin.pendingConfirmDialogs = new Set());
            const settle = confirmed => {
                if (settled) return;
                settled = true;
                pending.delete(settle);
                stopWatching?.();
                release();
                resolve(Boolean(confirmed) && this.plugin.isLifecycleTokenCurrent(lifecycleToken));
            };
            pending.add(settle);
            const dialogsBefore = this.getOpenDialogElements();
            try {
                ui.showConfirmationModal(title, content ?? this.createConfirmDialogContent(paragraphs, previewText), {
                    danger: Boolean(danger),
                    confirmText: confirmText || this.plugin.t("dialogConfirm"),
                    cancelText: cancelText || this.plugin.t("dialogCancel"),
                    onConfirm: () => settle(true),
                    onCancel: () => settle(false),
                    // Reported by newer BetterDiscord builds on Escape or a backdrop click. Deferred so a close
                    // that follows the confirm callback in the same click cannot turn it into a cancel. When the
                    // content failed to render, BetterDiscord closes this dialog and shows its fallback modal
                    // with the same callbacks instead; that close is not a cancel while the fallback is open.
                    onClose: () => setTimeout(() => {
                        if (!this.getNewConfirmDialogElements(dialogsBefore, ".bd-modal-wrapper").length) settle(false);
                    }, 0)
                });
            }
            catch (error) {
                this.plugin.logDiagnostic("dialog.confirm", "error", { error: this.plugin.formatError(error) });
                settle(confirmNatively());
                return;
            }
            if (!settled) stopWatching = this.watchConfirmDialogDismiss(dialogsBefore, () => settle(false), release);
        });
    },

    // Plugin stop: every open confirmation resolves false and the settings window leaves its paused state.
    cancelPendingConfirmDialogs() {
        [...(this.plugin.pendingConfirmDialogs || [])].forEach(settle => settle(false));
        this.plugin.pendingConfirmDialogs?.clear();
        this.plugin.openConfirmDialogCount = 0;
        this.syncConfirmDialogLayer();
    },

    // Paragraphs plus an optional quoted preview. React elements when BetterDiscord exposes React (the preview
    // then stays plain text instead of going through Discord's Markdown), otherwise one string.
    createConfirmDialogContent(paragraphs = [], preview = "") {
        const React = globalThis.BdApi?.React;
        if (typeof React?.createElement !== "function") {
            return [...paragraphs, preview].filter(Boolean).join("\n\n");
        }
        const h = React.createElement;
        return h("div", { className: "dait-dialog", ...this.getDialogPanelThemeProps() },
            ...paragraphs.map((text, index) => h("p", { className: "dait-dialog-text", key: `p${index}` }, text)),
            preview ? h("div", { className: "dait-dialog-preview", key: "preview", tabIndex: 0 }, preview) : null
        );
    },

    // Dialog content sits inside Discord's modal, between Discord's own title and buttons: it takes the palette of
    // that modal, whatever ui.panelTheme says, so the dialog is one piece and its text always reads. Until the
    // content is in the page it goes by Discord's theme; once mounted (the ref) it goes by the modal's actual
    // background, and PanelTheme.refresh() checks it again when Discord's theme changes. Without a Discord theme or
    // a readable modal background it brings its own background in the current palette (css/08-dialogs).
    getDialogPanelThemeProps() {
        const discordTheme = this.plugin.panelTheme.getDiscordTheme();
        const props = {
            "data-dait-panel-theme": discordTheme || this.plugin.resolvePanelTheme(),
            ref: node => this.syncDialogPanelTheme(node)
        };
        if (!discordTheme) props["data-dait-dialog-surface"] = "true";
        return props;
    },

    syncDialogPanelTheme(node) {
        if (!node) return "";
        try {
            return this.plugin.panelTheme.syncDialog(node);
        }
        catch (error) {
            this.plugin.logDiagnostic?.("dialog.theme", "warn", { error: this.plugin.formatError?.(error) });
            return "";
        }
    },

    // Where a confirmation can show up: Discord's modal layer (role=dialog), BetterDiscord's modal root, and
    // BetterDiscord's fallback modal (.bd-modal-wrapper, no role), used when Discord's modal API is missing or
    // the dialog content failed to render.
    getOpenDialogElements(selectors = ["[role='dialog']", ".bd-modal-root", ".bd-modal-wrapper"]) {
        if (typeof document === "undefined" || !document.querySelectorAll) return new Set();
        const found = new Set();
        for (const selector of [].concat(selectors)) {
            try {
                document.querySelectorAll(selector).forEach(node => found.add(node));
            }
            catch {}
        }
        return found;
    },

    // Dialog elements that opened after dialogsBefore was taken and are still in the document.
    getNewConfirmDialogElements(dialogsBefore, selectors = undefined) {
        return [...this.getOpenDialogElements(selectors)].filter(node => !dialogsBefore?.has?.(node)
            && node.isConnected !== false
            && !node.closest?.(".dait-quick-settings-modal-root, .dait-settings"));
    },

    // Older BetterDiscord builds report neither Escape nor a backdrop click, and the fallback modal never reports
    // a backdrop click. Once the dialog showed up, the confirmation counts as cancelled when no dialog that opened
    // with it is left, so a dismissed dialog never leaves the settings window lowered. When no dialog shows up
    // within 10 s, onNotFound gives the settings window its layer and keys back; the dialog's buttons still answer.
    watchConfirmDialogDismiss(dialogsBefore, onDismiss, onNotFound = null) {
        if (typeof document === "undefined" || typeof setInterval !== "function") return () => {};
        let seen = false;
        let polls = 0;
        let timer = null;
        const stop = () => {
            if (timer) clearInterval(timer);
            timer = null;
        };
        timer = this.plugin.unrefTimer(setInterval(() => {
            if (!this.plugin.isStarted) {
                stop();
                onDismiss();
                return;
            }
            if (this.getNewConfirmDialogElements(dialogsBefore).length) {
                seen = true;
                return;
            }
            if (seen) {
                stop();
                onDismiss();
                return;
            }
            if (++polls > 40) {
                stop();
                onNotFound?.();
            }
        }, 250));
        return stop;
    },

    // The settings window sits above Discord's layers. While a BetterDiscord dialog is open it steps below
    // them (see css/08-dialogs.js) and its own Escape and Tab handling pauses.
    holdConfirmDialogLayer() {
        this.plugin.openConfirmDialogCount = (Number(this.plugin.openConfirmDialogCount) || 0) + 1;
        this.syncConfirmDialogLayer();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.plugin.openConfirmDialogCount = Math.max(0, (Number(this.plugin.openConfirmDialogCount) || 0) - 1);
            this.syncConfirmDialogLayer();
        };
    },

    isConfirmDialogOpen() {
        return (Number(this.plugin.openConfirmDialogCount) || 0) > 0;
    },

    syncConfirmDialogLayer() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        const open = this.isConfirmDialogOpen();
        document.querySelectorAll(".dait-quick-settings-modal-root")?.forEach(root => {
            if (open) root.setAttribute?.("data-dait-confirm-open", "true");
            else root.removeAttribute?.("data-dait-confirm-open");
        });
    },

    // Reset dialog: says what returns to defaults and offers "keep API keys, key pool and templates" (ticked by
    // default). The checkbox needs BdApi.React; without it the plain confirmation always keeps them.
    async openResetSettingsDialog(options = {}) {
        const bdApi = globalThis.BdApi;
        const choice = { keepCredentials: true };
        const canUseCheckbox = typeof bdApi?.React?.createElement === "function" && typeof bdApi?.UI?.showConfirmationModal === "function";
        const confirmed = await this.plugin.confirmAction({
            title: this.plugin.t("resetDialogTitle"),
            ...(canUseCheckbox ? { content: this.createResetDialogContent(bdApi.React, choice) } : { body: this.plugin.t("resetConfirm") }),
            confirmText: this.plugin.t("reset"),
            danger: true
        });
        if (!confirmed) return false;
        const keepCredentials = canUseCheckbox ? choice.keepCredentials !== false : true;
        this.plugin.resetSettingsToDefaults({ keepCredentials });
        this.plugin.refreshOpenSettingsPanels(options.panel || null);
        return true;
    },

    createResetDialogContent(React, choice) {
        const h = React.createElement;
        const checkboxId = `dait-reset-keep-${Date.now().toString(36)}`;
        const lead = this.plugin.t("resetDialogLead");
        const items = ["resetDialogItemSettings", "resetDialogItemChannelRules", "resetDialogItemDisplay"].map(key => this.plugin.t(key));
        const credentials = this.plugin.t("resetDialogItemCredentials");
        const credentialsNote = this.plugin.t("resetDialogItemCredentialsNote");
        const keepLabel = this.plugin.t("resetKeepCredentials");
        const useState = typeof React.useState === "function" ? React.useState : null;
        const themeProps = this.getDialogPanelThemeProps();
        const ResetDialogBody = () => {
            const [keep, setKeep] = useState ? useState(choice.keepCredentials) : [choice.keepCredentials, null];
            const onChange = event => {
                choice.keepCredentials = Boolean(event?.target?.checked);
                if (setKeep) setKeep(choice.keepCredentials);
            };
            return h("div", { className: "dait-dialog", ...themeProps },
                h("p", { className: "dait-dialog-text" }, lead),
                h("ul", { className: "dait-dialog-list" },
                    ...items.map((text, index) => h("li", { key: `i${index}` }, text)),
                    h("li", { key: "credentials", className: `dait-dialog-list-conditional${keep ? "" : " dait-dialog-list-erased"}` },
                        credentials,
                        h("span", { className: "dait-dialog-note" }, credentialsNote))
                ),
                h("label", { className: "dait-dialog-check", htmlFor: checkboxId },
                    h("input", setKeep
                        ? { id: checkboxId, type: "checkbox", checked: keep, onChange }
                        : { id: checkboxId, type: "checkbox", defaultChecked: true, onChange }),
                    h("span", null, keepLabel)
                )
            );
        };
        return h(ResetDialogBody);
    }
};

module.exports = methods;
