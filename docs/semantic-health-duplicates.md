# Semantic duplicate Health Findings

The first Semantic Health analyzer is **`semantic-duplicates`, version `1`**.
The analyzer ID is persisted ownership and fingerprint compatibility surface.
Changing copy, model or score must never rename it or change pair identity.

## Explicit analysis and ownership

Ready Discover retains its three exploratory workflows under **Explore**:
Search by meaning, Related notes and Potential duplicates. A separate secondary
**Semantic Health** section offers **Check semantic duplicates**. The former
Potential duplicates modal and all existing semantic command IDs are unchanged.

Only this explicit Health action calls `HealthPluginController.runSemanticScan()`.
Opening Health/Discover, connecting Semantic Intelligence, building/rebuilding an
index, Local Health scans, startup and auto-sync never start Semantic Health.
Transient busy copy is “Checking semantic duplicates…” with no percentage. Repeat
clicks cannot queue scans. One HealthService excludes overlapping Local/Semantic
analysis through persistence/history completion. Exploratory modals remain usable
subject to their existing engine restrictions. Closing the view does not cancel
the controller-owned scan; plugin shutdown does.

```text
HealthService -> SemanticHealthAnalysisPort
                         ^
            SemanticHealthAnalysisAdapter
                         |
            ObsidianSemanticController.findPotentialDuplicates()
                         |
            existing SemanticDiscoveryService
```

`health/semanticHealthAnalysisPort.ts` owns the analysis contract:
`analyzeDuplicates(signal)` returns candidates, completeness and an in-session
`SemanticIndexRevision`; `verifyCurrent(revision, signal)` checks freshness.
The implementation lives in `semantic/health/`. It uses a structural subset of
the existing controller API and does not import providers, vector-store internals,
Companion, RAG or Deep Audit. Health imports no semantic engine implementation.

HealthService remains the sole application persistence owner, injected with
`{ semanticAnalysis }`. The adapter creates no FindingStore and performs no
storage write. The existing store, Inbox and RecommendationService are reused.

## Existing algorithm and bounded mapping

Discovery still uses the existing document centroids, cosine comparison, eligible
pair enumeration, threshold **0.95**, ranking, limit **100**, and **3 matches per
document**. No similarity algorithm, threshold, embedding provider or vector store
is added or changed. The adapter calls `findPotentialDuplicates()` without options.

Each `SemanticDuplicatePair` becomes one candidate:

| Field | Value |
| --- | --- |
| source / analyzerId | `semantic` / `semantic-duplicates` |
| dimension / type | `connections` / `semantic-duplicate` |
| impact / confidence | `review` / `high` |
| notePaths | Exactly two distinct validated paths, in canonical code-unit order |
| title | `Possible semantic duplicate` |
| explanation | `These notes are unusually similar in meaning.` |
| evidence | Only `{ kind: "similarity-score", value: score }` |
| action | `{ kind: "open-note", path: firstCanonicalPath }` |

The adapter rejects non-finite scores, values outside `[-1, 1]`, invalid/same
paths, duplicate pair identities and results exceeding the API's 100-pair limit.
It rejects the entire analysis rather than filtering malformed positives into a
potentially false complete absence. Scores are never silently clamped.

Identity uses `createFindingFingerprint({ source: "semantic", analyzerId:
"semantic-duplicates", dimension: "connections", type: "semantic-duplicate",
paths: [leftPath, rightPath] })`. A/B and B/A have the same fingerprint and Finding
ID. Score, localized text, previews and model are excluded.

No chunk previews, chunk contents, full note bodies, embeddings or vectors enter
Health persistence. UI localizes the title, explanation and **Semantic analysis**
source in EN/RU, retaining persisted English fallback strings and future-type
fallback. Evidence displays **Semantic similarity: 97%** using
`Math.round(score * 100)`. This is similarity, not probability or confirmed
duplication. Invalid evidence is not clamped into a plausible display value.
Both paths use existing safe note navigation. The Inbox never interprets generic
FindingAction kinds; there is no merge, delete, rewrite or automatic link action.

## Ready revision and freshness

Analysis requires cached `status.kind === "ready"` and `vectorCount > 0`.
Disabled, uninitialized/configured, empty, initializing, indexing, incompatible
and error states are unavailable. The adapter does not call Check setup, Build
or Rebuild to make a scan possible.

