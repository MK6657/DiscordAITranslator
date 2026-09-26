# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.4.0 - 2026-09-26

Pre-release: offline, installer and artifact checks pass; live Discord acceptance of the new settings window, quick panel and composer send path is pending.

### Settings window & quick panel

- The AI button next to Discord's user controls now opens a compact quick panel instead of the full settings window. It holds the auto-translate switch, this channel's rule, the target language, mask translations, hide original, translation position and a connection test, with "Open full settings" one click away. Each click opens or closes it once, however long the button is held; right and middle clicks do nothing. It stays next to the button when Discord moves the user panel, Esc closes it and returns focus, and Tab stays inside it only while focus is in the panel, so Tab in the message box still works.
- The AI button shows a status badge that differs in shape as well as colour: green dot = working, amber ring = translating or testing, amber triangle = waiting out a rate limit or cooldown, red "!" = needs you (missing or rejected key, quota used up, local service down, failed test, unusable API URL, URL or model not found), grey dash = not auto-translating in this channel. Hover shows a summary such as "Sakura local · Connected · Auto-translating in this channel". "Testing" appears only while a test or local health check is actually running, and the quick panel shows the last passed test's model and response time.
- The full settings window is now a moderate window (at most 920 × 760) with one title bar (title, version, live service status, close) and six tabs: Overview, Translate messages, Composer tools, Display, Advanced, and Data & diagnostics. Arrow keys and Home/End move between tabs, the last tab is remembered, and positions saved by older versions open the matching new tab.
- A search box above the tabs finds any setting by name or description, shows which tab it is on, and jumps to it with Enter or a click; Esc clears the search.
- Overview tab: a setup checklist (service, connection test, target language, auto-translate, this channel) with one-click Set up / Test / Turn on / Change buttons that hides once everything is done, plus status cards for message translation and composer polishing, each with a Test button.
- The connection card shows the last test next to its status, for example "Connected · Hy-MT2 · 820 ms · just now"; a failed test shows its full error.
- "Detect models" for Sakura local and OpenAI-compatible services lists the models the server reports, so you can pick one or keep "use the server's loaded model (local-model)". It only contacts the server when you click it.
- "Try a sentence" (translation) and "Try polishing" (composer) sit inside the connection cards and show the result with the time it took. They replace the old test mode.
- Help text and placeholders for endpoint, model and API key now fit the selected service, Sakura's key is marked optional, and the service list is split into AI models (also for polishing) and machine translation.
- Rows are easier to read and line up, and options that depend on a switch sit under it and say "Turn on … first" while it is off. Clicking a row's title or description no longer presses its first button (it could clear the diagnostic logs, start a history backfill or download a snapshot).
- The channel rule and translation position are segmented controls, the message Translate button is one choice (on hover / always / off), and manual-translation fallback services are ticked in a list and ordered with arrow buttons instead of typed as ids.
- Confirmations use Discord-styled dialogs instead of browser pop-ups: clear translation cache, clear diagnostic logs (new), reset Google usage, delete template and "Ask before sending". A dialog always ends, also when BetterDiscord falls back to its basic modal, and turning the plugin off cancels any open confirmation.
- Prompt templates: choosing a template only previews it, "Use template" applies it (and asks first if the prompt has unsaved edits), a new template is named in an inline field (saving inside Discord works again), and a status line says which template the prompt is based on, also after a change made in another open settings panel.
- Changing the interface language keeps the settings window and the quick panel open and switches them to the new language in place, on the same tab.
- Interface text was rewritten in both languages: one short sentence per description, the same words for the same things, positive switch labels, readable diagnostic summary labels and no internal codes. Hovering the shortcut button now says "Record shortcut".
- Settings follow Discord's own dark, light and custom themes, with a visible keyboard focus ring and no animation when the system asks for reduced motion. Inside BetterDiscord's plugin-settings dialog the panel fits again, so its close button is no longer cut off and short windows get no second scrollbar.
- On a screen without a channel (Home, the DM list, or server pages such as Browse Channels, Onboarding or Members) the channel rule is dimmed and says "Open a channel to set a rule for it". With channel translation switched off, the quick panel says the rule applies once it is on.

### Translation lines

