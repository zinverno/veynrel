# UX follow-up for owner review

This is a dependent Draft on PR #156 (`8870ffc8171199c971a60646761494cab0244eff`, checked open/unmerged). It implements the supplied follow-up package, without redesigning the approved Overview or ring. Auto-merge remains OFF; no merge, release, version or dependency changes. Design acceptance belongs to the owner.

The archive was extracted into a fresh `/tmp` directory. `CODEX_TASK.md`, `04_specs/SPEC.md` and `04_specs/ACCEPTANCE.md` were read; all target images **01–16** were opened with the image-viewing tool, including light variants and 390 px. The gallery and interactive prototype were opened in isolated Chromium and exercised: hover, arrows, Enter, chooser, Cancel/Escape, panel clicks and narrow layout. Its 13 passing checks are **prototype-only**. [Reference hashes and viewed-file list](../evidence/ux-followup/references.json); [original prototype attempts](../evidence/ux-followup/prototype/). Private images were not published or committed; no personal vault was used.

The implementation changes only the requested entry surfaces:

- Native fuzzy chooser retains all **12 catalog tools + 5 editor entries**, its search/keyboard behavior and scroll, with `setIcon` icons. No permanent list or new global navigation.
- Ring segment, center button and chooser use one native explanatory Modal. Catalog copy describes material, relevant model use and effects without querying owners. Open calls the existing launcher once; Cancel/Escape/X restore focus, including in a popout. Selection stays visible while the Modal is open so the center button remains a valid focus destination. SVG title/aria-labelledby protection is retained.
- The five editor entries keep their existing command-palette instructions. They have no context-free launcher: the explanation does not guess a Markdown editor/selection or offer a misleading executable action.
- Bulk audit uses four whole-link panels, separate Batch/Deep Audit/Atomization/MOC callbacks and the existing MOC loading/error/empty/ready branches. Empty groups lead to Deep Audit preparation. Refresh remains a separate footer action; no nested button in a panel.
- Semantic search stays above seven whole-link panels; the map spans two columns on wide panels and a whole row at 390 px. The grid uses the ItemView container height, and narrow content scrolls naturally. **Routing is unchanged**, documented in [semantic-routing-deferred.md](semantic-routing-deferred.md).
- Finding rows have a wrench/“Fix…” primary action and an info/“More details” ghost action, 10 px gap and visible focus. `openLocalNoteRepair` → `openLocalNoteAction` → `LocalNoteModal` prepares the repair; Apply remains in the existing later modal. Details still calls the original selection callback. Filters, groups, counts, freshness and write guarantees are unchanged.

Engines, indices, score semantics, top-K/all-document focus, families, Pair Inspector, FSRS, consent, Review/Apply/Undo, journals, settings and Studio's feature flag were not changed. The original New Life 2.0 was not opened. Themes use Obsidian variables and native icons; no prototype palette, font files or SVG library were copied. Decorative synthetic result miniatures were not turned into analysis output.

## Validation

| Check | Result |
| --- | --- |
| Full existing tests | **5,434 / 213 files PASS** |
| Typecheck + build + lint | PASS; existing `fetch` warnings in `api.ts:460` and `studio/community/transport.ts:13` |
| Mutation audit | **5/5 killed**, restored tests passed |
| Native session / runner contracts | **2/2**, **3/3** |
| Existing visual regression suite | **126 checks PASS**, 0 unfiltered exceptions |
| Follow-up matrix and interactions | **91 checks PASS**, 98 screenshots, 0 unfiltered exceptions; exact SHA/assets in [engineering.json](../evidence/ux-followup/engineering.json) |

[Unmodified check logs](../evidence/ux-followup/checks/) are retained, including trailing blank lines. Tests cover passive explanations, cancellation and origin focus, single invocation, stale launch rejection, editor ownership, all catalog operations and MOC state handling. Native checks additionally cover real chooser/pickers, all four audit panels, seven semantic routes, actual search results, finding preparation/details, long names, keyboard/hover, RU/EN, dark/light, 390 px/wide, reduced motion, split/popout and emulated touch.

The isolated native fixture contains **155 synthetic Markdown files**, including a long filename/target. Every original Markdown file remained byte-identical. The only model request in the follow-up run is an explicit search query to an in-process loopback embedding fixture. No paid/provider request or personal material was used. Passive explanation probes measure note and adapter IO and provider requests after prior host theme saves settle; all three measured openings had zero IO/request deltas. They are not claims about all background Obsidian activity.

Screenshots are real Obsidian 1.13.7 / Electron 43.6.0 captures. Panel comparisons use 1280×830 and 390×1090 ItemView bounds. Chooser/explanation comparisons use full client-window bounds at those sizes, so native modal edges are not cropped by the ribbon. Native themes, font metrics and host chrome intentionally differ from the offline preview. All seven narrow semantic panels have additional scrolled captures.

[Before/after gallery](comparisons.md) · [all final frames](../evidence/ux-followup/after/) · [uncut native video](../evidence/ux-followup/after/journey.mp4) · [existing-suite regression receipt](../evidence/ux-followup/regression/report.json) · [checksums](../evidence/ux-followup/SHA256SUMS).

## Preserved failures and limits

[Attempt index and original receipts](../evidence/ux-followup/attempts/index.json) distinguish product failures from harness mistakes. Manual image inspection caught a named-container mismatch that a DOM-count/overflow check missed; narrow panels and finding actions were fixed and geometry assertions added. Native cancellation caught the hidden-center focus bug; it now has a unit regression. Native close DOM and the CDP Shift modifier were verified, with original unsuccessful captures preserved.

One isolated `Runtime.evaluate` timeout occurred before the first screenshot. The next run passed at the same timeout; its root cause is **not established or declared fixed**. Prior prototype failures (scrollbar equality and an incorrect panel selector), retained-findings-query automation failures and delayed host theme-save observations are also retained.

The first published CI run [44034445942](https://github.com/zinverno/veynrel/actions/runs/44034445942) passed all tests and typecheck/build but failed lint: the archived prototype checker was added after the local lint run as `prototype/check.mjs`, outside the TypeScript project. Its original contents are now preserved as `prototype/check.mjs.txt` (same SHA-256); no lint rule or runtime code changed. The [original CI log](../evidence/ux-followup/checks/ci-44034445942-fail.log) is retained. The PR records the final CI result separately.

- Semantic route convergence is **deferred**, not repaired by new panels. Search/results and subsequent tool forms remain in their existing owners.
- Physical touch, screen reader, Obsidian Mobile, third-party themes, custom frame/GPU/IME and real semantic quality were not checked. Touch evidence is emulation.
- No live paid calls, destructive Batch run, MOC generation, or new Apply/Undo end-to-end operation was performed. Existing pipeline tests remain authoritative for those contracts.
- Historical `e.isShown`, Community document ownership and cold10k gates remain open. Zero exceptions in these bounded native runs do not close them.
- Stock Obsidian chooser sizing/scrolling is retained; synthetic decorative mini-schemes are omitted. Owner visual review remains pending.
