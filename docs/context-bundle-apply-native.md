# Context Bundle Apply — native acceptance

This is the original matrix at PR #95 HEAD `1625633`, before the completion-reservation review fix. See the [targeted completion-policy regression report](context-bundle-completion-review.md) for the updated behavior and build. The original reports, screenshots and hash manifest remain historical evidence at that head.

PASS on Linux desktop, Obsidian **1.13.7**, Electron **43.6.0**. The successful run used a new synthetic vault at `/tmp/pair-inspector-bundle-apply-5/vault`; the runner controls only its own Electron process. **109 assertions**: 18 baseline Inspector checks plus 91 bundle checks. **52 feature screenshots** are retained. Production artifact SHA-256: `63e5ad7a891a9e778df7ee3100ae687d4941655b2bd9cdaa0a0bd54340cd1fe3`.

Evidence: [native report](context-bundle-apply-evidence/native-report.json), [byte restoration](context-bundle-apply-evidence/byte-restoration.json), [artifact/source manifest](context-bundle-apply-evidence/sha256.json). Exact full plans, including all sources, before/after, ranges and analysis controls, are included as six `success-*-plan.json` files. All text is synthetic. No personal vault or paid model was used.

## Frozen cases and full cycles

The original PR #92 corpus is unchanged: SHA-256 `dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8`. EN runs use its literal notes and control responses. RU runs use explicitly derived CRLF variants, swap A/B, and swap quote sides/kinds in the scripted response; source quotes receive the same newline conversion. The frozen corpus and gold labels were not edited.

| Case | Bundle | Canonical / newline variants | Verified cycle |
| --- | --- | --- | --- |
| 07 | code + explanation | A / LF, B / CRLF | UI plan → independent consent → real Vault.process → SIGKILL/restart → separate Undo consent → original bytes |
| 08 | list + context | A / LF, B / CRLF | Same; Cyrillic and ordered list preserved |
| 09 | quotation + attribution | A / LF, B / CRLF | Same; quotation, attribution and status preserved together |
| 05, 19 | headings / unresolved evidence | Frozen source | No bundle plan or Apply route |
| 22 | rich structural markup/dependencies | Frozen source | No bundle plan or Apply route |
| 23 | adjacent prose without a supported core | Frozen source | No bundle plan or Apply route |

The six completed cycles compare both files as Buffers. The executor's native process instrumentation observes canonical only. A whole-vault Markdown snapshot excludes only the expected canonical change and compares every other note; secondary also retains its original birthtime/mtime/size. The final restoration report independently hashes the original and restored bytes. This is operation acceptance, not a new model-quality benchmark or proof of semantic completeness. The original four ordinary MergePlan cases and read-only GroupPlan contract remain covered by the unchanged regression suite.

## UI and refusal coverage

Each of cases 07–09 was reviewed in RU and EN, light and dark themes, at desktop widths 1200 and 390 px. Assertions check full literal before/after and secondary, exact insertion JSON, diff, no unexpanded translation keys, no horizontal overflow, and no rendered source HTML/embeds. Final consent was activated with keyboard Enter. Separate Undo previews reverse canonical and show secondary unchanged. Screenshots include full-preview entry points, diffs, confirmation controls, recovered/damaged history and refusal states.

Representative images: [RU list, dark 390](context-bundle-apply-evidence/bundle-apply-ru-08-theme-dark-390.png), [EN code, light 1200](context-bundle-apply-evidence/bundle-apply-en-07-theme-light-1200.png), [quotation diff](context-bundle-apply-evidence/bundle-apply-diff-en-09.png), [popout refusal](context-bundle-apply-evidence/bundle-editor-true-1.png), [damaged applied marker](context-bundle-apply-evidence/bundle-recovery-torn-applied.png).

