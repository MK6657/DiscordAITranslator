"use strict";

// Phase 5b of the modularization plan: diagnostics recording, aggregation, meta builders and persistence.
// Extracted from discord-ai-translator.js behind a facade: every cross-subsystem call
// goes through this.plugin so the main class keeps its full (test-visible) surface.
const {
    DIAGNOSTICS_COMPRESSION_WINDOW_MS,
    DIAGNOSTICS_MAX_ENTRIES,
    DIAGNOSTICS_SLOW_OPERATION_MS,
    DIAGNOSTICS_SLOW_OPERATION_THROTTLE_MS,
    DIAGNOSTICS_WRITE_DEBOUNCE_MS,
    DIAGNOSTIC_DATA_KEY,
    DIAGNOSTIC_FAILURE_CLASSES,
    DIAGNOSTIC_FAILURE_LAYERS,
    DIAGNOSTIC_MESSAGE_STATES,
    DIAGNOSTIC_REASON_CODES,
    HEAVY_PERSISTENCE_DEFER_MS,
    PLUGIN_NAME
} = require("../constants");
const { PLUGIN_VERSION } = require("../version");

class DiagnosticsRecorder {
    constructor(plugin) {
        this.plugin = plugin;
    }

    warnSanitized(message, error = null, meta = {}) {
        try {
            const payload = this.plugin.sanitizeDiagnosticObject({
                ...meta,
                errorName: error?.name || "",
                errorText: error ? this.plugin.formatError(error) : "",
                status: Number(error?.status || 0),
                retryAfterMs: Number(error?.retryAfterMs || 0),
                requestId: error?.requestId || "",
                bodyHash: error?.bodyHash || ""
            });
            console.warn(`[${PLUGIN_NAME}] ${message}`, payload);
        }
        catch {}
    }

    getDiagnosticTime() {
        try {
            if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
        }
        catch {}
        return Date.now();
    }

    logSlowOperation(action, startedAt, meta = {}, thresholdMs = DIAGNOSTICS_SLOW_OPERATION_MS) {
        if (!this.plugin.settings.ui?.diagnosticsEnabled) return;
        const ms = Math.round(this.plugin.getDiagnosticTime() - Number(startedAt || 0));
        if (!Number.isFinite(ms) || ms < thresholdMs) return;
        const key = String(action || "slow.operation");
        const now = Date.now();
        const previous = Number(this.plugin.slowDiagnosticLastLoggedAt?.get?.(key) || 0);
        if (previous && now - previous < DIAGNOSTICS_SLOW_OPERATION_THROTTLE_MS) return;
        this.plugin.slowDiagnosticLastLoggedAt?.set?.(key, now);
        this.plugin.logDiagnostic(key, "slow", { ...meta, ms });
    }

    getDiagnosticRouteKeyHash(routeKey = this.plugin.getCurrentRouteKey()) {
        const value = String(routeKey || "").trim();
        return value ? this.plugin.getTextFingerprint(value) : "";
    }

    getDiagnosticBaseMeta(flow = "", mode = "", reasonCode = "", extra = {}) {
        const normalizedReasonCode = this.plugin.getDiagnosticReasonCode(reasonCode);
        return {
            schemaVersion: 1,
            ...(flow ? { flow } : {}),
            ...(mode ? { mode } : {}),
            ...(normalizedReasonCode ? { reasonCode: normalizedReasonCode } : {}),
            routeKeyHash: this.plugin.getDiagnosticRouteKeyHash(),
            ...extra
        };
    }

    getDiagnosticMessageState(state) {
        const value = String(state || "").trim();
        const known = new Set(Object.values(DIAGNOSTIC_MESSAGE_STATES));
        return known.has(value) ? value : "";
    }

    getDiagnosticReasonCode(reasonCode) {
        const value = String(reasonCode || "").trim();
        const known = new Set(Object.values(DIAGNOSTIC_REASON_CODES));
        return known.has(value) ? value : value.slice(0, 80);
    }

    enrichDiagnosticMeta(action = "", status = "info", meta = {}) {
        const source = meta && typeof meta === "object" ? meta : {};
        const flowStage = source.flowStage || this.plugin.inferDiagnosticStageFromAction(action, status, source);
        const failure = this.plugin.classifyDiagnosticFailure(action, status, source, flowStage);
        return {
            ...source,
            ...(flowStage ? { flowStage } : {}),
            ...failure
        };
    }

