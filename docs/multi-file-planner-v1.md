# Multi-file Change Planner v1

**Link both notes** / **Связать обе заметки** builds one local, in-memory plan for
two reciprocal ordinary links. Both saved Markdown sources remain unchanged.
There is no multi-file Apply control, executor, journal entry, background work,
additional LLM request, setting or release change.

## Open and review

1. Discover → Potential duplicates → Inspect structure → Analyze relationship.
   The existing Relationship Analyzer still requires its own request confirmation.
2. After a valid result, choose **Prepare change**, then **Link both notes**.
3. Review the full paths A and B. Choose one ordinary paragraph in each note,
   inspect its full text and exact UTF-16 `[start, end)` range, and confirm each
   insertion location separately. Nothing follows the editor cursor or a model quote.
4. Choose **Build combined plan**. One space and a full-path wikilink are proposed
   immediately after each selected paragraph, preserving the rest of both sources.
5. Review the common summary, original model recommendation, user-selected action,
   and each note's complete before/after text, identity, range, links and separate
   diff. Text is literal: HTML, Markdown and embeds are never executed in the preview.
6. Change either selection to discard the entire preview and both confirmations.
   Cancel, reanalysis, source changes or closing the inspector also discard it.
   Refreshing requires explicit selections again, never substitute paragraphs.

The model's recommendation is preliminary. Choosing reciprocal links is the user's
action, not a claim that the model proved both links useful. A failed side produces
one refusal with a reason; the other side is never published as a successful plan.
Existing directional links, embeds or frontmatter links block duplicate connections,
even if only one of the two directions already exists.

## One serializable contract, two reused validations

`consolidation/multiFilePlan.ts` defines `MultiFilePlan` schema version 1. Its only
operation is `add_reciprocal_links`, with exactly two distinct existing participants
and exactly one `modify` edit per file. Each entry includes:

- Exact vault-relative path and captured ctime, mtime and byte size.
- Complete saved `before`, proposed `after`, and a diagnostic content fingerprint.
- An exact insertion splice (`start`, `end`, `removed`, `inserted`) and the separately
  confirmed paragraph range/text.
- Added link, target path and preserved resolved/unresolved references.

The whole plan also contains two directed link dependencies, original analysis
provider/model/recommendation, the user's operation and explicit limitations.
Every returned field is JSON-serializable; no `TFile`, metadata cache or callback is
stored in the plan. Live `TFile` identity is checked during planning. The existing
non-cryptographic `stableHash` is only a diagnostic: full content is compared as well;
this fingerprint is not a durable identity receipt or write authorization.

The file-entry discriminator leaves a clear boundary for future schema changes.
v1 does **not** admit create, archive, relocate, merge or tag edits. Unsupported
operations are rejected, not rendered as a ready diff. Refusals reuse typed
`ChangePlanError` reason codes, with a side when known.

Each direction calls existing `buildChangePlan` with `add_link`, its exact user
selection and the corresponding resolver-checked link token. This reuses native
paragraph boundaries, protected-region checks, conservative inline syntax guards,
existing-link detection and exact string slicing. It does not duplicate the parser
or replace every occurrence of repeated text. Paths with Cyrillic, spaces and
homonymous filenames stay distinct; noncanonical or ambiguous paths/tokens fail.

`ChangePlannerSession` retains its existing single-file path. Its new combined path
reads only the two selected files at preparation, reads them again before building,
and reads them a third time before publishing. It compares both full contents,
paths, runtime identities, ctime/mtime/size, cloned MetadataCache, resolved references
and public `getFirstLinkpathDest` results. Both selected ranges are checked against
the complete saved sources. The originating Relationship Analyzer must remain the
same valid result, including its model settings.

Any mismatch drops the whole plan. Existing inspector file/cache listeners invalidate
without scanning or rereading automatically. Selected-source changes also invalidate
the analysis and close the planner. Generation checks reject late results after
close/cancel/new analysis/selection changes; duplicate clicks while loading do no
additional work. `renderMultiFilePlanner` accepts no Safe Apply callback and reuses
`renderPlanDiff` for both notes. Diff paging does not truncate the full before/after.

## Why two Safe Apply calls are not a multi-file operation

The old executor and journal remain unchanged. The combined result is never exposed
as a single-file `plan`, never sent to `SafeApplyService`, and never persisted. Two
sequential single-file Apply calls could leave only one link written after failure;
they do not share a commit decision, recovery evidence or compensating undo.

A future executor must accept the **whole** `MultiFilePlan` as one logical unit and
provide a separate final user review. It needs a shared operation ID, durable
validated backups for every participant before the first write, per-file progress,
conditional writes, explicit partial-execution recovery and guarded compensating
undo. It must recheck sources, cryptographic evidence, links, open editor buffers,
blockers and dependencies, and preserve later user edits. No filesystem atomicity,
exactly-once or physical `fsync` guarantee follows from this planning contract.

## Limits and next stages

MetadataCache may lag saved content and has no public revision receipt. Local checks
are not a proof of full dependency coverage or semantic preservation. Only saved
Markdown is used; unsaved buffers and third-party notes are not read. The existing
Relationship Analyzer whole-input bounds still apply (20,000 UTF-16 units per note,
32,000 per pair). Empty notes or notes without supported plain paragraphs refuse
planning. There is no new vault scan, provider call or persistent plan inventory.

Merge & Atomization still need explicit content boundaries, new-file identity and
collision rules, information-preservation review, dependency/backlink handling and
a multi-file recovery protocol. None of those actions, tag changes, embed replacements
in a combined plan, or automatic conflict merges are implemented here.

## Verification

`multiFilePlan.test.ts` covers contract, two-sided refusals, paths, protected regions,
content preservation, both freshness phases, analysis lifecycle and zero-write/network
ports. `multiFilePlannerView.test.ts` covers independent confirmation, literal RU/EN
rendering, selection reset and the unchanged single-file review path. The fixture is
synthetic and the Relationship Analyzer transport is fake; this is not model quality
evaluation. See [native results and screenshots](multi-file-planner-native.md).
