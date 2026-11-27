"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const {
    AUTO_LANGUAGE_VALUE,
    AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
    PROMPT_POLICY_VERSIONS,
    DEFAULT_SETTINGS
} = require("../constants");
const { removeStandardEmoji } = require("../intake/emoji-text");

class PromptPolicyController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    getPromptPolicyVersion(policyName) {
        const key = String(policyName || "").trim();
        return PROMPT_POLICY_VERSIONS[key] || PROMPT_POLICY_VERSIONS.manual;
    },

    getPromptPolicyCacheVersion(kind = "translation", options = {}, config = null) {
        const effectiveConfig = config || this.plugin.getEffectiveTaskConfig(kind, options?.configOverrides);
        if (kind === "translation" && this.plugin.isGoogleTranslateProvider(effectiveConfig)) return this.getPromptPolicyVersion("googleCloud");
        const explicit = options?.promptPolicyVersion
            || options?.configOverrides?.promptPolicyVersion
            || effectiveConfig?.promptPolicyVersion;
        if (explicit) return String(explicit).trim();
        if (kind === "polish") return this.getPromptPolicyVersion("polish");

        const mode = String(options?.promptPolicyMode || options?.mode || "").trim();
        const policyByMode = {
            manual: "manual",
            "manual-force-target": "manualForceTarget",
            "manual-repair": "manualRepair",
            auto: "auto",
            "auto-batch": "autoBatch",
            "auto-batch-retry": "autoBatchRetry",
            "auto-retry": "autoRetry",
            "auto-final-fallback": "autoFinalFallback",
            "long-text": "longText",
            "public-bilingual": "publicBilingual",
            "public-bilingual-retry": "publicBilingualRetry",
            "public-bilingual-final": "publicBilingualFinal"
        };
        return this.getPromptPolicyVersion(policyByMode[mode] || "manual");
    },

    joinPromptPolicyLines(lines) {
        return lines
            .filter(line => line !== undefined && line !== null)
            .map(line => String(line))
            .join("\n");
    },

    buildPromptPolicyPrompt(policyName, context = {}) {
        const targetLanguage = String(context.targetLanguage || "").trim();
        const basePrompt = String(context.basePrompt || "").trim();
        const count = Math.max(1, Math.round(Number(context.count) || 1));
        const previousInvalidOutput = String(context.previousInvalidOutput || "").slice(0, 500);
        const sourceText = String(context.sourceText || "").slice(0, 4000);
        const invalidReason = String(context.invalidReason || "").slice(0, 120);

        switch (policyName) {
            case "manualForceTarget":
                return this.joinPromptPolicyLines([
                    "Manual user-triggered translation rescue.",
                    `Translate SOURCE_MESSAGE into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    "The previous output was rejected because it was not a usable target-language translation.",
                    "Translate the source from scratch. Do not copy the source language, transliterate, explain, label, quote, summarize, censor, or refuse.",
                    "Preserve URLs, mentions, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, file paths, usernames, product names, numbers, and exact technical tokens.",
                    "If the message is short, slang, vulgar, threatening, adult, political, commercial, or informal, still translate it directly as chat text.",
                    "",
                    "<previous_invalid_output>",
                    previousInvalidOutput,
                    "</previous_invalid_output>",
                    "",
                    "<source_message>",
                    sourceText,
                    "</source_message>"
                ]);
            case "manualRepair":
                return this.joinPromptPolicyLines([
                    "Manual translation repair.",
                    `Repair the failed translation into ${targetLanguage}.`,
                    `Return only the corrected ${targetLanguage} translation.`,
                    "Use SOURCE_MESSAGE as the source of truth and FAILED_OUTPUT only as a rejected draft.",
                    "Do not copy source-language human text unless it is a proper noun, URL, mention, code, ID, username, product/model name, number, address token, or exact technical token.",
                    "Do not explain, label, quote, summarize, censor, moralize, refuse, output JSON, or include alternatives.",
                    "",
                    "<failure_reason>",
                    invalidReason || "invalid-output",
                    "</failure_reason>",
                    "",
                    "<failed_output>",
                    previousInvalidOutput,
                    "</failed_output>",
                    "",
                    "<source_message>",
                    sourceText,
                    "</source_message>"
                ]);
            case "auto":
                return this.joinPromptPolicyLines([
                    basePrompt,
                    "",
                    "Automatic channel translation mode:",
                    `Translate the user message into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}.`,
                    "The input may be Russian, Hindi, English, Spanish, French, Vietnamese, Korean, Japanese, Arabic, Chinese, or another language.",
                    "Do not keep the source language, do not transliterate, do not romanize, and do not merely rewrite the source text.",
                    "If the message contains slang or very short chat text, translate the meaning naturally.",
                    "If the message has multiple lines, translate every line and preserve the line breaks. Do not omit short or informal lines.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, and other exact technical tokens."
                ]);
            case "autoBatch":
                return this.joinPromptPolicyLines([
                    basePrompt,
                    "",
                    "Batch automatic channel translation mode:",
                    "The user message is a JSON array of objects with id and text.",
                    `Translate every text into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    `Return exactly ${count} JSON objects, one for each input object, preserving the same id values and order.`,
                    "Return only valid JSON. Do not wrap it in Markdown.",
                    "Required output shape: [{\"id\":\"001\",\"translation\":\"...\"}].",
                    "If an input text has multiple lines, translate every line and preserve the line breaks inside the translation string.",
                    "Never omit a source line, even if it is short, slang, repeated, or looks informal.",
                    "Do not leave source-language chat text untranslated, do not transliterate, and do not romanize.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, product names, and exact technical tokens."
                ]);
            case "autoBatchRetry":
                return this.joinPromptPolicyLines([
                    "Strict batch automatic channel translation retry:",
                    "The user message is a JSON array of objects with id and text.",
                    `Translate every text into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    `Return exactly ${count} JSON objects, one for each input object, preserving the same id values and order.`,
                    "Return only valid JSON. Do not wrap it in Markdown.",
                    "Required output shape: [{\"id\":\"001\",\"translation\":\"...\"}].",
                    "Translate all human-language text. Do not leave Russian, Hindi, English, Spanish, French, Vietnamese, Korean, Japanese, Arabic, or Chinese source text untranslated unless it is a proper noun.",
                    "If an input text has multiple lines, translate every line and preserve the line breaks inside the translation string.",
                    "Never output question marks or placeholder characters instead of translation.",
                    "Do not explain, label, quote, transliterate, romanize, or include alternatives.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, product names, and exact technical tokens."
                ]);
            case "autoRetry":
                return this.joinPromptPolicyLines([
                    "Strict automatic channel translation retry:",
                    `Translate SOURCE_MESSAGE into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}.`,
                    "Translate all human-language text. Do not leave Russian, Hindi, English, Spanish, French, Vietnamese, Korean, Japanese, Arabic, or Chinese source text untranslated unless it is a proper noun.",
                    "If SOURCE_MESSAGE has multiple lines, translate every line and preserve the line breaks. Do not omit short or informal lines.",
                    "Preserve URLs, mentions, emoji, code blocks, IP addresses, ports, IDs, usernames, passwords, product names, and exact technical tokens.",
                    "Never output question marks or placeholder characters instead of translation.",
                    "Do not explain, label, quote, transliterate, romanize, or include alternatives.",
                    "",
                    "<previous_invalid_output>",
                    previousInvalidOutput,
                    "</previous_invalid_output>",
                    "",
                    "<source_message>",
                    sourceText,
                    "</source_message>"
                ]);
            case "autoFinalFallback":
                return this.joinPromptPolicyLines([
                    "Final strict translation rescue.",
                    `Translate the entire SOURCE_MESSAGE into ${targetLanguage}.`,
                    `Return only ${targetLanguage}.`,
                    "No explanations. No labels. No JSON. No Markdown code fence.",
                    "Do not copy the source language. Do not transliterate. Do not output placeholders or question marks.",
                    "Preserve only URLs, mentions, emoji, code, IDs, usernames, product names, numbers, and other exact technical tokens.",
                    "If there are multiple lines, translate every line and preserve line breaks.",
                    "",
                    "SOURCE_MESSAGE:",
                    sourceText
                ]);
            case "longText":
                return this.joinPromptPolicyLines([
                    basePrompt,
                    "",
                    "Long automatic channel translation mode:",
                    `Translate the whole message into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    "Preserve paragraph order, line breaks, list structure, Markdown, code blocks, URLs, mentions, emoji, IDs, usernames, product names, and exact technical tokens.",
                    "Translate every human-language sentence. Do not omit, summarize, merge unrelated paragraphs, or output JSON.",
                    "Return only the translated message."
                ]);
            case "publicBilingual":
                return this.joinPromptPolicyLines([
                    "Public bilingual outgoing Discord message mode:",
                    `Translate the user's draft into ${targetLanguage}.`,
                    "The translated text will be sent publicly above a hidden spoiler containing the original draft.",
                    "Preserve the original meaning, tone, intent, mentions, URLs, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, file paths, product names, usernames, and technical terms.",
                    "If the draft mixes languages, translate only the human-language parts that need translation and keep existing target-language text natural.",
                    "Do not add explanations, labels, quotes, summaries, censorship, or alternatives.",
                    "Return only the translated message."
                ]);
            case "publicBilingualRetry":
                return this.joinPromptPolicyLines([
                    "Strict public bilingual draft translation retry:",
                    `Translate SOURCE_DRAFT into ${targetLanguage}.`,
                    `The final answer must be written only in ${targetLanguage}, except preserved tokens.`,
                    "Translate all human-language text. Do not leave source-language chat text untranslated unless it is a proper noun or exact technical token.",
                    "Preserve URLs, mentions, emoji, Markdown, code blocks, inline code, commands, IDs, timestamps, file paths, product names, usernames, and technical terms.",
                    "Do not explain, label, quote, transliterate, romanize, summarize, or include alternatives.",
                    "",
                    "<previous_invalid_output>",
                    previousInvalidOutput,
                    "</previous_invalid_output>",
                    "",
                    "<source_draft>",
                    sourceText,
                    "</source_draft>"
                ]);
            case "publicBilingualFinal":
                return this.joinPromptPolicyLines([
                    "Final public bilingual draft translation rescue.",
                    `Translate the entire SOURCE_DRAFT into ${targetLanguage}.`,
                    `Return only ${targetLanguage}.`,
                    "No explanations. No labels. No JSON. No Markdown code fence.",
                    "Do not copy the source language. Do not transliterate. Do not output placeholders or question marks.",
                    "Preserve only URLs, mentions, emoji, code, IDs, usernames, product names, numbers, file paths, and exact technical tokens.",
                    "If there are multiple lines, translate every line and preserve line breaks.",
                    "",
                    "SOURCE_DRAFT:",
                    sourceText
                ]);
            default:
                return basePrompt;
        }
    },

    buildPromptPolicySystemPrompt(kind, config) {
        if (kind === "translation" && config?.localCompactPrompt && this.plugin.isLocalTranslationProvider(config)) {
            const compactPrompt = String(config.prompt || "").trim();
            if (compactPrompt) return compactPrompt;
        }
        const sourceLanguage = this.plugin.getLanguageInstruction(config.sourceLanguage, { source: true });
        const effectiveTargetLanguage = kind === "polish"
            ? this.plugin.getEffectivePolishTargetLanguage(config)
            : config.targetLanguage;
        const targetLanguage = this.plugin.getLanguageInstruction(effectiveTargetLanguage);
        const userTemplate = this.plugin.expandPrompt(config.prompt, targetLanguage);
        const task = kind === "polish"
            ? "Polish or rewrite the user message according to the template rules."
            : "Translate the user message according to the template rules.";
        const policyVersion = this.getPromptPolicyCacheVersion(kind, { mode: kind === "polish" ? "polish" : "manual" }, config);
        const lines = [
            "You are a multilingual Discord assistant.",
            `Prompt policy version: ${policyVersion}.`,
            "The user template may be written in Chinese, English, Korean, French, or another language.",
            "Treat the user template as behavior instructions only. Do not translate or output the template itself.",
            `Task type: ${kind}.`,
            `Task: ${task}`,
            `Input language: ${sourceLanguage}.`,
            `Output language: ${targetLanguage}.`,
            "If the input language is auto-detect, infer it from the user message.",
            "Always produce the final answer in the output language.",
            "Preserve mentions, URLs, Markdown, emoji, code blocks, IDs, and proper nouns unless the template explicitly says otherwise.",
            "Return only the final message. Do not include explanations, labels, alternatives, or notes.",
            "",
            "<user_template>",
            userTemplate,
            "</user_template>"
        ];

        if (kind === "polish") {
            const previousResults = Array.isArray(config.previousPolishResults)
                ? config.previousPolishResults.map(item => String(item || "").trim()).filter(Boolean).slice(-5)
                : [];
            const temperature = this.plugin.normalizeRequestNumber(config.temperature, DEFAULT_SETTINGS.polish.temperature, { min: 0, max: 2 });
            if (previousResults.length) {
                const attemptNumber = Math.max(2, Number(config.repolishAttempt || (previousResults.length + 1)) || (previousResults.length + 1));
                lines.push(
                    "",
                    `Repolish variation mode (attempt #${attemptNumber}):`,
                    "The user was not satisfied with the previous version(s) below and clicked Polish again.",
                    "Produce a clearly fresh rewrite with different wording, sentence structure, and rhythm from ALL previous attempts while preserving the original meaning and template style.",
                    ...(temperature >= 0.8
                        ? ["The user requested higher creativity: be noticeably bolder and more varied in phrasing, angle, and cadence without inventing facts or breaking the output language."]
                        : []),
                    "<previous_attempts>",
                    ...previousResults.map((item, index) => `${index + 1}. ${item}`),
                    "</previous_attempts>"
                );
            }
            const repairReason = String(config.polishRepairReason || "").trim();
            if (repairReason) {
                const invalidOutput = String(config.polishPreviousInvalidOutput || "").trim();
                const repairDetail = repairReason === "script-mismatch"
                    ? (this.plugin.isTraditionalChineseTarget(effectiveTargetLanguage)
                        ? "The previous polish output contained Simplified Chinese characters. Rewrite it strictly in Traditional Chinese (繁體中文, zh-TW) with ZERO Simplified Chinese characters (嚴禁出現任何簡體字)."
                        : "The previous polish output used the wrong Chinese script. Rewrite it strictly in Simplified Chinese (简体中文, zh-CN).")
                    : repairReason === "duplicate-repolish"
                        ? "The previous polish output repeated an earlier attempt verbatim. Rewrite it with clearly different wording and sentence structure."
                        : `The previous polish output did not follow the required output language (${targetLanguage}). Rewrite it strictly in ${targetLanguage}.`;
                lines.push(
                    "",
                    "Mandatory correction:",
                    repairDetail,
                    ...(invalidOutput ? ["<previous_invalid_output>", invalidOutput, "</previous_invalid_output>"] : [])
                );
            }
        }

        if (this.plugin.isTraditionalChineseTarget(effectiveTargetLanguage)) {
            lines.push(
                "",
                "Final mandatory constraint: Output ONLY in Traditional Chinese (繁體中文, zh-TW). Convert ALL Chinese wording into Traditional Chinese characters (繁體字) even if the input draft, template, or previous attempts contain Simplified Chinese. 嚴禁輸出簡體字。"
            );
        }
        else if (this.plugin.isSimplifiedChineseTarget(effectiveTargetLanguage)) {
            lines.push(
                "",
                "Final mandatory constraint: Output ONLY in Simplified Chinese (简体中文, zh-CN). Use Simplified Chinese characters consistently."
            );
        }
        else if (targetLanguage) {
            lines.push(
                "",
                `Final mandatory constraint: Output ONLY in ${targetLanguage}. Never revert to the input language when it differs from ${targetLanguage}.`
            );
        }

        return this.joinPromptPolicyLines(lines);
    },

    buildPromptPolicyAutoBatchPrompt(count, options = this.plugin.getAutoTranslationOptions()) {
        return this.buildPromptPolicyPrompt("autoBatch", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            basePrompt: options?.configOverrides?.prompt || this.plugin.settings.translation.prompt,
            count
        });
    },

    buildPromptPolicyAutoBatchRetryPrompt(count, options = this.plugin.getAutoTranslationOptions()) {
        return this.buildPromptPolicyPrompt("autoBatchRetry", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            count
        });
    },

    buildPromptPolicyAutoRetryPrompt(sourceText, badOutput = "", options = this.plugin.getAutoTranslationOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const previousInvalidOutput = this.plugin.hasPromptLeakageAutoTranslationOutput(sourceText, badOutput, targetLanguageValue)
            ? "[Rejected prompt/instruction leakage output]"
            : String(badOutput || "").slice(0, 500);
        return this.buildPromptPolicyPrompt("autoRetry", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue),
            previousInvalidOutput,
            sourceText
        });
    },

    buildPromptPolicyAutoFinalFallbackPrompt(sourceText, options = this.plugin.getAutoTranslationOptions()) {
        return this.buildPromptPolicyPrompt("autoFinalFallback", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            sourceText
        });
    },

    buildPromptPolicyManualForceTargetPrompt(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        return this.buildPromptPolicyPrompt("manualForceTarget", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            previousInvalidOutput: String(badOutput || "").slice(0, 500),
            invalidReason,
            sourceText
        });
    },

    buildPromptPolicyManualRepairPrompt(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        return this.buildPromptPolicyPrompt("manualRepair", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            previousInvalidOutput: String(badOutput || "").slice(0, 800),
            invalidReason,
            sourceText
        });
    },

    buildPromptPolicyPublicBilingualPrompt(targetLanguageValue = this.plugin.getPublicBilingualTargetLanguage()) {
        return this.buildPromptPolicyPrompt("publicBilingual", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue)
        });
    },

    buildPromptPolicyPublicBilingualRetryPrompt(sourceText, badOutput = "", options = this.plugin.getPublicBilingualTranslationOptions()) {
        return this.buildPromptPolicyPrompt("publicBilingualRetry", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            previousInvalidOutput: String(badOutput || "").slice(0, 500),
            sourceText
        });
    },

    buildPromptPolicyPublicBilingualFinalPrompt(sourceText, options = this.plugin.getPublicBilingualTranslationOptions()) {
        return this.buildPromptPolicyPrompt("publicBilingualFinal", {
            targetLanguage: this.plugin.getAutoTranslationTargetInstruction(this.plugin.getAutoTranslationTargetLanguage(options)),
            sourceText
        });
    },

    extractTranslationValue(value) {
        if (value === undefined || value === null) return "";
        if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
        if (Array.isArray(value)) {
            for (const item of value) {
                const extracted = this.extractTranslationValue(item);
                if (extracted) return extracted;
            }
            return "";
        }
        if (typeof value !== "object") return "";
        const fields = [
            "translation", "translated", "translatedText", "translated_text", "translationText", "translation_text",
            "target", "targetText", "target_text", "message", "content", "text", "output", "result", "response",
            "answer", "value"
        ];
        for (const field of fields) {
            if (!Object.prototype.hasOwnProperty.call(value, field)) continue;
            const extracted = this.extractTranslationValue(value[field]);
            if (extracted) return extracted;
        }
        if (Array.isArray(value.candidates)) {
            for (const candidate of value.candidates) {
                const extracted = this.extractTranslationValue(candidate);
                if (extracted) return extracted;
            }
        }
        return "";
    },

    async runDirectTranslationBatchTask(texts, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        const originalTexts = texts.map(text => String(text || ""));
        const uniqueTexts = [];
        const uniqueIndexes = [];
        const indexByText = new Map();
        originalTexts.forEach(text => {
            if (!indexByText.has(text)) {
                indexByText.set(text, uniqueTexts.length);
                uniqueTexts.push(text);
            }
            uniqueIndexes.push(indexByText.get(text));
        });
        const uniqueResults = await this.plugin.runModelTask("translation", uniqueTexts, {
            configOverrides: options.configOverrides,
            translateAsArray: true,
            timeoutMs: AUTO_TRANSLATE_REQUEST_TIMEOUT_MS,
            mode: options.mode || "direct-translate-batch",
            ...(taskOptions?.signal ? { signal: taskOptions.signal } : {})
        });
        const resultArray = Array.isArray(uniqueResults) ? uniqueResults : [uniqueResults];
        return uniqueIndexes.map(index => String(resultArray[index] || "").trim());
    },

    async runGoogleTranslationBatchTask(texts, options = this.plugin.getAutoTranslationOptions(), taskOptions = {}) {
        return this.runDirectTranslationBatchTask(texts, options, taskOptions);
    },

    normalizeBatchRowId(id) {
        if (typeof id !== "string" && !Number.isSafeInteger(id)) return "";
        const value = String(id).trim();
        return /^\d+$/.test(value) ? value.padStart(3, "0") : value;
    },

    extractBatchRowTranslation(row) {
        if (typeof row === "string") return row;
        return this.extractTranslationValue(row);
    },

    getManualTranslationRequestOptions() {
        const autoOptions = this.plugin.getAutoTranslationOptions();
        return {
            ...autoOptions,
            mode: "manual",
            providerKey: this.plugin.getAutoTranslationProviderKey(autoOptions),
            requestContext: {}
        };
    },

    createAutoBatchParseError(message) {
        const error = new Error(message);
        error.code = "AUTO_BATCH_PARSE_FAILED";
        return error;
    },

    isAutoBatchFallbackError(error) {
        return error?.code === "AUTO_BATCH_PARSE_FAILED";
    },

    extractJsonPayload(text) {
        const value = String(text || "").trim();
        try {
            JSON.parse(value);
            return value;
        }
        catch {
        }

        const fenced = value.match(/^(`{3,})(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n\1$/i);
        if (fenced) {
            const payload = fenced[2].trim();
            try {
                JSON.parse(payload);
                return payload;
            }
            catch {
            }
        }
        return this.findFirstJsonPayload(value) || value;
    },

    findFirstJsonPayload(source, startIndex = 0) {
        const text = String(source || "");
        for (let start = Math.max(0, Number(startIndex) || 0); start < text.length; start++) {
            const open = text[start];
            if (open !== "{" && open !== "[") continue;

            const stack = [];
            let inString = false;
            let escaped = false;
            for (let index = start; index < text.length; index++) {
                const char = text[index];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (char === "\\") escaped = true;
                    else if (char === "\"") inString = false;
                    continue;
                }

                if (char === "\"") {
                    inString = true;
                    continue;
                }
                if (char === "{" || char === "[") {
                    stack.push(char === "{" ? "}" : "]");
                    continue;
                }
                if (char !== "}" && char !== "]") continue;
                if (stack.pop() !== char) break;
                if (stack.length !== 0) continue;

                const candidate = text.slice(start, index + 1);
                try {
                    JSON.parse(candidate);
                    return candidate;
                }
                catch {
                    break;
                }
            }
        }

        return "";
    },

    findJsonPayloads(source) {
        const text = String(source || "");
        const payloads = [];
        let cursor = 0;
        while (cursor < text.length) {
            const found = this.findFirstJsonPayload(text, cursor);
            if (!found) break;
            const pos = text.indexOf(found, cursor);
            if (pos < 0) break;
            payloads.push(found);
            cursor = pos + found.length;
        }
        return payloads;
    },

    getManualForceTargetTranslationOptions(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.plugin.isLocalAutoTranslationOptions(options);
        return {
            ...options,
            mode: "manual-force-target",
            promptPolicyVersion: this.getPromptPolicyVersion("manualForceTarget"),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.getPromptPolicyVersion("manualForceTarget"),
                localCompactPrompt: isLocalProvider,
                prompt: this.buildPromptPolicyManualForceTargetPrompt(sourceText, badOutput, invalidReason, options)
            }
        };
    },

    getManualRepairTranslationOptions(sourceText, badOutput = "", invalidReason = "", options = this.getManualTranslationRequestOptions()) {
        const targetLanguageValue = this.plugin.getAutoTranslationTargetLanguage(options);
        const targetLanguage = this.plugin.getAutoTranslationTargetInstruction(targetLanguageValue);
        const isLocalProvider = this.plugin.isLocalAutoTranslationOptions(options);
        return {
            ...options,
            mode: "manual-repair",
            promptPolicyVersion: this.getPromptPolicyVersion("manualRepair"),
            targetLanguage: targetLanguageValue,
            providerKey: this.plugin.getAutoTranslationProviderKey(options),
            configOverrides: {
                ...this.plugin.getAutoTranslationRequestSnapshot(options),
                sourceLanguage: AUTO_LANGUAGE_VALUE,
                targetLanguage,
                temperature: 0,
                enableThinking: false,
                promptPolicyVersion: this.getPromptPolicyVersion("manualRepair"),
                localCompactPrompt: isLocalProvider,
                prompt: this.buildPromptPolicyManualRepairPrompt(sourceText, badOutput, invalidReason, options)
            }
        };
    },

    getChineseLanguageInstruction(language) {
        const target = this.plugin.normalizeLanguageName(language);
        if (target === "繁體中文") return "Traditional Chinese (繁體中文, zh-TW). Use Traditional Chinese characters only; do not use Simplified Chinese.";
        if (["汉语", "中文", "Chinese"].includes(target)) return "Simplified Chinese (中文, zh-CN). Use Simplified Chinese characters unless preserving exact names, URLs, code, or quoted text.";
        return "";
    },

    isTargetLanguageWithPreservedSourceTerms(text, targetLanguage, sourceText = "") {
        if (!String(sourceText || "").trim()) return false;
        const chunks = this.getSentenceLikeChunks(text)
            .filter(chunk => this.hasLetters(chunk) && !this.isLikelyPreservedTokenLine(chunk));
        if (!chunks.length) return false;
        return chunks.every(chunk => this.isTargetLanguageLineWithPreservedSourceTerms(chunk, targetLanguage, sourceText));
    },

    isTargetLanguageLineWithPreservedSourceTerms(line, targetLanguage, sourceText = "") {
        if (!String(sourceText || "").trim()) return false;
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "latin" || targetScript === "unknown") return false;

        const segments = this.getLanguageScriptSegments(line);
        const targetLetters = segments
            .filter(segment => segment.script === targetScript)
            .reduce((total, segment) => total + segment.text.replace(/[^\p{L}]/gu, "").length, 0);
        if (targetLetters <= 0) return false;

        const foreignSegments = segments
            .filter(segment => segment.script !== targetScript && !(targetScript === "kana" && segment.script === "han"))
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!foreignSegments.length) return false;
        if (foreignSegments.some(segment => segment.script !== "latin")) return false;

        return foreignSegments.every(segment => this.isPreservableSourceLatinSegment(segment.text, sourceText));
    },

    isPreservableSourceLatinSegment(segmentText, sourceText) {
        const words = String(segmentText || "").match(/\p{Script=Latin}[\p{Script=Latin}0-9+_.-]*/gu) || [];
        if (!words.length || words.length > 5) return false;
        const normalizedSegment = this.normalizeComparableLatinText(segmentText);
        const normalizedSource = this.normalizeComparableLatinText(sourceText);
        if (!normalizedSegment || !this.isComparableLatinSegmentInSource(normalizedSegment, normalizedSource)) return false;

        const meaningfulWords = words.filter(word => this.hasLetters(word));
        if (!meaningfulWords.length) return false;
        if (meaningfulWords.every(word => this.isBenignEmbeddedLatinToken(word))) return true;
        if (meaningfulWords.every(word => this.isCommonResidualEnglishWord(word))) return false;

        const hasNamedShape = meaningfulWords.some(word => this.isNamedLatinTermShape(word));
        const hasPlanOrTechSuffix = meaningfulWords.some(word => this.isPlanOrTechLatinSuffix(word));
        const commonResidualWords = meaningfulWords.filter(word => this.isCommonResidualEnglishWord(word));
        if (commonResidualWords.length) {
            if (!hasNamedShape) return false;
            if (!commonResidualWords.every(word => this.isResidualEnglishNameConnectorWord(word))) return false;
        }
        const hasUnknownNameWord = meaningfulWords.some(word => {
            const normalized = this.normalizeLatinWord(word);
            return normalized.length >= 3
                && !this.isCommonResidualEnglishWord(word)
                && !this.isBenignEmbeddedLatinToken(word)
                && !this.isPlanOrTechLatinSuffix(word);
        });

        return hasNamedShape || (hasPlanOrTechSuffix && hasUnknownNameWord);
    },

    isResidualEnglishNameConnectorWord(word) {
        const normalized = this.normalizeLatinWord(word);
        const connectors = new Set(["the", "of", "and", "for", "in"]);
        return connectors.has(normalized);
    },

    isLikelyResidualSourceLatinWord(word, sourceText) {
        const normalized = this.normalizeLatinWord(word);
        if (normalized.length < 3) return false;
        if (this.isBenignEmbeddedLatinToken(word)) return false;
        if (this.isNamedLatinTermShape(word) || this.isPlanOrTechLatinSuffix(word)) return false;
        const sourceTokens = this.normalizeComparableLatinText(sourceText).split(/\s+/).filter(Boolean);
        if (!sourceTokens.includes(normalized)) return false;
        if (this.isCommonResidualEnglishWord(word)) return true;
        return this.isResidualEnglishActionOrDomainWord(word);
    },

    isResidualEnglishActionOrDomainWord(word) {
        const normalized = this.normalizeLatinWord(word);
        const residual = new Set([
            "account", "access", "bank", "button", "card", "contact", "failed", "failing",
            "fails", "failure", "login", "order", "payment", "problem", "refresh", "response",
            "retry", "risk", "scan", "screenshot", "server", "status", "transfer", "verify",
            "verified", "verification"
        ]);
        return residual.has(normalized)
            || /(?:ing|ed|tion|ment|ance|ence|able|ible|less|ful)$/i.test(normalized);
    },

    isComparableLatinSegmentInSource(normalizedSegment, normalizedSource) {
        if (!normalizedSegment || !normalizedSource) return false;
        if (normalizedSource.includes(normalizedSegment)) return true;
        const sourceTokens = new Set(normalizedSource.split(/\s+/).filter(Boolean));
        const segmentTokens = normalizedSegment.split(/\s+/).filter(Boolean);
        if (!segmentTokens.length) return false;
        return segmentTokens.every(token => sourceTokens.has(token));
    },

    normalizeComparableLatinText(text) {
        return String(text || "")
            .toLocaleLowerCase()
            .replace(/[^\p{Script=Latin}0-9+_.-]+/gu, " ")
            .replace(/\s+/g, " ")
            .trim();
    },

    normalizeLatinWord(word) {
        return String(word || "")
            .trim()
            .toLocaleLowerCase()
            .replace(/^[^\p{Script=Latin}0-9]+|[^\p{Script=Latin}0-9]+$/gu, "");
    },

    isNamedLatinTermShape(word) {
        const value = String(word || "").trim();
        const normalized = this.normalizeLatinWord(value);
        if (!normalized || this.isCommonResidualEnglishWord(value)) return false;
        if (/[0-9]/.test(value)) return true;
        if (/[a-z][A-Z]/.test(value)) return true;
        if (/^[A-Z]{2,}$/.test(value)) return true;
        if (/^[A-Z][a-z0-9+_.-]{2,}$/.test(value)) return true;
        return false;
    },

    isPlanOrTechLatinSuffix(word) {
        const normalized = this.normalizeLatinWord(word);
        const suffixes = new Set([
            "pro", "plus", "max", "ultra", "lite", "mini", "premium", "enterprise", "business",
            "cloud", "pay", "wallet", "code", "ai", "api", "beta", "alpha", "dev", "studio"
        ]);
        return suffixes.has(normalized);
    },

    isCommonResidualEnglishWord(word) {
        const normalized = this.normalizeLatinWord(word);
        const common = new Set([
            "a", "an", "the", "i", "me", "my", "you", "your", "he", "she", "it", "we", "they",
            "is", "are", "am", "was", "were", "be", "been", "being", "have", "has", "had",
            "do", "does", "did", "can", "could", "will", "would", "should", "may", "might",
            "to", "of", "in", "on", "at", "for", "from", "with", "without", "and", "or", "but",
            "if", "then", "than", "as", "not", "no", "yes", "now", "before", "after", "earlier",
            "this", "that", "these", "those", "there", "here", "what", "when", "where", "why", "how",
            "please", "help", "use", "using", "used", "get", "getting", "got", "make", "made",
            "like", "access", "problem", "message", "text", "chat", "channel", "payment", "scan",
            "send", "sent", "receive", "received", "need", "want", "try", "again"
        ]);
        return common.has(normalized);
    },

    isLikelyPreservedTokenLine(text) {
        const value = String(text || "").trim();
        if (!value || /\s/.test(value)) return false;
        if (/^https?:\/\//i.test(value) || /^www\./i.test(value) || /^<[@#&!]\d+>$/.test(value)) return true;
        const compact = value.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, "");
        if (!compact || /\s/.test(compact)) return false;
        if (/[a-z][A-Z]/.test(compact)
            || /[0-9_:/#@+.]/.test(compact)
            || (/[A-Z]/.test(compact) && compact === compact.toUpperCase() && compact.length > 1)) return true;
        if (/^[\p{L}]+(?:[-'’][\p{L}]+)*$/u.test(compact)) return false;
        if (!/^[\p{L}\p{N}._:/#@+-]+$/u.test(compact)) return false;
        return true;
    },

    hasDominantForeignLine(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        const lines = String(text || "")
            .split(/\n+/)
            .map(line => line.trim())
            .filter(line => this.hasLetters(line) && !this.isLikelyPreservedTokenLine(line));
        if (!lines.length) return false;

        return lines.some(line => this.isDominantForeignText(line, targetScript));
    },

    isDominantForeignText(text, targetScript) {
        const counts = this.countTextScriptsForValidation(text);
        const targetCount = counts[targetScript] || 0;
        const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul", "other"]
            .filter(script => script !== targetScript);
        const foreignCount = foreignScripts.reduce((total, script) => total + (counts[script] || 0), 0);
        if (foreignCount <= 0 || foreignCount <= targetCount) return false;

        const firstScript = this.getFirstLetterScript(text);
        if (firstScript === targetScript) return false;
        if (firstScript === "latin") {
            const words = this.getMeaningfulLatinWords(text);
            if (words.length >= 2) return true;
            return words.join("").length >= 7;
        }
        return foreignCount >= 2;
    },

    isTargetLanguageLeadWithShortEmbeddedForeignText(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        if (targetScript === "latin") return false;
        const chunks = this.getSentenceLikeChunks(text)
            .filter(chunk => this.hasLetters(chunk) && !this.isLikelyPreservedTokenLine(chunk));
        if (!chunks.length) return false;

        return chunks.every(chunk => {
            if (!this.chunkStartsWithTargetScript(chunk, targetScript)) return false;
            const counts = this.countTextScriptsForValidation(chunk);
            const targetCount = counts[targetScript] || 0;
            if (targetCount < 4) return false;
            const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul", "other"]
                .filter(script => script !== targetScript && (counts[script] || 0) > 0);
            if (!foreignScripts.length) return true;
            if (foreignScripts.some(script => script !== "latin")) return false;
            const foreignWords = this.getForeignMeaningfulWordsForScript(chunk, targetScript);
            return foreignWords.length > 0
                && foreignWords.length <= 4
                && foreignWords.every(word => this.isBenignEmbeddedLatinToken(word));
        });
    },

    isTargetLanguageDominantBySentence(text, targetLanguage, options = {}) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;

        const chunks = this.getSentenceLikeChunks(text)
            .filter(chunk => this.hasLetters(chunk) && !this.isLikelyPreservedTokenLine(chunk));
        if (!chunks.length) return false;

        let targetDominantCount = 0;
        for (const chunk of chunks) {
            if (this.isTargetLanguageDominantChunk(chunk, targetScript, options)) {
                targetDominantCount++;
                continue;
            }
            return false;
        }

        return targetDominantCount > 0 && targetDominantCount === chunks.length;
    },

    getSentenceLikeChunks(text) {
        return String(text || "")
            .split(/[\n\r\u3002\uff01\uff1f!?\uff1b;]+|(?<=[.!?])\s+/u)
            .map(chunk => chunk.trim())
            .filter(Boolean);
    },

    isTargetLanguageDominantChunk(text, targetScript, options = {}) {
        const startsTarget = this.chunkStartsWithTargetScript(text, targetScript)
            || (targetScript === "kana" && this.getFirstLetterScript(text) === "han");
        const counts = this.countTextScriptsForValidation(text);
        const japaneseHasKana = targetScript === "kana" && (counts.kana || 0) > 0;
        const targetCount = japaneseHasKana
            ? (counts.kana || 0) + (counts.han || 0)
            : (counts[targetScript] || 0);
        if (targetCount < 2) return false;
        const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul", "other"]
            .filter(script => script !== targetScript && !(japaneseHasKana && script === "han") && (counts[script] || 0) > 0);
        if (foreignScripts.some(script => script !== "latin")) return false;
        const foreignCount = foreignScripts.reduce((total, script) => total + (counts[script] || 0), 0);
        if (foreignCount <= 0) return options?.allowPureTarget === true && targetScript !== "latin";
        const foreignWords = this.getForeignMeaningfulWordsForScript(text, targetScript);
        if (foreignWords.length && foreignWords.every(word => this.isBenignEmbeddedLatinToken(word))) return true;
        if (!startsTarget) return targetCount >= 6 && targetCount >= foreignCount && foreignWords.length <= 2;
        return targetCount >= 6 && targetCount >= foreignCount && foreignWords.length <= 4;
    },

    chunkStartsWithTargetScript(text, targetScript) {
        return this.getFirstLetterScript(text) === targetScript;
    },

    getFirstLetterScript(text) {
        for (const char of String(text || "")) {
            if (!/\p{L}/u.test(char)) continue;
            return this.getCharacterScript(char);
        }
        return "";
    },

    getForeignMeaningfulWordsForScript(text, targetScript) {
        return this.getLanguageScriptSegments(text)
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text))
            .flatMap(segment => segment.script === "latin"
                ? this.getMeaningfulLatinWords(segment.text)
                : [segment.text.replace(/[^\p{L}]/gu, "")].filter(Boolean));
    },

    isTargetLanguageWithBenignEmbeddedForeignTokens(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;

        const segments = this.getLanguageScriptSegments(text);
        const targetLetterCount = segments
            .filter(segment => segment.script === targetScript)
            .reduce((total, segment) => total + segment.text.replace(/[^\p{L}]/gu, "").length, 0);
        if (targetLetterCount <= 0) return false;

        const foreignSegments = segments
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!foreignSegments.length) return false;
        if (foreignSegments.some(segment => segment.script !== "latin")) return false;

        const words = foreignSegments.flatMap(segment => this.getMeaningfulLatinWords(segment.text));
        if (!words.length) return false;
        return words.every(word => this.isBenignEmbeddedLatinToken(word));
    },

    hasTranslatableForeignSegment(text, targetLanguage) {
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        if (this.isTargetLanguageDominantBySentence(text, targetLanguage)) return false;

        const value = String(text || "");
        const segments = this.getLanguageScriptSegments(value)
            .filter(segment => segment.script !== targetScript)
            .filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!segments.length) return false;

        return segments.some(segment => {
            const letters = segment.text.replace(/[^\p{L}]/gu, "");
            if (segment.script === "latin") {
                const meaningfulWords = this.getMeaningfulLatinWords(segment.text);
                const meaningfulLetters = meaningfulWords.join("").replace(/[^\p{L}]/gu, "");
                if (meaningfulWords.length >= 2) return true;
                return meaningfulLetters.length >= 8;
            }
            if (["cyrillic", "arabic", "devanagari", "hangul", "kana"].includes(segment.script)) {
                return letters.length >= 2;
            }
            return letters.length >= 4;
        });
    },

    getLanguageScriptSegments(text) {
        const segments = [];
        let currentScript = "";
        let currentText = "";
        const flush = () => {
            const trimmed = currentText.trim();
            if (currentScript && trimmed) segments.push({ script: currentScript, text: trimmed });
            currentScript = "";
            currentText = "";
        };

        for (const char of String(text || "")) {
            const script = this.getCharacterScript(char);
            if (!script) {
                if (currentText) currentText += char;
                continue;
            }
            if (currentScript && script !== currentScript) flush();
            currentScript = script;
            currentText += char;
        }
        flush();
        return segments;
    },

    isLikelyPreservedForeignSegment(text) {
        const value = String(text || "").trim();
        if (!value) return false;
        if (this.isLikelyPreservedTokenLine(value)) return true;
        const tokens = value.match(/[\p{L}\p{N}_:/#@+.-]+/gu) || [];
        const letterTokens = tokens.filter(token => this.hasLetters(token));
        if (!letterTokens.length) return false;
        return letterTokens.every(token => this.isLikelyPreservedTokenLine(token));
    },

    getMeaningfulLatinWords(text) {
        const words = String(text || "").match(/\p{Script=Latin}{2,}/gu) || [];
        return words.filter(word => !this.isLikelyPreservedTokenLine(word));
    },

    isBenignEmbeddedLatinToken(word) {
        const normalized = String(word || "")
            .trim()
            .toLocaleLowerCase()
            .replace(/(?:['’]s|['’]+)$/u, "");
        if (!normalized) return false;
        const benign = new Set([
            "ai", "api", "app", "apps", "agent", "agents", "bot", "branch", "bug", "bugs", "build", "cache", "cdn", "cli",
            "client", "code", "commit", "crash", "css", "db", "debug", "dev", "discord", "dns", "dom", "error",
            "feature", "fetch", "flag", "fix", "fixed", "frontend", "gemini", "git", "github", "google", "gpt", "gpu",
            "grok", "hf", "html", "http", "https", "huggingface", "id", "input", "ios", "ip", "issue", "json", "js",
            "latency", "link", "linux", "llm", "log", "mac", "mcp", "merge", "message", "model", "node", "npm",
            "ok", "okay", "ollama", "openai", "output", "plugin", "pr", "prompt", "provider", "react",
            "proxy", "queue", "render", "repo", "request", "response", "retry", "scroll", "server", "status",
            "sakura", "sure", "team", "test", "tests", "timeout", "token", "ts", "typescript", "ui", "url", "ux",
            "version", "viewport", "vite", "vpn", "web", "webhook", "windows", "workflow",
            "anthropic", "baidu", "chatgpt", "claude", "cline", "connector", "connectors", "crassus", "cursor",
            "dashboard", "deepseek", "flash", "glm", "interface", "kimi", "market", "minimax", "moonshot",
            "multiagent", "nvidia", "opencode", "perplexity", "qwen", "reasoning", "sonar", "stack", "stackai",
            "upgrade", "workflow", "workflows", "zhipu"
        ]);
        return benign.has(normalized);
    },

    countTextScriptsForValidation(text) {
        const counts = {
            han: 0,
            latin: 0,
            cyrillic: 0,
            arabic: 0,
            devanagari: 0,
            kana: 0,
            hangul: 0,
            other: 0,
            total: 0
        };

        for (const segment of this.getLanguageScriptSegments(text)) {
            if (this.isLikelyPreservedForeignSegment(segment.text)) continue;
            const segmentText = segment.script === "latin"
                ? this.getMeaningfulLatinWords(segment.text).join(" ")
                : segment.text;
            for (const char of segmentText) {
                const script = this.getCharacterScript(char);
                if (!script) continue;
                counts[script]++;
                counts.total++;
            }
        }

        return counts;
    },

    isLikelyTargetLanguageWithPreservedTokens(text, targetLanguage) {
        if (this.isLikelyTargetLanguage(text, targetLanguage)) return true;
        const targetScript = this.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return false;
        const segments = this.getLanguageScriptSegments(text);
        const hasPreservedSegment = segments.some(segment => this.isLikelyPreservedForeignSegment(segment.text));
        if (!hasPreservedSegment) return false;
        const meaningful = segments.filter(segment => !this.isLikelyPreservedForeignSegment(segment.text));
        if (!meaningful.length) return false;
        if (meaningful.some(segment => segment.script !== targetScript)) return false;
        return meaningful.some(segment => segment.text.replace(/[^\p{L}]/gu, "").length > 0);
    },

    isCommonTargetShortText(text, targetLanguage) {
        const target = this.plugin.normalizeLanguageName(targetLanguage);
        if (!["英语", "English"].includes(target)) return false;
        // "thanks 🙏" is as common a reply as "thanks": emoji do not count.
        const normalized = removeStandardEmoji(text).trim().toLocaleLowerCase();
        if (!/^[a-z0-9\s'’.,!?-]+$/.test(normalized)) return false;
        const compact = normalized.replace(/[^\w'’]+/g, " ").trim();
        const common = new Set(["hi", "hello", "hey", "ok", "okay", "yes", "no", "thanks", "thank you", "lol", "bro", "same", "sure", "done", "nice", "good", "bad", "why", "what"]);
        return common.has(compact);
    },

    isLikelyJapaneseHanText(text) {
        const compact = String(text || "").replace(/[^\p{Script=Han}]/gu, "");
        if (compact.length < 2) return false;
        const exactPhrases = new Set([
            "\u5927\u4e08\u592b", "\u7121\u6599", "\u767b\u9332", "\u672c\u5f53", "\u672c\u7576",
            "\u4eca\u65e5", "\u660e\u65e5", "\u6628\u65e5", "\u4e86\u89e3"
        ]);
        if (exactPhrases.has(compact)) return true;
        const primarySignals = ["\u7121\u6599", "\u767b\u9332", "\u5927\u4e08\u592b", "\u5bfe\u5fdc", "\u5c02\u9580"];
        if (primarySignals.some(signal => compact.includes(signal))) return true;
        const secondarySignals = ["\u5fc5\u8981", "\u78ba\u8a8d", "\u6700\u9ad8", "\u5834\u5408", "\u4e86\u89e3"];
        return secondarySignals.filter(signal => compact.includes(signal)).length >= 2;
    },

    hasLetters(text) {
        return /\p{L}/u.test(String(text || ""));
    },

    isLikelyTargetLanguage(text, targetLanguage) {
        const target = this.plugin.normalizeLanguageName(targetLanguage);
        if (this.plugin.isTraditionalChineseTarget(target)) {
            if (this.isMostlyJapanese(text)) return false;
            if (this.isLikelyJapaneseHanPhrase(text)) return false;
            return this.isMostlyScript(text, "han") && !this.plugin.hasLikelySimplifiedHan(text);
        }
        if (["汉语", "中文", "Chinese"].includes(target)) {
            if (this.isMostlyJapanese(text)) return false;
            if (this.isLikelyJapaneseHanPhrase(text)) return false;
            return this.isMostlyScript(text, "han");
        }
        if (["俄语", "Russian"].includes(target)) return this.isMostlyScript(text, "cyrillic");
        if (["阿拉伯语", "Arabic"].includes(target)) return this.isMostlyScript(text, "arabic");
        if (["印地语", "Hindi"].includes(target)) return this.isMostlyScript(text, "devanagari");
        if (["朝鲜语", "韩语", "Korean"].includes(target)) return this.isMostlyScript(text, "hangul");
        if (["日语", "Japanese"].includes(target)) return this.isMostlyJapanese(text);
        if (["英语", "English"].includes(target)) return this.looksLikeLatinLanguage(text, "english");
        if (["西班牙语", "Spanish"].includes(target)) return this.looksLikeLatinLanguage(text, "spanish");
        if (["法语", "French"].includes(target)) return this.looksLikeLatinLanguage(text, "french");
        if (["德语", "German"].includes(target)) return this.looksLikeLatinLanguage(text, "german");
        if (["意大利语", "Italian"].includes(target)) return this.looksLikeLatinLanguage(text, "italian");
        if (["葡萄牙语", "Portuguese", "Português", "pt", "pt-BR", "pt-PT"].includes(target)) return this.looksLikeLatinLanguage(text, "portuguese");
        if (["越南语", "Vietnamese"].includes(target)) return this.looksLikeLatinLanguage(text, "vietnamese");
        return false;
    },

    getTargetLanguageScript(targetLanguage) {
        const target = this.plugin.normalizeLanguageName(targetLanguage);
        if (this.plugin.isTraditionalChineseTarget(target)) return "han";
        if (["汉语", "中文", "Chinese"].includes(target)) return "han";
        if (["俄语", "Russian"].includes(target)) return "cyrillic";
        if (["阿拉伯语", "Arabic"].includes(target)) return "arabic";
        if (["印地语", "Hindi"].includes(target)) return "devanagari";
        if (["朝鲜语", "韩语", "Korean"].includes(target)) return "hangul";
        if (["日语", "Japanese"].includes(target)) return "kana";
        if (["英语", "English", "西班牙语", "Spanish", "法语", "French", "德语", "German", "意大利语", "Italian", "葡萄牙语", "Portuguese", "Português", "pt", "pt-BR", "pt-PT", "越南语", "Vietnamese"].includes(target)) return "latin";
        return "unknown";
    },

    isMostlyJapanese(text) {
        const counts = this.countTextScripts(text);
        const total = Math.max(1, counts.total);
        return counts.kana >= 2 || (counts.kana >= 1 && counts.han >= 1) || (counts.kana + counts.han >= 4 && counts.kana / total >= 0.12);
    },

    isLikelyJapaneseHanPhrase(text) {
        return this.isLikelyJapaneseHanText(text);
    },

    isMostlyScript(text, script) {
        const counts = this.countTextScripts(text);
        const total = Math.max(1, counts.total);
        return counts[script] >= 1 && counts[script] / total >= 0.45;
    },

    getCharacterScript(char) {
        const sample = String(char || "");
        const code = sample.codePointAt(0);
        if (!Number.isFinite(code)) return "";
        if ((code >= 0x3400 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0x20000 && /\p{Script=Han}/u.test(sample))) return "han";
        if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x31f0 && code <= 0x31ff) || (code >= 0xff66 && code <= 0xff9f)) return "kana";
        if (code >= 0xac00 && code <= 0xd7af) return "hangul";
        if (code >= 0x0400 && code <= 0x04ff) return "cyrillic";
        if ((code >= 0x0600 && code <= 0x06ff) || (code >= 0x0750 && code <= 0x077f)) return "arabic";
        if (code >= 0x0900 && code <= 0x097f) return "devanagari";
        if ((code >= 0x0041 && code <= 0x005a)
            || (code >= 0x0061 && code <= 0x007a)
            || (code >= 0x00c0 && code <= 0x024f)
            || (code >= 0x1e00 && code <= 0x1eff)
            || /\p{Script=Latin}/u.test(sample)) return "latin";
        if (/\p{L}/u.test(sample)) return "other";
        return "";
    },

    countTextScripts(text) {
        const counts = {
            han: 0,
            latin: 0,
            cyrillic: 0,
            arabic: 0,
            devanagari: 0,
            kana: 0,
            hangul: 0,
            other: 0,
            total: 0
        };

        for (const char of String(text || "")) {
            const script = this.getCharacterScript(char);
            if (!script) continue;
            counts[script]++;
            counts.total++;
        }

        return counts;
    },

    looksLikeLatinLanguage(text, language) {
        const counts = this.countTextScripts(text);
        if (counts.latin < 2) return false;
        if (counts.cyrillic || counts.arabic || counts.devanagari || counts.han || counts.kana || counts.hangul) return false;

        const normalized = String(text || "").toLocaleLowerCase();
        const words = normalized.match(/\p{Script=Latin}+/gu) || [];
        const joined = ` ${words.join(" ")} `;
        const dictionaries = {
            english: [
                " the ", " and ", " are ", " you ", " can ", " help ", " me ", " with ", " this ", " that ",
                " what ", " have ", " been ", " for ", " to ", " is ", " in ", " of ", " hello ", " hi ",
                " hey ", " bro ", " thanks ", " thank ", " okay ", " ok ", " lately ", " up ", " i ", " we ",
                " they ", " he ", " she ", " it ", " my ", " your ", " our ", " not ", " do ", " does ",
                " did ", " don ", " doesn ", " didn ", " will ", " won ", " would ", " could ", " should ",
                " ll ", " ve ", " re ", " am ", " was ", " were ", " be ", " has ", " had ", " on ", " at ",
                " by ", " from ", " as ", " out ", " all ", " just ", " now ", " see ", " get ", " got ",
                " good ", " great ", " no ", " yes ", " please ", " sorry ", " today ", " tomorrow ",
                " tonight ", " morning ", " afternoon ", " evening ", " night ", " let ", " want ", " need ",
                " there ", " here ", " right ", " problem ", " time ", " moved ", " meeting ",
                " chance ", " work ", " job ", " nice ", " sure ", " fine ", " done ", " well ", " soon ",
                " bye ", " goodbye ", " welcome ", " friend "
            ],
            spanish: [
                " el ", " la ", " los ", " las ", " que ", " de ", " y ", " en ", " un ", " una ",
                " para ", " con ", " por ", " es ", " estoy ", " hola ", " amigo ", " canal ", " soporte ", " gratis ",
                " gracias ", " muchas ", " mucho ", " muy ", " buen ", " bueno ", " buenos ", " buena ", " buenas ",
                " trabajo ", " hasta ", " luego ", " pronto ", " mañana ", " todo ", " todos ", " bien ", " claro ",
                " vamos ", " vale ", " entendido ", " acuerdo ", " perfecto ", " genial ", " nada ", " favor ",
                " perdón ", " disculpa ", " días ", " tardes ", " noches ", " sí ", " como ", " cómo ", " está ", " están "
            ],
            french: [
                " le ", " la ", " les ", " des ", " est ", " pour ", " avec ", " que ", " une ", " vous ",
                " dans ", " pas ", " je ", " de ", " bonjour ", " salut ", " merci ",
                " travail ", " bon ", " bonne ", " bonnes ", " bons ", " tout ", " tous ", " bien ", " très ",
                " beaucoup ", " chance ", " oui ", " non ", " mon ", " ami ", " mais ", " sur ", " sont ",
                " fait ", " accord ", " compris ", " parfait ", " super ", " bientôt ", " demain ",
                " soir ", " journée ", " soirée ", " revoir ", " désolé ", " pardon "
            ],
            german: [
                " der ", " die ", " das ", " und ", " ist ", " nicht ", " mit ", " für ", " ich ", " zu ",
                " ein ", " eine ", " auf ", " danke ", " hallo ",
                " klar ", " alles ", " arbeit ", " gut ", " gute ", " guten ", " guter ", " gutes ",
                " bis ", " bald ", " morgen ", " abend ", " nacht ", " tag ", " vielen ", " dank ",
                " bitte ", " schön ", " sehr ", " ja ", " nein ", " wir ", " sie ", " du ", " ihr ",
                " sind ", " wird ", " haben ", " verstanden ", " super ", " perfekt ", " tschüss ", " wiedersehen "
            ],
            italian: [
                " il ", " lo ", " la ", " gli ", " le ", " che ", " di ", " e ", " per ", " con ",
                " non ", " una ", " sono ", " ciao ", " grazie ",
                " bene ", " buon ", " buono ", " buona ", " buoni ", " buone ", " lavoro ", " tutto ", " tutti ",
                " molto ", " mille ", " presto ", " domani ", " giorno ", " buongiorno ", " buonasera ", " buonanotte ",
                " arrivederci ", " prego ", " scusa ", " certo ", " chiaro ", " capito ", " perfetto ", " ottimo ",
                " siamo ", " anche "
            ],
            portuguese: [
                " o ", " a ", " os ", " as ", " um ", " uma ", " de ", " do ", " da ", " em ", " no ", " na ",
                " para ", " com ", " por ", " não ", " sim ", " mais ", " muito ", " obrigado ", " obrigada ",
                " bom ", " boa ", " bons ", " boas ", " trabalho ", " tudo ", " bem ", " claro ", " até ", " logo ",
                " amanhã ", " olá ", " oi ", " tchau ", " valeu ", " entendido ", " perfeito "
            ],
            vietnamese: [
                " và ", " của ", " không ", " một ", " là ", " tôi ", " bạn ", " trong ", " cho ", " với ",
                " chào ", " cảm ", " ơn ", " nhiều ", " tốt ", " lắm ", " rất ", " được ", " rồi ", " nhé ",
                " nha ", " vâng ", " dạ ", " xin ", " tạm ", " biệt ", " hẹn ", " gặp ", " lại ", " chúc ",
                " buổi ", " sáng ", " tối ", " ngon ", " việc "
            ]
        };
        const accentTests = {
            spanish: /[áéíóúñü¿¡]/i,
            french: /[àâçéèêëîïôûùüÿœæ]/i,
            german: /[äöüß]/i,
            italian: /[àèéìíîòóùú]/i,
            portuguese: /[áâãàçéêíóôõú]/i,
            vietnamese: /[ăâđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i
        };

        const targetTokens = new Set(dictionaries[language] || []);
        let score = 0;
        for (const token of targetTokens) {
            if (joined.includes(token)) score++;
        }
        if (accentTests[language]?.test(text)) score += 2;
        let maxForeignScore = 0;
        let hasForeignToken = false;
        let hasForeignAccent = false;
        Object.entries(dictionaries).forEach(([name, tokens]) => {
            if (name === language) return;
            let langScore = 0;
            for (const token of tokens) {
                if (targetTokens.has(token)) continue;
                if (joined.includes(token)) {
                    langScore++;
                    hasForeignToken = true;
                }
            }
            if (langScore > maxForeignScore) maxForeignScore = langScore;
            if (accentTests[name]?.test(text)) hasForeignAccent = true;
        });
        if (maxForeignScore >= 2 && maxForeignScore >= score) return false;
        if (language === "english") {
            if (score >= 2) return true;
            return score >= 1 && !hasForeignToken && !hasForeignAccent;
        }

        return score >= 1;
    }
};

const PROMPT_POLICY_METHOD_NAMES = attachControllerMethods(PromptPolicyController, [methods]);

module.exports = {
    PromptPolicyController,
    PROMPT_POLICY_METHOD_NAMES
};
