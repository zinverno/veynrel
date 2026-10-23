# Obsidian Review compatibility — 2026-10-23

Scope: the reported assertions and ten `:has()` selectors, plus the five exact named-color replacements explicitly approved by the user. No redesign, new provider calls, changes to ranking, data formats, writers, journals, tickets or release metadata.

Base: `8b3ee81cbad92171484870d3a03f2c5f95c10d84`. The frozen source is recorded in `SOURCE_COMMIT`; the later evidence commit changes documentation only. Version remains **2.1.0**. Published 2.1.0/2.2.0 and their tags are untouched.

## Implementation and preserved contracts

| Owner | Replacement / contract |
| --- | --- |
| `relationshipEvidence.ts` | A checked local match index and line end replace assertions. The native UTF-16 indices, CRLF boundaries, surrogate protection, unique-fragment algorithm and strict evidence validation are unchanged. |
| `reviewRefresh.ts` | The unsubscribe closure captures the original, constant subscriber Set. |
| `reviewFacts.ts` | A narrowed signatures reference replaces the assertion; missing observations remain unknown, and epoch/owner/disposal guards remain intact. |
| `workbenchView.ts` | Mounted shell/host attributes are removed on suspend/dispose and transferred on reparenting. Pinned width depends on an actually rendered detail panel. |
| `reviewListView.ts` | Pair/map/list surface state and map-height ownership follow open, return, suspend, page replacement and disposal. No map is mounted by the list route. |
| `reviewPresentation.ts` | Choice cards follow native radio checked state, on initial render and group change; disabled inputs retain the same behavior. |
| `changePlannerView.ts` | Only the controls container that renders note choices receives its layout attribute. Eligibility and consent logic are unchanged. |
| `styles.css` | All ten relational selectors are replaced; declaration values remain unchanged. `white`, `orange`, `black` become exact `#fff`, `#ffa500`, `#000` equivalents at five approved sites. |

The palette tests now permit **exactly two** black hex components in the shared workspace CSS and assert their original theme-token mixtures and percentages. Other literal colors remain forbidden; no broad exclusion or lint override was added. Legacy count/hero white and warning-orange fallback keep their exact color values.

## Automated checks

- Full suite: **4,762 tests / 178 files**, including UTF-16/CRLF/Unicode evidence binding, transport failures, stale/late responses, cancellation, refresh, subscriptions, decisions and Apply/Undo protections.
- Typecheck, production build, Obsidian ESLint, proposal mutation audit **5/5**, and `git diff --check` passed.
- ESLint retains only the documented `api.ts:442` streaming-fetch warning. `api.ts`, its rationale and the allowlist/configuration are unchanged.
- New regressions exercise radio initial/re-render/change/disabled states; map ownership transfer and cleanup; original-Set unsubscription; absent/obsolete observations.
- The first local fully concurrent test run timed out in an unrelated settings test. A complete bounded-worker run passed with unchanged test timeouts and assertions. CI is checked separately on the final PR SHA.

## Official CSS results — not an overall Stylelint PASS

Isolated tools: **Stylelint 17.16.0**, published **stylelint-config-obsidianmd 0.1.0**, configuration only `{"extends":"stylelint-config-obsidianmd"}`. No project/runtime dependency or lint rule was changed.

| Result | Before | After |
| --- | ---: | ---: |
| `:has()` warnings | 10 | 0 |
| Named-color warnings | 5 | 0 |
| All CSS warnings | 15 | 0 |
| Standard configuration errors | 1,190 | 1,187 |

The remaining errors come from the configuration's standard formatting/specificity rules (primarily single-line declarations and descending specificity). They are retained in full, as requested, rather than reordered/formatted away or disabled. The full raw configuration therefore remains non-green. See [before](obsidian-review-warnings-evidence/official-stylelint-before.json), [after](obsidian-review-warnings-evidence/official-stylelint-after.json) and [summary](obsidian-review-warnings-evidence/stylelint-summary.json). The `source` field in these public copies is normalized to `styles.css`; diagnostic entries are unchanged.

The user's official Obsidian Review branch has **not** been rerun by this task; it is the next independent check. [Published configuration](https://github.com/obsidianmd/stylelint-config).

## Native verification

Real isolated Obsidian **1.13.7 / Electron 43.6.0**, synthetic Markdown, artificial semantic vectors, local loopback completion envelopes through the real transport parser. No personal vault, TEST, real key, paid model or embeddings request was used.

