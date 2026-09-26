"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { LANGUAGE_PRESETS } = require("../../src/constants");
const { I18N } = require("../../src/i18n");

const LOCAL_ENDPOINT = "http://127.0.0.1:18080/v1/chat/completions";

function createDirectPlugin(provider) {
    const plugin = new Plugin();
    const translation = plugin.settings.translation;
    translation.provider = provider;
    translation.endpoint = "";
    translation.model = "";
    if (provider === "googleCloud") {
        plugin.settings.googleTranslate.keyPoolText = "main|AIza-fake-1|450000";
        plugin.settings.googleTranslate.keys = plugin.normalizeGoogleTranslateKeyPool(plugin.settings.googleTranslate).keys;
    }
    if (provider === "microsoft") translation.apiKey = "ms-fake-1";
    if (provider === "deepl") translation.apiKey = "deepl-fake-1";
    if (provider === "baidu") {
        translation.appId = "baidu-app-fake";
        translation.secretKey = "baidu-secret-fake";
    }
    return plugin;
}

function getSentTargetCode(provider, built) {
    if (provider === "googleCloud") return built.request.body.target;
    if (provider === "microsoft") return new URL(built.endpoint).searchParams.get("to");
    if (provider === "deepl") return built.request.body.target_lang;
    if (provider === "baidu") return built.request.body.to;
    throw new Error(`unknown provider ${provider}`);
}

const BAIDU_CODES = { "zh": "zh", "zh-TW": "cht", "ja": "jp", "ko": "kor", "fr": "fra", "es": "spa", "ar": "ara", "vi": "vie" };

function getExpectedTargetCode(provider, code) {
    if (provider === "googleCloud") return code === "zh" ? "zh-CN" : code;
    if (provider === "microsoft") return code === "zh" ? "zh-Hans" : code === "zh-TW" ? "zh-Hant" : code;
    if (provider === "deepl") return code === "zh" ? "ZH-HANS" : code === "zh-TW" ? "ZH-HANT" : code.toUpperCase();
    if (provider === "baidu") return BAIDU_CODES[code] || code;
    throw new Error(`unknown provider ${provider}`);
}

function getOptionBuilders(plugin) {
    const auto = () => plugin.getAutoTranslationOptions();
    const manual = () => plugin.getManualTranslationRequestOptions();
    return {
        auto,
        manual,
        "long-text": () => plugin.getLongTextTranslationOptions(auto(), "long text ".repeat(80)),
        "manual-long-text": () => plugin.getLongTextTranslationOptions(manual(), "long text ".repeat(80)),
        "manual-whole-pass": () => plugin.getManualLongTextWholePassOptions({ text: "long text ".repeat(80), requestOptions: manual() }, manual()),
        retry: () => plugin.getAutoTranslationRetryOptions("hello", "bad", auto()),
        "final-fallback": () => plugin.getAutoTranslationFinalFallbackOptions("hello", auto()),
        batch: () => plugin.getAutoTranslationBatchOptions(2, auto()),
        "batch-retry": () => plugin.getAutoTranslationBatchRetryOptions(2, auto()),
        "manual-force-target": () => plugin.getManualForceTargetTranslationOptions("hello", "bad", "target-language", manual()),
        "manual-repair": () => plugin.getManualRepairTranslationOptions("hello", "bad", "target-language", manual()),
        "public-bilingual": () => plugin.getPublicBilingualTranslationOptions(),
        "public-bilingual-retry": () => plugin.getPublicBilingualRetryOptions("hello", "bad", plugin.getPublicBilingualTranslationOptions()),
        "public-bilingual-final": () => plugin.getPublicBilingualFinalFallbackOptions("hello", plugin.getPublicBilingualTranslationOptions())
    };
}

test("direct providers get a valid target code for every language preset in every request path", () => {
    for (const provider of ["googleCloud", "microsoft", "deepl", "baidu"]) {
        for (const preset of LANGUAGE_PRESETS) {
            const plugin = createDirectPlugin(provider);
            plugin.settings.translation.targetLanguage = preset.value;
            plugin.settings.polish.targetLanguage = preset.value;
            const expected = getExpectedTargetCode(provider, preset.code);
            for (const [path, build] of Object.entries(getOptionBuilders(plugin))) {
                const options = build();
                const built = plugin.buildModelRequest("translation", "hello", { configOverrides: options.configOverrides });
                assert.equal(getSentTargetCode(provider, built), expected, `${provider} ${preset.value} ${path}`);
            }
            // Requests built without overrides read the raw setting.
            assert.equal(getSentTargetCode(provider, plugin.buildModelRequest("translation", "hello")), expected, `${provider} ${preset.value} plain`);
            // The API test uses the configured target language, not a hard-coded "en".
            assert.equal(getSentTargetCode(provider, plugin.buildConnectionTestRequest("translation")), expected, `${provider} ${preset.value} api test`);
        }
    }
});

test("an LLM instruction label alone still resolves to the explicit code it names", () => {
    for (const provider of ["googleCloud", "microsoft", "deepl", "baidu"]) {
        for (const preset of LANGUAGE_PRESETS) {
            const plugin = createDirectPlugin(provider);
            const label = plugin.getAutoTranslationTargetInstruction(preset.value);
            const built = plugin.buildModelRequest("translation", "hello", {
                configOverrides: { ...plugin.settings.translation, targetLanguage: label }
            });
            assert.equal(getSentTargetCode(provider, built), getExpectedTargetCode(provider, preset.code), `${provider} ${label}`);
        }
    }
});

