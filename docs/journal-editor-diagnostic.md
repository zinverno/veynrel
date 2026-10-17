# PR #85: native editor refusal diagnosis

The follow-up to `b29d12b` changes **only the native harness and evidence**. Production
Apply/Undo code, journal/resolution formats, settings, dependencies and release version
are unchanged. The editor assertion still requires the actual `editor` error when a
buffer is unsaved; no error-word substitution or bypass of product guards was made.

## Reproduced cause

The old scenario built a saved-source plan, opened its source, called
`editor.setValue("UNSAVED USER BUFFER")`, then clicked **Review and apply**. That string
is ordinary editor text, not an instruction to Obsidian to keep the buffer unsaved.
Native autosave competes with asynchronous source reads in `port.check()`.

- When review reads first, `guardSavedEditors()` refuses with
  `SafeApplyError("editor")` and the expected editor warning.
- When autosave completes first, saved content/mtime/size no longer match the
  Relationship Analyzer snapshot. `buildChangePlan()` fails its first
  `sameSavedNote()` check with `ChangePlanError("source")`, before the editor guard,
  metadata structure checks or journal blockers. `SafeApplyModal` maps this existing
  non-SafeApply error to the existing stale-source message.

The prior failed run did not capture a stack, but its retained synthetic file contains
`UNSAVED USER BUFFER`. Two instrumented reruns took the editor-first path. A controlled
rerun retained the original assertion and paused only the harness's entry to
`port.check` until **real native autosave** completed. It reproduced the assertion
failure and recorded the exact source error, UI message and event order. This proves
the harness's timing assumption is invalid; it is not a product write bypass.

## Observed refusal

Exact UI text in the reproduced source-first refusal:

> Источники, диапазон, ссылки или настройки изменились либо недоступны. Требуется новый план и предпросмотр. Ничего автоматически не перезаписывается.

| Evidence | Observation |
| --- | --- |
| Open view | Native Markdown view for `Safe/English/Same.md`, exact source identity retained. |
| Immediately after `setValue` | Buffer/view data is `UNSAVED USER BUFFER`; saved source still has the 171-byte synthetic plan input. |
| Native save | `Vault.modify(source, "UNSAVED USER BUFFER")` called by Obsidian about 2 seconds later; native `modify` and metadata `changed` events follow. |
| When review resumes | Buffer equals the saved 19-byte file; it is **no longer unsaved**. mtime differs from the plan snapshot. |
| Actual exception | `ChangePlanError`, reason/message `source`, from `buildChangePlan` via `port.check`. |
| Saved Markdown after refusal | Exactly `UNSAVED USER BUFFER`, the user's simulated native autosave. No proposed link/embed was inserted and no saved text was overwritten by Safe Apply. |
| `Vault.process()` | **0 calls** during the refusal. |
| Journal | All **8 original files** retain identical SHA-256; no new operation or marker. |
| MetadataCache | Native cache-change event was observed before review resumed. The source comparison fails earlier than metadata-dependent validation. |
| Existing incidents | Journal blockers are downstream of the failing source check. Final regression fixtures additionally require no unresolved damaged entries before exercising the editor. Intact prior historical operations remain present in the full run. |

[Recorded trace and before/after](journal-recovery-evidence/editor-diagnostic/reproduction.json)
include exact content, stat values, event times, exception stack, buffers, cache
snapshots, journal checksums and build hashes.
[Reproduced refusal screenshot](journal-recovery-evidence/editor-diagnostic/reproduced-source-refusal.png).

## Harness correction

The existing Safe Apply scenario now calls the same focused helper used by
`--safe-apply-editor`. It tests three distinct states:

1. **Saved open editor:** native file/view readiness is awaited; review must return
   `SafeApplyError("editor")`, without disk/journal changes.
2. **Unsaved open editor:** a wrapper around public `Vault.modify` waits at a
   controlled gate. The harness waits until Obsidian actually requests autosave,
   confirms disk still equals the plan, then reviews. It must return `editor`, with
   the differing buffer preserved, unchanged stat/cache, no `Vault.process`, no write
   consent and byte-identical journal. The native save is released in `finally`.
3. **Autosaved source during review:** review starts with a dirty buffer and is paused
   before source reads; native save and MetadataCache completion are awaited. Review
   resumes and must return exactly `ChangePlanError("source")`, preserving the new
   saved text with no executor writes or journal changes.

All wrappers are temporary, delegate to the real native methods, and are restored in
`finally`. No application code is stubbed to return the expected error. Each case
records the actual UI text, exception, buffer, source identity/stat/cache, saved
Markdown, process-call count and journal hashes. This makes a future unrelated stale
plan/cache incident fail the unsaved-editor assertion instead of being accepted as an
editor refusal.

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-editor-NEW --safe-apply-editor
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-full-NEW \
  --relationships --taxonomy --tag-recommendations --change-planner --journal-recovery
```

## Coverage and limits

**Targeted native PASS: 21 assertions** (18 Pair Inspector + 3 editor cases),
using the final harness and a separate fresh vault with no operations.
[Targeted machine report](journal-recovery-evidence/editor-diagnostic/targeted-report.json).

**Full native PASS: 323 assertions** on the final harness with the unchanged
`b29d12b` production artifact: Pair Inspector 18, Relationship Analyzer 51, Tag
Taxonomy 28, Tag Recommendations 118, Change Planner 51, Safe Apply/Undo 25,
Journal Recovery 25, Undo blockers 7. Includes actual Apply/Undo, restarts, SIGKILL,
RU/EN, light/dark and 1200/390 layouts in the existing suites. Native Obsidian
1.13.7-2 / Electron 43.6.0, Linux desktop.

[Full machine report](journal-recovery-evidence/editor-diagnostic/full-report.json)
contains all three editor cases and the SHA-256 of the installed plugin and final
harness scripts. [Evidence checksums](journal-recovery-evidence/editor-diagnostic/sha256.json). The production `main.js` remains
`5dc2a22f9b5c88a63601904727ec38c4e29a978864dad5a415a99d96e44914f0`.

[Saved editor](journal-recovery-evidence/editor-diagnostic/safe-editor-clean.png) ·
[Unsaved editor](journal-recovery-evidence/editor-diagnostic/safe-editor-dirty.png) ·
[Autosaved stale plan](journal-recovery-evidence/editor-diagnostic/safe-editor-autosaved.png).

Automated: **3282 tests / 128 files**, typecheck, lint, build and diff-check PASS.
`audit:proposals`: **5/5 mutations killed**, all restored tests pass (rerun outside
sandbox after child Vitest could not start inside it). The only lint diagnostic is
the existing streaming-fetch warning in `api.ts:404`.

Preliminary attempts are not counted as final passes: one diagnostic run timed out
on restart after the editor check had passed; one later full attempt timed out on
the initial Pair Inspector opening. A fresh full run completed all 323 assertions
without loosening those checks or increasing timeouts. The initial instrumented full
run also passed its then-current 321 assertions; the controlled autosave reproduction
intentionally failed the old editor-word assertion, as recorded above.

All vaults/profiles are fresh, isolated and synthetic. No personal notes, real credentials or paid LLM calls.
This tests Linux Obsidian desktop and process interruption, not power loss/fsync,
mobile, custom editors, concurrent vault processes or remote synchronization.
