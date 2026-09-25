# Discord AI Translator

[中文](README.md) | [English](README.en.md)

Continuing on another computer? Read the [optimization handoff](docs/optimization-handoff.md), including pending work, host acceptance, and an English summary.

A Windows-first BetterDiscord desktop plugin for message translation, writing assistance, and public bilingual messages. This is a third-party project, not an official Discord product. Review the rules and risks of client modifications before using it; use a dedicated test account and channel for initial testing.

## Status

**v0.3.0 · September 25, 2026 · pre-release.**

The version appears at the top of the settings page, in the start notification and in BetterDiscord's plugin list. Changes are listed in [CHANGELOG.md](CHANGELOG.md).

Local validation covers source syntax, reproducible builds, offline regressions, installer installation/rollback, and artifact structure. The v0.3.0 changes to drawing cached translations while scrolling and to local-model prefetch still need live Discord acceptance, so this is published as a pre-release, not a stable release. Earlier host records are in the [host smoke record](docs/host-smoke-test.md).

## Features

- Chinese and English settings, quick setup, and keyboard shortcuts.
- Polish drafts, polish again, restore the original, and confirm before sending.
- Compose public bilingual messages containing both a translation and the original.
- Translate messages through message buttons or context menus, including reply previews and long-text recovery.
- Optional visible-message automatic translation, channel policies, history backfill, prefetch, concurrency limits, and provider cooldowns.
- Memory/persistent translation caches, request deduplication, output validation, and diagnostics.
- Separate writing/translation profiles and prompt templates.
- Optional manual cloud-provider fallback, disabled by default; Sakura local does not automatically fall back to the cloud.

## Install the plugin

Plugin users do **not** need Node.js, npm, or esbuild.

1. Set up BetterDiscord for the Discord desktop client.
2. Open Discord settings → BetterDiscord → Plugins → Open Plugins Folder.
3. Download the raw [DiscordAITranslator.plugin.js](DiscordAITranslator.plugin.js) file from this repository. Do not save the GitHub HTML page. A private repository requires an account with access.
4. Copy the file into the plugins folder and enable it.
5. Configure your chosen provider in plugin settings. Start with manual translation in a dedicated test channel before enabling automatic translation.

Only pre-release builds are published so far. A typical Windows plugin directory is `%APPDATA%\BetterDiscord\plugins`.

### Check which version is installed

From a clone of this repository, run `npm run plugin:check`. It lists the version and SHA256 of the repository build and of the installed plugin, and checks three reasons an install may not take effect: a private BetterDiscord copy kept by another app (such as an AI desktop app), this window's writes being redirected into an app's private storage, and Discord's startup file not loading BetterDiscord. Run installs and checks from a normal PowerShell window opened from the Start menu, not from an AI app's built-in terminal.

## Providers

| Provider | Writing assistance | Message translation | Main configuration |
| --- | --- | --- | --- |
| DeepSeek | Yes | Yes | API key, endpoint, model |
| OpenAI-compatible | Yes | Yes | API key, endpoint, model |
| Sakura local | Yes | Yes | Local endpoint, model; key may be empty |
| Google Cloud Translation | No | Yes | Key pool, monthly character budget |
| Microsoft Translator | No | Yes | API key, region, endpoint |
| DeepL | No | Yes | API key, Free/Pro plan |
| Baidu Translate | No | Yes | App ID, Secret Key, endpoint |

Writing and translation keep separate provider, credentials, language, model, and prompt settings. The plugin does not supply a translation service; usage may incur charges with your provider.

Remote endpoints must use HTTPS. HTTP is accepted only for local endpoints recognized by the plugin, including localhost, loopback addresses, and 0.0.0.0. Embedded URL usernames/passwords are rejected. Configure only endpoints you trust: they receive the text being translated or polished.

All API requests reject automatic redirects, preventing message bodies and provider headers from being forwarded to an unspecified destination. Configure the final trusted URL directly, including the correct path and trailing slash; do not rely on HTTP 301/302/303/307/308 redirects.

## Privacy and local data

The plugin uses BetterDiscord's `BdApi.Data` storage:

- Settings and provider credentials are stored locally. There is no Windows Credential Manager integration or system-vault encryption; protect the BetterDiscord data directory.
- Translation caches default to a 48-hour TTL and up to 4,000 entries. They contain translations and identity keys used to distinguish messages/channels/configurations. Clear them in settings when needed.
- Diagnostics are designed to store hashes, status, and error metadata rather than raw keys or full message text. Always inspect exported logs before sharing them.

