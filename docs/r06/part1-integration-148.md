# R06.1 integration after PR #148

This report supersedes version-identification statements for the integrated build,
not the original [R06.1 verification](part1-verification.md). Original evidence under
`evidence/part1` is unchanged. R06.1 remains only the first R06 substage.

## Integration and release boundary

- Previous PR #147 HEAD: `f3e6877c502be7fcca17fcc4ceab6a9b83b60c3e`.
- Integrated main / merged #148: `90815b044b5351588f5cd21fecd3024501b45b6b`.
- Tested merge/source commit: `0ef05ab9217d95b331eecc3c39b9c3f70239dac5`.
- The final PR HEAD is separately pinned in its description; later changes contain
  only integration documentation/evidence. No R06.2 changes.

`git merge origin/main` completed without conflicts. Both overlapping files,
`docs/native-testing.md` and `docs/roadmap/vault-assistant-plan.md`, retain the R06.1
substage/commands and the #148 public/development version policy. No whole-side
conflict selection, reset or force-push was used.

| File / contract | Integrated result |
| --- | --- |
| manifest.json | Published 2.3.1, exact downloaded release bytes, including public description |
| versions.json | Published compatibility entries, no 2.4.0 |
| package.json / package-lock.json | Development 2.4.0, both lock-root versions preserved |
| version-bump.mjs | #148 explicit release-only metadata guard, unchanged |
| releaseCompatibility.test.ts / version-bump.test.ts | #148 assertions preserved byte-for-byte |

The protected files match main #148 byte-for-byte; the build leaves them unchanged.
The displayed Obsidian version is **2.3.1**, but this is **unpublished R06.1 development
code**, not the published 2.3.1 release and not evidence that the updater offered an
upgrade. Release 2.3.1 was read/downloaded only. No release/tag/Marketplace/deployment
operation, dependency change, personal-vault installation or paid call is authorized
or performed by this integration.

| Tested asset | SHA-256 |
| --- | --- |
| main.js | `d62638ffcdb2d0bfb724d0cd11e2f231de8096fca257077f162389541c7a167a` |
| styles.css | `8bd2ef4e334931500132dd7a61dc56b304b25989cdac2266cc2eaabb4f820be4` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |

The JavaScript hash changes because the manifest is bundled. A byte comparison
against the prior R06.1 bundle proves that the **only** two string changes are
manifest version and public description; CSS is identical. Development version
and exact source/assets are recorded in [build.json](evidence/integration-148/build.json).

## Review and automated checks

Independent read-only review checked the combined tree and the actual shared
policy, unknown-metadata, semantic-geometry and suspend/return call paths. No new
blocking regression was found in that static scope. It did not stand in for tests.
R05 owners, journal formats, source freshness, consent and Apply/Undo are unchanged.
The 500 eligible-document cap, top-K/ranking and unrelated product features remain
unchanged. No old route has been removed or claimed unified by this integration.

| Check | Fresh result |
| --- | --- |
| `npm test -- --maxWorkers=2` | 5,376 / 209 files PASS |
| `npm run typecheck` | Both configurations PASS |
| `npm run lint` | PASS, zero errors, same two retained fetch advisories |
| `npm run build` | Production build PASS; published manifest remains byte-identical |
| `npm run audit:proposals` | 5/5 mutations killed, all restored checks PASS |
| `node --test scripts/native/session-check.mjs` | 2 PASS |
| `python scripts/native/test_runner.py` | 3 PASS |

Count reconciliation: previous R06.1 had 5,372 tests / 208 files; #148 contributes
four independent version-bump cases in one file, for 5,376 / 209. Equivalently,
main #148 has 5,366 / 208 plus R06.1's ten new cases and one new file. No assertions
were removed or rewritten to accommodate the version split.

The first sandboxed mutation audit failed because its child Node process could
not start (`spawnSync EPERM`, empty stdout). A diagnostic copy captured the actual
spawn result without changing assertions or product files. The process-runner
checks also failed inside that sandbox. The **unchanged** official commands then
passed outside the sandbox, with their original failures retained alongside the
successful logs. These are environment failures, not passed mutation attempts.
See [check logs](evidence/integration-148/checks/).

## Isolated native integration

All scenarios use the existing `scripts/native/run.py`, real Obsidian 1.13.7 /
Electron 43.6.0, private Xvfb/Openbox, Native frame and separate disposable profiles.
No `--desktop`. Each scenario ran once; failures are not replaced by successful
retries. Full new originals were moved to a separate local archive **after** the
launcher confirmed process/CDP cleanup, because `/tmp` had about 650 MB free.
No old evidence or user worktree was deleted. Public copies contain synthetic
receipts and selected full client-area screenshots; no keys or personal notes.

| Scenario | Fresh checks | Result / unhandled exceptions |
| --- | --- | --- |
| smoke | 21 | PASS / 0 |
| map120 | 23 | PASS / 0 |
| map120-partial | 23 | PASS / 0 |
| map120-noindex | 21 | PASS / 0 |
| map1000 | 12 | PASS / 0 |
| actions | 23 | PASS / 0 |
| local-notes | 67 | PASS / 0 |
| registry | 32 | PASS / 0 |
| studio | 66 | PASS / 0 |
| recall | 45 | PASS / 0 |
| community | 10 | FAIL / 0 |

