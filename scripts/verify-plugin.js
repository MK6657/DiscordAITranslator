"use strict";

// End-to-end artifact regression runner for the generated DiscordAITranslator.plugin.js bundle.
// Runs all modular domain suites in tests/integration/suites/ sequentially against the built artifact.

const harness = require("../tests/integration/helpers/artifact-harness");
const SUITES = [
    require("../tests/integration/suites/01-lifecycle-composer-polish"),
    require("../tests/integration/suites/02-theme-settings-ui"),
    require("../tests/integration/suites/03-scroll-diagnostics-output-guard"),
    require("../tests/integration/suites/04-providers-cache-longtext"),
    require("../tests/integration/suites/05-backfill-queue-fallback"),
    require("../tests/integration/suites/06-templates-cooldowns-failures"),
    require("../tests/integration/suites/07-settling-cache-draw-dom"),
    require("../tests/integration/suites/08-async-providers-composer"),
    require("../tests/integration/suites/09-async-queue-templates")
];

async function runAllArtifactSuites() {
    const shared = {};
    for (const suite of SUITES) {
        await suite.run(harness, shared);
    }
}

if (require.main === module) {
    runAllArtifactSuites()
        .then(() => {
            console.log("Plugin verification passed.");
        })
        .catch(error => {
            console.error(error);
            process.exitCode = 1;
        });
}

module.exports = { SUITES, runAllArtifactSuites };
