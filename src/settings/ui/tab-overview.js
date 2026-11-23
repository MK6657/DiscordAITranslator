"use strict";

const {
    SETTINGS_TAB_OVERVIEW,
    SETTINGS_TAB_TRANSLATE,
    SETTINGS_TAB_COMPOSE,
    normalizeSettingsTabId
} = require("../settings-schema");

const methods = {
    createSettingsGroup(titleText, key, options = {}) {
        const group = document.createElement("section");
        group.className = `dait-settings-group dait-settings-group-${key}${options.className ? ` ${options.className}` : ""}`;
        group.dataset.daitSettingsGroup = key;
        group.dataset.daitSearchGroup = titleText || "";
        if (titleText) {
            const title = document.createElement("h3");
            title.className = "dait-settings-group-title";
            title.textContent = titleText;
            group.appendChild(title);
        }
        if (options.description) {
            const note = document.createElement("p");
            note.className = "dait-settings-group-note";
            note.textContent = options.description;
            group.appendChild(note);
        }
        return group;
    },

    createOverviewTabContent() {
        return [this.createOverviewStatusSection(), this.createGeneralSection()];
    },

    // Setup checklist (hidden once everything is done) and the status of the two services, each with a Test button.
    // Rebuilt in place when the overview is shown, after a test and when a setting it reports on changes.
    createOverviewStatusSection() {
        const section = document.createElement("section");
        section.className = "dait-settings-group dait-overview-status";
        section.dataset.daitSettingsGroup = "overview-status";
        section.dataset.daitSearchGroup = "";

        const items = this.getOverviewSetupItems();
        const done = items.filter(item => item.done).length;
        if (done < items.length) section.appendChild(this.createOverviewSetupCard(items, done));

        const title = document.createElement("h3");
        title.className = "dait-settings-group-title";
        title.textContent = this.plugin.t("overviewServicesTitle");
        section.appendChild(title);
        const cards = document.createElement("div");
        cards.className = "dait-service-cards";
        ["translation", "polish"].forEach(kind => cards.appendChild(this.createOverviewServiceCard(kind)));
        section.appendChild(cards);
        return section;
    },

    // One entry per setup step: { id, label, state, done, detail, action }. state is the icon: done, todo, error,
    // busy or off (a step that does not apply, which counts as done). action: { key, text, run } or
    // { key, text, tab, path } (opens that tab and focuses the control).
    getOverviewSetupItems() {
        const translation = this.plugin.settings.translation || {};
        const providerName = this.plugin.getProviderDisplayName(translation.provider);
        const enabled = translation.enabled !== false;
        const configured = enabled && this.plugin.hasUsableApiConfig("translation");
        const status = this.plugin.getApiStatus("translation");
        const routeKey = this.plugin.getCurrentRouteKey();
        const hasChannel = Boolean(this.plugin.getChannelAutoTranslatePolicyStorageKey(routeKey));
        const rule = hasChannel ? this.plugin.getCurrentChannelAutoTranslatePolicyMode(routeKey) : "";
        const autoOn = Boolean(this.plugin.settings.ui?.autoTranslateMessages);
        const target = String(translation.targetLanguage || "").trim();
        const items = [];

        items.push({
            id: "service",
            label: this.plugin.t("overviewSetupService"),
            done: configured,
            state: configured ? "done" : "todo",
            detail: !enabled ? this.plugin.t("overviewSetupServiceOff") : configured ? providerName : this.plugin.t("overviewSetupServiceMissing", { provider: providerName }),
            action: configured ? null : { key: "setup", text: this.plugin.t("overviewSetUp"), tab: SETTINGS_TAB_TRANSLATE, path: enabled ? this.getMissingServiceSettingPath("translation") : "translation.enabled" }
        });

        const tested = status.state === "success";
        items.push({
            id: "test",
            label: this.plugin.t("overviewSetupTest"),
            done: tested,
            state: tested ? "done" : status.state === "failed" ? "error" : status.state === "testing" ? "busy" : "todo",
            detail: !configured && !tested ? this.plugin.t("overviewSetupTestBlocked") : this.getApiTestSummaryText("translation"),
            action: tested || !configured ? null : { key: "test", text: this.plugin.t("apiTest"), run: "test" }
        });

        items.push({
            id: "target",
            label: this.plugin.t("overviewSetupTarget"),
            done: Boolean(target),
            state: target ? "done" : "todo",
            detail: target ? this.plugin.getDisplayLanguage(target) : "",
            action: target ? null : { key: "setup", text: this.plugin.t("overviewSetUp"), tab: SETTINGS_TAB_TRANSLATE, path: "translation.targetLanguage" }
        });

        const autoDone = autoOn || rule === "enabled";
        items.push({
            id: "auto",
            label: this.plugin.t("overviewSetupAuto"),
            done: autoDone,
            state: autoDone ? "done" : "todo",
            detail: autoOn ? this.plugin.t("overviewSetupAutoOn") : autoDone ? this.plugin.t("overviewSetupAutoChannel") : this.plugin.t("overviewSetupAutoOff"),
            action: autoDone ? null : { key: "auto", text: this.plugin.t("overviewTurnOn"), run: "autoTranslate" }
        });

        const channelLabel = hasChannel ? this.getSettingsChannelLabel(routeKey) : "";
        const channelDetail = !hasChannel
            ? this.plugin.t("overviewSetupChannelNone")
            : rule === "disabled"
                ? this.plugin.t("overviewSetupChannelNever")
                : rule === "enabled" ? this.plugin.t("channelRuleAlways") : this.plugin.t("channelRuleFollow");
        items.push({
            id: "channel",
            label: this.plugin.t("overviewSetupChannel"),
            done: rule !== "disabled",
            state: !hasChannel ? "off" : rule === "disabled" ? "todo" : "done",
            detail: channelLabel ? `${channelLabel} · ${channelDetail}` : channelDetail,
            action: rule === "disabled" ? { key: "channel", text: this.plugin.t("overviewChange"), tab: SETTINGS_TAB_OVERVIEW, path: "ui.currentChannelAutoTranslatePolicy" } : null
        });
        return items;
    },

    createOverviewSetupCard(items, done) {
        const card = document.createElement("div");
        card.className = "dait-setup-card";
        const titleId = this.createSettingsControlId("dait-setup-title");
        card.setAttribute("role", "region");
        card.setAttribute("aria-labelledby", titleId);

        const head = document.createElement("div");
        head.className = "dait-setup-head";
        const title = document.createElement("h3");
        title.className = "dait-setup-title";
        title.id = titleId;
        title.textContent = this.plugin.t("overviewSetupTitle", { count: items.length - done });
        head.appendChild(title);
        const progress = document.createElement("span");
        progress.className = "dait-setup-progress";
        progress.textContent = this.plugin.t("overviewSetupProgress", { done, total: items.length });
        head.appendChild(progress);
        card.appendChild(head);

        const list = document.createElement("ul");
        list.className = "dait-setup-list";
        items.forEach(item => {
            const entry = document.createElement("li");
            entry.className = `dait-setup-item dait-setup-item-${item.state}`;
            entry.dataset.daitSetupItem = item.id;

            const icon = document.createElement("span");
            icon.className = "dait-setup-icon";
            const iconText = document.createElement("span");
            iconText.className = "dait-visually-hidden";
            iconText.textContent = this.plugin.t(item.done ? "overviewStateDone" : "overviewStateTodo");
            icon.appendChild(iconText);
            entry.appendChild(icon);

            const label = document.createElement("span");
            label.className = "dait-setup-label";
            label.textContent = item.label;
            entry.appendChild(label);

            const detail = document.createElement("span");
            detail.className = "dait-setup-detail";
            detail.textContent = item.detail || "";
            detail.title = item.detail || "";
            entry.appendChild(detail);

            if (item.action) entry.appendChild(this.createOverviewActionButton(item.action, item.label));
            list.appendChild(entry);
        });
        card.appendChild(list);
        return card;
    },

    createOverviewActionButton(action, context = "") {
        const button = this.createSmallButton(action.text, action.run === "autoTranslate" || action.run === "test" ? "primary" : "outline");
        button.dataset.daitOverviewAction = action.key;
        if (context) button.setAttribute("aria-label", `${action.text}: ${context}`);
        button.addEventListener("click", event => {
            event?.preventDefault?.();
            if (action.run === "test") {
                this.runOverviewApiTest("translation", button);
                return;
            }
            if (action.run === "autoTranslate") {
                this.plugin.setSetting("ui.autoTranslateMessages", true);
                this.refreshOverviewStatusSection(button.closest?.(".dait-settings") || null);
                return;
            }
            this.openSettingsControl(button, action.tab, action.path);
        });
        return button;
    },

    // Service card: task and service name, the connection state (the same live badge as the connection card), a
    // detail line and Test, or "Set up" while the service is off or missing a field.
    createOverviewServiceCard(kind) {
        const task = this.plugin.settings[kind] || {};
        const card = document.createElement("div");
        card.className = "dait-service-card";
        card.dataset.daitKind = kind;

        const text = document.createElement("div");
        text.className = "dait-service-card-text";
        const title = document.createElement("div");
        title.className = "dait-service-card-title";
        title.textContent = `${this.plugin.t(kind === "polish" ? "overviewCardPolish" : "overviewCardTranslation")} · ${this.plugin.getProviderDisplayName(task.provider)}`;
        text.appendChild(title);

        const line = document.createElement("div");
        line.className = "dait-service-card-status";
        const enabled = task.enabled !== false;
        const configured = enabled && this.plugin.hasUsableApiConfig(kind);
        let action = null;
        if (!enabled || !configured) {
            const mark = document.createElement("span");
            mark.className = `dait-status-mark dait-status-mark-${enabled ? "needs" : "off"}`;
            mark.textContent = enabled ? this.plugin.t("overviewServiceMissing", { field: this.getSettingLabelForPath(this.getMissingServiceSettingPath(kind)) }) : this.plugin.t("overviewServiceOff");
            line.appendChild(mark);
            action = { key: "setup", text: this.plugin.t("overviewSetUp"), tab: kind === "polish" ? SETTINGS_TAB_COMPOSE : SETTINGS_TAB_TRANSLATE, path: enabled ? this.getMissingServiceSettingPath(kind) : `${kind}.enabled` };
        }
        else {
            line.appendChild(this.createApiStatusBadge(kind));
            line.appendChild(this.createApiTestDetail(kind));
        }
        text.appendChild(line);
        card.appendChild(text);

        if (action) {
            const setup = this.createOverviewActionButton(action, title.textContent);
            card.appendChild(setup);
        }
        else {
            const test = this.createSmallButton(this.plugin.t("apiTest"));
            test.dataset.daitAction = "apiTest";
            test.dataset.daitKind = kind;
            test.setAttribute("aria-label", `${this.plugin.t("apiTest")}: ${title.textContent}`);
            test.addEventListener("click", event => {
                event?.preventDefault?.();
                this.runOverviewApiTest(kind, test, line.querySelector?.(".dait-api-status"));
            });
            card.appendChild(test);
        }
        return card;
    },

    // A test started from the overview: the card's badge shows it, then every view of this task's status follows.
    runOverviewApiTest(kind, button, badge = null) {
        const status = badge || this.createApiStatusBadge(kind);
        return Promise.resolve(this.plugin.testApiConnection(kind, button, status)).then(committed => {
            if (committed !== false) this.refreshApiTestViews(kind);
            return committed;
        });
    },

    // The first field a task's service still needs, or its provider select.
    getMissingServiceSettingPath(kind) {
        const config = this.plugin.getTaskConfig(kind) || {};
        const provider = String(config.provider || "");
        const defaults = this.plugin.getProviderDefaults(provider) || {};
        const ui = this.plugin.getProviderCapabilities(provider)?.ui || {};
        if (provider === "baidu") {
            if (!String(config.appId || "").trim()) return `${kind}.appId`;
            if (!String(config.secretKey || "").trim()) return `${kind}.secretKey`;
        }
        if (provider === "googleCloud" && !this.plugin.getEffectiveRequestApiKey(config)) return "googleTranslate.keyPoolText";
        if (ui.apiKey && !this.plugin.isProviderApiKeyOptional(provider) && !String(config.apiKey || "").trim()) return `${kind}.apiKey`;
        if (ui.endpoint && !String(config.endpoint || defaults.endpoint || "").trim()) return `${kind}.endpoint`;
        if (ui.model && !String(config.model || defaults.model || "").trim()) return `${kind}.model`;
        return `${kind}.provider`;
    },

    getSettingLabelForPath(path) {
        const field = String(path || "").split(".").pop();
        const keys = {
            apiKey: "apiKey",
            endpoint: "endpoint",
            model: "model",
            appId: "baiduAppId",
            secretKey: "baiduSecretKey",
            keyPoolText: "googleTranslateKeys",
            provider: "provider",
            enabled: "enabled"
        };
        return this.plugin.t(keys[field] || "provider");
    },

    // "#general" for the current channel when Discord's store knows it.
    getSettingsChannelLabel(routeKey = this.plugin.getCurrentRouteKey()) {
        if (!this.plugin.getChannelAutoTranslatePolicyStorageKey(routeKey)) return "";
        const channelId = String(routeKey || "").split(":")[1] || "";
        try {
            const name = String(this.plugin.getDiscordNamedStore?.("ChannelStore")?.getChannel?.(channelId)?.name || "").trim();
            return name ? `#${name}` : "";
        }
        catch {
            return "";
        }
    },

    // Opens a tab and brings one control into view with focus (the overview's "Set up" / "Change" buttons).
    openSettingsControl(source, tabId, path) {
        const panel = source?.closest?.(".dait-settings");
        const state = panel?.__daitSettingsUi;
        if (!state) return false;
        const tab = state.tabs.find(item => item.id === normalizeSettingsTabId(tabId)) || state.tabs[0];
        const control = [...(tab.tabpanel?.querySelectorAll?.(`[data-dait-path='${path}']`) || [])][0] || null;
        const row = control?.closest?.(".dait-settings-row") || null;
        if (!row) {
            this.showSettingsTab(state, tab.id);
            return false;
        }
        return this.openSettingsSearchResult(state, { row, tabId: tab.id });
    },

    // Rebuilds the overview status sections under root (a panel, a tab page, or the whole document), keeping the
    // keyboard focus on the same kind of button when it was inside.
    refreshOverviewStatusSection(root = null) {
        const scope = root || (typeof document !== "undefined" ? document : null);
        let sections = [];
        try {
            sections = [...(scope?.querySelectorAll?.(".dait-overview-status") || [])];
        }
        catch {
            sections = [];
        }
        // Only sections still on a page, each once (a replaced section may linger in a detached tree).
        sections = sections.filter(section => section?.replaceWith && !section.__daitReplaced && section.isConnected !== false);
        sections.forEach(section => {
            section.__daitReplaced = true;
            const active = typeof document !== "undefined" ? document.activeElement : null;
            const hadFocus = Boolean(active && section.contains?.(active));
            const focusAction = hadFocus ? String(active.dataset?.daitOverviewAction || active.dataset?.daitAction || "") : "";
            const focusKind = hadFocus ? String(active.closest?.(".dait-service-card")?.dataset?.daitKind || "") : "";
            const next = this.createOverviewStatusSection();
            section.replaceWith(next);
            if (!hadFocus) return;
            const candidates = [...(next.querySelectorAll?.("button") || [])];
            const target = candidates.find(button => (button.dataset?.daitOverviewAction || button.dataset?.daitAction) === focusAction
                && String(button.closest?.(".dait-service-card")?.dataset?.daitKind || "") === focusKind)
                || candidates.find(button => !button.disabled);
            this.focusSettingsElement(target);
        });
        return sections.length;
    },

    // Setting writes the overview reports on refresh it once, after the current event.
    scheduleOverviewStatusRefresh(path = "") {
        if (!/^(translation|polish|googleTranslate)\./.test(path) && !["ui.autoTranslateMessages", "ui.currentChannelAutoTranslatePolicy"].includes(path)) return;
        if (this.plugin.overviewStatusRefreshTimer || typeof setTimeout !== "function") return;
        this.plugin.overviewStatusRefreshTimer = setTimeout(() => {
            this.plugin.overviewStatusRefreshTimer = null;
            if (!this.plugin.isStarted || typeof document === "undefined") return;
            this.refreshOverviewStatusSection();
        }, 0);
        this.plugin.unrefTimer(this.plugin.overviewStatusRefreshTimer);
    },

    // After a connection test: every badge, detail line and overview of this task shows the new state.
    refreshApiTestViews(kind) {
        if (typeof document === "undefined") return;
        const status = this.plugin.getApiStatus(kind);
        let badges = [];
        let details = [];
        try {
            badges = [...(document.querySelectorAll?.(`.dait-api-status[data-dait-kind='${kind}']`) || [])];
            details = [...(document.querySelectorAll?.(`.dait-api-test-detail[data-dait-kind='${kind}']`) || [])];
        }
        catch {}
        badges.forEach(badge => this.renderApiStatusBadge(badge, kind, status.state, this.plugin.getApiStatusText(status.state), status.message || ""));
        details.forEach(detail => this.syncApiTestDetail(detail, kind));
        this.refreshSavedServiceConfigControls();
        this.refreshOverviewStatusSection();
    },

    // Text after the status badge: "Hy-MT2 · 820 ms · just now" after a passed test, the error after a failed one.
    createApiTestDetail(kind) {
        const detail = document.createElement("span");
        detail.className = "dait-api-test-detail";
        detail.dataset.daitKind = kind;
        this.syncApiTestDetail(detail, kind);
        return detail;
    },

    syncApiTestDetail(detail, kind) {
        if (!detail) return;
        const status = this.plugin.getApiStatus(kind);
        const result = this.plugin.getLastApiTestResult(kind);
        // A "connected" state can come from a working request as well; details only come from a test.
        let text = "";
        if (status.state === "success") text = result?.ok ? this.formatApiTestResult(result) : "";
        else if (status.state === "failed") text = status.message || result?.message || "";
        detail.dataset.daitFor = status.state;
        detail.textContent = text;
        detail.title = text;
        detail.hidden = !text;
    },

    // "Hy-MT2 · 820 ms · just now"
    formatApiTestResult(result) {
        if (!result) return "";
        return [
            result.model || "",
            this.formatLatency(result.latencyMs),
            this.formatTimeAgo(result.at)
        ].filter(Boolean).join(" · ");
    },

    // One line for the overview checklist: the result of the last test, or that none ran.
    getApiTestSummaryText(kind) {
        const status = this.plugin.getApiStatus(kind);
        const result = this.plugin.getLastApiTestResult(kind);
        if (status.state === "success") {
            const details = result?.ok ? this.formatApiTestResult(result) : "";
            return details ? `${this.plugin.t("apiStatusSuccess")} · ${details}` : this.plugin.t("apiStatusSuccess");
        }
        if (status.state === "failed") return status.message || this.plugin.t("apiStatusFailed");
        if (status.state === "testing") return this.plugin.t("apiStatusTesting");
        return this.plugin.t("apiTestNotYet");
    },

    formatLatency(ms) {
        if (ms === null || ms === undefined || ms === "") return "";
        const value = Number(ms);
        if (!Number.isFinite(value) || value < 0) return "";
        if (value < 1000) return `${Math.round(value)} ms`;
        return `${(value / 1000).toFixed(1)} s`;
    },

    formatTimeAgo(at, now = Date.now()) {
        const time = Number(at);
        if (!Number.isFinite(time) || time <= 0) return "";
        const elapsed = Math.max(0, now - time);
        if (elapsed < 60 * 1000) return this.plugin.t("apiTestJustNow");
        if (elapsed < 60 * 60 * 1000) return this.plugin.t("apiTestMinutesAgo", { count: Math.floor(elapsed / 60000) });
        if (elapsed < 24 * 60 * 60 * 1000) return this.plugin.t("apiTestHoursAgo", { count: Math.floor(elapsed / 3600000) });
        return this.formatDiagnosticSummaryTime(new Date(time).toISOString());
    }
};

module.exports = methods;
