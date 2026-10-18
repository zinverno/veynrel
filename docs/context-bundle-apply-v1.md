# Context Bundle Safe Apply & Undo v1

A confirmed ContextBundlePlan can now be copied to its canonical note through a separate final review. Supported kinds are exactly `code_explanation`, `list_context`, and `quotation_attribution`. The secondary file is never a writer target. Its path, content, stat identity and properties must remain unchanged for automatic Undo.

The PR #94 planner remains an independently serializable read-only proposal. Its legacy `readOnly` flag and `read_only_no_executor` limitation are preserved for compatibility: that object alone grants no write permission. Execution requires a new, revocable in-memory consent ticket and a distinct validated journal operation. GroupPlan remains read-only; neither plan is converted to an ordinary MergePlan.

## Authority and consent

The final review displays both exact paths, kind, each UTF-16 source range and role, full secondary Markdown, full canonical before/after, literal diff, and the exact EOF insertion including separators. It states that semantic completeness and external dependencies are not established. Opening or cancelling this review creates no journal and changes no Markdown. Apply and Undo each require their own button confirmation. Keyboard activation uses native buttons.

Before issuing consent, after consent, and after backup IO, the executor reads both saved notes and rebuilds the bundle plan against the original Relationship Analyzer result and confirmed choices. TFile identity, path, ctime/mtime/size, full Markdown, native MetadataCache, resolver, outgoing references and known incoming dependencies must agree. Synchronous guards repeat the plan validation after journal IO and inside the writer callback, including in-place analysis changes. Both notes must be closed in all Markdown editors, including popouts; no buffer is saved by this feature.

The source fence/list/quotation and all context blocks are validated by the existing bundle validator. Its heading, frontmatter, nested-list, attribution, protected-range and external-source refusals are unchanged. Only the separately confirmed EOF separator is new text; all selected source characters are copied verbatim. No extra completion, scan, index or background execution is introduced.

## Separate journal protocol

Directory: `<configDir>/plugins/<pluginId>/consolidation-bundle-operations/<operation-id>/`.

The record envelope has `version: 1`, `operation: "context_bundle_copy"`, `state: "prepared"`, a stable SHA-256 operation ID, creation time, the full ContextBundlePlan, and SHA-256 digests of canonical before, canonical after and secondary. The plan binds original identities, complete sources, kind, exact structural/context ranges, insertion, confirmations, resolver, metadata, known dependencies and full analysis provenance.

The ID is SHA-256 of the complete ordered JSON record with empty ID and creation time zero. Validation rejects unknown envelope/contract keys and operation kinds, reconstructs the plan from the saved evidence, and verifies exact copy construction and all hashes. Reconstructed identity objects are used only by the pure validator; they never enter Vault IO. This is integrity validation, not a signature or defence against a deliberate attacker who can replace all evidence.

Before any Markdown write:

1. Write `record.json`, read it back exactly.
2. Copy it to `backup.json`, read that copy back exactly, then reread the first copy.
3. Revalidate both files, both sources, all journal blockers and the confirmed plan.
4. Call `Vault.process(canonical, callback)`; the callback checks exact current before and synchronous guards before returning the verified after.
5. Reread both notes. Only an exact canonical after with the same identity and an unchanged secondary can receive an `applied` receipt.

Append-only `mark-<uuid>.json` receipts bind operation, record hash, state, canonical mtime/byte count and content SHA-256. States are `applied`, `undo_intent`, `undone`. Contradictory receipts, bad ordering, mismatching copies, truncated files or unknown directory structure block unsafe actions. Evidence is not repaired, overwritten or deleted. A failed operation is never retried automatically.

## Recovery and explicit Undo

Operation History shows one logical bundle action, separately from ordinary merges and archives. It combines actual canonical before/after/different state with validated receipts, secondary identity/content and editor guards. Prepared, applied, undone, recovered, conflict and damaged evidence are distinguishable. Opening history or starting Obsidian performs no recovery write.

