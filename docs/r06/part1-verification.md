# R06.1 verification: geometry, policy and retained map context

R06 is **not complete**. This is the bounded first substage described in the
[implementation audit](part1-audit.md) and [contract](part1-contract.md).
The Workbench is the candidate canonical surface. Topology, Global Semantic Map,
Semantic Neighborhood, search and all old commands/routes remain available in this
PR. No redirects or semantic-family membership algorithm have been delivered yet.

## Source and environment

- Base: `ad817a3c0e91dcf8a94067d852a22e28226810b5` (merged R05.3/#146).
- Final runtime tested: `f5fa98ad5abf33ccba9a384c306b7e90be651505`.
- Harness/validation source: `cd2be4d039a3360a1a9be9770bff07485f6eef57`.
  The intervening commit only adds the explicitly labeled warm-cache control and
  its documentation. Runtime assets are identical. Later evidence commits do not
  change those assets. The PR description pins the delivery HEAD separately.
- Public stable checked at start: 2.3.1. Manifest remains unpublished 2.4.0.
  Release policy, dependencies, Resume Batch backlog and journals are unchanged.
- Obsidian 1.13.7 / Electron 43.6.0 / Chromium 150.0.7871.250;
  Linux 6.12.108, Ryzen 5 5500U, 7,429,012 KiB physical RAM; Openbox 3.6.1.
- Real Obsidian through the common launcher, private Xvfb, separate D-Bus,
  disposable profiles, Native frame, GPU disabled. No desktop run.
  [Build/environment receipt](evidence/part1/build-environment.json).

| Asset | SHA-256 |
| --- | --- |
| main.js | `8df9b3c3fd74013467730bb014bea174d1aded5b4c74672b0b85c92270244e2b` |
| styles.css | `8bd2ef4e334931500132dd7a61dc56b304b25989cdac2266cc2eaabb4f820be4` |
| manifest.json | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

## Delivered behavior and verification

| Behavior | Evidence / boundary |
| --- | --- |
| Semantic coordinates independent of real links and overlays | Exact coordinate/key tests; native link/tag toggles and topology refresh leave coordinates and layout count unchanged |
| Deterministic geometry identity | New semantic identity seeds a finite solver; unindexed notes cannot exert forces or alter indexed initial ordering |
| Honest no-index/partial-index presentation | 120-note zero/60-indexed runs pass; hollow non-semantic markers and technical placements; no index never becomes semantic-ready |
| Shared connection participation | List and map bind the existing policy; identical exclusion counts in native; missing metadata remains unknown and corrupt rules fail before compute |
| Retained map context | Exact owner, selection, camera, query and tag-filter equality after Pair Inspector and list Back; zero hidden simulation ticks |
| Explicit local computation | Passive map has zero instrumented Markdown reads, writes or model/network calls; idle metadata events do not start policy capture or map work |
| Bounded display overview | 1k/5k/10k paths remain represented by 10/50/64 technical groups, never named semantic families |
| Source preservation | Native byte guards on successful scenarios; independent post-run comparison also verifies every generated input in all 19 profiles with reports |

The cold-idle regression was first run against the prior behavior and failed,
then passed after the semantic owner stopped invalidating a never-computed idle
snapshot. See [red](evidence/part1/checks/r06-cold-red.log) and
[green](evidence/part1/checks/r06-cold-green.log) logs. Coalescing notifications alone
was insufficient; the retained failed attempts show that distinction.

## Automated checks

Fresh checks on the combined runtime:

- `npm test -- --maxWorkers=2`: **5,372 tests / 208 files passed**. Base had 5,362;
  ten added tests cover shared policy, geometry identity/physics and idle-state
  invalidation. Existing view-lifecycle expectations were updated to assert
  suspension followed by disposal on owner teardown, not removed.
- `npm run lint`: passed; runs both TypeScript configurations, production build,
  and ESLint. Zero errors; the two pre-existing fetch warnings remain in `api.ts`
  and `studio/community/transport.ts`.
- `npm run audit:proposals`: 5/5 mutations killed, restored checks passed.
- `node --test scripts/native/session-check.mjs`: 2 passed.
- `python scripts/native/test_runner.py`: 3 passed.

[Actual command logs](evidence/part1/checks/). CI for the delivery HEAD is recorded
in the PR; local checks are not presented as hosted CI.

The first hosted run [43788248427](https://github.com/zinverno/veynrel/actions/runs/43788248427)
passed 5,372 tests and both scanner jobs, then failed lint because the later-added
textual byte-audit receipt had a `.cjs` extension outside the TypeScript project.
It is now stored as `.cjs.txt`, byte-identical; no lint rules or runtime checks were
changed. The [original CI log](evidence/part1/checks/ci-initial-verify.log) is retained.
Typecheck/build/lint was repeated after packaging; runtime assets remain identical.

## Existing native regressions on the same final assets

| Suite | Actual assertions | Result / unhandled exceptions |
| --- | --- | --- |
| Smoke (Workspace + Studio entry) | 21 | PASS / 0 |
| R04 Organization Audit | 44 | PASS / 0 |
| R05.1 local link actions | 23 | PASS / 0 |
| R05.2 tagging and broken-link repair | 67 | PASS / 0 |
| R05.3 registry and durable decisions | 32 | PASS / 0 |
| Studio source preservation | 66 | PASS / 0 |
| Recall fresh-install regression | 45 | PASS / 0 |
| Community Library | 47 | PASS / 0 |

These are fresh runs, not historical counts. [Original receipts](evidence/part1/regressions/)
and [normalized index](evidence/part1/regressions.json) retain each harness's own
status schema. Community uses the existing local catalog fixture at commit
`2c9de8caede80fc91b46f49f18548c7f38b24fd4`. Studio/Recall/Community use local synthetic
transport (12/8/1 provider-fixture requests), not live providers or semantic quality
checks. Their legacy “Linux desktop” limits text is qualified by each new
`isolation/environment.json`: these runs used private Xvfb, not the user's display.
All eight have the exact final asset hashes above and preserve their existing
Apply/Undo, restart, journal and Markdown assertions.

Across 28 isolated attempts (20 map + 8 regressions), all owned process groups were
cleaned and all recorded CDP endpoints closed: 38 distinct dynamically allocated
ports, no fixed port. The pre-Obsidian launcher failure allocated no CDP endpoint.
[Isolation summary](evidence/part1/isolation-summary.json). Only owned processes
were terminated; no personal profile or desktop setting was modified.

## Native map attempts, including failures

Every row has its original report and isolation receipts under
[evidence/part1/map](evidence/part1/map/); [attempt index](evidence/part1/attempts.json)
records exact source/assets. Originals were copied byte-for-byte; no exceptions
were filtered. The baseline uses the same generated note contents and synthetic
vectors. Earlier baseline harness revisions are pinned by hashes in their reports;
new-behavior differences are observations, not weakened common safety assertions.

| Attempt | Result | What was observed |
| --- | --- | --- |
| before120-a1 | FAIL, 16 checks, 1 exception | Baseline loses map owner/context, topology refresh changes coordinates; graphical policy absent; tooltip exception |
| before1000-a1 | FAIL, 1 check | Initial harness cache-readiness bound of 10s was insufficient |
| before1000-a2 | PASS, 8 checks | Explicit 90s readiness bound; baseline cap and display checked |
| before5000-a1 | LAUNCHER FAIL | Xvfb could not write the display number; Openbox never became available, no Obsidian assertions |
| before5000-a2 | FAIL, 1 check | 90s cold-cache gate, 1,933/5,000 caches available; sampled CPU trace retained |
| before10000-a1 | FAIL, 1 check | 90s cold-cache gate, 1,742/10,000 caches available |
| after120-a1 | JSON PASS, 21 checks; visual FAIL | Blank canvas after first semantic calculation: retained camera still pointed at technical positions. Fixed by explicit refit on changed geometry; new visible-canvas assertion added |
| final5000-a1 | FAIL, 0 checks | Initial native focus gate, before map interaction; not retried into a claimed fix |
| final5000-a2 | FAIL, 1 check | Render coalescing alone: 4,668/5,000 cache gate |
| final5000-a3 | FAIL, 1 check | Idle tag-projection assertion exposed false stale transition on first cache events; fixed and unit-tested |
| delivery5000 | FAIL, 9 checks, 1 exception | f60e164 intermediate runtime; full cold cache in ~50.7s, cap/overview work, tooltip exception |
| delivery10000 | FAIL, 2 checks | Final runtime cold cache: 7,545/10,000 available at 90s; no complete-analysis claim |
| delivery120 | PASS, 23 checks | Final runtime: geometry, policy, pair, context, RU/EN, themes, 390px, real split/popout/focus |
| partial120 | PASS, 23 checks | 60 indexed / 120 scope; same small-map route |
| noindex120 | PASS, 21 checks | No semantic index; honest unavailable state and structural presentation |
| delivery1000 | PASS, 12 checks | Cap, complete path coverage, list search, group/node keyboard selection and camera return |
| warm5000 | FAIL, 11 checks, 1 exception | Final runtime; full host cache before opening; cap/list/group checks reached, tooltip exception |
| warm10000 | FAIL, 11 checks, 1 exception | Final runtime; same explicit warm-cache control; tooltip exception |
| beforewarm5000 | FAIL, 10 checks, 1 exception | Same warm-cache scenario on baseline; tooltip exception |
| beforewarm10000 | FAIL, 10 checks, 1 exception | Same warm-cache scenario on baseline; tooltip exception |

This is 20 attempts: 19 Obsidian reports and one launcher failure, across baseline,
development and delivery. Additional controls had a concrete purpose (readiness,
visual failure, profiling or warm-cache comparison); there is no retry-until-green
policy. Warm-cache passes through individual assertions **do not close the cold
startup gate**, and an exception still fails the whole scenario.

### Exception and unresolved native gates

Six of the 19 report-producing profiles recorded the following unhandled exception
(three baseline, three implementation profiles, with different workloads):

```text
TypeError: e.isShown is not a function
    at Xg (app://obsidian.md/app.js:1:1055198)
    at app://obsidian.md/app.js:1:1055177
```

Raw Runtime.exceptionThrown receipts preserve exact stacks and target IDs. This is
not the historical `getZoomFactor` stack. Read-only inspection of packaged app.js
identifies a delayed tooltip callback calling `e.isShown()`. The receiver's actual
type/lifecycle was **not captured**; neither SVG labels nor a stale tooltip target
is a proven cause. Baseline reproduction shows it predates these R06 changes, but
there is no clean-without-Veynrel control here to attribute ownership definitively.
No host edit, monkey patch, filter, retry or runtime workaround was added.

Next bounded diagnostic, if separately requested: pause on this exception and
inspect the receiver and preceding tooltip teardown in the same minimal sequence.
The large-vault exception gate remains open. The observed 6/19 count is not an
estimate of a rare-race probability. Existing first-modal, first-pointer and
Obsidian/Hidden-frame gates remain open; Native frame does not fix Obsidian itself.

## Performance and coverage

The fixture has eight different topic vocabularies, varying paragraphs/numbers,
untagged diary material, explicit links and cross-topic bridges. Its deterministic
32D vectors are **synthetic geometry/UI inputs**, not measured embedding quality.
No new embedding model or index implementation was introduced.

| Scope Markdown | Eligible indexed | Computed semantic participants | Overview |
| --- | --- | --- | --- |
| 120, no index | 0 | 0 | 120 technical positions, unavailable semantic state |
| 120, partial | 60 | 60 | 120 nodes, 60 explicitly outside semantic layout |
| 120, full | 120 | 120 | 120 individual nodes |
| 1,000 | 1,000 | 0: cap refusal | 10 display groups; all paths accessible in list/group |
| 5,000 | 5,000 | 0: cap refusal | 50 display groups; warm-cache interaction reached |
| 10,000 | 10,000 | 0: cap refusal | 64 display groups; warm-cache interaction reached |

The legacy receipt field `mapped`/`mappedNoteCount` means eligible documents in the
cap response; it is **not** a count of analyzed documents. There is no silently
truncated first-500 semantic result. Choose a smaller scope to compute a map.
No family grouping was computed at any size; technical grouping is timed separately.

The following timings are milliseconds, from one local run per cell. Large rows
are explicitly warm-cache controls; the 1k row is cold-open. Host cache population
before open took 9.08s/16.46s at 5k/10k. The failed cold 10k run is a separate gate.

| Size / mode | Metadata capture / derive | Semantic preparation + cap check | Layout initialization / display grouping | Overview DOM / SVG | Search / select note | Four layer toggles |
| --- | --- | --- | --- | --- | --- | --- |
| 1k cold | 126.6 / 177.0 | 107.0 | 9.6 / 1.3 | 101 / 38 | 16.2 / 107.6 | 186.6 |
| 5k warm | 1,409.7 / 730.6 | 1,310.4 | 24.7 / 5.1 | 221 / 118 | 34.9 / 259.2 | 323.2 |
| 10k warm | 4,855.4 / 1,436.5 | 4,534.2 | 75.5 / 23.5 | 263 / 146 | 99.1 / 495.3 | 541.0 |

No solver ticks ran for those cap-refused corpora. The full 120 map used 115 finite
ticks / 38.2ms cumulative physics and 1.8ms initialization. Frame intervals sampled
across four layer toggles had p95/max: 1k 16.7/16.8ms (12 samples), 5k 33.3/33.4ms
(16), 10k 83.4/99.9ms (16). These are short RAF samples in virtual X11, not sustained
FPS or physical display latency. JS heap snapshots were 53.1/99.4/135.8 MB at loaded
1k/5k/10k; **peak memory and total renderer/process RSS were not measured**.

Baseline warm 5k/10k search was 34.8/102.0ms; selection 252.3/511.2ms;
metadata capture 1,444.1/4,788.4ms; cap preparation 1,373.5/4,792.4ms.
Both baseline warm runs fail on the same tooltip exception. This is a diagnostic
comparison, not a statistically controlled performance improvement claim. Early
baseline work overlapped other local checks. The retained 3s cold-start CPU sample
supports avoiding repeated graph/tag projection on metadata events; no algorithmic
optimization was inferred solely from wall-clock differences.

A remaining measured bottleneck is the existing second-note selector: after
selecting a note, DOM counts rise to 1,419/5,404/10,580 for 1k/5k/10k. The overview
is bounded; the entire selected-note UI is **not**. An accessible searchable picker
and cold-cache UI readiness require a later bounded R06 change. No silent picker
truncation was introduced to make a benchmark pass.

## Native UI artifacts and IO boundaries

- [Before full frame](evidence/part1/map/before120-a1/loaded.png),
  [after full frame](evidence/part1/map/delivery120/loaded.png).
- [Selected pair](evidence/part1/map/delivery120/pair.png),
  [actual Pair Inspector](evidence/part1/map/delivery120/pair-inspector.png).
- [RU dark 390px](evidence/part1/map/delivery120/map-ru-dark-390.png),
  [EN light 390px](evidence/part1/map/delivery120/map-en-light-390.png).
- [Uncut main-client recording](evidence/part1/map/delivery120/journey.mp4):
  151 CDP frames, 6.33s timestamp span / 6.44s encoded duration. It is a fast automated route, not a human
  usability study; popout has its separate full-frame screenshot.
- [Partial index](evidence/part1/map/partial120/loaded.png),
  [no index](evidence/part1/map/noindex120/loaded.png),
  [10k list](evidence/part1/map/warm10000/list-search.png).

[SHA-256 manifest](evidence/part1/SHA256.json) covers all included evidence files.
Screenshots are full client-area frames, not crops. Visual review caught the
intermediate blank map despite a JSON PASS. Final small-map layout is visible.
At 390px there is no horizontal overflow, but expanded controls/selection consume
much of the map viewport; the full R06 narrow-panel UX is not accepted here.
Keyboard Enter/Space activation, retained focus/context, reduced-motion settling,
real split and Native-frame popout/focus return were exercised. This does not
certify every keyboard path or physical IME/compositor/GPU behavior.

IO counters begin after plugin/layout registration and wrap Vault.read/cachedRead,
public mutation methods, fetch/XHR; CDP records observed HTTP(S). They do not count
Obsidian's initial cache/adapter reads or all OS IO. Passive and explicit map load
both record 0/0/0 reads/writes/model-network calls. The full 120 journey ends with
132 reads from explicit existing tools/inspector/source opening, zero writes and
zero model-network calls. Large routes retain zero in those counters. Rules-policy
checks explicitly update disposable plugin-owned settings; passive opening does
not authorize such changes. No keys, personal notes or paid requests were used.

In failed cases the exception assertion can run before the final byte assertion.
The separate [post-run byte audit](evidence/part1/r06-postrun-bytes.json) compares all
19 disposable corpora against generated source text and finds no Markdown change.
It does not retroactively turn a failed native run into PASS. Profiles, plugin data
files and raw vault contents are not published; only synthetic receipts, selected
screenshots, video and checksums are included.

## Remaining R06 acceptance

Not delivered: semantic families and overlap membership, unified legacy visual
routing, full note-context migration, decisions parity review, explicit cancellation
UI, cold 10k readiness, bounded large second-note picker, and full narrow-panel UX.
Current source freshness, top-K/ranking, cap, Pair Inspector consent and R05 write
owners are retained. No new finding, automatic link, duplicate classification or
write executor is introduced. R06.2 depends on this foundation and separate
acceptance; it has not been started. R07 and R15 release readiness are not implied.
