# Atomization Apply & Undo — Existing Empty Note v1

PR #99 is the base (`a27037985f7186e88ee6e199a0fabd4fd16d2c5e`). This operation fills a note that the user has already created. It neither creates nor removes Markdown files. The [exclusive creation gate](atomization-exclusive-create-v2.md) remains closed, and the experimental creator remains outside the plugin bundle.

## User workflow

1. Create an empty Markdown note in Obsidian and close its editor, including any popout. Close editors for both source notes too.
2. Open a verified Relationship Analyzer result, then Change Planner → **Atomization → existing empty note**. The previous read-only new-file preview remains available separately.
3. Explicitly select a source, a whole native paragraph or validated H1/H2/H3 section, an existing empty target, and a heading. Review the context and each initially unchecked confirmation.
4. Build the exact preview. Open **Review and fill the empty note**. Both full originals, selected offsets, context, empty before, complete after, added heading/source link and diff are shown literally. No Markdown, folders or journal are written by planning/review, and no additional model is called.
5. The separate confirmation consumes a private one-use ticket. Closing, selection changes, observed vault/cache changes and late reads cannot restore it.
6. After Apply, Operation history offers a separate Undo review. Undo writes `""` to the same existing file; it does not delete the file. Both originals remain untouched.

This is verified copying. Semantic independence remains the user's assessment; an LLM quote does not determine Markdown boundaries. Conditional language, uncertainty, Unicode and the original selected LF/CRLF bytes are preserved. The old generative `ai-atomize-note` command still has its original ID, settings, file creation and source-linking behavior; this operation never invokes it.

## Versioned contracts and identities

`AtomizationPlanV2` in `emptyAtomPlan.ts` has `version: 2` and operation `write_atom_to_empty_note`. V1 objects retain their original read-only meaning and are rejected by the new journal. The extraction validator is shared with v1, but destination validation is independent: v2 never fabricates evidence that a destination is absent.

The plan contains both complete source texts and caches, paths, ctime/mtime/UTF-8 sizes, exact selected/context ranges, unchanged original text, explicit target/heading/source confirmations, exact empty before and full after, analysis/provenance and limitations. The strict journal adds SHA-256 for both sources, empty before and after. Structural validation rebuilds the entire plan and compares its canonical JSON; changing a range, confirmation, analysis, metadata or output invalidates the evidence.

Runtime checks pin actual TFile object references in the current review. Durable evidence contains no WeakMap token. On restart the journal validator independently checks serialized facts; a fresh Undo review binds current TFiles and checks all durable text/stat/cache/resolver evidence. A prior plan or ticket is never permission to write in a new session. Public APIs cannot prove identity against an independent actor recreating identical bytes and timestamps across restart; this is not a filesystem ownership or adversarial cross-process identity guarantee.

Operation ID is SHA-256 of the complete prepared record with `id: ""` and `createdAt: 0`. It is computed before persistence and does not appear inside Markdown, so there is no circular dependency. No operation comment is needed: Undo restores an already existing file's exact empty contents and never claims ownership to delete a file. The only added Markdown is the explicitly confirmed heading, separator and full vault-relative source link.

## Native validation and writer boundary

The target must be a distinct existing TFile, inside permitted vault paths, with exact saved `""`, zero UTF-8 bytes and coherent TFile/adapter ctime, mtime and size. Native cache `{}` and restart bookkeeping `{v:1}` use PR #99's exact empty-note proof: stable identity/stat/cache before and after a full read, adapter rechecks, absent public content/property/link fields and present dependency maps. Missing cache, whitespace, unknown target metadata, properties or concurrent changes refuse. Normal cached notes are not read in full merely to scan the vault.

Both source notes are reread and checked against Relationship Analyzer. The entire inventory, normalized paths/basenames, aliases, known resolved/unresolved links, metadata and source-link resolver are rescanned. Existing target-name references are conservatively refused, even when a particular incoming link might be harmless. Metadata completeness is mandatory.

The durable observation is a SHA-256 of the current canonical inventory/dependency scan, excluding only the target's own expected contents/metadata/outgoing links. It is compared with a **new actual scan**, never used instead of scanning. The journal stores the digest, not the multi-megabyte inventory. All other observations must still agree for Undo; unrelated vault changes can therefore make old Undo unavailable. Completed receipts still release reservations for fresh actions.

The shared plugin owner serializes all seven families. Native checks run during plan construction, before issuing consent, after consent, after the two recovery copies, and immediately before the write. All seven journal families are checked repeatedly; incomplete single/multi operations also reserve their paths for this executor. All affected editors, including clean buffers and popouts, refuse because an equal buffer can still have a queued save.

Only the target reaches `Vault.process()`. Its callback executes the current guards and compares the actual current string to the exact expected before (`""` for Apply, recorded after for Undo). A competing nonempty value is refused without replacement. There is no `Vault.create`, Markdown `DataAdapter.write`, deletion, rename, trash or user-folder creation in this executor. Private journal directories are created only after consent using the existing journal storage conventions.

After the callback, read-only polling waits for native MetadataCache (up to two seconds); it never retries the write. Full bytes, SHA-256, same runtime identities, ctime/mtime/size, both unchanged sources, cache structure and the exact source link must agree before the terminal receipt. Receipt readback and final saved guards must also pass. Failure leaves evidence for manual recovery, not an automatic rollback.

## Seventh journal and recovery

`consolidation-empty-atom-operations/<operation-id>/` stores immutable `record.json`, its full `backup.json`, and append-only UUID receipts (`applied`, `undo_intent`, `undone`). Both full recovery copies are reread before the first `Vault.process()`. Receipts bind the immutable record hash, target ctime/mtime/size and exact content hash. Extra fields, conflicting copies, invalid ranges/hashes, conflicting receipt values and impossible receipt ordering fail strict validation. The six older journal formats are unchanged.

| Observed state after restart | Behavior |
| --- | --- |
| No journal | No action |
| One copy, missing/damaged copy or unknown storage structure | Preserve evidence; local/global reservation according to known scope |
| Two complete copies, no terminal receipt | Reserve participants; manual recovery |
| Target equals after but applied is absent/torn | No automatic Undo, even with exact matching text |
| Intact applied, no intent | Release paths; separately check current Undo eligibility |
| Undo intent without intact undone | Reserve participants; no automatic clearing, retry or cleanup |
| Intact undone | Release paths; file remains empty; repeated Undo unavailable |

Known-path damage blocks participating paths; unknown scope blocks globally. Completed Apply/Undo does not reserve paths forever. Later edits disable old Undo without blocking new actions built from current data. Startup/history never writes or repairs evidence. Two read-back copies provide process-crash evidence, not a claim of fsync, ACID, physical power-loss durability or independent-process locking.

## Scope of evidence

See [native acceptance and limitations](atomization-existing-empty-native.md). Synthetic scripted analysis is not model-quality or semantic-independence evidence. No private vault or paid model is used. Mobile behavior is not claimed from a narrow desktop viewport. Automatic file creation, deletion, backlinks rewriting, source shortening, bulk extraction, settings/version/release changes and legacy rewrites remain outside this change.
