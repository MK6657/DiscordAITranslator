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

`;
