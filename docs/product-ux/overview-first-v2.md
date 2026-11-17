# UX Recovery v2 — Overview first

Owner review draft. The UX from #152–#154 was **not accepted**. This work starts at UX-C `594ed1ebf62045a83755eb62e5c900ef2f6ee16f` and targets its branch, `feat/ux-c-structural-map`. It does not merge the previous stack, publish a release, or declare this redesign accepted.

Runtime and native harness: `55fad128493709cd2785ff0d25a9eb3618ec6fe6`. Subsequent documentation/evidence commits do not change the plugin assets.

## What was wrong in #154

The primary navigation exposed Check, Notes and Review. Tools and Processing lived in the overflow menu. The default screen was a checking workspace, so opening the product did not explain its other main capabilities. Semantic search competed with the Notes/Map workflow; a user first had to find that workspace. Atomization in the tool catalog was an editor instruction, while its executable entry point was on the less visible Processing page. Recall placed its main action after a large summary block. Studio still had independent command, ribbon, settings and note-context entry points.

The useful pieces remain: concrete findings, source paths, filters, coverage, existing semantic inspectors, safe operation owners and Recall. The new composition uses the panel/grid principles requested from [dashboard](https://kombai.com/gallery/inspirations/dashboards-web-17/) and [bento](https://kombai.com/gallery/inspirations/bento-grid-web-3/) references, with Obsidian theme variables and native controls. The second reference page could not be fetched; its stated composition principles came from the owner's brief.

## Resulting navigation and access

| Destination | Behavior and reachable capabilities |
| --- | --- |
| **Overview / Обзор** | First screen. Six panels: immediate semantic query, Check metrics/last scan, prominent Bulk audit, semantic index status, Recall counts, tool catalog count. Whole-panel links and explicit actions. Counts are saved whole-vault observations; unknown values stay unknown. Opening does not scan or index. |
| **Check / Проверка** | Separate heading/count, coverage disclosure, grouped findings and compact source/problem/action columns. Existing filters, search, source navigation and finding actions remain. No decorative pulse. |
| **Semantics / Семантика** | Search first. Explicit Notes/pairs, Families, Map, Neighborhood, Opportunities, Global focus and Similar notes entries. Families/Map enter semantic mode; missing computation shows setup/refusal, without a technical grid presented as semantic analysis. Structural mode remains separately available. |
| **Tools / Инструменты** | Numbered radial segments and matching linear list. Hover/focus shows name, purpose and operation effect/requirements. Pointer, Enter and Space open details; Back restores focus. At 390 px the list is the primary interaction. Bulk audit, atomization, MOC, Deep Audit and Ask Vault appear first. Taxonomy, history, local checking, legacy report, connection proposals, Recall and editor commands remain reachable. |
| **Review / Повторение** | Start action above due/active/new metrics, less repeated explanation and tighter spacing. Existing mode/tag controls, cards, topics, vocabularies and FSRS behavior are retained. |

All five sections are explicit top-level buttons, including narrow mode. Overflow contains secondary history/settings actions, not the five sections. Search keeps the query while moving between Overview and Semantics; submitting forwards it to the existing modal and consent/search implementation. Search runs across the existing whole index; the UI says that the configured embedding model processes the query.

## Bulk audit and operation boundaries

The existing Processing page, batch modal title and command now use **Bulk audit / Массовый аудит**. The Overview shortcut enters that page in Tools context. It explains scope, operation selection and the result, with four visible entries: batch note/operation picker, Deep Audit, atomization and MOC. Saved cluster availability is shown where it is actually known; no invented run count is displayed.

The folder selector on the workspace does not silently select a batch. The existing picker still selects the notes and operation. Review/Apply/Undo remain owned by operations that implement them. Legacy batch editing uses its existing confirmation and backups, **not a new universal Review/Undo promise**. Deep Audit produces reports/clusters; MOC creation remains a separate confirmed operation. Execution, source freshness, consent, journals and write ordering were not changed.

## Studio is temporarily hidden

`studioFeatures.enabled = false` gates the entire Studio surface. No view, command or ribbon is registered; restored Studio leaves are detached after layout readiness. The settings section and note-context handoff are omitted. The feature flag can be reconsidered separately later.

Studio code, storage, local recipes, installed data, runners, generation services, safe-operation contracts and disposal remain. The disabled-registration test checks that there are no UI registrations or data writes; existing Studio tests explicitly enable the flag to keep testing its retained contracts. Hiding Studio is not presented as repairing its historical Community confirmation failure.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Full tests | **5,432 / 213 files PASS** | [Log](evidence/overview-v2/tests.log) |
| Typecheck, production build, lint | PASS; 0 errors, 2 existing fetch warnings | [Combined log](evidence/overview-v2/lint-typecheck-build.log) |
| Proposal mutation audit | **5/5 killed**, restored tests pass | [Log](evidence/overview-v2/mutation.log) |
| Native session boundary / runner cleanup | **2/2**, **3/3** | [Session](evidence/overview-v2/native-session.log), [runner](evidence/overview-v2/native-runner.log) |
| UX-C before | **45 checks**, 20 screenshots | [Receipt](evidence/overview-v2/before/report.json) |
| Final Overview-first native | **148 checks**, 56 screenshots, 0 recorded exceptions | [Receipt](evidence/overview-v2/after/report.json) |
| Protected paths / asset provenance | No changes to listed execution/data/dependency paths | [Engineering](evidence/overview-v2/engineering.json), [checksums](evidence/overview-v2/SHA256SUMS) |

Native environment: **Obsidian 1.13.7 / Electron 43.6.0 / Chrome 150.0.7871.250**, Linux, private Xvfb/Openbox display, native frame, GPU disabled. RU/EN × dark/light × 1440/390 px on all five final screens; keyboard focus and Enter/Tab, ring pointer and keyboard, list handoff, reduced motion, actual independent split and popout. A 390 px desktop window is not a mobile-device test.

The seven requested journeys are covered: first Overview with five destinations; Overview query to real search results; Overview to Bulk audit and its existing picker; Overview to concrete Check findings; Overview to Recall and an unrevealed real question; tool selection through ring and list; Studio absent from sections, command registry, ribbon, settings and view registration. Missing-index search/setup and missing semantic map are checked before enabling the fixture index.

All **154 synthetic source Markdown files remain byte-identical** in both before and after runs. The fixture has no credentials and never opens New Life 2.0 or another personal vault. Search uses synthetic stored vectors and one loopback `/api/embed` request to `overview-synthetic`. This verifies the real search handoff and rendering, **not retrieval quality or a live provider**. The browser network receipt contains no external HTTP requests; it is not a system-wide network trace.

The before and after fixtures have identical source notes, but the after journey explicitly refreshes Recall and enables the synthetic semantic index. Differences in those counts/readiness states are not evidence of newly added algorithms or measured UX improvement. Baseline “Overview” is the old home route (Check); baseline “Semantics” is the old Notes route.

### Screenshots and video

| Screen | Before (RU, dark) | After (RU, dark) | After 390 px |
| --- | --- | --- | --- |
| Overview | [Old home](evidence/overview-v2/before/before-overview-ru-dark-1440.png) | [Overview](evidence/overview-v2/after/after-overview-ru-dark-1440.png) | [Top](evidence/overview-v2/after/after-overview-ru-dark-390.png), [bottom](evidence/overview-v2/after/after-overview-ru-dark-390-bottom.png) |
| Check | [Before](evidence/overview-v2/before/before-check-ru-dark-1440.png) | [After](evidence/overview-v2/after/after-check-ru-dark-1440.png) | [390](evidence/overview-v2/after/after-check-ru-dark-390.png) |
| Semantics | [Old Notes](evidence/overview-v2/before/before-semantics-ru-dark-1440.png) | [After](evidence/overview-v2/after/after-semantics-ru-dark-1440.png) | [390](evidence/overview-v2/after/after-semantics-ru-dark-390.png) |
| Tools | [Before](evidence/overview-v2/before/before-tools-ru-dark-1440.png) | [After](evidence/overview-v2/after/after-tools-ru-dark-1440.png) | [390 list](evidence/overview-v2/after/after-tools-ru-dark-390.png) |
| Recall | [Before](evidence/overview-v2/before/before-recall-ru-dark-1440.png) | [After](evidence/overview-v2/after/after-recall-ru-dark-1440.png) | [390](evidence/overview-v2/after/after-recall-ru-dark-390.png) |

[Uncut native journey](evidence/overview-v2/after/journey.mp4) (~9 s), [half-speed viewing copy](evidence/overview-v2/after/journey-slow.mp4), [before walkthrough](evidence/overview-v2/before/journey.mp4). The viewing copy changes timestamps with `setpts=2*PTS`; it does not cut frames or demonstrate latency. The native video covers main journeys; the language/theme/width matrix and split/popout have separate screenshots and assertions. [Full after gallery](evidence/overview-v2/after) includes search results, unavailable map, bulk picker, ring detail, settings, split and popout.

| Final asset | SHA-256 |
| --- | --- |
| main.js | `0370d263d1ee4ef7c209db11b78d975836c284969a3394603eec3e2daeda589a` |
| styles.css | `ca04bef117a39e96bf89452423bd8271653f03deb73dfe6fb6ff39385eaff543` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |

Reproduce from a built checkout with `python3 scripts/native/run.py overview after --timeout 180`; for the baseline, use `overview before <built-UX-C-checkout> --timeout 180`. The shared runner owns profile, display, timeout and process-group cleanup. Do not invoke the harness directly against a personal profile.

### Failed and superseded attempts

[Attempt index](evidence/overview-v2/attempts/index.json) keeps original outcomes and receipt hashes. The repetitive 18 MB sandbox Xvfb failure log is a labeled first/last excerpt; its original hash and full local file remain. Early harness failures included an invalid async expression and a missing fixture Obsidian stub. Early PASS captures with incorrect RU switching are explicitly excluded; language now changes through the native settings dropdown and verifies a translated navigation label. Intermediate animation frames are superseded by capture after finite animations settle. A metadata-only follow-up corrects the harness hash inventory; it does not change the plugin runtime.

The first sandbox mutation audit had empty child output; runner tests could not start Xvfb. Unchanged checks passed on approved host execution. One full test run overlapped two native Obsidian runs and timed out while importing `main.ts`; its late continuation contaminated the next assertion (2 failures total). The isolated unchanged repeat passed 5,432 tests in 36.12 s. No timeout or protective assertion was relaxed. A stale three-row presentation assertion was updated to four after the explicit Deep Audit card was added. [Failed logs](evidence/overview-v2/attempts) remain alongside successful results.

## Remaining limits and owner decision

- This is a proposal for owner evaluation. Technical checks do not establish discoverability, readability or owner acceptance with real users.
- The ring uses numbers mapped to the adjacent list; hover/focus supplies its explanation. It reports operation requirements, not a new dynamic availability model. At narrow widths it yields to the linear list.
- No real semantic-quality evaluation, paid/live model call, new end-to-end destructive batch/Apply/Undo run, mobile hardware, screen reader, physical GPU/compositor, IME or third-party theme pass was performed here. Existing engine/unit/mutation contracts remain green.
- Historical UX-C cold-start/10k metadata, host `e.isShown`, custom-frame and Community ownership/confirmation gates remain unresolved. The fresh native run's zero exceptions does not close them.
- Historical `product-ux` and Studio-enabled native journeys describe their frozen UX-C builds; they were not relabeled as checks of this new navigation. The new `overview` suite verifies the default Studio-OFF product; retained Studio behavior has unit coverage, not a new enabled native run.
- Existing two fetch lint warnings and the dependency audit findings from the unchanged lock remain. No dependency update, manifest/version change, release or merge is included.

Auto-merge stays OFF. The owner decides whether this design is accepted.
