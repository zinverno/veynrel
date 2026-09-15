# Veynrel 1.8.0 release candidate verification

Prepared without merging, tagging, publishing a release, uploading release assets, renaming repositories, or changing the Community Directory. Hosted Community Preview remains a maintainer action. Use the exact final PR SHA, not the runtime implementation SHA below.

## Baseline and scope

| Item | Verified baseline |
| --- | --- |
| Merged main | `2124c7ebf4229958528a1759c79302e636ab5ec5` |
| PR #24 | Merged; [main CI passed](https://github.com/zinverno/vault-audit-AI/actions/runs/34991881171) |
| Version / display name | `1.7.0` / Vault Audit AI |
| Plugin ID / minimum app | `ai-knowledge-hub` / `1.8.7` |
| Desktop-only | `false` |
| Environment | Node `v24.14.1`, npm `11.11.0` |
| Git status | Clean before switching the old review checkout to fast-forwarded main and creating `release/veynrel-1.8.0` |

The top 15 commits were recorded, beginning with PR #24's merge, `c6202f9`, `561844d`, `f172ff0`, PR #23's merge `3f2eab6`, `6bc196f`, `5834317`, PR #22's merge `6df5a51`, `dd301c0`, `f2c1a18`, `32ada48`, `28efb44`, PR #21's merge `1a978e3`, `fdba1b5`, and `4a0418a`.

No standalone `companion/` server files are tracked; all 11 `companionSync/` files remain. The original workspace still has ignored pre-extraction Companion build/data remnants. ESLint sees those local leftovers, so the first workspace lint was unsuitable (30 errors / 6 warnings). They were not modified or deleted. A clean clone of exact main passes **0 errors / 1 warning**. All release verification uses clean clones. Temporary storage was moved into ignored workspace cache after `/tmp` filled; no product or lint changes were made for these environment issues.

The [inventory](veynrel-rebrand-inventory.md) covers every baseline search match. Production changes are visible strings, manifest/funding metadata, README, and the styles header comment. `api.ts`, storage engines, hashes, provider request identity, Companion client/contracts, proposal implementation and both workflows are unchanged from main.

## Compatibility audit

| Boundary | Retained contract / result |
| --- | --- |
| Plugin identity and directory | `ai-knowledge-hub`; `.obsidian/plugins/ai-knowledge-hub/` (also respects custom `Vault.configDir`) |
| Settings and credentials | Obsidian `loadData` / `saveData`, existing `data.json` keys, language/provider/insertion/audit settings and independent embedding keys |
| Audit cache | `note-index.json`, schema 3; bytes and an existing cached record retained in native tests |
| Semantic persistence | `semantic-index/vector-manifest.json`, schema 1; `vector-index.bin`, `VAAVEC01`, binary version 1; unchanged dimensions, generation and hashes |
| Semantic identity | `embedding-space:v1`, provider/model/normalized endpoint/dimensions; `stableHash` and chunk formats unchanged |
| Runtime synchronization | `vault-audit-ai.semantic-mutation-state.v1` and existing shared-store keys |
| Recovery and backups | Existing `.tmp` / `.bak` artifact names and `.ai-backup-...` paths unchanged |
| Commands and styling | All 19 published commands retained; existing main has 20 including proposal review; `ai-hub-*` selectors remain |
| Companion | Endpoint, token, vault UUID, timeout, enablement; `x-companion-protocol-version: 1`, HTTP routes, proposal schema/hashes and `VAULT_AUDIT_COMPANION_DIR` unchanged |
| Server persistence / MCP | Standalone package/repository, SQLite schema and MCP tool contracts unchanged; actual existing server used in testing |
| Reinstall / reindex / reconfiguration | None required because of the rebrand |

Published 1.7.0 predates Companion. On its first upgrade, the already-merged settings loader adds missing **disabled** Companion defaults and a local vault UUID; existing values are preserved. The second native cohort separately verifies previously configured Companion settings from merged-main 1.7.0. No newly designed migration is part of this rebrand.

## Exact native upgrade procedure

Used actual `/usr/bin/obsidian` 1.12.7 and the previously installed 1.13.7 app archive, each with a separate disposable vault, configuration/cache directory and local debugging port. A small test-only helper exposes native Obsidian classes. No real vault, `.env`, user credential or remote AI provider was used.

Two cohorts ran on **both** runtimes:

