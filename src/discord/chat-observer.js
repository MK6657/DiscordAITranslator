"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const {
    DISCORD_MESSAGE_NODE_SELECTOR,
    DISCORD_SETTINGS_SURFACE_SELECTOR,
    DISCORD_MEDIA_VIEWER_SELECTOR,
    DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR,
    DISCORD_MEDIA_MUTATION_SELECTOR,
    SCAN_VIEWPORT_BUFFER_PX,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    DISCORD_MEDIA_VIEWER_QUIET_MS,
    DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS,
    DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS,
    AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE,
    AUTO_TRANSLATE_EDGE_OVERSCAN_MESSAGES,
    MUTATION_DIRTY_SCAN_MAX_ROOTS,
    MUTATION_DIRTY_SCAN_MAX_MESSAGES,
    INCREMENTAL_MESSAGE_WORK_BUDGET_MS,
    INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE
} = require("../constants");

class DiscordChatObserverController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    isDiscordSettingsSurfaceOpen(options = {}) {
        if (typeof document === "undefined" || !document.querySelectorAll) return false;
        const now = Date.now();
        if (!options.force && now - Number(this.plugin.settingsSurfaceProbeAt || 0) < 250) {
            return Boolean(this.plugin.settingsSurfaceProbeOpen);
        }
        const surfaces = [...(document.querySelectorAll?.(DISCORD_SETTINGS_SURFACE_SELECTOR) || [])];
        let open = surfaces.some(surface => this.isDiscordSettingsSurfaceElement(surface));
        if (!open) {
            // Discord 1.0.9269+ / BD 1.14+ obfuscates standardSidebarView; detect BetterDiscord's inline
            // settings view when our plugin panel is mounted inline outside our own quick-settings modal.
            const inlineSettings = document.querySelector?.(".dait-settings[data-dait-settings-inline='true']");
            if (inlineSettings && !inlineSettings.closest?.(".dait-quick-settings-modal-root")) {
                const rect = inlineSettings.getBoundingClientRect?.();
                if (!rect || (Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0)) open = true;
            }
        }
        this.plugin.settingsSurfaceProbeAt = now;
        this.plugin.settingsSurfaceProbeOpen = open;
        return open;
    },

    isInsideDiscordSettingsSurface(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        if (this.isDiscordSettingsSurfaceElement(element)) return true;
        const surface = element.closest?.(DISCORD_SETTINGS_SURFACE_SELECTOR);
        return Boolean(surface && this.isDiscordSettingsSurfaceElement(surface));
    },

    isDiscordSettingsSurfaceElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        const matchesSurface = Boolean(element.matches?.(DISCORD_SETTINGS_SURFACE_SELECTOR) || element.closest?.(DISCORD_SETTINGS_SURFACE_SELECTOR));
        if (!matchesSurface) return false;
        if (element.closest?.(".dait-quick-settings-modal-root, .dait-settings")) return false;
        const rect = element.getBoundingClientRect?.();
        if (!rect) return true;
        return Number(rect.width || 0) > 0 && Number(rect.height || 0) > 0;
    },

    isOwnPluginElement(element) {
        return Boolean(element?.closest?.(".dait-settings, .dait-quick-settings-button, .dait-quick-settings-modal-root, .dait-quick-popover, .dait-message-button, .dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-group, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-preset-menu, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-line, .dait-translation-box"));
    },

    startObserver() {
        if (!this.plugin.isStarted) return;
        if (this.plugin.observer) {
            this.plugin.observer.disconnect();
            this.plugin.observer = null;
        }
        if (this.plugin.observerLifecycle) {
            this.plugin.observerLifecycle.disconnect();
            this.plugin.observerLifecycle = null;
        }
        this.plugin.observerRoot = null;
        if (this.plugin.observerRebindTimer) {
            clearTimeout(this.plugin.observerRebindTimer);
            this.plugin.observerRebindTimer = null;
        }
        if (this.plugin.observerRetryTimer) {
            clearTimeout(this.plugin.observerRetryTimer);
            this.plugin.observerRetryTimer = null;
        }

        if (!document.body) {
            this.plugin.observerRetryTimer = setTimeout(() => {
                this.plugin.observerRetryTimer = null;
                if (!this.plugin.isStarted) return;
                this.plugin.startObserver();
            }, 1000);
            return;
        }

        this.plugin.observer = new MutationObserver(mutations => this.handleDiscordObservedMutations(mutations));
        const observerRoot = this.getDiscordChatMutationObserverRoot() || document.body;
        this.plugin.observerRoot = observerRoot;
        this.plugin.observer.observe(observerRoot, {
            attributeFilter: ["alt", "aria-hidden", "aria-label", "aria-labelledby", "class", "data-author-id", "data-item-id", "data-list-item-id", "data-message-id", "data-theme", "data-user-id", "datetime", "hidden", "id", "style", "theme"],
            attributes: true,
            childList: true,
            characterData: true,
            subtree: true
        });
        if (observerRoot !== document.body) {
            this.plugin.observer.observe(document.body, {
                attributeFilter: ["class", "data-theme", "style", "theme"],
                attributes: true,
                childList: false,
                subtree: false
            });
            this.startDiscordObserverLifecycle(observerRoot);
        }
    },

    handleDiscordObservedMutations(mutations = []) {
        if (!this.plugin.isStarted) return;
        if (this.plugin.observerRoot === document.body && this.hasPotentialDiscordObserverRootMutation(mutations)) {
            const nextRoot = this.getDiscordChatMutationObserverRoot();
            if (nextRoot && nextRoot !== document.body) this.plugin.scheduleDiscordObserverRebind("chat-root-available");
        }
        if (this.plugin.isDiscordMediaViewerQuiet()) {
            if (this.plugin.hasLightweightDiscordMediaViewerMutation(mutations)) this.enterDiscordMediaViewerQuietMode("quiet-mutation");
            // Even while quiet, real content mutations (e.g. a message edited behind the
            // media viewer) must drop cached element text, or stale-text guards compare
            // stale-vs-stale after the viewer closes. Own-mutation filtering is skipped
            // on purpose: renders are deferred while quiet, so plugin-caused mutations
            // are rare and an occasional self-invalidation only re-extracts text once.
            this.invalidateElementTextCacheForMutations(mutations);
            return;
        }
        const externalMutations = [...(mutations || [])].filter(mutation => !this.plugin.isOwnMutation(mutation));
        const strippedButtonRoots = this.collectStrippedMessageButtonRoots(mutations);
        if (strippedButtonRoots.length) this.scheduleLightweightButtonRecovery(strippedButtonRoots);
        if (!externalMutations.length) return;
        this.invalidateElementTextCacheForMutations(externalMutations);
        if (this.plugin.hasDiscordMediaViewerMutation(externalMutations)) {
            this.enterDiscordMediaViewerQuietMode("mutation");
            return;
        }
        if (this.hasDiscordThemeMutation(externalMutations)) this.plugin.refreshDiscordThemeClasses();
        const inputMutations = this.getInputButtonRelevantMutations(externalMutations);
        if (inputMutations.length) {
            this.markInputComposerBusy();
            this.plugin.queueInputButtonScan({ delayMs: 500, trailing: true });
        }
        const shouldProbeMediaViewer = Boolean(this.plugin.mediaViewerProbeOpen || this.plugin.hasLightweightDiscordMediaViewerMutation(externalMutations));
        if ((shouldProbeMediaViewer && this.plugin.isDiscordMediaViewerOpen()) || this.areDiscordMediaViewerMutations(externalMutations)) {
            this.enterDiscordMediaViewerQuietMode("open");
            return;
        }
        const scanMutations = this.getScanRelevantMutations(externalMutations);
        if (!scanMutations.length) return;
        if (this.plugin.shouldInjectMessageButtons() && this.plugin.isAutoTranslationRenderPaused()) {
            const addedMessageRoots = this.collectAddedMessageRootsForButtons(scanMutations);
            if (addedMessageRoots.length) this.scheduleLightweightButtonRecovery(addedMessageRoots);
        }
        if (this.hasLargeMessageMutation(scanMutations)) this.plugin.markAutoTranslationViewportBusy("mutation");
        this.plugin.queueMutationScan(scanMutations);
    },

    startDiscordObserverLifecycle(observerRoot) {
        const appMount = document.getElementById?.("app-mount");
        const lifecycleRoot = appMount || document.body;
        if (!lifecycleRoot) return;
        const lifecycleObserver = new MutationObserver(mutations => {
            if (!this.plugin.isStarted || this.plugin.observerLifecycle !== lifecycleObserver) return;
            if (!this.plugin.observerRoot || this.plugin.observerRoot.isConnected === false) {
                this.plugin.scheduleDiscordObserverRebind("chat-root-detached");
                return;
            }
            if (appMount?.isConnected === false) {
                this.plugin.scheduleDiscordObserverRebind("app-mount-detached");
                return;
            }
            const outsideMutations = [...(mutations || [])].filter(mutation =>
                !this.isMutationWithinDiscordObserverRoot(mutation, this.plugin.observerRoot)
                && this.isMutationWithinDiscordObserverRoot(mutation, lifecycleRoot));
            if (!outsideMutations.length) return;
            if (this.hasPotentialDiscordObserverRootMutation(outsideMutations)) {
                const nextRoot = this.getDiscordChatMutationObserverRoot();
                if (nextRoot && nextRoot !== this.plugin.observerRoot && !this.plugin.observerRoot.contains?.(nextRoot)) {
                    this.plugin.scheduleDiscordObserverRebind("chat-root-replaced");
                    return;
                }
            }
            // Only forward outside-chat mutations that actually matter (media viewer overlays, newly mounted
            // thread/sidebar composers, or theme switches). Drop emoji pickers, popouts, member lists, and sidebars.
            const relevantOutside = outsideMutations.filter(mutation =>
                !this.plugin.isOwnMutation(mutation)
                && (this.isDiscordMediaViewerMutation(mutation)
                    || this.isInputButtonRelevantMutation(mutation)
                    || this.hasDiscordThemeMutation([mutation])));
            if (relevantOutside.length) this.handleDiscordObservedMutations(relevantOutside);
        });
        this.plugin.observerLifecycle = lifecycleObserver;
        if (lifecycleRoot !== observerRoot) {
            lifecycleObserver.observe(lifecycleRoot, { childList: true, subtree: true });
        }
        if (appMount && appMount !== document.body) {
            for (let ancestor = appMount.parentElement || document.body; ancestor; ancestor = ancestor.parentElement) {
                lifecycleObserver.observe(ancestor, { childList: true, subtree: false });
                if (ancestor === document.body) break;
            }
        }
    },

    isMutationWithinDiscordObserverRoot(mutation, root = this.plugin.observerRoot) {
        if (!root) return false;
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        return target === root || Boolean(root.contains?.(target));
    },

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
    },

    scheduleDiscordObserverRebind(reason = "chat-root-change") {
        if (!this.plugin.isStarted || this.plugin.observerRebindTimer) return;
        this.plugin.cancelIncrementalMessageScan();
        this.plugin.observerRebindTimer = setTimeout(() => {
            this.plugin.observerRebindTimer = null;
            if (!this.plugin.isStarted) return;
            this.plugin.startObserver();
            this.plugin.queueScan({ delayMs: 80, trailing: true });
            this.plugin.queueInputButtonScan({ delayMs: 120, trailing: true });
            this.plugin.logDiagnostic("observer.rebind", "ok", { reason });
        }, 40);
        this.plugin.unrefTimer(this.plugin.observerRebindTimer);
    },

    getDiscordChatMutationObserverSelectors() {
        return this.plugin.discordHost.getChatObserverSelectors();
    },

    getDiscordChatMutationObserverRoot() {
        if (typeof document === "undefined" || !document.querySelector) return null;
        for (const selector of this.getDiscordChatMutationObserverSelectors()) {
            const element = document.querySelector(selector);
            if (element?.nodeType === 1) return element;
        }
        return null;
    },

    hasDiscordThemeMutation(mutations = []) {
        return [...mutations].some(mutation => {
            if (mutation?.type !== "attributes") return false;
            const attributeName = String(mutation.attributeName || "");
            if (!["class", "data-theme", "theme", "style"].includes(attributeName)) return false;
            const target = mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target;
            if (!target) return false;
            if (this.isOwnPluginElement(target) || target.dataset?.daitSettingsModal || target.dataset?.daitSettingsModalRoot || target.dataset?.daitDiscordTheme) return false;
            const id = String(target.id || "");
            const className = String(target.className || "");
            const isRootThemeHost = (typeof document !== "undefined" && (target === document.body || target === document.documentElement))
                || id === "app-mount"
                || /app-?mount/i.test(className);
            if (isRootThemeHost) return true;
            // Elements inside chat, composer, popouts, pickers, reactions, or typing bars frequently update
            // class/style on incoming messages or hover; those are local UI updates, not app-wide theme switches.
            if (target.closest?.("[data-list-id*='chat-messages'], [class*='messagesWrapper'], [class*='scrollerInner'], [class*='chatContent'], [class*='channelTextArea'], [class*='popout'], [class*='popover'], [class*='emojiPicker'], [class*='expressionPicker'], [class*='stickerPicker'], [class*='reaction'], [class*='typing'], [class*='newMessagesBar']")) return false;
            if (attributeName === "style" || attributeName === "data-theme" || attributeName === "theme") {
                return Boolean(this.plugin.getElementDiscordThemeExplicitClass(target));
            }
            return ["theme-midnight", "theme-onyx", "theme-darker", "theme-ash", "theme-light", "theme-dark"]
                .some(theme => this.plugin.elementHasClassName(target, theme));
        });
    },

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
    },

    invalidateElementTextCacheForMutations(mutations = []) {
        if (!this.plugin.elementTextCache?.delete) return;
        for (const mutation of mutations || []) {
            if (this.plugin.isPresentationOnlyMessageMutation(mutation) || this.isMessageChromeOnlyMutation(mutation)) continue;
            const nodes = [
                mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target,
                ...(mutation?.addedNodes || []),
                ...(mutation?.removedNodes || [])
            ];
            nodes.forEach(node => this.invalidateElementTextCacheFromNode(node));
        }
    },

    invalidateElementTextCacheFromNode(node) {
        let element = node?.nodeType === 3 ? node.parentElement : node;
        let depth = 0;
        while (element && element.nodeType === 1 && depth < 12) {
            this.plugin.elementTextCache?.delete?.(element);
            this.plugin.cachedDrawMessageMemo?.delete(element);
            this.plugin.nonTranslatableMessageCache?.delete?.(element);
            if (this.plugin.isDiscordMessageElement(element)) break;
            element = element.parentElement;
            depth++;
        }
    },

    markTranslationSourceStyleMutation(element, count = 1) {
        if (!element || !this.plugin.translationSourceStyleMutationCounts?.set) return;
        const previous = Number(this.plugin.translationSourceStyleMutationCounts.get(element) || 0) || 0;
        this.plugin.translationSourceStyleMutationCounts.set(element, previous + Math.max(1, Number(count) || 1));
    },

    consumeTranslationSourceStyleMutation(element) {
        if (!element || !this.plugin.translationSourceStyleMutationCounts?.get) return false;
        const count = Number(this.plugin.translationSourceStyleMutationCounts.get(element) || 0) || 0;
        if (count <= 0) return false;
        if (count <= 1) this.plugin.translationSourceStyleMutationCounts.delete(element);
        else this.plugin.translationSourceStyleMutationCounts.set(element, count - 1);
        return true;
    },

    isOwnMutationNode(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (this.isOwnPluginElement(element)) return true;
        return Boolean(element?.matches?.(".dait-settings, .dait-quick-settings-button, .dait-quick-settings-modal-root, .dait-quick-popover, .dait-message-button, .dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-group, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-preset-menu, .dait-polish-result-panel, .dait-polish-restore-control, .dait-translation-line, .dait-translation-box"));
    },

    isMediaOnlyMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.plugin.isDiscordMessageElement(target)) return false;
        if (this.isDiscordMediaViewerMutation(mutation)) return true;
        if (mutation?.type === "attributes" || mutation?.type === "characterData") {
            return this.plugin.isMediaOnlyMutationElement(target);
        }
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        if (!nodes.length) return this.plugin.isMediaOnlyMutationElement(target);
        return nodes.every(node => this.isMediaOnlyMutationNode(node));
    },

    areDiscordMediaViewerMutations(mutations = []) {
        return [...(mutations || [])].length > 0 && [...(mutations || [])].every(mutation => this.isDiscordMediaViewerMutation(mutation) || this.isMediaOnlyMutation(mutation));
    },

    hasDiscordMediaViewerMutation(mutations = []) {
        return [...(mutations || [])].some(mutation => this.isDiscordMediaViewerMutation(mutation));
    },

    isDiscordMediaViewerMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isDiscordMediaViewerElement(target)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        return nodes.length > 0 && nodes.every(node => this.isDiscordMediaViewerMutationNode(node));
    },

    isDiscordMediaViewerMutationNode(node) {
        if (!node) return false;
        if (node.nodeType === 3) return !String(node.nodeValue || "").trim();
        const element = node.nodeType === 1 ? node : null;
        return this.isDiscordMediaViewerElement(element);
    },

    isMediaOnlyMutationNode(node) {
        if (!node) return false;
        if (node.nodeType === 3) return !String(node.nodeValue || "").trim();
        const element = node.nodeType === 1 ? node : null;
        return this.plugin.isMediaOnlyMutationElement(element);
    },

    isMediaOnlyMutationElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element) || this.isInsideDiscordSettingsSurface(element) || this.isInsideInputComposer(element)) return false;
        if (this.plugin.isDiscordMessageElement(element)) return false;
        const messageAncestor = element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR);
        if (!messageAncestor && (this.plugin.isInsideDiscordMediaViewer(element) || this.isDiscordMediaViewerElement(element))) return true;
        const mediaRoot = element.matches?.(DISCORD_MEDIA_MUTATION_SELECTOR)
            ? element
            : element.closest?.(DISCORD_MEDIA_MUTATION_SELECTOR);
        if (!mediaRoot) return false;
        if (this.plugin.isDiscordMessageElement(mediaRoot)) return false;
        return !this.mediaMutationElementHasTextCandidate(mediaRoot);
    },

    isInsideDiscordMediaViewer(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.plugin.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
        return Boolean(element.matches?.(DISCORD_MEDIA_VIEWER_SELECTOR) || element.closest?.(DISCORD_MEDIA_VIEWER_SELECTOR) || this.isDiscordMediaViewerElement(element.closest?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR)));
    },

    isDiscordExpressionOrMenuOverlay(element) {
        if (!element || element.nodeType !== 1) return false;
        const selector = "[class*='emojiPicker'], [class*='expressionPicker'], [class*='stickerPicker'], [class*='gifPicker'], [class*='reaction'], [class*='popout'], [class*='popover'], [class*='tooltip'], [role='menu'], [role='listbox']";
        try {
            if (element.matches?.(selector) || element.closest?.(selector)) return true;
            if (element.querySelector?.("[class*='emojiPicker'], [class*='expressionPicker'], [class*='stickerPicker'], [class*='gifPicker']")) return true;
        }
        catch {}
        return false;
    },

    isDiscordMediaViewerElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element) || this.isInsideDiscordSettingsSurface(element) || this.isInsideInputComposer(element)) return false;
        // Fast-skip top-level app/chat layers enclosing the chat observer root before running subtree queries.
        if (this.plugin.observerRoot && (element === this.plugin.observerRoot || element.contains?.(this.plugin.observerRoot))) return false;
        if (this.isDiscordExpressionOrMenuOverlay(element)) return false;
        if (this.plugin.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR) || element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
        if (element.matches?.("[class*='imageModal'], [class*='carouselModal'], [class*='mediaViewer'], [class*='zoomed']")) return true;
        const hasMedia = this.elementHasMediaViewerContent(element);
        if (!hasMedia) return false;
        return Boolean(element.matches?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR) || element.closest?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR));
    },

    elementHasMediaViewerContent(element) {
        if (!element || element.nodeType !== 1) return false;
        if (element.matches?.("img, video, picture, canvas")) return true;
        return Boolean(element.querySelector?.("img, video, picture, canvas, [class*='imageWrapper'], [class*='mediaViewer'], [class*='carousel']"));
    },

    isDiscordMediaViewerOpen() {
        if (typeof document === "undefined" || !document.querySelector) return false;
        const now = Date.now();
        if (now - Number(this.plugin.mediaViewerProbeAt || 0) < DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS) {
            return Boolean(this.plugin.mediaViewerProbeOpen);
        }
        const exactViewer = document.querySelector?.("[class*='imageModal'], [class*='carouselModal'], [class*='mediaViewer'], [class*='zoomed']");
        if (exactViewer && !this.isDiscordExpressionOrMenuOverlay(exactViewer)) {
            this.plugin.mediaViewerProbeAt = now;
            this.plugin.mediaViewerProbeOpen = true;
            this.enterDiscordMediaViewerQuietMode("selector");
            return true;
        }
        const containers = [...(document.querySelectorAll?.(DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR) || [])];
        const open = containers.some(container => this.isDiscordMediaViewerElement(container));
        this.plugin.mediaViewerProbeAt = now;
        this.plugin.mediaViewerProbeOpen = open;
        if (open) this.enterDiscordMediaViewerQuietMode("probe");
        return open;
    },

    enterDiscordMediaViewerQuietMode(reason = "media-viewer", durationMs = DISCORD_MEDIA_VIEWER_QUIET_MS) {
        const now = Date.now();
        this.plugin.mediaViewerQuietUntil = Math.max(Number(this.plugin.mediaViewerQuietUntil || 0), now + Math.max(250, Number(durationMs) || DISCORD_MEDIA_VIEWER_QUIET_MS));
        this.plugin.mediaViewerProbeAt = now;
        this.plugin.mediaViewerProbeOpen = true;
        if (this.plugin.scanTimer && this.plugin.scanDueAt && Number(this.plugin.scanDueAt || 0) < this.plugin.mediaViewerQuietUntil + 80) {
            clearTimeout(this.plugin.scanTimer);
            this.plugin.scanTimer = null;
            this.plugin.scanDueAt = 0;
            this.plugin.queueScan({ delayMs: this.getDiscordMediaViewerQuietRemainingMs() + 80, trailing: true });
        }
        this.deferInputButtonScanForMediaViewer();
        this.cancelLightweightButtonRecovery();
        this.deferAutoTranslationRenderQueueForMediaViewer();
    },

    isDiscordMediaViewerQuiet(now = Date.now()) {
        return now < Number(this.plugin.mediaViewerQuietUntil || 0);
    },

    getDiscordMediaViewerQuietRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.plugin.mediaViewerQuietUntil || 0) - now);
    },

    hasLightweightDiscordMediaViewerMutation(mutations = []) {
        return [...(mutations || [])].some(mutation => this.isLightweightDiscordMediaViewerMutation(mutation));
    },

    isLightweightDiscordMediaViewerMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isLightweightDiscordMediaViewerElement(target)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        return nodes.some(node => this.isLightweightDiscordMediaViewerElement(node?.nodeType === 3 ? node.parentElement : node));
    },

    isLightweightDiscordMediaViewerElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element) || this.plugin.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
        if (this.isDiscordExpressionOrMenuOverlay(element)) return false;
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
        return /(imageModal|carouselModal|mediaViewer|modalRoot|zoomed|imageWrapper|imageContainer|mediaAttachmentsContainer|embedImage|embedMedia|embedThumbnail|embedVideo|carousel)/i.test(identity);
    },

    getDiscordMediaViewerDeferredDelayMs(now = Date.now()) {
        if (this.plugin.isDiscordMediaViewerQuiet(now)) return this.getDiscordMediaViewerQuietRemainingMs(now) + 80;
        if (this.plugin.isDiscordMediaViewerOpen()) return Math.max(DISCORD_MEDIA_VIEWER_QUIET_MS, this.getDiscordMediaViewerQuietRemainingMs() + 80);
        return 0;
    },

    deferInputButtonScanForMediaViewer() {
        if (!this.plugin.inputButtonScanTimer) return;
        const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
        if (this.plugin.inputButtonScanTimer) clearTimeout(this.plugin.inputButtonScanTimer);
        this.plugin.inputButtonScanTimer = null;
        this.plugin.inputButtonScanDueAt = 0;
        this.plugin.queueInputButtonScan({ delayMs, trailing: true });
    },

    deferAutoTranslationRenderQueueForMediaViewer() {
        if (!this.plugin.autoTranslationRenderQueue?.length) return;
        const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
        if (this.plugin.autoTranslationRenderRaf) {
            const cancel = typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function"
                ? window.cancelAnimationFrame.bind(window)
                : (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : null);
            try { cancel?.(this.plugin.autoTranslationRenderRaf); }
            catch {}
            this.plugin.autoTranslationRenderRaf = null;
        }
        if (this.plugin.autoTranslationRenderTimer) {
            clearTimeout(this.plugin.autoTranslationRenderTimer);
            this.plugin.autoTranslationRenderTimer = null;
            this.plugin.autoTranslationRenderDueAt = 0;
        }
        this.plugin.autoTranslationRenderDueAt = 0;
        this.plugin.scheduleAutoTranslationRenderQueue(delayMs);
    },

    mediaMutationElementHasTextCandidate(element) {
        if (!element || element.nodeType !== 1) return false;
        const text = String(element.textContent ?? "").replace(/\u200b/g, "").trim();
        if (!text) return false;
        return /[0-9A-Za-z\u00c0-\uffff]/.test(text);
    },

    getScanRelevantMutations(mutations) {
        return [...(mutations || [])].filter(mutation => this.isScanRelevantMutation(mutation));
    },

    isScanRelevantMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isInsideDiscordSettingsSurface(target)) return false;
        if (this.isMediaOnlyMutation(mutation)) return false;
        if (this.plugin.isPresentationOnlyMessageMutation(mutation, target)) return false;
        if (this.isMessageChromeOnlyMutation(mutation, target)) return false;
        if (this.isLayoutOnlyChatContainerMutation(mutation, target)) return false;
        if (this.isScanRelevantElement(target)) return true;

        if (mutation?.type === "childList") {
            const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
            return nodes.some(node => this.isScanRelevantMutationNode(node));
        }

        return false;
    },

    isMessageChromeOnlyElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.plugin.isDiscordMessageElement(element)) return false;
        const contentSelector = "[class*='messageContent'], [class*='markup']";
        if (element.matches?.(contentSelector) || element.closest?.(contentSelector)) return false;
        const chromeSelector = [
            "[class*='buttonContainer']",
            "[class*='buttonsInner']",
            "[class*='reactions']",
            "[class*='reaction_']",
            "[class*='reactionBtn']",
            "[class*='popover']",
            "[class*='avatar']",
            "[class*='roleIcon']",
            "[class*='botTag']",
            "[class*='clanTag']",
            "[class*='emojiPicker']",
            "[class*='expressionPicker']"
        ].join(",");
        if (!element.matches?.(chromeSelector) && !element.closest?.(chromeSelector)) return false;
        try {
            if (element.querySelector?.(`${DISCORD_MESSAGE_NODE_SELECTOR}, ${contentSelector}`)) return false;
        }
        catch {}
        return true;
    },

    isMessageChromeOnlyMutation(mutation, target = null) {
        const element = target || (mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target);
        if (this.isMessageChromeOnlyElement(element)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        if (!nodes.length) return false;
        return nodes.every(node => {
            if (node?.nodeType === 3) return !String(node.nodeValue || "").trim();
            return this.isMessageChromeOnlyElement(node);
        });
    },

    isLayoutOnlyChatContainerMutation(mutation, target = null) {
        if (mutation?.type !== "attributes") return false;
        const attributeName = String(mutation.attributeName || "");
        if (!["class", "style"].includes(attributeName)) return false;
        const element = target || (mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target);
        if (!element || element.nodeType !== 1) return false;
        if (this.plugin.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR)) return false;
        return Boolean(element.matches?.("[data-list-id*='chat-messages'], [class*='messagesWrapper'], [class*='scrollerInner'], [class*='chatContent']"));
    },

    isPresentationOnlyMessageMutation(mutation, target = null) {
        if (mutation?.type !== "attributes") return false;
        const attributeName = String(mutation.attributeName || "");
        if (!["class", "style"].includes(attributeName)) return false;
        const element = target || (mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target);
        if (!element || element.nodeType !== 1) return false;
        if (typeof document !== "undefined" && (element === document.body || element === document.documentElement)) return false;
        return Boolean(this.plugin.isDiscordMessageElement(element) || element.closest?.(DISCORD_MESSAGE_NODE_SELECTOR));
    },

    isScanRelevantMutationNode(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || element.nodeType !== 1) return false;
        if (this.isInsideDiscordSettingsSurface(element)) return false;
        if (this.plugin.isMediaOnlyMutationElement(element)) return false;
        if (this.isScanRelevantElement(element)) return true;
        if (element.querySelector?.(DISCORD_MESSAGE_NODE_SELECTOR)) return true;
        return false;
    },

    isScanRelevantElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isInsideDiscordSettingsSurface(element)) return false;
        if (this.isInsideInputComposer(element)) return false;
        if (this.plugin.isMediaOnlyMutationElement(element)) return false;
        if (this.plugin.isDiscordMessageElement(element)) return true;
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
    },

    getInputButtonRelevantMutations(mutations = []) {
        if (!this.plugin.settings.ui?.injectInputButton && !this.plugin.settings.ui?.publicBilingualInputButton) return [];
        return [...(mutations || [])].filter(mutation => this.isInputButtonRelevantMutation(mutation));
    },

    isInputButtonRelevantMutation(mutation) {
        const target = mutation?.target?.nodeType === 3 ? mutation.target.parentElement : mutation?.target;
        if (this.isInputButtonMutationElement(target)) return true;
        if (mutation?.type !== "childList") return false;
        const nodes = [...(mutation.addedNodes || []), ...(mutation.removedNodes || [])];
        return nodes.some(node => this.isInputButtonMutationElement(node?.nodeType === 3 ? node.parentElement : node));
    },

    isInputButtonMutationElement(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        if (this.isInsideDiscordSettingsSurface(element)) return false;
        return this.isInsideInputComposer(element)
            || Boolean(element.querySelector?.("[class*='channelTextArea'], [data-slate-editor='true'], [role='textbox'][contenteditable='true']"));
    },

    isInsideInputComposer(element) {
        if (!element || element.nodeType !== 1) return false;
        if (this.isOwnPluginElement(element)) return false;
        return Boolean(element.matches?.("[class*='channelTextArea'], [data-slate-editor='true'], [role='textbox'][contenteditable='true']")
            || element.closest?.("[class*='channelTextArea'], [data-slate-editor='true'], [role='textbox'][contenteditable='true']"));
    },

    markInputComposerBusy(durationMs = DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS) {
        this.plugin.inputComposerBusyUntil = Math.max(
            Number(this.plugin.inputComposerBusyUntil || 0),
            Date.now() + Math.max(80, Number(durationMs) || DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS)
        );
    },

    getInputComposerBusyRemainingMs(now = Date.now()) {
        return Math.max(0, Number(this.plugin.inputComposerBusyUntil || 0) - now);
    },

    queueInputButtonScan(options = {}) {
        if (!this.plugin.isStarted) return;
        if (!this.plugin.settings.ui?.injectInputButton && !this.plugin.settings.ui?.publicBilingualInputButton) return;
        const now = Date.now();
        const delay = Math.max(0, Number(options.delayMs ?? 350) || 0);
        const dueAt = now + delay;
        if (this.plugin.inputButtonScanTimer && this.plugin.inputButtonScanDueAt) {
            if (options.trailing) {
                if (this.plugin.inputButtonScanDueAt >= dueAt) return;
            }
            else if (this.plugin.inputButtonScanDueAt <= dueAt) return;
        }
        if (this.plugin.inputButtonScanTimer) clearTimeout(this.plugin.inputButtonScanTimer);
        this.plugin.inputButtonScanDueAt = dueAt;
        this.plugin.inputButtonScanTimer = setTimeout(() => this.scanInputButtonsOnly(), delay);
    },

    scanInputButtonsOnly() {
        this.plugin.inputButtonScanTimer = null;
        this.plugin.inputButtonScanDueAt = 0;
        if (!this.plugin.isStarted) return;
        if (!this.plugin.settings.ui?.injectInputButton && !this.plugin.settings.ui?.publicBilingualInputButton) return;
        const mediaDelayMs = this.getDiscordMediaViewerDeferredDelayMs();
        if (mediaDelayMs > 0) {
            this.plugin.queueInputButtonScan({ delayMs: mediaDelayMs, trailing: true });
            return;
        }
        if (this.plugin.isDiscordSettingsSurfaceOpen()) return;
        this.plugin.injectInputButtons();
    },

    queueViewportScan(event = null) {
        if (!this.plugin.isStarted) return;
        const type = String(event?.type || "");
        if (type === "scroll" && !this.plugin.isAutoTranslateEnabled()) return;
        // The capturing listener also hears focus moving between Discord's own elements; only the
        // window regaining focus asks for a scan.
        if (type === "focus" && event?.target && (typeof window === "undefined" || event.target !== window)) return;
        if (this.plugin.isDiscordMediaViewerQuiet()) return;
        const scrollRelevant = type === "scroll" ? this.plugin.isAutoTranslationScrollEventRelevant(event) : null;
        if (this.plugin.isDiscordMediaViewerViewportEvent(event, scrollRelevant)) return;
        if (type === "scroll" && !scrollRelevant) return;
        if (type === "scroll" || type === "resize") {
            if (type === "resize") this.plugin.queueInputButtonScan({ delayMs: 120, trailing: true });
            if (!this.plugin.isAutoTranslateEnabled()) return;
            if (type === "scroll" && this.plugin.consumeOwnScrollEvent(event)) return;
            this.plugin.cancelIncrementalMessageScan();
            this.plugin.markAutoTranslationViewportBusy(type, event);
            this.plugin.scheduleCachedTranslationDrawPass();
            const delay = Math.max(
                AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
                this.plugin.getAutoTranslationRenderPauseRemainingMs(),
                this.plugin.getAutoTranslationViewportSettleRemainingMs()
            ) + 80;
            this.plugin.queueScan({ delayMs: delay, trailing: true });
            return;
        }
        this.plugin.queueScan();
    },

    isDiscordMediaViewerViewportEvent(event = null, scrollRelevant = null) {
        const type = String(event?.type || "");
        if (!["focus", "resize", "scroll", "visibilitychange"].includes(type)) return false;
        const target = event?.target?.nodeType === 3 ? event.target.parentElement : event?.target;
        if (target?.nodeType === 1 && (this.plugin.isInsideDiscordMediaViewer(target) || this.plugin.isMediaOnlyMutationElement(target))) return true;
        if (type === "scroll" && target?.nodeType === 1 && (scrollRelevant === null ? this.plugin.isAutoTranslationScrollEventRelevant(event) : scrollRelevant)) return false;
        if (type === "scroll" && !this.plugin.mediaViewerProbeOpen && Date.now() - Number(this.plugin.mediaViewerProbeAt || 0) >= DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS) return false;
        return this.plugin.isDiscordMediaViewerOpen();
    },

    getMutationScanRoots(mutations = []) {
        const roots = new Set();
        const chatContainerSelector = "[data-list-id*='chat-messages'], [class*='messagesWrapper'], [class*='scrollerInner'], [class*='chatContent']";
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
            // A childList mutation on a chat list wrapper that only touched non-message elements (spacers,
            // typing bars, dividers) must not escalate the whole message list into a full-screen rescan.
            if (mutation?.type === "childList" && nodes.length > 0 && mutation?.target?.matches?.(chatContainerSelector)) {
                continue;
            }
            const targetRoot = this.getMutationScanRootFromNode(mutation?.target);
            if (targetRoot) roots.add(targetRoot);
        }
        return roots;
    },

    getMutationScanRootFromNode(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || element.nodeType !== 1) return null;
        if (this.isOwnPluginElement(element) || this.isInsideDiscordSettingsSurface(element) || this.isInsideInputComposer(element) || this.plugin.isMediaOnlyMutationElement(element)) return null;
        if (this.plugin.isDiscordMessageElement(element)) return element;
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
    },

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
    },

    getMutationRootMessageCount(root) {
        if (!root || root.nodeType !== 1) return 0;
        if (this.plugin.isDiscordMessageElement(root)) return 1;
        const count = Number(root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR)?.length || 0);
        return Math.min(MUTATION_DIRTY_SCAN_MAX_MESSAGES + 1, count);
    },

    rememberPendingMutationScanRoots(roots = []) {
        if (!this.plugin.pendingMutationScanRoots?.add) this.plugin.pendingMutationScanRoots = new Set();
        for (const root of roots || []) {
            if (!root || root.isConnected === false) continue;
            this.plugin.pendingMutationScanRoots.add(root);
            if (this.plugin.pendingMutationScanRoots.size > MUTATION_DIRTY_SCAN_MAX_ROOTS) break;
        }
    },

    consumePendingMutationScanRoots() {
        const roots = [...(this.plugin.pendingMutationScanRoots || [])].filter(root => root?.isConnected !== false);
        this.plugin.pendingMutationScanRoots?.clear?.();
        return roots;
    },

    queueMutationScan(scanMutations = []) {
        this.plugin.cancelIncrementalMessageScan();
        // Discord mounts messages as the chat scrolls; draw their cached translations promptly.
        if (this.plugin.isAutoTranslationRenderPaused() || this.hasAddedMessageNodes(scanMutations)) this.plugin.scheduleCachedTranslationDrawPass();
        const roots = this.getMutationScanRoots(scanMutations);
        const dirtyOnly = this.shouldUseDirtyMutationScan(scanMutations, roots);
        if (dirtyOnly) this.rememberPendingMutationScanRoots([...roots]);
        else this.plugin.pendingMutationScanRoots?.clear?.();
        const delay = Math.max(
            this.plugin.getAutoTranslationRenderPauseRemainingMs(),
            this.plugin.getAutoTranslationViewportSettleRemainingMs()
        );
        if (delay > 0) {
            this.plugin.queueScan({ delayMs: Math.max(AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS, delay) + 80, trailing: true, dirtyOnly });
            return;
        }
        this.plugin.queueScan({ dirtyOnly });
    },

    hasLargeMessageMutation(mutations) {
        let count = 0;
        for (const mutation of mutations || []) {
            if (this.isMediaOnlyMutation(mutation)) continue;
            if (mutation.type === "attributes" && this.plugin.isDiscordMessageElement(mutation.target)) count++;
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
    },

    hasAddedMessageNodes(mutations = []) {
        return (mutations || []).some(mutation => mutation?.type === "childList"
            && [...(mutation.addedNodes || [])].some(node => this.getMutationMessageElementCount(node) > 0));
    },

    getMutationMessageElementCount(node) {
        const element = node?.nodeType === 3 ? node.parentElement : node;
        if (!element || element.nodeType !== 1) return 0;
        if (this.plugin.isDiscordMessageElement(element)) return 1;
        const matches = element.querySelectorAll?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        return Math.min(8, Number(matches?.length || 0));
    },

    isDiscordMessageElement(element) {
        return Boolean(element?.matches?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']"));
    },

    getViewportScrollTarget(event = null) {
        const target = event?.target;
        if (!target || typeof document === "undefined" || target === document || target === window || target === document.body || target === document.documentElement) return null;
        return target && typeof target === "object" ? target : null;
    },

    getPreviousViewportScrollPosition(event = null, fallback = 0) {
        const target = this.getViewportScrollTarget(event);
        if (target && this.plugin.autoTranslationLastScrollByTarget?.has?.(target)) {
            const value = Number(this.plugin.autoTranslationLastScrollByTarget.get(target));
            if (Number.isFinite(value)) return value;
        }
        if (!target && Number.isFinite(Number(this.plugin.autoTranslationLastWindowScrollY))) return Number(this.plugin.autoTranslationLastWindowScrollY);
        return fallback;
    },

    setPreviousViewportScrollPosition(event = null, value = 0) {
        const scrollY = Number(value);
        if (!Number.isFinite(scrollY)) return;
        const target = this.getViewportScrollTarget(event);
        if (target && this.plugin.autoTranslationLastScrollByTarget?.set) {
            this.plugin.autoTranslationLastScrollByTarget.set(target, scrollY);
            return;
        }
        this.plugin.autoTranslationLastWindowScrollY = scrollY;
    },

    getViewportScrollPosition(event = null) {
        const target = event?.target;
        if (target && target !== document && target !== window && Number.isFinite(Number(target.scrollTop))) {
            return Number(target.scrollTop);
        }
        if (typeof window !== "undefined") return Number(window.scrollY || window.pageYOffset || 0);
        return 0;
    },

    queueScan(options = {}) {
        if (!this.plugin.isStarted) return;
        const now = Date.now();
        const dirtyOnly = Boolean(options.dirtyOnly);
        const existingFullScanPending = Boolean(this.plugin.scanTimer && this.plugin.scanDirtyOnly === false);
        if (!dirtyOnly) this.plugin.scanDirtyOnly = false;
        if (Number(options.protectUntil || 0) > now) {
            this.plugin.scanProtectedUntil = Math.max(Number(this.plugin.scanProtectedUntil || 0), Number(options.protectUntil));
        }
        let delay = Math.max(0, Number(options.delayMs ?? 150) || 0);
        let dueAt = now + delay;
        let trailing = Boolean(options.trailing);
        const quietUntil = Number(this.plugin.mediaViewerQuietUntil || 0);
        if (!options.force && quietUntil > now && dueAt < quietUntil + 80) {
            dueAt = quietUntil + 80;
            delay = Math.max(0, dueAt - now);
            trailing = true;
        }
        const protectedUntil = Number(this.plugin.scanProtectedUntil || 0);
        if (!options.force && protectedUntil > now && dueAt < protectedUntil) {
            dueAt = protectedUntil;
            delay = Math.max(0, dueAt - now);
            trailing = true;
        }
        if (this.plugin.scanTimer && this.plugin.scanDueAt) {
            if (trailing) {
                if (this.plugin.scanDueAt >= dueAt) return;
            }
            else if (this.plugin.scanDueAt <= dueAt) return;
        }
        if (this.plugin.scanTimer) clearTimeout(this.plugin.scanTimer);
        this.plugin.scanDirtyOnly = dirtyOnly && !existingFullScanPending;
        this.plugin.scanDueAt = dueAt;
        this.plugin.scanTimer = setTimeout(() => this.scanDiscordUi(), delay);
    },

    scanDiscordUi() {
        const startedAt = this.plugin.getDiagnosticTime();
        this.plugin.scanTimer = null;
        this.plugin.scanDueAt = 0;
        if (Number(this.plugin.scanProtectedUntil || 0) <= Date.now()) this.plugin.scanProtectedUntil = 0;
        if (!this.plugin.isStarted) return;
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return;
        if (this.plugin.isDiscordMediaViewerQuiet()) {
            this.plugin.cancelAutoTranslationRuntimeWork("route-change", { staleRouteOnly: true });
            const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
            this.plugin.queueScan({ delayMs, trailing: true });
            this.plugin.logSlowOperation("scan.discord-ui", startedAt, { outcome: "deferred", reason: "media-viewer-quiet", delayMs });
            return;
        }
        if (this.plugin.isDiscordMediaViewerOpen()) {
            this.plugin.cancelAutoTranslationRuntimeWork("route-change", { staleRouteOnly: true });
            const delayMs = this.getDiscordMediaViewerQuietRemainingMs() + 80;
            if (delayMs > 80) this.plugin.queueScan({ delayMs, trailing: true });
            this.plugin.logSlowOperation("scan.discord-ui", startedAt, { outcome: "blocked", reason: "media-viewer-open" });
            return;
        }
        if (this.plugin.isQuickSettingsPanelOpen()) {
            this.plugin.cancelAutoTranslationRuntimeWork("route-change", { staleRouteOnly: true });
            // The route can change under the open panel; its channel rule control must follow it.
            this.plugin.refreshChannelRuleControls();
            this.plugin.quickSettingsScanDeferred = true;
            this.plugin.logSlowOperation("scan.discord-ui", startedAt, { outcome: "blocked", reason: "quick-settings-open" }, 0);
            return;
        }
        if (this.plugin.isDiscordSettingsSurfaceOpen()) {
            this.plugin.cancelAutoTranslationRuntimeWork("route-change", { staleRouteOnly: true });
            this.plugin.logDiagnostic("scan.discord-ui", "blocked", { reason: "discord-settings-open" });
            this.plugin.logSlowOperation("scan.discord-ui", startedAt, { outcome: "blocked", reason: "discord-settings-open" });
            return;
        }
        const routeChanged = this.plugin.trackAutoTranslationRouteChange();
        if (routeChanged) {
            this.plugin.refreshChannelRuleControls();
            // The previous chat's scroller is unmounted; the draw pass finds the new one.
            this.plugin.cachedDrawScroller = null;
            // The channel rule shown by the quick panel and the launcher status depend on the channel.
            this.plugin.quickPanel.handleRouteChange();
            const delayMs = Math.max(
                AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
                this.plugin.getAutoTranslationViewportSettleRemainingMs()
            ) + 120;
            if (this.plugin.isAutoTranslateEnabled()) {
                this.plugin.scheduleCacheOnlyAutoTranslationScan("route-change", 80);
                this.plugin.scheduleCachedTranslationDrawPass();
            }
            this.plugin.queueScan({ delayMs, trailing: true, protectUntil: Date.now() + delayMs });
            this.plugin.logDiagnostic("scan.discord-ui", "deferred", { reason: "route-change", delayMs, cacheOnly: true, messages: 0 });
            this.plugin.logSlowOperation("scan.discord-ui", startedAt, { outcome: "deferred", reason: "route-change", cacheOnly: true, messages: 0 });
            return;
        }
        if (this.plugin.isAutoTranslationRenderPaused()) {
            if (this.plugin.isAutoTranslateEnabled()) {
                const delayMs = this.plugin.getAutoTranslationRenderPauseRemainingMs();
                this.plugin.scheduleCacheOnlyAutoTranslationScan("render-paused", delayMs + 80);
                this.plugin.scheduleAutoTranslationRetryScan(delayMs, { minDelayMs: AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS });
            }
            this.plugin.queueScan({
                delayMs: this.plugin.getAutoTranslationRenderPauseRemainingMs() + 80,
                trailing: true
            });
            this.plugin.logSlowOperation("scan.discord-ui", startedAt, { outcome: "paused", cacheOnly: true, messages: 0 });
            return;
        }
        const dirtyOnly = Boolean(this.plugin.scanDirtyOnly);
        this.plugin.scanDirtyOnly = false;
        this.plugin.scheduleCachedTranslationDrawPass();
        const dirtyRoots = dirtyOnly ? this.consumePendingMutationScanRoots() : [];
        if (!dirtyOnly) this.plugin.pendingMutationScanRoots?.clear?.();
        let stageStartedAt = this.plugin.getDiagnosticTime();
        const scanStages = {};
        const finishStage = name => {
            scanStages[name] = Math.max(0, Math.round(this.plugin.getDiagnosticTime() - stageStartedAt));
            stageStartedAt = this.plugin.getDiagnosticTime();
        };
        if (!dirtyRoots.length) this.plugin.injectQuickSettingsButtons();
        finishStage("quickMs");
        const context = this.plugin.createScanContext(dirtyRoots.length ? { roots: dirtyRoots, dirtyOnly: true } : {});
        finishStage("contextMs");
        this.plugin.reconcileTranslationLines(context);
        finishStage("reconcileMs");
        if (!dirtyRoots.length && (this.plugin.settings.ui.injectInputButton || this.plugin.settings.ui.publicBilingualInputButton)) {
            const inputBusyMs = this.getInputComposerBusyRemainingMs();
            if (inputBusyMs > 0) this.plugin.queueInputButtonScan({ delayMs: inputBusyMs + 80, trailing: true });
            else this.plugin.injectInputButtons();
        }
        finishStage("inputMs");
        // Message buttons are ultra-lightweight and idempotent: inject them synchronously in one pass so rapid
        // incoming chat messages never cancel button injection halfway down the viewport (leaving stranded messages
        // or flashing). Only heavy auto-translation scanning runs incrementally in idle slices.
        if (this.plugin.shouldInjectMessageButtons()) {
            this.plugin.injectMessageButtons(context);
            if (dirtyRoots.length) this.ensureMissingVisibleMessageButtons(context);
        }
        finishStage("buttonMs");
        const incremental = this.plugin.isAutoTranslateEnabled() && this.shouldUseIncrementalMessageScan(context);
        if (incremental) {
            this.scheduleIncrementalMessageScan(context, { skipButtons: true });
            finishStage("scheduleMs");
            scanStages.autoMs = 0;
        }
        else {
            this.plugin.cancelIncrementalMessageScan();
            if (this.plugin.isAutoTranslateEnabled()) this.plugin.queueAutoTranslateVisibleMessages(context);
            finishStage("autoMs");
        }
        this.plugin.logSlowOperation("scan.discord-ui", startedAt, {
            outcome: "ok",
            messages: context.messageNodes?.length || 0,
            nodeCount: context.messageNodes?.length || 0,
            dirtyOnly: Boolean(context.dirtyOnly),
            autoTranslate: this.plugin.isAutoTranslateEnabled(),
            ...scanStages
        });
    },

    dedupeNestedMessageNodes(nodes = []) {
        const unique = [...new Set((nodes || []).filter(Boolean))];
        if (unique.length <= 1) return unique;
        const nodeSet = new Set(unique);
        return unique.filter(node => {
            for (let parent = node.parentElement; parent; parent = parent.parentElement) {
                if (nodeSet.has(parent)) return false;
            }
            return true;
        });
    },

    ensureMissingVisibleMessageButtons(context = null) {
        if (!this.plugin.shouldInjectMessageButtons() || typeof document === "undefined" || typeof document.querySelectorAll !== "function") return 0;
        const now = Date.now();
        if (context?.dirtyOnly && now - Number(this.plugin.lastMissingMessageButtonSweepAt || 0) < 400) return 0;
        this.plugin.lastMissingMessageButtonSweepAt = now;
        const scanContext = context || this.plugin.createScanContext();
        const checkedNodes = context?.messageNodes?.length ? new Set(context.messageNodes) : null;
        const nodes = this.dedupeNestedMessageNodes([...document.querySelectorAll(DISCORD_MESSAGE_NODE_SELECTOR)]);
        const toInject = [];
        for (const messageNode of nodes) {
            if (!messageNode?.isConnected) continue;
            if (checkedNodes?.has(messageNode)) continue;
            if (messageNode.querySelector?.(".dait-message-button")) continue;
            if (this.plugin.nonTranslatableMessageCache?.get?.(messageNode) === true) continue;
            if (!this.isMessageNodeVisibleForScan(messageNode, scanContext)) continue;
            toInject.push(messageNode);
        }
        let injected = 0;
        for (const messageNode of toInject) {
            if (this.plugin.injectMessageButton(messageNode, scanContext)) injected++;
        }
        return injected;
    },

    collectStrippedMessageButtonRoots(mutations = []) {
        if (!this.plugin.shouldInjectMessageButtons()) return [];
        const roots = new Set();
        for (const mutation of mutations || []) {
            if (mutation?.type !== "childList" || !mutation.removedNodes?.length) continue;
            const target = mutation.target?.nodeType === 3 ? mutation.target.parentElement : mutation.target;
            if (!target || target.isConnected === false) continue;
            const addedSet = mutation.addedNodes?.length ? new Set(mutation.addedNodes) : null;
            const stripped = [...mutation.removedNodes].some(node => {
                if (!node || node.nodeType !== 1) return false;
                if (addedSet?.has(node)) return false;
                return this.plugin.elementHasClassName(node, "dait-message-button")
                    || Boolean(node.querySelector?.(".dait-message-button"));
            });
            if (!stripped) continue;
            const messageNode = this.plugin.isDiscordMessageElement(target) ? target : target.closest?.(DISCORD_MESSAGE_NODE_SELECTOR);
            if (messageNode && messageNode.isConnected !== false && !messageNode.querySelector?.(".dait-message-button")) {
                roots.add(messageNode);
            }
        }
        return this.dedupeNestedMessageNodes([...roots]);
    },

    collectAddedMessageRootsForButtons(mutations = []) {
        if (!this.plugin.shouldInjectMessageButtons()) return [];
        const roots = new Set();
        for (const mutation of mutations || []) {
            if (mutation?.type !== "childList" || !mutation.addedNodes?.length) continue;
            for (const node of mutation.addedNodes) {
                if (!node || node.nodeType !== 1 || node.isConnected === false) continue;
                if (this.isOwnPluginElement(node) || this.isMessageChromeOnlyElement(node)) continue;
                if (this.plugin.isDiscordMessageElement(node)) {
                    if (!node.querySelector?.(".dait-message-button")) roots.add(node);
                }
                else if (roots.size < MUTATION_DIRTY_SCAN_MAX_MESSAGES) {
                    const nested = node.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR) || [];
                    for (const msg of nested) {
                        if (msg?.isConnected !== false && !msg.querySelector?.(".dait-message-button")) roots.add(msg);
                        if (roots.size >= MUTATION_DIRTY_SCAN_MAX_MESSAGES) break;
                    }
                }
                if (roots.size >= MUTATION_DIRTY_SCAN_MAX_MESSAGES) break;
            }
        }
        return this.dedupeNestedMessageNodes([...roots]);
    },

    scheduleLightweightButtonRecovery(roots = [], delayMs = 80) {
        if (!this.plugin.isStarted || !this.plugin.shouldInjectMessageButtons() || !roots?.length) return;
        if (!this.plugin.lightweightButtonRecoveryRoots?.add) this.plugin.lightweightButtonRecoveryRoots = new Set();
        for (const root of roots) {
            if (root && root.isConnected !== false) this.plugin.lightweightButtonRecoveryRoots.add(root);
        }
        if (!this.plugin.lightweightButtonRecoveryRoots.size) return;
        if (this.plugin.lightweightButtonRecoveryTimer) clearTimeout(this.plugin.lightweightButtonRecoveryTimer);
        this.plugin.lightweightButtonRecoveryTimer = this.plugin.unrefTimer(setTimeout(() => {
            this.plugin.lightweightButtonRecoveryTimer = null;
            this.flushLightweightButtonRecovery();
        }, Math.max(16, Number(delayMs) || 80)));
    },

    cancelLightweightButtonRecovery() {
        if (this.plugin.lightweightButtonRecoveryTimer) {
            clearTimeout(this.plugin.lightweightButtonRecoveryTimer);
            this.plugin.lightweightButtonRecoveryTimer = null;
        }
        this.plugin.lightweightButtonRecoveryRoots?.clear?.();
    },

    // Restores or mounts missing Translate buttons without createScanContext(), getBoundingClientRect(),
    // or scroll-clip ancestor style walks — zero forced reflow and safe during chat scroll settle.
    flushLightweightButtonRecovery() {
        if (!this.plugin.isStarted || !this.plugin.shouldInjectMessageButtons()) {
            this.plugin.lightweightButtonRecoveryRoots?.clear?.();
            return 0;
        }
        if (this.plugin.isQuickSettingsPanelOpen() || this.plugin.isDiscordSettingsSurfaceOpen() || this.plugin.isDiscordMediaViewerQuiet()) {
            this.plugin.lightweightButtonRecoveryRoots?.clear?.();
            return 0;
        }
        const roots = this.dedupeNestedMessageNodes([...(this.plugin.lightweightButtonRecoveryRoots || [])])
            .filter(node => node?.isConnected !== false && !node.querySelector?.(".dait-message-button"));
        this.plugin.lightweightButtonRecoveryRoots?.clear?.();
        if (!roots.length) return 0;
        const lightContext = {
            contentByMessage: new Map(),
            textByElement: new Map(),
            replyTextByElement: new Map()
        };
        let injected = 0;
        for (const messageNode of roots) {
            if (this.plugin.injectMessageButton(messageNode, lightContext)) injected++;
        }
        return injected;
    },

    shouldUseIncrementalMessageScan(context = null) {
        if (!context?.messageNodes?.length) return false;
        if (!this.plugin.isAutoTranslateEnabled() && !this.plugin.shouldInjectMessageButtons()) return false;
        if (typeof window === "undefined" || typeof window.requestIdleCallback !== "function") return false;
        return true;
    },

    scheduleIncrementalMessageScan(context, options = {}) {
        this.plugin.cancelIncrementalMessageScan();
        const generation = this.plugin.incrementalMessageScanGeneration;
        const messageNodes = [...new Set(context?.messageNodes || [])];
        const skipButtons = Boolean(options?.skipButtons);
        const tasks = [];
        messageNodes.forEach(messageNode => {
            if (!skipButtons && this.plugin.shouldInjectMessageButtons()) tasks.push({ kind: "button", messageNode });
            if (this.plugin.isAutoTranslateEnabled()) tasks.push({ kind: "auto", messageNode });
        });
        let index = 0;
        let work = null;
        let initialized = false;
        let intakeEnhance = false;

        const runSlice = deadline => {
            this.plugin.incrementalMessageScanIdleCallback = null;
            this.plugin.incrementalMessageScanTimer = null;
            if (!this.plugin.isStarted || generation !== this.plugin.incrementalMessageScanGeneration) return;

            const sliceStartedAt = this.plugin.getDiagnosticTime();
            if (!initialized) {
                initialized = true;
                if (this.plugin.isAutoTranslateEnabled()) {
                    // Resolve the configured intake mode once per scan so the incremental
                    // path matches createAutoTranslationCandidates (which cache-only scans
                    // and history backfill use). The BDFDB store snapshot is cached on the
                    // scan context, so multi-slice scans still fetch it exactly once.
                    const mode = this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui?.autoTranslateIntakeMode);
                    const bdfdbAvailable = this.plugin.isBdfdbMessageIntakeAvailable();
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
                    this.plugin.logAutoTranslationIntakeState(intakeEnhance ? "bdfdb" : (mode === "bdfdb" ? "fallback" : "dom"), intake);
                    work = this.plugin.createAutoTranslationScanWork(context);
                }
                this.plugin.logSlowOperation("scan.incremental-init", sliceStartedAt, {
                    tasks: tasks.length
                }, 16);
                if (tasks.length) {
                    this.plugin.scheduleIncrementalMessageScanCallback(runSlice);
                    return;
                }
            }

            let processed = 0;
            while (index < tasks.length) {
                /** @type {any} */
                const nav = globalThis.navigator;
                const inputPending = Boolean(nav?.scheduling?.isInputPending?.());
                const idleRemainingBeforeTask = typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
                if (processed === 0 && (inputPending || (!deadline?.didTimeout && idleRemainingBeforeTask <= 1))) break;
                const task = tasks[index++];
                const messageNode = task.messageNode;
                if (messageNode?.isConnected) {
                    try {
                        if (task.kind === "button") {
                            if (this.plugin.shouldInjectMessageButtons()) this.plugin.injectMessageButton(messageNode, context);
                        }
                        else if (work) {
                            let candidates = this.plugin.createDomAutoTranslationCandidatesForMessage(messageNode, context);
                            work.context.autoTranslateIntake.domCandidates += candidates.length;
                            if (intakeEnhance && candidates.length) {
                                const enhanced = this.plugin.createBdfdbAutoTranslationCandidates(context, candidates);
                                work.context.autoTranslateIntake.bdfdbEnhanced += enhanced.filter(candidate => candidate?.source === "bdfdb").length;
                                candidates = enhanced;
                            }
                            work.scanStats.candidates = Number(work.scanStats.candidates || 0) + candidates.length;
                            this.plugin.processAutoTranslationScanCandidates(work, candidates);
                        }
                    }
                    catch (error) {
                        this.plugin.warnSanitized("Incremental message scan failed", error);
                    }
                }
                processed++;
                const elapsed = this.plugin.getDiagnosticTime() - sliceStartedAt;
                const idleRemaining = typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
                if (processed >= INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE
                    || elapsed >= INCREMENTAL_MESSAGE_WORK_BUDGET_MS
                    || (processed > 0 && idleRemaining <= 1)) break;
            }

            this.plugin.logSlowOperation("scan.incremental-slice", sliceStartedAt, {
                processed,
                remaining: Math.max(0, tasks.length - index)
            }, 16);
            if (!this.plugin.isStarted || generation !== this.plugin.incrementalMessageScanGeneration) return;
            if (work?.scanState?.enqueueSortPending) {
                work.scanState.enqueueSortPending = false;
                this.plugin.sortAutoTranslationQueue();
            }
            if (index < tasks.length) {
                this.plugin.scheduleIncrementalMessageScanCallback(runSlice);
                return;
            }
            if (work) {
                const finishStartedAt = this.plugin.getDiagnosticTime();
                this.plugin.finishAutoTranslationScanWork(work);
                this.plugin.logSlowOperation("scan.incremental-finish", finishStartedAt, {
                    candidates: Number(work.scanStats?.candidates || 0),
                    queued: Number(work.scanStats?.enqueued || 0)
                }, 16);
            }
        };

        this.plugin.scheduleIncrementalMessageScanCallback(runSlice);
    },

    scheduleIncrementalMessageScanCallback(callback) {
        if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
            this.plugin.incrementalMessageScanIdleCallback = window.requestIdleCallback(callback, { timeout: 1000 });
            return;
        }
        this.plugin.incrementalMessageScanTimer = setTimeout(() => callback(null), 0);
        this.plugin.unrefTimer(this.plugin.incrementalMessageScanTimer);
    },

    cancelIncrementalMessageScan() {
        this.plugin.incrementalMessageScanGeneration = Number(this.plugin.incrementalMessageScanGeneration || 0) + 1;
        if (this.plugin.incrementalMessageScanIdleCallback !== null) {
            try { window.cancelIdleCallback?.(this.plugin.incrementalMessageScanIdleCallback); }
            catch {}
        }
        if (this.plugin.incrementalMessageScanTimer) clearTimeout(this.plugin.incrementalMessageScanTimer);
        this.plugin.incrementalMessageScanIdleCallback = null;
        this.plugin.incrementalMessageScanTimer = null;
    },

    getCurrentRouteKey() {
        const route = this.plugin.messageTracker.getRouteIds();
        return [route.guildId || "", route.channelId || "", route.messageId || ""].join(":");
    },

    createScanContext(options = {}) {
        const allMessageNodes = this.plugin.getScanContextMessageNodes(options);
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
    },

    getScanContextMessageNodes(options = {}) {
        if (Array.isArray(options.messageNodes)) return [...options.messageNodes];
        const roots = Array.isArray(options.roots) ? options.roots : [];
        if (roots.length) {
            const nodes = [];
            roots.forEach(root => {
                if (!root || root.isConnected === false || root.nodeType !== 1) return;
                if (this.plugin.isDiscordMessageElement(root)) {
                    nodes.push(root);
                    return;
                }
                nodes.push(...(root.querySelectorAll?.(DISCORD_MESSAGE_NODE_SELECTOR) || []));
            });
            return this.dedupeNestedMessageNodes(nodes);
        }
        if (typeof document === "undefined" || typeof document.querySelectorAll !== "function") return [];
        return this.dedupeNestedMessageNodes([...document.querySelectorAll(DISCORD_MESSAGE_NODE_SELECTOR)]);
    },

    getScanMessageNodes(allMessageNodes, context = null) {
        const sorted = [...new Set(allMessageNodes || [])]
            .filter(node => node?.isConnected && node?.getBoundingClientRect);
        const visibleIndexes = [];
        sorted.forEach((node, index) => {
            if (this.isMessageNodeVisibleForScan(node, context)) visibleIndexes.push(index);
        });

        if (!visibleIndexes.length) {
            if (!this.plugin.isAutoTranslationPrefetchConfigured()) return [];
            const selected = sorted
                .filter(node => this.isMessageNodeNearForScan(node, context))
                .sort((left, right) => this.plugin.getViewportPriority(left, context) - this.plugin.getViewportPriority(right, context));
            this.rememberScanRangeElements(selected, context);
            return selected;
        }

        const prefetchRange = this.plugin.isAutoTranslationPrefetchConfigured()
            ? Math.max(this.plugin.getAutoTranslatePrefetchRange(), AUTO_TRANSLATE_EDGE_OVERSCAN_MESSAGES)
            : 0;
        const first = Math.max(0, Math.min(...visibleIndexes) - prefetchRange);
        const last = Math.min(sorted.length - 1, Math.max(...visibleIndexes) + prefetchRange);
        const selected = sorted
            .slice(first, last + 1)
            .filter(node => this.isMessageNodeVisibleForScan(node, context) || prefetchRange > 0);

        this.rememberScanRangeElements(selected, context);
        return selected.sort((left, right) => this.plugin.getViewportPriority(left, context) - this.plugin.getViewportPriority(right, context));
    },

    isMessageNodeVisibleForScan(messageNode, context = null) {
        if (this.plugin.isElementVisibleInViewportCached(messageNode, context)) return true;
        return this.plugin.getMessageContentCandidates(messageNode)
            .some(candidate => this.plugin.isElementVisibleInViewportCached(candidate, context));
    },

    isMessageNodeNearForScan(messageNode, context = null) {
        if (this.plugin.isElementNearViewport(messageNode, SCAN_VIEWPORT_BUFFER_PX, context)) return true;
        return this.plugin.getMessageContentCandidates(messageNode)
            .some(candidate => this.plugin.isElementNearViewport(candidate, SCAN_VIEWPORT_BUFFER_PX, context));
    },

    rememberScanRangeElements(elements = [], context = null) {
        if (!context?.scanRangeElements?.add) return;
        elements.forEach(element => {
            if (element) context.scanRangeElements.add(element);
        });
    },

    getCachedElementRect(element, context = null) {
        if (!element?.getBoundingClientRect) return null;
        if (!context?.rectByElement) return element.getBoundingClientRect?.();
        if (!context.rectByElement.has(element)) {
            context.rectByElement.set(element, element.getBoundingClientRect?.());
        }
        return context.rectByElement.get(element);
    },

    isElementVisibleInViewportCached(element, context = null) {
        if (!context?.visibleByElement) return this.plugin.isElementVisibleInViewport(element);
        if (!context.visibleByElement.has(element)) {
            context.visibleByElement.set(element, this.plugin.isElementVisibleForScan(element, this.getCachedElementRect(element, context), context));
        }
        return context.visibleByElement.get(element);
    },

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
        return this.plugin.isRectInsideScrollClips(element, elementRect, context, { checkHidden: true });
    },

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
    },

    getViewportPriority(element, context = null) {
        if (!element?.isConnected) return Number.MAX_SAFE_INTEGER;
        if (context?.priorityByElement?.has(element)) return context.priorityByElement.get(element);
        const rect = this.getCachedElementRect(element, context);
        if (!rect || rect.width <= 0 || rect.height <= 0) return Number.MAX_SAFE_INTEGER;
        const height = window.innerHeight || document.documentElement.clientHeight || 0;
        const width = window.innerWidth || document.documentElement.clientWidth || 0;
        const visible = context
            ? this.plugin.isElementVisibleInViewportCached(element, context)
            : this.plugin.isElementVisibleInViewport(element, rect);
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
    },

    isAutoTranslationTargetInScanRange(element, context = null) {
        return this.plugin.isElementVisibleInViewportCached(element, context)
            || this.plugin.isElementNearViewport(element, SCAN_VIEWPORT_BUFFER_PX, context)
            || this.isElementInsideScanRangeMessage(element, context);
    },

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
};

const CHAT_OBSERVER_METHOD_NAMES = attachControllerMethods(DiscordChatObserverController, [methods]);

module.exports = {
    DiscordChatObserverController,
    CHAT_OBSERVER_METHOD_NAMES
};
