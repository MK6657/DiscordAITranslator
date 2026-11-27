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

// Static external require(...) allowlist check: esbuild bundles internal modules via __commonJS/__require
// closures, so any bare top-level/nested require(...) in code is a real runtime Node module lookup. Only
// the optional try/catch-guarded crypto fast path in createMd5Hash (backed by pure-JS RFC 1321 MD5) is allowed.
const ALLOWED_EXTERNAL_REQUIRES = new Set(["crypto", "node:crypto"]);
const REGEX_PRECEDING_KEYWORDS = new Set([
    "return", "throw", "case", "typeof", "void", "delete", "in", "instanceof", "new", "yield", "await", "else", "do"
]);
const REGEX_PRECEDING_PUNCTUATION = new Set([
    "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "^", "~"
]);

function isIdentStart(ch) {
    return (ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_" || ch === "$";
}

function isIdentPart(ch) {
    return isIdentStart(ch) || (ch >= "0" && ch <= "9");
}

function skipWhitespaceAndComments(source, start) {
    let i = start;
    while (i < source.length) {
        const ch = source[i];
        if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
            i++;
            continue;
        }
        if (ch === "/" && source[i + 1] === "/") {
            i += 2;
            while (i < source.length && source[i] !== "\n") i++;
            continue;
        }
        if (ch === "/" && source[i + 1] === "*") {
            const end = source.indexOf("*/", i + 2);
            i = end >= 0 ? end + 2 : source.length;
            continue;
        }
        break;
    }
    return i;
}

function readSimpleQuotedString(source, start) {
    const quote = source[start];
    if (quote !== "\"" && quote !== "'" && quote !== "`") return null;
    let i = start + 1;
    let value = "";
    while (i < source.length) {
        const ch = source[i];
        if (ch === "\\") {
            if (i + 1 >= source.length) return null;
            value += source[i + 1];
            i += 2;
            continue;
        }
        if (quote === "`" && ch === "$" && source[i + 1] === "{") return null;
        if (ch === quote) return { value, end: i + 1 };
        value += ch;
        i++;
    }
    return null;
}

function scanTemplateSegment(source, startAfterOpen) {
    let i = startAfterOpen;
    while (i < source.length) {
        const ch = source[i];
        if (ch === "\\") {
            i += 2;
            continue;
        }
        if (ch === "`") return { kind: "end", next: i + 1 };
        if (ch === "$" && source[i + 1] === "{") return { kind: "expr", next: i + 2 };
        i++;
    }
    return { kind: "end", next: source.length };
}

