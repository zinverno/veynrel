# R06.2a — tentative semantic families and bounded pair search

This is a **bounded first increment of R06.2**, not acceptance of the unified map
or completion of R06. The [dependency audit](part2-audit.md) records why topology,
global all-document focus, route migration and cancellation need a dependent
R06.2b. No existing route, command, renderer, index, write executor or journal was
removed. No release is prepared.

## Source and compatibility

Base: `0b834cf84b145b336ecaa275f638ad19f5fffae4` (merged #147).
Exact tested source/asset identities are recorded in each native receipt and in
[build identity](evidence/part2/build-identity.json). Later evidence-only commits
are not different runtime builds. Frozen baseline assets match the entire base
source tree (identical to `d23a372`), not an installed personal vault.

Public `manifest.json` remains byte-identical to published 2.3.1; package and lock
remain 2.4.0 development; `versions.json` has no 2.4.0. Obsidian's displayed 2.3.1
is not the identity of this internal build. Version-bump/CI guards and
`docs/roadmap/resume-batch.md` are unchanged. Policy remains 2.4.0 after R06/R07
plus release acceptance and owner publication permission; 2.5.0 after R08–R15
plus separate acceptance/permission. Resume Batch and Community document ownership
remain pre-2.4.0 gates unless the owner explicitly defers the former.

## Delivered contract

- A current published top-K map can expose tentative **overlapping maximal local
  cores**, with at least three members, reciprocal retained evidence and a unique
  score-drop contrast. Pairs, chains and link components are not families. Neutral
  names, exact paths, all within-core scores, revision and coverage remain visible.
- The 0.05 score-drop guard is a documented presentation heuristic, not calibrated
  thematic confidence. No embeddings, ranking, cosine calculation or index format
  changes. Similar vocabulary may still give misleading groups; synthetic tests
  cannot establish real thematic validity.
- A family focuses existing semantic coordinates, then opens a note, the existing
  Pair Inspector and Back. Camera and coordinates are retained. Invalidated evidence
  withdraws the family. Families never supply forces to the layout.
- Selected-note details add exact paths, family memberships, published neighbors,
  observed directed links and external-scope labels. Existing tags/candidates remain.
  The complete topology inspector and global focus operation are **not transferred**.
- A second-note search uses the existing scope paths and participation policy,
  renders at most 20 matches, gives the full count, supports exact duplicate-basename
  paths and keyboard navigation. Selection rechecks current scope/source/policy.
  Explicitly loading existing rules no longer requires a full semantic Refresh.
- Opening or choosing a family/pair grants neither model consent nor write authority.
  Existing R05 planning, source freshness, Apply/Undo and decisions owners are reused.

## Validation

See [local checks](evidence/part2/local-checks.json) and raw logs. The full suite
adds 26 tests to the base's 5,376: 21 family/search contract cases, three native-control
presentation cases and two RU/EN selected-family presentation cases. These DOM
fixtures are unit tests, separate from actual Obsidian acceptance.

| Local check | Result |
| --- | --- |
| `npm test -- --maxWorkers=2` | 5,402 PASS / 211 files |
| `npm run typecheck` | PASS |
| `npm run build` | PASS; subsequent lint build produced identical asset hashes |
| `npm run lint` | PASS; only the two previously reviewed fetch advisories |
| `npm run audit:proposals` | PASS |
| `node --test scripts/native/session-check.mjs` | PASS |
| `python scripts/native/test_runner.py` | PASS |
| Targeted Workbench tests | 98 PASS |
| Final test-fixture-only correction | 5 UI tests PASS |

The first lint run flagged the test Element's `createDiv` implementation. The
fixture now constructs its element directly; no assertion/runtime change or lint
waiver. Both [initial](evidence/part2/checks/lint.log) and
[final](evidence/part2/checks/lint-final.log) logs are retained. GitHub CI is reported
against the exact submitted HEAD in the PR; local success does not stand in for CI.

[Native summary](evidence/part2/native-summary.json) retains **every attempt**,
including failed development runs and failed host gates. Original reports, session
receipts and captures are copied without rewriting their status. No retry-until-PASS,
exception filtering, global patch, increased readiness timeout or desktop fallback.

All sessions use Obsidian 1.13.7 / Electron 43.6.0 / Chromium 150.0.7871.250,
Xvfb/Openbox, Native frame and disabled GPU. Each has a fresh synthetic vault/profile
and dynamically assigned CDP port. [Cleanup](evidence/part2/cleanup.json) checks
only their process groups/ports. Port uniqueness applies to concurrent sessions;
sequential reuse by the OS is permissible and reported. The existing local Community
catalog is pinned at `2c9de8caede80fc91b46f49f18548c7f38b24fd4`.

The family fixture has 12 distinct Docker/database/architecture/ML/diary notes.
Real top-K computed from deterministic synthetic vectors yields three local cores,
eight unique represented notes and two memberships for the Docker/database bridge.
The different-purpose ML pair and diary do not form families. These are contract
controls, not a measured classifier accuracy result.

The journey includes family → note → exact second path → Pair Inspector → Back,
RU/EN, both native themes, 390px, keyboard and reduced motion. The normal map
regression retains real split/popout, layer coordinates, context return, topology
refresh, rules and disposal assertions. A failed final exception assertion keeps
the whole run **FAIL**, even if these earlier assertions passed.

Passive map IO is separately counted: zero Markdown reads/writes/network. Explicit
map refresh also has zero Markdown IO/network; metadata capture is reported as
owner timing, not mislabeled as zero metadata work. Pair Inspector explicitly reads
two selected notes. Final disk validation compares fixture bytes even for failed
runs that stopped before their final byte assertion; see
[post-run bytes](evidence/part2/postrun-bytes.json). No live model was called. Studio
and Community regressions use their existing explicitly consented loopback responses.

## Actual native outcomes

| Scenario | Outcome | Assertions / unhandled exceptions |
| --- | --- | --- |
| Family journey, intermediate delivery build | PASS | 27 / 0 |
| Family journey, final presentation build | **FAIL: host tooltip** | 26 / 1 |
| Map 120, complete / 60 indexed | **FAIL: host tooltip**, both | 22 / 1 each |
| Map 120, no index | PASS | 21 / 0 |
| Smoke | PASS | 21 / 0 |
| R05.1 / R05.2 / R05.3 | PASS | 23 / 67 / 32; zero exceptions |
| Studio / Recall / Community | PASS in this attempt | 66 / 45 / 47; zero exceptions |
| Isolated candidate picker 5k / 10k | PASS | 7 / 0 each |
| Isolated candidate picker 1k | **FAIL: initial focus** | 0 / 0 |

R05/Studio/Recall/Community used `87026eb`; final `cdc305d` changes only family
presentation, its tests and a source comment. Final family evidence uses the final
production assets. No unrelated executor or contract changed between those builds.
The earlier `families-a1` was a diagnostic CDP expression syntax failure, fixed in
the harness; `families-a2` lacked refreshed localized family evidence and is not
used to claim that coverage. Later explicitly refreshed journeys cover it.

[Final overview](evidence/part2/native/family-final-ui/families-overview.png) ·
[Selected family](evidence/part2/native/family-final-ui/family-members.png) ·
[Note context](evidence/part2/native/family-final-ui/note-context.png) ·
[RU/light/390](evidence/part2/native/family-final-ui/families-ru-light-390.png) ·
[EN/dark/390](evidence/part2/native/family-final-ui/families-en-dark-390.png) ·
[Continuous final capture](evidence/part2/native/family-final-ui/journey.mp4) ·
[Baseline frame](evidence/part2/native/families-before/baseline-overview.png).

## Performance and coverage

The [fixed full-map protocol](evidence/part2/benchmark-protocol.json) allows one
attempt per configuration. The [isolated selector protocol](evidence/part2/picker-protocol.json)
separates a manual picker from full Refresh after the original protocol could not
reach both pickers. It does not replace or pass those earlier failures.

Detailed measured tables: [benchmarks](part2-benchmarks.md). Heap numbers are renderer
snapshots, **not peaks** or total process memory. No human productivity claim.

Cold 10k failed the unchanged 90-second host-cache gate on both builds: 3,323/10,000
cache entries before and 3,442/10,000 after. Neither reached semantic computation.
Baseline warm 10k had all metadata but timed out waiting for full Refresh; that
receipt does not identify which pending owner caused the wait. New warm 10k reached
the cap refusal and picker but failed on the retained `e.isShown` host exception.

For 1k/5k/10k eligible documents the cap stays 500: **zero** semantic documents are
computed into a map, no families are claimed, and technical path display groups
are not thematic groups. The old receipt field `mapped` in a too-large snapshot
counts eligible candidates, not completed semantic analysis. Refusal/validation
wall time must not be read as all-pairs semantic computation time. Family projection
CPU time is not separately instrumented; small-fixture native layout/render totals
are reported without inventing that missing breakdown.

## Visual review and open gates

Uncropped before/after frames and continuous captures are under `evidence/part2/native`.
The selected-family view now shows only that family's participants and an explicit
return, rather than repeating the whole family browser. 390px no-overflow assertions
cover the new controls, **not** complete narrow-map UX acceptance: scrolling and the
existing small overlay context remain limitations requiring R06.2b review.

Not closed by this increment:

1. Canonical route migration and full topology facts, all-document focus, scope-aware
   cancellation and map/list decision parity. Legacy surfaces remain usable.
2. 10k cold readiness; missing candidate 1k native picker measurement due to the
   initial host/window focus gate. No larger timeout or successful repeat substitutes it.
3. Obsidian tooltip `e.isShown`, observed on baseline and candidate. Exact original
   stacks stay in failed receipts. Matching stacks alone are not proof of one cause.
4. Community write-confirmation/document ownership: prior A/B remains unchanged;
   one later success would not establish a fix. Custom-frame `getZoomFactor`,
   first-modal/first-pointer/focus, physical GPU/compositor/IME remain open.
5. No real embedding quality study, user usefulness study or complete R06 acceptance.

R06.2a may be reviewed as a limited read-only feature/picker change. It is not a
basis for publishing 2.4.0 or claiming the single-map product goal complete.
