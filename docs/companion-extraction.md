# Companion repository extraction

Baseline: plugin `main` **1a978e3046a8032db8afbe421c9203d0caedd095**, merged PR #21. Initial local checkout was clean on `fix/obsidian-review-scorecard` at `fdba1b533a9dcedab49113ffb1ab0460b1f35811`; all remotes were fetched before creating `refactor/extract-companion-repository` from current main. Baseline GitHub CI passed. Node 24.14.1 / npm 11.11.0.

## Ownership and dependency boundary

| Component | Old location | New location | Runtime owner / reason |
| --- | --- | --- | --- |
| Standalone Companion | `companion/` | [vault-audit-ai-companion](https://github.com/zinverno/vault-audit-ai-companion) repository root | Node 24 HTTP/auth/SQLite/MCP/Qdrant server; independent install/deployment |
| Plugin Companion integration | `companionSync/` | **Unchanged plugin directory** | Obsidian client, settings, sync queue and semantic snapshot integration |
| Proposal wire types and validation | `companion/src/proposals/types.ts` imported by plugin | Plugin `companionSync/proposalTypes.ts`; server `src/proposals/types.ts` | Independent pure implementations of the same v1 contract and denylist |
| Deterministic UTF-16 hash | `companion/src/proposals/contentHash.ts` re-exported by plugin | Plugin `chunking/hash.ts`; server `src/proposals/contentHash.ts` | Wire identifiers checked against fixed values; no shared filesystem imports |
| Approval UI and Vault writes | `proposals/` | Unchanged plugin directory | Explicit approval, atomic preconditions, authoritative Vault writes |
| Other plugin functionality | `main.ts`, settings, semantic, indexing, chunking, RAG, vector store | Unchanged plugin repository | Obsidian runtime; no Node server implementation |
| Proposal mutation audit | One cross-project script | Five plugin probes / six Companion probes | Preserve all eleven assertions while allowing independent CI |

The pre-extraction [import inventory](extraction-evidence/dependency-boundary.json) covers **56 tracked Companion files and 178 relative imports**, with **zero imports escaping the package**. The existing self-contained deployment test independently checks TypeScript imports and parent package dependencies. The two browser-safe modules imported *by the plugin* are the only source coupling that needs replacement. No third npm package is warranted.

Plugin → Companion HTTP dependencies: authenticated status; manifest reconciliation; versioned UPSERT/DELETE/RENAME batches; proposal list/detail/claim/complete/reject. Companion imports no plugin source and never opens the Vault. It returns wire data and stores a mirror.

Duplicated wire concepts: version/header; server/vault status; error envelopes; generations and stale-generation behavior; normalized embedding descriptors (provider, model, endpoint, dimensions, embedding-space ID); note content/hash/metadata; chunk IDs/paths/ordinals/headings/text/hashes/source offsets/lines/vectors; reconcile manifests/plans; batch operations/results; proposal operations, states, immutable base/proposed content and hashes, IDs, timestamps, claim lease/completion/status codes and pagination. Client-only queue/settings state and server-only persistence schemas are not wire contracts.

Auth boundary: sync credential and opt-in MCP credential are separate; loopback HTTP by default, explicit remote binding and HTTPS considerations. MCP is scoped to one configured vault and can read/query/create proposals; it cannot claim, complete, apply or synchronize. Only plugin approval can mutate the real Vault. MCP's SDK protocol negotiation is separate from Companion HTTP protocol v1. Provider keys are not part of sync payloads; separately configured server embedding credentials remain operator-owned.

Vector boundary: the plugin sends committed semantic descriptors/chunks/vectors; the server validates dimensions, finite Float32 representation and nonzero norm. SQLite is authoritative; optional Qdrant is a derived index. This extraction changes no wire or security behavior.

## History

Non-destructive command in the existing repository:

```sh
git subtree split --prefix=companion 1a978e3046a8032db8afbe421c9203d0caedd095 -b split/companion-history
```

The independent clone contains **16 filtered commits**, from `16019d305728acd47d51354c4afdb002782f7205` (original first Companion change `0644410`) through `a3375c1049fe17e17011140165f1b8f8377fc4ee`. Extracted HEAD tree equals the original commit's `companion` subtree byte-for-byte. [Tree identity and commit metadata](extraction-evidence/history.json).

Relevant authorship and timestamps are retained. Commit IDs change because paths, trees and parents change. Plugin-only changes, original merge topology outside the prefix, PR discussions and cross-project portions of mixed commits are not replicated; original public history remains available and untouched. Migration commits follow the filtered history. The final sibling checkout has its own `.git`, not a worktree or nested repository.

## Compatibility and local development

HTTP protocol remains **1**, header **`x-companion-protocol-version`**. The repositories are independently installable. Fixed v1 JSON/hash/path fixtures and wire tests guard the duplicated contract; an optional sibling smoke exercises the real plugin client against the real built server. Changes to either side must preserve the v1 fixtures or explicitly introduce a negotiated protocol version. No runtime import may reference a sibling directory.

Expected development layout:

```text
parent/
  vault-audit-AI/
  vault-audit-ai-companion/
```

Each repository has ordinary `npm ci`, test, typecheck, lint and build commands that need no sibling checkout. See the root README for the optional two-repository smoke and Companion's README for its independent server workflow. Historical audit/premerge documents intentionally retain the old package paths and counts.

## Scanner and verification

The [scanner report](obsidian-hosted-scanner-repro.md) preserves the authenticated Preview provenance and separates unresolved declarations from server source scope. Local official lint before extraction: **0 errors / 4 warnings**, Companion **0**. Documented scanner recipe before extraction: **31 source findings**, including **20 standalone-only**. Extraction does not claim a hosted type-resolution fix. Final source counts, commands, integration/native evidence and exact CI heads are appended after verification.
