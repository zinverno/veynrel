# R06.1: bounded map foundation

R06 is **not complete**. This PR establishes semantic-only geometry, one connection
participation binding for list/map, and transient map retention. See the
[architecture audit and dependent R06.2 boundary](part1-audit.md).

## Coordinates and overlays

Workbench retains its finite solver (500 total individual paths maximum). Only
published semantic edges with finite scores attract indexed nodes. Directed
Markdown links remain independently visible; they do not exert forces. Tags,
filters, selection, language, topology refresh and camera operations do not enter
the semantic geometry identity. A changed semantic node/edge/revision identity
starts a deterministic seed, rather than inheriting a timing-dependent old layout.
A changed geometry identity explicitly refits the new layout; unchanged identity
keeps the user camera, including on topology refresh. Reduced motion settles without visible animation.

Unmapped notes occupy deterministic technical positions outside the indexed
layout, with hollow markers and explicit labels. No-index opening starts no
physics. Above 500 paths, existing bounded lexical **display groups** account for
all paths; they are not semantic families. The 500 eligible-document analysis cap
is unchanged and precedes participation exclusions. The UI never claims analysis
of a first-500 sample. Counts distinguish scope, index/eligible computation and
rendered representations. Coordinates are not exact cosine distances.

## Candidates and ownership

WorkbenchData binds the same ConnectionRules/WorkbenchTags selection source for
both graphical and list-only construction. Missing tag metadata remains unknown;
corrupt rules fail before computation. The existing semantic owner still applies
policy before top-K. Real links and scoped paths are independent of that policy.
Changing rules invalidates a published result; refresh is explicit. No ranking,
score, duplicate detector, R04 rule store or write authority is changed.

Back suspends the cached graphical view and releases its renderer/review controls.
Reopening within the same list/scope owner retains coordinates, selection, query,
filters, camera and view-local metadata. Hidden views do not render from source
notifications. Visible metadata notifications are coalesced to one animation frame
to avoid rebuilding the entire map for every cold-cache file event; owner teardown
and window migration cancel pending frames. The initial idle map does not project
the full tag inventory: that projection starts with explicit Load, independently
of background host cache population. A cold-cache 5k control after coalescing alone
still timed out (4,668/5,000 caches); that failed receipt is retained. Scope replacement and ItemView disposal still dispose all map
owners. Pair Inspector consent and write tickets are never retained.

## Next dependent R06 substage (not implemented)

- Transfer topology components/unresolved-target inspection and global focus-score
  access, then redirect old visual routes/commands to the canonical Workbench.
- Define and test explainable overlapping semantic families without inferring
  topic boundaries from lexical buckets or every ranked neighbor.
- Complete note-context neighbors/bridges, reciprocal glyphs and the decisions
  parity audit. Existing map repeat markers are not a replacement for the
  list's persisted ReviewFacts/decision queue.
- Add explicit computation cancellation with ownership-safe shared topology
  behavior; current disposal guards remain, but there is no new Cancel command.
- Complete all R06 acceptance (including family journey and legacy redirects).

No R07 work is authorized by this split. Resume Batch, release policy, dependencies,
versions, personal vaults and all operation journals remain unchanged.
