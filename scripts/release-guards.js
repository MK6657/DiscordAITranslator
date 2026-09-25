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

function toRepositoryPath(file) {
    return String(file || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function findLocalOnlyPaths(files = []) {
    return files.filter(file => {
        const [topLevel, ...rest] = toRepositoryPath(file).split("/");
        if (!rest.length) return false;
        if (LOCAL_ONLY_DIRECTORIES.has(topLevel)) return true;
        return topLevel.startsWith(".") && !PUBLISHABLE_DOT_DIRECTORIES.has(topLevel);
    });
}

function findBrowserProfilePaths(files = []) {
    return files.filter(file => {
        const name = toRepositoryPath(file).split("/").pop().toLowerCase().replace(/-(?:journal|wal|shm)$/, "");
        return BROWSER_PROFILE_FILE_NAMES.has(name);
    });
}

module.exports = { findBrowserProfilePaths, findLocalOnlyPaths };
