"use strict";

// Centralized Discord DOM selector registry + runtime Webpack CSS-module resolution.
// When Discord updates its hashed CSS classes or layout containers, update this file alone
// instead of hunting for raw selectors across the codebase.

const {
    DISCORD_MESSAGE_NODE_SELECTOR,
    DISCORD_SETTINGS_SURFACE_SELECTOR,
    DISCORD_USER_PANEL_LOOKUP_ROOT_SELECTOR
} = require("../constants");

const WEBPACK_CLASS_SPEC = Object.freeze({
    channelTextArea: ["channelTextArea", "scrollableContainer"],
    composerButtons: ["buttons", "buttonContainer"],
    messageContent: ["messageContent", "markup"],
    chatContent: ["chatContent", "messagesWrapper"],
    userPanels: ["panels", "container"]
});

const USER_SETTINGS_EXACT_LABEL_RE = /user settings|用户设置|使用者設定|ユーザー設定|사용자 설정|param[eè]tres utilisateur|benutzereinstellungen|impostazioni utente|ajustes de usuario|configura[cç][aã]o do usu[aá]rio|configura[cç][oõ]es de usu[aá]rio|настройки пользователя|kullanıcı ayarları|ustawienia użytkownika|gebruikersinstellingen/i;
const USER_SETTINGS_GENERIC_LABEL_RE = /(^|[\s_-])settings([\s_-]|$)|设置|設定|einstellungen|param[eè]tres|ajustes|configura|настройки|ayarlar|ustawienia/i;
const COMPOSER_TOOLBAR_ANCHOR_RE = /gif|emoji|sticker|gift|app|apps|nitro|表情|貼紙|贴纸|禮物|礼物|表情符號|スタンプ|絵文字|이모지|스티커|autocollant|pegatina/i;

class DiscordSelectors {
    constructor(plugin) {
        this.plugin = plugin;
        this.resolvedClasses = new Map();
        this.resolvedAt = new Map();
    }

    // Attempts to fetch Discord's live hashed CSS class name from Webpack so selectors survive
    // class renames when Discord bundles change. Caches negative lookups for 60s.
    getWebpackClassName(specKey, propKey = specKey) {
        const cacheKey = `${specKey}:${propKey}`;
        const now = Date.now();
        if (this.resolvedClasses.has(cacheKey)) {
            const cached = this.resolvedClasses.get(cacheKey);
            if (cached || now - Number(this.resolvedAt.get(cacheKey) || 0) < 60000) return cached;
        }
        let className = "";
        const keys = WEBPACK_CLASS_SPEC[specKey];
        if (keys?.length) {
            try {
                const mod = globalThis.BdApi?.Webpack?.getByKeys?.(...keys) || null;
                const raw = typeof mod?.[propKey] === "string" ? mod[propKey].trim() : "";
                // First token is the hashed class name (Discord sometimes attaches helper classes).
                className = raw.split(/\s+/)[0] || "";
            }
            catch {
                className = "";
            }
        }
        this.resolvedClasses.set(cacheKey, className);
        this.resolvedAt.set(cacheKey, now);
        return className;
    }

    toClassSelector(className) {
        if (!className || !/^[A-Za-z0-9_-]+$/.test(className)) return "";
        return `.${className}`;
    }

    getChatObserverSelectors() {
        const dynamic = [
            this.toClassSelector(this.getWebpackClassName("chatContent", "chatContent")),
            this.toClassSelector(this.getWebpackClassName("chatContent", "messagesWrapper"))
        ].filter(Boolean);
        return [...new Set([
            ...dynamic,
            "[class*='chatContent']",
            "[class*='messagesWrapper']",
            "[data-list-id*='chat-messages']",
            "[class*='scrollerInner']",
            "[role='main']"
        ])];
    }

    getMessageNodeSelector() {
        return DISCORD_MESSAGE_NODE_SELECTOR;
    }

    getMessageContentSelectors() {
        const dynamic = this.toClassSelector(this.getWebpackClassName("messageContent", "messageContent"));
        return [...new Set([
            ...(dynamic ? [dynamic] : []),
            "[class*='messageContent']"
        ])];
    }

    getSettingsSurfaceSelector() {
        return DISCORD_SETTINGS_SURFACE_SELECTOR;
    }

    getUserPanelLookupRootSelector() {
        const dynamic = this.toClassSelector(this.getWebpackClassName("userPanels", "panels"));
        return [...new Set([
            ...(dynamic ? [dynamic] : []),
            ...DISCORD_USER_PANEL_LOOKUP_ROOT_SELECTOR.split(",").map(s => s.trim()).filter(Boolean),
            "section[aria-label]"
        ])].join(", ");
    }

    isUserSettingsLabel(label) {
        const text = String(label || "").toLowerCase();
        return {
            exact: USER_SETTINGS_EXACT_LABEL_RE.test(text),
            generic: USER_SETTINGS_GENERIC_LABEL_RE.test(text)
        };
    }

    isComposerToolbarAnchorLabel(label) {
        return COMPOSER_TOOLBAR_ANCHOR_RE.test(String(label || "").toLowerCase());
    }

    // Locale-independent structural fallback for Discord's bottom-left User Panel:
    // finds the bottom-left <section> / panels bar containing compact control buttons (Mute / Deafen / Settings)
    // and selects the rightmost control button (User Settings gear across all Discord locales).
    findUserSettingsButtonStructural(isOwnElement) {
        if (typeof document === "undefined" || !document.querySelectorAll) return null;
        const viewportWidth = Number((typeof window !== "undefined" ? window.innerWidth : 0) || document.documentElement?.clientWidth || 0);
        const viewportHeight = Number((typeof window !== "undefined" ? window.innerHeight : 0) || document.documentElement?.clientHeight || 0);
        if (!viewportWidth || !viewportHeight) return null;

        const roots = [...(document.querySelectorAll(this.getUserPanelLookupRootSelector()) || [])];
        for (const root of roots) {
            if (!root || isOwnElement?.(root)) continue;
            const rootRect = root.getBoundingClientRect?.();
            if (!rootRect || (!rootRect.width && !rootRect.height)) continue;
            if (rootRect.left > Math.min(460, viewportWidth * 0.45)) continue;
            if (rootRect.top < viewportHeight - 240) continue;

            const iconButtons = [...(root.querySelectorAll?.("button, [role='button']") || [])].filter(btn => {
                if (!btn || isOwnElement?.(btn)) return false;
                const r = btn.getBoundingClientRect?.();
                if (!r || !r.width || !r.height) return false;
                // User panel icon buttons (mic, headphones, settings gear) are compact squares near the bottom-left.
                return r.width >= 20 && r.width <= 48 && r.height >= 20 && r.height <= 48
                    && r.left <= Math.min(440, viewportWidth * 0.45)
                    && r.bottom >= viewportHeight - 140
                    && Boolean(btn.querySelector?.("svg"));
            });
            if (iconButtons.length >= 3) {
                iconButtons.sort((a, b) => (a.getBoundingClientRect().left || 0) - (b.getBoundingClientRect().left || 0));
                return iconButtons[iconButtons.length - 1];
            }
        }
        return null;
    }

    clearCache() {
        this.resolvedClasses.clear();
        this.resolvedAt.clear();
    }
}

module.exports = {
    DiscordSelectors,
    USER_SETTINGS_EXACT_LABEL_RE,
    USER_SETTINGS_GENERIC_LABEL_RE,
    COMPOSER_TOOLBAR_ANCHOR_RE
};
