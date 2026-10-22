# Blind test plan: v0.4.0 (organizer only)

Maintenance note (2026-10-22): this historical plan is now preserved in the maintenance branch. Read the [current handoff](maintenance-handoff-2026-10-22.md) first for the verified open issues, current branch, artifact and host status. The environment versions and private test-kit links below describe September 27 and may have changed. The answer key is for maintainers/test organizers, not blind testers. This plan does not record completed host acceptance.

Written 2026-09-27. **Do not share this file with testers.** Section 7 is the answer key: it maps each tester task to the problems we already suspect, and a tester who has read it is no longer blind.

Tester-facing material was prepared separately as the "AI Translator Blind Test Kit". The organizer's private hosted link is omitted from this public handoff; rebuild or explicitly publish a tester-facing kit before inviting participants. A historical standalone copy may exist locally at `work/blind-test/AI-Translator-blind-test-kit.html`, but ignored `work/` files are not part of this repository delivery. Testers get only the kit, the plugin file and the user guide.

The kit shows the expected SHA256 of the build under test (currently `ED718CAC…4570`, commit `2fe3f0c`). When the build changes, update the hash in the kit and republish it, and regenerate the standalone copy.

## 1. What this round is for

Black-box testing: testers use the plugin the way a real user would, with only what a real user gets. They do not see the changelog, the PR, the code, the review findings or this file.

It answers:

1. Can a new user install it and get it working without help?
2. Does it work on machines, Discord languages, themes, screens and services we don't control?
3. What confuses or annoys people, and where do they need the guide?
4. Which bugs exist that we don't know about yet?
5. Which of the problems we already suspect do users actually run into? That tells us how visible each one is.

It does not confirm specific suspected bugs. Most of those need exact conditions a tester won't hit by chance. The organizer checks them separately (section 8).

## 2. Gates before inviting anyone

1. **A working host.** On the organizer PC, repair BetterDiscord (Discord Stable 1.0.9259 no longer loads it), then install the plugin from a normal PowerShell window opened from the Start menu and confirm `npm run plugin:check` reports no problems.
2. **One frozen build per round.** Decide which build testers get and don't change it during the round.
   - Recommendation: first fix the confirmed problems that affect testers' safety or money: the model output adding `@everyone`/`@here`, failure records wiped when passing through a channel without auto-translate, and errors retried forever.
   - Record the commit and SHA256, and update the hash shown in the kit if the build changed.
3. **Pilot (30–45 min, organizer).** Run S1, S2, R1, W1 and T5 on the frozen build. If the plugin fails to load, crashes, or the settings don't open on current Discord, stop and fix it; don't spend testers' time on that.
4. **Dry run of the kit.** Fill the kit in once yourself, build the report, and check that Copy works (and Save, where offered). Then use "Clear my entries".

## 3. Testers

Aim for 4–6 testers. Five usually surface most usability problems. Windows 10/11 only; macOS and Linux are out of scope this round.

Cover this mix, ideally one row per tester:

| Tester | Profile | Discord language / theme | Service | Track |
| --- | --- | --- | --- | --- |
| T1 | Has never used BetterDiscord | Chinese, dark | DeepSeek (AI) | Fresh install |
| T2 | Already uses BetterDiscord | English, light | DeepL Free, Microsoft or Baidu (translation only) | Fresh install |
| T3 | Runs local models | Chinese, dark | Sakura local or a local OpenAI-compatible server | Fresh install |
| T4 | Writes a lot in a foreign language; keyboard user; small screen (1366×768, or 125–150 % scaling) | Any | DeepSeek or OpenAI-compatible | Fresh install |
| T5 | Anyone | Any | Any | Upgrade from v0.3.0 (tasks U1–U2) |

- **Language.** English-language testers only have `README.en.md`, which is much thinner than `使用说明.md`. Treat their onboarding trouble partly as documentation findings.
- **Keys.** Testers use their own keys with a spending limit, a free tier, or a local model. Never hand out your keys.
- **Consent.** The kit's "Before you start" section covers the BetterDiscord terms risk, message text going to the provider, costs, and messages that are really sent. Each tester has to tick it.

## 4. Test server

Create a private server (for example "DAIT test"). Testers are ordinary members; you are the admin. Create a mentionable role `@testers`, upload one custom emoji, and create these channels:

