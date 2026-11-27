"use strict";

// Phase 5a of the modularization plan: model-output validation (emoji tokens, leakage/refusal/dictionary/labeled shapes, Chinese script checks, low-information text).
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const LIKELY_TRADITIONAL_HAN_CHARS = "國體臺灣漢語話門問間見車東風電龍點開關廣樂學會說讀寫還這個們來時後無為與對發網軍義讓惡過裡現實長業專習愛馬鳥魚氣頭萬億條買賣邊難聽選擇簡複雜舊歡沒給進變樣覺應該確認請謝錯換幫帶辦離連續斷轉傳輸刪補測試驗證潤譯設啟閉顯隱評論讚訴談講記憶熱輕緊張壞爛亂髒窮貴賤賺賠滿齊倆僅雖總終經歷將剛須願擬屬稱舉棄毀傷殺戰勝敗贏搶護裝備練機動題節種產畫圖視頻軟頁載錄號碼賬鏈觀規則標準組員權鎖鍵盤檔夾庫線誤報區層級階態勢質數據統計構環際聯郵訊聲響劇戲賽隊團廳館場廠錢幣價費稅單雙兩歲禮慶運陽陰霧腦腳驚嚇罵鬧煩憂慮穩順暢遲鐘";
const LIKELY_SIMPLIFIED_HAN_CHARS = "国体汉语话门问间见车东风电龙点开关广乐学会说读写还这个们来时无为与对发网军义让恶过现实长业专习爱马鸟鱼气头万亿条买卖边难听选择简复杂旧欢没给进变样觉应该确认请谢错换帮带办离连续断转传输删补测试验证润译设启闭显隐评论赞诉谈讲记忆热轻紧张坏烂乱脏穷贵贱赚赔满齐俩仅虽总终经历将刚须愿拟属称举弃毁伤杀战胜败赢抢护装备练机动题节种产画图视频软页载录号码账链观规则标组员权锁键盘档夹库线误报区层级阶态势质数据统计构环际联邮讯声响剧戏赛队团厅馆场厂钱币价费税单双两岁礼庆运阳阴雾脑脚惊吓骂闹烦忧虑稳顺畅迟钟";
const LIKELY_TRADITIONAL_HAN_RE = new RegExp(`[${LIKELY_TRADITIONAL_HAN_CHARS}]`);
const LIKELY_SIMPLIFIED_HAN_RE = new RegExp(`[${LIKELY_SIMPLIFIED_HAN_CHARS}]`);
const LIKELY_TRADITIONAL_HAN_GLOBAL_RE = new RegExp(`[${LIKELY_TRADITIONAL_HAN_CHARS}]`, "g");
const LIKELY_SIMPLIFIED_HAN_GLOBAL_RE = new RegExp(`[${LIKELY_SIMPLIFIED_HAN_CHARS}]`, "g");

const { createPluginContext } = require("../core/plugin-context");

