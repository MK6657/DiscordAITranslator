"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { findBrowserProfilePaths, findLocalOnlyPaths } = require("../../scripts/release-guards");

const root = path.resolve(__dirname, "..", "..");

// Runs git in the repository; null when git or the repository is unavailable (for example a ZIP handoff).
function git(args, input = undefined) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", input });
    if (result.error || result.status === null) return null;
    return result;
}

function isGitWorkTree() {
    const result = git(["rev-parse", "--is-inside-work-tree"]);
    return Boolean(result && result.status === 0 && result.stdout.trim() === "true");
}

function listTrackedFiles() {
    const result = git(["ls-files", "-z"]);
    assert.equal(result?.status, 0, "git ls-files failed");
    return result.stdout.split("\0").filter(Boolean);
}

// Paths of a headless Chrome/Edge profile and a Firefox profile, as a stray `git add` would stage them.
const browserProfileFiles = [
    ".chrome-svg-preview/Local State",
    ".chrome-svg-preview/Default/Login Data",
    ".chrome-svg-preview/Default/Login Data-journal",
    ".chrome-svg-preview/Default/Login Data For Account",
    ".chrome-svg-preview/Default/History",
    ".chrome-svg-preview/Default/Web Data",
    ".chrome-svg-preview/Default/Account Web Data-journal",
    ".chrome-svg-preview/Default/Network/Cookies",
    "tmp/edge-profile/Default/Network/Cookies-journal",
    "tmp/edge-profile/Default/Extension Cookies",
    "tmp/edge-profile/Default/Safe Browsing Cookies",
    "fixtures/firefox-profile/cookies.sqlite",
    "fixtures/firefox-profile/cookies.sqlite-wal",
    "fixtures/firefox-profile/places.sqlite-shm",
    "fixtures/firefox-profile/formhistory.sqlite",
    "fixtures/firefox-profile/logins.json",
    "fixtures/firefox-profile/logins-backup.json",
    "fixtures/firefox-profile/key4.db",
    "fixtures/firefox-profile/key3.db"
];

// Ordinary project files whose names merely resemble browser stores.
const ordinaryFiles = [
    "src/history.js",
    "src/settings/history-store.js",
    "docs/cookies.md",
    "HISTORY.md",
    "tests/core/login-data.test.js",
    "design/discord-ai-translator-settings-concept.svg",
    "docs/web-data.md",
    "src/css/01-base.js"
];

test("the release gate finds browser profiles and cookie stores among staged files", () => {
    assert.deepEqual(findBrowserProfilePaths(browserProfileFiles), browserProfileFiles);
    assert.deepEqual(findBrowserProfilePaths(ordinaryFiles), []);
    // Windows paths and case differences do not hide a store.
    assert.deepEqual(findBrowserProfilePaths(["profile\\Default\\Network\\cookies", "PROFILE/LOCAL STATE"]), ["profile\\Default\\Network\\cookies", "PROFILE/LOCAL STATE"]);
    assert.deepEqual(findBrowserProfilePaths([]), []);
});

test("the release gate rejects tracked local tool folders but keeps .github and dot files", () => {
    const localOnly = [
        ".claude/launch.json",
        ".claude/worktrees/wf-example/src/index.js",
        ".chrome-svg-preview/Variations",
        ".agents/state.json",
        ".cursor/rules/example.md",
        "external/reference/README.md",
        "node_modules/esbuild/package.json",
        "work/notes.txt"
    ];
    assert.deepEqual(findLocalOnlyPaths(localOnly), localOnly);
    const publishable = [
        ".github/workflows/ci.yml",
        ".gitignore",
        ".gitattributes",
        ".editorconfig",
        "docs/work/plan.md",
        "src/.keep",
        "tests/fixtures/.hidden/sample.txt",
        "DiscordAITranslator.plugin.js"
    ];
    assert.deepEqual(findLocalOnlyPaths(publishable), []);
});