test("DeepL sends ZH-HANT/ZH-HANS as target but plain ZH as source", () => {
    const plugin = new Plugin();
    assert.equal(plugin.getDeepLLanguageCode("繁體中文"), "ZH-HANT");
    assert.equal(plugin.getDeepLLanguageCode("zh-TW"), "ZH-HANT");
    assert.equal(plugin.getDeepLLanguageCode("汉语"), "ZH-HANS");
    assert.equal(plugin.getDeepLLanguageCode("繁體中文", { source: true }), "ZH");
    assert.equal(plugin.getDeepLLanguageCode("汉语", { source: true }), "ZH");
});

test("DeepL Traditional Chinese cache entries saved with the old ZH target stop matching; other keys stay", () => {
    const plugin = createDirectPlugin("deepl");
    const snapshotFor = language => {
        plugin.settings.translation.targetLanguage = language;
        const options = plugin.getAutoTranslationOptions();
        return plugin.getCacheConfigSnapshot("translation", plugin.getEffectiveTaskConfig("translation", options.configOverrides), { servedModel: true });
    };
    // Before the fix every DeepL snapshot had model "", so a different value for
    // Traditional Chinese retires the Simplified text cached under that target.
    assert.notEqual(snapshotFor("繁體中文").model, "");
    for (const language of ["汉语", "英语", "日语", "西班牙语"]) {
        assert.equal(snapshotFor(language).model, "", language);
    }
});

test("the Google API key travels in a header, never in the URL", () => {
    const plugin = createDirectPlugin("googleCloud");
    const built = plugin.buildModelRequest("translation", "hello");
    assert.equal(built.endpoint, "https://translation.googleapis.com/language/translate/v2");
    assert.equal(built.endpoint.includes("AIza"), false);
    assert.equal(built.request.headers["X-Goog-Api-Key"], "AIza-fake-1");
});

