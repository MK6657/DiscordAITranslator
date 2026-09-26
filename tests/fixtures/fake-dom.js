"use strict";

// A small DOM for node tests: enough elements, text nodes and CSS selectors for the text extraction,
// scan and translation-line code (the same helpers as tests/core/intake.test.js). Used by fixtures that
// run one chat through two plugin builds.

function splitSelectorList(selector) {
    const parts = [];
    let depth = 0;
    let quote = "";
    let current = "";
    for (const character of String(selector)) {
        if (quote) {
            current += character;
            if (character === quote) quote = "";
            continue;
        }
        if (character === "'" || character === "\"") quote = character;
        else if (character === "[" || character === "(") depth++;
        else if (character === "]" || character === ")") depth--;
        else if (character === "," && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = "";
            continue;
        }
        current += character;
    }
    if (current.trim()) parts.push(current.trim());
    return parts;
}

function parseComplexSelector(selector) {
    const parts = [];
    let depth = 0;
    let quote = "";
    let current = "";
    let combinator = " ";
    const flush = () => {
        if (current.trim()) {
            parts.push({ compound: current.trim(), combinator: parts.length ? combinator : null });
            combinator = " ";
        }
        current = "";
    };
    for (const character of selector) {
        if (quote) {
            current += character;
            if (character === quote) quote = "";
            continue;
        }
        if (character === "'" || character === "\"") quote = character;
        else if (character === "[" || character === "(") depth++;
        else if (character === "]" || character === ")") depth--;
        else if (depth === 0 && (character === " " || character === ">")) {
            flush();
            if (character === ">") combinator = ">";
            continue;
        }
        current += character;
    }
    flush();
    return parts;
}

function matchAttribute(operator, actual, expected) {
    if (operator === "=") return actual === expected;
    if (operator === "*=") return actual.includes(expected);
    if (operator === "^=") return actual.startsWith(expected);
    if (operator === "$=") return actual.endsWith(expected);
    if (operator === "~=") return actual.split(/\s+/).includes(expected);
    if (operator === "|=") return actual === expected || actual.startsWith(`${expected}-`);
    return false;
}

