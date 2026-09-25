"use strict";

// Shared module-scope constants. Extracted verbatim from discord-ai-translator.js
// (modularization pre-step); imported by the main file and extracted modules.
const PLUGIN_NAME = "DiscordAITranslator";
const DATA_KEY = "settings";
const CACHE_DATA_KEY = "translationCache";
const DIAGNOSTIC_DATA_KEY = "diagnosticLogs";
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
        autoTranslatePrefetchAllowed: false,
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

const SETTINGS_TAB_POLISH = "polish";
const SETTINGS_TAB_TRANSLATION = "translation";
const SETTINGS_TAB_PUBLIC_BILINGUAL = "publicBilingual";
const SETTINGS_TAB_DISPLAY = "display";
const SETTINGS_TAB_DEFAULT = SETTINGS_TAB_POLISH;
const SETTINGS_TABS = [
    SETTINGS_TAB_POLISH,
    SETTINGS_TAB_TRANSLATION,
    SETTINGS_TAB_PUBLIC_BILINGUAL,
    SETTINGS_TAB_DISPLAY
];
const SETTINGS_SECTION_GENERAL = "general";
const SETTINGS_SECTION_POLISH = "polish";
const SETTINGS_SECTION_POLISH_CONTROLS = "polishControls";
const SETTINGS_SECTION_TRANSLATION = "translation";
const SETTINGS_SECTION_TRANSLATION_CONTROLS = "translationControls";
const SETTINGS_SECTION_AUTO_TRANSLATE = "autoTranslate";
const SETTINGS_SECTION_PUBLIC_BILINGUAL = "publicBilingual";
const SETTINGS_SECTION_DISPLAY = "display";
const SETTINGS_SECTION_CACHE = "cache";
const SETTINGS_SECTION_DIAGNOSTICS = "diagnostics";
const SETTINGS_SECTION_IDS = [
    SETTINGS_SECTION_GENERAL,
    SETTINGS_SECTION_POLISH,
    SETTINGS_SECTION_POLISH_CONTROLS,
    SETTINGS_SECTION_TRANSLATION,
    SETTINGS_SECTION_TRANSLATION_CONTROLS,
    SETTINGS_SECTION_AUTO_TRANSLATE,
    SETTINGS_SECTION_PUBLIC_BILINGUAL,
    SETTINGS_SECTION_DISPLAY,
    SETTINGS_SECTION_CACHE,
    SETTINGS_SECTION_DIAGNOSTICS
];

