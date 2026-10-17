# Change Planner v1 — read-only Markdown planning

The [Relationship Analyzer](relationship-analyzer-v1.md) can now lead to a concrete
**local plan**, with full saved before/after text and a text-only diff. Nothing
writes Markdown, applies a proposal, persists the plan or makes another model call.
Applying is now a separate [Safe Apply & Undo](safe-apply-undo-v1.md) review.
Two reciprocal links can now be previewed as one [multi-file plan](multi-file-planner-v1.md);
that combined plan has no Apply or Undo implementation.
Planning has no Companion connection, background scan, new setting or release/version change.

## Open and choose

1. **Discover → Potential duplicates → Inspect structure → Analyze relationship**.
   Existing analysis still requires inspecting and confirming its exact request.
2. After a valid result, choose **Prepare change** / **Подготовить изменение**.
   This explicitly rereads only the two selected saved notes, locally.
3. Choose the source (A or B), action, and a **specific whole paragraph** from
   Obsidian's MetadataCache. No paragraph is selected automatically. Inspect the
   complete saved source and the full selected text with exact `[start, end)`
   UTF-16 offsets. These are offsets into saved Markdown, including CRLF characters,
   not rendered-text indices. The range is not inferred from a model quotation.
4. Confirm the exact insertion location or replacement range, then **Build local
   plan**. Both sources are reread and revalidated before construction.
5. Review paths, full before/after text and the diff. File identity, existing
   connections, model provenance and recommendation reason are in the expandable
   evidence section. Original notes can still be opened with the inspector's controls.
   Changing any choice drops the old plan and range confirmation.
6. **Make no change** is a valid result with identical before/after and no diff.
   **Discard plan**, refresh, reanalysis or close clears transient state.

RU: план существует только в этом окне. Обычная ссылка добавляется в конец **выбранного
абзаца**, не автоматически в конец файла. Для встраивания пользователь проверяет весь
заменяемый абзац и подтверждает точные границы. «Ничего не менять» — полноценный исход.

## What can be planned precisely

| Choice | Local construction and conditions |
| --- | --- |
| Ordinary A→B or B→A link | Append one space and `[[full/vault/path]]` immediately after the chosen plain paragraph. No heading or link-only section is generated. |
| Embed B in A or A in B | Replace exactly one manually selected plain paragraph with `![[full/vault/path]]`. Only the direction offered by the primary or alternative model recommendation is available. |
| No change | Preserve the complete source; no insertion, removal or diff. |

Full vault-relative target paths preserve language, case, spaces and homonyms.
`MetadataCache.getFirstLinkpathDest` must resolve the exact generated link token to
that target from the actual source. v1 deliberately generates wikilinks, independent
of Obsidian's preferred new-link syntax; it does not change that preference.
Paths containing wiki delimiters, fragments, block markers, backslashes or control
characters are refused instead of guessing escaping. Existing normal links,
embeds and frontmatter links to the same target (including heading/block links)
block another connection. Only the selected sources' caches are consulted.

Embeds additionally require a supported overlap relation, a shared quote cited by
that recommendation inside the user-selected paragraph, and explicit review of the
**whole** range. A quote is supporting evidence, never an automatic deletion range
or proof that the entire paragraph is redundant. Any intersecting `unique_*`,
`context_*` or `standalone_*` claim for that source blocks replacement. A contextual
example in another paragraph remains byte-for-byte in the proposed result.

The native paragraph boundary and protected cache positions are checked. Frontmatter,
code, headings, lists, tables, block IDs, links, embeds, tags, footnotes and ambiguous
markup are not editable locations. A conservative syntax guard also refuses rich
inline markup, URLs, HTML, comment markers and suspicious line prefixes even if
cache data claims the selection is a paragraph. This is a deliberately small
supported subset, not a new Markdown parser. Empty notes, arbitrary character
ranges and multi-paragraph replacement are deferred. User confirmation is still
needed for unreported context or sources that structural checks cannot identify.

