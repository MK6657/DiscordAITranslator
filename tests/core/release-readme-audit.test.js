"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { version } = require("../../package.json");

const root = path.resolve(__dirname, "../..");
const assetPattern = /\]\(https:\/\/github\.com\/MK6657\/DiscordAITranslator\/releases\/download\/(v[0-9.]+)\/DiscordAITranslator\.plugin\.js\)/g;

test("R06 both READMEs pin the same release asset and label the branch bundle as a source preview", () => {
    const releases = [];
    for (const { filename, installHeading, previewHeading } of [
        { filename: "README.md", installHeading: "## 插件安装（无需 Node.js）", previewHeading: "### 当前分支源码预览" },
        { filename: "README.en.md", installHeading: "## Install the plugin", previewHeading: "### Current branch source preview" }
    ]) {
        const text = fs.readFileSync(path.join(root, filename), "utf8");
        const installStart = text.indexOf(installHeading);
        const previewStart = text.indexOf(previewHeading);
        assert.ok(installStart >= 0 && previewStart > installStart, filename);
        const releaseSection = text.slice(installStart, previewStart);
        const preview = text.slice(previewStart).split(/\n(?=#{2,3} )/)[0];
        const assets = [...releaseSection.matchAll(assetPattern)];
        assert.equal(assets.length, 1, filename);
        assert.ok(releaseSection.includes(`\`${assets[0][1]}\``), filename);
        assert.ok(preview.includes(`\`v${version}\``), filename);
        assert.match(preview, /\[DiscordAITranslator\.plugin\.js\]\(DiscordAITranslator\.plugin\.js\)/);
        assert.doesNotMatch(releaseSection, /\]\(DiscordAITranslator\.plugin\.js\)/);
        assert.notEqual(assets[0][1], `v${version}`, filename);
        releases.push(assets[0][1]);
    }
    assert.equal(releases[0], releases[1]);
});
