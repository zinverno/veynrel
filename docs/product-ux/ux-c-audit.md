# UX-C — structure without embeddings

Base: UX-B `db99a71181b4de50675c18160c96fafde2e76cad` (draft #153), stacked on UX-A #152 and functional #151. Public metadata and release policy remain unchanged.

| Existing surface / capability | New location | Preserved owner | Change |
| --- | --- | --- | --- |
| Workbench semantic canvas | Notes → Map → Similarity | WorkbenchData, validated semantic controllers, WorkbenchSimulation | Explicit mode; no canvas pretending to be a computed map when unavailable |
| Topology facts and deterministic layout | Notes → Map → Structure; structural inspector | Plugin-owned VaultTopologyController, deriveTopology, layoutTopology | Reuse layout in the existing Workbench renderer; no second graph or scanner |
| Links, components, connectors, unresolved targets | Selected note and structural details | Current topology snapshot | Scope-visible links; whole-vault computation disclosed; isolation only with complete, current metadata |
| Families / top-K / all-document focus | Similarity and existing contextual inspectors | Existing semantic owners | Preserve mathematics, revision guards, scope and explicit computation |
| Note list, selection and R05 handoffs | Notes; selected map node | ReviewListView, existing operations | Keep bounded search, decisions, Review/consent/Undo |
| Semantic setup | Explicit settings action from unavailable Similarity | Existing plugin settings/index flow | No implicit embeddings or note transmission |
| View cancellation / shared refresh | Existing owners | WorkbenchData versus shared topology | Closing one view cannot cancel shared topology |

Structure uses existing BFS/component packing, not semantic coordinates. Similarity keeps its finite semantic-only physics. Separate camera state prevents mode changes from overwriting the other view. Layer/search/tag changes do not rebuild either layout. Technical display groups remain explicitly technical; the semantic cap stays 500.

Reach: WorkbenchView/Graph, their UI tests and native map callers; translations and scoped CSS; synthetic captures and benchmarks. No write executor, journal, stored decision, index, dependency or version changes. Structural refresh is an explicit metadata-only request; passive navigation remains read-only and does not refresh.

Baseline on UX-B: `map 120` failed on the known host tooltip `TypeError: e.isShown is not a function`; raw failed receipt retained independently. This is not a UX-C regression or a closed gate.
