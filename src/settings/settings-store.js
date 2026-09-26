"use strict";

// Phase 2 of the modularization plan: settings persistence, migration, task config and prompt-template CRUD.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    CACHE_DATA_KEY,
    CACHE_DATA_STORE,
    DATA_KEY,
    DEFAULT_PROMPT_TEMPLATES,
    DEFAULT_SETTINGS,
    DIAGNOSTIC_DATA_KEY,
    DIAGNOSTIC_DATA_STORE,
    GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
    LEGACY_TRANSLATION_NATURAL_PROMPTS,
    PLUGIN_NAME,
    POLISH_REPOLISH_SOURCE_LAST_RESULT,
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    SETTINGS_WRITE_DEBOUNCE_MS,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS,
    TRANSLATION_LINE_STYLES,
    TRANSLATION_LINE_TEXT_SCALES
} = require("../constants");
const { normalizeSettingsTabId } = require("./settings-schema");

// Provider fields a reset keeps: the secrets themselves, plus the region (Microsoft) and plan (DeepL) a key only works with.
const RESET_KEPT_CREDENTIAL_FIELDS = ["apiKey", "appId", "secretKey", "region", "deeplPlan"];
const RESET_SECRET_FIELDS = ["apiKey", "appId", "secretKey"];
// A kept secret also keeps the endpoint and model it was used with, so a reset never sends it to another host
// (a relay key to the provider's own API, for example).
const RESET_KEPT_CONNECTION_FIELDS = ["endpoint", "model"];

// ui settings that change how translation lines already on screen look; setSetting and a reset both restyle them.
const TRANSLATION_LINE_DISPLAY_KEYS = ["maskTranslations", "translationPosition", "translationStyle", "translationTextScale"];

function normalizeTranslationLineStyle(value) {
    const style = String(value || "");
    return TRANSLATION_LINE_STYLES.includes(style) ? style : DEFAULT_SETTINGS.ui.translationStyle;
}

function normalizeTranslationLineTextScale(value) {
    const scale = Number(value);
    return TRANSLATION_LINE_TEXT_SCALES.includes(scale) ? scale : DEFAULT_SETTINGS.ui.translationTextScale;
}

class SettingsStore {
    constructor(plugin) {
        this.plugin = plugin;
    }

    getPromptTemplates(kind) {
        if (!this.plugin.settings[kind]) return [];
        if (!Array.isArray(this.plugin.settings[kind].promptTemplates)) {
            this.plugin.settings[kind].promptTemplates = this.plugin.clone(DEFAULT_PROMPT_TEMPLATES[kind] || []);
        }
        this.plugin.ensurePromptTemplateSerials(kind);
        return this.plugin.settings[kind].promptTemplates;
    }

    ensurePromptTemplateSerials(kind) {
        const templates = this.plugin.settings[kind]?.promptTemplates;
        if (!Array.isArray(templates)) return false;

        let changed = false;
        const used = new Set();
        templates.forEach(template => {
            if (!template || typeof template !== "object") return;
            const serial = this.plugin.normalizePromptTemplateSerial(template.serial);
            if (serial && !used.has(serial)) {
                template.serial = serial;
                used.add(serial);
                return;
            }
            template.serial = this.plugin.getNextPromptTemplateSerial(used);
            used.add(template.serial);
            changed = true;
        });
        return changed;
    }

    migrateDefaultTranslationPrompt() {
        const translation = this.plugin.settings.translation;
        if (!translation) return false;

        const defaultTemplate = DEFAULT_PROMPT_TEMPLATES.translation.find(template => template.id === "translation-natural");
        const defaultPrompt = defaultTemplate?.prompt || "";
        if (!defaultPrompt) return false;

        let changed = false;
        const templates = Array.isArray(translation.promptTemplates) ? translation.promptTemplates : [];
        const naturalTemplate = templates.find(template => template?.id === "translation-natural");
        if (naturalTemplate && this.plugin.isLegacyTranslationNaturalPrompt(naturalTemplate.prompt)) {
            naturalTemplate.prompt = defaultPrompt;
            changed = true;
        }

        if (this.plugin.isLegacyTranslationNaturalPrompt(translation.prompt)) {
            translation.prompt = defaultPrompt;
            if (!translation.activePromptTemplate) translation.activePromptTemplate = "translation-natural";
            changed = true;
        }

        return changed;
    }

    isLegacyTranslationNaturalPrompt(prompt) {
        const normalized = this.plugin.normalizePromptForMigration(prompt);
        if (!normalized) return false;
        return LEGACY_TRANSLATION_NATURAL_PROMPTS
            .map(value => this.plugin.normalizePromptForMigration(value))
            .includes(normalized);
    }

