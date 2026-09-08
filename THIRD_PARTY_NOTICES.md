# Third-Party Notices and Provenance

## Build Dependency

This project uses `esbuild` as a development-only bundler. The installed version and transitive platform package are pinned by `package-lock.json`. The generated BetterDiscord plugin has no runtime dependency on esbuild or `node_modules`.

## Local Reference Checkout

The local development workspace contains a reference checkout that is intentionally excluded by `.gitignore`:

- Project: `ROOT94-MAX/DiscordAITranslator`
- Upstream: https://github.com/ROOT94-MAX/DiscordAITranslator
- Reviewed commit: `250ee6de0ada23d6c1ced0da63bd086b006fb2e0`
- Upstream license: GPL-2.0

The `external/` directory is not part of this project's source, build, tests, public repository, or release artifact. Internal behavioral research is retained under the ignored `work/` directory. Implementation changes must be written independently and verified against this project's own tests.

The provenance review completed on 2026-07-13 with a `Passed` decision. It found no copyrightable implementation copying that would make the GPL-2.0 reference license govern the canonical source or generated artifact. Quantitative evidence, scope, methodology, and residual limitations are recorded in `docs/provenance-review.md`.

The public project is licensed under MIT. The reference project remains GPL-2.0 and is neither vendored nor redistributed here.
