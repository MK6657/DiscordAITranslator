"use strict";

class SettingsSchema {
    constructor(options = {}) {
        this.sections = Array.isArray(options.sections) ? options.sections : [];
        this.providerCapabilities = options.providerCapabilities || {};
        this.providerOrder = Array.isArray(options.providerOrder) ? options.providerOrder : [];
        this.defaultProvider = String(options.defaultProvider || "deepseek");
    }

    getSections() {
        return this.sections.map(section => ({ ...section }));
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

module.exports = { SettingsSchema };
