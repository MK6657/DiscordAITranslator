"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const {
    createV030Settings,
    createFakeDataApi,
    createFakeLocalServer,
    mountChat,
    installChatGlobals,
    startChatPlugin
} = require("../fixtures/chat-harness");

const source = 'He said "Good morning" and then walked away.';
const translation = "他说“早上好”，然后离开了。";

test("A09 preserves valid inline quotes and separate quoted sentences", () => {
    const plugin = new Plugin();
    const examples = [
        [source, translation, "Chinese"],
        ['"Go home first," he said. "See you tomorrow."', "“先回家吧。”他说，“明天见。”", "Chinese"],
        ["彼女はさよならを言って帰った", 'She said "goodbye" and left soon after that.', "English"]
    ];
    for (const [original, output, language] of examples) {
        assert.equal(plugin.getAutoTranslationInvalidOutputReason(original, output, language, { skipCandidateExtraction: true }), "");
        assert.equal(plugin.sanitizeAutoTranslationOutput(original, output, language), output);
    }
});

test("A09 unwraps a whole quote and recovers a translation from invalid model explanation", () => {
    const plugin = new Plugin();
    assert.equal(plugin.sanitizeAutoTranslationOutput("Good morning.", "“早上好。”", "Chinese"), "早上好。");
    assert.equal(plugin.sanitizeAutoTranslationOutput(source, "“他说‘早上好’，然后离开了。”", "Chinese"), "他说‘早上好’，然后离开了。");
    const explanation = "该词意思是“完蛋”。";
    assert.equal(plugin.getAutoTranslationInvalidOutputReason("пиздец", explanation, "Chinese", { skipCandidateExtraction: true }), "dictionary-output");
    assert.equal(plugin.sanitizeAutoTranslationOutput("пиздец", explanation, "Chinese"), "完蛋");
});

test("A09 the automatic translation and its saved cache contain the complete sentence", async t => {
    const message = { id: "300000000000000199", phrase: "then walked away", parts: () => [source], translation };
    const bdApi = createFakeDataApi({ DiscordAITranslator: { settings: createV030Settings({ remote: true }) } });
    const globals = installChatGlobals({ bdApi });
    let session;
    t.after(() => {
        try { session?.plugin.stop(); }
        finally { globals.restore(); }
    });
    const server = createFakeLocalServer({ messages: [message] });
    const chat = mountChat(globals.document, [message]);
    session = startChatPlugin(Plugin, { server, chat });

    await session.scanUntilIdle([message.id]);

    assert.deepEqual(server.chatPhrases(), [message.phrase]);
    assert.equal(session.lineText(message.id), translation);
    const line = session.drawn.find(entry => entry.kind === "final" && entry.id === message.id);
    assert.equal(session.plugin.getTranslationCacheValue(line.cacheKey), translation);
    assert.equal(session.plugin.flushTranslationCache({ retryOnError: false }), true);
    const cache = bdApi.files["DiscordAITranslator.cache"].translationCache;
    assert.deepEqual(new Set(cache.entries.map(entry => cache.strings[entry.v])), new Set([translation]));
});
