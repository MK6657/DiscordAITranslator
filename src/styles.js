"use strict";

// Static plugin stylesheet, injected by injectStyles() in the main file. The rules live in
// src/css/ in cascade order; keep that order when adding or moving rules.
const PLUGIN_CSS = [
    require("./css/01-theme-tokens"),
    require("./css/02-quick-settings"),
    require("./css/03-chat-line-base"),
    require("./css/04-settings"),
    require("./css/05-composer"),
    require("./css/06-messages-and-lines")
].join("");

module.exports = { PLUGIN_CSS };