1. **Published release:** download only `main.js`, `manifest.json`, `styles.css` from release `1.7.0`, tag commit `0641932369d84aa5bcab40a473aa896ca5335810`. The downloaded asset hashes match GitHub's release digests: main `9bc35a9ced3d0588e542917f1aeca407bfb74d6058b2f151d39794e914f7d3c5`, manifest `e780bcfc96864dc6dafef007a9df1f5d3545eadb133376fd5f5fd142cec8ec51`, styles `bc5fe2c33a15ed48b76e3dcb90f329bc2851a89384c6a172b83c89a01845621d`.
2. **Merged-main release state:** build baseline `2124c7e` with the repaired lock. Configure the real standalone Companion at commit `6d31ccacbace36533568cddb6624e386fc8c3eb5`, using a separate disposable SQLite data directory, loopback binding, synthetic sync/MCP credentials and Qdrant disabled. Neither the sibling checkout nor existing deployment is modified.
3. Install each old build under the same `.obsidian/plugins/ai-knowledge-hub/` path. In fresh vaults, enable Community plugins once as setup. Seed non-default saved provider, language, insertion, audit and semantic values; two English/Russian notes (including Unicode); enabled-plugin and custom-hotkey JSON. Use the old plugin's explicit index dialog to build two vectors from a deterministic loopback provider. Store an audit-cache record through the old plugin. Capture all settings, enabled state, command IDs and file hashes.
4. In the Companion cohort, connect and synchronize using the saved configuration. Use the real MCP endpoint to list seven tools, read a mirrored note, perform semantic search and create one pending CREATE proposal per runtime. Assert proposal creation has not written a note.
5. Replace **only** the three plugin assets with the 1.8.0 candidate and reload the vault. Assert native installed identity is unchanged, name/version are Veynrel/1.8.0, every previous saved value remains, enabled state/hotkeys match as JSON, and semantic/audit files remain byte-identical. Assert generation remains 1 and both old vectors are searchable.
6. Check settings title/navigation, ribbon tooltip, host-prefixed command names and the real command palette; Obsidian supplies `Veynrel: ` exactly once. Test the saved language-model connection through real loopback HTTP. Obsidian 1.13.7's separate settings window uses the native declarative rendering path.
7. Disable/re-enable through Obsidian, verify commands unregister and return once, compare persisted state again, and verify one settings instance. Perform another full vault reload and verify plugin, index and command count.
8. In the Companion cohort, reconnect/sync without changing settings, open the proposal review UI, find the pre-upgrade proposal, inspect its diff, assert review is read-only, then explicitly click **Approve**. Verify `APPLIED` and exact note content. Open the semantic-search modal and verify real results. Check the native installed-plugin entry and manifest funding URL.

| Result | Obsidian 1.12.7 | Obsidian 1.13.7 |
| --- | --- | --- |
| Published 1.7.0 upgrade | PASS, 16 grouped checks + full reload | PASS, 16 grouped checks + full reload |
| Merged-main 1.7.0 upgrade | PASS, 18 grouped checks + full reload | PASS, 18 grouped checks + full reload |
| Old settings / index / audit cache | Preserved | Preserved |
| Native installed entry / settings / ribbon / palette | Veynrel | Veynrel, including separate settings window |
| Companion / MCP / existing pending proposal | PASS | PASS |
| Explicit proposal approval / native search modal | PASS | PASS |
| Unhandled plugin errors | 0 | 0 |

The original notes received **zero re-embedding requests after the rebrand**. Explicit proposal approval subsequently creates a new note, which normal enabled AutoSync indexes; this is expected and separate. Read-only dimension probes and query embeddings are not reindexing. The committed [fixture](../tests/fixtures/upgrade-1.7.0/README.md) was produced by the actual old release. Four runnable regression tests cover both settings shapes, old binary/metadata loading without rewriting healthy index data, and stable commands.

The harness was adjusted to use exact native button text, semantic JSON comparison for host formatting, and the settings element's owner document. These were test-harness issues; production code was not changed to satisfy them. Native logs contain the pre-existing Electron development-runtime CSP warning and a Node SQLite experimental notice; no security setting was weakened.

[Structured native results](veynrel-release-evidence/native.json), [1.12.7 settings](veynrel-release-evidence/settings-1.12.7.png), [1.13.7 settings](veynrel-release-evidence/settings-1.13.7.png), [command palette and retained hotkeys](veynrel-release-evidence/command-palette.png), [1.12.7 installed entry](veynrel-release-evidence/installed-1.12.7.png), [1.13.7 installed entry](veynrel-release-evidence/installed-1.13.7.png).

## Automated verification and install compatibility

Clean implementation/test checkout: `c0505d196dbf97088d4e9b461de20fdb0b541236`. Later documentation/evidence commits do not alter runtime, dependencies or tests; final PR CI must validate the exact handoff SHA.

