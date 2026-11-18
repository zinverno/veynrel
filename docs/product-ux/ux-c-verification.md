# UX-C — structural map and retained semantic workflow

Base: UX-B `db99a71181b4de50675c18160c96fafde2e76cad` (#153). Runtime: `e69c2f2982394c869d85f5fe99d59f74127bf341`. Documentation/evidence commits do not change these assets. Stack: functional #151 → UX-A #152 → UX-B #153 → UX-C. No merge or release approval is implied.

## Delivered behavior

Notes → Map starts in **Structure**, using the existing plugin-owned topology snapshot and deterministic component layout. The same Workbench renderer displays observed directed links, bounded degree sizing, exact note selection and existing contextual operations. It reads metadata only on explicit refresh. The confirmed-isolation filter requires a current, complete whole-vault snapshot, including incoming metadata outside the selected folder. Unknown or stale metadata cannot establish isolation.

**Similarity** retains the validated semantic index, finite semantic-only physics, top-K, overlapping families, global all-document focus, Neighborhood, Opportunities and existing participation policy. Missing/unavailable/stale computation displays a refusal/setup path instead of an apparently computed technical grid. Setup opens the existing provider/consent flow; it does not create embeddings. The 500 eligible-document cap is unchanged.

Modes retain separate cameras and technical-group context. Search, tags and link overlays do not regenerate coordinates. Map controls now sit below the canvas, including at 390px. Selected-note details remain in document flow. Legacy topology/global/neighborhood/opportunity entry points still enter the canonical Workbench inspectors with their original scope and owners. No independent renderer, index, decision store or executor was added.

Native work exposed and corrected three presentation/lifecycle defects: switching language returned an open map to the list; Map → saved decisions retained Notes mode rather than opening the existing Review queue; Escape from a global inspector had no focus target when the scoped semantic map was intentionally uncomputed. Regression tests cover language and Review routing; the final native journey verifies the empty-state focus target without inventing a canvas.

## Engineering

- `npm ci`: 356 packages, existing lock, no dependency/version change.
- `npm run typecheck`, production build and lint: PASS. Two existing `fetch` advisories remain in `api.ts` and Community transport.
- Full suite: **5,428 tests / 213 files**. UX-A had 5,418; UX-B adds five tests; UX-C adds three structural-coverage controls and two navigation regressions.
- Proposal mutation audit: **5/5 killed**; native session checks **2/2**; launcher tests **3/3**.
- [Exact runtime/assets and protected-file checks](evidence/c/engineering.json); [full test log](evidence/c/uxc-tests-delivery.log); [lint](evidence/c/uxc-lint-delivery.log); [mutation](evidence/c/uxc-mutation-delivery.log).
- Published manifest remains byte-identical **2.3.1**; package/lock remain development **2.4.0**; no 2.4.0 versions entry. Version-bump safeguards, compatibility tests and Resume Batch requirement are unchanged.
- PR CI is reported against the exact final documentation HEAD in the PR body.

| Asset | SHA-256 |
| --- | --- |
| main.js | `5177cbdba2c0640afaab39eb539a47eac4e455795677b39f117976b0c08b3eea` |
| styles.css | `526a0905038529c191d3036babf901117431c07c8aebfd207dd8adf6daa18ca1` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |

## Native evidence

Real **Obsidian 1.13.7 / Electron 43.6.0**, Native frame, shared `scripts/native/run.py`, Xvfb/Openbox. No desktop launch or paid request. JSON copies redact checkout/disposable absolute paths only; each directory includes the original receipt SHA. Original failed receipts remain unchanged locally. [Checksums](evidence/c/SHA256SUMS).

| Scenario | Outcome | Evidence / boundary |
| --- | --- | --- |
| Final structural UX, EN/RU, light/dark, 390/wide, keyboard, reduced motion, real split and map popout | PASS, 41 checks | [Receipt](evidence/c/delivery/report.json), [390px](evidence/c/delivery/structure-ru-dark-390.png), [video](evidence/c/delivery/journey.mp4) |
| Families → note → Pair → Back; all-document focus, scoped/global distinction, Review decisions, legacy routes, concurrent owners, Escape | PASS, 40 checks | [Receipt](evidence/c/unified/report.json), [continuous video](evidence/c/unified/journey.mp4); synthetic vectors, not semantic-quality evidence |
| Unmodified Minimal theme | PASS, 42 checks | [Receipt](evidence/c/minimal/report.json); same final CSS, before the two subsequent navigation fixes; no claim about every theme |
| Ready semantic 120 / partial semantic 60 of 120 | PASS, 23 checks each | [120](evidence/c/semantic-120/report.json), [60](evidence/c/partial-60/report.json); pre-delivery builds identified by asset hash |
| 1,000 eligible semantic documents | PASS, 15 checks | [Cap refusal then explicit Structure](evidence/c/cap-1000/report.json); zero semantic documents computed, all 1,000 eligible refused |
| Missing index | Functional assertions reached; overall FAIL | [Receipt](evidence/c/no-index-host-fail/report.json): host `e.isShown`; no retry to relabel PASS. Final structural UX independently verifies the no-index empty state |
| 5,000 structural notes after host metadata readiness | PASS, 15 checks | [Receipt](evidence/c/structure-5000/report.json) |
| 10,000 structural notes after host metadata readiness | 15 functional checks; overall FAIL | [Receipt](evidence/c/structure-10000-host-fail/report.json): unfiltered `e.isShown` |
| R05.1 local link Apply/Undo | PASS, 23 checks | [Receipt](evidence/c/actions/report.json), actual synthetic Markdown bytes |
| R05.2 contextual tag and broken-link Apply/Undo | PASS, 67 checks | [Receipt](evidence/c/local-notes/report.json), exact byte restoration |
| R05.3 registry / decisions / restart | PASS, 32 checks | [Receipt](evidence/c/registry/report.json); before focus-only final fix |
| Smoke | PASS, 21 checks | [Receipt](evidence/c/smoke/report.json) |
| Recall | Exit 0, 45 checks | [Receipt](evidence/c/recall/report.json); this harness has no top-level status field |
| Studio | PASS, 66 checks | [Receipt](evidence/c/studio/report.json); source preservation, consent, journal, recovery, local synthetic provider only |
| Community, explicit internal test-only enable | FAIL after 10 checks | [Receipt](evidence/c/community-open-gate/report.json): separate write confirmation did not appear. No cause/fix inference; normal UI remains OFF |

The [baseline](evidence/c/baseline/report.json) also failed on host `e.isShown`. [Development failures](evidence/c/development/) retain the language, Review, focus and harness-boundary failures. No assertions or exceptions were suppressed. The initial no-index/cap harness asserted the semantic refusal **after** a separate structural tag refresh invalidated its selection revision. The corrected harness checks the same strict refusal at the actual semantic-operation boundary, before requesting Structure.

Cold 1k/5k/10k attempts failed their ready assertion: the UI reported that the vault changed while topology was being captured. Host metadata was still loading; the freshness guard rejected publication. These failures are retained, not converted into successful warm runs. The independent readiness-configured runs use the existing 90-second host-cache bound; no timeout was increased. All original synthetic Markdown from the 12 failed attempts was independently compared with fixture bytes afterward; matches do **not** change their FAIL outcome.

## Performance and coverage

Single local runs, not universal latency promises. JS heap figures are point samples, **not peak RSS**. Structural groups below are bounded display groups by path, not semantic families. Full measured receipts include frame intervals and selected-note search.

| Fixture | Host metadata wait | Capture / derive / layout | Displayed overview | Overview DOM / SVG | Search | Sample JS heap |
| --- | --- | --- | --- | --- | --- | --- |
| 154, no index | Ready before explicit refresh | Whole UI refresh ~125 ms | 154 real nodes | See delivery receipt | Native UI checked | See receipt |
| 1,000; 1,000 indexed, semantic cap refused | 4,889 ms | 43 / 148 / 12 ms | 10 technical groups, all paths represented | 102 / 38 | 34 ms | 81 MB |
| 5,000; no index | 10,444 ms | 167 / 730 / 55 ms | 50 technical groups, all paths represented | 222 / 118 | 53 ms | 108 MB |
| 10,000; no index | 21,487 ms | 325 / 1,432 / 89 ms | 64 technical groups, all paths represented | 264 / 146 | 212 ms | 189 MB |

The 1k/5k/10k second-note selector remained bounded at 20 results / 78 elements; full-path lookup reached the last inventory entry. Semantic computation was **0** for these rows. The 1k `mappedNoteCount` in the existing owner's refusal metadata denotes the eligible count, not a computed map. Link overlays on 1k/5k reported roughly 16.6–33.4 ms interaction frame intervals; full traces are in receipts. No semantic cap was raised.

First local Health result for the synthetic 154-note delivery was 430 ms (single measured run), with no embeddings. [UX-A performance](ux-a-verification.md) and [UX-B list benchmarks](ux-b-verification.md) remain distinct; 10k list readiness does not imply fully loaded link metadata.

## Private inspection

Only the previously authorized isolated notes-only copy was read to create another disposable test copy. Original vaults, existing personal sessions, settings and provider credentials were not accessed. **154 Markdown / 3 Canvas** remained byte-identical in source and test copy. Metadata-only structure represented 154 notes and 159 observed links; 32 notes had unavailable/unsupported link metadata, so the UI retained partial coverage and disabled confirmed isolation. Capture/derive/layout measured about 25/15/3 ms. No network requests or passive plugin Markdown reads/writes occurred. Missing attachments limit interpretation of link findings.

Private native walkthrough: **33 checks**, zero exceptions/HTTP requests. Detailed screenshots/video/reports remain outside Git in the owner's private evidence folder; they were not opened into model context. Real semantic usefulness remains **BLOCKED_NO_REAL_INDEX**. Public screenshots, videos and note names here are synthetic only.

## Remaining gates and acceptance

Community document ownership/write confirmation, host `e.isShown`, historical cold-start 10k readiness, first-modal/first-pointer/focus, custom-frame `getZoomFactor`, physical GPU/compositor/IME, screen-reader behavior and some native partial-cache cases remain open. This work does not claim fixes for them. Complete semantic coverage/quality on a real personal vault is untested. A successful warm run cannot close the historical cold-start gate.

The three UX stages implement the agreed functional routes and are ready for **owner review**, not automatic acceptance. Dense real-vault graph readability, exact wording and the remaining advanced inspector/action density still require that review. R06 and either public release remain unaccepted. Online Community stays hidden until a separate owner decision after R15; local recipes, installed recipes, prompts, import/export and generation remain available.
