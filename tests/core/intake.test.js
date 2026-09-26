"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const Plugin = require("../../src");
const { convertDiscordMarkupToDisplayText } = require("../../src/intake/discord-markup");

const GUILD = "111111111111111111";
const CHANNEL = "222222222222222222";
const MESSAGE = "333333333333333333";
const USER = "444444444444444444";
const EMOJI = "555555555555555555";
const ROLE = "666666666666666666";
const SETUP_CHANNEL = "777777777777777777";

function useGlobals(t, values) {
    const saved = {};
    for (const [key, value] of Object.entries(values)) {
        saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
        globalThis[key] = value;
    }
    t.after(() => {
        for (const [key, descriptor] of Object.entries(saved)) {
            if (descriptor) Object.defineProperty(globalThis, key, descriptor);
            else delete globalThis[key];
        }
    });
}

// --- A small DOM: enough elements, text nodes and CSS selectors for the extraction and line code. ---

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
const mention = name => el("span", { class: "mention wrapper_f61d60 interactive", role: "button", tabindex: "0" }, [`@${name}`]);
const roleMention = name => el("span", { class: "roleMention_f61d60 wrapper_f61d60", role: "button" }, [`@${name}`]);
const channelMention = name => el("span", { class: "channelMention wrapper_f61d60 interactive", role: "link" }, [el("span", { class: "name_abc" }, [name])]);
const customEmoji = name => el("img", { class: "emoji", alt: `:${name}:`, "aria-label": `:${name}:`, "data-type": "emoji", "data-name": `:${name}:`, "data-id": EMOJI, src: `https://cdn.example/emojis/${EMOJI}.webp` });
const unicodeEmoji = (character, name) => el("img", { class: "emoji", alt: character, "aria-label": character, "data-type": "emoji", "data-name": `:${name}:`, src: "/assets/emoji.svg" });
const link = (label, href, title = href) => el("a", { class: "anchor_edefb8 anchorUnderlineOnHover_edefb8", href, title, rel: "noreferrer noopener", target: "_blank", role: "button", tabindex: "0" }, [label]);
const strong = text => el("strong", {}, [text]);

function buildMessage(document, parts) {
    const content = el("div", { class: "markup_abc messageContent_abc", id: `message-content-${MESSAGE}` }, parts);
    const messageNode = el("li", { id: `chat-messages-${CHANNEL}-${MESSAGE}`, class: "messageListItem_abc" }, [
        el("div", { class: "message_abc", role: "article" }, [content])
    ]);
    document.body.appendChild(messageNode);
    return { messageNode, content };
}

const discordStores = {
    UserStore: { getUser: id => (id === USER ? { id: USER, username: "alice_w", globalName: "Alice" } : null) },
    GuildMemberStore: { getMember: () => null },
    ChannelStore: {
        getChannel: id => ({
            [CHANNEL]: { id: CHANNEL, name: "general", guild_id: GUILD },
            [SETUP_CHANNEL]: { id: SETUP_CHANNEL, name: "setup", guild_id: GUILD }
        })[id] || null
    },
    GuildRoleStore: { getRole: (guildId, id) => (guildId === GUILD && id === ROLE ? { id: ROLE, name: "Testers" } : null) }
};

