"use strict";

module.exports = `.dait-quick-settings-modal-root {
    --dait-quick-backdrop: rgba(0, 0, 0, 0.42);
    --dait-quick-dialog-bg: var(--modal-background, var(--dait-card, var(--background-surface-high, var(--background-secondary, #313338))));
    --dait-quick-footer-bg: var(--modal-footer-background, var(--dait-card-soft, var(--background-surface-higher, var(--background-secondary-alt, #2b2d31))));
    --dait-quick-border: var(--dait-border, var(--border-subtle, var(--background-modifier-accent, rgba(255, 255, 255, 0.08))));
    --dait-quick-shadow: var(--elevation-high, 0 18px 52px rgba(0, 0, 0, 0.38));
    --dait-quick-text: var(--text-normal, var(--text-primary, #dbdee1));
    --dait-quick-title: var(--header-primary, var(--text-normal, #f2f3f5));
    --dait-quick-muted: var(--dait-muted-readable, var(--interactive-normal, var(--text-muted, #b5bac1)));
    --dait-quick-hover: var(--dait-control-hover, var(--background-modifier-hover, rgba(255, 255, 255, 0.08)));
    align-items: center;
    background: var(--dait-quick-backdrop);
    color-scheme: dark;
    color: var(--dait-quick-text);
    display: flex;
    inset: 0;
    isolation: isolate;
    justify-content: center;
    overflow: hidden;
    padding: clamp(16px, 4vh, 32px);
    pointer-events: auto;
    position: fixed;
    z-index: 2147483000;
}

.dait-quick-settings-backdrop {
    inset: 0;
    position: fixed;
}

.dait-quick-settings-dialog {
    background: var(--dait-quick-dialog-bg);
    border: 1px solid var(--dait-quick-border);
    border-radius: 8px;
    box-shadow: var(--dait-quick-shadow);
    color: var(--dait-quick-text);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    max-height: min(86vh, 860px);
    max-width: min(1280px, calc(100vw - 32px));
    min-height: min(520px, calc(100vh - 32px));
    overflow: hidden;
    position: relative;
    width: min(1280px, calc(100vw - 32px));
    z-index: 1;
}

.theme-light.dait-quick-settings-modal-root,
.theme-light .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-quick-settings-modal-root {
    --dait-quick-backdrop: rgba(6, 6, 7, 0.34);
    --dait-quick-dialog-bg: var(--modal-background, var(--dait-card, var(--bg-base-primary, var(--background-primary, #ffffff))));
    --dait-quick-footer-bg: var(--modal-footer-background, var(--dait-card-soft, var(--background-surface-high, var(--background-secondary, #f2f3f5))));
    --dait-quick-border: var(--dait-border, var(--border-subtle, rgba(116, 127, 141, 0.22)));
    --dait-quick-shadow: 0 18px 52px rgba(24, 36, 61, 0.18);
    --dait-quick-text: #2e3338;
    --dait-quick-title: #1f232b;
    --dait-quick-muted: #5c6472;
    --dait-quick-hover: var(--dait-control-hover, var(--background-modifier-hover, rgba(79, 84, 92, 0.1)));
    color-scheme: light;
}

.theme-dark.dait-quick-settings-modal-root,
.theme-dark .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="dark"],
[data-dait-discord-theme="dark"] .dait-quick-settings-modal-root {
    --dait-quick-backdrop: rgba(0, 0, 0, 0.42);
    --dait-quick-dialog-bg: var(--modal-background, var(--dait-card, var(--background-surface-high, var(--background-secondary, #313338))));
    --dait-quick-footer-bg: var(--modal-footer-background, var(--dait-card-soft, var(--background-surface-higher, var(--background-secondary-alt, #2b2d31))));
    --dait-quick-border: var(--dait-border, var(--border-subtle, var(--background-modifier-accent, rgba(255, 255, 255, 0.08))));
    --dait-quick-shadow: var(--elevation-high, 0 18px 52px rgba(0, 0, 0, 0.38));
    --dait-quick-text: var(--text-normal, var(--text-primary, #dbdee1));
    --dait-quick-title: var(--header-primary, var(--text-normal, #f2f3f5));
    --dait-quick-muted: var(--dait-muted-readable, var(--interactive-normal, var(--text-muted, #b5bac1)));
    --dait-quick-hover: var(--dait-control-hover, var(--background-modifier-hover, rgba(255, 255, 255, 0.08)));
    color-scheme: dark;
}

.theme-darker.dait-quick-settings-modal-root,
.theme-darker .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="darker"],
[data-dait-discord-theme="darker"] .dait-quick-settings-modal-root {
    --dait-quick-backdrop: rgba(0, 0, 0, 0.5);
    --dait-quick-dialog-bg: var(--modal-background, var(--dait-card, var(--background-surface-high, var(--background-secondary, #1e1f22))));
    --dait-quick-footer-bg: var(--modal-footer-background, var(--dait-card-soft, var(--background-surface-higher, var(--background-secondary-alt, #191b1f))));
    --dait-quick-border: var(--dait-border, var(--border-subtle, rgba(255, 255, 255, 0.09)));
    --dait-quick-shadow: 0 20px 54px rgba(0, 0, 0, 0.46);
    --dait-quick-text: var(--text-normal, var(--text-primary, #dbdee1));
    --dait-quick-title: var(--header-primary, var(--text-normal, #f2f3f5));
    --dait-quick-muted: var(--dait-muted-readable, var(--interactive-normal, var(--text-muted, #b5bac1)));
    --dait-quick-hover: var(--dait-control-hover, var(--background-modifier-hover, rgba(255, 255, 255, 0.07)));
    color-scheme: dark;
}

.theme-midnight.dait-quick-settings-modal-root,
.theme-midnight .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="midnight"] .dait-quick-settings-modal-root {
    --dait-quick-backdrop: rgba(0, 0, 0, 0.58);
    --dait-quick-dialog-bg: var(--modal-background, var(--dait-card, var(--background-surface-high, var(--background-secondary, #101114))));
    --dait-quick-footer-bg: var(--modal-footer-background, var(--dait-card-soft, var(--background-surface-higher, var(--background-secondary-alt, #0b0c10))));
    --dait-quick-border: var(--dait-border, var(--border-subtle, rgba(255, 255, 255, 0.08)));
    --dait-quick-shadow: 0 22px 56px rgba(0, 0, 0, 0.52);
    --dait-quick-text: var(--text-normal, var(--text-primary, #f2f3f5));
    --dait-quick-title: var(--header-primary, var(--text-normal, #ffffff));
    --dait-quick-muted: var(--dait-muted-readable, var(--interactive-normal, var(--text-muted, #b8c0cc)));
    --dait-quick-hover: var(--dait-control-hover, var(--background-modifier-hover, rgba(255, 255, 255, 0.06)));
    color-scheme: dark;
}

.dait-quick-settings-header {
    align-items: center;
    border-bottom: 1px solid var(--dait-quick-border);
    display: flex;
    flex: 0 0 auto;
    gap: 16px;
    justify-content: space-between;
    min-height: 58px;
    padding: 16px 18px 14px;
}

.dait-quick-settings-title {
    color: var(--dait-quick-title);
    font-size: 20px;
    font-weight: 700;
    letter-spacing: 0;
    line-height: 1.25;
    margin: 0;
}

.dait-quick-settings-body {
    background: var(--dait-quick-dialog-bg);
    color: var(--dait-quick-text);
    min-height: 0;
    overflow-y: auto;
    padding: 22px 52px 26px;
    scrollbar-gutter: stable;
}

.dait-quick-settings-body > .dait-settings {
    margin: 0 auto;
    max-width: 100%;
    overflow: visible;
    padding: 0;
    width: min(1208px, 100%);
}

.dait-quick-settings-footer {
    align-items: center;
    background: var(--dait-quick-footer-bg);
    border-top: 1px solid var(--dait-quick-border);
    display: flex;
    flex: 0 0 auto;
    justify-content: flex-end;
    min-height: 72px;
    padding: 14px 18px;
}

.dait-quick-settings-done {
    background: var(--button-positive-background, var(--brand-500, #5865f2));
    border: 0;
    border-radius: 6px;
    color: var(--white-500, #ffffff);
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    min-height: 38px;
    min-width: 96px;
    padding: 0 18px;
}

.dait-quick-settings-done:hover,
.dait-quick-settings-done:focus-visible {
    background: var(--button-positive-background-hover, var(--brand-560, #4752c4));
}

.dait-quick-settings-error {
    background: var(--dait-quick-dialog-bg);
    border: 1px solid var(--status-danger, #d83c3e);
    border-radius: 8px;
    box-shadow: var(--dait-shadow, 0 14px 34px rgba(0, 0, 0, 0.2));
    color: var(--dait-quick-text);
    display: grid;
    gap: 10px;
    margin: 0 auto;
    max-width: 720px;
    padding: 22px 24px;
}

.dait-quick-settings-error h3 {
    color: var(--dait-quick-title);
    font-size: 18px;
    line-height: 1.3;
    margin: 0;
}

.dait-quick-settings-error p {
    color: var(--text-muted, #b5bac1);
    font-size: 14px;
    line-height: 1.45;
    margin: 0;
}

.dait-quick-settings-close {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--dait-quick-muted);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 24px;
    font-weight: 500;
    height: 32px;
    justify-content: center;
    line-height: 1;
    width: 32px;
}

.dait-quick-settings-close:hover,
.dait-quick-settings-close:focus-visible {
    background: var(--dait-quick-hover);
    color: var(--interactive-hover, var(--dait-quick-title));
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

.dait-quick-settings-panel {
    flex: 0 0 auto;
    height: 28px;
    margin: 0 2px;
    min-width: 28px;
    padding: 0 7px;
    position: static;
}

`;
