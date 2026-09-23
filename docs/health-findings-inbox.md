# Findings Inbox (migration PR 6)

Baseline: clean, fast-forwarded `main` at
`d23149f4670255be04398d1d169b2ba4977ae632`, the actual PR #31 merge commit.
Branch: `feat/health-findings-inbox`. No version, tag, release or merge.

## Navigation and presentation

The existing `VeynrelHealthView` remains the only product ItemView, backed by one
plugin-owned controller/service. Recovery takes precedence, then incomplete
onboarding. Only completed onboarding exposes **Health | Findings**. No placeholder
Discover, Recall or Connect surface is added. Legacy Tools remains available.

The route is a view-local `VeynrelHealthRoute`: Health, or Findings with a state,
dimension and optional selected ID. Initial Findings entry means Open / All.
Filters, selection, expanded paths and snooze choices never enter plugin settings,
Findings storage, scan history or Obsidian view state. Closing/reopening returns to
Health. Navigation never scans.

`findingsInboxViewModel` derives presentation from copied Findings. State counts
respect the selected dimension, before applying the selected state. The four
existing states and four existing dimensions are unchanged; Recall and Knowledge
can have empty filters. Source is not a filter. Ordering is impact (attention,
review, info), then `lastSeenAt` descending, then ID ascending in code-unit order.
This affects only returned UI arrays, never FindingStore ordering or persistence.

Compact list buttons contain the existing localized `findingPresentation` title
and explanation, localized dimension, and one path or a note count. Unknown types
retain stored title/explanation. Detail adds localized state, a subtle Local check
label for local Findings, affected paths, evidence, and explicit lifecycle buttons.
Confidence, fingerprints, analyzer IDs and arbitrary action descriptors are absent.

Home's open count has a real View findings button, even at zero. Structure and
Connections heading buttons open the corresponding Open filter. Recall/Knowledge
remain inert unless they have open Findings. Recommendation retains Open note and
adds Review finding for its existing Finding ID.

## Evidence and affected notes

`findingEvidencePresentation` is an explicit allowlist for existing local types.
It uses EN/RU i18n without translating identity, stored prose, paths or targets.

| Evidence | Presentation |
| --- | --- |
| `source-path` | Already covered by individual affected-note paths |
| `target`, `occurrence-count` | Missing target and occurrences |
| `target-length`, `target-truncated` | Ellipsis for a truncated target; no raw length/boolean |
| `incoming-count`, `outgoing-count` | Incoming/outgoing links |
| `incoming-count-complete=false` | Incoming count may be incomplete |
| `meaningful-character-count` | Letters and numbers in the note body |
| `member-count` | Exact normalized Markdown count (including properties), or duplicate-name count |
| `basename` | Name, unchanged |
| `basename-length`, `basename-truncated` | Ellipsis for a truncated name; no raw length/boolean |
| `component-size`, `primary-component-size` | Disconnected group size and main connected group size |
| `represented-path-count` | Representative-path summary; actual stored paths are authoritative for navigable count |

Unknown evidence is not dumped. Missing evidence gets localized fallback copy.
Numeric facts require nonnegative safe integers. Group counts never understate the
stored path count. A 105-member group with 100 stored paths is described as 105
affected notes with 100 representative paths. Only ten paths initially render;
Show all / Show less is transient. There is no custom diff or merge UI.

Every path button calls the existing `openHealthNote` boundary. It rechecks the
canonical vault-relative path, config/backup scope, current TFile existence and
Markdown extension at click time, then opens a tab. A missing/inaccessible note
produces safe localized status without changing a Finding. A later explicit scan
owns absence resolution. Evidence paths and persisted `FindingAction` descriptors
are never dispatched as commands or interpreted as markup.

## Lifecycle and consistency

The controller exposes copy-safe `listFindings(filter?)` / `getFinding(id)` plus
`dismissFinding(id)`, `snoozeFinding(id, until)` and `reopenFinding(id)`, returning
`Promise<boolean>`. Mutations require initialized, live ownership and an allowed
current state. They exclude overlapping controller scans, recovery and duplicate
clicks. The UI remains browsable while an existing scan runs and receives every
service notification; lifecycle buttons wait until that scan finishes.

