# Draft comment for issue #178

**Not posted.** [Issue #178](https://github.com/obsidianmd/eslint-plugin/issues/178) already covers this source-scope problem.

We can add a concrete bundle/source distinction from Vault Audit AI at [`main` 1a978e3046a8032db8afbe421c9203d0caedd095](https://github.com/zinverno/vault-audit-AI/tree/1a978e3046a8032db8afbe421c9203d0caedd095). Its optional standalone Node 24 server lived under `companion/`, with its own install/build/lint/tests. The maintainer's September 15 account Preview applies Obsidian/mobile rules to that server.

The documented scanner configuration reproduces 20 standalone-only findings locally. Examples: `auth.ts` (`node:crypto`), `config.ts` (`node:net`, `node:path`), `server.ts` (`node:http`, `node:url`), proposal storage (`node:sqlite`), and SQLite storage (`node:fs`, `node:fs/promises`). `search/qdrantBackend.ts` also receives browser/popout timer findings for Node timers.

The production esbuild metadata shows **none of those server modules contributes bytes to plugin `main.js`**. Only two pure proposal contract/hash helpers under the old package path are bundled; those are separately identified and linted as plugin code. The only external plugin runtime dependency is `obsidian`.

We are extracting the standalone server to [vault-audit-ai-companion](https://github.com/zinverno/vault-audit-ai-companion) for independent deployment/history/CI anyway. The plugin retains its HTTP client, approval UI, and pure validation. That eliminates our server-source collision, but a documented way to scope source analysis for other multi-package plugin repositories would still be useful.

Evidence: [report](../obsidian-hosted-scanner-repro.md), [source findings](../extraction-evidence/source-scope-before.json), [bundle membership](../extraction-evidence/bundle-before.json). Replace relative draft links with final extraction-PR commit permalinks before posting. This source-scope issue is separate from unresolved declarations and the mass unsafe-type warnings discussed in #182.
