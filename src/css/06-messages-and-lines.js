"use strict";

// Line-art icons drawn as CSS masks, so they take the text colour of their button or line.
const svgIcon = body => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>${body}</svg>`)}")`;
const ICON_COPY = svgIcon("<rect x='9' y='9' width='12' height='12' rx='2'/><path d='M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'/>");
const ICON_RETRANSLATE = svgIcon("<path d='M21 12a9 9 0 1 1-3-6.7L21 8'/><path d='M21 3v5h-5'/>");
const ICON_HIDE = svgIcon("<path d='M17.9 17.9A10 10 0 0 1 12 20c-7 0-10-8-10-8a18 18 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 10 8 10 8a18 18 0 0 1-2.2 3.2'/><path d='M1 1l22 22'/>");
const ICON_ALERT = svgIcon("<circle cx='12' cy='12' r='10'/><path d='M12 7v6'/><path d='M12 17h.01'/>");
const ICON_CLOCK = svgIcon("<circle cx='12' cy='12' r='10'/><path d='M12 6v6l4 2'/>");

module.exports = `.dait-message-button {
    display: inline-flex;
    align-items: center;
    background: color-mix(in srgb, var(--background-modifier-hover, #747f8d) 32%, transparent);
    border: 1px solid color-mix(in srgb, var(--interactive-muted, #747f8d) 34%, transparent);
    border-radius: 6px;
    box-shadow: none;
    color: color-mix(in srgb, var(--text-normal, #dbdee1) 82%, var(--text-muted, #949ba4));
    justify-content: center;
    margin-left: 8px;
    margin-top: 4px;
    opacity: 0.82;
    padding: 3px 7px;
    text-shadow: none;
    transition: opacity 120ms ease, background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
    vertical-align: middle;
}

.theme-light.dait-message-button,
.theme-light .dait-message-button,
.dait-message-button[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-message-button {
    background: rgba(79, 84, 92, 0.08);
    border-color: rgba(79, 84, 92, 0.2);
    color: #3f4652;
    opacity: 0.9;
}

.theme-dark.dait-message-button,
.theme-darker.dait-message-button,
.theme-midnight.dait-message-button,
.theme-dark .dait-message-button,
.theme-darker .dait-message-button,
.theme-midnight .dait-message-button,
.dait-message-button[data-dait-discord-theme="dark"],
.dait-message-button[data-dait-discord-theme="darker"],
.dait-message-button[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="dark"] .dait-message-button,
[data-dait-discord-theme="darker"] .dait-message-button,
[data-dait-discord-theme="midnight"] .dait-message-button {
    background: rgba(255, 255, 255, 0.075);
    border-color: rgba(255, 255, 255, 0.14);
    color: color-mix(in srgb, var(--text-normal, #f2f3f5) 86%, #ffffff);
}

.dait-message-button.dait-message-button-hover-only {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    opacity: 0;
    pointer-events: none;
}

[class*="messageContent"]:hover > .dait-message-button,
[class*="messageContent"]:focus-within > .dait-message-button,
[class*="messageContent"]:hover .dait-message-button,
[class*="messageContent"]:focus-within .dait-message-button,
[class*="markup"]:hover > .dait-message-button,
[class*="markup"]:focus-within > .dait-message-button,
[class*="markup"]:hover .dait-message-button,
[class*="markup"]:focus-within .dait-message-button,
[id^="chat-messages-"]:hover .dait-message-button,
[data-list-item-id*="chat-messages"]:hover .dait-message-button,
.dait-message-button:hover,
.dait-message-button:focus-visible {
    background: color-mix(in srgb, var(--brand-500, #5865f2) 14%, var(--background-modifier-hover, transparent));
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 48%, var(--interactive-muted, #747f8d));
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--brand-500, #5865f2) 18%, transparent);
    color: var(--text-normal);
    opacity: 1;
    pointer-events: auto;
}

.theme-light.dait-message-button:hover,
.theme-light.dait-message-button:focus-visible,
.theme-light [class*="messageContent"]:hover > .dait-message-button,
.theme-light [class*="messageContent"]:focus-within > .dait-message-button,
.theme-light [class*="messageContent"]:hover .dait-message-button,
.theme-light [class*="messageContent"]:focus-within .dait-message-button,
.theme-light [class*="markup"]:hover > .dait-message-button,
.theme-light [class*="markup"]:focus-within > .dait-message-button,
.theme-light [class*="markup"]:hover .dait-message-button,
.theme-light [class*="markup"]:focus-within .dait-message-button,
.theme-light [id^="chat-messages-"]:hover .dait-message-button,
.theme-light [data-list-item-id*="chat-messages"]:hover .dait-message-button,
.theme-light .dait-message-button:hover,
.theme-light .dait-message-button:focus-visible,
.dait-message-button[data-dait-discord-theme="light"]:hover,
.dait-message-button[data-dait-discord-theme="light"]:focus-visible,
[data-dait-discord-theme="light"] [class*="messageContent"]:hover > .dait-message-button,
[data-dait-discord-theme="light"] [class*="messageContent"]:focus-within > .dait-message-button,
[data-dait-discord-theme="light"] [class*="messageContent"]:hover .dait-message-button,
[data-dait-discord-theme="light"] [class*="messageContent"]:focus-within .dait-message-button,
[data-dait-discord-theme="light"] [class*="markup"]:hover > .dait-message-button,
[data-dait-discord-theme="light"] [class*="markup"]:focus-within > .dait-message-button,
[data-dait-discord-theme="light"] [class*="markup"]:hover .dait-message-button,
[data-dait-discord-theme="light"] [class*="markup"]:focus-within .dait-message-button,
[data-dait-discord-theme="light"] [id^="chat-messages-"]:hover .dait-message-button,
[data-dait-discord-theme="light"] [data-list-item-id*="chat-messages"]:hover .dait-message-button,
[data-dait-discord-theme="light"] .dait-message-button:hover,
[data-dait-discord-theme="light"] .dait-message-button:focus-visible {
    background: rgba(88, 101, 242, 0.1);
    border-color: rgba(88, 101, 242, 0.42);
    color: #242832;
}

.dait-translation-line {
    color: var(--dait-line-text);
    display: block;
    font-size: 1rem;
    line-height: 1.375rem;
    margin: 1px 0;
    max-width: 100%;
    min-height: 1.375rem;
    overflow-anchor: none;
    overflow-wrap: anywhere;
    position: relative;
    text-align: start;
    white-space: pre-wrap;
    width: fit-content;
}

.dait-translation-line.dait-translation-revealed {
    background: var(--dait-line-tint);
    border-radius: 4px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    color: var(--dait-line-text);
    font-weight: inherit;
    padding: 0 6px;
    user-select: text;
}

.dait-translation-line.dait-translation-revealed.dait-translation-style-muted,
.dait-translation-line.dait-translation-revealed.dait-translation-style-tag {
    background: transparent;
    padding: 0;
}

.dait-translation-line.dait-translation-revealed.dait-translation-style-muted {
    color: var(--dait-line-muted);
}

/* With a note under the text, the faint background marks only the translated text. */
.dait-translation-line.dait-translation-revealed.dait-translation-style-tint:has(> .dait-translation-note) {
    background: transparent;
    padding: 0;
}

.dait-translation-line.dait-translation-revealed.dait-translation-style-tint:has(> .dait-translation-note) > .dait-translation-text {
    background: var(--dait-line-tint);
    border-radius: 4px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    padding: 1px 6px;
}

.dait-translation-line.dait-translation-style-tag:not(.dait-translation-preview)::before {
    background: var(--dait-line-chip);
    border-radius: 3px;
    color: var(--dait-line-text);
    content: attr(data-dait-tag);
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    line-height: 16px;
    margin-inline-end: 6px;
    padding: 0 5px;
    user-select: none;
    vertical-align: 1px;
}

.dait-translation-line.dait-translation-scale-90:not(.dait-translation-preview) {
    font-size: 0.9rem;
    line-height: 1.25rem;
    min-height: 1.25rem;
}

.dait-translation-line.dait-translation-dismissed {
    display: none !important;
}

.dait-translation-line.dait-translation-preview {
    display: inline-block;
    flex: 0 1 auto;
    font-size: inherit;
    line-height: inherit;
    margin: 0 0 1px;
    max-inline-size: 100%;
    min-height: 1em;
    vertical-align: baseline;
    width: auto;
}

.dait-translation-line.dait-translation-preview.dait-translation-revealed {
    padding: 0 2px;
}

.dait-translation-actions {
    align-items: center;
    background: var(--dait-line-surface);
    border: 1px solid var(--dait-line-border);
    border-radius: 6px;
    box-shadow: var(--shadow-low, 0 2px 8px rgba(0, 0, 0, 0.24));
    box-sizing: border-box;
    display: inline-flex;
    gap: 2px;
    height: 28px;
    inset-inline-start: calc(100% + 6px);
    line-height: 0;
    opacity: 0;
    padding: 1px;
    pointer-events: none;
    position: absolute;
    top: -3px;
    user-select: none;
    white-space: nowrap;
    z-index: 2;
}

.dait-translation-actions::before {
    content: "";
    inset-block: 0;
    inset-inline-start: -8px;
    position: absolute;
    width: 8px;
}

.dait-translation-actions[data-dait-placement="inside"] {
    bottom: -3px;
    inset-inline-end: 0;
    inset-inline-start: auto;
    top: auto;
}

.dait-translation-actions[data-dait-placement="inside"]::before {
    content: none;
}

.dait-translation-line.dait-translation-revealed:hover > .dait-translation-actions,
.dait-translation-line.dait-translation-revealed:focus-within > .dait-translation-actions {
    opacity: 1;
    pointer-events: auto;
}

.dait-translation-line.dait-translation-masked > .dait-translation-actions,
.dait-translation-line.dait-translation-preview > .dait-translation-actions {
    display: none;
}

.dait-translation-action {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 4px;
    box-sizing: border-box;
    color: var(--dait-line-muted);
    cursor: pointer;
    display: inline-flex;
    height: 24px;
    justify-content: center;
    margin: 0;
    padding: 0;
    width: 28px;
}

.dait-translation-action::before {
    background-color: currentColor;
    content: "";
    height: 16px;
    -webkit-mask: var(--dait-icon) center / 16px 16px no-repeat;
    mask: var(--dait-icon) center / 16px 16px no-repeat;
    width: 16px;
}

.dait-translation-action-copy {
    --dait-icon: ${ICON_COPY};
}

.dait-translation-action-retranslate {
    --dait-icon: ${ICON_RETRANSLATE};
}

.dait-translation-action-hide {
    --dait-icon: ${ICON_HIDE};
}

.dait-translation-action:hover {
    background: var(--dait-line-hover);
    color: var(--dait-line-text);
}

.dait-translation-line.dait-translation-error {
    align-items: center;
    background: color-mix(in srgb, var(--dait-line-danger-accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--dait-line-danger-accent) 45%, transparent);
    border-radius: 6px;
    color: var(--dait-line-danger);
    column-gap: 8px;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.875rem;
    line-height: 1.25rem;
    min-height: 1.75rem;
    padding: 1px 4px 1px 8px;
    row-gap: 2px;
    user-select: text;
    white-space: normal;
}

.dait-translation-line.dait-translation-error[data-dait-error-action="wait"] {
    background: color-mix(in srgb, var(--dait-line-warning-accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--dait-line-warning-accent) 45%, transparent);
    color: var(--dait-line-warning);
}

.dait-translation-error-message,
.dait-translation-note-message {
    align-items: center;
    display: inline-flex;
    gap: 6px;
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-translation-error-message::before,
.dait-translation-note-message::before {
    background-color: currentColor;
    content: "";
    flex: 0 0 16px;
    height: 16px;
    -webkit-mask: var(--dait-icon, ${ICON_ALERT}) center / 16px 16px no-repeat;
    mask: var(--dait-icon, ${ICON_ALERT}) center / 16px 16px no-repeat;
    width: 16px;
}

.dait-translation-line.dait-translation-error[data-dait-error-action="wait"] > .dait-translation-error-message {
    --dait-icon: ${ICON_CLOCK};
}

.dait-translation-error-button,
.dait-translation-retry,
.dait-translation-note-button {
    align-items: center;
    border-radius: 4px;
    box-sizing: border-box;
    cursor: pointer;
    display: inline-flex;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 500;
    height: 24px;
    line-height: 1;
    margin: 0;
    padding: 0 10px;
    white-space: nowrap;
}

.dait-translation-error-button,
.dait-translation-note-button {
    background: var(--dait-line-button);
    border: 0;
    color: var(--dait-line-button-text);
}

.dait-translation-error-button:hover,
.dait-translation-note-button:hover {
    filter: brightness(1.15);
}

.dait-translation-error-button:disabled {
    cursor: default;
    opacity: 0.72;
}

.dait-translation-retry {
    background: transparent;
    border: 1px solid var(--dait-line-border);
    color: var(--dait-line-text);
}

.dait-translation-retry:hover {
    background: var(--dait-line-hover);
}

.dait-translation-action:focus-visible,
.dait-translation-error-button:focus-visible,
.dait-translation-retry:focus-visible,
.dait-translation-note-button:focus-visible,
.dait-translation-line.dait-translation-masked:focus-visible {
    outline: 2px solid var(--dait-line-focus);
    outline-offset: 1px;
}

.dait-translation-note {
    align-items: center;
    background: color-mix(in srgb, var(--dait-line-warning-accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--dait-line-warning-accent) 45%, transparent);
    border-radius: 6px;
    box-sizing: border-box;
    color: var(--dait-line-warning);
    column-gap: 8px;
    display: flex;
    flex-wrap: wrap;
    font-size: 0.875rem;
    font-weight: 400;
    line-height: 1.25rem;
    margin: 4px 0 2px;
    max-width: 100%;
    min-height: 1.75rem;
    padding: 1px 4px 1px 8px;
    row-gap: 2px;
    user-select: text;
    white-space: normal;
    width: fit-content;
}

.dait-translation-line.dait-translation-masked {
    cursor: pointer;
    display: inline-block;
    text-shadow: none;
    user-select: none;
    width: fit-content;
}

.dait-translation-line.dait-translation-preview.dait-translation-masked {
    min-width: 0;
}

.dait-translation-text {
    display: inline;
    position: relative;
}

/* A right-to-left translation in a left-to-right chat: as a box of its own, its wrapped lines align right to left. */
.dait-translation-text[dir="rtl"] {
    display: inline-block;
    max-inline-size: 100%;
}

.dait-translation-emoji {
    display: inline-block;
    height: 1.375em;
    margin: 0 0.04em;
    max-width: 1.375em;
    object-fit: contain;
    vertical-align: -0.3em;
    width: 1.375em;
}

.dait-translation-line.dait-translation-masked .dait-translation-text {
    color: rgba(0, 0, 0, 0);
    display: inline-block;
    max-inline-size: 100%;
    min-width: min(100%, 2.8em);
}

.dait-translation-line.dait-translation-masked .dait-translation-emoji {
    opacity: 0;
}

.dait-translation-line.dait-translation-masked .dait-translation-text::before {
    background: var(--dait-chat-mask);
    border: 1px solid var(--dait-chat-mask-border);
    border-radius: 3px;
    bottom: 0;
    content: "";
    left: -4px;
    position: absolute;
    right: -4px;
    top: 0;
    z-index: 1;
}

.dait-translation-line.dait-translation-loading {
    background: var(--dait-line-chip);
    border-radius: 4px;
    color: var(--dait-line-muted);
    font-size: 0.8125rem;
    height: 1.375rem;
    line-height: 1.375rem;
    max-width: 100%;
    min-width: 7.5rem;
    overflow: hidden;
    padding: 0 10px;
    position: relative;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-translation-line.dait-translation-preview.dait-translation-loading {
    display: inline-block;
    font-size: 12px;
    height: auto;
    line-height: inherit;
    max-width: min(40%, 12rem);
    min-height: 0;
    min-width: 0;
    padding: 0 6px;
    vertical-align: baseline;
}

.dait-translation-line.dait-translation-loading::after {
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--dait-line-text) 10%, transparent), transparent);
    content: "";
    inset: 0;
    pointer-events: none;
    position: absolute;
    transform: translateX(-100%);
}

@media (prefers-reduced-motion: no-preference) {
    .dait-translation-line.dait-translation-loading::after {
        animation: dait-loading-sheen 1.6s ease-in-out infinite;
    }
}

@keyframes dait-loading-sheen {
    100% {
        transform: translateX(100%);
    }
}

@media (max-width: 860px) {
    [data-dait-settings-modal="true"] {
        max-width: calc(100vw - 28px) !important;
        width: calc(100vw - 28px) !important;
    }

    .dait-quick-settings-modal-root {
        padding: 14px;
    }

    .dait-quick-settings-dialog {
        max-height: calc(100vh - 28px);
        min-height: min(520px, calc(100vh - 28px));
    }

    .dait-quick-settings-header {
        min-height: 54px;
        padding: 13px 14px 12px;
    }

    .dait-quick-settings-title {
        font-size: 18px;
    }

    .dait-quick-settings-body {
        padding: 14px;
    }

    .dait-quick-settings-footer {
        min-height: 62px;
        padding: 12px 14px;
    }

    .dait-settings {
        width: 100%;
    }

    .dait-settings-hero {
        grid-template-columns: 44px minmax(0, 1fr);
    }

    .dait-settings-layout {
        grid-template-columns: 1fr;
    }

    .dait-settings-sidebar {
        align-items: center;
        display: flex;
        gap: 8px;
        max-height: none;
        overflow-x: auto;
        overflow-y: hidden;
        position: sticky;
        top: 0;
    }

    .dait-settings-nav-list {
        display: flex;
        flex: 1 1 auto;
        gap: 6px;
        min-width: max-content;
    }

    .dait-settings-nav-button {
        justify-content: center;
        min-width: max-content;
        padding-left: 11px;
        padding-right: 11px;
        text-align: center;
        width: auto;
    }

    .dait-settings-nav-secondary {
        padding-left: 11px;
    }

    .dait-settings-sidebar-reset {
        flex: 0 0 auto;
        margin-top: 0;
        min-width: max-content;
        width: auto;
    }

    .dait-settings-section {
        scroll-margin-top: 78px;
    }

    .dait-settings-mark {
        height: 44px;
        width: 44px;
    }

    .dait-prompt-tools {
        grid-template-columns: 1fr;
    }

    .dait-prompt-actions .dait-small-button {
        flex: 1 1 120px;
    }

    .dait-test-toolbar {
        grid-template-columns: 1fr;
    }

    .dait-api-key-row {
        grid-template-columns: 1fr;
        grid-template-areas:
            "label"
            "desc"
            "status"
            "control";
    }

    .dait-settings-row > .dait-api-status {
        justify-self: start;
    }

    .dait-api-controls {
        grid-template-columns: 1fr;
    }
}

@media (min-width: 760px) {
    .dait-section-polish,
    .dait-section-translation,
    .dait-section-polish-controls,
    .dait-section-translation-controls,
    .dait-section-auto-translate,
    .dait-section-public-bilingual,
    .dait-section-display,
    .dait-section-cache,
    .dait-section-diagnostics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dait-section-polish h3,
    .dait-section-translation h3,
    .dait-section-polish-controls h3,
    .dait-section-translation-controls h3,
    .dait-section-auto-translate h3,
    .dait-section-public-bilingual h3,
    .dait-section-display h3,
    .dait-section-cache h3,
    .dait-section-diagnostics h3,
    .dait-section-polish > .dait-note,
    .dait-section-translation > .dait-note,
    .dait-section-public-bilingual > .dait-note,
    .dait-section-polish .dait-prompt-manager,
    .dait-section-translation .dait-prompt-manager,
    .dait-section-translation .dait-google-settings,
    .dait-section-public-bilingual .dait-settings-row-wide {
        grid-column: 1 / -1;
    }
}
`;
