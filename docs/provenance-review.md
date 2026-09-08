# Provenance Review

Status: Passed

Review date: 2026-07-13

## Scope

This review compares the canonical implementation under `src/`, the build and verification scripts, tests, documentation, and the generated BetterDiscord artifact against the local GPL-2.0 reference checkout:

- Upstream: `ROOT94-MAX/DiscordAITranslator`
- Reviewed commit: `250ee6de0ada23d6c1ced0da63bd086b006fb2e0`
- Public project license: MIT

The reference checkout under `external/` and internal behavioral research under `work/` are excluded from the public repository, build, tests, and release artifact.

## Method

The review used exact token-window comparisons, exact and near-match long-string comparisons, method-name overlap, line-level matches, implementation-architecture comparison, generated-artifact scans, and dependency-license inspection. Generated bundle duplication was not counted as independent source evidence.

## Evidence

- `src/discord-ai-translator.js` contains 63,187 lexical tokens versus 43,115 in the reference implementation. Exact 20-token overlap covers 21 canonical tokens, or 0.0332%.
- The longest exact run is 21 tokens and is a conventional whitespace-normalization and guard sequence. No distinctive prompt, algorithm, or provider implementation was found in a matching run.
- At a 12-token threshold, canonical overlap remains 0.3482%. The four other canonical modules have no 12-token match.
- Of approximately 1,037 canonical method definitions and 338 reference methods, only `constructor`, `start`, `stop`, `getSettingsPanel`, and `translateMessage` overlap. These are framework lifecycle or direct domain names.
- Long exact-line matches are limited to public API URLs, HTTP content types, Discord selectors and CSS values, and routine DOM expressions.
- Build scripts and focused module tests have no 20-token match against the reference JavaScript. The large artifact regression test has no 20-token match and only 0.0115% coverage at 12 tokens.
- The implementations use materially different integration architectures. This project uses independent DOM tracking and rendering, while the reference uses BDFDB patching, message-object mutation, and rerendering.
- Microsoft, DeepL, Baidu, Google, and OpenAI-compatible adapters follow public provider schemas but use independent data flow, error handling, and request orchestration.
- The generated plugin contains no `ROOT94`, `GPL`, or `__SKIP_TRANSLATION__` marker.
- The only build dependency, esbuild 0.28.1 and its platform package, is MIT licensed.

## Decision

No copyrightable implementation copying was found that would cause the GPL-2.0 reference license to govern this project's canonical source or generated artifact. The current snapshot can reasonably be published as an independently implemented MIT project.

This technical review cannot independently establish the legal chain of title for contributions made before Git history was initialized. Contributors must submit only work they own or material whose license is compatible with MIT, as required by `CONTRIBUTING.md`.
