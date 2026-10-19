# Unified Archive Eligibility & Planner v2

Group and Bundle history can now open a separate, read-only in-place archive review after a **confirmed completed Apply**. Merge keeps its existing `ArchivePlan` v1, planner, executor and Archive Undo chain. PR #100 was verified merged at `a89df52c988379780cef0463a83e4b0b06b27af3`; this change starts from that current `main`.

## Contracts and authority

| Parent journal operation | Review contract | Execution |
| --- | --- | --- |
| `merge_knowledge_copy` | Existing `ArchivePlan`, version 1 | Existing Merge Archive Apply/Undo, unchanged |
| `context_bundle_copy` | `ArchivePlanV2`, version 2 | No archive executor |
| `copy_context_group` | `ArchivePlanV2`, version 2 | No archive executor |

V2 uses the independent `structural_archive_in_place_plan` discriminator, `readOnly: true`, and explicit parent operation, ID, record SHA-256, full typed Group/Bundle parent record and applied receipt. Group/Bundle records are never converted to `MergeRecord`. Neither the V2 UI nor session accepts an Apply callback. V1 validates its own version, exact keys, discriminator and Merge parent; V2 is not a V1 execution capability. A regression test attempts to submit V2 to the old executor and requires rejection before writes.

`SafeApplyService.readArchiveParent()` owns the existing shared execution lock. It reads both validated journal copies through the existing operation-specific journal parser; missing, mismatched or damaged copies cannot qualify. It requires one or more identical, valid `applied` receipts, and refuses every `undo_intent`/`undone`, recovered-only state and conflicting receipt. Receipt hash, canonical byte length and mtime must match the exact current canonical after. The native Group/Bundle Undo **read check** is reused without creating an Undo ticket or executing it: exact canonical after, original secondary, paths, TFile identity, ctime, mtime, byte counts, native structure, MetadataCache, references, resolver and incoming dependencies remain mandatory.

Planning checks all existing journal families for conflicts, including intact pending Single/Multi operations that cannot be treated as completed. A second complete journal read must equal the first. No mutation/recovery/repair is performed. The adapter consults cached known consumers and pins their identities/cache/stat/resolver evidence. The session repeats the whole read before publishing review and around plan construction; old and new guards must both hold. Closing, cancelling, changing any choice, a source switch, vault/cache events, affected editor opening or late results revoke the plan. Confirmations start empty and are reset after invalidation/restart. The JSON is a verified snapshot, not a persistent permission or a live journal monitor: adapter-only changes in hidden journal files may not emit Obsidian events. Start a new review to re-read them; any future executor must independently revalidate all evidence. No filesystem watcher or background vault scan is introduced.

Completion and archive eligibility are different: a terminal Group/Bundle operation may release reservations for further work while its original archive basis is no longer valid. A later canonical edit, including a separately completed operation on the same pair, invalidates the old parent. A subsequent valid parent can prove **only its own exact after and copied ranges**, never a union of a history chain. A two-Group regression checks this explicitly.

## Preservation review

`archivePartition()` validates current native structure against the saved parent. Group uses exact `group.copied`, `group.retained`, ancestor context and hierarchy. Bundle uses its exact copied envelope, confirmed `blocks`/roles, core, before/after context and retained ranges. Saved parent validators independently rebuild the entire original plan and insertion before trusting its journal.

The copied and retained ranges must form a non-overlapping, gap-free cover of the complete secondary string, including whitespace. Each range must have valid integer boundaries and exactly match the source slice. Native sections must also cover every non-whitespace character without overlap. The final partition is ordered and contiguous from offset zero to string length; concatenating its literal text must reproduce secondary exactly. Offsets use Obsidian/JavaScript UTF-16, not bytes. Byte identity uses UTF-8 and receipt hashes independently. Unicode and CRLF are preserved.

The partition records copied content, uncopied content, structural/context dependencies, and whitespace/separators. A separator also records whether it belonged to an actual copied source range. Uncopied headings and introductory/attribution text require review just like body paragraphs. The UI exposes the complete source, copied ranges, the full partition and neighboring context for each remaining fragment. Parent structure, Bundle block roles and all original source ranges are retained in serialized provenance.

Every non-whitespace uncopied fragment requires an initially empty choice:

- Already represented in canonical: a user assessment only.
- Intentionally retained in secondary: an explicit preservation decision only.
- Needs more consolidation: prevents a ready plan.

Neither accepted choice is semantic proof. The contract records `semanticCompletenessProven: false`, parent analysis limitations and unresolved external/semantic limits. No LLM call is made to improve or certify them.

