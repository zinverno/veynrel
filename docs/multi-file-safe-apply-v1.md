# Multi-file Safe Apply & Undo v1

One confirmed `add_reciprocal_links` plan now has one operation ID, shared backups,
participant progress and a separate final write consent. Only two existing Markdown
files and one ordinary link insertion per file are supported. No merge, atomization,
file creation/deletion/archive, tag editing, provider calls or new settings.

## Open and confirm

Discover → Potential duplicates → Inspect structure → Analyze relationship →
Prepare change → Link both notes. Choose and confirm each paragraph, then build the
combined plan. **Check and apply both changes** opens a separate consent modal with
both paths, dependencies, complete before/after and two literal-text diffs. Only
**Apply both changes** dispatches writes. This consent is independent of the LLM
request consent. Editors for **both** participants must be closed, even if their
public buffer matches disk; no forced save or buffer flush is attempted.

The preview warns that a crash may leave only one note changed. Closing before the
first dispatch cancels consent; closing after dispatch does not cancel journal
bookkeeping or the second checked write. Own Vault/MetadataCache events invalidate
the source inspector but do not revoke an already-started operation. Plugin disposal
still stops subsequent writes; persisted evidence supports later explicit recovery.

Operation History shows one logical row, both participant states, the saved backups,
two diffs, and either a reviewed full Undo, compensation or continuation of interrupted
Undo. Opening/refreshing history does not write Markdown or repair journal markers.

## Shared owner and compatibility

`SafeApplyService` remains the plugin-wide execution owner. `MultiFileApply` receives
its `exclusive` callback; it has **no second execution busy flag**. Single-file Apply,
Undo, resolution, shared Apply/Undo/compensation and history use the same exclusion.
Two consent windows may exist, but only one executor can run. Tickets are private,
single-use objects; public previews are copies. Source identity is rechecked on use.

The original version-1 `OperationJournal` and its record/backup/marker/resolution
formats are unchanged. Its root stays `consolidation-operations`. Version 2 uses the
sibling `consolidation-multi-operations`, under the configured plugin directory,
so the old reader never misclassifies the new protocol. Both families appear through
existing Operation History, and **both contribute blockers to both executors**.
Existing Companion Proposals, model settings and published versions are unchanged.

Damaged copies with a verified record limit the block to its two paths; unknown
scope, unreadable structure or contradictory copies block globally. Valid unresolved
prepared/partial operations block their participants. An acknowledged terminal
operation does not block future unrelated work merely because its source was later
edited; its own automatic Undo remains unavailable. Legacy confirmed resolutions
retain their existing policy. The currently executing shared record is excluded
from its own blocker check only after both copies pass validation again.

## Version-2 durable protocol

A deterministic SHA-256 ID binds the operation, ordered participants, original file
ctime/mtime/byte size, full before/after, hashes, selected ranges and exact link
splices. Creation time is recorded but excluded from the deterministic ID. Each
`record.json` and `backup.json` independently contains **both** complete participants.
No runtime `TFile`, model payload, response, API key or unrelated note text is stored.
The schema accepts only `add_reciprocal_links`, two unique canonical paths and exactly
one structurally constrained insertion per file. Paths, byte sizes, SHA-256, range,
splice, final content and record ID are validated on every journal read.

The protocol is sequential, not an atomic transaction:

1. Reread both files and native metadata; rebuild the original plan with existing
   `buildMultiFilePlan`/`buildChangePlan`. Check runtime identity, ctime/mtime/size,
   full contents, exact range, existing connections, both public resolver results,
   originating analysis/settings, closed editors and both journal families' blockers.
2. Reserve the stable ID by creating its operation directory. Never overwrite or
   retry an existing ID, even after Undo or an incomplete preparation.
3. Write `record.json`; reread exact bytes. Copy it to `backup.json`; reread exact
   bytes. Reread the first copy too. No Markdown dispatch is allowed before this.
4. Rebuild/recheck after journal IO, validate both copies and blockers again.
5. `Vault.process(A)` checks exact `before` **inside its callback**, plus live
   identity/editor/resolver guards. Reread A, verify exact `after`, record `apply_a`.
6. Reread **both** sources and guards. A must still equal its verified post-write
   snapshot; B must equal the reviewed original snapshot, metadata and paragraph.
   Repeat blockers. Then conditionally process B and record `apply_b`.
7. Reread and verify both `after` states and blockers. Only then write `applied`.

Markers are append-only `mark-<UUID>.json` attempts, bound to the SHA-256 of the
complete record. Their schema contains version, operation ID, unique attempt, kind
and record hash. Every write requires exact read-back. Recognized torn marker files
are retained and warned about, not treated as successful events. A new separately
confirmed reversal can use a new UUID without deleting the torn attempt. Unknown
files/directories are never followed and cause a conservative structural block.

