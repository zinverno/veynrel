# Health reconciliation receipts (PR #35)

Health storage schema v2 separates durable file writes from analyzer ownership.
The global `findings.json.updatedAt` used to associate every scan with Findings.
That made a lifecycle edit or an unrelated source's reconciliation invalidate
Local coverage after restart. Association now uses `reconciliationReceipts`.
No analyzer, Semantic Findings feature, UI, or plugin release is added here.

## Contracts and ownership

```ts
type ReconciliationOwnerKey = string;
type ReconciliationReceipts = Record<ReconciliationOwnerKey, number>;

interface FindingsSnapshot {
  version: 2;
  updatedAt: number;
  reconciliationReceipts: ReconciliationReceipts;
  findings: Record<string, Finding>;
}

interface ScanRunsSnapshot {
  version: 2;
  updatedAt: number;
  runs: ScanRun[];
}

// Added to every current ScanRun, including in-memory attempts:
// reconciliationReceipts: ReconciliationReceipts
// completedAt remains the existing logical completion/commit timestamp.
```

`reconciliationOwnerKey(source, analyzerId)` returns `source:analyzerId`, for
example `local:orphans` or `semantic:synthetic-semantic`. Sources use the existing
`FindingSource` enum (`local`, `semantic`, `deep-ai`, `recall`); analyzer IDs use
the existing 1–128 character identifier grammar. IDs cannot contain `:`, so keys
are unambiguous and at most 136 characters. Titles, explanations, dimensions and
localized strings never identify ownership. Parsing/validation rejects malformed
keys; receipt maps must be plain objects with valid epoch-millisecond integers.
No raw JSON map is trusted through a type assertion.

| Value | What it means |
| --- | --- |
| Request `seenAt` / Finding `lastSeenAt` | When analysis observed the Finding |
| Findings `updatedAt` | Latest durable write to `findings.json`, including lifecycle changes |
| Owner reconciliation receipt | Durable commit that most recently reconciled that source/analyzer |
| Scan `completedAt` | Logical completion time, or the Findings commit timestamp on successful reconciliation |

Receipt values cannot exceed their Findings snapshot's global marker. That marker
advances strictly, even with a repeated/backward clock, and never precedes the
batch's observations. It still supports observation ordering and diagnostics.
Equal numeric timestamps do not make these roles interchangeable.

## Transaction and lifecycle rules

`reconcileBatch()` validates and copies every request, rejects overlapping owners,
applies requests to temporary Findings state, executes the existing queued
freshness guard, and writes one snapshot. That snapshot includes the updated
receipts for **every owner named by the committed requests**, including scopes
with zero candidates or partial coverage. Disjoint local and semantic requests
may share a batch. All participating owners receive the same commit receipt;
other owner receipts remain unchanged. Findings and receipts publish together
only after persistence succeeds. Validation, guard and write failures publish
neither. The existing single `reconcile()` delegates to this same batch primitive
and keeps its counts-only return contract.

`BatchReconcileResult` returns `{created, updated, resolved, updatedAt?,
reconciliationReceipts}`. The receipt map contains only owners in that commit.
An empty batch returns zero counts and `{}` receipts, omits `updatedAt`, and
performs no write. Results and `getReconciliationReceipts()` return owned copies.
The existing deterministic serializer sorts receipt keys, like all object keys.

Dismiss, Snooze and Reopen express user attention state. Each writes lifecycle
state and advances global `updatedAt`, preserving **all** analysis receipts.
They never claim an analyzer ran. This applies equally to local and future sources.

## Scan association and aggregation

HealthService copies the batch result's actual receipts into the Local ScanRun.
It does not reconstruct them from a service clock or `completedAt`. Failed
analyzers contribute no request and no receipt; their older store receipts are
not copied into the new run. Failed/stale/no-commit attempts have `{}`.

`reconciliationIsCurrent(recorded, current)` requires:

1. At least one recorded owner.
2. An exact match in current storage for every recorded owner and receipt.
3. No condition on extra, unrelated current owners.

HealthService applies this check to completed/partial runs both in session and
after restart. `lastLocalScanReconciled` remains a derived public snapshot field.
There is no UI contract change. A newer `local:orphans` receipt invalidates an old
Local scan containing that owner; a newer `semantic:x` receipt does not.

