# R06.1 audit: semantic geometry, candidate policy and navigation ownership

Base: `ad817a3c0e91dcf8a94067d852a22e28226810b5` (PR #146 merged).
This is a bounded first R06 substage, not completion of R06. No R07 work.

## Existing surfaces and migration boundary

| Existing view | Purpose | Duplication | Remains in R06.1 | Later removal / compatibility |
| --- | --- | --- | --- | --- |
| ReviewListView | List-first duplicate/connection review, decisions and R05 Pair Inspector | Optional Workbench has its own candidate owner | List-only entry, exact pair identity, review and decisions | Keep list alternative; share policy with map now |
| WorkbenchView | Scope paths, top-K, directed links, tags, camera, pair review | Other two graph renderers | Candidate canonical map; fix geometry, policy and context | Canonical routing is a dependent substage |
| Topology | Link components, articulation points, unresolved targets, neighbor lists | Separate graph | Existing route and metadata controller | Move unique structural details before redirecting the old entry; retain Health data |
| Global Semantic Map | Core-relative radial layout and explicit all-document selected-note scores | Separate graph and camera | Existing route and validated engine | Retain access to scores when replacing the radial surface; keep old route IDs |
| Semantic Neighborhood | Explicit selected-note analysis, its own source/revision and return route | Another local graph | Existing independent service/route | Integrate note context without implicit model/index work |
| Connection Opportunities | Read-only comparison of current top-K and link metadata | Similar candidate projection | Existing ranking, metadata-unknown guards | Preserve analysis route; no new recommendation engine |

Source review covered the files listed in the R06 request, plus connectionRules,
connectionSelection, Workbench metadata, ReviewFacts, ReviewListView tests, route
lifecycle, native launcher and historical map harnesses. No Graphify artifact is
present in this checkout; imports and actual sources were used. Historical docs
are implementation records, not current acceptance results.

## Confirmed gaps and smallest complete first change

| Existing capability | Gap | Change in R06.1 | Check |
| --- | --- | --- | --- |
| Finite WorkbenchSimulation | Real link edges create springs; link freshness/content is in layout key | Semantic springs only; semantic identity key independent of topology and overlays | Exact coordinate/key controls, native topology refresh |
| Deterministic initial seed | Prior transient physics affects a new revision | Start each changed semantic layout from deterministic seed | Reordered inputs and cold-owner equality |
| Existing connection selection policy | registerHealth bypasses rules for graphical owners | One selection binding in WorkbenchData for graphical and list construction | Same captured policy, unknown/error fail closed, real links retained |
| Existing list/map ownership | Back disposes map and loses camera/filters | Retain a suspended view-local map; dispose on owner/scope teardown | Back/reopen exact camera/query/selection; no hidden RAF |
| Metadata-only display | Unindexed notes participate in layout without an explicit visual distinction | Non-semantic placements labeled; display groups explicitly technical | Missing/partial index and cap native receipts |
| 500 eligible-document cap | No current 5k/10k integrated baseline | Profile distinct synthetic corpora, exact cap and bounded display | Before/after same fixtures, index/compute/display counts |

## Why the remaining R06 work is separate

Removing old screens now would discard topology component/unresolved-target
inspection and global selected-note scores. Their transfer is not a safe route
alias alone. Semantic families also need an independently tested membership
contract: current top-K is policy-filtered, always ranks available neighbors,
and does not establish topic boundaries. Lexical display buckets are not families.
Neither a connected component nor every mutual pair will be renamed a family in
this PR. Explicit cancellation across shared topology versus view-owned semantic
controllers needs ownership tests before a new Cancel action is exposed.

Dependent R06.2 must migrate unique details, redirect legacy routes, provide the
family/overlap and selected-note interaction, and complete the full R06 acceptance
matrix. R06.1 does not remove any route, change ranking/cosine/cap, introduce an
index, grant write authority or change R05/Studio/Recall journals. Review decisions
remain owned by existing ReviewFacts and Pair Inspector. A map is never evidence
of semantic quality, duplicate equivalence or a required link.