| Command | Result |
| --- | --- |
| `npm ci` | PASS, clean checkout |
| `npm test` | **849 tests / 32 files passed** |
| `npm run build` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | **0 errors / 1 warning** |
| `npm run audit:proposals` | **5/5 mutations killed**, restored tests pass |
| `git diff --check` | PASS |
| npm 10.9.2 `ci --ignore-scripts` | PASS in independent clean clone, then typecheck PASS |
| npm 11.11.0 `ci --ignore-scripts` | PASS in independent clean clone, then typecheck PASS |

The scanner commands were exactly `npx --yes --package npm@10.9.2 npm ci --ignore-scripts` and `npx --yes --package npm@11.11.0 npm ci --ignore-scripts`. Installs leave the lock unchanged. Compared with main, only its two root version values change; every repaired optional-peer entry from PR #23 remains identical. Package identity remains `obsidian-ai-hub`; no dependency was upgraded. Install output still reports the existing seven development dependency advisories (4 moderate, 3 high); this release does not claim to fix them.

The one lint warning is `api.ts:413:22`, `no-restricted-globals`: streaming `fetch` instead of buffered `requestUrl`. Entire `api.ts` is byte-identical to baseline. No rule, allowlist, streaming parser, cancellation or timeout handling was changed.

[Machine-readable verification and hashes](veynrel-release-evidence/verification.json). Command stdout/stderr is retained alongside it, with trailing blank lines normalized. Final clean checkout remained clean. Review found no real credentials or private vault content in the diff. Synthetic fixture sentinels are confined to tests; the release assets were scanned for those sentinels and contain none. No dedicated external secret-scanning service was run.

## Release assets and provenance

The unchanged build enforces browser-only scope: **52 emitted source files**, external module **`obsidian` only** (17 import occurrences). No standalone Companion, Node server, SQLite/MCP implementation, test fixture or npm package source enters the bundle. `companionSync/` remains part of the plugin.

| Asset | Bytes | SHA256 |
| --- | ---: | --- |
| `main.js` | 424254 | `38be6b935c04a77a3bc3ca0518e14a33db95635b676eb7436160669439fe7d34` |
| `manifest.json` | 350 | `2722c7d38ec37e1faebf5f7e84d8443f4aa6f2cd793eb5761ce9f7c5fd92cd39` |
| `styles.css` | 52071 | `cb0cce5a3f2232473580ad878b493d18bbd12297b58353d80efaaefcbc8b788f` |

The clean checkout's three assets match the independently built, native-tested candidate byte-for-byte. This reproduces the provenance workflow's asset comparison locally. The workflow is unchanged and tag-agnostic; it will build `1.8.0`, download the three assets after manual publication, compare them and attest them. It has not run for 1.8.0 because no release was published. No source map or development metadata is intended as a release asset.

## Funding, retained names and handoff

Boosty is configured identically in manifest `fundingUrl`, `.github/FUNDING.yml` under `custom`, and the README support link: `https://boosty.to/veynrel`. No tracking parameters, runtime donation UI or feature gate was added. The 139-character manifest description ends with a period and fits the [official 250-character limit](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins). Funding follows the [Obsidian manifest field](https://docs.obsidian.md/Reference/Manifest#fundingurl) and [GitHub custom funding mechanism](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository).

Intentional old-name matches after implementation:

- Historical review/scanner/extraction/native reports, captured stdout/stderr, screenshots and the old-release fixture remain historical evidence.
- The README migration note and single former Companion name explain the transition; the new release notes use the old name only as the former identity.
- Canonical plugin and Companion repository URLs retain their existing names. Current stale `zinverno/obsidian-ai-hub` README URLs are corrected.
- Stable package/type/CSS/command/storage/runtime-symbol identifiers, provider `X-Title` headers, dimension-probe text and streaming diagnostics retain their original spelling. These are technical compatibility or diagnostic strings, not current product headings.
- `VAAVEC01` and its historical binary-format comment remain unchanged. Existing test note titles remain fixture data.
- “Vault audit” as a feature name is still accurate. Old cover/GIF files are preserved but removed from current presentation; [approved artwork follow-up](veynrel-visual-rebrand.md) is not a release blocker.

**Community Preview branch:** `release/veynrel-1.8.0`. The exact final SHA is supplied in the PR handoff after its CI completes. Expected hosted finding count: **1**, the retained streaming advisory. **Hosted result: not submitted or claimed passed.**

After Preview/review/merge, follow the [exact maintainer checklist](veynrel-release-checklist.md). Update any separately managed Community Directory display/icon/funding fields manually; funding must point to the same Boosty URL. No authenticated Directory UI was automated.
