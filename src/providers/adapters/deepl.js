// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");

/** @type {import("../registry").ProviderAdapter} */
const deeplAdapter = {
    id: "deepl",
    label: PROVIDER_DEFAULTS.deepl.label,
    kind: "direct",
    tasks: { polish: false, translation: true },
    defaultProfile: PROVIDER_DEFAULTS.deepl,
    credentialFields: ["apiKey", "deeplPlan"],
    responseParser: "deepLTranslate",
    getEffectiveEndpoint(config, _defaultConfig, plugin) {
        const endpoint = PROVIDER_DEFAULTS.deepl.endpoint;
        return plugin.normalizeDeepLPlan(config?.deeplPlan) === "pro"
            ? endpoint.replace("api-free.deepl.com", "api.deepl.com")
            : endpoint;
    },
    buildRequest(kind, input, config, _defaultConfig, _options, plugin) {
        if (kind !== "translation") throw new Error(plugin.t("translationDisabled"));
        return plugin.buildDeepLTranslateRequest(input, config);
    },
    parseResponse(raw, request, options, plugin) {
        return plugin.parseDeepLTranslateResponse(raw, request?.translate?.expectedCount || 1, {
            asArray: Boolean(options?.translateAsArray)
        });
    },
    applyCacheScope(config, snapshot, plugin, options) {
        snapshot.endpoint = this.getEffectiveEndpoint(config, {}, plugin);
        if (options?.servedModel && plugin.getDeepLLanguageCode(config?.targetLanguageCode || config?.targetLanguage) === "ZH-HANT") {
            // DeepL used to receive "ZH" (Simplified) for Traditional Chinese; a distinct
            // value retires the Simplified text cached as Traditional.
            snapshot.model = "zh-hant";
        }
    }
};

module.exports = { deeplAdapter };
