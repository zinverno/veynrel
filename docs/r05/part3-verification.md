# R05.3 verification and combined R05 acceptance

Date: 2026-11-15. Base/main: `c75642e0b9eb0bf63b3128a9286304009a2011d2`
(merged R05.1 #144 and R05.2 #145). Final tested runtime and harness source:
`be926d2edfa5d809dff43ee53488eeefe6b06a85`. Later evidence/documentation changes
have no runtime effect. The PR body pins its final HEAD and exact-head CI.
Latest public stable was independently rechecked as **2.3.1** (published
2026-11-02); development manifest remains **unpublished 2.4.0**.
No merge, release, tag, Marketplace update, deployment, paid request, personal
vault install, Resume Batch implementation or R06 work occurred.

## Delivered boundaries

See the [pre-implementation ownership audit](part3-audit.md) and
[registry/decision contract](registry-editing-and-decisions.md).

- One explicit tag/convention/category definition edit or removal inside the
  unique supported JSON fence; surrounding Markdown exact. Existing Definitions
  v1, category validation, literal tag spelling/Unicode and unused tags retained.
- `edit_organization_registry` uses the existing SafeApplyService lock, blockers
  and History, with a strict typed v1 subjournal. Old journal formats/records are
  unchanged. Exact before/after, separate consent, checked backups, process guard,
  readback, restart classification and exact unchanged-result Undo.
- Successful file writes invalidate and revalidate the active registry, notify
  existing readers and invalidate prepared authority. There is no settings-copy
  fallback or success before readback/reload.
- New full-authority decision identity excludes counts/examples/time/irrelevant
  rules. Explicit leave/later/restore are persist-first, within one 200-entry
  budget. Legacy opaque IDs remain intact; only exact old recomputation matches,
  and promotion requires explicit consent. Unrecoverable identities are not guessed.
- Preferences v1 load unchanged; explicit new decisions use strict v2 with all
  old fields/IDs retained. Damaged/future raw data stays intact through unrelated
  saves. A confirmed caller defect was fixed: opening the tag picker with corrupt
  preferences now gives a RU/EN recovery notice before file enumeration instead
  of throwing (`invalid-picker-red.log` records the failing regression).
- Registry checkbox overflow found in a development native run was corrected
  with one scoped native-variable CSS rule. No unrelated UI redesign.

## Automated checks

| Check | Result on final implementation | Evidence |
| --- | --- | --- |
| `npm test -- --maxWorkers=2` | **5,362 passed / 207 files** | [suite](evidence/part3/checks/suite.log) |
| Added coverage compared with #145 | **64 tests**: plan 20, registry execution 23, UI 5, identity/decisions 14, settings preservation 2 | Included in full suite; existing test assertions also strengthened |
| `npm run lint` | Both typechecks, production build, ESLint passed; only two existing approved fetch warnings | [log](evidence/part3/checks/lint.log) |
| Explicit production build | Passed; exact hashes below | All final native receipts use these assets |
| `npm run audit:proposals` | **5/5 mutations killed**, restored controls passed | [log](evidence/part3/checks/mutation.log) |
| `node --test scripts/native/session-check.mjs` | **2 passed** | [log](evidence/part3/checks/native-session.log) |
| `python scripts/native/test_runner.py` | **3 passed**; error, timeout and SIGTERM cleanup | [log](evidence/part3/checks/native-runner.log) |
| New/adjusted native scripts | `node --check` and actual execution; not misrepresented as ESLint coverage | Native receipts below |

The new tests cover LF/CRLF/Unicode and surrounding YAML/prose; duplicate keys,
ambiguous fences, invalid versions/limits/BOM, no-op, strict patch reconstruction,
source identity/stat/full-content/editor/connection conflicts, one-shot consent,
backup/write/marker failures, partial/damaged journals, readback/refresh failure,
restart and user-edit Undo refusal, common locks/blockers and legacy records.
Decision controls include irrelevant notes/counts/examples, relevant rule changes,
scope/exclusions/case/Unicode, legacy IDs, 200 capacity, failed/concurrent saves and
raw damaged settings. Mutation-audit coverage is the existing five mutants, not
an assertion that every new branch was mutation-tested.

## Final native matrix

Actual Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**,
Linux/X11, private **Xvfb/Openbox**, disposable Native-frame profiles. No desktop
flag or personal settings. Synthetic sources only. All scenario launches use
`scripts/native/run.py`; Community uses the existing local catalog fixture,
`COMMUNITY_PUBLIC=0`. Native scripts were run sequentially for the final matrix.

| Scenario | New final result | Unhandled exceptions | Evidence |
| --- | --- | --- | --- |
| registry | **32 checks passed** | **0** | [receipt](evidence/part3/delivery/registry/report.json) |
| smoke | **21 checks passed** | **0** | [receipt](evidence/part3/delivery/smoke/report.json) |
| organization | **44 checks passed** | **0** | [receipt](evidence/part3/delivery/organization/report.json) |
| actions | **23 checks passed** | **0** | [receipt](evidence/part3/delivery/actions/report.json) |
| local-notes | **67 checks passed** | **0** | [receipt](evidence/part3/delivery/local-notes/report.json) |
| studio | **66 checks passed** | **0** | [receipt](evidence/part3/delivery/studio/native-report.json) |
| recall | **45 checks passed** | **0** | [receipt](evidence/part3/delivery/recall/report.json) |
| community | **47 checks passed** | **0** | [receipt](evidence/part3/delivery/community/report.json) |

All 19 observed CDP ports were distinct and closed; every owned process group was cleaned.

The R04 assertion was adapted to the new explicit v2 decision list instead of
expecting a new ID in the legacy `dismissed` array. All original behavioral
assertions remain. R05.2 uses the actual Workspace picker, not its direct-entry
Review-only mode. Studio/Recall/Community synthetic transport requests are local
contract checks, not live-model quality or semantic recommendation evidence.

### R05.3 completed journeys and IO

[Registry receipt](evidence/part3/delivery/registry/report.json),
[registry video](evidence/part3/delivery/registry/registry-journey.mp4),
[decisions video](evidence/part3/delivery/registry/decisions-journey.mp4).
Videos are uncut 1600×1000 private-Xvfb recordings: approximately 26.6 and 8.6
seconds. The registry video includes a real Obsidian restart.

- Connected file → choose status/description → full before/after and diff →
  separate Save → exact disk result → host restart → explicit registry reread →
  History → separate Undo → original bytes and active definitions restored.
- Audit → explicit leave-as-is → create an unrelated synthetic diary → fresh
  audit → same full authority remains dismissed → explicit restore. Later is
  then saved separately and restored, without Markdown mutation.
- RU/EN × dark/light at 390px: field/control bounds, no horizontal overflow,
  localized confirmation, Tab and Escape. Actual split editor refuses preparation;
  actual popout owns the editor and focus; reduced motion remains enabled.
- Corrupt settings are injected only into the synthetic profile, plugin reloaded,
  and the real tagging entry refuses visibly without fallback, scan, note read or
  rewrite of the original raw settings object.

Before Save, original Markdown hashes match and there are zero note writes.
The operation records exactly one `Rules.md` write in Apply and one in Undo.
Only the explicitly created `Unrelated.md` fixture is an additional note create.
Passive opening performs zero note reads/writes/model requests and does not run
an audit. Existing Workspace scope-list enumeration and Obsidian's own startup
link-cache probes are separately recorded with call stacks; they are not falsely
reported as zero host activity. Settings/journal adapter writes and operation
reads are retained per phase in the receipt. Registry operations make **zero
model or renderer HTTP(S) requests**.

Full client screenshots (uncropped, actual viewport):
[connected](evidence/part3/delivery/registry/connected-registry.png),
[definition draft](evidence/part3/delivery/registry/definition-draft.png),
[full before](evidence/part3/delivery/registry/registry-full-before.png),
[full after](evidence/part3/delivery/registry/registry-full-after.png),
[diff/confirmation](evidence/part3/delivery/registry/registry-diff-confirm.png),
[History after restart](evidence/part3/delivery/registry/registry-history-restart.png),
[exact Undo](evidence/part3/delivery/registry/registry-undone.png),
[dismissal retained](evidence/part3/delivery/registry/still-dismissed.png),
[RU dark 390 editor](evidence/part3/delivery/registry/ru-dark-390-editor.png),
[RU light 390 Review](evidence/part3/delivery/registry/ru-light-390-review.png),
[popout](evidence/part3/delivery/registry/popout-registry.png),
[corrupt-settings refusal](evidence/part3/delivery/registry/corrupt-preferences-refusal.png).
The delivery directory also contains all EN/RU theme variants.

## Combined R05.1–R05.3 acceptance

| User route | New evidence on this combined runtime | Boundary |
| --- | --- | --- |
| Finding → compare → local link → Apply/Undo | R05.1 actions, 23 checks | Real pair paths, explicit range, source only, exact Undo; no model analysis implied |
| Broken-link Finding → occurrence/target → Apply/Undo | R05.2 local notes, 67 checks | One supported native-positioned wiki-link; not all occurrences or unsupported alias/embed |
| Manual tag → Review → Apply/Undo | Same R05.2 run, actual Workspace picker | One safe paragraph; no YAML reserialization, mandatory tags or semantic inference |
| Organization proposal → confirmed rule | R04 organization, 44 checks | Existing draft/Review/Save; new audit retains profile; no automatic acceptance |
| Connected registry → edit → Save/reload/Undo | R05.3, 32 checks | One definition; strict fence-body splice, shared lock/history and unchanged-result Undo |
| Leave as is / Later / Return | R05.3 plus decision/settings tests | Distinct persist-first states; unrelated note does not reopen; no guessed legacy migration |

These results deliver the bounded R05 implementation for owner review. They do
not close the host/entry gates below or claim unconditional product acceptance.
No next stage is started automatically.

## Retained failures and open gates

All original receipts remain untouched. Separate public copies and original/public
SHA-256 values are in [SHA256.json](evidence/part3/SHA256.json).

| Development/control attempt | Observation and disposition |
| --- | --- |
| [01](evidence/part3/development-attempts/01-passive-counter/report.json) | Initial blanket zero-metadata assertion included host/startup activity. Separate stack/phase counters now distinguish existing scope-list enumeration and host probes from audit execution. No scan assertion was removed. |
| [02](evidence/part3/development-attempts/02-checkbox-overflow/report.json) | Real new checkbox overflow; fixed with scoped width, then verified in both themes/390px. |
| [03](evidence/part3/development-attempts/03-history-overlay/report.json) | Harness left History open after Undo and tried to activate the underlying Workspace. Harness now explicitly closes History; no retry/reopen fallback. |
| [04](evidence/part3/development-attempts/04-cdp-tfile/report.json) | Fixture creation returned a cyclic TFile through CDP. Diagnostic expression now returns void. |
| [05](evidence/part3/development-attempts/05-first-modal/report.json) | First Audit entry did not attach. **Known intermittent first-modal gate remains open**; no delay/retry fix claimed. |
| [06](evidence/part3/development-attempts/06-startup-focus/report.json) | Native startup focus assertion failed before any scenario action. Separate final sequential runs pass; cause not established. |
| [07](evidence/part3/development-attempts/07-host-crlf-normalization/report.json) | After proven exact Undo, opening the CRLF registry in the host editor normalized it to LF. Converting those LF bytes back to CRLF reproduces the original SHA exactly. Final Save/Undo keeps CRLF; the open-editor refusal uses a separate LF registry. This does not fix or conceal host normalization. |
| [08](evidence/part3/development-attempts/08-community-pointer/report.json) | Community pointer activation of Review timed out after 10 checks; zero exceptions. A separate identical pre-final control passed 47. **First-pointer gate remains open**, not fixed by a successful repeat. |

Earlier R01–R05 evidence is unchanged. Across seven registry development/control
attempts before successful delivery, each failure above is separately retained
(including one first-modal and one focus failure). This is a changing development
sequence, not a statistically valid failure-rate estimate. The two later bounded
registry delivery runs passed (31 checks before the corrupt-settings guard, then
32 on the final runtime); zero exceptions does not prove an intermittent race fixed.

Obsidian/Hidden custom-frame `getZoomFactor` remains an open host gate; Native
frame plus restart is the existing bounded workaround, not an Obsidian fix.
Xvfb does not validate GPU, a real compositor/physical desktop, IME, accessibility
assistive technology or other platforms. No live semantic-quality or human
productivity experiment was performed. Full notes/registry editors deliberately
block automatic writes even when their displayed text appears saved.

## Build and provenance

| Asset | SHA-256 |
| --- | --- |
| `main.js` | `faf6dcb763aeb654406ba48bee23f6ee8064e9ee7988b8ced62b7d5466224a34` |
| `styles.css` | `d71204f8c1f63bee141c383047ec10752254285936181b77efbaee9386babc87` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

[Build manifest](evidence/part3/build.json) pins source and scenario outputs.
Pre-final reports are labeled separately; they use the earlier bundle
`c555503e…`, before the corrupt-settings picker guard. They are not substituted
for final native checks. Public text receipts normalize only checkout prefixes;
raw originals and hashes are retained at the listed task-owned `/tmp` paths.
Original failed screenshots are retained, not replaced with passing images.
No version/dependency, Recall/Studio journal or Resume Batch file changed.
