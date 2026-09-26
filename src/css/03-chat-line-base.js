"use strict";

// A message's original text while "hide original" masks it. Hovering the mask or focusing the message
// from the keyboard shows the original again; while masked it keeps the compact gray bar.
// Only keyboard focus (:focus-visible) outside the translation line counts: a mouse press focuses the
// message or a toolbar button, and revealing then would push a line placed after the original down
// under the pointer, so the click or the text selection would be lost.
const KEYBOARD_FOCUS = ":focus-visible:not(.dait-translation-line, .dait-translation-line *)";
const SOURCE_MASKED = `[data-dait-source-hidden="true"]:not(:hover):not(:has(${KEYBOARD_FOCUS}))`
    + `:not(:is([id^="chat-messages-"], [data-list-item-id*="chat-messages"]):is(${KEYBOARD_FOCUS}, :has(${KEYBOARD_FOCUS})) *)`;

module.exports = `.dait-translation-line {
    --dait-line-text: var(--text-strong, var(--header-primary, #f2f3f5));
    --dait-line-muted: var(--text-muted, #b5bac1);
    --dait-line-danger: var(--text-danger, #fa777c);
    --dait-line-danger-accent: var(--status-danger, #f23f43);
    --dait-line-warning: var(--text-warning, #f0b232);
    --dait-line-warning-accent: var(--status-warning, #f0b232);
    --dait-line-tint: color-mix(in srgb, var(--dait-line-text) 8%, transparent);
    --dait-line-chip: color-mix(in srgb, var(--dait-line-text) 10%, transparent);
    --dait-line-hover: color-mix(in srgb, var(--dait-line-text) 12%, transparent);
    --dait-line-border: color-mix(in srgb, var(--dait-line-text) 18%, transparent);
    --dait-line-surface: var(--background-floating, var(--background-secondary, #2b2d31));
    --dait-line-button: var(--button-secondary-background, #4e5058);
    --dait-line-button-text: var(--white-500, #ffffff);
    --dait-line-focus: var(--focus-primary, #00a8fc);
    --dait-chat-mask: rgba(106, 111, 123, 0.72);
    --dait-chat-mask-border: rgba(255, 255, 255, 0.1);
}

.theme-light .dait-translation-line {
    --dait-line-text: var(--text-strong, var(--header-primary, #060607));
    --dait-line-muted: var(--text-muted, #5c5e66);
    --dait-line-danger: var(--text-danger, #c9252d);
    --dait-line-warning: var(--text-warning, #8a5a00);
    --dait-line-surface: var(--background-floating, #ffffff);
    --dait-line-button: var(--button-secondary-background, #6d6f78);
    --dait-chat-mask: rgba(123, 130, 145, 0.48);
    --dait-chat-mask-border: rgba(48, 56, 70, 0.12);
}

${SOURCE_MASKED} {
    color: transparent !important;
    display: inline-block;
    font-size: 0 !important;
    line-height: 0 !important;
    max-width: 100%;
    min-height: 0 !important;
    position: relative;
    text-shadow: none !important;
    user-select: none;
    vertical-align: baseline;
}

/* The bar is the masked element's only content, so its width must not depend on the element's
   (shrink-to-fit) width, and its ch units need a real font size: the masked text has font-size 0. */
${SOURCE_MASKED}::before {
    background: var(--dait-chat-mask, rgba(106, 111, 123, 0.72));
    border: 1px solid var(--dait-chat-mask-border, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    box-sizing: border-box;
    content: "";
    display: block;
    font-size: 1rem;
    height: calc(max(1, var(--dait-source-mask-lines, 1)) * 1.15rem);
    max-width: 100%;
    width: var(--dait-source-mask-width, 18ch);
}

${SOURCE_MASKED} > :not(.dait-message-button):not(.dait-translation-line) {
    display: none !important;
}

${SOURCE_MASKED} > .dait-message-button {
    font-size: 12px;
    line-height: 1;
}

`;
