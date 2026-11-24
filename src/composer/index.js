"use strict";

const { attachControllerMethods } = require("../core/delegate-methods");
const methodMaps = [
    require("./composer-buttons"),
    require("./polish-preset-menu"),
    require("./polish-result-panel"),
    require("./public-bilingual"),
    require("./polish-workflow")
];

class ComposerUiController {
    constructor(plugin) {
        this.plugin = plugin;
        this.events = plugin.events || null;
        this._scope = plugin.runtimeScope ? plugin.runtimeScope.createChild() : null;
    }

    get scope() {
        const rootScope = this.plugin?.runtimeScope;
        if (!rootScope) return null;
        if (!this._scope || (this._scope.disposed && !rootScope.disposed)) {
            this._scope = rootScope.createChild();
        }
        return this._scope;
    }
}

const COMPOSER_UI_METHOD_NAMES = attachControllerMethods(ComposerUiController, methodMaps);

module.exports = {
    ComposerUiController,
    COMPOSER_UI_METHOD_NAMES
};
