// @ts-check
"use strict";

const PROMPT_TEMPLATE_CATEGORY_GENERAL = "general";
const PROMPT_TEMPLATE_CATEGORY_DIALECT = "dialect";
const PROMPT_TEMPLATE_CATEGORY_PERSONA = "persona";
const POLISH_PROMPT_TEMPLATE_CATEGORIES = Object.freeze([
    PROMPT_TEMPLATE_CATEGORY_GENERAL,
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    PROMPT_TEMPLATE_CATEGORY_PERSONA
]);
const DIALECT_REGION_ORDER = Object.freeze([
    "southChina",
    "southwest",
    "north",
    "eastCentral"
]);
const PERSONA_GROUP_ORDER = Object.freeze([
    "monarchs",
    "strategists",
    "literati",
    "global"
]);

module.exports = {
    PROMPT_TEMPLATE_CATEGORY_GENERAL,
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    PROMPT_TEMPLATE_CATEGORY_PERSONA,
    POLISH_PROMPT_TEMPLATE_CATEGORIES,
    DIALECT_REGION_ORDER,
    PERSONA_GROUP_ORDER
};