    normalizePromptForMigration(prompt) {
        return String(prompt || "")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean)
            .join("\n");
    }

    getNextPromptTemplateSerial(used = null) {
        const existing = Array.from(used || [])
            .map(serial => Number(serial))
            .filter(Number.isFinite);
        const value = existing.length ? Math.max(...existing) + 1 : 1;
        return String(value).padStart(3, "0");
    }

    applyPromptTemplate(kind, templateId) {
        const template = this.plugin.getPromptTemplates(kind).find(item => item.id === templateId);
        if (!template) return;

        this.plugin.settings[kind].activePromptTemplate = template.id;
        this.plugin.settings[kind].prompt = template.prompt;
        this.plugin.saveSettings();
        this.plugin.syncSettingControls(`${kind}.prompt`, template.prompt);
        if (kind === "translation") this.plugin.invalidateAutoTranslationQueue();
        this.plugin.showToast(this.plugin.t("promptApplied", { name: this.getTemplateDisplayName(template), code: template.serial }), "success");
    }

    savePromptTemplate(kind, name, prompt) {
        const templates = this.plugin.getPromptTemplates(kind);
        const used = new Set(templates.map(template => template.serial).filter(Boolean));
        const template = {
            id: `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            serial: this.plugin.getNextPromptTemplateSerial(used),
            name,
            prompt
        };

        templates.push(template);
        this.plugin.settings[kind].activePromptTemplate = template.id;
        this.plugin.saveSettings();
        this.plugin.showToast(this.plugin.t("promptSaved", { name, code: template.serial }), "success");
    }

    updatePromptTemplate(kind, templateId, prompt) {
        const template = this.plugin.getPromptTemplates(kind).find(item => item.id === templateId);
        if (!template) return;

        template.prompt = prompt;
        this.plugin.settings[kind].activePromptTemplate = template.id;
        this.plugin.saveSettings();
        if (kind === "translation") this.plugin.invalidateAutoTranslationQueue();
        this.plugin.showToast(this.plugin.t("promptUpdated", { name: this.getTemplateDisplayName(template), code: template.serial }), "success");
    }

    // A built-in template's name in the interface language (the plugin decides; plain name without it).
    getTemplateDisplayName(template) {
        return typeof this.plugin.getPromptTemplateDisplayName === "function"
            ? this.plugin.getPromptTemplateDisplayName(template)
            : template.name;
    }

    deletePromptTemplate(kind, templateId) {
        const templates = this.plugin.getPromptTemplates(kind);
        const index = templates.findIndex(item => item.id === templateId);
        if (index < 0) return;

        const wasActive = this.plugin.settings[kind].activePromptTemplate === templateId;
        templates.splice(index, 1);
        // Only deleting the active template may change the effective prompt; deleting any
        // other template must not touch the live prompt or discard queued work.
        if (wasActive) {
            const fallback = templates[0];
            this.plugin.settings[kind].activePromptTemplate = fallback?.id || "";
            if (fallback) {
                this.plugin.settings[kind].prompt = fallback.prompt;
                this.plugin.syncSettingControls(`${kind}.prompt`, fallback.prompt);
            }
        }
        this.plugin.saveSettings();
        if (kind === "translation" && wasActive) this.plugin.invalidateAutoTranslationQueue();
        this.plugin.showToast(this.plugin.t("promptDeleted"), "success");
    }

    loadSettings() {
        const wasBlocked = this.plugin.settingsLoadBlocked;
        const storedValue = this.plugin.loadData(DATA_KEY);
        if (this.plugin.dataLoadFailures.has(DATA_KEY)) {
            this.plugin.settingsLoadBlocked = true;
            // Each failed load (plugin start) starts a new episode with one notice.
            this.settingsLoadBlockedNoticeShown = false;
            this.notifySettingsLoadBlocked();
            return false;
        }
        this.plugin.settingsLoadBlocked = false;
        this.settingsLoadBlockedNoticeShown = false;
        if (wasBlocked) {
            if (this.plugin.settingsDirtyTimer) clearTimeout(this.plugin.settingsDirtyTimer);
            this.plugin.settingsDirtyTimer = null;
            this.plugin.settingsDirtyAt = 0;
            this.plugin.settingsDirty = false;
        }
        const stored = storedValue || {};
        this.plugin.settings = this.plugin.mergeSettings(DEFAULT_SETTINGS, stored);
        this.plugin.ensureSettingsShape(stored);
        return true;
    }

    ensureSettingsShape(storedSettings = null) {
        let changed = false;
        ["polish", "translation"].forEach(kind => {
            if (!this.plugin.settings[kind] || typeof this.plugin.settings[kind] !== "object" || Array.isArray(this.plugin.settings[kind])) {
                this.plugin.settings[kind] = this.plugin.clone(DEFAULT_SETTINGS[kind]);
                changed = true;
            }
            if (!this.plugin.settings[kind].providerProfiles || typeof this.plugin.settings[kind].providerProfiles !== "object" || Array.isArray(this.plugin.settings[kind].providerProfiles)) {
                this.plugin.settings[kind].providerProfiles = {};
                changed = true;
            }
            const provider = this.plugin.normalizeProviderForTask(kind, this.plugin.settings[kind].provider);
            if (provider !== this.plugin.settings[kind].provider) {
                const preset = this.plugin.getProviderDefaults(provider);
                this.plugin.settings[kind].provider = provider;
                if (preset?.endpoint) this.plugin.settings[kind].endpoint = preset.endpoint;
                if (preset?.model) this.plugin.settings[kind].model = preset.model;
                this.plugin.settings[kind].enableThinking = false;
                changed = true;
            }
            const sourceLanguage = this.plugin.normalizeSourceLanguage(this.plugin.settings[kind].sourceLanguage);
            const targetLanguage = this.plugin.normalizeLanguageName(this.plugin.settings[kind].targetLanguage);
            if (sourceLanguage !== this.plugin.settings[kind].sourceLanguage) {
                this.plugin.settings[kind].sourceLanguage = sourceLanguage;
                changed = true;
            }
            if (targetLanguage !== this.plugin.settings[kind].targetLanguage) {
                this.plugin.settings[kind].targetLanguage = targetLanguage;
                changed = true;
            }
            // Hand-edited or damaged data can hold null or string entries; keep only real template objects.
            if (Array.isArray(this.plugin.settings[kind].promptTemplates)) {
                const templates = this.plugin.settings[kind].promptTemplates;
                const validTemplates = templates.filter(template => template && typeof template === "object" && !Array.isArray(template));
                if (validTemplates.length !== templates.length) {
                    this.plugin.settings[kind].promptTemplates = validTemplates;
                    changed = true;
                }
            }
            if (!Array.isArray(this.plugin.settings[kind].promptTemplates) || !this.plugin.settings[kind].promptTemplates.length) {
                this.plugin.settings[kind].promptTemplates = this.plugin.clone(DEFAULT_PROMPT_TEMPLATES[kind] || []);
                changed = true;
            }
            if (!this.plugin.settings[kind].activePromptTemplate && this.plugin.settings[kind].promptTemplates[0]) {
                this.plugin.settings[kind].activePromptTemplate = this.plugin.settings[kind].promptTemplates[0].id;
                changed = true;
            }
            if (this.plugin.ensurePromptTemplateSerials(kind)) {
                changed = true;
            }
            if (kind === "translation" && this.plugin.migrateDefaultTranslationPrompt()) {
                changed = true;
            }
            if (typeof this.plugin.settings[kind].enableThinking !== "boolean") {
                this.plugin.settings[kind].enableThinking = false;
                changed = true;
            }
            if (kind === "translation") {
                if (!["free", "pro"].includes(String(this.plugin.settings.translation.deeplPlan || ""))) {
                    this.plugin.settings.translation.deeplPlan = DEFAULT_SETTINGS.translation.deeplPlan;
                    changed = true;
                }
                ["region", "appId", "secretKey"].forEach(field => {
                    if (typeof this.plugin.settings.translation[field] !== "string") {
                        this.plugin.settings.translation[field] = DEFAULT_SETTINGS.translation[field];
                        changed = true;
                    }
                });
            }
            if (!this.plugin.settings[kind].apiStatus || typeof this.plugin.settings[kind].apiStatus !== "object") {
                this.plugin.settings[kind].apiStatus = { state: "untested", message: "" };
                changed = true;
            }
            if (this.plugin.settings[kind].apiStatus.state === "testing") {
                this.plugin.settings[kind].apiStatus = { state: "untested", message: "" };
                changed = true;
            }
            if (kind === "polish" && this.plugin.settings.polish.afterAction === "directReplace") {
                this.plugin.settings.polish.afterAction = "replace";
                changed = true;
            }
            if (kind === "polish" && !["replace", "confirmSend"].includes(this.plugin.settings.polish.afterAction)) {
                this.plugin.settings.polish.afterAction = DEFAULT_SETTINGS.polish.afterAction;
                changed = true;
            }
            if (kind === "polish" && ![POLISH_REPOLISH_SOURCE_ORIGINAL, POLISH_REPOLISH_SOURCE_LAST_RESULT].includes(this.plugin.settings.polish.repolishSource)) {
                this.plugin.settings.polish.repolishSource = DEFAULT_SETTINGS.polish.repolishSource;
                changed = true;
            }
        });
        if (!this.plugin.settings.googleTranslate || typeof this.plugin.settings.googleTranslate !== "object" || Array.isArray(this.plugin.settings.googleTranslate)) {
            this.plugin.settings.googleTranslate = this.plugin.clone(DEFAULT_SETTINGS.googleTranslate);
            changed = true;
        }
        const googleDefaultLimit = this.plugin.normalizeGoogleTranslateMonthlyLimit(this.plugin.settings.googleTranslate.defaultMonthlyLimit, GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT);
        if (googleDefaultLimit !== this.plugin.settings.googleTranslate.defaultMonthlyLimit) {
            this.plugin.settings.googleTranslate.defaultMonthlyLimit = googleDefaultLimit;
            changed = true;
        }
        if (typeof this.plugin.settings.googleTranslate.allowPrefetch !== "boolean") {
            this.plugin.settings.googleTranslate.allowPrefetch = DEFAULT_SETTINGS.googleTranslate.allowPrefetch;
            changed = true;
        }
        const storedGoogleTranslate = storedSettings && typeof storedSettings === "object" ? storedSettings.googleTranslate : null;
        if (
            storedGoogleTranslate
            && typeof storedGoogleTranslate === "object"
            && !Array.isArray(storedGoogleTranslate)
            && !Object.prototype.hasOwnProperty.call(storedGoogleTranslate, "keyPoolText")
            && Array.isArray(storedGoogleTranslate.keys)
            && !String(this.plugin.settings.googleTranslate.keyPoolText || "").trim()
        ) {
            this.plugin.settings.googleTranslate.keyPoolText = this.plugin.formatGoogleTranslateKeyPoolText(storedGoogleTranslate.keys);
        }
        const normalizedGoogleKeys = this.plugin.normalizeGoogleTranslateKeyPool(this.plugin.settings.googleTranslate);
        if (JSON.stringify(normalizedGoogleKeys.keys) !== JSON.stringify(this.plugin.settings.googleTranslate.keys || [])) {
            this.plugin.settings.googleTranslate.keys = normalizedGoogleKeys.keys;
            changed = true;
        }
        if (normalizedGoogleKeys.keyPoolText !== String(this.plugin.settings.googleTranslate.keyPoolText || "")) {
            this.plugin.settings.googleTranslate.keyPoolText = normalizedGoogleKeys.keyPoolText;
            changed = true;
        }
        if (JSON.stringify(normalizedGoogleKeys.usageById) !== JSON.stringify(this.plugin.settings.googleTranslate.usageById ?? null)) {
            this.plugin.settings.googleTranslate.usageById = normalizedGoogleKeys.usageById;
            changed = true;
        }
        if (!this.plugin.settings.ui || typeof this.plugin.settings.ui !== "object" || Array.isArray(this.plugin.settings.ui)) {
            this.plugin.settings.ui = this.plugin.clone(DEFAULT_SETTINGS.ui);
            changed = true;
        }
        // v0.3.0 saved one of ten scroll-spy sections; each maps onto the tab that now holds it.
        const settingsActiveTab = normalizeSettingsTabId(this.plugin.settings.ui.settingsActiveTab);
        if (settingsActiveTab !== this.plugin.settings.ui.settingsActiveTab) {
            this.plugin.settings.ui.settingsActiveTab = settingsActiveTab;
            changed = true;
        }
        const rawUiSettingsVersion = storedSettings && typeof storedSettings === "object"
            ? Number(storedSettings.ui?.settingsVersion || 0)
            : Number(this.plugin.settings.ui.settingsVersion || 0);
        const uiSettingsVersion = Number(this.plugin.settings.ui.settingsVersion || 0);
        if (rawUiSettingsVersion < 2) {
            this.plugin.settings.ui.showAutoTranslateToasts = false;
            this.plugin.settings.ui.settingsVersion = DEFAULT_SETTINGS.ui.settingsVersion;
            changed = true;
        }
        else if (this.plugin.settings.ui.settingsVersion !== DEFAULT_SETTINGS.ui.settingsVersion) {
            this.plugin.settings.ui.settingsVersion = DEFAULT_SETTINGS.ui.settingsVersion;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.testModeEnabled !== "boolean") {
            this.plugin.settings.ui.testModeEnabled = false;
            changed = true;
        }
        if (this.plugin.settings.ui.showQuickSettingsRailButton !== false) {
            this.plugin.settings.ui.showQuickSettingsRailButton = DEFAULT_SETTINGS.ui.showQuickSettingsRailButton;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.showQuickSettingsPanelButton !== "boolean") {
            this.plugin.settings.ui.showQuickSettingsPanelButton = DEFAULT_SETTINGS.ui.showQuickSettingsPanelButton;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.injectInputButton !== "boolean") {
            this.plugin.settings.ui.injectInputButton = DEFAULT_SETTINGS.ui.injectInputButton;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.injectMessageButtons !== "boolean") {
            this.plugin.settings.ui.injectMessageButtons = DEFAULT_SETTINGS.ui.injectMessageButtons;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.injectMessageContextMenu !== "boolean") {
            this.plugin.settings.ui.injectMessageContextMenu = DEFAULT_SETTINGS.ui.injectMessageContextMenu;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.enablePolishHotkey !== "boolean") {
            this.plugin.settings.ui.enablePolishHotkey = DEFAULT_SETTINGS.ui.enablePolishHotkey;
            changed = true;
        }
        // A shortcut the hotkey no longer accepts (Shift+letter saved by an older version, or an editing
        // shortcut) would show in settings but never fire: use the default instead.
        if (!this.plugin.isAllowedPolishHotkey(this.plugin.settings.ui.polishHotkey)) {
            this.plugin.settings.ui.polishHotkey = DEFAULT_SETTINGS.ui.polishHotkey;
            changed = true;
        }
        if (!["polish", "translation"].includes(this.plugin.settings.ui.testModeKind)) {
            this.plugin.settings.ui.testModeKind = DEFAULT_SETTINGS.ui.testModeKind;
            changed = true;
        }
        if (!["before", "after"].includes(this.plugin.settings.ui.translationPosition)) {
            this.plugin.settings.ui.translationPosition = DEFAULT_SETTINGS.ui.translationPosition;
            changed = true;
        }
        const messageButtonVisibility = this.plugin.normalizeMessageButtonVisibility(this.plugin.settings.ui.messageButtonVisibility);
        if (messageButtonVisibility !== this.plugin.settings.ui.messageButtonVisibility) {
            this.plugin.settings.ui.messageButtonVisibility = messageButtonVisibility;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.autoTranslateMessages !== "boolean") {
            this.plugin.settings.ui.autoTranslateMessages = DEFAULT_SETTINGS.ui.autoTranslateMessages;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.publicBilingualInputButton !== "boolean") {
            this.plugin.settings.ui.publicBilingualInputButton = DEFAULT_SETTINGS.ui.publicBilingualInputButton;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.publicBilingualUseInitialOriginal !== "boolean") {
            this.plugin.settings.ui.publicBilingualUseInitialOriginal = DEFAULT_SETTINGS.ui.publicBilingualUseInitialOriginal;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.publicBilingualAfterPolish !== "boolean") {
            this.plugin.settings.ui.publicBilingualAfterPolish = DEFAULT_SETTINGS.ui.publicBilingualAfterPolish;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.publicBilingualPolishBeforeTranslate !== "boolean") {
            this.plugin.settings.ui.publicBilingualPolishBeforeTranslate = DEFAULT_SETTINGS.ui.publicBilingualPolishBeforeTranslate;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.autoTranslatePrefetch !== "boolean") {
            this.plugin.settings.ui.autoTranslatePrefetch = DEFAULT_SETTINGS.ui.autoTranslatePrefetch;
            changed = true;
        }
        const intakeMode = this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui.autoTranslateIntakeMode);
        const providerIntakeMode = this.plugin.getProviderDefaults(this.plugin.settings.translation?.provider)?.autoTranslateIntakeMode;
        const effectiveIntakeMode = providerIntakeMode || intakeMode;
        if (effectiveIntakeMode !== this.plugin.settings.ui.autoTranslateIntakeMode) {
            this.plugin.settings.ui.autoTranslateIntakeMode = effectiveIntakeMode;
            changed = true;
        }
        const prefetchRange = this.plugin.normalizeAutoTranslatePrefetchRange(this.plugin.settings.ui.autoTranslatePrefetchRange);
        if (prefetchRange !== this.plugin.settings.ui.autoTranslatePrefetchRange) {
            this.plugin.settings.ui.autoTranslatePrefetchRange = prefetchRange;
            changed = true;
        }
        const autoTranslateConcurrency = this.plugin.normalizeAutoTranslateConcurrency(this.plugin.settings.ui.autoTranslateConcurrency);
        if (autoTranslateConcurrency !== this.plugin.settings.ui.autoTranslateConcurrency) {
            this.plugin.settings.ui.autoTranslateConcurrency = autoTranslateConcurrency;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.autoTranslateStrictRetry !== "boolean") {
            this.plugin.settings.ui.autoTranslateStrictRetry = DEFAULT_SETTINGS.ui.autoTranslateStrictRetry;
            changed = true;
        }
        if (!this.plugin.settings.ui.channelAutoTranslatePolicies || typeof this.plugin.settings.ui.channelAutoTranslatePolicies !== "object" || Array.isArray(this.plugin.settings.ui.channelAutoTranslatePolicies)) {
            this.plugin.settings.ui.channelAutoTranslatePolicies = {};
            changed = true;
        }
        // In 0.3.x an 'enabled' channel rule behaved like 'inherit' (the main switch decided); now it keeps the
        // channel translating while the main switch is off. Rules stored by an older version become 'inherit' once,
        // so no channel starts sending messages to the service after the upgrade. The entry stays, so a rule stored
        // under an old per-message key still shadows its channel's rule as it did in 0.3.x.
        const policiesVersion = DEFAULT_SETTINGS.ui.channelAutoTranslatePoliciesVersion;
        if (storedSettings && typeof storedSettings === "object" && !(Number(storedSettings.ui?.channelAutoTranslatePoliciesVersion) >= policiesVersion)) {
            const policies = this.plugin.settings.ui.channelAutoTranslatePolicies;
            const converted = this.plugin.getChannelAutoTranslateAllowListCount(policies);
            Object.entries(policies).forEach(([key, policy]) => {
                if (!policy || typeof policy !== "object") return;
                if (this.plugin.normalizeChannelAutoTranslatePolicyMode(policy.mode) === "enabled") policies[key] = { ...policy, mode: "inherit" };
            });
            if (converted > 0) {
                try {
                    this.plugin.logDiagnostic("settings.channel-rules", "upgraded", {
                        converted,
                        autoTranslateMessages: Boolean(this.plugin.settings.ui.autoTranslateMessages)
                    });
                }
                catch {}
            }
            this.plugin.settings.ui.channelAutoTranslatePoliciesVersion = policiesVersion;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.historyBackfillEnabled !== "boolean") {
            this.plugin.settings.ui.historyBackfillEnabled = DEFAULT_SETTINGS.ui.historyBackfillEnabled;
            changed = true;
        }
        const historyBackfillLimit = this.plugin.normalizeHistoryBackfillLimit(this.plugin.settings.ui.historyBackfillLimit);
        if (historyBackfillLimit !== this.plugin.settings.ui.historyBackfillLimit) {
            this.plugin.settings.ui.historyBackfillLimit = historyBackfillLimit;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.providerFallbackEnabled !== "boolean") {
            this.plugin.settings.ui.providerFallbackEnabled = DEFAULT_SETTINGS.ui.providerFallbackEnabled;
            changed = true;
        }
        const providerFallbackOrder = this.plugin.parseProviderFallbackOrderText(this.plugin.settings.ui.providerFallbackOrder);
        if (JSON.stringify(providerFallbackOrder) !== JSON.stringify(this.plugin.settings.ui.providerFallbackOrder || [])) {
            this.plugin.settings.ui.providerFallbackOrder = providerFallbackOrder;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.aiSkipEnabled !== "boolean") {
            this.plugin.settings.ui.aiSkipEnabled = DEFAULT_SETTINGS.ui.aiSkipEnabled;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.showAutoTranslateWarnings !== "boolean") {
            this.plugin.settings.ui.showAutoTranslateWarnings = DEFAULT_SETTINGS.ui.showAutoTranslateWarnings;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.showAutoTranslateToasts !== "boolean") {
            this.plugin.settings.ui.showAutoTranslateToasts = DEFAULT_SETTINGS.ui.showAutoTranslateToasts;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.diagnosticsEnabled !== "boolean") {
            this.plugin.settings.ui.diagnosticsEnabled = DEFAULT_SETTINGS.ui.diagnosticsEnabled;
            changed = true;
        }
        const cacheTtlHours = this.plugin.normalizeTranslationCacheTtlHours(this.plugin.settings.ui.translationCacheTtlHours);
        if (cacheTtlHours !== this.plugin.settings.ui.translationCacheTtlHours) {
            this.plugin.settings.ui.translationCacheTtlHours = cacheTtlHours;
            changed = true;
        }
        const cacheMaxEntries = this.plugin.normalizeTranslationCacheMaxEntries(this.plugin.settings.ui.translationCacheMaxEntries);
        if (cacheMaxEntries !== this.plugin.settings.ui.translationCacheMaxEntries) {
            this.plugin.settings.ui.translationCacheMaxEntries = cacheMaxEntries;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.maskTranslations !== "boolean") {
            this.plugin.settings.ui.maskTranslations = DEFAULT_SETTINGS.ui.maskTranslations;
            changed = true;
        }
        if (typeof this.plugin.settings.ui.hideOriginalAfterTranslation !== "boolean") {
            this.plugin.settings.ui.hideOriginalAfterTranslation = DEFAULT_SETTINGS.ui.hideOriginalAfterTranslation;
            changed = true;
        }
        const translationStyle = normalizeTranslationLineStyle(this.plugin.settings.ui.translationStyle);
        if (translationStyle !== this.plugin.settings.ui.translationStyle) {
            this.plugin.settings.ui.translationStyle = translationStyle;
            changed = true;
        }
        const translationTextScale = normalizeTranslationLineTextScale(this.plugin.settings.ui.translationTextScale);
        if (translationTextScale !== this.plugin.settings.ui.translationTextScale) {
            this.plugin.settings.ui.translationTextScale = translationTextScale;
            changed = true;
        }
        if (changed) this.plugin.saveSettings();
    }

    // While the stored settings cannot be read, saves are blocked so the unreadable file is not overwritten.
    // Tell the user once per episode instead of silently dropping their changes.
    notifySettingsLoadBlocked() {
        if (this.settingsLoadBlockedNoticeShown) return false;
        this.settingsLoadBlockedNoticeShown = true;
        try { this.plugin.showToast(this.plugin.t("settingsLoadBlocked"), "error"); }
        catch {}
        return true;
    }

    saveSettings(options = {}) {
        if (this.plugin.settingsLoadBlocked) {
            this.plugin.settingsDirty = true;
            this.notifySettingsLoadBlocked();
            return false;
        }
        if (options.debounce === true) {
            this.plugin.scheduleSettingsPersist(options.delayMs);
            return true;
        }
        return this.plugin.flushSettings({ force: true, retryOnError: options.retryOnError });
    }

    flushSettings(options = {}) {
        if (this.plugin.settingsLoadBlocked) {
            if (this.plugin.settingsDirtyTimer) {
                clearTimeout(this.plugin.settingsDirtyTimer);
                this.plugin.settingsDirtyTimer = null;
            }
            this.plugin.settingsDirtyAt = 0;
            this.plugin.settingsDirty = true;
            return false;
        }
        if (!this.plugin.settingsDirty && options.force !== true) return true;
        if (this.plugin.settingsDirtyTimer) {
            clearTimeout(this.plugin.settingsDirtyTimer);
            this.plugin.settingsDirtyTimer = null;
        }
        this.plugin.settingsDirtyAt = 0;
        const startedAt = this.plugin.getDiagnosticTime();
        const result = this.plugin.saveData(DATA_KEY, this.plugin.settings);
        this.plugin.logSlowOperation("settings.save", startedAt, {
            provider: this.plugin.settings.translation?.provider || "",
            translationTemplates: Array.isArray(this.plugin.settings.translation?.promptTemplates) ? this.plugin.settings.translation.promptTemplates.length : 0,
            polishTemplates: Array.isArray(this.plugin.settings.polish?.promptTemplates) ? this.plugin.settings.polish.promptTemplates.length : 0,
            googleKeys: Array.isArray(this.plugin.settings.googleTranslate?.keys) ? this.plugin.settings.googleTranslate.keys.length : 0
        });
        if (result === true) {
            this.plugin.settingsDirty = false;
            return true;
        }
        this.plugin.settingsDirty = true;
        if (options.retryOnError !== false) this.plugin.scheduleSettingsPersist(SETTINGS_WRITE_DEBOUNCE_MS);
        return result;
    }

    // BetterDiscord keeps one <name>.config.json per data name and rewrites the whole file on every save.
    // Settings stay under PLUGIN_NAME; the large cache and the diagnostics log use their own names (persist-1).
    getDataStoreName(key) {
        if (key === CACHE_DATA_KEY) return CACHE_DATA_STORE;
        if (key === DIAGNOSTIC_DATA_KEY) return DIAGNOSTIC_DATA_STORE;
        return PLUGIN_NAME;
    }

    readDataStore(storeName, key) {
        const bdApi = globalThis.BdApi;
        if (!bdApi) return null;
        if (bdApi.Data?.load) return bdApi.Data.load(storeName, key);
        if (bdApi.loadData) return bdApi.loadData(storeName, key);
        return null;
    }

    // Returns true or false; throws DATA_SAVE_UNAVAILABLE when BetterDiscord offers no save API.
    writeDataStore(storeName, key, value) {
        const bdApi = globalThis.BdApi;
        if (bdApi?.Data?.save) return bdApi.Data.save(storeName, key, value) === false ? false : true;
        if (bdApi?.saveData) return bdApi.saveData(storeName, key, value) === false ? false : true;
        throw new Error("DATA_SAVE_UNAVAILABLE");
    }

    deleteDataStoreKey(storeName, key) {
        const bdApi = globalThis.BdApi;
        if (bdApi?.Data?.delete) return bdApi.Data.delete(storeName, key) === false ? false : true;
        if (bdApi?.deleteData) return bdApi.deleteData(storeName, key) === false ? false : true;
        // Older hosts without a delete API: an explicit null drops the payload just as well.
        return this.writeDataStore(storeName, key, null);
    }

    loadData(key) {
        const bdApi = globalThis.BdApi;
        if (!bdApi) return null;
        if (!bdApi.Data?.load && !bdApi.loadData) return null;
        const storeName = this.plugin.getDataStoreName(key);
        let value = null;
        try {
            value = this.readDataStore(storeName, key);
            this.plugin.dataLoadFailures.delete(key);
        }
        catch (error) {
            this.plugin.dataLoadFailures.add(key);
            this.plugin.recordDataIoFailure("load", key, error);
            value = null;
        }
        if (storeName !== PLUGIN_NAME && (value === null || value === undefined)) {
            // Until the one-time move has succeeded, the copy in the settings file is still the only one.
            try {
                const legacy = this.readDataStore(PLUGIN_NAME, key);
                if (legacy !== null && legacy !== undefined) return legacy;
            }
            catch {}
        }
        return value;
    }

    saveData(key, value) {
        try {
            const bdApi = globalThis.BdApi;
            if (!bdApi) {
                if (key !== DIAGNOSTIC_DATA_KEY) this.plugin.recordDataIoFailure("save", key, new Error("DATA_SAVE_UNAVAILABLE"));
                return false;
            }
            if (bdApi.Data?.save || bdApi.saveData) {
                return this.writeDataStore(this.plugin.getDataStoreName(key), key, value);
            }
            if (key !== DIAGNOSTIC_DATA_KEY) this.plugin.recordDataIoFailure("save", key, new Error("DATA_SAVE_UNAVAILABLE"));
            return false;
        }
        catch (error) {
            if (key !== DIAGNOSTIC_DATA_KEY) this.plugin.recordDataIoFailure("save", key, error);
            return false;
        }
    }

    // One-time move of the cache and diagnostics out of the settings file (v0.3.0 and older kept them there).
    // The old copy is merged into the new file and deleted only after the new file was written, so a failed
    // step keeps the old copy and simply retries on the next start. Returns a status per key.
    migrateLegacyDataStores() {
        const results = {};
        [CACHE_DATA_KEY, DIAGNOSTIC_DATA_KEY].forEach(key => {
            results[key] = this.plugin.migrateLegacyDataStoreKey(key);
        });
        return results;
    }

    migrateLegacyDataStoreKey(key) {
        const storeName = this.plugin.getDataStoreName(key);
        if (storeName === PLUGIN_NAME) return "not-separated";
        let legacy;
        try {
            legacy = this.readDataStore(PLUGIN_NAME, key);
        }
        catch (error) {
            this.plugin.recordDataIoFailure("load", `legacy:${key}`, error);
            return "legacy-unreadable";
        }
        if (legacy === null || legacy === undefined) return "none";
        let current;
        try {
            current = this.readDataStore(storeName, key);
        }
        catch (error) {
            this.plugin.recordDataIoFailure("load", key, error);
            return "store-unreadable";
        }
        const hasCurrent = current !== null && current !== undefined;
        const payload = hasCurrent ? this.plugin.mergeLegacyDataPayload(key, current, legacy) : legacy;
        try {
            if (this.writeDataStore(storeName, key, payload) !== true) throw new Error("DATA_SAVE_FAILED");
        }
        catch (error) {
            this.plugin.recordDataIoFailure("save", key, error);
            return "save-failed";
        }
        try {
            if (this.deleteDataStoreKey(PLUGIN_NAME, key) !== true) throw new Error("DATA_DELETE_FAILED");
        }
        catch (error) {
            this.plugin.recordDataIoFailure("save", `legacy:${key}`, error);
            return "delete-failed";
        }
        try {
            this.plugin.logDiagnostic("data.migrate", "ok", { key, merged: hasCurrent });
        }
        catch {}
        return hasCurrent ? "merged" : "migrated";
    }

    mergeLegacyDataPayload(key, current, legacy) {
        if (key === CACHE_DATA_KEY) return this.plugin.mergePersistedTranslationCachePayloads(current, legacy);
        if (key === DIAGNOSTIC_DATA_KEY) return this.plugin.mergePersistedDiagnosticLogsPayloads(current, legacy);
        return current;
    }

    recordDataIoFailure(action, key, error) {
        const safeKey = String(key || "");
        this.plugin.warnSanitized(`Data ${action} failed for ${safeKey}`, error);
        try {
            this.plugin.logDiagnostic("data.io", "error", {
                action,
                key: safeKey,
                errorName: error?.name || "",
                errorText: this.plugin.formatError(error)
            });
        }
        catch {}
    }

    getSetting(path) {
        if (path === "ui.currentChannelAutoTranslatePolicy") {
            return this.plugin.getCurrentChannelAutoTranslatePolicyMode();
        }
        if (path === "ui.providerFallbackOrder") {
            return this.plugin.formatProviderFallbackOrder(this.plugin.settings.ui?.providerFallbackOrder);
        }
        if (path === "ui.messageButtonMode") {
            return this.plugin.getMessageButtonMode();
        }
        return path.split(".").reduce((value, key) => value?.[key], this.plugin.settings);
    }

    setSetting(path, value, options = {}) {
        const parts = path.split(".");
        if (path === "ui.currentChannelAutoTranslatePolicy") {
            // options.routeKey: the channel the control was built for (it may no longer be the current one).
            const routeKey = options.routeKey !== undefined ? options.routeKey : this.plugin.getCurrentRouteKey();
            return this.plugin.setCurrentChannelAutoTranslatePolicyMode(value, routeKey, options);
        }
        // One select for the message Translate button, stored as ui.injectMessageButtons + ui.messageButtonVisibility.
        if (path === "ui.messageButtonMode") {
            return this.plugin.setMessageButtonMode(value, options);
        }
        if (path === "ui.settingsActiveTab") {
            value = normalizeSettingsTabId(value);
        }
        if (path === "ui.messageButtonVisibility") {
            value = this.plugin.normalizeMessageButtonVisibility(value);
        }
        if (path === "googleTranslate.defaultMonthlyLimit") {
            value = this.plugin.normalizeGoogleTranslateMonthlyLimit(value, GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT);
        }
        if (path === "googleTranslate.keyPoolText") {
            value = String(value || "");
        }
        if (path === "ui.autoTranslateConcurrency") {
            value = this.plugin.normalizeAutoTranslateConcurrency(value);
        }
        if (path === "ui.autoTranslatePrefetchRange") {
            value = this.plugin.normalizeAutoTranslatePrefetchRange(value);
        }
        if (path === "ui.translationCacheTtlHours") {
            value = this.plugin.normalizeTranslationCacheTtlHours(value);
        }
        if (path === "ui.translationCacheMaxEntries") {
            value = this.plugin.normalizeTranslationCacheMaxEntries(value);
        }
        if (path === "ui.autoTranslateIntakeMode") {
            value = this.plugin.normalizeAutoTranslateIntakeMode(value);
            value = this.plugin.getProviderDefaults(this.plugin.settings.translation?.provider)?.autoTranslateIntakeMode || value;
        }
        if (path === "ui.historyBackfillLimit") {
            value = this.plugin.normalizeHistoryBackfillLimit(value);
        }
        if (path === "ui.providerFallbackOrder") {
            value = this.plugin.parseProviderFallbackOrderText(value);
        }
        if (path === "translation.deeplPlan") {
            value = ["free", "pro"].includes(String(value || "")) ? String(value) : DEFAULT_SETTINGS.translation.deeplPlan;
        }
        if (path === "ui.translationStyle") {
            value = normalizeTranslationLineStyle(value);
        }
        if (path === "ui.translationTextScale") {
            value = normalizeTranslationLineTextScale(value);
        }
        let cursor = this.plugin.settings;
        for (let index = 0; index < parts.length - 1; index++) {
            cursor = cursor[parts[index]];
        }
        const leaf = parts[parts.length - 1];
        if (Object.is(cursor[leaf], value)) {
            this.plugin.syncSettingControls(path, value, { includeActive: true });
            if (options.save === "immediate" || options.forceSave === true) {
                this.plugin.saveSettings({ retryOnError: options.retryOnError });
            }
            else if (options.save === "debounce") {
                this.plugin.saveSettings({ debounce: true, delayMs: options.delayMs });
            }
            return false;
        }
        cursor[leaf] = value;
        if (parts[0] === "googleTranslate") {
            if (path === "googleTranslate.keyPoolText" && !String(value || "").trim()) {
                // Keep the removed keys' usage so pasting them back cannot reset it.
                this.plugin.settings.googleTranslate.usageById = this.plugin.getGoogleTranslateUsageLedger(this.plugin.settings.googleTranslate);
                this.plugin.settings.googleTranslate.keys = [];
                this.plugin.settings.googleTranslate.keyPoolText = "";
            }
            else {
                const normalized = this.plugin.normalizeGoogleTranslateKeyPool(this.plugin.settings.googleTranslate);
                this.plugin.settings.googleTranslate.keys = normalized.keys;
                this.plugin.settings.googleTranslate.keyPoolText = normalized.keyPoolText;
                this.plugin.settings.googleTranslate.usageById = normalized.usageById;
            }
        }
        if (path === "translation.provider") this.plugin.applyProviderIntakeMode(value);
        if (options.save === false) {}
        else if (options.save === "immediate") this.plugin.saveSettings({ retryOnError: options.retryOnError });
        else this.plugin.saveSettings({ debounce: true, delayMs: options.delayMs });
        this.plugin.syncSettingControls(path, this.plugin.getSetting(path), { includeActive: true });
        if (["polish", "translation"].includes(parts[0]) && ["apiKey", "endpoint", "model", "provider", "region", "deeplPlan", "appId", "secretKey"].includes(parts[1])) {
            this.plugin.resetApiStatus(parts[0], { save: "debounce" });
        }
        if (this.plugin.shouldInvalidateAutoTranslationForSetting(path)) {
            this.plugin.invalidateAutoTranslationQueue();
        }
        // A channel whose rule is 'enabled' keeps translating after the main switch goes off.
        if (path === "ui.autoTranslateMessages" && value === false && !this.plugin.isAutoTranslateEnabled()) {
            this.plugin.cancelAutoTranslationRuntimeWork("setting-disabled");
        }
        if (path === "ui.language") {
            this.plugin.refreshLocalizedUi();
        }
        if (path === "ui.injectMessageContextMenu") {
            this.plugin.unpatchContextMenus();
            this.plugin.patchMessageContextMenu();
        }
        if (path === "translation.enabled") {
            this.plugin.syncMessageTranslationEntryPoints();
        }
        if (path === "ui.messageButtonVisibility") {
            this.plugin.applyMessageButtonVisibilityToButtons();
        }
        if (typeof document !== "undefined" && path === "ui.injectMessageButtons" && value === false) {
            document.querySelectorAll?.(".dait-message-button")?.forEach(node => node.remove());
        }
        if (typeof document !== "undefined" && path === "ui.injectInputButton" && value === false) {
            document.querySelectorAll?.(".dait-polish-button")?.forEach(node => {
                const group = node.closest?.(".dait-input-action-group");
                node.remove();
                this.plugin.syncInputActionGroupState(group);
            });
        }
        if (typeof document !== "undefined" && path === "ui.publicBilingualInputButton" && value === false) {
            document.querySelectorAll?.(".dait-public-bilingual-button")?.forEach(node => {
                const group = node.closest?.(".dait-input-action-group");
                node.remove();
                this.plugin.syncInputActionGroupState(group);
            });
        }
        if (path === "polish.enabled" || path === "translation.enabled") {
            this.plugin.syncInputActionButtonsForSettings();
        }
        if (typeof document !== "undefined" && path === "ui.showQuickSettingsRailButton" && value === false) {
            document.querySelectorAll?.(".dait-quick-settings-rail")?.forEach(node => node.remove());
        }
        if (typeof document !== "undefined" && path === "ui.showQuickSettingsPanelButton" && value === false) {
            document.querySelectorAll?.(".dait-quick-settings-panel")?.forEach(node => node.remove());
        }
        if (path === "ui.translationCacheTtlHours") {
            this.plugin.clampTranslationCacheExpiryToCurrentTtl();
            this.plugin.pruneTranslationCache({ scanExpired: true });
            this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
        }
        if (path === "ui.translationCacheMaxEntries") {
            this.plugin.pruneTranslationCache({ scanExpired: true });
            this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
        }
        if ((path === "ui.showAutoTranslateWarnings" || path === "ui.showAutoTranslateToasts") && value === false) {
            this.plugin.hideAutoTranslationWarningLines();
        }
        if (path === "ui.diagnosticsEnabled" && value === false) {
            this.plugin.disableDiagnosticLogging();
        }
        if (path === "ui.hideOriginalAfterTranslation") {
            this.plugin.syncAllTranslationSourceVisibility();
        }
        if (TRANSLATION_LINE_DISPLAY_KEYS.some(key => path === `ui.${key}`)) {
            this.plugin.syncAllTranslationDisplaySettings();
        }
        this.plugin.queueScan();
    }

    // Restores the defaults. With keepCredentials (default) it keeps API keys and the other credential fields of
    // every provider profile (each key with the endpoint and model it was used with), the Google key pool with its
    // usage counters and monthly limit, and the prompt templates. The UI language is kept unless keepLanguage is
    // false. Applies the same runtime effects setSetting applies to each changed setting. Stable entry point for
    // the reset dialog.
    resetSettingsToDefaults({ keepCredentials = true, keepLanguage = true } = {}) {
        const previous = this.plugin.settings && typeof this.plugin.settings === "object" ? this.plugin.settings : {};
        const next = this.plugin.clone(DEFAULT_SETTINGS);
        if (keepCredentials) this.carryOverResetCredentials(previous, next);
        // The usage ledger holds key fingerprints, not keys. Keeping it means a key pasted back after a
        // reset still counts this month's usage, which is what guards the free tier.
        const usageById = previous.googleTranslate?.usageById;
        if (usageById && typeof usageById === "object" && !Array.isArray(usageById)) {
            next.googleTranslate.usageById = this.plugin.clone(usageById);
        }
        const language = previous.ui?.language;
        if (keepLanguage && typeof language === "string" && language) next.ui.language = language;
        this.plugin.settings = next;
        this.plugin.ensureSettingsShape();
        const saved = this.plugin.saveSettings();
        this.plugin.applySettingsResetEffects(previous);
        this.plugin.logDiagnostic("settings.reset", saved === false ? "not-saved" : "ok", { keepCredentials: Boolean(keepCredentials) });
        return saved !== false;
    }

    carryOverResetCredentials(previous, next) {
        const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
        const isFilled = value => typeof value === "string" && Boolean(value.trim());
        const pickCredentials = source => {
            const picked = {};
            RESET_KEPT_CREDENTIAL_FIELDS.forEach(field => {
                if (isFilled(source?.[field])) picked[field] = source[field];
            });
            if (!RESET_SECRET_FIELDS.some(field => picked[field])) return picked;
            // An empty or missing endpoint means the preset one, before and after the reset. An endpoint that
            // cannot be read leaves no known host to pair the secret with, so the secret is dropped instead.
            if (source.endpoint !== undefined && typeof source.endpoint !== "string") {
                RESET_SECRET_FIELDS.forEach(field => delete picked[field]);
                return picked;
            }
            RESET_KEPT_CONNECTION_FIELDS.forEach(field => {
                if (isFilled(source[field])) picked[field] = source[field];
            });
            return picked;
        };
        ["polish", "translation"].forEach(kind => {
            const before = previous[kind];
            const after = next[kind];
            if (!isObject(before) || !isObject(after)) return;
            const profiles = {};
            Object.entries(isObject(before.providerProfiles) ? before.providerProfiles : {}).forEach(([provider, profile]) => {
                if (!isObject(profile)) return;
                const kept = pickCredentials(profile);
                if (Object.keys(kept).length) profiles[provider] = kept;
            });
            // The active provider's stored profile is only as new as the last switch away from it; its live
            // fields are what the user sees, and a field cleared there stays cleared.
            const activeProvider = String(before.provider || "").trim();
            if (activeProvider) {
                const live = pickCredentials(before);
                if (Object.keys(live).length) profiles[activeProvider] = live;
                else delete profiles[activeProvider];
            }
            after.providerProfiles = profiles;
            const own = profiles[after.provider];
            if (own) {
                [...RESET_KEPT_CREDENTIAL_FIELDS, ...RESET_KEPT_CONNECTION_FIELDS].forEach(field => {
                    if (own[field] !== undefined && Object.prototype.hasOwnProperty.call(after, field)) after[field] = own[field];
                });
            }
            const templates = Array.isArray(before.promptTemplates)
                ? before.promptTemplates.filter(isObject).map(template => this.plugin.clone(template))
                : [];
            if (templates.length) {
                const ids = new Set(templates.map(template => template.id));
                const missingDefaults = (DEFAULT_PROMPT_TEMPLATES[kind] || [])
                    .filter(template => !ids.has(template.id))
                    .map(template => this.plugin.clone(template));
                after.promptTemplates = [...missingDefaults, ...templates];
                // Keep the active template and the prompt in agreement when the default template was edited.
                const active = after.promptTemplates.find(template => template.id === after.activePromptTemplate);
                if (typeof active?.prompt === "string") after.prompt = active.prompt;
            }
        });
        const google = previous.googleTranslate;
        if (isObject(google)) {
            if (Array.isArray(google.keys)) next.googleTranslate.keys = this.plugin.clone(google.keys);
            if (typeof google.keyPoolText === "string") next.googleTranslate.keyPoolText = google.keyPoolText;
            if (google.defaultMonthlyLimit !== undefined) next.googleTranslate.defaultMonthlyLimit = google.defaultMonthlyLimit;
        }
        return next;
    }

    // Open settings controls show the new values (so closing quick settings cannot commit the old ones back),
    // then each runtime effect of a changed setting runs as setSetting would run it.
    applySettingsResetEffects(previous = {}) {
        const prevUi = previous?.ui && typeof previous.ui === "object" ? previous.ui : {};
        const ui = this.plugin.settings.ui;
        const changed = key => !Object.is(prevUi[key], ui[key]);
        const turnedOff = key => ui[key] === false && prevUi[key] !== false;
        this.plugin.syncAllSettingControls();
        this.plugin.invalidateAutoTranslationQueue();
        if (!this.plugin.isAutoTranslateEnabled()) this.plugin.cancelAutoTranslationRuntimeWork("settings-reset");
        if (changed("language")) {
            this.plugin.refreshLocalizedUi();
        }
        else if (changed("injectMessageContextMenu")) {
            this.plugin.unpatchContextMenus();
            this.plugin.patchMessageContextMenu();
        }
        if (changed("messageButtonVisibility")) this.plugin.applyMessageButtonVisibilityToButtons();
        if (typeof document !== "undefined" && document.querySelectorAll) {
            const removeNodes = (selector, inputGroup) => document.querySelectorAll(selector)?.forEach(node => {
                const group = inputGroup ? node.closest?.(".dait-input-action-group") : null;
                node.remove();
                if (inputGroup) this.plugin.syncInputActionGroupState(group);
            });
            if (turnedOff("injectMessageButtons")) removeNodes(".dait-message-button", false);
            if (turnedOff("injectInputButton")) removeNodes(".dait-polish-button", true);
            if (turnedOff("publicBilingualInputButton")) removeNodes(".dait-public-bilingual-button", true);
            if (turnedOff("showQuickSettingsRailButton")) removeNodes(".dait-quick-settings-rail", false);
            if (turnedOff("showQuickSettingsPanelButton")) removeNodes(".dait-quick-settings-panel", false);
        }
        if (changed("translationCacheTtlHours")) this.plugin.clampTranslationCacheExpiryToCurrentTtl();
        if (changed("translationCacheTtlHours") || changed("translationCacheMaxEntries")) {
            this.plugin.pruneTranslationCache({ scanExpired: true });
            this.plugin.scheduleTranslationCachePersist(TRANSLATION_CACHE_WRITE_DEBOUNCE_MS);
        }
        if (turnedOff("showAutoTranslateWarnings") || turnedOff("showAutoTranslateToasts")) this.plugin.hideAutoTranslationWarningLines();
        if (prevUi.diagnosticsEnabled === true && ui.diagnosticsEnabled !== true) this.plugin.disableDiagnosticLogging();
        if (changed("hideOriginalAfterTranslation")) this.plugin.syncAllTranslationSourceVisibility();
        if (TRANSLATION_LINE_DISPLAY_KEYS.some(changed)) this.plugin.syncAllTranslationDisplaySettings();
        this.plugin.queueScan();
    }

    syncAllSettingControls() {
        if (typeof document === "undefined" || !document.querySelectorAll) return;
        const paths = new Set();
        document.querySelectorAll("[data-dait-path]")?.forEach(control => {
            const path = String(control?.dataset?.daitPath || "");
            if (path) paths.add(path);
        });
        paths.forEach(path => this.plugin.syncSettingControls(path, this.plugin.getSetting(path), { includeActive: true }));
    }

    setTaskProvider(kind, provider) {
        if (!this.plugin.settings[kind]) return;
        const nextProvider = this.plugin.normalizeProviderForTask(kind, provider);
        const previousProvider = this.plugin.normalizeProviderForTask(kind, this.plugin.settings[kind].provider);
        if (previousProvider && previousProvider !== nextProvider) {
            this.plugin.saveTaskProviderProfile(kind, previousProvider);
        }
        this.plugin.settings[kind].provider = nextProvider;
        this.plugin.applyProviderPreset(kind, nextProvider, { restoreProfile: true, save: false, syncControls: false, invalidate: false });
        if (kind === "translation") this.plugin.applyProviderIntakeMode(nextProvider);
        this.plugin.resetApiStatus(kind, { save: false });
        this.plugin.saveSettings({ debounce: true });
        this.plugin.syncSettingControls(`${kind}.provider`, nextProvider);
        if (kind === "translation") this.plugin.invalidateAutoTranslationQueue();
        this.plugin.queueScan();
    }

    // Both provider-switch paths apply the provider's fixed intake mode. The settings
    // panel locks that control, so a stale value could not be corrected there.
    applyProviderIntakeMode(provider) {
        const intakeMode = this.plugin.getProviderDefaults(provider)?.autoTranslateIntakeMode;
        if (intakeMode && this.plugin.settings.ui.autoTranslateIntakeMode !== intakeMode) {
            this.plugin.settings.ui.autoTranslateIntakeMode = intakeMode;
            this.plugin.syncSettingControls("ui.autoTranslateIntakeMode", intakeMode, { includeActive: true });
        }
    }

    getTaskProviderProfile(kind, provider) {
        const profiles = this.plugin.settings[kind]?.providerProfiles;
        if (!profiles || typeof profiles !== "object" || Array.isArray(profiles)) return null;
        const profile = profiles[provider];
        return profile && typeof profile === "object" && !Array.isArray(profile) ? profile : null;
    }

    getTaskConfig(kind) {
        const config = this.plugin.settings[kind];
        if (!config) throw new Error(`Unknown task: ${kind}`);
        return config;
    }

    getEffectiveTaskConfig(kind, configOverrides = null) {
        const config = this.plugin.settings[kind] || {};
        return configOverrides ? { ...config, ...configOverrides } : config;
    }

    mergeSettings(defaults, stored) {
        const output = this.plugin.clone(defaults);
        const blockedKeys = new Set(["__proto__", "prototype", "constructor"]);
        const isPlainObject = value => {
            if (!value || Object.prototype.toString.call(value) !== "[object Object]") return false;
            const prototype = Object.getPrototypeOf(value);
            return prototype === Object.prototype || prototype === null;
        };
        const merge = (target, source) => {
            if (!isPlainObject(source) || !isPlainObject(target)) return target;
            Object.entries(source).forEach(([key, value]) => {
                if (blockedKeys.has(key)) return;
                if (isPlainObject(value)) {
                    const child = isPlainObject(target[key]) ? target[key] : {};
                    target[key] = merge(child, value);
                    return;
                }
                target[key] = value;
            });
            return target;
        };
        return merge(output, stored);
    }
}

module.exports = { SettingsStore };
