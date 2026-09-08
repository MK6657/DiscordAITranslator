# Discord AI Translator Roadmap

> Status note (2026-07-13): MVP and most desktop translation features below are implemented in `v0.2.0`. The active priorities are source/test modularization, memory-only cache controls, and real Discord + BetterDiscord host verification. See `README.md` and `docs/architecture.md` for current status.

## Goal

Build a Discord translation and writing-assistant plugin. Start with a Windows desktop plugin, while keeping the core logic portable for a future Android implementation.

The plugin has two isolated feature areas:

1. Input polishing and rewriting.
2. Channel message translation.

These features must not share user-facing state except common API provider settings when explicitly configured.

## MVP v0.1

### Platform

- Target BetterDiscord on Windows desktop first.
- Keep the project structure ready for a future Android plugin.

### Model Providers

- Support DeepSeek API.
- Support OpenAI-compatible API endpoints.
- Store API keys and provider settings locally.

### Input Polishing

- Read the current Discord input box content.
- Use a configurable prompt to polish, rewrite, or translate the user's draft.
- Support prompts such as:
  - Rewrite into natural English.
  - Make the message polite and fluent.
  - Preserve the original meaning and tone.
  - Convert mixed-language input into the selected target language.
- Return the result to the input box.
- Optionally support direct send after confirmation.

### Channel Message Translation

- Translate existing messages in a channel to a configured target language.
- Support manual translation through a right-click action or message button.
- Display translated text locally in the client.
- Keep this feature independent from input polishing settings.

### Configuration

- Separate settings for input polishing and channel translation.
- Separate prompt templates for polishing.
- Separate target language for translation.
- Configurable provider, model, endpoint, temperature, and max tokens.

## v0.2

### Additional Providers

- Add Google Translate provider.
- Add DeepL provider.

### UX Improvements

- Add quick action buttons.
- Add keyboard shortcuts.
- Add more polished right-click menu actions.
- Add a confirmation flow before replacing or sending polished text.

### Prompt Templates

- Natural English.
- Business polite.
- Game/chat style.
- Short and direct.
- Grammar fix only.
- Preserve tone, fix expression.

### Cost and Performance

- Add translation cache for repeated channel messages.
- Add request queue.
- Add basic rate limit handling.
- Add error display for failed API calls.

## v1.0

### Complete Settings Panel

- Full provider configuration UI.
- Prompt template management.
- Per-server and per-channel language settings.
- Import/export settings.

### Automatic Translation

- Optional automatic translation for selected channels.
- Per-channel enable/disable.
- Language auto-detection.
- Cache-aware rendering.

### Core Extraction

- Extract reusable logic into `translator-core`.
- Keep Discord desktop UI integration separate from provider logic.
- Prepare Android plugin integration by replacing only the UI injection layer.

## Recommended Architecture

```text
discord-ai-translator/
  core/
    providers/
      deepseek/
      openai-compatible/
      google/
      deepl/
    prompts/
    cache/
    language/
    tasks/
  desktop-betterdiscord/
    plugin-ui/
    message-actions/
    input-polish/
    settings-panel/
  android-later/
    README.md
```

## Design Principles

- Keep polishing and translation independent.
- Keep provider logic separate from Discord UI logic.
- Prefer OpenAI-compatible request format where possible.
- Avoid hard-coding provider-specific behavior into UI components.
- Store secrets locally only.
- Make the MVP small enough to test quickly inside Discord.

## First Implementation Phase

1. Create a BetterDiscord plugin scaffold.
2. Add DeepSeek/OpenAI-compatible request provider.
3. Add settings storage for API key, endpoint, model, and target language.
4. Add input polishing action.
5. Add channel message translation action.
6. Verify the plugin inside Discord desktop.
