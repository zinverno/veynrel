# Native window zoom exception: host lifecycle attribution

2026-11-14. **Confirmed host defect, with a verified Native frame workaround.**
No Veynrel runtime fix is justified by this investigation. The failing receiver
belongs to a closing Obsidian settings window, not the live main window.
The callback runs after that window unloads, while its DOM `closed` flag is
still false and its remote `webContents` getter no longer yields a usable
WebContents object. Hidden and Obsidian frames take this path; Native frame
does not instantiate this custom-frame handler.

This localizes a newly reproduced failure independently of Veynrel, R03,
Excalidraw and the X11 launch mode. It does **not** establish the object state
of every historical exception, or fix Obsidian's implementation.

## Scope and pinned revisions

- Live `main`, checked at start and finish: `02be9894ccc7dfcc1e3332d7a3f3630d4488b35c`.
- [PR #141](https://github.com/zinverno/veynrel/pull/141): open draft, HEAD
  `33cdd002dfb90c803a3082eb6cd8bc2607f5e054`, auto-merge OFF. It was not changed.
- Independent worktree/branch: `investigate/native-zoom-root-cause-20261114`,
  based on the main SHA above. Only diagnostics and evidence are added here.
- Installed host: Obsidian **1.13.7**, Electron **43.6.0**, Chromium
  **150.0.7871.250**, bundled `@electron/remote` **2.1.3**.
- Desktop session is Wayland. The historical and primary `--ozone-platform=x11`
  launches therefore use XWayland; they do not establish pure Xorg coverage.
  The installed Wayland backend was also launched explicitly, without installing
  software or changing the desktop configuration.
- Exact R03 runtime files, unchanged by the fresh build:

| File | SHA-256 |
| --- | --- |
| `main.js` | `2d05cd5c69999f18a8b2bf46cf60ba2bf4a07d36f02e86189ff77337ca411142` |
| `styles.css` | `492779ef567de8797f55d17a20c1be5f7af12bf42ec6604916171829e74b08b3` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

[Source/artifact hashes](native-zoom-root-cause-evidence/source-artifacts.json)
also pin both installed ASARs, host `app.js`/`main.js` and the remote client.
Host source was inspected read-only; no vendored host files were changed.
Manifest 2.4.0, dependencies and release policy were not modified. This task
does not publish or reclassify a stable release.

## Historical sequence: evidence, not retrospective certainty

The original R01/R02/R03 receipts and both attribution harnesses were read.
[Timeline data](native-zoom-root-cause-evidence/historical-timeline.json) retains
exception timestamps and nearby original screenshot mtimes. A screenshot mtime
is capture completion, not an exact action timestamp.

| Receipt | Observed neighborhood | What cannot be inferred |
| --- | --- | --- |
| [R01 upgrade attempt](release-2.4.0-evidence/native-upgrade-attempt1.json) | Exception at 2026-11-13 03:36:17.933 UTC, 431 ms before the first EN/light/320 capture. Harness had restarted Obsidian, returned to Recall, opened/closed language settings, then started its viewport/theme matrix. | No paused receiver, popup identity or complete resize/focus ordering. |
| [R02 with Excalidraw](r02-excalidraw-removal-evidence/native-with-excalidraw.json) | Exception 937 ms after EN/390 and 4,140 ms before RU capture. Sequence includes widening the viewport, History/Workflow, and language settings. | Excalidraw being installed is not a causal observation. |
| [R03 small vault](https://github.com/zinverno/veynrel/blob/33cdd002dfb90c803a3082eb6cd8bc2607f5e054/docs/r03-ux-evidence/after-small.json) / [exception](https://github.com/zinverno/veynrel/blob/33cdd002dfb90c803a3082eb6cd8bc2607f5e054/docs/r03-ux-evidence/host-exception.json) | Exception 467 ms after Studio EN/light/434 and 753 ms before Workspace RU/dark/1400. Language settings closed before theme/viewport change. The harness's explicit split/popout checks were later. | No proof that the failing object was the main window. Matching stacks alone cannot establish a common cause. |

The earlier [R02 attribution](r02-native-zoom-attribution.md) remains a valid
non-reproduction result for its shorter drawing/viewport/zoom sequence. It did
not exercise this repeated settings-window close sequence.

## Newly observed failure mechanism

CDP pauses on **uncaught** exceptions. Every exception and pause is retained;
there is no exception filter, overridden method, prototype edit or host patch.
Event listeners record window lifecycle metadata. Inspection first identifies
the actual callback receiver, then its remote objects, then the main window.

For the first exception in the completed
[clean-host Hidden-frame run](native-zoom-root-cause-evidence/host-hidden-matrix.json):

| Event for settings window ID 3 | Epoch milliseconds |
| --- | ---: |
| Open, `getZoomFactor` is a function | 1794660924003 |
| Resize, 900 × 700 | 1794660924010 |
| Blur | 1794660924045 |
| `beforeunload` | 1794660924049 |
| `pagehide`, `unload` | 1794660924056 |
| Pause in `e.updateStatus` | 1794660924076 |

The [CDP trace](native-zoom-root-cause-evidence/host-hidden-matrix.trace.jsonl)
also records destruction of the settings page target before the pause. On pause:

- `this.win` is that watched settings window, URL `about:blank`, 900 × 700,
  unfocused, **`closed === false`**. It is not `window`.
- Locals `e === this.win` and `t === this.eWin` were confirmed.
- `this.eWin` has JavaScript type `object`; the inspector describes it as
  `Object`, with remote property accessors. Reading its `id` now gives `{}`.
- `this.eWin.webContents` is an `Object` with **zero own properties**;
  `typeof this.eWin.webContents.getZoomFactor === 'undefined'`.
- At the same pause, the main window is live BrowserWindow/WebContents ID 1,
  neither destroyed; its method remains a function, zoom is 1 and it is focused.

The inspected host code schedules frame status through a 50 ms debouncer on
resize. `updateStatus` guards only `!this.win.closed` before calling the remote
method. The retained callback and insufficient lifecycle guard explain why a
closed settings window reaches that call. This is not evidence that a plugin
overwrote the live main window's method.

The bundled remote client's getter uses synchronous IPC and `metaToValue`;
`metaToValue` returns `{}` for falsy metadata. That is consistent with the
empty object and ID reads after unload. **The raw IPC reply was not captured**:
the precise lower-level reason for missing metadata is a source-based inference,
not an observed Electron IPC trace. Host lifecycle attribution does not depend
on claiming that inference as proven.

All retained native exceptions have this unmodified stack:

```text
TypeError: t.webContents.getZoomFactor is not a function
    at e.updateStatus (app://obsidian.md/app.js:1:1516930)
    at c (app://obsidian.md/app.js:1:545776)
    at u (app://obsidian.md/app.js:1:545888)
```

## Paired controls and observed frequency

Each primary row is a **fresh profile/process**, same two synthetic notes,
host version, XWayland launch flags and two identical cycles. Each run closes
13 settings windows (one frame-setting inspection plus 12 cycle exposures).
The common sequence opens/closes Appearance, changes the standard theme,
sets CDP widths 1400/434/1400/390/1280/320, clears emulation, requests real
WM sizes 900×700/500×700/1200×850, and checks real zoom in/out/reset.
It then opens/closes a real split and a real popout. R03 opens its two spaces
passively after the common sequence. No scan or model operation is invoked.

| Profile / frame | Exceptions / settings closes | Common actions | Original Markdown |
| --- | ---: | --- | --- |
| [Host / Hidden](native-zoom-root-cause-evidence/host-hidden-matrix.json) | 4 / 13 | Completed | Preserved |
| [Host / Obsidian](native-zoom-root-cause-evidence/host-custom-matrix.json) | 3 / 13 | Completed | Preserved |
| [Host / Native](native-zoom-root-cause-evidence/host-native-matrix.json) | 0 / 13 | Completed | Preserved |
| [R03 / Hidden](native-zoom-root-cause-evidence/r03-hidden-matrix.json) | 3 / 13 | Completed | Preserved |
| [R03 / Obsidian](native-zoom-root-cause-evidence/r03-custom-matrix.json) | 5 / 13 | Completed | **Mismatch** |
| [R03 / Native](native-zoom-root-cause-evidence/r03-native-matrix.json) | 0 / 13 | Completed | **Mismatch** |

The two mismatches were short prefixes added to the synthetic note; the harness
sent no keyboard input. Their origin was not recorded, so they are not attributed
to Veynrel or assumed to be user input. The editable popout is a measurement
limitation. Those receipts remain failures of source preservation.

The final pair uses Reading view for both split and popout, and records input
event metadata (trusted flag/type/length, **never typed characters**):

| R03 final repeat | Exceptions / closes | Markdown hash checks | Input events observed |
| --- | ---: | --- | ---: |
| [Obsidian frame](native-zoom-root-cause-evidence/r03-custom-reading.json) | 2 / 13 | Both originals identical | 0 |
| [Native frame](native-zoom-root-cause-evidence/r03-native-reading.json) | 0 / 13 | Both originals identical | 0 |

This repeat also checks actual X11 properties of the PID-verified test window:
`_MOTIF_WM_HINTS` decoration field is 0 for Obsidian frame, 1 for Native frame;
Native frame has a 37 px top frame extent. The host settings dropdown agrees,
and `frameDom` is absent in the native main and popout windows. Actual WM sizes
and zoom factors are asserted; viewport emulation is not used as their substitute.

Additional bounded controls:

- [Theme/settings sequence without setting a CDP viewport](native-zoom-root-cause-evidence/host-custom-no-cdp.json):
  **1 / 13**, clean host, Obsidian frame. Failure is during the settings/theme
  phase, with the same closing-window receiver. The harness still issues an
  emulation-clear command between cycles, when no override has been set.
- [Wayland launch, same mixed sequence](native-zoom-root-cause-evidence/host-custom-wayland-mixed.json):
  **3 / 13**, clean host, Obsidian frame. X11 is not a necessary launch condition.
  This comparison does not claim EWMH resize coverage under Wayland.
- Settings open/close alone, without theme or viewport changes: **0 / 7** each
  on [XWayland/custom](native-zoom-root-cause-evidence/host-custom-reduced.json),
  [XWayland/native](native-zoom-root-cause-evidence/host-native-reduced.json), and
  [Wayland/custom](native-zoom-root-cause-evidence/host-custom-wayland-reduced.json).
  A negative short attempt does not disprove a timing-dependent failure.

[All 18 attempts](native-zoom-root-cause-evidence/attempts.json) are retained:
13 completed scenarios, five incomplete harness-development attempts, 24 native
exceptions in total. The five incomplete attempts comprise two early-debugger
attachment timeouts, a wrong settings-tab assertion, an inner/outer WM-size
assertion, and a popout target selector that wrongly required an app URL.
The last two still captured real exceptions and are not counted as full passes.

Native-frame observations total **0 exceptions across four fresh profiles and
46 settings closes**. These are small, correlated samples, not a population
failure rate or proof that all rare host races are eliminated. The stronger
workaround evidence is that the same sequence runs with the relevant host
handler absent by configuration. Debugger pauses can affect later timing;
they occur after the first unhandled failure, not before it.

## Workaround and native gate

In a disposable profile, select **Settings → Interface → Window frame style →
Native frame**, then **Relaunch**. The tests start fresh processes with the same
host profile setting, verify the dropdown and actual decorations, and exercise
the same failing sequence. This changes the window's decorations; it does not
filter errors or inject a Veynrel workaround. No personal profile was changed.

Gate status: **ATTRIBUTED_HOST_DEFECT / VERIFIED_CONFIG_WORKAROUND**.
The bounded Native-frame scenario passes; the strict zero-exception gate on
Hidden/Obsidian frame **still fails**. PR #141's overall UX acceptance and its
separate pointer limitation are not adjudicated here. The old receipts are
not rewritten, and a host exception is not relabelled a successful product test.

The [upstream report draft](native-zoom-upstream-report.md) is prepared locally;
it has not been submitted. Prior
[Linux/X11 startup zoom reports](https://forum.obsidian.md/t/linux-zoom-level-zoom-factor-scaling-is-not-restored-on-startup-xwayland-x11-maximize-too/104591)
describe a different symptom and were used only as hypotheses. This evidence
does not equate those reports with this settings-window lifecycle defect.

## Fresh validation and reproduction

- [Targeted](native-zoom-root-cause-evidence/targeted.log): **294/294**, four
  Health navigation/view, Studio workflow and Community test files.
- [Full suite](native-zoom-root-cause-evidence/suite.log): **5,152/5,152**, 194 files,
  `npm test -- --maxWorkers=2`.
- [Typecheck / production build / lint](native-zoom-root-cause-evidence/typecheck-build-lint.log):
  PASS, zero errors, two existing fetch advisories. The earlier combined
  supervisor exited 143 after build began; its
  [incomplete log](native-zoom-root-cause-evidence/typecheck-build-lint-attempt1.log)
  is retained and is not a successful check.
- [Mutation audit](native-zoom-root-cause-evidence/mutation.log): all five mutants
  killed; restored tests pass. Runtime/source hashes and clean R03 tree rechecked.
- [Check receipts](native-zoom-root-cause-evidence/checks.json) record commands,
  source, exit codes and elapsed time. Existing exact-HEAD
  [CI run 43588295326](https://github.com/zinverno/veynrel/actions/runs/43588295326)
  was rechecked as successful; it was **not newly triggered** by this local task.

Run the diagnostic script from this checkout; use a new output path each time:

```sh
node scripts/host-zoom-diagnostic.mjs /tmp/veynrel-zoom-cause-host-custom custom host x11 2
node scripts/host-zoom-diagnostic.mjs /tmp/veynrel-zoom-cause-host-native native host x11 2
node scripts/host-zoom-diagnostic.mjs /tmp/veynrel-zoom-cause-r03-native native r03 x11 2 /absolute/path/to/verified-r03-kit
```

The script requires the already installed Linux host paths/versions and xprop,
Python/libX11 for EWMH requests. It uses port 9396 and must run serially.
Only the PID-verified disposable window receives WM requests. Run on an idle
test desktop to avoid unrelated input. It stores complete receipts and local
screenshots; final pair receipts pin the diagnostic source hash. Earlier harness
iterations are represented by their raw traces, not fabricated source hashes.
`completed` means the actions completed; use `strictRuntimeGate` and the Markdown
checks separately when interpreting a receipt.

Full, uncropped client-area comparisons:
[host custom](native-zoom-root-cause-evidence/host-custom-matrix-final.png),
[host native](native-zoom-root-cause-evidence/host-native-matrix-final.png),
[final R03 custom](native-zoom-root-cause-evidence/r03-custom-reading-final.png),
[final R03 native](native-zoom-root-cause-evidence/r03-native-reading-final.png).
CDP screenshots do not include OS decorations; X11 property receipts supply
that separate evidence. Popout images are also retained. No full 66-scenario
rerun, D30, live-model evaluation, Windows/macOS/mobile test or pure Xorg test
was performed. No personal notes/keys are in these artifacts. No model request,
merge, publication, tag, deployment, user installation or R04 work was performed.
