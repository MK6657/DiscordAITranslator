"use strict";

// The user-panel launcher's compact quick panel (a popover anchored to the "AI" button) and the
// launcher's status badge. The full settings window stays in openQuickSettingsPanel(); this module
// only calls it. Everything here talks to the plugin through `this.plugin`.

const {
    LANGUAGE_PRESETS,
    API_ENDPOINT_ERROR_MESSAGE_KEYS,
    QUICK_PANEL_TABS,
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    POLISH_REPOLISH_SOURCE_LAST_RESULT
} = require("../constants");
const { PLUGIN_VERSION } = require("../version");
const { getChannelRouteParts, getChannelRuleKey } = require("../auto-translation/channel-rule");
const { SETTINGS_TAB_COMPOSE } = require("../settings/settings-schema");

const POPOVER_ID = "dait-quick-popover";
const POPOVER_WIDTH_PX = 360;
const ANCHOR_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;
const POPOVER_UPDATE_DELAY_MS = 16;
const ROUTE_CHECK_INTERVAL_MS = 800;
const STATUS_REFRESH_THROTTLE_MS = 250;
const STATUS_EXPIRY_SLACK_MS = 50;
const LAUNCHER_SELECTOR = ".dait-quick-settings-button";
const POINTER_OPENED_CLASS = "dait-qp-pointer-opened";
const CHANNEL_RULES = ["inherit", "enabled", "disabled"];
const TRANSLATION_POSITIONS = ["before", "after"];
const POLISH_AFTER_ACTIONS = ["replace", "confirmSend"];
const POLISH_REPOLISH_SOURCES = [POLISH_REPOLISH_SOURCE_ORIGINAL, POLISH_REPOLISH_SOURCE_LAST_RESULT];
const POLISH_CREATIVITY_PRESETS = [
    { value: 0.3, key: "quickPanelPolishCreativitySteady" },
    { value: 0.7, key: "quickPanelPolishCreativityBalanced" },
    { value: 1.2, key: "quickPanelPolishCreativityCreative" }
];
const LAUNCHER_STATUS_STATES = ["ok", "busy", "waiting", "needs-you", "off"];
// Provider cooldowns that end by themselves (amber triangle) and errors only the user can fix (red "!").
const WAITING_FAILURE_TYPES = new Set(["rate-limit", "server", "timeout", "network", "parse"]);
const ATTENTION_FAILURE_TYPES = new Set(["auth", "quota", "local-unavailable"]);
const WAITING_REASON_KEYS = {
    "rate-limit": "quickStatusReasonRateLimit",
    server: "quickStatusReasonServer",
    timeout: "quickStatusReasonNetwork",
    network: "quickStatusReasonNetwork",
    parse: "quickStatusReasonParse"
};
const ATTENTION_REASON_KEYS = {
    auth: "quickStatusReasonAuth",
    quota: "quickStatusReasonQuota",
    "local-unavailable": "quickStatusReasonLocal"
};
// Configuration errors seen on real requests (the provider cooldowns do not record them): an invalid or unsafe
// API URL, and a URL or model the service does not know (HTTP 404/405, or a 400 naming an unknown model).
const CONFIG_ERROR_REASON_KEYS = {
    endpoint: "quickStatusReasonEndpoint",
    "not-found": "quickStatusReasonNotFound"
};
const ICON_NAMES = { gear: "dait-qp-icon-gear", close: "dait-qp-icon-close" };

function normalizeQuickTab(value) {
    const tab = String(value || "").trim();
    return QUICK_PANEL_TABS.includes(tab) ? tab : "translation";
}

function clampTemperature(value, fallback = 0.4) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.round(Math.min(2, Math.max(0, parsed)) * 10) / 10;
}

class QuickPanel {
    constructor(plugin) {
        this.plugin = plugin;
        this.root = null;
        this.launcher = null;
        this.routeKey = "";
        this.controls = null;
        this.listeners = [];
        this.updatePending = false;
        this.updateTimer = null;
        this.routeTimer = null;
        this.countdownTimer = null;
        this.testRuns = { translation: false, polish: false };
        this.statusPending = false;
        this.statusTimer = null;
        this.statusExpiryTimer = null;
        this.statusExpiryAt = 0;
        this.lastStatus = null;
        this.lastPolishStatus = null;
        this.lastStatusSignature = "";
        this.statusRouteKey = "";
        this.launcherRef = null;
        this.lastAnchorRect = null;
        this.configError = null;
        this.tryDrawerOpen = false;
        this.tryRunning = false;
        this.tryRunToken = null;
        this.tryHistory = { text: "", results: [] };
        this.tryContextSignature = "";
    }

    // --- Active tab ---

    getActiveTab() {
        return normalizeQuickTab(this.plugin.settings?.ui?.quickPanelActiveTab);
    }

    setActiveTab(tab, options = {}) {
        const next = normalizeQuickTab(tab);
        const current = this.getActiveTab();
        if (current !== next) {
            if (typeof this.plugin.setSetting === "function") {
                this.plugin.setSetting("ui.quickPanelActiveTab", next);
            }
            else if (this.plugin.settings?.ui) {
                this.plugin.settings.ui.quickPanelActiveTab = next;
            }
        }
        if (this.isOpen()) {
            this.update();
            if (options.focusTab) {
                const button = this.controls?.modeTabs?.find(item => item.dataset.daitTab === next);
                if (button) this.focusElement(button);
            }
        }
        return next;
    }

    // --- Popover lifecycle ---

    isOpen() {
        return Boolean(this.root && this.plugin.isNodeConnected(this.root));
    }

    toggle(launcher = null, source = "panel", options = {}) {
        if (this.isOpen()) {
            this.close("launcher", { restoreFocus: true });
            return null;
        }
        return this.open(launcher, { ...options, source });
    }

    open(launcher = null, options = {}) {
        if (typeof document === "undefined" || !document.body || !this.plugin.isStarted) return null;
        this.close("reopen", { restoreFocus: false });
        this.removeStrayPopovers();
        const anchor = this.plugin.isNodeConnected(launcher) ? launcher : this.findLauncher();
        let root = null;
        try {
            this.launcher = anchor || null;
            this.routeKey = this.plugin.getCurrentRouteKey();
            root = this.build();
            this.root = root;
            // Focus still moves to the first control, but a mouse click on the launcher should not paint
            // a focus ring there (Chromium shows one when focus comes from the composer); the first key
            // press brings the rings back.
            if (options.viaPointer) root.classList.add(POINTER_OPENED_CLASS);
            this.plugin.applyPanelTheme(root);
            document.body.appendChild(root);
            this.update();
            this.position();
            this.bindListeners();
            this.setLauncherExpanded(anchor, true);
            this.focusElement(this.getFocusableElements()[0] || root);
            this.startRouteWatch();
            this.plugin.logQuickSettingsDiagnostic("popover.open", "ok", { source: String(options.source || ""), tab: this.getActiveTab() });
            return root;
        }
        catch (error) {
            this.unbindListeners();
            root?.remove?.();
            this.root = null;
            this.controls = null;
            this.plugin.logQuickSettingsDiagnostic("popover.open", "error", {
                source: String(options.source || ""),
                errorName: error?.name || "",
                errorText: this.plugin.formatError(error)
            });
            // The quick panel is a shortcut; when it cannot be built, the full settings window still works.
            this.launcher = null;
            this.setLauncherExpanded(anchor, false);
            return this.plugin.openQuickSettingsPanel("quick-panel-fallback", anchor);
        }
    }

    close(reason = "close", options = {}) {
        const root = this.root;
        if (!root) return false;
        this.unbindListeners();
        this.stopTimers();
        root.remove?.();
        this.root = null;
        this.controls = null;
        this.lastAnchorRect = null;
        this.tryDrawerOpen = false;
        this.tryRunning = false;
        this.tryRunToken = null;
        this.tryHistory = { text: "", results: [] };
        const launcher = this.launcher;
        this.launcher = null;
        this.setLauncherExpanded(launcher, false);
        if (options.restoreFocus) {
            const target = this.plugin.isNodeConnected(launcher) ? launcher : this.findLauncher();
            if (target) this.focusElement(target);
        }
        if (this.plugin.isStarted) this.plugin.logQuickSettingsDiagnostic("popover.close", "ok", { reason });
        return true;
    }

    destroy(reason = "stop") {
        this.close(reason, { restoreFocus: false });
        this.removeStrayPopovers();
        if (this.statusTimer) clearTimeout(this.statusTimer);
        if (this.statusExpiryTimer) clearTimeout(this.statusExpiryTimer);
        this.statusTimer = null;
        this.statusPending = false;
        this.statusExpiryTimer = null;
        this.statusExpiryAt = 0;
        this.lastStatus = null;
        this.lastPolishStatus = null;
        this.lastStatusSignature = "";
        this.statusRouteKey = "";
        this.launcherRef = null;
        this.configError = null;
        this.tryRunToken = null;
        this.testRuns = { translation: false, polish: false };
    }

    // The interface language changed while the panel is open: build it again where it is (same channel, same tab,
    // focus on the same control) instead of closing it.
    rerender(reason = "rerender") {
        if (!this.isOpen()) return false;
        const previous = this.root;
        const previousFocusables = this.controls?.focusables || [];
        const previousTryInput = String(this.controls?.tryInput?.value || "");
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const focusInside = Boolean(active && (active === previous || previous.contains?.(active)));
        const focusIndex = focusInside ? previousFocusables.indexOf(active) : -1;
        let root = null;
        try {
            root = this.build();
        }
        catch (error) {
            this.plugin.logQuickSettingsDiagnostic("popover.rerender", "error", {
                reason,
                errorName: error?.name || "",
                errorText: this.plugin.formatError(error)
            });
            this.close(reason, { restoreFocus: false });
            return false;
        }
        if (previous.classList?.contains?.(POINTER_OPENED_CLASS)) root.classList.add(POINTER_OPENED_CLASS);
        root.dataset.daitRerendered = "true";
        if (this.controls?.tryInput && previousTryInput) this.controls.tryInput.value = previousTryInput;
        this.plugin.applyPanelTheme(root);
        // Start where the old panel was; position() then only moves it if the new text changes its height.
        if (root.style && previous.style) {
            root.style.left = previous.style.left;
            root.style.top = previous.style.top;
        }
        if (previous.dataset?.daitPlacement) root.dataset.daitPlacement = previous.dataset.daitPlacement;
        if (previous.parentElement?.insertBefore) previous.parentElement.insertBefore(root, previous);
        else document.body.appendChild(root);
        previous.remove?.();
        this.root = root;
        this.bindListeners();
        this.update();
        if (focusInside) {
            const focusables = this.controls?.focusables || [];
            this.focusElement(focusables[focusIndex] || this.getFocusableElements()[0] || root);
        }
        this.plugin.logQuickSettingsDiagnostic("popover.rerender", "ok", { reason });
        return true;
    }

