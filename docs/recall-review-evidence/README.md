# Recall review verification

Verified on 2026-09-23 against baseline
`3429cb8dd2bd8bbd10504d54fae6ebc9f5398f21` (merged PR #38), using the build recorded
in [native-smoke.json](native-smoke.json). The installed bundle hash matches the
repository build. Only synthetic notes and a disposable profile/vault were used;
no credentials or personal content. The only community plugin was Veynrel.

Native host: Obsidian **1.12.7**, Electron **39.8.10**, Linux desktop. The fixture
contains four notes/cards, English and Russian content, outside-section `::`
prose and a long note path. A controllable epoch clock drives review decisions;
Obsidian renders the real UI and persists through its real DataAdapter.

| Native check | Observed result |
| --- | --- |
| Startup; Health/Findings/Discover | Zero Recall IO, Markdown reads/enumeration, network or writes |
| First Recall open | One metadata existence check; missing first-run state; no scan/write |
| Find flashcards | Two Markdown enumerations (capture/freshness), four note reads, one cards write; four active/due/new cards |
| Question boundary | Answer text absent from DOM; rating buttons absent; question focused |
| Reveal | Native Space and Enter activate Show answer; four intervals match the service |
| Ratings | Again, Hard, Good and Easy each commit exactly one review; clicked time advanced 5 seconds beyond captured decision time; resulting schedule equals preview |
| Double input / saving | Held adapter write prevents advance, locks all ratings and ignores subsequent shortcuts; rapid Hard + Easy commits once |
| Review IO | Zero Markdown reads/enumeration/mutations and zero requestUrl/fetch; only Recall metadata is written by Veynrel |
| Completion | Four reviews; no card served before its future due time; correct next due shown |
| Learning recurrence | Advancing the fixture clock beyond due makes the card naturally available again |
| Persistence | Close workspace, reload plugin, reopen on Health, then Recall: all four card schedules survive; one metadata read, no scan or migration write |
| Inventory lifecycle | Removing/restoring a synthetic card and explicitly refreshing retires/reactivates it with identical schedule; overdue recurrence is due |
| Failed review | Injected DataAdapter rejection retains card, revealed answer and zero session count; owner becomes unavailable with safe error |
| Recovery | Invalid and future-schema original bytes move unchanged into Recall backups only after explicit confirmation; live file missing, fresh owner empty, no scan/write |
| Failed recovery | Injected move rejection preserves original bytes/path and keeps Recall blocked |
| Isolation | Health findings/history, semantic sentinel and all settings hashes unchanged during review and recovery |
| Localization/layout | EN/RU, default light/dark, 1200px and 390px; no horizontal overflow; narrow rating grid 2×2; long source path wraps |

Measurements distinguish Veynrel operations from Obsidian's own workspace
autosaves. `paths` records Recall adapter calls. `otherMutation` includes both
the Recall write and occasional native host autosaves; it does not mean extra
Recall files. Zero counters are omitted. Language changes and fixture-only note
edits were performed separately from isolated review/recovery measurements.

Screenshots:

- [First run](first-run-en-dark.png)
- [Question before reveal](question-en-dark.png)
- [Answer and rating previews](answer-en-dark.png)
- [390px, English/dark](answer-en-dark-390.png)
- [390px, Russian/light](answer-ru-light-390.png)
- [Recovery confirmation](recovery-confirm-en-dark-390.png)

Automated verification passed:

- `npm ci`
- `npm run typecheck`
- Focused UI/session/recovery: **62 tests / 3 files**
- `npm test -- recall`: **381 / 15**
- `npm test -- health`: **681 / 32**
- `npm test`: **1,930 / 81** (**62 added**)
- `npx eslint recall health`: clean
- `npm run lint`: zero errors; existing unrelated `api.ts:413` fetch warning
- `npm run audit:proposals`: **5/5 mutations caught**, restored tests pass
- `npm run build`
- Baseline diff whitespace checks

The proposal audit's child process initially returned empty output under the
sandbox; its required rerun outside the sandbox passed. Native startup checks
wait for async plugin loading and workspace layout before issuing UI actions.
The harness sends Enter's character event as well as its key events. Assertions
compare reloaded object values independently of key insertion order.

Automated tests additionally cover unavailable Retry, v1 UI migration, partial
inventory, mixed/identical double ratings, pre-write retry, close/navigation
during persistence, editable/modified shortcut exclusions, listener removal,
duplicate workspace tabs, backup collisions and rollback failures. The native
fixture uses the default desktop themes. No Android/iOS, popout, screen-reader,
custom-theme, hardware-keyboard, power-loss atomicity or live provider coverage
is claimed. No provider is needed for Recall.
