# Archive Apply & Undo v1

Archive Apply adds only two flat properties to the secondary note, using the
literal insertion already reviewed in ArchivePlan:

```yaml
veynrel_archive_status: archived
veynrel_canonical: "[[Folder/Canonical]]"
```

The original path, body, existing YAML characters and links stay intact. Canonical
is never written by Archive Apply or Archive Undo. This is a soft mark in place:
Obsidian is not required to hide, move or otherwise treat the note differently.
There is no provider request, background archive task, settings change, version
bump or release.

## Consent and authority

Build an ArchivePlan from **Consolidation operation history → Review archive
eligibility**, making an explicit decision for every uncopied fragment. Then
choose **Check and apply archive mark**. The separate consent window shows both
paths, the parent Merge operation ID and SHA-256, every confirmed fragment
disposition, semantic/external-dependency warnings, complete secondary before/after,
unchanged canonical and the diff. **Apply archive mark** is the final confirmation.
Opening either review performs no Markdown or journal writes.

An ArchivePlan is never independent execution authority. The executor snapshots
the choices into a private, single-use ticket and rebuilds the complete plan from
fresh sources. Mutating the public preview cannot alter the ticket. Closing the
planner/consent window, changing a choice or invalidating the planner revokes the
ticket before dispatch. Once a write has been dispatched, its result is observed
even if its own vault event invalidates the planner.

Checks run before consent, after confirmation and after recovery-data IO, before
the actual write. They reread both full notes and both parent Merge copies;
compare exact paths, runtime TFile identity, ctime, mtime, byte size and content;
require the parent to have matching completed applied receipts and no Undo;
and compare the rebuilt plan, literal YAML insertion, all choices and available
dependencies. Native cache and resolution guards run synchronously immediately
before dispatch and inside the `Vault.process()` callback. Both notes must be
closed in every editor, including real popout leaves.

The callback requires its current text to equal the approved `before`. It returns
only the validated exact `after`. YAML is never reserialized. Afterwards both
files are reread, identity checked and matched against the expected versions
before an applied receipt is written. The parent Merge journal is not changed.

## Journal and shared exclusion

`ArchiveJournal` uses its own `archive_in_place` discriminator and
`<Vault.configDir>/plugins/<pluginId>/consolidation-archive-operations/<id>/`.
Existing single-file, multi-file and Merge formats retain their original meaning.
The immutable archive record contains:

- A stable operation ID, creation time, operation type and prepared state.
- The complete parent Merge record and the exact ArchivePlan, including its parent
  ID/hash and applied receipt.
- Both participants' original path/ctime/mtime/size, unchanged canonical text/hash,
  full secondary before/after and SHA-256 values.
- Exact copied ranges, complete remaining-fragment coverage, user dispositions,
  acknowledged limitations, dependencies and the literal YAML insertion.

The validator independently checks the parent record, binding, range coverage,
safe insertion and exact text equation. Recomputing hashes cannot make an
unsupported edit valid. The record is written and read back, copied to a second
full file and read back, then the first copy is reread before Markdown dispatch.
Unique append-only marker files record `applied`, `undo_intent` and `undone`, with
record hash and exact observed secondary mtime/size/content hash. Conflicting
receipts, torn files, unexpected entries and missing copies retain evidence and
block unsafe actions.

Archive shares SafeApplyService's existing execution owner with single-file,
multi-file, Merge, all Undo paths and resolution. It does not acquire a second
lock or convert the plan into an old operation. Parent checks and restoration
proofs read journals directly, avoiding nested lock acquisition and blocker
recursion. Active or incomplete archives reserve both participants; unknown
archive structure blocks globally. Only a complete Archive Apply/Undo chain
releases that archive reservation. Every executor checks the archive blockers;
resolution also checks them before its own record writes.

Each Merge/Archive history read uses one call-local snapshot of the four validated
journals, avoiding repeated parsing for every row. This snapshot is never stored
in a ticket or reused by consent/execution; those paths always reread evidence.

