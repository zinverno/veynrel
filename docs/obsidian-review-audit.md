# Obsidian Community review audit — 2026-09-14

The public **Review: Risks** result is reproducible as an Obsidian-type-resolution failure. It was not caused by Companion: the reviewed 1.7.0 release predates that package. Current source has a separate, reproducible scanner-scope problem affecting standalone server code. This branch fixes real note-write/API issues, strengthens local checks, and preserves all remaining warnings. A clean public scorecard is **not established** by these changes.

## Baseline and provenance

- Clean, fetched `main`: `edace7ec45295a03c92db8bed4e5b9491e764995`; `git status --short --branch` showed only `## main...origin/main`.
- Branch: `fix/obsidian-review-scorecard`. Plugin version remains **1.7.0**, minimum Obsidian **1.8.7**, `isDesktopOnly: false`.
- Node **24.14.1**, npm **11.11.0**. Two independent npm packages and v3 lockfiles; no workspace/package-manager migration.
- Release 1.7.0: source commit `0641932369d84aa5bcab40a473aa896ca5335810`, published September 3, 2026. Assets: `main.js` (389,883 bytes), `manifest.json` (355), `styles.css` (44,718).
- The original repository URL redirects to `zinverno/vault-audit-AI`. No remote URL, release tag, or asset was changed.
- Complete original manifest, package scripts, TypeScript/ESLint/build configurations, lock hashes and release digests: [baseline.json](review-evidence/baseline.json).
- Root build: `main.ts` → esbuild browser/CJS `main.js`, externalizing only `obsidian`. Companion: `src/**/*.ts` → `dist` through its own NodeNext TypeScript configuration; `npm start` runs `dist/server.js` with Node 24. HTTP, SQLite, MCP and Qdrant are server capabilities.
- No CI workflows were tracked at baseline. The earlier health work in commit `a4caa172933d5f45af3bfdcc91dd881950553383` / PR #13 intentionally added type-aware lint, buffered `requestUrl`, response validation, cancellation handling and specific text/test exceptions. Those protections remain.

