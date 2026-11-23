"use strict";

const browserAndNodeGlobals = {
    // Standard ES / Web / Electron / BetterDiscord globals
    AbortController: "readonly",
    AbortSignal: "readonly",
    Blob: "readonly",
    Buffer: "readonly",
    CSS: "readonly",
    CustomEvent: "readonly",
    DOMException: "readonly",
    DOMParser: "readonly",
    DataTransfer: "readonly",
    Document: "readonly",
    Element: "readonly",
    Event: "readonly",
    FormData: "readonly",
    HTMLElement: "readonly",
    HTMLInputElement: "readonly",
    HTMLSelectElement: "readonly",
    HTMLTextAreaElement: "readonly",
    Headers: "readonly",
    InputEvent: "readonly",
    KeyboardEvent: "readonly",
    MouseEvent: "readonly",
    MutationObserver: "readonly",
    Node: "readonly",
    NodeFilter: "readonly",
    PointerEvent: "readonly",
    Range: "readonly",
    Request: "readonly",
    ResizeObserver: "readonly",
    Response: "readonly",
    TextDecoder: "readonly",
    TextEncoder: "readonly",
    URL: "readonly",
    URLSearchParams: "readonly",
    atob: "readonly",
    btoa: "readonly",
    cancelAnimationFrame: "readonly",
    cancelIdleCallback: "readonly",
    clearImmediate: "readonly",
    clearInterval: "readonly",
    clearTimeout: "readonly",
    console: "readonly",
    crypto: "readonly",
    document: "readonly",
    fetch: "readonly",
    getComputedStyle: "readonly",
    global: "readonly",
    globalThis: "readonly",
    localStorage: "readonly",
    location: "readonly",
    navigator: "readonly",
    performance: "readonly",
    queueMicrotask: "readonly",
    requestAnimationFrame: "readonly",
    requestIdleCallback: "readonly",
    setImmediate: "readonly",
    setInterval: "readonly",
    setTimeout: "readonly",
    structuredClone: "readonly",
    window: "readonly",
    // BetterDiscord globals
    BdApi: "readonly",
    BDFDB: "readonly",
    // CommonJS / Node globals
    __dirname: "readonly",
    __filename: "readonly",
    exports: "writable",
    module: "readonly",
    process: "readonly",
    require: "readonly"
};

module.exports = [
    {
        ignores: [
            "DiscordAITranslator.plugin.js",
            "node_modules/**",
            "external/**",
            "work/**"
        ]
    },
    {
        files: ["src/**/*.js", "scripts/**/*.js", "tests/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "commonjs",
            globals: browserAndNodeGlobals
        },
        rules: {
            "constructor-super": "error",
            "for-direction": "error",
            "getter-return": "error",
            "no-async-promise-executor": "error",
            "no-class-assign": "error",
            "no-compare-neg-zero": "error",
            "no-cond-assign": ["error", "except-parens"],
            "no-const-assign": "error",
            "no-constant-binary-expression": "error",
            "no-debugger": "error",
            "no-dupe-args": "error",
            "no-dupe-class-members": "error",
            "no-dupe-else-if": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-ex-assign": "error",
            "no-func-assign": "error",
            "no-import-assign": "error",
            "no-invalid-regexp": "error",
            "no-irregular-whitespace": ["error", { skipRegExps: true, skipStrings: true }],
            "no-loss-of-precision": "error",
            "no-new-native-nonconstructor": "error",
            "no-obj-calls": "error",
            "no-redeclare": "error",
            "no-self-assign": "error",
            "no-setter-return": "error",
            "no-sparse-arrays": "error",
            "no-this-before-super": "error",
            "no-undef": "error",
            "no-unreachable": "error",
            "no-unsafe-finally": "error",
            "no-unsafe-negation": "error",
            "use-isnan": "error",
            "valid-typeof": "error"
        }
    },
    {
        // Stricter rules for newly created V0.5 modular code
        files: ["src/core/**/*.js", "src/presets/**/*.js", "src/providers/registry.js", "src/providers/adapters/**/*.js"],
        rules: {
            "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }]
        }
    }
];
