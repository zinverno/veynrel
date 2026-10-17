# Multi-file Safe Apply & Undo native acceptance

**PASS**, 2026-10-17, new isolated synthetic vaults and profiles. Obsidian
**1.13.7-2**, Electron **43.6.0**, Linux desktop. PR #86 was verified merged at
`9688b80498cc1840022d3523bd779aa7dcbee766` before branching from current `main`.
No personal vault, real credentials or paid provider calls were used.

## Reproduction and evidence

Use a fresh temporary directory per run, one desktop harness at a time (CDP 9274):

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-multi-apply-NEW --multi-safe-apply
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-multi-lock-NEW --multi-safe-apply --multi-concurrency-only
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-multi-legacy-NEW --journal-recovery
```

The harness owns its Obsidian process and generated vault. It injects a fake
Relationship Analyzer response, uses the real planner and final consent UI, actual
`Vault.process` and DataAdapter, and kills/restarts only its own process. Do not run
these fault injections against a personal vault. History is checked before any
explicit recovery action; saved bytes must remain unchanged across restart.

| Completed run | Passed assertions | Evidence |
| --- | --- | --- |
| Full shared-write/recovery protocol | **53**: Pair Inspector 18 + multi-file 35 | [Report](multi-file-safe-apply-evidence/protocol-report.json) |
| Additional shared-lock/global-blocker run | **27**: Pair Inspector 18 + multi-file 9 | [Report](multi-file-safe-apply-evidence/concurrency-report.json) |
| Existing single-file/recovery regression | **75**: Pair Inspector 18 + Safe Apply 25 + Journal Recovery 25 + Undo blockers 7 | [Report](multi-file-safe-apply-evidence/legacy-report.json) |

These counts include repeated matrix and overlapping assertions, not distinct
features. The full protocol PASS preceded addition of the concurrent-window checks;
the final targeted run completed those checks separately. No combined final-harness
full-run PASS is claimed. All three runs used the **same production artifacts**,
byte-compared against the final build and each installed synthetic plugin:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `606def83f6754d0bbb21f77818ec4f6dc9e3f5ccba8f6a27f740d54229c74513` |
| `styles.css`, unchanged | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json`, unchanged | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

[Checksums for retained evidence](multi-file-safe-apply-evidence/sha256.json).

## Observed native outcomes

| Case | Observation |
| --- | --- |
| Two homonymous notes, Cyrillic/spaces | Real resolver selects both exact paths; keyboard Enter confirms one operation with two complete diffs. Both saved sources equal the planned results. |
| RU/EN × light/dark × 1200/390 px | Final consent is translated, literal text fits without horizontal overflow, no HTML/embeds execute. |
| Own first-write events | Source inspector invalidates, but the executor completes the second guarded write; fake completion count is unchanged. |
| Restart after full Apply | One logical applied history row; explicit full Undo restores both originals, without a repeat action. |
| Two consent windows + single-file ticket | Holding the first native process dispatch blocks the second window and single-file Apply with `busy`; releasing produces exactly one shared record and two expected changes. |
| Later edit to B after partial A | Compensation unavailable; user text preserved, both verified before/after backups remain visible. |
| Open Markdown editor | Final review refuses before any journal preparation or Markdown change. |
| Old and new families | Real legacy Apply succeeds on independent files and appears alongside the shared operation in existing history. |
| Both shared backups corrupted | Global conflict remains visible; both executor families refuse new writes. |

Nine controlled **real SIGKILL** points were completed:

| Stop point | State after restart | Explicit follow-up |
| --- | --- | --- |
| First complete backup, before its acknowledgement | Conflict: second copy missing | No automatic action |
| Both backups saved, before acknowledgement | Prepared | No automatic replay |
| Immediately before A | Prepared | No automatic replay |
| A saved, before progress marker | Partial | Compensation restores A; B remains original |
| Before B dispatch | Partial | Compensation restores A |
| B saved, before progress/general success | Applied, recovered from both texts | Full Undo restores B then A |
| During partial general success marker | Applied, torn marker retained | Full Undo with a new intent |
| B restored during Undo, before progress marker | Partially undone | Separate confirmation finishes A |
| A restored during compensation, before progress marker | Undone, recovered from originals and intent | No repeated reverse write |

