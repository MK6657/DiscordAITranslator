# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.3.0 - 2026-09-25

Pre-release: offline, installer and artifact checks pass; live Discord acceptance of the scrolling changes is pending.

- Draw cached translations as soon as the chat has been still for about 0.1 s, including messages Discord keeps mounted just above and below the visible chat, instead of waiting out the 0.55 s scroll pause, the 0.45–0.9 s settle window or the 2.2 s jump cooldown. A bounded idle-time pass (about 3 ms, memoised per Discord message ID) does this without model requests; new model requests keep the existing pauses.
- The scan and the draw step now share one definition of "visible", so messages behind the channel header or message box are no longer marked for drawing and then rejected.
- Scroll corrections depend on where the line lands: above the visible chat the visible part stays in place, below it nothing changes, and a chat pinned to its newest message stays pinned. The plugin's own corrections no longer count as user scrolls.
- Show the version in the settings header, the start notification, settings snapshots and diagnostics exports. `npm run plugin:check` compares the installed plugin with the repository build and detects private BetterDiscord copies kept by packaged apps, redirected AppData writes and a Discord that will not load BetterDiscord; the installer prints the installed and replaced versions.
- Diagnostics exports record whether Discord's chat scroller uses native scroll anchoring. The build embeds only the version from package.json, and source checks keep package-lock.json in step.
- Allow 1–10 automatic translation requests for both local and cloud providers; preserve saved values and explain local server capacity in settings.

- Explain and disable unavailable local-provider scheduling controls (fixed DOM discovery and cloud fallback), instead of accepting changes that silently revert or have no effect.
- Distinguish request cancellation from timer expiry using explicit error codes and localized messages. Cancelled model discovery and long-text rescue no longer continue with new requests; cancelled work does not penalize provider health or populate failure records. Reject late responses from transports that ignore abort.
- Localize invalid/unsafe endpoint errors and classify them as configuration/client failures; retain the actual timeout message for local-provider timeouts.
- Refuse new API requests after the plugin stops until it starts again, so retry, rescue and provider-fallback loops cannot send message text once disabled. A cancelled fallback attempt now ends the fallback chain instead of trying the next provider.
- Apply the local provider's fixed message-intake mode when switching providers from the settings panel, so the locked control always shows the value actually in effect.
- Draw cached translations again when Discord rebuilds messages during scrolling. A recent render now only blocks a duplicate model request; it no longer hides a cached translation for up to 60 seconds, which also affected other messages with the same text.
- Allow nearby-message prefetch for local providers. As with cloud providers, prefetch uses one spare request slot only while no visible message is waiting, so it needs a concurrency of 2 or more.
- Add a settings snapshot download under Diagnostics for troubleshooting: switches and numbers as-is; API keys and other secrets hidden; remote endpoint query strings and embedded credentials removed; prompts summarized; channel IDs hashed.

