// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");
const { createOpenAIChatAdapter } = require("../registry");

const sakuraLocalAdapter = createOpenAIChatAdapter({
    id: "sakuraLocal",
    label: PROVIDER_DEFAULTS.sakuraLocal.label,
    defaultProfile: PROVIDER_DEFAULTS.sakuraLocal,
    isLocal: true,
    allowCloudFallback: false,
    supportsModelDetection: true,
    apiKeyOptional: true
});

module.exports = { sakuraLocalAdapter };
