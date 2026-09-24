# Veynrel product information architecture

The final normal workspace navigation is **Health | Findings | Discover | Recall |
Connect | Tools | Settings**. All seven routes render in the existing
`VeynrelHealthView` (`veynrel-health`). Routes and setup drafts are view-local and
transient. Reopening starts on Health; no route is saved. Onboarding and Health
recovery take precedence and hide normal navigation, including the Tools shortcut.

## Responsibilities

| Surface | User intent | Authoritative implementation |
| --- | --- | --- |
| Health | What needs my attention now? Structure, Connections, Recall, Knowledge | Existing Health controller, analyzers, reconciliation and Recall projection |
| Findings | Action inbox: review, dismiss, snooze, reopen | Existing FindingStore and inbox |
| Discover | Semantic exploration and Semantic Health | Existing Semantic owner and analysis port |
| Recall | Inventory, generation and native FSRS review | Existing Recall product owner and authoring adapter |
| Connect | Companion setup, mirror sync, MCP explanation and proposals | Existing Connect product adapter, Companion service and proposal review |
| Tools | Advanced/manual workflows | Explicit host launchers for existing commands/modals |
| Settings | What powers each capability? | Safe cached product snapshots and links to existing setup flows |
| Command palette / editor context menu | Fast, contextual execution | Existing command IDs, editor callbacks and public menu actions |

Health and Findings **Tools** shortcuts now navigate to Tools. They do not launch
batch processing. The historical `ai-hub-open-panel` and `ai-batch-process`
commands still open `BatchProcessModal` directly.

## Tools catalog and host boundary

`health/toolsPort.ts` defines five explicit operations. `AIHubPlugin.getToolsPort()`
provides one adapter at workspace registration; all views share that adapter and
the existing plugin owners. Pure `toolsViewModel` data feeds `renderTools`. Neither
the model nor renderer imports the plugin, transport, engine or modal classes.

| Group / action | Delegation | Side effects disclosed before the click |
| --- | --- | --- |
| Vault intelligence / Ask your Vault | `ObsidianSemanticController.openAskVault()` | Uses the semantic index and configured language model |
| Vault intelligence / Deep Audit | Shared `openAuditModeModal()` → `AuditModeModal` | Eligible note reads, bounded model input, advanced audit data/reports; mode selector retains Single Audit |
| Vault intelligence / Generate MOCs | `generateMOCsFromClusters()` | Creates/updates generated MOC notes from saved clusters; missing descriptions use the model |
| Batch processing | Exact existing `BatchProcessModal` | Multiple-note changes with existing filters, previews, presets, prompts, confirmations, backups, progress and reports |
| Legacy reports / Vault dashboard | `runVaultAudit()` | Creates report/dashboard artifacts using note metadata and the model; separate from modern Health checks |

Knowledge Health is a focused Health signal. Full Deep Audit remains an advanced
whole-vault analysis/report workflow. Opening its mode selector does not run a
Knowledge check or create a Health receipt. Opening Batch may enumerate notes for
its existing filters/preview, but does not process notes.

Editor tools are a descriptive catalog: Write with AI, Work with selected text,
Vault-aware writing, Generate Dataview and Atomize note. Users open a concrete
Markdown editor and use the command palette or existing editor context actions.
Tools never guesses or caches an editor. Small cross-references lead to Recall
for flashcards, Discover for semantic exploration, and Connect for proposals.
These are not duplicate primary tool actions.

Opening Tools only renders the catalog: no enumeration, reads, writes, network,
Health scan, Semantic work, Recall work or Connect work. Only an explicit action
calls a host operation. Tool-specific setup validation, confirmation and detailed
results remain with the existing workflow. A launcher rejection uses fixed safe
copy; retry clears it. Late rejections cannot restore a detached route. Leaving
Tools does not cancel plugin/modal-owned operations.

## Settings overview and Advanced Settings

The pure settings view model selects display fields from
`DeepIntelligenceSnapshot`, `SemanticIntelligenceSnapshot` and `ConnectSnapshot`.
It reuses their existing presentation helpers and excludes credentials, tokens,
endpoint URLs, raw errors and provider bodies. It reads no vault data and performs
no connection tests, indexing, provider requests or settings writes.

- Deep Intelligence shows status, provider and model. Configure/Change opens the
  existing Deep setup chooser in Health.
- Semantic Intelligence shows status, provider/model and vector count when Ready.
  Configure/Change opens the existing Semantic chooser in Health.
