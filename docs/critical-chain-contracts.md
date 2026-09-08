# Critical-Chain Contracts

These contracts are release gates for refactoring. A change that intentionally alters one must update this document and add a focused regression.

## Settings

- A failed settings read must never persist defaults over saved configuration.
- Settings remain write-blocked until a later successful load or an explicit user reset flow.
- Failed saves retain dirty in-memory state for a later retry.
- Provider, endpoint, model, language, prompt, and related identity changes invalidate stale queued/render work.

## Providers and Requests

- Identical active requests may share one promise.
- Remote endpoints require HTTPS; only loopback endpoints may use HTTP.
- Stop aborts active requests, and stale lifecycle results do not start fallback work.
- Fallback is limited to manual translation and public bilingual translation.
- Automatic translation, polishing, and local providers never fall back to cloud implicitly.
- Each fallback provider uses only its own credential profile.
- Fallback results do not populate the primary provider cache namespace.

## Manual Translation

- A precise Discord message identity or one unique compatible Store candidate may replace incomplete DOM source text.
- The last request for a message wins.
- Before commit, the lifecycle, request owner, configuration version, provider snapshot, DOM text, and message identity must still match.
- Edited or reused Discord DOM nodes reject stale results.

## Automatic Translation and Rendering

- Queued, pending-target, in-flight, and render-pending work all participate in active deduplication.
- Results commit only while configuration, route, in-flight token, source text, and message identity remain current.
- Manual translations take precedence over automatic render tasks.
- Disconnected, changed, reused, or out-of-viewport targets do not receive immediate DOM writes.
- Scroll and media-viewer pauses may defer rendering without discarding valid cacheable results.

## Cache

- Cache identity includes the request configuration snapshot and message identity.
- Partial, invalid, volatile-identity, or provider-fallback results do not enter inappropriate persistent/shared caches.
- TTL, capacity pruning, compact-codec recovery, and persistence failures preserve valid in-memory state.

## Lifecycle

- Repeated `start()` calls are idempotent.
- Partial startup failure rolls back observers, patches, listeners, timers, and styles.
- Stop prevents late promises from mutating DOM, health state, cache, or fallback state.
- Stop/start on one instance retries dirty persistence without loading over unsaved state.
