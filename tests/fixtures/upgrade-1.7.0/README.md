# Native 1.7.0 upgrade fixture

Synthetic notes and sentinel settings only; no user vault or usable credential.

`manifest.json` is the published [1.7.0 release](https://github.com/zinverno/vault-audit-AI/releases/tag/1.7.0) manifest. Its `main.js` SHA256 was `9bc35a9ced3d0588e542917f1aeca407bfb74d6058b2f151d39794e914f7d3c5`. The actual release ran in an isolated native Obsidian 1.12.7 vault at `.obsidian/plugins/ai-knowledge-hub/`. Its own explicit index action produced the two unchanged `semantic-index/` files here; three-dimensional vectors came from a deterministic loopback provider. `data.json` is that installation's persisted settings; `commands.json` was read from native Obsidian's registered commands. The same upgrade also ran in Obsidian 1.13.7.

`merged-data.json` comes from native merged-main 1.7.0 (`2124c7ebf4229958528a1759c79302e636ab5ec5`), where Companion/proposals already exist. Published 1.7.0 predates them. Both inputs exercise the real settings loader. The test rejects index writes and loss/rename of existing command IDs; it does not generate a new-format fixture with the candidate serializer.

The native tests additionally replace only the three release assets, reload the vault, compare index/audit-cache hashes and stored values, verify enabled/hotkey state, exercise settings/search, connect to a disposable real Companion, open/apply a proposal, and disable/re-enable the plugin. See [release verification](../../../docs/veynrel-release-verification.md).
