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

Current development layout (historical extraction names are retained elsewhere in this report):

```text
parent/
  veynrel/
  veynrel-companion/
```

Each repository has ordinary `npm ci`, test, typecheck, lint and build commands that need no sibling checkout. See the root README for the optional two-repository smoke and Companion's README for its independent server workflow. Historical audit/premerge documents intentionally retain the old package paths and counts.

## Scanner and verification

The [scanner report](obsidian-hosted-scanner-repro.md) preserves the authenticated Preview provenance and separates unresolved declarations from server source scope. Local official lint before extraction: **0 errors / 4 warnings**, Companion **0**. Documented scanner recipe before extraction: **31 source findings**, including **20 standalone-only**. Extraction does not claim a hosted type-resolution fix. Final source counts, commands, integration/native evidence and exact CI heads are appended after verification.

## Completed verification — September 15, 2026

Implementation commit: plugin **32ada48181c5c30923ac730a835ac064d5f4e646**. Companion main: **6d31ccacbace36533568cddb6624e386fc8c3eb5**. Subsequent plugin report/evidence commits do not change runtime code. Public Companion is independently cloned at `/home/zinvernix/projects/obsidian_ai_hub/vault-audit-ai-companion`; the canonical plugin sibling is `/home/zinvernix/projects/obsidian_ai_hub/vault-audit-AI`. Both have independent `.git` directories. The original `plagin_CLAUD` checkout is retained, including its ignored local Companion configuration/data, which were not read or used for testing.

The [16-entry history mapping](extraction-evidence/history-mapping.json) verifies **each** extracted commit against its original subtree, including author identity, author date and committer date. All sixteen subtree comparisons pass. Companion's `src/` has no changes relative to the filtered history tip; normalization changes documentation, independent CI, tests and audit paths only.

| Check | Plugin | Companion |
| --- | --- | --- |
| `npm ci` | PASS, npm 11.11.0 | PASS, npm 11.11.0 |
| `npm test` | **793/793**, 29 files | **218/218**, 15 files |
| TypeScript | `npx tsc --noEmit --module ES2020 --ignoreDeprecations 5.0`: PASS | `npm run typecheck`: PASS |
| `npm run lint` | **0 errors / 4 retained warnings** | **0 errors / 0 warnings** |
| `npm run build` | PASS | PASS |
| `npm run audit:proposals` | **5/5** killed, restored tests pass | **6/6** killed, restored tests pass |
| `npm run audit:mutations` | Server-only check | **21/21** killed, restored tests pass |
| `npm run smoke:mcp` | Server-only check | Modern and legacy protocol, before/after process restart: all five read tools; **4 query embedding calls / 0 stored-note embedding calls** |
| `git diff --check` | PASS | PASS |

These ran from fresh, independently cloned sibling checkouts. Exact commands, timings and clean Git state: [plugin](extraction-evidence/final-plugin.json), [Companion](extraction-evidence/final-companion.json). Test and audit transcripts are in the same evidence directory. Plugin's previous 792 tests become 793: the old function-identity test across package paths is replaced by two independent frozen-wire contract tests. Companion gains two contract tests (216 → 218). No existing security assertion was removed.