Both main-window and real popout editors were tested for both participants. Consent was refused without forcing a save. Two confirmation windows competed while the first writer was held; only one entered the executor. Prepared Single-file and Multi-file Apply tickets were rejected as busy during a bundle write. Every old Undo entrypoint and resolution were also rejected as busy. Global incidents in all five journal families were injected after review and blocked writes. Later user edits to either source blocked Undo, while original recovery text remained visible. Backup-copy failure caused no Markdown process call.

## Real interruption matrix

Each boundary used an awaited hook followed by **SIGKILL of the owned Obsidian process**, then a fresh application process. Both participants and all journal file hashes were compared across restart before any explicit user action. Startup and history did not repair markers or rewrite Markdown.

| SIGKILL point | Actual state | Result |
| --- | --- | --- |
| Before backup preparation | Original notes; no entry | PASS |
| After record copy | Original notes; damaged prepared entry | PASS; no Undo |
| After backup copy | Original notes; prepared | PASS |
| Immediately before writer | Original notes; prepared | PASS |
| After writer, before applied | Canonical after; recovered applied | PASS; explicit Undo restores exact originals |
| During applied marker | Canonical after; damaged evidence | PASS; automatic Undo blocked |
| After undo-intent | Canonical after; recovered applied | PASS; fresh explicit Undo restores originals |
| After reverse write | Canonical before; recovered undone | PASS; no automatic marker completion |
| During undone marker | Canonical before; damaged evidence | PASS; no repeated Undo |

Incomplete Undo evidence retains its path reservation even when the actual original text has already been restored. The application offers manual evidence review, not an automatic repair button. Secondary remains unchanged through every successful, failed and interrupted operation.

## Defects discovered and corrected

The first native runs correctly refused Undo after restart, exposing an overly strict persisted-cache comparison in the new port. Obsidian adds private top-level `v: 1` to restored cache objects and changes list-item object key order (`position,parent` to `parent,position`). The fix compares public persisted metadata by key/value with array order intact, ignoring only top-level private `v`. Exact source/stat checks and current-session pinned guards were retained. Both observations and failed reports are preserved under `initial-private-cache-version-*` and `persisted-list-key-order-*`; they are not reported as successful runs.

A later harness run converted note newlines to CRLF but left a multiline control quote in LF. Relationship Analyzer correctly rejected the quote. The harness now converts its scripted quotes too; the frozen fixture remains untouched. That failed report is `harness-crlf-control-quotes-failure.json`.

Code review also found an asynchronous Undo state read after the last journal blocker check, and a missing final guard against in-place analysis mutation. The new executor now orders final state inspection → all blockers → own intact record/receipt check → synchronous guards → writer. Fault tests inject own-copy corruption, foreign journal corruption, an unexpected valid undone receipt, and changed analysis at these boundaries.

## Verification and limits

Unit/fault tests cover all three kinds, both canonical sides, LF/CRLF/Unicode, strict discriminator/hash validation, incompatible old validators, stale file identity/stat/text/cache/resolver/dependencies, callback races, secondary changes after a writer, exact-copy preparation, later user edits, single-use tickets, cancel/close/late modal results, all interruption states, damaged backups, cross-executor locks and local/global journal blockers. Archive integration verifies that new local bundle evidence blocks old Archive Apply and Merge Undo without changing their journals. Archive Eligibility rejects bundle operation IDs.

`npm test` (3,820 tests / 147 files), typecheck, lint, production build, `audit:proposals` (5/5) and `git diff --check` are recorded in [validation](context-bundle-apply-evidence/validation.json). The PR check runs are authoritative for GitHub CI at its exact head; the local evidence file does not predict their outcome. The first local proposal-audit invocation received empty child stdout and failed its output assertion; an unchanged rerun passed all five mutation checks. No audit assertion was weakened.

No real model or provider-quality evaluation was run. Network counters cover fetch/XHR in the current process; scripted Analyzer completion replaces provider calls, and no paid keys are configured. 390 px is desktop viewport acceptance, not physical mobile. This does not test macOS/Windows, power loss, filesystem atomicity, fsync, screen readers, custom editors/themes or protection from independent vault writers. There is no ACID or general semantic-completeness claim.