    removeStrayPopovers() {
        if (typeof document === "undefined") return;
        document.querySelectorAll?.(`.${POPOVER_ID}`)?.forEach(node => {
            if (node !== this.root) node.remove?.();
        });
    }

    openFullSettings() {
        const launcher = this.plugin.isNodeConnected(this.launcher) ? this.launcher : this.findLauncher();
        const activeTab = this.getActiveTab();
        if (activeTab === "polish" && this.plugin.settings?.ui) {
            this.plugin.settings.ui.settingsActiveTab = SETTINGS_TAB_COMPOSE;
            this.plugin.saveSettings?.({ debounce: true });
        }
        this.close("open-full-settings", { restoreFocus: false });
        const modal = this.plugin.openQuickSettingsPanel("quick-panel", launcher);
        if (activeTab === "polish") {
            const panel = modal?.querySelector?.(".dait-settings") || null;
            if (panel) this.plugin.setSettingsActiveTab?.(SETTINGS_TAB_COMPOSE, panel);
        }
        return modal;
    }

    findLauncher() {
        if (typeof document === "undefined") return null;
        const found = document.querySelector?.(LAUNCHER_SELECTOR) || null;
        return this.plugin.isNodeConnected(found) ? found : null;
    }

    setLauncherExpanded(launcher, expanded) {
        if (!launcher?.setAttribute) return;
        launcher.setAttribute("aria-expanded", expanded ? "true" : "false");
        launcher.classList?.toggle?.("dait-quick-settings-button-active", Boolean(expanded));
        if (expanded) launcher.setAttribute("aria-controls", POPOVER_ID);
        else launcher.removeAttribute?.("aria-controls");
    }

    // --- DOM helpers ---

    createElement(tag, className = "", text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    createButton(className, text, onClick) {
        const button = this.createElement("button", className, text);
        button.type = "button";
        button.addEventListener("click", event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            onClick(button, event);
        });
        return button;
    }

    createIconButton(icon, label, className, onClick) {
        const button = this.createButton(`dait-qp-icon-button ${className}`, undefined, onClick);
        button.title = label;
        button.setAttribute("aria-label", label);
        const glyph = this.createElement("span", `dait-qp-icon ${ICON_NAMES[icon] || ""}`);
        glyph.setAttribute("aria-hidden", "true");
        button.appendChild(glyph);
        return button;
    }

    createSwitchRow(key, label, description, onChange, options = {}) {
        const id = `${POPOVER_ID}-${key}`;
        const row = this.createElement("div", `dait-qp-row ${options.rowClass || ""}`.trim());
        const text = this.createElement("div", "dait-qp-row-text");
        const labelNode = this.createElement("label", "dait-qp-label", label);
        labelNode.htmlFor = id;
        let badge = null;
        if (options.withChip) {
            labelNode.classList.add("dait-qp-label-inline");
            badge = this.createElement("span", "dait-qp-chip dait-qp-inline-chip");
            badge.hidden = true;
            labelNode.appendChild(badge);
        }
        text.appendChild(labelNode);
        const input = this.createElement("input", "dait-qp-switch");
        input.type = "checkbox";
        input.id = id;
        input.setAttribute("role", "switch");
        if (description) {
            const descriptionNode = this.createElement("p", "dait-qp-desc", description);
            descriptionNode.id = `${id}-desc`;
            text.appendChild(descriptionNode);
            input.setAttribute("aria-describedby", descriptionNode.id);
        }
        input.addEventListener("change", () => {
            onChange(Boolean(input.checked));
            this.update();
        });
        row.appendChild(text);
        row.appendChild(input);
        return { row, input, badge };
    }

