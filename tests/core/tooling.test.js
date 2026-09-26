"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { findBrowserProfilePaths, findLocalOnlyPaths } = require("../../scripts/release-guards");

const root = path.resolve(__dirname, "..", "..");

// Runs git in `cwd`; null when git is unavailable.
function gitIn(cwd, args, input = undefined) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8", input });
    if (result.error || result.status === null) return null;
    return result;
}

// Runs git in the repository; null when git or the repository is unavailable (for example a ZIP handoff).
function git(args, input = undefined) {
    return gitIn(root, args, input);
}

// A throwaway Git repository with this project's .gitignore and the given files (fake contents), for
// checking what a stray `git add` would stage. The user's global excludes are switched off.
function withScratchRepository(files, callback) {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dait-release-guard-"));
    try {
        fs.copyFileSync(path.join(root, ".gitignore"), path.join(scratch, ".gitignore"));
        for (const file of files) {
            fs.mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true });
            fs.writeFileSync(path.join(scratch, file), `fake ${file}\n`);
        }
        const scratchGit = (args, input) => gitIn(scratch, ["-c", `core.excludesFile=${path.join(scratch, "no-global-excludes")}`, ...args], input);
        assert.equal(scratchGit(["init", "-q"])?.status, 0, "git init failed");
        return callback({ directory: scratch, git: scratchGit });
    }
    finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
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
    "src/css/01-base.js",
    // Folders named like a store (Git matches names case-insensitively on Windows).
    "src/history/index.js",
    "src/History/backfill.js",
    "src/cookies/store.js",
    "src/settings/local state/defaults.js",
    "tests/fixtures/history/sample.json",
    "tests/fixtures/login data/sample.json",
    "docs/web data/overview.md"
];

test("the release gate finds browser profiles and cookie stores among staged files", () => {
    assert.deepEqual(findBrowserProfilePaths(browserProfileFiles), browserProfileFiles);
    assert.deepEqual(findBrowserProfilePaths(ordinaryFiles), []);
    // Windows paths and case differences do not hide a store.
    assert.deepEqual(findBrowserProfilePaths(["profile\\Default\\Network\\cookies", "PROFILE/LOCAL STATE"]), ["profile\\Default\\Network\\cookies", "PROFILE/LOCAL STATE"]);
    assert.deepEqual(findBrowserProfilePaths([]), []);
});

