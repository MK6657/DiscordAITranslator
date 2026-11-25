// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");
const { createOpenAIChatAdapter } = require("../registry");

const deepseekAdapter = createOpenAIChatAdapter({
    id: "deepseek",
    label: PROVIDER_DEFAULTS.deepseek.label,
    defaultProfile: PROVIDER_DEFAULTS.deepseek,
    applyBodyOptions(config, body) {
        const model = String(body?.model || config?.model || "").trim();
        const isReasoner = /(?:^|\/)(?:deepseek-reasoner|deepseek-r1)(?:[-_:]|$)/i.test(model);
        if (config?.enableThinking) {
            body.thinking = { type: "enabled" };
            delete body.temperature;
        }
        else if (isReasoner) {
            delete body.temperature;
            delete body.thinking;
        }
        else {
            body.thinking = { type: "disabled" };
        }
        return body;
    }
});

module.exports = { deepseekAdapter };
