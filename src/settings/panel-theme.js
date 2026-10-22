"use strict";

// The palette of the plugin's own windows (ui.panelTheme). Every window root carries data-dait-panel-theme="light"
// or "dark", and css/01-theme-tokens.js gives each value one complete palette, so no colour in these windows comes
// from Discord's variables (a part of Discord themed differently from the page, or a missing variable, cannot
// mix into them). "auto" follows Discord: the theme class or data-theme on <html>/<body> (theme-light, theme-dark,
// theme-darker, theme-midnight...), then the other places the plugin already looks for Discord's theme, then the
// system's prefers-color-scheme. The windows restyle in place when the setting, Discord's theme or the system
// theme changes. Confirmation dialog content is the exception: it sits inside Discord's own modal, so it takes the
// palette that matches that modal's background (see syncDialog).

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
// Dialog content sits inside Discord's own modal (its title and buttons are Discord's). It takes the palette that
// matches the modal it was drawn in, and brings its own background only when that modal cannot be read.
const DIALOG_CLASS = "dait-dialog";
const DIALOG_SURFACE_ATTRIBUTE = "data-dait-dialog-surface";
// Body text of each palette (css/01-theme-tokens): the one that reads better on the modal's background wins.
const PALETTE_BODY_TEXT = Object.freeze({ light: [0x2e, 0x30, 0x35], dark: [0xe3, 0xe5, 0xe8] });

function normalizePanelTheme(value) {
    const theme = String(value || "").trim().toLowerCase();
    return PANEL_THEMES.includes(theme) ? theme : DEFAULT_SETTINGS.ui.panelTheme;
}

// A computed background colour as { rgb: [0-255 x3], alpha: 0-1 }, or null for a value it cannot read.
function parseComputedColor(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text || text === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
    let match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(text);
    if (match) {
        const alpha = match[4] === undefined ? 1 : (match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]));
        return { rgb: [match[1], match[2], match[3]].map(Number), alpha };
    }
    match = /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(text);
    if (match) {
        const alpha = match[4] === undefined ? 1 : (match[4].endsWith("%") ? parseFloat(match[4]) / 100 : parseFloat(match[4]));
        return { rgb: [match[1], match[2], match[3]].map(channel => Number(channel) * 255), alpha };
    }
    return null;
}

function relativeLuminance(rgb) {
    const [r, g, b] = rgb.map(channel => {
        const value = Math.min(255, Math.max(0, channel)) / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a, b) {
    const [high, low] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (high + 0.05) / (low + 0.05);
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

    // The palette that reads on the first opaque background behind node (Discord's modal around dialog content):
    // { theme: "light" | "dark", readable: body text reaches 4.5:1 }, or null when no background can be read.
    getBackdropTheme(node) {
        const view = node?.ownerDocument?.defaultView || (typeof window !== "undefined" ? window : null);
        if (typeof view?.getComputedStyle !== "function") return null;
        for (let current = node?.parentElement; current; current = current.parentElement) {
            let color = null;
            try { color = parseComputedColor(view.getComputedStyle(current)?.backgroundColor); }
            catch { return null; }
            if (!color || color.alpha < 0.5) continue;
            const light = contrastRatio(PALETTE_BODY_TEXT.light, color.rgb);
            const dark = contrastRatio(PALETTE_BODY_TEXT.dark, color.rgb);
            return { theme: light >= dark ? "light" : "dark", readable: Math.max(light, dark) >= 4.5 };
        }
        return null;
    }

    // Dialog content takes the palette of the modal it sits in, so it matches Discord's title and buttons around it
    // and stays readable whatever ui.panelTheme says. When the modal's background cannot be read (or neither palette
    // reads on it) the content brings its own background in the current palette (css/08-dialogs).
    syncDialog(node) {
        if (!node) return "";
        const backdrop = this.getBackdropTheme(node);
        const theme = backdrop?.theme || this.resolve();
        this.apply(node, theme);
        const surface = !backdrop?.readable;
        const current = node.getAttribute?.(DIALOG_SURFACE_ATTRIBUTE) === "true";
        if (surface && !current) node.setAttribute?.(DIALOG_SURFACE_ATTRIBUTE, "true");
        else if (!surface && current) node.removeAttribute?.(DIALOG_SURFACE_ATTRIBUTE);
        return theme;
    }

    isDialog(node) {
        try { return Boolean(node?.classList?.contains?.(DIALOG_CLASS)); }
        catch { return false; }
    }

    // Every open plugin window takes the current palette (after a change of the setting, of Discord's theme or of
    // the system theme); dialog content follows the modal it sits in. Returns the theme applied.
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
        roots.forEach(node => {
            if (this.isDialog(node)) this.syncDialog(node);
            else this.apply(node, theme);
        });
        return theme;
    }

    // Discord switches its theme by changing the class (or data-theme) of <html> or <body>; the plugin's own
    // Discord observer does not watch <html>. The system theme matters while "auto" finds no Discord theme. Open
    // dialog content is checked on every such change: Discord's modal changes with Discord's theme even while an
    // explicit light/dark choice keeps the plugin's windows as they are.
    startWatching() {
        this.stopWatching();
        this.lastTheme = this.resolve();
        const onChange = () => {
            if (!this.plugin.isStarted) return;
            this.refresh();
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
    DIALOG_SURFACE_ATTRIBUTE,
    normalizePanelTheme,
    parseComputedColor
};
