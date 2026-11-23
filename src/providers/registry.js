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
 * @property {(config: any, defaultConfig: any, plugin: any) => string} getEffectiveEndpoint
 * @property {(kind: string, input: any, config: any, defaultConfig: any, options: any, plugin: any) => any} buildRequest
 * @property {(raw: string, request: any, options: any, plugin: any) => any} parseResponse
 * @property {(config: any, body: any) => any} [applyBodyOptions]
 * @property {(config: any, snapshot: any, plugin: any) => void} [applyCacheScope]
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
        /** @type {Map<string, ProviderAdapter>} */
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
        this.adapters.set(id, adapter);
        if (adapter.responseParser) {
            this.byParser.set(adapter.responseParser, adapter);
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
        if (existing.responseParser && this.byParser.get(existing.responseParser) === existing) {
            this.byParser.delete(existing.responseParser);
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
     * Resolves an adapter by its responseParser identifier.
     * @param {string} parserName
     * @returns {ProviderAdapter | null}
     */
    getByParser(parserName) {
        return this.byParser.get(String(parserName || "").trim()) || null;
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
