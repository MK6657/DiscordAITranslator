"use strict";

const {
    SETTINGS_TAB_OVERVIEW,
    SETTINGS_TAB_TRANSLATE,
    SETTINGS_TAB_COMPOSE,
    SETTINGS_TAB_APPEARANCE,
    SETTINGS_TAB_ADVANCED,
    SETTINGS_TAB_DATA,
    SETTINGS_TAB_IDS,
    normalizeSettingsTabId
} = require("../settings-schema");
const { PLUGIN_VERSION } = require("../../version");
const { UI_LOCALES, getUiLocaleButtonTooltip } = require("../../i18n");

const methods = {
    getSettingsPanel(options = {}) {
        this.plugin.ensureSettingsLoadedBeforeMutation?.();
        const startedAt = this.plugin.getDiagnosticTime();
        const quickSettings = Boolean(options.quickSettings);
        const panel = document.createElement("div");
        panel.className = "dait-settings";
        if (quickSettings) panel.dataset.daitQuickSettings = "true";
        // The language it is built in: a language change rebuilds the panels that differ (refreshSettingsWindowsLocale).
        panel.dataset.daitLocale = this.plugin.getLocale();
        this.plugin.applyPanelTheme(panel);

        panel.appendChild(this.createSettingsHeader({ quickSettings }));
        panel.appendChild(this.createSettingsLayout(panel));

        if (!quickSettings) this.scheduleSettingsModalSizing(panel);
        this.plugin.logSlowOperation("settings.panel.build", startedAt, {
            tabs: SETTINGS_TAB_IDS.length,
            quickSettings
        });
        return panel;
    },

    // Tab rail (search + tabs) on the left, one tab page at a time on the right. Every page is built up front so
    // search and syncSettingControls see all controls; inactive pages are hidden.
    createSettingsLayout(panel) {
        const uid = this.createSettingsControlId("dait-settings");
        const activeTab = this.getSettingsActiveTab();
        const state = {
            panel,
            activeTab,
            searchQuery: "",
            tabs: this.getSettingsNavItems().map(tab => ({ ...tab, tabId: `${uid}-tab-${tab.id}`, panelId: `${uid}-panel-${tab.id}` })),
            resultsId: `${uid}-results`
        };
        if (panel) panel.__daitSettingsUi = state;

        const layout = document.createElement("div");
        layout.className = "dait-settings-body";

        const content = document.createElement("div");
        content.className = "dait-settings-content";
        state.content = content;
        content.appendChild(this.createSettingsSearchResults(state));
        state.tabs.forEach(tab => {
            tab.tabpanel = this.createSettingsTabPanel(state, tab, tab.id === activeTab);
            content.appendChild(tab.tabpanel);
        });

        layout.appendChild(this.createSettingsRail(state));
        layout.appendChild(content);
        return layout;
    },

    getSettingsActiveTab() {
        return normalizeSettingsTabId(this.plugin.settings.ui?.settingsActiveTab);
    },

    getSettingsNavItems() {
        return this.plugin.settingsSchema.getTabs().map(tab => ({
            id: tab.id,
            label: this.plugin.t(tab.labelKey)
        }));
    },

    createSettingsControlId(prefix = "dait-control") {
        this.plugin.settingsControlIdCounter = (Number(this.plugin.settingsControlIdCounter) || 0) + 1;
        return `${prefix}-${this.plugin.settingsControlIdCounter}`;
    },

    createSettingsRail(state) {
        const rail = document.createElement("div");
        rail.className = "dait-settings-rail";
        rail.appendChild(this.createSettingsSearch(state));

        const tablist = document.createElement("div");
        tablist.className = "dait-settings-tabs";
        tablist.setAttribute("role", "tablist");
        tablist.setAttribute("aria-orientation", "vertical");
        tablist.setAttribute("aria-label", this.plugin.t("settingsTabsLabel"));
        state.tabs.forEach(tab => {
            const active = tab.id === state.activeTab;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "dait-settings-tab";
            button.id = tab.tabId;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-controls", tab.panelId);
            button.setAttribute("aria-selected", active ? "true" : "false");
            button.setAttribute("tabindex", active ? "0" : "-1");
            button.dataset.daitSettingsTab = tab.id;
            button.textContent = tab.label;
            button.addEventListener("click", () => this.showSettingsTab(state, tab.id));
            tab.button = button;
            tablist.appendChild(button);
        });
        tablist.addEventListener("keydown", event => this.handleSettingsTabKeydown(state, event));
        state.tablist = tablist;
        rail.appendChild(tablist);
        return rail;
    },

    createSettingsTabPanel(state, tab, active) {
        const tabpanel = document.createElement("div");
        tabpanel.className = "dait-settings-tabpanel";
        tabpanel.id = tab.panelId;
        tabpanel.setAttribute("role", "tabpanel");
        tabpanel.setAttribute("aria-labelledby", tab.tabId);
        tabpanel.dataset.daitSettingsTabPanel = tab.id;
        // Quick settings counts and locates pages by this attribute.
        tabpanel.dataset.daitSettingsSection = tab.id;
        if (tab.id === SETTINGS_TAB_ADVANCED) {
            tabpanel.dataset.daitTranslationLocal = String(Boolean(this.plugin.isLocalTranslationProvider?.(this.plugin.settings?.translation)));
        }
        tabpanel.hidden = !active;

        const heading = document.createElement("h2");
        heading.className = "dait-settings-page-title";
        heading.textContent = tab.label;
        tabpanel.appendChild(heading);

        const builders = {
            [SETTINGS_TAB_OVERVIEW]: () => this.createOverviewTabContent(),
            [SETTINGS_TAB_TRANSLATE]: () => this.createTranslateTabContent(),
            [SETTINGS_TAB_COMPOSE]: () => this.createComposeTabContent(),
            [SETTINGS_TAB_APPEARANCE]: () => this.createDisplayTabContent(),
            [SETTINGS_TAB_ADVANCED]: () => this.createAdvancedTabContent(),
            [SETTINGS_TAB_DATA]: () => this.createDataTabContent(state)
        };
        (builders[tab.id]?.() || []).forEach(node => {
            if (node) tabpanel.appendChild(node);
        });
        return tabpanel;
    },

    // Shows one tab page. Saving is debounced; a rebuilt panel opens on the same tab.
    showSettingsTab(state, tabId, options = {}) {
        if (!state?.tabs?.length) return null;
        const id = normalizeSettingsTabId(tabId);
        const target = state.tabs.find(tab => tab.id === id) || state.tabs[0];
        if (options.clearSearch !== false && state.searchQuery) this.clearSettingsSearch(state, { focus: false, showTab: false });
        state.activeTab = target.id;
        state.tabs.forEach(tab => {
            const active = tab === target;
            tab.button?.setAttribute?.("aria-selected", active && !state.searchQuery ? "true" : "false");
            tab.button?.setAttribute?.("tabindex", active ? "0" : "-1");
            if (tab.tabpanel) tab.tabpanel.hidden = !active || Boolean(state.searchQuery);
        });
        if (options.resetScroll !== false && state.content) state.content.scrollTop = 0;
        // The overview's checklist and service cards may be out of date after work on another tab.
        if (target.id === SETTINGS_TAB_OVERVIEW) this.refreshOverviewStatusSection(target.tabpanel);
        if (target.id === SETTINGS_TAB_DATA) {
            target.tabpanel?.querySelector?.("[data-dait-host-health-card='true']")?.__daitEnsureHostHealthRendered?.();
        }
        if (target.id === SETTINGS_TAB_TRANSLATE || target.id === SETTINGS_TAB_COMPOSE) {
            const tabKind = target.id === SETTINGS_TAB_COMPOSE ? "polish" : "translation";
            const renderedProvider = target.tabpanel?.querySelector?.(".dait-provider-settings-block")?.dataset?.daitProvider || "";
            const currentProvider = String(this.plugin.settings[tabKind]?.provider || "");
            if (renderedProvider && currentProvider && renderedProvider !== currentProvider && target.tabpanel?.replaceWith) {
                const fresh = this.createSettingsTabPanel(state, target, !state.searchQuery);
                target.tabpanel.replaceWith(fresh);
                target.tabpanel = fresh;
                this.syncSettingsDependentRows?.(fresh);
            }
            this.refreshSavedServiceConfigControls?.(target.tabpanel);
        }
        if (target.id === SETTINGS_TAB_ADVANCED && target.tabpanel?.replaceWith) {
            const currentLocal = String(Boolean(this.plugin.isLocalTranslationProvider?.(this.plugin.settings?.translation)));
            if (target.tabpanel.dataset?.daitTranslationLocal && target.tabpanel.dataset.daitTranslationLocal !== currentLocal) {
                const fresh = this.createSettingsTabPanel(state, target, !state.searchQuery);
                target.tabpanel.replaceWith(fresh);
                target.tabpanel = fresh;
                this.syncSettingsDependentRows?.(fresh);
            }
        }
        if (options.focusTab) this.focusSettingsElement(target.button);
        if (options.save !== false && this.plugin.settings?.ui && this.plugin.settings.ui.settingsActiveTab !== target.id) {
            this.plugin.settings.ui.settingsActiveTab = target.id;
            this.plugin.saveSettings({ debounce: true });
        }
        return target.id;
    },

    // Arrow keys move along the rail (up/down, or left/right when it is a horizontal row); Home/End jump to the ends.
    handleSettingsTabKeydown(state, event) {
        const count = state?.tabs?.length || 0;
        if (!count) return;
        const horizontalRtl = state?.tablist?.getAttribute?.("aria-orientation") === "horizontal" && Boolean(this.plugin.isRtlLocale?.());
        const steps = {
            ArrowDown: 1,
            ArrowRight: horizontalRtl ? -1 : 1,
            ArrowUp: -1,
            ArrowLeft: horizontalRtl ? 1 : -1
        };
        const current = Math.max(0, state.tabs.findIndex(tab => tab.id === state.activeTab));
        let next = null;
        if (steps[event?.key]) next = (current + steps[event.key] + count) % count;
        else if (event?.key === "Home") next = 0;
        else if (event?.key === "End") next = count - 1;
        if (next === null) return;
        event.preventDefault?.();
        event.stopPropagation?.();
        this.showSettingsTab(state, state.tabs[next].id, { focusTab: true });
    },

    setSettingsActiveTab(tab, source = null) {
        const id = normalizeSettingsTabId(tab);
        const state = source?.closest?.(".dait-settings")?.__daitSettingsUi;
        if (state) return this.showSettingsTab(state, id);
        if (this.plugin.settings?.ui) this.plugin.settings.ui.settingsActiveTab = id;
        this.plugin.saveSettings({ debounce: true });
        return id;
    },

    focusSettingsElement(element) {
        if (!element?.focus) return false;
        try {
            element.focus({ preventScroll: true });
        }
        catch {
            try { element.focus(); }
            catch { return false; }
        }
        return true;
    },

    // The one title bar of every settings window: the plugin's own window has no header of its own, so the panel
    // shows the title and the close button there too.
    createSettingsHeader(_options = {}) {
        const header = document.createElement("div");
        header.className = "dait-settings-header";

        const logo = document.createElement("div");
        logo.className = "dait-settings-logo";
        logo.setAttribute("aria-hidden", "true");
        logo.textContent = "AI";
        header.appendChild(logo);

        const title = document.createElement("h2");
        title.className = "dait-settings-title";
        title.textContent = this.plugin.t("settingsTitle");
        header.appendChild(title);

        const versionChip = document.createElement("span");
        versionChip.className = "dait-settings-version";
        versionChip.dataset.daitVersion = PLUGIN_VERSION;
        versionChip.textContent = `v${PLUGIN_VERSION}`;
        header.appendChild(versionChip);

        header.appendChild(this.createSettingsHeaderStatus());

        const close = document.createElement("button");
        close.type = "button";
        close.className = "dait-settings-close";
        close.title = this.plugin.t("settingsClose");
        close.setAttribute("aria-label", this.plugin.t("settingsClose"));
        close.appendChild(this.createWindowIcon("close"));
        close.addEventListener("click", event => {
            event?.preventDefault?.();
            this.closeSettingsWindow(close);
        });
        header.appendChild(close);
        // Appended after .dait-settings-close so close remains the first DOM focusable (CSS order places the bar visually before close).
        header.appendChild(this.createQuickLanguageBar({ surface: "header", fullLabels: false }));
        return header;
    },

    // Zero-barrier quick UI language switcher: native-script pills so users who do not read the active language can switch in 1 click.
    createQuickLanguageBar({ surface = "header", fullLabels = false } = {}) {
        const bar = document.createElement("div");
        bar.className = `dait-lang-bar dait-lang-bar-${surface}`;
        bar.setAttribute("role", "radiogroup");
        bar.setAttribute("aria-label", this.plugin.t("quickLanguageBarLabel"));
        const currentLocale = this.plugin.getLocale();
        const selectLocale = code => {
            if (!code || code === this.plugin.getLocale()) return;
            const panel = bar.closest?.(".dait-settings");
            if (panel) this.plugin.commitSettingsControls?.(panel);
            this.plugin.setSetting("ui.language", code);
            if (panel && !panel.__daitReplacedBy && panel.dataset?.daitLocale !== this.plugin.getLocale()) {
                this.plugin.replaceSettingsPanelElement(panel);
            }
        };
        const buttons = UI_LOCALES.map(item => {
            const active = item.code === currentLocale;
            const button = document.createElement("button");
            button.type = "button";
            button.className = "dait-lang-pill";
            button.setAttribute("role", "radio");
            button.setAttribute("aria-checked", active ? "true" : "false");
            button.setAttribute("tabindex", active ? "0" : "-1");
            button.setAttribute("lang", item.code);
            button.setAttribute("dir", item.dir);
            button.dataset.daitUiLang = item.code;
            button.dataset.daitUiFocusId = `${surface}-lang-${item.code}`;
            button.textContent = fullLabels ? item.label : item.shortLabel;
            const tooltip = getUiLocaleButtonTooltip(item);
            button.title = tooltip;
            button.setAttribute("aria-label", tooltip);
            button.addEventListener("click", event => {
                event?.preventDefault?.();
                selectLocale(item.code);
            });
            bar.appendChild(button);
            return button;
        });
        bar.addEventListener("keydown", event => {
            const rtl = Boolean(this.plugin.isRtlLocale?.());
            const stepMap = {
                ArrowRight: rtl ? -1 : 1,
                ArrowDown: 1,
                ArrowLeft: rtl ? 1 : -1,
                ArrowUp: -1
            };
            const currentIdx = Math.max(0, buttons.findIndex(btn => btn.getAttribute("aria-checked") === "true"));
            let nextIdx = null;
            if (stepMap[event?.key] !== undefined) nextIdx = (currentIdx + stepMap[event.key] + buttons.length) % buttons.length;
            else if (event?.key === "Home") nextIdx = 0;
            else if (event?.key === "End") nextIdx = buttons.length - 1;
            if (nextIdx === null) return;
            event.preventDefault?.();
            event.stopPropagation?.();
            const target = buttons[nextIdx];
            if (!target) return;
            this.focusSettingsElement(target);
            selectLocale(target.dataset.daitUiLang);
        });
        return bar;
    },

    // An icon for an icon button in a plugin window (css/01-theme-tokens .dait-icon); the button carries the label.
    createWindowIcon(name) {
        const icon = document.createElement("span");
        icon.className = `dait-icon dait-icon-${name}`;
        icon.setAttribute("aria-hidden", "true");
        return icon;
    },

    createSettingsHero(options = {}) {
        return this.createSettingsHeader(options);
    },

    // "<status> · <translation service>" for the header; the status badge updates live after a test.
    createSettingsHeaderStatus() {
        const wrap = document.createElement("span");
        wrap.className = "dait-settings-header-status";
        wrap.title = this.plugin.t("translationTitle");
        wrap.appendChild(this.createApiStatusBadge("translation"));
        const provider = document.createElement("span");
        provider.className = "dait-settings-header-provider";
        provider.textContent = this.plugin.getProviderDisplayName(this.plugin.settings.translation?.provider);
        wrap.appendChild(provider);
        return wrap;
    },

    createApiStatusBadge(kind) {
        const status = document.createElement("span");
        const savedStatus = this.plugin.getApiStatus(kind);
        status.dataset.daitKind = kind;
        this.renderApiStatusBadge(status, kind, savedStatus.state, this.plugin.getApiStatusText(savedStatus.state), savedStatus.message || "");
        return status;
    },

    // What a status badge shows: "Not set up" (with the "needs you" mark) while the service is missing a required
    // field, the same name the quick panel and the overview cards use; otherwise the saved or live state. A test
    // that is running still shows as testing.
    getApiStatusBadgeState(kind, state = this.plugin.getApiStatus(kind).state) {
        if (state === "testing" || !kind) return state;
        let configured = true;
        try { configured = Boolean(this.plugin.hasUsableApiConfig(kind)); }
        catch { configured = true; }
        return configured ? state : "unconfigured";
    },

    renderApiStatusBadge(badge, kind, state, text = this.plugin.getApiStatusText(state), title = "") {
        if (!badge) return;
        const shown = this.getApiStatusBadgeState(kind, state);
        badge.className = `dait-api-status dait-api-status-${shown}`;
        badge.textContent = shown === state ? text : this.plugin.getApiStatusText(shown);
        badge.title = shown === state
            ? title || ""
            : this.plugin.t("overviewServiceMissing", { field: this.getSettingLabelForPath(this.getMissingServiceSettingPath(kind)) });
    },

    // The close button closes whichever window holds the panel: the plugin's own settings window, or
    // BetterDiscord's plugin-settings modal (through its own footer button, or Escape as a last resort).
    closeSettingsWindow(source) {
        const quickRoot = source?.closest?.(".dait-quick-settings-modal-root");
        if (quickRoot) {
            this.plugin.closeQuickSettingsPanel(quickRoot, "button");
            return true;
        }
        const modal = source?.closest?.("[data-dait-settings-modal-root='true']") || source?.closest?.("[role='dialog']");
        const hostButtons = [...(modal?.querySelectorAll?.("button") || [])].filter(button => !button.closest?.(".dait-settings"));
        const hostClose = hostButtons[hostButtons.length - 1];
        if (hostClose?.click) {
            hostClose.click();
            return true;
        }
        if (typeof document === "undefined" || typeof KeyboardEvent !== "function") return false;
        const target = document.activeElement || document.body;
        target?.dispatchEvent?.(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", keyCode: 27, which: 27, bubbles: true, cancelable: true }));
        return true;
    }
};

module.exports = methods;
