"use strict";

const { STORE_MESSAGE_ID_NEGATIVE_LOOKUP_TTL_MS, STORE_MESSAGE_ID_LOOKUP_MAX } = require("../constants");

class MessageTracker {
    constructor(plugin) {
        this.plugin = plugin;
        this.storeResolvedMessageIds = new Map();
        this.storeResolvedMessageIdMisses = new Map();
    }

    getIdentity(messageNode, content, text) {
        const sourceTextHash = this.plugin.getTextFingerprint(text);
        const route = this.getRouteIds();
        const ids = this.getNodeMessageIds(messageNode);
        const guildId = ids.guildId || route.guildId || "unknown-guild";
        const channelId = ids.channelId || route.channelId || "unknown-channel";
        const messageId = ids.messageId || "";
        const targetKind = this.plugin.isReplyPreviewElement?.(content) ? "reply-preview" : "message";
        const replyIds = targetKind === "reply-preview" ? this.getReplyReferenceIds(content) : null;

        if (replyIds?.messageId) {
            return [
                "reply",
                replyIds.guildId || guildId,
                replyIds.channelId || channelId,
                replyIds.messageId,
                targetKind,
                sourceTextHash
            ].join(":");
        }

        if (messageId) {
            return [
                "message",
                guildId,
                channelId,
                messageId,
                targetKind,
                sourceTextHash
            ].join(":");
        }

        const storeIds = targetKind === "message"
            ? this.getStoreResolvedMessageIds(messageNode, text, { ...ids, guildId, channelId }, route)
            : null;
        if (storeIds?.messageId) {
            return [
                "message",
                storeIds.guildId || guildId,
                storeIds.channelId || channelId,
                storeIds.messageId,
                targetKind,
                sourceTextHash
            ].join(":");
        }

        return this.getFallbackIdentity(messageNode, content, text, { ...ids, guildId, channelId }, route);
    }

    getFallbackIdentity(messageNode, content, text, ids = {}, route = this.getRouteIds()) {
        const sourceTextHash = this.plugin.getTextFingerprint(text);
        const guildId = ids.guildId || route.guildId || "unknown-guild";
        const channelId = ids.channelId || route.channelId || "unknown-channel";
        const targetKind = this.plugin.isReplyPreviewElement?.(content) ? "reply-preview" : "message";
        const authorId = this.getAuthorId(messageNode) || "unknown-author";
        const timestamp = this.getTimestamp(messageNode) || "unknown-time";
        return [
            "fallback",
            guildId,
            channelId,
            authorId,
            timestamp,
            this.plugin.getTextFingerprint(`${route.guildId || ""}/${route.channelId || ""}`),
            this.getDomStableFingerprint(messageNode),
            this.getNeighborContextFingerprint(messageNode),
            targetKind,
            sourceTextHash
        ].join(":");
    }

    getRouteIds() {
        const path = typeof window !== "undefined" ? String(window.location?.pathname || "") : "";
        const match = path.match(/\/channels\/([^/]+)\/([^/]+)(?:\/(\d{15,}))?/);
        if (match) {
            return {
                guildId: match[1] || "",
                channelId: match[2] || "",
                messageId: match[3] || ""
            };
        }
        const fromStore = this.plugin?.discordHost?.getActiveRouteIds?.();
        if (fromStore?.channelId) return fromStore;
        return {
            guildId: "",
            channelId: "",
            messageId: ""
        };
    }

    getNodeMessageIds(messageNode) {
        const route = this.getRouteIds();
        const attributes = this.getNodeIdentityAttributes(messageNode);
        for (const { name, value } of attributes) {
            const parsed = this.parseStructuredMessageIdentity(value, route);
            if (parsed.messageId) return parsed;
            if (/^(data-message-id|data-item-id)$/i.test(name) && /^\d{15,}$/.test(value)) {
                return {
                    guildId: route.guildId,
                    channelId: route.channelId,
                    messageId: value
                };
            }
        }
        return { guildId: route.guildId, channelId: route.channelId, messageId: "" };
    }

