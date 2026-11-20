"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { createFakeDocument } = require("../fixtures/fake-dom");

const localOrigin = "http://127.0.0.1:39001";
const remoteOrigin = "https://llm.example.test";

function createPlugin(kind, provider, origin) {
    const plugin = new Plugin();
    plugin.settings.ui.language = "en";
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    plugin.scheduleTranslationCachePersist = () => {};
    plugin.toasts = [];
    plugin.showToast = (message, type) => plugin.toasts.push({ message, type });
    plugin.setTaskProvider(kind, provider);
    Object.assign(plugin.getTaskConfig(kind), {
        endpoint: `${origin}/v1/chat/completions`,
        apiKey: provider === "sakuraLocal" ? "" : "synthetic-key",
        apiKeyOrigin: origin
    });
    return plugin;
}

function captureRequests(plugin) {
    const requests = [];
    plugin.fetchApiResponseText = (endpoint, request, _timeout, { signal } = {}) => {
        const response = Promise.withResolvers();
        requests.push({ endpoint, request, signal, ...response });
        return response.promise;
    };
    return requests;
}

function fakeDocument(t) {
    const original = Object.getOwnPropertyDescriptor(globalThis, "document");
    const doc = createFakeDocument();
    const createElement = doc.createElement;
    doc.createElement = tagName => {
        const element = createElement(tagName);
        Object.defineProperty(element, "id", {
            get: () => element.getAttribute("id") || "",
            set: value => element.setAttribute("id", value)
        });
        return element;
    };
    Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
    t.after(() => {
        if (original) Object.defineProperty(globalThis, "document", original);
        else delete globalThis.document;
    });
    return doc;
}

function chatReply(model) {
    return JSON.stringify({ model, choices: [{ message: { content: "OK" } }] });
}

function modelList(id) {
    return JSON.stringify({ data: [{ id }] });
}

test("A07 an endpoint edit during local discovery skips the completion test and cache write", async () => {
    const plugin = createPlugin("translation", "sakuraLocal", localOrigin);
    const requests = captureRequests(plugin);
    const status = { dataset: { daitKind: "translation" } };
    const pending = plugin.testApiConnection("translation", null, status);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requests.map(({ endpoint, request }) => [endpoint, request.method]), [
        [`${localOrigin}/v1/models`, "GET"]
    ]);
    assert.ok(requests[0].signal instanceof AbortSignal);
    assert.equal(plugin.getApiStatus("translation").state, "testing");

    plugin.setSetting("translation.endpoint", `${localOrigin}/alternate/v1/chat/completions`);
    requests[0].resolve(modelList("stale.gguf"));
    assert.equal(await pending, false);
    assert.equal(requests.length, 1);
    assert.equal(plugin.localProviderDetectedModels.size, 0);
    assert.equal(plugin.getApiStatus("translation").state, "untested");
    assert.equal(plugin.getLastApiTestResult("translation"), null);
    assert.deepEqual(plugin.settings.serviceConfigs, []);
    assert.deepEqual(plugin.toasts, []);
});

test("A07 a connection test request uses the supplied snapshot after settings change", () => {
    const plugin = createPlugin("polish", "openaiCompatible", remoteOrigin);
    plugin.settings.polish.model = "original-model";
    const config = Object.freeze({ ...plugin.settings.polish });
    plugin.setSetting("polish.endpoint", `${remoteOrigin}/alternate/v1/chat/completions`);
    plugin.setSetting("polish.apiKey", "different-key");
    plugin.setSetting("polish.model", "different-model");

    const { endpoint, request } = plugin.buildConnectionTestRequest("polish", config);
    assert.equal(endpoint, `${remoteOrigin}/v1/chat/completions`);
    assert.equal(request.headers.Authorization, "Bearer synthetic-key");
    assert.equal(request.body.model, "original-model");
});

