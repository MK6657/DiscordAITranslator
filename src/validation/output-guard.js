"use strict";

// Phase 5a of the modularization plan: model-output validation (emoji tokens, leakage/refusal/dictionary/labeled shapes, Chinese script checks, low-information text).
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
class OutputGuard {
    constructor(plugin) {
        this.plugin = plugin;
    }

    getLongAutoTranslationChunkFailurePlaceholder(index = 0, total = 1, error = null, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const type = this.plugin.getAutoTranslationFailureType(error) || "failed";
        if (this.plugin.getTargetLanguageScript(targetLanguage) === "han") {
            return `[\u7b2c ${index + 1}/${Math.max(1, total)} \u6bb5\u7ffb\u8bd1\u5931\u8d25\uff1a${type}\uff0c\u53ef\u91cd\u8bd5\u6574\u6761\u6d88\u606f]`;
        }
        return `[Chunk ${index + 1}/${Math.max(1, total)} translation failed: ${type}. Retry this message.]`;
    }

    hasLongAutoTranslationChunkFailurePlaceholder(text) {
        return /\[(?:Chunk\s+\d+\/\d+\s+translation failed|\u7b2c\s+\d+\/\d+\s+\u6bb5\u7ffb\u8bd1\u5931\u8d25)/i.test(String(text || ""));
    }

    sanitizeAutoTranslationOutput(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}) {
        const raw = String(translatedText || "").trim();
        if (!raw) return raw;
        const candidates = this.plugin.extractAutoTranslationOutputCandidates(raw, {
            includeQuoted: !this.plugin.shouldSkipQuotedAutoTranslationCandidates(sourceText, raw, options)
        });
        for (const candidate of candidates) {
            const value = String(candidate || "").trim();
            if (!value || value === raw) continue;
            const invalidReason = this.plugin.getAutoTranslationInvalidOutputReason(sourceText, value, targetLanguage, {
                ...options,
                skipCandidateExtraction: true
            });
            if (!invalidReason) {
                this.plugin.logDiagnostic("auto.output", "candidate", {
                    sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                    rawLength: raw.length,
                    candidateLength: value.length
                });
                return value;
            }
        }
        return raw;
    }

    extractAutoTranslationOutputCandidates(text, options = {}) {
        const raw = String(text || "").trim();
        const candidates = [raw];
        const push = value => {
            const candidate = String(value || "").trim();
            if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
        };

        const fenced = raw.match(/^```[A-Za-z0-9_-]*\s*([\s\S]*?)\s*```$/);
        if (fenced) push(fenced[1]);

        const labeled = raw.match(/^(?:(?:translation|translated text|translated_text|translated message|translated_message|translated-message|translatedMessage|result|answer|output|target|final)|(?:\u4ee5\u4e0b\u662f|\u8fd9\u662f).{0,8}(?:\u7ffb\u8bd1|\u8bd1\u6587)|(?:\u7ffb\u8bd1|\u8bd1\u6587|\u7ffb\u8bd1\u7ed3\u679c))\s*[:\uff1a]\s*([\s\S]+)$/i);
        if (labeled) push(labeled[1]);

        const wrapped = raw.match(/^<\s*(translation|translatedText|translated_text|translatedMessage|targetMessage|target_message|answer|output|result|response)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>$/i);
        if (wrapped) push(wrapped[2]);

        if (options?.includeQuoted !== false) {
            const quotedMatches = [...raw.matchAll(/["'\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f\u300a\u300b]([^"'\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f\u300a\u300b]{1,220})["'\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f\u300a\u300b]/g)];
            quotedMatches.forEach(match => {
                const rest = raw.slice(Number(match.index || 0) + String(match[0] || "").length);
                if (/^\s*:/.test(rest)) return;
                push(match[1]);
            });
        }

        try {
            const parsed = JSON.parse(raw);
            push(this.plugin.extractTranslationValue(parsed));
            if (Array.isArray(parsed)) {
                parsed.forEach(item => push(this.plugin.extractTranslationValue(item)));
            }
        }
        catch {}

        return candidates;
    }

    isInvalidAutoTranslationOutput(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        return Boolean(this.plugin.getAutoTranslationInvalidOutputReason(sourceText, translatedText, targetLanguage));
    }

