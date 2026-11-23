"use strict";

const assert = require("node:assert/strict");
const Plugin = require("../../../DiscordAITranslator.plugin.js");

const DEFAULT_TEST_BDAPI = {
    Data: {
        load: () => null,
        save: () => true
    }
};
if (global.BdApi === undefined) global.BdApi = DEFAULT_TEST_BDAPI;

function expectThrowsMessage(fn, messagePart) {
    assert.throws(fn, error => String(error.message).includes(messagePart));
}

function getFakeElementClasses(element) {
    return new Set([
        ...String(element?.className || "").split(/\s+/).filter(Boolean),
        ...Array.from(element?.__classes || [])
    ]);
}

function fakeElementHasClass(element, className) {
    return !element?.removed && getFakeElementClasses(element).has(className);
}

function findFakeElementsByClass(root, className, results = []) {
    if (!root || root.removed) return results;
    for (const child of root.children || []) {
        if (fakeElementHasClass(child, className)) results.push(child);
        findFakeElementsByClass(child, className, results);
    }
    return results;
}

function createFakeElement(tag, created = []) {
    const classes = new Set();
    const styleProperties = {};
    const element = {
        __classes: classes,
        tagName: String(tag || "").toUpperCase(),
        children: [],
        dataset: {},
        attributes: {},
        listeners: {},
        parentElement: null,
        className: "",
        textContent: "",
        value: "",
        type: "",
        style: {
            setProperty(name, value) {
                styleProperties[name] = String(value);
                this[name] = String(value);
            },
            removeProperty(name) {
                delete styleProperties[name];
                delete this[name];
            },
            getPropertyValue(name) {
                return styleProperties[name] || "";
            }
        },
        isConnected: true,
        hidden: false,
        classList: {
            add: (...names) => names.forEach(name => classes.add(name)),
            remove: (...names) => names.forEach(name => classes.delete(name)),
            contains: name => classes.has(name),
            toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
        },
        appendChild(child) {
            if (child.parentElement?.children) {
                const previousIndex = child.parentElement.children.indexOf(child);
                if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
            }
            this.children.push(child);
            child.parentElement = this;
            child.removed = false;
            child.isConnected = true;
            return child;
        },
        insertBefore(child, reference) {
            if (child.parentElement?.children) {
                const previousIndex = child.parentElement.children.indexOf(child);
                if (previousIndex >= 0) child.parentElement.children.splice(previousIndex, 1);
            }
            const index = this.children.indexOf(reference);
            if (index >= 0) this.children.splice(index, 0, child);
            else this.children.push(child);
            child.parentElement = this;
            child.removed = false;
            child.isConnected = true;
            return child;
        },
        contains(node) {
            if (node === this) return true;
            return this.children.some(child => child === node || child.contains?.(node));
        },
        setAttribute(name, value) {
            this.attributes[name] = String(value);
        },
        getAttribute(name) {
            return this.attributes[name];
        },
        addEventListener(type, handler) {
            this.listeners[type] = handler;
        },
        querySelector(selector) {
            if (String(selector || "").startsWith(".")) return findFakeElementsByClass(this, String(selector).slice(1))[0] || null;
            const sectionMatch = String(selector || "").match(/^\[data-dait-settings-section=['"]?([^'"\]]+)['"]?\]$/);
            if (sectionMatch) {
                return (this.querySelectorAll("[data-dait-settings-section]") || [])
                    .find(element => element.dataset?.daitSettingsSection === sectionMatch[1]) || null;
            }
            return null;
        },
        querySelectorAll(selector) {
            if (String(selector || "").startsWith(".")) return findFakeElementsByClass(this, String(selector).slice(1));
            if (String(selector || "") === "[data-dait-settings-section]") {
                const results = [];
                const visit = node => {
                    for (const child of node.children || []) {
                        if (!child.removed && child.dataset?.daitSettingsSection !== undefined) results.push(child);
                        visit(child);
                    }
                };
                visit(this);
                return results;
            }
            const daitPathMatch = String(selector || "").match(/^\[data-dait-path(?:=['"]?([^'"\]]+)['"]?)?\]$/);
            if (daitPathMatch) {
                const results = [];
                const visit = node => {
                    for (const child of node.children || []) {
                        if (!child.removed && child.dataset?.daitPath !== undefined) {
                            if (!daitPathMatch[1] || child.dataset.daitPath === daitPathMatch[1]) results.push(child);
                        }
                        visit(child);
                    }
                };
                visit(this);
                return results;
            }
            return [];
        },
        closest() {
            return null;
        },
        replaceWith() {},
        remove() {
            this.removed = true;
            this.isConnected = false;
            if (this.parentElement?.children) {
                const index = this.parentElement.children.indexOf(this);
                if (index >= 0) this.parentElement.children.splice(index, 1);
            }
            this.parentElement = null;
            (this.children || []).forEach(child => {
                child.removed = true;
                child.isConnected = false;
                child.parentElement = null;
            });
        },
        focus() { this.focused = true; global.document && (global.document.activeElement = this); },
        blur() { this.blurred = true; },
        select() { this.selected = true; },
        scrollIntoView(options) { this.scrolledIntoView = options || true; }
    };
    created.push(element);
    return element;
}

module.exports = {
    assert,
    Plugin,
    DEFAULT_TEST_BDAPI,
    expectThrowsMessage,
    getFakeElementClasses,
    fakeElementHasClass,
    findFakeElementsByClass,
    createFakeElement
};
