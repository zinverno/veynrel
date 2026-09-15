# Draft: supplemental evidence for issue #182

**Do not open a duplicate issue. Not posted.** Existing issue: [Community dashboard reports mass unsafe-type false positives when dependencies are unresolved](https://github.com/obsidianmd/eslint-plugin/issues/182).

Suggested comment title: **A 14-line declaration-resolution probe and an npm 10/11 installation difference**

Vault Audit AI's September 15, 2026 authenticated Preview reports widespread `no-unsafe-*` findings at [`main` 1a978e3046a8032db8afbe421c9203d0caedd095](https://github.com/zinverno/vault-audit-AI/tree/1a978e3046a8032db8afbe421c9203d0caedd095). Its [account page](https://community.obsidian.md/account/plugins/ai-knowledge-hub) has no distinct public review URL available to us. The public scorecard still serves published 1.7.0, so we are keeping those results separate.

Expected: with declarations installed, ordinary `Plugin`, `App`, `Vault` and `TFile` API use should retain its declared types. Actual Preview symptoms include unsafe calls/assignments/member access/arguments/returns in plugin code. Locally, Node 24.14.1, npm 11.11.0, TypeScript 5.3.3, Obsidian 1.12.3 and eslint-plugin-obsidianmd 0.4.2 yield **0 errors and 4 explicitly retained advisories**.

Our prior release experiment reproduced all **2,654 published warning locations exactly** by temporarily removing only Obsidian declarations. A new 14-line fixture gives **0 → 6 → 0** local recommended-preset findings with those declarations present → unavailable → restored. This is consistent with unresolved types; it does not prove how the hosted environment lost them.

There is now a concrete install distinction on the current lockfile:

```sh
git clone https://github.com/zinverno/vault-audit-AI.git
cd vault-audit-AI
git checkout 1a978e3046a8032db8afbe421c9203d0caedd095
npx --yes --package npm@10.9.2 npm ci --ignore-scripts
```

This fails EUSAGE: missing esbuild 0.28.2/platform packages. npm 11.11.0 installs the same lock successfully. The old direct esbuild plus nested Vite optional peer appears relevant to the installation differences already discussed here. We do **not** know which npm/version or install outcome the authenticated hosted Preview used.

Evidence: [scanner report](../obsidian-hosted-scanner-repro.md), [exact npm failure](../extraction-evidence/npm10-install-failure.txt), [tiny fixture and instructions](../obsidian-scanner-minimal-repro.md), [historical exact-match audit](../obsidian-review-audit.md). Before posting, replace these relative draft links with extraction-PR commit permalinks. A tiny hosted Preview is a proposed next comparison, **not an executed result**.

Could the Preview expose or clearly distinguish dependency installation/type-resolution failures from source findings? Rewriting thousands of well-typed locations with casts/disables would hide the diagnostic environment problem and remove useful local checks. The documented scanner recipe currently disables unsafe-type rules; knowing the deployed configuration would also clarify the delta. We will handle the package-manager compatibility change separately from the Companion extraction.
