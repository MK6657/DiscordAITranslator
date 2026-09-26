"use strict";

// The settings window shows one of these tabs at a time (UI-SPEC Q4), in this order.
const SETTINGS_TAB_OVERVIEW = "overview";
const SETTINGS_TAB_TRANSLATE = "translate";
const SETTINGS_TAB_COMPOSE = "compose";
const SETTINGS_TAB_APPEARANCE = "display";
const SETTINGS_TAB_ADVANCED = "advanced";
const SETTINGS_TAB_DATA = "data";
const SETTINGS_TAB_IDS = [
    SETTINGS_TAB_OVERVIEW,
    SETTINGS_TAB_TRANSLATE,
    SETTINGS_TAB_COMPOSE,
    SETTINGS_TAB_APPEARANCE,
    SETTINGS_TAB_ADVANCED,
    SETTINGS_TAB_DATA
];
const SETTINGS_TABS_DEFINITION = [
    { id: SETTINGS_TAB_OVERVIEW, labelKey: "settingsTabOverview" },
    { id: SETTINGS_TAB_TRANSLATE, labelKey: "settingsTabTranslate" },
    { id: SETTINGS_TAB_COMPOSE, labelKey: "settingsTabCompose" },
    { id: SETTINGS_TAB_APPEARANCE, labelKey: "settingsTabAppearance" },
    { id: SETTINGS_TAB_ADVANCED, labelKey: "settingsTabAdvanced" },
    { id: SETTINGS_TAB_DATA, labelKey: "settingsTabData" }
];

// ui.settingsActiveTab values saved by v0.3.0 (one scroll-spy section each) and the tab that now holds them.
const LEGACY_SETTINGS_TAB_MAP = {
    general: SETTINGS_TAB_OVERVIEW,
    polish: SETTINGS_TAB_COMPOSE,
    polishControls: SETTINGS_TAB_COMPOSE,
    publicBilingual: SETTINGS_TAB_COMPOSE,
    translation: SETTINGS_TAB_TRANSLATE,
    translationControls: SETTINGS_TAB_TRANSLATE,
    autoTranslate: SETTINGS_TAB_TRANSLATE,
    display: SETTINGS_TAB_APPEARANCE,
    cache: SETTINGS_TAB_DATA,
    diagnostics: SETTINGS_TAB_DATA
};

function normalizeSettingsTabId(value) {
    const id = String(value || "").trim();
    if (SETTINGS_TAB_IDS.includes(id)) return id;
    return Object.prototype.hasOwnProperty.call(LEGACY_SETTINGS_TAB_MAP, id) ? LEGACY_SETTINGS_TAB_MAP[id] : SETTINGS_TAB_OVERVIEW;
}

class SettingsSchema {
    constructor(options = {}) {
        const sections = Array.isArray(options.sections) ? options.sections : options.tabs;
        this.sections = Array.isArray(sections) ? sections : [];
        this.providerCapabilities = options.providerCapabilities || {};
        this.providerOrder = Array.isArray(options.providerOrder) ? options.providerOrder : [];
        this.defaultProvider = String(options.defaultProvider || "deepseek");
    }

    getSections() {
        return this.sections.map(section => ({ ...section }));
    }

    getTabs() {
        return this.getSections();
    }

    getProviderCapabilities(provider) {
        const key = String(provider || "").trim();
        return this.providerCapabilities[key] || this.providerCapabilities[this.defaultProvider] || null;
    }

    isProviderAllowedForTask(kind, provider) {
        return this.getProviderCapabilities(provider)?.tasks?.[kind] === true;
    }

    getProviderOptionsForTask(kind, getLabel) {
        return this.providerOrder
            .filter(provider => this.isProviderAllowedForTask(kind, provider))
            .map(provider => [provider, getLabel(provider)]);
    }
}

module.exports = {
    SettingsSchema,
    SETTINGS_TAB_OVERVIEW,
    SETTINGS_TAB_TRANSLATE,
    SETTINGS_TAB_COMPOSE,
    SETTINGS_TAB_APPEARANCE,
    SETTINGS_TAB_ADVANCED,
    SETTINGS_TAB_DATA,
    SETTINGS_TAB_IDS,
    SETTINGS_TABS_DEFINITION,
    LEGACY_SETTINGS_TAB_MAP,
    normalizeSettingsTabId
};
