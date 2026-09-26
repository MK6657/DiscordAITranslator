"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
    collectPublishedTexts,
    findBrowserProfilePaths,
    findForceAddedIgnoredPaths,
    findLocalOnlyPaths,
    findNestedRepositories,
    readGitIndex
} = require("./release-guards");

const root = path.resolve(__dirname, "..");
const textExtensions = new Set(["", ".js", ".json", ".md", ".ps1", ".txt", ".yml", ".yaml"]);
const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /\bsk-[A-Za-z0-9_-]{24,}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
    /\bgh[pousr]_[0-9A-Za-z]{30,}\b/,
    /\bgithub_pat_[0-9A-Za-z_]{40,}\b/,
    /\bnpm_[0-9A-Za-z]{36}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bBearer\s+[A-Za-z0-9._-]{24,}\b/i
];

const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
if (!/^\/external\/$/m.test(gitignore)) throw new Error(".gitignore must exclude the local GPL reference checkout at /external/.");

const requiredFiles = [
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "SECURITY.md",
    "CONTRIBUTING.md",
    "THIRD_PARTY_NOTICES.md",
    path.join("docs", "provenance-review.md"),
    path.join("docs", "host-smoke-test.md")
];
const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
    console.error(`Release blocked. Missing required files: ${missing.join(", ")}`);
    console.error("Complete the license and provenance documentation before publishing a public release.");
    process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const license = fs.readFileSync(path.join(root, "LICENSE"), "utf8");
const provenance = fs.readFileSync(path.join(root, "docs", "provenance-review.md"), "utf8");
if (packageJson.license !== "MIT" || packageLock.packages?.[""]?.license !== "MIT") {
    throw new Error("package.json and package-lock.json must both declare the MIT license.");
}
if (!license.startsWith("MIT License\n")
    || !license.includes("Copyright (c) 2026 Discord AI Translator contributors")
    || !license.includes("Permission is hereby granted, free of charge")) {
    throw new Error("LICENSE is not the expected project MIT license.");
}
if (!/^Status:\s*Passed$/mi.test(provenance)) {
    throw new Error("The provenance review must contain a 'Status: Passed' release decision.");
}

const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" });
if (gitRoot.status !== 0 || path.resolve(gitRoot.stdout.trim()) !== root) {
    throw new Error("Release checks require a valid Git repository rooted at the project directory.");
}
// The Git index holds staged files as well as committed ones, including ignored files added with `git add -f`.
const indexEntries = readGitIndex(root);
const trackedFiles = [...new Set(indexEntries.map(entry => entry.path.replace(/\\/g, "/")))];
const forbiddenTracked = findLocalOnlyPaths(trackedFiles);
if (forbiddenTracked.length) {
    throw new Error(`Local-only files are tracked by Git: ${forbiddenTracked.join(", ")}`);
}
// Browser profiles are binary databases, so the text scan below cannot see the logins, cookies, history or site tokens in them.
const browserProfileFiles = findBrowserProfilePaths(trackedFiles);
if (browserProfileFiles.length) {
    const listed = browserProfileFiles.slice(0, 20).join(", ") + (browserProfileFiles.length > 20 ? ` and ${browserProfileFiles.length - 20} more` : "");
    throw new Error(`Browser profile data (logins, cookies, history or site storage) is staged or tracked by Git: ${listed}. Remove the whole profile folder from Git with 'git rm -r --cached' and keep browser profiles outside the repository.`);
}
const forceAddedIgnored = findForceAddedIgnoredPaths(root);
if (forceAddedIgnored.length) {
    throw new Error(`Files that .gitignore excludes are staged or tracked by Git (added with 'git add -f'?): ${forceAddedIgnored.join(", ")}. Remove them with 'git rm --cached', or change .gitignore if they belong in the repository.`);
}
const nestedRepositories = findNestedRepositories(root, indexEntries);
if (nestedRepositories.length) {
    throw new Error(`Nested Git repositories found: ${nestedRepositories.join(", ")}. Keep reference checkouts in the ignored external/ folder.`);
}

// Secrets and private paths in anything Git would publish: staged content, working copies of tracked files,
// and untracked files that `git add .` would stage. Ignored files outside the index are never published.
const privateHome = path.join("C:\\Users", os.userInfo().username).toLowerCase();
const isScannedText = file => textExtensions.has(path.extname(file).toLowerCase());
for (const text of collectPublishedTexts(root, indexEntries, isScannedText)) {
    if (secretPatterns.some(pattern => pattern.test(text.content))) {
        throw new Error(`Potential secret detected in ${text.path} (${text.source}).`);
    }
    if (privateHome.length > "C:\\Users\\".length && text.content.toLowerCase().includes(privateHome)) {
        throw new Error(`Private machine path detected in ${text.path} (${text.source}).`);
    }
}

const requiredTracked = [
    ...requiredFiles,
    ".github/workflows/ci.yml",
    ".gitignore",
    "DiscordAITranslator.plugin.js",
    "package.json",
    "package-lock.json",
    "src/index.js",
    "src/metadata.txt"
].map(file => file.replace(/\\/g, "/"));
const missingTracked = requiredTracked.filter(file => !trackedFiles.includes(file));
if (missingTracked.length) {
    throw new Error(`Required release files are not tracked by Git: ${missingTracked.join(", ")}`);
}

const npmCliCandidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js")
].filter(Boolean);
const npmCli = npmCliCandidates.find(candidate => fs.existsSync(candidate));
if (!npmCli) throw new Error("Unable to locate npm-cli.js. Run the release gate with 'npm run release:check'.");
const result = spawnSync(process.execPath, [npmCli, "run", "ci"], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
process.stdout.write("Release checks passed.\n");
