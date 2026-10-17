# Archive Eligibility & Planner v1 native acceptance

**PASS**, 2026-10-17. Linux, Obsidian **1.13.7**, Electron **43.6.0**.
PR #89 was verified merged into current main
`134cc88e4a53d7af4b4131e6dcec5ee45e6651d3` before branching.

The final run used a new isolated synthetic vault and profile at
`/tmp/pair-inspector-archive-20261017-final6`. Prerequisites went through the ordinary
Relationship Analyzer consent, MergePlan, separate Merge Apply confirmation and
real native `Vault.process`, with actual journal copies and applied receipts.
Only the prerequisite model response was replaced by the deterministic repository
fixture. No personal notes, credentials or paid requests were used.

## Reproduce

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-archive-NEW --archive-planner
```

Use a fresh directory with that prefix. The harness owns its Obsidian process and
CDP port 9274. Two SIGKILL restarts target only that owned process, after successful
Merge Apply. The isolated test profile disables the app updater so restart uses
the installed runtime; no product or personal settings change.

## Evidence

The final run passed **58 assertions**: existing Pair Inspector **18** and Archive
Planner **40**. These counts include repeated locale/theme and zero-write checks,
not 58 distinct features. There are **25 Archive Planner screenshots**.

- [Final report](archive-planner-evidence/report.json)
- [Artifact and evidence SHA-256 manifest](archive-planner-evidence/sha256.json)

Installed vault artifacts were byte-compared with the final repository build:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `a1f88d47906a168df9174e9e53fb4b3a3cdd83975b602270839cd722edf15bc8` |
| `styles.css`, unchanged | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json`, unchanged | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

| Native case | Observed result |
| --- | --- |
| Actual completed Merge Apply after restart | Journal history opens the preservation review; both original files and journal bytes survive restart unchanged. Both canonical directions are exercised. |
| Preservation | Full notes, exact copied ranges and all remaining fragments/context are visible. No disposition is preselected. Further consolidation blocks the plan; represented and intentionally retained choices permit it. |
| Dependencies | A real cached consumer links, embeds and references the secondary through frontmatter. Known incoming kinds appear. Unavailable incoming cache remains `null`/unknown in the plan. |
| Exact plan | Full secondary before/after, literal diff and serializable provenance are displayed. Removing only the proposed insertion reproduces the exact before. No Apply or Undo control is present. |
| Existing YAML and Unicode/CRLF | RU fixture retains comments, tags, existing property link and exact body; proposed flat Veynrel properties use the original CRLF. EN also exercises a note without YAML. |
| RU/EN × light/dark × 1200/390 px | Sources, controls and diff fit without horizontal overflow; no untranslated archive keys. |
| Incomplete Merge Apply | A prewrite failure leaves real prepared journal data; archive review refuses it. |
| Later canonical or secondary edit | New review refuses the basis; user text remains untouched. |
| Conflicting archive properties / unsupported YAML | No plan is published; original YAML and both files remain untouched. |
| Damaged journal backup | Review refuses and preserves the damaged evidence for manual inspection. |
| Edit after publication | All confirmations and the displayed plan are revoked. |
| Cancel / reselection / closing during deferred read | Previous plan is removed; late completion cannot restore a closed modal. |
| Read-only boundary | Instrumented Vault mutation methods, journal adapter writes/copies and extra model completions remain zero throughout archive planning, including refusals and cancellation. Markdown reads are limited to the selected pair in these fixtures. |

The harness compares both Markdown files as disk buffers and all merge-journal
file contents before/after each archive scenario. Deliberate user-edit scenarios
compare against the edited text. Prerequisite Merge Apply writes occur before
archive counters and snapshots; they are not misreported as read-only operations.
Known consumer caches are inspected without reading consumer Markdown.

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Review](archive-planner-evidence/archive-en-theme-light-1200.png) | [Review](archive-planner-evidence/archive-en-theme-light-390.png) | [Review](archive-planner-evidence/archive-en-theme-dark-1200.png) | [Review](archive-planner-evidence/archive-en-theme-dark-390.png) |
| RU | [Проверка](archive-planner-evidence/archive-ru-theme-light-1200.png) | [Проверка](archive-planner-evidence/archive-ru-theme-light-390.png) | [Проверка](archive-planner-evidence/archive-ru-theme-dark-1200.png) | [Проверка](archive-planner-evidence/archive-ru-theme-dark-390.png) |

