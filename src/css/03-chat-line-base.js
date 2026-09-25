"use strict";

module.exports = `.dait-translation-line {
    --dait-danger: #d83c3e;
    --dait-chat-mask: rgba(106, 111, 123, 0.72);
    --dait-chat-mask-border: rgba(255, 255, 255, 0.1);
    --dait-chat-revealed-bg: rgba(255, 255, 255, 0.08);
    --dait-chat-revealed-text: #f2f3f5;
}

.theme-light .dait-translation-line {
    --dait-chat-mask: rgba(123, 130, 145, 0.48);
    --dait-chat-mask-border: rgba(48, 56, 70, 0.12);
    --dait-chat-revealed-bg: rgba(30, 36, 50, 0.08);
    --dait-chat-revealed-text: #1f232b;
}

[data-dait-source-hidden="true"] {
    color: transparent !important;
    display: inline-block;
    font-size: 0 !important;
    line-height: 0 !important;
    min-height: 0 !important;
    position: relative;
    text-shadow: none !important;
    user-select: none;
    vertical-align: baseline;
}

[data-dait-source-hidden="true"]::before {
    background: var(--dait-chat-mask, rgba(106, 111, 123, 0.72));
    border: 1px solid var(--dait-chat-mask-border, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    content: "";
    display: block;
    height: calc(max(1, var(--dait-source-mask-lines, 1)) * 1.15rem);
    max-width: min(100%, 42ch);
    width: min(var(--dait-source-mask-width, 18ch), 100%);
}

[data-dait-source-hidden="true"] > :not(.dait-message-button):not(.dait-translation-line) {
    display: none !important;
}

[data-dait-source-hidden="true"] > .dait-message-button {
    font-size: 12px;
    line-height: 1;
}

`;
