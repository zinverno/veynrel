# Safety, history and recovery

> **2.3.0 release candidate; stable release is 2.2.1.**

## Choose the correct contract

| Operation | Recovery boundary |
| --- | --- |
| Studio explicit source Apply | Journaled, exact guarded source change; separate guarded Undo |
| Studio separate Markdown result | New file; no automatic delete/Undo |
| Studio diagram | New file; no automatic delete/Undo |
| Supported consolidation | Operation-specific Apply/Undo and dependencies |
| Batch, MOC, generative atomization | Separate contracts; no universal rollback |

Studio preparation and generation do not write notes. Review is immutable. Changes to source identity/content, destination collisions, unsaved or unsupported editors, or damaged journals can block writes. Supported original YAML is retained literally for source changes. A separate Markdown result does not copy the source's properties.

![Native review of a source-preserving result](../../assets/showcase/2.3.0/studio-review.png)

Synthetic workflow, not an assurance that a model preserved every fact.

## History and interruption

Open **Studio → History** to inspect runs and applicable recovery. An interrupted generation never automatically resumes. An unconfirmed write must not be replayed: first inspect the actual file and preserve the journal. Later edits can block Undo. Restore from your own verified backup when automatic recovery is unavailable; do not delete journal evidence to unlock a button.

Studio data lives under `<Vault.configDir>/plugins/ai-knowledge-hub/studio/`, including recipes, retained recipe backups, run receipts, operations and creation history. Operation records can contain full before/after text in plaintext. There is no automatic retention cleanup or encryption. Preserve settings, indexes and journals during updates. Other plugins/OS processes can introduce races beyond the tested in-process guards.

For corrupted or uncertain data, stop writes and follow [Troubleshooting](Troubleshooting.md). Detailed storage contracts: [Studio safety reference](../studio-safety-and-recovery.md), [creation recovery](../studio-source-preservation-v1/create-recovery.md).
