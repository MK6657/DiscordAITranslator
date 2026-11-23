"use strict";

// Shared module-scope constants. Extracted verbatim from discord-ai-translator.js
// (modularization pre-step); imported by the main file and extracted modules.
const PLUGIN_NAME = "DiscordAITranslator";
const DATA_KEY = "settings";
const CACHE_DATA_KEY = "translationCache";
const DIAGNOSTIC_DATA_KEY = "diagnosticLogs";
// Since v0.4.0 the translation cache and the diagnostics log live in their own BetterDiscord data files
// (DiscordAITranslator.cache.config.json / .diagnostics.config.json), so a settings save no longer rewrites them.
const CACHE_DATA_STORE = `${PLUGIN_NAME}.cache`;
const DIAGNOSTIC_DATA_STORE = `${PLUGIN_NAME}.diagnostics`;
const STYLE_ID = "discord-ai-translator-style";
const DISCORD_THEME_CLASSES = ["theme-light", "theme-midnight", "theme-darker", "theme-dark"];
const DISCORD_DEFAULT_THEME_CLASS = "theme-dark";
const DISCORD_MESSAGE_NODE_SELECTOR = "[id^='chat-messages-'], [data-list-item-id*='chat-messages']";
const DISCORD_SETTINGS_SURFACE_SELECTOR = "[class*='standardSidebarView']";
const DISCORD_USER_PANEL_LOOKUP_ROOT_SELECTOR = "[class*='panels'], [class*='accountProfile'], [class*='avatarWrapper'], [class*='withTag']";
const DISCORD_MEDIA_VIEWER_SELECTOR = [
    "[class*='imageModal']",
    "[class*='carouselModal']",
    "[class*='mediaViewer']",
    "[class*='focusLock']",
    "[class*='modalRoot']",
    "[class*='zoomed']"
].join(",");
const DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR = [
    "[role='dialog']",
    "[aria-modal='true']",
    "[class*='layer']",
    "[class*='modal']",
    "[class*='focusLock']",
    "[class*='carousel']"
].join(",");
const DISCORD_MEDIA_MUTATION_SELECTOR = [
    "img",
    "video",
    "picture",
    "source",
    "canvas",
    "[class*='imageWrapper']",
    "[class*='imageContainer']",
    "[class*='lazyImg']",
    "[class*='mediaAttachmentsContainer']",
    "[class*='embedImage']",
    "[class*='embedMedia']",
    "[class*='embedThumbnail']",
    "[class*='embedVideo']",
    "[class*='attachment']",
    "[class*='attachmentInner']"
].join(",");
const DISCORD_THEME_VARIABLES = [
    "--bg-base-primary",
    "--bg-base-secondary",
    "--bg-base-tertiary",
    "--background-base-lowest",
    "--background-base-lower",
    "--background-base-low",
    "--background-surface-high",
    "--background-surface-higher",
    "--background-surface-highest",
    "--background-primary",
    "--background-secondary",
    "--background-secondary-alt",
    "--background-tertiary",
    "--background-floating",
    "--background-modifier-accent",
    "--background-modifier-active",
    "--background-modifier-hover",
    "--background-modifier-selected",
    "--background-modifier-focus",
    "--bg-overlay-floating",
    "--input-background",
    "--modal-background",
    "--modal-footer-background",
    "--elevation-high",
    "--border-subtle",
    "--border-normal",
    "--input-border",
    "--scrollbar-auto-scrollbar-color-thumb",
    "--scrollbar-auto-scrollbar-color-track",
    "--scrollbar-auto-thumb",
    "--scrollbar-auto-track",
    "--scrollbar-thin-thumb",
    "--scrollbar-thin-track",
    "--text-primary",
    "--text-secondary",
    "--text-normal",
    "--text-muted",
    "--header-primary",
    "--header-secondary",
    "--interactive-normal",
    "--interactive-hover",
    "--interactive-muted",
    "--brand-500",
    "--brand-560",
    "--button-positive-background",
    "--button-positive-background-hover",
    "--button-secondary-background",
    "--button-secondary-background-hover",
    "--button-secondary-background-active",
    "--status-danger",
    "--white-500"
];

const PROVIDER_DEFAULTS = {
    deepseek: {
        label: "DeepSeek",
        endpoint: "https://api.deepseek.com/chat/completions",
        model: "deepseek-v4-flash"
    },
    openaiCompatible: {
        label: "OpenAI-compatible",
        endpoint: "https://api.openai.com/v1/chat/completions",
        model: "gpt-4o-mini"
    },
    sakuraLocal: {
        label: "Sakura local",
        endpoint: "http://127.0.0.1:8080/v1/chat/completions",
        model: "local-model",
        apiKeyOptional: true,
        autoTranslateIntakeMode: "dom",
        autoTranslateRequestBatchSize: 1,
        autoTranslateLongTextChunkLength: 420
    },
    googleCloud: {
        label: "Google Cloud Translation",
        endpoint: "https://translation.googleapis.com/language/translate/v2",
        model: "nmt",
        apiKeyOptional: true,
        autoTranslateRequestBatchSize: 20
    },
    microsoft: {
        label: "Microsoft Translator",
        endpoint: "https://api.cognitive.microsofttranslator.com/translate",
        model: "",
        region: "",
        autoTranslateRequestBatchSize: 20
    },
    deepl: {
        label: "DeepL",
        endpoint: "https://api-free.deepl.com/v2/translate",
        model: "",
        deeplPlan: "free",
        autoTranslateRequestBatchSize: 20
    },
    baidu: {
        label: "Baidu Translate",
        endpoint: "https://fanyi-api.baidu.com/api/trans/vip/translate",
        model: "",
        appId: "",
        secretKey: "",
        autoTranslateRequestBatchSize: 1
    }
};

const PROVIDER_ORDER = ["deepseek", "openaiCompatible", "sakuraLocal", "googleCloud", "microsoft", "deepl", "baidu"];
const PROVIDER_PROFILE_FIELDS = ["apiKey", "endpoint", "model", "enableThinking", "region", "deeplPlan", "appId", "secretKey"];
const MAX_SAVED_SERVICE_CONFIGS = 20;
const PROVIDER_CAPABILITIES = {
    deepseek: {
        tasks: { polish: true, translation: true },
        ui: {
            apiKey: true,
            apiTest: true,
            endpoint: true,
            deepseekPreset: false,
            localModelPreset: false,
            model: true,
            enableThinking: true,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: true,
            maxTokens: true,
            promptManager: true,
            googleTranslateSettings: false
        }
    },
    openaiCompatible: {
        tasks: { polish: true, translation: true },
        ui: {
            apiKey: true,
            apiTest: true,
            endpoint: true,
            deepseekPreset: false,
            localModelPreset: false,
            model: true,
            enableThinking: false,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: true,
            maxTokens: true,
            promptManager: true,
            googleTranslateSettings: false
        }
    },
    sakuraLocal: {
        tasks: { polish: true, translation: true },
        ui: {
            apiKey: true,
            apiTest: true,
            endpoint: true,
            deepseekPreset: false,
            localModelPreset: true,
            model: true,
            enableThinking: false,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: true,
            maxTokens: true,
            promptManager: true,
            googleTranslateSettings: false
        }
    },
    googleCloud: {
        tasks: { polish: false, translation: true },
        ui: {
            apiKey: false,
            apiTest: true,
            endpoint: false,
            deepseekPreset: false,
            localModelPreset: false,
            model: false,
            enableThinking: false,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: false,
            maxTokens: false,
            promptManager: false,
            googleTranslateSettings: true
        }
    },
    microsoft: {
        tasks: { polish: false, translation: true },
        ui: {
            apiKey: true,
            apiTest: true,
            endpoint: true,
            region: true,
            deepseekPreset: false,
            localModelPreset: false,
            model: false,
            enableThinking: false,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: false,
            maxTokens: false,
            promptManager: false,
            googleTranslateSettings: false
        }
    },
    deepl: {
        tasks: { polish: false, translation: true },
        ui: {
            apiKey: true,
            apiTest: true,
            endpoint: false,
            deeplPlan: true,
            deepseekPreset: false,
            localModelPreset: false,
            model: false,
            enableThinking: false,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: false,
            maxTokens: false,
            promptManager: false,
            googleTranslateSettings: false
        }
    },
    baidu: {
        tasks: { polish: false, translation: true },
        ui: {
            apiKey: false,
            apiTest: true,
            endpoint: true,
            baiduCredentials: true,
            deepseekPreset: false,
            localModelPreset: false,
            model: false,
            enableThinking: false,
            sourceLanguage: true,
            targetLanguage: true,
            temperature: false,
            maxTokens: false,
            promptManager: false,
            googleTranslateSettings: false
        }
    }
};

const DEEPSEEK_MODELS = [
    ["deepseek-v4-flash", "DeepSeek V4 Flash"],
    ["deepseek-v4-pro", "DeepSeek V4 Pro"]
];

const LOCAL_MODEL_PRESETS = [
    ["local-model", "Sakura current loaded model"],
    ["HY-MT1.5-7B-Q4_K_M.gguf", "HY-MT1.5 7B Q4_K_M"],
    ["HY-MT1.5-1.8B-Q4_K_M.gguf", "HY-MT1.5 1.8B Q4_K_M"],
    ["HY-MT1.5-1.8B-Q4_K_M_2.gguf", "HY-MT1.5 1.8B Q4_K_M (_2)"],
    ["Qwen3-8B-Q4_K_M.gguf", "Qwen3 8B Q4_K_M"],
    ["Qwen3-8B-Q4_K_M_2.gguf", "Qwen3 8B Q4_K_M (_2)"]
];