test("an empty or unparseable local reply fails only that message and keeps the provider healthy", async () => {
    const plugin = new Plugin();
    Object.assign(plugin.settings.translation, { provider: "sakuraLocal", endpoint: LOCAL_ENDPOINT, apiKey: "", model: "local-model" });
    const config = plugin.settings.translation;
    for (const error of [new Error(plugin.t("emptyResult")), new Error(plugin.t("invalidJson"))]) {
        plugin.annotateModelRequestError(error, "translation", LOCAL_ENDPOINT, config, { configOverrides: config });
        assert.equal(Boolean(error.localProviderUnavailable), false);
        assert.equal(plugin.getAutoTranslationFailureType(error), "invalid-output");
    }
    // Connection-level failures still mark the local service unavailable.
    const refused = Object.assign(new Error("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    plugin.annotateModelRequestError(refused, "translation", LOCAL_ENDPOINT, config, { configOverrides: config });
    assert.equal(plugin.getAutoTranslationFailureType(refused), "local-unavailable");
    const server = Object.assign(new Error("API_ERROR"), { status: 503 });
    plugin.annotateModelRequestError(server, "translation", LOCAL_ENDPOINT, config, { configOverrides: config });
    assert.equal(plugin.getAutoTranslationFailureType(server), "local-unavailable");

    plugin.fetchApiResponseText = async endpoint => /\/models$/.test(endpoint)
        ? JSON.stringify({ data: [{ id: "fake-model.gguf" }] })
        : JSON.stringify({ choices: [{ message: { content: "" }, finish_reason: "stop" }] });
    const options = plugin.getAutoTranslationOptions();
    let thrown = null;
    await assert.rejects(plugin.runModelTask("translation", "hello", { configOverrides: options.configOverrides, mode: "auto" }), error => {
        thrown = error;
        return true;
    });
    assert.equal(plugin.getAutoTranslationFailureType(thrown), "invalid-output");
    plugin.markAutoTranslationProviderFailure(options, thrown);
    assert.equal(Boolean(plugin.getAutoTranslationProviderFailure(options)), false);
    assert.equal(plugin.isMajorAutoTranslationFailure(thrown), false);
});

function googleApiError(plugin, status, body) {
    const error = Object.assign(new Error("API_ERROR"), { status, retryAfterMs: 0 });
    const built = plugin.buildModelRequest("translation", "hello");
    plugin.annotateGoogleTranslateApiError(error, JSON.stringify(body), built.request);
    return error;
}

test("Google per-minute limits are rate limits with a short cooldown; daily and monthly quota are not", () => {
    const plugin = createDirectPlugin("googleCloud");
    const perMinute = googleApiError(plugin, 429, { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'v2 and v3 general model characters' and limit 'v2 and v3 general model characters per minute per user' of service 'translate.googleapis.com'." } });
    assert.equal(plugin.getAutoTranslationFailureType(perMinute), "rate-limit");
    assert.equal(Boolean(perMinute.googleTranslateQuotaExceeded), false);
    assert.ok(perMinute.retryAfterMs >= 30000 && perMinute.retryAfterMs <= 120000, String(perMinute.retryAfterMs));

    const userRate = googleApiError(plugin, 403, { error: { code: 403, message: "User Rate Limit Exceeded", errors: [{ reason: "userRateLimitExceeded" }] } });
    assert.equal(plugin.getAutoTranslationFailureType(userRate), "rate-limit");
    assert.doesNotMatch(plugin.formatError(userRate), /无效|invalid/i);

    const withHeader = Object.assign(new Error("API_ERROR"), { status: 429, retryAfterMs: 5000 });
    plugin.annotateGoogleTranslateApiError(withHeader, "{\"error\":{\"status\":\"RESOURCE_EXHAUSTED\"}}", plugin.buildModelRequest("translation", "hi").request);
    assert.equal(withHeader.retryAfterMs, 5000);

    const daily = googleApiError(plugin, 403, { error: { code: 403, message: "Daily Limit Exceeded", errors: [{ reason: "dailyLimitExceeded" }] } });
    assert.equal(plugin.getAutoTranslationFailureType(daily), "quota");
    assert.ok(daily.retryAfterMs > 120000 && daily.retryAfterMs <= 25 * 60 * 60 * 1000, String(daily.retryAfterMs));

    const monthly = googleApiError(plugin, 403, { error: { code: 403, message: "Quota Exceeded", errors: [{ reason: "quotaExceeded" }] } });
    assert.equal(plugin.getAutoTranslationFailureType(monthly), "quota");
    assert.ok(monthly.retryAfterMs > 120000);

    const before = Date.now();
    plugin.markGoogleTranslateKeyFailure("AIza-fake-1", perMinute);
    const cooldownUntil = plugin.settings.googleTranslate.keys[0].cooldownUntil;
    assert.ok(cooldownUntil > before && cooldownUntil <= Date.now() + 120000, String(cooldownUntil - before));
});

const GOOGLE_PER_MINUTE_BODY = { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'v2 and v3 general model characters' and limit 'v2 and v3 general model characters per minute per user' of service 'translate.googleapis.com'.", errors: [{ reason: "rateLimitExceeded" }] } };
const GOOGLE_MONTHLY_BODY = { error: { code: 403, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded for quota metric 'Characters per month'", errors: [{ reason: "quotaExceeded" }] } };

function createGooglePoolPlugin(poolText, locale = "zh-CN") {
    const plugin = new Plugin();
    plugin.settings.ui.language = locale;
    plugin.settings.ui.showAutoTranslateToasts = false;
    plugin.settings.translation.provider = "googleCloud";
    plugin.saveSettings = () => true;
    plugin.setSetting("googleTranslate.keyPoolText", poolText, { save: false });
    plugin.toasts = [];
    plugin.showToast = (text, type) => plugin.toasts.push({ text, type });
    return plugin;
}

// Sends one auto request through the real request path and lets it fail the way the queue would see it.
async function failGoogleRequest(plugin, status, body) {
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        const error = Object.assign(new Error("API_ERROR"), { status, retryAfterMs: 0 });
        plugin.annotateGoogleTranslateApiError(error, JSON.stringify(body), request);
        throw error;
    };
    const options = plugin.getAutoTranslationOptions();
    let thrown = null;
    try {
        await plugin.runModelTask("translation", "hola amigos", { configOverrides: options.configOverrides, mode: "auto" });
    }
    catch (error) {
        thrown = error;
    }
    assert.ok(thrown, "the request fails");
    plugin.markAutoTranslationProviderFailure(options, thrown);
    plugin.showAutoTranslateError(thrown);
    return thrown;
}

// prov-2 / X1: a key that only waits out a per-minute limit is not "monthly quota exhausted".
test("while the only Google key cools down after a rate limit, requests wait instead of reporting the monthly quota", async () => {
    for (const locale of ["zh-CN", "en"]) {
        const plugin = createGooglePoolPlugin("only|AIza-fake-only|450000", locale);
        const limited = await failGoogleRequest(plugin, 429, GOOGLE_PER_MINUTE_BODY);
        assert.equal(plugin.getAutoTranslationFailureType(limited), "rate-limit");
        const cooldownUntil = plugin.settings.googleTranslate.keys[0].cooldownUntil;
        assert.ok(cooldownUntil > Date.now());

        let next = null;
        try { plugin.buildModelRequest("translation", "second message"); }
        catch (error) { next = error; }
        assert.ok(next, "no key can take the request yet");
        assert.equal(plugin.getAutoTranslationFailureType(next), "rate-limit", locale);
        assert.equal(Boolean(next.googleTranslateQuotaExceeded), false);
        assert.equal(next.providerKey, plugin.getGoogleTranslateProviderKey(), "the whole pool waits");
        assert.ok(next.retryAfterMs > 0 && next.retryAfterMs <= cooldownUntil - Date.now() + 1000, String(next.retryAfterMs));
        const monthly = plugin.t("googleTranslateQuotaExceeded");
        assert.notEqual(plugin.formatError(next), monthly);
        assert.match(plugin.formatError(next), locale === "en" ? /cooling down/ : /冷却/);

        const presentation = plugin.getTranslationErrorPresentation(next);
        assert.equal(presentation.action, "wait", JSON.stringify(presentation));
        assert.match(presentation.message, locale === "en" ? /cooling down/ : /冷却/);

        plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), next);
        plugin.showAutoTranslateError(next);
        assert.deepEqual(plugin.toasts, [], "a short wait needs no attention toast");
        assert.notEqual(plugin.getApiStatus("translation").state, "failed");
        const gate = plugin.getAutoTranslationProviderFailure(plugin.getAutoTranslationOptions());
        assert.ok(gate, "queued items wait for the pool");
        assert.ok(gate.retryAt <= cooldownUntil + 1000, "no longer than the key's own cooldown");
    }

    // A key that is really over its monthly limit still reports the quota.
    const full = createGooglePoolPlugin("full|AIza-fake-full|1000");
    full.markGoogleTranslateKeyUsage("AIza-fake-full", 1000);
    assert.throws(() => full.buildModelRequest("translation", "hello"), error => error.googleTranslateQuotaExceeded === true
        && full.getAutoTranslationFailureType(error) === "quota");

    // A key cooling until tomorrow (daily limit) says when it is back and points to the settings.
    const daily = createGooglePoolPlugin("daily|AIza-fake-daily|450000");
    daily.settings.googleTranslate.keys[0].cooldownUntil = Date.now() + 10 * 60 * 60 * 1000;
    assert.throws(() => daily.buildModelRequest("translation", "hello"), error => {
        const presentation = daily.getTranslationErrorPresentation(error);
        return error.googleTranslateKeysCooling === true && presentation.action === "settings" && /冷却/.test(presentation.message);
    });
});

// CL-4: the pool is one provider for the user: one notice per episode, and only when no key is left.
test("a Google key pool raises one attention toast, only when no key in the pool can serve", async () => {
    const plugin = createGooglePoolPlugin("one|AIza-fake-one|450000\ntwo|AIza-fake-two|450000\nthree|AIza-fake-three|450000");
    const first = await failGoogleRequest(plugin, 403, GOOGLE_MONTHLY_BODY);
    assert.equal(plugin.getAutoTranslationFailureType(first), "quota");
    assert.deepEqual(plugin.toasts, [], "the pool rotates to the next key and keeps translating");
    assert.notEqual(plugin.getApiStatus("translation").state, "failed");
    assert.notEqual(plugin.getTranslationErrorPresentation(first).action, "settings");

    await failGoogleRequest(plugin, 403, GOOGLE_MONTHLY_BODY);
    assert.deepEqual(plugin.toasts, []);
    const last = await failGoogleRequest(plugin, 403, GOOGLE_MONTHLY_BODY);
    assert.equal(plugin.toasts.length, 1, JSON.stringify(plugin.toasts));
    assert.match(plugin.toasts[0].text, /额度/);
    assert.equal(plugin.getTranslationErrorPresentation(last).action, "settings");
    assert.equal(plugin.getApiStatus("translation").state, "failed");

    // Every key is cooling now; the next requests only wait and stay quiet.
    let cooling = null;
    try { plugin.buildModelRequest("translation", "hello"); }
    catch (error) { cooling = error; }
    plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), cooling);
    plugin.showAutoTranslateError(cooling);
    assert.equal(plugin.toasts.length, 1);

    // One success ends the pool's episode, whichever key it used.
    plugin.settings.googleTranslate.keys = plugin.settings.googleTranslate.keys.map(key => ({ ...key, cooldownUntil: 0 }));
    plugin.fetchApiResponseText = async () => JSON.stringify({ data: { translations: [{ translatedText: "hola" }] } });
    await plugin.runModelTask("translation", "hello", { configOverrides: plugin.getAutoTranslationOptions().configOverrides, mode: "auto" });
    assert.equal(plugin.autoTranslationProviderNoticeAt.size, 0);
});

test("resetting Google stats and a successful API test clear a key's cooldown; the stats row shows it", async () => {
    const plugin = createDirectPlugin("googleCloud");
    plugin.showToast = () => {};
    const cooldownUntil = Date.now() + 5 * 24 * 60 * 60 * 1000;
    plugin.settings.googleTranslate.keys[0].cooldownUntil = cooldownUntil;
    assert.match(plugin.getGoogleTranslateStatsText(), /冷却/);
    plugin.settings.ui.language = "en";
    assert.match(plugin.getGoogleTranslateStatsText(), /cool/i);
    plugin.resetGoogleTranslateUsageStats();
    assert.equal(plugin.settings.googleTranslate.keys[0].cooldownUntil, 0);
    assert.doesNotMatch(plugin.getGoogleTranslateStatsText(), /cool/i);

    plugin.settings.googleTranslate.keys[0].cooldownUntil = cooldownUntil;
    const sent = [];
    plugin.fetchApiResponseText = async (endpoint, request) => {
        sent.push(request.headers["X-Goog-Api-Key"]);
        return JSON.stringify({ data: { translations: [{ translatedText: "hola" }] } });
    };
    const toasts = [];
    plugin.showToast = (text, type) => toasts.push({ text, type });
    await plugin.testApiConnection("translation", null, null);
    assert.deepEqual(sent, ["AIza-fake-1"]);
    assert.equal(toasts.at(-1)?.type, "success", JSON.stringify(toasts));
    assert.equal(plugin.settings.googleTranslate.keys[0].cooldownUntil, 0);
});

// prov-3: the API test uses a key that auto-translation can use; a cooling key only when all are cooling.
test("the Google API test prefers a key that is not cooling down and names the key that failed", async () => {
    const plugin = createGooglePoolPlugin("main|AIza-fake-main|450000\nbackup|AIza-fake-backup|450000", "en");
    const mainCooldown = Date.now() + 10 * 60 * 60 * 1000;
    plugin.settings.googleTranslate.keys[0].cooldownUntil = mainCooldown;
    const sent = [];
    let failWith = null;
    plugin.fetchApiResponseText = async (_endpoint, request) => {
        sent.push(request.headers["X-Goog-Api-Key"]);
        if (failWith) {
            const error = Object.assign(new Error("API_ERROR"), { status: failWith.status, retryAfterMs: 0 });
            plugin.annotateGoogleTranslateApiError(error, JSON.stringify(failWith.body), request);
            throw error;
        }
        return JSON.stringify({ data: { translations: [{ translatedText: "hola" }] } });
    };
    await plugin.testApiConnection("translation", null, null);
    assert.deepEqual(sent, ["AIza-fake-backup"]);
    assert.equal(plugin.toasts.at(-1)?.type, "success", JSON.stringify(plugin.toasts));
    assert.equal(plugin.settings.googleTranslate.keys[0].cooldownUntil, mainCooldown, "the cooling key is left alone");

    failWith = { status: 403, body: { error: { code: 403, message: "Daily Limit Exceeded", errors: [{ reason: "dailyLimitExceeded" }] } } };
    const statusElement = { dataset: { daitKind: "translation" } };
    await plugin.testApiConnection("translation", null, statusElement);
    assert.deepEqual(sent, ["AIza-fake-backup", "AIza-fake-backup"]);
    const failure = plugin.toasts.at(-1);
    assert.equal(failure.type, "error");
    assert.match(failure.text, /backup/, failure.text);
    assert.match(plugin.getApiStatus("translation").message, /backup/);
    assert.equal(JSON.stringify(plugin.toasts).includes("AIza"), false, "never the key itself");
});

test("a Google key removed from the pool and added back keeps this month's usage", () => {
    const plugin = new Plugin();
    const google = plugin.settings.googleTranslate;
    plugin.setSetting("googleTranslate.keyPoolText", "A|AIza-fake-a|450000\nB|AIza-fake-b|450000", { save: false });
    plugin.markGoogleTranslateKeyUsage("AIza-fake-a", 440000);
    plugin.markGoogleTranslateKeyUsage("AIza-fake-b", 1000);
    plugin.setSetting("googleTranslate.keyPoolText", "B|AIza-fake-b|450000", { save: false });
    assert.deepEqual(google.keys.map(key => key.label), ["B"]);
    plugin.setSetting("googleTranslate.keyPoolText", "B|AIza-fake-b|450000\nA|AIza-fake-a|450000", { save: false });
    assert.equal(google.keys.find(key => key.label === "A").usedChars, 440000);
    assert.equal(google.keys.find(key => key.label === "B").usedChars, 1000);

    // Clearing the whole pool keeps the record too.
    plugin.setSetting("googleTranslate.keyPoolText", "", { save: false });
    assert.equal(google.keys.length, 0);
    plugin.setSetting("googleTranslate.keyPoolText", "A|AIza-fake-a|450000", { save: false });
    assert.equal(google.keys[0].usedChars, 440000);
    assert.ok(Object.keys(google.usageById).length >= 1);
    assert.equal(JSON.stringify(google.usageById).includes("AIza"), false, "the ledger never stores raw keys");

    // Usage from another month is not carried over.
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const staleId = Object.keys(google.usageById)[0];
    google.usageById[staleId] = { monthKey: plugin.getCurrentMonthKey(lastMonth), usedChars: 999 };
    google.keys = google.keys.map(key => ({ ...key, monthKey: plugin.getCurrentMonthKey(lastMonth) }));
    plugin.setSetting("googleTranslate.keyPoolText", "A|AIza-fake-a|450001", { save: false });
    assert.equal(google.keys[0].usedChars, 0);

    // Resetting the stats clears remembered usage of removed keys as well.
    plugin.markGoogleTranslateKeyUsage("AIza-fake-a", 5000);
    plugin.setSetting("googleTranslate.keyPoolText", "B|AIza-fake-b|450000", { save: false });
    plugin.showToast = () => {};
    plugin.resetGoogleTranslateUsageStats();
    plugin.setSetting("googleTranslate.keyPoolText", "B|AIza-fake-b|450000\nA|AIza-fake-a|450000", { save: false });
    assert.equal(google.keys.find(key => key.label === "A").usedChars, 0);

    const snapshotText = JSON.stringify(plugin.createSettingsSnapshot());
    assert.equal(snapshotText.includes("AIza-fake"), false);
});

test("Baidu error codes map to provider-level failures with friendly messages", () => {
    const plugin = createDirectPlugin("baidu");
    const cases = {
        "52001": "server",
        "52002": "server",
        "52003": "auth",
        "54000": "auth",
        "54001": "auth",
        "54003": "rate-limit",
        "54004": "quota",
        "54005": "rate-limit",
        "58000": "auth",
        "58001": "auth",
        "58002": "auth",
        "90107": "auth",
        "99999": "server"
    };
    for (const [code, type] of Object.entries(cases)) {
        const error = plugin.createBaiduTranslateError({ error_code: code, error_msg: "RAW BAIDU MESSAGE" });
        assert.equal(plugin.getAutoTranslationFailureType(error), type, code);
        assert.equal(plugin.isMajorAutoTranslationFailure(error), true, code);
        const text = plugin.formatError(error);
        assert.doesNotMatch(text, /RAW BAIDU MESSAGE/, code);
        assert.match(text, new RegExp(code), code);
    }
    const unsupported = plugin.createBaiduTranslateError({ error_code: "58001", error_msg: "UNSUPPORT TRANSLATE DIRECTION" });
    assert.match(plugin.formatError(unsupported), /语言/);
    const options = plugin.getAutoTranslationOptions();
    plugin.markAutoTranslationProviderFailure(options, unsupported);
    assert.ok(plugin.getAutoTranslationProviderFailure(options), "a config error pauses the provider");
    assert.equal(plugin.getApiStatus("translation").state, "failed");

    const slowLong = plugin.createBaiduTranslateError({ error_code: "54005" });
    assert.ok(slowLong.retryAfterMs >= 3000 && slowLong.retryAfterMs <= 10000);

    const risky = plugin.createBaiduTranslateError({ error_code: "20003" });
    assert.equal(plugin.createAutoTranslationFailure("risky", risky).terminal, true);

    // Through the real parser: 58001 in an HTTP 200 body, and 52000 meaning success.
    assert.throws(() => plugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "58001", error_msg: "UNSUPPORT TRANSLATE DIRECTION" })),
        error => plugin.getAutoTranslationFailureType(error) === "auth" && error.providerLanguageUnsupported === true);
    assert.equal(plugin.parseBaiduTranslateResponse(JSON.stringify({ error_code: "52000", trans_result: [{ src: "a", dst: "b" }] })), "b");
});

