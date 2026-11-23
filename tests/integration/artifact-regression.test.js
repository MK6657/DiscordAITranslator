"use strict";

const test = require("node:test");
const harness = require("./helpers/artifact-harness");
const { SUITES } = require("../../scripts/verify-plugin");

test("Built artifact regression suites", async t => {
    const shared = {};
    for (const suite of SUITES) {
        await t.test(suite.title, async () => {
            await suite.run(harness, shared);
        });
    }
});
