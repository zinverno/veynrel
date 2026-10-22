# Stage 2 — native verification

Frozen source: `278e6b7c436ad6deb84f2d2a0479130f92bd31bf`.
Independent branch `feat/review-connection-rules`, based on open #113; no dependency
was merged. Native capture uses the exact frozen three-file build in a newly
created synthetic vault and separate Obsidian profile.

Native: **33 checks, 30 full frames, one 15.8-second continuous recording**.

- [Continuous route](connection-rules-route.mp4)
- [Exercise to explanation after the rule](02b-exercise-to-explanation.png)
- [Exercise duplicates remain](04-exercise-duplicates.png)
- [Rule persisted after restart](05-after-restart.png)
- [RU light, narrow rule editor](rules-ru-theme-light-390.png)
- [Native report and complete screenshot list](report.json)

## Controlled before/after

The selected Rules scope contains 12 indexed synthetic documents: six exercises
and six explanations. Six additional pre-existing synthetic workflow fixtures are
outside that scope. Vectors were constructed offline, without embeddings requests.

| Same 12-document input | Exercise–exercise candidates | Exercise–explanation candidates | Other candidates | Forbidden pairs before top-5 | Unknown pairs | Reviewed |
|---|---:|---:|---:|---:|---:|---:|
| No rules | 15 | 0 | 15 | 0 | 0 | 0 |
| Within-group task tag | 0 | 30 | 15 | 15 | 0 | 0 |
| Rule disabled | 15 | 0 | 15 | 0 | 0 | 0 |
| Fully exclude task folder | 0 | 0 | 15 | 51 | 0 | 0 |

The first exercise's explanation is below its five closer exercises in the original
source, and absent from the reverse top-five union. After the within-group rule,
the explanation is its first eligible neighbor and appears in the actual list.
The total candidate count can **increase** after a rule: forbidden exercises no
longer occupy neighbor slots. This is selection mechanics, not evidence of quality.

Forbidden counts include all eligible unordered pairs before top-K; they must not
be added to candidate counts. Full exclusion removes six notes, leaving six for
neighbor selection. The 51 forbidden pairs include 15 internal and 36 cross-group
pairs, regardless of which were candidates before. Unknown metadata is covered
by regression tests and is never silently assigned to “no tag”.

## Native route and surfaces

The continuous video shows original connections → save within-group rule → explicit
local refresh → exercise/explanation candidate → comparison → return with scope and
query → exercise duplicates → real plugin disable/enable → persisted rule → disable
rule → original candidate order restored. The recording uses native mouse input;
keyboard Tab is checked separately. No map renderer, canvas or simulation is mounted.

Additional checks cover full folder exclusion, an entirely excluded selected scope
as a ready empty result, durable pair-decision restoration under an active rule,
two ItemViews sharing one store, a real adapter write failure, and RU/EN × built-in
light/dark × 1280/390 CSS-pixel widths. The width matrix is desktop emulation, not a
physical-mobile claim. All 18 saved Markdown hashes remain identical. Zero HTTP
model requests and zero embedding requests were made. No personal vault or TEST was
read for fixtures, written, or used for installation.

## Automated validation

- Full suite: **4714 tests / 176 files passed** — [tests.log](tests.log).
- Typecheck, production build and Obsidian lint passed. The unchanged advisory at
  `api.ts:442` remains; **0 lint errors** — [lint.log](lint.log).
- Proposal mutation audit: **5/5 killed**, restored tests passed — [audit.log](audit.log).
- Installer: six checks passed, including external backup, hash/symlink refusal,
  and preservation of settings/index/journals/decisions/**connection rules** —
  [installer.log](installer.log). The fixed TEST wrapper was syntax-checked only.
- `git diff --check` and native harness syntax checks passed.

Read-only local calculation probe with one active rule and synthetic 32-dimensional
vectors: [bounds.json](bounds.json). On this machine, 154 documents took ~32 ms
analysis + ~10 ms strict projection; 500 took ~217 + ~35 ms. A 1000-document scope
was rejected in ~11 ms without sampling or bypassing the cap. This Node probe is
not an Obsidian frame-rate or worst-case-many-rules benchmark.

## Limits

No live model or embedding-quality evaluation was performed. Existing Apply/Undo
writers, tickets, journals and evidence validators remain unchanged and covered by
the suite/audit; the new native recording concentrates on the requested Stage 2
route. Concurrent Obsidian processes/Sync conflict resolution, physical mobile and
third-party themes are not claimed. Integration and release remain later stages.
