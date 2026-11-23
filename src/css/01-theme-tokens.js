"use strict";

const { createPixelSvgDataUri } = require("../ui/pixel-icons");
const PIXEL_CLOSE_ICON = createPixelSvgDataUri("close", "#000000");

module.exports = `
/* BetterDiscord's plugin-settings modal, marked by applySettingsModalSizing: a moderate window, not a full-width sheet. */
[data-dait-settings-modal="true"] {
    box-sizing: border-box !important;
    margin-left: auto !important;
    margin-right: auto !important;
    max-height: min(760px, calc(100vh - 64px)) !important;
    max-width: min(920px, calc(100vw - 48px), var(--dait-dynamic-max-w, 100vw)) !important;
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
.dait-polish-preset-menu,
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
    /* 4/8 spacing grid, crisp voxel/pixel radii (2px) and shared control size. */
    --dait-space-1: 4px;
    --dait-space-2: 8px;
    --dait-space-3: 12px;
    --dait-space-4: 16px;
    --dait-space-5: 24px;
    --dait-space-6: 28px;
    --dait-radius-control: 2px;
    --dait-radius-card: 2px;
    --dait-radius-pill: 2px;
    --dait-control-w: 240px;
    --dait-control-h: 36px;
    /* Derived from the palette: hover of filled buttons, switch off-track, voxel shadows, pixel scrollbars. */
    --dait-brand-hover: color-mix(in srgb, var(--dait-brand) 86%, #000000);
    --dait-raised-hover: color-mix(in srgb, var(--dait-raised) 88%, var(--dait-text));
    --dait-switch-off: color-mix(in srgb, var(--dait-placeholder) 78%, var(--dait-bg));
    --dait-scrollbar-thumb: color-mix(in srgb, var(--dait-placeholder) 55%, transparent);
    --dait-scrollbar-thumb-hover: color-mix(in srgb, var(--dait-placeholder) 80%, transparent);
    --dait-scrollbar-track: transparent;
    --dait-pixel-shadow-sm: 2px 2px 0 var(--dait-pixel-shadow);
    --dait-pixel-shadow-md: 4px 4px 0 var(--dait-pixel-shadow);
    --dait-pixel-bevel: inset 0 1px 0 var(--dait-pixel-highlight), inset 0 -1px 0 var(--dait-pixel-shade);
    --dait-pixel-trim: repeating-linear-gradient(
        90deg,
        var(--dait-brand) 0 16px,
        var(--dait-accent-gold) 16px 24px,
        var(--dait-brand) 24px 40px,
        var(--dait-danger-fill) 40px 44px
    );
    color: var(--dait-text);
    font-family: var(--dait-font-family);
    font-size: var(--dait-font-body);
    font-weight: 400;
    letter-spacing: 0;
    line-height: var(--dait-line);
}

/* Dark Courtyard palette (墨瓦青砖 — glazed jade, imperial gold, cinnabar on deep ink-slate). */
[data-dait-panel-theme="dark"],
:is(.dait-settings, .dait-quick-settings-modal-root, .dait-quick-popover, .dait-polish-result-panel, .dait-input-action-menu, .dait-polish-preset-menu, .dait-dialog):not([data-dait-panel-theme]) {
    --dait-bg: #1f2426;
    --dait-rail: #181c1e;
    --dait-surface: #262c2f;
    --dait-raised: #2e3538;
    --dait-input-bg: #15191a;
    /* Control edges reach >= 3:1 against window, rail and card surfaces (WCAG 1.4.11). */
    --dait-input-border: #828c88;
    --dait-divider: #3a4346;
    --dait-text: #eee8dc;
    --dait-heading: #faf4e6;
    --dait-placeholder: #9ca8a3;
    --dait-brand: #227a5f;
    --dait-on-fill: #ffffff;
    --dait-link: #7de0bc;
    --dait-focus: #e5bd67;
    --dait-accent-gold: #d8a84e;
    --dait-success-fill: #248063;
    --dait-success: #72dfa8;
    --dait-warning-fill: #c99022;
    --dait-warning: #f5cb6e;
    --dait-danger-fill: #bd3737;
    --dait-danger: #ff9494;
    --dait-pixel-shadow: rgba(0, 0, 0, 0.54);
    --dait-pixel-highlight: rgba(250, 244, 230, 0.08);
    --dait-pixel-shade: rgba(0, 0, 0, 0.28);
    --dait-shadow: 6px 6px 0 rgba(0, 0, 0, 0.48), 0 12px 28px rgba(0, 0, 0, 0.36);
    --dait-backdrop: rgba(12, 15, 16, 0.62);
    color-scheme: dark;
}

/* Light Courtyard palette (宣纸暖石 — sunlit rice paper, warm stone, glazed jade & gold). */
[data-dait-panel-theme="light"] {
    --dait-bg: #f7f3e9;
    --dait-rail: #ede6d6;
    --dait-surface: #fcf9f1;
    --dait-raised: #e3dac7;
    --dait-input-bg: #fffdf8;
    /* Control edges reach >= 3:1 against window, rail and card surfaces (WCAG 1.4.11). */
    --dait-input-border: #716b5d;
    --dait-divider: #d4cbb8;
    --dait-text: #24211b;
    --dait-heading: #171410;
    --dait-placeholder: #595449;
    --dait-brand: #1d6e54;
    --dait-on-fill: #ffffff;
    --dait-link: #165c45;
    --dait-focus: #1d6e54;
    --dait-accent-gold: #c9942a;
    --dait-success-fill: #1d6e54;
    --dait-success: #145e43;
    --dait-warning-fill: #a66d08;
    --dait-warning: #734700;
    --dait-danger-fill: #b53333;
    --dait-danger: #9c2222;
    --dait-pixel-shadow: rgba(36, 33, 27, 0.24);
    --dait-pixel-highlight: rgba(255, 253, 248, 0.72);
    --dait-pixel-shade: rgba(36, 33, 27, 0.12);
    --dait-shadow: 6px 6px 0 rgba(36, 33, 27, 0.2), 0 10px 24px rgba(36, 33, 27, 0.14);
    --dait-backdrop: rgba(23, 20, 16, 0.42);
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
.dait-polish-preset-button,
.dait-public-bilingual-button,
.dait-quick-settings-button,
.dait-quick-settings-modal-root *,
.dait-polish-result-panel,
.dait-polish-result-panel *,
.dait-polish-restore-control,
.dait-message-button,
.dait-input-action-menu,
.dait-input-action-menu *,
.dait-polish-preset-menu,
.dait-polish-preset-menu *,
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
    border-radius: 0;
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
    border-radius: 2px;
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
    --dait-icon-image: ${PIXEL_CLOSE_ICON};
}

/* One visible focus ring for every control in these surfaces. */
.dait-settings :focus-visible,
.dait-quick-settings-modal-root :focus-visible,
.dait-polish-result-panel :focus-visible,
.dait-input-action-menu :focus-visible,
.dait-polish-preset-menu :focus-visible,
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
    .dait-input-action-menu *,
    .dait-polish-preset-menu,
    .dait-polish-preset-menu * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        scroll-behavior: auto !important;
        transition: none !important;
    }
}

`;
