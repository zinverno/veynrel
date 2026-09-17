# Local Health analysis (PR 2)

PR 2 adds a dormant, deterministic analysis layer above the PR 1 Finding domain:

```text
Vault + MetadataCache -> LocalVaultSource.capture -> LocalVaultSnapshot
                      -> shared LocalNoteGraph -> eight analyzers -> AnalyzerResult[]
```

`LocalScanCoordinator` captures once, derives one graph, then runs registered
analyzers in code-unit ID order. No FindingStore is instantiated or called. No
ScanRun is created, reconciled or persisted. Nothing is imported from plugin
startup. PR 3 owns application orchestration, scope reconciliation, ScanRun status
and persistence. This module has no AI/network calls, note writes or UI.

## Snapshot and source

`LocalVaultSource.capture(signal)` returns plain transient data. Each note contains
canonical `path`, exact `basename`, captured `mtime`, optional `content`, explicit
`contentAvailable`/`linksAvailable`, unique `resolvedOutgoing` paths and aggregated
`unresolvedLinks: {target, count}[]`. Snapshot coverage records note-list, content
and link completeness separately. Analyzers never receive TFile or Obsidian objects.

The Obsidian adapter uses `vault.getMarkdownFiles()` and authoritative `vault.read()`.
It sorts by path, reads each included note once, and schedules at most
`LOCAL_READ_CONCURRENCY = 8` reads concurrently. Result order does not depend on
completion order. Content read failures leave that note unavailable while retaining
other successful reads; a failure to obtain the note list rejects capture.

The mandatory scope excludes the actual `vault.configDir` root/descendants and
root `.ai-backup`/`.ai-backup-*` directories used by existing Veynrel backup writes.
These exclusions compare case-insensitively to protect case-insensitive filesystems.
An additional `LocalVaultScope.includes` policy may narrow this scope, never widen
it. Templates and arbitrary user folders remain included. Nested folders named
`.ai-backup-*` and root note files with that prefix are not automatically excluded.
Invalid Health paths or duplicate list entries are skipped with incomplete note-list
coverage. Existing domain path validation is reused without modification.

Links come from public `getFileCache` fields: `links`, `embeds`, `frontmatterLinks`
and `referenceLinks` (supported by the existing minimum Obsidian 1.8.7). Internal
references use public `parseLinktext` and `getFirstLinkpathDest`. No wiki-link regex
parser, resolvedLinks internals or filesystem crawling is used. URI schemes and
protocol-relative URLs are external. Resolved attachments and excluded notes are
not graph edges and are not broken links. Heading/block subpaths are passed through
as technical evidence but only the file destination is checked: missing anchors
inside existing notes are outside v1. Subpath-only links address the source note.

Unresolved technical targets are only trimmed; no case folding, extension insertion,
path guessing or repair occurs. Repeated cached targets aggregate counts. Targets
never become `notePaths` or action `relatedPath`. Targets outside the domain key
bound (4,096 UTF-16 units) or malformed metadata make the note's link coverage
unavailable instead of producing invalid/truncated identity. Evidence longer than
500 units uses an explicit length/truncation marker while keeping the full key.

Capture is not a transaction. The adapter detects a changed path/mtime during a
note's read and excludes that note's content and links. It cannot detect every
concurrent edit, an added/deleted note after enumeration, or a metadata cache that
has not caught up despite being present. PR 3 must account for staleness; `mtime`
is a captured observation, not a guarantee of filesystem-wide consistency.

## Shared graph and completeness

The derived graph contains only captured in-scope Markdown notes. Edges are unique,
ignore self-links, and require trustworthy source metadata. Frozen adjacency arrays
provide incoming/outgoing neighbors in deterministic order. Connected components
interpret directed edges as undirected adjacency. Graph building/traversal is
O(V + E), with additional sorting for deterministic materialization.

The context creates frozen copies of snapshot records, arrays and graph adjacency;
one analyzer cannot mutate another's inputs. Graph completeness requires both
complete note enumeration and complete link metadata, checked against every note's
availability as well as the snapshot flags. Content completeness similarly checks
every note. Missing metadata is never interpreted as trustworthy zero degree, and
missing content is never treated as an empty note.

| Analyzer ID (all version `1`) | Dimension | Finding type(s) | Coverage needed for `complete=true` |
| --- | --- | --- | --- |
| `broken-links` | structure | `broken-link` | Complete note list and all link metadata |
| `orphans` | structure | `orphan-note` | Complete graph |
| `no-incoming-links` | structure | `no-incoming-links` | Complete graph |
| `no-outgoing-links` | structure | `no-outgoing-links` | Complete graph |
| `note-shape` | structure | `empty-note`, `near-empty-note` | Complete note list and all content |
| `exact-duplicates` | connections | `exact-duplicate-group` | Complete note list and all content |
| `duplicate-titles` | connections | `duplicate-title-group` | Complete note list only |
| `graph-components` | connections | `isolated-graph-component` | Complete graph |

IDs are persistent compatibility identifiers, not UI labels. Version changes must
accompany changes to analysis semantics. The registry exposes explicit IDs/versions;
the coordinator rejects duplicates and snapshots registry identities at construction.
All candidates have source `local` and confidence `deterministic`.

