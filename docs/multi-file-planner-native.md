# Multi-file planner native acceptance

**PASS**, 2026-10-17, isolated synthetic vault and profile, Obsidian **1.13.7-2**,
Electron **43.6.0**, Linux desktop. No personal vault, real credential or paid LLM.
PR #85 was verified merged at `3fd7b05d6049b20065a54e2328f9786e4374a7de`
before branching from current `main`.

Reproduce with a fresh temporary directory (CDP port 9274):

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-multi-NEW \
  --relationships --taxonomy --tag-recommendations --change-planner \
  --multi-file-planner --journal-recovery
```

The harness owns its desktop process. The multi-file phase only builds plans with
fake Relationship Analyzer responses; the later existing Safe Apply/recovery phases
intentionally write synthetic notes and interrupt their own process with SIGKILL.
Do not run fault injection against a personal vault.

## Results and exact artifacts

The full run passed **378 assertions**: Pair Inspector 18, Relationship Analyzer 51,
Taxonomy 28, Tag Recommendations 118, single-file Change Planner 51, **multi-file
planner 55**, Safe Apply/Undo 25, Journal Recovery 25 and Undo blockers 7.
The multi-file checks include repeated language/confirmation checks, not 55 distinct
product features. [Machine-readable report](multi-file-planner-evidence/report.json)
and [evidence checksums](multi-file-planner-evidence/sha256.json) record the run.

Copied plugin artifacts were byte-compared with the repository build:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `45a4e1f955db7716f2d88f91e50f22f20a2ea10575cba93a9ae073a1e5be484e` |
| `styles.css` | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json`, unchanged | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

| Native case | Observed result |
| --- | --- |
| Choose combined operation | No additional analysis; preparation reads exactly the selected A and B. |
| Independent locations and confirmation | Build stays disabled until both exact ranges have separate confirmation; keyboard Enter builds the plan. |
| Full-path reciprocal links | Cyrillic/spaces and two `Same name.md` files resolve to the correct native `TFile`; complete sources and context remain intact. |
| Successful publication | Two complete diffs, two file entries, no single-file subplan and no Apply control. Building rereads both files twice (six total reads including preparation). |
| RU/EN × light/dark × 1200/390 px | Localized literal text, no horizontal overflow, no executed HTML/embeds. |
| Change one location | Whole result disappears; both confirmations reset. |
| Repeated identical paragraphs | Only the specifically selected second occurrence receives the proposed link. |
| Cancel/reprepare | Both location selectors are empty; no silent replacement. |
| Existing link A→B, B→A, or both | One combined refusal; neither successful subplan nor saved byte changes. |
| Protected inline code | Whole plan refused using the existing paragraph guard. |
| Saved edit to A or B; move A | Existing analyzer invalidates and closes the planner; neither selection/result survives. |
| Change public link resolver while final read is held | Entire plan becomes stale; a second build click starts no additional read. |
| Close during final read; dismiss analysis | No late preview or restored result. |
| IO boundary | Zero `Vault.process`, Markdown mutations, adapter journal writes/copies and fetch/XHR calls in the planning phase; completion count unchanged after analysis. |

The initial targeted run stopped because its new harness waited for a planner `stale`
view after a saved-source change. Inspection of the existing inspector lifecycle and
the native UI showed the analyzer correctly became stale and **closed** the planner.
The harness now requires stale analysis, no planner DOM, and an idle cleared session;
product safety behavior was not changed. Targeted and complete reruns passed.

After adding separate A/B diff screenshots, an additional expanded run stopped
**before the multi-file phase**, in the unchanged Tag Recommendations screenshot
helper: its consent `details` selector returned null at `scrollIntoView`. That run
is incomplete, not PASS; no cause is claimed from the missing element alone. Its
[failure report](multi-file-planner-evidence/additional-full-incomplete.json) is
retained separately. The 378-assertion full PASS above used the same byte-identical
plugin build. The final targeted multi-file run and screenshots are recorded in
[a separate report](multi-file-planner-evidence/targeted-report.json).

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Plan](multi-file-planner-evidence/multi-en-theme-light-1200.png) | [Plan](multi-file-planner-evidence/multi-en-theme-light-390.png) | [Plan](multi-file-planner-evidence/multi-en-theme-dark-1200.png) | [Plan](multi-file-planner-evidence/multi-en-theme-dark-390.png) |
| RU | [План](multi-file-planner-evidence/multi-ru-theme-light-1200.png) | [План](multi-file-planner-evidence/multi-ru-theme-light-390.png) | [План](multi-file-planner-evidence/multi-ru-theme-dark-1200.png) | [План](multi-file-planner-evidence/multi-ru-theme-dark-390.png) |

- [Complete before/after](multi-file-planner-evidence/multi-en-before-after.png),
  [RU](multi-file-planner-evidence/multi-ru-before-after.png).
- [A diff](multi-file-planner-evidence/multi-en-diff-0.png), [B diff](multi-file-planner-evidence/multi-en-diff-1.png),
  [A diff RU](multi-file-planner-evidence/multi-ru-diff-0.png), [B diff RU](multi-file-planner-evidence/multi-ru-diff-1.png).
- [Protected location refusal](multi-file-planner-evidence/multi-protected-refusal.png).

## Automated gates and limits

`npm test`: **3350 tests / 130 files passed**, including 68 new tests. Typecheck,
lint, build, `audit:proposals` (**5/5 mutations killed**) and `git diff --check`
passed. Lint retains the existing `api.ts:404` streaming-fetch warning, zero errors.
Vitest's sandbox execution produced no completed result; the same full command and
audit were run outside the sandbox. No test failures were discarded as successes.

The new native network observation covers fetch/XHR plus the fake completion call
count, not every possible transport. Unit tests additionally verify no `requestUrl`
calls; the planning code has no provider dependency. The final restarted process's
report counter covers that process, while earlier phases assert their own IO bounds.
The entire full suite is not read-only: existing Apply/Undo acceptance writes only
its synthetic fixtures.

No physical mobile, other OS, screen reader, custom editor/theme, concurrent vault
process or real-model quality evaluation was performed. No multi-file writes,
durability, partial-execution recovery or atomicity claim is made. Those need the
separate executor described in [the planning contract](multi-file-planner-v1.md).
