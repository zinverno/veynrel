# Semantic intents and floating editor actions

Base: PR #157, `e097e3e477085f42cee1d058bfe0c90e5bff4265` (open Draft at preflight).

## Existing ownership audit and route contract

`VeynrelHealthView.openSemanticEntry` creates the small typed `SemanticEntry` handoff
(intent, source/pair/family, requested scope, return target). `SemanticScenarioView`
owns presentation and its transient history; `WorkbenchData` owns the existing
per-view projections. `ReviewListView` remains the Findings/legacy review owner.
No new semantic engine, persisted result, or source mutation contract is introduced.

| Entry | First content / action | Existing owner | Actual scope |
|---|---|---|---|
| Map | Similarity / Links graph; explicit refresh; separate cameras | WorkbenchView, scoped semantic map, shared topology | Selected metadata scope |
| Families | Family list, members, overlaps, relationship evidence; map secondary | semanticFamilies(scoped map) | Selected metadata scope |
| Notes and pairs | Explicit distinct A/B; existing Pair Inspector | PairReviewPort | Selected source choices |
| Neighborhood | Explicit source and indexed fragment evidence; explore/back | SemanticNeighborhoodController | Existing whole index |
| Opportunities | Existing comparison categories, link coverage and pair review | ConnectionComparisonController | Existing whole index |
| Global focus | Explicit source; eligible/computed/displayed; full paginated scores | SemanticGlobalMapController.focus | All eligible index documents, existing cap |
| Similar notes | Ranked documents, Open / Compare / Fragments | SemanticNeighborhoodController | Existing whole index |

Card opening and source selection do not run analysis or a model. Explicit refresh
may load an existing local index through its owner; it never builds embeddings.
The global count is document-based, not vector-based. Unknown Markdown metadata
remains unknown. Existing capped global analysis refuses oversized inputs instead
of selecting the first 500. Search/pagination only changes presentation.

Per-view cancellation invalidates late preparation/results; it never cancels shared
topology. A source is a captured TFile identity/path, not a recent note from another
window. Setup returns to the same intent. Pair review and its decisions, freshness,
consent and Apply/Undo remain under the existing owner.

`SemanticScenarioView.test.ts` exercises passive opening, distinct pair handoff,
no-index/source replacement, late A→B preparation, indexed fragments/back, complete
focus pagination, unknown links, and non-ready/cap states. Native receipts and
remaining limitations are recorded separately; these tests do not accept the UX.
