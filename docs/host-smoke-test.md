# Windows Host Smoke Test

## v0.6.1 verification checkpoint (2026-11-28)

- **Repository release tag (`v0.6.1`)**:
  - Built artifact: `2,789,740` bytes, SHA256 `1220CD53E8FB6D195C68DC8B6896FE9BB358FCDD7EB22360BF59D5B87E4352D6`.
  - Host inspection (`npm run plugin:install` + `npm run plugin:check`): plugin `v0.6.1` installed and enabled in `BetterDiscord/data/stable/plugins.json`, matching repository build `v0.6.1`.
  - Features & fixes included: full-repository 6-domain audit hardening across all 97 `src/` modules (`tests/core/v060-audit-fixes.test.js`), IPv6-mapped IPv4 HTTP block & bare IPv6 origin preservation, credential-isolated `activeProviderRequests` dedupe & Google Cloud isolated fallback key-pool routing with Pacific month rollover reset, `outputTruncated` fallback/batch/rescue short-circuiting & bounded long-text chunking (`LONG_TEXT_MAX_CHUNKS`), per-editor `WeakMap` composer polish sessions & Slate remount recovery, multi-pane `preDrawVisibleCachedTranslations(cacheKey)` & split-view observer reconciliation, live in-place 6-locale/RTL dialog & popover refresh (`ConfirmDialog`, `PromptManager`, `HostHealthCard`, `QuickPanel`), atomic multi-profile rollback in `scripts/install-plugin.ps1`, strict `no-unused-vars` ESLint across `src/`/`scripts/`/`tests/`, and **100% TypeScript `checkJs` coverage across all 97 `src/` modules** (`src/types/plugin-globals.d.ts`).
  - Automated checks passed: `npm run release:check` (source checks across 175 JS files, ESLint, `tsc -p jsconfig.json --noEmit` across 97/97 `src/` modules, `build:check`, 790 core unit tests, 9 modular artifact regression suites, Windows installer rollback & live-watcher race tests, and BetterDiscord dual-sandbox artifact check).
- **Previous release tag (`v0.6.0`, commit `e3238c4`, archived on `backup/v0.6.0`)**:
  - Built artifact: `2,655,653` bytes, SHA256 `1862D6ED791607D5B6A89BB00985D78F291B5BA6A509B82C5F1BFA908C49B2EA`.
  - Host inspection (`npm run plugin:install` + `npm run plugin:check`): plugin `v0.6.0` installed and enabled in `BetterDiscord/data/stable/plugins.json`, matching repository build `v0.6.0`.
  - Features & fixes included: mainline 6-language UI (`zh-CN`, `zh-TW`, `en`, `ru`, `ar` RTL, `es`) with modular `src/i18n/*` dictionaries (750 keys × 6 locales + 110 diagnostic labels × 6 locales), three native-script quick language switcher bars (Quick Panel, Settings Header, Overview tab), full Arabic `dir="rtl"` layout mirroring with LTR technical token isolation, multi-script settings search (Cyrillic word-start, accent-folded Spanish, diacritic-folded Arabic, CJK), user-configurable `maxTokens` (`1`–`65536`) with truncation guidance, `ComposerWriter.activeWriteTokens` key resolution, IME composition search guards, Polish Result Panel channel-mismatch lock, stale Settings tabpanel rebuilds & launcher focus restoration, and holistic provider/pipeline/DOM hardening (`tests/core/post-v053-holistic-audit.test.js`, `tests/core/multilang-ui-and-rtl.test.js`).
  - Automated checks passed: `npm run release:check` (source checks across 174 JS files, ESLint, `tsc -p jsconfig.json --noEmit`, `build:check`, 784 core unit tests, 9 modular artifact regression suites, Windows installer rollback & live-watcher race tests, and BetterDiscord dual-sandbox artifact check).
