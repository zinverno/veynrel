# Veynrel Health foundation

The [integrated MVP audit](mvp-hardening.md) consolidates current ownership, passive
IO, migration/recovery contracts, native evidence and remaining limitations.

The current main IA is **Health | Findings | Discover | Recall | Connect | Tools | Settings**, inside
the same `VeynrelHealthView`. [Veynrel Connect](veynrel-connect.md) adapts the existing
Semantic-owned Companion service and proposal review implementation. It is not a
fifth Health dimension and creates no Findings or scan receipts. Its route is
transient, opening it is passive, and reopening Veynrel still starts on Health.
The [final product IA](product-ia.md) adds a passive Tools catalog over existing
host operations and a Settings overview over cached capability snapshots. No new
view type, engine, owner or durable route is added.

The dormant local snapshot, analyzer and coordinator layer added in PR 2 is
documented in [Local Health analysis](local-health-analysis.md). PR 3 connects them
through the [Health application layer](health-application-layer.md), including
freshness guards, batch reconciliation, aggregation and recommendations. PR 4 adds
the [native Health home](health-view.md) with lazy ownership, manual scans and
explicit storage recovery. The original foundation contracts are described below;
the application document explains batch commit receipts and restart behavior.

[Recall Health](recall-health-integration.md) derives a native review signal
from the existing shared Recall product through a Health-owned port. It loads
metadata only after normal Health entry, creates no Findings or Health writes,
and does not trigger Knowledge analysis.

[Deep Intelligence setup](deep-intelligence-setup.md) adds an inline capability
section through a Health-owned product port. One plugin-lifetime Deep controller
uses the existing language-model settings and connection test. Health imports no
LLM transport, settings implementation or Deep engine. Configuring this capability
does not enable the Knowledge dimension or create Findings/scan receipts.

[Knowledge Health](knowledge-health.md) enables Knowledge after an explicit,
confirmed MAP-only Deep analysis. A Health-owned port injects the existing Deep
engine without an index; the same HealthService/FindingStore owns reconciliation.
Deep scope receipts, version checks and vault/configuration freshness protect
coverage. Only draft-quality notes create medium-confidence review Findings.

The first production Semantic analyzer is documented in
[Semantic duplicate Health Findings](semantic-health-duplicates.md). It injects
a Health-owned analysis port into the same HealthService/FindingStore owner.
Explicit Local, Semantic and Deep scans share exclusion; engine imports stay
outside Health. Scope receipts independently associate all three sources after restart.

Health introduces a shared domain for knowledge-base observations. Analyzers emit
candidates, reconciliation maintains Findings, and HealthService consumes them.
The foundation PR introduced the domain contracts and persistence described here.
PRs 1–3 were dormant. PR 4 registers the view without automatic analysis; opening
Health initializes metadata lazily.

## Boundaries

`health/domain/` contains serializable types, identity helpers and validators.
`health/store/` contains FindingStore, versioned codecs and a DataAdapter-backed
storage port. The only Obsidian import is a type-only DataAdapter import in the
filesystem adapter. There are no DOM/UI classes, callbacks in persisted objects,
Markdown writes, note reads, AI calls, network access or scan execution.

Finding is the central durable observation: technical identity, explanatory facts,
conceptual actions and user lifecycle state. FindingCandidate has the descriptive
fields plus `analyzerId`, but cannot carry ID, timestamps, state or snooze metadata.
The store rejects extra fields at input and persistence boundaries. Actions have
`kind`, optional `label`, `path` and `relatedPath`; they describe capabilities and
never execute them. Future executors must perform their own authorization checks.

Evidence has `kind` and optional `label`, primitive `value`, `path`, `relatedPath`
and `snippet`. Kinds are extensible technical identifiers. Snippets and string
values are limited to 500 UTF-16 code units, labels/titles to 200, explanations to
2,000, paths to 4,096. A Finding has at most 100 note paths, 50 evidence items and
20 actions. Numbers must be finite. Unknown fields (including note-body fields)
are rejected; callers must supply small explanations, never complete note bodies.