    classifyDiagnosticFailure(action = "", status = "", meta = {}, flowStage = "") {
        const existingClass = String(meta.failureClass || "").trim();
        const existingLayer = String(meta.failureLayer || "").trim();
        if (existingClass && existingLayer) return { failureClass: existingClass, failureLayer: existingLayer };

        const reason = String(meta.reasonCode || meta.reason || meta.blockReason || "").trim();
        const invalidReason = String(meta.invalidReason || meta.validationReason || "").trim();
        const type = String(meta.failureType || meta.type || "").trim();
        const actionText = String(action || "");
        const statusText = String(status || "");
        let failureClass = existingClass;
        let failureLayer = existingLayer || flowStage;

        if (!failureClass && (meta.sourceIncomplete || reason === "source-incomplete")) failureClass = DIAGNOSTIC_FAILURE_CLASSES.SOURCE_INCOMPLETE;
        if (!failureClass && (meta.wholePassFailed || actionText.includes("whole-pass"))) failureClass = DIAGNOSTIC_FAILURE_CLASSES.WHOLE_PASS_FAILED;
        if (!failureClass && meta.subchunkIndex !== undefined && (statusText === "failed" || invalidReason || type)) failureClass = DIAGNOSTIC_FAILURE_CLASSES.SUBCHUNK_FAILED;
        if (!failureClass && meta.chunkIndex !== undefined && (statusText === "failed" || invalidReason || type)) failureClass = DIAGNOSTIC_FAILURE_CLASSES.CHUNK_FAILED;
        if (!failureClass && (reason === DIAGNOSTIC_REASON_CODES.STALE_DOM || /stale/i.test(statusText) || /stale/i.test(type))) failureClass = DIAGNOSTIC_FAILURE_CLASSES.STALE_DOM;
        if (!failureClass && reason && reason.startsWith("render-")) failureClass = DIAGNOSTIC_FAILURE_CLASSES.RENDER_BLOCKED;
        if (!failureClass && /identity/i.test(reason)) failureClass = DIAGNOSTIC_FAILURE_CLASSES.CACHE_IDENTITY_MISMATCH;
        if (!failureClass && (reason === DIAGNOSTIC_REASON_CODES.PROVIDER_COOLDOWN || type === "provider-cooldown")) failureClass = DIAGNOSTIC_FAILURE_CLASSES.PROVIDER_COOLDOWN;
        if (!failureClass && ["auth", "quota", "rate-limit", "server", "timeout", "network", "parse", "local-unavailable"].includes(type)) failureClass = DIAGNOSTIC_FAILURE_CLASSES.PROVIDER_COOLDOWN;
        if (!failureClass && (invalidReason || reason === DIAGNOSTIC_REASON_CODES.OUTPUT_INVALID)) failureClass = DIAGNOSTIC_FAILURE_CLASSES.VALIDATOR_REJECTED;
        if (!failureClass && type === "invalid-output") failureClass = DIAGNOSTIC_FAILURE_CLASSES.PROVIDER_OUTPUT_BAD;

        if (!failureClass) return {};
        if (!existingLayer && failureClass === DIAGNOSTIC_FAILURE_CLASSES.WHOLE_PASS_FAILED) failureLayer = DIAGNOSTIC_FAILURE_LAYERS.REQUEST;
        if (!failureLayer) {
            if (failureClass === DIAGNOSTIC_FAILURE_CLASSES.SOURCE_INCOMPLETE) failureLayer = DIAGNOSTIC_FAILURE_LAYERS.SOURCE;
            else if ([DIAGNOSTIC_FAILURE_CLASSES.CHUNK_FAILED, DIAGNOSTIC_FAILURE_CLASSES.SUBCHUNK_FAILED, DIAGNOSTIC_FAILURE_CLASSES.VALIDATOR_REJECTED].includes(failureClass)) failureLayer = DIAGNOSTIC_FAILURE_LAYERS.VALIDATION;
            else if (failureClass === DIAGNOSTIC_FAILURE_CLASSES.RENDER_BLOCKED) failureLayer = DIAGNOSTIC_FAILURE_LAYERS.RENDER;
            else failureLayer = DIAGNOSTIC_FAILURE_LAYERS.OUTPUT;
        }

        return { failureClass, failureLayer };
    }

