# Isolated native Obsidian tests

The default runner uses a private **Xvfb + Openbox** display. It runs the real
installed Obsidian/Electron, not a DOM mock or browser recreation of the plugin.
It never starts Openbox on the working display. A visible comparison requires
the explicit `--desktop` option.

## Commands

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
python scripts/native/run.py studio
python scripts/native/run.py recall
python scripts/native/run.py community /absolute/path/to/local-veynrel-recipes
```

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
The Studio regression includes its existing long-response wait test. Multiple
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
21.1.24; Openbox 3.6.1; xauth 1.1.5; ffmpeg 9.0.1; dbus-run-session and xprop;
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
behavior to make an old scenario pass. Unmerged PR #141 and its separate R03
harness are not changed by this infrastructure branch.

## What the smoke proves

The smoke uses actual plugin ItemViews and two synthetic Markdown files. It
checks EN/RU and standard dark/light screens, real focused input and Tab/Enter/
Escape, host zoom, real native content resize (not viewport emulation), a split,
a separate popout window, focus leaving/returning to the main window, unfiltered
runtime exceptions and byte-identical Markdown. Locale controls use the existing
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
| Split/popout, native resize, focus among test windows | Tested under Openbox; matched short XWayland control | Actual compositor/WM policies, cross-app focus, minimize/maximize, taskbar and close lifecycle |
| CDP keyboard/Tab/Enter/Escape | Tested, real browser handlers | Physical keyboard, OS global shortcut conflicts, IME, accessibility keyboard tools |
| Standard theme and measured layout | Tested and compared on identical content | User themes, font rendering, fractional DPI, multiple monitors and native decorations |
| Main client screenshots/video | Real pixels/events from Obsidian | OS chrome, desktop portal/file-dialog behavior and visual human acceptance |
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