- **Previous release tag (`v0.5.3`, commit `db7da77`, archived on `backup/v0.5.3`)**:
  - Built artifact: `2,301,285` bytes, SHA256 `6C75936804719E455BC375F5EF8E0FBE15B94CB91DB630E57EF965A74AA0BE55`.
  - Host inspection (`npm run plugin:install` + `npm run plugin:check`): plugin `v0.5.3` installed and enabled in `BetterDiscord/data/stable/plugins.json`, matching repository build `v0.5.3` (`Discord Stable app-1.0.9270`; BetterDiscord core files present in `%APPDATA%\BetterDiscord`, startup hook cleared by Discord client update from `1.0.9269` to `1.0.9270`).
  - Fixes included: pure-JS RFC 1321 MD5 fallback (`md5HexFallback`) for Baidu signing in restricted BetterDiscord sandboxes + single-pass HTML entity decoding, `API_REDIRECT_BLOCKED` classification + `fetchViaBetterDiscordNet()` same-origin redirect blocking + `subscribeToProviderRequest()` sync-throw cleanup + `TimeoutError` separation, Google Cloud cross-key dedupe + `America/Los_Angeles` quota/cooldown window alignment + whitespace/case-tolerant placeholder restoration, `EventBus.off()` `once` removal + `start()`/`stop()` persistence ordering + custom `applyCacheScope` `promptPolicyVersion` preservation + recursive nested-object diagnostic sanitization + URL query/fragment secret redaction, hardened `@everyone`/`@here` mass-mention guard + wrapper-stripping protection for `《...》`/code fences/JSON + emoji shortcode timestamp false-positive filtering + `\p{Script=Latin}`/`\p{Script=Han}` validation + long-text code-only chunk pass-through & surrogate-safe splitting, multi-pane lowest-common-ancestor `ChatObserver` + `.dait-translation-line` timer disposal & hidden-source recovery + composer menu keyboard navigation & viewport clamping + live-Discord `fs.watch` disable-race recovery in `scripts/install-plugin.ps1`.
  - Automated checks passed: `npm run release:check` (source checks, ESLint, `tsc -p jsconfig.json --noEmit`, `build:check`, 767 core unit tests, 9 modular artifact regression suites, Windows installer rollback & live-watcher race tests, and BetterDiscord dual-sandbox artifact check including RFC 1321 MD5 vectors).
- **Previous release tag (`v0.5.2`, commit `35c1d4f`)**:
  - Built artifact: `2,261,318` bytes, SHA256 `59BC726D76A316A26FE7887AEB224382448BE6A629DB87A49A6A14F72E7D2ED6`.
  - Host inspection (`npm run plugin:check`): Discord Stable `app-1.0.9269` with BetterDiscord core present (`resources/app hook (BD 1.14+)`), plugin installed and enabled in `BetterDiscord/data/stable/plugins.json`, matching repository build `v0.5.2`, and verified live on host.
  - Fixes included: custom `ProviderRegistry` secret redaction in snapshots/diagnostics and structured sanitization of object arrays in `sanitizeDiagnosticMeta()`, custom-credential cleanup in `syncTaskServiceConfig()` and live active-provider credential overlay in `getProviderFallbackConfig()`, custom adapter default UI capabilities / model defaults / local health probe parser / cache scope / `translateAsArray` dedupe key isolation, Google Cloud connection-test abort & status race guards on `googleTranslate.keyPoolText` edits, public-bilingual output sanitization + shared `MANUAL_TRANSLATION_REQUEST_BUDGET` + per-attempt `fallbackProvider` reset across public-bilingual / manual rescue / long-text chunk rescue, multi-fence code-only detection + nested-fence & contraction-apostrophe output extraction guards + `404`/`providerModelNotFound` batch retry short-circuit, manual-line protection in `renderAutoTranslationFailure()`, `long-text` cache key matching in `retryAutoTranslationTarget()`, deferred scan resume on Discord settings close, `stop()` unblurred control persistence without leaking `settingsDirtyTimer`, and `%APPDATA%` redirect probe hardening in `scripts/check-installed-plugin.ps1`.
  - Automated checks passed: `npm run release:check` (source checks, ESLint, `tsc -p jsconfig.json --noEmit`, `build:check`, 755 core unit tests, 9 modular artifact regression suites, Windows installer rollback tests, and BetterDiscord dual-sandbox artifact check) plus `npm run test:integration`.
- **Previous release tag (`v0.5.1`, commit `1d8a92a`)**:
  - Built artifact: `2,243,164` bytes, SHA256 `B5B1C28B47EC52B86839D1E6746B6E260E27182E3C8C11D1297F2DAD92F3046E`.
  - Automated checks passed: `npm run release:check` (746 core unit tests, 9 modular artifact regression suites, Windows installer rollback tests, BetterDiscord dual-sandbox artifact check) plus `npm run test:integration`.
- **Previous release tag (`v0.5.0`, commit `99acf80`)**:
  - Built artifact: `2,200,450` bytes, SHA256 `EF80ADB6C5271C9D99674BA7382DE3243CC0874246E5E2176F514A7011FE13A9`.
  - Host inspection (`npm run plugin:check`): Discord Stable `app-1.0.9269` with BetterDiscord core present (`resources/app hook (BD 1.14+)`), plugin installed and enabled in `BetterDiscord/data/stable/plugins.json`, matching repository build `v0.5.0`.

