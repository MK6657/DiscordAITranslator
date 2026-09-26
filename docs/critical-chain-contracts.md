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
- API requests never follow redirects, including same-origin or local-provider redirects. Users must configure the final trusted endpoint explicitly; checking only the initial URL is insufficient to protect message bodies and provider headers.
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
- Disconnected, changed, or reused targets never receive new translation, loading, or failure lines. Their only DOM writes are cleanup: `removeAutoTranslationNode` removes the stale automatic line on them and restores the source text it hid.
- Model results, loading placeholders, and failure lines are written only to targets that are visible in the chat viewport when the write happens. A model result for a target outside the viewport may still be cached; it is then drawn through the cache path below, not by the request.
- Cached translations are the one exception to visibility (render tasks of kind `cache`, including the cached-draw pass added in v0.3.0). They need no model request and may be drawn on connected targets anywhere within the draw buffer around the visible chat (`getCachedDrawBufferPx`: `AUTO_TRANSLATE_CACHE_DRAW_BUFFER_FACTOR` times the chat height, at least `AUTO_TRANSLATE_CACHE_DRAW_MIN_BUFFER_PX`), so messages that Discord mounts just above and below the chat already show their line when they scroll into view. Without layout information the check falls back to strict visibility. Targets beyond the buffer are skipped and checked again on a later pass. Do not reintroduce a strict viewport check for cache draws.
- The cached-draw pass only reads the cache and never starts a model request. It walks mounted messages nearest to the visible chat first, always including every visible message, within a small time budget per idle callback. It does not run while the media viewer, quick settings, or Discord settings are open.
- Stillness rule: cache draws and the cached-draw pass wait until the chat scroller has had no external scroll event for `AUTO_TRANSLATE_SCROLL_STILL_MS`. Scroll corrections are never written while the chat is moving: `getTranslationScrollSnapshot` then returns no snapshot, so a line rendered during that time (for example a manual translation that arrives mid-scroll) is inserted without a correction. That correction is skipped, not deferred, and nothing retries it later. Cache draws skip the scroll render pause, viewport settle, and jump cooldown that still hold back request renders, but they still wait for the media viewer and a busy composer.
- Scroll correction depends on where the new line is inserted relative to the visible chat. Above it, what is visible stays in place (anchored on the message's bottom edge). Inside it, the translated message text stays in place. Below it, nothing is corrected. A chat pinned to its newest message stays pinned. When native scroll anchoring or clamping has already moved the chat, no second correction is written, and the plugin's own corrections are not treated as user scrolling.
- Scroll and media-viewer pauses may defer rendering without discarding valid cacheable results.
- Regression for the cache-draw, stillness, and scroll-correction rules: `tests/core/scroll-cache-draw.test.js`.

## Cache

- Cache identity includes the request configuration snapshot and message identity.
- Partial, invalid, volatile-identity, or provider-fallback results do not enter inappropriate persistent/shared caches.
- TTL, capacity pruning, compact-codec recovery, and persistence failures preserve valid in-memory state.

## Lifecycle

- Repeated `start()` calls are idempotent.
- Partial startup failure rolls back observers, patches, listeners, timers, and styles.
- Stop prevents late promises from mutating DOM, health state, cache, or fallback state.
- Stop/start on one instance retries dirty persistence without loading over unsaved state.

## Installer

- Failure before destination replacement (including backup collisions and copy failures) leaves the existing plugin untouched.
- Failure after replacement restores the previous plugin from its backup, or removes the newly installed file when no previous plugin existed.
- A window whose AppData writes are redirected into an app package (for example a terminal inside a packaged desktop app) installs nothing. The installer warns that a normally started Discord will not see the install and exits with code 2, also under `-WhatIf`, unless `-AllowRedirectedAppData` is given. The post-install hash check reads through the same redirected view, so it cannot catch this. Regression: `scripts/test-install-plugin.ps1`.
