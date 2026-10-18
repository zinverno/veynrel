# Realistic Knowledge Consolidation: native evidence

Final run: `/tmp/pair-inspector-realistic-eval-frozen`, a newly created synthetic
vault and separate Obsidian profile. Runtime: Obsidian 1.13.7 / Electron 43.6.0.
Base product bundle SHA-256:
`9f4bd1d5649e3317c66d289b0c58d9dae737577f77f8ef6cc553b52ff2038093`.

The [raw report](consolidation-realistic-evidence/native-report.json) contains
18 existing inspector assertions plus 53 realistic-chain assertions, all passing.
It includes all 24 scenario rows, native paragraph boundaries/refusal reasons,
dependency inventories, four complete before/after cycles, operation IDs,
confirmation counts, restored SHA-256 and the exact 16 `Vault.process` paths.
The [freeze](consolidation-realistic-evidence/freeze.json) and
[artifact checksums](consolidation-realistic-evidence/sha256.json) identify the inputs.

The actual Analyzer request/response session and UI run normally, except the
completion transport returns the case's scripted control after explicit consent.
No paid requests occur. Native MetadataCache supplies paragraphs, headings,
links, frontmatter links and incoming consumers. A test-only bundle exposes
existing pure paragraph guards to count first refusal reasons; it does not
replace parsing, `Vault.process`, journals, receipts or Undo.

| Check | Observed result |
|---|---|
| Analyzer input gate | Case 18 stops at `tooLarge`; zero completion calls |
| Analysis/planning | 23 accepted controls; all 24 cases preserve Markdown/journal bytes and call no mutation API |
| Useful transfer intent | 4 plans /12 intended scenarios; all remaining intended cases refuse |
| Read-only manual override | Cases 12/15/20 can build a copy plan despite reference prohibition; never applied |
| Merge Apply | Only canonical changes, secondary byte-identical |
| Archive planning and review | No Markdown or journal writes, no additional completion |
| Archive Apply | Only secondary gains the exact two YAML properties; no body/path/link rewrite |
| Active archive after restart | Parent Merge Undo unavailable |
| Archive Undo after restart | Secondary's exact original text restored; canonical and parent Merge journal preserved |
| Merge Undo after another restart | Both originals restored; every one of the 50 realistic files/consumers matches its original Buffer |
| Complete cycles | Cases 03/04/21/24; both canonical directions; six copied paragraphs |
| Actual mutation calls | Exactly 16 process calls, no modify/create/delete/rename/append calls during operation |
| Restarts | Eight real owned-process SIGKILL/restarts after completed operations |
| UI matrix | EN/RU × light/dark ×1200/390px; no horizontal overflow; Enter confirms archive consent |

Timing from opening the already selected pair to a plan/refusal was 125–400ms
(median 232.5ms); successful paths were 219/302/255/323ms. These are scripted
interaction timings, **not human task times**, and exclude discovery and model
latency. The final experiment does not measure how long a person needs to read
the complete sources and make 10–12 confirmations.

## Screenshots

All 22 screenshots are unedited captures from the synthetic run. The full source
and after text are retained in the report, so a screenshot viewport is not the
only preservation evidence.

| Language | Light 1200 | Dark 1200 | Light 390 | Dark 390 |
|---|---|---|---|---|
| EN | [view](consolidation-realistic-evidence/realistic-en-theme-light-1200.png) | [view](consolidation-realistic-evidence/realistic-en-theme-dark-1200.png) | [view](consolidation-realistic-evidence/realistic-en-theme-light-390.png) | [view](consolidation-realistic-evidence/realistic-en-theme-dark-390.png) |
| RU | [view](consolidation-realistic-evidence/realistic-ru-theme-light-1200.png) | [view](consolidation-realistic-evidence/realistic-ru-theme-dark-1200.png) | [view](consolidation-realistic-evidence/realistic-ru-theme-light-390.png) | [view](consolidation-realistic-evidence/realistic-ru-theme-dark-390.png) |

Additional captures:

- Diff: [03](consolidation-realistic-evidence/realistic-diff-03.png), [04](consolidation-realistic-evidence/realistic-diff-04.png), [21](consolidation-realistic-evidence/realistic-diff-21.png), [24](consolidation-realistic-evidence/realistic-diff-24.png).
- Separate Undo consent after restart: [03](consolidation-realistic-evidence/realistic-undo-03.png), [04](consolidation-realistic-evidence/realistic-undo-04.png), [21](consolidation-realistic-evidence/realistic-undo-21.png), [24](consolidation-realistic-evidence/realistic-undo-24.png).
- Refusals: [headings](consolidation-realistic-evidence/realistic-refusal-05.png), [code neighbour](consolidation-realistic-evidence/realistic-refusal-07.png), [contradiction](consolidation-realistic-evidence/realistic-refusal-11.png), [long headed source](consolidation-realistic-evidence/realistic-refusal-19.png), [context](consolidation-realistic-evidence/realistic-refusal-23.png), [input limit](consolidation-realistic-evidence/realistic-input-limit-18.png).

## Harness development failures and scope

[Development diagnostics](consolidation-realistic-evidence/harness-development.json)
retain two failed trial outcomes. The first dispatch condition accidentally also
ran the previous Archive Apply matrix; it was narrowed to the requested flag.
An unscoped before/after selector then read an older preview in Operation History
instead of the active consent modal. The corrected selector is scoped to
`.ai-archive-apply`; both the full matrix and frozen-input run pass. These were
harness defects; no product code or safety guard was changed to pass acceptance.

Only fetch/XHR and the completion injection are observed for network behavior;
this is not OS-wide network isolation or a `requestUrl` instrumentation claim.
The profile contains synthetic credentials only. No physical mobile, custom
themes, screen-reader study, human timing study or real model evaluation ran.
Completed-operation restarts do not replace the earlier fault-injection matrix.
No ACID, filesystem atomicity, fsync or independent-process exclusion guarantee
is inferred for the product journals.
