"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const Plugin = require("../../src");

const relay = "https://relay.example.invalid";
const post = { headers: { "Content-Type": "application/json" }, body: { text: "synthetic input" } };

function mockGlobal(t, name, value) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    t.after(() => {
        if (original) Object.defineProperty(globalThis, name, original);
        else delete globalThis[name];
    });
}

function mockHostFetch(t, implementation = async () => new Response("host response")) {
    const hostFetch = t.mock.fn(implementation);
    mockGlobal(t, "BdApi", { Net: { fetch: hostFetch } });
    return hostFetch;
}

test("A03 routes HTTPS-to-loopback HTTP through BdApi.Net.fetch up front", async t => {
    mockGlobal(t, "location", { protocol: "https:" });
    const browserFetch = t.mock.method(globalThis, "fetch", async () => {
        throw new TypeError("Failed to fetch");
    });
    const hostFetch = mockHostFetch(t);
    const plugin = new Plugin();
    const endpoint = "http://127.0.0.1:18080/v1/chat/completions";

    assert.equal(await plugin.fetchApiResponseText(endpoint, post, 2500), "host response");
    assert.equal(browserFetch.mock.callCount(), 0);
    assert.equal(hostFetch.mock.callCount(), 1);
    const [url, options] = hostFetch.mock.calls[0].arguments;
    assert.equal(url, endpoint);
    assert.equal(options.method, "POST");
    assert.equal(options.body, JSON.stringify(post.body));
    assert.deepEqual(options.headers, post.headers);
    assert.equal(options.timeout, 2500);
    assert.equal(options.redirect, "manual");
    assert.equal(options.maxRedirects, 0);
});

test("A03 routes the first cross-origin write from an HTTPS renderer through the host transport", async t => {
    const renderer = "https://discord.example.invalid";
    mockGlobal(t, "location", { protocol: "https:", origin: renderer });
    const endpoint = `${relay}/v1/chat/completions`;
    const sameOrigin = `${renderer}/same-origin`;
    const browserFetch = t.mock.method(globalThis, "fetch", async url => {
        if (url !== sameOrigin) throw new TypeError("Failed to fetch");
        return new Response("browser response");
    });
    const hostFetch = mockHostFetch(t);
    const plugin = new Plugin();

    assert.equal(await plugin.fetchApiResponseText(endpoint, post), "host response");
    assert.equal(await plugin.fetchApiResponseText(sameOrigin, post), "browser response");
    assert.deepEqual(hostFetch.mock.calls.map(call => call.arguments[0]), [endpoint]);
    assert.deepEqual(browserFetch.mock.calls.map(call => call.arguments[0]), [sameOrigin]);
});

test("A03 can switch a POST after a confirmed before-send failure", async t => {
    const failures = [
        Object.assign(new TypeError("Failed to fetch"), { requestSent: false }),
        new TypeError("fetch failed", {
            cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED", syscall: "connect" })
        }),
        new TypeError("fetch failed", {
            cause: Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND", syscall: "getaddrinfo" })
        })
    ];
    const browserFetch = t.mock.method(globalThis, "fetch", async () => { throw failures.shift(); });
    const hostFetch = mockHostFetch(t);
    const plugin = new Plugin();
    const endpoints = [
        `${relay}/v1/chat/completions`,
        "https://connect.example.invalid/v1/chat/completions",
        "https://dns.example.invalid/v1/chat/completions"
    ];

    for (const endpoint of endpoints) {
        assert.equal(await plugin.fetchApiResponseText(endpoint, post), "host response");
    }
    assert.deepEqual(browserFetch.mock.calls.map(call => call.arguments[0]), endpoints);
    assert.deepEqual(hostFetch.mock.calls.map(call => call.arguments[0]), endpoints);
    for (const call of hostFetch.mock.calls) {
        assert.equal(call.arguments[1].method, "POST");
        assert.equal(call.arguments[1].body, JSON.stringify(post.body));
    }
});

