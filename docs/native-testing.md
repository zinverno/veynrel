# Isolated native Obsidian tests

The default runner uses a private **Xvfb + Openbox** display. It runs the real
installed Obsidian/Electron, not a DOM mock or browser recreation of the plugin.
It never starts Openbox on the working display. A visible comparison requires
the explicit `--desktop` option.

The [post-#149 R06.1 integration report](r06/part1-integration-149.md) records the
current release policy and fresh isolated checks. The
[post-#148 report](r06/part1-integration-148.md) and
[Community diagnosis](r06/community-apply-attribution.md) remain historical evidence;
the Community confirmation/document-ownership gate is still open.

## Commands

Until separately authorized publication of 2.4.0, the public manifest remains **2.3.1** while package/lock-root development metadata remains **2.4.0**. A current-checkout native build therefore reports 2.3.1 in Obsidian and manifest-based diagnostics; it is still unpublished development code. Record the source commit, package version and SHA-256 of all three installed assets, and label the run as development. Test the actual stable release using its separate downloaded asset directory. Never identify a build or claim an upgrade solely from the displayed version. See the [version policy](community-version-policy.md).

Build the current checkout first, using its committed dependencies:

```sh
npm run build
python scripts/native/run.py smoke
```

The command prints a fresh `/tmp/veynrel-smoke-native-…` output directory and
exit status. `report.json`, full PNG screenshots, `journey.mp4`, original CDP
video frames and `isolation/result.json` remain there after process cleanup.
No profile is installed in a personal vault. Reusing an output directory is an
error; failed evidence is not overwritten.

The maintained core harnesses use the same launch boundary:

```sh
python scripts/native/run.py actions --timeout 240
python scripts/native/run.py organization --timeout 300
python scripts/native/run.py studio --timeout 240
python scripts/native/run.py recall
python scripts/native/run.py community /absolute/path/to/local-veynrel-recipes
VEYNREL_R03_REVIEW_LABELS=1 python scripts/native/run.py studio
```

The `actions` scenario exercises the R05.1 finding → pair → local link → exact
Markdown diff → separate Apply → supported Undo route. It uses no model, checks
per-stage IO, scope and journal writes, and retains failed receipts. BOM reads
that lose bytes are a verified refusal, not a successful write claim. See
[R05.1 limits](r05/local-link-actions.md) and [verification](r05/verification.md).

The `organization` scenario exercises R04 on synthetic empty, tagless, organized,
registry and 1,000-note fixtures, including cancellation, stale sources, native
keyboard/split/popout, restart, RU/EN and both themes. It uses no model response;
a loopback request counter must remain zero. See [R04 verification](r04/verification.md).

The environment flag selects the independent R03 Review-label mode: 24 label
variants plus 10 scenario checks, including destination switching without another
generation, separate-note creation, source Apply/Undo and History. Unset it for
the full 66-check Studio scenario. Both modes use the same runner, isolated
profile, focus handling and kernel-assigned CDP port; no second launcher is needed.

The Community directory must contain `catalog/v1/index.json` and the referenced
fixtures. The test serves those files locally; the runner sets
`COMMUNITY_PUBLIC=0`. Studio/Recall model responses are synthetic loopback
responses, never evidence of live-model quality. Their optional asset/upgrade
arguments still follow the harness's disposable-root argument; the runner
supplies that root automatically. For example:

```sh
python scripts/native/run.py recall /absolute/candidate-kit /absolute/stable-kit
python scripts/native/run.py smoke /absolute/review-build
python scripts/native/run.py studio --output /tmp/veynrel-studio-native-review --timeout 240
```

Default timeout is 180 seconds; explicit timeouts are bounded to 1–900 seconds.
The Studio regression includes its existing long-response wait test; the fresh
post-R03 run took 182 seconds alongside other checks, so use the documented
240-second budget for that full scenario. This does not change its assertions. Multiple
runner processes may run concurrently; each owns its display, profile and CDP
listener. Do not run the converted Node harnesses directly: their early guard
rejects an unwrapped launch before creating fixtures or opening windows.

For a separately authorized, short visible comparison:

```sh
python scripts/native/run.py smoke --desktop --output /tmp/veynrel-smoke-native-visible
```

That option uses the current X11/XWayland display and existing window manager.
It deliberately opens visible temporary windows and changes focus. Schedule it
with the desktop owner. It still uses a disposable profile, private D-Bus and
XDG directories, Native frame, dynamic CDP and the same smoke assertions.

## Dependencies and isolation

Locally verified dependencies: Linux; Node 24.14.1; Python 3.14.7; Xvfb
21.1.24; Openbox 3.6.1; xauth 1.1.5; ffmpeg/ffprobe 9.0.1; dbus-run-session and xprop;
Obsidian 1.13.7 at `/usr/lib/obsidian/app.asar`, launched by
`/usr/bin/electron43` (Electron 43.6.0). No package/version installation is
performed by the runner. The product manifest/dependencies remain unchanged.

- Xvfb allocates its own display through `-displayfd`; it is not a guessed
  fixed display. The server uses a private Xauthority cookie and disables TCP.
  Openbox receives an explicit temporary config, with no user autostart/session.
- The invisible path removes the inherited `DISPLAY`, `XAUTHORITY` and Wayland
  socket reference before starting its worker. Only the new display/cookie reach
  the harness. Desktop activation/session tokens and the inherited D-Bus address
  are removed. XDG config/cache/data/runtime directories are private; `HOME` is
  not rewritten.
- A private D-Bus daemon has **no service activation directories**. It cannot
  launch the user's keyring, desktop portals or session services. This matters:
  the first prototype's ordinary private session bus activated a keyring prompt
  and blocked host startup. Its failed receipt is retained.
- No `--no-sandbox`, password-store downgrade, host patch or global exception
  filter is used. GPU remains disabled, matching the existing harnesses.
- The shared Node bootstrap accepts only the runner-owned synthetic root,
  refuses redirected profiles and changes `frame` only in that temporary
  `profile/obsidian.json`. Every launch/restart requests CDP port **0** and reads
  Chromium's `DevToolsActivePort` from that profile. A stale endpoint file is
  removed before launch. Existing vault-path/layout-ready guards remain.
- Each run owns a new process group. Success, failure, timeout, SIGINT and
  SIGTERM cleanup terminate only that group, including Electron, Openbox, Xvfb
  and D-Bus. A Linux subreaper reaps orphaned descendants. Cleanup records that
  the group is gone and its observed CDP ports are closed. No global `pkill` or
  personal Obsidian process is used. Evidence is retained; control/auth files
  are removed.

An uncatchable SIGKILL of the outer runner or a system crash cannot execute its
Python `finally` block. Do not interpret these as tested cleanup cases. Keep the
run directory/process receipt for operator diagnosis; do not kill processes by
generic application name.

## Audit and migration boundary

[The source inventory](native-testing-audit.json) pins 74 relevant tracked scripts
at main `02be9894ccc7dfcc1e3332d7a3f3630d4488b35c`. It includes non-`native`
launchers and Python helpers. Text-search leads identify 26 direct launchers,
51 focus users, 42 keyboard users and nine CDP video recorders. These counts are
not execution coverage; the relevant startup/caller paths were read separately.

| Existing group | Dependency / risk | Treatment in this PR |
| --- | --- | --- |
| Studio source preservation, Recall topics, Community | Inherited display, fixed CDP 9286/9297/9290, process restarts, focus and keyboard, synthetic HTTP ports | Shared bootstrap; kernel-assigned CDP ports; unchanged scenario/assertion lines; actually rerun on Xvfb |
| Workspace/Review/Map/acceptance launchers | Explicit Electron/X11/GPU flags, fixed ports, viewport changes, split/popout and CDP recording | Inventoried; historical entry points left untouched, not enrolled or claimed validated by this runner |
| Attach-only/child drivers | Depend on an already launched host, caller-selected port and fixture; not independently safe entry points | Retained for their original orchestrators; no automatic attachment to a working desktop |
| Native zoom/Excalidraw historical probes | Deliberately test old host frames/plugin coexistence and failure conditions | Not silently changed to Native frame or relabelled passing |
| Live evaluations/research stages | Provider credentials, paid-call budgets or frozen data | Not allowlisted, not executed or modified |

This is one supported launch path for the current core suites and a small smoke,
not a rewrite or claim that all 74 historical scripts were ported. New harnesses
should use `assertNativeRoot(root)`, `launchObsidian(root)` and
`nativeEndpoint(root, child)` from `scripts/native/session.mjs`, retain their own
readiness/vault guards and assertions, and be explicitly enrolled in `SUITES`.
Avoid intercepting `spawn`, rewriting harness source at runtime or mocking DOM
behavior to make an old scenario pass. PR #141 is now merged into main
`fbdb307908d75768f50e8ae3a49b22ccd1a18a8a`. Its Studio Review mode and
focus/pointer handling are preserved in the shared harness. Other historical
R03 experiment drivers remain outside this runner. See the
[fresh integration results](native-isolation-r03-verification.md); the original
[desktop comparison](native-isolation-verification.md) used the older R02 runtime.

## What the smoke proves

The smoke uses actual plugin ItemViews and two synthetic Markdown files. It
checks EN/RU and standard dark/light screens, real focused input and Tab/Enter/
Escape, host zoom, real native content resize (not viewport emulation), a split,
a separate popout window, focus leaving/returning to the main window, unfiltered
runtime exceptions and byte-identical Markdown. The R03 smoke adds two named
checks (21 total): passive Workspace Home remains unscanned; an explicitly
started local check completes, records history and returns its receipt to Home.
Keyboard navigation opens the Workspace menu and recipe-management disclosure
before focusing their controls. Locale controls use the existing
settings UI; a fresh ItemView is opened for each language. This does not replace
R03's hot-language-switch/context-persistence tests.

Keyboard events go through CDP's native browser input path, not DOM-dispatched
keyboard mocks. Native resize uses Electron's content-size API and verifies
actual window bounds, viewport size and resize events. Screenshots are complete
client-area captures. The video uses CDP timestamp intervals and full frames, padded
to a constant 1600×1000 canvas; it does not include OS decorations or continuously
record the separate popout. Popout screenshots and focus assertions are separate.

## Required final checks on the real desktop

| Check | Xvfb/Openbox status | Real-desktop requirement |
| --- | --- | --- |
| Plugin lifecycle, rendering, local contracts, synthetic Apply/Undo, Markdown integrity | Meaningful native checks within this environment | Recheck release-critical journeys on supported desktop platforms |
| Split/popout, native resize, focus among test windows | R03 retested under Openbox; older R02 smoke matched a short XWayland control | Actual compositor/WM policies, cross-app focus, minimize/maximize, taskbar and close lifecycle |
| CDP keyboard/Tab/Enter/Escape | Tested, real browser handlers | Physical keyboard, OS global shortcut conflicts, IME, accessibility keyboard tools |
| Standard theme and measured layout | Tested and compared on identical content | User themes, font rendering, fractional DPI, multiple monitors and native decorations |
| Main client screenshots/video | Real pixels/events from Obsidian | OS chrome, desktop portal/file-dialog behavior and visual human acceptance |
| Obsidian/Hidden custom window frame | **NOT VERIFIED**; isolated runs deliberately use Native frame | Known host lifecycle exception remains open; Native frame is a workaround, not an Obsidian fix |
| Hardware GPU, WebGL/compositor effects, frame pacing/performance | **NOT VERIFIED**; GPU disabled/software display | Actual GPU/driver, acceleration, compositor, power/display transitions |
| Keychain, Secret Service, desktop portals, cross-app clipboard/drag-and-drop | **NOT VERIFIED**; services intentionally isolated | Separate explicit checks with safe disposable data; no personal-keyring automation |
| Native Wayland, Windows/macOS, physical mobile, screen-reader speech | **NOT VERIFIED** by this X11 harness | Platform-specific final runs |
| Live model quality / public catalog availability | **NOT TESTED**; synthetic/local transport | Separate authorized evaluation; never infer it from native UI success |

An Xvfb pass is scoped to those assertions/environment. It does not close a
hardware, compositor, platform or human visual-acceptance gate.

## Infrastructure checks

```sh
node --test scripts/native/session-check.mjs
python scripts/native/test_runner.py
```

The first command tests the launch boundary without opening Obsidian. CI runs it
alongside the existing plugin suite. The second uses real private X servers and
short fixture processes to test descendant cleanup, nonzero exit propagation,
timeout and SIGTERM; it is process-infrastructure evidence, not Obsidian UI
acceptance. [Recorded native comparison and validation](native-isolation-verification.md)
separate those results from the real Obsidian smoke and existing regressions.

## R05.2 local note actions

After a production build, run `python scripts/native/run.py local-notes --timeout 240`.
The common launcher owns Xvfb/Openbox, disposable profiles, Native frame, dynamic
CDP ports and cleanup. The scenario records tag and selected broken-link
Review/Apply/disk/History/Undo chains, exact Markdown hashes, per-stage IO,
network/model attempts, active scope, RU/EN, light/dark, 390px, keyboard, split,
popout, reduced motion and Obsidian restart. It has no model transport replay.
See [the bounded contracts](r05/local-note-actions.md) and R05.2 verification.
Real compositor/GPU/IME, custom frames and live model quality remain outside this
virtual-display evidence. The old `actions` suite remains the R05.1 regression.

## R05.3 registry and decisions

After production build: `python scripts/native/run.py registry --timeout 300`.
The same isolated launcher runs a real registry edit, separate Review/Save, host
restart, explicit reload and byte-exact Undo, then leave/later/restore across an
unrelated-note rescan. It records full private-Xvfb videos through restart, client
screenshots, per-stage IO, original failures and no paid/model requests.
RU/EN, native themes, 390px, keyboard, split-editor refusal, real popout and reduced
motion are included. A failed entry stays failed; there is no automatic reopen.
The old R04 harness now checks a persisted v2 decision instead of expecting new
IDs in the legacy list; all previous behavior assertions remain. See
[R05.3 contracts](r05/registry-editing-and-decisions.md) and
[combined verification](r05/part3-verification.md).


## R06.1 map foundation

`python scripts/native/run.py map 120` runs the real Workbench → Pair Inspector →
Back flow with deterministic synthetic vectors. `map 1000`, `map 5000` and
`map 10000` exercise truthful semantic-cap refusal and the complete path list.
`R06_INDEX_COUNT=0` and `R06_INDEX_COUNT=60` with `map 120` exercise missing and
partial index coverage. Only the common Xvfb/Openbox launcher may start this
harness. No desktop or live embedding provider is used.

For an unchanged frozen baseline, use `R06_BASELINE=1 python scripts/native/run.py
map 120 /path/to/frozen-assets` (write the command on one shell line). The directory
must contain main.js, styles.css, manifest.json and SOURCE_COMMIT. Baseline mode
records the known lost context/topology relayout/rule-bypass observations instead
of asserting the new behavior; it retains the common byte, UI and exception
assertions. See [R06.1 boundaries](r06/part1-contract.md). This is not the complete
R06 family/legacy-route acceptance.

`R06_WARM_CACHE=1` is a separate warm-cache control: it waits for actual host
metadata readiness **before** opening Workspace. It does not pass or replace a
failed cold-open gate. Receipts identify the mode; compare only matching modes.


## R06.2a families and bounded selection

The existing map harness and common launcher support:

```bash
R06_FAMILIES=1 python scripts/native/run.py map 120
R06_PICKER_ONLY=1 R06_WARM_CACHE=1 python scripts/native/run.py map 10000
```

Family mode uses a distinct 12-note Docker/database/architecture/ML/diary fixture,
persists deterministic synthetic vectors through the existing store and uses real
published top-K. It checks overlapping membership, the existing Pair Inspector,
return camera/coordinates, explicit freshness invalidation, RU/EN, both themes and
390px. Synthetic vectors do not establish embedding quality or thematic accuracy.
Full uncropped frames and the continuous capture are saved by the existing harness.

Picker-only mode isolates source selection and bounded path search from full map
Refresh. It waits for host metadata (90 seconds, unchanged), opens the passive map,
selects the same source, explicitly loads the existing participation rules if needed
and measures the picker. Semantic/topology owners must remain idle; Markdown IO and
network must remain zero. It does not close the separate cold-start/Refresh gate.
Use counts 1000/5000/10000 and `R06_BASELINE=1` plus frozen assets for comparisons.

[Part 2 audit](r06/part2-audit.md) explains the bounded scope;
[verification](r06/part2-verification.md) separates before/after, failed attempts,
measured results and unresolved native gates. Legacy visual route migration is
not covered by this increment. No exception filtering, automatic retry, timeout
increase, desktop launch or live provider is introduced.


## R06.2b unified inspectors

```sh
R06_UNIFIED=1 R06_FAMILIES=1 python scripts/native/run.py map 120
R06_UNIFIED=labels R06_FAMILIES=1 python scripts/native/run.py map 120
```

The first is the integrated structural/focus/neighborhood/opportunity, Pair Back,
Review Decision, folder scope and concurrent-window journey. The second is a bounded
RU/EN light/dark 390px focus-label and context-navigation check. Both use the existing
launcher, synthetic family fixture, unfiltered exception gate and byte-preservation
guards. No automatic retry or desktop fallback. Full maps, partial/absent indices and
1k/5k/10k retain the existing `map` arguments. A warm-cache picker control is distinct
from cold-start acceptance. See [parity and exact results](r06/part2b-verification.md).
