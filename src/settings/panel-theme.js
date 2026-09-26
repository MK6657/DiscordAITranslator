"use strict";

// The palette of the plugin's own windows (ui.panelTheme). Every window root carries data-dait-panel-theme="light"
// or "dark", and css/01-theme-tokens.js gives each value one complete palette, so no colour in these windows comes
// from Discord's variables (a part of Discord themed differently from the page, or a missing variable, cannot
// mix into them). "auto" follows Discord: the theme class or data-theme on <html>/<body> (theme-light, theme-dark,
// theme-darker, theme-midnight...), then the other places the plugin already looks for Discord's theme, then the
// system's prefers-color-scheme. The windows restyle in place when the setting, Discord's theme or the system
// theme changes.

const { DEFAULT_SETTINGS, PANEL_THEMES } = require("../constants");

const PANEL_THEME_ATTRIBUTE = "data-dait-panel-theme";
// Every plugin window root: the settings panel (in BetterDiscord's modal and in the launcher's window), the
// launcher's window frame, the quick panel, the polish result panel, the composer's action menu and dialog content.
const PANEL_THEME_ROOT_SELECTOR = [
    ".dait-settings",
    ".dait-quick-settings-modal-root",
    ".dait-quick-popover",
    ".dait-polish-result-panel",
    ".dait-input-action-menu",
    ".dait-dialog"
].join(", ");
// Discord's theme classes and what each one means for the plugin's windows.
const DISCORD_THEME_CLASS_PANEL_THEMES = Object.freeze({
    "theme-light": "light",
    "theme-dark": "dark",
    "theme-darker": "dark",
    "theme-midnight": "dark",
    "theme-onyx": "dark",
    "theme-ash": "dark"
});
const WATCHED_ATTRIBUTES = ["class", "data-theme", "theme"];

function normalizePanelTheme(value) {
    const theme = String(value || "").trim().toLowerCase();
    return PANEL_THEMES.includes(theme) ? theme : DEFAULT_SETTINGS.ui.panelTheme;
}

class PanelTheme {
    constructor(plugin) {
        this.plugin = plugin;
        this.observer = null;
        this.mediaQuery = null;
        this.mediaListener = null;
        this.lastTheme = "";
    }

    getSetting() {
        return normalizePanelTheme(this.plugin.settings?.ui?.panelTheme);
    }

    // "light" or "dark" for the plugin's windows right now.
    resolve(setting = this.getSetting()) {
        const choice = normalizePanelTheme(setting);
        if (choice !== "auto") return choice;
        return this.getDiscordTheme() || this.getSystemTheme();
    }

    // Discord's own theme as "light" / "dark", or "" when nothing on the page says.
    getDiscordTheme() {
        if (typeof document === "undefined") return "";
        for (const node of [document.documentElement, document.body]) {
            const theme = this.getNodeTheme(node);
            if (theme) return theme;
        }
        // The places the plugin already looks for Discord's theme (#app-mount, [data-theme], themed nodes).
        let candidates = [];
        try { candidates = this.plugin.getDiscordThemeCandidates?.() || []; }
        catch { candidates = []; }
        for (const node of candidates) {
            const explicit = this.plugin.getElementDiscordThemeExplicitClass?.(node);
            if (explicit) return explicit === "theme-light" ? "light" : "dark";
        }
        for (const node of candidates) {
            const theme = this.getNodeClassTheme(node);
            if (theme) return theme;
        }
        return "";
    }

    getNodeTheme(node) {
        if (!node) return "";
        const explicit = this.plugin.getElementDiscordThemeExplicitClass?.(node);
        if (explicit) return explicit === "theme-light" ? "light" : "dark";
        return this.getNodeClassTheme(node);
    }

    // Only Discord's own theme class names count, so an unrelated class that contains "light" or "dark" does not.
    getNodeClassTheme(node) {
        if (!node) return "";
        const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
        const names = new Set(className.split(/\s+/).filter(Boolean));
        const hasClass = name => {
            if (names.has(name)) return true;
            try { return Boolean(node.classList?.contains?.(name)); }
            catch { return false; }
        };
        // A node with more than one theme class (Discord adds the base theme next to darker/midnight) is dark.
        const themes = Object.keys(DISCORD_THEME_CLASS_PANEL_THEMES).filter(hasClass).map(name => DISCORD_THEME_CLASS_PANEL_THEMES[name]);
        if (!themes.length) return "";
        return themes.includes("dark") ? "dark" : "light";
    }

    getSystemTheme() {
        try {
            if (typeof window !== "undefined" && typeof window.matchMedia === "function"
                && window.matchMedia("(prefers-color-scheme: light)")?.matches) {
                return "light";
            }
        }
        catch {}
        return "dark";
    }

    // Marks one window root with the palette to use. Returns the theme applied.
    apply(node, theme = this.resolve()) {
        if (!node) return theme;
        if (node.dataset) {
            if (node.dataset.daitPanelTheme !== theme) node.dataset.daitPanelTheme = theme;
        }
        else if (typeof node.setAttribute === "function" && node.getAttribute?.(PANEL_THEME_ATTRIBUTE) !== theme) {
            node.setAttribute(PANEL_THEME_ATTRIBUTE, theme);
        }
        return theme;
    }

    // Every open plugin window takes the current palette (after a change of the setting, of Discord's theme or of
    // the system theme). Returns the theme applied.
    refresh() {
        const theme = this.resolve();
        this.lastTheme = theme;
        if (typeof document === "undefined") return theme;
        const roots = new Set();
        try {
            document.querySelectorAll?.(PANEL_THEME_ROOT_SELECTOR)?.forEach(node => roots.add(node));
        }
        catch {}
        [
            this.plugin.quickSettingsModalRoot,
            this.plugin.quickPanel?.root,
            this.plugin.polishResultPanel,
            this.plugin.inputActionMenu
        ].forEach(node => { if (node) roots.add(node); });
        roots.forEach(node => this.apply(node, theme));
        return theme;
    }

    // Discord switches its theme by changing the class (or data-theme) of <html> or <body>; the plugin's own
    // Discord observer does not watch <html>. The system theme matters while "auto" finds no Discord theme.
    startWatching() {
        this.stopWatching();
        this.lastTheme = this.resolve();
        const onChange = () => {
            if (!this.plugin.isStarted) return;
            if (this.resolve() !== this.lastTheme) this.refresh();
        };
        if (typeof MutationObserver === "function" && typeof document !== "undefined") {
            try {
                this.observer = new MutationObserver(onChange);
                [document.documentElement, document.body].filter(Boolean).forEach(node => {
                    this.observer.observe(node, { attributes: true, attributeFilter: WATCHED_ATTRIBUTES });
                });
            }
            catch {
                this.observer = null;
            }
        }
        try {
            if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
                const query = window.matchMedia("(prefers-color-scheme: light)");
                if (query && typeof query.addEventListener === "function") {
                    query.addEventListener("change", onChange);
                    this.mediaQuery = query;
                    this.mediaListener = onChange;
                }
            }
        }
        catch {
            this.mediaQuery = null;
            this.mediaListener = null;
        }
    }

    stopWatching() {
        try { this.observer?.disconnect?.(); }
        catch {}
        this.observer = null;
        try { this.mediaQuery?.removeEventListener?.("change", this.mediaListener); }
        catch {}
        this.mediaQuery = null;
        this.mediaListener = null;
    }
}

module.exports = {
    PanelTheme,
    PANEL_THEME_ATTRIBUTE,
    PANEL_THEME_ROOT_SELECTOR,
    normalizePanelTheme
};
