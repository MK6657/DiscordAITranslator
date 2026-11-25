"use strict";

// Mainline 6-locale interface string tables (zh-CN, zh-TW, en, ru, ar, es)
// and locale metadata helpers.

const zhCN = require("./i18n/zh-CN");
const zhTW = require("./i18n/zh-TW");
const en = require("./i18n/en");
const ru = require("./i18n/ru");
const ar = require("./i18n/ar");
const es = require("./i18n/es");
const {
    UI_LOCALES,
    UI_LOCALE_CODES,
    LANGUAGE_PRESET_LOCALIZED_NAMES,
    normalizeUiLocale,
    getUiLocaleMeta,
    isRtlLocale,
    getUiLocaleButtonTooltip,
    getLocalizedPresetLanguageName,
    getLocalizedPresetLanguageLabel
} = require("./i18n/locales");

const I18N = {
    "zh-CN": zhCN,
    "zh-TW": zhTW,
    en,
    ru,
    ar,
    es
};

module.exports = {
    I18N,
    UI_LOCALES,
    UI_LOCALE_CODES,
    LANGUAGE_PRESET_LOCALIZED_NAMES,
    normalizeUiLocale,
    getUiLocaleMeta,
    isRtlLocale,
    getUiLocaleButtonTooltip,
    getLocalizedPresetLanguageName,
    getLocalizedPresetLanguageLabel
};