Translation requests send text to the configured service. Public bilingual output is visible to message recipients; displaying a received-message translation locally does not itself send a Discord message. Never commit real provider settings, runtime data, or unredacted logs. See [SECURITY.md](SECURITY.md) for reporting guidance.

## Develop and verify on Windows

The validation target is Windows 11 with Node.js 22 or 24 and Windows PowerShell 5.1. Discord and BetterDiscord are needed only for actual installation and host tests; offline validation requires no real API keys.

```powershell
git clone https://github.com/MK6657/DiscordAITranslator.git
cd DiscordAITranslator
npm ci
npm run release:check
```

The release gate requires a Git repository rooted at this project directory and checks tracked files, sensitive-data patterns, licensing records, and the full CI suite. For a source ZIP without Git metadata, use `npm run ci` instead. The sensitive-data scan is a safeguard, not a comprehensive security audit.

```powershell
npm run build          # Regenerate the root plugin from src/
npm run build:check    # Check the artifact without changing it
npm run check          # Check JavaScript source syntax
npm test               # Core module tests and offline plugin regressions
npm run test:installer # Temporary-directory installation/rollback tests
npm run ci             # Source, build consistency, tests, and artifact checks
npm run verify         # Rebuild first, then run validation
npm run release:check  # Full repository release gate
```

GitHub Actions is configured to run the release gate on Windows with Node 22 and 24. Installer tests isolate BetterDiscord data in temporary directories; they do not install into your real Discord profile.

To install into your actual profile after validation:

```powershell
npm run plugin:install:dry-run
npm run plugin:install
# Or install without automatically enabling the plugin:
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-plugin.ps1 -NoEnable
```

The installer checks syntax and SHA256, backs up an existing plugin, and supports rollback when profile updates fail.

## Repository layout

- `src/`: canonical implementation. Edit these sources, not the generated plugin.
- `DiscordAITranslator.plugin.js`: committed, reproducible, single-file plugin.
- `src/settings/`, `providers/`, `cache/`, `validation/`, `diagnostics/`: extracted settings/provider/cache/output/diagnostic modules.
- `src/auto-translation/`: queue core, request pipeline, read-only task-state view, and render scheduling helpers.
- `tests/core/` and `scripts/verify-plugin.js`: focused tests and offline artifact regressions.
- `scripts/`: build/check scripts and Windows installer/tests.
- `docs/architecture.md` and `docs/critical-chain-contracts.md`: architecture and behavior contracts.
- `HANDOFF.md` and `BASELINE-2026-07-26*.md`: historical snapshot records, not current setup instructions.

Old source snapshots, rollback ZIPs, local reference checkouts, credentials, and `node_modules/` are excluded from the repository. The original packaging manifest is not included; the intake record contains the runtime artifact hash.

The [September 8 follow-up review](docs/review-2026-09-08.md) records subsequent installer rollback and redirect fixes, regression coverage, and the updated artifact hash. The intake hash describes the original c baseline, not the hardened artifact.

## Updates, removal, and troubleshooting

- Update by replacing the plugin and re-enabling it. The installer retains timestamped backups.
- Remove by disabling the plugin and deleting its `.plugin.js` file. Clear caches/diagnostics first if you also want to remove local data; preserve needed provider settings before deleting any BetterDiscord data.
- If dependency installation fails, check Node/npm and registry connectivity, then retry `npm ci`. Preserve `package-lock.json`.
- If `build:check` reports a stale artifact, run `npm run build` and recheck.
- If the plugin is missing, inspect the target with `npm run plugin:install:dry-run` and confirm BetterDiscord is available.
- If Discord updates break buttons or translation, collect sanitized diagnostics and run `npm test`; offline success cannot prove live DOM/API compatibility.

## Limitations and next steps

The main implementation is still roughly 14,000 lines, and the offline regression script is large. Discord DOM, internal Webpack modules, and BetterDiscord APIs remain compatibility risks. Android/mobile use is unsupported; Windows 10, other operating systems, and Discord PTB/Canary have not been validated here.

First complete host acceptance of the c snapshot: lifecycle cycles, competing draft edits, manual/automatic translation, channel changes, scrolling, message edits, custom emoji, provider errors, and late responses after stopping. Only then proceed with the planned unified automatic-translation state machine and Discord adapter extraction. Memory-only cache and settings import/export remain future work.

## License

MIT. Preserve [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The historical [provenance review](docs/provenance-review.md) records a passed independent-implementation review; it has not been rerun as a new legal audit during this repository intake. Local GPL reference checkouts and internal research are not distributed with this repository.
