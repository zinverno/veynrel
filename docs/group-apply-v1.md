# Group Safe Apply & Undo v1

`copy_context_group` copies a confirmed H1/H2/H3 subtree and the explicitly confirmed ancestor introductions to canonical EOF. Heading levels, source characters and ordering remain unchanged; the only added characters are the previewed separators. Secondary and all other Markdown files are untouched. A GroupPlan is a read-only proposal, not write authority; only a fresh, separate Group Apply review can issue a private, one-use consent ticket.

## Scope and authority

The new `GroupApply`, `GroupJournal` and `obsidianGroupPort` are separate from Merge and Bundle. They reuse the existing SafeApplyService owner, native saved-note/editor guards, incoming dependency reader, Vault.process port, diff view and GroupPlan builder/validator. The execution sequence follows the reviewed Bundle protocol without converting a GroupPlan or changing old journal formats. The historical GroupPlan `readOnly` / `read_only_no_executor` fields are retained for proposal compatibility: they describe the proposal's lack of execution authority, not a consent ticket.

The original GroupPlan refusals are unchanged. Only unadorned native ATX H1–H3 with locally closed sections and ordinary prose can transfer. Code, lists, quotes, links, embeds, block IDs, footnotes, external addresses, source preambles/properties and unknown context dependencies still refuse. Conflicting, unrelated, insufficient-context and unchecked-version analyses refuse; related-distinct requires explicit intent. The local checks and user confirmations do not prove semantic completeness.

Review shows both exact paths, the chosen section, complete ancestor heading path and copied introductions, every copied/retained range, original/result heading levels and offsets, full secondary, canonical before/after, literal diff, EOF insertion and warnings about duplicated context and unknown semantic/external dependencies. The new final button is available only after review. Opening/closing review writes neither Markdown nor journal; closing, cancelling, reselecting or replacing analysis revokes its authority. Public preview mutations cannot change the private ticket.

Before consent, after consent and after backup IO immediately before process, the native port rereads both complete files and rebuilds GroupPlan. Checks include runtime TFile identity, paths, ctime/mtime/size, full source, MetadataCache, outgoing references/resolver, incoming cached consumers, current analysis, confirmations, hierarchy, all context/ranges and exact before/after/EOF insertion. The synchronous guard repeats plan validation at the process boundary. Both editors must be closed, including popouts; no forced buffer saves occur.

## Protocol

Evidence lives under `<configDir>/plugins/<pluginId>/consolidation-group-operations/<id>/`:

- `record.json` and `backup.json`: complete immutable recovery records, each reread exactly before Markdown can be written.
- `mark-<UUID>.json`: append-only applied, undo_intent or undone receipts, bound by SHA-256 to the full record and containing canonical mtime/UTF-8 bytes/content SHA-256.

The record has version 1, discriminator **`copy_context_group`**, prepared state, creation time, a stable SHA-256 operation ID, the full GroupPlan and SHA-256 of canonical before/after and unchanged secondary. The plan includes both original identities/full Markdown, source/destination/inserted hierarchy, exact selected/context/copied/retained UTF-16 ranges, insertion, confirmations, dependencies and analysis provenance. ID excludes creation time but includes the complete immutable operation evidence; an existing ID cannot be prepared again, including after Undo.

Validation rejects extra/unknown envelope fields, wrong discriminators, invalid identities/paths/sizes, changed hashes or ranges, unsupported groups and inconsistent receipts. It reconstructs synthetic identities solely to rebuild the saved GroupPlan; those identities never authorize native IO. Both copies must validate and agree. A surviving valid copy identifies local damage; unidentifiable or unknown evidence scope blocks globally. Files are never silently repaired, discarded or replaced. Single/Multi/Merge/Archive/Bundle validators reject this record, and Archive Eligibility still uses only completed `merge_knowledge_copy` evidence.

The only writer is the existing native Vault.process port, dispatched with canonical's live TFile. Its callback checks exact current before and synchronous guards before returning the verified after. After writing, both notes are reread; expected canonical content/identity/bytes and unchanged secondary identity/stat/content must hold before the applied receipt. Failure causes no automatic retry.

## Completion, reservations and Undo

All six journal families participate in the same execution lock, consent/execution blockers and history snapshot. Single-file resolution gates also check Group. No separate executor or Undo can run while the owner is busy.

| Evidence | Reservation | Undo eligibility |
| --- | --- | --- |
| Prepared, missing applied receipt, interrupted preparation/write | Both paths | Actual after with complete copies may permit separately confirmed recovery Undo |
| Complete applied receipt, no undo_intent or damage | Released | Independently checks exact actual sources and dependencies |
| Later edit after completed Apply | Still released | Old Undo refuses; a fresh independently checked plan may proceed |
| undo_intent without complete undone receipt | Both paths | Only the existing explicit recovery checks can authorize another attempt |
| Complete undone receipt | Released | Cannot repeat Undo |
| Damaged copies or contradictory receipts | Local, or global if scope unknown | Unsafe automatic actions refused; evidence retained |

This is the fixed PR #95 Bundle/Merge completion policy. It is deliberately different from Archive's active reservation: Archive needs a proven Apply/Undo chain for its parent Merge secondary-mtime exception. Group has no such parent exception. No global `mtime` or `sameSavedNote` rule is relaxed.

Undo has its own full inverse preview and one-use ticket. It requires exact canonical after, receipt mtime/bytes when available, original creation identity, unchanged secondary content/stat/public metadata, references, resolver and incoming dependencies. Across restart only Obsidian's private cache `v` and object key ordering are normalized; every public metadata value and array order remain checked.

Group Undo compares public metadata of the unchanged canonical prefix (filtering newly appended native headings/sections) and validates the complete resulting heading projection and each mapped copied section/protected range. Noncontiguous ancestor introductions use separate destination cursors, not a single offset delta. A valid destination preamble/YAML is preserved: source-only preamble rules are applied to secondary, not to the whole resulting canonical. Repeated heading titles are distinguished by exact offsets. Undo writes only canonical after → before through the same exact-before Vault.process port, then verifies both files and appends undone.

## Recovery and limits

Startup performs no repair, Markdown write, retry or rollback. Explicit history reads classify the actual canonical text against saved before/after, with receipts and identities checked independently. A crash after a write but before a receipt can therefore be shown as recovered applied/undone. Actual before alone does not release pending Undo. Torn receipts and incomplete backups remain preserved and blocking for manual review.

The fault matrix covers before preparation, after each copy, before process, after forward write, torn applied marker, after undo_intent, after reverse write and torn undone marker. Tests cover stale/cancelled/replayed consent, competing windows, callback races, all six local/global journal families, later edits and subsequent valid operations. [Native evidence and reproduction](group-apply-native.md) distinguish host tests from mocked IO.

No moving, deleting, archiving, hiding, backlink changes, heading reorganization, LLM rewriting, atomization or automatic conflict resolution is included. No ACID, filesystem atomicity, fsync, power-loss or independent-process exclusion guarantee is claimed. Versions, settings schema and release are unchanged.