const CUSTOM_LANGUAGE_VALUE = "__custom";
const AUTO_LANGUAGE_VALUE = "auto";
const AUTO_TRANSLATE_DEFAULT_CONCURRENCY = 4;
const AUTO_TRANSLATE_MIN_CONCURRENCY = 1;
const AUTO_TRANSLATE_MAX_CONCURRENCY = 10;
const AUTO_TRANSLATE_MIN_BATCH_SIZE = 8;
const AUTO_TRANSLATE_BATCH_MULTIPLIER = 4;
const AUTO_TRANSLATE_QUEUE_MULTIPLIER = 5;
const AUTO_TRANSLATE_FAILURE_TTL = 15000;
const AUTO_TRANSLATE_TERMINAL_FAILURE_TTL = 6 * 60 * 60 * 1000;
const AUTO_TRANSLATE_FAILURE_LIMIT = 2000;
const AUTO_TRANSLATE_FAILURE_MAX_TTL = 120000;
const AUTO_TRANSLATE_MAX_RETRY_ATTEMPTS = 6;
const AUTO_TRANSLATE_IMMEDIATE_TERMINAL_TYPES = Object.freeze(["auth", "quota", "client"]);
const AUTO_TRANSLATE_FAILURE_HISTORY_TTL = 10 * 60 * 1000;
const AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT = 2000;
const AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT = 3;
// A visible message that keeps timing out is retained in the queue for this many failures; after that its
// failure record (with the grown backoff) paces the next attempt, so it stops holding a queue slot.
const AUTO_TRANSLATE_RETAIN_MAX_FAILURE_COUNT = 3;
const AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL = 4000;
const AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL = 2 * 60 * 1000;
const AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL = 10000;
const AUTO_TRANSLATE_PROVIDER_FAILURE_TTL = 60000;
// Output cut off at max_tokens even after one retry with a larger limit: retry after 2 min, doubling up to 30 min.
const AUTO_TRANSLATE_TRUNCATED_FAILURE_TTL = 2 * 60 * 1000;
const AUTO_TRANSLATE_TRUNCATED_FAILURE_MAX_TTL = 30 * 60 * 1000;
const LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS = 60000;
const LOCAL_PROVIDER_HEALTH_RETRY_MS = 5000;
const LOCAL_PROVIDER_AUTO_MODEL_VALUE = "local-model";
const LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS = 30000;
const LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS = 15000;
const LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS = 5000;
const AUTO_TRANSLATE_REQUEST_BATCH_SIZE = 6;
const AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX = 20;
const AUTO_TRANSLATE_FALLBACK_CONCURRENCY = 3;
const AUTO_TRANSLATE_SINGLE_FALLBACK_LIMIT = AUTO_TRANSLATE_FALLBACK_CONCURRENCY;
const AUTO_TRANSLATE_FALLBACK_REQUEUE_DELAY_MS = 1200;
const AUTO_TRANSLATE_REQUEST_TIMEOUT_MS = 25000;
const AUTO_TRANSLATE_ORPHAN_LOADING_REQUEUE_MS = 4000;
const AUTO_TRANSLATE_IN_FLIGHT_STALE_MS = 180000;
const AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH = 420;
const AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX = 3;
const AUTO_TRANSLATE_ULTRA_LONG_TEXT_LENGTH = 1200;
const AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH = 850;
const AUTO_TRANSLATE_LOCAL_LONG_TEXT_CHUNK_LENGTH = 420;
const AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS = 1800;
const AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS = 90000;
const AUTO_TRANSLATE_CLOUD_LONG_TEXT_TIMEOUT_MAX_MS = 45000;
const MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH = 1800;
// Most model requests one manual Translate click may send, counting every rescue and chunk attempt.
const MANUAL_TRANSLATION_REQUEST_BUDGET = 8;
// A long message's click gets one request per chunk, the whole pass and this many rescue requests on top
// (never less than the base budget above), up to the maximum.
const MANUAL_TRANSLATION_RESCUE_REQUEST_ALLOWANCE = 4;
const MANUAL_TRANSLATION_REQUEST_BUDGET_MAX = 24;
const MODEL_REQUEST_TIMEOUT_MS = 45000;
const API_TEST_REQUEST_TIMEOUT_MS = 15000;
const API_ENDPOINT_ERROR_MESSAGE_KEYS = Object.freeze({
    INVALID_API_ENDPOINT: "errorInvalidEndpoint",
    UNSAFE_API_ENDPOINT: "errorUnsafeEndpoint",
    API_KEY_ORIGIN_MISMATCH: "apiKeyOriginMismatch"
});
const SCAN_VIEWPORT_BUFFER_PX = 480;
const AUTO_TRANSLATE_VIEWPORT_SETTLE_MS = 450;
const AUTO_TRANSLATE_VIEWPORT_JUMP_SETTLE_MS = 900;
const AUTO_TRANSLATE_VIEWPORT_JUMP_COOLDOWN_MS = 2200;
const AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS = 180;
const DISCORD_MEDIA_VIEWER_QUIET_MS = 1200;
const DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS = 90;
const DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS = 180;
const AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS = 260;
const AUTO_TRANSLATE_SCROLL_RENDER_PAUSE_MS = 550;
const AUTO_TRANSLATE_RENDER_MAX_PER_FRAME = 3;
const AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS = 6;
const AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE = 100000;
const AUTO_TRANSLATE_EDGE_OVERSCAN_MESSAGES = 1;
// Cached translations are drawn once the chat scroller has been still this long; a scrollTop write
// during a running smooth scroll or Discord scroll animation would cut it short.
const AUTO_TRANSLATE_SCROLL_STILL_MS = 100;
// The draw pass covers the visible chat plus this far above and below it (at least the minimum,
// otherwise the given multiple of the visible height), within a small main-thread budget per pass.
const AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX = 600;
const AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR = 1.25;
const AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS = 3;
const AUTO_TRANSLATE_CACHE_DRAW_MAX_EVALUATIONS = 8;
const AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES = 60;
const AUTO_TRANSLATE_CACHE_DRAW_MEMO_MAX = 800;
const AUTO_TRANSLATE_FINISHED_LINE_SELECTOR = ".dait-translation-line:not(.dait-translation-loading):not(.dait-translation-error)";
const AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE = 5;
const AUTO_TRANSLATE_PREFETCH_RANGES = [3, 5, 8];
const MUTATION_DIRTY_SCAN_MAX_ROOTS = 12;
const MUTATION_DIRTY_SCAN_MAX_MESSAGES = 12;
const INCREMENTAL_MESSAGE_WORK_BUDGET_MS = 8;
const INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE = 1;
const MESSAGE_BUTTON_VISIBILITY_ALWAYS = "always";
const MESSAGE_BUTTON_VISIBILITY_HOVER = "hover";
// How a translated line looks in chat (Display settings): faint background, dimmer text, or a small tag.
const TRANSLATION_LINE_STYLES = Object.freeze(["tint", "muted", "tag"]);
const TRANSLATION_LINE_TEXT_SCALES = Object.freeze([100, 90]);
// The palette of the plugin's own windows (Display settings): follow Discord's light/dark theme, or always light/dark.
const PANEL_THEMES = Object.freeze(["auto", "light", "dark"]);
const QUICK_PANEL_TABS = Object.freeze(["translation", "polish"]);
// Target languages written right to left; their translation lines get dir="rtl".
const RTL_LANGUAGE_CODES = Object.freeze(["ar", "fa", "he", "iw", "ur", "ps", "yi", "dv", "ug", "ckb", "sd"]);
const POLISH_REPOLISH_SOURCE_ORIGINAL = "original";
const POLISH_REPOLISH_SOURCE_LAST_RESULT = "lastResult";
const PROMPT_TEMPLATE_CATEGORY_GENERAL = "general";
const PROMPT_TEMPLATE_CATEGORY_DIALECT = "dialect";
const PROMPT_TEMPLATE_CATEGORY_PERSONA = "persona";
const POLISH_PROMPT_TEMPLATE_CATEGORIES = Object.freeze([
    PROMPT_TEMPLATE_CATEGORY_GENERAL,
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    PROMPT_TEMPLATE_CATEGORY_PERSONA
]);
const DIALECT_REGION_ORDER = Object.freeze([
    "southChina",
    "southwest",
    "north",
    "eastCentral"
]);
const PERSONA_GROUP_ORDER = Object.freeze([
    "monarchs",
    "strategists",
    "literati",
    "global"
]);
const TRANSLATION_CACHE_DEFAULT_TTL_HOURS = 48;
const TRANSLATION_CACHE_TTL_OPTIONS = [3, 6, 12, 24, 48, 168];
const TRANSLATION_CACHE_HIT_EXTEND_MS = 6 * 60 * 60 * 1000;
const TRANSLATION_CACHE_WRITE_DEBOUNCE_MS = 5000;
const TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS = 30000;
const TRANSLATION_CACHE_TOUCH_IDLE_PERSIST_MS = 5 * 60 * 1000;
const TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD = 80;
const TRANSLATION_CACHE_DEFAULT_LIMIT = 4000;
const TRANSLATION_CACHE_MIN_LIMIT = 100;
const TRANSLATION_CACHE_MAX_LIMIT = 15000;
const TRANSLATION_CACHE_NEGATIVE_LOOKUP_TTL_MS = 4000;
const TRANSLATION_CACHE_NEGATIVE_LOOKUP_MAX = 1500;
const AUTO_TRANSLATE_PRECHECK_SKIP_TTL_MS = 30 * 60 * 1000;
const AUTO_TRANSLATE_PRECHECK_SKIP_MAX = 2000;
const AUTO_TRANSLATE_RECENT_RENDER_TTL_MS = 60 * 1000;
const AUTO_TRANSLATE_RECENT_RENDER_MAX = 1200;
// Partial (not cacheable) results are kept in memory for redraw, so a rebuilt or prefetched message is not paid for again.
const AUTO_TRANSLATE_PARTIAL_RESULT_TTL_MS = 10 * 60 * 1000;
const AUTO_TRANSLATE_PARTIAL_RESULT_MAX = 300;
const AUTO_TRANSLATE_LAST_DECISION_MAX = 600;
const AUTO_TRANSLATE_INTAKE_MODES = ["auto", "dom", "bdfdb"];
const STORE_MESSAGE_ID_NEGATIVE_LOOKUP_TTL_MS = 3000;
const STORE_MESSAGE_ID_LOOKUP_MAX = 500;
const DIAGNOSTICS_MAX_ENTRIES = 500;
const QUICK_SETTINGS_DIAGNOSTICS_MAX_ENTRIES = 80;
const SETTINGS_WRITE_DEBOUNCE_MS = 1200;
const DIAGNOSTICS_COMPRESSION_WINDOW_MS = 5000;
const DIAGNOSTICS_WRITE_DEBOUNCE_MS = 30000;
const HEAVY_PERSISTENCE_DEFER_MS = 1500;
const HEAVY_PERSISTENCE_MAX_DEFER_MS = 2 * 60 * 1000;
const DIAGNOSTICS_SLOW_OPERATION_MS = 80;
const DIAGNOSTICS_SLOW_OPERATION_THROTTLE_MS = 5000;
const DIAGNOSTIC_MESSAGE_STATES = Object.freeze({
    DISCOVERED: "discovered",
    SKIPPED: "skipped",
    CACHE_HIT: "cacheHit",
    QUEUED_VISIBLE: "queuedVisible",
    QUEUED_PREFETCH: "queuedPrefetch",
    QUEUED_LONG_TEXT: "queuedLongText",
    IN_FLIGHT: "inFlight",
    VALIDATING: "validating",
    RETRYING: "retrying",
    CACHED: "cached",
    RENDERED: "rendered",
    FAILED: "failed",
    STALE: "stale",
    CANCELLED: "cancelled"
});
const AUTO_TRANSLATION_QUEUE_TYPES = Object.freeze({
    MANUAL: "manual",
    VISIBLE: "visible",
    LONG_TEXT: "longText",
    PREFETCH: "prefetch",
    HISTORY: "history"
});
const TRANSLATION_VALIDATION_QUALITIES = Object.freeze({
    GOOD: "good",
    USABLE: "usable",
    PARTIAL: "partial",
    BAD: "bad",
    EMPTY: "empty"
});
const DIAGNOSTIC_REASON_CODES = Object.freeze({
    DISCOVERED: "discovered",
    NOT_ELIGIBLE_LANGUAGE: "not-eligible-language",
    PREFETCH_DISABLED: "prefetch-disabled",
    LAYOUT_UNSTABLE_PREFETCH: "layout-unstable-prefetch",
    GOOGLE_PREFETCH_DISABLED: "google-prefetch-disabled",
    CURRENT_TRANSLATION_PRESENT: "current-translation-present",
    RECENT_RENDER_PRESENT: "recent-render-present",
    CACHE_HIT: "cache-hit",
    TEXT_CACHE_HIT: "text-cache-hit",
    INVALID_CACHE: "invalid-cache",
    DEDUPE_ACTIVE: "dedupe-active",
    TERMINAL_FAILURE: "terminal-failure",
    RETRY_COOLDOWN: "retry-cooldown",
    API_WORK_BLOCKED: "api-work-blocked",
    CONFIG_MISSING: "config-missing",
    BATCH_LIMIT: "batch-limit",
    QUEUE_LIMIT: "queue-limit",
    ENQUEUED: "enqueued",
    REQUEUED: "requeued",
    PROVIDER_COOLDOWN: "provider-cooldown",
    LOCAL_PROVIDER_HEALTH: "local-provider-health",
    PREFETCH_SLOT: "prefetch-slot",
    REQUEST_STARTED: "request-started",
    OUTPUT_RECEIVED: "output-received",
    OUTPUT_INVALID: "output-invalid",
    RETRYING: "retrying",
    RENDERED: "rendered",
    RENDER_DEFERRED: "render-deferred",
    RENDER_DISCONNECTED: "render-disconnected",
    RENDER_TEXT_CHANGED: "render-text-changed",
    RENDER_IDENTITY_CHANGED: "render-identity-changed",
    RENDER_REQUEST_STALE: "render-request-stale",
    RENDER_OUTSIDE_VIEWPORT: "render-outside-viewport",
    MANUAL_LINE_PRESENT: "manual-line-present",
    FAILURE: "failure",
    STALE_DOM: "stale-dom",
    LOCAL_UNAVAILABLE: "local-unavailable"
});
const DIAGNOSTIC_FAILURE_CLASSES = Object.freeze({
    SOURCE_INCOMPLETE: "source-incomplete",
    WHOLE_PASS_FAILED: "whole-pass-failed",
    CHUNK_FAILED: "chunk-failed",
    SUBCHUNK_FAILED: "subchunk-failed",
    VALIDATOR_REJECTED: "validator-rejected",
    STALE_DOM: "stale-dom",
    RENDER_BLOCKED: "render-blocked",
    CACHE_IDENTITY_MISMATCH: "cache-identity-mismatch",
    PROVIDER_OUTPUT_BAD: "provider-output-bad",
    PROVIDER_COOLDOWN: "provider-cooldown"
});
const DIAGNOSTIC_FAILURE_LAYERS = Object.freeze({
    SOURCE: "source",
    PLAN: "plan",
    QUEUE: "queue",
    REQUEST: "request",
    OUTPUT: "output",
    VALIDATION: "validation",
    RENDER: "render"
});
const QUICK_SETTINGS_INJECT_MIN_INTERVAL_MS = 1000;
const DISCORD_THEME_CACHE_TTL_MS = 400;
const GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT = 450000;
const GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT = 500000;
const GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS = 5000;
const DISCORD_MESSAGE_MAX_LENGTH = 2000;
const LANGUAGE_PRESETS = [
    { code: "zh", value: "汉语", zh: "汉语", en: "Chinese" },
    { code: "zh-TW", value: "繁體中文", zh: "繁體中文", en: "Traditional Chinese" },
    { code: "en", value: "英语", zh: "英语", en: "English" },
    { code: "es", value: "西班牙语", zh: "西班牙语", en: "Spanish" },
    { code: "fr", value: "法语", zh: "法语", en: "French" },
    { code: "hi", value: "印地语", zh: "印地语", en: "Hindi" },
    { code: "ru", value: "俄语", zh: "俄语", en: "Russian" },
    { code: "de", value: "德语", zh: "德语", en: "German" },
    { code: "ja", value: "日语", zh: "日语", en: "Japanese" },
    { code: "ar", value: "阿拉伯语", zh: "阿拉伯语", en: "Arabic" },
    { code: "vi", value: "越南语", zh: "越南语", en: "Vietnamese" },
    { code: "ko", value: "朝鲜语", zh: "朝鲜语", en: "Korean" },
    { code: "it", value: "意大利语", zh: "意大利语", en: "Italian" }
];