VaultProfile defaults to `mixed` without inferring a profile or adding settings.
HealthState, AnalysisDepth and Recommendation were initially contracts only. The
application layer now derives aggregation and recommendations; onboarding remains
out of scope.

## Identity and paths

`createFindingFingerprint` emits an inspectable, versioned JSON tuple:

```text
v1:[source,analyzerId,dimension,type,sortedUniquePaths,keyOrNull]
```

JSON escaping avoids delimiter ambiguity. Paths form an unordered set; pair A/B
and B/A are identical. Directional observations must include a stable technical
`key` encoding the source/target roles. Localized title/explanation never enter the
helper. Callers may supply an opaque fingerprint, but must uphold these stable
technical identity rules. Changing ownership, dimension or type while reusing a
stored fingerprint is rejected. Duplicate candidate IDs reject the entire batch.

`id = "finding-" + stableHash(fingerprint)`. The existing UTF-16 two-lane hash was
moved unchanged from `chunking/hash.ts` to `utils/stableHash.ts`; the old module
re-exports it, preserving all callers and existing chunk/protocol hash vectors.
Health does not depend on chunking. The proposal mutation harness copies the new
utility into its scratch checkout; its mutations and assertions are unchanged.
The hash is not cryptographic. Reconciliation compares full fingerprints and
ownership, failing closed on a detected ID collision.

Paths must already be canonical vault-relative strings: `/` separators, no empty,
`.` or `..` segments, no absolute/drive paths, backslashes, colons, control
characters, surrounding segment whitespace or trailing dots. Case and Unicode
are preserved. Non-Markdown targets are allowed for future link evidence. Paths
are validated, never repaired or used to access notes by this module.

Existing indexing/search validators are private and tied to their module errors;
the exported vector helper normalizes rather than rejects malformed paths.
`validProposalPath` additionally enforces Markdown and a write-protected config
boundary. None is a suitable reusable Health identity validator. Health therefore
keeps one bounded validator shared by its identity, persistence and filesystem
root checks, without changing existing path semantics elsewhere.

## Lifecycle and reconciliation scope

`reconcile({scope: {source, analyzerIds}, candidates, complete, seenAt?})` accepts
only candidates owned by that explicit source and analyzer set. Analyzer IDs must
remain stable across versions. Version information belongs to ScanRun, not identity.
`complete: true` asserts successful coverage of **all paths** for every selected
analyzer. A future partial/incremental/failed scan must use `complete: false` or
omit failed analyzers from its completed scope. It must never claim full coverage
from a changed-files-only candidate list.

| Previous state | Detected | Missing, complete scope | Missing, partial scope |
| --- | --- | --- | --- |
| New | Create open | — | — |
| Open | Keep open | Resolve | Keep |
| Dismissed | Keep dismissed | Keep dismissed | Keep |
| Snoozed | Keep before deadline; reopen at/after deadline | Resolve, clear deadline | Keep |
| Resolved | Reopen | Keep resolved | Keep |

Every detected existing Finding counts as updated, refreshes explanatory fields
and `lastSeenAt`, and preserves ID and `firstSeenAt`. Absence does not change
`lastSeenAt`: it is the last detection time. Reopening a resolved Finding preserves
its original history. Dismissal survives absence and recurrence; only explicit
`reopen` changes that user intent. Deadlines are removed on dismiss/reopen/resolve.
There is no expiry timer; snoozes reopen only on detection or explicit reopen.

An injected clock defaults to `Date.now`. `seenAt` defaults to that clock; snooze
expiry uses the current clock when the queued reconciliation executes. Timestamps
are non-negative integer epoch milliseconds within Date's representable range.
Snooze deadlines must be strictly in the future. A scan older than a scoped
Finding's last detection is rejected. This is not a scan scheduler: future scan
execution must serialize completions per scope; there is no persisted per-scope
watermark to arbitrate out-of-order scans after an absence.

`dismiss`, `snooze`, `reopen`, `get` and `list` have no UI dependencies. Invalid IDs
throw; `get` returns undefined for a valid unknown ID; mutations of unknown IDs
reject. Lists filter by state/dimension/source and return `lastSeenAt DESC, id ASC`
using code-unit comparison. All returned records and nested arrays/maps are copies.