function createIntakePlugin(t, { domParts, storeContent, autoTranslate = true, targetLanguage = "Chinese" }) {
    const document = createFakeDocument();
    useGlobals(t, {
        document,
        window: { location: { pathname: `/channels/${GUILD}/${CHANNEL}` }, addEventListener() {}, removeEventListener() {} }
    });
    const plugin = new Plugin();
    plugin.isStarted = true;
    Object.assign(plugin.settings.translation, { enabled: true, apiKey: "sk-fake-1", targetLanguage });
    Object.assign(plugin.settings.ui, { autoTranslateMessages: autoTranslate, autoTranslateIntakeMode: "auto" });
    const { messageNode, content } = buildMessage(document, domParts);
    plugin.getDiscordMessageStore = () => ({
        getMessages: channelId => (channelId === CHANNEL ? [{
            id: MESSAGE,
            channel_id: CHANNEL,
            content: storeContent,
            author: { id: USER },
            timestamp: "2026-09-01T00:00:00.000Z"
        }] : [])
    });
    plugin.getDiscordNamedStore = name => discordStores[name] || null;

    // No layout offline: everything is visible and in range.
    plugin.isElementVisibleInViewport = () => true;
    plugin.isElementVisibleInViewportCached = () => true;
    plugin.isAutoTranslationTargetInScanRange = () => true;
    plugin.isAutoTranslationViewportStabilityPending = () => false;
    plugin.restoreTranslationSourceVisibility = () => {};
    plugin.syncTranslationSourceVisibility = () => {};
    plugin.drainAutoTranslationQueue = () => {};
    plugin.queueScan = () => {};
    plugin.scheduleAutoTranslationRetryScan = () => {};
    plugin.scheduleTranslationCachePersist = () => {};
    plugin.showToast = () => {};
    plugin.queueAutoTranslationRenderTask = task => {
        task.run();
        return true;
    };

    // Lines are drawn inside the content element, with the plugin's own metadata.
    const drawn = [];
    const drawLine = (kind, messageNodeArg, contentArg, cacheKey, sourceText, text = "") => {
        plugin.getTranslationLines(contentArg).forEach(line => line.remove());
        const line = el("div", { class: `dait-translation-line${kind === "loading" ? " dait-translation-loading" : ""}${kind === "error" ? " dait-translation-error" : ""}` });
        contentArg.appendChild(line);
        plugin.setTranslationLineMetadata(line, messageNodeArg, contentArg, cacheKey, sourceText);
        line.appendChild(el("span", { class: "dait-translation-text" }, text ? [text] : []));
        drawn.push({ kind, sourceText, cacheKey, text });
        return line;
    };
    plugin.renderTranslation = (node, target, translated, cacheKey, sourceText) => drawLine("final", node, target, cacheKey, sourceText, translated);
    plugin.renderTranslationLoading = (node, target, cacheKey, sourceText) => drawLine("loading", node, target, cacheKey, sourceText);
    plugin.renderTranslationError = (node, target, error, cacheKey, sourceText) => drawLine("error", node, target, cacheKey, sourceText, "failed");

    const scan = () => {
        const context = plugin.createScanContext({ messageNodes: [] });
        context.messageNodes = [messageNode];
        plugin.queueAutoTranslateVisibleMessages(context);
        return context;
    };
    return { plugin, document, messageNode, content, drawn, scan };
}