// prov-1 / X2: Baidu's IP, language and parameter errors pause the provider like a bad key, but the
// chat line, the one attention toast and the API status must name the real problem and the code.
test("Baidu IP, language and parameter errors say what is wrong, with the Baidu code, on the line, toast and API status", () => {
    const expected = {
        "58000": "errorIpNotAllowed",
        "58001": "errorLanguageUnsupported",
        "54000": "errorProviderRequestRejected"
    };
    for (const locale of ["zh-CN", "en"]) {
        for (const [code, key] of Object.entries(expected)) {
            const plugin = createDirectPlugin("baidu");
            plugin.settings.ui.language = locale;
            plugin.settings.ui.showAutoTranslateToasts = false;
            plugin.saveSettings = () => true;
            const toasts = [];
            plugin.showToast = (text, type) => toasts.push({ text, type });
            const specific = plugin.t(key).replace(/[。.]$/, "");
            const error = plugin.createBaiduTranslateError({ error_code: code, error_msg: "RAW BAIDU MESSAGE" });

            const presentation = plugin.getTranslationErrorPresentation(error);
            assert.equal(presentation.action, "settings", `${locale} ${code}`);
            assert.ok(presentation.message.includes(specific), `${locale} ${code}: ${presentation.message}`);
            assert.ok(presentation.message.includes(code), `${locale} ${code}: ${presentation.message}`);
            assert.equal(presentation.message.includes(plugin.t("translationErrorAuth")), false, `${locale} ${code}: ${presentation.message}`);

            plugin.markAutoTranslationProviderFailure(plugin.getAutoTranslationOptions(), error);
            plugin.showAutoTranslateError(error);
            assert.equal(toasts.length, 1, JSON.stringify(toasts));
            assert.ok(toasts[0].text.includes(specific) && toasts[0].text.includes(code), `${locale} ${code}: ${toasts[0].text}`);
            assert.equal(toasts[0].text.includes(plugin.t("translationErrorAuth")), false);

            const status = plugin.getApiStatus("translation");
            assert.equal(status.state, "failed");
            assert.ok(status.message.includes(plugin.t(key)) && status.message.includes(code), `${locale} ${code}: ${status.message}`);
        }
        // A bad app id or key still says so, now with the Baidu code.
        const plugin = createDirectPlugin("baidu");
        plugin.settings.ui.language = locale;
        const badKey = plugin.getTranslationErrorPresentation(plugin.createBaiduTranslateError({ error_code: "52003" }));
        assert.ok(badKey.message.startsWith(plugin.t("translationErrorAuth")) && badKey.message.includes("52003"), badKey.message);
        const quota = plugin.getTranslationErrorPresentation(plugin.createBaiduTranslateError({ error_code: "54004" }));
        assert.ok(quota.message.startsWith(plugin.t("translationErrorQuota")) && quota.message.includes("54004"), quota.message);
    }
});