    getDiscordEmojiTokenCounts(text) {
        const value = String(text || "");
        const counts = new Map();
        const pattern = /<a?:([A-Za-z0-9_]{1,64}):\d+>|:([A-Za-z0-9_]{1,64}):/g;
        let match = pattern.exec(value);
        while (match) {
            const name = match[1] || match[2] || "";
            if (name) counts.set(name, Number(counts.get(name) || 0) + 1);
            match = pattern.exec(value);
        }
        return counts;
    }

    hasDiscordEmojiTokenMismatch(sourceText, translatedText) {
        const sourceCounts = this.plugin.getDiscordEmojiTokenCounts(sourceText);
        const outputCounts = this.plugin.getDiscordEmojiTokenCounts(translatedText);
        if (sourceCounts.size !== outputCounts.size) return true;
        for (const [name, count] of sourceCounts) {
            if (Number(outputCounts.get(name) || 0) !== count) return true;
        }
        return false;
    }

    getAutoTranslationInvalidOutputReason(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}) {
        const output = String(translatedText || "").trim();
        if (!output) return "empty";
        if (this.plugin.hasLongAutoTranslationChunkFailurePlaceholder(output)) return "chunk-failure-placeholder";

        const source = String(sourceText || "").trim();
        if (!options?.skipCandidateExtraction) {
            const candidate = this.plugin.sanitizeAutoTranslationOutput(source, output, targetLanguage, {
                ...options,
                skipCandidateExtraction: true
            });
            if (candidate && candidate !== output) {
                return this.plugin.getAutoTranslationInvalidOutputReason(source, candidate, targetLanguage, {
                    ...options,
                    skipCandidateExtraction: true
                });
            }
        }
        const normalizedSource = source.replace(/\s+/g, " ").toLocaleLowerCase();
        const normalizedOutput = output.replace(/\s+/g, " ").toLocaleLowerCase();
        if (normalizedSource && normalizedSource === normalizedOutput
            && (this.plugin.shouldAutoTranslateText(source, targetLanguage) || this.plugin.isLowInformationRepeatedText(source))) {
            return "same-as-source";
        }
        if (this.plugin.hasDiscordEmojiTokenMismatch(source, output)) return "emoji-mismatch";
        if (this.plugin.hasPromptLeakageAutoTranslationOutput(source, output, targetLanguage)) return "prompt-leakage";
        if (this.plugin.hasRefusalAutoTranslationOutput(output)) return "refusal-output";
        if (this.plugin.hasDictionaryStyleAutoTranslationOutput(source, output, targetLanguage)) return "dictionary-output";
        if (this.plugin.hasExplanatoryAutoTranslationOutput(source, output)) return "explanatory-output";
        if (this.plugin.hasLabeledAutoTranslationOutput(output)) return "labeled-output";
        if (this.plugin.isTraditionalChineseTarget(targetLanguage) && this.plugin.hasLikelySimplifiedHan(output) && !this.plugin.isAcceptableChineseVariantMix(output, targetLanguage)) return "script-mismatch";
        if (this.plugin.isSimplifiedChineseTarget(targetLanguage) && this.plugin.hasLikelyTraditionalHan(output) && !this.plugin.isAcceptableChineseVariantMix(output, targetLanguage)) return "script-mismatch";
        if (this.plugin.isAcceptableTargetShortTranslation(output, targetLanguage, source)) return "";
        if (this.plugin.hasSuspiciousChineseAutoTranslationOutput(output, targetLanguage)) return "suspicious-chinese";
        if (this.plugin.isTargetLanguageDominantBySentence(output, targetLanguage, { allowPureTarget: true }) || this.plugin.isTargetLanguageWithPreservedSourceTerms(output, targetLanguage, source)) {
            if (!this.plugin.hasSuspiciousResidualAutoTranslationForeignText(source, output, targetLanguage)
                && (options?.partialLongText || options?.mergedLongText || !this.plugin.hasMissingAutoTranslationLines(source, output, targetLanguage, options))
                && (options?.partialLongText || !this.plugin.hasUndertranslatedAutoTranslationOutput(source, output, targetLanguage))) return "";
        }
        if (this.plugin.hasSuspiciousResidualAutoTranslationForeignText(source, output, targetLanguage)) return "residual-source";
        if (!options?.partialLongText && !options?.mergedLongText && this.plugin.hasMissingAutoTranslationLines(source, output, targetLanguage, options)) return "missing-lines";
        if (!options?.partialLongText && this.plugin.hasUndertranslatedAutoTranslationOutput(source, output, targetLanguage)) return "undertranslated";
        if (this.plugin.hasResidualAutoTranslationSourceText(output, targetLanguage, source)) return "residual-source";
        if (this.plugin.isLikelyTargetLanguage(output, targetLanguage)) return "";
        if (!this.plugin.hasLetters(output)) return this.plugin.hasLetters(source) ? "no-letters" : "";

        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return "";
        if (targetScript === "latin") return this.plugin.isLikelyTargetLanguage(output, targetLanguage) ? "" : "target-language";
        if (/^\p{L}$/u.test(output) && this.plugin.getCharacterScript(output) !== targetScript && this.plugin.shouldAutoTranslateText(source, targetLanguage)) return "wrong-script";

        const outputCounts = this.plugin.countTextScriptsForValidation(output);

        const foreignScripts = ["han", "latin", "cyrillic", "arabic", "devanagari", "kana", "hangul"]
            .filter(script => script !== targetScript);
        const foreignLetterCount = foreignScripts.reduce((total, script) => total + (outputCounts[script] || 0), 0);
        const targetLetterCount = outputCounts[targetScript] || 0;

        if (foreignLetterCount >= 1 && targetLetterCount === 0 && this.plugin.shouldAutoTranslateText(source, targetLanguage)) return "wrong-script";
        if (foreignLetterCount >= 2 && targetLetterCount === 0) return "wrong-script";
        if (targetLetterCount > 0) return foreignLetterCount / Math.max(1, outputCounts.total) > 0.65 ? "foreign-dominant" : "";

        return this.plugin.shouldAutoTranslateText(output, targetLanguage) ? "target-language" : "";
    }

    isAcceptableChineseVariantMix(text, targetLanguage) {
        if (this.plugin.getTargetLanguageScript(targetLanguage) !== "han") return true;
        const value = String(text || "");
        const hanCount = (value.match(/\p{Script=Han}/gu) || []).length;
        if (!hanCount) return true;
        const simplifiedCount = (value.match(/[\u56fd\u4f53\u53f0\u6c49\u8bed\u8bdd\u95e8\u95ee\u95f4\u89c1\u8f66\u4e1c\u98ce\u7535\u9f99\u70b9\u5f00\u5173\u5e7f\u4e50\u5b66\u4f1a\u8bf4\u8bfb\u5199\u8fd8\u8fd9\u4e2a\u4eec\u6765\u65f6\u540e\u65e0\u4e3a\u4e0e\u5bf9\u53d1\u7f51\u519b\u4e49\u8ba9\u6076\u5567\u8fc7\u91cc\u73b0\u5b9e\u957f\u4e1a\u4e13\u4e60\u7231\u9a6c\u9e1f\u9c7c\u6c14\u4e91\u5934\u4e07\u4ebf\u6761\u4e70\u5356\u8fb9\u96be\u542c\u9009\u62e9\u7b80\u590d\u6742\u65e7\u6b22]/g) || []).length;
        const traditionalCount = (value.match(/[\u570b\u9ad4\u81fa\u7063\u6f22\u8a9e\u8a71\u9580\u554f\u9593\u898b\u8eca\u6771\u98a8\u96fb\u9f8d\u9ede\u958b\u95dc\u5ee3\u6a02\u5b78\u6703\u8aaa\u8b80\u5beb\u9084\u9019\u500b\u5011\u4f86\u6642\u5f8c\u7121\u70ba\u8207\u5c0d\u767c\u7db2]/g) || []).length;
        const offCount = this.plugin.isTraditionalChineseTarget(targetLanguage) ? simplifiedCount : traditionalCount;
        const onCount = this.plugin.isTraditionalChineseTarget(targetLanguage) ? traditionalCount : simplifiedCount;
        if (offCount <= 0) return true;
        if (offCount <= 1 && onCount >= 1) return true;
        return offCount / Math.max(1, hanCount) <= 0.12 && onCount >= offCount;
    }

    hasPromptLeakageAutoTranslationOutput(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const output = String(translatedText || "").trim();
        if (!output) return false;

        const strongPatterns = [
            /you are translating discord chat messages/i,
            /real-time subtitle layer/i,
            /batch automatic channel translation mode/i,
            /strict batch automatic channel translation retry/i,
            /strict automatic channel translation retry/i,
            /final strict translation rescue/i,
            /automatic channel translation mode/i,
            /required output shape/i,
            /return exactly \d+ json objects/i,
            /<previous_invalid_output>|<\/previous_invalid_output>/i,
            /<source_message>|<\/source_message>|source_message/i,
            /<user_template>|<\/user_template>/i,
            /<\/?(?:userMessage|assistantMessage|sourceMessage|targetMessage|translatedMessage)\b[^>]*>/i,
            /\b(?:userMessage|assistantMessage|sourceMessage|targetMessage|translatedMessage)\b/i,
            /实时字幕层/,
            /翻译\s*Discord\s*聊天消息/i,
            /自动频道翻译模式/,
            /严格.*频道.*翻译.*重试/,
            /最终.*严格.*翻译/,
            /仅返回翻译后的消息/,
            /不要添加解释、注释、引用、摘要/
        ];
        if (strongPatterns.some(pattern => pattern.test(output))) return true;

        const source = String(sourceText || "");
        const outputComparable = output.replace(/\s+/g, " ").toLowerCase();
        const sourceComparable = source.replace(/\s+/g, " ").toLowerCase();
        const markers = [
            /(^|\n|\s)(task|requirements?)\s*[:：]/i,
            /(^|\n|\s)(任务|要求)\s*[:：]/,
            /return only|仅返回|只返回/,
            /translated message|translation without explanations|翻译后的消息|译文/,
            /do not add|no explanations|不要添加|不要解释/,
            /preserve.{0,80}(urls?|mentions?|markdown|emoji|code blocks?|代码块|链接)/i,
            /保留.{0,80}(URL|链接|Markdown|emoji|代码块|提及|命令)/i,
            /target language|目标语言|简体中文|繁体中文/i,
            /discord/i
        ];
        const markerCount = markers.reduce((count, pattern) => count + (pattern.test(output) ? 1 : 0), 0);
        const sourceMarkerCount = markers.reduce((count, pattern) => count + (pattern.test(source) ? 1 : 0), 0);
        if (sourceMarkerCount >= markerCount && sourceComparable.length > outputComparable.length * 0.6) return false;
        if (this.plugin.isShortSourcePromptLeakageShape(source, output, markerCount)) return true;

        const hasInstructionFrame = /(^|\n|\s)(task|requirements?|任务|要求)\s*[:：]/i.test(output);
        const hasReturnOnly = /return only|仅返回|只返回|不要添加|no explanations|do not add/i.test(output);
        const hasPreserveList = /(preserve|保留).{0,100}(url|链接|markdown|emoji|code|代码|mentions?|提及)/i.test(output);
        const hasDiscordOrTarget = /discord|target language|目标语言|简体中文|繁体中文|source_message|用户消息|人类语言内容/i.test(output);
        return (hasInstructionFrame && hasReturnOnly && hasPreserveList)
            || (markerCount >= 4 && hasReturnOnly && hasDiscordOrTarget);
    }

    hasRefusalAutoTranslationOutput(text) {
        const value = String(text || "").trim();
        if (!value) return false;
        const patterns = [
            /(抱歉|对不起|很抱歉).{0,40}(无法|不能|不可以|不能提供|无法提供|拒绝).{0,80}(翻译|译文|内容|服务|帮助)/,
            /(无法|不能|不可以|不能提供|无法提供|拒绝).{0,40}(翻译|译文|提供|处理).{0,80}(内容|服务|帮助)?/,
            /如果您有其他(?:问题|需要).{0,40}(请|可以)/,
            /\b(?:sorry|apologize|apologies)\b.{0,80}\b(?:cannot|can't|unable|will not|won't|refuse)\b.{0,80}\b(?:translate|translation|provide|assist|help)\b/i,
            /\b(?:cannot|can't|unable|will not|won't|refuse)\b.{0,80}\b(?:translate|translation|provide|assist|help)\b/i
        ];
        return patterns.some(pattern => pattern.test(value));
    }

    hasDictionaryStyleAutoTranslationOutput(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;
        const sourceLetters = (source.match(/\p{L}/gu) || []).length;
        if (sourceLetters > 32 && output.length < 80) return false;
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        const sourceScriptCounts = this.plugin.countTextScriptsForValidation(source);
        if (targetScript !== "unknown" && Number(sourceScriptCounts[targetScript] || 0) >= Math.max(2, Number(sourceScriptCounts.total || 0) * 0.5)) return false;
        const patterns = [
            /(该词|这个词|此词|该短语|这个短语|这个表达).{0,30}(意为|意思是|含义是|表示|可译为|翻译为)/,
            /在.{0,12}(俄语|英语|日语|韩语|西班牙语|法语|德语|印地语|阿拉伯语|越南语).{0,30}(中)?(意为|意思是|含义是|表示)/,
            /(意思是|意为|含义是|可译为|翻译为)[“"']?.{1,40}[”"']?/,
            /\b(?:means|meaning|means that|translates to|can be translated as|the word means)\b/i
        ];
        return patterns.some(pattern => pattern.test(output));
    }

    hasExplanatoryAutoTranslationOutput(sourceText, translatedText) {
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;
        const standaloneSignals = [
            /(?:\u8fd8\u6709|\u4ecd\u6709|\u5269\u4f59).{0,20}(?:\u5185\u5bb9|\u90e8\u5206).{0,12}(?:\u9700\u8981|\u5f85)(?:\u7ee7\u7eed)?\u7ffb\u8bd1/,
            /(?:some|more|remaining).{0,24}(?:content|text).{0,20}(?:needs?|requires?|still needs?)(?: to be)? translated/i
        ];
        const standaloneOutput = standaloneSignals.some(pattern => pattern.test(output));
        if (standaloneOutput && !standaloneSignals.some(pattern => pattern.test(source))) return true;
        const signals = [
            /\u4e0d\u5e38\u89c1|\u6ca1\u6709\u5e38\u89c1\u542b\u4e49|\u96be\u4ee5\u786e\u5b9a/,
            /(?:\u53ef\u80fd\u662f|\u53ef\u80fd\u4e3a|\u53ef\u80fd\u6307).{0,24}(?:\u4fda\u8bed|\u7f29\u5199|\u7279\u5b9a\u77ed\u8bed|\u968f\u673a\u751f\u6210|\u968f\u673a\u5b57\u7b26\u4e32)/,
            /(?:\u5efa\u8bae|\u8bf7|\u9700\u8981|\u63d0\u4f9b).{0,24}(?:\u66f4\u591a)?(?:\u4e0a\u4e0b\u6587|\u8bed\u5883)/,
            /(?:\u65e0\u6cd5|\u96be\u4ee5).{0,16}(?:\u51c6\u786e)?\u7ffb\u8bd1/,
            /not (?:a )?common (?:expression|phrase|term)|no (?:clear|standard) meaning/i,
            /(?:may|might|could) be.{0,32}(?:slang|an? abbreviation|random|made[- ]up)/i,
            /(?:provide|need) (?:some |more )?(?:context|surrounding text)|cannot (?:be )?translated accurately/i
        ];
        const outputSignals = signals.reduce((count, pattern) => count + (pattern.test(output) ? 1 : 0), 0);
        if (outputSignals < 2) return false;
        const sourceSignals = signals.reduce((count, pattern) => count + (pattern.test(source) ? 1 : 0), 0);
        return sourceSignals < 2;
    }

    hasLabeledAutoTranslationOutput(text) {
        const value = String(text || "").trim();
        if (!value) return false;
        return /^(?:\u7ffb\u8bd1|\u8bd1\u6587|\u7ffb\u8bd1\u7ed3\u679c|Translation|Translated text|Translated message|Output)\s*[:\uff1a]/i.test(value)
            || /^(?:以下是|这是).{0,8}(?:翻译|译文)\s*[:：]/.test(value)
            || /^(?:\u7f57\u9a6c\u97f3|Romaji|Romanization|\u62fc\u97f3|Pinyin|\u6807\u7b7e|Label|\u539f\u6587|Source|\u6ce8\u91ca|Note)\s*[:\uff1a]/i.test(value)
            || /^<\s*(?:translation|translatedText|translated_text|translatedMessage|targetMessage|target_message|answer|output|result|response)\b[^>]*>[\s\S]*<\/\s*(?:translation|translatedText|translated_text|translatedMessage|targetMessage|target_message|answer|output|result|response)\s*>$/i.test(value);
    }

    isShortSourcePromptLeakageShape(sourceText, translatedText, markerCount = 0) {
        const source = String(sourceText || "").trim();
        const output = String(translatedText || "").trim();
        if (!source || !output) return false;
        const sourceLetters = (source.match(/\p{L}/gu) || []).length;
        const outputLetters = (output.match(/\p{L}/gu) || []).length;
        if (sourceLetters > 12) return false;
        if (outputLetters < Math.max(80, sourceLetters * 18)) return false;

        const instructionSignals = [
            /(?:^|\n|\s)(任务|要求|目标语言|输出|规则)\s*[:：]/,
            /(?:^|\n|\s)(task|requirements?|target language|output|rules?)\s*[:：]/i,
            /Discord/i,
            /保留|preserve/i,
            /仅返回|只返回|return only/i,
            /不要添加|不要解释|no explanations|do not add/i,
            /URL|Markdown|emoji|代码块|code blocks?|mentions?/i,
            /实时字幕层|real-time subtitle layer/i
        ];
        const signalCount = instructionSignals.reduce((count, pattern) => count + (pattern.test(output) ? 1 : 0), 0);
        return signalCount >= 3 || markerCount >= 4;
    }

    hasSuspiciousChineseAutoTranslationOutput(text, targetLanguage) {
        if (this.plugin.getTargetLanguageScript(targetLanguage) !== "han") return false;
        const value = String(text || "").trim();
        if (!value) return false;
        if (/\uFFFD/.test(value)) return true;

        const counts = this.plugin.countTextScripts(value);
        if (counts.kana > 0) return true;
        if (counts.han < 2) return false;

        const lettersOnly = value.replace(/[^\p{L}]/gu, "");
        if (lettersOnly.length > 0 && lettersOnly.length <= 8 && /[\u3040-\u30ff\u31f0-\u31ff]/u.test(lettersOnly)) return true;
        return false;
    }

    isLowInformationRepeatedText(text) {
        const value = String(text || "")
            .replace(/https?:\/\/[^\s<>"']+/gi, " ")
            .replace(/<[@#&!]?\d{15,}>/g, " ")
            .replace(/<a?:[A-Za-z0-9_~.-]+:\d{15,}>/g, " ")
            .replace(/:[A-Za-z0-9_~.-]{2,}:/g, " ")
            .trim()
            .toLocaleLowerCase();
        if (!value || value.length > 80) return false;
        const words = value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) || [];
        if (words.length < 3 || words.length > 10) return false;
        const unique = new Set(words);
        if (unique.size !== 1) return false;
        const token = words[0] || "";
        const lowInformationTokens = new Set([
            "dur", "durr", "der", "duh", "blah", "bla", "lol", "lmao", "rofl",
            "haha", "hahaha", "hehe", "hmm", "hm", "uh", "umm", "mmm", "la", "lalala"
        ]);
        const sourceLanguage = String(this.plugin.settings.translation?.sourceLanguage || "").trim().toLocaleLowerCase();
        if (token === "dur" && ["turkish", "t\u00fcrk\u00e7e", "turkce", "tr", "tr-tr"].includes(sourceLanguage)) return false;
        return token.length <= 16
            && lowInformationTokens.has(token)
            && words.join(" ").length >= token.length * 3;
    }

    isAcceptableTargetShortTranslation(output, targetLanguage = this.plugin.settings.translation.targetLanguage, sourceText = "") {
        const value = String(output || "").trim();
        if (!value || value.length > 24) return false;
        if (/<\/?[A-Za-z][^>]*>/.test(value)) return false;
        if (this.plugin.hasRefusalAutoTranslationOutput(value) || this.plugin.hasLabeledAutoTranslationOutput(value)) return false;
        if (this.plugin.hasDictionaryStyleAutoTranslationOutput(sourceText, value, targetLanguage)) return false;
        const normalizedSource = String(sourceText || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
        const normalizedValue = value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
        if (normalizedSource && normalizedSource === normalizedValue) return false;
        if (this.plugin.isLowValueAutoTranslationShortText(sourceText, targetLanguage) && this.plugin.isLowValueAutoTranslationShortText(value, targetLanguage)) return true;
        const sourceLetters = (String(sourceText || "").match(/\p{L}/gu) || []).length;
        if (sourceLetters > 16) return false;
        const target = this.plugin.normalizeLanguageName(targetLanguage);
        if (["鑻辫", "English"].includes(target)) {
            const normalized = value.toLocaleLowerCase().replace(/[^a-z0-9_'+-]+/g, " ").trim();
            const common = new Set(["ok", "okay", "yes", "no", "thanks", "thank you", "done", "sure", "nice", "good", "bad", "same"]);
            return common.has(normalized);
        }
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "han") {
            const counts = this.plugin.countTextScriptsForValidation(value);
            if ((counts.han || 0) <= 0) return false;
            const foreign = Math.max(0, Number(counts.total || 0) - Number(counts.han || 0));
            return foreign === 0 && value.length <= 8;
        }
        return false;
    }

    hasLikelyTraditionalHan(text) {
        return /[\u570b\u9ad4\u81fa\u7063\u6f22\u8a9e\u8a71\u9580\u554f\u9593\u898b\u8eca\u6771\u98a8\u96fb\u9f8d\u9ede\u958b\u95dc\u5ee3\u6a02\u5b78\u6703\u8aaa\u8b80\u5beb\u9084\u9019\u500b\u5011\u4f86\u6642\u5f8c\u7121\u70ba\u8207\u5c0d\u767c\u7db2]/.test(String(text || ""));
    }

    hasLikelySimplifiedHan(text) {
        return /[\u56fd\u4f53\u53f0\u6c49\u8bed\u8bdd\u95e8\u95ee\u95f4\u89c1\u8f66\u4e1c\u98ce\u7535\u9f99\u70b9\u5f00\u5173\u5e7f\u4e50\u5b66\u4f1a\u8bf4\u8bfb\u5199\u8fd8\u8fd9\u4e2a\u4eec\u6765\u65f6\u540e\u65e0\u4e3a\u4e0e\u5bf9\u53d1\u7f51\u519b\u4e49\u8ba9\u6076\u5567\u8fc7\u91cc\u73b0\u5b9e\u957f\u4e1a\u4e13\u4e60\u7231\u9a6c\u9e1f\u9c7c\u6c14\u4e91\u5934\u4e07\u4ebf\u6761\u4e70\u5356\u8fb9\u96be\u542c\u9009\u62e9\u7b80\u590d\u6742\u65e7\u6b22]/.test(String(text || ""));
    }

    isTraditionalChineseTarget(language) {
        const value = String(language || "").trim();
        return this.plugin.normalizeLanguageName(value) === "繁體中文"
            || /Traditional Chinese|zh-TW|zh-Hant|zh-HK|zh-MO|繁[体體]中文/u.test(value);
    }

    isSimplifiedChineseTarget(language) {
        const value = String(language || "").trim();
        const normalized = this.plugin.normalizeLanguageName(value);
        return normalized === "汉语"
            || normalized === "中文"
            || /Simplified Chinese|zh-CN|zh-Hans|简体中文/u.test(value);
    }

    isAcceptableConnectionTestTruncation(error, kind, config = this.plugin.getTaskConfig(kind)) {
        return Boolean(error?.modelOutputTruncated
            && Number(error.partialOutputLength || 0) > 0
            && kind === "translation"
            && this.plugin.isLocalTranslationProvider(config));
    }
}

module.exports = { OutputGuard };
