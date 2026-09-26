"use strict";

// Path rules for the release gate (scripts/release-check.js). They look at the Git index, so a file that
// is only staged counts as much as a committed one.

// Top-level folders that hold local tool state or third-party checkouts. Every top-level dot-folder is
// local tool state (agent sessions, browser profiles, editor caches) unless it is listed as publishable.
const LOCAL_ONLY_DIRECTORIES = new Set(["external", "node_modules", "work"]);
const PUBLISHABLE_DOT_DIRECTORIES = new Set([".github"]);

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
        return topLevel.startsWith(".") && !PUBLISHABLE_DOT_DIRECTORIES.has(topLevel);
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

module.exports = { findBrowserProfilePaths, findLocalOnlyPaths };