test("HTTP errors: 402 is quota; digits inside a body never decide the type", () => {
    const plugin = createDirectPlugin("deepl");
    assert.equal(plugin.getAutoTranslationFailureType(Object.assign(new Error("API_ERROR"), { status: 402 })), "quota");
    const request = plugin.buildModelRequest("translation", "hello").request;
    const classify = (status, body) => {
        const error = Object.assign(new Error("API_ERROR"), { status });
        plugin.annotateTranslateProviderApiError(error, body, request);
        return plugin.getAutoTranslationFailureType(error);
    };
    assert.equal(classify(400, "{\"message\":\"Bad request\",\"request_id\":\"a1456b-4290-4033\"}"), "client");
    assert.equal(classify(456, "Quota exceeded"), "quota");
    assert.equal(classify(403, "{\"message\":\"Wrong auth key\"}"), "auth");
    assert.equal(classify(429, "Too many requests"), "rate-limit");
    assert.equal(classify(503, "Service unavailable"), "server");
    const microsoft = createDirectPlugin("microsoft");
    const msError = Object.assign(new Error("API_ERROR"), { status: 403 });
    microsoft.annotateTranslateProviderApiError(msError, "{\"error\":{\"code\":403001,\"message\":\"The operation isn't allowed because the subscription has exceeded its free quota.\"}}", microsoft.buildModelRequest("translation", "hello").request);
    assert.equal(microsoft.getAutoTranslationFailureType(msError), "quota");
    for (const locale of ["zh-CN", "en"]) {
        plugin.settings.ui.language = locale;
        assert.match(plugin.formatError(Object.assign(new Error("API_ERROR"), { status: 402 })), locale === "en" ? /quota|balance/i : /额度|余额/);
    }
});