The aggregator is unchanged. Full Local absence still requires a completed,
reconciled run with **all current built-in analyzer IDs and versions**. Partial
receipts can associate positive/new Findings but cannot establish healthy absence.
Attention still means Needs attention; review means Review recommended; completed
clean coverage means Good; partial absence means Unknown.

After a complete scan, dismissing/snoozing all open review/attention Findings can
leave Health Good **after restart**. Reopen restores attention/review as appropriate
while keeping analysis coverage trusted. This intentionally removes the v1
artifact where lifecycle writes alone lost restart coverage. Partial scans remain
conservative regardless of dismissal.

`recordScanRun()` validates and clones receipts before enqueueing. Existing
identity, status and monotonic counter rules remain. A persisted running run has
empty receipts and may add committed receipts on transition to completed/partial.
A persisted non-running run's receipt map cannot be added to, removed from, or
changed on upsert (key order is irrelevant). `cloneScanRun()` independently copies
both `analyzerVersions` and `reconciliationReceipts`.

## Read-only v1 migration

Explicit v1 codecs decode Findings and scan history as supported, `loaded` data.
Load/initialize validates both independent files and migrates only in memory:
**zero writes, no directories, no scans, no recovery prompt**. The next real
Finding or scan-history mutation writes that file in v2. The other file can
remain v1 until it is changed. Missing files remain missing until a real write.

| Findings / history | Safe association rule |
| --- | --- |
| v1 / v1 | Completed run only, with `completedAt === findings.updatedAt`. Synthesize one receipt per analyzer in its registry, in both the run and the in-memory store. |
| v2 / v1 | Completed legacy run only. All expected owners must already exist in v2 Findings with receipt equal to the run's `completedAt`. Extra owners and a newer global marker are harmless. |
| v1 / v2 | Keep the actual v2 run receipts. Synthesize current store receipts only when the run's `completedAt` and every recorded scope receipt equal the legacy global marker. A v2 partial run knows its actual committed subset; it may associate that subset without proving healthy absence. |
| v2 / v2 | Compare scope receipts directly; global `updatedAt` is not coverage identity. |

Legacy type mapping is explicit: `local → local`, `semantic → semantic`,
`deep → deep-ai`, `recall → recall`.

**Never synthesize legacy partial trust**, even if its timestamp matches: v1
stored the registry but not the successful subset that committed. Legacy failed
and running runs also get empty maps. A legacy completed/global mismatch is not
explained away as a Dismiss, Snooze, or unrelated reconciliation; v1 cannot prove
which happened. It remains unassociated until a new complete scan restores
coverage. Empty or old analyzer registries cannot prove current full Local Health.
These conservative cases are a one-time limitation of the old schema.

Invalid supported files remain write-blocked; unknown schema versions (including
versions greater than 2) remain unsupported and use the existing Health-only
explicit recovery flow. No future version is silently reinterpreted.

## Independent commits and future sources

Findings and history still commit separately. If Findings succeeds and history
fails, current receipts advance without a corresponding new persisted run. Older
**affected** scan receipts then mismatch after restart; unrelated source scans
remain valid. A semantic Findings commit followed by a failed semantic history
write leaves Local coverage trusted. A Local commit with failed history invalidates
older Local association while preserving an unrelated semantic run.

The existing single-file adapter is unchanged: there is no journal, cross-file
atomicity, cross-instance lock, or sync conflict resolution. Invalid/truncated
files require existing explicit recovery. History still retains only 50 runs;
receipts cannot restore a run that was pruned. Retired owner receipts are retained;
receipt pruning is outside this change.

Future Semantic/Deep/Recall orchestration should submit explicit ownership scopes
through the same store transaction and persist the returned map in its ScanRun.
This PR exercises those contracts only through synthetic test data. It adds no
semantic analyzer, production Semantic Finding, Deep/Recall service, hidden
connection, score, telemetry, or Discover change.

## Verification

Focused receipt/migration tests:

```sh
npm test -- health/domain/reconciliation.test.ts health/store/codec.test.ts health/store/migration.test.ts health/store/reconcileBatch.test.ts health/store/persistence.test.ts health/services/healthService.test.ts
```

They cover v2 codecs and key/timestamp validation, deterministic bytes, v1 and
mixed-file migration with no writes, next-mutation upgrades, batch isolation,
persist-first failure behavior, lifecycle restart coverage, failed-analyzer
subsets, terminal receipt identity, copy safety, and history-failure independence.
The full Health and repository suites retain Inbox/Discover/Semantic coverage.
