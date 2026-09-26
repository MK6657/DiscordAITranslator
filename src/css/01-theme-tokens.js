"use strict";

module.exports = `
/* BetterDiscord's plugin-settings modal, marked by applySettingsModalSizing: a moderate window, not a full-width sheet. */
[data-dait-settings-modal="true"] {
    box-sizing: border-box !important;
    margin-left: auto !important;
    margin-right: auto !important;
    max-height: calc(100vh - 64px) !important;
    max-width: min(920px, calc(100vw - 48px)) !important;
    width: min(920px, calc(100vw - 48px)) !important;
}

[data-dait-settings-modal-root="true"] {
    margin-bottom: clamp(16px, 4vh, 32px) !important;
    margin-top: clamp(16px, 4vh, 32px) !important;
}

/* One token layer for the settings window, the settings/quick modal shell and the polish result panel. Every token
   reads Discord's own variables (so dark, light and custom themes follow Discord) with a single fallback. */
.dait-settings,
.dait-quick-settings-modal-root,
[data-dait-settings-modal="true"],
.dait-polish-result-panel {
    --dait-bg: var(--background-base-low, var(--background-primary, #313338));
    --dait-surface: var(--background-base-lower, var(--background-secondary, #2b2d31));
    --dait-surface-2: var(--background-base-lowest, var(--background-tertiary, #1e1f22));
    --dait-input-bg: var(--input-background, var(--background-tertiary, #1e1f22));
    --dait-input-border: var(--input-border, color-mix(in srgb, var(--dait-text-muted) 28%, transparent));
    --dait-divider: var(--border-subtle, var(--background-modifier-accent, #3f4147));
    --dait-hover: var(--background-modifier-hover, rgba(78, 80, 88, 0.3));
    --dait-selected: var(--background-modifier-selected, rgba(78, 80, 88, 0.6));
    --dait-text: var(--text-default, var(--text-normal, #dbdee1));
    --dait-text-muted: var(--header-secondary, var(--text-muted, #b5bac1));
    --dait-heading: var(--text-strong, var(--header-primary, #f2f3f5));
    --dait-brand: var(--button-filled-brand-background, #4752c4);
    --dait-brand-hover: var(--button-filled-brand-background-hover, #3c45a5);
    --dait-on-fill: #ffffff;
    --dait-button-secondary: var(--button-secondary-background, #4e5058);
    --dait-button-secondary-hover: var(--button-secondary-background-hover, #6d6f78);
    --dait-positive-fill: var(--button-positive-background, #248046);
    --dait-danger-fill: var(--button-danger-background, #da373c);
    --dait-danger: var(--text-danger, #fa777c);
    --dait-warning: var(--text-warning, #f0b232);
    --dait-success: var(--text-positive, #4ec183);
    --dait-focus: var(--focus-primary, #00a8fc);
    --dait-shadow: var(--elevation-high, 0 8px 24px rgba(0, 0, 0, 0.24));
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(128, 132, 142, 0.45));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(128, 132, 142, 0.7));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);

    /* Type scale (px), 4/8 spacing grid, radii and the shared control size. */
    --dait-font-title: 20px;
    --dait-font-heading: 16px;
    --dait-font-label: 15px;
    --dait-font-body: 14px;
    --dait-font-caption: 13px;
    --dait-font-chip: 12px;
    --dait-space-1: 4px;
    --dait-space-2: 8px;
    --dait-space-3: 12px;
    --dait-space-4: 16px;
    --dait-space-5: 24px;
    --dait-space-6: 28px;
    --dait-radius-control: 4px;
    --dait-radius-card: 8px;
    --dait-radius-pill: 999px;
    --dait-control-w: 240px;
    --dait-control-h: 32px;

    /* v0.3.0 token names, kept as aliases for the stylesheets that still use them. */
    --dait-accent: var(--brand-500, #5865f2);
    --dait-card: var(--dait-bg);
    --dait-card-raised: var(--dait-surface);
    --dait-card-soft: var(--dait-surface-2);
    --dait-border: var(--dait-divider);
    --dait-border-strong: color-mix(in srgb, var(--dait-text-muted) 45%, var(--dait-divider));
    --dait-control: var(--dait-input-bg);
    --dait-control-hover: color-mix(in srgb, var(--dait-text) 6%, var(--dait-input-bg));
    --dait-label: var(--dait-text);
    --dait-muted-readable: var(--dait-text-muted);
    --dait-disabled-text: color-mix(in srgb, var(--dait-text-muted) 72%, var(--dait-bg));
    color: var(--dait-text);
    color-scheme: dark;
}

/* Light theme: only the tokens whose Discord variable can be missing get a light fallback. */
.theme-light.dait-settings,
.theme-light .dait-settings,
.dait-settings[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-settings,
.theme-light.dait-quick-settings-modal-root,
.theme-light .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-quick-settings-modal-root,
.theme-light [data-dait-settings-modal="true"],
.theme-light[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="light"],
.theme-light.dait-polish-result-panel,
.theme-light .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="light"] {
    --dait-danger: var(--text-danger, #c4323a);
    --dait-warning: var(--text-warning, #9a5b00);
    --dait-success: var(--text-positive, #1a7545);
    --dait-hover: var(--background-modifier-hover, rgba(116, 124, 138, 0.14));
    --dait-selected: var(--background-modifier-selected, rgba(116, 124, 138, 0.24));
    --dait-shadow: var(--elevation-high, 0 8px 24px rgba(24, 36, 61, 0.14));
    color-scheme: light;
}

.dait-settings *,
.dait-translation-box *,
.dait-translation-line,
.dait-polish-button,
.dait-public-bilingual-button,
.dait-quick-settings-button,
.dait-quick-settings-modal-root *,
.dait-polish-result-panel,
.dait-polish-result-panel *,
.dait-polish-restore-control,
.dait-message-button {
    box-sizing: border-box;
}

[data-dait-settings-modal="true"],
.dait-quick-settings-body,
.dait-settings-rail,
.dait-settings-content,
.dait-settings-row textarea,
.dait-prompt-editor textarea,
.dait-test-panel textarea,
.dait-test-output,
.dait-polish-result-output {
    scrollbar-color: var(--dait-scrollbar-thumb) var(--dait-scrollbar-track);
    scrollbar-width: thin;
}

[data-dait-settings-modal="true"]::-webkit-scrollbar,
.dait-quick-settings-body::-webkit-scrollbar,
.dait-settings-rail::-webkit-scrollbar,
.dait-settings-content::-webkit-scrollbar,
.dait-settings-row textarea::-webkit-scrollbar,
.dait-prompt-editor textarea::-webkit-scrollbar,
.dait-test-panel textarea::-webkit-scrollbar,
.dait-test-output::-webkit-scrollbar,
.dait-polish-result-output::-webkit-scrollbar {
    height: 8px;
    width: 8px;
}

[data-dait-settings-modal="true"]::-webkit-scrollbar-track,
.dait-quick-settings-body::-webkit-scrollbar-track,
.dait-settings-rail::-webkit-scrollbar-track,
.dait-settings-content::-webkit-scrollbar-track,
.dait-settings-row textarea::-webkit-scrollbar-track,
.dait-prompt-editor textarea::-webkit-scrollbar-track,
.dait-test-panel textarea::-webkit-scrollbar-track,
.dait-test-output::-webkit-scrollbar-track,
.dait-polish-result-output::-webkit-scrollbar-track {
    background: var(--dait-scrollbar-track);
    border-radius: 999px;
}

[data-dait-settings-modal="true"]::-webkit-scrollbar-thumb,
.dait-quick-settings-body::-webkit-scrollbar-thumb,
.dait-settings-rail::-webkit-scrollbar-thumb,
.dait-settings-content::-webkit-scrollbar-thumb,
.dait-settings-row textarea::-webkit-scrollbar-thumb,
.dait-prompt-editor textarea::-webkit-scrollbar-thumb,
.dait-test-panel textarea::-webkit-scrollbar-thumb,
.dait-test-output::-webkit-scrollbar-thumb,
.dait-polish-result-output::-webkit-scrollbar-thumb {
    background: var(--dait-scrollbar-thumb);
    border: 2px solid transparent;
    border-radius: 999px;
    background-clip: padding-box;
}

[data-dait-settings-modal="true"]::-webkit-scrollbar-thumb:hover,
.dait-quick-settings-body::-webkit-scrollbar-thumb:hover,
.dait-settings-rail::-webkit-scrollbar-thumb:hover,
.dait-settings-content::-webkit-scrollbar-thumb:hover,
.dait-settings-row textarea::-webkit-scrollbar-thumb:hover,
.dait-prompt-editor textarea::-webkit-scrollbar-thumb:hover,
.dait-test-panel textarea::-webkit-scrollbar-thumb:hover,
.dait-test-output::-webkit-scrollbar-thumb:hover,
.dait-polish-result-output::-webkit-scrollbar-thumb:hover {
    background: var(--dait-scrollbar-thumb-hover);
    background-clip: padding-box;
}

[data-dait-settings-modal="true"]::-webkit-scrollbar-corner,
.dait-quick-settings-body::-webkit-scrollbar-corner,
.dait-settings-rail::-webkit-scrollbar-corner,
.dait-settings-content::-webkit-scrollbar-corner,
.dait-settings-row textarea::-webkit-scrollbar-corner,
.dait-prompt-editor textarea::-webkit-scrollbar-corner,
.dait-test-panel textarea::-webkit-scrollbar-corner,
.dait-test-output::-webkit-scrollbar-corner,
.dait-polish-result-output::-webkit-scrollbar-corner {
    background: transparent;
}

/* One visible focus ring for every control in these surfaces. */
.dait-settings :focus-visible,
.dait-quick-settings-modal-root :focus-visible,
.dait-polish-result-panel :focus-visible {
    outline: 2px solid var(--dait-focus);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .dait-settings,
    .dait-settings *,
    .dait-quick-settings-modal-root,
    .dait-quick-settings-modal-root *,
    .dait-polish-result-panel,
    .dait-polish-result-panel * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition: none !important;
    }
}

`;
