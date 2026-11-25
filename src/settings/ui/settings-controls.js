"use strict";

const {
    CUSTOM_LANGUAGE_VALUE,
    AUTO_LANGUAGE_VALUE,
    LANGUAGE_PRESETS,
    DEFAULT_SETTINGS
} = require("../../constants");
const { SETTINGS_CONTROL_WIDTH } = require("../settings-schema");

const methods = {
    createCheckboxRow(path, labelText, rowOptions = {}) {
        const input = document.createElement("input");
        input.type = "checkbox";
        input.className = "dait-switch";
        input.setAttribute("role", "switch");
        input.dataset.daitPath = path;
        input.checked = Boolean(this.plugin.getSetting(path));
        input.addEventListener("change", () => this.plugin.setSetting(path, input.checked));
        return this.createRow(labelText, input, { ...rowOptions, checkbox: true });
    },

    createApiKeyRow(kind) {
        const provider = String(this.plugin.settings[kind]?.provider || "");
        const input = document.createElement("input");
        input.type = "password";
        input.dataset.daitPath = `${kind}.apiKey`;
        input.placeholder = this.plugin.isProviderApiKeyOptional(provider)
            ? this.plugin.t("apiKeyOptionalPlaceholder")
            : ["deepseek", "openaiCompatible"].includes(provider) ? "sk-..." : "";
        input.autocomplete = "off";
        input.spellcheck = false;
        input.value = this.plugin.getSetting(`${kind}.apiKey`) ?? "";
        input.addEventListener("change", () => this.plugin.setSetting(`${kind}.apiKey`, input.value));
        const row = this.createRow(this.plugin.t("apiKey"), input, { description: this.getProviderFieldHelp("apiKey", provider), stacked: true });
        row.className = `${row.className} dait-api-key-field`;
        return row;
    },

    // Service status with its Test button, as a row (the connection card shows the same in its header).
    createProviderStatusRow(kind) {
        return this.createRow(this.plugin.t("providerStatus"), this.createProviderConnectionStatus(kind), { description: this.plugin.t("providerStatusDesc") });
    },

    createHotkeyRow(rowOptions = {}) {
        const controls = document.createElement("div");
        controls.className = "dait-hotkey-controls";

        // The recorder shows the current shortcut; its tooltip says that clicking it records a new one.
        const record = this.createSmallButton(this.plugin.getHotkeyLabel());
        record.classList.add("dait-hotkey-recorder");
        record.title = this.plugin.t("hotkeyRecord");

        const reset = this.createSmallButton(this.plugin.t("hotkeyReset"), "link");
        reset.addEventListener("click", () => {
            this.plugin.setSetting("ui.polishHotkey", DEFAULT_SETTINGS.ui.polishHotkey);
            record.textContent = this.plugin.getHotkeyLabel();
            this.plugin.showToast(this.plugin.t("hotkeySaved", { shortcut: this.plugin.getHotkeyLabel() }), "success");
        });

        record.addEventListener("click", () => this.plugin.recordHotkey(record));

        controls.appendChild(record);
        controls.appendChild(reset);
        return this.createRow(this.plugin.t("polishHotkey"), controls, { ...rowOptions, description: this.plugin.t("polishHotkeyDesc") });
    },

    createInputRow(path, labelText, type, placeholder, attrs = {}, rowOptions = {}) {
        const input = document.createElement("input");
        input.type = type;
        input.dataset.daitPath = path;
        input.placeholder = placeholder || "";
        input.value = this.plugin.getSetting(path) ?? "";
        Object.entries(attrs).forEach(([key, value]) => input.setAttribute(key, value));
        const commit = (options = {}) => {
            const saveOptions = options.immediate
                ? { save: "immediate", retryOnError: false }
                : (options.live ? { save: "debounce", live: true } : undefined);
            if (type !== "number") {
                const rawText = String(input.value ?? "");
                const trimOnCommit = options.immediate && (path.endsWith(".model") || path.endsWith(".endpoint"));
                const nextText = trimOnCommit ? rawText.trim() : rawText;
                if (trimOnCommit && nextText !== input.value) input.value = nextText;
                this.plugin.setSetting(path, nextText, saveOptions);
                if (options.immediate && path.endsWith(".model")) {
                    const kind = path.split(".")[0];
                    this.refreshModelHistoryDatalist(input, kind);
                }
                return;
            }
            const raw = String(input.value ?? "").trim();
            if (!raw) {
                if (options.force) this.plugin.syncSettingControls(path, this.plugin.getSetting(path));
                return;
            }
            const parsed = Number(raw);
            if (!Number.isFinite(parsed)) {
                if (options.force) this.plugin.syncSettingControls(path, this.plugin.getSetting(path), { includeActive: true });
                return;
            }
            if (!options.force && input.validity && input.validity.valid === false) return;
            this.plugin.setSetting(path, parsed, saveOptions);
        };
        if (type === "number") {
            input.addEventListener("input", () => commit());
            input.addEventListener("blur", () => commit({ force: true, immediate: true }));
            input.addEventListener("pointerup", () => setTimeout(() => commit(), 0));
            input.addEventListener("keyup", () => setTimeout(() => commit(), 0));
        }
        else {
            input.addEventListener("input", () => commit({ live: true }));
            input.addEventListener("blur", () => commit({ force: true, immediate: true }));
        }
        input.addEventListener("change", () => commit({ force: true, immediate: true }));
        return this.createRow(labelText, input, rowOptions);
    },

    createTextareaRow(path, labelText, rowOptions = {}) {
        const textarea = document.createElement("textarea");
        textarea.dataset.daitPath = path;
        textarea.rows = 6;
        textarea.value = this.plugin.getSetting(path) ?? "";
        this.bindSettingsTextarea(textarea);
        textarea.addEventListener("change", () => this.plugin.preserveSettingsScroll(textarea, () => this.plugin.setSetting(path, textarea.value)));
        return this.createRow(labelText, textarea, { ...rowOptions, stacked: true });
    },

    createSelectRow(path, labelText, options, rowOptions = {}) {
        const select = document.createElement("select");
        select.dataset.daitPath = path;
        // A route-scoped control (the channel rule) stays bound to the channel it was built for.
        const routeKey = typeof rowOptions.routeKey === "string" ? rowOptions.routeKey : null;
        if (routeKey !== null) select.dataset.daitRouteKey = routeKey;
        const current = routeKey !== null && path === "ui.currentChannelAutoTranslatePolicy"
            ? this.plugin.getCurrentChannelAutoTranslatePolicyMode(routeKey)
            : this.plugin.getSetting(path);

        // Entries are [value, text] pairs, or { label, options } for an <optgroup>.
        const appendOption = (parent, [value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = String(value) === String(current);
            parent.appendChild(option);
        };
        options.forEach(entry => {
            if (entry && !Array.isArray(entry) && Array.isArray(entry.options)) {
                const group = document.createElement("optgroup");
                group.label = entry.label;
                group.setAttribute("label", entry.label);
                entry.options.forEach(option => appendOption(group, option));
                select.appendChild(group);
                return;
            }
            appendOption(select, entry);
        });

        select.addEventListener("change", () => {
            if (path.endsWith(".provider")) {
                this.plugin.setTaskProvider(path.split(".")[0], select.value);
                this.replaceSettingsPanelFrom(select);
                return;
            }
            this.plugin.setSetting(path, select.value, routeKey !== null ? { routeKey } : undefined);
            if (path === "ui.language") {
                const panel = select.closest?.(".dait-settings");
                if (panel) this.plugin.replaceSettingsPanelElement(panel);
            }
        });

        return this.createRow(labelText, select, rowOptions);
    },

    createLanguageRow(kind, field, labelText, descriptionText, options = {}) {
        const current = String(this.plugin.settings[kind]?.[field] || "");
        const preset = LANGUAGE_PRESETS.find(language => language.value === current);
        const isAuto = options.allowAuto && current === AUTO_LANGUAGE_VALUE;
        const isCustom = !preset && !isAuto;

        const controls = document.createElement("div");
        controls.className = "dait-language-controls";
        controls.dataset.daitPath = `${kind}.${field}`;
        controls.dataset.daitControl = "language";
        controls.dataset.daitAllowAuto = options.allowAuto ? "true" : "false";

        const select = document.createElement("select");
        select.className = "dait-language-select";

        if (options.allowAuto) {
            const autoOption = document.createElement("option");
            autoOption.value = AUTO_LANGUAGE_VALUE;
            autoOption.textContent = this.plugin.t("autoDetectLanguage");
            autoOption.selected = isAuto;
            select.appendChild(autoOption);
        }

        LANGUAGE_PRESETS.forEach(language => {
            const option = document.createElement("option");
            option.value = language.value;
            option.textContent = this.plugin.getLanguageLabel(language);
            option.selected = language.value === current;
            select.appendChild(option);
        });

        const customOption = document.createElement("option");
        customOption.value = CUSTOM_LANGUAGE_VALUE;
        customOption.textContent = this.plugin.t("customLanguage");
        customOption.selected = isCustom;
        select.appendChild(customOption);

        const customInput = document.createElement("input");
        customInput.type = "text";
        customInput.className = "dait-language-custom";
        customInput.placeholder = this.plugin.t("customLanguagePlaceholder");
        // The custom-language note is the custom field's own description, not a second sentence under the row.
        customInput.title = this.plugin.t("customLanguageDesc");
        customInput.setAttribute("aria-description", this.plugin.t("customLanguageDesc"));
        customInput.setAttribute("aria-label", `${labelText}: ${this.plugin.t("customLanguage")}`);
        customInput.value = isCustom ? current : "";
        customInput.hidden = !isCustom;

        select.addEventListener("change", () => {
            if (select.value === AUTO_LANGUAGE_VALUE) {
                customInput.hidden = true;
                customInput.value = "";
                this.plugin.setSetting(`${kind}.${field}`, AUTO_LANGUAGE_VALUE);
                return;
            }

            if (select.value === CUSTOM_LANGUAGE_VALUE) {
                customInput.hidden = false;
                customInput.focus();
                if (customInput.value.trim()) this.plugin.setSetting(`${kind}.${field}`, customInput.value.trim());
                return;
            }

            customInput.hidden = true;
            customInput.value = "";
            this.plugin.setSetting(`${kind}.${field}`, select.value);
        });

        customInput.addEventListener("change", () => {
            const value = customInput.value.trim();
            if (value) this.plugin.setSetting(`${kind}.${field}`, value);
        });

        controls.__daitLanguageSelect = select;
        controls.__daitLanguageCustom = customInput;
        controls.appendChild(select);
        controls.appendChild(customInput);

        // The longer note about custom language names is the custom field's tooltip.
        return this.createRow(labelText, controls, { description: descriptionText, labelFor: select, ariaTarget: controls });
    },

    syncLanguageControl(control, value) {
        const select = control?.__daitLanguageSelect || control?.querySelector?.(".dait-language-select");
        const customInput = control?.__daitLanguageCustom || control?.querySelector?.(".dait-language-custom");
        if (!select || !customInput) return;
        const allowAuto = control?.dataset?.daitAllowAuto === "true";
        const current = String(value ?? "");
        const preset = LANGUAGE_PRESETS.find(language => language.value === current);
        const isAuto = allowAuto && current === AUTO_LANGUAGE_VALUE;
        const isCustom = Boolean(current) && !preset && !isAuto;
        const wantedSelectValue = isAuto
            ? AUTO_LANGUAGE_VALUE
            : (preset ? preset.value : (isCustom ? CUSTOM_LANGUAGE_VALUE : (select.options?.[0]?.value || "")));
        Array.from(select.options || []).forEach(option => {
            option.selected = option.value === wantedSelectValue;
        });
        select.value = wantedSelectValue;
        customInput.hidden = !isCustom;
        if (customInput !== (typeof document !== "undefined" ? document.activeElement : null)) {
            customInput.value = isCustom ? current : "";
        }
    },

    createSmallButton(text, variant = "") {
        const button = document.createElement("button");
        button.className = `dait-small-button ${variant ? `dait-small-button-${variant}` : ""}`.trim();
        button.type = "button";
        button.textContent = text;
        return button;
    },

    // One settings row (UI-SPEC): a div with the label and a one-line description on the left and the control on
    // the right. Options:
    //   description      help text under the label (aria-describedby on the control)
    //   disabledReason   locks the control and shows the reason instead of the description
    //   checkbox         the control is a switch
    //   stacked / wide   label above a full-width control, help below (long values: URLs, keys, prompts)
    //   dependsOn        { path, label }: indented under its parent switch and disabled, with the reason, while it is off
    //   labelFor         the element inside a composite control that the <label> names
    //   ariaTarget       a composite control (radiogroup) named through aria-labelledby
    // Only form fields get a <label for>; rows of action buttons use a plain text label, so a click on the row text
    // never presses a button.
    createRow(labelText, control, options = {}) {
        const id = this.createSettingsControlId();
        const stacked = Boolean(options.stacked || options.wide);
        const classes = ["dait-settings-row"];
        if (options.checkbox) classes.push("dait-settings-row-switch");
        if (stacked) classes.push("dait-settings-row-stacked");
        if (options.dependsOn) classes.push("dait-settings-row-dependent");
        if (options.disabledReason) classes.push("dait-settings-row-inactive");
        const row = document.createElement("div");
        row.className = classes.join(" ");
        row.id = `${id}-row`;

        const labelTarget = options.labelFor || (this.isSettingsLabelableControl(control) ? control : null);
        const ariaTarget = options.ariaTarget || null;
        const text = document.createElement("div");
        text.className = "dait-row-text";
        const label = document.createElement(labelTarget ? "label" : "span");
        label.className = "dait-row-label";
        label.id = `${id}-label`;
        label.textContent = labelText;
        if (labelTarget) {
            if (!labelTarget.id) labelTarget.id = id;
            label.setAttribute("for", labelTarget.id);
        }
        if (ariaTarget && ariaTarget !== labelTarget) {
            ariaTarget.setAttribute("aria-labelledby", label.id);
        }
        text.appendChild(label);

        const descriptionText = options.disabledReason || options.description || "";
        let description = null;
        if (descriptionText || options.dependsOn) {
            description = document.createElement("p");
            description.className = "dait-row-description";
            description.id = `${id}-desc`;
            description.textContent = descriptionText;
            description.hidden = !descriptionText;
            text.appendChild(description);
            (labelTarget || ariaTarget)?.setAttribute("aria-describedby", description.id);
        }

        const cell = document.createElement("div");
        cell.className = "dait-row-control";
        cell.appendChild(control);
        row.appendChild(text);
        row.appendChild(cell);

        // Search reads these, so a temporary "turn on X first" text does not change what the row is found by.
        row.dataset.daitSearchLabel = String(labelText || "");
        row.dataset.daitSearchDescription = String(options.description || "");
        if (control?.dataset?.daitPath) row.dataset.daitRowPath = control.dataset.daitPath;
        row.__daitDescription = description;

        if (options.disabledReason) {
            // A locked control always shows why it is locked in place of its usual description.
            row.dataset.daitLocked = "true";
            this.getSettingsRowControls(control).forEach(node => { node.disabled = true; });
        }
        if (options.dependsOn?.path) {
            row.dataset.daitDependsOn = options.dependsOn.path;
            row.dataset.daitDependsOnLabel = String(options.dependsOn.label || "");
            this.applySettingsRowDependency(row);
        }
        return row;
    },

    isSettingsLabelableControl(control) {
        const tag = String(control?.tagName || "").toUpperCase();
        if (tag === "SELECT" || tag === "TEXTAREA") return true;
        return tag === "INPUT" && String(control.type || "").toLowerCase() !== "hidden";
    },

    // Form controls and buttons in a row (or the element itself when it is one), in document order.
    getSettingsRowControls(root) {
        const found = [];
        const isControl = node => ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(String(node?.tagName || "").toUpperCase());
        const visit = node => {
            if (!node) return;
            if (isControl(node)) found.push(node);
            for (const child of node.children || []) visit(child);
        };
        visit(root);
        return found;
    },

    // A dependent row is usable only while its parent switch is on; otherwise it says which switch to turn on.
    applySettingsRowDependency(row) {
        const path = row?.dataset?.daitDependsOn;
        if (!path) return;
        const inactive = !this.plugin.getSetting(path);
        const locked = row.dataset.daitLocked === "true";
        row.classList?.toggle?.("dait-settings-row-inactive", inactive || locked);
        if (locked) return;
        this.getSettingsRowControls(row.children?.[1] || row).forEach(node => { node.disabled = inactive; });
        // An ordered list re-renders so its first/last arrow buttons stay disabled.
        if (!inactive) {
            const list = row.children?.[1]?.children?.[0];
            if (list?.dataset?.daitControl === "order-list") this.renderProviderFallbackOrderList(list);
        }
        const description = row.__daitDescription;
        if (!description) return;
        const text = inactive
            ? this.plugin.t("settingsRequiresParent", { parent: row.dataset.daitDependsOnLabel || "" })
            : String(row.dataset.daitSearchDescription || "");
        description.textContent = text;
        description.hidden = !text;
    },

    syncSettingsDependentRows(root = null, changedPath = "") {
        const scope = root || (typeof document !== "undefined" ? document : null);
        let rows = [];
        try {
            rows = [...(scope?.querySelectorAll?.(".dait-settings-row-dependent") || [])];
        }
        catch {
            rows = [];
        }
        rows.forEach(row => {
            if (changedPath && row.dataset?.daitDependsOn !== changedPath) return;
            this.applySettingsRowDependency(row);
        });
    },

    // A segmented control (role=radiogroup) for a short list of exclusive choices. Arrow keys move the choice.
    // Labels that do not fit the shared control width make the row a stacked one.
    createSegmentedRow(path, labelText, choices, rowOptions = {}) {
        const group = document.createElement("div");
        group.className = "dait-segmented";
        group.setAttribute("role", "radiogroup");
        group.dataset.daitPath = path;
        group.dataset.daitControl = "segmented";
        // A route-scoped control (the channel rule) stays bound to the channel it was built for.
        const routeKey = typeof rowOptions.routeKey === "string" ? rowOptions.routeKey : null;
        if (routeKey !== null) group.dataset.daitRouteKey = routeKey;
        const current = routeKey !== null && path === "ui.currentChannelAutoTranslatePolicy"
            ? this.plugin.getCurrentChannelAutoTranslatePolicyMode(routeKey)
            : this.plugin.getSetting(path);

        const choose = (value, focus = false) => {
            this.syncSegmentedControl(group, value);
            if (focus) this.focusSettingsElement(group.__daitSegmentedButtons.find(button => button.dataset.daitValue === value));
            this.plugin.setSetting(path, value, routeKey !== null ? { routeKey } : undefined);
        };
        group.__daitSegmentedButtons = choices.map(([value, text]) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "dait-segmented-option";
            button.setAttribute("role", "radio");
            button.dataset.daitValue = String(value);
            button.textContent = text;
            button.title = text;
            button.addEventListener("click", () => choose(String(value)));
            group.appendChild(button);
            return button;
        });
        group.addEventListener("keydown", event => {
            const buttons = group.__daitSegmentedButtons.filter(button => !button.disabled);
            if (!buttons.length) return;
            const steps = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
            const index = Math.max(0, buttons.findIndex(button => button.getAttribute("aria-checked") === "true"));
            let next = null;
            if (steps[event?.key]) next = (index + steps[event.key] + buttons.length) % buttons.length;
            else if (event?.key === "Home") next = 0;
            else if (event?.key === "End") next = buttons.length - 1;
            if (next === null) return;
            event.preventDefault?.();
            choose(buttons[next].dataset.daitValue, true);
        });
        this.syncSegmentedControl(group, current);
        const stacked = rowOptions.stacked ?? !this.segmentedLabelsFit(choices.map(([, text]) => text));
        return this.createRow(labelText, group, { ...rowOptions, ariaTarget: group, stacked });
    },

    syncSegmentedControl(group, value) {
        const buttons = group?.__daitSegmentedButtons || [...(group?.children || [])];
        const wanted = String(value ?? "");
        const matched = buttons.some(button => button.dataset?.daitValue === wanted);
        buttons.forEach((button, index) => {
            const checked = matched ? button.dataset?.daitValue === wanted : index === 0;
            button.setAttribute("aria-checked", checked ? "true" : "false");
            button.setAttribute("tabindex", checked ? "0" : "-1");
        });
        if (group?.dataset) group.dataset.daitValue = wanted;
    },

    // Rough text width at the segmented control's 15 px font: CJK characters are 1em, other characters ~0.55em (a
    // generous estimate). Options are as wide as their labels plus 6 px padding on each side (css/04 .dait-segmented),
    // so the labels fit when together they need no more than the control width less its 1 px border, 2 px padding
    // and the 2 px gaps between options.
    segmentedLabelsFit(labels, controlWidth = SETTINGS_CONTROL_WIDTH) {
        const count = labels.length || 1;
        const available = controlWidth - 6 - 2 * (count - 1);
        const needed = labels.reduce((total, label) => total + 12
            + [...String(label || "")].reduce((sum, char) => sum + (/[⺀-鿿豈-﫿＀-￯]/.test(char) ? 15 : 8.3), 0), 0);
        return needed <= available;
    },

    syncSettingControls(path, value, options = {}) {
        // Every settings write passes here: the quick panel and the launcher status follow it.
        this.plugin.quickPanel?.handleSettingChanged(path);
        if (typeof document === "undefined") return;
        if (path === "ui.providerFallbackOrder") value = this.plugin.formatProviderFallbackOrder(value);
        const channelRule = path === "ui.currentChannelAutoTranslatePolicy";
        if (channelRule) value = this.plugin.normalizeChannelAutoTranslatePolicyMode(value);
        const syncedChannel = channelRule && typeof options.routeKey === "string" ? this.plugin.getChannelAutoTranslatePolicyStorageKey(options.routeKey) : null;
        document.querySelectorAll(`[data-dait-path='${path}']`).forEach(control => {
            const containsActive = control === document.activeElement
                || (control.dataset?.daitControl === "language" && Boolean(document.activeElement && control.contains?.(document.activeElement)));
            if (containsActive && options.includeActive !== true) return;
            // A channel-rule control built for another channel keeps showing that channel's rule.
            if (syncedChannel !== null && typeof control.dataset?.daitRouteKey === "string"
                && this.plugin.getChannelAutoTranslatePolicyStorageKey(control.dataset.daitRouteKey) !== syncedChannel) return;
            if (control.type === "checkbox") {
                control.checked = Boolean(value);
                return;
            }
            if (control.dataset?.daitControl === "language") {
                this.syncLanguageControl(control, value);
                return;
            }
            if (control.dataset?.daitControl === "segmented") {
                this.syncSegmentedControl(control, value);
                return;
            }
            if (control.dataset?.daitControl === "order-list") {
                this.renderProviderFallbackOrderList(control);
                return;
            }

            control.value = value ?? "";
            // A control that shows state derived from its value (the prompt manager's status) refreshes it.
            if (typeof control.__daitAfterSync === "function") control.__daitAfterSync();
        });
        // A model preset select shows the preset matching the model field, or "custom".
        const modelKind = /^(polish|translation)\.model$/.exec(path)?.[1];
        if (modelKind) {
            document.querySelectorAll?.(`[data-dait-model-preset='${modelKind}']`)?.forEach(select => {
                const options = [...(select.options || [])];
                select.value = options.some(option => option.value && option.value === value) ? value : "";
            });
        }
        // The message-button select shows both stored settings; rows that depend on a switch follow it.
        if (path === "ui.injectMessageButtons" || path === "ui.messageButtonVisibility") {
            this.plugin.syncSettingControls("ui.messageButtonMode", this.getMessageButtonMode(), { includeActive: true });
        }
        this.syncSettingsDependentRows(null, path);
        if (/^(polish|translation)\.(provider|apiKey|endpoint|model|enableThinking|region|deeplPlan|appId|secretKey)$/.test(path)
            || path === "googleTranslate.keyPoolText") {
            this.refreshSavedServiceConfigControls();
        }
        // The overview's checklist and service cards report on the service, auto-translate and channel settings.
        this.scheduleOverviewStatusRefresh(path);
    },

    commitSettingsControls(root = null) {
        const scope = root?.querySelectorAll ? root : (typeof document !== "undefined" ? document : null);
        if (!scope?.querySelectorAll) return;
        scope.querySelectorAll("[data-dait-path]").forEach(control => {
            const path = String(control?.dataset?.daitPath || "");
            if (!path) return;
            // The channel rule saves on change and is scoped to the channel it was built for; re-committing it on
            // close would copy that value onto whichever channel is current now.
            if (path === "ui.currentChannelAutoTranslatePolicy") return;
            let nextValue;
            if (control.dataset?.daitControl === "language") {
                const select = control.__daitLanguageSelect || control.querySelector?.(".dait-language-select");
                const customInput = control.__daitLanguageCustom || control.querySelector?.(".dait-language-custom");
                if (!select) return;
                if (select.value === CUSTOM_LANGUAGE_VALUE) {
                    const custom = String(customInput?.value ?? "").trim();
                    if (!custom) return;
                    nextValue = custom;
                }
                else {
                    nextValue = select.value;
                }
            }
            else if (control.tagName === "TEXTAREA" || control.tagName === "SELECT") {
                nextValue = control.value;
            }
            else if (control.type === "checkbox") {
                nextValue = Boolean(control.checked);
            }
            else if (control.type === "number") {
                const raw = String(control.value ?? "").trim();
                if (!raw) return;
                const parsed = Number(raw);
                if (!Number.isFinite(parsed)) return;
                nextValue = parsed;
            }
            else if (control.type) {
                const rawValue = String(control.value ?? "");
                nextValue = (path.endsWith(".model") || path.endsWith(".endpoint")) ? rawValue.trim() : rawValue;
                if (nextValue !== control.value) control.value = nextValue;
            }
            else {
                return;
            }
            if (/^(polish|translation)\.model$/.test(path) && nextValue) {
                const kind = path.split(".")[0];
                const provider = this.plugin.normalizeProviderForTask?.(kind, this.plugin.settings?.[kind]?.provider);
                if (provider) this.plugin.rememberTaskProviderModel?.(kind, provider, nextValue);
            }
            if (Object.is(this.plugin.getSetting(path), nextValue)) return;
            this.plugin.setSetting(path, nextValue);
        });
    },

    bindSettingsTextarea(textarea) {
        textarea.spellcheck = false;
        ["contextmenu", "copy", "cut", "mouseup"].forEach(type => {
            textarea.addEventListener(type, () => this.restoreSettingsScrollSoon(textarea));
        });
    },

    refreshLocalizedUi() {
        if (typeof document === "undefined") return;
        this.plugin.cancelLightweightButtonRecovery();
        this.plugin.nonTranslatableMessageCache = typeof WeakMap === "function" ? new WeakMap() : null;
        this.plugin.lastMissingMessageButtonSweepAt = 0;
        this.plugin.removePolishResultPanel();
        this.plugin.removePolishRestoreControl();
        this.plugin.removeInputActionMenu();
        this.plugin.removePolishPresetMenu();
        // The settings windows and the quick panel stay open and switch language in place.
        this.refreshSettingsWindowsLocale();
        this.plugin.quickPanel?.rerender?.("language");
        this.plugin.restoreAllTranslationSourceVisibility();
        document.querySelectorAll(".dait-message-button, .dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button, .dait-input-action-menu, .dait-polish-preset-menu, .dait-input-action-group, .dait-quick-settings-button").forEach(node => node.remove());
        document.querySelectorAll(".dait-translation-line, .dait-translation-box").forEach(node => node.remove());
        this.plugin.unpatchContextMenus();
        this.plugin.patchMessageContextMenu();
        this.plugin.queueScan();
    },

    // Rebuilds every open settings panel that still shows another language, in place and on the same tab (the
    // panel keeps its scroll position and focused control), and renames the plugin's own settings window.
    refreshSettingsWindowsLocale() {
        if (typeof document === "undefined") return 0;
        const locale = this.plugin.getLocale();
        this.getQuickSettingsModalRoots().forEach(root => {
            this.findQuickSettingsDialog(root)?.setAttribute?.("aria-label", this.plugin.t("settingsTitle"));
        });
        let rebuilt = 0;
        [...(document.querySelectorAll?.(".dait-settings") || [])].forEach(panel => {
            if (!panel || panel.isConnected === false || panel.dataset?.daitLocale === locale) return;
            if (this.plugin.replaceSettingsPanelElement(panel)) rebuilt++;
        });
        return rebuilt;
    }
};

module.exports = methods;
