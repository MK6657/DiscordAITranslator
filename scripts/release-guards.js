"use strict";

// Path rules for the release gate (scripts/release-check.js), and readers for what Git would publish.
// They look at the Git index, so a file that is only staged counts as much as a committed one.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// Top-level folders that hold local tool state or third-party checkouts. Every top-level dot-folder is
// local tool state (agent sessions, browser profiles, editor caches) unless it is listed as publishable.
const LOCAL_ONLY_DIRECTORIES = new Set(["external", "node_modules", "work"]);
const PUBLISHABLE_DOT_DIRECTORIES = new Set([".github"]);
// Agent state lands in whatever folder a session was started from, so these are local at any depth.
const AGENT_STATE_DIRECTORIES = new Set([".claude", ".agents"]);

const GITLINK_MODE = "160000";
const REGULAR_FILE_MODES = new Set(["100644", "100755"]);

// Chromium and Firefox profile files that hold saved logins, cookies, browsing history, autofill data or
// the key that decrypts them. They are binary databases, so the release text scan cannot see into them.
// SQLite side files (-journal, -wal, -shm) hold the same data.
const BROWSER_PROFILE_FILE_NAMES = new Set([
    "local state",
    "login data",
    "login data for account",
    "cookies",
    "extension cookies",
    "safe browsing cookies",
    "history",
    "web data",
    "account web data",
    "cookies.sqlite",
    "places.sqlite",
    "formhistory.sqlite",
    "logins.json",
    "logins-backup.json",
    "key3.db",
    "key4.db"
]);

// The rest of a Chromium profile is private too: open tabs, visited sites, settings, and site storage,
// where discord.com keeps its login token. Profile folders inside a user-data folder (headless runs use
// Default) hold these generic file names; the storage folders below are recognised anywhere, because an
// Electron app's user-data folder (Discord's own, for example) keeps them without a profile folder.
const CHROMIUM_PROFILE_FOLDER = /^(?:default|profile \d+|guest profile|system profile)$/;
const CHROMIUM_PROFILE_FILE_NAMES = new Set([
    "preferences",
    "secure preferences",
    "bookmarks",
    "favicons",
    "shortcuts",
    "top sites",
    "visited links",
    "current session",
    "current tabs",
    "last session",
    "last tabs",
    "network persistent state",
    "transportsecurity"
]);