## Archive Undo and parent Merge Undo

Archive Undo has a separate full inverse preview and final confirmation. It
requires the exact archived secondary `after`, unchanged canonical, intact parent
provenance and fresh editor/cache/journal checks. It first persists Undo intent,
rechecks everything, then restores secondary through `Vault.process()` with an
exact `after` comparison. It rereads both notes before recording `undone`.
Subsequent user edits block Undo; there is no search-and-delete of archive fields.
A completed Undo cannot be repeated, and the same parent cannot be archived twice.

Restoring the text does **not** restore filesystem mtime. The old Merge Undo
requires the original secondary mtime. This implementation adds a narrow proof
for that one check, without changing `sameSavedNote` or ordinary source checks.
The exception requires all of the following:

1. Exactly one Archive record bound to the exact original parent Merge record.
2. Two intact, agreeing copies in each journal and a matching parent applied
   receipt. Parent Undo state is still interpreted by the original Merge protocol.
3. Verified archive `applied`, `undo_intent` and `undone` receipts. Applied and intent
   identify the same archived secondary version.
4. Current secondary path, original ctime, byte size, full text and SHA-256 matching
   the original Merge source, with current mtime equal to the archive undone receipt.
5. Fresh consent snapshots, intact receipt evidence, canonical receipt/version,
   closed editors and all scoped/global blockers still passing.

This proof is used consistently in Merge history and Merge Undo's native source
check, and is revalidated around asynchronous reads and Undo intent IO. The
original Merge record is never patched to carry a new mtime. Later edits, even
when reverted to identical text with a different mtime, do not inherit permission.

Thus the fully acknowledged sequence **Merge Apply → Archive Apply → Archive
Undo → Merge Undo** restores both originals, including after restart. While the
archive mark is active, parent Merge Undo is unavailable and direct attempts
refuse before changing either note. History explains whether Archive Undo must
come first, the completed chain permits a new Merge Undo review, or manual
inspection is necessary. These permissions are checked again when selected.

## Interrupted or incomplete chains

Startup performs no archive writes, rollback, journal repair or automatic replay.
History compares actual saved text with the stored before/after, plus available
identity and receipt evidence; a marker alone cannot determine the result.

| Interruption | Observed state and permitted next step |
| --- | --- |
| Before prepare starts / operation directory creation | No archive reservation or Markdown write. Parent Merge remains unchanged. |
| After first copy | Prepared with damaged/incomplete evidence; no automatic Apply or Undo. |
| After both copies / immediately before process | Prepared. Retain both copies; no automatic continuation. |
| After secondary write, before applied receipt | Recovered applied. An explicit Archive Undo can restore the exact original if all other evidence is intact. |
| During applied marker | Applied text with damaged journal; automatic Undo is refused. |
| After valid Undo intent, before restoration | Recovered applied. A fresh explicit Archive Undo can complete restoration. |
| After restoration, before undone receipt | Recovered undone text. No further Markdown Undo; parent Merge Undo remains blocked. |
| During undone marker | Restored text with damaged journal; parent Merge Undo remains blocked. |

An explicit Archive Undo after a missing applied receipt does not invent that
receipt. Even when it restores the original text and records undone, the chain
is incomplete and parent Merge Undo stays blocked. Likewise a crash after restoring
secondary but before recording undone cannot grant the mtime exception. All
recovery text and surviving receipts remain available for manual inspection.
There is no archive resolution or automatic completion of missing receipts in v1.
An interruption after creating the operation directory but before its first valid
record leaves unknown evidence. The empty/partial directory is retained as a
damaged global blocker for manual inspection; it is not treated as no operation.

The guarantees are acknowledged adapter writes and exact read-back under the
plugin's shared owner. They are not ACID, filesystem atomicity or fsync, and do
not exclude independent Obsidian processes, plugins or sync clients. Cache
observations cannot establish complete semantic/external dependencies. Successful
copying and user dispositions do not prove redundancy or semantic completeness.

See [native acceptance and fault evidence](archive-apply-native.md).
