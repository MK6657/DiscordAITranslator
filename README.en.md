<div align="center">

# Discord AI Translator

**A Windows-first BetterDiscord plugin for AI message translation, writing polish, and public bilingual chat**

[![Windows CI](https://github.com/MK6657/DiscordAITranslator/actions/workflows/ci.yml/badge.svg)](https://github.com/MK6657/DiscordAITranslator/actions/workflows/ci.yml)
![Preview](https://img.shields.io/badge/preview-v0.4.0-5865F2)
![Release](https://img.shields.io/badge/release-v0.3.0-2EA043)
![Platform](https://img.shields.io/badge/platform-Windows%20BetterDiscord-0078D4)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

[简体中文](README.md) | **English**

</div>

---

Discord AI Translator brings seamless multilingual communication and expressive writing directly into Discord. It supports **7 AI & machine translation providers** (including local models via Sakura), **59 built-in writing polish presets** (general tones, Chinese regional dialects, and historical/global personas), **public bilingual messaging**, a **dual-mode quick panel**, and smooth, jank-free rendering.

> [!NOTE]
> This is an independent third-party BetterDiscord plugin and is not affiliated with Discord. Review the rules and risks of client modifications before use, and start with manual translation in a dedicated test channel before enabling automatic translation.

## Highlights

### 💬 Channel Message Translation (Manual & Automatic)
- **Flexible manual triggers**: Per-message Translate button (on hover / always / off) and right-click context menu, with support for **reply preview translation** and **long-text chunked recovery** (preserving translated segments and marking missing parts for one-click retry).
- **Smart automatic translation**: Visible-message auto-translation, **per-channel rules** (*Follow main switch* / *Always translate* allow-list / *Never translate* block-list), explicit history backfill, nearby-message prefetch, configurable 1–10 concurrency, cooldown backoff, and terminal-failure protection.
- **Customizable display & inline actions**: Place translations above or below the original message, pick from 3 visual styles (tinted background / muted text / `TR` tag) and 2 font scales (100% / 90%), **mask translations** (click or press Enter/Space to reveal), **hide original after translation** (hover or focus to peek), and automatic **RTL layout** for Arabic, Hebrew, Persian, and other right-to-left languages.
- **Hover / keyboard toolbar**: Hover or Tab onto any translated line to **Copy**, **Retranslate (bypass cache)**, or **Hide**.
- **Actionable inline error lines**: Failed translations explain what went wrong in plain language right below the message with direct buttons for *Open settings*, *Test connection*, *Retry*, or a live cooldown timer.

### ✨ Composer AI Polish & 59 Built-In Style Presets
- **Split Polish button & quick tone picker**: Polish drafts right inside Discord's message composer, or open the split dropdown to switch presets in one click—organized by **General / Dialect / Persona** tabs and grouped sections without opening full settings.
- **Complete writing workflow**: Supports **re-polishing** (from either the original draft or the latest result), **one-click Restore original**, **Ask before sending** confirmation dialog, a **recordable polish hotkey** (default `Ctrl+Alt+P`), and categorized custom user templates.
- **Format & draft safety**: Preserves line breaks, user/role/channel mentions, custom emoji, block quotes, code blocks, and zero-width spaces. If a result arrives after you changed the draft or switched channels, it opens in a non-destructive result panel with Copy and Insert actions instead of overwriting your typing.

| Category | Built-in Presets | Highlights |
| --- | :---: | --- |
| **General** | 8 | Natural Chat, Polite & Clear, Short & Direct, Native Casual, Tech / Bug Report, Gaming / Squad Chat, Tactful / High-EQ, Formal / Announcement |
| **Chinese Dialects** | 22 | Grouped across **South China & Min-Tai** (Cantonese, HK Cantonese, Hakka, Chaoshan, Minnan, Taiwanese, etc.), **Southwest** (Sichuan-Chongqing, Yunnan, Guizhou), **North** (Dongbei, Beijing, Tianjin, Shaanxi, Henan, Shandong, Xinjiang), and **East & Central** (Shanghainese, Wu, Nanjing, Wuhan, Hunan) |
| **Personas** | 29 | Grouped across **Monarchs & Rulers** (Qin Shi Huang, Zhu Yuanzhang, Cao Cao, Yongzheng, etc.), **Strategists & Generals** (Zhuge Liang, Sima Yi, Sun Tzu, Xiang Yu), **Writers & Thinkers** (Lu Xun, Lin Daiyu, Su Shi, Wang Yangming, Zhuangzi, Guo Degang, etc.), and **Global Icons** (Shakespeare, Donald Trump, Nietzsche, Karl Marx, Napoleon, Churchill, Elon Musk) |

<details>
<summary>Browse all 59 built-in polish presets & 6 translation prompt templates</summary>

- **General Polish (8)**: Natural Chat, Polite & Clear, Short & Direct, Native Casual, Tech / Bug Report, Gaming / Squad Chat, Tactful / High-EQ, Formal / Announcement
- **Chinese Dialects (22)**:
  - South China & Min-Tai: Guangfu Cantonese, HK Cantonese, Hakka, Chaoshan, Guangxi Nanpu, Minnan, Taiwanese
  - Southwest: Sichuan-Chongqing, Yunnan, Guizhou
  - North: Dongbei, Beijing, Tianjin, Shaanxi, Henan, Shandong, Xinjiang
  - East & Central: Shanghainese, Suzhou & Hangzhou Wu, Nanjing, Wuhan, Hunan
- **Personas (29)**:
  - Monarchs & Rulers: Qin Shi Huang, Emperor Wu of Han, Zhu Yuanzhang, Chiang Kai-shek, Cao Cao, Emperor Taizong, Yongzheng
  - Strategists & Generals: Zhuge Liang, Sima Yi, Sun Tzu, Xiang Yu
  - Writers & Thinkers: Lu Xun, Lin Daiyu, Wang Yangming, Li Bai, Su Shi, Confucius, Zhuangzi, Eileen Chang, Qian Zhongshu, Wang Xiaobo, Guo Degang
  - Global Icons: Shakespeare, Donald Trump, Nietzsche, Karl Marx, Napoleon, Churchill, Elon Musk
- **Message Translation Templates (6)**: Natural, Literal, Slang & Casual Chat, Tech / AI / Dev, Gaming / ACG Community, Official Announcements / Changelogs

</details>

### 🌐 Public Bilingual Messaging
- Click the **Bilingual** button beside the composer to translate your draft and format it as a public bilingual message (translation + original) for multilingual servers.
- Optional **Bilingual after Polish** workflow; preserves code blocks, mentions, custom emoji, and spoiler tags without nesting previous translations when re-run.

### ⚡ Dual-Mode Quick Panel & Full Settings Window
- **User-panel AI launcher**: Click the AI button in Discord's bottom-left user bar to open a compact **two-tab quick panel** (*Translation* / *Polish*):
  - **Translation tab**: Switch saved service profiles, toggle auto-translate, set the current channel rule, pick target language (13 presets + custom), select translation prompt template, toggle mask/hide original, switch translation position, and test the connection.
  - **Polish tab**: Switch polish service profiles, toggle composer polish, set output language and tone preset, adjust creativity (temperature slider + *Steady / Balanced / Creative* presets), choose after-polish action and re-polish source, toggle public bilingual, and test lines in the built-in **Quick Try Polish** drawer.
- **Live status badge** (distinct shape and color, with hover tooltip summary):

| Badge | Meaning |
| --- | --- |
| 🟢 Green dot | Connected and operating normally |
| 🟠 Amber ring | Actively translating or running a connection test |
| 🔺 Amber triangle | Rate-limited or cooling down; resumes automatically |
| ❗ Red `!` | Needs attention (missing/rejected API key, quota exhausted, local service offline, invalid URL/model) |
| ➖ Grey dash | Auto-translation is off for the current channel |

- **6-tab full settings window**: *Overview* (setup checklist + live service status cards), *Translate messages*, *Composer tools*, *Display* (including *Follow Discord / Light / Dark* window themes), *Advanced*, and *Data & diagnostics* (including a host-health diagnostics card). Includes instant **settings search**, **model auto-detection** for local/OpenAI-compatible endpoints, built-in **Try a sentence / Try polishing**, and live in-place Chinese/English UI switching.

## Supported Providers

Message translation and composer polishing store **separate** provider profiles, credentials, target languages, model parameters, and prompt templates, and let you save multiple service profiles for quick switching.

| Provider | Composer Polish | Message Translation | Key Settings & Capabilities |
| --- | :---: | :---: | --- |
| **DeepSeek** | ✅ | ✅ | API key, endpoint, model (thinking toggle supported) |
| **OpenAI-compatible** | ✅ | ✅ | API key, endpoint, model, one-click server model detection |
| **Sakura local** | ✅ | ✅ | Local endpoint (e.g. `127.0.0.1:8080`), model auto-detection; optional key, **never falls back to cloud** |
| **Google Cloud Translation** | — | ✅ | Multi-key rotation pool, monthly character budget tracking, per-key cooldowns |
| **Microsoft Translator** | — | ✅ | API key, region, endpoint |
| **DeepL** | — | ✅ | API key, Free / Pro plan, Traditional Chinese support |
| **Baidu Translate** | — | ✅ | App ID, Secret Key, endpoint, granular Baidu error handling |

> Optional **manual-translation fallback providers** can be enabled and ordered in settings (off by default). When `Sakura local` is the primary provider, cloud fallback is disabled to keep local text private.

## Install the plugin

The **published fixed version** is `v0.3.0` (pre-released on September 25, 2026):

1. Install [BetterDiscord](https://betterdiscord.app/) for the Discord desktop client.
2. Open Discord Settings -> `BetterDiscord` -> `Plugins` -> `Open Plugins Folder`.
3. Download [DiscordAITranslator.plugin.js from the v0.3.0 Release](https://github.com/MK6657/DiscordAITranslator/releases/download/v0.3.0/DiscordAITranslator.plugin.js).
4. Place the file into your plugins folder, enable it, and configure your provider from the bottom-left AI button.

Typical Windows plugins directory:
```text
%APPDATA%\BetterDiscord\plugins
```

### Current branch source preview

To try the latest `v0.4.0` source preview (featuring the dual-mode quick panel, split composer tone picker, 59 dialect/persona polish presets, redesigned 6-tab settings window, and performance optimizations; see [CHANGELOG.md](CHANGELOG.md)):

- **Option 1 (Direct file download)**: Download the raw [DiscordAITranslator.plugin.js](DiscordAITranslator.plugin.js) directly from the repository root and place it in your BetterDiscord plugins folder (no Node.js required).
- **Option 2 (Windows installer script)**: Clone the repository and run from a **standard Windows PowerShell** opened from the Start menu (verifies syntax & SHA-256, backs up any previous version, and transactionally enables the plugin):

```powershell
# Preview target paths without writing
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1 -WhatIf

# Install and enable (add -NoEnable to install without auto-enabling)
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-plugin.ps1

# Verify installed plugin version & SHA-256 against the repository build
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\check-installed-plugin.ps1
```

> [!TIP]
> Run the installer from a standard Start-menu PowerShell window rather than a packaged desktop app's embedded terminal. If `%APPDATA%` writes are redirected to a private app container, the installer detects it and exits with code `2` without making changes (use `-PluginsDir` / `-ProfileDir` for custom paths, or `-AllowRedirectedAppData` only when intentionally targeting a private copy).

## Privacy, Security & Local Data

- **Strict endpoint policy**: Remote endpoints must use HTTPS. HTTP is accepted only for recognized local endpoints (`localhost`, IPv4/IPv6 loopback, and `0.0.0.0`). Embedded URL usernames/passwords are rejected.
- **No automatic HTTP redirects**: All API requests disable redirect following (`301/302/303/307/308`) so message contents and credentials are never forwarded to an unspecified destination. Always enter the canonical endpoint URL.
- **Split local storage**: Data is stored locally in BetterDiscord's plugins directory via `BdApi.Data`:
  - `DiscordAITranslator.config.json`: settings and provider credentials (BetterDiscord does not provide an OS credential vault; protect access to your BetterDiscord directory).
  - `DiscordAITranslator.cache.config.json`: translation cache (default 48-hour TTL, up to 4,000 messages; clearable in *Data & diagnostics*).
  - `DiscordAITranslator.diagnostics.config.json`: redacted diagnostics (records hashes, statuses, error metadata, and model filenames—not raw keys or full message bodies).
- **Safe Reset to defaults**: Located in *Data & diagnostics -> Danger zone*, keeping API keys, the Google key pool (with monthly usage), prompt templates, and UI language checked by default.
- For security reports, see [SECURITY.md](SECURITY.md). Never share real API keys, raw private messages, or unredacted logs in public issues.

## Development & Verification

Validation baseline: Windows 11, Node.js 22 or 24 LTS, and Windows PowerShell 5.1 (offline verification requires neither Discord nor real API keys).

```powershell
git clone https://github.com/MK6657/DiscordAITranslator.git
cd DiscordAITranslator
npm ci
npm run verify
```

| Command | Description |
| --- | --- |
| `npm run build` | Rebuild `DiscordAITranslator.plugin.js` from `src/` via esbuild (**never hand-edit the generated bundle**) |
| `npm run build:check` | Verify that the committed plugin bundle matches `src/` |
| `npm test` | Run core module tests (`tests/core/`) and full offline artifact regressions (`scripts/verify-plugin.js`) |
| `npm run ci` | Run source checks, build consistency, unit/artifact tests, installer rollback tests, and artifact checks |
| `npm run verify` | Rebuild first, then run the full validation suite |
| `npm run release:check` | Full release gate identical to GitHub Windows CI (license, secrets, tracked files, snapshot & CI checks) |
| `npm run plugin:install` / `plugin:check` | Install into BetterDiscord / compare installed vs. repo build (pass `-- -Strict` in automation) |

### Repository Layout

- `src/`: Canonical source organized into `settings/`, `providers/`, `cache/`, `validation/`, `diagnostics/`, `auto-translation/`, `quick-panel/`, `intake/`, `composer/`, `discord/`, `ui/`, and `css/`.
- `DiscordAITranslator.plugin.js`: Reproducible single-file BetterDiscord plugin generated by `npm run build`.
- `tests/core/` & `scripts/`: Focused module test suites, offline artifact regressions, Windows installer/check scripts, and release gates.
- `docs/`: Architecture docs, critical-chain contracts, host smoke records, and maintenance handoffs.

<details>
<summary>Updates, Removal & Troubleshooting</summary>

- **Updating**: Replace `DiscordAITranslator.plugin.js` and re-enable it; the installer automatically creates a timestamped backup. Upgrading from `v0.3.0` to `v0.4.0` automatically migrates cache and diagnostic logs into separate files and preserves existing channel-rule semantics without enabling auto-translation on unexpected channels.
- **Uninstalling**: Disable and delete `DiscordAITranslator.plugin.js` in BetterDiscord. To remove local data as well, delete `DiscordAITranslator.config.json`, `DiscordAITranslator.cache.config.json`, and `DiscordAITranslator.diagnostics.config.json` from your plugins directory.
- **`npm ci` fails**: Ensure Node.js 22 or 24 LTS is installed, remove a partial `node_modules` folder, and retry (keep `package-lock.json`).
- **`build:check` reports a stale bundle**: Run `npm run build`.
- **Plugin missing or not updating in BetterDiscord**: Run `npm run plugin:check` from a normal Start-menu PowerShell to detect AppData redirection or missing BetterDiscord injection.
- **Discord update breaks UI or buttons**: Export redacted diagnostics from *Data & diagnostics*, inspect the Host Health card, and open an issue.

</details>

<details>
<summary>Known Limitations & Maintainer Docs</summary>

- Desktop BetterDiscord only (Android/mobile clients are not supported). Upstream Discord DOM, Webpack module, and BetterDiscord API changes remain ongoing compatibility risks.
- Validated on Windows 11 + Discord Stable; `v0.4.0` UI and provider error paths have extensive offline/simulated DOM coverage while full live host acceptance continues.
- Documentation & maintenance links:
  - [CHANGELOG.md](CHANGELOG.md) — Version history and upgrade/downgrade notes
  - [CONTRIBUTING.md](CONTRIBUTING.md) — Contribution guidelines
  - [docs/architecture.md](docs/architecture.md) — Source/artifact boundary and module architecture
  - [docs/critical-chain-contracts.md](docs/critical-chain-contracts.md) — Behavioral contracts for refactors
  - [docs/host-smoke-test.md](docs/host-smoke-test.md) — Live Discord host smoke test records
  - [docs/optimization-handoff.md](docs/optimization-handoff.md) & [docs/maintenance-handoff-2026-10-22.md](docs/maintenance-handoff-2026-10-22.md) — Acceptance checklists and maintenance handoff notes

</details>

## License

Released under the [MIT License](LICENSE). Preserve [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). See [docs/provenance-review.md](docs/provenance-review.md) for the independent-implementation provenance review record.