    parseStructuredMessageIdentity(value, route = this.getRouteIds()) {
        const text = String(value || "");
        if (!/chat-messages/i.test(text)) return { guildId: route.guildId, channelId: route.channelId, messageId: "" };
        const structured = text.match(/chat-messages[-_:/\s]+(\d{15,})[-_:/\s]+(\d{15,})/i);
        if (structured) {
            return {
                guildId: route.guildId,
                channelId: structured[1],
                messageId: structured[2]
            };
        }
        /** @type {string[]} */
        const numbers = text.match(/\d{15,}/g) || [];
        if (numbers.length >= 2) {
            const routeChannelIndex = route.channelId ? numbers.lastIndexOf(route.channelId) : -1;
            if (routeChannelIndex >= 0 && numbers[routeChannelIndex + 1]) {
                return {
                    guildId: route.guildId,
                    channelId: route.channelId,
                    messageId: numbers[routeChannelIndex + 1]
                };
            }
            return {
                guildId: route.guildId,
                channelId: numbers[numbers.length - 2],
                messageId: numbers[numbers.length - 1]
            };
        }
        return { guildId: route.guildId, channelId: route.channelId, messageId: "" };
    }

    getNodeIdentityAttributes(messageNode) {
        const values = [];
        let current = messageNode;
        while (current && current.nodeType === 1 && values.length < 24) {
            ["id", "data-list-item-id", "aria-labelledby"].forEach(attribute => {
                const value = current.getAttribute?.(attribute);
                if (value) values.push({ name: attribute, value: String(value) });
            });
            ["data-message-id", "data-item-id"].forEach(attribute => {
                const value = current.getAttribute?.(attribute);
                if (value) values.push({ name: attribute, value: String(value) });
            });
            current = current.parentElement;
        }
        return values;
    }

    getAuthorId(messageNode) {
        const authorNode = messageNode?.matches?.("[data-author-id], [data-user-id]")
            ? messageNode
            : messageNode?.querySelector?.("[data-author-id], [data-user-id]");
        return String(authorNode?.getAttribute?.("data-author-id") || authorNode?.getAttribute?.("data-user-id") || "").trim();
    }

    getTimestamp(messageNode) {
        const timestampNode = messageNode?.querySelector?.("time[datetime], [datetime]");
        return String(timestampNode?.getAttribute?.("datetime") || timestampNode?.getAttribute?.("aria-label") || "").trim();
    }

    getReplyReferenceIds(content) {
        const container = content?.closest?.("[class*='repliedMessage'], [class*='repliedTextPreview'], [class*='quotedChatMessage']") || content;
        const link = container?.querySelector?.("a[href*='/channels/']") || container?.closest?.("a[href*='/channels/']");
        const href = String(link?.getAttribute?.("href") || link?.href || "").trim();
        const match = href.match(/\/channels\/([^/]+)\/(\d{15,})\/(\d{15,})/);
        if (!match) return null;
        return {
            guildId: match[1],
            channelId: match[2],
            messageId: match[3]
        };
    }

    getDomStableFingerprint(messageNode) {
        const parts = [];
        const attributes = [
            "aria-label",
            "aria-labelledby",
            "data-item-id",
            "data-list-item-id",
            "data-message-id",
            "data-author-id",
            "data-user-id",
            "role"
        ];
        let current = messageNode;
        while (current && current.nodeType === 1 && parts.length < 18) {
            attributes.forEach(attribute => {
                const value = String(current.getAttribute?.(attribute) || "").trim();
                if (value) parts.push(`${attribute}=${value.slice(0, 160)}`);
            });
            const label = String(current.getAttribute?.("aria-label") || current.getAttribute?.("title") || "").trim();
            if (label) parts.push(`label=${label.slice(0, 160)}`);
            current = current.parentElement;
        }
        const normalized = [...new Set(parts)]
            .filter(value => !/class=/i.test(value))
            .join("|");
        return this.plugin.getTextFingerprint(normalized || "no-dom-fingerprint");
    }

