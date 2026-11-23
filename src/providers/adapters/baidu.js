// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");

/** @type {import("../registry").ProviderAdapter} */
const baiduAdapter = {
    id: "baidu",
    label: PROVIDER_DEFAULTS.baidu.label,
    kind: "direct",
    tasks: { polish: false, translation: true },
    defaultProfile: PROVIDER_DEFAULTS.baidu,
    credentialFields: ["appId", "secretKey"],
    responseParser: "baiduTranslate",
    getEffectiveEndpoint(config) {
        return String(config?.endpoint || PROVIDER_DEFAULTS.baidu.endpoint).trim();
    },
    buildRequest(kind, input, config, _defaultConfig, _options, plugin) {
        if (kind !== "translation") throw new Error(plugin.t("translationDisabled"));
        return plugin.buildBaiduTranslateRequest(input, config);
    },
    parseResponse(raw, request, options, plugin) {
        return plugin.parseBaiduTranslateResponse(raw, request?.translate?.expectedCount || 1, {
            asArray: Boolean(options?.translateAsArray),
            rowCounts: request?.translate?.rowCounts
        });
    }
};

module.exports = { baiduAdapter };
