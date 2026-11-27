"use strict";

const { TranslationRenderer } = require("./auto-translation/translation-renderer");
const { ComposerWriter } = require("./composer/composer-writer");
const { ComposerUiController, COMPOSER_UI_METHOD_NAMES } = require("./composer");
const { DisposableScope } = require("./core/disposable-scope");
const { EventBus } = require("./core/event-bus");
const { createPluginContext } = require("./core/plugin-context");
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
const {
    installPrototypeBridge,
    installClassPrototypeBridge,
    installStateProxies
} = require("./core/delegate-methods");
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
const {
    I18N,
    UI_LOCALES,
    normalizeUiLocale,
    getUiLocaleMeta,
    isRtlLocale
} = require("./i18n");

module.exports = class DiscordAITranslator {
    constructor() {
        this.events = new EventBus();
        this.runtimeScope = new DisposableScope();
        this.ctx = createPluginContext(this);
        this.autoStateMachine = new AutoTranslationStateMachine();
        this.autoCooldowns = new AutoTranslationCooldownStore();
        this.autoRequestPipeline = new AutoTranslationRequestPipeline(this, this.ctx);
        this.autoQueueCore = new AutoTranslationQueueCore(this, this.ctx);
        this.diagnosticsRecorder = new DiagnosticsRecorder(this, this.ctx);
        this.taskState = new AutoTranslationTaskState(this);
        this.outputGuard = new OutputGuard(this, this.ctx);
        this.translationCacheStore = new TranslationCacheStore(this, this.ctx);
        this.providerLayer = new ProviderLayer(this, this.ctx);
        this.settingsStore = new SettingsStore(this, this.ctx);
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
            providerRegistry: this.providerLayer.registry,
            defaultProvider: "deepseek"
        });
        this.bindDomainEvents();
        this.settingsDirtyTimer = null;
        this.settingsDirtyAt = 0;
        this.settingsDirty = false;
        this.settingsLoaded = false;
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
        this.renderFrameScrollCache = null;
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
        this.discordSettingsScanDeferred = false;
        this.mediaViewerScanDeferred = false;
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
        this.incrementalMessageScanPendingWork = false;
        this.incrementalMessageScanDirtyOnly = false;
        this.incrementalMessageScanHasQueuedDrainable = false;
        this.incrementalMessageScanRouteKey = "";
        this.incrementalMessageScanConfigVersion = 0;
        this.incrementalMessageScanRemainingGetter = null;
        this.cacheOnlyScanTimer = null;
        this.cacheOnlyScanDueAt = 0;
        this.scanProtectedUntil = 0;
        this.mediaViewerQuietUntil = 0;
        this.mediaViewerProbeAt = 0;
        this.mediaViewerProbeOpen = false;
        this.inputComposerBusyUntil = 0;
        this.unpatches = [];
        const self = /** @type {any} */ (this);
        this.boundKeydown = self.handleKeydown.bind(this);
        this.boundViewportScan = self.queueViewportScan.bind(this);
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
        this.polishSessionsByComposer = new Map();
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

    bindDomainEvents() {
        this.events.on("api:status", ({ kind, state } = {}) => {
            this.quickPanel?.noteApiStatus?.(kind, state);
            this.quickPanel?.requestStatusUpdate();
        });
        this.events.on("model:task-started", ({ kind, options, result } = {}) => {
            this.quickPanel?.watchRequestResult?.(kind, options, result);
        });
        this.events.on("auto:queue-invalidated", () => {
            this.quickPanel?.requestStatusUpdate();
        });
        this.events.on("auto:queue-drained", () => {
            this.quickPanel?.requestStatusUpdate();
        });
        this.events.on("auto:config-error-cleared", ({ kind = "translation" } = {}) => {
            if (kind === "translation") this.quickPanel?.clearConfigError?.();
        });
        this.events.on("auto:provider-failure", ({ requestOptions, error } = {}) => {
            this.quickPanel?.noteRequestFailure?.(requestOptions, error);
            this.quickPanel?.requestStatusUpdate();
        });
    }

    start() {
        if (this.lifecycleStarted && this.isStarted) return false;
        const self = /** @type {any} */ (this);
        this.lifecycleStarted = true;
        this.lifecycleToken++;
        this.isStarted = true;
        this.apiRequestsClosed = false;
        this.runtimeScope.reset();
        try {
            self.resetDiscordMessageStoreCache();
            const unsavedDiagnostics = Boolean(this.diagnosticLogsDirty);
            if (!unsavedDiagnostics) {
                this.diagnosticLogs = [];
                this.diagnosticCompressedCount = 0;
                this.diagnosticLogsLoaded = false;
            }
            if (!this.settingsLoadBlocked && this.googleTranslateRuntimeDirty) {
                self.flushGoogleTranslateRuntimeState({ retryOnError: false });
            }
            if (!this.settingsLoadBlocked && this.settingsDirty) {
                self.flushSettings({ retryOnError: false });
                if (this.settingsDirty) self.scheduleSettingsPersist();
            }
            const settingsLoaded = (this.settingsLoadBlocked || !this.settingsDirty) && self.loadSettings() === true;
            if (settingsLoaded) this.settingsLoaded = true;
            try { self.migrateLegacyDataStores(); }
            catch (error) { self.warnSanitized("Data store migration failed; old data kept", error); }
            if (settingsLoaded && this.settingsStore.diagnosticsDisabledInStoredSettings) {
                const storedDiagnostics = unsavedDiagnostics ? null : self.loadData(DIAGNOSTIC_DATA_KEY);
                const storedLogs = Array.isArray(storedDiagnostics) ? storedDiagnostics : storedDiagnostics?.logs;
                if (unsavedDiagnostics || (!this.dataLoadFailures.has(DIAGNOSTIC_DATA_KEY) && Array.isArray(storedLogs) && storedLogs.length)) {
                    self.disableDiagnosticLogging();
                }
            }
            else if (unsavedDiagnostics) {
                if (self.flushDiagnosticLogs({ retryOnError: false }) === false) self.scheduleDiagnosticLogsPersist();
            }
            else if (this.settings.ui?.diagnosticsEnabled) {
                self.loadDiagnosticLogs({ keepLogged: true });
            }
            if (this.translationCacheDirty) self.flushTranslationCache({ retryOnError: false });
            if (!this.translationCacheDirty) self.loadTranslationCache();
            else self.scheduleTranslationCachePersist();
            this.injectStyles();
            this.panelTheme.startWatching();
            self.patchMessageContextMenu();
            self.startObserver();
            this.runtimeScope.on(document, "keydown", this.boundKeydown, true);
            this.runtimeScope.on(window, "scroll", this.boundViewportScan, { capture: true, passive: true });
            this.runtimeScope.on(window, "resize", this.boundViewportScan, { capture: true, passive: true });
            this.runtimeScope.on(window, "focus", this.boundViewportScan, { capture: true, passive: true });
            this.runtimeScope.on(document, "visibilitychange", this.boundViewportScan, true);
            this.runtimeScope.on(window, "pagehide", this.getPageHideHandler(), true);
            this.runtimeScope.on(window, "beforeunload", this.getPageHideHandler(), true);
            self.queueScan();
            this.events.emit("lifecycle:start", { version: PLUGIN_VERSION, token: this.lifecycleToken });
            this.showToast(this.t("pluginStarted", { version: PLUGIN_VERSION }), "success");
            return true;
        }
        catch (error) {
            self.warnSanitized("Plugin start failed; rolling back partial initialization", error);
            try { this.stop(); }
            catch (cleanupError) {
                self.warnSanitized("Plugin start rollback failed", cleanupError);
                this.isStarted = false;
                this.lifecycleStarted = false;
                this.lifecycleToken++;
                this.apiRequestsClosed = true;
            }
            throw error;
        }
    }

    stop() {
        const self = /** @type {any} */ (this);
        this.isStarted = false;
        this.lifecycleStarted = false;
        this.lifecycleToken++;
        this.runtimeScope.dispose();
        if (this.observer) this.observer.disconnect();
        if (this.observerLifecycle) this.observerLifecycle.disconnect();
        this.panelTheme.stopWatching();
        if (this.observerRebindTimer) clearTimeout(this.observerRebindTimer);
        if (this.observerRetryTimer) clearTimeout(this.observerRetryTimer);
        self.cancelHeavyPersistenceIdle("diagnostics");
        self.cancelHeavyPersistenceIdle("cache");
        if (this.scanTimer) clearTimeout(this.scanTimer);
        self.cancelIncrementalMessageScan();
        if (this.cacheOnlyScanTimer) clearTimeout(this.cacheOnlyScanTimer);
        if (this.inputButtonScanTimer) clearTimeout(this.inputButtonScanTimer);
        if (this.quickSettingsRetryTimer) clearTimeout(this.quickSettingsRetryTimer);
        if (this.quickSettingsOpenTimer) clearTimeout(this.quickSettingsOpenTimer);
        self.cleanupQuickSettingsLauncherObserver();
        self.cancelQuickSettingsModalVerify();
        if (self.autoTranslationRetryTimer) clearTimeout(self.autoTranslationRetryTimer);
        self.cancelAutoTranslationRenderQueue();
        self.clearTranslationErrorWaitTimers();
        if (this.settingsDirtyTimer) clearTimeout(this.settingsDirtyTimer);
        if (this.translationCacheDirtyTimer) clearTimeout(this.translationCacheDirtyTimer);
        if (this.googleTranslateRuntimeDirtyTimer) clearTimeout(this.googleTranslateRuntimeDirtyTimer);
        if (this.diagnosticLogsDirtyTimer) clearTimeout(this.diagnosticLogsDirtyTimer);
        this.apiRequestsClosed = true;
        self.abortAutoTranslationRequests("stop");
        self.abortManualTranslationRequests?.("stop");
        self.abortActiveApiRequests();
        this.providerLayer.apiTestRuns?.forEach?.((run, key) => {
            run?.controller?.abort?.();
            this.providerLayer.apiTestRuns.set(key, { sequence: run?.sequence || 0 });
        });
        this.providerLayer.runningApiTests?.clear?.();
        self.modelDetectionRuns?.forEach?.((run, key) => {
            run?.controller?.abort?.();
            self.modelDetectionRuns.set(key, { sequence: run?.sequence || 0 });
        });
        this.composerWriter.cancelAll("stop");
        self.clearHotkeyRecording();
        self.clearPolishSubmitTimer();
        self.cancelPendingConfirmDialogs();
        self.cancelTextboxReplacementCleanup();
        this.localProviderHealthChecks.clear();
        this.localProviderHealthProbeStartedAt.clear();
        this.localProviderHealthyKeys.clear();
        self.autoTranslationPrecheckSkips.clear();
        this.googleTranslateReservedChars.clear();
        if (typeof document !== "undefined") {
            document.querySelectorAll?.(".dait-settings")?.forEach(panel => self.commitSettingsControls?.(panel));
        }
        self.closeQuickSettingsPanel(null, "stop");
        const translationCachePersisted = self.flushTranslationCache({ retryOnError: false }) !== false;
        self.flushGoogleTranslateRuntimeState({ retryOnError: false });
        self.flushSettings({ force: true, retryOnError: false });
        const diagnosticLogsPersisted = self.flushDiagnosticLogs({ retryOnError: false }) !== false;
        self.unpatchContextMenus();
        self.removePolishResultPanel();
        self.removePolishRestoreControl();
        self.removeInputActionMenu();
        self.removePolishPresetMenu();
        self.cancelLightweightButtonRecovery();
        this.nonTranslatableMessageCache = typeof WeakMap === "function" ? new WeakMap() : null;
        this.lastMissingMessageButtonSweepAt = 0;
        this.polishSession = null;
        this.polishSessionsByComposer?.clear?.();
        this.latestPolishRequestIds = new WeakMap();
        this.quickPanel.destroy("stop");
        if (typeof document !== "undefined") {
            document.querySelectorAll?.(".dait-settings")?.forEach(panel => self.destroySettingsModalSizing(panel));
        }
        self.restoreAllTranslationSourceVisibility();
        if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
            document.querySelectorAll(".dait-message-button, .dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-preset-menu, .dait-quick-settings-button, .dait-translation-line, .dait-translation-box, .dait-input-action-group").forEach(node => node.remove());
            document.querySelectorAll(".dait-input-actions-host").forEach(node => node.classList?.remove?.("dait-input-actions-host"));
        }
        this.removeStyles();
        if (translationCachePersisted) {
            this.translationCache.clear();
            this.translationCacheMeta.clear();
            this.translationCacheNegativeLookup.clear();
            this.localProviderDetectedModels.clear();
        }
        else {
            for (const entry of this.localProviderDetectedModels.values()) {
                if (entry && typeof entry === "object") {
                    entry.expiresAt = 0;
                    entry.retryAt = 0;
                }
            }
        }
        this.localProviderModelDetections.clear();
        this.dismissedTranslationMessages.clear();
        self.discordMarkupDisplayTextMemo?.clear?.();
        if (this.translationCacheDirtyTimer) clearTimeout(this.translationCacheDirtyTimer);
        this.translationCacheDirtyTimer = null;
        this.translationCacheDirtyAt = 0;
        this.translationCacheDirty = !translationCachePersisted;
        this.translationCachePersistenceDeferredSince = 0;
        if (this.googleTranslateRuntimeDirtyTimer) clearTimeout(this.googleTranslateRuntimeDirtyTimer);
        this.googleTranslateRuntimeDirtyTimer = null;
        this.googleTranslateRuntimeDirtyAt = 0;
        this.inputButtonScanTimer = null;
        this.inputButtonScanDueAt = 0;
        this.quickSettingsRetryTimer = null;
        this.quickSettingsOpenTimer = null;
        if (this.overviewStatusRefreshTimer) {
            clearTimeout(this.overviewStatusRefreshTimer);
            this.overviewStatusRefreshTimer = null;
        }
        this.quickSettingsPress = null;
        this.quickSettingsPanelSettingsButton = null;
        this.quickSettingsPanelContainer = null;
        this.quickSettingsPanelTargetLookupBlockedUntil = 0;
        if (diagnosticLogsPersisted) this.quickSettingsDiagnosticLogs = [];
        if (translationCachePersisted) this.persistentTranslationCacheCount = 0;
        if (diagnosticLogsPersisted) {
            this.diagnosticLogs = [];
            this.diagnosticCompressedCount = 0;
            this.diagnosticLogsLoaded = false;
        }
        if (this.diagnosticLogsDirtyTimer) clearTimeout(this.diagnosticLogsDirtyTimer);
        this.diagnosticLogsDirtyTimer = null;
        this.diagnosticLogsDirtyAt = 0;
        this.diagnosticLogsDirty = !diagnosticLogsPersisted;
        this.diagnosticLogsPersistenceDeferredSince = 0;
        this.translationRequests.clear();
        self.autoTranslationPartialResults?.clear?.();
        this.autoStateMachine.resetAll();
        this.autoCooldowns.clearAll();
        self.cancelCachedTranslationDrawPass();
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
        if (this.settingsDirtyTimer) clearTimeout(this.settingsDirtyTimer);
        this.settingsDirtyTimer = null;
        this.settingsDirtyAt = 0;
        this.discordSettingsScanDeferred = false;
        this.mediaViewerScanDeferred = false;
        this.settingsSurfaceProbeAt = 0;
        this.settingsSurfaceProbeOpen = false;
        this.scanTimer = null;
        this.scanDueAt = 0;
        this.cacheOnlyScanTimer = null;
        this.cacheOnlyScanDueAt = 0;
        this.scanProtectedUntil = 0;
        this.mediaViewerQuietUntil = 0;
        this.mediaViewerProbeAt = 0;
        this.mediaViewerProbeOpen = false;
        this.inputComposerBusyUntil = 0;
        self.autoTranslationRetryTimer = null;
        self.autoTranslationRetryAt = 0;
        this.autoTranslationViewportBusyUntil = 0;
        this.autoTranslationViewportStableAnchor = "";
        this.autoTranslationViewportStableScans = 0;
        this.autoTranslationViewportRequiresStableScan = false;
        this.autoTranslationJumpCooldownUntil = 0;
        this.autoTranslationRenderPausedUntil = 0;
        this.autoTranslationLastScrollY = null;
        this.autoTranslationLastScrollByTarget = typeof WeakMap === "function" ? new WeakMap() : null;
        this.autoTranslationLastWindowScrollY = null;
        this.autoTranslationLastRouteKey = "";
        this.discordThemeCacheEpoch++;
        this.discordThemeGlobalCandidatesCache = null;
        this.discordThemeVariableValuesCache = null;
        self.resetDiscordMessageStoreCache();
        this.discordHost?.resetRuntimeCaches?.();
        this.events.emit("lifecycle:stop", { token: this.lifecycleToken });
    }

    getPageHideHandler() {
        if (!this.boundPageHide) this.boundPageHide = () => this.flushPendingPersistence("pagehide");
        return this.boundPageHide;
    }

    // A reload or quit may not call stop(), so save what the debounce and busy-deferral timers still hold.
    // Each flush is a no-op when nothing is dirty; none of them schedules a retry.
    flushPendingPersistence(reason = "pagehide") {
        const self = /** @type {any} */ (this);
        const results = {};
        /** @type {Array<[string, () => any]>} */ ([
            ["cache", () => self.flushTranslationCache({ retryOnError: false })],
            ["google", () => self.flushGoogleTranslateRuntimeState({ retryOnError: false })],
            ["settings", () => self.flushSettings({ retryOnError: false })],
            ["diagnostics", () => self.flushDiagnosticLogs({ retryOnError: false })]
        ]).forEach(([name, flush]) => {
            try { results[name] = flush() !== false; }
            catch (error) {
                results[name] = false;
                self.warnSanitized(`Persist on ${reason} failed for ${name}`, error);
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
        const raw = this.settings.ui?.language;
        if (raw && I18N[raw]) return raw;
        const normalized = normalizeUiLocale(raw, "zh-CN");
        return I18N[normalized] ? normalized : "zh-CN";
    }

    isRtlLocale(locale = this.getLocale()) {
        return isRtlLocale(locale);
    }

    getUiLocales() {
        return UI_LOCALES;
    }

    getUiLocaleBcp47(locale = this.getLocale()) {
        return getUiLocaleMeta(locale).bcp47;
    }

    t(key, vars = {}) {
        const locale = this.getLocale();
        const template = I18N[locale]?.[key]
            ?? (locale === "zh-TW" ? I18N["zh-CN"]?.[key] : undefined)
            ?? I18N.en[key]
            ?? key;
        return String(template).replace(/\{(\w+)\}/g, (match, name) => vars[name] ?? match);
    }

    // --- QuickPanel public entrypoints ---
    toggleQuickPopover(...args) { return (/** @type {any} */ (this.quickPanel.toggle))(...args); }
    openQuickPopover(...args) { return (/** @type {any} */ (this.quickPanel.open))(...args); }
    closeQuickPopover(...args) { return (/** @type {any} */ (this.quickPanel.close))(...args); }
    isQuickPopoverOpen(...args) { return (/** @type {any} */ (this.quickPanel.isOpen))(...args); }
    getLauncherStatus(...args) { return (/** @type {any} */ (this.quickPanel.getStatus))(...args); }
    requestLauncherStatusUpdate(...args) { return (/** @type {any} */ (this.quickPanel.requestStatusUpdate))(...args); }

    // --- Read-only task-state diagnostics surface ---
    getAutoTranslationTaskSnapshot(cacheKey) { return this.taskState.getTaskSnapshot(cacheKey); }
    listAutoTranslationTaskKeys() { return this.taskState.listTrackedKeys(); }
    checkAutoTranslationTaskInvariants() { return this.taskState.checkInvariants(); }

    migrateLegacyDataStoreKey(key) {
        if (key === CACHE_DATA_KEY) return this.translationCacheStore.migrateLegacyTranslationCache();
        return this.settingsStore.migrateLegacyDataStoreKey(key);
    }

    runModelTaskWithResult(kind, input, options = {}) {
        const result = this.providerLayer.runModelTaskWithResult(kind, input, options);
        this.events.emit("model:task-started", { kind, options, result });
        return result;
    }

    translateMessageFromContextTarget(target) {
        const self = /** @type {any} */ (this);
        const element = target?.nodeType === 3 ? target.parentElement : target;
        const messageNode = element?.closest?.("[id^='chat-messages-'], [data-list-item-id*='chat-messages']");
        const content = messageNode
            ? (self.resolveMessageContentForTarget?.(element, messageNode) || self.getMessageContentElement(messageNode))
            : null;
        if (!messageNode || !content) {
            this.showToast(this.t("messageMissing"), "error");
            return;
        }
        return self.translateMessage(messageNode, content);
    }

    formatError(error, options = {}) {
        const message = this.getFriendlyErrorMessage(error, options);
        return message.length > 480 ? `${message.slice(0, 480)}...` : message;
    }

    // options.includeRetry: add the automatic retry wait; only auto-translation notices
    // want it (for polish or manual translation it is an internal scheduling detail).
    getFriendlyErrorMessage(error, options = {}) {
        const self = /** @type {any} */ (this);
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
        if (self.isRequestCancelled(error)) message = this.t("errorCancelled");
        else if (Object.hasOwn(API_ENDPOINT_ERROR_MESSAGE_KEYS, error?.code)) message = this.t(API_ENDPOINT_ERROR_MESSAGE_KEYS[error.code]);
        else if (error?.code === "CLIPBOARD_UNAVAILABLE") message = this.t("clipboardUnavailable");
        else if (error?.manualTranslationRescueFailed) message = this.t("manualTranslateRescueFailed");
        else if (error?.modelOutputTruncated) {
            if (error?.connectionTest || error?.connectionTestTruncated) {
                message = this.t("errorOutputTruncated");
            }
            else {
                message = error?.taskKind === "polish"
                    ? this.t("errorOutputTruncatedPolish")
                    : error?.taskKind === "translation"
                        ? this.t("errorOutputTruncatedTranslation")
                        : this.t("errorOutputTruncated");
            }
        }
        else if (self.isTimeoutError(error)) message = this.t("errorTimeout");
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
        else if (self.isNetworkError(error)) message = this.t("errorNetwork");
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
        const self = /** @type {any} */ (this);
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
            const next = self.replaceSettingsPanelElement(panel, self.getSettingsPanel({ quickSettings }));
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
        const self = /** @type {any} */ (this);
        const target = () => {
            const button = panel?.querySelector?.("[data-dait-action='resetSettings']");
            if (button && !button.closest?.("[hidden]")) return button;
            const state = panel?.__daitSettingsUi;
            return state?.tabs?.find(tab => tab.id === state.activeTab)?.button || null;
        };
        self.focusSettingsElement(target());
        if (typeof setTimeout !== "function") return;
        [300, 1000].forEach(delay => this.runtimeScope.setTimeout(() => {
            if (!panel?.isConnected || typeof document === "undefined") return;
            const active = document.activeElement;
            if (!active || active === document.body || active.isConnected === false) self.focusSettingsElement(target());
        }, delay, { unref: true }));
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
};

// Subsystem prototype bridges (keeps BetterDiscord & test contracts intact without manual boilerplate).
installClassPrototypeBridge(module.exports.prototype, "settingsStore", SettingsStore, [
    "getTemplateDisplayName", "notifySettingsLoadBlocked", "readDataStore",
    "writeDataStore", "deleteDataStoreKey", "carryOverResetCredentials"
]);
installClassPrototypeBridge(module.exports.prototype, "providerLayer", ProviderLayer, [
    "normalizeChatCompletionEndpoint", "getEffectiveProviderEndpoint", "getProviderEndpointIdentity",
    "createProviderRequestCancelledError", "throwIfProviderRequestCancelled", "subscribeToProviderRequest",
    "renderStatusBadge", "isBrowserRequestUnsent", "readResponseTextWithAbort", "fetchViaBetterDiscordNet"
]);
installClassPrototypeBridge(module.exports.prototype, "translationCacheStore", TranslationCacheStore, [
    "getTranslationCacheValueRefs", "hasCurrentTranslationCacheValueRefs", "invalidateTranslationCacheValueRefs",
    "releaseTranslationCacheValueRef", "setTranslationCacheEntry", "deleteTranslationCacheEntry",
    "isPreKeySchemaTranslationCachePayload", "getPreEmojiSourceText", "getPreEmojiMessageIdentity",
    "getTranslationCacheServedModelState", "isServedModelInTranslationCacheKeys", "getPlaceholderModelTranslationCacheKey",
    "getLegacyCompatTranslationCacheKeys", "adoptLegacyTranslationCacheEntries", "pruneLegacyTranslationCacheKeys",
    "getTranslationCacheEndpoint", "getCompatibleLegacyTranslationCacheEndpoints", "mergePendingTranslationCache",
    "prepareTranslationCacheWrite", "getPersistedTranslationCacheClearedAt", "getLegacyTranslationCacheReceipt",
    "readTranslationCacheForMigration", "migrateLegacyTranslationCache", "mergePersistedLocalModels"
]);
installClassPrototypeBridge(module.exports.prototype, "outputGuard", OutputGuard, [
    "stripProtectedTokensForPolishValidation"
]);
installClassPrototypeBridge(module.exports.prototype, "diagnosticsRecorder", DiagnosticsRecorder);
installClassPrototypeBridge(module.exports.prototype, "autoQueueCore", AutoTranslationQueueCore, [
    "findActiveAutoTranslationKey", "getModelAgnosticAutoTranslationKey"
]);
installClassPrototypeBridge(module.exports.prototype, "autoRequestPipeline", AutoTranslationRequestPipeline, [
    "isAutoTranslationAttemptCurrent"
]);

installPrototypeBridge(module.exports.prototype, "settingsUi", SETTINGS_UI_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "composerUi", COMPOSER_UI_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "serviceProfiles", SERVICE_PROFILES_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "promptPolicy", PROMPT_POLICY_METHOD_NAMES);
installPrototypeBridge(module.exports.prototype, "manualTranslation", MANUAL_TRANSLATION_METHOD_NAMES);
for (const [prop, methodNames] of /** @type {Array<[string, string[]]>} */ (DISCORD_HOST_BRIDGES)) {
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