    getNeighborContextFingerprint(messageNode) {
        const parts = [];
        const collect = node => {
            if (!node || node === messageNode || parts.length >= 6) return;
            const ids = this.getNodeMessageIds(node);
            if (ids.messageId) {
                parts.push(`m:${ids.channelId || ""}:${ids.messageId}`);
                return;
            }
            const timestamp = this.getTimestamp(node);
            const authorId = this.getAuthorId(node);
            if (timestamp || authorId) parts.push(`f:${authorId || ""}:${timestamp || ""}`);
        };

        let previous = messageNode?.previousElementSibling;
        for (let index = 0; previous && index < 3; index++) {
            collect(previous);
            previous = previous.previousElementSibling;
        }
        let next = messageNode?.nextElementSibling;
        for (let index = 0; next && index < 3; index++) {
            collect(next);
            next = next.nextElementSibling;
        }
        return this.plugin.getTextFingerprint(parts.join("|") || "no-neighbor-context");
    }

    getStoreResolvedMessageIds(messageNode, text, ids = {}, route = this.getRouteIds()) {
        const channelId = ids.channelId || route.channelId || "";
        if (!channelId || !text) return null;

        const authorId = this.getAuthorId(messageNode);
        const timestamp = this.getTimestamp(messageNode);
        const normalizedText = this.normalizeComparableText(text);
        if (!normalizedText) return null;
        const neighborAnchorKey = !authorId && !timestamp
            ? this.getStoreNeighborAnchorIds(messageNode).join("|")
            : "";

        const cacheKey = [
            channelId,
            authorId || "",
            this.normalizeComparableTimestamp(timestamp) || String(timestamp || ""),
            neighborAnchorKey,
            this.plugin.getStrongTextFingerprint(normalizedText)
        ].join(":");
        if (this.storeResolvedMessageIds.has(cacheKey)) {
            return this.storeResolvedMessageIds.get(cacheKey);
        }
        if (this.isStoreResolvedMessageIdsNegativeFresh(cacheKey)) return null;

        let messages = [];
        try {
            messages = this.plugin.getDiscordMessageStoreMessages(channelId);
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to resolve Discord message id from store", error);
            this.rememberStoreResolvedMessageIdsNegative(cacheKey);
            return null;
        }
        if (!messages.length) {
            this.rememberStoreResolvedMessageIdsNegative(cacheKey);
            return null;
        }

        const candidates = messages.filter(message => {
            const messageId = this.getStoreMessageId(message);
            if (!messageId) return false;
            if (String(this.getStoreMessageChannelId(message) || channelId) !== String(channelId)) return false;
            if (this.normalizeComparableText(this.plugin.getDiscordStoreMessageText(message)) !== normalizedText) return false;
            if (authorId && String(this.getStoreMessageAuthorId(message) || "") !== String(authorId)) return false;
            if (timestamp && !this.isStoreTimestampMatch(timestamp, this.getStoreMessageTimestamp(message))) return false;
            return true;
        });

        const hasStrongDomHint = Boolean(authorId || timestamp);
        const hasNeighborAnchor = !hasStrongDomHint
            && candidates.length === 1
            && this.isStoreCandidateNeighborAnchored(messageNode, candidates[0], messages);
        if (candidates.length !== 1 || (!hasStrongDomHint && !hasNeighborAnchor)) {
            this.rememberStoreResolvedMessageIdsNegative(cacheKey);
            return null;
        }

        const candidate = candidates[0];
        const result = {
            guildId: this.getStoreMessageGuildId(candidate) || ids.guildId || route.guildId || "",
            channelId,
            messageId: this.getStoreMessageId(candidate)
        };
        this.rememberStoreResolvedMessageIds(cacheKey, result);
        return result;
    }

    rememberStoreResolvedMessageIds(key, result) {
        if (!key) return;
        this.storeResolvedMessageIdMisses.delete(key);
        if (this.storeResolvedMessageIds.has(key)) this.storeResolvedMessageIds.delete(key);
        this.storeResolvedMessageIds.set(key, result);
        while (this.storeResolvedMessageIds.size > STORE_MESSAGE_ID_LOOKUP_MAX) {
            this.storeResolvedMessageIds.delete(this.storeResolvedMessageIds.keys().next().value);
        }
    }

