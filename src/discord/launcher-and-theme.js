"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const {
    DISCORD_THEME_CLASSES,
    DISCORD_DEFAULT_THEME_CLASS,
    DISCORD_THEME_VARIABLES,
    MESSAGE_BUTTON_VISIBILITY_HOVER,
    QUICK_SETTINGS_INJECT_MIN_INTERVAL_MS,
    DEFAULT_SETTINGS
} = require("../constants");

class DiscordLauncherThemeController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    patchMessageContextMenu() {
        return this.plugin.discordHost.patchMessageContextMenu();
    },

    unpatchContextMenus() {
        return this.plugin.discordHost.unpatchContextMenus();
    },

    appendContextMenuItem(tree, item) {
        const container = this.findContextMenuChildrenContainer(tree);
        if (!container?.props) return;

        const children = container.props.children;
        if (Array.isArray(children)) {
            children.push(item);
            return;
        }

        if (children) container.props.children = [children, item];
        else container.props.children = [item];
    },

    findContextMenuChildrenContainer(node, depth = 0) {
        if (!node || depth > 8) return null;
        const props = node.props;
        if (props && Array.isArray(props.children)) return node;

        const children = props?.children;
        if (Array.isArray(children)) {
            for (const child of children) {
                const found = this.findContextMenuChildrenContainer(child, depth + 1);
                if (found) return found;
            }
        }
        else if (children && typeof children === "object") {
            return this.findContextMenuChildrenContainer(children, depth + 1);
        }

        return null;
    },

    injectQuickSettingsButtons(options = {}) {
        if (typeof document === "undefined" || !document.body) return;
        if (!this.plugin.settings.ui?.showQuickSettingsPanelButton) {
            if (this.plugin.quickSettingsRetryTimer) clearTimeout(this.plugin.quickSettingsRetryTimer);
            if (this.plugin.quickSettingsOpenTimer) clearTimeout(this.plugin.quickSettingsOpenTimer);
            this.plugin.quickSettingsRetryTimer = null;
            this.plugin.quickSettingsOpenTimer = null;
            this.cleanupQuickSettingsLauncherObserver();
            this.plugin.quickSettingsPanelSettingsButton = null;
            this.plugin.quickSettingsPanelContainer = null;
            this.plugin.quickSettingsPanelTargetLookupBlockedUntil = 0;
            document.querySelectorAll?.(".dait-quick-settings-panel")?.forEach(node => node.remove());
            document.querySelectorAll?.(".dait-quick-settings-rail")?.forEach(node => node.remove());
            return;
        }

        const now = Date.now();
        const force = Boolean(options.forceLookup || options.force);
        if (!force && now - Number(this.plugin.quickSettingsLastInjectAt || 0) < QUICK_SETTINGS_INJECT_MIN_INTERVAL_MS) {
            const existing = document.querySelector?.(".dait-quick-settings-panel");
            if (existing && existing.isConnected !== false) return;
        }
        this.plugin.quickSettingsLastInjectAt = now;
        document.querySelectorAll?.(".dait-quick-settings-rail")?.forEach(node => node.remove());
        this.plugin.injectQuickSettingsPanelButton(options);
    },

    injectQuickSettingsPanelButton(options = {}) {
        if (this.plugin.isDiscordSettingsSurfaceOpen()) {
            this.plugin.logQuickSettingsDiagnostic("inject.target", "blocked", { reason: "discord-settings-open" });
            return;
        }
        const settingsButton = this.findDiscordUserSettingsButton({ force: Boolean(options.forceLookup) });
        const container = this.getDiscordUserSettingsButtonContainer(settingsButton);
        if (!container?.appendChild) {
            this.plugin.quickSettingsPanelSettingsButton = null;
            this.plugin.quickSettingsPanelContainer = null;
            this.plugin.logQuickSettingsDiagnostic("inject.target", "retry", {
                reason: settingsButton ? "missing-container" : "missing-settings-button"
            });
            this.scheduleQuickSettingsButtonRetry();
            return;
        }

        const existing = document.querySelector?.(".dait-quick-settings-panel");
        if (existing) {
            if (existing.parentElement === container) {
                this.plugin.syncDiscordThemeClasses(existing, settingsButton || container);
                this.syncQuickSettingsLauncherLayout(existing, settingsButton, container);
                return;
            }
            this.plugin.logQuickSettingsDiagnostic("inject.target", "reparent", {
                reason: "stale-parent"
            });
            existing.remove?.();
        }

        const button = this.createQuickSettingsButton("panel", settingsButton || container);
        const reference = this.getQuickSettingsInsertReference(container, settingsButton);
        if (typeof container.insertBefore === "function" && reference) container.insertBefore(button, reference);
        else container.appendChild(button);
        this.bindQuickSettingsLauncherObserver(button, settingsButton, container);
        this.syncQuickSettingsLauncherLayout(button, settingsButton, container);
        if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(() => {
                if (this.plugin.isStarted && button.isConnected) this.syncQuickSettingsLauncherLayout(button, settingsButton, container);
            });
        }
        this.plugin.logQuickSettingsDiagnostic("inject.target", "inserted", {
            hasSettingsButton: Boolean(settingsButton),
            containerChildCount: this.plugin.getElementChildCount(container)
        });
    },

    cleanupQuickSettingsLauncherObserver() {
        if (this.plugin.quickSettingsLauncherObserver) {
            this.plugin.quickSettingsLauncherObserver.disconnect?.();
            this.plugin.quickSettingsLauncherObserver = null;
        }
    },

    bindQuickSettingsLauncherObserver(button, settingsButton, container) {
        this.cleanupQuickSettingsLauncherObserver();
        if (typeof ResizeObserver !== "function" || !container) return;
        try {
            const observer = new ResizeObserver(() => {
                if (!this.plugin.isStarted || !button?.isConnected) {
                    this.cleanupQuickSettingsLauncherObserver();
                    return;
                }
                this.syncQuickSettingsLauncherLayout(button, settingsButton, container);
            });
            observer.observe(container);
            const panelHost = container.closest?.("section, [class*='panels']") || container.parentElement;
            if (panelHost && panelHost !== container) observer.observe(panelHost);
            this.plugin.quickSettingsLauncherObserver = observer;
        }
        catch {}
    },

    // Detects when Discord's tight bottom-left user panel crowds or overlaps our AI button against the real
    // User Settings gear button, and automatically shrinks to compact mode (or reparents out of a 1-button wrapper).
    syncQuickSettingsLauncherLayout(button, settingsButton, container) {
        if (!button?.isConnected || !settingsButton?.isConnected) return false;
        const btnRect = button.getBoundingClientRect?.();
        const gearRect = settingsButton.getBoundingClientRect?.();
        if (!btnRect || !gearRect || (!btnRect.width && !btnRect.height) || (!gearRect.width && !gearRect.height)) return false;

        const overlapX = Math.min(btnRect.right, gearRect.right) - Math.max(btnRect.left, gearRect.left);
        const overlapY = Math.min(btnRect.bottom, gearRect.bottom) - Math.max(btnRect.top, gearRect.top);
        const overlapsGear = overlapX > 1 && overlapY > 1;

        const panelHost = container?.closest?.("section, [class*='panels']") || container?.parentElement || null;
        const panelRect = panelHost?.getBoundingClientRect?.();
        const clipsGear = Boolean(panelRect && panelRect.width > 0 && gearRect.right > panelRect.right + 2);

        if (overlapsGear || clipsGear) {
            if (button.dataset && button.dataset.daitLauncherCompact !== "true") {
                button.dataset.daitLauncherCompact = "true";
            }
            // If we somehow landed inside a fixed-width single-button wrapper around the gear icon, move up one level.
            const parentRow = container?.parentElement;
            const containerRect = container?.getBoundingClientRect?.();
            if (overlapsGear && parentRow?.insertBefore && containerRect && containerRect.width > 0
                && containerRect.width < btnRect.width + gearRect.width - 2) {
                const ref = this.getQuickSettingsInsertReference(parentRow, settingsButton);
                if (ref && ref !== button) {
                    parentRow.insertBefore(button, ref);
                    this.plugin.quickSettingsPanelContainer = parentRow;
                    this.bindQuickSettingsLauncherObserver(button, settingsButton, parentRow);
                }
            }
            return true;
        }
        // Only relax compact mode when there is comfortable extra room to prevent resize oscillation.
        const gap = gearRect.left - btnRect.right;
        const spareRight = panelRect && panelRect.width > 0 ? panelRect.right - gearRect.right : 12;
        if (button.dataset?.daitLauncherCompact === "true" && gap >= 0 && spareRight >= 8) {
            delete button.dataset.daitLauncherCompact;
        }
        return false;
    },

    scheduleQuickSettingsButtonRetry(delayMs = 1000) {
        if (this.plugin.quickSettingsRetryTimer || !this.plugin.isStarted || !this.plugin.settings.ui?.showQuickSettingsPanelButton) return;
        this.plugin.quickSettingsRetryTimer = setTimeout(() => {
            this.plugin.quickSettingsRetryTimer = null;
            if (!this.plugin.isStarted || !this.plugin.settings.ui?.showQuickSettingsPanelButton) return;
            this.plugin.injectQuickSettingsPanelButton({ forceLookup: true });
        }, Math.max(250, Number(delayMs) || 1000));
    },

    createQuickSettingsButton(variant, themeAnchor = null) {
        const button = document.createElement("button");
        button.className = `dait-quick-settings-button dait-quick-settings-${variant}`;
        this.plugin.syncDiscordThemeClasses(button, themeAnchor);
        button.type = "button";
        button.textContent = "AI";
        button.title = this.plugin.t("quickSettingsOpen");
        button.setAttribute("aria-label", this.plugin.t("quickSettingsOpen"));
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-haspopup", "dialog");
        ["mousedown", "mouseup"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
            });
        });
        ["pointerdown", "pointerup", "click"].forEach(type => {
            button.addEventListener(type, event => this.handleQuickSettingsButtonEvent(event, variant, type), true);
        });
        // Status badge plus a title and label that say what the translator is doing right now.
        this.plugin.quickPanel.decorateLauncher(button);
        return button;
    },

    // One toggle per press, however long the button is held. A mouse or touch press sends pointerdown, pointerup
    // and click; the first of them that reaches the launcher toggles the quick panel and the rest of that press are
    // swallowed (each one is a fallback in case Discord swallowed the ones before it). Only the primary button
    // counts. A click from Enter or Space (detail 0) is a press of its own.
    handleQuickSettingsButtonEvent(event, variant = "panel", listenerType = "") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        const eventType = String(listenerType || event?.type || "");
        this.plugin.logQuickSettingsDiagnostic("button.event", "received", { eventType, variant });
        if (eventType.startsWith("pointer") && (Number(event?.button || 0) !== 0 || event?.isPrimary === false)) {
            this.plugin.logQuickSettingsDiagnostic("button.event", "ignored", { eventType, variant, reason: "not-primary" });
            return;
        }
        const keyboard = eventType === "click" && Number(event?.detail) === 0;
        const pointerId = event?.pointerId ?? null;
        const press = this.plugin.quickSettingsPress;
        // A later event of the press in progress: same pointer, or (for the click) any pointer's click. A click
        // that no pointer caused (assistive technology) is a press of its own.
        const samePress = Boolean(press) && !keyboard && eventType !== "pointerdown" && (
            pointerId === null
            || press.pointerId === null
            || pointerId === press.pointerId
            || (eventType === "click" && Boolean(event?.pointerType))
        );
        // A click ends its press; a pointerdown, or a pointerup whose pointerdown never arrived, starts one.
        if (eventType === "click") this.plugin.quickSettingsPress = null;
        else if (!samePress) this.plugin.quickSettingsPress = { pointerId };
        if (samePress) {
            this.plugin.logQuickSettingsDiagnostic("button.event", "deduped", { eventType, variant });
            return;
        }
        this.plugin.logQuickSettingsDiagnostic("button.event", "scheduled", { eventType, variant });
        // currentTarget is cleared once the event finishes dispatching, so the launcher is resolved now.
        const launcher = event?.currentTarget?.closest?.(".dait-quick-settings-button")
            || event?.target?.closest?.(".dait-quick-settings-button")
            || event?.currentTarget
            || event?.target
            || null;
        // A click from Enter/Space has detail 0; pointer events and mouse clicks come from a pointer.
        const viaPointer = eventType.startsWith("pointer") || (eventType === "click" && Number(event?.detail) > 0);
        if (this.plugin.quickSettingsOpenTimer) clearTimeout(this.plugin.quickSettingsOpenTimer);
        this.plugin.quickSettingsOpenTimer = setTimeout(() => {
            this.plugin.quickSettingsOpenTimer = null;
            if (!this.plugin.isStarted || !this.plugin.settings.ui?.showQuickSettingsPanelButton) return;
            // The launcher opens the compact quick panel; its "open full settings" leads to the full window.
            this.plugin.toggleQuickPopover(launcher, variant, { viaPointer });
        }, 0);
    },

    findDiscordUserSettingsButton(options = {}) {
        if (this.plugin.isDiscordSettingsSurfaceOpen()) return null;
        const cached = this.plugin.quickSettingsPanelSettingsButton;
        if (
            cached
            && this.plugin.isNodeConnected(cached)
            && cached.parentElement?.appendChild
            && this.isLikelyDiscordUserSettingsButton(cached)
        ) {
            return cached;
        }
        this.plugin.quickSettingsPanelSettingsButton = null;
        this.plugin.quickSettingsPanelContainer = null;
        if (!options.force && Date.now() < Number(this.plugin.quickSettingsPanelTargetLookupBlockedUntil || 0)) return null;
        const roots = this.getDiscordUserSettingsButtonLookupRoots();
        const rootCandidates = roots.flatMap(root => [...(root.querySelectorAll?.("button, [role='button']") || [])]);
        const canFallbackToDocument = !roots.length || Boolean(options.force);
        const fallbackCandidates = canFallbackToDocument
            ? [...(document.querySelectorAll?.("button, [role='button']") || [])]
            : [];
        const candidates = [...new Set([...rootCandidates, ...fallbackCandidates])];
        const found = candidates.find(button => this.isLikelyDiscordUserSettingsButton(button))
            || this.plugin.discordHost.findUserSettingsButtonStructural()
            || null;
        if (found) {
            this.plugin.quickSettingsPanelSettingsButton = found;
            this.plugin.quickSettingsPanelContainer = this.getDiscordUserSettingsButtonContainer(found);
            this.plugin.quickSettingsPanelTargetLookupBlockedUntil = 0;
        }
        else {
            this.plugin.logQuickSettingsDiagnostic("inject.lookup", "miss", {
                candidateCount: candidates.length,
                samples: candidates.slice(0, 8).map(button => this.getDiscordButtonLabel(button).slice(0, 80)).filter(Boolean)
            });
            this.plugin.quickSettingsPanelTargetLookupBlockedUntil = Date.now() + 1000;
        }
        return found;
    },

    getDiscordUserSettingsButtonLookupRoots() {
        if (typeof document === "undefined" || !document.querySelectorAll) return [];
        const roots = [];
        const addRoot = root => {
            if (!root || roots.includes(root) || this.plugin.isOwnPluginElement(root)) return;
            if (!root.querySelectorAll) return;
            roots.push(root);
        };
        addRoot(this.plugin.quickSettingsPanelContainer);
        [...(document.querySelectorAll?.(this.plugin.discordHost.getUserPanelLookupRootSelector()) || [])].forEach(root => {
            if (this.isLikelyDiscordUserPanelRoot(root)) addRoot(root);
        });
        return roots;
    },

    isLikelyDiscordUserPanelRoot(root) {
        if (!root || root.nodeType !== 1) return false;
        const rect = root.getBoundingClientRect?.();
        if (!rect || (!rect.width && !rect.height)) return true;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
        if (viewportWidth && rect.left > Math.min(460, viewportWidth * 0.5)) return false;
        if (viewportHeight && rect.top < viewportHeight - 260) return false;
        return true;
    },

    isLikelyDiscordUserSettingsButton(button) {
        if (!button || button.closest?.(".dait-settings, .dait-quick-settings-modal-root, .dait-quick-settings-button, .dait-quick-popover")) return false;
        const buttonLabel = this.getDiscordButtonLabel(button);
        const { exact: exactSettingsLabel, generic: genericSettingsLabel } = this.plugin.discordHost.isUserSettingsLabel(buttonLabel);
        if (!exactSettingsLabel && !genericSettingsLabel) return false;
        const rect = button.getBoundingClientRect?.();
        if (!exactSettingsLabel && rect && (rect.width || rect.height)) {
            const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
            const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
            if (viewportWidth && rect.left > Math.min(420, viewportWidth * 0.45)) return false;
            if (viewportHeight && rect.top < viewportHeight - 120) return false;
        }
        return true;
    },

    getDiscordButtonLabel(button) {
        return [
            button?.getAttribute?.("aria-label"),
            button?.getAttribute?.("data-tooltip-text"),
            button?.getAttribute?.("title"),
            button?.title,
            this.getReferencedElementText(button, "aria-labelledby"),
            this.getReferencedElementText(button, "aria-describedby"),
            button?.textContent
        ].filter(Boolean).join(" ").trim();
    },

    getReferencedElementText(element, attributeName) {
        const ids = String(element?.getAttribute?.(attributeName) || "")
            .split(/\s+/)
            .map(id => id.trim())
            .filter(Boolean);
        if (!ids.length || typeof document === "undefined") return "";
        return ids.map(id => {
            const referenced = document.getElementById?.(id);
            return String(referenced?.textContent || referenced?.getAttribute?.("aria-label") || referenced?.getAttribute?.("title") || "").trim();
        }).filter(Boolean).join(" ");
    },

    getDiscordUserSettingsButtonContainer(settingsButton) {
        if (!settingsButton) return null;
        let current = settingsButton.parentElement || null;
        const fallback = current;
        let depth = 0;
        let firstMultiControl = null;
        while (current && current !== document.body && depth < 6) {
            const controls = [...(current.querySelectorAll?.("button, [role='button']") || [])]
                .filter(button => button && !button.closest?.(".dait-settings, .dait-quick-settings-modal-root, .dait-quick-settings-button, .dait-quick-popover"));
            if (controls.length >= 2 && controls.length <= 16) {
                if (!firstMultiControl) firstMultiControl = current;
                // Prefer a real horizontal flex button bar over a single-button wrapper.
                const display = typeof getComputedStyle === "function"
                    ? String(getComputedStyle(current)?.display || "")
                    : "";
                if (!display || display.includes("flex")) return current;
            }
            current = current.parentElement;
            depth++;
        }
        return firstMultiControl || fallback;
    },

    getQuickSettingsInsertReference(container, settingsButton) {
        if (!container || !settingsButton) return null;
        let current = settingsButton;
        while (current && current.parentElement && current.parentElement !== container) {
            current = current.parentElement;
        }
        return current?.parentElement === container ? current : null;
    },

    getFastRootDiscordThemeClass() {
        if (typeof document === "undefined") return "";
        return this.getElementDiscordThemeExplicitClass(document.body)
            || this.getElementDiscordThemeExplicitClass(document.documentElement)
            || this.getElementDiscordThemeClassNameClass(document.body)
            || this.getElementDiscordThemeClassNameClass(document.documentElement)
            || "";
    },

    syncDiscordThemeClasses(target, anchor = null) {
        if (!target?.classList) return "";
        const fastRootThemeClass = this.getFastRootDiscordThemeClass();
        if (fastRootThemeClass
            && this.plugin.lastObservedRootThemeClass
            && fastRootThemeClass !== this.plugin.lastObservedRootThemeClass) {
            this.plugin.discordThemeCacheEpoch++;
        }
        if (fastRootThemeClass) this.plugin.lastObservedRootThemeClass = fastRootThemeClass;
        const epoch = String(this.plugin.discordThemeCacheEpoch || 0);
        const existingThemeData = target.dataset?.daitDiscordTheme || "";
        const existingThemeClass = existingThemeData ? `theme-${existingThemeData}` : "";
        // O(1) zero-DOM-query fast path: already synced in the current theme epoch and matches root theme.
        if (existingThemeClass
            && target.dataset?.daitThemeEpoch === epoch
            && (!fastRootThemeClass || fastRootThemeClass === existingThemeClass)
            && target.classList.contains?.(existingThemeClass)
            && !DISCORD_THEME_CLASSES.some(theme => theme !== existingThemeClass && target.classList.contains?.(theme))) {
            return existingThemeClass;
        }
        const themeSource = this.plugin.getDiscordThemeSource(anchor);
        const themeClass = themeSource.themeClass || DISCORD_DEFAULT_THEME_CLASS;
        const themeData = themeClass.replace(/^theme-/, "");
        const hasTargetClass = Boolean(target.classList.contains?.(themeClass));
        const hasStaleThemeClass = DISCORD_THEME_CLASSES.some(theme => theme !== themeClass && target.classList.contains?.(theme));
        if (hasTargetClass && !hasStaleThemeClass
            && target.dataset?.daitDiscordTheme === themeData
            && target.dataset?.daitThemeEpoch === epoch) {
            return themeClass;
        }
        DISCORD_THEME_CLASSES.forEach(theme => {
            if (theme !== themeClass && target.classList.contains?.(theme)) target.classList.remove?.(theme);
        });
        if (target.dataset) {
            if (target.dataset.daitDiscordTheme !== themeData) target.dataset.daitDiscordTheme = themeData;
            target.dataset.daitThemeEpoch = epoch;
        }
        this.copyDiscordThemeVariables(target, themeSource.node);
        if (!hasTargetClass) target.classList.add?.(themeClass);
        return themeClass;
    },

    // The launcher's settings window and the panel inside it take the current panel palette (the frame's children
    // inherit it). Returns the theme applied.
    syncQuickSettingsThemeTree(root) {
        if (!root) return "";
        const theme = this.resolvePanelTheme();
        this.applyPanelTheme(root, theme);
        (root.querySelectorAll?.(".dait-settings") || []).forEach(panel => this.applyPanelTheme(panel, theme));
        return theme;
    },

    // ui.panelTheme resolved to "light" or "dark" (auto follows Discord, then the system theme).
    resolvePanelTheme(setting) {
        return this.plugin.panelTheme.resolve(setting === undefined ? this.plugin.panelTheme.getSetting() : setting);
    },

    // Marks a plugin window root (data-dait-panel-theme) so css/01-theme-tokens gives it the matching palette.
    applyPanelTheme(node, theme = undefined) {
        return this.plugin.panelTheme.apply(node, theme === undefined ? this.resolvePanelTheme() : theme);
    },

    // Restyles every open plugin window in place (setting, Discord theme or system theme changed).
    refreshPanelThemes() {
        return this.plugin.panelTheme.refresh();
    },

    applyDiscordThemeData(target, anchor = null) {
        if (!target) return DISCORD_DEFAULT_THEME_CLASS;
        const themeSource = this.plugin.getDiscordThemeSource(anchor);
        const themeClass = themeSource.themeClass || DISCORD_DEFAULT_THEME_CLASS;
        if (target.dataset) target.dataset.daitDiscordTheme = themeClass.replace(/^theme-/, "");
        this.copyDiscordThemeVariables(target, themeSource.node);
        return themeClass;
    },

    // Discord's theme changed: the buttons that sit inside Discord's UI copy its theme again, and the plugin's own
    // windows take the matching panel palette.
    refreshDiscordThemeClasses(options = {}) {
        if (typeof document === "undefined") return;
        this.plugin.discordThemeCacheEpoch++;
        const selector = ".dait-quick-settings-button, .dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-message-button, .dait-polish-restore-control";
        const queried = [...(document.querySelectorAll?.(selector) || [])];
        [...new Set(queried)].forEach(node => this.plugin.syncDiscordThemeClasses(node));
        if (this.plugin.polishRestoreControl) this.plugin.syncDiscordThemeClasses(this.plugin.polishRestoreControl);
        if (!options?.skipPanelTheme) this.refreshPanelThemes();
    },

    getDiscordThemeClass(anchor = null) {
        return this.plugin.getDiscordThemeSource(anchor).themeClass || DISCORD_DEFAULT_THEME_CLASS;
    },

    getDiscordThemeSource(anchor = null) {
        const candidates = this.getDiscordThemeCandidates(anchor);
        for (const node of candidates) {
            const themeClass = this.getElementDiscordThemeExplicitClass(node);
            if (themeClass) return { themeClass, node };
        }
        for (const node of candidates) {
            const themeClass = this.getElementDiscordThemeClassNameClass(node);
            if (themeClass) return { themeClass, node };
        }
        return { themeClass: DISCORD_DEFAULT_THEME_CLASS, node: candidates[0] || null };
    },

    getDiscordThemeCandidates(anchor = null) {
        if (typeof document === "undefined") return [];
        const seen = new Set();
        const candidates = [];
        const addPreFiltered = node => {
            if (!node || seen.has(node)) return;
            seen.add(node);
            candidates.push(node);
        };
        const addCandidate = node => {
            if (!node || seen.has(node) || this.isPluginThemeCandidate(node)) return;
            seen.add(node);
            candidates.push(node);
        };
        const globalCandidates = this.getDiscordThemeGlobalCandidates();
        globalCandidates.selectors.forEach(addPreFiltered);
        let current = anchor && typeof anchor === "object" ? anchor : null;
        let guard = 0;
        while (current && guard < 12) {
            addCandidate(current);
            current = current.parentElement;
            guard++;
        }
        addCandidate(document.body);
        addCandidate(document.documentElement);
        for (const node of globalCandidates.themed) addPreFiltered(node);
        return candidates;
    },

    getDiscordThemeGlobalCandidates() {
        // Memoize document-wide theme lookup within the current theme epoch; invalidated immediately
        // when a real theme mutation fires (refreshDiscordThemeClasses bumps discordThemeCacheEpoch).
        const now = Date.now();
        const cached = this.plugin.discordThemeGlobalCandidatesCache;
        if (cached && cached.epoch === this.plugin.discordThemeCacheEpoch && now - cached.at < 5000) {
            return cached;
        }
        const selectors = ["#app-mount", "[class*='appMount']", "[class*='app-mount']", "[data-theme]", "[theme]"]
            .map(selector => document.querySelector?.(selector))
            .filter(node => node && !this.isPluginThemeCandidate(node));
        // If a root host (<html>, <body>, #app-mount) already carries a Discord theme class or attribute,
        // skip the expensive document-wide querySelectorAll("[class*='theme-']") scan.
        const rootCandidates = [document.documentElement, document.body, ...selectors].filter(Boolean);
        const hasRootTheme = rootCandidates.some(node => Boolean(this.getElementDiscordThemeClass(node)));
        const themed = hasRootTheme
            ? []
            : [...(document.querySelectorAll?.("[class*='theme-'], [data-theme], [theme]") || [])]
                .filter(node => node && !this.isPluginThemeCandidate(node))
                .slice(0, 8);
        const snapshot = { at: now, epoch: this.plugin.discordThemeCacheEpoch, selectors, themed };
        this.plugin.discordThemeGlobalCandidatesCache = snapshot;
        return snapshot;
    },

    isPluginThemeCandidate(node) {
        if (!node) return false;
        if (this.elementHasPluginClassPrefix(node, "dait-")) return true;
        if (node.dataset?.daitSettingsModal || node.dataset?.daitSettingsModalRoot) return true;
        if (this.elementHasClassName(node, "dait-quick-settings-modal-root")) return true;
        if (this.elementHasClassName(node, "dait-quick-settings-dialog")) return true;
        if (this.elementHasClassName(node, "dait-quick-settings-body")) return true;
        if (this.elementHasClassName(node, "dait-quick-settings-error")) return true;
        if (this.elementHasClassName(node, "dait-quick-settings-button")) return true;
        if (this.elementHasClassName(node, "dait-polish-button")) return true;
        if (this.elementHasClassName(node, "dait-polish-preset-button")) return true;
        if (this.elementHasClassName(node, "dait-public-bilingual-button")) return true;
        if (this.elementHasClassName(node, "dait-polish-restore-button")) return true;
        if (this.elementHasClassName(node, "dait-input-action-menu-button")) return true;
        if (this.elementHasClassName(node, "dait-input-action-menu")) return true;
        if (this.elementHasClassName(node, "dait-polish-preset-menu")) return true;
        if (this.elementHasClassName(node, "dait-message-button")) return true;
        if (this.elementHasClassName(node, "dait-polish-result-panel")) return true;
        if (this.elementHasClassName(node, "dait-polish-restore-control")) return true;
        if (this.elementHasClassName(node, "dait-settings")) return true;
        return Boolean(node.closest?.(".dait-quick-settings-modal-root, .dait-settings, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-box"));
    },

    elementHasPluginClassPrefix(node, prefix) {
        if (!node || !prefix) return false;
        try {
            if (node.classList && [...node.classList].some(name => String(name || "").startsWith(prefix))) return true;
        }
        catch {}
        const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
        return className.split(/\s+/).some(name => name.startsWith(prefix));
    },

    getElementDiscordThemeClass(node) {
        return this.getElementDiscordThemeExplicitClass(node) || this.getElementDiscordThemeClassNameClass(node);
    },

    getElementDiscordThemeExplicitClass(node) {
        const rawTheme = String(node?.dataset?.theme || node?.getAttribute?.("data-theme") || node?.getAttribute?.("theme") || "").toLowerCase();
        return this.normalizeDiscordThemeClass(rawTheme);
    },

    getElementDiscordThemeClassNameClass(node) {
        const knownThemeClasses = ["theme-midnight", "theme-onyx", "theme-darker", "theme-ash", "theme-light", "theme-dark"];
        const classListTheme = knownThemeClasses.find(theme => this.elementHasClassName(node, theme));
        if (classListTheme) return this.normalizeDiscordThemeClass(classListTheme);
        const className = String(node?.className?.baseVal || node?.className || "").toLowerCase();
        return this.normalizeDiscordThemeClass(className);
    },

    normalizeDiscordThemeClass(value) {
        const text = String(value || "").toLowerCase();
        if (!text) return "";
        if (/(^|[\s_-])(midnight|onyx)([\s_-]|$)/.test(text) || /theme-(midnight|onyx)(\s|$)/.test(text)) return "theme-midnight";
        if (/(^|[\s_-])(darker|ash)([\s_-]|$)/.test(text) || /theme-(darker|ash)(\s|$)/.test(text)) return "theme-darker";
        if (/(^|[\s_-])light([\s_-]|$)/.test(text) || /theme-light(\s|$)/.test(text)) return "theme-light";
        if (/(^|[\s_-])dark([\s_-]|$)/.test(text) || /theme-dark(\s|$)/.test(text)) return "theme-dark";
        return "";
    },

    copyDiscordThemeVariables(target, source = null) {
        if (!target?.style || typeof window === "undefined" || !window.getComputedStyle) return;
        const values = this.getDiscordThemeVariableValues(source);
        DISCORD_THEME_VARIABLES.forEach(name => {
            const value = values.get(name) || "";
            const previous = String(target.style.getPropertyValue?.(name) || "").trim();
            if (value) {
                if (previous !== value) target.style.setProperty?.(name, value);
            }
            else if (previous) {
                target.style.removeProperty?.(name);
            }
        });
    },

    getDiscordThemeVariableValues(source = null) {
        // Memoize resolved Discord CSS variables per theme epoch (invalidated immediately on theme change).
        const now = Date.now();
        const sourceKey = source || null;
        const cached = this.plugin.discordThemeVariableValuesCache;
        if (cached && cached.epoch === this.plugin.discordThemeCacheEpoch
            && (cached.source === sourceKey || !sourceKey)
            && now - cached.at < 5000) {
            return cached.values;
        }
        const sources = this.getDiscordThemeVariableSources(source);
        const values = new Map();
        for (const node of sources) {
            if (!node || this.isPluginThemeCandidate(node)) continue;
            const computed = window.getComputedStyle(node);
            if (!computed?.getPropertyValue) continue;
            DISCORD_THEME_VARIABLES.forEach(name => {
                if (values.has(name)) return;
                const value = String(computed.getPropertyValue(name) || "").trim();
                if (value) values.set(name, value);
            });
            if (values.size >= DISCORD_THEME_VARIABLES.length) break;
        }
        this.plugin.discordThemeVariableValuesCache = { at: now, epoch: this.plugin.discordThemeCacheEpoch, source: sourceKey, values };
        return values;
    },

    getDiscordThemeVariableSources(source = null) {
        if (typeof document === "undefined") return [];
        const sources = [];
        const add = node => {
            if (!node || sources.includes(node) || this.isPluginThemeCandidate(node)) return;
            sources.push(node);
        };
        // Only inspect the matched theme host and top-level roots (max ~5 nodes) instead of calling
        // getComputedStyle across dozens of unrelated [class*='theme-'] sub-components on every message.
        if (source && typeof source === "object") add(source);
        const globalCandidates = this.getDiscordThemeGlobalCandidates();
        globalCandidates.selectors.forEach(add);
        add(document.body);
        add(document.documentElement);
        if (!sources.length) globalCandidates.themed.slice(0, 3).forEach(add);
        return sources;
    },

    elementHasAnyDiscordThemeClass(node) {
        return Boolean(this.getElementDiscordThemeClass(node));
    },

    elementHasClassName(node, className) {
        if (!node || !className) return false;
        if (node.classList?.contains?.(className)) return true;
        return String(node.className || "").split(/\s+/).includes(className);
    },

    elementClassNameIncludes(node, fragment) {
        const needle = String(fragment || "").toLowerCase();
        if (!node || !needle) return false;
        try {
            if (node.classList && [...node.classList].some(name => String(name || "").toLowerCase().includes(needle))) return true;
        }
        catch {}
        return String(node.className?.baseVal || node.className || "").toLowerCase().includes(needle);
    },

    getMessageButtonVisibility() {
        return this.plugin.normalizeMessageButtonVisibility(this.plugin.settings.ui?.messageButtonVisibility);
    },

    getMessageButtonClassName() {
        return this.getMessageButtonVisibility() === MESSAGE_BUTTON_VISIBILITY_HOVER
            ? "dait-message-button dait-message-button-hover-only"
            : "dait-message-button";
    },

    applyMessageButtonVisibilityToButton(button, anchor = null) {
        if (!button) return;
        const wantHoverOnly = this.getMessageButtonVisibility() === MESSAGE_BUTTON_VISIBILITY_HOVER;
        const classTokens = String(button.className || "").split(/\s+/).filter(Boolean);
        const hasBaseInList = Boolean(button.classList?.contains?.("dait-message-button"));
        const hasHoverInList = Boolean(button.classList?.contains?.("dait-message-button-hover-only"));
        const hasHoverInStr = classTokens.includes("dait-message-button-hover-only");
        const hasBaseInStr = classTokens.includes("dait-message-button");
        if (button.classList?.toggle) {
            if (!hasBaseInList) button.classList.add?.("dait-message-button");
            if (hasHoverInList !== wantHoverOnly) button.classList.toggle("dait-message-button-hover-only", wantHoverOnly);
            // In fake DOMs where classList does not reflect onto className, keep className synced only when needed.
            if (!hasBaseInStr || hasHoverInStr !== wantHoverOnly) {
                const updatedTokens = String(button.className || "").split(/\s+/).filter(Boolean);
                const synced = updatedTokens.includes("dait-message-button")
                    && updatedTokens.includes("dait-message-button-hover-only") === wantHoverOnly;
                if (!synced) {
                    const nextTokens = updatedTokens.filter(t => t !== "dait-message-button" && t !== "dait-message-button-hover-only");
                    button.className = [this.getMessageButtonClassName(), ...nextTokens].join(" ").trim();
                }
            }
        }
        else {
            const expected = this.getMessageButtonClassName();
            if (button.className !== expected) button.className = expected;
        }
        this.plugin.syncDiscordThemeClasses(button, anchor);
    },

    applyMessageButtonVisibilityToButtons() {
        if (typeof document === "undefined") return;
        document.querySelectorAll(".dait-message-button").forEach(button => this.applyMessageButtonVisibilityToButton(button));
    },

    // The per-message Translate button and context-menu item exist only while channel translation is on.
    shouldInjectMessageButtons() {
        return Boolean(this.plugin.settings.translation?.enabled && this.plugin.settings.ui?.injectMessageButtons);
    },

    shouldInjectMessageContextMenu() {
        return Boolean(this.plugin.settings.translation?.enabled && this.plugin.settings.ui?.injectMessageContextMenu);
    },

    // Applies a change of channel translation: its buttons go now and come back with the next scan.
    // The context-menu patch checks the switch each time a menu opens.
    syncMessageTranslationEntryPoints() {
        if (!this.shouldInjectMessageButtons() && typeof document !== "undefined") {
            document.querySelectorAll?.(".dait-message-button")?.forEach(node => node.remove());
        }
    },

    handleKeydown(event) {
        if (!this.plugin.isStarted || event.repeat) return;
        if (event.target?.closest?.(".dait-settings")) return;
        if (!this.plugin.settings.ui.enablePolishHotkey) return;
        // Polish switched off: the shortcut is not ours, so the key goes to Discord untouched.
        if (!this.plugin.settings.polish?.enabled) return;
        if (!this.isAllowedPolishHotkey(this.plugin.settings.ui.polishHotkey || DEFAULT_SETTINGS.ui.polishHotkey)) return;
        if (!this.isHotkeyEvent(event, this.plugin.settings.ui.polishHotkey)) return;

        const textbox = this.plugin.getActiveTextbox();
        if (!textbox) return;

        event.preventDefault();
        event.stopPropagation();
        const button = this.plugin.getComposerPolishButton(textbox);
        this.plugin.polishCurrentDraft(button, { textbox, composerKey: this.plugin.getTextboxComposerKey(textbox), fromHotkey: true });
    },

    recordHotkey(button) {
        if (!button || button.dataset.recording === "true") return;
        this.clearHotkeyRecording();

        const original = this.getHotkeyLabel();
        button.dataset.recording = "true";
        button.textContent = this.plugin.t("hotkeyRecording");
        let listening = false;

        const cleanup = shortcut => {
            if (this.plugin.hotkeyRecordTimer) clearTimeout(this.plugin.hotkeyRecordTimer);
            this.plugin.hotkeyRecordTimer = null;
            if (this.plugin.hotkeyRecordTimeout) clearTimeout(this.plugin.hotkeyRecordTimeout);
            this.plugin.hotkeyRecordTimeout = null;
            if (this.plugin.hotkeyRecordCleanup === cleanup) {
                this.plugin.hotkeyRecordCleanup = null;
                this.plugin.hotkeyRecordButton = null;
            }
            if (listening && typeof document !== "undefined") {
                document.removeEventListener("keydown", onKeydown, true);
                document.removeEventListener("pointerdown", onPointerDown, true);
            }
            listening = false;
            delete button.dataset.recording;
            button.textContent = shortcut || original;
        };

        const onKeydown = event => {
            // The settings panel or quick-settings window is gone: stop before touching the key.
            if (!this.plugin.isStarted || button.isConnected === false) {
                cleanup();
                return;
            }
            event.preventDefault();
            event.stopPropagation();

            if (event.key === "Escape") {
                cleanup();
                return;
            }

            if (this.isModifierOnlyKey(event.key)) return;

            const shortcut = this.shortcutFromEvent(event);
            if (!shortcut || !this.isAllowedPolishHotkey(shortcut)) {
                cleanup();
                this.plugin.showToast(this.plugin.t("hotkeyInvalid"), "error");
                return;
            }

            this.plugin.setSetting("ui.polishHotkey", shortcut);
            cleanup(shortcut);
            this.plugin.showToast(this.plugin.t("hotkeySaved", { shortcut }), "success");
        };

        // A click anywhere else (Done, X, the backdrop, another control) ends recording.
        const onPointerDown = event => {
            if (event?.target === button || button.contains?.(event?.target)) return;
            cleanup();
        };

        this.plugin.hotkeyRecordCleanup = cleanup;
        this.plugin.hotkeyRecordButton = button;
        this.plugin.hotkeyRecordTimer = setTimeout(() => {
            this.plugin.hotkeyRecordTimer = null;
            if (!this.plugin.isStarted || this.plugin.hotkeyRecordCleanup !== cleanup) return;
            document.addEventListener("keydown", onKeydown, true);
            document.addEventListener("pointerdown", onPointerDown, true);
            listening = true;
        }, 0);
        // An abandoned recording must not keep swallowing keys.
        const recordTimeoutMs = 10000;
        this.plugin.hotkeyRecordTimeout = setTimeout(() => {
            this.plugin.hotkeyRecordTimeout = null;
            if (this.plugin.hotkeyRecordCleanup === cleanup) cleanup();
        }, recordTimeoutMs);
    },

    clearHotkeyRecording() {
        if (this.plugin.hotkeyRecordTimer) clearTimeout(this.plugin.hotkeyRecordTimer);
        this.plugin.hotkeyRecordTimer = null;
        if (this.plugin.hotkeyRecordTimeout) clearTimeout(this.plugin.hotkeyRecordTimeout);
        this.plugin.hotkeyRecordTimeout = null;
        const cleanup = this.plugin.hotkeyRecordCleanup;
        this.plugin.hotkeyRecordCleanup = null;
        this.plugin.hotkeyRecordButton = null;
        if (typeof cleanup === "function") {
            try { cleanup(); }
            catch {}
        }
    },

    // Ends a recording whose button lives inside `root` (a settings panel or modal being closed).
    clearHotkeyRecordingWithin(root) {
        const button = this.plugin.hotkeyRecordButton;
        if (!this.plugin.hotkeyRecordCleanup) return;
        if (!root || !button || button.isConnected === false || root === button || root.contains?.(button)) this.clearHotkeyRecording();
    },

    // Shift alone would turn ordinary typing (capital letters, symbols, selection keys) into the
    // hotkey, and Ctrl+A/C/V/X/Y/Z would take over editing, so neither can be the polish shortcut.
    isAllowedPolishHotkey(shortcut) {
        const parts = String(shortcut || "").split("+").map(part => part.trim()).filter(Boolean);
        const key = parts.pop();
        if (!key || !parts.length) return false;
        const commandModifiers = parts.filter(part => part === "Ctrl" || part === "Alt" || part === "Win");
        if (!commandModifiers.length) return /^F\d{1,2}$/.test(key);
        const editingShortcut = commandModifiers.length === 1 && commandModifiers[0] === "Ctrl" && /^[ACVXYZ]$/.test(key);
        return !editingShortcut;
    },

    isModifierOnlyKey(key) {
        return ["Control", "Alt", "Shift", "Meta"].includes(String(key || ""));
    },

    isHotkeyEvent(event, shortcut) {
        const configured = String(shortcut || DEFAULT_SETTINGS.ui.polishHotkey || "").trim();
        if (!configured) return false;
        return this.shortcutFromEvent(event) === configured;
    },

    shortcutFromEvent(event) {
        const key = this.normalizeShortcutKey(event.key);
        if (!key || ["Ctrl", "Alt", "Shift", "Win"].includes(key)) return "";

        const parts = [];
        if (event.ctrlKey) parts.push("Ctrl");
        if (event.altKey) parts.push("Alt");
        if (event.shiftKey) parts.push("Shift");
        if (event.metaKey) parts.push("Win");
        if (!parts.length) return "";

        parts.push(key);
        return parts.join("+");
    },

    normalizeShortcutKey(key) {
        const value = String(key || "").trim();
        if (!value) return "";
        const aliases = {
            Control: "Ctrl",
            Meta: "Win",
            " ": "Space",
            Escape: "Esc"
        };
        if (aliases[value]) return aliases[value];
        if (value.length === 1) return value.toUpperCase();
        return value.replace(/^Arrow/, "");
    },

    getHotkeyLabel(shortcut = this.plugin.settings.ui?.polishHotkey) {
        return String(shortcut || "").trim() || this.plugin.t("hotkeyNotSet");
    }
};

const LAUNCHER_THEME_METHOD_NAMES = attachControllerMethods(DiscordLauncherThemeController, [methods]);

module.exports = {
    DiscordLauncherThemeController,
    LAUNCHER_THEME_METHOD_NAMES
};
