# R02: diagram generation removed from development

Public stable **2.3.1** still contains the optional Excalidraw generation workflow. R02 removes it from the **unpublished development branch**, whose intermediate manifest remains **2.4.0**. Installing or enabling Excalidraw no longer adds a Veynrel capability there. This change has not been published to the Marketplace.

The owner has selected [one public release after acceptance of R01–R15](roadmap/vault-assistant-plan.md#release-policy-and-acquisition-work). Internal candidates and disposable-vault checks continue after each PR. Decide the final version at R15; every merge and any eventual publication need separate owner decisions, with auto-merge off.

## What is removed and retained

Removed: structure/flowchart generation, preparation and preview, diagram navigation and history actions, diagram state/owners, Excalidraw adapter and availability checks, endpoint capability discovery, diagram JSON Schema requests, and their unused errors, illustrations and styles. There is no hidden generation route or replacement drawing editor.

Retained: separate Workspace and Studio, Markdown Recipe Library and Community Library, recipient/consent review, immutable output Review, separate-note creation, guarded source Apply/Undo, Markdown history and recovery. The shared operation gate, transport safeguards, source/editor checks and Markdown journal formats remain. The existing Connections filter for `.excalidraw.md` files is a passive file-format filter; it neither calls Excalidraw nor depends on its installation. Recall is unchanged.

## Legacy data and updating

Removal does **not** delete, rename or rewrite drawings, uninstall Excalidraw, alter its settings, or migrate a journal to a new format. You can continue opening existing drawings with the third-party plugin independently of Veynrel.

Before testing an internal candidate, close the vault and pause synchronization, then make a complete private snapshot outside the vault. Include notes, drawings and the entire configuration directory. Use a disposable copy for upgrade/regression checks; preserve all existing plugin data when copying matching candidate runtime files.

Archived diagram records remain at:

```text
<Vault.configDir>/plugins/ai-knowledge-hub/studio/diagrams/<operation-id>/intent.json
<Vault.configDir>/plugins/ai-knowledge-hub/studio/diagrams/<operation-id>/receipt.json
```

`Vault.configDir` is normally `.obsidian`, but may be customized. An intent stores a JSON envelope containing `payload` and its checksum; the payload includes the original source snapshot, target path and planned scene. A receipt, when present, records an observed outcome. Missing/damaged receipts do not prove whether a drawing was created. The unchanged [historical reader at the R02 base](https://github.com/zinverno/veynrel/blob/05f4cdaeb9bf5aa092901f3e5079bb302b82e596/studio/diagram/journal.ts) documents the old format.

Development's Studio History loads only its existing Markdown namespaces (`operations/`, `runs/`, `markdown-create/`). It does not parse, repair, acknowledge or clean up `diagrams/`; even malformed archived records do not block Markdown history. There is no live diagram-history screen retained for compatibility.

For archival inspection/export, copy the **entire** `diagrams/` directory outside the vault with hidden files visible, preserve its bytes, and copy the corresponding drawings from the intent's target locations. Inspect copies as text; do not execute embedded source or manually edit checksum fields. These records may contain full private note text. Keep them out of public PRs and support uploads. Existing backups remain the recovery source; R02 does not promise automatic recovery or deletion of a drawing.

Markdown records remain in place and retain their original guarded recovery rules. The separate Recall v4 migration from R01 still applies: [restoration requires a compatible complete snapshot](release-2.4.0-candidate.md#returning-to-stable), not merely replacing `main.js` with stable 2.3.1.

## Dependency audit and historical evidence

The read-only audit began at main `05f4cdaeb9bf5aa092901f3e5079bb302b82e596`, after verifying merged #138/#139 and separately checking published stable 2.3.1. The baseline production import graph contained ten `studio/diagram/` modules, reached through `studio/view.ts`, `studio/registerStudio.ts` and `main.ts`. Type-only proposal references additionally reached `studio/ports.ts` and `studio/runner.ts`.

The audit traced the shared UI error handler, operation status/history rendering, picker/illustration options, CSS, localizations, registration/disposal, transport options and consumers, tests and native harnesses. Diagram endpoint metadata/schema options had no retained consumers and were removed. Shared Markdown operations and errors were retained. There were no persistent diagram-specific settings or package dependencies to migrate/remove.

The old diagram native harnesses and active generator tests are removed. Their versioned documents, captures, diagrams, raw results and evaluation fixtures remain historical evidence. Offline replay still verifies the frozen fixture hashes; it no longer imports a live diagram validator. The old validation behavior is recoverable from the recorded Git revisions, without shipping it in current runtime.

[Public 2.3.1 diagram guide](wiki/Excalidraw-diagrams.md) · [Historical implementation](studio-excalidraw-v1.md) · [Markdown workflow](wiki/Studio-recipes.md) · [History and recovery](wiki/Safety-history-and-recovery.md)
