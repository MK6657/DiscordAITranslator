"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { MESSAGE_CONTEXT_NAV_IDS, hasExistingMenuItem } = require("../../src/discord/context-menu");
const { buildPixelSvgMarkup, createPixelSvgDataUri } = require("../../src/ui/pixel-icons");

test("context menu adapter patches exact BetterDiscord navIds and prevents duplicate menu items", t => {
    const plugin = new Plugin();
    const savedBdApi = globalThis.BdApi;
    t.after(() => { globalThis.BdApi = savedBdApi; });

    const patchedNavIds = [];
    const callbacks = new Map();
    let unpatchCalls = 0;
    globalThis.BdApi = {
        ContextMenu: {
            patch(navId, cb) {
                patchedNavIds.push(navId);
                callbacks.set(navId, cb);
                return () => { unpatchCalls++; };
            },
            buildMenuChildren(groups) { return groups; }
        }
    };

    plugin.settings.ui.injectMessageContextMenu = true;
    plugin.patchMessageContextMenu();
    assert.deepEqual(patchedNavIds, [...MESSAGE_CONTEXT_NAV_IDS]);
    assert.equal(patchedNavIds.every(id => typeof id === "string"), true, "navIds must be strings, not RegExp");

    // Calling the same patch callback twice on the same React tree must not stack duplicate items.
    const tree = { props: { children: [] } };
    callbacks.get("message")(tree, { target: null });
    callbacks.get("message")(tree, { target: null });
    assert.equal(tree.props.children.length, 1);
    assert.equal(hasExistingMenuItem(tree, "dait-translate-message"), true);

    // Re-patching unpatches previous hooks first (no leak across reload/toggle).
    plugin.patchMessageContextMenu();
    assert.equal(unpatchCalls, MESSAGE_CONTEXT_NAV_IDS.length);
    plugin.unpatchContextMenus();
    assert.equal(unpatchCalls, MESSAGE_CONTEXT_NAV_IDS.length * 2);
});

test("DiscordSelectors combines live Webpack CSS class names with resilient attribute fallbacks", t => {
    const plugin = new Plugin();
    const savedBdApi = globalThis.BdApi;
    t.after(() => { globalThis.BdApi = savedBdApi; });

    globalThis.BdApi = {
        Webpack: {
            getByKeys(...keys) {
                if (keys.includes("chatContent")) {
                    return { chatContent: "chatContent_f75fb0 extraClass", messagesWrapper: "messagesWrapper_e2e187" };
                }
                return null;
            }
        }
    };

    plugin.discordHost.resetRuntimeCaches();
    const selectors = plugin.getDiscordChatMutationObserverSelectors();
    assert.ok(selectors.includes(".chatContent_f75fb0"));
    assert.ok(selectors.includes(".messagesWrapper_e2e187"));
    assert.ok(selectors.includes("[role='main']"));
});

test("runHostHealthCheck produces structured diagnostics across all Discord touchpoints", t => {
    const plugin = new Plugin();
    const savedBdApi = globalThis.BdApi;
    t.after(() => { globalThis.BdApi = savedBdApi; });

    globalThis.BdApi = {
        Data: { load() {}, save() {} },
        DOM: { addStyle() {}, removeStyle() {} },
        UI: { showToast() {} },
        Webpack: {
            getStore(name) {
                if (name === "MessageStore") return { getMessage() {}, getMessages() {} };
                if (name === "ChannelStore") return { getChannel() {} };
                if (name === "GuildRoleStore") return { getRole() {} };
                return null;
            }
        },
        ContextMenu: {
            patch: () => () => {},
            buildMenuChildren: groups => groups
        }
    };

    plugin.discordHost.resetRuntimeCaches();
    plugin.patchMessageContextMenu();
    const report = plugin.runHostHealthCheck();
    assert.equal(report.checks.length, 8);
    const byId = Object.fromEntries(report.checks.map(c => [c.id, c]));
    assert.equal(byId.bdApi.status, "ok");
    assert.equal(byId.stores.status, "ok");
    assert.equal(byId.contextMenu.status, "ok");
    assert.equal(byId.theme.status, "ok");
    assert.equal(report.summary.total, 8);
});

test("pixel icon helpers output crispEdges SVGs and valid data URIs", () => {
    const svg = buildPixelSvgMarkup("gear", "#ffffff");
    assert.ok(svg.includes('shape-rendering="crispEdges"'));
    assert.ok(svg.includes('viewBox="0 0 16 16"'));
    const uri = createPixelSvgDataUri("close", "#000000");
    assert.ok(uri.startsWith('url("data:image/svg+xml,'));
});
