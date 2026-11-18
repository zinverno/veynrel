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

## Captured editor actions

`runAIStream` is not the new Style launcher: it writes directly while streaming and
can obtain the selection after asynchronous UI. `floating/editorSource.ts` instead
captures the originating document/window/leaf/view/editor, TFile identity/path,
mode, ranges, full buffer, exact range and file revision before focus leaves it.
The transient context is never saved to settings or logs. Source identity, open
view, buffer, mode, settings and lifecycle are checked before request and Apply.

| Action | Material / mode | Owner and consent | Write / Undo |
|---|---|---|---|
| Style | One captured selection, otherwise explicitly whole note; editing mode | Narrow StyleSession, existing buffered `callOpenRouter`, existing style prompt/limits; checkbox + Create draft | Preview first; exact buffer/range guard; one native CM6 transaction, double-Apply fence; native Undo/Redo |
| Recall | Exact captured selection or explicitly whole note; editing mode; existing saved-buffer guards | RecallAuthoringAdapter captured handoff, existing options/prompts and generate+append consent | Existing insertion + queue refresh; native Undo/Redo; no new mandatory preview |
| Tag | Exact saved TFile, whole file; reading/editing entry allowed | Existing R05 LocalNoteModal; open-editor refusal remains | Existing Review/Apply/Undo; toolbar never closes or saves the editor |
| Atomization | Exact saved TFile, whole file regardless of selection | Existing GenerativeAtomizationModal and consent | Its existing proposal/write guarantees, no invented common Undo |
| Search | Existing full-index query, reading/editing entry allowed | Existing consent-aware search; empty editable field; no index goes to existing settings | No source writes; initial selection is deliberately not submitted |

Style uses existing pure Markdown preservation guards (Studio stays disabled),
checks YAML/link/code preservation, and does not claim semantic equivalence.
The complete selected material is sent only on Create draft, never truncated.
A saved-format read at that explicit stage rejects CRLF and normalized BOM:
Obsidian 1.13.7 normalizes CRLF on native editor save. This is an explicit unsupported
format, not a byte-preservation claim; the original failing native check is retained.
LF Unicode selection/whole-note Apply uses native Undo and preserves the surrounding
buffer. Host autosave is separate from plugin writes; Style never forces a save.

Panel enablement and normalized x/y position use the existing settings queue only
after movement ends. One DOM root belongs to each Obsidian document, including
popouts. Grip-only pointer capture and keyboard movement keep selection; the panel
clamps to the central workspace below tabs and above the status bar. Modal presence
makes it inert/hidden. Dispose cancels owned drafts and removes listeners/observers;
it does not cancel shared semantic topology. No default hotkey is assigned.
