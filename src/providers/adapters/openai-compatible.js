// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");
const { createOpenAIChatAdapter } = require("../registry");

const openaiCompatibleAdapter = createOpenAIChatAdapter({
    id: "openaiCompatible",
    label: PROVIDER_DEFAULTS.openaiCompatible.label,
    defaultProfile: PROVIDER_DEFAULTS.openaiCompatible,
    supportsModelDetection: true
});

module.exports = { openaiCompatibleAdapter };
