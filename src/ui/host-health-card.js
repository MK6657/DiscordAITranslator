"use strict";

// Renders the live "Discord Host Health Check" card inside the Settings Data & Diagnostics tab.
// Gives users and maintainers one-click visibility into every Discord/BetterDiscord anchor.

function buildHostHealthCard(plugin) {
    const card = document.createElement("div");
    card.className = "dait-host-health-card dait-settings-search-target";
    card.dataset.daitHostHealthCard = "true";
    card.dataset.daitSearchLabel = plugin.t("hostHealthTitle");
    card.dataset.daitSearchDescription = plugin.t("hostHealthDesc");

    const head = document.createElement("div");
    head.className = "dait-host-health-head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "dait-host-health-title-wrap";

    const title = document.createElement("div");
    title.className = "dait-host-health-title";
    title.textContent = plugin.t("hostHealthTitle");
    titleWrap.appendChild(title);

    const desc = document.createElement("div");
    desc.className = "dait-host-health-desc";
    desc.textContent = plugin.t("hostHealthDesc");
    titleWrap.appendChild(desc);

    const badge = document.createElement("span");
    badge.className = "dait-host-health-summary";
    head.appendChild(titleWrap);
    head.appendChild(badge);
    card.appendChild(head);

    const list = document.createElement("ul");
    list.className = "dait-host-health-list";
    card.appendChild(list);

    const actions = document.createElement("div");
    actions.className = "dait-host-health-actions";

    const recheckBtn = document.createElement("button");
    recheckBtn.type = "button";
    recheckBtn.className = "dait-small-button dait-small-button-primary";
    recheckBtn.dataset.daitHostHealthAction = "recheck";
    recheckBtn.textContent = plugin.t("hostHealthRecheck");

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "dait-small-button dait-small-button-outline";
    copyBtn.dataset.daitHostHealthAction = "copy";
    copyBtn.textContent = plugin.t("hostHealthCopyReport");

    actions.appendChild(recheckBtn);
    actions.appendChild(copyBtn);
    card.appendChild(actions);

    let lastReport = null;

    const render = () => {
        lastReport = plugin.runHostHealthCheck();
        const { summary, checks } = lastReport;
        badge.className = `dait-host-health-summary dait-host-health-summary-${summary.overall}`;
        if (summary.overall === "ok") {
            badge.textContent = plugin.t("hostHealthSummaryOk", { ok: summary.ok, total: summary.total });
        }
        else if (summary.overall === "warn") {
            badge.textContent = plugin.t("hostHealthSummaryWarn", { ok: summary.ok, warn: summary.warn, error: summary.error });
        }
        else {
            badge.textContent = plugin.t("hostHealthSummaryError", { ok: summary.ok, warn: summary.warn, error: summary.error });
        }

        while (list.firstChild) list.firstChild.remove?.();
        checks.forEach(item => {
            const li = document.createElement("li");
            li.className = `dait-host-health-item dait-host-health-item-${item.status}`;
            li.dataset.daitHostHealthCheck = item.id;

            const dot = document.createElement("span");
            dot.className = "dait-host-health-dot";
            dot.setAttribute("aria-hidden", "true");
            li.appendChild(dot);

            const label = document.createElement("span");
            label.className = "dait-host-health-label";
            label.textContent = plugin.t(item.labelKey);
            li.appendChild(label);

            const state = document.createElement("span");
            state.className = "dait-host-health-state";
            state.textContent = plugin.t(
                item.status === "ok"
                    ? "hostHealthStateOk"
                    : item.status === "warn"
                        ? "hostHealthStateWarn"
                        : "hostHealthStateError"
            );
            li.appendChild(state);

            const detail = document.createElement("span");
            detail.className = "dait-host-health-detail";
            detail.textContent = item.detail || "";
            detail.title = item.detail || "";
            li.appendChild(detail);

            list.appendChild(li);
        });
    };

    recheckBtn.addEventListener("click", event => {
        event?.preventDefault?.();
        render();
    });

    copyBtn.addEventListener("click", async event => {
        event?.preventDefault?.();
        if (!lastReport) render();
        const payload = JSON.stringify(lastReport, null, 2);
        try {
            await plugin.copyTextToClipboard(payload);
            plugin.showToast(plugin.t("hostHealthCopied"), "success");
        }
        catch (error) {
            plugin.showToast(plugin.t("promptCopyFailed", { error: plugin.formatError(error) }), "error");
        }
    });

    render();
    return card;
}

module.exports = { buildHostHealthCard };
