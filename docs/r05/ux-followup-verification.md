# R05.2 final UX follow-up — PR #145

Date: 2026-11-15. PR base/main: `0beb6d65ee88e0e3eaeb9eca057fb5315ae9606d`.
Starting PR HEAD: `210d72d26435a298830b5f762e0e71089d1a3b01`.
Updated runtime source: `00670e438566712e8336bd645256bbead0bab0b5`.
Later harness/evidence changes do not change that runtime. The PR description
records the final HEAD and its CI. Version, dependencies and release policy are unchanged.

## Changes and preserved contracts

Both `add_inline_tag` and `repair_wikilink` use the existing single-change
`safeApply` confirmation and success text for Apply and Undo. History now says
“Review undo” / “Проверить откат”. It no longer describes a group transfer,
canonical note or secondary notes. The retained `groupApply.failure` key has
neutral recovery wording in both languages; its displayed text does not describe
a group operation. Failure tests check that it does not claim a successful write.

Tag preparation separates the manual-candidate label/input, local inventory
button, paragraph selection and Review action into four vertical blocks. Scoped
CSS uses Obsidian spacing variables and wraps the inventory button at narrow
widths. Labels remain associated with their input/select. No controls are hidden.

Tag filters, allowed values, selection handlers, execution/confirmation semantics,
plans, validators, locks, journals and Undo implementation are unchanged. The diff
against the starting HEAD changes only two UI modules, scoped CSS, UI tests,
the existing native harness and new documentation/evidence.

## New automated checks

| Check | Result | Evidence |
| --- | --- | --- |
| Focused UI suite | 13 tests passed, including 8 new RU/EN tests | [log](evidence/ux-followup/checks/target2.log) |
| Full `npm test -- --maxWorkers=2` | **5,298 tests / 203 files passed** | [log](evidence/ux-followup/checks/suite.log) |
| `npm run lint` | Typecheck, Health boundary, production build and ESLint passed; only the two existing approved fetch warnings | [log](evidence/ux-followup/checks/lint.log) |
| `npm run audit:proposals` | **5/5 mutations killed**, restored controls passed | [log](evidence/ux-followup/checks/audit.log) |
| Final native harness syntax | `node --check` passed; native execution tested below | [log](evidence/ux-followup/checks/harness-syntax.log) |

The test-count difference from 5,290 is exactly eight new tests, with no removed
or weakened tests. They cover RU/EN × both operations, Apply/Undo confirmation
and success, History Undo, and write errors without misleading success language.
The first focused-test run used an incorrect expected English error string
(“Write was not confirmed” instead of the existing “Write not confirmed”); its
[failed log](evidence/ux-followup/checks/target1.log) is retained. Production error
text was not changed to satisfy that test. Native `.mjs` scripts are excluded by repository ESLint configuration; the
[direct ESLint probe](evidence/ux-followup/checks/harness-eslint.log) reported that
exclusion and is not counted as a lint pass. The mutation audit is the existing
proposal audit, not a new mutation metric for the note executor.

## Native Review evidence and entry-point limitation

Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**;
Linux/X11, isolated Xvfb/Openbox, disposable profiles, Native frame, GPU disabled.
No `--desktop` use or personal-vault/settings changes.

Two fresh-profile runs of the normal `local-notes` route failed before the changed
form: Enter focused on Workspace's “Tag a selected note” did not yield the picker
`.prompt-input`. Both receipts show an empty modal DOM, no source writes and no
uncaught exceptions. They do **not** establish whether the cause is host lifecycle,
input delivery, harness timing or Veynrel. This remains an unresolved entry gate;
there was no delay/retry/exception filter added to make it pass.

To check the requested changed UI without representing that gate as passed, the
existing harness has an explicit, opt-in scoped command:

```bash
VEYNREL_LOCAL_NOTE_REVIEW_ONLY=1 python scripts/native/run.py local-notes --timeout 240
```

It opens the real selected-file form through the existing plugin method instead
of the Workspace tag-note picker. The receipt labels this `tagEntry` explicitly.
The default command still uses the original picker route and assertions. There
is no automatic fallback. This mode is not a substitute for end-to-end picker
acceptance. Broken-link entry still uses the real Finding, and target selection
still uses the real picker. All subsequent choices, confirmations, History/Undo,
Tab and Escape use native keyboard events in actual Obsidian, not DOM mocks.