const RAW_MARKUP = /<[@#:a/]|<t:|\]\(|\*\*|\|\|/;

function currentLines(plugin, content) {
    return plugin.getTranslationLines(content).filter(line => line.isConnected);
}

// ---------------------------------------------------------------- store markup

test("store markup converts to the text Discord shows", () => {
    const resolvers = {
        user: id => (id === USER ? "Alice" : ""),
        role: id => (id === ROLE ? "Testers" : ""),
        channel: id => (id === SETUP_CHANNEL ? "setup" : "")
    };
    const convert = text => convertDiscordMarkupToDisplayText(text, resolvers);
    assert.equal(
        convert(`hey <@${USER}> and <@!${USER}>, <@&${ROLE}> see <#${SETUP_CHANNEL}> <:pepe:${EMOJI}> <a:party:${EMOJI}>`),
        "hey @Alice and @Alice, @Testers see #setup :pepe: :party:"
    );
    assert.equal(convert("the **build logs** on [the dashboard](https://example.com/dash) and [docs](<https://example.com/d>)"), "the build logs on the dashboard and docs");
    assert.equal(convert("*italic* _also_ __under__ ~~gone~~ ***both*** snake_case_name 2 * 3 * 4"), "italic also under gone both snake_case_name 2 * 3 * 4");
    assert.equal(convert("# Title\n## Sub\n-# small print\n> quoted\n- item one\n* item two\n1. first"), "Title\nSub\nsmall print\nquoted\nitem one\nitem two\nfirst");
    assert.equal(convert("run `npm **test**` then\n```js\nconst a = <@1>;\n```"), "run npm **test** then\n\nconst a = <@1>;\n\n");
    assert.equal(convert("an \\*escaped\\* star and <https://example.com/a_b_c> or https://example.com/*x*"), "an *escaped* star and https://example.com/a_b_c or https://example.com/*x*");
    assert.equal(convert(`use </deploy:${EMOJI}> now`), "use /deploy now");
    // Not shown faithfully: keep the text on screen instead.
    assert.equal(convert("the answer is ||hidden||"), "");
    assert.equal(convert("meet at <t:1767225600:R>"), "");
    assert.equal(convert("see <id:customize>"), "");
    assert.equal(convert(`ask <@${ROLE}9>`), "");
    assert.equal(convert(`ask <@555555555555555556>`), "");
});

test("store markup: an escaped backtick opens no code span, and no placeholder leaks into the text", () => {
    const convert = text => convertDiscordMarkupToDisplayText(text);
    const PLACEHOLDER = /[\uE000\uE001]/;
    // Discord reads left to right: "\`" is a literal backtick, so the later backtick has no partner.
    assert.equal(convert("a \\`code` b"), "a `code` b");
    assert.equal(convert("\\`x`"), "`x`");
    assert.equal(convert("\\`a\\` and `b`"), "`a` and b");
    // A backslash inside code is shown as written.
    assert.equal(convert("run `a\\*b` now"), "run a\\*b now");
    assert.equal(convert("```\nx = \\`y`\n```"), "\n\nx = \\`y`\n\n");
    for (const text of ["a \\`code` b", "\\``x``", "see https://example.com/`x` now", "`a` \\`b` `c`", "\\```js\nx\n```"]) {
        assert.doesNotMatch(convert(text), PLACEHOLDER, JSON.stringify(text));
    }
});

// ---------------------------------------------------------------- render-1: auto translation

test("auto: a message with a mention, custom emoji and masked link is requested once, drawn and cached", async t => {
    const { plugin, content, drawn, scan } = createIntakePlugin(t, {
        domParts: ["hey ", mention("Alice"), " can you check ", customEmoji("pepe"), " the ", strong("build logs"), " on ", link("the dashboard", "https://example.com/dash"), " from yesterday"],
        storeContent: `hey <@${USER}> can you check <:pepe:${EMOJI}> the **build logs** on [the dashboard](https://example.com/dash) from yesterday`
    });
    const domText = "hey @Alice can you check :pepe: the build logs on the dashboard from yesterday";
    assert.equal(plugin.getElementText(content), domText);
    const requests = [];
    plugin.runAutoTranslationTask = async text => {
        requests.push(text);
        return "嘿 @Alice 你能看一下 :pepe: 昨天仪表板上的构建日志吗";
    };

    scan();
    assert.equal(plugin.autoTranslationQueue.length, 1);
    const item = plugin.autoTranslationQueue.shift();
    assert.doesNotMatch(item.text, RAW_MARKUP, "the request never carries store markup");
    assert.equal(plugin.isAutoTranslationTargetReady(item), true);
    await plugin.autoTranslateQueuedMessage(item);

    assert.deepEqual(requests, [domText]);
    assert.deepEqual(drawn.map(entry => [entry.kind, entry.sourceText]), [["loading", domText], ["final", domText]]);
    assert.ok(plugin.translationCache.has(item.cacheKey), "the result is cached");

    plugin.reconcileTranslationLines(null);
    assert.equal(currentLines(plugin, content).length, 1, "the next scan keeps the line");

    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0, "a drawn message is not requested again");
    currentLines(plugin, content).forEach(line => line.remove());
    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0, "a remounted message is drawn from the cache");
    assert.equal(drawn.at(-1).kind, "final");
    assert.equal(drawn.at(-1).sourceText, domText);
    assert.equal(requests.length, 1);
});

