"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const { SETTINGS_TAB_COMPOSE, SETTINGS_TAB_TRANSLATE } = require("./settings-schema");
const {
    PLUGIN_NAME,
    PROVIDER_DEFAULTS,
    PROVIDER_PROFILE_FIELDS,
    MAX_SAVED_SERVICE_CONFIGS,
    DEEPSEEK_MODELS,
    AUTO_LANGUAGE_VALUE,
    PROMPT_TEMPLATE_CATEGORY_GENERAL,
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    PROMPT_TEMPLATE_CATEGORY_PERSONA,
    QUICK_SETTINGS_DIAGNOSTICS_MAX_ENTRIES,
    SETTINGS_WRITE_DEBOUNCE_MS,
    HEAVY_PERSISTENCE_DEFER_MS,
    HEAVY_PERSISTENCE_MAX_DEFER_MS,
    TRANSLATION_VALIDATION_QUALITIES,
    DIAGNOSTIC_FAILURE_CLASSES,
    DIAGNOSTIC_FAILURE_LAYERS,
    LANGUAGE_PRESETS,
    DEFAULT_PROMPT_TEMPLATES,
    DEFAULT_SETTINGS
} = require("../constants");
const { PLUGIN_VERSION } = require("../version");

const SAFE_DIAGNOSTIC_KEYS = new Set([
    "textcachehits", "autotranslatemessages", "cachehits", "cachemisses", "cachememory",
    "valuelength", "inputlength", "messagestate", "reasoncode", "queuetype", "targetkind",
    "identitykind", "identitytargetkind", "identityhash", "texthash", "textlength", "sourcehash",
    "cachehash", "prefetch", "prefetchinflight", "pendingtargets", "inflight", "inflightitems",
    "queuelength", "promptlength", "maxtokens", "bodyhash", "finishreason", "partialoutputlength",
    "invalidreason", "outputlength", "sourcelength", "domlength", "domtextlength", "fullcontentlength",
    "selectedlength", "sourcekind", "sourcetextkind", "sourceconfidence", "failureclass", "failurelayer",
    "flowstage", "validationquality", "validationreason", "renderable", "cacheable", "chunkindex",
    "chunktotal", "chunklength", "attemptname", "attemptindex", "requestcount", "longtextchunk",
    "longtextsourcelength", "timeoutms", "retryafterms", "requestid", "status"
]);
const SENSITIVE_DIAGNOSTIC_KEYS = new Set([
    "text", "sourcetext", "targettext", "rawtext", "inputtext", "outputtext",
    "translation", "translated", "translatedtext", "rawtranslation", "appid"
]);

class ServiceProfilesController {
    constructor(plugin) {
        this.plugin = plugin;
    }
}