const PROVIDER_ORDER = ["deepseek", "openaiCompatible", "sakuraLocal", "googleCloud", "microsoft", "deepl", "baidu"];
const PROVIDER_PROFILE_FIELDS = ["apiKey", "endpoint", "model", "enableThinking", "region", "deeplPlan", "appId", "secretKey"];
const PROVIDER_CAPABILITIES = {
    deepseek: {
        tasks: { polish: true, translation: true },
        ui: {
            apiKey: true,
            apiTest: true,
            endpoint: true,
            deepseekPreset: true,
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
const AUTO_TRANSLATE_FAILURE_HISTORY_TTL = 10 * 60 * 1000;
const AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT = 2000;
const AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT = 3;
const AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL = 4000;
const AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL = 2 * 60 * 1000;
const AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL = 10000;
const AUTO_TRANSLATE_PROVIDER_FAILURE_TTL = 60000;
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
const MODEL_REQUEST_TIMEOUT_MS = 45000;
const API_TEST_REQUEST_TIMEOUT_MS = 15000;
// Error codes thrown by assertSafeRequestEndpoint, mapped to their localized messages.
const API_ENDPOINT_ERROR_MESSAGE_KEYS = Object.freeze({
    INVALID_API_ENDPOINT: "errorInvalidEndpoint",
    UNSAFE_API_ENDPOINT: "errorUnsafeEndpoint"
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
const AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE = 5;
const AUTO_TRANSLATE_PREFETCH_RANGES = [3, 5, 8];
const MUTATION_DIRTY_SCAN_MAX_ROOTS = 12;
const MUTATION_DIRTY_SCAN_MAX_MESSAGES = 12;
const INCREMENTAL_MESSAGE_WORK_BUDGET_MS = 8;
const INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE = 1;
const MESSAGE_BUTTON_VISIBILITY_ALWAYS = "always";
const MESSAGE_BUTTON_VISIBILITY_HOVER = "hover";
const POLISH_REPOLISH_SOURCE_ORIGINAL = "original";
const POLISH_REPOLISH_SOURCE_LAST_RESULT = "lastResult";
const TRANSLATION_CACHE_DEFAULT_TTL_HOURS = 48;
const TRANSLATION_CACHE_TTL_OPTIONS = [3, 6, 12, 24, 48, 168];
const TRANSLATION_CACHE_HIT_EXTEND_MS = 6 * 60 * 60 * 1000;
const TRANSLATION_CACHE_WRITE_DEBOUNCE_MS = 5000;
const TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS = 30000;
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
            name: "简短直接",
            prompt: [
                "Rewrite the user's draft into concise, natural {targetLanguage}.",
                "Keep the key meaning, remove unnecessary wording, and preserve mentions, URLs, Markdown, emoji, and code blocks.",
                "Return only the final message."
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
    polish: "polish-v2",
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
        defaultMonthlyLimit: GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
        allowPrefetch: true
    },
    ui: {
        settingsVersion: 2,
        settingsActiveTab: SETTINGS_SECTION_GENERAL,
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
    SETTINGS_TAB_POLISH,
    SETTINGS_TAB_TRANSLATION,
    SETTINGS_TAB_PUBLIC_BILINGUAL,
    SETTINGS_TAB_DISPLAY,
    SETTINGS_TAB_DEFAULT,
    SETTINGS_TABS,
    SETTINGS_SECTION_GENERAL,
    SETTINGS_SECTION_POLISH,
    SETTINGS_SECTION_POLISH_CONTROLS,
    SETTINGS_SECTION_TRANSLATION,
    SETTINGS_SECTION_TRANSLATION_CONTROLS,
    SETTINGS_SECTION_AUTO_TRANSLATE,
    SETTINGS_SECTION_PUBLIC_BILINGUAL,
    SETTINGS_SECTION_DISPLAY,
    SETTINGS_SECTION_CACHE,
    SETTINGS_SECTION_DIAGNOSTICS,
    SETTINGS_SECTION_IDS,
    PROVIDER_ORDER,
    PROVIDER_PROFILE_FIELDS,
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
    AUTO_TRANSLATE_FAILURE_HISTORY_TTL,
    AUTO_TRANSLATE_FAILURE_HISTORY_LIMIT,
    AUTO_TRANSLATE_INLINE_FAILURE_AFTER_COUNT,
    AUTO_TRANSLATE_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_FINAL_INVALID_OUTPUT_FAILURE_TTL,
    AUTO_TRANSLATE_TRANSIENT_FAILURE_TTL,
    AUTO_TRANSLATE_PROVIDER_FAILURE_TTL,
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
    AUTO_TRANSLATE_DEFAULT_PREFETCH_RANGE,
    AUTO_TRANSLATE_PREFETCH_RANGES,
    MUTATION_DIRTY_SCAN_MAX_ROOTS,
    MUTATION_DIRTY_SCAN_MAX_MESSAGES,
    INCREMENTAL_MESSAGE_WORK_BUDGET_MS,
    INCREMENTAL_MESSAGE_WORK_MAX_PER_SLICE,
    MESSAGE_BUTTON_VISIBILITY_ALWAYS,
    MESSAGE_BUTTON_VISIBILITY_HOVER,
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    POLISH_REPOLISH_SOURCE_LAST_RESULT,
    TRANSLATION_CACHE_DEFAULT_TTL_HOURS,
    TRANSLATION_CACHE_TTL_OPTIONS,
    TRANSLATION_CACHE_HIT_EXTEND_MS,
    TRANSLATION_CACHE_WRITE_DEBOUNCE_MS,
    TRANSLATION_CACHE_TOUCH_DEBOUNCE_MS,
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
