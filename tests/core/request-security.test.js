"use strict";

const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");

async function startFixture(t, handler) {
    const server = http.createServer(handler);
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", resolve);
    });
    t.after(() => new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
    }));
    return `http://127.0.0.1:${server.address().port}`;
}

// Real fetch against two local-only fixtures, not a mock of redirect behavior.
// Exercise both canonical sources and the installable artifact; no real keys,
// Discord session, external service, or external network traffic is involved.
for (const [label, Plugin] of [
    ["source", require("../../src/index.js")],
    ["artifact", require("../../DiscordAITranslator.plugin.js")]
]) {
    test(`${label}: provider requests must never follow redirects`, async t => {
        let targetRequests = 0;
        const destination = await startFixture(t, (request, response) => {
            targetRequests++;
            request.resume();
            response.end("unexpected redirect destination");
        });
        const endpoint = await startFixture(t, (request, response) => {
            request.resume();
            if (request.url === "/ok") {
                response.end("direct response");
                return;
            }
            response.writeHead(Number(request.url.slice(1)), { Location: destination });
            response.end();
        });
        const plugin = new Plugin();
        assert.equal(await plugin.fetchApiResponseText(`${endpoint}/ok`, { headers: {}, body: {} }, 2000), "direct response");

        for (const status of [301, 302, 303, 307, 308]) {
            await t.test(`reject HTTP ${status} without contacting its destination`, async () => {
                targetRequests = 0;
                await assert.rejects(plugin.fetchApiResponseText(`${endpoint}/${status}`, {
                    headers: { "Ocp-Apim-Subscription-Key": "synthetic-api-key" },
                    body: { text: "synthetic-private-message" }
                }, 2000));
                assert.equal(targetRequests, 0, "redirect target must not receive text or credentials");
                assert.equal(plugin.activeApiControllers.size, 0, "failed requests must release their controller");
            });
        }
    });
}