The old native suite also passed its real editor-buffer checks, legacy resolution
SIGKILL points, target-only Undo blocker introduced after preview, independent Undo,
and global damage introduced during Undo-intent IO. Its detailed report is retained.

## Failures diagnosed during development

The first write run saved A and safely stopped before B. The
[captured native observation](multi-file-safe-apply-evidence/initial-cache-observation.json)
showed both file identities, saved contents, ctimes and resolver results matching,
but A's MetadataCache was temporarily absent immediately after `Vault.process`.
The product now waits up to 1500 ms **only for its own written participants**, checking
both full sources and pinned identities on every read. Missing metadata of an
unchanged source still refuses. Unit regressions cover eviction, delayed recovery,
and a real source change during the wait. The complete protocol rerun passed.

Harness-only corrections: full-backup assertions now select the source `<pre>`
elements rather than also counting diff lines; restart handles a repeated native
trust dialog only after verifying this exact synthetic vault; the second-window
helper waits for the newly opened modal's confirmation and the service becoming
idle, not the first modal's already visible button. The latter incomplete run is
[retained](multi-file-safe-apply-evidence/incomplete-second-window.json).

An additional expanded run stopped because the restarted native main window did
not acquire focus, before completing all scenarios. It is
[incomplete, not PASS](multi-file-safe-apply-evidence/incomplete-focus.json).
Increasing the focus wait did not establish a compositor-level cause; the real
focus assertion remains. The separate lock-only run needs no process restart to
test exclusion and restores its own synthetic fault hook in place. The full
protocol run above already exercised the real restart/SIGKILL paths successfully.

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Consent](multi-file-safe-apply-evidence/multi-apply-en-theme-light-1200.png) | [Consent](multi-file-safe-apply-evidence/multi-apply-en-theme-light-390.png) | [Consent](multi-file-safe-apply-evidence/multi-apply-en-theme-dark-1200.png) | [Consent](multi-file-safe-apply-evidence/multi-apply-en-theme-dark-390.png) |
| RU | [Подтверждение](multi-file-safe-apply-evidence/multi-apply-ru-theme-light-1200.png) | [Подтверждение](multi-file-safe-apply-evidence/multi-apply-ru-theme-light-390.png) | [Подтверждение](multi-file-safe-apply-evidence/multi-apply-ru-theme-dark-1200.png) | [Подтверждение](multi-file-safe-apply-evidence/multi-apply-ru-theme-dark-390.png) |

- [Missing backup](multi-file-safe-apply-evidence/multi-recovery-first-backup.png),
  [prepared](multi-file-safe-apply-evidence/multi-recovery-both-backups.png).
- [Partial Apply](multi-file-safe-apply-evidence/multi-recovery-after-a.png),
  [recovered Apply](multi-file-safe-apply-evidence/multi-recovery-after-b.png),
  [torn success marker](multi-file-safe-apply-evidence/multi-recovery-torn-success.png).
- [Partial Undo](multi-file-safe-apply-evidence/multi-recovery-undo-b.png),
  [recovered compensation](multi-file-safe-apply-evidence/multi-recovery-compensate-a.png),
  [later user edit conflict](multi-file-safe-apply-evidence/multi-user-conflict.png).

## Automated checks and limits

`npm test`: **3400 tests / 132 files**, including 46 new executor/journal fault tests
and four UI tests. Typecheck, lint, build, `audit:proposals` (**5/5 mutations killed**)
and `git diff --check` passed. Lint retains the pre-existing streaming-fetch warning
at `api.ts:404`; zero errors. Fault tests additionally cover partial/failed backup
writes, CAS races, A/B write failures, interrupted reversal, old/new local/global
blockers, plugin disposal, and both directions of single/multi executor exclusion.

Native network observation covers fetch/XHR and fake completion counts, not every
possible transport. Unit tests also verify no `requestUrl` calls. The report's final
process counter describes that process; earlier phases assert their own boundaries.

No physical mobile, other OS, screen reader, custom editor/theme, independent
concurrent vault process, physical power failure or real-model quality test was run.
DataAdapter has no public `fsync`; process-SIGKILL acceptance is not a durability
guarantee against power loss. There is no ACID, atomicity or exactly-once claim.
Unused prepared and damaged v2 reservations remain conservative blockers; manual
release/repair is deferred, with evidence preserved. See the
[protocol and limitations](multi-file-safe-apply-v1.md).
