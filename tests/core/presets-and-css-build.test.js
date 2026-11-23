"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const constants = require("../../src/constants");
const presets = require("../../src/presets");

const root = path.resolve(__dirname, "../..");

test("src/presets exports identical built-in polish and translation templates as src/constants", () => {
    assert.equal(constants.DEFAULT_PROMPT_TEMPLATES, presets.DEFAULT_PROMPT_TEMPLATES);
    assert.equal(constants.LEGACY_TRANSLATION_NATURAL_PROMPTS, presets.LEGACY_TRANSLATION_NATURAL_PROMPTS);
    assert.equal(presets.POLISH_GENERAL_PRESETS.length, 8);
    assert.equal(presets.POLISH_DIALECT_PRESETS.length, 22);
    assert.equal(presets.POLISH_PERSONA_PRESETS.length, 29);
    assert.equal(presets.DEFAULT_PROMPT_TEMPLATES.polish.length, 59);
    assert.equal(presets.DEFAULT_PROMPT_TEMPLATES.translation.length, 6);

    const seenIds = new Set();
    const seenSerials = new Set();
    for (const item of presets.DEFAULT_PROMPT_TEMPLATES.polish) {
        assert.ok(item.id && !seenIds.has(item.id), `duplicate polish preset id: ${item.id}`);
        assert.ok(item.serial && !seenSerials.has(item.serial), `duplicate polish preset serial: ${item.serial}`);
        assert.ok(presets.POLISH_PROMPT_TEMPLATE_CATEGORIES.includes(item.category), `invalid category for ${item.id}`);
        seenIds.add(item.id);
        seenSerials.add(item.serial);
    }
});

test("src/constants.js stays compact after preset extraction", () => {
    const lineCount = fs.readFileSync(path.join(root, "src", "constants.js"), "utf8").split(/\r?\n/).length;
    assert.ok(lineCount < 1100, `Expected src/constants.js < 1100 lines, got ${lineCount}`);
});
