"use strict";

const {
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    PROMPT_TEMPLATE_CATEGORY_PERSONA,
    POLISH_PROMPT_TEMPLATE_CATEGORIES,
    DIALECT_REGION_ORDER,
    PERSONA_GROUP_ORDER
} = require("../constants");
const { SETTINGS_TAB_COMPOSE } = require("../settings/settings-schema");

const methods = {
    getActivePolishPresetInfo() {
        const templates = this.plugin.getPromptTemplates("polish") || [];
        const task = this.plugin.settings?.polish || {};
        const activeId = String(task.activePromptTemplate || "");
        const activeTemplate = templates.find(item => item && item.id === activeId) || null;
        const normalize = value => String(value ?? "").replace(/\r\n?/g, "\n").trim();
        const matchesActive = Boolean(activeTemplate && normalize(activeTemplate.prompt) === normalize(task.prompt));
        const label = matchesActive
            ? this.plugin.getPromptTemplateLabel(activeTemplate)
            : this.plugin.t("quickPanelTemplateCustom");
        return { templates, activeTemplate, matchesActive, label };
    },

    getPolishButtonTitleAttr() {
        const info = this.getActivePolishPresetInfo();
        const shortcut = this.plugin.getHotkeyLabel();
        return info.label
            ? this.plugin.t("polishTitleAttrWithTone", { tone: info.label, shortcut })
            : this.plugin.t("polishTitleAttr", { shortcut });
    },

    getPolishPresetPickerTitleAttr() {
        const info = this.getActivePolishPresetInfo();
        return info.label
            ? this.plugin.t("polishPresetPickerTitle", { tone: info.label })
            : this.plugin.t("polishPresetPicker");
    },

    syncPolishPresetControls() {
        if (typeof document === "undefined") return;
        const polishTitle = this.getPolishButtonTitleAttr();
        const pickerTitle = this.getPolishPresetPickerTitleAttr();
        [...(document.querySelectorAll?.(".dait-polish-button") || [])].forEach(button => {
            button.title = polishTitle;
            button.setAttribute?.("aria-label", polishTitle);
        });
        [...(document.querySelectorAll?.(".dait-polish-preset-button") || [])].forEach(button => {
            button.title = pickerTitle;
            button.setAttribute?.("aria-label", pickerTitle);
        });
        if (this.plugin.polishPresetMenu?.isConnected) {
            if (this.plugin.settings.polish?.enabled === false || (this.plugin.polishPresetMenuAnchor && this.plugin.polishPresetMenuAnchor.isConnected === false)) {
                this.removePolishPresetMenu();
                return;
            }
            const active = typeof document !== "undefined" ? document.activeElement : null;
            const focusedInMenu = Boolean(active && this.plugin.polishPresetMenu.contains?.(active));
            const focusedTemplateId = focusedInMenu ? active?.dataset?.daitTemplateId || "" : "";
            const focusedCategory = focusedInMenu && active?.classList?.contains?.("dait-polish-preset-tab") ? active?.dataset?.daitCategory || "" : "";
            const focusedManage = Boolean(focusedInMenu && active?.classList?.contains?.("dait-polish-preset-manage"));
            this.renderPolishPresetMenuContent(this.plugin.polishPresetMenu, this.plugin.polishPresetMenuAnchor);
            this.positionPolishPresetMenu(this.plugin.polishPresetMenu, this.plugin.polishPresetMenuAnchor);
            if (focusedInMenu) {
                const nextFocus = focusedManage
                    ? this.plugin.polishPresetMenu.querySelector?.(".dait-polish-preset-manage")
                    : (focusedCategory
                        ? [...(this.plugin.polishPresetMenu.querySelectorAll?.(".dait-polish-preset-tab") || [])].find(tab => tab.dataset?.daitCategory === focusedCategory)
                        : null)
                        || (focusedTemplateId
                            ? [...(this.plugin.polishPresetMenu.querySelectorAll?.(".dait-polish-preset-item") || [])].find(item => item.dataset?.daitTemplateId === focusedTemplateId)
                            : null)
                        || this.plugin.polishPresetMenu.querySelector?.(".dait-polish-preset-item, .dait-polish-preset-tab, .dait-polish-preset-manage");
                nextFocus?.focus?.();
            }
        }
    },

    createPolishPresetButton(group, textbox = null, composerKey = "") {
        const button = document.createElement("button");
        button.className = "dait-polish-preset-button";
        button.type = "button";
        if (composerKey) button.dataset.daitComposerKey = composerKey;
        if (textbox) button.__daitTextbox = textbox;
        const title = this.getPolishPresetPickerTitleAttr();
        button.title = title;
        button.setAttribute("aria-label", title);
        button.setAttribute("aria-haspopup", "menu");
        button.setAttribute("aria-expanded", "false");
        const caret = document.createElement("span");
        caret.className = "dait-polish-preset-caret";
        caret.setAttribute("aria-hidden", "true");
        button.appendChild(caret);
        ["pointerdown", "mousedown"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
            });
        });
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            const live = this.resolveLiveComposerForButton(button, group?.__daitTextbox);
            this.togglePolishPresetMenu(button, { group, ...live });
        });
        return button;
    },

    togglePolishPresetMenu(anchor = null, options = {}) {
        if (this.plugin.polishPresetMenu?.isConnected && (!anchor || this.plugin.polishPresetMenuAnchor === anchor)) {
            this.removePolishPresetMenu();
            return null;
        }
        return this.openPolishPresetMenu(anchor, options);
    },

    renderPolishPresetMenuContent(menu, anchor = null, lifecycleToken = this.plugin.getLifecycleToken()) {
        if (!menu) return;
        menu.textContent = "";
        const info = this.getActivePolishPresetInfo();
        const activeCategory = POLISH_PROMPT_TEMPLATE_CATEGORIES.includes(this.plugin.polishPresetMenuCategory)
            ? this.plugin.polishPresetMenuCategory
            : this.plugin.getPolishTemplateCategory(info.activeTemplate);
        this.plugin.polishPresetMenuCategory = activeCategory;
        menu.dataset.daitCategory = activeCategory;

        const header = document.createElement("div");
        header.className = "dait-polish-preset-header";
        const headerTop = document.createElement("div");
        headerTop.className = "dait-polish-preset-header-top";
        const title = document.createElement("div");
        title.className = "dait-polish-preset-title";
        title.textContent = this.plugin.t("polishPresetMenuTitle");
        headerTop.appendChild(title);

        const tabs = document.createElement("div");
        tabs.className = "dait-polish-preset-tabs";
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", this.plugin.t("polishPresetMenuTabsLabel"));
        POLISH_PROMPT_TEMPLATE_CATEGORIES.forEach(category => {
            const tab = document.createElement("button");
            tab.className = "dait-polish-preset-tab";
            tab.type = "button";
            tab.dataset.daitCategory = category;
            tab.textContent = this.plugin.getPolishTemplateCategoryLabel(category);
            tab.setAttribute("role", "tab");
            tab.setAttribute("aria-selected", category === activeCategory ? "true" : "false");
            tab.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || this.plugin.polishPresetMenu !== menu || menu.isConnected === false) return;
                if (this.plugin.polishPresetMenuCategory === category) return;
                const hadFocusInMenu = Boolean(typeof document !== "undefined" && document.activeElement && menu.contains?.(document.activeElement));
                this.plugin.polishPresetMenuCategory = category;
                const nextSelected = this.renderPolishPresetMenuContent(menu, anchor, lifecycleToken);
                this.positionPolishPresetMenu(menu, anchor);
                if (hadFocusInMenu) {
                    const nextTab = [...(menu.querySelectorAll?.(".dait-polish-preset-tab") || [])].find(node => node.dataset?.daitCategory === category);
                    nextTab?.focus?.();
                }
                try { nextSelected?.scrollIntoView?.({ block: "nearest" }); }
                catch {}
            });
            tabs.appendChild(tab);
        });
        headerTop.appendChild(tabs);
        header.appendChild(headerTop);

        if (!info.matchesActive) {
            const customNote = document.createElement("div");
            customNote.className = "dait-polish-preset-custom-note";
            customNote.textContent = this.plugin.t("polishPresetMenuCustomNote");
            header.appendChild(customNote);
        }
        menu.appendChild(header);

        const list = document.createElement("div");
        list.className = "dait-polish-preset-list";
        list.setAttribute("role", "none");
        let selectedItem = null;
        const categoryTemplates = info.templates.filter(template => template?.id && this.plugin.getPolishTemplateCategory(template) === activeCategory);
        const appendTemplateItem = template => {
            const isSelected = Boolean(info.matchesActive && info.activeTemplate?.id === template.id);
            const displayName = this.plugin.getPromptTemplateDisplayName(template);
            const fullLabel = this.plugin.getPromptTemplateLabel(template);
            const item = document.createElement("button");
            item.className = "dait-polish-preset-item";
            item.type = "button";
            item.dataset.daitTemplateId = template.id;
            item.dataset.daitCategory = activeCategory;
            item.title = fullLabel;
            item.setAttribute("role", "menuitemradio");
            item.setAttribute("aria-checked", isSelected ? "true" : "false");
            item.setAttribute("aria-label", fullLabel);

            const code = document.createElement("span");
            code.className = "dait-polish-preset-code";
            code.textContent = String(template.serial || "000");

            const name = document.createElement("span");
            name.className = "dait-polish-preset-name";
            name.textContent = displayName;

            const check = document.createElement("span");
            check.className = "dait-polish-preset-check";
            check.setAttribute("aria-hidden", "true");

            item.appendChild(code);
            item.appendChild(name);
            item.appendChild(check);
            item.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || this.plugin.polishPresetMenu !== menu || menu.isConnected === false) return;
                if (this.plugin.settings.polish?.enabled === false) {
                    this.removePolishPresetMenu();
                    return;
                }
                this.removePolishPresetMenu();
                this.plugin.applyPromptTemplate("polish", template.id);
            });
            list.appendChild(item);
            if (isSelected) selectedItem = item;
        };

        if (categoryTemplates.length) {
            const appendSubgroup = (labelText, items) => {
                if (!items.length) return;
                const groupLabel = document.createElement("div");
                groupLabel.className = "dait-polish-preset-group-label";
                groupLabel.setAttribute("role", "presentation");
                groupLabel.textContent = labelText;
                list.appendChild(groupLabel);
                items.forEach(appendTemplateItem);
            };
            if (activeCategory === PROMPT_TEMPLATE_CATEGORY_DIALECT) {
                const customDialects = categoryTemplates.filter(template => !DIALECT_REGION_ORDER.includes(String(template.region || "")));
                appendSubgroup(this.plugin.t("promptTemplateRegionCustom"), customDialects);
                DIALECT_REGION_ORDER.forEach(region => {
                    const regionItems = categoryTemplates.filter(template => template.region === region);
                    appendSubgroup(this.plugin.getDialectRegionLabel(region), regionItems);
                });
            }
            else if (activeCategory === PROMPT_TEMPLATE_CATEGORY_PERSONA) {
                const customPersonas = categoryTemplates.filter(template => !PERSONA_GROUP_ORDER.includes(String(template.personaGroup || "")));
                appendSubgroup(this.plugin.t("promptTemplatePersonaGroupCustom"), customPersonas);
                PERSONA_GROUP_ORDER.forEach(group => {
                    const groupItems = categoryTemplates.filter(template => template.personaGroup === group);
                    appendSubgroup(this.plugin.getPersonaGroupLabel(group), groupItems);
                });
            }
            else {
                categoryTemplates.forEach(appendTemplateItem);
            }
        }
        else {
            const empty = document.createElement("p");
            empty.className = "dait-polish-preset-empty";
            empty.textContent = activeCategory === PROMPT_TEMPLATE_CATEGORY_PERSONA
                ? this.plugin.t("polishPresetMenuEmptyPersona")
                : this.plugin.t("polishPresetMenuEmpty");
            list.appendChild(empty);
        }
        menu.appendChild(list);

        const footer = document.createElement("div");
        footer.className = "dait-polish-preset-footer";
        const manage = document.createElement("button");
        manage.className = "dait-polish-preset-manage";
        manage.type = "button";
        manage.textContent = this.plugin.t("polishPresetMenuManage");
        manage.setAttribute("role", "menuitem");
        manage.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken) || this.plugin.polishPresetMenu !== menu || menu.isConnected === false) return;
            this.removePolishPresetMenu();
            if (this.plugin.settings?.ui) {
                this.plugin.settings.ui.settingsActiveTab = SETTINGS_TAB_COMPOSE;
                this.plugin.saveSettings?.({ debounce: true });
            }
            const modal = this.plugin.openQuickSettingsPanel("polish-preset-menu", anchor);
            const panel = modal?.querySelector?.(".dait-settings") || null;
            if (panel) this.plugin.setSettingsActiveTab?.(SETTINGS_TAB_COMPOSE, panel);
        });
        footer.appendChild(manage);
        menu.appendChild(footer);
        return selectedItem;
    },

    openPolishPresetMenu(anchor = null, options = {}) {
        if (typeof document === "undefined" || !document.body) return null;
        if (this.plugin.settings.polish?.enabled === false) return null;
        this.removeInputActionMenu();
        this.removePolishPresetMenu();
        const lifecycleToken = this.plugin.getLifecycleToken();
        const anchorNode = anchor || options.group?.querySelector?.(".dait-polish-preset-button") || options.group?.querySelector?.(".dait-polish-button") || options.group || null;
        const menu = document.createElement("div");
        menu.className = "dait-polish-preset-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", this.plugin.t("polishPresetMenuTitle"));
        this.plugin.applyPanelTheme(menu);

        const selectedItem = this.renderPolishPresetMenuContent(menu, anchorNode, lifecycleToken);
        ["pointerdown", "mousedown"].forEach(type => {
            menu.addEventListener(type, event => {
                // Preserve composer focus when clicking menu buttons without blocking native scrollbar dragging.
                if (event?.target?.closest?.("button")) event.preventDefault();
                event.stopPropagation();
            });
        });
        menu.addEventListener("click", event => event.stopPropagation());
        menu.addEventListener("keydown", event => {
            if (event.key !== "Escape") event.stopPropagation();
        });
        document.body.appendChild(menu);
        this.plugin.polishPresetMenu = menu;
        this.plugin.polishPresetMenuAnchor = anchorNode;
        anchorNode?.setAttribute?.("aria-expanded", "true");
        const companionPolishButton = options.group?.querySelector?.(".dait-polish-button")
            || anchorNode?.closest?.(".dait-input-action-group")?.querySelector?.(".dait-polish-button")
            || null;

        const isAnchorHidden = () => {
            if (!anchorNode) return false;
            if (anchorNode.isConnected === false) return true;
            const rect = anchorNode.getBoundingClientRect?.();
            return Boolean(rect && Number(rect.width || 0) <= 0 && Number(rect.height || 0) <= 0);
        };
        let repositionRaf = null;
        const reposition = () => {
            repositionRaf = null;
            if (!menu.isConnected) return;
            if (isAnchorHidden()) {
                this.removePolishPresetMenu();
                return;
            }
            this.positionPolishPresetMenu(menu, anchorNode);
        };
        const onResize = () => {
            if (repositionRaf !== null) {
                try { window.cancelAnimationFrame?.(repositionRaf); }
                catch {}
                repositionRaf = null;
            }
            if (!menu.isConnected) return;
            this.plugin.applyPanelTheme(menu);
            reposition();
        };
        const onScroll = event => {
            if (event?.target && menu.contains?.(event.target)) return;
            if (event?.target && event.target !== window && event.target !== document && anchorNode && !event.target.contains?.(anchorNode)) {
                return;
            }
            if (repositionRaf !== null) return;
            if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
                repositionRaf = window.requestAnimationFrame(reposition);
            }
            else {
                reposition();
            }
        };
        const outsidePointerDown = event => {
            if (menu.contains?.(event.target) || anchorNode?.contains?.(event.target)) return;
            // Right-clicking the paired Polish button toggles via contextmenu; do not close early on pointerdown.
            if (event?.button === 2 && companionPolishButton?.contains?.(event.target)) return;
            this.removePolishPresetMenu();
        };
        const onKeydown = event => {
            if (event.isComposing || event.keyCode === 229) return;
            if (event.key === "Escape") {
                event.preventDefault?.();
                event.stopPropagation?.();
                const shouldRestoreFocus = Boolean(document.activeElement && menu.contains?.(document.activeElement));
                this.removePolishPresetMenu();
                if (shouldRestoreFocus && anchorNode?.isConnected !== false) anchorNode?.focus?.();
                return;
            }
            if (["ArrowLeft", "ArrowRight"].includes(event.key)) {
                const active = document.activeElement;
                const allowTabNavigation = !active
                    || active === document.body
                    || active === document.documentElement
                    || menu.contains?.(active)
                    || active === anchorNode;
                if (!allowTabNavigation) return;
                const currentIdx = Math.max(0, POLISH_PROMPT_TEMPLATE_CATEGORIES.indexOf(this.plugin.polishPresetMenuCategory));
                const delta = event.key === "ArrowRight" ? 1 : -1;
                const nextCategory = POLISH_PROMPT_TEMPLATE_CATEGORIES[(currentIdx + delta + POLISH_PROMPT_TEMPLATE_CATEGORIES.length) % POLISH_PROMPT_TEMPLATE_CATEGORIES.length];
                event.preventDefault();
                event.stopPropagation();
                const hadFocusInMenu = Boolean(active && menu.contains?.(active));
                const wasFocusedOnTab = Boolean(active?.classList?.contains?.("dait-polish-preset-tab"));
                this.plugin.polishPresetMenuCategory = nextCategory;
                const nextSelected = this.renderPolishPresetMenuContent(menu, anchorNode, lifecycleToken);
                this.positionPolishPresetMenu(menu, anchorNode);
                if (wasFocusedOnTab) {
                    const nextTab = [...(menu.querySelectorAll?.(".dait-polish-preset-tab") || [])].find(tab => tab.dataset?.daitCategory === nextCategory);
                    nextTab?.focus?.();
                }
                else if (hadFocusInMenu) {
                    const fallbackFocus = nextSelected
                        || menu.querySelector?.(".dait-polish-preset-item, .dait-polish-preset-manage, .dait-polish-preset-tab");
                    fallbackFocus?.focus?.();
                }
                else {
                    try { nextSelected?.scrollIntoView?.({ block: "nearest" }); }
                    catch {}
                }
                return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const active = document.activeElement;
            const allowNavigation = !active
                || active === document.body
                || active === document.documentElement
                || menu.contains?.(active)
                || active === anchorNode;
            if (!allowNavigation) return;
            const focusables = [...(menu.querySelectorAll?.(".dait-polish-preset-item, .dait-polish-preset-manage") || [])];
            if (!focusables.length) return;
            event.preventDefault();
            event.stopPropagation();
            const currentIndex = focusables.indexOf(active);
            let nextIndex = 0;
            if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = focusables.length - 1;
            else if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % focusables.length;
            else nextIndex = currentIndex < 0 ? focusables.length - 1 : (currentIndex - 1 + focusables.length) % focusables.length;
            focusables[nextIndex]?.focus?.();
        };

        this.plugin.polishPresetMenuCleanup = () => {
            anchorNode?.setAttribute?.("aria-expanded", "false");
            if (repositionRaf !== null && typeof window !== "undefined") {
                window.cancelAnimationFrame?.(repositionRaf);
                repositionRaf = null;
            }
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", onResize, { capture: true });
                window.removeEventListener?.("scroll", onScroll, { capture: true });
            }
            document.removeEventListener?.("pointerdown", outsidePointerDown, true);
            document.removeEventListener?.("keydown", onKeydown, true);
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", onResize, { capture: true, passive: true });
            window.addEventListener?.("scroll", onScroll, { capture: true, passive: true });
        }
        document.addEventListener?.("pointerdown", outsidePointerDown, true);
        document.addEventListener?.("keydown", onKeydown, true);
        onResize();
        try { selectedItem?.scrollIntoView?.({ block: "nearest" }); }
        catch {}
        return menu;
    },

    positionPolishPresetMenu(menu, anchor = null) {
        if (!menu?.style || typeof window === "undefined") return;
        const rect = anchor?.getBoundingClientRect?.() || null;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 900;
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 700;
        const width = Math.min(324, Math.max(260, viewportWidth - 24));
        const left = rect ? Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12)) : viewportWidth - width - 16;
        menu.style.maxHeight = "";
        const menuHeight = Number(menu.getBoundingClientRect?.()?.height || 0);
        const spaceAbove = rect ? Math.max(0, rect.top - 12) : Math.max(0, viewportHeight - 24);
        const spaceBelow = rect ? Math.max(0, viewportHeight - rect.bottom - 12) : 0;
        const placeBelow = Boolean(rect && menuHeight > 0 && spaceAbove < menuHeight + 8 && spaceBelow > spaceAbove);
        const availableSpace = placeBelow ? spaceBelow : spaceAbove;
        menu.style.left = `${left}px`;
        menu.style.right = "auto";
        menu.style.width = `${width}px`;
        menu.style.maxHeight = `${Math.max(140, Math.min(viewportHeight - 24, Math.floor(availableSpace - 8)))}px`;
        if (placeBelow) {
            const top = Math.min(Math.max(rect.bottom + 8, 12), Math.max(12, viewportHeight - 152));
            menu.style.top = `${top}px`;
            menu.style.bottom = "auto";
        }
        else {
            const bottom = rect ? Math.max(12, viewportHeight - rect.top + 8) : 76;
            menu.style.top = "auto";
            menu.style.bottom = `${Math.min(Math.max(bottom, 12), Math.max(12, viewportHeight - 152))}px`;
        }
    },

    removePolishPresetMenu() {
        this.plugin.polishPresetMenuCleanup?.();
        this.plugin.polishPresetMenuCleanup = null;
        this.plugin.polishPresetMenu?.remove?.();
        this.plugin.polishPresetMenu = null;
        this.plugin.polishPresetMenuAnchor = null;
        this.plugin.polishPresetMenuCategory = "";
    }
};

module.exports = methods;
