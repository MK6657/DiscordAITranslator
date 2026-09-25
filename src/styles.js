"use strict";

// Static plugin stylesheet. Extracted verbatim from discord-ai-translator.js
// (phase 0.5 of the modularization plan); injected by injectStyles() in the main file.
const PLUGIN_CSS = `
[data-dait-settings-modal="true"] {
    box-sizing: border-box !important;
    margin-left: auto !important;
    margin-right: auto !important;
    max-height: min(84vh, 900px) !important;
    max-width: min(1280px, calc(100vw - 72px)) !important;
    width: min(1280px, calc(100vw - 72px)) !important;
}

[data-dait-settings-modal-root="true"] {
    margin-bottom: clamp(18px, 4vh, 42px) !important;
    margin-top: clamp(18px, 4vh, 42px) !important;
}

.dait-quick-settings-modal-root,
[data-dait-settings-modal="true"],
.dait-polish-result-panel {
    --dait-accent: var(--brand-500, #5865f2);
    --dait-accent-hover: var(--brand-560, #4752c4);
    --dait-success: #15a36d;
    --dait-danger: #d83c3e;
    --dait-focus: rgba(88, 101, 242, 0.3);
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #252832)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #2a2e3a));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #20232c))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #3d4352));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #b9c1d0) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #171a22)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #1d222c) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #dbdee1);
    --dait-heading: var(--header-primary, #f2f3f5);
    --dait-label: var(--header-secondary, #c7ccd6);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #b9c1d0));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-shadow: 0 14px 34px rgba(0, 0, 0, 0.2);
    color: var(--dait-text);
}

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
    --dait-focus: rgba(88, 101, 242, 0.2);
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #ffffff)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #f2f3f5));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, #ebedef)));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #d7dce7));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #4f5660) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #f2f3f5)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #e3e5e8) 62%, #ffffff);
    --dait-text: #2e3338;
    --dait-heading: #1f232b;
    --dait-label: #2f3745;
    --dait-muted-readable: #5c6472;
    --dait-disabled-text: #6f7785;
    --dait-shadow: 0 14px 34px rgba(24, 36, 61, 0.12);
    color: var(--dait-text);
    color-scheme: light;
}

.theme-dark.dait-quick-settings-modal-root,
.theme-dark .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="dark"],
[data-dait-discord-theme="dark"] .dait-quick-settings-modal-root,
.theme-dark [data-dait-settings-modal="true"],
.theme-dark[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="dark"],
.theme-dark.dait-polish-result-panel,
.theme-dark .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="dark"] {
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #313338)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #2b2d31));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #232428))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #3f4147));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #b5bac1) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #1e1f22)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #35373c) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #dbdee1);
    --dait-heading: var(--header-primary, #f2f3f5);
    --dait-label: var(--header-secondary, #c7ccd6);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #b5bac1));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-shadow: var(--elevation-high, 0 16px 40px rgba(0, 0, 0, 0.32));
    color: var(--dait-text);
    color-scheme: dark;
}

.theme-darker.dait-quick-settings-modal-root,
.theme-darker .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="darker"],
[data-dait-discord-theme="darker"] .dait-quick-settings-modal-root,
.theme-darker [data-dait-settings-modal="true"],
.theme-darker[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="darker"],
.theme-darker.dait-polish-result-panel,
.theme-darker .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="darker"] {
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #1f2128)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #242733));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #181b22))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #343a47));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #b2bac8) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #111318)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #171a21) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #dbdee1);
    --dait-heading: var(--header-primary, #f2f3f5);
    --dait-label: var(--header-secondary, #c7ccd6);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #b2bac8));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
    color: var(--dait-text);
    color-scheme: dark;
}

.theme-midnight.dait-quick-settings-modal-root,
.theme-midnight .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="midnight"] .dait-quick-settings-modal-root,
.theme-midnight [data-dait-settings-modal="true"],
.theme-midnight[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="midnight"],
.theme-midnight.dait-polish-result-panel,
.theme-midnight .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="midnight"] {
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #15171d)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #1a1d25));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #101218))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #2b303d));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #aeb7c7) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #0b0d12)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #10131a) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #f2f3f5);
    --dait-heading: var(--header-primary, #ffffff);
    --dait-label: var(--header-secondary, #d7ddea);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #aeb7c7));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-shadow: 0 18px 42px rgba(0, 0, 0, 0.36);
    color: var(--dait-text);
    color-scheme: dark;
}

.dait-settings {
    --dait-accent: var(--brand-500, #5865f2);
    --dait-accent-hover: var(--brand-560, #4752c4);
    --dait-success: #15a36d;
    --dait-danger: #d83c3e;
    --dait-focus: rgba(88, 101, 242, 0.3);
    --dait-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%23dbe1ee' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #252832)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #2a2e3a));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #20232c))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #3d4352));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #b9c1d0) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #171a22)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #1d222c) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #dbdee1);
    --dait-heading: var(--header-primary, #f2f3f5);
    --dait-label: var(--header-secondary, #c7ccd6);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #b9c1d0));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(180, 186, 199, 0.28));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(204, 209, 220, 0.48));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
    --dait-shadow: 0 14px 34px rgba(0, 0, 0, 0.2);
    color: var(--dait-text);
    display: grid;
    gap: 14px;
    max-width: 100%;
    min-width: 0;
    margin-left: auto;
    margin-right: auto;
    overflow: visible;
    padding: 2px 2px 22px;
    width: min(1208px, calc(100vw - 112px));
}

.theme-light.dait-settings,
.theme-light .dait-settings,
.dait-settings[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-settings {
    --dait-focus: rgba(88, 101, 242, 0.2);
    --dait-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%23232a38' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #ffffff)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #f2f3f5));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, #ebedef)));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #d7dce7));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #4f5660) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #f2f3f5)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #e3e5e8) 62%, #ffffff);
    --dait-text: #2e3338;
    --dait-heading: #1f232b;
    --dait-label: #2f3745;
    --dait-muted-readable: #5c6472;
    --dait-disabled-text: #6f7785;
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(76, 86, 106, 0.3));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(76, 86, 106, 0.48));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
    --dait-shadow: 0 14px 34px rgba(24, 36, 61, 0.12);
    color: var(--dait-text);
}

.theme-dark.dait-settings,
.theme-dark .dait-settings,
.dait-settings[data-dait-discord-theme="dark"],
[data-dait-discord-theme="dark"] .dait-settings {
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #313338)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #2b2d31));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #232428))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #3f4147));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #b5bac1) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #1e1f22)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #35373c) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #dbdee1);
    --dait-heading: var(--header-primary, #f2f3f5);
    --dait-label: var(--header-secondary, #c7ccd6);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #b5bac1));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-shadow: var(--elevation-high, 0 16px 40px rgba(0, 0, 0, 0.32));
    color: var(--dait-text);
}

.theme-darker.dait-settings,
.theme-darker .dait-settings,
.dait-settings[data-dait-discord-theme="darker"],
[data-dait-discord-theme="darker"] .dait-settings {
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #1f2128)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #242733));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #181b22))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #343a47));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #b2bac8) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #111318)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #171a21) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #dbdee1);
    --dait-heading: var(--header-primary, #f2f3f5);
    --dait-label: var(--header-secondary, #c7ccd6);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #b2bac8));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(176, 183, 196, 0.24));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(204, 210, 222, 0.42));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
    --dait-shadow: 0 16px 36px rgba(0, 0, 0, 0.28);
    color: var(--dait-text);
}

.theme-midnight.dait-settings,
.theme-midnight .dait-settings,
.dait-settings[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="midnight"] .dait-settings {
    --dait-card: var(--bg-base-primary, var(--background-base-low, var(--background-primary, #15171d)));
    --dait-card-raised: var(--background-surface-high, var(--background-secondary, #1a1d25));
    --dait-card-soft: var(--bg-base-tertiary, var(--background-base-lower, var(--background-secondary-alt, var(--background-tertiary, #101218))));
    --dait-border: var(--border-subtle, var(--background-modifier-accent, #2b303d));
    --dait-border-strong: color-mix(in srgb, var(--interactive-normal, #aeb7c7) 42%, var(--dait-border));
    --dait-control: var(--input-background, var(--background-base-lowest, var(--background-secondary, #0b0d12)));
    --dait-control-hover: color-mix(in srgb, var(--background-modifier-hover, #10131a) 68%, var(--dait-control));
    --dait-text: var(--text-normal, #f2f3f5);
    --dait-heading: var(--header-primary, #ffffff);
    --dait-label: var(--header-secondary, #d7ddea);
    --dait-muted-readable: var(--header-secondary, var(--text-muted, #aeb7c7));
    --dait-disabled-text: color-mix(in srgb, var(--dait-text) 54%, var(--dait-muted-readable));
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(175, 184, 200, 0.22));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(205, 212, 225, 0.38));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
    --dait-shadow: 0 18px 42px rgba(0, 0, 0, 0.36);
    color: var(--dait-text);
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
.dait-quick-settings-modal-root,
.dait-quick-settings-body,
.dait-polish-result-panel,
.dait-settings {
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(180, 186, 199, 0.28));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(204, 209, 220, 0.48));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
}

.theme-light [data-dait-settings-modal="true"],
.theme-light[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="light"],
.theme-light.dait-quick-settings-modal-root,
.theme-light .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-quick-settings-modal-root,
.theme-light.dait-quick-settings-body,
.theme-light .dait-quick-settings-body,
.dait-quick-settings-body[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-quick-settings-body,
.theme-light.dait-polish-result-panel,
.theme-light .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="light"] {
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(76, 86, 106, 0.3));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(76, 86, 106, 0.48));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
}

.theme-dark [data-dait-settings-modal="true"],
.theme-dark[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="dark"],
.theme-dark.dait-quick-settings-modal-root,
.theme-dark .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="dark"],
[data-dait-discord-theme="dark"] .dait-quick-settings-modal-root,
.theme-dark.dait-quick-settings-body,
.theme-dark .dait-quick-settings-body,
.dait-quick-settings-body[data-dait-discord-theme="dark"],
[data-dait-discord-theme="dark"] .dait-quick-settings-body,
.theme-dark.dait-polish-result-panel,
.theme-dark .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="dark"] {
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(180, 186, 199, 0.28));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(204, 209, 220, 0.48));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
}

.theme-darker [data-dait-settings-modal="true"],
.theme-darker[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="darker"],
.theme-darker.dait-quick-settings-modal-root,
.theme-darker .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="darker"],
[data-dait-discord-theme="darker"] .dait-quick-settings-modal-root,
.theme-darker.dait-quick-settings-body,
.theme-darker .dait-quick-settings-body,
.dait-quick-settings-body[data-dait-discord-theme="darker"],
[data-dait-discord-theme="darker"] .dait-quick-settings-body,
.theme-darker.dait-polish-result-panel,
.theme-darker .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="darker"] {
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(176, 183, 196, 0.24));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(204, 210, 222, 0.42));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
}

.theme-midnight [data-dait-settings-modal="true"],
.theme-midnight[data-dait-settings-modal="true"],
[data-dait-settings-modal="true"][data-dait-discord-theme="midnight"],
.theme-midnight.dait-quick-settings-modal-root,
.theme-midnight .dait-quick-settings-modal-root,
.dait-quick-settings-modal-root[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="midnight"] .dait-quick-settings-modal-root,
.theme-midnight.dait-quick-settings-body,
.theme-midnight .dait-quick-settings-body,
.dait-quick-settings-body[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="midnight"] .dait-quick-settings-body,
.theme-midnight.dait-polish-result-panel,
.theme-midnight .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="midnight"] {
    --dait-scrollbar-thumb: var(--scrollbar-thin-thumb, rgba(175, 184, 200, 0.22));
    --dait-scrollbar-thumb-hover: var(--scrollbar-auto-thumb, rgba(205, 212, 225, 0.38));
    --dait-scrollbar-track: var(--scrollbar-thin-track, transparent);
}

[data-dait-settings-modal="true"],
.dait-quick-settings-body,
.dait-settings-sidebar,
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
.dait-settings-sidebar::-webkit-scrollbar,
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
.dait-settings-sidebar::-webkit-scrollbar-track,
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
.dait-settings-sidebar::-webkit-scrollbar-thumb,
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
.dait-settings-sidebar::-webkit-scrollbar-thumb:hover,
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
.dait-settings-sidebar::-webkit-scrollbar-corner,
.dait-settings-row textarea::-webkit-scrollbar-corner,
.dait-prompt-editor textarea::-webkit-scrollbar-corner,
.dait-test-panel textarea::-webkit-scrollbar-corner,
.dait-test-output::-webkit-scrollbar-corner,
.dait-polish-result-output::-webkit-scrollbar-corner {
    background: transparent;
}

.dait-quick-settings-modal-root {
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

.dait-translation-line {
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

.dait-settings h2,
.dait-settings h3,
.dait-settings p {
    margin: 0;
}

.dait-settings-hero {
    align-items: center;
    background: var(--dait-card-raised);
    border: 1px solid var(--dait-border);
    border-radius: 12px;
    box-shadow: var(--dait-shadow);
    display: grid;
    gap: 14px;
    grid-template-columns: 50px minmax(0, 1fr);
    padding: 16px;
    position: relative;
    overflow: hidden;
}

.dait-settings-hero::before {
    background: linear-gradient(90deg, var(--dait-accent), var(--dait-success));
    content: "";
    height: 3px;
    left: 0;
    opacity: 0.86;
    position: absolute;
    right: 0;
    top: 0;
}

.dait-settings-mark {
    align-items: center;
    background: linear-gradient(145deg, var(--dait-accent), var(--dait-success));
    border-radius: 12px;
    color: #ffffff;
    display: flex;
    font-size: 15px;
    font-weight: 850;
    height: 50px;
    justify-content: center;
    letter-spacing: 0;
    width: 50px;
}

.dait-settings-copy {
    display: grid;
    gap: 8px;
    min-width: 0;
}

.dait-settings-copy h2 {
    color: var(--dait-heading);
    font-size: 20px;
    font-weight: 760;
    line-height: 1.2;
}

.dait-note {
    color: var(--dait-muted-readable);
    font-size: 12px;
    line-height: 1.55;
}

.dait-settings-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
}

.dait-settings-chips span {
    background: var(--dait-card-soft);
    border: 1px solid var(--dait-border);
    border-radius: 999px;
    color: var(--dait-text);
    font-size: 12px;
    font-weight: 650;
    line-height: 1;
    padding: 6px 8px;
}

.dait-settings-chips span.dait-settings-version {
    border-color: var(--dait-accent, #5865f2);
    color: var(--dait-accent, #5865f2);
    font-variant-numeric: tabular-nums;
}

.dait-settings-layout {
    align-items: start;
    display: grid;
    gap: 14px;
    grid-template-columns: 220px minmax(0, 1fr);
    min-width: 0;
}

.dait-settings-sidebar {
    background: var(--dait-card-soft);
    border: 1px solid var(--dait-border);
    border-radius: 10px;
    display: grid;
    gap: 10px;
    max-height: min(72vh, 720px);
    min-width: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px;
    position: sticky;
    top: 12px;
    z-index: 3;
}

.dait-settings-nav-list {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.dait-settings-nav-button {
    align-items: center;
    background: color-mix(in srgb, var(--dait-card-soft) 82%, var(--dait-card) 18%);
    border: 1px solid color-mix(in srgb, var(--dait-border) 60%, transparent);
    border-radius: 7px;
    color: var(--dait-muted-readable);
    cursor: pointer;
    display: flex;
    font-size: 12px;
    font-weight: 750;
    justify-content: flex-start;
    line-height: 1.25;
    min-height: 38px;
    overflow-wrap: anywhere;
    padding: 9px 10px;
    text-align: left;
    transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease;
    width: 100%;
}

.dait-settings-nav-secondary {
    background: transparent;
    border-color: transparent;
    color: var(--dait-muted-readable);
    font-size: 11px;
    font-weight: 690;
    min-height: 30px;
    padding: 6px 9px 6px 22px;
}

.dait-settings-nav-button:hover {
    background: var(--dait-control-hover);
    border-color: var(--dait-border);
    color: var(--dait-text);
}

.dait-settings-nav-active {
    background: var(--dait-card);
    border-color: var(--dait-border-strong);
    color: var(--dait-heading);
}

.dait-settings-sidebar-reset {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--dait-danger) 60%, var(--dait-border));
    border-radius: 8px;
    color: var(--dait-danger);
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1.2;
    margin-top: 6px;
    min-height: 36px;
    padding: 9px 10px;
    text-align: left;
    width: 100%;
}

.dait-settings-sidebar-reset:hover {
    background: color-mix(in srgb, var(--dait-danger) 12%, transparent);
}

.dait-settings-page {
    display: grid;
    gap: 14px;
    min-width: 0;
}

.dait-settings-section {
    background: var(--dait-card);
    border: 1px solid var(--dait-border);
    border-radius: 10px;
    box-shadow: 0 10px 26px rgba(0, 0, 0, 0.12);
    display: grid;
    gap: 14px;
    grid-template-columns: 1fr;
    min-width: 0;
    padding: 16px 18px;
    scroll-margin-top: 22px;
}

.dait-settings-section-active {
    border-color: color-mix(in srgb, var(--dait-accent) 34%, var(--dait-border));
}

.dait-provider-summary {
    background: var(--dait-card-soft);
    border: 1px solid var(--dait-border);
    border-radius: 8px;
    color: var(--dait-text);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.45;
    padding: 10px 12px;
    width: 100%;
}

.dait-provider-settings-block {
    border-top: 1px solid var(--dait-border);
    display: grid;
    gap: 12px;
    min-width: 0;
    padding-top: 4px;
}

.dait-provider-settings-header {
    display: grid;
    gap: 4px;
    min-width: 0;
}

.dait-provider-settings-title {
    color: var(--dait-heading);
    font-size: 13px;
    font-weight: 760;
    line-height: 1.25;
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-settings-section h3,
.dait-settings-section > .dait-note {
    grid-column: 1 / -1;
}

.dait-settings-section h3 {
    color: var(--dait-heading);
    font-size: 15px;
    font-weight: 760;
    letter-spacing: 0;
    line-height: 1.2;
}

.dait-settings-row {
    background: var(--dait-card-raised);
    border: 1px solid var(--dait-border);
    border-radius: 10px;
    display: grid;
    gap: 8px;
    min-width: 0;
    overflow: visible;
    padding: 13px;
    transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}

.dait-settings-row:focus-within {
    border-color: var(--dait-border-strong);
    box-shadow: 0 0 0 2px var(--dait-focus);
}

.dait-settings-row-wide {
    grid-column: 1 / -1;
}

.dait-settings-row-checkbox {
    align-items: center;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
        "label toggle"
        "desc toggle";
    column-gap: 14px;
    min-height: 58px;
}

.dait-settings-row > span {
    color: var(--dait-label);
    font-size: 12px;
    font-weight: 720;
    letter-spacing: 0;
    text-transform: none;
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: normal;
}

.dait-settings-row-checkbox > span {
    grid-area: label;
}

.dait-row-description {
    color: var(--dait-muted-readable);
    font-size: 12px;
    line-height: 1.55;
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-settings-row-checkbox > .dait-row-description {
    grid-area: desc;
}

.dait-settings-row input[type='text'],
.dait-settings-row input[type='password'],
.dait-settings-row input[type='number'],
.dait-settings-row select,
.dait-settings-row textarea,
.dait-prompt-editor textarea,
.dait-prompt-tools input,
.dait-prompt-tools select,
.dait-test-panel textarea,
.dait-test-panel select {
    background-color: var(--dait-control);
    border: 1px solid var(--dait-border);
    border-radius: 8px;
    color: var(--dait-text);
    font-size: 13px;
    font-weight: 560;
    line-height: 20px;
    min-height: 42px;
    max-width: 100%;
    min-width: 0;
    outline: none;
    padding: 10px 12px;
    width: 100%;
}

.dait-settings-row select {
    appearance: none;
    background-image: var(--dait-arrow);
    background-position: right 12px center;
    background-repeat: no-repeat;
    background-size: 18px 18px;
    cursor: pointer;
    padding-right: 42px;
}

.dait-prompt-tools select {
    appearance: none;
    background-image: var(--dait-arrow);
    background-position: right 12px center;
    background-repeat: no-repeat;
    background-size: 18px 18px;
    cursor: pointer;
    padding-right: 42px;
}

.dait-test-panel select {
    appearance: none;
    background-image: var(--dait-arrow);
    background-position: right 12px center;
    background-repeat: no-repeat;
    background-size: 18px 18px;
    cursor: pointer;
    padding-right: 42px;
}

.dait-settings-row input:hover,
.dait-settings-row select:hover,
.dait-settings-row textarea:hover,
.dait-prompt-editor textarea:hover,
.dait-prompt-tools input:hover,
.dait-prompt-tools select:hover,
.dait-test-panel textarea:hover,
.dait-test-panel select:hover {
    background-color: var(--dait-control-hover);
    border-color: var(--interactive-normal, var(--dait-border-strong));
}

.dait-settings-row input:focus,
.dait-settings-row select:focus,
.dait-settings-row textarea:focus,
.dait-prompt-editor textarea:focus,
.dait-prompt-tools input:focus,
.dait-prompt-tools select:focus,
.dait-test-panel textarea:focus,
.dait-test-panel select:focus {
    border-color: var(--dait-accent);
    box-shadow: 0 0 0 2px var(--dait-focus);
}

.dait-settings-row textarea {
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    line-height: 1.45;
    max-width: 100%;
    min-height: 112px;
    overflow-x: auto;
    resize: vertical;
    white-space: pre-wrap;
    word-break: break-word;
}

.dait-settings-row input:disabled,
.dait-settings-row select:disabled,
.dait-settings-row textarea:disabled,
.dait-prompt-editor textarea:disabled,
.dait-prompt-tools input:disabled,
.dait-prompt-tools select:disabled,
.dait-test-panel textarea:disabled,
.dait-test-panel select:disabled {
    background-color: color-mix(in srgb, var(--dait-control) 76%, var(--dait-card) 24%);
    border-color: var(--dait-border);
    color: var(--dait-disabled-text);
    cursor: not-allowed;
    opacity: 1;
    -webkit-text-fill-color: var(--dait-disabled-text);
}

.dait-settings-row input[type='checkbox'] {
    appearance: none;
    background: var(--dait-control);
    border: 1px solid var(--dait-border-strong);
    border-radius: 999px;
    cursor: pointer;
    flex: 0 0 auto;
    grid-area: toggle;
    height: 24px;
    justify-self: end;
    position: relative;
    transition: background 140ms ease, border-color 140ms ease;
    width: 44px;
}

.dait-settings-row input[type='checkbox']::after {
    background: var(--text-muted, #b5bac1);
    border-radius: 999px;
    content: "";
    height: 18px;
    left: 2px;
    position: absolute;
    top: 2px;
    transition: left 140ms ease, background 140ms ease;
    width: 18px;
}

.dait-settings-row input[type='checkbox']:checked {
    background: color-mix(in srgb, var(--dait-success) 28%, var(--dait-control));
    border-color: var(--dait-success);
}

.dait-settings-row input[type='checkbox']:checked::after {
    background: var(--dait-success);
    left: 22px;
}

.dait-language-controls {
    display: grid;
    gap: 8px;
    min-width: 0;
}

.dait-language-custom[hidden] {
    display: none;
}

.dait-api-key-row {
    align-items: start;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
        "label status"
        "desc status"
        "control control";
}

.dait-api-key-row > .dait-row-label {
    grid-area: label;
}

.dait-api-key-row > .dait-row-description {
    grid-area: desc;
}

.dait-api-controls {
    display: grid;
    gap: 8px;
    grid-area: control;
    grid-template-columns: minmax(0, 1fr) max-content;
    min-width: 0;
}

.dait-settings-row > .dait-api-status {
    align-self: start;
    border: 1px solid var(--dait-border);
    border-radius: 999px;
    color: var(--dait-muted-readable);
    font-size: 11px;
    font-weight: 760;
    grid-area: status;
    line-height: 1;
    max-width: 120px;
    overflow: hidden;
    padding: 5px 8px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-settings-row > .dait-api-status-success {
    background: color-mix(in srgb, var(--dait-success) 14%, transparent);
    border-color: color-mix(in srgb, var(--dait-success) 62%, var(--dait-border));
    color: var(--dait-success);
}

.dait-settings-row > .dait-api-status-failed {
    background: color-mix(in srgb, var(--dait-danger) 12%, transparent);
    border-color: color-mix(in srgb, var(--dait-danger) 62%, var(--dait-border));
    color: var(--dait-danger);
}

.dait-settings-row > .dait-api-status-testing {
    background: color-mix(in srgb, var(--dait-accent) 12%, transparent);
    border-color: color-mix(in srgb, var(--dait-accent) 52%, var(--dait-border));
    color: var(--dait-text);
}

.dait-hotkey-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
}

.dait-cache-actions,
.dait-diagnostic-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
}

.dait-diagnostic-summary {
    display: grid;
    gap: 10px;
    min-width: 0;
}

.dait-diagnostic-summary-group {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.dait-diagnostic-summary-title {
    color: var(--dait-label);
    font-size: 11px;
    font-weight: 760;
    line-height: 1.25;
}

.dait-diagnostic-summary-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
}

.dait-diagnostic-chip,
.dait-diagnostic-summary-empty {
    background: color-mix(in srgb, var(--dait-control) 78%, transparent);
    border: 1px solid var(--dait-border);
    border-radius: 999px;
    color: var(--dait-muted-readable);
    font-size: 11px;
    font-weight: 650;
    line-height: 1.25;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 4px 8px;
}

.dait-diagnostic-summary-empty {
    justify-self: start;
}

.dait-hotkey-recorder {
    min-width: 136px;
}

.dait-test-mode-section {
    border-color: color-mix(in srgb, var(--dait-accent) 30%, var(--dait-border));
}

.dait-test-panel {
    display: grid;
    gap: 14px;
    grid-column: 1 / -1;
    min-width: 0;
}

.dait-test-toolbar {
    align-items: center;
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(160px, 220px) minmax(0, 1fr);
    min-width: 0;
}

.dait-test-config {
    color: var(--dait-muted-readable);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.45;
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-test-block {
    display: grid;
    gap: 8px;
    min-width: 0;
}

.dait-test-block-header {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-width: 0;
}

.dait-test-block-header > span {
    color: var(--dait-label);
    font-size: 12px;
    font-weight: 760;
}

.dait-test-block-header-compact .dait-small-button {
    min-height: 30px;
    padding: 0 9px;
}

.dait-test-panel textarea {
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    line-height: 1.5;
    min-height: 118px;
    resize: vertical;
    white-space: pre-wrap;
    word-break: break-word;
}

.dait-test-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
}

.dait-test-output {
    background: var(--dait-control);
    border: 1px solid var(--dait-border);
    border-radius: 8px;
    color: var(--dait-text);
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    font-size: 13px;
    line-height: 1.55;
    margin: 0;
    min-height: 118px;
    overflow: auto;
    padding: 12px;
    white-space: pre-wrap;
    word-break: break-word;
}

.dait-prompt-manager {
    background: transparent;
    border: 0;
    border-radius: 0;
    display: grid;
    gap: 10px;
    grid-column: 1 / -1;
    min-width: 0;
    overflow: visible;
    padding: 2px 0 0;
}

.dait-prompt-manager-header {
    display: grid;
    gap: 5px;
}

.dait-prompt-manager-header > span {
    color: var(--dait-label);
    font-size: 12px;
    font-weight: 760;
}

.dait-prompt-tools {
    align-items: center;
    display: grid;
    gap: 8px;
    grid-template-columns: minmax(120px, 0.8fr) minmax(190px, 1.2fr);
    min-width: 0;
}

.dait-prompt-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    grid-column: 1 / -1;
    min-width: 0;
}

.dait-prompt-editor {
    display: grid;
    gap: 8px;
    min-width: 0;
}

.dait-prompt-editor > span {
    color: var(--dait-label);
    font-size: 12px;
    font-weight: 760;
}

.dait-prompt-editor textarea {
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    line-height: 1.45;
    max-width: 100%;
    min-height: 128px;
    overflow-x: auto;
    resize: vertical;
    white-space: pre-wrap;
    word-break: break-word;
}

.dait-prompt-tools input,
.dait-prompt-tools select {
    min-width: 0;
}

.dait-prompt-actions .dait-small-button {
    min-height: 36px;
}

.dait-small-button {
    align-items: center;
    background: var(--dait-control);
    border: 1px solid var(--dait-border);
    border-radius: 8px;
    color: var(--dait-text);
    cursor: pointer;
    display: inline-flex;
    font-size: 12px;
    font-weight: 720;
    justify-content: center;
    line-height: 1.2;
    min-height: 42px;
    white-space: nowrap;
    padding: 0 11px;
}

.dait-small-button:hover {
    background: var(--dait-control-hover);
    border-color: var(--interactive-normal, var(--dait-border-strong));
}

.dait-small-button-danger {
    border-color: color-mix(in srgb, var(--dait-danger) 62%, var(--dait-border));
    color: var(--dait-danger);
}

.dait-polish-button,
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

.dait-input-action-menu {
    background: color-mix(in srgb, var(--background-floating, #111214) 96%, transparent);
    border: 1px solid color-mix(in srgb, var(--background-modifier-accent, #4e5058) 82%, transparent);
    border-radius: 8px;
    box-shadow: var(--elevation-high, 0 10px 24px rgba(0, 0, 0, 0.28));
    display: grid;
    gap: 3px;
    padding: 6px;
    position: fixed;
    z-index: 10000;
}

.dait-input-action-menu-item {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--interactive-normal, var(--text-normal, #dbdee1));
    cursor: pointer;
    display: flex;
    font-size: 13px;
    font-weight: 650;
    justify-content: flex-start;
    min-height: 32px;
    padding: 0 10px;
    text-align: left;
    white-space: nowrap;
}

.dait-input-action-menu-item:hover,
.dait-input-action-menu-item:focus-visible {
    background: color-mix(in srgb, var(--brand-500, #5865f2) 18%, var(--background-modifier-hover, rgba(79, 84, 92, 0.18)));
    color: var(--interactive-hover, var(--text-normal, #ffffff));
    outline: none;
}

.theme-light.dait-input-action-menu,
.theme-light .dait-input-action-menu,
.dait-input-action-menu[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-input-action-menu {
    background: rgba(255, 255, 255, 0.98);
    border-color: rgba(79, 84, 92, 0.2);
    box-shadow: var(--elevation-high, 0 10px 24px rgba(0, 0, 0, 0.16));
}

.theme-light .dait-input-action-menu-item,
.dait-input-action-menu[data-dait-discord-theme="light"] .dait-input-action-menu-item,
[data-dait-discord-theme="light"] .dait-input-action-menu-item {
    color: var(--interactive-normal, #4f5660);
}

.theme-light .dait-input-action-menu-item:hover,
.theme-light .dait-input-action-menu-item:focus-visible,
.dait-input-action-menu[data-dait-discord-theme="light"] .dait-input-action-menu-item:hover,
.dait-input-action-menu[data-dait-discord-theme="light"] .dait-input-action-menu-item:focus-visible,
[data-dait-discord-theme="light"] .dait-input-action-menu-item:hover,
[data-dait-discord-theme="light"] .dait-input-action-menu-item:focus-visible {
    background: rgba(88, 101, 242, 0.14);
    color: var(--interactive-hover, #2e3338);
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

.dait-polish-result-panel {
    background: color-mix(in srgb, var(--background-secondary, #2b2d31) 94%, #000000);
    border: 1px solid color-mix(in srgb, var(--background-modifier-accent, #4e5058) 72%, transparent);
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.34);
    color: var(--text-normal, #dbdee1);
    display: grid;
    gap: 7px;
    max-height: min(34vh, 260px);
    min-width: 240px;
    padding: 9px;
    position: fixed;
    z-index: 10000;
}

.theme-light.dait-polish-result-panel,
.theme-light .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="light"],
[data-dait-discord-theme="light"] .dait-polish-result-panel {
    background: rgba(255, 255, 255, 0.98);
    border-color: rgba(79, 84, 92, 0.22);
    box-shadow: 0 12px 32px rgba(24, 36, 61, 0.16);
    color: #242832;
}

.theme-dark.dait-polish-result-panel,
.theme-dark .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="dark"],
[data-dait-discord-theme="dark"] .dait-polish-result-panel {
    background: color-mix(in srgb, var(--background-secondary, #2b2d31) 94%, #000000);
    border-color: color-mix(in srgb, var(--background-modifier-accent, #4e5058) 72%, transparent);
    color: var(--text-normal, #dbdee1);
}

.theme-darker.dait-polish-result-panel,
.theme-darker .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="darker"],
[data-dait-discord-theme="darker"] .dait-polish-result-panel {
    background: var(--background-surface-high, var(--background-secondary, #1e1f22));
    border-color: rgba(255, 255, 255, 0.09);
    color: var(--text-normal, #dbdee1);
}

.theme-midnight.dait-polish-result-panel,
.theme-midnight .dait-polish-result-panel,
.dait-polish-result-panel[data-dait-discord-theme="midnight"],
[data-dait-discord-theme="midnight"] .dait-polish-result-panel {
    background: var(--background-surface-high, var(--background-secondary, #101114));
    border-color: rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.48);
    color: var(--text-normal, #f2f3f5);
}

.dait-polish-result-header {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
    min-width: 0;
}

.dait-polish-result-title {
    color: var(--header-primary, currentColor);
    font-size: 12px;
    font-weight: 760;
    line-height: 1.2;
    min-width: 0;
}

.dait-polish-result-icon {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 5px;
    color: var(--interactive-normal, #b5bac1);
    cursor: pointer;
    display: inline-flex;
    font-size: 16px;
    height: 24px;
    justify-content: center;
    line-height: 1;
    padding: 0;
    width: 24px;
}

.dait-polish-result-icon:hover {
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.08));
    color: var(--interactive-hover, #ffffff);
}

.dait-polish-result-output {
    background: color-mix(in srgb, var(--background-tertiary, #1e1f22) 86%, transparent);
    border: 1px solid color-mix(in srgb, var(--background-modifier-accent, #4e5058) 70%, transparent);
    border-radius: 7px;
    color: var(--text-normal, #dbdee1);
    font: inherit;
    line-height: 1.45;
    max-height: min(18vh, 150px);
    overflow: auto;
    padding: 8px 10px;
    white-space: pre-wrap;
    word-break: break-word;
}

.theme-light .dait-polish-result-output,
.dait-polish-result-panel[data-dait-discord-theme="light"] .dait-polish-result-output,
[data-dait-discord-theme="light"] .dait-polish-result-output {
    background: #f6f8fc;
    border-color: rgba(79, 84, 92, 0.18);
    color: #242832;
}

.theme-darker .dait-polish-result-output,
.dait-polish-result-panel[data-dait-discord-theme="darker"] .dait-polish-result-output,
[data-dait-discord-theme="darker"] .dait-polish-result-output,
.theme-midnight .dait-polish-result-output,
.dait-polish-result-panel[data-dait-discord-theme="midnight"] .dait-polish-result-output,
[data-dait-discord-theme="midnight"] .dait-polish-result-output {
    background: color-mix(in srgb, var(--background-tertiary, #111318) 88%, transparent);
    border-color: rgba(255, 255, 255, 0.09);
}

.dait-polish-result-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
}

.dait-polish-result-action {
    background: var(--background-modifier-hover, rgba(255, 255, 255, 0.08));
    border: 1px solid color-mix(in srgb, var(--background-modifier-accent, #4e5058) 70%, transparent);
    border-radius: 6px;
    color: var(--text-normal, #dbdee1);
    cursor: pointer;
    font-size: 12px;
    font-weight: 720;
    line-height: 1;
    min-height: 30px;
    padding: 7px 10px;
}

.dait-polish-result-action.primary {
    background: var(--brand-500, #5865f2);
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 72%, transparent);
    color: #ffffff;
}

.dait-polish-result-action:hover {
    border-color: color-mix(in srgb, var(--brand-500, #5865f2) 52%, var(--background-modifier-accent, #4e5058));
}

.dait-message-button {
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

module.exports = { PLUGIN_CSS };