test("a browser profile staged outside the ignored folders is caught whole by the release guard", t => {
    if (!isGitWorkTree()) {
        t.skip("git repository not available");
        return;
    }
    // A headless run with --user-data-dir=tmp/chrome-profile, one started from design/, and an Electron
    // app's user-data folder (Discord's own has this layout: no profile subfolder, token in Local Storage).
    const profileFiles = [
        "tmp/chrome-profile/Local State",
        "tmp/chrome-profile/First Run",
        "tmp/chrome-profile/Default/Preferences",
        "tmp/chrome-profile/Default/Secure Preferences",
        "tmp/chrome-profile/Default/History",
        "tmp/chrome-profile/Default/Login Data",
        "tmp/chrome-profile/Default/Web Data",
        "tmp/chrome-profile/Default/Network/Cookies",
        "tmp/chrome-profile/Default/Sessions/Session_13370000",
        "tmp/chrome-profile/Default/Local Storage/leveldb/000005.ldb",
        "tmp/chrome-profile/Default/Top Sites",
        "tmp/chrome-profile/Default/Visited Links",
        "tmp/chrome-profile/Default/Favicons",
        "tmp/chrome-profile/Default/Shortcuts",
        "tmp/chrome-profile/Default/GPUCache/data_0",
        "design/.chrome-preview/Local State",
        "design/.chrome-preview/Default/Preferences",
        "design/.chrome-preview/Default/Network/Cookies",
        "fixtures/app-data/Preferences",
        "fixtures/app-data/Local Storage/leveldb/000003.ldb",
        "fixtures/app-data/Network/Cookies"
    ];
    const projectFiles = ["src/index.js", "src/history/backfill.js", "docs/notes.md", "design/logo.svg"];
    withScratchRepository([...profileFiles, ...projectFiles], scratch => {
        assert.equal(scratch.git(["add", "."])?.status, 0, "git add failed");
        const staged = scratch.git(["ls-files", "-z"]).stdout.split("\0").filter(Boolean);
        assert.deepEqual([...profileFiles, ...projectFiles].filter(file => !staged.includes(file)), [], "a stray profile must be staged whole, stores included");
        assert.deepEqual(findBrowserProfilePaths(staged).sort(), [...profileFiles].sort());
    });
    // Parts of a profile staged on their own, without any login, cookie or history store.
    for (const file of [
        "tmp/chrome-profile/Default/Local Storage/leveldb/000005.ldb",
        "tmp/chrome-profile/Default/Session Storage/000003.ldb",
        "tmp/chrome-profile/Default/Sessions/Tabs_13370000",
        "tmp/chrome-profile/Default/IndexedDB/https_discord.com_0.indexeddb.leveldb/000003.ldb",
        "tmp/chrome-profile/Default/Secure Preferences",
        "design/.chrome-preview/Profile 1/Preferences",
        "design/.chrome-preview/Default/Visited Links"
    ]) {
        assert.deepEqual(findBrowserProfilePaths([file, "src/index.js"]), [file], file);
    }
    // Look-alikes in project code stay publishable.
    assert.deepEqual(findBrowserProfilePaths([
        "src/sessions/session_1.js",
        "src/settings/preferences.js",
        "docs/Preferences.md",
        "src/storage/local-storage.js",
        "src/default/index.js"
    ]), []);
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

test("the critical-chain contract keeps the cleanup writes and says scroll corrections are skipped while moving", () => {
    const contract = fs.readFileSync(path.join(root, "docs", "critical-chain-contracts.md"), "utf8");
    // removeAutoTranslationNode removes stale automatic lines from disconnected, changed and reused
    // targets and shows their source again; a contract that forbids every DOM write invites dropping that.
    assert.doesNotMatch(contract, /never receive DOM writes/i);
    assert.match(contract, /never receive new translation, loading, or failure lines/);
    assert.match(contract, /stale automatic line/);
    assert.match(contract, /source text it hid/);
    assert.match(contract, /`removeAutoTranslationNode`/);
    // getTranslationScrollSnapshot returns no snapshot while the chat moves, and nothing retries the correction.
    assert.doesNotMatch(contract, /every scroll correction for translation lines wait/i);
    assert.match(contract, /skipped, not deferred/);
    assert.match(contract, /`getTranslationScrollSnapshot`/);
});

test(".gitignore keeps local tool state and browser profiles out without ignoring tracked files", t => {
    if (!isGitWorkTree()) {
        t.skip("git repository not available");
        return;
    }
    const inTopLevelProfile = file => file.startsWith(".chrome-svg-preview/");
    const mustIgnore = [
        ...browserProfileFiles.filter(inTopLevelProfile),
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

    // A store outside those folders must not be ignored on its own: `git add .` would then stage the rest of
    // its profile (sessions, local storage) without the store the release guard recognises.
    const mustStayVisible = browserProfileFiles.filter(file => !inTopLevelProfile(file));
    assert.ok(mustStayVisible.length > 0);
    const visible = git(["check-ignore", "--no-index", "--stdin", "-z"], mustStayVisible.join("\0") + "\0");
    assert.ok(visible && (visible.status === 0 || visible.status === 1));
    assert.deepEqual(visible.stdout.split("\0").filter(Boolean), [], "browser stores outside the ignored profile folders must stay visible to the release guard");

    const publishable = git(["check-ignore", "--no-index", "--stdin", "-z"], ordinaryFiles.join("\0") + "\0");
    assert.ok(publishable && (publishable.status === 0 || publishable.status === 1));
    assert.deepEqual(publishable.stdout.split("\0").filter(Boolean), [], "ordinary project files must stay publishable");

    const trackedButIgnored = git(["ls-files", "-z", "--cached", "--ignored", "--exclude-standard"]);
    assert.equal(trackedButIgnored?.status, 0);
    assert.deepEqual(trackedButIgnored.stdout.split("\0").filter(Boolean), [], "tracked files must not match .gitignore");
});
