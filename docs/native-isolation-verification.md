# Native display isolation — verification

This infrastructure change makes the maintained native suites use a private
Xvfb/Openbox session by default. It does not change Veynrel runtime behavior,
Recall, Studio, Health, versions, dependencies or release policy. Start with the
[commands and real-desktop checklist](native-testing.md).

## Original pre-R03 results (historical)

The sections below describe the original infrastructure runs on R02. PR #141 has
since merged. The [post-R03 integration report](native-isolation-r03-verification.md)
records fresh runs on main `fbdb307908d75768f50e8ae3a49b22ccd1a18a8a`.
Original receipts and their SHA-256 inventory are retained byte-for-byte. The
visible comparison below was not rerun during the R03 integration.

## Source and environment

- Runtime/base source: `02be9894ccc7dfcc1e3332d7a3f3630d4488b35c` (current main
  when this work started). These runs use main/R02, not the unmerged R03 build.
- PR #141 was independently checked: open draft, unmerged, HEAD
  `33cdd002dfb90c803a3082eb6cd8bc2607f5e054`. It is unchanged by this work.
- Host: Obsidian 1.13.7, Electron 43.6.0, Chromium 150.0.7871.250, Linux X11;
  development plugin manifest 2.4.0. Native frame, GPU disabled in both arms.
- Xvfb 21.1.24, Openbox 3.6.1; Node 24.14.1, Python 3.14.7, ffmpeg 9.0.1.
  The ordinary desktop control uses XWayland `:0` and its existing window manager.
  This is not a native-Wayland comparison. No host packages were installed.
- The three final smoke reports pin the identical runner, session bootstrap and
  smoke source SHA-256 values in `harnessHashes`. The PR identifies their commit.
  [Comparison receipt](native-isolation-evidence/comparison.json) records exact
  equality checks, process results and the eight fresh native attempts.

| Built file | SHA-256 used in the comparison |
| --- | --- |
| `main.js` | `62c87dd88a66e613d46c96736c1bc6c2ddfd674b3df4404309cbf52033e83da9` |
| `styles.css` | `b12c11d1996525a0c99a804dcd80085fa138d75fe7e229caaef16ebc83e17267` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

## Same-scenario comparison

The desktop owner explicitly authorized a new short visible run. It completed
and its temporary Obsidian windows closed. Two Xvfb runs executed concurrently
on distinct displays, with independent profiles and kernel-assigned CDP ports.
All three used the same fixture, scenario, runtime files and harness files.

| Run | Display / CDP | Named checks | Exceptions | Total seconds | Cleanup |
| --- | --- | --- | --- | --- | --- |
| [Xvfb A](native-isolation-evidence/xvfb-a/report.json) | `:2` / `36589` | 19 passed | 0 | 11.418 | Group gone; port closed |
| [Xvfb B](native-isolation-evidence/xvfb-b/report.json) | `:3` / `37307` | 19 passed | 0 | 11.524 | Group gone; port closed |
| [Ordinary desktop](native-isolation-evidence/desktop/report.json) | `:0` / `35067` | 19 passed | 0 | 10.274 | Group gone; port closed |

These times describe bounded execution, not a performance benchmark. All eight
Workspace/Studio layout records (RU/EN × standard dark/light) matched for measured
width, scroll width, computed font/background, theme and language. Each matched
report confirms native resize to 500 and 1100 px, zoom in/out/reset, split,
separate popout, focus leaving/returning, keyboard text/Tab/Enter/Escape, and
byte-identical original Markdown. Renderer external HTTP(S) observations were
empty. No paid/model call was requested.

Full client-area screenshots are preserved, including the narrow window and
popout. Rasterization visibly differs between displays; equal layout metrics
do **not** imply pixel equality or hardware/compositor equivalence.

| Example | Ordinary desktop | Xvfb/Openbox |
| --- | --- | --- |
| Studio, RU/light | [Full screenshot](native-isolation-evidence/desktop/studio-ru-light.png) | [Full screenshot](native-isolation-evidence/xvfb-a/studio-ru-light.png) |
| Workspace, EN/dark | [Full screenshot](native-isolation-evidence/desktop/health-en-dark.png) | [Full screenshot](native-isolation-evidence/xvfb-a/health-en-dark.png) |
| Narrow native window | [Full screenshot](native-isolation-evidence/desktop/resize-500.png) | [Full screenshot](native-isolation-evidence/xvfb-a/resize-500.png) |
| Split | [Full screenshot](native-isolation-evidence/desktop/split.png) | [Full screenshot](native-isolation-evidence/xvfb-a/split.png) |
| Popout | [Full screenshot](native-isolation-evidence/desktop/popout.png) | [Full screenshot](native-isolation-evidence/xvfb-a/popout.png) |
| Continuous smoke | [MP4](native-isolation-evidence/desktop/journey.mp4) | [MP4](native-isolation-evidence/xvfb-a/journey.mp4) |

Videos use the native CDP frame intervals, without scenario cuts, on a padded
1600×1000 canvas. They capture the main client area, not OS decorations or a
continuous recording of the separate popout. The full paired PNG sets and frame
duration lists are included. Original frame files and additional captures remain
in the disposable output roots identified in the comparison receipt; these `/tmp`
files are local retention, not a permanent public artifact.

