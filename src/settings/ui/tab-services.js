"use strict";

const {
    DEEPSEEK_MODELS,
    LOCAL_MODEL_PRESETS,
    LOCAL_PROVIDER_AUTO_MODEL_VALUE,
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    POLISH_REPOLISH_SOURCE_LAST_RESULT,
    GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT,
    GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT
} = require("../../constants");

const methods = {
    createTaskSection(kind, titleText, descriptionText) {
        const section = this.createSettingsGroup(titleText, kind, { description: descriptionText });

        section.appendChild(this.plugin.createCheckboxRow(`${kind}.enabled`, this.plugin.t("enabled"), { description: this.plugin.t("enabledDesc") }));
        section.appendChild(this.createSavedServiceConfigsRow(kind));
        section.appendChild(this.plugin.createSelectRow(`${kind}.provider`, this.plugin.t("provider"), this.getGroupedProviderOptionsForTask(kind), {
            description: this.plugin.t(kind === "polish" ? "providerPolishDesc" : "providerDesc")
        }));
        const capabilities = this.plugin.getProviderCapabilities(this.plugin.settings[kind]?.provider);
        const ui = capabilities.ui || {};
        const providerSettings = this.createTaskProviderSettingsBlock(kind, ui);
        if (providerSettings) section.appendChild(providerSettings);
        // Translation reads channel messages; polishing reads the user's draft.
        if (ui.sourceLanguage) {
            const sourceKey = kind === "polish" ? "inputLanguage" : "messageLanguage";
            section.appendChild(this.createLanguageRow(kind, "sourceLanguage", this.plugin.t(sourceKey), this.plugin.t(`${sourceKey}Desc`), { allowAuto: true }));
        }
        if (ui.targetLanguage) section.appendChild(this.createLanguageRow(kind, "targetLanguage", kind === "polish" ? this.plugin.t("outputLanguage") : this.plugin.t("targetLanguage"), kind === "polish" ? this.plugin.t("outputLanguageDesc") : this.plugin.t("targetLanguageDesc")));

        if (kind === "polish") {
            section.appendChild(this.plugin.createSelectRow("polish.afterAction", this.plugin.t("afterPolishing"), [
                ["replace", this.plugin.t("afterReplace")],
                ["confirmSend", this.plugin.t("afterConfirmSend")]
            ], { description: this.plugin.t("afterPolishingDesc") }));
            section.appendChild(this.plugin.createSelectRow("polish.repolishSource", this.plugin.t("repolishSource"), [
                [POLISH_REPOLISH_SOURCE_ORIGINAL, this.plugin.t("repolishSourceOriginal")],
                [POLISH_REPOLISH_SOURCE_LAST_RESULT, this.plugin.t("repolishSourceLastResult")]
            ], { description: this.plugin.t("repolishSourceDesc") }));
        }
        return section;
    },

    // Translation providers are listed in two groups: LLMs (also usable for polishing) and translation engines.
    getGroupedProviderOptionsForTask(kind) {
        const options = this.plugin.getProviderOptionsForTask(kind);
        const machine = options.filter(([provider]) => this.plugin.isDirectTranslateProvider(provider));
        if (!machine.length) return options;
        const models = options.filter(([provider]) => !this.plugin.isDirectTranslateProvider(provider));
        return [
            { label: this.plugin.t("providerGroupAi"), options: models },
            { label: this.plugin.t("providerGroupMachine"), options: machine }
        ];
    },

    // Shared verified service configs: any passing connection test saves a reusable preset here, so users can
    // apply the same provider + credentials + model across translation and polishing in one click (or sync directly).
    createSavedServiceConfigsRow(kind) {
        const bar = document.createElement("div");
        bar.className = "dait-service-config-bar";
        bar.dataset.daitSavedConfigBar = kind;

        const select = document.createElement("select");
        select.className = "dait-service-config-select";
        select.dataset.daitSavedConfigs = kind;
        select.setAttribute("aria-label", this.plugin.t("savedServiceConfigs"));
        bar.appendChild(select);

        const otherKind = kind === "translation" ? "polish" : "translation";
        const syncButton = this.createSmallButton(this.plugin.t(kind === "translation" ? "syncConfigToPolish" : "syncConfigToTranslation"), "outline");
        syncButton.classList.add("dait-service-config-sync");
        syncButton.dataset.daitAction = "syncServiceConfig";
        syncButton.dataset.daitKind = kind;
        bar.appendChild(syncButton);

        const deleteButton = this.createSmallButton(this.plugin.t("savedServiceConfigDelete"), "danger");
        deleteButton.classList.add("dait-service-config-delete");
        deleteButton.dataset.daitAction = "deleteSavedServiceConfig";
        deleteButton.dataset.daitKind = kind;
        bar.appendChild(deleteButton);

        this.renderSavedServiceConfigBar(bar, kind);

        select.addEventListener("change", () => {
            const configId = String(select.value || "").trim();
            if (!configId) return;
            if (this.plugin.applySavedServiceConfig(kind, configId)) {
                this.replaceSettingsPanelFrom(select);
            }
        });
        syncButton.addEventListener("click", event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            this.plugin.syncTaskServiceConfig(kind, otherKind);
        });
        deleteButton.addEventListener("click", event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            const matched = this.plugin.findMatchingSavedServiceConfig(kind);
            if (!matched) return;
            this.plugin.deleteSavedServiceConfig(matched.id);
        });

        return this.createRow(this.plugin.t("savedServiceConfigs"), bar, {
            description: this.plugin.t("savedServiceConfigsDesc"),
            stacked: true,
            labelFor: select
        });
    },

    renderSavedServiceConfigBar(bar, kind) {
        if (!bar) return;
        const select = bar.querySelector?.(`[data-dait-saved-configs='${kind}']`);
        const syncButton = bar.querySelector?.("[data-dait-action='syncServiceConfig']");
        const deleteButton = bar.querySelector?.("[data-dait-action='deleteSavedServiceConfig']");
        const configs = this.plugin.getSavedServiceConfigsForTask(kind);
        const matched = this.plugin.findMatchingSavedServiceConfig(kind);
        const matchedId = matched?.id || "";

        if (select) {
            [...(select.children || [])].forEach(child => child.remove?.());
            select.textContent = "";
            const placeholder = document.createElement("option");
            placeholder.value = "";
            placeholder.textContent = configs.length
                ? this.plugin.t("savedServiceConfigsPlaceholder", { count: configs.length })
                : this.plugin.t("savedServiceConfigsEmpty");
            placeholder.selected = !matchedId;
            select.appendChild(placeholder);
            configs.forEach(entry => {
                const option = document.createElement("option");
                option.value = entry.id;
                option.textContent = this.plugin.formatServiceConfigLabel(entry);
                option.selected = entry.id === matchedId;
                select.appendChild(option);
            });
            select.value = matchedId;
            select.disabled = !configs.length;
        }
        if (syncButton) {
            const otherKind = kind === "translation" ? "polish" : "translation";
            const currentProvider = String(this.plugin.settings[kind]?.provider || "");
            const allowed = this.plugin.isProviderAllowedForTask(otherKind, currentProvider);
            const usable = this.plugin.hasUsableApiConfig(kind);
            syncButton.disabled = !allowed || !usable;
            syncButton.title = !allowed
                ? this.plugin.t("syncConfigUnsupportedPolish")
                : !usable
                    ? this.plugin.t("syncConfigMissing")
                    : this.plugin.t(kind === "translation" ? "syncConfigToPolish" : "syncConfigToTranslation");
        }
        if (deleteButton) {
            deleteButton.hidden = !matchedId;
            deleteButton.disabled = !matchedId;
        }
    },

    refreshSavedServiceConfigControls(root = null) {
        if (typeof document === "undefined") return;
        const scope = root?.querySelectorAll ? root : document;
        let bars = [];
        try {
            bars = [...(scope?.querySelectorAll?.("[data-dait-saved-config-bar]") || [])];
        }
        catch {
            bars = [];
        }
        bars.forEach(bar => {
            const kind = String(bar?.dataset?.daitSavedConfigBar || "");
            if (kind === "translation" || kind === "polish") this.renderSavedServiceConfigBar(bar, kind);
        });
        if (!root) this.plugin.quickPanel?.scheduleUpdate?.();
    },

    // The connection card: status and Test in its header, then only the fields the selected provider uses.
    // Rarely changed model parameters and an optional API key sit behind <details>.
    createTaskProviderSettingsBlock(kind, ui = this.plugin.getProviderCapabilities(this.plugin.settings[kind]?.provider).ui || {}) {
        const provider = String(this.plugin.settings[kind]?.provider || "");
        const defaults = this.plugin.getProviderDefaults(provider) || {};
        const block = document.createElement("div");
        block.className = "dait-provider-settings-block";
        block.dataset.daitProvider = provider;

        const header = document.createElement("div");
        header.className = "dait-provider-settings-header";
        const title = document.createElement("span");
        title.className = "dait-provider-settings-title";
        title.textContent = `${this.plugin.t("providerSettingsTitle")} · ${this.plugin.getProviderDisplayName(provider)}`;
        title.title = this.plugin.t("providerSettingsDesc");
        header.appendChild(title);
        if (ui.apiTest || ui.apiKey) {
            header.appendChild(this.createProviderConnectionStatus(kind));
            // Search finds the card (and its Test button) by the card title or "Test".
            header.className = `${header.className} dait-settings-search-target`;
            header.dataset.daitSearchLabel = title.textContent;
            header.dataset.daitSearchDescription = this.plugin.t("providerStatusDesc");
        }
        block.appendChild(header);

        let hasRows = false;
        const append = (node, parent = block) => {
            if (!node) return;
            hasRows = true;
            parent.appendChild(node);
        };
        const apiKeyOptional = Boolean(ui.apiKey && this.plugin.isProviderApiKeyOptional(provider));

        if (ui.apiKey && !apiKeyOptional) append(this.createApiKeyRow(kind));
        const customCredentialFields = (this.plugin.providerLayer?.registry?.getCredentialFields?.(provider) || [])
            .filter(field => field && !["apiKey", "region", "deeplPlan", "appId", "secretKey"].includes(field));
        customCredentialFields.forEach(field => {
            append(this.createInputRow(`${kind}.${field}`, field, "password", "", {}, { stacked: true }));
        });
        if (ui.endpoint) append(this.createInputRow(`${kind}.endpoint`, this.plugin.t("endpoint"), "text", defaults.endpoint || "", {}, { description: this.getProviderFieldHelp("endpoint", provider), stacked: true }));
        if (ui.region) append(this.createInputRow(`${kind}.region`, this.plugin.t("providerRegion"), "text", "eastus", {}, { description: this.plugin.t("providerRegionDesc") }));
        if (ui.deeplPlan) append(this.plugin.createSelectRow(`${kind}.deeplPlan`, this.plugin.t("deeplPlan"), [
            ["free", this.plugin.t("deeplPlanFree")],
            ["pro", this.plugin.t("deeplPlanPro")]
        ], { description: this.plugin.t("deeplPlanDesc") }));
        if (ui.baiduCredentials) {
            append(this.createInputRow(`${kind}.appId`, this.plugin.t("baiduAppId"), "text", "", {}, { description: this.plugin.t("baiduAppIdDesc") }));
            append(this.createInputRow(`${kind}.secretKey`, this.plugin.t("baiduSecretKey"), "password", "", {}, { description: this.plugin.t("baiduSecretKeyDesc"), stacked: true }));
        }
        if (ui.deepseekPreset) append(this.createDeepSeekModelRow(kind));
        // Sakura local and OpenAI-compatible: the model field has "Detect models" and a picker (Sakura's presets
        // live in that picker, so there is no separate preset row). DeepSeek and other free-text model providers
        // show a direct text input with remembered model history so users can type any current or future model.
        if (ui.model && this.plugin.isModelDetectionProvider(provider)) {
            const modelRow = this.createModelFieldRow(kind);
            append(modelRow);
            const detectUi = modelRow?.__daitModelDetectUi;
            const endpointInput = block.querySelector?.(`[data-dait-path='${kind}.endpoint']`);
            if (detectUi && endpointInput?.addEventListener) {
                let previousOrigin = this.getProviderEndpointOrigin(this.plugin.getTaskConfig(kind));
                let lastDetection = null;
                let detectionTimer = null;
                endpointInput.addEventListener("change", () => {
                    clearTimeout(detectionTimer);
                    const config = this.plugin.getTaskConfig(kind);
                    const { endpoint, apiKey, apiKeyOrigin } = config;
                    const origin = this.getProviderEndpointOrigin(config);
                    const originChanged = origin !== previousOrigin;
                    previousOrigin = origin;
                    if (!this.plugin.isStarted || config.provider !== provider || originChanged || !origin || !String(endpoint || "").trim()) return;
                    if ((apiKeyOrigin ?? origin) !== origin || (!this.plugin.isLoopbackEndpoint(origin) && !String(apiKey || "").trim())) return;
                    const extraFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(provider) || [];
                    const snapshot = { provider, endpoint, apiKey, apiKeyOrigin };
                    extraFields.forEach(field => {
                        if (field && !Object.prototype.hasOwnProperty.call(snapshot, field)) snapshot[field] = config[field];
                    });
                    const lifecycleToken = this.plugin.getLifecycleToken();
                    detectionTimer = setTimeout(() => {
                        if (!endpointInput.isConnected || !this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                            || !this.matchesModelDetectionConfig(kind, snapshot)
                            || (lastDetection && Object.keys(snapshot).every(field => snapshot[field] === lastDetection[field]))) return;
                        lastDetection = snapshot;
                        this.runModelDetection(kind, { ...detectUi, auto: true });
                    }, 0);
                });
            }
        }
        else if (ui.model) {
            const row = this.createInputRow(`${kind}.model`, this.plugin.t("model"), "text", defaults.model || "", { spellcheck: "false", autocomplete: "off" }, { description: this.getProviderFieldHelp("model", provider), stacked: true });
            const modelInput = row?.querySelector?.(`[data-dait-path='${kind}.model']`);
            if (modelInput) this.attachModelHistoryDatalist(modelInput, kind, modelInput.parentElement);
            append(row);
        }
        if (kind === "translation" && ui.googleTranslateSettings) append(this.createGoogleTranslateSettings());

        if (ui.enableThinking || ui.temperature || ui.maxTokens) {
            const details = this.createSettingsDetails(this.plugin.t("settingsMoreModelParams"), "model-params");
            if (ui.enableThinking) append(this.plugin.createCheckboxRow(`${kind}.enableThinking`, this.plugin.t("thinkingMode"), { description: this.plugin.t("thinkingModeDesc") }), details);
            if (ui.temperature) append(this.createInputRow(`${kind}.temperature`, this.plugin.t("temperature"), "number", "0.4", { min: "0", max: "2", step: "0.1" }, { description: this.plugin.t("temperatureDesc") }), details);
            if (ui.maxTokens) append(this.createInputRow(`${kind}.maxTokens`, this.plugin.t("maxTokens"), "number", "800", { min: "1", step: "1" }, { description: this.plugin.t("maxTokensDesc") }), details);
            block.appendChild(details);
        }
        if (apiKeyOptional) {
            const details = this.createSettingsDetails(this.plugin.t("settingsApiKeyOptional"), "api-key");
            // Open it when a key is already saved, so it is not forgotten.
            details.open = Boolean(String(this.plugin.settings[kind]?.apiKey || "").trim());
            append(this.createApiKeyRow(kind), details);
            block.appendChild(details);
        }
        if (hasRows) block.appendChild(this.createTryTaskRow(kind));

        return hasRows ? block : null;
    },

    // Help text that fits the selected service (endpoint, model, API key); other services use the general text.
    getProviderFieldHelp(field, provider) {
        const keys = {
            endpoint: { deepseek: "endpointDeepSeekDesc", openaiCompatible: "endpointOpenAIDesc", sakuraLocal: "endpointLocalDesc", microsoft: "endpointMicrosoftDesc", baidu: "endpointBaiduDesc" },
            model: { deepseek: "modelDesc", openaiCompatible: "modelOpenAIDesc", sakuraLocal: "modelLocalDesc" },
            apiKey: { deepseek: "apiKeyDeepSeekDesc", openaiCompatible: "apiKeyOpenAIDesc", sakuraLocal: "apiKeyLocalDesc", microsoft: "apiKeyMicrosoftDesc", deepl: "apiKeyDeepLDesc" }
        };
        const fallback = { endpoint: "endpointDesc", model: "modelDesc", apiKey: "apiKeyDesc" }[field] || "";
        const key = keys[field]?.[String(provider || "")] || fallback;
        return key ? this.plugin.t(key) : "";
    },

    // The model field of Sakura local and OpenAI-compatible: the name, "Detect models", and a picker below with the
    // server's models (after detection) and, for Sakura, "use the loaded model" plus common models. The picker
    // follows the field (data-dait-model-preset), and picking writes the field.
    createModelFieldRow(kind) {
        const provider = String(this.plugin.settings[kind]?.provider || "");
        const defaults = this.plugin.getProviderDefaults(provider) || {};
        const local = this.plugin.isLocalTranslationProvider(provider);
        const field = document.createElement("div");
        field.className = "dait-model-field";

        const line = document.createElement("div");
        line.className = "dait-model-field-line";
        const input = document.createElement("input");
        input.type = "text";
        input.dataset.daitPath = `${kind}.model`;
        input.placeholder = defaults.model || "";
        input.spellcheck = false;
        input.autocomplete = "off";
        input.value = this.plugin.getSetting(`${kind}.model`) ?? "";
        const commitModel = (immediate = false) => {
            const raw = String(input.value ?? "");
            const next = immediate ? raw.trim() : raw;
            if (immediate && next !== input.value) input.value = next;
            this.plugin.setSetting(`${kind}.model`, next, immediate ? { save: "immediate", retryOnError: false } : { save: "debounce", live: true });
            if (immediate) this.refreshModelHistoryDatalist(input, kind);
        };
        input.addEventListener("input", () => commitModel(false));
        input.addEventListener("blur", () => commitModel(true));
        input.addEventListener("change", () => commitModel(true));
        line.appendChild(input);
        this.attachModelHistoryDatalist(input, kind, field);
        const detect = this.createSmallButton(this.plugin.t("modelDetect"), "outline");
        detect.dataset.daitAction = "detectModels";
        detect.dataset.daitKind = kind;
        line.appendChild(detect);
        field.appendChild(line);

        const picker = document.createElement("select");
        picker.className = "dait-model-picker";
        picker.dataset.daitModelPreset = kind;
        picker.setAttribute("aria-label", this.plugin.t("modelPicker"));
        this.renderModelPickerOptions(picker, kind, []);
        // OpenAI-compatible services have no presets: the picker appears once the server has listed its models.
        picker.hidden = !local;
        picker.addEventListener("change", () => {
            if (!picker.value) {
                this.focusSettingsElement(input);
                return;
            }
            this.plugin.setSetting(`${kind}.model`, picker.value);
        });
        field.appendChild(picker);

        let description = this.getProviderFieldHelp("model", provider);
        if (local && this.plugin.isLocalProviderAutoModelValue(this.plugin.settings[kind]?.model)) {
            const snapshot = this.plugin.getLocalProviderDetectedModelSnapshot(this.plugin.settings[kind]);
            if (snapshot?.model) description = this.plugin.t("modelLocalLoadedDesc", { model: snapshot.model });
        }
        const row = this.createRow(this.plugin.t("model"), field, { description, stacked: true, labelFor: input });
        row.classList.add("dait-model-field-row");
        const status = row.__daitDescription;
        status?.setAttribute?.("aria-live", "polite");
        const detectUi = { button: detect, picker, status, input };
        row.__daitModelDetectUi = detectUi;
        detect.addEventListener("click", event => {
            event?.preventDefault?.();
            this.runModelDetection(kind, detectUi);
        });
        return row;
    },

    renderModelPickerOptions(picker, kind, detected = [], loaded = "") {
        if (!picker) return;
        const provider = String(this.plugin.settings[kind]?.provider || "");
        const local = this.plugin.isLocalTranslationProvider(provider);
        const current = String(this.plugin.settings[kind]?.model || "");
        [...(picker.children || [])].forEach(child => child.remove?.());
        picker.textContent = "";
        const option = (parent, value, text) => {
            const node = document.createElement("option");
            node.value = value;
            node.textContent = text;
            node.selected = value === current;
            parent.appendChild(node);
            return node;
        };
        const group = label => {
            const node = document.createElement("optgroup");
            node.label = label;
            node.setAttribute("label", label);
            picker.appendChild(node);
            return node;
        };
        const listed = new Set();
        if (local) {
            option(picker, LOCAL_PROVIDER_AUTO_MODEL_VALUE, this.plugin.t("modelPickerServerLoaded"));
            listed.add(LOCAL_PROVIDER_AUTO_MODEL_VALUE);
        }
        const fresh = detected.filter(model => model && !listed.has(model));
        if (fresh.length) {
            const parent = group(this.plugin.t("modelPickerDetected"));
            fresh.forEach(model => {
                listed.add(model);
                option(parent, model, model === loaded ? this.plugin.t("modelPickerLoadedTag", { model: this.plugin.getDiagnosticModelLabel(model) }) : model);
            });
        }
        if (local) {
            const presets = LOCAL_MODEL_PRESETS.filter(([value]) => !listed.has(value));
            if (presets.length) {
                const parent = group(this.plugin.t("modelPickerPresets"));
                presets.forEach(([value, text]) => option(parent, value, text));
            }
        }
        const other = option(picker, "", this.plugin.t("modelPickerOther"));
        const known = [...(picker.querySelectorAll?.("option") || [])].some(node => node.value && node.value === current);
        if (!known) other.selected = true;
        picker.value = known ? current : "";
    },

    getProviderEndpointOrigin(config) {
        try {
            const url = new URL(this.plugin.getEffectiveChatCompletionEndpoint(config));
            return url.protocol === "https:" || url.protocol === "http:" ? url.origin : "";
        }
        catch {
            return "";
        }
    },

    hasApiKeyOriginMismatch(config) {
        return this.plugin.isModelDetectionProvider(config?.provider)
            && typeof config.apiKeyOrigin === "string"
            && Boolean(String(config.apiKey || "").trim())
            && config.apiKeyOrigin !== this.getProviderEndpointOrigin(config);
    },

    matchesModelDetectionConfig(kind, snapshot) {
        const current = this.plugin.getTaskConfig(kind);
        return Object.keys(snapshot).every(field => snapshot[field] === current[field]);
    },

    // "Detect models": asks the server for its models, fills the picker + input datalist, and says what it found.
    async runModelDetection(kind, { button = null, picker = null, status = null, input = null, auto = false } = {}) {
        const lifecycleToken = this.plugin.getLifecycleToken();
        if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return null;
        const taskConfig = this.plugin.getTaskConfig(kind);
        const { provider, endpoint, apiKey, apiKeyOrigin, model } = taskConfig;
        const snapshotBase = { provider, endpoint, apiKey, apiKeyOrigin, model };
        const extraFields = this.plugin.providerLayer?.registry?.getCredentialFields?.(provider) || [];
        extraFields.forEach(field => {
            if (field && !Object.prototype.hasOwnProperty.call(snapshotBase, field)) snapshotBase[field] = taskConfig[field];
        });
        let snapshot = Object.freeze(snapshotBase);
        const origin = this.getProviderEndpointOrigin(snapshot);
        const previousOrigin = apiKeyOrigin ?? origin;
        if (auto && (!origin || previousOrigin !== origin)) return null;

        const runs = this.plugin.modelDetectionRuns ??= new Map();
        const previous = runs.get(kind);
        const sequence = (previous?.sequence || 0) + 1;
        const controller = new AbortController();
        const { signal } = controller;
        const isLatest = () => runs.get(kind)?.sequence === sequence;
        const isCurrent = () => isLatest() && !signal.aborted && this.plugin.isLifecycleTokenCurrent(lifecycleToken)
            && this.matchesModelDetectionConfig(kind, snapshot);

        runs.set(kind, { sequence, controller, button, lifecycleToken });
        previous?.controller?.abort();
        if (previous?.button && previous.button !== button && this.plugin.isLifecycleTokenCurrent(previous.lifecycleToken)) {
            this.plugin.setButtonBusy(previous.button, false, this.plugin.t("modelDetect"));
        }
        this.plugin.setButtonBusy(button, true, this.plugin.t("modelDetectBusy"));
        try {
            let omitApiKey = false;
            if (origin && previousOrigin !== origin) {
                const hasKey = Boolean(String(apiKey || "").trim());
                const loopback = this.plugin.isLoopbackEndpoint(origin);
                if (hasKey && !loopback) {
                    const confirmed = await this.plugin.confirmAction({
                        title: this.plugin.t("modelDetectConfirmOrigin"),
                        body: this.plugin.t("modelDetectConfirmOriginDesc", { origin }),
                        confirmText: this.plugin.t("modelDetect")
                    });
                    if (!confirmed || !isCurrent()) return null;
                }
                omitApiKey = hasKey && loopback && !this.plugin.isLoopbackEndpoint(previousOrigin);
                if (!omitApiKey) {
                    if (!isCurrent()) return null;
                    this.plugin.getTaskConfig(kind).apiKeyOrigin = origin;
                    snapshot = Object.freeze({ ...snapshot, apiKeyOrigin: origin });
                    this.plugin.saveSettings({ debounce: true });
                    this.refreshApiTestViews(kind);
                    if (kind === "translation") this.plugin.queueScan();
                }
            }

            if (!isCurrent()) return null;
            const { models, loaded } = await this.plugin.detectProviderModels(kind, { config: snapshot, omitApiKey, signal, isCurrent });
            if (!isCurrent()) return null;
            this.renderModelPickerOptions(picker, kind, models, loaded);
            if (picker && models.length) picker.hidden = false;
            if (input && models.length) this.refreshModelHistoryDatalist(input, kind, models);
            const text = !models.length
                ? this.plugin.t("modelDetectNone")
                : loaded
                    ? this.plugin.t("modelDetectFoundLoaded", { count: models.length, model: this.plugin.getDiagnosticModelLabel(loaded) })
                    : this.plugin.t("modelDetectFound", { count: models.length });
            if (status) {
                status.textContent = text;
                status.hidden = false;
                status.classList?.remove?.("dait-row-description-error");
            }
            return { models, loaded };
        }
        catch (error) {
            if (!isCurrent() || this.plugin.isRequestCancelled(error)) return null;
            const text = this.plugin.t("modelDetectFailed", { error: this.plugin.formatError(error) });
            if (status) {
                status.textContent = text;
                status.hidden = false;
                status.classList?.add?.("dait-row-description-error");
            }
            return null;
        }
        finally {
            if (isLatest()) {
                runs.set(kind, { sequence });
                if (this.plugin.isLifecycleTokenCurrent(lifecycleToken)) this.plugin.setButtonBusy(button, false, this.plugin.t("modelDetect"));
            }
        }
    },

    // "Try a sentence" (translation) / "Try polishing" (composer), at the end of the connection card: runs one
    // sentence through the task with the settings as they are now (like the old test mode) and shows the result with
    // the time it took. Nothing is sent to Discord.
    createTryTaskRow(kind) {
        const polish = kind === "polish";
        const wrap = document.createElement("div");
        wrap.className = "dait-try-field";

        const line = document.createElement("div");
        line.className = "dait-try-line";
        const input = document.createElement("input");
        input.type = "text";
        input.className = "dait-try-input";
        input.placeholder = this.plugin.t(polish ? "tryPolishPlaceholder" : "tryTranslatePlaceholder");
        input.autocomplete = "off";
        line.appendChild(input);
        const run = this.createSmallButton(this.plugin.t(polish ? "tryPolishRun" : "tryTranslateRun"));
        run.dataset.daitAction = "tryTask";
        run.dataset.daitKind = kind;
        line.appendChild(run);
        wrap.appendChild(line);

        const result = document.createElement("p");
        result.className = "dait-try-result";
        result.setAttribute("aria-live", "polite");
        result.hidden = true;
        const output = document.createElement("span");
        output.className = "dait-try-output";
        result.appendChild(output);
        const time = document.createElement("span");
        time.className = "dait-try-time";
        result.appendChild(time);
        wrap.appendChild(result);

        const tryHistory = { text: "", results: [] };
        const start = () => this.plugin.runTryTask(kind, input.value, { button: run, result, output, time, tryHistory });
        run.addEventListener("click", event => {
            event?.preventDefault?.();
            start();
        });
        input.addEventListener("keydown", event => {
            if (event?.key !== "Enter" || event.isComposing) return;
            event.preventDefault?.();
            start();
        });

        const row = this.createRow(this.plugin.t(polish ? "tryPolish" : "tryTranslate"), wrap, {
            description: this.plugin.t(polish ? "tryPolishDesc" : "tryTranslateDesc"),
            stacked: true,
            labelFor: input
        });
        // The result shows under the help text (its own grid area in CSS), so the help stays next to the field.
        row.classList.add("dait-try-row");
        return row;
    },

    async runTryTask(kind, text, { button = null, result = null, output = null, time = null, tryHistory = null } = {}) {
        const sample = String(text || "").trim();
        const show = (value, seconds = "", failed = false) => {
            if (output) output.textContent = value;
            if (time) {
                time.textContent = seconds ? this.plugin.t("tryResultTime", { time: seconds }) : "";
                time.hidden = !seconds;
            }
            if (result) {
                result.hidden = !value;
                result.classList?.toggle?.("dait-try-result-error", Boolean(failed));
            }
        };
        if (!sample) {
            show(this.plugin.t("tryInputRequired"), "", true);
            return null;
        }
        const lifecycleToken = this.plugin.getLifecycleToken();
        const label = button?.textContent || "";
        this.plugin.setButtonBusy(button, true, this.plugin.t("tryBusy"));
        const startedAt = Date.now();
        try {
            let translated;
            if (kind === "polish") {
                const sameSample = tryHistory && tryHistory.text === sample;
                const previousResults = sameSample ? tryHistory.results.slice(-5) : [];
                translated = await this.plugin.runPolishWithGuards(sample, {
                    mode: "test",
                    previousResults,
                    enforceRepolishVariation: previousResults.length > 0,
                    isStillCurrent: () => this.plugin.isLifecycleTokenCurrent(lifecycleToken)
                });
                if (tryHistory && String(translated || "").trim()) {
                    if (tryHistory.text !== sample) {
                        tryHistory.text = sample;
                        tryHistory.results = [];
                    }
                    const cleaned = String(translated).trim();
                    if (!tryHistory.results.includes(cleaned)) {
                        tryHistory.results.push(cleaned);
                        if (tryHistory.results.length > 5) tryHistory.results = tryHistory.results.slice(-5);
                    }
                }
            }
            else {
                translated = await this.plugin.runModelTask(kind, sample, { mode: "test" });
            }
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return null;
            show(String(translated ?? ""), this.formatLatency(Date.now() - startedAt));
            return translated;
        }
        catch (error) {
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return null;
            show(this.plugin.formatError(error), this.formatLatency(Date.now() - startedAt), true);
            return null;
        }
        finally {
            if (this.plugin.isLifecycleTokenCurrent(lifecycleToken)) this.plugin.setButtonBusy(button, false, label);
        }
    },

    createSettingsDetails(summaryText, key) {
        const details = document.createElement("details");
        details.className = `dait-settings-details dait-settings-details-${key}`;
        const summary = document.createElement("summary");
        summary.className = "dait-settings-details-summary";
        summary.textContent = summaryText;
        details.appendChild(summary);
        return details;
    },

    // Status badge, the last test's details ("Hy-MT2 · 820 ms · just now") and Test.
    createProviderConnectionStatus(kind) {
        const wrap = document.createElement("span");
        wrap.className = "dait-provider-connection";
        const status = this.createApiStatusBadge(kind);
        wrap.appendChild(status);
        wrap.appendChild(this.createApiTestDetail(kind));
        const test = this.createSmallButton(this.plugin.t("apiTest"));
        test.dataset.daitAction = "apiTest";
        test.dataset.daitKind = kind;
        test.addEventListener("click", event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            this.runOverviewApiTest(kind, test, status);
        });
        wrap.appendChild(test);
        return wrap;
    },

    // Prompt templates and the prompt editor belong to the task, not to the provider connection.
    createTaskPromptSection(kind) {
        const ui = this.plugin.getProviderCapabilities(this.plugin.settings[kind]?.provider)?.ui || {};
        if (!ui.promptManager) return null;
        const group = this.createSettingsGroup("", `${kind}-prompt`);
        const manager = this.createPromptManager(kind);
        manager.className = `${manager.className || ""} dait-settings-search-target`.trim();
        manager.dataset.daitSearchLabel = this.plugin.t("promptTemplates");
        manager.dataset.daitSearchDescription = this.plugin.t("promptTemplatesDesc");
        group.appendChild(manager);
        return group;
    },

    createDeepSeekModelRow(kind) {
        const select = document.createElement("select");
        // The preset follows the model field (syncSettingControls), so the two never disagree.
        select.dataset.daitModelPreset = kind;
        const current = this.plugin.settings[kind]?.model;

        const custom = document.createElement("option");
        custom.value = "";
        custom.textContent = this.plugin.t("customModel");
        custom.selected = !DEEPSEEK_MODELS.some(([value]) => value === current);
        select.appendChild(custom);

        DEEPSEEK_MODELS.forEach(([value, text]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            option.selected = value === current;
            select.appendChild(option);
        });

        select.addEventListener("change", () => {
            if (!select.value) return;
            this.plugin.setSetting(`${kind}.model`, select.value);
            this.plugin.showToast(this.plugin.t("modelSet", { model: select.options[select.selectedIndex].textContent }), "success");
        });

        return this.createRow(this.plugin.t("deepseekPreset"), select, { description: this.plugin.t("deepseekPresetDesc") });
    },

    createGoogleTranslateSettings() {
        const block = document.createElement("div");
        block.className = "dait-google-settings";

        const header = document.createElement("div");
        header.className = "dait-settings-subheading";
        const title = document.createElement("span");
        title.textContent = this.plugin.t("googleTranslateTitle");
        header.appendChild(title);
        block.appendChild(header);

        block.appendChild(this.createTextareaRow("googleTranslate.keyPoolText", this.plugin.t("googleTranslateKeys"), {
            description: this.plugin.t("googleTranslateKeysDesc")
        }));
        block.appendChild(this.createInputRow("googleTranslate.defaultMonthlyLimit", this.plugin.t("googleTranslateDefaultLimit"), "number", String(GOOGLE_TRANSLATE_DEFAULT_MONTHLY_LIMIT), {
            min: "1",
            max: String(GOOGLE_TRANSLATE_MAX_MONTHLY_LIMIT),
            step: "1000"
        }, { description: this.plugin.t("googleTranslateDefaultLimitDesc") }));
        block.appendChild(this.plugin.createCheckboxRow("googleTranslate.allowPrefetch", this.plugin.t("googleTranslateAllowPrefetch"), {
            description: this.plugin.t("googleTranslateAllowPrefetchDesc")
        }));
        block.appendChild(this.createGoogleTranslateStatsRow());
        return block;
    },

    createGoogleTranslateStatsRow() {
        const controls = document.createElement("div");
        controls.className = "dait-cache-actions";
        const reset = this.createSmallButton(this.plugin.t("googleTranslateResetStats"), "danger");
        reset.addEventListener("click", async () => {
            const confirmed = await this.plugin.confirmAction({
                title: this.plugin.t("googleTranslateResetStats"),
                body: this.plugin.t("googleTranslateResetConfirm"),
                confirmText: this.plugin.t("googleTranslateResetStats"),
                danger: true
            });
            if (!confirmed) return;
            this.plugin.resetGoogleTranslateUsageStats();
            const row = reset.closest(".dait-settings-row");
            const description = row?.querySelector?.(".dait-row-description");
            if (description) description.textContent = this.getGoogleTranslateStatsText();
        });
        controls.appendChild(reset);
        return this.createRow(this.plugin.t("googleTranslateStats"), controls, {
            description: this.getGoogleTranslateStatsText()
        });
    },

    getGoogleTranslateStatsText() {
        const stats = this.plugin.getGoogleTranslateUsageSummary();
        const text = this.plugin.t("googleTranslateStatsDesc", {
            used: stats.used,
            limit: stats.limit,
            available: stats.available,
            total: stats.total,
            month: stats.monthKey
        });
        if (!stats.coolingDown) return text;
        return `${text} ${this.plugin.t("googleTranslateStatsCooldown", {
            count: stats.coolingDown,
            time: this.formatDiagnosticSummaryTime(stats.nextCooldownEndsAt)
        })}`;
    },

    attachModelHistoryDatalist(input, kind, host = null) {
        if (!input || typeof document === "undefined" || !document.createElement) return null;
        const provider = String(this.plugin.settings[kind]?.provider || "");
        const listId = `dait-model-history-${kind}-${provider}-${Math.random().toString(36).slice(2, 8)}`;
        const datalist = document.createElement("datalist");
        datalist.id = listId;
        datalist.dataset.daitModelHistory = `${kind}:${provider}`;
        input.setAttribute("list", listId);
        input.__daitModelDatalist = datalist;
        (host || input.parentElement)?.appendChild?.(datalist);
        this.refreshModelHistoryDatalist(input, kind);
        return datalist;
    },

    refreshModelHistoryDatalist(input, kind, extraModels = []) {
        const datalist = input?.__daitModelDatalist;
        if (!datalist || typeof document === "undefined") return;
        const provider = String(this.plugin.settings[kind]?.provider || "");
        const baseModels = this.plugin.getRememberedModelsForProvider(kind, provider);
        const merged = [];
        const seen = new Set();
        for (const candidate of [...baseModels, ...(Array.isArray(extraModels) ? extraModels : [])]) {
            const text = String(candidate || "").trim();
            if (!text || seen.has(text)) continue;
            seen.add(text);
            merged.push(text);
        }
        [...(datalist.children || [])].forEach(child => child.remove?.());
        datalist.textContent = "";
        merged.forEach(modelName => {
            const option = document.createElement("option");
            option.value = modelName;
            datalist.appendChild(option);
        });
    }
};

module.exports = methods;