    rememberStoreResolvedMessageIdsNegative(key, now = Date.now()) {
        if (!key) return;
        this.storeResolvedMessageIdMisses.set(key, now + STORE_MESSAGE_ID_NEGATIVE_LOOKUP_TTL_MS);
        this.pruneStoreResolvedMessageIdsNegative(now);
    }

    isStoreResolvedMessageIdsNegativeFresh(key, now = Date.now()) {
        const expiresAt = Number(this.storeResolvedMessageIdMisses.get(key) || 0);
        if (!expiresAt) return false;
        if (expiresAt > now) return true;
        this.storeResolvedMessageIdMisses.delete(key);
        return false;
    }

    pruneStoreResolvedMessageIdsNegative(now = Date.now()) {
        for (const [key, expiresAt] of this.storeResolvedMessageIdMisses) {
            if (Number(expiresAt || 0) <= now) this.storeResolvedMessageIdMisses.delete(key);
        }
        while (this.storeResolvedMessageIdMisses.size > STORE_MESSAGE_ID_LOOKUP_MAX) {
            this.storeResolvedMessageIdMisses.delete(this.storeResolvedMessageIdMisses.keys().next().value);
        }
    }

    isStoreCandidateNeighborAnchored(messageNode, candidate, messages) {
        const candidateId = this.getStoreMessageId(candidate);
        if (!candidateId) return false;
        const candidateIndex = messages.findIndex(message => this.getStoreMessageId(message) === candidateId);
        if (candidateIndex < 0) return false;

        const anchorIds = this.getStoreNeighborAnchorIds(messageNode, candidateId);
        if (!anchorIds.length) return false;
        const nearbyIds = new Set(messages
            .slice(Math.max(0, candidateIndex - 4), candidateIndex + 5)
            .map(message => this.getStoreMessageId(message))
            .filter(id => id && id !== candidateId));
        return anchorIds.some(id => nearbyIds.has(id));
    }

    getStoreNeighborAnchorIds(messageNode, excludedMessageId = "") {
        const anchorIds = [];
        const collect = node => {
            if (!node || anchorIds.length >= 6) return;
            const ids = this.getNodeMessageIds(node);
            if (ids.messageId && ids.messageId !== excludedMessageId) anchorIds.push(ids.messageId);
        };

        let previous = messageNode?.previousElementSibling;
        for (let index = 0; previous && index < 3; index++) {
            collect(previous);
            previous = previous.previousElementSibling;
        }

        let next = messageNode?.nextElementSibling;
        for (let index = 0; next && index < 3; index++) {
            collect(next);
            next = next.nextElementSibling;
        }
        return [...new Set(anchorIds)];
    }

    normalizeComparableText(text) {
        return this.plugin.normalizeExtractedText(text).replace(/\s+/g, " ").trim();
    }

    normalizeComparableTimestamp(value) {
        if (!value) return "";
        const raw = typeof value?.toISOString === "function" ? value.toISOString() : String(value || "");
        const parsed = Date.parse(raw);
        if (Number.isFinite(parsed)) return String(Math.round(parsed / 1000));
        return raw.trim();
    }

    isStoreTimestampMatch(domTimestamp, storeTimestamp) {
        const left = this.normalizeComparableTimestamp(domTimestamp);
        const right = this.normalizeComparableTimestamp(storeTimestamp);
        if (!left || !right) return false;
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
            return Math.abs(leftNumber - rightNumber) <= 2;
        }
        return left === right;
    }

    getStoreMessageId(message) {
        return String(message?.id || message?.messageId || "").trim();
    }

    getStoreMessageGuildId(message) {
        return String(message?.guild_id || message?.guildId || "").trim();
    }

    getStoreMessageChannelId(message) {
        return String(message?.channel_id || message?.channelId || "").trim();
    }

    getStoreMessageAuthorId(message) {
        return String(message?.author?.id || message?.authorId || message?.author_id || "").trim();
    }

    getStoreMessageTimestamp(message) {
        return message?.timestamp || message?.createdAt || message?.created_at || "";
    }
}

module.exports = { MessageTracker };
