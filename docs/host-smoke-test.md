# Windows Host Smoke Test

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

Status: **pending; no results yet.** Nothing below has been run in live Discord. The v0.4.0 changes have passed only the local checks (source check, 364 module tests, artifact regressions, installer tests, artifact check at `b3fdd51`) and screenshots of browser test pages that imitate BetterDiscord. The same checklist, with background, is in the [optimization handoff](optimization-handoff.md).

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
