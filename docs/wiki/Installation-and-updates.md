# Installation and updates

> **2.4.0 release candidate.** Check the [published releases](https://github.com/zinverno/veynrel/releases/latest) for the stable download. The [2.3.1 guide](https://github.com/zinverno/veynrel/tree/2.3.1/docs/wiki) covers the earlier interface.

## Stable installation

Open **Settings → Community plugins → Browse**, search **Veynrel**, install and enable. The plugin ID remains `ai-knowledge-hub`.

For manual installation download `main.js`, `manifest.json`, `styles.css` from the same [published release](https://github.com/zinverno/veynrel/releases/latest). With Obsidian closed, copy those three files to `<vault>/<configDir>/plugins/ai-knowledge-hub/`; normally `configDir` is `.obsidian`.

## Upgrade an existing installation

1. Back up your vault and plugin data with Obsidian closed.
2. Replace only the three runtime files from one release.
3. Preserve `data.json`, semantic indexes, Recall state, decisions, `studio/` and other journals. Do not delete or replace the plugin directory.
4. Restart Obsidian, enable the plugin if necessary, and verify settings and existing local state before starting new work.

2.4.0 requires Obsidian 1.13.7. Older compatible clients retain the 2.3.1 fallback (1.8.7). Both manifests permit mobile installations. Native verification used Linux desktop. Before a downgrade, archive any new edits and restore the complete pre-upgrade snapshot. [Migration details](../releases/2.4.0.md).

[First tasks](Getting-started.md) · [Recovery](Safety-history-and-recovery.md)
