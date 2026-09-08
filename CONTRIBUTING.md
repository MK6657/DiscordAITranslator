# Contributing

## Development Environment

The supported contributor baseline is Windows 11, Node.js 22 or 24 LTS, npm, BetterDiscord, and Windows PowerShell 5.1.

```powershell
npm ci
npm run verify
```

`npm run verify` rebuilds the root plugin, checks all JavaScript, runs focused module tests, runs the full plugin regression suite, tests the Windows installer in temporary BetterDiscord fixtures, and verifies the generated artifact.

The generated bundle targets Node 20 syntax for BetterDiscord host compatibility. Contributor tooling and CI use supported Node.js 22 and 24 releases.

## Source and Generated Files

- Edit files under `src/`.
- Do not edit `DiscordAITranslator.plugin.js` directly. It is the committed BetterDiscord release artifact.
- Run `npm run build` after source changes.
- Keep `scripts/verify-plugin.js` focused on behavior of the generated artifact.
- Add smaller domain tests under `tests/` when extracting modules.

## Critical-Chain Changes

Changes to settings migration, request snapshots, provider fallback, manual translation, automatic translation state, cache identity, rendering, or lifecycle cleanup must preserve the contracts in `docs/critical-chain-contracts.md` and add a regression for the failure mode.

## Pull Requests

- Keep refactors behavior-preserving unless the behavior change is documented.
- Avoid dependency upgrades unrelated to the change.
- Never commit API keys, Discord content, BetterDiscord data, logs, backups, `external/`, or local agent state.
- Include the commands used to verify the change.

## License

By submitting a contribution, you agree that it is licensed under the project's MIT License. Contributions must be your own work or come from a source whose license is compatible with MIT; include attribution and license details for third-party material.

Do not copy implementation code from the GPL-2.0 reference checkout under `external/`. That checkout is local-only and exists solely for behavioral comparison and provenance review.
