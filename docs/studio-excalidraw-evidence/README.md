# Studio Excalidraw v1 evidence — 2026-10-27

Base: `cf039b1a69ce88a60bad73f424bff3e1057ffc7c`. Branch: `feat/studio-excalidraw-v1`. This is synthetic integration evidence, not semantic model evaluation or user acceptance.

## Automated gates

| Gate | Observed result |
|---|---|
| `npm test -- --maxWorkers=4` | 5,030 tests / 185 files passed; diagram contract/workflow: 97 tests |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |
| `npm run lint` | Passed, with the two existing reviewed fetch advisories in `api.ts` and Community transport |
| `npm run audit:proposals` | 5/5 mutations killed, restored tests passed |
| `git diff --check` | Passed |

Logs and artifact checksums accompany this summary. No dependency, package version, manifest or command ID changed. Production `main.js`: 2,249,102 bytes; diagram modules contribute 56,093 bytes according to esbuild metadata. All external runtime imports remain `obsidian`.

The first recorded proposal-audit attempt failed because the child returned empty stdout where the existing harness required a passing-test count; [raw failure](proposal-audit-attempt.txt) is preserved. A subsequent unchanged invocation passed all five cases. The cause of the empty output is not established; no audit code or assertions were changed.

## Native diagram acceptance

Final run: `/tmp/veynrel-diagram-native-20261027-l` using [the reproducible harness](../../scripts/studio-excalidraw-native.mjs). [Raw report](native-report.json): **25 checks passed**, four synthetic HTTP completions through the existing `callOpenRouter → requestUrl` transport, zero captured renderer exceptions. This run loaded the exact final production bundle whose hashes are in `artifacts`.

- Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**.
- Official Excalidraw **2.29.0**, upstream commit `4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb`; installed release asset hashes and Obsidian `app.asar` hash are recorded.
- Actual Studio consent, safe SVG preview, structure, exact-path confirmation, native `.excalidraw.md` creation and explicit open.
- Native pointer/keyboard edits of an individual container text and an arrow label; actual pointer drag of a node updates its bound arrow. Saved and reopened edits/bindings are asserted, with before/after native elements in the report.
- The actual Excalidraw local-link handler opens `Source.md`. The harness invokes that handler with the selected native element; it does not claim a physical click on the link icon.
- Saved source remains open while creating a separate drawing. Divergent-buffer refusal uses a temporarily injected native view buffer; actual unsaved typing/popouts are exercised by the existing Markdown regression harness.
- Excalidraw disabled at startup leaves Veynrel operational and blocks diagram sending. Disable/reload between Review and creation refuses; two actual Studio leaves share one operation owner; cancellation and restart never replay a request or create.
- RU/EN, built-in light/dark, split pane, 390 px desktop emulation, keyboard Tab, preview fit/zoom. These are desktop checks, not physical mobile or a screen-reader audit.
- Both source/control Markdown files retain their hashes. The drawings folder contains exactly one new native file, despite global SVG/PNG autoexport being enabled in the synthetic plugin settings. A subsequent [complete vault inventory outside configDir](vault-inventory.json) confirms exactly the two original notes and that drawing. No inherited template, additional export, duplicate or temporary drawing appears.
- Hostile model labels include transclusion, Markdown URL, URI and HTML-like text. They remain inert typography. The read instrumentation did not observe `Untouched.md` being read. Captured renderer traffic contains no HTTP(S) request or model-controlled destination. This combines renderer network observation with the local HTTP server's request log; it is not an OS-wide packet-capture claim.

## Artifacts to inspect

- [Reviewed drawing](reviewed.excalidraw.md): exact newly created native output, before opening/editing.
- [Edited drawing](edited.excalidraw.md): native text/arrow-label edits and moved block after save/reopen.
- [Synthetic source](Source.md): copy alongside either drawing into an isolated vault to resolve its source link.
- [Native canvas](native-open.png), [edited canvas](native-edited-moved.png).
- [Split Review](review-en-dark-split.png), [Amethyst/light Review](review-en-light-amethyst.png), [Russian 390 px light](review-ru-390-light.png), [Russian 390 px dark](review-ru-390-dark.png).
- [Markdown regression report](markdown-regression.json): existing 69-check Studio native harness, including saved/unsaved editor, popout, Apply/Undo, restart/recovery, RU/EN, themes and 390 px. Final run `/tmp/veynrel-studio-native-diagram-final-20261027` uses the same production bundle and captures zero renderer exceptions. It runs without Excalidraw enabled.

The report's final history state is intentionally `changed-unavailable`: the harness edited the drawing after creation. A save immediately after first open still verified as `created`; native serialization normalization was accepted before any user edit.

## Retained intermediate attempts

All attempts remain outside the repository under `/tmp/veynrel-diagram-native-20261027-{a..k}`; none substitutes for final run `l`. Attempts `a`, `b`, `d`, `g` exposed harness runtime-version, viewport, zoom API and click-sequence issues. Attempt `c` exposed real compressed-newline decoding; `f` exposed native serialization/arrow-endpoint normalization; these were fixed and regression tested. Attempt `e` timed out during plugin startup. Attempt `i` exposed ambiguous arrow-label targeting and sibling routing; both were corrected. Runs `h`, `j`, `k` passed their assertions but preceded the final layout fix: visual inspection of `k` showed a feedback route crossing the disconnected component, now prevented by component-local return lanes. Run `k` also captured an Obsidian `app.js` zoom-status exception (`webContents.getZoomFactor`); final `l` captured none. No claim is made that the underlying host exception is fixed.

## Remaining gates and limitations

User manual smoke and real-model factual/usefulness review are **NOT RUN**. See the [manual protocol and architecture](../studio-excalidraw-v1.md). Only pinned Excalidraw 2.29.0 is accepted. Layout retains cycles and components but does not guarantee crossing-free arbitrary graphs. User hooks/other plugins, external filesystem races, physical mobile, custom themes and screen-reader behavior are outside this acceptance. No diagram deletion/Undo or Community diagram recipes are provided.
