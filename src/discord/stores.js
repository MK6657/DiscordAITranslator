"use strict";

// Centralized access to Discord's internal Webpack stores and utilities via BdApi.Webpack.
// Negative lookups are cached for 60s so missing modules never cause repeated full Webpack scans.

const NEGATIVE_CACHE_MS = 60000;

class DiscordStores {
    constructor(plugin) {
        this.plugin = plugin;
        this.stores = new Map();
        this.emojiUtils = null;
    }

    getStore(name) {
        const key = String(name || "").trim();
        if (!key) return null;
        const cached = this.stores.get(key);
        if (cached?.store) return cached.store;
        const now = Date.now();
        if (cached && now < cached.retryAt) return null;
        let store = null;
        try {
            store = globalThis.BdApi?.Webpack?.getStore?.(key) || null;
        }
        catch (error) {
            this.plugin?.warnSanitized?.(`Failed to locate Discord ${key}`, error);
        }
        this.stores.set(key, store ? { store } : { store: null, retryAt: now + NEGATIVE_CACHE_MS });
        return store;
    }

    getMessageStore() {
        const named = this.getStore("MessageStore");
        if (named && (typeof named.getMessage === "function" || typeof named.getMessages === "function" || typeof named.getMessagesForChannel === "function")) return named;
        const fallbackKey = "__MessageStoreByKeys";
        const cached = this.stores.get(fallbackKey);
        if (cached?.store) return cached.store;
        const now = Date.now();
        if (cached && now < cached.retryAt) return null;
        let found = null;
        try {
            found = globalThis.BdApi?.Webpack?.getByKeys?.("getMessage", "getMessages") || null;
        }
        catch {
            found = null;
        }
        this.stores.set(fallbackKey, found ? { store: found } : { store: null, retryAt: now + NEGATIVE_CACHE_MS });
        return found;
    }

    getChannelStore() {
        return this.getStore("ChannelStore");
    }

    getSelectedChannelStore() {
        return this.getStore("SelectedChannelStore");
    }

    getSelectedGuildStore() {
        return this.getStore("SelectedGuildStore");
    }

    getGuildStore() {
        return this.getStore("GuildStore");
    }

    getGuildRoleStore() {
        return this.getStore("GuildRoleStore");
    }

    getThemeStore() {
        return this.getStore("ThemeStore");
    }

    getUnicodeEmojiUtils() {
        const cached = this.emojiUtils;
        if (cached?.module) return cached.module;
        const now = Date.now();
        if (cached && now < cached.retryAt) return null;
        let mod = null;
        try {
            mod = globalThis.BdApi?.Webpack?.getByKeys?.("convertNameToSurrogate") || null;
        }
        catch (error) {
            this.plugin?.warnSanitized?.("Failed to locate Discord emoji utils", error);
        }
        this.emojiUtils = typeof mod?.convertNameToSurrogate === "function"
            ? { module: mod }
            : { module: null, retryAt: now + NEGATIVE_CACHE_MS };
        return this.emojiUtils.module;
    }

    // Fallback route resolution when URL pathname has not settled yet.
    getActiveRouteIds() {
        try {
            const channelId = String(this.getSelectedChannelStore()?.getChannelId?.() || "").trim();
            if (!channelId) return null;
            const guildId = String(
                this.getSelectedGuildStore()?.getGuildId?.()
                || this.getChannelStore()?.getChannel?.(channelId)?.guild_id
                || "@me"
            ).trim();
            return { guildId, channelId, messageId: "" };
        }
        catch {
            return null;
        }
    }

    // Read-only probe for host health diagnostics.
    getHealthSnapshot() {
        const messageStore = Boolean(this.getMessageStore());
        const channelStore = Boolean(this.getChannelStore() || this.getSelectedChannelStore());
        const guildRoleStore = Boolean(this.getGuildRoleStore() || this.getGuildStore());
        return { messageStore, channelStore, guildRoleStore };
    }

    clearCache() {
        this.stores.clear();
        this.emojiUtils = null;
    }
}

module.exports = { DiscordStores };