The four map scenarios retain the original assertions: coordinates unchanged by
link/tag overlays and topology refresh; identical map/list policy; camera, query,
filter and selection retained after Pair Inspector/Back; missing/partial index
honesty; cap refusal rather than first-500 analysis; all 1,000 paths represented
by technical display groups; no passive Markdown reads/writes/network calls under
the documented counters. Explicit Inspector/source viewing accounts for later
reads. The new source/assets distinguish these receipts from the earlier runs.

R05.1–R05.3 exercise actual synthetic Markdown writes, exact Apply/Undo, recovery,
registry and decision contracts. Studio/Recall/Community use local synthetic
transport, not live providers or semantic-quality evidence. Community reuses the
verified local catalog fixture at `2c9de8caede80fc91b46f49f18548c7f38b24fd4`.
R04's full independent 44-case native suite was not repeated: its runtime and
harness are unchanged, full unit coverage passed, and R05.3 re-exercises the
Organization entry/registry/decisions. Smoke covers Workspace and Studio entry.
No new large 5k/10k or role-simulation experiment was run.

All 11 process groups were cleaned; all 18 distinct CDP ports closed.
The successful scenarios retain their byte-preservation and supported Undo assertions.
No raw profile, settings file, vault or provider key is included in public evidence.

[Native receipts](evidence/integration-148/native/) ·
[run summary](evidence/integration-148/native-summary.json) ·
[full EN map](evidence/integration-148/native/map120/loaded.png) ·
[RU dark 390px](evidence/integration-148/native/map120/map-ru-dark-390.png) ·
[Pair Inspector](evidence/integration-148/native/map120/pair-inspector.png) ·
[continuous main-client recording](evidence/integration-148/native/map120/journey.mp4) ·
[asset/evidence hashes](evidence/integration-148/SHA256.json).

## Fresh blocking compatibility result: Community confirmation

**Follow-up, 2026-11-16:** the [bounded A/B investigation](community-apply-attribution.md)
reproduced the symptom on main before R06.1. In that attempt the pointer handler,
plan and Modal `onOpen` completed, but the Modal belonged to another document.
Its owner-window identity remains unknown; no fix is claimed and the gate remains
open. The original integration receipt below is unchanged.

**Keep PR #147 draft; do not merge.** The five mandatory smoke/map runs passed,
but the requested Community regression did not complete (10 of the previous
47 checks). After a pointer activation of `review-apply` (label “Change sources: 1”),
the separate source-write confirmation did not appear within the existing wait.
The receipt records the enabled button under the pointer, one selected source,
zero dialogs, zero uncaught exceptions, three explicit source reads and zero
Markdown writes/browser requests. It does **not** trace whether the button handler
received the click, so the root cause remains unestablished.

The symptom is compatible with the documented historical first-pointer limitation;
that is a hypothesis, not attribution. The runtime byte delta is only the bundled
public manifest strings, but that alone does not turn a failed interaction into a
successful regression check. No new product defect is asserted, and compatibility
is not declared fully verified. No second click, delayed retry, assertion change,
exception suppression or runtime workaround was introduced. This single failed
attempt remains the integration outcome.

[Original failure receipt](evidence/integration-148/native/community/report.json) ·
[uncropped failure screenshot](evidence/integration-148/native/community/failure.png).
All six original Community fixture notes are still byte-identical in a separate
[post-run disk check](evidence/integration-148/community-postrun-bytes.json); that
check is not evidence of Apply/Undo completion. Installed-recipe recovery, explicit
request consent and generated Review were reached before the timeout. The later
catalog update, offline, layout, publication-form and recovery assertions were
not reached in this run.

A bounded next diagnostic would capture pointer/key dispatch and the exact handler /
confirmation lifecycle at this boundary, with a prior-R06.1 control. It was not
started as an unbounded experiment during this integration. Hosted CI can verify
source/build gates but cannot override this native compatibility blocker.

## Known limits and conditional merge

The owner's conditional merge gate concerns **new integration regressions** and
the mandatory scenario outcomes. It does not close the existing R06 limits:

1. Unresolved `TypeError: e.isShown is not a function` tooltip exception, previously
   also observed on baseline. No filtering, host patch or claimed root-cause fix.
2. Cold-start 10,000-note gate remains open; no new claim from the small reruns.
3. Existing second-note picker can create over 10,000 DOM elements.
4. Full narrow-panel UX acceptance is unfinished; no-horizontal-overflow is not
   the same as complete usability acceptance.
5. Semantic families, overlapping membership, old-map migration and remaining
   R06 acceptance are deferred. R06.2 has not started.

Historical first-modal/first-pointer/custom-frame gates also remain unchanged.
Xvfb does not certify physical compositor, GPU, IME, screen readers or other
platforms. Synthetic fixtures establish contracts, not user benefit or live-model
quality. Resume Batch and the no-public-release-before-R15 policy are preserved.

**Do not merge: one or more native gates failed.** See the exact receipts above.
CI success cannot override a failed mandatory integration scenario.
