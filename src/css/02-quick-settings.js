"use strict";

// The plugin's own settings window (opened from the quick panel's "open full settings", the chat error lines and
// the input menu): a moderate window (UI-SPEC "Sizes") that the tabbed settings panel fills. The panel brings the
// one title bar (title, status, close); the window adds no header or footer. Colours come from the panel palette
// in 01-theme-tokens (data-dait-panel-theme on .dait-quick-settings-modal-root).
module.exports = `.dait-quick-settings-modal-root {
    align-items: center;
    background: var(--dait-backdrop);
    color: var(--dait-text);
    display: flex;
    inset: 0;
    isolation: isolate;
    justify-content: center;
    overflow: hidden;
    pointer-events: auto;
    position: fixed;
    z-index: 2147483000;
}

.dait-quick-settings-backdrop {
    inset: 0;
    position: fixed;
}

.dait-quick-settings-dialog {
    background: var(--dait-bg);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-card);
    box-shadow: var(--dait-shadow);
    color: var(--dait-text);
    display: flex;
    flex-direction: column;
    height: min(760px, calc(100vh - 64px));
    overflow: hidden;
    position: relative;
    width: min(920px, calc(100vw - 48px));
    z-index: 1;
}

.dait-quick-settings-body {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
}

/* The panel fills the window; its own content pane scrolls, so the title bar and the tab rail stay put. */
.dait-quick-settings-body > .dait-settings {
    border-radius: 0;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
}

.dait-quick-settings-error {
    background: var(--dait-surface);
    border: 1px solid var(--dait-danger);
    border-radius: var(--dait-radius-card);
    color: var(--dait-text);
    display: grid;
    gap: var(--dait-space-3);
    justify-items: start;
    margin: auto;
    padding: var(--dait-space-5);
    width: min(560px, calc(100% - 48px));
}

.dait-quick-settings-error h3 {
    color: var(--dait-heading);
    font-size: var(--dait-font-window);
    font-weight: 600;
    line-height: 1.3;
    margin: 0;
}

.dait-quick-settings-error p {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    line-height: var(--dait-line);
    margin: 0;
}

.dait-quick-settings-done {
    background: var(--dait-brand);
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-on-fill);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    line-height: 1;
    padding: 0 14px;
}

.dait-quick-settings-done:hover {
    background: var(--dait-brand-hover);
}

.dait-quick-settings-button {
    --dait-quick-button-bg: color-mix(in srgb, var(--background-modifier-hover, var(--background-surface-high, rgba(79, 84, 92, 0.16))) 46%, transparent);
    --dait-quick-button-border: color-mix(in srgb, var(--interactive-muted, #747f8d) 24%, transparent);
    --dait-quick-button-text: var(--interactive-normal, var(--text-secondary, var(--text-muted, #b5bac1)));
    --dait-quick-button-hover-bg: color-mix(in srgb, var(--brand-500, #5865f2) 16%, var(--background-modifier-selected, var(--background-modifier-hover, rgba(79, 84, 92, 0.16))));
    --dait-quick-button-hover-border: color-mix(in srgb, var(--brand-500, #5865f2) 48%, var(--interactive-muted, #747f8d));
    --dait-quick-button-hover-text: var(--interactive-hover, var(--text-primary, var(--text-normal, #ffffff)));
    align-items: center;
    background: var(--dait-quick-button-bg);
    border: 1px solid var(--dait-quick-button-border);
    border-radius: 8px;
    box-shadow: none;
    color: var(--dait-quick-button-text);
    cursor: pointer;
    display: inline-flex;
    font-size: 11px;
    font-weight: 800;
    justify-content: center;
    letter-spacing: 0;
    line-height: 1;
}

.dait-quick-settings-button:hover,
.dait-quick-settings-button:focus-visible,
.dait-quick-settings-button-active {
    background: var(--dait-quick-button-hover-bg);
    border-color: var(--dait-quick-button-hover-border);
    color: var(--dait-quick-button-hover-text);
}

.theme-light.dait-quick-settings-button,
.theme-light .dait-quick-settings-button,
.dait-quick-settings-button[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-quick-settings-button {
    --dait-quick-button-bg: color-mix(in srgb, var(--background-secondary, var(--background-modifier-hover, rgba(79, 84, 92, 0.1))) 58%, transparent);
    --dait-quick-button-border: color-mix(in srgb, var(--interactive-muted, #747f8d) 22%, transparent);
    --dait-quick-button-text: var(--interactive-normal, var(--text-secondary, #4f5660));
    --dait-quick-button-hover-bg: color-mix(in srgb, var(--brand-500, #5865f2) 12%, var(--background-modifier-selected, var(--background-modifier-hover, rgba(79, 84, 92, 0.1))));
    --dait-quick-button-hover-border: color-mix(in srgb, var(--brand-500, #5865f2) 44%, var(--interactive-muted, #747f8d));
    --dait-quick-button-hover-text: var(--interactive-hover, var(--text-primary, #2e3338));
    box-shadow: none;
}

.theme-light.dait-quick-settings-button:hover,
.theme-light.dait-quick-settings-button:focus-visible,
.theme-light .dait-quick-settings-button:hover,
.theme-light .dait-quick-settings-button:focus-visible,
.dait-quick-settings-button[data-dait-discord-theme="light"]:hover,
.dait-quick-settings-button[data-dait-discord-theme="light"]:focus-visible,
[data-dait-discord-theme="light"] .dait-quick-settings-button:hover,
[data-dait-discord-theme="light"] .dait-quick-settings-button:focus-visible {
    background: var(--dait-quick-button-hover-bg);
    border-color: var(--dait-quick-button-hover-border);
    color: var(--dait-quick-button-hover-text);
}

.theme-dark.dait-quick-settings-button,
.theme-darker.dait-quick-settings-button,
.theme-midnight.dait-quick-settings-button,
.theme-dark .dait-quick-settings-button,
.theme-darker .dait-quick-settings-button,
.theme-midnight .dait-quick-settings-button,
.dait-quick-settings-button[data-dait-discord-theme="dark"],
.dait-quick-settings-button[data-dait-discord-theme="darker"],
.dait-quick-settings-button[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="dark"] .dait-quick-settings-button,
[data-dait-discord-theme="darker"] .dait-quick-settings-button,
[data-dait-discord-theme="midnight"] .dait-quick-settings-button {
    --dait-quick-button-bg: color-mix(in srgb, var(--background-modifier-hover, rgba(255, 255, 255, 0.08)) 48%, transparent);
    --dait-quick-button-border: color-mix(in srgb, var(--interactive-muted, #747f8d) 24%, transparent);
    --dait-quick-button-text: var(--interactive-normal, var(--text-secondary, var(--text-muted, #b5bac1)));
    --dait-quick-button-hover-bg: color-mix(in srgb, var(--brand-500, #5865f2) 18%, var(--background-modifier-selected, var(--background-modifier-hover, rgba(255, 255, 255, 0.08))));
    --dait-quick-button-hover-border: color-mix(in srgb, var(--brand-500, #5865f2) 52%, var(--interactive-muted, #747f8d));
    --dait-quick-button-hover-text: var(--interactive-hover, #ffffff);
    box-shadow: none;
}

.theme-darker.dait-quick-settings-button,
.theme-midnight.dait-quick-settings-button,
.theme-darker .dait-quick-settings-button,
.theme-midnight .dait-quick-settings-button,
.dait-quick-settings-button[data-dait-discord-theme="darker"],
.dait-quick-settings-button[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="darker"] .dait-quick-settings-button,
[data-dait-discord-theme="midnight"] .dait-quick-settings-button {
    --dait-quick-button-bg: color-mix(in srgb, var(--background-modifier-hover, rgba(255, 255, 255, 0.07)) 42%, transparent);
    --dait-quick-button-border: color-mix(in srgb, var(--interactive-muted, #747f8d) 22%, transparent);
}

.theme-dark.dait-quick-settings-button:hover,
.theme-dark.dait-quick-settings-button:focus-visible,
.theme-darker.dait-quick-settings-button:hover,
.theme-darker.dait-quick-settings-button:focus-visible,
.theme-midnight.dait-quick-settings-button:hover,
.theme-midnight.dait-quick-settings-button:focus-visible,
.theme-dark .dait-quick-settings-button:hover,
.theme-dark .dait-quick-settings-button:focus-visible,
.theme-darker .dait-quick-settings-button:hover,
.theme-darker .dait-quick-settings-button:focus-visible,
.theme-midnight .dait-quick-settings-button:hover,
.theme-midnight .dait-quick-settings-button:focus-visible,
.dait-quick-settings-button[data-dait-discord-theme="dark"]:hover,
.dait-quick-settings-button[data-dait-discord-theme="dark"]:focus-visible,
.dait-quick-settings-button[data-dait-discord-theme="darker"]:hover,
.dait-quick-settings-button[data-dait-discord-theme="darker"]:focus-visible,
.dait-quick-settings-button[data-dait-discord-theme="midnight"]:hover,
.dait-quick-settings-button[data-dait-discord-theme="midnight"]:focus-visible,
[data-dait-discord-theme="dark"] .dait-quick-settings-button:hover,
[data-dait-discord-theme="dark"] .dait-quick-settings-button:focus-visible,
[data-dait-discord-theme="darker"] .dait-quick-settings-button:hover,
[data-dait-discord-theme="darker"] .dait-quick-settings-button:focus-visible,
[data-dait-discord-theme="midnight"] .dait-quick-settings-button:hover,
[data-dait-discord-theme="midnight"] .dait-quick-settings-button:focus-visible {
    background: var(--dait-quick-button-hover-bg);
    border-color: var(--dait-quick-button-hover-border);
    color: var(--dait-quick-button-hover-text);
}

/* The launcher's size and position come from 07-quick-popover; this keeps it from shrinking in the user panel. */
.dait-quick-settings-panel {
    flex: 0 0 auto;
    margin: 0 2px;
}

`;