test("auto: store-full text is only the request text; every line and guard uses the text on screen", async t => {
    const { plugin, content, drawn, scan, messageNode } = createIntakePlugin(t, {
        // The content element shows only the last line of the message.
        domParts: ["step 4: paste the model name into the box"],
        storeContent: [
            `free access for <@&${ROLE}> members`,
            `step 1: sign in with the invite from <@${USER}>`,
            `step 2: open <#${SETUP_CHANNEL}>`,
            "step 3: copy the key from [the docs](https://example.com/docs)",
            "step 4: paste the model name into the box"
        ].join("\n")
    });
    const domText = "step 4: paste the model name into the box";
    const requestText = [
        "free access for @Testers members",
        "step 1: sign in with the invite from @Alice",
        "step 2: open #setup",
        "step 3: copy the key from the docs",
        "step 4: paste the model name into the box"
    ].join("\n");
    const requests = [];
    plugin.runAutoTranslationTask = async text => {
        requests.push(text);
        return "为 @Testers 成员免费开放访问权限\n第一步：使用 @Alice 发来的邀请链接登录\n第二步：打开 #setup 频道\n第三步：从文档里复制密钥\n第四步：把模型名称粘贴到输入框里";
    };

    scan();
    assert.equal(plugin.autoTranslationQueue.length, 1);
    const item = plugin.autoTranslationQueue.shift();
    assert.equal(item.sourceTextKind, "store-full");
    assert.equal(item.text, requestText);
    assert.equal(item.domText, domText);
    assert.equal(plugin.isAutoTranslationTargetReady(item), true);
    await plugin.autoTranslateQueuedMessage(item);

    assert.deepEqual(requests, [requestText]);
    assert.deepEqual(drawn.map(entry => [entry.kind, entry.sourceText]), [["loading", domText], ["final", domText]]);
    assert.ok(plugin.translationCache.has(item.cacheKey));

    plugin.reconcileTranslationLines(null);
    assert.equal(currentLines(plugin, content).length, 1, "reconcile keeps the store-full line");
    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0);

    // Remounted: the scan draws it from the cache.
    currentLines(plugin, content).forEach(line => line.remove());
    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0);
    assert.deepEqual([drawn.at(-1).kind, drawn.at(-1).sourceText], ["final", domText]);

    // The idle cache-draw pass draws it too.
    currentLines(plugin, content).forEach(line => line.remove());
    plugin.getCachedDrawMessageNodes = () => ({ nodes: [messageNode], band: null });
    plugin.cachedDrawMessageMemo = new WeakMap();
    const stats = plugin.runCachedTranslationDrawPass();
    assert.equal(stats.queued, 1);
    assert.deepEqual([drawn.at(-1).kind, drawn.at(-1).sourceText], ["final", domText]);
    plugin.reconcileTranslationLines(null);
    assert.equal(currentLines(plugin, content).length, 1);
    assert.equal(requests.length, 1, "the store-full message was requested exactly once");
});

test("auto: a result whose message changed meanwhile is still cached, so it is not requested again", t => {
    const { plugin, content, messageNode } = createIntakePlugin(t, { domParts: ["hola a todos, nos vemos mañana en la reunión"], storeContent: "" });
    const requestOptions = plugin.getAutoTranslationOptions();
    const text = "hola a todos, nos vemos pronto en la reunión";
    const item = {
        messageNode,
        content,
        text,
        textOptions: null,
        targetKind: "message",
        requestOptions: { ...requestOptions, messageIdentity: plugin.getMessageIdentity(messageNode, content, text) }
    };
    item.cacheKey = plugin.getTranslationCacheKey(text, item.requestOptions);
    plugin.addAutoTranslationPendingTarget(item.cacheKey, item);
    plugin.renderAutoTranslationResult(item, "大家好，会上见");
    assert.ok(plugin.translationCache.has(item.cacheKey));
});

// ---------------------------------------------------------------- render-3: manual translation

