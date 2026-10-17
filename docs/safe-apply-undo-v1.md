# Safe Apply & Undo v1

The separate [multi-file executor](multi-file-safe-apply-v1.md) now shares this
service's execution lock and blockers. The version-1 journal and single-file
protocol described here remain unchanged.

A separate, local executor can apply one checked Change Planner edit and undo it
later, including after an Obsidian restart. It supports only `add_link`,
`replace_with_embed` and a no-operation `no_change`. There is no Companion connection,
new provider call, background application, new setting or manifest/release change.

## Use it

1. Discover → Potential duplicates → Inspect structure → Analyze relationship.
   The existing model request still has its own privacy/cost consent.
2. Prepare change: select the source and exact plain paragraph; confirm its range
   and build the local plan as before.
3. Close **both selected notes in all editor leaves**, including popouts. The pair
   inspector's source previews can stay open. v1 compares public editor buffers but
   refuses even a matching open buffer: public Obsidian APIs cannot lock a queued
   editor save. It never forces saves, closes editors, or discards their contents.
4. **Check and apply / Проверить и применить** rereads both saved sources and
   reuses the planner's structural checks. Inspect the complete before/after and diff
   in the separate window, then choose **Apply this change / Применить это изменение**.
   Opening that review performs no Markdown or journal write.
5. After success choose **Undo / Откатить**, or reopen **Tools → Operation history**
   (also available in Pair Inspector and the command palette). Undo has its own
   fresh review and final confirmation. Close the source's editors before undo.

Planning stays read-only. Semantic preservation is the user's responsibility:
structural validation and exact quotations cannot prove that replacing the paragraph
preserves every idea. The existing embed limitations still apply: plain whole
paragraphs only, no protected markup, unique/context claims, existing target
connections, direct cycles, or target transclusions with unreviewed dependencies.
The program does not silently widen the selected range or scan unrelated notes.

## Ownership and validation

`SafeApplyService` is one plugin-wide owner, shared by every inspector/history window.
It accepts no provider/Companion port. `obsidianSafeApplyPort` uses only public
`Vault`, `MetadataCache`, workspace leaves and `MarkdownView` APIs. The existing
`readSavedNote`, `readPlannerPair`, `buildChangePlan`, and `proposalDiff` are reused;
`planDiffView` extracts the existing paginated literal-text diff renderer.

Before review, on final confirmation, and again after persisting the backup:

- Reread the exact source and target paths with `Vault.read`, compare complete
  content, runtime `TFile` identity, mtime and size to the originating analysis.
- Rebuild the same operation/range through the existing planner; compare the edit,
  full before/after, preserved references and destination. Resolve the full path
  with native `getFirstLinkpathDest`, preserving homonymous files and Cyrillic.
- Check both metadata snapshots and source editor leaves. Closing or invalidating
  the originating inspector, its analysis/settings, or selected plan cancels consent.
- Immediately inside `Vault.process`, check the exact current `before` again,
  source and target identity/stats, current metadata, destination resolution,
  editors and consent. A mismatch throws before returning replacement text.

