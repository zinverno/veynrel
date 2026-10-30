# Excalidraw first-open polish v1

Base: `be8f1a8862b377d777a96149b306b8ecf7915a2c` (merged PR #128), branch `fix/studio-excalidraw-first-open-v1`. The current origin/main was fetched before creating this isolated worktree. Exact review HEAD and runtime hashes are in the package's `REVIEW.json` and `SHA256SUMS`.

## Result and implementation

New drawings use tighter measured node/rank spacing, a centered title, and an unbound 16px native text caption linking to the selected source. Feedback lanes and disconnected components remain separate. Forward-label clearance determines rank spacing; a feedback label does not widen every rank. Preview bounds come from native EA `getBoundingBox` over all elements, including arrow paths and the caption. Down/right and neutral/amethyst remain available. This changes deterministic presentation only.

The first explicit Studio Open of a newly created, unchanged file starts a bounded UI-aware `setViewport({target, fit:"contain", offsets:{ui:true}, animation:false})` first-open session. Eligibility is in memory, consumed once, and tied to the file identity and mtime. Existing tabs are revealed; history opens and later opens keep their camera. An already loaded scene is handled immediately; otherwise a scoped native scene hook waits for readiness. Pointer, wheel or keyboard interaction cancels deferred fitting. Excalidraw 2.29.0 asynchronously normalizes bound text and repeats its opening fit. One additional correction is allowed only for that clean, structurally identical native normalization, before any user input; at most two viewport calls are possible. There is no refresh-driven loop. View unload removes the hook/listeners.

The camera observer runs after Excalidraw's dirty tracking. It clears only the dirtiness caused by this camera change, after exact comparison of all elements and the pinned host's complete set of non-camera persisted app-state fields. Concurrent document changes, loss of active view, or user input cancel that operation. No save or file rewrite is requested. Tests cover the already-ready race, delayed readiness, cancellations, concurrent edits/settings, API failure and cleanup. Active foreign EA hooks take precedence: Studio skips automatic fitting instead of replacing an integration's behavior; native Fit is still available.

The caption's exact native link is verified in both the scene and Markdown metadata. EA 2.29.0 omits text-element links from its initial metadata serializer, so the existing public `create({plaintext})` parameter supplies the code-owned `Element Links` entry in the same create-only operation. There is no post-create repair. On explicit native save, Excalidraw retains that exact prelude and adds its canonical entry inside Excalidraw Data. Readback recognizes only that exact prelude at the beginning plus at most one matching canonical entry; extra copies, changed links and unrelated text still fail. A native save/readback regression and strict metadata tests cover this. Historical rectangle attribution remains valid; the original historical intent/receipt/drawing are exercised without migration or rewriting.

DiagramSpec v1, JSON Schema, prompts, model algorithm, preflight/routing, timeouts, create guards, consent/Review, journals, Markdown/YAML policies, dependencies, version, styles.css and manifest.json are unchanged.

## API evidence

Pinned plugin: Excalidraw **2.29.0**, commit `4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb`. Its dependency is `@zsviczian/excalidraw` **0.18.143**, git head `b965b9f72227b9a0be31a6a74e4d477cea2c2a90`.

- [ExcalidrawAutomate](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb/src/shared/ExcalidrawAutomate.ts): isolated getAPI, setView, registerThisAsViewEA, scene-change hook, clearViewDirty, create plaintext and bounding boxes.
- [ExcalidrawView](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb/src/view/ExcalidrawView.ts) and [tracked state](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb/src/view/trackedAppState.ts): hook lifecycle, initial-load ordering and dirty tracking.
- [Canvas viewport API](https://github.com/zsviczian/excalidraw/blob/b965b9f72227b9a0be31a6a74e4d477cea2c2a90/packages/excalidraw/viewport.ts) and [App](https://github.com/zsviczian/excalidraw/blob/b965b9f72227b9a0be31a6a74e4d477cea2c2a90/packages/excalidraw/components/App.tsx): measured UI offsets, unlocked one-shot viewport, onChange observer after the host callback.

The public `state.zoomToFit` opening option was tested and rejected for this fix: the legacy fit still put the title under the toolbar and could dirty the camera. No guessed delays, DOM clicks, global EA changes, Electron zoom patch, or recurring production auto-fit were added.

## Evidence and reproduction

Final gates: **5183 tests / 192 files**, **171 focused diagram tests**, typecheck/build/lint, mutation audit **5/5**, and diff check passed. Lint retains its two reviewed fetch advisories. Native acceptance on the final runtime covers **9 matched pairs plus the default-auto-fit case**, with **10 local fixture requests**; the full diagram regression adds **35 checks / 7 local requests**, including both unchanged 30-second timeout cases. The latter has zero renderer exceptions. First-open acceptance captured **one known Obsidian `getZoomFactor` exception**, also reproduced in the original baseline; the complete exception remains in the report. No exception was suppressed or patched.

The gallery decoded all **18 PNGs** and resolved all **22 links** over localhost in an isolated real browser at 1300/390 widths, without horizontal overflow. Build runtime commit: `100a332959d50fc1978277b8cff7fdccb66b96b4`; main.js SHA256: `1ef234f86e82da1c9e9031f1945816517ff0756bcb19815f90a1bd390ea5dea8`. styles.css and manifest.json retain their base hashes.

See [native evidence](studio-excalidraw-first-open-v1/evidence/), [manual smoke](studio-excalidraw-first-open-v1/manual-smoke.md), and [validation](studio-excalidraw-first-open-v1/validation.json). The ZIP provides a relative-path BEFORE/AFTER gallery.

The matched matrix contains three synthetic fixtures: structural components, Russian branching flow with a feedback edge, and a long-label horizontal stress graph with a disconnected glossary. Each is created through real Studio Review/confirmation and opened at a 1300px desktop window, a real split with approximately 726px canvas, and a 390px window (344px canvas). Host light/dark is changed through `app.changeTheme`, and actual body theme classes are asserted. RU/EN refer to Studio UI; the independent Excalidraw toolbar follows its native locale.

Bounds come from native `getBoundingBox` and canvas transforms, compared to actual toolbar/viewport rectangles; negative arrow points are included. PNGs are raw native captures. Source and drawing hashes, versions, exact synthetic request bodies, measured camera/UI bounds, and exceptions are retained in the reports. Existing old content-only D/E outputs with missing edge labels were not repaired or used as valid scenes; these are explicitly synthetic fixtures.

The harness loads the unchanged production bundle with a test-only requestUrl destination/headers adapter into a disposable vault/profile. Bodies still traverse production preflight, request construction and native HTTP; only loopback receives them. The adapter rejects any other destination. No remote model request, API key, user vault or global settings are involved. Generated profiles and test transport settings are not packaged. All synthetic requests are counted; camera/edit/navigation operations add none.

## Limits

Real-model correctness and usefulness: **NOT RE-EVALUATED**. This verifies Linux desktop rendering, interaction and file invariants only. Physical mobile, screen-reader speech, arbitrary custom themes and third-party hook combinations were not tested. At 390px the long horizontal stress graph reaches native minimum zoom (10%): the overview fits, but reading labels requires manual zoom/pan. No universal readability or crossing-free layout claim is made.

Earlier failed attempts are preserved and explained in `evidence/attempts/attempts.json`, including an intermittent baseline Obsidian `webContents.getZoomFactor` exception, a first-open readiness race, a test-only arrow-bounds error, a close/save readiness issue, a renderer interruption of unproven cause, and keyboard test selector/focus issues. Plain Enter on a selected native text caption is intercepted by Excalidraw for text editing; Tab to the native link popup and Ctrl+Enter opens the source. They are not acceptance passes. No merge, release, deploy, user-vault installation or model-quality reevaluation was performed.
