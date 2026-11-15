# Native isolation after R03 integration

This report records fresh checks after merging R03 into the existing infrastructure
branch for draft PR #142. The [original infrastructure report](native-isolation-verification.md)
remains historical: its ordinary-display comparison ran the earlier R02 runtime.
No visible desktop run was performed during this integration.

## Source and merge review

- Incoming main / runtime source: `fbdb307908d75768f50e8ae3a49b22ccd1a18a8a`.
- Previous infrastructure HEAD: `0b37b39ca304e85096cd741cdbc99547a7faafc9`.
- Merge commit: `5e97d33aa92175553d5add5633d614be2897ba4e`; its two parents are
  the preceding infrastructure HEAD and incoming main, in that order.
- Final harness source: `0b66b4109587ee704a688d72f7ec72fc01363baa`.
  Later commits only package documentation/evidence. Runtime source, versions,
  dependencies, operation-journal formats and release policy match main.

`git merge --no-commit origin/main` completed without textual conflicts. The
reported earlier `mergeable: false` was not current: GitHub reported mergeable
on recheck. The overlapping `scripts/studio-source-preservation-native.mjs` was
reviewed manually before the merge commit. The [inspection receipt](native-isolation-r03-evidence/merge-inspection.json)
records exact equality with main for the Review function, focus/pointer helper
and Review unit-test file. The only Studio harness differences from main are the
shared launch/connection boundary, its early guard and command comment.

Both Studio paths are retained: the full 66-check path and the independent
`VEYNREL_R03_REVIEW_LABELS=1` path. The flag already passes through the runner's
environment; no new runner API or duplicate launcher was needed. Both use
`assertNativeRoot`, `launchObsidian`, `nativeEndpoint`, disposable Native-frame
profiles and dynamic `DevToolsActivePort`. Fixed CDP port 9286 is absent.

The small smoke now opens R03's recipe-management disclosure before its existing
Tab/Enter/Escape checks, and opens the collapsed Workspace menu before returning
Home. Two assertions were added for passive Home and an explicit local check;
all original 19 named smoke checks remain. No product UI/backend code changed.

## Fresh build and repository checks

Host: Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**, Linux
X11 on private Xvfb **21.1.24** with Openbox **3.6.1**; Native frame and GPU disabled.
Development manifest remains **2.4.0**. Node **24.14.1**, Python **3.14.7**.

A fresh production build, executed by `npm run lint`, preceded all native runs.
Every native report has exactly these asset hashes, including the failed pilot:

| File | SHA-256 |
| --- | --- |
| `main.js` | `72b5f467b09dcae663c4ea660f9fdb0d433fea6cd746c108560785375a23a25d` |
| `styles.css` | `492779ef567de8797f55d17a20c1be5f7af12bf42ec6604916171829e74b08b3` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

This is R03's runtime, not the original infrastructure branch's `62c87dd8…` build.
The [integration receipt](native-isolation-r03-evidence/integration.json) pins the
full asset and harness SHA-256 values, commands, exit codes and elapsed times.

| Fresh command | Result |
| --- | --- |
| `npm test -- --maxWorkers=2` | [195 files / 5,162 tests passed](native-isolation-r03-evidence/checks/suite.log) |
| `npm run lint` | [Both typechecks, production build and lint passed](native-isolation-r03-evidence/checks/lint.log); 0 errors, 2 existing fetch warnings |
| `npm run audit:proposals` | [5/5 mutations killed](native-isolation-r03-evidence/checks/mutation.log); each restored test passed |
| `node --test scripts/native/session-check.mjs` | [2 launch-boundary tests passed](native-isolation-r03-evidence/checks/session.log) |
| `python scripts/native/test_runner.py` | [3 lifecycle tests passed](native-isolation-r03-evidence/checks/runner.log): nonzero exit with orphan descendant, timeout, SIGTERM |

The 5,162 count exactly matches the accepted R03 baseline. All 10 Review-label
regression tests remain byte-identical to main and ran in the suite. No unit test
was removed, skipped or added by this integration. The only named-check count
change is smoke 19 → 21, explained above.

## Fresh invisible native runs

All commands use `scripts/native/run.py`, private displays, separate temporary
profiles and synthetic data. The actual commands include fresh `--output` roots
recorded in each isolation receipt. Reproducible commands:

```sh
python scripts/native/run.py smoke
python scripts/native/run.py studio --timeout 240
python scripts/native/run.py recall
python scripts/native/run.py community /tmp/veynrel-native-catalog-20261115
VEYNREL_R03_REVIEW_LABELS=1 python scripts/native/run.py studio
```

The Community fixture is the existing local catalog at commit
`2c9de8caede80fc91b46f49f18548c7f38b24fd4`; `COMMUNITY_PUBLIC=0`.
The full Studio run took 182 seconds during concurrent checks, so its explicit
240-second budget is intentional. Timings are receipts, not performance claims.

| Scenario | Result | Exceptions | Display | Host starts |
| --- | --- | --- | --- | --- |
| [R03 smoke](native-isolation-r03-evidence/smoke/report.json) | 21 checks, PASS | 0 | `:2` | 1 |
| [Full Studio](native-isolation-r03-evidence/studio/report.json) | 66 checks, PASS | 0 | `:3` | 4 |
| [Recall](native-isolation-r03-evidence/recall/report.json) | 45 checks, PASS | 0 | `:2` | 2 |
| [Community](native-isolation-r03-evidence/community/report.json) | 47 checks, PASS | 0 | `:4` | 5 |
| [R03 Review mode](native-isolation-r03-evidence/review/report.json) | 24 label variants + 10 scenario checks, PASS | 0 | `:3` | 1 |