test("manual: store text never replaces the text on screen; the line survives scans and auto does not re-request", async t => {
    const { plugin, messageNode, content, drawn, scan } = createIntakePlugin(t, {
        domParts: ["hey ", mention("Alice"), " can you check ", customEmoji("pepe"), " the ", strong("build logs"), " on ", link("the dashboard", "https://example.com/dash"), " from yesterday"],
        storeContent: `hey <@${USER}> can you check <:pepe:${EMOJI}> the **build logs** on [the dashboard](https://example.com/dash) from yesterday`
    });
    const domText = "hey @Alice can you check :pepe: the build logs on the dashboard from yesterday";
    const requests = [];
    plugin.runManualRescueModelAttempt = async plan => {
        requests.push(plan.text);
        return "嘿 @Alice 你能看一下 :pepe: 昨天仪表板上的构建日志吗";
    };
    plugin.runAutoTranslationTask = async text => {
        requests.push(`auto:${text}`);
        return "unexpected";
    };

    await plugin.translateMessage(messageNode, content, null);
    assert.deepEqual(requests, [domText]);
    assert.deepEqual(drawn.map(entry => [entry.kind, entry.sourceText]), [["loading", domText], ["final", domText]]);
    plugin.reconcileTranslationLines(null);
    assert.equal(currentLines(plugin, content).length, 1, "the manual line survives the next scan");

    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0, "auto translation does not request the same message again");
    currentLines(plugin, content).forEach(line => line.remove());
    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0, "auto translation draws the manual result from the cache");
    assert.deepEqual([drawn.at(-1).kind, drawn.at(-1).sourceText], ["final", domText]);
    assert.equal(requests.length, 1);
});

test("manual: a store-full request keeps loading, error and final lines on the text on screen", async t => {
    const { plugin, messageNode, content, drawn, scan } = createIntakePlugin(t, {
        domParts: ["step 4: paste the model name into the box"],
        storeContent: [
            `step 1: sign in with the invite from <@${USER}>`,
            "step 2: copy the key from [the docs](https://example.com/docs)",
            "step 3: open the **settings** page",
            "step 4: paste the model name into the box"
        ].join("\n")
    });
    const domText = "step 4: paste the model name into the box";
    const requestText = "step 1: sign in with the invite from @Alice\nstep 2: copy the key from the docs\nstep 3: open the settings page\nstep 4: paste the model name into the box";
    const requests = [];
    let fail = true;
    plugin.runManualRescueModelAttempt = async plan => {
        requests.push(plan.text);
        if (fail) throw Object.assign(new Error("API_ERROR"), { status: 500 });
        return "第 1 步：用 @Alice 的邀请登录\n第 2 步：从文档复制密钥\n第 3 步：打开设置页面\n第 4 步：把模型名称粘贴到框里";
    };
    plugin.runAutoTranslationTask = async text => {
        requests.push(`auto:${text}`);
        return "unexpected";
    };

    await plugin.translateMessage(messageNode, content, null);
    assert.deepEqual(requests, [requestText]);
    assert.deepEqual(drawn.map(entry => [entry.kind, entry.sourceText]), [["loading", domText], ["error", domText]]);
    const errorLine = currentLines(plugin, content)[0];
    assert.equal(plugin.isTranslationLineSourceMatch(errorLine, plugin.getElementText(content)), true, "Retry finds its message");

    fail = false;
    plugin.autoTranslationProviderFailures.clear();
    await plugin.translateMessage(messageNode, content, null);
    assert.deepEqual(requests, [requestText, requestText]);
    assert.deepEqual([drawn.at(-1).kind, drawn.at(-1).sourceText], ["final", domText]);
    plugin.reconcileTranslationLines(null);
    assert.equal(currentLines(plugin, content).length, 1);

    currentLines(plugin, content).forEach(line => line.remove());
    scan();
    assert.equal(plugin.autoTranslationQueue.length, 0, "the auto store-full candidate finds the manual result");
    assert.deepEqual([drawn.at(-1).kind, drawn.at(-1).sourceText], ["final", domText]);
    assert.equal(requests.length, 2);
});

// ---------------------------------------------------------------- render-6: source text