**Conservative Group limit:** the complete Group secondary must consist of the existing supported plain H1/H2/H3 and paragraphs. Rich syntax in an unselected sibling, including valid code/list/quotation/link syntax, is refused until a complete retained-structure validator exists. This avoids treating malformed fences or incomplete native structure as reviewed prose. The UI discloses this restriction, including on refusal. Bundle separately uses its existing code/list/quotation validators and confirmed context. Current Bundle v1 requires the full context envelope, so its remaining partition may contain only whitespace and legitimately need zero fragment decisions. Other acknowledgements remain mandatory.

## Dependencies and in-place YAML proposal

The review shows cached incoming paths/counts, outgoing links, embeds, property links, and available heading/block subpaths. Known consumer files missing from the vault are not silently removed from this V2 view. Missing incoming indexes, missing consumer MetadataCache, count/classification mismatches and unresolved targets are explicit limitations. Changes to consumer identity, stat, cache or resolution invalidate a read. Consumer Markdown is not read and no content scan or index is started.

Every plan requires a **separate unchecked acknowledgement** accepting incomplete consumer knowledge for this in-place proposal. Even a fully classified cache is not proof of exhaustive consumers: external scripts, unindexed links and semantic dependencies remain unknown. Invalid index counts or malformed evidence refuse the read instead of being accepted by that acknowledgement. Changed dependencies relative to the parent can be refused even when the new dependency looks harmless. No links are rewritten.

The shared `archiveMark()` inserts only:

```yaml
veynrel_archive_status: archived
veynrel_canonical: "[[Full/path/to/canonical]]"
```

The whole original secondary, path and properties remain intact; the proposal performs no move/delete/hide. The screen shows complete secondary before/after, canonical text, literal YAML diff and full serializable provenance. YAML ambiguity, malformed delimiters, stale frontmatter cache, reserved/conflicting Veynrel keys or unsafe canonical link text refuse the proposal. Existing Merge v1 tests cover literal insertion into existing frontmatter without rewriting comments, nested properties, lists or block scalars. Current Group/Bundle source grammars prohibit a secondary frontmatter preamble; adding one after Apply already invalidates the parent before insertion. This PR does not expand those grammars to manufacture new eligible examples.

## Future executor: narrow parent Undo restoration chain (design only)

The chain `Group/Bundle Apply → Archive Apply → Archive Undo → Group/Bundle Undo` is **not currently fully reversible**. Parent Undo requires secondary's original mtime. A future Archive Apply changes it; Archive Undo can restore exact text but cannot restore the historical mtime through the public Vault API. Equal text after restoration is insufficient to bypass the parent's timestamp check. This PR adds no such exception.

A future, separately reviewed executor can follow the existing Merge Archive approach with a stricter typed parent binding:

1. A new archive journal family/discriminator must bind the complete immutable Group/Bundle record, parent operation/ID/hash and validated applied receipt. Its own two full matching copies must record exact secondary before/after hashes, identities/stat snapshots and the literal mark edit. It must not reinterpret V1 archive journals.
2. At most one archive operation may be bound to this parent. Unknown, ambiguous, multiple, incomplete or damaged links fail closed. Pending/active Archive Apply reserves both participants and blocks parent Undo. No automatic chain search, retries or startup repair.
3. Archive `applied`, `undo_intent` and `undone` receipts must all be intact and mutually consistent, bound to that archive record, exact note identity and appropriate full content hashes/byte counts. The parent must still have its original confirmed applied-only evidence. Restored text without an `undone` receipt is recovery evidence, not authorization.
4. Only a completed verified chain can provide a scoped restoration result such as `{ parentOperation, parentId, parentRecordHash, archiveId, archiveRecordHash, restoredSecondaryMtime, evidenceFingerprint }`. That value is valid only for this exact parent and secondary. It substitutes only the expected secondary mtime; it must not relax path/TFile/ctime/content/hash/size/cache/resolver/dependency/editor checks, canonical after or receipt checks.
5. Fresh parent and archive copies/receipts must be re-read before consent, before `undo_intent`, and immediately before the exact-before canonical `Vault.process()` callback. Pin and compare the complete restoration evidence across those reads. Any subsequent secondary write, canonical operation, archive-chain change or unsupported cache effect refuses the parent Undo.
6. Keep leaf journal inspection separate from shared-owner service methods to avoid recursive locks (as existing `ArchiveApply.restoration()` does for Merge). Validate the restoration chain once under the owner and recheck immutable fingerprints; never pass synthetic journal-reconstructed TFiles into native ports.

Required future tests include happy-path real native restoration, wrong parent type/ID/hash, both-copy disagreement, missing/torn/conflicting receipts, crash after reverse write before receipt, multiple archives, later same-text/different-mtime edits, canonical/secondary replacement, dependent cache changes, popout editors, stale consent and concurrent operations. Until that executor and chain have independent unit/native evidence, Group/Bundle timestamps retain their original strict meaning.

See [native acceptance and screenshots](archive-planner-v2-native.md) for measured evidence and its limits. Legacy atomization, settings, version and release are unchanged.
