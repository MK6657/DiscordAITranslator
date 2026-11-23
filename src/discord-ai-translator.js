"use strict";

const { TranslationRenderer } = require("./auto-translation/translation-renderer");
const { ComposerWriter } = require("./composer/composer-writer");
const { ComposerUiController, COMPOSER_UI_METHOD_NAMES } = require("./composer");
const { DisposableScope } = require("./core/disposable-scope");
const { EventBus } = require("./core/event-bus");
const { SettingsSchema, SETTINGS_TABS_DEFINITION } = require("./settings/settings-schema");
const { PLUGIN_CSS } = require("./styles");
const { AutoTranslationTaskState } = require("./auto-translation/task-state");
const { AutoTranslationStateMachine } = require("./auto-translation/state-machine");
const { AutoTranslationCooldownStore } = require("./auto-translation/cooldown-store");
const { AutoTranslationRequestPipeline } = require("./auto-translation/request-pipeline");
const { AutoTranslationQueueCore } = require("./auto-translation/queue-core");
const { DiagnosticsRecorder } = require("./diagnostics/diagnostics-recorder");
const { OutputGuard } = require("./validation/output-guard");
const { TranslationCacheStore } = require("./cache/translation-cache-store");
const { PLUGIN_VERSION } = require("./version");
const { ProviderLayer } = require("./providers/provider-layer");
const { SettingsStore } = require("./settings/settings-store");
const { SettingsUiController, SETTINGS_UI_METHOD_NAMES } = require("./settings/ui");
const { installPrototypeBridge, installStateProxies } = require("./core/delegate-methods");
const { QuickPanel } = require("./quick-panel/quick-panel");
const { PanelTheme } = require("./settings/panel-theme");
const { DiscordHostAdapter, DISCORD_HOST_BRIDGES } = require("./discord/host-adapter");
const { TranslationScheduler } = require("./auto-translation/scheduler");
const { ServiceProfilesController, SERVICE_PROFILES_METHOD_NAMES } = require("./settings/service-profiles");
const { PromptPolicyController, PROMPT_POLICY_METHOD_NAMES } = require("./validation/prompt-policy");
const { ManualTranslationController, MANUAL_TRANSLATION_METHOD_NAMES } = require("./auto-translation/manual-translation");
const {
    PLUGIN_NAME,
    CACHE_DATA_KEY,
    DIAGNOSTIC_DATA_KEY,
    STYLE_ID,
    PROVIDER_ORDER,
    PROVIDER_CAPABILITIES,
    AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH,
    API_ENDPOINT_ERROR_MESSAGE_KEYS,
    DEFAULT_SETTINGS
} = require("./constants");
const { I18N } = require("./i18n");