test("A07 a late polishing success cannot verify an edited endpoint", async t => {
    const plugin = createPlugin("polish", "openaiCompatible", remoteOrigin);
    const requests = captureRequests(plugin);
    const refresh = t.mock.method(plugin, "refreshApiTestViews", () => {});
    const badge = { dataset: { daitKind: "polish" } };
    const pending = plugin.runOverviewApiTest("polish", null, badge);
    assert.equal(requests[0].endpoint, `${remoteOrigin}/v1/chat/completions`);

    plugin.setSetting("polish.endpoint", `${remoteOrigin}/alternate/v1/chat/completions`);
    refresh.mock.resetCalls();
    requests[0].resolve(chatReply("obsolete-model"));
    assert.equal(await pending, false);
    assert.equal(plugin.getApiStatus("polish").state, "untested");
    assert.equal(plugin.getLastApiTestResult("polish"), null);
    assert.equal(refresh.mock.callCount(), 0);
    assert.deepEqual(plugin.settings.serviceConfigs, []);
    assert.equal(plugin.settings.translation.apiKey, "");
    assert.deepEqual(plugin.toasts, []);
});

test("A07 a superseded connection failure cannot clear the current test's busy state", async () => {
    const plugin = createPlugin("polish", "openaiCompatible", remoteOrigin);
    const requests = captureRequests(plugin);
    const button = {};
    const status = { dataset: { daitKind: "polish" } };
    const older = plugin.testApiConnection("polish", button, status);
    const latest = plugin.testApiConnection("polish", button, status);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal.aborted, true);

    requests[0].reject(Object.assign(new Error("old failure"), { status: 401 }));
    assert.equal(await older, false);
    assert.equal(button.disabled, true);
    assert.equal(plugin.isApiTestRunning("polish"), true);
    assert.equal(plugin.getApiStatus("polish").state, "testing");
    assert.deepEqual(plugin.toasts, []);

    requests[1].resolve(chatReply("verified-model"));
    assert.equal(await latest, true);
    assert.equal(button.disabled, false);
    assert.equal(plugin.isApiTestRunning("polish"), false);
    assert.equal(plugin.getApiStatus("polish").state, "success");
    assert.equal(plugin.getLastApiTestResult("polish").model, "verified-model");
});

test("A07 a local connection publishes success before releasing the queue", async t => {
    const plugin = createPlugin("translation", "sakuraLocal", localOrigin);
    plugin.settings.translation.model = "configured-model";
    const requests = captureRequests(plugin);
    const status = { dataset: { daitKind: "translation" } };
    const release = t.mock.method(plugin, "releaseProviderBlockedAutoTranslationItems", () => {
        assert.equal(plugin.getApiStatus("translation").state, "success");
        assert.equal(plugin.shouldBlockAutoTranslationForLocalProviderHealth(), false);
    });

    const pending = plugin.testApiConnection("translation", null, status);
    assert.equal(requests.length, 1);
    requests[0].resolve(chatReply("configured-model"));
    assert.equal(await pending, true);
    assert.equal(release.mock.callCount(), 1);
    assert.equal(plugin.getApiStatus("translation").state, "success");
});

test("A07 the connection test starts immediately and discards replies after stop", async () => {
    const plugin = createPlugin("polish", "openaiCompatible", remoteOrigin);
    const requests = captureRequests(plugin);
    const status = { dataset: { daitKind: "polish" } };
    const pending = plugin.testApiConnection("polish", null, status);
    assert.equal(requests.length, 1);
    plugin.isStarted = false;
    plugin.lifecycleToken++;

    requests[0].resolve(chatReply("obsolete-model"));
    assert.equal(await pending, false);
    assert.equal(plugin.getApiStatus("polish").state, "testing");
    assert.equal(plugin.getLastApiTestResult("polish"), null);
    assert.deepEqual(plugin.settings.serviceConfigs, []);
});

test("A07 the latest model detection owns the picker, datalist, status, and cache", async t => {
    const doc = fakeDocument(t);
    const plugin = createPlugin("translation", "sakuraLocal", localOrigin);
    const requests = captureRequests(plugin);
    const row = doc.body.appendChild(plugin.createModelFieldRow("translation"));
    const ui = row.__daitModelDetectUi;
    const older = plugin.runModelDetection("translation", ui);
    const latest = plugin.runModelDetection("translation", ui);
    assert.equal(requests.length, 2);
    assert.equal(requests[0].signal.aborted, true);

    requests[1].resolve(modelList("current.gguf"));
    assert.deepEqual(await latest, { models: ["current.gguf"], loaded: "current.gguf" });
    const status = ui.status.textContent;
    assert.match(status, /current\.gguf/);
    requests[0].resolve(modelList("stale.gguf"));
    assert.equal(await older, null);

    const values = element => element.querySelectorAll("option").map(option => option.value);
    for (const modelValues of [values(ui.picker), values(ui.input.__daitModelDatalist)]) {
        assert.ok(modelValues.includes("current.gguf"));
        assert.ok(!modelValues.includes("stale.gguf"));
    }
    assert.equal(ui.status.textContent, status);
    assert.equal(plugin.getCachedLocalProviderDetectedModel(plugin.settings.translation), "current.gguf");
});