function findExternalRequires(source) {
    const found = [];
    const templateBraceStack = [];
    let line = 1;
    let prevToken = "";
    let prevIsKeyword = false;

    const advanceTo = target => {
        while (cursor < target) {
            if (source[cursor] === "\n") line++;
            cursor++;
        }
    };

    let cursor = 0;
    while (cursor < source.length) {
        const ch = source[cursor];
        if (ch === "\n") {
            line++;
            cursor++;
            continue;
        }
        if (ch === " " || ch === "\t" || ch === "\r") {
            cursor++;
            continue;
        }
        if (ch === "/" && source[cursor + 1] === "/") {
            let end = cursor + 2;
            while (end < source.length && source[end] !== "\n") end++;
            advanceTo(end);
            continue;
        }
        if (ch === "/" && source[cursor + 1] === "*") {
            const end = source.indexOf("*/", cursor + 2);
            advanceTo(end >= 0 ? end + 2 : source.length);
            continue;
        }
        if (ch === "\"" || ch === "'") {
            let end = cursor + 1;
            while (end < source.length) {
                if (source[end] === "\\") {
                    end += 2;
                    continue;
                }
                if (source[end] === ch) {
                    end++;
                    break;
                }
                end++;
            }
            advanceTo(end);
            prevToken = "string";
            prevIsKeyword = false;
            continue;
        }
        if (ch === "`") {
            const seg = scanTemplateSegment(source, cursor + 1);
            advanceTo(seg.next);
            if (seg.kind === "expr") {
                templateBraceStack.push(0);
                prevToken = "{";
                prevIsKeyword = false;
            }
            else {
                prevToken = "string";
                prevIsKeyword = false;
            }
            continue;
        }
        if (ch === "/" && (!prevToken || REGEX_PRECEDING_PUNCTUATION.has(prevToken) || (prevIsKeyword && REGEX_PRECEDING_KEYWORDS.has(prevToken)))) {
            let end = cursor + 1;
            let inClass = false;
            while (end < source.length) {
                const rc = source[end];
                if (rc === "\\") {
                    end += 2;
                    continue;
                }
                if (rc === "[") inClass = true;
                else if (rc === "]") inClass = false;
                else if (rc === "/" && !inClass) {
                    end++;
                    while (end < source.length && isIdentPart(source[end])) end++;
                    break;
                }
                else if ((rc === "\n" || rc === "\r") && !inClass) {
                    end = cursor + 1;
                    break;
                }
                end++;
            }
            advanceTo(end);
            prevToken = "regex";
            prevIsKeyword = false;
            continue;
        }
        if (ch === "{") {
            if (templateBraceStack.length > 0) templateBraceStack[templateBraceStack.length - 1]++;
            cursor++;
            prevToken = "{";
            prevIsKeyword = false;
            continue;
        }
        if (ch === "}") {
            if (templateBraceStack.length > 0 && templateBraceStack[templateBraceStack.length - 1] === 0) {
                templateBraceStack.pop();
                const seg = scanTemplateSegment(source, cursor + 1);
                advanceTo(seg.next);
                if (seg.kind === "expr") {
                    templateBraceStack.push(0);
                    prevToken = "{";
                    prevIsKeyword = false;
                }
                else {
                    prevToken = "string";
                    prevIsKeyword = false;
                }
                continue;
            }
            if (templateBraceStack.length > 0) templateBraceStack[templateBraceStack.length - 1]--;
            cursor++;
            prevToken = "}";
            prevIsKeyword = false;
            continue;
        }
        if (isIdentStart(ch)) {
            let end = cursor + 1;
            while (end < source.length && isIdentPart(source[end])) end++;
            const ident = source.slice(cursor, end);
            const callLine = line;
            if (ident === "require" && prevToken !== "." && prevToken !== "?." && prevToken !== "function") {
                const afterIdent = skipWhitespaceAndComments(source, end);
                if (source[afterIdent] === "(") {
                    const argStart = skipWhitespaceAndComments(source, afterIdent + 1);
                    const parsedString = readSimpleQuotedString(source, argStart);
                    const afterArg = parsedString ? skipWhitespaceAndComments(source, parsedString.end) : -1;
                    if (parsedString && source[afterArg] === ")") {
                        found.push({
                            static: true,
                            specifier: parsedString.value,
                            raw: `require(${JSON.stringify(parsedString.value)})`,
                            line: callLine
                        });
                    }
                    else {
                        const closeParen = source.indexOf(")", afterIdent + 1);
                        const snippet = source.slice(cursor, closeParen >= 0 ? Math.min(closeParen + 1, cursor + 80) : cursor + 80).replace(/\s+/g, " ");
                        found.push({
                            static: false,
                            specifier: "",
                            raw: snippet,
                            line: callLine
                        });
                    }
                }
            }
            cursor = end;
            prevToken = ident;
            prevIsKeyword = true;
            continue;
        }
        if (ch === "?" && source[cursor + 1] === ".") {
            cursor += 2;
            prevToken = "?.";
            prevIsKeyword = false;
            continue;
        }
        cursor++;
        prevToken = ch;
        prevIsKeyword = false;
    }
    return found;
}

const externalRequires = findExternalRequires(text);
const disallowedRequires = externalRequires.filter(item => !item.static || !ALLOWED_EXTERNAL_REQUIRES.has(item.specifier));
if (disallowedRequires.length) {
    const listed = disallowedRequires.map(item => `${item.raw} at line ${item.line}`).join(", ");
    throw new Error(`Plugin artifact contains disallowed external require(...) calls: ${listed}`);
}

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