- While a message is being translated, the chat shows a small "Translating…" chip instead of a blank bar. It stays on the same line inside reply previews and does not animate when the system asks for reduced motion.
- Error lines under a message say what went wrong in plain words and offer the fix: "Open settings" for a missing or rejected key, endpoint, model, quota or unusable API URL; "Test connection" and "Retry" when the local service is down (the line names the local service's own address); the wait time when there are too many requests, turning into "Retry" when the wait is over; "Retry" for everything else.
- Problems only you can fix (API key, endpoint, quota, local service down) show one notice per problem, even with failure pop-ups turned off. It comes back only after translation has worked again or the settings changed, not when you pass through a channel without auto-translate.
- Hover over a translated line, or Tab to it, for a small toolbar to copy it, translate it again without the cache, or hide it. The same actions are in the message's right-click menu. A hidden line stays hidden until you translate that message again, and a Retranslate that produces nothing usable keeps the previous line and shows a message.
- When part of a long message could not be translated, a note under the translation says which parts are missing and offers "Retranslate". Such a result is never saved as a complete translation, the original stays visible, and it is kept while on screen (and for 10 minutes after scrolling away) so it is not paid for again.
- New display options: translation style (faint background, dimmer text, or a "译"/"TR" tag) and translation text size (100% or 90%). Changing style, size or position restyles lines already on screen in one step without moving the chat you are reading.
- Masked translations can be revealed with Enter or Space as well as a click. With "hide original", the original shows while you hover the gray bar or reach the message with the keyboard, and clicking the translation's buttons or selecting its text works again. The gray bar is visible again; it had shrunk to a thin line.
- Translated lines carry their language and text direction, so Arabic, Hebrew, Persian and other right-to-left targets read and align correctly; the toolbar does not cover short right-to-left lines and its arrow keys follow the visual order.
- Messages with mentions, custom emoji or masked links are translated once and stay drawn, instead of being requested again and again without ever showing a translation. Manual translations no longer vanish on the next scroll or show raw `<@id>`/`**markdown**` text, and Retry on a failed manual translation works again.
- Standard emoji stay in the translated text, a literally typed `:name:` next to a real custom emoji stays text, and a message whose emoji cannot be placed is no longer requested over and over. Links or words that mention translate, i18n, intl or DeepL are no longer dropped from the text.
- With channel translation switched off, the per-message Translate buttons and the right-click item disappear; they return when it is switched back on.

### Translation services

- Google, Microsoft, DeepL and Baidu now translate into Spanish, French and Vietnamese, and the Test button checks the target language you actually use.
- DeepL returns Traditional Chinese when Traditional Chinese is selected; simplified results cached earlier for that setting are no longer shown.
- The Google API key is sent in a request header instead of the request URL.
- Google key pool: a per-minute limit pauses a key for about a minute and a daily limit waits for Google's daily reset, instead of pausing until month end. When every key is only cooling down, requests wait and say when the first key is back, without reporting the monthly quota as used up. One notice covers the whole pool and appears only when no key is left. A mistyped or expired key is reported as invalid and pauses for 30 minutes. "Reset Google stats" and a passing Test bring a paused key back, the Test uses a key that is not cooling down and names a failing key by its label, and the usage line shows keys that are cooling down.
- Google key pool: removing a key and pasting it back later keeps its monthly usage, and characters of requests cancelled after they were sent count toward that usage.
- Baidu errors are recognised: blocked IP, service not enabled, unsupported target language, rejected parameters, too frequent and low balance. Translation pauses with a clear message that includes Baidu's error code, instead of retrying silently or saying the API key was rejected.
- An empty DeepSeek balance (HTTP 402) is reported as a quota problem, and numbers inside error replies no longer trigger false quota errors.
- OpenAI-compatible services: a 404/405 reply or an unknown model name reads "Endpoint or model not found. Check the API URL and the model name."
- Local models: an empty or garbled answer to one message retries only that message instead of pausing automatic translation for a minute. After the server loads another model, messages are translated again with it, results are saved under the model that actually answered, and cached lines still show while the local server is offline.
- A request that succeeds with a different key (public bilingual on the polish key, or a fallback service) no longer marks a broken translation key as connected.
- Error messages are shown in plain words in both languages, for example a cut-off model reply or a failed bilingual write, instead of internal codes.

### Automatic translation & retries

- The channel rule "Always translate" now works as an allow-list: that channel is auto-translated even when the main auto-translate switch is off. "Never translate" always wins and "Follow main switch" follows the switch. Rules saved by 0.3.0 keep working as they did there: a channel set to "Enable in this channel" (which followed the main switch in 0.3.0) becomes "Follow main switch", so no channel starts auto-translating after the upgrade.
- The channel rule control always edits the channel it was opened for: if Discord switches channels while settings are open, it switches to the new channel instead of copying one channel's rule onto another.
- A reply cut off at the length limit is retried once with a larger limit and a longer timeout. If it is cut off again, the message waits 2 minutes and then twice as long each time, up to 30 minutes, instead of being sent again every 4 seconds; a timeout of that retry no longer counts as the local service being down.
- A batch request that times out or hits a network error no longer blocks those messages for 6 hours; they are retried with normal back-off. If a batch reply cannot be read or is cut off, each message is sent again on its own.
- Long messages stop sending further parts as soon as the service reports a rate limit, a login or quota problem, a server error, a timeout or an unreachable local server. Parts already translated before a timeout are kept and shown as a partial translation.
- One click on Translate sends at most 8 requests for a short message and up to 24 for a long one, and stops at the first error that retrying cannot fix. Rescuing one hard part no longer uses up the requests the later parts need.
- A single message that keeps timing out no longer raises the cooldown for the whole service and stops holding a queue slot after three tries. Repeated timeouts or server errors while prefetching off-screen messages back off (10 s, doubling up to 2 minutes) instead of retrying every 4 seconds.
- Changing translation settings cancels requests that are still running, so a local model is not kept busy with work whose result would be thrown away.
- Short replies such as "thanks 🙏" or "ok 👍" (English target), and messages that are only a link or custom emoji plus an emoji, are skipped again instead of spending a request.
- Discord message markup is converted to what the chat shows before it is sent; hidden spoilers, timestamps and unknown mentions are never sent from Discord's message store, and bot messages written with emoji shortcodes such as `:white_check_mark:` are translated from the text on screen.
- Re-enabling the plugin reads messages edited while it was off, moving focus inside Discord no longer triggers full rescans, and a closed chat's message list is no longer kept in memory.

### Message box tools

- Polish and public bilingual keep line breaks: multi-line drafts are no longer glued together, and public bilingual messages no longer fail their own check and roll back.
- Mentions, role and channel mentions, custom emoji, quoted lines and zero-width spaces in a draft are kept through Polish, public bilingual and Restore original, so an "@everyone" written with a zero-width space stays non-pinging.
- A result that arrives while you type in another field, after you changed the draft, or after the channel changed is no longer dropped or forced into the message box. It opens in a panel with Copy and "Insert into input", and inserting it there counts as a normal write.
- A failed write no longer undoes your new typing or several of your earlier edits, and can no longer leave the message box empty. If you start typing right after a result is inserted, it is not reported as "not inserted"; follow-up steps (bilingual after polish, ask before sending) are skipped instead.
- "Ask before sending" shows the polished text in a Discord-styled dialog and, after you confirm, sends it with Enter in the message box. It no longer clicks a composer button, which on English Discord could open the "Send a gift" dialog, and nothing is sent if the draft or the message box changed while the dialog was open.
- Public bilingual leaves code untouched, keeps the spoiler closed when the draft ends with a backslash or "|", and running it again produces a new translation instead of nesting the old one. Draft translations are no longer saved to disk, and the "Current flow" row shows the service and target language a bilingual message really uses.
- Restore original disappears once the draft is back to the original.
- Turning off polishing hides the Polish button and turns off its hotkey; turning off translation hides the Bilingual button. Both come back when the feature is turned on again. The polish hotkey shows progress, and busy buttons keep their short labels in narrow windows.
- Hotkey recorder: click the shortcut button, then press a combination with Ctrl, Alt or Win (Shift is optional). Esc cancels, and recording stops when you close settings, click elsewhere or wait 10 seconds, so later typing is never captured. Shift+letter and copy/paste shortcuts are rejected, and an unusable hotkey saved by an older version is reset to Ctrl+Alt+P.

### Data & reset

- "Reset to defaults" moved to a Danger zone at the end of Data & diagnostics and opens a dialog that lists what returns to defaults. "Keep API keys, the Google key pool and prompt templates" is ticked by default (untick it to erase them too), and the interface language is kept. Each kept key stays with the endpoint and model it was used with, and a key you had cleared stays cleared.
- After a reset, context menus, buttons, translation lines and diagnostics follow the new settings at once, without a restart. Open settings windows reopen on the tab they showed and keyboard focus returns to the Reset button.
- The translation cache and the diagnostics log are saved in their own files (`DiscordAITranslator.cache.config.json` and `DiscordAITranslator.diagnostics.config.json`), so changing a setting no longer rewrites a multi-MB file. Existing data moves over on first start, nothing is deleted until the new file is saved, and earlier diagnostics entries are kept.
- The cache limit counts messages, so 4000 means about 4000 translated messages, not about 2000, and cache hits no longer keep entries longer than the lifetime you chose. After a downgrade and re-upgrade, a cache you cleared stays cleared.
- Pending translations, settings and Google usage are saved when Discord reloads or quits.
- A damaged settings file no longer stops the plugin from starting; if the settings file cannot be read at all, a notice says that changes will not be saved.
- Diagnostic exports and the settings snapshot show only the model file name, not the full local path, and include the number of "Always translate" channels. Clear logs, Copy and Export refresh the diagnostic summary at once.

### Installer & tooling

- `npm run plugin:install` (and its dry run) now refuses to run from a terminal inside a packaged desktop app, whose AppData writes are redirected to that app's private copy. It explains that a normally started Discord would not see the install and exits with code 2 without changing anything. Add `-AllowRedirectedAppData` to install into the private copy on purpose.
- Local agent state (`.claude/`) and browser profile folders are ignored by Git, and `npm run release:check` blocks a staged browser profile, force-added ignored files, nested repositories and nested `.claude`/`.agents` folders. The secret and private-path scan now reads exactly what Git would publish.
- The critical-chain contract describes the v0.3.0 cached-draw pass, its stillness rule and its placement-aware scroll correction instead of forbidding every off-screen write.

### Upgrade and downgrade notes

Updating from 0.3.0 needs no manual steps. What changes for existing users:

- On the first start, the translation cache moves out of the settings file into `DiscordAITranslator.cache.config.json`, and the diagnostics log into `DiscordAITranslator.diagnostics.config.json`, both next to the plugin. The old copy is deleted only after the new file is saved, so cached translations still show right after the update.
- The cache limit ("Max cached messages") now counts translated messages instead of cache entries. 0.3.0 used about two entries per message, so the same number now holds about twice as many messages.
- Channel rules keep doing what they did in 0.3.0. "Inherit global" becomes "Follow main switch" and "Disable in this channel" becomes "Never translate". "Enable in this channel" also followed the main switch in 0.3.0, so it becomes "Follow main switch": no channel starts auto-translating after the update, and nothing is sent to a translation service while the main switch is off. To translate a channel even with the main switch off, choose "Always translate" for it.
- "Reset to defaults" keeps your API keys, the Google key pool and prompt templates unless you untick that option. In 0.3.0 it erased them.

Going back to 0.3.0:

- 0.3.0 starts normally and keeps all settings, API keys and the Google key pool. It ignores the options that are new in 0.4.0.
- 0.3.0 reads the cache and the diagnostics log only from the settings file, so it starts with an empty cache and translates messages again, and starts a new log. It leaves the two new files alone.
- 0.3.0 counts the cache limit in cache entries again, so the same number holds about half as many messages.
- A channel set to "Always translate" acts as "Enable in this channel" in 0.3.0, so it follows the main switch there. After you update to 0.4.0 again, channel rules have their 0.4.0 meaning, so a channel you set to "Enable in this channel" while on 0.3.0 becomes "Always translate".

## 0.3.0 - 2026-09-25

Pre-release: offline, installer and artifact checks pass; live Discord acceptance of the scrolling changes is pending.

- Draw cached translations as soon as the chat has been still for about 0.1 s, including messages Discord keeps mounted just above and below the visible chat, instead of waiting out the 0.55 s scroll pause, the 0.45–0.9 s settle window or the 2.2 s jump cooldown. A bounded idle-time pass (about 3 ms, memoised per Discord message ID) does this without model requests; new model requests keep the existing pauses.
- The scan and the draw step now share one definition of "visible", so messages behind the channel header or message box are no longer marked for drawing and then rejected.
- Scroll corrections depend on where the line lands: above the visible chat the visible part stays in place, below it nothing changes, and a chat pinned to its newest message stays pinned. The plugin's own corrections no longer count as user scrolls.
- Show the version in the settings header, the start notification, settings snapshots and diagnostics exports. `npm run plugin:check` compares the installed plugin with the repository build and detects private BetterDiscord copies kept by packaged apps, redirected AppData writes and a Discord that will not load BetterDiscord; the installer prints the installed and replaced versions.
- Diagnostics exports record whether Discord's chat scroller uses native scroll anchoring. The build embeds only the version from package.json, and source checks keep package-lock.json in step.
- Allow 1–10 automatic translation requests for both local and cloud providers; preserve saved values and explain local server capacity in settings.

- Explain and disable unavailable local-provider scheduling controls (fixed DOM discovery and cloud fallback), instead of accepting changes that silently revert or have no effect.
- Distinguish request cancellation from timer expiry using explicit error codes and localized messages. Cancelled model discovery and long-text rescue no longer continue with new requests; cancelled work does not penalize provider health or populate failure records. Reject late responses from transports that ignore abort.
- Localize invalid/unsafe endpoint errors and classify them as configuration/client failures; retain the actual timeout message for local-provider timeouts.
- Refuse new API requests after the plugin stops until it starts again, so retry, rescue and provider-fallback loops cannot send message text once disabled. A cancelled fallback attempt now ends the fallback chain instead of trying the next provider.
- Apply the local provider's fixed message-intake mode when switching providers from the settings panel, so the locked control always shows the value actually in effect.
- Draw cached translations again when Discord rebuilds messages during scrolling. A recent render now only blocks a duplicate model request; it no longer hides a cached translation for up to 60 seconds, which also affected other messages with the same text.
- Allow nearby-message prefetch for local providers. As with cloud providers, prefetch uses one spare request slot only while no visible message is waiting, so it needs a concurrency of 2 or more.
- Add a settings snapshot download under Diagnostics for troubleshooting: switches and numbers as-is; API keys and other secrets hidden; remote endpoint query strings and embedded credentials removed; prompts summarized; channel IDs hashed.

- Reject all API redirects so only explicitly configured endpoints receive translation text and provider headers; cover HTTP 301/302/303/307/308 with real loopback HTTP fixtures against both source and generated artifact. Configure canonical endpoint URLs directly.
- Fix installer error cleanup deleting the original plugin when a backup collision occurs before replacement. Roll back only after this installation has replaced the destination; add collision-preservation and failed-first-install cleanup regressions.
- Refresh GitHub CI actions to verified, full-SHA-pinned checkout v7.0.1 and setup-node v7.0.0, disable persisted checkout credentials, and bound job runtime. Core test discovery now includes all *.test.js files.
- Follow-up from the first GitHub Windows CI run: importing Utility alone did not resolve Get-FileHash on hosted runners. Compute installer SHA256 through disposable .NET streams instead; installer fixtures deliberately make Get-FileHash unavailable to prevent regression. Runtime plugin output remains unchanged.
- Repository intake (2026-09-08): explicitly load the PowerShell Utility module in the installer and its test entry point so fresh Windows PowerShell processes resolve Get-FileHash reliably. Add Chinese/English repository documentation and preserve the July c snapshot as the runtime baseline; no plugin runtime behavior or version change.
- Modularization phase 6 pre-steps: the auto-translation queue core (state, scheduling, failures, decisions, channel policy, timing windows — 142 methods) moves to `src/auto-translation/queue-core.js` and the request pipeline (scan work, batch/long-text requests, retries, request options, text eligibility — 98 methods) to `src/auto-translation/request-pipeline.js`, both as behavior-preserving facade delegations; DOM rendering, candidate intake and observer code intentionally stay in the main file for the phase 7 adapter boundary. A passive read-only task-state view (`src/auto-translation/task-state.js`) now exposes unified per-key snapshots and an invariant checker over the parallel collections, with lifecycle regressions asserting consistency across enqueue/take/in-flight/finish/remove and the render queue — the seam the phase 6 state machine will migrate collections behind. Main source shrinks further to ~13,900 lines.
- Modularization phases 1-5 (see `docs/refactor-direction-2026-07-26.md`): shared constants move to `src/constants.js`; the model-task core now resolves an explicit TranslationResult value (`runModelTaskWithResult`, replacing the shared-promise stamping side channel while `runModelTask` keeps its string-typed surface); settings persistence/migration/task-config/prompt-template CRUD move to `src/settings/settings-store.js`; the provider layer (registry, endpoint policy, request builders, parsers, error mapping, fallback policy, Google key pool, local-provider health) moves to `src/providers/provider-layer.js`; the translation cache (keys, aliases, TTL, compact codec, negative lookups, persistence) moves to `src/cache/translation-cache-store.js`; output validation moves to `src/validation/output-guard.js` and diagnostics recording/persistence to `src/diagnostics/diagnostics-recorder.js`. All extractions are facade delegations — the main class keeps its full method surface and every cross-subsystem call routes through it — so runtime behavior and the regression-suite contract are unchanged. Main source shrinks from ~26,000 to ~18,300 lines.
- Honor `ui.autoTranslateIntakeMode` in the incremental message scan: BDFDB/store identity enrichment and store-full text upgrades now apply to the primary scan path (previously only cache-only scans and history backfill saw them), intake diagnostics report the real configured mode, and the one-store-snapshot-per-scan constraint is preserved across idle slices. Covered by new differential parity regressions against the one-shot candidate path.
- Extract the static stylesheet to `src/styles.js` and the interface string tables to `src/i18n.js` (verbatim moves, phase 0.5 of the modularization plan in `docs/refactor-direction-2026-07-26.md`); the main source shrinks by ~3,100 lines with byte-identical style content and unchanged string tables.
- Fix Baidu translation of multi-line messages: previously only the first line's translation survived and batched requests could shift translations onto the wrong messages; request rows are now tracked per message and regrouped on parse.
- Render translations for messages that mix custom emoji with plain `:text:` tokens (such as times like `12:30:45`), which previously suppressed the whole translation; exact emoji restoration is still required, and unrestorable emoji now also drop the stale cache entry instead of marking the message rendered.
- Keep provider-fallback results out of the primary provider cache when concurrent identical requests share one response (deduplicated callers now see the fallback marker).
- Allow provider fallback and restore request success/error diagnostics for public bilingual input when it runs on the polish provider profile, and for provider-fallback requests themselves.
- Invalidate cached message text for content mutations that arrive while media-viewer quiet mode is active, so a message edited behind the viewer cannot keep serving its pre-edit translation.
- Only reset the active prompt template and invalidate queued work when the deleted template is the active one.
- Stop the settings test-run from temporarily mutating live prompt settings; the test prompt is now passed as a per-request override.
- Include the language pair in direct-translate request deduplication keys (Google/DeepL/Baidu) so same-text requests with different target languages never share one result.
- Expire terminal auto-translation failures after six hours and cap the per-message failure map, preventing unbounded growth in long sessions.
- Clear recent-render suppression, provider notice timestamps, and composer action groups on stop so a restart re-renders translations immediately and leaves no orphan DOM.
- Reduce scroll-time layout work: queue sorts compute each item's rank once instead of per comparison, full request batches skip per-item readiness DOM checks, Discord theme lookups are briefly memoized, diagnostics decisions resolve the queue type once, and zh-CN interface strings moved from a per-call fallback object into the locale table.
- Remove unreachable legacy code paths and unused settings-tab helpers left over from earlier refactors.

- Keep Discord scrolling and selection responsive by avoiding layout-heavy visibility probes, cloning message DOM only as a fallback, caching extracted text until relevant mutations, and skipping scans for presentation-only changes.
- Bound Sakura local translation to one active request and reuse one Discord message-store snapshot per scan.
- Reduce diagnostic persistence overhead with high-volume event aggregation, a 500-entry cap, compact records, delayed idle writes, and immediate cleanup when diagnostics are disabled.
- Rebind observers after Discord replaces the chat root and idle-slice message work for local, cloud, and manual-button-only modes.
- Skip known low-information repeated utterances while preserving explicit Turkish input, and reject explanatory model output that asks for more context instead of translating.
- Require Discord custom emoji tokens to match the source exactly before rendering or caching, and suppress the whole translation if an emoji image cannot be restored.

## 0.2.0 - 2026-07-13

- License the project under MIT and document contribution provenance requirements.
- Complete the GPL reference similarity review with a low-risk, independent-implementation decision.
- Raise the supported contributor and CI baseline to Node.js 22 and 24.
- Pass the first Windows 11 Discord Stable and BetterDiscord load, settings, and lifecycle smoke test.
- Render preserved Discord custom emoji tokens as cloned emoji images and drop unmappable duplicates.
- Establish `src/` as canonical source and keep the root BetterDiscord plugin as a reproducible generated artifact.
- Add locked npm builds, focused module tests, Windows CI, installer fixture tests, and release gates.
- Extract settings schema, composer write coordination, and translation render scheduling helpers.
- Prevent duplicate lifecycle startup and block settings persistence after a failed settings read.
- Add automatic translation scheduling, cache persistence, diagnostics, long-text rescue, channel policy, history backfill, and multiple translation providers.
- Isolate fallback credentials and prevent fallback results from contaminating the primary provider cache.
- Reject unsafe remote HTTP endpoints and embedded URL credentials.
- Prevent settings read failures from overwriting saved configuration.
- Add manual translation request ownership, exact source checks, and configuration snapshots.
- Add transactional BetterDiscord profile enablement and rollback to the Windows installer.