test("A03 does not replay a POST received by a server that disconnects", async t => {
    const received = [];
    const server = http.createServer(request => {
        let body = "";
        request.setEncoding("utf8");
        request.on("data", chunk => { body += chunk; });
        request.on("end", () => {
            received.push({ method: request.method, body });
            request.socket.destroy();
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    mockGlobal(t, "location", { protocol: "http:" });
    const hostFetch = mockHostFetch(t, globalThis.fetch);
    const plugin = new Plugin();
    const endpoint = `http://127.0.0.1:${server.address().port}/translate`;

    await assert.rejects(plugin.fetchApiResponseText(endpoint, post, 2000), error => plugin.isNetworkError(error));
    assert.deepEqual(received, [{ method: "POST", body: JSON.stringify(post.body) }]);
    assert.equal(hostFetch.mock.callCount(), 0);
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("A03 propagates ambiguous browser and response-body failures for POST", async t => {
    const browserError = new TypeError("Failed to fetch");
    const bodyError = new TypeError("NetworkError while reading response");
    const browserFetch = t.mock.method(globalThis, "fetch", async () => { throw browserError; });
    const hostFetch = mockHostFetch(t);
    const plugin = new Plugin();

    await assert.rejects(plugin.fetchApiResponseText(relay, post), error => error === browserError);

    const readBody = t.mock.fn(async () => { throw bodyError; });
    browserFetch.mock.mockImplementation(async () => ({ ok: true, status: 200, text: readBody }));
    await assert.rejects(plugin.fetchApiResponseText(relay, post), error => error === bodyError);

    assert.equal(browserFetch.mock.callCount(), 2);
    assert.equal(browserFetch.mock.calls[0].arguments[1].redirect, "error");
    assert.equal(readBody.mock.callCount(), 1);
    assert.equal(hostFetch.mock.callCount(), 0);
    assert.equal(plugin.activeApiControllers.size, 0);
});

test("A10 strips reasoning-only tags and content parts to empty", () => {
    const plugin = new Plugin();

    assert.equal(plugin.extractModelContent("<think>scratchwork</think>"), "");
    assert.equal(plugin.extractModelContent("<reasoning>scratchwork</reasoning>"), "");
    assert.equal(plugin.extractModelContent(" <THOUGHT mode=\"test\">\nscratchwork</THOUGHT><think>more</think> "), "");
    assert.equal(plugin.extractModelContent([
        { type: "reasoning", text: "scratchwork" },
        { type: "thinking", content: "more scratchwork" },
        { type: "thought", text: "draft" },
        { type: "redacted_thinking", text: "redacted" },
        " \n"
    ]), "");
    assert.equal(plugin.extractModelContent(["<thi", { type: "text", text: "nk>hidden</think>" }]), "");
    assert.equal(plugin.extractModelContent("<think>first</think> actual answer <thought>second</thought>"), "actual answer");
    assert.equal(plugin.extractModelContent([
        { type: "reasoning", text: "scratchwork" },
        { type: "text", text: "<thought>draft</thought> final" },
        { type: "text", content: " answer" }
    ]), "final answer");
    assert.throws(
        () => plugin.parseModelResponse(JSON.stringify({ output_text: "<thought>scratchwork</thought>" })),
        { message: plugin.t("emptyResult") }
    );
});

test("A10 ignores non-text model content and preserves supported text fragments", () => {
    const plugin = new Plugin();
    for (const content of [17, { text: "unsupported" }, [{ text: 17 }, { content: { text: "unsupported" } }]]) {
        assert.equal(plugin.extractModelContent(content), "");
    }
    assert.equal(plugin.extractModelContent([{ type: "text", text: 17 }, { type: "text", text: "valid" }]), "valid");
});

const directProviders = [
    {
        name: "Google",
        provider: "googleCloud",
        parser: "parseGoogleTranslateResponse",
        reply: values => ({ data: { translations: values.map(translatedText => ({ translatedText })) } }),
        invalidShape: { data: { translations: {} } }
    },
    {
        name: "DeepL",
        provider: "deepl",
        parser: "parseDeepLTranslateResponse",
        reply: values => ({ translations: values.map(text => ({ text })) }),
        invalidShape: { translations: {} }
    },
    {
        name: "Microsoft",
        provider: "microsoft",
        parser: "parseMicrosoftTranslateResponse",
        reply: values => values.map(text => ({ translations: [{ text }] })),
        invalidShape: [{ translations: { 0: { text: "unexpected" } } }]
    }
];

for (const { name, provider, parser, reply, invalidShape } of directProviders) {
    test(`A10 ${name} accepts only nonempty string translations`, () => {
        const plugin = new Plugin();
        const parse = (values, count, options) => plugin[parser](JSON.stringify(reply(values)), count, options);
        const expectedError = key => ({
            message: plugin.t(key),
            ...(provider === "googleCloud" ? {} : { provider, providerParseFailed: true })
        });

        assert.equal(parse([" one "]), "one");
        assert.equal(parse(["one", "surplus"]), "one");
        assert.deepEqual(parse([" one ", "two\n"], 2, { asArray: true }), ["one", "two"]);
        assert.equal(parse(["one", "two"], 2), "[\"one\",\"two\"]");
        if (provider === "googleCloud") {
            assert.equal(parse([" &lt;translated&gt; &amp; __KEEP__ "], 1, {
                restoreMaps: [[{ placeholder: "__KEEP__", value: "`code`" }]]
            }), "<translated> & `code`");
        }

        for (const invalid of [undefined, null, "", " \n", 17, true, { text: "unexpected" }, ["unexpected"]]) {
            assert.throws(() => parse([invalid]), expectedError("emptyResult"));
            assert.throws(() => parse(["one", invalid]), expectedError("emptyResult"));
            assert.throws(() => parse(["one", invalid], 2, { asArray: true }), expectedError("emptyResult"));
        }
        assert.throws(() => parse([], 1), expectedError("emptyResult"));
        assert.throws(() => parse(["one"], 2), expectedError("emptyResult"));
        assert.throws(() => plugin[parser](JSON.stringify(invalidShape)), expectedError("emptyResult"));
        assert.throws(() => plugin[parser]("{"), expectedError("invalidJson"));
    });
}

test("A10 Baidu validates each text row before regrouping multiline responses", () => {
    const plugin = new Plugin();
    const parse = rows => plugin.parseBaiduTranslateResponse(JSON.stringify({
        trans_result: rows.map(dst => ({ dst }))
    }), 2, { asArray: true, rowCounts: [2, 1] });

    assert.deepEqual(parse([" 第一行 ", "第二行", "单独"]), ["第一行\n第二行", "单独"]);
    for (const invalid of [17, { text: "unsupported" }, null, " "]) {
        assert.throws(() => parse(["第一行", invalid, "单独"]), { provider: "baidu", providerParseFailed: true });
    }
});

test("A10 invalid provider replies fail connection tests without saving a service", async t => {
    const cases = [
        { provider: "openaiCompatible", payload: { choices: [{ message: { content: "<think>draft</think>" } }] } },
        { provider: "baidu", payload: { trans_result: [{ dst: 17 }] } },
        ...directProviders.map(({ provider, reply }) => ({ provider, payload: reply([17]) }))
    ];

    for (const { provider, payload } of cases) {
        const plugin = new Plugin();
        Object.assign(plugin.settings.translation, {
            provider,
            endpoint: `${relay}/v1/chat/completions`,
            apiKey: "synthetic-key",
            appId: "synthetic-app-id",
            secretKey: "synthetic-secret-key",
            model: "synthetic-model"
        });
        if (provider === "googleCloud") {
            plugin.settings.googleTranslate.keyPoolText = "fixture|synthetic-google-key|450000";
            plugin.settings.googleTranslate.keys = plugin.normalizeGoogleTranslateKeyPool(plugin.settings.googleTranslate).keys;
        }
        plugin.saveSettings = () => true;
        plugin.queueScan = () => {};
        const fetchResponse = t.mock.method(plugin, "fetchApiResponseText", async () => JSON.stringify(payload));
        const saveVerified = t.mock.method(plugin, "saveVerifiedServiceConfig", () => null);
        const showToast = t.mock.method(plugin, "showToast", () => {});

        await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });

        assert.equal(fetchResponse.mock.callCount(), 1, provider);
        assert.equal(plugin.getLastApiTestResult("translation")?.ok, false, provider);
        assert.equal(plugin.getApiStatus("translation").state, "failed", provider);
        assert.equal(plugin.getApiStatus("translation").message, plugin.t("emptyResult"), provider);
        assert.equal(showToast.mock.callCount(), 1, provider);
        assert.equal(showToast.mock.calls[0].arguments[1], "error", provider);
        assert.equal(saveVerified.mock.callCount(), 0, provider);
    }
});

test("A10 strips unclosed reasoning tags and rejects local connection tests truncated inside <think>", async t => {
    const plugin = new Plugin();
    assert.equal(plugin.extractModelContent("<think>truncated reasoning without closing tag"), "");
    assert.equal(plugin.extractModelContent("final translation <thought>trailing unclosed reasoning"), "final translation");

    Object.assign(plugin.settings.translation, {
        provider: "openaiCompatible",
        endpoint: "http://127.0.0.1:18080/v1/chat/completions",
        apiKey: "synthetic-local-key",
        model: "synthetic-reasoning-model"
    });
    plugin.saveSettings = () => true;
    plugin.queueScan = () => {};
    t.mock.method(plugin, "fetchApiResponseText", async () => JSON.stringify({
        choices: [{ message: { content: "<think>still thinking when cut off" }, finish_reason: "length" }]
    }));
    const saveVerified = t.mock.method(plugin, "saveVerifiedServiceConfig", () => null);
    t.mock.method(plugin, "showToast", () => {});

    await plugin.testApiConnection("translation", null, { dataset: { daitKind: "translation" } });
    assert.equal(plugin.getLastApiTestResult("translation")?.ok, false);
    assert.equal(plugin.getApiStatus("translation").state, "failed");
    assert.equal(saveVerified.mock.callCount(), 0);
});