module.exports = class DiscordAITranslator {
    constructor() {
        this.events = new EventBus();
        this.runtimeScope = new DisposableScope();
        this.autoStateMachine = new AutoTranslationStateMachine();
        this.autoCooldowns = new AutoTranslationCooldownStore();
        this.autoRequestPipeline = new AutoTranslationRequestPipeline(this);
        this.autoQueueCore = new AutoTranslationQueueCore(this);
        this.diagnosticsRecorder = new DiagnosticsRecorder(this);
        this.taskState = new AutoTranslationTaskState(this);
        this.outputGuard = new OutputGuard(this);
        this.translationCacheStore = new TranslationCacheStore(this);
        this.providerLayer = new ProviderLayer(this);
        this.settingsStore = new SettingsStore(this);
        this.settingsUi = new SettingsUiController(this);
        this.settings = this.clone(DEFAULT_SETTINGS);
        this.isStarted = true;
        this.discordHost = new DiscordHostAdapter(this);
        this.messageTracker = this.discordHost.messageTracker;
        this.chatObserver = this.discordHost.chatObserver;
        this.launcherTheme = this.discordHost.launcherTheme;
        this.messageExtractor = this.discordHost.messageExtractor;
        this.scrollAnchor = this.discordHost.scrollAnchor;
        this.translationLineDom = this.discordHost.translationLineDom;
        this.slateComposer = this.discordHost.slateComposer;
        this.translationScheduler = new TranslationScheduler(this);
        this.translationRenderer = new TranslationRenderer(this, {
            heavyTextLength: AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH
        });
        this.composerWriter = new ComposerWriter(this);
        this.composerUi = new ComposerUiController(this);
        this.quickPanel = new QuickPanel(this);
        this.panelTheme = new PanelTheme(this);
        this.serviceProfiles = new ServiceProfilesController(this);
        this.promptPolicy = new PromptPolicyController(this);
        this.manualTranslation = new ManualTranslationController(this);
        this.settingsSchema = new SettingsSchema({
            tabs: SETTINGS_TABS_DEFINITION,
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
        this.diagnosticLogsLoaded = false;
        this.diagnosticLogsDirtyTimer = null;
        this.diagnosticLogsDirtyAt = 0;
        this.diagnosticLogsDirty = false;
        this.diagnosticLogsPersistenceDeferredSince = 0;
        this.translationRequests = new Map();
        // Messages whose translation line the user hid: dismiss key -> hiddenAt.
        this.dismissedTranslationMessages = new Map();
        this.translationLineTexts = typeof WeakMap === "function" ? new WeakMap() : null;
        this.autoTranslationLastExternalScrollAt = 0;
        this.autoTranslationOwnScrolls = new WeakMap();
        this.cachedTranslationDrawTimer = null;
        this.cachedTranslationDrawIdle = null;
        this.cachedDrawMemo = new Map();
        this.cachedDrawMessageMemo = new WeakMap();
        this.cachedDrawScroller = null;
        this.localProviderHealthChecks = new Map();
        this.localProviderHealthProbeStartedAt = new Map();
        this.localProviderHealthyKeys = new Set();
        this.localProviderDetectedModels = new Map();
        this.localProviderModelDetections = new Map();
        this.lifecycleToken = 0;
        this.autoTranslationViewportBusyUntil = 0;
        this.autoTranslationViewportStableAnchor = "";
        this.autoTranslationViewportStableScans = 0;
        this.autoTranslationViewportRequiresStableScan = false;
        this.autoTranslationJumpCooldownUntil = 0;
        this.autoTranslationRenderPausedUntil = 0;
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
        // The launcher press in progress ({ pointerId }), so its pointerup and click do not toggle the panel again.
        this.quickSettingsPress = null;
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
        this.mediaViewerQuietUntil = 0;
        this.mediaViewerProbeAt = 0;
        this.mediaViewerProbeOpen = false;
        this.inputComposerBusyUntil = 0;
        this.unpatches = [];
        this.boundKeydown = this.handleKeydown.bind(this);
        this.boundViewportScan = this.queueViewportScan.bind(this);
        this.inputButtonScanTimer = null;
        this.inputButtonScanDueAt = 0;
        this.lightweightButtonRecoveryRoots = new Set();
        this.lightweightButtonRecoveryTimer = null;
        this.nonTranslatableMessageCache = typeof WeakMap === "function" ? new WeakMap() : null;
        this.lastMissingMessageButtonSweepAt = 0;
        this.inputActionMenu = null;
        this.inputActionMenuCleanup = null;
        this.polishPresetMenu = null;
        this.polishPresetMenuCleanup = null;
        this.polishPresetMenuAnchor = null;
        this.textboxReplacementCleanupToken = 0;
        this.textboxReplacementCleanupRemove = null;
        this.textboxReplacementCleanupTimers = [];
        this.textboxReplacementCleanupRafs = [];
        this.polishSession = null;
        this.latestPolishRequestIds = new WeakMap();
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
        this.runtimeScope.reset();
        try {
            this.resetDiscordMessageStoreCache();
            const unsavedDiagnostics = Boolean(this.diagnosticLogsDirty);
            if (!unsavedDiagnostics) {
                this.diagnosticLogs = [];
                this.diagnosticCompressedCount = 0;
                this.diagnosticLogsLoaded = false;
            }
            if (!this.settingsLoadBlocked && this.settingsDirty) {
                this.flushSettings({ retryOnError: false });
            }
            const settingsLoaded = (this.settingsLoadBlocked || !this.settingsDirty) && this.loadSettings() === true;
            try { this.migrateLegacyDataStores(); }
            catch (error) { this.warnSanitized("Data store migration failed; old data kept", error); }
            if (settingsLoaded && this.settingsStore.diagnosticsDisabledInStoredSettings) {
                const storedDiagnostics = unsavedDiagnostics ? null : this.loadData(DIAGNOSTIC_DATA_KEY);
                const storedLogs = Array.isArray(storedDiagnostics) ? storedDiagnostics : storedDiagnostics?.logs;
                if (unsavedDiagnostics || (!this.dataLoadFailures.has(DIAGNOSTIC_DATA_KEY) && Array.isArray(storedLogs) && storedLogs.length)) {
                    this.disableDiagnosticLogging();
                }
            }
            else if (unsavedDiagnostics) {
                if (this.flushDiagnosticLogs({ retryOnError: false }) === false) this.scheduleDiagnosticLogsPersist();
            }
            else if (this.settings.ui?.diagnosticsEnabled) {
                this.loadDiagnosticLogs({ keepLogged: true });
            }
            if (this.translationCacheDirty) this.flushTranslationCache({ retryOnError: false });
            if (!this.translationCacheDirty) this.loadTranslationCache();
            else this.scheduleTranslationCachePersist();
            this.injectStyles();
            this.panelTheme.startWatching();
            this.patchMessageContextMenu();
            this.startObserver();
            document.addEventListener("keydown", this.boundKeydown, true);
            window.addEventListener("scroll", this.boundViewportScan, { capture: true, passive: true });
            window.addEventListener("resize", this.boundViewportScan, { capture: true, passive: true });
            window.addEventListener("focus", this.boundViewportScan, { capture: true, passive: true });
            document.addEventListener("visibilitychange", this.boundViewportScan, true);
            window.addEventListener("pagehide", this.getPageHideHandler(), true);
            window.addEventListener("beforeunload", this.getPageHideHandler(), true);
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
        this.runtimeScope.dispose();
        if (this.observer) this.observer.disconnect();
        if (this.observerLifecycle) this.observerLifecycle.disconnect();
        this.panelTheme.stopWatching();
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
        this.cleanupQuickSettingsLauncherObserver();
        this.cancelQuickSettingsModalVerify();
        if (this.autoTranslationRetryTimer) clearTimeout(this.autoTranslationRetryTimer);
        this.cancelAutoTranslationRenderQueue();
        this.clearTranslationErrorWaitTimers();
        if (this.settingsDirtyTimer) clearTimeout(this.settingsDirtyTimer);
        if (this.translationCacheDirtyTimer) clearTimeout(this.translationCacheDirtyTimer);
        if (this.googleTranslateRuntimeDirtyTimer) clearTimeout(this.googleTranslateRuntimeDirtyTimer);
        if (this.diagnosticLogsDirtyTimer) clearTimeout(this.diagnosticLogsDirtyTimer);
        this.apiRequestsClosed = true;
        this.abortActiveApiRequests();
        this.composerWriter.cancelAll("stop");
        this.clearHotkeyRecording();
        this.clearPolishSubmitTimer();
        this.cancelPendingConfirmDialogs();
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
        window.removeEventListener("pagehide", this.getPageHideHandler(), true);
        window.removeEventListener("beforeunload", this.getPageHideHandler(), true);
        this.removePolishResultPanel();
        this.removePolishRestoreControl();
        this.removeInputActionMenu();
        this.removePolishPresetMenu();
        this.cancelLightweightButtonRecovery();
        this.nonTranslatableMessageCache = typeof WeakMap === "function" ? new WeakMap() : null;
        this.lastMissingMessageButtonSweepAt = 0;
        this.polishSession = null;
        this.latestPolishRequestIds = new WeakMap();
        this.closeQuickSettingsPanel(null, "stop");
        this.quickPanel.destroy("stop");
        document.querySelectorAll?.(".dait-settings")?.forEach(panel => this.destroySettingsModalSizing(panel));
        this.restoreAllTranslationSourceVisibility();
        document.querySelectorAll(".dait-message-button, .dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-preset-menu, .dait-quick-settings-button, .dait-translation-line, .dait-translation-box, .dait-input-action-group").forEach(node => node.remove());
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
        if (this.overviewStatusRefreshTimer) {
            clearTimeout(this.overviewStatusRefreshTimer);
            this.overviewStatusRefreshTimer = null;
        }
        this.quickSettingsPress = null;
        if (diagnosticLogsPersisted) this.quickSettingsDiagnosticLogs = [];
        if (translationCachePersisted) this.persistentTranslationCacheCount = 0;
        if (diagnosticLogsPersisted) {
            this.diagnosticLogs = [];
            this.diagnosticCompressedCount = 0;
            this.diagnosticLogsLoaded = false;
        }
        this.diagnosticLogsDirtyTimer = null;
        this.diagnosticLogsDirtyAt = 0;
        this.diagnosticLogsDirty = !diagnosticLogsPersisted;
        this.diagnosticLogsPersistenceDeferredSince = 0;
        this.translationRequests.clear();
        this.autoStateMachine.resetAll();
        this.autoCooldowns.clearAll();
        this.cancelCachedTranslationDrawPass();
        this.cachedDrawMemo.clear();
        this.cachedDrawMessageMemo = new WeakMap();
        this.cachedDrawScroller = null;
        // The observer that invalidates these is disconnected: a message edited while the plugin is
        // off must be read again, and style changes marked above are never observed.
        this.elementTextCache = typeof WeakMap === "function" ? new WeakMap() : null;
        this.translationSourceStyleMutationCounts = typeof WeakMap === "function" ? new WeakMap() : null;
        this.pendingMutationScanRoots?.clear?.();
        this.autoTranslationOwnScrolls = new WeakMap();
        this.autoTranslationLastExternalScrollAt = 0;
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
        this.resetDiscordMessageStoreCache();
        this.discordHost?.resetRuntimeCaches?.();
    }

    getPageHideHandler() {
        if (!this.boundPageHide) this.boundPageHide = () => this.flushPendingPersistence("pagehide");
        return this.boundPageHide;
    }

    // A reload or quit may not call stop(), so save what the debounce and busy-deferral timers still hold.
    // Each flush is a no-op when nothing is dirty; none of them schedules a retry.
    flushPendingPersistence(reason = "pagehide") {
        const results = {};
        [
            ["cache", () => this.flushTranslationCache({ retryOnError: false })],
            ["google", () => this.flushGoogleTranslateRuntimeState({ retryOnError: false })],
            ["settings", () => this.flushSettings({ retryOnError: false })],
            ["diagnostics", () => this.flushDiagnosticLogs({ retryOnError: false })]
        ].forEach(([name, flush]) => {
            try { results[name] = flush() !== false; }
            catch (error) {
                results[name] = false;
                this.warnSanitized(`Persist on ${reason} failed for ${name}`, error);
            }
        });
        return results;
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

    getLocale() {
        return I18N[this.settings.ui?.language] ? this.settings.ui.language : "zh-CN";
    }

    t(key, vars = {}) {
        const locale = this.getLocale();
        const template = I18N[locale]?.[key] ?? I18N.en[key] ?? key;
        return String(template).replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match);
    }

    // --- Delegators to QuickPanel (the launcher's compact popover and status badge). ---
    toggleQuickPopover(...args) { return this.quickPanel.toggle(...args); }
    openQuickPopover(...args) { return this.quickPanel.open(...args); }
    closeQuickPopover(...args) { return this.quickPanel.close(...args); }
    isQuickPopoverOpen(...args) { return this.quickPanel.isOpen(...args); }
    getLauncherStatus(...args) { return this.quickPanel.getStatus(...args); }
    requestLauncherStatusUpdate(...args) { return this.quickPanel.requestStatusUpdate(...args); }

    formatError(error, options = {}) {
        const message = this.getFriendlyErrorMessage(error, options);
        return message.length > 480 ? `${message.slice(0, 480)}...` : message;
    }

    // options.includeRetry: add the automatic retry wait; only auto-translation notices
    // want it (for polish or manual translation it is an internal scheduling detail).
    getFriendlyErrorMessage(error, options = {}) {
        const status = Number(error?.status || 0);
        const rawMessage = String(error?.message || "");
        // HTTP errors and Baidu error codes carry provider text, never shown as-is.
        const providerCoded = rawMessage === "API_ERROR" || Boolean(error?.baiduApiError);
        const internalMessageKeys = {
            MODEL_OUTPUT_TRUNCATED: "errorOutputTruncated",
            DATA_SAVE_FAILED: "errorSaveFailed",
            DATA_SAVE_UNAVAILABLE: "errorSaveFailed"
        };
        let message = "";
        if (this.isRequestCancelled(error)) message = this.t("errorCancelled");
        else if (Object.hasOwn(API_ENDPOINT_ERROR_MESSAGE_KEYS, error?.code)) message = this.t(API_ENDPOINT_ERROR_MESSAGE_KEYS[error.code]);
        else if (error?.code === "CLIPBOARD_UNAVAILABLE") message = this.t("clipboardUnavailable");
        else if (error?.manualTranslationRescueFailed) message = this.t("manualTranslateRescueFailed");
        else if (error?.modelOutputTruncated) message = this.t("errorOutputTruncated");
        else if (this.isTimeoutError(error)) message = this.t("errorTimeout");
        else if (error?.localProviderUnavailable) message = this.t("errorLocalProviderUnavailable");
        else if (providerCoded && error?.providerLanguageUnsupported) message = this.t("errorLanguageUnsupported");
        else if (providerCoded && error?.providerIpRejected) message = this.t("errorIpNotAllowed");
        else if (providerCoded && error?.providerRequestRejected) message = this.t("errorProviderRequestRejected");
        else if (providerCoded && (error?.providerRateLimited || status === 429)) message = this.t("errorRateLimited");
        else if (providerCoded && (error?.providerQuotaExceeded || error?.googleTranslateQuotaExceeded || status === 402)) message = this.t("errorQuotaExceeded");
        else if (providerCoded && (error?.providerAuthFailed || status === 401 || status === 403)) message = this.t("errorUnauthorized");
        else if (providerCoded && (error?.providerServerError || status >= 500)) message = this.t("errorServer");
        else if (status === 401 || status === 403) message = this.t("errorUnauthorized");
        else if (status === 429) message = this.t("errorRateLimited");
        else if (status >= 500) message = this.t("errorServer");
        else if (this.isNetworkError(error)) message = this.t("errorNetwork");
        else if (error?.baiduApiError) message = this.t("errorProviderRequestRejected");
        else if (rawMessage === "API_ERROR") {
            // A wrong base URL (404/405) or model name is fixed in the endpoint and model settings.
            if (status === 404 || status === 405 || error?.providerModelNotFound) message = this.t("errorEndpointNotFound");
            else message = status >= 400 && status < 500 ? this.t("errorProviderRequestRejected") : status ? `API ${status}` : this.t("unknownError");
        }
        else if (Object.hasOwn(internalMessageKeys, rawMessage)) message = this.t(internalMessageKeys[rawMessage]);
        // Any other ALL_CAPS code is internal; never show it to the user.
        else if (/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/.test(rawMessage)) message = this.t("unknownError");
        else message = String(error?.message || error || this.t("unknownError"));

        const details = [];
        if (status) details.push(String(status));
        if (error?.baiduErrorCode) details.push(String(error.baiduErrorCode));
        const retryAfterMs = Number(error?.retryAfterMs) || 0;
        if (options.includeRetry && retryAfterMs > 0 && retryAfterMs <= 60 * 60 * 1000 && !error?.modelOutputTruncated) {
            details.push(`${Math.ceil(retryAfterMs / 1000)}s`);
        }
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

    // Rebuilds every open settings panel (BetterDiscord's plugin settings and the settings window) so they
    // show the values after a reset. Each one opens on the tab it showed, and the stored tab is the one of the
    // panel the reset came from, whose new reset button takes the focus.
    refreshOpenSettingsPanels(sourcePanel = null) {
        if (typeof document === "undefined") return 0;
        const panels = new Set();
        if (sourcePanel) panels.add(sourcePanel);
        document.querySelectorAll?.(".dait-settings")?.forEach(panel => panels.add(panel));
        const sourceTab = sourcePanel?.__daitSettingsUi?.activeTab;
        let replaced = 0;
        let rebuiltSource = null;
        panels.forEach(panel => {
            if (!panel || panel.isConnected === false) return;
            const quickSettings = Boolean(panel.closest?.(".dait-quick-settings-modal-root"));
            // The reset put the default tab back; the new panel is built on the tab this one shows.
            const activeTab = panel.__daitSettingsUi?.activeTab;
            if (activeTab && this.settings?.ui) this.settings.ui.settingsActiveTab = activeTab;
            const next = this.replaceSettingsPanelElement(panel, this.getSettingsPanel({ quickSettings }));
            if (!next) return;
            replaced++;
            if (panel === sourcePanel) rebuiltSource = next;
        });
        if (sourceTab && this.settings?.ui) this.settings.ui.settingsActiveTab = sourceTab;
        if (rebuiltSource) this.focusSettingsResetControl(rebuiltSource);
        return replaced;
    }

    // The focused reset button left with the old panel. BetterDiscord's dialog hands the focus back to it once it
    // has finished closing, which leaves the focus nowhere, so the new button is focused again then.
    focusSettingsResetControl(panel) {
        const target = () => {
            const button = panel?.querySelector?.("[data-dait-action='resetSettings']");
            if (button && !button.closest?.("[hidden]")) return button;
            const state = panel?.__daitSettingsUi;
            return state?.tabs?.find(tab => tab.id === state.activeTab)?.button || null;
        };
        this.focusSettingsElement(target());
        if (typeof setTimeout !== "function") return;
        [300, 1000].forEach(delay => this.unrefTimer(setTimeout(() => {
            if (!panel?.isConnected || typeof document === "undefined") return;
            const active = document.activeElement;
            if (!active || active === document.body || active.isConnected === false) this.focusSettingsElement(target());
        }, delay)));
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
    getDataStoreName(...args) { return this.settingsStore.getDataStoreName(...args); }
    migrateLegacyDataStores(...args) { return this.settingsStore.migrateLegacyDataStores(...args); }
    migrateLegacyDataStoreKey(key) {
        if (key === CACHE_DATA_KEY) return this.translationCacheStore.migrateLegacyTranslationCache();
        return this.settingsStore.migrateLegacyDataStoreKey(key);
    }
    mergeLegacyDataPayload(...args) { return this.settingsStore.mergeLegacyDataPayload(...args); }
    resetSettingsToDefaults(...args) { return this.settingsStore.resetSettingsToDefaults(...args); }
    applySettingsResetEffects(...args) { return this.settingsStore.applySettingsResetEffects(...args); }
    syncAllSettingControls(...args) { return this.settingsStore.syncAllSettingControls(...args); }
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
    normalizePromptTemplateCategory(...args) { return this.settingsStore.normalizePromptTemplateCategory(...args); }
    ensurePromptTemplateSerials(...args) { return this.settingsStore.ensurePromptTemplateSerials(...args); }
    getNextPromptTemplateSerial(...args) { return this.settingsStore.getNextPromptTemplateSerial(...args); }
    applyPromptTemplate(...args) { return this.settingsStore.applyPromptTemplate(...args); }
    savePromptTemplate(...args) { return this.settingsStore.savePromptTemplate(...args); }
    updatePromptTemplate(...args) { return this.settingsStore.updatePromptTemplate(...args); }
    deletePromptTemplate(...args) { return this.settingsStore.deletePromptTemplate(...args); }
    isBuiltInPromptTemplateId(...args) { return this.settingsStore.isBuiltInPromptTemplateId(...args); }
    getMissingBuiltInPromptTemplates(...args) { return this.settingsStore.getMissingBuiltInPromptTemplates(...args); }
    seedMissingBuiltInPromptTemplates(...args) { return this.settingsStore.seedMissingBuiltInPromptTemplates(...args); }
    restoreMissingBuiltInPromptTemplates(...args) { return this.settingsStore.restoreMissingBuiltInPromptTemplates(...args); }

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
    getPersistableLocalProviderDetectedModels(...args) { return this.providerLayer.getPersistableLocalProviderDetectedModels(...args); }
    restoreLocalProviderDetectedModels(...args) { return this.providerLayer.restoreLocalProviderDetectedModels(...args); }
    getEffectiveChatCompletionModel(...args) { return this.providerLayer.getEffectiveChatCompletionModel(...args); }
    refreshLocalProviderDetectedModel(...args) { return this.providerLayer.refreshLocalProviderDetectedModel(...args); }
    fetchLocalProviderDetectedModel(...args) { return this.providerLayer.fetchLocalProviderDetectedModel(...args); }
    getLocalProviderModelsEndpoint(...args) { return this.providerLayer.getLocalProviderModelsEndpoint(...args); }
    parseLocalProviderModelsResponse(...args) { return this.providerLayer.parseLocalProviderModelsResponse(...args); }
    detectProviderModels(...args) { return this.providerLayer.detectProviderModels(...args); }
    isModelDetectionProvider(...args) { return this.providerLayer.isModelDetectionProvider(...args); }
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
    getGoogleTranslateCoolingKeyReadyAt(...args) { return this.providerLayer.getGoogleTranslateCoolingKeyReadyAt(...args); }
    createGoogleTranslateCooldownError(...args) { return this.providerLayer.createGoogleTranslateCooldownError(...args); }
    formatGoogleTranslateCooldownMessage(...args) { return this.providerLayer.formatGoogleTranslateCooldownMessage(...args); }
    formatGoogleTranslateKeyError(...args) { return this.providerLayer.formatGoogleTranslateKeyError(...args); }
    getGoogleTranslateKeyDisplayLabel(...args) { return this.providerLayer.getGoogleTranslateKeyDisplayLabel(...args); }
    isGoogleTranslatePoolServing(...args) { return this.providerLayer.isGoogleTranslatePoolServing(...args); }
    getGoogleTranslateQuotaRetryAfterMs(...args) { return this.providerLayer.getGoogleTranslateQuotaRetryAfterMs(...args); }
    getGoogleTranslateDailyQuotaRetryAfterMs(...args) { return this.providerLayer.getGoogleTranslateDailyQuotaRetryAfterMs(...args); }
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
    getTargetLanguageCode(...args) { return this.providerLayer.getTargetLanguageCode(...args); }
    getEffectiveRequestApiKey(...args) { return this.providerLayer.getEffectiveRequestApiKey(...args); }
    getRequestHeaders(...args) { return this.providerLayer.getRequestHeaders(...args); }
    hasUsableApiConfig(...args) { return this.providerLayer.hasUsableApiConfig(...args); }
    setApiStatus(...args) { const result = this.providerLayer.setApiStatus(...args); this.quickPanel?.noteApiStatus?.(args[4] ?? args[0]?.dataset?.daitKind, args[1]); this.quickPanel?.requestStatusUpdate(); return result; }
    setApiRuntimeStatus(...args) { const result = this.providerLayer.setApiRuntimeStatus(...args); this.quickPanel?.noteApiStatus?.(args[0], args[1]); this.quickPanel?.requestStatusUpdate(); return result; }
    markLocalProviderHealthy(...args) { return this.providerLayer.markLocalProviderHealthy(...args); }
    shouldBlockAutoTranslationForLocalProviderHealth(...args) { return this.providerLayer.shouldBlockAutoTranslationForLocalProviderHealth(...args); }
    getLocalProviderHealthProbeRetryMs(...args) { return this.providerLayer.getLocalProviderHealthProbeRetryMs(...args); }
    getLocalProviderHealthRetryMs(...args) { return this.providerLayer.getLocalProviderHealthRetryMs(...args); }
    startLocalProviderHealthProbe(...args) { return this.providerLayer.startLocalProviderHealthProbe(...args); }
    resetApiStatus(...args) { return this.providerLayer.resetApiStatus(...args); }
    getApiStatus(...args) { return this.providerLayer.getApiStatus(...args); }
    // Contract (settings + quick panel): { ok, model, latencyMs, at, message } of the last connection test, or null.
    getLastApiTestResult(...args) { return this.providerLayer.getLastApiTestResult(...args); }
    recordApiTestResult(...args) { return this.providerLayer.recordApiTestResult(...args); }
    clearLastApiTestResult(...args) { return this.providerLayer.clearLastApiTestResult(...args); }
    isApiTestRunning(...args) { return this.providerLayer.isApiTestRunning(...args); }
    getReportedResponseModel(...args) { return this.providerLayer.getReportedResponseModel(...args); }
    getApiTestModel(...args) { return this.providerLayer.getApiTestModel(...args); }
    getProviderFallbackOrder(...args) { return this.providerLayer.getProviderFallbackOrder(...args); }
    shouldTryProviderFallback(...args) { return this.providerLayer.shouldTryProviderFallback(...args); }
    getProviderFallbackConfig(...args) { return this.providerLayer.getProviderFallbackConfig(...args); }
    tryProviderFallbackModelTask(...args) { return this.providerLayer.tryProviderFallbackModelTask(...args); }
    getCurrentMonthKey(...args) { return this.providerLayer.getCurrentMonthKey(...args); }
    normalizeGoogleTranslateMonthlyLimit(...args) { return this.providerLayer.normalizeGoogleTranslateMonthlyLimit(...args); }
    parseGoogleTranslateKeyPoolText(...args) { return this.providerLayer.parseGoogleTranslateKeyPoolText(...args); }
    formatGoogleTranslateKeyPoolText(...args) { return this.providerLayer.formatGoogleTranslateKeyPoolText(...args); }
    normalizeGoogleTranslateKeyPool(...args) { return this.providerLayer.normalizeGoogleTranslateKeyPool(...args); }
    getGoogleTranslateUsageLedger(...args) { return this.providerLayer.getGoogleTranslateUsageLedger(...args); }
    getAutoTranslationProviderKey(...args) { return this.providerLayer.getAutoTranslationProviderKey(...args); }
    getGoogleTranslateProviderKey(...args) { return this.providerLayer.getGoogleTranslateProviderKey(...args); }
    runModelTask(...args) { return this.providerLayer.runModelTask(...args); }
    runModelTaskWithResult(...args) { const result = this.providerLayer.runModelTaskWithResult(...args); this.quickPanel?.watchRequestResult?.(args[0], args[2], result); return result; }
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
    annotateChatCompletionApiError(...args) { return this.providerLayer.annotateChatCompletionApiError(...args); }
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
    getServedModelTranslationCacheKey(...args) { return this.translationCacheStore.getServedModelTranslationCacheKey(...args); }
    hasLegacyTranslationCacheEntries(...args) { return this.translationCacheStore.hasLegacyTranslationCacheEntries(...args); }
    rememberPreEmojiSourceText(...args) { return this.translationCacheStore.rememberPreEmojiSourceText(...args); }
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
    mergePersistedTranslationCachePayloads(...args) { return this.translationCacheStore.mergePersistedTranslationCachePayloads(...args); }
    getTranslationCacheMessageCount(...args) { return this.translationCacheStore.getTranslationCacheMessageCount(...args); }
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
    guardGeneratedMassMentions(...args) { return this.outputGuard.guardGeneratedMassMentions(...args); }
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
    getPolishOutputLanguageViolation(...args) { return this.outputGuard.getPolishOutputLanguageViolation(...args); }
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
    mergePersistedDiagnosticLogsPayloads(...args) { return this.diagnosticsRecorder.mergePersistedDiagnosticLogsPayloads(...args); }
    scheduleDiagnosticLogsPersist(...args) { return this.diagnosticsRecorder.scheduleDiagnosticLogsPersist(...args); }
    flushDiagnosticLogs(...args) { return this.diagnosticsRecorder.flushDiagnosticLogs(...args); }
    serializeDiagnosticLogs(...args) { return this.diagnosticsRecorder.serializeDiagnosticLogs(...args); }
    clearDiagnosticLogs(...args) { return this.diagnosticsRecorder.clearDiagnosticLogs(...args); }
    logAutoTranslationIntakeState(...args) { return this.diagnosticsRecorder.logAutoTranslationIntakeState(...args); }

    // --- Delegators to AutoTranslationQueueCore (Phase 6 pre-step A: auto-translation queue state, scheduling, failures, decisions, channel policy and timing windows.) ---
    shouldInvalidateAutoTranslationForSetting(...args) { return this.autoQueueCore.shouldInvalidateAutoTranslationForSetting(...args); }
    invalidateAutoTranslationQueue(...args) { const result = this.autoQueueCore.invalidateAutoTranslationQueue(...args); this.quickPanel?.requestStatusUpdate(); return result; }
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
    clearAutoTranslationProviderFailureForCurrentConfig(...args) { const result = this.autoQueueCore.clearAutoTranslationProviderFailureForCurrentConfig(...args); if ((args[0] ?? "translation") === "translation") this.quickPanel?.clearConfigError?.(); return result; }
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
    drainAutoTranslationQueue(...args) { const result = this.autoQueueCore.drainAutoTranslationQueue(...args); this.quickPanel?.requestStatusUpdate(); return result; }
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
    getChannelAutoTranslateAllowListCount(...args) { return this.autoQueueCore.getChannelAutoTranslateAllowListCount(...args); }
    refreshChannelRuleControls(...args) { return this.autoQueueCore.refreshChannelRuleControls(...args); }
    isAutoTranslationRequestCurrent(...args) { return this.autoQueueCore.isAutoTranslationRequestCurrent(...args); }
    isAutoTranslationRenderRequestCurrent(...args) { return this.autoQueueCore.isAutoTranslationRenderRequestCurrent(...args); }
    isSameAutoTranslationRouteScope(...args) { return this.autoQueueCore.isSameAutoTranslationRouteScope(...args); }
    autoTranslateQueuedMessage(...args) { return this.autoQueueCore.autoTranslateQueuedMessage(...args); }
    autoTranslateQueuedBatch(...args) { return this.autoQueueCore.autoTranslateQueuedBatch(...args); }
    settleFailedAutoTranslationBatchRequest(...args) { return this.autoQueueCore.settleFailedAutoTranslationBatchRequest(...args); }
    isAutoTranslationBatchFormatError(...args) { return this.autoQueueCore.isAutoTranslationBatchFormatError(...args); }
    requeueAutoTranslationItem(...args) { return this.autoQueueCore.requeueAutoTranslationItem(...args); }
    enqueueAutoTranslationItem(...args) { return this.autoQueueCore.enqueueAutoTranslationItem(...args); }
    hasActiveAutoTranslationKey(...args) { return this.autoQueueCore.hasActiveAutoTranslationKey(...args); }
    resolveActiveAutoTranslationKey(...args) { return this.autoQueueCore.resolveActiveAutoTranslationKey(...args); }
    pruneAutoTranslationActiveState(...args) { return this.autoQueueCore.pruneAutoTranslationActiveState(...args); }
    pruneAutoTranslationRenderPendingKeys(...args) { return this.autoQueueCore.pruneAutoTranslationRenderPendingKeys(...args); }
    getAutoTranslationRecentRenderKey(...args) { return this.autoQueueCore.getAutoTranslationRecentRenderKey(...args); }
    rememberRecentAutoTranslationRender(...args) { return this.autoQueueCore.rememberRecentAutoTranslationRender(...args); }
    getRecentAutoTranslationRender(...args) { return this.autoQueueCore.getRecentAutoTranslationRender(...args); }
    pruneRecentAutoTranslationRenders(...args) { return this.autoQueueCore.pruneRecentAutoTranslationRenders(...args); }
    rememberAutoTranslationPartialResult(...args) { return this.autoQueueCore.rememberAutoTranslationPartialResult(...args); }
    getAutoTranslationPartialResult(...args) { return this.autoQueueCore.getAutoTranslationPartialResult(...args); }
    touchAutoTranslationPartialResult(...args) { return this.autoQueueCore.touchAutoTranslationPartialResult(...args); }
    clearAutoTranslationPartialResult(...args) { return this.autoQueueCore.clearAutoTranslationPartialResult(...args); }
    pruneAutoTranslationPartialResults(...args) { return this.autoQueueCore.pruneAutoTranslationPartialResults(...args); }
    getAutoTranslationAbortSignal(...args) { return this.autoQueueCore.getAutoTranslationAbortSignal(...args); }
    abortAutoTranslationRequests(...args) { return this.autoQueueCore.abortAutoTranslationRequests(...args); }
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
    markAutoTranslationUndrawableResult(...args) { return this.autoQueueCore.markAutoTranslationUndrawableResult(...args); }
    getAutoTranslationStorageErrorForItem(...args) { return this.autoQueueCore.getAutoTranslationStorageErrorForItem(...args); }
    isWeakAutoTranslationPrefetchFailure(...args) { return this.autoQueueCore.isWeakAutoTranslationPrefetchFailure(...args); }
    pruneAutoTranslationFailureMapSize(...args) { return this.autoQueueCore.pruneAutoTranslationFailureMapSize(...args); }
    shouldMarkAutoTranslationProviderFailureForItem(...args) { return this.autoQueueCore.shouldMarkAutoTranslationProviderFailureForItem(...args); }
    isProviderWideAutoTranslationPrefetchFailure(...args) { return this.autoQueueCore.isProviderWideAutoTranslationPrefetchFailure(...args); }
    markAutoTranslationProviderFailure(...args) { const result = this.autoQueueCore.markAutoTranslationProviderFailure(...args); this.quickPanel?.noteRequestFailure?.(args[0], args[1]); this.quickPanel?.requestStatusUpdate(); return result; }
    getAutoTranslationProviderFailure(...args) { return this.autoQueueCore.getAutoTranslationProviderFailure(...args); }
    isAutoTranslationProviderCoolingDown(...args) { return this.autoQueueCore.isAutoTranslationProviderCoolingDown(...args); }
    getNextAutoTranslationFailureCount(...args) { return this.autoQueueCore.getNextAutoTranslationFailureCount(...args); }
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
    shouldStopLongAutoTranslationOnChunkError(...args) { return this.autoRequestPipeline.shouldStopLongAutoTranslationOnChunkError(...args); }
    shouldKeepLongAutoTranslationChunksOnError(...args) { return this.autoRequestPipeline.shouldKeepLongAutoTranslationChunksOnError(...args); }
    runLongAutoTranslationChunkManualRescue(...args) { return this.autoRequestPipeline.runLongAutoTranslationChunkManualRescue(...args); }
    runLongAutoTranslationSubchunkManualRescue(...args) { return this.autoRequestPipeline.runLongAutoTranslationSubchunkManualRescue(...args); }
    getLongTextChunkTranslationOptions(...args) { return this.autoRequestPipeline.getLongTextChunkTranslationOptions(...args); }
    runAutoTranslationModelAttempt(...args) { return this.autoRequestPipeline.runAutoTranslationModelAttempt(...args); }
    shouldSkipQuotedAutoTranslationCandidates(...args) { return this.autoRequestPipeline.shouldSkipQuotedAutoTranslationCandidates(...args); }
    getAutoTranslationOutputValidationOptions(...args) { return this.autoRequestPipeline.getAutoTranslationOutputValidationOptions(...args); }
    validateAutoTranslationBatchRow(...args) { return this.autoRequestPipeline.validateAutoTranslationBatchRow(...args); }
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
    runTruncatedAutoTranslationRetry(...args) { return this.autoRequestPipeline.runTruncatedAutoTranslationRetry(...args); }
    createAutoTranslationRequestBudget(...args) { return this.autoRequestPipeline.createAutoTranslationRequestBudget(...args); }
    getManualTranslationRequestBudgetLimit(...args) { return this.autoRequestPipeline.getManualTranslationRequestBudgetLimit(...args); }
    consumeAutoTranslationRequestBudget(...args) { return this.autoRequestPipeline.consumeAutoTranslationRequestBudget(...args); }
    isAutoTranslationRequestBudgetExhausted(...args) { return this.autoRequestPipeline.isAutoTranslationRequestBudgetExhausted(...args); }
    isAutoTranslationRequestBudgetError(...args) { return this.autoRequestPipeline.isAutoTranslationRequestBudgetError(...args); }
    shouldRunLocalAutoTranslationRepairRetry(...args) { return this.autoRequestPipeline.shouldRunLocalAutoTranslationRepairRetry(...args); }
    getTruncatedAutoTranslationRetryTimeoutMs(...args) { return this.autoRequestPipeline.getTruncatedAutoTranslationRetryTimeoutMs(...args); }
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

installPrototypeBridge(module.exports.prototype, "settingsUi", SETTINGS_UI_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "composerUi", COMPOSER_UI_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "serviceProfiles", SERVICE_PROFILES_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "promptPolicy", PROMPT_POLICY_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "manualTranslation", MANUAL_TRANSLATION_METHOD_NAMES);
for (const [prop, methodNames] of DISCORD_HOST_BRIDGES) {
    installPrototypeBridge(module.exports.prototype, prop, methodNames);
}
installStateProxies(module.exports.prototype, "autoStateMachine", {
    autoTranslationQueue: "queue",
    autoTranslationQueueSortDirty: "queueSortDirty",
    autoTranslationQueuedKeys: "queuedKeys",
    autoTranslationPendingTargets: "pendingTargets",
    autoTranslationInFlight: "inFlight",
    autoTranslationInFlightKeys: "inFlightKeys",
    autoTranslationVisibleLongInFlightKeys: "visibleLongInFlightKeys",
    autoTranslationInFlightStartedAt: "inFlightStartedAt",
    autoTranslationInFlightTokens: "inFlightTokens",
    autoTranslationInFlightTokenCounter: "inFlightTokenCounter",
    autoTranslationInFlightItems: "inFlightItems",
    autoTranslationPrefetchInFlight: "prefetchInFlight",
    autoTranslationRenderQueue: "renderQueue",
    autoTranslationRenderQueuedKeys: "renderQueuedKeys",
    autoTranslationRenderQueuedTasks: "renderQueuedTasks",
    autoTranslationRenderPendingKeys: "renderPendingKeys",
    autoTranslationRenderQueueDirty: "renderQueueDirty",
    autoTranslationRenderRaf: "renderRaf",
    autoTranslationRenderTimer: "renderTimer",
    autoTranslationRenderDueAt: "renderDueAt",
    autoTranslationConfigVersion: "configVersion",
    autoTranslationRecentRenders: "recentRenders",
    lastAutoTranslationDecisions: "lastDecisions"
});
installStateProxies(module.exports.prototype, "autoCooldowns", {
    autoTranslationFailures: "failures",
    autoTranslationFailureHistory: "failureHistory",
    autoTranslationProviderFailures: "providerFailures",
    autoTranslationProviderNoticeAt: "providerNoticeAt",
    autoTranslationPrecheckSkips: "precheckSkips",
    autoTranslationRetryTimer: "retryTimer",
    autoTranslationRetryAt: "retryAt",
    autoTranslationLastToastAt: "lastToastAt"
});