test("source text keeps standard emoji and links or elements that mention translation words", t => {
    useGlobals(t, { document: createFakeDocument() });
    const plugin = new Plugin();
    const content = el("div", { class: "markup_abc messageContent_abc" }, [
        "I ", unicodeEmoji("❤️", "heart"), " you, see you at 5 ", unicodeEmoji("👍", "thumbsup"), " also ", customEmoji("translate"),
        " read ", link("the guide", "https://github.com/org/i18n-docs"),
        " and ", link("https://www.deepl.com/translator", "https://www.deepl.com/translator"),
        " or ", link("pricing", "https://example.com/intl/en/pricing", "Translate pricing"),
        " ", el("span", { class: "spoilerContent_abc", role: "button", "aria-label": "Spoiler", "aria-expanded": "true" }, [el("span", { class: "spoilerInnerContainer_abc" }, ["translate this later"])]),
        " ", mention("Translator Bot"),
        el("span", { class: "translator-translated" }, [" (translated)"]),
        el("div", { class: "dait-translation-line" }, ["我们自己的译文"]),
        el("button", { class: "button_abc", "aria-label": "Translate" }, ["Translate"])
    ]);
    assert.equal(
        plugin.getElementText(content),
        "I ❤️ you, see you at 5 👍 also :translate: read the guide and https://www.deepl.com/translator or pricing translate this later @Translator Bot"
    );
});

test("a message of standard emoji alone gets no Translate button and sends no request", async t => {
    const { plugin, messageNode, content } = createIntakePlugin(t, {
        domParts: [unicodeEmoji("👍", "thumbsup"), " ", unicodeEmoji("🎉", "tada")],
        storeContent: "👍 🎉"
    });
    assert.equal(plugin.getElementText(content), "👍 🎉");
    assert.equal(plugin.injectMessageButton(messageNode), false);
    const toasts = [];
    plugin.showToast = message => toasts.push(message);
    plugin.runManualRescueModelAttempt = async () => { throw new Error("must not request"); };
    await plugin.translateMessage(messageNode, content, null);
    assert.deepEqual(toasts, [plugin.t("noTranslatableText")]);
});

test("with an English target, a common short reply followed by emoji is still skipped", async t => {
    const plugin = new Plugin();
    for (const text of ["thanks 🙏", "ok 👍", "lol 😂", "nice 🔥", "❤️ thank you ❤️", "Thanks! ✌🏽", "same 👨‍💻"]) {
        assert.equal(plugin.isCommonTargetShortText(text, "English"), true, text);
        assert.equal(plugin.shouldAutoTranslateText(text, "English"), false, text);
        assert.ok(plugin.computeAutoTranslationPrecheckSkipReason(text, "English"), text);
    }
    assert.equal(plugin.computeAutoTranslationPrecheckSkipReason("ok 👍", "English"), "common-target-short");
    assert.equal(plugin.isCommonTargetShortText("ok 👍", "Chinese"), false, "only an English target has common short replies");
    assert.equal(plugin.isCommonTargetShortText("thanks 🙏 for the help", "English"), false);

    for (const parts of [["thanks ", unicodeEmoji("🙏", "pray")], ["ok ", unicodeEmoji("👍", "thumbsup")], ["lol ", unicodeEmoji("😂", "joy")], ["nice ", unicodeEmoji("🔥", "fire")]]) {
        const { plugin: scanPlugin, content, scan } = createIntakePlugin(t, { domParts: parts, storeContent: "", targetLanguage: "English" });
        const requests = [];
        scanPlugin.runAutoTranslationTask = async text => {
            requests.push(text);
            return text;
        };
        scan();
        assert.equal(scanPlugin.autoTranslationQueue.length, 0, scanPlugin.getElementText(content));
        assert.deepEqual(requests, []);
    }
});

