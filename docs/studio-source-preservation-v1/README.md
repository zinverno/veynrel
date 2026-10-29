# Studio Source Preservation v1

[Review follow-up r2](review-followup-r2.md) corrects the shipped synthetic responder and replaces the invalid r1 light-theme evidence. Production bytes and contracts are unchanged.

New Markdown Reviews default to **a separate note in the source folder**. The source remains untouched by the create operation. Changing the source requires selecting that destination and confirming an exact plan. Generation consent remains separate from write consent. Real-model quality: **NOT RE-EVALUATED**; this stage makes no remote inference requests.

## Owners and contracts

`Recipe.output.action` still means replace or append. Recipe v1, builtins, Community manifests/prompts, shared model settings, request bodies/routing and timeouts are unchanged. `documentEnvelope.ts` assembles the source-safe and separate-note bodies once. The immutable Review retains source, raw response, assembled document and bounded observations. Review renders literal text, never MarkdownRenderer, embeds or postprocessors.

`writePlan.ts` fixes Review ID, one-time plan ID, destination, selected rows, source identity/stat/hash, exact targets/payload hashes and policy/check versions. Selection, destination or filename changes invalidate pending consent, including during asynchronous preflight. In-place acknowledgement is unchecked and required when observations, incomplete checks or excluded model properties exist. It cannot override freshness, editor or path guards.

`StudioOperations` gates preparation, generation, existing Apply/Undo and Markdown/diagram creation across leaves. `StudioApply` remains the existing-note owner, with exact source-properties checks before intent and inside the guarded `Vault.process` callback. New source writes use explicitly versioned schema 2 confirmation metadata; schema 1 records/markers and their Undo remain readable without migration.

`StudioMarkdownCreate` and its separate journal namespace own create-only operations. They do not depend on Excalidraw and do not call the model. [Write/recovery contract](create-recovery.md), [frontmatter policy](frontmatter-policy.md), [diagnostic limits](checks.md), [native evidence](native-evidence.md), [manual smoke](manual-smoke.md).

## Boundaries

Up to 20 selected results, one destination per confirmation, sequential writes. New notes omit source/model frontmatter and prepend a literal `Source / Источник: [[full/source/path.md]]` link, resolved from the selected TFile. Append means original body + two LF characters + response body; the source prefix stays protected when writing in place. No link rewriting, invented properties, folders, automatic opening, automatic deletion or create Undo.

The final document shown in Review and confirmation is the actual payload. “Open result” is a separate explicit action requesting Markdown source mode. Third-party hooks and later editor saves remain outside Studio's control. Saving a derivative draft is allowed despite lexical observations. Meaning is always explicitly unverified.

No changes to Health, themes/CSS, catalog/site, real user vaults, dependencies, versions or releases. No typed extraction, semantic scoring, repair requests or Excalidraw viewport work.
