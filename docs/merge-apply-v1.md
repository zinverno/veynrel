# Merge Apply v1: safe copy-only consolidation

After a completed operation, [Archive Eligibility & Planner](archive-planner-v1.md)
offers a separate read-only preservation review. Successful copying alone is
never archive eligibility; no archive mark is applied by either flow.

Merge Apply executes the checked MergePlan introduced in PR #88. It copies the
user-selected complete plain paragraphs into one canonical Markdown note. The
secondary source is never dispatched to a writer. Duplicates remain there, and a
successful copy says nothing about whether that note can be archived.

The planner, model-request consent, Merge Apply consent and Undo consent are
separate. The two original sources, canonical choice, exact ranges, context
confirmation and insertion anchor remain user decisions. The final **Check and
apply merge** window displays the full canonical before/after, literal diff,
copied paragraphs, full unchanged secondary and semantic limitations. Only that
window offers **Apply merge**. Closing it revokes its single-use ticket.

## Checks and execution

`obsidianMergeApply.ts` reads both complete saved sources through the existing
`readPlannerPair` path. It rebuilds `MergePlan` from the original relationship
analysis and confirmed ranges, comparing the entire serialized plan, including
before/after, insertion, native metadata and resolved outgoing dependencies.
Merge planning now captures all available cached incoming paths rather than the
Pair Inspector's first 100; the ordinary inspector remains bounded.

Checks run before consent, again at execution and after preparing recovery data.
They require the same paths, live TFile identities, ctime/mtime/size, full strings,
MetadataCache and available dependencies. Synchronous guards repeat identity,
metadata, resolver, incoming and editor checks around the final asynchronous
journal reads and inside the native `Vault.process` callback. Both affected
Markdown views must be closed, including popouts; even a clean editor may have a
queued save. The callback requires exact current `before` before returning the
approved `after`.

`SafeApplyService` owns the **same execution lock** for single-file, reciprocal
multi-file and Merge Apply. Each family consults the other journals' local and
global blockers. An unfinished/damaged Merge entry blocks overlapping operations;
an unscoped or untrusted entry blocks globally. Existing single-file resolution
receipts and the v2 reciprocal-link protocol retain their existing meaning.
Merge plans are never converted into `add_link` or v2 reciprocal-link records.

Only canonical is processed. The executor rereads it and secondary after dispatch;
it records success only when canonical equals `after` and secondary still matches
the pinned identity/stat/full text. Failure causes no automatic compensation,
retry, source deletion or source rewrite. Once a write has been issued, its
bookkeeping may finish even if that write invalidates the inspector.

## Separate journal protocol

Location: `<Vault.configDir>/plugins/<plugin-id>/consolidation-merge-operations`.
Each stable SHA-256 operation ID owns an immutable directory:

- `record.json` and `backup.json`: independent complete recovery records, both
  written and read back exactly before any Markdown mutation. The first copy is
  reread after the second copy; both are strictly validated again before dispatch.
- `mark-<uuid>.json`: append-only applied, undo-intent or undone receipts, with the
  record digest and observed canonical mtime/size. Markers do not replace content
  checks or authorize a write.

The record has `version: 1`, `operation: "merge_knowledge_copy"`, a stable ID,
creation timestamp, canonical identity and exact before/after with SHA-256,
secondary identity/full source/SHA-256, ordered confirmed ranges and the confirmed
insertion anchor/edit. Its validator rejects unknown keys, unsafe/identical paths,
wrong sizes/digests/IDs, overlapping or mismatched ranges and any edit that is not
the exact literal-copy equation. The ID excludes wall-clock creation time, so the
same original plan cannot be replayed through a second confirmation or restart.
Old journals keep their own directories, parsers and operation types.

Both copies contain full note text; they stay in the vault configuration folder
for recovery/manual review and may be included in the owner's backup/sync policy.
There is no automatic journal pruning, repair, deletion or overwrite.

## Recovery and Undo

Construction/startup is passive: no journal scan, Markdown write, retry, rollback
or automatic recovery. Opening operation history explicitly reads the journals
and current sources. Canonical is classified by actual full `before` / `after`
and ctime; the secondary must still match its full source, SHA-256 and original
ctime/mtime/size. An intact record with canonical `after` can support a separately
confirmed Undo even if SIGKILL prevented the applied marker. A pending Undo with
canonical `before` is shown as restored without writing anything again.

The separate [Archive Apply protocol](archive-apply-v1.md) adds one narrowly
verified exception to the secondary mtime check after a completed Archive Undo.
Both immutable journals and all archive Apply/Undo receipts must prove the chain;
the restored secondary must match its original content/ctime/size and the exact
mtime recorded by Archive Undo. An active archive mark or incomplete archive
receipt chain blocks Merge Undo. The original Merge journal and `sameSavedNote`
checks are unchanged.

A valid applied receipt additionally rejects canonical mtime/size changes even
when text has returned to the same `after`. When a crash prevented that receipt,
only the saved ctime and exact after content/size are available across restart;
the public API cannot prove that no edit-and-restore happened in between.

Undo has a fresh preview with canonical `after → before` and the same unchanged
secondary. It rereads both notes, validates identity/stat/content/cache/dependencies
against its consent snapshot, checks every journal and both editor locations,
persists an undo-intent, repeats all checks and uses the same exact-match
`Vault.process` path on canonical only. Later user edits are never overwritten.

Corrupt/missing/disagreeing record copies, malformed markers, unknown files or
folders and conflicting receipts fail closed. A surviving valid record remains
visible with the actual canonical state and full recovery text, but **automatic
Undo is disabled**; no repair is inferred from a partial marker. All evidence is
retained for manual inspection. A normal process interruption without corrupted
evidence supports explicit Undo; a torn marker deliberately requires manual work.

## Limits

This is not ACID, filesystem atomicity, fsync or a power-loss guarantee. The shared
lock coordinates this plugin instance and its windows; it is not a lock against
another Obsidian process, sync client, filesystem writer or plugin. Public native
metadata/events can lag. Exact callback comparison protects canonical, but there
is no atomic transaction spanning a secondary read and canonical write. External
changes detected after dispatch leave recovery data and refuse a success result.

Metadata and model evidence cannot certify semantic completeness, context,
attribution or an archive decision. v1 rejects protected/dependent source blocks
and contradictions under the existing MergePlan contract. It does not implement
archiving, deletion, atomization, tag edits, backlink rewrites, dependent block
moves or automatic contradiction resolution. No version, settings or release
changes are part of this feature.

See [native acceptance](merge-apply-native.md) for observed crash points, platform
coverage, screenshots, test results and remaining limits.
