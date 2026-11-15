# R05.2 verification — local tags and selected wiki-link repair

Date: 2026-11-15. Base/main (rechecked before publication):
`0beb6d65ee88e0e3eaeb9eca057fb5315ae9606d`, containing merged R05.1 #144.
Runtime source: `1260c9dee657c65f1c8fe4a11fe81396e0ee7d9e`.
The later test/docs/harness commits through
`0933b0fea5d31879201b329f284696e7f36d9a5c` do not change runtime sources.
The final evidence commit also normalizes one trailing blank line in the new preparation module; rebuilding produces the identical tested bundle hash below. The PR supplies that exact final HEAD and its CI results.
Public latest stable was independently rechecked as **2.3.1**; development
manifest remains **unpublished 2.4.0**. No release, tag, Marketplace update,
merge, paid request or personal-vault installation occurred.

**Final UX follow-up:** [new labels/layout checks and separately preserved native entry failures](ux-followup-verification.md). The results below remain the original delivery evidence.

## Delivered contracts

[Local action guide](local-note-actions.md) describes the supported/refused
Markdown structures, rules authority, closed-editor boundary and manual recovery
limits. [Pre-implementation audit](part2-audit.md) maps the old owners and new
strictly bounded transforms. Both local journeys write a real single synthetic
note and support exact Undo, not just a read-only planning interface.

- `add_inline_tag`: explicit manual/observed/allowed tag, selected native plain
  paragraph, inline insertion; no YAML changes or semantic inference.
- `repair_wikilink`: selected current unresolved native occurrence and explicit
  existing target, exact full-path replacement; not `add_link` or a global replace.
- Both use the existing SafeApplyService lock, cross-family blockers, native
  saved-note/editor guards, Vault.process, full readback and shared History.
  New version-1 typed subjournal; existing v1 journals and formats untouched.
- Connected definitions are reread, not copied into an editable settings fallback.
  The journal authority snapshot is immutable evidence, not a second rules source.
- Existing Findings, comparison, link planning, Studio, Recall and Community
  entry points remain. Writing never automatically resolves a Finding.
- [Resume Batch](../roadmap/resume-batch.md) is recorded as a separate mandatory
  pre-release requirement only. Registry editing and stable dismissal IDs remain
  **R05.3**; this is not completion of all R05 or authorization to start R05.3.

## Automated checks on the delivered implementation

| Check | New result | Evidence |
| --- | --- | --- |
| Full `npm test -- --maxWorkers=2` | **5,290 tests / 203 files passed** | [log](evidence/part2/checks/suite-final.log) |
| New focused contracts/UI | **64 tests** across three files; included in full suite | `localNotePlan.test.ts`, `localNoteApply.test.ts`, `localNoteModal.test.ts` |
| `npm run lint` | Typecheck (including Health boundary), production build and ESLint passed; only the existing two approved fetch warnings | [log](evidence/part2/checks/lint-final.log) |
| `npm run audit:proposals` | **5/5 mutations killed**, restored controls passed | [log](evidence/part2/checks/audit2.log) |
| `node --test scripts/native/session-check.mjs` | **2 tests passed** | [log](evidence/part2/checks/session-final.log) |
| `python scripts/native/test_runner.py` | **3 tests passed**: failure, timeout and interrupt cleanup | [log](evidence/part2/checks/runner2.log) |

R05.1 had 5,226 tests / 200 files: the difference is exactly **64 added tests in
three new files**, with no removed/relaxed old assertions. These include existing
inline/YAML/case-variant tags, allowed-unused/excluded/deprecated definitions,
complex YAML refusal, missing/stale metadata, repeated links, unsupported tokens,
same-path target replacement/deletion, explicit rules changes during review and
backup IO, independent concurrent dispatch, double Apply, cancellation, backup
failure, write refusal, restart, readback/marker interruption, and Undo conflicts.
The current-text callback test changes the source without updating observed stat;
Vault.process still refuses to overwrite that external edit.

The mutation audit is the repository's retained **proposal** audit, not a new
mutation score for the whole local-note executor. New executor safety is covered
by targeted fault-injection tests and native operations, without claiming a new
mutation metric.

## Native evidence: actual Obsidian, isolated Xvfb/Openbox

Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**, Linux/X11,
private Xvfb/Openbox, Native frame, GPU disabled. Each run used a separate
synthetic vault/profile through `scripts/native/run.py`; no `--desktop` run.
Every successful launcher receipt records its own CDP ports closed and process
group cleaned. Screenshots capture the complete client viewport without cropping.

| Scenario | Actual assertions | Exceptions | Receipt |
| --- | ---: | ---: | --- |
| New `local-notes` | **44** | **0** | [report](evidence/part2/native/report.json), [isolation](evidence/part2/native/isolation/result.json) |
| Existing smoke | **21** | **0** | [report](evidence/part2/regressions/smoke/report.json) |
| R05.1 `actions` | **23** | **0** | [report](evidence/part2/regressions/actions/report.json) |
| Studio full scenario | **66** | **0** | [report](evidence/part2/regressions/studio/native-report.json) |
| Recall | **45** | **0** | [report](evidence/part2/regressions/recall/report.json) |
| Community, local catalog fixture | **47** | **0** | [report](evidence/part2/regressions/community/report.json) |