Obsidian temporarily evicts a note's MetadataCache after `Vault.process`. Before a
subsequent write the port may wait **at most 1500 ms**, in 25 ms intervals, only for
participants written by this invocation. Every read-only interval rechecks both
full saved texts and identities. An unchanged participant's missing/changed metadata
refuses immediately. Own late cache eviction is not an editor/source-change waiver:
all pinned file stats, exact contents and resolver targets remain guarded. No
Markdown or provider request is retried by this wait. MetadataCache still has no
public content revision receipt; complete external dependency coverage is not claimed.

## Read-only recovery and interruption points

Recovery derives participant facts from exact full text and original path/ctime.
It does not infer "no write" from an absent marker and never reapplies B on startup.
Runtime identity and current stats are pinned anew for any subsequent explicit action.

| Interruption | History after restart / allowed next step |
| --- | --- |
| First copy incomplete or absent | No authorized Markdown write could start. Unknown record scope blocks globally; a valid surviving copy narrows the block. No automatic action. |
| First complete copy, missing second | Both originals may be visible from the valid copy, but journal damage blocks automatic compensation/Undo. |
| Both copies verified, before A | Both files `before`: prepared, no automatic replay and no reuse of the reserved ID. |
| A saved, before `apply_a` or before B | A=`after`, B=`before`: partial; separately reviewed compensation may restore A. |
| B saved, before `apply_b`/`applied` or during a torn success marker | Both=`after`: recovered applied state; reviewed full Undo is available. The missing/torn event is not fabricated. |
| Before an Undo/compensation intent is acknowledged | No reverse write starts. An incomplete attempt remains visible; another review can create a new attempt. |
| B restored during full Undo, before A | A=`after`, B=`before`, valid reversal intent: partially undone; a separate review can finish A. |
| A restored during compensation or final Undo, before completion marker | Both=`before` with a validated reversal intent: recovered undone; no repeat reversal. |
| Any participant differs from both known versions, is missing/moved or has unverified identity | Conflict. Preserve notes, backups and markers; no automatic repair. |

Valid progress markers also prevent treating later edits as unfinished work: if a
participant was acknowledged restored and is changed back to `after`, history
refuses another automatic reversal. A completed success followed by B being edited
to `before` is a conflict, not a newly compensatable failed Apply.

## Compensation and full Undo

For a partial Apply, **Safely reverse partial change** is a separate preview and
confirmation. It requires A exactly `after`, B exactly `before`, original identities,
closed editors, intact shared backups and no applicable blocker. It restores only A
with `Vault.process`, preserving B byte-for-byte. Any later user change to **either**
participant refuses compensation.

Full Undo requires both exact `after` states and reverses in order **B, then A**.
Before the first reverse write, persist/read back `undo_intent` (or
`compensate_intent`). Recheck sources, editors and blockers after this IO and before
each reverse callback. Record `undo_b`/`undo_a` only after verification, then `undone`
only after both sources equal their originals. An interrupted reverse operation is
never continued automatically. A fresh preview/confirmation is required to finish
its remaining checked splice. Duplicate tickets and completed Undo are rejected.

No three-way merge or address-based cancellation through subsequent edits is
attempted. Both verified backups and the before/after diffs remain available for
manual recovery from the user's normal backups. No damaged v2 evidence is deleted,
rewritten or waived through the version-1 resolution protocol.

## Limits

- Unused prepared reservations and damaged v2 records remain conservative blockers;
  releasing/repairing them through a new manual-resolution protocol is deferred.
  There is no force-ignore button or automatic journal cleanup.
- Local v1/v2 operations share one lock in **this plugin instance**. Independent
  Obsidian processes, external sync and other writers are not transactionally locked.
  Checks can detect conflicts, not provide cross-process atomicity.
- Public `DataAdapter` exposes no `fsync`. Acknowledged writes and read-back protect
  against tested process interruption, **not physical power loss guarantees**.
- No ACID, filesystem atomicity or exactly-once claim is made. The journal cannot
  guarantee recovery if all of its durable evidence is lost or corrupted.
- Semantic preservation is a user decision; structure, exact byte preservation
  outside the chosen splices and matching hashes do not prove meaning.
- Only two existing files and reciprocal ordinary links are admitted. Multi-file
  embeds, merge, atomization, create/archive/delete, tag changes and backlink rewrites
  require separate schemas, validation and recovery designs.

See [native acceptance and screenshots](multi-file-safe-apply-native.md). Automated
coverage includes controlled adapter/process faults, both blocker families, shared
exclusion, exact source guards, cache eviction, privacy boundaries and UI lifecycle.
