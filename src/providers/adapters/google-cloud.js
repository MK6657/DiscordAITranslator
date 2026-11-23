// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");

/** @type {import("../registry").ProviderAdapter} */
const googleCloudAdapter = {
    id: "googleCloud",
    label: PROVIDER_DEFAULTS.googleCloud.label,
    kind: "direct",
    tasks: { polish: false, translation: true },
    defaultProfile: PROVIDER_DEFAULTS.googleCloud,
    credentialFields: [],
    apiKeyOptional: true,
    responseParser: "googleTranslate",
    getEffectiveEndpoint() {
        return PROVIDER_DEFAULTS.googleCloud.endpoint;
    },
    buildRequest(kind, input, config, _defaultConfig, options, plugin) {
        if (kind !== "translation") throw new Error(plugin.t("translationDisabled"));
        return plugin.buildGoogleTranslateRequest(input, config, {
            ignoreReservations: Boolean(options?.deferGoogleTranslateReservation),
            ignoreCooldown: Boolean(options?.ignoreGoogleTranslateCooldown),
            reserve: Boolean(options?.reserveGoogleTranslateQuota)
        });
    },
    parseResponse(raw, request, options, plugin) {
        const result = plugin.parseGoogleTranslateResponse(raw, request?.googleTranslate?.expectedCount || 1, {
            asArray: Boolean(options?.googleTranslateAsArray || options?.translateAsArray),
            restoreMaps: request?.googleTranslate?.restoreMaps
        });
        plugin.markGoogleTranslateKeyUsage(request?.googleTranslate?.apiKey, request?.googleTranslate?.charCount || 0, {
            clearCooldown: Boolean(options?.connectionTest)
        });
        plugin.markGoogleTranslateProviderSuccess(request);
        return result;
    },
    applyCacheScope(_config, snapshot, plugin) {
        snapshot.endpoint = PROVIDER_DEFAULTS.googleCloud.endpoint;
        snapshot.model = PROVIDER_DEFAULTS.googleCloud.model;
        snapshot.temperature = 0;
        snapshot.maxTokens = 0;
        snapshot.enableThinking = false;
        snapshot.prompt = "";
        snapshot.promptPolicyVersion = plugin.getPromptPolicyVersion("googleCloud");
    }
};

module.exports = { googleCloudAdapter };
