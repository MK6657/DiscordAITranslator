"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { I18N } = require("../../src/i18n");

const root = path.resolve(__dirname, "../..");

function collectJsFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) collectJsFiles(full, out);
        else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
    }
    return out;
}

test("i18n zh-CN and en tables contain the exact same non-empty key set", () => {
    const zh = I18N["zh-CN"] || {};
    const en = I18N.en || {};
    const zhKeys = new Set(Object.keys(zh));
    const enKeys = new Set(Object.keys(en));

    const onlyInZh = [...zhKeys].filter(key => !enKeys.has(key)).sort();
    const onlyInEn = [...enKeys].filter(key => !zhKeys.has(key)).sort();
    assert.deepEqual(onlyInZh, [], `Keys only in zh-CN: ${onlyInZh.join(", ")}`);
    assert.deepEqual(onlyInEn, [], `Keys only in en: ${onlyInEn.join(", ")}`);

    for (const key of zhKeys) {
        assert.equal(typeof zh[key], "string", `zh-CN.${key} must be a string`);
        assert.equal(typeof en[key], "string", `en.${key} must be a string`);
    }
});

test("all static literal t('...') calls across src/ resolve to existing i18n keys", () => {
    const zh = I18N["zh-CN"] || {};
    const en = I18N.en || {};
    const srcFiles = collectJsFiles(path.join(root, "src"));
    const callPattern = /(?:this(?:\.plugin)?\.|\b)t\(\s*["']([A-Za-z0-9_]+)["']\s*(?:,|\))/g;
    const missing = [];

    for (const file of srcFiles) {
        if (path.basename(file) === "i18n.js") continue;
        const rel = path.relative(root, file).replace(/\\/g, "/");
        const content = fs.readFileSync(file, "utf8");
        for (const match of content.matchAll(callPattern)) {
            const key = match[1];
            if (!(key in zh) || !(key in en)) {
                missing.push(`${rel}: ${key}`);
            }
        }
    }

    assert.deepEqual(missing, [], `Missing i18n keys referenced in src/: ${missing.join("; ")}`);
});
