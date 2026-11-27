"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const { DISCORD_MESSAGE_NODE_SELECTOR, AUTO_TRANSLATION_QUEUE_TYPES, DIAGNOSTIC_REASON_CODES } = require("../constants");
const { convertDiscordMarkupToDisplayText, DISCORD_MARKUP_DISPLAY_TEXT_MEMO_MAX } = require("../intake/discord-markup");
const { getEmojiNeutralTextLength } = require("../intake/emoji-text");

class DiscordMessageExtractorController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    injectMessageButtons(context = this.plugin.createScanContext()) {
        const messageNodes = context.messageNodes;
        messageNodes.forEach(messageNode => this.plugin.injectMessageButton(messageNode, context));
    },

    injectMessageButton(messageNode, context = null) {
        if (!this.plugin.shouldInjectMessageButtons()) return false;
        if (!messageNode || messageNode.isConnected === false) return false;
        const contents = this.plugin.getMessageContentElements(messageNode, context);
        if (!contents.length) return false;

        let injected = false;
        const nextTitle = this.plugin.t("translateTitleAttr", {
            targetLanguage: this.plugin.getDisplayLanguage(this.plugin.settings.translation.targetLanguage)
        });
        for (const content of contents) {
            const text = this.plugin.getCachedElementText(content, context);
            if (!this.plugin.hasTranslatableMessageText(text)) {
                content.querySelector?.(":scope > .dait-message-button")?.remove?.();
                continue;
            }
            injected = true;

            /** @type {any} */
            let button = content.querySelector?.(":scope > .dait-message-button");
            const created = !button;
            if (!button) {
                button = document.createElement("button");
                button.type = "button";
                button.className = this.plugin.getMessageButtonClassName();
                button.textContent = this.plugin.t("translateButton");
                button.title = nextTitle;
                button.setAttribute?.("aria-label", nextTitle);
                button.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const currentContent = (content?.isConnected && messageNode?.contains?.(content) !== false)
                        ? content
                        : this.plugin.getMessageContentElement(messageNode);
                    if (!currentContent) {
                        this.plugin.showToast(this.plugin.t("messageMissing"), "error");
                        return;
                    }
                    this.plugin.translateMessage(messageNode, currentContent, button);
                });
            }
            else {
                if (button.title !== nextTitle) button.title = nextTitle;
                if (button.getAttribute?.("aria-label") !== nextTitle) button.setAttribute?.("aria-label", nextTitle);
            }
            this.plugin.applyMessageButtonVisibilityToButton(button, content || messageNode);

            if (created || button.parentElement !== content || this.hasNonPluginSiblingAfter(button)) {
                content.appendChild(button);
            }
        }

        if (!injected) {
            this.plugin.nonTranslatableMessageCache?.set?.(messageNode, true);
            return false;
        }
        this.plugin.nonTranslatableMessageCache?.delete?.(messageNode);
        return true;
    },

    hasNonPluginSiblingAfter(node) {
        for (let sibling = node?.nextSibling; sibling; sibling = sibling.nextSibling) {
            if (sibling.nodeType === 3) {
                if (String(sibling.nodeValue || "").trim()) return true;
                continue;
            }
            if (sibling.nodeType === 1 && !this.plugin.isOwnPluginElement(sibling) && !this.plugin.isMessageChromeOnlyElement(sibling)) return true;
        }
        return false;
    },

    getMessageContentElement(messageNode, context = null) {
        if (context?.contentByMessage?.has(messageNode)) return context.contentByMessage.get(messageNode);

        const candidates = this.getMessageContentCandidates(messageNode, context);
        let firstNonEmpty = null;
        for (const candidate of candidates) {
            const text = this.plugin.getCachedElementText(candidate, context);
            if (!text) continue;
            if (!firstNonEmpty) firstNonEmpty = candidate;
            if (this.plugin.hasTranslatableMessageText(text)) {
                context?.contentByMessage?.set(messageNode, candidate);
                return candidate;
            }
        }

        context?.contentByMessage?.set(messageNode, firstNonEmpty);
        return firstNonEmpty;
    },

    resolveMessageContentForTarget(target, messageNode = null, context = null) {
        const element = target?.nodeType === 3 ? target.parentElement : target;
        const resolvedMessage = messageNode || element?.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || null;
        if (!resolvedMessage) return null;

        const clickedLine = element?.closest?.(".dait-translation-line");
        if (clickedLine) {
            const lineContent = this.plugin.getTranslationContentForLine?.(clickedLine);
            if (lineContent && resolvedMessage.contains?.(lineContent) !== false) return lineContent;
        }

        const candidates = this.getMessageContentCandidates(resolvedMessage, context);
        if (candidates.length > 1 && element) {
            const matching = candidates.filter(candidate => candidate === element || candidate.contains?.(element));
            const innermost = matching.find(candidate => !matching.some(other => other !== candidate && candidate.contains?.(other)))
                || matching[0]
                || null;
            if (innermost && this.plugin.getCachedElementText(innermost, context)) return innermost;
        }

        return this.plugin.getMessageContentElement(resolvedMessage, context);
    },

    getMessageContentElements(messageNode, context = null) {
        if (context?.contentElementsByMessage?.has(messageNode)) return context.contentElementsByMessage.get(messageNode);

        const candidates = this.getMessageContentCandidates(messageNode, context);

        const elements = candidates
            .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index)
            .filter(candidate => !allContainsOtherCandidate.call(this.plugin, candidate, candidates))
            .filter(candidate => Boolean(this.plugin.getCachedElementText(candidate, context)));

        const result = elements.length
            ? elements
            : [this.plugin.getMessageContentElement(messageNode, context)].filter(Boolean);
        context?.contentElementsByMessage?.set(messageNode, result);
        return result;

        function allContainsOtherCandidate(candidate, all) {
            return all.some(other => other !== candidate && candidate.contains?.(other) && !this.isForeignTranslationElement(other));
        }
    },

    getMessageContentCandidates(messageNode, context = null) {
        if (context?.contentCandidatesByMessage?.has(messageNode)) {
            return context.contentCandidatesByMessage.get(messageNode);
        }
        const primary = [...(messageNode?.querySelectorAll?.("[class*='messageContent']") || [])]
            .filter(candidate => this.isUsableMessageContentCandidate(candidate));
        const fallback = primary.length
            ? []
            : [...(messageNode?.querySelectorAll?.("[class*='markup']") || [])]
                .filter(candidate => this.isUsableMessageContentCandidate(candidate));
        const candidates = [...new Set([...primary, ...fallback])];
        if (!candidates.length && messageNode?.content && this.isUsableMessageContentCandidate(messageNode.content)) candidates.push(messageNode.content);
        context?.contentCandidatesByMessage?.set(messageNode, candidates);
        return candidates;
    },

    isUsableMessageContentCandidate(candidate) {
        if (!candidate) return false;
        if (this.plugin.isReplyPreviewElement(candidate)) return false;
        if (candidate.closest?.(".dait-translation-box, .dait-translation-line, [class*='embed'], [class*='attachment']")) return false;
        if (this.isInsideForeignTranslationElement(candidate)) return false;
        return true;
    },

    isReplyPreviewElement(element) {
        return Boolean(element?.closest?.("[class*='repliedMessage'], [class*='repliedTextPreview'], [class*='quotedChatMessage']"));
    },

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
            "[id*='_translate']"
        ];
    },

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
    },

    isForeignTranslationElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.classList?.contains?.("dait-translation-line") || element.classList?.contains?.("dait-translation-box")) return true;
        // Links, mentions, emoji and spoilers are message content: a URL, title or emoji name is what
        // the author wrote, whatever words it contains.
        const tag = String(element.tagName || "").toLowerCase();
        if (tag === "a" || tag === "img") return false;

        const identityText = this.getElementForeignTranslationIdentityText(element);
        const normalized = identityText.replace(/notranslate/gi, "");
        if (/(translation|translated|translator|deepl|google[-_\s]?translate|译文|翻译|已翻译)/i.test(normalized)) return true;
        if (/(^|[^a-z])translate([^a-z]|$)/i.test(normalized)) return true;

        if (tag === "button") {
            const label = this.getElementControlLabel(element);
            return /(translate|translation|show original|original text|翻译|译文|查看原文|显示原文)/i.test(label);
        }
        return false;
    },

    // Translator plugins and browser translators mark their own nodes through class names, ids and
    // data-* attribute names. Labels, titles and attribute values can carry message text, so they are
    // not read.
    getElementForeignTranslationIdentityText(element) {
        const className = typeof element.className === "string" ? element.className : element.className?.baseVal || "";
        const parts = [className, element.id || ""];
        Object.keys(element.dataset || {}).forEach(key => {
            // Our own data-dait-* state on message elements is not a translator marker.
            if (/^dait[A-Z]/.test(key) && key !== "daitIgnoreTranslation") return;
            parts.push(`data-${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`);
        });
        return parts.filter(Boolean).join(" ");
    },

    getElementControlLabel(element) {
        return [
            element?.getAttribute?.("aria-label"),
            element?.getAttribute?.("data-tooltip-text"),
            element?.getAttribute?.("title"),
            element?.textContent
        ].filter(Boolean).join(" ").toLowerCase();
    },

    createHistoryBackfillScanContext(messageNodes = [], context = this.plugin.createScanContext({ messageNodes: [] })) {
        context.dirtyOnly = false;
        context.messageNodes = [...new Set(messageNodes || [])]
            .filter(node => node?.isConnected !== false);
        this.plugin.rememberScanRangeElements(context.messageNodes, context);
        context.messageNodes.forEach(messageNode => {
            try {
                this.plugin.rememberScanRangeElements(this.plugin.getMessageContentElements(messageNode, context), context);
                this.plugin.rememberScanRangeElements(this.plugin.getReplyPreviewElements(messageNode), context);
            }
            catch {}
        });
        return context;
    },

    requestExplicitHistoryBackfill(options = {}) {
        const startedAt = Date.now();
        const limit = this.plugin.normalizeHistoryBackfillLimit(options.limit ?? this.plugin.settings.ui?.historyBackfillLimit);
        const result = {
            requested: 0,
            candidates: 0,
            eligible: 0,
            enqueued: 0,
            skipped: 0,
            blocked: 0
        };
        if (this.plugin.settings.ui?.historyBackfillEnabled !== true) {
            this.plugin.logDiagnostic("auto.history-backfill", "disabled", {
                ...this.plugin.getDiagnosticBaseMeta("auto", "history", "history-disabled"),
                limit
            });
            return result;
        }
        if (!this.plugin.isAutoTranslateEnabled()) {
            this.plugin.logDiagnostic("auto.history-backfill", "blocked", {
                ...this.plugin.getDiagnosticBaseMeta("auto", "history", DIAGNOSTIC_REASON_CODES.AUTO_DISABLED || "auto-disabled"),
                limit
            });
            return result;
        }
        if (!this.plugin.hasUsableApiConfig("translation")) {
            this.plugin.logDiagnostic("auto.history-backfill", "blocked", {
                ...this.plugin.getDiagnosticBaseMeta("auto", "history", "missing-api"),
                limit
            });
            return result;
        }

        const nodes = Array.isArray(options.messageNodes)
            ? options.messageNodes
            : this.plugin.getScanContextMessageNodes({});
        const scanSliceSize = 20;
        const scanBudget = 500;
        const scanNodes = [...new Set((options.context?.messageNodes || nodes).slice(0, scanBudget))];
        const context = options.context ? { ...options.context } : this.plugin.createScanContext({ messageNodes: [] });
        const requestOptions = this.plugin.getAutoTranslationOptions();
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
            queueLimit: this.plugin.getAutoTranslateQueueLimit(),
            queued: 0
        };
        const scanStats = {
            __scanState: scanState,
            seen: 0,
            eligible: 0,
            enqueued: 0,
            blocked: 0,
            skippedLanguage: 0,
            skippedCurrent: 0,
            failures: 0
        };
        result.requested = nodes.length;
        for (let offset = 0; offset < scanNodes.length && scanStats.enqueued < limit; offset += scanSliceSize) {
            const slice = scanNodes.slice(offset, offset + scanSliceSize);
            if (options.context) context.messageNodes = slice;
            else this.createHistoryBackfillScanContext(slice, context);
            for (const candidate of this.plugin.createAutoTranslationCandidates(context)) {
                if (candidate?.targetKind !== "message") continue;
                scanStats.seen++;
                candidate.daitHistoryRequest = true;
                candidate.daitPrefetchRequest = false;
                const decision = this.plugin.evaluateAutoTranslationCandidate(candidate, scanState);
                this.plugin.applyAutoTranslationDecision(candidate, decision, scanStats);
                if (scanStats.enqueued >= limit) break;
            }
        }

        result.candidates = scanStats.seen;
        result.eligible = Number(scanStats.eligible || 0);
        result.enqueued = Number(scanStats.enqueued || 0);
        result.skipped = Number(scanStats.skippedLanguage || 0) + Number(scanStats.skippedCurrent || 0);
        result.blocked = Number(scanStats.blocked || 0) + Number(scanStats.failures || 0);
        this.plugin.logDiagnostic("auto.history-backfill", result.enqueued ? "queued" : "none", {
            ...this.plugin.getDiagnosticBaseMeta("auto", "history", result.enqueued ? DIAGNOSTIC_REASON_CODES.ENQUEUED : "history-none"),
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
        if (result.enqueued) this.plugin.drainAutoTranslationQueue();
        return result;
    },

    runExplicitHistoryBackfillFromUi(button = null, options = {}) {
        const idleLabel = this.plugin.t("historyBackfillRun");
        const startedAt = Date.now();
        if (button) this.plugin.setButtonBusy(button, true, this.plugin.t("historyBackfillRunning"));
        try {
            const result = this.plugin.requestExplicitHistoryBackfill({
                limit: this.plugin.settings.ui?.historyBackfillLimit,
                source: options.source || "ui"
            });
            this.plugin.logDiagnostic("auto.history-backfill.ui", result?.enqueued ? "queued" : "none", {
                ...this.plugin.getDiagnosticBaseMeta("auto", "history", result?.enqueued ? DIAGNOSTIC_REASON_CODES.ENQUEUED : "history-none"),
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
                this.plugin.showToast(this.plugin.t("historyBackfillQueued", { count: result.enqueued }), "success");
            }
            else {
                this.plugin.showToast(this.plugin.t("historyBackfillNoWork"), "info");
            }
            return result;
        }
        catch (error) {
            this.plugin.logDiagnostic("auto.history-backfill.ui", "error", {
                ...this.plugin.getDiagnosticBaseMeta("auto", "history", "history-error"),
                source: options.source || "ui",
                errorText: this.plugin.formatError(error),
                ms: Date.now() - startedAt
            });
            this.plugin.showToast(this.plugin.formatError(error), "error");
            return null;
        }
        finally {
            if (button) this.plugin.setButtonBusy(button, false, idleLabel);
        }
    },

    createAutoTranslationCandidates(context = this.plugin.createScanContext()) {
        const mode = this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui?.autoTranslateIntakeMode);
        const domCandidates = this.createDomAutoTranslationCandidates(context);
        const bdfdbAvailable = this.plugin.isBdfdbMessageIntakeAvailable();
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
            this.plugin.logAutoTranslationIntakeState("dom", intake);
            return domCandidates;
        }

        if (!bdfdbAvailable) {
            intake.reason = "bdfdb-unavailable";
            context.autoTranslateIntake = intake;
            this.plugin.logAutoTranslationIntakeState(mode === "bdfdb" ? "fallback" : "dom", intake);
            return domCandidates;
        }

        const enhanced = this.createBdfdbAutoTranslationCandidates(context, domCandidates);
        intake.source = "bdfdb";
        intake.bdfdbEnhanced = enhanced.filter(candidate => candidate?.source === "bdfdb").length;
        context.autoTranslateIntake = intake;
        this.plugin.logAutoTranslationIntakeState("bdfdb", intake);
        return enhanced;
    },

    createDomAutoTranslationCandidates(context = this.plugin.createScanContext()) {
        const candidates = [];
        for (const messageNode of context?.messageNodes || []) {
            candidates.push(...this.plugin.createDomAutoTranslationCandidatesForMessage(messageNode, context));
        }
        return candidates;
    },

    createDomAutoTranslationCandidatesForMessage(messageNode, context = null) {
        const candidates = [];
        for (const target of this.plugin.getAutoTranslationTargets(messageNode, context)) {
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
    },

    createBdfdbAutoTranslationCandidates(context = this.plugin.createScanContext(), domCandidates = this.createDomAutoTranslationCandidates(context)) {
        return domCandidates.map(candidate => {
            const meta = this.getBdfdbAutoTranslationCandidateMeta(candidate, context);
            if (!meta?.messageId) return candidate;
            // fullContent is display text (getDiscordStoreMessageText). It becomes the request text
            // only; the identity, the line and every stale-DOM guard use the text on screen (domText).
            const fullContent = this.normalizeExtractedText(meta.fullContent || "");
            const useFullContent = this.isStoreFullRequestText(fullContent, candidate.text);
            const text = useFullContent ? fullContent : candidate.text;
            return this.createAutoTranslationCandidate({
                ...candidate,
                ...meta,
                text,
                domText: candidate.text,
                fullContent,
                sourceTextKind: useFullContent ? "store-full" : "dom",
                source: fullContent ? "bdfdb" : candidate.source
            });
        });
    },

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
    },

    isBdfdbMessageIntakeAvailable() {
        if (this.getBdfdbRuntime()?.available) return true;
        const channelId = this.plugin.messageTracker.getRouteIds?.().channelId || "";
        if (!channelId) return false;
        return Boolean(this.plugin.getDiscordMessageStore());
    },

    getBdfdbRuntime() {
        /** @type {any} */
        const win = typeof window !== "undefined" ? window : null;
        /** @type {any} */
        const g = typeof globalThis !== "undefined" ? globalThis : null;
        const root = win?.BDFDB_Global || g?.BDFDB_Global || null;
        if (!root || (!root.loaded && !root.started)) return null;
        const bdfdb = root.BDFDB || root.BDFDB_Global || root.Library || root;
        return { root, bdfdb, available: true };
    },

    getBdfdbAutoTranslationCandidateMeta(candidate = {}, context = null) {
        const route = this.plugin.messageTracker.getRouteIds?.() || {};
        const nodeIds = this.plugin.messageTracker.getNodeMessageIds?.(candidate.messageNode) || {};
        const base = {
            guildId: nodeIds.guildId || route.guildId || "",
            channelId: nodeIds.channelId || route.channelId || "",
            messageId: nodeIds.messageId || "",
            authorId: this.plugin.messageTracker.getAuthorId?.(candidate.messageNode) || "",
            timestamp: this.plugin.messageTracker.getTimestamp?.(candidate.messageNode) || ""
        };
        base.messageIdentity = this.createStructuredAutoTranslationMessageIdentity({ ...candidate, ...base })
            || candidate.messageIdentity;
        if (candidate.targetKind !== "message") return base;

        const storeSnapshot = this.getBdfdbStoreSnapshot(base.channelId, context);
        const storeMessage = this.findBdfdbStoreMessageForCandidate(candidate, base, storeSnapshot);
        if (!storeMessage) return base;

        return {
            ...base,
            guildId: base.guildId || this.plugin.messageTracker.getStoreMessageGuildId(storeMessage),
            messageId: base.messageId || this.plugin.messageTracker.getStoreMessageId(storeMessage),
            authorId: this.plugin.messageTracker.getStoreMessageAuthorId(storeMessage) || base.authorId,
            timestamp: this.plugin.messageTracker.getStoreMessageTimestamp(storeMessage) || base.timestamp,
            fullContent: this.getDiscordStoreMessageText(storeMessage)
        };
    },

    getBdfdbStoreSnapshot(channelId, context = null) {
        const normalizedChannelId = String(channelId || "").trim();
        if (!normalizedChannelId) return { messages: [], byId: new Map() };
        if (context && !context.bdfdbStoreByChannel) context.bdfdbStoreByChannel = new Map();
        if (context?.bdfdbStoreByChannel?.has(normalizedChannelId)) {
            return context.bdfdbStoreByChannel.get(normalizedChannelId);
        }
        const messages = this.plugin.getBdfdbMessageStoreMessages(normalizedChannelId)
            .filter(message => this.plugin.messageTracker.getStoreMessageChannelId(message) === normalizedChannelId);
        const byId = new Map();
        messages.forEach(message => {
            const id = String(this.plugin.messageTracker.getStoreMessageId(message) || "").trim();
            if (id && !byId.has(id)) byId.set(id, message);
        });
        const snapshot = { messages, byId };
        context?.bdfdbStoreByChannel?.set(normalizedChannelId, snapshot);
        return snapshot;
    },

    findBdfdbStoreMessageForCandidate(candidate = {}, base = {}, snapshot = null) {
        const channelId = String(base.channelId || this.plugin.messageTracker.getRouteIds?.().channelId || "").trim();
        const normalizedText = this.plugin.messageTracker.normalizeComparableText(candidate.text);
        if (!channelId || !normalizedText) return null;
        const storeSnapshot = snapshot || this.getBdfdbStoreSnapshot(channelId);
        const messageId = String(base.messageId || "").trim();
        if (messageId) {
            const exact = storeSnapshot.byId?.get?.(messageId) || null;
            if (this.plugin.messageTracker.getStoreMessageId(exact) !== messageId
                || this.plugin.messageTracker.getStoreMessageChannelId(exact) !== channelId) return null;
            return this.plugin.isManualTranslationSourceCompatible(this.getDiscordStoreMessageText(exact), candidate.text) ? exact : null;
        }

        const messages = storeSnapshot.messages || [];
        const authorId = String(base.authorId || "");
        const timestamp = base.timestamp || "";
        const matches = messages.filter(message => {
            if (this.plugin.messageTracker.getStoreMessageChannelId(message) !== channelId || !this.plugin.messageTracker.getStoreMessageId(message)) return false;
            if (authorId && String(this.plugin.messageTracker.getStoreMessageAuthorId(message) || "") !== authorId) return false;
            if (timestamp && !this.plugin.messageTracker.isStoreTimestampMatch(timestamp, this.plugin.messageTracker.getStoreMessageTimestamp(message))) return false;
            return this.plugin.messageTracker.normalizeComparableText(this.getDiscordStoreMessageText(message)).includes(normalizedText);
        });
        if (matches.length !== 1) return null;
        const [match] = matches;
        return authorId || timestamp || this.plugin.messageTracker.isStoreCandidateNeighborAnchored(candidate.messageNode, match, messages)
            ? match
            : null;
    },

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
                this.plugin.warnSanitized("Failed to read BDFDB MessageStore", error);
            }
        }
        return this.plugin.getDiscordMessageStoreMessages(channelId);
    },

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
    },

    // What a target shows on screen. A store-full target requests fuller MessageStore text
    // (target.text), but its message identity, its line's source signature and every stale-DOM
    // guard use this text.
    getAutoTranslationTargetDomText(target) {
        return String(target?.domText || target?.text || "");
    },

    isAutoTranslationTargetDomTextCurrent(target) {
        return this.plugin.getElementText(target?.content, target?.textOptions) === this.getAutoTranslationTargetDomText(target);
    },

    isEditableTextbox(textbox) {
        if (!textbox || textbox.isConnected === false) return false;
        if (textbox.disabled === true || textbox.readOnly === true) return false;
        const contentEditable = String(textbox.getAttribute?.("contenteditable") ?? textbox.contentEditable ?? "").toLowerCase();
        if (contentEditable === "false") return false;
        const ariaDisabled = String(textbox.getAttribute?.("aria-disabled") || "").toLowerCase();
        if (ariaDisabled === "true") return false;
        const ariaReadOnly = String(textbox.getAttribute?.("aria-readonly") || "").toLowerCase();
        if (ariaReadOnly === "true") return false;
        return true;
    },

    getTextbox() {
        if (typeof document === "undefined") return null;
        const selector = "[role='textbox'][data-slate-editor='true'], [role='textbox'][contenteditable='true']";
        const all = typeof document.querySelectorAll === "function"
            ? [...(document.querySelectorAll(selector) || [])]
            : [];
        if (all.length) {
            return all.find(candidate => this.isEditableTextbox(candidate)) || null;
        }
        const single = document.querySelector?.(selector) || null;
        return this.isEditableTextbox(single) ? single : null;
    },

    getActiveTextbox() {
        if (typeof document === "undefined") return null;
        const active = document.activeElement;
        if (!active) return null;

        const textbox = active.closest?.("[role='textbox'][data-slate-editor='true'], [role='textbox'][contenteditable='true']");
        if (textbox && this.isEditableTextbox(textbox)) return textbox;

        const fallback = this.getTextbox();
        if (fallback?.contains?.(active)) return fallback;
        return null;
    },

    getElementText(element, options = {}) {
        if (!element) return "";

        const includeReplyPreview = Boolean(options?.includeReplyPreview);
        const cacheKey = includeReplyPreview ? "withReply" : "message";
        const cachedText = this.getElementTextCacheValue(element, cacheKey);
        if (cachedText !== null) return cachedText;
        const excludedSelectors = [
            ".dait-message-button",
            ".dait-polish-button",
            ".dait-polish-preset-button",
            ".dait-public-bilingual-button",
            ".dait-polish-restore-button",
            ".dait-input-action-menu-button",
            ".dait-input-action-menu",
            ".dait-polish-preset-menu",
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

        // While the cache holds entries saved before 0.4.0, which read no standard emoji, the text as those
        // versions read it is remembered for their lookups.
        const emojiTrace = this.plugin.hasLegacyTranslationCacheEntries() ? { parts: null, emoji: new Set() } : null;
        const directText = this.extractElementTextWithoutClone(element, excludedSelectors, emojiTrace);
        if (directText !== null) {
            const normalized = this.normalizeExtractedText(directText);
            if (emojiTrace?.emoji.size) {
                this.plugin.rememberPreEmojiSourceText(normalized, this.normalizeExtractedText(emojiTrace.parts.filter((part, index) => !emojiTrace.emoji.has(index)).join("")));
            }
            this.setElementTextCacheValue(element, cacheKey, normalized);
            return normalized;
        }

        const clone = element.cloneNode?.(true);
        if (!clone) return this.normalizeExtractedText(element.textContent || "");
        clone.querySelectorAll?.(excludedSelectors.join(",")).forEach(node => node.remove());

        if (typeof document !== "undefined") {
            clone.querySelectorAll?.("img[alt]").forEach(image => {
                const alt = this.getExtractedImageAltText(image);
                if (!alt) return;
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
    },

    getElementTextCacheValue(element, cacheKey) {
        if (!this.isElementTextCacheEligible(element)) return null;
        const record = this.plugin.elementTextCache?.get?.(element);
        if (!record || !Object.prototype.hasOwnProperty.call(record, cacheKey)) return null;
        return String(record[cacheKey] || "");
    },

    setElementTextCacheValue(element, cacheKey, value) {
        if (!this.isElementTextCacheEligible(element)) return;
        const record = this.plugin.elementTextCache.get(element) || {};
        record[cacheKey] = String(value || "");
        this.plugin.elementTextCache.set(element, record);
    },

    isElementTextCacheEligible(element) {
        if (!this.plugin.elementTextCache?.get || !element || element.nodeType !== 1 || element.isConnected === false) return false;
        return Boolean(this.plugin.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR));
    },

    // A message of standard emoji alone reads as text now, but there is nothing to translate in it.
    hasTranslatableMessageText(text) {
        return /[\p{L}\p{N}]/u.test(String(text || ""));
    },

    // Discord draws emoji as images: custom emoji carry ":name:" as alt text, standard emoji the
    // emoji itself. Both are part of what the message says; other images are not text.
    getExtractedImageAltText(image) {
        const alt = String(image?.getAttribute?.("alt") || "").trim();
        if (!alt) return "";
        if (/^:.+:$/.test(alt)) return alt;
        if (/^[\p{Extended_Pictographic}\p{Emoji_Component}\p{Regional_Indicator}\u200d\ufe0e\ufe0f\u20e3]+$/u.test(alt)
            && /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(alt)) return alt;
        return "";
    },

    // emojiTrace (optional): receives the parts and the indexes of the standard emoji among them.
    extractElementTextWithoutClone(element, excludedSelectors = [], emojiTrace = null) {
        if (!element?.childNodes || typeof element.childNodes[Symbol.iterator] !== "function") return null;
        const blockedSelector = excludedSelectors.filter(Boolean).join(",");
        const blockTags = new Set(["ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"]);
        const parts = [];
        /** @type {Array<{ node?: any, root?: boolean, separator?: string }>} */
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
                const alt = this.getExtractedImageAltText(node);
                if (alt && emojiTrace && !/^:.+:$/.test(alt)) emojiTrace.emoji.add(parts.length);
                if (alt) parts.push(` ${alt} `);
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
        if (emojiTrace) emojiTrace.parts = parts;
        return parts.join("");
    },

    getElementRawText(element, options = {}) {
        if (!element) return "";

        const includeReplyPreview = Boolean(options?.includeReplyPreview);
        const excludedSelectors = [
            ".dait-message-button",
            ".dait-polish-button",
            ".dait-polish-preset-button",
            ".dait-public-bilingual-button",
            ".dait-polish-restore-button",
            ".dait-input-action-menu-button",
            ".dait-input-action-menu",
            ".dait-polish-preset-menu",
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
            return this.plugin.normalizeDraftRawText(element.value ?? element.textContent ?? "");
        }
        return this.plugin.normalizeDraftRawText(this.readComposerDomText(element, excludedSelectors.filter(Boolean).join(",")));
    },

    // One reader for the draft snapshot, the stale check and write verification. Slate renders each
    // line as a block element; blocks are joined with "\n". Void inlines (mentions, emoji) become the
    // Discord token they stand for when their Slate node is reachable, otherwise their visible text.
    readComposerDomText(root, blockedSelector = "") {
        const lines = [];
        if (this.collectSlateComposerLines(root, blockedSelector, lines, false)) return lines.join("\n");
        return this.readComposerInlineText(root, blockedSelector, { blockBreaks: true });
    },

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
                    // Discord drops the "> " marker from a blockQuote's text, so a leading ">" is content.
                    lines.push(childQuoted ? `> ${text}` : text);
                }
                continue;
            }
            if (slateNode || child.getAttribute?.("data-slate-inline") === "true" || child.getAttribute?.("data-slate-leaf") === "true") continue;
            if (this.collectSlateComposerLines(child, blockedSelector, lines, quoted)) found = true;
        }
        return found;
    },

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
    },

    isComposerReadExcluded(node, blockedSelector = "") {
        let excluded = false;
        try { excluded = Boolean(blockedSelector && node.matches?.(blockedSelector)); }
        catch {}
        return excluded || this.isForeignTranslationElement(node);
    },

    serializeSlateVoidElement(node, blockedSelector = "") {
        const token = this.serializeSlateElementToken(this.getSlateElementFromDom(node));
        if (token !== null) return token;
        const image = this.findComposerVoidImage(node);
        const imageText = image ? this.getComposerImageText(image, true) : "";
        if (imageText) return imageText;
        const label = [...(node.childNodes || [])].map(child => this.readComposerInlineText(child, blockedSelector)).join("");
        if (label) return label;
        return String(node.textContent || "").replace(/[\uFEFF\u200b]/g, "");
    },

    findComposerVoidImage(node) {
        for (const child of node?.childNodes || []) {
            if (child?.nodeType !== 1 || child.getAttribute?.("data-slate-spacer") === "true") continue;
            if (String(child.tagName || "").toUpperCase() === "IMG") return child;
            const nested = this.findComposerVoidImage(child);
            if (nested) return nested;
        }
        return null;
    },

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
    },

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
    },

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
        if (/timestamp/i.test(type) || element.parsed?.full) {
            const full = String(element.parsed?.full || element.raw || "").trim();
            if (/^<t:-?\d{1,12}(?::[tTdDfFR])?>$/.test(full)) return full;
            const ts = element.timestamp ?? element.parsed?.timestamp;
            const style = String(element.style ?? element.parsed?.style ?? "").trim();
            if (/^-?\d{1,12}$/.test(String(ts ?? "").trim())) {
                return style && /^[tTdDfFR]$/.test(style) ? `<t:${String(ts).trim()}:${style}>` : `<t:${String(ts).trim()}>`;
            }
        }
        const commandId = id(element.commandId ?? element.command?.id);
        const commandName = String(element.commandName ?? element.command?.displayName ?? element.command?.name ?? "").trim();
        if (commandId && commandName && !/[<>:\n]/.test(commandName)) {
            return `</${commandName}:${commandId}>`;
        }
        return null;
    },

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
    },

    normalizeExtractedText(text) {
        return String(text || "")
            .replace(/\u200b/g, "")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map(line => line.replace(/[ \t\f\v]+/g, " ").trim())
            .filter(Boolean)
            .join("\n")
            .trim();
    },

    getDiscordMessageStoreMessages(channelId) {
        const store = this.plugin.getDiscordMessageStore();
        if (!store || !channelId) return [];
        try {
            const messages = (typeof store.getMessages === "function" && store.getMessages(channelId))
                || (typeof store.getMessagesForChannel === "function" && store.getMessagesForChannel(channelId));
            return this.extractDiscordMessageStoreCollection(messages);
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to read Discord MessageStore", error);
            return [];
        }
    },

    getDiscordMessageStore() {
        if (this.plugin.discordMessageStore) return this.plugin.discordMessageStore;
        const now = Date.now();
        if (now < Number(this.plugin.discordMessageStoreMissingUntil || 0)) return null;

        const bdApi = globalThis.BdApi;
        const lookups = [
            () => bdApi?.Webpack?.getStore?.("MessageStore"),
            () => bdApi?.Webpack?.getByKeys?.("getMessage", "getMessages"),
            () => bdApi?.findModuleByProps?.("getMessage", "getMessages")
        ];
        for (const lookup of lookups) {
            try {
                const store = lookup();
                if (typeof store?.getMessages === "function" || typeof store?.getMessagesForChannel === "function") {
                    this.plugin.discordMessageStore = store;
                    return store;
                }
            }
            catch (error) {
                this.plugin.warnSanitized("Failed to locate Discord MessageStore", error);
            }
        }

        this.plugin.discordMessageStoreMissingUntil = now + 5000;
        return null;
    },

    resetDiscordMessageStoreCache() {
        this.plugin.discordMessageStore = null;
        this.plugin.discordMessageStoreMissingUntil = 0;
        this.plugin.messageTracker.storeResolvedMessageIds.clear();
        this.plugin.messageTracker.storeResolvedMessageIdMisses.clear();
    },

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
    },

    // The display text of a MessageStore message: its markup converted to what the chat shows, or ""
    // when that cannot be rebuilt (see convertDiscordMarkupToDisplayText). Raw store markup never
    // leaves this method.
    getDiscordStoreMessageText(message) {
        let raw = null;
        if (typeof message?.content === "string") raw = message.content;
        else if (typeof message?.message === "string") raw = message.message;
        else if (typeof message?.text === "string") raw = message.text;
        if (!raw) return "";
        // Only user and role mentions depend on the server (nicknames, role names).
        const guildId = raw.includes("<@") ? this.getDiscordStoreMessageGuildId(message) : "";
        return this.normalizeExtractedText(this.getDiscordMarkupDisplayText(raw, guildId));
    },

    getDiscordStoreMessageGuildId(message) {
        const channelId = this.plugin.messageTracker.getStoreMessageChannelId(message);
        const guildId = this.plugin.messageTracker.getStoreMessageGuildId(message)
            || String(this.plugin.getDiscordNamedStore("ChannelStore")?.getChannel?.(channelId)?.guild_id || "")
            || this.plugin.messageTracker.getRouteIds?.().guildId
            || "";
        return guildId === "@me" ? "" : guildId;
    },

    getDiscordMarkupDisplayText(raw, guildId = "") {
        const memoKey = `${guildId}\n${raw}`;
        if (!this.plugin.discordMarkupDisplayTextMemo) this.plugin.discordMarkupDisplayTextMemo = new Map();
        if (this.plugin.discordMarkupDisplayTextMemo.has(memoKey)) return this.plugin.discordMarkupDisplayTextMemo.get(memoKey);
        const displayText = convertDiscordMarkupToDisplayText(raw, {
            user: userId => this.getDiscordMentionUserName(userId, guildId),
            role: roleId => this.getDiscordMentionRoleName(roleId, guildId),
            channel: channelId => this.plugin.getDiscordNamedStore("ChannelStore")?.getChannel?.(channelId)?.name || "",
            emoji: name => this.getDiscordUnicodeEmojiSurrogate(name)
        });
        // A name that cannot be resolved yet (stores still loading) is looked up again next time.
        if (!displayText) return displayText;
        this.plugin.discordMarkupDisplayTextMemo.set(memoKey, displayText);
        while (this.plugin.discordMarkupDisplayTextMemo.size > DISCORD_MARKUP_DISPLAY_TEXT_MEMO_MAX) {
            this.plugin.discordMarkupDisplayTextMemo.delete(this.plugin.discordMarkupDisplayTextMemo.keys().next().value);
        }
        return displayText;
    },

    // Discord shows a user mention as the member's server nickname, else the display name, else the username.
    getDiscordMentionUserName(userId, guildId = "") {
        const member = guildId ? this.plugin.getDiscordNamedStore("GuildMemberStore")?.getMember?.(guildId, userId) : null;
        const user = this.plugin.getDiscordNamedStore("UserStore")?.getUser?.(userId);
        return String(member?.nick || user?.globalName || user?.global_name || user?.username || "").trim();
    },

    getDiscordMentionRoleName(roleId, guildId = "") {
        if (!guildId) return "";
        const role = this.plugin.getDiscordNamedStore("GuildRoleStore")?.getRole?.(guildId, roleId)
            || this.plugin.getDiscordNamedStore("GuildStore")?.getRole?.(guildId, roleId)
            || this.plugin.getDiscordNamedStore("GuildStore")?.getRoles?.(guildId)?.[roleId]
            || this.plugin.getDiscordNamedStore("GuildStore")?.getGuild?.(guildId)?.roles?.[roleId];
        return String(role?.name || "").trim();
    },

    // Discord draws a standard emoji written as its name (":white_check_mark:", as bots send it) as
    // the emoji itself. "" when the name is unknown or Discord's emoji utils cannot be found.
    getDiscordUnicodeEmojiSurrogate(name) {
        const emojiUtils = this.getDiscordUnicodeEmojiUtils();
        try {
            return String(emojiUtils?.convertNameToSurrogate?.(name) || "");
        }
        catch {
            return "";
        }
    },

    getDiscordUnicodeEmojiUtils() {
        return this.plugin.discordHost.getUnicodeEmojiUtils();
    },

    getDiscordNamedStore(name) {
        return this.plugin.discordHost.getNamedStore(name);
    },

    // MessageStore text replaces the text on screen only as the request text, and only when it holds
    // more than the target element shows (a message whose content element shows part of it). Each
    // emoji counts as one character, drawn or written as a shortcode, so a content element that shows
    // the whole message is never taken for part of it.
    isStoreFullRequestText(storeText, domText) {
        const store = String(storeText || "");
        const dom = String(domText || "");
        return Boolean(store && dom
            && getEmojiNeutralTextLength(store) > getEmojiNeutralTextLength(dom) + 4
            && this.plugin.isManualTranslationSourceCompatible(store, dom));
    },

    getCachedElementText(element, context = null, options = {}) {
        if (options?.includeReplyPreview) {
            if (!context?.replyTextByElement) return this.plugin.getElementText(element, options);
            if (!context.replyTextByElement.has(element)) {
                context.replyTextByElement.set(element, this.plugin.getElementText(element, options));
            }
            return context.replyTextByElement.get(element);
        }

        if (!context?.textByElement) return this.plugin.getElementText(element);
        if (!context.textByElement.has(element)) {
            context.textByElement.set(element, this.plugin.getElementText(element));
        }
        return context.textByElement.get(element);
    },

    getTextFingerprint(text) {
        const value = String(text || "");
        let hash = 2166136261;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    },

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
};

const MESSAGE_EXTRACTOR_METHOD_NAMES = attachControllerMethods(DiscordMessageExtractorController, [methods]);

module.exports = {
    DiscordMessageExtractorController,
    MESSAGE_EXTRACTOR_METHOD_NAMES
};
