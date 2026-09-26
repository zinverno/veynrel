# Vault topology

Topology is an explicit, local view of actual Markdown link relationships. Health
points to issues; topology makes structure visible; Findings remain the existing
action surface. It is not Obsidian Graph View replacement or a Health analyzer.
Semantic neighborhoods belong to a future, separate Discover contract.

## Source and loading boundary

`ObsidianLocalVaultSource.captureMetadata()` uses the same private inventory and
`captureLinks()` resolver as Local Health. Health's full `capture()` is unchanged.
The metadata path enumerates Markdown files, inspects their metadata caches, and
never calls `vault.read`, `cachedRead`, storage, a semantic index, or a provider.
A second metadata-free inventory verifies the captured revision before publication.

Opening Health or starting the plugin constructs no graph and enumerates no notes
for topology. The unobtrusive **Load map** action starts the first capture.
**Refresh map** is also explicit. Neither navigation nor vault events reload it.
There are no credentials, remote resources, network calls, embeddings or AI.

The shared scope preserves vault-relative canonical paths, Markdown inclusion,
the active `Vault.configDir` exclusion and root `.ai-backup`/`.ai-backup-*`
exclusions. Nested backup-like folders and templates retain Local Health's policy.
The source's optional additional scope can narrow the same inventory. The product
uses the same default scope as Local Health.

Links, embeds, frontmatter links and reference links come from Obsidian's cache.
URI schemes and protocol-relative URLs are external. `parseLinktext()` strips
subpaths for `getFirstLinkpathDest(linkpath, sourcePath)`. Subpath-only references,
resolved attachments, excluded destinations and self-links do not form edges.
Duplicate identical directed links collapse. No tags, folders, filename similarity,
Findings, or inferred relationships create nodes or edges.

## Product contract and ownership

`VaultTopologyPort` provides cached `getSnapshot()`, `subscribe()`, `load()`,
`refresh()` and `dispose()`. `VaultTopologyController` belongs to the plugin session,
not `HealthService` or an individual view. `registerHealth()` injects the same
controller into each existing `VeynrelHealthView`. Closing a view releases its
subscription/pointer handlers; the plugin retains the map for other/reopened views.
Plugin disposal aborts the operation, removes event listeners and clears the map.

State is `idle`, `loading`, `ready`, `stale` or `error`. The validated, deeply frozen
map contains its local revision, capture time, completeness, nodes, directed edges,
broken targets, components and exact derived counts. Node metadata is limited to
path, basename, safe hashed ID, incoming/outgoing/directed degree, component ID,
link-cache coverage, orphan/connector classifications and unresolved counts.
There are no bodies, snippets, frontmatter bodies, summaries or embeddings.

Edges retain `source → target` vault paths. `A → B` and `B → A` remain two edges.
Degree is incoming plus outgoing; a reciprocal neighbor contributes twice. The
renderer collapses reciprocal pairs to one line with an explicit `reciprocal`
flag. The summary's internal-link count remains the directed count.

Weak components use incoming ∪ outgoing neighbors. An iterative Tarjan traversal
computes components and articulation points without a recursive call-stack limit.
Components are ordered by descending member count, then their first canonical path,
matching the existing analyzer's deterministic primary selection. Singleton
components remain in topology. A connector is an articulation point: removing it
increases the component count within its connected component. Connectors do not
create Findings or affect Health. Optional bridge-edge classification is deferred.

Broken targets are separate from real note nodes. Exact trimmed target strings
(including subpaths) aggregate sources and occurrence counts. They retain the
existing maximum 4096-character target validation and use stable hashed IDs.
Repeated occurrences remain counts, not duplicate note edges. Default geometry
contains only resolved note relationships; unresolved targets appear in the
selected-note inspector. No global broken-target overlay is included.

## Coverage and freshness

A null/failed cache is unavailable, not an empty cache. Only available metadata
contributes outgoing edges or unresolved targets. Any missing link coverage marks
the map **Partial**. Known edges and unresolved occurrences remain factual observed
data; incoming/outgoing degree and components may be incomplete. Components are
labelled **Observed components**, including observed singleton components.

Trusted orphan classification requires a complete graph and incoming = outgoing =
0, exactly like the existing orphan analyzer. Missing metadata anywhere could
supply an incoming edge elsewhere. Therefore **all** orphan and connector
classifications are withheld on a partial map; their summary counts are `undefined`
and displayed as **Unknown**, not zero. Zero-degree nodes use a dotted unknown
style. Complete-map orphans are hollow circles. Component size in a partial
inspector is explicitly an observed size. Missing cache metadata does not invent
broken targets; the inspector's unresolved counts for that note are also unknown.

Revision uses the existing canonical `(path, mtime)` inventory signature and
complete-enumeration rule. After metadata capture and derivation, the controller
captures revision again. A mismatch or event during the operation discards the
new graph and displays: **Vault changed while the map was being built. Refresh the
map.** A previously loaded map may remain visibly stale; a rejected first capture
publishes no map. Incomplete inventory cannot establish freshness.

