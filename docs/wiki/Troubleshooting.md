# Troubleshooting

> **2.3.0 release candidate; stable release is 2.2.1.**

| Symptom | Check and next action |
| --- | --- |
| Local checks unavailable | Confirm Veynrel is enabled, open Health and select an area; no model key is required |
| No semantic candidates | Configure embeddings and explicitly build the index; inspect coverage, stale state and scope limits |
| Unsupported diagram endpoint | Use public OpenRouter with verified required capabilities; do not treat Markdown connectivity as diagram support |
| Excalidraw missing/wrong version | Enable the pinned 2.29.0; refresh capabilities; do not bypass the version gate |
| Unsaved source | Save all copies/editors of that note and prepare again; close affected editors for source writes if requested |
| Destination occupied | Choose a genuinely unused filename in an existing folder; existing files are never overwritten automatically |
| Timeout/cancellation | The remote request may still complete/be billed. Inspect the recorded state; no automatic retry is promised |
| Invalid model output | Preserve the failure. Missing fields, truncation, refusal and malformed content are not silently repaired |
| Local preservation observations | Compare source and result yourself; a warning is lexical, and no warning is not a semantic PASS |
| History changed/unavailable | Later edits can invalidate exact recovery checks; preserve the edited file and journal |
| Damaged journal/unconfirmed write | Stop mutation attempts, preserve evidence and backups; do not delete data to bypass the guard |
| Community offline | Explicitly refresh later; verified cached entries may remain available but stale |

Native evidence is Linux desktop with built-in themes. Narrow desktop captures are not mobile tests. Historical unreproduced host/zoom exceptions and intermittent CDP stalls are not proof of a fixed host issue; include exact steps and a synthetic reproduction when reporting them.

Two deliberate `fetch` advisories remain: streaming AI transport and bounded Community transport. GitHub CI is distinct from Obsidian's authenticated hosted Preview. No zero-scanner-finding or complete Stylelint-compliance claim is made.

[Support and safe bug reports](../../SUPPORT.md) · [Providers](Providers-and-privacy.md)
