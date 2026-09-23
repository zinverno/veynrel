# Recall Health verification

Verified 2026-09-24 (Europe/Moscow) in isolated real Obsidian **1.12.7**, Electron
**39.8.10**, on Linux. Implementation commit: `fb8f855`, based on merged PR #39
at `24e64e82479ac8cc32aa21b6f80b79b7e07f9a26`.

The disposable `/tmp/recall-health-smoke` vault/profile contained four synthetic
notes, initially four flashcards, then a fifth explicit fixture card for the real
Again deadline. Only `ai-knowledge-hub` was installed. No credentials, external
review plugin or provider were configured. Fixture file changes were made only
to this disposable vault, outside the measured product operations.

## Native checks

| Scenario | Observed result |
| --- | --- |
| Plugin registration/reload | Zero Recall IO, Markdown enumeration/reads, network calls or writes |
| Initial onboarding | Recall remained uninitialized, zero Recall IO |
| Skip → normal Health | One missing-metadata existence check; Recall Not enabled; no scan or Recall/Health writes |
| Findings / Discover / return Health | No additional Recall reads or inventory |
| Explicit Find flashcards | Four active/due cards; Health immediately Review recommended |
| Review all four Easy | Health Good, 0 due / 4 active; only four Recall metadata writes |
| Again on one new card | Health Good, 0 due / 5 active; one wakeup scheduled |
| Real elapsed-time boundary | After 60,108 ms, Review recommended, 1 due / 5 active, no user refresh, zero IO/network |
| Two Health views | Exact same controller/product; same counts; no additional metadata reads |
| Plugin restart, Health only | Five preserved schedules, 1 due; one metadata read, zero Markdown reads or writes |
| Plugin disposal with future timer | View closed; timer cleared; controller/bridge listeners removed |
| Valid v1 metadata, Health only | Five due/new cards, no migration write, no Markdown reads |
| Invalid Recall metadata | Health usable, Recall recovery card; no overwrite or global Health recovery |
| Other Health actions with invalid Recall | Explicit local scan succeeded; Findings and Discover remained usable |
| Confirmed Recall recovery | Original bytes moved to scoped Recall backup; Health Not enabled, no automatic inventory or Health writes |
| Unavailable metadata | Safe Recall data unavailable card; existing Recall Retry restored Good |
| Keyboard | Native Enter and Space activate Recall card; visible 2px solid focus outline |
| EN/RU × dark/light, 390px | Four-card grid preserved, single column; content/scroll width 334px, no horizontal overflow |
| Runtime errors | Zero window errors or unhandled rejections |

Raw operation counts, paths, sanitized card copy, layouts and artifact hashes are
in [native-smoke.json](native-smoke.json). Zero counters are omitted. The first-run
record includes one `settingsMutation` caused by the explicit **Skip** preference
save. `hostOrRecallMutation` includes the recorded Recall metadata writes/move and
may also include native host autosaves; Recall paths disambiguate those operations.
The real wakeup record has an empty count map. No fake clock was used for that
native one-minute check.

Harness corrections were confined to smoke code: CDP Enter requires text `\r`;
schedule equality must compare fields, since stable disk serialization sorts keys.
No schedule values changed on reload. These were test-harness issues, not plugin
fixes. The unit scan-isolation test also uses real yield timers rather than the
manual wakeup mock.

Screenshots: [first run](first-run-en-dark.png), [EN dark](due-en-dark-390.png),
[EN light](due-en-light-390.png), [RU dark](due-ru-dark-390.png),
[RU light](due-ru-light-390.png), [scoped recovery](recovery-en-dark-390.png).

## Automated verification

| Command | Result |
| --- | --- |
| `npm ci` | Passed; unchanged lockfile reports 7 existing advisories (4 moderate, 3 high) |
| `npm run typecheck` | Passed, including strict Health config |
| Focused Recall Health + existing Recall UI suite | 81 tests / 4 files passed |
| `npm test -- health` | 727 tests / 35 files passed |
| `npm test -- recall` | 427 tests / 18 files passed |
| `npm test` | 1,976 tests / 84 files passed |
| `npx eslint health recall` | Passed, no warnings |
| `npm run lint` | Passed; existing `api.ts:413` fetch warning only |
| `npm run audit:proposals` | 5/5 mutations killed; restored tests passed |
| `npm run build` | Passed |

The suites overlap; their counts must not be added together. The focused command
is documented in [the integration contract](../recall-health-integration.md#verification).
The due-card test seeds ten active/three due and proves FindingStore bytes,
Finding counts, ScanRuns and recommendation ordering are unchanged. Source audits
also prohibit network/provider imports, Markdown mutation and direct Health
dependencies on Recall storage/scheduling internals.

Exact production bundle SHA-256:

```text
3111b36947517a55de8c8af5396771ef732b8351a05c54f6b31f8de7069e87a5  main.js
5be5bf0eb22e48c5d1ac0f8c8cc859d6b15d79638063f25d66bb00a34965f5e2  styles.css
2722c7d38ec37e1faebf5f7e84d8443f4aa6f2cd793eb5761ce9f7c5fd92cd39  manifest.json
```

## Limits

390px is a narrow real desktop window, not a native-mobile claim. Native mobile,
popout windows, screen readers and custom themes were not tested. No live
provider/Companion coverage is claimed or needed for this local feature.
Inventory completeness and objective memory quality are not inferred from Recall
Health. Dependency remediation, review history, optimizer, decks, daily limits
and a unified overall action model are outside this PR.

No plugin version bump, tag, release or production dependency change.