test("the skip rules decide without standard emoji; a message that is sent keeps them", async t => {
    const plugin = new Plugin();
    const cases = [
        [":pepe: ❤️", "link-only"],
        ["❤️ :pepe: :party:", "link-only"],
        ["https://example.com/page ❤️", "link-only"],
        ["https://example.com/page 👨‍💻", "link-only"],
        ["https://example.com/page 1️⃣ 🇺🇸 ❤️‍🔥 ✌🏽", "link-only"],
        ["a 👍", "too-short"],
        ["v1.2.3 👍", "preserved-token"],
        ["lol lol lol 1️⃣", "low-information-repeat"]
    ];
    for (const [text, reason] of cases) {
        assert.equal(plugin.computeAutoTranslationPrecheckSkipReason(text, "Chinese"), reason, text);
    }
    assert.equal(plugin.computeAutoTranslationPrecheckSkipReason("👍 🎉", "Chinese"), "no-letters");
    assert.equal(plugin.computeAutoTranslationPrecheckSkipReason("hola a todos ❤️", "Chinese"), "");

    const url = "https://example.com/page";
    for (const parts of [
        [customEmoji("pepe"), " ", unicodeEmoji("❤️", "heart")],
        [link(url, url), " ", unicodeEmoji("❤️", "heart")],
        [link(url, url), " ", unicodeEmoji("👨‍💻", "technologist")]
    ]) {
        const { plugin: scanPlugin, content, scan } = createIntakePlugin(t, { domParts: parts, storeContent: "" });
        const requests = [];
        scanPlugin.runAutoTranslationTask = async text => {
            requests.push(text);
            return text;
        };
        scan();
        assert.equal(scanPlugin.autoTranslationQueue.length, 0, scanPlugin.getElementText(content));
        assert.deepEqual(requests, []);
    }

    const { plugin: sending, scan } = createIntakePlugin(t, {
        domParts: ["hola a todos ", unicodeEmoji("❤️", "heart"), " nos vemos mañana en la reunión"],
        storeContent: ""
    });
    scan();
    assert.equal(sending.autoTranslationQueue.length, 1);
    assert.equal(sending.autoTranslationQueue[0].text, "hola a todos ❤️ nos vemos mañana en la reunión", "the request text keeps the emoji");
});

test("only real translator widgets count as foreign translation elements", () => {
    const plugin = new Plugin();
    const foreign = [
        el("div", { class: "dait-translation-line" }),
        el("div", { class: "dait-translation-box" }),
        el("span", { class: "translator-translated" }),
        el("div", { class: "vc-translation-accessory" }),
        el("font", { "data-immersive-translate-translation-element-mark": "1" }),
        el("span", { "data-dait-ignore-translation": "true" }),
        el("div", { id: "google-translate-element" }),
        el("div", { class: "deepl-inline-result" }),
        el("button", { "aria-label": "Translate" }, ["Translate"]),
        el("button", {}, ["显示原文"])
    ];
    foreign.forEach(element => assert.equal(plugin.isForeignTranslationElement(element), true, element.className || element.id || element.textContent));
    const content = [
        link("docs", "https://github.com/org/i18n-docs"),
        link("DeepL", "https://www.deepl.com/translator"),
        link("pricing", "https://example.com/intl/en/pricing", "Translate pricing"),
        el("a", { class: "translation-link", href: "https://example.com/translation" }, ["translation"]),
        customEmoji("translate"),
        el("span", { class: "intl-number i18n-date" }, ["5"]),
        el("span", { "aria-label": "翻译", title: "Translation" }, ["hi"]),
        el("span", { "data-name": "translate", "data-tooltip-text": "Translate" }, ["x"]),
        el("span", { class: "spoilerContent_abc", role: "button" }, ["translate me"]),
        el("div", { class: "markup_abc messageContent_abc", "data-dait-owner": "dait-1", "data-dait-translation-style": "tint" }, ["hola"])
    ];
    content.forEach(element => assert.equal(plugin.isForeignTranslationElement(element), false, element.getAttribute("href") || element.className || element.textContent));
});

// ---------------------------------------------------------------- lifecycle