const methods = {
    getLanguageLabel(language) {
        return this.plugin.getLocale() === "en" ? language.en : `${language.zh} - ${language.en}`;
    },

    getDisplayLanguage(language) {
        if (!language || language === AUTO_LANGUAGE_VALUE) return this.plugin.t("autoDetectLanguage");
        const normalized = this.normalizeLanguageName(language);
        const preset = LANGUAGE_PRESETS.find(item => item.value === normalized);
        return preset ? this.getLanguageLabel(preset) : normalized;
    },

    normalizePromptTemplateSerial(serial) {
        const digits = String(serial || "").trim().match(/\d+/)?.[0];
        if (!digits) return "";
        return digits.padStart(3, "0").slice(-3);
    },

    getPromptTemplateLabel(template) {
        return `${template.serial || "000"} · ${this.getPromptTemplateDisplayName(template)}`;
    },

    getPolishTemplateCategory(template) {
        return this.plugin.normalizePromptTemplateCategory("polish", template?.category, template?.id);
    },

    getPolishTemplateCategoryLabel(category) {
        const keyMap = {
            [PROMPT_TEMPLATE_CATEGORY_GENERAL]: "promptTemplateCategoryGeneral",
            [PROMPT_TEMPLATE_CATEGORY_DIALECT]: "promptTemplateCategoryDialect",
            [PROMPT_TEMPLATE_CATEGORY_PERSONA]: "promptTemplateCategoryPersona"
        };
        return this.plugin.t(keyMap[category] || "promptTemplateCategoryGeneral");
    },

    getDialectRegionLabel(region) {
        const keyMap = {
            southChina: "promptTemplateRegionSouthChina",
            southwest: "promptTemplateRegionSouthwest",
            north: "promptTemplateRegionNorth",
            eastCentral: "promptTemplateRegionEastCentral"
        };
        return this.plugin.t(keyMap[region] || "promptTemplateRegionCustom");
    },

    getPersonaGroupLabel(group) {
        const keyMap = {
            monarchs: "promptTemplatePersonaGroupMonarchs",
            strategists: "promptTemplatePersonaGroupStrategists",
            literati: "promptTemplatePersonaGroupLiterati",
            global: "promptTemplatePersonaGroupGlobal"
        };
        return this.plugin.t(keyMap[group] || "promptTemplatePersonaGroupCustom");
    },

    getActivePolishTemplate(config = null) {
        const templates = this.plugin.getPromptTemplates("polish") || [];
        const task = this.plugin.settings?.polish || {};
        const activeId = String(config?.activePromptTemplate || task.activePromptTemplate || "");
        const candidate = templates.find(item => item && item.id === activeId) || null;
        if (!candidate) return null;
        if (config && typeof config.prompt === "string") {
            const normalize = value => String(value ?? "").replace(/\r\n?/g, "\n").trim();
            if (normalize(config.prompt) !== normalize(candidate.prompt)) return null;
        }
        return candidate;
    },

    getEffectivePolishTargetLanguage(config = null) {
        const rawTarget = config?.targetLanguage ?? this.plugin.settings?.polish?.targetLanguage;
        const activeTemplate = this.getActivePolishTemplate(config);
        const shouldPreferChinese = Boolean(
            activeTemplate
            && (this.getPolishTemplateCategory(activeTemplate) === PROMPT_TEMPLATE_CATEGORY_DIALECT
                || activeTemplate.preferChineseOutput === true)
        );
        if (shouldPreferChinese) {
            if (this.plugin.isTraditionalChineseTarget(rawTarget) || this.plugin.isSimplifiedChineseTarget(rawTarget)) {
                return rawTarget;
            }
            return "汉语";
        }
        return rawTarget;
    },

    // A built-in template keeps its stored (Chinese) name but is shown in the interface language, unless the user
    // renamed it; the user's own templates show their name as typed.
    getPromptTemplateDisplayName(template) {
        const name = String(template?.name || "");
        const keys = {
            "polish-natural-chat": "promptTemplateNameNaturalChat",
            "polish-polite": "promptTemplateNamePolite",
            "polish-short": "promptTemplateNameShort",
            "polish-native-casual": "promptTemplateNameNativeCasual",
            "polish-tech-bug": "promptTemplateNameTechBug",
            "polish-gaming-chat": "promptTemplateNameGamingChat",
            "polish-tactful": "promptTemplateNameTactful",
            "polish-formal-notice": "promptTemplateNameFormalNotice",
            "polish-dialect-cantonese-guangfu": "promptTemplateNameDialectCantoneseGuangfu",
            "polish-dialect-cantonese-hk": "promptTemplateNameDialectCantoneseHk",
            "polish-dialect-hakka": "promptTemplateNameDialectHakka",
            "polish-dialect-chaoshan": "promptTemplateNameDialectChaoshan",
            "polish-dialect-guangxi": "promptTemplateNameDialectGuangxi",
            "polish-dialect-minnan": "promptTemplateNameDialectMinnan",
            "polish-dialect-taiwan": "promptTemplateNameDialectTaiwan",
            "polish-dialect-sichuan": "promptTemplateNameDialectSichuan",
            "polish-dialect-yunnan": "promptTemplateNameDialectYunnan",
            "polish-dialect-guizhou": "promptTemplateNameDialectGuizhou",
            "polish-dialect-dongbei": "promptTemplateNameDialectDongbei",
            "polish-dialect-beijing": "promptTemplateNameDialectBeijing",
            "polish-dialect-tianjin": "promptTemplateNameDialectTianjin",
            "polish-dialect-shaanxi": "promptTemplateNameDialectShaanxi",
            "polish-dialect-henan": "promptTemplateNameDialectHenan",
            "polish-dialect-shandong": "promptTemplateNameDialectShandong",
            "polish-dialect-xinjiang": "promptTemplateNameDialectXinjiang",
            "polish-dialect-shanghai": "promptTemplateNameDialectShanghai",
            "polish-dialect-jiangzhe": "promptTemplateNameDialectJiangzhe",
            "polish-dialect-nanjing": "promptTemplateNameDialectNanjing",
            "polish-dialect-wuhan": "promptTemplateNameDialectWuhan",
            "polish-dialect-hunan": "promptTemplateNameDialectHunan",
            "polish-persona-qin-shihuang": "promptTemplateNamePersonaQinShihuang",
            "polish-persona-han-wudi": "promptTemplateNamePersonaHanWudi",
            "polish-persona-zhu-yuanzhang": "promptTemplateNamePersonaZhuYuanzhang",
            "polish-persona-chiang-kai-shek": "promptTemplateNamePersonaChiangKaiShek",
            "polish-persona-cao-cao": "promptTemplateNamePersonaCaoCao",
            "polish-persona-li-shimin": "promptTemplateNamePersonaLiShimin",
            "polish-persona-yongzheng": "promptTemplateNamePersonaYongzheng",
            "polish-persona-zhuge-liang": "promptTemplateNamePersonaZhugeLiang",
            "polish-persona-sima-yi": "promptTemplateNamePersonaSimaYi",
            "polish-persona-sun-tzu": "promptTemplateNamePersonaSunTzu",
            "polish-persona-xiang-yu": "promptTemplateNamePersonaXiangYu",
            "polish-persona-lu-xun": "promptTemplateNamePersonaLuXun",
            "polish-persona-lin-daiyu": "promptTemplateNamePersonaLinDaiyu",
            "polish-persona-wang-yangming": "promptTemplateNamePersonaWangYangming",
            "polish-persona-li-bai": "promptTemplateNamePersonaLiBai",
            "polish-persona-su-shi": "promptTemplateNamePersonaSuShi",
            "polish-persona-confucius": "promptTemplateNamePersonaConfucius",
            "polish-persona-zhuangzi": "promptTemplateNamePersonaZhuangzi",
            "polish-persona-eileen-chang": "promptTemplateNamePersonaEileenChang",
            "polish-persona-qian-zhongshu": "promptTemplateNamePersonaQianZhongshu",
            "polish-persona-wang-xiaobo": "promptTemplateNamePersonaWangXiaobo",
            "polish-persona-guo-degang": "promptTemplateNamePersonaGuoDegang",
            "polish-persona-shakespeare": "promptTemplateNamePersonaShakespeare",
            "polish-persona-trump": "promptTemplateNamePersonaTrump",
            "polish-persona-nietzsche": "promptTemplateNamePersonaNietzsche",
            "polish-persona-marx": "promptTemplateNamePersonaMarx",
            "polish-persona-napoleon": "promptTemplateNamePersonaNapoleon",
            "polish-persona-churchill": "promptTemplateNamePersonaChurchill",
            "polish-persona-musk": "promptTemplateNamePersonaMusk",
            "translation-natural": "promptTemplateNameNatural",
            "translation-literal": "promptTemplateNameLiteral",
            "translation-slang-casual": "promptTemplateNameSlangCasual",
            "translation-tech-dev": "promptTemplateNameTechDev",
            "translation-gaming-acg": "promptTemplateNameGamingAcg",
            "translation-formal-changelog": "promptTemplateNameFormalChangelog"
        };
        const key = keys[template?.id];
        if (!key) return name;
        const builtIn = [...DEFAULT_PROMPT_TEMPLATES.polish, ...DEFAULT_PROMPT_TEMPLATES.translation].find(item => item.id === template.id);
        return !name || name === builtIn?.name ? this.plugin.t(key) : name;
    },

    getPromptTemplateSearchText(template) {
        const category = template?.category ? this.getPolishTemplateCategoryLabel(template.category) : "";
        const region = template?.region ? this.getDialectRegionLabel(template.region) : "";
        const personaGroup = template?.personaGroup ? this.getPersonaGroupLabel(template.personaGroup) : "";
        return [
            template.serial,
            String(template.serial || "").replace(/^0+/, ""),
            template.name,
            this.getPromptTemplateDisplayName(template),
            template.category,
            category,
            region,
            personaGroup
        ].filter(Boolean).join(" ").toLowerCase();
    },

    normalizeLanguageName(language) {
        const value = String(language || "").trim();
        if (this.isTraditionalChineseLanguageAlias(value)) return "繁體中文";
        if (this.isSimplifiedChineseLanguageAlias(value) || this.isGenericChineseLanguageAlias(value)) return "汉语";
        const aliases = {
            "Chinese": "汉语",
            "Simplified Chinese": "汉语",
            "Traditional Chinese": "繁體中文",
            "Chinese Traditional": "繁體中文",
            "Mandarin Chinese": "汉语",
            "zh-TW": "繁體中文",
            "zh-Hant": "繁體中文",
            "zh-HK": "繁體中文",
            "zh-MO": "繁體中文",
            "中文": "汉语",
            "汉语": "汉语",
            "漢語": "繁體中文",
            "繁体中文": "繁體中文",
            "繁體中文": "繁體中文",
            "English": "英语",
            "英文": "英语",
            "英语": "英语",
            "Spanish": "西班牙语",
            "Russian": "俄语",
            "German": "德语",
            "French": "法语",
            "Japanese": "日语",
            "Arabic": "阿拉伯语",
            "Vietnamese": "越南语",
            "Hindi": "印地语",
            "Korean": "朝鲜语",
            "韩语": "朝鲜语",
            "朝鲜语": "朝鲜语",
            "Italian": "意大利语"
        };
        return aliases[value] || value;
    },

    isGenericChineseLanguageAlias(value) {
        return new Set([
            "Chinese",
            "Mandarin Chinese",
            "zh",
            "中文"
        ]).has(String(value || "").trim());
    },

    isSimplifiedChineseLanguageAlias(value) {
        return new Set([
            "Simplified Chinese",
            "zh-CN",
            "zh-Hans",
            "汉语",
            "简体中文",
            "簡體中文"
        ]).has(String(value || "").trim());
    },

    isTraditionalChineseLanguageAlias(value) {
        return new Set([
            "Traditional Chinese",
            "Chinese Traditional",
            "zh-TW",
            "zh-Hant",
            "zh-HK",
            "zh-MO",
            "漢語",
            "繁体中文",
            "繁體中文"
        ]).has(String(value || "").trim());
    },

    isChineseLanguageAlias(value) {
        return this.isGenericChineseLanguageAlias(value)
            || this.isSimplifiedChineseLanguageAlias(value)
            || this.isTraditionalChineseLanguageAlias(value);
    },

    normalizeSourceLanguage(language) {
        if (!language || language === AUTO_LANGUAGE_VALUE || language === "auto") return AUTO_LANGUAGE_VALUE;
        return this.normalizeLanguageName(language);
    },

    scheduleSettingsPersist(delayMs = SETTINGS_WRITE_DEBOUNCE_MS) {
        const delay = Math.max(0, Number(delayMs) || 0);
        const persistAt = Date.now() + delay;
        this.plugin.settingsDirty = true;
        if (this.plugin.settingsLoadBlocked) return false;
        if (this.plugin.settingsDirtyTimer && this.plugin.settingsDirtyAt && this.plugin.settingsDirtyAt <= persistAt) return true;
        if (this.plugin.settingsDirtyTimer) clearTimeout(this.plugin.settingsDirtyTimer);
        this.plugin.settingsDirtyAt = persistAt;
        this.plugin.settingsDirtyTimer = setTimeout(() => this.plugin.flushSettings({ scheduled: true }), delay);
        this.plugin.unrefTimer(this.plugin.settingsDirtyTimer);
        return true;
    },

    getProviderCapabilities(provider) {
        return this.plugin.settingsSchema.getProviderCapabilities(provider);
    },

    isProviderAllowedForTask(kind, provider) {
        return this.plugin.settingsSchema.isProviderAllowedForTask(kind, provider);
    },

    normalizeProviderForTask(kind, provider) {
        const normalized = String(provider || "").trim();
        if (this.isProviderAllowedForTask(kind, normalized)) return normalized;
        const fallback = DEFAULT_SETTINGS[kind]?.provider || "deepseek";
        return this.isProviderAllowedForTask(kind, fallback) ? fallback : "deepseek";
    },

    getProviderOptionsForTask(kind) {
        return this.plugin.settingsSchema.getProviderOptionsForTask(kind, provider => this.getProviderDisplayName(provider));
    },

    getProviderDisplayName(provider) {
        const normalized = String(provider || "").trim();
        if (normalized === "deepseek") return "DeepSeek";
        if (normalized === "openaiCompatible") return this.plugin.t("providerOpenAI");
        if (normalized === "sakuraLocal") return this.plugin.t("providerSakuraLocal");
        if (normalized === "googleCloud") return this.plugin.t("providerGoogleCloud");
        if (normalized === "microsoft") return this.plugin.t("providerMicrosoft");
        if (normalized === "deepl") return this.plugin.t("providerDeepL");
        if (normalized === "baidu") return this.plugin.t("providerBaidu");
        return this.plugin.getProviderDefaults(normalized)?.label || normalized || "";
    },

    saveTaskProviderProfile(kind, provider) {
        const task = this.plugin.settings[kind];
        if (!task || !provider) return;
        if (!task.providerProfiles || typeof task.providerProfiles !== "object" || Array.isArray(task.providerProfiles)) {
            task.providerProfiles = {};
        }
        const existing = task.providerProfiles[provider] || {};
        const profile = { ...existing };
        PROVIDER_PROFILE_FIELDS.forEach(field => {
            if (task[field] !== undefined) profile[field] = task[field];
        });
        if (typeof task.apiKeyOrigin === "string") profile.apiKeyOrigin = task.apiKeyOrigin;
        else delete profile.apiKeyOrigin;
        if (Array.isArray(existing.recentModels)) profile.recentModels = existing.recentModels.slice(0, 8);
        task.providerProfiles[provider] = profile;
    },

    // Remembers custom model names the user has typed for each provider (most recent first, persisted in config).
    rememberTaskProviderModel(kind, provider, modelName) {
        const task = this.plugin.settings[kind];
        const normalizedProvider = this.normalizeProviderForTask(kind, provider);
        const trimmed = String(modelName || "").trim();
        if (!task || !normalizedProvider || !trimmed) return [];
        if (!task.providerProfiles || typeof task.providerProfiles !== "object" || Array.isArray(task.providerProfiles)) {
            task.providerProfiles = {};
        }
        const profile = { ...(task.providerProfiles[normalizedProvider] || {}) };
        const previous = Array.isArray(profile.recentModels) ? profile.recentModels.map(item => String(item || "").trim()).filter(Boolean) : [];
        const next = [trimmed, ...previous.filter(item => item !== trimmed)].slice(0, 8);
        profile.model = trimmed;
        profile.recentModels = next;
        task.providerProfiles[normalizedProvider] = profile;
        return next;
    },

    getRememberedModelsForProvider(kind, provider) {
        const normalizedProvider = this.normalizeProviderForTask(kind, provider || this.plugin.settings[kind]?.provider);
        const profile = this.plugin.getTaskProviderProfile(kind, normalizedProvider);
        const current = String(this.plugin.settings[kind]?.model || "").trim();
        const saved = Array.isArray(profile?.recentModels) ? profile.recentModels : [];
        const fallback = [];
        if (normalizedProvider === "deepseek") {
            DEEPSEEK_MODELS.forEach(([value]) => { if (value) fallback.push(value); });
            fallback.push("deepseek-chat", "deepseek-reasoner");
        }
        else if (normalizedProvider === "sakuraLocal") {
            fallback.push("local-model");
        }
        const seen = new Set();
        const ordered = [];
        for (const candidate of [current, ...saved, ...fallback]) {
            const text = String(candidate || "").trim();
            if (!text || seen.has(text)) continue;
            seen.add(text);
            ordered.push(text);
        }
        return ordered;
    },

    normalizeSavedServiceConfigEntry(entry) {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
        const provider = String(entry.provider || "").trim();
        if (!provider || !PROVIDER_DEFAULTS[provider]) return null;
        if (entry.endpoint !== undefined && typeof entry.endpoint !== "string") return null;
        const preset = PROVIDER_DEFAULTS[provider] || {};
        const endpoint = String(entry.endpoint !== undefined ? entry.endpoint : (preset.endpoint || "")).trim();
        const model = String(entry.model !== undefined ? entry.model : (preset.model || "")).trim();
        const apiKey = typeof entry.apiKey === "string" ? entry.apiKey : "";
        const region = typeof entry.region === "string" ? entry.region.trim() : "";
        const deeplPlan = ["free", "pro"].includes(String(entry.deeplPlan || "")) ? String(entry.deeplPlan) : (preset.deeplPlan || "free");
        const appId = typeof entry.appId === "string" ? entry.appId.trim() : "";
        const secretKey = typeof entry.secretKey === "string" ? entry.secretKey : "";
        const enableThinking = entry.enableThinking === true;
        const verifiedAt = Number(entry.verifiedAt);
        const latencyMs = Number(entry.latencyMs);
        const reportedModel = this.getDiagnosticModelLabel(entry.reportedModel || "");
        const id = String(entry.id || "").trim() || `svc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        return {
            id,
            provider,
            apiKey,
            endpoint,
            model,
            enableThinking,
            region,
            deeplPlan,
            appId,
            secretKey,
            verifiedAt: Number.isFinite(verifiedAt) && verifiedAt > 0 ? Math.round(verifiedAt) : Date.now(),
            latencyMs: Number.isFinite(latencyMs) && latencyMs >= 0 ? Math.round(latencyMs) : null,
            reportedModel
        };
    },

    normalizeSavedServiceConfigs(list) {
        if (!Array.isArray(list)) return [];
        const normalized = [];
        const seenKeys = new Set();
        const seenIds = new Set();
        for (const raw of list) {
            const entry = this.normalizeSavedServiceConfigEntry(raw);
            if (!entry) continue;
            const identity = this.getServiceConfigIdentityKey(entry);
            if (!identity || seenKeys.has(identity)) continue;
            seenKeys.add(identity);
            while (seenIds.has(entry.id)) {
                entry.id = `svc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            }
            seenIds.add(entry.id);
            normalized.push(entry);
            if (normalized.length >= MAX_SAVED_SERVICE_CONFIGS) break;
        }
        return normalized;
    },

    getServiceConfigIdentityKey(config) {
        const provider = String(config?.provider || "").trim();
        if (!provider || !PROVIDER_DEFAULTS[provider]) return "";
        const preset = PROVIDER_DEFAULTS[provider] || {};
        const chatCompletion = this.isChatCompletionProvider(provider);
        const endpoint = String(config?.endpoint || "").trim();
        const deeplPlan = provider === "deepl" ? this.plugin.normalizeDeepLPlan(config?.deeplPlan) : "";
        let endpointKey;
        if (provider === "microsoft") {
            endpointKey = endpoint || preset.endpoint || "";
            try {
                const url = new URL(endpointKey);
                url.hash = "";
                endpointKey = url.href;
            }
            catch {}
        }
        else {
            endpointKey = this.plugin.providerLayer.getProviderEndpointIdentity({ provider, endpoint, deeplPlan });
        }
        const model = chatCompletion
            ? String(config?.model || preset.model || "").trim()
            : "";
        const region = provider === "microsoft" ? String(config?.region || "").trim().toLowerCase() : "";
        const appIdKey = provider === "baidu" && String(config?.appId || "").trim()
            ? this.plugin.getTextFingerprint(String(config.appId).trim())
            : "";
        return JSON.stringify([provider, endpointKey, model, region, deeplPlan, appIdKey]);
    },

    formatServiceConfigLabel(config) {
        const provider = String(config?.provider || "").trim();
        const providerName = this.getProviderDisplayName(provider);
        const parts = [providerName];
        if (this.isChatCompletionProvider(provider)) {
            const modelName = this.getDiagnosticModelLabel(config?.model || config?.reportedModel || "");
            if (modelName) parts.push(modelName);
            const rawEndpoint = String(config?.endpoint || "").trim();
            const defaultEndpoint = String(PROVIDER_DEFAULTS[provider]?.endpoint || "").trim();
            try {
                const host = rawEndpoint ? new URL(rawEndpoint).host : "";
                const defaultHost = defaultEndpoint ? new URL(defaultEndpoint).host : "";
                if (host && host !== defaultHost) parts.push(host);
            }
            catch {}
        }
        else if (provider === "deepl") {
            parts.push(this.plugin.t(config?.deeplPlan === "pro" ? "deeplPlanPro" : "deeplPlanFree"));
        }
        else if (provider === "microsoft" && String(config?.region || "").trim()) {
            parts.push(String(config.region).trim());
        }
        return parts.filter(Boolean).join(" · ");
    },

    getSavedServiceConfigsForTask(kind) {
        const list = Array.isArray(this.plugin.settings?.serviceConfigs) ? this.plugin.settings.serviceConfigs : [];
        return list.filter(entry => entry && this.isProviderAllowedForTask(kind, entry.provider));
    },

    findMatchingSavedServiceConfig(kind) {
        const task = this.plugin.settings?.[kind];
        if (!task) return null;
        const identity = this.getServiceConfigIdentityKey(task);
        if (!identity) return null;
        const list = this.getSavedServiceConfigsForTask(kind);
        return list.find(entry => {
            if (this.getServiceConfigIdentityKey(entry) !== identity) return false;
            if (String(entry.apiKey || "") !== String(task.apiKey || "")) return false;
            if (entry.provider === "baidu" && String(entry.secretKey || "") !== String(task.secretKey || "")) return false;
            if (entry.provider === "deepseek" && Boolean(entry.enableThinking) !== Boolean(task.enableThinking)) return false;
            return true;
        }) || null;
    },

    isTaskAtPristineDefault(kind) {
        const task = this.plugin.settings?.[kind];
        const defaults = DEFAULT_SETTINGS[kind];
        if (!task || !defaults) return false;
        if (task.provider !== defaults.provider) return false;
        if (String(task.apiKey || "").trim()) return false;
        if (String(task.secretKey || "").trim()) return false;
        if (String(task.appId || "").trim()) return false;
        if (String(task.endpoint || "") !== String(defaults.endpoint || "")) return false;
        if (String(task.model || "") !== String(defaults.model || "")) return false;
        if (task.apiStatus?.state && task.apiStatus.state !== "untested") return false;
        const profiles = task.providerProfiles;
        if (profiles && typeof profiles === "object") {
            for (const profile of Object.values(profiles)) {
                if (!profile || typeof profile !== "object") continue;
                if (String(profile.apiKey || "").trim() || String(profile.secretKey || "").trim() || String(profile.appId || "").trim()) {
                    return false;
                }
            }
        }
        return true;
    },

    saveVerifiedServiceConfig(kind, configOverride = null, options = {}) {
        const source = configOverride || this.plugin.settings?.[kind];
        if (!source || !this.plugin.hasUsableApiConfig(kind, source)) return { entry: null, syncedTo: "" };
        const entry = this.normalizeSavedServiceConfigEntry({
            provider: source.provider,
            apiKey: source.apiKey,
            endpoint: source.endpoint,
            model: source.model,
            enableThinking: source.enableThinking,
            region: source.region,
            deeplPlan: source.deeplPlan,
            appId: source.appId,
            secretKey: source.secretKey,
            verifiedAt: Date.now(),
            latencyMs: options.latencyMs,
            reportedModel: options.model
        });
        if (!entry) return { entry: null, syncedTo: "" };
        if (!Array.isArray(this.plugin.settings.serviceConfigs)) this.plugin.settings.serviceConfigs = [];
        const identity = this.getServiceConfigIdentityKey(entry);
        const existingIndex = this.plugin.settings.serviceConfigs.findIndex(item => this.getServiceConfigIdentityKey(item) === identity);
        if (existingIndex >= 0) {
            entry.id = this.plugin.settings.serviceConfigs[existingIndex].id || entry.id;
            this.plugin.settings.serviceConfigs.splice(existingIndex, 1);
        }
        this.plugin.settings.serviceConfigs.unshift(entry);
        if (this.plugin.settings.serviceConfigs.length > MAX_SAVED_SERVICE_CONFIGS) {
            this.plugin.settings.serviceConfigs.length = MAX_SAVED_SERVICE_CONFIGS;
        }
        this.saveTaskProviderProfile(kind, entry.provider);
        if (entry.model) this.rememberTaskProviderModel(kind, entry.provider, entry.model);

        let syncedTo = "";
        if (options.autoSync !== false) {
            const otherKind = kind === "translation" ? "polish" : "translation";
            if (
                this.isProviderAllowedForTask(otherKind, entry.provider)
                && this.plugin.settings[otherKind]?.enabled !== false
                && this.isTaskAtPristineDefault(otherKind)
            ) {
                if (this.applySavedServiceConfig(otherKind, entry.id, { silent: true, save: false, refreshUi: false })) {
                    syncedTo = otherKind;
                }
            }
        }
        if (options.save !== false) this.plugin.saveSettings({ debounce: true });
        if (options.refreshUi !== false) {
            if (syncedTo) this.syncTaskControlsInOpenPanels(syncedTo);
            this.plugin.refreshSavedServiceConfigControls();
        }
        return { entry, syncedTo };
    },

    syncTaskControlsInOpenPanels(kind) {
        if (typeof document === "undefined" || !kind) return;
        const tabId = kind === "polish" ? SETTINGS_TAB_COMPOSE : SETTINGS_TAB_TRANSLATE;
        const currentProvider = String(this.plugin.settings[kind]?.provider || "");
        let panels = [];
        try {
            panels = [...(document.querySelectorAll?.(".dait-settings") || [])];
        }
        catch {
            panels = [];
        }
        panels.forEach(panel => {
            const state = panel?.__daitSettingsUi;
            const tab = state?.tabs?.find?.(item => item.id === tabId);
            if (!tab?.tabpanel) return;
            const renderedProvider = tab.tabpanel.querySelector?.(".dait-provider-settings-block")?.dataset?.daitProvider || "";
            if (renderedProvider && currentProvider && renderedProvider !== currentProvider && tab.tabpanel.replaceWith) {
                const isVisible = !tab.tabpanel.hidden;
                const fresh = this.plugin.createSettingsTabPanel(state, tab, isVisible);
                tab.tabpanel.replaceWith(fresh);
                tab.tabpanel = fresh;
                this.plugin.syncSettingsDependentRows?.(fresh);
            }
        });
        const task = this.plugin.settings[kind];
        if (!task) return;
        ["provider", "apiKey", "endpoint", "model", "enableThinking"].forEach(field => {
            this.plugin.syncSettingControls(`${kind}.${field}`, task[field], { includeActive: true });
        });
        if (kind === "translation") {
            ["region", "deeplPlan", "appId", "secretKey"].forEach(field => {
                this.plugin.syncSettingControls(`translation.${field}`, task[field], { includeActive: true });
            });
        }
    },

    applySavedServiceConfig(kind, configId, options = {}) {
        const task = this.plugin.settings?.[kind];
        const list = Array.isArray(this.plugin.settings?.serviceConfigs) ? this.plugin.settings.serviceConfigs : [];
        const entry = list.find(item => item && item.id === configId);
        if (!task || !entry || !this.isProviderAllowedForTask(kind, entry.provider)) return false;
        const previousProvider = this.normalizeProviderForTask(kind, task.provider);
        if (previousProvider && previousProvider !== entry.provider) {
            this.saveTaskProviderProfile(kind, previousProvider);
        }
        const preset = PROVIDER_DEFAULTS[entry.provider] || {};
        task.provider = entry.provider;
        task.apiKey = entry.apiKey || "";
        task.endpoint = entry.endpoint || preset.endpoint || "";
        delete task.apiKeyOrigin;
        task.model = entry.model || preset.model || "";
        task.enableThinking = entry.provider === "deepseek" ? Boolean(entry.enableThinking) : false;
        if (kind === "translation") {
            task.region = entry.region || "";
            task.deeplPlan = ["free", "pro"].includes(entry.deeplPlan) ? entry.deeplPlan : (preset.deeplPlan || "free");
            task.appId = entry.appId || "";
            task.secretKey = entry.secretKey || "";
            this.plugin.applyProviderIntakeMode(entry.provider);
        }
        this.saveTaskProviderProfile(kind, entry.provider);
        if (task.model) this.rememberTaskProviderModel(kind, entry.provider, task.model);
        task.apiStatus = { state: "success", message: "" };
        this.plugin.recordApiTestResult?.(kind, {
            ok: true,
            model: entry.reportedModel || (this.isChatCompletionProvider(entry.provider) ? this.getDiagnosticModelLabel(task.model) : ""),
            latencyMs: entry.latencyMs,
            at: entry.verifiedAt || Date.now(),
            message: ""
        });
        if (kind === "translation") this.plugin.invalidateAutoTranslationQueue();
        if (options.save !== false) this.plugin.saveSettings();
        if (options.refreshUi !== false) {
            this.plugin.syncSettingControls(`${kind}.provider`, task.provider, { includeActive: true });
            this.plugin.syncSettingControls(`${kind}.apiKey`, task.apiKey, { includeActive: true });
            this.plugin.syncSettingControls(`${kind}.endpoint`, task.endpoint, { includeActive: true });
            this.plugin.syncSettingControls(`${kind}.model`, task.model, { includeActive: true });
            this.plugin.syncSettingControls(`${kind}.enableThinking`, task.enableThinking, { includeActive: true });
            if (kind === "translation") {
                this.plugin.syncSettingControls("translation.region", task.region, { includeActive: true });
                this.plugin.syncSettingControls("translation.deeplPlan", task.deeplPlan, { includeActive: true });
                this.plugin.syncSettingControls("translation.appId", task.appId, { includeActive: true });
                this.plugin.syncSettingControls("translation.secretKey", task.secretKey, { includeActive: true });
            }
            this.syncTaskControlsInOpenPanels(kind);
            this.plugin.refreshApiTestViews(kind);
            this.plugin.refreshSavedServiceConfigControls();
            if (kind === "translation") this.plugin.quickPanel?.clearConfigError?.();
            this.plugin.quickPanel?.scheduleUpdate?.();
            this.plugin.quickPanel?.requestStatusUpdate?.();
            this.plugin.queueScan();
        }
        if (options.silent !== true) {
            this.plugin.showToast(this.plugin.t("savedServiceConfigApplied", { name: this.formatServiceConfigLabel(entry) }), "success");
        }
        return true;
    },

    syncTaskServiceConfig(fromKind, toKind, options = {}) {
        const fromTask = this.plugin.settings?.[fromKind];
        const toTask = this.plugin.settings?.[toKind];
        if (!fromTask || !toTask || fromKind === toKind) return false;
        const provider = this.normalizeProviderForTask(fromKind, fromTask.provider);
        if (!this.isProviderAllowedForTask(toKind, provider)) {
            if (options.silent !== true) this.plugin.showToast(this.plugin.t("syncConfigUnsupportedPolish"), "info");
            return false;
        }
        if (!this.plugin.hasUsableApiConfig(fromKind)) {
            if (options.silent !== true) this.plugin.showToast(this.plugin.t("syncConfigMissing"), "info");
            return false;
        }
        const previousTargetProvider = this.normalizeProviderForTask(toKind, toTask.provider);
        if (previousTargetProvider && previousTargetProvider !== provider) {
            this.saveTaskProviderProfile(toKind, previousTargetProvider);
        }
        const preset = PROVIDER_DEFAULTS[provider] || {};
        toTask.provider = provider;
        toTask.apiKey = fromTask.apiKey || "";
        toTask.endpoint = fromTask.endpoint || preset.endpoint || "";
        toTask.apiKeyOrigin = fromTask.apiKeyOrigin;
        toTask.model = fromTask.model || preset.model || "";
        toTask.enableThinking = provider === "deepseek" ? Boolean(fromTask.enableThinking) : false;
        this.saveTaskProviderProfile(toKind, provider);
        if (toTask.model) this.rememberTaskProviderModel(toKind, provider, toTask.model);
        if (toKind === "translation") this.plugin.applyProviderIntakeMode(provider);

        const fromStatus = this.plugin.getApiStatus(fromKind);
        if (fromStatus.state === "success") {
            toTask.apiStatus = { state: "success", message: "" };
            const lastResult = this.plugin.getLastApiTestResult?.(fromKind);
            if (lastResult?.ok) this.plugin.recordApiTestResult?.(toKind, lastResult);
            this.plugin.saveVerifiedServiceConfig(fromKind, fromTask, {
                autoSync: false,
                save: false,
                refreshUi: false,
                latencyMs: lastResult?.latencyMs,
                model: lastResult?.model
            });
        }
        else {
            this.plugin.resetApiStatus(toKind, { save: false });
        }
        if (toKind === "translation") this.plugin.invalidateAutoTranslationQueue();
        if (options.save !== false) this.plugin.saveSettings();
        if (options.refreshUi !== false) {
            this.syncTaskControlsInOpenPanels(toKind);
            this.plugin.refreshApiTestViews(toKind);
            this.plugin.refreshSavedServiceConfigControls();
        }
        this.plugin.queueScan();
        if (options.silent !== true) {
            this.plugin.showToast(this.plugin.t(toKind === "polish" ? "syncConfigDonePolish" : "syncConfigDoneTranslation"), "success");
        }
        return true;
    },

    deleteSavedServiceConfig(configId, options = {}) {
        if (!Array.isArray(this.plugin.settings?.serviceConfigs)) return false;
        const index = this.plugin.settings.serviceConfigs.findIndex(item => item && item.id === configId);
        if (index < 0) return false;
        this.plugin.settings.serviceConfigs.splice(index, 1);
        if (options.save !== false) this.plugin.saveSettings();
        if (options.refreshUi !== false) this.plugin.refreshSavedServiceConfigControls();
        if (options.silent !== true) this.plugin.showToast(this.plugin.t("savedServiceConfigDeleted"), "info");
        return true;
    },

    applyProviderPreset(kind, provider, options = {}) {
        const preset = PROVIDER_DEFAULTS[provider];
        if (!preset || !this.plugin.settings[kind]) return;
        const profile = options.restoreProfile ? this.plugin.getTaskProviderProfile(kind, provider) : null;
        this.plugin.settings[kind].endpoint = profile?.endpoint ?? preset.endpoint;
        this.plugin.settings[kind].model = profile?.model ?? preset.model;
        this.plugin.settings[kind].region = profile?.region ?? preset.region ?? "";
        this.plugin.settings[kind].deeplPlan = profile?.deeplPlan ?? preset.deeplPlan ?? "free";
        this.plugin.settings[kind].appId = profile?.appId ?? preset.appId ?? "";
        this.plugin.settings[kind].secretKey = profile?.secretKey ?? preset.secretKey ?? "";
        if (options.restoreProfile) {
            this.plugin.settings[kind].apiKey = profile?.apiKey ?? "";
            this.plugin.settings[kind].apiKeyOrigin = profile?.apiKeyOrigin;
            this.plugin.settings[kind].enableThinking = typeof profile?.enableThinking === "boolean" ? profile.enableThinking : false;
        }
        if (options.save !== false) this.plugin.saveSettings();
        if (options.syncControls !== false) {
            this.plugin.syncSettingControls(`${kind}.endpoint`, this.plugin.settings[kind].endpoint);
            this.plugin.syncSettingControls(`${kind}.model`, this.plugin.settings[kind].model);
            this.plugin.syncSettingControls(`${kind}.region`, this.plugin.settings[kind].region);
            this.plugin.syncSettingControls(`${kind}.deeplPlan`, this.plugin.settings[kind].deeplPlan);
            this.plugin.syncSettingControls(`${kind}.appId`, this.plugin.settings[kind].appId);
            this.plugin.syncSettingControls(`${kind}.secretKey`, this.plugin.settings[kind].secretKey);
            if (options.restoreProfile) {
                this.plugin.syncSettingControls(`${kind}.apiKey`, this.plugin.settings[kind].apiKey);
                this.plugin.syncSettingControls(`${kind}.enableThinking`, this.plugin.settings[kind].enableThinking);
            }
        }
        if (kind === "translation" && options.invalidate !== false) this.plugin.invalidateAutoTranslationQueue();
    },

    isChatCompletionProvider(configOrProvider) {
        return !this.plugin.isDirectTranslateProvider(configOrProvider);
    },

    getDiagnosticModelLabel(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        const normalized = text.replace(/\\/g, "/");
        const basename = normalized.split("/").filter(Boolean).pop() || text;
        return basename.length > 120 ? `${basename.slice(0, 120)}...` : basename;
    },

    isProviderApiKeyOptional(provider) {
        return this.plugin.getProviderDefaults(provider)?.apiKeyOptional === true;
    },

    inferDiagnosticStageFromAction(action = "", status = "", meta = {}) {
        const value = String(action || "");
        if (meta.flowStage) return String(meta.flowStage);
        if (value.includes("whole-pass")) return DIAGNOSTIC_FAILURE_LAYERS.REQUEST;
        if (value.includes(".intake") || value.includes(".source")) return DIAGNOSTIC_FAILURE_LAYERS.SOURCE;
        if (value.includes(".plan")) return DIAGNOSTIC_FAILURE_LAYERS.PLAN;
        if (value.includes(".queue")) return DIAGNOSTIC_FAILURE_LAYERS.QUEUE;
        if (value.includes(".request") || value === "model.request") return DIAGNOSTIC_FAILURE_LAYERS.REQUEST;
        if (value.includes(".output")) return DIAGNOSTIC_FAILURE_LAYERS.OUTPUT;
        if (value.includes(".validation") || value.includes(".rescue")) return DIAGNOSTIC_FAILURE_LAYERS.VALIDATION;
        if (value.includes(".render") || String(status || "") === "render-deferred") return DIAGNOSTIC_FAILURE_LAYERS.RENDER;
        if (value.includes(".long-text")) return meta.subchunkIndex !== undefined || meta.chunkIndex !== undefined
            ? DIAGNOSTIC_FAILURE_LAYERS.VALIDATION
            : DIAGNOSTIC_FAILURE_LAYERS.PLAN;
        return "";
    },

    logQuickSettingsDiagnostic(action, status = "info", meta = {}) {
        const entry = this.createDiagnosticEntry(`quick.settings.${action}`, status, meta);
        this.plugin.quickSettingsDiagnosticLogs.push(entry);
        while (this.plugin.quickSettingsDiagnosticLogs.length > QUICK_SETTINGS_DIAGNOSTICS_MAX_ENTRIES) this.plugin.quickSettingsDiagnosticLogs.shift();
        if (this.plugin.settings.ui?.diagnosticsEnabled) this.plugin.logDiagnostic(`quick.settings.${action}`, status, meta);
        const payload = {
            status: entry.status,
            meta: entry.meta
        };
        try {
            const shouldWarn = status === "error" || status === "failed";
            if (shouldWarn || this.plugin.settings.ui?.diagnosticsEnabled) {
                const logger = shouldWarn ? console.warn : console.info;
                logger?.call?.(console, `[${PLUGIN_NAME}] quick.settings.${action}`, payload);
            }
        }
        catch {}
        return entry;
    },

    createDiagnosticEntry(action, status = "info", meta = {}) {
        const ts = Date.now();
        const sanitizedMeta = this.plugin.sanitizeDiagnosticMeta(this.plugin.enrichDiagnosticMeta(action, status, meta));
        const groupKey = this.getDiagnosticGroupKey(action, status, sanitizedMeta);
        return {
            ts,
            iso: new Date(ts).toISOString(),
            firstTs: ts,
            firstIso: new Date(ts).toISOString(),
            lastTs: ts,
            lastIso: new Date(ts).toISOString(),
            action: String(action || "unknown"),
            status: String(status || "info"),
            key: sanitizedMeta.key || sanitizedMeta.sourceHash || sanitizedMeta.cacheHash || "",
            count: 1,
            ms: Number.isFinite(Number(sanitizedMeta.ms)) ? Number(sanitizedMeta.ms) : undefined,
            meta: sanitizedMeta,
            groupKey
        };
    },

    getDiagnosticGroupKey(action, status, meta = {}) {
        if (action === "cache.lookup" && ["hit", "miss", "expired"].includes(status)) {
            return [
                action,
                status,
                meta.aliases || "",
                meta.size || ""
            ].join("|");
        }
        const routineAutoState = action === "auto.message.state"
            && !["error", "failed", "terminal-failed"].includes(String(status || ""))
            && !meta.failureClass
            && !meta.failureLayer;
        return [
            action,
            status,
            meta.reasonCode || meta.reason || meta.blockReason || "",
            meta.messageState || "",
            meta.failureClass || "",
            meta.failureLayer || "",
            meta.type || "",
            meta.provider || "",
            meta.model || "",
            meta.mode || "",
            routineAutoState ? "" : (meta.key || meta.sourceHash || meta.cacheHash || "")
        ].join("|");
    },

    sanitizeDiagnosticObject(value) {
        const result = {};
        Object.entries(value || {}).slice(0, 24).forEach(([key, item]) => {
            if (this.isSensitiveDiagnosticKey(key)) return;
            result[key] = String(key || "").toLowerCase().includes("model")
                ? this.getDiagnosticModelLabel(item)
                : this.sanitizeDiagnosticValue(item);
        });
        return result;
    },

    isSensitiveDiagnosticKey(key) {
        const value = String(key || "").trim();
        const normalized = value.toLowerCase();
        if (SAFE_DIAGNOSTIC_KEYS.has(normalized)) return false;
        if (SENSITIVE_DIAGNOSTIC_KEYS.has(normalized)) return true;
        return /api.?key|authorization|token|password|secret|body|prompt|message|endpoint|url|uri|guild.*id|channel.*id|author.*id|user.*id/i.test(value);
    },

    sanitizeDiagnosticValue(value) {
        if (value === null || typeof value === "boolean") return value;
        if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
        const text = String(value)
            .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
            .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[redacted-api-key]")
            .replace(/\bAIza[0-9A-Za-z_-]{10,}\b/g, "[redacted-google-key]")
            .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]");
        return text.length > 180 ? `${text.slice(0, 180)}...` : text;
    },

    getTopDiagnosticCounts(map = {}, limit = 8) {
        return Object.entries(map || {})
            .map(([key, count]) => ({ key, count: Number(count || 0) || 0 }))
            .filter(item => item.key && item.count > 0)
            .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
            .slice(0, Math.max(1, Number(limit) || 8));
    },

    inferDiagnosticFlowFromAction(action) {
        const value = String(action || "");
        if (value.startsWith("auto.")) return "auto";
        if (value.startsWith("manual.")) return "manual";
        if (value.startsWith("cache.")) return "cache";
        if (value.startsWith("model.")) return "model";
        if (value.startsWith("polish")) return "polish";
        if (value.startsWith("public.bilingual")) return "public-bilingual";
        if (value.startsWith("quick.settings")) return "quick-settings";
        return value.split(".")[0] || "unknown";
    },

    createDiagnosticHumanSummary(summary = {}) {
        const lines = [];
        const topFailureClass = summary.top?.failureClasses?.[0];
        const topFailureLayer = summary.top?.failureLayers?.[0];
        const topReason = summary.top?.reasonCodes?.[0];
        const topValidation = summary.top?.validationQualities?.[0];
        if (topFailureClass) {
            lines.push(`top failure: ${topFailureClass.key} (${topFailureClass.count})${topFailureLayer ? ` at ${topFailureLayer.key}` : ""}`);
        }
        if (topReason) lines.push(`top reason: ${topReason.key} (${topReason.count})`);
        if (topValidation) lines.push(`validation: ${topValidation.key} (${topValidation.count})`);
        const decisions = Array.isArray(summary.lastAutoTranslationDecisions) ? summary.lastAutoTranslationDecisions : [];
        const repeated = decisions.filter(entry => Number(entry.requestCount || 0) > 1).length;
        const failed = decisions.filter(entry => /failed|blocked|terminal/.test(String(entry.state || ""))).length;
        const partial = decisions.filter(entry => String(entry.validationQuality || "") === TRANSLATION_VALIDATION_QUALITIES.PARTIAL).length;
        if (decisions.length) lines.push(`last decisions: ${decisions.length}, failed/blocked=${failed}, repeated=${repeated}, partial=${partial}`);
        const sourceIncomplete = summary.byFailureClass?.[DIAGNOSTIC_FAILURE_CLASSES.SOURCE_INCOMPLETE] || 0;
        const chunkFailed = summary.byFailureClass?.[DIAGNOSTIC_FAILURE_CLASSES.CHUNK_FAILED] || 0;
        const wholeFailed = summary.byFailureClass?.[DIAGNOSTIC_FAILURE_CLASSES.WHOLE_PASS_FAILED] || 0;
        if (sourceIncomplete) lines.push("source check: MessageStore/BDFDB did not provide a compatible full message for at least one item.");
        if (wholeFailed || chunkFailed) lines.push("long text check: inspect manual.long-text.whole-pass and auto.long-text.chunk entries for failed chunk indexes and invalidReason.");
        if (!lines.length) lines.push("no important failure pattern captured yet; reproduce with diagnostics enabled.");
        return lines.slice(0, 8);
    },

    getDiagnosticInterpretationChecklist() {
        return [
            {
                step: "last-decision",
                read: "lastAutoTranslationDecisions",
                meaning: "Find the message by messageIdentityHash/textHash and inspect state, reasonCode, queueType, requestCount, validationQuality, and lastErrorType."
            },
            {
                step: "not-requested",
                read: "state=skipped|blocked|queued with requestCount=0",
                meaning: "The message did not reach the model. Check reasonCode for language precheck, current line, provider cooldown, viewport settling, or queue limits."
            },
            {
                step: "requested-no-render",
                read: "requestCount>0 with state=failed|render-deferred|blocked",
                meaning: "The model was called. Check validationQuality, lastErrorType, render reasonCode, and recentImportant."
            },
            {
                step: "loop-check",
                read: "requestCount>1 for the same messageIdentityHash/textHash",
                meaning: "Repeated requests are happening for the same logical message and should be treated as a queue/dedupe regression."
            },
            {
                step: "coverage-check",
                read: "reasonCode=not-eligible-language",
                meaning: "The precheck skipped the text. If the text is mixed language, price, address, refund, name, or product text, add it as a coverage regression."
            },
            {
                step: "long-text-check",
                read: "validationQuality=partial or action=auto.long-text",
                meaning: "Long text produced a partial result. Failed chunks should not be stored as permanent complete cache."
            }
        ];
    },

    getSanitizedDiagnosticRouteIds(route = {}) {
        return {
            guildId: this.getDiagnosticIdentifierHash(route.guildId),
            channelId: this.getDiagnosticIdentifierHash(route.channelId),
            messageId: this.getDiagnosticIdentifierHash(route.messageId)
        };
    },

    getDiagnosticIdentifierHash(value) {
        const text = String(value || "").trim();
        return text ? this.plugin.getTextFingerprint(text) : "";
    },

    normalizePersistedDiagnosticEntry(entry) {
        if (!entry || typeof entry !== "object") return null;
        const ts = Number(entry.ts || Date.parse(entry.iso || "") || Date.now());
        const meta = this.plugin.sanitizeDiagnosticMeta(entry.meta || {});
        const action = String(entry.action || "unknown");
        const status = String(entry.status || "info");
        return {
            ts,
            iso: entry.iso || new Date(ts).toISOString(),
            firstTs: Number(entry.firstTs || ts),
            firstIso: entry.firstIso || entry.iso || new Date(ts).toISOString(),
            lastTs: Number(entry.lastTs || ts),
            lastIso: entry.lastIso || entry.iso || new Date(ts).toISOString(),
            action,
            status,
            key: this.sanitizeDiagnosticValue(entry.key || meta.key || meta.sourceHash || meta.cacheHash || ""),
            count: Math.max(1, Number(entry.count || 1) || 1),
            ms: Number.isFinite(Number(entry.ms)) ? Number(entry.ms) : undefined,
            meta,
            groupKey: entry.groupKey || this.getDiagnosticGroupKey(action, status, meta)
        };
    },

    getHeavyPersistenceIdleField(kind = "diagnostics") {
        return kind === "cache" ? "translationCacheIdleCallback" : "diagnosticLogsIdleCallback";
    },

    cancelHeavyPersistenceIdle(kind = "diagnostics") {
        const field = this.getHeavyPersistenceIdleField(kind);
        const callbackId = this.plugin[field];
        if (callbackId !== null && typeof window !== "undefined") {
            try { window.cancelIdleCallback?.(callbackId); }
            catch {}
        }
        this.plugin[field] = null;
    },

    scheduleHeavyPersistenceIdle(kind, callback) {
        const field = this.getHeavyPersistenceIdleField(kind);
        if (this.plugin[field] !== null) return;
        if (typeof window === "undefined" || typeof window.requestIdleCallback !== "function") {
            callback();
            return;
        }
        this.plugin[field] = window.requestIdleCallback(deadline => {
            this.plugin[field] = null;
            if (!this.plugin.isStarted && !this.plugin.lifecycleStarted) return;
            const minRemainingMs = kind === "cache" ? 24 : 16;
            const inputPending = Boolean(globalThis.navigator?.scheduling?.isInputPending?.());
            const remainingMs = typeof deadline?.timeRemaining === "function" ? deadline.timeRemaining() : 0;
            if (inputPending || (!deadline?.didTimeout && remainingMs < minRemainingMs)) {
                if (kind === "cache") this.plugin.scheduleTranslationCachePersist(HEAVY_PERSISTENCE_DEFER_MS);
                else this.plugin.scheduleDiagnosticLogsPersist(HEAVY_PERSISTENCE_DEFER_MS, { force: true });
                return;
            }
            callback();
        }, { timeout: 10000 });
    },

    shouldDeferHeavyPersistence(kind = "generic", now = Date.now()) {
        const busy = this.plugin.isStarted
            && (this.plugin.isQuickSettingsPanelOpen()
                || this.plugin.isDiscordMediaViewerQuiet(now)
                || this.plugin.isAutoTranslationRenderPaused(now)
                || this.plugin.isAutoTranslationViewportSettling(now)
                || this.plugin.isAutoTranslationJumpCoolingDown(now)
                || this.plugin.getInputComposerBusyRemainingMs(now) > 0
                || Boolean(globalThis.navigator?.scheduling?.isInputPending?.()));
        const key = kind === "cache" ? "translationCachePersistenceDeferredSince" : "diagnosticLogsPersistenceDeferredSince";
        if (!busy) {
            this.plugin[key] = 0;
            return false;
        }
        const deferredSince = Number(this.plugin[key] || 0);
        if (!deferredSince) {
            this.plugin[key] = now;
            return true;
        }
        if (now - deferredSince >= HEAVY_PERSISTENCE_MAX_DEFER_MS) {
            this.plugin[key] = 0;
            return false;
        }
        return true;
    },

    disableDiagnosticLogging() {
        this.plugin.diagnosticLogs = [];
        this.plugin.quickSettingsDiagnosticLogs = [];
        this.plugin.lastAutoTranslationDecisions = new Map();
        this.plugin.diagnosticCompressedCount = 0;
        this.plugin.diagnosticLogsLoaded = true;
        this.plugin.diagnosticLogsDirty = true;
        return this.plugin.flushDiagnosticLogs();
    },

    async copyDiagnosticLogs() {
        if (!this.plugin.diagnosticLogs.length && !this.plugin.quickSettingsDiagnosticLogs.length) {
            this.plugin.showToast(this.plugin.t("diagnosticLogsEmpty"), "info");
            return false;
        }
        try {
            await this.plugin.copyTextToClipboard(this.plugin.serializeDiagnosticLogs("json"));
            this.plugin.showToast(this.plugin.t("diagnosticLogsCopied"), "success");
            return true;
        }
        catch (error) {
            this.plugin.showToast(this.plugin.t("promptCopyFailed", { error: this.plugin.formatError(error) }), "error");
            return false;
        }
    },

    async exportDiagnosticLogs(format = "json") {
        if (!this.plugin.diagnosticLogs.length && !this.plugin.quickSettingsDiagnosticLogs.length) {
            this.plugin.showToast(this.plugin.t("diagnosticLogsEmpty"), "info");
            return false;
        }
        const normalized = format === "txt" ? "txt" : "json";
        const text = this.plugin.serializeDiagnosticLogs(normalized);
        const filename = `${PLUGIN_NAME}-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.${normalized}`;
        const mime = normalized === "json" ? "application/json" : "text/plain";
        return this.saveTextOrCopy(filename, text, mime, { saved: "diagnosticLogsExported", copied: "diagnosticLogsCopied" });
    },

    async exportSettingsSnapshot() {
        const text = JSON.stringify(this.createSettingsSnapshot(), null, 2);
        const filename = `${PLUGIN_NAME}-settings-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        return this.saveTextOrCopy(filename, text, "application/json", { saved: "settingsSnapshotExported", copied: "settingsSnapshotCopied" });
    },

    // Downloads the text, falling back to the clipboard where downloads are unavailable.
    async saveTextOrCopy(filename, text, mime, messageKeys) {
        try {
            if (this.plugin.downloadTextFile(filename, text, mime)) {
                this.plugin.showToast(this.plugin.t(messageKeys.saved), "success");
                return true;
            }
            await this.plugin.copyTextToClipboard(text);
            this.plugin.showToast(this.plugin.t(messageKeys.copied), "success");
            return true;
        }
        catch (error) {
            this.plugin.showToast(this.plugin.t("promptCopyFailed", { error: this.plugin.formatError(error) }), "error");
            return false;
        }
    },

    // Troubleshooting copy of the settings: switches and numbers as-is, secrets and private text reduced to markers.
    createSettingsSnapshot() {
        const secretKeys = new Set(["apikey", "secretkey", "appid", "keypooltext", "keys", "token", "password", "authorization"]);
        const sanitize = (value, key = "", defaults = undefined) => {
            const name = String(key).toLowerCase();
            if (secretKeys.has(name)) {
                if (Array.isArray(value)) return value.length ? `[hidden: ${value.length}]` : [];
                return String(value ?? "").trim() ? "[hidden]" : "";
            }
            if (name === "endpoint") return this.getSettingsSnapshotEndpoint(value);
            // A model can be a local file path that contains the Windows user name.
            if (name === "model" || name === "reportedmodel") return this.getDiagnosticModelLabel(value);
            if (name === "recentmodels" && Array.isArray(value)) return value.map(item => this.getDiagnosticModelLabel(item));
            if (name === "usagebyid") return `[hidden: ${Object.keys(value || {}).length}]`;
            if (name === "prompt") return value === defaults ? "default" : `custom (${String(value ?? "").length} chars)`;
            if (name === "prompttemplates") return `${Array.isArray(value) ? value.length : 0} templates`;
            if (name === "channelautotranslatepolicies") {
                return Object.fromEntries(Object.entries(value || {}).map(([id, policy]) => [`channel-${this.plugin.getTextFingerprint(id)}`, sanitize(policy)]));
            }
            if (Array.isArray(value)) return value.map(item => sanitize(item));
            if (value && typeof value === "object") {
                return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey, defaults?.[childKey])]));
            }
            return typeof value === "string" ? this.sanitizeDiagnosticValue(value) : value;
        };
        return {
            plugin: PLUGIN_NAME,
            version: PLUGIN_VERSION,
            exportedAt: new Date().toISOString(),
            effective: {
                autoTranslateActive: this.plugin.isAutoTranslateEnabled(),
                localProvider: this.plugin.isLocalTranslationProvider(this.plugin.settings.translation),
                concurrency: this.plugin.getAutoTranslateConcurrency(),
                prefetchRange: this.plugin.getAutoTranslatePrefetchRange(),
                intakeMode: this.plugin.normalizeAutoTranslateIntakeMode(this.plugin.settings.ui?.autoTranslateIntakeMode),
                // Channels that auto-translate even with the main switch off.
                allowListedChannels: this.plugin.getChannelAutoTranslateAllowListCount(),
                // The palette the plugin's windows use now (ui.panelTheme "auto" resolved against Discord's theme).
                panelTheme: this.plugin.resolvePanelTheme()
            },
            settings: sanitize(this.plugin.settings, "", DEFAULT_SETTINGS)
        };
    },

    getSettingsSnapshotEndpoint(value) {
        const text = String(value ?? "").trim();
        if (!text) return "";
        let url;
        try { url = new URL(text); }
        catch { return "[invalid]"; }
        if (url.protocol !== "http:" && url.protocol !== "https:") return "[invalid]";
        const pathname = url.pathname;
        const standardSuffix = pathname.match(
            /\/(?:(?:v[1-9]\d?\/)?(?:chat\/completions|completions|models)|v[1-9]\d?|(?:v2\/|api\/trans\/vip\/)?translate|language\/translate\/v2)\/?$/i
        );
        let pathSummary = pathname;
        if (pathname !== "/" && standardSuffix?.index !== 0) {
            const prefix = pathname.slice(0, standardSuffix?.index ?? pathname.length);
            const segments = prefix.split("/").filter(Boolean).length;
            pathSummary = `/[custom path, ${segments} segments]${standardSuffix?.[0] || ""}`;
        }
        const credentialNote = url.username || url.password ? " [credentials removed]" : "";
        return `${url.origin}${pathSummary}${credentialNote}`;
    },

    downloadTextFile(filename, text, mime = "text/plain") {
        if (typeof Blob === "undefined" || typeof URL === "undefined" || !URL.createObjectURL || typeof document === "undefined") return false;
        const link = document.createElement("a");
        if (!link) return false;
        const blob = new Blob([text], { type: `${mime};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        try {
            link.href = url;
            link.download = filename;
            link.style.display = "none";
            document.body?.appendChild?.(link);
            link.click?.();
            return true;
        }
        catch {
            return false;
        }
        finally {
            link.remove?.();
            setTimeout(() => URL.revokeObjectURL?.(url), 0);
        }
    },

    async copyTextToClipboard(text) {
        const value = String(text || "");
        const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
        if (clipboard?.writeText) {
            try {
                await clipboard.writeText(value);
                return;
            }
            catch {}
        }
        this.copyTextToClipboardFallback(value);
    },

    copyTextToClipboardFallback(text) {
        if (typeof document === "undefined" || !document.body?.appendChild) {
            throw Object.assign(new Error(this.plugin.t("clipboardUnavailable")), { code: "CLIPBOARD_UNAVAILABLE" });
        }
        const previousFocus = document.activeElement || null;
        const fallback = document.createElement("textarea");
        fallback.value = text;
        fallback.setAttribute("readonly", "readonly");
        fallback.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none;";
        let ok = false;
        try {
            document.body.appendChild(fallback);
            fallback.select?.();
            ok = Boolean(document.execCommand?.("copy"));
        }
        finally {
            fallback.remove?.();
            if (previousFocus?.focus && this.plugin.isNodeConnected(previousFocus)) {
                try { previousFocus.focus({ preventScroll: true }); }
                catch {
                    try { previousFocus.focus(); }
                    catch {}
                }
            }
        }
        if (!ok) throw Object.assign(new Error(this.plugin.t("clipboardUnavailable")), { code: "CLIPBOARD_UNAVAILABLE" });
    },

    getApiStatusText(state) {
        const key = {
            testing: "apiStatusTesting",
            success: "apiStatusSuccess",
            failed: "apiStatusFailed",
            untested: "apiStatusUntested",
            unconfigured: "quickStatusNotConfigured"
        }[state] || "apiStatusUntested";
        return this.plugin.t(key);
    },

    getTaskDisplayName(kind) {
        return kind === "polish" ? this.plugin.t("polishTitle") : this.plugin.t("translationTitle");
    },

    getTestModeKind() {
        return ["polish", "translation"].includes(this.plugin.settings.ui?.testModeKind)
            ? this.plugin.settings.ui.testModeKind
            : DEFAULT_SETTINGS.ui.testModeKind;
    }
};

const SERVICE_PROFILES_METHOD_NAMES = attachControllerMethods(ServiceProfilesController, [methods]);

module.exports = {
    ServiceProfilesController,
    SERVICE_PROFILES_METHOD_NAMES
};
