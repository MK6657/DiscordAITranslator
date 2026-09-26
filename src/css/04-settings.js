"use strict";

// The full settings window (UI-SPEC "Visual system"): header, a 184 px tab rail with search, and a content pane that
// scrolls on its own. Rows are a 2-column grid whose right-hand controls share one width (--dait-control-w), so
// their edges line up down the page. Below 640 px of panel width the rail becomes a row and rows stack.
module.exports = `.dait-settings {
    --dait-rail-w: 184px;
    --dait-content-max: 680px;
    --dait-switch-off: color-mix(in srgb, var(--dait-text-muted) 60%, var(--dait-surface-2));
    background: var(--dait-bg);
    border-radius: var(--dait-radius-card);
    color: var(--dait-text);
    container: dait-settings / inline-size;
    display: flex;
    flex-direction: column;
    font-size: var(--dait-font-body);
    height: calc(min(760px, 100vh - 64px, var(--dait-host-max, 100vh)) - var(--dait-host-chrome, 140px));
    line-height: 1.4;
    margin-left: auto;
    margin-right: auto;
    min-height: min(360px, calc(100vh - 96px));
    min-width: 0;
    overflow: hidden;
    text-align: left;
    width: 100%;
}

.dait-settings h2,
.dait-settings h3,
.dait-settings p {
    margin: 0;
}

.dait-settings [hidden] {
    display: none !important;
}

.dait-settings button,
.dait-settings input,
.dait-settings select,
.dait-settings textarea {
    font-family: inherit;
    letter-spacing: 0;
}

/* Header: logo, title, version, translation status, close. */
.dait-settings-header {
    align-items: center;
    border-bottom: 1px solid var(--dait-divider);
    display: flex;
    flex: 0 0 auto;
    gap: var(--dait-space-3);
    min-height: 60px;
    min-width: 0;
    padding: 12px 12px 12px 20px;
}

.dait-settings-header-embedded {
    min-height: 44px;
    padding: 8px 16px;
}

.dait-settings-logo {
    align-items: center;
    background: var(--dait-brand);
    border-radius: var(--dait-radius-card);
    color: var(--dait-on-fill);
    display: flex;
    flex: 0 0 auto;
    font-size: 13px;
    font-weight: 700;
    height: 32px;
    justify-content: center;
    width: 32px;
}

.dait-settings-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-title);
    font-weight: 700;
    line-height: 1.25;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-settings-version {
    background: var(--dait-surface-2);
    border-radius: var(--dait-radius-pill);
    color: var(--dait-text);
    flex: 0 0 auto;
    font-size: var(--dait-font-chip);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    line-height: 1.5;
    padding: 1px 8px;
}

.dait-settings-header-status {
    align-items: center;
    color: var(--dait-text);
    display: inline-flex;
    font-size: var(--dait-font-caption);
    gap: var(--dait-space-2);
    margin-left: auto;
    min-width: 0;
}

.dait-settings-header-provider::before {
    content: "·";
    margin-right: var(--dait-space-2);
}

.dait-settings-header-provider {
    color: var(--dait-text-muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-settings-close {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-text-muted);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: 24px;
    font-weight: 400;
    height: 36px;
    justify-content: center;
    line-height: 1;
    width: 36px;
}

.dait-settings-close:hover {
    background: var(--dait-hover);
    color: var(--dait-heading);
}

/* Status: a 10 px mark plus text. The mark differs in shape as well as colour: dash = not tested,
   ring = testing, filled = connected, "!" = needs you. */
.dait-settings .dait-api-status {
    align-items: center;
    color: var(--dait-text);
    display: inline-flex;
    font-size: var(--dait-font-caption);
    gap: 6px;
    line-height: 1.3;
    white-space: nowrap;
}

.dait-settings .dait-api-status::before {
    background: var(--dait-text-muted);
    border-radius: 1px;
    content: "";
    flex: 0 0 auto;
    height: 2px;
    width: 10px;
}

.dait-settings .dait-api-status.dait-api-status-testing::before {
    background: transparent;
    border: 2px solid var(--dait-text-muted);
    border-radius: var(--dait-radius-pill);
    height: 10px;
}

.dait-settings .dait-api-status.dait-api-status-success::before {
    background: var(--dait-success);
    border-radius: var(--dait-radius-pill);
    height: 10px;
}

.dait-settings .dait-api-status.dait-api-status-failed {
    color: var(--dait-danger);
}

.dait-settings .dait-api-status.dait-api-status-failed::before {
    align-items: center;
    background: var(--dait-danger-fill);
    border-radius: var(--dait-radius-pill);
    color: var(--dait-on-fill);
    content: "!";
    display: inline-flex;
    font-size: 12px;
    font-weight: 700;
    height: 14px;
    justify-content: center;
    line-height: 1;
    width: 14px;
}

/* Tab rail and content pane. */
.dait-settings-body {
    display: grid;
    flex: 1 1 auto;
    grid-template-columns: var(--dait-rail-w) minmax(0, 1fr);
    min-height: 0;
    min-width: 0;
}

.dait-settings-rail {
    background: var(--dait-surface);
    display: flex;
    flex-direction: column;
    gap: var(--dait-space-3);
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 16px 12px;
}

.dait-settings-search {
    flex: 0 0 auto;
    position: relative;
}

.dait-settings-search::before {
    background: var(--dait-text-muted);
    content: "";
    height: 14px;
    left: 10px;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M20 20l-3.5-3.5'/%3E%3C/svg%3E") center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round'%3E%3Ccircle cx='11' cy='11' r='7'/%3E%3Cpath d='M20 20l-3.5-3.5'/%3E%3C/svg%3E") center / contain no-repeat;
    pointer-events: none;
    position: absolute;
    top: 9px;
    width: 14px;
}

.dait-settings .dait-settings-search-input {
    padding-left: 32px;
    width: 100%;
}

.dait-settings-tabs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.dait-settings-tab {
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-text-muted);
    cursor: pointer;
    font-size: var(--dait-font-label);
    font-weight: 500;
    line-height: 1.3;
    min-height: 36px;
    padding: 7px 10px;
    text-align: left;
    width: 100%;
}

.dait-settings-tab:hover {
    background: var(--dait-hover);
    color: var(--dait-text);
}

.dait-settings-tab[aria-selected="true"] {
    background: var(--dait-selected);
    color: var(--dait-heading);
}

.dait-settings-content {
    min-height: 0;
    min-width: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 24px 28px 32px;
}

.dait-settings-tabpanel,
.dait-settings-search-results {
    max-width: var(--dait-content-max);
}

.dait-settings-page-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-title);
    font-weight: 700;
    line-height: 1.25;
}

/* Groups: a heading, an optional one-line note, then flat rows with 1 px dividers. */
.dait-settings-group {
    margin-top: var(--dait-space-6);
    min-width: 0;
}

.dait-settings-page-title + .dait-settings-group {
    margin-top: var(--dait-space-4);
}

.dait-settings-group-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-heading);
    font-weight: 700;
    line-height: 1.3;
    margin-bottom: var(--dait-space-2);
}

.dait-settings-group-note {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-body);
    line-height: 1.5;
    margin-bottom: var(--dait-space-1);
}

/* Rows. */
.dait-settings-row {
    align-items: center;
    border-bottom: 1px solid var(--dait-divider);
    column-gap: var(--dait-space-5);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    min-width: 0;
    padding: 12px 0;
    transition: background-color 160ms ease, box-shadow 160ms ease;
}

.dait-settings-row:last-child {
    border-bottom: 0;
}

.dait-row-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.dait-row-label {
    color: var(--dait-heading);
    font-size: var(--dait-font-label);
    font-weight: 500;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.dait-row-description {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-body);
    font-weight: 400;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.dait-row-control {
    align-items: center;
    display: flex;
    gap: var(--dait-space-2);
    justify-content: flex-end;
    min-width: 0;
}

/* Every right-hand select, number/text input and segmented control has the same width. */
.dait-row-control > select,
.dait-row-control > input:not([type="checkbox"]),
.dait-row-control > .dait-segmented,
.dait-row-control > .dait-language-controls {
    width: var(--dait-control-w);
}

/* Stacked field for long values: label, full-width control (6 px below), help under it. */
.dait-settings-row-stacked {
    align-items: stretch;
    grid-template-areas:
        "label"
        "control"
        "desc";
    grid-template-columns: minmax(0, 1fr);
    row-gap: 6px;
}

.dait-settings-row-stacked > .dait-row-text {
    display: contents;
}

.dait-settings-row-stacked .dait-row-label {
    grid-area: label;
}

.dait-settings-row-stacked .dait-row-description {
    grid-area: desc;
}

.dait-settings-row-stacked > .dait-row-control {
    grid-area: control;
    justify-content: stretch;
}

.dait-settings-row-stacked > .dait-row-control > * {
    flex: 1 1 auto;
    width: 100%;
}

/* A dependent option sits right under its parent, indented, and is disabled while the parent is off. */
.dait-settings-row-dependent {
    padding-left: var(--dait-space-4);
}

.dait-settings-row-inactive .dait-row-label {
    color: var(--dait-text-muted);
}

.dait-settings-row-found {
    background: color-mix(in srgb, var(--dait-brand) 16%, transparent);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--dait-brand) 16%, transparent);
}

/* Form controls. */
.dait-settings :where(input:not([type="checkbox"]):not([type="radio"]), select, textarea) {
    background-color: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    font-weight: 400;
    line-height: 20px;
    max-width: 100%;
    min-width: 0;
    outline: none;
}

.dait-settings :where(input:not([type="checkbox"]):not([type="radio"]), select) {
    height: var(--dait-control-h);
    padding: 0 10px;
}

.dait-settings input::placeholder,
.dait-settings textarea::placeholder {
    color: color-mix(in srgb, var(--dait-text-muted) 80%, transparent);
}

.dait-settings :where(select) {
    appearance: none;
    background-image:
        linear-gradient(45deg, transparent 50%, var(--dait-text-muted) 50%),
        linear-gradient(135deg, var(--dait-text-muted) 50%, transparent 50%);
    background-position:
        calc(100% - 16px) 50%,
        calc(100% - 11px) 50%;
    background-repeat: no-repeat;
    background-size: 5px 5px, 5px 5px;
    cursor: pointer;
    padding-right: 30px;
    text-overflow: ellipsis;
}

.dait-settings select option,
.dait-settings select optgroup {
    background-color: var(--dait-surface);
    color: var(--dait-text);
}

.dait-settings :where(textarea) {
    font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
    font-size: 13px;
    line-height: 1.5;
    min-height: 96px;
    overflow-x: auto;
    padding: 8px 10px;
    resize: vertical;
    white-space: pre-wrap;
    width: 100%;
    word-break: break-word;
}

.dait-settings :where(input:not([type="checkbox"]):not([type="radio"]), select, textarea):hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--dait-text-muted) 60%, transparent);
}

.dait-settings :where(input:not([type="checkbox"]):not([type="radio"]), select, textarea):focus {
    border-color: var(--dait-focus);
}

.dait-settings-row input:disabled,
.dait-settings-row select:disabled,
.dait-settings-row textarea:disabled,
.dait-prompt-editor textarea:disabled,
.dait-prompt-tools input:disabled,
.dait-prompt-tools select:disabled {
    background-color: color-mix(in srgb, var(--dait-input-bg) 60%, var(--dait-bg));
    color: var(--dait-disabled-text);
    cursor: not-allowed;
    opacity: 1;
    -webkit-text-fill-color: var(--dait-disabled-text);
}

/* Switch: a native checkbox with role="switch", 40 x 24. */
.dait-settings input.dait-switch {
    appearance: none;
    background: var(--dait-switch-off);
    border: 0;
    border-radius: var(--dait-radius-pill);
    cursor: pointer;
    flex: 0 0 auto;
    height: 24px;
    margin: 0;
    position: relative;
    transition: background-color 140ms ease;
    width: 40px;
}

.dait-settings input.dait-switch::after {
    background: #ffffff;
    border-radius: var(--dait-radius-pill);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.24);
    content: "";
    height: 18px;
    left: 3px;
    position: absolute;
    top: 3px;
    transition: transform 140ms ease;
    width: 18px;
}

.dait-settings input.dait-switch:checked {
    background: var(--dait-positive-fill);
}

.dait-settings input.dait-switch:checked::after {
    transform: translateX(16px);
}

.dait-settings input.dait-switch:disabled {
    cursor: not-allowed;
    opacity: 0.45;
}

/* Segmented control: equal-width options filling the control width. */
.dait-segmented {
    background: var(--dait-input-bg);
    border: 1px solid var(--dait-input-border);
    border-radius: var(--dait-radius-control);
    display: grid;
    gap: 2px;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    height: var(--dait-control-h);
    padding: 2px;
}

.dait-segmented-option {
    background: transparent;
    border: 0;
    border-radius: 3px;
    color: var(--dait-text-muted);
    cursor: pointer;
    font-size: var(--dait-font-caption);
    font-weight: 500;
    line-height: 1;
    min-width: 0;
    overflow: hidden;
    padding: 0 5px;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-segmented-option:hover:not(:disabled) {
    background: var(--dait-hover);
    color: var(--dait-text);
}

.dait-segmented-option[aria-checked="true"] {
    background: var(--dait-button-secondary);
    color: var(--dait-on-fill);
}

.dait-segmented-option:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

/* Buttons: 32 px high, 14/500. Default is the grey secondary button. */
.dait-small-button {
    align-items: center;
    background: var(--dait-button-secondary);
    border: 1px solid transparent;
    border-radius: var(--dait-radius-control);
    color: var(--dait-on-fill);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 auto;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    justify-content: center;
    line-height: 1;
    padding: 0 14px;
    white-space: nowrap;
}

.dait-small-button:hover:not(:disabled) {
    background: var(--dait-button-secondary-hover);
}

.dait-small-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}

.dait-small-button-primary {
    background: var(--dait-brand);
}

.dait-small-button-primary:hover:not(:disabled) {
    background: var(--dait-brand-hover);
}

.dait-small-button-outline {
    background: transparent;
    border-color: var(--dait-input-border);
    color: var(--dait-text);
}

.dait-small-button-outline:hover:not(:disabled) {
    background: var(--dait-hover);
}

.dait-small-button-danger {
    background: transparent;
    border-color: var(--dait-danger);
    color: var(--dait-danger);
}

.dait-small-button-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--dait-danger-fill) 14%, transparent);
}

.dait-small-button-link {
    background: transparent;
    color: var(--dait-link);
    padding: 0 6px;
}

.dait-small-button-link:hover:not(:disabled) {
    background: transparent;
    text-decoration: underline;
}

/* Rows of action buttons wrap and stay right-aligned. */
.dait-cache-actions,
.dait-diagnostic-actions,
.dait-history-backfill-actions,
.dait-hotkey-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dait-space-2);
    justify-content: flex-end;
    min-width: 0;
}

.dait-hotkey-recorder {
    font-variant-numeric: tabular-nums;
    min-width: 120px;
}

.dait-language-controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
}

.dait-language-controls > * {
    width: 100%;
}

/* Ordered list: the manual-translation fallback services, ticked and moved with arrow buttons. */
.dait-order-list {
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-card);
    display: grid;
    min-width: 0;
}

.dait-order-item {
    align-items: center;
    column-gap: var(--dait-space-2);
    display: grid;
    grid-template-columns: 20px auto minmax(0, 1fr) auto auto;
    min-height: 44px;
    padding: 6px 8px 6px 12px;
}

.dait-order-item + .dait-order-item {
    border-top: 1px solid var(--dait-divider);
}

.dait-order-position {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-caption);
    font-variant-numeric: tabular-nums;
    text-align: center;
}

.dait-settings input.dait-order-include {
    accent-color: var(--dait-brand);
    cursor: pointer;
    height: 16px;
    margin: 0;
    width: 16px;
}

.dait-order-name {
    color: var(--dait-text);
    cursor: pointer;
    font-size: var(--dait-font-body);
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-order-item:not(.dait-order-item-on) .dait-order-name {
    color: var(--dait-text-muted);
}

.dait-order-note {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-caption);
}

/* Only chosen services have a position to move. */
.dait-order-item:not(.dait-order-item-on) .dait-order-move {
    visibility: hidden;
}

.dait-small-button.dait-order-move {
    font-size: var(--dait-font-label);
    padding: 0;
    width: var(--dait-control-h);
}

/* <details> for rarely changed options (more model parameters, optional API key). */
.dait-settings-details {
    border-top: 1px solid var(--dait-divider);
}

.dait-settings-details-summary {
    color: var(--dait-text);
    cursor: pointer;
    font-size: var(--dait-font-body);
    font-weight: 500;
    padding: 12px 0;
}

.dait-settings-details-summary:hover {
    color: var(--dait-heading);
}

.dait-settings-details[open] > .dait-settings-details-summary {
    border-bottom: 1px solid var(--dait-divider);
}

/* Connection card: the only card on a page (UI-SPEC Q6). */
.dait-provider-settings-block {
    background: var(--dait-surface);
    border-radius: var(--dait-radius-card);
    margin: var(--dait-space-2) 0;
    min-width: 0;
    padding: 0 var(--dait-space-4);
}

.dait-provider-settings-header {
    align-items: center;
    border-bottom: 1px solid var(--dait-divider);
    display: flex;
    flex-wrap: wrap;
    gap: var(--dait-space-2) var(--dait-space-3);
    min-height: 56px;
    min-width: 0;
    padding: 12px 0;
}

.dait-provider-settings-title {
    color: var(--dait-heading);
    flex: 1 1 auto;
    font-size: var(--dait-font-label);
    font-weight: 600;
    line-height: 1.3;
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-provider-connection {
    align-items: center;
    display: inline-flex;
    flex: 0 1 auto;
    gap: var(--dait-space-2);
    margin-left: auto;
    max-width: 100%;
    min-width: 0;
}

.dait-provider-connection > .dait-small-button {
    margin-left: var(--dait-space-1);
}

.dait-provider-settings-block > .dait-settings-details:last-child,
.dait-provider-settings-block > .dait-settings-row:last-child {
    border-bottom: 0;
}

.dait-settings-subheading {
    color: var(--dait-heading);
    font-size: var(--dait-font-body);
    font-weight: 600;
    padding-top: var(--dait-space-3);
}

.dait-google-settings {
    border-bottom: 1px solid var(--dait-divider);
    min-width: 0;
}

.dait-google-settings > .dait-settings-row:last-child {
    border-bottom: 0;
}

.dait-provider-summary {
    background: var(--dait-surface);
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    line-height: 1.5;
    padding: 8px 12px;
}

/* Diagnostics summary. */
.dait-diagnostic-summary {
    display: grid;
    gap: var(--dait-space-3);
    min-width: 0;
}

.dait-diagnostic-summary-group {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.dait-diagnostic-summary-title {
    color: var(--dait-text);
    font-size: var(--dait-font-caption);
    font-weight: 600;
    line-height: 1.3;
}

.dait-diagnostic-summary-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
}

.dait-diagnostic-chip,
.dait-diagnostic-summary-empty {
    background: var(--dait-surface-2);
    border-radius: var(--dait-radius-pill);
    color: var(--dait-text);
    font-size: var(--dait-font-chip);
    font-weight: 500;
    line-height: 1.4;
    max-width: 100%;
    overflow-wrap: anywhere;
    padding: 2px 8px;
}

.dait-diagnostic-summary-empty {
    color: var(--dait-text-muted);
    justify-self: start;
}

/* Text only screen readers get (the state words of the setup checklist). */
.dait-settings .dait-visually-hidden {
    border: 0;
    clip: rect(0 0 0 0);
    height: 1px;
    margin: -1px;
    overflow: hidden;
    padding: 0;
    position: absolute;
    white-space: nowrap;
    width: 1px;
}

/* Overview: setup checklist (hidden once complete), then the two service status cards. */
.dait-setup-card {
    background: var(--dait-surface);
    border-radius: var(--dait-radius-card);
    display: grid;
    gap: var(--dait-space-2);
    margin-bottom: var(--dait-space-6);
    padding: var(--dait-space-4);
}

.dait-setup-head {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: var(--dait-space-1) var(--dait-space-3);
}

.dait-setup-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-heading);
    font-weight: 700;
    line-height: 1.3;
}

.dait-setup-progress {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-caption);
    line-height: 1.4;
}

.dait-setup-list {
    display: grid;
    list-style: none;
    margin: 0;
    padding: 0;
}

.dait-setup-item {
    align-items: center;
    column-gap: var(--dait-space-3);
    display: grid;
    grid-template-areas: "icon label detail action";
    grid-template-columns: 18px minmax(112px, 168px) minmax(0, 1fr) auto;
    min-height: 44px;
    padding: 6px 0;
}

.dait-setup-item + .dait-setup-item {
    border-top: 1px solid var(--dait-divider);
}

.dait-setup-icon {
    border-radius: var(--dait-radius-pill);
    box-sizing: border-box;
    grid-area: icon;
    height: 18px;
    position: relative;
    width: 18px;
}

.dait-setup-item-done .dait-setup-icon {
    background: var(--dait-success);
    border-radius: 0;
    -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E") center / contain no-repeat;
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6L9 17l-5-5'/%3E%3C/svg%3E") center / contain no-repeat;
}

.dait-setup-item-todo .dait-setup-icon,
.dait-setup-item-busy .dait-setup-icon {
    border: 2px solid var(--dait-text-muted);
    height: 16px;
    margin: 1px;
    width: 16px;
}

.dait-setup-item-busy .dait-setup-icon {
    border-color: var(--dait-warning);
    border-style: dashed;
}

.dait-setup-item-error .dait-setup-icon {
    background: var(--dait-danger-fill);
}

.dait-setup-item-error .dait-setup-icon::after {
    color: var(--dait-on-fill);
    content: "!";
    font-size: 12px;
    font-weight: 700;
    left: 0;
    line-height: 18px;
    position: absolute;
    right: 0;
    text-align: center;
    top: 0;
}

.dait-setup-item-off .dait-setup-icon::after {
    background: var(--dait-text-muted);
    border-radius: 1px;
    content: "";
    height: 2px;
    left: 4px;
    position: absolute;
    right: 4px;
    top: 8px;
}

.dait-setup-label {
    color: var(--dait-heading);
    font-size: var(--dait-font-label);
    font-weight: 500;
    grid-area: label;
    line-height: 1.4;
    min-width: 0;
}

.dait-setup-detail {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-body);
    grid-area: detail;
    line-height: 1.5;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-setup-item-error .dait-setup-detail {
    color: var(--dait-danger);
    white-space: normal;
}

.dait-setup-item > .dait-small-button {
    grid-area: action;
    justify-self: end;
}

.dait-service-cards {
    display: grid;
    gap: var(--dait-space-3);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-bottom: var(--dait-space-2);
}

.dait-service-card {
    align-items: center;
    background: var(--dait-surface);
    border-radius: var(--dait-radius-card);
    display: flex;
    gap: var(--dait-space-3);
    min-width: 0;
    padding: 14px var(--dait-space-4);
}

.dait-service-card-text {
    display: grid;
    flex: 1 1 auto;
    gap: var(--dait-space-1);
    min-width: 0;
}

.dait-service-card-title {
    color: var(--dait-heading);
    font-size: var(--dait-font-label);
    font-weight: 500;
    line-height: 1.35;
    overflow-wrap: anywhere;
}

.dait-service-card-status {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 2px 6px;
    min-width: 0;
}

/* In a card the last test's details get their own line. */
.dait-settings .dait-service-card .dait-api-test-detail {
    flex-basis: 100%;
    white-space: normal;
}

.dait-settings .dait-service-card .dait-api-test-detail::before {
    content: none;
}

.dait-service-card > .dait-small-button {
    flex: 0 0 auto;
}

/* Status without a connection to show: dash = off, "!" = needs you. */
.dait-status-mark {
    align-items: center;
    color: var(--dait-text);
    display: inline-flex;
    font-size: var(--dait-font-caption);
    gap: 6px;
    line-height: 1.3;
    min-width: 0;
}

.dait-status-mark::before {
    background: var(--dait-text-muted);
    border-radius: 1px;
    content: "";
    flex: 0 0 auto;
    height: 2px;
    width: 10px;
}

.dait-status-mark-needs {
    color: var(--dait-danger);
}

.dait-status-mark-needs::before {
    align-items: center;
    background: var(--dait-danger-fill);
    border-radius: var(--dait-radius-pill);
    color: var(--dait-on-fill);
    content: "!";
    display: inline-flex;
    font-size: 12px;
    font-weight: 700;
    height: 14px;
    justify-content: center;
    line-height: 1;
    width: 14px;
}

/* The last test's details after a status badge; hidden as soon as the badge shows another state. */
.dait-settings .dait-api-test-detail {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-caption);
    line-height: 1.3;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dait-settings .dait-api-test-detail::before {
    content: "·";
    margin-right: 6px;
}

.dait-settings .dait-api-status:not(.dait-api-status-success) + .dait-api-test-detail[data-dait-for="success"],
.dait-settings .dait-api-status:not(.dait-api-status-failed) + .dait-api-test-detail[data-dait-for="failed"] {
    display: none;
}

.dait-provider-connection .dait-api-test-detail {
    max-width: 260px;
}

/* An error is worth reading in full: it wraps instead of being cut off. */
.dait-settings .dait-api-test-detail[data-dait-for="failed"] {
    white-space: normal;
}

.dait-provider-connection .dait-api-test-detail[data-dait-for="failed"] {
    max-width: 300px;
}

/* With an error to read, the status takes its own full-width line under the card title. */
.dait-provider-settings-header:has(.dait-api-status-failed + .dait-api-test-detail[data-dait-for="failed"]:not([hidden])) > .dait-provider-connection {
    flex-basis: 100%;
    margin-left: 0;
}

.dait-provider-settings-header:has(.dait-api-status-failed + .dait-api-test-detail[data-dait-for="failed"]:not([hidden])) .dait-api-test-detail {
    flex: 1 1 auto;
    max-width: none;
}

/* Model field (Sakura local, OpenAI-compatible): name + "Detect models", the picker below. */
.dait-model-field,
.dait-try-field {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.dait-model-field-line,
.dait-try-line {
    align-items: center;
    display: flex;
    gap: var(--dait-space-2);
    min-width: 0;
}

.dait-settings .dait-model-field-line > input,
.dait-settings .dait-try-line > input {
    flex: 1 1 auto;
    min-width: 0;
    width: auto;
}

.dait-settings .dait-model-picker {
    width: 100%;
}

.dait-settings .dait-row-description.dait-row-description-error {
    color: var(--dait-danger);
}

/* "Try a sentence" / "Try polishing": the result goes under the help text, with the time it took. */
.dait-settings-row-stacked.dait-try-row {
    grid-template-areas:
        "label"
        "control"
        "desc"
        "result";
}

.dait-settings-row-stacked.dait-try-row > .dait-row-control,
.dait-settings-row-stacked.dait-try-row .dait-try-field {
    display: contents;
}

.dait-try-row .dait-try-line {
    grid-area: control;
}

.dait-try-result {
    border-left: 3px solid var(--dait-divider);
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    grid-area: result;
    line-height: 1.5;
    margin: 2px 0 0;
    min-width: 0;
    overflow-wrap: anywhere;
    padding: 2px 0 2px 10px;
    white-space: pre-wrap;
}

.dait-try-time {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-caption);
    white-space: nowrap;
}

.dait-try-time::before {
    content: " · ";
}

.dait-try-result-error {
    border-left-color: var(--dait-danger);
}

.dait-try-result-error .dait-try-output {
    color: var(--dait-danger);
}

/* Prompt templates and the prompt editor (their own group on the translate and composer tabs). */
.dait-prompt-manager {
    display: grid;
    gap: var(--dait-space-3);
    min-width: 0;
}

.dait-prompt-manager-header {
    display: grid;
    gap: 2px;
}

.dait-prompt-manager-header > span {
    color: var(--dait-heading);
    font-size: var(--dait-font-heading);
    font-weight: 700;
    line-height: 1.3;
}

.dait-prompt-tools {
    align-items: center;
    display: grid;
    gap: var(--dait-space-2);
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    min-width: 0;
}

.dait-prompt-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--dait-space-2);
    grid-column: 1 / -1;
    min-width: 0;
}

.dait-prompt-editor {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.dait-prompt-editor > span {
    color: var(--dait-heading);
    font-size: var(--dait-font-label);
    font-weight: 500;
}

.dait-prompt-editor textarea {
    min-height: 160px;
}

/* Search results replace the tab page while a query is typed. */
.dait-settings-search-summary {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-caption);
    margin-bottom: var(--dait-space-2);
}

.dait-settings-search-list {
    display: grid;
    gap: 2px;
    list-style: none;
    margin: 0 -12px;
    padding: 0;
}

.dait-settings-search-result {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: var(--dait-radius-control);
    color: var(--dait-text);
    column-gap: var(--dait-space-3);
    cursor: pointer;
    display: grid;
    grid-template-areas:
        "label tab"
        "desc desc";
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 10px 12px;
    row-gap: 2px;
    text-align: left;
    width: 100%;
}

.dait-settings-search-result:hover,
.dait-settings-search-result:focus-visible {
    background: var(--dait-hover);
}

.dait-settings-search-result-label {
    color: var(--dait-heading);
    font-size: var(--dait-font-label);
    font-weight: 500;
    grid-area: label;
    min-width: 0;
}

.dait-settings-search-result-tab {
    background: var(--dait-surface-2);
    border-radius: var(--dait-radius-pill);
    color: var(--dait-text);
    font-size: var(--dait-font-chip);
    font-weight: 500;
    grid-area: tab;
    padding: 2px 8px;
    white-space: nowrap;
}

.dait-settings-search-result-description {
    color: var(--dait-text-muted);
    font-size: var(--dait-font-body);
    grid-area: desc;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Danger zone at the end of the data tab. */
.dait-settings-danger-zone .dait-settings-group-title {
    color: var(--dait-danger);
}

/* Narrower panel (BetterDiscord's own plugin-settings modal, small windows): the tab rail becomes a scrolling row
   under the search box, so the rows keep room for their text. */
@container dait-settings (max-width: 760px) {
    .dait-settings-header {
        padding-left: 16px;
    }

    .dait-settings-logo {
        display: none;
    }

    .dait-settings-body {
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto minmax(0, 1fr);
    }

    .dait-settings-rail {
        border-bottom: 1px solid var(--dait-divider);
        gap: var(--dait-space-2);
        overflow: visible;
        padding: 12px 16px 8px;
    }

    .dait-settings-tabs {
        flex-direction: row;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        padding-bottom: 4px;
        scrollbar-width: thin;
    }

    .dait-settings-tab {
        flex: 0 0 auto;
        white-space: nowrap;
        width: auto;
    }

    .dait-settings-content {
        padding: 16px 16px 24px;
    }
}

/* Narrow panel: rows put their control under the text (switches stay on the right). */
@container dait-settings (max-width: 600px) {
    .dait-settings-header-provider {
        display: none;
    }

    .dait-settings-row:not(.dait-settings-row-switch) {
        grid-template-columns: minmax(0, 1fr);
        row-gap: 8px;
    }

    .dait-settings-row:not(.dait-settings-row-switch) > .dait-row-control {
        justify-content: flex-start;
    }

    .dait-row-control > select,
    .dait-row-control > input:not([type="checkbox"]),
    .dait-row-control > .dait-segmented,
    .dait-row-control > .dait-language-controls {
        max-width: 100%;
    }

    .dait-prompt-tools {
        grid-template-columns: minmax(0, 1fr);
    }

    .dait-setup-item {
        grid-template-areas:
            "icon label action"
            ". detail action";
        grid-template-columns: 18px minmax(0, 1fr) auto;
        row-gap: 2px;
    }

    .dait-setup-detail {
        white-space: normal;
    }

    .dait-service-cards {
        grid-template-columns: minmax(0, 1fr);
    }
}
`;
