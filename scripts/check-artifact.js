"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const artifactPath = path.join(root, "DiscordAITranslator.plugin.js");
const packageJson = require(path.join(root, "package.json"));
const artifact = fs.readFileSync(artifactPath);
const text = artifact.toString("utf8");

if (artifact[0] !== 0x2f || artifact[1] !== 0x2a || artifact[2] !== 0x2a) {
    throw new Error("Plugin must start with the BetterDiscord metadata comment and must not contain a BOM.");
}
if (!text.includes("Generated from src/index.js")) throw new Error("Plugin is missing its generated artifact marker.");
if (!/@license\s+MIT\b/.test(text)) throw new Error("Plugin metadata must declare the MIT license.");
if (!text.includes("Copyright (c) 2026 Discord AI Translator contributors")) {
    throw new Error("Plugin is missing the project copyright notice.");
}
if (!text.includes("Permission is hereby granted, free of charge")) {
    throw new Error("Plugin is missing the embedded MIT license notice.");
}
const metadataVersion = text.match(/@version\s+([^\s]+)/)?.[1] || "";
if (metadataVersion !== packageJson.version) throw new Error("Plugin metadata and package versions do not match.");
if (artifact.length > 3_500_000) throw new Error(`Plugin artifact is unexpectedly large: ${artifact.length} bytes.`);

delete require.cache[require.resolve(artifactPath)];
const Plugin = require(artifactPath);
if (typeof Plugin !== "function") throw new Error("Plugin artifact does not export a class/function.");

// BetterDiscord loads plugins in Electron's renderer where Node's require("node:*") is unavailable.
for (const [mode, sandboxRequire] of [
    ["no-require", undefined],
    ["bd-polyfill-no-node-prefix", id => { throw new Error(`Cannot find module '${id}'`); }]
]) {
    const mod = { exports: {} };
    const context = {
        module: mod,
        exports: mod.exports,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        URL,
        URLSearchParams,
        TextEncoder,
        TextDecoder,
        ArrayBuffer,
        DataView,
        Uint8Array,
        Uint32Array,
        Map,
        Set,
        WeakMap,
        WeakSet,
        Promise,
        Error,
        TypeError,
        RangeError,
        RegExp,
        Date,
        JSON,
        Math,
        Object,
        Array,
        Number,
        String,
        Boolean,
        Symbol
    };
    if (sandboxRequire) context.require = sandboxRequire;
    vm.runInNewContext(text, context, { filename: path.basename(artifactPath) });
    if (typeof mod.exports !== "function") {
        throw new Error(`Plugin artifact did not export a class/function in BetterDiscord sandbox (${mode}).`);
    }
    const instance = new mod.exports();
    const receipt = instance.translationCacheStore?.getLegacyTranslationCacheReceipt?.({ savedAt: 1, entries: [] });
    if (!/^[0-9a-f]{64}$/.test(String(receipt?.fingerprint || ""))) {
        throw new Error(`Plugin cache receipt hash failed in BetterDiscord sandbox (${mode}).`);
    }
    if (instance.createMd5Hash?.("abc") !== "900150983cd24fb0d6963f7d28e17f72"
        || instance.createMd5Hash?.("") !== "d41d8cd98f00b204e9800998ecf8427e") {
        throw new Error(`Plugin Baidu MD5 hash failed in BetterDiscord sandbox (${mode}).`);
    }
}

process.stdout.write(`Artifact checks passed (${artifact.length} bytes).\n`);
