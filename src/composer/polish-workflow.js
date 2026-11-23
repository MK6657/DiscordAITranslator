"use strict";

const {
    POLISH_REPOLISH_SOURCE_ORIGINAL,
    POLISH_REPOLISH_SOURCE_LAST_RESULT,
    PROMPT_TEMPLATE_CATEGORY_DIALECT,
    DIAGNOSTIC_MESSAGE_STATES,
    DIAGNOSTIC_REASON_CODES,
    DEFAULT_SETTINGS
} = require("../constants");

const methods = {
    getPolishAfterAction() {
        const action = String(this.plugin.settings.polish?.afterAction || "");
        if (action === "directReplace") return "replace";
        return ["replace", "confirmSend"].includes(action) ? action : DEFAULT_SETTINGS.polish.afterAction;
    },

    getPolishRepolishSource() {
        const source = String(this.plugin.settings.polish?.repolishSource || "");
        return source === POLISH_REPOLISH_SOURCE_LAST_RESULT
            ? POLISH_REPOLISH_SOURCE_LAST_RESULT
            : POLISH_REPOLISH_SOURCE_ORIGINAL;
    },

    getPolishSession(textbox, currentText) {
        const text = this.normalizeDraftRawText(currentText);
        const session = this.plugin.polishSession;
        const composerKey = this.getTextboxComposerKey(textbox);
        if (
            session
            && session.composerKey === composerKey
            && this.isPolishSessionTextbox(session, textbox)
            && (
                this.areDraftTextsEqualStrict(text, session.lastWrittenRawText ?? session.lastWrittenText)
                || this.areDraftTextsEqualStrict(text, session.lastResultRawText ?? session.lastResult)
                || this.areDraftTextsEqualStrict(text, session.originalRawText ?? session.originalText)
                || this.areDraftTextsEqualStrict(text, session.lastBilingualRawText ?? session.lastBilingualText)
            )
        ) {
            session.textbox = textbox;
            session.updatedAt = Date.now();
            return session;
        }

        return this.createPolishSession(textbox, text, composerKey);
    },

    createPolishSession(textbox, originalText, composerKey = this.getTextboxComposerKey(textbox)) {
        const originalRawText = this.normalizeDraftRawText(originalText);
        const session = {
            textbox,
            composerKey,
            originalText: this.plugin.normalizeExtractedText(originalText),
            originalRawText,
            lastResult: "",
            lastResultRawText: "",
            lastWrittenText: "",
            lastWrittenRawText: "",
            lastBilingualText: "",
            lastBilingualRawText: "",
            lastBilingualSourceText: "",
            lastBilingualSourceRawText: "",
            previousResults: [],
            attemptCount: 0,
            sourceHash: this.plugin.getStrongTextFingerprint(originalText),
            updatedAt: Date.now()
        };
        this.plugin.polishSession = session;
        return session;
    },

    getTextboxComposerRoot(textbox) {
        return textbox?.closest?.("form, [class*='channelTextArea']") || textbox?.parentElement || textbox;
    },

    getTextboxComposerKey(textbox) {
        const route = this.plugin.messageTracker.getRouteIds?.() || {};
        const root = this.getTextboxComposerRoot(textbox);
        if (!root) return [route.guildId || "", route.channelId || "", "no-composer"].join(":");
        if (!root.dataset) root.dataset = {};
        if (!root.dataset.daitComposerKey) {
            root.dataset.daitComposerKey = `composer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        }
        return [route.guildId || "", route.channelId || "", root.dataset.daitComposerKey].join(":");
    },

    isPolishSessionTextbox(session, textbox) {
        if (!session || !textbox) return false;
        if (session.textbox === textbox) return true;
        return session.textbox?.isConnected !== false && textbox.isConnected !== false;
    },

    getPolishSourceText(session) {
        if (!session) return "";
        if (this.getPolishRepolishSource() === POLISH_REPOLISH_SOURCE_LAST_RESULT && session.lastResult) {
            return session.lastResultRawText || session.lastResult;
        }
        return session.originalRawText || session.originalText;
    },

    updatePolishSessionAfterResult(session, textbox, polished, written) {
        if (!session) return;
        session.textbox = textbox;
        const normalized = this.plugin.normalizeExtractedText(polished);
        const raw = this.normalizeDraftRawText(polished);
        session.lastResult = normalized;
        session.lastResultRawText = raw;
        if (raw.trim()) {
            const history = Array.isArray(session.previousResults) ? session.previousResults : [];
            if (!history.some(item => this.areComparableTextsEqual(item, raw))) {
                history.push(raw);
            }
            session.previousResults = history.slice(-5);
            session.attemptCount = Math.max(Number(session.attemptCount || 0) + 1, session.previousResults.length);
        }
        if (written) {
            session.lastWrittenText = normalized;
            session.lastWrittenRawText = raw;
        }
        session.updatedAt = Date.now();
        this.plugin.polishSession = session;
    },

    updatePolishSessionAfterBilingual(session, textbox, composed, sourceText, written) {
        if (!session) return;
        session.textbox = textbox;
        session.lastBilingualSourceText = this.plugin.normalizeExtractedText(sourceText);
        session.lastBilingualSourceRawText = this.normalizeDraftRawText(sourceText);
        if (written) {
            session.lastBilingualText = this.plugin.normalizeExtractedText(composed);
            session.lastBilingualRawText = this.normalizeDraftRawText(composed);
            session.lastWrittenText = this.plugin.normalizeExtractedText(composed);
            session.lastWrittenRawText = this.normalizeDraftRawText(composed);
        }
        session.updatedAt = Date.now();
        this.plugin.polishSession = session;
    },

    areComparableTextsEqual(left, right) {
        return this.plugin.normalizeExtractedText(left) === this.plugin.normalizeExtractedText(right);
    },

    // Only Slate's U+FEFF placeholders are dropped. U+200B is the user's own text (for example
    // "@\u200beveryone", which does not ping), so the draft, the spoiler and Restore keep it.
    normalizeDraftRawText(text) {
        return String(text ?? "").replace(/\ufeff/g, "").replace(/\r\n?/g, "\n");
    },

    areDraftTextsEqualStrict(left, right) {
        return this.normalizeDraftRawText(left) === this.normalizeDraftRawText(right);
    },

    getTextboxDraftText(textbox) {
        const raw = this.plugin.getTextboxRawTextSafe(textbox);
        if (raw) return raw;
        return this.plugin.getElementText(textbox);
    },

    isCurrentDraftText(textbox, expectedText) {
        return this.areDraftTextsEqualStrict(this.plugin.getTextboxDraftText(textbox), expectedText);
    },

    isComposerWriteSuperseded(writeToken) {
        return Boolean(writeToken?.cancelled && writeToken.reason === "superseded");
    },

    // Why a finished polish/bilingual result must not be written now ("" when it may be).
    getComposerWriteStaleReason(textbox, writeToken, expectedText) {
        if (!textbox || textbox.isConnected === false) return "remounted";
        if (writeToken && !this.plugin.composerWriter.isWriteTokenCurrent(writeToken)) return writeToken.reason || "cancelled";
        if (!this.isCurrentDraftText(textbox, expectedText)) return "draft-changed";
        if (this.isComposerFocusElsewhere(textbox)) return "focus-moved";
        return "";
    },

    // Writing focuses and selects the target composer, so a late result must not land while the
    // user is typing in another field (thread panel, search box, another composer).
    isComposerFocusElsewhere(textbox) {
        if (typeof document === "undefined" || !textbox) return false;
        const active = document.activeElement;
        if (!active || active === document.body || active === document.documentElement) return false;
        if (active === textbox || textbox.contains?.(active)) return false;
        return this.isEditableFocusTarget(active);
    },

    isEditableFocusTarget(element) {
        if (!element) return false;
        const tagName = String(element.tagName || "").toUpperCase();
        if (tagName === "TEXTAREA") return !element.readOnly && !element.disabled;
        if (tagName === "INPUT") {
            const type = String(element.type || element.getAttribute?.("type") || "text").toLowerCase();
            const nonText = ["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"];
            return !element.readOnly && !element.disabled && !nonText.includes(type);
        }
        if (element.isContentEditable === true) return true;
        const contentEditable = String(element.getAttribute?.("contenteditable") ?? "").toLowerCase();
        return contentEditable === "true" || contentEditable === "plaintext-only" || element.getAttribute?.("role") === "textbox";
    },

    getComposerResultPanelAnchor(textbox) {
        if (textbox && textbox.isConnected !== false) return textbox;
        if (typeof document === "undefined") return textbox;
        try {
            return this.plugin.getActiveTextbox() || this.plugin.getTextbox() || textbox;
        }
        catch {
            return textbox;
        }
    },

    isPolishInputButtonEnabled(options = {}) {
        return this.plugin.settings.polish?.enabled !== false && Boolean(options.forcePolish || this.plugin.settings.ui?.injectInputButton);
    },

    isPolishSessionAlreadyPolished(session, text) {
        if (!session?.lastResult) return false;
        return this.areDraftTextsEqualStrict(text, session.lastResultRawText || session.lastResult)
            || this.areDraftTextsEqualStrict(text, session.lastWrittenRawText || session.lastWrittenText);
    },

    async polishCurrentDraft(button = null, behaviorOptions = {}) {
        if (!this.plugin.settings.polish.enabled) {
            this.plugin.showToast(this.plugin.t("polishDisabled"), "info");
            return;
        }

        const textbox = this.plugin.resolveInputActionTextbox(button, behaviorOptions);
        if (!textbox) {
            this.plugin.showToast(this.plugin.t("textboxMissing"), "error");
            return;
        }
        const expectedComposerKey = behaviorOptions.composerKey || button?.dataset?.daitComposerKey || "";
        if (!this.plugin.isInputActionTextboxCurrent(textbox, expectedComposerKey)) {
            this.plugin.queueInputButtonScan({ delayMs: 120, trailing: true });
            this.plugin.showToast(this.plugin.t("composerChanged"), "info");
            return;
        }

        const draft = this.plugin.getTextboxDraftText(textbox);
        if (!this.plugin.normalizeExtractedText(draft)) {
            this.plugin.showToast(this.plugin.t("inputEmpty"), "info");
            return;
        }

        const writeToken = this.plugin.composerWriter.beginWrite(textbox, draft);
        const composer = this.getTextboxComposerRoot(textbox);
        this.plugin.latestPolishRequestIds.set(composer, writeToken.id);
        this.plugin.setButtonBusy(button, true, this.plugin.t("polishBusy"));
        // Hotkey and menu runs have no busy button in view when the toolbar is collapsed or absent.
        if ((behaviorOptions.fromHotkey || behaviorOptions.fromMenu) && !this.isInputActionButtonShown(button)) {
            this.plugin.showToast(this.plugin.t("polishRunning"), "info");
        }
        const lifecycleToken = this.plugin.getLifecycleToken();
        const isLatestRequest = () => this.plugin.isLifecycleTokenCurrent(lifecycleToken)
            && this.plugin.latestPolishRequestIds.get(composer) === writeToken.id
            && !this.isComposerWriteSuperseded(writeToken);
        const startedAt = Date.now();
        this.plugin.logDiagnostic("polish", "start", {
            ...this.plugin.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.REQUEST_STARTED, {
                messageState: DIAGNOSTIC_MESSAGE_STATES.IN_FLIGHT,
                targetKind: "composer",
                sourceHash: this.plugin.getStrongTextFingerprint(draft),
                textLength: String(draft || "").length
            }),
            sourceHash: this.plugin.getStrongTextFingerprint(draft),
            length: String(draft || "").length
        });
        let pendingSend = null;
        try {
            const session = this.getPolishSession(textbox, draft);
            const sourceText = this.getPolishSourceText(session);
            if (!sourceText) {
                this.plugin.showToast(this.plugin.t("inputEmpty"), "info");
                return;
            }
            const originRouteKey = this.plugin.getCurrentRouteKey();
            const originComposerKey = this.getTextboxComposerKey(textbox);
            const previousResults = Array.isArray(session.previousResults) ? session.previousResults.slice(-5) : [];
            const rawPolished = await this.runPolishWithGuards(sourceText, {
                previousResults,
                enforceRepolishVariation: Boolean(session.lastWrittenRawText && previousResults.length),
                isStillCurrent: () => isLatestRequest() && this.plugin.polishSession === session
            });
            if (!isLatestRequest() || this.plugin.polishSession !== session) return;
            const polished = this.sanitizeComposerGeneratedOutput(session.originalRawText ?? sourceText, rawPolished, "polish");
            const action = this.getPolishAfterAction();
            // The panel's "Insert into input" writes the result: record it like this run's own write.
            const recordPanelInsert = target => {
                if (!isLatestRequest() || this.plugin.polishSession !== session) return;
                session.composerKey = this.getTextboxComposerKey(target);
                this.updatePolishSessionAfterResult(session, target, polished, true);
                this.plugin.showRestoreOriginalControl(target, session, button);
            };
            const staleReason = this.plugin.getCurrentRouteKey() !== originRouteKey || this.getTextboxComposerKey(textbox) !== originComposerKey
                ? "composer-changed"
                : this.plugin.getComposerWriteStaleReason(textbox, writeToken, draft);
            if (staleReason) {
                this.updatePolishSessionAfterResult(session, textbox, polished, false);
                this.plugin.logDiagnostic("polish", "stale-input", {
                    ...this.plugin.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.STALE_DOM, {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.STALE,
                        targetKind: "composer",
                        sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                        textLength: String(sourceText || "").length
                    }),
                    sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                    reason: staleReason,
                    ms: Date.now() - startedAt
                });
                this.plugin.showPolishResultPanel(this.getComposerResultPanelAnchor(textbox), polished, {
                    sourceButton: button,
                    originRouteKey,
                    originComposerKey,
                    sourceText,
                    onApplied: recordPanelInsert
                });
                this.plugin.showToast(this.plugin.t("composerResultHeld"), "info");
                return;
            }
            const writeResult = await this.plugin.composerWriter.replaceTextSafely(textbox, polished, {
                blurAfterReplace: false,
                extraBlurTarget: button,
                expectedPreviousText: draft,
                writeToken
            });
            if (!isLatestRequest() || this.plugin.polishSession !== session) return;
            this.updatePolishSessionAfterResult(session, textbox, polished, writeResult.ok);
            if (!writeResult.ok) {
                this.plugin.logDiagnostic("polish", "panel", {
                    ...this.plugin.getDiagnosticBaseMeta("polish", "polish", "write-failed", {
                        messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                        targetKind: "composer",
                        sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                        textLength: String(sourceText || "").length
                    }),
                    sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                    ms: Date.now() - startedAt
                });
                this.plugin.showPolishResultPanel(textbox, polished, {
                    sourceButton: button,
                    originRouteKey,
                    originComposerKey,
                    sourceText,
                    onApplied: recordPanelInsert
                });
                return;
            }
            this.plugin.logDiagnostic("polish", "success", {
                ...this.plugin.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.RENDERED, {
                    messageState: DIAGNOSTIC_MESSAGE_STATES.RENDERED,
                    targetKind: "composer",
                    sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                    textLength: String(sourceText || "").length
                }),
                sourceHash: this.plugin.getStrongTextFingerprint(sourceText),
                ms: Date.now() - startedAt
            });
            const writtenDraft = {
                textbox,
                text: polished,
                composerKey: originComposerKey,
                routeKey: originRouteKey,
                requestId: writeToken.id
            };
            if (writeResult.userEditedAfter || !this.isPolishedSendStillCurrent(writtenDraft, lifecycleToken)) return;
            if (this.isPublicBilingualAfterPolishEnabled()) {
                const bilingualResult = await this.plugin.publicBilingualCurrentDraft(button, {
                    textbox,
                    composerKey: originComposerKey,
                    polishRequestId: writeToken.id,
                    skipAutoPolish: true
                });
                if (bilingualResult?.wrote || bilingualResult?.stale
                    || !this.isPolishedSendStillCurrent(writtenDraft, lifecycleToken)) return;
            }
            this.plugin.showRestoreOriginalControl(textbox, session, button);

            if (action === "confirmSend") {
                // Asked after the busy state and the write token are released (below), so an open dialog
                // never holds the button or blocks a newer run.
                pendingSend = writtenDraft;
            }
        }
        catch (error) {
            if (!isLatestRequest()) return;
            this.plugin.logDiagnostic("polish", "error", {
                ...this.plugin.getDiagnosticBaseMeta("polish", "polish", DIAGNOSTIC_REASON_CODES.FAILURE, {
                    messageState: DIAGNOSTIC_MESSAGE_STATES.FAILED,
                    targetKind: "composer",
                    sourceHash: this.plugin.getStrongTextFingerprint(draft),
                    textLength: String(draft || "").length,
                    failureType: this.plugin.getAutoTranslationFailureType(error)
                }),
                type: this.plugin.getAutoTranslationFailureType(error),
                ms: Date.now() - startedAt
            });
            this.plugin.showToast(this.plugin.formatError(error), "error");
        }
        finally {
            this.plugin.composerWriter.finishWriteToken(writeToken);
            if (this.plugin.isLifecycleTokenCurrent(lifecycleToken)) this.plugin.setButtonBusy(button, false, this.plugin.t("polishButton"));
        }
        if (pendingSend) await this.confirmPolishedSend(pendingSend, lifecycleToken);
    },

    // "Ask before sending": the polished text is already in the input box. Sends only when, after the dialog,
    // the plugin is still running and the same composer is still connected and holds exactly that text.
    async confirmPolishedSend(pending, lifecycleToken) {
        if (!this.isPolishedSendStillCurrent(pending, lifecycleToken)) return false;
        const confirmed = await this.plugin.confirmAction({
            title: this.plugin.t("confirmSend"),
            preview: pending?.text || "",
            confirmText: this.plugin.t("confirmSendAction"),
            cancelText: this.plugin.t("dialogCancel")
        });
        if (!confirmed || !this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return false;
        if (!this.isPolishedSendStillCurrent(pending, lifecycleToken)) {
            this.plugin.showToast(this.plugin.t("confirmSendDraftChanged"), "info");
            return false;
        }
        this.clearPolishSubmitTimer();
        this.plugin.polishSubmitTimer = setTimeout(() => {
            this.plugin.polishSubmitTimer = null;
            if (this.isPolishedSendStillCurrent(pending, lifecycleToken)) this.plugin.composerWriter.submit(pending.textbox);
        }, 80);
        return true;
    },

    isPolishedSendStillCurrent(pending, lifecycleToken) {
        const textbox = pending?.textbox;
        if (!this.plugin.isLifecycleTokenCurrent(lifecycleToken)) return false;
        if (!textbox || textbox.isConnected === false) return false;
        if (pending.composerKey && this.getTextboxComposerKey(textbox) !== pending.composerKey) return false;
        if (pending.routeKey !== undefined && this.plugin.getCurrentRouteKey() !== pending.routeKey) return false;
        if (pending.requestId !== undefined && this.plugin.latestPolishRequestIds.get(this.getTextboxComposerRoot(textbox)) !== pending.requestId) return false;
        return this.isCurrentDraftText(textbox, pending.text);
    },

    clearPolishSubmitTimer() {
        if (!this.plugin.polishSubmitTimer) return;
        clearTimeout(this.plugin.polishSubmitTimer);
        this.plugin.polishSubmitTimer = null;
    },

    async runPolishWithGuards(sourceText, options = {}) {
        const polishConfig = this.plugin.getTaskConfig("polish") || {};
        const activeTemplate = this.plugin.getActivePolishTemplate(polishConfig);
        const isDialectTemplate = Boolean(activeTemplate && this.plugin.getPolishTemplateCategory(activeTemplate) === PROMPT_TEMPLATE_CATEGORY_DIALECT);
        const targetLanguage = this.plugin.getEffectivePolishTargetLanguage(polishConfig);
        const allowDialectScriptMix = Boolean(isDialectTemplate && !this.plugin.isTraditionalChineseTarget(targetLanguage));
        const previousResults = Array.isArray(options.previousResults)
            ? options.previousResults.map(item => String(item || "").trim()).filter(Boolean).slice(-5)
            : [];
        const firstOptions = previousResults.length || options.mode
            ? {
                ...(options.mode ? { mode: options.mode } : {}),
                ...(previousResults.length ? {
                    configOverrides: {
                        previousPolishResults: previousResults,
                        repolishAttempt: previousResults.length + 1
                    }
                } : {})
            }
            : undefined;
        const first = firstOptions !== undefined
            ? await this.plugin.runModelTask("polish", sourceText, firstOptions)
            : await this.plugin.runModelTask("polish", sourceText);
        if (options.isStillCurrent && !options.isStillCurrent()) return first;

        let violation = this.plugin.getPolishOutputLanguageViolation(sourceText, first, targetLanguage, {
            chineseScriptOnly: Boolean(options.chineseScriptOnly),
            allowDialectScriptMix
        });
        if (!violation && options.enforceRepolishVariation && previousResults.length
            && previousResults.some(item => this.areComparableTextsEqual(item, first))) {
            violation = "duplicate-repolish";
        }
        if (!violation || violation === "empty") return first;

        const configuredTemp = this.plugin.normalizeRequestNumber(polishConfig.temperature, DEFAULT_SETTINGS.polish.temperature, { min: 0, max: 2 });
        const repairTemp = violation === "duplicate-repolish"
            ? Math.min(2, Math.max(configuredTemp, 0.95))
            : Math.min(configuredTemp, 0.35);
        try {
            const repaired = await this.plugin.runModelTask("polish", sourceText, {
                ...(options.mode ? { mode: options.mode } : {}),
                configOverrides: {
                    temperature: repairTemp,
                    previousPolishResults: previousResults,
                    repolishAttempt: previousResults.length + 1,
                    polishRepairReason: violation,
                    polishPreviousInvalidOutput: String(first || "")
                }
            });
            if (options.isStillCurrent && !options.isStillCurrent()) return repaired;
            const cleaned = String(repaired || "").trim();
            if (!cleaned) return first;
            const repairViolation = this.plugin.getPolishOutputLanguageViolation(sourceText, cleaned, targetLanguage, {
                chineseScriptOnly: Boolean(options.chineseScriptOnly),
                allowDialectScriptMix
            });
            this.plugin.logDiagnostic("polish.guard", repairViolation ? "repair-partial" : "repair-ok", {
                violation,
                repairViolation,
                targetLanguage
            });
            if (!repairViolation || violation === "duplicate-repolish") return repaired;
            return first;
        }
        catch (error) {
            if (this.plugin.isRequestCancelled(error)) throw error;
            this.plugin.logDiagnostic("polish.guard", "repair-fallback", {
                violation,
                targetLanguage,
                error: this.plugin.formatError(error)
            });
            return first;
        }
    },

    sanitizeComposerGeneratedOutput(sourceText, outputText, flow = "polish", reservedText = "") {
        const guarded = this.plugin.guardGeneratedMassMentions(sourceText, outputText, reservedText);
        if (guarded.neutralized) {
            this.plugin.logDiagnostic(`${flow}.mention-guard`, "neutralized", {
                count: guarded.addedMentions.length,
                mentions: guarded.addedMentions
            });
            this.plugin.showToast(this.plugin.t("composerMassMentionBlocked", { mentions: guarded.addedMentions.join(", ") }), "info");
        }
        return guarded.text;
    }
};

module.exports = methods;
