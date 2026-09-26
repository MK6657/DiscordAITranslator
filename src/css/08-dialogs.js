"use strict";

// Dialog content rendered inside BetterDiscord's confirmation modal, the settings window's layer while such a
// dialog is open, and the parts of the prompt-template manager added with the preview and inline naming. The
// dialog content carries data-dait-panel-theme like the other plugin windows, so its colours come from the panel
// palette (01-theme-tokens); when the chosen palette is not the one Discord's modal is drawn in (an explicit
// light/dark choice), the content brings its own background so it stays readable.
module.exports = `
/* Below Discord's layers and BetterDiscord's fallback modal (.bd-modal-wrapper, z-index 1000, earlier in the document). */
.dait-quick-settings-modal-root[data-dait-confirm-open="true"] {
    z-index: 999;
}

.dait-dialog {
    color: var(--dait-text);
    display: grid;
    font-size: var(--dait-font-body);
    gap: 12px;
    line-height: var(--dait-line);
    min-width: 0;
}

.dait-dialog[data-dait-dialog-surface="true"] {
    background: var(--dait-bg);
    border: 1px solid var(--dait-divider);
    border-radius: var(--dait-radius-card);
    padding: 16px;
}

.dait-dialog-text {
    margin: 0;
}

.dait-dialog-list {
    display: grid;
    gap: 4px;
    margin: 0;
    padding-left: 20px;
}

.dait-dialog-list-erased {
    color: var(--dait-danger);
    font-weight: 500;
}

.dait-dialog-note {
    color: inherit;
    display: block;
    font-size: var(--dait-font-body);
    font-weight: 400;
}

.dait-dialog-check {
    align-items: center;
    background: var(--dait-surface);
    border: 1px solid var(--dait-divider);
    border-radius: 8px;
    color: var(--dait-text);
    cursor: pointer;
    display: flex;
    font-weight: 600;
    gap: 10px;
    padding: 12px;
}

.dait-dialog-check input {
    accent-color: var(--dait-brand);
    cursor: pointer;
    flex: none;
    height: 18px;
    margin: 0;
    width: 18px;
}

.dait-dialog-check input:focus-visible,
.dait-dialog-preview:focus-visible {
    outline: 2px solid var(--dait-focus);
    outline-offset: 2px;
}

.dait-dialog-preview {
    background: var(--dait-surface);
    border-left: 3px solid var(--dait-input-border);
    border-radius: 4px;
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    max-height: 220px;
    overflow: auto;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    white-space: pre-wrap;
}

/* Prompt-template manager: the body size and one control height (UI-SPEC typography). */
.dait-prompt-manager {
    gap: 16px;
}

.dait-prompt-manager-header,
.dait-prompt-editor {
    gap: 6px;
}

.dait-prompt-manager-header > span,
.dait-prompt-editor > span {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    font-weight: 600;
    line-height: var(--dait-line);
}

.dait-prompt-manager .dait-row-description {
    font-size: var(--dait-font-body);
    line-height: var(--dait-line);
}

.dait-prompt-manager .dait-prompt-tools {
    gap: 8px;
}

.dait-prompt-manager .dait-prompt-tools input,
.dait-prompt-manager .dait-prompt-tools select {
    border-radius: 4px;
    font-size: var(--dait-font-body);
    font-weight: 400;
    height: var(--dait-control-h);
    line-height: 22px;
    min-height: var(--dait-control-h);
    padding: 6px 10px;
}

/* The chevron (two gradient layers) keeps the positions from the settings stylesheet. */
.dait-prompt-manager .dait-prompt-tools select {
    padding-right: 34px;
}

.dait-prompt-manager .dait-prompt-editor textarea {
    border-radius: 4px;
    font-family: inherit;
    font-size: var(--dait-font-body);
    font-weight: 400;
    line-height: var(--dait-line);
    min-height: 160px;
    padding: 8px 10px;
}

.dait-prompt-manager .dait-small-button {
    border-radius: 4px;
    font-size: var(--dait-font-body);
    font-weight: 500;
    height: var(--dait-control-h);
    min-height: var(--dait-control-h);
    padding: 0 14px;
}

.dait-prompt-manager .dait-prompt-actions {
    gap: 8px;
}

.dait-prompt-preview-block {
    display: grid;
    gap: 6px;
    min-width: 0;
}

.dait-prompt-preview-label {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    font-weight: 600;
    line-height: 1.4;
}

.dait-prompt-preview {
    background: var(--dait-surface);
    border: 1px solid var(--dait-divider);
    border-radius: 4px;
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    line-height: var(--dait-line);
    max-height: 168px;
    min-width: 0;
    overflow: auto;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    white-space: pre-wrap;
}

.dait-prompt-preview:focus-visible {
    outline: 2px solid var(--dait-focus);
    outline-offset: 2px;
}

/* Status caption right under the prompt, then its buttons at their natural width on one line. */
.dait-prompt-editor-footer {
    display: grid;
    gap: 8px;
    min-width: 0;
}

.dait-prompt-editor-footer .dait-prompt-actions {
    grid-column: auto;
    justify-content: flex-start;
}

.dait-prompt-manager .dait-prompt-actions .dait-small-button {
    flex: 0 0 auto;
}

.dait-prompt-status {
    color: var(--dait-text);
    font-size: var(--dait-font-body);
    line-height: var(--dait-line);
    min-width: 0;
    overflow-wrap: anywhere;
}

.dait-prompt-tools.dait-prompt-save {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.dait-prompt-tools.dait-prompt-save input {
    flex: 1 1 220px;
    width: auto;
}

.dait-prompt-tools.dait-prompt-save .dait-small-button {
    flex: none;
}
`;