function matchCompound(element, compound, scope) {
    if (element?.nodeType !== 1) return false;
    let rest = compound;
    const tag = rest.match(/^(\*|[a-zA-Z][\w-]*)/);
    if (tag) {
        if (tag[1] !== "*" && element.tagName !== tag[1].toUpperCase()) return false;
        rest = rest.slice(tag[0].length);
    }
    while (rest) {
        let match = rest.match(/^#([\w-]+)/);
        if (match) {
            if (element.id !== match[1]) return false;
        }
        else if ((match = rest.match(/^\.([\w-]+)/))) {
            if (!element.classList.contains(match[1])) return false;
        }
        else if ((match = rest.match(/^\[\s*([\w-]+)\s*(?:([*^$~|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]/))) {
            const actual = element.getAttribute(match[1]);
            if (actual === null) return false;
            if (match[2] && !matchAttribute(match[2], actual, match[3] ?? match[4] ?? match[5] ?? "")) return false;
        }
        else if ((match = rest.match(/^:scope/))) {
            if (element !== scope) return false;
        }
        else {
            return false;
        }
        rest = rest.slice(match[0].length);
    }
    return true;
}

function matchComplex(element, parts, index, scope) {
    if (!matchCompound(element, parts[index].compound, scope)) return false;
    if (index === 0) return true;
    if (parts[index].combinator === ">") {
        return Boolean(element.parentElement) && matchComplex(element.parentElement, parts, index - 1, scope);
    }
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        if (matchComplex(ancestor, parts, index - 1, scope)) return true;
    }
    return false;
}

function toDatasetKey(name) {
    return name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
}

class FakeText {
    constructor(text) {
        this.nodeType = 3;
        this.nodeValue = String(text);
        this.parentNode = null;
    }
    get parentElement() { return this.parentNode; }
    get isConnected() { return Boolean(this.parentNode?.isConnected); }
    get textContent() { return this.nodeValue; }
    set textContent(value) { this.nodeValue = String(value); }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
        this.parentNode = null;
    }
}

class FakeElement {
    constructor(tagName, attributes = {}, children = []) {
        this.nodeType = 1;
        this.tagName = String(tagName).toUpperCase();
        this.nodeName = this.tagName;
        this.attributeMap = new Map();
        this.dataset = {};
        this.childNodes = [];
        this.parentNode = null;
        this.style = {};
        this.connectedRoot = false;
        this.listeners = {};
        Object.entries(attributes).forEach(([name, value]) => this.setAttribute(name, value));
        children.forEach(child => this.appendChild(typeof child === "string" ? new FakeText(child) : child));
    }
    get parentElement() { return this.parentNode; }
    get isConnected() { return this.connectedRoot || Boolean(this.parentNode?.isConnected); }
    get id() { return this.getAttribute("id") || ""; }
    get className() { return this.getAttribute("class") || ""; }
    set className(value) { this.setAttribute("class", value); }
    get classList() {
        const read = () => this.className.split(/\s+/).filter(Boolean);
        const write = names => this.setAttribute("class", [...new Set(names)].join(" "));
        return {
            contains: name => read().includes(name),
            add: (...names) => write([...read(), ...names]),
            remove: (...names) => write(read().filter(name => !names.includes(name))),
            toggle: (name, force) => {
                const has = read().includes(name);
                const wanted = force === undefined ? !has : Boolean(force);
                if (wanted !== has) write(wanted ? [...read(), name] : read().filter(item => item !== name));
                return wanted;
            },
            [Symbol.iterator]: function* iterate() { yield* read(); }
        };
    }
    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get previousElementSibling() {
        const siblings = this.parentNode?.children || [];
        return siblings[siblings.indexOf(this) - 1] || null;
    }
    get nextElementSibling() {
        const siblings = this.parentNode?.children || [];
        const index = siblings.indexOf(this);
        return index >= 0 ? siblings[index + 1] || null : null;
    }
    get textContent() { return this.childNodes.map(node => node.textContent).join(""); }
    set textContent(value) {
        this.childNodes.splice(0).forEach(node => { node.parentNode = null; });
        if (value !== "" && value != null) this.appendChild(new FakeText(value));
    }
    getAttribute(name) {
        if (name.startsWith("data-")) {
            const key = toDatasetKey(name.slice(5));
            return Object.prototype.hasOwnProperty.call(this.dataset, key) ? String(this.dataset[key]) : null;
        }
        return this.attributeMap.has(name) ? this.attributeMap.get(name) : null;
    }
    setAttribute(name, value) {
        if (name.startsWith("data-")) this.dataset[toDatasetKey(name.slice(5))] = String(value);
        else this.attributeMap.set(name, String(value));
    }
    removeAttribute(name) {
        if (name.startsWith("data-")) delete this.dataset[toDatasetKey(name.slice(5))];
        else this.attributeMap.delete(name);
    }
    hasAttribute(name) { return this.getAttribute(name) !== null; }
    appendChild(child) {
        child.remove?.();
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }
    remove() {
        if (!this.parentNode) return;
        this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
        this.parentNode = null;
    }
    contains(node) {
        for (let current = node; current; current = current.parentNode) {
            if (current === this) return true;
        }
        return false;
    }
    matches(selector) {
        return splitSelectorList(selector).some(item => {
            const parts = parseComplexSelector(item);
            return parts.length > 0 && matchComplex(this, parts, parts.length - 1, null);
        });
    }
    closest(selector) {
        for (let current = this; current; current = current.parentElement) {
            if (current.matches(selector)) return current;
        }
        return null;
    }
    querySelectorAll(selector) {
        const selectors = splitSelectorList(selector).map(parseComplexSelector).filter(parts => parts.length);
        const found = [];
        const walk = node => {
            for (const child of node.children) {
                if (selectors.some(parts => matchComplex(child, parts, parts.length - 1, this))) found.push(child);
                walk(child);
            }
        };
        walk(this);
        return found;
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    removeEventListener() {}
}

function createFakeDocument() {
    const body = new FakeElement("body");
    body.connectedRoot = true;
    return {
        body,
        documentElement: body,
        scrollingElement: null,
        activeElement: null,
        createElement: tagName => new FakeElement(tagName),
        createTextNode: text => new FakeText(text),
        querySelectorAll: selector => body.querySelectorAll(selector),
        querySelector: selector => body.querySelector(selector),
        getElementById: id => body.querySelector(`#${id}`),
        addEventListener() {},
        removeEventListener() {}
    };
}

const el = (tagName, attributes = {}, children = []) => new FakeElement(tagName, attributes, children);

module.exports = { FakeElement, FakeText, createFakeDocument, el };
