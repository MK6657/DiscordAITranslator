"use strict";

const { POLISH_PROMPT_TEMPLATE_CATEGORIES } = require("../../constants");

function normalizePromptText(value) {
    return String(value ?? "").replace(/\r\n?/g, "\n").trim();
}

const methods = {
    buildPromptManagerHeader() {
        const header = document.createElement("div");
        header.className = "dait-prompt-manager-header";

        const title = document.createElement("span");
        title.textContent = this.plugin.t("promptTemplates");
        header.appendChild(title);

        const desc = document.createElement("p");
        desc.className = "dait-row-description";
        desc.textContent = this.plugin.t("promptTemplatesDesc");
        header.appendChild(desc);
        return header;
    },

    buildPromptTemplatePickerBlock(idBase) {
        const tools = document.createElement("div");
        tools.className = "dait-prompt-tools";

        const search = document.createElement("input");
        search.type = "search";
        search.placeholder = this.plugin.t("promptSearch");
        search.setAttribute("aria-label", this.plugin.t("promptSearch"));
        tools.appendChild(search);

        const select = document.createElement("select");
        select.className = "dait-prompt-select";
        select.setAttribute("aria-label", this.plugin.t("promptTemplateSelect"));
        tools.appendChild(select);

        const actions = document.createElement("div");
        actions.className = "dait-prompt-actions";
        const apply = this.createSmallButton(this.plugin.t("promptApply"), "primary");
        apply.dataset.daitAction = "promptApply";
        const remove = this.createSmallButton(this.plugin.t("promptDelete"), "danger");
        remove.dataset.daitAction = "promptDelete";
        actions.appendChild(apply);
        actions.appendChild(remove);
        tools.appendChild(actions);

        const previewBlock = document.createElement("div");
        previewBlock.className = "dait-prompt-preview-block";
        const previewLabel = document.createElement("span");
        previewLabel.className = "dait-prompt-preview-label";
        previewLabel.id = `${idBase}-preview-label`;
        previewBlock.appendChild(previewLabel);
        const preview = document.createElement("div");
        preview.className = "dait-prompt-preview";
        preview.tabIndex = 0;
        preview.setAttribute("role", "region");
        preview.setAttribute("aria-labelledby", previewLabel.id);
        previewBlock.appendChild(preview);

        return { tools, search, select, apply, remove, previewBlock, previewLabel, preview };
    },

    buildPromptSaveRow(kind) {
        const saveRow = document.createElement("div");
        saveRow.className = kind === "polish"
            ? "dait-prompt-tools dait-prompt-save dait-prompt-save-categorized"
            : "dait-prompt-tools dait-prompt-save";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.maxLength = 80;
        nameInput.placeholder = this.plugin.t("promptNamePlaceholder");
        nameInput.setAttribute("aria-label", this.plugin.t("promptSaveNameLabel"));
        saveRow.appendChild(nameInput);

        let categorySelect = null;
        if (kind === "polish") {
            categorySelect = document.createElement("select");
            categorySelect.className = "dait-prompt-category-select";
            categorySelect.setAttribute("aria-label", this.plugin.t("promptTemplateCategoryLabel"));
            const defaultCategory = this.plugin.getPolishTemplateCategory(this.plugin.getActivePolishTemplate());
            POLISH_PROMPT_TEMPLATE_CATEGORIES.forEach(category => {
                const option = document.createElement("option");
                option.value = category;
                option.textContent = this.plugin.getPolishTemplateCategoryLabel(category);
                option.selected = category === defaultCategory;
                categorySelect.appendChild(option);
            });
            saveRow.appendChild(categorySelect);
        }

        const save = this.createSmallButton(this.plugin.t("promptSave"));
        save.dataset.daitAction = "promptSave";
        saveRow.appendChild(save);
        return { saveRow, nameInput, categorySelect, save };
    },

    buildPromptEditorBlock(kind, idBase) {
        const promptBlock = document.createElement("div");
        promptBlock.className = "dait-prompt-editor dait-settings-search-target";
        promptBlock.dataset.daitSearchLabel = this.plugin.t("prompt");
        promptBlock.dataset.daitSearchDescription = this.plugin.t("promptDesc");

        const promptLabel = document.createElement("span");
        promptLabel.id = `${idBase}-label`;
        promptLabel.textContent = this.plugin.t("prompt");
        promptBlock.appendChild(promptLabel);

        const promptDesc = document.createElement("p");
        promptDesc.className = "dait-row-description";
        promptDesc.id = `${idBase}-desc`;
        promptDesc.textContent = this.plugin.t("promptDesc");
        promptBlock.appendChild(promptDesc);

        const textarea = document.createElement("textarea");
        textarea.dataset.daitPath = `${kind}.prompt`;
        textarea.rows = 6;
        textarea.value = this.plugin.getSetting(`${kind}.prompt`) ?? "";
        textarea.setAttribute("aria-labelledby", promptLabel.id);
        textarea.setAttribute("aria-describedby", `${promptDesc.id} ${idBase}-status`);
        this.bindSettingsTextarea(textarea);
        promptBlock.appendChild(textarea);

        const footer = document.createElement("div");
        footer.className = "dait-prompt-editor-footer";
        const status = document.createElement("span");
        status.className = "dait-prompt-status";
        status.id = `${idBase}-status`;
        footer.appendChild(status);

        const editorActions = document.createElement("div");
        editorActions.className = "dait-prompt-actions";
        const update = this.createSmallButton(this.plugin.t("promptUpdate"));
        update.dataset.daitAction = "promptUpdate";
        const restorePresets = this.createSmallButton(this.plugin.t("promptRestorePresets"));
        restorePresets.dataset.daitAction = "promptRestorePresets";
        const copy = this.createSmallButton(this.plugin.t("promptCopy"));
        editorActions.appendChild(update);
        editorActions.appendChild(restorePresets);
        editorActions.appendChild(copy);
        footer.appendChild(editorActions);
        promptBlock.appendChild(footer);

        const saveControls = this.buildPromptSaveRow(kind);
        promptBlock.appendChild(saveControls.saveRow);

        return { promptBlock, textarea, status, update, restorePresets, copy, ...saveControls };
    },

    // Template picker (select only previews), read-only preview, the prompt editor and an inline "save as
    // template" name field. Only "Use template" replaces the prompt, after a confirmation when the current
    // prompt has edits that no template holds.
    createPromptManager(kind) {
        const manager = document.createElement("div");
        manager.className = "dait-prompt-manager";
        manager.dataset.daitPromptManager = kind;
        const idBase = `dait-prompt-${kind}-${Math.random().toString(36).slice(2, 8)}`;

        manager.appendChild(this.buildPromptManagerHeader());
        const picker = this.buildPromptTemplatePickerBlock(idBase);
        manager.appendChild(picker.tools);
        manager.appendChild(picker.previewBlock);
        const editor = this.buildPromptEditorBlock(kind, idBase);
        manager.appendChild(editor.promptBlock);

        const { search, select, apply, remove, previewLabel, preview } = picker;
        const { textarea, status, update, restorePresets, copy, nameInput, categorySelect, save } = editor;
        search.dataset.daitUiFocusId = `prompt-${kind}-search`;
        select.dataset.daitUiFocusId = `prompt-${kind}-select`;
        apply.dataset.daitUiFocusId = `prompt-${kind}-apply`;
        remove.dataset.daitUiFocusId = `prompt-${kind}-delete`;
        nameInput.dataset.daitUiFocusId = `prompt-${kind}-name`;
        if (categorySelect) categorySelect.dataset.daitUiFocusId = `prompt-${kind}-category`;
        save.dataset.daitUiFocusId = `prompt-${kind}-save`;
        update.dataset.daitUiFocusId = `prompt-${kind}-update`;
        restorePresets.dataset.daitUiFocusId = `prompt-${kind}-restore`;
        copy.dataset.daitUiFocusId = `prompt-${kind}-copy`;

        const getPromptValue = () => textarea.value ?? this.plugin.settings[kind]?.prompt ?? "";
        const findTemplate = id => (id ? this.plugin.getPromptTemplates(kind).find(template => template.id === id) : null) || null;
        // Nothing is lost when the prompt is empty or some template already holds exactly this text.
        const hasUnsavedEdits = prompt => Boolean(normalizePromptText(prompt))
            && !this.plugin.getPromptTemplates(kind).some(template => normalizePromptText(template.prompt) === normalizePromptText(prompt));

        const syncStatus = () => {
            const prompt = getPromptValue();
            const active = findTemplate(this.plugin.settings[kind]?.activePromptTemplate);
            const matching = active && normalizePromptText(active.prompt) === normalizePromptText(prompt)
                ? active
                : this.plugin.getPromptTemplates(kind).find(template => normalizePromptText(template.prompt) === normalizePromptText(prompt)) || null;
            // "Update current template" writes to the active template, so the status names it while it differs.
            status.textContent = matching
                ? this.plugin.t("promptUsingTemplate", { code: matching.serial, name: this.plugin.getPromptTemplateDisplayName(matching) })
                : active && normalizePromptText(prompt)
                    ? this.plugin.t("promptTemplateEdited", { code: active.serial, name: this.plugin.getPromptTemplateDisplayName(active) })
                    : this.plugin.t("promptTemplateCustom");
            update.disabled = !active || !normalizePromptText(prompt) || normalizePromptText(active.prompt) === normalizePromptText(prompt);
            update.title = active ? this.plugin.t("promptUpdateTitle", { code: active.serial, name: this.plugin.getPromptTemplateDisplayName(active) }) : "";
            restorePresets.disabled = this.plugin.getMissingBuiltInPromptTemplates(kind).length === 0;
        };

        const syncPreview = () => {
            const template = findTemplate(select.value);
            const inUse = Boolean(template) && template.id === this.plugin.settings[kind]?.activePromptTemplate;
            previewLabel.textContent = inUse ? `${this.plugin.t("promptPreview")} · ${this.plugin.t("promptPreviewActive")}` : this.plugin.t("promptPreview");
            preview.textContent = template ? String(template.prompt || "") : this.plugin.t("promptNoTemplate");
            apply.disabled = !template;
            remove.disabled = !template;
        };

        const renderOptions = (preferredId = "") => {
            const query = String(search.value || "").trim().toLowerCase();
            const templates = this.plugin.getPromptTemplates(kind)
                .filter(template => !query || this.plugin.getPromptTemplateSearchText(template).includes(query));
            const previous = preferredId || select.value;

            select.textContent = "";
            if (!templates.length) {
                const option = document.createElement("option");
                option.value = "";
                option.textContent = this.plugin.t("promptNoTemplate");
                select.appendChild(option);
                syncPreview();
                return;
            }

            const activeId = this.plugin.settings[kind]?.activePromptTemplate;
            const selectedId = [previous, activeId].find(id => id && templates.some(template => template.id === id)) || templates[0].id;
            const appendOption = (container, template) => {
                const option = document.createElement("option");
                option.value = template.id;
                option.textContent = this.plugin.getPromptTemplateLabel(template);
                option.selected = template.id === selectedId;
                container.appendChild(option);
            };
            if (kind === "polish") {
                POLISH_PROMPT_TEMPLATE_CATEGORIES.forEach(category => {
                    const groupTemplates = templates.filter(template => this.plugin.getPolishTemplateCategory(template) === category);
                    if (!groupTemplates.length) return;
                    const group = document.createElement("optgroup");
                    group.label = this.plugin.getPolishTemplateCategoryLabel(category);
                    groupTemplates.forEach(template => appendOption(group, template));
                    select.appendChild(group);
                });
            }
            else {
                templates.forEach(template => appendOption(select, template));
            }
            syncPreview();
        };

        const commitPrompt = prompt => {
            if (prompt !== this.plugin.settings[kind]?.prompt) this.plugin.setSetting(`${kind}.prompt`, prompt);
        };

        const saveTemplate = () => {
            const name = String(nameInput.value || "").trim();
            if (!name) {
                this.plugin.showToast(this.plugin.t("promptNameRequired"), "error");
                nameInput.focus?.();
                return;
            }
            const prompt = getPromptValue();
            commitPrompt(prompt);
            this.plugin.savePromptTemplate(kind, name, prompt, categorySelect ? { category: categorySelect.value } : {});
            nameInput.value = "";
            search.value = "";
            renderOptions(this.plugin.settings[kind]?.activePromptTemplate);
            syncStatus();
        };

        textarea.addEventListener("change", () => this.plugin.preserveSettingsScroll(textarea, () => this.plugin.setSetting(`${kind}.prompt`, textarea.value)));
        textarea.addEventListener("input", syncStatus);
        // The prompt set from elsewhere (another open settings panel, a template applied or deleted there).
        textarea.__daitAfterSync = () => {
            syncStatus();
            syncPreview();
        };
        search.addEventListener("input", () => renderOptions());
        select.addEventListener("change", syncPreview);
        apply.addEventListener("click", async () => {
            const template = findTemplate(select.value);
            if (!template) return;
            const current = getPromptValue();
            if (normalizePromptText(current) !== normalizePromptText(template.prompt) && hasUnsavedEdits(current)) {
                const confirmed = await this.plugin.confirmAction({
                    title: this.plugin.t("promptApplyUnsavedTitle"),
                    body: this.plugin.t("promptApplyUnsavedConfirm", { code: template.serial, name: this.plugin.getPromptTemplateDisplayName(template) }),
                    confirmText: this.plugin.t("promptApply"),
                    danger: true
                });
                if (!confirmed || !findTemplate(template.id)) return;
            }
            this.plugin.applyPromptTemplate(kind, template.id);
            textarea.value = this.plugin.settings[kind]?.prompt ?? template.prompt;
            renderOptions(template.id);
            syncStatus();
        });
        save.addEventListener("click", saveTemplate);
        nameInput.addEventListener("keydown", event => {
            if (event.key !== "Enter" || event.isComposing) return;
            event.preventDefault?.();
            saveTemplate();
        });
        update.addEventListener("click", () => {
            const active = findTemplate(this.plugin.settings[kind]?.activePromptTemplate);
            if (!active) return;
            const prompt = getPromptValue();
            commitPrompt(prompt);
            this.plugin.updatePromptTemplate(kind, active.id, prompt);
            renderOptions();
            syncStatus();
        });
        restorePresets.addEventListener("click", () => {
            this.plugin.restoreMissingBuiltInPromptTemplates(kind);
            renderOptions();
            syncStatus();
        });
        copy.addEventListener("click", () => this.copyPromptText(textarea));
        remove.addEventListener("click", async () => {
            const template = findTemplate(select.value);
            if (!template) return;
            // Deleting the template in use makes the next one active and replaces the prompt with it; say so.
            const fallback = template.id === this.plugin.settings[kind]?.activePromptTemplate
                ? this.plugin.getPromptTemplates(kind).find(item => item.id !== template.id) || null
                : null;
            const label = this.plugin.getPromptTemplateLabel(template);
            const confirmed = await this.plugin.confirmAction({
                title: this.plugin.t("promptDeleteConfirm"),
                body: fallback && normalizePromptText(fallback.prompt) !== normalizePromptText(getPromptValue())
                    ? [label, this.plugin.t("promptDeleteActiveNote", { code: fallback.serial, name: this.plugin.getPromptTemplateDisplayName(fallback) })]
                    : label,
                confirmText: this.plugin.t("promptDelete"),
                danger: true
            });
            if (!confirmed || !findTemplate(template.id)) return;
            const wasActive = this.plugin.settings[kind]?.activePromptTemplate === template.id;
            this.plugin.deletePromptTemplate(kind, template.id);
            if (wasActive) textarea.value = this.plugin.settings[kind]?.prompt ?? "";
            renderOptions();
            syncStatus();
        });

        manager.__daitGetDraftState = () => ({
            name: String(nameInput.value || ""),
            category: categorySelect ? String(categorySelect.value || "") : "",
            search: String(search.value || ""),
            selectedId: String(select.value || ""),
            prompt: String(textarea.value ?? "")
        });
        manager.__daitApplyDraftState = draft => {
            if (!draft || typeof draft !== "object") return;
            if (typeof draft.name === "string") nameInput.value = draft.name;
            if (categorySelect && typeof draft.category === "string" && POLISH_PROMPT_TEMPLATE_CATEGORIES.includes(draft.category)) {
                categorySelect.value = draft.category;
                [...(categorySelect.options || [])].forEach(opt => {
                    opt.selected = opt.value === draft.category;
                });
            }
            if (typeof draft.search === "string") search.value = draft.search;
            if (typeof draft.prompt === "string" && draft.prompt !== textarea.value) {
                textarea.value = draft.prompt;
            }
            renderOptions(typeof draft.selectedId === "string" ? draft.selectedId : "");
            syncStatus();
        };
        manager.__daitRefresh = () => {
            if (textarea !== (typeof document !== "undefined" ? document.activeElement : null)) {
                textarea.value = this.plugin.settings[kind]?.prompt ?? "";
            }
            renderOptions();
            syncStatus();
        };
        renderOptions();
        syncStatus();
        return manager;
    },

    async copyPromptText(textarea, successKey = "promptCopied") {
        const text = String(textarea?.value || "");
        const snapshot = this.plugin.getSettingsScrollSnapshot(textarea);
        try {
            await this.plugin.copyTextToClipboard(text);
            this.restoreSettingsScroll(snapshot);
            this.plugin.showToast(this.plugin.t(successKey), "success");
        }
        catch (error) {
            this.restoreSettingsScroll(snapshot);
            this.plugin.showToast(this.plugin.t("promptCopyFailed", { error: this.plugin.formatError(error) }), "error");
        }
    },

    async copyTextFromNode(node, successKey = "copiedToClipboard") {
        const text = String(node?.textContent || "");
        const snapshot = this.plugin.getSettingsScrollSnapshot(node);
        try {
            await this.plugin.copyTextToClipboard(text);
            this.restoreSettingsScroll(snapshot);
            this.plugin.showToast(this.plugin.t(successKey), "success");
        }
        catch (error) {
            this.restoreSettingsScroll(snapshot);
            this.plugin.showToast(this.plugin.t("promptCopyFailed", { error: this.plugin.formatError(error) }), "error");
        }
    }
};

module.exports = methods;
