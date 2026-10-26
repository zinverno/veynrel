# Veynrel Studio v1

## Audit and scope

Base: `34c169840d4f078990728cecc50e6f23c2d1c22d`, fetched from origin/main on 2026-10-26. Work is isolated on `feat/studio-local-recipes-v1`. Existing worktrees and open PRs are not dependencies. Repository has no tracked AGENTS.md or Graphify graph at this base.

`BatchProcessModal` selects metadata then calls `runBatchProcessing`, which reads, generates and writes each note immediately. `BATCH_PRESETS` has no stable/versioned identity or review stage. Both remain unchanged. Studio uses its own declarative recipes and workflow owner.

Reuse: `callOpenRouter` and `buildChatBody` for all five provider profiles, `LanguageModelSettingsPort` for existing connection settings, `readSavedNote`/`sameSavedNote` for exact saved sources, `guardSavedEditors` for main/popout/deferred views, and `renderPlanDiff` for literal paginated diffs. `replaceNoteIfUnchanged` demonstrates the identity/content check inside `Vault.process`; Studio needs the additional synchronous editor/cancellation guards in that callback. Existing backup helpers lack durable receipt/recovery semantics, so are not sufficient by themselves.

Consolidation journals establish the applicable contract: redundant immutable before/after evidence before modification, fresh rereads after journal IO, exact identity and contents, intent before Undo, confirmation only after observing the physical result, and no automatic recovery. Their operation-specific record equations/tickets cannot represent general transformations. Studio owns a separate format and service; it does not change Consolidation's formats, commands, or execution rules.

Settings remain owned by the existing serialized `saveSettings` queue. Studio recipes and journals are separate files under the actual `Vault.configDir` and plugin ID, never settings fields or vault-root Markdown. The native view has its own type and plugin-scoped owner. UI uses existing Graphite/Amethyst conventions, CSS variables and the resolved RU/EN language.

## Implementation plan

1. Strict manifests, built-ins, serialized local registry with preserved corruption evidence.
2. DOM-independent preparation, exact consent, sequential generation and immutable review.
3. Guarded sequential Apply, redundant journal evidence, conservative restart inspection and separately confirmed Undo.
4. Native Studio library/editor/scope/consent/review/history, one owner across tabs.
5. Fault-injection tests, required repository gates, synthetic native verification, final safety review and PR.

Reach: new `studio/` implementation and tests; registration only in `main.ts`; scoped styles; new documentation and native harness. No dependency, release metadata, semantic algorithm, Health/Recall schema, legacy Batch or existing Apply/Undo protocol changes.