    getAutoTranslationDiagnosticMeta(item = {}, state = "", reasonCode = "", extra = {}) {
        const requestOptions = item?.requestOptions || {};
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        const text = String(item?.text || "");
        const cacheKey = String(item?.cacheKey || "");
        const identity = this.plugin.getTranslationIdentitySummary(requestOptions?.messageIdentity || "");
        const messageState = this.plugin.getDiagnosticMessageState(state || item?.daitDiagnosticState);
        const normalizedReasonCode = this.plugin.getDiagnosticReasonCode(reasonCode || item?.daitDiagnosticReason);
        return {
            ...this.plugin.getDiagnosticBaseMeta("auto", requestOptions?.mode || "auto", normalizedReasonCode, {
                routeKeyHash: this.plugin.getDiagnosticRouteKeyHash(requestOptions?.routeKey || this.plugin.getCurrentRouteKey())
            }),
            ...(messageState ? { messageState } : {}),
            ...(cacheKey ? { key: this.plugin.getTextFingerprint(cacheKey), cacheHash: this.plugin.getTextFingerprint(cacheKey) } : {}),
            ...(text ? { sourceHash: this.plugin.getStrongTextFingerprint(text), textLength: text.length } : {}),
            sourceKind: item?.source || "",
            sourceTextKind: item?.sourceTextKind || "",
            domLength: String(item?.domText || "").length || undefined,
            fullContentLength: String(item?.fullContent || "").length || undefined,
            targetKind: item?.targetKind || (item?.textOptions?.includeReplyPreview ? "reply-preview" : "message"),
            queueType: this.plugin.getAutoTranslationDiagnosticQueueType(item),
            queuePriority: this.plugin.getAutoTranslationDiagnosticQueuePriority(item),
            prefetch: Boolean(item?.daitPrefetchRequest),
            provider: config?.provider || "",
            model: config?.model || "",
            targetLanguage: requestOptions?.targetLanguage || this.plugin.settings.translation?.targetLanguage || "",
            identityKind: identity.kind || "",
            identityTargetKind: identity.targetKind || "",
            identityHash: requestOptions?.messageIdentity ? this.plugin.getTextFingerprint(requestOptions.messageIdentity) : "",
            ...this.plugin.getAutoTranslationQueueSnapshot(),
            ...extra
        };
    }

    getTranslationDiagnosticMeta(flow = "manual", options = {}) {
        const requestOptions = options.requestOptions || {};
        const config = this.plugin.getEffectiveTaskConfig("translation", requestOptions?.configOverrides);
        const text = String(options.text || "");
        const cacheKey = String(options.cacheKey || "");
        const identity = this.plugin.getTranslationIdentitySummary(requestOptions?.messageIdentity || "");
        const messageState = this.plugin.getDiagnosticMessageState(options.messageState);
        const reasonCode = this.plugin.getDiagnosticReasonCode(options.reasonCode);
        return {
            ...this.plugin.getDiagnosticBaseMeta(flow, options.mode || requestOptions?.mode || flow, reasonCode, {
                routeKeyHash: this.plugin.getDiagnosticRouteKeyHash(requestOptions?.routeKey || this.plugin.getCurrentRouteKey())
            }),
            ...(messageState ? { messageState } : {}),
            ...(cacheKey ? { key: this.plugin.getTextFingerprint(cacheKey), cacheHash: this.plugin.getTextFingerprint(cacheKey) } : {}),
            ...(text ? { sourceHash: this.plugin.getStrongTextFingerprint(text), textLength: text.length } : {}),
            targetKind: options.targetKind || (options.textOptions?.includeReplyPreview ? "reply-preview" : "message"),
            provider: config?.provider || this.plugin.settings.translation?.provider || "",
            model: config?.model || this.plugin.settings.translation?.model || "",
            targetLanguage: requestOptions?.targetLanguage || this.plugin.settings.translation?.targetLanguage || "",
            identityKind: identity.kind || "",
            identityTargetKind: identity.targetKind || "",
            identityHash: requestOptions?.messageIdentity ? this.plugin.getTextFingerprint(requestOptions.messageIdentity) : "",
            ...(options.extra || {})
        };
    }

