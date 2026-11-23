"use strict";

const { attachControllerMethods } = require("../../core/delegate-methods");
const methodMaps = [
    require("./settings-shell"),
    require("./settings-search"),
    require("./settings-sizing"),
    require("./tab-overview"),
    require("./tab-services"),
    require("./tab-sections"),
    require("./prompt-manager"),
    require("./settings-controls"),
    require("./settings-modal"),
    require("./confirm-dialog")
];

class SettingsUiController {
    constructor(plugin) {
        this.plugin = plugin;
        this.events = plugin.events || null;
        this.scope = plugin.runtimeScope ? plugin.runtimeScope.createChild() : null;
    }
}

const SETTINGS_UI_METHOD_NAMES = attachControllerMethods(SettingsUiController, methodMaps);

module.exports = {
    SettingsUiController,
    SETTINGS_UI_METHOD_NAMES
};
