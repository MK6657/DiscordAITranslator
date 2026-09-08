"use strict";

const fs = require("node:fs");
const path = require("node:path");

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
if (artifact.length > 2_000_000) throw new Error(`Plugin artifact is unexpectedly large: ${artifact.length} bytes.`);

delete require.cache[require.resolve(artifactPath)];
const Plugin = require(artifactPath);
if (typeof Plugin !== "function") throw new Error("Plugin artifact does not export a class/function.");

process.stdout.write(`Artifact checks passed (${artifact.length} bytes).\n`);