function toRepositoryPath(file) {
    return String(file || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

// Index of the site-storage or session folder in `folders` that holds `name`, or -1.
function findChromiumStorageFolder(folders, name) {
    return folders.findIndex((folder, index) => {
        const next = folders[index + 1] || "";
        if (folder === "local storage") return next === "leveldb";
        if (folder === "session storage") return true;
        if (folder === "indexeddb") return /\.indexeddb\.(?:leveldb|blob)$/.test(next);
        return folder === "sessions" && index === folders.length - 1 && /^(?:session|tabs)_\d+$/.test(name);
    });
}

// For a browser profile file, the lower-cased user-data folder it belongs to ("" when that is the
// repository root); undefined for any other file.
function getBrowserProfileRoot(file) {
    const folders = toRepositoryPath(file).toLowerCase().split("/");
    const name = folders.pop();
    const parent = folders[folders.length - 1] || "";
    const storageAt = findChromiumStorageFolder(folders, name);
    const isProfileFile = BROWSER_PROFILE_FILE_NAMES.has(name.replace(/-(?:journal|wal|shm)$/, ""))
        || name === "secure preferences"
        || storageAt >= 0
        || (CHROMIUM_PROFILE_FOLDER.test(parent) && CHROMIUM_PROFILE_FILE_NAMES.has(name));
    if (!isProfileFile) return undefined;
    // Above a profile folder, above a storage folder, above an app's Network folder, or the file's own
    // folder (Local State, a Firefox profile).
    const profileAt = folders.findLastIndex(folder => CHROMIUM_PROFILE_FOLDER.test(folder));
    let rootLength = folders.length;
    if (profileAt >= 0) rootLength = profileAt;
    else if (storageAt >= 0) rootLength = storageAt;
    else if (parent === "network") rootLength = folders.length - 1;
    return folders.slice(0, rootLength).join("/");
}

function findLocalOnlyPaths(files = []) {
    return files.filter(file => {
        const [topLevel, ...rest] = toRepositoryPath(file).split("/");
        if (!rest.length) return false;
        if (LOCAL_ONLY_DIRECTORIES.has(topLevel)) return true;
        if (topLevel.startsWith(".") && !PUBLISHABLE_DOT_DIRECTORIES.has(topLevel)) return true;
        return rest.slice(0, -1).some(folder => AGENT_STATE_DIRECTORIES.has(folder.toLowerCase()));
    });
}

// Browser profile files, plus every other file in the user-data folder of one (caches, first-run
// markers), so the whole profile is reported rather than a few stores.
function findBrowserProfilePaths(files = []) {
    const roots = files.map(getBrowserProfileRoot);
    const profileFolders = [...new Set(roots.filter(Boolean))].map(folder => `${folder}/`);
    return files.filter((file, index) => {
        if (roots[index] !== undefined) return true;
        const lower = toRepositoryPath(file).toLowerCase();
        return profileFolders.some(folder => lower.startsWith(folder));
    });
}

// Runs git in `cwd` and returns its output (a Buffer unless an encoding is given); throws when git fails.
function runGit(cwd, args, options = {}) {
    const result = spawnSync("git", args, { cwd, maxBuffer: 512 * 1024 * 1024, ...options });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`git ${args[0]} failed in ${cwd}: ${String(result.stderr || "").trim()}`);
    return result.stdout;
}

function runGitList(cwd, args) {
    return runGit(cwd, args, { encoding: "utf8" }).split("\0").filter(Boolean);
}

// The Git index: every staged path with its mode and object id, gitlinks included.
function readGitIndex(cwd) {
    return runGitList(cwd, ["ls-files", "--stage", "-z"]).map(line => {
        const tab = line.indexOf("\t");
        const [mode, object] = line.slice(0, tab).split(" ");
        return { mode, object, path: line.slice(tab + 1) };
    });
}

// Tracked files that the repository's .gitignore files exclude; only `git add -f` puts them in the index.
// Personal excludes (.git/info/exclude, core.excludesFile) are left out so every machine gets the same answer.
function findForceAddedIgnoredPaths(cwd) {
    return runGitList(cwd, ["ls-files", "-z", "--cached", "--ignored", "--exclude-per-directory=.gitignore"]);
}

// Untracked files that `git add .` would stage. A nested repository is listed once, as its folder ("dir/").
function listUntrackedPaths(cwd) {
    return runGitList(cwd, ["ls-files", "-z", "--others", "--exclude-standard"]);
}

// Tracked gitlinks, and untracked nested checkouts that `git add .` would turn into gitlinks.
function findNestedRepositories(cwd, entries) {
    return [
        ...entries.filter(entry => entry.mode === GITLINK_MODE).map(entry => entry.path),
        ...listUntrackedPaths(cwd).filter(file => file.endsWith("/"))
    ];
}

// Blob contents by object id, read from the object database in one `git cat-file --batch` call.
function readBlobs(cwd, objects) {
    const unique = [...new Set(objects)];
    const blobs = new Map();
    if (!unique.length) return blobs;
    const output = runGit(cwd, ["cat-file", "--batch"], { input: `${unique.join("\n")}\n` });
    let offset = 0;
    for (const object of unique) {
        const headerEnd = output.indexOf(0x0a, offset);
        const [, type, size] = output.toString("utf8", offset, headerEnd).split(" ");
        if (type !== "blob" || headerEnd < 0) throw new Error(`Git object ${object} is not a readable blob (${type || "no answer"}).`);
        offset = headerEnd + 1;
        blobs.set(object, output.subarray(offset, offset + Number(size)));
        offset += Number(size) + 1;
    }
    return blobs;
}

// Text files for the release scan, taken from what Git would publish instead of a walk of the folder tree
// with a skip list: the staged content of every indexed file (force-added ignored files and nested tool
// folders included), the working copy of every tracked file (what `git commit -a` would take), and every
// untracked file that `git add .` would stage. Ignored files that are not in the index are not publishable.
function collectPublishedTexts(cwd, entries, isTextFile) {
    const staged = entries.filter(entry => REGULAR_FILE_MODES.has(entry.mode) && isTextFile(entry.path));
    const blobs = readBlobs(cwd, staged.map(entry => entry.object));
    const texts = staged.map(entry => ({ path: entry.path, source: "staged", content: blobs.get(entry.object).toString("utf8") }));
    const untracked = listUntrackedPaths(cwd).filter(file => !file.endsWith("/") && isTextFile(file));
    for (const file of new Set([...staged.map(entry => entry.path), ...untracked])) {
        const fullPath = path.join(cwd, file);
        let stats = null;
        try { stats = fs.lstatSync(fullPath); }
        catch { continue; } // Deleted from the working tree: its staged content is scanned above.
        if (stats.isFile()) texts.push({ path: file, source: "working tree", content: fs.readFileSync(fullPath, "utf8") });
    }
    return texts;
}

module.exports = {
    collectPublishedTexts,
    findBrowserProfilePaths,
    findForceAddedIgnoredPaths,
    findLocalOnlyPaths,
    findNestedRepositories,
    readGitIndex
};