test("the cache key follows the model the local server actually serves", () => {
    const plugin = new Plugin();
    Object.assign(plugin.settings.translation, { provider: "sakuraLocal", endpoint: LOCAL_ENDPOINT, apiKey: "", model: "local-model" });
    const config = plugin.settings.translation;
    const key = () => plugin.getTranslationCacheKey("hello", plugin.getAutoTranslationOptions());
    const providerKey = () => plugin.getAutoTranslationProviderKey(plugin.getAutoTranslationOptions());
    const undetected = key();
    const providerBefore = providerKey();
    plugin.setCachedLocalProviderDetectedModel(config, "HY-MT1.5-1.8B.gguf");
    const first = key();
    plugin.setTranslationCache(first, "old model text");
    plugin.setCachedLocalProviderDetectedModel(config, "Qwen3-8B.gguf");
    const second = key();
    assert.notEqual(first, undetected);
    assert.notEqual(second, first);
    assert.equal(plugin.getTranslationCacheValue(second, plugin.getTranslationCacheAliases("hello", plugin.getAutoTranslationOptions())), null);
    assert.equal(plugin.translationCache.has(first), true, "old entries stay; they just stop matching");
    assert.equal(providerKey(), providerBefore, "provider health and cooldowns are not split by model");

    // A configured model name is used as-is.
    const explicit = new Plugin();
    Object.assign(explicit.settings.translation, { provider: "sakuraLocal", endpoint: LOCAL_ENDPOINT, apiKey: "", model: "my-model" });
    const explicitKey = explicit.getTranslationCacheKey("hello", explicit.getAutoTranslationOptions());
    explicit.setCachedLocalProviderDetectedModel({ ...explicit.settings.translation, model: "local-model" }, "other.gguf");
    assert.equal(explicit.getTranslationCacheKey("hello", explicit.getAutoTranslationOptions()), explicitKey);

    // The last detected model survives a restart, so cached lines draw before the server answers.
    const stored = {};
    plugin.saveData = (dataKey, value) => { stored[dataKey] = JSON.parse(JSON.stringify(value)); return true; };
    plugin.translationCacheDirty = true;
    assert.equal(plugin.flushTranslationCache(), true);
    const restarted = new Plugin();
    Object.assign(restarted.settings.translation, { provider: "sakuraLocal", endpoint: LOCAL_ENDPOINT, apiKey: "", model: "local-model" });
    restarted.loadData = dataKey => stored[dataKey] ?? null;
    restarted.loadTranslationCache();
    assert.equal(restarted.getTranslationCacheKey("hello", restarted.getAutoTranslationOptions()), second);
    assert.equal(JSON.stringify(stored).includes("Qwen3-8B.gguf"), true);
});