Before: 34 map/workspace checks plus 64 integration checks on the verified main build. After: **35 map/workspace checks plus 75 integration checks** on the frozen files. At each captured state, a synchronous comparison substitutes the original stylesheet on the same DOM, reads computed styles, and restores the candidate stylesheet in `finally`. **70 map states + 112 integration states**, no computed-style differences. Radio checked/visual state also agrees in every capture. This supplements independent before/after native runs and full frames; it is not a screenshot mockup.

Coverage:

- Map open, expanded/collapsed, pinned selection, close/reopen detail, page departure/reopen, return to the same list, RU/EN, both built-in themes, 390/1280 px and application zoom 200%.
- A/B initial selection, pointer selection, keyboard selection and re-render; a real existing B→A link makes B unavailable through preflight and cannot be selected.
- Consent, recommendation, parameters, preview, separate exact write confirmation, cancellation, Apply → list → reopen/history → separate Undo. All Markdown hashes equal the starting hashes after Undo.
- Real Merge → separate Archive → Archive Undo → parent Undo also restores all Markdown hashes. The later manual edit/rename/delete checks are separate fixture edits, not claimed as Undo.
- RU/EN, built-in dark/light, narrow panes, 200%, keyboard/focus, scroll, real split/popout, rejected transport envelopes and stale facts. The existing native contrast checks pass; computed foreground/background values match the original CSS.

The native harness now focuses its own window before keyboard input, uses its own WebContents for zoom, explicitly confirms Obsidian's linked-file rename dialog, and performs one user-style history refresh after a transient busy snapshot. It does not bypass a writer/Undo guard or introduce a product retry. Failed intermediate harness runs are retained locally; only completed reports below are labelled passed.

Evidence: [map report](obsidian-review-warnings-evidence/after-map-report.json), [integration report](obsidian-review-warnings-evidence/after-integration-report.json), [map styles](obsidian-review-warnings-evidence/after-map-style-equivalence.json), [integration styles](obsidian-review-warnings-evidence/after-integration-style-equivalence.json), [Markdown before](obsidian-review-warnings-evidence/after-integration-before.json), [after Undo](obsidian-review-warnings-evidence/after-integration-after-undo.json), [after archive-chain Undo](obsidian-review-warnings-evidence/after-integration-after-archive-chain.json).

| Full frame | Before | After |
| --- | --- | --- |
| Map, dark / 1280 | [frame](obsidian-review-warnings-evidence/before-map-en-theme-dark-1280.png) | [frame](obsidian-review-warnings-evidence/after-map-en-theme-dark-1280.png) |
| Expanded map, light / 390 | [frame](obsidian-review-warnings-evidence/before-expanded-en-theme-light-390.png) | [frame](obsidian-review-warnings-evidence/after-expanded-en-theme-light-390.png) |
| Return to list | [frame](obsidian-review-warnings-evidence/before-map-return.png) | [frame](obsidian-review-warnings-evidence/after-map-return.png) |
| Link parameters | [frame](obsidian-review-warnings-evidence/before-link-parameters.png) | [frame](obsidian-review-warnings-evidence/after-link-parameters.png) |
| Exact review | [frame](obsidian-review-warnings-evidence/before-exact-review.png) | [frame](obsidian-review-warnings-evidence/after-exact-review.png) |
| Planner, RU / light / 390 | [frame](obsidian-review-warnings-evidence/before-parameters-ru-theme-light-390.png) | [frame](obsidian-review-warnings-evidence/after-parameters-ru-theme-light-390.png) |

Additional frames: [pinned](obsidian-review-warnings-evidence/after-map-pinned.png), [closed details](obsidian-review-warnings-evidence/after-map-pinned-closed.png), [200%](obsidian-review-warnings-evidence/after-map-pinned-200.png), [keyboard A](obsidian-review-warnings-evidence/after-choice-keyboard-a.png), [disabled B](obsidian-review-warnings-evidence/after-choice-disabled.png).

Videos: [map lifecycle](obsidian-review-warnings-evidence/after-map-map.mp4), [Apply/list/history/Undo](obsidian-review-warnings-evidence/after-integration-review-apply-list-reopen-history-undo.mp4).

Limitations: synthetic Linux desktop coverage only; no mobile device, screen reader, third-party theme, personal-vault or live-model acceptance is claimed. Full standard Stylelint errors remain attached under the explicit scope decision.
