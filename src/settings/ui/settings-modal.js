"use strict";

const { AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS } = require("../../constants");

const methods = {
    openQuickSettingsPanel(source = "quick", launcher = null) {
        if (typeof document === "undefined" || !document.body) {
            this.plugin.logQuickSettingsDiagnostic("open.start", "blocked", { reason: "missing-document-body", source });
            return null;
        }
        if (!this.plugin.isStarted) return null;
        const existingRoots = this.getQuickSettingsModalRoots();
        existingRoots.slice(1).forEach(root => {
            this.plugin.logQuickSettingsDiagnostic("open.start", "orphan-removed", {
                source,
                ...this.getQuickSettingsModalDebugMeta(root)
            });
            root.querySelectorAll?.(".dait-settings")?.forEach(panel => this.destroySettingsModalSizing(panel));
            root.remove?.();
        });
        const existing = existingRoots[0] || null;
        if (existing) {
            const existingDialog = this.findQuickSettingsDialog(existing);
            if (existingDialog) {
                const hasPanel = Boolean(existingDialog.querySelector?.(".dait-settings"));
                const hasFallback = Boolean(existingDialog.querySelector?.(".dait-quick-settings-error"));
                if (!hasPanel && !hasFallback) {
                    this.plugin.logQuickSettingsDiagnostic("open.start", "stale-existing", {
                        source,
                        reason: "empty-dialog",
                        ...this.getQuickSettingsModalDebugMeta(existing, existingDialog)
                    });
                    existing.remove?.();
                }
                else {
                document.body.appendChild(existing);
                this.plugin.quickSettingsModalRoot = existing;
                if (launcher?.focus) {
                    this.plugin.quickSettingsPreviousFocus = launcher;
                }
                else if (!existing.contains?.(document.activeElement)) {
                    this.plugin.quickSettingsPreviousFocus = document.activeElement || this.plugin.quickSettingsPreviousFocus || null;
                }
                this.setQuickSettingsLauncherButton(launcher || this.plugin.quickSettingsPreviousFocus || null, true);
                this.plugin.syncQuickSettingsThemeTree(existing);
                this.bindQuickSettingsModalKeydown(existing, existingDialog);
                this.syncQuickSettingsScrollPosition(existingDialog);
                this.bindSettingsScrollTracking(existingDialog.querySelector?.(".dait-settings"), existingDialog.querySelector?.(".dait-quick-settings-body"));
                this.focusQuickSettingsInitialControl(existingDialog);
                this.plugin.logQuickSettingsDiagnostic("open.start", "reuse-existing", {
                    source,
                    ...this.getQuickSettingsModalDebugMeta(existing, existingDialog)
                });
                this.scheduleQuickSettingsModalVerify(existing, existingDialog);
                return existing;
                }
            }
            else {
                this.plugin.logQuickSettingsDiagnostic("open.start", "stale-existing", {
                source,
                reason: "missing-dialog",
                rootChildCount: this.getElementChildCount(existing)
                });
                existing.remove?.();
            }
        }

        let root = null;
        let dialog = null;
        try {
            this.plugin.quickSettingsPreviousFocus = launcher?.focus ? launcher : document.activeElement || null;
            this.plugin.logQuickSettingsDiagnostic("open.start", "start", {
                source,
                viewportWidth: Number((typeof window !== "undefined" ? window.innerWidth : 0) || document.documentElement?.clientWidth || 0),
                viewportHeight: Number((typeof window !== "undefined" ? window.innerHeight : 0) || document.documentElement?.clientHeight || 0)
            });

            root = document.createElement("div");
            root.className = "dait-quick-settings-modal-root";
            root.dataset.daitQuickSettingsSource = source;
            this.setQuickSettingsLauncherButton(launcher || this.plugin.quickSettingsPreviousFocus || null, true);
            this.plugin.applyPanelTheme(root);

            const backdrop = document.createElement("div");
            backdrop.className = "dait-quick-settings-backdrop";
            root.appendChild(backdrop);

            // The tabbed panel fills the window and brings the only title bar (title, status, close); the
            // window adds no header or footer of its own.
            dialog = document.createElement("div");
            dialog.className = "dait-quick-settings-dialog";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            dialog.setAttribute("aria-label", this.plugin.t("settingsTitle"));

            const body = document.createElement("div");
            body.className = "dait-quick-settings-body";

            const panelStartedAt = Date.now();
            try {
                const panel = this.plugin.getSettingsPanel({ quickSettings: true });
                body.appendChild(panel);
                this.bindSettingsScrollTracking(panel, body);
                this.plugin.logQuickSettingsDiagnostic("panel.build", "success", {
                    source,
                    ms: Date.now() - panelStartedAt,
                    sectionCount: this.getQuickSettingsPanelSectionCount(panel),
                    dialogChildCount: this.getElementChildCount(dialog),
                    bodyChildCount: this.getElementChildCount(body)
                });
            }
            catch (error) {
                body.appendChild(this.createQuickSettingsErrorPanel(error, () => this.plugin.closeQuickSettingsPanel(root, "done")));
                this.plugin.logQuickSettingsDiagnostic("panel.build", "error", {
                    source,
                    ms: Date.now() - panelStartedAt,
                    errorName: error?.name || "",
                    errorText: this.plugin.formatError(error)
                });
                this.plugin.showToast(this.plugin.t("quickSettingsOpenFailed", { error: this.plugin.formatError(error) }), "error");
            }
            dialog.appendChild(body);

            dialog.addEventListener("pointerdown", event => event.stopPropagation());
            root.addEventListener("pointerdown", event => {
                if (event.target === root || event.target === backdrop) this.plugin.closeQuickSettingsPanel(root, "backdrop");
            });

            root.appendChild(dialog);
            this.plugin.quickSettingsModalRoot = root;
            this.bindQuickSettingsModalKeydown(root, dialog);
            document.body.appendChild(root);
            this.plugin.syncQuickSettingsThemeTree(root);
            this.syncQuickSettingsScrollPosition(dialog);
            this.focusQuickSettingsInitialControl(dialog);
            this.plugin.logQuickSettingsDiagnostic("dom.attach", "success", {
                source,
                ...this.getQuickSettingsModalDebugMeta(root, dialog)
            });
            this.scheduleQuickSettingsModalVerify(root, dialog);
            return root;
        }
        catch (error) {
            if (this.plugin.quickSettingsModalKeydown && typeof document !== "undefined") {
                document.removeEventListener?.("keydown", this.plugin.quickSettingsModalKeydown, true);
            }
            this.plugin.quickSettingsModalKeydown = null;
            if (root?.remove) root.remove();
            if (!root || root === this.plugin.quickSettingsModalRoot) this.plugin.quickSettingsModalRoot = null;
            this.plugin.logQuickSettingsDiagnostic("open.error", "error", {
                source,
                errorName: error?.name || "",
                errorText: this.plugin.formatError(error),
                hasRoot: Boolean(root),
                hasDialog: Boolean(dialog)
            });
            this.plugin.showToast(this.plugin.t("quickSettingsOpenFailed", { error: this.plugin.formatError(error) }), "error");
            return null;
        }
    },

    bindQuickSettingsModalKeydown(root, dialog) {
        if (this.plugin.quickSettingsModalKeydown && typeof document !== "undefined") {
            document.removeEventListener?.("keydown", this.plugin.quickSettingsModalKeydown, true);
        }
        this.plugin.quickSettingsModalKeydown = event => {
            // A key that ends an IME composition belongs to the input method.
            if (event?.isComposing) return;
            // A BetterDiscord dialog opened from these settings handles its own Escape and Tab.
            if (this.isConfirmDialogOpen()) return;
            // While the polishing hotkey is being recorded the recorder owns the keyboard; Escape only cancels it.
            const recorder = this.plugin.hotkeyRecordCleanup ? this.plugin.hotkeyRecordButton : null;
            if (recorder && dialog?.contains?.(recorder)) {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    this.plugin.clearHotkeyRecording();
                }
                return;
            }
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.plugin.closeQuickSettingsPanel(root, "escape");
                return;
            }
            if (event.key === "Tab") {
                this.trapQuickSettingsFocus(dialog, event);
            }
        };
        document.addEventListener?.("keydown", this.plugin.quickSettingsModalKeydown, true);
    },

    setQuickSettingsLauncherButton(button, expanded) {
        const previous = this.plugin.quickSettingsLauncherButton;
        if (previous && previous !== button && this.plugin.elementHasClassName(previous, "dait-quick-settings-button")) {
            previous.classList?.remove?.("dait-quick-settings-button-active");
            previous.setAttribute?.("aria-expanded", "false");
        }
        this.plugin.quickSettingsLauncherButton = expanded && button?.focus ? button : null;
        if (!button?.setAttribute || !this.plugin.elementHasClassName(button, "dait-quick-settings-button")) return;
        button.classList?.toggle?.("dait-quick-settings-button-active", Boolean(expanded));
        button.setAttribute("aria-expanded", expanded ? "true" : "false");
    },

    focusQuickSettingsInitialControl(dialog) {
        const focusTarget = dialog?.querySelector?.(".dait-settings-close")
            || dialog?.querySelector?.(".dait-quick-settings-done")
            || this.getQuickSettingsFocusableElements(dialog)[0]
            || dialog;
        try {
            focusTarget?.focus?.({ preventScroll: true });
        }
        catch {
            try { focusTarget?.focus?.(); }
            catch {}
        }
    },

    syncQuickSettingsScrollPosition(dialog) {
        const body = dialog?.querySelector?.(".dait-quick-settings-body");
        const panel = dialog?.querySelector?.(".dait-settings");
        if (!body || !panel) return;
        const active = this.getSettingsActiveTab();
        if (!panel.querySelector?.(`[data-dait-settings-section='${active}']`)) {
            body.scrollTop = 0;
            return;
        }

        this.syncSettingsScrollPosition(panel, body, "auto");
    },

    trapQuickSettingsFocus(dialog, event) {
        const focusable = this.getQuickSettingsFocusableElements(dialog);
        if (!focusable.length) {
            event.preventDefault?.();
            dialog?.focus?.();
            return;
        }
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!active || !dialog?.contains?.(active)) {
            event.preventDefault?.();
            first.focus?.();
            return;
        }
        if (event.shiftKey && active === first) {
            event.preventDefault?.();
            last.focus?.();
            return;
        }
        if (!event.shiftKey && active === last) {
            event.preventDefault?.();
            first.focus?.();
        }
    },

    getQuickSettingsFocusableElements(root) {
        if (!root) return [];
        const selector = [
            "button:not([disabled])",
            "[href]",
            "input:not([disabled])",
            "select:not([disabled])",
            "textarea:not([disabled])",
            "[tabindex]:not([tabindex='-1'])"
        ].join(",");
        const queried = [...(root.querySelectorAll?.(selector) || [])];
        const fallback = [];
        const visit = node => {
            for (const child of node?.children || []) {
                if (this.isFocusableQuickSettingsElement(child)) fallback.push(child);
                visit(child);
            }
        };
        visit(root);
        return [...new Set([...queried, ...fallback])].filter(element => this.isFocusableQuickSettingsElement(element, root));
    },

    // Only controls the user can reach: not on a hidden tab page (or in another hidden part) and, where there is
    // layout, rendered at all (a closed <details>, a display:none toolbar).
    isFocusableQuickSettingsElement(element, root = null) {
        if (!element || element.disabled || element.hidden || element.removed) return false;
        for (let node = element.parentElement; node && node !== root; node = node.parentElement) {
            if (node.hidden === true) return false;
        }
        if (typeof element.getClientRects === "function" && element.isConnected && !element.getClientRects().length) return false;
        const tag = String(element.tagName || "").toLowerCase();
        if (["button", "input", "select", "textarea", "a"].includes(tag)) return true;
        const tabindex = element.getAttribute?.("tabindex");
        return tabindex !== undefined && tabindex !== null && tabindex !== "-1";
    },

    // Shown in the window when the panel cannot be built; without the panel's title bar it carries its own close button.
    createQuickSettingsErrorPanel(error, onClose = null) {
        const panel = document.createElement("div");
        panel.className = "dait-quick-settings-error";
        const title = document.createElement("h3");
        title.textContent = this.plugin.t("quickSettingsFallbackTitle");
        const detail = document.createElement("p");
        detail.textContent = this.plugin.t("quickSettingsOpenFailed", { error: this.plugin.formatError(error) });
        const hint = document.createElement("p");
        hint.textContent = this.plugin.t("quickSettingsFallbackHint");
        panel.appendChild(title);
        panel.appendChild(detail);
        panel.appendChild(hint);
        if (typeof onClose === "function") {
            const done = document.createElement("button");
            done.className = "dait-quick-settings-done";
            done.type = "button";
            done.textContent = this.plugin.t("quickSettingsDone");
            done.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                onClose();
            });
            panel.appendChild(done);
        }
        return panel;
    },

    findQuickSettingsDialog(root) {
        if (!root) return null;
        const direct = root.querySelector?.(".dait-quick-settings-dialog");
        if (direct) return direct;
        return [...(root.children || [])].find(child => String(child.className || "").split(/\s+/).includes("dait-quick-settings-dialog")) || null;
    },

    getQuickSettingsModalRoots() {
        if (typeof document === "undefined") return [];
        try {
            return [...(document.querySelectorAll?.(".dait-quick-settings-modal-root") || [])];
        }
        catch {
            const single = document.querySelector?.(".dait-quick-settings-modal-root");
            return single ? [single] : [];
        }
    },

    getQuickSettingsPanelSectionCount(panel) {
        try {
            return panel?.querySelectorAll?.("[data-dait-settings-section]")?.length || 0;
        }
        catch {
            return 0;
        }
    },

    getElementChildCount(node) {
        const count = Number(node?.childElementCount);
        if (Number.isFinite(count) && count >= 0) return count;
        return Array.isArray(node?.children) ? node.children.length : 0;
    },

    isNodeConnected(node) {
        if (!node) return false;
        if (typeof node.isConnected === "boolean") return node.isConnected;
        try {
            if (document?.body?.contains?.(node)) return true;
        }
        catch {}
        return Boolean(node.parentElement);
    },

    getElementRectSummary(node) {
        try {
            const rect = node?.getBoundingClientRect?.();
            if (!rect) return null;
            return {
                left: Math.round(Number(rect.left || 0)),
                top: Math.round(Number(rect.top || 0)),
                width: Math.round(Number(rect.width || 0)),
                height: Math.round(Number(rect.height || 0))
            };
        }
        catch {
            return null;
        }
    },

    getElementStyleSummary(node) {
        try {
            const style = window?.getComputedStyle?.(node);
            if (!style) return null;
            return {
                display: style.display || "",
                visibility: style.visibility || "",
                opacity: style.opacity || "",
                zIndex: style.zIndex || ""
            };
        }
        catch {
            return null;
        }
    },

    isQuickSettingsPanelOpen() {
        if (this.plugin.quickSettingsModalRoot && this.isNodeConnected(this.plugin.quickSettingsModalRoot)) return true;
        if (typeof document === "undefined") return false;
        try {
            return Boolean(document.querySelector?.(".dait-quick-settings-modal-root"));
        }
        catch {
            return false;
        }
    },

    resumeQuickSettingsDeferredWork(reason = "close") {
        if (!this.plugin.isStarted || this.plugin.isQuickSettingsPanelOpen()) return;
        const resumeScan = Boolean(this.plugin.quickSettingsScanDeferred);
        const resumeRender = Boolean(this.plugin.quickSettingsRenderDeferred && this.plugin.autoTranslationRenderQueue.length);
        this.plugin.quickSettingsScanDeferred = false;
        this.plugin.quickSettingsRenderDeferred = false;
        if (resumeScan) {
            this.plugin.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, trailing: true });
        }
        if (resumeRender) {
            this.plugin.scheduleAutoTranslationRenderQueue(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS);
        }
        if (resumeScan || resumeRender) {
            this.plugin.logDiagnostic("quick.settings.resume", "ok", {
                reason,
                scan: resumeScan,
                render: resumeRender,
                renderQueue: this.plugin.autoTranslationRenderQueue.length
            });
        }
    },

    getQuickSettingsModalDebugMeta(root, dialog = null) {
        const currentDialog = dialog || this.findQuickSettingsDialog(root);
        const panel = currentDialog?.querySelector?.(".dait-settings") || [...(currentDialog?.children || [])].find(child => String(child.className || "").split(/\s+/).includes("dait-settings")) || null;
        const fallback = currentDialog?.querySelector?.(".dait-quick-settings-error") || [...(currentDialog?.children || [])].find(child => String(child.className || "").split(/\s+/).includes("dait-quick-settings-error")) || null;
        const meta = {
            rootConnected: this.isNodeConnected(root),
            dialogConnected: this.isNodeConnected(currentDialog),
            panelConnected: this.isNodeConnected(panel),
            fallbackConnected: this.isNodeConnected(fallback),
            hasDialog: Boolean(currentDialog),
            hasPanel: Boolean(panel),
            hasFallback: Boolean(fallback),
            rootChildCount: this.getElementChildCount(root),
            dialogChildCount: this.getElementChildCount(currentDialog),
            panelSectionCount: this.getQuickSettingsPanelSectionCount(panel)
        };
        if (this.plugin.settings?.ui?.diagnosticsEnabled) {
            meta.rootRect = this.getElementRectSummary(root);
            meta.dialogRect = this.getElementRectSummary(currentDialog);
            meta.panelRect = this.getElementRectSummary(panel);
            meta.rootStyle = this.getElementStyleSummary(root);
            meta.dialogStyle = this.getElementStyleSummary(currentDialog);
            meta.panelStyle = this.getElementStyleSummary(panel);
        }
        return meta;
    },

    scheduleQuickSettingsModalVerify(root, dialog = null) {
        this.cancelQuickSettingsModalVerify();
        const token = ++this.plugin.quickSettingsVerifyToken;
        const verify = () => {
            if (token !== this.plugin.quickSettingsVerifyToken) return;
            this.plugin.quickSettingsVerifyRaf = null;
            this.plugin.quickSettingsVerifyTimer = null;
            if (!this.plugin.isStarted) return;
            if (root !== this.plugin.quickSettingsModalRoot) return;
            if (!root || !this.isNodeConnected(root)) return;
            const currentDialog = dialog || this.findQuickSettingsDialog(root);
            const meta = this.getQuickSettingsModalDebugMeta(root, currentDialog);
            if (!meta.hasDialog) {
                this.plugin.logQuickSettingsDiagnostic("visible.verify", "missing-dialog", meta);
                this.plugin.closeQuickSettingsPanel(root, "verify-missing-dialog");
                this.plugin.showToast(this.plugin.t("quickSettingsOpenFailed", { error: "missing dialog" }), "error");
                return;
            }
            if (!meta.hasPanel && !meta.hasFallback) {
                this.plugin.logQuickSettingsDiagnostic("visible.verify", "empty-dialog", meta);
                this.plugin.closeQuickSettingsPanel(root, "verify-empty-dialog");
                this.plugin.showToast(this.plugin.t("quickSettingsOpenFailed", { error: "empty dialog" }), "error");
                return;
            }
            this.plugin.logQuickSettingsDiagnostic("visible.verify", "ok", meta);
        };
        const requestFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
        if (requestFrame) this.plugin.quickSettingsVerifyRaf = requestFrame(verify);
        else this.plugin.quickSettingsVerifyTimer = setTimeout(verify, 0);
    },

    cancelQuickSettingsModalVerify() {
        this.plugin.quickSettingsVerifyToken++;
        const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
            ? window.cancelAnimationFrame.bind(window)
            : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
        if (this.plugin.quickSettingsVerifyRaf !== null && this.plugin.quickSettingsVerifyRaf !== undefined && cancelFrame) {
            cancelFrame(this.plugin.quickSettingsVerifyRaf);
        }
        if (this.plugin.quickSettingsVerifyTimer !== null && this.plugin.quickSettingsVerifyTimer !== undefined) {
            clearTimeout(this.plugin.quickSettingsVerifyTimer);
        }
        this.plugin.quickSettingsVerifyRaf = null;
        this.plugin.quickSettingsVerifyTimer = null;
    },

    closeQuickSettingsPanel(root = this.plugin.quickSettingsModalRoot, reason = "close") {
        // A hotkey recording started in this window must not outlive it and swallow later typing.
        this.plugin.clearHotkeyRecordingWithin(root);
        if (!root && typeof document !== "undefined") {
            this.cancelQuickSettingsModalVerify();
            const roots = this.getQuickSettingsModalRoots();
            roots.forEach(node => this.plugin.closeQuickSettingsPanel(node, reason));
            if (this.plugin.quickSettingsModalKeydown) {
                document.removeEventListener?.("keydown", this.plugin.quickSettingsModalKeydown, true);
                this.plugin.quickSettingsModalKeydown = null;
            }
            this.plugin.quickSettingsModalRoot = null;
            this.plugin.quickSettingsPreviousFocus = null;
            this.setQuickSettingsLauncherButton(null, false);
            this.resumeQuickSettingsDeferredWork(reason);
            return;
        }
        this.cancelQuickSettingsModalVerify();
        if (this.plugin.quickSettingsModalKeydown && typeof document !== "undefined") {
            document.removeEventListener?.("keydown", this.plugin.quickSettingsModalKeydown, true);
        }
        this.plugin.quickSettingsModalKeydown = null;
        if (root) {
            this.plugin.commitSettingsControls(root);
            this.plugin.flushSettings({ force: true, retryOnError: false });
            root.querySelectorAll?.(".dait-settings")?.forEach(panel => this.destroySettingsModalSizing(panel));
        }
        if (root && this.plugin.isStarted) {
            this.plugin.logQuickSettingsDiagnostic("close", "ok", {
                reason,
                ...this.getQuickSettingsModalDebugMeta(root)
            });
        }
        if (root?.remove) root.remove();
        if (!root || root === this.plugin.quickSettingsModalRoot) this.plugin.quickSettingsModalRoot = null;
        const previousFocus = this.plugin.quickSettingsPreviousFocus;
        this.plugin.quickSettingsPreviousFocus = null;
        this.setQuickSettingsLauncherButton(null, false);
        if (previousFocus?.focus && this.isNodeConnected(previousFocus)) {
            try {
                previousFocus.focus({ preventScroll: true });
            }
            catch {
                try { previousFocus.focus(); }
                catch {}
            }
        }
        this.resumeQuickSettingsDeferredWork(reason);
    }
};

module.exports = methods;