// prov-4: the cached-draw memo remembers hits by cache key; a new served model retires them.
test("a newly detected local model stops the cached-draw memo from drawing the old model's text", () => {
    const plugin = new Plugin();
    plugin.scheduleTranslationCachePersist = () => {};
    Object.assign(plugin.settings.translation, { provider: "sakuraLocal", endpoint: LOCAL_ENDPOINT, apiKey: "", model: "local-model" });
    const config = plugin.settings.translation;
    plugin.setCachedLocalProviderDetectedModel(config, "HY-MT1.5-1.8B.gguf");
    const key = plugin.getTranslationCacheKey("bonjour", plugin.getAutoTranslationOptions());
    plugin.setTranslationCache(key, "old model text");
    const memoKey = "route|message-1|message|fake-hash";
    plugin.rememberCachedDrawMemoEntry(memoKey, { result: "hit", cacheKey: key, translated: "old model text", keys: [key] });
    assert.ok(plugin.getCachedDrawMemoEntry(memoKey), "the memo serves the hit while the model is the same");

    plugin.setCachedLocalProviderDetectedModel(config, "HY-MT1.5-1.8B.gguf");
    assert.ok(plugin.getCachedDrawMemoEntry(memoKey), "re-detecting the same model keeps the memo");

    plugin.setCachedLocalProviderDetectedModel(config, "Qwen3-8B.gguf");
    assert.equal(plugin.getCachedDrawMemoEntry(memoKey), null);
});

