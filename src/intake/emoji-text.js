"use strict";

// Standard (unicode) emoji in message text: read from the alt text of the images Discord draws, or
// raw in MessageStore content. They are part of the source text and are sent with it, but they say
// nothing about its language or whether it needs translating.
//
// One match is one emoji: a keycap, a flag, or a pictograph with its variation selector, skin tone,
// tag sequence and ZWJ-joined parts. Selectors and skin tones left on their own match too.
const EMOJI_PICTOGRAPH_SOURCE = "\\p{Extended_Pictographic}[\\u{FE0E}\\u{FE0F}]?\\p{Emoji_Modifier}?[\\u{E0020}-\\u{E007F}]*";
const STANDARD_EMOJI_SOURCE = [
    "[0-9#*]\\u{FE0F}?\\u{20E3}",
    "\\p{Regional_Indicator}{1,2}",
    `${EMOJI_PICTOGRAPH_SOURCE}(?:\\u{200D}${EMOJI_PICTOGRAPH_SOURCE})*`,
    "[\\u{FE0E}\\u{FE0F}\\u{20E3}\\p{Emoji_Modifier}]"
].join("|");
const STANDARD_EMOJI_PATTERN = new RegExp(STANDARD_EMOJI_SOURCE, "gu");

// The text with its standard emoji taken out (each becomes a space), for decisions about the words.
function removeStandardEmoji(text) {
    return String(text || "").replace(STANDARD_EMOJI_PATTERN, " ");
}

module.exports = { removeStandardEmoji };
