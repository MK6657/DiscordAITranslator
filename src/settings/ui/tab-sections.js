"use strict";

const {
    PROVIDER_ORDER,
    AUTO_TRANSLATE_DEFAULT_CONCURRENCY,
    AUTO_TRANSLATE_MIN_CONCURRENCY,
    AUTO_TRANSLATE_MAX_CONCURRENCY,
    AUTO_TRANSLATE_PREFETCH_RANGES,
    MESSAGE_BUTTON_VISIBILITY_ALWAYS,
    MESSAGE_BUTTON_VISIBILITY_HOVER,
    TRANSLATION_CACHE_TTL_OPTIONS,
    TRANSLATION_CACHE_DEFAULT_LIMIT,
    TRANSLATION_CACHE_MIN_LIMIT,
    TRANSLATION_CACHE_MAX_LIMIT,
    DEFAULT_SETTINGS
} = require("../../constants");
const { SETTINGS_TAB_DATA, MESSAGE_BUTTON_MODE_OFF } = require("../settings-schema");
const { buildHostHealthCard } = require("../../ui/host-health-card");
const { getDiagnosticCodeLabel } = require("../../diagnostics/diagnostic-labels");

const methods = {
    createGeneralSection() {
        const group = this.createSettingsGroup(this.plugin.t("settingsGroupCommon"), "general");
        group.appendChild(this.plugin.createCheckboxRow("ui.autoTranslateMessages", this.plugin.t("autoTranslateMessages"), { description: this.plugin.t("autoTranslateMessagesDesc") }));
        group.appendChild(this.createCurrentChannelPolicyRow());
        group.appendChild(this.plugin.createSelectRow("ui.language", this.plugin.t("interfaceLanguage"), [
            ["zh-CN", this.plugin.t("languageZh")],
            ["en", this.plugin.t("languageEn")]
        ], { description: this.plugin.t("interfaceLanguageDesc") }));
        return group;
    },

    createTranslateTabContent() {
        return [
            this.createTaskSection("translation", this.plugin.t("translationTitle"), this.plugin.t("translationDescription")),
            this.createAutoTranslateSection(),
            this.createTranslationControlsSection(),
            this.createTaskPromptSection("translation")
        ];
    },

    createComposeTabContent() {
        return [
            this.createTaskSection("polish", this.plugin.t("polishTitle"), this.plugin.t("polishDescription")),
            this.createTaskPromptSection("polish"),
            this.createPolishControlsSection(),
            this.createPublicBilingualSection()
        ];
    },

    createDisplayTabContent() {
        return [this.createDisplayWindowSection(), this.createDisplayBehaviorSection(), this.createDisplayNoticesSection()];
    },

    // The palette of the plugin's own windows (ui.panelTheme); changing it restyles every open window in place.
    createDisplayWindowSection() {
        const section = this.createSettingsGroup(this.plugin.t("settingsGroupWindows"), "windows");
        section.appendChild(this.createSegmentedRow("ui.panelTheme", this.plugin.t("panelTheme"), [
            ["auto", this.plugin.t("panelThemeAuto")],
            ["light", this.plugin.t("panelThemeLight")],
            ["dark", this.plugin.t("panelThemeDark")]
        ], { description: this.plugin.t("panelThemeDesc") }));
        return section;
    },

    createAdvancedTabContent() {
        const local = this.plugin.isLocalTranslationProvider(this.plugin.settings.translation);
        return [
            this.createAdvancedSection(),
            this.createHistoryBackfillSection(),
            this.createProviderFallbackSection(local)
        ];
    },

    createDataTabContent(state = null) {
        return [
            this.createCacheSection(),
            this.createDiagnosticsSection(state),
            this.createSettingsDangerZone()
        ];
    },

    createPolishControlsSection() {
        const section = this.createSettingsGroup(this.plugin.t("polishControlsTitle"), "polish-controls");
        section.appendChild(this.plugin.createCheckboxRow("ui.injectInputButton", this.plugin.t("showPolishButton"), { description: this.plugin.t("showPolishButtonDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.enablePolishHotkey", this.plugin.t("enableHotkey"), { description: this.plugin.t("enableHotkeyDesc") }));
        section.appendChild(this.createHotkeyRow({ dependsOn: { path: "ui.enablePolishHotkey", label: this.plugin.t("enableHotkey") } }));
        return section;
    },

    createTranslationControlsSection() {
        const section = this.createSettingsGroup(this.plugin.t("translationControlsTitle"), "translation-controls");
        section.appendChild(this.createMessageButtonModeRow());
        section.appendChild(this.plugin.createCheckboxRow("ui.injectMessageContextMenu", this.plugin.t("showContextMenu"), { description: this.plugin.t("showContextMenuDesc") }));
        return section;
    },

    // One select for the message Translate button: on hover / always / off.
    createMessageButtonModeRow() {
        return this.plugin.createSelectRow("ui.messageButtonMode", this.plugin.t("messageButtonMode"), [
            [MESSAGE_BUTTON_VISIBILITY_HOVER, this.plugin.t("messageButtonModeHover")],
            [MESSAGE_BUTTON_VISIBILITY_ALWAYS, this.plugin.t("messageButtonModeAlways")],
            [MESSAGE_BUTTON_MODE_OFF, this.plugin.t("messageButtonModeOff")]
        ], { description: this.plugin.t("messageButtonModeDesc") });
    },

    getMessageButtonMode() {
        if (this.plugin.settings.ui?.injectMessageButtons === false) return MESSAGE_BUTTON_MODE_OFF;
        return this.plugin.getMessageButtonVisibility();
    },

    // Stored as ui.injectMessageButtons + ui.messageButtonVisibility, each through setSetting so its own effects run.
    setMessageButtonMode(mode, options = {}) {
        const value = [MESSAGE_BUTTON_VISIBILITY_HOVER, MESSAGE_BUTTON_VISIBILITY_ALWAYS, MESSAGE_BUTTON_MODE_OFF].includes(mode)
            ? mode
            : MESSAGE_BUTTON_VISIBILITY_ALWAYS;
        if (value === MESSAGE_BUTTON_MODE_OFF) {
            this.plugin.setSetting("ui.injectMessageButtons", false, options);
        }
        else {
            this.plugin.setSetting("ui.messageButtonVisibility", value, options);
            this.plugin.setSetting("ui.injectMessageButtons", true, options);
        }
        this.plugin.syncSettingControls("ui.messageButtonMode", this.getMessageButtonMode(), { includeActive: true });
        return value;
    },

    createAutoTranslateSection() {
        const section = this.createSettingsGroup(this.plugin.t("settingsGroupAutoTranslate"), "auto-translate");
        section.appendChild(this.plugin.createCheckboxRow("ui.autoTranslateMessages", this.plugin.t("autoTranslateMessages"), { description: this.plugin.t("autoTranslateMessagesDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.autoTranslatePrefetch", this.plugin.t("autoTranslatePrefetch"), { description: this.plugin.t("autoTranslatePrefetchDesc") }));
        section.appendChild(this.plugin.createSelectRow("ui.autoTranslatePrefetchRange", this.plugin.t("autoTranslatePrefetchRange"), AUTO_TRANSLATE_PREFETCH_RANGES.map(value => [String(value), String(value)]), {
            description: this.plugin.t("autoTranslatePrefetchRangeDesc"),
            dependsOn: { path: "ui.autoTranslatePrefetch", label: this.plugin.t("autoTranslatePrefetch") }
        }));
        section.appendChild(this.createCurrentChannelPolicyRow());
        return section;
    },

    // Tuning that rarely needs a change: concurrency, how messages are found, strict retry.
    createAdvancedSection() {
        const section = this.createSettingsGroup(this.plugin.t("autoTranslateSettingsTitle"), "advanced");
        const provider = this.plugin.getProviderDefaults(this.plugin.settings.translation.provider);
        const local = this.plugin.isLocalTranslationProvider(this.plugin.settings.translation);
        const concurrencyRange = { min: AUTO_TRANSLATE_MIN_CONCURRENCY, max: AUTO_TRANSLATE_MAX_CONCURRENCY, default: AUTO_TRANSLATE_DEFAULT_CONCURRENCY };
        section.appendChild(this.createInputRow("ui.autoTranslateConcurrency", this.plugin.t("autoTranslateConcurrency"), "number", String(AUTO_TRANSLATE_DEFAULT_CONCURRENCY), { min: String(AUTO_TRANSLATE_MIN_CONCURRENCY), max: String(AUTO_TRANSLATE_MAX_CONCURRENCY), step: "1" }, { description: this.plugin.t(local ? "localConcurrencyDesc" : "autoTranslateConcurrencyDesc", concurrencyRange) }));
        section.appendChild(this.plugin.createSelectRow("ui.autoTranslateIntakeMode", this.plugin.t("autoTranslateIntakeMode"), [
            ["auto", this.plugin.t("autoTranslateIntakeAuto")],
            ["dom", this.plugin.t("autoTranslateIntakeDom")],
            ["bdfdb", this.plugin.t("autoTranslateIntakeBdfdb")]
        ], { description: this.plugin.t("autoTranslateIntakeModeDesc"), disabledReason: provider?.autoTranslateIntakeMode && this.plugin.t("localIntakeFixed") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.autoTranslateStrictRetry", this.plugin.t("autoTranslateStrictRetry"), { description: this.plugin.t("autoTranslateStrictRetryDesc") }));
        return section;
    },

    createHistoryBackfillSection() {
        const section = this.createSettingsGroup(this.plugin.t("settingsGroupHistoryBackfill"), "history-backfill");
        const dependsOn = { path: "ui.historyBackfillEnabled", label: this.plugin.t("historyBackfillEnabled") };
        section.appendChild(this.plugin.createCheckboxRow("ui.historyBackfillEnabled", this.plugin.t("historyBackfillEnabled"), { description: this.plugin.t("historyBackfillEnabledDesc") }));
        section.appendChild(this.createInputRow("ui.historyBackfillLimit", this.plugin.t("historyBackfillLimit"), "number", String(DEFAULT_SETTINGS.ui.historyBackfillLimit), { min: "1", max: "100", step: "1" }, { description: this.plugin.t("historyBackfillLimitDesc"), dependsOn }));
        section.appendChild(this.createHistoryBackfillActionRow({ dependsOn }));
        return section;
    },

    createProviderFallbackSection(local = this.plugin.isLocalTranslationProvider(this.plugin.settings.translation)) {
        const section = this.createSettingsGroup(this.plugin.t("settingsGroupFallback"), "provider-fallback");
        section.appendChild(this.plugin.createCheckboxRow("ui.providerFallbackEnabled", this.plugin.t("providerFallbackEnabled"), { description: this.plugin.t("providerFallbackEnabledDesc"), disabledReason: local && this.plugin.t("localFallbackUnavailable") }));
        section.appendChild(this.createProviderFallbackOrderRow(local));
        return section;
    },

    createCurrentChannelPolicyRow() {
        const routeKey = this.plugin.getCurrentRouteKey();
        // A screen without a channel (home, DM list) has nothing to set a rule for: the row is locked and says why.
        const noChannel = !this.plugin.getChannelAutoTranslatePolicyStorageKey(routeKey);
        const row = this.createSegmentedRow("ui.currentChannelAutoTranslatePolicy", this.plugin.t("currentChannelAutoTranslatePolicy"), [
            ["inherit", this.plugin.t("channelRuleFollow")],
            ["enabled", this.plugin.t("channelRuleAlways")],
            ["disabled", this.plugin.t("channelRuleNever")]
        ], {
            description: this.plugin.t("currentChannelAutoTranslatePolicyDesc"),
            disabledReason: noChannel && this.plugin.t("quickPanelRuleCaptionNoChannel"),
            routeKey
        });
        if (noChannel) {
            const control = row?.querySelectorAll?.("[data-dait-path='ui.currentChannelAutoTranslatePolicy']")?.[0];
            if (control) this.setChannelRuleControlDisabled(control, true);
        }
        return row;
    },

    // The rule control is a radiogroup of buttons; "disabled" has to reach every button.
    setChannelRuleControlDisabled(control, disabled) {
        control.disabled = Boolean(disabled);
        if (disabled) control.setAttribute?.("aria-disabled", "true");
        else control.removeAttribute?.("aria-disabled");
        [...(control.children || [])].filter(child => child?.tagName === "BUTTON").forEach(button => { button.disabled = Boolean(disabled); });
    },

    isChannelRuleControlDisabled(control) {
        return Boolean(control?.disabled) || control?.getAttribute?.("aria-disabled") === "true";
    },

    createHistoryBackfillActionRow(rowOptions = {}) {
        const controls = document.createElement("div");
        controls.className = "dait-history-backfill-actions";
        const button = this.createSmallButton(this.plugin.t("historyBackfillRun"));
        button.dataset.daitAction = "historyBackfillRun";
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            this.plugin.runExplicitHistoryBackfillFromUi(button, { source: "settings" });
        });
        controls.appendChild(button);
        return this.createRow(this.plugin.t("historyBackfillRun"), controls, { ...rowOptions, description: this.plugin.t("historyBackfillRunDesc") });
    },

    // The manual-translation fallback services as an ordered list: tick the services to use and move them with the
    // arrow buttons (no typing of provider ids). Local services cannot be a fallback, so they are not listed.
    createProviderFallbackOrderRow(local) {
        const list = document.createElement("div");
        list.className = "dait-order-list";
        list.setAttribute("role", "group");
        list.dataset.daitPath = "ui.providerFallbackOrder";
        list.dataset.daitControl = "order-list";
        this.renderProviderFallbackOrderList(list);
        return this.createRow(this.plugin.t("providerFallbackOrder"), list, {
            description: this.plugin.t("providerFallbackOrderListDesc"),
            disabledReason: local && this.plugin.t("localFallbackUnavailable"),
            dependsOn: { path: "ui.providerFallbackEnabled", label: this.plugin.t("providerFallbackEnabled") },
            stacked: true,
            ariaTarget: list
        });
    },

    getProviderFallbackCandidates() {
        return PROVIDER_ORDER.filter(provider => !this.plugin.isLocalTranslationProvider(provider));
    },

    // Chosen services first, in their saved order, then the others.
    renderProviderFallbackOrderList(list) {
        if (!list) return;
        const candidates = this.getProviderFallbackCandidates();
        const order = this.plugin.parseProviderFallbackOrderText(this.plugin.settings.ui?.providerFallbackOrder).filter(provider => candidates.includes(provider));
        const current = String(this.plugin.settings.translation?.provider || "");
        const focusHint = list.__daitFocusHint || null;
        list.__daitFocusHint = null;
        [...(list.children || [])].forEach(child => child.remove?.());
        list.textContent = "";
        const save = (next, hint) => {
            list.__daitFocusHint = hint;
            this.plugin.setSetting("ui.providerFallbackOrder", next);
        };
        [...order, ...candidates.filter(provider => !order.includes(provider))].forEach(provider => {
            const index = order.indexOf(provider);
            const name = this.plugin.getProviderDisplayName(provider);
            const item = document.createElement("div");
            item.className = index >= 0 ? "dait-order-item dait-order-item-on" : "dait-order-item";
            item.dataset.daitProvider = provider;

            const position = document.createElement("span");
            position.className = "dait-order-position";
            position.setAttribute("aria-hidden", "true");
            position.textContent = index >= 0 ? String(index + 1) : "";
            item.appendChild(position);

            const include = document.createElement("input");
            include.type = "checkbox";
            include.className = "dait-order-include";
            include.id = this.createSettingsControlId();
            include.checked = index >= 0;
            include.addEventListener("change", () => {
                const next = include.checked ? [...order, provider] : order.filter(item => item !== provider);
                save(next, { provider, part: "include" });
            });
            item.appendChild(include);

            const label = document.createElement("label");
            label.className = "dait-order-name";
            label.setAttribute("for", include.id);
            label.textContent = name;
            if (provider === current) {
                const note = document.createElement("span");
                note.className = "dait-order-note";
                note.textContent = this.plugin.t("providerFallbackCurrent");
                label.appendChild(note);
            }
            item.appendChild(label);

            const move = (delta, part, labelKey) => {
                const button = this.createSmallButton(delta < 0 ? "↑" : "↓", "outline");
                button.className = `${button.className} dait-order-move`;
                button.dataset.daitMove = part;
                button.title = this.plugin.t(labelKey, { provider: name });
                button.setAttribute("aria-label", this.plugin.t(labelKey, { provider: name }));
                const target = index + delta;
                button.disabled = index < 0 || target < 0 || target >= order.length;
                button.addEventListener("click", () => {
                    if (button.disabled || index < 0 || target < 0 || target >= order.length) return;
                    const next = [...order];
                    next.splice(index, 1);
                    next.splice(target, 0, provider);
                    save(next, { provider, part });
                });
                return button;
            };
            item.appendChild(move(-1, "up", "providerFallbackMoveUp"));
            item.appendChild(move(1, "down", "providerFallbackMoveDown"));
            list.appendChild(item);
        });

        // Re-rendered after a change: keep the row's locked/dependent state and the keyboard focus.
        const row = list.closest?.(".dait-settings-row");
        const parentPath = row?.dataset?.daitDependsOn;
        if (row?.dataset?.daitLocked === "true" || (parentPath && !this.plugin.getSetting(parentPath))) {
            this.getSettingsRowControls(list).forEach(node => { node.disabled = true; });
        }
        if (focusHint) {
            const item = [...(list.children || [])].find(node => node.dataset?.daitProvider === focusHint.provider);
            const target = focusHint.part === "include"
                ? item?.querySelector?.(".dait-order-include")
                : [...(item?.children || [])].find(node => node.dataset?.daitMove === focusHint.part && !node.disabled)
                    || item?.querySelector?.(".dait-order-include");
            this.focusSettingsElement(target);
        }
    },

    createPublicBilingualSection() {
        const section = this.createSettingsGroup(this.plugin.t("publicBilingualTitle"), "public-bilingual");
        section.appendChild(this.plugin.createCheckboxRow("ui.publicBilingualInputButton", this.plugin.t("publicBilingualInputButton"), { description: this.plugin.t("publicBilingualInputButtonDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.publicBilingualUseInitialOriginal", this.plugin.t("publicBilingualUseInitialOriginal"), { description: this.plugin.t("publicBilingualUseInitialOriginalDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.publicBilingualAfterPolish", this.plugin.t("publicBilingualAfterPolish"), { description: this.plugin.t("publicBilingualAfterPolishDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.publicBilingualPolishBeforeTranslate", this.plugin.t("publicBilingualPolishBeforeTranslate"), { description: this.plugin.t("publicBilingualPolishBeforeTranslateDesc") }));
        section.appendChild(this.createPublicBilingualDependencyRow());
        return section;
    },

    // Shows the service and target language the bilingual message really uses: the polish service when it is
    // usable (otherwise the translation service), and the polish output language.
    createPublicBilingualDependencyRow() {
        const summary = document.createElement("div");
        summary.className = "dait-provider-summary";
        summary.textContent = this.getPublicBilingualFlowText();
        // Follow the switches on the same panel (auto-polish options, polish on/off) without a rebuild.
        if (typeof setTimeout === "function") {
            this.plugin.unrefTimer(setTimeout(() => {
                const root = summary.closest?.(".dait-settings") || summary.closest?.(".dait-settings-section");
                root?.addEventListener?.("change", () => {
                    summary.textContent = this.getPublicBilingualFlowText();
                });
            }, 0));
        }
        return this.createRow(this.plugin.t("publicBilingualDependencyTitle"), summary, {
            description: this.plugin.t("publicBilingualDependencyFlowDesc"),
            wide: true
        });
    },

    // What a bilingual message really goes through: the polish step only when a bilingual option runs it and
    // polishing is on, the service picked by getPublicBilingualBaseConfig (the polish service when it is set up)
    // and the language from getPublicBilingualTargetLanguage (the polish output language first).
    getPublicBilingualFlowText() {
        const polishRuns = Boolean(this.plugin.settings.polish?.enabled)
            && (this.plugin.isPublicBilingualPolishBeforeTranslateEnabled() || this.plugin.isPublicBilingualAfterPolishEnabled());
        return this.plugin.t("publicBilingualDependencyStatus", {
            polishProvider: polishRuns ? this.plugin.getProviderDisplayName(this.plugin.settings.polish?.provider) : this.plugin.t("publicBilingualDependencyPolishOff"),
            translationProvider: this.plugin.getProviderDisplayName(this.plugin.getPublicBilingualBaseConfig()?.provider),
            targetLanguage: this.plugin.getDisplayLanguage(this.plugin.getPublicBilingualTargetLanguage())
        });
    },

    createDisplayBehaviorSection() {
        const section = this.createSettingsGroup(this.plugin.t("settingsGroupTranslatedText"), "display");
        section.appendChild(this.createSegmentedRow("ui.translationPosition", this.plugin.t("translationPosition"), [
            ["before", this.plugin.t("translationPositionAbove")],
            ["after", this.plugin.t("translationPositionBelow")]
        ], { description: this.plugin.t("translationPositionDesc") }));
        section.appendChild(this.plugin.createSelectRow("ui.translationStyle", this.plugin.t("translationStyle"), [
            ["tint", this.plugin.t("translationStyleTint")],
            ["muted", this.plugin.t("translationStyleMuted")],
            ["tag", this.plugin.t("translationStyleTag")]
        ], { description: this.plugin.t("translationStyleDesc") }));
        section.appendChild(this.plugin.createSelectRow("ui.translationTextScale", this.plugin.t("translationTextScale"), [
            ["100", "100%"],
            ["90", "90%"]
        ], { description: this.plugin.t("translationTextScaleDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.maskTranslations", this.plugin.t("maskTranslations"), { description: this.plugin.t("maskTranslationsDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.hideOriginalAfterTranslation", this.plugin.t("hideOriginalAfterTranslation"), { description: this.plugin.t("hideOriginalAfterTranslationDesc") }));
        return section;
    },

    createDisplayNoticesSection() {
        const section = this.createSettingsGroup(this.plugin.t("settingsGroupNotices"), "notices");
        section.appendChild(this.plugin.createCheckboxRow("ui.showAutoTranslateWarnings", this.plugin.t("showAutoTranslateWarnings"), { description: this.plugin.t("showAutoTranslateWarningsDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.showAutoTranslateToasts", this.plugin.t("showAutoTranslateToasts"), { description: this.plugin.t("showAutoTranslateToastsDesc") }));
        section.appendChild(this.plugin.createCheckboxRow("ui.showQuickSettingsPanelButton", this.plugin.t("showQuickSettingsPanelButton"), { description: this.plugin.t("showQuickSettingsPanelButtonDesc") }));
        return section;
    },

    createCacheSection() {
        const section = this.createSettingsGroup(this.plugin.t("cacheSettingsTitle"), "cache");
        section.appendChild(this.plugin.createSelectRow("ui.translationCacheTtlHours", this.plugin.t("translationCacheTtl"), TRANSLATION_CACHE_TTL_OPTIONS.map(value => [String(value), this.getTranslationCacheTtlLabel(value)]), { description: this.plugin.t("translationCacheTtlDesc") }));
        section.appendChild(this.createInputRow("ui.translationCacheMaxEntries", this.plugin.t("translationCacheMaxEntries"), "number", String(TRANSLATION_CACHE_DEFAULT_LIMIT), { min: String(TRANSLATION_CACHE_MIN_LIMIT), max: String(TRANSLATION_CACHE_MAX_LIMIT), step: "100" }, { description: this.plugin.t("translationCacheMaxEntriesDesc") }));
        section.appendChild(this.createTranslationCacheStatsRow());
        section.appendChild(this.createTranslationCacheClearRow());
        return section;
    },

    // Test mode is gone: "Try a sentence" / "Try polishing" in the connection cards replace it. ui.testModeEnabled
    // still loads from old settings and simply shows nothing.
    createDiagnosticsSection(state = null) {
        const section = this.createSettingsGroup(this.plugin.t("diagnosticsSettingsTitle"), "diagnostics");
        section.appendChild(buildHostHealthCard(this.plugin, {
            lazy: Boolean(state && state.activeTab !== SETTINGS_TAB_DATA)
        }));
        section.appendChild(this.plugin.createCheckboxRow("ui.diagnosticsEnabled", this.plugin.t("diagnosticLogs"), { description: this.plugin.t("diagnosticLogsDesc") }));
        section.appendChild(this.createDiagnosticLogsRow());
        section.appendChild(this.createDiagnosticLogsClearRow());
        section.appendChild(this.createSettingsSnapshotRow());
        section.appendChild(this.createDiagnosticSummaryRow());
        return section;
    },

    runHostHealthCheck() {
        return this.plugin.discordHost.runHealthCheck();
    },

    // Reset lives at the end of the data tab, away from navigation.
    createSettingsDangerZone() {
        const section = this.createSettingsGroup(this.plugin.t("settingsDangerZone"), "danger", { className: "dait-settings-danger-zone" });
        const button = this.createSmallButton(this.plugin.t("reset"), "danger");
        button.className = `${button.className} dait-settings-reset-button`;
        button.dataset.daitAction = "resetSettings";
        button.addEventListener("click", event => {
            event?.preventDefault?.();
            this.runSettingsResetFromUi(button);
        });
        section.appendChild(this.createRow(this.plugin.t("reset"), button, { description: this.plugin.t("settingsResetDesc") }));
        return section;
    },

    // The reset dialog confirms, resets and refreshes every open settings panel itself.
    runSettingsResetFromUi(source) {
        const panel = source?.closest?.(".dait-settings") || null;
        return this.plugin.openResetSettingsDialog({ panel, source });
    },

    // The data tab gives every action a row of its own (a destructive one always), so a row never mixes unrelated
    // buttons: the stats rows show the counts, the clear rows below them update those counts.
    createTranslationCacheStatsRow() {
        const controls = document.createElement("div");
        controls.className = "dait-cache-actions";
        const clearStats = this.createSmallButton(this.plugin.t("clearTranslationCacheStats"));
        clearStats.addEventListener("click", () => {
            this.plugin.clearTranslationCacheStats();
            this.refreshSettingsStatsRow(clearStats, "translation-cache");
        });
        controls.appendChild(clearStats);
        const row = this.createRow(this.plugin.t("translationCacheStats"), controls, {
            description: this.plugin.getTranslationCacheStatsText()
        });
        row.dataset.daitStats = "translation-cache";
        return row;
    },

    createTranslationCacheClearRow() {
        const controls = document.createElement("div");
        controls.className = "dait-cache-actions";
        const clearCache = this.createSmallButton(this.plugin.t("clearTranslationCache"), "danger");
        clearCache.addEventListener("click", async () => {
            const confirmed = await this.plugin.confirmAction({
                title: this.plugin.t("clearTranslationCache"),
                body: this.plugin.t("clearTranslationCacheConfirm"),
                confirmText: this.plugin.t("clearTranslationCache"),
                danger: true
            });
            if (!confirmed) return;
            this.plugin.clearTranslationCache();
            this.refreshSettingsStatsRow(clearCache, "translation-cache");
        });
        controls.appendChild(clearCache);
        return this.createRow(this.plugin.t("clearTranslationCache"), controls, { description: this.plugin.t("clearTranslationCacheDesc") });
    },

    // Writes the current counts into the stats row of the same group ("translation-cache" or "diagnostic-logs").
    refreshSettingsStatsRow(source, kind) {
        const scope = source?.closest?.(".dait-settings-group") || source?.closest?.(".dait-settings");
        const row = scope?.querySelector?.(`[data-dait-stats='${kind}']`);
        const description = row?.querySelector?.(".dait-row-description");
        if (!description) return;
        description.textContent = kind === "translation-cache" ? this.plugin.getTranslationCacheStatsText() : this.plugin.getDiagnosticLogsStatsText();
    },

    // Copy and export: one small group of related buttons, with the log counts as the row's description.
    createDiagnosticLogsRow() {
        const controls = document.createElement("div");
        controls.className = "dait-diagnostic-actions";
        const copy = this.createSmallButton(this.plugin.t("copyDiagnosticLogs"));
        const exportJson = this.createSmallButton(this.plugin.t("exportDiagnosticJson"));
        const exportTxt = this.createSmallButton(this.plugin.t("exportDiagnosticTxt"));
        // The summary row sits in the same diagnostics group as this row.
        const refreshDiagnostics = button => {
            this.refreshSettingsStatsRow(button, "diagnostic-logs");
            this.plugin.refreshDiagnosticSummary(button.closest(".dait-settings-group") || button.closest(".dait-settings"));
        };

        copy.addEventListener("click", async () => {
            await this.plugin.copyDiagnosticLogs();
            refreshDiagnostics(copy);
        });
        exportJson.addEventListener("click", async () => {
            await this.plugin.exportDiagnosticLogs("json");
            refreshDiagnostics(exportJson);
        });
        exportTxt.addEventListener("click", async () => {
            await this.plugin.exportDiagnosticLogs("txt");
            refreshDiagnostics(exportTxt);
        });

        controls.appendChild(copy);
        controls.appendChild(exportJson);
        controls.appendChild(exportTxt);
        const row = this.createRow(this.plugin.t("exportDiagnosticLogs"), controls, {
            description: this.plugin.getDiagnosticLogsStatsText()
        });
        row.dataset.daitStats = "diagnostic-logs";
        return row;
    },

    createDiagnosticLogsClearRow() {
        const controls = document.createElement("div");
        controls.className = "dait-diagnostic-actions";
        const clear = this.createSmallButton(this.plugin.t("clearDiagnosticLogs"), "danger");
        clear.addEventListener("click", async () => {
            const confirmed = await this.plugin.confirmAction({
                title: this.plugin.t("clearDiagnosticLogs"),
                body: this.plugin.t("clearDiagnosticLogsConfirm"),
                confirmText: this.plugin.t("clearDiagnosticLogs"),
                danger: true
            });
            if (!confirmed) return;
            this.plugin.clearDiagnosticLogs();
            this.refreshSettingsStatsRow(clear, "diagnostic-logs");
            this.plugin.refreshDiagnosticSummary(clear.closest(".dait-settings-group") || clear.closest(".dait-settings"));
        });
        controls.appendChild(clear);
        return this.createRow(this.plugin.t("clearDiagnosticLogs"), controls, { description: this.plugin.t("clearDiagnosticLogsDesc") });
    },

    createSettingsSnapshotRow() {
        const controls = document.createElement("div");
        controls.className = "dait-diagnostic-actions";
        const button = this.createSmallButton(this.plugin.t("exportSettingsSnapshot"));
        button.dataset.daitAction = "exportSettingsSnapshot";
        button.addEventListener("click", () => this.plugin.exportSettingsSnapshot());
        controls.appendChild(button);
        return this.createRow(this.plugin.t("settingsSnapshot"), controls, { description: this.plugin.t("settingsSnapshotDesc") });
    },

    createDiagnosticSummaryRow() {
        const summary = this.plugin.createDiagnosticSummary(this.plugin.diagnosticLogs);
        const row = this.createRow(this.plugin.t("diagnosticSummary"), this.createDiagnosticSummaryPanel(summary), {
            description: this.getDiagnosticSummaryStatsText(summary),
            wide: true
        });
        row.classList.add("dait-diagnostic-summary-row");
        return row;
    },

    refreshDiagnosticSummary(root) {
        const row = root?.querySelector?.(".dait-diagnostic-summary-row");
        if (!row) return;
        const summary = this.plugin.createDiagnosticSummary(this.plugin.diagnosticLogs);
        const description = row.querySelector?.(".dait-row-description");
        if (description) description.textContent = this.getDiagnosticSummaryStatsText(summary);
        const current = row.querySelector?.(".dait-diagnostic-summary");
        if (current) current.replaceWith(this.createDiagnosticSummaryPanel(summary));
    },

    createDiagnosticSummaryPanel(summary = this.plugin.createDiagnosticSummary(this.plugin.diagnosticLogs)) {
        const panel = document.createElement("div");
        panel.className = "dait-diagnostic-summary";

        const groups = [
            [this.plugin.t("diagnosticSummaryStates"), summary.top?.messageStates || []],
            [this.plugin.t("diagnosticSummaryReasons"), summary.top?.reasonCodes || []],
            [this.plugin.t("diagnosticSummaryFlows"), summary.top?.flows || []],
            [this.plugin.t("diagnosticSummaryQueues"), this.getDiagnosticSummaryQueueItems(summary)],
            [this.plugin.t("diagnosticSummaryProviders"), summary.top?.providers || []],
            [this.plugin.t("diagnosticSummaryFailures"), summary.top?.failureClasses?.length ? summary.top.failureClasses : summary.top?.failureTypes || []],
            [this.plugin.t("diagnosticSummaryFailureLayers"), summary.top?.failureLayers || []],
            [this.plugin.t("diagnosticSummaryFlowStages"), summary.top?.flowStages || []]
        ].filter(([, items]) => Array.isArray(items) && items.length);

        // With nothing to show, the row description already says so.
        if (!groups.length) {
            panel.hidden = true;
            return panel;
        }

        groups.forEach(([label, items]) => panel.appendChild(this.createDiagnosticSummaryGroup(label, items)));
        return panel;
    },

    // A chip shows a short label for its code (service names for services); the code stays in the tooltip.
    getDiagnosticChipLabel(code) {
        const value = String(code ?? "");
        if (PROVIDER_ORDER.includes(value)) return this.plugin.getProviderDisplayName(value);
        return getDiagnosticCodeLabel(value, this.plugin.getLocale());
    },

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
            chip.dataset.daitCode = String(item.key ?? "");
            chip.textContent = `${this.getDiagnosticChipLabel(item.key)}: ${item.count}`;
            chip.title = String(item.key ?? "");
            chips.appendChild(chip);
        });
        group.appendChild(chips);
        return group;
    },

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
    },

    getDiagnosticLogsStatsText() {
        return this.plugin.t("diagnosticLogsStats", {
            entries: this.plugin.diagnosticLogs.length,
            compressed: this.plugin.diagnosticCompressedCount
        });
    },

    // One sentence (UI-SPEC descriptions): the count, what the chips group by, and the latest event.
    getDiagnosticSummaryStatsText(summary = this.plugin.createDiagnosticSummary(this.plugin.diagnosticLogs)) {
        const events = Number(summary?.totalEvents || 0) || 0;
        if (!events) return this.plugin.t("diagnosticSummaryEmpty");
        const latest = this.formatDiagnosticSummaryTime(summary?.latestIso);
        return this.plugin.t("diagnosticSummaryEvents", { events, latest });
    },

    formatDiagnosticSummaryTime(iso) {
        if (!iso) return "-";
        const date = new Date(iso);
        if (!Number.isFinite(date.getTime())) return String(iso);
        const locale = this.plugin.getLocale() === "en" ? "en-US" : "zh-CN";
        try {
            return date.toLocaleString(locale, { hour12: false });
        }
        catch {
            return date.toLocaleString();
        }
    },

    getTranslationCacheStatsText() {
        return this.plugin.t("translationCacheStatsDesc", {
            hits: this.plugin.translationCacheStats.hits,
            misses: this.plugin.translationCacheStats.misses,
            memory: this.plugin.getTranslationCacheMessageCount(),
            persistent: this.plugin.persistentTranslationCacheCount
        });
    },

    getTranslationCacheTtlLabel(hours) {
        const value = Number(hours);
        const labels = {
            3: this.plugin.t("cacheTtl3h"),
            6: this.plugin.t("cacheTtl6h"),
            12: this.plugin.t("cacheTtl12h"),
            24: this.plugin.t("cacheTtl1d"),
            48: this.plugin.t("cacheTtl2d"),
            168: this.plugin.t("cacheTtl7d")
        };
        return labels[value] || `${value}h`;
    }
};

module.exports = methods;