All updates use the existing HealthService -> FindingStore transition. The store
publishes only after successful persistence. Pending mutations retain the current
row/detail, disable lifecycle controls and announce saving. Rejections retain
previous backend/UI state and show “Couldn't update this finding,” never the
private exception. No optimistic deletion or rollback implementation is added.

Mutation failures are view-owned and scoped to the initiating Findings route.
The controller returns success/failure without retaining a global error flag.
Navigation, filters, selection, scan/mutation activity and close clear the failure;
returning to the same Finding cannot resurrect it. Late rejected writes from an
abandoned interaction are ignored by the view. No timer or persisted error is used.

* Open: Dismiss and Snooze. Dismiss is reversible user intent with explanatory copy,
  no confirmation modal, and remains dismissed across later identical scans.
* Snooze: 1, 7 or 30 elapsed days, calculated at click time by
  `snoozeDeadline(days, clock) = clock() + days * 86_400_000`. The helper accepts an
  injected clock. Detail formats `snoozedUntil` through the existing language's
  `Intl.DateTimeFormat` with local date/time; formatted text is never persisted.
* Dismissed / Snoozed: Reopen returns to Open without scanning.
* Resolved: history only; no lifecycle mutation or manual Reopen. Complete relevant
  absence resolves it, and later detection reopens the same ID and firstSeenAt.
* Expiry alone does nothing while idle. A later detection/reconciliation observes
  the snooze deadline; there is no timer, scheduler or automatic scan.

A selected Finding leaving the current filter returns to the filtered list.
Resolution from Open announces “Finding was resolved by the latest scan.” Counts,
recommendation and Home update through existing service notifications. The UI
never derives Good from an empty Inbox: HealthAggregator remains authoritative.
In particular, dismissing the last Finding after partial analysis leaves Health
Not fully analyzed. With [scope reconciliation receipts](health-reconciliation-receipts.md),
Dismiss/Snooze/Reopen preserve completed analysis coverage across restart. Health
can remain Good when all open review/attention Findings have been dismissed; a
partial scan still cannot prove healthy absence.

## Layout, accessibility and boundaries

Wide panes display list and detail side by side. At a 700px view-container width
or below, detail hides the list and Back restores it. A narrow viewport fallback
also applies. Scoped `.veynrel-findings-*` styles use Obsidian variables. Lists use
`ul/li`, detail uses `article/section`, navigation uses `nav`, all controls use real
buttons. Normal Tab order, visible focus, `aria-pressed`, current-page indication,
a textual selected-row marker, focused detail heading, and the existing mounted
polite live region provide keyboard access without a custom grid.

The transitive Health dependency audit includes the Inbox. It excludes AI,
network, RAG, semantic, Companion and proposal dependencies, Vault Markdown
mutations and UI storage ownership. A separate UI audit prohibits persisted
FindingAction consumption and Vault enumeration/reads. Runtime integration tests
also count reads, enumerations, settings writes and Health writes across the entire
navigation/lifecycle sequence. Only lifecycle `health/findings.json` writes occur.

No analyzers, Finding schema, lifecycle states, storage format, HealthService,
FindingStore, reconciliation algorithm or aggregator changed. No new dependency,
AI/network integration, Markdown editing, automatic fixes or scan is introduced.

## Verification

67 test cases added: Health-related tests 345 -> 412, repository tests 1,194 ->
1,261. New evidence and Inbox view-model suites cover every local type in EN/RU,
filter combinations, counts, sorting, unknown IDs, selection invalidation, bounded
groups, future-type fallback, states, dates and snooze deadlines. Expanded
controller/view suites cover persist-first failures, duplicate clicks, all
lifecycle transitions, recommendation updates, partial Health, restart, recurrence,
no hidden scan, safe navigation, focus, Tools, onboarding and recovery. Eight
transient-error regressions cover navigation/filter/selection, later scans,
retry and late failures after leaving or closing the view.

Passed: `npm ci`, `npm run typecheck`, `npm test -- health`, focused UI/controller
tests, `npm test`, `npx eslint health`, `npm run lint`, `npm run audit:proposals`
(5/5 mutations killed), `npm run build`. The unchanged lockfile reports seven
dependency advisories (four moderate, three high); the pre-existing `api.ts:413`
fetch lint warning remains. Neither is introduced by this PR.

The production build contains 49 Health inputs, no test inputs, and only Obsidian
external runtime imports. A separate source review found no actionable issues;
that review did not independently execute tests or native checks.

