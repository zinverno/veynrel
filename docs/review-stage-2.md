# Review stage 2 — connection participation rules

Dependent on open #113 (`fix/review-flow-stabilization`, reviewed base
`59cb86e3678717977e88e167110d5376cc4a0df2`). Stage 1's beta presentation is retained.
This is a connection-selection feature, not approval or further work on map visual A/B.

## User behavior

In **Possible connections → Connection rules**, explicitly choose one tag or folder:

- **Do not suggest connections within the group** forbids a pair only when both
  documents are confirmed members. Exercise–explanation remains eligible.
- **Exclude group from connection search** forbids a pair with either confirmed
  member. The dialog explicitly describes the stronger effect.

No rules are installed by default. Save, enable/disable and delete are explicit.
Saving changes the shared policy only after durable storage succeeds. Use the
existing **Find / refresh candidates** action to recalculate locally. Prior results
are labelled stale in the interim. There is no model call, embedding generation,
periodic refresh, or inferred exercise classification.

Tags use the existing taxonomy token validation and Obsidian inline/frontmatter
metadata adapter. The shared token helper was moved unchanged to `utils` to retain
Health's dependency boundary. Tag comparison is exact, case and Unicode preserving;
no implicit child-tag expansion (`practice/task/child` and `practice/taskish` are
not `practice/task`). All tags participate; none is made primary.
Folders include descendants by the slash boundary: `Tasks/` excludes `Tasks-old/`.
Rules retain exact folder path and the adapter's creation identity. A missing,
renamed or replaced folder is not rebound by basename. Unavailable identities are
reported as unverified; reselect a folder explicitly to create a new rule.

## Computation and ownership

Only the standalone list supplies a captured participation source to its independent
scoped `SemanticGlobalMapController`. This is the existing read-only computation
owner, with no graphical renderer or physics mounted. Global map, Neighborhood,
search, duplicate analysis, Recall and audit do not receive the policy.

`SemanticDiscoveryService.analyzeGlobalSemanticMap` applies confirmed document
exclusion before neighbor selection and applies pair participation **before** its
existing top-five offer function. Cosine, eligibility, tie order and top-K remain
unchanged. The strict projection still requires exactly `min(5, available)`
neighbors, where `available` now counts confirmed allowed pairs for that captured
policy. It rejects forbidden edges and unaccounted missing neighbors. Fully
excluded coverage is an empty ready result, not an index-configuration failure.
The existing comparison derivation recomputes ranks, mutuality, shared
neighbors and candidate ordering from those allowed neighbors. Topology still
separates existing directed/reciprocal links and unknown link metadata.

The 500-eligible-document cap is checked on the selected scope **before** policy
exclusion; a rule cannot bypass it or silently select the first 500. Above the cap,
the existing scope-narrowing message remains. Pair-count work and similarity work
yield in bounded batches and honor cancellation; the policy does not grow the
index or mutate a published graph. With no active policy, analysis output is
identical to the previous result.

Captured policy/metadata revision, immutable scope and semantic revision belong to
one calculation. Metadata events and policy changes invalidate the scoped source,
abort pending work and prevent a late result publishing as current. A final
revision check also rejects delayed notifications. Closing/replacing the view
unsubscribes its source. All ItemViews share one plugin-owned policy store.

## Three states and counts

Membership is confirmed present, confirmed absent, or unknown (missing/stale cache
or unavailable folder identity). A within-group rule is allowed if either side is
confirmed absent, excluded if both are present, otherwise unverified. Full exclusion
is excluded if either is present, allowed if both are absent, otherwise unverified.
Across rules, confirmed exclusion wins; absent exclusion, any unresolved rule makes
the pair unverified. Unverified pairs do not occupy top-K and are counted separately,
never described as confirmed exclusions or evidence that no useful relation exists.

The dialog preview counts notes in the selected inventory, including a separate
unknown count. After calculation, the list reports eligible semantic notes, fully
excluded notes, and disjoint forbidden/unverified unordered pairs **before top-K**.
These are not counts of suppressed recommendations and are not added to the active
candidate count. Unknown-note membership can overlap those pair counts. Reviewed
pairs remain a separate content-version decision, not a policy category. Stale
counts retain the visible stale-results status until explicit refresh succeeds.

The policy cannot remove findings, Markdown, existing links, index documents or
analysis results. Exercise duplicates remain in Repeats. `Leave as is` still filters
both active queues by exact saved pair versions; policy edits never erase decisions.
Restoring a reviewed pair does not override active connection rules.

## Persistence and failures

`connection-rules.json` is a small strict version-1 file under the plugin's actual
config directory. It is separate from settings, `review-decisions.json` and Markdown
operation journals. Writes are serialized in one plugin instance and use staging,
previous backup and rollback, matching the existing decisions storage pattern.
Only committed state is published. Failed writes leave prior policy active;
corrupt/unreadable primary state blocks updates and calculation rather than being
silently treated as no rules. Incomplete staging is never loaded. The previous
backup is used only if the primary file is absent after interrupted replacement.

No writers, tickets, journals, Apply/Undo, recommendation/evidence contract, provider
configuration, FSRS or ranking of independent tools changed. The installer replaces
only the frozen three plugin files and preserves both decision and rule state.

## Verification

Regression coverage includes exact and multi-tag membership, slash boundaries,
reverse pairs, missing/replaced folders, stale metadata, corrupted state, partial
write/replacement/rollback failure, competing view edits, policy revisions during
calculation and disposal. The sixth-neighbor fixture has six exercises and six
explanations: five closer exercises occupy each exercise's original top-five,
and the explanations' own neighbors prevent accidental top-five-union rescue.
After the within-group rule, the explanation becomes the first eligible neighbor
and is asserted in the actual comparison source. Duplicate results and unscoped
analysis remain byte-equivalent as data structures. Existing links and unknown
link availability are tested after policy selection. A 1000-document scope is
refused even when a full exclusion would remove every document.

Native evidence and exact run totals are recorded in
[review-stage-2-evidence/README.md](review-stage-2-evidence/README.md).
The controlled vectors test selection mechanics, not embedding quality or whether
a connection is useful. Physical mobile and concurrent Obsidian processes/Sync
conflict resolution are not covered; the latter belongs to integration stage 3.
The optional row shortcut and nested-tag switch were not added: the shared compact
editor and exact selectors cover the requested two rules.
