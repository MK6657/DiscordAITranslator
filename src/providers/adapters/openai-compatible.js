// @ts-check
"use strict";

const { PROVIDER_DEFAULTS } = require("../../constants");
const { createOpenAIChatAdapter } = require("../registry");

const openaiCompatibleAdapter = createOpenAIChatAdapter({
    id: "openaiCompatible",
    label: PROVIDER_DEFAULTS.openaiCompatible.label,
    defaultProfile: PROVIDER_DEFAULTS.openaiCompatible,
    supportsModelDetection: true,
    applyBodyOptions(config, body) {
        const model = String(body?.model || config?.model || "").trim();
        if (/(?:^|\/)(?:o1|o3|o4|gpt-5)(?:[-_:]|$)/i.test(model)) {
            if (body.max_tokens !== undefined && body.max_completion_tokens === undefined) {
                body.max_completion_tokens = body.max_tokens;
                delete body.max_tokens;
            }
            if (body.temperature !== undefined && body.temperature !== 1) {
                delete body.temperature;
            }
        }
        return body;
    }
});

module.exports = { openaiCompatibleAdapter };
