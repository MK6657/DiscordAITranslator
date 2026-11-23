// @ts-check
"use strict";

/**
 * Installs prototype forwarding methods from a target class prototype to a named controller
 * property on instances. Used as an explicit compatibility bridge during incremental V0.5
 * modularization so legacy call sites and white-box tests keep passing until M7 retirement.
 *
 * @param {object} targetProto
 * @param {string} controllerProp
 * @param {string[]} methodNames
 * @returns {string[]} List of installed bridge method names
 */
function installPrototypeBridge(targetProto, controllerProp, methodNames) {
    /** @type {string[]} */
    const installed = [];
    for (const name of methodNames) {
        if (!name || name === "constructor") continue;
        if (Object.prototype.hasOwnProperty.call(targetProto, name)) continue;
        targetProto[name] = function bridgedMethod(...args) {
            return this[controllerProp][name](...args);
        };
        installed.push(name);
    }
    return installed;
}

/**
 * Copies non-constructor method descriptors from modular method maps onto a controller class prototype.
 *
 * @param {Function} ControllerClass
 * @param {Array<Record<string, Function>>} methodMaps
 * @returns {string[]} All registered method names
 */
function attachControllerMethods(ControllerClass, methodMaps) {
    /** @type {string[]} */
    const names = [];
    const proto = ControllerClass.prototype;
    for (const map of methodMaps) {
        if (!map || typeof map !== "object") continue;
        for (const name of Object.keys(map)) {
            if (name === "constructor") continue;
            const fn = map[name];
            if (typeof fn !== "function") continue;
            proto[name] = fn;
            names.push(name);
        }
    }
    return names;
}

/**
 * Defines getter/setter property proxies on a prototype forwarding legacy flat field names
 * to an encapsulated state container (such as AutoTranslationStateMachine or CooldownStore).
 *
 * @param {object} targetProto
 * @param {string} storeProp
 * @param {Record<string, string>} fieldMap  Map of legacyPropName -> targetFieldName
 */
function installStateProxies(targetProto, storeProp, fieldMap) {
    for (const [legacyProp, targetField] of Object.entries(fieldMap)) {
        if (Object.prototype.hasOwnProperty.call(targetProto, legacyProp)) continue;
        Object.defineProperty(targetProto, legacyProp, {
            configurable: true,
            enumerable: false,
            get() { return this[storeProp][targetField]; },
            set(value) { this[storeProp][targetField] = value; }
        });
    }
}

/**
 * Installs prototype forwarding methods for all public methods on a class prototype
 * (excluding constructor, private underscore-prefixed methods, explicit exclusions,
 * and methods already defined on targetProto).
 *
 * @param {object} targetProto
 * @param {string} controllerProp
 * @param {Function} SourceClass
 * @param {Iterable<string>} [excludeNames]
 * @returns {string[]} List of installed bridge method names
 */
function installClassPrototypeBridge(targetProto, controllerProp, SourceClass, excludeNames = []) {
    const excluded = new Set(excludeNames);
    const proto = SourceClass?.prototype;
    if (!proto) return [];
    const methodNames = Object.getOwnPropertyNames(proto).filter(name => {
        if (name === "constructor" || name.startsWith("_") || excluded.has(name)) return false;
        const desc = Object.getOwnPropertyDescriptor(proto, name);
        return Boolean(desc && typeof desc.value === "function");
    });
    return installPrototypeBridge(targetProto, controllerProp, methodNames);
}

module.exports = {
    installPrototypeBridge,
    installClassPrototypeBridge,
    attachControllerMethods,
    installStateProxies
};
