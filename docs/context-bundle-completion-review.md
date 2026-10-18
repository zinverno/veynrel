# Bundle completion, reservations and Undo — PR #95 review fix

The original `1625633` policy reserved both paths after every successful Bundle Apply until Undo. A later user edit correctly revoked Undo but left no way to continue with a fresh plan. This was an availability defect, not demonstrated data loss.

The fix changes only how `BundleApply.inspect()` derives `blocking`. It computes completion from the validated journal before live source reads, independently of `state` and `canUndo`. The shared execution lock, writer callback, exact-before comparison, identity/mtime rules, consent tickets, journal formats and Archive Eligibility are unchanged.

| Evidence | Reserves paths? | Undo |
| --- | --- | --- |
| Intact copies + applied receipt, no undo-intent | No | Requires unchanged exact sources and all existing checks |
| Same completed record after canonical or secondary edit | No | Refused; fresh independent operations may proceed |
| Completed Undo receipt | No | Cannot repeat Undo |
| Prepared record, no applied receipt | Yes | No automatic resumption |
| Actual after, applied receipt missing | Yes | Only a separately checked explicit recovery Undo |
| Missing/damaged copies or conflicting receipts | Yes | Unsafe automatic actions refused |
| Undo intent without completed undone receipt | Yes | Existing recovery rules apply; actual before alone does not release |
| Unknown damage scope | Globally | Manual evidence review |

This matches the terminal-receipt policy already used by MergeApply. ArchiveApply intentionally reserves an active archive until its complete Apply/Undo chain can prove the narrow secondary-mtime exception needed by parent Merge Undo. A Bundle has no such provenance relationship or exception. Later operations invalidate its Undo via exact actual sources; releasing a completed reservation does not authorize stale Undo or permit changes to journal evidence. No additional acknowledgement action or journal mutation is needed.

## Reproduction and automated regression

New tests first ran against the old implementation: seven assertions failed because completed rows remained blocking, including canonical/secondary edits and a stale guard early return. After the fix, the targeted Bundle/Merge/Archive suite passed 165 tests.

Regression cases cover:

- Completed Bundle → manual canonical edit / secondary edit / no edit → fresh Single-file and Multi-file review; real fixture Single-file Apply preserves current content.
- Old Single-file consent from before Bundle Apply and old Bundle Undo consent cannot overwrite later content. Fresh old Bundle Undo review also refuses after the subsequent operation.
- Completed Bundle record and receipts remain byte-for-byte unchanged; repeat preparation of the stable ID returns `used`; the old Apply ticket cannot repeat; Archive Eligibility rejects the Bundle ID.
- Prepared, missing applied, either damaged copy, conflicting receipts, pending Undo and reverse-write-without-undone remain blocking. Unknown journal structure still blocks globally.
- A guard failing during inspection cannot turn a completed operation back into a reservation; completed Undo remains terminal after subsequent edits.

Full unit/typecheck/lint/build/audit/diff results are in [validation](context-bundle-completion-evidence/validation.json). GitHub PR check runs remain authoritative for the final head; the local record does not predict CI.

## Targeted native acceptance

**PASS: 41 assertions** (18 existing Inspector baseline + 23 targeted), **6 screenshots**, on Obsidian 1.13.7 / Electron 43.6.0, in fresh synthetic `/tmp/pair-inspector-bundle-completion-2/vault`. Artifact SHA-256: `ecaaac3eeb6be4ca3dd6aa269fcf361f6af9c6021eb2b2a3b79111f59b09db50`.

Each of the three scenarios first executes Bundle Apply through separate native consent and real `Vault.process`. The harness then edits canonical, edits secondary, or leaves both unchanged, kills/restarts its owned Obsidian process, builds a new Single-file plan using fresh native sources and scripted current-source analysis, and obtains independent consent before its real Apply. Both notes are compared as Buffers; the new operation preserves all current user text. Old Bundle Undo is refused after later edits/writes, including an existing unused Undo ticket in the unchanged-source scenario. Bundle journal hashes remain unchanged across edits, restart, review, subsequent Apply and rejected Undo/replay/archive requests.

Evidence: [report](context-bundle-completion-evidence/native-report.json), [exact scenario before/after and journal hashes](context-bundle-completion-evidence/bundle-completion-cases.json), [source/artifact hashes](context-bundle-completion-evidence/sha256.json), [canonical edit → new review](context-bundle-completion-evidence/bundle-completed-canonical-review.png), [secondary edit → history](context-bundle-completion-evidence/bundle-completed-secondary-history.png).

Reproduce after `npm run build`:

```sh
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-bundle-completion-FRESH --bundle-apply --bundle-completion
```

The first targeted harness invocation used a top-level `await` expression unsupported by its CDP evaluation mode. It failed in the harness after Apply; the preserved [failure report](context-bundle-completion-evidence/harness-async-failure.json) is not counted as acceptance. The harness was corrected to await an async function, then the complete targeted matrix ran in a new vault.

This fix does not rerun or replace the [original full visual and SIGKILL matrix](context-bundle-apply-native.md); its changed policy is covered by targeted native plus full automated regressions. No paid models, personal vaults, physical-mobile, independent-process or power-loss claims are added. Versions, settings and releases are unchanged.
