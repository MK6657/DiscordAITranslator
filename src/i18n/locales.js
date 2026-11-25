"use strict";

// Canonical metadata for all 6 mainline UI locales and localized display names
// for target/source language presets.

const UI_LOCALES = Object.freeze([
    Object.freeze({
        code: "zh-CN",
        label: "简体中文",
        shortLabel: "简中",
        englishLabel: "Simplified Chinese",
        bcp47: "zh-CN",
        dir: "ltr"
    }),
    Object.freeze({
        code: "zh-TW",
        label: "繁體中文",
        shortLabel: "繁體",
        englishLabel: "Traditional Chinese",
        bcp47: "zh-TW",
        dir: "ltr"
    }),
    Object.freeze({
        code: "en",
        label: "English",
        shortLabel: "EN",
        englishLabel: "English",
        bcp47: "en-US",
        dir: "ltr"
    }),
    Object.freeze({
        code: "ru",
        label: "Русский",
        shortLabel: "Рус",
        englishLabel: "Russian",
        bcp47: "ru-RU",
        dir: "ltr"
    }),
    Object.freeze({
        code: "ar",
        label: "العربية",
        shortLabel: "عربي",
        englishLabel: "Arabic",
        bcp47: "ar",
        dir: "rtl"
    }),
    Object.freeze({
        code: "es",
        label: "Español",
        shortLabel: "ES",
        englishLabel: "Spanish",
        bcp47: "es",
        dir: "ltr"
    })
]);

const UI_LOCALE_CODES = Object.freeze(UI_LOCALES.map(item => item.code));
const UI_LOCALE_MAP = new Map(UI_LOCALES.map(item => [item.code, item]));

const LOCALE_ALIASES = Object.freeze({
    "zh": "zh-CN",
    "zh-cn": "zh-CN",
    "zh_cn": "zh-CN",
    "zh-hans": "zh-CN",
    "zh-sg": "zh-CN",
    "zh-tw": "zh-TW",
    "zh_tw": "zh-TW",
    "zh-hant": "zh-TW",
    "zh-hk": "zh-TW",
    "zh-mo": "zh-TW",
    "en": "en",
    "en-us": "en",
    "en_us": "en",
    "en-gb": "en",
    "ru": "ru",
    "ru-ru": "ru",
    "ru_ru": "ru",
    "ar": "ar",
    "ar-sa": "ar",
    "ar-eg": "ar",
    "ar-ae": "ar",
    "es": "es",
    "es-es": "es",
    "es-419": "es",
    "es-mx": "es",
    "es-ar": "es"
});

const LANGUAGE_PRESET_LOCALIZED_NAMES = Object.freeze({
    "zh-TW": Object.freeze({
        "汉语": "漢語",
        "繁體中文": "繁體中文",
        "英语": "英語",
        "西班牙语": "西班牙語",
        "法语": "法語",
        "印地语": "印地語",
        "俄语": "俄語",
        "德语": "德語",
        "日语": "日語",
        "阿拉伯语": "阿拉伯語",
        "越南语": "越南語",
        "朝鲜语": "韓語",
        "意大利语": "義大利語"
    }),
    ru: Object.freeze({
        "汉语": "Китайский",
        "繁體中文": "Китайский (трад.)",
        "英语": "Английский",
        "西班牙语": "Испанский",
        "法语": "Французский",
        "印地语": "Хинди",
        "俄语": "Русский",
        "德语": "Немецкий",
        "日语": "Японский",
        "阿拉伯语": "Арабский",
        "越南语": "Вьетнамский",
        "朝鲜语": "Корейский",
        "意大利语": "Итальянский"
    }),
    ar: Object.freeze({
        "汉语": "الصينية",
        "繁體中文": "الصينية التقليدية",
        "英语": "الإنجليزية",
        "西班牙语": "الإسبانية",
        "法语": "الفرنسية",
        "印地语": "الهندية",
        "俄语": "الروسية",
        "德语": "الألمانية",
        "日语": "اليابانية",
        "阿拉伯语": "العربية",
        "越南语": "الفيتنامية",
        "朝鲜语": "الكورية",
        "意大利语": "الإيطالية"
    }),
    es: Object.freeze({
        "汉语": "Chino",
        "繁體中文": "Chino tradicional",
        "英语": "Inglés",
        "西班牙语": "Español",
        "法语": "Francés",
        "印地语": "Hindi",
        "俄语": "Ruso",
        "德语": "Alemán",
        "日语": "Japonés",
        "阿拉伯语": "Árabe",
        "越南语": "Vietnamita",
        "朝鲜语": "Coreano",
        "意大利语": "Italiano"
    })
});

function normalizeUiLocale(value, fallback = "zh-CN") {
    const raw = String(value || "").trim();
    if (!raw) return fallback;
    if (UI_LOCALE_MAP.has(/** @type {any} */ (raw))) return raw;
    const lower = raw.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(LOCALE_ALIASES, lower)) return LOCALE_ALIASES[lower];
    const primary = lower.split(/[-_]/)[0];
    if (primary === "zh") {
        return /(?:tw|hk|mo|hant)/.test(lower) ? "zh-TW" : "zh-CN";
    }
    if (Object.prototype.hasOwnProperty.call(LOCALE_ALIASES, primary)) return LOCALE_ALIASES[primary];
    return fallback;
}

function getUiLocaleMeta(locale) {
    const normalized = normalizeUiLocale(locale);
    return UI_LOCALE_MAP.get(/** @type {any} */ (normalized)) || UI_LOCALES[0];
}

function isRtlLocale(locale) {
    return getUiLocaleMeta(locale).dir === "rtl";
}

function getUiLocaleButtonTooltip(localeOrMeta) {
    const meta = typeof localeOrMeta === "string" ? getUiLocaleMeta(localeOrMeta) : localeOrMeta;
    if (!meta) return "";
    return meta.code === "en" ? meta.label : `${meta.label} · ${meta.englishLabel}`;
}

function getLocalizedPresetLanguageName(language, locale = "zh-CN") {
    if (!language || typeof language !== "object") return String(language || "");
    const normalizedLocale = normalizeUiLocale(locale);
    if (normalizedLocale === "en") return String(language.en || language.value || "");
    if (normalizedLocale === "zh-CN") return String(language.zh || language.value || "");
    const table = LANGUAGE_PRESET_LOCALIZED_NAMES[normalizedLocale];
    const lookupKey = String(language.value || language.zh || "").trim();
    if (table && lookupKey && Object.prototype.hasOwnProperty.call(table, lookupKey)) {
        return table[lookupKey];
    }
    return String(language.en || language.zh || language.value || "");
}

function getLocalizedPresetLanguageLabel(language, locale = "zh-CN") {
    if (!language || typeof language !== "object") return String(language || "");
    const normalizedLocale = normalizeUiLocale(locale);
    if (normalizedLocale === "en") return String(language.en || language.value || "");
    const localized = getLocalizedPresetLanguageName(language, normalizedLocale);
    const english = String(language.en || "").trim();
    if (!english || localized.toLowerCase() === english.toLowerCase()) return localized;
    return `${localized} - ${english}`;
}

module.exports = {
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