| Attempt | Actual result | Receipt |
| --- | --- | --- |
| Normal entry 1 | FAIL before picker, 2 assertions, 0 uncaught exceptions | [receipt](evidence/ux-followup/failed-picker-1/report.json) |
| Normal entry 2 | Same failure on a fresh profile, 2 assertions, 0 uncaught exceptions | [receipt](evidence/ux-followup/failed-picker-2/report.json) |
| Scoped Review development | 63 assertions passed; then diagnostic `ReferenceError: plugin is not defined` in popout, captured in `error` | [receipt](evidence/ux-followup/failed-review-popout/report.json) |
| Scoped Review final | **PASS, 67 assertions, 0 uncaught exceptions, 0 console errors** | [receipt](evidence/ux-followup/review/report.json) |

The diagnostic popout failure came from referencing the main window's harness
variable in another window. The scoped entry now looks up the real plugin through
`app.plugins`; no runtime Veynrel or host workaround was added. The final run
rechecked popout and all preceding assertions. Attempt counts are not estimates
of an intermittent failure rate, and successful scoped entry does not fix or
attribute the two picker failures.

The final run retains the old 44 scenario assertions plus **23** copy/layout
assertions: ten Apply-label checks, six History/Undo checks, two success messages,
and five measured tag layouts (regular EN/dark plus RU/EN × dark/light at 390px).
Recorded DOM rectangles prove that the label/input and four blocks do not overlap
and controls fit horizontally. Native Review checks cover both operations in the
same 390px language/theme matrix. Screenshots were visually inspected; they are
full client captures at the actual scroll position, not cropped compositions.

- [Regular tag form](evidence/ux-followup/review/tag-choices.png)
- [RU/dark tag blocks, 390px](evidence/ux-followup/review/ru-dark-390-tag-fields.png)
- [RU/light tag blocks, 390px](evidence/ux-followup/review/ru-light-390-tag-fields.png)
- [EN/dark tag Review](evidence/ux-followup/review/tag-review-en-dark.png)
- [RU/light repair confirmation, 390px](evidence/ux-followup/review/ru-light-390-repair-confirm.png)
- [Undo Review](evidence/ux-followup/review/tag-undo-review.png)
- [Continuous native recording](evidence/ux-followup/review/journey.mp4), about 19 seconds, starts from direct selected-file entry; not a successful Workspace picker recording.

Before Apply, source Markdown remains byte-identical. Each of the two Apply and
two Undo actions makes exactly one intended source write; Undo restores all fixture
bytes, including CRLF/Unicode/YAML. History records two undamaged undone operations.
Restart reads both journals with zero source writes. Settings are unchanged apart
from the explicitly exercised language choice. Zero external HTTP requests and
zero model requests were observed. Real split-editor refusal, popout/focus return,
reduced motion and BOM refusal also passed. The [launcher receipt](evidence/ux-followup/review/isolation/result.json)
confirms both dynamic CDP ports closed and only the owned process group cleaned.

## Asset identity, preservation and remaining limits

| Tested asset | SHA-256 |
| --- | --- |
| `main.js` | `361907865ebb65ecc1fbdcf5772cf05925346e8704dc5b4b542d768826121051` |
| `styles.css` | `323c2af2dd5595edd093adeb63852299ed5581d16cc82144f03011a7bad0d382` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

The built assets match the final native receipt. [SHA256.json](evidence/ux-followup/SHA256.json)
records original/published hashes and retained `/tmp` raw paths. Only absolute
checkout/repository prefixes are redacted in text copies. Old evidence, including
`docs/r05/evidence/part2`, is byte-for-byte unchanged. The [earlier verification](part2-verification.md)
remains historical; its six native regressions are not claimed as new results.

Not retested here: the independent Studio/Recall/Community native suites and
unchanged launcher self-tests. Full unit/integration regressions did run. Xvfb
does not establish physical-desktop compositor/GPU/IME behavior or custom/hidden
frame reliability. Historical first-modal/first-pointer/custom-frame gates and
the two current picker failures remain open. The verified result is the scoped
Review UI and byte-preserving local operations, not complete entry-path acceptance.
No merge, release, paid calls or R05.3 work occurred.