test("exports show only the model file name, not a local path", () => {
    const plugin = new Plugin();
    plugin.settings.translation.model = "C:\\Users\\fake-user\\models\\fake-model.gguf";
    plugin.settings.polish.model = "/home/fake-user/models/other-model.gguf";
    const exportText = JSON.stringify(plugin.getDiagnosticLogsSnapshot());
    const snapshot = plugin.createSettingsSnapshot();
    for (const text of [exportText, JSON.stringify(snapshot)]) {
        assert.equal(text.includes("fake-user"), false);
    }
    assert.equal(plugin.getDiagnosticLogsSnapshot().settings.model, "fake-model.gguf");
    assert.equal(snapshot.settings.translation.model, "fake-model.gguf");
    assert.equal(snapshot.settings.polish.model, "other-model.gguf");
});

const INTERNAL_TEXT = /MODEL_OUTPUT_TRUNCATED|DATA_SAVE_|NO_LOCAL_PROVIDER_MODEL|MD5_UNAVAILABLE|AUTO_TRANSLATION_STALE|API_ERROR|verification-failed|write-cancelled|clipboard unavailable|execCommand|\(4s\)/;

test("user-facing errors are localized and never show internal codes", async t => {
    for (const locale of ["zh-CN", "en"]) {
        const plugin = new Plugin();
        plugin.settings.ui.language = locale;
        const truncated = plugin.createModelOutputTruncatedError("partial", "length");
        const errors = [
            truncated,
            new Error("DATA_SAVE_FAILED"),
            new Error("DATA_SAVE_UNAVAILABLE"),
            new Error("NO_LOCAL_PROVIDER_MODEL"),
            new Error("MD5_UNAVAILABLE"),
            new Error("AUTO_TRANSLATION_STALE"),
            Object.assign(new Error("API_ERROR"), { status: 0 }),
            plugin.createBaiduTranslateError({ error_code: "12345", error_msg: "SOMETHING" })
        ];
        for (const status of [400, 401, 402, 403, 404, 429, 456, 500, 503]) {
            errors.push(Object.assign(new Error("API_ERROR"), { status }));
        }
        for (const flag of ["providerQuotaExceeded", "providerRateLimited", "providerAuthFailed", "providerServerError", "googleTranslateQuotaExceeded", "providerRequestRejected", "providerLanguageUnsupported", "providerIpRejected"]) {
            errors.push(Object.assign(new Error("API_ERROR"), { status: 403, [flag]: true }));
        }
        for (const error of errors) {
            const text = plugin.formatError(error);
            assert.doesNotMatch(text, INTERNAL_TEXT, `${locale}: ${text}`);
            assert.doesNotMatch(text, /^API \d+/, `${locale}: ${text}`);
            assert.ok(text.trim().length > 0);
            if (locale === "zh-CN") assert.match(text, /[一-鿿]/, text);
        }
        assert.equal(plugin.formatError(truncated), plugin.t("errorOutputTruncated"));
        assert.throws(() => plugin.copyTextToClipboardFallback("x"), error => !INTERNAL_TEXT.test(plugin.formatError(error)) && plugin.formatError(error) === plugin.t("clipboardUnavailable"));
        // Auto-translation toasts may mention the retry wait, other toasts never do.
        const localDown = Object.assign(new Error("fetch failed"), { localProviderUnavailable: true, retryAfterMs: 60000 });
        assert.match(plugin.formatError(localDown, { includeRetry: true }), /60s/);
        assert.doesNotMatch(plugin.formatError(localDown), /60s/);
    }

    for (const [reason, expectedKey, type] of [
        ["verification-failed", "errorComposerWriteFailed", "error"],
        ["write-cancelled", "composerResultHeld", "info"]
    ]) {
        await t.test(reason, async () => {
            const plugin = new Plugin();
            plugin.settings.polish.apiKey = "sk-fake-1";
            const textbox = { isConnected: true, text: "你好" };
            const toasts = [];
            plugin.getActiveTextbox = () => textbox;
            plugin.getElementText = box => box.text;
            plugin.runModelTask = async () => "hello can you help me with this";
            plugin.replaceTextboxTextSafelyAsync = async () => ({ ok: false, reason });
            plugin.showPolishResultPanel = () => {};
            plugin.showToast = (text, toastType) => toasts.push({ text, type: toastType });
            plugin.setButtonBusy = () => {};
            const result = await plugin.publicBilingualCurrentDraft();
            assert.equal(result.wrote, false);
            assert.equal(toasts.length, 1, JSON.stringify(toasts));
            assert.equal(toasts[0].type, type);
            assert.ok(toasts[0].text.includes(plugin.t(expectedKey)), toasts[0].text);
            assert.doesNotMatch(toasts[0].text, INTERNAL_TEXT);
        });
    }
});

test("new strings exist in both locales", () => {
    for (const key of ["errorOutputTruncated", "errorQuotaExceeded", "errorLanguageUnsupported", "errorIpNotAllowed", "errorProviderRequestRejected", "errorSaveFailed", "errorComposerWriteFailed", "clipboardUnavailable", "googleTranslateStatsCooldown", "googleTranslateKeysCooling", "googleTranslateKeyError"]) {
        assert.equal(typeof I18N["zh-CN"][key], "string", key);
        assert.equal(typeof I18N.en[key], "string", key);
    }
});