## Native desktop smoke (2026-09-22)

Real installed Obsidian **1.12.7 / Electron 39.8.10**, isolated profile and three
synthetic notes, no provider credentials. This smoke records implementation commit
`11f29a6`, before the transient-error correction, which is verified by automated
regressions. The installed production bundle and
styles matched the repository build byte for byte:

* `main.js`: `b9e5376e937a605820fb8c3a6c92d06a4d29020cdc2c5819194d5e32dc421740`
* `styles.css`: `0fbfa99bacd9ac63f141590e21a9b5f2528227dc7bf895d570101c0d77c87b33`

| Native check | Observed result |
| --- | --- |
| Fresh user | Welcome first; Findings hidden; Work selection reads/enumerates zero notes |
| First scan / Continue | Explicit scan reads the three notes once each; Result remains dominant until Continue unlocks navigation |
| Navigation | Home summary, top navigation, Structure filter, empty Recall filter, recommendation detail and Back work without reads, enumeration or writes |
| Understand | Localized title/explanation, unchanged link target, occurrence/degree facts, state and safe note buttons |
| Dismiss / Reopen / Snooze | Correct filtered lists, recommendation changes immediately, selected detail returns to list; only Findings JSON writes |
| Keyboard | Native Tab/Enter selects a row, focuses detail heading, reaches Dismiss, returns focus to list heading after mutation; Shift+Tab/Enter activates Back; 2px visible focus |
| Plugin reload | Snoozed and Dismissed remain visible without rescanning; identical scan preserves dismissal |
| Full process restart | PID 531501 -> 537672; both states retained, Findings bytes unchanged, reopening/filtering reads/enumerates zero notes and writes nothing |
| Resolution / recurrence | Controlled metadata-cache resolution during an explicit scan moves selection to Resolved with announcement and no Reopen; restoring cache behavior reopens the same ID and firstSeenAt |
| Persistence failure | Controlled rejected Findings write keeps prior state/row; controls disabled while pending; safe error and successful retry |
| Note navigation | Opens `A.md`; controlled missing-path lookup reports unavailable and leaves Findings unchanged |
| Recovery | Unsupported disposable Findings file hides normal navigation and exposes no Findings data; restoring original bytes restores normal Home |
| Russian | Title, explanation, filters and evidence localized; `Missing` target and persisted English analyzer title unchanged |
| Themes / 390px | Actual dark and light body themes verified and screenshots inspected; 334px content width equals scroll width; list hidden in detail, Back restores it; buttons fit |
| Tools | Works from both surfaces; original control command still opens its modal; all 21 plugin commands retained |

All three fixture Markdown bodies remained byte-identical. Instrumented product
flows observed no Markdown mutation calls, fetch calls or runtime errors. The
desktop smoke scripts and JSON/screenshots are retained locally in
`/tmp/health-findings-smoke/`. Initial light captures used the wrong native theme
method; they were replaced by captures after `changeTheme` and a verified body
theme. A startup connection attempt before the restarted debug port was ready was
retried. Neither harness issue was treated as product evidence.

Resolution/missing-path and write-failure cases used controlled local fixture
overrides, not Markdown edits or actual filesystem loss. Recovery damage was
confined to disposable Health metadata and restored after the check. This smoke
verifies desktop and narrow desktop panes, **not native iOS/Android**, popout,
custom themes, screen readers, large-vault performance or live AI/Companion flows.
No such platform or integration claim is made. Large-group rendering and snooze
expiry are covered by unit/integration tests rather than native time passage.

## Final invariants

* Findings use understandable localized prose/evidence rather than debug metadata.
* Dismiss/Snooze/Reopen write Health metadata only, persist first, and never edit
  Markdown; Resolved history has no manual Reopen.
* Partial analysis cannot become Good merely through dismissal; backend snapshot
  semantics are unchanged.
* Localization changes presentation, never Finding identity or persisted evidence.
* No arbitrary persisted FindingAction kind is executed.
* Navigation/filtering/lifecycle never start a scan; no automatic scan is added.
* Onboarding remains first-run UX; recovery wins over every normal route.
* Existing Health and Tools workflows remain; no AI/network integration is added.
* Domain/storage schemas and plugin version remain unchanged. The PR is left open
  and unmerged. Final commit-range and GitHub CI results are recorded in the PR.