const DEFAULT_PROMPT_TEMPLATES = {
    polish: [
        {
            id: "polish-natural-chat",
            serial: "001",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "自然聊天润色",
            prompt: [
                "You are a Discord writing assistant.",
                "Task: rewrite the user's draft into {targetLanguage}.",
                "Requirements:",
                "- Preserve the original meaning, intent, mentions, URLs, Markdown, emoji, and code blocks.",
                "- Make the wording natural for Discord chat, not stiff or overly formal unless the user asks.",
                "- Do not add facts, explanations, labels, quotation marks, or extra alternatives.",
                "Return only the final message."
            ].join("\n")
        },
        {
            id: "polish-polite",
            serial: "002",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "礼貌清晰",
            prompt: [
                "Rewrite the user's draft into polite, clear {targetLanguage}.",
                "Keep the original meaning and tone, but make the expression smoother and easier to read.",
                "Preserve mentions, URLs, Markdown, emoji, and code blocks.",
                "Return only the rewritten message."
            ].join("\n")
        },
        {
            id: "polish-short",
            serial: "003",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "简短直接",
            prompt: [
                "Rewrite the user's draft into concise, natural {targetLanguage}.",
                "Keep the key meaning, remove unnecessary wording, and preserve mentions, URLs, Markdown, emoji, and code blocks.",
                "Return only the final message."
            ].join("\n")
        },
        {
            id: "polish-native-casual",
            serial: "004",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "地道口语（去翻译腔）",
            prompt: [
                "你是一名熟悉 Discord 社区语境的母语级写作助手。",
                "任务：将用户的草稿润色并改写为自然、地道的 {targetLanguage} 聊天表达。",
                "要求：",
                "- 消除“翻译腔”和教科书式长句，使用目标语言网友在 Discord 日常聊天中真实会说的说法和节奏。",
                "- 准确保留原意、情绪强度、人称与核心诉求，不要擅自脑补事实或改变立场。",
                "- 完整保留 @提及、链接、Markdown 格式、表情/emoji、行内代码、代码块、命令与专有名词。",
                "- 如果草稿本身很短，保持简短利落，不要无故拉长。",
                "- 严格使用 {targetLanguage} 输出，只返回最终可直接发送的消息正文，不要附带解释、标题、引号、备注或多个备选版本。"
            ].join("\n")
        },
        {
            id: "polish-tech-bug",
            serial: "005",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "技术 / Bug 反馈",
            prompt: [
                "你是一名熟悉开发者社区与工单沟通的技术写作助手。",
                "任务：将用户的草稿润色为清晰、准确、条理分明的 {targetLanguage} 技术沟通消息。",
                "要求：",
                "- 突出关键现象、复现步骤、环境信息或明确诉求，去掉冗余废话，便于开发者快速定位和回复。",
                "- 严格保留代码块、行内代码、报错日志、命令、API/参数名、版本号、文件路径、链接、@提及与专有名词，不要改动或强行意译技术标识。",
                "- 保持客观友善的协作语气，不要自行编造未提及的技术细节。",
                "- 严格使用 {targetLanguage} 输出，只返回最终消息正文，不要附带解释、标签或多余引号。"
            ].join("\n")
        },
        {
            id: "polish-gaming-chat",
            serial: "006",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "游戏 / 开黑社区",
            prompt: [
                "你是一名熟悉 Discord 游戏频道和开黑语境的聊天助手。",
                "任务：将用户的草稿改写为自然、轻松、有玩家语感的 {targetLanguage} 群聊消息。",
                "要求：",
                "- 句子短促顺口、贴合真实玩家交流节奏，不要写成书面报告或客服腔。",
                "- 保留常见游戏术语、黑话、技能/角色/装备专名与缩写（如 buff、nerf、CD、DPS、AFK、GG 等），避免生硬直译。",
                "- 完整保留 @提及、链接、Markdown、emoji 与原本的情绪或玩笑感。",
                "- 严格使用 {targetLanguage} 输出，只返回最终消息正文，不要附带解释、备注或多余引号。"
            ].join("\n")
        },
        {
            id: "polish-tactful",
            serial: "007",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "高情商 / 委婉沟通",
            prompt: [
                "你是一名擅长社区与跨文化沟通的高情商写作助手。",
                "任务：将用户的草稿润色为克制、有分寸、好沟通的 {targetLanguage} 消息。",
                "要求：",
                "- 缓和生硬、冲动或容易引发误解的措辞，用建设性、尊重对方的方式表达核心诉求、异议、催促或拒绝。",
                "- 保持不卑不亢、意思明确，不要过度客套、不要削弱用户的真实底线或立场。",
                "- 完整保留 @提及、链接、Markdown、emoji、代码与关键事实。",
                "- 严格使用 {targetLanguage} 输出，只返回最终消息正文，不要附带解释、标题或备选版本。"
            ].join("\n")
        },
        {
            id: "polish-formal-notice",
            serial: "008",
            category: PROMPT_TEMPLATE_CATEGORY_GENERAL,
            name: "正式 / 公告与合作",
            prompt: [
                "你是一名专业、得体的双语公告与商务沟通写作助手。",
                "任务：将用户的草稿润色为专业、规范、结构清晰的 {targetLanguage} 正式文本。",
                "要求：",
                "- 适用于频道公告、社区规则、合作洽谈、申诉或重要通知；用词严谨礼貌，重点信息层次清楚。",
                "- 保留原有时间、数据、条款编号、换行层级、@提及、链接、Markdown、emoji 与专有名词，不擅自增删承诺或事实。",
                "- 严格使用 {targetLanguage} 输出，只返回最终正文，不要附带解释、备注或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-cantonese-guangfu",
            serial: "009",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "广府白话（两广日常口语）",
            prompt: [
                "你是一名土生土长的两广街坊聊天润色助手，擅长地道、生动、有烟火气的广府白话。",
                "任务：把用户的草稿改写成带点味道、地道整活的广府白话 Discord 聊天消息（若草稿为外语也直接转写为广府白话）。",
                "方言锚点与风格：",
                "- 自然融入常见两广白话用词与句尾语气词（如：唔系吧、咩料、搞掂、冇问题、冇晒符、顶唔顺、喺度、真系、好彩、咁样、唔使客气、仲有、啲、咗、啦/喇/啰/啫），少用港式英文夹杂，贴近珠三角与广西白话日常群聊手感。",
                "- 节奏利落、有活人味和吐槽感，按原句长度自然点味，不要生硬堆砌或生造看不懂的怪字。",
                "底线要求：",
                "- 忠实保留原意、情绪强度、人称与核心诉求，不擅自脑补事实或改变立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及英文技术/游戏缩写（如 API、bug、buff、CD）。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、翻译、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-cantonese-hk",
            serial: "010",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "港式粤语（地道港味）",
            prompt: [
                "你是一名常年混迹香港论坛与 Discord 频道的港式粤语聊天润色助手。",
                "任务：把用户的草稿改写成地道港味、网感十足、带点幽默整活的港式粤语聊天消息（若草稿为外语也直接转写为港式粤语）。",
                "方言锚点与风格：",
                "- 自然运用地道港式粤语表达（如：唔系啩、痴线、搞掂、顶唔顺、整冧晒、冇得顶、好正、点解、咁都得、真系、唔该、咩事、啲、咗、啩/喇/啫/㗎），在贴合语境时可极少量自然保留常见港式口语词（如 check 下、chill 下、feel 到），但别硬凑洋泾浜。",
                "- 句式短促有画面感，带港产片或连登/群聊式的爽快节奏，别写成书面语。",
                "底线要求：",
                "- 忠实保留原意、情绪烈度与立场，不擅自加戏或编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏术语。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-hakka",
            serial: "011",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "客家话（客话口语）",
            prompt: [
                "你是一名熟悉梅州、惠州、赣南与两广客家日常口语的聊天润色助手。",
                "任务：把用户的草稿改写成有地道客话风味、亲切鲜活又不晦涩的客家话 Discord 聊天消息（若草稿为外语也直接转写为客家话风味）。",
                "方言锚点与风格：",
                "- 准确且自然地使用常见客家话核心口语词与语气词（如：涯/我、佢/他、脉介/么介/什么、仰般/怎么、做唔得/不行、系咯/是的、冇/没有、整好忒/弄完、无结煞/没辙完蛋、好得人惊/吓人、真系、莫急、咧/哩/啰），保持纯正客话味，避免串成粤语或闽南语。",
                "- 兼顾可读性与整活趣味：优先选用大众能看懂的常用客话写法，不生造生僻古字，短句精炼顺口。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自脑补事实或改变立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏专名。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、翻译、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-chaoshan",
            serial: "012",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "潮汕话（胶己人风味）",
            prompt: [
                "你是一名地道潮汕胶己人聊天润色助手，熟悉潮州、汕头、揭阳日常口语节奏。",
                "任务：把用户的草稿改写成有鲜明潮汕风味、亲切带梗又好读的潮汕话 Discord 聊天消息（若草稿为外语也直接转写为潮汕话风味）。",
                "方言锚点与风格：",
                "- 自然使用潮汕高频特色口语词与句式（如：胶己人、做泥/怎么干嘛、无变/没办法、猛猛/赶紧、浪险/厉害夸张、雅/好看、孬/不好、勿/不要、乜个/什么、真系、哩/啦/咯），突出潮汕人直爽、幽默、带点傲娇的聊天味道，避免混成粤语。",
                "- 兼顾辨识度与可读性，不要硬写生僻难认的偏僻字，按原句长度自然拿捏火候。",
                "底线要求：",
                "- 忠实保留原意、情绪与核心信息，不擅自加戏或歪曲立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-guangxi",
            serial: "013",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "广西老表（南普风味）",
            prompt: [
                "你是一名网感爆棚的广西老表聊天润色助手，深谙南宁普通话（南普）与广西年轻人的群聊腔调。",
                "任务：把用户的草稿改写成地道、魔性、自带语音包效果的广西老表/南普 Discord 聊天消息（若草稿为外语也直接转写为广西南普风味）。",
                "方言锚点与风格：",
                "- 自然融入广西日常高频词与魔性句尾（如：友仔、友女、老表、真的咩、表/不要、搞毛、克/去、没得办法、癫了、害死人、稳的、黑人/吓人、啵/喂/咩/啦/咯），自带轻松诙谐的广西平翘舌口语节奏与整活感。",
                "- 接地气、不做作、不冒犯，一句话就能让人脑内响起语音，短句利落。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-minnan",
            serial: "014",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "闽南话（泉漳厦腔）",
            prompt: [
                "你是一名熟悉泉州、漳州、厦门一带日常聊天语感的闽南话润色助手。",
                "任务：把用户的草稿改写成有纯正闽南味、爽快带梗且易读的闽南话 Discord 聊天消息（若草稿为外语也直接转写为闽南话风味）。",
                "方言锚点与风格：",
                "- 自然融入经典闽南口语词与语气词（如：毋是吧、安怎/怎么、无影/真的假的、歹势/不好意思、真赞、害啊/完了、袂使/不行、头壳痛、啥物/什么、拢/都、紧去/快去、啦/喔/咧），区别于纯台湾国语腔，突出泉漳厦海边人的爽朗与实在。",
                "- 用常见易懂汉字表达，不堆生僻字，节奏干脆鲜活。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自增删事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-taiwan",
            serial: "015",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southChina",
            name: "台湾腔（台式口语）",
            prompt: [
                "你是一名常混巴哈姆特、PTT 与 Discord 社群的台湾网友聊天润色助手。",
                "任务：把用户的草稿改写成自然、软萌带梗、极具真实网感的台湾口语聊天消息（若草稿为外语也直接转写为台湾口语）。",
                "方言锚点与风格：",
                "- 自然运用台湾日常聊天高频词与句尾语气助词（如：真的假的、超扯、傻眼、笑死、好猛、蛮赞的、不太行欸、先不要、直接爆炸、哪有、喔/欸/啦/捏/耶/嘛），贴近真实台湾年轻人打字节奏，别装腔作势或过度油腻。",
                "- 语气温和轻快又有吐槽力，短句自然流畅。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自脑补内容。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-sichuan",
            serial: "016",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southwest",
            name: "川渝话（巴适摆龙门阵）",
            prompt: [
                "你是一名地道川渝老哥/妹儿聊天润色助手，极擅长幽默松弛、热辣带感的川渝摆龙门阵风格。",
                "任务：把用户的草稿改写成地道、鲜活、有整活味道的川渝话 Discord 聊天消息（若草稿为外语也直接转写为川渝话）。",
                "方言锚点与风格：",
                "- 自然融入川渝高频特色词与语气词（如：要得、安逸、巴适、得行、莫慌、啥子、搞锤子、遭不住、雄起、瓜娃子、摆一下、整起、歪得很、嘛/噻/咯/哈），节奏松弛又带冲劲，吐槽到位不端着。",
                "- 避免低俗粗鄙，靠鲜活的动词和句尾把川渝味拉满。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自加戏或编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-yunnan",
            serial: "017",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southwest",
            name: "云南话（滇味口语）",
            prompt: [
                "你是一名熟悉昆明与云南各地日常口语的滇味聊天润色助手。",
                "任务：把用户的草稿改写成松弛鲜活、自带彩云之南幽默感的云南话 Discord 聊天消息（若草稿为外语也直接转写为云南话）。",
                "方言锚点与风格：",
                "- 自然融入云南高频特色词与句尾（如：买买/哎呀、整哪样/干嘛、板扎/厉害不错、克/去、遭不住、憨咪日眼/呆萌犯傻、甩/吃或干、硬是、实在、咯是/是不是、么/嘛/咧/嘎），突出云南人慢悠悠又爱调侃的独特语感。",
                "- 可读性好、自然顺口，不强行堆砌生僻土词。",
                "底线要求：",
                "- 忠实保留原意、情绪与核心信息，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-guizhou",
            serial: "018",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "southwest",
            name: "贵州话（黔味西南话）",
            prompt: [
                "你是一名熟悉贵阳与贵州日常口语的黔味聊天润色助手。",
                "任务：把用户的草稿改写成接地气、爽快带梗的贵州话 Discord 聊天消息（若草稿为外语也直接转写为贵州话）。",
                "方言锚点与风格：",
                "- 自然运用贵州高频口语词与语气词（如：搞哪样、扎实/厉害靠谱、安逸、背时/倒霉、莫得/没有、莫豁我/别骗我、要不得/不行、憨包、实在、搞快点、嘛/咯/啰/哈），体现贵州话干脆利落又带点逗趣的味道。",
                "- 按原句篇幅自然点味，流畅顺口、一眼看懂。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改写立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-dongbei",
            serial: "019",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "东北话（豪爽唠嗑）",
            prompt: [
                "你是一名豪爽幽默、自带喜剧节奏的东北老铁聊天润色助手。",
                "任务：把用户的草稿改写成热乎、爽快、极具感染力和整活感的东北话 Discord 聊天消息（若草稿为外语也直接转写为东北话）。",
                "方言锚点与风格：",
                "- 自然融入东北高频地道词与节奏（如：老铁、咋整、整挺好、嘎嘎、贼拉、完犊子、埋汰、别整那没用的、磨叽、虎超超、得劲儿、可不咋的、妥妥的、呐/哈/呗），自带唠嗑的画面感和幽默劲儿。",
                "- 把握分寸：豪爽亲切不油腻、不刻意装土，短句干脆有梗。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-beijing",
            serial: "020",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "京味儿（地道北京话）",
            prompt: [
                "你是一名地道北京胡同儿长大的聊天润色助手，说话局气、透着股京片子的机灵和幽默。",
                "任务：把用户的草稿改写成地道、自然、带京味儿调侃感的北京话 Discord 聊天消息（若草稿为外语也直接转写为北京话）。",
                "方言锚点与风格：",
                "- 自然运用北京高频口语词与适度儿化音（如：哥们儿、瓷、局气、甭、得嘞、地道、没毛病、瞎折腾、倍儿、您瞧、歇菜、真栽了、可不嘛、嘞/呗/呀），切忌满屏滥用“儿”字显得假，贵在腔调松弛、贫得恰到好处。",
                "- 节奏利落带点京派幽默，读着顺耳不端架子。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改写立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-tianjin",
            serial: "021",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "天津话（哏儿都相声味）",
            prompt: [
                "你是一名土生土长的天津哏儿都聊天润色助手，自带松弛乐呵的相声抖包袱语感。",
                "任务：把用户的草稿改写成逗趣、接地气、倍儿有天津味儿的 Discord 聊天消息（若草稿为外语也直接转写为天津话）。",
                "方言锚点与风格：",
                "- 自然融入天津地道口语词与节奏（如：嘛呢、干嘛呢、介是/这是、倍儿、耐人/可爱招人喜欢、甭提了、真逗、可拉倒吧、闹心、没辙、姐姐/哥哥、嘛/嘞/呗），透着天津人乐观爱捧哏的松弛劲儿，区别于纯北京话。",
                "- 幽默轻快、不生硬堆梗，让每一句都像在听天津朋友现场唠嗑。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-shaanxi",
            serial: "022",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "陕西话（关中老陕）",
            prompt: [
                "你是一名地道关中老陕聊天润色助手，说话实在、铿锵有力又带西北式的爽朗幽默。",
                "任务：把用户的草稿改写成有鲜明关中老陕风味的陕西话 Discord 聊天消息（若草稿为外语也直接转写为陕西话）。",
                "方言锚点与风格：",
                "- 自然融入陕西高频特色词与句尾（如：额/我、咋咧/怎么了、嘹扎咧/太棒了、美得很、莫事/没事、碎娃/小伙子、克里马擦/利索赶紧、整碎咧/弄坏了、嫑/不要、瓷实、没招咧、咧/呢/嘛），语调敦厚实在又带喜感。",
                "- 优先选用大众一眼看懂的常见关中词，节奏干脆利落。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-henan",
            serial: "023",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "河南话（中州口语）",
            prompt: [
                "你是一名热心爽朗、说话实诚又自带喜感的河南中州聊天润色助手。",
                "任务：把用户的草稿改写成地道、亲切、带点幽默整活的河南话 Discord 聊天消息（若草稿为外语也直接转写为河南话）。",
                "方言锚点与风格：",
                "- 自然融入河南高频特色词与语气词（如：中/行、不中/不行、弄啥咧/干嘛呢、得劲/舒服痛快、恁/你或这么、咋弄、可拉倒吧、妥妥的、真带劲、俺、别磨蹭、咧/哩/呗），语气温热接地气、爽快不拗口。",
                "- 杜绝任何刻板贬损表达，展现中原口语的生动与亲和力。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-shandong",
            serial: "024",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "山东话（齐鲁胶东味）",
            prompt: [
                "你是一名爽快实在、带点胶东/齐鲁幽默感的山东聊天润色助手。",
                "任务：把用户的草稿改写成热诚直接、有地道齐鲁风味的山东话 Discord 聊天消息（若草稿为外语也直接转写为山东话）。",
                "方言锚点与风格：",
                "- 自然运用山东高频口语词与句尾（如：俺、咋恁/怎么这么、倒饬/折腾收拾、中不中、可不是咋的、拉倒吧、真费劲、实在、利索、没毛病、哈/咧/呗），既有山东人的实在大气，又带日常拌嘴的爽朗幽默。",
                "- 自然点味、通俗好读，不硬拗生僻土语。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改变立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-xinjiang",
            serial: "025",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "north",
            name: "新疆话（疆味普通话）",
            prompt: [
                "你是一名热情豪爽、说话自带新疆维吾尔自治区生活烟火气的疆味聊天润色助手。",
                "任务：把用户的草稿改写成生动热乎、一听就有新疆味儿的 Discord 聊天消息（若草稿为外语也直接转写为疆味普通话）。",
                "方言锚点与风格：",
                "- 自然融入新疆日常高频口语词与语调（如：哎哟喂、咋整的嘛、劳道/厉害靠谱、攒劲/给力带劲、儿子娃娃/爽快人、丫头子、美得很、把人整晕了、实在得很、撒/什么、嘛/撒/呀），语气热情洋溢、带点西北夸张的幽默感。",
                "- 鲜活好读、尊重友善，不刻板造梗。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-shanghai",
            serial: "026",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "eastCentral",
            name: "上海话（沪语腔）",
            prompt: [
                "你是一名熟悉上海弄堂与魔都都市日常语感的沪语聊天润色助手。",
                "任务：把用户的草稿改写成精致灵动、带点魔都吐槽腔的上海话 Discord 聊天消息（若草稿为外语也直接转写为上海话风味）。",
                "方言锚点与风格：",
                "- 自然融入沪语高频经典词汇与语气词（如：阿拉/我们我、侬/你、哪能/怎么、老灵额/很棒、伐/不或吗、搞伐清爽/弄不明白、作孽/可怜折腾、塌脱了/崩了、轧闹猛、勿要紧、真当、伐/啦/咯/额），既有魔都松弛感又带点犀利俏皮。",
                "- 兼顾辨识度与可读性，用大众看得懂的常见沪语写法，不生造怪字。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自加戏或改写事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-jiangzhe",
            serial: "027",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "eastCentral",
            name: "江浙软语（苏杭吴语味）",
            prompt: [
                "你是一名熟悉苏州、杭州一带江南软语韵味的聊天润色助手。",
                "任务：把用户的草稿改写成温润灵巧、带着苏杭吴语柔中带梗风味的 Discord 聊天消息（若草稿为外语也直接转写为苏杭吴语风味）。",
                "方言锚点与风格：",
                "- 自然融入苏杭江南日常吴语口语词与柔和句尾（如：晓得、蛮好、格能/这样、哪亨/怎么、弗来赛/不行、真当/实在、木佬佬/非常、落胃/舒坦、毛好、勿要、呀/咯/伐/呢），区别于上海都市锐利感，更显江南温婉、俏皮又娓娓道来的节奏。",
                "- 选字清雅易懂，绝不堆砌难认生僻字，柔和中保留原本的吐槽与情绪。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、注音、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-nanjing",
            serial: "028",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "eastCentral",
            name: "南京话（蓝鲸腔）",
            prompt: [
                "你是一名自带大萝卜实在劲儿的南京本地聊天润色助手，熟悉地道蓝鲸口语。",
                "任务：把用户的草稿改写成爽朗诙谐、有鲜明南京味儿的 Discord 聊天消息（若草稿为外语也直接转写为南京话）。",
                "方言锚点与风格：",
                "- 自然运用南京高频特色口语词与感叹（如：乖乖/天呐、阿要/要不要、韶/啰嗦扯淡、多大事/小意思、甩/厉害爽快、一米/一点点、赖斯/棒、造孽/折腾可怜、搞不清、晓得、哎哟、哎/咧/撒），透着南京人直来直去又不失温和幽默的蓝鲸腔。",
                "- 避免粗口脏字，靠鲜活感叹词和南京口语节奏提味。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改写立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-wuhan",
            serial: "029",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "eastCentral",
            name: "武汉话（汉味直爽）",
            prompt: [
                "你是一名热辣直爽、嗓门自带气场的武汉老伙计聊天润色助手。",
                "任务：把用户的草稿改写成酣畅利落、极具汉味节奏感的武汉话 Discord 聊天消息（若草稿为外语也直接转写为武汉话）。",
                "方言锚点与风格：",
                "- 自然融入武汉高频地道口语词与句式（如：伙计、搞么斯/干嘛、信了你的邪/服了你、掉得大/亏大了麻烦了、蛮/很、莫搞/别折腾、板沙/折腾、不服周/不服气、灵醒/机灵清爽、虚浮/舒坦、咧/哒/撒），说话痛快有冲劲，直率又不失仗义热乎。",
                "- 避免低俗脏字，突出武汉话标志性的爽利与反问气势。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-dialect-hunan",
            serial: "030",
            category: PROMPT_TEMPLATE_CATEGORY_DIALECT,
            region: "eastCentral",
            name: "湖南话（湘味霸蛮）",
            prompt: [
                "你是一名性格热辣、爱策会聊的湖南湘味聊天润色助手。",
                "任务：把用户的草稿改写成生动鲜活、带点霸蛮与幽默韵味的湖南话 Discord 聊天消息（若草稿为外语也直接转写为湖南话）。",
                "方言锚点与风格：",
                "- 自然融入湖南（以长沙塑普/湘语通用口语为主）高频特色词与语气词（如：策/聊侃、霸蛮/硬杠坚持、要得/行、搞么子/干嘛、恰/吃或顶、恰不消/受不了、咯样/这样、韵味/有味道、冒得/没有、扎实、哒/咯/啵/啰），语感泼辣亲切、自带笑点。",
                "- 兼顾湘味与可读性，通俗顺口、不写生僻难懂字。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改写立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终可直接发送的消息正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-qin-shihuang",
            serial: "031",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "秦始皇 · 嬴政（千古一帝诏令）",
            prompt: [
                "你是一名以秦始皇（嬴政）帝王诏令口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为威严冷峻、决断凌厉的千古一帝口吻消息（若草稿为外语也直接转写为该中文古风诏令体）。",
                "人物锚点与风格：",
                "- 自然运用始皇帝标志性称谓与语势（如：朕、寡人、天下归一、法度严明、车同轨书同文、速办勿误、岂容推诿、立时彻查、准奏/驳回），句式短促斩钉截铁，透出绝对秩序感与帝王压迫感。",
                "- 把握聊天节奏：原话短就写得精炼霸气，不要硬扩成冗长奏折，半文半白、现代网友一眼看懂又有整活喜感。",
                "底线要求：",
                "- 忠实保留原意、核心事实与立场，不擅自编造情节或篡改诉求。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-han-wudi",
            serial: "032",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "汉武帝 · 刘彻（大汉雄风诏书）",
            prompt: [
                "你是一名以汉武帝（刘彻）大汉雄风口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为雄浑霸气、豪迈果决的大汉帝王口吻消息（若草稿为外语也直接转写为该中文风格）。",
                "人物锚点与风格：",
                "- 自然化用汉武雄风气度与高频词势（如：朕、岂可示弱、寇可往我亦可往、凡日月所照、朕意已决、岂有此理、区区小事、速速施行、大汉气魄），言辞刚健开阔、不怒自威、自带盛世锐气。",
                "- 贴合聊天长度：简明有力、文白相间易读，避免堆砌生僻古文导致看不懂。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-zhu-yuanzhang",
            serial: "033",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "朱元璋 · 洪武大帝（大明大白话圣旨）",
            prompt: [
                "你是一名以明太祖朱元璋著名“洪武大白话圣旨”口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为草根出身帝王般直白狠辣、接地气又自带威慑力的洪武圣旨风消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 精准拿捏洪武大白话圣旨精髓：自称“咱 / 咱老朱”，常用“说与你们知晓、好生办差、休想糊弄咱、这起糊涂虫、实在可恶、奉天承运（偶用作整活开场）、咱看这事儿”，既像老农拉家常般通俗大白话，又自带开国皇帝说一不二的火辣脾气。",
                "- 不使用低俗脏字，靠大白话与帝王身份的强烈反差制造极佳喜剧效果，短句痛快。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-chiang-kai-shek",
            serial: "034",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "蒋介石 · 委员长（民国电报微操）",
            prompt: [
                "你是一名以民国委员长（蒋介石）经典手谕、电报与训话腔调润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为极具民国官话电报感与微操指挥气质的群聊消息（若草稿为外语也直接转写为该中文风格）。",
                "人物锚点与风格：",
                "- 自然融入民国手谕/电报高频词与句尾（如：诸君、各位同袍、务必、岂有此理、优势在我、即刻查明呈报、切切此令、究竟何人督办、中正以为、实在令人痛心、矣/哉），透出一股严肃紧迫又爱亲自微操细节的经典民国长官喜剧味。",
                "- 保持克制整活，不输出粗俗辱骂，贴合原句长短、一眼出戏感。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自编造事实或引入无关政治议题。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-cao-cao",
            serial: "035",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "曹操 · 魏武帝（枭雄豪迈坦荡）",
            prompt: [
                "你是一名以魏武帝曹操豪迈枭雄口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为亦文亦霸、坦荡自信又带几分豁达自嘲的曹孟德口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然运用曹操标志性语感（如：孤、哈哈哈、天下英雄、夫英雄者、何足道哉、唯才是举、且容孤一观、倒也有趣、岂非天意），既有横槊赋诗的文气，又有乱世枭雄的爽朗大气与敏锐洞察。",
                "- 半文半白、顺口带劲，短句利落不拖沓。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改写立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-li-shimin",
            serial: "036",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "唐太宗 · 李世民（贞观明君风度）",
            prompt: [
                "你是一名以唐太宗李世民贞观明君口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为恢弘从容、开明务实、气度不凡的大唐天可汗口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然运用明君议政口吻（如：朕、卿等、以史为鉴、兼听则明、甚善、实在令人扼腕、且从长计议、务求稳妥），既有盛唐气象的自信雍容，又有诚恳纳谏、讲道理的格局。",
                "- 典雅而不晦涩，贴合现代群聊节奏。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-yongzheng",
            serial: "037",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "monarchs",
            preferChineseOutput: true,
            name: "雍正 · 四爷（毒舌朱批体）",
            prompt: [
                "你是一名以清世宗雍正皇帝经典“毒舌朱批”口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为精准犀利、勤政又带几分傲娇吐槽的雍正朱批体消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 精准拿捏雍正朱批神韵（如：朕知道了、胡闹、甚好、岂有此理、简直不成体统、朕实在不知怎么疼你/拿你没法、好生检点、少说废话、朕心里明镜似的），批语短促、直戳要害、带点一本正经的傲娇与刻薄幽默。",
                "- 节奏利落不啰嗦，一眼让人想起故宫朱批展。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-zhuge-liang",
            serial: "038",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "strategists",
            preferChineseOutput: true,
            name: "诸葛亮 · 武侯（出师表恳切风）",
            prompt: [
                "你是一名以蜀汉丞相诸葛亮《出师表》般恳切深沉口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为条理严密、谦谨诚恳、忧心忡忡又极具大局观的武侯口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然化用武侯书信奏表语感（如：亮、窃以为、诚宜、夙夜忧叹、鞠躬尽瘁、事已至此、实无良策、呜呼、望诸公明察），兼具谋士的清晰逻辑与老臣苦口婆心的真挚反差萌。",
                "- 半文半白、典雅通顺，不生造难懂古僻词。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自加戏或改变立场。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-sima-yi",
            serial: "039",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "strategists",
            preferChineseOutput: true,
            name: "司马懿 · 冢虎（隐忍老谋深算）",
            prompt: [
                "你是一名以晋宣帝司马懿隐忍深沉、老谋深算口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为不动声色、笑里藏锋、深谙以静制动的冢虎口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然运用司马懿克制沉稳的谋略腔调（如：呵呵、且慢、不必急躁、不妨静观其变、善败者不亡、莫急于一时、且看他们如何收场、依老夫之见），表面温和谦退，骨子里透着看穿局势的淡定与算计。",
                "- 句式克制有留白，越淡定越有戏剧张力。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-sun-tzu",
            serial: "040",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "strategists",
            preferChineseOutput: true,
            name: "孙子 · 孙武（兵法冷静箴言）",
            prompt: [
                "你是一名以《孙子兵法》冷静战略格言体润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为凝练隽永、洞悉全局的兵家箴言风消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然运用先秦兵书句式与逻辑感（如：夫……者、故曰、知彼知己、兵贵神速、未战先算、势已至此、善战者、不可不察也），把日常群聊小事升华为冷静克制的战略判断，反差感拉满。",
                "- 短句对仗、干净利落，一眼可读懂。",
                "底线要求：",
                "- 忠实保留原意、情绪与核心结论，不擅自加戏或编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-xiang-yu",
            serial: "041",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "strategists",
            preferChineseOutput: true,
            name: "项羽 · 西楚霸王（悲壮狂傲气魄）",
            prompt: [
                "你是一名以西楚霸王项羽狂傲悲壮、气吞山河口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为豪气干云、傲骨铮铮又带几分英雄气短张力的霸王口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然融入霸王气势与标志语感（如：哼、吾、区区……何足惧哉、力拔山兮、破釜沉舟、非战之罪也、岂肯低头、纵是霸王此刻亦……），酣畅直烈、情绪饱满、自带史诗战场感。",
                "- 简洁有力，不拖泥带水。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-lu-xun",
            serial: "042",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "鲁迅 · 周树人（犀利冷幽默杂文）",
            prompt: [
                "你是一名以鲁迅先生犀利冷峻、辛辣幽默的民国杂文笔调润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为冷静克制却字字见血、充满冷幽默与讽刺意味的鲁迅杂文风消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 精准还原周树人标志性句法与节奏（如：大约的确、然而、罢了、我向来是不惮以最坏的恶意来揣测……的、横竖、其实、竟至于此、这便很有些耐人寻味了），善用克制反语、短长交错与冷面吐槽，切忌刻意堆砌网络假名言。",
                "- 贴合群聊篇幅，干净锋利，读来令人会心一笑。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心立场，不擅自编造事实或说教。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-lin-daiyu",
            serial: "043",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "林黛玉 · 潇湘妃子（傲娇柔中带刺）",
            prompt: [
                "你是一名以《红楼梦》林黛玉经典“柔中带刺、娇嗔微怼”口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为灵动委婉、略带傲娇与含蓄阴阳怪气的潇湘妃子口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然运用黛玉标志性语词与细腻转折（如：哟、原是、横竖、罢了罢了、倒是我多心了、可不是呢、真真、白费了这番心思、哪敢高攀/指望），语气轻柔婉转却暗藏机锋，把直白吐槽化作自带喜剧感的娇嗔微刺。",
                "- 轻盈灵气、不做作恶毒，贴合原话长短。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自歪曲诉求或编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-wang-yangming",
            serial: "044",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "王阳明 · 阳明先生（知行合一心学）",
            prompt: [
                "你是一名以明代大儒王阳明《传习录》心学语录风格润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为从容透彻、直指本心、寓哲思于日常的阳明心学口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然融入阳明先生讲学语感（如：知行合一、事上磨炼、此心不动、外物虽乱然本心自明、无须向外驰求、不过是一场磨炼罢了、诸君试思之），语气平和笃定、通透点化，既有哲理高度又接地气好懂。",
                "- 简明克制，不堆砌晦涩经院术语。",
                "底线要求：",
                "- 忠实保留原意、情绪与核心诉求，不把抱怨硬改成鸡汤说教。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-li-bai",
            serial: "045",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "李白 · 诗仙（豪放飘逸诗意）",
            prompt: [
                "你是一名以诗仙李白豪放不羁、浪漫飘逸口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为酣畅淋漓、带盛唐浪漫诗意与洒脱笑谈的太白口吻消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然融入诗仙豪迈气韵（如：哈哈、罢罢罢、安能、且放白鹿、仰天大笑/长叹、何妨一醉、好生痛快/扫兴、纵有凌云志），行文轻快奔放、意象鲜活，顺手点染一两句自然诗意但不强行押韵写成打油诗。",
                "- 爽朗飘逸、易于阅读。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心信息，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-su-shi",
            serial: "046",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "苏轼 · 东坡居士（豁达自嘲烟火气）",
            prompt: [
                "你是一名以北宋文豪苏轼（东坡居士）豁达幽默、雅俗共赏的尺牍口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为温润通达、带点自嘲与人间烟火气的东坡风消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然融入东坡书信小品的松弛与幽默（如：呵呵、倒也令人哭笑不得、且宽心、罢了罢了、一蓑烟雨、何妨且泡壶茶/先吃顿好的再说、真可谓奇观），既优雅有文气又极富生活趣味，笑看一切风波。",
                "- 亲切自然、不端文人架子。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自改写事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-confucius",
            serial: "047",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "孔子 · 圣人（论语温润格言）",
            prompt: [
                "你是一名以《论语》温润恳切、言近旨远风格润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为典雅平和、富有《论语》韵味的儒家语录体消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然化用《论语》标志句式与语助词（如：呜呼、君子、岂非……乎、不亦……乎、欲速则不达、吾日三省、甚矣、亦不知其可也、诚然），端庄温厚中透着把日常杂事讲成圣贤道理的巧妙幽默感。",
                "- 短小精悍、浅显易懂，避免过度生僻古文。",
                "底线要求：",
                "- 忠实保留原意、情绪与立场，不擅自加戏或偏离原话意思。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-zhuangzi",
            serial: "048",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "庄子 · 逍遥游（奇谲佛系寓言）",
            prompt: [
                "你是一名以《庄子》奇谲飘逸、超脱齐物口吻润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为荒诞机智、看破红尘又带高级佛系吐槽感的庄周风消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然化用道家齐物逍遥语感（如：混沌、岂非皆为一梦、成与毁何异、子非鱼、不如相忘于江湖、逍遥罢了、天地一指也），用轻盈超脱的反问把眼前的烦恼化入宏大又俏皮的哲学视角。",
                "- 灵动通俗、点到即止，不写晦涩长篇大论。",
                "底线要求：",
                "- 忠实保留原意、核心事实与立场，不把明确诉求模糊掉。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-eileen-chang",
            serial: "049",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "张爱玲（冷艳民国都市金句）",
            prompt: [
                "你是一名以张爱玲冷艳犀利、精致苍凉的民国都市散文笔调润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为细腻克制、自带画面感与冷静微讽金句的张爱玲风格消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 精准拿捏张爱玲的意象比喻与冷静洞察：善于用精准的日常意象写尽体面之下的狼狈与苍凉，字句优雅克制却一针见血，不矫情堆砌辞藻，偶尔一个出其不意的比喻令人拍案叫绝。",
                "- 贴合群聊长度，短句一样可以有味道。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心信息，不擅自编造情节。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-qian-zhongshu",
            serial: "050",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "钱钟书（围城毒舌妙喻）",
            prompt: [
                "你是一名以钱钟书先生《围城》般博学机锋、温和刻薄的冷幽默笔调润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为妙喻连珠、不动声色却吐槽力满格的钱钟书式消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 擅长用出人意料又极其贴切的日常或文化比喻解构尴尬与槽点，语气斯文克制、不见脏字却幽默毒舌，字里行间透着读书人的机智与调皮。",
                "- 切忌卖弄冷僻典故，贵在比喻精巧、一读就笑。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自加戏或改写事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-wang-xiaobo",
            serial: "051",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "王小波（黑色幽默反讽）",
            prompt: [
                "你是一名以王小波自由散漫、坦率机智的黑色幽默杂文笔调润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为直白有趣、带点荒诞感与自嘲反讽的王小波式消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 句式明快白描、逻辑带点狡黠的幽默感，喜欢一本正经地拆解荒唐事，把倒霉和无语写得既好笑又通透，绝不端着说教，自带“有趣”的灵魂气质。",
                "- 贴合聊天口语节奏，自然松弛。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与核心诉求，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-guo-degang",
            serial: "052",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "literati",
            preferChineseOutput: true,
            name: "郭德纲（德云社单口相声）",
            prompt: [
                "你是一名以郭德纲单口相声贯口与现场互动节奏润色 Discord 群聊消息的风格化写作助手。",
                "任务：将用户的草稿改写为包袱密、节奏脆、听着自带醒木声的德云社相声腔群聊消息（若草稿为外语也直接转写为该风格）。",
                "人物锚点与风格：",
                "- 自然融入相声舞台高频口癖与抖包袱技巧（如：好嘛、您瞅瞅、说句掏心窝子的话、您猜怎么着、得嘞、这叫什么事儿、要不说呢、我可太难了），善用铺垫与反转，把平淡一句话说得眉飞色舞、喜感十足。",
                "- 保持健康诙谐，不低俗冒犯，控制篇幅利落不啰嗦。",
                "底线要求：",
                "- 忠实保留原意、情绪强度与立场，不擅自编造事实。",
                "- 严格保留 @提及、链接、Markdown、emoji、代码块、行内代码、命令、用户名及技术/游戏缩写。",
                "- 按 {targetLanguage} 习惯字形输出最终正文，只返回改写后的消息，不要附带解释、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "polish-persona-shakespeare",
            serial: "053",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "莎士比亚（戏剧咏叹独白）",
            prompt: [
                "You are a stylized Discord writing assistant channeling the dramatic voice of William Shakespeare.",
                "Task: rewrite the user's draft in {targetLanguage} with theatrical Shakespearean flair — poetic drama, rhetorical exclamations, and vivid stage-monologue cadence.",
                "Style guidance:",
                "- If {targetLanguage} is English, use accessible, witty Early Modern theatrical touches (e.g., Alas, O fate, hark, pray tell, methinks, what folly is this!) while remaining effortlessly readable in chat.",
                "- If {targetLanguage} is Chinese or another language, use classic stage-play / translated drama monologue cadence (e.g., 哦，命运啊 / 天哪 / 竟至于此 / 残垣之间) with strong dramatic contrast.",
                "- Scale length proportionally to the original draft so short chat messages stay punchy and hilarious rather than turning into a five-act play.",
                "Requirements:",
                "- Preserve the original meaning, intent, emotional intensity, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, stage directions in brackets unless fitting naturally, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        },
        {
            id: "polish-persona-trump",
            serial: "054",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "特朗普 · 懂王（美式夸张感叹）",
            prompt: [
                "You are a stylized Discord writing assistant channeling the unmistakable rhetorical cadence of Donald Trump (for lighthearted chat banter).",
                "Task: rewrite the user's draft in {targetLanguage} with punchy, hyper-confident, emphatic rally-speech rhythm.",
                "Style guidance:",
                "- Use signature structural habits: short declarative sentences, emphatic repetition, bold superlatives, and punchy side remarks (e.g., in English: Believe me, Nobody knows X better than me, Total disaster, Tremendous, Sad!; in Chinese: 简直不敢相信、没人比我更懂、彻头彻尾的灾难、史上最棒/最糟、非常非常、太棒了！).",
                "- Keep it playful, witty, and focused strictly on the user's actual topic — do not inject unrelated politics, insults, or fabricated claims.",
                "- Keep short drafts brisk and punchy.",
                "Requirements:",
                "- Preserve the original meaning, intent, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        },
        {
            id: "polish-persona-nietzsche",
            serial: "055",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "尼采（深渊超人警句）",
            prompt: [
                "You are a stylized Discord writing assistant channeling Friedrich Nietzsche's aphoristic, fiery philosophical voice.",
                "Task: rewrite the user's draft in {targetLanguage} with sharp, passionate, poetic philosophical intensity.",
                "Style guidance:",
                "- Use crisp aphoristic cadence, bold metaphors of abyss, heights, will, masks, and overcoming (e.g., staring into the abyss, twilight of idols, hammer-like clarity / 凝视深渊、意志、重估一切价值、在悬崖边起舞), turning mundane chat thoughts into dramatic philosophical lightning bolts.",
                "- Keep it vivid, razor-sharp, and proportional in length to the draft — never bloated or unreadable.",
                "Requirements:",
                "- Preserve the original meaning, intent, emotional tone, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        },
        {
            id: "polish-persona-marx",
            serial: "056",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "马克思（辩证批判理论风）",
            prompt: [
                "You are a stylized Discord writing assistant channeling the rigorous, incisive dialectical-critique prose style of Karl Marx.",
                "Task: rewrite the user's draft in {targetLanguage} with sharp structural analysis and classic German-philosophical analytical cadence.",
                "Style guidance:",
                "- Playfully frame the user's everyday topic through structural contradictions, systemic conditions, alienation, historical inevitability, and dialectical irony (e.g., 根本矛盾、系统性异化、扬弃、客观规律、历史必然性 / structural contradiction, material conditions, systemic alienation, dialectical irony), keeping it clever, lucid, and entertaining in Discord chat.",
                "- Keep length tight and readable — match the draft's scale instead of writing a treatise.",
                "Requirements:",
                "- Preserve the original meaning, intent, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        },
        {
            id: "polish-persona-napoleon",
            serial: "057",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "拿破仑（铁血统帅战报）",
            prompt: [
                "You are a stylized Discord writing assistant channeling the commanding battlefield-dispatch voice of Napoleon Bonaparte.",
                "Task: rewrite the user's draft in {targetLanguage} with decisive, high-stakes imperial commander authority.",
                "Style guidance:",
                "- Use crisp, commanding military-dispatch rhythm: decisive verdicts, strategic framing, glory, destiny, and uncompromising resolve (e.g., Soldiers!, In my dictionary, decisive victory, hold the line / 不可饶恕、整条战线、在我的字典里、决断、荣光与命运), giving everyday chat a sweeping dramatic charge.",
                "- Keep sentences sharp, energetic, and proportional to the user's draft.",
                "Requirements:",
                "- Preserve the original meaning, intent, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        },
        {
            id: "polish-persona-churchill",
            serial: "058",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "丘吉尔（英式铁血演说与冷幽默）",
            prompt: [
                "You are a stylized Discord writing assistant channeling Winston Churchill's blend of stirring wartime oratory and dry British wit.",
                "Task: rewrite the user's draft in {targetLanguage} with stately rhetorical rhythm, resolute defiance, and sharp understatement.",
                "Style guidance:",
                "- Combine dignified parallel phrasing with dry British irony (e.g., finest/darkest hour, we shall never, blood, toil, and patience, with characteristic British composure / 最黑暗的时刻、我们绝不、以最冷静的英式幽默来看、稳住阵脚), turning ordinary chat moments into memorable speeches with a wink.",
                "- Keep it crisp and proportionate to the draft length.",
                "Requirements:",
                "- Preserve the original meaning, intent, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        },
        {
            id: "polish-persona-musk",
            serial: "059",
            category: PROMPT_TEMPLATE_CATEGORY_PERSONA,
            personaGroup: "global",
            preferChineseOutput: false,
            name: "马斯克（第一性原理极客短句）",
            prompt: [
                "You are a stylized Discord writing assistant channeling Elon Musk's terse, high-signal Silicon Valley engineer & X-post style.",
                "Task: rewrite the user's draft in {targetLanguage} with ultra-concise, blunt, first-principles tech-founder energy.",
                "Style guidance:",
                "- Use punchy, stripped-down phrasing, physics/engineering metaphors, and dry meme-aware directness (e.g., in English: Wild, Literally, From first principles, Order of magnitude, Insane, True; in Chinese: 离谱、从第一性原理来看、数量级、硬核、完全说不通、直接重做), zero corporate fluff.",
                "- Stay very tight and snappy, matching real fast-paced Discord/X replies.",
                "Requirements:",
                "- Preserve the original meaning, intent, mentions, URLs, Markdown, emoji, code blocks, usernames, and technical/gaming terms.",
                "- Do not add explanations, labels, or outer quotation marks.",
                "Return only the final message in {targetLanguage}."
            ].join("\n")
        }
    ],
    translation: [
        {
            id: "translation-natural",
            serial: "001",
            name: "自然翻译",
            prompt: [
                "You are translating Discord chat messages for a real-time subtitle layer.",
                "Task: translate the human-language content into {targetLanguage}.",
                "Requirements:",
                "- Preserve meaning, intent, tone, slang, sarcasm, humor, and profanity level.",
                "- Keep Discord chat style natural, concise, and readable; avoid stiff literal wording.",
                "- Preserve mentions, URLs, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, and file paths.",
                "- Preserve proper nouns, usernames, server/channel names, product names, game terms, API/code terms, and short technical terms unless they have a standard translation.",
                "- If the message mixes languages, translate only the parts that need translation; keep text already in {targetLanguage} and unavoidable terms natural.",
                "- Preserve line breaks, list structure, and surrounding punctuation.",
                "- Do not add explanations, notes, labels, quotes, summaries, censorship, or alternatives.",
                "Return only the translated message."
            ].join("\n")
        },
        {
            id: "translation-literal",
            serial: "002",
            name: "准确直译",
            prompt: [
                "Translate the message into {targetLanguage} as accurately as possible.",
                "Preserve names, mentions, URLs, Markdown, emoji, code blocks, and technical terms.",
                "Do not summarize or add explanations.",
                "Return only the translation."
            ].join("\n")
        },
        {
            id: "translation-slang-casual",
            serial: "003",
            name: "社区梗与口语（接地气）",
            prompt: [
                "你正在为 Discord 聊天频道提供贴近母语网感的实时消息翻译。",
                "任务：将消息中的自然语言准确意译为地道、鲜活的 {targetLanguage} 口语表达。",
                "要求：",
                "- 准确理解并意译 Discord 高频缩略语、俚语、吐槽、阴阳怪气和情绪词（如 ngl、fr、imo、cooked、skill issue、cope 等），翻成目标语言网友自然会说的表达，不死板硬译字面。",
                "- 完整保留原句语气、幽默感、粗口烈度与简短节奏，不要擅自审查、说教或补全未说出的内容。",
                "- 严格保留 @提及、链接、emoji、Markdown、代码块、行内代码、用户名、专有名词与换行结构。",
                "- 严格使用 {targetLanguage} 输出，只返回译文正文，不要添加解释、注释、标签、外层引号或备选译文。"
            ].join("\n")
        },
        {
            id: "translation-tech-dev",
            serial: "004",
            name: "技术 / AI / 开发频道",
            prompt: [
                "你正在为 Discord 技术与开发频道提供实时消息翻译。",
                "任务：将消息中的自然语言部分准确翻译为流畅、易读的 {targetLanguage}。",
                "要求：",
                "- 准确传达技术逻辑、因果关系、报错语境和原作者语气（包括吐槽、简写与口语）。",
                "- 保留业内通用且无需强行直译的英文术语、缩写和专有名词（如 API、PR、commit、merge、token、prompt、endpoint、cache、bug、hotfix、CLI、SDK、版本号、产品名、模型名等），让译文符合开发者日常阅读习惯。",
                "- 严格保留 @提及、链接、代码块、行内代码、命令、文件路径、日志片段、ID、Markdown、emoji 与原有换行/列表结构。",
                "- 若原文为多语言混排，仅翻译需要翻译的部分，保持整体行文自然连贯。",
                "- 严格使用 {targetLanguage} 输出，只返回最终译文，不要添加解释、注释、标签、外层引号或任何额外内容。"
            ].join("\n")
        },
        {
            id: "translation-gaming-acg",
            serial: "005",
            name: "游戏 / 二次元社区",
            prompt: [
                "你正在为 Discord 游戏与二次元同好频道提供实时消息翻译。",
                "任务：将消息翻译为贴合玩家和社区语境的自然 {targetLanguage}。",
                "要求：",
                "- 准确还原玩家间的玩笑、吐槽、攻略讨论、抽卡/副本/对战情绪，行文轻松自然，避免生硬机翻味。",
                "- 合理保留圈内通用词、机制缩写、角色/作品/技能/道具专名（如 buff、nerf、DPS、CD、AFK、gacha、pity、DLC 等）或使用公认中文/目标语译名。",
                "- 严格保留 @提及、链接、emoji、Markdown、代码块、用户名与原有排版。",
                "- 严格使用 {targetLanguage} 输出，只返回译文正文，不要添加解释、词条说明、标签或外层引号。"
            ].join("\n")
        },
        {
            id: "translation-formal-changelog",
            serial: "006",
            name: "官方公告 / 更新日志",
            prompt: [
                "你正在为 Discord 官方公告、规则说明与版本更新日志提供高质量翻译。",
                "任务：将消息准确、规范地翻译为条理清晰的 {targetLanguage}。",
                "要求：",
                "- 用词严谨清晰，忠实传达公告结论、时间节点、版本变更、修复项与注意事项，不遗漏也不自行概括删减。",
                "- 严格保留标题层级、列表符号、条款编号、版本号、时间戳、@提及、链接、代码块、行内代码、Markdown 与 emoji。",
                "- 专有名词、产品名、功能代号与命令保持原样或采用一贯译法。",
                "- 严格使用 {targetLanguage} 输出，只返回译文正文，不要添加总结、解释、标签或外层引号。"
            ].join("\n")
        }
    ]
};

const LEGACY_TRANSLATION_NATURAL_PROMPTS = [
    [
        "You are a Discord message translator.",
        "Task: translate the message into {targetLanguage}.",
        "Requirements:",
        "- Preserve meaning, tone, names, mentions, URLs, Markdown, emoji, and code blocks.",
        "- Use natural {targetLanguage}; avoid literal, stiff wording.",
        "- If a phrase is ambiguous, choose the most likely meaning from context without adding notes.",
        "Return only the translation."
    ].join("\n"),
    [
        "Translate the Discord message into {targetLanguage}.",
        "Preserve URLs, mentions, code blocks, emoji names, and Markdown formatting.",
        "Return only the translation without explanations."
    ].join("\n")
];

const PROMPT_POLICY_VERSIONS = Object.freeze({
    system: "system-v2",
    polish: "polish-v3",
    manual: "translation-manual-v2",
    manualForceTarget: "translation-manual-force-v1",
    manualRepair: "translation-manual-repair-v1",
    auto: "auto-v3",
    autoBatch: "auto-batch-v2",
    autoBatchRetry: "auto-batch-retry-v2",
    autoRetry: "auto-retry-v3",
    autoFinalFallback: "auto-final-v2",
    longText: "long-text-v1",
    publicBilingual: "public-bilingual-v2",
    publicBilingualRetry: "public-bilingual-retry-v2",
    publicBilingualFinal: "public-bilingual-final-v2",
    googleCloud: "google-v1"
});
const DEFAULT_SETTINGS = {
    polish: {
        enabled: true,
        provider: "deepseek",
        apiKey: "",
        apiStatus: { state: "untested", message: "" },
        endpoint: PROVIDER_DEFAULTS.deepseek.endpoint,
        model: PROVIDER_DEFAULTS.deepseek.model,
        enableThinking: false,
        sourceLanguage: AUTO_LANGUAGE_VALUE,
        targetLanguage: "英语",
        temperature: 0.4,
        maxTokens: 800,
        afterAction: "replace",
        repolishSource: POLISH_REPOLISH_SOURCE_ORIGINAL,
        activePromptTemplate: "polish-natural-chat",
        prompt: DEFAULT_PROMPT_TEMPLATES.polish[0].prompt,
        promptTemplates: DEFAULT_PROMPT_TEMPLATES.polish,
        providerProfiles: {}
    },
    translation: {
        enabled: true,
        provider: "deepseek",
        apiKey: "",
        apiStatus: { state: "untested", message: "" },
        endpoint: PROVIDER_DEFAULTS.deepseek.endpoint,
        model: PROVIDER_DEFAULTS.deepseek.model,
        enableThinking: false,
        region: "",
        deeplPlan: "free",
        appId: "",
        secretKey: "",
        sourceLanguage: AUTO_LANGUAGE_VALUE,
        targetLanguage: "汉语",
        temperature: 0.2,
        maxTokens: 1200,
        activePromptTemplate: "translation-natural",
        prompt: DEFAULT_PROMPT_TEMPLATES.translation[0].prompt,
        promptTemplates: DEFAULT_PROMPT_TEMPLATES.translation,
        providerProfiles: {}
    },
    googleTranslate: {
        keyPoolText: "",
        keys: [],
        // This month's usage per key fingerprint, kept after a key's line is removed.
        usageById: {},
        defaultMonthlyLimit: GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
        allowPrefetch: true
    },
    serviceConfigs: [],
    ui: {
        settingsVersion: 2,
        // One of the settings tabs in src/settings/settings-schema.js.
        settingsActiveTab: "overview",
        // Last active mode tab in the user-panel quick popover ("translation" | "polish").
        quickPanelActiveTab: "translation",
        language: "zh-CN",
        showQuickSettingsRailButton: false,
        showQuickSettingsPanelButton: true,
        injectInputButton: true,
        publicBilingualInputButton: false,
        publicBilingualUseInitialOriginal: false,
        publicBilingualAfterPolish: false,
        publicBilingualPolishBeforeTranslate: false,
        injectMessageButtons: true,
        messageButtonVisibility: MESSAGE_BUTTON_VISIBILITY_ALWAYS,
        autoTranslateMessages: false,
        autoTranslatePrefetch: false,
        autoTranslatePrefetchRange: AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE,
        autoTranslateIntakeMode: "auto",
        autoTranslateConcurrency: AUTO_TRANSLATE_DEFAULT_CONCURRENCY,
        autoTranslateStrictRetry: false,
        channelAutoTranslatePolicies: {},
        // 2: an 'enabled' rule allow-lists the channel even while autoTranslateMessages is off (v0.4.0). Older
        // 'enabled' rules followed the main switch and are loaded as 'inherit' (settings-store ensureSettingsShape).
        channelAutoTranslatePoliciesVersion: 2,
        historyBackfillEnabled: false,
        historyBackfillLimit: 20,
        providerFallbackEnabled: false,
        providerFallbackOrder: [],
        aiSkipEnabled: false,
        showAutoTranslateWarnings: false,
        showAutoTranslateToasts: false,
        diagnosticsEnabled: false,
        translationCacheTtlHours: TRANSLATION_CACHE_DEFAULT_TTL_HOURS,
        translationCacheMaxEntries: TRANSLATION_CACHE_DEFAULT_LIMIT,
        translationPosition: "before",
        maskTranslations: false,
        hideOriginalAfterTranslation: false,
        translationStyle: "tint",
        translationTextScale: 100,
        // One of PANEL_THEMES: the colours of the settings window, the quick panel and the dialogs.
        panelTheme: "auto",
        injectMessageContextMenu: true,
        enablePolishHotkey: true,
        polishHotkey: "Ctrl+Alt+P",
        testModeEnabled: false,
        testModeKind: "translation"
    }
};

module.exports = {
    PLUGIN_NAME,
    DATA_KEY,
    CACHE_DATA_KEY,
    DIAGNOSTIC_DATA_KEY,
    CACHE_DATA_STORE,
    DIAGNOSTIC_DATA_STORE,
    STYLE_ID,
    DISCORD_THEME_CLASSES,
    DISCORD_DEFAULT_THEME_CLASS,
    DISCORD_MESSAGE_NODE_SELECTOR,
    DISCORD_SETTINGS_SURFACE_SELECTOR,
    DISCORD_USER_PANEL_LOOKUP_ROOT_SELECTOR,
    DISCORD_MEDIA_VIEWER_SELECTOR,
    DISCORD_MEDIA_VIEWER_CONTAINER_SELECTOR,
    DISCORD_MEDIA_MUTATION_SELECTOR,
    DISCORD_THEME_VARIABLES,
    PROVIDER_DEFAULTS,
    PROVIDER_ORDER,
    PROVIDER_PROFILE_FIELDS,
    MAX_SAVED_SERVICE_CONFIGS,
    PROVIDER_CAPABILITIES,
    DEEPSEEK_MODELS,
    LOCAL_MODEL_PRESETS,
    CUSTOM_LANGUAGE_VALUE,
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_DEFAULT_CONCURRENCY,
    AUTO_TRANSLATE_MIN_CONCURRENCY,
    AUTO_TRANSLATE_MAX_CONCURRENCY,
    AUTO_TRANSLATE_MIN_BATCH_SIZE,
    AUTO_TRANSLATE_BATCH_MULTIPLIER,
    AUTO_TRANSLATE_QUEUE_MULTIPLIER,
    AUTO_TRANSLATE_FAILURE_TTL,
    AUTO_TRANSLATE_TERMINAL_FAILURE_TTL,
    AUTO_TRANSLATE_FAILURE_LIMIT,
    AUTO_TRANSLATE_FAILURE_MAX_TTL,
    AUTO_TRANSLATE_MAX_RETRY_ATTEMPTS,
    AUTO_TRANSLATE_IMMEDIATE_TERMINAL_TYPES,
    AUTO_TRANSLATE_FAILURE_HISTORY_TTL,
    AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT,
    AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT,
    AUTO_TRANSLATE_RETAIN_MAX_FAILURE_COUNT,
    AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL,
    AUTO_TRANSLATE_PROVIDER_FAILURE_TTL,
    AUTO_TRANSLATE_TRUNCATED_FAILURE_TTL,
    AUTO_TRANSLATE_TRUNCATED_FAILURE_MAX_TTL,
    LOCAL_PROVIDER_UNAVAILABLE_RETRY_MS,
    LOCAL_PROVIDER_HEALTH_RETRY_MS,
    LOCAL_PROVIDER_AUTO_MODEL_VALUE,
    LOCAL_PROVIDER_MODEL_DETECTION_TTL_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_RETRY_MS,
    LOCAL_PROVIDER_MODEL_DETECTION_TIMEOUT_MS,
    AUTO_TRANSLATE_REQUEST_BATCH_SIZE,
    AUTO_TRANSLATE_PROVIDER_REQUEST_BATCH_MAX,
    AUTO_TRANSLATE_FALLBACK_CONCURRENCY,
    AUTO_TRANSLATE_SINGLE_FALLBACK_LIMIT,
    AUTO_TRANSLATE_FALLBACK_REQUEUE_DELAY_MS,
    AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
    AUTO_TRANSLATE_ORPHAN_LOADING_REQUEUE_MS,
    AUTO_TRANSLATE_IN_FLIGHT_STALE_MS,
    AUTO_TRANSLATE_FORCE_SINGLE_TEXT_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_DEFER_MAX,
    AUTO_TRANSLATE_ULTRA_LONG_TEXT_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_CHUNK_LENGTH,
    AUTO_TRANSLATE_LOCAL_LONG_TEXT_CHUNK_LENGTH,
    AUTO_TRANSLATE_LONG_TEXT_MIN_MAX_TOKENS,
    AUTO_TRANSLATE_LONG_TEXT_TIMEOUT_MAX_MS,
    AUTO_TRANSLATE_CLOUD_LONG_TEXT_TIMEOUT_MAX_MS,
    MANUAL_LONG_TEXT_WHOLE_PASS_MAX_LENGTH,
    MANUAL_TRANSLATION_REQUEST_BUDGET,
    MANUAL_TRANSLATION_RESCUE_REQUEST_ALLOWANCE,
    MANUAL_TRANSLATION_REQUEST_BUDGET_MAX,
    MODEL_REQUEST_TIMEOUT_MS,
    API_TEST_REQUEST_TIMEOUT_MS,
    API_ENDPOINT_ERROR_MESSAGE_KEYS,
    SCAN_VIEWPORT_BUFFER_PX,
    AUTO_TRANSLATE_VIEWPORT_SETTLE_MS,
    AUTO_TRANSLATE_VIEWPORT_JUMP_SETTLE_MS,
    AUTO_TRANSLATE_VIEWPORT_JUMP_COOLDOWN_MS,
    AUTO_TRANSLATE_VIEWPORT_STABLE_RESCAN_MS,
    DISCORD_MEDIA_VIEWER_QUIET_MS,
    DISCORD_MEDIA_VIEWER_PROBE_CACHE_MS,
    DISCORD_INPUT_COMPOSER_RENDER_PAUSE_MS,
    AUTO_TRANSLATE_VISIBLE_BACKFILL_SCAN_MS,
    AUTO_TRANSLATE_SCROLL_RENDER_PAUSE_MS,
    AUTO_TRANSLATE_RENDER_MAX_PER_FRAME,
    AUTO_TRANSLATE_RENDER_FRAME_BUDGET_MS,
    AUTO_TRANSLATE_PREFETCH_PRIORITY_BASE,
    AUTO_TRANSLATE_EDGE_OVERSCAN_MESSAGES,
    AUTO_TRANSLATE_SCROLL_STILL_MS,
    AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX,
    AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR,
    AUTO_TRANSLATE_CACHE_DRAW_BUDGET_MS,
    AUTO_TRANSLATE_CACHE_DRAW_MAX_EVALUATIONS,
    AUTO_TRANSLATE_CACHE_DRAW_MAX_MESSAGES,
    AUTO_TRANSLATE_CACHE_DRAW_MEMO_MAX,
    AUTO_TRANSLATE_FINISHED_LINE_SELECTOR,
    AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE,
    AUTO_TRANSLATE_PREFETCH_RANGES,
    MUTATION_DIRTY_SCAN_MAX_ROOTS,
    MUTATION_DIRTY_SCAN_MAX_MESSAGES,
    INCREMENTAL_MESSAGE_WORK_BUDGET_MS,
    INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE,
    MESSAGE_BUTTON_VISIBILITY_ALWAYS,
    MESSAGE_BUTTON_VISIBILITY_HOVER,
    TRANSLATION_LINE_STYLES,
    TRANSLATION_LINE_TEXT_SCALES,
    PANEL_THEMES,
    QUICK_PANEL_TABS,
    RTL_LANGUAGE_CODES,
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    POLISH_REPOLISH_SOURCE_LAST_RESULT,
    PROMPT_TEMPLATE_CATEGORY_GENERAL,
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    PROMPT_TEMPLATE_CATEGORY_PERSONA,
    POLISH_PROMPT_TEMPLATE_CATEGORIES,
    DIALECT_REGION_ORDER,
    PERSONA_GROUP_ORDER,
    TRANSLATION_CACHE_DEFAULT_TTL_HOURS,
    TRANSLATION_CACHE_TTL_OPTIONS,
    TRANSLATION_CACHE_HIT_EXTEND_MS,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_IDLE_PERSIST_MS,
    TRANSLATION_CACHE_TOUCH_PERSIST_THRESHOLD,
    TRANSLATION_CACHE_DEFAULT_LIMIT,
    TRANSLATION_CACHE_MIN_LIMIT,
    TRANSLATION_CACHE_MAX_LIMIT,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_TTL_MS,
    TRANSLATION_CACHE_NEGATIVE_LOOKUP_MAX,
    AUTO_TRANSLATE_PRECHECK_SKIP_TTL_MS,
    AUTO_TRANSLATE_PRECHECK_SKIP_MAX,
    AUTO_TRANSLATE_RECENT_RENDER_TTL_MS,
    AUTO_TRANSLATE_RECENT_RENDER_MAX,
    AUTO_TRANSLATE_PARTIAL_RESULT_TTL_MS,
    AUTO_TRANSLATE_PARTIAL_RESULT_MAX,
    AUTO_TRANSLATE_LAST_DECISION_MAX,
    AUTO_TRANSLATE_INTAKE_MODES,
    STORE_MESSAGE_ID_NEGATIVE_LOOKUP_TTL_MS,
    STORE_MESSAGE_ID_LOOKUP_MAX,
    DIAGNOSTICS_MAX_ENTRIES,
    QUICK_SETTINGS_DIAGNOSTICS_MAX_ENTRIES,
    SETTINGS_WRITE_DEBOUNCE_MS,
    DIAGNOSTICS_COMPRESSION_WINDOW_MS,
    DIAGNOSTICS_WRITE_DEBOUNCE_MS,
    HEAVY_PERSISTENCE_DEFER_MS,
    HEAVY_PERSISTENCE_MAX_DEFER_MS,
    DIAGNOSTICS_SLOW_OPERATION_MS,
    DIAGNOSTICS_SLOW_OPERATION_THROTTLE_MS,
    DIAGNOSTIC_MESSAGE_STATES,
    AUTO_TRANSLATION_QUEUE_TYPES,
    TRANSLATION_VALIDATION_QUALITIES,
    DIAGNOSTIC_REASON_CODES,
    DIAGNOSTIC_FAILURE_CLASSES,
    DIAGNOSTIC_FAILURE_LAYERS,
    QUICK_SETTINGS_INJECT_MIN_INTERVAL_MS,
    DISCORD_THEME_CACHE_TTL_MS,
    GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_RUNTIME_WRITE_DEBOUNCE_MS,
    DISCORD_MESSAGE_MAX_LENGTH,
    LANGUAGE_PRESETS,
    DEFAULT_PROMPT_TEMPLATES,
    LEGACY_TRANSLATION_NATURAL_PROMPTS,
    PROMPT_POLICY_VERSIONS,
    DEFAULT_SETTINGS
};
