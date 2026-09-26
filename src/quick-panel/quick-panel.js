"use strict";

// The user-panel launcher's compact quick panel (a popover anchored to the "AI" button) and the
// launcher's status badge. The full settings window stays in openQuickSettingsPanel(); this module
// only calls it. Everything here talks to the plugin through `this.plugin`.

const { LANGUAGE_PRESETS } = require("../constants");
const { PLUGIN_VERSION } = require("../version");

const POPOVER_ID = "dait-quick-popover";
const POPOVER_WIDTH_PX = 340;
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
const ICON_NAMES = { gear: "dait-qp-icon-gear", close: "dait-qp-icon-close" };

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
        this.testRunning = false;
        this.statusPending = false;
        this.statusTimer = null;
        this.statusExpiryTimer = null;
        this.statusExpiryAt = 0;
        this.lastStatus = null;
        this.lastStatusSignature = "";
        this.statusRouteKey = "";
        this.launcherRef = null;
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
            this.plugin.syncDiscordThemeClasses(root, anchor || document.body);
            document.body.appendChild(root);
            this.update();
            this.position();
            this.bindListeners();
            this.setLauncherExpanded(anchor, true);
            this.focusElement(this.getFocusableElements()[0] || root);
            this.startRouteWatch();
            this.plugin.logQuickSettingsDiagnostic("popover.open", "ok", { source: String(options.source || "") });
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
        this.lastStatusSignature = "";
        this.statusRouteKey = "";
        this.launcherRef = null;
        this.testRunning = false;
    }

    removeStrayPopovers() {
        if (typeof document === "undefined") return;
        document.querySelectorAll?.(`.${POPOVER_ID}`)?.forEach(node => {
            if (node !== this.root) node.remove?.();
        });
    }

    openFullSettings() {
        const launcher = this.plugin.isNodeConnected(this.launcher) ? this.launcher : this.findLauncher();
        this.close("open-full-settings", { restoreFocus: false });
        return this.plugin.openQuickSettingsPanel("quick-panel", launcher);
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

    // --- DOM ---

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

    createSwitchRow(key, label, description, onChange) {
        const id = `${POPOVER_ID}-${key}`;
        const row = this.createElement("div", "dait-qp-row");
        const text = this.createElement("div", "dait-qp-row-text");
        const labelNode = this.createElement("label", "dait-qp-label", label);
        labelNode.htmlFor = id;
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
        return { row, input };
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

        const body = this.createElement("div", "dait-qp-body");

        const status = this.createElement("div", "dait-qp-status");
        controls.statusDot = this.createElement("span", "dait-qp-dot");
        controls.statusDot.setAttribute("aria-hidden", "true");
        const statusText = this.createElement("div", "dait-qp-status-text");
        // Only the service line is announced (it changes when a test starts and ends); the activity
        // line changes with every queue step and the countdown every second.
        controls.statusLine = this.createElement("p", "dait-qp-status-line");
        controls.statusLine.setAttribute("role", "status");
        controls.statusLine.setAttribute("aria-live", "polite");
        controls.statusDetail = this.createElement("p", "dait-qp-status-detail");
        controls.statusNote = this.createElement("p", "dait-qp-status-note");
        controls.statusNote.hidden = true;
        statusText.appendChild(controls.statusLine);
        statusText.appendChild(controls.statusDetail);
        statusText.appendChild(controls.statusNote);
        controls.test = this.createButton("dait-qp-button dait-qp-button-secondary dait-qp-test", t("apiTest"), button => this.runConnectionTest(button));
        controls.test.title = t("translationTestConnectionTitle");
        status.appendChild(controls.statusDot);
        status.appendChild(statusText);
        status.appendChild(controls.test);
        body.appendChild(status);

        const auto = this.createSwitchRow("auto", t("quickPanelAutoTranslate"), t("quickPanelAutoTranslateDesc"),
            checked => this.plugin.setSetting("ui.autoTranslateMessages", checked));
        controls.auto = auto.input;
        body.appendChild(auto.row);

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
        body.appendChild(ruleRow);

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
        body.appendChild(targetRow);

        const display = this.createElement("h3", "dait-qp-section", t("quickPanelDisplay"));
        body.appendChild(display);
        const mask = this.createSwitchRow("mask", t("quickPanelMask"), t("quickPanelMaskDesc"),
            checked => this.plugin.setSetting("ui.maskTranslations", checked));
        controls.mask = mask.input;
        body.appendChild(mask.row);
        const hide = this.createSwitchRow("hide", t("quickPanelHideOriginal"), t("quickPanelHideOriginalDesc"),
            checked => this.plugin.setSetting("ui.hideOriginalAfterTranslation", checked));
        controls.hide = hide.input;
        body.appendChild(hide.row);

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
        body.appendChild(positionRow);
        root.appendChild(body);

        const footer = this.createElement("div", "dait-qp-footer");
        controls.footerOpenFull = this.createButton("dait-qp-link dait-qp-footer-open-full", t("quickPanelOpenFull"), () => this.openFullSettings());
        footer.appendChild(controls.footerOpenFull);
        footer.appendChild(this.createElement("span", "dait-qp-hint", t("quickPanelEscHint")));
        root.appendChild(footer);

        // Tab order is DOM order; the radio groups contribute their checked button only.
        controls.focusables = [
            controls.headerOpenFull,
            controls.close,
            controls.test,
            controls.auto,
            ...rule.buttons,
            controls.target,
            controls.mask,
            controls.hide,
            ...position.buttons,
            controls.footerOpenFull
        ];
        this.controls = controls;
        return root;
    }

    // Brings every control in line with the settings and the channel captured at render time.
    update() {
        const controls = this.controls;
        if (!this.root || !controls) return;
        const settings = this.plugin.settings || {};
        const ui = settings.ui || {};
        controls.auto.checked = Boolean(ui.autoTranslateMessages);
        controls.mask.checked = Boolean(ui.maskTranslations);
        controls.hide.checked = Boolean(ui.hideOriginalAfterTranslation);
        this.setSegmentedValue(controls.position, TRANSLATION_POSITIONS.includes(ui.translationPosition) ? ui.translationPosition : "before");

        const channelKey = this.plugin.getChannelAutoTranslatePolicyStorageKey(this.routeKey);
        const mode = channelKey ? this.plugin.getCurrentChannelAutoTranslatePolicyMode(this.routeKey) : "inherit";
        this.setText(controls.channelName, this.getChannelLabel(this.routeKey));
        this.setSegmentedValue(controls.rule, mode, { disabled: !channelKey });
        this.setText(controls.ruleCaption, this.getChannelRuleCaption(mode, Boolean(channelKey)));

        this.syncTargetOptions(String(settings.translation?.targetLanguage || ""));
        this.refreshStatus();
        this.position();
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

    syncTargetOptions(current) {
        const select = this.controls?.target;
        if (!select) return;
        const english = this.plugin.getLocale() === "en";
        const options = LANGUAGE_PRESETS.map(language => [language.value, english ? language.en : language.zh]);
        // A custom target language (typed in the full settings) stays selectable.
        if (current && !options.some(([value]) => value === current)) options.unshift([current, current]);
        const signature = options.map(([value]) => value).join("\n");
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
    }

    getChannelLabel(routeKey) {
        const [guildId = "", channelId = ""] = String(routeKey || "").split(":");
        if (!channelId) return this.plugin.t("quickPanelChannelNone");
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
        if (mode === "enabled") return this.plugin.t("quickPanelRuleCaptionEnabled");
        if (mode === "disabled") return this.plugin.t("quickPanelRuleCaptionDisabled");
        // With channel translation off altogether nothing is auto-translated, whatever the main switch says.
        const on = this.plugin.settings?.translation?.enabled !== false && Boolean(this.plugin.settings?.ui?.autoTranslateMessages);
        return this.plugin.t(on ? "quickPanelRuleCaptionInheritOn" : "quickPanelRuleCaptionInheritOff");
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

    renderStatus(status) {
        const controls = this.controls;
        if (!this.root || !controls || !status) return;
        if (this.root.dataset.daitStatus !== status.state) this.root.dataset.daitStatus = status.state;
        if (controls.statusDot.dataset.daitStatus !== status.state) controls.statusDot.dataset.daitStatus = status.state;
        let resized = this.setText(controls.statusLine, status.headline);
        resized = this.setText(controls.statusDetail, this.getStatusDetailText(status)) || resized;
        // The note is one line (a hint or the service's own error text); the tooltip holds all of it.
        resized = this.setText(controls.statusNote, status.note) || resized;
        if (controls.statusNote.title !== (status.note || "")) controls.statusNote.title = status.note || "";
        if (controls.statusNote.hidden !== !status.note) {
            controls.statusNote.hidden = !status.note;
            resized = true;
        }
        if (!this.testRunning) controls.test.disabled = status.testing;
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

    async runConnectionTest(button) {
        if (this.testRunning || button?.disabled) return false;
        const plugin = this.plugin;
        this.testRunning = true;
        // The test reports its own result; a failure must not also raise the auto-translate notice.
        try {
            plugin.rememberTranslationAttentionNotice(null, plugin.getTranslationAttentionProviderKey(null), "local-unavailable");
        }
        catch {}
        // A detached status node: the test result is saved as the translation API status like in settings.
        const statusSink = document.createElement("span");
        statusSink.dataset.daitKind = "translation";
        try {
            await plugin.testApiConnection("translation", button, statusSink);
        }
        finally {
            this.testRunning = false;
            this.requestStatusUpdate();
            if (this.isOpen()) this.update();
        }
        return true;
    }

    // --- Position, keyboard and pointer ---

    getAnchorRect() {
        const launcher = this.plugin.isNodeConnected(this.launcher) ? this.launcher : null;
        const rect = launcher?.getBoundingClientRect?.();
        if (!rect || (!rect.width && !rect.height)) return null;
        return {
            left: Number(rect.left || 0),
            top: Number(rect.top || 0),
            width: Number(rect.width || 0),
            height: Number(rect.height || 0),
            bottom: Number(rect.bottom ?? (Number(rect.top || 0) + Number(rect.height || 0)))
        };
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
        if (event.key === "Escape") {
            const focusElsewhere = active && active !== document.body && !focusInside && !this.isLauncherElement(active);
            if (focusElsewhere) return;
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            this.close("escape", { restoreFocus: true });
            return;
        }
        if (event.key === "Tab") this.trapTab(event, focusInside ? active : null);
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

    getFocusableElements() {
        const list = this.controls?.focusables || [];
        return list.filter(element => element
            && !element.disabled
            && !element.hidden
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
        this.routeTimer = setInterval(() => this.handleRouteChange(), ROUTE_CHECK_INTERVAL_MS);
        this.routeTimer?.unref?.();
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
        this.requestStatusUpdate();
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
        // A local service stays "down" until a probe or request succeeds; other cooldowns end at retryAt.
        const failureActive = Boolean(failure && (failureType === "local-unavailable" || Number(failure.retryAt || 0) > now));
        const probing = Boolean(providerKey && plugin.localProviderHealthChecks?.has?.(providerKey));
        const testing = api.state === "testing" || probing || this.testRunning;
        const queue = plugin.getAutoTranslationQueueSnapshot?.() || {};
        const inFlight = Math.max(0, Number(queue.inFlightItems || queue.inFlight || 0) || 0);
        const queued = Math.max(0, Number(queue.queueLength || 0) || 0);
        const autoActive = Boolean(plugin.isAutoTranslateEnabled());

        let connection = plugin.getApiStatusText(api.state);
        if (!configured) connection = t("quickStatusNotConfigured");
        else if (testing) connection = plugin.getApiStatusText("testing");
        else if (failureActive && ATTENTION_FAILURE_TYPES.has(failureType)) connection = plugin.getApiStatusText("failed");

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
        return {
            state,
            provider,
            connection,
            activity,
            headline,
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

module.exports = { QuickPanel, LAUNCHER_STATUS_STATES, QUICK_POPOVER_ID: POPOVER_ID };
