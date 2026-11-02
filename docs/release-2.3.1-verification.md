# Markdown Studio 2.3.1 verification

The scoped change adds a 90,000 ms buffered wait to Markdown recipes, responsive AbortSignal cancellation, and an explicit incomplete preview for valid nonempty `length` responses. The opt-in typed API path is used only by Markdown Studio. Other buffered callers, SSE, Community and Excalidraw retain their existing completion/deadline contracts. Provider errors, refusal and tool calls take priority over preview eligibility. Production prompts, model settings, HTTP bodies/headers and dependencies are unchanged.

Incomplete rows have no preserved document, final output or write plan. UI selection, plan preparation, Apply and direct create reject them. Mixed batches retain complete-row writing and Undo. Immutable rows and plan identity prevent stale confirmations. Only an incomplete run receipt is persisted; preview text remains in memory. History keeps this warning even after a later batch cancellation or full-row write, without restoring a writable Review.

## Automated checks

- `npm ci`: passed with the retained lockfile (only root version metadata changed).
- `npm test`: **5,230 passed / 193 files**.
- `npm run lint`: typecheck, production build and lint passed; only the two existing documented `fetch` advisories remain, with no suppression or new warning.
- `npm run audit:proposals`: **5/5** mutations killed, every restored test passed.
- `git diff --check`: passed.
- [Saved-response local replay](release-2.3.1-evidence/replay.json): 13 complete results and one incomplete preview, exact saved visible-text hashes and recorded delays, fake timers and reconstructed HTTP envelopes. No new provider observations or revised historical labels.

Tests cover the exact 90-second boundary, late resolve/reject after a new run, cancellation/disposal and lock release, malformed/empty/refused/tool responses, output bounds, mixed Apply/Create blocking, stale plans, restart receipts and Undo. Existing API and diagram regressions remain in the full suite.

## Native desktop evidence

[Native receipt](release-2.3.1-evidence/native.json): 46 assertions passed in a new synthetic vault and separate Linux Obsidian profile. The production bundle talked only to a local synthetic HTTP responder. A complete response arrived after a real 66-second delay; a length-limited fragment after 33 seconds. Native clipboard reads matched the fragment exactly in both languages. Navigation/reopening, narrow layout, restart history, programmatic write refusal, saved-editor guards, YAML preservation, selected-row creation, Apply/Undo and journal-failure recovery were exercised.

[English preview](release-2.3.1-evidence/incomplete-en.png) · [Russian preview](release-2.3.1-evidence/incomplete-ru.png) · [390 px Russian preview](release-2.3.1-evidence/incomplete-ru-390.png).

Reproduce after building: `node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-UNIQUE`. The existing harness now retains its legitimate abandoned long-wait run when checking for spurious history entries; it still rejects a duplicate interrupted record for a successfully created operation. The first harness attempt and sandbox-limited mutation-audit attempt were retained locally; the fresh final native run and unrestricted audit passed.

Reviewed scope: transport validation, Studio callers, operation ownership, read/write/Undo authority, storage compatibility, localization, release metadata, and current user-guide links. No external model was used for implementation validation or review. Physical mobile, screen-reader speech and new model-quality evaluation were not run. Publication and asset provenance are checked separately against the eventual merge/tag commit.
