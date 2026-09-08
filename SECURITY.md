# Security Policy

## Supported Version

Security fixes currently target the latest source and generated plugin artifact on the default branch.

## Reporting

Do not open an issue containing API keys, Discord message content, provider responses, BetterDiscord profile data, or reproduction logs with private identifiers, even while this repository is private. Contact the maintainer (MK6657) through an established private channel. If private vulnerability reporting is available in the repository's Security tab, use it; do not assume it is enabled.

Include the affected version, provider type, minimal reproduction, expected behavior, and sanitized diagnostics. Replace credentials and message content with synthetic values.

## Security Boundaries

- Remote API endpoints must use HTTPS; HTTP is allowed only for loopback endpoints.
- Provider requests reject redirects before contacting the redirect destination. Configure the final trusted API URL directly, including its required path and trailing slash.
- Provider fallback is opt-in, never sends Sakura local traffic to cloud providers, and must not reuse credentials across providers.
- Settings and API credentials are stored by BetterDiscord on the local machine.
- Translation cache and diagnostics may contain local metadata. Clear them before sharing a BetterDiscord data directory.
- Generated artifacts must be reproduced with `npm ci` and `npm run release:check` before release.