Plugin-lifetime vault create/delete/rename/modify events for in-scope Markdown,
metadata `changed`, and conservative global link-resolution completion mark a
loaded map stale. No event starts work. The event counter also catches metadata
changes that do not alter mtimes during a load.

Concurrent Load/Refresh calls return the same owned promise; disabled buttons
reflect loading. This milestone coalesces rather than supersedes an in-flight
capture. A new explicit refresh can begin after completion. Abort and epoch guards
prevent disposal or an abort-ignoring source from publishing late results.
Errors use bounded localized copy and permit retry; raw exceptions are not shown.

There is no topology file, settings schema, durable route or layout persistence.
Restarting Obsidian returns topology to idle.

## Layout and rendering

The layout uses canonically ordered weak components, the highest-degree root
(path tie-break), BFS levels arranged on radial rings, and deterministic shelf
packing. Component region area scales with its member count, so the primary
component gets the largest region. Observed singleton nodes occupy a separate
stable grid. Geometry is normalized inside `[0, 1000] × [0, 1000]`; empty and
one-note maps have finite bounds. Coordinates never imply folder membership.

Traversal is O(V + E), with canonical sorting bounded by O((V + E) log V).
Layout uses adjacency lists and linear BFS, sorting levels/members and packing
rectangles. There is no whole-vault pairwise repulsion, random seed, continuous
physics, animation loop, Canvas, WebGL or graph dependency. Long sparse components
can have compressed rings/tails; the inspector/search preserve every relationship.
This is deterministic structural exploration, not an organic force layout.

Node radius encodes actual directed degree with `4 + min(4, sqrt(degree))`, scaled
with the layout and capped at 10 normalized units. Orphans are hollow, uncertain
zero-degree notes dotted, and connectors have an outer ring. Selection uses the
theme accent and an outline. Selected incoming lines are dashed, outgoing lines
solid and reciprocal lines double-width. Component boundaries and quiet edge ink
use theme variables. No arbitrary component colors or product accent are imposed.

Every note node renders. At most **10,000 relationship lines** render, in canonical
edge encounter order, after reciprocal collapsing. If that omits directed links,
**Simplified view · Showing X of Y links** appears; X counts represented directed
links, including both directions of a reciprocal line. All computation and inspector
counts still use every edge. The 1,000-note fixture does not trigger simplification.
Only the selected note has a permanent text label; native hover tooltips show paths.
All note text uses `textContent` or Obsidian's text helpers. No raw HTML,
`foreignObject`, remote image, or path interpolation into selectors is used.

## Product surface and interaction

Health shows Notes, Internal links, Components, Orphans, Connectors and Broken links
(unresolved occurrences), a compact real map, **Open map**, and **Refresh map**.
The detail route is `{ page: "topology" }` inside the existing ItemView, with Health
remaining selected in the top navigation. There is no new top-level tab or view.
Vault Pulse and Findings behavior remain unchanged.

The full map provides **Back to Health**, refresh, case-insensitive basename/path
substring search, and **Fit view**. Search shows at most 20 real HTML result buttons
with the exact result count. Selection updates the inspector and centers the note.
The inspector shows path, directed degrees, component size, orphan/connector status,
unresolved counts, incoming/outgoing notes and unresolved targets. Each list shows
at most 20 items with an explicit shown/total notice. **Open note** calls the existing
safe `openHealthNote()` route, which resolves and validates the note again at click
time. No new Findings filter is introduced.

Wheel zoom is clamped to 0.4×–4× around the pointer; pan is bounded. Pointer capture
keeps the drag local to the SVG. Movement over five screen pixels pans rather than
selecting. Pointerup, pointercancel, lost capture and view teardown release ownership.
There are no global pointer listeners or continuous updates. Fit restores the full
normalized bounds immediately. Viewport, selection and search are transient.

SVG is `aria-hidden` and has no per-node Tab stops. Search/result buttons, textual
metrics, bounded neighbor lists and inspector actions expose the note facts and
navigation outside SVG. Theme-native focus outlines remain. Map loading/stale state
is announced by the existing persistent live region. This is not a claim of a
screen-reader-tested spatial graph.

At narrow/intermediate widths the map precedes the inspector; wide layouts place
them side by side. Summary metrics collapse from six to three to two columns.
Topology has no transitions or required animation. PR #50's existing Vault Pulse
reduced-motion behavior is unchanged. English and Russian use the shared i18n
system, including partial/unknown/stale/error states.

## Verification

