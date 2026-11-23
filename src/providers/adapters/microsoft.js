// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");

/** @type {import("../registry").ProviderAdapter} */
const microsoftAdapter = {
    id: "microsoft",
    label: PROVIDER_DEFAULTS.microsoft.label,
    kind: "direct",
    tasks: { polish: false, translation: true },
    defaultProfile: PROVIDER_DEFAULTS.microsoft,
    credentialFields: ["apiKey", "region"],
    responseParser: "microsoftTranslate",
    getEffectiveEndpoint(config, _defaultConfig, plugin) {
        const endpoint = String(config?.endpoint || PROVIDER_DEFAULTS.microsoft.endpoint).trim();
        if (!endpoint) return "";
        const target = plugin.getMicrosoftLanguageCode(config?.targetLanguageCode || config?.targetLanguage);
        const source = plugin.getMicrosoftLanguageCode(config?.sourceLanguage, { source: true });
        const params = new URLSearchParams({ "api-version": "3.0", to: target });
        if (source) params.set("from", source);
        return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${params}`;
    },
    buildRequest(kind, input, config, _defaultConfig, _options, plugin) {
        if (kind !== "translation") throw new Error(plugin.t("translationDisabled"));
        return plugin.buildMicrosoftTranslateRequest(input, config);
    },
    parseResponse(raw, request, options, plugin) {
        return plugin.parseMicrosoftTranslateResponse(raw, request?.translate?.expectedCount || 1, {
            asArray: Boolean(options?.translateAsArray)
        });
    }
};

module.exports = { microsoftAdapter };
