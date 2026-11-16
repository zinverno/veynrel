# R06.2 audit and dependency boundary

Base: `0b834cf84b145b336ecaa275f638ad19f5fffae4`, merged #147.
This first R06.2 increment delivers family exploration and bounded pair selection;
it does not complete canonical-route migration or R06 acceptance.

| Existing surface / owner | Must preserve | This increment | Dependent increment |
| --- | --- | --- | --- |
| WorkbenchView / finite simulation | Semantic-only coordinates, layers, exact paths, camera and Pair Inspector return | Add read-only families, membership context and bounded second-note search without changing physics | Integrate old visual routes after their unique functions move |
| ReviewListView / ReviewFacts / ReviewDecisions | Persisted source-sensitive decisions, list alternative, R05 review | Keep unchanged; no duplicate decision store | Prove identical decision presentation across unified surfaces |
| VaultTopologyController / Topology view | Shared plugin owner, directed links, components, connectors, unresolved occurrences, partial metadata | Retain existing screen and all data | Transfer structural inspector, then redirect route |
| SemanticGlobalMapController / Global Map | Core/connectedness scores and explicit all-document focus | Retain existing screen and score semantics | Preserve global focus inside canonical surface with explicit scope |
| Semantic Neighborhood | Explicit analysis owner, source freshness, own return context | Retain | Migrate to selected-note context with equivalent ownership |
| Connection Opportunities | Validated top-K/link comparison, unknown metadata, ranking | Retain | Route to equivalent contextual candidate list |
| R05 Pair Inspector / Safe Apply | Consent, source checks, journals, supported Undo | Reuse existing mount; selecting a family/pair grants no write authority | No new executor |

## Why split before removing routes

`SemanticGlobalMapController.focus()` explicitly rejects every scoped owner.
Workbench creates scoped owners even for its whole-vault view. Replacing the old
global screen with a route alias would lose its all-document focus operation;
substituting top-K would change its meaning. This requires a separately verified
scope/owner adapter, not an arbitrary call to `focus` on Workbench's controller.

`WorkbenchData.refresh()` combines view-owned semantic/comparison work with the
plugin-owned topology refresh. A general Cancel button cannot dispose the shared
topology owner without affecting other windows. Cancellation and canonical route
integration therefore follow the independently testable family/picker increment.
No old route is disabled here. No family feature changes index, ranking, geometry,
scope policy, generation, writing, or release guards.

## Conservative family projection

Families are tentative local cores derived only from a current validated published
top-K map, never from folder names, tags, link components or unindexed notes.
For each row, keep the neighbors above its unique largest adjacent score drop,
provided the drop is at least 0.05, at least two neighbors remain and at least one
was discarded. Keep only reciprocal retained relationships. A family is a maximal
clique of at least three notes in that bounded graph. A pair, a chain, a lone
bridge, tied/flat neighborhoods and tiny corpora without contrast produce no family.

The score-drop guard is an explicit conservative presentation heuristic, **not** a
calibrated semantic threshold, confidence percentage or guarantee of thematic
meaning. Vocabulary similarity can still mislead. Show actual paths, pair scores,
the grouping rule, revision, coverage and neutral names. Maximal cliques may overlap;
there is no forced assignment or transitive merging. With existing top-K=5, each
vertex has at most five reciprocal neighbors; bounded local subset enumeration
avoids an unbounded general clustering search. IDs encode sorted member paths and
scope identity; evidence revision is separate and invalidates stale selection.

Keep semantic coordinates unchanged on family selection; focus only the camera
on existing points, with exact overview return. No new renderer or simulation.

## Picker boundary

Reuse the scope's actual path inventory; no new file index. Query basename/full
path, render at most 20 results, show the full match count, use native input/buttons
with keyboard navigation. Preserve exact source identity and recheck current scope
and participation on selection. Unknown/excluded policy does not authorize a pair.
Measure the old select and new search on identical 1k/5k/10k fixtures. Preserve
failed cold-start receipts and distinguish host cache readiness from UI cost.

## Still required for full R06.2 / R06

Canonical-route migration, transferred topology/focus detail, full decision parity,
ownership-safe cancellation and final integrated UX acceptance remain dependent
work. Existing Community document-ownership, custom-frame, tooltip, first-pointer,
first-modal and physical GPU/compositor/IME gates are not closed by this increment.
Resume Batch remains a separate prerequisite to public 2.4.0 unless explicitly
deferred. No R07, version/dependency change or publication is included.
