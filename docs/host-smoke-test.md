# Windows Host Smoke Test

## Current snapshot status (2026-09-08)

The July 26 c snapshot has not received live-host acceptance during repository intake. The record below applies only to its explicitly identified older artifact. Local offline/installer tests are documented in [repository-intake-2026-09-08.md](repository-intake-2026-09-08.md); they do not prove live Discord or provider compatibility.

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