The small revision contains:

```ts
{
  vectorGeneration, vectorCount, dimensions, provider, model,
  configurationRevision, runtimeRevision
}
```

`ObsidianSemanticController.getCachedIndexState()` reads cached status and
settings only. Existing signature checks invalidate Ready after a configuration
change, including endpoint changes; the endpoint/signature itself is never exposed
to Health. `configurationRevision` is the existing settings epoch.
`runtimeRevision` increases when the controller installs a new runtime, detecting
a rebuild even if generation/count/model match the old index. Both counters are
in-session tokens, not persisted index IDs. Revision values and Ready status are
compared deterministically; no note body is hashed.
Cached status reads preserve an ongoing `initializing` reinspection instead of
prematurely restoring Ready from an already initialized runtime's statistics.

Capture happens before discovery, again after discovery, and again inside the
FindingStore queued `beforeCommit` boundary immediately before its Findings write.
The final check requires Ready and an identical revision. If Ready/freshness cannot
be proven, **zero candidates commit and zero old Findings resolve**. The semantic
attempt is failed with safe codes (`semantic-unavailable`,
`semantic-index-changed`, `semantic-analysis-failed`, or `reconciliation-failed`),
never raw exceptions, stack traces or provider responses.

This is a lightweight guard, not a filesystem transaction. An index change after
the final check while Findings persistence commits is a small remaining race
window, as in Local Health. No locking or journal is introduced.

## Completeness and ScanRun

| Discovery count | Reconciliation | Semantic ScanRun after successful commit |
| --- | --- | --- |
| 0–99 | `complete: true` | `completed` |
| Exactly 100 | `complete: false` | `partial` |
| Unavailable, malformed, failed, stale or failed Findings write | No commit | `failed` |

Discovery evaluates every eligible pair but retains only the top 100. Even if
there are exactly 100 real matches, the API cannot prove there was no 101st.
**A 100-result scan never resolves absent old Semantic Duplicate Findings.**

Complete means complete relative to the current compatible semantic index and
this analyzer. It does not assert that every vault note has vectors, that semantic
understanding is perfect, or that every possible Connections analyzer has run.

Every semantic run uses `type: "semantic"`,
`analyzerVersions: { "semantic-duplicates": "1" }`, and **`notesSeen: 0`**.
The current duplicate API exposes no trustworthy indexed-document total; vector
count, pair count and unique duplicate paths are not substitutes. Counts and
`reconciliationReceipts` come from the actual committed store result. Failed
attempts have empty receipts. Only terminal history is written; running state is
transient. Cancellation before Findings commit writes neither semantic Findings
nor completed/partial history. Once a durable write starts/succeeds, the service
finishes recording committed truth even if cancellation arrives late.

## Scope receipts, coverage and lifecycle

The committed scope is only `semantic:semantic-duplicates`. PR #35 receipt rules
apply unchanged. Semantic reconciliation never invalidates Local receipts; Local
reconciliation never invalidates this semantic receipt. Dismiss/Snooze/Reopen
preserve all analysis receipts, including after restart.

Findings and ScanRun history still commit separately. If Findings succeeds and
history fails, the outcome reports `history-not-recorded`; committed Findings and
new receipts remain. After restart, an older semantic run cannot borrow those
receipts. Local coverage remains trusted. History retention remains 50 runs.

The latest semantic run associates only through current scope receipts, completed
or partial status, and the current analyzer ID/version. Connections aggregation:

| Coverage, with no open attention/review | State / depth / complete |
| --- | --- |
| Trusted complete Local, no semantic scan | Good / Basic / true |
| Trusted complete Local and complete Semantic | Good / Semantic / true |
| Trusted complete Local and partial Semantic | Unknown / Semantic / false |
| Trusted Semantic without complete Local | Unknown / Semantic / false |
| Unassociated/failed/old-version Semantic | Falls back to available Local/basic coverage |

Open attention/review Findings still determine Needs attention / Review recommended
regardless of source. Semantic Intelligence merely being Ready does not change
Health. Structure remains Local/basic; Knowledge remains disabled.
[Recall Health](recall-health-integration.md) derives its state independently from
the shared native Recall owner and does not affect semantic Findings or ranking.
Cards localize **Semantic analysis** and **Semantic analysis · incomplete**.

