# Semantic routing — deferred

Baseline inspected: PR #156, `8870ffc8171199c971a60646761494cab0244eff`.
This follow-up changes presentation only. The owner reports that different entries converge; the new panels do not resolve that issue.

| Entry | Existing callback in VeynrelHealthView | Current destination |
| --- | --- | --- |
| Search | `semantic.openSearch(query)` | Existing consent-aware search modal and results; full configured index, no new folder promise |
| Map | `navigate({page:"discover"}); workbench?.openSemanticMap(false)` | Review workbench map, `surface="similarity"`, families closed; topology remains available inside the workbench |
| Families | `navigate({page:"discover"}); workbench?.openSemanticMap(true)` | Same similarity map, families open |
| Notes and pairs | `navigate({page:"discover"})` | Existing review list; choose notes/pairs and open Pair Inspector |
| Neighborhood | `navigate({page:"semantic-neighborhood"})` | With session owners, redirected to discover + `openMap("semantic-neighborhood")`; otherwise existing neighborhood renderer |
| Opportunities | `navigate({page:"connection-opportunities"})` | With global session owner, discover + `openMap("connection-opportunities")`; otherwise existing connection comparison renderer |
| Global focus | `navigate({page:"semantic-map"})` | With global session owner, discover + `openMap("semantic-map")`; otherwise existing global-map renderer; existing all-document scope/limits remain authoritative |
| Similar notes | `semantic?.openSimilarNotes()` | Existing similar-notes owner; disabled unless the semantic snapshot is ready |

Trace: `health/ui/VeynrelHealthView.ts` semantic branch and route redirects; `health/workbench/reviewListView.ts` `openMap`/`openSemanticMap`; `health/workbench/workbenchView.ts` `showSemantic`/inspector dispatch.

Follow-up issue: define intended entry state and selection for each panel, especially Map versus Families and shared inspector routes; reproduce in ready/unavailable index, missing selection, folder scope and popout. Decide intended destinations with the owner before changing callbacks. Verify actual all-document focus, never substitute top-K; preserve families, Pair Inspector, computation limits and session ownership. This PR makes no routing-fix claim.

The dependent implementation records the seven [entry contracts](../semantic-floating/contract.md) and their [native verification](../semantic-floating/verification.md).