test("A07 a superseded model detection failure leaves the latest status intact", async t => {
    const doc = fakeDocument(t);
    const plugin = createPlugin("polish", "openaiCompatible", remoteOrigin);
    const requests = captureRequests(plugin);
    const row = doc.body.appendChild(plugin.createModelFieldRow("polish"));
    const ui = row.__daitModelDetectUi;
    const older = plugin.runModelDetection("polish", ui);
    const latest = plugin.runModelDetection("polish", ui);
    requests[1].resolve(modelList("latest-model"));
    await latest;
    const status = ui.status.textContent;

    requests[0].reject(new Error("old model lookup failed"));
    assert.equal(await older, null);
    assert.equal(ui.status.textContent, status);
    assert.equal(ui.status.classList.contains("dait-row-description-error"), false);
    assert.equal(ui.picker.hidden, false);
    assert.equal(ui.button.disabled, false);
});

test("A07 an edited endpoint invalidates a pending model list and cache update", async t => {
    const doc = fakeDocument(t);
    const plugin = createPlugin("translation", "sakuraLocal", localOrigin);
    const requests = captureRequests(plugin);
    const row = doc.body.appendChild(plugin.createModelFieldRow("translation"));
    const ui = row.__daitModelDetectUi;
    const initialStatus = ui.status.textContent;
    const pending = plugin.runModelDetection("translation", ui);

    plugin.setSetting("translation.endpoint", `${localOrigin}/alternate/v1/chat/completions`);
    requests[0].resolve(modelList("obsolete-model"));
    assert.equal(await pending, null);
    assert.equal(ui.status.textContent, initialStatus);
    assert.equal(ui.picker.querySelectorAll("option").some(option => option.value === "obsolete-model"), false);
    assert.equal(plugin.localProviderDetectedModels.size, 0);
    assert.equal(ui.button.disabled, false);
});

test("A07 quick panel status follows the latest test and keeps its verified service", async t => {
    const doc = fakeDocument(t);
    const plugin = createPlugin("translation", "openaiCompatible", remoteOrigin);
    plugin.settings.translation.model = "configured-model";
    const requests = captureRequests(plugin);
    const panelButton = doc.createElement("button");
    const older = plugin.quickPanel.runConnectionTest(panelButton);
    const latest = plugin.runOverviewApiTest("translation", null, plugin.createApiStatusBadge("translation"));
    assert.equal(requests.length, 2);
    assert.equal(plugin.getLauncherStatus().testing, true);

    requests[1].resolve(chatReply("latest-model"));
    assert.equal(await latest, true);
    assert.equal(plugin.getLauncherStatus().testing, false);
    assert.match(plugin.getLauncherStatus().testSummary, /latest-model/);
    assert.equal(panelButton.disabled, false);
    assert.equal(plugin.settings.polish.endpoint, `${remoteOrigin}/v1/chat/completions`);
    assert.deepEqual(plugin.settings.translation.providerProfiles.openaiCompatible.recentModels, ["configured-model"]);
    assert.equal(plugin.settings.serviceConfigs[0].reportedModel, "latest-model");

    requests[0].resolve(chatReply("stale-model"));
    assert.equal(await older, false);
    assert.equal(plugin.getApiStatus("translation").state, "success");
    assert.match(plugin.getLauncherStatus().testSummary, /latest-model/);
    assert.deepEqual(plugin.settings.serviceConfigs.map(entry => entry.reportedModel), ["latest-model"]);
    assert.deepEqual(plugin.toasts.map(toast => toast.type), ["success"]);
});
