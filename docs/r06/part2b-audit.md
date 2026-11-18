# R06.2b — integration audit

Base: `2d261dafaca539366dfc2e2ecc2e9fff8a9f90d3` (merged #150). No changes to R06.1 geometry or R06.2a families.

| Surface / owner | Scope and freshness | Unique function / transitions | Cancellation and decisions | Integration boundary |
|---|---|---|---|---|
| Workbench / view-owned `WorkbenchData` | Explicit folder paths, semantic/index + topology revisions, existing participation rules | Semantic-only coordinates, families, tags, exact-path picker, Pair Inspector and Back | View owns semantic/comparison/duplicate work; R05 owns consent, writes, history and Undo | Keep renderer and geometry. Add secondary inspectors, never a second graph |
| Topology / plugin-owned `VaultTopologyController` | Whole vault metadata, `LocalVaultRevision`, complete/partial; stale on host events | Directed links, components, articulation connectors, unresolved targets, per-note structural inspector and bounded path search | Shared refresh is joined by windows; only plugin disposal may abort it. No decisions or Markdown writes | Reuse existing inspector/metrics without its graph. Folder selection cannot change global component semantics |
| Global semantic / `SemanticGlobalMapController` | All eligible documents of existing index, cap 500, exact index revision | Core/connectedness, top-K, explicit **all-document** focus scores and bounded search | New independent view session; late results rejected on cancellation/dispose. No writes | A scoped owner rejects focus: create an unscoped session on the same engine. Do not substitute scoped top-K or change cosine/ranking |
| Neighborhood / `SemanticNeighborhoodController` | Selected indexed source against existing index; current catalog and result revisions | Saved fragment evidence, source search, explore another neighbor | Independent view session; publication cancellation, no preemption of synchronous engine work. No writes/consent | Reuse evidence renderer without radial graph; explicit load only |
| Opportunities / `ConnectionComparisonController` | Semantic + topology published revisions; global legacy versus scoped Workbench participation are different contracts | Candidate/aligned/explicit-only, directions, ranks, shared neighbors, coverage and session annotations | Comparison does not own topology. Legacy annotations are transient, **not** persisted Pair Decisions | Preserve global comparison inside explicit global inspector; do not silently replace it with the scoped candidate list |
| Review list / `ReviewListView`, `ReviewFacts`, `ReviewDecisionsPort` | Scoped candidates; kept decisions additionally verify saved source signatures | New/reviewed queues, restore, source/history facts, Pair Inspector | Existing plugin decision store; `ReviewFacts` may read saved Markdown for explicit review | Never start saved-source verification merely by opening the map. Keep list-only route and R05 owner |

## Implementation and acceptance order

1. Independent global/neighborhood sessions and safe cancellation; shared topology remains plugin-owned.
2. Reuse the existing non-graph inspectors inside Workbench with explicit global scope, preserving their state across Pair Inspector and Back. Move context out of overlays over the graph.
3. Migrate visual entry points only after inspector parity is verified. Preserve fallbacks where required capabilities are absent. Preserve commands, Review list and its durable decisions.
4. Contract/unit tests, native parity and lifecycle, then the full validation suite. Record any incomplete parity separately; do not claim all R06 complete.

## Non-transferable by route alias alone

Global focus, global comparison and global topology statistics cannot inherit the selected folder scope. Shared topology cannot be cancelled by a view. Neighborhood fragment evidence is not equivalent to Workbench top-K. A kept Pair Decision cannot be inferred from paths alone: its source fingerprints need verification. Existing synchronous focus/neighborhood calculations can reject late publication but cannot be interrupted mid-JavaScript operation. These boundaries require explicit ownership/UI contracts rather than replacing route names.

No embeddings, new semantic heuristics, Markdown mutation authority, journal format, dependency, public metadata or release-policy change is authorized here. Old failed receipts and host gates remain intact.