On partial coverage, broken links, note shape and exact duplicates retain safe
observations from available notes. Duplicate titles may retain known groups from
an incomplete list. Orphans, no-incoming and graph components return no candidates
without complete graph coverage. No-outgoing may report a note with trustworthy own
metadata, zero outgoing edges and at least one known incoming edge; its incoming
count is marked incomplete when it is only a lower bound. An incomplete note list
suppresses even these positives because an omitted destination might be relevant.
All partial results remain `successful=true, complete=false`.

Completeness authorizes future absence reconciliation only for the exact analyzed
scope. PR 3 must distinguish changing scope policies, partial scans and failed
analyzers; it must never feed changed-files-only candidates into complete-scope
reconciliation. This PR supplies no persistence or scan scheduler.

## Analyzer rules and identity

Every built-in uses `localCandidate`, which delegates to the existing
`createFindingFingerprint`. Outputs sort by fingerprint using code-unit comparison.
There is no random/time/locale input in analysis results. Titles/explanations never
enter identity.

- **Broken links:** one attention Finding per source path and unresolved technical
  target; occurrence count, bounded target and source path explain it. Identity
  uses the source path plus target key. The action only describes opening the note.
- **Degree classes:** incoming=0/outgoing=0 is orphan only; incoming=0/outgoing>0
  is no-incoming; incoming>0/outgoing=0 is no-outgoing. All are review Findings with
  incoming/outgoing evidence and conceptual open-note/find-connections actions.
  Unresolved links and self-links cannot rescue an orphan.
- **Note shape:** remove an optional leading BOM and normalize line endings, then
  strip only a leading, closed `---` frontmatter block. Malformed/nonleading blocks
  remain body. Count Unicode letters/numbers; emoji and combining marks alone do
  not count. Zero is `empty-note` (review); 1–31 is `near-empty-note` (info); 32+
  produces no Finding. `NEAR_EMPTY_MEANINGFUL_CHARACTERS = 32`. No body/snippet is
  copied to evidence.
- **Exact duplicates:** remove one leading BOM, normalize CRLF/CR to LF and trim
  outer whitespace only. Retain internal whitespace, case, formatting, headings
  and frontmatter. Eligibility requires 32+ meaningful body characters after this
  normalization and frontmatter exclusion, so metadata-only placeholders do not
  generate duplicate noise. Comparison still includes the complete frontmatter.
  Hash buckets contain native maps keyed by the actual normalized strings; hash
  collisions never imply equality and do not require pairwise body comparisons.
  One group produces one review Finding. Its key is
  `v1:<UTF16 length>:stableHash(content):stableHash("veynrel-duplicate-v1:" + content)`
  with fingerprint `paths: []`. Adding/removing a member preserves the identity of
  the duplicated content pattern, allowing future dismissal to remain durable.
- **Duplicate titles:** exact basename comparison, case-sensitive, one review
  Finding per group of two or more paths. The key is the basename, with fingerprint
  `paths: []`; changing membership preserves title-pattern identity.
- **Graph components:** ignore singletons. Among multi-note components choose the
  largest as primary, breaking ties by smallest first path. This is a deterministic
  anchor, not an importance score. Emit one review Finding for each remaining
  multi-note island. The key is `v1:<size>:stableHash(JSON.stringify(sortedMembers))`,
  with fingerprint `paths: []`. Membership changes may change identity in v1.

Groups store at most the first 100 sorted representative paths. Exact duplicates
and titles retain `member-count` and `represented-path-count`. Components retain
`component-size`, `represented-path-count` and `primary-component-size`. Thus a
bounded representative list never claims to be the complete group. No raw duplicate
content or unbounded member list enters fingerprint text. Hash signatures are not
cryptographic guarantees; actual content equality establishes duplicate groups.

## Failures, cancellation and limits

Each result contains analyzer ID/version, `successful`, `complete`, candidates and
diagnostics. An unexpected analyzer exception or invalid output becomes an isolated
`successful=false, complete=false` result with no candidates and a fixed technical
diagnostic. Later analyzers continue. Original exception messages/stacks are not
returned. Built-in diagnostics use fixed messages and optional validated paths;
snapshot diagnostics are sorted and capped at 100, with a separate omitted count.

Cancellation propagates as `AbortError`, including between analyzers and during
snapshot reads, graph traversal and grouping. Periodic event-loop yields let actual
abort events run; outputs do not depend on scheduling. The coordinator can stop
awaiting a blocked source/analyzer. Obsidian has no abortable `Vault.read`, so at
most eight already-started reads may finish in the background; no new reads are
scheduled after cancellation. One synchronous normalization/hash operation is not
preemptible. Custom analyzers must honor the supplied signal themselves.

The snapshot retains content in memory: cost is O(total captured content + V + E),
plus normalized strings while duplicate grouping runs. Read concurrency bounds I/O,
not total memory. There is no fuzzy matching, large-vault disk cache, worker pool,
UI, settings migration or persistence in this PR.

## Verification

Synthetic tests exercise the Obsidian API adapter, every analyzer, forced hash-bucket
collisions, group truncation, full-registry validity/order/noise, incomplete coverage,
cancellation and isolated failures. Native app rollout is not claimed for this
dormant layer. Run:

```sh
npm ci
npm run typecheck
npm test -- health/analyzers
npm test -- health
npm test
npm run lint
npm run audit:proposals
```

Production esbuild inputs must continue excluding Health. Existing Health strictness,
settings, indexes, command IDs, Companion/MCP/proposal behavior and version stay
unchanged.
