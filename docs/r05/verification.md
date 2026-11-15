# R05.1 verification — 2026-11-15

**R05 is not complete.** This PR delivers the local link workflow and concrete
finding/pair routes only. [Audit, deferred parts and dependencies](part1-audit.md)
separate supported execution from source inspection and future work.

## Revisions and artifact identity

- Rechecked base/main: `8f1546c0cb8d5c6cc5af713d0f18ed309a8152ff`.
- PR143 is merged at that SHA; the R04 first-modal gate remains documented.
- Runtime implementation: `37c1d80d11a1fffe94968306bbe832ca3ff25c91`.
  Subsequent changes are documentation, evidence and harness coverage only.
- Manifest/package 2.4.0 stays unpublished. Public stable was independently
  rechecked as 2.3.1, published 2026-11-02, not draft or prerelease.
- No dependency, journal schema, Recall format, release policy or semantic
  algorithm changes. No personal vault/profile, frozen experiment or paid call.

All five delivery native scenarios loaded these identical production assets:

| File | SHA-256 |
| --- | --- |
| main.js | `19b33759004609c177789abb8a7648f24d77adb146db287a4b27eae3e6af74ce` |
| styles.css | `86d1b6ca8a4ff7b46764b95e17f44638d38fb6d5dde1124432aa41e53c3bfb20` |
| manifest.json | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

Harness hashes are in the receipts. [Evidence hashes](evidence/SHA256.json)
record original and public copies separately. Original receipts remain in their
separate `/tmp/veynrel-…` disposable roots; public copies replace only local
checkout/repository path prefixes. Exceptions and failed assertions are retained.
All preexisting R01–R04 evidence is untouched.

## Local checks

| Command | New result |
| --- | --- |
| Targeted planner / Safe Apply / UI / Findings / reconciliation tests | Passing; covered by the final full run |
| `npm test -- --maxWorkers=2` | **5,226 passed / 200 files**; [log](evidence/suite.log) |
| `npm run lint` | Typecheck, production build and ESLint passed; exactly two previously reviewed fetch warnings; [log](evidence/lint.log) |
| `npm run audit:proposals` | **5/5 mutations killed**, restored controls passed; [log](evidence/mutation.log) |
| `node --test scripts/native/session-check.mjs` | **2 passed**; [log](evidence/session.log) |
| `python scripts/native/test_runner.py` | **3 passed**, failure/timeout/SIGTERM cleanup; [log](evidence/runner.log) |

Compared with main's recorded 5,204 tests / 198 files, there are 22 additional
cases: 13 local-plan/executor cases in the existing Safe Apply file, 3 local UI
cases, and 6 shortlist/pair cases. No existing test was removed or weakened. Source/doc diff checks and
local Markdown links pass. Raw log copies retain their original trailing
whitespace/terminal blank lines, so the all-files diff check reports advisories
only for those evidence logs; they were not reformatted to hide the advisories.

Coverage includes both link directions; exact ranges and full paths with duplicate
basenames; CRLF/Unicode/untouched YAML and links; byte mismatch refusal;
source/target identity, ctime and full-content changes; metadata/resolver changes;
protected registry selection; dirty/equal/unknown open editors; double Apply;
backup failure; restart classification and exact Undo after a missing applied
marker. Existing single/multi/merge/archive/group/bundle and lifecycle tests stay
in the complete suite. Real cross-process timing is not exhaustively simulated.

An initial lint run found new lint violations; they were fixed. A full run started
before the last helper edit observed a cached old helper with its new test and
failed that case. It is retained as an invalid mixed-source run, not a passing
final result. The committed-source run above passed all 5,226 cases.

## Native results

Real Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**, Linux,
private Xvfb/Openbox, GPU disabled, **Native frame only in disposable profiles**.
No `--desktop` was used. Commands use the existing common launcher, fresh profiles
and dynamic CDP ports. Every delivery isolation receipt reports process-group
cleanup and closed CDP endpoints; no personal-session processes were terminated.

| Scenario | Result / receipt |
| --- | --- |
| `actions` | **23 assertions**, 0 uncaught exceptions, 0 model/HTTP requests; [receipt](evidence/actions/report.json) |
| `smoke` | **21 assertions**, 0 uncaught exceptions; [receipt](evidence/smoke/report.json) |
| `studio` | **66 assertions**, 0 uncaught exceptions; [receipt](evidence/studio/report.json) |
| `recall` | **45 assertions**, successful runner exit, 0 uncaught exceptions; [receipt](evidence/recall/report.json) |
| `community /tmp/veynrel-native-catalog-20261115` | **47 assertions**, 0 uncaught exceptions; [receipt](evidence/community/report.json) |