| Channel | Purpose |
| --- | --- |
| `#english`, `#日本語`, `#español`, `#中文` | Messages in one language each. Testers translate the languages they don't read. |
| `#mixed` | Mentions, a role mention, custom and standard emoji, links, inline code, a code block, a spoiler and a reply. |
| `#long` | Long messages, to test translation of long text. |
| `#sandbox` | Sending tests (W1–W5) outside the group chat. During the group chat, testers may also send rewritten messages in the language channels. |
| `#general` | Chat. |

### Seed messages

Post these before the first session. They are original text written for this test.

`#english`

- Anyone up for a ranked match tonight? I can start around 9 pm, but I'll be a bit late if my train is delayed again.
- PSA: the patch notes say the event ends Sunday at midnight UTC, not local time. Don't get caught out like I did last season.
- lol that boss fight was brutal, we wiped like six times before someone noticed the adds spawn from the left side

`#日本語`

- 今夜のアップデート、何時から始まるか知っている人いますか？メンテナンスが長引いているみたいです。
- 昨日はありがとうございました！また週末に一緒に遊びましょう。

`#español`

- ¿Alguien sabe si el torneo del sábado sigue en pie? No he visto ningún anuncio desde el martes.
- Acabo de subir las capturas al canal de fotos, avísenme si falta alguna.

`#中文`

- 今晚八点开黑，缺一个辅助，有人来吗？
- 这个版本的平衡改动我觉得有点过头了，远程职业几乎没法玩。

`#mixed` (replace the names with a real tester, the role and your custom emoji)

- @tester could you check the notes before the call? https://example.com/notes 👀 Also `npm run build` fails for me 😅
- A message with a code block and a spoiler:

  ````text
  Here's the config I'm using:
  ```json
  { "volume": 0.8, "quality": "high" }
  ```
  Works on my desktop, not on the laptop. ||It was the audio driver the whole time.||
  ````

