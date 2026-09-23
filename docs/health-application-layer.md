# Health application layer (PR 3)

`HealthService` connects the existing local coordinator and durable FindingStore.
It also accepts an optional `semanticAnalysis: SemanticHealthAnalysisPort` and
exposes explicit `runSemanticScan(signal)`. See
[Semantic duplicate Findings](semantic-health-duplicates.md) for revision,
completeness and Connections depth rules. Both scan types share one running guard;
`HealthScanAlreadyRunningError` retains the old Local error export as an alias.
Snapshots now include `lastSemanticScan`, `lastSemanticScanReconciled` and
`semanticScanRunning`; no engine or provider internals enter the snapshot.
PR 3 introduced it without production wiring. PR 4 adds the [native Health
home](health-view.md), lazy plugin ownership and explicit recovery. The application
layer itself remains UI-neutral: no automatic scan, AI/network call, telemetry,
settings migration or Markdown note write.

## Ownership and contracts

One plugin owns one HealthService, which owns one configured FindingStore and one
`HealthLocalVaultSource`. The service never constructs a store per scan. Callers
must not share that store with another service or write around its ownership.

```ts
const store = new FindingStore(storage, clock);
const source = new ObsidianLocalVaultSource(app, optionalAdditionalScope);
const health = new HealthService(store, source, { clock });
await health.initialize();
const outcome = await health.runLocalScan(signal);
const snapshot = health.getSnapshot(); // profile defaults to mixed
```

Import the Obsidian source from its adapter module. The `health/index.ts` façade
exports application contracts and HealthService without importing the adapter's
Obsidian runtime dependency. `listFindings`, `getFinding`, `dismissFinding`,
`snoozeFinding`, and `reopenFinding` delegate to the existing store invariants.
Returned Findings, snapshots, recommendations and initialization records are owned
copies. Recommendation actions remain descriptors; the service executes none.

`initialize()` calls `FindingStore.load()` once and does no analysis or writes.
It returns per-file load states plus `ready`/`degraded`/`unavailable` and separate
findings/history writability flags. Missing files are writable and do not cause
directories to be created. Invalid, unsupported or unavailable Findings storage
rejects scans before vault capture. Damaged history does not disable usable
Findings; recording history will fail explicitly without overwriting damaged data.
There is no implicit reset or recovery operation.

## Local scan lifecycle

1. Require initialization and writable Findings. Reject overlapping scans with
   `LocalHealthScanAlreadyRunningError`; do not queue Scan requests.
2. Reserve a technical ID and observation time before analysis; publish ephemeral
   running state. Capture the snapshot once and run the existing coordinator.
3. Build exactly one request per successful analyzer, with source `local`, its
   single analyzer ID, its candidates/completeness, and the scan's `startedAt`.
   Failed analyzers contribute no reconciliation request.
4. Queue one batch transaction. Validate every request against a temporary state.
   Inside that queue, immediately before writing, probe current vault revision.
5. If fresh, save `findings.json` once and publish the new in-memory state. All
   counters and scope reconciliation receipts come from this committed transaction.
6. Record one final ScanRun in `scan-runs.json`. No durable `running` record exists.
7. Return the typed outcome and restore idle state, including on failure/abort.

The injected clock supplies the observation time. To disambiguate new Findings
when clocks repeat or move backward, `startedAt` is at least one millisecond after
the previous in-session observation, retained scan start times and durable Findings
receipt. It is otherwise the current clock value. All requests use that exact
timestamp. Snooze expiry still uses the store's current injected clock.

The default scan ID is `local-${crypto.randomUUID()}` using the native platform API.
Tests inject `scanIdFactory`. Invalid IDs and collisions with retained history or
the latest in-session attempt reject before analysis; no record is overwritten or
silently retried. IDs must be globally unique in caller-supplied factories. Old IDs
outside the bounded 50-run history cannot be exhaustively checked.

## Revision and scope

`LocalVaultRevision` contains `{noteCount, signature, complete}`. It encodes sorted
`[path, mtime]` tuples as JSON, then produces:

```text
v1:<encoded UTF-16 length>:stableHash(encoded):stableHash("veynrel-revision-v1:" + encoded)
```

Enumeration order does not affect identity. Adding, deleting, renaming, or changing
the observed mtime of an included note changes the inventory. No note body is read
or hashed by the probe. Hashes are noncryptographic change detectors.

The coordinator returns the revision of its immutable analyzed snapshot, never
the snapshot's bodies. `ObsidianLocalVaultSource` implements both snapshot capture
and `LocalVaultFreshnessProbe` using **one shared inventory function**. Therefore
both use the same Markdown filtering, actual config directory, root backup
exclusions, additional scope, validation and code-unit ordering. HealthService
accepts one source implementing both ports, not separately configured source/probe
objects. Custom sources must honor this same-scope contract for their lifetime.

Both inventories must be complete. Unknown/failed or incomplete freshness prevents
all reconciliation and yields `failed`. A different complete revision yields
`partial`, `freshness: "stale"`, and `vault-changed-during-scan`; it publishes no
positive candidates, resolves nothing and records zero finding counters.

Missing note content or metadata is different: with a complete unchanged inventory,
successful partial analyzers may publish known positives using `complete: false`.
They cannot resolve absence. Complete successful analyzers resolve only their own
source/analyzer scope. An incomplete note list cannot establish freshness even if
the known subset matches, so the service conservatively publishes nothing.