The existing subscription updates the snapshot, Inbox counts, Connections and
Recommendation without reload. Recommendation uses its unchanged ranking because
the candidate has an action, review impact and high confidence. `newFindings`
remains Local-only in this first slice.

Inbox Open/Snoozed/Dismissed/Resolved and lifecycle actions are unchanged. Repeat
detection preserves dismissal and an unexpired snooze. Complete absence resolves
open/snoozed pairs, while partial absence resolves none. Recurrence of a resolved
pair reopens the same ID with its original `firstSeenAt`. Dismissal remains durable
user intent; absence does not resolve a dismissed Finding.

Index rebuild and auto-sync do not mutate Health Findings or receipts. Existing
Findings remain historical observations until the next explicit Semantic Health
scan; the receipt association describes that observation, not live index coverage.

## Boundaries and verification

Semantic duplicate analysis uses the already-built local index. Integration tests
run the real controller/runtime/discovery path and assert zero `requestUrl`,
provider `embed`, provider dimensions/tests, Markdown reads or mutations, and
semantic-index writes during Health analysis. Index Build remains a separate
explicit operation that may contact a provider.

Focused checks:

```sh
npm test -- semantic/health health/services/semanticHealthScan.test.ts
npm test -- semantic/semanticConcurrency.integration.test.ts -t 'Semantic Health|cached semantic revisions'
```

Regressions cover 0/1/99/100, invalid pairs, no preview persistence, queued final
freshness checks, cancellation, lifecycle/recurrence, multi-source restart,
history failure and EN/RU Discover/Inbox presentation. The Health transitive import
audit and semantic adapter allowlist enforce the dependency and no-mutation rules.

Hidden connection Findings, Related/Search Findings, Deep Health, Recall, Health
Score, compare/merge UI, automatic linking and AI rewriting are deferred. No plugin
version change, tag or release accompanies this integration.

## Native desktop evidence

An isolated Obsidian **1.12.7 / Electron 39.8.10** profile used 17 synthetic notes,
locally seeded three-dimensional vectors and no credentials. No provider was
needed even to prepare the fixture. See [native evidence](semantic-health-evidence/native.json).

Verified Ready Discover → explicit check → Connections Review recommended at
Semantic depth → Inbox detail with two navigable notes, localized explanation,
Semantic analysis source and rounded 97% similarity. Dismiss removed the open
Finding and survived repeat analysis. Complete controlled absence resolved it;
recurrence preserved ID and first-seen time. Fifteen eligible identical vectors
produced 105 possible pairs and the engine's top 100: partial, zero resolved, and
the previous absent pair remained open. Index fixture changes alone wrote no
Health data. A plugin reload created new service/store owners and retained both
Local and Semantic associations and all lifecycle records.

The explicit first check invoked discovery once and wrote only the two Health
metadata/history files. Instrumented provider requests/embedding methods,
Markdown reads/mutations and other plugin storage writes stayed at zero. Obsidian
separately saved `.obsidian/workspace.json` for host layout state; the evidence
records that path separately. No preview
entered Findings JSON. EN/RU, dark/light themes, native Tab/Enter activation,
2px focus outline and 390px desktop viewport were checked; sidebars were collapsed
for narrow-pane testing and no Health content overflowed.

Screenshots: [Connections](semantic-health-evidence/home-en-dark.png),
[EN detail at 390px](semantic-health-evidence/detail-en-dark-390.png),
[RU light detail](semantic-health-evidence/detail-ru-light-390.png),
[RU Discover](semantic-health-evidence/discover-ru-light-390.png).
This is desktop evidence, not native iOS/Android, popout, screen-reader, custom
theme or live-provider coverage. Unit/integration tests cover stale commits,
cancellation and history-write failures in addition to the native lifecycle flow.

Final local verification: **1,549 tests / 66 files**; Health **646 / 31**;
Semantic **339 / 17**; focused adapter/scan/boundary **70 / 3**. Typecheck,
Health/Semantic ESLint, production build and the proposal mutation audit pass
(5/5 mutations caught). Full lint retains only the existing `api.ts:413` fetch
warning. `npm ci` used the unchanged lockfile. GitHub CI status is tracked on the PR.