Displays are reused only after the preceding owner's cleanup. Overlapping runs
have distinct displays. The 13 CDP ports across successful runs are all unique;
the failed pilot adds a fourteenth distinct port. Every attempt, including the
failed one, reports its owned process group gone and all observed ports closed.
Cleanup sends signals only to each runner's owned group. Native frame is written
only to temporary profiles; there is no personal-vault installation or `--desktop`.

### R03 workflows observed

- Workspace Home renders on RU/EN and both built-in themes. Passive navigation
  leaves the fresh vault unscanned. Explicit Check scans the two synthetic notes,
  commits three findings, records history and returns the matching completed-scan
  receipt to Home. Original Markdown hashes remain unchanged. The smoke records
  no renderer HTTP(S) request. This is bounded scan-state evidence, not the full
  historical passive-I/O measurement experiment.
- Studio Library/preparation and the full generation → Review → save path retain
  separate data-transmission and write confirmations. The existing source,
  selection, incomplete-response, conflict, journal, recovery, Apply/Undo and
  restart assertions pass. Synthetic loopback transport is used throughout.
- Review's RU/EN × replace/append × two themes × new-note/source/new-note sequence
  yields 24 exact labels without regenerating. Four explicitly confirmed
  synthetic generations occur; destination/theme switching adds **0 requests**,
  **0 writes/creates** and **0 journal mutations**, with the frozen Review and
  original Markdown unchanged. Two separate notes are created, two source writes
  are undone, and RU/EN History shows actual outcomes.
- Real split/popout, main-window focus loss/return, Electron content resize,
  native CDP keyboard input, Tab/Enter/Escape and real host zoom pass. No exception
  filters, DOM keyboard mocks or host patches were added. Screenshots capture
  the full client area, not a cropped selection.

### Screenshots and video

| Evidence | Fresh artifact |
| --- | --- |
| Workspace Home, EN/dark | [PNG](native-isolation-r03-evidence/smoke/health-en-dark.png) |
| Explicit local check | [PNG](native-isolation-r03-evidence/smoke/workspace-local-check.png) |
| Returned Home with scan receipt | [PNG](native-isolation-r03-evidence/smoke/workspace-home-after-check.png) |
| Studio Library, RU/light | [PNG](native-isolation-r03-evidence/smoke/studio-ru-light.png) |
| Review, EN/replace/dark/separate note | [PNG](native-isolation-r03-evidence/review/review-en-replace-dark-new-note.png) |
| Review, RU/append/light/source | [PNG](native-isolation-r03-evidence/review/review-ru-append-light-source.png) |
| Real split / popout | [Split](native-isolation-r03-evidence/smoke/split.png), [popout](native-isolation-r03-evidence/smoke/popout.png) |
| Continuous integration smoke | [MP4](native-isolation-r03-evidence/smoke/journey.mp4) |

The full screenshot sets are retained with their reports, including all 22 Review
captures. The smoke video retains CDP frame timing without scenario cuts; it
captures the main client area, not OS decorations or a continuous popout video.
PNG inspection confirms actual R03 controls and labels. It is not a claim of
human productivity or complete visual acceptance.

## Failed pilot and evidence preservation

Six native attempts were made: five successful scenario runs and
[one failed smoke pilot](native-isolation-r03-evidence/smoke-failed/report.json).
It stopped after six named checks when the harness tried to focus the Home
button inside the collapsed Workspace menu. The
[uncropped failure screenshot](native-isolation-r03-evidence/smoke-failed/failure.png)
shows the Check page and focus still on its scan control. The scan itself had
completed, committed findings and recorded history; there were zero host
exceptions. The harness now opens the visible menu with native Enter before
focusing Home. The same subsequent assertions pass; none were weakened.

Original evidence from both parents is byte-identical: 2,868 tracked evidence
files from the previous #142 HEAD and 3,046 from incoming R03, including their
existing SHA-256 inventories and failed receipts. These overlapping counts must
not be added together. [Preservation verification](native-isolation-r03-evidence/preserved-evidence.json)
records the source SHAs and empty changed-file lists. New evidence is separate in
`docs/native-isolation-r03-evidence/`, with its own [SHA256SUMS](native-isolation-r03-evidence/SHA256SUMS).
JSON receipts and the intentional BOM/CRLF Markdown fixtures are copied verbatim.
Whitespace review permits CR at end-of-line for those preservation fixtures.
Only trailing blank lines in new terminal logs
are normalized for Git; no exception or failure is filtered. No profile,
Xauthority cookie, key or private note is included. Remaining raw artifacts are
retained in the disposable `/tmp` roots, which are not permanent public storage.

## Limits and CI boundary

The earlier same-scenario desktop/Xvfb comparison remains valid only for its
recorded R02 build. This integration performs no newly authorized visible
comparison, large R03 UX experiment or D30 simulation.

Xvfb does **not** verify GPU/driver behavior, real compositor policies, IME or
physical input, native Wayland, OS dialogs/keychain, cross-application focus,
multiple monitors/DPI or other desktop platforms. Obsidian/Hidden custom frame
remains an open host gate; Native frame is the previously verified workaround,
not a fix to Obsidian. The historical irregular first pointer-click limitation
is not declared fixed by these passing bounded runs. Synthetic model responses
prove workflow/contracts, never live-model quality. Optional stable-upgrade and
Excalidraw-coexistence paths were not rerun.

GitHub CI is checked separately for the pushed HEAD and linked in PR #142's
updated description. Its three jobs must pass; hosted CI does not run the local
Obsidian binary. PR #142 remains draft with auto-merge OFF. This work does not
merge the PR, publish a release/tag, deploy, modify personal settings or start R04.
