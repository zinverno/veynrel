# 2.3.0 capability and source matrix

Baseline: merged main `fa0bca0bc0debe2d7537cba35ce9301d129d5419`. Comparison: the complete history since published tag `2.2.1`, not just PR #130. Release preparation changes version metadata and presentation, not production engines, prompts or guards.

| Claim | Actual behavior / source | Limitation | Destination |
| --- | --- | --- | --- |
| Two entry points | `health/obsidian/registerHealth.ts`, `studio/registerStudio.ts`: independent workspace and Studio commands | Studio does not replace vault health | README, Home |
| Local Health | `health/analyzers/local/`, `health/analyzers/local/localScanCoordinator.ts` where applicable; local sources and findings | Coverage/stale/error states matter; structural findings are not deletion instructions | Health |
| Connections | `health/workbench/workbenchData.ts`, `reviewListView.ts`; published semantic and topology data | Similarity is not duplication; semantic index required for semantic pairs; 500-note exact-view cap | Health |
| Recall without model | `recall/parser/markdownFlashcards.ts`, `recall/services/recallService.ts` | Authored cards only in the no-LLM path; no learning guarantee | Recall |
| Recipe consent | `studio/runner.ts`, `studio/view.ts`, `api.ts` | Selected saved inputs, settings and bodies frozen; calls may still be billed after local cancellation | Studio, Privacy |
| Separate Markdown default | `studio/view.ts`, `studio/markdownCreate.ts`, `studio/documentEnvelope.ts` | Source link and body; source properties not cloned; no automatic delete/Undo | Studio, release notes |
| Literal source YAML | `studio/documentEnvelope.ts`, `studio/writePlan.ts`, `studio/apply.ts` | Supported envelopes only; exact-source/editor/journal checks can refuse changes | Recovery |
| Preservation observations | `studio/preservationChecks.ts` and tests | Lexical observations, not semantic verification or accuracy score | README, Studio |
| Community install/update | `studio/community/catalog.ts`, `installer.ts`, `transport.ts` | Installation separate from generation; explicit updates; hash is not independent signature | Community |
| Diagram capability gate | `studio/diagram/workflow.ts`, `studio/diagram/capabilities.ts` | Public OpenRouter and verified parameters; no prompt-only fallback | Diagrams |
| Excalidraw dependency | `studio/diagram/adapter.ts` | Pinned 2.29.0 optional plugin required; no universal provider/version claim | Diagrams |
| Native shapes and bound arrows | `studio/diagram/layout.ts`, `excalidrawAdapter.ts`, native harness | Schema validity does not establish semantic correctness; crossings possible | Diagrams |
| Bounds | `studio/recipe.ts`, `studio/diagram/spec.ts` | 20 Markdown inputs; per-note and diagram limits documented in task guides | Studio, Diagrams |
| Recovery and plaintext | `studio/journal.ts`, `storage.ts`, `markdownCreate.ts`; detailed storage reference | Operation-specific Undo; journals can contain note text; no automatic replay/cleanup | Recovery, Privacy |
| Provider separation | `embeddings/`, `api.ts`, `studio/community/transport.ts` | Embedding, generation, capability discovery and catalog traffic are different flows | Privacy |
| Native coverage | `scripts/studio-source-preservation-native.mjs`, `studio-excalidraw-native.mjs`, `studio-community-native.mjs` | Linux desktop, built-in themes, controlled responses; not physical mobile/every theme/OS/screen reader | Media, release notes |
| Retained review advisories | `api.ts:472`, `studio/community/transport.ts:13`, `docs/obsidian-review-safe-v1.md` | Two deliberate fetch warnings; no full Stylelint/zero-scanner claim | Troubleshooting |

Exact final candidate/build identities and fresh checks are recorded in the owner release package and media provenance. Historical implementation reports remain linked as dated evidence, not fresh acceptance.
