# Draft: supplemental evidence for issue #182

**Not posted. Do not open a duplicate issue.** [Issue #182](https://github.com/obsidianmd/eslint-plugin/issues/182) already covers mass unsafe-type findings associated with unresolved dependencies. The project had a real npm 10 installation incompatibility; a new Community Preview is required before attributing remaining findings to the scanner.

Suggested comment title: **npm-generated lock repair resolves our npm 10/11 install difference; hosted verification pending**

Vault Audit AI's maintainer reports that its post-Companion-extraction Preview removed standalone server findings but retained widespread plugin `no-unsafe-*` and error-type findings. The authenticated [account page](https://community.obsidian.md/account/plugins/ai-knowledge-hub) is the available URL; no distinct public review URL or independently retrieved install log is available. The earlier September 15 Preview at `1a978e3046a8032db8afbe421c9203d0caedd095` and published 1.7.0 scorecard remain separately preserved historical evidence.

On post-extraction `main` **6df5a5160414ef936603b911be30d7e85f1a8b22**, Node 24.14.1:

```sh
git clone https://github.com/zinverno/vault-audit-AI.git
cd vault-audit-AI
git checkout 6df5a5160414ef936603b911be30d7e85f1a8b22
npx --yes --package npm@10.9.2 npm ci --ignore-scripts
```

This fails **EUSAGE**, listing missing **esbuild 0.28.2 + 26 platform packages**. npm 10 ordinary `ci` also fails. Both npm 11.11.0 install modes pass. Root esbuild 0.19.11 is outside nested Vite 8.1.5's optional peer range `^0.27.0 || ^0.28.0`; the lock omits that peer. npm 10's ideal-tree validation demands it, whereas npm 11's `ci` skips re-resolution of invalid optional-peer edges. This is related to the installation differences discussed in [the ExplorerOrderEditor report](https://github.com/obsidianmd/eslint-plugin/issues/182#issuecomment-5231850204), rather than evidence that our hosted scanner discards declarations.

We copied the existing package.json and lock into an otherwise empty directory and ran:

```sh
npx --yes --package npm@10.9.2 npm install --package-lock-only --ignore-scripts
```

That npm-generated repair adds the missing optional development peer entries without changing any existing package version or package.json. It also drops ten `libc` metadata arrays, as serialized by npm 10; OS/CPU metadata is retained. A focused CI matrix checks both npm consumers, since a subsequent npm 11 lock regeneration removes those entries again. No casts, declaration shims, rule suppressions, runtime changes or dependency upgrades were needed.

After the repair, four independent fresh clones pass npm 10.9.2 / 11.11.0 `ci`, with and without `--ignore-scripts`. Obsidian 1.12.3 declarations physically exist and TypeScript 5.3.3 resolves them; @types/node 20.19.39 is installed. Under both scanner-style installs the actual official local lint reports **0 errors / 4 retained advisories**, with zero findings in all five unsafe rules and `no-redundant-type-constituents`. All 793 tests and 5 proposal mutation checks pass; the plugin bundle is byte-identical to baseline.

Our unchanged tiny fixture again gives **0 → 6 → 0** recommended-preset findings with Obsidian declarations present → unavailable → restored. The earlier exact 2,654-warning reproduction also remains preserved. These experiments explain how unresolved declarations can cause the diagnostic cascade; they do not establish the hosted installation outcome. Rewriting well-typed plugin source to silence that cascade would obscure the installation failure and weaken useful checks.

Evidence: [current compatibility report](../community-scanner-install-compat.md), [complete before/after install output](../install-compat-evidence/install-matrix.txt), [commands and diagnostic records](../install-compat-evidence/results.json), [tiny fixture](../obsidian-scanner-minimal-repro.md), [historical exact-match audit](../obsidian-review-audit.md). Before posting, replace relative links with final PR commit permalinks and include the new Preview ref/SHA and result. A minimal hosted fixture remains available if requested; it has not been submitted.

**Next step:** run a new Community Preview of the repaired branch. If the mass warnings disappear, this supports installation incompatibility as the cause for our project too. If they remain, compare the hosted install environment/logs before alleging a separate scanner defect. Clear separation of dependency-install failures from downstream source diagnostics would help users identify this class of problem.
