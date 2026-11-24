// @ts-check
"use strict";

/**
 * @typedef {Object} ProviderAdapter
 * @property {string} id
 * @property {string} label
 * @property {"chat"|"direct"} kind
 * @property {{ polish: boolean, translation: boolean }} tasks
 * @property {Record<string, any>} defaultProfile
 * @property {string[]} credentialFields
 * @property {boolean} [isLocal]
 * @property {boolean} [allowCloudFallback]
 * @property {boolean} [supportsModelDetection]
 * @property {boolean} [apiKeyOptional]
 * @property {string} [responseParser]
 * @property {Record<string, any>} [ui]
 * @property {(config: any, defaultConfig: any, plugin: any) => string} getEffectiveEndpoint
 * @property {(kind: string, input: any, config: any, defaultConfig: any, options: any, plugin: any) => any} buildRequest
 * @property {(raw: string, request: any, options: any, plugin: any) => any} parseResponse
 * @property {(kind: string, config: any, defaultConfig: any, plugin: any) => any} [buildTestRequest]
 * @property {(config: any, effectiveApiKey: string, plugin: any) => Record<string, string>} [buildHeaders]
 * @property {(config: any, plugin: any) => boolean} [hasUsableConfig]
 * @property {(config: any, body: any) => any} [applyBodyOptions]
 * @property {(config: any, snapshot: any, plugin: any, options?: any) => void} [applyCacheScope]
 * @property {(config: any, request: any, plugin: any) => string} [getAuthFingerprint]
 */

/**
 * Factory for OpenAI-compatible Chat Completions adapters (DeepSeek, OpenAI-compatible, Sakura local).
 * @param {Partial<ProviderAdapter> & { id: string, label: string, defaultProfile: Record<string, any> }} spec
 * @returns {ProviderAdapter}
 */
function createOpenAIChatAdapter(spec) {
    return {
        kind: "chat",
        tasks: { polish: true, translation: true },
        credentialFields: ["apiKey"],
        isLocal: false,
        allowCloudFallback: true,
        supportsModelDetection: false,
        apiKeyOptional: false,
        responseParser: "chatCompletion",
        getEffectiveEndpoint(config, defaultConfig, plugin) {
            return plugin.getEffectiveChatCompletionEndpoint(config, defaultConfig);
        },
        buildRequest(kind, input, config, defaultConfig, _options, plugin) {
            return plugin.buildChatCompletionRequest(kind, input, config, defaultConfig);
        },
        parseResponse(raw, _request, _options, plugin) {
            return plugin.parseModelResponse(raw);
        },
        ...spec
    };
}

/**
 * Pluggable provider adapter registry.
 * Adding a new AI or machine-translation provider requires only one adapter module + registry.register(adapter).
 */
class ProviderRegistry {
    constructor() {
        /** @type {Map<string, ProviderAdapter>} */
        this.adapters = new Map();
        /** @type {Map<string, Set<string>>} */
        this.byParser = new Map();
    }

    /**
     * Registers or replaces a provider adapter.
     * @param {ProviderAdapter} adapter
     * @returns {ProviderRegistry}
     */
    register(adapter) {
        if (!adapter || typeof adapter.id !== "string" || !adapter.id.trim()) {
            throw new Error("ProviderAdapter must define a non-empty string id.");
        }
        const id = adapter.id.trim();
        const previous = this.adapters.get(id);
        if (previous?.responseParser) {
            const prevSet = this.byParser.get(previous.responseParser);
            if (prevSet) {
                prevSet.delete(id);
                if (prevSet.size === 0) this.byParser.delete(previous.responseParser);
            }
        }
        this.adapters.set(id, adapter);
        if (adapter.responseParser) {
            let set = this.byParser.get(adapter.responseParser);
            if (!set) {
                set = new Set();
                this.byParser.set(adapter.responseParser, set);
            }
            set.add(id);
        }
        return this;
    }

    /**
     * Removes a registered adapter by id (useful in tests or dynamic extensions).
     * @param {string} id
     * @returns {boolean}
     */
    unregister(id) {
        const key = String(id || "").trim();
        const existing = this.adapters.get(key);
        if (!existing) return false;
        this.adapters.delete(key);
        if (existing.responseParser) {
            const set = this.byParser.get(existing.responseParser);
            if (set) {
                set.delete(key);
                if (set.size === 0) this.byParser.delete(existing.responseParser);
            }
        }
        return true;
    }

    /**
     * Resolves an adapter from a provider id string or task config object.
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {ProviderAdapter | null}
     */
    get(idOrConfig) {
        const id = typeof idOrConfig === "string" ? idOrConfig : idOrConfig?.provider;
        return this.adapters.get(String(id || "").trim()) || null;
    }

    /**
     * Resolves the canonical (first-registered) adapter for a responseParser identifier.
     * @param {string} parserName
     * @returns {ProviderAdapter | null}
     */
    getByParser(parserName) {
        const set = this.byParser.get(String(parserName || "").trim());
        if (!set || set.size === 0) return null;
        const firstId = set.values().next().value;
        return firstId ? (this.adapters.get(firstId) || null) : null;
    }

    /**
     * @param {string} id
     * @returns {boolean}
     */
    has(id) {
        return this.adapters.has(String(id || "").trim());
    }

    /**
     * @returns {ProviderAdapter[]}
     */
    list() {
        return [...this.adapters.values()];
    }

    /**
     * @returns {string[]}
     */
    getOrder() {
        return [...this.adapters.keys()];
    }

    /**
     * @param {"polish"|"translation"} taskKind
     * @returns {ProviderAdapter[]}
     */
    listForTask(taskKind) {
        return this.list().filter(adapter => Boolean(adapter.tasks?.[taskKind]));
    }

    /**
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {boolean}
     */
    isDirectTranslate(idOrConfig) {
        return this.get(idOrConfig)?.kind === "direct";
    }

    /**
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {boolean}
     */
    isLocal(idOrConfig) {
        return Boolean(this.get(idOrConfig)?.isLocal);
    }

    /**
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {boolean}
     */
    allowCloudFallback(idOrConfig) {
        const adapter = this.get(idOrConfig);
        return adapter ? adapter.allowCloudFallback !== false : true;
    }

    /**
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {boolean}
     */
    supportsModelDetection(idOrConfig) {
        return Boolean(this.get(idOrConfig)?.supportsModelDetection);
    }

    /**
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {boolean}
     */
    isApiKeyOptional(idOrConfig) {
        const adapter = this.get(idOrConfig);
        return Boolean(adapter?.apiKeyOptional || adapter?.defaultProfile?.apiKeyOptional);
    }

    /**
     * @param {string | { provider?: string } | null | undefined} idOrConfig
     * @returns {string[]}
     */
    getCredentialFields(idOrConfig) {
        return [...(this.get(idOrConfig)?.credentialFields || ["apiKey"])];
    }
}

module.exports = {
    ProviderRegistry,
    createOpenAIChatAdapter
};
