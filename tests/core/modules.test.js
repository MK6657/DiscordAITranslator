"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TranslationRenderer } = require("../../src/auto-translation/translation-renderer");
const { ComposerWriter } = require("../../src/composer/composer-writer");
const { SettingsSchema } = require("../../src/settings/settings-schema");

test("SettingsSchema filters providers by task without exposing mutable sections", () => {
    const schema = new SettingsSchema({
        sections: [{ id: "general", labelKey: "generalTitle" }],
        providerCapabilities: {
            deepseek: { tasks: { polish: true, translation: true } },
            direct: { tasks: { polish: false, translation: true } }
        },
        providerOrder: ["deepseek", "direct"]
    });
    const sections = schema.getSections();
    sections[0].id = "changed";
    assert.equal(schema.getSections()[0].id, "general");
    assert.deepEqual(schema.getProviderOptionsForTask("polish", provider => provider), [["deepseek", "deepseek"]]);
    assert.deepEqual(schema.getProviderOptionsForTask("translation", provider => provider), [
        ["deepseek", "deepseek"],
        ["direct", "direct"]
    ]);
});

test("TranslationRenderer keeps cache tasks light and orders priority", () => {
    const plugin = {
        getTranslationOwnerId: () => "owner",
        getStrongTextFingerprint: value => `hash:${value}`,
        getDiscordMediaViewerDeferredDelayMs: () => 0,
        getAutoTranslationRenderPauseRemainingMs: () => 10,
        getAutoTranslationViewportSettleRemainingMs: () => 20,
        getAutoTranslationJumpCooldownRemainingMs: () => 5,
        getInputComposerBusyRemainingMs: () => 1,
        isAutoTranslationRenderPaused: () => false,
        isAutoTranslationViewportSettling: () => false,
        isAutoTranslationJumpCoolingDown: () => false
    };
    const renderer = new TranslationRenderer(plugin, { heavyTextLength: 10 });
    assert.equal(renderer.getQueueDelayMs(), 20);
    assert.equal(renderer.isTaskHeavy({ kind: "cache", text: "x".repeat(20) }), false);
    assert.equal(renderer.isTaskHeavy({ kind: "request", text: "x".repeat(10) }), true);
    const queue = [{ priority: 4 }, { priority: 1 }, {}];
    renderer.sortQueue(queue);
    assert.deepEqual(queue.map(item => item.priority), [1, 4, undefined]);
});

test("ComposerWriter enforces last-write-wins and trusted input cancellation", () => {
    const listeners = new Map();
    const textbox = {
        isConnected: true,
        addEventListener(type, handler) { listeners.set(type, handler); },
        removeEventListener(type) { listeners.delete(type); }
    };
    const plugin = {
        getTextboxComposerKey: () => "composer",
        normalizeDraftRawText: value => String(value),
        getTextboxTextSafe: () => "current",
        replaceTextboxTextSafelyAsync: async () => ({ ok: true }),
        submitTextbox: () => true
    };
    const writer = new ComposerWriter(plugin);
    const first = writer.beginWrite(textbox, "first");
    const second = writer.beginWrite(textbox, "second");
    assert.equal(first.cancelled, true);
    assert.equal(first.reason, "superseded");
    assert.equal(writer.isWriteTokenCurrent(second), true);
    listeners.get("input")({ isTrusted: true });
    assert.equal(second.cancelled, true);
    assert.equal(second.reason, "user-input");
});
