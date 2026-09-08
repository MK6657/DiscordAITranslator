"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const roots = [path.join(root, "src"), path.join(root, "scripts"), path.join(root, "tests")];

function collectJavaScript(directory, output = []) {
    if (!fs.existsSync(directory)) return output;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) collectJavaScript(fullPath, output);
        else if (entry.isFile() && entry.name.endsWith(".js")) output.push(fullPath);
    }
    return output;
}

const files = roots.flatMap(directory => collectJavaScript(directory)).sort();
for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout || `Syntax check failed: ${file}\n`);
        process.exit(result.status || 1);
    }
}

const packageJson = require(path.join(root, "package.json"));
const metadata = fs.readFileSync(path.join(root, "src", "metadata.txt"), "utf8");
const version = metadata.match(/@version\s+([^\s]+)/)?.[1] || "";
if (version !== packageJson.version) {
    throw new Error(`Version mismatch: package=${packageJson.version} metadata=${version || "missing"}`);
}

process.stdout.write(`Source checks passed (${files.length} JavaScript files).\n`);
