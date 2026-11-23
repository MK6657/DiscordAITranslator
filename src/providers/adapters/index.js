// @ts-check
"use strict";

const { ProviderRegistry } = require("../registry");
const { deepseekAdapter } = require("./deepseek");
const { openaiCompatibleAdapter } = require("./openai-compatible");
const { sakuraLocalAdapter } = require("./sakura-local");
const { googleCloudAdapter } = require("./google-cloud");
const { microsoftAdapter } = require("./microsoft");
const { deeplAdapter } = require("./deepl");
const { baiduAdapter } = require("./baidu");

/**
 * Creates a ProviderRegistry pre-loaded with all 7 built-in providers in canonical order.
 * @returns {InstanceType<typeof ProviderRegistry>}
 */
function createDefaultProviderRegistry() {
    const registry = new ProviderRegistry();
    registry.register(deepseekAdapter);
    registry.register(openaiCompatibleAdapter);
    registry.register(sakuraLocalAdapter);
    registry.register(googleCloudAdapter);
    registry.register(microsoftAdapter);
    registry.register(deeplAdapter);
    registry.register(baiduAdapter);
    return registry;
}

module.exports = {
    createDefaultProviderRegistry,
    deepseekAdapter,
    openaiCompatibleAdapter,
    sakuraLocalAdapter,
    googleCloudAdapter,
    microsoftAdapter,
    deeplAdapter,
    baiduAdapter
};
