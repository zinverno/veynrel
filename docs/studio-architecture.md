# Veynrel Studio v1

## Audit and scope

Base: `34c169840d4f078990728cecc50e6f23c2d1c22d`, fetched from origin/main on 2026-10-26. Work is isolated on `feat/studio-local-recipes-v1`. Existing worktrees and open PRs are not dependencies. Repository has no tracked AGENTS.md or Graphify graph at this base.

`BatchProcessModal` selects metadata then calls `runBatchProcessing`, which reads, generates and writes each note immediately. `BATCH_PRESETS` has no stable/versioned identity or review stage. Both remain unchanged. Studio uses its own declarative recipes and workflow owner.

Reuse: `callOpenRouter` and `buildChatBody` for all five provider profiles, `LanguageModelSettingsPort` for existing connection settings, `readSavedNote`/`sameSavedNote` for exact saved sources, `guardSavedEditors` for writing with main/popout/deferred views, and `renderPlanDiff` for literal paginated diffs. `replaceNoteIfUnchanged` demonstrates the identity/content check inside `Vault.process`; Studio needs the additional synchronous editor/cancellation guards in that callback. Existing backup helpers lack durable receipt/recovery semantics, so are not sufficient by themselves.

Consolidation journals establish the applicable contract: redundant immutable before/after evidence before modification, fresh rereads after journal IO, exact identity and contents, intent before Undo, confirmation only after observing the physical result, and no automatic recovery. Their operation-specific record equations/tickets cannot represent general transformations. Studio owns a separate format and service; it does not change Consolidation's formats, commands, or execution rules.

Settings remain owned by the existing serialized `saveSettings` queue. Studio recipes and journals are separate files under the actual `Vault.configDir` and plugin ID, never settings fields or vault-root Markdown. The native view has its own type and plugin-scoped owner. UI uses existing Graphite/Amethyst conventions, CSS variables and the resolved RU/EN language.

## Modules and ownership

| Module | Responsibility |
| --- | --- |
| `recipe.ts`, `builtins.ts` | Strict v1 boundary, scope/size limits, three built-in recipes; no IO. |
| `registry.ts`, `storage.ts` | Separate serialized local library, strict import/export and preserved originals/backups. |
| `runner.ts` | One active run; pinned source and settings snapshots, exact request preparation, explicit consent, sequential generation, immutable ReviewSession. No DOM. |
| `obsidianNotes.ts` | Canonical selected Markdown, bounded saved-source reads, separate `readGuard` and `writeGuard` contracts, existing guarded `Vault.process`. |
| `journal.ts`, `apply.ts` | Redundant immutable operation records, verified intents/receipts, sequential per-file outcomes, read-only inspection, fresh one-use Undo/recovery reviews. |
| `registerStudio.ts`, `view.ts`, `messages.ts` | One plugin-scoped owner, separate `veynrel-studio` ItemView, command/ribbon, native controls, RU/EN and literal previews. |

The shared model settings port is read only. `buildChatBody` constructs the exact displayed payload; `callOpenRouter` sends the same system/user/options through the existing Ollama, OpenRouter, OpenAI, Groq and Custom transport. Studio requests an explicit normal finish reason, rejects incomplete/refused/tool responses and never retries. Provider credentials stay in memory and the existing settings file; Studio does not include them in request previews, recipes, run receipts or operation journals.

```mermaid
flowchart LR
  L[Local library] --> S[Explicit note selection]
  S --> P[Read fixed saved sources and prepare exact requests]
  P --> C[Separate data transmission consent]
  C --> G[Sequential existing LLM transport]
  G --> R[Immutable literal Review and diff]
  R --> A[Select files and separately confirm Apply]
  A --> J[Verified records and per-file intents]
  J --> W[Guarded Vault.process and verified receipts]
  W --> H[Explicit history inspection]
  H --> U[Fresh Undo or recovery review and confirmation]
```

Opening Studio loads only plugin-owned recipe metadata. Inventory uses cached file paths, never note contents. Preparing a run explicitly reads only its fixed selected scope. One note is sent per request; paths identify local operations but are not included in the request body. Neighbors, embeddings and whole-vault content are not consulted. Choosing a folder is explicit and includes nested Markdown; scopes over 20 files are refused, not sampled. Hidden paths and the actual configuration directory are excluded.

Closing a view detaches its observers and closes unconsumed confirmation dialogs. It does not cancel the shared runner. Reopening or opening a second tab observes the same engine. Stop during generation holds the owner until the issued request settles, discards that late response, and starts no next request. Stop during Apply is available inside its confirmation modal and completes observation/receipt work for an issued write before stopping. Plugin disposal cancels future work; existing async writes may still need startup inspection if the process exits.

Saved Markdown editors may stay open during preparation, generation and Review. `readGuard` checks file identity/stat and exact agreement between the saved source and every affected loaded Markdown view, including other windows. Unsaved buffers are never substituted into a request; they require saving and fresh preparation. Deferred or uninspectable affected editors fail closed. `writeGuard` still uses the Consolidation guard and refuses all affected open editors, even equal buffers. Before consuming Review, Runner preflights selected write guards without creating a journal. If blocked here, closing editors and explicitly confirming again reuses the exact same Review and sends no model request. Once the journaled Apply starts, its existing single-use/partial/recovery rules apply; this is not a retry of an uncertain write.

Native Obsidian inspectors retain `.file`/state paths even after the note editor closes. Both Studio guards exclude only observed `backlink`, `outgoing-link` and `outline` views which are **not** `EditableFileView` and expose neither `getViewData` nor an editor. Unknown/custom types remain blocked. The shared `obsidianSafeApplyPort`/`guardSavedEditors` accepts an optional read-only-view predicate; only Studio supplies it. The default remains disabled, preserving every existing Consolidation caller. This predicate is reevaluated before writing and inside the existing `Vault.process` guard, not cached as write permission. The native type strings are observed implementation identifiers, not an extension API guarantee.

The workflow states are `idle`, `preparing`, `prepared`, `generating`, `review`, `applying`, `partial`, `completed`, `failed`, `cancelled`, `interrupted`. Preparation and full reviews are memory-only. A persisted start/finish receipt makes a lost generation/review visible after restart; it cannot resume or authorize Apply. History uses operation evidence for applied files. A fresh explicit run is necessary if a review was lost.

The minimal v1 includes one `llm_transform` step, fixed language/additional-instruction parameters, and Markdown replace/append. Other handlers and formats can extend the discriminated manifest and runner/output boundary; the registry's local CRUD/persistence need not become an executor. Unsupported versions/formats remain rejected until implemented. There is no marketplace, authentication, public catalogue, Excalidraw adapter, dynamic code, recipe HTTP client or sync service.

Reach: new `studio/` implementation and tests; registration only in `main.ts`; scoped styles; new documentation and native harness. No dependency, release metadata, semantic algorithm, Health/Recall schema, legacy Batch or existing Apply/Undo protocol changes.

See [schema](studio-recipe-schema-v1.md), [safety and recovery](studio-safety-and-recovery.md) and [native verification](studio-native-verification.md).
