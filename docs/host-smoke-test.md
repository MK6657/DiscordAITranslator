# Windows Host Smoke Test

## Current snapshot status (2026-09-08)

The current artifact received a limited local-model smoke test on the actual usage computer on September 8, recorded below. Full live-host acceptance remains incomplete. The July record applies only to its explicitly identified older artifact. Local offline/installer tests are documented in [repository-intake-2026-09-08.md](repository-intake-2026-09-08.md).

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
