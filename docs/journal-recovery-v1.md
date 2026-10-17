# Journal Recovery & Conflict Resolution v1

This extends [Safe Apply & Undo](safe-apply-undo-v1.md) in the same Operation History
and the same plugin service directory. It diagnoses damaged operations and permits
one conservative, separately confirmed decision: acknowledge a verified saved state
and exclude that old incident from future Apply blockers. **Resolution is not Undo,
proof of a successful Apply, or restoration of a note.**

## Use and evidence

Open **Tools → Operation history**, the existing Pair Inspector history action, or
the existing command. Opening Veynrel does not scan, repair, apply or resolve anything.
History refresh is an explicit, read-only observation. It retains valid rows even if
another operation or an unexpected root entry is damaged. If the root itself cannot
be listed, the interface reports that limitation instead of an empty healthy history.

Each row shows the operation ID, type, original source/target paths when validated,
per-file checks and SHA-256 hashes, current saved source state and blocking scope.
Both original/expected Markdown and the existing literal-text diff remain available
from a valid copy. With two contradictory valid copies, both are viewable, but neither
is accepted as authority for an affected path or automatic action. Invalid JSON text
is never parsed for a source path, rendered as Markdown, or shown as trusted evidence.
Raw exception strings are not displayed.

| Diagnostic | Meaning |
| --- | --- |
| Missing `record.json` or `backup.json` | One required recovery copy is absent. A missing ordinary stage marker alone is not corruption. |
| Unreadable | Adapter read/stat/list failed, type was wrong or bounded size was exceeded; this is not a missing file or empty history. |
| Invalid JSON / record | Truncated JSON, unexpected keys, invalid schema, unsupported action/path/range/splice. |
| Integrity mismatch | Source hashes or stable operation ID do not match the strictly validated record. |
| Copies disagree | Both copies individually pass validation but differ; no trusted operation scope. |
| Invalid stage marker | A partial/malformed marker or wrong ID, stage, record checksum or exact serialization. |
| Marker order | `undone` exists without verified `undo_pending`. |
| Unknown entry | Unexpected files/subdirectories inside an operation, invalid directory names or files at the root. Unknown listing paths are not followed. |
| Uncommitted resolution | Missing, partial, invalid or unreadable intent/commit pair; no waiver. |
| Stale resolution | The original evidence no longer matches the committed decision. |
| Current source differs | Complete saved Markdown matches neither original nor expected result; later text is preserved. |
| Source missing / identity unverified | Exact path cannot be read or its creation time differs. No vault-wide search guesses a moved file. |

SHA-256 detects inconsistent evidence; it is not an authenticated signature against
someone deliberately rewriting the entire journal. Restart identity uses public
Obsidian exact path + creation time + complete saved content, not an OS inode.

## Local and global blockers

An unresolved damaged operation with at least one validated record and no conflict
between valid copies blocks new applies whose **source or target** equals either of
its recorded paths. The second copy need not be present to establish this scope.
Independent pairs retain all normal source, structure, link, editor, consent,
`Vault.process` and single-use checks and can proceed.

No valid copy, contradictory valid copies, unknown root files/directory names, or an
unreadable/invalid journal root retain a **global new-Apply block**. A directory name,
a path in invalid JSON or a surviving unchecked field never establishes local scope.
Unknown children or unreadable evidence inside an operation with a trusted record
retain its local blocker but cannot be manually resolved in v1. Other history rows
remain visible. Resolving one eligible local incident never waives a separate global
or local blocker.

A normal intact historical operation can differ from the present note after a later
edit or operation. That prevents its old Undo, as before; it does not turn ordinary
editing into a new journal-integrity ban on future plans. A manually resolved incident
is also a historical observation: later note edits do not revoke it or enable Undo.
Changing its original journal evidence does invalidate the waiver. The UI labels
current observations separately from the state recorded at confirmation.

## Eligibility and separate confirmation

**Review conflict / Разобраться с конфликтом** appears only when:

- At least one full record passes schema, operation-ID and SHA-256 checks; copies do
  not disagree, and the operation has a known local scope.
- All five original file slots can be enumerated and fingerprinted as present bytes
  or confirmed absence. Unreadable files and unknown children cannot be waived.
- The exact saved source retains its creation time and matches all of `before` or
  all of `after`. No partial matches or reverse-splice guesses are used.
- The source is closed in all native/public FileViews; even an equal open buffer is
  refused because Obsidian has no public lock against a queued editor save.
- No executor operation is running. The shared plugin-wide owner serializes Apply,
  Undo, history checks and resolution. No second executor/history is introduced.

The separate modal shows paths, type, verified/unverified evidence, current saved
state, before/after, diff and the consequences. Merely opening it writes nothing.
**Confirm incident resolution / Подтвердить разрешение инцидента** consumes an
in-memory consent ticket once. Source identity/content/stats and original evidence
are reread at confirmation, then again after persisting the decision intent, before
committing it. Closing, disposal, changes, editor conflicts or a busy executor refuse
commit. A new review is required; a caller cannot manufacture a consent ticket.

