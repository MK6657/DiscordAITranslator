"use strict";

module.exports = `.dait-settings h2,
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

`;