- Before/after: [EN 1200](archive-planner-evidence/archive-after-en-1200.png), [EN 390](archive-planner-evidence/archive-after-en-390.png), [RU 1200](archive-planner-evidence/archive-after-ru-1200.png), [RU 390](archive-planner-evidence/archive-after-ru-390.png).
- Diff: [EN](archive-planner-evidence/archive-diff-en.png), [RU](archive-planner-evidence/archive-diff-ru.png).
- Fragment decisions: [EN](archive-planner-evidence/archive-preservation-en.png), [RU](archive-planner-evidence/archive-preservation-ru.png).
- Explicit status, limitations and read-only controls: [EN](archive-planner-evidence/archive-controls-en.png), [RU](archive-planner-evidence/archive-controls-ru.png).
- Refusals: [incomplete merge](archive-planner-evidence/archive-refusal-incomplete.png), [changed canonical](archive-planner-evidence/archive-refusal-canonical.png), [changed secondary](archive-planner-evidence/archive-refusal-secondary.png), [property conflict](archive-planner-evidence/archive-refusal-properties.png), [unsupported YAML](archive-planner-evidence/archive-refusal-yaml.png), [damaged journal](archive-planner-evidence/archive-refusal-damage.png), [stale preview](archive-planner-evidence/archive-stale.png).

## Harness failures and corrections

Earlier attempts exposed native harness readiness problems. After restart the
main document could have focus while Obsidian's active window remained its
Settings popout. The [failure](archive-planner-evidence/harness-focus-failure.json)
and [diagnostic snapshot](archive-planner-evidence/harness-focus-diagnostic.json)
are retained. The harness now closes that synthetic Settings window through its
ordinary API and waits for actual main-window identity, command registration and
Merge service readiness. It does not override focus globals or product guards.
An updater download in the test profile also motivated pinning the runtime for
restarts by disabling updates only in that profile.

The next run completed all 58 assertions but failed in the reporting helper while
reading the Obsidian version through an unavailable renderer module. That
[reporting failure](archive-planner-evidence/harness-reporting-failure.json) is
retained. Version collection now reads and asserts the native window title. The
final fresh-vault run completed assertions and reporting successfully.

## Automated checks and limits

`npm test`: **3589 tests / 138 files passed** on the final implementation.
Typecheck, lint, production build, `audit:proposals` (**5/5 mutations killed**) and
`git diff --check` passed. Lint retains the pre-existing approved streaming fetch
warning in `api.ts`; no new warning was introduced. The proposal audit was rerun
outside the restricted sandbox after an inner test process produced no output.
The PR uses the repository's unchanged verification and npm 10/11 scanner jobs.

Unit tests additionally cover exact path/runtime identity/stat/cache changes at
every read boundary, overlapping journal conflicts, missing/recovered/Undo
receipts, incomplete section caches, YAML refusal boundaries and cleanup events.
An independent review found a provenance-digest timing gap; hashing now precedes
the final intact-journal reread, followed by synchronous source guards. Fault
tests corrupt a backup or inject Undo intent during hashing and change canonical
mtime between receipt inspection and source reading. The subsequent review had
no remaining required findings.

This is Linux desktop acceptance. A 390 px viewport is not a physical mobile
test. Other OSes, screen readers, custom themes and paid model quality were not
tested. Network counters cover fetch/XHR and deterministic completion counts,
not every possible transport. SIGKILL exercises completed Merge Apply provenance;
there is no archive executor or automatic startup action. User judgments do not
prove semantic completeness, and MetadataCache cannot prove the absence of
consumers. See the [planner contract and limitations](archive-planner-v1.md).