## Storage and failures

The plugin controller constructs the storage adapter with:

```ts
const storage = new ObsidianHealthStorage(
  app.vault.adapter,
  healthStorageRoot(app.vault.configDir, plugin.manifest.id),
);
const store = new FindingStore(storage);
const status = await store.load();
```

The default clock is optional to override. The controller creates this owner
lazily when Health opens. No directories or files are created
on load. On the first explicit write, validated directories are created recursively,
with checks for directory-creation races and file/directory collisions.

Exact paths for the existing manifest ID:

```text
<app.vault.configDir>/plugins/ai-knowledge-hub/health/findings.json
<app.vault.configDir>/plugins/ai-knowledge-hub/health/scan-runs.json
```

Both current envelopes use schema version `2` and numeric `updatedAt` epoch
milliseconds:

```ts
{ version: 2, updatedAt: number, reconciliationReceipts: Record<ReconciliationOwnerKey, number>, findings: Record<FindingId, Finding> }
{ version: 2, updatedAt: number, runs: ScanRun[] }
```

Every ScanRun includes `reconciliationReceipts`. Global Findings `updatedAt`
tracks file writes; scope receipts identify source/analyzer reconciliation.
Lifecycle changes preserve them. See [receipt semantics and v1 migration](health-reconciliation-receipts.md).

All object keys are serialized deterministically; note path sets are deduplicated
and sorted on reconciliation. Evidence/action array order is meaningful and kept.
The findings map key must equal the validated deterministic ID.

`load()` returns independent findings/scan-history statuses: `loaded`, `missing`,
`invalid`, `unsupported`, or `unavailable`. Missing is a writable empty store.
Malformed JSON, invalid entries (including a single invalid Finding), unsupported
versions and read errors produce empty **write-blocked** state for the affected
file. No silent salvage, coercion or overwrite occurs. Supported v1 loads and
migrates in memory without writes; the next actual mutation writes v2. The other
file remains usable. Recovery requires external repair and a new store instance;
`load` is idempotent and cannot reload stale disk over committed in-memory changes.

Every load/mutation/save is serialized within FindingStore. Mutations prepare a
new snapshot, await persistence, then publish it in memory. Failed writes reject
without publishing uncommitted state, and the promise queue remains usable. Inputs
are validated and copied before enqueueing. The filesystem adapter also serializes
its operations. Integration must use one store owner per storage root; there is no
cross-instance/process/device lock or sync conflict resolution.

Writes use the existing Obsidian `DataAdapter.write` contract. This is deliberately
not a journal or database: no crash-atomicity, backup recovery or cross-file
transaction is promised. Interrupted/truncated files are detected on the next
load and write-blocked. Scan history and findings are independently committed;
future orchestration must handle failure between reconciliation and scan recording.

Scan history retains at most `MAX_SCAN_HISTORY = 50` unique run IDs, ordered by
`startedAt DESC, id ASC`. Upserting running progress does not duplicate a run;
identity and counters cannot move backward. Terminal runs require `completedAt >=
startedAt`; running runs omit it and have empty receipts. Running-to-final upserts
may add committed receipts; terminal receipt identity cannot change. An oversized
persisted history is invalid rather than silently truncated; normal writes enforce
the bound before saving.

Health storage is separate from `data.json`, `note-index.json` and `semantic-index/`:
Findings are observations and lifecycle state, not note metadata or vector data.
Existing user settings, note-index schema, vector format, commands, Deep Audit,
Companion/MCP and proposal approval semantics remain unchanged. No manual data
migration, plugin version bump, new runtime dependency or AI/network permission is needed.

## Extension points and verification

Later PRs can add analyzers that emit FindingCandidate, scan orchestration,
HealthService aggregation and recommendations, then UI/adapters. This PR does not
implement any of them. The Health subtree has its own strict TypeScript config,
run by the existing `npm run typecheck` command; repository-wide strictness is
unchanged. Tests cover identity, lifecycle, untrusted snapshots, history retention,
filters, copy isolation, storage failures and overlapping writes. Run:

```sh
npm ci
npm run typecheck
npm test -- health
npm test
npm run lint
npm run audit:proposals
```
