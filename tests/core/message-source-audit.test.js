"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");

const guildId = "111111111111111111";
const channelId = "222222222222222222";
const otherChannelId = "333333333333333333";
const exactId = "444444444444444444";
const otherId = "555555555555555555";
const authorId = "666666666666666666";
const timestamp = "2026-11-19T12:00:00.000Z";
const domText = "Open the settings page and save the changes.";
const translated = "请打开设置页面并保存更改。";

function storeMessage(id, content, overrides = {}) {
    return { id, channel_id: channelId, content, author: { id: authorId }, timestamp, ...overrides };
}

function messageNodeForId(messageId) {
    return {
        nodeType: 1,
        isConnected: true,
        getAttribute: name => name === "id" && messageId ? `chat-messages-${channelId}-${messageId}` : null
    };
}

function createReplay(t, { rows, domId, hasMetadata = true, neighborId, nativeRows = [] }) {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
    globalThis.window = {
        location: { pathname: `/channels/${guildId}/${channelId}` },
        BDFDB_Global: {
            started: true,
            BDFDB: {
                LibraryStores: {
                    MessageStore: {
                        getMessagesForChannel(requestedChannelId) {
                            assert.equal(requestedChannelId, channelId);
                            return { _array: rows };
                        }
                    }
                }
            }
        }
    };
    t.after(() => {
        if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
        else delete globalThis.window;
    });
    const fetch = t.mock.method(globalThis, "fetch", () => assert.fail("Unexpected network request"));
    t.after(() => assert.equal(fetch.mock.callCount(), 0));

    const content = { text: domText, isConnected: true };
    const messageNode = {
        ...messageNodeForId(domId),
        previousElementSibling: neighborId ? messageNodeForId(neighborId) : null,
        querySelector(selector) {
            if (!hasMetadata) return null;
            if (selector.includes("[data-author-id]")) {
                return { getAttribute: name => name === "data-author-id" ? authorId : null };
            }
            if (selector.startsWith("time[")) {
                return { getAttribute: name => name === "datetime" ? timestamp : null };
            }
            return null;
        }
    };
    const plugin = new Plugin();
    plugin.isStarted = true;
    Object.assign(plugin.settings.translation, { enabled: true, targetLanguage: "Chinese" });
    plugin.settings.ui.autoTranslateIntakeMode = "bdfdb";
    Object.assign(plugin, {
        getDiscordMessageStore: () => ({ getMessages: () => nativeRows }),
        getMessageContentElements: node => node === messageNode ? [content] : [],
        getElementText: element => element.text,
        isAutoTranslationTargetInScanRange: () => true,
        scheduleTranslationCachePersist() {},
        renderManualLoading() {},
        renderTranslation() {},
        renderManualFailure: (_plan, error) => { throw error; }
    });
    return { plugin, messageNode, content };
}

const exact = storeMessage(exactId, `${domText}\nRestart the service when the update finishes.`);
const other = storeMessage(otherId, `${domText}\nSend the report to the other project team.`);
const sameTextOther = storeMessage(otherId, domText);
const scenarios = [
    {
        name: "uses the exact record from the DOM channel",
        domId: exactId,
        rows: [{ ...exact, channel_id: otherChannelId, content: other.content }, other, exact],
        selected: exact
    },
    {
        name: "uses DOM text on an exact miss despite matches under another ID",
        domId: exactId,
        rows: [other],
        nativeRows: [sameTextOther]
    },
    {
        name: "rejects an exact ID from a different channel",
        domId: exactId,
        rows: [other, { ...exact, channel_id: otherChannelId }]
    },
    {
        name: "rejects an exact record with a missing channel",
        domId: exactId,
        rows: [other, { ...exact, channel_id: undefined }]
    },
    {
        name: "uses DOM text when the exact record has no text",
        domId: exactId,
        rows: [{ ...exact, content: "" }, other]
    },
    {
        name: "uses DOM text when the exact record has incompatible text",
        domId: exactId,
        rows: [{ ...exact, content: "Please upload a photo of the receipt." }, other]
    },
    {
        name: "rejects ambiguous no-ID matches even when a second store has a single match",
        rows: [exact, sameTextOther],
        nativeRows: [sameTextOther]
    },
    {
        name: "uses a unique no-ID match corroborated by DOM metadata",
        rows: [{ ...other, timestamp: "2026-11-19T12:01:00.000Z" }, exact],
        selected: exact
    },
    {
        name: "rejects a singleton no-ID text match without corroboration",
        hasMetadata: false,
        rows: [other]
    },
    {
        name: "rejects a no-ID match from a different channel",
        rows: [{ ...other, channel_id: otherChannelId }]
    },
    {
        name: "uses a unique no-ID match corroborated by a DOM neighbor",
        hasMetadata: false,
        neighborId: otherId,
        rows: [storeMessage(otherId, "Please double-check the update notes."), exact],
        selected: exact
    }
];

for (const scenario of scenarios) {
    const requestText = scenario.selected?.content || domText;
    test(`M03 manual ${scenario.name}`, async t => {
        const { plugin, messageNode, content } = createReplay(t, scenario);
        const request = t.mock.method(plugin, "runAutoTranslationModelAttempt", async text =>
            text.includes("\n") ? `${translated}\n更新完成后重新启动服务。` : translated);
        const render = t.mock.method(plugin, "renderTranslation");

        await plugin.translateMessage(messageNode, content, null);

        assert.deepEqual(request.mock.calls.map(call => call.arguments[0]), [requestText]);
        assert.equal(render.mock.callCount(), 1);
        assert.equal(render.mock.calls[0].arguments[4], domText);
    });

    test(`M03 BDFDB ${scenario.name}`, t => {
        const { plugin, messageNode } = createReplay(t, scenario);
        const candidates = plugin.createAutoTranslationCandidates({ messageNodes: [messageNode] });
        assert.equal(candidates.length, 1);
        const [candidate] = candidates;
        assert.equal(candidate.text, requestText);
        assert.equal(candidate.messageId, scenario.selected?.id || scenario.domId || "");
        assert.equal(candidate.source, scenario.selected ? "bdfdb" : "dom");
        assert.equal(candidate.sourceTextKind, scenario.selected ? "store-full" : "dom");
        assert.equal(candidate.fullContent, scenario.selected?.content || "");
        assert.equal(plugin.getAutoTranslationTargetDomText(candidate), domText);
        if (candidate.messageId) assert.equal(candidate.channelId, channelId);

        const requestOptions = plugin.withAutoTranslationCandidateIdentity(plugin.getAutoTranslationOptions(), candidate);
        assert.equal(plugin.isAutoTranslationQueueItemReady({ ...candidate, requestOptions }), true);
    });
}