test("release-check applies both guards to the Git index before running CI", () => {
    const source = fs.readFileSync(path.join(root, "scripts", "release-check.js"), "utf8");
    assert.match(source, /require\("\.\/release-guards"\)/);
    const localOnlyAt = source.indexOf("findLocalOnlyPaths(trackedFiles)");
    const browserAt = source.indexOf("findBrowserProfilePaths(trackedFiles)");
    const ciAt = source.indexOf('"run", "ci"');
    assert.ok(localOnlyAt > 0, "release-check must reject tracked local tool folders");
    assert.ok(browserAt > 0, "release-check must reject tracked browser profile files");
    assert.ok(ciAt > localOnlyAt && ciAt > browserAt, "the guards must run before the CI step");
    // The text scan skips local agent state; the index guard above still rejects it if tracked.
    assert.match(source, /excludedDirectories = new Set\(\[[^\]]*"\.claude"/);
});

test("this repository tracks no local tool state or browser profile files", t => {
    if (!isGitWorkTree()) {
        t.skip("git repository not available");
        return;
    }
    const tracked = listTrackedFiles();
    assert.ok(tracked.length > 0);
    assert.deepEqual(findLocalOnlyPaths(tracked), []);
    assert.deepEqual(findBrowserProfilePaths(tracked), []);
});

function readSourceTree(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).map(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return readSourceTree(fullPath);
        return entry.name.endsWith(".js") ? fs.readFileSync(fullPath, "utf8") : "";
    }).join("\n");
}

test("the critical-chain contract allows the v0.3.0 cached-draw pass and names live code", () => {
    const contract = fs.readFileSync(path.join(root, "docs", "critical-chain-contracts.md"), "utf8");
    // v0.3.0 draws cached lines just outside the viewport on purpose; the release gate must not forbid it.
    assert.doesNotMatch(contract, /out-of-viewport targets do not receive/i);
    assert.match(contract, /cached-draw pass/i);
    assert.match(contract, /Stillness rule/);
    assert.match(contract, /Do not reintroduce a strict viewport check for cache draws/);

    const source = readSourceTree(path.join(root, "src"));
    const installer = fs.readFileSync(path.join(root, "scripts", "install-plugin.ps1"), "utf8");
    const named = [...contract.matchAll(/`([^`]+)`/g)].map(match => match[1]);
    assert.ok(named.includes("tests/core/scroll-cache-draw.test.js"));
    for (const token of named) {
        if (/^[\w.-]+\/[\w./-]+\.\w+$/.test(token)) {
            assert.ok(fs.existsSync(path.join(root, token)), `${token} is named in the contract but does not exist`);
        }
        else if (/^[A-Za-z_]\w{3,}$/.test(token) && /[A-Z]/.test(token)) {
            assert.ok(source.includes(token), `${token} is named in the contract but no longer exists in src`);
        }
        else if (/^-[A-Z]\w+$/.test(token) && token !== "-WhatIf") {
            assert.match(installer, new RegExp(`\\[switch\\]\\$${token.slice(1)}\\b`), `${token} is named in the contract but the installer has no such switch`);
        }
    }
});

test(".gitignore keeps local tool state and browser profiles out without ignoring tracked files", t => {
    if (!isGitWorkTree()) {
        t.skip("git repository not available");
        return;
    }
    const mustIgnore = [
        ...browserProfileFiles,
        ".claude/launch.json",
        ".claude/worktrees/wf-example/src/index.js",
        ".chrome-svg-preview/Variations",
        ".chrome-svg-preview/Default/Preferences",
        ".chrome-profile-smoke/Default/Preferences",
        ".edge-profile/Default/Preferences"
    ];
    // --no-index checks the patterns alone, as they would apply to a fresh `git add`.
    const checked = git(["check-ignore", "--no-index", "--stdin", "-z"], mustIgnore.join("\0") + "\0");
    assert.ok(checked && (checked.status === 0 || checked.status === 1), `git check-ignore failed: ${checked?.stderr || ""}`);
    const ignored = new Set(checked.stdout.split("\0").filter(Boolean));
    assert.deepEqual(mustIgnore.filter(file => !ignored.has(file)), [], "these local-only paths are not ignored");

    const publishable = git(["check-ignore", "--no-index", "--stdin", "-z"], ordinaryFiles.join("\0") + "\0");
    assert.ok(publishable && (publishable.status === 0 || publishable.status === 1));
    assert.deepEqual(publishable.stdout.split("\0").filter(Boolean), [], "ordinary project files must stay publishable");

    const trackedButIgnored = git(["ls-files", "-z", "--cached", "--ignored", "--exclude-standard"]);
    assert.equal(trackedButIgnored?.status, 0);
    assert.deepEqual(trackedButIgnored.stdout.split("\0").filter(Boolean), [], "tracked files must not match .gitignore");
});
