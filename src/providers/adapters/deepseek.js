// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");
const { createOpenAIChatAdapter } = require("../registry");

const deepseekAdapter = createOpenAIChatAdapter({
    id: "deepseek",
    label: PROVIDER_DEFAULTS.deepseek.label,
    defaultProfile: PROVIDER_DEFAULTS.deepseek,
    applyBodyOptions(config, body) {
        if (config?.enableThinking) {
            body.thinking = { type: "enabled" };
            delete body.temperature;
        }
        else {
            body.thinking = { type: "disabled" };
        }
        return body;
    }
});

module.exports = { deepseekAdapter };
