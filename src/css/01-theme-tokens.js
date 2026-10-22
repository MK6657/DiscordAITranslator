"use strict";

module.exports = `
/* BetterDiscord's plugin-settings modal, marked by applySettingsModalSizing: a moderate window, not a full-width sheet. */
[data-dait-settings-modal="true"] {
    box-sizing: border-box !important;
    margin-left: auto !important;
    margin-right: auto !important;
    max-height: min(760px, calc(100vh - 64px)) !important;
    max-width: min(920px, calc(100vw - 48px)) !important;
    width: min(920px, calc(100vw - 48px)) !important;
}

/* Only the outermost marked node (the modal frame) gets that width. The marked nodes inside it (the padded content
   scroller, BetterDiscord's .bd-addon-settings-wrap) fill their parent, so the panel stays clear of the scroller's
   padding and scrollbar. */
[data-dait-settings-modal="true"] [data-dait-settings-modal="true"] {
    margin-left: 0 !important;
    margin-right: 0 !important;
    max-width: 100% !important;
    width: auto !important;
}

[data-dait-settings-modal-root="true"] {
    margin-bottom: clamp(16px, 4vh, 32px) !important;
    margin-top: clamp(16px, 4vh, 32px) !important;
}

/* The plugin's own windows: the settings panel (in BetterDiscord's modal and in the launcher's window), the
   launcher's window frame, the quick panel, the polish result panel, the composer's action menu and the content of
   the confirmation dialogs. Their colours come only from the two palettes below, picked by data-dait-panel-theme
   (set by applyPanelTheme from ui.panelTheme; "auto" follows Discord's light or dark theme). Nothing here reads a
   Discord colour variable, so a part of Discord themed differently from the page cannot mix into these windows.
   Chat translation lines and the message/composer buttons live inside Discord's UI and keep Discord's colours. */
.dait-settings,
.dait-quick-settings-modal-root,
.dait-quick-popover,
.dait-polish-result-panel,
.dait-input-action-menu,
.dait-dialog {
    /* One type scale for every window: body 15/1.55 for everything that is not a heading; small 13 only for the
       version chip, the search box's hint and status badges next to a title. Weights 400/500/600. */
    --dait-font-window: 18px;
    --dait-font-page: 20px;
    --dait-font-group: 16px;
    --dait-font-body: 15px;
    --dait-font-small: 13px;
    --dait-line: 1.55;
    --dait-font-family: var(--font-primary, "gg sans", "Noto Sans", "Microsoft YaHei", "Helvetica Neue", Helvetica, Arial, sans-serif);
    /* 4/8 spacing grid, radii and the shared control size. */
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
    --dait-control-h: 36px;
    /* Derived from the palette: hover of filled buttons, the switch track when off, scrollbars. */
    --dait-brand-hover: color-mix(in srgb, var(--dait-brand) 86%, #000000);
    --dait-raised-hover: color-mix(in srgb, var(--dait-raised) 88%, var(--dait-text));
    --dait-switch-off: color-mix(in srgb, var(--dait-placeholder) 78%, var(--dait-bg));
    --dait-scrollbar-thumb: color-mix(in srgb, var(--dait-placeholder) 55%, transparent);
    --dait-scrollbar-thumb-hover: color-mix(in srgb, var(--dait-placeholder) 80%, transparent);
    --dait-scrollbar-track: transparent;
    color: var(--dait-text);
    font-family: var(--dait-font-family);
    font-size: var(--dait-font-body);
    font-weight: 400;
    letter-spacing: 0;
    line-height: var(--dait-line);
}

/* Dark palette (also the default for a window that has not been given a theme yet). */
[data-dait-panel-theme="dark"],
:is(.dait-settings, .dait-quick-settings-modal-root, .dait-quick-popover, .dait-polish-result-panel, .dait-input-action-menu, .dait-dialog):not([data-dait-panel-theme]) {
    --dait-bg: #2b2d31;
    --dait-rail: #232428;
    --dait-surface: #313338;
    --dait-raised: #383a40;
    --dait-input-bg: #1e1f22;
    /* Control edges (inputs, selects, segmented controls, secondary buttons) reach 3:1 against the window, rail and
       card surfaces (WCAG 1.4.11); the spec's #4e5058 reached 1.6-1.9:1. */
    --dait-input-border: #7a7e86;
    --dait-divider: #3f4147;
    --dait-text: #e3e5e8;
    --dait-heading: #f2f3f5;
    --dait-placeholder: #949ba4;
    --dait-brand: #4f5bd5;
    --dait-on-fill: #ffffff;
    --dait-link: #a4abf8;
    --dait-focus: #6f79e8;
    --dait-success-fill: #3ba55d;
    --dait-success: #6ccf8e;
    --dait-warning-fill: #f0b232;
    --dait-warning: #f5c55c;
    --dait-danger-fill: #da373c;
    --dait-danger: #ff8a8e;
    --dait-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    --dait-backdrop: rgba(0, 0, 0, 0.5);
    color-scheme: dark;
}

/* Light palette. */
[data-dait-panel-theme="light"] {
    --dait-bg: #ffffff;
    --dait-rail: #f2f3f5;
    --dait-surface: #f6f7f8;
    --dait-raised: #ebedef;
    --dait-input-bg: #ffffff;
    /* White inputs sit on the white window: their edge is the only thing that shows them, so it reaches 3:1 on the
       window, rail and card surfaces (WCAG 1.4.11); the spec's #c4c9ce reached 1.5-1.7:1. */
    --dait-input-border: #868a91;
    --dait-divider: #e3e5e8;
    --dait-text: #2e3035;
    --dait-heading: #1f2124;
    --dait-placeholder: #6d6f78;
    --dait-brand: #4f5bd5;
    --dait-on-fill: #ffffff;
    --dait-link: #3c45a5;
    --dait-focus: #4f5bd5;
    --dait-success-fill: #248046;
    --dait-success: #1a7f45;
    --dait-warning-fill: #c7860d;
    --dait-warning: #8a5a00;
    --dait-danger-fill: #da373c;
    --dait-danger: #c42b2f;
    --dait-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
    --dait-backdrop: rgba(0, 0, 0, 0.36);
    color-scheme: light;
}

/* BetterDiscord's modal frame is Discord's own element: it keeps Discord's colours, and its scrollbar is a neutral
   grey that reads on light and dark frames. */
[data-dait-settings-modal="true"] {
    --dait-scrollbar-thumb: rgba(128, 132, 142, 0.45);
    --dait-scrollbar-thumb-hover: rgba(128, 132, 142, 0.7);
    --dait-scrollbar-track: transparent;
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
.dait-message-button,
.dait-input-action-menu,
.dait-input-action-menu *,
.dait-dialog,
.dait-dialog * {
    box-sizing: border-box;
}

/* Scrollbars: Chromium (Discord) draws them with the ::-webkit-scrollbar rules below, an 8 px rounded thumb without
   arrow buttons. A non-auto scrollbar-width or scrollbar-color switches those rules off (Chromium 121+), so the
   standard properties only apply where ::-webkit-scrollbar does not exist. */
@supports not selector(::-webkit-scrollbar) {
    [data-dait-settings-modal="true"],
    .dait-quick-settings-body,
    .dait-settings-rail,
    .dait-settings-content,
    .dait-settings-row textarea,
    .dait-prompt-editor textarea,
    .dait-prompt-preview,
    .dait-polish-result-output {
        scrollbar-color: var(--dait-scrollbar-thumb) var(--dait-scrollbar-track);
        scrollbar-width: thin;
    }
}

[data-dait-settings-modal="true"]::-webkit-scrollbar,
.dait-quick-settings-body::-webkit-scrollbar,
.dait-settings-rail::-webkit-scrollbar,
.dait-settings-content::-webkit-scrollbar,
.dait-settings-row textarea::-webkit-scrollbar,
.dait-prompt-editor textarea::-webkit-scrollbar,
.dait-prompt-preview::-webkit-scrollbar,
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
.dait-prompt-preview::-webkit-scrollbar-track,
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
.dait-prompt-preview::-webkit-scrollbar-thumb,
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
.dait-prompt-preview::-webkit-scrollbar-thumb:hover,
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
.dait-prompt-preview::-webkit-scrollbar-corner,
.dait-polish-result-output::-webkit-scrollbar-corner {
    background: transparent;
}

/* Icons in icon buttons (the settings window's and the polish panel's close): an SVG shape painted in the button's
   text colour, 18 px like the quick panel's icons, instead of a text glyph outside the type scale. */
.dait-icon {
    background: currentColor;
    display: block;
    flex: 0 0 auto;
    height: 18px;
    -webkit-mask: var(--dait-icon-image) center / 18px 18px no-repeat;
    mask: var(--dait-icon-image) center / 18px 18px no-repeat;
    width: 18px;
}

.dait-icon-close {
    --dait-icon-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E");
}

/* One visible focus ring for every control in these surfaces. */
.dait-settings :focus-visible,
.dait-quick-settings-modal-root :focus-visible,
.dait-polish-result-panel :focus-visible,
.dait-input-action-menu :focus-visible,
.dait-dialog :focus-visible {
    outline: 2px solid var(--dait-focus);
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .dait-settings,
    .dait-settings *,
    .dait-quick-settings-modal-root,
    .dait-quick-settings-modal-root *,
    .dait-polish-result-panel,
    .dait-polish-result-panel *,
    .dait-input-action-menu,
    .dait-input-action-menu * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition: none !important;
    }
}

`;
