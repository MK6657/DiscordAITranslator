"use strict";

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
    border: 1px solid var(--dait-divider);
    border-radius: 8px;
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
    max-height: min(720px, calc(100vh - 96px));
    max-width: calc(100vw - 16px);
    overflow: hidden;
    position: fixed;
    text-align: start;
    top: 8px;
    width: 360px;
    z-index: 2147482000;
}

.dait-quick-popover *,
.dait-quick-popover *::before,
.dait-quick-popover *::after {
    box-sizing: border-box;
}

.dait-qp-header {
    align-items: center;
    display: flex;
    flex: 0 0 auto;
    gap: 8px;
    padding: 12px 8px 8px 16px;
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
    border-radius: 999px;
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
    border-radius: 4px;
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
    --dait-qp-icon-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3'/%3E%3Cpath d='M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/%3E%3C/svg%3E");
}

.dait-qp-icon-close {
    --dait-qp-icon-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E");
}

.dait-qp-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px 16px 12px;
    scrollbar-width: thin;
}

.dait-qp-status {
    align-items: center;
    background: var(--dait-surface);
    border-radius: 8px;
    column-gap: 12px;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    margin: 0 0 4px;
    padding: 10px 12px;
}

/* The dot sits on the first text line (not the middle of a wrapped block). */
.dait-qp-status > .dait-qp-dot {
    align-self: start;
    margin-top: 7px;
}

.dait-qp-status-text {
    min-width: 0;
}

.dait-qp-status-line {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    font-weight: 600;
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
    -webkit-line-clamp: 2;
    line-height: var(--dait-line);
    margin: 2px 0 0;
    overflow: hidden;
    overflow-wrap: anywhere;
}

.dait-qp-status-test[hidden] {
    display: none;
}

.dait-qp-status-detail {
    -webkit-box-orient: vertical;
    color: var(--dait-text);
    display: -webkit-box;
    font-size: var(--dait-font-body);
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
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    justify-content: center;
    line-height: 1;
    min-width: 60px;
    padding: 0 14px;
    white-space: nowrap;
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
    border: 0;
    border-radius: 999px;
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
    border-radius: 999px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
    content: "";
    height: 18px;
    left: 3px;
    position: absolute;
    top: 3px;
    width: 18px;
}

.dait-qp-switch:checked {
    background: var(--dait-brand);
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
    border-radius: 4px;
    color: var(--dait-text);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    height: var(--dait-control-h);
    justify-self: end;
    line-height: 1.2;
    min-width: 0;
    padding: 0 30px 0 10px;
}

.dait-qp-select:hover {
    border-color: var(--dait-placeholder);
}

.dait-qp-select option {
    background: var(--dait-input-bg);
    color: var(--dait-text);
}

.dait-qp-segmented {
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: 4px;
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
    border-radius: 3px;
    color: var(--dait-text);
    cursor: pointer;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 500;
    line-height: 1.25;
    min-height: 30px;
    min-width: 0;
    overflow: hidden;
    padding: 4px;
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
    border-radius: 4px;
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

.dait-quick-popover .dait-qp-segment:focus-visible {
    outline-offset: -2px;
}

/* Opened with the mouse: no ring on the first control until the user presses a key. */
.dait-quick-popover.dait-qp-pointer-opened :focus-visible {
    outline: none;
}

/* Status shapes differ as well as colours: filled = ok, ring = busy, triangle = waiting, "!" = needs you,
   dash = off. */
.dait-qp-dot {
    border-radius: 999px;
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

/* The launcher: same size as Discord's user-panel buttons, with the status badge on its corner. */
.dait-quick-settings-panel {
    font-size: 12px;
    font-weight: 700;
    height: 32px;
    min-width: 32px;
    padding: 0 8px;
    position: relative;
}

.dait-quick-settings-panel:focus-visible {
    outline: 2px solid var(--focus-primary, var(--brand-500, #5865f2));
    outline-offset: 2px;
}

.dait-launcher-status {
    align-items: center;
    background: var(--background-secondary-alt, #232428);
    border-radius: 999px;
    bottom: -3px;
    display: flex;
    height: 14px;
    justify-content: center;
    pointer-events: none;
    position: absolute;
    right: -3px;
    width: 14px;
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