Implementation CI passed on the exact commits: [plugin 32ada48](https://github.com/zinverno/vault-audit-AI/actions/runs/34945946154), [Companion 6d31cca](https://github.com/zinverno/vault-audit-ai-companion/actions/runs/34945887570). The PR's checks additionally cover its final documentation/evidence head; the handoff report identifies that final SHA.

### Scanner and bundle after extraction

| Same documented scanner recipe | Before | After |
| --- | ---: | ---: |
| Source findings | 31 | **11** |
| Standalone server findings | 20 | **0** |
| Pure proposal denylist advisories | 2 | **2** |
| Other plugin findings | 9 | **9** |

[After results](extraction-evidence/source-scope-after.json). Local configured official lint remains 0 errors / 4 warnings; the extra seven documented-recipe findings are the same existing sentence-case literal examples. There are **zero tracked `companion/` files**. [Every remaining Node API reference](extraction-evidence/node-import-classification.json) is classified as a test, development script or historical documentation/evidence. No standalone server implementation remains in tracked plugin source.

Production bundle: **421,023 bytes**, SHA256 **6d6eb44d033672dae94c1b8a0b15158c905b07fe4e38aee20dc6d244ab2fdcdd**, 60 metadata inputs, **zero Companion-package inputs**, only external import `obsidian`. The build now rejects *all* old `companion/` inputs and parent-directory inputs; the previous two-file exception is gone. [Bundle evidence](extraction-evidence/bundle-after.json). Manifest remains 1.7.0, `isDesktopOnly: false`; release assets and tags are unchanged.

### Two-repository integration

`npm run companion:smoke-sibling` passed using the default sibling layout, clean Git states and the production Companion build. [Ten scenario results and sanitized server log](extraction-evidence/sibling-wire.json): startup/status; auth and version rejection; reconcile/sync/semantic mirror; MCP retrieval/search; proposal retrieval and explicit application; rejection/unsafe proposal denial; invalid vectors/JSON; controlled malformed responses/server error; clean shutdown/persisted restart/reconnect; provider credential isolation. Fixed JSON fixtures are byte-identical across repositories, and independently tested hashes include Cyrillic, astral Unicode, CRLF/LF, combining characters and a lone UTF-16 surrogate.

This helper uses the actual plugin client/application code with a Node fetch transport and an in-memory Vault adapter. It is **not** presented as native Obsidian UI coverage. Basic CI remains independent; maintainers should run this optional wire smoke against both candidate checkouts whenever changing protocol behavior. Fixture changes on only one side fail the sibling comparison. Existing per-repository wire/schema/security tests and the frozen fixture run in ordinary CI.

### Native Desktop gate

**NATIVELY VERIFIED:** Manjaro Linux, existing graphical session (`DISPLAY=:0`, Wayland session; no Xvfb required), actual **Obsidian API/app 1.12.7**, **Electron 39.8.10**, Chromium **142.0.7444.265**, embedded Node **22.22.1**. The launcher used `/usr/lib/obsidian/obsidian.asar`; a cached 1.13.7 update existed but was **not** the executed app. Node 24.14.1 ran the separate Companion. Do not infer the executed version from the cache filename.

The fresh disposable vault/config/data live under `/tmp/vault-audit-extract/native/`. [Build identity](extraction-evidence/native-identity.json) proves installed and built `main.js` match. [Native results](extraction-evidence/native-desktop-results.json) and [Companion settings screenshot](extraction-evidence/native-companion-settings.png) cover:

- Plugin startup, 20 commands, settings with 34 controls and Companion configuration.
- Actual Obsidian `requestUrl` connection to the real sibling Companion, explicit indexing consent, **3 notes / 3 vectors** synced, and semantic search with 3 matches.
- MCP proposals queued without writing; native preview/approve/reject button callbacks; actual on-disk approved content; double-click applies once; replay only acknowledges the already completed operation.
- **Four** disable/enable cycles: 20 → 0 → 20 commands, stable workspace event counts, preserved settings and working reconnect.
- Real server stop/start and native reconnect/sync; the actual Companion settings connection button.
- Full vault reload after waiting for persisted plugin state: plugin loads with 20 commands and Companion ready. Obsidian window closes with **exit 0**.

The previous gate's native infrastructure was reused, including its mock provider and recording proxy. Its [23 negative/security cases](extraction-evidence/native-mcp-negative.json) all passed against the extracted server: auth separation, path/ID/proposal denial, wrong dimensions, huge/non-finite/zero/Float32-overflow vectors, invalid JSON, and recovery. **39** recorded native Companion requests contained **zero provider-key leaks**. New tests use synthetic credentials only; no personal vault or existing Companion instance is accessed.

Android: **NOT NATIVELY VERIFIED IN THIS EXTRACTION PASS.** The prior gate's `.smoke-android` SDK/emulator was removed, `adb` and `emulator` are absent, and only its APK/automation scripts remain. The conditional reduced Android check could not reuse an installed runtime. Official mobile lint and browser-target bundle checks pass, no Node-only module enters the plugin, and the earlier actual Android gate remains preserved in `obsidian-premerge-smoke.md`; that historical execution is not relabeled a new mobile pass. Popout coverage likewise remains the earlier gate; no new popout claim is made for this narrower extraction.

### Failures investigated and log review

No new product/runtime defect was discovered. [Log classifications](extraction-evidence/verification-log-review.json) distinguish sandbox `listen EPERM`, one interrupted mutation baseline (exit 143), and test-instrumentation corrections from product errors. All affected checks were rerun successfully. Vite's JSON transform could not load the intentional lone-surrogate fixture; reading the raw fixture retained that coverage. The native harness initially named a nonexistent `_events` field; the actual registry comparison passed after correction. Its first immediate reload raced Obsidian's debounced plugin-list save; a physical file-state barrier took 1,014 ms and the subsequent reload passed. No production workaround was added.

Native plugin error listeners remained empty through lifecycle checks. Remaining logs are expected: first-launch absent window-state JSON, the host Electron development CSP warning (no headers weakened), Node's SQLite experimental warning, and controlled security-test denials. Clean full verification and both CI runs passed.

### Remaining risks and handoff

- Hosted Preview internals/install logs remain unavailable. A fresh post-extraction Preview is not claimed; extraction fixes source scope only. npm 10's lockfile-install failure is reproduced and documented separately.
- Protocol copies require discipline: ordinary CI checks fixed contracts, while the optional sibling smoke verifies live candidates together. No runtime filesystem coupling is introduced.
- Android/popout were not repeated; this change relocates pure protocol/hash code, with unchanged server runtime and unchanged plugin feature logic. Prior native evidence remains intact.
- Plugin `npm ci` still reports **7 development dependency advisories (4 moderate, 3 high)**. No dependency version/lockfile change is folded into extraction. The four official plugin advisories remain visible. Node SQLite remains experimental.
- Existing deployments using a relative `DATA_DIR` must keep the old absolute data location when changing checkout; Companion README documents this. There is no database, token or protocol migration.

Recommendation: **EXTRACTION READY TO MERGE** after confirming the final plugin PR's CI is green. Companion `main` is independently healthy. Leave the extraction PR unmerged for the maintainer; no release, version bump, tag operation or upstream issue/comment post is part of this task.