## Maintenance checkpoint (2026-10-22)

The current handoff branch is `codex/maintenance-v0.4.0-2026-10-22`, with runtime code and artifact unchanged from `2fe3f0c` (1,782,270 bytes; SHA256 `ed718cac37b2bc1bcf5032c46647b2ee60e65ccd20cf20b00c5ce7226abd4570`). That source commit passed Windows Node 22/24 CI on September 26. The nine v0.4.0 live-host acceptance rows below remain Pending; this checkpoint is not a host acceptance result.

Read-only inspection found a different, older v0.4.0 installed artifact (1,765,243 bytes; SHA256 `256a3dcae5427020e5057800622cd655476a04c7c2c5b6b0b1cd15f9e1b481fd`) and no BetterDiscord hook in the current Discord Stable 1.0.9262 startup file. Source review and in-memory checks confirmed three open issues: generated mass mentions, cooldown records cleared on runtime cancellation, and automatic retries without a total attempt budget. See the [maintenance handoff](maintenance-handoff-2026-10-22.md) for evidence, reproduction, repair criteria and remaining review leads. No messages were sent and the host was not changed for this inspection.

## Current snapshot status (2026-09-26)

v0.4.0 is a pre-release with **no live-host acceptance yet**. Its pending checklist is the [last section of this file](#v040-pending-acceptance-2026-09-26); nothing in it has a result. v0.3.0 was not accepted on a live host either. The September 8 records below cover a limited local-model smoke test of an older artifact, and the July record applies only to its explicitly identified v0.2.0 artifact. Local offline/installer tests are documented in [repository-intake-2026-09-08.md](repository-intake-2026-09-08.md) and, for v0.4.0, in the [optimization handoff](optimization-handoff.md).

## 2026-09-08 — adjustable concurrency follow-up

- Local and cloud concurrency now support 1–10. Installed artifact: 1,340,800 bytes; SHA256 `4AC8EC6D99BEC51ECB98E8FF45D347E86D00FA8DBF54478BC23E851A8DCBEC7C`.
- Complete `release:check` passed, including a scheduler regression proving ten active local requests and an eleventh waiting for capacity.
- In Discord, edited local concurrency to 10 and verified the rendered value and persisted JSON; restored the original value 1 afterward. Automatic translation remained off. This verifies control persistence, not ten-way live model throughput.
- The fixed-concurrency record below describes the superseded artifact.

## 2026-09-08 — settings and cancellation follow-up

- Final updated artifact: 1,340,766 bytes; SHA256 `245A4573954F2A043D82653D74C02BA0403E538F11C904371D50653921E48AB9`.
- Verified the reported prefetch dropdown opened before the change. The confirmed issue was silent enforcement of local-provider constraints, not a reproduced native dropdown rendering failure.
- Updated settings now display explicit reasons and disable unavailable local prefetch/range, fixed DOM discovery, concurrency 1 and cloud fallback controls. Normal language dropdown opens and switches the rendered interface to English.
- Installed the final artifact with backups; BetterDiscord disabled the plugin during replacement, so it was explicitly re-enabled. Verified three successful enables separated by two disables, with settings unavailable while disabled and available after each enable. This is not a stop-during-inference test.
- Full `release:check` passed, with 8 additional request/cancellation tests (23 core tests total) and the existing complete plugin and installer regressions. Real local synthetic English/Japanese/formatting translations also passed with the updated source.
- Remaining host scenarios from the local-model setup record still apply. No stable release or claim of full acceptance.

## 2026-09-08 — local Hy-MT2 setup and limited smoke test

Environment and artifact:

- Windows build 10.0.26200; Discord Stable 1.0.9256; BetterDiscord 1.14.1 (94526616).
- Repository HEAD: `5a4d956`; no plugin source or artifact changes needed for this setup.
- Plugin SHA256: `155F16DCC1D50EFDE4D49B9FA299C8110ABEF8F64BD23A50DF2DA1CEFC729D69`.
- Sakura Launcher 1.2.0-beta, llama.cpp b10453 Vulkan, AMD Radeon RX 6750 GRE 12GB.
- Model: `Hy-MT2-1.8B-Q4_K_M.gguf`.

Setup performed:

- Installed BetterDiscord using the official CLI 1.0.0; its Windows archive matched the published SHA256. The CLI restarted Discord successfully.
- Backed up the launcher configuration and original Discord core entry outside this repository.
- Port 8080 was occupied by Docker/WSL. Saved launcher preset 1 with loopback port 18080, context 6144, and parallelism 1, then started the model through the launcher. Verified the new listening process and model metadata.
- Installed the unchanged plugin and created local provider settings for translation and polish. Model selection is `local-model` (automatic detection); message target is Chinese, polish target is English. API key is empty. Automatic translation, prefetch, history backfill and cloud fallback remain disabled.

Passed:

- Full `npm run release:check`, including build consistency, source/core/plugin tests, isolated installer rollback tests, and artifact checks.
- Real loopback model discovery and synthetic English/Japanese translation requests through the plugin code. Short synthetic cases took approximately 0.1–0.6 seconds after startup; this is a small smoke sample, not a benchmark.
- Synthetic Markdown, URL, inline-code and numbered-list examples produced readable Chinese and preserved those structures.
- Discord discovered and enabled the plugin; settings rendered and showed the configured local endpoint.
- The API test inside Discord displayed a successful connection.
- Message translation buttons and the composer action were visible. One short existing message was manually translated through the local endpoint and its Chinese result appeared above the original.
- No Discord message was sent and no cloud translation provider was used.

Limits and remaining checks:

- One repetitive 1176-character synthetic request returned Chinese but did not reliably retain every repetition; do not interpret basic request success as long-text completeness or translation-quality acceptance.
- Automatic translation, rapid scrolling/channel switching, edit/delete races, custom emoji recovery, composer writes, public bilingual output, repeated lifecycle cycles and stop-during-request remain untested on this host.
- The known cancellation-versus-timeout classification issue remains unchanged.
- This is a working local setup and limited smoke test, not stable-release acceptance.

To resume: start Sakura using saved preset 1 (port 18080, context 6144, parallelism 1), keep the model server running, then use the message translation button in Discord. The service URL is `http://127.0.0.1:18080/v1/chat/completions`.

## 2026-07-13

Environment:

- Windows 11 Pro x64, build 10.0.26200
- Discord Stable 1.0.9242
- BetterDiscord injected into Discord Stable
- Discord AI Translator 0.2.0 artifact SHA256: `1C353609BE53A304AD156E578CC0BB8C63A64B59EEDFF529A2E9918C3D1905EF`

Safety boundary:

- Discord was closed before host files changed.
- The existing plugin, plugin configuration, and BetterDiscord `plugins.json` were backed up outside the repository.
- The real configuration was isolated without reading it. The smoke run therefore started without API credentials and with automatic visible-message translation disabled.
- No chat channel was opened, no message was sent, and no provider request or connection test was triggered.

Passed checks:

- BetterDiscord discovered the generated artifact as `DiscordAITranslator v0.2.0`.
- The plugin enabled and displayed its successful-start notification.
- The complete settings panel opened and its main sections rendered.
- Automatic visible-message translation and nearby-message prefetch were disabled by default.
- A disable, re-enable, and final disable lifecycle cycle completed with the expected notifications and UI state.
- Discord closed normally after the smoke test.
- The original plugin, configuration, and BetterDiscord enable-state file were restored and matched their pre-test SHA256 values.

Not covered:

- Composer button injection and polish/public-bilingual writes in a live channel.
- Message button/context-menu injection, channel switching, scrolling, edited messages, and live automatic rendering.
- Real cloud provider requests or a local Sakura-compatible endpoint.
- Discord PTB/Canary, PowerShell 7, macOS, Linux, and mobile clients.

## v0.4.0 pending acceptance (2026-09-26)

Status: **pending; no results yet.** Nothing below has been run in live Discord. At this table's September 26 baseline, checks covered source syntax, 364 module tests, artifact regressions, installer tests and artifact structure at `b3fdd51`, plus screenshots of browser pages that imitate BetterDiscord. Later source commit `2fe3f0c` also passed Windows Node 22/24 CI; see the October 22 checkpoint above. Those offline/CI results do not complete any live-host row. The same checklist, with background, is in the [optimization handoff](optimization-handoff.md).

Before starting, record:

- Windows build, Discord Stable version, BetterDiscord version.
- Repository commit and the SHA256 of the plugin file actually installed. The `b3fdd51` build is 1,737,598 bytes, SHA256 `1795230A2DBA143B8BCAA0AC0B78A3FECC3D0C35D08901F9A598E31C3C68396A`; a later rebuild after code changes has a different hash, and results for one hash do not carry over to another.
- The test account, channel and provider keys used (a dedicated test setup; never production keys or private chats).
- A backup, kept outside the repository, of `DiscordAITranslator.config.json`, `DiscordAITranslator.cache.config.json` and `DiscordAITranslator.diagnostics.config.json` from the BetterDiscord plugins folder, because v0.4.0 moves the cache and diagnostics into their own files on first start.

Mark each row Passed, Failed (with what happened) or Not covered. Do not mark a row Passed from offline tests.

| # | Scenario | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| 1 | Quick panel and status badge | Click the AI button; hold it, then release; right-click it; press Esc; click outside the panel; with the panel open, press Tab in the message box (for example to accept an emoji suggestion); switch channels; produce each state: working, translating, rate-limited, bad key, local service stopped, channel set to "Never translate" | One open or close per click; right-click does nothing; Esc closes and returns focus to the button; Tab stays with the message box; "This channel" follows the new channel; the five badge shapes and the hover text match the real state and turn green after a fix and a passed test | Pending |
| 2 | Settings tabs and search | Open settings from the quick panel and from BetterDiscord's plugin list; move between tabs with the arrow keys and Home/End; search "hotkey" and "cache" and press Enter; switch the interface language; make the Discord window narrow | Window at most 920 × 760 with a single title bar; search jumps to the control; a language switch keeps the window open on the same tab; narrow windows show the tabs as a row; in BetterDiscord's dialog the close button and right-hand controls are not cut off | Pending |
| 3 | Reset dialog | Data & diagnostics → Danger zone → Reset to defaults; once with the keep box ticked, once unticked; also press Esc and click the backdrop | The dialog shows the checkbox (rendered through BetterDiscord's React); ticked keeps API keys, the Google key pool and templates, unticked clears them; Esc and a backdrop click cancel; afterwards the window stays on its tab and focus returns to the Reset button | Pending |
| 4 | Ask before sending (sent with Enter) | Set "After polishing" to "Ask before sending"; polish in English-language Discord and confirm with the dialog's Send button; change the draft while the dialog is open; press Cancel | Confirming sends the message and never opens "Send a gift"; a changed draft is not sent and a notice says so; Cancel sends nothing and leaves the text in the box | Pending |
| 5 | Hotkey recorder | Click the shortcut button and record `Ctrl+Shift+Y`; try `Shift+H` and `Ctrl+V`; start recording and then close settings, click elsewhere, or wait 10 s; type in the message box afterwards | A valid combination is saved and polishes the draft; invalid ones are rejected and the old shortcut stays; after recording ends, typing is not captured | Pending |
| 6 | Google / Baidu / DeepL messages | With test keys, cause: a Google per-minute limit and an invalid or expired key; Baidu IP allowlist (58000) and unsupported target language (58001); DeepL quota used up (456) and invalid key (403); DeepL with Traditional Chinese selected | The error line and the one-time notice name the cause (Baidu includes its code); a cooling Google key returns after about a minute and no "monthly quota" error appears; the Test names a failing Google key by its label; DeepL returns Traditional Chinese | Pending |
| 7 | Local model detection | Sakura local: click "Detect models"; load another model on the server; stop the server | The server's models are listed with the loaded one marked; after the model change, messages are translated with the new model; with the server stopped, cached lines still show, the error line names the local address and offers "Test connection", and the AI button shows the red "!" | Pending |
| 8 | Try a sentence / Try polishing | Run one sentence in each connection card; run with empty input; run with a wrong key | Result and time are shown and nothing is sent to Discord; empty input asks for a sentence; errors show inside the card | Pending |
| 9 | Update from v0.3.0: channel rules and cache | Start v0.4.0 on v0.3.0 settings and cache (with a channel set to "Enable in this channel"); turn the main auto-translate switch off; scroll back in an already translated channel; set one channel to "Always translate" | No channel starts auto-translating after the update; v0.3.0 cached lines show at once on scroll-back without new requests (also after local model detection); the "Always translate" channel auto-translates with the main switch off | Pending |

Also worth checking in the same session, and recording the same way: the error-line buttons (Open settings, Test connection, Retry), the translated-line toolbar and its right-click items, revealing masked lines with the keyboard, Polish and public bilingual writes of multi-line drafts with mentions, the cache and diagnostics file migration, plugin disable/enable cycles, and late responses after stopping the plugin during a request.