    // A radio group of equal-width buttons; arrow keys move and select, like native radios.
    createSegmented(key, options, labelId, onSelect, className = "") {
        const group = this.createElement("div", `dait-qp-segmented ${className}`.trim());
        group.id = `${POPOVER_ID}-${key}`;
        group.setAttribute("role", "radiogroup");
        if (labelId) group.setAttribute("aria-labelledby", labelId);
        const buttons = options.map(([value, text]) => {
            const button = this.createButton("dait-qp-segment", text, () => {
                if (button.disabled) return;
                onSelect(value);
                this.update();
            });
            button.dataset.daitValue = value;
            button.setAttribute("role", "radio");
            button.setAttribute("aria-checked", "false");
            button.setAttribute("tabindex", "-1");
            group.appendChild(button);
            return button;
        });
        group.addEventListener("keydown", event => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event?.key];
            const edge = { Home: 0, End: buttons.length - 1 }[event?.key];
            if (step === undefined && edge === undefined) return;
            const enabled = buttons.filter(button => !button.disabled);
            if (!enabled.length) return;
            event.preventDefault?.();
            const current = enabled.indexOf(buttons.find(button => button.getAttribute("aria-checked") === "true"));
            const next = edge !== undefined
                ? enabled[edge === 0 ? 0 : enabled.length - 1]
                : enabled[(Math.max(0, current) + step + enabled.length) % enabled.length];
            if (!next) return;
            onSelect(next.dataset.daitValue);
            this.update();
            this.focusElement(next);
        });
        return { group, buttons };
    }

    createStatusCard(kind, testTitle) {
        const t = (key, vars) => this.plugin.t(key, vars);
        const card = this.createElement("div", "dait-qp-status");
        card.dataset.daitKind = kind;
        const dot = this.createElement("span", "dait-qp-dot");
        dot.setAttribute("aria-hidden", "true");
        const statusText = this.createElement("div", "dait-qp-status-text");
        const line = this.createElement("p", "dait-qp-status-line");
        line.setAttribute("role", "status");
        line.setAttribute("aria-live", "polite");
        const test = this.createElement("p", "dait-qp-status-test");
        test.hidden = true;
        const detail = this.createElement("p", "dait-qp-status-detail");
        const note = this.createElement("p", "dait-qp-status-note");
        note.hidden = true;
        statusText.appendChild(line);
        statusText.appendChild(test);
        statusText.appendChild(detail);
        statusText.appendChild(note);
        const testButton = this.createButton("dait-qp-button dait-qp-button-secondary dait-qp-test", t("apiTest"), button => this.runConnectionTest(button, kind));
        testButton.title = testTitle;
        testButton.dataset.daitKind = kind;
        card.appendChild(dot);
        card.appendChild(statusText);
        card.appendChild(testButton);
        return { card, dot, line, test, detail, note, testButton };
    }

    createSavedServiceRow(kind, labelText, options = {}) {
        const id = `${POPOVER_ID}-${kind}-service`;
        const row = this.createElement("div", "dait-qp-row dait-qp-row-stacked dait-qp-service-row");
        const label = this.createElement("label", "dait-qp-label dait-qp-label-inline", labelText);
        label.htmlFor = id;
        let relationChip = null;
        if (options.withRelationChip) {
            relationChip = this.createElement("span", "dait-qp-chip dait-qp-service-chip");
            label.appendChild(relationChip);
        }
        const select = this.createElement("select", "dait-qp-select dait-qp-select-full");
        select.id = id;
        select.dataset.daitQuickService = kind;
        select.addEventListener("change", () => {
            const configId = String(select.value || "");
            if (configId) this.plugin.applySavedServiceConfig?.(kind, configId);
            this.update();
        });
        row.appendChild(label);
        row.appendChild(select);
        return { row, select, relationChip };
    }

    buildModeTabs(controls) {
        const t = (key, vars) => this.plugin.t(key, vars);
        const bar = this.createElement("div", "dait-qp-mode-bar");
        const list = this.createElement("div", "dait-qp-tabs");
        list.setAttribute("role", "tablist");
        list.setAttribute("aria-label", t("quickPanelTabsLabel"));
        const entries = [
            ["translation", t("quickPanelTabTranslation")],
            ["polish", t("quickPanelTabPolish")]
        ];
        const tabMeta = {};
        const tabs = entries.map(([tabId, labelText]) => {
            const button = this.createButton("dait-qp-tab", undefined, () => this.setActiveTab(tabId));
            button.id = `${POPOVER_ID}-tab-${tabId}`;
            button.dataset.daitTab = tabId;
            button.setAttribute("role", "tab");
            button.setAttribute("aria-controls", `${POPOVER_ID}-panel-${tabId}`);
            button.setAttribute("aria-selected", "false");
            button.setAttribute("tabindex", "-1");
            const head = this.createElement("span", "dait-qp-tab-head");
            const dot = this.createElement("span", "dait-qp-tab-dot");
            dot.setAttribute("aria-hidden", "true");
            const text = this.createElement("span", "dait-qp-tab-label", labelText);
            head.appendChild(dot);
            head.appendChild(text);
            const summary = this.createElement("span", "dait-qp-chip dait-qp-tab-summary");
            button.appendChild(head);
            button.appendChild(summary);
            tabMeta[tabId] = { button, dot, summary };
            list.appendChild(button);
            return button;
        });
        list.addEventListener("keydown", event => {
            const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event?.key];
            const edge = { Home: 0, End: tabs.length - 1 }[event?.key];
            if (step === undefined && edge === undefined) return;
            event.preventDefault?.();
            const current = tabs.findIndex(button => button.getAttribute("aria-selected") === "true");
            const next = edge !== undefined
                ? tabs[edge]
                : tabs[(Math.max(0, current) + step + tabs.length) % tabs.length];
            if (!next) return;
            this.setActiveTab(next.dataset.daitTab, { focusTab: true });
        });
        bar.appendChild(list);
        controls.modeTabs = tabs;
        controls.modeTabMeta = tabMeta;
        return bar;
    }

    buildTranslationPanel(controls) {
        const t = (key, vars) => this.plugin.t(key, vars);
        const panel = this.createElement("div", "dait-qp-tabpanel");
        panel.id = `${POPOVER_ID}-panel-translation`;
        panel.dataset.daitTabpanel = "translation";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", `${POPOVER_ID}-tab-translation`);

        const status = this.createStatusCard("translation", t("translationTestConnectionTitle"));
        controls.statusDot = status.dot;
        controls.statusLine = status.line;
        controls.statusTest = status.test;
        controls.statusDetail = status.detail;
        controls.statusNote = status.note;
        controls.test = status.testButton;
        panel.appendChild(status.card);

        const serviceRow = this.createSavedServiceRow("translation", t("quickPanelTranslationService"));
        controls.translationServiceRow = serviceRow.row;
        controls.translationService = serviceRow.select;
        panel.appendChild(serviceRow.row);

        const auto = this.createSwitchRow("auto", t("quickPanelAutoTranslate"), t("quickPanelAutoTranslateDesc"),
            checked => this.plugin.setSetting("ui.autoTranslateMessages", checked));
        controls.auto = auto.input;
        panel.appendChild(auto.row);

        const ruleRow = this.createElement("div", "dait-qp-row dait-qp-row-stacked dait-qp-channel-rule");
        const ruleLabel = this.createElement("div", "dait-qp-label dait-qp-channel-label", t("quickPanelChannel"));
        ruleLabel.id = `${POPOVER_ID}-rule-label`;
        controls.channelName = this.createElement("span", "dait-qp-channel-name");
        ruleLabel.appendChild(controls.channelName);
        const rule = this.createSegmented("rule", [
            ["inherit", t("quickPanelRuleInherit")],
            ["enabled", t("quickPanelRuleEnabled")],
            ["disabled", t("quickPanelRuleDisabled")]
        ], ruleLabel.id, mode => this.setChannelRule(mode));
        // The narrow panel shows short labels; the full rule names are the accessible names and tooltips.
        const ruleNames = { inherit: t("quickPanelRuleInheritFull"), enabled: t("quickPanelRuleEnabledFull"), disabled: t("quickPanelRuleDisabledFull") };
        rule.buttons.forEach(button => {
            const name = ruleNames[button.dataset.daitValue];
            if (name && name !== button.textContent) {
                button.title = name;
                button.setAttribute("aria-label", name);
            }
        });
        controls.rule = rule;
        controls.ruleCaption = this.createElement("p", "dait-qp-desc dait-qp-rule-caption");
        controls.ruleCaption.id = `${POPOVER_ID}-rule-caption`;
        rule.group.setAttribute("aria-describedby", controls.ruleCaption.id);
        ruleRow.appendChild(ruleLabel);
        ruleRow.appendChild(rule.group);
        ruleRow.appendChild(controls.ruleCaption);
        panel.appendChild(ruleRow);

        const targetRow = this.createElement("div", "dait-qp-row");
        const targetText = this.createElement("div", "dait-qp-row-text");
        const targetLabel = this.createElement("label", "dait-qp-label", t("quickPanelTargetLanguage"));
        targetLabel.htmlFor = `${POPOVER_ID}-target`;
        targetText.appendChild(targetLabel);
        controls.target = this.createElement("select", "dait-qp-select dait-qp-control");
        controls.target.id = `${POPOVER_ID}-target`;
        controls.target.addEventListener("change", () => {
            const value = String(controls.target.value || "");
            if (value) this.plugin.setSetting("translation.targetLanguage", value);
            this.update();
        });
        targetRow.appendChild(targetText);
        targetRow.appendChild(controls.target);
        panel.appendChild(targetRow);

        const transTplRow = this.createElement("div", "dait-qp-row dait-qp-template-row");
        const transTplText = this.createElement("div", "dait-qp-row-text");
        const transTplLabel = this.createElement("label", "dait-qp-label", t("quickPanelTranslationTemplate"));
        transTplLabel.htmlFor = `${POPOVER_ID}-translation-template`;
        transTplText.appendChild(transTplLabel);
        controls.translationTemplate = this.createElement("select", "dait-qp-select dait-qp-control");
        controls.translationTemplate.id = `${POPOVER_ID}-translation-template`;
        controls.translationTemplate.addEventListener("change", () => {
            const templateId = String(controls.translationTemplate.value || "");
            if (templateId) this.plugin.applyPromptTemplate?.("translation", templateId);
            this.update();
        });
        transTplRow.appendChild(transTplText);
        transTplRow.appendChild(controls.translationTemplate);
        controls.translationTemplateRow = transTplRow;
        panel.appendChild(transTplRow);

        const display = this.createElement("h3", "dait-qp-section", t("quickPanelDisplay"));
        panel.appendChild(display);
        const mask = this.createSwitchRow("mask", t("quickPanelMask"), t("quickPanelMaskDesc"),
            checked => this.plugin.setSetting("ui.maskTranslations", checked));
        controls.mask = mask.input;
        panel.appendChild(mask.row);
        const hide = this.createSwitchRow("hide", t("quickPanelHideOriginal"), t("quickPanelHideOriginalDesc"),
            checked => this.plugin.setSetting("ui.hideOriginalAfterTranslation", checked));
        controls.hide = hide.input;
        panel.appendChild(hide.row);

        const positionRow = this.createElement("div", "dait-qp-row");
        const positionText = this.createElement("div", "dait-qp-row-text");
        const positionLabel = this.createElement("span", "dait-qp-label", t("quickPanelPosition"));
        positionLabel.id = `${POPOVER_ID}-position-label`;
        positionText.appendChild(positionLabel);
        const position = this.createSegmented("position", [
            ["before", t("quickPanelPositionAbove")],
            ["after", t("quickPanelPositionBelow")]
        ], positionLabel.id, value => this.plugin.setSetting("ui.translationPosition", value), "dait-qp-control");
        controls.position = position;
        positionRow.appendChild(positionText);
        positionRow.appendChild(position.group);
        panel.appendChild(positionRow);

        controls.translationPanel = panel;
        return panel;
    }

    buildPolishPanel(controls) {
        const t = (key, vars) => this.plugin.t(key, vars);
        const panel = this.createElement("div", "dait-qp-tabpanel");
        panel.id = `${POPOVER_ID}-panel-polish`;
        panel.dataset.daitTabpanel = "polish";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", `${POPOVER_ID}-tab-polish`);
        panel.hidden = true;

        const status = this.createStatusCard("polish", t("quickPanelPolishTestTitle"));
        controls.polishStatusDot = status.dot;
        controls.polishStatusLine = status.line;
        controls.polishStatusTest = status.test;
        controls.polishStatusDetail = status.detail;
        controls.polishStatusNote = status.note;
        controls.polishTest = status.testButton;
        panel.appendChild(status.card);

        const serviceRow = this.createSavedServiceRow("polish", t("quickPanelPolishService"), { withRelationChip: true });
        controls.polishServiceRow = serviceRow.row;
        controls.polishService = serviceRow.select;
        controls.polishServiceRelation = serviceRow.relationChip;
        panel.appendChild(serviceRow.row);

        const enabledRow = this.createSwitchRow("polish-enabled", t("quickPanelPolishEnabled"), t("quickPanelPolishEnabledDesc"),
            checked => this.plugin.setSetting("polish.enabled", checked), { withChip: true });
        controls.polishEnabled = enabledRow.input;
        controls.polishHotkeyChip = enabledRow.badge;
        panel.appendChild(enabledRow.row);

        const outputRow = this.createElement("div", "dait-qp-row");
        const outputText = this.createElement("div", "dait-qp-row-text");
        const outputLabel = this.createElement("label", "dait-qp-label", t("quickPanelPolishOutputLanguage"));
        outputLabel.htmlFor = `${POPOVER_ID}-polish-target`;
        outputText.appendChild(outputLabel);
        controls.polishTarget = this.createElement("select", "dait-qp-select dait-qp-control");
        controls.polishTarget.id = `${POPOVER_ID}-polish-target`;
        controls.polishTarget.addEventListener("change", () => {
            const value = String(controls.polishTarget.value || "");
            if (value) this.plugin.setSetting("polish.targetLanguage", value);
            this.update();
        });
        outputRow.appendChild(outputText);
        outputRow.appendChild(controls.polishTarget);
        panel.appendChild(outputRow);

        const tplRow = this.createElement("div", "dait-qp-row dait-qp-row-stacked");
        const tplLabel = this.createElement("label", "dait-qp-label", t("quickPanelPolishTemplate"));
        tplLabel.htmlFor = `${POPOVER_ID}-polish-template`;
        controls.polishTemplate = this.createElement("select", "dait-qp-select dait-qp-select-full");
        controls.polishTemplate.id = `${POPOVER_ID}-polish-template`;
        controls.polishTemplate.addEventListener("change", () => {
            const templateId = String(controls.polishTemplate.value || "");
            if (templateId) this.plugin.applyPromptTemplate?.("polish", templateId);
            this.update();
        });
        tplRow.appendChild(tplLabel);
        tplRow.appendChild(controls.polishTemplate);
        panel.appendChild(tplRow);

        const tempRow = this.createElement("div", "dait-qp-row dait-qp-row-stacked dait-qp-temp-row");
        const tempHeader = this.createElement("div", "dait-qp-label dait-qp-temp-head");
        const tempLabel = this.createElement("label", "dait-qp-temp-title", t("quickPanelPolishCreativity"));
        tempLabel.htmlFor = `${POPOVER_ID}-polish-temperature`;
        controls.polishTempValue = this.createElement("span", "dait-qp-chip dait-qp-temp-value");
        tempHeader.appendChild(tempLabel);
        tempHeader.appendChild(controls.polishTempValue);
        controls.polishTempRange = this.createElement("input", "dait-qp-range");
        controls.polishTempRange.type = "range";
        controls.polishTempRange.id = `${POPOVER_ID}-polish-temperature`;
        controls.polishTempRange.min = "0";
        controls.polishTempRange.max = "2";
        controls.polishTempRange.step = "0.1";
        controls.polishTempRange.addEventListener("input", () => {
            const next = clampTemperature(controls.polishTempRange.value, 0.4);
            this.syncPolishTemperatureUi(next, { updateRange: false });
            this.plugin.setSetting("polish.temperature", next, { save: "debounce", live: true });
        });
        controls.polishTempRange.addEventListener("change", () => {
            const next = clampTemperature(controls.polishTempRange.value, 0.4);
            this.syncPolishTemperatureUi(next);
            this.plugin.setSetting("polish.temperature", next);
        });
        const presetBar = this.createElement("div", "dait-qp-presets");
        controls.polishTempPresets = POLISH_CREATIVITY_PRESETS.map(preset => {
            const button = this.createButton("dait-qp-preset", t(preset.key), () => {
                if (button.disabled) return;
                this.plugin.setSetting("polish.temperature", preset.value);
                this.update();
            });
            button.dataset.daitValue = String(preset.value);
            button.setAttribute("aria-pressed", "false");
            presetBar.appendChild(button);
            return button;
        });
        controls.polishTempDesc = this.createElement("p", "dait-qp-desc dait-qp-temp-desc");
        tempRow.appendChild(tempHeader);
        tempRow.appendChild(controls.polishTempRange);
        tempRow.appendChild(presetBar);
        tempRow.appendChild(controls.polishTempDesc);
        panel.appendChild(tempRow);

        const behaviorHeading = this.createElement("h3", "dait-qp-section", t("quickPanelPolishBehavior"));
        panel.appendChild(behaviorHeading);

        const afterRow = this.createElement("div", "dait-qp-row");
        const afterText = this.createElement("div", "dait-qp-row-text");
        const afterLabel = this.createElement("span", "dait-qp-label", t("quickPanelPolishAfterAction"));
        afterLabel.id = `${POPOVER_ID}-polish-after-label`;
        afterText.appendChild(afterLabel);
        const afterAction = this.createSegmented("polish-after", [
            ["replace", t("afterReplace")],
            ["confirmSend", t("afterConfirmSend")]
        ], afterLabel.id, value => this.plugin.setSetting("polish.afterAction", value), "dait-qp-control");
        controls.polishAfterAction = afterAction;
        afterRow.appendChild(afterText);
        afterRow.appendChild(afterAction.group);
        panel.appendChild(afterRow);

        const repolishRow = this.createElement("div", "dait-qp-row");
        const repolishText = this.createElement("div", "dait-qp-row-text");
        const repolishLabel = this.createElement("span", "dait-qp-label", t("quickPanelPolishRepolishSource"));
        repolishLabel.id = `${POPOVER_ID}-polish-repolish-label`;
        repolishText.appendChild(repolishLabel);
        const repolishSource = this.createSegmented("polish-repolish", [
            [POLISH_REPOLISH_SOURCE_ORIGINAL, t("quickPanelPolishRepolishOriginal")],
            [POLISH_REPOLISH_SOURCE_LAST_RESULT, t("quickPanelPolishRepolishLast")]
        ], repolishLabel.id, value => this.plugin.setSetting("polish.repolishSource", value), "dait-qp-control");
        controls.polishRepolishSource = repolishSource;
        repolishRow.appendChild(repolishText);
        repolishRow.appendChild(repolishSource.group);
        panel.appendChild(repolishRow);

        const bilingual = this.createSwitchRow("public-bilingual", t("quickPanelPublicBilingual"), t("quickPanelPublicBilingualDesc"),
            checked => this.plugin.setSetting("ui.publicBilingualInputButton", checked));
        controls.publicBilingual = bilingual.input;
        panel.appendChild(bilingual.row);

        const bilingualAfter = this.createSwitchRow("public-bilingual-after", t("quickPanelPublicBilingualAfterPolish"), t("quickPanelPublicBilingualAfterPolishDesc"),
            checked => this.plugin.setSetting("ui.publicBilingualAfterPolish", checked), { rowClass: "dait-qp-row-sub" });
        controls.publicBilingualAfterRow = bilingualAfter.row;
        controls.publicBilingualAfter = bilingualAfter.input;
        panel.appendChild(bilingualAfter.row);

        const drawer = this.createElement("div", "dait-qp-try-drawer");
        controls.tryToggle = this.createButton("dait-qp-try-toggle", undefined, () => {
            this.tryDrawerOpen = !this.tryDrawerOpen;
            this.update();
            if (this.tryDrawerOpen) this.focusElement(controls.tryInput);
        });
        controls.tryToggle.setAttribute("aria-expanded", "false");
        controls.tryToggleLabel = this.createElement("span", "dait-qp-try-toggle-label", t("quickPanelTryPolishToggle"));
        controls.tryToggleState = this.createElement("span", "dait-qp-try-toggle-arrow");
        controls.tryToggleState.setAttribute("aria-hidden", "true");
        controls.tryToggle.appendChild(controls.tryToggleLabel);
        controls.tryToggle.appendChild(controls.tryToggleState);
        controls.tryBody = this.createElement("div", "dait-qp-try-body");
        controls.tryBody.hidden = true;
        const tryBar = this.createElement("div", "dait-qp-try-bar");
        controls.tryInput = this.createElement("input", "dait-qp-input");
        controls.tryInput.type = "text";
        controls.tryInput.id = `${POPOVER_ID}-try-polish-input`;
        controls.tryInput.placeholder = t("quickPanelTryPolishPlaceholder");
        controls.tryInput.setAttribute("aria-label", t("quickPanelTryPolishToggle"));
        controls.tryInput.addEventListener("keydown", event => {
            if (event?.key !== "Enter" || event.isComposing) return;
            event.preventDefault?.();
            this.runQuickTryPolish();
        });
        controls.tryRun = this.createButton("dait-qp-button dait-qp-button-secondary dait-qp-try-run", t("quickPanelTryPolishRun"), () => this.runQuickTryPolish());
        tryBar.appendChild(controls.tryInput);
        tryBar.appendChild(controls.tryRun);
        controls.tryResult = this.createElement("div", "dait-qp-try-result");
        controls.tryResult.hidden = true;
        controls.tryOutput = this.createElement("div", "dait-qp-try-output");
        controls.tryTime = this.createElement("div", "dait-qp-try-time");
        controls.tryTime.hidden = true;
        controls.tryResult.appendChild(controls.tryOutput);
        controls.tryResult.appendChild(controls.tryTime);
        controls.tryBody.appendChild(tryBar);
        controls.tryBody.appendChild(controls.tryResult);
        drawer.appendChild(controls.tryToggle);
        drawer.appendChild(controls.tryBody);
        panel.appendChild(drawer);

        controls.polishPanel = panel;
        return panel;
    }

    build() {
        const t = (key, vars) => this.plugin.t(key, vars);
        const controls = {};
        const root = this.createElement("section", POPOVER_ID);
        root.id = POPOVER_ID;
        root.setAttribute("role", "dialog");
        root.setAttribute("aria-modal", "false");
        root.setAttribute("aria-labelledby", `${POPOVER_ID}-title`);
        root.setAttribute("tabindex", "-1");

        const header = this.createElement("div", "dait-qp-header");
        const title = this.createElement("h2", "dait-qp-title", t("quickPanelTitle"));
        title.id = `${POPOVER_ID}-title`;
        header.appendChild(title);
        header.appendChild(this.createElement("span", "dait-qp-chip", `v${PLUGIN_VERSION}`));
        controls.headerOpenFull = this.createIconButton("gear", t("quickPanelOpenFull"), "dait-qp-header-open-full", () => this.openFullSettings());
        controls.close = this.createIconButton("close", t("quickPanelClose"), "dait-qp-close", () => this.close("button", { restoreFocus: true }));
        header.appendChild(controls.headerOpenFull);
        header.appendChild(controls.close);
        root.appendChild(header);

        root.appendChild(this.buildModeTabs(controls));

        const body = this.createElement("div", "dait-qp-body");
        body.appendChild(this.buildTranslationPanel(controls));
        body.appendChild(this.buildPolishPanel(controls));
        root.appendChild(body);

        const footer = this.createElement("div", "dait-qp-footer");
        controls.footerOpenFull = this.createButton("dait-qp-link dait-qp-footer-open-full", t("quickPanelOpenFull"), () => this.openFullSettings());
        footer.appendChild(controls.footerOpenFull);
        footer.appendChild(this.createElement("span", "dait-qp-hint", t("quickPanelEscHint")));
        root.appendChild(footer);

        // Tab order is DOM order; hidden tabpanel controls and unchecked radio/tab buttons are filtered by getFocusableElements().
        controls.focusables = [
            controls.headerOpenFull,
            controls.close,
            ...controls.modeTabs,
            controls.test,
            controls.translationService,
            controls.auto,
            ...controls.rule.buttons,
            controls.target,
            controls.translationTemplate,
            controls.mask,
            controls.hide,
            ...controls.position.buttons,
            controls.polishTest,
            controls.polishService,
            controls.polishEnabled,
            controls.polishTarget,
            controls.polishTemplate,
            controls.polishTempRange,
            ...controls.polishTempPresets,
            ...controls.polishAfterAction.buttons,
            ...controls.polishRepolishSource.buttons,
            controls.publicBilingual,
            controls.publicBilingualAfter,
            controls.tryToggle,
            controls.tryInput,
            controls.tryRun,
            controls.footerOpenFull
        ];
        this.controls = controls;
        return root;
    }

    // Brings every control in line with the settings and the channel captured at render time.
    update() {
        const controls = this.controls;
        if (!this.root || !controls) return;
        const t = (key, vars) => this.plugin.t(key, vars);
        const settings = this.plugin.settings || {};
        const ui = settings.ui || {};
        const translation = settings.translation || {};
        const polish = settings.polish || {};
        const activeTab = this.getActiveTab();

        this.root.dataset.daitTab = activeTab;
        controls.modeTabs.forEach(button => {
            const selected = button.dataset.daitTab === activeTab;
            button.setAttribute("aria-selected", selected ? "true" : "false");
            button.setAttribute("tabindex", selected ? "0" : "-1");
        });
        controls.translationPanel.hidden = activeTab !== "translation";
        controls.polishPanel.hidden = activeTab !== "polish";
        this.setText(controls.footerOpenFull, t(activeTab === "polish" ? "quickPanelOpenFullPolish" : "quickPanelOpenFull"));

        // --- Translation tab controls ---
        controls.auto.checked = Boolean(ui.autoTranslateMessages);
        controls.mask.checked = Boolean(ui.maskTranslations);
        controls.hide.checked = Boolean(ui.hideOriginalAfterTranslation);
        this.setSegmentedValue(controls.position, TRANSLATION_POSITIONS.includes(ui.translationPosition) ? ui.translationPosition : "before");

        const channelKey = this.plugin.getChannelAutoTranslatePolicyStorageKey(this.routeKey);
        const mode = channelKey ? this.plugin.getCurrentChannelAutoTranslatePolicyMode(this.routeKey) : "inherit";
        this.setText(controls.channelName, this.getChannelLabel(this.routeKey));
        this.setSegmentedValue(controls.rule, mode, { disabled: !channelKey });
        this.setText(controls.ruleCaption, this.getChannelRuleCaption(mode, Boolean(channelKey)));

        this.syncSavedServiceOptions(controls.translationService, "translation");
        this.syncLanguageOptions(controls.target, String(translation.targetLanguage || ""));

        const translationSupportsTemplates = Boolean(this.plugin.getProviderCapabilities?.(translation.provider)?.ui?.promptManager);
        controls.translationTemplateRow.hidden = !translationSupportsTemplates;
        if (translationSupportsTemplates) {
            this.syncPromptTemplateOptions(controls.translationTemplate, "translation");
        }

        // --- Polish tab controls ---
        const polishOn = polish.enabled !== false;
        this.syncSavedServiceOptions(controls.polishService, "polish");
        const shared = this.isPolishSharingTranslationService();
        this.setText(controls.polishServiceRelation, t(shared ? "quickPanelServiceShared" : "quickPanelServiceIndependent"));
        controls.polishServiceRelation.dataset.daitRelation = shared ? "shared" : "separate";

        controls.polishEnabled.checked = polishOn;
        const hotkeyText = ui.enablePolishHotkey !== false ? String(ui.polishHotkey || "").trim() : "";
        controls.polishHotkeyChip.hidden = !hotkeyText;
        if (hotkeyText) this.setText(controls.polishHotkeyChip, hotkeyText);

        this.syncLanguageOptions(controls.polishTarget, String(polish.targetLanguage || ""));
        controls.polishTarget.disabled = !polishOn;

        this.syncPromptTemplateOptions(controls.polishTemplate, "polish");
        controls.polishTemplate.disabled = !polishOn;

        const temperature = clampTemperature(polish.temperature, 0.4);
        const tempText = temperature.toFixed(1);
        this.syncPolishTemperatureUi(temperature, { disabled: !polishOn });

        const afterAction = POLISH_AFTER_ACTIONS.includes(polish.afterAction) ? polish.afterAction : "replace";
        this.setSegmentedValue(controls.polishAfterAction, afterAction, { disabled: !polishOn });
        const repolishSource = POLISH_REPOLISH_SOURCES.includes(polish.repolishSource)
            ? polish.repolishSource
            : POLISH_REPOLISH_SOURCE_ORIGINAL;
        this.setSegmentedValue(controls.polishRepolishSource, repolishSource, { disabled: !polishOn });

        const bilingualOn = Boolean(ui.publicBilingualInputButton);
        controls.publicBilingual.checked = bilingualOn;
        controls.publicBilingualAfterRow.hidden = !bilingualOn;
        controls.publicBilingualAfter.checked = Boolean(ui.publicBilingualAfterPolish);
        controls.publicBilingualAfter.disabled = !polishOn;

        // Clear quick try-polish history whenever language/template/model/creativity changes so "try again" stays accurate.
        const trySignature = [
            String(polish.provider || ""),
            String(polish.model || ""),
            String(polish.targetLanguage || ""),
            String(polish.activePromptTemplate || ""),
            tempText
        ].join("\n");
        if (this.tryContextSignature && this.tryContextSignature !== trySignature) {
            this.tryHistory = { text: "", results: [] };
        }
        this.tryContextSignature = trySignature;

        controls.tryToggle.setAttribute("aria-expanded", this.tryDrawerOpen ? "true" : "false");
        this.setText(controls.tryToggleState, this.tryDrawerOpen ? "▴" : "▾");
        controls.tryBody.hidden = !this.tryDrawerOpen;
        controls.tryInput.disabled = !polishOn;
        if (this.tryRunning) {
            controls.tryRun.disabled = true;
            this.setText(controls.tryRun, t("tryBusy"));
        }
        else {
            controls.tryRun.disabled = !polishOn;
            this.setText(controls.tryRun, t(controls.tryResult.hidden ? "quickPanelTryPolishRun" : "quickPanelTryPolishAgain"));
        }

        // --- Mode tab summary chips & indicators ---
        this.updateModeTabSummaries();
        this.refreshStatus();
        this.position();
    }

    updateModeTabSummaries() {
        const meta = this.controls?.modeTabMeta;
        if (!meta) return;
        const t = (key, vars) => this.plugin.t(key, vars);
        const settings = this.plugin.settings || {};
        const translation = settings.translation || {};
        const polish = settings.polish || {};
        const transLang = this.getLanguageDisplayName(String(translation.targetLanguage || ""));
        const polishLang = this.getLanguageDisplayName(String(polish.targetLanguage || ""));
        const autoActive = Boolean(this.plugin.isAutoTranslateEnabled?.());

        if (translation.enabled === false) {
            meta.translation.dot.dataset.daitActive = "off";
            this.setText(meta.translation.summary, t("quickPanelTabTransOff"));
        }
        else if (autoActive) {
            meta.translation.dot.dataset.daitActive = "on";
            this.setText(meta.translation.summary, t("quickPanelTabTransAutoOn", { language: transLang }));
        }
        else {
            meta.translation.dot.dataset.daitActive = "manual";
            this.setText(meta.translation.summary, t("quickPanelTabTransManual", { language: transLang }));
        }

        if (polish.enabled !== false) {
            meta.polish.dot.dataset.daitActive = "on";
            this.setText(meta.polish.summary, t("quickPanelTabPolishOn", { language: polishLang }));
        }
        else {
            meta.polish.dot.dataset.daitActive = "off";
            this.setText(meta.polish.summary, t("quickPanelTabPolishOff"));
        }
    }

    getLanguageDisplayName(value) {
        if (!value) return "";
        const english = this.plugin.getLocale?.() === "en";
        const found = LANGUAGE_PRESETS.find(language => language.value === value);
        if (!found) return value;
        return english ? found.en : found.zh;
    }

    syncPolishTemperatureUi(temperature, options = {}) {
        const controls = this.controls;
        if (!controls?.polishTempRange) return;
        const clamped = clampTemperature(temperature, 0.4);
        const tempText = clamped.toFixed(1);
        const disabled = options.disabled !== undefined ? Boolean(options.disabled) : (this.plugin.settings?.polish?.enabled === false);
        if (options.updateRange !== false && controls.polishTempRange.value !== tempText) {
            controls.polishTempRange.value = tempText;
        }
        controls.polishTempRange.disabled = disabled;
        this.setText(controls.polishTempValue, tempText);
        controls.polishTempPresets.forEach(button => {
            const active = Math.abs(Number(button.dataset.daitValue) - clamped) < 0.05;
            button.setAttribute("aria-pressed", active ? "true" : "false");
            button.disabled = disabled;
        });
        this.setText(controls.polishTempDesc, this.getCreativityDescription(clamped));
    }

    getCreativityDescription(temperature) {
        if (temperature <= 0.35) return this.plugin.t("quickPanelPolishCreativityDescSteady");
        if (temperature <= 0.75) return this.plugin.t("quickPanelPolishCreativityDescBalanced");
        return this.plugin.t("quickPanelPolishCreativityDescCreative");
    }

    isPolishSharingTranslationService() {
        const translation = this.plugin.settings?.translation;
        const polish = this.plugin.settings?.polish;
        if (!translation || !polish) return false;
        const keyT = this.plugin.getServiceConfigIdentityKey?.(translation) || "";
        const keyP = this.plugin.getServiceConfigIdentityKey?.(polish) || "";
        if (!keyT || !keyP || keyT !== keyP) return false;
        return String(translation.apiKey || "") === String(polish.apiKey || "");
    }

    scheduleUpdate() {
        if (!this.isOpen() || this.updatePending) return;
        this.updatePending = true;
        this.updateTimer = setTimeout(() => {
            this.updatePending = false;
            this.updateTimer = null;
            this.update();
        }, POPOVER_UPDATE_DELAY_MS);
    }

    setSegmentedValue(segmented, value, options = {}) {
        if (!segmented?.buttons) return;
        const disabled = Boolean(options.disabled);
        const checked = segmented.buttons.find(button => button.dataset.daitValue === value) || segmented.buttons[0];
        segmented.buttons.forEach(button => {
            const isChecked = button === checked;
            button.setAttribute("aria-checked", isChecked ? "true" : "false");
            button.setAttribute("tabindex", isChecked && !disabled ? "0" : "-1");
            button.disabled = disabled;
        });
        segmented.group.setAttribute("aria-disabled", disabled ? "true" : "false");
    }

    syncSelectOptions(select, options, current) {
        if (!select) return;
        const signature = options.map(([value, text]) => `${value}\t${text}`).join("\n");
        if (select.dataset.daitOptions !== signature) {
            select.textContent = "";
            options.forEach(([value, text]) => {
                const option = this.createElement("option", "", text);
                option.value = value;
                select.appendChild(option);
            });
            select.dataset.daitOptions = signature;
        }
        Array.from(select.options || select.children || []).forEach(option => { option.selected = option.value === current; });
        if (select.value !== current) select.value = current;
        const selectedOption = Array.from(select.options || select.children || []).find(option => option.value === current);
        const tooltip = String(selectedOption?.textContent || "");
        if (select.title !== tooltip) select.title = tooltip;
    }

    syncLanguageOptions(select, current) {
        if (!select) return;
        const english = this.plugin.getLocale() === "en";
        const options = LANGUAGE_PRESETS.map(language => [language.value, english ? language.en : language.zh]);
        // A custom target language (typed in the full settings) stays selectable.
        if (current && !options.some(([value]) => value === current)) options.unshift([current, current]);
        this.syncSelectOptions(select, options, current);
    }

    syncTargetOptions(current) {
        return this.syncLanguageOptions(this.controls?.target, current);
    }

    syncSavedServiceOptions(select, kind) {
        if (!select) return;
        const t = (key, vars) => this.plugin.t(key, vars);
        const configs = this.plugin.getSavedServiceConfigsForTask?.(kind) || [];
        const matched = this.plugin.findMatchingSavedServiceConfig?.(kind) || null;
        const matchedId = matched?.id || "";

        if (!configs.length) {
            this.syncSelectOptions(select, [["", t("quickPanelSavedServiceEmpty")]], "");
            select.disabled = true;
            return;
        }
        const options = configs.map(entry => [entry.id, this.plugin.formatServiceConfigLabel?.(entry) || entry.id]);
        if (!matchedId) {
            const task = this.plugin.settings?.[kind] || {};
            const providerLabel = this.plugin.getProviderDisplayName?.(task.provider) || String(task.provider || "");
            const model = String(task.model || "").trim();
            const currentLabel = [providerLabel, model].filter(Boolean).join(" · ");
            options.unshift(["", t("quickPanelSavedServiceCurrent", { label: currentLabel })]);
        }
        this.syncSelectOptions(select, options, matchedId);
        select.disabled = false;
    }

    syncPromptTemplateOptions(select, kind) {
        if (!select) return;
        const templates = this.plugin.getPromptTemplates?.(kind) || [];
        const task = this.plugin.settings?.[kind] || {};
        const activeId = String(task.activePromptTemplate || "");
        const activeTemplate = templates.find(item => item && item.id === activeId) || null;
        const matchesActive = Boolean(activeTemplate && String(activeTemplate.prompt || "") === String(task.prompt || ""));
        const options = templates.map(template => {
            const name = this.plugin.getPromptTemplateDisplayName?.(template) || template.name || "";
            const code = String(template.serial || "").trim();
            return [template.id, code ? `${code} · ${name}` : name];
        });
        if (!matchesActive) {
            options.unshift(["", this.plugin.t("quickPanelTemplateCustom")]);
        }
        this.syncSelectOptions(select, options, matchesActive ? activeTemplate.id : "");
    }

    async runQuickTryPolish() {
        const controls = this.controls;
        if (this.tryRunning || !controls?.tryInput || !controls?.tryRun || controls.tryRun.disabled) return null;
        const runToken = Symbol("try-polish");
        this.tryRunning = true;
        this.tryRunToken = runToken;
        try {
            return await this.plugin.runTryTask?.("polish", controls.tryInput.value, {
                button: controls.tryRun,
                result: controls.tryResult,
                output: controls.tryOutput,
                time: controls.tryTime,
                tryHistory: this.tryHistory
            });
        }
        finally {
            if (this.tryRunToken === runToken) {
                this.tryRunning = false;
                this.tryRunToken = null;
                if (this.isOpen() && this.controls === controls) {
                    const polishOn = this.plugin.settings?.polish?.enabled !== false;
                    controls.tryRun.disabled = !polishOn;
                    this.setText(controls.tryRun, this.plugin.t(controls.tryResult.hidden ? "quickPanelTryPolishRun" : "quickPanelTryPolishAgain"));
                    this.position();
                }
            }
        }
    }

    getChannelLabel(routeKey) {
        // Discord's guild pages (Browse Channels, Members, ...) are not channels either.
        if (!getChannelRuleKey(routeKey)) return this.plugin.t("quickPanelChannelNone");
        const { guildId, channelId } = getChannelRouteParts(routeKey);
        let name = "";
        try {
            name = String(this.plugin.getDiscordNamedStore("ChannelStore")?.getChannel?.(channelId)?.name || "").trim();
        }
        catch {
            name = "";
        }
        if (name) return `#${name}`;
        return guildId === "@me" ? this.plugin.t("quickPanelChannelDm") : "";
    }

    getChannelRuleCaption(mode, hasChannel) {
        if (!hasChannel) return this.plugin.t("quickPanelRuleCaptionNoChannel");
        // With channel translation off altogether nothing is auto-translated, whatever the rule or the main switch says.
        if (this.plugin.settings?.translation?.enabled === false) return this.plugin.t("quickPanelRuleCaptionTranslationOff");
        if (mode === "enabled") return this.plugin.t("quickPanelRuleCaptionEnabled");
        if (mode === "disabled") return this.plugin.t("quickPanelRuleCaptionDisabled");
        return this.plugin.t(this.plugin.settings?.ui?.autoTranslateMessages ? "quickPanelRuleCaptionInheritOn" : "quickPanelRuleCaptionInheritOff");
    }

    // Bound to the channel the panel was rendered for, even if Discord has navigated since.
    setChannelRule(mode) {
        if (!CHANNEL_RULES.includes(mode)) return false;
        return this.plugin.setCurrentChannelAutoTranslatePolicyMode(mode, this.routeKey);
    }

    // Writes only what differs, so an unchanged status touches nothing (and re-announces nothing).
    setText(node, text) {
        const value = String(text ?? "");
        if (!node || node.textContent === value) return false;
        node.textContent = value;
        return true;
    }

    // "model · 820 ms" as parts: the dots and the time do not break (css/07 .dait-qp-status-part); the text reads
    // the same as the summary.
    setTestSummary(node, text) {
        const value = String(text ?? "");
        if (!node || node.textContent === value) return false;
        node.textContent = "";
        value.split(" · ").forEach((part, index) => {
            if (index > 0) {
                node.appendChild(this.createElement("span", "dait-qp-status-sep", " ·"));
                node.appendChild(this.createElement("span", "dait-qp-status-gap", " "));
            }
            node.appendChild(this.createElement("span", index > 0 ? "dait-qp-status-part" : "dait-qp-status-model", part));
        });
        return true;
    }

    renderStatusCard(nodes, status, kind) {
        if (!nodes || !status) return false;
        if (nodes.dot.dataset.daitStatus !== status.state) nodes.dot.dataset.daitStatus = status.state;
        let resized = this.setText(nodes.line, status.headline);
        const testSummary = String(status.testSummary || "");
        resized = this.setTestSummary(nodes.test, testSummary) || resized;
        if (nodes.test.hidden !== !testSummary) {
            nodes.test.hidden = !testSummary;
            resized = true;
        }
        const detailText = kind === "translation" ? this.getStatusDetailText(status) : status.detail;
        resized = this.setText(nodes.detail, detailText) || resized;
        // The note (a hint or the service's own error text) wraps to at most three lines; the tooltip holds all of it.
        resized = this.setText(nodes.note, status.note) || resized;
        if (nodes.note.title !== (status.note || "")) nodes.note.title = status.note || "";
        if (nodes.note.hidden !== !status.note) {
            nodes.note.hidden = !status.note;
            resized = true;
        }
        const testRunning = this.isConnectionTestRunning(kind);
        nodes.testButton.disabled = Boolean(status.testing || testRunning);
        this.setText(nodes.testButton, this.plugin.t(testRunning ? "apiTestBusy" : "apiTest"));
        return resized;
    }

    renderStatus(status) {
        const controls = this.controls;
        if (!this.root || !controls || !status) return;
        const activeTab = this.getActiveTab();
        let resized = this.renderStatusCard({
            dot: controls.statusDot,
            line: controls.statusLine,
            test: controls.statusTest,
            detail: controls.statusDetail,
            note: controls.statusNote,
            testButton: controls.test
        }, status, "translation");
        const polishStatus = this.getPolishStatusSafe();
        if (polishStatus) {
            this.lastPolishStatus = polishStatus;
            resized = this.renderStatusCard({
                dot: controls.polishStatusDot,
                line: controls.polishStatusLine,
                test: controls.polishStatusTest,
                detail: controls.polishStatusDetail,
                note: controls.polishStatusNote,
                testButton: controls.polishTest
            }, polishStatus, "polish") || resized;
        }
        const activeStatus = activeTab === "polish" && polishStatus ? polishStatus : status;
        if (this.root.dataset.daitStatus !== activeStatus.state) this.root.dataset.daitStatus = activeStatus.state;
        this.syncCountdown(status);
        // New text can change the panel's height; keep it above the launcher and inside the window.
        if (resized) this.position();
    }

    getStatusDetailText(status, now = Date.now()) {
        if (status.state !== "waiting" || !(status.retryAt > now)) return status.detail;
        return this.plugin.t("quickStatusWaitingSeconds", {
            reason: status.reason,
            seconds: String(Math.max(1, Math.ceil((status.retryAt - now) / 1000)))
        });
    }

    // While a cooldown shows in an open panel, its seconds count down; nothing ticks otherwise.
    syncCountdown(status) {
        const needed = this.isOpen() && status?.state === "waiting" && status.retryAt > Date.now();
        if (!needed) {
            if (this.countdownTimer) clearInterval(this.countdownTimer);
            this.countdownTimer = null;
            return;
        }
        if (this.countdownTimer) return;
        this.countdownTimer = setInterval(() => {
            const current = this.lastStatus?.state === "waiting" ? this.lastStatus : status;
            if (!this.isOpen() || !this.controls || !(current.retryAt > Date.now())) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
                return;
            }
            this.setText(this.controls.statusDetail, this.getStatusDetailText(current));
        }, 1000);
        this.countdownTimer?.unref?.();
    }

    isConnectionTestRunning(kind = "translation") {
        const normalized = kind === "polish" ? "polish" : "translation";
        return Boolean(this.testRuns?.[normalized]?.isCurrent?.());
    }

    async runConnectionTest(button, kind = "translation") {
        const taskKind = kind === "polish" ? "polish" : "translation";
        if (this.isConnectionTestRunning(taskKind) || button?.disabled) return false;
        const plugin = this.plugin;
        const lifecycleToken = plugin.getLifecycleToken();
        if (!plugin.isLifecycleTokenCurrent(lifecycleToken)) return false;
        const run = { isCurrent: () => plugin.isLifecycleTokenCurrent(lifecycleToken) };
        this.testRuns[taskKind] = run;
        // The test reports its own result; a failure must not also raise the auto-translate notice.
        if (taskKind === "translation") {
            try {
                plugin.rememberTranslationAttentionNotice(null, plugin.getTranslationAttentionProviderKey(null), "local-unavailable");
            }
            catch {}
        }
        // A detached status node: the test result is saved as the task's API status like in settings.
        const statusSink = document.createElement("span");
        statusSink.dataset.daitKind = taskKind;
        try {
            return (await plugin.testApiConnection(taskKind, button, statusSink, {
                onStart: isCurrent => { run.isCurrent = isCurrent; }
            })) !== false;
        }
        finally {
            if (this.testRuns[taskKind] === run) {
                this.testRuns[taskKind] = false;
                if (plugin.isLifecycleTokenCurrent(lifecycleToken)) {
                    this.requestStatusUpdate();
                    if (this.isOpen()) this.update();
                }
            }
        }
    }

    // --- Position, keyboard and pointer ---

    // While the launcher is briefly gone or not laid out (a language switch or Discord re-creates the user panel), the
    // panel stays where it was anchored.
    getAnchorRect() {
        const launcher = this.plugin.isNodeConnected(this.launcher) ? this.launcher : null;
        const rect = launcher?.getBoundingClientRect?.();
        if (!rect || (!rect.width && !rect.height)) return this.lastAnchorRect;
        this.lastAnchorRect = {
            left: Number(rect.left || 0),
            top: Number(rect.top || 0),
            width: Number(rect.width || 0),
            height: Number(rect.height || 0),
            bottom: Number(rect.bottom ?? (Number(rect.top || 0) + Number(rect.height || 0)))
        };
        return this.lastAnchorRect;
    }

    // Above the launcher when it fits (Discord's user panel sits at the bottom), else below; always clamped
    // into the viewport.
    position() {
        const root = this.root;
        if (!root?.style) return;
        const viewportWidth = Number((typeof window !== "undefined" ? window.innerWidth : 0) || document.documentElement?.clientWidth || 0);
        const viewportHeight = Number((typeof window !== "undefined" ? window.innerHeight : 0) || document.documentElement?.clientHeight || 0);
        if (!viewportWidth || !viewportHeight) return;
        const box = root.getBoundingClientRect?.() || {};
        const width = Number(box.width) || Math.min(POPOVER_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2);
        const height = Number(box.height) || 0;
        const anchor = this.getAnchorRect();
        const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));
        let left = anchor ? anchor.left + anchor.width / 2 - width / 2 : VIEWPORT_MARGIN_PX;
        left = clamp(left, VIEWPORT_MARGIN_PX, viewportWidth - width - VIEWPORT_MARGIN_PX);
        let placement = "top";
        let top = viewportHeight - height - VIEWPORT_MARGIN_PX;
        if (anchor) {
            const spaceAbove = anchor.top - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
            const spaceBelow = viewportHeight - anchor.bottom - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
            if (height > spaceAbove && spaceBelow > spaceAbove) placement = "bottom";
            top = placement === "top" ? anchor.top - ANCHOR_GAP_PX - height : anchor.bottom + ANCHOR_GAP_PX;
        }
        top = clamp(top, VIEWPORT_MARGIN_PX, viewportHeight - height - VIEWPORT_MARGIN_PX);
        root.style.left = `${Math.round(left)}px`;
        root.style.top = `${Math.round(top)}px`;
        root.dataset.daitPlacement = placement;
    }

    bindListeners() {
        this.unbindListeners();
        const add = (target, type, handler, options) => {
            if (!target?.addEventListener) return;
            target.addEventListener(type, handler, options);
            this.listeners.push(() => target.removeEventListener?.(type, handler, options));
        };
        add(document, "keydown", event => this.handleDocumentKeydown(event), true);
        add(document, "pointerdown", event => this.handleDocumentPointerDown(event), true);
        if (typeof window !== "undefined") add(window, "resize", () => this.position(), { passive: true });
        // Keys typed in the panel stay in the panel (Discord's own shortcuts listen on the document).
        add(this.root, "keydown", event => {
            if (event?.key !== "Escape") event?.stopPropagation?.();
        });
    }

    unbindListeners() {
        const listeners = this.listeners.splice(0);
        listeners.forEach(remove => {
            try { remove(); }
            catch {}
        });
    }

    handleDocumentKeydown(event) {
        if (!this.isOpen() || !event) return;
        this.root.classList?.remove?.(POINTER_OPENED_CLASS);
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const focusInside = Boolean(active && this.root.contains?.(active));
        // The panel is not modal: once Discord (or the user) has put focus somewhere else, Escape and Tab belong
        // there (Tab accepts an emoji or a mention in the composer).
        const focusElsewhere = Boolean(active && active !== document.body && !focusInside && !this.isLauncherElement(active));
        if (event.key === "Escape") {
            if (focusElsewhere) return;
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            this.close("escape", { restoreFocus: true });
            return;
        }
        if (event.key === "Tab" && !focusElsewhere) this.trapTab(event, focusInside ? active : null);
    }

    trapTab(event, active) {
        const focusable = this.getFocusableElements();
        if (!focusable.length) {
            event.preventDefault?.();
            this.focusElement(this.root);
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!active) {
            event.preventDefault?.();
            this.focusElement(event.shiftKey ? last : first);
            return;
        }
        if (event.shiftKey && (active === first || !focusable.includes(active))) {
            event.preventDefault?.();
            this.focusElement(last);
            return;
        }
        if (!event.shiftKey && (active === last || !focusable.includes(active))) {
            event.preventDefault?.();
            this.focusElement(first);
        }
    }

    handleDocumentPointerDown(event) {
        if (!this.isOpen()) return;
        const target = event?.target;
        if (!target || this.root.contains?.(target)) return;
        // The launcher toggles the panel itself.
        if (this.isLauncherElement(target)) return;
        this.close("outside", { restoreFocus: false });
    }

    isLauncherElement(node) {
        if (!node) return false;
        if (this.launcher && (node === this.launcher || this.launcher.contains?.(node))) return true;
        return Boolean(node.closest?.(LAUNCHER_SELECTOR));
    }

    isElementHidden(element) {
        for (let node = element; node && node !== this.root; node = node.parentElement) {
            if (node.hidden) return true;
        }
        return false;
    }

    getFocusableElements() {
        const list = this.controls?.focusables || [];
        return list.filter(element => element
            && !element.disabled
            && !this.isElementHidden(element)
            && element.getAttribute?.("tabindex") !== "-1"
            && this.plugin.isNodeConnected(element));
    }

    focusElement(element) {
        if (!element?.focus) return;
        try {
            element.focus({ preventScroll: true });
        }
        catch {
            try { element.focus(); }
            catch {}
        }
    }

    startRouteWatch() {
        if (this.routeTimer) clearInterval(this.routeTimer);
        this.routeTimer = setInterval(() => {
            this.handleRouteChange();
            this.followAnchor();
        }, ROUTE_CHECK_INTERVAL_MS);
        this.routeTimer?.unref?.();
    }

    // Discord can move the user panel, and the launcher in it, without a window resize: the open panel follows on
    // the route watch's tick. Nothing is written while the launcher stays put.
    followAnchor() {
        if (!this.isOpen()) return false;
        if (!this.plugin.isNodeConnected(this.launcher)) {
            const found = this.findLauncher();
            if (!found) return false;
            this.launcher = found;
            this.setLauncherExpanded(found, true);
        }
        const rect = this.launcher.getBoundingClientRect?.();
        if (!rect || (!rect.width && !rect.height)) return false;
        const previous = this.lastAnchorRect;
        const same = previous && ["left", "top", "width", "height"].every(side => Math.round(Number(rect[side] || 0)) === Math.round(previous[side]));
        if (same) return false;
        this.position();
        return true;
    }

    stopTimers() {
        if (this.updateTimer) clearTimeout(this.updateTimer);
        if (this.routeTimer) clearInterval(this.routeTimer);
        if (this.countdownTimer) clearInterval(this.countdownTimer);
        this.updateTimer = null;
        this.updatePending = false;
        this.routeTimer = null;
        this.countdownTimer = null;
    }

    // --- Change notifications from the plugin ---

    handleSettingChanged(path = "") {
        if (path === "ui.showQuickSettingsPanelButton" && this.plugin.settings?.ui?.showQuickSettingsPanelButton === false) {
            this.close("launcher-hidden", { restoreFocus: false });
        }
        this.scheduleUpdate();
        if (!["polish.temperature", "polish.afterAction", "polish.repolishSource", "ui.maskTranslations", "ui.hideOriginalAfterTranslation", "ui.translationPosition", "ui.translationStyle", "ui.translationTextScale", "ui.panelTheme", "ui.quickPanelActiveTab", "ui.publicBilingualInputButton", "ui.publicBilingualAfterPolish"].includes(path)) {
            this.requestStatusUpdate();
        }
    }

    // Called by the scan when Discord navigates and, while the panel is open, by its route watch;
    // nothing is re-read unless the channel really changed.
    handleRouteChange() {
        const routeKey = this.plugin.getCurrentRouteKey();
        if (this.isOpen() && routeKey !== this.routeKey) {
            this.routeKey = routeKey;
            this.update();
        }
        if (routeKey === this.statusRouteKey) return;
        this.statusRouteKey = routeKey;
        this.requestStatusUpdate();
    }

    // --- Launcher status ---

    // "endpoint" for an invalid or unsafe API URL, "not-found" for a URL or model the service does not know,
    // "" for everything else (those are handled by the provider cooldowns and the connection test).
    getConfigErrorKind(error) {
        if (!error || this.plugin.isRequestCancelled?.(error)) return "";
        if (Object.hasOwn(API_ENDPOINT_ERROR_MESSAGE_KEYS, error.code)) return "endpoint";
        const status = Number(error.status || 0);
        if (error.providerModelNotFound || status === 404 || status === 405) return "not-found";
        return "";
    }

    // Called for every failed translation request (automatic and manual). Only the user can fix these errors,
    // so the launcher shows "needs you" until the settings change, a request or test succeeds, or the plugin stops.
    // The toast rules are not touched: they stay with notifyTranslationNeedsAttention.
    noteRequestFailure(requestOptions, error) {
        const kind = this.getConfigErrorKind(error);
        if (!kind) return false;
        let providerKey = "";
        try { providerKey = String(error?.providerKey || this.plugin.getAutoTranslationProviderKey(requestOptions) || ""); }
        catch { providerKey = ""; }
        if (!providerKey) return false;
        let message = "";
        try { message = String(this.plugin.formatError(error) || ""); }
        catch { message = ""; }
        this.configError = { kind, providerKey, message, at: Date.now() };
        return true;
    }

    // A passed connection test or a working request to the service ends the configuration error.
    noteApiStatus(kind, state) {
        if (kind === "translation" && state === "success") this.clearConfigError();
    }

    watchRequestResult(kind, requestOptions, result) {
        const record = this.configError;
        if (kind !== "translation" || !record || typeof result?.then !== "function") return;
        result.then(() => {
            let providerKey = "";
            try { providerKey = String(this.plugin.getAutoTranslationProviderKey(requestOptions) || ""); }
            catch { providerKey = ""; }
            if (this.configError === record && providerKey === record.providerKey) this.clearConfigError();
        }, () => {});
    }

    clearConfigError() {
        if (!this.configError) return false;
        this.configError = null;
        this.requestStatusUpdate();
        return true;
    }

    // The recorded configuration error, while it belongs to the service and settings in use (a changed URL, model
    // or key makes a new provider key, so the old error no longer shows).
    getConfigError(providerKey) {
        const record = this.configError;
        if (!record || !providerKey || record.providerKey !== providerKey) return null;
        return CONFIG_ERROR_REASON_KEYS[record.kind] ? record : null;
    }

    // Model and response time of the last passed connection test (plugin.getLastApiTestResult, when the provider
    // layer offers it), while the saved status still says connected, i.e. nothing was changed since.
    getLastTestSummary(api, kind = "translation") {
        if (api?.state !== "success") return "";
        let result = null;
        try { result = this.plugin.getLastApiTestResult?.(kind) || null; }
        catch { result = null; }
        if (!result || result.ok !== true) return "";
        const parts = [];
        const model = String(result.model || "").trim();
        if (model) parts.push(model);
        const latency = Number(result.latencyMs);
        if (result.latencyMs !== null && result.latencyMs !== undefined && Number.isFinite(latency) && latency >= 0) {
            parts.push(this.plugin.t("quickStatusLatency", { ms: String(Math.round(latency)) }));
        }
        return parts.join(" · ");
    }

    // Status for the Input Polish tab's connection card (reads polish provider/API state only).
    getPolishStatus() {
        const plugin = this.plugin;
        const t = (key, vars) => plugin.t(key, vars);
        const polish = plugin.settings?.polish || {};
        const ui = plugin.settings?.ui || {};
        const provider = plugin.getProviderDisplayName(polish.provider);
        const api = plugin.getApiStatus("polish");
        let configured = false;
        try { configured = Boolean(plugin.hasUsableApiConfig("polish")); }
        catch { configured = false; }
        let settingsTest = false;
        try { settingsTest = Boolean(plugin.isApiTestRunning?.("polish")); }
        catch { settingsTest = false; }
        const testing = this.isConnectionTestRunning("polish") || settingsTest;
        const apiState = api.state === "testing" && !testing ? "untested" : api.state;

        let connection = plugin.getApiStatusText(apiState);
        if (!configured) connection = t("quickStatusNotConfigured");
        else if (testing) connection = plugin.getApiStatusText("testing");

        let state = "ok";
        let detail = t("quickStatusPolishActive");
        let note = "";
        if (polish.enabled === false) {
            state = "off";
            detail = t("quickStatusPolishOff");
        }
        else if (!configured) {
            state = "needs-you";
            detail = t("quickStatusNeedsYou", { reason: t("quickStatusReasonConfig") });
        }
        else if (api.state === "failed" && !testing) {
            state = "needs-you";
            detail = t("quickStatusNeedsYou", { reason: t("quickStatusReasonFailed") });
            note = String(api.message || "").trim();
        }
        else if (testing) {
            state = "busy";
            detail = t("quickStatusTesting");
        }
        else {
            const btnHint = t(ui.injectInputButton !== false ? "quickStatusPolishBtnOn" : "quickStatusPolishBtnOff");
            const hotkeyHint = ui.enablePolishHotkey !== false && String(ui.polishHotkey || "").trim()
                ? String(ui.polishHotkey).trim()
                : t("quickStatusPolishHotkeyOff");
            note = [btnHint, hotkeyHint].filter(Boolean).join(" · ");
        }

        const headline = [provider, connection].filter(Boolean).join(" · ");
        const testSummary = state === "needs-you" ? "" : this.getLastTestSummary(api, "polish");
        return {
            state,
            provider,
            connection,
            headline,
            testSummary,
            detail,
            note,
            testing,
            configured
        };
    }

    getPolishStatusSafe() {
        try {
            return this.getPolishStatus();
        }
        catch {
            return null;
        }
    }

    // One of LAUNCHER_STATUS_STATES plus the texts shown on the launcher and in the panel. Reads state only
    // (no probes, no timers): translation API status, provider cooldowns, local health probes, the auto
    // queue and whether auto-translate runs in the current channel.
    getStatus(now = Date.now()) {
        const plugin = this.plugin;
        const t = (key, vars) => plugin.t(key, vars);
        const translation = plugin.settings?.translation || {};
        const provider = plugin.getProviderDisplayName(translation.provider);
        const api = plugin.getApiStatus("translation");
        let configured = false;
        try { configured = Boolean(plugin.hasUsableApiConfig("translation")); }
        catch { configured = false; }
        let providerKey = "";
        try { providerKey = String(plugin.getAutoTranslationProviderKey(plugin.getAutoTranslationOptions()) || ""); }
        catch { providerKey = ""; }
        const failure = providerKey ? plugin.autoTranslationProviderFailures?.get?.(providerKey) || null : null;
        const failureType = String(failure?.type || "");
        // A local service stays "down" until a probe or request succeeds; terminal auth/quota failures
        // stay active until fixed or expired; transient cooldowns end at retryAt.
        const failureActive = Boolean(failure && (
            failureType === "local-unavailable"
            || (failure.terminal && !plugin.isAutoTranslationFailureExpired(failure, now))
            || Number(failure.retryAt || 0) > now
        ));
        const configError = this.getConfigError(providerKey);
        const probing = Boolean(providerKey && plugin.localProviderHealthChecks?.has?.(providerKey));
        // Only work that is running counts: the saved "testing" status outlives a test or probe that was cut short.
        let settingsTest = false;
        try { settingsTest = Boolean(plugin.isApiTestRunning?.("translation")); }
        catch { settingsTest = false; }
        const testing = probing || this.isConnectionTestRunning("translation") || settingsTest;
        const apiState = api.state === "testing" && !testing ? "untested" : api.state;
        const queue = plugin.getAutoTranslationQueueSnapshot?.() || {};
        const inFlight = Math.max(0, Number(queue.inFlightItems || queue.inFlight || 0) || 0);
        const queued = Math.max(0, Number(queue.queueLength || 0) || 0);
        const autoActive = Boolean(plugin.isAutoTranslateEnabled());

        let connection = plugin.getApiStatusText(apiState);
        if (!configured) connection = t("quickStatusNotConfigured");
        else if (testing) connection = plugin.getApiStatusText("testing");
        else if (failureActive && ATTENTION_FAILURE_TYPES.has(failureType)) connection = plugin.getApiStatusText("failed");
        else if (configError) connection = plugin.getApiStatusText("failed");

        let state = "ok";
        let activity = t("quickStatusActive");
        let note = "";
        let reason = "";
        let retryAt = 0;
        let message = "";
        if (translation.enabled === false) {
            state = "off";
            activity = t("quickStatusOffDisabled");
        }
        else if (!configured) {
            state = "needs-you";
            const google = translation.provider === "googleCloud" && (plugin.settings?.googleTranslate?.keys || []).length > 0;
            reason = t(google ? "quickStatusReasonQuota" : "quickStatusReasonConfig");
        }
        else if (failureActive && ATTENTION_FAILURE_TYPES.has(failureType) && !testing) {
            state = "needs-you";
            reason = t(ATTENTION_REASON_KEYS[failureType]);
            message = api.state === "failed" ? api.message : "";
        }
        else if (configError && !testing) {
            state = "needs-you";
            reason = t(CONFIG_ERROR_REASON_KEYS[configError.kind]);
            message = configError.message;
        }
        else if (api.state === "failed" && !testing) {
            state = "needs-you";
            reason = t("quickStatusReasonFailed");
            message = api.message;
        }
        else if (testing) {
            state = "busy";
            activity = t("quickStatusTesting");
        }
        else if (!autoActive) {
            state = "off";
            activity = t("quickStatusOffChannel");
            note = t("quickStatusManualHint");
        }
        else if (failureActive && WAITING_FAILURE_TYPES.has(failureType)) {
            state = "waiting";
            reason = t(WAITING_REASON_KEYS[failureType]);
            retryAt = Number(failure.retryAt || 0);
            activity = t("quickStatusWaiting", { reason });
        }
        else if (inFlight > 0 || queued > 0) {
            state = "busy";
            activity = t("quickStatusBusy", { inFlight: String(inFlight), queued: String(queued) });
        }
        if (state === "needs-you") {
            activity = t("quickStatusNeedsYou", { reason });
            // The service's own words (e.g. "connect ECONNREFUSED …") help the user fix it.
            note = String(message || "").trim();
        }
        const headline = [provider, connection].filter(Boolean).join(" · ");
        const title = [provider, connection, activity].filter(Boolean).join(" · ");
        // The last passed connection test's model and response time ("Hy-MT2 · 820 ms"), a line of its own under
        // the connection; not while the user has something to fix.
        const testSummary = state === "needs-you" ? "" : this.getLastTestSummary(api, "translation");
        return {
            state,
            provider,
            connection,
            activity,
            headline,
            testSummary,
            // Panel lines: what is happening now, then an optional one-line note (hint or error text).
            detail: activity,
            note,
            reason,
            message,
            retryAt,
            testing,
            autoActive,
            title,
            ariaLabel: t("quickPanelLauncherLabel", { status: title })
        };
    }

    getStatusSafe() {
        try {
            return this.getStatus();
        }
        catch {
            return null;
        }
    }

    hasConnectedLauncher() {
        return Boolean(this.launcherRef && this.plugin.isNodeConnected(this.launcherRef));
    }

    // Coalesces bursts of changes (queue drains, status writes, settings) into one read per
    // STATUS_REFRESH_THROTTLE_MS, and does nothing while there is no launcher or open panel to update.
    requestStatusUpdate() {
        if (!this.plugin.isStarted || this.statusPending) return;
        if (!this.isOpen() && !this.hasConnectedLauncher()) return;
        this.statusPending = true;
        this.statusTimer = setTimeout(() => {
            this.statusPending = false;
            this.statusTimer = null;
            this.refreshStatus();
        }, STATUS_REFRESH_THROTTLE_MS);
        this.statusTimer?.unref?.();
    }

    refreshStatus(options = {}) {
        if (!this.plugin.isStarted || typeof document === "undefined") return null;
        const status = this.getStatusSafe();
        if (!status) return null;
        const signature = `${status.state}\n${status.title}`;
        const changed = Boolean(options.force) || signature !== this.lastStatusSignature;
        this.lastStatus = status;
        this.lastStatusSignature = signature;
        if (changed) {
            [...(document.querySelectorAll?.(LAUNCHER_SELECTOR) || [])].forEach(button => this.applyLauncherStatus(button, status));
        }
        if (this.isOpen()) this.renderStatus(status);
        this.scheduleStatusExpiry(status);
        return status;
    }

    // A cooldown ends without any event; look again once it is over.
    scheduleStatusExpiry(status) {
        const at = status?.state === "waiting" ? Number(status.retryAt || 0) : 0;
        if (at === this.statusExpiryAt) return;
        if (this.statusExpiryTimer) clearTimeout(this.statusExpiryTimer);
        this.statusExpiryTimer = null;
        this.statusExpiryAt = at;
        if (!at) return;
        this.statusExpiryTimer = setTimeout(() => {
            this.statusExpiryTimer = null;
            this.statusExpiryAt = 0;
            this.requestStatusUpdate();
        }, Math.max(0, at - Date.now()) + STATUS_EXPIRY_SLACK_MS);
        this.statusExpiryTimer?.unref?.();
    }

    // Called for each launcher Discord's user panel gets; the badge shows the current status at once.
    // Read fresh: a launcher is re-created after a language switch, and the cached texts would be stale.
    decorateLauncher(button) {
        if (!button) return button;
        this.launcherRef = button;
        const status = this.getStatusSafe() || this.lastStatus;
        if (status) {
            this.lastStatus = status;
            this.lastStatusSignature = `${status.state}\n${status.title}`;
            this.applyLauncherStatus(button, status);
        }
        if (this.isOpen()) {
            this.launcher = button;
            this.setLauncherExpanded(button, true);
            // Anchor to the new launcher once it is in the user panel.
            this.scheduleUpdate();
        }
        return button;
    }

    applyLauncherStatus(button, status) {
        if (!button?.setAttribute || !status) return false;
        this.launcherRef = button;
        let badge = button.querySelector?.(".dait-launcher-status") || null;
        let dot = badge?.querySelector?.(".dait-qp-dot") || null;
        const created = !badge || !dot;
        if (created) {
            badge?.remove?.();
            badge = this.createElement("span", "dait-launcher-status");
            badge.setAttribute("aria-hidden", "true");
            dot = this.createElement("span", "dait-qp-dot");
            badge.appendChild(dot);
            button.appendChild(badge);
        }
        if (!created && button.dataset?.daitStatus === status.state && button.title === status.title) return false;
        dot.dataset.daitStatus = status.state;
        button.dataset.daitStatus = status.state;
        button.title = status.title;
        button.setAttribute("aria-label", status.ariaLabel);
        return true;
    }
}

module.exports = { QuickPanel, LAUNCHER_STATUS_STATES, QUICK_POPOVER_ID: POPOVER_ID, QUICK_PANEL_TABS };