Community reused the existing validated local catalog fixture; its actual bytes
are [hashed here](evidence/community/catalog-sha256.json). Studio/Recall/Community
loopback model responses validate transport and workflow contracts, not live-model
quality. No public catalog request or paid inference was made.

The R05 journey uses seven synthetic notes, no model key, and real saved-file
Findings. It selects Workspace folder `one`, acknowledges the unchanged global
Findings scope handoff, and explicitly reviews `one/Same.md` → `two/Same.md`.
The exact write scope is one source, not the whole folder. A complete local scan
finds the pair; matching names are never called equivalent purpose.

**Before Apply:** every original file is byte-identical, with zero note writes,
creates or operation-journal writes. Separate consent appends exactly one
full-path link; the real disk result is checked. Separate Undo restores all seven
original files byte-for-byte. History contains an intact v1 `undone` receipt.
The originating finding/route remains available. Repeated scanning preserves its
Finding dismissal; partial absence is still governed by the unchanged reconciler.

The negative split scenario first confirms a genuinely dirty native editor
buffer. The editor later auto-saves that explicit test edit; this host write is
retained in IO. Veynrel's write consent is refused while the affected editor stays
open. The harness then explicitly restores/saves its original text. This is not
claimed as zero IO for the negative-control setup.

Per-stage read/write paths and adapter/journal operations are in the R05 receipt:

| Stage | Note reads | Note writes | Operation-journal adapter operations |
| --- | ---: | ---: | ---: |
| Passive navigation | 0 additional | 0 | 0 |
| Explicit local scan | 7 | 0 | 0 |
| Finding/pair/local preparation | 4 | 0 | 0 |
| Separate review | 2 | 0 | 0 |
| Explicit Apply | 7 | 1 | 5 |
| Explicit Undo | 6 | 1 | 2 |
| Dirty-editor control | 12 | 1 host save | 0 |
| Explicit editor restoration | 1 | 1 host save | 0 |
| BOM refusal | 5 | 0 | 0 |

Health finding/history storage and Obsidian workspace/settings IO are separately
visible under `adapterWrites`; they are not presented as Markdown mutations.
Plugin settings are unchanged except for the explicitly exercised language
selector. No new scan or model request occurs from passive navigation.

RU/EN, standard light/dark themes, 390px, real keyboard selection/Tab/Space/Enter/
Escape, actual split/popout, focus return and reduced-motion preference are
covered. Full client screenshots are [included](evidence/actions/); examples:
[diff](evidence/actions/review-diff.png), [RU light 390px](evidence/actions/ru-light-390.png),
[popout](evidence/actions/popout-plan.png), [BOM refusal](evidence/actions/bom-refusal.png).
The [continuous native journey video](evidence/actions/journey.mp4) is 11.833 seconds,
41 timestamped native frames, preserving the full 11.444-second captured interval
without cuts or cropping. It shows finding → evidence → plan → diff → Apply →
result → Undo. Scripted synthetic evidence does not establish human productivity.

## Failed attempts and remaining gates

Six R05 disposable profiles were used; this is a development sequence, not a
statistical reliability study:

1. [Attempt 1](evidence/development/attempt1/report.json): invalid top-level `await`
   in a CDP expression, before the product journey; corrected harness syntax.
2. [Attempt 2](evidence/development/attempt2/report.json): the pair was displaced
   from the shortlist by other structural observations. Eligibility was narrowed
   to concrete pair/source routes; isolation alone no longer creates a next step.
3. [Attempt 3](evidence/development/attempt3-bom/report.json): native read stripped
   BOM bytes. The existing exact `Vault.process` callback refused writing and kept
   the original. An early byte-size refusal now prevents preparing such a journal.
4. [Attempt 4](evidence/development/attempt4/report.json): 21 checks passed on the
   preceding build. This is development evidence, not the final asset proof.
5. [Fresh startup](evidence/development/final-startup-focus/report.json): the host
   window did not acquire verified focus, before opening Veynrel; 0 action checks.
   No exception filter, startup sleep or focus retry was added as a fix.
6. [Delivery](evidence/actions/report.json): 23 checks passed on the final runtime,
   including folder handoff, dirty split buffer and per-stage journal IO.

The successful bounded repeat does **not** fix or assign the startup-focus issue.
The earlier R04 intermittent first-modal gate and R03 first-pointer limitation
remain open/separate; no new large investigation was performed. Obsidian/Hidden
frame remains outside this Native-frame workaround, not fixed by Veynrel.

Xvfb does not validate GPU/compositor behavior, physical desktop pointer/scaling,
IME, custom frames, screen readers or mobile hardware. A full new user study,
live-model semantic quality and all R05.2/R05.3 operations are untested here.
R05 as a whole is not ready for acceptance or a public release.
