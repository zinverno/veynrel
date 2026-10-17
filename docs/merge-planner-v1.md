# Merge Planner v1 — canonical note and content preservation

**Merge knowledge / Объединить знания** builds a local, read-only preview that
copies explicitly selected whole paragraphs into a user-chosen canonical note.
The complete secondary source stays unchanged, including the copied paragraphs.
Planning itself performs no write, journal mutation or new model call. The checked
result now offers a separate [Merge Apply review](merge-apply-v1.md). Neither link
executor accepts `merge_knowledge`; archiving and deletion remain unavailable.

## Open and review

1. Discover → Potential duplicates → Inspect structure → Analyze relationship.
   The existing analyzer still requires its own explicit request confirmation.
2. After a valid result, choose **Prepare change → Merge knowledge**.
3. Inspect both full saved Markdown sources and the exact paths. Shared, unique
   and contextual fragments are **model hypotheses**, shown with verified quotes.
   Literal quote presence does not prove semantic uniqueness or redundancy.
4. Choose canonical **A or B**; neither is preselected. Manually check the whole
   secondary paragraphs to copy, including their surrounding context and attribution.
   No quote automatically selects or expands a transfer range.
5. Select a specific ordinary paragraph in the canonical note. Review its complete
   text and exact UTF-16 `[start, end)` offsets, then confirm insertion immediately
   after it. This also confirms the blank-line separation and contextual fit.
6. Build the plan. Inspect full canonical before/after, the literal diff, copied
   ranges, every retained part of the secondary source and dependency limitations.
7. Change any choice to discard the result. Switching canonical note also clears
   all transfers and the insertion point. **Decline merge** leaves no plan.

The planner reads saved files, not editor buffers or the inspector's truncated
display preview. It never follows the cursor. Opening, selecting and building do
not send another model request. Reanalysis remains a separate confirmed action.

## Precisely supported content

v1 supports complete ordinary paragraphs identified by Obsidian MetadataCache,
with exact current source text at those offsets. It reuses `paragraphRanges` and
`requirePlainParagraph` from Change Planner instead of parsing Markdown again.
One or several disjoint paragraphs can be selected. They are copied in their
original source order, once each; repeated text elsewhere is never replaced.

Selected text is preserved verbatim. The only generated structure is a blank line
before and between copied blocks, using the canonical note's newline style. The
canonical prefix and suffix are concatenated unchanged: all existing headings,
frontmatter, references, embeds and author wording remain in the preview. Copied
blocks keep their own original line endings. This is a checked text splice, not a
claim of a complete semantic merge or harmlessness in every new context.

The conservative subset refuses:

- Arbitrary substrings, partial paragraphs, overlapping or duplicate ranges.
- Frontmatter, headings, code, lists, tables, block IDs, links, embeds, tags,
  footnotes, URLs, HTML, rich inline syntax or other protected/ambiguous markup.
- Secondary paragraphs under any preceding heading: moving them alone could lose
  that context. Confirmable dependency groups are deliberately deferred.
- Paragraphs immediately adjacent to structured or otherwise protected material,
  which may supply sources, attribution or context.
- Paragraphs intersecting the model's same-side contextual quote. The user cannot
  bypass this with the checkbox; retaining the necessary context needs a later stage.
- Analyses reporting contradiction, version differences, unrelated sources or
  insufficient context, and malformed or unverifiable evidence.
- Missing structural metadata, stale sources, paths, identity or analysis.

The contextual restriction is conservative, not an assertion that other paragraphs
are independent. Every accepted block still requires the user's explicit review
of surrounding prose, attribution and source dependence. Unlabelled text can be
unique, and high similarity never establishes redundancy. Nothing is discarded
from either source to make a merge appear complete.

## Separate in-memory contract

`consolidation/mergePlan.ts` defines the JSON-serializable `MergePlan`, version 1:

- Canonical and secondary exact paths, ctime/mtime/size and content fingerprints;
  complete canonical before/after and complete unchanged secondary Markdown.
- Confirmed transfer ranges with original text, the separately confirmed insertion
  anchor, and one explicit insertion splice with no removed text.
- A contiguous retained-range partition covering **every character** of the
  secondary source, including copied blocks, gaps and unselected content.
- Exact quote hints and their claim IDs, plus provider/model/recommendation
  provenance, the user's canonical choice and model/local limitations.
- Snapshots of native structural metadata, outgoing resolved/unresolved references
  and all available cached incoming paths for both notes.

`stableHash` is only the existing diagnostic fingerprint, not cryptographic evidence
or write authorization. Full content is also compared. `TFile` references are used
only for runtime identity checks, never stored in the returned plan. There is no
new persistent index, settings structure or LLM transport in the planner. Merge
Apply has its own strictly validated recovery journal.

`buildMergePlan` is deterministic and has no IO. `ChangePlannerSession.buildMerge`
reuses the existing pair reader and freshness comparisons: it rereads both complete
sources before building and again before publication, including paths, runtime
identity, ctime/mtime/size, native cache snapshots, outgoing references and public
link-resolution results. Cached incoming summaries are compared across the build.
The original Relationship Analyzer must still be the same valid result; its strict
JSON/evidence validator also rechecks quoted source text.

Any difference invalidates the entire plan. Existing vault/cache events invalidate
without background rereading; selected-source changes also invalidate analysis.
Close, cancel, new analysis, selection changes and generation checks prevent late
publication. Duplicate clicks while loading do not start a second build. The new
view uses `renderPlanDiff` and literal text elements, never Markdown/HTML rendering.
Existing single-file and reciprocal-link plans retain their own executor paths.

## Secondary source and dependency report

The report separately shows model-labelled common/unique/contextual hints and all
retained ranges, marking which were selected for copying. “Not selected” does not
mean “absent from canonical” or “safe to discard.” The complete secondary note,
including attribution and all original links/embeds, remains available unchanged.

Outgoing references reuse the public Obsidian resolver. Incoming paths reuse Pair
Inspector's `resolvedLinks` reader, requesting all available incoming paths for
MergePlan checks. The ordinary inspector still displays at most 100 paths.
This aggregate cannot distinguish incoming links from embeds or certify completeness.
No third-party note bodies are read; missing metadata is shown as unknown. Cache may
lag and has no public content-revision receipt: comparing stable snapshots cannot
prove that already stale cache data is current. External references and semantic
dependencies remain unknown. The UI therefore explicitly prohibits treating the
preview as permission to archive or delete the secondary note.

## Merge Apply and the separate archive boundary

The [copy-only Merge Apply executor](merge-apply-v1.md) revalidates sources,
selected text, identities, editor conflicts and available dependencies before
separate consent and before writing canonical. It has its own operation schema,
the shared execution lock, two verified recovery copies, conditional writes and
explicit Undo. See its [native acceptance report](merge-apply-native.md).

The `add_reciprocal_links` executor cannot execute this contract. Applying a copied
paragraph and then independently archiving a source is not a recoverable logical
merge. Archive identity/path collisions, backlinks and external consumers need
their own explicit decisions. Unknown dependencies cannot silently become zero.
No filesystem atomicity or physical `fsync` guarantee is implied.

Archival/deletion, contradiction resolution, rewriting, atomization, tags and bulk
backlink changes remain outside this workflow. Existing analyzer input bounds
still apply (20,000 UTF-16 units per note, 32,000 per pair); this is not a partial
analysis of larger notes. See [native evidence and automated checks](merge-planner-native.md).
