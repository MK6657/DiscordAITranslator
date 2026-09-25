"use strict";

// package.json is the single source of the plugin version; esbuild bundles it into the artifact.
const { version: PLUGIN_VERSION } = require("../package.json");

module.exports = { PLUGIN_VERSION };