A target embedding its source is a direct-cycle refusal. **Any other target embed
also blocks embedding**, including unresolved transclusions: v1 cannot establish
transitive safety without a separately scoped dependency review. This conservatism
avoids a hidden vault scan. No embedded content is loaded or treated as authored
source text.

## Contract, reuse and freshness

- `consolidation/changePlan.ts` defines `ChangePlan` and a synchronous builder.
  The plan includes operation, exact paths, both complete saved snapshots,
  runtime file identities, size/mtime and diagnostic fingerprints, selected range,
  one exact splice (removed/inserted text), full proposed Markdown, preserved and
  added links, model origin/provider/model/reason/evidence references, the user's
  operation, model limitations and explicit local limitation codes. Hashes use the
  existing non-cryptographic `stableHash`; full content and file identity are also
  compared. A hash alone is never authorization or a freshness check.
- `ChangePlannerSession` separates lifecycle from presentation. Its dependencies
  only supply current analysis and selected-file reads: no write, network or apply
  port. Generation checks reject late reads after cancel/close/invalidation;
  busy states prevent double construction.
- `savedNote.ts` remains the canonical-path/native `TFile`/saved Markdown owner.
  The same exact snapshot comparison is reused by Relationship Analyzer. The
  planner also checks both live file identities/stats after the paired read.
  Relationship Analyzer retains successful source evidence only for its current
  in-memory result; a new analysis, dismissal, settings change or close removes it.
- Existing Pair Inspector vault/metadata listeners invalidate plans without reads
  or automatic work. Any vault create/modify/delete/rename can change link
  resolution, so it invalidates the plan; selected-source changes also invalidate
  the model result. Metadata changes/resolution invalidate the plan, not the model
  classification. Settings changes invalidate the originating analysis and plan.
- Metadata, resolved references and generated tokens are snapshotted at preparation
  and checked again at build. MetadataCache has no public saved-content revision
  receipt: updates can lag, so structural checks are **not** a proof of complete
  dependency coverage or permission to write. Unsaved editor buffers are excluded.
- `proposals/diff.ts` and existing diff styles are reused. The planner does not import
  `ProposalApplication`, `ProposalReviewModal` or Companion. Diff rows and all
  source/model text use literal text nodes, never HTML or Markdown rendering.
  Diffs page at 200 lines with an explicit total; complete before/after remain
  available. Original line endings and all text outside the exact splice survive.

The analyzer's existing whole-input bounds still apply (20,000 UTF-16 units per
note, 32,000 per pair); the inspector's truncated preview is never a planning input.
No model requests occur when opening, choosing or building a plan. Reanalysis is
still a separately confirmed, possibly paid operation.

## Verification

Synthetic fixture: `tests/fixtures/change-planner.json`. Contract, adapter, lifecycle
and RU/EN UI tests cover bidirectional links, homonyms, selected offsets, duplicate
text occurrences, CRLF, context preservation, existing connections, invalid ranges,
protected structures, target cycles/dependencies, missing/changed files, settings,
cancellation/close/double clicks, no-change and zero network/write boundaries.
Existing Pair Inspector, Relationship Analyzer, Taxonomy, Tag Recommendations and
Decisions remain in the full test suite. Fake completion dependencies only; this
is not a real-model quality assessment.

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`,
`npm run audit:proposals`, `git diff --check`. Native evidence and screenshots:
[Change Planner native report](change-planner-native.md).

## Separate application and deferred operations

[Safe Apply & Undo v1](safe-apply-undo-v1.md) now implements a separate final review,
checked single-file writes, a persistent recovery journal and guarded undo. The
planner itself remains pure and read-only; a plan is not write authorization.

Merge, unique-content relocation, atom creation, tags, mass incoming-link rewrites,
delete/archive and LLM editing still have no generated diff. They require a later
implementation, not an enabled-looking placeholder operation. Semantic preservation
remains unproven by structural checks.
