"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const endpoint = "http://127.0.0.1:18080/v1/chat/completions";
const request = { headers: {}, body: {} };

function pendingFetch(t) {
    t.mock.method(globalThis, "fetch", (_url, options) => new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
}

test("active cancellation is distinct from timeout, localized, and not a provider failure", async t => {
    pendingFetch(t);
    const plugin = new Plugin();
    const promise = plugin.fetchApiResponseText(endpoint, request, 5000);
    plugin.abortActiveApiRequests();
    let cancellation;
    await assert.rejects(promise, error => {
        cancellation = error;
        return error.code === "REQUEST_CANCELLED";
    });
    assert.equal(plugin.activeApiControllers.size, 0);
    assert.equal(plugin.isTimeoutError(cancellation), false);
    assert.equal(plugin.getAutoTranslationFailureType(cancellation), "cancelled");
    assert.equal(plugin.getFriendlyErrorMessage(cancellation), "请求已取消。");
    plugin.settings.ui.language = "en";
    assert.equal(plugin.getFriendlyErrorMessage(cancellation), "Request cancelled.");
    plugin.markAutoTranslationFailure({cacheKey:"cancelled"}, cancellation);
    plugin.markAutoTranslationProviderFailure({}, cancellation);
    assert.equal(plugin.autoTranslationFailures.size, 0);
    assert.equal(plugin.autoTranslationProviderFailures.size, 0);
    plugin.settings.ui.providerFallbackEnabled = true;
    assert.equal(plugin.shouldTryProviderFallback("translation", {mode:"manual"}, {provider:"deepseek"}, cancellation), false);
});

test("actual timer expiry is a timeout and releases controller", async t => {
    pendingFetch(t);
    const plugin = new Plugin();
    await assert.rejects(plugin.fetchApiResponseText(endpoint, request, 20), error => {
        assert.equal(error.code, "REQUEST_TIMEOUT");
        assert.equal(plugin.isTimeoutError(error), true);
        assert.equal(plugin.getAutoTranslationFailureType(error), "timeout");
        return true;
    });
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("a transport ignoring abort cannot return late data", async t => {
    let resolve;
    t.mock.method(globalThis, "fetch", () => new Promise(done => {resolve = done;}));
    const plugin = new Plugin();
    const promise = plugin.fetchApiResponseText(endpoint, request, 5000);
    plugin.abortActiveApiRequests();
    resolve({ok:true, text:async () => "late result"});
    await assert.rejects(promise, {code:"REQUEST_CANCELLED"});
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("success and body-read failure release controller tracking", async t => {
    const plugin = new Plugin();
    t.mock.method(globalThis, "fetch", async () => ({ok:true,text:async () => "ok"}));
    assert.equal(await plugin.fetchApiResponseText(endpoint, request, 1000), "ok");
    assert.equal(plugin.activeApiControllers.size, 0);
    globalThis.fetch.mock.mockImplementation(async () => ({ok:true,text:async () => {throw new Error("body read failed");}}));
    await assert.rejects(plugin.fetchApiResponseText(endpoint, request, 1000), /body read failed/);
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("cancelled model discovery never starts a translation or stores a failed model", async t => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", (_url, options) => {
        calls++;
        if (calls > 1) return Promise.resolve({ok:true,text:async () => JSON.stringify({choices:[{message:{content:"late"}}]})});
        return new Promise((_resolve,reject) => options.signal.addEventListener("abort", () => reject(new DOMException("aborted","AbortError"))));
    });
    const plugin = new Plugin();
    Object.assign(plugin.settings.translation,{provider:"sakuraLocal",endpoint,model:"local-model",apiKey:""});
    const promise = plugin.runModelTask("translation","synthetic text");
    plugin.abortActiveApiRequests();
    await assert.rejects(promise,{code:"REQUEST_CANCELLED"});
    assert.equal(calls,1);
    assert.equal(plugin.localProviderDetectedModels.size,0);
    assert.equal(plugin.localProviderModelDetections.size,0);
    assert.equal(plugin.translationRequests.size,0);
});

test("cancelled strict translation does not issue a last-chance request", async () => {
    const plugin = new Plugin();
    let calls = 0;
    const cancelled = Object.assign(new Error("cancelled"),{code:"REQUEST_CANCELLED"});
    plugin.runAutoTranslationModelAttempt = async () => {calls++;throw cancelled;};
    await assert.rejects(plugin.runAutoTranslationStrictFallbackTask("synthetic text"),{code:"REQUEST_CANCELLED"});
    assert.equal(calls,1);
});

test("cancelled long-text chunk does not run rescue or subsequent chunks", async () => {
    const plugin = new Plugin();
    let requests = 0;
    let rescues = 0;
    plugin.splitLongAutoTranslationText = () => ["first chunk", "second chunk"];
    plugin.runAutoTranslationTaskWithOptions = async () => {
        requests++;
        throw Object.assign(new Error("cancelled"), {code:"REQUEST_CANCELLED"});
    };
    plugin.runLongAutoTranslationChunkManualRescue = async () => {rescues++;return {translated:"unexpected"};};
    await assert.rejects(plugin.runLongAutoTranslationTask("synthetic long input", undefined, {manualRescue:true}), {code:"REQUEST_CANCELLED"});
    assert.equal(requests,1);
    assert.equal(rescues,0);
});

test("stop() refuses new provider requests until the plugin starts again", async t => {
    const fetch = t.mock.method(globalThis, "fetch", async () => ({ok:true,text:async () => "ok"}));
    const saved = {document: globalThis.document, window: globalThis.window};
    globalThis.document = {addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null};
    globalThis.window = {addEventListener() {}, removeEventListener() {}};
    t.after(() => Object.assign(globalThis, saved));
    const plugin = new Plugin();
    Object.assign(plugin, {
        loadSettings: () => true,
        loadDiagnosticLogs() {},
        loadTranslationCache() {},
        injectStyles() {},
        patchMessageContextMenu() {},
        startObserver() {},
        queueScan() {},
        showToast() {}
    });
    plugin.start();
    plugin.stop();
    // A retry or fallback loop that outlives stop() must not reach the network.
    await assert.rejects(plugin.fetchApiResponseText(endpoint, request, 1000), {code:"REQUEST_CANCELLED"});
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(plugin.activeApiControllers.size, 0);
    plugin.start();
    assert.equal(await plugin.fetchApiResponseText(endpoint, request, 1000), "ok");
    assert.equal(fetch.mock.callCount(), 1);
    plugin.stop();
});

test("provider fallback ends at a cancelled attempt instead of trying the next provider", async () => {
    const plugin = new Plugin();
    plugin.settings.ui.providerFallbackEnabled = true;
    plugin.settings.ui.providerFallbackOrder = ["openaiCompatible", "googleCloud"];
    plugin.hasUsableApiConfig = () => true;
    let attempts = 0;
    plugin.runModelTask = async () => {
        attempts++;
        throw Object.assign(new Error("cancelled"), {code:"REQUEST_CANCELLED"});
    };
    const serverError = Object.assign(new Error("API_ERROR"), {status:500});
    await assert.rejects(plugin.tryProviderFallbackModelTask("translation", "synthetic text", {mode:"manual"}, serverError, {provider:"deepseek"}), {code:"REQUEST_CANCELLED"});
    assert.equal(attempts, 1);
});

test("switching to a local provider in the settings panel applies its fixed intake mode", () => {
    const plugin = new Plugin();
    plugin.settings.ui.autoTranslatePrefetch = true;
    plugin.settings.ui.autoTranslateIntakeMode = "auto";
    plugin.setTaskProvider("translation", "sakuraLocal");
    clearTimeout(plugin.settingsDirtyTimer);
    assert.equal(plugin.settings.translation.provider, "sakuraLocal");
    assert.equal(plugin.settings.ui.autoTranslatePrefetch, true);
    assert.equal(plugin.settings.ui.autoTranslateIntakeMode, "dom");
});

test("standard service errors retain their categories", () => {
    const plugin = new Plugin();
    for (const [status,type] of [[401,"auth"],[403,"auth"],[429,"rate-limit"],[500,"server"],[400,"client"]]) {
        assert.equal(plugin.getAutoTranslationFailureType(Object.assign(new Error("API_ERROR"),{status})),type);
    }
    assert.equal(plugin.getAutoTranslationFailureType(Object.assign(new Error("quota"),{providerQuotaExceeded:true})),"quota");
    assert.equal(plugin.getAutoTranslationFailureType(new Error("fetch failed")),"network");
    assert.match(plugin.getFriendlyErrorMessage({code:"REQUEST_TIMEOUT",localProviderUnavailable:true}),/超时/);
    for (const code of ["INVALID_API_ENDPOINT","UNSAFE_API_ENDPOINT"]) {
        assert.equal(plugin.getAutoTranslationFailureType({code}),"client");
        assert.match(plugin.getFriendlyErrorMessage({code}),/接口地址/);
    }
    assert.throws(() => plugin.assertSafeRequestEndpoint("not a URL"),{code:"INVALID_API_ENDPOINT"});
    assert.throws(() => plugin.assertSafeRequestEndpoint("http://example.invalid"),{code:"UNSAFE_API_ENDPOINT"});
});