`Vault.process` provides Obsidian's atomic read/modify/write boundary for one note;
there is no unconditional `Vault.modify`, adapter Markdown write, or retry. See
[the official Vault guidance](https://docs.obsidian.md/Plugins/Vault).
MetadataCache has no public revision receipt tied to saved bytes; known structural
checks remain conservative and do not establish complete dependency coverage.

Confirmations are single-use in memory. A plugin-wide busy guard prevents racing
windows. The operation ID is SHA-256 of the exact operation, paths, identities,
range, before/after and target hash (excluding creation time). Its directory is a
persistent reservation: a registered plan cannot be replayed, including a prepared
but uncompleted attempt. v1 deliberately does not resume/retry these attempts.

## Journal protocol

Storage: `<vault.configDir>/plugins/<plugin-id>/consolidation-operations/<id>/`.
No backup Markdown files appear among notes; there is no separate settings store.
Nothing in this directory is sent to a provider. These local copies contain the
source's full saved text; they are not encrypted and inherit the vault's storage,
backup and synchronization policies. v1 never deletes or overwrites recovery data.

1. Construct and strictly validate `record.json`: version 1, state `prepared`, ID,
   time, supported action, exact source/target paths, creation/modified timestamps,
   source `before` and expected `after`, SHA-256 hashes (including target content),
   confirmed paragraph and exact inserted/removed text. No target content, model
   response/prompt, API key or full analysis is persisted. Paths must be canonical
   vault-relative Markdown outside hidden/service directories. Bounds, operation
   syntax, hashes, ID and the exact single splice are revalidated on every load.
2. Reserve a new directory, write `record.json`, await completion and read back
   exact bytes. Create `backup.json` through create-only `DataAdapter.copy`; await
   and verify its bytes too. Any failure prevents starting the note write.
3. Revalidate the sources and execute the guarded `Vault.process` once.
4. Read back the resulting saved source; only exact `after` with the same `TFile`
   permits an immutable `applied.json` marker, then verify its exact bytes. Markers
   contain the operation ID, stage and SHA-256 of the complete record.
5. Undo similarly writes/verifies `undo_pending.json` **before** guarded
   `after` → `before` processing, verifies the saved result, then writes/verifies
   `undone.json`. Existing identical markers are read/verified, never overwritten.

A backup error can leave a partial directory. A marker error can occur after the
Markdown change has succeeded. Neither is reported as a successful transaction or
authorizes an automatic retry. History derives actual state from the immutable
record, stage markers, file creation time, exact path and complete saved contents.
Malformed/oversized records, mismatching copies, checksums or partial markers are
conflicts; bytes are retained. A valid surviving copy is viewable but cannot
implicitly authorize undo. Damaged entries now have structured diagnostics and local/global blocking. A separate
conservative acknowledgement can resolve eligible incidents without repairing or
removing evidence; see [Journal Recovery v1](journal-recovery-v1.md).

**Durability boundary:** public DataAdapter has no `fsync`/directory-sync or
multi-file transaction API. v1 awaits and verifies both recovery copies before
writing notes, and tests real process termination at critical points. This covers
acknowledged application writes and process restart, not guaranteed persistence
through power loss, storage-controller failure, or concurrent independent Obsidian
processes/remote sync editing the same vault. The two copies live on the same
storage and are not an independent disaster backup.

## Crash reconciliation

Reconciliation runs only on an explicit history refresh or operation review; it
reads recorded source paths, not every note, and **never writes Markdown**. It
shows the effective state without rewriting old evidence or claiming an atomic
transaction. Identity mismatch, missing source, damaged journal, or text matching
neither expected version always yields `conflict`.

| Last durable evidence | Saved source | Effective state / next action |
| --- | --- | --- |
| Partial record or second copy | Any | Conflict; no automatic write, show valid surviving copy if available. |
| Complete prepared copies, no applied marker | `before` | Prepared; no write occurred or was confirmed; reservation prevents reapplication. |
| Complete prepared copies, no applied marker | `after` | Applied, recovered; never reapply. Fresh confirmed undo is possible. |
| Applied marker | `after` | Applied; fresh confirmed undo is possible. |
| Applied marker, no undo intent | `before` | Conflict; an external restoration cannot be asserted to be our undo. |
| Undo-pending marker | `after` | Applied, recovered; original undo did not complete. A newly reviewed undo may be requested. |
| Undo-pending marker | `before` | Undone, recovered; no second undo, even if the final marker is missing. |
| Undone marker | `before` | Undone. |
| Undone marker | `after` or other content | Conflict; no old operation may overwrite later changes. |

Closing a window before the process callback revokes consent. Once a write is
issued, the shared executor finishes its read-back/journal bookkeeping even after
that window closes; no late UI is published. Plugin disposal invalidates pending
consents. A process interruption can leave prepared or undo-pending evidence, handled
by the table above on the next explicit review.

## Undo and later edits

Undo requires an intact record and exact saved `after`, original source path and
creation time; in-session file identity/stats and closed editors are checked again
inside `Vault.process`. It restores the complete `before` only in that exact case.
Deleted/moved/recreated sources, user edits, later operations, or unknown states
block automatic undo. v1 does **not** attempt a reverse splice or three-way merge.
The complete original and expected result remain available as literal text and a
diff for manual resolution. There is no automatic recovery write at startup.

History is a point-in-time observation. Refresh after editing; every Undo click
rereads/rechecks regardless of what the previous history row showed. Restart identity
uses public path/creation-time plus complete content, not an inode/OS identity API.

## Tests and scope

Controlled adapter/process failures cover partial backup, copy/read-back failure,
prepared-before-write interruption, after-write-before-marker interruption, partial
Markdown failures, undo interruptions on both sides of the write, corrupt journal,
replay, simultaneous modals, stale files/metadata/settings, target rename/deletion,
editor conflicts, late callbacks and closing. Existing Tools, Pair Inspector,
Relationship Analyzer, Tag Taxonomy/Recommendations, Decisions, Health and Companion
Proposals remain covered by the full suite. No real paid LLM requests are made.

[Native acceptance and screenshots](safe-apply-native.md) document actual process
restarts and disk writes in an isolated synthetic Obsidian vault.

Deferred: multi-file transactions, merge/delete/archive, atoms, tags, backlink
rewrites, background applies, journal pruning, resuming reserved prepared attempts,
addressed conflict undo and three-way conflict merging. No UI pretends these are ready.
