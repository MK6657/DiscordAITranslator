# Architecture

## Distribution Model

BetterDiscord users install one file: `DiscordAITranslator.plugin.js`. Contributors edit `src/`, and esbuild bundles the CommonJS entry into that root artifact. The generated file is committed so release users do not need Node.js.

```text
src/index.js
  -> src/discord-ai-translator.js
     -> settings/settings-schema.js
     -> composer/composer-writer.js
     -> auto-translation/translation-renderer.js
     -> auto-translation/{queue-core,request-pipeline,task-state}.js
     -> settings/settings-store.js
     -> providers/provider-layer.js
     -> cache/translation-cache-store.js
     -> validation/output-guard.js
     -> diagnostics/diagnostics-recorder.js
     -> constants.js / styles.js / i18n.js
  -> npm run build
  -> DiscordAITranslator.plugin.js
```

The build must preserve the BetterDiscord metadata comment at byte 0 and export the plugin class directly through CommonJS.

## Current Modules

All extracted modules follow the facade-delegation rule from `docs/refactor-direction-2026-07-26.md`:
the main class keeps one-line delegators for every moved method, and module code calls other
subsystems only through `this.plugin`, so the (test-visible) class surface is unchanged.

- `constants.js` owns the shared module-scope constants (provider defaults/capabilities, settings defaults, tuning values).
- `styles.js` owns the static plugin stylesheet; `i18n.js` owns the zh-CN/en string tables.
- `settings/settings-store.js` (`SettingsStore`) owns settings persistence, migration/shape enforcement, task config resolution and prompt-template CRUD.
- `settings/settings-schema.js` (`SettingsSchema`) owns settings navigation metadata and provider capability filtering.
- `providers/provider-layer.js` (`ProviderLayer`) owns the provider registry, endpoint safety policy, request builders/parsers, error mapping, fallback policy, Google key pool and local-provider health. `runModelTaskWithResult` resolves an explicit TranslationResult (`{ text, fallbackProvider }`); `runModelTask` is its string-typed facade.
- `cache/translation-cache-store.js` (`TranslationCacheStore`) owns cache keys/aliases, TTL, the compact codec, negative lookups and persistence.
- `validation/output-guard.js` (`OutputGuard`) owns model-output validation (emoji token integrity, leakage/refusal/dictionary/labeled shapes, Chinese script checks).
- `diagnostics/diagnostics-recorder.js` (`DiagnosticsRecorder`) owns diagnostics recording, aggregation, meta builders and persistence.
- `composer/composer-writer.js` (`ComposerWriter`) owns last-write-wins coordination for Discord composer updates.
- `auto-translation/queue-core.js` (`AutoTranslationQueueCore`) owns auto-translation queue state, scheduling, failures, decisions, channel policy and timing windows.
- `auto-translation/request-pipeline.js` (`AutoTranslationRequestPipeline`) owns scan work, batch/long-text request flows, retries, request options and text eligibility policies.
- `auto-translation/task-state.js` (`AutoTranslationTaskState`) is a passive read-only view over the auto-translation collections (per-key snapshots + invariant checker); storage is unchanged and the phase 6 state machine will migrate collections behind this view.
- `auto-translation/translation-renderer.js` (`TranslationRenderer`) owns render-task keys, defer timing, heavy-task classification, and queue ordering.
- `MessageTracker` remains in the main source because Discord Store/DOM identity is a critical compatibility boundary.
- `TranslationScheduler` remains in the main source because it currently coordinates several in-flight and visibility states.
- Candidate intake, DOM rendering/line management and observers remain in the main source for the phase 7 Discord-adapter boundary.

## Next Extraction Order

Phases 1-5 plus the phase 6 pre-steps (queue core / request pipeline moves, task-state view)
are complete. Remaining, in order — both gated on real-host acceptance of the current state:

1. Phase 6 proper: migrate the parallel automatic-translation collections one at a time behind
   the `AutoTranslationTaskState` view until a single task state machine remains.
2. Phase 7: move Discord observer, candidate intake, message identity, and DOM rendering behind
   a Discord adapter.

Each phase must keep the generated artifact regression suite green before the next phase starts.
