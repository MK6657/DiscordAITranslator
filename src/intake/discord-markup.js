"use strict";

// Discord's MessageStore keeps message text as markup ("hey <@123> check **this** [docs](https://...)").
// The chat shows its display text instead ("hey @Alice check this docs"). Store text may only be sent
// to a translator after this conversion, and only as the request text: what the line is keyed and
// checked against is always the text on screen.
//
// convertDiscordMarkupToDisplayText returns the display text, or "" when the markup cannot be shown
// faithfully (a mention whose name is unknown, a timestamp, a hidden spoiler, markup this does not
// know). Callers then keep the text on screen.

const PLACEHOLDER_START = "\uE000";
const PLACEHOLDER_END = "\uE001";
const PLACEHOLDER_PATTERN = /\uE000(\d+)\uE001/g;

const CODE_BLOCK_PATTERN = /```(?:[A-Za-z0-9_+.#-]{1,32}\n)?([\s\S]*?)```/g;
const INLINE_CODE_PATTERN = /``([\s\S]+?)``|`([^`]+?)`/g;
const ESCAPED_CHARACTER_PATTERN = /\\([^A-Za-z0-9\s])/g;
const BARE_URL_PATTERN = /(?:https?|steam|discord):\/\/[^\s<>]*[^\s<>.,:;"')\]]/g;

const SPOILER_PATTERN = /\|\|[\s\S]+?\|\|/;
const TIMESTAMP_PATTERN = /<t:-?\d+(?::[A-Za-z])?>/;
const GUILD_NAVIGATION_PATTERN = /<id:[A-Za-z_]+>/;
const CUSTOM_EMOJI_PATTERN = /<a?:([A-Za-z0-9_~]{1,64}):\d{15,25}>/g;
const SLASH_COMMAND_PATTERN = /<\/([^:<>\n]{1,100}):\d{15,25}>/g;
const USER_MENTION_PATTERN = /<@!?(\d{15,25})>/g;
const ROLE_MENTION_PATTERN = /<@&(\d{15,25})>/g;
const CHANNEL_MENTION_PATTERN = /<#(\d{15,25})>/g;
const AUTOLINK_PATTERN = /<((?:https?|steam|discord):\/\/[^\s<>]+)>/g;
const MASKED_LINK_PATTERN = /\[([^[\]\n]+?)\]\(\s*<?(?:https?:\/\/[^\s()<>]+)>?\s*\)/g;
// Anything still shaped like Discord markup (a snowflake inside angle brackets) is not understood.
const UNKNOWN_MARKUP_PATTERN = /<[^<>\s]*\d{15,25}[^<>\s]*>/;

function convertDiscordMarkupToDisplayText(text, resolvers = {}) {
    let value = String(text ?? "");
    if (!value) return "";
    if (value.includes(PLACEHOLDER_START) || value.includes(PLACEHOLDER_END)) return "";

    const protectedParts = [];
    const protect = part => {
        protectedParts.push(part);
        return `${PLACEHOLDER_START}${protectedParts.length - 1}${PLACEHOLDER_END}`;
    };

    // Code keeps its content verbatim; the fences and the language line are not shown.
    value = value.replace(CODE_BLOCK_PATTERN, (match, code) => `\n${protect(code)}\n`);
    value = value.replace(INLINE_CODE_PATTERN, (match, doubled, single) => protect(doubled ?? single ?? ""));
    value = value.replace(ESCAPED_CHARACTER_PATTERN, (match, character) => protect(character));

    // A hidden spoiler is not on screen, so its text must not reach a translation line.
    if (SPOILER_PATTERN.test(value)) return "";
    // Timestamps and server-guide links are drawn as localised text that cannot be rebuilt here.
    if (TIMESTAMP_PATTERN.test(value) || GUILD_NAVIGATION_PATTERN.test(value)) return "";

    let unresolved = false;
    const resolveName = (kind, id) => {
        let name = "";
        try { name = String(resolvers?.[kind]?.(id) || "").trim(); }
        catch { name = ""; }
        if (!name) unresolved = true;
        return name;
    };

    value = value.replace(CUSTOM_EMOJI_PATTERN, (match, name) => `:${name}:`);
    value = value.replace(SLASH_COMMAND_PATTERN, (match, name) => `/${name.trim()}`);
    value = value.replace(ROLE_MENTION_PATTERN, (match, id) => `@${resolveName("role", id)}`);
    value = value.replace(USER_MENTION_PATTERN, (match, id) => `@${resolveName("user", id)}`);
    value = value.replace(CHANNEL_MENTION_PATTERN, (match, id) => `#${resolveName("channel", id)}`);
    if (unresolved || UNKNOWN_MARKUP_PATTERN.test(value)) return "";

    value = value.replace(MASKED_LINK_PATTERN, (match, label) => label);
    value = value.replace(AUTOLINK_PATTERN, (match, url) => protect(url));
    value = value.replace(BARE_URL_PATTERN, url => protect(url));

    // Line markers: block quotes, headings, subtext and list bullets are drawn, not written.
    value = value.replace(/^>>> ?/m, "");
    value = value.replace(/^> /gm, "");
    value = value.replace(/^#{1,3} +/gm, "");
    value = value.replace(/^-# +/gm, "");
    value = value.replace(/^( *)[-*] +/gm, "$1");
    value = value.replace(/^( *)\d{1,9}[.)] +/gm, "$1");

    for (let pass = 0; pass < 2; pass++) {
        value = value.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1");
        value = value.replace(/__(?=\S)([\s\S]*?\S)__/g, "$1");
        value = value.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1");
        value = value.replace(/\*(?=\S)([^*]*?\S)\*/g, "$1");
        value = value.replace(/(^|[^A-Za-z0-9_])_(?=\S)([^_]*?\S)_(?![A-Za-z0-9_])/g, "$1$2");
    }

    return value.replace(PLACEHOLDER_PATTERN, (match, index) => protectedParts[Number(index)] ?? "");
}

// Converted store texts kept per plugin instance (a channel's loaded messages, with room to spare).
const DISCORD_MARKUP_DISPLAY_TEXT_MEMO_MAX = 600;

module.exports = { convertDiscordMarkupToDisplayText, DISCORD_MARKUP_DISPLAY_TEXT_MEMO_MAX };