The decision **does not** write Markdown, restore `before`, add historical
`applied.json`/`undone.json`, delete or repair an original file, reactivate Undo, or
release the stable old operation ID. That ID's existing directory stays reserved.
Any operation with resolution attempts remains ineligible for automatic Undo. No
"ignore all" or forced unknown-state override exists.

When the source differs, identity is missing, both copies fail, or other prerequisites
fail, the row explains the missing evidence and provides any validated original/diff.
Keep the journal and use an ordinary independent vault backup for manual recovery
outside this interface, preserving subsequent edits, then refresh. Deleting damaged
journal evidence to bypass a block is not a supported recovery workflow.

## Append-only decision protocol

The existing version-1 files and their exact bytes remain compatible and unchanged:
`record.json`, `backup.json`, `applied.json`, `undo_pending.json`, `undone.json`.
Inside the **same operation directory**, each explicit attempt uses a fresh UUID v4:

1. Revalidate the consent and saved source; construct
   `resolution-<uuid>.json` (version 1). It contains original operation ID, attempt ID,
   decision `acknowledge_verified_state`, confirmation time, validated record hash,
   five original evidence slots (name, validation status, SHA-256 of the adapter’s UTF-8 text or confirmed absence),
   hash of that evidence list, source path/creation time/mtime/size/hash and its exact
   `before`/`after` match. It contains no source text, target text, model data or key.
2. Require both unique attempt names to be absent. Write the intent, await completion
   and compare the entire read-back with the expected bytes.
3. Reread original evidence and saved source. Compare them to the reviewed snapshot;
   check identity, editor state and consent again.
4. Require the commit filename still absent. Write
   `resolution-<uuid>.commit.json` with version, original operation ID, attempt ID and
   SHA-256 of the exact intent bytes. Await and verify the entire commit read-back.
   Only then report success to the modal.
5. On a later explicit history/review, accept only a strictly validated intent plus
   its complete matching commit and unchanged original evidence. Never reconstruct
   missing original stage markers. Incomplete older attempts remain visible and do
   not prevent a fresh uniquely named attempt from succeeding.

The read-back error path does not claim success: the user must refresh history. If
complete matching bytes were already saved before the read-back failed or the
process died, that refresh can validate the committed historical decision. A partial
commit cannot. Unconfirmed intent records are not evidence that the decision completed.
A later changed original file reblocks the incident even if an old decision exists.

| Interruption point | Next explicit refresh after restart |
| --- | --- |
| Before intent creation | Original incident remains blocked; fresh review possible. |
| During intent write | Invalid/uncommitted attempt preserved; blocked; new UUID attempt allowed after fresh review. |
| After verified intent, before recheck | No commit, no waiver; same as above. |
| Source/evidence changes during intent IO | No commit; retain intent; refuse until prerequisites can be freshly established. |
| During commit write | Partial commit preserved; no waiver; fresh attempt allowed. |
| Complete commit persisted, before read-back/UI acknowledgement | Validate both files and original evidence; show manually resolved, never Apply/Undo or replay. |
| After acknowledged resolution | Same manually resolved history and preserved originals. |
| Original evidence later changes or becomes unreadable | Old waiver no longer covers it; show conflict and appropriate local/global block. |

There is no background repair or new persistent index. No new network/LLM request is
made. Original backups continue to contain the source text, inherit vault permissions
and backup policy, and are not encrypted. New decision files add hashes/metadata only.

**Physical durability limit:** public `DataAdapter` has no `fsync`, directory sync,
exclusive create transaction or cross-file transaction guarantee. Unique names,
single-owner serialization, awaited writes and exact read-back cover acknowledged
application IO and tested process termination. They do not guarantee recovery after
power loss, storage-controller failure or simultaneous independent Obsidian processes
or remote sync modifying the journal. The source recheck and journal commit are also
not one atomic filesystem transaction. The UI never claims otherwise.

## Validation and deferred scope

Adapter fault injection covers both corrupt copies, disagreements, unreadable files,
unknown layouts, partial stage/decision markers, stale source/ctime/path/checksums,
local/global blocking, late changes, consent reuse, concurrent windows, read-back
failure, restart and preservation of every original byte. Existing Apply/Undo tests
remain in place. [Native report and screenshots](journal-recovery-native.md) include
real Vault.process writes and actual SIGKILL with controlled adapter pause points.

Deferred: multi-file transactions, merging/deleting/archiving notes, automatic
three-way merge, restoration from uncertain evidence, pruning old journals,
background repair and physical power-loss guarantees. Companion, Recall, Deep Audit,
semantic retrieval, tag recommendations, settings, versions and release assets are
unchanged.