| Interruption | Observed state after restart | Permitted automatic action |
| --- | --- | --- |
| Before preparation | No operation | None |
| Only first complete backup | Prepared, damaged local evidence | None; preserve surviving copy |
| Both backups / before process | Prepared | None; no resume Apply |
| After canonical write, before applied receipt | Applied, recovered | Separate reviewed Undo if all evidence/sources agree |
| Torn applied receipt | Applied text, damaged journal | None; manual review |
| After complete undo-intent | Applied, recovered | Fresh explicit Undo review |
| After reverse write, before undone receipt | Undone text, recovered, reservation retained | None; no marker repair |
| Torn undone receipt | Undone text, damaged journal | None; manual review |

Undo verifies both backups, actual exact canonical after, receipt mtime, original secondary identity/stat/full text, public metadata, resolver and dependencies. It revalidates the inserted native structured core, writes `undo_intent`, and restores only canonical through exact-after `Vault.process`. It rereads both notes before recording `undone`. Any later content edit or same-content timestamp change blocks automatic Undo. Repeated Apply and repeated Undo tickets cannot run.

Native restart exposed two host serialization details: Obsidian adds private top-level `cache.v` and reorders object keys in `listItems`. Only the comparison of persisted secondary metadata during Undo ignores that private top-level field and object key order. Every public value, nested key, structural offset and array order is preserved. Fresh same-session cache guards remain exact; no `sameSavedNote` or timestamp rule was relaxed.

## Coexistence and limits

The owner is the same SafeApplyService execution lock used by Single-file, Multi-file, Merge, Archive, every Undo and resolution. All old execution entrypoints consult the new journal; the new executor consults all old journals. Reservation, operation completion and Undo eligibility are separate decisions:

- **Completed Apply:** two intact validated copies and a valid `applied` receipt, without `undo_intent` or damaged/contradictory evidence. It does not reserve either file. A completed, validated `undone` receipt also releases the reservation.
- **Unresolved operation:** preparation, a missing applied receipt, missing/damaged copies, conflicting receipts or Undo intent without completed Undo still reserve both paths. Unknown damage scope blocks globally. Actual after text alone does not prove completion; actual before after an interrupted Undo does not release its reservation.
- **Undo eligibility:** actual identity, ctime/mtime/size, full texts, native metadata/dependencies, editors and all journals must still pass the existing independent checks. Later edits can make a completed operation non-undoable without turning it back into an unresolved operation. History may show a source conflict with `canUndo: false` and `blocking: false`.

Completion is determined before live source inspection, so a stale file guard cannot accidentally re-reserve a completed operation. New Single/Multi/Merge/Archive/Bundle plans still need their own valid current sources and consent. Old tickets remain single-use and stale; stable IDs and existing journals cannot be replayed or overwritten.

This follows the existing `MergeApply.blockers` terminal-receipt policy. `ArchiveApply.blockers` intentionally has a different policy: an active archive reserves paths until its complete Apply/Undo chain proves the narrow secondary-mtime exception for parent Merge Undo. Bundle operations have no such parent provenance or mtime exception, so a completed Bundle does not need that archive reservation. Later operations invalidate old Bundle Undo through unchanged exact-state checks; no automatic merge, acknowledgement operation or Markdown-free release command is needed.

See the [completion-policy regression report](context-bundle-completion-review.md) for manual edits followed by a new real Apply, immutable completed evidence and refusal cases.

Old record formats and validators are unchanged. Archive Eligibility continues to accept only successfully confirmed `merge_knowledge_copy`; a context bundle is **not** an archive basis. No archive button is offered on bundle history. Preservation review for such operations is deferred.

There is no move, delete, archive, backlink rewrite, GroupPlan Apply, forced save, version/settings change or release in this implementation. MetadataCache can be incomplete, manual context confirmations do not establish semantic equivalence, and structural safety does not imply consolidation quality. The shared lock covers this plugin instance, not independent processes. Two read-back copies and callback checks do not claim ACID, filesystem atomicity, fsync or power-loss durability.

See [native acceptance and limitations](context-bundle-apply-native.md). Reproduce unit/fault coverage with `npm test -- consolidation/bundleApply.test.ts consolidation/bundleApplyModal.test.ts consolidation/contextBundlePlannerView.test.ts` and native coverage with `npm run build` followed by `node scripts/pair-inspector-native.mjs /tmp/pair-inspector-bundle-apply-FRESH --bundle-apply` in a desktop session with Obsidian installed. The harness refuses an existing test directory and uses scripted analysis only.