class OutputGuard {
    constructor(plugin, ctx = createPluginContext(plugin)) {
        this.plugin = plugin;
        this.ctx = ctx;
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
        const validationOptions = { ...options, skipCandidateExtraction: true };
        const candidates = this.extractAutoTranslationOutputCandidates(raw, {
            sourceText,
            includeQuoted: !this.plugin.shouldSkipQuotedAutoTranslationCandidates(sourceText, raw, options),
            allowQuotedFragments: () => Boolean(this.plugin.getAutoTranslationInvalidOutputReason(sourceText, raw, targetLanguage, validationOptions))
        });
        for (const candidate of candidates) {
            const value = String(candidate || "").trim();
            if (!value || value === raw) continue;
            const invalidReason = this.plugin.getAutoTranslationInvalidOutputReason(sourceText, value, targetLanguage, validationOptions);
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
        const source = String(options?.sourceText || "").trim();
        const candidates = [raw];
        const push = value => {
            const candidate = String(value || "").trim();
            if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
        };

        const fenced = raw.match(/^```[A-Za-z0-9_-]*\s*([\s\S]*?)\s*```$/);
        if (fenced && !fenced[1].includes("```") && !source.startsWith("```")) push(fenced[1]);

        const sourceHasKeyValuePrefix = !/^\s*(?:https?|steam|discord):\/\//i.test(source)
            && /^\s*[^\n:：]{1,16}[:：]\s*\S/.test(source);
        const labeled = raw.match(/^((?:translation|translated text|translated_text|translated message|translated_message|translated-message|translatedMessage|result|answer|output|target|final)|(?:\u4ee5\u4e0b\u662f|\u8fd9\u662f).{0,8}(?:\u7ffb\u8bd1|\u8bd1\u6587)|(?:\u7ffb\u8bd1|\u8bd1\u6587|\u7ffb\u8bd1\u7ed3\u679c))\s*[:\uff1a]\s*([\s\S]+)$/i);
        if (labeled) {
            const prefix = String(labeled[1] || "").trim().toLowerCase();
            const equivalentSourcePrefix = {
                result: /^(?:result|\u7ed3\u679c)\s*[:\uff1a]/i,
                answer: /^(?:answer|\u7b54\u6848|\u56de\u7b54)\s*[:\uff1a]/i,
                output: /^(?:output|\u8f93\u51fa)\s*[:\uff1a]/i,
                target: /^(?:target|\u76ee\u6807)\s*[:\uff1a]/i,
                final: /^(?:final|\u6700\u7ec8)\s*[:\uff1a]/i
            }[prefix];
            const sourceSharesGenericPrefix = Boolean(equivalentSourcePrefix && (equivalentSourcePrefix.test(source) || sourceHasKeyValuePrefix));
            if (!sourceSharesGenericPrefix) push(labeled[2]);
        }

        const wrapped = raw.match(/^<\s*(translation|translatedText|translated_text|translatedMessage|targetMessage|target_message|answer|output|result|response)\b[^>]*>([\s\S]*?)<\/\s*\1\s*>$/i);
        if (wrapped) push(wrapped[2]);

        const quotePairs = {
            "\"": "\"",
            "'": "'",
            "\u201c": "\u201d",
            "\u2018": "\u2019",
            "\u300c": "\u300d",
            "\u300e": "\u300f",
            "\u00ab": "\u00bb",
            "\u2039": "\u203a",
            "\u201e": "\u201c"
        };
        const sourceTrimmedForQuotes = /[.!?。！？]$/.test(source) ? source.slice(0, -1) : source;
        const sourceClosingQuote = sourceTrimmedForQuotes[0] === "\u201e" && sourceTrimmedForQuotes.endsWith("\u201d")
            ? "\u201d"
            : quotePairs[sourceTrimmedForQuotes[0]];
        const sourceWrappedInOuterQuotes = Boolean(
            sourceClosingQuote
            && sourceTrimmedForQuotes.length >= 2
            && sourceTrimmedForQuotes.endsWith(sourceClosingQuote)
            && !sourceTrimmedForQuotes.slice(1, -1).includes(sourceClosingQuote)
        );

        if (options?.includeQuoted !== false) {
            const closingQuote = raw[0] === "\u201e" && raw.endsWith("\u201d")
                ? "\u201d"
                : quotePairs[raw[0]];
            if (closingQuote && raw.endsWith(closingQuote) && !sourceWrappedInOuterQuotes) {
                const inner = raw.slice(1, -1);
                if (!inner.includes(closingQuote)) push(inner);
            }
            const quotedPatterns = [
                /"([^"]{1,220})"/gu,
                /\u201c([^\u201c\u201d]{1,220})\u201d/gu,
                /\u300c([^\u300c\u300d]{1,220})\u300d/gu,
                /\u300e([^\u300e\u300f]{1,220})\u300f/gu,
                /\u00ab([^\u00ab\u00bb]{1,220})\u00bb/gu,
                /\u2039([^\u2039\u203a]{1,220})\u203a/gu,
                /\u201e([^\u201e\u201c\u201d]{1,220})[\u201c\u201d]/gu,
                /(?<![\p{L}\p{N}])'([^'\n]{1,220})'(?![\p{L}\p{N}])/gu,
                /(?<![\p{L}\p{N}])\u2018([^\u2018\u2019\n]{1,220})\u2019(?![\p{L}\p{N}])/gu
            ];
            const quotedMatches = quotedPatterns
                .flatMap(pattern => [...raw.matchAll(pattern)])
                .sort((left, right) => Number(left.index || 0) - Number(right.index || 0));
            if (quotedMatches.length && (options.allowQuotedFragments?.() ?? true)) {
                const rawTrimmedForQuotes = /[.!?。！？]$/.test(raw) ? raw.slice(0, -1) : raw;
                quotedMatches.forEach(match => {
                    if (sourceWrappedInOuterQuotes && Number(match.index || 0) === 0 && (match[0] === raw || match[0] === rawTrimmedForQuotes)) return;
                    const rest = raw.slice(match.index + match[0].length);
                    if (/^\s*:/.test(rest)) return;
                    push(match[1]);
                });
            }
        }

        const sourceLooksJson = /^[\[{]/.test(source);
        if (!sourceLooksJson && (raw[0] === "{" || raw[0] === "[" || (raw[0] === "\"" && !sourceWrappedInOuterQuotes))) {
            try {
                const parsed = JSON.parse(raw);
                push(this.plugin.extractTranslationValue(parsed));
                if (Array.isArray(parsed)) {
                    parsed.forEach(item => push(this.plugin.extractTranslationValue(item)));
                }
            }
            catch {}
        }

        return candidates;
    }

    isInvalidAutoTranslationOutput(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        return Boolean(this.plugin.getAutoTranslationInvalidOutputReason(sourceText, translatedText, targetLanguage));
    }

    _stripCodeAndUrlsForEmojiScan(text) {
        const withoutCode = String(text || "")
            .replace(/```[\s\S]*?```/g, " ")
            .replace(/~~~[\s\S]*?~~~/g, " ")
            .replace(/`[^`\n]+`/g, " ");
        const withoutTagsAndUrls = withoutCode
            .replace(/<a?:[A-Za-z0-9_~]{1,64}:\d+>/g, " ")
            .replace(/(?:https?|steam|discord):\/\/[^\s<>"']+/gi, " ")
            .replace(/\bwww\.[^\s<>"']+/gi, " ");
        return { withoutCode, withoutTagsAndUrls };
    }

    _collectKnownDiscordEmojiNames(sourceText, translatedText = "") {
        const knownSet = new Set();
        const { withoutCode: srcWithoutCode, withoutTagsAndUrls: srcPlain } = this._stripCodeAndUrlsForEmojiScan(sourceText);
        for (const match of srcWithoutCode.matchAll(/<a?:([A-Za-z0-9_~]{1,64}):\d+>/g)) {
            if (match[1]) knownSet.add(match[1]);
        }
        for (const match of srcPlain.matchAll(/(?<![A-Za-z_~:/]):([A-Za-z0-9_~]{2,64}):(?![A-Za-z0-9_~:/])/g)) {
            const name = match[1] || "";
            if (/[A-Za-z_]/.test(name)) knownSet.add(name);
        }
        if (translatedText) {
            const { withoutTagsAndUrls: outPlain } = this._stripCodeAndUrlsForEmojiScan(translatedText);
            for (const match of outPlain.matchAll(/(?<![A-Za-z0-9_~:/]):([A-Za-z0-9_~]{2,64}):(?![A-Za-z0-9_~:/])/g)) {
                const name = match[1] || "";
                if (/[A-Za-z_]/.test(name) && srcPlain.includes(`:${name}:`)) knownSet.add(name);
            }
        }
        return knownSet;
    }

    getDiscordEmojiTokenCounts(text, knownNames = null) {
        const value = String(text || "");
        if (!value) return new Map();
        const counts = new Map();
        const knownSet = new Set();
        if (knownNames && typeof knownNames[Symbol.iterator] === "function") {
            for (const item of knownNames) {
                const name = String(item || "");
                if (name) knownSet.add(name);
            }
        }
        const bump = name => {
            if (name) counts.set(name, Number(counts.get(name) || 0) + 1);
        };
        const { withoutCode, withoutTagsAndUrls } = this._stripCodeAndUrlsForEmojiScan(value);
        for (const match of withoutCode.matchAll(/<a?:([A-Za-z0-9_~]{1,64}):\d+>/g)) {
            bump(match[1]);
            if (match[1]) knownSet.add(match[1]);
        }

        let cursor = 0;
        let lastMatchedClose = -1;
        while (cursor < withoutTagsAndUrls.length) {
            const open = withoutTagsAndUrls.indexOf(":", cursor);
            if (open < 0) break;
            if (withoutTagsAndUrls[open + 1] === "/" && withoutTagsAndUrls[open + 2] === "/") {
                cursor = open + 3;
                continue;
            }
            if (withoutTagsAndUrls[open + 1] === ":") {
                cursor = open + 2;
                while (withoutTagsAndUrls[cursor] === ":") cursor++;
                continue;
            }
            if (open > 0 && withoutTagsAndUrls[open - 1] === ":" && open - 1 !== lastMatchedClose) {
                cursor = open + 1;
                continue;
            }
            const close = withoutTagsAndUrls.indexOf(":", open + 1);
            if (close < 0) break;
            const name = withoutTagsAndUrls.slice(open + 1, close);
            if (!name || name.length > 64 || !/^[A-Za-z0-9_~]+$/.test(name)) {
                cursor = close;
                continue;
            }
            if (withoutTagsAndUrls[close + 1] === "/" && withoutTagsAndUrls[close + 2] === "/") {
                cursor = close + 3;
                continue;
            }
            const prevChar = open > 0 ? withoutTagsAndUrls[open - 1] : "";
            const nextChar = close + 1 < withoutTagsAndUrls.length ? withoutTagsAndUrls[close + 1] : "";
            let matched = false;
            if (knownSet.has(name)) {
                const insideNumericTimestamp = /^\d+$/.test(name) && /\d/.test(prevChar) && /\d/.test(nextChar);
                matched = !insideNumericTimestamp;
            }
            else if (name.length >= 2 && /[A-Za-z_]/.test(name)) {
                const prevBlocked = Boolean(prevChar && open - 1 !== lastMatchedClose && /[A-Za-z0-9_~:/]/.test(prevChar));
                const nextStartsEmoji = nextChar === ":" && /^:[A-Za-z0-9_~]{2,64}:/.test(withoutTagsAndUrls.slice(close + 1));
                const nextBlocked = Boolean(nextChar && !nextStartsEmoji && /[A-Za-z0-9_~:/]/.test(nextChar));
                matched = !prevBlocked && !nextBlocked;
            }
            if (matched) {
                bump(name);
                lastMatchedClose = close;
                cursor = close + 1;
            }
            else {
                cursor = close;
            }
        }
        return counts;
    }

    hasDiscordEmojiTokenMismatch(sourceText, translatedText) {
        const knownNames = this._collectKnownDiscordEmojiNames(sourceText, translatedText);
        const sourceCounts = this.getDiscordEmojiTokenCounts(sourceText, knownNames);
        const outputCounts = this.getDiscordEmojiTokenCounts(translatedText, knownNames);
        if (sourceCounts.size !== outputCounts.size) return true;
        for (const [name, count] of sourceCounts) {
            if (Number(outputCounts.get(name) || 0) !== count) return true;
        }
        return false;
    }

    // M-01 safety boundary: models rewriting or translating a draft must never silently introduce
    // executable mass mentions (@everyone, @here) or role mentions (<@&id>) that were absent from
    // the user's own source draft. Any newly introduced ones are defanged with a zero-width space
    // after '@' while preserving mentions the user intentionally typed.
    guardGeneratedMassMentions(sourceText, outputText, reservedText = "") {
        const source = String(sourceText || "");
        const output = String(outputText || "");
        if (!output) return { text: output, neutralized: false, addedMentions: [] };

        const groupMentionPattern = /@(everyone|here)(?![a-z0-9_])/gi;
        const roleMentionPattern = /<@&(\d{15,})>/g;
        // Discord's simple-markdown closes a code block on the first ``` even when opened by 4+ backticks,
        // allows inline `code` / ``code`` spans to close across line breaks, and triggers @everyone / @here
        // without a leading whitespace boundary.
        const findInlineCodeClose = (str, from, length) => {
            let pos = from;
            while (pos < str.length) {
                const start = str.indexOf("`", pos);
                if (start < 0) return -1;
                let end = start;
                while (str[end] === "`") end++;
                if (end - start === length && start > from) return start;
                pos = end;
            }
            return -1;
        };
        const maskLiteralText = value => {
            const str = String(value || "");
            let masked = "";
            let index = 0;
            while (index < str.length) {
                const char = str[index];
                if (char === "\\" && index + 1 < str.length && /[^A-Za-z0-9\s]/.test(str[index + 1])) {
                    masked += "  ";
                    index += 2;
                    continue;
                }
                if (char !== "`") {
                    masked += char;
                    index++;
                    continue;
                }
                let runEnd = index;
                while (str[runEnd] === "`") runEnd++;
                const tickCount = runEnd - index;
                if (tickCount >= 3) {
                    const close = str.indexOf("```", index + 3);
                    if (close >= 0) {
                        masked += " ".repeat(close + 3 - index);
                        index = close + 3;
                        continue;
                    }
                    masked += " ".repeat(tickCount);
                    index = runEnd;
                    continue;
                }
                const close = findInlineCodeClose(str, runEnd, tickCount);
                if (close >= 0) {
                    masked += " ".repeat(close + tickCount - index);
                    index = close + tickCount;
                    continue;
                }
                masked += " ".repeat(tickCount);
                index = runEnd;
            }
            return masked;
        };

        const countMentions = value => {
            const cleaned = maskLiteralText(value);
            const counts = new Map();
            const bump = key => counts.set(key, Number(counts.get(key) || 0) + 1);
            for (const match of cleaned.matchAll(groupMentionPattern)) bump(`@${match[1].toLowerCase()}`);
            for (const match of cleaned.matchAll(roleMentionPattern)) bump(match[0]);
            return counts;
        };

        const allowed = countMentions(source);
        const used = countMentions(reservedText);
        const addedMentions = [];
        const visibleOutput = maskLiteralText(output);
        const useMention = key => {
            const seen = Number(used.get(key) || 0);
            if (seen < Number(allowed.get(key) || 0)) {
                used.set(key, seen + 1);
                return true;
            }
            if (!addedMentions.includes(key)) addedMentions.push(key);
            return false;
        };

        let sanitized = output.replace(groupMentionPattern, (full, keyword, offset) =>
            visibleOutput[offset] !== "@" || useMention(`@${keyword.toLowerCase()}`) ? full : `@\u200b${keyword}`);

        const visibleSanitized = maskLiteralText(sanitized);
        sanitized = sanitized.replace(roleMentionPattern, (full, roleId, offset) =>
            visibleSanitized[offset] !== "<" || useMention(full) ? full : `<@\u200b&${roleId}>`);

        return {
            text: sanitized,
            neutralized: addedMentions.length > 0,
            addedMentions
        };
    }

    getAutoTranslationInvalidOutputReason(sourceText, translatedText, targetLanguage = this.plugin.settings.translation.targetLanguage, options = {}) {
        const output = String(translatedText || "").trim();
        if (!output) return "empty";
        if (this.hasLongAutoTranslationChunkFailurePlaceholder(output)) return "chunk-failure-placeholder";

        const source = String(sourceText || "").trim();
        if (!options?.skipCandidateExtraction) {
            const candidate = this.sanitizeAutoTranslationOutput(source, output, targetLanguage, {
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
        if (this.hasDiscordEmojiTokenMismatch(source, output)) return "emoji-mismatch";
        if (this.hasPromptLeakageAutoTranslationOutput(source, output, targetLanguage)) return "prompt-leakage";
        if (this.hasRefusalAutoTranslationOutput(output, source)) return "refusal-output";
        if (this.hasDictionaryStyleAutoTranslationOutput(source, output, targetLanguage)) return "dictionary-output";
        if (this.hasExplanatoryAutoTranslationOutput(source, output)) return "explanatory-output";
        if (this.hasLabeledAutoTranslationOutput(output, source)) return "labeled-output";
        if (this.isTraditionalChineseTarget(targetLanguage) && this.hasLikelySimplifiedHan(output) && !this.isAcceptableChineseVariantMix(output, targetLanguage)) return "script-mismatch";
        if (this.isSimplifiedChineseTarget(targetLanguage) && this.hasLikelyTraditionalHan(output) && !this.isAcceptableChineseVariantMix(output, targetLanguage)) return "script-mismatch";
        if (this.isAcceptableTargetShortTranslation(output, targetLanguage, source)) return "";
        if (this.hasSuspiciousChineseAutoTranslationOutput(output, targetLanguage, source)) return "suspicious-chinese";
        if (this.plugin.hasSuspiciousResidualAutoTranslationForeignText(source, output, targetLanguage)) return "residual-source";
        if (!options?.partialLongText && !options?.mergedLongText && this.plugin.hasMissingAutoTranslationLines(source, output, targetLanguage, options)) return "missing-lines";
        if (!options?.partialLongText && this.plugin.hasUndertranslatedAutoTranslationOutput(source, output, targetLanguage)) return "undertranslated";
        if (this.plugin.isTargetLanguageDominantBySentence(output, targetLanguage, { allowPureTarget: true })
            || this.plugin.isTargetLanguageWithPreservedSourceTerms(output, targetLanguage, source)) {
            return "";
        }
        if (this.plugin.hasResidualAutoTranslationSourceText(output, targetLanguage, source)) return "residual-source";
        if (this.plugin.isLikelyTargetLanguage(output, targetLanguage)) return "";
        if (!this.plugin.hasLetters(output)) return this.plugin.hasLetters(source) ? "no-letters" : "";

        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return "";
        if (targetScript === "latin") {
            if (this.plugin.isLikelyTargetLanguage(output, targetLanguage)) return "";
            if (this._isAcceptableNonLatinToLatinShortPhrase(source, output, targetLanguage)) return "";
            const scriptCounts = this.plugin.countTextScriptsForValidation(output);
            if (Number(scriptCounts.latin || 0) >= 2 && Number(scriptCounts.latin || 0) / Math.max(1, Number(scriptCounts.total || 0)) >= 0.65 && source) {
                const stripped = output.replace(/[^\p{Script=Latin}\p{N}\s.,!?;:'"’“”()-]+/gu, token => (source.includes(token) ? " " : token));
                if (stripped !== output && (this.plugin.isLikelyTargetLanguage(stripped, targetLanguage) || this._isAcceptableNonLatinToLatinShortPhrase(source, stripped, targetLanguage))) {
                    return "";
                }
            }
            return "target-language";
        }
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
        const simplifiedCount = (value.match(LIKELY_SIMPLIFIED_HAN_GLOBAL_RE) || []).length;
        const traditionalCount = (value.match(LIKELY_TRADITIONAL_HAN_GLOBAL_RE) || []).length;
        const offCount = this.isTraditionalChineseTarget(targetLanguage) ? simplifiedCount : traditionalCount;
        const onCount = this.isTraditionalChineseTarget(targetLanguage) ? traditionalCount : simplifiedCount;
        if (offCount <= 0) return true;
        if (offCount <= 1 && onCount >= 1) return true;
        return offCount / Math.max(1, hanCount) <= 0.12 && onCount >= offCount;
    }

    hasPromptLeakageAutoTranslationOutput(sourceText, translatedText, _targetLanguage = this.plugin.settings.translation.targetLanguage) {
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
            /严格.{0,40}频道.{0,40}翻译.{0,40}重试/,
            /最终.{0,40}严格.{0,40}翻译/,
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
        if (this.isShortSourcePromptLeakageShape(source, output, markerCount)) return true;

        const hasInstructionFrame = /(^|\n|\s)(task|requirements?|任务|要求)\s*[:：]/i.test(output);
        const hasReturnOnly = /return only|仅返回|只返回|不要添加|no explanations|do not add/i.test(output);
        const hasPreserveList = /(preserve|保留).{0,100}(url|链接|markdown|emoji|code|代码|mentions?|提及)/i.test(output);
        const hasDiscordOrTarget = /discord|target language|目标语言|简体中文|繁体中文|source_message|用户消息|人类语言内容/i.test(output);
        return (hasInstructionFrame && hasReturnOnly && hasPreserveList)
            || (markerCount >= 4 && hasReturnOnly && hasDiscordOrTarget);
    }

    hasRefusalAutoTranslationOutput(text, sourceText = "") {
        const value = String(text || "").trim();
        if (!value) return false;
        const source = String(sourceText || "").trim();
        const translationRefusalPatterns = [
            /(抱歉|对不起|很抱歉).{0,40}(无法|不能|不可以|不能提供|无法提供|拒绝).{0,80}(翻译|译文)/,
            /(无法|不能|不可以|不能提供|无法提供|拒绝).{0,40}(翻译|译文)/,
            /如果您有其他(?:问题|需要).{0,40}(请|可以)/,
            /\b(?:cannot|can't|unable|will not|won't|refuse)\b.{0,80}\b(?:translate|translation)\b/i
        ];
        if (translationRefusalPatterns.some(pattern => pattern.test(value))) {
            if (!source || !/(翻译|译文|\btranslat)/i.test(source)) return true;
        }
        const generalRefusalPatterns = [
            /(抱歉|对不起|很抱歉).{0,40}(无法|不能|不可以|不能提供|无法提供|拒绝).{0,80}(内容|服务|帮助)/,
            /(无法|不能|不可以|不能提供|无法提供|拒绝).{0,40}(提供|处理).{0,80}(内容|服务|帮助)/,
            /\b(?:sorry|apologize|apologies)\b.{0,80}\b(?:cannot|can't|unable|will not|won't|refuse)\b.{0,80}\b(?:provide|assist|help)\b/i,
            /\b(?:cannot|can't|unable|will not|won't|refuse)\b.{0,80}\b(?:provide|assist|help)\b/i
        ];
        if (!generalRefusalPatterns.some(pattern => pattern.test(value))) return false;
        if (source && (/(抱歉|对不起|无法|不能|帮不上|爱莫能助)/.test(source) || /\b(?:sorry|apologi|can't|cannot|unable|won't|help)\b/i.test(source))) {
            return false;
        }
        return true;
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
        const escapedSource = source.length <= 24 ? source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
        if (escapedSource && new RegExp(`${escapedSource}.{0,16}(?:意思是|意为|含义是|可译为|翻译为|\\bmeans\\b|\\btranslates to\\b)`, "i").test(output)) {
            return true;
        }
        const patterns = [
            /(该词|这个词|此词|该短语|这个短语|这个表达).{0,30}(意为|意思是|含义是|表示|可译为|翻译为)/,
            /在.{0,12}(俄语|英语|日语|韩语|西班牙语|法语|德语|印地语|阿拉伯语|越南语).{0,30}(中)?(意为|意思是|含义是|表示)/,
            /^(?:意思是|意为|含义是|可译为|翻译为)\s*[“"'][^”"'\n]{1,40}[”"'][。.!！]?$/,
            /\b(?:translates to|can be translated as|the word means|this word means|this phrase means)\b/i,
            /^(?:["'“][^"'”\n]{1,32}["'”]\s+)?means\s+["'“][^"'”\n]{1,40}["'”]\.?$/i
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

    hasLabeledAutoTranslationOutput(text, sourceText = "") {
        const value = String(text || "").trim();
        if (!value) return false;
        const source = String(sourceText || "").trim();
        const sourceHasKeyValuePrefix = !/^\s*(?:https?|steam|discord):\/\//i.test(source)
            && /^\s*[^\n:：]{1,16}[:：]\s*\S/.test(source);
        if (/^(?:Output)\s*[:\uff1a]/i.test(value) && (/^(?:Output|\u8f93\u51fa)\s*[:\uff1a]/i.test(source) || sourceHasKeyValuePrefix)) return false;
        if (/^(?:Note|\u6ce8\u91ca)\s*[:\uff1a]/i.test(value) && /^(?:Note|\u6ce8\u610f|\u6ce8\u91ca)\s*[:\uff1a]/i.test(source)) return false;
        if (/^(?:Source|\u539f\u6587)\s*[:\uff1a]/i.test(value) && /^(?:Source|\u6765\u6e90|\u539f\u6587)\s*[:\uff1a]/i.test(source)) return false;
        if (/^(?:Label|\u6807\u7b7e)\s*[:\uff1a]/i.test(value) && /^(?:Label|\u6807\u7b7e)\s*[:\uff1a]/i.test(source)) return false;
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

    hasSuspiciousChineseAutoTranslationOutput(text, targetLanguage, sourceText = "") {
        if (this.plugin.getTargetLanguageScript(targetLanguage) !== "han") return false;
        const value = String(text || "").trim();
        if (!value) return false;
        if (/\uFFFD/.test(value)) return true;

        const stripCode = input => typeof this.plugin.splitDiscordCodeSegments === "function"
            ? this.plugin.splitDiscordCodeSegments(String(input || "")).map(segment => (segment.code ? " " : segment.text)).join("")
            : String(input || "").replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ");
        let checked = stripCode(value);
        const sourcePlain = sourceText ? stripCode(sourceText) : "";
        if (sourcePlain) {
            const sourceCounts = this.plugin.countTextScripts(sourcePlain);
            const sourceIsJapanese = Number(sourceCounts.kana || 0) >= 2 && Number(sourceCounts.kana || 0) / Math.max(1, Number(sourceCounts.total || 0)) > 0.15;
            if (!sourceIsJapanese && Number(sourceCounts.kana || 0) > 0) {
                checked = checked.replace(/[\u3040-\u30ff\u31f0-\u31ff]+/gu, token => (sourcePlain.includes(token) ? " " : token));
            }
        }

        const counts = this.plugin.countTextScripts(checked);
        if (counts.kana > 0) return true;
        if (counts.han < 2) return false;

        const lettersOnly = checked.replace(/[^\p{L}]/gu, "");
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

    _isAcceptableNonLatinToLatinShortPhrase(sourceText, outputText, targetLanguage = this.plugin.settings.translation.targetLanguage) {
        const value = String(outputText || "").trim();
        const source = String(sourceText || "").trim();
        if (!value || !source || value.length > 40) return false;
        if (/<\/?[A-Za-z][^>]*>/.test(value) || /\?{3,}|\uFFFD/.test(value)) return false;
        if (this.plugin.getTargetLanguageScript(targetLanguage) !== "latin") return false;
        if (this.hasPromptLeakageAutoTranslationOutput(source, value, targetLanguage)) return false;
        if (this.hasRefusalAutoTranslationOutput(value, source) || this.hasLabeledAutoTranslationOutput(value, source)) return false;
        if (this.hasDictionaryStyleAutoTranslationOutput(source, value, targetLanguage)) return false;
        if (this.hasExplanatoryAutoTranslationOutput(source, value)) return false;

        const sourceLetters = (source.match(/\p{L}/gu) || []).length;
        if (sourceLetters < 1 || sourceLetters > 32) return false;
        const rawSourceCounts = this.plugin.countTextScripts(source);
        const nonLatinSourceLetters = Number(rawSourceCounts.han || 0)
            + Number(rawSourceCounts.kana || 0)
            + Number(rawSourceCounts.hangul || 0)
            + Number(rawSourceCounts.cyrillic || 0)
            + Number(rawSourceCounts.arabic || 0)
            + Number(rawSourceCounts.devanagari || 0)
            + Number(rawSourceCounts.other || 0);
        if (nonLatinSourceLetters < 1) return false;
        const sourceValidationCounts = this.plugin.countTextScriptsForValidation(source);
        if (Number(sourceValidationCounts.latin || 0) > 0) return false;

        const strippedOutput = this.stripProtectedTokensForPolishValidation(value);
        const checkedOutput = strippedOutput || value;
        const outCounts = this.plugin.countTextScripts(checkedOutput);
        if (Number(outCounts.latin || 0) < 2) return false;
        const nonLatinOutLetters = Number(outCounts.han || 0)
            + Number(outCounts.kana || 0)
            + Number(outCounts.hangul || 0)
            + Number(outCounts.cyrillic || 0)
            + Number(outCounts.arabic || 0)
            + Number(outCounts.devanagari || 0)
            + Number(outCounts.other || 0);
        if (nonLatinOutLetters > 0) return false;

        const words = checkedOutput.match(/\p{Script=Latin}+(?:['’-]\p{Script=Latin}+)*/gu) || [];
        if (words.length < 1 || words.length > 5) return false;

        const target = this.plugin.normalizeLanguageName(targetLanguage);
        const isEnglishTarget = ["英语", "English"].includes(target);
        if (isEnglishTarget) {
            if (this.plugin.isLikelyTargetLanguage(checkedOutput, targetLanguage)) return true;
            const otherLatin = ["spanish", "french", "german", "italian", "portuguese", "vietnamese"];
            if (otherLatin.some(lang => this.plugin.looksLikeLatinLanguage?.(checkedOutput, lang))) return false;
            return true;
        }

        if (this.plugin.isLikelyTargetLanguage(checkedOutput, targetLanguage)) return true;
        if (this.plugin.looksLikeLatinLanguage?.(checkedOutput, "english")) return false;
        const normalizedPhrase = checkedOutput.toLocaleLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9_'+-]+/g, " ").trim();
        const obviousEnglishOnly = new Set([
            "yes", "thanks", "thank you", "done", "sure", "nice", "good", "bad", "same",
            "hi", "hello", "hey", "morning", "good morning", "good afternoon", "good evening", "good night",
            "no problem", "see you", "got it", "on my way", "well done", "great job", "good job", "all good",
            "sounds good", "of course", "my bad", "welcome", "you're welcome", "bye", "goodbye", "take care"
        ]);
        if (obviousEnglishOnly.has(normalizedPhrase)) return false;
        return true;
    }

    isAcceptableTargetShortTranslation(output, targetLanguage = this.plugin.settings.translation.targetLanguage, sourceText = "") {
        const value = String(output || "").trim();
        if (!value || value.length > 40) return false;
        if (/<\/?[A-Za-z][^>]*>/.test(value)) return false;
        if (this.hasRefusalAutoTranslationOutput(value, sourceText) || this.hasLabeledAutoTranslationOutput(value, sourceText)) return false;
        if (this.hasDictionaryStyleAutoTranslationOutput(sourceText, value, targetLanguage)) return false;
        const normalizedSource = String(sourceText || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
        const normalizedValue = value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
        if (normalizedSource && normalizedSource === normalizedValue) return false;
        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "latin" && !String(sourceText || "").includes("\n") && this._isAcceptableNonLatinToLatinShortPhrase(sourceText, value, targetLanguage)) {
            return true;
        }
        if (value.length > 24) return false;
        if (this.plugin.isLowValueAutoTranslationShortText(sourceText, targetLanguage) && this.plugin.isLowValueAutoTranslationShortText(value, targetLanguage)) return true;
        const sourceLetters = (String(sourceText || "").match(/\p{L}/gu) || []).length;
        if (sourceLetters > 16) return false;
        const target = this.plugin.normalizeLanguageName(targetLanguage);
        if (["英语", "English"].includes(target)) {
            const normalized = value.toLocaleLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9_'+-]+/g, " ").trim();
            const common = new Set([
                "ok", "okay", "yes", "no", "thanks", "thank you", "done", "sure", "nice", "good", "bad", "same",
                "hi", "hello", "hey", "morning", "good morning", "good afternoon", "good evening", "good night",
                "no problem", "see you", "got it", "on my way", "well done", "great job", "good job", "all good",
                "sounds good", "of course", "my bad", "welcome", "you're welcome", "bye", "goodbye", "take care"
            ]);
            return common.has(normalized);
        }
        if (targetScript === "han") {
            const counts = this.plugin.countTextScriptsForValidation(value);
            if ((counts.han || 0) <= 0) return false;
            const foreign = Math.max(0, Number(counts.total || 0) - Number(counts.han || 0));
            return foreign === 0 && value.length <= 8;
        }
        return false;
    }

    hasLikelyTraditionalHan(text) {
        return LIKELY_TRADITIONAL_HAN_RE.test(String(text || ""));
    }

    hasLikelySimplifiedHan(text) {
        return LIKELY_SIMPLIFIED_HAN_RE.test(String(text || ""));
    }

    stripProtectedTokensForPolishValidation(text) {
        const value = String(text || "");
        const plain = typeof this.plugin.splitDiscordCodeSegments === "function"
            ? this.plugin.splitDiscordCodeSegments(value).map(segment => (segment.code ? " " : segment.text)).join("")
            : value.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ");
        return plain
            .replace(/(?:https?|steam|discord):\/\/[^\s<>"']+/gi, " ")
            .replace(/\bwww\.[^\s<>"']+/gi, " ")
            .replace(/<a?:[A-Za-z0-9_~.-]+:\d{15,}>/g, " ")
            .replace(/<[@#][!&]?\d{15,}>/g, " ")
            .replace(/<\/[^:<>\n]{1,100}:\d{15,25}>/g, " ")
            .replace(/<t:-?\d{1,12}(?::[tTdDfFR])?>/g, " ")
            .replace(/<id:[A-Za-z_-]+>/g, " ")
            .replace(/:[A-Za-z0-9_~.-]{2,}:/g, " ")
            .replace(/(?<![a-z0-9_@])@(?:everyone|here)(?![a-z0-9_])/gi, " ")
            .trim();
    }

    // Checks whether a polished draft drifted away from the configured output language or Chinese script.
    getPolishOutputLanguageViolation(sourceText, outputText, targetLanguage = this.plugin.settings.polish?.targetLanguage, options = {}) {
        const output = String(outputText || "").trim();
        if (!output) return "empty";
        const checked = this.stripProtectedTokensForPolishValidation(output);
        if (!checked || !this.plugin.hasLetters(checked)) return "";

        const traditionalTarget = this.isTraditionalChineseTarget(targetLanguage);
        const simplifiedTarget = this.isSimplifiedChineseTarget(targetLanguage);
        if (traditionalTarget && this.hasLikelySimplifiedHan(checked)) return "script-mismatch";
        if (simplifiedTarget && !options.allowDialectScriptMix) {
            const sourceTextPlain = String(sourceText || "");
            const checkedWithoutPreservedSource = checked.replace(LIKELY_TRADITIONAL_HAN_GLOBAL_RE, ch => (sourceTextPlain.includes(ch) ? "" : ch));
            if (this.hasLikelyTraditionalHan(checkedWithoutPreservedSource)) return "script-mismatch";
        }
        if (options.chineseScriptOnly) return "";

        const targetScript = this.plugin.getTargetLanguageScript(targetLanguage);
        if (targetScript === "unknown") return "";
        const sourceChecked = this.stripProtectedTokensForPolishValidation(sourceText);
        if (sourceChecked && !this.plugin.hasLetters(sourceChecked)) return "";

        const counts = this.plugin.countTextScriptsForValidation(checked);
        const total = Number(counts.total || 0);
        if (total < 2) return "";
        if (targetScript === "kana") {
            const kana = Number(counts.kana || 0);
            const han = Number(counts.han || 0);
            if (kana === 0 && han === 0) return "wrong-script";
            if (kana === 0 && han >= 4 && this.hasLikelySimplifiedHan(checked)) return "wrong-script";
            return "";
        }
        const targetCount = Number(counts[targetScript] || 0);
        if (targetCount === 0) return "wrong-script";
        return "";
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
            && (kind === "translation" || kind === "polish")
            && this.plugin.isLocalTranslationProvider(config));
    }
}

module.exports = { OutputGuard };
