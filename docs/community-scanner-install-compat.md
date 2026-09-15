# Scanner-style installation compatibility

## Result and evidence scope

On September 15, 2026, the plugin lockfile was repaired using npm itself. Both npm **10.9.2** and **11.11.0** now consume it with `npm ci`, with and without `--ignore-scripts`. **No existing package version, package.json, plugin source, ESLint rule, manifest or runtime behavior changed.**

Baseline: [`main` 6df5a5160414ef936603b911be30d7e85f1a8b22](https://github.com/zinverno/vault-audit-AI/commit/6df5a5160414ef936603b911be30d7e85f1a8b22), merged extraction PR #22, [green CI](https://github.com/zinverno/vault-audit-AI/actions/runs/34954112421). The checkout was clean before creating `fix/community-scanner-install-compat`. No standalone `companion/` files are tracked; all ten `companionSync/` files remain. The Companion repository was not changed.

The maintainer reports that the **post-extraction authenticated Preview** removed standalone server findings but retained mass plugin `no-unsafe-*`/error-type findings. Its exact new review SHA/output was not independently retrieved during this task. The [account page](https://community.obsidian.md/account/plugins/ai-knowledge-hub) is the available Preview URL. This is separate from the historical `1a978e3` Preview and published 1.7.0 scorecard preserved in the [scanner report](obsidian-hosted-scanner-repro.md). **A new hosted Preview is still required; local installation success is not proof of hosted remediation.**

Environment: Linux 6.12.95-1-MANJARO x86_64, Node 24.14.1, default npm 11.11.0. Each matrix cell used a separate fresh Git clone, no prior `node_modules` or generated build. npm versions were explicitly probed. Complete install stdout/stderr: [install matrix](install-compat-evidence/install-matrix.txt); exact commands, exit codes, lock changes and diagnostic counts: [structured evidence](install-compat-evidence/results.json).

## Dependency cause

The v3 lock contains direct build-tool **esbuild 0.19.11**, **Vitest 4.1.10**, and nested **Vite 8.1.5**. Vite declares `esbuild: ^0.27.0 || ^0.28.0` in `peerDependencies`, with `peerDependenciesMeta.esbuild.optional: true`. The root esbuild is outside that range and the old lock omitted a compatible nested peer.

In the installed npm 10.9.2 Arborist implementation, `#problemEdges()` treats an invalid edge with a destination as requiring resolution, including optional peers. Its ideal tree adds esbuild 0.28.2 and **26** optional platform packages. `npm ci` compares that tree to the locked inventory, finds **27 missing entries**, and exits **1 / EUSAGE before installing project dependencies**. This is neither an esbuild postinstall failure nor EBADPLATFORM; `--ignore-scripts` does not change it.

In npm 11.11.0, the same function explicitly skips invalid `peerOptional` edges when `save === false` (the `ci` setting), trusting the lock instead. This explains the successful npm 11 install, rather than establishing cross-version lock compatibility. See the [npm 10 source](https://github.com/npm/cli/blob/v10.9.2/workspaces/arborist/lib/arborist/build-ideal-tree.js) and related [npm issue #8726](https://github.com/npm/cli/issues/8726). Both installed CLI implementations and their `ci` lock validation paths were inspected locally.

Missing dependency declarations can then produce error types and unsafe-rule cascades; this remains a hypothesis about our hosted execution environment, whose install logs/version are unavailable. [Obsidian issue #182](https://github.com/obsidianmd/eslint-plugin/issues/182) already covers installation-related false positives. Its [ExplorerOrderEditor report](https://github.com/obsidianmd/eslint-plugin/issues/182#issuecomment-5231850204) independently describes the esbuild optional-peer mismatch; the [latest Grimoire report](https://github.com/obsidianmd/eslint-plugin/issues/182#issuecomment-5233462015) describes a different engine-strict installation failure. Both reported successful hosted scans after their own install corrections. Neither proves the outcome for Vault Audit AI.

## Minimal correction and generation comparison

In an empty disposable directory, copy the baseline `package.json` **and existing lockfile**, then run:

```sh
npx --yes --package npm@10.9.2 npm install --package-lock-only --ignore-scripts
```

The committed lock is **exactly npm's output**, SHA256 `4ae8e0fed580bd702fdd8cdf3fb391ba108916151392584649ef706d27493d3c`. It adds nested `node_modules/vitest/node_modules/esbuild` 0.28.2 and 26 platform packages, all marked `dev`, `optional`, and `peer`. Three newly available platform names are hoisted; the other 23 platform entries are nested beneath Vitest. Every existing package/version/integrity is preserved; no package is removed. npm 10 also omits ten `libc` metadata arrays from optional Rolldown/lightningcss platform entries. Their OS/CPU metadata and versions remain intact. Those development tools retain their own native binary selection; Linux build/tests pass.

| Generator, empty directory | Seed | Result |
|---|---|---|
| npm 10.9.2 | Existing lock | Selected: +27 entries, no version changes; ten `libc` arrays omitted |
| npm 11.11.0 | Existing lock | Byte-identical old lock; incompatibility retained |
| npm 10.9.2 | package.json only | Generator exits 1: `Cannot read properties of null (reading 'edgesOut')`; no lock emitted |
| npm 11.11.0 | package.json only | +29 / −6 package paths, 67 existing entries changed, including unrelated version updates; rejected for scope |
| npm 11.11.0 | npm 10 repaired lock | Removes the 27 added peer entries again; unsuitable canonical generator for this graph |

[Generation stdout/stderr](install-compat-evidence/generation.txt) records the four controlled initial experiments, including the unsuccessful npm 10 no-lock experiment. The round-trip result/hash is in the structured evidence. No competing lockfile is committed. Use npm 10.9.2 for deliberate lock updates to this graph and keep the existing lock as the seed; the new CI matrix catches future incompatible regeneration. Normal npm 11 **`ci`** leaves the repaired lock unchanged.

## Install and type-resolution results

Each version below was invoked through `npx --yes --package npm@<version> npm`.

| npm | Command | Before | After |
|---|---|---|---|
| 10.9.2 | `ci` | FAIL, EUSAGE, exit 1 | PASS, exit 0 |
| 10.9.2 | `ci --ignore-scripts` | FAIL, EUSAGE, exit 1 | PASS, exit 0 |
| 11.11.0 | `ci` | PASS, exit 0 | PASS, exit 0 |
| 11.11.0 | `ci --ignore-scripts` | PASS, exit 0 | PASS, exit 0 |

All four after-installs preserve the canonical lock byte-for-byte. `npm ls obsidian @types/node typescript` succeeds under each version/install mode. Obsidian **1.12.3** declarations physically exist at `node_modules/obsidian/obsidian.d.ts`; TypeScript **5.3.3** `resolveModuleName()` using the actual plugin tsconfig resolves `main.ts`'s import to that file. `@types/node` **20.19.39** and its `index.d.ts` exist.

Under **both scanner-style installs**, actual `npm run lint` and machine-readable ESLint with the repository's official recommended configuration pass: **0 errors / 4 retained warnings**. Each of `no-unsafe-return`, `no-unsafe-call`, `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-argument`, and `no-redundant-type-constituents` has **0** findings. The retained warnings are streaming `fetch`, settings search, and two deliberate configuration-path denylist advisories; no rules or warning budgets changed.

The existing [tiny fixture](obsidian-scanner-minimal-repro.md) was freshly installed and rerun unchanged: declarations present **0**, temporarily absent **6** (3 unsafe calls, 1 assignment, 2 member accesses; expected lint exit 1), restored **0**. Full message/location records are in structured evidence. Historical fixture and forensic evidence remain intact.

## Regression and security

A separate clean clone of repair commit `5834317858a1f8687ae985f80318e3097fd9a999` ran:

| Command/check | Result |
|---|---|
| `npm ci` | PASS |
| `npm test` | **793 tests, 29 files passed** |
| `npm run build` | PASS, including existing bundle-boundary assertions |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 errors / 4 advisories |
| `npm run audit:proposals` | PASS, **5/5 mutations killed**, restored tests pass |
| `git diff --check` | PASS; clean clone remained clean |
| `npm ci --ignore-scripts` | PASS with default npm 11.11.0 |

[Complete verification stdout/stderr](install-compat-evidence/verification.txt). The new CI adds two focused Node 24 jobs: exact npm 10.9.2 and 11.11.0 scanner-style installs followed by the existing typecheck. The ordinary full verification job remains intact. Final PR CI must pass on its exact HEAD before handoff.

Baseline and repaired builds emit **identical 421,023-byte `main.js`**, SHA256 `6d6eb44d033672dae94c1b8a0b15158c905b07fe4e38aee20dc6d244ab2fdcdd`. All 52 emitted source inputs are plugin source; the only external import is `obsidian`. No npm package source, standalone Companion source, Node server code or sibling import enters the bundle. Build metadata and hashes are recorded in structured evidence. Native UI/mobile tests were not repeated for this byte-identical runtime artifact.

`npm audit --json` remains **7 affected development packages: 4 moderate / 3 high / 0 critical**, before and after; its exit 1 is expected advisory output, not a failed install. Packages: `@vitest/mocker`, `esbuild`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `vitest`. Advisory URLs and severity maps are recorded for both runs. The nested esbuild addition does not remove the old direct esbuild advisory. None ships as code in `main.js`; no broad security upgrades are included.

## Next hosted decision

This project had a real scanner-style installation incompatibility and now has a locally verified package-management correction. Review the PR, require green CI, then submit its ref/SHA through the authenticated Community **Review branch** flow and preserve the new result/install logs. Do not attribute any remaining hosted warnings to a scanner defect until that Preview establishes the outcome. The [supplemental #182 draft](upstream/obsidian-scanner-type-resolution-issue.md) is updated locally and **not posted**. No merge, release, tag, version change or Companion change is part of this task.