[Continuous native recording](evidence/part2/native/journey.mp4) (about 16 seconds)
shows **tag choice → Review → Apply → disk → History → Undo**, followed by
**real broken-link Finding → second identical occurrence → full target path →
Review → Apply → disk → History → Undo**. Native frame timestamps are preserved;
this is not an edited slide montage or DOM simulation.

[Tag choices](evidence/part2/native/tag-choices.png),
[tag Review](evidence/part2/native/tag-review-en-dark.png),
[real Finding](evidence/part2/native/broken-finding.png),
[repair Review](evidence/part2/native/repair-review.png),
[RU/light/390px tag](evidence/part2/native/ru-light-390-review.png),
[RU/light/390px repair](evidence/part2/native/ru-light-390-repair.png),
[split refusal](evidence/part2/native/split-refusal.png),
[real popout](evidence/part2/native/popout-tag.png) are full client captures.
The directory also contains the EN/RU dark/light matrix and exact disk outcomes.

The new report records per-stage reads/writes/adapter operations, active Workspace
scope and exact action paths, network attempts, exceptions, artifact hashes and
restart IO. Source files stay byte-identical until separate Apply. Each Apply and
Undo has exactly one source write; unrelated Markdown stays unchanged. YAML,
CRLF and Unicode survive the supported tag splice and Undo. Two same-basename
targets remain distinct. Opening split editors blocks preparation. Native keyboard
input exercises choices, confirmation, Tab and Escape; popout focus returns to
the main window. Both preparation and Review pass the 390px RU/EN/theme matrix.
The final restart reads two completed journals, makes zero Markdown writes and
retains original bytes/settings (apart from explicitly exercised language choice).

New actions/passive navigation make **zero model requests**. Regression harnesses
use existing synthetic local transport (Recall records eight local fixture
requests; Community one); Studio records zero remote inference requests. None of
these results measure live-model quality, semantic recommendation quality or human
benefit. The Community catalog is local, not a test of public catalog availability.

## Preserved unsuccessful attempts and bounded limits

- [First native development attempt](evidence/part2/development-attempts/attempt1-host-editor-crlf/report.json):
  both mutations and byte-exact Undo succeeded, then opening the CRLF tag fixture
  in Obsidian's editor converted it to LF. The final History assertion correctly
  failed: current content no longer matched the undone receipt. The separate LF
  editor fixture isolates that host write; no exception filter, delayed retry or
  runtime workaround was added. That first run had **zero exceptions**.
- [Second development run](evidence/part2/development-attempts/attempt2-pass/report.json)
  and [frozen-runtime 28-check run](evidence/part2/development-attempts/attempt3-pass/report.json)
  remain separate from the final 44-check delivery run. Uncommitted development
  attempts identify executed assets by SHA-256; no invented source commit is
  attributed to them.
- [Initial full suite](evidence/part2/development-attempts/suite1.log) failed on a
  new transitive FuzzySuggestModal dependency in old UI mocks. Splitting preparation
  from consent/history restored all old tests; their assertions were not changed.
  Initial lint errors and their original log are retained too.
- First sandbox runner controls could not create private X11 sockets. The initial
  mutation probe also lacked the expected child-test output. Those failed controls
  remain in `development-attempts`; the external local reruns above provide actual
  passing controls. The first sandbox session output did not enumerate both tests;
  the final receipt explicitly does.

Raw originals remain at task-owned `/tmp` paths listed in [SHA256.json](evidence/part2/SHA256.json).
Public text copies replace only checkout/repository absolute path prefixes;
original and published hashes are both recorded. Old R01–R05.1 evidence is unchanged.

Not established by Xvfb: real compositor/GPU, IME, custom/hidden frame reliability,
physical-desktop focus behavior or semantic/human usefulness. Historical first
modal/first pointer and custom-frame gates remain documented, not fixed here.
Native negative cases cover split editor, BOM and byte preservation; detailed
storage/registry/crash permutations are deterministic contract tests, not claims
that every fault was induced in a real filesystem. Damaged/partial journal
recovery remains manual and blocked; no automatic replay/reservation release.

## Runtime assets tested by all six final native suites

| Asset | SHA-256 |
| --- | --- |
| `main.js` | `3725d4a85501d617fc7029df92d9decfe4edfa0e965c573d95eab61c64f70f03` |
| `styles.css` | `86d1b6ca8a4ff7b46764b95e17f44638d38fb6d5dde1124432aa41e53c3bfb20` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

Version/dependencies, existing journal formats, Recall data and the common release
policy are unchanged. Publication remains a separate owner decision after R15.
