"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { I18N, UI_LOCALE_CODES } = require("../../src/i18n");

const root = path.resolve(__dirname, "../..");

function collectJsFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectJsFiles(full, out);
        else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
    }
    return out;
}

function extractPlaceholders(text) {
    return [...new Set([...String(text || "").matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match => match[1]))].sort();
}

test("all 6 UI locale tables contain the exact same key set and placeholder tokens", () => {
    assert.deepEqual(UI_LOCALE_CODES, ["zh-CN", "zh-TW", "en", "ru", "ar", "es"]);
    const baseLocale = "zh-CN";
    const base = I18N[baseLocale] || {};
    const baseKeys = Object.keys(base).sort();
    assert.ok(baseKeys.length >= 740, "expected full i18n dictionary");

    for (const locale of UI_LOCALE_CODES) {
        const table = I18N[locale] || {};
        const localeKeys = Object.keys(table).sort();
        const missing = baseKeys.filter(key => !(key in table));
        const extra = localeKeys.filter(key => !(key in base));
        assert.deepEqual(missing, [], `Missing keys in ${locale}: ${missing.join(", ")}`);
        assert.deepEqual(extra, [], `Extra keys in ${locale}: ${extra.join(", ")}`);

        for (const key of baseKeys) {
            assert.equal(typeof table[key], "string", `${locale}.${key} must be a string`);
            assert.equal(
                Boolean(table[key].length),
                Boolean(base[key].length),
                `${locale}.${key} emptiness must match ${baseLocale}.${key}`
            );
            assert.deepEqual(
                extractPlaceholders(table[key]),
                extractPlaceholders(base[key]),
                `${locale}.${key} placeholders must match ${baseLocale}.${key}`
            );
        }
    }
});

test("all static literal t('...') calls across src/ resolve to existing i18n keys in all 6 locales", () => {
    const srcFiles = collectJsFiles(path.join(root, "src"));
    const callPattern = /(?:this(?:\.plugin)?\.|\b)t\(\s*["']([A-Za-z0-9_]+)["']\s*(?:,|\))/g;
    const missing = [];

    for (const file of srcFiles) {
        const rel = path.relative(root, file).replace(/\\/g, "/");
        if (rel === "src/i18n.js" || rel.startsWith("src/i18n/")) continue;
        const content = fs.readFileSync(file, "utf8");
        for (const match of content.matchAll(callPattern)) {
            const key = match[1];
            for (const locale of UI_LOCALE_CODES) {
                if (!(key in (I18N[locale] || {}))) {
                    missing.push(`${rel} (${locale}): ${key}`);
                }
            }
        }
    }

    assert.deepEqual(missing, [], `Missing i18n keys referenced in src/: ${missing.join("; ")}`);
});