## Existing scenarios retained and rerun

Only the launch/connection boundary of three existing harnesses changed. Their
existing assertion/check lines compare equal to the base source. Optional
branches are preserved but are not implied to have run.

| Harness through Xvfb | Fresh result | Scope |
| --- | --- | --- |
| [Studio source preservation](native-isolation-evidence/studio/report.json) | 66 checks, PASS, 0 exceptions; four host starts | Synthetic response, Review/Apply/Undo/history/recovery, original Markdown checks, themes/languages/narrow layouts and restarts |
| [Recall topics](native-isolation-evidence/recall/report.json) | 45 checks, passed, 0 exceptions; two host starts | Existing fresh-install path, synthetic transport, authoring and restart assertions; **not** the optional stable-upgrade path |
| [Community](native-isolation-evidence/community/report.json) | 47 checks, PASS, 0 exceptions; five host starts | Local fixture/catalog and synthetic responses, cache/update/publication-package checks; no external publication |

Every recorded CDP port was closed after its run, and every owned process group
was gone. The local Community fixture came from catalog commit
`2c9de8caede80fc91b46f49f18548c7f38b24fd4`; the public-network branch was disabled.
Synthetic transport proves local contracts, not live-model quality.

## Failed attempts and infrastructure checks

Eight Obsidian attempts were made: one failed prototype, one successful pilot,
three final comparison runs and three existing-suite runs. No failed attempt is
counted as a pass.

- [Prototype failure](native-isolation-evidence/prototype-failure/report.json):
  zero completed checks, CDP evaluation/capture timeout, zero recorded JavaScript
  exceptions. The ordinary private D-Bus setup activated keyring/prompt services;
  [original harness log](native-isolation-evidence/prototype-failure/harness.log)
  retains that sequence. The runner now uses a private D-Bus configuration with
  no service activation directories. This is infrastructure isolation, not a
  change to Obsidian security or a product defect fix. Cleanup succeeded.
- [Next pilot](native-isolation-evidence/pilot-pass/report.json): 19 checks and
  zero exceptions. It predates the added harness-hash receipt; the subsequent
  three comparison runs carry identical source hashes.
- [Node boundary tests](native-isolation-evidence/session-guards.log): 2 passed.
  Direct unwrapped launches, redirected profiles, mismatched roots and exited
  child readiness are rejected without opening Obsidian.
- [Process tests](native-isolation-evidence/runner-lifecycle.log): 3 passed using
  actual private X servers: exit 7 with an orphan descendant, timeout 124 and
  SIGTERM 143; each group was cleaned. The earlier
  [test-fixture quoting failure](native-isolation-evidence/runner-lifecycle-attempt1.log)
  is retained. It was corrected in the test fixture, not by weakening assertions.

The process tests are not native product acceptance. An outer-runner SIGKILL or
system crash remains outside the verified cleanup guarantee.

## Fresh repository validation

[Commands, exit codes and timings](native-isolation-evidence/checks.json):

| Check | Result |
| --- | --- |
| Full suite, `npm test -- --maxWorkers=2` | [194 files / 5,149 tests passed](native-isolation-evidence/suite.log) |
| `npm run lint` | [Passed](native-isolation-evidence/lint.log), including both typechecks and production build; 0 errors, 2 existing `fetch` warnings |
| `npm run audit:proposals` | [5/5 mutations killed](native-isolation-evidence/mutation.log); restored tests passed |
| New launch-boundary tests | 2 passed; also added to GitHub CI |
| New process lifecycle tests | 3 passed locally with Xvfb/Openbox |

These are local results. GitHub CI must be read for the PR's actual HEAD; the PR
description records that separate status. Hosted CI does not claim to run the
locally installed proprietary Obsidian binary. Runtime source, manifest and
dependency files are unchanged. Published evidence contains synthetic fixtures,
not personal vault contents, profiles, cookies, keys or Xauthority files.
JSON receipts are copied verbatim; terminal logs only have trailing blank lines
normalized for Git. No exceptions or failed checks were filtered.
[SHA-256 inventory](native-isolation-evidence/SHA256SUMS) covers the evidence files.

## Deliberately open limits

This adds one supported launch path for the small smoke and three maintained
suites, not a port of all 74 inventoried historical scripts. In these original runs, frozen/live
evaluations, historical zoom/Excalidraw probes and then-unmerged R03 were untouched.
The optional stable-upgrade and Excalidraw coexistence branches were not rerun.
No claim is made that this closes the custom-frame host exception investigation.

Real-desktop release gates remain for physical input/IME, accessibility tools,
GPU/driver/compositor behavior, native Wayland, multiple monitors/DPI, OS chrome,
cross-application focus, keychain, portals, clipboard/drag-and-drop and supported
platforms beyond this Linux X11 host. See the
[explicit classification](native-testing.md#required-final-checks-on-the-real-desktop).
No public release, installation into a personal vault, merge or R04 work occurs
as part of this PR.
