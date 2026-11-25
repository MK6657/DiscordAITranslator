"use strict";

const { PLUGIN_NAME } = require("../constants");

const methods = {
    getComposerTextboxes() {
        const textboxes = [];
        const add = node => {
            if (!node || node.isConnected === false || textboxes.includes(node)) return;
            if (this.plugin.isOwnPluginElement(node)) return;
            textboxes.push(node);
        };
        add(this.plugin.getActiveTextbox());
        try { add(this.plugin.getTextbox()); }
        catch {}
        if (typeof document !== "undefined" && document.querySelectorAll) {
            try {
                document.querySelectorAll("[role='textbox'][data-slate-editor='true'], [role='textbox'][contenteditable='true']").forEach(add);
            }
            catch {}
        }
        return textboxes;
    },

    bindInputActionButtonTarget(button, textbox = null, composerKey = "") {
        if (!button) return;
        if (textbox) button.__daitTextbox = textbox;
        if (composerKey && button.dataset) button.dataset.daitComposerKey = composerKey;
    },

    resolveLiveComposerForButton(button = null, fallbackTextbox = null) {
        const root = button?.closest?.("form, [class*='channelTextArea']") || null;
        let textbox = null;
        if (root?.querySelector) {
            try {
                const candidate = root.querySelector("[role='textbox'][data-slate-editor='true'], [role='textbox'][contenteditable='true']");
                if (candidate && candidate.isConnected !== false && !this.plugin.isOwnPluginElement(candidate)) textbox = candidate;
            }
            catch {}
        }
        if (!textbox) {
            for (const candidate of [button?.__daitTextbox, fallbackTextbox]) {
                if (candidate && candidate.isConnected !== false) {
                    textbox = candidate;
                    break;
                }
            }
        }
        if (!textbox) {
            const active = this.plugin.getActiveTextbox();
            if (active && active.isConnected !== false) textbox = active;
            else {
                const fallback = this.plugin.getTextbox();
                if (fallback && fallback.isConnected !== false) textbox = fallback;
            }
        }
        const composerKey = textbox ? this.getTextboxComposerKey(textbox) : "";
        this.bindInputActionButtonTarget(button, textbox, composerKey);
        return { textbox, composerKey };
    },

    injectInputButtons(options = {}) {
        const textboxes = this.getComposerTextboxes();
        if (!textboxes.length) return;
        const visitedContainers = new Set();
        textboxes.forEach(textbox => {
            const container = this.plugin.getPolishButtonContainer(textbox);
            if (!container || visitedContainers.has(container)) return;
            visitedContainers.add(container);
            this.injectInputButtonsForComposer(textbox, container, options);
        });
    },

    injectInputButtonsForComposer(textbox, container, options = {}) {
        const composerKey = this.getTextboxComposerKey(textbox);
        const group = this.getInputActionGroup(container);
        if (!group) return;
        group.__daitTextbox = textbox;
        this.removeDisabledInputActionButtons(group);

        if (this.isPolishInputButtonEnabled(options)) {
            let polishButton = group.querySelector(".dait-polish-button");
            if (!polishButton) {
                polishButton = this.createInputActionButton(
                    "dait-polish-button",
                    this.plugin.t("polishButton"),
                    this.getPolishButtonTitleAttr(),
                    () => {
                        const live = this.resolveLiveComposerForButton(polishButton, group.__daitTextbox);
                        this.plugin.polishCurrentDraft(polishButton, live);
                    },
                    { shortText: this.plugin.t("polishButtonShort"), textbox, composerKey }
                );
                polishButton.setAttribute?.("data-dait-split", "true");
                polishButton.addEventListener("contextmenu", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    const anchor = group.querySelector?.(".dait-polish-preset-button") || polishButton;
                    const live = this.resolveLiveComposerForButton(anchor, group.__daitTextbox);
                    this.togglePolishPresetMenu(anchor, { group, ...live });
                });
                const beforeNode = group.querySelector?.(".dait-public-bilingual-button")
                    || group.querySelector?.(".dait-input-action-menu-button")
                    || null;
                if (typeof group.insertBefore === "function" && beforeNode) group.insertBefore(polishButton, beforeNode);
                else group.appendChild(polishButton);
            }
            else {
                polishButton.setAttribute?.("data-dait-split", "true");
                this.bindInputActionButtonTarget(polishButton, textbox, composerKey);
            }
            let presetButton = group.querySelector(".dait-polish-preset-button");
            if (!presetButton) {
                presetButton = this.createPolishPresetButton(group, textbox, composerKey);
                const nextNode = polishButton.nextSibling
                    || (Array.isArray(group.children) ? group.children[group.children.indexOf(polishButton) + 1] || null : null);
                if (typeof group.insertBefore === "function" && nextNode) {
                    group.insertBefore(presetButton, nextNode);
                }
                else {
                    group.appendChild(presetButton);
                }
            }
            else {
                this.bindInputActionButtonTarget(presetButton, textbox, composerKey);
            }
        }

        if (!options.forcePolish && this.isPublicBilingualInputButtonEnabled()) {
            let bilingualButton = group.querySelector(".dait-public-bilingual-button");
            if (!bilingualButton) {
                bilingualButton = this.createInputActionButton(
                    "dait-public-bilingual-button",
                    this.plugin.t("publicBilingualButton"),
                    this.plugin.t("publicBilingualTitleAttr", { targetLanguage: this.plugin.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) }),
                    () => {
                        const live = this.resolveLiveComposerForButton(bilingualButton, group.__daitTextbox);
                        this.plugin.publicBilingualCurrentDraft(bilingualButton, live);
                    },
                    { shortText: this.plugin.t("publicBilingualButtonShort"), textbox, composerKey }
                );
                const menuButton = group.querySelector?.(".dait-input-action-menu-button") || null;
                if (typeof group.insertBefore === "function" && menuButton) group.insertBefore(bilingualButton, menuButton);
                else group.appendChild(bilingualButton);
            }
            else {
                this.bindInputActionButtonTarget(bilingualButton, textbox, composerKey);
                const bilingualTitle = this.plugin.t("publicBilingualTitleAttr", { targetLanguage: this.plugin.getDisplayLanguage(this.getPublicBilingualTargetLanguage()) });
                bilingualButton.title = bilingualTitle;
                bilingualButton.setAttribute("aria-label", bilingualTitle);
            }
        }
        this.syncInputRestoreButtonState(group, textbox, options);
        this.plugin.syncInputActionButtonThemes(group, textbox || container);
        this.syncInputActionGroupState(group, textbox, container);
    },

    // Polish needs polish.enabled and public bilingual needs translation.enabled; a feature that is
    // switched off loses its composer button (it comes back on the next scan once re-enabled).
    removeDisabledInputActionButtons(group) {
        if (!group?.querySelectorAll) return false;
        const polishOff = this.plugin.settings.polish?.enabled === false;
        const bilingualOff = !this.isPublicBilingualFeatureEnabled();
        const session = this.plugin.polishSession;
        const hasPolishedRestore = Boolean(session?.lastResultRawText || session?.lastResult);
        const hasBilingualRestore = Boolean(session?.lastBilingualRawText || session?.lastBilingualText);
        const dropRestore = (polishOff && bilingualOff)
            || (polishOff && !hasBilingualRestore)
            || (bilingualOff && !hasPolishedRestore && Boolean(session));
        const selectors = [];
        if (polishOff) selectors.push(".dait-polish-button", ".dait-polish-preset-button");
        if (bilingualOff) selectors.push(".dait-public-bilingual-button");
        if (dropRestore) selectors.push(".dait-polish-restore-button");
        let removed = false;
        selectors.forEach(selector => {
            [...(group.querySelectorAll(selector) || [])].forEach(button => {
                button.remove?.();
                removed = true;
            });
        });
        if (polishOff) this.removePolishPresetMenu();
        if (dropRestore) this.removePolishRestoreControl();
        return removed;
    },

    syncInputActionButtonsForSettings() {
        this.removeInputActionMenu();
        this.removePolishPresetMenu();
        if (this.plugin.settings.polish?.enabled === false && !this.isPublicBilingualFeatureEnabled()) {
            this.removePolishRestoreControl();
        }
        if (typeof document === "undefined") return;
        [...(document.querySelectorAll?.(".dait-input-action-group") || [])].forEach(group => {
            if (this.removeDisabledInputActionButtons(group)) this.syncInputActionGroupState(group);
        });
        // Re-enabling shows the buttons right away unless Discord's settings cover the composer; the
        // next input-button scan adds them then.
        const hasSurface = typeof this.plugin.hasActiveInputButtonSurface === "function"
            ? this.plugin.hasActiveInputButtonSurface()
            : Boolean(this.plugin.settings.ui?.injectInputButton || this.plugin.settings.ui?.publicBilingualInputButton);
        if (!this.plugin.isStarted || !hasSurface) return;
        if (this.plugin.isDiscordSettingsSurfaceOpen()) this.plugin.queueInputButtonScan({ delayMs: 120, trailing: true });
        else this.plugin.injectInputButtons();
    },

    createInputActionButton(className, text, title, action, options = {}) {
        const button = document.createElement("button");
        button.className = className;
        button.type = "button";
        button.textContent = text;
        button.dataset.daitFullLabel = text;
        button.dataset.daitShortLabel = options.shortText || text;
        if (options.composerKey) button.dataset.daitComposerKey = options.composerKey;
        if (options.textbox) button.__daitTextbox = options.textbox;
        button.title = title;
        button.setAttribute("aria-label", title || text);
        ["pointerdown", "mousedown"].forEach(type => {
            button.addEventListener(type, event => {
                event.preventDefault();
                event.stopPropagation();
            });
        });
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            action?.();
        });
        return button;
    },

    resolveInputActionTextbox(button = null, options = {}) {
        const expectedComposerKey = options.composerKey || button?.dataset?.daitComposerKey || "";
        const candidates = [
            options.textbox,
            button?.__daitTextbox
        ].filter(Boolean);
        for (const textbox of candidates) {
            if (!textbox || textbox.isConnected === false) continue;
            if (!expectedComposerKey || this.getTextboxComposerKey(textbox) === expectedComposerKey) return textbox;
        }
        if (!expectedComposerKey) {
            const activeTextbox = this.plugin.getActiveTextbox();
            if (activeTextbox?.isConnected !== false) return activeTextbox;
            const textbox = this.plugin.getTextbox();
            if (textbox?.isConnected !== false) return textbox;
        }
        return null;
    },

    isInputActionTextboxCurrent(textbox, expectedComposerKey = "") {
        if (!textbox || textbox.isConnected === false) return false;
        return !expectedComposerKey || this.getTextboxComposerKey(textbox) === expectedComposerKey;
    },

    syncInputActionButtonThemes(group, anchor = null) {
        if (!group?.querySelectorAll) return;
        group.querySelectorAll(".dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-polish-restore-button, .dait-input-action-menu-button").forEach(button => {
            this.plugin.syncDiscordThemeClasses(button, anchor);
        });
    },

    getInputActionGroup(container) {
        if (!container?.appendChild || typeof document === "undefined") return null;
        container.classList?.add?.("dait-input-actions-host");
        let group = container.querySelector?.(".dait-input-action-group");
        if (!group) {
            group = document.createElement("span");
            group.className = "dait-input-action-group";
            group.setAttribute?.("aria-label", `${PLUGIN_NAME} input actions`);
            if (typeof container.insertBefore === "function" && container.children?.length) container.insertBefore(group, container.children[0]);
            else container.appendChild(group);
        }
        return group;
    },

    syncInputActionGroupState(group, textbox = null, container = null) {
        if (!group?.classList) return;
        const actionSelector = ".dait-polish-restore-button, .dait-polish-button, .dait-public-bilingual-button";
        const queried = group.querySelectorAll?.(actionSelector) || [];
        const fallback = [...(group.children || [])].filter(child => this.isInputActionDirectButton(child));
        const count = Math.max(queried.length || 0, fallback.length);
        group.classList.toggle("dait-input-action-group-dual", count > 1);
        if (!group.querySelector?.(".dait-polish-button")) {
            [...(group.querySelectorAll?.(".dait-polish-preset-button") || [])].forEach(node => node.remove?.());
        }
        if (!count) {
            this.removeInputActionMenu();
            this.removePolishPresetMenu();
            group.remove?.();
            return;
        }
        this.ensureInputActionMenuButton(group, textbox, container);
        this.updateInputActionGroupDensity(group, textbox, container);
    },

    isInputActionDirectButton(node) {
        return this.plugin.elementHasClassName(node, "dait-polish-restore-button")
            || this.plugin.elementHasClassName(node, "dait-polish-button")
            || this.plugin.elementHasClassName(node, "dait-public-bilingual-button");
    },

    syncInputRestoreButtonState(group, textbox, options = {}) {
        if (!group) return;
        const existing = group.querySelector?.(".dait-polish-restore-button");
        if (!options.restoreSession && this.plugin.polishSession && textbox && textbox.isConnected !== false) {
            if (!this.plugin.composerWriter?.hasActiveWrite?.(textbox)
                && this.plugin.polishSession.composerKey === this.getTextboxComposerKey(textbox)
                && !this.plugin.normalizeExtractedText(this.plugin.getTextboxDraftText(textbox))) {
                this.plugin.polishSession = null;
            }
        }
        const session = options.restoreSession || this.plugin.polishSession;
        const canRestore = Boolean(session && this.canRestorePolishOriginal(textbox, session));
        if (!canRestore) {
            existing?.remove?.();
            return;
        }
        if (existing) {
            if (existing.__daitRestoreSession === session && existing.dataset?.daitComposerKey === session.composerKey) {
                this.bindInputActionButtonTarget(existing, textbox, session.composerKey);
                return;
            }
            existing.remove?.();
        }
        const button = this.createInputActionButton(
            "dait-polish-restore-button",
            this.plugin.t("restoreOriginal"),
            this.plugin.t("restoreOriginal"),
            () => {
                const live = this.resolveLiveComposerForButton(button, group.__daitTextbox);
                this.restorePolishOriginal(live.textbox || textbox, session, button);
            },
            { shortText: this.plugin.t("restoreOriginalShort"), textbox, composerKey: session.composerKey }
        );
        button.__daitRestoreSession = session;
        if (typeof group.insertBefore === "function" && group.children?.length) group.insertBefore(button, group.children[0]);
        else group.appendChild(button);
    },

    ensureInputActionMenuButton(group, textbox = null, container = null) {
        if (!group?.appendChild || typeof document === "undefined") return null;
        if (textbox) group.__daitTextbox = textbox;
        if (container) group.__daitContainer = container;
        let button = group.querySelector?.(".dait-input-action-menu-button");
        if (!button) {
            button = document.createElement("button");
            button.className = "dait-input-action-menu-button";
            button.type = "button";
            button.textContent = "AI";
            button.title = this.plugin.t("inputActionMenu");
            button.setAttribute("aria-label", this.plugin.t("inputActionMenu"));
            button.setAttribute("aria-haspopup", "menu");
            button.setAttribute("aria-expanded", "false");
            ["pointerdown", "mousedown"].forEach(type => {
                button.addEventListener(type, event => {
                    event.preventDefault();
                    event.stopPropagation();
                });
            });
            button.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                const live = this.resolveLiveComposerForButton(button, group.__daitTextbox);
                this.toggleInputActionMenu(group, live.textbox, group.__daitContainer || container, button);
            });
            group.appendChild(button);
        }
        if (textbox) this.bindInputActionButtonTarget(button, textbox, this.getTextboxComposerKey(textbox));
        return button;
    },

    updateInputActionGroupDensity(group, textbox = null, container = null) {
        if (!group?.dataset) return;
        const width = this.getInputActionAvailableWidth(group, textbox, container);
        const actionCount = this.getInputActionDirectButtonCount(group);
        let density = "roomy";
        if (width > 0) {
            if (width < (actionCount >= 3 ? 620 : 520)) density = "minimal";
            else if (width < (actionCount >= 3 ? 760 : 660)) density = "compact";
        }
        group.dataset.daitDensity = density;
        group.classList?.toggle?.("dait-input-action-group-compact", density === "compact");
        group.classList?.toggle?.("dait-input-action-group-minimal", density === "minimal");
        group.classList?.toggle?.("dait-input-action-group-roomy", density === "roomy");
        this.syncInputActionButtonLabels(group, density);
    },

    getInputActionAvailableWidth(group, textbox = null, container = null) {
        const roots = [
            textbox?.closest?.("form, [class*='channelTextArea']"),
            container?.closest?.("form, [class*='channelTextArea']"),
            group?.closest?.("form, [class*='channelTextArea']"),
            container?.parentElement,
            container,
            group?.parentElement
        ].filter(Boolean);
        for (const root of roots) {
            const rect = root.getBoundingClientRect?.();
            const width = Number(rect?.width || 0);
            if (width > 0) return width;
        }
        const viewport = Number((typeof window !== "undefined" ? window.innerWidth : 0) || (typeof document !== "undefined" ? document.documentElement?.clientWidth : 0) || 0);
        return Number.isFinite(viewport) ? viewport : 0;
    },

    getInputActionDirectButtonCount(group) {
        return [...(group?.children || [])].filter(child => this.isInputActionDirectButton(child)).length;
    },

    syncInputActionButtonLabels(group, density = "roomy") {
        if (!group?.querySelectorAll) return;
        group.querySelectorAll(".dait-polish-restore-button, .dait-polish-button, .dait-public-bilingual-button").forEach(button => {
            this.renderInputActionButtonLabel(button, density);
        });
    },

    // The one place that writes a composer button's label, so busy/idle changes keep the group's density.
    renderInputActionButtonLabel(button, density = null) {
        if (!button) return;
        const groupDensity = density || button.parentElement?.dataset?.daitDensity || button.closest?.(".dait-input-action-group")?.dataset?.daitDensity || "roomy";
        const full = button.dataset?.daitFullLabel || button.textContent || "";
        const short = button.dataset?.daitShortLabel || full;
        const next = groupDensity !== "roomy" ? short : full;
        if (button.textContent !== next) button.textContent = next;
    },

    toggleInputActionMenu(group, textbox = null, container = null, button = null) {
        const anchorNode = button || group;
        if (this.plugin.inputActionMenu?.isConnected) {
            const sameAnchor = !anchorNode || this.plugin.inputActionMenuAnchor === anchorNode;
            this.removeInputActionMenu();
            if (sameAnchor) return;
        }
        this.openInputActionMenu(group, textbox, container, button);
    },

    openInputActionMenu(group, textbox = null, container = null, button = null) {
        if (typeof document === "undefined" || !document.body) return null;
        this.removePolishPresetMenu();
        this.removeInputActionMenu();
        const menu = document.createElement("div");
        menu.className = "dait-input-action-menu";
        menu.setAttribute("role", "menu");
        menu.setAttribute("aria-label", this.plugin.t("inputActionMenu"));
        this.plugin.applyPanelTheme(menu);

        for (const { label, title, action } of this.plugin.discordHost.contextMenu.getComposerMenuItems(menu, group, textbox, button)) {
            const item = document.createElement("button");
            item.className = "dait-input-action-menu-item";
            item.type = "button";
            item.textContent = label;
            item.title = title || label;
            item.setAttribute("role", "menuitem");
            item.setAttribute("aria-label", title || label);
            item.addEventListener("click", event => {
                event.preventDefault();
                event.stopPropagation();
                action();
            });
            menu.appendChild(item);
        }

        ["pointerdown", "mousedown"].forEach(type => {
            menu.addEventListener(type, event => {
                if (event?.target?.closest?.("button")) event.preventDefault?.();
                event.stopPropagation?.();
            });
        });
        menu.addEventListener("click", event => event.stopPropagation?.());
        menu.addEventListener("keydown", event => {
            if (event?.key !== "Escape") event.stopPropagation?.();
        });
        document.body.appendChild(menu);
        this.plugin.inputActionMenu = menu;
        button?.setAttribute?.("aria-expanded", "true");
        const anchorNode = button || group;
        this.plugin.inputActionMenuAnchor = anchorNode;
        let repositionRaf = null;
        const isAnchorHidden = () => {
            if (!anchorNode) return false;
            if (anchorNode.isConnected === false) return true;
            const rect = anchorNode.getBoundingClientRect?.();
            return Boolean(rect && Number(rect.width || 0) <= 0 && Number(rect.height || 0) <= 0);
        };
        const reposition = () => {
            repositionRaf = null;
            if (!menu.isConnected) return;
            if (isAnchorHidden()) {
                this.removeInputActionMenu();
                return;
            }
            this.positionInputActionMenu(menu, anchorNode);
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
            if (menu.contains?.(event.target) || button?.contains?.(event.target)) return;
            this.removeInputActionMenu();
        };
        const escapeKeydown = event => {
            if (event.isComposing || event.keyCode === 229) return;
            const activeEl = typeof document !== "undefined" ? document.activeElement : null;
            if (event.key === "Escape") {
                const typingInTextbox = Boolean(activeEl && activeEl !== button && !menu.contains?.(activeEl)
                    && (activeEl.getAttribute?.("role") === "textbox" || activeEl.isContentEditable === true || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "INPUT"));
                event.preventDefault?.();
                event.stopPropagation?.();
                this.removeInputActionMenu();
                if (!typingInTextbox) button?.focus?.();
                return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            if (!menu.contains?.(event.target) && event.target !== button && !menu.contains?.(activeEl) && activeEl !== button) return;
            const items = [...(menu.querySelectorAll?.(".dait-input-action-menu-item") || [])].filter(item => !item.disabled);
            if (!items.length) return;
            event.preventDefault?.();
            event.stopPropagation?.();
            const currentIndex = items.indexOf(document.activeElement);
            let nextIndex = 0;
            if (event.key === "Home") nextIndex = 0;
            else if (event.key === "End") nextIndex = items.length - 1;
            else if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
            else if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? items.length - 1 : currentIndex - 1;
            items[nextIndex]?.focus?.();
        };
        this.plugin.inputActionMenuCleanup = () => {
            button?.setAttribute?.("aria-expanded", "false");
            if (repositionRaf !== null && typeof window !== "undefined") {
                window.cancelAnimationFrame?.(repositionRaf);
                repositionRaf = null;
            }
            if (typeof window !== "undefined") {
                window.removeEventListener?.("resize", onResize, { capture: true });
                window.removeEventListener?.("scroll", onScroll, { capture: true });
            }
            document.removeEventListener?.("pointerdown", outsidePointerDown, true);
            document.removeEventListener?.("keydown", escapeKeydown, true);
        };
        if (typeof window !== "undefined") {
            window.addEventListener?.("resize", onResize, { capture: true, passive: true });
            window.addEventListener?.("scroll", onScroll, { capture: true, passive: true });
        }
        document.addEventListener?.("pointerdown", outsidePointerDown, true);
        document.addEventListener?.("keydown", escapeKeydown, true);
        onResize();
        return menu;
    },

    positionInputActionMenu(menu, anchor = null) {
        if (!menu?.style || typeof window === "undefined") return;
        const rect = anchor?.getBoundingClientRect?.() || null;
        const viewportWidth = Number(window.innerWidth || document.documentElement?.clientWidth || 0) || 900;
        const viewportHeight = Number(window.innerHeight || document.documentElement?.clientHeight || 0) || 700;
        const width = Math.min(210, Math.max(156, viewportWidth - 24));
        const left = rect ? Math.max(12, Math.min(rect.right - width, viewportWidth - width - 12)) : viewportWidth - width - 16;
        const bottom = rect ? Math.max(12, viewportHeight - rect.top + 8) : 76;
        const safeBottom = Math.min(Math.max(bottom, 12), Math.max(12, viewportHeight - 80));
        const maxHeight = Math.max(96, viewportHeight - safeBottom - 12);
        menu.style.left = `${left}px`;
        menu.style.right = "auto";
        menu.style.bottom = `${safeBottom}px`;
        menu.style.maxHeight = `${maxHeight}px`;
        menu.style.overflowY = "auto";
        menu.style.width = `${width}px`;
    },

    removeInputActionMenu() {
        this.plugin.inputActionMenuCleanup?.();
        this.plugin.inputActionMenuCleanup = null;
        this.plugin.inputActionMenu?.remove?.();
        this.plugin.inputActionMenu = null;
        this.plugin.inputActionMenuAnchor = null;
    },

    getPolishButtonContainer(textbox) {
        return this.plugin.getInputButtonContainer(textbox);
    },

    getInputButtonContainer(textbox) {
        const root = textbox?.closest?.("form, [class*='channelTextArea']") || textbox?.parentElement;
        if (!root?.querySelector) return null;
        return this.resolveInputButtonContainer(root, textbox);
    },

    resolveInputButtonContainer(root, textbox) {
        const candidates = this.getInputButtonContainerCandidates(root, textbox);
        const controls = this.getInputButtonControls(root, textbox);
        const anchors = controls.filter(control => this.isInputButtonToolbarAnchor(control));
        const scored = candidates
            .map(container => ({ container, score: this.scoreInputButtonContainer(container, root, textbox, anchors) }))
            .filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score);
        if (scored.length) return scored[0].container;

        for (const anchor of anchors) {
            const container = this.getInputButtonContainerFromAnchor(anchor, root, textbox);
            if (container) return container;
        }

        return null;
    },

    getInputButtonContainerCandidates(root, textbox) {
        const candidates = [];
        const add = node => {
            if (!this.isValidInputButtonContainer(node, root, textbox) || candidates.includes(node)) return;
            candidates.push(node);
        };
        try {
            (root.querySelectorAll?.("[class*='buttons']") || []).forEach(add);
        }
        catch {}
        try {
            add(root.querySelector?.("[class*='buttons']"));
        }
        catch {}
        return candidates;
    },

    getInputButtonControls(root, textbox) {
        try {
            return [...(root.querySelectorAll?.("button, [role='button']") || [])]
                .filter(control => control?.isConnected !== false)
                .filter(control => !control.contains?.(textbox))
                .filter(control => !control.closest?.(".dait-polish-button, .dait-polish-preset-button, .dait-public-bilingual-button, .dait-input-action-group"));
        }
        catch {
            return [];
        }
    },

    scoreInputButtonContainer(container, root, textbox, anchors = []) {
        if (!this.isValidInputButtonContainer(container, root, textbox)) return 0;
        let score = this.plugin.elementClassNameIncludes(container, "buttons") ? 20 : 0;
        const anchorCount = anchors.filter(anchor => container.contains?.(anchor)).length;
        score += anchorCount * 100;
        if (this.plugin.elementClassNameIncludes(container, "attach")) score -= 20;
        return Math.max(0, score);
    },

    getInputButtonContainerFromAnchor(anchor, root, textbox) {
        let current = anchor?.parentElement || null;
        let fallback = null;
        let guard = 0;
        while (current && current !== root && guard < 8) {
            if (this.isValidInputButtonContainer(current, root, textbox)) {
                if (this.plugin.elementClassNameIncludes(current, "buttons")) return current;
                if (!fallback && this.getButtonLikeDescendantCount(current) > 1) fallback = current;
            }
            current = current.parentElement;
            guard++;
        }
        return fallback;
    },

    isValidInputButtonContainer(container, root, textbox) {
        if (!container || container === root || container?.isConnected === false) return false;
        if (container.contains?.(textbox)) return false;
        if (textbox?.contains?.(container)) return false;
        if (container.closest?.("[role='textbox'], [contenteditable='true'], [data-slate-editor='true']")) return false;
        if (this.plugin.elementHasClassName(container, "dait-input-action-group")) return false;
        const tag = String(container.tagName || "").toLowerCase();
        if (tag === "button") return false;
        const role = String(container.getAttribute?.("role") || "").toLowerCase();
        if (role === "button" || role === "textbox") return false;
        return true;
    },

    isInputButtonToolbarAnchor(control) {
        return this.plugin.discordHost.isComposerToolbarAnchorLabel(this.getInputButtonControlLabel(control));
    },

    getInputButtonControlLabel(control) {
        return [
            control?.getAttribute?.("aria-label"),
            control?.getAttribute?.("data-tooltip-text"),
            control?.title,
            control?.textContent
        ].filter(Boolean).join(" ").toLowerCase();
    },

    getButtonLikeDescendantCount(container) {
        try {
            return (container.querySelectorAll?.("button, [role='button']") || []).length;
        }
        catch {
            return 0;
        }
    },

    // Minimal density hides the direct buttons behind the "AI" menu button.
    isInputActionButtonShown(button) {
        if (!button || button.isConnected === false) return false;
        const group = button.parentElement?.dataset?.daitDensity ? button.parentElement : button.closest?.(".dait-input-action-group");
        return !this.isInputActionDirectButton(button) || group?.dataset?.daitDensity !== "minimal";
    },

    getComposerPolishButton(textbox) {
        const root = textbox?.closest?.("form, [class*='channelTextArea']");
        const button = root?.querySelector?.(".dait-input-action-group .dait-polish-button") || null;
        if (!button || button.isConnected === false) return null;
        return !button.__daitTextbox || button.__daitTextbox === textbox ? button : null;
    },

    injectPolishButton() {
        this.plugin.injectInputButtons({ forcePolish: true });
    }
};

module.exports = methods;
