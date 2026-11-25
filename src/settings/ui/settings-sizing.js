"use strict";

const { DISCORD_THEME_VARIABLES } = require("../../constants");
const { SETTINGS_WINDOW_MAX_WIDTH } = require("../settings-schema");

const methods = {
    replaceSettingsPanelFrom(source) {
        const panel = source?.closest?.(".dait-settings");
        if (panel) this.plugin.replaceSettingsPanelElement(panel);
    },

    // Rebuilds the panel in place (provider or language change, reset) and keeps the tab, the scroll position and
    // the focused control.
    replaceSettingsPanelElement(panel, nextPanel = null) {
        if (!panel) return null;
        // Already rebuilt earlier in the same change (the language select rebuilds its panel after setSetting, which
        // has rebuilt it for the new language): hand back that panel instead of building a third one.
        if (panel.__daitReplacedBy && panel.isConnected === false) return panel.__daitReplacedBy;
        const scrollTop = Number(panel.__daitSettingsUi?.content?.scrollTop || 0);
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const focusOwner = active && panel.contains?.(active)
            ? (active.dataset?.daitPath ? active : active.closest?.("[data-dait-path]"))
            : null;
        const focusPath = focusOwner ? String(focusOwner.dataset?.daitPath || "") : "";
        const focusSavedKind = !focusPath && active && panel.contains?.(active) ? String(active.dataset?.daitSavedConfigs || "") : "";
        const focusUiId = !focusPath && !focusSavedKind && active && panel.contains?.(active) ? String(active.dataset?.daitUiFocusId || "") : "";
        const openDetails = new Set(
            [...(panel.querySelectorAll?.("details[data-dait-details-key]") || [])]
                .filter(node => node?.open)
                .map(node => `${node.closest?.(".dait-settings-tabpanel")?.dataset?.daitSettingsTabPanel || ""}:${node.dataset?.daitDetailsKey || ""}`)
        );
        // A reset restores the default tab; the rebuilt panel still opens where the user was.
        const activeTab = panel.__daitSettingsUi?.activeTab;
        if (activeTab && this.plugin.settings?.ui) this.plugin.settings.ui.settingsActiveTab = activeTab;
        nextPanel = nextPanel || this.plugin.getSettingsPanel({ quickSettings: panel.dataset?.daitQuickSettings === "true" });
        if (openDetails.size) {
            [...(nextPanel.querySelectorAll?.("details[data-dait-details-key]") || [])].forEach(node => {
                const detailsId = `${node.closest?.(".dait-settings-tabpanel")?.dataset?.daitSettingsTabPanel || ""}:${node.dataset?.daitDetailsKey || ""}`;
                if (openDetails.has(detailsId)) node.open = true;
            });
        }
        ["--dait-host-chrome", "--dait-host-max"].forEach(name => {
            const value = panel.style?.getPropertyValue?.(name);
            if (value) nextPanel.style?.setProperty?.(name, value);
        });
        this.destroySettingsModalSizing(panel);
        panel.replaceWith?.(nextPanel);
        panel.__daitReplacedBy = nextPanel;
        const content = nextPanel.__daitSettingsUi?.content;
        if (content && scrollTop) content.scrollTop = scrollTop;
        if (focusPath) {
            const control = [...(nextPanel.querySelectorAll?.(`[data-dait-path='${focusPath}']`) || [])].find(node => !node.closest?.("[hidden]"));
            const focusTarget = control?.dataset?.daitControl === "language"
                ? (control.querySelector?.("input:not([hidden]), select") || control)
                : control?.dataset?.daitControl === "segmented"
                    ? (control.querySelector?.("[tabindex='0']") || control)
                    : control;
            for (let ancestor = focusTarget?.parentElement; ancestor && ancestor !== nextPanel; ancestor = ancestor.parentElement) {
                if (String(ancestor.tagName || "").toUpperCase() === "DETAILS") ancestor.open = true;
            }
            this.focusSettingsElement(focusTarget);
        }
        else if (focusSavedKind) {
            const control = [...(nextPanel.querySelectorAll?.(`[data-dait-saved-configs='${focusSavedKind}']`) || [])].find(node => !node.closest?.("[hidden]"));
            this.focusSettingsElement(control);
        }
        else if (focusUiId) {
            const langMatch = /^(header|overview)-lang-(.+)$/.exec(focusUiId);
            const targetId = langMatch ? `${langMatch[1]}-lang-${this.plugin.getLocale()}` : focusUiId;
            const control = [...(nextPanel.querySelectorAll?.(`[data-dait-ui-focus-id='${targetId}']`) || [])].find(node => !node.closest?.("[hidden]"));
            this.focusSettingsElement(control);
        }
        if (nextPanel.dataset?.daitQuickSettings === "true") this.syncSettingsPanelHeight(nextPanel);
        return nextPanel;
    },

    // Kept for the quick-settings window, which calls it after inserting the panel. The tabbed window has no
    // scroll-spy; this shows the saved tab and fits the panel to its host.
    bindSettingsScrollTracking(panel, scroller = null) {
        const state = panel?.__daitSettingsUi;
        if (state) this.showSettingsTab(state, this.getSettingsActiveTab(), { save: false, resetScroll: false });
        this.syncSettingsPanelHeight(panel, scroller);
    },

    syncSettingsScrollPosition(panel, scroller = null) {
        const state = panel?.__daitSettingsUi;
        if (state) this.showSettingsTab(state, this.getSettingsActiveTab(), { save: false });
        this.syncSettingsPanelHeight(panel, scroller);
    },

    scheduleSettingsModalSizing(panel) {
        this.clearSettingsModalSizingSchedule(panel);
        const apply = () => this.applySettingsModalSizing(panel);
        const schedule = { raf: null, timers: [] };
        if (panel) panel.__daitSettingsModalSizingSchedule = schedule;
        if (panel?.isConnected) apply();
        if (typeof requestAnimationFrame === "function") {
            schedule.raf = requestAnimationFrame(() => {
                schedule.raf = null;
                apply();
            });
        }
        schedule.timers.push(setTimeout(apply, 50));
        schedule.timers.push(setTimeout(apply, 250));
        if (panel?.isConnected) this.plugin.watchSettingsModalSizingCleanup(panel);
    },

    // BetterDiscord 1.14+ renders plugin settings inline inside Discord's Settings content column (not a popup modal).
    // Detect inline views via both class hints and live geometry (handles obfuscated/renamed Discord class hashes)
    // so we never force a 920 px popup-modal width inside a narrower column beside Discord's Settings sidebar.
    isSettingsPanelInInlineDiscordView(panel) {
        if (!panel) return false;
        let inInlineColumn = false;
        for (let node = panel.parentElement; node && node !== document.body; node = node.parentElement) {
            const className = String(node.className?.baseVal ?? node.className ?? "");
            const role = String(node.getAttribute?.("role") || "");
            if (/(?:^|\s)(?:dait-quick-settings-dialog|bd-modal-root|bd-modal-wrapper)(?:\s|$)/.test(className)
                || /focusLock/i.test(className)
                || role === "dialog") {
                return false;
            }
            if (/(?:standardSidebarView|contentRegion|contentColumn|settingsContent|bd-addon-views|bd-settings)/i.test(className)) {
                inInlineColumn = true;
            }
        }
        if (inInlineColumn) return true;
        // Geometry fallback for obfuscated Discord classes: a right-hand Settings column starts well past the
        // sidebar (left >= 160 px) and extends toward the right edge of the viewport rather than centering inside a layer.
        try {
            const viewportWidth = Number(
                (typeof window !== "undefined" ? (window.visualViewport?.width || window.innerWidth) : 0)
                || (typeof document !== "undefined" ? document.documentElement?.clientWidth : 0)
                || 0
            );
            const panelRect = panel.getBoundingClientRect?.();
            const parentRect = panel.parentElement?.getBoundingClientRect?.();
            if (viewportWidth > 0 && panelRect && parentRect
                && Number(panelRect.left || 0) >= 160
                && Number(parentRect.width || 0) > 0
                && Number(parentRect.width || 0) < viewportWidth - 140
                && Number(parentRect.right || 0) >= viewportWidth - 96) {
                return true;
            }
        }
        catch {}
        return false;
    },

    // Computes the tightest visible width budget for the settings panel from both the live visualViewport
    // (reacts to Windows DPI & Electron Ctrl+/-/0 zoom) and any overflow-clipping ancestor containers.
    computeSettingsPanelDynamicWidth(panel) {
        if (!panel?.isConnected || typeof window === "undefined") return 0;
        const viewportWidth = Number(
            (window.visualViewport?.width || window.innerWidth)
            || (typeof document !== "undefined" ? document.documentElement?.clientWidth : 0)
            || 0
        );
        if (!viewportWidth) return 0;
        let maxWidth = Math.max(280, Math.floor(viewportWidth - 20));
        try {
            const panelRect = panel.getBoundingClientRect?.();
            const left = Number(panelRect?.left || 0);
            if (Number.isFinite(left) && left > 0 && left < viewportWidth - 200) {
                maxWidth = Math.min(maxWidth, Math.max(280, Math.floor(viewportWidth - left - 16)));
            }
            let current = panel.parentElement;
            let depth = 0;
            while (current && current !== document.body && depth < 10) {
                if (current.dataset?.daitSettingsModal !== "true") {
                    const style = typeof getComputedStyle === "function" ? getComputedStyle(current) : null;
                    const overflowX = String(style?.overflowX || "");
                    if (/(hidden|clip|auto|scroll)/.test(overflowX)) {
                        const rect = current.getBoundingClientRect?.();
                        const padLeft = Number.parseFloat(style?.paddingLeft) || 0;
                        const padRight = Number.parseFloat(style?.paddingRight) || 0;
                        const inner = Number(rect?.width || 0) - padLeft - padRight;
                        if (Number.isFinite(inner) && inner >= 260) {
                            maxWidth = Math.min(maxWidth, Math.floor(inner));
                        }
                    }
                }
                current = current.parentElement;
                depth++;
            }
        }
        catch {}
        return Math.min(SETTINGS_WINDOW_MAX_WIDTH, Math.max(280, maxWidth));
    },

    // BetterDiscord's plugin-settings modal is narrow; widen it to a moderate window (at most 920 px). The
    // panel works without this too: below 640 px its tab rail becomes a row and rows stack.
    applySettingsModalSizing(panel) {
        if (!this.plugin.isStarted || !panel?.isConnected || typeof window === "undefined") {
            this.cleanupSettingsModalSizing(panel);
            return;
        }
        if (panel.closest?.(".dait-quick-settings-dialog")) return;
        if (this.isSettingsPanelInInlineDiscordView(panel)) {
            this.cleanupSettingsModalSizing(panel);
            if (panel.dataset) panel.dataset.daitSettingsInline = "true";
            this.syncSettingsPanelHeight(panel);
            this.plugin.watchSettingsModalSizingCleanup(panel);
            return;
        }
        if (panel.dataset?.daitSettingsInline) delete panel.dataset.daitSettingsInline;
        const documentWidth = typeof document !== "undefined" ? Number(document.documentElement?.clientWidth || 0) : 0;
        const viewportWidth = Number(window.innerWidth || documentWidth || 0);
        const desiredWidth = Math.min(SETTINGS_WINDOW_MAX_WIDTH, viewportWidth ? viewportWidth - 48 : SETTINGS_WINDOW_MAX_WIDTH);
        // Read pass: measure ancestor widths before mutating any dataset attributes.
        let current = panel.parentElement;
        const candidateNodes = [];
        while (current && current !== document.body && candidateNodes.length < 5) {
            const rect = current.getBoundingClientRect?.();
            const width = Number(rect?.width || 0);
            // A layer as wide as the window (BetterDiscord's .bd-modal-wrapper, Discord's modal layer) holds the modal;
            // sizing it would shrink the real frame inside it to its content. The modal frame is the last node below it.
            if (viewportWidth && width >= viewportWidth - 1) break;
            if (!width || width <= desiredWidth + 80) {
                candidateNodes.push(current);
            }
            current = current.parentElement;
        }
        // Write pass: apply modal markers after all geometry reads complete.
        let root = null;
        const markedNodes = [];
        for (const node of candidateNodes) {
            if (node.dataset.daitSettingsModal !== "true") node.dataset.daitSettingsModal = "true";
            root = node;
            markedNodes.push(node);
        }
        // BetterDiscord's modal frame keeps Discord's own colours; only the panel inside it carries the plugin palette.
        if (root) {
            if (root.dataset.daitSettingsModalRoot !== "true") root.dataset.daitSettingsModalRoot = "true";
            if (!markedNodes.includes(root)) markedNodes.push(root);
        }
        const nextNodes = new Set(markedNodes);
        const previousNodes = Array.isArray(panel.__daitSettingsModalMarkedNodes) ? panel.__daitSettingsModalMarkedNodes : [];
        previousNodes.forEach(node => {
            if (!nextNodes.has(node)) this.cleanupSettingsModalNode(node);
        });
        panel.__daitSettingsModalMarkedNodes = markedNodes;
        this.syncSettingsPanelHeight(panel);
        this.plugin.watchSettingsModalSizingCleanup(panel);
    },

    // The panel is as tall as the window allows (min(760px, 100vh - 64px)) minus what its host draws around it:
    // BetterDiscord's modal header and footer, or the quick-settings window's header and footer. The content pane
    // scrolls inside, so the header and the tab rail stay put.
    syncSettingsPanelHeight(panel, scroller = null) {
        if (!panel?.isConnected || !panel.style?.setProperty || typeof getComputedStyle !== "function") return false;
        this.bindSettingsTabOrientation(panel);
        const isInline = panel.dataset?.daitSettingsInline === "true";
        const host = scroller || this.getSettingsHostScroller(panel);
        const modalRoot = panel.closest?.("[data-dait-settings-modal-root='true']");
        const frame = panel.closest?.(".dait-quick-settings-dialog") || modalRoot || host;
        const viewportHeight = Number(
            (typeof window !== "undefined" ? (window.visualViewport?.height || window.innerHeight) : 0)
            || (typeof document !== "undefined" ? document.documentElement?.clientHeight : 0)
            || 0
        );
        // Read pass: compute dynamic width and host geometry before writing CSS variables to avoid forced reflows.
        const dynamicMaxW = this.computeSettingsPanelDynamicWidth(panel);
        const applyDynamicWidth = () => {
            if (dynamicMaxW > 0) {
                panel.style.setProperty("--dait-dynamic-max-w", `${dynamicMaxW}px`);
                if (modalRoot?.style?.setProperty) modalRoot.style.setProperty("--dait-dynamic-max-w", `${dynamicMaxW}px`);
            }
            else {
                panel.style.removeProperty?.("--dait-dynamic-max-w");
            }
        };
        if (isInline) {
            try {
                const panelRect = panel.getBoundingClientRect?.();
                const top = Number(panelRect?.top || 0);
                const available = viewportHeight > 0 && Number.isFinite(top) && top >= 0 && top < viewportHeight
                    ? Math.max(260, Math.floor(viewportHeight - top - 24))
                    : 0;
                applyDynamicWidth();
                panel.style.setProperty("--dait-host-chrome", "0px");
                if (available > 0) panel.style.setProperty("--dait-host-max", `${available}px`);
                else panel.style.removeProperty?.("--dait-host-max");
                this.bindSettingsPanelResize(panel);
                return true;
            }
            catch {
                applyDynamicWidth();
                return false;
            }
        }
        if (!host || !frame?.getBoundingClientRect) {
            applyDynamicWidth();
            return false;
        }
        try {
            const hostStyle = getComputedStyle(host);
            const hostRect = host.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const frameRect = frame.getBoundingClientRect();
            const rawFrameMax = Number.parseFloat(getComputedStyle(frame).maxHeight);
            const above = Math.max(0, panelRect.top - hostRect.top - Number(host.clientTop || 0) + Number(host.scrollTop || 0));
            const below = Number.parseFloat(hostStyle.paddingBottom) || 0;
            const chrome = frameRect.height - Number(host.clientHeight || 0) + above + below;
            const safeChrome = Number.isFinite(chrome) && chrome >= 0 ? Math.ceil(chrome) : 0;
            let effectiveMax = Number.isFinite(rawFrameMax) && rawFrameMax > 0 ? Math.floor(rawFrameMax) : 0;
            if (viewportHeight > 0 && Number.isFinite(panelRect.top) && panelRect.top > 0 && panelRect.top < viewportHeight) {
                const viewportCap = Math.max(260, Math.floor(viewportHeight - panelRect.top - 16)) + safeChrome;
                effectiveMax = effectiveMax > 0 ? Math.min(effectiveMax, viewportCap) : viewportCap;
            }
            applyDynamicWidth();
            if (Number.isFinite(chrome) && chrome >= 0) panel.style.setProperty("--dait-host-chrome", `${safeChrome}px`);
            if (effectiveMax > 0) panel.style.setProperty("--dait-host-max", `${effectiveMax}px`);
            else panel.style.removeProperty?.("--dait-host-max");
            this.bindSettingsPanelResize(panel);
            return true;
        }
        catch {
            applyDynamicWidth();
            return false;
        }
    },

    // The tab rail is a vertical list, or a row once the panel is 760 px wide or less (the @container rule in
    // css/04-settings.js); aria-orientation follows the panel's width as it changes. Uses one ResizeObserver per panel.
    bindSettingsTabOrientation(panel) {
        this.syncSettingsTabOrientation(panel);
        if (!panel || panel.__daitSettingsOrientationObserver || typeof ResizeObserver !== "function") return;
        try {
            const observer = new ResizeObserver(() => {
                this.syncSettingsTabOrientation(panel);
                if (panel.dataset?.daitSettingsInline === "true") panel.__daitSettingsResize?.listener?.();
            });
            observer.observe(panel);
            panel.__daitSettingsOrientationObserver = observer;
        }
        catch {}
    },

    syncSettingsTabOrientation(panel) {
        const tablist = panel?.__daitSettingsUi?.tablist;
        // The container query measures the panel's content box; the panel has no padding or border.
        const width = Number(panel?.clientWidth || panel?.getBoundingClientRect?.()?.width || 0);
        if (!tablist?.setAttribute || !width) return "";
        const orientation = width <= 760 ? "horizontal" : "vertical";
        if (tablist.getAttribute?.("aria-orientation") !== orientation) tablist.setAttribute("aria-orientation", orientation);
        if (panel.dataset) {
            const tier = width <= 600 ? "compact" : width <= 860 ? "medium" : "wide";
            if (panel.dataset.daitSizeTier !== tier) panel.dataset.daitSizeTier = tier;
        }
        return orientation;
    },

    getSettingsHostScroller(panel) {
        for (let node = panel?.parentElement; node && node !== document.body; node = node.parentElement) {
            try {
                if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
            }
            catch {
                return null;
            }
        }
        return null;
    },

    // A host whose max-height follows the viewport changes size with the window or browser/DPI zoom.
    bindSettingsPanelResize(panel) {
        if (!panel || panel.__daitSettingsResize || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
        const state = { raf: null };
        state.listener = () => {
            if (state.raf !== null || typeof requestAnimationFrame !== "function") return;
            state.raf = requestAnimationFrame(() => {
                state.raf = null;
                if (panel.isConnected) this.syncSettingsPanelHeight(panel);
                else this.cleanupSettingsPanelListeners(panel);
            });
        };
        panel.__daitSettingsResize = state;
        window.addEventListener("resize", state.listener, { passive: true });
        window.visualViewport?.addEventListener?.("resize", state.listener, { passive: true });
    },

    cleanupSettingsPanelListeners(panel) {
        const resize = panel?.__daitSettingsResize;
        if (resize) {
            if (resize.raf !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(resize.raf);
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", resize.listener, { passive: true });
                window.visualViewport?.removeEventListener?.("resize", resize.listener, { passive: true });
            }
            panel.__daitSettingsResize = null;
        }
        if (panel?.__daitSettingsOrientationObserver) {
            panel.__daitSettingsOrientationObserver.disconnect?.();
            panel.__daitSettingsOrientationObserver = null;
        }
        const state = panel?.__daitSettingsUi;
        if (state?.searchEscapeListener) {
            if (typeof window !== "undefined") window.removeEventListener?.("keydown", state.searchEscapeListener, true);
            state.searchEscapeListener = null;
        }
    },

    cleanupSettingsModalSizing(panel) {
        const nodes = new Set(Array.isArray(panel?.__daitSettingsModalMarkedNodes) ? panel.__daitSettingsModalMarkedNodes : []);
        nodes.forEach(node => this.cleanupSettingsModalNode(node));
        if (panel) panel.__daitSettingsModalMarkedNodes = [];
    },

    cleanupSettingsModalNode(node) {
        if (node?.dataset?.daitSettingsModal) delete node.dataset.daitSettingsModal;
        if (node?.dataset?.daitSettingsModalRoot) delete node.dataset.daitSettingsModalRoot;
        if (node?.dataset?.daitDiscordTheme) delete node.dataset.daitDiscordTheme;
        if (node?.style?.removeProperty) {
            node.style.removeProperty("--dait-dynamic-max-w");
            DISCORD_THEME_VARIABLES.forEach(name => node.style.removeProperty(name));
        }
    },

    clearSettingsModalSizingSchedule(panel) {
        const schedule = panel?.__daitSettingsModalSizingSchedule;
        if (!schedule) return;
        if (schedule.raf !== null && schedule.raf !== undefined && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(schedule.raf);
        }
        (schedule.timers || []).forEach(timer => clearTimeout(timer));
        if (panel) panel.__daitSettingsModalSizingSchedule = null;
    },

    destroySettingsModalSizing(panel) {
        this.plugin.clearHotkeyRecordingWithin(panel);
        this.cleanupSettingsPanelListeners(panel);
        this.clearSettingsModalSizingSchedule(panel);
        if (panel?.__daitSettingsModalCleanupObserver) {
            panel.__daitSettingsModalCleanupObserver.disconnect?.();
            panel.__daitSettingsModalCleanupObserver = null;
        }
        this.cleanupSettingsModalSizing(panel);
    },

    watchSettingsModalSizingCleanup(panel) {
        if (!panel?.isConnected || panel.__daitSettingsModalCleanupObserver || typeof MutationObserver !== "function" || typeof document === "undefined" || !document.body) return;
        const observedAncestors = new Set();
        const observeChain = obs => {
            let observed = false;
            let current = panel.parentElement;
            while (current) {
                if (!observedAncestors.has(current)) {
                    try {
                        obs.observe(current, { childList: true, subtree: false });
                        observedAncestors.add(current);
                        observed = true;
                    }
                    catch {}
                }
                else {
                    observed = true;
                }
                if (current === document.body) break;
                current = current.parentElement;
            }
            return observed;
        };
        const observer = new MutationObserver(() => {
            if (panel.isConnected) {
                if (panel.parentElement && !observedAncestors.has(panel.parentElement)) {
                    observeChain(observer);
                }
                return;
            }
            if (this.plugin.isStarted && !panel.__daitReplacedBy) {
                this.plugin.commitSettingsControls?.(panel);
                this.plugin.flushSettings?.({ retryOnError: false });
            }
            this.plugin.clearHotkeyRecordingWithin(panel);
            this.cleanupSettingsPanelListeners(panel);
            this.clearSettingsModalSizingSchedule(panel);
            this.cleanupSettingsModalSizing(panel);
            observer.disconnect?.();
            panel.__daitSettingsModalCleanupObserver = null;
        });
        if (!observeChain(observer)) observer.observe(document.body, { childList: true, subtree: true });
        panel.__daitSettingsModalCleanupObserver = observer;
    },

    preserveSettingsScroll(anchor, action) {
        const snapshot = this.plugin.getSettingsScrollSnapshot(anchor);
        const result = action();
        this.restoreSettingsScroll(snapshot);
        return result;
    },

    restoreSettingsScrollSoon(anchor) {
        const snapshot = this.plugin.getSettingsScrollSnapshot(anchor);
        this.restoreSettingsScroll(snapshot);
    },

    getSettingsScrollSnapshot(anchor) {
        const scroller = this.getSettingsScrollContainer(anchor);
        return {
            scroller,
            top: scroller?.scrollTop ?? 0,
            left: scroller?.scrollLeft ?? 0
        };
    },

    restoreSettingsScroll(snapshot) {
        if (!snapshot?.scroller) return;
        const restore = () => {
            snapshot.scroller.scrollTop = snapshot.top;
            snapshot.scroller.scrollLeft = snapshot.left;
        };

        restore();
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
        setTimeout(restore, 0);
        setTimeout(restore, 80);
        setTimeout(restore, 180);
        setTimeout(restore, 420);
    },

    getSettingsScrollContainer(anchor) {
        let node = anchor?.parentElement;
        while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
                return node;
            }
            node = node.parentElement;
        }

        return document.scrollingElement || document.documentElement;
    }
};

module.exports = methods;
