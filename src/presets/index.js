// @ts-check
"use strict";

const categories = require("./categories");
const { POLISH_GENERAL_PRESETS } = require("./polish-general");
const { POLISH_DIALECT_PRESETS } = require("./polish-dialects");
const { POLISH_PERSONA_PRESETS } = require("./polish-personas");
const { TRANSLATION_PRESETS, LEGACY_TRANSLATION_NATURAL_PROMPTS } = require("./translation-presets");

const DEFAULT_PROMPT_TEMPLATES = {
    polish: [
        ...POLISH_GENERAL_PRESETS,
        ...POLISH_DIALECT_PRESETS,
        ...POLISH_PERSONA_PRESETS
    ],
    translation: [
        ...TRANSLATION_PRESETS
    ]
};

module.exports = {
    ...categories,
    POLISH_GENERAL_PRESETS,
    POLISH_DIALECT_PRESETS,
    POLISH_PERSONA_PRESETS,
    TRANSLATION_PRESETS,
    DEFAULT_PROMPT_TEMPLATES,
    LEGACY_TRANSLATION_NATURAL_PROMPTS
};