The [public scorecard](https://community.obsidian.md/plugins/ai-knowledge-hub) was retrieved directly, including its serialized UI findings: **Health: Excellent; Review: Risks; 2,658 total issues; 2,654 lint warnings**. Its informational UI also identifies **one network call** and missing attestations for **main.js and styles.css**. The UI's aggregate is recorded as displayed; the network count is not a complete traffic inventory. Every exposed lint location, including repeated same-line findings and line ranges, is saved in [public-scorecard.json](review-evidence/public-scorecard.json), together with the fetched HTML's SHA-256.

| Public rule/message | Count |
| --- | ---: |
| `@typescript-eslint/no-unsafe-call` | 1,104 |
| `@typescript-eslint/no-unsafe-member-access` | 1,037 |
| `@typescript-eslint/no-unsafe-assignment` | 352 |
| `@typescript-eslint/no-unsafe-argument` | 90 |
| `@typescript-eslint/no-unsafe-return` | 61 |
| `@typescript-eslint/no-redundant-type-constituents` — intrinsic `error` union type | 8 |
| `no-restricted-globals` — streaming `fetch`, `api.ts:413` | 1 |
| `obsidianmd/settings-tab/prefer-setting-definitions`, release `settings.ts:100` | 1 |

## Root causes and fixes

Membership below means the source module contributes bytes to the emitted bundle; TypeScript annotations themselves are erased. “Manual” findings were discovered by tracing source and callers, not invented scorecard messages.

| Finding / rule | File and location | Component/category | Ships in main.js | Assessment and action |
| --- | --- | --- | --- | --- |
| 2,652 derived type-resolution warnings | Exact release locations in the evidence JSON; 2,650 in emitted modules, 2 in the factory below | Plugin A/B | Mostly yes | Environmental false positives. Removing only the release copy's `node_modules/obsidian` reproduces the exact 2,654-warning multiset, including the two ordinary advisories. Restoring types yields 0 errors / 2 warnings. No casts or disables added to those reported locations. |
| Two unsafe-member warnings in unused plugin factory | Release `indexing/obsidianFactory.ts:25,29` | Plugin B | No | Same missing-types cascade. Factory is outside the emitted graph, but remains typechecked and linted. |
| Stale AI output overwrites a concurrently edited note (manual) | Baseline `main.ts:1208,1291`; now `noteWrites.ts:5` and its two callers | Plugin A | Yes | Real data-loss risk. Exact content, path and file-identity checks run inside `Vault.process`; changed/replaced/renamed notes fail without replacement. |
| Colliding or failed batch backups (manual) | Baseline `main.ts:1204–1208`; now `noteWrites.ts:21` | Plugin A | Yes | Basename-only backups collided and failures were swallowed. Preserve full relative paths under a unique hidden batch folder; stop on backup failure. Hidden backups use the Vault adapter, as required for hidden files. Actual notes use `Vault.process`. |
| Read/modify race when appending atom links (manual) | Baseline `main.ts:1563–1572`; current atomize append | Plugin A | Yes | Append and duplicate-section check now run in one synchronous `Vault.process` callback against current text. |
| Undocumented `MenuItem.setSubmenu` / `Editor.coordsAtPos` (manual) | Baseline `main.ts:773–789,849–854`; current `awaitInsertionMenu` / `addContextMenuItems` | Plugin A | Yes | Remove type-cast access to non-public APIs. Keep all six actions in a public menu section and use supported placement in the active document. |
| Unchecked stream chunk / inferred unsafe vector value | `companion/src/mcp/queryEmbedding.ts:59,115–120` | Companion C | No | Narrow vector entries from `unknown`; require byte chunks before counting/concatenating them. Preserve sanitized failures, limits, redirects and provider/model checks. |
| Six unnecessary type assertions | `companion/src/mcp/mcpServer.ts:68`; `mcp/pagination.ts:49,73`; `protocol/schemas.ts:149,162,170` | Companion C | No | Remove only assertions made redundant by existing validation/control-flow narrowing. |
| Two deprecated Zod UUID calls | `companion/src/proposals/mcpTools.ts:17,32` | Companion C | No | Use Zod 4's native `z.uuid()`. Proposal tests and capability boundaries still pass. |
| Streaming `fetch` advisory | `api.ts:413` | Plugin A | Yes | Intentionally retained, visible. Obsidian `requestUrl` exposes a buffered response, not SSE streaming. Replacing this would regress streamed writing and Ask your Vault. CORS limitation is disclosed. |
| Settings-search advisory | `settings.ts:108` | Plugin A | Yes | Intentionally retained feature gap. Existing settings work on 1.8.7; they are not indexed by 1.13 settings search. A real declarative UI migration needs compatibility and native UI validation. No empty method or version bump is used to silence the rule. |
| Two hardcoded-config-path advisories | `companion/src/proposals/types.ts:28,33` | Shared plugin/Companion A | Yes | Deliberate security denylist, not a filesystem location assumption: reject `.obsidian` and the actual `Vault.configDir` before approval. Retain both literal checks and warnings. These modules are now included in plugin lint. |
| Missing release attestations | Published `main.js`, `styles.css` | Release provenance | N/A | Prepare a workflow for future manually published releases. It rebuilds the tag, compares all three assets byte-for-byte, then attests them. It cannot publish/replace assets or move tags. Current assets remain unattested. |

The [official Vault guidance](https://docs.obsidian.md/Plugins/Vault) explicitly recommends comparing the original content inside `Vault.process` after asynchronous work. The minimum supported API was separately checked against the official **obsidian@1.8.7** declarations in a disposable source copy: plugin-source TypeScript validation passed. Test mocks were excluded from that minimum-SDK check; the complete normal test/type checks also passed.

## Bundle boundary and scanner scope

The release bundle rebuilt **byte-for-byte**, SHA-256 `9bc35a9ced3d0588e542917f1aeca407bfb74d6058b2f151d39794e914f7d3c5`. Its graph has 42 modules contributing bytes, versus 51 at baseline main and 52 after this change. [bundle-membership.json](review-evidence/bundle-membership.json) records contributing/zero-byte inputs, external imports, hashes and free identifiers from a CJS-aware JavaScript scope analysis.

- **A:** 2,652 public warning locations belong to emitted source modules, including the two ordinary advisories. Current bundled code includes the browser-safe proposal contract/validators in `companion/src/proposals/types.ts` and its pure `contentHash.ts` helper.
- **B:** Two public locations are in `indexing/obsidianFactory.ts`, which contributes no bundle bytes. Barrels and type-only source are still checked by the repository's lint/type configuration.
- **C:** No public 1.7.0 warning is in Companion, tests or CLI code. The release tree contains **zero Companion files**. Current standalone server code and tests never enter the plugin bundle.

No `node:fs`, `fs`, `node:path`, `path`, `child_process`, `node:http`, `node:https`, `net`, `tls`, SQLite or MCP server module is imported by the release or final plugin bundle. No free Node `process`, `Buffer`, `global`, `__dirname` or `__filename` identifier appears. CJS `module` and `require("obsidian")` are expected. `path` is also an ordinary Vault data field, `.exec` occurs in regular expressions, and `.process` now includes the Obsidian Vault method: keyword hits alone are not Node evidence. Server `listen`, subprocess execution and server implementation modules are absent. The HTTP **client** for Companion and shared validation are intentionally present.

The current [official configuration guide](https://github.com/obsidianmd/eslint-plugin/blob/d7e223960226cf747549c5b21313bd187113640e/docs/configuration.md) documents fixed scanner exclusions and recommends separate environments for non-Obsidian packages. It also says the scanner disables unsafe-type rules, unlike the live cached 1.7.0 result. The documented exclusions do not exclude `companion/src`. Neither that guide nor the checked official policies provides a per-package Community opt-out field. Repository ESLint ignores work locally; their effect on the hosted scorecard cannot be established by running local ESLint.

[Issue #178](https://github.com/obsidianmd/eslint-plugin/issues/178) was still open with no comments when checked. Its report is consistent with a future scope risk here, but does not establish this repository's current public cause. The hosted scanner implementation/deployment version was not available for independent verification; its published configuration is a reproducible approximation, not a claim to have executed the private service.

Running the documented configuration on tracked/source TypeScript, excluding its documented tests/tooling/build outputs, gives:

| Same configuration on before/after source | Before | After |
| --- | ---: | ---: |
| Total documented-scanner findings | 40 | 31 |
| Standalone Companion findings | 28 | 20 |
| Shared proposal denylist advisories | 2 | 2 |
| Other plugin findings | 10 | 9 |

Full file/line/rule/message lists: [before](review-evidence/documented-scanner-before.json), [after](review-evidence/documented-scanner-after.json). The diagnostic uses the guide's published severities (the guide notes the hosted service additionally downgrades non-security errors). No production rule is disabled to imitate the service. Generated `companion/dist/*.d.ts` is not repository source and is excluded from this comparison.

The **20 remaining exclusive Companion false positives** are:

| File | Rules / line locations | Count |
| --- | --- | ---: |
| `companion/src/auth.ts` | `no-nodejs-modules`: 1 | 1 |
| `companion/src/config.ts` | `no-nodejs-modules`: 1, 2 | 2 |
| `companion/src/proposals/storage.ts` | `no-nodejs-modules`: 1, 2 | 2 |
| `companion/src/search/qdrantBackend.ts` | `no-nodejs-modules`: 1; `prefer-window-timers`: 42, 51, 92, 171 | 5 |
| `companion/src/search/qdrantIndex.ts` | `no-nodejs-modules`: 1 | 1 |
| `companion/src/server.ts` | `no-nodejs-modules`: 1, 2, 3 | 3 |
| `companion/src/storage/migrations.ts` | `no-nodejs-modules`: 1 | 1 |
| `companion/src/storage/sqliteCompanionStorage.ts` | `no-nodejs-modules`: 1, 2, 3, 4 | 4 |
| `companion/src/mcp/queryEmbedding.ts` | `no-restricted-globals` (`fetch`): 76 | 1 |

Seven additional documented-scanner sentence-case warnings are URLs, an API-key placeholder, tag examples and folder names. The existing narrowly scoped official-rule `ignoreRegex` entries correctly retain their literal spelling. They were not added or widened by this audit, and do not appear in the current public finding list.

**A repository split is not justified.** It cannot fix a scorecard whose analyzed release has no Companion at all; even the simulated current-source scan would retain plugin advisories after a split. A split would require a versioned shared proposal/hash contract (also imported by `chunking/hash.ts`), coordinated protocol/claim compatibility, separated npm/CI and mutation tests, new distribution/versioning for the server, and documentation/link changes. Keep the packages together until Obsidian clarifies supported scan scope or an actual rescan proves the remaining blocker. Do not rename source into a scanner-ignored directory.

## Runtime, security and disclosure audit

| Area | Verified source behavior / limit |
| --- | --- |
| Execution | No plugin `eval`, `new Function`, shell, child process or downloaded executable code. The Ollama installation command is inert settings text. Generated Dataview is inserted into a DQL fence, not executed by this plugin as JavaScript. |
| DOM | No runtime `innerHTML`, `outerHTML`, `insertAdjacentHTML` or raw untrusted HTML injection found. Streaming output and proposal diffs use text APIs. Completed RAG answers use Obsidian's MarkdownRenderer with a dedicated Component and unload handling; code-owned citations remain separate. Obsidian renderers/other installed Markdown processors can load embedded resources, now disclosed. |
| API/lifecycle | No default hotkeys, detach-on-unload custom views, navigator-based platform guessing or Node/Electron runtime imports. Existing command IDs stay stable. CSS helpers and window timers are retained; semantic/Companion services dispose through plugin registration. Six context-menu actions are covered by a public-API-only fixture. Native reload/popout/mobile interaction is not claimed as tested. |
| Network | Buffered OpenAI/OpenRouter/Groq/Ollama/custom chat, model discovery, embeddings and Companion use requestUrl; chat streaming uses fetch. Provider/test/model-list actions are explicit. Provider credentials go to the chosen provider; Companion receives only its independent bearer token. Streaming CORS and requestUrl's lack of physical transport cancellation remain disclosed limits. |
| Privacy | No telemetry/analytics client or undeclared collection found. Settings/keys use local plugin storage. Semantic and Companion enablement default to false; first index creation is explicit. AutoSync, Similar Notes, duplicates and RAG boundaries retain their regression suites. No real notes or provider credentials were used during validation. |
| Persistence | Vault APIs handle note writes; proposals retain immutable-base checks, claim leases, explicit Approve/Reject and FileManager trash. Adapter operations are limited to plugin indexes and private in-Vault backups. Intentional regeneration of generated MOCs remains a full replacement; this is not a read/modify transformation. |
| Remote Companion/MCP | Mirrored Markdown/chunks/metadata/vectors and proposed/base content persist on the configured remote service. MCP cannot claim/apply changes. Provider API keys are not synchronized. Operator-configured Qdrant receives vectors and identifiers/embedding-space metadata, not note text or paths; SQLite remains authoritative. Existing local-only/default-off and HTTPS/consent boundaries remain. |
| Manifest/README | Name/version/ID/minimum/mobile declaration and MIT license are retained. No funding URL needs remediation. README now explicitly covers test/model discovery requests, streaming/CORS, private batch backups, rendered resources and optional Qdrant traffic. |

Policies consulted first: [developer policies](https://docs.obsidian.md/community-directory/developer-policies), [submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins), and the [official ESLint package](https://github.com/obsidianmd/eslint-plugin). No policy exception, `eslint-disable`, new `any` cast, min-version increase, desktop-only flag or reduced consent is used.

## Tooling and regression prevention

Only `eslint-plugin-obsidianmd` was upgraded, **0.4.1 → 0.4.2**, and pinned. ESLint 9.39.5, typescript-eslint 8.67.0, TypeScript 5.3.3 and the rest of the root lock remain unchanged. The current official package is compatible with that toolchain; its new documentation/config exports do not justify a broad upgrade. Project-service type information and all existing plugin rules remain enabled.

`npm run lint:obsidian` runs TypeScript first, builds production metadata, then applies the complete recommended rule set. It includes both shared proposal modules and verifies that every contributing TypeScript input was actually linted. All four retained advisories are printed; a file/rule/count gate prevents a new warning from being hidden by the disappearance of an unrelated one. `npm run lint` also checks Companion. Companion retains strict compiler options and zero lint-warning tolerance, with added unsafe-value, promise, redundant-assertion and deprecated-API checks. Its typecheck now covers source **and tests**.

The ordinary plugin baseline had 0 errors / 2 warnings because shared proposal source was missed. On the corrected scope, the comparable before/after plugin count is **4 → 4**, with zero errors; the two additional warnings are exposed, not introduced. Applying the strengthened Companion rules to baseline source and tests gives **24 errors → 0** (16 unsafe-value findings, six redundant assertions and two deprecations). The documented whole-source scanner comparison is **40 → 31**. These numbers are different measurements and must not be presented as a public score change.

CI installs both lockfiles, runs both test suites and type checks, builds both artifacts, and executes both lint environments. It preserves main.js and dependency metadata as build artifacts. Workflow actions are pinned to official commit SHAs; PR CI has read-only permissions. Release provenance is a separate future-publication trigger and was not executed in this audit.

## Changed files

| File | Purpose |
| --- | --- |
| `main.ts` | Guard asynchronous note replacements, preserve batch backups, append atom links atomically, and use public menu APIs. |
| `noteWrites.ts` | Shared guarded replacement and backup-before-write implementation for batch and flashcard callers. |
| `noteWrites.test.ts` | Check successful writes, same-basename backups, concurrent edits/renames/replacements, backup collisions and disk failure. |
| `mainMenus.test.ts` | Verify all six actions work with only public MenuItem methods. |
| `companion/src/mcp/queryEmbedding.ts` | Validate vector entries and streamed response bytes without unsafe inferred values. |
| `companion/src/mcp/mcpServer.ts` | Remove a redundant assertion from structured MCP output. |
| `companion/src/mcp/pagination.ts` | Use existing cursor validation's type narrowing. |
| `companion/src/protocol/schemas.ts` | Use existing content validation's type narrowing. |
| `companion/src/proposals/mcpTools.ts` | Replace deprecated Zod UUID syntax without changing proposal validation. |
| `companion/tests/queryEmbedding.test.ts` | Reject malformed non-byte streams through the existing sanitized error boundary. |
| `companion/tests/mcpProtocol.test.ts` | Give logger mocks their real method types. |
| `companion/tests/server.test.ts` | Give server logger mocks their real method types. |
| `companion/tests/qdrantIndex.test.ts` | Check parsed request values safely while preserving the adapter assertions. |
| `companion/eslint.config.mjs` | Add nine type-aware Node safety rules; retain zero-warning tolerance. |
| `companion/package.json` | Include tests in the existing strict TypeScript check. |
| `esbuild.config.mjs` | Emit dependency metadata and fail on server/test code or unexpected external imports. |
| `eslint.config.mjs` | Include both bundled shared modules; keep standalone Node code in its own lint environment. |
| `scripts/lint-obsidian.mjs` | Print all findings, reject unexpected warnings, and prove bundle inputs have lint coverage. |
| `package.json` | Pin the current official rule package and add reproducible combined/plugin lint and typecheck scripts. |
| `package-lock.json` | Update only the official Obsidian ESLint package to 0.4.2. |
| `.github/workflows/ci.yml` | Run lockfile installs, tests, lint, types and builds for both packages; preserve build evidence. |
| `.github/workflows/release-provenance.yml` | Attest future published assets only after matching them to the tag's build. |
| `README.md` | Clarify actual network/storage behavior, development checks and release validation. |
| `docs/obsidian-review-audit.md` | Record causes, fixes, scope limits, verification and release recommendations. |
| `docs/review-evidence/baseline.json` | Preserve the original environment, configurations and release metadata. |
| `docs/review-evidence/public-scorecard.json` | Preserve every exposed public lint location and scorecard summary. |
| `docs/review-evidence/bundle-membership.json` | Preserve released/baseline/final module membership, hashes, imports and free-global checks. |
| `docs/review-evidence/documented-scanner-before.json` | Record the current official scanner recipe's baseline findings. |
| `docs/review-evidence/documented-scanner-after.json` | Record findings from the same recipe after the fixes. |
| `docs/review-evidence/verification.json` | Record command results, negative probes, type-resolution reproduction and dependency-audit counts. |

The evidence JSON files are intentional audit deliverables. Generated `main.js`, dependency directories, Companion build output and `.esbuild` metadata remain ignored. No manifest, version file or release tag changed.

## Verification and remaining risks

All required commands passed in a fresh source copy with fresh dependency installs. Exact exits/timings and negative probes are in [verification.json](review-evidence/verification.json).

| Command | Result |
| --- | --- |
| `npm ci` | PASS, exit 0 |
| `npm ci --prefix companion` | PASS, exit 0 |
| `npm test` | PASS: 780 tests / 28 files (baseline 773 / 26) |
| `npm run build` | PASS; browser bundle boundary checks pass |
| `npx tsc --noEmit --module ES2020 --ignoreDeprecations 5.0` | PASS |
| `npm run lint` (includes `lint:obsidian`, typecheck/build, Companion lint) | PASS: plugin 0 errors / 4 disclosed advisories; Companion 0 errors / 0 warnings |
| Companion `npm run typecheck` | PASS, source and tests |
| Companion `npm test` | PASS: 213 tests / 14 files (baseline 212 / 14) |
| Companion `npm run build` | PASS |
| Minimum Obsidian 1.8.7 API typecheck, plugin source | PASS |
| Build/lint scripts under Node ESLint recommended | PASS: zero findings |
| Workflow YAML parsing | PASS; hosted execution is separate evidence |
| Negative probes | PASS: new warning rejected; server export rejected; removing the content conflict guard fails its test; restored build passes |
| `git diff --check` | PASS |
| `npm audit` | **7 development-only advisories**: 3 high / 4 moderate; exit 1. No affected dependency ships in main.js. Companion audit: zero advisories / exit 0. |

The seven development dependency advisories concern `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `vitest`, `@vitest/mocker`, and the esbuild development server. They remain visible and are deferred to a focused dependency-security update; changing the test/build dependency graph is not needed to reproduce or explain the scorecard. They do not establish a plugin runtime vulnerability. Initial sandbox attempts at npm/esbuild and loopback tests failed with EPERM; the clean suite was rerun successfully outside that restriction. This was an environment limitation, not a changed test expectation.

Remaining blockers are the hosted scanner's stale/type-resolution result, its unverified treatment of repository scope, and native UX confirmation. Retained advisories are streaming fetch, settings search, and the proposal denylist. Native Obsidian 1.8.7/current, mobile and popout smoke tests are recommended for the changed menu/write flows; no fake browser or unit fixture is presented as that confirmation. A complete settings-search migration is still a product improvement to implement and validate, not a hidden no-op.

## Expected scorecard impact before the next release

The public score **has not changed**. This branch does not bump a version, publish a release, modify tags or merge anything.

The current documented scanner would omit the **2,644 unsafe-type warnings**; resolving Obsidian types would also remove the **eight intrinsic-error union warnings**. That depends on the hosted service actually using its documented/current configuration or fixing dependency resolution, not on disguising source types in this PR. The retained fetch/settings advisories should still be expected. The future release-provenance workflow can address the two named asset-attestation notices once a release is intentionally published, its assets match the build, and attestation/rescan finishes.

Before the next Vault Audit AI release: review and merge this PR separately if desired; complete native smoke tests; address development dependency advisories in a focused update; supply the exact type-resolution and scope evidence to Obsidian and request a rescan/clarification. Check the public result after that scan. Do not split Companion or promise a clean scorecard on the strength of local exclusions.
