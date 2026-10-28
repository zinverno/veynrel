# Studio follow-up: native theme fidelity

2026-10-28. Existing PR #125; base `feat/studio-excalidraw-v1` at
`e3651e4bf805ddd4d73c5e55195a63ded4a06101` (PR #124 still open).
This follow-up starts at `74c56df62de8f45d5060c3bc2f487e197b475853`.
The catalog/site is outside this follow-up.

## Feedback and changes

The four owner screenshots and their README were read directly. They are private
analysis inputs, not redistributed in this PR. SHA-256 provenance is in
[the evidence sources](studio-theme-fidelity-evidence/sources.json).

| Observed issue | Consequence | Change | Evidence |
| --- | --- | --- | --- |
| Health adds accent and black to host backgrounds; Studio pins purple | Switching views resembles switching themes | Local shared host aliases; remove both Health tint layers and Studio purple/clamped accent | Same-window Health/Studio pairs and computed colors |
| Diagram's full inventory and ordinary parameters precede the action | The initial action is below the viewport | Search reveals candidates only after input; two illustrated radio modes; folder/name; direction/appearance/context in Advanced | Desktop selected-source action visible; keyboard and preserved draft checks |
| Recipe actions sit at the far right; result is only prose | Harder to understand the transformation | Keep list/filter/details; action below its recipe, local result illustrations for the three built-ins, provenance omitted only when filter already states it | Library before/after; no note reads or requests |
| Idle strip says Ready; empty history describes a created drawing | False completion and nonexistent result | Hide idle strip, preserve Run & Review for real operations; one empty state with working entry points | Idle and empty-history checks |
| Compatibility message combines unrelated causes | No clear repair action | Capability reports installed/disabled, version, missing API and autoexport separately, including simultaneous verified restrictions | Unit tests; disabled/version/autoexport/both native frames |

Health changes are CSS/theme/readability only. Navigation, map algorithms and
semantic category colors are unchanged. In Red Graphite light mode, secondary
background is a dark sidebar surface; internal cards use the theme's
`background-primary-alt`, which pairs with its ordinary text. Main surfaces use
`background-primary`; fields use `background-modifier-form-field`; actions use
`interactive-accent` and `text-on-accent`. No global variables/snippets/theme are
modified. Illustrations are inert local SVG, explicitly examples, with no numbers
invented for a model result. Custom/community recipes receive no fabricated preview.

Only the permitted appearance.json, active-theme manifest/CSS and available
enabled snippets were read from the TEST-vault. No notes, credentials or plugin
`data.json` were read. Ten available enabled snippets were copied to a disposable
local fixture; twelve configured snippet names were missing. No third-party
CSS/fonts or original user screenshots are included in the PR or review archive.
Minimal 8.2.2 was fetched from its author's repository for local comparison:
https://github.com/kepano/obsidian-minimal/tree/8.2.2 (accessed 2026-10-28).

## Boundaries and review

The adapter's capability diagnostic reasons are more precise; its acceptance
predicate is unchanged. No engine/runner/apply/journal/layout/prompt/schema or
Community trust change. The original request/write confirmations, immutable
proposal, exact path, create-only semantics, source guards and protected Undo
remain authoritative. Theme changes do not revise a frozen scene or payload.
No dependencies, manifest/version changes, merge, release or automatic installation.

## Validation and honest limits

- 5,032 tests / 185 files passed. Typecheck, build, lint and diff check passed;
  only the two accepted fetch advisories remain. Mutation audit killed 5/5.
- Final native theme harness: 30 checks, zero renderer exceptions. Red Graphite
  1.0.5, Default and Minimal 8.2.2; actual light/dark classes; accents `#7c009e`
  and `#087f8c`, switched live. Same-window pairs, full 1649×928 with file tree,
  measured 716 px split, 1024/390 px Studio panels, 200% zoom and real popout.
  Keyboard source selection, mode choice, draft navigation, no passive note reads
  or provider calls, immutable diagram after a theme change were checked.
- Native Diagram: 30 checks passed, zero renderer exceptions, real Excalidraw
  2.29.0, create/open/edit/move/save/reopen and all original source hashes preserved.
- Native Community: 39 checks passed, zero renderer exceptions, synthetic catalog.
- Native Markdown: **82 checks passed, suite FAIL at the retained 4.5:1 contrast
  assertion**. Default dark button measures **4.2596:1**; its foreground and
  background are byte-for-byte identical to the native `mod-cta` control. The
  threshold/assertion was not weakened. Apply/Undo, cancellation, stale reviews,
  two views, focus, 20-file scope and recovery checks preceding it passed.
  This run also captured a host `app.js` `webContents.getZoomFactor` exception;
  no plugin workaround or host monkey-patch was introduced.
- Theme matrix primary/panel text contrast exceeds 4.5:1. Native accent buttons
  do **not** meet 4.5:1 for every theme/accent: Red Graphite dark with the supplied
  purple accent is **1.7587:1**, identical in Studio and the native control.
  Other failing accent pairs are retained in `theme/native-report.json`. This is
  theme fidelity evidence, **not** an AA certification. No palette substitution
  was used to make an assertion pass.
- Intermediate failures remain in `earlier-attempts.json`. One previous popout run
  captured host `app.js` `e.isShown is not a function`; the final keyboard/theme
  run adds a strict zero-exception assertion and passed, but the intermittent
  host symptom is not claimed fixed. The first mode-switch harness mistakenly
  called `setTheme` (refresh only); final evidence uses `changeTheme` and asserts
  the actual light/dark class.

All four final native suites used the same three runtime asset hashes. Real model
quality, user acceptance, physical mobile, screen-reader speech, arbitrary themes
and third-party hooks remain NOT RUN. Community live HTTPS is not this synthetic
regression. This is a review build with explicitly recorded contrast/host limitations.

## Reproduce

Build first. Use unique `/tmp` output directories:

```sh
npm test -- --maxWorkers=4
npm run typecheck
npm run build
npm run lint
npm run audit:proposals
git diff --check
node scripts/studio-native.mjs /tmp/veynrel-studio-native-UNIQUE
node scripts/studio-community-native.mjs /tmp/veynrel-community-native-UNIQUE /path/to/local/catalog
node scripts/studio-excalidraw-native.mjs /tmp/veynrel-diagram-native-UNIQUE /path/to/excalidraw-2.29.0
VEYNREL_THEME_FIXTURE=/path/to/local/theme-fixture node scripts/studio-theme-native.mjs /tmp/veynrel-diagram-native-UNIQUE /path/to/excalidraw-2.29.0
```

The theme fixture contains only appearance.json, themes/{Red Graphite,Minimal}
and permitted enabled snippets. Harnesses never target an existing/user vault.
[Gallery](studio-theme-fidelity-evidence/gallery.html) contains original full native
PNG captures; baseline and after use the same synthetic notes/theme/dimensions.
