# Native Structured Context Groups acceptance

**PASS** on a new, isolated synthetic vault, `/tmp/pair-inspector-structured-groups-verified/vault`.

- Obsidian **1.13.7**, Electron **43.6.0**, Linux desktop; real `Vault.read`, `TFile`, MetadataCache and resolver.
- Production `main.js` SHA-256: `7b9c699937c3858a5144c9f67afd2c5632ca05d34f68b5c8455f801d343d4478`.
- **82 checks**: 18 existing Pair Inspector assertions plus 64 group/regression assertions. [Full machine report](structured-context-groups-evidence/native-report.json).
- **58 synthetic sources**: unchanged 48-note PR92 corpus, two CRLF/Unicode group examples, and eight independently derived protected-heading test notes. Originals and frozen labels remain untouched; derivatives are not part of the corpus denominator.
- **0 Markdown writer calls, 0 operation-journal mutations, 0 observed renderer/provider network calls.** 35 explicitly scripted Analyzer completions, with no additional completion during group planning. Paid model requests: **0**.
- All 58 source files are byte-identical after the run. Fixture seeding and simulated user edits/restorations use the test filesystem directly, not product writers. No personal notes are present.

## Observations

| Check | Observed outcome |
|---|---|
| Frozen corpus and old MergePlan path | Exact corpus SHA verified; 03/04/21/24 still ready; 4/12 unchanged |
| Case 06 | Selected H3 plus complete H1/H2 introductions yields a separate original branch in canonical B; complete plan saved in `rows[5].plan` |
| Cases 05/19 | Native ranges identifiable; explicit unresolved external-card review keeps Build disabled and no plan published |
| Cases 07–09, 22, 23 | No heading group; no new permission |
| Heading-wrapped 07/08/09 | Code/list/quotation still protected, despite native H1 |
| Heading-wrapped 22 | Native zero-length terminal section entries cause strict metadata refusal; no plan |
| Related distinct | No plan until the separate intentional-copy checkbox; manual-review provenance retained |
| Semantic conflict | Build refuses; no plan |
| Both canonical directions | Complete CRLF originals and selected Unicode ranges stay verbatim; four full UI plans saved in `uiPlans` |
| Reselection | Entire plan and confirmations cleared |
| Cancel and close during final read | No late publication |
| Canonical or secondary user edit | Analyzer stale and group session destroyed; no product write |
| Keyboard | Enter activates Build after independent confirmations |
| RU/EN, default light/dark, 1200/390px | Full text, diff and controls fit; no missing localization tokens |

All group planning uses the actual modal and session except the diagnostic corpus metrics, which call the same pure validators against real native `PlanNote` data. Only Analyzer completion transport is replaced with an explicitly scripted control. Structural and semantic test controls are not model-quality evidence.

## Screenshots

The 21 screenshots are original native captures. Before/after panels contain full texts and can scroll; screenshots show the current viewport, while complete strings and diffs are also represented by the machine report's exact plans.

| Surface | EN | RU |
|---|---|---|
| Light 1200 | [image](structured-context-groups-evidence/group-en-theme-light-1200.png) | [image](structured-context-groups-evidence/group-ru-theme-light-1200.png) |
| Light 390 | [image](structured-context-groups-evidence/group-en-theme-light-390.png) | [image](structured-context-groups-evidence/group-ru-theme-light-390.png) |
| Dark 1200 | [image](structured-context-groups-evidence/group-en-theme-dark-1200.png) | [image](structured-context-groups-evidence/group-ru-theme-dark-1200.png) |
| Dark 390 | [image](structured-context-groups-evidence/group-en-theme-dark-390.png) | [image](structured-context-groups-evidence/group-ru-theme-dark-390.png) |
| Heading tree/context | [image](structured-context-groups-evidence/group-en-tree-context.png) | [image](structured-context-groups-evidence/group-ru-tree-context.png) |
| Before/after | [image](structured-context-groups-evidence/group-en-before-after.png) | [image](structured-context-groups-evidence/group-ru-before-after.png) |
| Diff | [image](structured-context-groups-evidence/group-en-diff.png) | [image](structured-context-groups-evidence/group-ru-diff.png) |

Refusals: [05](structured-context-groups-evidence/group-incomplete-05.png), [19](structured-context-groups-evidence/group-incomplete-19.png), [code](structured-context-groups-evidence/group-wrapped-07.png), [list](structured-context-groups-evidence/group-wrapped-08.png), [quotation](structured-context-groups-evidence/group-wrapped-09.png), [rich markup](structured-context-groups-evidence/group-wrapped-22.png), [semantic conflict](structured-context-groups-evidence/group-semantic-refusal.png).

## Reproduction and development failures

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structured-groups-NEW --structured-groups
```

The root must not exist. The harness uses the installed `/usr/bin/electron43` and `/usr/lib/obsidian/app.asar`, owns its isolated profile and terminates its own test instance. It never opens the user's real vault.

The first exploratory run stopped on a test-script CRLF escape inside a CDP expression, after the EN matrix. The second stopped because the harness expected a selectable group for the rich-markup derivative, but the strict metadata guard had already refused the native zero-length sections. The script now records that refusal without requiring a selection control. A subsequent complete run passed; the final capture also includes all context screenshots, complete UI plan artifacts and the final source/analysis invalidation behavior. These harness failures were not reported as product acceptance passes.

Independent review identified malformed protected-position handling and inconsistent URL-scheme checking in headings. Both were fixed and covered by tests before the final native build. Review found no remaining product blocker.

Limits: desktop viewport emulation at 390px is not physical-mobile acceptance; no screen-reader test or human usability study was performed. Fetch/XHR and injected provider paths are guarded, rather than claiming OS-wide network isolation. Semantic review remains a user assertion. No write, Undo, recovery, crash-safety, filesystem atomicity or LLM-quality claim is made for GroupPlan; it has no executor.
