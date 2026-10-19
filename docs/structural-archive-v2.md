# Structural Archive Apply & Undo v2

`ArchivePlanV2` remains a read-only review contract. A separate final review creates a one-use, in-memory execution ticket for `copy_context_group` or `context_bundle_copy`. Opening either review creates no journal and changes no Markdown. Merge Archive v1 keeps its existing planner, executor, discriminator and receipts.

## Scope and preserved information

Archive Apply inserts exactly the approved YAML edit into secondary through `Vault.process()`. The resulting document must equal the complete saved `secondary.after`; removing the inserted prefix must yield every byte of the original secondary. The body, links, headings, whitespace, CRLF and Unicode remain literal. There is no rename, deletion, hiding, link rewrite, model request or canonical write. Archive Undo uses `Vault.process()` to restore the complete literal `secondary.before` and leaves canonical unchanged.

The existing Group/Bundle grammars determine eligibility. Group supports checked plain H1/H2/H3 branches and ancestor introductions; Bundle supports checked Code + Explanation, List + Context and Quotation + Attribution. Unsupported Group structure is refused. These current parent grammars exclude pre-existing frontmatter: this executor does not broaden their eligibility or reserialize YAML. Other existing user properties are never edited by an archive operation. Supporting broader parent grammars requires additional native metadata normalization tests before widening this boundary.

Preservation review uses the existing exact source partition. Copied ranges, retained text, context/structural dependencies and whitespace cover the whole source without overlaps or omissions. `represented` and `retained` are user decisions, not semantic proof; `consolidate` prevents a ready plan. A single journal proves only its exact canonical after. Independent successive parent operations are not composed into a chain.

## Ownership and trust boundaries

- `structuralArchiveApply.ts`: one-use tickets, repeated checks, eight-family reservations, history and leaf restoration evidence.
- `structuralArchiveJournal.ts`: independent v2 record and append-only receipt validation/storage.
- `obsidianStructuralArchive.ts`: fresh parent validation and plan rebuild; separate archived/restored validators through `obsidianStructuralArchiveState.ts`.
- `structuralArchiveEvidence.ts`: exact parent binding and normalization of only the known YAML addition in native metadata.
- `structuralArchiveApplyModal.ts`: full final/reverse review with a separate initially unchecked acknowledgement.

The service shares the existing exclusive execution owner with Single, Multi-file, Merge, Merge Archive, Bundle, Group and Empty Atom. All eight families participate in blocking. Parent restoration inspection reads journal snapshots and native state directly; it never reacquires the shared execution lock. Existing seven record formats are unchanged; Group/Bundle gain only an optional, strictly verified restoration argument to their existing Undo checks.

The planner's serialized JSON never grants write authority. Before the final review, after consent, after preparing both recovery copies (or an Undo intent), and immediately before dispatch, the service rereads both full notes, parent copies/receipts, structural source and dependency evidence. It rebuilds `ArchivePlanV2` with the saved decisions and requires exact agreement with the reviewed plan. The synchronous callback checks the actual before text, current TFile objects/stats, editors including popout, metadata/resolver and current ticket.

Metadata checks include known incoming/outgoing links, embeds, property links, heading/block subpaths, resolver results and the identity/stat/cache evidence of known external consumers and targets. Incomplete or unresolved native dependency evidence blocks execution. The separate acknowledgement covers only the disclosed limit that external consumers cannot be exhaustively enumerated. It does not waive missing MetadataCache or resolver failures. No links are changed.

TFile object identity is pinned within each live review/dispatch. After a restart, path, ctime, mtime, size, full content/hash, receipts and native metadata establish the durable basis; fresh TFile objects are then pinned again. This is not inode attestation against an external tool capable of forging every saved byte and timestamp. The vault adapter offers no cross-process transaction or fsync guarantee; interrupted/ambiguous evidence remains manual recovery.

## Journal protocol

Directory: `<configDir>/plugins/<pluginId>/consolidation-structural-archive-operations/<id>/`.

The independent discriminator is `structural_archive_in_place`, version 2. `record.json` and `backup.json` contain the same complete immutable record: stable SHA-256 operation ID, full `ArchivePlanV2`, full typed parent record, parent ID/type/hash/applied receipt, exact canonical and secondary before/after, SHA-256 of both documents and the YAML edit, preservation decisions, dependency evidence and secondary identity. The operation ID excludes creation time so the same operation cannot be prepared twice. Both copies are written and read back before Markdown dispatch; the parent journal is never modified by Archive Apply/Undo.

