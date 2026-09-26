"use strict";

module.exports = `.dait-polish-button,
.dait-public-bilingual-button,
.dait-polish-restore-button,
.dait-input-action-menu-button,
.dait-message-button {
    background: color-mix(in srgb, var(--background-modifier-hover, rgba(79, 84, 92, 0.16)) 72%, transparent);
    border: 1px solid color-mix(in srgb, var(--interactive-muted, #747f8d) 34%, transparent);
    border-radius: 7px;
    box-shadow: none;
    color: var(--interactive-normal, var(--text-secondary, #b5bac1));
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1;
    padding: 7px 9px;
    text-shadow: none;
}

.dait-input-actions-host {
    align-items: center;
    display: inline-flex;
    flex: 0 0 auto;
    min-width: 0;
}

.dait-input-action-group {
    align-items: center;
    display: inline-flex;
    flex: 0 0 auto;
    gap: 3px;
    margin: 0 2px 0 0;
    max-width: min(188px, 36vw);
    min-width: 0;
    overflow: hidden;
}

.dait-polish-button:hover,
.dait-public-bilingual-button:hover,
.dait-polish-restore-button:hover,
.dait-input-action-menu-button:hover,
.dait-message-button:hover {
    background: color-mix(in srgb, var(--brand-500, #5865f2) 18%, var(--background-modifier-hover, rgba(79, 84, 92, 0.16)));
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 54%, var(--interactive-muted, #747f8d));
    color: var(--interactive-hover, var(--text-normal, #ffffff));
}

.dait-polish-button:disabled,
.dait-public-bilingual-button:disabled,
.dait-polish-restore-button:disabled,
.dait-input-action-menu-button:disabled,
.dait-message-button:disabled {
    cursor: wait;
    opacity: 0.65;
}

.dait-polish-button,
.dait-public-bilingual-button,
.dait-polish-restore-button,
.dait-input-action-menu-button {
    align-items: center;
    display: inline-flex;
    flex: 0 0 auto;
    justify-content: center;
    margin: 0;
    max-width: 74px;
    min-height: 32px;
    min-width: 30px;
    overflow: hidden;
    position: static;
    text-overflow: ellipsis;
    white-space: nowrap;
    z-index: auto;
}

.dait-input-action-group-dual .dait-polish-button,
.dait-input-action-group-dual .dait-public-bilingual-button,
.dait-input-action-group-dual .dait-polish-restore-button {
    max-width: 44px;
    padding-left: 7px;
    padding-right: 7px;
}

.dait-input-action-menu-button {
    display: none;
    font-weight: 800;
}

.dait-polish-restore-button {
    max-width: 86px;
}

.dait-public-bilingual-button {
    background: color-mix(in srgb, var(--brand-500, #5865f2) 12%, var(--background-modifier-hover, rgba(79, 84, 92, 0.16)));
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 36%, var(--interactive-muted, #747f8d));
}

.theme-light.dait-polish-button,
.theme-light.dait-public-bilingual-button,
.theme-light .dait-polish-button,
.theme-light .dait-public-bilingual-button,
.dait-polish-button[data-dait-discord-theme="light"],
.dait-public-bilingual-button[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-polish-button,
[data-dait-discord-theme="light"] .dait-public-bilingual-button {
    background: rgba(79, 84, 92, 0.08);
    border-color: rgba(79, 84, 92, 0.2);
    color: var(--interactive-normal, #4f5660);
}

.theme-light.dait-public-bilingual-button,
.theme-light .dait-public-bilingual-button,
.dait-public-bilingual-button[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-public-bilingual-button {
    background: rgba(88, 101, 242, 0.1);
    border-color: rgba(88, 101, 242, 0.34);
}

.theme-light.dait-polish-button:hover,
.theme-light.dait-polish-button:focus-visible,
.theme-light.dait-public-bilingual-button:hover,
.theme-light.dait-public-bilingual-button:focus-visible,
.theme-light .dait-polish-button:hover,
.theme-light .dait-polish-button:focus-visible,
.theme-light .dait-public-bilingual-button:hover,
.theme-light .dait-public-bilingual-button:focus-visible,
.dait-polish-button[data-dait-discord-theme="light"]:hover,
.dait-polish-button[data-dait-discord-theme="light"]:focus-visible,
.dait-public-bilingual-button[data-dait-discord-theme="light"]:hover,
.dait-public-bilingual-button[data-dait-discord-theme="light"]:focus-visible,
[data-dait-discord-theme="light"] .dait-polish-button:hover,
[data-dait-discord-theme="light"] .dait-polish-button:focus-visible,
[data-dait-discord-theme="light"] .dait-public-bilingual-button:hover,
[data-dait-discord-theme="light"] .dait-public-bilingual-button:focus-visible {
    background: rgba(88, 101, 242, 0.14);
    border-color: rgba(88, 101, 242, 0.48);
    color: var(--interactive-hover, #2e3338);
}

.theme-dark.dait-polish-button,
.theme-dark.dait-public-bilingual-button,
.theme-darker.dait-polish-button,
.theme-darker.dait-public-bilingual-button,
.theme-midnight.dait-polish-button,
.theme-midnight.dait-public-bilingual-button,
.theme-dark .dait-polish-button,
.theme-dark .dait-public-bilingual-button,
.theme-darker .dait-polish-button,
.theme-darker .dait-public-bilingual-button,
.theme-midnight .dait-polish-button,
.theme-midnight .dait-public-bilingual-button,
.dait-polish-button[data-dait-discord-theme="dark"],
.dait-public-bilingual-button[data-dait-discord-theme="dark"],
.dait-polish-button[data-dait-discord-theme="darker"],
.dait-public-bilingual-button[data-dait-discord-theme="darker"],
.dait-polish-button[data-dait-discord-theme="midnight"],
.dait-public-bilingual-button[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="dark"] .dait-polish-button,
[data-dait-discord-theme="dark"] .dait-public-bilingual-button,
[data-dait-discord-theme="darker"] .dait-polish-button,
[data-dait-discord-theme="darker"] .dait-public-bilingual-button,
[data-dait-discord-theme="midnight"] .dait-polish-button,
[data-dait-discord-theme="midnight"] .dait-public-bilingual-button {
    background: rgba(255, 255, 255, 0.075);
    border-color: rgba(255, 255, 255, 0.14);
    color: var(--interactive-normal, var(--text-secondary, #b5bac1));
}

.theme-darker.dait-polish-button,
.theme-darker.dait-public-bilingual-button,
.theme-midnight.dait-polish-button,
.theme-midnight.dait-public-bilingual-button,
.theme-darker .dait-polish-button,
.theme-darker .dait-public-bilingual-button,
.theme-midnight .dait-polish-button,
.theme-midnight .dait-public-bilingual-button,
.dait-polish-button[data-dait-discord-theme="darker"],
.dait-public-bilingual-button[data-dait-discord-theme="darker"],
.dait-polish-button[data-dait-discord-theme="midnight"],
.dait-public-bilingual-button[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="darker"] .dait-polish-button,
[data-dait-discord-theme="darker"] .dait-public-bilingual-button,
[data-dait-discord-theme="midnight"] .dait-polish-button,
[data-dait-discord-theme="midnight"] .dait-public-bilingual-button {
    background: rgba(255, 255, 255, 0.065);
    border-color: rgba(255, 255, 255, 0.12);
}

.theme-dark.dait-polish-button:hover,
.theme-dark.dait-polish-button:focus-visible,
.theme-dark.dait-public-bilingual-button:hover,
.theme-dark.dait-public-bilingual-button:focus-visible,
.theme-darker.dait-polish-button:hover,
.theme-darker.dait-polish-button:focus-visible,
.theme-darker.dait-public-bilingual-button:hover,
.theme-darker.dait-public-bilingual-button:focus-visible,
.theme-midnight.dait-polish-button:hover,
.theme-midnight.dait-polish-button:focus-visible,
.theme-midnight.dait-public-bilingual-button:hover,
.theme-midnight.dait-public-bilingual-button:focus-visible,
.theme-dark .dait-polish-button:hover,
.theme-dark .dait-polish-button:focus-visible,
.theme-dark .dait-public-bilingual-button:hover,
.theme-dark .dait-public-bilingual-button:focus-visible,
.theme-darker .dait-polish-button:hover,
.theme-darker .dait-polish-button:focus-visible,
.theme-darker .dait-public-bilingual-button:hover,
.theme-darker .dait-public-bilingual-button:focus-visible,
.theme-midnight .dait-polish-button:hover,
.theme-midnight .dait-polish-button:focus-visible,
.theme-midnight .dait-public-bilingual-button:hover,
.theme-midnight .dait-public-bilingual-button:focus-visible,
.dait-polish-button[data-dait-discord-theme="dark"]:hover,
.dait-polish-button[data-dait-discord-theme="dark"]:focus-visible,
.dait-public-bilingual-button[data-dait-discord-theme="dark"]:hover,
.dait-public-bilingual-button[data-dait-discord-theme="dark"]:focus-visible,
.dait-polish-button[data-dait-discord-theme="darker"]:hover,
.dait-polish-button[data-dait-discord-theme="darker"]:focus-visible,
.dait-public-bilingual-button[data-dait-discord-theme="darker"]:hover,
.dait-public-bilingual-button[data-dait-discord-theme="darker"]:focus-visible,
.dait-polish-button[data-dait-discord-theme="midnight"]:hover,
.dait-polish-button[data-dait-discord-theme="midnight"]:focus-visible,
.dait-public-bilingual-button[data-dait-discord-theme="midnight"]:hover,
.dait-public-bilingual-button[data-dait-discord-theme="midnight"]:focus-visible,
[data-dait-discord-theme="dark"] .dait-polish-button:hover,
[data-dait-discord-theme="dark"] .dait-polish-button:focus-visible,
[data-dait-discord-theme="dark"] .dait-public-bilingual-button:hover,
[data-dait-discord-theme="dark"] .dait-public-bilingual-button:focus-visible,
[data-dait-discord-theme="darker"] .dait-polish-button:hover,
[data-dait-discord-theme="darker"] .dait-polish-button:focus-visible,
[data-dait-discord-theme="darker"] .dait-public-bilingual-button:hover,
[data-dait-discord-theme="darker"] .dait-public-bilingual-button:focus-visible,
[data-dait-discord-theme="midnight"] .dait-polish-button:hover,
[data-dait-discord-theme="midnight"] .dait-polish-button:focus-visible,
[data-dait-discord-theme="midnight"] .dait-public-bilingual-button:hover,
[data-dait-discord-theme="midnight"] .dait-public-bilingual-button:focus-visible {
    background: color-mix(in srgb, var(--brand-500, #5865f2) 20%, rgba(255, 255, 255, 0.08));
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 54%, rgba(255, 255, 255, 0.18));
    color: var(--interactive-hover, var(--text-primary, #ffffff));
}

.dait-input-action-group[data-dait-density="compact"] {
    max-width: 116px;
}

.dait-input-action-group[data-dait-density="compact"] .dait-polish-button,
.dait-input-action-group[data-dait-density="compact"] .dait-public-bilingual-button,
.dait-input-action-group[data-dait-density="compact"] .dait-polish-restore-button {
    height: 30px;
    max-width: 34px;
    min-width: 30px;
    padding: 0 7px;
}

.dait-input-action-group[data-dait-density="minimal"] {
    max-width: 34px;
}

.dait-input-action-group[data-dait-density="minimal"] .dait-polish-button,
.dait-input-action-group[data-dait-density="minimal"] .dait-public-bilingual-button,
.dait-input-action-group[data-dait-density="minimal"] .dait-polish-restore-button {
    display: none;
}

.dait-input-action-group[data-dait-density="minimal"] .dait-input-action-menu-button {
    display: inline-flex;
    height: 30px;
    min-width: 32px;
    padding: 0 7px;
}

/* The composer's action menu is a plugin window: the panel palette (01-theme-tokens) and the body type size. */
.dait-input-action-menu {
    background: var(--dait-bg);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-card);
    box-shadow: var(--dait-shadow);
    color: var(--dait-text);
    display: grid;
    gap: 2px;
    min-width: 160px;
    padding: 6px;
    position: fixed;
    z-index: 10000;
}

.dait-input-action-menu-item {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    cursor: pointer;
    display: flex;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    justify-content: flex-start;
    line-height: var(--dait-line);
    min-height: var(--dait-control-h);
    padding: 0 12px;
    text-align: left;
    white-space: nowrap;
}

.dait-input-action-menu-item:hover,
.dait-input-action-menu-item:focus-visible {
    background: var(--dait-raised);
    color: var(--dait-heading);
}

.dait-polish-restore-control {
    background: color-mix(in srgb, var(--background-secondary, #2b2d31) 92%, transparent);
    border: 1px solid color-mix(in srgb, var(--brand-500, #5865f2) 42%, var(--background-modifier-accent, #4e5058));
    border-radius: 6px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.24);
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1;
    min-height: 28px;
    padding: 7px 9px;
    position: fixed;
    z-index: 10000;
}

.theme-light.dait-polish-restore-control,
.theme-light .dait-polish-restore-control,
.dait-polish-restore-control[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-polish-restore-control {
    background: rgba(255, 255, 255, 0.96);
    border-color: rgba(88, 101, 242, 0.34);
    box-shadow: 0 8px 20px rgba(24, 36, 61, 0.14);
    color: #242832;
}

.theme-dark.dait-polish-restore-control,
.theme-darker.dait-polish-restore-control,
.theme-midnight.dait-polish-restore-control,
.theme-dark .dait-polish-restore-control,
.theme-darker .dait-polish-restore-control,
.theme-midnight .dait-polish-restore-control,
.dait-polish-restore-control[data-dait-discord-theme="dark"],
.dait-polish-restore-control[data-dait-discord-theme="darker"],
.dait-polish-restore-control[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="dark"] .dait-polish-restore-control,
[data-dait-discord-theme="darker"] .dait-polish-restore-control,
[data-dait-discord-theme="midnight"] .dait-polish-restore-control {
    background: color-mix(in srgb, var(--background-secondary, #2b2d31) 92%, transparent);
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 42%, var(--background-modifier-accent, #4e5058));
    color: var(--text-normal, #dbdee1);
}

.dait-polish-restore-control:hover {
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 62%, var(--background-modifier-accent, #4e5058));
}

/* Colours come from the panel palette (01-theme-tokens, data-dait-panel-theme on the panel). */
.dait-polish-result-panel {
    background: var(--dait-surface);
    border: 1px solid var(--dait-divider);
    border-radius: 8px;
    box-shadow: var(--dait-shadow);
    color: var(--dait-text);
    display: grid;
    gap: var(--dait-space-2);
    max-height: min(34vh, 280px);
    min-width: 240px;
    padding: var(--dait-space-3);
    position: fixed;
    z-index: 10000;
}

.dait-polish-result-header {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-width: 0;
}

/* The windows' type scale: the window title (18/600) like the quick panel and the settings window, text and buttons
   at the body size, 36 px buttons; close is a 36 px icon button with the shared close icon (01-theme-tokens). */
.dait-polish-result-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-window);
    font-weight: 600;
    line-height: 1.3;
    min-width: 0;
}

.dait-polish-result-icon {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font-family: inherit;
    height: var(--dait-control-h);
    justify-content: center;
    margin: -4px -6px -4px 0;
    padding: 0;
    width: var(--dait-control-h);
}

.dait-polish-result-icon:hover {
    background: var(--dait-raised);
    color: var(--dait-heading);
}

.dait-polish-result-output {
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    font: inherit;
    font-size: var(--dait-font-body);
    line-height: var(--dait-line);
    max-height: min(18vh, 150px);
    overflow: auto;
    padding: 8px 12px;
    white-space: pre-wrap;
    word-break: break-word;
}

.dait-polish-result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
}

/* Like the settings buttons: grey secondary, brand-filled primary with white text. */
.dait-polish-result-action {
    align-items: center;
    background: var(--dait-raised);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    cursor: pointer;
    display: inline-flex;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    justify-content: center;
    line-height: var(--dait-line);
    padding: 0 14px;
    white-space: nowrap;
}

.dait-polish-result-action.primary {
    background: var(--dait-brand);
    border-color: transparent;
    color: var(--dait-on-fill);
}

.dait-polish-result-action:hover:not(:disabled) {
    background: var(--dait-raised-hover);
}

.dait-polish-result-action.primary:hover:not(:disabled) {
    background: var(--dait-brand-hover);
}

.dait-polish-result-action:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

`;