Baseline: `c746d3b096c444d0ae398e1df217f83e73f96892` (merged PR #50).
Branch: `feat/vault-topology`. No dependency, version, tag or release changes.

Automated tests cover chain, cycle, linked clusters, DFS-root articulation, empty,
singleton, multiple/weak components, reciprocal and self-link behavior, broken
aggregation and bounds, immutable data, partial trust, shared source scope, zero
content reads, passive entry, explicit refresh, stale/revision/event races,
coalescing/disposal, safe note opening, search limits and finite bounded viewports.
Repeated layout calls are deep-equal. The deterministic synthetic fixture contains
**1,000 notes, 4,052 directed links, 23 components, 20 orphans and 20 connectors**.
No personal vault data is used. Timing is evidence, never a millisecond CI gate.

- `npm ci`: passed; package/lockfile unchanged (seven existing development
  dependency advisories: four moderate, three high).
- `npm run typecheck`: passed, including strict Health configuration.
- `npm test -- health`: **876 tests / 40 files passed**.
- `npm test`: **2,383 tests / 99 files passed**.
- `npx eslint health`: passed without warnings.
- `npm run lint`: passed with only the existing `api.ts` streaming-fetch advisory.
- `npm run audit:proposals`: **5/5 mutations killed**, every restored test passed.
  The sandbox child-test process returned empty output; the unchanged audit passed
  in host execution. No assertion or check was weakened.
- Production build and baseline-to-HEAD whitespace check passed. A separate code
  review reported no blockers. Exact-final-HEAD GitHub CI is recorded in the PR
  handoff after the evidence commit, avoiding a self-referential commit hash.

The tested implementation is `6095828`; production SHA-256 hashes are recorded in
[native.json](vault-topology-evidence/native.json). The isolated **Linux Obsidian
runtime reporting 1.12.7 / Electron 39.8.10** used a disposable profile/vault with
no personal data or credentials. Eight cases × EN/RU × default dark/light ×
390/768/1280 viewport widths = **96 passed native cases**:

| Case | Notes | Directed links | Components | Orphans | Connectors |
| --- | ---: | ---: | ---: | ---: | ---: |
| Empty | 0 | 0 | 0 | 0 | 0 |
| One note | 1 | 0 | 1 | 1 | 0 |
| Chain | 3 | 2 | 1 | 0 | 1 |
| Cycle | 3 | 3 | 1 | 0 | 0 |
| Main component, two islands, orphans | 13 | 12 | 5 | 2 | 4 |
| Broken targets | 3 | 1 | 2 | 1 | 0 |
| Partial metadata | 4 | 2 observed | 2 observed | Unknown | Unknown |
| Large | 1,000 | 4,052 | 23 | 20 | 20 |

The partial case deliberately intercepts `getFileCache` for one synthetic note;
it is fault injection, not a claim that native caches are normally missing. All
other cases use actual synthetic Markdown files and Obsidian's native resolver.
Every matrix case checks localization, horizontal overflow, button reachability,
rendered node counts and bounded SVG tab order. Screenshot capture repeated the
islands and large cases (24 combinations) with the identical build.

[Native interactions](vault-topology-evidence/interactions.json) record **33 passed
checks**: basename/path search and limits, real pointer click/drag, wheel clamp,
fit, cancel/lost capture/teardown cleanup, Tab/Enter, visible focus, theme accent,
reduced motion and unchanged Pulse behavior, real vault events without automatic
reload, explicit refresh, rejected revision race, retained navigation state, safe
native note opening, disposal during a held capture and idle state after plugin
restart. No native product JavaScript exceptions occurred. Harness corrections
concerned fixture expectations, pointer coordinates/event delivery and CDP value
serialization; they required no product changes.

For every fixture, Health entry had zero topology inventories/captures/body reads,
network calls and plugin writes. Explicit loading used two inventories; the large
fixture used **1,000 metadata inspections and 4,108 resolution calls**, with
**zero `read`, `cachedRead`, adapter reads, plugin writes, fetch or XHR calls**.
Source/import review additionally verifies no provider, requestUrl, semantic-index
or persistence capability exists in the topology path. Host updater traffic,
fixture mutations and explicit test language-setting saves are outside topology
IO windows. Opening a note is a subsequent explicit navigation action.

| Large fixture phase | Observed time |
| --- | ---: |
| Metadata capture | 23.0 ms |
| Validation and topology derivation | 321.0 ms |
| Initial deterministic layout | 7.5 ms |
| Preview SVG construction | 48.2 ms |
| Full SVG construction, cached layout | 68.0 ms |

These are separate single-host observations, not universal performance promises.
Derivation includes cooperative cancellation checkpoints. Render measurements
cover synchronous DOM construction, not browser paint or frame rate. Layout is
cached only by the immutable session snapshot. There is no fragile timing gate.

Synthetic screenshot evidence:

- [Health preview](vault-topology-evidence/topology-health-preview.png)
- [Main component](vault-topology-evidence/topology-main-component.png)
- [Selected-note inspector](vault-topology-evidence/topology-selected-node.png)
- [Selected island](vault-topology-evidence/topology-islands.png)
- [390px Russian/light](vault-topology-evidence/topology-390.png)
- [1,000-note map](vault-topology-evidence/topology-large.png)

Reproduction uses `health/topology/syntheticFixture.ts` for the large graph and the
small scenario shapes/counts above. The session's fixture generator, native CDP
matrix, pointer/lifecycle checks and guarded startup/stop scripts are retained in
`/tmp/vault-topology-smoke/`. Tests operate only on that disposable vault. Native
evidence covers desktop responsive widths, default themes plus a custom accent,
and keyboard interaction; mobile OS, popout, screen-reader output and third-party
theme compatibility are not claimed.

No semantic edges, fabricated graph, automatic Health-entry topology scan, note
body reads, AI, topology persistence, new Findings, Health state changes, version
bump, tag or release. The topology PR is left open and unmerged.