test("stop() forgets cached element text, expected style mutations and pending mutation roots", t => {
    const document = createFakeDocument();
    useGlobals(t, { document, window: { location: { pathname: `/channels/${GUILD}/${CHANNEL}` }, addEventListener() {}, removeEventListener() {} } });
    const plugin = new Plugin();
    Object.assign(plugin, {
        loadSettings: () => true,
        loadDiagnosticLogs() {},
        loadTranslationCache() {},
        injectStyles() {},
        patchMessageContextMenu() {},
        startObserver() {},
        queueScan() {},
        showToast() {}
    });
    plugin.start();
    const { content } = buildMessage(document, ["original message"]);
    assert.equal(plugin.getElementText(content), "original message");
    plugin.translationSourceStyleMutationCounts.set(content, 2);
    plugin.pendingMutationScanRoots.add(content);
    plugin.stop();
    assert.equal(plugin.pendingMutationScanRoots.size, 0);

    content.childNodes[0].nodeValue = "edited message";
    plugin.start();
    assert.equal(plugin.getElementText(content), "edited message", "a message edited while the plugin was off is read again");
    assert.equal(plugin.translationSourceStyleMutationCounts.get(content), undefined);
    plugin.stop();
});

test("focus inside Discord does not start a scan; the window regaining focus does", t => {
    const document = createFakeDocument();
    const window = { location: { pathname: `/channels/${GUILD}/${CHANNEL}` }, addEventListener() {}, removeEventListener() {} };
    useGlobals(t, { document, window });
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.isDiscordMediaViewerOpen = () => false;
    let scans = 0;
    plugin.queueScan = () => { scans++; };
    const composer = el("div", { role: "textbox", contenteditable: "true" });
    document.body.appendChild(composer);
    plugin.queueViewportScan({ type: "focus", target: composer });
    assert.equal(scans, 0);
    plugin.queueViewportScan({ type: "focus", target: window });
    assert.equal(scans, 1);
    plugin.queueViewportScan({ type: "visibilitychange", target: document });
    assert.equal(scans, 2);
});

test("the cache-draw pass forgets its scroller once no chat is mounted", t => {
    useGlobals(t, { document: createFakeDocument() });
    const plugin = new Plugin();
    plugin.cachedDrawScroller = el("div", { class: "scroller_abc" });
    assert.deepEqual(plugin.getCachedDrawMessageNodes(), { nodes: [], band: null });
    assert.equal(plugin.cachedDrawScroller, null);
});

// ---------------------------------------------------------------- channel translation switch

test("with channel translation off there are no Translate buttons or context-menu items", t => {
    const document = createFakeDocument();
    const patches = [];
    useGlobals(t, {
        document,
        window: { location: { pathname: `/channels/${GUILD}/${CHANNEL}` }, addEventListener() {}, removeEventListener() {}, requestIdleCallback: () => 1 },
        BdApi: {
            ContextMenu: {
                patch(matcher, callback) {
                    patches.push(callback);
                    return () => {};
                },
                buildMenuChildren: groups => groups
            }
        }
    });
    const plugin = new Plugin();
    plugin.isStarted = true;
    plugin.saveSettings = () => {};
    plugin.syncSettingControls = () => {};
    plugin.queueScan = () => {};
    const { messageNode } = buildMessage(document, ["hola a todos"]);
    const openMenu = () => {
        const tree = { props: { children: [] } };
        patches.forEach(callback => callback(tree, { target: messageNode }));
        return tree.props.children.length;
    };

    plugin.settings.translation.enabled = false;
    plugin.patchMessageContextMenu();
    assert.equal(openMenu(), 0, "the message menu has no Translate item");
    assert.equal(plugin.injectMessageButton(messageNode), false);
    assert.equal(document.querySelectorAll(".dait-message-button").length, 0);
    assert.equal(plugin.shouldUseIncrementalMessageScan({ messageNodes: [messageNode] }), false);

    plugin.setSetting("translation.enabled", true);
    assert.equal(openMenu(), 1, "the context-menu item comes back");
    assert.equal(plugin.injectMessageButton(messageNode), true, "the next scan adds the button again");
    assert.equal(document.querySelectorAll(".dait-message-button").length, 1);

    plugin.setSetting("translation.enabled", false);
    assert.equal(document.querySelectorAll(".dait-message-button").length, 0, "existing buttons are removed");
    assert.equal(openMenu(), 0);
    assert.equal(plugin.injectMessageButton(messageNode), false);

    // A reset turns channel translation back on without setSetting: the menu follows at once.
    plugin.settings = plugin.clone(plugin.settings);
    plugin.settings.translation.enabled = true;
    assert.equal(openMenu(), 1);
});
