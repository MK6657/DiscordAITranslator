"use strict";

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
    color: var(--text-normal);
    display: block;
    font-size: 1rem;
    line-height: 1.375rem;
    margin: 1px 0;
    max-width: 100%;
    min-height: 1.375rem;
    overflow-anchor: none;
    overflow-wrap: anywhere;
    position: relative;
    text-align: left;
    white-space: pre-wrap;
    width: auto;
}

.dait-translation-line.dait-translation-revealed {
    background: var(--dait-chat-revealed-bg);
    border-radius: 3px;
    box-decoration-break: clone;
    -webkit-box-decoration-break: clone;
    color: var(--dait-chat-revealed-text);
    font-weight: inherit;
    padding: 0 3px;
    user-select: text;
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
}

.dait-translation-line.dait-translation-preview.dait-translation-revealed {
    padding: 0 2px;
}

.dait-translation-line.dait-translation-error {
    align-items: center;
    background: color-mix(in srgb, var(--dait-danger, #d83c3e) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--dait-danger, #d83c3e) 34%, transparent);
    border-radius: 5px;
    color: var(--dait-danger, #d83c3e);
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
    padding: 3px 6px;
    user-select: text;
}

.dait-translation-error-message {
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-translation-retry {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--dait-danger, #d83c3e) 42%, transparent);
    border-radius: 5px;
    color: var(--dait-danger, #d83c3e);
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1;
    padding: 3px 7px;
}

.dait-translation-retry:hover,
.dait-translation-retry:focus-visible {
    background: color-mix(in srgb, var(--dait-danger, #d83c3e) 14%, transparent);
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

.dait-translation-line.dait-translation-loading {
    background: var(--dait-chat-mask);
    border: 1px solid var(--dait-chat-mask-border);
    border-radius: 3px;
    display: block;
    height: 1.25rem;
    opacity: 0.86;
}

.dait-translation-line.dait-translation-preview.dait-translation-loading {
    height: 1em;
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
    color: transparent;
    max-width: 164px;
    position: relative;
    width: min(48%, 164px);
}

.dait-translation-line.dait-translation-loading::after {
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
    content: "";
    inset: 0;
    position: absolute;
    transform: translateX(-100%);
    animation: dait-loading-sheen 1.2s ease-in-out infinite;
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
