# R03: Workspace and Studio UX verification

Original verification: 2026-11-14. Host-attribution follow-up: 2026-11-15.
Development review, not a release or owner acceptance.

**The bounded UX changes are implemented and visually recorded. The host
exception is now attributed, with a verified Native frame workaround.** The
original small-vault run still has 25 functional assertions and an exception;
its failed strict gate is not rewritten. Hidden/Obsidian frame remains open.
Green tests and the workaround do not substitute for the owner's UX review.

## Revisions and publication boundary

- Base/main: `02be9894ccc7dfcc1e3332d7a3f3630d4488b35c`, independently rechecked
  before publication of this draft. PR #140 is merged at this SHA; R01/R02 are
  already present. The original unrelated checkout was left untouched; R03 uses
  a separate worktree and `feat/r03-workspace-studio-ux`.
- Original runtime/test/harness source: `3c9ef0141e081dc8974a2f56898907a000380ef2`.
  The original receipts and runtime hashes below describe that build.
- Public latest stable was separately rechecked as **2.3.1**, published
  2026-11-02, source `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`.
  Manifest/package **2.4.0** remains an unpublished intermediate version.
  These UX changes and R02's diagram removal are not in Marketplace 2.3.1.
- The [owner-approved release policy](roadmap/vault-assistant-plan.md#release-policy-and-acquisition-work)
  still requires accepted R01–R15 before any public release. Every merge needs
  a separate owner decision. Auto-merge stays off. No release, tag, deployment,
  paid inference, personal-vault installation or R04 work was performed.

## Review-label follow-up — 2026-11-15

Runtime/UI test source: `ad10800b9d6f83346d3d37ddd23dfe9c3a4c5421`.
The following evidence commit changes documentation and clarifies one native
check name only. The final harness is pinned by SHA-256 in its receipt; no
product source changed after the fresh validations below.

Review now separates an unwritten proposal's destination from the recipe's
replace/append action. The exact generated labels are:

| Destination | EN | RU |
| --- | --- | --- |
| Separate note | Draft for a separate note — source unchanged · Generated | Черновик отдельной заметки — исходник без изменений · Сгенерировано |
| Source, replace | Proposed source action: Replace · Generated | Предлагаемое действие с исходником: Заменить · Сгенерировано |
| Source, append | Proposed source action: Append · Generated | Предлагаемое действие с исходником: Добавить в конец · Сгенерировано |

After a write attempt, Review shows the observed outcome (for example, separate
note created, applied, or conflict), not an unwritten draft. Incomplete generation
retains its warning even when an unselected row is marked skipped. The existing
human-review warning stays visible. History renderers and journals are unchanged
and continue to describe actual creation, application and Undo results.

This is presentation only: `row.action`, recipes, output schema, write plans,
generation, confirmations, Apply/Undo and journal formats are unchanged. The
existing destination-change handler rerenders the label without regeneration.
No new setting, dependency, version or backend contract was introduced.

Fresh checks ([commands and exit codes](r03-review-label-evidence/checks.json)):

| Check | Result |
| --- | --- |
| Targeted presentation/workflow/create tests | [125 passed](r03-review-label-evidence/targeted.log), including 10 new RU/EN label tests |
| Full suite | [5,162 tests / 195 files passed](r03-review-label-evidence/suite.log) |
| Typecheck, production build, lint | [Passed](r03-review-label-evidence/typecheck-build-lint.log); zero errors, two existing fetch warnings |
| Mutation audit | [5/5 killed](r03-review-label-evidence/mutation.log); restored tests passed |
| Final native Review probe | [PASS](r03-review-label-evidence/native/native-report.json): 24 label observations, 10 scenario assertions, zero exceptions |

Two fresh bounded native runs used Obsidian 1.13.7 / Electron 43.6.0, Xvfb/Openbox
and Native frame in new disposable profiles. Each made exactly four explicit
synthetic loopback requests: one per language/action. No paid or live model
request occurred. The final run took 24.271 seconds. Each of its four matrices
switched `new-note → source → new-note` in both standard themes on the same
immutable generated Review: **zero additional model requests, note writes,
note creations or journal writes**, with identical on-disk Markdown/journal
hashes. It then created two separate notes (EN), applied and undid two source
changes (RU), and checked actual history outcomes in both languages. The seven
original synthetic Markdown files were byte-identical at completion. Synthetic
responses validate UI/contracts, not model quality.

The [first run](r03-review-label-evidence/attempt1/native-report.json) and all its
captures remain. One check name imprecisely mentioned Undo for separate-note
creation; the final run clarifies that wording. Only source changes used Undo;
created notes were not automatically deleted. No failed assertion or exception
was filtered. This is not a rerun of the historical 66-scenario suite or a new
large UX experiment.

Full 1300×950 client screenshots, uncropped (the same folder includes the four
write outcomes and two History captures):

| Review | Separate note | Source |
| --- | --- | --- |
| EN / replace / light | [PNG](r03-review-label-evidence/native/review-en-replace-light-new-note.png) | [PNG](r03-review-label-evidence/native/review-en-replace-light-source.png) |
| EN / replace / dark | [PNG](r03-review-label-evidence/native/review-en-replace-dark-new-note.png) | [PNG](r03-review-label-evidence/native/review-en-replace-dark-source.png) |
| EN / append / light | [PNG](r03-review-label-evidence/native/review-en-append-light-new-note.png) | [PNG](r03-review-label-evidence/native/review-en-append-light-source.png) |
| EN / append / dark | [PNG](r03-review-label-evidence/native/review-en-append-dark-new-note.png) | [PNG](r03-review-label-evidence/native/review-en-append-dark-source.png) |
| RU / replace / light | [PNG](r03-review-label-evidence/native/review-ru-replace-light-new-note.png) | [PNG](r03-review-label-evidence/native/review-ru-replace-light-source.png) |
| RU / replace / dark | [PNG](r03-review-label-evidence/native/review-ru-replace-dark-new-note.png) | [PNG](r03-review-label-evidence/native/review-ru-replace-dark-source.png) |
| RU / append / light | [PNG](r03-review-label-evidence/native/review-ru-append-light-new-note.png) | [PNG](r03-review-label-evidence/native/review-ru-append-light-source.png) |
| RU / append / dark | [PNG](r03-review-label-evidence/native/review-ru-append-dark-new-note.png) | [PNG](r03-review-label-evidence/native/review-ru-append-dark-source.png) |

Final `main.js` SHA-256:
`72b5f467b09dcae663c4ea660f9fdb0d433fea6cd746c108560785375a23a25d`.
CSS and manifest retain the original hashes below. The final production rebuild
matches the native-installed bytes. [Provenance](r03-review-label-evidence/provenance.json)
and [evidence hashes](r03-review-label-evidence/SHA256SUMS) separate these new runs
from the historical host investigation and original R03 acceptance receipts.
All 160 existing R01–R03 evidence files remain byte-identical.

### Isolated execution without integrating PR #142

The existing Studio harness gained only a bounded Review mode. Its original
assertions remain; they are not claimed as freshly executed by this mode.
The **unchanged external runner** from PR #142 at
`0b37b39ca304e85096cd741cdbc99547a7faafc9` supplied Xvfb/Openbox and cleanup.
No runner code was copied, no branches merged and no #142 files changed.
No windows were opened on the working desktop. The legacy harness still uses
port 9286 serially; the wrapper checks it before/after instead of claiming
dynamic-port enrollment. Owned process groups were gone after both runs.

To reproduce from this R03 worktree with that separate infrastructure worktree
available (installed prerequisites are described in #142):

```sh
npm run build
VEYNREL_R03_REVIEW_LABELS=1 python - <<'PY'
import importlib.util, socket, subprocess, sys, uuid
from pathlib import Path
infra = Path('../native-isolation-20261115').resolve()
assert subprocess.check_output(['git', '-C', str(infra), 'rev-parse', 'HEAD'], text=True).strip() == '0b37b39ca304e85096cd741cdbc99547a7faafc9'
spec = importlib.util.spec_from_file_location('isolated_runner', infra / 'scripts/native/run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
def port_closed():
    with socket.socket() as probe:
        probe.settimeout(.3)
        return probe.connect_ex(('127.0.0.1', 9286)) != 0
assert port_closed(), 'Legacy harness port occupied; refuse to attach'
root = '/tmp/veynrel-studio-native-r03-labels-' + uuid.uuid4().hex[:12]
code = runner.run(['node', str(Path('scripts/studio-source-preservation-native.mjs').resolve()), root,], root, 180)
assert port_closed(), 'Legacy CDP listener remained after cleanup'
sys.exit(code)
PY
```

The Native-frame result does not close the Hidden/Obsidian-frame gate, establish
a fix for the historical first-pointer issue, or prove physical desktop/GPU/IME
behavior. The earlier split/popout/restart/narrow-panel and full UX recordings
remain historical evidence, not new coverage for this small follow-up. #142's
integration is deferred until R03 is resolved. The draft PR records CI for its
new exact HEAD separately from these local checks; owner acceptance remains
required. No upstream bug report was submitted.

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
Timestamp here: `1794652314612.934`. The signature predates R03. The subsequent
[host lifecycle investigation](native-zoom-root-cause.md#newly-observed-failure-mechanism)
localized a reproduced failure without Veynrel, including a Wayland launch:
a debounced `frameDom.updateStatus` runs after the settings window unloads.
Its DOM `closed` flag remains false while `webContents` is an empty object and
`getZoomFactor` is undefined. The live main window retains a valid method.
This is direct paused-call-frame/lifecycle evidence, not stack matching alone.
The lower-level missing IPC metadata explanation remains an inference; original
R01–R03 receipts lack receiver state and cannot each be retrospectively proved
to have the same trigger.

The verified host configuration workaround is **Native frame + Relaunch**:
Settings → Interface → Window frame style → Native frame → Relaunch. No personal
profile, Obsidian source, third-party code or Veynrel runtime workaround was
changed. No monkey patch or exception suppression is used. This avoids the
observed handler; it does **not** fix Obsidian.

Historical control environment: Obsidian **1.13.7**, Electron **43.6.0**, Chromium
**150.0.7871.250**, `@electron/remote` **2.1.3**, GPU disabled; X11 launches use
XWayland on the Wayland desktop. The same mixed sequence also reproduced on a
clean host launched with Wayland (3 exceptions / 13 settings closes).

| Native frame control from the investigation | Exceptions / settings closes | Original Markdown |
| --- | --- | --- |
| [Clean host, mixed sequence](native-zoom-root-cause-evidence/host-native-matrix.json) | 0 / 13 | Preserved |
| [Clean host, settings only](native-zoom-root-cause-evidence/host-native-reduced.json) | 0 / 7 | Preserved |
| [R03, original mixed sequence](native-zoom-root-cause-evidence/r03-native-matrix.json) | 0 / 13 | **Mismatch retained; not a source-preservation pass** |
| [R03, Reading-view repeat](native-zoom-root-cause-evidence/r03-native-reading.json) | 0 / 13 | Preserved |

Total: **four profiles, 46 settings closes, zero exceptions**. This is a bounded
workaround observation, not a rare-race guarantee. The paired Reading-view run
with Obsidian frame still records 2 / 13; Hidden/Obsidian frame has an unresolved
strict zero-exception gate. The separate pointer limitation below remains open.

Provenance: local investigation commit
`442a9f74104b60e59d5e44a4ac55c1b041b1acdc`, parent
`02be9894ccc7dfcc1e3332d7a3f3630d4488b35c`. Its diff was inspected before explicitly
copying only its 62 documentation/evidence/diagnostic files; no cherry-pick or
branch merge. Their original 61-file checksum inventory remains valid. All old
R01/R02/R03 failed receipts remain byte-identical. These investigation runs and
their test results are historical evidence, **not new executions in this follow-up**.
The [upstream report](native-zoom-upstream-report.md) remains an unsubmitted draft.
Its historical commands require an idle test desktop and are not run by this task.

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

| File | Original tested SHA-256 (before the Review-label follow-up) |
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
declared accepted. Native frame has a verified host workaround; the
Hidden/Obsidian-frame zero-exception gate and intermittent first-pointer issue
remain open. PR #142 remains an independent infrastructure draft; it is not
merged or copied into this branch, and integration is deferred. Linux desktop only:
no Windows/macOS, physical mobile, custom-theme matrix or screen-reader speech
acceptance. No live provider quality or public Community availability recheck.
No new D30 simulation. Native fault injection is distinguished from spontaneous
failure evidence; the 1,000-note first scan is partial.

Folder-scoped Health execution and durable UI drafts would require separate
backend/persistence decisions; R03 makes their current limits visible. They are
questions for separately authorized work, not new promises assigned to R04.
R04's profile/registry work and every later-stage algorithm/provider/Recall change
remain in their existing roadmap units and dependencies, untouched here.