- Reject all API redirects so only explicitly configured endpoints receive translation text and provider headers; cover HTTP 301/302/303/307/308 with real loopback HTTP fixtures against both source and generated artifact. Configure canonical endpoint URLs directly.
- Fix installer error cleanup deleting the original plugin when a backup collision occurs before replacement. Roll back only after this installation has replaced the destination; add collision-preservation and failed-first-install cleanup regressions.
- Refresh GitHub CI actions to verified, full-SHA-pinned checkout v7.0.1 and setup-node v7.0.0, disable persisted checkout credentials, and bound job runtime. Core test discovery now includes all *.test.js files.
- Follow-up from the first GitHub Windows CI run: importing Utility alone did not resolve Get-FileHash on hosted runners. Compute installer SHA256 through disposable .NET streams instead; installer fixtures deliberately make Get-FileHash unavailable to prevent regression. Runtime plugin output remains unchanged.
- Repository intake (2026-09-08): explicitly load the PowerShell Utility module in the installer and its test entry point so fresh Windows PowerShell processes resolve Get-FileHash reliably. Add Chinese/English repository documentation and preserve the July c snapshot as the runtime baseline; no plugin runtime behavior or version change.
- Modularization phase 6 pre-steps: the auto-translation queue core (state, scheduling, failures, decisions, channel policy, timing windows — 142 methods) moves to `src/auto-translation/queue-core.js` and the request pipeline (scan work, batch/long-text requests, retries, request options, text eligibility — 98 methods) to `src/auto-translation/request-pipeline.js`, both as behavior-preserving facade delegations; DOM rendering, candidate intake and observer code intentionally stay in the main file for the phase 7 adapter boundary. A passive read-only task-state view (`src/auto-translation/task-state.js`) now exposes unified per-key snapshots and an invariant checker over the parallel collections, with lifecycle regressions asserting consistency across enqueue/take/in-flight/finish/remove and the render queue — the seam the phase 6 state machine will migrate collections behind. Main source shrinks further to ~13,900 lines.
- Modularization phases 1-5 (see `docs/refactor-direction-2026-07-26.md`): shared constants move to `src/constants.js`; the model-task core now resolves an explicit TranslationResult value (`runModelTaskWithResult`, replacing the shared-promise stamping side channel while `runModelTask` keeps its string-typed surface); settings persistence/migration/task-config/prompt-template CRUD move to `src/settings/settings-store.js`; the provider layer (registry, endpoint policy, request builders, parsers, error mapping, fallback policy, Google key pool, local-provider health) moves to `src/providers/provider-layer.js`; the translation cache (keys, aliases, TTL, compact codec, negative lookups, persistence) moves to `src/cache/translation-cache-store.js`; output validation moves to `src/validation/output-guard.js` and diagnostics recording/persistence to `src/diagnostics/diagnostics-recorder.js`. All extractions are facade delegations — the main class keeps its full method surface and every cross-subsystem call routes through it — so runtime behavior and the regression-suite contract are unchanged. Main source shrinks from ~26,000 to ~18,300 lines.
- Honor `ui.autoTranslateIntakeMode` in the incremental message scan: BDFDB/store identity enrichment and store-full text upgrades now apply to the primary scan path (previously only cache-only scans and history backfill saw them), intake diagnostics report the real configured mode, and the one-store-snapshot-per-scan constraint is preserved across idle slices. Covered by new differential parity regressions against the one-shot candidate path.
- Extract the static stylesheet to `src/styles.js` and the interface string tables to `src/i18n.js` (verbatim moves, phase 0.5 of the modularization plan in `docs/refactor-direction-2026-07-26.md`); the main source shrinks by ~3,100 lines with byte-identical style content and unchanged string tables.
- Fix Baidu translation of multi-line messages: previously only the first line's translation survived and batched requests could shift translations onto the wrong messages; request rows are now tracked per message and regrouped on parse.
- Render translations for messages that mix custom emoji with plain `:text:` tokens (such as times like `12:30:45`), which previously suppressed the whole translation; exact emoji restoration is still required, and unrestorable emoji now also drop the stale cache entry instead of marking the message rendered.
- Keep provider-fallback results out of the primary provider cache when concurrent identical requests share one response (deduplicated callers now see the fallback marker).
- Allow provider fallback and restore request success/error diagnostics for public bilingual input when it runs on the polish provider profile, and for provider-fallback requests themselves.
- Invalidate cached message text for content mutations that arrive while media-viewer quiet mode is active, so a message edited behind the viewer cannot keep serving its pre-edit translation.
- Only reset the active prompt template and invalidate queued work when the deleted template is the active one.
- Stop the settings test-run from temporarily mutating live prompt settings; the test prompt is now passed as a per-request override.
- Include the language pair in direct-translate request deduplication keys (Google/DeepL/Baidu) so same-text requests with different target languages never share one result.
- Expire terminal auto-translation failures after six hours and cap the per-message failure map, preventing unbounded growth in long sessions.
- Clear recent-render suppression, provider notice timestamps, and composer action groups on stop so a restart re-renders translations immediately and leaves no orphan DOM.
- Reduce scroll-time layout work: queue sorts compute each item's rank once instead of per comparison, full request batches skip per-item readiness DOM checks, Discord theme lookups are briefly memoized, diagnostics decisions resolve the queue type once, and zh-CN interface strings moved from a per-call fallback object into the locale table.
- Remove unreachable legacy code paths and unused settings-tab helpers left over from earlier refactors.

- Keep Discord scrolling and selection responsive by avoiding layout-heavy visibility probes, cloning message DOM only as a fallback, caching extracted text until relevant mutations, and skipping scans for presentation-only changes.
- Bound Sakura local translation to one active request and reuse one Discord message-store snapshot per scan.
- Reduce diagnostic persistence overhead with high-volume event aggregation, a 500-entry cap, compact records, delayed idle writes, and immediate cleanup when diagnostics are disabled.
- Rebind observers after Discord replaces the chat root and idle-slice message work for local, cloud, and manual-button-only modes.
- Skip known low-information repeated utterances while preserving explicit Turkish input, and reject explanatory model output that asks for more context instead of translating.
- Require Discord custom emoji tokens to match the source exactly before rendering or caching, and suppress the whole translation if an emoji image cannot be restored.

## 0.2.0 - 2026-07-13

- License the project under MIT and document contribution provenance requirements.
- Complete the GPL reference similarity review with a low-risk, independent-implementation decision.
- Raise the supported contributor and CI baseline to Node.js 22 and 24.
- Pass the first Windows 11 Discord Stable and BetterDiscord load, settings, and lifecycle smoke test.
- Render preserved Discord custom emoji tokens as cloned emoji images and drop unmappable duplicates.
- Establish `src/` as canonical source and keep the root BetterDiscord plugin as a reproducible generated artifact.
- Add locked npm builds, focused module tests, Windows CI, installer fixture tests, and release gates.
- Extract settings schema, composer write coordination, and translation render scheduling helpers.
- Prevent duplicate lifecycle startup and block settings persistence after a failed settings read.
- Add automatic translation scheduling, cache persistence, diagnostics, long-text rescue, channel policy, history backfill, and multiple translation providers.
- Isolate fallback credentials and prevent fallback results from contaminating the primary provider cache.
- Reject unsafe remote HTTP endpoints and embedded URL credentials.
- Prevent settings read failures from overwriting saved configuration.
- Add manual translation request ownership, exact source checks, and configuration snapshots.
- Add transactional BetterDiscord profile enablement and rollback to the Windows installer.