- Veynrel Connect shows its existing safe state. Open Connect navigates to Connect.
- Recall explains native, local FSRS scheduling with no third-party review plugin.
  There are no new scheduling controls or exposed FSRS weights.
- Advanced Settings explains low-level provider, output and interface options.

**Native settings entry decision:** the installed `obsidian` declarations
(`node_modules/obsidian/obsidian.d.ts`, `App` and `PluginSettingTab`) provide no
public typed operation to open and select a plugin settings tab. The product
therefore displays **Obsidian Settings → Community plugins → Veynrel**, then the
gear icon (Options), localized in EN/RU. There is no private `app.setting` access,
undocumented command execution, `any` cast, or monkeypatch in product code.

The existing Advanced tab uses one inventory for modern declarative settings and
legacy `Setting` rendering. Its groups now read:

1. Deep Intelligence — Advanced
2. Semantic Intelligence — Advanced
3. Veynrel Connect — Advanced
4. Deep Analysis — Advanced (explicitly Deep Audit tuning, not Health thresholds)
5. Writing & Output
6. Interface

The baseline inventory at `4bd9f5048a9ef605c4d2396eb00bb7842b8568a7` is captured in
`tests/fixtures/settings-ia-baseline.json`: **35 rows, 27 durable keys**. Existing
callbacks, helper methods, schema and defaults also have normalized source
contracts. Regrouping changes labels/descriptions/search aliases only; provider
semantics, get/set/save, validation, visibility and persistence are preserved.
The shared serialized settings-save queue and its Deep/Semantic/Connect concurrency
contracts are untouched. The same output folder/insertion and interface controls
remain available. Both technical and product aliases remain searchable, including
Language model/LLM, Embeddings/Semantic, Companion/Connect/endpoint/token/timeout/MCP,
Deep Audit, MOC, Atoms and Insertion.

## Legacy capability map

| Existing capability | Final surface |
| --- | --- |
| Local Health | Health |
| Semantic Search | Discover |
| Related Notes | Discover |
| Potential Duplicates | Discover |
| Semantic Health | Discover → Findings |
| Ask Vault / RAG | Tools |
| Deep Knowledge | Health |
| Full Deep Audit / Single Audit | Tools → existing audit mode selector |
| Flashcard generation | Recall; existing command/context/batch actions retained |
| Native review | Recall |
| Companion / MCP | Connect |
| Proposal review | Connect; existing command retained |
| Batch processing | Tools; both legacy direct commands retained |
| MOC generation | Tools |
| Legacy Vault audit/dashboard | Tools → Legacy reports; existing command retained |
| Atomize note | Editor command/context menu and Tools catalog |
| AI writing / selection transformation / vault-aware writing | Editor commands/context actions and Tools catalog |
| Dataview | Editor command/context menu and Tools catalog |
| Advanced provider/output controls | Settings → native Advanced Settings instructions |

## Compatibility and branding

All 21 command IDs and six context actions remain. Existing hotkeys and automation
keep the same IDs and callbacks; no new route command was needed. The flashcard
prompt now begins with Veynrel Recall producer framing in both languages. All
remaining prompt rules, including one-line `question::answer`, forbidden labels,
and native parser compatibility, are unchanged. The generated fixture is consumed
by the real native Recall service in regression tests.

The visible product uses Veynrel. Internal `AIHubPlugin` / `AIHubSettings`, manifest
ID `ai-knowledge-hub`, `ai-hub-*` command/CSS identifiers, storage paths, existing
protocol headers and embedding probe text remain intentionally compatible.
Historical docs, fixtures and evidence are not mass-renamed. The remaining AI Hub
console diagnostic is internal; it is not a workspace, modal, settings or command
label. No additional stale visible product branding was found in the scoped audit.

There is **no new persistence schema or migration**. The current settings fixture
loads without a write or reset. The 1.7 fixture retains the existing pre-IA
Companion vault-ID initialization when that identity is absent; regrouping adds
no migration or save. No engine, analyzer, prompt family, dependency, version,
tag or release is introduced.

The original functional redesign roadmap is complete with this IA. Remaining work
is release hardening: platform coverage, live-provider integration checks under
explicit credentials/consent, dependency maintenance, and release packaging/review.
Hidden Connections and Recall optimizer/history/decks remain outside this roadmap
completion and are not implemented here.

Verification evidence and platform limits are in [product IA verification](product-ia-verification.md).
