"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { DEFAULT_SETTINGS, PROVIDER_DEFAULTS } = require("../../src/constants");

const text = "A fixture message about tomorrow's meeting.";

function createFixture(t) {
    const plugin = new Plugin();
    t.after(() => clearTimeout(plugin.translationCacheDirtyTimer));
    const options = (endpoint, overrides = {}) => {
        const configOverrides = {
            provider: "openaiCompatible",
            endpoint,
            model: "fixture-model",
            apiKey: "fixture-key",
            sourceLanguage: "English",
            targetLanguage: "Chinese",
            ...overrides
        };
        configOverrides.apiKeyOrigin = plugin.getProviderEndpointOrigin(configOverrides);
        return { mode: "auto", configOverrides };
    };
    const key = requestOptions => plugin.getTranslationCacheKey(text, requestOptions);
    const lookup = requestOptions => plugin.getTranslationCacheValue(key(requestOptions), plugin.getTranslationCacheAliases(text, requestOptions));
    const previousKey = (requestOptions, legacyEndpoint, cacheOptions = {}) =>
        plugin.buildTranslationCacheKey(text, requestOptions, plugin.getStrongTextFingerprint(text), { ...cacheOptions, legacyEndpoint });
    const endpoint = requestOptions => plugin.buildModelRequest("translation", text, requestOptions).endpoint;
    return { plugin, options, key, lookup, previousKey, endpoint };
}

test("S05 separates blank provider endpoints from an explicit endpoint with the old fallback host", t => {
    const { plugin, options, key, lookup, endpoint } = createFixture(t);
    const preset = options("");
    const explicit = options(DEFAULT_SETTINGS.translation.endpoint);
    assert.equal(endpoint(preset), PROVIDER_DEFAULTS.openaiCompatible.endpoint);
    assert.notEqual(new URL(endpoint(preset)).hostname, new URL(endpoint(explicit)).hostname);
    assert.notEqual(key(preset), key(explicit));
    assert.notEqual(plugin.getAutoTextTranslationCacheKey(text, preset), plugin.getAutoTextTranslationCacheKey(text, explicit));

    plugin.setTranslationCache(key(preset), "预设服务译文");
    assert.equal(lookup(explicit), null);
    plugin.setTranslationCache(key(explicit), "另一服务译文");
    assert.equal(lookup(preset), "预设服务译文");
    assert.equal(lookup(explicit), "另一服务译文");
});

test("S05 refuses an ambiguous old key for both possible request hosts", t => {
    const { plugin, options, key, previousKey, lookup } = createFixture(t);
    const unset = options("");
    const explicit = options(DEFAULT_SETTINGS.translation.endpoint);
    const old = previousKey(unset, DEFAULT_SETTINGS.translation.endpoint);
    assert.equal(old, previousKey(explicit, DEFAULT_SETTINGS.translation.endpoint));
    plugin.setTranslationCache(old, "来源无法判定的旧译文");

    for (const requestOptions of [unset, explicit]) {
        assert.notEqual(key(requestOptions), old);
        assert.equal(plugin.getTranslationCacheAliases(text, requestOptions).includes(old), false);
        assert.equal(lookup(requestOptions), null);
    }
});

test("S05 equivalent effective URLs share cache while path case and query routing stay distinct", t => {
    const { plugin, options, key, lookup, endpoint } = createFixture(t);
    const base = options("https://GATEWAY.invalid:443/v1?route=a&route=b");
    const complete = options("https://gateway.invalid/v1/chat/completions?route=a&route=b");
    const differentCase = options("https://gateway.invalid/V1/chat/completions?route=a&route=b");
    const differentQuery = options("https://gateway.invalid/v1/chat/completions?route=b&route=a");
    assert.equal(endpoint(base), endpoint(complete));
    assert.equal(key(base), key(complete));
    const loopback = options("http://127.0.0.1:18080", { provider: "sakuraLocal" });
    const loopbackCompletion = options("http://127.0.0.1:18080/v1/chat/completions", { provider: "sakuraLocal" });
    assert.equal(endpoint(loopback), endpoint(loopbackCompletion));
    assert.equal(key(loopback), key(loopbackCompletion));

    plugin.setTranslationCache(key(base), "网关译文");
    assert.equal(lookup(complete), "网关译文");
    assert.equal(lookup(differentCase), null);
    assert.equal(lookup(differentQuery), null);
});

test("S05 promotes safely attributable old endpoints and pre-identity keys", t => {
    const { plugin, options, key, previousKey, lookup } = createFixture(t);
    const legacyUrl = "https://GATEWAY.invalid:443/v1?tenant=fixture";
    const requestOptions = { ...options(legacyUrl), messageIdentity: "message:guild:channel:123:message:text" };
    const old = previousKey(requestOptions, legacyUrl, { fullConfig: true, omitMessageIdentity: true });
    plugin.setTranslationCache(old, "同一网关的旧译文");
    assert.notEqual(key(requestOptions), old);
    assert.equal(plugin.getTranslationCacheAliases(text, requestOptions).includes(old), true);
    assert.equal(lookup(requestOptions), "同一网关的旧译文");
    assert.equal(plugin.translationCache.get(key(requestOptions)), "同一网关的旧译文");

    const previousPreset = previousKey(options(""), PROVIDER_DEFAULTS.openaiCompatible.endpoint);
    plugin.setTranslationCache(previousPreset, "可判定属于预设服务的译文");
    assert.equal(lookup(options("")), "可判定属于预设服务的译文");
});

test("S05 Microsoft cache identity includes the request query without treating it as a legacy base URL", t => {
    const { plugin, options, key, previousKey, endpoint, lookup } = createFixture(t);
    const base = "https://microsoft.invalid/translate?tenant=fixture";
    const requestOptions = options(base, { provider: "microsoft" });
    assert.equal(new URL(endpoint(requestOptions)).searchParams.get("api-version"), "3.0");
    assert.equal(new URL(endpoint(requestOptions)).searchParams.get("tenant"), "fixture");
    assert.notEqual(key(requestOptions), key(options(`${base}-other`, { provider: "microsoft" })));

    const oldWithDifferentRequest = previousKey(requestOptions, endpoint(requestOptions));
    plugin.setTranslationCache(oldWithDifferentRequest, "其他请求的旧记录");
    assert.equal(lookup(requestOptions), null);
    const oldWithSameRequest = previousKey(requestOptions, base);
    plugin.setTranslationCache(oldWithSameRequest, "同一请求的旧记录");
    assert.equal(lookup(requestOptions), "同一请求的旧记录");
    assert.equal(plugin.translationCache.get(key(requestOptions)), "同一请求的旧记录");
});
