# Archive Eligibility & Planner v1

Open **Consolidation operation history**, then **Review archive eligibility** on
a Merge Apply operation. This is an ephemeral read-only review. It never applies
the proposed mark, writes a journal, calls a model, moves a file, hides a note or
rewrites backlinks. Settings, version and release are unchanged.

## Basis and freshness

The authority is the actual `merge_knowledge_copy` journal, with both validated
recovery copies and completed `applied` receipts. Prepared, recovered without a
receipt, Undo-in-progress, undone, damaged and conflicted operations are refused.
The old MergePlan and the previous model response are not sufficient authority.

Both saved Markdown sources are reread before the preservation review, before
building a plan, and again before publication. Checks include exact paths,
runtime `TFile` identity across reads, creation time, modification time, byte
size, full saved texts, native caches and resolved references. Canonical must
equal the journal's `after`, including the successful receipt's mtime and size;
secondary must equal the saved original including its SHA-256 and all stats.
Later text edits, even if subsequently reverted with a new mtime, require new
analysis and a new successful Merge Apply. There is no override based on model
opinion or an old user selection.

The read-only basis check shares the existing service lock and checks scoped and
global journal blockers. Unrelated known journal participants are not reread for
blocker checks; overlapping multi-file journal participants can be inspected by
the existing conflict check. Editors for the selected sources must be closed,
including popout, as required by the existing saved-source guard. No execution
ticket is issued. Source/cache events invalidate the complete review; cancellation,
selection changes and closing revoke published plans and pending results.

The provenance digest is calculated **before** final journal revalidation.
There is no asynchronous hash operation after the last completed-journal check.
This is current observed evidence, not a filesystem transaction or continuous
watch on hidden journal files. Opening/building always rereads journal evidence;
a displayed plan has no execution authority.

## Preservation review

Exact copied paragraphs come from the validated journal transfer ranges.
Their complement is split at available native section boundaries. Every
non-whitespace character outside the copied ranges belongs to an explicit
remaining fragment, including headings, YAML, examples, lists and unknown
sections. Missing section entries cannot drop text. Separator whitespace remains
in the full source and is not presented as semantic content needing a decision.
Each fragment shows its literal text, offsets and adjacent source context;
both full notes remain available for longer context.

Every remaining fragment requires one explicit decision:

- **Already represented in canonical** — a user judgment, not a proof.
- **Intentionally kept only in secondary** — permitted for an in-place mark
  because the original remains available with all its content and links.
- **Needs further consolidation** — blocks the plan.

Nothing is preselected or automatically classified as redundant. Status and
limitations also need explicit confirmation. Successful copying does not prove
semantic completeness. The journal does not retain the full original analysis,
so earlier semantic warnings cannot be declared resolved. Contradictions,
versions, attribution, headings, examples and unknown dependencies remain explicit
limitations. There is no new LLM session.

## Dependencies

Both notes show their cached outgoing links, embeds and frontmatter links,
including unresolved targets. Known incoming source paths come from the native
resolved-link map; only those sources' caches are consulted to identify links,
embeds and property links. Their Markdown is not searched or loaded for this
dependency view. Missing caches and unmatched counts remain unknown. All known
incoming paths are included, not only the inspector's first hundred.

Cache metadata may lag, and external or semantic consumers may be absent from
it. “None detected” never establishes absence of consumers. Changes to available
dependencies between review, build and publication invalidate the result.

## ArchivePlan and YAML

`ArchivePlan` has its own `archive_in_place_plan` discriminator. It contains exact
secondary before/after and insertion, unchanged canonical text/path/identity,
Merge Apply ID/operation/time/record SHA-256/successful receipt, copied ranges,
remaining ranges with context and explicit dispositions, selected `archived`
status, dependency observations and acknowledged limitations. It can be inspected
as JSON in the preview. It has no executor and no persisted store.

The only proposed change is two namespaced frontmatter text properties:

```yaml
veynrel_archive_status: archived
veynrel_canonical: "[[Folder/Canonical]]"
```

Flat properties work with Obsidian's normal Properties interface; its
[documentation](https://obsidian.md/help/properties) directs users to source mode
for nested properties. The quoted canonical wikilink follows the documented text
property format. No property-type configuration is written.

For notes without YAML, a new frontmatter prefix is proposed. Existing YAML gets
only a literal insertion immediately before its closing delimiter. No existing
character is removed or reserialized; the body, links, comments and line endings
remain exact. Native `parseYaml` validates the mapping and the proposed extension,
and the original parsed properties must agree with MetadataCache. Common nested
mappings, lists and block scalars are supported.

Existing `veynrel`, `veynrel_*` or `veynrel-*` properties (case-insensitive) conflict.
Ambiguous/malformed delimiters, BOM, duplicate keys, quoted or unusual top-level
keys, directives, anchors, aliases, tags and tabs are conservatively refused.
Canonical paths must resolve unambiguously and be safely representable as a
wikilink. There is no fallback that serializes all frontmatter.

The preview displays full before/after, a line diff and serializable provenance.
The exact text/insertion is authoritative for CRLF; the shared line diff is a
human-readable presentation. There is **no Apply button**, mark application,
archive Undo, deletion, relocation, hiding, tag change or backlink rewrite.

## Verification

`archivePlan.test.ts` exercises source/journal freshness, every-fragment review,
literal Unicode/CRLF/YAML preservation, incoming kinds and unknown dependencies,
delayed results, selection changes and cancellation. `archivePlannerModal.test.ts`
checks both languages, full text/diff/JSON, explicit controls and event cleanup.
`mergeApply.test.ts` includes actual journal-copy validation, all journal-family
conflicts and faults injected during provenance hashing and between receipt and
native source reads. Mutation/model spies remain zero during archive planning.

See [native acceptance](archive-planner-native.md) for the isolated real-Obsidian
run, screenshots, exact build hashes and platform limits.
