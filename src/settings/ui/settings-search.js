"use strict";

const methods = {
    createSettingsSearch(state) {
        const wrap = document.createElement("div");
        wrap.className = "dait-settings-search";
        const input = document.createElement("input");
        input.type = "search";
        input.className = "dait-settings-search-input";
        input.placeholder = this.plugin.t("settingsSearchPlaceholder");
        input.autocomplete = "off";
        input.spellcheck = false;
        input.setAttribute("aria-label", this.plugin.t("settingsSearchPlaceholder"));
        input.setAttribute("aria-controls", state.resultsId);
        input.addEventListener("input", () => this.runSettingsSearch(state, input.value));
        input.addEventListener("keydown", event => this.handleSettingsSearchKeydown(state, event));
        input.addEventListener("focus", () => this.bindSettingsSearchEscape(state));
        state.searchInput = input;
        wrap.appendChild(input);
        return wrap;
    },

    createSettingsSearchResults(state) {
        const results = document.createElement("div");
        results.className = "dait-settings-search-results";
        results.id = state.resultsId;
        results.setAttribute("role", "region");
        results.setAttribute("aria-label", this.plugin.t("settingsSearchPlaceholder"));
        results.hidden = true;

        const summary = document.createElement("p");
        summary.className = "dait-settings-search-summary";
        summary.setAttribute("aria-live", "polite");
        results.appendChild(summary);

        const list = document.createElement("ul");
        list.className = "dait-settings-search-list";
        results.appendChild(list);

        state.results = results;
        state.resultsSummary = summary;
        state.resultsList = list;
        return results;
    },

    // Every searchable row with the tab it lives on. Group titles and the row's own button texts (Clear stats,
    // Export JSON, Test) take part in matching but are not shown.
    getSettingsSearchEntries(state) {
        const entries = [];
        const visit = (node, tab, groupTitle) => {
            for (const child of node?.children || []) {
                const group = child.dataset?.daitSearchGroup;
                const nextGroup = group !== undefined ? group : groupTitle;
                const classes = String(child.className || "").split(/\s+/);
                if (classes.includes("dait-settings-row") || classes.includes("dait-settings-search-target")) {
                    const label = String(child.dataset?.daitSearchLabel || "").trim();
                    if (label) {
                        const description = String(child.dataset?.daitSearchDescription || "").trim();
                        entries.push({
                            row: child,
                            tabId: tab.id,
                            tabLabel: tab.label,
                            label,
                            description,
                            haystack: `${label} ${description} ${this.getSettingsSearchButtonText(child)} ${nextGroup || ""} ${tab.label}`.toLocaleLowerCase()
                        });
                    }
                }
                visit(child, tab, nextGroup);
            }
        };
        (state?.tabs || []).forEach(tab => visit(tab.tabpanel, tab, ""));
        return entries;
    },

    // The texts of the buttons that belong to this row (not to a row nested in it).
    getSettingsSearchButtonText(row) {
        return [...(row?.querySelectorAll?.("button") || [])]
            .filter(button => button.closest?.(".dait-settings-row, .dait-settings-search-target") === row)
            .map(button => String(button.textContent || "").trim())
            .filter(Boolean)
            .join(" ");
    },

    // A Latin, Cyrillic or numeric term matches at the start of a word ("reset" is not found in "preset", "digo" is
    // not found in "código"); unaccented Latin also matches accented Spanish words ("rapido" -> "rápido"). Scripts
    // without space word boundaries (CJK) or with attached prefixes (Arabic "ال") match anywhere.
    matchesSettingsSearchTerm(haystack, term) {
        const stripArabicMarks = text => String(text || "").replace(/[\u0640\u064B-\u065F\u0670]/g, "");
        if (/[\u0600-\u06FF]/.test(term)) {
            return stripArabicMarks(haystack).includes(stripArabicMarks(term));
        }
        if (!/^[\p{Script=Latin}\p{Script=Cyrillic}\p{N}]/u.test(term)) {
            return haystack.includes(term);
        }
        const matchWordStart = (target, needle) => {
            for (let index = target.indexOf(needle); index >= 0; index = target.indexOf(needle, index + 1)) {
                if (index === 0 || !/[\p{L}\p{M}\p{N}]/u.test(target[index - 1])) return true;
            }
            return false;
        };
        if (matchWordStart(haystack, term)) return true;
        if (/^[\p{Script=Latin}\p{N}]+$/u.test(term) && !/[\u0300-\u036f]/.test(term.normalize("NFD"))) {
            const foldedHaystack = haystack.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (foldedHaystack !== haystack && matchWordStart(foldedHaystack, term)) return true;
        }
        return false;
    },

    runSettingsSearch(state, rawQuery) {
        if (!state) return [];
        const query = String(rawQuery || "").trim().toLocaleLowerCase();
        state.searchQuery = query;
        if (!query) {
            this.clearSettingsSearch(state, { focus: false, keepInput: true });
            return [];
        }
        const terms = query.split(/\s+/).filter(Boolean);
        const matchedEntries = this.getSettingsSearchEntries(state).filter(entry => terms.every(term => this.matchesSettingsSearchTerm(entry.haystack, term)));
        const entries = state.activeTab
            ? [
                ...matchedEntries.filter(entry => entry.tabId === state.activeTab),
                ...matchedEntries.filter(entry => entry.tabId !== state.activeTab)
            ]
            : matchedEntries;
        state.searchEntries = entries;
        // The results replace every tab page, so no tab is selected meanwhile; the current one stays reachable with Tab.
        state.tabs.forEach(tab => {
            if (tab.tabpanel) tab.tabpanel.hidden = true;
            tab.button?.setAttribute?.("aria-selected", "false");
        });
        if (state.results) state.results.hidden = false;
        if (state.resultsSummary) {
            state.resultsSummary.textContent = entries.length
                ? this.plugin.t("settingsSearchResults", { count: entries.length })
                : this.plugin.t("settingsSearchEmpty", { query: String(rawQuery || "").trim() });
        }
        if (state.resultsList) {
            state.resultsList.textContent = "";
            entries.forEach((entry, index) => {
                const item = document.createElement("li");
                item.className = "dait-settings-search-item";
                const button = document.createElement("button");
                button.type = "button";
                button.className = "dait-settings-search-result";
                const label = document.createElement("span");
                label.className = "dait-settings-search-result-label";
                label.textContent = entry.label;
                button.appendChild(label);
                const tab = document.createElement("span");
                tab.className = "dait-settings-search-result-tab";
                tab.textContent = entry.tabLabel;
                button.appendChild(tab);
                if (entry.description) {
                    const description = document.createElement("span");
                    description.className = "dait-settings-search-result-description";
                    description.textContent = entry.description;
                    button.appendChild(description);
                }
                button.addEventListener("click", () => this.openSettingsSearchResult(state, entry));
                button.addEventListener("keydown", event => this.handleSettingsSearchResultKeydown(state, event, index));
                entry.button = button;
                item.appendChild(button);
                state.resultsList.appendChild(item);
            });
        }
        if (state.content) state.content.scrollTop = 0;
        return entries;
    },

    clearSettingsSearch(state, options = {}) {
        if (!state) return;
        state.searchQuery = "";
        state.searchEntries = [];
        if (state.searchInput && !options.keepInput) state.searchInput.value = "";
        if (state.results) state.results.hidden = true;
        if (state.resultsList) state.resultsList.textContent = "";
        if (state.resultsSummary) state.resultsSummary.textContent = "";
        if (options.showTab !== false) {
            state.tabs.forEach(tab => {
                if (tab.tabpanel) tab.tabpanel.hidden = tab.id !== state.activeTab;
                tab.button?.setAttribute?.("aria-selected", tab.id === state.activeTab ? "true" : "false");
            });
        }
        if (options.focus) this.focusSettingsElement(state.searchInput);
    },

    handleSettingsSearchKeydown(state, event) {
        if (event?.isComposing || event?.keyCode === 229) return;
        const entries = state?.searchEntries || [];
        if (event?.key === "Enter") {
            event.preventDefault?.();
            if (entries.length) this.openSettingsSearchResult(state, entries[0]);
            return;
        }
        if (event?.key === "ArrowDown" && entries.length) {
            event.preventDefault?.();
            this.focusSettingsElement(entries[0].button);
            return;
        }
        if (event?.key === "Escape" && (state.searchQuery || state.searchInput?.value)) {
            event.preventDefault?.();
            event.stopPropagation?.();
            this.clearSettingsSearch(state, { focus: true });
        }
    },

    handleSettingsSearchResultKeydown(state, event, index) {
        if (event?.isComposing || event?.keyCode === 229) return;
        const entries = state?.searchEntries || [];
        if (event?.key === "ArrowDown" || event?.key === "ArrowUp") {
            event.preventDefault?.();
            const next = index + (event.key === "ArrowDown" ? 1 : -1);
            if (next < 0) this.focusSettingsElement(state.searchInput);
            else if (entries[next]) this.focusSettingsElement(entries[next].button);
            return;
        }
        if (event?.key === "Escape") {
            event.preventDefault?.();
            event.stopPropagation?.();
            this.clearSettingsSearch(state, { focus: true });
        }
    },

    // Esc with a query clears the search instead of closing the window. The quick-settings window listens on the
    // document in the capture phase, so this listener sits one step earlier, on window, while the panel is open.
    // Only a running plugin with the panel on the page binds it: a BetterDiscord settings panel left open across a
    // plugin reload would otherwise keep the listener (and the panel) alive with nothing left to remove them.
    bindSettingsSearchEscape(state) {
        if (!state || state.searchEscapeListener || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
        if (!this.plugin.isStarted || (state.panel && state.panel.isConnected === false)) return;
        state.searchEscapeListener = event => {
            // The panel left the page without its cleanup running: remove this listener (and the panel's others).
            if (state.panel && state.panel.isConnected === false) {
                this.cleanupSettingsPanelListeners(state.panel);
                return;
            }
            if (event?.isComposing || event?.keyCode === 229) return;
            if (event?.key !== "Escape" || !(state.searchQuery || state.searchInput?.value)) return;
            const active = typeof document !== "undefined" ? document.activeElement : null;
            if (!active || !(active === state.searchInput || state.results?.contains?.(active))) return;
            event.preventDefault?.();
            event.stopPropagation?.();
            event.stopImmediatePropagation?.();
            this.clearSettingsSearch(state, { focus: true });
        };
        window.addEventListener("keydown", state.searchEscapeListener, true);
    },

    openSettingsSearchResult(state, entry) {
        if (!state || !entry?.row) return false;
        this.clearSettingsSearch(state, { focus: false, showTab: false });
        this.showSettingsTab(state, entry.tabId, { clearSearch: false });
        // A row inside a collapsed <details> (more model parameters, optional API key) needs it open.
        for (let node = entry.row.parentElement; node && node !== entry.row.closest?.(".dait-settings-tabpanel"); node = node.parentElement) {
            if (String(node.tagName || "").toUpperCase() === "DETAILS") node.open = true;
        }
        entry.row.scrollIntoView?.({ block: "center", behavior: "auto" });
        entry.row.classList?.add?.("dait-settings-row-found");
        const timer = setTimeout(() => entry.row.classList?.remove?.("dait-settings-row-found"), 1600);
        this.plugin.unrefTimer(timer);
        const target = this.getSettingsRowControls(entry.row).find(control => !control.disabled && !control.hidden && control.getAttribute?.("tabindex") !== "-1")
            || this.getSettingsRowControls(entry.row).find(control => !control.disabled && !control.hidden);
        if (target) return this.focusSettingsElement(target);
        entry.row.setAttribute?.("tabindex", "-1");
        return this.focusSettingsElement(entry.row);
    }
};

module.exports = methods;
