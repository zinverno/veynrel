# Hosted Community scanner: two separate findings

Post-extraction follow-up: [scanner-style install compatibility](community-scanner-install-compat.md) reproduces npm 10 EUSAGE on `main` 6df5a5 and verifies an npm-generated lock repair under npm 10/11. A new hosted Preview is still required. The historical evidence below remains unchanged.

Evidence recorded September 15, 2026, before Companion extraction. Source: `main` at **1a978e3046a8032db8afbe421c9203d0caedd095**, containing merged PR #21. The historical [forensic audit](obsidian-review-audit.md), [native gate](obsidian-premerge-smoke.md), and their evidence directories remain unchanged.

## Preview provenance

The maintainer identifies the **September 15, 2026 Preview**, Ref **main**, Commit **1a978e3**, on the authenticated [plugin account page](https://community.obsidian.md/account/plugins/ai-knowledge-hub). No distinct public review URL is available. That commit/ref/date and account URL identify this result; we do not invent a review permalink.

The maintainer supplied the current Preview observation: mass `no-unsafe-*` findings in plugin files and Obsidian/mobile rules applied to standalone Companion. This run independently retrieved the [public scorecard](https://community.obsidian.md/plugins/ai-knowledge-hub); it still links the published **1.7.0** source, **0641932369d84aa5bcab40a473aa896ca5335810**. It does **not** independently expose the authenticated Preview. The exact historical 2,654-warning capture in [public-scorecard.json](review-evidence/public-scorecard.json) belongs to that published release, not the newer Preview. No machine-readable count for the newer authenticated Preview is asserted here.

## A. Type resolution

Preview symptoms include `@typescript-eslint/no-unsafe-return`, `no-unsafe-call`, `no-unsafe-assignment`, `no-unsafe-member-access`, and `no-unsafe-argument` across `main.ts`, `settings.ts`, `deepAudit.ts`, `api.ts`, `semantic/`, `chunking/`, `rag/`, and `vectorStore/`, as well as server files.

The previous audit reproduced the published release's **exact 2,654-warning multiset** by making only its Obsidian declarations unavailable. Restoring those declarations restored correct inference. This is stronger evidence than merely observing similar counts, but does not establish how the hosted environment lost type information.

Current local clean baseline: Node **24.14.1**, npm **11.11.0**, TypeScript **5.3.3**, Obsidian declarations **1.12.3**, `eslint-plugin-obsidianmd` **0.4.2**. `npm run lint` passes: plugin **0 errors, 4 retained warnings**, Companion **0 warnings**. A new 14-line plugin reproduces **0 → 6 → 0** findings with declarations present → unavailable → restored. See [minimal reproduction](obsidian-scanner-minimal-repro.md) and [raw missing-types results](extraction-evidence/minimal-missing-types.json).

There is also a concrete installation difference: in an independent checkout of the same baseline, `npx --yes --package npm@10.9.2 npm ci --ignore-scripts` fails **EUSAGE**, reporting missing `esbuild@0.28.2` and its platform packages. npm 11.11.0 succeeds with the unchanged lockfile. The lock contains esbuild 0.19.11 and Vitest's nested Vite 8.1.5, whose optional esbuild peer permits 0.27/0.28; npm 10 expects absent optional-peer lock entries. [Failure transcript](extraction-evidence/npm10-install-failure.txt). This is a reproducible package-manager compatibility problem, **not proof that the hosted Preview used npm 10**. Dependency repair belongs in a separate maintenance change.

**Conclusion:** the hosted result is consistent with Obsidian/type-aware declarations not resolving correctly. We cannot establish the hosted installation log, npm version, or exact failure mechanism from the account result. Thousands of casts or ESLint disables would conceal the symptom and degrade useful local checking.

[Upstream issue #182](https://github.com/obsidianmd/eslint-plugin/issues/182) already covers mass unsafe-type findings when dependencies are unresolved. Its discussion includes installation and package-manager differences. Prepare supplemental evidence there, not a duplicate issue. The [official configuration guide](https://github.com/obsidianmd/eslint-plugin/blob/d7e223960226cf747549c5b21313bd187113640e/docs/configuration.md) currently documents disabling several unsafe-type rules in its scanner recipe. That recipe differs from the reported hosted findings; the hosted deployment is not independently available for inspection.

## B. Repository source scope

The documented scanner's fixed source exclusions do not exclude a standalone package named `companion/`. Running that published recipe against tracked TypeScript/manifest source at the baseline produces **31 findings**: **20 standalone server findings**, **2 browser-safe proposal denylist advisories**, and **9 other plugin findings**. This is a local documented-configuration reproduction, not execution of the hosted service. Generated `main.js`, tests, documentation and tooling are excluded; an initial all-files diagnostic also reported a generated-main parser error, which is not a source finding. [Complete source results](extraction-evidence/source-scope-before.json).

| Server file | Legitimate Node imports flagged by plugin/mobile rules |
| --- | --- |
| `companion/src/auth.ts` | `node:crypto` |
| `companion/src/config.ts` | `node:net`, `node:path` |
| `companion/src/server.ts` | `node:http`, `node:crypto`, `node:url` |
| `companion/src/proposals/storage.ts` | `node:crypto`, `node:sqlite` |
| `companion/src/search/qdrantBackend.ts`, `qdrantIndex.ts` | `node:crypto` |
| `companion/src/storage/sqliteCompanionStorage.ts` | `node:fs`, `node:fs/promises`, `node:path`, `node:sqlite` |
| `companion/src/storage/migrations.ts` | `node:sqlite` |

The server also receives four browser/popout timer warnings in `qdrantBackend.ts` and a `fetch` warning in its Node embedding client. These are Node server operations, not mobile plugin operations.

Production [bundle metadata](extraction-evidence/bundle-before.json) proves that **none of these server modules contributes bytes to `main.js`**. Only two pure browser-safe proposal contract/hash modules under the old package path contribute bytes; they are explicitly distinguished from the standalone server and are retained locally in the plugin during extraction. The only external runtime import is `obsidian`.

[Issue #178](https://github.com/obsidianmd/eslint-plugin/issues/178), open when checked, already covers scanning standalone Node source with plugin rules. The [official FAQ](https://docs.obsidian.md/community-directory/faq) documents fixed scanner exclusions and Review branch previews. Repository-local ESLint ignores are not proof of hosted source selection.

Extraction removes the standalone server from the plugin repository and therefore removes this source-scope collision. **It does not establish a fix for problem A.** Before/after source counts and final verification are recorded in [the extraction report](companion-extraction.md).

## Retained plugin advisories

- Streaming `fetch` in `api.ts`: `requestUrl` exposes buffered responses; streaming and its CORS limitations remain disclosed.
- Settings search: current settings do not implement the newer declarative definitions integration.
- Two literal `.obsidian` checks in proposal path validation: intentional denylist, also checking the actual configured directory. Extraction retains these checks and their visible warnings.

Seven additional sentence-case findings under the uncustomized documented recipe concern URLs/placeholders/folder examples already handled by narrow existing local rule options. No extraction change suppresses scanner findings.
