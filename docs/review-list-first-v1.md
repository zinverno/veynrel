# Review vault — stage 1: list first

The primary Review vault entry now opens a standalone candidate list. It does not
construct `WorkbenchView`, `WorkbenchSimulation`, SVG/canvas, tag metadata/zones,
label placement, or a graphical animation loop. This is stage 1 only; map checkpoint
A/B is still unapproved. Candidate selection policy and contextual maps are later stages.

## Ownership and entry points

Sidebar, existing home scope action, Tools catalog and processing entry all use the
same `discover` route. The added `veynrel-review-vault` command shares serialized
Health opening with the unchanged `veynrel-open-health`. Existing commands, native
home, Stage 1.1, other tools, settings and history remain available.

`ReviewListView` owns navigation only: repeats/connections, name/path query, pagination,
selection and list position. Pair sessions are freshly mounted through `PairReviewPort`.
Returning closes the owner; no model consent, analysis source or Apply/Undo ticket is
restored. Scope replacement inherits mode/query, never a live pair. Views have independent
navigation. The existing map is mounted only by Open map and disposed when returning.

`WorkbenchData.refresh(task)` minimally separates existing sources:

- Repeats explicitly prepares the existing local index, then uses the unchanged
  `SemanticHealthAnalysisPort` duplicate search and revision verification. No topology,
  comparison, semantic graph or tag calculation is needed. The 500-node graphical cap
  cannot block repeats.
- Connections lazily constructs the existing scoped semantic/comparison controllers;
  their top-K math, ranking and eligible-document cap remain unchanged. No duplicate
  search is run for this mode.
- Explicit map opening retains its previous data/renderer path in a separate owner.

No index is built, no embeddings are generated and opening/navigation sends no model
request. Index notifications invalidate duplicate freshness. Saved findings keep their
provenance. Duplicate search still returns at most 100 global pairs and scope filtering
is not a complete within-folder search. Rows paginate by 60 without reordering or
suppressing source candidates. Same basenames retain exact paths. Exercises are not
filtered: task/theory and task/task pairs use the existing sources and policy.

## One current pair step

Current saved texts have readable literal excerpts and separately disclosed full
available previews/metadata. The existing 12,000 UTF-16 preview bound is unchanged;
analysis continues to use its original full-input/size contract. A separate analysis
consent exposes provider/model, volume and possible payment; endpoint/payload remain
in closed details. The strict validator is unchanged.

A checked result presents the relation, common material, differences and next action.
Evidence, alternatives and limitations remain available without another model request
or truncating the model's conditions/negations. Preparing a change replaces the result
panel; returning to the result closes the planner without re-sending analysis. Source
changes invalidate old analysis/plans, with visible restart controls. Legacy Pair
Inspector uses the same owner and remains supported.

The planner UI now requires an explicit source selection for a directional edit;
no source is preselected. All planner services, validators, final-review modals, writers, tickets, Archive/recovery,
receipts/journals and Undo protocols are unchanged. Final modals report actual executor
outcomes and expose history. Closing a modal does not mark a candidate resolved.

## Verification and provenance

Base: `7163f39e10ec900011090124b767a46e872f4d7f`, PR #108,
`experiment/map-visual-reset-v3`. Dependencies at audit: #106 → #107 → #108 all OPEN;
#108 draft. This PR targets #108, without merge/rebase or changes to those branches.
Frozen source: `f894125090038a0c61039f750932955149dd51de` (implementation
`96bc05a2750c1f8618d5d3a6d867b87d2bc9a505` plus explicit-source UI test updates).
The review HEAD is the subsequent evidence-only commit containing this report;
its exact SHA is recorded in the PR description and frozen `REVIEW_HEAD`.

Targeted tests cover passive/list-only ownership with throwing graphical dependencies,
1000-path repeats without the map cap, preserved source ordering and exercise pairs,
pagination, exact paths, per-view isolation, source freshness, stale callbacks, navigation
return and disposable map ownership. Pair tests exercise single-step visibility,
legacy preview integrity, consent/double-click guards, invalid quotes and source invalidation.

Native harness: `scripts/review-list-first-native.mjs`. It copies the existing synthetic
Lab into a new isolated profile; only two executor fixture notes are added. Artificial
vectors cover 154 documents and are explicitly a UI fixture, not embedding-quality
validation. A local completion stub is used only for the one pair response. Validator,
planner, exact review, Apply, operation history and separate Undo are real. Every
Markdown SHA256 is checked before and after Undo; files are not restored by copying.

The harness measures a cold direct command, no map construction on the tested list
route, no navigation writes/model network, RU/EN, built-in dark/light, 390 px, 200%
global zoom, keyboard, real split/popout, missing index, empty scope and source failure.
Screenshots are full native frames and the video covers the entire list-to-Undo route
without opening a map. Personal vaults and TEST installation are excluded.

## Delivery and limits

Frozen main.js/manifest.json/styles.css, SHA256SUMS and SOURCE_COMMIT are delivered in
`veynrel-artifacts/review-list-first-v1-<source>/` outside temporary storage. The
zero-argument `install-to-test.sh` fixes the previously authorized TEST destination,
checks redirection and artifacts, backs up the three replaced files outside the vault,
and leaves settings, indexes, receipts and notes untouched. It is not run against TEST.

Recommendation noise is deliberately unchanged. Synthetic completions do not validate
a live provider or model quality. No Stage 2 rules, map redesign, FSRS changes, new
packages, version bump or release are included. User UX acceptance is separate from
technical checks.

## Executed acceptance on the frozen source

- `npm test`: **4552 tests / 168 files passed**.
- `npm run typecheck`, `npm run lint` (includes build), `npm run build`,
  `git diff --check`: passed. One pre-existing `api.ts:414` fetch advisory remains.
- `npm run audit:proposals`: **5/5 mutations killed**, restored tests passed.
- Independent code review: required findings fixed; no remaining required findings.
- Frozen native run: **26 checks passed**; separate no-index profile: **6 checks passed**.
  RU/EN, built-in dark/light, 1694px and 390px desktop windows, keyboard, 200% global
  zoom, actual split and same view in popout. Cold direct command and simultaneous
  command calls create one standalone list. Repeat refresh above 500 inventory paths
  does not construct comparison/semantic graph data or graphical resources.
- Full route: exactly **2 Markdown writes** (Apply and Undo), **0 network calls**;
  **1002/1002 Markdown hashes restored** by the actual Undo executor. Index-status
  loading and browsing are passive; explicit pair/review reads account for 36 reads
  in the full acceptance run. The synthetic source Lab hashes also remain unchanged.
- Installer: actual three-file replacement/backup and refusal cases tested only on a
  temporary synthetic destination. Final fixed-target wrapper passes `bash -n` and
  rejects extra arguments before accessing TEST. Artifact SHA256 checks passed.

[Native screenshots, route video and integrity evidence](review-list-first-v1-evidence/README.md).
The full-route video is slowed to 0.5× for reading, with no removed/reordered actions.

Not run: live paid/model completion, real embedding quality, phone/touch, screen reader,
third-party themes in this stage. Map redesign/visual acceptance is not part of this
work. The old map remains an explicit compatibility action; its visual quality has
not been re-accepted. No user vault was installed or modified. CI is reported on the
exact final review HEAD in the PR, independently of these local/native results.

Stage 1 stops here. Candidate noise and participation rules are intentionally unchanged.
