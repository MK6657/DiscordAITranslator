"use strict";

// Dialog content rendered inside BetterDiscord's confirmation modal (outside the plugin roots, so it reads
// Discord's variables directly), the settings window's layer while such a dialog is open, and the parts of
// the prompt-template manager added with the preview and inline naming.
module.exports = `
/* Below Discord's layers and BetterDiscord's fallback modal (.bd-modal-wrapper, z-index 1000, earlier in the document). */
.dait-quick-settings-modal-root[data-dait-confirm-open="true"] {
    z-index: 999;
}

.dait-dialog {
    color: var(--text-default, var(--text-normal, #dbdee1));
    display: grid;
    font-size: 15px;
    gap: 12px;
    line-height: 1.5;
    min-width: 0;
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

.dait-dialog-list-conditional {
    color: var(--text-muted, #b5bac1);
}

.dait-dialog-list-erased {
    color: var(--text-danger, var(--text-feedback-critical, #f57f81));
    font-weight: 500;
}

.dait-dialog-note {
    color: var(--text-muted, #b5bac1);
    display: block;
    font-size: 13px;
    font-weight: 400;
}

.dait-dialog-list-erased .dait-dialog-note {
    color: inherit;
}

.dait-dialog-check {
    align-items: center;
    background: var(--background-secondary, #2b2d31);
    border: 1px solid var(--border-subtle, var(--background-modifier-accent, #3f4147));
    border-radius: 8px;
    color: var(--header-primary, var(--text-strong, #f2f3f5));
    cursor: pointer;
    display: flex;
    font-weight: 500;
    gap: 10px;
    padding: 12px;
}

.dait-dialog-check input {
    accent-color: var(--button-filled-brand-background, #4752c4);
    cursor: pointer;
    flex: none;
    height: 18px;
    margin: 0;
    width: 18px;
}

.dait-dialog-check input:focus-visible,
.dait-dialog-preview:focus-visible {
    outline: 2px solid var(--focus-primary, var(--brand-500, #5865f2));
    outline-offset: 2px;
}

.dait-dialog-preview {
    background: var(--background-secondary, #2b2d31);
    border-left: 3px solid var(--background-modifier-accent, #4e5058);
    border-radius: 4px;
    font-size: 14px;
    max-height: 220px;
    overflow: auto;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    white-space: pre-wrap;
}

.dait-small-button-primary {
    background: var(--dait-brand, var(--button-filled-brand-background, #4752c4));
    border-color: transparent;
    color: #ffffff;
}

.dait-small-button-primary:hover {
    background: var(--button-filled-brand-background-hover, #3c45a5);
    border-color: transparent;
}

.dait-small-button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

/* Prompt-template manager: readable sizes and one control height (UI-SPEC typography). */
.dait-prompt-manager {
    gap: 16px;
}

.dait-prompt-manager-header,
.dait-prompt-editor {
    gap: 6px;
}

.dait-prompt-manager-header > span,
.dait-prompt-editor > span {
    color: var(--dait-heading, var(--header-primary, #f2f3f5));
    font-size: 15px;
    font-weight: 500;
    line-height: 1.4;
}

.dait-prompt-manager .dait-row-description {
    font-size: 14px;
    line-height: 1.5;
}

.dait-prompt-manager .dait-prompt-tools {
    gap: 8px;
}

.dait-prompt-manager .dait-prompt-tools input,
.dait-prompt-manager .dait-prompt-tools select {
    border-radius: 4px;
    font-size: 14px;
    font-weight: 400;
    height: 32px;
    line-height: 20px;
    min-height: 32px;
    padding: 5px 10px;
}

/* The chevron (two gradient layers) keeps the positions from the settings stylesheet. */
.dait-prompt-manager .dait-prompt-tools select {
    padding-right: 34px;
}

.dait-prompt-manager .dait-prompt-editor textarea {
    border-radius: 4px;
    font-family: inherit;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.5;
    min-height: 160px;
    padding: 8px 10px;
}

.dait-prompt-manager .dait-small-button {
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    height: 32px;
    min-height: 32px;
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
    color: var(--dait-text-muted, var(--dait-muted-readable, var(--text-muted, #b5bac1)));
    font-size: 13px;
    font-weight: 600;
    line-height: 1.4;
}

.dait-prompt-preview {
    background: var(--dait-surface-2, var(--dait-card-soft, var(--background-secondary, #2b2d31)));
    border: 1px solid var(--dait-divider, var(--dait-border, var(--background-modifier-accent, #3f4147)));
    border-radius: 4px;
    color: var(--dait-text-muted, var(--dait-muted-readable, var(--text-muted, #b5bac1)));
    font-size: 14px;
    line-height: 1.5;
    max-height: 168px;
    min-width: 0;
    overflow: auto;
    overflow-wrap: anywhere;
    padding: 10px 12px;
    white-space: pre-wrap;
}

.dait-prompt-preview:focus-visible {
    outline: 2px solid var(--dait-brand, var(--focus-primary, var(--brand-500, #5865f2)));
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
    color: var(--dait-text-muted, var(--dait-muted-readable, var(--text-muted, #b5bac1)));
    font-size: 13px;
    line-height: 1.4;
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
