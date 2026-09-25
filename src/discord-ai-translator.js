"use strict";

const { TranslationRenderer } = require("./auto-translation/translation-renderer");
const { ComposerWriter } = require("./composer/composer-writer");
const { SettingsSchema } = require("./settings/settings-schema");
const { PLUGIN_CSS } = require("./styles");
const { AutoTranslationTaskState } = require("./auto-translation/task-state");
const { AutoTranslationRequestPipeline } = require("./auto-translation/request-pipeline");
const { AutoTranslationQueueCore } = require("./auto-translation/queue-core");
const { DiagnosticsRecorder } = require("./diagnostics/diagnostics-recorder");
const { OutputGuard } = require("./validation/output-guard");
const { TranslationCacheStore } = require("./cache/translation-cache-store");
const { PLUGIN_VERSION } = require("./version");
const { ProviderLayer } = require("./providers/provider-layer");
const { SettingsStore } = require("./settings/settings-store");

const {
    PLUGIN_NAME,
    DATA_KEY,
    CACHE_DATA_KEY,
    DIAGNOSTIC_DATA_KEY,
    STYLE_ID,
    DISCORD_THEME_CLASSES,
    DISCORD_DEFAULT_THEME_CLASS,
    DISCORD_MESSAGE_NODE_SELECTOR,
    DISCORD_SETTINGS_SURFACE_SELECTOR,
    DISCORD_USER_PANEL_LOOKUP_ROOT_SELECTOR,
    DISCORD_MEDIA_VIEWER_SELECTOR,
    DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR,
    DISCORD_MEDIA_MUTATION_SELECTOR,
    DISCORD_THEME_VARIABLES,
    PROVIDER_DEFAULTS,
    SETTINGS_TAB_POLISH,
    SETTINGS_TAB_TRANSLATION,
    SETTINGS_TAB_PUBLIC_BILINGUAL,
    SETTINGS_TAB_DISPLAY,
    SETTINGS_TAB_DEFAULT,
    SETTINGS_TABS,
    SETTINGS_SECTION_GENERAL,
    SETTINGS_SECTION_POLISH,
    SETTINGS_SECTION_POLISH_CONTROLS,
    SETTINGS_SECTION_TRANSLATION,
    SETTINGS_SECTION_TRANSLATION_CONTROLS,
    SETTINGS_SECTION_AUTO_TRANSLATE,
    SETTINGS_SECTION_PUBLIC_BILINGUAL,
    SETTINGS_SECTION_DISPLAY,
    SETTINGS_SECTION_CACHE,
    SETTINGS_SECTION_DIAGNOSTICS,
    SETTINGS_SECTION_IDS,
    PROVIDER_ORDER,
    PROVIDER_PROFILE_FIELDS,
    PROVIDER_CAPABILITIES,
    DEEPSEEK_MODELS,
    LOCAL_MODEL_PRESETS,
    CUSTOM_LANGUAGE_VALUE,
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_DEFAULT_CONCURRENCY,
    AUTO_TRANSLATE_MIN_CONCURRENCY,
    AUTO_TRANSLATE_MAX_CONCURRENCY,
    AUTO_TRANSLATE_MIN_BATCH_SIZE,
    AUTO_TRANSLATE_BATCH_MULTIPLIER,
    AUTO_TRANSLATE_QUEUE_MULTIPLIER,
    AUTO_TRANSLATE_FAILURE_TTL,
    AUTO_TRANSLATE_TERMINAL_FAILURE_TTL,
    AUTO_TRANSLATE_FAILURE_LIMIT,
    AUTO_TRANSLATE_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_FAILURE_HISTORY_TTL,
    AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT,
    AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT,
    AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL,
    AUTO_TRANSLATE_PROVIDER_FAILURE_TTL,
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS,
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    LOCAL_PROVIDER_AUTO_MODEL_VALUE,
    LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS,
    AUTO_TRANSLATE_REQUEST_BATCH_SIZE,
    AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX,
    AUTO_TRANSLATE_FALLBACK_CONCURRENCY,
    AUTO_TRANSLATE_SINGLE_FALLBACK_LIMIT,
    AUTO_TRANSLATE_FALLBACK_REQUEUE_DELAY_MS,
    AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
    AUTO_TRANSLATE_ORPHAN_LOADING_REQUEUE_MS,
    AUTO_TRANSLATE_IN_FLIGHT_STALE_MS,
    AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
    AUTO_TRANSLATE_ULTRA_LONG_TEXT_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH,
    AUTO_TRANSLATE_LOCAL_LONG_TEXT_CHUNK_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS,
    AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS,
    AUTO_TRANSLATE_CLOUD_LONG_TEXT_TIMEOUT_MAX_MS,
    MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH,
    MODEL_REQUEST_TIMEOUT_MS,
    API_TEST_REQUEST_TIMEOUT_MS,
    API_ENDPOINT_ERROR_MESSAGE_KEYS,
    SCAN_VIEWPORT_BUFFER_PX,
    AUTO_TRANSLATE_VIEWPORT_SETTLE_MS,
    AUTO_TRANSLATE_VIEWPORT_JUMP_SETTLE_MS,
    AUTO_TRANSLATE_VIEWPORT_JUMP_COOLDOWN_MS,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    DISCORD_MEDIA_VIEWER_QUIET_MS,
    DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS,
    DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS,
    AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS,
    AUTO_TRANSLATE_SCROLL_RENDER_PAUSE_MS,
    AUTO_TRANSLATE_RENDER_MAX_PER_FRAME,
    AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS,
    AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE,
    AUTO_TRANSLATE_EDGE_OVERSCAN_MESSAGES,
    AUTO_TRANSLATE_SCROLL_STILL_MS,
    AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX,
    AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR,
    AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS,
    AUTO_TRANSLATE_CACHE_DRAW_MAX_EVALUATIONS,
    AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES,
    AUTO_TRANSLATE_CACHE_DRAW_MEMO_MAX,
    AUTO_TRANSLATE_FINISHED_LINE_SELECTOR,
    AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE,
    AUTO_TRANSLATE_PREFETCH_RANGES,
    MUTATION_DIRTY_SCAN_MAX_ROOTS,
    MUTATION_DIRTY_SCAN_MAX_MESSAGES,
    INCREMENTAL_MESSAGE_WORK_BUDGET_MS,
    INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE,
    MESSAGE_BUTTON_VISIBILITY_ALWAYS,
    MESSAGE_BUTTON_VISIBILITY_HOVER,
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    POLISH_REPOLISH_SOURCE_LAST_RESULT,
    TRANSLATION_CACHE_DEFAULT_TTL_HOURS,
    TRANSLATION_CACHE_TTL_OPTIONS,
    TRANSLATION_CACHE_HIT_EXTEND_MS,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD,
    TRANSLATION_CACHE_DEFAULT_LIMIT,
    TRANSLATION_CACHE_MIN_LIMIT,
    TRANSLATION_CACHE_MAX_LIMIT,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_TTL_MS,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_MAX,
    AUTO_TRANSLATE_PRECHECK_SKIP_TTL_MS,
    AUTO_TRANSLATE_PRECHECK_SKIP_MAX,
    AUTO_TRANSLATE_RECENT_RENDER_TTL_MS,
    AUTO_TRANSLATE_RECENT_RENDER_MAX,
    AUTO_TRANSLATE_LAST_DECISION_MAX,
    AUTO_TRANSLATE_INTAKE_MODES,
    STORE_MESSAGE_ID_NEGATIVE_LOOKUP_TTL_MS,
    STORE_MESSAGE_ID_LOOKUP_MAX,
    DIAGNOSTICS_MAX_ENTRIES,
    QUICK_SETTINGS_DIAGNOSTICS_MAX_ENTRIES,
    SETTINGS_WRITE_DEBOUNCE_MS,
    DIAGNOSTICS_COMPRESSION_WINDOW_MS,
    DIAGNOSTICS_WRITE_DEBOUNCE_MS,
    HEAVY_PERSISTENCE_DEFER_MS,
    HEAVY_PERSISTENCE_MAX_DEFER_MS,
    DIAGNOSTICS_SLOW_OPERATION_MS,
    DIAGNOSTICS_SLOW_OPERATION_THROTTLE_MS,
    DIAGNOSTIC_MESSAGE_STATES,
    AUTO_TRANSLATION_QUEUE_TYPES,
    TRANSLATION_VALIDATION_QUALITIES,
    DIAGNOSTIC_REASON_CODES,
    DIAGNOSTIC_FAILURE_CLASSES,
    DIAGNOSTIC_FAILURE_LAYERS,
    QUICK_SETTINGS_INJECT_MIN_INTERVAL_MS,
    DISCORD_THEME_CACHE_TTL_MS,
    GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS,
    DISCORD_MESSAGE_MAX_LENGTH,
    LANGUAGE_PRESETS,
    DEFAULT_PROMPT_TEMPLATES,
    LEGACY_TRANSLATION_NATURAL_PROMPTS,
    PROMPT_POLICY_VERSIONS,
    DEFAULT_SETTINGS
} = require("./constants");

const { I18N } = require("./i18n");

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
        return {
            guildId: match?.[1] || "",
            channelId: match?.[2] || "",
            messageId: match?.[3] || ""
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

class TranslationScheduler {
    constructor(plugin) {
        this.plugin = plugin;
    }

    isLongText(text) {
        return String(text || "").length >= AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH;
    }

    isUltraLongText(text) {
        return String(text || "").length >= AUTO_TRANSLATE_ULTRA_LONG_TEXT_LENGTH;
    }

    isLongItem(item) {
        return this.isLongText(item?.text || "");
    }

    getQueueType(item = {}) {
        if (!item) return "";
        if (item.daitManualRequest) return AUTO_TRANSLATION_QUEUE_TYPES.MANUAL;
        if (item.daitHistoryRequest) return AUTO_TRANSLATION_QUEUE_TYPES.HISTORY;
        if (item.daitPrefetchRequest) return AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH;
        if (Number.isFinite(Number(item.priority)) && Number(item.priority) >= AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE) return AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH;
        if (item.messageNode && item.content && this.isPrefetchItem(item)) return AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH;
        if (this.isLongItem(item)) return AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT;
        if (item.messageNode && item.content) return AUTO_TRANSLATION_QUEUE_TYPES.VISIBLE;
        return "";
    }

    getQueueTypeRank(item = {}, queueType = null) {
        const type = queueType === null || queueType === undefined ? this.getQueueType(item) : queueType;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.MANUAL) return 0;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.VISIBLE) return 10;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.LONG_TEXT) return 20;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.PREFETCH) return 30;
        if (type === AUTO_TRANSLATION_QUEUE_TYPES.HISTORY) return 40;
        return 50;
    }

    canStartPrefetchRequest(concurrency) {
        const total = Math.max(0, Number(concurrency) || 0);
        const limit = Math.min(1, Math.max(0, total - 1));
        if (this.plugin.hasActiveVisibleAutoTranslationWork()) return false;
        return this.plugin.autoTranslationPrefetchInFlight < limit
            && this.plugin.autoTranslationInFlight < Math.max(0, total - 1);
    }

    isPrefetchBatch(batch) {
        return Array.isArray(batch) && batch.length > 0 && batch.every(item => this.isPrefetchItem(item));
    }

    isPrefetchItem(item) {
        return !this.isVisibleItem(item);
    }

    isVisibleItem(item) {
        if (!item?.messageNode?.isConnected || !item?.content?.isConnected) return false;
        if (!this.plugin.isElementVisibleInViewport(item.content)) return false;
        return this.plugin.isElementVisibleInViewport(item.messageNode)
            || this.plugin.isAutoTranslationContentInsideMessage(item);
    }

    shouldRunItemSingle(item) {
        if (!item) return false;
        const config = this.plugin.getEffectiveTaskConfig("translation", item?.requestOptions?.configOverrides);
        if (this.plugin.isLocalTranslationProvider(config)) return true;
        return this.isLongItem(item);
    }

    getItemProviderKey(item) {
        if (!item?.requestOptions) return "";
        return item?.requestOptions?.providerKey || this.plugin.getAutoTranslationProviderKey(item?.requestOptions);
    }

    markProviderFailure(requestOptions, error, itemFailure = null, options = {}) {
        const plugin = this.plugin;
        const type = plugin.getAutoTranslationFailureType(error);
        if (!["auth", "quota", "rate-limit", "server", "timeout", "network", "parse", "local-unavailable"].includes(type)) return;

        const key = error?.providerKey || plugin.getAutoTranslationProviderKey(requestOptions);
        if (!key) return;
        const previous = plugin.autoTranslationProviderFailures.get(key);
        if (previous && plugin.isAutoTranslationFailureExpired(previous)) plugin.autoTranslationProviderFailures.delete(key);
        const previousCount = previous && !plugin.isAutoTranslationFailureExpired(previous) ? Number(previous.count || 0) : 0;
        const count = Math.min(5, previousCount + 1);
        const retryAfterMs = Math.max(itemFailure?.retryAfterMs || 0, plugin.getAutoTranslationRetryAfter(error, count));
        plugin.autoTranslationProviderFailures.set(key, {
            at: Date.now(),
            count,
            retryAfterMs,
            retryAt: Date.now() + retryAfterMs,
            type
        });
        if (type === "local-unavailable") {
            plugin.localProviderHealthyKeys.delete(key);
            plugin.discardAutoTranslationProviderWork(key, { retryMs: retryAfterMs, skipCacheKeys: options.skipCacheKeys });
            plugin.setApiRuntimeStatus("translation", "failed", plugin.t("apiStatusFailed"), plugin.formatError(error));
        }
        else if (type === "quota" || type === "auth") {
            plugin.setApiRuntimeStatus("translation", "failed", plugin.t("apiStatusFailed"), plugin.formatError(error));
        }
        plugin.logDiagnostic("auto.provider.failure", "cooldown", {
            key: plugin.getTextFingerprint(key),
            type,
            count,
            retryAfterMs,
            status: Number(error?.status || 0)
        });
    }

    getProviderFailure(requestOptions) {
        const plugin = this.plugin;
        const key = plugin.getAutoTranslationProviderKey(requestOptions);
        const failure = plugin.autoTranslationProviderFailures.get(key);
        if (failure && plugin.isAutoTranslationFailureExpired(failure)) {
            if (failure.type === "local-unavailable") {
                const retryAfterMs = Math.max(Number(failure.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
                const next = {
                    ...failure,
                    at: Date.now(),
                    retryAfterMs,
                    retryAt: Date.now() + retryAfterMs
                };
                plugin.autoTranslationProviderFailures.set(key, next);
                plugin.startLocalProviderHealthProbe(key, requestOptions, { reason: "cooldown-expired" });
                return next;
            }
            plugin.autoTranslationProviderFailures.delete(key);
            return null;
        }
        return failure;
    }

    isProviderCoolingDown(requestOptions, now = Date.now()) {
        const plugin = this.plugin;
        const key = plugin.getAutoTranslationProviderKey(requestOptions);
        const failure = plugin.autoTranslationProviderFailures.get(key);
        if (!failure) return false;
        if (plugin.isAutoTranslationFailureExpired(failure, now)) {
            if (failure.type === "local-unavailable") {
                const retryAfterMs = Math.max(Number(failure.retryAfterMs || 0), LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS);
                const next = {
                    ...failure,
                    at: now,
                    retryAfterMs,
                    retryAt: now + retryAfterMs
                };
                plugin.autoTranslationProviderFailures.set(key, next);
                plugin.startLocalProviderHealthProbe(key, requestOptions, { reason: "cooldown-expired" });
                plugin.scheduleAutoTranslationRetryScan(retryAfterMs);
                return true;
            }
            plugin.autoTranslationProviderFailures.delete(key);
            return false;
        }
        plugin.scheduleAutoTranslationRetryScan(plugin.getAutoTranslationFailureRemainingMs(failure, now));
        return true;
    }

    sortQueue(queue = []) {
        if (!Array.isArray(queue) || queue.length < 2) return;
        // Rank resolution can hit the DOM (viewport visibility); compute it once per item
        // instead of on every comparison so a sort does O(n) rect reads, not O(n log n).
        const ranks = new Map();
        for (const item of queue) {
            if (!ranks.has(item)) ranks.set(item, this.getQueueTypeRank(item));
        }
        queue.sort((left, right) => {
            const typeDelta = ranks.get(left) - ranks.get(right);
            if (typeDelta) return typeDelta;
            const priorityDelta = (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER);
            if (priorityDelta) return priorityDelta;
            return String(left?.cacheKey || "").localeCompare(String(right?.cacheKey || ""));
        });
    }

    makeRoomForItem(item, queueLimit) {
        const plugin = this.plugin;
        const limit = Math.max(1, Number(queueLimit) || plugin.getAutoTranslateQueueLimit());
        if (plugin.autoTranslationQueue.length + plugin.autoTranslationInFlightItems < limit) return true;

        const incoming = plugin.withAutoTranslationPriority(item);
        if (!plugin.autoTranslationQueue.length && !this.isPrefetchItem(incoming)) return true;
        const incomingPriority = incoming.priority ?? Number.MAX_SAFE_INTEGER;
        let worstIndex = -1;
        let worstPriority = incomingPriority;
        plugin.autoTranslationQueue.forEach((queued, index) => {
            const priority = queued?.priority ?? Number.MAX_SAFE_INTEGER;
            if (priority <= worstPriority) return;
            worstPriority = priority;
            worstIndex = index;
        });
        if (worstIndex < 0) return false;

        const [removed] = plugin.autoTranslationQueue.splice(worstIndex, 1);
        plugin.autoTranslationQueuedKeys.delete(removed?.cacheKey);
        plugin.clearPendingAutoTranslationItem(removed);
        plugin.logDiagnostic("auto.queue.drop", "queue-limit", {
            ...plugin.getAutoTranslationDiagnosticMeta(removed, DIAGNOSTIC_MESSAGE_STATES.CANCELLED, DIAGNOSTIC_REASON_CODES.QUEUE_LIMIT),
            key: plugin.getTextFingerprint(removed?.cacheKey || ""),
            incomingKey: plugin.getTextFingerprint(item?.cacheKey || ""),
            queueLength: plugin.autoTranslationQueue.length,
            limit
        });
        plugin.logAutoTranslationMessageState(
            "auto.message.state",
            "cancelled",
            removed,
            DIAGNOSTIC_MESSAGE_STATES.CANCELLED,
            DIAGNOSTIC_REASON_CODES.QUEUE_LIMIT,
            { incomingKey: plugin.getTextFingerprint(item?.cacheKey || ""), limit }
        );
        return true;
    }

    isAutoCacheMode(mode) {
        const value = String(mode || "");
        return value.startsWith("auto") || value === "long-text";
    }
}

module.exports = class DiscordAITranslator {
    constructor() {
        this.autoRequestPipeline = new AutoTranslationRequestPipeline(this);
        this.autoQueueCore = new AutoTranslationQueueCore(this);
        this.diagnosticsRecorder = new DiagnosticsRecorder(this);
        this.taskState = new AutoTranslationTaskState(this);
        this.outputGuard = new OutputGuard(this);
        this.translationCacheStore = new TranslationCacheStore(this);
        this.providerLayer = new ProviderLayer(this);
        this.settingsStore = new SettingsStore(this);
        this.settings = this.clone(DEFAULT_SETTINGS);
        this.isStarted = true;
        this.messageTracker = new MessageTracker(this);
        this.translationScheduler = new TranslationScheduler(this);
        this.translationRenderer = new TranslationRenderer(this, {
            heavyTextLength: AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH
        });
        this.composerWriter = new ComposerWriter(this);
        this.settingsSchema = new SettingsSchema({
            sections: [
                { id: SETTINGS_SECTION_GENERAL, labelKey: "generalTitle", level: "primary" },
                { id: SETTINGS_SECTION_POLISH, labelKey: "settingsTabPolish", level: "primary" },
                { id: SETTINGS_SECTION_POLISH_CONTROLS, labelKey: "polishControlsTitle", level: "secondary" },
                { id: SETTINGS_SECTION_TRANSLATION, labelKey: "settingsTabTranslation", level: "primary" },
                { id: SETTINGS_SECTION_TRANSLATION_CONTROLS, labelKey: "translationControlsTitle", level: "secondary" },
                { id: SETTINGS_SECTION_AUTO_TRANSLATE, labelKey: "autoTranslateSettingsTitle", level: "secondary" },
                { id: SETTINGS_SECTION_PUBLIC_BILINGUAL, labelKey: "settingsTabPublicBilingual", level: "primary" },
                { id: SETTINGS_SECTION_DISPLAY, labelKey: "displaySettingsTitle", level: "primary" },
                { id: SETTINGS_SECTION_CACHE, labelKey: "cacheSettingsTitle", level: "secondary" },
                { id: SETTINGS_SECTION_DIAGNOSTICS, labelKey: "diagnosticsSettingsTitle", level: "secondary" }
            ],
            providerCapabilities: PROVIDER_CAPABILITIES,
            providerOrder: PROVIDER_ORDER,
            defaultProvider: "deepseek"
        });
        this.settingsDirtyTimer = null;
        this.settingsDirtyAt = 0;
        this.settingsDirty = false;
        this.settingsLoadBlocked = false;
        this.dataLoadFailures = new Set();
        this.translationCache = new Map();
        this.translationCacheMeta = new Map();
        this.translationCacheDirtyTimer = null;
        this.translationCacheDirtyAt = 0;
        this.translationCacheDirty = false;
        this.translationCacheTouchDirtyCount = 0;
        this.translationCachePersistenceDeferredSince = 0;
        this.translationCacheStats = { hits: 0, misses: 0 };
        this.translationCacheNegativeLookup = new Map();
        this.persistentTranslationCacheCount = 0;
        this.googleTranslateReservedChars = new Map();
        this.googleTranslateRuntimeDirtyTimer = null;
        this.googleTranslateRuntimeDirtyAt = 0;
        this.googleTranslateRuntimeDirty = false;
        this.diagnosticLogs = [];
        this.diagnosticCompressedCount = 0;
        this.diagnosticLogsDirtyTimer = null;
        this.diagnosticLogsDirtyAt = 0;
        this.diagnosticLogsDirty = false;
        this.diagnosticLogsPersistenceDeferredSince = 0;
        this.translationRequests = new Map();
        this.autoTranslationQueue = [];
        this.autoTranslationQueuedKeys = new Set();
        this.autoTranslationPendingTargets = new Map();
        this.autoTranslationFailures = new Map();
        this.autoTranslationFailureHistory = new Map();
        this.autoTranslationProviderFailures = new Map();
        this.autoTranslationProviderNoticeAt = new Map();
        this.autoTranslationPrecheckSkips = new Map();
        this.autoTranslationRecentRenders = new Map();
        this.autoTranslationLastExternalScrollAt = 0;
        this.autoTranslationOwnScrolls = new WeakMap();
        this.cachedTranslationDrawTimer = null;
        this.cachedTranslationDrawIdle = null;
        this.cachedDrawMemo = new Map();
        this.cachedDrawMessageMemo = new WeakMap();
        this.cachedDrawScroller = null;
        this.lastAutoTranslationDecisions = new Map();
        this.localProviderHealthChecks = new Map();
        this.localProviderHealthProbeStartedAt = new Map();
        this.localProviderHealthyKeys = new Set();
        this.localProviderDetectedModels = new Map();
        this.localProviderModelDetections = new Map();
        this.autoTranslationInFlight = 0;
        this.autoTranslationInFlightKeys = new Set();
        this.autoTranslationVisibleLongInFlightKeys = new Set();
        this.autoTranslationInFlightStartedAt = new Map();
        this.autoTranslationInFlightTokens = new Map();
        this.autoTranslationInFlightTokenCounter = 0;
        this.autoTranslationInFlightItems = 0;
        this.autoTranslationPrefetchInFlight = 0;
        this.autoTranslationLastToastAt = 0;
        this.autoTranslationRetryTimer = null;
        this.autoTranslationRetryAt = 0;
        this.autoTranslationConfigVersion = 0;
        this.lifecycleToken = 0;
        this.autoTranslationViewportBusyUntil = 0;
        this.autoTranslationViewportStableAnchor = "";
        this.autoTranslationViewportStableScans = 0;
        this.autoTranslationViewportRequiresStableScan = false;
        this.autoTranslationJumpCooldownUntil = 0;
        this.autoTranslationRenderPausedUntil = 0;
        this.autoTranslationRenderQueue = [];
        this.autoTranslationRenderQueuedKeys = new Set();
        this.autoTranslationRenderQueuedTasks = new Map();
        this.autoTranslationRenderPendingKeys = new Set();
        this.autoTranslationRenderQueueDirty = false;
        this.autoTranslationRenderRaf = null;
        this.autoTranslationRenderTimer = null;
        this.autoTranslationRenderDueAt = 0;
        this.autoTranslationLastScrollY = null;
        this.autoTranslationLastScrollByTarget = typeof WeakMap === "function" ? new WeakMap() : null;
        this.translationSourceStyleMutationCounts = typeof WeakMap === "function" ? new WeakMap() : null;
        this.elementTextCache = typeof WeakMap === "function" ? new WeakMap() : null;
        this.autoTranslationLastWindowScrollY = null;
        this.autoTranslationLastRouteKey = "";
        this.discordMessageStore = null;
        this.discordMessageStoreMissingUntil = 0;
        this.quickSettingsModalRoot = null;
        this.quickSettingsModalKeydown = null;
        this.quickSettingsPreviousFocus = null;
        this.quickSettingsLastOpenAt = 0;
        this.quickSettingsRetryTimer = null;
        this.quickSettingsOpenTimer = null;
        this.quickSettingsVerifyRaf = null;
        this.quickSettingsVerifyTimer = null;
        this.quickSettingsVerifyToken = 0;
        this.quickSettingsPanelSettingsButton = null;
        this.quickSettingsPanelContainer = null;
        this.quickSettingsPanelTargetLookupBlockedUntil = 0;
        this.quickSettingsDiagnosticLogs = [];
        this.quickSettingsLastInjectAt = 0;
        this.quickSettingsScanDeferred = false;
        this.quickSettingsRenderDeferred = false;
        this.settingsSurfaceProbeAt = 0;
        this.settingsSurfaceProbeOpen = false;
        this.slowDiagnosticLastLoggedAt = new Map();
        this.discordThemeCacheEpoch = 0;
        this.discordThemeGlobalCandidatesCache = null;
        this.discordThemeVariableValuesCache = null;
        this.activeApiControllers = new Set();
        // Set by stop() so retry, rescue and fallback loops cannot send text after the plugin is disabled.
        this.apiRequestsClosed = false;
        this.hotkeyRecordTimer = null;
        this.hotkeyRecordTimeout = null;
        this.hotkeyRecordCleanup = null;
        this.hotkeyRecordButton = null;
        this.observer = null;
        this.observerRoot = null;
        this.observerLifecycle = null;
        this.observerRebindTimer = null;
        this.observerRetryTimer = null;
        this.diagnosticLogsIdleCallback = null;
        this.translationCacheIdleCallback = null;
        this.scanTimer = null;
        this.scanDueAt = 0;
        this.scanDirtyOnly = false;
        this.pendingMutationScanRoots = new Set();
        this.incrementalMessageScanGeneration = 0;
        this.incrementalMessageScanIdleCallback = null;
        this.incrementalMessageScanTimer = null;
        this.cacheOnlyScanTimer = null;
        this.cacheOnlyScanDueAt = 0;
        this.scanProtectedUntil = 0;
        this.autoTranslationRenderDueAt = 0;
        this.mediaViewerQuietUntil = 0;
        this.mediaViewerProbeAt = 0;
        this.mediaViewerProbeOpen = false;
        this.inputComposerBusyUntil = 0;
        this.unpatches = [];
        this.boundKeydown = this.handleKeydown.bind(this);
        this.boundViewportScan = this.queueViewportScan.bind(this);
        this.inputButtonScanTimer = null;
        this.inputButtonScanDueAt = 0;
        this.inputActionMenu = null;
        this.inputActionMenuCleanup = null;
        this.textboxReplacementCleanupToken = 0;
        this.textboxReplacementCleanupRemove = null;
        this.textboxReplacementCleanupTimers = [];
        this.textboxReplacementCleanupRafs = [];
        this.polishSession = null;
        this.polishResultPanel = null;
        this.polishResultPanelCleanup = null;
        this.polishRestoreControl = null;
        this.polishRestoreControlCleanup = null;
        this.polishSubmitTimer = null;
        this.manualTranslationRequestCounter = 0;
        this.manualTranslationRequestTokens = typeof WeakMap === "function" ? new WeakMap() : null;
        this.translationOwnerCounter = 0;
        this.translationOwnerPrefix = `dait-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        this.lifecycleStarted = false;
    }

    start() {
        if (this.lifecycleStarted && this.isStarted) return false;
        this.lifecycleStarted = true;
        this.lifecycleToken++;
        this.isStarted = true;
        this.apiRequestsClosed = false;
        try {
            if (this.settingsLoadBlocked) {
                this.loadSettings();
            }
            else if (this.settingsDirty) {
                this.flushSettings({ retryOnError: false });
                if (!this.settingsDirty) this.loadSettings();
            }
            else {
                this.loadSettings();
            }
            if (this.settings.ui?.diagnosticsEnabled) {
                if (this.diagnosticLogsDirty) this.flushDiagnosticLogs({ retryOnError: false });
                if (!this.diagnosticLogsDirty) this.loadDiagnosticLogs();
                else this.scheduleDiagnosticLogsPersist();
            }
            else {
                this.diagnosticLogs = [];
                this.diagnosticCompressedCount = 0;
                this.diagnosticLogsDirty = false;
                this.diagnosticLogsDirtyAt = 0;
            }
            if (this.translationCacheDirty) this.flushTranslationCache({ retryOnError: false });
            if (!this.translationCacheDirty) this.loadTranslationCache();
            else this.scheduleTranslationCachePersist();
            this.injectStyles();
            this.patchMessageContextMenu();
            this.startObserver();
            document.addEventListener("keydown", this.boundKeydown, true);
            window.addEventListener("scroll", this.boundViewportScan, { capture: true, passive: true });
            window.addEventListener("resize", this.boundViewportScan, { capture: true, passive: true });
            window.addEventListener("focus", this.boundViewportScan, { capture: true, passive: true });
            document.addEventListener("visibilitychange", this.boundViewportScan, true);
            this.queueScan();
            this.showToast(this.t("pluginStarted", { version: PLUGIN_VERSION }), "success");
            return true;
        }
        catch (error) {
            this.warnSanitized("Plugin start failed; rolling back partial initialization", error);
            try { this.stop(); }
            catch (cleanupError) {
                this.warnSanitized("Plugin start rollback failed", cleanupError);
                this.isStarted = false;
                this.lifecycleStarted = false;
                this.lifecycleToken++;
                this.apiRequestsClosed = true;
            }
            throw error;
        }
    }

    stop() {
        this.isStarted = false;
        this.lifecycleStarted = false;
        this.lifecycleToken++;
        if (this.observer) this.observer.disconnect();
        if (this.observerLifecycle) this.observerLifecycle.disconnect();
        if (this.observerRebindTimer) clearTimeout(this.observerRebindTimer);
        if (this.observerRetryTimer) clearTimeout(this.observerRetryTimer);
        this.cancelHeavyPersistenceIdle("diagnostics");
        this.cancelHeavyPersistenceIdle("cache");
        if (this.scanTimer) clearTimeout(this.scanTimer);
        this.cancelIncrementalMessageScan();
        if (this.cacheOnlyScanTimer) clearTimeout(this.cacheOnlyScanTimer);
        if (this.inputButtonScanTimer) clearTimeout(this.inputButtonScanTimer);
        if (this.quickSettingsRetryTimer) clearTimeout(this.quickSettingsRetryTimer);
        if (this.quickSettingsOpenTimer) clearTimeout(this.quickSettingsOpenTimer);
        this.cancelQuickSettingsModalVerify();
        if (this.autoTranslationRetryTimer) clearTimeout(this.autoTranslationRetryTimer);
        this.cancelAutoTranslationRenderQueue();
        if (this.settingsDirtyTimer) clearTimeout(this.settingsDirtyTimer);
        if (this.translationCacheDirtyTimer) clearTimeout(this.translationCacheDirtyTimer);
        if (this.googleTranslateRuntimeDirtyTimer) clearTimeout(this.googleTranslateRuntimeDirtyTimer);
        if (this.diagnosticLogsDirtyTimer) clearTimeout(this.diagnosticLogsDirtyTimer);
        this.apiRequestsClosed = true;
        this.abortActiveApiRequests();
        this.composerWriter.cancelAll("stop");
        this.clearHotkeyRecording();
        this.clearPolishSubmitTimer();
        this.cancelTextboxReplacementCleanup();
        this.localProviderHealthChecks.clear();
        this.localProviderHealthProbeStartedAt.clear();
        this.localProviderHealthyKeys.clear();
        this.autoTranslationPrecheckSkips.clear();
        this.googleTranslateReservedChars.clear();
        const translationCachePersisted = this.flushTranslationCache({ retryOnError: false }) !== false;
        this.flushGoogleTranslateRuntimeState({ retryOnError: false });
        this.flushSettings({ retryOnError: false });
        const diagnosticLogsPersisted = this.flushDiagnosticLogs({ retryOnError: false }) !== false;
        this.unpatchContextMenus();
        document.removeEventListener("keydown", this.boundKeydown, true);
        window.removeEventListener("scroll", this.boundViewportScan, { capture: true });
        window.removeEventListener("resize", this.boundViewportScan, { capture: true });
        window.removeEventListener("focus", this.boundViewportScan, { capture: true });
        document.removeEventListener("visibilitychange", this.boundViewportScan, true);
        this.removePolishResultPanel();
        this.removePolishRestoreControl();
        this.removeInputActionMenu();
        this.closeQuickSettingsPanel(null, "stop");
        document.querySelectorAll?.(".dait-settings")?.forEach(panel => this.destroySettingsModalSizing(panel));
        this.restoreAllTranslationSourceVisibility();
        document.querySelectorAll(".dait-message-button, .dait-polish-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-quick-settings-button, .dait-translation-line, .dait-translation-box, .dait-input-action-group").forEach(node => node.remove());
        document.querySelectorAll(".dait-input-actions-host").forEach(node => node.classList?.remove?.("dait-input-actions-host"));
        this.removeStyles();
        if (translationCachePersisted) {
            this.translationCache.clear();
            this.translationCacheMeta.clear();
            this.translationCacheNegativeLookup.clear();
        }
        this.translationCacheDirtyTimer = null;
        this.translationCacheDirtyAt = 0;
        this.translationCacheDirty = !translationCachePersisted;
        this.translationCachePersistenceDeferredSince = 0;
        this.inputButtonScanTimer = null;
        this.inputButtonScanDueAt = 0;
        this.quickSettingsRetryTimer = null;
        this.quickSettingsOpenTimer = null;
        if (diagnosticLogsPersisted) this.quickSettingsDiagnosticLogs = [];
        if (translationCachePersisted) this.persistentTranslationCacheCount = 0;
        if (diagnosticLogsPersisted) {
            this.diagnosticLogs = [];
            this.diagnosticCompressedCount = 0;
        }
        this.diagnosticLogsDirtyTimer = null;
        this.diagnosticLogsDirtyAt = 0;
        this.diagnosticLogsDirty = !diagnosticLogsPersisted;
        this.diagnosticLogsPersistenceDeferredSince = 0;
        this.translationRequests.clear();
        this.autoTranslationQueue = [];
        this.autoTranslationQueuedKeys.clear();
        this.autoTranslationPendingTargets.clear();
        this.autoTranslationFailures.clear();
        this.autoTranslationFailureHistory.clear();
        this.autoTranslationProviderFailures.clear();
        this.autoTranslationProviderNoticeAt.clear();
        this.autoTranslationRecentRenders.clear();
        this.cancelCachedTranslationDrawPass();
        this.cachedDrawMemo.clear();
        this.cachedDrawMessageMemo = new WeakMap();
        this.cachedDrawScroller = null;
        this.autoTranslationOwnScrolls = new WeakMap();
        this.autoTranslationLastExternalScrollAt = 0;
        this.lastAutoTranslationDecisions.clear();
        this.autoTranslationInFlight = 0;
        this.autoTranslationInFlightKeys.clear();
        this.autoTranslationVisibleLongInFlightKeys.clear();
        this.autoTranslationInFlightStartedAt.clear();
        this.autoTranslationInFlightTokens.clear();
        this.autoTranslationInFlightItems = 0;
        this.autoTranslationPrefetchInFlight = 0;
        this.autoTranslationConfigVersion++;
        this.observer = null;
        this.observerRoot = null;
        this.observerLifecycle = null;
        this.observerRebindTimer = null;
        this.observerRetryTimer = null;
        this.diagnosticLogsIdleCallback = null;
        this.translationCacheIdleCallback = null;
        this.settingsDirtyTimer = null;
        this.settingsDirtyAt = 0;
        this.scanTimer = null;
        this.scanDueAt = 0;
        this.cacheOnlyScanTimer = null;
        this.cacheOnlyScanDueAt = 0;
        this.scanProtectedUntil = 0;
        this.mediaViewerQuietUntil = 0;
        this.mediaViewerProbeAt = 0;
        this.mediaViewerProbeOpen = false;
        this.inputComposerBusyUntil = 0;
        this.autoTranslationRetryTimer = null;
        this.autoTranslationRetryAt = 0;
        this.autoTranslationViewportBusyUntil = 0;
        this.autoTranslationJumpCooldownUntil = 0;
        this.autoTranslationRenderPausedUntil = 0;
        this.autoTranslationLastScrollY = null;
        this.autoTranslationLastScrollByTarget = typeof WeakMap === "function" ? new WeakMap() : null;
        this.autoTranslationLastWindowScrollY = null;
        this.autoTranslationLastRouteKey = "";
        this.discordThemeCacheEpoch++;
        this.discordThemeGlobalCandidatesCache = null;
        this.discordThemeVariableValuesCache = null;
    }

    getLifecycleToken() {
        return this.lifecycleToken;
    }

    unrefTimer(timer) {
        try { timer?.unref?.(); }
        catch {}
        return timer;
    }

    isLifecycleTokenCurrent(token) {
        return this.isStarted && Number(token) === Number(this.lifecycleToken);
    }

    getSettingsPanel(options = {}) {
        const startedAt = this.getDiagnosticTime();
        const quickSettings = Boolean(options.quickSettings);
        const panel = document.createElement("div");
        panel.className = "dait-settings";
        this.syncDiscordThemeClasses(panel);

        panel.appendChild(this.createSettingsHero());

        panel.appendChild(this.createSettingsLayout(panel));

        if (!quickSettings) {
            this.scheduleSettingsModalSizing(panel);
            this.scheduleSettingsScrollTracking(panel);
        }
        this.logSlowOperation("settings.panel.build", startedAt, {
            sections: SETTINGS_SECTION_IDS.length,
            testMode: Boolean(this.settings.ui?.testModeEnabled),
            quickSettings
        });
        return panel;
    }

    createSettingsLayout(panel) {
        const layout = document.createElement("div");
        layout.className = "dait-settings-layout";
        layout.appendChild(this.createSettingsSidebar(panel));
        layout.appendChild(this.createSettingsContentList());
        return layout;
    }

    getSettingsActiveTab() {
        const tab = String(this.settings.ui?.settingsActiveTab || "");
        return SETTINGS_SECTION_IDS.includes(tab) || SETTINGS_TABS.includes(tab) ? tab : SETTINGS_SECTION_GENERAL;
    }

    createSettingsSidebar(panel = null) {
        const tabs = document.createElement("aside");
        tabs.className = "dait-settings-sidebar";
        tabs.setAttribute("role", "navigation");

        const nav = document.createElement("div");
        nav.className = "dait-settings-nav-list";
        const activeAnchor = this.getSettingsActiveTab();
        this.getSettingsNavItems().forEach(item => {
            const button = document.createElement("button");
            const active = item.id === activeAnchor;
            button.className = `dait-settings-nav-button dait-settings-nav-${item.level || "primary"}${active ? " dait-settings-nav-active" : ""}`;
            button.type = "button";
            button.dataset.daitSettingsTab = item.id;
            button.dataset.daitSettingsAnchor = item.id;
            button.setAttribute("aria-current", active ? "true" : "false");
            button.textContent = item.label;
            button.addEventListener("click", () => this.scrollToSettingsSection(item.id, button));
            nav.appendChild(button);
        });
        tabs.appendChild(nav);

        const reset = document.createElement("button");
        reset.className = "dait-settings-sidebar-reset";
        reset.type = "button";
        reset.textContent = this.t("reset");
        reset.addEventListener("click", () => {
            if (!window.confirm(this.t("resetConfirm"))) return;
            this.settings = this.clone(DEFAULT_SETTINGS);
            this.invalidateAutoTranslationQueue();
            this.saveSettings();
            const currentPanel = panel || reset.closest?.(".dait-settings");
            this.replaceSettingsPanelElement(currentPanel);
            this.queueScan();
        });
        tabs.appendChild(reset);

        return tabs;
    }

    getSettingsNavItems() {
        return this.settingsSchema.getSections().map(section => ({
            id: section.id,
            label: this.t(section.labelKey),
            level: section.level
        }));
    }

    setSettingsActiveTab(tab, source = null) {
        const activeTab = SETTINGS_SECTION_IDS.includes(tab) || SETTINGS_TABS.includes(tab) ? tab : SETTINGS_SECTION_GENERAL;
        this.settings.ui.settingsActiveTab = activeTab;
        this.saveSettings({ debounce: true });
        this.replaceSettingsPanelFrom(source);
    }

    replaceSettingsPanelFrom(source) {
        const panel = source?.closest?.(".dait-settings");
        if (panel) this.replaceSettingsPanelElement(panel);
    }

    replaceSettingsPanelElement(panel, nextPanel = null) {
        if (!panel) return null;
        nextPanel = nextPanel || this.getSettingsPanel();
        this.destroySettingsModalSizing(panel);
        panel.replaceWith?.(nextPanel);
        return nextPanel;
    }

    scrollToSettingsSection(tab, source = null) {
        const anchor = String(tab || SETTINGS_SECTION_GENERAL);
        this.settings.ui.settingsActiveTab = anchor;
        const panel = source?.closest?.(".dait-settings");
        const target = panel?.querySelector?.(`[data-dait-settings-section='${anchor}']`);
        if (!target) return;
        this.applySettingsActiveSection(panel, anchor, { force: true });
        target.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }

    applySettingsActiveSection(panel, anchor, options = {}) {
        if (!panel?.querySelectorAll) return false;
        const activeAnchor = String(anchor || SETTINGS_SECTION_GENERAL);
        const force = Boolean(options?.force);
        if (!force && panel.__daitSettingsAppliedAnchor === activeAnchor) return false;
        panel.__daitSettingsAppliedAnchor = activeAnchor;
        const setClass = (node, className, active) => {
            if (!node?.classList?.toggle) return;
            if (this.elementHasClassName(node, className) === active) return;
            node.classList.toggle(className, active);
        };
        const setAttribute = (node, name, value) => {
            if (!node?.setAttribute) return;
            if (node.getAttribute?.(name) === value) return;
            node.setAttribute(name, value);
        };
        panel?.querySelectorAll?.(".dait-settings-nav-button")?.forEach(button => {
            const active = button.dataset?.daitSettingsAnchor === activeAnchor;
            setClass(button, "dait-settings-nav-active", active);
            setAttribute(button, "aria-current", active ? "true" : "false");
        });
        panel?.querySelectorAll?.("[data-dait-settings-section]")?.forEach(section => {
            const active = section.dataset?.daitSettingsSection === activeAnchor;
            setClass(section, "dait-settings-section-active", active);
        });
        return true;
    }

    scheduleSettingsScrollTracking(panel) {
        if (!panel) return;
        this.clearSettingsScrollTrackingSchedule(panel);
        const schedule = { raf: null, timers: [] };
        panel.__daitSettingsScrollTrackingSchedule = schedule;
        const bind = () => this.bindSettingsScrollTracking(panel);
        if (typeof requestAnimationFrame === "function") {
            schedule.raf = requestAnimationFrame(() => {
                schedule.raf = null;
                bind();
            });
        }
        schedule.timers.push(setTimeout(bind, 80));
        schedule.timers.push(setTimeout(bind, 260));
    }

    clearSettingsScrollTrackingSchedule(panel) {
        const schedule = panel?.__daitSettingsScrollTrackingSchedule;
        if (!schedule) return;
        if (schedule.raf !== null && schedule.raf !== undefined && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(schedule.raf);
        }
        (schedule.timers || []).forEach(timer => clearTimeout(timer));
        panel.__daitSettingsScrollTrackingSchedule = null;
    }

    bindSettingsScrollTracking(panel, explicitScroller = null) {
        if (!panel?.querySelectorAll || panel.isConnected === false) return;
        const scroller = explicitScroller || this.getSettingsScrollTrackingContainer(panel);
        if (!scroller?.addEventListener) return;
        if (panel.__daitSettingsScrollTracking?.scroller === scroller) return;
        this.cleanupSettingsScrollTracking(panel);

        const isQuickSettingsScroller = this.elementHasClassName(scroller, "dait-quick-settings-body")
            || panel.closest?.(".dait-quick-settings-body") === scroller;
        const state = {
            scroller,
            raf: null,
            saveTimer: null,
            scrollIdleTimer: null,
            quickSettingsScroller: isQuickSettingsScroller,
            sections: this.getSettingsTrackedSections(panel)
        };
        const updateActiveSection = () => this.updateSettingsActiveSectionFromScroll(panel, scroller);
        const onScroll = () => {
            if (state.quickSettingsScroller) {
                if (state.scrollIdleTimer) clearTimeout(state.scrollIdleTimer);
                state.scrollIdleTimer = setTimeout(() => {
                    state.scrollIdleTimer = null;
                    updateActiveSection();
                }, 140);
                return;
            }
            const schedule = typeof requestAnimationFrame === "function" ? requestAnimationFrame : callback => setTimeout(callback, 0);
            if (state.raf !== null && state.raf !== undefined) return;
            state.raf = schedule(() => {
                state.raf = null;
                updateActiveSection();
            });
        };
        state.onScroll = onScroll;
        panel.__daitSettingsScrollTracking = state;
        scroller.addEventListener("scroll", onScroll, { passive: true });
        this.syncSettingsScrollPosition(panel, scroller, "auto");
    }

    syncSettingsScrollPosition(panel, scroller = null, behavior = "auto") {
        if (!panel?.querySelector) return;
        const active = this.getSettingsActiveTab();
        const target = panel.querySelector?.(`[data-dait-settings-section='${active}']`);
        this.applySettingsActiveSection(panel, active, { force: true });
        if (!target) return;

        const container = scroller || this.getSettingsScrollTrackingContainer(panel);
        if (container) {
            const offset = Number(target.offsetTop);
            if (Number.isFinite(offset)) {
                container.scrollTop = Math.max(0, offset - 12);
                return;
            }
        }

        if (typeof target.scrollIntoView === "function") {
            target.scrollIntoView({ block: "start", behavior });
        }
    }

    getSettingsScrollTrackingContainer(panel) {
        const quickBody = panel?.closest?.(".dait-quick-settings-body");
        if (quickBody) return quickBody;
        try {
            return this.getSettingsScrollContainer(panel);
        }
        catch {
            return null;
        }
    }

    updateSettingsActiveSectionFromScroll(panel, scroller) {
        const state = panel?.__daitSettingsScrollTracking;
        const anchor = this.getSettingsSectionNearestScrollTop(panel, scroller, state?.sections);
        if (!anchor) return;
        if (panel.__daitSettingsAppliedAnchor === anchor) return;
        this.applySettingsActiveSection(panel, anchor);
    }

    getSettingsTrackedSections(panel) {
        return [...(panel?.querySelectorAll?.("[data-dait-settings-section]") || [])]
            .filter(section => SETTINGS_SECTION_IDS.includes(section.dataset?.daitSettingsSection));
    }

    getSettingsSectionNearestScrollTop(panel, scroller, trackedSections = null) {
        const sections = (Array.isArray(trackedSections) && trackedSections.length ? trackedSections : this.getSettingsTrackedSections(panel))
            .filter(section => section?.isConnected !== false && SETTINGS_SECTION_IDS.includes(section.dataset?.daitSettingsSection));
        if (!sections.length) return "";

        const scrollerRect = scroller?.getBoundingClientRect?.();
        const top = Number(scrollerRect?.top || 0);
        let best = null;
        sections.forEach(section => {
            const rect = section.getBoundingClientRect?.();
            const offsetTop = Number.isFinite(Number(rect?.top))
                ? Number(rect.top) - top
                : Number(section.offsetTop || 0) - Number(scroller?.scrollTop || 0);
            const score = offsetTop <= 36 ? Math.abs(offsetTop - 12) : offsetTop + 48;
            if (!best || score < best.score) best = { section, score };
        });
        return best?.section?.dataset?.daitSettingsSection || "";
    }

    flushSettingsActiveTabSave(panel) {
        const state = panel?.__daitSettingsScrollTracking;
        if (!state?.saveTimer) return;
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
    }

    cleanupSettingsScrollTracking(panel) {
        this.clearSettingsScrollTrackingSchedule(panel);
        const state = panel?.__daitSettingsScrollTracking;
        if (!state) return;
        this.flushSettingsActiveTabSave(panel);
        if (state.scrollIdleTimer) {
            clearTimeout(state.scrollIdleTimer);
            state.scrollIdleTimer = null;
        }
        if (state.raf !== null && state.raf !== undefined && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(state.raf);
        }
        state.scroller?.removeEventListener?.("scroll", state.onScroll, { passive: true });
        panel.__daitSettingsScrollTracking = null;
    }

    createSettingsContentList() {
        const page = document.createElement("div");
        page.className = "dait-settings-page dait-settings-page-all";
        page.dataset.daitSettingsPage = "all";

        const general = this.createGeneralSection();
        general.dataset.daitSettingsSection = SETTINGS_SECTION_GENERAL;
        page.appendChild(general);

        const polish = this.createTaskSection("polish", this.t("polishTitle"), this.t("polishDescription"));
        polish.dataset.daitSettingsSection = SETTINGS_SECTION_POLISH;
        page.appendChild(polish);
        const polishControls = this.createPolishControlsSection();
        polishControls.dataset.daitSettingsSection = SETTINGS_SECTION_POLISH_CONTROLS;
        page.appendChild(polishControls);

        const translation = this.createTaskSection("translation", this.t("translationTitle"), this.t("translationDescription"));
        translation.dataset.daitSettingsSection = SETTINGS_SECTION_TRANSLATION;
        page.appendChild(translation);
        const translationControls = this.createTranslationControlsSection();
        translationControls.dataset.daitSettingsSection = SETTINGS_SECTION_TRANSLATION_CONTROLS;
        page.appendChild(translationControls);
        const autoTranslate = this.createAutoTranslateSection();
        autoTranslate.dataset.daitSettingsSection = SETTINGS_SECTION_AUTO_TRANSLATE;
        page.appendChild(autoTranslate);

        const publicBilingual = this.createPublicBilingualSection();
        publicBilingual.dataset.daitSettingsSection = SETTINGS_SECTION_PUBLIC_BILINGUAL;
        page.appendChild(publicBilingual);

        const display = this.createDisplayBehaviorSection();
        display.dataset.daitSettingsSection = SETTINGS_SECTION_DISPLAY;
        page.appendChild(display);
        const cache = this.createCacheSection();
        cache.dataset.daitSettingsSection = SETTINGS_SECTION_CACHE;
        page.appendChild(cache);
        const diagnostics = this.createDiagnosticsSection();
        diagnostics.dataset.daitSettingsSection = SETTINGS_SECTION_DIAGNOSTICS;
        page.appendChild(diagnostics);
        if (this.settings.ui.testModeEnabled) {
            const testMode = this.createTestModeSection();
            testMode.dataset.daitSettingsSection = SETTINGS_SECTION_DIAGNOSTICS;
            page.appendChild(testMode);
        }
        return page;
    }

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
        if (panel?.isConnected) this.watchSettingsModalSizingCleanup(panel);
    }

    applySettingsModalSizing(panel) {
        if (!this.isStarted || !panel?.isConnected || typeof window === "undefined") {
            this.cleanupSettingsModalSizing(panel);
            return;
        }
        if (panel.closest?.(".dait-quick-settings-dialog")) return;
        const documentWidth = typeof document !== "undefined" ? Number(document.documentElement?.clientWidth || 0) : 0;
        const viewportWidth = Number(window.innerWidth || documentWidth || 0);
        const desiredWidth = Math.max(760, Math.min(1280, viewportWidth ? viewportWidth - 72 : 1280));
        let current = panel.parentElement;
        let marked = 0;
        let root = null;
        const markedNodes = [];
        while (current && current !== document.body && marked < 5) {
            const rect = current.getBoundingClientRect?.();
            const width = Number(rect?.width || 0);
            if (!width || width <= desiredWidth + 80) {
                if (current.dataset.daitSettingsModal !== "true") current.dataset.daitSettingsModal = "true";
                this.applyDiscordThemeData(current, panel);
                root = current;
                markedNodes.push(current);
                marked++;
            }
            current = current.parentElement;
        }
        if (root) {
            if (root.dataset.daitSettingsModalRoot !== "true") root.dataset.daitSettingsModalRoot = "true";
            this.applyDiscordThemeData(root, panel);
            if (!markedNodes.includes(root)) markedNodes.push(root);
        }
        const nextNodes = new Set(markedNodes);
        const previousNodes = Array.isArray(panel.__daitSettingsModalMarkedNodes) ? panel.__daitSettingsModalMarkedNodes : [];
        previousNodes.forEach(node => {
            if (!nextNodes.has(node)) this.cleanupSettingsModalNode(node);
        });
        panel.__daitSettingsModalMarkedNodes = markedNodes;
        this.watchSettingsModalSizingCleanup(panel);
    }

    cleanupSettingsModalSizing(panel) {
        const nodes = new Set(Array.isArray(panel?.__daitSettingsModalMarkedNodes) ? panel.__daitSettingsModalMarkedNodes : []);
        nodes.forEach(node => this.cleanupSettingsModalNode(node));
        if (panel) panel.__daitSettingsModalMarkedNodes = [];
    }

    cleanupSettingsModalNode(node) {
        if (node?.dataset?.daitSettingsModal) delete node.dataset.daitSettingsModal;
        if (node?.dataset?.daitSettingsModalRoot) delete node.dataset.daitSettingsModalRoot;
        if (node?.dataset?.daitDiscordTheme) delete node.dataset.daitDiscordTheme;
        if (node?.style?.removeProperty) {
            DISCORD_THEME_VARIABLES.forEach(name => node.style.removeProperty(name));
        }
    }

    clearSettingsModalSizingSchedule(panel) {
        const schedule = panel?.__daitSettingsModalSizingSchedule;
        if (!schedule) return;
        if (schedule.raf !== null && schedule.raf !== undefined && typeof cancelAnimationFrame === "function") {
            cancelAnimationFrame(schedule.raf);
        }
        (schedule.timers || []).forEach(timer => clearTimeout(timer));
        if (panel) panel.__daitSettingsModalSizingSchedule = null;
    }

    destroySettingsModalSizing(panel) {
        this.clearHotkeyRecordingWithin(panel);
        this.cleanupSettingsScrollTracking(panel);
        this.clearSettingsModalSizingSchedule(panel);
        if (panel?.__daitSettingsModalCleanupObserver) {
            panel.__daitSettingsModalCleanupObserver.disconnect?.();
            panel.__daitSettingsModalCleanupObserver = null;
        }
        this.cleanupSettingsModalSizing(panel);
    }

    watchSettingsModalSizingCleanup(panel) {
        if (!panel?.isConnected || panel.__daitSettingsModalCleanupObserver || typeof MutationObserver !== "function" || typeof document === "undefined" || !document.body) return;
        const observer = new MutationObserver(() => {
            if (panel.isConnected) return;
            this.clearHotkeyRecordingWithin(panel);
            this.cleanupSettingsScrollTracking(panel);
            this.clearSettingsModalSizingSchedule(panel);
            this.cleanupSettingsModalSizing(panel);
            observer.disconnect?.();
            panel.__daitSettingsModalCleanupObserver = null;
        });
        observer.observe(document.body, { childList: true, subtree: true });
        panel.__daitSettingsModalCleanupObserver = observer;
    }

    createSettingsHero() {
        const hero = document.createElement("div");
        hero.className = "dait-settings-hero";

        const mark = document.createElement("div");
        mark.className = "dait-settings-mark";
        mark.textContent = "AI";
        hero.appendChild(mark);

        const copy = document.createElement("div");
        copy.className = "dait-settings-copy";

        const title = document.createElement("h2");
        title.textContent = this.t("settingsTitle");
        copy.appendChild(title);

        const note = document.createElement("p");
        note.className = "dait-note";
        note.textContent = this.t("settingsNote");
        copy.appendChild(note);

        const chips = document.createElement("div");
        chips.className = "dait-settings-chips";
        const versionChip = document.createElement("span");
        versionChip.className = "dait-settings-version";
        versionChip.dataset.daitVersion = PLUGIN_VERSION;
        versionChip.textContent = `v${PLUGIN_VERSION}`;
        chips.appendChild(versionChip);
        [this.t("polishTitle"), this.t("translationTitle"), "DeepSeek V4"].forEach(text => {
            const chip = document.createElement("span");
            chip.textContent = text;
            chips.appendChild(chip);
        });
        copy.appendChild(chips);

        hero.appendChild(copy);
        return hero;
    }

    createGeneralSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-general";

        const title = document.createElement("h3");
        title.textContent = this.t("generalTitle");
        section.appendChild(title);

        section.appendChild(this.createSelectRow("ui.language", this.t("interfaceLanguage"), [
            ["zh-CN", this.t("languageZh")],
            ["en", this.t("languageEn")]
        ], { description: this.t("interfaceLanguageDesc") }));

        return section;
    }

    createTaskSection(kind, titleText, descriptionText) {
        const section = document.createElement("section");
        section.className = `dait-settings-section dait-section-${kind}`;

        const title = document.createElement("h3");
        title.textContent = titleText;
        section.appendChild(title);

        const description = document.createElement("p");
        description.className = "dait-note";
        description.textContent = descriptionText;
        section.appendChild(description);

        section.appendChild(this.createCheckboxRow(`${kind}.enabled`, this.t("enabled"), { description: this.t("enabledDesc") }));
        const providerOptions = this.getProviderOptionsForTask(kind);
        section.appendChild(this.createSelectRow(`${kind}.provider`, this.t("provider"), providerOptions, { description: this.t("providerDesc") }));
        const capabilities = this.getProviderCapabilities(this.settings[kind]?.provider);
        const ui = capabilities.ui || {};
        if (ui.sourceLanguage) section.appendChild(this.createLanguageRow(kind, "sourceLanguage", this.t("inputLanguage"), this.t("inputLanguageDesc"), { allowAuto: true }));
        if (ui.targetLanguage) section.appendChild(this.createLanguageRow(kind, "targetLanguage", kind === "polish" ? this.t("outputLanguage") : this.t("targetLanguage"), kind === "polish" ? this.t("outputLanguageDesc") : this.t("targetLanguageDesc")));

        if (kind === "polish") {
            section.appendChild(this.createSelectRow("polish.afterAction", this.t("afterPolishing"), [
                ["replace", this.t("afterReplace")],
                ["confirmSend", this.t("afterConfirmSend")]
            ], { description: this.t("afterPolishingDesc") }));
            section.appendChild(this.createSelectRow("polish.repolishSource", this.t("repolishSource"), [
                [POLISH_REPOLISH_SOURCE_ORIGINAL, this.t("repolishSourceOriginal")],
                [POLISH_REPOLISH_SOURCE_LAST_RESULT, this.t("repolishSourceLastResult")]
            ], { description: this.t("repolishSourceDesc") }));
        }

        const providerSettings = this.createTaskProviderSettingsBlock(kind, ui);
        if (providerSettings) section.appendChild(providerSettings);
        return section;
    }

    createTaskProviderSettingsBlock(kind, ui = this.getProviderCapabilities(this.settings[kind]?.provider).ui || {}) {
        const block = document.createElement("div");
        block.className = "dait-provider-settings-block";
        block.dataset.daitProvider = String(this.settings[kind]?.provider || "");

        const header = document.createElement("div");
        header.className = "dait-provider-settings-header";
        const title = document.createElement("span");
        title.className = "dait-provider-settings-title";
        title.textContent = `${this.t("providerSettingsTitle")} - ${this.getProviderDisplayName(this.settings[kind]?.provider)}`;
        const description = document.createElement("p");
        description.className = "dait-row-description";
        description.textContent = this.t("providerSettingsDesc");
        header.appendChild(title);
        header.appendChild(description);
        block.appendChild(header);

        let hasRows = false;
        const append = node => {
            if (!node) return;
            hasRows = true;
            block.appendChild(node);
        };

        if (ui.apiKey) append(this.createApiKeyRow(kind));
        else if (ui.apiTest) append(this.createProviderStatusRow(kind));
        if (ui.endpoint) append(this.createInputRow(`${kind}.endpoint`, this.t("endpoint"), "text", "https://api.example.com/v1/chat/completions", {}, { description: this.t("endpointDesc") }));
        if (ui.region) append(this.createInputRow(`${kind}.region`, this.t("providerRegion"), "text", "eastus", {}, { description: this.t("providerRegionDesc") }));
        if (ui.deeplPlan) append(this.createSelectRow(`${kind}.deeplPlan`, this.t("deeplPlan"), [
            ["free", this.t("deeplPlanFree")],
            ["pro", this.t("deeplPlanPro")]
        ], { description: this.t("deeplPlanDesc") }));
        if (ui.baiduCredentials) {
            append(this.createInputRow(`${kind}.appId`, this.t("baiduAppId"), "text", "", {}, { description: this.t("baiduAppIdDesc") }));
            append(this.createInputRow(`${kind}.secretKey`, this.t("baiduSecretKey"), "password", "", {}, { description: this.t("baiduSecretKeyDesc") }));
        }
        if (ui.deepseekPreset) append(this.createDeepSeekModelRow(kind));
        if (ui.localModelPreset) append(this.createLocalModelRow(kind));
        if (ui.model) append(this.createInputRow(`${kind}.model`, this.t("model"), "text", "deepseek-v4-flash", {}, { description: this.t("modelDesc") }));
        if (ui.enableThinking) append(this.createCheckboxRow(`${kind}.enableThinking`, this.t("thinkingMode"), { description: this.t("thinkingModeDesc") }));
        if (ui.temperature) append(this.createInputRow(`${kind}.temperature`, this.t("temperature"), "number", "0.4", { min: "0", max: "2", step: "0.1" }, { description: this.t("temperatureDesc") }));
        if (ui.maxTokens) append(this.createInputRow(`${kind}.maxTokens`, this.t("maxTokens"), "number", "800", { min: "1", step: "1" }, { description: this.t("maxTokensDesc") }));
        if (kind === "translation" && ui.googleTranslateSettings) append(this.createGoogleTranslateSettings());
        if (ui.promptManager) append(this.createPromptManager(kind));

        return hasRows ? block : null;
    }

    createPolishControlsSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-polish-controls";

        const title = document.createElement("h3");
        title.textContent = this.t("polishControlsTitle");
        section.appendChild(title);

        section.appendChild(this.createCheckboxRow("ui.injectInputButton", this.t("showPolishButton"), { description: this.t("showPolishButtonDesc") }));
        section.appendChild(this.createCheckboxRow("ui.enablePolishHotkey", this.t("enableHotkey"), { description: this.t("enableHotkeyDesc") }));
        section.appendChild(this.createHotkeyRow());

        return section;
    }

    createTranslationControlsSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-translation-controls";

        const title = document.createElement("h3");
        title.textContent = this.t("translationControlsTitle");
        section.appendChild(title);

        section.appendChild(this.createCheckboxRow("ui.injectMessageButtons", this.t("showMessageButtons"), { description: this.t("showMessageButtonsDesc") }));
        section.appendChild(this.createSelectRow("ui.messageButtonVisibility", this.t("messageButtonVisibility"), [
            [MESSAGE_BUTTON_VISIBILITY_ALWAYS, this.t("messageButtonVisibilityAlways")],
            [MESSAGE_BUTTON_VISIBILITY_HOVER, this.t("messageButtonVisibilityHover")]
        ], { description: this.t("messageButtonVisibilityDesc") }));
        section.appendChild(this.createCheckboxRow("ui.injectMessageContextMenu", this.t("showContextMenu"), { description: this.t("showContextMenuDesc") }));

        return section;
    }

    createAutoTranslateSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-auto-translate";
        const provider = this.getProviderDefaults(this.settings.translation.provider);
        const local = this.isLocalTranslationProvider(this.settings.translation);
        const concurrencyRange = { min: AUTO_TRANSLATE_MIN_CONCURRENCY, max: AUTO_TRANSLATE_MAX_CONCURRENCY, default: AUTO_TRANSLATE_DEFAULT_CONCURRENCY };

        const title = document.createElement("h3");
        title.textContent = this.t("autoTranslateSettingsTitle");
        section.appendChild(title);

        section.appendChild(this.createCheckboxRow("ui.autoTranslateMessages", this.t("autoTranslateMessages"), { description: this.t("autoTranslateMessagesDesc") }));
        section.appendChild(this.createCheckboxRow("ui.autoTranslatePrefetch", this.t("autoTranslatePrefetch"), { description: this.t("autoTranslatePrefetchDesc") }));
        section.appendChild(this.createSelectRow("ui.autoTranslatePrefetchRange", this.t("autoTranslatePrefetchRange"), AUTO_TRANSLATE_PREFETCH_RANGES.map(value => [String(value), String(value)]), { description: this.t("autoTranslatePrefetchRangeDesc") }));
        section.appendChild(this.createSelectRow("ui.autoTranslateIntakeMode", this.t("autoTranslateIntakeMode"), [
            ["auto", this.t("autoTranslateIntakeAuto")],
            ["dom", this.t("autoTranslateIntakeDom")],
            ["bdfdb", this.t("autoTranslateIntakeBdfdb")]
        ], { description: this.t("autoTranslateIntakeModeDesc"), disabledReason: provider?.autoTranslateIntakeMode && this.t("localIntakeFixed") }));
        section.appendChild(this.createInputRow("ui.autoTranslateConcurrency", this.t("autoTranslateConcurrency"), "number", String(AUTO_TRANSLATE_DEFAULT_CONCURRENCY), { min: String(AUTO_TRANSLATE_MIN_CONCURRENCY), max: String(AUTO_TRANSLATE_MAX_CONCURRENCY), step: "1" }, { description: this.t(local ? "localConcurrencyDesc" : "autoTranslateConcurrencyDesc", concurrencyRange) }));
        section.appendChild(this.createCheckboxRow("ui.autoTranslateStrictRetry", this.t("autoTranslateStrictRetry"), { description: this.t("autoTranslateStrictRetryDesc") }));
        section.appendChild(this.createCurrentChannelPolicyRow());
        section.appendChild(this.createCheckboxRow("ui.historyBackfillEnabled", this.t("historyBackfillEnabled"), { description: this.t("historyBackfillEnabledDesc") }));
        section.appendChild(this.createInputRow("ui.historyBackfillLimit", this.t("historyBackfillLimit"), "number", String(DEFAULT_SETTINGS.ui.historyBackfillLimit), { min: "1", max: "100", step: "1" }, { description: this.t("historyBackfillLimitDesc") }));
        section.appendChild(this.createHistoryBackfillActionRow());
        section.appendChild(this.createCheckboxRow("ui.providerFallbackEnabled", this.t("providerFallbackEnabled"), { description: this.t("providerFallbackEnabledDesc"), disabledReason: local && this.t("localFallbackUnavailable") }));
        section.appendChild(this.createProviderFallbackOrderRow(local));

        return section;
    }

    createCurrentChannelPolicyRow() {
        return this.createSelectRow("ui.currentChannelAutoTranslatePolicy", this.t("currentChannelAutoTranslatePolicy"), [
            ["inherit", this.t("channelPolicyInherit")],
            ["enabled", this.t("channelPolicyEnabled")],
            ["disabled", this.t("channelPolicyDisabled")]
        ], { description: this.t("currentChannelAutoTranslatePolicyDesc") });
    }

    createHistoryBackfillActionRow() {
        const controls = document.createElement("div");
        controls.className = "dait-history-backfill-actions";
        const button = this.createSmallButton(this.t("historyBackfillRun"));
        button.dataset.daitAction = "historyBackfillRun";
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.runExplicitHistoryBackfillFromUi(button, { source: "settings" });
        });
        controls.appendChild(button);
        return this.createRow(this.t("historyBackfillRun"), controls, { description: this.t("historyBackfillRunDesc") });
    }

    createProviderFallbackOrderRow(local) {
        const textarea = document.createElement("textarea");
        textarea.dataset.daitPath = "ui.providerFallbackOrder";
        textarea.rows = 3;
        textarea.value = this.formatProviderFallbackOrder(this.settings.ui?.providerFallbackOrder);
        this.bindSettingsTextarea(textarea);
        textarea.addEventListener("change", () => {
            this.preserveSettingsScroll(textarea, () => this.setSetting("ui.providerFallbackOrder", textarea.value));
        });
        return this.createRow(this.t("providerFallbackOrder"), textarea, {
            description: this.t("providerFallbackOrderDesc", { providers: PROVIDER_ORDER.join(", ") }),
            disabledReason: local && this.t("localFallbackUnavailable"),
            wide: true
        });
    }

    createPublicBilingualSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-public-bilingual";

        const title = document.createElement("h3");
        title.textContent = this.t("publicBilingualTitle");
        section.appendChild(title);

        const description = document.createElement("p");
        description.className = "dait-note";
        description.textContent = this.t("publicBilingualDependencyDesc");
        section.appendChild(description);

        section.appendChild(this.createCheckboxRow("ui.publicBilingualInputButton", this.t("publicBilingualInputButton"), { description: this.t("publicBilingualInputButtonDesc") }));
        section.appendChild(this.createCheckboxRow("ui.publicBilingualUseInitialOriginal", this.t("publicBilingualUseInitialOriginal"), { description: this.t("publicBilingualUseInitialOriginalDesc") }));
        section.appendChild(this.createCheckboxRow("ui.publicBilingualAfterPolish", this.t("publicBilingualAfterPolish"), { description: this.t("publicBilingualAfterPolishDesc") }));
        section.appendChild(this.createCheckboxRow("ui.publicBilingualPolishBeforeTranslate", this.t("publicBilingualPolishBeforeTranslate"), { description: this.t("publicBilingualPolishBeforeTranslateDesc") }));
        section.appendChild(this.createPublicBilingualDependencyRow());

        return section;
    }

    createPublicBilingualDependencyRow() {
        const summary = document.createElement("div");
        summary.className = "dait-provider-summary";
        summary.textContent = this.t("publicBilingualDependencyStatus", {
            polishProvider: this.getProviderDisplayName(this.settings.polish?.provider),
            translationProvider: this.getProviderDisplayName(this.settings.translation?.provider),
            targetLanguage: this.getDisplayLanguage(this.settings.translation?.targetLanguage)
        });
        return this.createRow(this.t("publicBilingualDependencyTitle"), summary, {
            description: this.t("publicBilingualDependencyDesc"),
            wide: true
        });
    }

    createDisplayBehaviorSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-display";

        const title = document.createElement("h3");
        title.textContent = this.t("displaySettingsTitle");
        section.appendChild(title);

        section.appendChild(this.createCheckboxRow("ui.showQuickSettingsPanelButton", this.t("showQuickSettingsPanelButton"), { description: this.t("showQuickSettingsPanelButtonDesc") }));
        section.appendChild(this.createCheckboxRow("ui.showAutoTranslateWarnings", this.t("showAutoTranslateWarnings"), { description: this.t("showAutoTranslateWarningsDesc") }));
        section.appendChild(this.createCheckboxRow("ui.showAutoTranslateToasts", this.t("showAutoTranslateToasts"), { description: this.t("showAutoTranslateToastsDesc") }));
        section.appendChild(this.createSelectRow("ui.translationPosition", this.t("translationPosition"), [
            ["before", this.t("translationBeforeOriginal")],
            ["after", this.t("translationAfterOriginal")]
        ], { description: this.t("translationPositionDesc") }));
        section.appendChild(this.createCheckboxRow("ui.maskTranslations", this.t("maskTranslations"), { description: this.t("maskTranslationsDesc") }));
        section.appendChild(this.createCheckboxRow("ui.hideOriginalAfterTranslation", this.t("hideOriginalAfterTranslation"), { description: this.t("hideOriginalAfterTranslationDesc") }));

        return section;
    }

    createCacheSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-cache";

        const title = document.createElement("h3");
        title.textContent = this.t("cacheSettingsTitle");
        section.appendChild(title);

        section.appendChild(this.createSelectRow("ui.translationCacheTtlHours", this.t("translationCacheTtl"), TRANSLATION_CACHE_TTL_OPTIONS.map(value => [String(value), this.getTranslationCacheTtlLabel(value)]), { description: this.t("translationCacheTtlDesc") }));
        section.appendChild(this.createInputRow("ui.translationCacheMaxEntries", this.t("translationCacheMaxEntries"), "number", String(TRANSLATION_CACHE_DEFAULT_LIMIT), { min: String(TRANSLATION_CACHE_MIN_LIMIT), max: String(TRANSLATION_CACHE_MAX_LIMIT), step: "100" }, { description: this.t("translationCacheMaxEntriesDesc") }));
        section.appendChild(this.createTranslationCacheStatsRow());

        return section;
    }

    createDiagnosticsSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-section-diagnostics";

        const title = document.createElement("h3");
        title.textContent = this.t("diagnosticsSettingsTitle");
        section.appendChild(title);

        section.appendChild(this.createCheckboxRow("ui.diagnosticsEnabled", this.t("diagnosticLogs"), { description: this.t("diagnosticLogsDesc") }));
        section.appendChild(this.createDiagnosticLogsRow());
        section.appendChild(this.createSettingsSnapshotRow());
        section.appendChild(this.createDiagnosticSummaryRow());
        section.appendChild(this.createCheckboxRow("ui.testModeEnabled", this.t("testMode"), { description: this.t("testModeDesc"), refreshPanel: true }));

        return section;
    }

    createCheckboxRow(path, labelText, rowOptions = {}) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.daitPath = path;
        input.checked = Boolean(this.getSetting(path));
        input.addEventListener("change", () => {
            this.setSetting(path, input.checked);
            if (rowOptions.refreshPanel) {
                const panel = input.closest(".dait-settings");
                if (panel) this.updateTestModeVisibility(panel, input.checked);
            }
        });
        return this.createRow(labelText, input, { ...rowOptions, checkbox: true });
    }

    updateTestModeVisibility(panel, enabled) {
        const page = panel?.querySelector?.(".dait-settings-page-all");
        if (!page?.appendChild) {
            const nextPanel = this.getSettingsPanel();
            this.replaceSettingsPanelElement(panel, nextPanel);
            if (enabled) {
                nextPanel.querySelector?.(".dait-test-mode-section")?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
            }
            return;
        }
        let section = page.querySelector?.(".dait-test-mode-section");
        if (!enabled) {
            section?.remove?.();
            this.applySettingsActiveSection(panel, this.getSettingsActiveTab(), { force: true });
            return;
        }
        if (!section) {
            section = this.createTestModeSection();
            section.dataset.daitSettingsSection = SETTINGS_SECTION_DIAGNOSTICS;
            const diagnostics = page.querySelector?.(".dait-section-diagnostics")
                || page.querySelector?.(`[data-dait-settings-section='${SETTINGS_SECTION_DIAGNOSTICS}']`);
            if (diagnostics?.parentElement === page && page.insertBefore) {
                page.insertBefore(section, diagnostics.nextSibling || null);
            }
            else {
                page.appendChild(section);
            }
        }
        if (enabled) {
            section.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
        }
        this.applySettingsActiveSection(panel, this.getSettingsActiveTab(), { force: true });
    }

    createApiKeyRow(kind) {
        const row = document.createElement("div");
        row.className = "dait-settings-row dait-api-key-row";

        const label = document.createElement("span");
        label.className = "dait-row-label";
        label.textContent = this.t("apiKey");
        row.appendChild(label);

        const status = document.createElement("span");
        const savedStatus = this.getApiStatus(kind);
        status.className = `dait-api-status dait-api-status-${savedStatus.state}`;
        status.dataset.daitKind = kind;
        status.textContent = this.getApiStatusText(savedStatus.state);
        status.title = savedStatus.message || "";
        row.appendChild(status);

        const description = document.createElement("p");
        description.className = "dait-row-description";
        description.textContent = this.t("apiKeyDesc");
        row.appendChild(description);

        const controls = document.createElement("div");
        controls.className = "dait-api-controls";

        const input = document.createElement("input");
        input.type = "password";
        input.dataset.daitPath = `${kind}.apiKey`;
        input.placeholder = "sk-...";
        input.value = this.getSetting(`${kind}.apiKey`) ?? "";
        input.addEventListener("change", () => this.setSetting(`${kind}.apiKey`, input.value));
        controls.appendChild(input);

        const test = this.createSmallButton(this.t("apiTest"));
        test.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.testApiConnection(kind, test, status);
        });
        controls.appendChild(test);

        row.appendChild(controls);
        return row;
    }

    createProviderStatusRow(kind) {
        const row = document.createElement("div");
        row.className = "dait-settings-row dait-api-key-row dait-provider-status-row";

        const label = document.createElement("span");
        label.className = "dait-row-label";
        label.textContent = this.t("providerStatus");
        row.appendChild(label);

        const status = document.createElement("span");
        const savedStatus = this.getApiStatus(kind);
        status.className = `dait-api-status dait-api-status-${savedStatus.state}`;
        status.dataset.daitKind = kind;
        status.textContent = this.getApiStatusText(savedStatus.state);
        status.title = savedStatus.message || "";
        row.appendChild(status);

        const description = document.createElement("p");
        description.className = "dait-row-description";
        description.textContent = this.t("providerStatusDesc");
        row.appendChild(description);

        const controls = document.createElement("div");
        controls.className = "dait-api-controls";
        const test = this.createSmallButton(this.t("apiTest"));
        test.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.testApiConnection(kind, test, status);
        });
        controls.appendChild(test);
        row.appendChild(controls);
        return row;
    }

    createHotkeyRow() {
        const controls = document.createElement("div");
        controls.className = "dait-hotkey-controls";

        const record = this.createSmallButton(this.getHotkeyLabel());
        record.classList.add("dait-hotkey-recorder");

        const reset = this.createSmallButton(this.t("hotkeyReset"));
        reset.addEventListener("click", () => {
            this.setSetting("ui.polishHotkey", DEFAULT_SETTINGS.ui.polishHotkey);
            record.textContent = this.getHotkeyLabel();
            this.showToast(this.t("hotkeySaved", { shortcut: this.getHotkeyLabel() }), "success");
        });

        record.addEventListener("click", () => this.recordHotkey(record));

        controls.appendChild(record);
        controls.appendChild(reset);
        return this.createRow(this.t("polishHotkey"), controls, { description: this.t("polishHotkeyDesc") });
    }

    createTranslationCacheStatsRow() {
        const controls = document.createElement("div");
        controls.className = "dait-cache-actions";
        const clearStats = this.createSmallButton(this.t("clearTranslationCacheStats"));
        const clearCache = this.createSmallButton(this.t("clearTranslationCache"), "danger");
        const refreshDescription = button => {
            const row = button.closest(".dait-settings-row");
            const description = row?.querySelector?.(".dait-row-description");
            if (description) description.textContent = this.getTranslationCacheStatsText();
        };
        clearStats.addEventListener("click", () => {
            this.clearTranslationCacheStats();
            refreshDescription(clearStats);
        });
        clearCache.addEventListener("click", () => {
            if (!window.confirm(this.t("clearTranslationCacheConfirm"))) return;
            this.clearTranslationCache();
            refreshDescription(clearCache);
        });
        controls.appendChild(clearStats);
        controls.appendChild(clearCache);
        return this.createRow(this.t("translationCacheStats"), controls, {
            description: this.getTranslationCacheStatsText()
        });
    }

    createDiagnosticLogsRow() {
        const controls = document.createElement("div");
        controls.className = "dait-diagnostic-actions";
        const clear = this.createSmallButton(this.t("clearDiagnosticLogs"));
        const copy = this.createSmallButton(this.t("copyDiagnosticLogs"));
        const exportJson = this.createSmallButton(this.t("exportDiagnosticJson"));
        const exportTxt = this.createSmallButton(this.t("exportDiagnosticTxt"));
        const refreshDescription = button => {
            const row = button.closest(".dait-settings-row");
            const description = row?.querySelector?.(".dait-row-description");
            if (description) description.textContent = this.getDiagnosticLogsStatsText();
        };
        const refreshDiagnostics = button => {
            refreshDescription(button);
            this.refreshDiagnosticSummary(button.closest(".dait-settings-section"));
        };

        clear.addEventListener("click", () => {
            this.clearDiagnosticLogs();
            refreshDiagnostics(clear);
        });
        copy.addEventListener("click", async () => {
            await this.copyDiagnosticLogs();
            refreshDiagnostics(copy);
        });
        exportJson.addEventListener("click", async () => {
            await this.exportDiagnosticLogs("json");
            refreshDiagnostics(exportJson);
        });
        exportTxt.addEventListener("click", async () => {
            await this.exportDiagnosticLogs("txt");
            refreshDiagnostics(exportTxt);
        });

        controls.appendChild(clear);
        controls.appendChild(copy);
        controls.appendChild(exportJson);
        controls.appendChild(exportTxt);
        return this.createRow(this.t("diagnosticLogs"), controls, {
            description: this.getDiagnosticLogsStatsText()
        });
    }

    createSettingsSnapshotRow() {
        const controls = document.createElement("div");
        controls.className = "dait-diagnostic-actions";
        const button = this.createSmallButton(this.t("exportSettingsSnapshot"));
        button.dataset.daitAction = "exportSettingsSnapshot";
        button.addEventListener("click", () => this.exportSettingsSnapshot());
        controls.appendChild(button);
        return this.createRow(this.t("settingsSnapshot"), controls, { description: this.t("settingsSnapshotDesc") });
    }

    createDiagnosticSummaryRow() {
        const summary = this.createDiagnosticSummary(this.diagnosticLogs);
        const row = this.createRow(this.t("diagnosticSummary"), this.createDiagnosticSummaryPanel(summary), {
            description: this.getDiagnosticSummaryStatsText(summary),
            wide: true
        });
        row.classList.add("dait-diagnostic-summary-row");
        return row;
    }

    refreshDiagnosticSummary(root) {
        const row = root?.querySelector?.(".dait-diagnostic-summary-row");
        if (!row) return;
        const summary = this.createDiagnosticSummary(this.diagnosticLogs);
        const description = row.querySelector?.(".dait-row-description");
        if (description) description.textContent = this.getDiagnosticSummaryStatsText(summary);
        const current = row.querySelector?.(".dait-diagnostic-summary");
        if (current) current.replaceWith(this.createDiagnosticSummaryPanel(summary));
    }

    createDiagnosticSummaryPanel(summary = this.createDiagnosticSummary(this.diagnosticLogs)) {
        const panel = document.createElement("div");
        panel.className = "dait-diagnostic-summary";

        const groups = [
            [this.t("diagnosticSummaryStates"), summary.top?.messageStates || []],
            [this.t("diagnosticSummaryReasons"), summary.top?.reasonCodes || []],
            [this.t("diagnosticSummaryFlows"), summary.top?.flows || []],
            [this.t("diagnosticSummaryQueues"), this.getDiagnosticSummaryQueueItems(summary)],
            [this.t("diagnosticSummaryProviders"), summary.top?.providers || []],
            [this.t("diagnosticSummaryFailures"), summary.top?.failureClasses?.length ? summary.top.failureClasses : summary.top?.failureTypes || []],
            ["failureLayer", summary.top?.failureLayers || []],
            ["flowStage", summary.top?.flowStages || []]
        ].filter(([, items]) => Array.isArray(items) && items.length);

        if (!groups.length) {
            const empty = document.createElement("span");
            empty.className = "dait-diagnostic-summary-empty";
            empty.textContent = this.t("diagnosticSummaryEmpty");
            panel.appendChild(empty);
            return panel;
        }

        groups.forEach(([label, items]) => panel.appendChild(this.createDiagnosticSummaryGroup(label, items)));
        return panel;
    }

    createDiagnosticSummaryGroup(label, items = []) {
        const group = document.createElement("div");
        group.className = "dait-diagnostic-summary-group";

        const title = document.createElement("span");
        title.className = "dait-diagnostic-summary-title";
        title.textContent = label;
        group.appendChild(title);

        const chips = document.createElement("div");
        chips.className = "dait-diagnostic-summary-chips";
        items.slice(0, 8).forEach(item => {
            const chip = document.createElement("span");
            chip.className = "dait-diagnostic-chip";
            chip.textContent = `${item.key}: ${item.count}`;
            chips.appendChild(chip);
        });
        group.appendChild(chips);
        return group;
    }

    getDiagnosticSummaryQueueItems(summary = {}) {
        const items = Array.isArray(summary.top?.queueTypes) ? [...summary.top.queueTypes] : [];
        const queue = summary.queue || {};
        [
            ["queueLength", queue.queueLength],
            ["inFlight", queue.inFlight],
            ["inFlightItems", queue.inFlightItems],
            ["prefetchInFlight", queue.prefetchInFlight],
            ["pendingTargets", queue.pendingTargets]
        ].forEach(([key, value]) => {
            const count = Number(value || 0) || 0;
            if (count > 0 && !items.some(item => item.key === key)) items.push({ key, count });
        });
        return items;
    }

    createGoogleTranslateSettings() {
        const block = document.createElement("div");
        block.className = "dait-google-settings";

        const header = document.createElement("div");
        header.className = "dait-prompt-manager-header";
        const title = document.createElement("span");
        title.textContent = this.t("googleTranslateTitle");
        header.appendChild(title);
        block.appendChild(header);

        block.appendChild(this.createTextareaRow("googleTranslate.keyPoolText", this.t("googleTranslateKeys"), {
            description: this.t("googleTranslateKeysDesc")
        }));
        block.appendChild(this.createInputRow("googleTranslate.defaultMonthlyLimit", this.t("googleTranslateDefaultLimit"), "number", String(GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT), {
            min: "1",
            max: String(GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT),
            step: "1000"
        }, { description: this.t("googleTranslateDefaultLimitDesc") }));
        block.appendChild(this.createCheckboxRow("googleTranslate.allowPrefetch", this.t("googleTranslateAllowPrefetch"), {
            description: this.t("googleTranslateAllowPrefetchDesc")
        }));
        block.appendChild(this.createGoogleTranslateStatsRow());
        return block;
    }

    createGoogleTranslateStatsRow() {
        const controls = document.createElement("div");
        controls.className = "dait-cache-actions";
        const reset = this.createSmallButton(this.t("googleTranslateResetStats"), "danger");
        reset.addEventListener("click", () => {
            if (!window.confirm(this.t("googleTranslateResetConfirm"))) return;
            this.resetGoogleTranslateUsageStats();
            const row = reset.closest(".dait-settings-row");
            const description = row?.querySelector?.(".dait-row-description");
            if (description) description.textContent = this.getGoogleTranslateStatsText();
        });
        controls.appendChild(reset);
        return this.createRow(this.t("googleTranslateStats"), controls, {
            description: this.getGoogleTranslateStatsText()
        });
    }

    getDiagnosticLogsStatsText() {
        return this.t("diagnosticLogsStats", {
            entries: this.diagnosticLogs.length,
            compressed: this.diagnosticCompressedCount
        });
    }

    getDiagnosticSummaryStatsText(summary = this.createDiagnosticSummary(this.diagnosticLogs)) {
        const events = Number(summary?.totalEvents || 0) || 0;
        if (!events) return this.t("diagnosticSummaryEmpty");
        const latest = this.formatDiagnosticSummaryTime(summary?.latestIso);
        return `${this.t("diagnosticSummaryEvents", { events, latest })} ${this.t("diagnosticSummaryDesc")}`;
    }

    formatDiagnosticSummaryTime(iso) {
        if (!iso) return "-";
        const date = new Date(iso);
        if (!Number.isFinite(date.getTime())) return String(iso);
        const locale = this.getLocale() === "en" ? "en-US" : "zh-CN";
        try {
            return date.toLocaleString(locale, { hour12: false });
        }
        catch {
            return date.toLocaleString();
        }
    }

    getGoogleTranslateStatsText() {
        const stats = this.getGoogleTranslateUsageSummary();
        return this.t("googleTranslateStatsDesc", {
            used: stats.used,
            limit: stats.limit,
            available: stats.available,
            total: stats.total,
            month: stats.monthKey
        });
    }

    getTranslationCacheStatsText() {
        return this.t("translationCacheStatsDesc", {
            hits: this.translationCacheStats.hits,
            misses: this.translationCacheStats.misses,
            memory: this.translationCache.size,
            persistent: this.persistentTranslationCacheCount
        });
    }

    getTranslationCacheTtlLabel(hours) {
        const value = Number(hours);
        const labels = {
            3: this.t("cacheTtl3h"),
            6: this.t("cacheTtl6h"),
            12: this.t("cacheTtl12h"),
            24: this.t("cacheTtl1d"),
            48: this.t("cacheTtl2d"),
            168: this.t("cacheTtl7d")
        };
        return labels[value] || `${value}h`;
    }

    createTestModeSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-section dait-test-mode-section";

        const title = document.createElement("h3");
        title.textContent = this.t("testModeTitle");
        section.appendChild(title);

        const note = document.createElement("p");
        note.className = "dait-note";
        note.textContent = this.t("testModeNote");
        section.appendChild(note);

        const panel = document.createElement("div");
        panel.className = "dait-test-panel";

        const toolbar = document.createElement("div");
        toolbar.className = "dait-test-toolbar";

        const kindSelect = document.createElement("select");
        kindSelect.className = "dait-test-kind";
        [
            ["polish", this.t("polishTitle")],
            ["translation", this.t("translationTitle")]
        ].forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = value === this.getTestModeKind();
            kindSelect.appendChild(option);
        });
        toolbar.appendChild(kindSelect);

        const config = document.createElement("span");
        config.className = "dait-test-config";
        toolbar.appendChild(config);
        panel.appendChild(toolbar);

        const inputBlock = this.createTestBlock(this.t("testModeInput"), this.t("testModeInputDesc"), { compactHeader: true });
        const copyInput = this.createSmallButton(this.t("testModeCopyInput"));
        inputBlock.querySelector(".dait-test-block-header")?.appendChild(copyInput);
        const input = document.createElement("textarea");
        input.className = "dait-test-input";
        input.placeholder = this.t("testModeInputPlaceholder");
        input.rows = 5;
        inputBlock.appendChild(input);
        panel.appendChild(inputBlock);

        const promptBlock = this.createTestBlock(this.t("testModePrompt"), this.t("testModePromptDesc"), { compactHeader: true });
        const copyPrompt = this.createSmallButton(this.t("testModeCopyPrompt"));
        promptBlock.querySelector(".dait-test-block-header")?.appendChild(copyPrompt);
        const prompt = document.createElement("textarea");
        prompt.className = "dait-test-prompt";
        prompt.rows = 6;
        this.bindSettingsTextarea(prompt);
        promptBlock.appendChild(prompt);
        panel.appendChild(promptBlock);

        const actionBar = document.createElement("div");
        actionBar.className = "dait-test-actions";
        const run = this.createSmallButton(this.t("testModeRun"));
        const savePrompt = this.createSmallButton(this.t("testModeSavePrompt"));
        const clear = this.createSmallButton(this.t("testModeClear"));
        actionBar.appendChild(run);
        actionBar.appendChild(savePrompt);
        actionBar.appendChild(clear);
        panel.appendChild(actionBar);

        const outputBlock = this.createTestBlock(this.t("testModeOutput"), "", { compactHeader: true });
        const copyOutput = this.createSmallButton(this.t("testModeCopyOutput"));
        copyOutput.classList.add("dait-test-copy-output");
        outputBlock.querySelector(".dait-test-block-header")?.appendChild(copyOutput);
        const output = document.createElement("pre");
        output.className = "dait-test-output";
        output.textContent = this.t("testModeOutputPlaceholder");
        outputBlock.appendChild(output);
        panel.appendChild(outputBlock);

        const syncKind = () => {
            const kind = kindSelect.value;
            this.settings.ui.testModeKind = kind;
            this.saveSettings({ debounce: true });
            prompt.value = this.settings[kind]?.prompt || "";
            config.textContent = this.t("testModeConfig", {
                provider: PROVIDER_DEFAULTS[this.settings[kind]?.provider]?.label || this.settings[kind]?.provider || "",
                model: this.settings[kind]?.model || "",
                targetLanguage: this.getDisplayLanguage(this.settings[kind]?.targetLanguage)
            });
        };

        kindSelect.addEventListener("change", () => {
            syncKind();
            output.textContent = this.t("testModeOutputPlaceholder");
        });

        savePrompt.addEventListener("click", () => {
            const kind = kindSelect.value;
            this.preserveSettingsScroll(prompt, () => {
                this.setSetting(`${kind}.prompt`, prompt.value);
                this.showToast(this.t("testModePromptSaved", { name: this.getTaskDisplayName(kind) }), "success");
            });
        });

        copyInput.addEventListener("click", () => this.copyPromptText(input));
        copyPrompt.addEventListener("click", () => this.copyPromptText(prompt));
        copyOutput.addEventListener("click", () => this.copyTextFromNode(output));

        clear.addEventListener("click", () => {
            input.value = "";
            output.textContent = this.t("testModeOutputPlaceholder");
        });

        run.addEventListener("click", async () => {
            const kind = kindSelect.value;
            const sample = input.value.trim();
            if (!sample) {
                this.showToast(this.t("testModeInputRequired"), "error");
                return;
            }

            output.textContent = "";
            this.setButtonBusy(run, true, this.t("testModeRunning"));
            try {
                // Pass the test prompt as a per-request override; mutating live settings
                // would leak the test prompt into concurrent requests and debounced saves.
                output.textContent = await this.runModelTask(kind, sample, {
                    configOverrides: { prompt: prompt.value },
                    mode: "test"
                });
                this.showToast(this.t("testModeOutputReady"), "success");
            }
            catch (error) {
                output.textContent = this.formatError(error);
                this.showToast(this.formatError(error), "error");
            }
            finally {
                this.setButtonBusy(run, false, this.t("testModeRun"));
            }
        });

        syncKind();
        section.appendChild(panel);
        return section;
    }

    createTestBlock(labelText, descriptionText, options = {}) {
        const block = document.createElement("div");
        block.className = "dait-test-block";

        const header = document.createElement("div");
        header.className = "dait-test-block-header";
        if (options.compactHeader) header.classList.add("dait-test-block-header-compact");

        const label = document.createElement("span");
        label.textContent = labelText;
        header.appendChild(label);
        block.appendChild(header);

        if (descriptionText) {
            const description = document.createElement("p");
            description.className = "dait-row-description";
            description.textContent = descriptionText;
            block.appendChild(description);
        }

        return block;
    }

    createInputRow(path, labelText, type, placeholder, attrs = {}, rowOptions = {}) {
        const input = document.createElement("input");
        input.type = type;
        input.dataset.daitPath = path;
        input.placeholder = placeholder || "";
        input.value = this.getSetting(path) ?? "";
        Object.entries(attrs).forEach(([key, value]) => input.setAttribute(key, value));
        const commit = (options = {}) => {
            const saveOptions = options.immediate ? { save: "immediate", retryOnError: false } : undefined;
            if (type !== "number") {
                this.setSetting(path, input.value, saveOptions);
                return;
            }
            const raw = String(input.value ?? "").trim();
            if (!raw) {
                if (options.force) this.syncSettingControls(path, this.getSetting(path));
                return;
            }
            if (!options.force && input.validity && input.validity.valid === false) return;
            this.setSetting(path, Number(raw), saveOptions);
        };
        if (type === "number") {
            input.addEventListener("input", () => commit());
            input.addEventListener("blur", () => commit({ force: true, immediate: true }));
            input.addEventListener("pointerup", () => setTimeout(() => commit(), 0));
            input.addEventListener("keyup", () => setTimeout(() => commit(), 0));
        }
        input.addEventListener("change", () => commit({ force: true, immediate: true }));
        return this.createRow(labelText, input, rowOptions);
    }

    createTextareaRow(path, labelText, rowOptions = {}) {
        const textarea = document.createElement("textarea");
        textarea.dataset.daitPath = path;
        textarea.rows = 6;
        textarea.value = this.getSetting(path) ?? "";
        this.bindSettingsTextarea(textarea);
        textarea.addEventListener("change", () => this.preserveSettingsScroll(textarea, () => this.setSetting(path, textarea.value)));
        return this.createRow(labelText, textarea, { ...rowOptions, wide: true });
    }

    createSelectRow(path, labelText, options, rowOptions = {}) {
        const select = document.createElement("select");
        select.dataset.daitPath = path;
        const current = this.getSetting(path);

        options.forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = String(value) === String(current);
            select.appendChild(option);
        });

        select.addEventListener("change", () => {
            if (path.endsWith(".provider")) {
                this.setTaskProvider(path.split(".")[0], select.value);
                this.replaceSettingsPanelFrom(select);
                return;
            }
            this.setSetting(path, select.value);
            if (path === "ui.language") {
                const panel = select.closest(".dait-settings");
                if (panel) this.replaceSettingsPanelElement(panel);
            }
        });

        return this.createRow(labelText, select, rowOptions);
    }

    createLanguageRow(kind, field, labelText, descriptionText, options = {}) {
        const current = String(this.settings[kind]?.[field] || "");
        const preset = LANGUAGE_PRESETS.find(language => language.value === current);
        const isAuto = options.allowAuto && current === AUTO_LANGUAGE_VALUE;
        const isCustom = !preset && !isAuto;

        const controls = document.createElement("div");
        controls.className = "dait-language-controls";

        const select = document.createElement("select");
        select.className = "dait-language-select";

        if (options.allowAuto) {
            const autoOption = document.createElement("option");
            autoOption.value = AUTO_LANGUAGE_VALUE;
            autoOption.textContent = this.t("autoDetectLanguage");
            autoOption.selected = isAuto;
            select.appendChild(autoOption);
        }

        LANGUAGE_PRESETS.forEach(language => {
            const option = document.createElement("option");
            option.value = language.value;
            option.textContent = this.getLanguageLabel(language);
            option.selected = language.value === current;
            select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = CUSTOM_LANGUAGE_VALUE;
        customOption.textContent = this.t("customLanguage");
        customOption.selected = isCustom;
        select.appendChild(customOption);

        const customInput = document.createElement("input");
        customInput.type = "text";
        customInput.className = "dait-language-custom";
        customInput.placeholder = this.t("customLanguagePlaceholder");
        customInput.value = isCustom ? current : "";
        customInput.hidden = !isCustom;

        select.addEventListener("change", () => {
            if (select.value === AUTO_LANGUAGE_VALUE) {
                customInput.hidden = true;
                customInput.value = "";
                this.setSetting(`${kind}.${field}`, AUTO_LANGUAGE_VALUE);
                return;
            }

            if (select.value === CUSTOM_LANGUAGE_VALUE) {
                customInput.hidden = false;
                customInput.focus();
                if (customInput.value.trim()) this.setSetting(`${kind}.${field}`, customInput.value.trim());
                return;
            }

            customInput.hidden = true;
            customInput.value = "";
            this.setSetting(`${kind}.${field}`, select.value);
        });

        customInput.addEventListener("change", () => {
            const value = customInput.value.trim();
            if (value) this.setSetting(`${kind}.${field}`, value);
        });

        controls.appendChild(select);
        controls.appendChild(customInput);

        return this.createRow(
            labelText,
            controls,
            {
                description: `${descriptionText} ${this.t("customLanguageDesc")}`
            }
        );
    }

    createPromptManager(kind) {
        const manager = document.createElement("div");
        manager.className = "dait-prompt-manager";

        const header = document.createElement("div");
        header.className = "dait-prompt-manager-header";

        const title = document.createElement("span");
        title.textContent = this.t("promptTemplates");
        header.appendChild(title);

        const desc = document.createElement("p");
        desc.className = "dait-row-description";
        desc.textContent = this.t("promptTemplatesDesc");
        header.appendChild(desc);
        manager.appendChild(header);

        const tools = document.createElement("div");
        tools.className = "dait-prompt-tools";

        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = this.t("promptSearch");
        tools.appendChild(search);

        const select = document.createElement("select");
        select.className = "dait-prompt-select";
        tools.appendChild(select);

        const actions = document.createElement("div");
        actions.className = "dait-prompt-actions";

        const apply = this.createSmallButton(this.t("promptApply"));
        const save = this.createSmallButton(this.t("promptSave"));
        const update = this.createSmallButton(this.t("promptUpdate"));
        const copy = this.createSmallButton(this.t("promptCopy"));
        const remove = this.createSmallButton(this.t("promptDelete"), "danger");
        actions.appendChild(apply);
        actions.appendChild(save);
        actions.appendChild(update);
        actions.appendChild(copy);
        actions.appendChild(remove);
        tools.appendChild(actions);
        manager.appendChild(tools);

        const promptBlock = document.createElement("div");
        promptBlock.className = "dait-prompt-editor";

        const promptLabel = document.createElement("span");
        promptLabel.textContent = this.t("prompt");
        promptBlock.appendChild(promptLabel);

        const promptDesc = document.createElement("p");
        promptDesc.className = "dait-row-description";
        promptDesc.textContent = this.t("promptDesc");
        promptBlock.appendChild(promptDesc);

        const textarea = document.createElement("textarea");
        textarea.dataset.daitPath = `${kind}.prompt`;
        textarea.rows = 6;
        textarea.value = this.getSetting(`${kind}.prompt`) ?? "";
        this.bindSettingsTextarea(textarea);
        textarea.addEventListener("change", () => this.preserveSettingsScroll(textarea, () => this.setSetting(`${kind}.prompt`, textarea.value)));
        promptBlock.appendChild(textarea);
        manager.appendChild(promptBlock);

        const renderOptions = () => {
            const query = search.value.trim().toLowerCase();
            const templates = this.getPromptTemplates(kind)
                .filter(template => !query || this.getPromptTemplateSearchText(template).includes(query));

            select.textContent = "";
            if (!templates.length) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = this.t("promptNoTemplate");
                select.appendChild(option);
                return;
            }

            templates.forEach(template => {
                const option = document.createElement("option");
                option.value = template.id;
                option.textContent = this.getPromptTemplateLabel(template);
                option.selected = template.id === this.settings[kind].activePromptTemplate;
                select.appendChild(option);
            });
        };

        const getPromptValue = () => {
            const textarea = manager.querySelector(`[data-dait-path='${kind}.prompt']`);
            return textarea?.value ?? this.settings[kind].prompt;
        };

        const applySelected = () => {
            if (!select.value) return;
            this.applyPromptTemplate(kind, select.value);
            renderOptions();
        };

        search.addEventListener("input", renderOptions);
        select.addEventListener("change", applySelected);
        apply.addEventListener("click", applySelected);
        save.addEventListener("click", () => {
            const name = window.prompt(this.t("promptNamePlaceholder"), "");
            if (!name || !name.trim()) {
                this.showToast(this.t("promptNameRequired"), "error");
                return;
            }
            const prompt = getPromptValue();
            this.settings[kind].prompt = prompt;
            this.savePromptTemplate(kind, name.trim(), prompt);
            search.value = "";
            renderOptions();
        });
        update.addEventListener("click", () => {
            if (!select.value) return;
            const prompt = getPromptValue();
            this.settings[kind].prompt = prompt;
            this.updatePromptTemplate(kind, select.value, prompt);
            renderOptions();
        });
        copy.addEventListener("click", () => this.copyPromptText(textarea));
        remove.addEventListener("click", () => {
            if (!select.value || !window.confirm(this.t("promptDeleteConfirm"))) return;
            this.deletePromptTemplate(kind, select.value);
            renderOptions();
        });

        renderOptions();
        return manager;
    }

    createSmallButton(text, variant = "") {
        const button = document.createElement("button");
        button.className = `dait-small-button ${variant ? `dait-small-button-${variant}` : ""}`.trim();
        button.type = "button";
        button.textContent = text;
        return button;
    }

    createDeepSeekModelRow(kind) {
        const select = document.createElement("select");
        const current = this.settings[kind]?.model;

        const custom = document.createElement("option");
        custom.value = "";
        custom.textContent = this.t("customModel");
        custom.selected = !DEEPSEEK_MODELS.some(([value]) => value === current);
        select.appendChild(custom);

        DEEPSEEK_MODELS.forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = value === current;
            select.appendChild(option);
        });

        select.addEventListener("change", () => {
            if (!select.value) return;
            this.setSetting(`${kind}.model`, select.value);
            this.showToast(this.t("modelSet", { model: select.options[select.selectedIndex].textContent }), "success");
        });

        return this.createRow(this.t("deepseekPreset"), select, { description: this.t("deepseekPresetDesc") });
    }

    createLocalModelRow(kind) {
        const select = document.createElement("select");
        const current = this.settings[kind]?.model;

        const custom = document.createElement("option");
        custom.value = "";
        custom.textContent = this.t("customModel");
        custom.selected = !LOCAL_MODEL_PRESETS.some(([value]) => value === current);
        select.appendChild(custom);

        LOCAL_MODEL_PRESETS.forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = value === current;
            select.appendChild(option);
        });

        select.addEventListener("change", () => {
            if (!select.value) return;
            this.setSetting(`${kind}.model`, select.value);
            this.showToast(this.t("modelSet", { model: select.options[select.selectedIndex].textContent }), "success");
        });

        return this.createRow(this.t("localModelPreset"), select, { description: this.t("localModelPresetDesc") });
    }

    createRow(labelText, control, options = {}) {
        // A locked control always shows why it is locked in place of its usual description.
        if (options.disabledReason) control.disabled = true;
        const descriptionText = options.disabledReason || options.description;
        const row = document.createElement("label");
        row.className = "dait-settings-row";
        if (options.checkbox) row.classList.add("dait-settings-row-checkbox");
        if (options.wide) row.classList.add("dait-settings-row-wide");

        const label = document.createElement("span");
        label.textContent = labelText;

        row.appendChild(label);
        if (descriptionText) {
            const description = document.createElement("p");
            description.className = "dait-row-description";
            description.textContent = descriptionText;
            row.appendChild(description);
        }
        row.appendChild(control);
        return row;
    }

    getLanguageLabel(language) {
        return this.getLocale() === "en" ? language.en : `${language.zh} - ${language.en}`;
    }

    getDisplayLanguage(language) {
        if (!language || language === AUTO_LANGUAGE_VALUE) return this.t("autoDetectLanguage");
        const normalized = this.normalizeLanguageName(language);
        const preset = LANGUAGE_PRESETS.find(item => item.value === normalized);
        return preset ? this.getLanguageLabel(preset) : normalized;
    }

    normalizePromptTemplateSerial(serial) {
        const digits = String(serial || "").trim().match(/\d+/)?.[0];
        if (!digits) return "";
        return digits.padStart(3, "0").slice(-3);
    }

    getPromptTemplateLabel(template) {
        return `${template.serial || "000"} · ${template.name || ""}`;
    }

    getPromptTemplateSearchText(template) {
        return [
            template.serial,
            String(template.serial || "").replace(/^0+/, ""),
            template.name
        ].filter(Boolean).join(" ").toLowerCase();
    }

    normalizeLanguageName(language) {
        const value = String(language || "").trim();
        if (this.isTraditionalChineseLanguageAlias(value)) return "繁體中文";
        if (this.isSimplifiedChineseLanguageAlias(value) || this.isGenericChineseLanguageAlias(value)) return "汉语";
        const aliases = {
            "Chinese": "汉语",
            "Simplified Chinese": "汉语",
            "Traditional Chinese": "繁體中文",
            "Chinese Traditional": "繁體中文",
            "Mandarin Chinese": "汉语",
            "zh-TW": "繁體中文",
            "zh-Hant": "繁體中文",
            "zh-HK": "繁體中文",
            "zh-MO": "繁體中文",
            "中文": "汉语",
            "汉语": "汉语",
            "漢語": "繁體中文",
            "繁体中文": "繁體中文",
            "繁體中文": "繁體中文",
            "English": "英语",
            "英文": "英语",
            "英语": "英语",
            "Spanish": "西班牙语",
            "Russian": "俄语",
            "German": "德语",
            "French": "法语",
            "Japanese": "日语",
            "Arabic": "阿拉伯语",
            "Vietnamese": "越南语",
            "Hindi": "印地语",
            "Korean": "朝鲜语",
            "韩语": "朝鲜语",
            "朝鲜语": "朝鲜语",
            "Italian": "意大利语"
        };
        return aliases[value] || value;
    }

    isGenericChineseLanguageAlias(value) {
        return new Set([
            "Chinese",
            "Mandarin Chinese",
            "zh",
            "中文"
        ]).has(String(value || "").trim());
    }

    isSimplifiedChineseLanguageAlias(value) {
        return new Set([
            "Simplified Chinese",
            "zh-CN",
            "zh-Hans",
            "汉语",
            "简体中文",
            "簡體中文"
        ]).has(String(value || "").trim());
    }

    isTraditionalChineseLanguageAlias(value) {
        return new Set([
            "Traditional Chinese",
            "Chinese Traditional",
            "zh-TW",
            "zh-Hant",
            "zh-HK",
            "zh-MO",
            "漢語",
            "繁体中文",
            "繁體中文"
        ]).has(String(value || "").trim());
    }

    isChineseLanguageAlias(value) {
        return this.isGenericChineseLanguageAlias(value)
            || this.isSimplifiedChineseLanguageAlias(value)
            || this.isTraditionalChineseLanguageAlias(value);
    }

    normalizeSourceLanguage(language) {
        if (!language || language === AUTO_LANGUAGE_VALUE || language === "auto") return AUTO_LANGUAGE_VALUE;
        return this.normalizeLanguageName(language);
    }

    scheduleSettingsPersist(delayMs = SETTINGS_WRITE_DEBOUNCE_MS) {
        const delay = Math.max(0, Number(delayMs) || 0);
        const persistAt = Date.now() + delay;
        this.settingsDirty = true;
        if (this.settingsLoadBlocked) return false;
        if (this.settingsDirtyTimer && this.settingsDirtyAt && this.settingsDirtyAt <= persistAt) return true;
        if (this.settingsDirtyTimer) clearTimeout(this.settingsDirtyTimer);
        this.settingsDirtyAt = persistAt;
        this.settingsDirtyTimer = setTimeout(() => this.flushSettings({ scheduled: true }), delay);
        this.unrefTimer(this.settingsDirtyTimer);
        return true;
    }

    getProviderCapabilities(provider) {
        return this.settingsSchema.getProviderCapabilities(provider);
    }

    isProviderAllowedForTask(kind, provider) {
        return this.settingsSchema.isProviderAllowedForTask(kind, provider);
    }

    normalizeProviderForTask(kind, provider) {
        const normalized = String(provider || "").trim();
        if (this.isProviderAllowedForTask(kind, normalized)) return normalized;
        const fallback = DEFAULT_SETTINGS[kind]?.provider || "deepseek";
        return this.isProviderAllowedForTask(kind, fallback) ? fallback : "deepseek";
    }

    getProviderOptionsForTask(kind) {
        return this.settingsSchema.getProviderOptionsForTask(kind, provider => this.getProviderDisplayName(provider));
    }

    getProviderDisplayName(provider) {
        const normalized = String(provider || "").trim();
        if (normalized === "deepseek") return "DeepSeek";
        if (normalized === "openaiCompatible") return this.t("providerOpenAI");
        if (normalized === "sakuraLocal") return this.t("providerSakuraLocal");
        if (normalized === "googleCloud") return this.t("providerGoogleCloud");
        if (normalized === "microsoft") return this.t("providerMicrosoft");
        if (normalized === "deepl") return this.t("providerDeepL");
        if (normalized === "baidu") return this.t("providerBaidu");
        return this.getProviderDefaults(normalized)?.label || normalized || "";
    }

    saveTaskProviderProfile(kind, provider) {
        const task = this.settings[kind];
        if (!task || !provider) return;
        if (!task.providerProfiles || typeof task.providerProfiles !== "object" || Array.isArray(task.providerProfiles)) {
            task.providerProfiles = {};
        }
        const profile = { ...(task.providerProfiles[provider] || {}) };
        PROVIDER_PROFILE_FIELDS.forEach(field => {
            if (task[field] !== undefined) profile[field] = task[field];
        });
        task.providerProfiles[provider] = profile;
    }

    applyProviderPreset(kind, provider, options = {}) {
        const preset = PROVIDER_DEFAULTS[provider];
        if (!preset || !this.settings[kind]) return;
        const profile = options.restoreProfile ? this.getTaskProviderProfile(kind, provider) : null;
        this.settings[kind].endpoint = profile?.endpoint ?? preset.endpoint;
        this.settings[kind].model = profile?.model ?? preset.model;
        this.settings[kind].region = profile?.region ?? preset.region ?? "";
        this.settings[kind].deeplPlan = profile?.deeplPlan ?? preset.deeplPlan ?? "free";
        this.settings[kind].appId = profile?.appId ?? preset.appId ?? "";
        this.settings[kind].secretKey = profile?.secretKey ?? preset.secretKey ?? "";
        if (options.restoreProfile) {
            this.settings[kind].apiKey = profile?.apiKey ?? "";
            this.settings[kind].enableThinking = typeof profile?.enableThinking === "boolean" ? profile.enableThinking : false;
        }
        if (options.save !== false) this.saveSettings();
        if (options.syncControls !== false) {
            this.syncSettingControls(`${kind}.endpoint`, this.settings[kind].endpoint);
            this.syncSettingControls(`${kind}.model`, this.settings[kind].model);
            this.syncSettingControls(`${kind}.region`, this.settings[kind].region);
            this.syncSettingControls(`${kind}.deeplPlan`, this.settings[kind].deeplPlan);
            this.syncSettingControls(`${kind}.appId`, this.settings[kind].appId);
            this.syncSettingControls(`${kind}.secretKey`, this.settings[kind].secretKey);
            if (options.restoreProfile) {
                this.syncSettingControls(`${kind}.apiKey`, this.settings[kind].apiKey);
                this.syncSettingControls(`${kind}.enableThinking`, this.settings[kind].enableThinking);
            }
        }
        if (kind === "translation" && options.invalidate !== false) this.invalidateAutoTranslationQueue();
    }

    isChatCompletionProvider(configOrProvider) {
        return !this.isDirectTranslateProvider(configOrProvider);
    }

    getDiagnosticModelLabel(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        const normalized = text.replace(/\\/g, "/");
        const basename = normalized.split("/").filter(Boolean).pop() || text;
        return basename.length > 120 ? `${basename.slice(0, 120)}...` : basename;
    }

    isProviderApiKeyOptional(provider) {
        return this.getProviderDefaults(provider)?.apiKeyOptional === true;
    }

    removeAllAutoTranslationNodes() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        document.querySelectorAll(".dait-translation-line").forEach(line => {
            if (line.dataset?.daitMode === "manual") return;
            this.restoreTranslationSourceVisibility(this.getTranslationContentForLine(line));
            line.remove();
        });
    }

    syncSettingControls(path, value, options = {}) {
        if (typeof document === "undefined") return;
        if (path === "ui.providerFallbackOrder") value = this.formatProviderFallbackOrder(value);
        if (path === "ui.currentChannelAutoTranslatePolicy") value = this.normalizeChannelAutoTranslatePolicyMode(value);
        document.querySelectorAll(`[data-dait-path='${path}']`).forEach(control => {
            if (control === document.activeElement && options.includeActive !== true) return;
            if (control.type === "checkbox") {
                control.checked = Boolean(value);
                return;
            }

            control.value = value ?? "";
        });
    }

    commitSettingsControls(root = null) {
        const scope = root?.querySelectorAll ? root : (typeof document !== "undefined" ? document : null);
        if (!scope?.querySelectorAll) return;
        scope.querySelectorAll("[data-dait-path]").forEach(control => {
            const path = String(control?.dataset?.daitPath || "");
            if (!path) return;
            if (control.tagName === "TEXTAREA") {
                this.setSetting(path, control.value);
                return;
            }
            if (control.tagName === "SELECT") {
                this.setSetting(path, control.value);
                return;
            }
            if (control.type === "checkbox") {
                this.setSetting(path, Boolean(control.checked));
                return;
            }
            if (control.type === "number") {
                const raw = String(control.value ?? "").trim();
                if (!raw) return;
                this.setSetting(path, Number(raw));
                return;
            }
            if (control.type) this.setSetting(path, control.value);
        });
    }

    bindSettingsTextarea(textarea) {
        textarea.spellcheck = false;
        ["contextmenu", "copy", "cut", "mouseup"].forEach(type => {
            textarea.addEventListener(type, () => this.restoreSettingsScrollSoon(textarea));
        });
    }

    preserveSettingsScroll(anchor, action) {
        const snapshot = this.getSettingsScrollSnapshot(anchor);
        const result = action();
        this.restoreSettingsScroll(snapshot);
        return result;
    }

    restoreSettingsScrollSoon(anchor) {
        const snapshot = this.getSettingsScrollSnapshot(anchor);
        this.restoreSettingsScroll(snapshot);
    }

    async copyPromptText(textarea) {
        const text = String(textarea?.value || "");
        const snapshot = this.getSettingsScrollSnapshot(textarea);
        try {
            await this.copyTextToClipboard(text);
            this.restoreSettingsScroll(snapshot);
            this.showToast(this.t("promptCopied"), "success");
        }
        catch (error) {
            this.restoreSettingsScroll(snapshot);
            this.showToast(this.t("promptCopyFailed", { error: this.formatError(error) }), "error");
        }
    }

    async copyTextFromNode(node) {
        const text = String(node?.textContent || "");
        const snapshot = this.getSettingsScrollSnapshot(node);
        try {
            await this.copyTextToClipboard(text);
            this.restoreSettingsScroll(snapshot);
            this.showToast(this.t("promptCopied"), "success");
        }
        catch (error) {
            this.restoreSettingsScroll(snapshot);
            this.showToast(this.t("promptCopyFailed", { error: this.formatError(error) }), "error");
        }
    }

    inferDiagnosticStageFromAction(action = "", status = "", meta = {}) {
        const value = String(action || "");
        if (meta.flowStage) return String(meta.flowStage);
        if (value.includes("whole-pass")) return DIAGNOSTIC_FAILURE_LAYERS.REQUEST;
        if (value.includes(".intake") || value.includes(".source")) return DIAGNOSTIC_FAILURE_LAYERS.SOURCE;
        if (value.includes(".plan")) return DIAGNOSTIC_FAILURE_LAYERS.PLAN;
        if (value.includes(".queue")) return DIAGNOSTIC_FAILURE_LAYERS.QUEUE;
        if (value.includes(".request") || value === "model.request") return DIAGNOSTIC_FAILURE_LAYERS.REQUEST;
        if (value.includes(".output")) return DIAGNOSTIC_FAILURE_LAYERS.OUTPUT;
        if (value.includes(".validation") || value.includes(".rescue")) return DIAGNOSTIC_FAILURE_LAYERS.VALIDATION;
        if (value.includes(".render") || String(status || "") === "render-deferred") return DIAGNOSTIC_FAILURE_LAYERS.RENDER;
        if (value.includes(".long-text")) return meta.subchunkIndex !== undefined || meta.chunkIndex !== undefined
            ? DIAGNOSTIC_FAILURE_LAYERS.VALIDATION
            : DIAGNOSTIC_FAILURE_LAYERS.PLAN;
        return "";
    }

    logQuickSettingsDiagnostic(action, status = "info", meta = {}) {
        const entry = this.createDiagnosticEntry(`quick.settings.${action}`, status, meta);
        this.quickSettingsDiagnosticLogs.push(entry);
        while (this.quickSettingsDiagnosticLogs.length > QUICK_SETTINGS_DIAGNOSTICS_MAX_ENTRIES) this.quickSettingsDiagnosticLogs.shift();
        if (this.settings.ui?.diagnosticsEnabled) this.logDiagnostic(`quick.settings.${action}`, status, meta);
        const payload = {
            status: entry.status,
            meta: entry.meta
        };
        try {
            const shouldWarn = status === "error" || status === "failed";
            if (shouldWarn || this.settings.ui?.diagnosticsEnabled) {
                const logger = shouldWarn ? console.warn : console.info;
                logger?.call?.(console, `[${PLUGIN_NAME}] quick.settings.${action}`, payload);
            }
        }
        catch {}
        return entry;
    }

    createDiagnosticEntry(action, status = "info", meta = {}) {
        const ts = Date.now();
        const sanitizedMeta = this.sanitizeDiagnosticMeta(this.enrichDiagnosticMeta(action, status, meta));
        const groupKey = this.getDiagnosticGroupKey(action, status, sanitizedMeta);
        return {
            ts,
            iso: new Date(ts).toISOString(),
            firstTs: ts,
            firstIso: new Date(ts).toISOString(),
            lastTs: ts,
            lastIso: new Date(ts).toISOString(),
            action: String(action || "unknown"),
            status: String(status || "info"),
            key: sanitizedMeta.key || sanitizedMeta.sourceHash || sanitizedMeta.cacheHash || "",
            count: 1,
            ms: Number.isFinite(Number(sanitizedMeta.ms)) ? Number(sanitizedMeta.ms) : undefined,
            meta: sanitizedMeta,
            groupKey
        };
    }

    getDiagnosticGroupKey(action, status, meta = {}) {
        if (action === "cache.lookup" && ["hit", "miss", "expired"].includes(status)) {
            return [
                action,
                status,
                meta.aliases || "",
                meta.size || ""
            ].join("|");
        }
        const routineAutoState = action === "auto.message.state"
            && !["error", "failed", "terminal-failed"].includes(String(status || ""))
            && !meta.failureClass
            && !meta.failureLayer;
        return [
            action,
            status,
            meta.reasonCode || meta.reason || meta.blockReason || "",
            meta.messageState || "",
            meta.failureClass || "",
            meta.failureLayer || "",
            meta.type || "",
            meta.provider || "",
            meta.model || "",
            meta.mode || "",
            routineAutoState ? "" : (meta.key || meta.sourceHash || meta.cacheHash || "")
        ].join("|");
    }

    sanitizeDiagnosticObject(value) {
        const result = {};
        Object.entries(value || {}).slice(0, 24).forEach(([key, item]) => {
            if (this.isSensitiveDiagnosticKey(key)) return;
            result[key] = String(key || "").toLowerCase().includes("model")
                ? this.getDiagnosticModelLabel(item)
                : this.sanitizeDiagnosticValue(item);
        });
        return result;
    }

    isSensitiveDiagnosticKey(key) {
        const value = String(key || "").trim();
        const normalized = value.toLowerCase();
        const safeKeys = new Set([
            "textcachehits",
            "autotranslatemessages",
            "cachehits",
            "cachemisses",
            "cachememory",
            "valuelength",
            "inputlength",
            "messagestate",
            "reasoncode",
            "queuetype",
            "targetkind",
            "identitykind",
            "identitytargetkind",
            "identityhash",
            "texthash",
            "textlength",
            "sourcehash",
            "cachehash",
            "prefetch",
            "prefetchinflight",
            "pendingtargets",
            "inflight",
            "inflightitems",
            "queuelength",
            "promptlength",
            "maxtokens",
            "bodyhash",
            "finishreason",
            "partialoutputlength",
            "invalidreason",
            "outputlength",
            "sourcelength",
            "domlength",
            "domtextlength",
            "fullcontentlength",
            "selectedlength",
            "sourcekind",
            "sourcetextkind",
            "sourceconfidence",
            "failureclass",
            "failurelayer",
            "flowstage",
            "validationquality",
            "validationreason",
            "renderable",
            "cacheable",
            "chunkindex",
            "chunktotal",
            "chunklength",
            "attemptname",
            "attemptindex",
            "requestcount",
            "longtextchunk",
            "longtextsourcelength",
            "timeoutms",
            "retryafterms",
            "requestid",
            "status"
        ]);
        if (safeKeys.has(normalized)) return false;
        if (["text", "sourcetext", "targettext", "rawtext", "inputtext", "outputtext", "translation", "translated", "translatedtext", "rawtranslation", "appid"].includes(normalized)) return true;
        return /api.?key|authorization|token|password|secret|body|prompt|message|endpoint|url|uri|guild.*id|channel.*id|author.*id|user.*id/i.test(value);
    }

    sanitizeDiagnosticValue(value) {
        if (value === null || typeof value === "boolean") return value;
        if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
        const text = String(value)
            .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
            .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-api-key]")
            .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, "[redacted-google-key]")
            .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]");
        return text.length > 180 ? `${text.slice(0, 180)}...` : text;
    }

    getTopDiagnosticCounts(map = {}, limit = 8) {
        return Object.entries(map || {})
            .map(([key, count]) => ({ key, count: Number(count || 0) || 0 }))
            .filter(item => item.key && item.count > 0)
            .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
            .slice(0, Math.max(1, Number(limit) || 8));
    }

    inferDiagnosticFlowFromAction(action) {
        const value = String(action || "");
        if (value.startsWith("auto.")) return "auto";
        if (value.startsWith("manual.")) return "manual";
        if (value.startsWith("cache.")) return "cache";
        if (value.startsWith("model.")) return "model";
        if (value.startsWith("polish")) return "polish";
        if (value.startsWith("public.bilingual")) return "public-bilingual";
        if (value.startsWith("quick.settings")) return "quick-settings";
        return value.split(".")[0] || "unknown";
    }

    createDiagnosticHumanSummary(summary = {}) {
        const lines = [];
        const topFailureClass = summary.top?.failureClasses?.[0];
        const topFailureLayer = summary.top?.failureLayers?.[0];
        const topReason = summary.top?.reasonCodes?.[0];
        const topValidation = summary.top?.validationQualities?.[0];
        if (topFailureClass) {
            lines.push(`top failure: ${topFailureClass.key} (${topFailureClass.count})${topFailureLayer ? ` at ${topFailureLayer.key}` : ""}`);
        }
        if (topReason) lines.push(`top reason: ${topReason.key} (${topReason.count})`);
        if (topValidation) lines.push(`validation: ${topValidation.key} (${topValidation.count})`);
        const decisions = Array.isArray(summary.lastAutoTranslationDecisions) ? summary.lastAutoTranslationDecisions : [];
        const repeated = decisions.filter(entry => Number(entry.requestCount || 0) > 1).length;
        const failed = decisions.filter(entry => /failed|blocked|terminal/.test(String(entry.state || ""))).length;
        const partial = decisions.filter(entry => String(entry.validationQuality || "") === TRANSLATION_VALIDATION_QUALITIES.PARTIAL).length;
        if (decisions.length) lines.push(`last decisions: ${decisions.length}, failed/blocked=${failed}, repeated=${repeated}, partial=${partial}`);
        const sourceIncomplete = summary.byFailureClass?.[DIAGNOSTIC_FAILURE_CLASSES.SOURCE_INCOMPLETE] || 0;
        const chunkFailed = summary.byFailureClass?.[DIAGNOSTIC_FAILURE_CLASSES.CHUNK_FAILED] || 0;
        const wholeFailed = summary.byFailureClass?.[DIAGNOSTIC_FAILURE_CLASSES.WHOLE_PASS_FAILED] || 0;
        if (sourceIncomplete) lines.push("source check: MessageStore/BDFDB did not provide a compatible full message for at least one item.");
        if (wholeFailed || chunkFailed) lines.push("long text check: inspect manual.long-text.whole-pass and auto.long-text.chunk entries for failed chunk indexes and invalidReason.");
        if (!lines.length) lines.push("no important failure pattern captured yet; reproduce with diagnostics enabled.");
        return lines.slice(0, 8);
    }

    getDiagnosticInterpretationChecklist() {
        return [
            {
                step: "last-decision",
                read: "lastAutoTranslationDecisions",
                meaning: "Find the message by messageIdentityHash/textHash and inspect state, reasonCode, queueType, requestCount, validationQuality, and lastErrorType."
            },
            {
                step: "not-requested",
                read: "state=skipped|blocked|queued with requestCount=0",
                meaning: "The message did not reach the model. Check reasonCode for language precheck, current line, provider cooldown, viewport settling, or queue limits."
            },
            {
                step: "requested-no-render",
                read: "requestCount>0 with state=failed|render-deferred|blocked",
                meaning: "The model was called. Check validationQuality, lastErrorType, render reasonCode, and recentImportant."
            },
            {
                step: "loop-check",
                read: "requestCount>1 for the same messageIdentityHash/textHash",
                meaning: "Repeated requests are happening for the same logical message and should be treated as a queue/dedupe regression."
            },
            {
                step: "coverage-check",
                read: "reasonCode=not-eligible-language",
                meaning: "The precheck skipped the text. If the text is mixed language, price, address, refund, name, or product text, add it as a coverage regression."
            },
            {
                step: "long-text-check",
                read: "validationQuality=partial or action=auto.long-text",
                meaning: "Long text produced a partial result. Failed chunks should not be stored as permanent complete cache."
            }
        ];
    }

    getSanitizedDiagnosticRouteIds(route = {}) {
        return {
            guildId: this.getDiagnosticIdentifierHash(route.guildId),
            channelId: this.getDiagnosticIdentifierHash(route.channelId),
            messageId: this.getDiagnosticIdentifierHash(route.messageId)
        };
    }

    getDiagnosticIdentifierHash(value) {
        const text = String(value || "").trim();
        return text ? this.getTextFingerprint(text) : "";
    }

    normalizePersistedDiagnosticEntry(entry) {
        if (!entry || typeof entry !== "object") return null;
        const ts = Number(entry.ts || Date.parse(entry.iso || "") || Date.now());
        const meta = this.sanitizeDiagnosticMeta(entry.meta || {});
        const action = String(entry.action || "unknown");
        const status = String(entry.status || "info");
        return {
            ts,
            iso: entry.iso || new Date(ts).toISOString(),
            firstTs: Number(entry.firstTs || ts),
            firstIso: entry.firstIso || entry.iso || new Date(ts).toISOString(),
            lastTs: Number(entry.lastTs || ts),
            lastIso: entry.lastIso || entry.iso || new Date(ts).toISOString(),
            action,
            status,
            key: this.sanitizeDiagnosticValue(entry.key || meta.key || meta.sourceHash || meta.cacheHash || ""),
            count: Math.max(1, Number(entry.count || 1) || 1),
            ms: Number.isFinite(Number(entry.ms)) ? Number(entry.ms) : undefined,
            meta,
            groupKey: entry.groupKey || this.getDiagnosticGroupKey(action, status, meta)
        };
    }

    getHeavyPersistenceIdleField(kind = "diagnostics") {
        return kind === "cache" ? "translationCacheIdleCallback" : "diagnosticLogsIdleCallback";
    }

    cancelHeavyPersistenceIdle(kind = "diagnostics") {
        const field = this.getHeavyPersistenceIdleField(kind);
        const callbackId = this[field];
        if (callbackId !== null && typeof window !== "undefined") {
            try { window.cancelIdleCallback?.(callbackId); }
            catch {}
        }
        this[field] = null;
    }

    scheduleHeavyPersistenceIdle(kind, callback) {
        const field = this.getHeavyPersistenceIdleField(kind);
        if (this[field] !== null) return;
        if (typeof window === "undefined" || typeof window.requestIdleCallback !== "function") {
            callback();
            return;
        }
        this[field] = window.requestIdleCallback(deadline => {
            this[field] = null;
            if (!this.isStarted && !this.lifecycleStarted) return;
            const minRemainingMs = kind === "cache" ? 24 : 16;
            const inputPending = Boolean(globalThis.navigator?.scheduling?.isInputPending?.());
            const remainingMs = typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
            if (inputPending || (!deadline?.didTimeout && remainingMs < minRemainingMs)) {
                if (kind === "cache") this.scheduleTranslationCachePersist(HEAVY_PERSISTENCE_DEFER_MS);
                else this.scheduleDiagnosticLogsPersist(HEAVY_PERSISTENCE_DEFER_MS, { force: true });
                return;
            }
            callback();
        }, { timeout: 10000 });
    }

    shouldDeferHeavyPersistence(kind = "generic", now = Date.now()) {
        const busy = this.isStarted
            && (this.isQuickSettingsPanelOpen()
                || this.isDiscordMediaViewerQuiet(now)
                || this.isAutoTranslationRenderPaused(now)
                || this.isAutoTranslationViewportSettling(now)
                || this.isAutoTranslationJumpCoolingDown(now)
                || this.getInputComposerBusyRemainingMs(now) > 0
                || Boolean(globalThis.navigator?.scheduling?.isInputPending?.()));
        const key = kind === "cache" ? "translationCachePersistenceDeferredSince" : "diagnosticLogsPersistenceDeferredSince";
        if (!busy) {
            this[key] = 0;
            return false;
        }
        const deferredSince = Number(this[key] || 0);
        if (!deferredSince) {
            this[key] = now;
            return true;
        }
        if (now - deferredSince >= HEAVY_PERSISTENCE_MAX_DEFER_MS) {
            this[key] = 0;
            return false;
        }
        return true;
    }

    disableDiagnosticLogging() {
        if (this.diagnosticLogsDirtyTimer) clearTimeout(this.diagnosticLogsDirtyTimer);
        this.diagnosticLogsDirtyTimer = null;
        this.diagnosticLogsDirtyAt = 0;
        this.diagnosticLogs = [];
        this.quickSettingsDiagnosticLogs = [];
        this.lastAutoTranslationDecisions = new Map();
        this.diagnosticCompressedCount = 0;
        this.diagnosticLogsDirty = true;
        if (this.saveData(DIAGNOSTIC_DATA_KEY, this.createPersistedDiagnosticLogsPayload()) === true) {
            this.diagnosticLogsDirty = false;
            this.diagnosticLogsPersistenceDeferredSince = 0;
            return true;
        }
        this.scheduleDiagnosticLogsPersist(30000, { force: true });
        return false;
    }

    async copyDiagnosticLogs() {
        if (!this.diagnosticLogs.length && !this.quickSettingsDiagnosticLogs.length) {
            this.showToast(this.t("diagnosticLogsEmpty"), "info");
            return false;
        }
        try {
            await this.copyTextToClipboard(this.serializeDiagnosticLogs("json"));
            this.showToast(this.t("diagnosticLogsCopied"), "success");
            return true;
        }
        catch (error) {
            this.showToast(this.t("promptCopyFailed", { error: this.formatError(error) }), "error");
            return false;
        }
    }

    async exportDiagnosticLogs(format = "json") {
        if (!this.diagnosticLogs.length && !this.quickSettingsDiagnosticLogs.length) {
            this.showToast(this.t("diagnosticLogsEmpty"), "info");
            return false;
        }
        const normalized = format === "txt" ? "txt" : "json";
        const text = this.serializeDiagnosticLogs(normalized);
        const filename = `${PLUGIN_NAME}-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.${normalized}`;
        const mime = normalized === "json" ? "application/json" : "text/plain";
        return this.saveTextOrCopy(filename, text, mime, { saved: "diagnosticLogsExported", copied: "diagnosticLogsCopied" });
    }

    async exportSettingsSnapshot() {
        const text = JSON.stringify(this.createSettingsSnapshot(), null, 2);
        const filename = `${PLUGIN_NAME}-settings-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        return this.saveTextOrCopy(filename, text, "application/json", { saved: "settingsSnapshotExported", copied: "settingsSnapshotCopied" });
    }

    // Downloads the text, falling back to the clipboard where downloads are unavailable.
    async saveTextOrCopy(filename, text, mime, messageKeys) {
        try {
            if (this.downloadTextFile(filename, text, mime)) {
                this.showToast(this.t(messageKeys.saved), "success");
                return true;
            }
            await this.copyTextToClipboard(text);
            this.showToast(this.t(messageKeys.copied), "success");
            return true;
        }
        catch (error) {
            this.showToast(this.t("promptCopyFailed", { error: this.formatError(error) }), "error");
            return false;
        }
    }

    // Troubleshooting copy of the settings: switches and numbers as-is, secrets and private text reduced to markers.
    createSettingsSnapshot() {
        const secretKeys = new Set(["apikey", "secretkey", "appid", "keypooltext", "keys", "token", "password", "authorization"]);
        const sanitize = (value, key = "", defaults = undefined) => {
            const name = String(key).toLowerCase();
            if (secretKeys.has(name)) {
                if (Array.isArray(value)) return value.length ? `[hidden: ${value.length}]` : [];
                return String(value ?? "").trim() ? "[hidden]" : "";
            }
            if (name === "endpoint") return this.getSettingsSnapshotEndpoint(value);
            if (name === "prompt") return value === defaults ? "default" : `custom (${String(value ?? "").length} chars)`;
            if (name === "prompttemplates") return `${Array.isArray(value) ? value.length : 0} templates`;
            if (name === "channelautotranslatepolicies") {
                return Object.fromEntries(Object.entries(value || {}).map(([id, policy]) => [`channel-${this.getTextFingerprint(id)}`, sanitize(policy)]));
            }
            if (Array.isArray(value)) return value.map(item => sanitize(item));
            if (value && typeof value === "object") {
                return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey, defaults?.[childKey])]));
            }
            return typeof value === "string" ? this.sanitizeDiagnosticValue(value) : value;
        };
        return {
            plugin: PLUGIN_NAME,
            version: PLUGIN_VERSION,
            exportedAt: new Date().toISOString(),
            effective: {
                autoTranslateActive: this.isAutoTranslateEnabled(),
                localProvider: this.isLocalTranslationProvider(this.settings.translation),
                concurrency: this.getAutoTranslateConcurrency(),
                prefetchRange: this.getAutoTranslatePrefetchRange(),
                intakeMode: this.normalizeAutoTranslateIntakeMode(this.settings.ui?.autoTranslateIntakeMode)
            },
            settings: sanitize(this.settings, "", DEFAULT_SETTINGS)
        };
    }

    // Local endpoints stay whole; remote ones drop query strings, which can carry keys.
    // Embedded credentials are always removed.
    getSettingsSnapshotEndpoint(value) {
        const text = String(value ?? "").trim();
        if (!text) return "";
        let url = null;
        try { url = new URL(text); }
        catch { return `[invalid] ${this.sanitizeDiagnosticValue(text)}`; }
        const hadCredentials = Boolean(url.username || url.password);
        url.username = "";
        url.password = "";
        const shown = this.isLoopbackEndpoint(url.href) ? url.href : `${url.origin}${url.pathname}`;
        return hadCredentials ? `${shown} [credentials removed]` : shown;
    }

    downloadTextFile(filename, text, mime = "text/plain") {
        if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL || typeof document === "undefined") return false;
        const link = document.createElement("a");
        if (!link) return false;
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        try {
            link.href = url;
            link.download = filename;
            link.style.display = "none";
            document.body?.appendChild?.(link);
            link.click?.();
            return true;
        }
        catch {
            return false;
        }
        finally {
            link.remove?.();
            setTimeout(() => URL.revokeObjectURL?.(url), 0);
        }
    }

    async copyTextToClipboard(text) {
        const value = String(text || "");
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
        if (clipboard?.writeText) {
            try {
                await clipboard.writeText(value);
                return;
            }
            catch {}
        }
        this.copyTextToClipboardFallback(value);
    }

    copyTextToClipboardFallback(text) {
        if (typeof document === "undefined" || !document.body?.appendChild) {
            throw new Error("clipboard unavailable");
        }
        const previousFocus = document.activeElement || null;
        const fallback = document.createElement("textarea");
        fallback.value = text;
        fallback.setAttribute("readonly", "readonly");
        fallback.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;";
        let ok = false;
        try {
            document.body.appendChild(fallback);
            fallback.select?.();
            ok = Boolean(document.execCommand?.("copy"));
        }
        finally {
            fallback.remove?.();
            if (previousFocus?.focus && this.isNodeConnected(previousFocus)) {
                try { previousFocus.focus({ preventScroll: true }); }
                catch {
                    try { previousFocus.focus(); }
                    catch {}
                }
            }
        }
        if (!ok) throw new Error("document.execCommand copy failed");
    }

    getSettingsScrollSnapshot(anchor) {
        const scroller = this.getSettingsScrollContainer(anchor);
        return {
            scroller,
            top: scroller?.scrollTop ?? 0,
            left: scroller?.scrollLeft ?? 0
        };
    }

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
    }

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

    getApiStatusText(state) {
        const key = {
            testing: "apiStatusTesting",
            success: "apiStatusSuccess",
            failed: "apiStatusFailed",
            untested: "apiStatusUntested"
        }[state] || "apiStatusUntested";
        return this.t(key);
    }

    getTaskDisplayName(kind) {
        return kind === "polish" ? this.t("polishTitle") : this.t("translationTitle");
    }

    getTestModeKind() {
        return ["polish", "translation"].includes(this.settings.ui?.testModeKind)
            ? this.settings.ui.testModeKind
            : DEFAULT_SETTINGS.ui.testModeKind;
    }

    refreshLocalizedUi() {
        if (typeof document === "undefined") return;
        this.removePolishResultPanel();
        this.removePolishRestoreControl();
        this.removeInputActionMenu();
        this.closeQuickSettingsPanel();
        this.restoreAllTranslationSourceVisibility();
        document.querySelectorAll(".dait-message-button, .dait-polish-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-quick-settings-button").forEach(node => node.remove());
        document.querySelectorAll(".dait-translation-line, .dait-translation-box").forEach(node => node.remove());
        this.unpatchContextMenus();
        this.patchMessageContextMenu();
        this.queueScan();
    }

    getLocale() {
        return I18N[this.settings.ui?.language] ? this.settings.ui.language : "zh-CN";
    }

    t(key, vars = {}) {
        const locale = this.getLocale();
        const template = I18N[locale]?.[key] ?? I18N.en[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match);
    }

    isDiscordSettingsSurfaceOpen(options = {}) {
        if (typeof document === "undefined" || !document.querySelectorAll) return false;
        const now = Date.now();
        if (!options.force && now - Number(this.settingsSurfaceProbeAt || 0) < 250) {
            return Boolean(this.settingsSurfaceProbeOpen);
        }
        const surfaces = [...(document.querySelectorAll?.(DISCORD_SETTINGS_SURFACE_SELECTOR) || [])];
        const open = surfaces.some(surface => this.isDiscordSettingsSurfaceElement(surface));
        this.settingsSurfaceProbeAt = now;
        this.settingsSurfaceProbeOpen = open;
        return open;
    }

    isInsideDiscordSettingsSurface(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        if (this.isDiscordSettingsSurfaceElement(element)) return true;
        const surface = element.closest?.(DISCORD_SETTINGS_SURFACE_SELECTOR);
        return Boolean(surface && this.isDiscordSettingsSurfaceElement(surface));
    }

    isDiscordSettingsSurfaceElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        const matchesSurface = Boolean(element.matches?.(DISCORD_SETTINGS_SURFACE_SELECTOR) || element.closest?.(DISCORD_SETTINGS_SURFACE_SELECTOR));
        if (!matchesSurface) return false;
        if (element.closest?.(".dait-quick-settings-modal-root, .dait-settings")) return false;
        const rect = element.getBoundingClientRect?.();
        if (!rect) return true;
        return Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0;
    }

    isOwnPluginElement(element) {
        return Boolean(element?.closest?.(".dait-settings, .dait-quick-settings-button, .dait-quick-settings-modal-root, .dait-message-button, .dait-polish-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-line, .dait-translation-box"));
    }

    startObserver() {
        if (!this.isStarted) return;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.observerLifecycle) {
            this.observerLifecycle.disconnect();
            this.observerLifecycle = null;
        }
        this.observerRoot = null;
        if (this.observerRebindTimer) {
            clearTimeout(this.observerRebindTimer);
            this.observerRebindTimer = null;
        }
        if (this.observerRetryTimer) {
            clearTimeout(this.observerRetryTimer);
            this.observerRetryTimer = null;
        }

        if (!document.body) {
            this.observerRetryTimer = setTimeout(() => {
                this.observerRetryTimer = null;
                if (!this.isStarted) return;
                this.startObserver();
            }, 1000);
            return;
        }

        this.observer = new MutationObserver(mutations => this.handleDiscordObservedMutations(mutations));
        const observerRoot = this.getDiscordChatMutationObserverRoot() || document.body;
        this.observerRoot = observerRoot;
        this.observer.observe(observerRoot, {
            attributeFilter: ["alt", "aria-hidden", "aria-label", "aria-labelledby", "class", "data-author-id", "data-item-id", "data-list-item-id", "data-message-id", "data-theme", "data-user-id", "datetime", "hidden", "id", "style", "theme"],
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true
        });
        if (observerRoot !== document.body) {
            this.observer.observe(document.body, {
                attributeFilter: ["class", "data-theme", "style", "theme"],
                attributes: true,
                childList: false,
                subtree: false
            });
            this.startDiscordObserverLifecycle(observerRoot);
        }
    }

    handleDiscordObservedMutations(mutations = []) {
        if (!this.isStarted) return;
        if (this.observerRoot === document.body && this.hasPotentialDiscordObserverRootMutation(mutations)) {
            const nextRoot = this.getDiscordChatMutationObserverRoot();
            if (nextRoot && nextRoot !== document.body) this.scheduleDiscordObserverRebind("chat-root-available");
        }
        if (this.isDiscordMediaViewerQuiet()) {
            if (this.hasLightweightDiscordMediaViewerMutation(mutations)) this.enterDiscordMediaViewerQuietMode("quiet-mutation");
            // Even while quiet, real content mutations (e.g. a message edited behind the
            // media viewer) must drop cached element text, or stale-text guards compare
            // stale-vs-stale after the viewer closes. Own-mutation filtering is skipped
            // on purpose: renders are deferred while quiet, so plugin-caused mutations
            // are rare and an occasional self-invalidation only re-extracts text once.
            this.invalidateElementTextCacheForMutations(mutations);
            return;
        }
        const externalMutations = [...(mutations || [])].filter(mutation => !this.isOwnMutation(mutation));
        if (!externalMutations.length) return;
        this.invalidateElementTextCacheForMutations(externalMutations);
        if (this.hasDiscordMediaViewerMutation(externalMutations)) {
            this.enterDiscordMediaViewerQuietMode("mutation");
            return;
        }
        if (this.hasDiscordThemeMutation(externalMutations)) this.refreshDiscordThemeClasses();
        const inputMutations = this.getInputButtonRelevantMutations(externalMutations);
        if (inputMutations.length) {
            this.markInputComposerBusy();
            this.queueInputButtonScan({ delayMs: 500, trailing: true });
        }
        if (this.isDiscordMediaViewerOpen() || this.areDiscordMediaViewerMutations(externalMutations)) {
            this.enterDiscordMediaViewerQuietMode("open");
            return;
        }
        const scanMutations = this.getScanRelevantMutations(externalMutations);
        if (!scanMutations.length) return;
        if (this.hasLargeMessageMutation(scanMutations)) this.markAutoTranslationViewportBusy("mutation");
        this.queueMutationScan(scanMutations);
    }

    startDiscordObserverLifecycle(observerRoot) {
        const lifecycleRoot = document.getElementById?.("app-mount") || document.body;
        if (!lifecycleRoot || lifecycleRoot === observerRoot) return;
        this.observerLifecycle = new MutationObserver(mutations => {
            if (!this.isStarted) return;
            if (!this.observerRoot || this.observerRoot.isConnected === false) {
                this.scheduleDiscordObserverRebind("chat-root-detached");
                return;
            }
            const outsideMutations = [...(mutations || [])].filter(mutation => !this.isMutationWithinDiscordObserverRoot(mutation, this.observerRoot));
            if (!outsideMutations.length) return;
            if (this.hasPotentialDiscordObserverRootMutation(outsideMutations)) {
                const nextRoot = this.getDiscordChatMutationObserverRoot();
                if (nextRoot && nextRoot !== this.observerRoot && !this.observerRoot.contains?.(nextRoot)) {
                    this.scheduleDiscordObserverRebind("chat-root-replaced");
                    return;
                }
            }
            this.handleDiscordObservedMutations(outsideMutations);
        });
        this.observerLifecycle.observe(lifecycleRoot, { childList: true, subtree: true });
    }

    isMutationWithinDiscordObserverRoot(mutation, root = this.observerRoot) {
        if (!root) return false;
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        return target === root || Boolean(root.contains?.(target));
    }

    hasPotentialDiscordObserverRootMutation(mutations = []) {
        const selectors = this.getDiscordChatMutationObserverSelectors().join(",");
        return [...(mutations || [])].some(mutation => {
            if (mutation?.type !== "childList") return false;
            return [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])].some(node => {
                const element = node?.nodeType === 3 ? node.parentElement : node;
                if (!element || element.nodeType !== 1) return false;
                try {
                    return Boolean(element.matches?.(selectors) || element.querySelector?.(selectors));
                }
                catch {
                    return false;
                }
            });
        });
    }

    scheduleDiscordObserverRebind(reason = "chat-root-change") {
        if (!this.isStarted || this.observerRebindTimer) return;
        this.cancelIncrementalMessageScan();
        this.observerRebindTimer = setTimeout(() => {
            this.observerRebindTimer = null;
            if (!this.isStarted) return;
            this.startObserver();
            this.queueScan({ delayMs: 80, trailing: true });
            this.queueInputButtonScan({ delayMs: 120, trailing: true });
            this.logDiagnostic("observer.rebind", "ok", { reason });
        }, 40);
        this.unrefTimer(this.observerRebindTimer);
    }

    getDiscordChatMutationObserverSelectors() {
        return [
            "[class*='chatContent']",
            "[class*='messagesWrapper']",
            "[data-list-id*='chat-messages']",
            "[class*='scrollerInner']",
            "[role='main']"
        ];
    }

    getDiscordChatMutationObserverRoot() {
        if (typeof document === "undefined" || !document.querySelector) return null;
        for (const selector of this.getDiscordChatMutationObserverSelectors()) {
            const element = document.querySelector(selector);
            if (element?.nodeType === 1) return element;
        }
        return null;
    }

    hasDiscordThemeMutation(mutations = []) {
        return [...mutations].some(mutation => {
            if (mutation?.type !== "attributes") return false;
            const attributeName = String(mutation.attributeName || "");
            if (!["class", "data-theme", "theme", "style"].includes(attributeName)) return false;
            const target = mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target;
            if (!target) return false;
            if (this.isOwnPluginElement(target) || target.dataset?.daitSettingsModal || target.dataset?.daitSettingsModalRoot || target.dataset?.daitDiscordTheme) return false;
            if (target === document.body || target === document.documentElement) return true;
            if (this.elementHasAnyDiscordThemeClass(target)) return true;
            if (this.getElementDiscordThemeClass(target)) return true;
            const id = String(target.id || "");
            const className = String(target.className || "");
            return id === "app-mount" || /app-?mount/i.test(className);
        });
    }

    isOwnMutation(mutation) {
        const target = mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target;
        if (this.isOwnPluginElement(target)) return true;
        if (target?.dataset?.daitSettingsModal || target?.dataset?.daitSettingsModalRoot || target?.dataset?.daitDiscordTheme) return true;

        if (mutation.type === "childList") {
            const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
            return nodes.length > 0 && nodes.every(node => this.isOwnMutationNode(node));
        }

        if (mutation.type === "attributes") {
            const name = String(mutation.attributeName || "");
            if (name === "style" && this.consumeTranslationSourceStyleMutation(target)) return true;
            return name.startsWith("data-dait-");
        }

        return false;
    }

    invalidateElementTextCacheForMutations(mutations = []) {
        if (!this.elementTextCache?.delete) return;
        for (const mutation of mutations || []) {
            if (this.isPresentationOnlyMessageMutation(mutation)) continue;
            const nodes = [
                mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target,
                ...(mutation?.addedNodes || []),
                ...(mutation?.removedNodes || [])
            ];
            nodes.forEach(node => this.invalidateElementTextCacheFromNode(node));
        }
    }

    invalidateElementTextCacheFromNode(node) {
        let element = node?.nodeType === 3 ? node.parentElement : node;
        let depth = 0;
        while (element && element.nodeType === 1 && depth < 12) {
            this.elementTextCache?.delete?.(element);
            if (this.isDiscordMessageElement(element)) break;
            element = element.parentElement;
            depth++;
        }
    }

    markTranslationSourceStyleMutation(element, count = 1) {
        if (!element || !this.translationSourceStyleMutationCounts?.set) return;
        const previous = Number(this.translationSourceStyleMutationCounts.get(element) || 0) || 0;
        this.translationSourceStyleMutationCounts.set(element, previous + Math.max(1, Number(count) || 1));
    }

    consumeTranslationSourceStyleMutation(element) {
        if (!element || !this.translationSourceStyleMutationCounts?.get) return false;
        const count = Number(this.translationSourceStyleMutationCounts.get(element) || 0) || 0;
        if (count <= 0) return false;
        if (count <= 1) this.translationSourceStyleMutationCounts.delete(element);
        else this.translationSourceStyleMutationCounts.set(element, count - 1);
        return true;
    }

    isOwnMutationNode(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (this.isOwnPluginElement(element)) return true;
        return Boolean(element?.matches?.(".dait-settings, .dait-quick-settings-button, .dait-quick-settings-modal-root, .dait-message-button, .dait-polish-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-line, .dait-translation-box"));
    }

    isMediaOnlyMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isDiscordMessageElement(target)) return false;
        if (this.isDiscordMediaViewerMutation(mutation)) return true;
        if (mutation?.type === "attributes" || mutation?.type === "characterData") {
            return this.isMediaOnlyMutationElement(target);
        }
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        if (!nodes.length) return this.isMediaOnlyMutationElement(target);
        return nodes.every(node => this.isMediaOnlyMutationNode(node));
    }

    areDiscordMediaViewerMutations(mutations = []) {
        return [...(mutations || [])].length > 0 && [...(mutations || [])].every(mutation => this.isDiscordMediaViewerMutation(mutation) || this.isMediaOnlyMutation(mutation));
    }

    hasDiscordMediaViewerMutation(mutations = []) {
        return [...(mutations || [])].some(mutation => this.isDiscordMediaViewerMutation(mutation));
    }

    isDiscordMediaViewerMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isDiscordMediaViewerElement(target)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        return nodes.length > 0 && nodes.every(node => this.isDiscordMediaViewerMutationNode(node));
    }

    isDiscordMediaViewerMutationNode(node) {
        if (!node) return false;
        if (node.nodeType === 3) return !String(node.nodeValue || "").trim();
        const element = node.nodeType === 1 ? node : null;
        return this.isDiscordMediaViewerElement(element);
    }

    isMediaOnlyMutationNode(node) {
        if (!node) return false;
        if (node.nodeType === 3) return !String(node.nodeValue || "").trim();
        const element = node.nodeType === 1 ? node : null;
        return this.isMediaOnlyMutationElement(element);
    }

    isMediaOnlyMutationElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element) || this.isInsideDiscordSettingsSurface(element) || this.isInsideInputComposer(element)) return false;
        if (this.isDiscordMessageElement(element)) return false;
        const messageAncestor = element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR);
        if (!messageAncestor && (this.isInsideDiscordMediaViewer(element) || this.isDiscordMediaViewerElement(element))) return true;
        const mediaRoot = element.matches?.(DISCORD_MEDIA_MUTATION_SELECTOR)
            ? element
            : element.closest?.(DISCORD_MEDIA_MUTATION_SELECTOR);
        if (!mediaRoot) return false;
        if (this.isDiscordMessageElement(mediaRoot)) return false;
        return !this.mediaMutationElementHasTextCandidate(mediaRoot);
    }

    isInsideDiscordMediaViewer(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
        return Boolean(element.matches?.(DISCORD_MEDIA_VIEWER_SELECTOR) || element.closest?.(DISCORD_MEDIA_VIEWER_SELECTOR) || this.isDiscordMediaViewerElement(element.closest?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR)));
    }

    isDiscordMediaViewerElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element) || this.isInsideDiscordSettingsSurface(element) || this.isInsideInputComposer(element)) return false;
        if (this.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
        if (element.matches?.(DISCORD_MEDIA_VIEWER_SELECTOR)) return true;
        const hasMedia = this.elementHasMediaViewerContent(element);
        if (!hasMedia) return false;
        return Boolean(element.matches?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR) || element.closest?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR));
    }

    elementHasMediaViewerContent(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.matches?.("img, video, picture, canvas")) return true;
        return Boolean(element.querySelector?.("img, video, picture, canvas, [class*='imageWrapper'], [class*='mediaViewer'], [class*='carousel']"));
    }

    isDiscordMediaViewerOpen() {
        if (typeof document === "undefined" || !document.querySelector) return false;
        const now = Date.now();
        if (now - Number(this.mediaViewerProbeAt || 0) < DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS) {
            return Boolean(this.mediaViewerProbeOpen);
        }
        if (document.querySelector?.(DISCORD_MEDIA_VIEWER_SELECTOR)) {
            this.mediaViewerProbeAt = now;
            this.mediaViewerProbeOpen = true;
            this.enterDiscordMediaViewerQuietMode("selector");
            return true;
        }
        const containers = [...(document.querySelectorAll?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR) || [])];
        const open = containers.some(container => this.isDiscordMediaViewerElement(container));
        this.mediaViewerProbeAt = now;
        this.mediaViewerProbeOpen = open;
        if (open) this.enterDiscordMediaViewerQuietMode("probe");
        return open;
    }

    enterDiscordMediaViewerQuietMode(reason = "media-viewer", durationMs = DISCORD_MEDIA_VIEWER_QUIET_MS) {
        const now = Date.now();
        this.mediaViewerQuietUntil = Math.max(Number(this.mediaViewerQuietUntil || 0), now + Math.max(250, Number(durationMs) || DISCORD_MEDIA_VIEWER_QUIET_MS));
        this.mediaViewerProbeAt = now;
        this.mediaViewerProbeOpen = true;
        if (this.scanTimer && this.scanDueAt && Number(this.scanDueAt || 0) < this.mediaViewerQuietUntil + 80) {
            clearTimeout(this.scanTimer);
            this.scanTimer = null;
            this.scanDueAt = 0;
            this.queueScan({ delayMs: this.getDiscordMediaViewerQuietRemainingMs() + 80, trailing: true });
        }
        this.deferInputButtonScanForMediaViewer();
        this.deferAutoTranslationRenderQueueForMediaViewer();
    }

    isDiscordMediaViewerQuiet(now = Date.now()) {
        return now < Number(this.mediaViewerQuietUntil || 0);
    }

    getDiscordMediaViewerQuietRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.mediaViewerQuietUntil || 0) - now);
    }

    hasLightweightDiscordMediaViewerMutation(mutations = []) {
        return [...(mutations || [])].some(mutation => this.isLightweightDiscordMediaViewerMutation(mutation));
    }

    isLightweightDiscordMediaViewerMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isLightweightDiscordMediaViewerElement(target)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        return nodes.some(node => this.isLightweightDiscordMediaViewerElement(node?.nodeType === 3 ? node.parentElement : node));
    }

    isLightweightDiscordMediaViewerElement(element) {
        if (!element || element.nodeType !== 1) return false;
        const tagName = String(element.tagName || element.nodeName || "").toLowerCase();
        if (["img", "video", "picture", "source", "canvas"].includes(tagName)) return true;
        const className = element.className?.baseVal || element.className || "";
        const identity = [
            tagName,
            element.id || "",
            className,
            element.getAttribute?.("role") || "",
            element.getAttribute?.("aria-modal") || "",
            element.getAttribute?.("aria-label") || "",
            element.getAttribute?.("data-testid") || ""
        ].join(" ");
        return /(imageModal|carouselModal|mediaViewer|focusLock|modalRoot|zoomed|imageWrapper|imageContainer|lazyImg|mediaAttachmentsContainer|embedImage|embedMedia|embedThumbnail|embedVideo|attachmentInner|carousel|modal|layer|dialog)/i.test(identity);
    }

    getDiscordMediaViewerDeferredDelayMs(now = Date.now()) {
        if (this.isDiscordMediaViewerQuiet(now)) return this.getDiscordMediaViewerQuietRemainingMs(now) + 80;
        if (this.isDiscordMediaViewerOpen()) return Math.max(DISCORD_MEDIA_VIEWER_QUIET_MS, this.getDiscordMediaViewerQuietRemainingMs() + 80);
        return 0;
    }

    deferInputButtonScanForMediaViewer() {
        if (!this.inputButtonScanTimer) return;
        const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
        if (this.inputButtonScanTimer) clearTimeout(this.inputButtonScanTimer);
        this.inputButtonScanTimer = null;
        this.inputButtonScanDueAt = 0;
        this.queueInputButtonScan({ delayMs, trailing: true });
    }

    deferAutoTranslationRenderQueueForMediaViewer() {
        if (!this.autoTranslationRenderQueue?.length) return;
        const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
        if (this.autoTranslationRenderRaf) {
            const cancel = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
                ? window.cancelAnimationFrame.bind(window)
                : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
            try { cancel?.(this.autoTranslationRenderRaf); }
            catch {}
            this.autoTranslationRenderRaf = null;
        }
        if (this.autoTranslationRenderTimer) {
            clearTimeout(this.autoTranslationRenderTimer);
            this.autoTranslationRenderTimer = null;
            this.autoTranslationRenderDueAt = 0;
        }
        this.autoTranslationRenderDueAt = 0;
        this.scheduleAutoTranslationRenderQueue(delayMs);
    }

    mediaMutationElementHasTextCandidate(element) {
        if (!element || element.nodeType !== 1) return false;
        const text = String(element.innerText ?? element.textContent ?? "").replace(/\u200b/g, "").trim();
        if (!text) return false;
        return /[0-9A-Za-z\u00c0-\uffff]/.test(text);
    }

    getScanRelevantMutations(mutations) {
        return [...(mutations || [])].filter(mutation => this.isScanRelevantMutation(mutation));
    }

    isScanRelevantMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isInsideDiscordSettingsSurface(target)) return false;
        if (this.isMediaOnlyMutation(mutation)) return false;
        if (this.isPresentationOnlyMessageMutation(mutation, target)) return false;
        if (this.isScanRelevantElement(target)) return true;

        if (mutation?.type === "childList") {
            const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
            return nodes.some(node => this.isScanRelevantMutationNode(node));
        }

        return false;
    }

    isPresentationOnlyMessageMutation(mutation, target = null) {
        if (mutation?.type !== "attributes") return false;
        const attributeName = String(mutation.attributeName || "");
        if (!["class", "style"].includes(attributeName)) return false;
        const element = target || (mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target);
        if (!element || element.nodeType !== 1) return false;
        if (typeof document !== "undefined" && (element === document.body || element === document.documentElement)) return false;
        return Boolean(this.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR));
    }

    isScanRelevantMutationNode(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || element.nodeType !== 1) return false;
        if (this.isInsideDiscordSettingsSurface(element)) return false;
        if (this.isMediaOnlyMutationElement(element)) return false;
        if (this.isScanRelevantElement(element)) return true;
        if (element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR)) return true;
        return false;
    }

    isScanRelevantElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isInsideDiscordSettingsSurface(element)) return false;
        if (this.isInsideInputComposer(element)) return false;
        if (this.isMediaOnlyMutationElement(element)) return false;
        if (this.isDiscordMessageElement(element)) return true;
        const chatSelector = [
            DISCORD_MESSAGE_NODE_SELECTOR,
            "[data-list-id*='chat-messages']",
            "[class*='messagesWrapper']",
            "[class*='scrollerInner']",
            "[class*='chatContent']"
        ].join(",");
        return Boolean(
            element.matches?.(chatSelector)
            || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR)
            || element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR)
        );
    }

    getInputButtonRelevantMutations(mutations = []) {
        if (!this.settings.ui?.injectInputButton && !this.settings.ui?.publicBilingualInputButton) return [];
        return [...(mutations || [])].filter(mutation => this.isInputButtonRelevantMutation(mutation));
    }

    isInputButtonRelevantMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isInputButtonMutationElement(target)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        return nodes.some(node => this.isInputButtonMutationElement(node?.nodeType === 3 ? node.parentElement : node));
    }

    isInputButtonMutationElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        if (this.isInsideDiscordSettingsSurface(element)) return false;
        return this.isInsideInputComposer(element)
            || Boolean(element.querySelector?.("[class*='channelTextArea'], [data-slate-editor='true'], [role='textbox'][contenteditable='true']"));
    }

    isInsideInputComposer(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        return Boolean(element.matches?.("[class*='channelTextArea'], [data-slate-editor='true'], [role='textbox'][contenteditable='true']")
            || element.closest?.("[class*='channelTextArea'], [data-slate-editor='true'], [role='textbox'][contenteditable='true']"));
    }

    markInputComposerBusy(durationMs = DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS) {
        this.inputComposerBusyUntil = Math.max(
            Number(this.inputComposerBusyUntil || 0),
            Date.now() + Math.max(80, Number(durationMs) || DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS)
        );
    }

    getInputComposerBusyRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.inputComposerBusyUntil || 0) - now);
    }

    queueInputButtonScan(options = {}) {
        if (!this.isStarted) return;
        if (!this.settings.ui?.injectInputButton && !this.settings.ui?.publicBilingualInputButton) return;
        const now = Date.now();
        const delay = Math.max(0, Number(options.delayMs ?? 350) || 0);
        const dueAt = now + delay;
        if (this.inputButtonScanTimer && this.inputButtonScanDueAt) {
            if (options.trailing) {
                if (this.inputButtonScanDueAt >= dueAt) return;
            }
            else if (this.inputButtonScanDueAt <= dueAt) return;
        }
        if (this.inputButtonScanTimer) clearTimeout(this.inputButtonScanTimer);
        this.inputButtonScanDueAt = dueAt;
        this.inputButtonScanTimer = setTimeout(() => this.scanInputButtonsOnly(), delay);
    }

    scanInputButtonsOnly() {
        this.inputButtonScanTimer = null;
        this.inputButtonScanDueAt = 0;
        if (!this.isStarted) return;
        if (!this.settings.ui?.injectInputButton && !this.settings.ui?.publicBilingualInputButton) return;
        const mediaDelayMs = this.getDiscordMediaViewerDeferredDelayMs();
        if (mediaDelayMs > 0) {
            this.queueInputButtonScan({ delayMs: mediaDelayMs, trailing: true });
            return;
        }
        if (this.isDiscordSettingsSurfaceOpen()) return;
        this.injectInputButtons();
    }

    queueViewportScan(event = null) {
        if (!this.isStarted) return;
        const type = String(event?.type || "");
        if (type === "scroll" && !this.isAutoTranslateEnabled()) return;
        if (this.isDiscordMediaViewerQuiet()) return;
        if (this.isDiscordMediaViewerViewportEvent(event)) return;
        if (type === "scroll" && !this.isAutoTranslationScrollEventRelevant(event)) return;
        if (type === "scroll" || type === "resize") {
            if (type === "resize") this.queueInputButtonScan({ delayMs: 120, trailing: true });
            if (!this.isAutoTranslateEnabled()) return;
            if (type === "scroll" && this.consumeOwnScrollEvent(event)) return;
            this.cancelIncrementalMessageScan();
            this.markAutoTranslationViewportBusy(type, event);
            this.scheduleCachedTranslationDrawPass();
            const delay = Math.max(
                AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
                this.getAutoTranslationRenderPauseRemainingMs(),
                this.getAutoTranslationViewportSettleRemainingMs()
            ) + 80;
            this.queueScan({ delayMs: delay, trailing: true });
            return;
        }
        this.queueScan();
    }

    isDiscordMediaViewerViewportEvent(event = null) {
        const type = String(event?.type || "");
        if (!["focus", "resize", "scroll", "visibilitychange"].includes(type)) return false;
        const target = event?.target?.nodeType === 3 ? event.target.parentElement : event?.target;
        if (target?.nodeType === 1 && (this.isInsideDiscordMediaViewer(target) || this.isMediaOnlyMutationElement(target))) return true;
        if (type === "scroll" && target?.nodeType === 1 && this.isAutoTranslationScrollEventRelevant(event)) return false;
        if (type === "scroll" && !this.mediaViewerProbeOpen && Date.now() - Number(this.mediaViewerProbeAt || 0) >= DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS) return false;
        return this.isDiscordMediaViewerOpen();
    }

    getMutationScanRoots(mutations = []) {
        const roots = new Set();
        for (const mutation of mutations || []) {
            const nodeRoots = new Set();
            const nodes = [...(mutation?.addedNodes || []), ...(mutation?.removedNodes || [])];
            nodes.forEach(node => {
                const root = this.getMutationScanRootFromNode(node);
                if (root) nodeRoots.add(root);
            });
            if (nodeRoots.size) {
                nodeRoots.forEach(root => roots.add(root));
                continue;
            }
            const targetRoot = this.getMutationScanRootFromNode(mutation?.target);
            if (targetRoot) roots.add(targetRoot);
        }
        return roots;
    }

    getMutationScanRootFromNode(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || element.nodeType !== 1) return null;
        if (this.isOwnPluginElement(element) || this.isInsideDiscordSettingsSurface(element) || this.isInsideInputComposer(element) || this.isMediaOnlyMutationElement(element)) return null;
        if (this.isDiscordMessageElement(element)) return element;
        const message = element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR);
        if (message && message.isConnected !== false) return message;
        if (element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR)) return element;
        const chatSelector = [
            "[data-list-id*='chat-messages']",
            "[class*='messagesWrapper']",
            "[class*='scrollerInner']",
            "[class*='chatContent']"
        ].join(",");
        if (element.matches?.(chatSelector)) return element;
        return null;
    }

    shouldUseDirtyMutationScan(mutations = [], roots = new Set()) {
        if (!roots?.size || this.hasLargeMessageMutation(mutations)) return false;
        if (roots.size > MUTATION_DIRTY_SCAN_MAX_ROOTS) return false;
        let messageCount = 0;
        for (const root of roots) {
            if (!root || root.isConnected === false) return false;
            messageCount += this.getMutationRootMessageCount(root);
            if (messageCount <= 0 || messageCount > MUTATION_DIRTY_SCAN_MAX_MESSAGES) return false;
        }
        return messageCount > 0;
    }

    getMutationRootMessageCount(root) {
        if (!root || root.nodeType !== 1) return 0;
        if (this.isDiscordMessageElement(root)) return 1;
        const count = Number(root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR)?.length || 0);
        return Math.min(MUTATION_DIRTY_SCAN_MAX_MESSAGES + 1, count);
    }

    rememberPendingMutationScanRoots(roots = []) {
        if (!this.pendingMutationScanRoots?.add) this.pendingMutationScanRoots = new Set();
        for (const root of roots || []) {
            if (!root || root.isConnected === false) continue;
            this.pendingMutationScanRoots.add(root);
            if (this.pendingMutationScanRoots.size > MUTATION_DIRTY_SCAN_MAX_ROOTS) break;
        }
    }

    consumePendingMutationScanRoots() {
        const roots = [...(this.pendingMutationScanRoots || [])].filter(root => root?.isConnected !== false);
        this.pendingMutationScanRoots?.clear?.();
        return roots;
    }

    queueMutationScan(scanMutations = []) {
        this.cancelIncrementalMessageScan();
        // Discord mounts messages as the chat scrolls; draw their cached translations promptly.
        if (this.isAutoTranslationRenderPaused() || this.hasAddedMessageNodes(scanMutations)) this.scheduleCachedTranslationDrawPass();
        const roots = this.getMutationScanRoots(scanMutations);
        const dirtyOnly = this.shouldUseDirtyMutationScan(scanMutations, roots);
        if (dirtyOnly) this.rememberPendingMutationScanRoots(roots);
        else this.pendingMutationScanRoots?.clear?.();
        const delay = Math.max(
            this.getAutoTranslationRenderPauseRemainingMs(),
            this.getAutoTranslationViewportSettleRemainingMs()
        );
        if (delay > 0) {
            this.queueScan({ delayMs: Math.max(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, delay) + 80, trailing: true, dirtyOnly });
            return;
        }
        this.queueScan({ dirtyOnly });
    }

    hasLargeMessageMutation(mutations) {
        let count = 0;
        for (const mutation of mutations || []) {
            if (this.isMediaOnlyMutation(mutation)) continue;
            if (mutation.type === "attributes" && this.isDiscordMessageElement(mutation.target)) count++;
            if (mutation.type !== "childList") {
                if (count >= 8) return true;
                continue;
            }

            const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
            for (const node of nodes) {
                count += this.getMutationMessageElementCount(node);
                if (count >= 8) return true;
            }
        }
        return false;
    }

    hasAddedMessageNodes(mutations = []) {
        return (mutations || []).some(mutation => mutation?.type === "childList"
            && [...(mutation.addedNodes || [])].some(node => this.getMutationMessageElementCount(node) > 0));
    }

    getMutationMessageElementCount(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || element.nodeType !== 1) return 0;
        if (this.isDiscordMessageElement(element)) return 1;
        const matches = element.querySelectorAll?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        return Math.min(8, Number(matches?.length || 0));
    }

    isDiscordMessageElement(element) {
        return Boolean(element?.matches?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']"));
    }

    getViewportScrollTarget(event = null) {
        const target = event?.target;
        if (!target || typeof document === "undefined" || target === document || target === window || target === document.body || target === document.documentElement) return null;
        return target && typeof target === "object" ? target : null;
    }

    getPreviousViewportScrollPosition(event = null, fallback = 0) {
        const target = this.getViewportScrollTarget(event);
        if (target && this.autoTranslationLastScrollByTarget?.has?.(target)) {
            const value = Number(this.autoTranslationLastScrollByTarget.get(target));
            if (Number.isFinite(value)) return value;
        }
        if (!target && Number.isFinite(Number(this.autoTranslationLastWindowScrollY))) return Number(this.autoTranslationLastWindowScrollY);
        return fallback;
    }

    setPreviousViewportScrollPosition(event = null, value = 0) {
        const scrollY = Number(value);
        if (!Number.isFinite(scrollY)) return;
        const target = this.getViewportScrollTarget(event);
        if (target && this.autoTranslationLastScrollByTarget?.set) {
            this.autoTranslationLastScrollByTarget.set(target, scrollY);
            return;
        }
        this.autoTranslationLastWindowScrollY = scrollY;
    }

    getViewportScrollPosition(event = null) {
        const target = event?.target;
        if (target && target !== document && target !== window && Number.isFinite(Number(target.scrollTop))) {
            return Number(target.scrollTop);
        }
        if (typeof window !== "undefined") return Number(window.scrollY || window.pageYOffset || 0);
        return 0;
    }

    queueScan(options = {}) {
        if (!this.isStarted) return;
        const now = Date.now();
        const dirtyOnly = Boolean(options.dirtyOnly);
        const existingFullScanPending = Boolean(this.scanTimer && this.scanDirtyOnly === false);
        if (!dirtyOnly) this.scanDirtyOnly = false;
        if (Number(options.protectUntil || 0) > now) {
            this.scanProtectedUntil = Math.max(Number(this.scanProtectedUntil || 0), Number(options.protectUntil));
        }
        let delay = Math.max(0, Number(options.delayMs ?? 150) || 0);
        let dueAt = now + delay;
        let trailing = Boolean(options.trailing);
        const quietUntil = Number(this.mediaViewerQuietUntil || 0);
        if (!options.force && quietUntil > now && dueAt < quietUntil + 80) {
            dueAt = quietUntil + 80;
            delay = Math.max(0, dueAt - now);
            trailing = true;
        }
        const protectedUntil = Number(this.scanProtectedUntil || 0);
        if (!options.force && protectedUntil > now && dueAt < protectedUntil) {
            dueAt = protectedUntil;
            delay = Math.max(0, dueAt - now);
            trailing = true;
        }
        if (this.scanTimer && this.scanDueAt) {
            if (trailing) {
                if (this.scanDueAt >= dueAt) return;
            }
            else if (this.scanDueAt <= dueAt) return;
        }
        if (this.scanTimer) clearTimeout(this.scanTimer);
        this.scanDirtyOnly = dirtyOnly && !existingFullScanPending;
        this.scanDueAt = dueAt;
        this.scanTimer = setTimeout(() => this.scanDiscordUi(), delay);
    }

    scanDiscordUi() {
        const startedAt = this.getDiagnosticTime();
        this.scanTimer = null;
        this.scanDueAt = 0;
        if (Number(this.scanProtectedUntil || 0) <= Date.now()) this.scanProtectedUntil = 0;
        if (!this.isStarted) return;
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
        if (this.isDiscordMediaViewerQuiet()) {
            const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
            this.queueScan({ delayMs, trailing: true });
            this.logSlowOperation("scan.discord-ui", startedAt, { outcome: "deferred", reason: "media-viewer-quiet", delayMs });
            return;
        }
        if (this.isDiscordMediaViewerOpen()) {
            const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
            if (delayMs > 80) this.queueScan({ delayMs, trailing: true });
            this.logSlowOperation("scan.discord-ui", startedAt, { outcome: "blocked", reason: "media-viewer-open" });
            return;
        }
        if (this.isQuickSettingsPanelOpen()) {
            this.quickSettingsScanDeferred = true;
            this.logSlowOperation("scan.discord-ui", startedAt, { outcome: "blocked", reason: "quick-settings-open" }, 0);
            return;
        }
        if (this.isDiscordSettingsSurfaceOpen()) {
            this.logDiagnostic("scan.discord-ui", "blocked", { reason: "discord-settings-open" });
            this.logSlowOperation("scan.discord-ui", startedAt, { outcome: "blocked", reason: "discord-settings-open" });
            return;
        }
        const routeChanged = this.trackAutoTranslationRouteChange();
        if (routeChanged) {
            const delayMs = Math.max(
                AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
                this.getAutoTranslationViewportSettleRemainingMs()
            ) + 120;
            if (this.isAutoTranslateEnabled()) {
                this.scheduleCacheOnlyAutoTranslationScan("route-change", 80);
                this.scheduleCachedTranslationDrawPass();
            }
            this.queueScan({ delayMs, trailing: true, protectUntil: Date.now() + delayMs });
            this.logDiagnostic("scan.discord-ui", "deferred", { reason: "route-change", delayMs, cacheOnly: true, messages: 0 });
            this.logSlowOperation("scan.discord-ui", startedAt, { outcome: "deferred", reason: "route-change", cacheOnly: true, messages: 0 });
            return;
        }
        if (this.isAutoTranslationRenderPaused()) {
            if (this.isAutoTranslateEnabled()) {
                const delayMs = this.getAutoTranslationRenderPauseRemainingMs();
                this.scheduleCacheOnlyAutoTranslationScan("render-paused", delayMs + 80);
                this.scheduleAutoTranslationRetryScan(delayMs, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            }
            this.queueScan({
                delayMs: this.getAutoTranslationRenderPauseRemainingMs() + 80,
                trailing: true
            });
            this.logSlowOperation("scan.discord-ui", startedAt, { outcome: "paused", cacheOnly: true, messages: 0 });
            return;
        }
        const dirtyOnly = Boolean(this.scanDirtyOnly);
        this.scanDirtyOnly = false;
        this.scheduleCachedTranslationDrawPass();
        const dirtyRoots = dirtyOnly ? this.consumePendingMutationScanRoots() : [];
        if (!dirtyOnly) this.pendingMutationScanRoots?.clear?.();
        let stageStartedAt = this.getDiagnosticTime();
        const scanStages = {};
        const finishStage = name => {
            scanStages[name] = Math.max(0, Math.round(this.getDiagnosticTime() - stageStartedAt));
            stageStartedAt = this.getDiagnosticTime();
        };
        if (!dirtyRoots.length) this.injectQuickSettingsButtons();
        finishStage("quickMs");
        const context = this.createScanContext(dirtyRoots.length ? { roots: dirtyRoots, dirtyOnly: true } : {});
        finishStage("contextMs");
        this.reconcileTranslationLines(context);
        finishStage("reconcileMs");
        if (!dirtyRoots.length && (this.settings.ui.injectInputButton || this.settings.ui.publicBilingualInputButton)) {
            const inputBusyMs = this.getInputComposerBusyRemainingMs();
            if (inputBusyMs > 0) this.queueInputButtonScan({ delayMs: inputBusyMs + 80, trailing: true });
            else this.injectInputButtons();
        }
        finishStage("inputMs");
        const incremental = this.shouldUseIncrementalMessageScan(context);
        if (incremental) {
            this.scheduleIncrementalMessageScan(context);
            finishStage("scheduleMs");
            scanStages.buttonMs = 0;
            scanStages.autoMs = 0;
        }
        else {
            this.cancelIncrementalMessageScan();
            if (this.settings.ui.injectMessageButtons) this.injectMessageButtons(context);
            finishStage("buttonMs");
            if (this.isAutoTranslateEnabled()) this.queueAutoTranslateVisibleMessages(context);
            finishStage("autoMs");
        }
        this.logSlowOperation("scan.discord-ui", startedAt, {
            outcome: "ok",
            messages: context.messageNodes?.length || 0,
            nodeCount: context.messageNodes?.length || 0,
            dirtyOnly: Boolean(context.dirtyOnly),
            autoTranslate: this.isAutoTranslateEnabled(),
            ...scanStages
        });
    }

    shouldUseIncrementalMessageScan(context = null) {
        if (!context?.messageNodes?.length) return false;
        if (!this.isAutoTranslateEnabled() && !this.settings.ui?.injectMessageButtons) return false;
        if (typeof window === "undefined" || typeof window.requestIdleCallback !== "function") return false;
        return true;
    }

    scheduleIncrementalMessageScan(context) {
        this.cancelIncrementalMessageScan();
        const generation = this.incrementalMessageScanGeneration;
        const messageNodes = [...new Set(context?.messageNodes || [])];
        const tasks = [];
        messageNodes.forEach(messageNode => {
            if (this.settings.ui.injectMessageButtons) tasks.push({ kind: "button", messageNode });
            if (this.isAutoTranslateEnabled()) tasks.push({ kind: "auto", messageNode });
        });
        let index = 0;
        let work = null;
        let initialized = false;
        let intakeEnhance = false;

        const runSlice = deadline => {
            this.incrementalMessageScanIdleCallback = null;
            this.incrementalMessageScanTimer = null;
            if (!this.isStarted || generation !== this.incrementalMessageScanGeneration) return;

            const sliceStartedAt = this.getDiagnosticTime();
            if (!initialized) {
                initialized = true;
                if (this.isAutoTranslateEnabled()) {
                    // Resolve the configured intake mode once per scan so the incremental
                    // path matches createAutoTranslationCandidates (which cache-only scans
                    // and history backfill use). The BDFDB store snapshot is cached on the
                    // scan context, so multi-slice scans still fetch it exactly once.
                    const mode = this.normalizeAutoTranslateIntakeMode(this.settings.ui?.autoTranslateIntakeMode);
                    const bdfdbAvailable = this.isBdfdbMessageIntakeAvailable();
                    intakeEnhance = mode !== "dom" && bdfdbAvailable;
                    const intake = {
                        mode,
                        source: intakeEnhance ? "bdfdb" : "dom",
                        bdfdbAvailable,
                        domCandidates: 0,
                        bdfdbEnhanced: 0,
                        bdfdbOnlySkipped: 0
                    };
                    if (mode !== "dom" && !bdfdbAvailable) intake.reason = "bdfdb-unavailable";
                    context.autoTranslateIntake = intake;
                    this.logAutoTranslationIntakeState(intakeEnhance ? "bdfdb" : (mode === "bdfdb" ? "fallback" : "dom"), intake);
                    work = this.createAutoTranslationScanWork(context);
                }
                this.logSlowOperation("scan.incremental-init", sliceStartedAt, {
                    tasks: tasks.length
                }, 16);
                if (tasks.length) {
                    this.scheduleIncrementalMessageScanCallback(runSlice);
                    return;
                }
            }

            let processed = 0;
            while (index < tasks.length) {
                const inputPending = Boolean(globalThis.navigator?.scheduling?.isInputPending?.());
                const idleRemainingBeforeTask = typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
                if (processed === 0 && (inputPending || (!deadline?.didTimeout && idleRemainingBeforeTask <= 1))) break;
                const task = tasks[index++];
                const messageNode = task.messageNode;
                if (messageNode?.isConnected) {
                    try {
                        if (task.kind === "button") {
                            if (this.settings.ui?.injectMessageButtons) this.injectMessageButton(messageNode, context);
                        }
                        else if (work) {
                            let candidates = this.createDomAutoTranslationCandidatesForMessage(messageNode, context);
                            work.context.autoTranslateIntake.domCandidates += candidates.length;
                            if (intakeEnhance && candidates.length) {
                                const enhanced = this.createBdfdbAutoTranslationCandidates(context, candidates);
                                work.context.autoTranslateIntake.bdfdbEnhanced += enhanced.filter(candidate => candidate?.source === "bdfdb").length;
                                candidates = enhanced;
                            }
                            work.scanStats.candidates = Number(work.scanStats.candidates || 0) + candidates.length;
                            this.processAutoTranslationScanCandidates(work, candidates);
                        }
                    }
                    catch (error) {
                        this.warnSanitized("Incremental message scan failed", error);
                    }
                }
                processed++;
                const elapsed = this.getDiagnosticTime() - sliceStartedAt;
                const idleRemaining = typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
                if (processed >= INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE
                    || elapsed >= INCREMENTAL_MESSAGE_WORK_BUDGET_MS
                    || (processed > 0 && idleRemaining <= 1)) break;
            }

            this.logSlowOperation("scan.incremental-slice", sliceStartedAt, {
                processed,
                remaining: Math.max(0, tasks.length - index)
            }, 16);
            if (!this.isStarted || generation !== this.incrementalMessageScanGeneration) return;
            if (index < tasks.length) {
                this.scheduleIncrementalMessageScanCallback(runSlice);
                return;
            }
            if (work) {
                const finishStartedAt = this.getDiagnosticTime();
                this.finishAutoTranslationScanWork(work);
                this.logSlowOperation("scan.incremental-finish", finishStartedAt, {
                    candidates: Number(work.scanStats?.candidates || 0),
                    queued: Number(work.scanStats?.enqueued || 0)
                }, 16);
            }
        };

        this.scheduleIncrementalMessageScanCallback(runSlice);
    }

    scheduleIncrementalMessageScanCallback(callback) {
        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
            this.incrementalMessageScanIdleCallback = window.requestIdleCallback(callback, { timeout: 1000 });
            return;
        }
        this.incrementalMessageScanTimer = setTimeout(() => callback(null), 0);
        this.unrefTimer(this.incrementalMessageScanTimer);
    }

    cancelIncrementalMessageScan() {
        this.incrementalMessageScanGeneration = Number(this.incrementalMessageScanGeneration || 0) + 1;
        if (this.incrementalMessageScanIdleCallback !== null) {
            try { window.cancelIdleCallback?.(this.incrementalMessageScanIdleCallback); }
            catch {}
        }
        if (this.incrementalMessageScanTimer) clearTimeout(this.incrementalMessageScanTimer);
        this.incrementalMessageScanIdleCallback = null;
        this.incrementalMessageScanTimer = null;
    }

    getCurrentRouteKey() {
        const route = this.messageTracker.getRouteIds();
        return [route.guildId || "", route.channelId || "", route.messageId || ""].join(":");
    }

    createScanContext(options = {}) {
        const allMessageNodes = this.getScanContextMessageNodes(options);
        const context = {
            messageNodes: [],
            contentByMessage: new Map(),
            contentElementsByMessage: new Map(),
            textByElement: new Map(),
            replyTextByElement: new Map(),
            targetsByMessage: new Map(),
            rectByElement: new Map(),
            visibleByElement: new Map(),
            scrollClipByElement: new Map(),
            nearByElement: new Map(),
            priorityByElement: new Map(),
            scanRangeElements: new Set(),
            translationCacheLookupByKey: new Map(),
            bdfdbStoreByChannel: new Map(),
            dirtyOnly: Boolean(options.dirtyOnly && (options.roots?.length || options.messageNodes?.length))
        };
        context.messageNodes = this.getScanMessageNodes(allMessageNodes, context);
        return context;
    }

    getScanContextMessageNodes(options = {}) {
        if (Array.isArray(options.messageNodes)) return [...options.messageNodes];
        const roots = Array.isArray(options.roots) ? options.roots : [];
        if (roots.length) {
            const nodes = [];
            roots.forEach(root => {
                if (!root || root.isConnected === false || root.nodeType !== 1) return;
                if (this.isDiscordMessageElement(root)) {
                    nodes.push(root);
                    return;
                }
                nodes.push(...(root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR) || []));
            });
            return nodes;
        }
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
        return [...document.querySelectorAll(DISCORD_MESSAGE_NODE_SELECTOR)];
    }

    getScanMessageNodes(allMessageNodes, context = null) {
        const sorted = [...new Set(allMessageNodes || [])]
            .filter(node => node?.isConnected && node?.getBoundingClientRect);
        const visibleIndexes = [];
        sorted.forEach((node, index) => {
            if (this.isMessageNodeVisibleForScan(node, context)) visibleIndexes.push(index);
        });

        if (!visibleIndexes.length) {
            if (!this.isAutoTranslationPrefetchConfigured()) return [];
            const selected = sorted
                .filter(node => this.isMessageNodeNearForScan(node, context))
                .sort((left, right) => this.getViewportPriority(left, context) - this.getViewportPriority(right, context));
            this.rememberScanRangeElements(selected, context);
            return selected;
        }

        const prefetchRange = this.isAutoTranslationPrefetchConfigured()
            ? Math.max(this.getAutoTranslatePrefetchRange(), AUTO_TRANSLATE_EDGE_OVERSCAN_MESSAGES)
            : 0;
        const first = Math.max(0, Math.min(...visibleIndexes) - prefetchRange);
        const last = Math.min(sorted.length - 1, Math.max(...visibleIndexes) + prefetchRange);
        const selected = sorted
            .slice(first, last + 1)
            .filter(node => this.isMessageNodeVisibleForScan(node, context) || prefetchRange > 0);

        this.rememberScanRangeElements(selected, context);
        return selected.sort((left, right) => this.getViewportPriority(left, context) - this.getViewportPriority(right, context));
    }

    isMessageNodeVisibleForScan(messageNode, context = null) {
        if (this.isElementVisibleInViewportCached(messageNode, context)) return true;
        return this.getMessageContentCandidates(messageNode)
            .some(candidate => this.isElementVisibleInViewportCached(candidate, context));
    }

    isMessageNodeNearForScan(messageNode, context = null) {
        if (this.isElementNearViewport(messageNode, SCAN_VIEWPORT_BUFFER_PX, context)) return true;
        return this.getMessageContentCandidates(messageNode)
            .some(candidate => this.isElementNearViewport(candidate, SCAN_VIEWPORT_BUFFER_PX, context));
    }

    rememberScanRangeElements(elements = [], context = null) {
        if (!context?.scanRangeElements?.add) return;
        elements.forEach(element => {
            if (element) context.scanRangeElements.add(element);
        });
    }

    getCachedElementRect(element, context = null) {
        if (!element?.getBoundingClientRect) return null;
        if (!context?.rectByElement) return element.getBoundingClientRect?.();
        if (!context.rectByElement.has(element)) {
            context.rectByElement.set(element, element.getBoundingClientRect?.());
        }
        return context.rectByElement.get(element);
    }

    isElementVisibleInViewportCached(element, context = null) {
        if (!context?.visibleByElement) return this.isElementVisibleInViewport(element);
        if (!context.visibleByElement.has(element)) {
            context.visibleByElement.set(element, this.isElementVisibleForScan(element, this.getCachedElementRect(element, context), context));
        }
        return context.visibleByElement.get(element);
    }

    isElementVisibleForScan(element, rect = null, context = null) {
        if (!element?.isConnected) return false;
        const elementRect = rect || element.getBoundingClientRect?.();
        if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) return false;
        const documentHeight = typeof document !== "undefined" ? Number(document.documentElement?.clientHeight || 0) : 0;
        const documentWidth = typeof document !== "undefined" ? Number(document.documentElement?.clientWidth || 0) : 0;
        const height = typeof window !== "undefined" ? Number(window.innerHeight || documentHeight || 0) : documentHeight;
        const width = typeof window !== "undefined" ? Number(window.innerWidth || documentWidth || 0) : documentWidth;
        if (!(elementRect.bottom > 0 && elementRect.right > 0 && elementRect.top < height && elementRect.left < width)) return false;

        let current = element;
        let depth = 0;
        while (current && current.nodeType === 1 && depth < 12) {
            if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return false;
            current = current.parentElement;
            depth++;
        }
        // Same clipping rule as the draw step, so a message behind the header or composer is not "visible".
        return this.isRectInsideScrollClips(element, elementRect, context, { checkHidden: true });
    }

    isElementNearViewport(element, bufferPx = 0, context = null) {
        if (!element?.isConnected) return false;
        const cacheKey = `${Number(bufferPx) || 0}`;
        let cacheByBuffer = context?.nearByElement?.get(element);
        if (cacheByBuffer?.has(cacheKey)) return cacheByBuffer.get(cacheKey);

        const rect = this.getCachedElementRect(element, context);
        if (!rect || rect.width <= 0 || rect.height <= 0) return false;
        const height = window.innerHeight || document.documentElement.clientHeight || 0;
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        const buffer = Math.max(0, Number(bufferPx) || 0);
        const result = rect.bottom > -buffer
            && rect.right > -buffer
            && rect.top < height + buffer
            && rect.left < width + buffer;
        if (context?.nearByElement) {
            if (!cacheByBuffer) {
                cacheByBuffer = new Map();
                context.nearByElement.set(element, cacheByBuffer);
            }
            cacheByBuffer.set(cacheKey, result);
        }
        return result;
    }

    getViewportPriority(element, context = null) {
        if (!element?.isConnected) return Number.MAX_SAFE_INTEGER;
        if (context?.priorityByElement?.has(element)) return context.priorityByElement.get(element);
        const rect = this.getCachedElementRect(element, context);
        if (!rect || rect.width <= 0 || rect.height <= 0) return Number.MAX_SAFE_INTEGER;
        const height = window.innerHeight || document.documentElement.clientHeight || 0;
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        const visible = context
            ? this.isElementVisibleInViewportCached(element, context)
            : this.isElementVisibleInViewport(element, rect);
        const horizontalOffset = rect.right <= 0
            ? Math.abs(rect.right)
            : rect.left >= width
                ? rect.left - width
                : 0;
        const verticalOffset = rect.bottom <= 0
            ? Math.abs(rect.bottom)
            : rect.top >= height
                ? rect.top - height
                : 0;
        const priority = visible
            ? Math.max(0, rect.top) + (Math.max(0, rect.left) * 0.01)
            : AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE + verticalOffset + (horizontalOffset * 0.15);
        context?.priorityByElement?.set(element, priority);
        return priority;
    }

    isAutoTranslationTargetInScanRange(element, context = null) {
        return this.isElementVisibleInViewportCached(element, context)
            || this.isElementNearViewport(element, SCAN_VIEWPORT_BUFFER_PX, context)
            || this.isElementInsideScanRangeMessage(element, context);
    }

    isElementInsideScanRangeMessage(element, context = null) {
        if (!element || !context?.scanRangeElements?.size) return false;
        if (context.scanRangeElements.has(element)) return true;
        const closestMessage = element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR);
        if (closestMessage && context.scanRangeElements.has(closestMessage)) return true;
        for (const messageNode of context.scanRangeElements) {
            if (messageNode?.contains?.(element)) return true;
        }
        return false;
    }

    patchMessageContextMenu() {
        const bdApi = globalThis.BdApi;
        if (!this.settings.ui.injectMessageContextMenu || !bdApi?.ContextMenu?.patch || !bdApi.ContextMenu?.buildMenuChildren) return;

        const patch = (tree, props) => {
            const items = [{
                id: "dait-translate-message",
                label: this.t("translateMenu", { targetLanguage: this.getDisplayLanguage(this.settings.translation.targetLanguage) }),
                action: () => this.translateMessageFromContextTarget(props?.target)
            }];
            if (this.settings.ui?.historyBackfillEnabled === true) {
                items.push({
                    id: "dait-history-backfill",
                    label: this.t("historyBackfillContextMenu"),
                    action: () => this.runExplicitHistoryBackfillFromUi(null, { source: "context-menu" })
                });
            }
            const item = bdApi.ContextMenu.buildMenuChildren([{
                type: "group",
                items
            }])?.[0];

            if (item) this.appendContextMenuItem(tree, item);
        };

        try {
            this.unpatches.push(bdApi.ContextMenu.patch(/message/i, patch));
        }
        catch (error) {
            this.showToast(this.t("contextPatchFailed", { error: this.formatError(error) }), "error");
        }
    }

    unpatchContextMenus() {
        this.unpatches.splice(0).forEach(unpatch => {
            try {
                unpatch?.();
            }
            catch (error) {
                this.warnSanitized("Failed to unpatch context menu", error);
            }
        });
    }

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
    }

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
    }

    injectPolishButton() {
        this.injectInputButtons({ forcePolish: true });
    }

    injectQuickSettingsButtons(options = {}) {
        if (typeof document === "undefined" || !document.body) return;
        if (!this.settings.ui?.showQuickSettingsPanelButton) {
            if (this.quickSettingsRetryTimer) clearTimeout(this.quickSettingsRetryTimer);
            if (this.quickSettingsOpenTimer) clearTimeout(this.quickSettingsOpenTimer);
            this.quickSettingsRetryTimer = null;
            this.quickSettingsOpenTimer = null;
            this.quickSettingsPanelSettingsButton = null;
            this.quickSettingsPanelContainer = null;
            this.quickSettingsPanelTargetLookupBlockedUntil = 0;
            document.querySelectorAll?.(".dait-quick-settings-panel")?.forEach(node => node.remove());
            document.querySelectorAll?.(".dait-quick-settings-rail")?.forEach(node => node.remove());
            return;
        }

        const now = Date.now();
        const force = Boolean(options.forceLookup || options.force);
        if (!force && now - Number(this.quickSettingsLastInjectAt || 0) < QUICK_SETTINGS_INJECT_MIN_INTERVAL_MS) {
            const existing = document.querySelector?.(".dait-quick-settings-panel");
            if (existing && existing.isConnected !== false) return;
        }
        this.quickSettingsLastInjectAt = now;
        document.querySelectorAll?.(".dait-quick-settings-rail")?.forEach(node => node.remove());
        this.injectQuickSettingsPanelButton(options);
    }

    injectQuickSettingsPanelButton(options = {}) {
        if (this.isDiscordSettingsSurfaceOpen()) {
            this.logQuickSettingsDiagnostic("inject.target", "blocked", { reason: "discord-settings-open" });
            return;
        }
        const settingsButton = this.findDiscordUserSettingsButton({ force: Boolean(options.forceLookup) });
        const container = this.getDiscordUserSettingsButtonContainer(settingsButton);
        if (!container?.appendChild) {
            this.quickSettingsPanelSettingsButton = null;
            this.quickSettingsPanelContainer = null;
            this.logQuickSettingsDiagnostic("inject.target", "retry", {
                reason: settingsButton ? "missing-container" : "missing-settings-button"
            });
            this.scheduleQuickSettingsButtonRetry();
            return;
        }

        const existing = document.querySelector?.(".dait-quick-settings-panel");
        if (existing) {
            if (existing.parentElement === container) {
                this.syncDiscordThemeClasses(existing, settingsButton || container);
                return;
            }
            this.logQuickSettingsDiagnostic("inject.target", "reparent", {
                reason: "stale-parent"
            });
            existing.remove?.();
        }

        const button = this.createQuickSettingsButton("panel", settingsButton || container);
        const reference = this.getQuickSettingsInsertReference(container, settingsButton);
        if (typeof container.insertBefore === "function" && reference) container.insertBefore(button, reference);
        else container.appendChild(button);
        this.logQuickSettingsDiagnostic("inject.target", "inserted", {
            hasSettingsButton: Boolean(settingsButton),
            containerChildCount: this.getElementChildCount(container)
        });
    }

    scheduleQuickSettingsButtonRetry(delayMs = 1000) {
        if (this.quickSettingsRetryTimer || !this.isStarted || !this.settings.ui?.showQuickSettingsPanelButton) return;
        this.quickSettingsRetryTimer = setTimeout(() => {
            this.quickSettingsRetryTimer = null;
            if (!this.isStarted || !this.settings.ui?.showQuickSettingsPanelButton) return;
            this.injectQuickSettingsPanelButton({ forceLookup: true });
        }, Math.max(250, Number(delayMs) || 1000));
    }

    createQuickSettingsButton(variant, themeAnchor = null) {
        const button = document.createElement("button");
        button.className = `dait-quick-settings-button dait-quick-settings-${variant}`;
        this.syncDiscordThemeClasses(button, themeAnchor);
        button.type = "button";
        button.textContent = "AI";
        button.title = this.t("quickSettingsOpen");
        button.setAttribute("aria-label", this.t("quickSettingsOpen"));
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-haspopup", "dialog");
        ["mousedown", "mouseup"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation?.();
            });
        });
        button.addEventListener("pointerdown", event => this.handleQuickSettingsButtonEvent(event, variant), true);
        button.addEventListener("pointerup", event => this.handleQuickSettingsButtonEvent(event, variant), true);
        button.addEventListener("click", event => {
            this.handleQuickSettingsButtonEvent(event, variant);
        }, true);
        return button;
    }

    handleQuickSettingsButtonEvent(event, variant = "panel") {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        const now = Date.now();
        const elapsedMs = now - Number(this.quickSettingsLastOpenAt || 0);
        this.logQuickSettingsDiagnostic("button.event", "received", {
            eventType: event?.type || "",
            variant,
            elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0
        });
        if (elapsedMs < 300) {
            this.logQuickSettingsDiagnostic("button.event", "deduped", {
                eventType: event?.type || "",
                variant,
                elapsedMs
            });
            return;
        }
        this.quickSettingsLastOpenAt = now;
        this.logQuickSettingsDiagnostic("button.event", "scheduled", {
            eventType: event?.type || "",
            variant
        });
        if (this.quickSettingsOpenTimer) clearTimeout(this.quickSettingsOpenTimer);
        this.quickSettingsOpenTimer = setTimeout(() => {
            this.quickSettingsOpenTimer = null;
            if (!this.isStarted || !this.settings.ui?.showQuickSettingsPanelButton) return;
            this.openQuickSettingsPanel(variant, event?.currentTarget || event?.target || null);
        }, 0);
    }

    findDiscordUserSettingsButton(options = {}) {
        const cached = this.quickSettingsPanelSettingsButton;
        if (
            cached
            && this.isNodeConnected(cached)
            && cached.parentElement?.appendChild
            && this.isLikelyDiscordUserSettingsButton(cached)
        ) {
            return cached;
        }
        this.quickSettingsPanelSettingsButton = null;
        this.quickSettingsPanelContainer = null;
        if (this.isDiscordSettingsSurfaceOpen()) return null;
        if (!options.force && Date.now() < Number(this.quickSettingsPanelTargetLookupBlockedUntil || 0)) return null;
        const roots = this.getDiscordUserSettingsButtonLookupRoots();
        const rootCandidates = roots.flatMap(root => [...(root.querySelectorAll?.("button, [role='button']") || [])]);
        const canFallbackToDocument = !roots.length || Boolean(options.force);
        const fallbackCandidates = canFallbackToDocument
            ? [...(document.querySelectorAll?.("button, [role='button']") || [])]
            : [];
        const candidates = [...new Set([...rootCandidates, ...fallbackCandidates])];
        const found = candidates.find(button => this.isLikelyDiscordUserSettingsButton(button)) || null;
        if (found) {
            this.quickSettingsPanelSettingsButton = found;
            this.quickSettingsPanelContainer = this.getDiscordUserSettingsButtonContainer(found);
            this.quickSettingsPanelTargetLookupBlockedUntil = 0;
        }
        else {
            this.logQuickSettingsDiagnostic("inject.lookup", "miss", {
                candidateCount: candidates.length,
                samples: candidates.slice(0, 8).map(button => this.getDiscordButtonLabel(button).slice(0, 80)).filter(Boolean)
            });
            this.quickSettingsPanelTargetLookupBlockedUntil = Date.now() + 1000;
        }
        return found;
    }

    getDiscordUserSettingsButtonLookupRoots() {
        if (typeof document === "undefined" || !document.querySelectorAll) return [];
        const roots = [];
        const addRoot = root => {
            if (!root || roots.includes(root) || this.isOwnPluginElement(root)) return;
            if (!root.querySelectorAll) return;
            roots.push(root);
        };
        addRoot(this.quickSettingsPanelContainer);
        [...(document.querySelectorAll?.(DISCORD_USER_PANEL_LOOKUP_ROOT_SELECTOR) || [])].forEach(root => {
            if (this.isLikelyDiscordUserPanelRoot(root)) addRoot(root);
        });
        return roots;
    }

    isLikelyDiscordUserPanelRoot(root) {
        if (!root || root.nodeType !== 1) return false;
        const rect = root.getBoundingClientRect?.();
        if (!rect || (!rect.width && !rect.height)) return true;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
        if (viewportWidth && rect.left > Math.min(460, viewportWidth * 0.5)) return false;
        if (viewportHeight && rect.top < viewportHeight - 260) return false;
        return true;
    }

    isLikelyDiscordUserSettingsButton(button) {
        if (!button || button.closest?.(".dait-settings, .dait-quick-settings-modal-root, .dait-quick-settings-button")) return false;
        const buttonLabel = this.getDiscordButtonLabel(button).toLowerCase();
        const exactSettingsLabel = /user settings|用户设置|使用者設定|ユーザー設定|사용자 설정|param[eè]tres utilisateur|impostazioni utente|ajustes de usuario|configura[cç][aã]o do usu[aá]rio|настройки пользователя/i.test(buttonLabel);
        const genericSettingsLabel = /(^|[\s_-])settings([\s_-]|$)|设置|設定/i.test(buttonLabel);
        if (!exactSettingsLabel && !genericSettingsLabel) return false;
        const rect = button.getBoundingClientRect?.();
        if (!exactSettingsLabel && rect && (rect.width || rect.height)) {
            const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0);
            const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0);
            if (viewportWidth && rect.left > Math.min(420, viewportWidth * 0.45)) return false;
            if (viewportHeight && rect.top < viewportHeight - 120) return false;
        }
        return true;
    }

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
    }

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
    }

    getDiscordUserSettingsButtonContainer(settingsButton) {
        if (!settingsButton) return null;
        let current = settingsButton.parentElement || null;
        const fallback = current;
        let depth = 0;
        while (current && current !== document.body && depth < 6) {
            const controls = [...(current.querySelectorAll?.("button, [role='button']") || [])]
                .filter(button => button && !button.closest?.(".dait-settings, .dait-quick-settings-modal-root, .dait-quick-settings-button"));
            if (controls.length >= 2 && controls.length <= 8) return current;
            current = current.parentElement;
            depth++;
        }
        return fallback;
    }

    getQuickSettingsInsertReference(container, settingsButton) {
        if (!container || !settingsButton) return null;
        let current = settingsButton;
        while (current && current.parentElement && current.parentElement !== container) {
            current = current.parentElement;
        }
        return current?.parentElement === container ? current : null;
    }

    openQuickSettingsPanel(source = "quick", launcher = null) {
        if (typeof document === "undefined" || !document.body) {
            this.logQuickSettingsDiagnostic("open.start", "blocked", { reason: "missing-document-body", source });
            return null;
        }
        if (!this.isStarted) return null;
        const existingRoots = this.getQuickSettingsModalRoots();
        existingRoots.slice(1).forEach(root => {
            this.logQuickSettingsDiagnostic("open.start", "orphan-removed", {
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
                    this.logQuickSettingsDiagnostic("open.start", "stale-existing", {
                        source,
                        reason: "empty-dialog",
                        ...this.getQuickSettingsModalDebugMeta(existing, existingDialog)
                    });
                    existing.remove?.();
                }
                else {
                document.body.appendChild(existing);
                this.quickSettingsModalRoot = existing;
                if (launcher?.focus) {
                    this.quickSettingsPreviousFocus = launcher;
                }
                else if (!existing.contains?.(document.activeElement)) {
                    this.quickSettingsPreviousFocus = document.activeElement || this.quickSettingsPreviousFocus || null;
                }
                this.setQuickSettingsLauncherButton(launcher || this.quickSettingsPreviousFocus || null, true);
                this.syncQuickSettingsThemeTree(existing);
                this.bindQuickSettingsModalKeydown(existing, existingDialog);
                this.syncQuickSettingsScrollPosition(existingDialog);
                this.bindSettingsScrollTracking(existingDialog.querySelector?.(".dait-settings"), existingDialog.querySelector?.(".dait-quick-settings-body"));
                this.focusQuickSettingsInitialControl(existingDialog);
                this.logQuickSettingsDiagnostic("open.start", "reuse-existing", {
                    source,
                    ...this.getQuickSettingsModalDebugMeta(existing, existingDialog)
                });
                this.scheduleQuickSettingsModalVerify(existing, existingDialog);
                return existing;
                }
            }
            else {
                this.logQuickSettingsDiagnostic("open.start", "stale-existing", {
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
            this.quickSettingsPreviousFocus = launcher?.focus ? launcher : document.activeElement || null;
            this.logQuickSettingsDiagnostic("open.start", "start", {
                source,
                viewportWidth: Number((typeof window !== "undefined" ? window.innerWidth : 0) || document.documentElement?.clientWidth || 0),
                viewportHeight: Number((typeof window !== "undefined" ? window.innerHeight : 0) || document.documentElement?.clientHeight || 0)
            });

            root = document.createElement("div");
            root.className = "dait-quick-settings-modal-root";
            root.dataset.daitQuickSettingsSource = source;
            this.setQuickSettingsLauncherButton(launcher || this.quickSettingsPreviousFocus || null, true);
            this.applyDiscordThemeData(root, launcher || document.body);

            const backdrop = document.createElement("div");
            backdrop.className = "dait-quick-settings-backdrop";
            root.appendChild(backdrop);

            dialog = document.createElement("div");
            dialog.className = "dait-quick-settings-dialog";
            dialog.setAttribute("role", "dialog");
            dialog.setAttribute("aria-modal", "true");
            dialog.setAttribute("aria-label", this.t("settingsTitle"));

            const header = document.createElement("div");
            header.className = "dait-quick-settings-header";
            const title = document.createElement("h2");
            title.className = "dait-quick-settings-title";
            title.id = "dait-quick-settings-title";
            title.textContent = this.t("settingsTitle");
            header.appendChild(title);
            dialog.setAttribute("aria-labelledby", title.id);

            const close = document.createElement("button");
            close.className = "dait-quick-settings-close";
            close.type = "button";
            close.textContent = "\u00d7";
            close.title = this.t("quickSettingsClose");
            close.setAttribute("aria-label", this.t("quickSettingsClose"));
            close.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                this.closeQuickSettingsPanel(root, "button");
            });
            header.appendChild(close);
            dialog.appendChild(header);

            const body = document.createElement("div");
            body.className = "dait-quick-settings-body";

            const panelStartedAt = Date.now();
            try {
                const panel = this.getSettingsPanel({ quickSettings: true });
                body.appendChild(panel);
                this.bindSettingsScrollTracking(panel, body);
                this.logQuickSettingsDiagnostic("panel.build", "success", {
                    source,
                    ms: Date.now() - panelStartedAt,
                    sectionCount: this.getQuickSettingsPanelSectionCount(panel),
                    dialogChildCount: this.getElementChildCount(dialog),
                    bodyChildCount: this.getElementChildCount(body)
                });
            }
            catch (error) {
                body.appendChild(this.createQuickSettingsErrorPanel(error));
                this.logQuickSettingsDiagnostic("panel.build", "error", {
                    source,
                    ms: Date.now() - panelStartedAt,
                    errorName: error?.name || "",
                    errorText: this.formatError(error)
                });
                this.showToast(this.t("quickSettingsOpenFailed", { error: this.formatError(error) }), "error");
            }
            dialog.appendChild(body);

            const footer = document.createElement("div");
            footer.className = "dait-quick-settings-footer";
            const done = document.createElement("button");
            done.className = "dait-quick-settings-done";
            done.type = "button";
            done.textContent = this.t("quickSettingsDone");
            done.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                this.closeQuickSettingsPanel(root, "done");
            });
            footer.appendChild(done);
            dialog.appendChild(footer);

            dialog.addEventListener("pointerdown", event => event.stopPropagation());
            root.addEventListener("pointerdown", event => {
                if (event.target === root || event.target === backdrop) this.closeQuickSettingsPanel(root, "backdrop");
            });

            root.appendChild(dialog);
            this.quickSettingsModalRoot = root;
            this.bindQuickSettingsModalKeydown(root, dialog);
            document.body.appendChild(root);
            this.syncQuickSettingsThemeTree(root);
            this.syncQuickSettingsScrollPosition(dialog);
            this.focusQuickSettingsInitialControl(dialog);
            this.logQuickSettingsDiagnostic("dom.attach", "success", {
                source,
                ...this.getQuickSettingsModalDebugMeta(root, dialog)
            });
            this.scheduleQuickSettingsModalVerify(root, dialog);
            return root;
        }
        catch (error) {
            if (this.quickSettingsModalKeydown && typeof document !== "undefined") {
                document.removeEventListener?.("keydown", this.quickSettingsModalKeydown, true);
            }
            this.quickSettingsModalKeydown = null;
            if (root?.remove) root.remove();
            if (!root || root === this.quickSettingsModalRoot) this.quickSettingsModalRoot = null;
            this.logQuickSettingsDiagnostic("open.error", "error", {
                source,
                errorName: error?.name || "",
                errorText: this.formatError(error),
                hasRoot: Boolean(root),
                hasDialog: Boolean(dialog)
            });
            this.showToast(this.t("quickSettingsOpenFailed", { error: this.formatError(error) }), "error");
            return null;
        }
    }

    bindQuickSettingsModalKeydown(root, dialog) {
        if (this.quickSettingsModalKeydown && typeof document !== "undefined") {
            document.removeEventListener?.("keydown", this.quickSettingsModalKeydown, true);
        }
        this.quickSettingsModalKeydown = event => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                this.closeQuickSettingsPanel(root, "escape");
                return;
            }
            if (event.key === "Tab") {
                this.trapQuickSettingsFocus(dialog, event);
            }
        };
        document.addEventListener?.("keydown", this.quickSettingsModalKeydown, true);
    }

    setQuickSettingsLauncherButton(button, expanded) {
        const previous = this.quickSettingsLauncherButton;
        if (previous && previous !== button) {
            previous.classList?.remove?.("dait-quick-settings-button-active");
            previous.setAttribute?.("aria-expanded", "false");
        }
        this.quickSettingsLauncherButton = expanded && button?.focus ? button : null;
        if (!button?.setAttribute) return;
        button.classList?.toggle?.("dait-quick-settings-button-active", Boolean(expanded));
        button.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    focusQuickSettingsInitialControl(dialog) {
        const focusTarget = dialog?.querySelector?.(".dait-quick-settings-close")
            || this.getQuickSettingsFocusableElements(dialog)[0]
            || dialog;
        try {
            focusTarget?.focus?.({ preventScroll: true });
        }
        catch {
            try { focusTarget?.focus?.(); }
            catch {}
        }
    }

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
    }

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
    }

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
        return [...new Set([...queried, ...fallback])].filter(element => this.isFocusableQuickSettingsElement(element));
    }

    isFocusableQuickSettingsElement(element) {
        if (!element || element.disabled || element.hidden || element.removed) return false;
        const tag = String(element.tagName || "").toLowerCase();
        if (["button", "input", "select", "textarea", "a"].includes(tag)) return true;
        const tabindex = element.getAttribute?.("tabindex");
        return tabindex !== undefined && tabindex !== null && tabindex !== "-1";
    }

    createQuickSettingsErrorPanel(error) {
        const panel = document.createElement("div");
        panel.className = "dait-quick-settings-error";
        const title = document.createElement("h3");
        title.textContent = this.t("quickSettingsFallbackTitle");
        const detail = document.createElement("p");
        detail.textContent = this.t("quickSettingsOpenFailed", { error: this.formatError(error) });
        const hint = document.createElement("p");
        hint.textContent = this.t("quickSettingsFallbackHint");
        panel.appendChild(title);
        panel.appendChild(detail);
        panel.appendChild(hint);
        return panel;
    }

    syncDiscordThemeClasses(target, anchor = null) {
        if (!target?.classList) return "";
        DISCORD_THEME_CLASSES.forEach(theme => target.classList.remove?.(theme));
        const themeClass = this.applyDiscordThemeData(target, anchor);
        target.classList.add?.(themeClass);
        return themeClass;
    }

    syncQuickSettingsThemeTree(root, anchor = null) {
        if (!root) return "";
        const themeSource = this.getDiscordThemeSource(anchor);
        const themeClass = themeSource.themeClass || DISCORD_DEFAULT_THEME_CLASS;
        const nodes = [
            root,
            this.findQuickSettingsDialog(root),
            root.querySelector?.(".dait-quick-settings-backdrop"),
            root.querySelector?.(".dait-quick-settings-header"),
            root.querySelector?.(".dait-quick-settings-body"),
            root.querySelector?.(".dait-quick-settings-footer"),
            root.querySelector?.(".dait-quick-settings-title"),
            root.querySelector?.(".dait-quick-settings-close"),
            root.querySelector?.(".dait-quick-settings-done"),
            root.querySelector?.(".dait-quick-settings-error"),
            ...(root.querySelectorAll?.(".dait-settings") || [])
        ].filter(Boolean);
        [...new Set(nodes)].forEach(node => {
            if (!node?.classList) return;
            DISCORD_THEME_CLASSES.forEach(theme => node.classList.remove?.(theme));
            node.classList.add?.(themeClass);
            if (node.dataset) node.dataset.daitDiscordTheme = themeClass.replace(/^theme-/, "");
            this.copyDiscordThemeVariables(node, themeSource.node);
        });
        return themeClass;
    }

    applyDiscordThemeData(target, anchor = null) {
        if (!target) return DISCORD_DEFAULT_THEME_CLASS;
        const themeSource = this.getDiscordThemeSource(anchor);
        const themeClass = themeSource.themeClass || DISCORD_DEFAULT_THEME_CLASS;
        if (target.dataset) target.dataset.daitDiscordTheme = themeClass.replace(/^theme-/, "");
        this.copyDiscordThemeVariables(target, themeSource.node);
        return themeClass;
    }

    refreshDiscordThemeClasses() {
        if (typeof document === "undefined") return;
        this.discordThemeCacheEpoch++;
        const selector = ".dait-settings, .dait-quick-settings-button, .dait-quick-settings-modal-root, .dait-polish-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-message-button, .dait-polish-result-panel, .dait-polish-restore-control, [data-dait-settings-modal='true'], [data-dait-settings-modal-root='true']";
        const queried = [...(document.querySelectorAll?.(selector) || [])];
        [...new Set(queried)].forEach(node => {
            if (this.elementHasClassName(node, "dait-quick-settings-modal-root")) this.syncQuickSettingsThemeTree(node);
            else this.syncDiscordThemeClasses(node);
        });
        if (this.quickSettingsModalRoot) this.syncQuickSettingsThemeTree(this.quickSettingsModalRoot);
        if (this.polishResultPanel) this.syncDiscordThemeClasses(this.polishResultPanel);
        if (this.polishRestoreControl) this.syncDiscordThemeClasses(this.polishRestoreControl);
    }

    getDiscordThemeClass(anchor = null) {
        return this.getDiscordThemeSource(anchor).themeClass || DISCORD_DEFAULT_THEME_CLASS;
    }

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
    }

    getDiscordThemeCandidates(anchor = null) {
        if (typeof document === "undefined") return [];
        const candidates = [];
        const addCandidate = node => {
            if (!node || candidates.includes(node) || this.isPluginThemeCandidate(node)) return;
            candidates.push(node);
        };
        const globalCandidates = this.getDiscordThemeGlobalCandidates();
        globalCandidates.selectors.forEach(addCandidate);
        let current = anchor && typeof anchor === "object" ? anchor : null;
        let guard = 0;
        while (current && guard < 12) {
            addCandidate(current);
            current = current.parentElement;
            guard++;
        }
        addCandidate(document.body);
        addCandidate(document.documentElement);
        for (const node of globalCandidates.themed) addCandidate(node);
        return candidates;
    }

    getDiscordThemeGlobalCandidates() {
        // Theme candidates require two full-document queries; the theme sync runs once
        // per plugin button per scan, so memoize the document-wide part briefly. The
        // cache is invalidated by theme mutations (see refreshDiscordThemeClasses).
        const now = Date.now();
        const cached = this.discordThemeGlobalCandidatesCache;
        if (cached && cached.epoch === this.discordThemeCacheEpoch && now - cached.at < DISCORD_THEME_CACHE_TTL_MS) {
            return cached;
        }
        const selectors = ["#app-mount", "[class*='appMount']", "[class*='app-mount']", "[data-theme]", "[theme]"]
            .map(selector => document.querySelector?.(selector))
            .filter(Boolean);
        const themed = [...(document.querySelectorAll?.("[class*='theme-'], [data-theme], [theme]") || [])];
        const snapshot = { at: now, epoch: this.discordThemeCacheEpoch, selectors, themed };
        this.discordThemeGlobalCandidatesCache = snapshot;
        return snapshot;
    }

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
        if (this.elementHasClassName(node, "dait-public-bilingual-button")) return true;
        if (this.elementHasClassName(node, "dait-polish-restore-button")) return true;
        if (this.elementHasClassName(node, "dait-input-action-menu-button")) return true;
        if (this.elementHasClassName(node, "dait-input-action-menu")) return true;
        if (this.elementHasClassName(node, "dait-message-button")) return true;
        if (this.elementHasClassName(node, "dait-polish-result-panel")) return true;
        if (this.elementHasClassName(node, "dait-polish-restore-control")) return true;
        if (this.elementHasClassName(node, "dait-settings")) return true;
        return Boolean(node.closest?.(".dait-quick-settings-modal-root, .dait-settings, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-box"));
    }

    elementHasPluginClassPrefix(node, prefix) {
        if (!node || !prefix) return false;
        try {
            if (node.classList && [...node.classList].some(name => String(name || "").startsWith(prefix))) return true;
        }
        catch {}
        const className = typeof node.className === "string" ? node.className : String(node.className?.baseVal || "");
        return className.split(/\s+/).some(name => name.startsWith(prefix));
    }

    getElementDiscordThemeClass(node) {
        return this.getElementDiscordThemeExplicitClass(node) || this.getElementDiscordThemeClassNameClass(node);
    }

    getElementDiscordThemeExplicitClass(node) {
        const rawTheme = String(node?.dataset?.theme || node?.getAttribute?.("data-theme") || node?.getAttribute?.("theme") || "").toLowerCase();
        return this.normalizeDiscordThemeClass(rawTheme);
    }

    getElementDiscordThemeClassNameClass(node) {
        const knownThemeClasses = ["theme-midnight", "theme-onyx", "theme-darker", "theme-ash", "theme-light", "theme-dark"];
        const classListTheme = knownThemeClasses.find(theme => this.elementHasClassName(node, theme));
        if (classListTheme) return this.normalizeDiscordThemeClass(classListTheme);
        const className = String(node?.className?.baseVal || node?.className || "").toLowerCase();
        return this.normalizeDiscordThemeClass(className);
    }

    normalizeDiscordThemeClass(value) {
        const text = String(value || "").toLowerCase();
        if (!text) return "";
        if (/(^|[\s_-])(midnight|onyx)([\s_-]|$)/.test(text) || /theme-(midnight|onyx)(\s|$)/.test(text)) return "theme-midnight";
        if (/(^|[\s_-])(darker|ash)([\s_-]|$)/.test(text) || /theme-(darker|ash)(\s|$)/.test(text)) return "theme-darker";
        if (/(^|[\s_-])light([\s_-]|$)/.test(text) || /theme-light(\s|$)/.test(text)) return "theme-light";
        if (/(^|[\s_-])dark([\s_-]|$)/.test(text) || /theme-dark(\s|$)/.test(text)) return "theme-dark";
        return "";
    }

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
    }

    getDiscordThemeVariableValues(source = null) {
        // Resolving the 51 theme variables walks computed styles of several nodes; the
        // result is identical for every button synced in one pass, so memoize briefly
        // per source node (invalidated by theme mutations and a short TTL).
        const now = Date.now();
        const sourceKey = source || null;
        const cached = this.discordThemeVariableValuesCache;
        if (cached && cached.source === sourceKey && cached.epoch === this.discordThemeCacheEpoch
            && now - cached.at < DISCORD_THEME_CACHE_TTL_MS) {
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
        this.discordThemeVariableValuesCache = { at: now, epoch: this.discordThemeCacheEpoch, source: sourceKey, values };
        return values;
    }

    getDiscordThemeVariableSources(source = null) {
        if (typeof document === "undefined") return [];
        const sources = [];
        const add = node => {
            if (!node || sources.includes(node) || this.isPluginThemeCandidate(node)) return;
            sources.push(node);
        };
        let current = source && typeof source === "object" ? source : null;
        let guard = 0;
        while (current && guard < 16) {
            add(current);
            current = current.parentElement;
            guard++;
        }
        this.getDiscordThemeCandidates().forEach(add);
        add(document.body);
        add(document.documentElement);
        return sources;
    }

    elementHasAnyDiscordThemeClass(node) {
        return Boolean(this.getElementDiscordThemeClass(node));
    }

    elementHasClassName(node, className) {
        if (!node || !className) return false;
        if (node.classList?.contains?.(className)) return true;
        return String(node.className || "").split(/\s+/).includes(className);
    }

    findQuickSettingsDialog(root) {
        if (!root) return null;
        const direct = root.querySelector?.(".dait-quick-settings-dialog");
        if (direct) return direct;
        return [...(root.children || [])].find(child => String(child.className || "").split(/\s+/).includes("dait-quick-settings-dialog")) || null;
    }

    getQuickSettingsModalRoots() {
        if (typeof document === "undefined") return [];
        try {
            return [...(document.querySelectorAll?.(".dait-quick-settings-modal-root") || [])];
        }
        catch {
            const single = document.querySelector?.(".dait-quick-settings-modal-root");
            return single ? [single] : [];
        }
    }

    getQuickSettingsPanelSectionCount(panel) {
        try {
            return panel?.querySelectorAll?.("[data-dait-settings-section]")?.length || 0;
        }
        catch {
            return 0;
        }
    }

    getElementChildCount(node) {
        const count = Number(node?.childElementCount);
        if (Number.isFinite(count) && count >= 0) return count;
        return Array.isArray(node?.children) ? node.children.length : 0;
    }

    isNodeConnected(node) {
        if (!node) return false;
        if (typeof node.isConnected === "boolean") return node.isConnected;
        try {
            if (document?.body?.contains?.(node)) return true;
        }
        catch {}
        return Boolean(node.parentElement);
    }

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
    }

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
    }

    isQuickSettingsPanelOpen() {
        if (this.quickSettingsModalRoot && this.isNodeConnected(this.quickSettingsModalRoot)) return true;
        if (typeof document === "undefined") return false;
        try {
            return Boolean(document.querySelector?.(".dait-quick-settings-modal-root"));
        }
        catch {
            return false;
        }
    }

    resumeQuickSettingsDeferredWork(reason = "close") {
        if (!this.isStarted || this.isQuickSettingsPanelOpen()) return;
        const resumeScan = Boolean(this.quickSettingsScanDeferred);
        const resumeRender = Boolean(this.quickSettingsRenderDeferred && this.autoTranslationRenderQueue.length);
        this.quickSettingsScanDeferred = false;
        this.quickSettingsRenderDeferred = false;
        if (resumeScan) {
            this.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, trailing: true });
        }
        if (resumeRender) {
            this.scheduleAutoTranslationRenderQueue(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS);
        }
        if (resumeScan || resumeRender) {
            this.logDiagnostic("quick.settings.resume", "ok", {
                reason,
                scan: resumeScan,
                render: resumeRender,
                renderQueue: this.autoTranslationRenderQueue.length
            });
        }
    }

    getQuickSettingsModalDebugMeta(root, dialog = null) {
        const currentDialog = dialog || this.findQuickSettingsDialog(root);
        const panel = currentDialog?.querySelector?.(".dait-settings") || [...(currentDialog?.children || [])].find(child => String(child.className || "").split(/\s+/).includes("dait-settings")) || null;
        const fallback = currentDialog?.querySelector?.(".dait-quick-settings-error") || [...(currentDialog?.children || [])].find(child => String(child.className || "").split(/\s+/).includes("dait-quick-settings-error")) || null;
        return {
            rootConnected: this.isNodeConnected(root),
            dialogConnected: this.isNodeConnected(currentDialog),
            panelConnected: this.isNodeConnected(panel),
            fallbackConnected: this.isNodeConnected(fallback),
            hasDialog: Boolean(currentDialog),
            hasPanel: Boolean(panel),
            hasFallback: Boolean(fallback),
            rootChildCount: this.getElementChildCount(root),
            dialogChildCount: this.getElementChildCount(currentDialog),
            panelSectionCount: this.getQuickSettingsPanelSectionCount(panel),
            rootRect: this.getElementRectSummary(root),
            dialogRect: this.getElementRectSummary(currentDialog),
            panelRect: this.getElementRectSummary(panel),
            rootStyle: this.getElementStyleSummary(root),
            dialogStyle: this.getElementStyleSummary(currentDialog),
            panelStyle: this.getElementStyleSummary(panel)
        };
    }

    scheduleQuickSettingsModalVerify(root, dialog = null) {
        this.cancelQuickSettingsModalVerify();
        const token = ++this.quickSettingsVerifyToken;
        const verify = () => {
            if (token !== this.quickSettingsVerifyToken) return;
            this.quickSettingsVerifyRaf = null;
            this.quickSettingsVerifyTimer = null;
            if (!this.isStarted) return;
            if (root !== this.quickSettingsModalRoot) return;
            if (!root || !this.isNodeConnected(root)) return;
            const currentDialog = dialog || this.findQuickSettingsDialog(root);
            const meta = this.getQuickSettingsModalDebugMeta(root, currentDialog);
            if (!meta.hasDialog) {
                this.logQuickSettingsDiagnostic("visible.verify", "missing-dialog", meta);
                this.closeQuickSettingsPanel(root, "verify-missing-dialog");
                this.showToast(this.t("quickSettingsOpenFailed", { error: "missing dialog" }), "error");
                return;
            }
            if (!meta.hasPanel && !meta.hasFallback) {
                this.logQuickSettingsDiagnostic("visible.verify", "empty-dialog", meta);
                this.closeQuickSettingsPanel(root, "verify-empty-dialog");
                this.showToast(this.t("quickSettingsOpenFailed", { error: "empty dialog" }), "error");
                return;
            }
            this.logQuickSettingsDiagnostic("visible.verify", "ok", meta);
        };
        const requestFrame = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
        if (requestFrame) this.quickSettingsVerifyRaf = requestFrame(verify);
        else this.quickSettingsVerifyTimer = setTimeout(verify, 0);
    }

    cancelQuickSettingsModalVerify() {
        this.quickSettingsVerifyToken++;
        const cancelFrame = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
            ? window.cancelAnimationFrame.bind(window)
            : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
        if (this.quickSettingsVerifyRaf !== null && this.quickSettingsVerifyRaf !== undefined && cancelFrame) {
            cancelFrame(this.quickSettingsVerifyRaf);
        }
        if (this.quickSettingsVerifyTimer !== null && this.quickSettingsVerifyTimer !== undefined) {
            clearTimeout(this.quickSettingsVerifyTimer);
        }
        this.quickSettingsVerifyRaf = null;
        this.quickSettingsVerifyTimer = null;
    }

    closeQuickSettingsPanel(root = this.quickSettingsModalRoot, reason = "close") {
        // A hotkey recording started in this window must not outlive it and swallow later typing.
        this.clearHotkeyRecordingWithin(root);
        if (!root && typeof document !== "undefined") {
            this.cancelQuickSettingsModalVerify();
            const roots = this.getQuickSettingsModalRoots();
            roots.forEach(node => this.closeQuickSettingsPanel(node, reason));
            if (this.quickSettingsModalKeydown) {
                document.removeEventListener?.("keydown", this.quickSettingsModalKeydown, true);
                this.quickSettingsModalKeydown = null;
            }
            this.quickSettingsModalRoot = null;
            this.quickSettingsPreviousFocus = null;
            this.setQuickSettingsLauncherButton(null, false);
            this.resumeQuickSettingsDeferredWork(reason);
            return;
        }
        this.cancelQuickSettingsModalVerify();
        if (this.quickSettingsModalKeydown && typeof document !== "undefined") {
            document.removeEventListener?.("keydown", this.quickSettingsModalKeydown, true);
        }
        this.quickSettingsModalKeydown = null;
        if (root) {
            this.commitSettingsControls(root);
            this.flushSettings({ force: true, retryOnError: false });
            root.querySelectorAll?.(".dait-settings")?.forEach(panel => this.destroySettingsModalSizing(panel));
        }
        if (root && this.isStarted) {
            this.logQuickSettingsDiagnostic("close", "ok", {
                reason,
                ...this.getQuickSettingsModalDebugMeta(root)
            });
        }
        if (root?.remove) root.remove();
        if (!root || root === this.quickSettingsModalRoot) this.quickSettingsModalRoot = null;
        const previousFocus = this.quickSettingsPreviousFocus;
        this.quickSettingsPreviousFocus = null;
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

    injectInputButtons(options = {}) {
        const textbox = this.getActiveTextbox() || this.getTextbox();
        if (!textbox) return;
        const composerKey = this.getTextboxComposerKey(textbox);

        const container = this.getPolishButtonContainer(textbox);
        if (!container) return;
        const group = this.getInputActionGroup(container);
        if (!group) return;
        this.removeDisabledInputActionButtons(group);

        if (this.isPolishInputButtonEnabled(options) && !group.querySelector(".dait-polish-button")) {
            const button = this.createInputActionButton(
                "dait-polish-button",
                this.t("polishButton"),
                this.t("polishTitleAttr", { shortcut: this.getHotkeyLabel() }),
                () => this.polishCurrentDraft(button, { textbox, composerKey }),
                { shortText: this.t("polishButtonShort"), textbox, composerKey }
            );
            group.appendChild(button);
        }

        if (!options.forcePolish && this.isPublicBilingualInputButtonEnabled() && !group.querySelector(".dait-public-bilingual-button")) {
            const button = this.createInputActionButton(
                "dait-public-bilingual-button",
                this.t("publicBilingualButton"),
                this.t("publicBilingualTitleAttr", { targetLanguage: this.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }),
                () => this.publicBilingualCurrentDraft(button, { textbox, composerKey }),
                { shortText: this.t("publicBilingualButtonShort"), textbox, composerKey }
            );
            group.appendChild(button);
        }
        this.syncInputRestoreButtonState(group, textbox, options);
        this.syncInputActionButtonThemes(group, textbox || container);
        this.syncInputActionGroupState(group, textbox, container);
    }

    // Polish needs polish.enabled and public bilingual needs translation.enabled; a feature that is
    // switched off loses its composer button (it comes back on the next scan once re-enabled).
    removeDisabledInputActionButtons(group) {
        if (!group?.querySelectorAll) return false;
        const selectors = [];
        if (this.settings.polish?.enabled === false) selectors.push(".dait-polish-button");
        if (!this.isPublicBilingualFeatureEnabled()) selectors.push(".dait-public-bilingual-button");
        let removed = false;
        selectors.forEach(selector => {
            [...(group.querySelectorAll(selector) || [])].forEach(button => {
                button.remove?.();
                removed = true;
            });
        });
        return removed;
    }

    syncInputActionButtonsForSettings() {
        this.removeInputActionMenu();
        if (typeof document === "undefined") return;
        [...(document.querySelectorAll?.(".dait-input-action-group") || [])].forEach(group => {
            if (this.removeDisabledInputActionButtons(group)) this.syncInputActionGroupState(group);
        });
        // Re-enabling shows the buttons right away unless Discord's settings cover the composer; the
        // next input-button scan adds them then.
        if (!this.isStarted || !(this.settings.ui?.injectInputButton || this.settings.ui?.publicBilingualInputButton)) return;
        if (this.isDiscordSettingsSurfaceOpen()) this.queueInputButtonScan({ delayMs: 120, trailing: true });
        else this.injectInputButtons();
    }

    createInputActionButton(className, text, title, action, options = {}) {
        const button = document.createElement("button");
        button.className = className;
        button.type = "button";
        button.textContent = text;
        button.dataset.daitFullLabel = text;
        button.dataset.daitShortLabel = options.shortText || text;
        if (options.composerKey) button.dataset.daitComposerKey = options.composerKey;
        if (options.textbox) button.__daitTextbox = options.textbox;
        button.title = title;
        button.setAttribute("aria-label", title || text);
        ["pointerdown", "mousedown"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
            });
        });
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            action?.();
        });
        return button;
    }

    resolveInputActionTextbox(button = null, options = {}) {
        const expectedComposerKey = options.composerKey || button?.dataset?.daitComposerKey || "";
        const candidates = [
            options.textbox,
            button?.__daitTextbox
        ].filter(Boolean);
        for (const textbox of candidates) {
            if (!textbox || textbox.isConnected === false) continue;
            if (!expectedComposerKey || this.getTextboxComposerKey(textbox) === expectedComposerKey) return textbox;
        }
        if (!expectedComposerKey) {
            const activeTextbox = this.getActiveTextbox();
            if (activeTextbox?.isConnected !== false) return activeTextbox;
            const textbox = this.getTextbox();
            if (textbox?.isConnected !== false) return textbox;
        }
        return null;
    }

    isInputActionTextboxCurrent(textbox, expectedComposerKey = "") {
        if (!textbox || textbox.isConnected === false) return false;
        return !expectedComposerKey || this.getTextboxComposerKey(textbox) === expectedComposerKey;
    }

    syncInputActionButtonThemes(group, anchor = null) {
        if (!group?.querySelectorAll) return;
        group.querySelectorAll(".dait-polish-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button").forEach(button => {
            this.syncDiscordThemeClasses(button, anchor);
        });
    }

    getInputActionGroup(container) {
        if (!container?.appendChild || typeof document === "undefined") return null;
        container.classList?.add?.("dait-input-actions-host");
        let group = container.querySelector?.(".dait-input-action-group");
        if (!group) {
            group = document.createElement("span");
            group.className = "dait-input-action-group";
            group.setAttribute?.("aria-label", `${PLUGIN_NAME} input actions`);
            if (typeof container.insertBefore === "function" && container.children?.length) container.insertBefore(group, container.children[0]);
            else container.appendChild(group);
        }
        return group;
    }

    syncInputActionGroupState(group, textbox = null, container = null) {
        if (!group?.classList) return;
        const actionSelector = ".dait-polish-restore-button, .dait-polish-button, .dait-public-bilingual-button";
        const queried = group.querySelectorAll?.(actionSelector) || [];
        const fallback = [...(group.children || [])].filter(child => this.isInputActionDirectButton(child));
        const count = Math.max(queried.length || 0, fallback.length);
        group.classList.toggle("dait-input-action-group-dual", count > 1);
        if (!count) {
            this.removeInputActionMenu();
            group.remove?.();
            return;
        }
        this.ensureInputActionMenuButton(group, textbox, container);
        this.updateInputActionGroupDensity(group, textbox, container);
    }

    isInputActionDirectButton(node) {
        return this.elementHasClassName(node, "dait-polish-restore-button")
            || this.elementHasClassName(node, "dait-polish-button")
            || this.elementHasClassName(node, "dait-public-bilingual-button");
    }

    syncInputRestoreButtonState(group, textbox, options = {}) {
        if (!group) return;
        const existing = group.querySelector?.(".dait-polish-restore-button");
        const session = options.restoreSession || this.polishSession;
        const canRestore = Boolean(session && this.canRestorePolishOriginal(textbox, session));
        if (!canRestore) {
            existing?.remove?.();
            return;
        }
        if (existing) {
            if (existing.__daitRestoreSession === session && existing.dataset?.daitComposerKey === session.composerKey) return;
            existing.remove?.();
        }
        const button = this.createInputActionButton(
            "dait-polish-restore-button",
            this.t("restoreOriginal"),
            this.t("restoreOriginal"),
            () => this.restorePolishOriginal(textbox, session, button),
            { shortText: this.t("restoreOriginalShort"), textbox, composerKey: session.composerKey }
        );
        button.__daitRestoreSession = session;
        if (typeof group.insertBefore === "function" && group.children?.length) group.insertBefore(button, group.children[0]);
        else group.appendChild(button);
    }

    ensureInputActionMenuButton(group, textbox = null, container = null) {
        if (!group?.appendChild || typeof document === "undefined") return null;
        let button = group.querySelector?.(".dait-input-action-menu-button");
        if (!button) {
            button = document.createElement("button");
            button.className = "dait-input-action-menu-button";
            button.type = "button";
            button.textContent = "AI";
            button.title = this.t("inputActionMenu");
            button.setAttribute("aria-label", this.t("inputActionMenu"));
            button.setAttribute("aria-haspopup", "menu");
            button.setAttribute("aria-expanded", "false");
            ["pointerdown", "mousedown"].forEach(type => {
                button.addEventListener(type, event => {
                    event.preventDefault();
                    event.stopPropagation();
                });
            });
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleInputActionMenu(group, textbox, container, button);
            });
            group.appendChild(button);
        }
        return button;
    }

    updateInputActionGroupDensity(group, textbox = null, container = null) {
        if (!group?.dataset) return;
        const width = this.getInputActionAvailableWidth(group, textbox, container);
        const actionCount = this.getInputActionDirectButtonCount(group);
        let density = "roomy";
        if (width > 0) {
            if (width < (actionCount >= 3 ? 620 : 520)) density = "minimal";
            else if (width < (actionCount >= 3 ? 760 : 660)) density = "compact";
        }
        group.dataset.daitDensity = density;
        group.classList?.toggle?.("dait-input-action-group-compact", density === "compact");
        group.classList?.toggle?.("dait-input-action-group-minimal", density === "minimal");
        group.classList?.toggle?.("dait-input-action-group-roomy", density === "roomy");
        this.syncInputActionButtonLabels(group, density);
    }

    getInputActionAvailableWidth(group, textbox = null, container = null) {
        const roots = [
            textbox?.closest?.("form, [class*='channelTextArea']"),
            container?.closest?.("form, [class*='channelTextArea']"),
            container?.parentElement,
            container,
            group?.parentElement
        ].filter(Boolean);
        for (const root of roots) {
            const rect = root.getBoundingClientRect?.();
            const width = Number(rect?.width || 0);
            if (width > 0) return width;
        }
        const viewport = Number((typeof window !== "undefined" ? window.innerWidth : 0) || (typeof document !== "undefined" ? document.documentElement?.clientWidth : 0) || 0);
        return Number.isFinite(viewport) ? viewport : 0;
    }

    getInputActionDirectButtonCount(group) {
        return [...(group?.children || [])].filter(child => this.isInputActionDirectButton(child)).length;
    }

    syncInputActionButtonLabels(group, density = "roomy") {
        if (!group?.querySelectorAll) return;
        group.querySelectorAll(".dait-polish-restore-button, .dait-polish-button, .dait-public-bilingual-button").forEach(button => {
            this.renderInputActionButtonLabel(button, density);
        });
    }

    // The one place that writes a composer button's label, so busy/idle changes keep the group's density.
    renderInputActionButtonLabel(button, density = null) {
        if (!button) return;
        const groupDensity = density || button.parentElement?.dataset?.daitDensity || button.closest?.(".dait-input-action-group")?.dataset?.daitDensity || "roomy";
        const full = button.dataset?.daitFullLabel || button.textContent || "";
        const short = button.dataset?.daitShortLabel || full;
        button.textContent = groupDensity !== "roomy" ? short : full;
    }

    toggleInputActionMenu(group, textbox = null, container = null, button = null) {
        if (this.inputActionMenu?.isConnected) {
            this.removeInputActionMenu();
            return;
        }
        this.openInputActionMenu(group, textbox, container, button);
    }

    openInputActionMenu(group, textbox = null, container = null, button = null) {
        if (typeof document === "undefined" || !document.body) return null;
        this.removeInputActionMenu();
        const menu = document.createElement("div");
        menu.className = "dait-input-action-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", this.t("inputActionMenu"));
        this.syncDiscordThemeClasses(menu, textbox || button || container || group);

        const addItem = (label, title, action) => {
            const item = document.createElement("button");
            item.className = "dait-input-action-menu-item";
            item.type = "button";
            item.textContent = label;
            item.title = title || label;
            item.setAttribute("role", "menuitem");
            item.setAttribute("aria-label", title || label);
            item.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                this.removeInputActionMenu();
                action?.();
            });
            menu.appendChild(item);
            return item;
        };

        const session = this.polishSession;
        const composerKey = textbox ? this.getTextboxComposerKey(textbox) : "";
        if (session && this.canRestorePolishOriginal(textbox, session)) {
            addItem(this.t("restoreOriginal"), this.t("restoreOriginal"), () => this.restorePolishOriginal(textbox, session, button));
        }
        if (this.settings.polish?.enabled !== false && (this.settings.ui?.injectInputButton || group?.querySelector?.(".dait-polish-button"))) {
            addItem(this.t("polishButton"), this.t("polishTitleAttr", { shortcut: this.getHotkeyLabel() }), () => this.polishCurrentDraft(group?.querySelector?.(".dait-polish-button") || button, { textbox, composerKey, fromMenu: true }));
        }
        if (this.isPublicBilingualFeatureEnabled() && (this.settings.ui?.publicBilingualInputButton || group?.querySelector?.(".dait-public-bilingual-button"))) {
            addItem(this.t("publicBilingualButton"), this.t("publicBilingualTitleAttr", { targetLanguage: this.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }), () => this.publicBilingualCurrentDraft(group?.querySelector?.(".dait-public-bilingual-button") || button, { textbox, composerKey }));
        }
        addItem(this.t("inputActionOpenSettings"), this.t("quickSettingsOpen"), () => this.openQuickSettingsPanel("input-menu", button || group));

        ["pointerdown", "mousedown", "click"].forEach(type => {
            menu.addEventListener(type, event => event.stopPropagation());
        });
        document.body.appendChild(menu);
        this.inputActionMenu = menu;
        button?.setAttribute?.("aria-expanded", "true");
        const reposition = () => {
            this.syncDiscordThemeClasses(menu, textbox || button || container || group);
            this.positionInputActionMenu(menu, button || group);
        };
        const outsidePointerDown = event => {
            if (menu.contains?.(event.target) || button?.contains?.(event.target)) return;
            this.removeInputActionMenu();
        };
        const escapeKeydown = event => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            this.removeInputActionMenu();
        };
        this.inputActionMenuCleanup = () => {
            button?.setAttribute?.("aria-expanded", "false");
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", reposition, true);
                window.removeEventListener?.("scroll", reposition, true);
            }
            document.removeEventListener?.("pointerdown", outsidePointerDown, true);
            document.removeEventListener?.("keydown", escapeKeydown, true);
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", reposition, true);
            window.addEventListener?.("scroll", reposition, true);
        }
        document.addEventListener?.("pointerdown", outsidePointerDown, true);
        document.addEventListener?.("keydown", escapeKeydown, true);
        reposition();
        return menu;
    }

    positionInputActionMenu(menu, anchor = null) {
        if (!menu?.style || typeof window === "undefined") return;
        const rect = anchor?.getBoundingClientRect?.() || null;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 900;
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 700;
        const width = Math.min(210, Math.max(156, viewportWidth - 24));
        const left = rect ? Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12)) : viewportWidth - width - 16;
        const bottom = rect ? Math.max(12, viewportHeight - rect.top + 8) : 76;
        menu.style.left = `${left}px`;
        menu.style.right = "auto";
        menu.style.bottom = `${Math.min(Math.max(bottom, 12), Math.max(12, viewportHeight - 80))}px`;
        menu.style.width = `${width}px`;
    }

    removeInputActionMenu() {
        this.inputActionMenuCleanup?.();
        this.inputActionMenuCleanup = null;
        this.inputActionMenu?.remove?.();
        this.inputActionMenu = null;
    }

    getPolishButtonContainer(textbox) {
        return this.getInputButtonContainer(textbox);
    }

    getInputButtonContainer(textbox) {
        const root = textbox?.closest?.("form, [class*='channelTextArea']") || textbox?.parentElement;
        if (!root?.querySelector) return null;
        return this.resolveInputButtonContainer(root, textbox);
    }

    resolveInputButtonContainer(root, textbox) {
        const candidates = this.getInputButtonContainerCandidates(root, textbox);
        const controls = this.getInputButtonControls(root, textbox);
        const anchors = controls.filter(control => this.isInputButtonToolbarAnchor(control));
        const scored = candidates
            .map(container => ({ container, score: this.scoreInputButtonContainer(container, root, textbox, anchors) }))
            .filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score);
        if (scored.length) return scored[0].container;

        for (const anchor of anchors) {
            const container = this.getInputButtonContainerFromAnchor(anchor, root, textbox);
            if (container) return container;
        }

        return null;
    }

    getInputButtonContainerCandidates(root, textbox) {
        const candidates = [];
        const add = node => {
            if (!this.isValidInputButtonContainer(node, root, textbox) || candidates.includes(node)) return;
            candidates.push(node);
        };
        try {
            (root.querySelectorAll?.("[class*='buttons']") || []).forEach(add);
        }
        catch {}
        try {
            add(root.querySelector?.("[class*='buttons']"));
        }
        catch {}
        return candidates;
    }

    getInputButtonControls(root, textbox) {
        try {
            return [...(root.querySelectorAll?.("button, [role='button']") || [])]
                .filter(control => control?.isConnected !== false)
                .filter(control => !control.contains?.(textbox))
                .filter(control => !control.closest?.(".dait-polish-button, .dait-public-bilingual-button, .dait-input-action-group"));
        }
        catch {
            return [];
        }
    }

    scoreInputButtonContainer(container, root, textbox, anchors = []) {
        if (!this.isValidInputButtonContainer(container, root, textbox)) return 0;
        let score = this.elementClassNameIncludes(container, "buttons") ? 20 : 0;
        const anchorCount = anchors.filter(anchor => container.contains?.(anchor)).length;
        score += anchorCount * 100;
        if (this.elementClassNameIncludes(container, "attach")) score -= 20;
        return Math.max(0, score);
    }

    getInputButtonContainerFromAnchor(anchor, root, textbox) {
        let current = anchor?.parentElement || null;
        let fallback = null;
        let guard = 0;
        while (current && current !== root && guard < 8) {
            if (this.isValidInputButtonContainer(current, root, textbox)) {
                if (this.elementClassNameIncludes(current, "buttons")) return current;
                if (!fallback && this.getButtonLikeDescendantCount(current) > 1) fallback = current;
            }
            current = current.parentElement;
            guard++;
        }
        return fallback;
    }

    isValidInputButtonContainer(container, root, textbox) {
        if (!container || container === root || container?.isConnected === false) return false;
        if (container.contains?.(textbox)) return false;
        if (textbox?.contains?.(container)) return false;
        if (container.closest?.("[role='textbox'], [contenteditable='true'], [data-slate-editor='true']")) return false;
        if (this.elementHasClassName(container, "dait-input-action-group")) return false;
        const tag = String(container.tagName || "").toLowerCase();
        if (tag === "button") return false;
        const role = String(container.getAttribute?.("role") || "").toLowerCase();
        if (role === "button" || role === "textbox") return false;
        return true;
    }

    isInputButtonToolbarAnchor(control) {
        const label = this.getInputButtonControlLabel(control);
        return /gif|emoji|sticker|gift|表情|貼紙|贴纸|禮物|礼物|表情符號|琛ㄦ儏|璐寸焊|绀肩墿/.test(label);
    }

    getInputButtonControlLabel(control) {
        return [
            control?.getAttribute?.("aria-label"),
            control?.getAttribute?.("data-tooltip-text"),
            control?.title,
            control?.textContent
        ].filter(Boolean).join(" ").toLowerCase();
    }

    getButtonLikeDescendantCount(container) {
        try {
            return (container.querySelectorAll?.("button, [role='button']") || []).length;
        }
        catch {
            return 0;
        }
    }

    elementClassNameIncludes(node, fragment) {
        const needle = String(fragment || "").toLowerCase();
        if (!node || !needle) return false;
        try {
            if (node.classList && [...node.classList].some(name => String(name || "").toLowerCase().includes(needle))) return true;
        }
        catch {}
        return String(node.className?.baseVal || node.className || "").toLowerCase().includes(needle);
    }

    getMessageButtonVisibility() {
        return this.normalizeMessageButtonVisibility(this.settings.ui?.messageButtonVisibility);
    }

    getMessageButtonClassName() {
        return this.getMessageButtonVisibility() === MESSAGE_BUTTON_VISIBILITY_HOVER
            ? "dait-message-button dait-message-button-hover-only"
            : "dait-message-button";
    }

    applyMessageButtonVisibilityToButton(button, anchor = null) {
        if (!button) return;
        button.className = this.getMessageButtonClassName();
        this.syncDiscordThemeClasses(button, anchor);
    }

    applyMessageButtonVisibilityToButtons() {
        if (typeof document === "undefined") return;
        document.querySelectorAll(".dait-message-button").forEach(button => this.applyMessageButtonVisibilityToButton(button));
    }

    injectMessageButtons(context = this.createScanContext()) {
        const messageNodes = context.messageNodes;
        messageNodes.forEach(messageNode => this.injectMessageButton(messageNode, context));
    }

    injectMessageButton(messageNode, context = null) {
        if (!this.settings.ui?.injectMessageButtons) return false;
        if (!messageNode || messageNode.isConnected === false) return false;
        const content = this.getMessageContentElement(messageNode, context);
        if (!content) return false;

        const text = this.getCachedElementText(content, context);
        if (!text) return false;

        let button = content.querySelector(":scope > .dait-message-button");
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.textContent = this.t("translateButton");
            button.title = this.t("translateTitleAttr", { targetLanguage: this.getDisplayLanguage(this.settings.translation.targetLanguage) });
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                const currentContent = this.getMessageContentElement(messageNode);
                if (!currentContent) {
                    this.showToast(this.t("messageMissing"), "error");
                    return;
                }
                this.translateMessage(messageNode, currentContent, button);
            });
        }
        this.applyMessageButtonVisibilityToButton(button, content || messageNode);

        if (button.parentElement !== content || button.nextSibling) {
            content.appendChild(button);
        }
        return true;
    }

    getMessageContentElement(messageNode, context = null) {
        if (context?.contentByMessage?.has(messageNode)) return context.contentByMessage.get(messageNode);

        const candidates = this.getMessageContentCandidates(messageNode);
        for (const candidate of candidates) {
            if (this.getCachedElementText(candidate, context)) {
                context?.contentByMessage?.set(messageNode, candidate);
                return candidate;
            }
        }

        context?.contentByMessage?.set(messageNode, null);
        return null;
    }

    getMessageContentElements(messageNode, context = null) {
        if (context?.contentElementsByMessage?.has(messageNode)) return context.contentElementsByMessage.get(messageNode);

        const candidates = this.getMessageContentCandidates(messageNode);

        const elements = candidates
            .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index)
            .filter(candidate => !allContainsOtherCandidate.call(this, candidate, candidates))
            .filter(candidate => Boolean(this.getCachedElementText(candidate, context)));

        const result = elements.length
            ? elements
            : [this.getMessageContentElement(messageNode, context)].filter(Boolean);
        context?.contentElementsByMessage?.set(messageNode, result);
        return result;

        function allContainsOtherCandidate(candidate, all) {
            return all.some(other => other !== candidate && candidate.contains?.(other) && !this.isForeignTranslationElement(other));
        }
    }

    getMessageContentCandidates(messageNode) {
        const primary = [...(messageNode?.querySelectorAll?.("[class*='messageContent']") || [])]
            .filter(candidate => this.isUsableMessageContentCandidate(candidate));
        const fallback = primary.length
            ? []
            : [...(messageNode?.querySelectorAll?.("[class*='markup']") || [])]
                .filter(candidate => this.isUsableMessageContentCandidate(candidate));
        const candidates = [...new Set([...primary, ...fallback])];
        if (!candidates.length && messageNode?.content && this.isUsableMessageContentCandidate(messageNode.content)) candidates.push(messageNode.content);
        return candidates;
    }

    isUsableMessageContentCandidate(candidate) {
        if (!candidate) return false;
        if (this.isReplyPreviewElement(candidate)) return false;
        if (candidate.closest?.(".dait-translation-box, .dait-translation-line, [class*='embed'], [class*='attachment']")) return false;
        if (this.isInsideForeignTranslationElement(candidate)) return false;
        return true;
    }

    isReplyPreviewElement(element) {
        return Boolean(element?.closest?.("[class*='repliedMessage'], [class*='repliedTextPreview'], [class*='quotedChatMessage']"));
    }

    getForeignTranslationExcludedSelectors() {
        return [
            "[data-dait-ignore-translation]",
            "[data-translation]",
            "[data-translated]",
            "[data-translator]",
            "[data-translate]",
            "[class*='translation']",
            "[class*='translated']",
            "[class*='translator']",
            "[class^='translate']",
            "[class*=' translate']",
            "[class*='translate-']",
            "[class*='translate_']",
            "[class*='deepl']",
            "[class*='google-translate']",
            "[id*='translation']",
            "[id*='translated']",
            "[id*='translator']",
            "[id^='translate']",
            "[id*='-translate']",
            "[id*='_translate']",
            "[aria-label*='Translate']",
            "[aria-label*='translation']",
            "[aria-label*='翻译']",
            "[aria-label*='译文']",
            "[title*='Translate']",
            "[title*='translation']",
            "[title*='翻译']",
            "[title*='译文']"
        ];
    }

    isInsideForeignTranslationElement(element) {
        let current = element;
        let guard = 0;
        while (current && current.nodeType === 1 && guard < 8) {
            if (this.isForeignTranslationElement(current)) return true;
            if (current.matches?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
            current = current.parentElement;
            guard++;
        }
        return false;
    }

    isForeignTranslationElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.classList?.contains?.("dait-translation-line") || element.classList?.contains?.("dait-translation-box")) return true;

        const identityText = this.getElementForeignTranslationIdentityText(element);
        const normalized = identityText.replace(/notranslate/gi, "");
        if (/(translation|translated|translator|deepl|google[-_\s]?translate|i18n|l10n|intl|译文|翻译|已翻译)/i.test(normalized)) return true;
        if (/(^|[^a-z])translate([^a-z]|$)/i.test(normalized)) return true;

        const tag = String(element.tagName || "").toLowerCase();
        const role = String(element.getAttribute?.("role") || "").toLowerCase();
        if (tag === "button" || role === "button") {
            const label = this.getElementControlLabel(element);
            return /(translate|translation|show original|original text|翻译|译文|查看原文|显示原文)/i.test(label);
        }
        return false;
    }

    getElementForeignTranslationIdentityText(element) {
        const parts = [
            element.className?.baseVal || element.className || "",
            element.id || "",
            element.getAttribute?.("aria-label") || "",
            element.getAttribute?.("title") || "",
            element.getAttribute?.("data-tooltip-text") || "",
            element.getAttribute?.("data-testid") || "",
            element.getAttribute?.("data-translation") || "",
            element.getAttribute?.("data-translated") || "",
            element.getAttribute?.("data-translator") || "",
            element.getAttribute?.("data-translate") || ""
        ];
        const dataset = element.dataset || {};
        Object.keys(dataset).forEach(key => parts.push(key, dataset[key]));
        return parts.filter(Boolean).join(" ");
    }

    getElementControlLabel(element) {
        return [
            element?.getAttribute?.("aria-label"),
            element?.getAttribute?.("data-tooltip-text"),
            element?.getAttribute?.("title"),
            element?.textContent
        ].filter(Boolean).join(" ").toLowerCase();
    }

    createHistoryBackfillScanContext(messageNodes = []) {
        const context = this.createScanContext({ messageNodes: [] });
        context.dirtyOnly = false;
        context.messageNodes = [...new Set(messageNodes || [])]
            .filter(node => node?.isConnected !== false);
        this.rememberScanRangeElements(context.messageNodes, context);
        context.messageNodes.forEach(messageNode => {
            try {
                this.rememberScanRangeElements(this.getMessageContentElements(messageNode, context), context);
                this.rememberScanRangeElements(this.getReplyPreviewElements(messageNode), context);
            }
            catch {}
        });
        return context;
    }

    requestExplicitHistoryBackfill(options = {}) {
        const startedAt = Date.now();
        const limit = this.normalizeHistoryBackfillLimit(options.limit ?? this.settings.ui?.historyBackfillLimit);
        const result = {
            requested: 0,
            candidates: 0,
            eligible: 0,
            enqueued: 0,
            skipped: 0,
            blocked: 0
        };
        if (this.settings.ui?.historyBackfillEnabled !== true) {
            this.logDiagnostic("auto.history-backfill", "disabled", {
                ...this.getDiagnosticBaseMeta("auto", "history", "history-disabled"),
                limit
            });
            return result;
        }
        if (!this.isAutoTranslateEnabled()) {
            this.logDiagnostic("auto.history-backfill", "blocked", {
                ...this.getDiagnosticBaseMeta("auto", "history", "auto-disabled"),
                limit
            });
            return result;
        }
        if (!this.hasUsableApiConfig("translation")) {
            this.logDiagnostic("auto.history-backfill", "blocked", {
                ...this.getDiagnosticBaseMeta("auto", "history", "missing-api"),
                limit
            });
            return result;
        }

        const nodes = Array.isArray(options.messageNodes)
            ? options.messageNodes
            : this.getScanContextMessageNodes({});
        const context = options.context || this.createHistoryBackfillScanContext(nodes);
        const requestOptions = this.getAutoTranslationOptions();
        const scanState = {
            context,
            requestOptions,
            now: Date.now(),
            renderPaused: false,
            viewportSettling: false,
            jumpCoolingDown: false,
            viewportStabilityPending: false,
            layoutUnstable: false,
            apiWorkBlocked: false,
            blockReason: "",
            providerFailure: null,
            localProviderHealthBlocked: false,
            batchSize: limit,
            queueLimit: this.getAutoTranslateQueueLimit(),
            queued: 0
        };
        const scanStats = {
            __scanState: scanState,
            candidates: 0,
            seen: 0,
            eligible: 0,
            enqueued: 0,
            blocked: 0,
            skippedLanguage: 0,
            skippedCurrent: 0,
            failures: 0
        };
        const candidates = this.createAutoTranslationCandidates(context)
            .filter(candidate => candidate?.targetKind === "message")
            .slice(0, limit);
        result.requested = nodes.length;
        result.candidates = candidates.length;
        scanStats.candidates = candidates.length;

        for (const candidate of candidates) {
            scanStats.seen++;
            candidate.daitHistoryRequest = true;
            candidate.daitPrefetchRequest = false;
            const decision = this.evaluateAutoTranslationCandidate(candidate, scanState);
            if (decision?.item) {
                decision.item.daitHistoryRequest = true;
                decision.item.daitPrefetchRequest = false;
            }
            this.applyAutoTranslationDecision(candidate, decision, scanStats);
            if (Number(scanStats.enqueued || 0) >= limit) break;
        }

        result.eligible = Number(scanStats.eligible || 0);
        result.enqueued = Number(scanStats.enqueued || 0);
        result.skipped = Number(scanStats.skippedLanguage || 0) + Number(scanStats.skippedCurrent || 0);
        result.blocked = Number(scanStats.blocked || 0) + Number(scanStats.failures || 0);
        this.logDiagnostic("auto.history-backfill", result.enqueued ? "queued" : "none", {
            ...this.getDiagnosticBaseMeta("auto", "history", result.enqueued ? DIAGNOSTIC_REASON_CODES.ENQUEUED : "history-none"),
            queueType: AUTO_TRANSLATION_QUEUE_TYPES.HISTORY,
            limit,
            requested: result.requested,
            candidates: result.candidates,
            eligible: result.eligible,
            enqueued: result.enqueued,
            skipped: result.skipped,
            blocked: result.blocked,
            ms: Date.now() - startedAt
        });
        if (result.enqueued) this.drainAutoTranslationQueue();
        return result;
    }

    runExplicitHistoryBackfillFromUi(button = null, options = {}) {
        const idleLabel = this.t("historyBackfillRun");
        const startedAt = Date.now();
        if (button) this.setButtonBusy(button, true, this.t("historyBackfillRunning"));
        try {
            const result = this.requestExplicitHistoryBackfill({
                limit: this.settings.ui?.historyBackfillLimit,
                source: options.source || "ui"
            });
            this.logDiagnostic("auto.history-backfill.ui", result?.enqueued ? "queued" : "none", {
                ...this.getDiagnosticBaseMeta("auto", "history", result?.enqueued ? DIAGNOSTIC_REASON_CODES.ENQUEUED : "history-none"),
                queueType: AUTO_TRANSLATION_QUEUE_TYPES.HISTORY,
                source: options.source || "ui",
                requested: result?.requested || 0,
                candidates: result?.candidates || 0,
                enqueued: result?.enqueued || 0,
                skipped: result?.skipped || 0,
                blocked: result?.blocked || 0,
                ms: Date.now() - startedAt
            });
            if (result?.enqueued) {
                this.showToast(this.t("historyBackfillQueued", { count: result.enqueued }), "success");
            }
            else {
                this.showToast(this.t("historyBackfillNoWork"), "info");
            }
            return result;
        }
        catch (error) {
            this.logDiagnostic("auto.history-backfill.ui", "error", {
                ...this.getDiagnosticBaseMeta("auto", "history", "history-error"),
                source: options.source || "ui",
                errorText: this.formatError(error),
                ms: Date.now() - startedAt
            });
            this.showToast(this.formatError(error), "error");
            return null;
        }
        finally {
            if (button) this.setButtonBusy(button, false, idleLabel);
        }
    }

    createAutoTranslationCandidates(context = this.createScanContext()) {
        const mode = this.normalizeAutoTranslateIntakeMode(this.settings.ui?.autoTranslateIntakeMode);
        const domCandidates = this.createDomAutoTranslationCandidates(context);
        const bdfdbAvailable = this.isBdfdbMessageIntakeAvailable();
        const intake = {
            mode,
            source: "dom",
            bdfdbAvailable,
            domCandidates: domCandidates.length,
            bdfdbEnhanced: 0,
            bdfdbOnlySkipped: 0
        };

        if (mode === "dom") {
            context.autoTranslateIntake = intake;
            this.logAutoTranslationIntakeState("dom", intake);
            return domCandidates;
        }

        if (!bdfdbAvailable) {
            intake.reason = "bdfdb-unavailable";
            context.autoTranslateIntake = intake;
            this.logAutoTranslationIntakeState(mode === "bdfdb" ? "fallback" : "dom", intake);
            return domCandidates;
        }

        const enhanced = this.createBdfdbAutoTranslationCandidates(context, domCandidates);
        intake.source = "bdfdb";
        intake.bdfdbEnhanced = enhanced.filter(candidate => candidate?.source === "bdfdb").length;
        context.autoTranslateIntake = intake;
        this.logAutoTranslationIntakeState("bdfdb", intake);
        return enhanced;
    }

    createDomAutoTranslationCandidates(context = this.createScanContext()) {
        const candidates = [];
        for (const messageNode of context?.messageNodes || []) {
            candidates.push(...this.createDomAutoTranslationCandidatesForMessage(messageNode, context));
        }
        return candidates;
    }

    createDomAutoTranslationCandidatesForMessage(messageNode, context = null) {
        const candidates = [];
        for (const target of this.getAutoTranslationTargets(messageNode, context)) {
            candidates.push(this.createAutoTranslationCandidate({
                source: "dom",
                targetKind: target.targetKind || "message",
                messageNode,
                content: target.content,
                text: target.text,
                textOptions: target.textOptions || null
            }));
        }
        return candidates;
    }

    createBdfdbAutoTranslationCandidates(context = this.createScanContext(), domCandidates = this.createDomAutoTranslationCandidates(context)) {
        return domCandidates.map(candidate => {
            const meta = this.getBdfdbAutoTranslationCandidateMeta(candidate, context);
            if (!meta?.messageId) return candidate;
            const fullContent = this.normalizeExtractedText(meta.fullContent || "");
            const useFullContent = fullContent
                && fullContent.length > String(candidate.text || "").length + 4
                && this.isManualTranslationSourceCompatible(fullContent, candidate.text);
            const text = useFullContent ? fullContent : candidate.text;
            return this.createAutoTranslationCandidate({
                ...candidate,
                ...meta,
                text,
                domText: candidate.text,
                fullContent,
                sourceTextKind: useFullContent ? "store-full" : "dom",
                source: "bdfdb",
                messageIdentity: this.createStructuredAutoTranslationMessageIdentity({ ...candidate, ...meta, text })
                    || candidate.messageIdentity
            });
        });
    }

    createAutoTranslationCandidate(candidate = {}) {
        return {
            source: candidate.source || "dom",
            targetKind: candidate.targetKind || (candidate.textOptions?.includeReplyPreview ? "reply-preview" : "message"),
            messageNode: candidate.messageNode || null,
            content: candidate.content || null,
            text: String(candidate.text || ""),
            textOptions: candidate.textOptions || null,
            messageId: String(candidate.messageId || "").trim(),
            channelId: String(candidate.channelId || "").trim(),
            guildId: String(candidate.guildId || "").trim(),
            authorId: String(candidate.authorId || "").trim(),
            timestamp: candidate.timestamp || "",
            domText: String(candidate.domText || "").trim(),
            fullContent: String(candidate.fullContent || "").trim(),
            sourceTextKind: String(candidate.sourceTextKind || candidate.sourceKind || "dom").trim(),
            messageIdentity: String(candidate.messageIdentity || "").trim()
        };
    }

    isBdfdbMessageIntakeAvailable() {
        if (this.getBdfdbRuntime()?.available) return true;
        const channelId = this.messageTracker.getRouteIds?.().channelId || "";
        if (!channelId) return false;
        return Boolean(this.getDiscordMessageStore());
    }

    getBdfdbRuntime() {
        const root = (typeof window !== "undefined" && window.BDFDB_Global)
            || (typeof globalThis !== "undefined" && globalThis.BDFDB_Global)
            || null;
        if (!root || (!root.loaded && !root.started)) return null;
        const bdfdb = root.BDFDB || root.BDFDB_Global || root.Library || root;
        return { root, bdfdb, available: true };
    }

    getBdfdbAutoTranslationCandidateMeta(candidate = {}, context = null) {
        const route = this.messageTracker.getRouteIds?.() || {};
        const nodeIds = this.messageTracker.getNodeMessageIds?.(candidate.messageNode) || {};
        const base = {
            guildId: nodeIds.guildId || route.guildId || "",
            channelId: nodeIds.channelId || route.channelId || "",
            messageId: nodeIds.messageId || "",
            authorId: this.messageTracker.getAuthorId?.(candidate.messageNode) || "",
            timestamp: this.messageTracker.getTimestamp?.(candidate.messageNode) || ""
        };
        if (candidate.targetKind !== "message") return base;

        const storeSnapshot = this.getBdfdbStoreSnapshot(base.channelId, context);
        const storeMessage = this.findBdfdbStoreMessageForCandidate(candidate, base, storeSnapshot);
        if (!storeMessage) {
            const resolved = this.messageTracker.getStoreResolvedMessageIds?.(candidate.messageNode, candidate.text, base, route);
            return {
                ...base,
                guildId: resolved?.guildId || base.guildId,
                channelId: resolved?.channelId || base.channelId,
                messageId: resolved?.messageId || base.messageId
            };
        }

        return {
            guildId: this.messageTracker.getStoreMessageGuildId(storeMessage) || base.guildId,
            channelId: this.messageTracker.getStoreMessageChannelId(storeMessage) || base.channelId,
            messageId: this.messageTracker.getStoreMessageId(storeMessage) || base.messageId,
            authorId: this.messageTracker.getStoreMessageAuthorId(storeMessage) || base.authorId,
            timestamp: this.messageTracker.getStoreMessageTimestamp(storeMessage) || base.timestamp,
            fullContent: this.getDiscordStoreMessageText(storeMessage)
        };
    }

    getBdfdbStoreSnapshot(channelId, context = null) {
        const normalizedChannelId = String(channelId || "").trim();
        if (!normalizedChannelId) return { messages: [], byId: new Map() };
        if (context && !context.bdfdbStoreByChannel) context.bdfdbStoreByChannel = new Map();
        if (context?.bdfdbStoreByChannel?.has(normalizedChannelId)) {
            return context.bdfdbStoreByChannel.get(normalizedChannelId);
        }
        const messages = this.getBdfdbMessageStoreMessages(normalizedChannelId);
        const byId = new Map();
        messages.forEach(message => {
            const id = String(this.messageTracker.getStoreMessageId(message) || "").trim();
            if (id && !byId.has(id)) byId.set(id, message);
        });
        const snapshot = { messages, byId };
        context?.bdfdbStoreByChannel?.set(normalizedChannelId, snapshot);
        return snapshot;
    }

    findBdfdbStoreMessageForCandidate(candidate = {}, base = {}, snapshot = null) {
        const channelId = base.channelId || this.messageTracker.getRouteIds?.().channelId || "";
        if (!channelId || !candidate.text) return null;
        const storeSnapshot = snapshot || this.getBdfdbStoreSnapshot(channelId);
        const messages = storeSnapshot.messages || [];
        if (!messages.length) return null;
        const messageId = String(base.messageId || "").trim();
        if (messageId) {
            const exact = storeSnapshot.byId?.get?.(messageId) || null;
            const messageChannelId = exact ? this.messageTracker.getStoreMessageChannelId(exact) : "";
            if (exact && messageChannelId && String(messageChannelId) !== String(channelId)) return null;
            if (exact) return exact;
        }
        const normalizedText = this.messageTracker.normalizeComparableText(candidate.text);
        const authorId = String(base.authorId || "");
        const timestamp = base.timestamp || "";
        const matches = messages.filter(message => {
            const storeText = this.getDiscordStoreMessageText(message);
            const storeComparable = this.messageTracker.normalizeComparableText(storeText);
            if (storeComparable !== normalizedText && !this.isManualTranslationSourceCompatible(storeText, candidate.text)) return false;
            if (authorId && String(this.messageTracker.getStoreMessageAuthorId(message) || "") !== authorId) return false;
            if (timestamp && !this.messageTracker.isStoreTimestampMatch(timestamp, this.messageTracker.getStoreMessageTimestamp(message))) return false;
            return true;
        });
        return matches.length === 1 ? matches[0] : null;
    }

    getBdfdbMessageStoreMessages(channelId) {
        const runtime = this.getBdfdbRuntime();
        const bdfdb = runtime?.bdfdb;
        const store = bdfdb?.LibraryStores?.MessageStore
            || bdfdb?.LibraryModules?.MessageStore
            || bdfdb?.LibraryModules?.MessageStoreUtils
            || null;
        if (store) {
            try {
                return this.extractDiscordMessageStoreCollection(store.getMessages?.(channelId) || store.getMessagesForChannel?.(channelId));
            }
            catch (error) {
                this.warnSanitized("Failed to read BDFDB MessageStore", error);
            }
        }
        return this.getDiscordMessageStoreMessages(channelId);
    }

    createStructuredAutoTranslationMessageIdentity(candidate = {}) {
        if (candidate.targetKind !== "message" || !candidate.messageId) return "";
        const sourceTextHash = this.getTextFingerprint(candidate.text || "");
        return [
            "message",
            candidate.guildId || "unknown-guild",
            candidate.channelId || "unknown-channel",
            candidate.messageId,
            candidate.targetKind || "message",
            sourceTextHash
        ].join(":");
    }

    completeAutoTranslationFromCache(messageNode, content, text, translated, cacheKey, canRender = true, requestOptions = null, textOptions = null) {
        if (requestOptions && this.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) {
            this.deleteTranslationCacheCandidates(cacheKey, ...this.getTranslationCacheAliases(text, requestOptions));
            return;
        }
        this.removeQueuedAutoTranslationItem(cacheKey);
        const currentTarget = { messageNode, content, text, textOptions, cacheKey, requestOptions };
        const pendingTargets = this.getAutoTranslationPendingTargets(currentTarget);
        const ownerId = this.getTranslationOwnerId(content);
        const targets = pendingTargets.some(target => this.getTranslationOwnerId(target?.content) === ownerId)
            ? pendingTargets
            : [currentTarget, ...pendingTargets];

        if (!canRender) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                currentTarget,
                DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                { canRender }
            );
        }
        targets.forEach(target => {
            if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED
                );
                return;
            }
            if (this.getElementText(target.content, target.textOptions) !== target.text) {
                this.removeAutoTranslationNode(target, cacheKey);
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED
                );
                return;
            }
            if (!this.isAutoTranslationTargetIdentityCurrent(target, currentTarget)) {
                this.removeAutoTranslationNode(target, cacheKey);
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED
                );
                return;
            }
            if (this.isAutoTranslationCacheTargetDrawable(target)) {
                this.queueAutoTranslationRenderTask({
                    kind: "cache",
                    target,
                    translated,
                    cacheKey,
                    requestOptions,
                    priority: target.priority,
                    run: () => this.renderAutoTranslationCacheTarget(target, translated, cacheKey, requestOptions)
                });
            }
            else {
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey, requestOptions },
                    DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                    DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT,
                    { fromCache: true }
                );
            }
        });
        this.clearAutoTranslationPendingTargets(cacheKey);
    }

    // A cached translation may be drawn when its message is in the visible chat or within the draw
    // buffer around it. Without layout (offline tests), fall back to the strict visibility check.
    isAutoTranslationCacheTargetDrawable(target, context = null) {
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
        const near = this.isElementNearChatBand(target.content, context);
        if (near !== null) return near;
        return this.isElementVisibleInViewport(target.messageNode) && this.isElementVisibleInViewport(target.content);
    }

    isElementNearChatBand(element, context = null) {
        const rect = this.getCachedElementRect(element, context);
        if (!rect || !(Number(rect.width) > 0) || !(Number(rect.height) > 0)) return null;
        const band = context?.cacheDrawBand || this.getScrollContainerBand(this.getTranslationScrollContainer(element));
        if (!band) return null;
        const buffer = this.getCachedDrawBufferPx(band);
        return Number(rect.bottom) > band.top - buffer && Number(rect.top) < band.bottom + buffer;
    }

    getCachedDrawBufferPx(band) {
        return Math.max(AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX, (band.bottom - band.top) * AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR);
    }

    // Cached translations need no model request. Discord mounts messages just outside the visible chat
    // as it scrolls; drawing their cached lines there once the chat is still means messages scrolled
    // back into view already show them. Scheduled only where idle callbacks exist (Discord), so offline
    // tests run the pass directly.
    scheduleCachedTranslationDrawPass(delayMs = 0) {
        if (!this.isStarted || this.cachedTranslationDrawTimer || this.cachedTranslationDrawIdle != null) return;
        if (typeof window === "undefined" || typeof window?.requestIdleCallback !== "function") return;
        if (!this.isAutoTranslateEnabled()) return;
        const waitMs = Math.max(Number(delayMs) || 0, this.getAutoTranslationScrollStillRemainingMs());
        this.cachedTranslationDrawTimer = this.unrefTimer(setTimeout(() => {
            this.cachedTranslationDrawTimer = null;
            if (!this.isStarted || typeof window?.requestIdleCallback !== "function") return;
            this.cachedTranslationDrawIdle = window.requestIdleCallback(deadline => {
                this.cachedTranslationDrawIdle = null;
                this.runCachedTranslationDrawPass(deadline);
            }, { timeout: AUTO_TRANSLATE_SCROLL_STILL_MS });
        }, waitMs));
    }

    cancelCachedTranslationDrawPass() {
        if (this.cachedTranslationDrawTimer) clearTimeout(this.cachedTranslationDrawTimer);
        this.cachedTranslationDrawTimer = null;
        if (this.cachedTranslationDrawIdle != null) {
            try { window.cancelIdleCallback?.(this.cachedTranslationDrawIdle); }
            catch {}
        }
        this.cachedTranslationDrawIdle = null;
    }

    runCachedTranslationDrawPass(deadline = null) {
        const stats = { messages: 0, settledMessages: 0, candidates: 0, memoHits: 0, evaluations: 0, queued: 0, pending: false };
        if (!this.isStarted || !this.isAutoTranslateEnabled()) return stats;
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return stats;
        if (this.isDiscordMediaViewerQuiet() || this.isDiscordMediaViewerOpen() || this.isQuickSettingsPanelOpen() || this.isDiscordSettingsSurfaceOpen()) return stats;
        const stillRemainingMs = this.getAutoTranslationScrollStillRemainingMs();
        if (stillRemainingMs > 0) {
            this.scheduleCachedTranslationDrawPass(stillRemainingMs);
            stats.pending = true;
            return stats;
        }
        const passStartedAt = this.getDiagnosticTime();
        try {
            const context = this.createScanContext({ messageNodes: [] });
            const selection = this.getCachedDrawMessageNodes(context);
            if (!selection.nodes.length) return stats;
            context.messageNodes = selection.nodes;
            context.cacheDrawBand = selection.band;
            this.rememberScanRangeElements(selection.nodes, context);
            const requestOptions = this.getAutoTranslationOptions();
            const intakeMode = this.normalizeAutoTranslateIntakeMode(this.settings.ui?.autoTranslateIntakeMode);
            const enhance = intakeMode !== "dom" && this.isBdfdbMessageIntakeAvailable();
            // The budget covers message work, not selection, and the nearest message is always handled.
            const startedAt = this.getDiagnosticTime();
            const idleMs = Number(deadline?.timeRemaining?.());
            const budgetMs = Number.isFinite(idleMs) && idleMs > 1 ? Math.min(AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS, idleMs) : AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS;
            for (const messageNode of selection.nodes) {
                if (this.isCachedDrawMessageSettled(messageNode)) {
                    stats.settledMessages++;
                    continue;
                }
                if (stats.messages > 0 && this.getDiagnosticTime() - startedAt >= budgetMs) {
                    stats.pending = true;
                    break;
                }
                stats.messages++;
                const domCandidates = this.createDomAutoTranslationCandidatesForMessage(messageNode, context);
                const candidates = enhance ? this.createBdfdbAutoTranslationCandidates(context, domCandidates) : domCandidates;
                const record = { configVersion: this.autoTranslationConfigVersion, drawnCount: 0, pendingKeys: [] };
                let settled = true;
                for (const candidate of candidates) {
                    stats.candidates++;
                    const outcome = this.queueCachedDrawForCandidate(candidate, requestOptions, context, stats.evaluations < AUTO_TRANSLATE_CACHE_DRAW_MAX_EVALUATIONS);
                    if (outcome.evaluated) stats.evaluations++;
                    if (outcome.status === "queued") {
                        stats.queued++;
                        if (!outcome.evaluated) stats.memoHits++;
                    }
                    if (outcome.status === "deferred") stats.pending = true;
                    if (outcome.status === "drawn") record.drawnCount++;
                    else if (outcome.status === "nothing") {
                        if (outcome.memoKey) record.pendingKeys.push(outcome.memoKey);
                    }
                    else settled = false;
                }
                if (settled) this.cachedDrawMessageMemo.set(messageNode, record);
                else this.cachedDrawMessageMemo.delete(messageNode);
            }
        }
        catch (error) {
            this.warnSanitized("Cached translation draw pass failed", error);
            return stats;
        }
        if (stats.pending) this.scheduleCachedTranslationDrawPass(AUTO_TRANSLATE_SCROLL_STILL_MS);
        if (stats.queued) {
            this.logDiagnostic("auto.cache-draw", "queued", {
                ...stats,
                ms: Math.round((this.getDiagnosticTime() - passStartedAt) * 10) / 10
            });
        }
        return stats;
    }

    // A message needs no work while its drawn lines are still there and its other targets are
    // still known to have nothing cached (or nothing worth translating) under the current settings.
    isCachedDrawMessageSettled(messageNode) {
        const record = this.cachedDrawMessageMemo?.get?.(messageNode);
        if (!record || record.configVersion !== this.autoTranslationConfigVersion) return false;
        const finishedLines = messageNode.querySelectorAll?.(AUTO_TRANSLATE_FINISHED_LINE_SELECTOR)?.length || 0;
        if (finishedLines < record.drawnCount) return false;
        return record.pendingKeys.every(memoKey => {
            const entry = this.getCachedDrawMemoEntry(memoKey);
            return Boolean(entry) && entry.result !== "hit";
        });
    }

    isDocumentScroller(scroller) {
        return !scroller || (typeof document !== "undefined" && (scroller === document.scrollingElement || scroller === document.documentElement));
    }

    // Mounted messages in and around the visible chat, nearest first. Messages are in document order,
    // top to bottom: a binary search finds the first one not above the chat, then the walk goes outward.
    getCachedDrawMessageNodes(context = null) {
        const firstMessage = document.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR);
        if (!firstMessage) return { nodes: [], band: null };
        let scroller = this.cachedDrawScroller;
        if (!scroller?.isConnected || !scroller.contains?.(firstMessage)) {
            scroller = this.getTranslationScrollContainer(firstMessage);
            // The document fallback only means the chat does not overflow yet, so it is not kept.
            this.cachedDrawScroller = this.isDocumentScroller(scroller) ? null : scroller;
        }
        const band = this.getScrollContainerBand(scroller);
        if (!band) return { nodes: [], band: null };
        const root = this.cachedDrawScroller || firstMessage.closest?.("[data-list-id*='chat-messages']") || firstMessage.parentElement || document;
        const messages = [...(root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR) || [])]
            .filter(node => node?.isConnected && !node.parentElement?.closest?.(DISCORD_MESSAGE_NODE_SELECTOR));
        const buffer = this.getCachedDrawBufferPx(band);
        const measure = index => {
            const rect = this.getCachedElementRect(messages[index], context);
            if (!rect || !(Number(rect.height) > 0)) return null;
            const top = Number(rect.top);
            const bottom = Number(rect.bottom);
            const distance = bottom <= band.top ? band.top - bottom : top >= band.bottom ? top - band.bottom : 0;
            return { node: messages[index], top, bottom, distance };
        };
        let low = 0;
        let high = messages.length;
        while (low < high) {
            const middle = (low + high) >> 1;
            const rect = this.getCachedElementRect(messages[middle], context);
            if (rect && Number(rect.bottom) <= band.top) low = middle + 1;
            else high = middle;
        }
        const nearby = [];
        let below = 0;
        for (let index = low; index < messages.length && below < AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES; index++) {
            const entry = measure(index);
            if (!entry) continue;
            if (entry.top >= band.bottom + buffer) break;
            nearby.push(entry);
            below++;
        }
        let above = 0;
        for (let index = low - 1; index >= 0 && above < AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES; index--) {
            const entry = measure(index);
            if (!entry) continue;
            if (entry.bottom <= band.top - buffer) break;
            nearby.push(entry);
            above++;
        }
        nearby.sort((left, right) => left.distance - right.distance || left.top - right.top);
        return { nodes: nearby.slice(0, AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES).map(entry => entry.node), band };
    }

    // Outcome statuses: drawn (already shows a finished line), nothing (memoised skip or miss),
    // queued, deferred (evaluation cap reached) or pending (a hit that cannot be drawn yet).
    queueCachedDrawForCandidate(candidate, baseOptions, context = null, allowEvaluation = true) {
        const messageNode = candidate?.messageNode;
        const content = candidate?.content;
        const text = String(candidate?.text || "");
        if (!text || !messageNode?.isConnected || !content?.isConnected) return { status: "nothing" };
        if (this.hasFinishedTranslationLine(content)) return { status: "drawn" };
        const memoKey = this.getCachedDrawMemoKey(candidate, text);
        let entry = this.getCachedDrawMemoEntry(memoKey);
        const evaluated = !entry;
        if (!entry) {
            if (!allowEvaluation) return { status: "deferred" };
            entry = this.lookupCachedDrawTranslation(candidate, baseOptions, context);
            this.rememberCachedDrawMemoEntry(memoKey, entry);
        }
        if (entry.result !== "hit") return { status: "nothing", memoKey, evaluated };
        if (!this.isAutoTranslationCacheTargetDrawable({ messageNode, content }, context)) return { status: "pending", evaluated };
        // Drawing from the memo counts as a cache hit: keep the entry fresh like a regular lookup would.
        if (!evaluated && entry.valueKey) this.touchTranslationCache(entry.valueKey, { extendExpiry: true, persistDelayMs: TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS });
        this.removeQueuedAutoTranslationItem(entry.cacheKey);
        const target = {
            messageNode,
            content,
            text,
            textOptions: candidate.textOptions || null,
            targetKind: candidate.targetKind || "message",
            cacheKey: entry.cacheKey,
            requestOptions: entry.requestOptions,
            priority: this.getCachedDrawPriority(content, context)
        };
        this.queueAutoTranslationRenderTask({
            kind: "cache",
            target,
            translated: entry.translated,
            cacheKey: entry.cacheKey,
            requestOptions: entry.requestOptions,
            priority: target.priority,
            run: () => this.renderAutoTranslationCacheTarget(target, entry.translated, entry.cacheKey, entry.requestOptions, { drawPass: true, deleteKeys: entry.keys })
        });
        return { status: "queued", evaluated };
    }

    hasFinishedTranslationLine(content) {
        return this.getTranslationLines(content).some(line => !line.classList?.contains?.("dait-translation-loading")
            && !line.classList?.contains?.("dait-translation-error"));
    }

    // Same lookups as the regular scan (evaluateAutoTranslationCandidate), without its side effects.
    lookupCachedDrawTranslation(candidate, baseOptions, context = null) {
        const text = String(candidate?.text || "");
        if (this.getAutoTranslationPrecheckSkipReason(text, baseOptions)) return { result: "skip" };
        const requestOptions = this.withAutoTranslationCandidateIdentity(this.getAutoTranslationRequestOptionsForText(text, baseOptions), candidate);
        const cacheKey = this.getTranslationCacheKey(text, requestOptions);
        const cacheAliases = this.getTranslationCacheAliases(text, requestOptions);
        const textCacheKey = this.getAutoTextTranslationCacheKey(text, requestOptions);
        const textCacheAliases = this.getAutoTextTranslationCacheAliases(text, requestOptions);
        const keys = [cacheKey, ...cacheAliases, textCacheKey, ...textCacheAliases].filter(Boolean);
        let translated = this.hasTranslationCacheCandidate(cacheKey, cacheAliases)
            ? this.getTranslationCacheValueCached(cacheKey, cacheAliases, context)
            : null;
        if (translated === null && this.hasTranslationCacheCandidate(textCacheKey, textCacheAliases)) {
            translated = this.getTranslationCacheValueCached(textCacheKey, textCacheAliases, context);
        }
        // Invalid entries are left for the regular scan to discard.
        if (translated === null || this.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) return { result: "miss", keys };
        return { result: "hit", cacheKey, translated, requestOptions, keys };
    }

    getCachedDrawMemoKey(candidate, text) {
        const messageNode = candidate?.messageNode;
        const messageId = String(messageNode?.id || messageNode?.getAttribute?.("data-list-item-id") || "");
        if (!messageId) return "";
        return [this.getCurrentRouteKey(), messageId, candidate?.targetKind || "message", this.getStrongTextFingerprint(text)].join("|");
    }

    // Entries last until settings change. A hit also needs its cached value to be unchanged and
    // unexpired; a miss ends as soon as one of the keys it looked up is cached.
    getCachedDrawMemoEntry(memoKey) {
        const entry = memoKey ? this.cachedDrawMemo?.get?.(memoKey) : null;
        if (!entry) return null;
        let stale = entry.configVersion !== this.autoTranslationConfigVersion;
        if (!stale && entry.result === "miss") stale = entry.keys.some(key => this.translationCache.has(key));
        if (!stale && entry.result === "hit") {
            entry.valueKey = entry.keys.find(key => this.translationCache.get(key) === entry.translated) || "";
            stale = !entry.valueKey || this.isTranslationCacheEntryExpired(this.translationCacheMeta.get(entry.valueKey) || {});
        }
        if (!stale) return entry;
        this.cachedDrawMemo.delete(memoKey);
        return null;
    }

    rememberCachedDrawMemoEntry(memoKey, entry) {
        if (!memoKey || !entry) return;
        if (!this.cachedDrawMemo?.set) this.cachedDrawMemo = new Map();
        entry.configVersion = this.autoTranslationConfigVersion;
        this.cachedDrawMemo.delete(memoKey);
        this.cachedDrawMemo.set(memoKey, entry);
        while (this.cachedDrawMemo.size > AUTO_TRANSLATE_CACHE_DRAW_MEMO_MAX) {
            this.cachedDrawMemo.delete(this.cachedDrawMemo.keys().next().value);
        }
    }

    getCachedDrawPriority(content, context = null) {
        const rect = this.getCachedElementRect(content, context);
        const band = context?.cacheDrawBand;
        if (!rect || !band) return undefined;
        if (Number(rect.bottom) <= band.top) return AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE + band.top - Number(rect.bottom);
        if (Number(rect.top) >= band.bottom) return AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE + Number(rect.top) - band.bottom;
        return Math.max(0, Number(rect.top));
    }

    queueAutoTranslationRenderTask(task) {
        if (!task?.target || typeof task.run !== "function") return false;
        const key = task.key || this.getAutoTranslationRenderTaskKey(task.kind, task.target, task.cacheKey, task.target?.text);
        if (!key) return false;
        const queuedTask = { ...task, key };
        const existingTask = this.autoTranslationRenderQueuedTasks?.get?.(key);
        if (existingTask) {
            Object.assign(existingTask, queuedTask);
        }
        else {
            this.autoTranslationRenderQueue.push(queuedTask);
            this.autoTranslationRenderQueuedKeys.add(key);
            this.autoTranslationRenderQueuedTasks.set(key, queuedTask);
        }
        if (queuedTask.cacheKey) this.autoTranslationRenderPendingKeys.add(queuedTask.cacheKey);
        this.autoTranslationRenderQueueDirty = true;
        this.scheduleAutoTranslationRenderQueue();
        return true;
    }

    getAutoTranslationRenderTaskKey(kind, target, cacheKey = "", text = "") {
        return this.translationRenderer.getTaskKey(kind, target, cacheKey, text);
    }

    scheduleAutoTranslationRenderQueue(delayMs = 0) {
        if (!this.autoTranslationRenderQueue.length || !this.isStarted) return;
        const delay = Math.max(0, Number(delayMs) || 0);
        const dueAt = Date.now() + delay;
        if (this.autoTranslationRenderRaf) {
            if (delay > 0) return;
            return;
        }
        if (this.autoTranslationRenderTimer) {
            if (this.autoTranslationRenderDueAt && this.autoTranslationRenderDueAt <= dueAt) return;
            clearTimeout(this.autoTranslationRenderTimer);
            this.autoTranslationRenderTimer = null;
            this.autoTranslationRenderDueAt = 0;
        }
        if (delay > 0) {
            this.autoTranslationRenderDueAt = dueAt;
            this.autoTranslationRenderTimer = setTimeout(() => {
                this.autoTranslationRenderTimer = null;
                this.autoTranslationRenderDueAt = 0;
                this.processAutoTranslationRenderQueue();
            }, delay);
            return;
        }
        const raf = typeof window !== "undefined" && typeof window.requestAnimationFrame === "function"
            ? window.requestAnimationFrame.bind(window)
            : (typeof requestAnimationFrame === "function" ? requestAnimationFrame : null);
        if (raf) {
            this.autoTranslationRenderRaf = raf(() => {
                this.autoTranslationRenderRaf = null;
                this.processAutoTranslationRenderQueue();
            });
            return;
        }
        this.processAutoTranslationRenderQueue();
    }

    cancelAutoTranslationRenderQueue(options = {}) {
        this.autoTranslationRenderQueue = [];
        this.autoTranslationRenderQueuedKeys?.clear?.();
        this.autoTranslationRenderQueuedTasks?.clear?.();
        this.autoTranslationRenderPendingKeys?.clear?.();
        this.autoTranslationRenderQueueDirty = false;
        if (this.autoTranslationRenderTimer) {
            clearTimeout(this.autoTranslationRenderTimer);
            this.autoTranslationRenderTimer = null;
            this.autoTranslationRenderDueAt = 0;
        }
        if (this.autoTranslationRenderRaf) {
            const cancel = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
                ? window.cancelAnimationFrame.bind(window)
                : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
            try { cancel?.(this.autoTranslationRenderRaf); }
            catch {}
            this.autoTranslationRenderRaf = null;
        }
        if (options.log) {
            this.logDiagnostic("auto.render.queue", "cancelled", {
                reasonCode: DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED
            });
        }
    }

    getAutoTranslationRenderQueueDelayMs(now = Date.now(), options = {}) {
        return this.translationRenderer.getQueueDelayMs(now, options);
    }

    isAutoTranslationRenderTaskHeavy(task) {
        return this.translationRenderer.isTaskHeavy(task);
    }

    processAutoTranslationRenderQueue() {
        if (!this.isStarted) {
            this.cancelAutoTranslationRenderQueue();
            return;
        }
        if (!this.autoTranslationRenderQueue.length) return;
        if (this.isQuickSettingsPanelOpen()) {
            this.quickSettingsRenderDeferred = true;
            this.logDiagnostic("auto.render.queue", "deferred", {
                reasonCode: DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                reason: "quick-settings-open",
                remaining: this.autoTranslationRenderQueue.length
            });
            return;
        }
        const now = Date.now();
        const delayMs = this.getAutoTranslationRenderQueueDelayMs(now);
        // While scroll pauses block other renders, cached translations may still be drawn.
        let cacheTasksOnly = false;
        if (delayMs > 0) {
            const hasCacheTasks = this.autoTranslationRenderQueue.some(task => task?.kind === "cache");
            const cacheDelayMs = hasCacheTasks ? this.getAutoTranslationRenderQueueDelayMs(now, { cacheTasks: true }) : delayMs;
            if (!hasCacheTasks || cacheDelayMs > 0) {
                this.scheduleAutoTranslationRenderQueue(Math.min(delayMs, cacheDelayMs));
                return;
            }
            cacheTasksOnly = true;
        }

        const startedAt = Date.now();
        let rendered = 0;
        if (this.autoTranslationRenderQueueDirty) {
            this.translationRenderer.sortQueue(this.autoTranslationRenderQueue);
            this.autoTranslationRenderQueueDirty = false;
        }
        while (this.autoTranslationRenderQueue.length && rendered < AUTO_TRANSLATE_RENDER_MAX_PER_FRAME) {
            if (rendered > 0 && Date.now() - startedAt >= AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS) break;
            const index = cacheTasksOnly ? this.autoTranslationRenderQueue.findIndex(task => task?.kind === "cache") : 0;
            if (index < 0) break;
            const task = this.autoTranslationRenderQueue[index];
            if (rendered > 0 && this.isAutoTranslationRenderTaskHeavy(task)) break;
            this.autoTranslationRenderQueue.splice(index, 1);
            if (task?.key) {
                const queuedTask = this.autoTranslationRenderQueuedTasks?.get?.(task.key);
                if (!queuedTask || queuedTask === task) {
                    this.autoTranslationRenderQueuedTasks?.delete?.(task.key);
                    this.autoTranslationRenderQueuedKeys.delete(task.key);
                }
            }
            try {
                task?.run?.();
            }
            catch (error) {
                this.warnSanitized("Failed to run queued auto translation render", error);
            }
            finally {
                // Another queued render for the same translation keeps it counted as active.
                if (task?.cacheKey && !this.autoTranslationRenderQueue.some(queued => queued?.cacheKey === task.cacheKey)) {
                    this.autoTranslationRenderPendingKeys?.delete?.(task.cacheKey);
                }
            }
            rendered++;
            if (this.isAutoTranslationRenderTaskHeavy(task)) break;
            if (Date.now() - startedAt >= AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS) break;
        }

        if (this.autoTranslationRenderQueue.length) {
            const remainingCacheTasks = this.autoTranslationRenderQueue.some(task => task?.kind === "cache");
            this.scheduleAutoTranslationRenderQueue(cacheTasksOnly && !remainingCacheTasks ? this.getAutoTranslationRenderQueueDelayMs(Date.now()) : 0);
        }
        this.logSlowOperation("auto.render.queue", startedAt, {
            rendered,
            remaining: this.autoTranslationRenderQueue.length
        });
    }

    renderAutoTranslationCacheTarget(target, translated, cacheKey, requestOptions = null, options = {}) {
        if (!this.isAutoTranslationRenderRequestCurrent(requestOptions)) {
            this.removeAutoTranslationNode(target, cacheKey);
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_REQUEST_STALE
            );
            return false;
        }
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED
            );
            return false;
        }
        if (this.getElementText(target.content, target.textOptions) !== target.text) {
            this.removeAutoTranslationNode(target, cacheKey);
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED
            );
            return false;
        }
        if (!this.isAutoTranslationTargetIdentityCurrent(target, { cacheKey, requestOptions })) {
            this.removeAutoTranslationNode(target, cacheKey);
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED
            );
            return false;
        }
        if (!this.isAutoTranslationCacheTargetDrawable(target)) {
            // The draw pass re-checks on its next run, so it needs no rescan of its own.
            if (options.drawPass) return false;
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT,
                { fromCache: true }
            );
            this.scheduleAutoTranslationRetryScan(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return false;
        }
        // Cache tasks only run once the scroller is still, so scroll correction is safe even during the pause.
        const renderedLine = this.renderTranslation(target.messageNode, target.content, translated, cacheKey, target.text, { allowScrollCorrectionWhilePaused: true });
        if (!renderedLine) {
            // Emoji images could not be restored: per contract the translation must be
            // neither shown nor kept cached, and the message must stay eligible for rescan.
            this.deleteTranslationCacheCandidates(cacheKey, ...(options.deleteKeys || []));
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                { fromCache: true, invalidReason: "emoji-restore-failed" }
            );
            return false;
        }
        this.rememberRecentAutoTranslationRender(cacheKey, target.text, requestOptions, {
            validationQuality: TRANSLATION_VALIDATION_QUALITIES.GOOD
        });
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "rendered",
            { ...target, cacheKey, requestOptions },
            DIAGNOSTIC_MESSAGE_STATES.RENDERED,
            DIAGNOSTIC_REASON_CODES.RENDERED,
            { fromCache: true }
        );
        return true;
    }

    getAutoTranslationTargets(messageNode, context = this.createScanContext()) {
        if (context?.targetsByMessage?.has(messageNode)) return context.targetsByMessage.get(messageNode);
        const targets = [];
        if (!this.isAutoTranslationTargetInScanRange(messageNode, context)) {
            context?.targetsByMessage?.set(messageNode, targets);
            return targets;
        }

        for (const content of this.getMessageContentElements(messageNode, context)) {
            if (!content || !this.isAutoTranslationTargetInScanRange(content, context)) continue;
            const text = this.getCachedElementText(content, context);
            if (text) targets.push({ messageNode, content, text, textOptions: null, targetKind: "message" });
        }

        for (const preview of this.getReplyPreviewElements(messageNode)) {
            if (!this.isAutoTranslationTargetInScanRange(preview, context)) continue;
            const textOptions = { includeReplyPreview: true };
            const text = this.getCachedElementText(preview, context, textOptions);
            if (text) targets.push({ messageNode, content: preview, text, textOptions, targetKind: "reply-preview" });
        }

        context?.targetsByMessage?.set(messageNode, targets);
        return targets;
    }

    getReplyPreviewElements(messageNode) {
        if (messageNode?.querySelector && !messageNode.querySelector("[class*='repliedMessage'], [class*='repliedTextPreview'], [class*='quotedChatMessage']")) {
            return [];
        }

        const selectors = [
            "[class*='repliedTextPreview']",
            "[class*='repliedTextContent']",
            "[class*='quotedChatMessage'] [class*='markup']",
            "[class*='repliedMessage'] [class*='markup']"
        ].join(",");
        const candidates = [...(messageNode?.querySelectorAll?.(selectors) || [])];
        return candidates.filter((candidate, index, all) => {
            if (!candidate || all.indexOf(candidate) !== index) return false;
            if (all.some(other => other !== candidate && candidate.contains?.(other))) return false;
            if (candidate.closest(".dait-translation-box, .dait-translation-line, [class*='embed'], [class*='attachment']")) return false;
            if (!this.isReplyPreviewElement(candidate)) return false;
            return true;
        });
    }

    getReadyAutoTranslationTargets(item) {
        if (!this.isAutoTranslationRequestCurrent(item?.requestOptions)) return [];
        return this.getAutoTranslationPendingTargets(item)
            .map(target => {
                const next = { ...target };
                delete next.priority;
                return this.withAutoTranslationPriority(next);
            })
            .filter(target => this.isAutoTranslationTargetReady(target, item?.cacheKey))
            .sort((left, right) => (left?.priority ?? Number.MAX_SAFE_INTEGER) - (right?.priority ?? Number.MAX_SAFE_INTEGER));
    }

    getAutoTranslationPrimaryTarget(target) {
        return {
            messageNode: target.messageNode,
            content: target.content,
            text: target.text,
            textOptions: target.textOptions,
            targetKind: target.targetKind,
            priority: target.priority
        };
    }

    isAutoTranslationTargetVisibleCached(target, context = null) {
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) return false;
        const contentVisible = this.isElementVisibleInViewportCached(target.content, context);
        if (!contentVisible) return false;
        return this.isElementVisibleInViewportCached(target.messageNode, context)
            || this.isAutoTranslationContentInsideMessage(target);
    }

    isAutoTranslationContentInsideMessage(target) {
        const messageNode = target?.messageNode;
        const content = target?.content;
        if (!messageNode || !content) return false;
        if (messageNode === content) return true;
        return Boolean(messageNode.contains?.(content) || content.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) === messageNode);
    }

    normalizeHistoryBackfillLimit(value) {
        const number = Number(value);
        const normalized = Number.isFinite(number) ? Math.round(number) : DEFAULT_SETTINGS.ui.historyBackfillLimit;
        return Math.min(100, Math.max(1, normalized || DEFAULT_SETTINGS.ui.historyBackfillLimit));
    }

    parseProviderFallbackOrderText(value) {
        const raw = Array.isArray(value)
            ? value
            : String(value || "").split(/[\s,;|]+/);
        const seen = new Set();
        const order = [];
        raw.forEach(provider => {
            const normalized = String(provider || "").trim();
            if (!PROVIDER_ORDER.includes(normalized) || seen.has(normalized)) return;
            seen.add(normalized);
            order.push(normalized);
        });
        return order;
    }

    formatProviderFallbackOrder(order = this.settings.ui?.providerFallbackOrder) {
        return this.parseProviderFallbackOrderText(order).join(", ");
    }

    normalizeMessageButtonVisibility(value) {
        return value === MESSAGE_BUTTON_VISIBILITY_HOVER
            ? MESSAGE_BUTTON_VISIBILITY_HOVER
            : MESSAGE_BUTTON_VISIBILITY_ALWAYS;
    }

    renderAutoTranslationResult(item, translated) {
        if (!this.isAutoTranslationRenderRequestCurrent(item.requestOptions)) return;
        translated = this.sanitizeAutoTranslationOutput(item.text, translated, this.getAutoTranslationTargetLanguage(item.requestOptions), this.getAutoTranslationOutputValidationOptions(item.text, translated, item.requestOptions));
        const validation = this.getAutoTranslationOutputValidationResult(
            item.text,
            translated,
            this.getAutoTranslationTargetLanguage(item.requestOptions),
            this.getAutoTranslationOutputValidationOptions(item.text, translated, item.requestOptions),
            item.requestOptions
        );
        if (!validation.renderable) {
            const error = this.createFinalInvalidAutoTranslationError(validation.reasonCode || "invalid-output");
            this.logDiagnostic("auto.render", "reject-invalid-output", {
                key: this.getTextFingerprint(item?.cacheKey || ""),
                sourceHash: this.getStrongTextFingerprint(item?.text || ""),
                valueLength: String(translated || "").length,
                invalidReason: validation.reasonCode || "",
                validationQuality: validation.quality
            });
            error.autoTranslationValidationQuality = validation.quality;
            this.markAutoTranslationFailureSafely(item, error, { markProvider: false });
            return;
        }
        if (validation.quality !== TRANSLATION_VALIDATION_QUALITIES.GOOD) {
            this.logDiagnostic("auto.render", "validation-accepted", {
                key: this.getTextFingerprint(item?.cacheKey || ""),
                sourceHash: this.getStrongTextFingerprint(item?.text || ""),
                valueLength: String(translated || "").length,
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || "",
                cacheable: validation.cacheable
            });
        }

        const now = Date.now();
        const renderBlocked = this.translationRenderer.isRequestRenderBlocked(now);
        if (renderBlocked && validation.cacheable) {
            if (validation.cacheable && (this.hasCacheableAutoTranslationTarget(item) || (!this.hasInvalidAutoTranslationTarget(item) && this.shouldCacheAutoTranslationResultFromRequest(item)))) {
                this.cacheAutoTranslationResult(item, translated);
                this.cacheAutoTranslationIdentityUpgrades(item, translated);
            }
            const retryMs = Math.max(
                this.getAutoTranslationRenderPauseRemainingMs(now),
                this.getAutoTranslationViewportSettleRemainingMs(now),
                this.getAutoTranslationJumpCooldownRemainingMs(now),
                AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS
            );
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                item,
                DIAGNOSTIC_MESSAGE_STATES.CACHED,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                {
                    retryMs,
                    renderPaused: this.isAutoTranslationRenderPaused(now),
                    viewportSettling: this.isAutoTranslationViewportSettling(now),
                    jumpCoolingDown: this.isAutoTranslationJumpCoolingDown(now)
                }
            );
            this.scheduleAutoTranslationRetryScan(retryMs, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        let cacheable = false;
        let sawInvalidTarget = false;
        const upgradedCacheTargets = new Map();
        const targets = this.getAutoTranslationPendingTargets(item);
        try {
            targets.forEach(target => {
                try {
                    if (!target.messageNode.isConnected || !target.content.isConnected) {
                        this.logAutoTranslationRenderSkip(item, target, "disconnected");
                        return;
                    }
                    if (this.getElementText(target.content, target.textOptions) !== target.text) {
                        this.removeAutoTranslationNode(target, item.cacheKey);
                        this.logAutoTranslationRenderSkip(item, target, "text-changed");
                        sawInvalidTarget = true;
                        return;
                    }
                    const identityUpgrade = this.getAutoTranslationTargetIdentityUpgrade(target, item);
                    if (!this.isAutoTranslationTargetIdentityCurrent(target, item) && !identityUpgrade) {
                        this.removeAutoTranslationNode(target, item.cacheKey);
                        this.logAutoTranslationRenderSkip(item, target, "identity-changed");
                        sawInvalidTarget = true;
                        return;
                    }
                    const renderCacheKey = identityUpgrade?.cacheKey || item.cacheKey;
                    if (identityUpgrade?.cacheKey) upgradedCacheTargets.set(identityUpgrade.cacheKey, identityUpgrade);
                    cacheable = true;
                    if (this.hasManualTranslationLine(target.content, target.text)) {
                        this.logAutoTranslationRenderSkip(item, target, "manual-line");
                        return;
                    }
                    if (this.isElementVisibleInViewport(target.messageNode) && this.isElementVisibleInViewport(target.content)) {
                        this.queueAutoTranslationRenderTask({
                            kind: "request",
                            target,
                            translated,
                            cacheKey: renderCacheKey,
                            requestOptions: target?.requestOptions || item?.requestOptions,
                            priority: target.priority,
                            run: () => this.renderAutoTranslationRequestTarget(item, target, translated, validation)
                        });
                    }
                    else {
                        this.logAutoTranslationRenderSkip(item, target, "outside-viewport");
                    }
                }
                catch (error) {
                    try { this.removeAutoTranslationNode(target, item.cacheKey); }
                    catch {}
                    this.warnSanitized("Failed to render auto translation target", error);
                }
            });
        }
        finally {
            this.clearAutoTranslationPendingTargets(item.cacheKey);
        }
        if (validation.cacheable && (cacheable || (!sawInvalidTarget && this.shouldCacheAutoTranslationResultFromRequest(item)))) {
            this.cacheAutoTranslationResult(item, translated);
            upgradedCacheTargets.forEach(upgrade => this.cacheAutoTranslationResultWithOptions(upgrade.cacheKey, item.text, upgrade.requestOptions, translated));
        }
        if (this.isAutoTranslateEnabled()) {
            this.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
        }
    }

    renderAutoTranslationRequestTarget(item, target, translated, validation = null) {
        const requestOptions = target?.requestOptions || item?.requestOptions;
        const validationResult = validation || this.getAutoTranslationOutputValidationResult(
            target?.text || item?.text || "",
            translated,
            this.getAutoTranslationTargetLanguage(requestOptions),
            this.getAutoTranslationOutputValidationOptions(target?.text || item?.text || "", translated, requestOptions),
            requestOptions
        );
        if (!this.isAutoTranslationRenderRequestCurrent(requestOptions)) {
            this.removeAutoTranslationLoadingNode(target, item?.cacheKey, { force: true });
            this.removeAutoTranslationNode(target, item?.cacheKey);
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey: item?.cacheKey, requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_REQUEST_STALE
            );
            return false;
        }
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
            this.logAutoTranslationRenderSkip(item, target, "disconnected");
            return false;
        }
        if (this.getElementText(target.content, target.textOptions) !== target.text) {
            this.removeAutoTranslationNode(target, item.cacheKey);
            this.logAutoTranslationRenderSkip(item, target, "text-changed");
            return false;
        }
        const identityUpgrade = this.getAutoTranslationTargetIdentityUpgrade(target, item);
        if (!this.isAutoTranslationTargetIdentityCurrent(target, item) && !identityUpgrade) {
            this.removeAutoTranslationNode(target, item.cacheKey);
            this.logAutoTranslationRenderSkip(item, target, "identity-changed");
            return false;
        }
        const renderCacheKey = identityUpgrade?.cacheKey || item.cacheKey;
        if (identityUpgrade?.cacheKey && validationResult.cacheable) this.cacheAutoTranslationResultWithOptions(identityUpgrade.cacheKey, item.text, identityUpgrade.requestOptions, translated);
        if (this.hasManualTranslationLine(target.content, target.text)) {
            this.logAutoTranslationRenderSkip(item, target, "manual-line");
            return false;
        }
        if (!this.isElementVisibleInViewport(target.messageNode) || !this.isElementVisibleInViewport(target.content)) {
            this.logAutoTranslationRenderSkip(item, target, "outside-viewport");
            return false;
        }
        const renderedLine = this.renderTranslation(target.messageNode, target.content, translated, renderCacheKey, target.text, {
            partial: validationResult.quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
            validationQuality: validationResult.quality,
            validationReason: validationResult.reasonCode || ""
        });
        if (!renderedLine) {
            // Emoji images could not be restored: drop the cached result and report a skip
            // instead of marking the message as rendered.
            this.deleteTranslationCacheCandidates(renderCacheKey);
            if (item?.cacheKey && item.cacheKey !== renderCacheKey) this.deleteTranslationCacheCandidates(item.cacheKey);
            this.logAutoTranslationRenderSkip(item, target, "emoji-restore-failed");
            return false;
        }
        this.rememberRecentAutoTranslationRender(renderCacheKey, target.text, requestOptions, {
            validationQuality: validationResult.quality,
            validationReason: validationResult.reasonCode || ""
        });
        if (item?.cacheKey && item.cacheKey !== renderCacheKey) {
            this.rememberRecentAutoTranslationRender(item.cacheKey, target.text, item.requestOptions || requestOptions, {
                validationQuality: validationResult.quality,
                validationReason: validationResult.reasonCode || ""
            });
        }
        this.logDiagnostic("auto.render", "ok", {
            ...this.getAutoTranslationDiagnosticMeta({ ...target, cacheKey: renderCacheKey, requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest }, DIAGNOSTIC_MESSAGE_STATES.RENDERED, DIAGNOSTIC_REASON_CODES.RENDERED),
            key: this.getTextFingerprint(renderCacheKey),
            sourceHash: this.getStrongTextFingerprint(target.text),
            prefetch: Boolean(item?.daitPrefetchRequest),
            identityUpgrade: Boolean(identityUpgrade),
            validationQuality: validationResult.quality,
            validationReason: validationResult.reasonCode || ""
        });
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "rendered",
            { ...target, cacheKey: renderCacheKey, requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
            DIAGNOSTIC_MESSAGE_STATES.RENDERED,
            DIAGNOSTIC_REASON_CODES.RENDERED,
            { identityUpgrade: Boolean(identityUpgrade), validationQuality: validationResult.quality, validationReason: validationResult.reasonCode || "" }
        );
        return true;
    }

    isSafeTranslationIdentityUpgrade(expectedIdentity, currentIdentity, target = null) {
        const expected = this.getTranslationIdentitySummary(expectedIdentity);
        const current = this.getTranslationIdentitySummary(currentIdentity);
        if (!expected.channelId || expected.channelId !== current.channelId) return false;
        if (!expected.targetKind || expected.targetKind !== current.targetKind) return false;
        if (!expected.sourceHash || expected.sourceHash !== current.sourceHash) return false;
        if (expected.kind === "fallback" && current.kind === "message") {
            return this.isSafeFallbackToMessageIdentityUpgrade(expected, current, target);
        }
        if (expected.kind === "fallback" && current.kind === "fallback") {
            return this.isSafeFallbackTranslationIdentityUpgrade(expected, current, target);
        }
        return false;
    }

    isSafeFallbackToMessageIdentityUpgrade(expected, current, target = null) {
        if (!current.messageId || !target?.messageNode || !target?.content) return false;
        const fallback = this.getCurrentFallbackTranslationIdentitySummary(target, {
            guildId: current.guildId,
            channelId: current.channelId
        });
        if (!fallback) return false;
        if (expected.channelId !== fallback.channelId || expected.sourceHash !== fallback.sourceHash || expected.targetKind !== fallback.targetKind) return false;
        return this.isSafeFallbackTranslationIdentityUpgrade(expected, fallback, target);
    }

    isSafeFallbackTranslationIdentityUpgrade(expected, current, target = null) {
        if (expected.guildId && current.guildId && expected.guildId !== current.guildId) return false;
        const expectedAuthor = this.normalizeFallbackIdentityField(expected.authorId, "unknown-author");
        const currentAuthor = this.normalizeFallbackIdentityField(current.authorId, "unknown-author");
        if (expectedAuthor && currentAuthor && expectedAuthor !== currentAuthor) return false;
        if (expectedAuthor && !currentAuthor) return false;
        const expectedTimestamp = this.normalizeFallbackIdentityField(expected.timestamp, "unknown-time");
        const currentTimestamp = this.normalizeFallbackIdentityField(current.timestamp, "unknown-time");
        if (expectedTimestamp && currentTimestamp && expectedTimestamp !== currentTimestamp) return false;
        if (expectedTimestamp && !currentTimestamp) return false;

        const ownerId = this.peekTranslationOwnerId(target?.content);
        if (!ownerId) return false;
        const sameAuthor = Boolean(expectedAuthor && currentAuthor && expectedAuthor === currentAuthor);
        const sameTimestamp = Boolean(expectedTimestamp && currentTimestamp && expectedTimestamp === currentTimestamp);
        const sameDomFingerprint = this.isUsableFallbackIdentityHash(expected.domHash, "no-dom-fingerprint")
            && this.isUsableFallbackIdentityHash(current.domHash, "no-dom-fingerprint")
            && expected.domHash === current.domHash;
        const sameNeighborFingerprint = this.isUsableFallbackIdentityHash(expected.neighborHash, "no-neighbor-context")
            && this.isUsableFallbackIdentityHash(current.neighborHash, "no-neighbor-context")
            && expected.neighborHash === current.neighborHash;
        if (this.hasConflictingFallbackIdentityHash(expected.domHash, current.domHash, "no-dom-fingerprint")) return false;
        if (this.hasConflictingFallbackIdentityHash(expected.neighborHash, current.neighborHash, "no-neighbor-context")) return false;
        return Boolean(sameTimestamp || (sameAuthor && (sameDomFingerprint || sameNeighborFingerprint)) || (sameDomFingerprint && sameNeighborFingerprint));
    }

    getCurrentFallbackTranslationIdentitySummary(target, ids = {}) {
        if (!target?.messageNode || !target?.content) return null;
        const text = target.text || this.getElementText(target.content, target.textOptions);
        const identity = this.messageTracker.getFallbackIdentity(target.messageNode, target.content, text, ids);
        return this.getTranslationIdentitySummary(identity);
    }

    isUsableFallbackIdentityHash(value, emptyMarker) {
        const text = String(value || "");
        return Boolean(text && text !== this.getTextFingerprint(emptyMarker));
    }

    hasConflictingFallbackIdentityHash(left, right, emptyMarker) {
        return this.isUsableFallbackIdentityHash(left, emptyMarker)
            && this.isUsableFallbackIdentityHash(right, emptyMarker)
            && left !== right;
    }

    normalizeFallbackIdentityField(value, unknownValue) {
        const text = String(value || "").trim();
        return text && text !== unknownValue ? text : "";
    }

    getTranslationIdentitySummary(identity) {
        const parts = String(identity || "").split(":");
        const summary = {
            kind: parts[0] || "",
            guildId: parts[1] || "",
            channelId: parts[2] || "",
            targetKind: parts.length >= 2 ? parts[parts.length - 2] : "",
            sourceHash: parts.length >= 1 ? parts[parts.length - 1] : ""
        };
        if (summary.kind === "fallback") {
            const tailIndex = Math.max(5, parts.length - 5);
            summary.authorId = parts[3] || "";
            summary.timestamp = parts.slice(4, tailIndex).join(":") || "";
            summary.routeHash = parts[tailIndex] || "";
            summary.domHash = parts[tailIndex + 1] || "";
            summary.neighborHash = parts[tailIndex + 2] || "";
        }
        else if (summary.kind === "message" || summary.kind === "reply") {
            summary.messageId = parts[3] || "";
        }
        return summary;
    }

    logAutoTranslationRenderSkip(item, target, reason) {
        const reasonMap = {
            disconnected: DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED,
            "text-changed": DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED,
            "identity-changed": DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED,
            "manual-line": DIAGNOSTIC_REASON_CODES.MANUAL_LINE_PRESENT,
            "outside-viewport": DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT
        };
        const staleReasons = new Set(["disconnected", "text-changed", "identity-changed"]);
        const reasonCode = reasonMap[reason] || reason;
        const messageState = staleReasons.has(reason)
            ? DIAGNOSTIC_MESSAGE_STATES.STALE
            : DIAGNOSTIC_MESSAGE_STATES.CACHED;
        this.logDiagnostic("auto.render", "skip", {
            ...this.getAutoTranslationDiagnosticMeta({ ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest }, messageState, reasonCode),
            reason,
            reasonCode,
            messageState,
            key: this.getTextFingerprint(item?.cacheKey || ""),
            sourceHash: this.getStrongTextFingerprint(target?.text || item?.text || ""),
            prefetch: Boolean(item?.daitPrefetchRequest)
        });
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "render-skip",
            { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
            messageState,
            reasonCode
        );
    }

    renderAutoTranslationResultSafely(item, translated) {
        try {
            this.renderAutoTranslationResult(item, translated);
            return true;
        }
        catch (error) {
            this.warnSanitized("Failed to render auto translation", error);
            try {
                this.clearPendingAutoTranslationItem(item);
            }
            catch (cleanupError) {
                this.warnSanitized("Failed to clean up auto translation after render error", cleanupError);
            }
            return false;
        }
    }

    renderPendingAutoTranslationLoadingSafely(item) {
        if (this.getAutoTranslationProviderFailure(item?.requestOptions)?.type === "local-unavailable") {
            this.removeAutoTranslationLoadingForItem(item, { force: true });
            return false;
        }
        try {
            this.renderPendingAutoTranslationLoading(item);
            return true;
        }
        catch (error) {
            this.warnSanitized("Failed to render auto translation loading", error);
            return false;
        }
    }

    hasManualTranslationLine(content, sourceText = null) {
        const line = this.getTranslationLine(content);
        if (!line || line.dataset?.daitMode !== "manual") return false;
        const text = sourceText ?? this.getElementText(content);
        return this.isTranslationLineSourceMatch(line, text);
    }

    clearAutoTextTranslationFailure(text, requestOptions = this.getAutoTranslationOptions()) {
        const key = this.getAutoTextTranslationFailureKey(text, requestOptions);
        if (key) {
            this.autoTranslationFailures.delete(key);
            this.autoTranslationFailureHistory.delete(key);
        }
    }

    markAutoTextTranslationFailure(item, error, failure = null) {
        if (!error?.autoTranslationTerminalFailure) return;
        if (item?.daitPrefetchRequest) return;
        if (this.getAutoTranslationFailureType(error) === "invalid-output") return;
        const key = this.getAutoTextTranslationFailureKey(item?.text || "", item?.requestOptions || this.getAutoTranslationOptions());
        if (!key) return;
        this.autoTranslationFailures.set(key, failure || this.createAutoTranslationFailure(key, error));
        this.pruneAutoTranslationFailureMapSize();
    }

    removeAutoTranslationNode(target, cacheKey) {
        if (this.isAutoTranslationRenderPaused()) {
            this.scheduleAutoTranslationRetryScan(this.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        const line = this.getTranslationLine(target.content);
        if (!line) return;
        if (line.dataset.daitMode === "manual") return;
        if (cacheKey && !this.isTranslationLineCacheMatch(line, cacheKey, this.getTranslationLineCacheAliases(target?.text || "", target?.requestOptions || {}))) return;
        this.restoreTranslationSourceVisibility(target.content);
        line.remove();
    }

    removeAutoTranslationLoadingForItem(item, options = {}) {
        if (!item?.cacheKey) return;
        this.getAutoTranslationPendingTargets(item).forEach(target => this.removeAutoTranslationLoadingNode(target, item.cacheKey, options));
    }

    removeAutoTranslationLoadingNode(target, cacheKey, options = {}) {
        if (!options.force && this.isAutoTranslationRenderPaused()) {
            this.scheduleAutoTranslationRetryScan(this.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        const line = this.getTranslationLine(target?.content);
        if (!line?.classList?.contains?.("dait-translation-loading")) return;
        if (line.dataset?.daitMode === "manual") return;
        if (cacheKey && !this.isTranslationLineCacheMatch(line, cacheKey, this.getTranslationLineCacheAliases(target?.text || "", target?.requestOptions || {}))) return;
        this.restoreTranslationSourceVisibility(target.content);
        line.remove();
    }

    isTranslationLineCacheMatch(line, cacheKey, cacheAliases = []) {
        const keys = [cacheKey, ...cacheAliases].filter(Boolean);
        if (!keys.length) return true;
        const cacheSigs = new Set(keys.map(key => this.getStrongTextFingerprint(key)));
        const cacheKeys = new Set(keys.map(key => this.getTextFingerprint(key)));
        if (line?.dataset?.daitCacheSig && cacheSigs.has(line.dataset.daitCacheSig)) return true;
        return Boolean(line?.dataset?.daitCacheKey && cacheKeys.has(line.dataset.daitCacheKey));
    }

    shouldRenderAutoTranslationFailure(error) {
        if (this.getAutoTranslationFailureType(error) !== "invalid-output") return false;
        if (this.shouldShowAutoTranslationWarning(error)) return true;
        return Boolean(error?.autoTranslationFinalInvalidOutput
            && Number(error?.autoTranslationFailureCount || 0) >= AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT);
    }

    renderAutoTranslationFailure(target, cacheKey, error) {
        if (this.isAutoTranslationRenderPaused()) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED,
                { type: this.getAutoTranslationFailureType(error) }
            );
            this.scheduleAutoTranslationRetryScan(this.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        if (!target?.messageNode?.isConnected || !target?.content?.isConnected) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED,
                { type: this.getAutoTranslationFailureType(error) }
            );
            this.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        if (!this.isElementVisibleInViewport(target.messageNode) || !this.isElementVisibleInViewport(target.content)) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.FAILED,
                DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT,
                { type: this.getAutoTranslationFailureType(error) }
            );
            this.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        if (this.getElementText(target.content, target.textOptions) !== target.text) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_TEXT_CHANGED,
                { type: this.getAutoTranslationFailureType(error) }
            );
            this.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        const requestOptions = target?.requestOptions || {};
        if (!this.isAutoTranslationTargetIdentityCurrent(target, { cacheKey, requestOptions })) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-skip",
                { ...target, cacheKey, requestOptions },
                DIAGNOSTIC_MESSAGE_STATES.STALE,
                DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED,
                { type: this.getAutoTranslationFailureType(error) }
            );
            this.removeAutoTranslationNode(target, cacheKey);
            return;
        }
        this.renderTranslationError(target.messageNode, target.content, error, cacheKey, target.text);
        this.logAutoTranslationMessageState(
            "auto.message.state",
            "failure-rendered",
            { ...target, cacheKey },
            DIAGNOSTIC_MESSAGE_STATES.FAILED,
            DIAGNOSTIC_REASON_CODES.RENDERED,
            { type: this.getAutoTranslationFailureType(error) }
        );
    }

    renderPendingAutoTranslationLoading(item) {
        if (this.isAutoTranslationRenderPaused()) {
            this.logAutoTranslationMessageState(
                "auto.message.state",
                "render-deferred",
                item,
                DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                DIAGNOSTIC_REASON_CODES.RENDER_DEFERRED
            );
            this.scheduleAutoTranslationRetryScan(this.getAutoTranslationRenderPauseRemainingMs(), { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            return;
        }
        this.getAutoTranslationPendingTargets(item).forEach(target => {
            if (!this.isAutoTranslationTargetIdentityCurrent(target, item)) {
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    DIAGNOSTIC_MESSAGE_STATES.STALE,
                    DIAGNOSTIC_REASON_CODES.RENDER_IDENTITY_CHANGED
                );
                return;
            }
            if (target.messageNode.isConnected && target.content.isConnected && this.isElementVisibleInViewport(target.messageNode) && this.isElementVisibleInViewport(target.content) && this.getElementText(target.content, target.textOptions) === target.text) {
                this.renderTranslationLoading(target.messageNode, target.content, item.cacheKey, target.text);
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "loading",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                    DIAGNOSTIC_REASON_CODES.REQUEST_STARTED
                );
            }
            else {
                this.logAutoTranslationMessageState(
                    "auto.message.state",
                    "render-skip",
                    { ...target, cacheKey: item?.cacheKey, requestOptions: target?.requestOptions || item?.requestOptions, daitPrefetchRequest: item?.daitPrefetchRequest },
                    target.messageNode?.isConnected && target.content?.isConnected ? DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT : DIAGNOSTIC_MESSAGE_STATES.STALE,
                    target.messageNode?.isConnected && target.content?.isConnected ? DIAGNOSTIC_REASON_CODES.RENDER_OUTSIDE_VIEWPORT : DIAGNOSTIC_REASON_CODES.RENDER_DISCONNECTED
                );
            }
        });
    }

    getPromptPolicyVersion(policyName) {
        const key = String(policyName || "").trim();
        return PROMPT_POLICY_VERSIONS[key] || PROMPT_POLICY_VERSIONS.manual;
    }

    getPromptPolicyCacheVersion(kind = "translation", options = {}, config = null) {
        const effectiveConfig = config || this.getEffectiveTaskConfig(kind, options?.configOverrides);
        if (kind === "translation" && this.isGoogleTranslateProvider(effectiveConfig)) return this.getPromptPolicyVersion("googleCloud");
        const explicit = options?.promptPolicyVersion
            || options?.configOverrides?.promptPolicyVersion
            || effectiveConfig?.promptPolicyVersion;
        if (explicit) return String(explicit).trim();
        if (kind === "polish") return this.getPromptPolicyVersion("polish");

        const mode = String(options?.promptPolicyMode || options?.mode || "").trim();
        const policyByMode = {
            manual: "manual",
            "manual-force-target": "manualForceTarget",
            "manual-repair": "manualRepair",
            auto: "auto",
            "auto-batch": "autoBatch",
            "auto-batch-retry": "autoBatchRetry",
            "auto-retry": "autoRetry",
            "auto-final-fallback": "autoFinalFallback",
            "long-text": "longText",
            "public-bilingual": "publicBilingual",
            "public-bilingual-retry": "publicBilingualRetry",
            "public-bilingual-final": "publicBilingualFinal"
        };
        return this.getPromptPolicyVersion(policyByMode[mode] || "manual");
    }

    joinPromptPolicyLines(lines) {
        return lines
            .filter(line => line !== undefined && line !== null)
            .map(line => String(line))
            .join("\n");
    }

    buildPromptPolicyPrompt(policyName, context = {}) {
        const targetLanguage = String(context.targetLanguage || "").trim();
        const basePrompt = String(context.basePrompt || "").trim();
        const count = Math.max(1, Math.round(Number(context.count) || 1));
        const previousInvalidOutput = String(context.previousInvalidOutput || "").slice(0, 500);
        const sourceText = String(context.sourceText || "").slice(0, 4000);
        const invalidReason = String(context.invalidReason || "").slice(0, 120);

        switch (policyName) {
            case "manualForceTarget":
                return this.joinPromptPolicyLines([
                    "Manual user-triggered translation rescue.",
                    `Translate SOURCE_MESSAGE into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    "The previous output was rejected because it was not a usable target-language translation.",
                    "Translate the source from scratch. Do not copy the source language, transliterate, explain, label, quote, summarize, censor, or refuse.",
                    "Preserve URLs, mentions, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, file paths, usernames, product names, numbers, and exact technical tokens.",
                    "If the message is short, slang, vulgar, threatening, adult, political, commercial, or informal, still translate it directly as chat text.",
                    "",
                    "<previous_invalid_output>",
                    previousInvalidOutput,
                    "</previous_invalid_output>",
                    "",
                    "<source_message>",
                    sourceText,
                    "</source_message>"
                ]);
            case "manualRepair":
                return this.joinPromptPolicyLines([
                    "Manual translation repair.",
                    `Repair the failed translation into ${targetLanguage}.`,
                    `Return only the corrected ${targetLanguage} translation.`,
                    "Use SOURCE_MESSAGE as the source of truth and FAILED_OUTPUT only as a rejected draft.",
                    "Do not copy source-language human text unless it is a proper noun, URL, mention, code, ID, username, product/model name, number, address token, or exact technical token.",
                    "Do not explain, label, quote, summarize, censor, moralize, refuse, output JSON, or include alternatives.",
                    "",
                    "<failure_reason>",
                    invalidReason || "invalid-output",
                    "</failure_reason>",
                    "",
                    "<failed_output>",
                    previousInvalidOutput,
                    "</failed_output>",
                    "",
                    "<source_message>",
                    sourceText,
                    "</source_message>"
                ]);
            case "auto":
                return this.joinPromptPolicyLines([
                    basePrompt,
                    "",
                    "Automatic channel translation mode:",
                    `Translate the user message into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}.`,
                    "The input may be Russian, Hindi, English, Spanish, French, Vietnamese, Korean, Japanese, Arabic, Chinese, or another language.",
                    "Do not keep the source language, do not transliterate, do not romanize, and do not merely rewrite the source text.",
                    "If the message contains slang or very short chat text, translate the meaning naturally.",
                    "If the message has multiple lines, translate every line and preserve the line breaks. Do not omit short or informal lines.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, and other exact technical tokens."
                ]);
            case "autoBatch":
                return this.joinPromptPolicyLines([
                    basePrompt,
                    "",
                    "Batch automatic channel translation mode:",
                    "The user message is a JSON array of objects with id and text.",
                    `Translate every text into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    `Return exactly ${count} JSON objects, one for each input object, preserving the same id values and order.`,
                    "Return only valid JSON. Do not wrap it in Markdown.",
                    "Required output shape: [{\"id\":\"001\",\"translation\":\"...\"}].",
                    "If an input text has multiple lines, translate every line and preserve the line breaks inside the translation string.",
                    "Never omit a source line, even if it is short, slang, repeated, or looks informal.",
                    "Do not leave source-language chat text untranslated, do not transliterate, and do not romanize.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, product names, and exact technical tokens."
                ]);
            case "autoBatchRetry":
                return this.joinPromptPolicyLines([
                    "Strict batch automatic channel translation retry:",
                    "The user message is a JSON array of objects with id and text.",
                    `Translate every text into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    `Return exactly ${count} JSON objects, one for each input object, preserving the same id values and order.`,
                    "Return only valid JSON. Do not wrap it in Markdown.",
                    "Required output shape: [{\"id\":\"001\",\"translation\":\"...\"}].",
                    "Translate all human-language text. Do not leave Russian, Hindi, English, Spanish, French, Vietnamese, Korean, Japanese, Arabic, or Chinese source text untranslated unless it is a proper noun.",
                    "If an input text has multiple lines, translate every line and preserve the line breaks inside the translation string.",
                    "Never output question marks or placeholder characters instead of translation.",
                    "Do not explain, label, quote, transliterate, romanize, or include alternatives.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, product names, and exact technical tokens."
                ]);
            case "autoRetry":
                return this.joinPromptPolicyLines([
                    "Strict automatic channel translation retry:",
                    `Translate SOURCE_MESSAGE into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}.`,
                    "Translate all human-language text. Do not leave Russian, Hindi, English, Spanish, French, Vietnamese, Korean, Japanese, Arabic, or Chinese source text untranslated unless it is a proper noun.",
                    "If SOURCE_MESSAGE has multiple lines, translate every line and preserve the line breaks. Do not omit short or informal lines.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, product names, and exact technical tokens.",
                    "Never output question marks or placeholder characters instead of translation.",
                    "Do not explain, label, quote, transliterate, romanize, or include alternatives.",
                    "",
                    "<previous_invalid_output>",
                    previousInvalidOutput,
                    "</previous_invalid_output>",
                    "",
                    "<source_message>",
                    sourceText,
                    "</source_message>"
                ]);
            case "autoFinalFallback":
                return this.joinPromptPolicyLines([
                    "Final strict translation rescue.",
                    `Translate the entire SOURCE_MESSAGE into ${targetLanguage}.`,
                    `Return only ${targetLanguage}.`,
                    "No explanations. No labels. No JSON. No Markdown code fence.",
                    "Do not copy the source language. Do not transliterate. Do not output placeholders or question marks.",
                    "Preserve only URLs, mentions, emoji, code, IDs, usernames, product names, numbers, and other exact technical tokens.",
                    "If there are multiple lines, translate every line and preserve line breaks.",
                    "",
                    "SOURCE_MESSAGE:",
                    sourceText
                ]);
            case "longText":
                return this.joinPromptPolicyLines([
                    basePrompt,
                    "",
                    "Long automatic channel translation mode:",
                    `Translate the whole message into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    "Preserve paragraph order, line breaks, list structure, Markdown, code blocks, URLs, mentions, emoji, IDs, usernames, product names, and exact technical tokens.",
                    "Translate every human-language sentence. Do not omit, summarize, merge unrelated paragraphs, or output JSON.",
                    "Return only the translated message."
                ]);
            case "publicBilingual":
                return this.joinPromptPolicyLines([
                    "Public bilingual outgoing Discord message mode:",
                    `Translate the user's draft into ${targetLanguage}.`,
                    "The translated text will be sent publicly above a hidden spoiler containing the original draft.",
                    "Preserve the original meaning, tone, intent, mentions, URLs, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, file paths, product names, usernames, and technical terms.",
                    "If the draft mixes languages, translate only the human-language parts that need translation and keep existing target-language text natural.",
                    "Do not add explanations, labels, quotes, summaries, censorship, or alternatives.",
                    "Return only the translated message."
                ]);
            case "publicBilingualRetry":
                return this.joinPromptPolicyLines([
                    "Strict public bilingual draft translation retry:",
                    `Translate SOURCE_DRAFT into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    "Translate all human-language text. Do not leave source-language chat text untranslated unless it is a proper noun or exact technical token.",
                    "Preserve URLs, mentions, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, file paths, product names, usernames, and technical terms.",
                    "Do not explain, label, quote, transliterate, romanize, summarize, or include alternatives.",
                    "",
                    "<previous_invalid_output>",
                    previousInvalidOutput,
                    "</previous_invalid_output>",
                    "",
                    "<source_draft>",
                    sourceText,
                    "</source_draft>"
                ]);
            case "publicBilingualFinal":
                return this.joinPromptPolicyLines([
                    "Final public bilingual draft translation rescue.",
                    `Translate the entire SOURCE_DRAFT into ${targetLanguage}.`,
                    `Return only ${targetLanguage}.`,
                    "No explanations. No labels. No JSON. No Markdown code fence.",
                    "Do not copy the source language. Do not transliterate. Do not output placeholders or question marks.",
                    "Preserve only URLs, mentions, emoji, code, IDs, usernames, product names, numbers, file paths, and exact technical tokens.",
                    "If there are multiple lines, translate every line and preserve line breaks.",
                    "",
                    "SOURCE_DRAFT:",
                    sourceText
                ]);
            default:
                return basePrompt;
        }
    }

    buildPromptPolicySystemPrompt(kind, config) {
        if (kind === "translation" && config?.localCompactPrompt && this.isLocalTranslationProvider(config)) {
            const compactPrompt = String(config.prompt || "").trim();
            if (compactPrompt) return compactPrompt;
        }
        const sourceLanguage = this.getLanguageInstruction(config.sourceLanguage, { source: true });
        const targetLanguage = this.getLanguageInstruction(config.targetLanguage);
        const userTemplate = this.expandPrompt(config.prompt, targetLanguage);
        const task = kind === "polish"
            ? "Polish or rewrite the user message according to the template rules."
            : "Translate the user message according to the template rules.";
        const policyVersion = this.getPromptPolicyCacheVersion(kind, { mode: kind === "polish" ? "polish" : "manual" }, config);

        return this.joinPromptPolicyLines([
            "You are a multilingual Discord assistant.",
            `Prompt policy version: ${policyVersion}.`,
            "The user template may be written in Chinese, English, Korean, French, or another language.",
            "Treat the user template as behavior instructions only. Do not translate or output the template itself.",
            `Task type: ${kind}.`,
            `Task: ${task}`,
            `Input language: ${sourceLanguage}.`,
            `Output language: ${targetLanguage}.`,
            "If the input language is auto-detect, infer it from the user message.",
            "Always produce the final answer in the output language.",
            "Preserve mentions, URLs, Markdown, emoji, code blocks, IDs, and proper nouns unless the template explicitly says otherwise.",
            "Return only the final message. Do not include explanations, labels, alternatives, or notes.",
            "",
            "<user_template>",
            userTemplate,
            "</user_template>"
        ]);
    }

    buildPromptPolicyAutoBatchPrompt(count, options = this.getAutoTranslationOptions()) {
        return this.buildPromptPolicyPrompt("autoBatch", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            basePrompt: options?.configOverrides?.prompt || this.settings.translation.prompt,
            count
        });
    }

    buildPromptPolicyAutoBatchRetryPrompt(count, options = this.getAutoTranslationOptions()) {
        return this.buildPromptPolicyPrompt("autoBatchRetry", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            count
        });
    }

    buildPromptPolicyAutoRetryPrompt(sourceText, badOutput = "", options = this.getAutoTranslationOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const previousInvalidOutput = this.hasPromptLeakageAutoTranslationOutput(sourceText, badOutput, targetLanguageValue)
            ? "[Rejected prompt/instruction leakage output]"
            : String(badOutput || "").slice(0, 500);
        return this.buildPromptPolicyPrompt("autoRetry", {
            targetLanguage: this.getAutoTranslationTargetInstruction(targetLanguageValue),
            previousInvalidOutput,
            sourceText
        });
    }

    buildPromptPolicyAutoFinalFallbackPrompt(sourceText, options = this.getAutoTranslationOptions()) {
        return this.buildPromptPolicyPrompt("autoFinalFallback", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            sourceText
        });
    }

    buildPromptPolicyManualForceTargetPrompt(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        return this.buildPromptPolicyPrompt("manualForceTarget", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            previousInvalidOutput: String(badOutput || "").slice(0, 500),
            invalidReason,
            sourceText
        });
    }

    buildPromptPolicyManualRepairPrompt(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        return this.buildPromptPolicyPrompt("manualRepair", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            previousInvalidOutput: String(badOutput || "").slice(0, 800),
            invalidReason,
            sourceText
        });
    }

    buildPromptPolicyPublicBilingualPrompt(targetLanguageValue = this.getPublicBilingualTargetLanguage()) {
        return this.buildPromptPolicyPrompt("publicBilingual", {
            targetLanguage: this.getAutoTranslationTargetInstruction(targetLanguageValue)
        });
    }

    buildPromptPolicyPublicBilingualRetryPrompt(sourceText, badOutput = "", options = this.getPublicBilingualTranslationOptions()) {
        return this.buildPromptPolicyPrompt("publicBilingualRetry", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            previousInvalidOutput: String(badOutput || "").slice(0, 500),
            sourceText
        });
    }

    buildPromptPolicyPublicBilingualFinalPrompt(sourceText, options = this.getPublicBilingualTranslationOptions()) {
        return this.buildPromptPolicyPrompt("publicBilingualFinal", {
            targetLanguage: this.getAutoTranslationTargetInstruction(this.getAutoTranslationTargetLanguage(options)),
            sourceText
        });
    }

    extractTranslationValue(value) {
        if (value === undefined || value === null) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
        if (Array.isArray(value)) {
            for (const item of value) {
                const extracted = this.extractTranslationValue(item);
                if (extracted) return extracted;
            }
            return "";
        }
        if (typeof value !== "object") return "";
        const fields = [
            "translation", "translated", "translatedText", "translated_text", "translationText", "translation_text",
            "target", "targetText", "target_text", "message", "content", "text", "output", "result", "response",
            "answer", "value"
        ];
        for (const field of fields) {
            if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
            const extracted = this.extractTranslationValue(value[field]);
            if (extracted) return extracted;
        }
        if (Array.isArray(value.candidates)) {
            for (const candidate of value.candidates) {
                const extracted = this.extractTranslationValue(candidate);
                if (extracted) return extracted;
            }
        }
        return "";
    }

    async runDirectTranslationBatchTask(texts, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        const originalTexts = texts.map(text => String(text || ""));
        const uniqueTexts = [];
        const uniqueIndexes = [];
        const indexByText = new Map();
        originalTexts.forEach(text => {
            if (!indexByText.has(text)) {
                indexByText.set(text, uniqueTexts.length);
                uniqueTexts.push(text);
            }
            uniqueIndexes.push(indexByText.get(text));
        });
        const uniqueResults = await this.runModelTask("translation", uniqueTexts, {
            configOverrides: options.configOverrides,
            translateAsArray: true,
            timeoutMs: AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
            mode: options.mode || "direct-translate-batch"
        });
        const resultArray = Array.isArray(uniqueResults) ? uniqueResults : [uniqueResults];
        return uniqueIndexes.map(index => String(resultArray[index] || "").trim());
    }

    async runGoogleTranslationBatchTask(texts, options = this.getAutoTranslationOptions(), taskOptions = {}) {
        return this.runDirectTranslationBatchTask(texts, options, taskOptions);
    }

    normalizeBatchRowId(id) {
        const value = String(id ?? "").trim();
        if (!value) return "";
        if (/^\d+$/.test(value)) return value.padStart(3, "0").slice(-3);
        return value;
    }

    extractBatchRowTranslation(row) {
        if (typeof row === "string") return row;
        return this.extractTranslationValue(row);
    }

    getManualTranslationRequestOptions() {
        const autoOptions = this.getAutoTranslationOptions();
        return {
            ...autoOptions,
            mode: "manual",
            providerKey: this.getAutoTranslationProviderKey(autoOptions),
            requestContext: {}
        };
    }

    createAutoBatchParseError(message) {
        const error = new Error(message);
        error.code = "AUTO_BATCH_PARSE_FAILED";
        return error;
    }

    isAutoBatchFallbackError(error) {
        return error?.code === "AUTO_BATCH_PARSE_FAILED";
    }

    extractJsonPayload(text) {
        const value = String(text || "").trim();
        const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const source = fenced ? fenced[1].trim() : value;
        if (!source) return source;
        try {
            JSON.parse(source);
            return source;
        }
        catch {
        }

        const extracted = this.findFirstJsonPayload(source);
        return extracted || source;
    }

    findFirstJsonPayload(source) {
        const text = String(source || "");
        for (let start = 0; start < text.length; start++) {
            const open = text[start];
            if (open !== "{" && open !== "[") continue;

            const stack = [];
            let inString = false;
            let escaped = false;
            for (let index = start; index < text.length; index++) {
                const char = text[index];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === "\"") inString = false;
                    continue;
                }

                if (char === "\"") {
                    inString = true;
                    continue;
                }
                if (char === "{" || char === "[") {
                    stack.push(char === "{" ? "}" : "]");
                    continue;
                }
                if (char !== "}" && char !== "]") continue;
                if (stack.pop() !== char) break;
                if (stack.length !== 0) continue;

                const candidate = text.slice(start, index + 1);
                try {
                    JSON.parse(candidate);
                    return candidate;
                }
                catch {
                    break;
                }
            }
        }

        return "";
    }

    getManualForceTargetTranslationOptions(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.isLocalAutoTranslationOptions(options);
        return {
            ...options,
            mode: "manual-force-target",
            promptPolicyVersion: this.getPromptPolicyVersion("manualForceTarget"),
            targetLanguage: targetLanguageValue,
            providerKey: this.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.getPromptPolicyVersion("manualForceTarget"),
                localCompactPrompt: isLocalProvider,
                prompt: this.buildPromptPolicyManualForceTargetPrompt(sourceText, badOutput, invalidReason, options)
            }
        };
    }

    getManualRepairTranslationOptions(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.isLocalAutoTranslationOptions(options);
        return {
            ...options,
            mode: "manual-repair",
            promptPolicyVersion: this.getPromptPolicyVersion("manualRepair"),
            targetLanguage: targetLanguageValue,
            providerKey: this.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.getPromptPolicyVersion("manualRepair"),
                localCompactPrompt: isLocalProvider,
                prompt: this.buildPromptPolicyManualRepairPrompt(sourceText, badOutput, invalidReason, options)
            }
        };
    }

    getChineseLanguageInstruction(language) {
        const target = this.normalizeLanguageName(language);
        if (target === "繁體中文") return "Traditional Chinese (繁體中文, zh-TW). Use Traditional Chinese characters only; do not use Simplified Chinese.";
        if (["汉语", "中文", "Chinese"].includes(target)) return "Simplified Chinese (中文, zh-CN). Use Simplified Chinese characters unless preserving exact names, URLs, code, or quoted text.";
        return "";
    }

    isTargetLanguageWithPreservedSourceTerms(text, targetLanguage, sourceText = "") {
        if (!String(sourceText || "").trim()) return false;
        const chunks = this.getSentenceLikeChunks(text)
            .filter(chunk => this.hasLetters(chunk) && !this.isLikelyPreservedTokenLine(chunk));
        if (!chunks.length) return false;
        return chunks.every(chunk => this.isTargetLanguageLineWithPreservedSourceTerms(chunk, targetLanguage, sourceText));
    }

    isTargetLanguageLineWithPreservedSourceTerms(line, targetLanguage, sourceText = "") {
        if (!String(sourceText || "").trim()) return false;
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "latin" || targetScript === "unknown") return false;

        const segments = this.getLanguageScriptSegments(line);
        const targetLetters = segments
            .filter(segment => segment.script === targetScript)
            .reduce((total, segment) => total + segment.text.replace(/[^\p{L}]/gu, "").length, 0);
        if (targetLetters <= 0) return false;

        const foreignSegments = segments
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!foreignSegments.length) return false;
        if (foreignSegments.some(segment => segment.script !== "latin")) return false;

        return foreignSegments.every(segment => this.isPreservableSourceLatinSegment(segment.text, sourceText));
    }

    isPreservableSourceLatinSegment(segmentText, sourceText) {
        const words = String(segmentText || "").match(/[A-Za-z\u00c0-\u024f][A-Za-z\u00c0-\u024f0-9+_.-]*/g) || [];
        if (!words.length || words.length > 5) return false;
        const normalizedSegment = this.normalizeComparableLatinText(segmentText);
        const normalizedSource = this.normalizeComparableLatinText(sourceText);
        if (!normalizedSegment || !this.isComparableLatinSegmentInSource(normalizedSegment, normalizedSource)) return false;

        const meaningfulWords = words.filter(word => this.hasLetters(word));
        if (!meaningfulWords.length) return false;
        if (meaningfulWords.every(word => this.isBenignEmbeddedLatinToken(word))) return true;
        if (meaningfulWords.every(word => this.isCommonResidualEnglishWord(word))) return false;

        const hasNamedShape = meaningfulWords.some(word => this.isNamedLatinTermShape(word));
        const hasPlanOrTechSuffix = meaningfulWords.some(word => this.isPlanOrTechLatinSuffix(word));
        const commonResidualWords = meaningfulWords.filter(word => this.isCommonResidualEnglishWord(word));
        if (commonResidualWords.length) {
            if (!hasNamedShape) return false;
            if (!commonResidualWords.every(word => this.isResidualEnglishNameConnectorWord(word))) return false;
        }
        const hasUnknownNameWord = meaningfulWords.some(word => {
            const normalized = this.normalizeLatinWord(word);
            return normalized.length >= 3
                && !this.isCommonResidualEnglishWord(word)
                && !this.isBenignEmbeddedLatinToken(word)
                && !this.isPlanOrTechLatinSuffix(word);
        });

        return hasNamedShape || (hasPlanOrTechSuffix && hasUnknownNameWord);
    }

    isResidualEnglishNameConnectorWord(word) {
        const normalized = this.normalizeLatinWord(word);
        const connectors = new Set(["the", "of", "and", "for", "in"]);
        return connectors.has(normalized);
    }

    isLikelyResidualSourceLatinWord(word, sourceText) {
        const normalized = this.normalizeLatinWord(word);
        if (normalized.length < 3) return false;
        if (this.isBenignEmbeddedLatinToken(word)) return false;
        if (this.isNamedLatinTermShape(word) || this.isPlanOrTechLatinSuffix(word)) return false;
        const sourceTokens = this.normalizeComparableLatinText(sourceText).split(/\s+/).filter(Boolean);
        if (!sourceTokens.includes(normalized)) return false;
        if (this.isCommonResidualEnglishWord(word)) return true;
        return this.isResidualEnglishActionOrDomainWord(word);
    }

    isResidualEnglishActionOrDomainWord(word) {
        const normalized = this.normalizeLatinWord(word);
        const residual = new Set([
            "account", "access", "bank", "button", "card", "contact", "failed", "failing",
            "fails", "failure", "login", "order", "payment", "problem", "refresh", "response",
            "retry", "risk", "scan", "screenshot", "server", "status", "transfer", "verify",
            "verified", "verification"
        ]);
        return residual.has(normalized)
            || /(?:ing|ed|tion|ment|ance|ence|able|ible|less|ful)$/i.test(normalized);
    }

    isComparableLatinSegmentInSource(normalizedSegment, normalizedSource) {
        if (!normalizedSegment || !normalizedSource) return false;
        if (normalizedSource.includes(normalizedSegment)) return true;
        const sourceTokens = new Set(normalizedSource.split(/\s+/).filter(Boolean));
        const segmentTokens = normalizedSegment.split(/\s+/).filter(Boolean);
        if (!segmentTokens.length) return false;
        return segmentTokens.every(token => sourceTokens.has(token));
    }

    normalizeComparableLatinText(text) {
        return String(text || "")
            .toLocaleLowerCase()
            .replace(/[^a-z0-9+_.-]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    normalizeLatinWord(word) {
        return String(word || "")
            .trim()
            .toLocaleLowerCase()
            .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
    }

    isNamedLatinTermShape(word) {
        const value = String(word || "").trim();
        const normalized = this.normalizeLatinWord(value);
        if (!normalized || this.isCommonResidualEnglishWord(value)) return false;
        if (/[0-9]/.test(value)) return true;
        if (/[a-z][A-Z]/.test(value)) return true;
        if (/^[A-Z]{2,}$/.test(value)) return true;
        if (/^[A-Z][a-z0-9+_.-]{2,}$/.test(value)) return true;
        return false;
    }

    isPlanOrTechLatinSuffix(word) {
        const normalized = this.normalizeLatinWord(word);
        const suffixes = new Set([
            "pro", "plus", "max", "ultra", "lite", "mini", "premium", "enterprise", "business",
            "cloud", "pay", "wallet", "code", "ai", "api", "beta", "alpha", "dev", "studio"
        ]);
        return suffixes.has(normalized);
    }

    isCommonResidualEnglishWord(word) {
        const normalized = this.normalizeLatinWord(word);
        const common = new Set([
            "a", "an", "the", "i", "me", "my", "you", "your", "he", "she", "it", "we", "they",
            "is", "are", "am", "was", "were", "be", "been", "being", "have", "has", "had",
            "do", "does", "did", "can", "could", "will", "would", "should", "may", "might",
            "to", "of", "in", "on", "at", "for", "from", "with", "without", "and", "or", "but",
            "if", "then", "than", "as", "not", "no", "yes", "now", "before", "after", "earlier",
            "this", "that", "these", "those", "there", "here", "what", "when", "where", "why", "how",
            "please", "help", "use", "using", "used", "get", "getting", "got", "make", "made",
            "like", "access", "problem", "message", "text", "chat", "channel", "payment", "scan",
            "send", "sent", "receive", "received", "need", "want", "try", "again"
        ]);
        return common.has(normalized);
    }

    isLikelyPreservedTokenLine(text) {
        const value = String(text || "").trim();
        if (!value || /\s/.test(value)) return false;
        if (/^https?:\/\//i.test(value) || /^www\./i.test(value) || /^<[@#&!]\d+>$/.test(value)) return true;
        const compact = value.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
        if (!compact || /\s/.test(compact)) return false;
        if (/[a-z][A-Z]/.test(compact)
            || /[0-9_:/#@+.]/.test(compact)
            || (/[A-Z]/.test(compact) && compact === compact.toUpperCase() && compact.length > 1)) return true;
        if (/^[\p{L}]+(?:[-'’][\p{L}]+)*$/u.test(compact)) return false;
        if (!/^[\p{L}\p{N}._:/#@+-]+$/u.test(compact)) return false;
        return true;
    }

    showAutoTranslateError(error) {
        if (this.settings.ui?.showAutoTranslateToasts === false) return;
        if (!this.shouldShowAutoTranslationWarning(error)) return;
        const now = Date.now();
        if (now - this.autoTranslationLastToastAt < 10000) return;
        this.autoTranslationLastToastAt = now;
        this.showToast(this.t("autoTranslateFailed", { error: this.formatError(error) }), "error");
    }

    isElementVisibleInViewport(element, rect = null) {
        if (!element?.isConnected) return false;
        if (this.hasHiddenAncestor(element)) return false;
        const elementRect = rect || element?.getBoundingClientRect?.();
        if (!elementRect || elementRect.width <= 0 || elementRect.height <= 0) return false;
        const height = window.innerHeight || document.documentElement.clientHeight || 0;
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        if (!(elementRect.bottom > 0 && elementRect.right > 0 && elementRect.top < height && elementRect.left < width)) return false;
        return this.isVisibleInsideScrollContainers(element, elementRect);
    }

    hasHiddenAncestor(element) {
        let current = element;
        while (current && current.nodeType === 1) {
            if (current.hidden || current.getAttribute?.("aria-hidden") === "true") return true;
            if (typeof getComputedStyle === "function") {
                const style = getComputedStyle(current);
                if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return true;
            }
            current = current.parentElement;
        }
        return false;
    }

    isVisibleInsideScrollContainers(element, rect = element?.getBoundingClientRect?.()) {
        return this.isRectInsideScrollClips(element, rect);
    }

    // The rect must overlap every overflow-clipping ancestor (touching edges count as outside;
    // zero-size ancestors are ignored). The scan also rejects ancestors hidden by style.
    isRectInsideScrollClips(element, rect, context = null, options = {}) {
        if (!rect) return true;
        let current = element?.parentElement;
        while (current && current.nodeType === 1) {
            const info = this.getScrollClipInfo(current, context);
            if (options.checkHidden && info.hidden) return false;
            const clip = info.rect;
            if (clip && (rect.bottom <= clip.top || rect.top >= clip.bottom || rect.right <= clip.left || rect.left >= clip.right)) return false;
            current = current.parentElement;
        }
        return true;
    }

    getScrollClipInfo(element, context = null) {
        const memo = context?.scrollClipByElement;
        if (memo?.has(element)) return memo.get(element);
        const info = { hidden: false, rect: null };
        if (typeof getComputedStyle === "function") {
            const style = getComputedStyle(element);
            info.hidden = style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0";
            if (/(auto|scroll|hidden|clip)/.test(`${style.overflow || ""} ${style.overflowX || ""} ${style.overflowY || ""}`)) {
                const clipRect = this.getCachedElementRect(element, context);
                if (clipRect && clipRect.width > 0 && clipRect.height > 0) info.rect = clipRect;
            }
        }
        memo?.set(element, info);
        return info;
    }

    hasDominantForeignLine(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        const lines = String(text || "")
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => this.hasLetters(line) && !this.isLikelyPreservedTokenLine(line));
        if (!lines.length) return false;

        return lines.some(line => this.isDominantForeignText(line, targetScript));
    }

    isDominantForeignText(text, targetScript) {
        const counts = this.countTextScriptsForValidation(text);
        const targetCount = counts[targetScript] || 0;
        const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul", "other"]
            .filter(script => script !== targetScript);
        const foreignCount = foreignScripts.reduce((total, script) => total + (counts[script] || 0), 0);
        if (foreignCount <= 0 || foreignCount <= targetCount) return false;

        const firstScript = this.getFirstLetterScript(text);
        if (firstScript === targetScript) return false;
        if (firstScript === "latin") {
            const words = this.getMeaningfulLatinWords(text);
            if (words.length >= 2) return true;
            return words.join("").length >= 7;
        }
        return foreignCount >= 2;
    }

    isTargetLanguageLeadWithShortEmbeddedForeignText(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        if (targetScript === "latin") return false;
        const chunks = this.getSentenceLikeChunks(text)
            .filter(chunk => this.hasLetters(chunk) && !this.isLikelyPreservedTokenLine(chunk));
        if (!chunks.length) return false;

        return chunks.every(chunk => {
            if (!this.chunkStartsWithTargetScript(chunk, targetScript)) return false;
            const counts = this.countTextScriptsForValidation(chunk);
            const targetCount = counts[targetScript] || 0;
            if (targetCount < 4) return false;
            const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul", "other"]
                .filter(script => script !== targetScript && (counts[script] || 0) > 0);
            if (!foreignScripts.length) return true;
            if (foreignScripts.some(script => script !== "latin")) return false;
            const foreignWords = this.getForeignMeaningfulWordsForScript(chunk, targetScript);
            return foreignWords.length > 0
                && foreignWords.length <= 4
                && foreignWords.every(word => this.isBenignEmbeddedLatinToken(word));
        });
    }

    isTargetLanguageDominantBySentence(text, targetLanguage, options = {}) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;

        const chunks = this.getSentenceLikeChunks(text)
            .filter(chunk => this.hasLetters(chunk) && !this.isLikelyPreservedTokenLine(chunk));
        if (!chunks.length) return false;

        let targetDominantCount = 0;
        for (const chunk of chunks) {
            if (this.isTargetLanguageDominantChunk(chunk, targetScript, options)) {
                targetDominantCount++;
                continue;
            }
            return false;
        }

        return targetDominantCount > 0 && targetDominantCount === chunks.length;
    }

    getSentenceLikeChunks(text) {
        return String(text || "")
            .split(/[\n\r\u3002\uff01\uff1f!?\uff1b;]+|(?<=[.!?])\s+/u)
            .map(chunk => chunk.trim())
            .filter(Boolean);
    }

    isTargetLanguageDominantChunk(text, targetScript, options = {}) {
        const startsTarget = this.chunkStartsWithTargetScript(text, targetScript);
        const counts = this.countTextScriptsForValidation(text);
        const targetCount = counts[targetScript] || 0;
        if (targetCount < 2) return false;
        const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul", "other"]
            .filter(script => script !== targetScript && (counts[script] || 0) > 0);
        if (foreignScripts.some(script => script !== "latin")) return false;
        const foreignCount = foreignScripts.reduce((total, script) => total + (counts[script] || 0), 0);
        if (foreignCount <= 0) return options?.allowPureTarget === true && targetScript !== "latin";
        const foreignWords = this.getForeignMeaningfulWordsForScript(text, targetScript);
        if (foreignWords.length && foreignWords.every(word => this.isBenignEmbeddedLatinToken(word))) return true;
        if (!startsTarget) return targetCount >= 6 && targetCount >= foreignCount && foreignWords.length <= 2;
        return targetCount >= 6 && targetCount >= foreignCount && foreignWords.length <= 4;
    }

    chunkStartsWithTargetScript(text, targetScript) {
        return this.getFirstLetterScript(text) === targetScript;
    }

    getFirstLetterScript(text) {
        for (const char of String(text || "")) {
            if (!/\p{L}/u.test(char)) continue;
            return this.getCharacterScript(char);
        }
        return "";
    }

    getForeignMeaningfulWordsForScript(text, targetScript) {
        return this.getLanguageScriptSegments(text)
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text))
            .flatMap(segment => segment.script === "latin"
                ? this.getMeaningfulLatinWords(segment.text)
                : [segment.text.replace(/[^\p{L}]/gu, "")].filter(Boolean));
    }

    isTargetLanguageWithBenignEmbeddedForeignTokens(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;

        const segments = this.getLanguageScriptSegments(text);
        const targetLetterCount = segments
            .filter(segment => segment.script === targetScript)
            .reduce((total, segment) => total + segment.text.replace(/[^\p{L}]/gu, "").length, 0);
        if (targetLetterCount <= 0) return false;

        const foreignSegments = segments
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!foreignSegments.length) return false;
        if (foreignSegments.some(segment => segment.script !== "latin")) return false;

        const words = foreignSegments.flatMap(segment => this.getMeaningfulLatinWords(segment.text));
        if (!words.length) return false;
        return words.every(word => this.isBenignEmbeddedLatinToken(word));
    }

    hasTranslatableForeignSegment(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        if (this.isTargetLanguageDominantBySentence(text, targetLanguage)) return false;

        const value = String(text || "");
        const segments = this.getLanguageScriptSegments(value)
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!segments.length) return false;

        return segments.some(segment => {
            const letters = segment.text.replace(/[^\p{L}]/gu, "");
            if (segment.script === "latin") {
                const meaningfulWords = this.getMeaningfulLatinWords(segment.text);
                const meaningfulLetters = meaningfulWords.join("").replace(/[^\p{L}]/gu, "");
                if (meaningfulWords.length >= 2) return true;
                return meaningfulLetters.length >= 8;
                const words = segment.text.match(/[A-Za-zÀ-ɏ]{2,}/g) || [];
                if (words.length >= 2) return true;
                return letters.length >= 8 && !this.isLikelyPreservedTokenLine(segment.text);
            }
            if (["cyrillic", "arabic", "devanagari", "hangul", "kana"].includes(segment.script)) {
                return letters.length >= 2;
            }
            return letters.length >= 4;
        });
    }

    getLanguageScriptSegments(text) {
        const segments = [];
        let currentScript = "";
        let currentText = "";
        const flush = () => {
            const trimmed = currentText.trim();
            if (currentScript && trimmed) segments.push({ script: currentScript, text: trimmed });
            currentScript = "";
            currentText = "";
        };

        for (const char of String(text || "")) {
            const script = this.getCharacterScript(char);
            if (!script) {
                if (currentText) currentText += char;
                continue;
            }
            if (currentScript && script !== currentScript) flush();
            currentScript = script;
            currentText += char;
        }
        flush();
        return segments;
    }

    isLikelyPreservedForeignSegment(text) {
        const value = String(text || "").trim();
        if (!value) return false;
        if (this.isLikelyPreservedTokenLine(value)) return true;
        const tokens = value.match(/[\p{L}\p{N}_:/#@+.-]+/gu) || [];
        const letterTokens = tokens.filter(token => this.hasLetters(token));
        if (!letterTokens.length) return false;
        return letterTokens.every(token => this.isLikelyPreservedTokenLine(token));
    }

    getMeaningfulLatinWords(text) {
        const words = String(text || "").match(/[A-Za-z\u00c0-\u024f]{2,}/g) || [];
        return words.filter(word => !this.isLikelyPreservedTokenLine(word));
    }

    isBenignEmbeddedLatinToken(word) {
        const normalized = String(word || "")
            .trim()
            .toLocaleLowerCase()
            .replace(/['鈥檚]+$/u, "");
        if (!normalized) return false;
        const benign = new Set([
            "ai", "api", "app", "apps", "agent", "agents", "bot", "branch", "bug", "bugs", "build", "cache", "cdn", "cli",
            "client", "code", "commit", "crash", "css", "db", "debug", "dev", "discord", "dns", "dom", "error",
            "feature", "fetch", "flag", "fix", "fixed", "frontend", "gemini", "git", "github", "google", "gpt", "gpu",
            "grok", "hf", "html", "http", "https", "huggingface", "id", "input", "ios", "ip", "issue", "json", "js",
            "latency", "link", "linux", "llm", "log", "mac", "mcp", "merge", "message", "model", "node", "npm",
            "ok", "okay", "ollama", "openai", "output", "plugin", "pr", "prompt", "provider", "react",
            "proxy", "queue", "render", "repo", "request", "response", "retry", "scroll", "server", "status",
            "sakura", "sure", "team", "test", "tests", "timeout", "token", "ts", "typescript", "ui", "url", "ux",
            "version", "viewport", "vite", "vpn", "web", "webhook", "windows", "workflow",
            "anthropic", "baidu", "chatgpt", "claude", "cline", "connector", "connectors", "crassus", "cursor",
            "dashboard", "deepseek", "flash", "glm", "interface", "kimi", "market", "minimax", "moonshot",
            "multiagent", "nvidia", "opencode", "perplexity", "qwen", "reasoning", "sonar", "stack", "stackai",
            "upgrade", "workflow", "workflows", "zhipu"
        ]);
        return benign.has(normalized);
    }

    countTextScriptsForValidation(text) {
        const counts = {
            han: 0,
            latin: 0,
            cyrillic: 0,
            arabic: 0,
            devanagari: 0,
            kana: 0,
            hangul: 0,
            other: 0,
            total: 0
        };

        for (const segment of this.getLanguageScriptSegments(text)) {
            if (this.isLikelyPreservedForeignSegment(segment.text)) continue;
            const segmentText = segment.script === "latin"
                ? this.getMeaningfulLatinWords(segment.text).join(" ")
                : segment.text;
            for (const char of segmentText) {
                const script = this.getCharacterScript(char);
                if (!script) continue;
                counts[script]++;
                counts.total++;
            }
        }

        return counts;
    }

    isLikelyTargetLanguageWithPreservedTokens(text, targetLanguage) {
        if (this.isLikelyTargetLanguage(text, targetLanguage)) return true;
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        const segments = this.getLanguageScriptSegments(text);
        const hasPreservedSegment = segments.some(segment => this.isLikelyPreservedForeignSegment(segment.text));
        if (!hasPreservedSegment) return false;
        const meaningful = segments.filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!meaningful.length) return false;
        if (meaningful.some(segment => segment.script !== targetScript)) return false;
        return meaningful.some(segment => segment.text.replace(/[^\p{L}]/gu, "").length > 0);
    }

    isCommonTargetShortText(text, targetLanguage) {
        const target = this.normalizeLanguageName(targetLanguage);
        if (!["英语", "English"].includes(target)) return false;
        const normalized = String(text || "").trim().toLocaleLowerCase();
        if (!/^[a-z0-9\s'’.,!?-]+$/.test(normalized)) return false;
        const compact = normalized.replace(/[^\w'’]+/g, " ").trim();
        const common = new Set(["hi", "hello", "hey", "ok", "okay", "yes", "no", "thanks", "thank you", "lol", "bro", "same", "sure", "done", "nice", "good", "bad", "why", "what"]);
        return common.has(compact);
    }

    isLikelyJapaneseHanText(text) {
        const compact = String(text || "").replace(/[^\p{Script=Han}]/gu, "");
        if (compact.length < 2) return false;
        const exactPhrases = new Set([
            "\u5927\u4e08\u592b", "\u7121\u6599", "\u767b\u9332", "\u672c\u5f53", "\u672c\u7576",
            "\u4eca\u65e5", "\u660e\u65e5", "\u6628\u65e5", "\u4e86\u89e3"
        ]);
        if (exactPhrases.has(compact)) return true;
        const primarySignals = ["\u7121\u6599", "\u767b\u9332", "\u5927\u4e08\u592b", "\u5bfe\u5fdc", "\u5c02\u9580"];
        if (primarySignals.some(signal => compact.includes(signal))) return true;
        const secondarySignals = ["\u5fc5\u8981", "\u78ba\u8a8d", "\u6700\u9ad8", "\u5834\u5408", "\u4e86\u89e3"];
        return secondarySignals.filter(signal => compact.includes(signal)).length >= 2;
    }

    hasCurrentTranslationLine(content, cacheKey, sourceText = null, cacheAliases = [], requestOptions = null) {
        let line = this.getTranslationLine(content);
        if (!line) line = this.findTranslationLineByMetadata(content, cacheKey, sourceText, cacheAliases);
        if (!line) return false;
        if (this.getTranslationContentForLine(line) !== content && this.isTranslationContentMatchForLine(line, content)) {
            this.retargetTranslationLineToContent(line, content);
        }

        const cacheKeys = [cacheKey, ...cacheAliases].filter(Boolean);
        const requestFingerprints = new Set(cacheKeys.map(key => this.getTextFingerprint(key)));
        const requestSignatures = new Set(cacheKeys.map(key => this.getStrongTextFingerprint(key)));
        const sourceFingerprint = this.getTextFingerprint(sourceText ?? this.getElementText(content));
        const sourceSignature = this.getStrongTextFingerprint(sourceText ?? this.getElementText(content));
        const requestedMode = this.getTranslationCacheMode(cacheKey);
        if (line.dataset.daitSourceSig ? line.dataset.daitSourceSig !== sourceSignature : line.dataset.daitSourceKey !== sourceFingerprint) {
            line.remove();
            return false;
        }
        if (line.classList?.contains?.("dait-translation-error")) return false;
        if (line.classList?.contains?.("dait-translation-loading")) return false;
        if (line.dataset.daitMode === "manual" && this.isAutoTranslationCacheMode(requestedMode)) return true;
        if (line.dataset.daitMode === "auto-text" && this.isAutoTranslationCacheMode(requestedMode)) {
            if (this.removeInvalidCurrentAutoTranslationLine(line, content, sourceText, cacheKey, cacheAliases, requestOptions)) return false;
            return true;
        }

        const identityFingerprint = this.getTranslationIdentityFingerprintFromCacheKey(cacheKey);
        const identitySignature = this.getTranslationIdentitySignatureFromCacheKey(cacheKey);
        if (line.dataset.daitIdentitySig && identitySignature && line.dataset.daitIdentitySig !== identitySignature) {
            line.remove();
            return false;
        }
        if (!line.dataset.daitIdentitySig && line.dataset.daitIdentityKey && identityFingerprint && line.dataset.daitIdentityKey !== identityFingerprint) {
            line.remove();
            return false;
        }

        if (line.dataset.daitCacheSig && requestSignatures.has(line.dataset.daitCacheSig)) {
            if (this.removeInvalidCurrentAutoTranslationLine(line, content, sourceText, cacheKey, cacheAliases, requestOptions)) return false;
            return true;
        }
        if (line.dataset.daitCacheKey && requestFingerprints.has(line.dataset.daitCacheKey)) {
            if (this.removeInvalidCurrentAutoTranslationLine(line, content, sourceText, cacheKey, cacheAliases, requestOptions)) return false;
            return true;
        }

        if (this.isAutoTranslationRenderPaused() && this.isAutoTranslationCacheMode(line.dataset?.daitMode)) return false;
        line.remove();
        return false;
    }

    findTranslationLineByMetadata(content, cacheKey, sourceText = null, cacheAliases = []) {
        if (!content) return null;
        const text = sourceText ?? this.getElementText(content);
        const sourceSig = this.getStrongTextFingerprint(text);
        const sourceKey = this.getTextFingerprint(text);
        const cacheKeys = [cacheKey, ...cacheAliases].filter(Boolean);
        const cacheSigs = new Set(cacheKeys.map(key => this.getStrongTextFingerprint(key)));
        const cacheFingerprints = new Set(cacheKeys.map(key => this.getTextFingerprint(key)));
        const identitySig = this.getTranslationIdentitySignatureFromCacheKey(cacheKey);
        const identityKey = this.getTranslationIdentityFingerprintFromCacheKey(cacheKey);
        const isPreview = this.isReplyPreviewElement(content);
        const scopes = [
            content?.parentElement,
            content?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']")
        ].filter(Boolean);
        const seen = new Set();
        for (const scope of scopes) {
            for (const line of scope?.querySelectorAll?.(".dait-translation-line[data-dait-owner]") || []) {
                if (!line || seen.has(line)) continue;
                seen.add(line);
                if (Boolean(line.classList?.contains?.("dait-translation-preview")) !== isPreview) continue;
                const sourceMatches = line.dataset?.daitSourceSig
                    ? line.dataset.daitSourceSig === sourceSig
                    : line.dataset?.daitSourceKey === sourceKey;
                if (!sourceMatches) continue;
                const cacheMatches = (line.dataset?.daitCacheSig && cacheSigs.has(line.dataset.daitCacheSig))
                    || (line.dataset?.daitCacheKey && cacheFingerprints.has(line.dataset.daitCacheKey));
                const identityMatches = (identitySig && line.dataset?.daitIdentitySig === identitySig)
                    || (identityKey && line.dataset?.daitIdentityKey === identityKey);
                if (cacheMatches || identityMatches) return line;
            }
        }
        return null;
    }

    retargetTranslationLineToContent(line, content) {
        if (!line?.dataset || !content?.dataset) return;
        line.dataset.daitOwner = this.ensureTranslationOwnerId(content);
        this.positionExistingTranslationLine(line, content);
        this.syncTranslationSourceVisibility(line, content);
    }

    removeInvalidCurrentAutoTranslationLine(line, content, sourceText = null, cacheKey = "", cacheAliases = [], requestOptions = null) {
        if (!line || !this.isAutoTranslationCacheMode(line.dataset?.daitMode)) return false;
        const options = requestOptions || this.getAutoTranslationOptions();
        const renderedText = this.getTranslationLineRenderedText(line);
        if (!renderedText) return false;
        const text = sourceText ?? this.getElementText(content);
        const validation = this.getAutoTranslationOutputValidationResult(
            text,
            renderedText,
            this.getAutoTranslationTargetLanguage(options),
            this.getAutoTranslationOutputValidationOptions(text, renderedText, options),
            options
        );
        if (validation.cacheable || (validation.renderable && this.isAcceptedNonCacheableCurrentTranslationLine(line, validation))) {
            this.rememberRecentAutoTranslationRender(cacheKey, text, options, {
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || ""
            });
            return false;
        }

        this.restoreTranslationSourceVisibility(content);
        line.remove?.();
        this.deleteTranslationCacheCandidates(
            cacheKey,
            ...cacheAliases,
            this.getAutoTextTranslationCacheKey(text, options),
            ...this.getAutoTextTranslationCacheAliases(text, options)
        );
        this.clearAutoTranslationFailure(cacheKey, options);
        this.clearAutoTextTranslationFailure(text, options);
        this.logDiagnostic("auto.render", "remove-invalid-current-line", {
            key: this.getTextFingerprint(cacheKey || ""),
            sourceHash: this.getStrongTextFingerprint(text || ""),
            valueLength: String(renderedText || "").length
        });
        return true;
    }

    isAcceptedNonCacheableCurrentTranslationLine(line, validation = {}) {
        if (!validation?.renderable) return false;
        const quality = String(validation.quality || line?.dataset?.daitValidationQuality || "");
        return quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL
            || line?.classList?.contains?.("dait-translation-partial") === true;
    }

    getTranslationLineRenderedText(line) {
        const textNode = line?.querySelector?.(".dait-translation-text");
        return this.normalizeExtractedText(textNode?.textContent ?? line?.textContent ?? "");
    }

    getTranslationLine(content) {
        const lines = this.getTranslationLines(content);
        const ownedLines = lines.filter(line => this.getTranslationContentForLine(line) === content);
        if (ownedLines.length > 1) {
            ownedLines.slice(1).forEach(line => {
                if (this.isAutoTranslationRenderPaused() && this.isAutoTranslationCacheMode(line.dataset?.daitMode)) return;
                line.remove();
            });
        }
        if (ownedLines[0]) return ownedLines[0];
        return content?.querySelector?.(":scope > .dait-translation-line") || null;
    }

    reconcileTranslationLines(context = null) {
        if (typeof document === "undefined") return;
        const preserveAutoLines = this.isAutoTranslationRenderPaused();
        this.getTranslationLinesForReconcile(context).forEach(line => {
            const isAutoLine = this.isAutoTranslationCacheMode(line.dataset?.daitMode);
            const ownerId = String(line.dataset?.daitOwner || "");
            if (!ownerId.startsWith(`${this.translationOwnerPrefix}-`)) {
                if (preserveAutoLines && isAutoLine) return;
                this.restoreTranslationSourceVisibility(this.getTranslationContentForLine(line));
                line.remove();
                return;
            }

            const content = this.getTranslationContentForLine(line);
            if (!content?.isConnected) {
                if (preserveAutoLines && isAutoLine) return;
                this.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }

            const textOptions = line.classList?.contains?.("dait-translation-preview")
                ? { includeReplyPreview: true }
                : null;
            const sourceText = this.getCachedElementText(content, context, textOptions || {});
            const sourceKey = this.getTextFingerprint(sourceText);
            const sourceSig = this.getStrongTextFingerprint(sourceText);
            if (line.dataset.daitSourceSig ? line.dataset.daitSourceSig !== sourceSig : line.dataset.daitSourceKey && line.dataset.daitSourceKey !== sourceKey) {
                this.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }
            if (line.dataset.daitMode === "auto-text") {
                this.syncTranslationSourceVisibility(line, content, sourceText);
                return;
            }
            const currentIdentityKey = this.getCurrentTranslationIdentityFingerprint(line, content, textOptions, sourceText);
            const currentIdentitySig = this.getCurrentTranslationIdentitySignature(line, content, textOptions, sourceText);
            if (line.dataset.daitIdentitySig && currentIdentitySig && line.dataset.daitIdentitySig !== currentIdentitySig) {
                this.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }
            if (!line.dataset.daitIdentitySig && line.dataset.daitIdentityKey && currentIdentityKey && line.dataset.daitIdentityKey !== currentIdentityKey) {
                this.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }
            if (isAutoLine && this.isStaleAutoTranslationLoadingLine(line)) {
                if (preserveAutoLines) return;
                this.logDiagnostic("render.loading", "stale-removed", {
                    cacheHash: line.dataset?.daitCacheKey || "",
                    ageMs: Date.now() - Number(line.dataset?.daitLoadingAt || 0)
                });
                this.restoreTranslationSourceVisibility(content);
                line.remove();
                return;
            }
            this.syncTranslationSourceVisibility(line, content, sourceText);
        });
    }

    getTranslationLinesForReconcile(context = null) {
        const selector = ".dait-translation-line[data-dait-owner]";
        const messageNodes = [...new Set(context?.messageNodes || [])].filter(node => node?.querySelectorAll);
        if (!messageNodes.length) return [...(document.querySelectorAll?.(selector) || [])];
        const lines = [];
        const seen = new Set();
        messageNodes.forEach(messageNode => {
            for (const line of messageNode.querySelectorAll?.(selector) || []) {
                if (!line || seen.has(line)) continue;
                seen.add(line);
                lines.push(line);
            }
        });
        return lines;
    }

    isStaleAutoTranslationLoadingLine(line, now = Date.now()) {
        if (!line?.classList?.contains?.("dait-translation-loading")) return false;
        if (line.dataset?.daitMode === "manual") return false;
        if (this.hasActiveAutoTranslationLine(line)) return false;
        const loadingAt = Number(line.dataset?.daitLoadingAt || 0);
        return !loadingAt || now - loadingAt >= AUTO_TRANSLATE_ORPHAN_LOADING_REQUEUE_MS;
    }

    hasActiveAutoTranslationLine(line) {
        if (!line) return false;
        this.pruneAutoTranslationActiveState();
        const activeKeys = [...this.autoTranslationQueuedKeys, ...this.autoTranslationInFlightKeys];
        return activeKeys.some(key => this.isTranslationLineCacheMatch(line, key));
    }

    getTranslationContentForLine(line) {
        const ownerId = line?.dataset?.daitOwner;
        if (!ownerId) return null;
        const parent = line.parentElement;
        if (parent?.dataset?.daitOwner === ownerId && this.isTranslationContentMatchForLine(line, parent)) return parent;
        const siblings = [...(line.parentElement?.children || [])];
        const sibling = siblings.find(node => node !== line
            && node?.dataset?.daitOwner === ownerId
            && this.isTranslationContentMatchForLine(line, node));
        if (sibling) return sibling;

        const messageNode = line.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        if (!messageNode) return null;
        return [...messageNode.querySelectorAll("[data-dait-owner]")]
            .find(node => node !== line
                && node.dataset?.daitOwner === ownerId
                && this.isTranslationContentMatchForLine(line, node)) || null;
    }

    isTranslationContentMatchForLine(line, content) {
        if (!content || content.classList?.contains?.("dait-translation-line")) return false;
        const isPreviewLine = line.classList?.contains?.("dait-translation-preview");
        if (this.isReplyPreviewElement(content) !== Boolean(isPreviewLine)) return false;
        if (!line.dataset?.daitSourceKey && !line.dataset?.daitSourceSig) return true;
        const textOptions = isPreviewLine ? { includeReplyPreview: true } : null;
        const text = this.getElementText(content, textOptions);
        if (line.dataset?.daitSourceSig) return this.getStrongTextFingerprint(text) === line.dataset.daitSourceSig;
        return this.getTextFingerprint(text) === line.dataset.daitSourceKey;
    }

    getTranslationLines(content) {
        const ownerId = this.peekTranslationOwnerId(content);
        if (!ownerId) return [];
        const escapedOwner = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(ownerId) : ownerId.replace(/"/g, '\\"');
        const selector = `.dait-translation-line[data-dait-owner="${escapedOwner}"]`;
        return [
            ...(content?.querySelectorAll?.(`:scope > ${selector}`) || []),
            ...(content?.parentElement?.querySelectorAll?.(`:scope > ${selector}`) || []),
            ...(content?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']")?.querySelectorAll?.(selector) || [])
        ].filter((line, index, all) => all.indexOf(line) === index);
    }

    peekTranslationOwnerId(content) {
        const ownerId = String(content?.dataset?.daitOwner || "");
        return ownerId.startsWith(`${this.translationOwnerPrefix}-`) ? ownerId : "";
    }

    ensureTranslationOwnerId(content) {
        if (!content?.dataset) return "";
        if (!this.peekTranslationOwnerId(content)) {
            this.translationOwnerCounter++;
            content.dataset.daitOwner = `${this.translationOwnerPrefix}-${this.translationOwnerCounter}`;
        }
        return content.dataset.daitOwner;
    }

    getTranslationOwnerId(content) {
        return this.ensureTranslationOwnerId(content);
    }

    getTranslationIdentityFromCacheKey(cacheKey) {
        return String(cacheKey || "").split("\n---\n")[1] || "";
    }

    getTranslationIdentityFingerprintFromCacheKey(cacheKey) {
        const identity = this.getTranslationIdentityFromCacheKey(cacheKey);
        return identity ? this.getTextFingerprint(identity) : "";
    }

    getTranslationIdentitySignatureFromCacheKey(cacheKey) {
        const identity = this.getTranslationIdentityFromCacheKey(cacheKey);
        return identity ? this.getStrongTextFingerprint(identity) : "";
    }

    isVolatileTranslationIdentity(identity) {
        const value = String(identity || "");
        if (!value.startsWith("fallback:")) return false;
        return value.includes(":unknown-author:unknown-time:")
            && value.includes(`:${this.getTextFingerprint("no-dom-fingerprint")}:`)
            && value.includes(`:${this.getTextFingerprint("no-neighbor-context")}:`);
    }

    getCurrentTranslationIdentityFingerprint(line, content, textOptions = null, sourceText = null) {
        const messageNode = line?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        if (!messageNode || !content) return "";
        const text = sourceText ?? this.getElementText(content, textOptions);
        if (!text) return "";
        return this.getTextFingerprint(this.getMessageIdentity(messageNode, content, text));
    }

    getCurrentTranslationIdentitySignature(line, content, textOptions = null, sourceText = null) {
        const messageNode = line?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        if (!messageNode || !content) return "";
        const text = sourceText ?? this.getElementText(content, textOptions);
        if (!text) return "";
        return this.getStrongTextFingerprint(this.getMessageIdentity(messageNode, content, text));
    }

    hasLetters(text) {
        return /\p{L}/u.test(String(text || ""));
    }

    isLikelyTargetLanguage(text, targetLanguage) {
        const target = this.normalizeLanguageName(targetLanguage);
        if (this.isTraditionalChineseTarget(target)) {
            if (this.isMostlyJapanese(text)) return false;
            if (this.isLikelyJapaneseHanPhrase(text)) return false;
            return this.isMostlyScript(text, "han") && !this.hasLikelySimplifiedHan(text);
        }
        if (["汉语", "中文", "Chinese"].includes(target)) {
            if (this.isMostlyJapanese(text)) return false;
            if (this.isLikelyJapaneseHanPhrase(text)) return false;
            return this.isMostlyScript(text, "han");
        }
        if (["俄语", "Russian"].includes(target)) return this.isMostlyScript(text, "cyrillic");
        if (["阿拉伯语", "Arabic"].includes(target)) return this.isMostlyScript(text, "arabic");
        if (["印地语", "Hindi"].includes(target)) return this.isMostlyScript(text, "devanagari");
        if (["朝鲜语", "韩语", "Korean"].includes(target)) return this.isMostlyScript(text, "hangul");
        if (["日语", "Japanese"].includes(target)) return this.isMostlyJapanese(text);
        if (["英语", "English"].includes(target)) return this.looksLikeLatinLanguage(text, "english");
        if (["西班牙语", "Spanish"].includes(target)) return this.looksLikeLatinLanguage(text, "spanish");
        if (["法语", "French"].includes(target)) return this.looksLikeLatinLanguage(text, "french");
        if (["德语", "German"].includes(target)) return this.looksLikeLatinLanguage(text, "german");
        if (["意大利语", "Italian"].includes(target)) return this.looksLikeLatinLanguage(text, "italian");
        if (["越南语", "Vietnamese"].includes(target)) return this.looksLikeLatinLanguage(text, "vietnamese");
        return false;
    }

    getTargetLanguageScript(targetLanguage) {
        const target = this.normalizeLanguageName(targetLanguage);
        if (this.isTraditionalChineseTarget(target)) return "han";
        if (["汉语", "中文", "Chinese"].includes(target)) return "han";
        if (["俄语", "Russian"].includes(target)) return "cyrillic";
        if (["阿拉伯语", "Arabic"].includes(target)) return "arabic";
        if (["印地语", "Hindi"].includes(target)) return "devanagari";
        if (["朝鲜语", "韩语", "Korean"].includes(target)) return "hangul";
        if (["日语", "Japanese"].includes(target)) return "kana";
        if (["英语", "English", "西班牙语", "Spanish", "法语", "French", "德语", "German", "意大利语", "Italian", "越南语", "Vietnamese"].includes(target)) return "latin";
        return "unknown";
    }

    isMostlyJapanese(text) {
        const counts = this.countTextScripts(text);
        const total = Math.max(1, counts.total);
        return counts.kana >= 2 || (counts.kana + counts.han >= 4 && counts.kana / total >= 0.12);
    }

    isLikelyJapaneseHanPhrase(text) {
        return this.isLikelyJapaneseHanText(text);
        const compact = String(text || "").replace(/[^\p{Script=Han}]/gu, "");
        if (compact.length < 2 || compact.length > 6) return false;
        const phrases = new Set(["大丈夫", "今日", "明日", "昨日", "本当", "最高", "無料", "登録", "確認", "必要", "了解"]);
        return phrases.has(compact);
    }

    isMostlyScript(text, script) {
        const counts = this.countTextScripts(text);
        const total = Math.max(1, counts.total);
        return counts[script] >= 1 && counts[script] / total >= 0.45;
    }

    getCharacterScript(char) {
        const code = String(char || "").codePointAt(0);
        if (!Number.isFinite(code)) return "";
        if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) return "han";
        if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff)) return "kana";
        if (code >= 0xac00 && code <= 0xd7af) return "hangul";
        if (code >= 0x0400 && code <= 0x04ff) return "cyrillic";
        if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) return "arabic";
        if (code >= 0x0900 && code <= 0x097f) return "devanagari";
        if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a) || (code >= 0x00c0 && code <= 0x024f)) return "latin";
        if (/\p{L}/u.test(String(char || ""))) return "other";
        return "";
    }

    countTextScripts(text) {
        const counts = {
            han: 0,
            latin: 0,
            cyrillic: 0,
            arabic: 0,
            devanagari: 0,
            kana: 0,
            hangul: 0,
            other: 0,
            total: 0
        };

        for (const char of String(text || "")) {
            const script = this.getCharacterScript(char);
            if (!script) continue;
            counts[script]++;
            counts.total++;
        }

        return counts;
    }

    looksLikeLatinLanguage(text, language) {
        const counts = this.countTextScripts(text);
        if (counts.latin < 2) return false;
        if (counts.cyrillic || counts.arabic || counts.devanagari || counts.han || counts.kana || counts.hangul) return false;

        const normalized = String(text || "").toLocaleLowerCase();
        const words = normalized.match(/[a-zà-öø-ÿā-žƀ-ɏ]+/g) || [];
        const joined = ` ${words.join(" ")} `;
        const dictionaries = {
            english: [" the ", " and ", " are ", " you ", " can ", " help ", " me ", " with ", " this ", " that ", " what ", " have ", " been ", " for ", " to ", " is ", " in ", " of ", " hello ", " hi ", " bro ", " thanks ", " thank ", " okay ", " ok ", " lately ", " up "],
            spanish: [" el ", " la ", " los ", " las ", " que ", " de ", " y ", " en ", " un ", " una ", " para ", " con ", " por ", " es ", " estoy ", " hola ", " amigo ", " canal ", " soporte ", " gratis "],
            french: [" le ", " la ", " les ", " des ", " est ", " pour ", " avec ", " que ", " une ", " vous ", " dans ", " pas ", " je ", " de ", " bonjour ", " salut ", " merci "],
            german: [" der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " für ", " ich ", " zu ", " ein ", " eine ", " auf ", " danke ", " hallo "],
            italian: [" il ", " lo ", " la ", " gli ", " le ", " che ", " di ", " e ", " per ", " con ", " non ", " una ", " sono ", " ciao ", " grazie "],
            vietnamese: [" và ", " của ", " không ", " một ", " là ", " tôi ", " bạn ", " trong ", " cho ", " với ", " chào ", " cảm "]
        };
        const accentTests = {
            spanish: /[áéíóúñü¿¡]/i,
            french: /[àâçéèêëîïôûùüÿœæ]/i,
            german: /[äöüß]/i,
            italian: /[àèéìíîòóùú]/i,
            vietnamese: /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i
        };

        let score = 0;
        for (const token of dictionaries[language] || []) {
            if (joined.includes(token)) score++;
        }
        if (accentTests[language]?.test(text)) score += 2;
        let foreignScore = 0;
        Object.entries(dictionaries).forEach(([name, tokens]) => {
            if (name === language) return;
            for (const token of tokens) {
                if (joined.includes(token)) foreignScore++;
            }
        });
        if (foreignScore >= 2 && foreignScore >= score) return false;

        return score >= (language === "english" ? 2 : 1);
    }

    getPolishAfterAction() {
        const action = String(this.settings.polish?.afterAction || "");
        if (action === "directReplace") return "replace";
        return ["replace", "confirmSend"].includes(action) ? action : DEFAULT_SETTINGS.polish.afterAction;
    }

    getPolishRepolishSource() {
        const source = String(this.settings.polish?.repolishSource || "");
        return source === POLISH_REPOLISH_SOURCE_LAST_RESULT
            ? POLISH_REPOLISH_SOURCE_LAST_RESULT
            : POLISH_REPOLISH_SOURCE_ORIGINAL;
    }

    isPublicBilingualUseInitialOriginalEnabled() {
        return this.settings.ui?.publicBilingualUseInitialOriginal === true;
    }

    isPublicBilingualAfterPolishEnabled() {
        return this.settings.ui?.publicBilingualAfterPolish === true;
    }

    isPublicBilingualPolishBeforeTranslateEnabled() {
        return this.settings.ui?.publicBilingualPolishBeforeTranslate === true;
    }

    getPolishSession(textbox, currentText) {
        const text = this.normalizeDraftRawText(currentText);
        const session = this.polishSession;
        const composerKey = this.getTextboxComposerKey(textbox);
        if (
            session
            && session.composerKey === composerKey
            && this.isPolishSessionTextbox(session, textbox)
            && (
                this.areDraftTextsEqualStrict(text, session.lastWrittenRawText ?? session.lastWrittenText)
                || this.areDraftTextsEqualStrict(text, session.lastResultRawText ?? session.lastResult)
                || this.areDraftTextsEqualStrict(text, session.originalRawText ?? session.originalText)
                || this.areDraftTextsEqualStrict(text, session.lastBilingualRawText ?? session.lastBilingualText)
            )
        ) {
            session.textbox = textbox;
            session.updatedAt = Date.now();
            return session;
        }

        return this.createPolishSession(textbox, text, composerKey);
    }

    createPolishSession(textbox, originalText, composerKey = this.getTextboxComposerKey(textbox)) {
        const originalRawText = this.normalizeDraftRawText(originalText);
        const session = {
            textbox,
            composerKey,
            originalText: this.normalizeExtractedText(originalText),
            originalRawText,
            lastResult: "",
            lastResultRawText: "",
            lastWrittenText: "",
            lastWrittenRawText: "",
            lastBilingualText: "",
            lastBilingualRawText: "",
            lastBilingualSourceText: "",
            lastBilingualSourceRawText: "",
            sourceHash: this.getStrongTextFingerprint(originalText),
            updatedAt: Date.now()
        };
        this.polishSession = session;
        return session;
    }

    getTextboxComposerKey(textbox) {
        const route = this.messageTracker.getRouteIds?.() || {};
        const root = textbox?.closest?.("form, [class*='channelTextArea']") || textbox?.parentElement || textbox;
        if (!root) return [route.guildId || "", route.channelId || "", "no-composer"].join(":");
        if (!root.dataset) root.dataset = {};
        if (!root.dataset.daitComposerKey) {
            root.dataset.daitComposerKey = `composer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        }
        return [route.guildId || "", route.channelId || "", root.dataset.daitComposerKey].join(":");
    }

    isPolishSessionTextbox(session, textbox) {
        if (!session || !textbox) return false;
        if (session.textbox === textbox) return true;
        return session.textbox?.isConnected !== false && textbox.isConnected !== false;
    }

    getPolishSourceText(session) {
        if (!session) return "";
        if (this.getPolishRepolishSource() === POLISH_REPOLISH_SOURCE_LAST_RESULT && session.lastResult) {
            return session.lastResultRawText || session.lastResult;
        }
        return session.originalRawText || session.originalText;
    }

    updatePolishSessionAfterResult(session, textbox, polished, written) {
        if (!session) return;
        session.textbox = textbox;
        session.lastResult = this.normalizeExtractedText(polished);
        session.lastResultRawText = this.normalizeDraftRawText(polished);
        if (written) {
            session.lastWrittenText = this.normalizeExtractedText(polished);
            session.lastWrittenRawText = this.normalizeDraftRawText(polished);
        }
        session.updatedAt = Date.now();
        this.polishSession = session;
    }

    updatePolishSessionAfterBilingual(session, textbox, composed, sourceText, written) {
        if (!session) return;
        session.textbox = textbox;
        session.lastBilingualSourceText = this.normalizeExtractedText(sourceText);
        session.lastBilingualSourceRawText = this.normalizeDraftRawText(sourceText);
        if (written) {
            session.lastBilingualText = this.normalizeExtractedText(composed);
            session.lastBilingualRawText = this.normalizeDraftRawText(composed);
            session.lastWrittenText = this.normalizeExtractedText(composed);
            session.lastWrittenRawText = this.normalizeDraftRawText(composed);
        }
        session.updatedAt = Date.now();
        this.polishSession = session;
    }

    areComparableTextsEqual(left, right) {
        return this.normalizeExtractedText(left) === this.normalizeExtractedText(right);
    }

    normalizeDraftRawText(text) {
        return String(text ?? "").replace(/[\u200b\ufeff]/g, "").replace(/\r\n?/g, "\n");
    }

    areDraftTextsEqualStrict(left, right) {
        return this.normalizeDraftRawText(left) === this.normalizeDraftRawText(right);
    }

    getTextboxDraftText(textbox) {
        const raw = this.getTextboxRawTextSafe(textbox);
        if (raw) return raw;
        return this.getElementText(textbox);
    }

    isCurrentDraftText(textbox, expectedText) {
        return this.areDraftTextsEqualStrict(this.getTextboxDraftText(textbox), expectedText);
    }

    isComposerWriteSuperseded(writeToken) {
        return Boolean(writeToken?.cancelled && writeToken.reason === "superseded");
    }

    // Why a finished polish/bilingual result must not be written now ("" when it may be).
    getComposerWriteStaleReason(textbox, writeToken, expectedText) {
        if (!textbox || textbox.isConnected === false) return "remounted";
        if (writeToken && !this.composerWriter.isWriteTokenCurrent(writeToken)) return writeToken.reason || "cancelled";
        if (!this.isCurrentDraftText(textbox, expectedText)) return "draft-changed";
        if (this.isComposerFocusElsewhere(textbox)) return "focus-moved";
        return "";
    }

    // Writing focuses and selects the target composer, so a late result must not land while the
    // user is typing in another field (thread panel, search box, another composer).
    isComposerFocusElsewhere(textbox) {
        if (typeof document === "undefined" || !textbox) return false;
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return false;
        if (active === textbox || textbox.contains?.(active)) return false;
        return this.isEditableFocusTarget(active);
    }

    isEditableFocusTarget(element) {
        if (!element) return false;
        const tagName = String(element.tagName || "").toUpperCase();
        if (tagName === "TEXTAREA") return !element.readOnly && !element.disabled;
        if (tagName === "INPUT") {
            const type = String(element.type || element.getAttribute?.("type") || "text").toLowerCase();
            const nonText = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"];
            return !element.readOnly && !element.disabled && !nonText.includes(type);
        }
        if (element.isContentEditable === true) return true;
        const contentEditable = String(element.getAttribute?.("contenteditable") ?? "").toLowerCase();
        return contentEditable === "true" || contentEditable === "plaintext-only" || element.getAttribute?.("role") === "textbox";
    }

    getComposerResultPanelAnchor(textbox) {
        if (textbox && textbox.isConnected !== false) return textbox;
        if (typeof document === "undefined") return textbox;
        try {
            return this.getActiveTextbox() || this.getTextbox() || textbox;
        }
        catch {
            return textbox;
        }
    }

    isPolishInputButtonEnabled(options = {}) {
        return this.settings.polish?.enabled !== false && Boolean(options.forcePolish || this.settings.ui?.injectInputButton);
    }

    isPublicBilingualFeatureEnabled() {
        return this.settings.translation?.enabled !== false;
    }

    isPublicBilingualInputButtonEnabled() {
        return this.isPublicBilingualFeatureEnabled() && Boolean(this.settings.ui?.publicBilingualInputButton);
    }

    getPublicBilingualTargetLanguage() {
        return this.normalizeLanguageName(this.settings.polish?.targetLanguage || this.settings.translation?.targetLanguage);
    }

    getPublicBilingualBaseConfig() {
        const polish = this.settings.polish || {};
        const translation = this.settings.translation || {};
        const polishCandidate = {
            provider: polish.provider,
            apiKey: polish.apiKey,
            endpoint: polish.endpoint,
            model: polish.model
        };
        return this.hasUsableApiConfig("translation", polishCandidate) ? polish : translation;
    }

    getPublicBilingualTranslationOptions() {
        const configOverrides = this.getPublicBilingualTranslationOverrides();
        return {
            mode: "public-bilingual",
            promptPolicyVersion: this.getPromptPolicyVersion("publicBilingual"),
            targetLanguage: this.getPublicBilingualTargetLanguage(),
            providerKey: this.getAutoTranslationProviderKey({ configOverrides }),
            requestContext: {},
            configOverrides
        };
    }

    getPublicBilingualTranslationOverrides() {
        const baseConfig = this.getPublicBilingualBaseConfig();
        const targetLanguageValue = this.getPublicBilingualTargetLanguage();
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);
        const maxTokens = Math.max(
            this.normalizeRequestNumber(baseConfig.maxTokens, DEFAULT_SETTINGS.translation.maxTokens, { min: 1, integer: true }),
            this.normalizeRequestNumber(this.settings.translation?.maxTokens, DEFAULT_SETTINGS.translation.maxTokens, { min: 1, integer: true })
        );

        return {
            provider: baseConfig.provider,
            apiKey: baseConfig.apiKey,
            endpoint: baseConfig.endpoint,
            model: baseConfig.model,
            sourceLanguage: AUTO_LANGUAGE_VALUE,
            targetLanguage,
            temperature: 0,
            maxTokens,
            enableThinking: false,
            promptPolicyVersion: this.getPromptPolicyVersion("publicBilingual"),
            prompt: this.buildPromptPolicyPublicBilingualPrompt(targetLanguageValue)
        };
    }

    getPublicBilingualRetryOptions(sourceText, badOutput = "", options = this.getPublicBilingualTranslationOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);

        return {
            mode: "public-bilingual-retry",
            promptPolicyVersion: this.getPromptPolicyVersion("publicBilingualRetry"),
            targetLanguage: targetLanguageValue,
            providerKey: this.getAutoTranslationProviderKey(options),
            requestContext: options.requestContext,
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.getPromptPolicyVersion("publicBilingualRetry"),
                prompt: this.buildPromptPolicyPublicBilingualRetryPrompt(sourceText, badOutput, options)
            }
        };
    }

    getPublicBilingualFinalFallbackOptions(sourceText, options = this.getPublicBilingualTranslationOptions()) {
        const targetLanguageValue = this.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.getAutoTranslationTargetInstruction(targetLanguageValue);

        return {
            mode: "public-bilingual-final",
            promptPolicyVersion: this.getPromptPolicyVersion("publicBilingualFinal"),
            targetLanguage: targetLanguageValue,
            providerKey: this.getAutoTranslationProviderKey(options),
            requestContext: options.requestContext,
            configOverrides: {
                ...this.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.getPromptPolicyVersion("publicBilingualFinal"),
                prompt: this.buildPromptPolicyPublicBilingualFinalPrompt(sourceText, options)
            }
        };
    }

    async runPublicBilingualTranslationTask(text, options = this.getPublicBilingualTranslationOptions()) {
        const translated = await this.runModelTask("translation", text, {
            configOverrides: options.configOverrides,
            timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
            mode: "public-bilingual",
            requestContext: options.requestContext,
            providerProfilePinned: true
        });
        if (!this.isInvalidAutoTranslationOutput(text, translated, this.getAutoTranslationTargetLanguage(options))) return translated;

        const retryOptions = this.getPublicBilingualRetryOptions(text, translated, options);
        const retried = await this.runModelTask("translation", text, {
            configOverrides: retryOptions.configOverrides,
            timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
            mode: "public-bilingual-retry",
            requestContext: retryOptions.requestContext,
            providerProfilePinned: true
        });
        if (!this.isInvalidAutoTranslationOutput(text, retried, this.getAutoTranslationTargetLanguage(retryOptions))) return retried;

        const finalOptions = this.getPublicBilingualFinalFallbackOptions(text, options);
        const finalText = await this.runModelTask("translation", text, {
            configOverrides: finalOptions.configOverrides,
            timeoutMs: MODEL_REQUEST_TIMEOUT_MS,
            mode: "public-bilingual-final",
            requestContext: finalOptions.requestContext,
            providerProfilePinned: true
        });
        if (!this.isInvalidAutoTranslationOutput(text, finalText, this.getAutoTranslationTargetLanguage(finalOptions))) return finalText;

        throw this.createFinalInvalidAutoTranslationError();
    }

    async getPublicBilingualTranslation(text, options = this.getPublicBilingualTranslationOptions(), behavior = {}) {
        const cacheKey = this.getTranslationCacheKey(text, options);
        // An explicit re-run asks for a new translation, so it skips the cached one.
        const cached = behavior.bypassCache ? null : this.getTranslationCacheValue(cacheKey, this.getTranslationCacheAliases(text, options));
        if (cached !== null) return { text: cached, cacheKey, cached: true };

        const translated = await this.runPublicBilingualTranslationTask(text, options);
        const usedFallback = Boolean(options.requestContext?.fallbackProvider);
        if (!usedFallback) this.setTranslationCache(cacheKey, translated);
        return { text: translated, cacheKey, cached: false, fallbackProvider: options.requestContext?.fallbackProvider || "" };
    }

    // Text inside ||…||. Outside code every "|" is escaped and the user's own escapes are kept; a
    // lone trailing "\" is doubled so it cannot escape the closing "||". Discord shows code literally,
    // so a backslash there would be visible: "||" inside code is split with a zero-width space instead.
    escapeDiscordSpoilerText(text) {
        return this.splitDiscordCodeSegments(text).map(segment => segment.code
            ? segment.text.replace(/\|(?=\|)/g, "|\u200b")
            : this.escapeDiscordPlainText(segment.text, { escapeEveryPipe: true })).join("");
    }

    // Visible translation: only "||" outside code could open a spoiler.
    escapeDiscordVisibleText(text) {
        return this.splitDiscordCodeSegments(text).map(segment => segment.code
            ? segment.text
            : this.escapeDiscordPlainText(segment.text, { escapeEveryPipe: false })).join("");
    }

    escapeDiscordPlainText(text, options = {}) {
        const value = String(text || "");
        let output = "";
        for (let index = 0; index < value.length; index++) {
            const char = value[index];
            if (char === "\\") {
                if (index + 1 < value.length) {
                    output += char + value[index + 1];
                    index++;
                }
                else {
                    output += "\\\\";
                }
                continue;
            }
            if (char === "|" && (options.escapeEveryPipe || value[index + 1] === "|")) {
                if (options.escapeEveryPipe) {
                    output += "\\|";
                }
                else {
                    output += "\\|\\|";
                    index++;
                }
                continue;
            }
            output += char;
        }
        return output;
    }

    // Splits Discord markdown into code (`inline`, ``inline``, ```fenced```) and plain segments.
    // A backslash escapes the next character outside code, so "\`" never opens a code span.
    splitDiscordCodeSegments(text) {
        const value = String(text || "");
        const segments = [];
        let plainStart = 0;
        let index = 0;
        while (index < value.length) {
            const char = value[index];
            if (char === "\\") {
                index += 2;
                continue;
            }
            if (char !== "`") {
                index++;
                continue;
            }
            let runEnd = index;
            while (value[runEnd] === "`") runEnd++;
            const close = this.findDiscordCodeClose(value, runEnd, runEnd - index);
            if (close < 0) {
                index = runEnd;
                continue;
            }
            if (index > plainStart) segments.push({ code: false, text: value.slice(plainStart, index) });
            const end = close + (runEnd - index);
            segments.push({ code: true, text: value.slice(index, end) });
            index = plainStart = end;
        }
        if (plainStart < value.length) segments.push({ code: false, text: value.slice(plainStart) });
        return segments;
    }

    findDiscordCodeClose(value, from, length) {
        let index = from;
        while (index < value.length) {
            const start = value.indexOf("`", index);
            if (start < 0) return -1;
            let end = start;
            while (value[end] === "`") end++;
            if (end - start === length && start > from) return start;
            index = end;
        }
        return -1;
    }

    formatPublicBilingualMessage(translated, original) {
        const translation = this.escapeDiscordVisibleText(String(translated || "").trim());
        const source = this.normalizeDraftRawText(original);
        return `${translation}\n\n||${this.escapeDiscordSpoilerText(source)}||`;
    }

    getPublicBilingualReservedLength(original) {
        return `\n\n||${this.escapeDiscordSpoilerText(this.normalizeDraftRawText(original))}||`.length;
    }

    isPolishSessionAlreadyPolished(session, text) {
        if (!session?.lastResult) return false;
        return this.areDraftTextsEqualStrict(text, session.lastResultRawText || session.lastResult)
            || this.areDraftTextsEqualStrict(text, session.lastWrittenRawText || session.lastWrittenText);
    }

    getPublicBilingualSpoilerOriginal(session, draft, translationSource = draft) {
        if (this.isPublicBilingualUseInitialOriginalEnabled() && (session?.originalRawText || session?.originalText)) {
            return session.originalRawText ?? session.originalText;
        }
        return translationSource || draft;
    }

    async preparePublicBilingualDraft(textbox, draft, options = {}) {
        const session = this.getPolishSession(textbox, draft);
        // Running bilingual again on its own output translates what the first run translated,
        // instead of nesting the bilingual text (and its spoiler) inside a new one.
        const isBilingualOutput = Boolean(session.lastBilingualRawText && session.lastBilingualSourceRawText)
            && this.areDraftTextsEqualStrict(draft, session.lastBilingualRawText);
        const baseDraft = isBilingualOutput ? this.normalizeDraftRawText(session.lastBilingualSourceRawText) : draft;
        let translationSource = baseDraft;
        let usedPolish = false;
        let skippedPolish = false;
        const hasLifecycleToken = options.lifecycleToken !== undefined && options.lifecycleToken !== null;
        const writeToken = options.writeToken || null;

        if (!options.skipAutoPolish && this.isPublicBilingualPolishBeforeTranslateEnabled()) {
            if (!this.settings.polish.enabled) {
                skippedPolish = true;
            }
            else if (!this.isPolishSessionAlreadyPolished(session, baseDraft)) {
                const sourceText = this.getPolishSourceText(session) || draft;
                const polished = await this.runModelTask("polish", sourceText);
                if (!String(polished || "").trim()) throw new Error(this.t("emptyResult"));
                if (hasLifecycleToken && !this.isLifecycleTokenCurrent(options.lifecycleToken)) {
                    return { stale: true, lifecycleStale: true, session, translationSource: draft, spoilerOriginal: this.getPublicBilingualSpoilerOriginal(session, draft, draft), usedPolish, skippedPolish };
                }
                if ((writeToken && !this.composerWriter.isWriteTokenCurrent(writeToken)) || textbox?.isConnected === false || !this.isCurrentDraftText(textbox, draft)) {
                    return { stale: true, session, translationSource: draft, spoilerOriginal: this.getPublicBilingualSpoilerOriginal(session, draft, draft), usedPolish, skippedPolish };
                }
                this.updatePolishSessionAfterResult(session, textbox, polished, false);
                translationSource = this.normalizeDraftRawText(polished);
                usedPolish = true;
            }
        }

        return {
            stale: false,
            session,
            translationSource,
            spoilerOriginal: this.getPublicBilingualSpoilerOriginal(session, baseDraft, translationSource),
            expectedCurrentText: draft,
            // A bilingual result already exists in this session, so this click asks for a fresh one.
            rerun: Boolean(session.lastBilingualRawText),
            usedPolish,
            skippedPolish
        };
    }

    async publicBilingualCurrentDraft(button = null, behaviorOptions = {}) {
        if (!this.isPublicBilingualFeatureEnabled()) {
            // The bilingual-after-polish step stays quiet; a direct click explains why nothing happens.
            if (!behaviorOptions.skipAutoPolish) this.showToast(this.t("translationDisabled"), "info");
            return { ok: false, wrote: false, reason: "disabled" };
        }
        const textbox = this.resolveInputActionTextbox(button, behaviorOptions);
        if (!textbox) {
            this.showToast(this.t("textboxMissing"), "error");
            return { ok: false, wrote: false, reason: "missing-textbox" };
        }
        const expectedComposerKey = behaviorOptions.composerKey || button?.dataset?.daitComposerKey || "";
        if (!this.isInputActionTextboxCurrent(textbox, expectedComposerKey)) {
            this.queueInputButtonScan({ delayMs: 120, trailing: true });
            this.showToast(this.t("publicBilingualInputChanged"), "info");
            return { ok: false, wrote: false, reason: "stale-composer" };
        }

        const draft = this.getTextboxDraftText(textbox);
        if (!this.normalizeExtractedText(draft)) {
            this.showToast(this.t("inputEmpty"), "info");
            return { ok: false, wrote: false, reason: "empty" };
        }

        const writeToken = this.composerWriter.beginWrite(textbox, draft);
        this.setButtonBusy(button, true, this.t("publicBilingualBusy"));
        const lifecycleToken = this.getLifecycleToken();
        const startedAt = Date.now();
        const requestOptions = this.getPublicBilingualTranslationOptions();
        this.logDiagnostic("public.bilingual", "start", {
            ...this.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.REQUEST_STARTED, {
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                targetKind: "composer",
                sourceHash: this.getStrongTextFingerprint(draft),
                textLength: String(draft || "").length
            }),
            sourceHash: this.getStrongTextFingerprint(draft),
            length: String(draft || "").length,
            targetLanguage: this.getAutoTranslationTargetLanguage(requestOptions)
        });
        try {
            const payload = await this.preparePublicBilingualDraft(textbox, draft, { ...behaviorOptions, lifecycleToken, writeToken });
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: false, stale: true, phase: "lifecycle" };
            }
            if (this.isComposerWriteSuperseded(writeToken)) return { ok: false, wrote: false, stale: true, phase: "superseded" };
            if (payload.stale || !this.composerWriter.isWriteTokenCurrent(writeToken)) {
                this.logDiagnostic("public.bilingual", "stale-input", {
                    ...this.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.STALE_DOM, {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        targetKind: "composer",
                        sourceHash: this.getStrongTextFingerprint(draft),
                        textLength: String(draft || "").length
                    }),
                    sourceHash: this.getStrongTextFingerprint(draft),
                    phase: payload.lifecycleStale ? "lifecycle" : "polish",
                    ms: Date.now() - startedAt
                });
                if (payload.lifecycleStale) return { ok: false, wrote: false, stale: true, phase: "lifecycle" };
                this.showToast(this.t("publicBilingualInputChanged"), "info");
                return { ok: false, wrote: false, stale: true, phase: "polish" };
            }
            const reservedLength = this.getPublicBilingualReservedLength(payload.spoilerOriginal);
            if (reservedLength >= DISCORD_MESSAGE_MAX_LENGTH) {
                throw new Error(this.t("publicBilingualTooLong", { length: reservedLength, limit: DISCORD_MESSAGE_MAX_LENGTH }));
            }

            const result = await this.getPublicBilingualTranslation(payload.translationSource, requestOptions, { bypassCache: payload.rerun });
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: false, stale: true, phase: "lifecycle" };
            }
            if (this.isComposerWriteSuperseded(writeToken)) return { ok: false, wrote: false, stale: true, phase: "superseded" };
            if (!String(result.text || "").trim()) throw new Error(this.t("emptyResult"));
            const composed = this.formatPublicBilingualMessage(result.text, payload.spoilerOriginal);
            if (composed.length > DISCORD_MESSAGE_MAX_LENGTH) {
                throw new Error(this.t("publicBilingualTooLong", { length: composed.length, limit: DISCORD_MESSAGE_MAX_LENGTH }));
            }
            const staleReason = this.getComposerWriteStaleReason(textbox, writeToken, payload.expectedCurrentText);
            if (staleReason) {
                this.logDiagnostic("public.bilingual", "stale-input", {
                    ...this.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.STALE_DOM, {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        targetKind: "composer",
                        sourceHash: this.getStrongTextFingerprint(draft),
                        textLength: String(draft || "").length
                    }),
                    sourceHash: this.getStrongTextFingerprint(draft),
                    cached: Boolean(result.cached),
                    phase: "translation",
                    reason: staleReason,
                    ms: Date.now() - startedAt
                });
                // A finished result is never dropped silently: offer it for Copy or Apply instead.
                this.showPolishResultPanel(this.getComposerResultPanelAnchor(textbox), composed, {
                    sourceButton: button,
                    title: this.t("publicBilingualButton"),
                    ariaLabel: this.t("publicBilingualTitleAttr", { targetLanguage: this.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }),
                    adjustTextboxSelection: false
                });
                this.showToast(this.t("composerResultHeld"), "info");
                return { ok: false, wrote: false, stale: true, phase: "translation", reason: staleReason, fallbackText: composed };
            }

            const writeResult = await this.composerWriter.replaceTextSafely(textbox, composed, {
                blurAfterReplace: false,
                extraBlurTarget: button,
                expectedPreviousText: payload.expectedCurrentText,
                writeToken
            });
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: Boolean(writeResult?.ok), stale: true, phase: "lifecycle" };
            }
            if (!writeResult.ok) {
                this.logDiagnostic("public.bilingual", "write-failed", {
                    ...this.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", "write-failed", {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                        targetKind: "composer",
                        sourceHash: this.getStrongTextFingerprint(draft),
                        textLength: String(draft || "").length
                    }),
                    sourceHash: this.getStrongTextFingerprint(draft),
                    reason: writeResult.reason || "",
                    cached: Boolean(result.cached),
                    ms: Date.now() - startedAt
                });
                this.showPolishResultPanel(textbox, composed, {
                    sourceButton: button,
                    title: this.t("publicBilingualButton"),
                    ariaLabel: this.t("publicBilingualTitleAttr", { targetLanguage: this.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }),
                    adjustTextboxSelection: false
                });
                if (writeResult.reason === "write-cancelled") this.showToast(this.t("composerResultHeld"), "info");
                else this.showToast(this.t("publicBilingualFailed", { error: this.formatError(new Error(writeResult.reason || "verification-failed")) }), "error");
                return { ok: false, wrote: false, reason: writeResult.reason || "verification-failed", fallbackText: composed };
            }

            this.updatePolishSessionAfterBilingual(payload.session, textbox, composed, payload.translationSource, true);
            this.logDiagnostic("public.bilingual", result.cached ? "cache-hit" : "success", {
                ...this.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", result.cached ? DIAGNOSTIC_REASON_CODES.CACHE_HIT : DIAGNOSTIC_REASON_CODES.RENDERED, {
                    messageState: result.cached ? DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT : DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                    targetKind: "composer",
                    sourceHash: this.getStrongTextFingerprint(draft),
                    textLength: String(draft || "").length
                }),
                cacheHash: this.getTextFingerprint(result.cacheKey),
                sourceHash: this.getStrongTextFingerprint(draft),
                translateHash: this.getStrongTextFingerprint(payload.translationSource),
                originalHash: this.getStrongTextFingerprint(payload.spoilerOriginal),
                autoPolished: Boolean(payload.usedPolish),
                polishSkipped: Boolean(payload.skippedPolish),
                ms: Date.now() - startedAt
            });
            return { ok: true, wrote: true, cacheKey: result.cacheKey, cached: Boolean(result.cached) };
        }
        catch (error) {
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) {
                return { ok: false, wrote: false, stale: true, phase: "lifecycle", error };
            }
            this.logDiagnostic("public.bilingual", "error", {
                ...this.getDiagnosticBaseMeta("public-bilingual", "public-bilingual", DIAGNOSTIC_REASON_CODES.FAILURE, {
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    targetKind: "composer",
                    sourceHash: this.getStrongTextFingerprint(draft),
                    textLength: String(draft || "").length,
                    failureType: this.getAutoTranslationFailureType(error)
                }),
                sourceHash: this.getStrongTextFingerprint(draft),
                type: this.getAutoTranslationFailureType(error),
                ms: Date.now() - startedAt
            });
            this.showToast(this.t("publicBilingualFailed", { error: this.formatError(error) }), "error");
            return { ok: false, wrote: false, error };
        }
        finally {
            this.composerWriter.finishWriteToken(writeToken);
            if (this.isLifecycleTokenCurrent(lifecycleToken)) this.setButtonBusy(button, false, this.t("publicBilingualButton"));
        }
    }

    async polishCurrentDraft(button = null, behaviorOptions = {}) {
        if (!this.settings.polish.enabled) {
            this.showToast(this.t("polishDisabled"), "info");
            return;
        }

        const textbox = this.resolveInputActionTextbox(button, behaviorOptions);
        if (!textbox) {
            this.showToast(this.t("textboxMissing"), "error");
            return;
        }
        const expectedComposerKey = behaviorOptions.composerKey || button?.dataset?.daitComposerKey || "";
        if (!this.isInputActionTextboxCurrent(textbox, expectedComposerKey)) {
            this.queueInputButtonScan({ delayMs: 120, trailing: true });
            this.showToast(this.t("composerChanged"), "info");
            return;
        }

        const draft = this.getTextboxDraftText(textbox);
        if (!this.normalizeExtractedText(draft)) {
            this.showToast(this.t("inputEmpty"), "info");
            return;
        }

        const writeToken = this.composerWriter.beginWrite(textbox, draft);
        this.setButtonBusy(button, true, this.t("polishBusy"));
        // Hotkey and menu runs have no busy button in view when the toolbar is collapsed or absent.
        if ((behaviorOptions.fromHotkey || behaviorOptions.fromMenu) && !this.isInputActionButtonShown(button)) {
            this.showToast(this.t("polishRunning"), "info");
        }
        const lifecycleToken = this.getLifecycleToken();
        const startedAt = Date.now();
        this.logDiagnostic("polish", "start", {
            ...this.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.REQUEST_STARTED, {
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                targetKind: "composer",
                sourceHash: this.getStrongTextFingerprint(draft),
                textLength: String(draft || "").length
            }),
            sourceHash: this.getStrongTextFingerprint(draft),
            length: String(draft || "").length
        });
        try {
            const session = this.getPolishSession(textbox, draft);
            const sourceText = this.getPolishSourceText(session);
            if (!sourceText) {
                this.showToast(this.t("inputEmpty"), "info");
                return;
            }
            const polished = await this.runModelTask("polish", sourceText);
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) return;
            // A newer run on the same composer owns the result slot.
            if (this.isComposerWriteSuperseded(writeToken)) return;
            const action = this.getPolishAfterAction();
            const staleReason = this.getComposerWriteStaleReason(textbox, writeToken, draft);
            if (staleReason) {
                this.updatePolishSessionAfterResult(session, textbox, polished, false);
                this.logDiagnostic("polish", "stale-input", {
                    ...this.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.STALE_DOM, {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        targetKind: "composer",
                        sourceHash: this.getStrongTextFingerprint(sourceText),
                        textLength: String(sourceText || "").length
                    }),
                    sourceHash: this.getStrongTextFingerprint(sourceText),
                    reason: staleReason,
                    ms: Date.now() - startedAt
                });
                this.showPolishResultPanel(this.getComposerResultPanelAnchor(textbox), polished, { sourceButton: button });
                this.showToast(this.t("composerResultHeld"), "info");
                return;
            }
            const writeResult = await this.composerWriter.replaceTextSafely(textbox, polished, {
                blurAfterReplace: false,
                extraBlurTarget: button,
                expectedPreviousText: draft,
                writeToken
            });
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) return;
            this.updatePolishSessionAfterResult(session, textbox, polished, writeResult.ok);
            if (!writeResult.ok) {
                this.logDiagnostic("polish", "panel", {
                    ...this.getDiagnosticBaseMeta("polish", "polish", "write-failed", {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                        targetKind: "composer",
                        sourceHash: this.getStrongTextFingerprint(sourceText),
                        textLength: String(sourceText || "").length
                    }),
                    sourceHash: this.getStrongTextFingerprint(sourceText),
                    ms: Date.now() - startedAt
                });
                this.showPolishResultPanel(textbox, polished, { sourceButton: button });
                return;
            }
            this.logDiagnostic("polish", "success", {
                ...this.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.RENDERED, {
                    messageState: DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                    targetKind: "composer",
                    sourceHash: this.getStrongTextFingerprint(sourceText),
                    textLength: String(sourceText || "").length
                }),
                sourceHash: this.getStrongTextFingerprint(sourceText),
                ms: Date.now() - startedAt
            });
            if (this.isPublicBilingualAfterPolishEnabled()) {
                const bilingualResult = await this.publicBilingualCurrentDraft(button, { skipAutoPolish: true });
                if (!this.isLifecycleTokenCurrent(lifecycleToken)) return;
                if (bilingualResult?.wrote) return;
            }
            this.showRestoreOriginalControl(textbox, session, button);

            if (action === "confirmSend") {
                if (window.confirm(this.t("confirmSend"))) {
                    this.clearPolishSubmitTimer();
                    this.polishSubmitTimer = setTimeout(() => {
                        this.polishSubmitTimer = null;
                        if (this.isLifecycleTokenCurrent(lifecycleToken)) this.composerWriter.submit(textbox);
                    }, 80);
                }
            }
        }
        catch (error) {
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) return;
            this.logDiagnostic("polish", "error", {
                ...this.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.FAILURE, {
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    targetKind: "composer",
                    sourceHash: this.getStrongTextFingerprint(draft),
                    textLength: String(draft || "").length,
                    failureType: this.getAutoTranslationFailureType(error)
                }),
                type: this.getAutoTranslationFailureType(error),
                ms: Date.now() - startedAt
            });
            this.showToast(this.formatError(error), "error");
        }
        finally {
            this.composerWriter.finishWriteToken(writeToken);
            if (this.isLifecycleTokenCurrent(lifecycleToken)) this.setButtonBusy(button, false, this.t("polishButton"));
        }
    }

    clearPolishSubmitTimer() {
        if (!this.polishSubmitTimer) return;
        clearTimeout(this.polishSubmitTimer);
        this.polishSubmitTimer = null;
    }

    showPolishResultPanel(textbox, text, options = {}) {
        if (typeof document === "undefined") return;
        this.removePolishResultPanel();
        this.removePolishRestoreControl();
        if (options.adjustTextboxSelection === true) {
            this.applyTextboxReplacementSelection(textbox, { blurAfterReplace: Boolean(options.blurAfterReplace), extraBlurTarget: options.sourceButton });
        }

        const panel = document.createElement("div");
        panel.className = "dait-polish-result-panel";
        this.syncDiscordThemeClasses(panel, textbox || options.sourceButton);
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", options.ariaLabel || options.title || this.t("polishResultTitle"));

        const header = document.createElement("div");
        header.className = "dait-polish-result-header";

        const title = document.createElement("div");
        title.className = "dait-polish-result-title";
        title.textContent = options.title || this.t("polishResultTitle");
        header.appendChild(title);

        const close = document.createElement("button");
        close.className = "dait-polish-result-icon";
        close.type = "button";
        close.textContent = "x";
        close.title = this.t("polishResultClose");
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
            const apply = document.createElement("button");
            apply.className = "dait-polish-result-action dait-polish-result-apply";
            apply.type = "button";
            apply.textContent = this.t("polishResultReplace");
            apply.addEventListener("click", async event => {
                event.preventDefault();
                event.stopPropagation();
                if (apply.disabled) return;
                apply.disabled = true;
                try {
                    await this.applyPolishResultPanelText(textbox, String(text || ""));
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
        copy.textContent = this.t("polishResultCopy");
        copy.addEventListener("click", async event => {
            event.preventDefault();
            event.stopPropagation();
            try {
                await this.copyTextToClipboard(String(text || ""));
                this.removePolishResultPanel();
            }
            catch (error) {
                this.showToast(this.t("promptCopyFailed", { error: this.formatError(error) }), "error");
                this.focusPolishResultOutput(output);
            }
        });
        actions.appendChild(copy);

        panel.appendChild(actions);
        ["pointerdown", "mousedown", "click"].forEach(type => {
            panel.addEventListener(type, event => event.stopPropagation());
        });

        document.body.appendChild(panel);
        this.polishResultPanel = panel;
        const reposition = () => {
            this.syncDiscordThemeClasses(panel, textbox || options.sourceButton);
            this.positionPolishResultPanel(panel, textbox, options.sourceButton);
        };
        const outsidePointerDown = event => {
            if (panel.contains?.(event.target)) return;
            this.removePolishResultPanel();
        };
        const escapeKeydown = event => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            this.removePolishResultPanel();
        };
        this.polishResultPanelCleanup = () => {
            if (typeof window === "undefined") return;
            window.removeEventListener?.("resize", reposition, true);
            window.removeEventListener?.("scroll", reposition, true);
            document.removeEventListener?.("pointerdown", outsidePointerDown, true);
            document.removeEventListener?.("keydown", escapeKeydown, true);
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", reposition, true);
            window.addEventListener?.("scroll", reposition, true);
        }
        document.addEventListener?.("pointerdown", outsidePointerDown, true);
        document.addEventListener?.("keydown", escapeKeydown, true);
        reposition();
    }

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
    }

    positionPolishResultPanel(panel, textbox, sourceButton = null) {
        if (!panel?.style || typeof window === "undefined") return;
        const anchor = textbox?.getBoundingClientRect?.() || sourceButton?.getBoundingClientRect?.() || null;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 900;
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 700;
        const width = Math.min(440, Math.max(260, viewportWidth - 32));
        const leftBase = anchor ? anchor.left : viewportWidth - width - 24;
        const left = Math.max(16, Math.min(leftBase, viewportWidth - width - 16));
        const bottom = anchor ? Math.max(16, viewportHeight - anchor.top + 10) : 96;
        panel.style.left = `${left}px`;
        panel.style.right = "auto";
        panel.style.bottom = `${Math.min(Math.max(bottom, 16), Math.max(16, viewportHeight - 120))}px`;
        panel.style.width = `${width}px`;
    }

    removePolishResultPanel() {
        this.polishResultPanelCleanup?.();
        this.polishResultPanelCleanup = null;
        this.polishResultPanel?.remove?.();
        this.polishResultPanel = null;
    }

    // The panel's "Insert into input" action: an explicit user request, so it replaces whatever the
    // composer holds now (Discord's undo brings the previous draft back).
    async applyPolishResultPanelText(textbox, text) {
        const target = textbox && textbox.isConnected !== false ? textbox : this.resolveInputActionTextbox(null, {});
        if (!target) {
            this.showToast(this.t("textboxMissing"), "error");
            return false;
        }
        const currentText = this.getTextboxDraftText(target);
        const writeToken = this.composerWriter.beginWrite(target, currentText);
        let result = null;
        try {
            result = await this.composerWriter.replaceTextSafely(target, text, {
                blurAfterReplace: false,
                expectedPreviousText: currentText,
                writeToken
            });
        }
        finally {
            this.composerWriter.finishWriteToken(writeToken);
        }
        if (result?.ok) {
            this.removePolishResultPanel();
            return true;
        }
        if (result?.reason !== "write-cancelled") this.showToast(this.t("polishResultApplyFailed"), "error");
        return false;
    }

    showRestoreOriginalControl(textbox, session, sourceButton = null) {
        const originalText = session?.originalRawText ?? session?.originalText;
        if (typeof document === "undefined" || !originalText) return;
        this.removePolishRestoreControl();
        this.removeInputActionMenu();

        const container = this.getPolishButtonContainer(textbox);
        const group = container ? this.getInputActionGroup(container) : null;
        if (group) {
            this.syncInputRestoreButtonState(group, textbox, { restoreSession: session });
            this.syncInputActionButtonThemes(group, textbox || sourceButton || container);
            this.syncInputActionGroupState(group, textbox, container);
            return;
        }

        const button = document.createElement("button");
        button.className = "dait-polish-restore-control";
        this.syncDiscordThemeClasses(button, textbox || sourceButton);
        button.type = "button";
        button.textContent = this.t("restoreOriginal");
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
        this.polishRestoreControl = button;
        const reposition = () => {
            this.syncDiscordThemeClasses(button, textbox || sourceButton);
            this.positionPolishRestoreControl(button, textbox, sourceButton);
        };
        const timeout = typeof window !== "undefined" && typeof window.setTimeout === "function"
            ? window.setTimeout(() => this.removePolishRestoreControl(), 8000)
            : null;
        this.polishRestoreControlCleanup = () => {
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", reposition, true);
                window.removeEventListener?.("scroll", reposition, true);
                if (timeout) window.clearTimeout?.(timeout);
            }
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", reposition, true);
            window.addEventListener?.("scroll", reposition, true);
        }
        reposition();
    }

    async restorePolishOriginal(textbox, session, sourceButton = null) {
        const originalText = session?.originalRawText ?? session?.originalText;
        if (!originalText) return false;
        if (!this.canRestorePolishOriginal(textbox, session)) {
            this.removePolishRestoreControl();
            this.removeInputActionMenu();
            this.injectInputButtons();
            this.showToast(this.t("publicBilingualInputChanged"), "info");
            return false;
        }
        const currentText = this.getTextboxDraftText(textbox);
        const writeToken = this.composerWriter.beginWrite(textbox, currentText);
        try {
            const result = await this.composerWriter.replaceTextSafely(textbox, originalText, {
                blurAfterReplace: false,
                extraBlurTarget: sourceButton,
                expectedPreviousText: currentText,
                writeToken
            });
            if (result.ok && this.composerWriter.isWriteTokenCurrent(writeToken)) {
                // The draft is the original again: nothing is left to restore, and the original must not
                // count as already polished for the next bilingual-with-polish run.
                session.lastWrittenText = "";
                session.lastWrittenRawText = "";
                session.updatedAt = Date.now();
                this.polishSession = session;
                this.removePolishRestoreControl();
                this.removeInputActionMenu();
                this.injectInputButtons();
                return true;
            }
        }
        finally {
            this.composerWriter.finishWriteToken(writeToken);
        }
        if (textbox?.isConnected !== false) this.showPolishResultPanel(textbox, originalText, { sourceButton });
        return false;
    }

    canRestorePolishOriginal(textbox, session) {
        if (!textbox || textbox.isConnected === false || !session) return false;
        if (session.composerKey && this.getTextboxComposerKey(textbox) !== session.composerKey) return false;
        const current = this.getTextboxDraftText(textbox);
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
    }

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
    }

    removePolishRestoreControl() {
        this.polishRestoreControlCleanup?.();
        this.polishRestoreControlCleanup = null;
        this.polishRestoreControl?.remove?.();
        this.polishRestoreControl = null;
    }

    setTemporaryButtonText(button, text, fallback, delay = 1200) {
        if (!button) return;
        button.textContent = text;
        setTimeout(() => {
            if (button.isConnected) button.textContent = fallback;
        }, delay);
    }

    resolveManualTranslationSource(messageNode, content, textOptions = null, fallbackText = "") {
        const domText = this.normalizeExtractedText(fallbackText || this.getElementText(content, textOptions));
        const candidates = [];
        const pushCandidate = (source, text, confidence = "normal") => {
            const value = this.normalizeExtractedText(text);
            if (!value) return;
            if (candidates.some(candidate => candidate.text === value && candidate.source === source)) return;
            candidates.push({ source, text: value, confidence, length: value.length });
        };

        pushCandidate("dom-content", domText, "dom");

        if (!textOptions?.includeReplyPreview) {
            try {
                for (const candidate of this.getMessageContentElements(messageNode) || []) {
                    pushCandidate("dom-message-content", this.getElementText(candidate), "dom");
                }
            }
            catch {}

            const storeCandidate = this.getManualTranslationStoreSourceCandidate(messageNode, content, domText);
            if (storeCandidate?.text) pushCandidate(storeCandidate.source, storeCandidate.text, storeCandidate.confidence || "store");
        }

        const selected = this.selectManualTranslationSourceCandidate(candidates, domText) || candidates[0] || { source: "dom-content", text: domText, length: domText.length };
        this.logDiagnostic("manual.source", selected.source === "dom-content" ? "dom" : "resolved", {
            source: selected.source,
            confidence: selected.confidence || "",
            selectedLength: String(selected.text || "").length,
            domLength: domText.length,
            candidateCount: candidates.length,
            candidateLengths: candidates.map(candidate => ({
                source: candidate.source,
                length: candidate.length,
                confidence: candidate.confidence
            })),
            selectedHash: this.getStrongTextFingerprint(selected.text || ""),
            domHash: this.getStrongTextFingerprint(domText)
        });
        return {
            text: selected.text || domText,
            domText,
            source: selected.source || "dom-content",
            confidence: selected.confidence || "",
            candidates
        };
    }

    getManualTranslationStoreSourceCandidate(messageNode, content, referenceText = "") {
        if (!messageNode || !content || this.isReplyPreviewElement(content)) return null;
        const route = this.messageTracker.getRouteIds?.() || {};
        const ids = this.messageTracker.getNodeMessageIds?.(messageNode) || {};
        const channelId = ids.channelId || route.channelId || "";
        if (!channelId) return null;

        let messages = [];
        try {
            messages = this.getBdfdbMessageStoreMessages(channelId);
        }
        catch (error) {
            this.warnSanitized("Failed to read message store for manual translation source", error);
            return null;
        }
        if (!messages.length) return null;

        const messageId = ids.messageId || "";
        const authorId = this.messageTracker.getAuthorId?.(messageNode) || "";
        const timestamp = this.messageTracker.getTimestamp?.(messageNode) || "";
        const referenceComparable = this.messageTracker.normalizeComparableText(referenceText);

        const toCandidate = (message, source, confidence) => {
            const text = this.getDiscordStoreMessageText(message);
            if (!text) return null;
            return { source, confidence, text };
        };

        if (messageId) {
            const exact = messages.find(message => String(this.messageTracker.getStoreMessageId(message) || "") === String(messageId));
            const candidate = exact ? toCandidate(exact, "store-message-id", "id") : null;
            if (candidate) return candidate;
        }

        if (!referenceComparable) return null;
        const matches = messages.filter(message => {
            const text = this.getDiscordStoreMessageText(message);
            if (!text || !this.isManualTranslationSourceCompatible(text, referenceText)) return false;
            const messageChannelId = this.messageTracker.getStoreMessageChannelId(message);
            if (messageChannelId && String(messageChannelId) !== String(channelId)) return false;
            if (authorId && String(this.messageTracker.getStoreMessageAuthorId(message) || "") !== String(authorId)) return false;
            if (timestamp && !this.messageTracker.isStoreTimestampMatch(timestamp, this.messageTracker.getStoreMessageTimestamp(message))) return false;
            return true;
        });
        if (matches.length !== 1) return null;
        return toCandidate(matches[0], "store-compatible-text", "compatible");
    }

    selectManualTranslationSourceCandidate(candidates = [], referenceText = "") {
        const values = candidates
            .map(candidate => ({
                ...candidate,
                text: this.normalizeExtractedText(candidate?.text || ""),
                length: this.normalizeExtractedText(candidate?.text || "").length
            }))
            .filter(candidate => candidate.text);
        if (!values.length) return null;

        const compatible = values.filter(candidate => this.isManualTranslationSourceCompatible(candidate.text, referenceText));
        const pool = compatible.length ? compatible : values.filter(candidate => candidate.confidence === "id");
        const list = pool.length ? pool : values;
        return list.reduce((best, candidate) => {
            if (!best) return candidate;
            const bestBonus = best.confidence === "id" ? 12 : 0;
            const candidateBonus = candidate.confidence === "id" ? 12 : 0;
            if (candidate.length + candidateBonus > best.length + bestBonus + 4) return candidate;
            return best;
        }, null);
    }

    isManualTranslationSourceCompatible(candidateText, referenceText = "") {
        const candidate = this.messageTracker.normalizeComparableText(candidateText);
        const reference = this.messageTracker.normalizeComparableText(referenceText);
        if (!candidate) return false;
        if (!reference) return true;
        if (candidate === reference) return true;
        if (candidate.includes(reference) || reference.includes(candidate)) return true;
        if (reference.length < 24) return false;
        const referenceTokens = new Set((reference.match(/[\p{L}\p{N}_:+.-]{2,}/gu) || []).map(token => token.toLocaleLowerCase()));
        const candidateTokens = new Set((candidate.match(/[\p{L}\p{N}_:+.-]{2,}/gu) || []).map(token => token.toLocaleLowerCase()));
        if (!referenceTokens.size || !candidateTokens.size) return false;
        let overlap = 0;
        referenceTokens.forEach(token => {
            if (candidateTokens.has(token)) overlap++;
        });
        return overlap / Math.max(1, referenceTokens.size) >= 0.75;
    }

    isManualTranslationSourceStillCurrent(plan) {
        if (!plan?.messageNode?.isConnected || !plan?.content?.isConnected) return false;
        const currentText = this.normalizeExtractedText(this.getElementText(plan.content, plan.textOptions));
        if (!currentText) return false;
        const expectedTexts = [plan.text, plan.domText]
            .map(text => this.normalizeExtractedText(text))
            .filter(Boolean);
        return expectedTexts.includes(currentText);
    }

    beginManualTranslationRequest(content) {
        const token = ++this.manualTranslationRequestCounter;
        if (this.manualTranslationRequestTokens && content && (typeof content === "object" || typeof content === "function")) {
            this.manualTranslationRequestTokens.set(content, token);
        }
        return token;
    }

    isManualTranslationRequestCurrent(plan) {
        if (!plan?.requestToken) return true;
        if (!this.manualTranslationRequestTokens || !plan.content) return true;
        return this.manualTranslationRequestTokens.get(plan.content) === plan.requestToken;
    }

    isManualTranslationConfigCurrent(plan) {
        const options = plan?.requestOptions;
        if (!options) return true;
        if (Number(options.version ?? this.autoTranslationConfigVersion) !== this.autoTranslationConfigVersion) return false;
        const providerKey = String(options.providerKey || "");
        return !providerKey || this.isAutoTranslationProviderSnapshotCurrent(providerKey, options);
    }

    createManualTranslationPlan(messageNode, content, text, textOptions = null, sourceMeta = null) {
        const requestOptions = this.withMessageIdentity(this.getManualTranslationRequestOptions(), messageNode, content, text);
        const autoRequestOptions = this.withMessageIdentity(this.getAutoTranslationRequestOptionsForText(text, this.getAutoTranslationOptions()), messageNode, content, text);
        const cacheKey = this.getTranslationCacheKey(text, requestOptions);
        const autoCacheKey = this.getTranslationCacheKey(text, autoRequestOptions);
        return {
            mode: "manual",
            messageNode,
            content,
            text,
            textOptions,
            requestOptions,
            autoRequestOptions,
            cacheKey,
            autoCacheKey,
            domText: sourceMeta?.domText ?? text,
            sourceKind: sourceMeta?.source || "dom-content",
            sourceConfidence: sourceMeta?.confidence || "",
            sourceHash: this.getStrongTextFingerprint(text),
            startedAt: Date.now(),
            lifecycleToken: this.getLifecycleToken(),
            requestToken: this.beginManualTranslationRequest(content)
        };
    }

    clearManualBlockingState(planOrCacheKey, requestOptions = null) {
        const plan = typeof planOrCacheKey === "object" && planOrCacheKey !== null ? planOrCacheKey : null;
        const cacheKey = plan?.autoCacheKey || plan?.cacheKey || String(planOrCacheKey || "");
        const options = plan?.autoRequestOptions || plan?.requestOptions || requestOptions || this.getAutoTranslationOptions();
        const text = plan?.text || "";
        this.clearAutoTranslationFailure(cacheKey, options);
        if (text) this.clearAutoTextTranslationFailure(text, options);
        this.clearAutoTranslationPendingTargets(cacheKey);
        this.removeQueuedAutoTranslationItem(cacheKey);
        if (plan?.cacheKey && plan.cacheKey !== cacheKey) {
            this.clearAutoTranslationFailure(plan.cacheKey, plan.requestOptions || options);
            this.clearAutoTranslationPendingTargets(plan.cacheKey);
            this.removeQueuedAutoTranslationItem(plan.cacheKey);
        }
        return true;
    }

    renderManualLoading(plan) {
        return this.renderTranslationLoading(plan.messageNode, plan.content, plan.cacheKey, plan.text);
    }

    runManualTranslationPlan(plan) {
        return this.runManualRescueTranslationPlan(plan);
    }

    getManualRescueAttemptOptions(plan, attemptName, previousOutput = "", previousReason = "") {
        if (attemptName === "manual-force-target") {
            return this.getManualForceTargetTranslationOptions(plan.text, previousOutput, previousReason, plan.requestOptions);
        }
        if (attemptName === "manual-repair") {
            return this.getManualRepairTranslationOptions(plan.text, previousOutput, previousReason, plan.requestOptions);
        }
        return plan.requestOptions;
    }

    async runManualRescueModelAttempt(plan, requestOptions) {
        if (this.isLongAutoTranslationText(plan.text)) {
            const taskOptions = {
                retryInvalidOutput: false,
                manualRescue: true
            };
            const wholePass = await this.runManualLongTextWholePass(plan, requestOptions, taskOptions);
            if (wholePass !== null) return wholePass;
            const translated = await this.runAutoTranslationTask(plan.text, requestOptions, taskOptions);
            if (taskOptions.longTextPartial) {
                requestOptions.longTextPartial = true;
                requestOptions.longTextFailedChunks = Number(taskOptions.longTextFailedChunks || 0);
                requestOptions.longTextSuccessfulChunks = Number(taskOptions.longTextSuccessfulChunks || 0);
            }
            return translated;
        }
        return this.runAutoTranslationModelAttempt(plan.text, requestOptions);
    }

    getManualRescueValidation(plan, translated, requestOptions) {
        return this.getAutoTranslationOutputValidationResult(
            plan.text,
            translated,
            this.getAutoTranslationTargetLanguage(requestOptions),
            this.getAutoTranslationOutputValidationOptions(plan.text, translated, requestOptions),
            requestOptions
        );
    }

    logManualRescueAttempt(plan, attemptName, attemptIndex, requestOptions, translated = "", validation = null, error = null) {
        const invalidReason = validation?.reasonCode || error?.autoTranslationInvalidReason || "";
        this.logDiagnostic("manual.rescue", "attempt", {
            ...this.getTranslationDiagnosticMeta("manual", {
                requestOptions,
                text: plan.text,
                cacheKey: plan.cacheKey,
                textOptions: plan.textOptions,
                messageState: validation?.renderable ? DIAGNOSTIC_MESSAGE_STATES.RENDERED : DIAGNOSTIC_MESSAGE_STATES.FAILED,
                reasonCode: validation?.renderable ? DIAGNOSTIC_REASON_CODES.RENDERED : DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID,
                extra: error ? { failureType: this.getAutoTranslationFailureType(error) } : null
            }),
            key: this.getTextFingerprint(plan.cacheKey),
            sourceHash: plan.sourceHash,
            attemptName,
            attemptIndex,
            requestCount: attemptIndex + 1,
            invalidReason,
            validationQuality: validation?.quality || error?.autoTranslationValidationQuality || "",
            renderable: Boolean(validation?.renderable),
            cacheable: Boolean(validation?.cacheable),
            outputHash: translated ? this.getStrongTextFingerprint(translated) : "",
            outputLength: String(translated || "").length,
            failureType: error ? this.getAutoTranslationFailureType(error) : ""
        });
    }

    isManualRescueRetryableError(error) {
        return Boolean(error?.autoTranslationFinalInvalidOutput || error?.modelOutputTruncated);
    }

    createManualRescueFailureError(reason = "invalid-output", validationQuality = "", attempts = []) {
        const error = this.createFinalInvalidAutoTranslationError(reason || "invalid-output", {
            terminal: false,
            validationQuality
        });
        error.message = this.t("manualTranslateRescueFailed");
        error.manualTranslationRescueFailed = true;
        error.manualRescueAttempts = attempts;
        return error;
    }

    async runManualRescueTranslationPlan(plan) {
        const attemptNames = ["manual-normal", "manual-force-target", "manual-repair"];
        const attempts = [];
        let previousOutput = "";
        let previousReason = "";
        let lastValidation = null;
        let lastError = null;

        for (let index = 0; index < attemptNames.length; index++) {
            const attemptName = attemptNames[index];
            const requestOptions = this.getManualRescueAttemptOptions(plan, attemptName, previousOutput, previousReason);
            let translated = "";
            let validation = null;
            try {
                translated = await this.runManualRescueModelAttempt(plan, requestOptions);
                validation = this.getManualRescueValidation(plan, translated, requestOptions);
                this.logManualRescueAttempt(plan, attemptName, index, requestOptions, translated, validation, null);
                attempts.push({
                    attemptName,
                    invalidReason: validation.reasonCode || "",
                    validationQuality: validation.quality || "",
                    renderable: Boolean(validation.renderable),
                    cacheable: Boolean(validation.cacheable)
                });
                if (validation.renderable) {
                    return { translated, validation, requestOptions, attemptName, attempts };
                }
                previousOutput = String(translated || "");
                previousReason = validation.reasonCode || "invalid-output";
                lastValidation = validation;
                lastError = this.createFinalInvalidAutoTranslationError(previousReason, {
                    terminal: false,
                    validationQuality: validation.quality
                });
            }
            catch (error) {
                lastError = error;
                previousReason = error?.autoTranslationInvalidReason || error?.autoTranslationCancelReason || this.getAutoTranslationFailureType(error) || "invalid-output";
                this.logManualRescueAttempt(plan, attemptName, index, requestOptions, previousOutput, null, error);
                attempts.push({
                    attemptName,
                    invalidReason: previousReason,
                    validationQuality: error?.autoTranslationValidationQuality || "",
                    renderable: false,
                    cacheable: false,
                    failureType: this.getAutoTranslationFailureType(error)
                });
                if (!this.isManualRescueRetryableError(error)) throw error;
            }
        }

        const finalReason = previousReason || lastValidation?.reasonCode || lastError?.autoTranslationInvalidReason || "invalid-output";
        const finalQuality = lastValidation?.quality || lastError?.autoTranslationValidationQuality || "";
        throw this.createManualRescueFailureError(finalReason, finalQuality, attempts);
    }

    renderManualFailure(plan, error) {
        return this.renderTranslationError(plan.messageNode, plan.content, error, plan.cacheKey, plan.text);
    }

    async translateMessage(messageNode, content, button, textOptions = null) {
        if (!this.settings.translation.enabled) {
            this.showToast(this.t("translationDisabled"), "info");
            return;
        }

        const initialText = this.getElementText(content, textOptions);
        if (!initialText) {
            this.showToast(this.t("noTranslatableText"), "info");
            return;
        }

        const source = this.resolveManualTranslationSource(messageNode, content, textOptions, initialText);
        const text = source.text || initialText;
        if (this.isLowInformationRepeatedText(text)) {
            this.showToast(this.t("noTranslatableText"), "info");
            return;
        }
        const plan = this.createManualTranslationPlan(messageNode, content, text, textOptions, source);
        const requestOptions = plan.requestOptions;
        const cacheKey = plan.cacheKey;
        const startedAt = plan.startedAt;
        const lifecycleToken = plan.lifecycleToken;
        this.clearManualBlockingState(plan);
        this.logDiagnostic("manual.translate", "start", {
            ...this.getTranslationDiagnosticMeta("manual", {
                requestOptions,
                text,
                cacheKey,
                textOptions,
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                reasonCode: DIAGNOSTIC_REASON_CODES.REQUEST_STARTED
            }),
            key: this.getTextFingerprint(cacheKey),
            sourceHash: this.getStrongTextFingerprint(text),
            length: String(text || "").length,
            domLength: String(plan.domText || "").length,
            sourceKind: plan.sourceKind,
            sourceConfidence: plan.sourceConfidence
        });
        const cachedTranslation = this.getTranslationCacheValue(cacheKey, this.getTranslationCacheAliases(text, requestOptions));
        if (cachedTranslation !== null) {
            if (this.isInvalidAutoTranslationCacheValue(text, cachedTranslation, requestOptions)) {
                this.deleteTranslationCacheCandidates(cacheKey, ...this.getTranslationCacheAliases(text, requestOptions));
            }
            else {
                this.logDiagnostic("manual.translate", "cache-hit", {
                    ...this.getTranslationDiagnosticMeta("manual", {
                        requestOptions,
                        text,
                        cacheKey,
                        textOptions,
                        messageState: DIAGNOSTIC_MESSAGE_STATES.CACHE_HIT,
                        reasonCode: DIAGNOSTIC_REASON_CODES.CACHE_HIT
                    }),
                    key: this.getTextFingerprint(cacheKey),
                    ms: Date.now() - startedAt
                });
                this.syncManualTranslationToAutoCache(messageNode, content, text, cachedTranslation, textOptions);
                this.renderTranslation(messageNode, content, cachedTranslation, cacheKey, text);
                return;
            }
        }

        this.renderManualLoading(plan);
        this.setButtonBusy(button, true, this.t("translateBusy"));
        try {
            const manualResult = await this.runManualTranslationPlan(plan);
            const translated = manualResult && typeof manualResult === "object" && Object.prototype.hasOwnProperty.call(manualResult, "translated")
                ? manualResult.translated
                : manualResult;
            const resultRequestOptions = manualResult?.requestOptions || requestOptions;
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) {
                this.removeTranslationNode(messageNode, content);
                return;
            }
            if (!this.isManualTranslationRequestCurrent(plan)) return;
            if (!this.isManualTranslationConfigCurrent(plan)) {
                this.removeTranslationNode(messageNode, content);
                return;
            }
            const validation = manualResult?.validation || this.getAutoTranslationOutputValidationResult(
                text,
                translated,
                this.getAutoTranslationTargetLanguage(resultRequestOptions),
                this.getAutoTranslationOutputValidationOptions(text, translated, resultRequestOptions),
                resultRequestOptions
            );
            if (!validation.renderable) {
                throw this.createManualRescueFailureError(validation.reasonCode || "invalid-output", validation.quality || "", manualResult?.attempts || []);
            }
            if (!this.isManualTranslationSourceStillCurrent(plan)) {
                this.removeTranslationNode(messageNode, content);
                this.logDiagnostic("manual.translate", "stale-dom", {
                    ...this.getTranslationDiagnosticMeta("manual", {
                        requestOptions,
                        text,
                        cacheKey,
                        textOptions,
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        reasonCode: DIAGNOSTIC_REASON_CODES.STALE_DOM
                    }),
                    key: this.getTextFingerprint(cacheKey),
                    ms: Date.now() - startedAt
                });
                return;
            }
            const usedProviderFallback = Boolean(resultRequestOptions.requestContext?.fallbackProvider);
            if (validation.cacheable && !usedProviderFallback) {
                this.setTranslationCache(cacheKey, translated);
                this.syncManualTranslationToAutoCache(messageNode, content, text, translated, textOptions);
            }
            this.renderTranslation(messageNode, content, translated, cacheKey, text, {
                partial: validation.quality === TRANSLATION_VALIDATION_QUALITIES.PARTIAL,
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || ""
            });
            this.rememberRecentAutoTranslationRender(plan.autoCacheKey, text, plan.autoRequestOptions, {
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || ""
            });
            this.logDiagnostic("manual.translate", "success", {
                ...this.getTranslationDiagnosticMeta("manual", {
                    requestOptions: resultRequestOptions,
                    text,
                    cacheKey,
                    textOptions,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                    reasonCode: DIAGNOSTIC_REASON_CODES.RENDERED
                }),
                key: this.getTextFingerprint(cacheKey),
                ms: Date.now() - startedAt,
                validationQuality: validation.quality,
                validationReason: validation.reasonCode || "",
                cacheable: validation.cacheable && !usedProviderFallback,
                fallbackProvider: resultRequestOptions.requestContext?.fallbackProvider || ""
            });
        }
        catch (error) {
            if (!this.isLifecycleTokenCurrent(lifecycleToken)) {
                this.removeTranslationNode(messageNode, content);
                return;
            }
            if (!this.isManualTranslationRequestCurrent(plan)) return;
            if (!this.isManualTranslationConfigCurrent(plan)) {
                this.removeTranslationNode(messageNode, content);
                return;
            }
            this.logDiagnostic("manual.translate", "error", {
                ...this.getTranslationDiagnosticMeta("manual", {
                    requestOptions,
                    text,
                    cacheKey,
                    textOptions,
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    reasonCode: DIAGNOSTIC_REASON_CODES.FAILURE,
                    extra: { failureType: this.getAutoTranslationFailureType(error) }
                }),
                key: this.getTextFingerprint(cacheKey),
                type: this.getAutoTranslationFailureType(error),
                ms: Date.now() - startedAt
            });
            const silentManualFailure = Boolean(error?.manualTranslationRescueFailed || error?.autoTranslationFinalInvalidOutput);
            if (!error?.autoTranslationFinalInvalidOutput) this.markAutoTranslationProviderFailure(requestOptions, error);
            if (this.isManualTranslationSourceStillCurrent(plan)) {
                if (silentManualFailure) this.removeTranslationNode(messageNode, content);
                else this.renderManualFailure(plan, error);
            }
            else {
                this.removeTranslationNode(messageNode, content);
            }
            if (!silentManualFailure) this.showToast(this.formatError(error), "error");
        }
        finally {
            if (this.isLifecycleTokenCurrent(lifecycleToken) && this.isManualTranslationRequestCurrent(plan)) {
                this.setButtonBusy(button, false, this.t("translateButton"));
            }
        }
    }

    syncManualTranslationToAutoCache(messageNode, content, text, translated, textOptions = null) {
        if (!messageNode || !content || !text || !translated) return false;
        const requestOptions = this.withMessageIdentity(
            this.getAutoTranslationRequestOptionsForText(text, this.getAutoTranslationOptions()),
            messageNode,
            content,
            text
        );
        if (this.isInvalidAutoTranslationCacheValue(text, translated, requestOptions)) return false;
        const cacheKey = this.getTranslationCacheKey(text, requestOptions);
        this.cacheAutoTranslationResultWithOptions(cacheKey, text, requestOptions, translated);
        const providerKey = this.getAutoTranslationProviderKey(requestOptions);
        if (providerKey) this.autoTranslationProviderFailures.delete(providerKey);
        this.clearAutoTranslationPendingTargets(cacheKey);
        this.logDiagnostic("manual.translate", "auto-cache-sync", {
            ...this.getTranslationDiagnosticMeta("manual", {
                requestOptions,
                text,
                cacheKey,
                textOptions,
                messageState: DIAGNOSTIC_MESSAGE_STATES.CACHED,
                reasonCode: DIAGNOSTIC_REASON_CODES.CACHE_HIT
            }),
            key: this.getTextFingerprint(cacheKey),
            sourceHash: this.getStrongTextFingerprint(text),
            preview: Boolean(textOptions?.includeReplyPreview)
        });
        if (this.isAutoTranslateEnabled()) this.queueScan({ delayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
        return true;
    }

    translateMessageFromContextTarget(target) {
        const messageNode = target?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        const content = messageNode ? this.getMessageContentElement(messageNode) : null;
        if (!messageNode || !content) {
            this.showToast(this.t("messageMissing"), "error");
            return;
        }

        this.translateMessage(messageNode, content);
    }

    getErrorSignalText(error) {
        const values = [
            error?.name,
            error?.code,
            error?.message,
            error?.cause?.name,
            error?.cause?.code,
            error?.cause?.message
        ];
        return values.map(value => String(value || "")).filter(Boolean).join(" ");
    }

    createApiError(response, raw = "") {
        const error = new Error("API_ERROR");
        error.status = Number(response?.status || 0);
        error.retryAfterMs = this.parseRetryAfterMs(response?.headers?.get?.("retry-after"));
        error.requestId = response?.headers?.get?.("x-request-id")
            || response?.headers?.get?.("cf-ray")
            || response?.headers?.get?.("x-ratelimit-request-id")
            || "";
        error.bodyHash = this.getTextFingerprint(String(raw || "").slice(0, 2000));
        return error;
    }

    annotateTranslateProviderApiError(error, raw = "", request = {}) {
        if (!error || !["microsoft", "deepl", "baidu"].includes(String(request?.provider || ""))) return error;
        error.providerKey = request.providerKey || "";
        const signal = `${Number(error.status || 0)} ${String(raw || "").slice(0, 4000)}`;
        if (/quota|limit exceeded|daily limit|monthly limit|character limit|456|54003|54004|54005/i.test(signal)) {
            error.providerQuotaExceeded = true;
        }
        if (/invalid key|unauthorized|forbidden|401|403|52003|54001/i.test(signal)) {
            error.providerAuthFailed = true;
        }
        if (/too many|rate.?limit|429|54003/i.test(signal)) {
            error.providerRateLimited = true;
        }
        if (Number(error.status || 0) >= 500) {
            error.providerServerError = true;
        }
        return error;
    }

    parseRetryAfterMs(value) {
        const text = String(value || "").trim();
        if (!text) return 0;
        const seconds = Number(text);
        if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
        const date = Date.parse(text);
        return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
    }

    appendQueryParam(url, key, value) {
        const separator = String(url || "").includes("?") ? "&" : "?";
        return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    }

    normalizeRequestNumber(value, fallback, options = {}) {
        const number = Number(value);
        let normalized = Number.isFinite(number) ? number : Number(fallback);
        if (!Number.isFinite(normalized)) normalized = 0;
        if (options.integer) normalized = Math.round(normalized);
        if (typeof options.min === "number") normalized = Math.max(options.min, normalized);
        if (typeof options.max === "number") normalized = Math.min(options.max, normalized);
        return normalized;
    }

    getApiConfig(kind) {
        const config = this.getTaskConfig(kind);

        const apiKey = this.getEffectiveRequestApiKey(config);
        if (!apiKey) throw new Error(kind === "polish" ? this.t("apiKeyMissingPolish") : this.t("apiKeyMissingTranslation"));

        const endpoint = this.getEffectiveChatCompletionEndpoint(config, DEFAULT_SETTINGS[kind] || {});
        const model = this.getEffectiveChatCompletionModel(kind, config, DEFAULT_SETTINGS[kind] || {});
        if (!endpoint) throw new Error(this.t("endpointMissing"));
        if (this.isChatCompletionProvider(config) && !model) throw new Error(this.t("modelMissing"));

        return { config, endpoint, apiKey, model };
    }

    getLanguageInstruction(language, options = {}) {
        if (options.source && (!language || language === AUTO_LANGUAGE_VALUE)) return "auto-detect";
        const normalized = this.normalizeLanguageName(language);
        return this.getChineseLanguageInstruction(normalized) || normalized || (options.source ? "auto-detect" : "");
    }

    expandPrompt(prompt, targetLanguage) {
        return String(prompt || "")
            .replaceAll("{{targetLanguage}}", targetLanguage || "")
            .replaceAll("{targetLanguage}", targetLanguage || "");
    }

    shouldHideOriginalForTranslationLine(line, content) {
        if (!this.settings.ui?.hideOriginalAfterTranslation) return false;
        if (!line || !content) return false;
        if (this.isReplyPreviewElement(content)) return false;
        if (line.classList?.contains?.("dait-translation-loading")) return false;
        if (line.classList?.contains?.("dait-translation-error")) return false;
        if (line.classList?.contains?.("dait-translation-masked")) return false;
        return line.classList?.contains?.("dait-translation-revealed") !== false;
    }

    syncTranslationSourceVisibility(line, content, sourceText = null) {
        if (!content?.dataset) return;
        if (!this.shouldHideOriginalForTranslationLine(line, content)) {
            this.restoreTranslationSourceVisibility(content);
            return;
        }

        const text = sourceText ?? this.getElementText(content);
        const lines = String(text || "")
            .split(/\n+/)
            .map(value => value.trim())
            .filter(Boolean);
        const lineCount = Math.max(1, Math.min(4, lines.length || 1));
        const maxLength = Math.max(8, ...lines.map(value => value.length));
        const width = Math.min(42, Math.max(7, Math.ceil(maxLength * 0.72)));
        content.dataset.daitSourceHidden = "true";
        this.setTranslationSourceStyleProperty(content, "--dait-source-mask-lines", String(lineCount));
        this.setTranslationSourceStyleProperty(content, "--dait-source-mask-width", `${width}ch`);
    }

    restoreTranslationSourceVisibility(content) {
        if (!content?.dataset) return;
        delete content.dataset.daitSourceHidden;
        this.removeTranslationSourceStyleProperty(content, "--dait-source-mask-lines");
        this.removeTranslationSourceStyleProperty(content, "--dait-source-mask-width");
    }

    setTranslationSourceStyleProperty(content, name, value) {
        if (!content?.style?.setProperty) return;
        if (content.style.getPropertyValue?.(name) === value) return;
        this.markTranslationSourceStyleMutation(content);
        content.style.setProperty(name, value);
    }

    removeTranslationSourceStyleProperty(content, name) {
        if (!content?.style?.removeProperty) return;
        if (!content.style.getPropertyValue?.(name) && content.style[name] === undefined) return;
        this.markTranslationSourceStyleMutation(content);
        content.style.removeProperty(name);
    }

    restoreAllTranslationSourceVisibility() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        document.querySelectorAll("[data-dait-source-hidden='true']").forEach(node => this.restoreTranslationSourceVisibility(node));
    }

    syncAllTranslationSourceVisibility() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        if (!this.settings.ui?.hideOriginalAfterTranslation) {
            this.restoreAllTranslationSourceVisibility();
            return;
        }
        document.querySelectorAll(".dait-translation-line[data-dait-owner]").forEach(line => {
            this.syncTranslationSourceVisibility(line, this.getTranslationContentForLine(line));
        });
    }

    syncAllTranslationDisplaySettings() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        document.querySelectorAll(".dait-translation-line[data-dait-owner]").forEach(line => {
            const content = this.getTranslationContentForLine(line);
            if (!content?.isConnected) return;
            const isStateLine = line.classList?.contains?.("dait-translation-loading")
                || line.classList?.contains?.("dait-translation-error");
            if (!isStateLine) {
                line.classList?.toggle?.("dait-translation-masked", Boolean(this.settings.ui?.maskTranslations));
                line.classList?.toggle?.("dait-translation-revealed", !this.settings.ui?.maskTranslations);
            }
            this.positionExistingTranslationLine(line, content);
            this.syncTranslationSourceVisibility(line, content);
        });
    }

    positionExistingTranslationLine(line, content) {
        if (!line || !content) return;
        const anchor = this.getTranslationAnchor(null, content);
        if (!anchor) return;
        if (anchor === content) {
            if (this.settings.ui.translationPosition === "before") {
                if (line.parentElement !== anchor || line !== anchor.firstChild) anchor.insertBefore(line, anchor.firstChild || null);
            }
            else if (line.parentElement !== anchor || line !== anchor.lastChild) {
                anchor.appendChild(line);
            }
            return;
        }

        if (this.settings.ui.translationPosition === "before") {
            if (line.nextSibling !== content) anchor.insertBefore(line, content || anchor.firstChild);
            return;
        }

        const reference = content?.nextSibling || null;
        if (line.previousSibling !== content) anchor.insertBefore(line, reference);
    }

    getTranslationEmojiDescriptors(content) {
        const images = Array.from(content?.querySelectorAll?.("img[alt]") || []);
        return images.map(image => {
            try {
                if (image.closest?.(".dait-translation-line, .dait-translation-box")) return null;
            }
            catch {}
            const alt = String(image.getAttribute?.("alt") || "").trim();
            const match = alt.match(/^:([A-Za-z0-9_]{1,64}):$/);
            if (!match) return null;
            return { name: match[1], alt, image };
        }).filter(Boolean);
    }

    cloneTranslationEmojiNode(descriptor) {
        try {
            const clone = descriptor?.image?.cloneNode?.(true);
            if (!clone) return null;
            clone.removeAttribute?.("id");
            clone.removeAttribute?.("aria-describedby");
            clone.classList?.add?.("dait-translation-emoji");
            clone.setAttribute?.("alt", descriptor.alt);
            clone.setAttribute?.("aria-label", descriptor.alt);
            clone.setAttribute?.("draggable", "false");
            return clone;
        }
        catch {
            return null;
        }
    }

    appendTranslationTextWithDiscordEmoji(container, translatedText, content, descriptors = this.getTranslationEmojiDescriptors(content)) {
        if (!container || typeof document === "undefined" || typeof document.createTextNode !== "function") return false;
        if (!descriptors.length) return false;

        const descriptorCounts = new Map();
        descriptors.forEach(descriptor => descriptorCounts.set(descriptor.name, Number(descriptorCounts.get(descriptor.name) || 0) + 1));
        const outputCounts = this.getDiscordEmojiTokenCounts(translatedText);
        // Only real emoji (backed by a DOM image descriptor) must match exactly; other
        // ":token:"-shaped text such as "12:30:45" stays plain text and must not veto the render.
        for (const [name, count] of descriptorCounts) {
            if (Number(outputCounts.get(name) || 0) !== count) return false;
        }

        const queues = new Map();
        descriptors.forEach(descriptor => {
            if (!queues.has(descriptor.name)) queues.set(descriptor.name, []);
            queues.get(descriptor.name).push(descriptor);
        });

        const value = String(translatedText || "");
        const tokenPattern = /<a?:([A-Za-z0-9_]{1,64}):\d+>|:([A-Za-z0-9_]{1,64}):/g;
        const parts = [];
        let cursor = 0;
        let handled = false;
        let match = tokenPattern.exec(value);
        while (match) {
            const name = match[1] || match[2] || "";
            const queue = queues.get(name);
            if (queue?.length) {
                const before = value.slice(cursor, match.index);
                if (before) parts.push(document.createTextNode(before));
                const descriptor = queue.shift();
                const emoji = this.cloneTranslationEmojiNode(descriptor);
                if (!emoji) return false;
                parts.push(emoji);
                cursor = tokenPattern.lastIndex;
                handled = true;
            }
            match = tokenPattern.exec(value);
        }

        if (!handled) return false;
        const remainder = value.slice(cursor);
        if (remainder) parts.push(document.createTextNode(remainder));
        parts.forEach(node => container.appendChild(node));
        return true;
    }

    renderTranslation(messageNode, content, translatedText, cacheKey = "", sourceText = null, renderOptions = {}) {
        const scrollOptions = { allowScrollCorrectionWhilePaused: Boolean(renderOptions?.allowScrollCorrectionWhilePaused) };
        return this.withTranslationScrollStability(content, () => {
            const line = this.ensureTranslationNode(messageNode, content);
            line.classList.remove("dait-translation-error", "dait-translation-loading", "dait-translation-masked", "dait-translation-revealed");
            if (renderOptions?.partial) line.classList.add("dait-translation-partial");
            else line.classList.remove("dait-translation-partial");
            line.classList.add(this.settings.ui.maskTranslations ? "dait-translation-masked" : "dait-translation-revealed");
            this.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
            delete line.dataset.daitFailureType;
            delete line.dataset.daitLoadingAt;
            if (renderOptions?.validationQuality) line.dataset.daitValidationQuality = String(renderOptions.validationQuality);
            else delete line.dataset.daitValidationQuality;
            if (renderOptions?.validationReason) line.dataset.daitValidationReason = String(renderOptions.validationReason);
            else delete line.dataset.daitValidationReason;
            line.textContent = "";
            const text = document.createElement("span");
            text.className = "dait-translation-text";
            const emojiDescriptors = this.getTranslationEmojiDescriptors(content);
            if (emojiDescriptors.length && !this.appendTranslationTextWithDiscordEmoji(text, translatedText, content, emojiDescriptors)) {
                this.removeTranslationNode(messageNode, content);
                return null;
            }
            if (!emojiDescriptors.length) {
                text.textContent = translatedText;
            }
            line.appendChild(text);
            this.syncTranslationSourceVisibility(line, content, sourceText);
            return line;
        }, scrollOptions);
    }

    renderTranslationLoading(messageNode, content, cacheKey = "", sourceText = null) {
        return this.withTranslationScrollStability(content, () => {
            const line = this.ensureTranslationNode(messageNode, content);
            line.classList.remove("dait-translation-error", "dait-translation-masked", "dait-translation-revealed", "dait-translation-partial");
            line.classList.add("dait-translation-loading");
            this.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
            this.restoreTranslationSourceVisibility(content);
            delete line.dataset.daitFailureType;
            delete line.dataset.daitValidationQuality;
            delete line.dataset.daitValidationReason;
            line.dataset.daitLoadingAt = String(Date.now());
            line.textContent = "";
            return line;
        });
    }

    renderTranslationError(messageNode, content, error, cacheKey = "", sourceText = null) {
        return this.withTranslationScrollStability(content, () => {
            const line = this.ensureTranslationNode(messageNode, content);
            line.classList.remove("dait-translation-loading", "dait-translation-masked", "dait-translation-revealed", "dait-translation-partial");
            line.classList.add("dait-translation-error");
            this.setTranslationLineMetadata(line, messageNode, content, cacheKey, sourceText);
            this.restoreTranslationSourceVisibility(content);
            line.dataset.daitFailureType = this.getAutoTranslationFailureType(error);
            delete line.dataset.daitLoadingAt;
            delete line.dataset.daitValidationQuality;
            delete line.dataset.daitValidationReason;
            line.textContent = "";

            const message = document.createElement("span");
            message.className = "dait-translation-error-message";
            message.textContent = this.t("translationFailedInline", { error: this.formatError(error) });
            line.appendChild(message);

            const retry = document.createElement("button");
            retry.className = "dait-translation-retry";
            retry.type = "button";
            retry.textContent = this.t("translateRetry");
            retry.title = this.t("translateRetryTitle");
            retry.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                const currentContent = this.getTranslationContentForLine(line) || content;
                const textOptions = line.classList?.contains?.("dait-translation-preview")
                    ? { includeReplyPreview: true }
                    : null;
                if (!messageNode?.isConnected || !currentContent?.isConnected) {
                    line.remove();
                    this.showToast(this.t("messageMissing"), "error");
                    return;
                }

                const currentText = this.getElementText(currentContent, textOptions);
                if (!currentText || !this.isTranslationLineSourceMatch(line, currentText)) {
                    line.remove();
                    this.showToast(this.t("messageMissing"), "error");
                    return;
                }

                this.translateMessage(messageNode, currentContent, null, textOptions);
            });
            line.appendChild(retry);
            return line;
        });
    }

    withTranslationScrollStability(anchor, render, options = {}) {
        const snapshot = this.getTranslationScrollSnapshot(anchor, options);
        const result = render();
        this.restoreTranslationScrollSnapshot(snapshot);
        return result;
    }

    // Where the new line lands decides the correction: above the visible chat, keep what is
    // visible in place; below it, change nothing; inside it, keep the translated text in place.
    // A chat pinned to its newest message stays pinned.
    getTranslationScrollSnapshot(anchor, options = {}) {
        if (!anchor?.isConnected || !anchor.getBoundingClientRect) return null;
        // Never write scrollTop while the chat is moving: that cuts smooth scrolling and Discord's scroll animations short.
        if (this.getAutoTranslationScrollStillRemainingMs() > 0) return null;
        const scroller = this.getTranslationScrollContainer(anchor);
        if (!scroller) return null;
        const rect = anchor.getBoundingClientRect();
        const scrollTop = this.getScrollContainerTop(scroller);
        if (!Number.isFinite(scrollTop) || !rect) return null;
        const atBottom = this.isScrollContainerAtBottom(scroller, scrollTop);
        const band = this.getScrollContainerBand(scroller);
        const insertY = Number(this.settings.ui?.translationPosition === "after" ? rect.bottom : rect.top);
        const placement = !band ? "visible" : insertY <= band.top ? "above" : insertY >= band.bottom ? "below" : "visible";
        if (placement === "below"
            || (placement === "visible" && this.isAutoTranslationRenderPaused() && !options.allowScrollCorrectionWhilePaused)) {
            return atBottom ? { scroller, scrollTop, atBottom, anchor: null } : null;
        }
        if (placement === "above") {
            // Every line lands inside the message, so its bottom edge moves exactly as far as the visible chat would.
            const message = anchor.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || anchor;
            const messageRect = message === anchor ? rect : message.getBoundingClientRect?.();
            if (!messageRect) return null;
            return { anchor: message, edge: "bottom", top: Number(messageRect.bottom || 0), scroller, scrollTop, atBottom };
        }
        return { anchor, edge: "top", top: Number(rect.top || 0), scroller, scrollTop, atBottom };
    }

    restoreTranslationScrollSnapshot(snapshot) {
        if (!snapshot?.scroller) return;
        const currentTop = this.getScrollContainerTop(snapshot.scroller);
        if (!Number.isFinite(currentTop)) return;
        // Native scroll anchoring or clamping already moved the chat during the render.
        if (Math.abs(currentTop - Number(snapshot.scrollTop || 0)) > 1) {
            this.rememberOwnScrollAdjustment(snapshot.scroller, currentTop);
            return;
        }
        let nextTop = currentTop;
        if (snapshot.atBottom) {
            nextTop = Math.max(0, Number(snapshot.scroller.scrollHeight || 0) - Number(snapshot.scroller.clientHeight || 0));
        }
        else {
            if (!snapshot.anchor?.isConnected) return;
            const nextRect = snapshot.anchor.getBoundingClientRect?.();
            if (!nextRect) return;
            const delta = Number(nextRect[snapshot.edge || "top"] || 0) - Number(snapshot.top || 0);
            if (!Number.isFinite(delta)) return;
            nextTop = currentTop + delta;
        }
        if (Math.abs(nextTop - currentTop) < 0.5) return;
        this.setScrollContainerTop(snapshot.scroller, nextTop);
        const writtenTop = this.getScrollContainerTop(snapshot.scroller);
        if (Number.isFinite(writtenTop) && Math.abs(writtenTop - currentTop) >= 0.5) this.rememberOwnScrollAdjustment(snapshot.scroller, writtenTop);
    }

    // Whether Discord's chat scroller uses native scroll anchoring decides if the plugin's own
    // scroll corrections ever run; recorded in diagnostics.
    getChatScrollerOverflowAnchor() {
        try {
            if (typeof document === "undefined" || typeof getComputedStyle !== "function") return "";
            const message = document.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR);
            const scroller = message ? this.getTranslationScrollContainer(message) : null;
            if (!message) return "";
            return this.isDocumentScroller(scroller) ? "not-scrollable" : String(getComputedStyle(scroller).overflowAnchor || "");
        }
        catch {
            return "";
        }
    }

    isScrollContainerAtBottom(scroller, scrollTop = this.getScrollContainerTop(scroller)) {
        const scrollHeight = Number(scroller?.scrollHeight || 0);
        const clientHeight = Number(scroller?.clientHeight || 0);
        if (!Number.isFinite(scrollTop) || scrollHeight <= clientHeight + 1) return false;
        return scrollTop + clientHeight >= scrollHeight - 2;
    }

    // The visible part of a scroller: its box clipped to the window.
    getScrollContainerBand(scroller) {
        if (typeof window === "undefined" || !window) return null;
        const height = Number(window.innerHeight || 0);
        if (!(height > 0)) return null;
        if (this.isDocumentScroller(scroller)) return { top: 0, bottom: height };
        const rect = scroller.getBoundingClientRect?.();
        if (!rect || !(rect.height > 0)) return null;
        const top = Math.max(0, Number(rect.top || 0));
        const bottom = Math.min(height, Number(rect.bottom || 0));
        return bottom > top ? { top, bottom } : null;
    }

    // The plugin's own scrollTop writes fire scroll events; the next one from that scroller is not a user scroll.
    rememberOwnScrollAdjustment(scroller, top) {
        if (!scroller || !Number.isFinite(Number(top))) return;
        if (!this.autoTranslationOwnScrolls?.set) this.autoTranslationOwnScrolls = new WeakMap();
        this.autoTranslationOwnScrolls.set(scroller, { top: Number(top), at: Date.now() });
    }

    consumeOwnScrollEvent(event) {
        const target = typeof document !== "undefined" && event?.target === document ? document.scrollingElement : event?.target;
        const record = target ? this.autoTranslationOwnScrolls?.get?.(target) : null;
        if (!record) return false;
        this.autoTranslationOwnScrolls.delete(target);
        const top = this.getScrollContainerTop(target);
        if (Date.now() - record.at > AUTO_TRANSLATE_SCROLL_STILL_MS || !Number.isFinite(top) || Math.abs(top - record.top) > 1) return false;
        this.setPreviousViewportScrollPosition(event, top);
        this.autoTranslationLastScrollY = top;
        return true;
    }

    getTranslationScrollContainer(anchor) {
        if (typeof document === "undefined") return null;
        let node = anchor?.parentElement;
        while (node && node.nodeType === 1) {
            if (this.isVerticalScrollContainer(node)) return node;
            node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement || null;
    }

    isVerticalScrollContainer(node) {
        if (!node || node.nodeType !== 1) return false;
        if (!Number.isFinite(Number(node.scrollTop))) return false;
        const scrollHeight = Number(node.scrollHeight || 0);
        const clientHeight = Number(node.clientHeight || 0);
        if (scrollHeight <= clientHeight + 1) return false;
        if (typeof getComputedStyle !== "function") return true;
        const style = getComputedStyle(node);
        return /(auto|scroll|overlay)/.test(`${style.overflowY || ""} ${style.overflow || ""}`);
    }

    getScrollContainerTop(scroller) {
        if (!scroller) return NaN;
        if (scroller === window) return Number(window.scrollY || window.pageYOffset || 0);
        return Number(scroller.scrollTop);
    }

    setScrollContainerTop(scroller, value) {
        const top = Math.max(0, Number(value) || 0);
        if (scroller === window) {
            window.scrollTo?.(window.scrollX || window.pageXOffset || 0, top);
            return;
        }
        scroller.scrollTop = top;
    }

    retryAutoTranslationTarget(messageNode, content, text, textOptions = null, line = null) {
        if (!this.settings.translation.enabled) {
            this.showToast(this.t("translationDisabled"), "info");
            return;
        }
        if (!this.hasUsableApiConfig("translation")) {
            this.showToast(this.t("apiKeyMissingTranslation"), "error");
            return;
        }

        const requestOptions = this.withMessageIdentity(this.getAutoTranslationOptions(), messageNode, content, text);
        const cacheKey = this.getTranslationCacheKey(text, requestOptions);
        this.clearAutoTranslationFailure(cacheKey, requestOptions, { clearProvider: true });
        this.clearAutoTextTranslationFailure(text, requestOptions);
        line?.remove?.();

        const cachedTranslation = this.getTranslationCacheValue(cacheKey, this.getTranslationCacheAliases(text, requestOptions));
        if (cachedTranslation !== null) {
            if (this.isInvalidAutoTranslationCacheValue(text, cachedTranslation, requestOptions)) {
                this.deleteTranslationCacheCandidates(cacheKey, ...this.getTranslationCacheAliases(text, requestOptions));
            }
            else {
            this.renderTranslation(messageNode, content, cachedTranslation, cacheKey, text);
            return;
            }
        }
        const textCachedTranslation = this.getAutoTextTranslationCacheValue(text, requestOptions);
        if (textCachedTranslation !== null) {
            if (this.isInvalidAutoTranslationCacheValue(text, textCachedTranslation, requestOptions)) {
                this.deleteTranslationCacheCandidates(this.getAutoTextTranslationCacheKey(text, requestOptions), ...this.getAutoTextTranslationCacheAliases(text, requestOptions));
            }
            else {
                this.renderTranslation(messageNode, content, textCachedTranslation, cacheKey, text);
                return;
            }
        }

        const item = { messageNode, content, text, textOptions, targetKind: this.isReplyPreviewElement(content) ? "reply-preview" : "message", cacheKey, requestOptions };
        this.addAutoTranslationPendingTarget(cacheKey, item);
        this.enqueueAutoTranslationItem(item);
        this.drainAutoTranslationQueue();
    }

    ensureTranslationNode(messageNode, content) {
        let line = this.getTranslationLine(content);
        if (line && this.getTranslationContentForLine(line) !== content) {
            line = null;
        }

        if (!line) {
            line = document.createElement(this.isReplyPreviewElement(content) ? "span" : "div");
            line.className = "dait-translation-line";
            line.dataset.daitOwner = this.ensureTranslationOwnerId(content);
            line.addEventListener("click", event => {
                if (!line.classList.contains("dait-translation-masked")) return;
                event.preventDefault();
                event.stopPropagation();
                line.classList.remove("dait-translation-masked");
                line.classList.add("dait-translation-revealed");
                this.syncTranslationSourceVisibility(line, content);
            });
        }

        const anchor = this.getTranslationAnchor(messageNode, content);
        if (line.parentElement !== anchor) {
            line.remove();
        }
        this.getTranslationLines(content).forEach(existing => {
            if (existing !== line) existing.remove();
        });

        if (anchor === content) {
            if (this.settings.ui.translationPosition === "before") {
                if (line.parentElement !== anchor || line !== anchor.firstChild) anchor.insertBefore(line, anchor.firstChild || null);
            }
            else if (line.parentElement !== anchor || line !== anchor.lastChild) {
                anchor.appendChild(line);
            }
        }
        else if (this.settings.ui.translationPosition === "before") {
            if (line.nextSibling !== content) anchor.insertBefore(line, content || anchor.firstChild);
        }
        else {
            const reference = content?.nextSibling || null;
            if (line.previousSibling !== content) anchor.insertBefore(line, reference);
        }

        return line;
    }

    getTranslationAnchor(messageNode, content) {
        if (this.isReplyPreviewElement(content)) return content;
        return content?.parentElement || content || messageNode;
    }

    setTranslationLineMetadata(line, messageNode, content, cacheKey = "", sourceText = null) {
        const text = sourceText ?? this.getElementText(content);
        const effectiveCacheKey = cacheKey || this.getTranslationCacheKey(text, this.withMessageIdentity({ mode: "manual" }, messageNode, content, text));
        line.dataset.daitCacheKey = this.getTextFingerprint(effectiveCacheKey);
        line.dataset.daitCacheSig = this.getStrongTextFingerprint(effectiveCacheKey);
        line.dataset.daitSourceKey = this.getTextFingerprint(text);
        line.dataset.daitSourceSig = this.getStrongTextFingerprint(text);
        line.dataset.daitIdentityKey = this.getTranslationIdentityFingerprintFromCacheKey(effectiveCacheKey)
            || this.getTextFingerprint(this.getMessageIdentity(messageNode, content, text));
        line.dataset.daitIdentitySig = this.getTranslationIdentitySignatureFromCacheKey(effectiveCacheKey)
            || this.getStrongTextFingerprint(this.getMessageIdentity(messageNode, content, text));
        line.dataset.daitMode = this.getTranslationCacheMode(effectiveCacheKey);
        line.dataset.daitOwner = this.ensureTranslationOwnerId(content);
        line.classList?.toggle?.("dait-translation-preview", this.isReplyPreviewElement(content));
        this.removeDuplicateTranslationLinesForLine(line, messageNode, content);
    }

    removeDuplicateTranslationLinesForLine(line, messageNode, content) {
        if (!line || !content) return;
        const sourceSig = line.dataset?.daitSourceSig || "";
        const sourceKey = line.dataset?.daitSourceKey || "";
        const cacheSig = line.dataset?.daitCacheSig || "";
        const cacheKey = line.dataset?.daitCacheKey || "";
        const identitySig = line.dataset?.daitIdentitySig || "";
        const identityKey = line.dataset?.daitIdentityKey || "";
        if (!sourceSig && !sourceKey) return;
        const isPreview = Boolean(line.classList?.contains?.("dait-translation-preview"));
        const scopes = [
            messageNode?.querySelectorAll ? messageNode : null,
            content?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']"),
            content?.parentElement
        ].filter(Boolean);
        const seen = new Set();
        for (const scope of scopes) {
            for (const other of scope?.querySelectorAll?.(".dait-translation-line[data-dait-owner]") || []) {
                if (!other || other === line || seen.has(other)) continue;
                seen.add(other);
                if (other.dataset?.daitMode === "manual") continue;
                if (Boolean(other.classList?.contains?.("dait-translation-preview")) !== isPreview) continue;
                const sourceMatches = sourceSig
                    ? other.dataset?.daitSourceSig === sourceSig
                    : other.dataset?.daitSourceKey === sourceKey;
                if (!sourceMatches) continue;
                const cacheMatches = (cacheSig && other.dataset?.daitCacheSig === cacheSig)
                    || (cacheKey && other.dataset?.daitCacheKey === cacheKey);
                const identityMatches = (identitySig && other.dataset?.daitIdentitySig === identitySig)
                    || (identityKey && other.dataset?.daitIdentityKey === identityKey);
                if (!cacheMatches && !identityMatches) continue;
                this.restoreTranslationSourceVisibility(this.getTranslationContentForLine(other));
                other.remove?.();
            }
        }
    }

    isTranslationLineSourceMatch(line, text) {
        const value = String(text || "");
        if (line?.dataset?.daitSourceSig) return line.dataset.daitSourceSig === this.getStrongTextFingerprint(value);
        return line?.dataset?.daitSourceKey === this.getTextFingerprint(value);
    }

    removeTranslationNode(messageNode, content = null) {
        if (content) {
            this.getTranslationLines(content).forEach(line => {
                this.restoreTranslationSourceVisibility(content);
                line.remove();
            });
            const childLine = content.querySelector(":scope > .dait-translation-line");
            if (childLine) {
                this.restoreTranslationSourceVisibility(content);
                childLine.remove();
            }
            return;
        }

        const line = messageNode.querySelector(".dait-translation-line");
        if (line) {
            this.restoreTranslationSourceVisibility(this.getTranslationContentForLine(line));
            line.remove();
        }
    }

    hideAutoTranslationWarningLines() {
        if (typeof document === "undefined") return;
        document.querySelectorAll(".dait-translation-line.dait-translation-error").forEach(line => {
            const mode = String(line.dataset?.daitMode || "");
            if (!this.isAutoTranslationCacheMode(mode)) return;
            const type = String(line.dataset?.daitFailureType || "invalid-output");
            if (["auth", "rate-limit", "server", "client"].includes(type)) return;
            this.restoreTranslationSourceVisibility(this.getTranslationContentForLine(line));
            line.remove();
        });
    }

    handleKeydown(event) {
        if (!this.isStarted) return;
        if (event.target?.closest?.(".dait-settings")) return;
        if (!this.settings.ui.enablePolishHotkey) return;
        // Polish switched off: the shortcut is not ours, so the key goes to Discord untouched.
        if (!this.settings.polish?.enabled) return;
        if (!this.isAllowedPolishHotkey(this.settings.ui.polishHotkey || DEFAULT_SETTINGS.ui.polishHotkey)) return;
        if (!this.isHotkeyEvent(event, this.settings.ui.polishHotkey)) return;

        const textbox = this.getActiveTextbox();
        if (!textbox) return;

        event.preventDefault();
        event.stopPropagation();
        const button = this.getComposerPolishButton(textbox);
        this.polishCurrentDraft(button, { textbox, composerKey: this.getTextboxComposerKey(textbox), fromHotkey: true });
    }

    // Minimal density hides the direct buttons behind the "AI" menu button.
    isInputActionButtonShown(button) {
        if (!button || button.isConnected === false) return false;
        const group = button.parentElement?.dataset?.daitDensity ? button.parentElement : button.closest?.(".dait-input-action-group");
        return !this.isInputActionDirectButton(button) || group?.dataset?.daitDensity !== "minimal";
    }

    getComposerPolishButton(textbox) {
        const root = textbox?.closest?.("form, [class*='channelTextArea']");
        const button = root?.querySelector?.(".dait-input-action-group .dait-polish-button") || null;
        if (!button || button.isConnected === false) return null;
        return !button.__daitTextbox || button.__daitTextbox === textbox ? button : null;
    }

    recordHotkey(button) {
        if (!button || button.dataset.recording === "true") return;
        this.clearHotkeyRecording();

        const original = this.getHotkeyLabel();
        button.dataset.recording = "true";
        button.textContent = this.t("hotkeyRecording");
        let listening = false;

        const cleanup = shortcut => {
            if (this.hotkeyRecordTimer) clearTimeout(this.hotkeyRecordTimer);
            this.hotkeyRecordTimer = null;
            if (this.hotkeyRecordTimeout) clearTimeout(this.hotkeyRecordTimeout);
            this.hotkeyRecordTimeout = null;
            if (this.hotkeyRecordCleanup === cleanup) {
                this.hotkeyRecordCleanup = null;
                this.hotkeyRecordButton = null;
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
            if (!this.isStarted || button.isConnected === false) {
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
                this.showToast(this.t("hotkeyInvalid"), "error");
                return;
            }

            this.setSetting("ui.polishHotkey", shortcut);
            cleanup(shortcut);
            this.showToast(this.t("hotkeySaved", { shortcut }), "success");
        };

        // A click anywhere else (Done, X, the backdrop, another control) ends recording.
        const onPointerDown = event => {
            if (event?.target === button || button.contains?.(event?.target)) return;
            cleanup();
        };

        this.hotkeyRecordCleanup = cleanup;
        this.hotkeyRecordButton = button;
        this.hotkeyRecordTimer = setTimeout(() => {
            this.hotkeyRecordTimer = null;
            if (!this.isStarted || this.hotkeyRecordCleanup !== cleanup) return;
            document.addEventListener("keydown", onKeydown, true);
            document.addEventListener("pointerdown", onPointerDown, true);
            listening = true;
        }, 0);
        // An abandoned recording must not keep swallowing keys.
        const recordTimeoutMs = 10000;
        this.hotkeyRecordTimeout = setTimeout(() => {
            this.hotkeyRecordTimeout = null;
            if (this.hotkeyRecordCleanup === cleanup) cleanup();
        }, recordTimeoutMs);
    }

    clearHotkeyRecording() {
        if (this.hotkeyRecordTimer) clearTimeout(this.hotkeyRecordTimer);
        this.hotkeyRecordTimer = null;
        if (this.hotkeyRecordTimeout) clearTimeout(this.hotkeyRecordTimeout);
        this.hotkeyRecordTimeout = null;
        const cleanup = this.hotkeyRecordCleanup;
        this.hotkeyRecordCleanup = null;
        this.hotkeyRecordButton = null;
        if (typeof cleanup === "function") {
            try { cleanup(); }
            catch {}
        }
    }

    // Ends a recording whose button lives inside `root` (a settings panel or modal being closed).
    clearHotkeyRecordingWithin(root) {
        const button = this.hotkeyRecordButton;
        if (!this.hotkeyRecordCleanup) return;
        if (!root || !button || button.isConnected === false || root === button || root.contains?.(button)) this.clearHotkeyRecording();
    }

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
    }

    isModifierOnlyKey(key) {
        return ["Control", "Alt", "Shift", "Meta"].includes(String(key || ""));
    }

    isHotkeyEvent(event, shortcut) {
        const configured = String(shortcut || DEFAULT_SETTINGS.ui.polishHotkey || "").trim();
        if (!configured) return false;
        return this.shortcutFromEvent(event) === configured;
    }

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
    }

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
    }

    getHotkeyLabel(shortcut = this.settings.ui?.polishHotkey) {
        return String(shortcut || "").trim() || this.t("hotkeyNotSet");
    }

    getTextbox() {
        return document.querySelector("[role='textbox'][data-slate-editor='true'], [role='textbox'][contenteditable='true']");
    }

    getActiveTextbox() {
        const active = document.activeElement;
        if (!active) return null;

        const textbox = active.closest?.("[role='textbox'][data-slate-editor='true'], [role='textbox'][contenteditable='true']");
        if (textbox) return textbox;

        const fallback = this.getTextbox();
        if (fallback?.contains(active)) return fallback;
        return null;
    }

    getElementText(element, options = {}) {
        if (!element) return "";

        const includeReplyPreview = Boolean(options?.includeReplyPreview);
        const cacheKey = includeReplyPreview ? "withReply" : "message";
        const cachedText = this.getElementTextCacheValue(element, cacheKey);
        if (cachedText !== null) return cachedText;
        const excludedSelectors = [
            ".dait-message-button",
            ".dait-polish-button",
            ".dait-public-bilingual-button",
            ".dait-polish-restore-button",
            ".dait-input-action-menu-button",
            ".dait-input-action-menu",
            ".dait-quick-settings-button",
            ".dait-quick-settings-modal-root",
            ".dait-polish-result-panel",
            ".dait-polish-restore-control",
            ".dait-translation-line",
            ".dait-translation-box",
            "[data-slate-placeholder='true']",
            "[aria-hidden='true']",
            "[hidden]"
        ];
        excludedSelectors.push(...this.getForeignTranslationExcludedSelectors());
        if (!includeReplyPreview) {
            excludedSelectors.push("[class*='repliedMessage']", "[class*='repliedTextPreview']", "[class*='quotedChatMessage']");
        }
        if (this.isExcludedExtractedTextRoot(element, excludedSelectors)) {
            this.setElementTextCacheValue(element, cacheKey, "");
            return "";
        }

        const directText = this.extractElementTextWithoutClone(element, excludedSelectors);
        if (directText !== null) {
            const normalized = this.normalizeExtractedText(directText);
            this.setElementTextCacheValue(element, cacheKey, normalized);
            return normalized;
        }

        const clone = element.cloneNode?.(true);
        if (!clone) return this.normalizeExtractedText(element.textContent || "");
        clone.querySelectorAll?.(excludedSelectors.join(",")).forEach(node => node.remove());

        if (typeof document !== "undefined") {
            clone.querySelectorAll?.("img[alt]").forEach(image => {
                const alt = String(image.getAttribute?.("alt") || "").trim();
                if (!/^:.+:$/.test(alt)) return;
                image.replaceWith(document.createTextNode(` ${alt} `));
            });
        }

        if (typeof document === "undefined" || typeof NodeFilter === "undefined" || typeof clone.innerText === "string") {
            const normalized = this.normalizeExtractedText(clone.innerText || clone.textContent || "");
            this.setElementTextCacheValue(element, cacheKey, normalized);
            return normalized;
        }

        const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                const text = String(node.nodeValue || "").replace(/\u200b/g, "");
                if (!text.trim()) return NodeFilter.FILTER_REJECT;
                const blockedSelectors = excludedSelectors.join(",");
                if (node.parentElement?.closest?.(blockedSelectors)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (this.isInsideForeignTranslationElement(node.parentElement)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const parts = [];
        let node = walker.nextNode();
        while (node) {
            parts.push(String(node.nodeValue || ""));
            node = walker.nextNode();
        }

        const normalized = this.normalizeExtractedText(parts.join(" "));
        this.setElementTextCacheValue(element, cacheKey, normalized);
        return normalized;
    }

    getElementTextCacheValue(element, cacheKey) {
        if (!this.isElementTextCacheEligible(element)) return null;
        const record = this.elementTextCache?.get?.(element);
        if (!record || !Object.prototype.hasOwnProperty.call(record, cacheKey)) return null;
        return String(record[cacheKey] || "");
    }

    setElementTextCacheValue(element, cacheKey, value) {
        if (!this.isElementTextCacheEligible(element)) return;
        const record = this.elementTextCache.get(element) || {};
        record[cacheKey] = String(value || "");
        this.elementTextCache.set(element, record);
    }

    isElementTextCacheEligible(element) {
        if (!this.elementTextCache?.get || !element || element.nodeType !== 1 || element.isConnected === false) return false;
        return Boolean(this.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR));
    }

    extractElementTextWithoutClone(element, excludedSelectors = []) {
        if (!element?.childNodes || typeof element.childNodes[Symbol.iterator] !== "function") return null;
        const blockedSelector = excludedSelectors.filter(Boolean).join(",");
        const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"]);
        const parts = [];
        const stack = [{ node: element, root: true }];

        while (stack.length) {
            const item = stack.pop();
            if (item.separator) {
                parts.push(item.separator);
                continue;
            }
            const node = item.node;
            if (!node) continue;
            if (node.nodeType === 3) {
                parts.push(String(node.nodeValue || ""));
                continue;
            }
            if (node.nodeType !== 1) continue;

            if (!item.root) {
                let excluded = false;
                try { excluded = Boolean(blockedSelector && node.matches?.(blockedSelector)); }
                catch {}
                if (excluded || this.isForeignTranslationElement(node)) continue;
            }

            const tagName = String(node.tagName || node.nodeName || "").toUpperCase();
            if (tagName === "IMG") {
                const alt = String(node.getAttribute?.("alt") || "").trim();
                if (/^:.+:$/.test(alt)) parts.push(` ${alt} `);
                continue;
            }
            if (tagName === "BR") {
                parts.push("\n");
                continue;
            }

            const isBlock = !item.root && blockTags.has(tagName);
            if (isBlock) parts.push("\n");
            const children = [...node.childNodes];
            if (isBlock) stack.push({ separator: "\n" });
            for (let index = children.length - 1; index >= 0; index--) {
                stack.push({ node: children[index], root: false });
            }
        }
        return parts.join("");
    }

    getElementRawText(element, options = {}) {
        if (!element) return "";

        const includeReplyPreview = Boolean(options?.includeReplyPreview);
        const excludedSelectors = [
            ".dait-message-button",
            ".dait-polish-button",
            ".dait-public-bilingual-button",
            ".dait-polish-restore-button",
            ".dait-input-action-menu-button",
            ".dait-input-action-menu",
            ".dait-quick-settings-button",
            ".dait-quick-settings-modal-root",
            ".dait-polish-result-panel",
            ".dait-polish-restore-control",
            ".dait-translation-line",
            ".dait-translation-box",
            "[data-slate-placeholder='true']",
            "[aria-hidden='true']",
            "[hidden]"
        ];
        excludedSelectors.push(...this.getForeignTranslationExcludedSelectors());
        if (!includeReplyPreview) {
            excludedSelectors.push("[class*='repliedMessage']", "[class*='repliedTextPreview']", "[class*='quotedChatMessage']");
        }
        if (this.isExcludedExtractedTextRoot(element, excludedSelectors)) return "";

        // Read the live editor. A detached clone is not rendered, so its innerText falls back to
        // textContent: Slate's per-line blocks lose their line breaks and U+FEFF placeholders stay.
        if (!element.childNodes || typeof element.childNodes[Symbol.iterator] !== "function") {
            return this.normalizeDraftRawText(element.value ?? element.textContent ?? "");
        }
        return this.normalizeDraftRawText(this.readComposerDomText(element, excludedSelectors.filter(Boolean).join(",")));
    }

    // One reader for the draft snapshot, the stale check and write verification. Slate renders each
    // line as a block element; blocks are joined with "\n". Void inlines (mentions, emoji) become the
    // Discord token they stand for when their Slate node is reachable, otherwise their visible text.
    readComposerDomText(root, blockedSelector = "") {
        const lines = [];
        if (this.collectSlateComposerLines(root, blockedSelector, lines, false)) return lines.join("\n");
        return this.readComposerInlineText(root, blockedSelector, { blockBreaks: true });
    }

    collectSlateComposerLines(container, blockedSelector, lines, quoted) {
        let found = false;
        for (const child of container?.childNodes || []) {
            if (child?.nodeType !== 1 || this.isComposerReadExcluded(child, blockedSelector)) continue;
            const slateNode = child.getAttribute?.("data-slate-node");
            if (slateNode === "element" && child.getAttribute?.("data-slate-inline") !== "true") {
                found = true;
                const childQuoted = quoted || this.getSlateElementFromDom(child)?.type === "blockQuote";
                if (!this.collectSlateComposerLines(child, blockedSelector, lines, childQuoted)) {
                    const text = this.readComposerInlineText(child, blockedSelector);
                    lines.push(childQuoted && !text.startsWith(">") ? `> ${text}` : text);
                }
                continue;
            }
            if (slateNode || child.getAttribute?.("data-slate-inline") === "true" || child.getAttribute?.("data-slate-leaf") === "true") continue;
            if (this.collectSlateComposerLines(child, blockedSelector, lines, quoted)) found = true;
        }
        return found;
    }

    readComposerInlineText(root, blockedSelector = "", options = {}) {
        const BREAK = null;
        const parts = [];
        let lastFromSlateString = false;
        const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"]);
        const push = (text, fromSlateString = false) => {
            parts.push(text);
            lastFromSlateString = fromSlateString;
        };
        const visit = (node, isRoot, inSlateString) => {
            if (!node) return;
            if (node.nodeType === 3) {
                push(String(node.nodeValue || "").replace(/\uFEFF/g, ""), inSlateString);
                return;
            }
            if (node.nodeType !== 1) return;
            if (!isRoot && this.isComposerReadExcluded(node, blockedSelector)) return;
            const zeroWidth = node.getAttribute?.("data-slate-zero-width");
            if ((zeroWidth !== null && zeroWidth !== undefined) || node.getAttribute?.("data-slate-spacer") === "true") return;
            if (!isRoot && node.getAttribute?.("data-slate-void") === "true") {
                push(this.serializeSlateVoidElement(node, blockedSelector));
                return;
            }
            const tagName = String(node.tagName || node.nodeName || "").toUpperCase();
            if (tagName === "BR") {
                push("\n");
                return;
            }
            if (tagName === "IMG") {
                push(this.getComposerImageText(node, false));
                return;
            }
            const isBlock = Boolean(options.blockBreaks) && !isRoot && blockTags.has(tagName);
            if (isBlock) push(BREAK);
            const childInSlateString = inSlateString || node.getAttribute?.("data-slate-string") === "true";
            for (const child of node.childNodes || []) visit(child, false, childInSlateString);
            if (isBlock) push(BREAK);
        };
        visit(root, true, false);

        // slate-react renders one extra "\n" after a block's last string when that string ends with "\n".
        if (!options.blockBreaks && lastFromSlateString && String(parts[parts.length - 1] || "").endsWith("\n")) {
            parts[parts.length - 1] = parts[parts.length - 1].slice(0, -1);
        }

        let output = "";
        let pendingBreak = false;
        for (const part of parts) {
            if (part === BREAK) {
                pendingBreak = output.length > 0;
                continue;
            }
            if (!part) continue;
            if (pendingBreak && !output.endsWith("\n")) output += "\n";
            pendingBreak = false;
            output += part;
        }
        return output;
    }

    isComposerReadExcluded(node, blockedSelector = "") {
        let excluded = false;
        try { excluded = Boolean(blockedSelector && node.matches?.(blockedSelector)); }
        catch {}
        return excluded || this.isForeignTranslationElement(node);
    }

    serializeSlateVoidElement(node, blockedSelector = "") {
        const token = this.serializeSlateElementToken(this.getSlateElementFromDom(node));
        if (token !== null) return token;
        const image = this.findComposerVoidImage(node);
        const imageText = image ? this.getComposerImageText(image, true) : "";
        if (imageText) return imageText;
        const label = [...(node.childNodes || [])].map(child => this.readComposerInlineText(child, blockedSelector)).join("");
        if (label) return label;
        return String(node.textContent || "").replace(/[\uFEFF\u200b]/g, "");
    }

    findComposerVoidImage(node) {
        for (const child of node?.childNodes || []) {
            if (child?.nodeType !== 1 || child.getAttribute?.("data-slate-spacer") === "true") continue;
            if (String(child.tagName || "").toUpperCase() === "IMG") return child;
            const nested = this.findComposerVoidImage(child);
            if (nested) return nested;
        }
        return null;
    }

    getComposerImageText(image, insideVoid = false) {
        const alt = String(image?.getAttribute?.("alt") || "").trim();
        if (/^:[^:\s]+:$/.test(alt)) {
            const src = String(image.getAttribute?.("src") || "");
            const emojiId = [image.getAttribute?.("data-id"), src.match(/\/emojis\/(\d{5,25})\./)?.[1]]
                .map(value => String(value || "").trim())
                .find(value => /^\d{5,25}$/.test(value));
            if (!emojiId) return alt;
            const animated = image.getAttribute?.("data-animated") === "true" || /\.gif(?:[?#]|$)|[?&]animated=true/i.test(src);
            return `<${animated ? "a" : ""}${alt}${emojiId}>`;
        }
        return insideVoid ? alt : "";
    }

    getSlateElementFromDom(node) {
        if (!node || typeof node !== "object") return null;
        try {
            const key = Object.keys(node).find(name => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"));
            let fiber = key ? node[key] : null;
            for (let depth = 0; fiber && depth < 6; depth++) {
                const element = fiber.memoizedProps?.element;
                if (element && typeof element === "object" && typeof element.type === "string" && Array.isArray(element.children)) return element;
                fiber = fiber.return;
            }
        }
        catch {}
        return null;
    }

    // Discord's message tokens for Slate void inlines; null when the node is not one we know.
    serializeSlateElementToken(element) {
        if (!element || typeof element !== "object") return null;
        const id = value => {
            const text = String(value ?? "").trim();
            return /^\d{5,25}$/.test(text) ? text : "";
        };
        const type = String(element.type || "");
        const userId = id(element.userId);
        if (userId) return `<@${userId}>`;
        const roleId = id(element.roleId);
        if (roleId) return `<@&${roleId}>`;
        const channelId = id(element.channelId);
        if (channelId && /channel/i.test(type)) return `<#${channelId}>`;
        const emoji = element.emoji;
        if (emoji && typeof emoji === "object") {
            const name = String(emoji.name || "").replace(/^:+|:+$/g, "").trim();
            const emojiId = id(emoji.id ?? emoji.emojiId);
            if (emojiId && name) return `<${emoji.animated ? "a" : ""}:${name}:${emojiId}>`;
            const surrogate = [emoji.surrogate, emoji.surrogates, emoji.optionallyDiverseSequence]
                .find(value => typeof value === "string" && value);
            if (surrogate) return surrogate;
            if (name) return `:${name}:`;
        }
        if (type === "textMention" && typeof element.name === "string" && element.name.trim()) {
            const name = element.name.trim();
            return name.startsWith("@") ? name : `@${name}`;
        }
        return null;
    }

    isExcludedExtractedTextRoot(element, excludedSelectors = []) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isForeignTranslationElement(element)) return true;
        const selector = excludedSelectors.filter(Boolean).join(",");
        if (!selector) return false;
        try {
            return Boolean(element.matches?.(selector));
        }
        catch {
            return false;
        }
    }

    normalizeExtractedText(text) {
        return String(text || "")
            .replace(/\u200b/g, "")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map(line => line.replace(/[ \t\f\v]+/g, " ").trim())
            .filter(Boolean)
            .join("\n")
            .trim();
    }

    getDiscordMessageStoreMessages(channelId) {
        const store = this.getDiscordMessageStore();
        if (!store || !channelId) return [];
        try {
            const messages = store.getMessages?.(channelId) || store.getMessagesForChannel?.(channelId);
            return this.extractDiscordMessageStoreCollection(messages);
        }
        catch (error) {
            this.warnSanitized("Failed to read Discord MessageStore", error);
            return [];
        }
    }

    getDiscordMessageStore() {
        if (this.discordMessageStore) return this.discordMessageStore;
        const now = Date.now();
        if (now < Number(this.discordMessageStoreMissingUntil || 0)) return null;

        try {
            const webpack = globalThis.BdApi?.Webpack;
            const store = webpack?.getStore?.("MessageStore")
                || webpack?.getByKeys?.("getMessage", "getMessages")
                || globalThis.BdApi?.findModuleByProps?.("getMessage", "getMessages")
                || null;
            if (store?.getMessages || store?.getMessagesForChannel) {
                this.discordMessageStore = store;
                return store;
            }
        }
        catch (error) {
            this.warnSanitized("Failed to locate Discord MessageStore", error);
        }

        this.discordMessageStoreMissingUntil = now + 5000;
        return null;
    }

    extractDiscordMessageStoreCollection(collection) {
        if (!collection) return [];
        if (Array.isArray(collection)) return collection.filter(Boolean);
        if (Array.isArray(collection._array)) return collection._array.filter(Boolean);
        if (Array.isArray(collection.messages)) return collection.messages.filter(Boolean);
        if (typeof collection.toArray === "function") return collection.toArray().filter(Boolean);
        if (typeof collection.valueSeq === "function") return this.extractDiscordMessageStoreCollection(collection.valueSeq());
        if (typeof collection.values === "function") return [...collection.values()].filter(Boolean);
        if (typeof collection.forEach === "function") {
            const values = [];
            collection.forEach(value => {
                if (value) values.push(value);
            });
            return values;
        }
        if (collection._map && typeof collection._map === "object") return Object.values(collection._map).filter(Boolean);
        if (typeof collection === "object") {
            return Object.values(collection).filter(value => value && typeof value === "object" && (value.id || value.messageId));
        }
        return [];
    }

    getDiscordStoreMessageText(message) {
        if (typeof message?.content === "string") return this.normalizeExtractedText(message.content);
        if (typeof message?.message === "string") return this.normalizeExtractedText(message.message);
        if (typeof message?.text === "string") return this.normalizeExtractedText(message.text);
        return "";
    }

    getCachedElementText(element, context = null, options = {}) {
        if (options?.includeReplyPreview) {
            if (!context?.replyTextByElement) return this.getElementText(element, options);
            if (!context.replyTextByElement.has(element)) {
                context.replyTextByElement.set(element, this.getElementText(element, options));
            }
            return context.replyTextByElement.get(element);
        }

        if (!context?.textByElement) return this.getElementText(element);
        if (!context.textByElement.has(element)) {
            context.textByElement.set(element, this.getElementText(element));
        }
        return context.textByElement.get(element);
    }

    getTextFingerprint(text) {
        const value = String(text || "");
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    getStrongTextFingerprint(text) {
        const value = String(text || "");
        let first = 2166136261;
        let second = (2166136261 ^ value.length) >>> 0;
        for (let index = 0; index < value.length; index++) {
            const code = value.charCodeAt(index);
            first ^= code;
            first = Math.imul(first, 16777619);
            second ^= (code + (first >>> 0) + index) >>> 0;
            second = Math.imul(second, 16777619);
        }
        return `${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
    }

    replaceTextboxText(textbox, text, options = {}) {
        return this.replaceTextboxTextSafely(textbox, text, options).ok;
    }

    async replaceTextboxTextSafelyAsync(textbox, text, options = {}) {
        const value = String(text || "");
        if (!textbox || textbox.isConnected === false) return { ok: false, reason: "missing-textbox", actual: "" };
        if (!this.isTextboxReplacementWriteAllowed(textbox, options, { checkExpected: true })) {
            return { ok: false, reason: this.getTextboxReplacementBlockedReason(options), actual: this.getTextboxTextSafe(textbox) };
        }
        const previousRawText = this.getTextboxRawTextSafe(textbox);
        // Shared by the write attempt and the rollback so the draft is undone at most once.
        const writeOptions = { ...options, rollback: { undoAttempted: false } };
        const failAfterAttempt = async () => {
            // Never roll back over the user's new input, a newer write, or a remounted composer.
            if (!this.isTextboxReplacementWriteAllowed(textbox, writeOptions)) {
                return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
            }
            await this.restoreTextboxSnapshotAfterFailedReplace(textbox, previousRawText, value, writeOptions);
            return { ok: false, reason: "verification-failed", actual: this.getTextboxTextSafe(textbox) };
        };

        if (this.isPlainTextTextbox(textbox)) {
            const result = this.replaceTextboxTextSafely(textbox, value, options);
            if (result.ok || result.reason === "missing-textbox") return result;

            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
            if (await this.waitForTextboxTextEqual(textbox, value)) {
                if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "settled", actual: value };
            }

            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
            this.replaceTextboxTextRetry(textbox, value);
            if (await this.waitForTextboxTextEqual(textbox, value)) {
                if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return { ok: false, reason: "write-cancelled", actual: this.getTextboxTextSafe(textbox) };
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "async-retry", actual: value };
            }

            return failAfterAttempt();
        }

        if (this.isRichDiscordTextbox(textbox)) {
            if (await this.replaceDiscordRichTextboxTextAtomically(textbox, value, writeOptions)) {
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "slate-atomic", actual: value };
            }
            return failAfterAttempt();
        }

        if (await this.replaceRichTextboxTextAsync(textbox, value, writeOptions)) {
            this.finishTextboxReplacement(textbox, options);
            return { ok: true, method: "async-rich", actual: value };
        }

        return failAfterAttempt();
    }

    replaceTextboxTextSafely(textbox, text, options = {}) {
        const value = String(text || "");
        if (!textbox || textbox.isConnected === false) return { ok: false, reason: "missing-textbox", actual: "" };
        if (!this.isTextboxReplacementWriteAllowed(textbox, options, { checkExpected: true })) {
            return { ok: false, reason: this.getTextboxReplacementBlockedReason(options), actual: this.getTextboxTextSafe(textbox) };
        }

        this.replaceTextboxTextAttempt(textbox, value);
        if (this.isTextboxTextEqual(textbox, value)) {
            this.finishTextboxReplacement(textbox, options);
            return { ok: true, method: "primary", actual: value };
        }

        const firstActual = this.getTextboxTextSafe(textbox);
        if (this.isWrongTextboxReplacement(firstActual, value)) {
            this.replaceTextboxTextRetry(textbox, value);
            if (this.isTextboxTextEqual(textbox, value)) {
                this.finishTextboxReplacement(textbox, options);
                return { ok: true, method: "retry", actual: value };
            }
        }

        return { ok: false, reason: "verification-failed", actual: this.getTextboxTextSafe(textbox) };
    }

    replaceTextboxTextAttempt(textbox, value) {
        textbox.focus?.();

        if (this.isPlainTextTextbox(textbox)) {
            return this.replacePlainTextTextboxValue(textbox, value);
        }
        if (this.isRichDiscordTextbox(textbox)) return false;
        return this.replaceRichTextboxText(textbox, value);
    }

    replaceTextboxTextRetry(textbox, value) {
        if (this.isPlainTextTextbox(textbox)) {
            return this.replacePlainTextTextboxValue(textbox, value);
        }

        if (this.isRichDiscordTextbox(textbox)) return false;
        if (this.replaceRichTextboxText(textbox, value)) return true;
        if (!this.canUseTextboxDomFallback(textbox)) return false;
        return this.replaceTextboxTextDomFallback(textbox, value);
    }

    isTextboxReplacementWriteAllowed(textbox, options = {}, checks = {}) {
        if (!textbox || textbox.isConnected === false) return false;
        if (options.writeToken && !this.composerWriter.isWriteTokenCurrent(options.writeToken)) return false;
        if (checks.checkExpected && Object.prototype.hasOwnProperty.call(options, "expectedPreviousText")) {
            return this.areDraftTextsEqualStrict(
                this.getTextboxRawTextSafe(textbox),
                this.normalizeDraftRawText(options.expectedPreviousText)
            );
        }
        return true;
    }

    getTextboxReplacementBlockedReason(options = {}) {
        if (options.writeToken && !this.composerWriter.isWriteTokenCurrent(options.writeToken)) return "write-cancelled";
        return "stale-input";
    }

    getTextboxTextSafe(textbox) {
        if (this.isPlainTextTextbox(textbox)) {
            return this.normalizeExtractedText(textbox?.value ?? "");
        }
        try {
            return this.normalizeExtractedText(this.getElementText(textbox));
        }
        catch {
            return this.normalizeExtractedText(textbox?.value ?? textbox?.textContent ?? "");
        }
    }

    getTextboxRawTextSafe(textbox) {
        if (this.isPlainTextTextbox(textbox)) {
            return this.normalizeDraftRawText(textbox?.value ?? "");
        }
        try {
            return this.getElementRawText(textbox);
        }
        catch {
            return this.normalizeDraftRawText(textbox?.value ?? textbox?.textContent ?? "");
        }
    }

    isWrongTextboxReplacement(actual, expected) {
        const left = this.normalizeExtractedText(actual);
        const right = this.normalizeExtractedText(expected);
        if (left === right) return false;
        if (!left || !right) return true;
        return true;
    }

    isPlainTextTextbox(element) {
        const tag = String(element?.tagName || "").toUpperCase();
        return tag === "TEXTAREA" || tag === "INPUT";
    }

    replacePlainTextTextboxValue(textbox, text) {
        const proto = Object.getPrototypeOf(textbox);
        const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, "value") : null;
        if (descriptor?.set) descriptor.set.call(textbox, text);
        else textbox.value = text;
        this.dispatchInput(textbox, text, { inputType: "insertReplacementText" });
        return true;
    }

    replaceRichTextboxText(textbox, text) {
        if (this.isRichDiscordTextbox(textbox)) return false;
        if (!this.clearRichTextboxText(textbox)) return false;
        return this.insertRichTextboxText(textbox, text) && this.isTextboxTextEqual(textbox, text);
    }

    replaceRichTextboxSelection(textbox, text, inputType = "insertReplacementText") {
        textbox.focus?.();
        this.selectTextboxContents(textbox);
        if (this.dispatchTextboxPaste(textbox, text) && this.isTextboxTextEqual(textbox, text)) return true;

        this.selectTextboxContents(textbox);
        if (this.dispatchTextboxBeforeInput(textbox, text, inputType) && this.isTextboxTextEqual(textbox, text)) return true;

        this.selectTextboxContents(textbox);
        try {
            return Boolean(document.execCommand?.("insertText", false, text));
        }
        catch {
            return false;
        }
    }

    async replaceRichTextboxTextAsync(textbox, text, options = {}) {
        if (this.isRichDiscordTextbox(textbox)) return this.replaceDiscordRichTextboxTextAtomically(textbox, text, options);
        if (!await this.clearRichTextboxTextAsync(textbox, options)) return false;
        return this.insertRichTextboxTextAsync(textbox, text, options);
    }

    async replaceDiscordRichTextboxTextAtomically(textbox, text, options = {}) {
        const value = String(text || "");
        const previousText = Object.prototype.hasOwnProperty.call(options, "expectedPreviousText")
            ? this.normalizeDraftRawText(options.expectedPreviousText)
            : this.getTextboxRawTextSafe(textbox);
        if (!this.isTextboxReplacementWriteAllowed(textbox, options, { checkExpected: true })) return false;
        if (previousText === this.normalizeDraftRawText(value)) {
            return await this.waitForTextboxStableTextEqual(textbox, value)
                && this.isTextboxReplacementWriteAllowed(textbox, options);
        }

        const attempts = [
            () => this.dispatchTextboxPaste(textbox, value),
            () => this.dispatchTextboxBeforeInput(textbox, value, "insertReplacementText"),
            () => this.dispatchTextboxBeforeInput(textbox, value, "insertFromPaste")
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            if (!await this.prepareTextboxFullReplacementSelection(textbox, previousText)) return false;
            attempt();
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            if (await this.waitForTextboxStableTextEqual(textbox, value)) {
                return this.isTextboxReplacementWriteAllowed(textbox, options);
            }

            // Raw against raw: a normalized read never equals a draft with double or trailing spaces.
            const actual = this.getTextboxRawTextSafe(textbox);
            if (actual && actual !== previousText && actual !== this.normalizeDraftRawText(value)) {
                if (this.isTextboxReplacementWriteAllowed(textbox, options)) await this.tryUndoTextboxEdit(textbox, previousText, options);
                return false;
            }
        }

        return false;
    }

    async clearRichTextboxTextAsync(textbox, options = {}) {
        if (this.isTextboxEmpty(textbox)) return true;

        const attempts = [
            () => {
                this.selectTextboxContents(textbox);
                return this.dispatchTextboxBeforeInput(textbox, "", "deleteByCut");
            },
            () => {
                this.selectTextboxContents(textbox);
                return this.dispatchTextboxBeforeInput(textbox, "", "deleteContentBackward");
            },
            () => {
                this.selectTextboxContents(textbox);
                try {
                    return Boolean(document.execCommand?.("delete", false, null));
                }
                catch {
                    return false;
                }
            },
            () => {
                this.clearRichTextboxTextWithKeyboard(textbox);
                return true;
            },
            () => {
                this.selectTextboxContents(textbox);
                try {
                    return Boolean(document.execCommand?.("insertText", false, ""));
                }
                catch {
                    return false;
                }
            }
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            attempt();
            if (await this.waitForTextboxStableEmpty(textbox)) return true;
        }

        return false;
    }

    async insertRichTextboxTextAsync(textbox, text, options = {}) {
        const attempts = [
            () => this.dispatchTextboxPaste(textbox, text),
            () => this.dispatchTextboxBeforeInput(textbox, text, "insertFromPaste"),
            () => this.dispatchTextboxBeforeInput(textbox, text, "insertText"),
            () => {
                try {
                    return Boolean(document.execCommand?.("insertText", false, text));
                }
                catch {
                    return false;
                }
            }
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxEmpty(textbox) && !await this.clearRichTextboxTextAsync(textbox, options)) return false;
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            attempt();
            if (await this.waitForTextboxStableTextEqual(textbox, text)) return true;
            if (!this.isTextboxEmpty(textbox) && !this.isTextboxTextEqual(textbox, text)) {
                if (!await this.clearRichTextboxTextAsync(textbox, options)) return false;
            }
        }

        return false;
    }

    async tryRestoreTextboxTextAfterFailedReplace(textbox, text, options = {}) {
        if (!text) return;
        if (!await this.clearRichTextboxTextAsync(textbox, options)) return;
        if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return;
        await this.insertRichTextboxTextAsync(textbox, text, options);
    }

    // Stops as soon as options.writeToken is no longer current (user input, a newer write, remount).
    async restoreTextboxSnapshotAfterFailedReplace(textbox, previousText, attemptedText = "", options = {}) {
        if (!textbox || textbox.isConnected === false) return false;
        const previous = this.normalizeDraftRawText(previousText);
        if (!previous) return false;
        if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
        const current = this.getTextboxRawTextSafe(textbox);
        if (current === previous || current === this.normalizeDraftRawText(attemptedText)) return false;

        if (this.isPlainTextTextbox(textbox)) {
            this.replacePlainTextTextboxValue(textbox, previous);
            return this.isTextboxTextEqual(textbox, previous);
        }

        if (this.isRichDiscordTextbox(textbox)) {
            if (!options.rollback?.undoAttempted && await this.tryUndoTextboxEdit(textbox, previous, options)) return true;
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            if (this.isTextboxTextEqual(textbox, previous)) return true;
            await this.tryRestoreTextboxTextAfterFailedReplace(textbox, previous, options);
            return this.isTextboxTextEqual(textbox, previous);
        }

        await this.tryRestoreTextboxTextAfterFailedReplace(textbox, previous, options);
        return this.isTextboxTextEqual(textbox, previous);
    }

    clearRichTextboxText(textbox) {
        this.selectTextboxContents(textbox);
        try {
            document.execCommand?.("delete", false, null);
        }
        catch {}
        if (this.isTextboxEmpty(textbox)) return true;

        try {
            if (this.dispatchTextboxBeforeInput(textbox, "", "deleteContentBackward") && this.isTextboxEmpty(textbox)) return true;
        }
        catch {}

        this.selectTextboxContents(textbox);
        try {
            document.execCommand?.("insertText", false, "");
        }
        catch {}
        return this.isTextboxEmpty(textbox);
    }

    clearRichTextboxTextWithKeyboard(textbox) {
        this.selectTextboxContents(textbox);
        ["keydown", "keypress", "keyup"].forEach(type => {
            try {
                textbox.dispatchEvent(new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key: "a",
                    code: "KeyA",
                    keyCode: 65,
                    which: 65,
                    ctrlKey: true,
                    metaKey: false
                }));
            }
            catch {}
        });
        this.selectTextboxContents(textbox);
        ["keydown", "keypress", "keyup"].forEach(type => {
            try {
                textbox.dispatchEvent(new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key: "Backspace",
                    code: "Backspace",
                    keyCode: 8,
                    which: 8
                }));
            }
            catch {}
        });
    }

    insertRichTextboxText(textbox, text) {
        if (this.dispatchTextboxPaste(textbox, text) && this.isTextboxTextEqual(textbox, text)) return true;
        if (this.dispatchTextboxBeforeInput(textbox, text, "insertText") && this.isTextboxTextEqual(textbox, text)) return true;

        try {
            return Boolean(document.execCommand?.("insertText", false, text));
        }
        catch {
            return false;
        }
    }

    isTextboxEmpty(textbox) {
        return !this.getTextboxTextSafe(textbox);
    }

    replaceTextboxTextDomFallback(textbox, text) {
        textbox.textContent = text;
        return this.dispatchInput(textbox, text, { inputType: "insertReplacementText" });
    }

    canUseTextboxDomFallback(textbox) {
        return !this.isRichDiscordTextbox(textbox);
    }

    isRichDiscordTextbox(textbox) {
        if (!textbox) return false;
        const contentEditable = String(textbox.getAttribute?.("contenteditable") || textbox.contentEditable || "").toLowerCase();
        return textbox.getAttribute?.("data-slate-editor") === "true"
            || contentEditable === "true"
            || textbox.matches?.("[role='textbox'][contenteditable='true'], [data-slate-editor='true']");
    }

    isTextboxTextEqual(textbox, text) {
        const expectedRaw = this.normalizeDraftRawText(text);
        const actualRaw = this.getTextboxRawTextSafe(textbox);
        if (actualRaw || expectedRaw) return actualRaw === expectedRaw;
        return this.getTextboxTextSafe(textbox) === this.normalizeExtractedText(text);
    }

    async waitForTextboxTextEqual(textbox, text) {
        if (this.isTextboxTextEqual(textbox, text)) return true;
        for (const delay of [0, 16, 50, 100, 200, 350]) {
            await this.waitForTextboxSettle(delay);
            if (this.isTextboxTextEqual(textbox, text)) return true;
        }
        return false;
    }

    async waitForTextboxStableTextEqual(textbox, text) {
        if (!await this.waitForTextboxTextEqual(textbox, text)) return false;
        await this.waitForTextboxSettle(120);
        return this.isTextboxTextEqual(textbox, text);
    }

    async waitForTextboxEmpty(textbox) {
        if (this.isTextboxEmpty(textbox)) return true;
        for (const delay of [0, 16, 50, 100, 200, 350]) {
            await this.waitForTextboxSettle(delay);
            if (this.isTextboxEmpty(textbox)) return true;
        }
        return false;
    }

    async waitForTextboxStableEmpty(textbox) {
        if (!await this.waitForTextboxEmpty(textbox)) return false;
        await this.waitForTextboxSettle(120);
        return this.isTextboxEmpty(textbox);
    }

    waitForTextboxSettle(delay = 0) {
        return new Promise(resolve => {
            const win = typeof window !== "undefined" ? window : null;
            const done = () => resolve();
            if (delay > 0) {
                const timer = typeof win?.setTimeout === "function" ? win.setTimeout.bind(win) : setTimeout;
                timer(done, delay);
                return;
            }
            if (typeof win?.requestAnimationFrame === "function") {
                win.requestAnimationFrame(done);
                return;
            }
            setTimeout(done, 0);
        });
    }

    async prepareTextboxFullReplacementSelection(textbox, previousText = "") {
        textbox?.focus?.();
        if (!this.selectTextboxContents(textbox)) return false;
        this.dispatchSelectionChange();
        await this.waitForTextboxSettle(0);
        await this.waitForTextboxSettle(16);
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!this.isSelectionInsideElement(selection, textbox)) return false;
        if (previousText && this.getTextboxRawTextSafe(textbox) !== this.normalizeDraftRawText(previousText)) return false;
        return true;
    }

    async tryUndoTextboxEdit(textbox, expectedText = "", options = {}) {
        const expected = this.normalizeDraftRawText(expectedText);
        if (!this.normalizeExtractedText(expected)) return false;
        if (options.rollback) options.rollback.undoAttempted = true;
        const attempts = [
            () => this.dispatchTextboxBeforeInput(textbox, "", "historyUndo"),
            () => this.dispatchTextboxKeyboardShortcut(textbox, "z", "KeyZ", { ctrlKey: true }),
            () => {
                try {
                    return Boolean(document.execCommand?.("undo", false, null));
                }
                catch {
                    return false;
                }
            }
        ];

        for (const attempt of attempts) {
            if (!this.isTextboxReplacementWriteAllowed(textbox, options)) return false;
            const before = this.getTextboxRawTextSafe(textbox);
            attempt();
            if (await this.waitForTextboxStableTextEqual(textbox, expected)) return true;
            // One undo step at most: a second one would unwind the user's own earlier typing.
            if (this.getTextboxRawTextSafe(textbox) !== before) return false;
        }
        return false;
    }

    dispatchTextboxKeyboardShortcut(textbox, key, code, modifiers = {}) {
        if (typeof textbox?.dispatchEvent !== "function") return false;
        let dispatched = false;
        ["keydown", "keypress", "keyup"].forEach(type => {
            try {
                const event = new KeyboardEvent(type, {
                    bubbles: true,
                    cancelable: true,
                    key,
                    code,
                    keyCode: String(key || "").toUpperCase().charCodeAt(0),
                    which: String(key || "").toUpperCase().charCodeAt(0),
                    ctrlKey: Boolean(modifiers.ctrlKey),
                    metaKey: Boolean(modifiers.metaKey),
                    altKey: Boolean(modifiers.altKey),
                    shiftKey: Boolean(modifiers.shiftKey)
                });
                dispatched = textbox.dispatchEvent(event) !== false || dispatched;
            }
            catch {}
        });
        return dispatched;
    }

    dispatchSelectionChange() {
        try {
            document.dispatchEvent?.(new Event("selectionchange", { bubbles: false, cancelable: false }));
            return true;
        }
        catch {
            return false;
        }
    }

    selectTextboxContents(textbox) {
        textbox?.focus?.();
        return this.selectTextboxTextNodes(textbox) || this.selectElementContents(textbox);
    }

    selectTextboxTextNodes(element) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange || !document.createTreeWalker || !element) return false;

        try {
            const textNodes = [];
            const walker = document.createTreeWalker(element, 4, {
                acceptNode: node => {
                    const parent = node?.parentElement || node?.parentNode;
                    if (!parent) return 2;
                    if (parent.closest?.(".dait-polish-result-panel, .dait-polish-restore-control, [data-slate-placeholder='true']")) return 2;
                    if (!String(node.nodeValue || "").replace(/\u200b/g, "").length) return 2;
                    return 1;
                }
            });
            let node = walker.nextNode();
            while (node) {
                textNodes.push(node);
                node = walker.nextNode();
            }
            if (!textNodes.length) return false;

            const first = textNodes[0];
            const last = textNodes[textNodes.length - 1];
            const range = document.createRange();
            range.setStart(first, 0);
            range.setEnd(last, String(last.nodeValue || "").length);
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        }
        catch {
            return false;
        }
    }

    selectElementContents(element) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange) return false;

        try {
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
            return true;
        }
        catch {
            return false;
        }
    }

    dispatchTextboxPaste(target, text) {
        try {
            const clipboardData = this.createClipboardData(text);
            const EventCtor = typeof window !== "undefined" ? window.ClipboardEvent : null;
            if (!EventCtor || !clipboardData) return false;

            const event = new EventCtor("paste", {
                bubbles: true,
                cancelable: true,
                clipboardData
            });
            if (!event.clipboardData) {
                Object.defineProperty(event, "clipboardData", { value: clipboardData });
            }
            const dispatched = target.dispatchEvent(event);
            return dispatched === false || event.defaultPrevented;
        }
        catch {
            return false;
        }
    }

    createClipboardData(text) {
        const DataTransferCtor = typeof window !== "undefined" ? window.DataTransfer : null;
        if (!DataTransferCtor) return null;
        const data = new DataTransferCtor();
        data.setData("text/plain", text);
        return data;
    }

    dispatchTextboxBeforeInput(target, text, inputType = "insertReplacementText") {
        try {
            const EventCtor = typeof window !== "undefined" ? window.InputEvent : null;
            if (!EventCtor) return false;
            const event = new EventCtor("beforeinput", {
                bubbles: true,
                cancelable: true,
                inputType,
                data: text
            });
            const dispatched = target.dispatchEvent(event);
            return dispatched === false || event.defaultPrevented;
        }
        catch {
            return false;
        }
    }

    finishTextboxReplacement(textbox, options = {}) {
        const token = ++this.textboxReplacementCleanupToken;
        this.removeTextboxReplacementCleanupListener();
        this.clearTextboxReplacementCleanupTimers();
        if (this.isRichDiscordTextbox(textbox)) {
            this.applyDiscordTextboxReplacementSelection(textbox, options);
            return;
        }
        this.textboxReplacementCleanupRemove = this.addTextboxReplacementCleanupCancelListeners(token);

        this.applyTextboxReplacementSelection(textbox, options);
        const schedule = typeof window !== "undefined" ? window.requestAnimationFrame : null;
        if (typeof schedule === "function") {
            const firstRaf = schedule(() => {
                this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options);
                if (token !== this.textboxReplacementCleanupToken || !this.isStarted) return;
                const secondRaf = schedule(() => this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options));
                this.textboxReplacementCleanupRafs.push(secondRaf);
            });
            this.textboxReplacementCleanupRafs.push(firstRaf);
        }
        const delayed = typeof window !== "undefined" ? window.setTimeout : null;
        if (typeof delayed === "function") {
            this.textboxReplacementCleanupTimers.push(delayed(() => this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options), 60));
            this.textboxReplacementCleanupTimers.push(delayed(() => {
                this.applyTextboxReplacementSelectionIfCurrent(token, textbox, options);
                this.removeTextboxReplacementCleanupListener();
            }, 180));
        }
        else {
            this.removeTextboxReplacementCleanupListener();
        }
    }

    applyDiscordTextboxReplacementSelection(textbox, options = {}) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (options.blurAfterReplace) {
            if (!selection || this.isSelectionInsideElement(selection, textbox)) selection?.removeAllRanges?.();
            this.blurElement(textbox);
            this.blurElement(options.extraBlurTarget);
            return;
        }
        this.placeCaretAtTextboxTextEnd(textbox);
    }

    placeCaretAtTextboxTextEnd(textbox) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (!selection || !document.createRange || !document.createTreeWalker || !textbox) return false;
        try {
            const walker = document.createTreeWalker(textbox, 4, {
                acceptNode: node => String(node?.nodeValue || "").replace(/\u200b/g, "").length ? 1 : 2
            });
            let last = null;
            let node = walker.nextNode();
            while (node) {
                last = node;
                node = walker.nextNode();
            }
            if (!last) return false;
            const range = document.createRange();
            range.setStart(last, String(last.nodeValue || "").length);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            this.dispatchSelectionChange();
            return true;
        }
        catch {
            return false;
        }
    }

    applyTextboxReplacementSelectionIfCurrent(token, textbox, options = {}) {
        if (token !== this.textboxReplacementCleanupToken) return;
        if (!this.isStarted) return;
        this.applyTextboxReplacementSelection(textbox, options);
    }

    addTextboxReplacementCleanupCancelListeners(token) {
        if (typeof document === "undefined" || !document.addEventListener) return null;
        const cancel = () => this.cancelTextboxReplacementCleanup(token);
        const events = ["pointerdown", "mousedown", "touchstart", "keydown", "copy", "cut", "contextmenu"];
        events.forEach(type => document.addEventListener(type, cancel, true));
        return () => events.forEach(type => document.removeEventListener?.(type, cancel, true));
    }

    cancelTextboxReplacementCleanup(token = this.textboxReplacementCleanupToken) {
        if (token !== this.textboxReplacementCleanupToken) return;
        this.textboxReplacementCleanupToken++;
        this.clearTextboxReplacementCleanupTimers();
        this.removeTextboxReplacementCleanupListener();
    }

    clearTextboxReplacementCleanupTimers() {
        if (typeof window !== "undefined") {
            this.textboxReplacementCleanupTimers.forEach(timer => window.clearTimeout?.(timer));
            this.textboxReplacementCleanupRafs.forEach(raf => window.cancelAnimationFrame?.(raf));
        }
        this.textboxReplacementCleanupTimers = [];
        this.textboxReplacementCleanupRafs = [];
    }

    removeTextboxReplacementCleanupListener() {
        if (!this.textboxReplacementCleanupRemove) return;
        const remove = this.textboxReplacementCleanupRemove;
        this.textboxReplacementCleanupRemove = null;
        remove();
    }

    applyTextboxReplacementSelection(textbox, options = {}) {
        const selection = typeof window !== "undefined" ? window.getSelection?.() : null;
        if (options.blurAfterReplace) {
            if (!selection || this.isSelectionInsideElement(selection, textbox)) {
                selection?.removeAllRanges?.();
            }
            this.blurElement(textbox);
            this.blurElement(options.extraBlurTarget);
            return;
        }

        if (!selection || !document.createRange) return;
        if (!this.isSelectionInsideElement(selection, textbox) && !this.isActiveElementInside(textbox)) return;
        try {
            const range = document.createRange();
            range.selectNodeContents(textbox);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        catch {
            selection.removeAllRanges?.();
        }
    }

    isActiveElementInside(element) {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        return Boolean(active && (active === element || element?.contains?.(active)));
    }

    isSelectionInsideElement(selection, element) {
        if (!selection || !element) return false;
        const anchor = selection.anchorNode;
        const focus = selection.focusNode;
        if (!anchor && !focus) return true;
        return this.isNodeInsideElement(anchor, element) || this.isNodeInsideElement(focus, element);
    }

    isNodeInsideElement(node, element) {
        if (!node || !element) return false;
        if (node === element) return true;
        const parent = node.nodeType === 1 ? node : node.parentElement || node.parentNode;
        return Boolean(parent && (parent === element || element.contains?.(parent)));
    }

    blurElement(element) {
        if (!element) return;
        const active = typeof document !== "undefined" ? document.activeElement : null;
        if (active && (active === element || element.contains?.(active))) {
            active.blur?.();
            return;
        }
        element.blur?.();
    }

    dispatchInput(target, data, options = {}) {
        if (typeof target?.dispatchEvent !== "function") return false;
        try {
            target.dispatchEvent(new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                inputType: options.inputType || "insertText",
                data
            }));
            return true;
        }
        catch {
            try {
                target.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
                return true;
            }
            catch {
                return false;
            }
        }
    }

    submitTextbox(textbox) {
        const form = textbox.closest("form");
        const sendButton = form?.querySelector("button[aria-label*='Send'], button[type='submit']");
        if (sendButton && !sendButton.disabled) {
            sendButton.click();
            return;
        }

        textbox.focus?.();
        ["keydown", "keypress", "keyup"].forEach(type => {
            textbox.dispatchEvent(new KeyboardEvent(type, {
                bubbles: true,
                cancelable: true,
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13
            }));
        });
    }

    setButtonBusy(button, busy, text) {
        if (!button) return;
        if (button.dataset?.daitFullLabel || button.classList?.contains?.("dait-input-action-menu-button")) {
            // Composer buttons keep their (density-aware) label and show busy as a state instead.
            button.disabled = Boolean(busy);
            button.classList?.toggle?.("dait-busy", Boolean(busy));
            if (busy) button.setAttribute?.("aria-busy", "true");
            else button.removeAttribute?.("aria-busy");
            this.renderInputActionButtonLabel(button);
            return;
        }
        button.disabled = busy;
        button.textContent = text;
    }

    getTranslationLineCacheAliases(text, options = {}) {
        return this.getTranslationCacheAliases(text, options, { includePreMessageIdentity: false });
    }

    getAutoTextTranslationFailureKey(text, options = {}) {
        return this.getAutoTextTranslationCacheKey(text, options);
    }

    getAutoTextTranslationFailure(text, options = {}) {
        const key = this.getAutoTextTranslationFailureKey(text, options);
        const failure = key ? this.autoTranslationFailures.get(key) : null;
        if (failure && this.isAutoTranslationFailureExpired(failure)) {
            this.rememberAutoTranslationFailureHistory(key, failure);
            this.autoTranslationFailures.delete(key);
            return null;
        }
        return failure || null;
    }

    normalizeTranslationMessageIdentity(identity) {
        return String(identity || "").trim().replace(/\s+/g, " ");
    }

    withMessageIdentity(options, messageNode, content, text) {
        return {
            ...options,
            messageIdentity: this.getMessageIdentity(messageNode, content, text)
        };
    }

    getMessageIdentity(messageNode, content, text) {
        return this.messageTracker.getIdentity(messageNode, content, text);
    }

    formatError(error) {
        const message = this.getFriendlyErrorMessage(error);
        return message.length > 480 ? `${message.slice(0, 480)}...` : message;
    }

    getFriendlyErrorMessage(error) {
        const status = Number(error?.status || 0);
        let message = "";
        if (this.isRequestCancelled(error)) message = this.t("errorCancelled");
        else if (Object.hasOwn(API_ENDPOINT_ERROR_MESSAGE_KEYS, error?.code)) message = this.t(API_ENDPOINT_ERROR_MESSAGE_KEYS[error.code]);
        else if (error?.manualTranslationRescueFailed) message = this.t("manualTranslateRescueFailed");
        else if (this.isTimeoutError(error)) message = this.t("errorTimeout");
        else if (error?.localProviderUnavailable) message = this.t("errorLocalProviderUnavailable");
        else if (status === 401 || status === 403) message = this.t("errorUnauthorized");
        else if (status === 429) message = this.t("errorRateLimited");
        else if (status >= 500) message = this.t("errorServer");
        else if (this.isNetworkError(error)) message = this.t("errorNetwork");
        else if (String(error?.message || "") === "API_ERROR") message = status ? `API ${status}` : this.t("unknownError");
        else message = String(error?.message || error || this.t("unknownError"));

        const details = [];
        if (status) details.push(String(status));
        if (Number(error?.retryAfterMs) > 0) details.push(`${Math.ceil(Number(error.retryAfterMs) / 1000)}s`);
        if (error?.requestId) details.push(`id:${error.requestId}`);
        else if (error?.bodyHash) details.push(`ref:${error.bodyHash}`);
        return details.length ? `${message} (${details.join(", ")})` : message;
    }

    showToast(message, type = "info") {
        if (typeof BdApi !== "undefined" && BdApi.UI?.showToast) {
            BdApi.UI.showToast(message, { type });
            return;
        }
        console.log(`[${PLUGIN_NAME}] ${message}`);
    }

    injectStyles() {
        const css = PLUGIN_CSS;

        const bdApi = globalThis.BdApi;
        const doc = typeof document !== "undefined" ? document : globalThis.document;
        if (bdApi?.DOM?.addStyle) {
            doc?.getElementById?.(STYLE_ID)?.remove?.();
            bdApi.DOM.addStyle(STYLE_ID, css);
            return;
        }

        if (!doc?.createElement || !doc.head?.appendChild) return;
        doc.getElementById?.(STYLE_ID)?.remove?.();
        const style = doc.createElement("style");
        style.id = STYLE_ID;
        style.textContent = css;
        doc.head.appendChild(style);
    }

    removeStyles() {
        if (typeof BdApi !== "undefined" && BdApi.DOM?.removeStyle) {
            BdApi.DOM.removeStyle(STYLE_ID);
        }
        const doc = typeof document !== "undefined" ? document : globalThis.document;
        doc?.getElementById?.(STYLE_ID)?.remove?.();
    }

    clone(value) {
        return JSON.parse(JSON.stringify(value));
    }


    // --- Delegators to SettingsStore (Phase 2 of the modularization plan: settings persistence, migration, task config and prompt-template CRUD.) ---
    loadData(...args) { return this.settingsStore.loadData(...args); }
    saveData(...args) { return this.settingsStore.saveData(...args); }
    recordDataIoFailure(...args) { return this.settingsStore.recordDataIoFailure(...args); }
    loadSettings(...args) { return this.settingsStore.loadSettings(...args); }
    saveSettings(...args) { return this.settingsStore.saveSettings(...args); }
    flushSettings(...args) { return this.settingsStore.flushSettings(...args); }
    mergeSettings(...args) { return this.settingsStore.mergeSettings(...args); }
    ensureSettingsShape(...args) { return this.settingsStore.ensureSettingsShape(...args); }
    migrateDefaultTranslationPrompt(...args) { return this.settingsStore.migrateDefaultTranslationPrompt(...args); }
    isLegacyTranslationNaturalPrompt(...args) { return this.settingsStore.isLegacyTranslationNaturalPrompt(...args); }
    normalizePromptForMigration(...args) { return this.settingsStore.normalizePromptForMigration(...args); }
    getSetting(...args) { return this.settingsStore.getSetting(...args); }
    setSetting(...args) { return this.settingsStore.setSetting(...args); }
    getTaskConfig(...args) { return this.settingsStore.getTaskConfig(...args); }
    getEffectiveTaskConfig(...args) { return this.settingsStore.getEffectiveTaskConfig(...args); }
    getTaskProviderProfile(...args) { return this.settingsStore.getTaskProviderProfile(...args); }
    setTaskProvider(...args) { return this.settingsStore.setTaskProvider(...args); }
    applyProviderIntakeMode(...args) { return this.settingsStore.applyProviderIntakeMode(...args); }
    getPromptTemplates(...args) { return this.settingsStore.getPromptTemplates(...args); }
    ensurePromptTemplateSerials(...args) { return this.settingsStore.ensurePromptTemplateSerials(...args); }
    getNextPromptTemplateSerial(...args) { return this.settingsStore.getNextPromptTemplateSerial(...args); }
    applyPromptTemplate(...args) { return this.settingsStore.applyPromptTemplate(...args); }
    savePromptTemplate(...args) { return this.settingsStore.savePromptTemplate(...args); }
    updatePromptTemplate(...args) { return this.settingsStore.updatePromptTemplate(...args); }
    deletePromptTemplate(...args) { return this.settingsStore.deletePromptTemplate(...args); }

    // --- Delegators to ProviderLayer (Phase 3 of the modularization plan: provider registry, endpoint policy, request builders, parsers, error mapping, fallback policy, Google key pool and local-provider health.) ---
    getProviderDefaults(...args) { return this.providerLayer.getProviderDefaults(...args); }
    isGoogleTranslateProvider(...args) { return this.providerLayer.isGoogleTranslateProvider(...args); }
    isMicrosoftTranslateProvider(...args) { return this.providerLayer.isMicrosoftTranslateProvider(...args); }
    isDeepLTranslateProvider(...args) { return this.providerLayer.isDeepLTranslateProvider(...args); }
    isBaiduTranslateProvider(...args) { return this.providerLayer.isBaiduTranslateProvider(...args); }
    isDirectTranslateProvider(...args) { return this.providerLayer.isDirectTranslateProvider(...args); }
    isLocalTranslationProvider(...args) { return this.providerLayer.isLocalTranslationProvider(...args); }
    isLocalProviderAutoModelValue(...args) { return this.providerLayer.isLocalProviderAutoModelValue(...args); }
    getEffectiveChatCompletionEndpoint(...args) { return this.providerLayer.getEffectiveChatCompletionEndpoint(...args); }
    shouldAutoDetectLocalProviderModel(...args) { return this.providerLayer.shouldAutoDetectLocalProviderModel(...args); }
    getLocalProviderModelDetectionCacheKey(...args) { return this.providerLayer.getLocalProviderModelDetectionCacheKey(...args); }
    getCachedLocalProviderDetectedModel(...args) { return this.providerLayer.getCachedLocalProviderDetectedModel(...args); }
    setCachedLocalProviderDetectedModel(...args) { return this.providerLayer.setCachedLocalProviderDetectedModel(...args); }
    getEffectiveChatCompletionModel(...args) { return this.providerLayer.getEffectiveChatCompletionModel(...args); }
    refreshLocalProviderDetectedModel(...args) { return this.providerLayer.refreshLocalProviderDetectedModel(...args); }
    fetchLocalProviderDetectedModel(...args) { return this.providerLayer.fetchLocalProviderDetectedModel(...args); }
    getLocalProviderModelsEndpoint(...args) { return this.providerLayer.getLocalProviderModelsEndpoint(...args); }
    parseLocalProviderModelsResponse(...args) { return this.providerLayer.parseLocalProviderModelsResponse(...args); }
    normalizeLocalProviderModelId(...args) { return this.providerLayer.normalizeLocalProviderModelId(...args); }
    getLocalProviderDetectedModelSnapshot(...args) { return this.providerLayer.getLocalProviderDetectedModelSnapshot(...args); }
    getGoogleTranslateKeys(...args) { return this.providerLayer.getGoogleTranslateKeys(...args); }
    countGoogleTranslateChars(...args) { return this.providerLayer.countGoogleTranslateChars(...args); }
    peekGoogleTranslateAvailableKey(...args) { return this.providerLayer.peekGoogleTranslateAvailableKey(...args); }
    selectGoogleTranslateKey(...args) { return this.providerLayer.selectGoogleTranslateKey(...args); }
    getGoogleTranslateReservedChars(...args) { return this.providerLayer.getGoogleTranslateReservedChars(...args); }
    reserveGoogleTranslateKey(...args) { return this.providerLayer.reserveGoogleTranslateKey(...args); }
    releaseGoogleTranslateReservation(...args) { return this.providerLayer.releaseGoogleTranslateReservation(...args); }
    reserveGoogleTranslateRequest(...args) { return this.providerLayer.reserveGoogleTranslateRequest(...args); }
    createGoogleTranslateQuotaError(...args) { return this.providerLayer.createGoogleTranslateQuotaError(...args); }
    createGoogleTranslateNoKeyError(...args) { return this.providerLayer.createGoogleTranslateNoKeyError(...args); }
    getGoogleTranslateQuotaRetryAfterMs(...args) { return this.providerLayer.getGoogleTranslateQuotaRetryAfterMs(...args); }
    releaseGoogleTranslateRequestReservation(...args) { return this.providerLayer.releaseGoogleTranslateRequestReservation(...args); }
    getGoogleTranslateUsageSummary(...args) { return this.providerLayer.getGoogleTranslateUsageSummary(...args); }
    saveGoogleTranslateRuntimeState(...args) { return this.providerLayer.saveGoogleTranslateRuntimeState(...args); }
    scheduleGoogleTranslateRuntimeStatePersist(...args) { return this.providerLayer.scheduleGoogleTranslateRuntimeStatePersist(...args); }
    flushGoogleTranslateRuntimeState(...args) { return this.providerLayer.flushGoogleTranslateRuntimeState(...args); }
    resetGoogleTranslateUsageStats(...args) { return this.providerLayer.resetGoogleTranslateUsageStats(...args); }
    markGoogleTranslateKeyUsage(...args) { return this.providerLayer.markGoogleTranslateKeyUsage(...args); }
    markGoogleTranslateKeyFailure(...args) { return this.providerLayer.markGoogleTranslateKeyFailure(...args); }
    markGoogleTranslateProviderSuccess(...args) { return this.providerLayer.markGoogleTranslateProviderSuccess(...args); }
    getGoogleLanguageCode(...args) { return this.providerLayer.getGoogleLanguageCode(...args); }
    getEffectiveRequestApiKey(...args) { return this.providerLayer.getEffectiveRequestApiKey(...args); }
    getRequestHeaders(...args) { return this.providerLayer.getRequestHeaders(...args); }
    hasUsableApiConfig(...args) { return this.providerLayer.hasUsableApiConfig(...args); }
    setApiStatus(...args) { return this.providerLayer.setApiStatus(...args); }
    setApiRuntimeStatus(...args) { return this.providerLayer.setApiRuntimeStatus(...args); }
    markLocalProviderHealthy(...args) { return this.providerLayer.markLocalProviderHealthy(...args); }
    shouldBlockAutoTranslationForLocalProviderHealth(...args) { return this.providerLayer.shouldBlockAutoTranslationForLocalProviderHealth(...args); }
    getLocalProviderHealthProbeRetryMs(...args) { return this.providerLayer.getLocalProviderHealthProbeRetryMs(...args); }
    getLocalProviderHealthRetryMs(...args) { return this.providerLayer.getLocalProviderHealthRetryMs(...args); }
    startLocalProviderHealthProbe(...args) { return this.providerLayer.startLocalProviderHealthProbe(...args); }
    resetApiStatus(...args) { return this.providerLayer.resetApiStatus(...args); }
    getApiStatus(...args) { return this.providerLayer.getApiStatus(...args); }
    getProviderFallbackOrder(...args) { return this.providerLayer.getProviderFallbackOrder(...args); }
    shouldTryProviderFallback(...args) { return this.providerLayer.shouldTryProviderFallback(...args); }
    getProviderFallbackConfig(...args) { return this.providerLayer.getProviderFallbackConfig(...args); }
    tryProviderFallbackModelTask(...args) { return this.providerLayer.tryProviderFallbackModelTask(...args); }
    getCurrentMonthKey(...args) { return this.providerLayer.getCurrentMonthKey(...args); }
    normalizeGoogleTranslateMonthlyLimit(...args) { return this.providerLayer.normalizeGoogleTranslateMonthlyLimit(...args); }
    parseGoogleTranslateKeyPoolText(...args) { return this.providerLayer.parseGoogleTranslateKeyPoolText(...args); }
    formatGoogleTranslateKeyPoolText(...args) { return this.providerLayer.formatGoogleTranslateKeyPoolText(...args); }
    normalizeGoogleTranslateKeyPool(...args) { return this.providerLayer.normalizeGoogleTranslateKeyPool(...args); }
    getAutoTranslationProviderKey(...args) { return this.providerLayer.getAutoTranslationProviderKey(...args); }
    getGoogleTranslateProviderKey(...args) { return this.providerLayer.getGoogleTranslateProviderKey(...args); }
    runModelTask(...args) { return this.providerLayer.runModelTask(...args); }
    runModelTaskWithResult(...args) { return this.providerLayer.runModelTaskWithResult(...args); }
    adoptSharedModelResult(...args) { return this.providerLayer.adoptSharedModelResult(...args); }
    fetchModelResponse(...args) { return this.providerLayer.fetchModelResponse(...args); }
    annotateModelRequestError(...args) { return this.providerLayer.annotateModelRequestError(...args); }
    isLocalProviderUnavailableError(...args) { return this.providerLayer.isLocalProviderUnavailableError(...args); }
    isLoopbackEndpoint(...args) { return this.providerLayer.isLoopbackEndpoint(...args); }
    assertSafeRequestEndpoint(...args) { return this.providerLayer.assertSafeRequestEndpoint(...args); }
    isTimeoutError(...args) { return this.providerLayer.isTimeoutError(...args); }
    isRequestCancelled(...args) { return this.providerLayer.isRequestCancelled(...args); }
    isNetworkError(...args) { return this.providerLayer.isNetworkError(...args); }
    isLocalProviderEmptyResponseError(...args) { return this.providerLayer.isLocalProviderEmptyResponseError(...args); }
    isLocalProviderInvalidResponseError(...args) { return this.providerLayer.isLocalProviderInvalidResponseError(...args); }
    fetchApiResponseText(...args) { return this.providerLayer.fetchApiResponseText(...args); }
    abortActiveApiRequests(...args) { return this.providerLayer.abortActiveApiRequests(...args); }
    annotateGoogleTranslateApiError(...args) { return this.providerLayer.annotateGoogleTranslateApiError(...args); }
    getModelRequestKey(...args) { return this.providerLayer.getModelRequestKey(...args); }
    testApiConnection(...args) { return this.providerLayer.testApiConnection(...args); }
    buildConnectionTestRequest(...args) { return this.providerLayer.buildConnectionTestRequest(...args); }
    buildModelRequest(...args) { return this.providerLayer.buildModelRequest(...args); }
    buildChatCompletionRequest(...args) { return this.providerLayer.buildChatCompletionRequest(...args); }
    buildGoogleTranslateRequest(...args) { return this.providerLayer.buildGoogleTranslateRequest(...args); }
    buildMicrosoftTranslateRequest(...args) { return this.providerLayer.buildMicrosoftTranslateRequest(...args); }
    buildDeepLTranslateRequest(...args) { return this.providerLayer.buildDeepLTranslateRequest(...args); }
    buildBaiduTranslateRequest(...args) { return this.providerLayer.buildBaiduTranslateRequest(...args); }
    normalizeDeepLPlan(...args) { return this.providerLayer.normalizeDeepLPlan(...args); }
    getMicrosoftLanguageCode(...args) { return this.providerLayer.getMicrosoftLanguageCode(...args); }
    getDeepLLanguageCode(...args) { return this.providerLayer.getDeepLLanguageCode(...args); }
    getBaiduLanguageCode(...args) { return this.providerLayer.getBaiduLanguageCode(...args); }
    createMd5Hash(...args) { return this.providerLayer.createMd5Hash(...args); }
    protectGoogleTranslateText(...args) { return this.providerLayer.protectGoogleTranslateText(...args); }
    restoreGoogleTranslateText(...args) { return this.providerLayer.restoreGoogleTranslateText(...args); }
    applyProviderBodyOptions(...args) { return this.providerLayer.applyProviderBodyOptions(...args); }
    buildSystemPrompt(...args) { return this.providerLayer.buildSystemPrompt(...args); }
    isModelFinishReasonTruncated(...args) { return this.providerLayer.isModelFinishReasonTruncated(...args); }
    getModelResponseTruncationReason(...args) { return this.providerLayer.getModelResponseTruncationReason(...args); }
    createModelOutputTruncatedError(...args) { return this.providerLayer.createModelOutputTruncatedError(...args); }
    parseModelResponse(...args) { return this.providerLayer.parseModelResponse(...args); }
    parseGoogleTranslateResponse(...args) { return this.providerLayer.parseGoogleTranslateResponse(...args); }
    parseMicrosoftTranslateResponse(...args) { return this.providerLayer.parseMicrosoftTranslateResponse(...args); }
    parseDeepLTranslateResponse(...args) { return this.providerLayer.parseDeepLTranslateResponse(...args); }
    parseBaiduTranslateResponse(...args) { return this.providerLayer.parseBaiduTranslateResponse(...args); }
    regroupBaiduTranslateRows(...args) { return this.providerLayer.regroupBaiduTranslateRows(...args); }
    normalizeDirectTranslateParseResult(...args) { return this.providerLayer.normalizeDirectTranslateParseResult(...args); }
    createProviderParseError(...args) { return this.providerLayer.createProviderParseError(...args); }
    parseProviderJson(...args) { return this.providerLayer.parseProviderJson(...args); }
    createBaiduTranslateError(...args) { return this.providerLayer.createBaiduTranslateError(...args); }
    decodeHtmlEntities(...args) { return this.providerLayer.decodeHtmlEntities(...args); }
    extractModelContent(...args) { return this.providerLayer.extractModelContent(...args); }
    parseApiJson(...args) { return this.providerLayer.parseApiJson(...args); }

    // --- Delegators to TranslationCacheStore (Phase 4 of the modularization plan: translation cache keys, aliases, TTL, compact codec, negative lookups and persistence.) ---
    normalizeTranslationCacheTtlHours(...args) { return this.translationCacheStore.normalizeTranslationCacheTtlHours(...args); }
    normalizeTranslationCacheMaxEntries(...args) { return this.translationCacheStore.normalizeTranslationCacheMaxEntries(...args); }
    isInvalidAutoTranslationCacheValue(...args) { return this.translationCacheStore.isInvalidAutoTranslationCacheValue(...args); }
    shouldStoreAutoTextTranslationCache(...args) { return this.translationCacheStore.shouldStoreAutoTextTranslationCache(...args); }
    getTranslationCacheMode(...args) { return this.translationCacheStore.getTranslationCacheMode(...args); }
    isAutoTranslationCacheMode(...args) { return this.translationCacheStore.isAutoTranslationCacheMode(...args); }
    isVolatileTranslationCacheKey(...args) { return this.translationCacheStore.isVolatileTranslationCacheKey(...args); }
    getTranslationCacheKey(...args) { return this.translationCacheStore.getTranslationCacheKey(...args); }
    getLegacyTranslationCacheKey(...args) { return this.translationCacheStore.getLegacyTranslationCacheKey(...args); }
    getTranslationCacheAliases(...args) { return this.translationCacheStore.getTranslationCacheAliases(...args); }
    getAutoTextTranslationCacheOptions(...args) { return this.translationCacheStore.getAutoTextTranslationCacheOptions(...args); }
    getAutoTextTranslationCacheKey(...args) { return this.translationCacheStore.getAutoTextTranslationCacheKey(...args); }
    getAutoTextTranslationCacheAliases(...args) { return this.translationCacheStore.getAutoTextTranslationCacheAliases(...args); }
    getAutoTextTranslationCacheValue(...args) { return this.translationCacheStore.getAutoTextTranslationCacheValue(...args); }
    getAutoTextTranslationCacheValueCached(...args) { return this.translationCacheStore.getAutoTextTranslationCacheValueCached(...args); }
    setAutoTextTranslationCache(...args) { return this.translationCacheStore.setAutoTextTranslationCache(...args); }
    getFullConfigTranslationCacheKey(...args) { return this.translationCacheStore.getFullConfigTranslationCacheKey(...args); }
    getPreMessageIdentityTranslationCacheKey(...args) { return this.translationCacheStore.getPreMessageIdentityTranslationCacheKey(...args); }
    buildTranslationCacheKey(...args) { return this.translationCacheStore.buildTranslationCacheKey(...args); }
    getCompactTranslationCacheConfigParts(...args) { return this.translationCacheStore.getCompactTranslationCacheConfigParts(...args); }
    getCacheConfigSnapshot(...args) { return this.translationCacheStore.getCacheConfigSnapshot(...args); }
    getTranslationCacheValueCached(...args) { return this.translationCacheStore.getTranslationCacheValueCached(...args); }
    hasTranslationCacheCandidate(...args) { return this.translationCacheStore.hasTranslationCacheCandidate(...args); }
    clearScanTranslationCacheLookup(...args) { return this.translationCacheStore.clearScanTranslationCacheLookup(...args); }
    isTranslationCacheNegativeLookupFresh(...args) { return this.translationCacheStore.isTranslationCacheNegativeLookupFresh(...args); }
    rememberTranslationCacheNegativeLookup(...args) { return this.translationCacheStore.rememberTranslationCacheNegativeLookup(...args); }
    clearTranslationCacheNegativeLookups(...args) { return this.translationCacheStore.clearTranslationCacheNegativeLookups(...args); }
    pruneTranslationCacheNegativeLookups(...args) { return this.translationCacheStore.pruneTranslationCacheNegativeLookups(...args); }
    getTranslationCacheValue(...args) { return this.translationCacheStore.getTranslationCacheValue(...args); }
    promoteTranslationCacheAlias(...args) { return this.translationCacheStore.promoteTranslationCacheAlias(...args); }
    setTranslationCache(...args) { return this.translationCacheStore.setTranslationCache(...args); }
    deleteTranslationCacheCandidates(...args) { return this.translationCacheStore.deleteTranslationCacheCandidates(...args); }
    touchTranslationCache(...args) { return this.translationCacheStore.touchTranslationCache(...args); }
    loadTranslationCache(...args) { return this.translationCacheStore.loadTranslationCache(...args); }
    decodePersistedTranslationCacheKey(...args) { return this.translationCacheStore.decodePersistedTranslationCacheKey(...args); }
    decodePersistedTranslationCacheValue(...args) { return this.translationCacheStore.decodePersistedTranslationCacheValue(...args); }
    createPersistedTranslationCachePayload(...args) { return this.translationCacheStore.createPersistedTranslationCachePayload(...args); }
    scheduleTranslationCachePersist(...args) { return this.translationCacheStore.scheduleTranslationCachePersist(...args); }
    flushTranslationCache(...args) { return this.translationCacheStore.flushTranslationCache(...args); }
    clearTranslationCache(...args) { return this.translationCacheStore.clearTranslationCache(...args); }
    clearTranslationCacheStats(...args) { return this.translationCacheStore.clearTranslationCacheStats(...args); }
    clampTranslationCacheExpiryToCurrentTtl(...args) { return this.translationCacheStore.clampTranslationCacheExpiryToCurrentTtl(...args); }
    pruneTranslationCache(...args) { return this.translationCacheStore.pruneTranslationCache(...args); }
    isTranslationCacheEntryExpired(...args) { return this.translationCacheStore.isTranslationCacheEntryExpired(...args); }
    getTranslationCacheEntryExpiresAt(...args) { return this.translationCacheStore.getTranslationCacheEntryExpiresAt(...args); }
    getTranslationCacheTtlMs(...args) { return this.translationCacheStore.getTranslationCacheTtlMs(...args); }
    getTranslationCacheMaxEntries(...args) { return this.translationCacheStore.getTranslationCacheMaxEntries(...args); }

    // --- Delegators to OutputGuard (Phase 5a of the modularization plan: model-output validation (emoji tokens, leakage/refusal/dictionary/labeled shapes, Chinese script checks, low-information text).) ---
    getLongAutoTranslationChunkFailurePlaceholder(...args) { return this.outputGuard.getLongAutoTranslationChunkFailurePlaceholder(...args); }
    hasLongAutoTranslationChunkFailurePlaceholder(...args) { return this.outputGuard.hasLongAutoTranslationChunkFailurePlaceholder(...args); }
    sanitizeAutoTranslationOutput(...args) { return this.outputGuard.sanitizeAutoTranslationOutput(...args); }
    extractAutoTranslationOutputCandidates(...args) { return this.outputGuard.extractAutoTranslationOutputCandidates(...args); }
    isInvalidAutoTranslationOutput(...args) { return this.outputGuard.isInvalidAutoTranslationOutput(...args); }
    getDiscordEmojiTokenCounts(...args) { return this.outputGuard.getDiscordEmojiTokenCounts(...args); }
    hasDiscordEmojiTokenMismatch(...args) { return this.outputGuard.hasDiscordEmojiTokenMismatch(...args); }
    getAutoTranslationInvalidOutputReason(...args) { return this.outputGuard.getAutoTranslationInvalidOutputReason(...args); }
    isAcceptableChineseVariantMix(...args) { return this.outputGuard.isAcceptableChineseVariantMix(...args); }
    hasPromptLeakageAutoTranslationOutput(...args) { return this.outputGuard.hasPromptLeakageAutoTranslationOutput(...args); }
    hasRefusalAutoTranslationOutput(...args) { return this.outputGuard.hasRefusalAutoTranslationOutput(...args); }
    hasDictionaryStyleAutoTranslationOutput(...args) { return this.outputGuard.hasDictionaryStyleAutoTranslationOutput(...args); }
    hasExplanatoryAutoTranslationOutput(...args) { return this.outputGuard.hasExplanatoryAutoTranslationOutput(...args); }
    hasLabeledAutoTranslationOutput(...args) { return this.outputGuard.hasLabeledAutoTranslationOutput(...args); }
    isShortSourcePromptLeakageShape(...args) { return this.outputGuard.isShortSourcePromptLeakageShape(...args); }
    hasSuspiciousChineseAutoTranslationOutput(...args) { return this.outputGuard.hasSuspiciousChineseAutoTranslationOutput(...args); }
    isLowInformationRepeatedText(...args) { return this.outputGuard.isLowInformationRepeatedText(...args); }
    isAcceptableTargetShortTranslation(...args) { return this.outputGuard.isAcceptableTargetShortTranslation(...args); }
    hasLikelyTraditionalHan(...args) { return this.outputGuard.hasLikelyTraditionalHan(...args); }
    hasLikelySimplifiedHan(...args) { return this.outputGuard.hasLikelySimplifiedHan(...args); }
    isTraditionalChineseTarget(...args) { return this.outputGuard.isTraditionalChineseTarget(...args); }
    isSimplifiedChineseTarget(...args) { return this.outputGuard.isSimplifiedChineseTarget(...args); }
    isAcceptableConnectionTestTruncation(...args) { return this.outputGuard.isAcceptableConnectionTestTruncation(...args); }

    // --- Delegators to DiagnosticsRecorder (Phase 5b of the modularization plan: diagnostics recording, aggregation, meta builders and persistence.) ---
    warnSanitized(...args) { return this.diagnosticsRecorder.warnSanitized(...args); }
    getDiagnosticTime(...args) { return this.diagnosticsRecorder.getDiagnosticTime(...args); }
    logSlowOperation(...args) { return this.diagnosticsRecorder.logSlowOperation(...args); }
    getDiagnosticRouteKeyHash(...args) { return this.diagnosticsRecorder.getDiagnosticRouteKeyHash(...args); }
    getDiagnosticBaseMeta(...args) { return this.diagnosticsRecorder.getDiagnosticBaseMeta(...args); }
    getDiagnosticMessageState(...args) { return this.diagnosticsRecorder.getDiagnosticMessageState(...args); }
    getDiagnosticReasonCode(...args) { return this.diagnosticsRecorder.getDiagnosticReasonCode(...args); }
    enrichDiagnosticMeta(...args) { return this.diagnosticsRecorder.enrichDiagnosticMeta(...args); }
    classifyDiagnosticFailure(...args) { return this.diagnosticsRecorder.classifyDiagnosticFailure(...args); }
    getAutoTranslationDiagnosticMeta(...args) { return this.diagnosticsRecorder.getAutoTranslationDiagnosticMeta(...args); }
    getTranslationDiagnosticMeta(...args) { return this.diagnosticsRecorder.getTranslationDiagnosticMeta(...args); }
    logDiagnostic(...args) { return this.diagnosticsRecorder.logDiagnostic(...args); }
    sanitizeDiagnosticMeta(...args) { return this.diagnosticsRecorder.sanitizeDiagnosticMeta(...args); }
    addDiagnosticSummaryCount(...args) { return this.diagnosticsRecorder.addDiagnosticSummaryCount(...args); }
    createDiagnosticSummary(...args) { return this.diagnosticsRecorder.createDiagnosticSummary(...args); }
    getDiagnosticLogsSnapshot(...args) { return this.diagnosticsRecorder.getDiagnosticLogsSnapshot(...args); }
    loadDiagnosticLogs(...args) { return this.diagnosticsRecorder.loadDiagnosticLogs(...args); }
    createPersistedDiagnosticLogsPayload(...args) { return this.diagnosticsRecorder.createPersistedDiagnosticLogsPayload(...args); }
    scheduleDiagnosticLogsPersist(...args) { return this.diagnosticsRecorder.scheduleDiagnosticLogsPersist(...args); }
    flushDiagnosticLogs(...args) { return this.diagnosticsRecorder.flushDiagnosticLogs(...args); }
    serializeDiagnosticLogs(...args) { return this.diagnosticsRecorder.serializeDiagnosticLogs(...args); }
    clearDiagnosticLogs(...args) { return this.diagnosticsRecorder.clearDiagnosticLogs(...args); }
    logAutoTranslationIntakeState(...args) { return this.diagnosticsRecorder.logAutoTranslationIntakeState(...args); }

    // --- Delegators to AutoTranslationQueueCore (Phase 6 pre-step A: auto-translation queue state, scheduling, failures, decisions, channel policy and timing windows.) ---
    shouldInvalidateAutoTranslationForSetting(...args) { return this.autoQueueCore.shouldInvalidateAutoTranslationForSetting(...args); }
    invalidateAutoTranslationQueue(...args) { return this.autoQueueCore.invalidateAutoTranslationQueue(...args); }
    getAutoTranslationQueueSnapshot(...args) { return this.autoQueueCore.getAutoTranslationQueueSnapshot(...args); }
    getAutoTranslationDiagnosticQueueType(...args) { return this.autoQueueCore.getAutoTranslationDiagnosticQueueType(...args); }
    getAutoTranslationDiagnosticQueuePriority(...args) { return this.autoQueueCore.getAutoTranslationDiagnosticQueuePriority(...args); }
    getAutoTranslationQueuedDiagnosticState(...args) { return this.autoQueueCore.getAutoTranslationQueuedDiagnosticState(...args); }
    getAutoTranslationBlockReasonCode(...args) { return this.autoQueueCore.getAutoTranslationBlockReasonCode(...args); }
    setAutoTranslationDiagnosticState(...args) { return this.autoQueueCore.setAutoTranslationDiagnosticState(...args); }
    logAutoTranslationMessageState(...args) { return this.autoQueueCore.logAutoTranslationMessageState(...args); }
    recordAutoTranslationDecision(...args) { return this.autoQueueCore.recordAutoTranslationDecision(...args); }
    getAutoTranslationDecisionKey(...args) { return this.autoQueueCore.getAutoTranslationDecisionKey(...args); }
    getAutoTranslationDecisionAction(...args) { return this.autoQueueCore.getAutoTranslationDecisionAction(...args); }
    getAutoTranslationLastDecisionState(...args) { return this.autoQueueCore.getAutoTranslationLastDecisionState(...args); }
    getLastAutoTranslationDecisionsSnapshot(...args) { return this.autoQueueCore.getLastAutoTranslationDecisionsSnapshot(...args); }
    clearAutoTranslationProviderFailureForCurrentConfig(...args) { return this.autoQueueCore.clearAutoTranslationProviderFailureForCurrentConfig(...args); }
    releaseProviderBlockedAutoTranslationItems(...args) { return this.autoQueueCore.releaseProviderBlockedAutoTranslationItems(...args); }
    isAutoTranslationProviderSnapshotCurrent(...args) { return this.autoQueueCore.isAutoTranslationProviderSnapshotCurrent(...args); }
    isAutoTranslationScrollEventRelevant(...args) { return this.autoQueueCore.isAutoTranslationScrollEventRelevant(...args); }
    markAutoTranslationViewportBusy(...args) { return this.autoQueueCore.markAutoTranslationViewportBusy(...args); }
    isAutoTranslationViewportSettling(...args) { return this.autoQueueCore.isAutoTranslationViewportSettling(...args); }
    isAutoTranslationRenderPaused(...args) { return this.autoQueueCore.isAutoTranslationRenderPaused(...args); }
    getAutoTranslationScrollStillRemainingMs(...args) { return this.autoQueueCore.getAutoTranslationScrollStillRemainingMs(...args); }
    getAutoTranslationRenderPauseRemainingMs(...args) { return this.autoQueueCore.getAutoTranslationRenderPauseRemainingMs(...args); }
    enterAutoTranslationJumpCooldown(...args) { return this.autoQueueCore.enterAutoTranslationJumpCooldown(...args); }
    isAutoTranslationJumpCoolingDown(...args) { return this.autoQueueCore.isAutoTranslationJumpCoolingDown(...args); }
    getAutoTranslationJumpCooldownRemainingMs(...args) { return this.autoQueueCore.getAutoTranslationJumpCooldownRemainingMs(...args); }
    getAutoTranslationViewportSettleRemainingMs(...args) { return this.autoQueueCore.getAutoTranslationViewportSettleRemainingMs(...args); }
    resetAutoTranslationViewportStability(...args) { return this.autoQueueCore.resetAutoTranslationViewportStability(...args); }
    isAutoTranslationViewportStabilityPending(...args) { return this.autoQueueCore.isAutoTranslationViewportStabilityPending(...args); }
    getAutoTranslationViewportAnchor(...args) { return this.autoQueueCore.getAutoTranslationViewportAnchor(...args); }
    trackAutoTranslationRouteChange(...args) { return this.autoQueueCore.trackAutoTranslationRouteChange(...args); }
    removeQueuedAutoTranslationItem(...args) { return this.autoQueueCore.removeQueuedAutoTranslationItem(...args); }
    pruneAutoTranslationQueue(...args) { return this.autoQueueCore.pruneAutoTranslationQueue(...args); }
    drainAutoTranslationQueue(...args) { return this.autoQueueCore.drainAutoTranslationQueue(...args); }
    retainProviderBlockedVisibleAutoTranslationBatch(...args) { return this.autoQueueCore.retainProviderBlockedVisibleAutoTranslationBatch(...args); }
    restoreBlockedAutoTranslationPrefetch(...args) { return this.autoQueueCore.restoreBlockedAutoTranslationPrefetch(...args); }
    restoreAutoTranslationBatch(...args) { return this.autoQueueCore.restoreAutoTranslationBatch(...args); }
    retainBlockedVisibleAutoTranslationItem(...args) { return this.autoQueueCore.retainBlockedVisibleAutoTranslationItem(...args); }
    shouldRetainAutoTranslationProviderBlockedItem(...args) { return this.autoQueueCore.shouldRetainAutoTranslationProviderBlockedItem(...args); }
    shouldRetainAutoTranslationFailureItem(...args) { return this.autoQueueCore.shouldRetainAutoTranslationFailureItem(...args); }
    getAutoTranslationProviderBlockedRetryMs(...args) { return this.autoQueueCore.getAutoTranslationProviderBlockedRetryMs(...args); }
    isRetainableAutoTranslationProviderBlock(...args) { return this.autoQueueCore.isRetainableAutoTranslationProviderBlock(...args); }
    discardAutoTranslationProviderWork(...args) { return this.autoQueueCore.discardAutoTranslationProviderWork(...args); }
    discardAutoTranslationItemWork(...args) { return this.autoQueueCore.discardAutoTranslationItemWork(...args); }
    getAutoTranslationItemProviderKey(...args) { return this.autoQueueCore.getAutoTranslationItemProviderKey(...args); }
    canStartAutoTranslationPrefetchRequest(...args) { return this.autoQueueCore.canStartAutoTranslationPrefetchRequest(...args); }
    isAutoTranslationPrefetchBatch(...args) { return this.autoQueueCore.isAutoTranslationPrefetchBatch(...args); }
    isAutoTranslationPrefetchItem(...args) { return this.autoQueueCore.isAutoTranslationPrefetchItem(...args); }
    isAutoTranslationVisibleItem(...args) { return this.autoQueueCore.isAutoTranslationVisibleItem(...args); }
    hasActiveVisibleAutoTranslationWork(...args) { return this.autoQueueCore.hasActiveVisibleAutoTranslationWork(...args); }
    hasVisibleAutoTranslationInFlight(...args) { return this.autoQueueCore.hasVisibleAutoTranslationInFlight(...args); }
    hasQueuedVisibleAutoTranslationWork(...args) { return this.autoQueueCore.hasQueuedVisibleAutoTranslationWork(...args); }
    takeAutoTranslationBatch(...args) { return this.autoQueueCore.takeAutoTranslationBatch(...args); }
    shouldDeferShortAutoTranslationItemForVisibleLong(...args) { return this.autoQueueCore.shouldDeferShortAutoTranslationItemForVisibleLong(...args); }
    hasReadyShortAutoTranslationCandidate(...args) { return this.autoQueueCore.hasReadyShortAutoTranslationCandidate(...args); }
    shouldRunAutoTranslationItemSingle(...args) { return this.autoQueueCore.shouldRunAutoTranslationItemSingle(...args); }
    isAutoTranslationPrefetchAllowed(...args) { return this.autoQueueCore.isAutoTranslationPrefetchAllowed(...args); }
    isAutoTranslationQueueItemReady(...args) { return this.autoQueueCore.isAutoTranslationQueueItemReady(...args); }
    isAutoTranslationTargetReady(...args) { return this.autoQueueCore.isAutoTranslationTargetReady(...args); }
    getAutoTranslateConcurrency(...args) { return this.autoQueueCore.getAutoTranslateConcurrency(...args); }
    getAutoTranslatePrefetchRange(...args) { return this.autoQueueCore.getAutoTranslatePrefetchRange(...args); }
    isAutoTranslationPrefetchConfigured(...args) { return this.autoQueueCore.isAutoTranslationPrefetchConfigured(...args); }
    isAutoTranslateEnabled(...args) { return this.autoQueueCore.isAutoTranslateEnabled(...args); }
    cancelAutoTranslationRuntimeWork(...args) { return this.autoQueueCore.cancelAutoTranslationRuntimeWork(...args); }
    getAutoTranslateBatchSize(...args) { return this.autoQueueCore.getAutoTranslateBatchSize(...args); }
    getAutoTranslateQueueLimit(...args) { return this.autoQueueCore.getAutoTranslateQueueLimit(...args); }
    getAutoTranslationRequestBatchSize(...args) { return this.autoQueueCore.getAutoTranslationRequestBatchSize(...args); }
    normalizeAutoTranslateConcurrency(...args) { return this.autoQueueCore.normalizeAutoTranslateConcurrency(...args); }
    normalizeAutoTranslateIntakeMode(...args) { return this.autoQueueCore.normalizeAutoTranslateIntakeMode(...args); }
    normalizeAutoTranslatePrefetchRange(...args) { return this.autoQueueCore.normalizeAutoTranslatePrefetchRange(...args); }
    normalizeChannelAutoTranslatePolicyMode(...args) { return this.autoQueueCore.normalizeChannelAutoTranslatePolicyMode(...args); }
    getCurrentChannelAutoTranslatePolicyMode(...args) { return this.autoQueueCore.getCurrentChannelAutoTranslatePolicyMode(...args); }
    getChannelAutoTranslatePolicyStorageKey(...args) { return this.autoQueueCore.getChannelAutoTranslatePolicyStorageKey(...args); }
    setCurrentChannelAutoTranslatePolicyMode(...args) { return this.autoQueueCore.setCurrentChannelAutoTranslatePolicyMode(...args); }
    getCurrentChannelAutoTranslatePolicy(...args) { return this.autoQueueCore.getCurrentChannelAutoTranslatePolicy(...args); }
    isCurrentChannelAutoTranslateAllowed(...args) { return this.autoQueueCore.isCurrentChannelAutoTranslateAllowed(...args); }
    isAutoTranslationRequestCurrent(...args) { return this.autoQueueCore.isAutoTranslationRequestCurrent(...args); }
    isAutoTranslationRenderRequestCurrent(...args) { return this.autoQueueCore.isAutoTranslationRenderRequestCurrent(...args); }
    isSameAutoTranslationRouteScope(...args) { return this.autoQueueCore.isSameAutoTranslationRouteScope(...args); }
    autoTranslateQueuedMessage(...args) { return this.autoQueueCore.autoTranslateQueuedMessage(...args); }
    autoTranslateQueuedBatch(...args) { return this.autoQueueCore.autoTranslateQueuedBatch(...args); }
    requeueAutoTranslationItem(...args) { return this.autoQueueCore.requeueAutoTranslationItem(...args); }
    enqueueAutoTranslationItem(...args) { return this.autoQueueCore.enqueueAutoTranslationItem(...args); }
    hasActiveAutoTranslationKey(...args) { return this.autoQueueCore.hasActiveAutoTranslationKey(...args); }
    pruneAutoTranslationActiveState(...args) { return this.autoQueueCore.pruneAutoTranslationActiveState(...args); }
    pruneAutoTranslationRenderPendingKeys(...args) { return this.autoQueueCore.pruneAutoTranslationRenderPendingKeys(...args); }
    getAutoTranslationRecentRenderKey(...args) { return this.autoQueueCore.getAutoTranslationRecentRenderKey(...args); }
    rememberRecentAutoTranslationRender(...args) { return this.autoQueueCore.rememberRecentAutoTranslationRender(...args); }
    getRecentAutoTranslationRender(...args) { return this.autoQueueCore.getRecentAutoTranslationRender(...args); }
    pruneRecentAutoTranslationRenders(...args) { return this.autoQueueCore.pruneRecentAutoTranslationRenders(...args); }
    createAutoTranslationInFlightToken(...args) { return this.autoQueueCore.createAutoTranslationInFlightToken(...args); }
    markAutoTranslationInFlightItem(...args) { return this.autoQueueCore.markAutoTranslationInFlightItem(...args); }
    heartbeatAutoTranslationInFlightItem(...args) { return this.autoQueueCore.heartbeatAutoTranslationInFlightItem(...args); }
    isAutoTranslationInFlightItemCurrent(...args) { return this.autoQueueCore.isAutoTranslationInFlightItemCurrent(...args); }
    isAutoTranslationInFlightTokenOwned(...args) { return this.autoQueueCore.isAutoTranslationInFlightTokenOwned(...args); }
    isAutoTranslationWorkCurrent(...args) { return this.autoQueueCore.isAutoTranslationWorkCurrent(...args); }
    finishAutoTranslationInFlightItem(...args) { return this.autoQueueCore.finishAutoTranslationInFlightItem(...args); }
    promoteQueuedAutoTranslationItem(...args) { return this.autoQueueCore.promoteQueuedAutoTranslationItem(...args); }
    makeRoomForAutoTranslationItem(...args) { return this.autoQueueCore.makeRoomForAutoTranslationItem(...args); }
    sortAutoTranslationQueue(...args) { return this.autoQueueCore.sortAutoTranslationQueue(...args); }
    withAutoTranslationPriority(...args) { return this.autoQueueCore.withAutoTranslationPriority(...args); }
    getAutoTranslationTargetPriority(...args) { return this.autoQueueCore.getAutoTranslationTargetPriority(...args); }
    cacheAutoTranslationResult(...args) { return this.autoQueueCore.cacheAutoTranslationResult(...args); }
    cacheAutoTranslationResultWithOptions(...args) { return this.autoQueueCore.cacheAutoTranslationResultWithOptions(...args); }
    hasCacheableAutoTranslationTarget(...args) { return this.autoQueueCore.hasCacheableAutoTranslationTarget(...args); }
    hasInvalidAutoTranslationTarget(...args) { return this.autoQueueCore.hasInvalidAutoTranslationTarget(...args); }
    shouldCacheAutoTranslationResultFromRequest(...args) { return this.autoQueueCore.shouldCacheAutoTranslationResultFromRequest(...args); }
    cacheAutoTranslationIdentityUpgrades(...args) { return this.autoQueueCore.cacheAutoTranslationIdentityUpgrades(...args); }
    getAutoTranslationTargetIdentityUpgrade(...args) { return this.autoQueueCore.getAutoTranslationTargetIdentityUpgrade(...args); }
    isAutoTranslationTargetIdentityCurrent(...args) { return this.autoQueueCore.isAutoTranslationTargetIdentityCurrent(...args); }
    markAutoTranslationFailureSafely(...args) { return this.autoQueueCore.markAutoTranslationFailureSafely(...args); }
    clearPendingAutoTranslationItemSafely(...args) { return this.autoQueueCore.clearPendingAutoTranslationItemSafely(...args); }
    clearPendingAutoTranslationItem(...args) { return this.autoQueueCore.clearPendingAutoTranslationItem(...args); }
    clearAutoTranslationFailure(...args) { return this.autoQueueCore.clearAutoTranslationFailure(...args); }
    markAutoTranslationFailure(...args) { return this.autoQueueCore.markAutoTranslationFailure(...args); }
    getAutoTranslationStorageErrorForItem(...args) { return this.autoQueueCore.getAutoTranslationStorageErrorForItem(...args); }
    isWeakAutoTranslationPrefetchFailure(...args) { return this.autoQueueCore.isWeakAutoTranslationPrefetchFailure(...args); }
    pruneAutoTranslationFailureMapSize(...args) { return this.autoQueueCore.pruneAutoTranslationFailureMapSize(...args); }
    shouldMarkAutoTranslationProviderFailureForItem(...args) { return this.autoQueueCore.shouldMarkAutoTranslationProviderFailureForItem(...args); }
    isProviderWideAutoTranslationPrefetchFailure(...args) { return this.autoQueueCore.isProviderWideAutoTranslationPrefetchFailure(...args); }
    markAutoTranslationProviderFailure(...args) { return this.autoQueueCore.markAutoTranslationProviderFailure(...args); }
    getAutoTranslationProviderFailure(...args) { return this.autoQueueCore.getAutoTranslationProviderFailure(...args); }
    isAutoTranslationProviderCoolingDown(...args) { return this.autoQueueCore.isAutoTranslationProviderCoolingDown(...args); }
    createAutoTranslationFailure(...args) { return this.autoQueueCore.createAutoTranslationFailure(...args); }
    rememberAutoTranslationFailureHistory(...args) { return this.autoQueueCore.rememberAutoTranslationFailureHistory(...args); }
    getAutoTranslationFailureHistoryCount(...args) { return this.autoQueueCore.getAutoTranslationFailureHistoryCount(...args); }
    isAutoTranslationFailureExpired(...args) { return this.autoQueueCore.isAutoTranslationFailureExpired(...args); }
    getAutoTranslationFailureRemainingMs(...args) { return this.autoQueueCore.getAutoTranslationFailureRemainingMs(...args); }
    isTerminalAutoTranslationFailure(...args) { return this.autoQueueCore.isTerminalAutoTranslationFailure(...args); }
    getAutoTranslationFailureTypeFromRecord(...args) { return this.autoQueueCore.getAutoTranslationFailureTypeFromRecord(...args); }
    getAutoTranslationFailure(...args) { return this.autoQueueCore.getAutoTranslationFailure(...args); }
    getAutoTranslationRetryAfter(...args) { return this.autoQueueCore.getAutoTranslationRetryAfter(...args); }
    getAutoTranslationFailureType(...args) { return this.autoQueueCore.getAutoTranslationFailureType(...args); }
    shouldShowAutoTranslationWarning(...args) { return this.autoQueueCore.shouldShowAutoTranslationWarning(...args); }
    isMajorAutoTranslationFailure(...args) { return this.autoQueueCore.isMajorAutoTranslationFailure(...args); }
    addAutoTranslationPendingTarget(...args) { return this.autoQueueCore.addAutoTranslationPendingTarget(...args); }
    sortAutoTranslationTargets(...args) { return this.autoQueueCore.sortAutoTranslationTargets(...args); }
    getAutoTranslationPendingTargets(...args) { return this.autoQueueCore.getAutoTranslationPendingTargets(...args); }
    consumeAutoTranslationTargets(...args) { return this.autoQueueCore.consumeAutoTranslationTargets(...args); }
    clearAutoTranslationPendingTargets(...args) { return this.autoQueueCore.clearAutoTranslationPendingTargets(...args); }
    scheduleAutoTranslationRetryScan(...args) { return this.autoQueueCore.scheduleAutoTranslationRetryScan(...args); }
    getLocalAutoTranslationMaxTokensForLength(...args) { return this.autoQueueCore.getLocalAutoTranslationMaxTokensForLength(...args); }

    // --- Delegators to AutoTranslationRequestPipeline (Phase 6 pre-step B: auto-translation scan work, request pipeline (batch, long-text, retries), request options and text eligibility policies.) ---
    scheduleCacheOnlyAutoTranslationScan(...args) { return this.autoRequestPipeline.scheduleCacheOnlyAutoTranslationScan(...args); }
    runCacheOnlyAutoTranslationScan(...args) { return this.autoRequestPipeline.runCacheOnlyAutoTranslationScan(...args); }
    queueAutoTranslateVisibleMessages(...args) { return this.autoRequestPipeline.queueAutoTranslateVisibleMessages(...args); }
    createAutoTranslationScanWork(...args) { return this.autoRequestPipeline.createAutoTranslationScanWork(...args); }
    processAutoTranslationScanCandidates(...args) { return this.autoRequestPipeline.processAutoTranslationScanCandidates(...args); }
    finishAutoTranslationScanWork(...args) { return this.autoRequestPipeline.finishAutoTranslationScanWork(...args); }
    evaluateAutoTranslationCandidate(...args) { return this.autoRequestPipeline.evaluateAutoTranslationCandidate(...args); }
    applyAutoTranslationDecision(...args) { return this.autoRequestPipeline.applyAutoTranslationDecision(...args); }
    shouldDeferLongAutoTranslationItem(...args) { return this.autoRequestPipeline.shouldDeferLongAutoTranslationItem(...args); }
    hasVisibleLongAutoTranslationInFlight(...args) { return this.autoRequestPipeline.hasVisibleLongAutoTranslationInFlight(...args); }
    getVisibleLongAutoTranslationInFlightCount(...args) { return this.autoRequestPipeline.getVisibleLongAutoTranslationInFlightCount(...args); }
    hasReadyVisibleLongAutoTranslationCandidate(...args) { return this.autoRequestPipeline.hasReadyVisibleLongAutoTranslationCandidate(...args); }
    isLongAutoTranslationItem(...args) { return this.autoRequestPipeline.isLongAutoTranslationItem(...args); }
    runAutoTranslationFallbackItems(...args) { return this.autoRequestPipeline.runAutoTranslationFallbackItems(...args); }
    requeueRemainingAutoTranslationFallbackItems(...args) { return this.autoRequestPipeline.requeueRemainingAutoTranslationFallbackItems(...args); }
    takeAutoTranslationFallbackQueue(...args) { return this.autoRequestPipeline.takeAutoTranslationFallbackQueue(...args); }
    runAutoTranslationBatchRetryItems(...args) { return this.autoRequestPipeline.runAutoTranslationBatchRetryItems(...args); }
    shouldFallbackAutoTranslationBatchRequestError(...args) { return this.autoRequestPipeline.shouldFallbackAutoTranslationBatchRequestError(...args); }
    buildPromptPolicyAutoTranslationPrompt(...args) { return this.autoRequestPipeline.buildPromptPolicyAutoTranslationPrompt(...args); }
    buildCompactLocalAutoTranslationPrompt(...args) { return this.autoRequestPipeline.buildCompactLocalAutoTranslationPrompt(...args); }
    buildLocalAutoTranslationUserMessage(...args) { return this.autoRequestPipeline.buildLocalAutoTranslationUserMessage(...args); }
    isLocalAutoTranslationOptions(...args) { return this.autoRequestPipeline.isLocalAutoTranslationOptions(...args); }
    buildPromptPolicyLongTextPrompt(...args) { return this.autoRequestPipeline.buildPromptPolicyLongTextPrompt(...args); }
    getAutoTranslationRequestOptionsForText(...args) { return this.autoRequestPipeline.getAutoTranslationRequestOptionsForText(...args); }
    getLongTextTranslationOptions(...args) { return this.autoRequestPipeline.getLongTextTranslationOptions(...args); }
    getLongTextMaxTokensForLength(...args) { return this.autoRequestPipeline.getLongTextMaxTokensForLength(...args); }
    isLongAutoTranslationText(...args) { return this.autoRequestPipeline.isLongAutoTranslationText(...args); }
    isUltraLongAutoTranslationText(...args) { return this.autoRequestPipeline.isUltraLongAutoTranslationText(...args); }
    getLongAutoTranslationChunkLength(...args) { return this.autoRequestPipeline.getLongAutoTranslationChunkLength(...args); }
    splitLongAutoTranslationText(...args) { return this.autoRequestPipeline.splitLongAutoTranslationText(...args); }
    getLongAutoTranslationChunkUnits(...args) { return this.autoRequestPipeline.getLongAutoTranslationChunkUnits(...args); }
    splitOversizedLongAutoTranslationUnit(...args) { return this.autoRequestPipeline.splitOversizedLongAutoTranslationUnit(...args); }
    runLongAutoTranslationTask(...args) { return this.autoRequestPipeline.runLongAutoTranslationTask(...args); }
    runLongAutoTranslationChunkManualRescue(...args) { return this.autoRequestPipeline.runLongAutoTranslationChunkManualRescue(...args); }
    runLongAutoTranslationSubchunkManualRescue(...args) { return this.autoRequestPipeline.runLongAutoTranslationSubchunkManualRescue(...args); }
    getLongTextChunkTranslationOptions(...args) { return this.autoRequestPipeline.getLongTextChunkTranslationOptions(...args); }
    runAutoTranslationModelAttempt(...args) { return this.autoRequestPipeline.runAutoTranslationModelAttempt(...args); }
    shouldSkipQuotedAutoTranslationCandidates(...args) { return this.autoRequestPipeline.shouldSkipQuotedAutoTranslationCandidates(...args); }
    getAutoTranslationOutputValidationOptions(...args) { return this.autoRequestPipeline.getAutoTranslationOutputValidationOptions(...args); }
    getAutoTranslationValidationPolicy(...args) { return this.autoRequestPipeline.getAutoTranslationValidationPolicy(...args); }
    getAutoTranslationOutputValidationResult(...args) { return this.autoRequestPipeline.getAutoTranslationOutputValidationResult(...args); }
    isHardInvalidAutoTranslationReason(...args) { return this.autoRequestPipeline.isHardInvalidAutoTranslationReason(...args); }
    isRenderableBestEffortAutoTranslation(...args) { return this.autoRequestPipeline.isRenderableBestEffortAutoTranslation(...args); }
    getBestEffortAutoTranslationQuality(...args) { return this.autoRequestPipeline.getBestEffortAutoTranslationQuality(...args); }
    isUsableResidualAutoTranslation(...args) { return this.autoRequestPipeline.isUsableResidualAutoTranslation(...args); }
    getRaisedAutoTranslationMaxTokens(...args) { return this.autoRequestPipeline.getRaisedAutoTranslationMaxTokens(...args); }
    withRaisedAutoTranslationMaxTokens(...args) { return this.autoRequestPipeline.withRaisedAutoTranslationMaxTokens(...args); }
    runAutoTranslationTask(...args) { return this.autoRequestPipeline.runAutoTranslationTask(...args); }
    runAutoTranslationTaskWithOptions(...args) { return this.autoRequestPipeline.runAutoTranslationTaskWithOptions(...args); }
    shouldRunLocalAutoTranslationRepairRetry(...args) { return this.autoRequestPipeline.shouldRunLocalAutoTranslationRepairRetry(...args); }
    getAutoTranslationRequestTimeoutMs(...args) { return this.autoRequestPipeline.getAutoTranslationRequestTimeoutMs(...args); }
    createFinalInvalidAutoTranslationError(...args) { return this.autoRequestPipeline.createFinalInvalidAutoTranslationError(...args); }
    createAutoTranslationStaleError(...args) { return this.autoRequestPipeline.createAutoTranslationStaleError(...args); }
    isAbandonedTranslationError(...args) { return this.autoRequestPipeline.isAbandonedTranslationError(...args); }
    runAutoTranslationStrictFallbackTask(...args) { return this.autoRequestPipeline.runAutoTranslationStrictFallbackTask(...args); }
    runAutoTranslationBatchTask(...args) { return this.autoRequestPipeline.runAutoTranslationBatchTask(...args); }
    getAutoTranslationOptions(...args) { return this.autoRequestPipeline.getAutoTranslationOptions(...args); }
    getAutoTranslationTargetLanguage(...args) { return this.autoRequestPipeline.getAutoTranslationTargetLanguage(...args); }
    isAutoTranslationStrictRetryEnabled(...args) { return this.autoRequestPipeline.isAutoTranslationStrictRetryEnabled(...args); }
    getAutoTranslationBatchGroupKey(...args) { return this.autoRequestPipeline.getAutoTranslationBatchGroupKey(...args); }
    getAutoTranslationBatchOptions(...args) { return this.autoRequestPipeline.getAutoTranslationBatchOptions(...args); }
    getAutoTranslationBatchRetryOptions(...args) { return this.autoRequestPipeline.getAutoTranslationBatchRetryOptions(...args); }
    parseAutoTranslationBatchOutput(...args) { return this.autoRequestPipeline.parseAutoTranslationBatchOutput(...args); }
    normalizeAutoTranslationBatchRows(...args) { return this.autoRequestPipeline.normalizeAutoTranslationBatchRows(...args); }
    getAutoTranslationRetryOptions(...args) { return this.autoRequestPipeline.getAutoTranslationRetryOptions(...args); }
    getAutoTranslationFinalFallbackOptions(...args) { return this.autoRequestPipeline.getAutoTranslationFinalFallbackOptions(...args); }
    getAutoTranslationOverrides(...args) { return this.autoRequestPipeline.getAutoTranslationOverrides(...args); }
    getAutoTranslationRequestSnapshot(...args) { return this.autoRequestPipeline.getAutoTranslationRequestSnapshot(...args); }
    getAutoTranslationTargetInstruction(...args) { return this.autoRequestPipeline.getAutoTranslationTargetInstruction(...args); }
    hasUndertranslatedAutoTranslationOutput(...args) { return this.autoRequestPipeline.hasUndertranslatedAutoTranslationOutput(...args); }
    getMinimumAutoTranslationTargetLetters(...args) { return this.autoRequestPipeline.getMinimumAutoTranslationTargetLetters(...args); }
    hasCollapsedAutoTranslationSentenceCoverage(...args) { return this.autoRequestPipeline.hasCollapsedAutoTranslationSentenceCoverage(...args); }
    hasMissingAutoTranslationLines(...args) { return this.autoRequestPipeline.hasMissingAutoTranslationLines(...args); }
    isMergedShortAutoTranslationLinesAcceptable(...args) { return this.autoRequestPipeline.isMergedShortAutoTranslationLinesAcceptable(...args); }
    getAutoTranslationLineWordCount(...args) { return this.autoRequestPipeline.getAutoTranslationLineWordCount(...args); }
    shouldPreserveAutoTranslationLineCount(...args) { return this.autoRequestPipeline.shouldPreserveAutoTranslationLineCount(...args); }
    isAutoTranslationLineUndercovered(...args) { return this.autoRequestPipeline.isAutoTranslationLineUndercovered(...args); }
    getTranslatableAutoTranslationSentenceChunks(...args) { return this.autoRequestPipeline.getTranslatableAutoTranslationSentenceChunks(...args); }
    getAutoTranslationCoverageAnchors(...args) { return this.autoRequestPipeline.getAutoTranslationCoverageAnchors(...args); }
    normalizeAutoTranslationCoverageAnchor(...args) { return this.autoRequestPipeline.normalizeAutoTranslationCoverageAnchor(...args); }
    hasAutoTranslationCoverageAnchors(...args) { return this.autoRequestPipeline.hasAutoTranslationCoverageAnchors(...args); }
    isMergedLongAutoTranslationAcceptable(...args) { return this.autoRequestPipeline.isMergedLongAutoTranslationAcceptable(...args); }
    getTranslatableAutoTranslationLines(...args) { return this.autoRequestPipeline.getTranslatableAutoTranslationLines(...args); }
    hasResidualAutoTranslationSourceText(...args) { return this.autoRequestPipeline.hasResidualAutoTranslationSourceText(...args); }
    hasSuspiciousResidualAutoTranslationForeignText(...args) { return this.autoRequestPipeline.hasSuspiciousResidualAutoTranslationForeignText(...args); }
    getAutoTranslationPrecheckSkipReason(...args) { return this.autoRequestPipeline.getAutoTranslationPrecheckSkipReason(...args); }
    computeAutoTranslationPrecheckSkipReason(...args) { return this.autoRequestPipeline.computeAutoTranslationPrecheckSkipReason(...args); }
    getAutoTranslationPrecheckSkipReasonFromCache(...args) { return this.autoRequestPipeline.getAutoTranslationPrecheckSkipReasonFromCache(...args); }
    cacheAutoTranslationPrecheckSkipReason(...args) { return this.autoRequestPipeline.cacheAutoTranslationPrecheckSkipReason(...args); }
    getAutoTranslationPrecheckSkipCacheKey(...args) { return this.autoRequestPipeline.getAutoTranslationPrecheckSkipCacheKey(...args); }
    pruneAutoTranslationPrecheckSkipCache(...args) { return this.autoRequestPipeline.pruneAutoTranslationPrecheckSkipCache(...args); }
    isAutoTranslationLinkOnlyText(...args) { return this.autoRequestPipeline.isAutoTranslationLinkOnlyText(...args); }
    isAutoTranslationCodeOnlyText(...args) { return this.autoRequestPipeline.isAutoTranslationCodeOnlyText(...args); }
    shouldAutoTranslateText(...args) { return this.autoRequestPipeline.shouldAutoTranslateText(...args); }
    isLowValueAutoTranslationShortText(...args) { return this.autoRequestPipeline.isLowValueAutoTranslationShortText(...args); }
    getManualLongTextWholePassOptions(...args) { return this.autoRequestPipeline.getManualLongTextWholePassOptions(...args); }
    runManualLongTextWholePass(...args) { return this.autoRequestPipeline.runManualLongTextWholePass(...args); }
    isLongAutoTranslationRequestOptions(...args) { return this.autoRequestPipeline.isLongAutoTranslationRequestOptions(...args); }
    withAutoTranslationCandidateIdentity(...args) { return this.autoRequestPipeline.withAutoTranslationCandidateIdentity(...args); }

    // --- Phase 6.0: read-only task-state view (storage unchanged) ---
    getAutoTranslationTaskSnapshot(cacheKey) { return this.taskState.getTaskSnapshot(cacheKey); }
    listAutoTranslationTaskKeys() { return this.taskState.listTrackedKeys(); }
    checkAutoTranslationTaskInvariants() { return this.taskState.checkInvariants(); }
};