Scope policy is fixed for a service instance. Future scope-setting changes require
an intentional new full scan. A complete scan of an intentionally narrower scope
may resolve previous analyzer Findings outside it; incomplete enumeration must
never be used to achieve that effect accidentally.

This is a lightweight guard, not a filesystem lock. It cannot detect content edits
that preserve mtime, metadata-cache changes without inventory changes, hash
collisions, or edits after the final probe while storage is committing. Stronger
event revision tracking/locking would require a separate vault integration design.

## Batch and durability boundaries

`reconcileBatch(requests, {beforeCommit?})` clones and validates requests, rejects
duplicate/overlapping `(source, analyzerId)` ownership, applies disjoint scopes in
code-unit order to one temporary map, and performs one Findings write. An invalid
request, stale observation, rejected pre-commit guard or failed write publishes no
state. Empty batches do not write. `reconcile()` uses the same lifecycle primitive.
The async pre-commit guard runs inside the existing write queue and must never
enqueue another store mutation (which would deadlock).

Findings and history remain separate durable commits. If reconciliation succeeds
but history fails, the outcome says `findingsCommitted: true, historyRecorded:
false`, with `history-not-recorded`; valid Findings remain committed. Reconciliation
failure reports zero counters and attempts to record a failed ScanRun independently.
Underlying single-file writes retain the existing storage adapter's crash limits;
this is an in-instance logical transaction, not a journaled database.

Schema v2 uses [scope reconciliation receipts](health-reconciliation-receipts.md)
for restart association. Global Findings `updatedAt` still advances strictly on
every successful write, even with a repeated/backward clock. A reconciled ScanRun's
`completedAt` remains the logical Findings commit time, before the separate history
write; coverage identity is its nonempty `reconciliationReceipts` map. Every
recorded owner must match the current store; unrelated extra owners are ignored.
A newer reconciliation with missing history invalidates only affected owners.
Dismiss/Snooze/Reopen preserve all analysis receipts, including after restart.
Valid v1 files migrate in memory without load-time writes; legacy partial or
mismatched completed runs remain conservative. See the receipt document for
completed-v1 trust and mixed-file rules.

## Outcomes and cancellation

| Result | Rule |
| --- | --- |
| completed | Fresh revision, every registered analyzer successful/complete, batch committed |
| partial | Fresh committed results with incomplete/failed analyzers alongside successful ones; or explicitly stale analysis with no commit |
| failed | Capture failure, unknown freshness, no successful analyzers, or reconciliation failure |
| cancellation | Propagated AbortError; no Findings/history commit before the commit point |

The outcome includes ScanRun, freshness (`verified`, `stale`, `unknown`,
`not-checked`), `findingsCommitted`, `historyRecorded`, and fixed diagnostic codes.
No exception message, stack, note body or persisted diagnostic is introduced.

Cancellation is checked before capture, after analysis, on entering the pre-commit
guard and while awaiting its probe. An abort before writing publishes/persists no
scan results and always restores idle. Once a storage write starts it cannot be
cancelled or undone by AbortSignal; if Findings commit, the service finishes the
history attempt and returns the truthful committed outcome despite a late abort.
Already-started Vault reads retain PR 2's cancellation limitations.

Subscribers receive notifications for running/idle and after Findings commits,
history commits, dismiss, snooze and reopen. Unsubscription removes the listener.
Listener exceptions cannot invalidate a durable operation. Listeners must handle
their own asynchronous failures. No event framework or progress model is added.

## Aggregation and recommendations

Structure and Connections have `basic` depth once a local scan has been attempted.
Knowledge and Recall remain `unknown` with `not-enabled` depth. No score is created.
Only open Findings drive the immediate dimension state:

1. Any attention Finding: `needs-attention`.
2. Otherwise any review Finding: `review-recommended`.
3. Otherwise trustworthy completed basic coverage: `good`.
4. Otherwise: `unknown`.

Info alone does not make a dimension unhealthy. Snoozed/dismissed/resolved Findings
do not drive the state. A partial or failed latest scan cannot prove absence, even
after restart. Full absence additionally requires all eight current built-in IDs
and versions in the completed record; custom subsets cannot imply full coverage.

`newFindings` counts open local Findings first seen and still observed at the latest
reconciled scan's observation time. With no trustworthy association it is zero.
No persisted `isNew` flag exists. `lastLocalScan` includes the latest in-session
attempt even if recording history failed; otherwise it comes from retained history.
`lastLocalScanReconciled` exposes matching scope receipts to onboarding, both in
session and after restart. This is a derived snapshot field, not a new storage
field. It distinguishes a reconciled
partial scan from a stale partial attempt after restart.

Recommendation selection returns at most one actionable open Finding. Ranking is
lexicographic, not an additive Health score: impact (attention, review, info), then
confidence (deterministic, high, medium), then profile relevance, then lastSeenAt
descending, then Finding ID ascending by code-unit comparison. The chosen action is
the Finding's first supported action; profile changes never alter detection.

| Profile | Dimension priority |
| --- | --- |
| learning | recall, knowledge, connections, structure |
| research | connections, knowledge, structure, recall |
| work | structure, connections, knowledge, recall |
| personal | connections, structure, knowledge, recall |
| mixed (default) | all equal |

Recommendations are derived copies, never persisted. No actionable open Finding
means no recommendation. The plugin controller passes the selected profile from
the [Health preferences port](health-onboarding.md); standalone service callers
still default to `mixed`. Profiles never enter the analyzer or vault-source path.
