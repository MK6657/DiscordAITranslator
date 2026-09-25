"use strict";

module.exports = `
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

`;