Receipt files are append-only `mark-<UUID>.json`. Each binds the discriminator, ID, record hash, prior receipt (or record) hash, dependency evidence hash, secondary content hash, byte length and observed mtime. The only valid order is:

```text
prepared record → applied → undo_intent → undone
```

Unknown files, unexpected fields, missing/unequal copies, malformed/torn receipts, duplicate states (including identical duplicates), conflicting identity or broken hash links refuse continuation. Valid copies remain available when the other copy is damaged. Unknown/unidentifiable incidents block globally; identifiable incomplete operations reserve the two paths. A complete archive Undo releases ordinary reservations but keeps all evidence for parent Undo.

After a write, the executor freezes fresh SavedNotes and checks exact content, identity, stats, SHA-256, parsed YAML and native dependencies. Foreground metadata settling is bounded to two seconds, checks those frozen identities between reads and performs no repeated writes. Only verified after-state permits `applied`/`undone`. There are no background retries or repairs.

## Why parent Undo needs a narrow exception

The sequence is:

```text
Group/Bundle Apply → Structural Archive Apply → Structural Archive Undo → Group/Bundle Undo
```

Archive Undo restores the original secondary text but cannot restore its original mtime. The original Group/Bundle Undo checks therefore remain the default and cannot be reused to validate the archived state.

The only exception substitutes the secondary's historical mtime with the mtime in the intact structural archive `undone` receipt. It requires exactly one archive record bound to the entire exact parent record and its original applied receipt; both archive copies and all three ordered receipts must be intact. Current secondary must equal the original before text/hash/size and the undone mtime, with unchanged ctime, path, current pinned TFile, metadata, resolver and dependency evidence. Canonical must still be the parent's exact after with its original applied identity. Every other Group/Bundle check remains active.

The chain is inspected again around native parent Undo checks, after consent, after the parent's Undo intent and before canonical dispatch. Parent Undo's own intent is permitted during that check without calling a lock-owning method. A second archive claiming the same parent refuses the exception. Active Archive Apply blocks parent Undo; incomplete evidence blocks it even when text **and the historical mtime** have been made equal. User edits after restoration, a new backlink, altered consumers or changed canonical also revoke it. Completed parent Undo remains a terminal operation; the retained archive history no longer offers parent Undo.

## Consent and recovery

The final review displays parent operation/ID/hash and completed evidence, paths, copied/retained ranges, all preservation decisions and dependencies, complete secondary before/after and canonical, exact diff, and the parent Undo warning. Closing/cancelling, changing the source/plan, document/dependency events or an affected editor revokes the ticket. Late async results cannot restore it. After dispatch the executor finishes observing the issued write even if its own vault event invalidates the UI; recorded success is not later overwritten by stale workspace events.

Undo is a new review and one-use acknowledgement. It requires intact completed Archive Apply, exact archived after/mtime and unchanged canonical/environment. Once Undo intent exists, interruption is manual recovery; this executor does not resume or repeat it automatically.

| Interruption | Evidence / actual Markdown | Allowed after restart |
| --- | --- | --- |
| Before preparation | No archive; original secondary | Normal parent Undo remains eligible |
| First copy | Incomplete archive; original secondary | Preserve copies, manual recovery |
| Second copy / before process | Prepared archive; original secondary | Manual recovery; no automatic Apply or Parent Undo |
| After Apply before receipt | Archived secondary; no applied receipt | Manual recovery; no automatic Undo |
| Torn applied receipt | Archived secondary; damaged receipt | Manual recovery |
| After undo_intent | Archived secondary; incomplete Undo | Manual recovery |
| Reverse write before undone | Original text, new mtime, incomplete chain | Manual recovery; Parent Undo refused |
| Torn undone receipt | Original text, new mtime, damaged chain | Manual recovery; Parent Undo refused |
| Three intact receipts | Original text and verified new mtime | Separate verified parent Undo review |

Startup only classifies observed state. It never writes notes, removes records, repairs receipts, automatically undoes an archive or restores canonical. Recovery copies are evidence for explicit manual investigation, not permission to continue an uncertain operation.

See [native acceptance](structural-archive-v2-native.md) for commands, observed full cycles, interruption evidence, screenshots and limits.
