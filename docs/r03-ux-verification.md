# R03: Workspace and Studio UX verification

Date: 2026-11-14. Development review, not a release or owner acceptance.

**The bounded UX changes are implemented and visually recorded. The strict
native zero-exception gate remains open:** the final small-vault run completed
25 functional assertions but captured the known host zoom exception. Green unit
tests do not override that limitation or substitute for the owner's UX review.

## Revisions and publication boundary

- Base/main: `02be9894ccc7dfcc1e3332d7a3f3630d4488b35c`, independently rechecked
  before publication of this draft. PR #140 is merged at this SHA; R01/R02 are
  already present. The original unrelated checkout was left untouched; R03 uses
  a separate worktree and `feat/r03-workspace-studio-ux`.
- Runtime/test/harness source: `3c9ef0141e081dc8974a2f56898907a000380ef2`. Subsequent evidence-only
  commits do not change the three tested runtime files.
- Public latest stable was separately rechecked as **2.3.1**, published
  2026-11-02, source `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`.
  Manifest/package **2.4.0** remains an unpublished intermediate version.
  These UX changes and R02's diagram removal are not in Marketplace 2.3.1.
- The [owner-approved release policy](roadmap/vault-assistant-plan.md#release-policy-and-acquisition-work)
  still requires accepted R01–R15 before any public release. Every merge needs
  a separate owner decision. Auto-merge stays off. No release, tag, deployment,
  paid inference, personal-vault installation or R04 work was performed.

## Problems, changes and preserved contracts

The [audit table](roadmap/r03-ux-audit.md#observed-problems-and-bounded-changes)
connects observed problems to changes and checks. Source/caller inspection and
the [initial baseline native capture](r03-ux-evidence/baseline-initial-audit.json) preceded runtime edits. The published
baseline small-vault recording repeats that exact baseline with the final
instrumentation; it is not a claim that the baseline was rebuilt from R03.

Workspace Home now prioritizes the selected area, recorded local-check receipt
and an explicit check entry. Optional folder geometry and saved counts remain
available in disclosures. The first-use check uses the existing Mixed default
without requiring a profile-selection exercise; a failed preference save cannot
start a scan. Both Home and the existing handoff explain that Health scans the
whole vault even when a folder is selected. Opening Home still does not scan.

Finding filters, selection, scroll, focus and disclosures are remembered within
the current view session. Reading another row/filter in an already acknowledged
inbox does not repeat its scope gate. A new scope/tool/navigation handoff retains
the existing freshness, route identity and single-use guards. Changing scope
clears the view memory. Source-opening and comparison mechanisms are unchanged.

Studio keeps scenarios/search/categories visible while moving recipe management,
optional instructions and model detail into disclosures. Existing recipe drafts
survive library navigation and rerenders. Consent still displays the actual
provider/model/endpoint, selected saved notes and transmission warning before
the explicit Generate action. Review puts the destination and exact final
Markdown before original/raw disclosures, and explains why writing is disabled
with no rows selected. Existing header/navigation text now follows a language
change without reopening the view.

All Workspace routes, Tools, Health categories/evidence/statuses, leave-as-is
actions, external commands, Studio's separate ItemView, user recipes, Community,
Review, history, recovery and supported Apply/Undo remain. No Health/Discover
algorithm, semantic index, Recall format, journal, model request/validator,
Markdown rule, write permission, limit, plugin ID, dependency or version changed.
No CSS hides a live invalid state. Existing native-theme tokens and reduced-motion
behavior remain. The Health result screen, comparison backends and Community
implementation were not redesigned.

## Automated validation

- Targeted Health UI/navigation integration: **165/165 PASS** after the context
  changes; Studio/Community tests are also included in the full suite.
- Final full suite: **5,152 tests / 194 files PASS**, `npm test -- --maxWorkers=2`.
  The first final attempt had two 5-second timeouts in unchanged retained-1.7.0
  settings tests (5,150 passed); [failed log](r03-ux-evidence/suite-timeout.log)
  is retained. Worker count was reduced; assertions/timeouts were not changed.
- Typecheck, production build and plugin lint: **PASS**, zero errors and the two
  existing fetch advisories in `api.ts` / `studio/community/transport.ts`.
- Mutation audit: **5/5 killed; restored tests PASS**. An earlier sandbox attempt
  with empty child output is retained separately; the final host audit passed.
- [Final suite](r03-ux-evidence/suite-final.log), [typecheck/build/lint](r03-ux-evidence/lint-final.log),
  [mutation](r03-ux-evidence/mutation-final.log), [exit codes and commands](r03-ux-evidence/check-exit-codes.json).

The three new Health integration regressions exercise explicit no-key onboarding
and failed preference persistence, truthful saved-check receipts with no rescan,
and inbox context restoration without extending a scope acknowledgement to a new
operation. Existing stale/double-confirmation and route tests remain enabled.
The former two-column Home CSS expectation was updated for the intentional layout.

Local results are separate from GitHub Actions. CI for the exact PR HEAD is
reported in the PR; no previous R01/R02 or earlier R03 success counts as that CI.

## Native environment and evidence

Real Linux desktop Obsidian **1.13.7**, Electron **43.6.0**, Chrome
**150.0.7871.250**, X11, new disposable profiles. The actual ItemViews, registry,
runner, production Markdown transport, journals and vault adapters are used.
Synthetic responses travel only to a loopback HTTP fixture; Community uses its
local catalog fixture. No credentials or live-model quality claims. The native
probe waits for layout/plugin registration and records every renderer exception.

| Fixture | Before / after evidence | Actual result and boundary |
| --- | --- | --- |
| Six notes: broken link, exact duplicate, short note, linked pair, similarly named outside folder | [Before](r03-ux-evidence/before-small.json) / [after](r03-ux-evidence/after-small.json) | Both complete recorded Workspace and Studio journeys. After: 25 functional assertions; one host exception; strict gate open |
| Empty | [Before](r03-ux-evidence/before-empty.json) / [after](r03-ux-evidence/after-empty.json) | No-key local check, zero findings, no error/problematized empty state; zero exceptions |
| Two linked notes with no known structural issues | [Before](r03-ux-evidence/before-clean.json) / [after](r03-ux-evidence/after-clean.json) | Zero open findings asserted; zero exceptions |
| Existing synthetic 1,000-note corpus, Markdown-only copy | [Before](r03-ux-evidence/before-lab.json) / [after](r03-ux-evidence/after-lab.json) | 1,000 explicit reads, unchanged source/copy hashes; zero exceptions. Both first scans are **partial**, not complete |

The 1,000-note run starts while native indexing is still settling. Baseline
records 31 findings and R03 records 24; [baseline scan](r03-ux-evidence/before-lab-scan-runs.json)
and [R03 scan](r03-ux-evidence/after-lab-scan-runs.json) both say `partial`.
The UI says “limited coverage”. These are first-open UX/side-effect observations,
not a controlled finding-count comparison or a performance benchmark. No analyzer
change or complete-corpus claim is inferred from them.

Final [Studio regression](r03-ux-evidence/studio-regression.json): **66/66 PASS**,
zero exceptions, 12 loopback synthetic requests. It covers delayed complete and
incomplete responses, cancellation/late responses, exact consent, saved output,
source-editor guards, separate write confirmation, BOM/CRLF/YAML preservation,
Apply/Undo, selected batch rows, injected receipt failure/recovery, history and
restarts. Original/control Markdown and legacy drawings/journals retain their
hashes. Selected full captures are in [Studio regression evidence](r03-ux-evidence/studio-regression).

Final [Community regression](r03-ux-evidence/community-regression.json): **47/47
PASS**, zero exceptions, one synthetic provider request. Local catalog install,
update, locally modified copies, search/category, offline cache, malformed cache/
origin recovery, existing Runner/Review/Apply/Undo and RU/EN/theme/narrow matrix
remain functional. Its log's “online” catalog is the local fixture; no public
HTTPS availability or live-model-quality claim.

The additional [native write-conflict probe](r03-ux-evidence/after-conflict.json)
passes four assertions with zero exceptions and one synthetic request. A fixture
file is created at the chosen destination **after** the exact write plan is shown.
Confirmation reports conflict, leaves that file byte-identical, performs no plugin
Markdown write and does not choose another filename. [Full conflict capture](r03-ux-evidence/after-conflict/studio-write-conflict.png).

Additional final scope probe: [receipt](r03-ux-evidence/after-scope.json), four assertions, zero exceptions
and zero model requests. Folder `Study` displays exactly three paths, preserves
that selection through library navigation, and prepares exactly those three;
`Study-old` is excluded. No generation was needed to check scope.

The small-vault native assertions also cover actual unsaved editor content,
missing model, renamed/deleted selected folder, injected read failure, concurrent
edit during scanning, plugin/process restart, session draft/focus restoration,
real split and separate-document popout ownership. The unsaved-buffer probe
temporarily holds `requestSave` in that disposable editor to make the interval
deterministic, then restores it. Partial/stale fault probes restore original
Markdown bytes. These are controlled failure conditions, not claims about how
often those failures occur naturally.

RU/EN and actual built-in light/dark themes are captured at wide and narrow
viewports. At a 434 px window, Workspace content is 390 px and Studio inner content
378 px; neither horizontally overflows. Real split/popout, Tab, Enter, Escape,
focus return and `prefers-reduced-motion` were exercised. Session context is not
a new persistent database: restart restores existing durable scan/history/results,
but resets scope and preparation drafts, as recorded. The separately saved working note survives restart. Other routes keep their
existing context behavior; arbitrary comparison/modal focus permutations were
not exhaustively retested.

## Full captures and continuous recordings

All linked PNGs are full native viewports, uncropped. All four MP4s are continuous
CDP native viewport recordings with frame timestamps retained, no cuts or overlays;
synthetic generation is explicitly identified here and in receipts. Encoded video
durations are not human task-time measurements.

| Same scenario | Before | After |
| --- | --- | --- |
| Workspace: area → local check → real finding → evidence | [Video, 15.85 s](r03-ux-evidence/before-small/workspace-journey.mp4) | [Video, 14.15 s](r03-ux-evidence/after-small/workspace-journey.mp4) |
| Studio: recipe → saved note → prepare → consent → synthetic result → Review → separate save | [Video, 16.65 s](r03-ux-evidence/before-small/studio-journey.mp4) | [Video, 17.45 s](r03-ux-evidence/after-small/studio-journey.mp4) |
| First use without a key | [Before](r03-ux-evidence/before-small/workspace-new-user.png) | [After](r03-ux-evidence/after-small/workspace-new-user.png) |
| Workspace Home | [Before](r03-ux-evidence/before-small/workspace-home.png) | [After](r03-ux-evidence/after-small/workspace-home.png) |
| Actual finding evidence | [Before](r03-ux-evidence/before-small/workspace-finding.png) | [After](r03-ux-evidence/after-small/workspace-finding.png) |
| Studio library | [Before](r03-ux-evidence/before-small/studio-library.png) | [After](r03-ux-evidence/after-small/studio-library.png) |
| Preparation | [Before](r03-ux-evidence/before-small/studio-preparation.png) | [After](r03-ux-evidence/after-small/studio-preparation.png) |
| Consent | [Before](r03-ux-evidence/before-small/studio-consent.png) | [After](r03-ux-evidence/after-small/studio-consent.png) |
| Review | [Before](r03-ux-evidence/before-small/studio-review.png) | [After](r03-ux-evidence/after-small/studio-review.png) |
| RU/light, narrow Home | [Before](r03-ux-evidence/before-small/workspace-ru-light-434.png) | [After](r03-ux-evidence/after-small/workspace-ru-light-434.png) |

The evidence directories also contain the full EN/RU × light/dark × wide/narrow
Home/library matrix, write confirmation/result, real split/popout, partial/stale,
missing-model, unsaved-note and restart captures. Native videos were decoded in
full with ffmpeg, and full-size frames/screenshots were visually inspected.

Recorded activation count for the identical Workspace journey: **9 → 8**, removing
the redundant scope confirmation when opening evidence inside the inbox. Studio
with the same optional instruction: **10 → 11**, because its disclosure now needs
an explicit opening. Text entry is unchanged and excluded from these activation
counts; folder selection is included. No claim of improved human productivity.

## Passive and explicit side effects

Counts below are deltas, not wall-clock estimates. The [raw receipt](r03-ux-evidence/after-small.json)
keeps both Vault API and adapter-level records; adapter reads can include the same
Markdown read and must not be added to it as independent work.

| Path | Markdown reads | Markdown mutations | Local scans | Synthetic / remote model requests |
| --- | ---: | ---: | ---: | ---: |
| New Workspace opening | 0 | 0 | 0 | 0 / 0 |
| Explicit first check, small fixture | 6 | 0 | 1 | 0 / 0 |
| Open Studio after Workspace | 0 | 0 | 0 | 0 / 0 |
| Explicit Studio prepare/generate/review/save journey | 10 | 1 create | 0 | 1 / 0 |
| Passive routes including Studio History and all Workspace entries | 1 existing created-target integrity read | 0 | 0 | 0 / 0 |
| Explicit first check, 1,000-note copy | 1,000 | 0 | 1 | 0 / 0 |

Passive opening is not zero filesystem I/O: existing initialization writes plugin
metadata (three adapter writes in the small receipt), and later passive navigation
has seven adapter reads and one metadata write. No Markdown mutation, full scan
or model request occurs on those paths. The explicit fault probes separately
record their temporary fixture edits. Original Markdown hashes and seeded
non-UX provider/semantic/companion settings are checked unchanged in all eight
comparison receipts; explicit language/profile choices are expected UI settings
changes. No personal vault was opened or modified.

## Open native exception and unsuccessful attempts

The [unfiltered exception payload](r03-ux-evidence/host-exception.json) in the R03
small run has this exact description:

```text
TypeError: t.webContents.getZoomFactor is not a function
    at e.updateStatus (app://obsidian.md/app.js:1:1516930)
    at c (app://obsidian.md/app.js:1:545776)
    at u (app://obsidian.md/app.js:1:545888)
```

It compares byte-for-byte with the preserved R01 and R02 receipts linked by the
[earlier attribution report](r02-native-zoom-attribution.md#original-receipts).
Timestamp here: `1794652314612.934`. The signature predates R03, but its immediate
trigger remains unresolved; this does not rule out changes in occurrence frequency.
No filter, host/plugin patch or speculative workaround was added.

The raw `after-small.json` says `completed: true` because that harness revision
used the flag for reaching the end of functional assertions. Its exception array
is unchanged. This report explicitly classifies the strict runtime gate as failed;
the checked-in harness now separates functional completion and zero-exception
completion and returns failure if any exception was captured.

[Earlier attempts](r03-ux-evidence/earlier-attempts.json) retain harness/module
errors, ineffective Enter events, a CDP serialization error, malformed evaluated
async code, interrupted runs and a corrected assumption about History reads.
A separate History pointer failure is retained: [original trace](r03-ux-evidence/pointer-initial.json)
shows mousedown on the button and mouseup on a DIV, with no click event; the
second click opens the result. Fresh [baseline](r03-ux-evidence/pointer-base.json)
and [R03](r03-ux-evidence/pointer-after.json) controls both open the saved result
with one click and zero exceptions. The exact intermittent trigger is unresolved.
The regression harness explicitly activates its disposable window and focuses
and settles the target before its real pointer sequence. This verifies that
sequence; it does not prove the original first-click issue fixed. Product/host
handlers were not patched. Inadequate trust/deferred-view control attempts are
not counted as comparisons.

Some interrupted attempts also logged a GPU fatal exit; that is not assigned as
the cause of every interruption. Worktree/evidence were moved off tmpfs after
resource pressure, with file hashes preserved. The raw local attempts remain;
unsuccessful or incomplete runs are not counted as passed.

## Runtime hashes and reproduction

| File | Tested final SHA-256 |
| --- | --- |
| `main.js` | `2d05cd5c69999f18a8b2bf46cf60ba2bf4a07d36f02e86189ff77337ca411142` |
| `styles.css` | `492779ef567de8797f55d17a20c1be5f7af12bf42ec6604916171829e74b08b3` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

[Evidence checksums](r03-ux-evidence/SHA256SUMS) cover the public receipts, logs,
PNG and MP4 files. Copied text logs normalize terminal blank lines only; raw local
logs are retained. No bundled private notes, keys, node_modules or native profile.

```sh
npm ci
npm test
npm run lint # typecheck, production build, plugin lint
npm run audit:proposals
DISPLAY=:0 node scripts/r03-ux-native.mjs /tmp/veynrel-r03-native-UNIQUE after small
# Repeat with empty, clean, lab, scope and conflict, each using a new output path.
# lab reads only the existing synthetic corpus identified in the harness.
DISPLAY=:0 node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-UNIQUE
DISPLAY=:0 COMMUNITY_PUBLIC=0 node scripts/studio-community-native.mjs /tmp/veynrel-community-native-UNIQUE /path/to/local-catalog-fixture
```

## Remaining limits and later-stage questions

The owner still needs to judge the linked routes and visual evidence; R03 is not
declared accepted. The host zero-exception gate and the intermittent first-pointer issue remain open. Linux desktop only:
no Windows/macOS, physical mobile, custom-theme matrix or screen-reader speech
acceptance. No live provider quality or public Community availability recheck.
No new D30 simulation. Native fault injection is distinguished from spontaneous
failure evidence; the 1,000-note first scan is partial.

Folder-scoped Health execution and durable UI drafts would require separate
backend/persistence decisions; R03 makes their current limits visible. They are
questions for separately authorized work, not new promises assigned to R04.
R04's profile/registry work and every later-stage algorithm/provider/Recall change
remain in their existing roadmap units and dependencies, untouched here.
