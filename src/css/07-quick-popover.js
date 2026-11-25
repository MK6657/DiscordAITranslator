"use strict";

const { createPixelSvgDataUri } = require("../ui/pixel-icons");
const PIXEL_GEAR_ICON = createPixelSvgDataUri("gear", "#000000");
const PIXEL_CLOSE_ICON = createPixelSvgDataUri("close", "#000000");

// The user-panel launcher's quick panel (popover) and its status badge. The popover is a plugin window: its colours
// come from the panel palette (01-theme-tokens, data-dait-panel-theme on the popover) and it uses the one type scale
// (body 15/1.55, title 18/600, section heading 16/600, version chip 13/500), 360 px wide, controls 36 px high.
// The launcher's badge sits in Discord's user panel and keeps Discord's status colours.
module.exports = `
.dait-launcher-status {
    --dait-qp-ok: var(--status-positive, #23a55a);
    --dait-qp-warn: var(--status-warning, #f0b232);
    --dait-qp-danger: var(--status-danger, #da373c);
    --dait-qp-off: var(--interactive-muted, #80848e);
    --dait-qp-off-mark: var(--interactive-normal, #b5bac1);
}

.dait-quick-popover {
    --dait-qp-ok: var(--dait-success-fill);
    --dait-qp-warn: var(--dait-warning-fill);
    --dait-qp-danger: var(--dait-danger-fill);
    --dait-qp-off: var(--dait-placeholder);
    --dait-qp-off-mark: var(--dait-placeholder);
    --dait-qp-control-w: 180px;
    background: var(--dait-bg);
    border: 2px solid var(--dait-input-border);
    border-radius: var(--dait-radius-card);
    box-shadow: var(--dait-shadow);
    box-sizing: border-box;
    color: var(--dait-text);
    display: flex;
    flex-direction: column;
    font-size: var(--dait-font-body);
    font-weight: 400;
    left: 8px;
    letter-spacing: 0;
    line-height: var(--dait-line);
    max-height: min(760px, calc(100vh - 64px));
    max-width: calc(100vw - 16px);
    overflow: hidden;
    position: fixed;
    text-align: start;
    top: 8px;
    width: 360px;
    z-index: 2147482000;
}

.dait-quick-popover::before {
    background: var(--dait-pixel-trim);
    content: "";
    display: block;
    flex: 0 0 4px;
    width: 100%;
}

.dait-quick-popover *,
.dait-quick-popover *::before,
.dait-quick-popover *::after {
    box-sizing: border-box;
}

.dait-qp-header {
    align-items: center;
    background: var(--dait-rail);
    border-bottom: 1px solid var(--dait-divider);
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    padding: 10px 8px 10px 16px;
}

.dait-qp-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-window);
    font-weight: 600;
    line-height: 1.3;
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-qp-chip {
    background: var(--dait-raised);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-pill);
    box-shadow: inset 0 1px 0 var(--dait-pixel-highlight);
    color: var(--dait-text);
    flex: 0 0 auto;
    font-size: var(--dait-font-small);
    font-weight: 500;
    line-height: 20px;
    padding: 0 8px;
}

.dait-qp-icon-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    height: var(--dait-control-h);
    justify-content: center;
    padding: 0;
    width: var(--dait-control-h);
}

.dait-qp-header-open-full {
    margin-left: auto;
}

.dait-qp-icon-button:hover {
    background: var(--dait-raised);
    box-shadow: inset 0 0 0 1px var(--dait-divider);
    color: var(--dait-heading);
}

.dait-qp-icon {
    background: currentColor;
    display: block;
    height: 18px;
    -webkit-mask: var(--dait-qp-icon-image) center / 18px 18px no-repeat;
    mask: var(--dait-qp-icon-image) center / 18px 18px no-repeat;
    width: 18px;
}

.dait-qp-icon-gear {
    --dait-qp-icon-image: ${PIXEL_GEAR_ICON};
}

.dait-qp-icon-close {
    --dait-qp-icon-image: ${PIXEL_CLOSE_ICON};
}

.dait-qp-lang-bar {
    background: var(--dait-rail);
    border-bottom: 1px solid var(--dait-divider);
    display: grid;
    flex: 0 0 auto;
    gap: 2px;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    padding: 5px 16px;
}

.dait-qp-lang-pill {
    align-items: center;
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    cursor: pointer;
    display: inline-flex;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    justify-content: center;
    line-height: var(--dait-line);
    min-height: 28px;
    min-width: 0;
    overflow: hidden;
    padding: 0 3px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-qp-lang-pill:hover:not([aria-checked="true"]) {
    background: var(--dait-raised);
    border-color: var(--dait-input-border);
    color: var(--dait-heading);
}

.dait-qp-lang-pill[aria-checked="true"] {
    background: var(--dait-brand);
    border-color: var(--dait-brand);
    box-shadow: inset 0 1px 0 var(--dait-pixel-highlight);
    color: var(--dait-on-fill);
    font-weight: 600;
}

.dait-qp-mode-bar {
    background: var(--dait-rail);
    border-bottom: 1px solid var(--dait-divider);
    flex: 0 0 auto;
    padding: 8px 16px;
}

.dait-qp-tabs {
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    box-shadow: inset 1px 1px 0 var(--dait-pixel-shade);
    display: grid;
    gap: 2px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: 2px;
}

.dait-qp-tab {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 1px;
    color: var(--dait-text);
    cursor: pointer;
    display: flex;
    flex-direction: column;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 600;
    gap: 2px;
    line-height: var(--dait-line);
    min-width: 0;
    padding: 4px 6px;
    text-align: center;
}

.dait-qp-tab:hover:not([aria-selected="true"]) {
    background: var(--dait-raised);
    color: var(--dait-heading);
}

.dait-qp-tab[aria-selected="true"] {
    background: var(--dait-brand);
    box-shadow: inset 0 1px 0 var(--dait-pixel-highlight);
    color: var(--dait-on-fill);
}

.dait-qp-tab-head {
    align-items: center;
    display: inline-flex;
    gap: 6px;
    max-width: 100%;
    min-width: 0;
}

.dait-qp-tab-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-qp-tab-dot {
    background: var(--dait-placeholder);
    border-radius: 1px;
    display: inline-block;
    flex: 0 0 auto;
    height: 7px;
    width: 7px;
}

.dait-qp-tab-dot[data-dait-active="on"] {
    background: var(--dait-qp-ok);
}

.dait-qp-tab[aria-selected="true"] .dait-qp-tab-dot[data-dait-active="on"] {
    background: var(--dait-on-fill);
}

.dait-qp-tab[aria-selected="true"] .dait-qp-tab-dot[data-dait-active="manual"],
.dait-qp-tab[aria-selected="true"] .dait-qp-tab-dot[data-dait-active="off"] {
    background: color-mix(in srgb, var(--dait-on-fill) 55%, transparent);
}

.dait-qp-tab-summary {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
    color: inherit;
    font-weight: 400;
    line-height: 1.3;
    max-width: 100%;
    overflow: hidden;
    padding: 0 2px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-qp-tabpanel[hidden] {
    display: none;
}

.dait-qp-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 10px 16px 12px;
}

@supports not selector(::-webkit-scrollbar) {
    .dait-qp-body {
        scrollbar-color: var(--dait-scrollbar-thumb) var(--dait-scrollbar-track);
        scrollbar-width: thin;
    }
}

.dait-qp-body::-webkit-scrollbar {
    height: 8px;
    width: 8px;
}

.dait-qp-body::-webkit-scrollbar-track {
    background: var(--dait-scrollbar-track);
    border-radius: 0;
}

.dait-qp-body::-webkit-scrollbar-thumb {
    background: var(--dait-scrollbar-thumb);
    background-clip: padding-box;
    border: 2px solid transparent;
    border-radius: 2px;
}

.dait-qp-body::-webkit-scrollbar-thumb:hover {
    background: var(--dait-scrollbar-thumb-hover);
    background-clip: padding-box;
}

.dait-qp-body::-webkit-scrollbar-corner {
    background: transparent;
}

/* Status card: the dot, the service line and Test share the first line; the test result, what is happening now
   and the note take the full width under them (the text column is not squeezed beside the button). */
.dait-qp-status {
    align-items: center;
    background: var(--dait-surface);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-card);
    box-shadow: var(--dait-pixel-shadow-sm);
    column-gap: 12px;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    margin: 0 0 6px;
    padding: 10px 12px;
}

.dait-qp-status > .dait-qp-dot {
    grid-column: 1;
    grid-row: 1;
}

.dait-qp-status-text {
    display: contents;
}

.dait-qp-status > .dait-qp-test {
    grid-column: 3;
    grid-row: 1;
}

.dait-qp-status-line {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    font-weight: 600;
    grid-column: 2;
    grid-row: 1;
    line-height: var(--dait-line);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* The last passed connection test: model and response time, e.g. "Hy-MT2 · 820 ms". A long model name wraps to a
   second line instead of being cut off. */
.dait-qp-status-test {
    -webkit-box-orient: vertical;
    color: var(--dait-text);
    display: -webkit-box;
    font-size: var(--dait-font-body);
    font-variant-numeric: tabular-nums;
    grid-column: 2 / -1;
    -webkit-line-clamp: 2;
    line-height: var(--dait-line);
    margin: 2px 0 0;
    overflow: hidden;
    overflow-wrap: anywhere;
}

.dait-qp-status-test[hidden] {
    display: none;
}

/* "model · 820 ms": each dot stays with the part before it and the time stays whole, so a wrap never starts a line
   with a dot or splits "820 ms"; a long model name can still wrap. */
.dait-qp-status-sep,
.dait-qp-status-part {
    white-space: nowrap;
}

.dait-qp-status-detail {
    -webkit-box-orient: vertical;
    color: var(--dait-text);
    display: -webkit-box;
    font-size: var(--dait-font-body);
    grid-column: 2 / -1;
    -webkit-line-clamp: 2;
    line-height: var(--dait-line);
    margin: 2px 0 0;
    overflow: hidden;
    overflow-wrap: anywhere;
}

/* The service's own error says what to fix ("Check the API URL and the model name"), so it wraps instead of being
   cut to one line; three lines hold every message the plugin writes. */
.dait-qp-status-note {
    -webkit-box-orient: vertical;
    color: var(--dait-text);
    display: -webkit-box;
    font-size: var(--dait-font-body);
    grid-column: 2 / -1;
    -webkit-line-clamp: 3;
    line-height: var(--dait-line);
    margin: 2px 0 0;
    overflow: hidden;
    overflow-wrap: anywhere;
}

.dait-qp-status-note[hidden] {
    display: none;
}

.dait-quick-popover[data-dait-status="needs-you"] .dait-qp-status-detail {
    color: var(--dait-danger);
}

.dait-qp-button {
    align-items: center;
    border: 1px solid transparent;
    border-radius: var(--dait-radius-control);
    box-shadow: var(--dait-pixel-bevel), var(--dait-pixel-shadow-sm);
    cursor: pointer;
    display: inline-flex;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    justify-content: center;
    line-height: var(--dait-line);
    min-width: 60px;
    padding: 0 14px;
    transition: background-color 120ms ease, transform 80ms ease, box-shadow 80ms ease;
    white-space: nowrap;
}

.dait-qp-button:active:not(:disabled) {
    box-shadow: none;
    transform: translate(1px, 1px);
}

.dait-qp-button-secondary {
    background: var(--dait-raised);
    border-color: var(--dait-input-border);
    color: var(--dait-text);
}

.dait-qp-button-secondary:hover:not(:disabled) {
    background: var(--dait-raised-hover);
}

.dait-qp-button:disabled {
    cursor: default;
    opacity: 0.55;
}

.dait-qp-row {
    align-items: center;
    column-gap: 16px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 48px;
    padding: 7px 0;
}

.dait-qp-row + .dait-qp-row {
    border-top: 1px solid var(--dait-divider);
}

.dait-qp-row-stacked {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 8px;
}

.dait-qp-row-text {
    min-width: 0;
}

/* Label and description share the body size and colour; the label's weight sets them apart. */
.dait-qp-label {
    color: var(--dait-text);
    display: block;
    font-size: var(--dait-font-body);
    font-weight: 600;
    line-height: var(--dait-line);
    margin: 0;
}

label.dait-qp-label {
    cursor: pointer;
}

.dait-qp-channel-label {
    align-items: baseline;
    display: flex;
    gap: 6px;
    min-width: 0;
}

.dait-qp-channel-name {
    color: var(--dait-text);
    font-weight: 400;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-qp-desc {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    font-weight: 400;
    line-height: var(--dait-line);
    margin: 0;
}

.dait-qp-row-stacked > .dait-qp-desc {
    margin: 0;
}

/* A section heading ("Display"): the group heading size. */
.dait-qp-section {
    color: var(--dait-heading);
    font-size: var(--dait-font-group);
    font-weight: 600;
    line-height: 1.3;
    margin: 0;
    padding: 12px 0 2px;
}

.dait-qp-switch {
    -webkit-appearance: none;
    appearance: none;
    background: var(--dait-switch-off);
    border: 1px solid var(--dait-input-border);
    border-radius: 2px;
    box-shadow: inset 0 1px 0 var(--dait-pixel-shade);
    cursor: pointer;
    flex: 0 0 auto;
    height: 24px;
    justify-self: end;
    margin: 0;
    position: relative;
    width: 40px;
}

.dait-qp-switch::before {
    background: #ffffff;
    border-radius: 1px;
    box-shadow: 1px 1px 0 rgba(0, 0, 0, 0.35);
    content: "";
    height: 16px;
    left: 3px;
    position: absolute;
    top: 3px;
    width: 16px;
}

.dait-qp-switch:checked {
    background: var(--dait-brand);
    border-color: var(--dait-brand);
}

.dait-qp-switch:checked::before {
    transform: translateX(16px);
}

.dait-qp-control {
    width: var(--dait-qp-control-w);
}

/* The same select as in the settings window: the palette's colours and its chevron. */
.dait-qp-select {
    -webkit-appearance: none;
    appearance: none;
    background-color: var(--dait-input-bg);
    background-image:
        linear-gradient(45deg, transparent 50%, var(--dait-placeholder) 50%),
        linear-gradient(135deg, var(--dait-placeholder) 50%, transparent 50%);
    background-position:
        calc(100% - 16px) 50%,
        calc(100% - 11px) 50%;
    background-repeat: no-repeat;
    background-size: 5px 5px, 5px 5px;
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    box-shadow: inset 1px 1px 0 var(--dait-pixel-shade);
    color: var(--dait-text);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    height: var(--dait-control-h);
    justify-self: end;
    line-height: var(--dait-line);
    min-width: 0;
    padding: 0 30px 0 10px;
}

.dait-qp-select:hover:not(:disabled) {
    border-color: var(--dait-placeholder);
}

.dait-qp-select:disabled {
    cursor: default;
    opacity: 0.55;
}

.dait-qp-select-full {
    justify-self: stretch;
    width: 100%;
}

.dait-qp-select option {
    background: var(--dait-input-bg);
    color: var(--dait-text);
}

.dait-qp-switch:disabled {
    cursor: default;
    opacity: 0.55;
}

.dait-qp-row[hidden] {
    display: none;
}

.dait-qp-row-sub {
    border-left: 2px solid var(--dait-brand);
    padding-left: 10px;
}

.dait-qp-label-inline {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.dait-qp-service-chip {
    margin-left: auto;
}

.dait-qp-service-chip[data-dait-relation="separate"] {
    border-color: var(--dait-accent-gold);
}

.dait-qp-inline-chip[hidden] {
    display: none;
}

.dait-qp-temp-head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
}

.dait-qp-temp-title {
    cursor: pointer;
}

.dait-qp-temp-value {
    font-variant-numeric: tabular-nums;
}

.dait-qp-range {
    accent-color: var(--dait-brand);
    cursor: pointer;
    margin: 2px 0;
    width: 100%;
}

.dait-qp-range:disabled {
    cursor: default;
    opacity: 0.55;
}

.dait-qp-presets {
    display: grid;
    gap: 4px;
    grid-template-columns: repeat(3, minmax(0, 1fr));
}

.dait-qp-preset {
    background: var(--dait-surface);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    line-height: var(--dait-line);
    min-height: 32px;
    overflow: hidden;
    padding: 0 4px;
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-qp-preset:hover:not(:disabled):not([aria-pressed="true"]) {
    background: var(--dait-raised);
}

.dait-qp-preset[aria-pressed="true"] {
    background: var(--dait-brand);
    border-color: var(--dait-brand);
    box-shadow: inset 0 1px 0 var(--dait-pixel-highlight);
    color: var(--dait-on-fill);
}

.dait-qp-preset:disabled {
    cursor: default;
    opacity: 0.55;
}

.dait-qp-try-drawer {
    background: var(--dait-surface);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-card);
    margin-top: 8px;
    overflow: hidden;
}

.dait-qp-try-toggle {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--dait-text);
    cursor: pointer;
    display: flex;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 600;
    justify-content: space-between;
    line-height: var(--dait-line);
    min-height: var(--dait-control-h);
    padding: 4px 10px;
    width: 100%;
}

.dait-qp-try-toggle:hover {
    background: var(--dait-raised);
}

.dait-qp-try-body {
    border-top: 1px solid var(--dait-divider);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px 10px;
}

.dait-qp-try-body[hidden] {
    display: none;
}

.dait-qp-try-bar {
    display: flex;
    gap: 6px;
}

.dait-qp-input {
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    box-shadow: inset 1px 1px 0 var(--dait-pixel-shade);
    color: var(--dait-text);
    flex: 1 1 auto;
    font-family: inherit;
    font-size: var(--dait-font-body);
    height: var(--dait-control-h);
    line-height: var(--dait-line);
    min-width: 0;
    padding: 0 10px;
}

.dait-qp-input::placeholder {
    color: var(--dait-placeholder);
}

.dait-qp-input:disabled {
    cursor: default;
    opacity: 0.55;
}

.dait-qp-try-result {
    background: var(--dait-bg);
    border: 1px dashed var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 10px;
}

.dait-qp-try-result[hidden],
.dait-qp-try-time[hidden] {
    display: none;
}

.dait-qp-try-result.dait-try-result-error,
.dait-qp-try-result-error {
    border-color: var(--dait-danger);
    color: var(--dait-danger);
}

.dait-qp-try-output {
    font-size: var(--dait-font-body);
    line-height: var(--dait-line);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
}

.dait-qp-try-time {
    color: var(--dait-placeholder);
    font-size: var(--dait-font-body);
    font-variant-numeric: tabular-nums;
}

.dait-qp-segmented {
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    box-shadow: inset 1px 1px 0 var(--dait-pixel-shade);
    display: grid;
    gap: 2px;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    justify-self: stretch;
    min-height: var(--dait-control-h);
    padding: 2px;
}

.dait-qp-row:not(.dait-qp-row-stacked) > .dait-qp-segmented {
    justify-self: end;
}

.dait-qp-segment {
    background: transparent;
    border: 0;
    border-radius: 1px;
    color: var(--dait-text);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    line-height: var(--dait-line);
    min-height: 30px;
    min-width: 0;
    overflow: hidden;
    padding: 0 4px;
    text-align: center;
    text-overflow: ellipsis;
    /* One line, like the other segments ("Follow main" fits in a third of the panel). */
    white-space: nowrap;
}

.dait-qp-segment:hover:not(:disabled):not([aria-checked="true"]) {
    background: var(--dait-raised);
    color: var(--dait-text);
}

/* The chosen value reads at a glance in both themes: filled with the accent, white text. */
.dait-qp-segment[aria-checked="true"] {
    background: var(--dait-brand);
    box-shadow: inset 0 1px 0 var(--dait-pixel-highlight);
    color: var(--dait-on-fill);
}

.dait-qp-segment:disabled {
    cursor: default;
}

.dait-qp-segmented[aria-disabled="true"] {
    opacity: 0.55;
}

.dait-qp-footer {
    align-items: center;
    background: var(--dait-surface);
    border-top: 1px solid var(--dait-divider);
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    justify-content: space-between;
    padding: 8px 16px;
}

.dait-qp-link {
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-link);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    margin-left: -6px;
    padding: 0 6px;
}

.dait-qp-link:hover {
    text-decoration: underline;
}

.dait-qp-hint {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    white-space: nowrap;
}

.dait-quick-popover :focus {
    outline: none;
}

.dait-quick-popover :focus-visible {
    outline: 2px solid var(--dait-focus);
    outline-offset: 2px;
}

.dait-quick-popover .dait-qp-segment:focus-visible,
.dait-quick-popover .dait-qp-tab:focus-visible,
.dait-quick-popover .dait-qp-lang-pill:focus-visible {
    outline-offset: -2px;
}

.dait-quick-popover:not(.dait-qp-pointer-opened) :is(
    .dait-qp-segment[aria-checked="true"],
    .dait-qp-tab[aria-selected="true"],
    .dait-qp-lang-pill[aria-checked="true"],
    .dait-qp-preset[aria-pressed="true"]
):focus-visible {
    outline-color: var(--dait-on-fill);
    outline-offset: -3px;
}

/* Opened with the mouse: no ring on the first control until the user presses a key. */
.dait-quick-popover.dait-qp-pointer-opened :focus-visible {
    outline: none;
}

.dait-quick-popover[dir="rtl"] .dait-qp-header {
    padding: 10px 16px 10px 8px;
}

.dait-quick-popover[dir="rtl"] .dait-qp-header-open-full {
    margin-left: 0;
    margin-right: auto;
}

.dait-quick-popover[dir="rtl"] .dait-qp-switch::before {
    left: auto;
    right: 3px;
}

.dait-quick-popover[dir="rtl"] .dait-qp-switch:checked::before {
    transform: translateX(-16px);
}

.dait-quick-popover[dir="rtl"] .dait-qp-select {
    background-position:
        11px 50%,
        16px 50%;
    background-size: 5px 5px, 5px 5px;
    padding: 0 10px 0 30px;
}

.dait-quick-popover[dir="rtl"] .dait-qp-row-sub {
    border-left: 0;
    border-right: 2px solid var(--dait-brand);
    padding-left: 0;
    padding-right: 10px;
}

.dait-quick-popover[dir="rtl"] .dait-qp-service-chip {
    margin-left: 0;
    margin-right: auto;
}

.dait-quick-popover[dir="rtl"] .dait-qp-link {
    margin-left: 0;
    margin-right: -6px;
}

.dait-quick-popover[dir="rtl"] :is(.dait-qp-chip, .dait-qp-temp-value) {
    direction: ltr;
    unicode-bidi: isolate;
}

.dait-quick-popover :is(.dait-qp-input, .dait-qp-try-output) {
    unicode-bidi: plaintext;
}

/* Status shapes differ as well as colours: filled = ok, ring = busy, triangle = waiting, "!" = needs you,
   dash = off. */
.dait-qp-dot {
    border-radius: 2px;
    display: block;
    flex: 0 0 auto;
    height: 10px;
    position: relative;
    width: 10px;
}

.dait-qp-dot[data-dait-status="ok"] {
    background: var(--dait-qp-ok);
}

.dait-qp-dot[data-dait-status="busy"] {
    border: 2px solid var(--dait-qp-warn);
}

.dait-qp-dot[data-dait-status="waiting"] {
    background: var(--dait-qp-warn);
    border-radius: 1px;
    clip-path: polygon(50% 0, 100% 100%, 0 100%);
}

.dait-qp-dot[data-dait-status="needs-you"] {
    background: var(--dait-qp-danger);
}

.dait-qp-dot[data-dait-status="needs-you"]::after {
    background:
        linear-gradient(#ffffff, #ffffff) center top / 2px 4px no-repeat,
        linear-gradient(#ffffff, #ffffff) center bottom / 2px 1.5px no-repeat;
    bottom: 2px;
    content: "";
    left: 3px;
    position: absolute;
    right: 3px;
    top: 2px;
}

.dait-qp-dot[data-dait-status="off"] {
    border: 1.5px solid var(--dait-qp-off);
}

.dait-qp-dot[data-dait-status="off"]::after {
    background: var(--dait-qp-off-mark);
    border-radius: 1px;
    content: "";
    height: 1.5px;
    left: 1.5px;
    position: absolute;
    right: 1.5px;
    top: calc(50% - 0.75px);
}

/* The launcher: compact fit inside Discord's user-panel button row so it never crowds or covers User Settings. */
.dait-quick-settings-panel {
    font-size: 11px;
    font-weight: 700;
    height: 30px;
    max-width: 30px;
    min-width: 28px;
    padding: 0;
    position: relative;
    width: 30px;
}

.dait-quick-settings-panel[data-dait-launcher-compact="true"] {
    font-size: 10px;
    height: 26px;
    margin: 0 1px 0 0;
    max-width: 24px;
    min-width: 24px;
    width: 24px;
}

.dait-quick-settings-panel:focus-visible {
    outline: 2px solid var(--focus-primary, var(--brand-500, #5865f2));
    outline-offset: 2px;
}

.dait-launcher-status {
    align-items: center;
    background: var(--background-secondary-alt, #232428);
    border-radius: 2px;
    bottom: -1px;
    display: flex;
    height: 12px;
    justify-content: center;
    pointer-events: none;
    position: absolute;
    right: -1px;
    width: 12px;
}

@media (prefers-reduced-motion: no-preference) {
    .dait-quick-popover {
        animation: dait-qp-enter 0.12s ease-out;
    }

    .dait-quick-popover[data-dait-placement="bottom"] {
        animation-name: dait-qp-enter-below;
    }

    /* Rebuilt in place (a language switch): it is already open, so it does not slide in again. */
    .dait-quick-popover[data-dait-rerendered="true"] {
        animation: none;
    }

    .dait-qp-switch,
    .dait-qp-segment,
    .dait-qp-tab,
    .dait-qp-preset,
    .dait-qp-try-toggle,
    .dait-qp-icon-button {
        transition: background-color 0.15s ease, color 0.15s ease;
    }

    .dait-qp-switch::before {
        transition: transform 0.15s ease;
    }
}

@keyframes dait-qp-enter {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: none; }
}

@keyframes dait-qp-enter-below {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: none; }
}

@media (forced-colors: active) {
    .dait-qp-switch,
    .dait-qp-segmented,
    .dait-qp-dot {
        border: 1px solid CanvasText;
    }

    .dait-qp-segment[aria-checked="true"] {
        outline: 2px solid Highlight;
    }
}
`;