    logDiagnostic(action, status = "info", meta = {}) {
        if (!this.plugin.settings.ui?.diagnosticsEnabled) return null;
        const entry = this.plugin.createDiagnosticEntry(action, status, meta);
        const previous = this.plugin.diagnosticLogs[this.plugin.diagnosticLogs.length - 1];
        if (previous && previous.groupKey === entry.groupKey && entry.ts - previous.lastTs <= DIAGNOSTICS_COMPRESSION_WINDOW_MS) {
            previous.count++;
            previous.lastTs = entry.ts;
            previous.lastIso = entry.iso;
            previous.meta = entry.meta;
            if (Number.isFinite(Number(entry.ms))) previous.ms = entry.ms;
            this.plugin.diagnosticCompressedCount++;
            this.plugin.scheduleDiagnosticLogsPersist();
            return previous;
        }

        this.plugin.diagnosticLogs.push(entry);
        while (this.plugin.diagnosticLogs.length > DIAGNOSTICS_MAX_ENTRIES) this.plugin.diagnosticLogs.shift();
        this.plugin.scheduleDiagnosticLogsPersist();
        return entry;
    }

    sanitizeDiagnosticMeta(meta = {}) {
        const result = {};
        if (!meta || typeof meta !== "object") return result;
        Object.entries(meta).forEach(([key, value]) => {
            if (this.plugin.isSensitiveDiagnosticKey(key)) return;
            if (value === undefined || typeof value === "function") return;
            if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
                result[key] = String(key || "").toLowerCase().includes("model")
                    ? this.plugin.getDiagnosticModelLabel(value)
                    : this.plugin.sanitizeDiagnosticValue(value);
                return;
            }
            if (Array.isArray(value)) {
                result[key] = value.slice(0, 12).map(item => this.plugin.sanitizeDiagnosticValue(item));
                return;
            }
            if (typeof value === "object") {
                result[key] = this.plugin.sanitizeDiagnosticObject(value);
            }
        });
        return result;
    }

    addDiagnosticSummaryCount(map, key, count = 1) {
        const value = String(key || "").trim();
        if (!value) return;
        map[value] = (Number(map[value] || 0) || 0) + Math.max(1, Number(count || 1) || 1);
    }

    createDiagnosticSummary(logs = this.plugin.diagnosticLogs, options = {}) {
        const entries = Array.isArray(logs) ? logs : [];
        const summary = {
            schemaVersion: 1,
            generatedAt: new Date().toISOString(),
            entries: entries.length,
            totalEvents: 0,
            compressed: Number(options.compressed ?? this.plugin.diagnosticCompressedCount) || 0,
            latestIso: "",
            queue: this.plugin.getAutoTranslationQueueSnapshot(),
            byAction: {},
            byStatus: {},
            byFlow: {},
            byMessageState: {},
            byReasonCode: {},
            byProvider: {},
            byQueueType: {},
            byFailureType: {},
            byFailureClass: {},
            byFailureLayer: {},
            byFlowStage: {},
            byValidationQuality: {},
            lastAutoTranslationDecisions: this.plugin.getLastAutoTranslationDecisionsSnapshot(24),
            recentImportant: []
        };

        for (const entry of entries) {
            const meta = entry?.meta || {};
            const count = Math.max(1, Number(entry?.count || 1) || 1);
            summary.totalEvents += count;
            summary.latestIso = entry?.lastIso || entry?.iso || summary.latestIso;
            this.plugin.addDiagnosticSummaryCount(summary.byAction, entry?.action, count);
            this.plugin.addDiagnosticSummaryCount(summary.byStatus, entry?.status, count);
            this.plugin.addDiagnosticSummaryCount(summary.byFlow, meta.flow || this.plugin.inferDiagnosticFlowFromAction(entry?.action), count);
            this.plugin.addDiagnosticSummaryCount(summary.byMessageState, meta.messageState, count);
            this.plugin.addDiagnosticSummaryCount(summary.byReasonCode, meta.reasonCode || meta.reason || meta.blockReason, count);
            this.plugin.addDiagnosticSummaryCount(summary.byProvider, meta.provider, count);
            this.plugin.addDiagnosticSummaryCount(summary.byQueueType, meta.queueType, count);
            this.plugin.addDiagnosticSummaryCount(summary.byFailureType, meta.failureType || meta.type, count);
            this.plugin.addDiagnosticSummaryCount(summary.byFailureClass, meta.failureClass, count);
            this.plugin.addDiagnosticSummaryCount(summary.byFailureLayer, meta.failureLayer, count);
            this.plugin.addDiagnosticSummaryCount(summary.byFlowStage, meta.flowStage, count);
            this.plugin.addDiagnosticSummaryCount(summary.byValidationQuality, meta.validationQuality || meta.quality, count);
        }

        summary.top = {
            actions: this.plugin.getTopDiagnosticCounts(summary.byAction),
            statuses: this.plugin.getTopDiagnosticCounts(summary.byStatus),
            flows: this.plugin.getTopDiagnosticCounts(summary.byFlow),
            messageStates: this.plugin.getTopDiagnosticCounts(summary.byMessageState),
            reasonCodes: this.plugin.getTopDiagnosticCounts(summary.byReasonCode),
            providers: this.plugin.getTopDiagnosticCounts(summary.byProvider),
            queueTypes: this.plugin.getTopDiagnosticCounts(summary.byQueueType),
            failureTypes: this.plugin.getTopDiagnosticCounts(summary.byFailureType),
            failureClasses: this.plugin.getTopDiagnosticCounts(summary.byFailureClass),
            failureLayers: this.plugin.getTopDiagnosticCounts(summary.byFailureLayer),
            flowStages: this.plugin.getTopDiagnosticCounts(summary.byFlowStage),
            validationQualities: this.plugin.getTopDiagnosticCounts(summary.byValidationQuality)
        };

        summary.recentImportant = entries
            .slice(-240)
            .filter(entry => {
                const meta = entry?.meta || {};
                const status = String(entry?.status || "");
                return status === "error"
                    || status === "blocked"
                    || status === "failed"
                    || Boolean(meta.failureClass)
                    || Boolean(meta.failureType || meta.type)
                    || ["failed", "stale", "cancelled", "retrying"].includes(String(meta.messageState || ""));
            })
            .slice(-16)
            .map(entry => ({
                iso: entry.lastIso || entry.iso || "",
                action: entry.action || "",
                status: entry.status || "",
                count: Math.max(1, Number(entry.count || 1) || 1),
                messageState: entry.meta?.messageState || "",
                reasonCode: entry.meta?.reasonCode || entry.meta?.reason || entry.meta?.blockReason || "",
                flow: entry.meta?.flow || this.plugin.inferDiagnosticFlowFromAction(entry.action),
                provider: entry.meta?.provider || "",
                queueType: entry.meta?.queueType || "",
                failureType: entry.meta?.failureType || entry.meta?.type || "",
                failureClass: entry.meta?.failureClass || "",
                failureLayer: entry.meta?.failureLayer || "",
                flowStage: entry.meta?.flowStage || "",
                validationQuality: entry.meta?.validationQuality || entry.meta?.quality || "",
                key: entry.key || ""
            }));

        summary.humanSummary = this.plugin.createDiagnosticHumanSummary(summary);
        return summary;
    }

    getDiagnosticLogsSnapshot() {
        const summary = this.plugin.createDiagnosticSummary(this.plugin.diagnosticLogs);
        return {
            plugin: PLUGIN_NAME,
            version: PLUGIN_VERSION,
            exportedAt: new Date().toISOString(),
            route: this.plugin.getSanitizedDiagnosticRouteIds(this.plugin.messageTracker.getRouteIds()),
            layout: {
                chatScrollerOverflowAnchor: this.plugin.getChatScrollerOverflowAnchor()
            },
            settings: {
                provider: this.plugin.settings.translation?.provider,
                model: this.plugin.getDiagnosticModelLabel(this.plugin.settings.translation?.model),
                targetLanguage: this.plugin.settings.translation?.targetLanguage,
                autoTranslateMessages: this.plugin.settings.ui?.autoTranslateMessages,
                autoTranslatePrefetch: this.plugin.settings.ui?.autoTranslatePrefetch,
                autoTranslateIntakeMode: this.plugin.settings.ui?.autoTranslateIntakeMode,
                autoTranslateConcurrency: this.plugin.settings.ui?.autoTranslateConcurrency,
                channelPolicy: this.plugin.getCurrentChannelAutoTranslatePolicy(),
                allowListedChannels: this.plugin.getChannelAutoTranslateAllowListCount(),
                historyBackfillEnabled: this.plugin.settings.ui?.historyBackfillEnabled,
                providerFallbackEnabled: this.plugin.settings.ui?.providerFallbackEnabled,
                providerFallbackOrder: this.plugin.getProviderFallbackOrder("translation"),
                localProviderModel: this.plugin.getLocalProviderDetectedModelSnapshot(this.plugin.settings.translation)
            },
            stats: {
                entries: this.plugin.diagnosticLogs.length,
                compressed: this.plugin.diagnosticCompressedCount,
                queueLength: this.plugin.autoTranslationQueue.length,
                inFlight: this.plugin.autoTranslationInFlight,
                inFlightItems: this.plugin.autoTranslationInFlightItems,
                pendingTargets: this.plugin.autoTranslationPendingTargets.size,
                cacheMemory: this.plugin.translationCache.size,
                cacheHits: this.plugin.translationCacheStats.hits,
                cacheMisses: this.plugin.translationCacheStats.misses,
                quickSettingsEntries: this.plugin.quickSettingsDiagnosticLogs.length
            },
            summary,
            interpretationChecklist: this.plugin.getDiagnosticInterpretationChecklist(),
            lastAutoTranslationDecisions: this.plugin.getLastAutoTranslationDecisionsSnapshot(120),
            quickSettings: this.plugin.quickSettingsDiagnosticLogs.map(entry => {
                const { groupKey, ...rest } = entry;
                return rest;
            }),
            logs: this.plugin.diagnosticLogs.map(entry => {
                const { groupKey, ...rest } = entry;
                return rest;
            })
        };
    }

    // options.keepLogged: the entries in memory were logged during start() before the stored log was loaded
    // (settings load, data move, a failed read). They are added after the stored entries instead of being
    // dropped, and the stored entries are never replaced by them on disk.
    loadDiagnosticLogs(options = {}) {
        const logged = options.keepLogged && Array.isArray(this.plugin.diagnosticLogs) ? this.plugin.diagnosticLogs : [];
        const loggedCompressed = options.keepLogged ? Math.max(0, Number(this.plugin.diagnosticCompressedCount || 0) || 0) : 0;
        const payload = this.plugin.loadData(DIAGNOSTIC_DATA_KEY);
        const logs = Array.isArray(payload) ? payload : payload?.logs;
        if (!Array.isArray(logs)) {
            this.plugin.diagnosticLogs = logged.slice(-DIAGNOSTICS_MAX_ENTRIES);
            this.plugin.diagnosticCompressedCount = loggedCompressed;
            return;
        }

        const stored = logs
            .map(entry => this.plugin.normalizePersistedDiagnosticEntry(entry))
            .filter(Boolean);
        this.plugin.diagnosticLogs = [...stored, ...logged].slice(-DIAGNOSTICS_MAX_ENTRIES);
        this.plugin.diagnosticCompressedCount = Math.max(0, Number(payload?.compressed || 0) || 0) + loggedCompressed;
        this.plugin.diagnosticLogsDirty = false;
        this.plugin.diagnosticLogsDirtyAt = 0;
        if (logged.length) this.plugin.scheduleDiagnosticLogsPersist();
    }

    createPersistedDiagnosticLogsPayload() {
        return {
            version: 1,
            savedAt: Date.now(),
            maxEntries: DIAGNOSTICS_MAX_ENTRIES,
            compressed: this.plugin.diagnosticCompressedCount,
            logs: this.plugin.diagnosticLogs.slice(-DIAGNOSTICS_MAX_ENTRIES).map(entry => {
                const compact = {
                    ts: entry.ts,
                    action: entry.action,
                    status: entry.status,
                    key: entry.key || "",
                    count: entry.count,
                    meta: entry.meta || {}
                };
                if (Number(entry.lastTs || 0) > Number(entry.ts || 0)) compact.lastTs = entry.lastTs;
                if (Number.isFinite(Number(entry.ms))) compact.ms = Number(entry.ms);
                return compact;
            })
        };
    }

    // Used once when the log moves to its own data file: keeps the entries of both copies (the old copy may
    // hold entries written by an older plugin version after a downgrade), oldest first, without duplicates.
    mergePersistedDiagnosticLogsPayloads(current, legacy) {
        const logsOf = payload => Array.isArray(payload) ? payload : Array.isArray(payload?.logs) ? payload.logs : null;
        const currentLogs = logsOf(current);
        const legacyLogs = logsOf(legacy);
        if (!legacyLogs) return current;
        if (!currentLogs) return legacy;
        const seen = new Set();
        const logs = [...legacyLogs, ...currentLogs]
            .filter(entry => entry && typeof entry === "object")
            .filter(entry => {
                const id = JSON.stringify([entry.ts, entry.lastTs, entry.action, entry.status, entry.key, entry.count]);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
            })
            .sort((left, right) => (Number(left.ts) || 0) - (Number(right.ts) || 0))
            .slice(-DIAGNOSTICS_MAX_ENTRIES);
        const compressed = count => Math.max(0, Number(count || 0) || 0);
        return {
            version: 1,
            savedAt: Date.now(),
            maxEntries: DIAGNOSTICS_MAX_ENTRIES,
            compressed: compressed(current?.compressed) + compressed(legacy?.compressed),
            logs
        };
    }

    scheduleDiagnosticLogsPersist(delayMs = DIAGNOSTICS_WRITE_DEBOUNCE_MS, options = {}) {
        const delay = Math.max(0, Number(delayMs) || 0);
        const persistAt = Date.now() + delay;
        this.plugin.diagnosticLogsDirty = true;
        if (!options.force && this.plugin.diagnosticLogsDirtyTimer && this.plugin.diagnosticLogsDirtyAt && this.plugin.diagnosticLogsDirtyAt <= persistAt) return;
        if (this.plugin.diagnosticLogsDirtyTimer) clearTimeout(this.plugin.diagnosticLogsDirtyTimer);
        this.plugin.diagnosticLogsDirtyAt = persistAt;
        this.plugin.diagnosticLogsDirtyTimer = setTimeout(() => {
            this.plugin.diagnosticLogsDirtyTimer = null;
            this.plugin.diagnosticLogsDirtyAt = 0;
            this.plugin.scheduleHeavyPersistenceIdle("diagnostics", () => this.plugin.flushDiagnosticLogs({ scheduled: true }));
        }, delay);
        this.plugin.unrefTimer(this.plugin.diagnosticLogsDirtyTimer);
    }

    flushDiagnosticLogs(options = {}) {
        if (!this.plugin.diagnosticLogsDirty) return true;
        if (!options.scheduled) this.plugin.cancelHeavyPersistenceIdle("diagnostics");
        if (options.scheduled && this.plugin.shouldDeferHeavyPersistence("diagnostics")) {
            this.plugin.scheduleDiagnosticLogsPersist(HEAVY_PERSISTENCE_DEFER_MS, { force: true });
            return true;
        }
        if (this.plugin.diagnosticLogsDirtyTimer) {
            clearTimeout(this.plugin.diagnosticLogsDirtyTimer);
            this.plugin.diagnosticLogsDirtyTimer = null;
        }
        this.plugin.diagnosticLogsDirtyAt = 0;
        try {
            if (this.plugin.saveData(DIAGNOSTIC_DATA_KEY, this.plugin.createPersistedDiagnosticLogsPayload()) !== true) throw new Error("DATA_SAVE_FAILED");
            this.plugin.diagnosticLogsDirty = false;
            this.plugin.diagnosticLogsPersistenceDeferredSince = 0;
            return true;
        }
        catch (error) {
            this.plugin.warnSanitized("Failed to persist diagnostic logs", error);
            this.plugin.diagnosticLogsDirty = true;
            if (options.retryOnError !== false) this.plugin.scheduleDiagnosticLogsPersist(30000, { force: true });
            return false;
        }
    }

    serializeDiagnosticLogs(format = "json") {
        const snapshot = this.plugin.getDiagnosticLogsSnapshot();
        if (format === "txt") {
            const lines = [
                `${snapshot.plugin} v${snapshot.version} diagnostics exported at ${snapshot.exportedAt}`,
                `route=${snapshot.route.guildId || ""}/${snapshot.route.channelId || ""}/${snapshot.route.messageId || ""}`,
                `entries=${snapshot.stats.entries} compressed=${snapshot.stats.compressed} queue=${snapshot.stats.queueLength} inFlight=${snapshot.stats.inFlight}`,
                `chatScrollerOverflowAnchor=${snapshot.layout?.chatScrollerOverflowAnchor || "unknown"}`,
                ""
            ];
            if (snapshot.summary?.humanSummary?.length) {
                lines.push("humanSummary:");
                snapshot.summary.humanSummary.forEach(item => {
                    lines.push(`  - ${item}`);
                });
                lines.push("");
            }
            if (snapshot.lastAutoTranslationDecisions?.length) {
                lines.push("lastAutoTranslationDecisions:");
                snapshot.lastAutoTranslationDecisions.slice(0, 24).forEach(entry => {
                    lines.push(`  [${entry.iso}] ${entry.state} reason=${entry.reasonCode || ""} provider=${entry.provider || ""} target=${entry.targetLanguage || ""} queue=${entry.queueType || ""} requests=${entry.requestCount || 0} validation=${entry.validationQuality || ""} failureClass=${entry.failureClass || ""} layer=${entry.failureLayer || ""} error=${entry.lastErrorType || ""} identity=${entry.messageIdentityHash || entry.identityHash || ""} text=${entry.textHash || ""}`);
                });
                lines.push("");
            }
            if (snapshot.interpretationChecklist?.length) {
                lines.push("interpretationChecklist:");
                snapshot.interpretationChecklist.forEach(item => {
                    lines.push(`  ${item.step}: ${item.read} -> ${item.meaning}`);
                });
                lines.push("");
            }
            snapshot.logs.forEach(entry => {
                const meta = Object.entries(entry.meta || {})
                    .map(([key, value]) => `${key}=${typeof value === "object" ? JSON.stringify(value) : value}`)
                    .join(" ");
                lines.push(`[${entry.iso}] x${entry.count} ${entry.action} ${entry.status}${entry.ms !== undefined ? ` ${entry.ms}ms` : ""}${meta ? ` ${meta}` : ""}`);
            });
            return lines.join("\n");
        }
        return JSON.stringify(snapshot, null, 2);
    }

    clearDiagnosticLogs() {
        const previousLogs = this.plugin.diagnosticLogs;
        const previousQuickLogs = this.plugin.quickSettingsDiagnosticLogs;
        const previousCompressedCount = this.plugin.diagnosticCompressedCount;
        const previousDirty = this.plugin.diagnosticLogsDirty;
        const previousDirtyAt = this.plugin.diagnosticLogsDirtyAt;
        const previousDecisions = this.plugin.lastAutoTranslationDecisions;
        if (this.plugin.diagnosticLogsDirtyTimer) {
            clearTimeout(this.plugin.diagnosticLogsDirtyTimer);
            this.plugin.diagnosticLogsDirtyTimer = null;
        }
        this.plugin.diagnosticLogs = [];
        this.plugin.quickSettingsDiagnosticLogs = [];
        this.plugin.lastAutoTranslationDecisions = new Map();
        this.plugin.diagnosticCompressedCount = 0;
        this.plugin.diagnosticLogsDirty = false;
        this.plugin.diagnosticLogsDirtyAt = 0;
        try {
            if (this.plugin.saveData(DIAGNOSTIC_DATA_KEY, this.plugin.createPersistedDiagnosticLogsPayload()) !== true) throw new Error("DATA_SAVE_FAILED");
            this.plugin.showToast(this.plugin.t("diagnosticLogsCleared"), "success");
            return true;
        }
        catch (error) {
            this.plugin.diagnosticLogs = previousLogs;
            this.plugin.quickSettingsDiagnosticLogs = previousQuickLogs;
            this.plugin.lastAutoTranslationDecisions = previousDecisions;
            this.plugin.diagnosticCompressedCount = previousCompressedCount;
            this.plugin.diagnosticLogsDirty = previousDirty;
            this.plugin.diagnosticLogsDirtyAt = previousDirtyAt;
            if (previousDirty) {
                const remainingMs = previousDirtyAt ? Math.max(0, previousDirtyAt - Date.now()) : DIAGNOSTICS_WRITE_DEBOUNCE_MS;
                this.plugin.scheduleDiagnosticLogsPersist(remainingMs);
            }
            this.plugin.showToast(this.plugin.formatError(error), "error");
            return false;
        }
    }

    logAutoTranslationIntakeState(status, intake = {}) {
        this.plugin.logDiagnostic("auto.intake", status, {
            ...this.plugin.getDiagnosticBaseMeta("auto", "intake", intake.reason || ""),
            mode: intake.mode || "",
            source: intake.source || "dom",
            bdfdbAvailable: Boolean(intake.bdfdbAvailable),
            domCandidates: Number(intake.domCandidates || 0),
            bdfdbEnhanced: Number(intake.bdfdbEnhanced || 0),
            bdfdbOnlySkipped: Number(intake.bdfdbOnlySkipped || 0)
        });
    }
}

module.exports = { DiagnosticsRecorder };
