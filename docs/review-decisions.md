# Explicit “Leave as is” decisions

This is a bounded completion of the accepted beta review interface in PR #113. It does not redesign the source-note panels or change candidate generation/ranking, maps, FSRS, evidence validation, planners, writers, journals or Apply/Undo tickets.

## Behavior

**Оставить как есть / Leave as is** records an explicit decision for the entire pair, closes comparison and returns to the previous list, preserving scope, search and scroll position (subject to the remaining document height). It is available without running an analysis, and from a validated result, including a primary `no_change` recommendation. The former “Dismiss recommendation” control is removed; “Another option” still opens independently checked alternatives.

Only successful persistence completes review. Back, window close, cancelled consent, failed analysis and stale callbacks do not decide anything. A failed save leaves comparison and the candidate available, with a focused, readable error. The result is retained for an explicit retry; no additional analysis is needed.

The list shows “Pair left unchanged” with **Undo decision**. A compact **Reviewed** disclosure offers **Reopen review** after navigation or plugin restart. This removes only the decision, never a Markdown operation or its receipt. Both Repeats and Connections active queues use the same decision. Candidate sources/findings and note search remain unchanged; leaving a pair does not disprove semantic overlap.

## Identity and storage

`<configDir>/plugins/<pluginId>/review-decisions.json` holds schema 1, canonical paths, file creation identities and SHA-256 hashes of complete saved Markdown. It contains no note text, model answer, consent or executable ticket. The two note records are sorted by exact path before hashing; A/B order and identical basenames in different folders cannot conflate pairs. Mtime and index revisions are not part of the decision.

Changing either text, renaming a file or changing its creation identity invalidates suppression. Rewriting identical Markdown or refreshing an index does not. One current decision is retained per canonical pair; undo addresses its exact decision ID, so an old confirmation cannot erase a newer version’s decision. The prior source/operation snapshots are not modified.

One plugin-owned store serializes writes across views. It stages `.tmp`, moves the prior state to `.bak`, then renames staging into place: Obsidian’s adapter does not overwrite an existing rename destination. Memory is published only after the replacement succeeds. Failed replacement attempts restore the prior state; if rollback is unavailable, a missing primary file can load the previous backup. Staging is never loaded. Invalid/unreadable persisted data is reported and does not suppress candidates or get silently replaced. This is plugin preference state, separate from the Markdown execution journals; it does not promise recovery from storage-device loss or conflicting writes by a second application process.

Only candidates with matching stored paths need the additional version check beyond the visible local-facts page. They show a short checking state until resolved, rather than flashing back into the active queue after restart. Read failure never asserts a match. Counts are derived from active candidates without changing their source order.

## Verification

Regression tests cover persistence/reload, inverse A/B, same basenames, text/mtime/identity changes, failed staging and replacement/rollback, serialized decisions, exact-version undo, malformed state, closed owners, cancellation, both result actions and save failure without dismissal. UI tests cover return context, filtering, restoration and no map construction. Existing strict transport/evidence/preflight and Apply/Undo tests remain in the full suite.

Native acceptance uses the existing isolated six-note synthetic fixture and real Obsidian. The dedicated mode is:

```sh
node scripts/review-flow-native.mjs NEW_ISOLATED_ARTIFACT_DIRECTORY FROZEN_BUILD_DIRECTORY decisions
```

It records native keyboard/mouse actions, refresh, real `disablePlugin`/`enablePlugin`, restoration from Reviewed, both active queues, refusal to save, consent cancellation, inverse pair order and content invalidation. It checks RU/EN, built-in dark/light and 1280/390 px. No provider request is sent. Markdown hashes are compared through the entire decision route; a subsequent, separate synthetic content edit changes exactly one note and is not represented as Undo.

Final build/CI references and captured evidence are listed in `review-decisions-evidence/README.md`. The initial native probe correctly exposed Obsidian’s no-overwrite rename behavior; it is not counted as a pass. No personal vault or TEST is modified, and the fixed-target installer is delivered without running it.

Not rerun for this bounded change: paid/live-model diagnostics, mobile devices, third-party themes, split/popout and global 200% zoom. Existing evidence for the broader review route remains in `final-review-pass-evidence`; it is not relabeled as a new run.