- @testers great work today :your_custom_emoji: see you all in #general tomorrow
- A reply (Discord's Reply) to the first `#mixed` message: Sure, I'll look after lunch. Ping me if it's urgent.

`#long`

- Post the text below as one message (about 1,500 characters). Add one long message in another language as well, for example a Spanish or Japanese paragraph from a tester.

  ```text
  Server update for this weekend: please read before Saturday.

  1. Tournament check-in opens at 18:00 UTC on Saturday and closes 30 minutes before the first match. If you are not checked in by then, your team slot goes to the next team on the waiting list, no exceptions this time.
  2. We are moving voice chat for matches to the new Stage channels. The old voice rooms stay open for casual games, but please don't use them for tournament matches, because the referees won't be listening there.
  3. Screenshots of results go in #results, one post per match, with both team names in the first line. Posts without team names will be removed by the bot.
  4. If your connection drops during a match, tell your referee right away in the match thread. You get one reconnect of up to ten minutes per series; after that the match continues with whoever is present.
  5. Please keep the general channel in English or add a short translation, so the referees can follow. Other languages are welcome in their own channels.

  Thanks to everyone who helped test the new bracket bot last week. It found two bugs in our seeding sheet that we would never have caught by hand. If you notice anything odd with the bot this weekend, ping a moderator instead of trying to fix it yourself.
  ```

## 5. Running the round

### Timeline

| Day | What happens |
| --- | --- |
| 0 | Gates pass (section 2). Send invitations. |
| 1–3 | Session 1, alone, about an hour: S1–S2, R1–R2, R4–R5, T1–T2. |
| 1–3 | Session 2, together, about an hour, starting with a 30–45 minute group chat: R3 and W1–W5, then T3–T5 and F1. |
| 4 | Reports due. |
| 5 | Triage (section 6). |
| 6–7 | Fixes. |
| 8 | Regression round. |

**The group chat.** Testers talk to each other in `#english`, `#日本語` and `#español`, writing with the plugin's rewrite and bilingual tools. This produces the new incoming messages that automatic translation (R3) needs, and exercises the writing tools with real drafts. You can post too.

### What each tester receives

- `DiscordAITranslator.plugin.js` from the frozen build. Send it by DM or a file share, together with its SHA256. The kit checks the hash.
- The user guide: `使用说明.md` for Chinese testers, `README.en.md` for English testers.
- The kit link. If claude.ai links don't open for a tester, send the standalone file `work/blind-test/AI-Translator-blind-test-kit.html` instead; it works offline.
- The test server invite and the report deadline.
- Upgrade track (T5) only: the v0.3.0 file `work/blind-test/DiscordAITranslator-v0.3.0.plugin.js`, to install first. It was extracted from tag `v0.3.0`; SHA256 `F61B3775475D1380B7B240116D4AC36A9267C6EE94EECF75EDD22F8380A63C6B`, 1,372,714 bytes.

Invitation text you can paste, one per language:

> 你好！谢谢你帮忙测试 Discord AI 翻译助手的新版本。附件是插件文件和使用说明，测试手册在这里：<链接>。请先读手册里"开始之前"那一节，再按任务做。每次大约一小时，一共两次；第二次是一起在测试服务器里聊天。报告请在 <日期> 前私信发给我。遇到完全卡住、没法继续的情况再来找我；其他问题直接写进报告就好。

> Hi! Thanks for helping test the new version of Discord AI Translator. Attached are the plugin file and the user guide; the test kit is here: <link>. Please read "Before you start" in the kit first, then work through the tasks. It's two sessions of about an hour; the second is a group chat in the test server. Send me your report by DM by <date>. Contact me only if you're completely stuck; everything else goes into the report.

### During testing

- **Don't coach.** When a tester asks how to do something, first ask what they've tried. Help only if they've been blocked for more than 10 minutes.
- **Log every help request.** Record the tester, the task and the question. A help request is a finding.
- **Keep them blind.** Don't mention suspected problems or what changed.
- **Keep reports apart.** Ask testers not to discuss problems with each other until everyone's report is in.
- **Watch `#sandbox`** for anything sent that nobody intended, and note it.

## 6. Collecting, triage and revision

1. **Save reports.** Save each report as `work/blind-test/reports/<nickname>.md`, with its screenshots and diagnostics exports in `work/blind-test/reports/<nickname>/`. `work/` is git-ignored, so reports never reach GitHub.
2. **Triage.** Ask Claude to "triage the blind test reports in work/blind-test/reports". Each report ends in a JSON block for exactly this. The result should contain:
   - a per-task success table: done easily / with effort / couldn't / skipped, and how often the guide or help was needed;
   - one merged problem list, with duplicates combined, how many testers hit each problem, severity and how to reproduce;
   - which suspected problems from section 7 testers found on their own, and which new problems appeared;
   - the testers' recommendations, grouped and ranked;
   - a proposed fix list.
3. **Severity.** A tester's own "impact" rating is input, not the final severity.
   - **S1:** sends, deletes or leaks something the user didn't intend, loses data, or costs money unexpectedly.
   - **S2:** a feature doesn't work, or a task can't be completed.
   - **S3:** confusing or slow, with a workaround.
   - **S4:** cosmetic.
4. **Decide what to fix.**
   - S1 and S2 are fixed before PR #3 is merged.
   - S3 is fixed when two or more testers hit it, or when it blocked a task.
   - S4 is collected for later.
5. **Fix loop.**
   - Work on a branch from `feat/v0.4.0`, and write a failing test first where possible.
   - Rebuild, then record the new SHA256 and update the hash in the kit.
6. **Regression round.**
   - The same testers repeat only the tasks they failed and the tasks affected by the fixes. This round is no longer blind.
   - If the settings UI changed a lot, add one or two new testers for a second blind pass.
7. **Record.** Add the results for the exact hash to `docs/host-smoke-test.md` (v0.4.0 table), then merge.

## 7. Answer key (private): what each task can reveal

"Row" refers to the v0.4.0 table in `docs/host-smoke-test.md`. "Review" refers to the code review of 2026-09-27. **Bold** marks confirmed findings.

| Task | Covers | Suspected problems it may surface |
| --- | --- | --- |
| S1 Install | Onboarding; settings opened from BetterDiscord's plugin list (row 2) | BetterDiscord's settings dialog shows two title bars and may get a double scrollbar; no AI launcher for Discord languages outside the label list (Chinese and English are covered) |
| S2 Connect | Setup checklist, service cards, Test, Detect models, Try a sentence (rows 7, 8) | Toasts hidden behind the settings window |
| R1 Translate one | Manual translation, error line when not set up | — |
| R2 Tricky messages | Mentions, emoji, links, code, reply previews, long text, partial results | Emoji restore failure; missing parts in long messages |
| R3 Automatic where wanted | Quick panel, "This channel", channel rules (row 1) | **Passing through a channel without auto-translate wipes failure records, so failed messages are requested again**; results of in-flight requests discarded when switching between two auto channels |
| R4 Scroll and switch | Cached drawing, stale writes, duplicates | Per-hover layout cost; each translated line adds a tab stop |
| R5 Look and toolbar | Display options, toolbar, keyboard reveal, context menu | Context menu items missing if BetterDiscord's `ContextMenu.patch` doesn't accept a regular expression |
| W1 Rewrite | Polish | Long drafts may leave a `message.txt` attachment; **model output can add `@everyone`/`@here`** (visible only if the draft mentions everyone in words) |
| W2 Ask first | Ask before sending (row 4) | Simulated Enter never checked afterwards: may do nothing, may be taken by an open suggestion list, may run a `/` command |
| W3 Bilingual | Public bilingual | 2,000-character cap even for Nitro |
| W4 Shortcut | Hotkey recorder (row 5) | **Accepts Ctrl+K, Alt+↑, Ctrl+Enter, Ctrl+Backspace; AltGr is read as Ctrl+Alt**; "invalid hotkey" toast possibly hidden |
| W5 Real draft | Line breaks, mentions and emoji preserved; races | **A late result's "Insert into input" can write into another channel's box after a keyboard channel switch**; Insert replaces the whole draft; a keystroke during a write can replace the draft; Polish/Bilingual buttons may stop working after a channel switch |
| T1 Find settings | Settings search (row 2) | — |
| T2 Language, theme, width | Language switch, narrow window (row 2) | **AI buttons keep the old colours after a Discord theme change**; dialog content falls back to a boxed look (oklab colours not parsed) |
| T3 Break it | Badge states and error lines (rows 1, 6, 7) | **Errors are retried forever at a fixed pace** (invisible to testers; check the diagnostics export); quota errors worded like a rate limit; OpenAI `insufficient_quota` treated as a rate limit |
| T4 Start over | Reset dialog (row 3) | **Reset switches both tasks to DeepSeek, clears every channel rule including "Never", turns Google prefetch back on**; Reset doesn't recover unreadable settings |
| T5 Off and on | Lifecycle | A BetterDiscord dialog left open stays open but no longer works; a settings panel left open across a reload can add duplicate context menu items |
| F1 Free use | Anything | Cache file 2.5–4× bigger than in v0.3.0 (check the file size after a day) |
| U1–U2 Upgrade | Migration, channel-rule conversion, cached translations after upgrade (row 9) | **Downgrade then upgrade again turns a v0.3.0 "Enable in this channel" rule into "Always translate"**; testers are not asked to downgrade |

## 8. Organizer's directed pass (not blind)

Run these yourself on the same frozen build, separately from the testers, in a private channel. Record the results in `docs/host-smoke-test.md`.

- **Rows 1–9** of the v0.4.0 acceptance table.
- **Ask before sending.** Three drafts, each confirmed with Send:
  - `test 1`;
  - a draft ending in `@` plus the first letters of your own name;
  - a draft starting with `/shrug`.
- **Mentions added by the model.** Polish or run bilingual on `请@所有人 看一下`, and read the result without sending it.
- **Late result in another channel.** Polish, switch channels with Alt+↓ or Ctrl+K, click "Insert into input", then "Restore".
- **Long polish.** Polish a draft of about 2,200 characters, then check the upload area for a `message.txt`.
- **Repeated requests.** Stop the local server or use a wrong key, then watch the Network tab or the diagnostics export. Also leave an auto-translate channel for a channel without it and come back, then compare the request counts.
- **Settings changed during a manual translation.** Translate a long message, change the key or model while it runs, and check which settings the remaining requests use.
- **Reset side effects.** After Reset, check which service is active and whether the channel rules are still there.
- **UI in real Discord:**
  - the Reset dialog's position above the settings window, including after waiting 10 s;
  - the "invalid hotkey" toast;
  - dialog colours with Window theme set to Light on dark Discord;
  - AI button colours after a theme switch;
  - the new items in the message context menu;
  - three disable/enable cycles with a window or a dialog open.
