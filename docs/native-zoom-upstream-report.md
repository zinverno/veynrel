# Draft: custom-frame updateStatus runs after settings window unload

**Local draft, not submitted upstream.** Host issue reproduced without community
plugins; [full evidence](native-zoom-root-cause.md) and
[attempt ledger](native-zoom-root-cause-evidence/attempts.json).

## Environment

- Linux Wayland desktop; both Electron `--ozone-platform=x11` (XWayland) and
  explicit `--ozone-platform=wayland` launches reproduce.
- Obsidian 1.13.7, Electron 43.6.0, Chromium 150.0.7871.250;
  bundled `@electron/remote` 2.1.3. `--disable-gpu` is common to these runs;
  GPU-enabled behavior was not tested.
- Fresh disposable vault with two synthetic Markdown files, no community
  plugins, no credentials. Standard themes, settings opening in their own window.
- Hidden or Obsidian window frame. Native frame prevents this observed path.

## Reproduction

Use a disposable profile, not a working vault. The supplied
[diagnostic harness](../scripts/host-zoom-diagnostic.mjs) runs a bounded sequence:

1. Open a synthetic note in Reading view. Verify frame setting in Interface.
2. Open Appearance in the settings window, change the standard theme, close it.
3. Change the main CDP viewport between 1400, 434, 1400, 390, 1280, 320 pixels.
   Repeat that six-exposure sequence twice. Each close is followed by 120 ms
   settling and an observation. The script also checks real WM resize/zoom and
   split/popout afterwards; the exceptions occur earlier, during settings closes.
4. Repeat with Native frame in a fresh process/profile and otherwise identical
   conditions.

The theme/settings control without setting a CDP viewport also reproduced
(1 exception in 13 settings closes). Plain open/close alone did not reproduce
in the tested seven-close samples, so this is timing-sensitive, not an assertion
that any individual close will fail. The harness's theme-only control clears
emulation between cycles but never sets an override.

```sh
node scripts/host-zoom-diagnostic.mjs /tmp/veynrel-zoom-cause-upstream custom host x11 2
node scripts/host-zoom-diagnostic.mjs /tmp/veynrel-zoom-cause-upstream-native native host x11 2
```

## Actual / expected

Actual: an uncaught exception from a delayed custom-frame update after the
settings page unloads and its target is destroyed:

```text
TypeError: t.webContents.getZoomFactor is not a function
    at e.updateStatus (app://obsidian.md/app.js:1:1516930)
    at c (app://obsidian.md/app.js:1:545776)
    at u (app://obsidian.md/app.js:1:545888)
```

Expected: no frame-status work uses a remote window after its lifetime ends.

CDP pause-on-uncaught inspection identifies the receiver as the old settings
window, not the main window. `this.win.closed` remains false after unload;
`this.eWin.webContents` is an empty object and `getZoomFactor` is undefined.
The main window's WebContents and method remain valid. Its zoom is 1. The
inspected host frame constructor debounces resize updates by 50 ms, and
`updateStatus` checks only the DOM window's `closed` flag before the remote call.

Example [receipt](native-zoom-root-cause-evidence/host-hidden-matrix.json),
settings window ID 3: resize at 1794660924010 ms, unload at 1794660924056,
exception pause at 1794660924076. The receiver is linked to that window by a
WeakMap populated while it was alive. This is object/lifecycle evidence, not
attribution based only on a matching stack.

The bundled remote client converts falsy IPC metadata to `{}`. That is consistent
with the post-unload getter result, but the raw IPC reply was not captured;
the lower-level IPC explanation remains an inference for upstream investigation.

## Controls and workaround

- Clean XWayland host: Hidden 4/13, Obsidian frame 3/13, Native frame 0/13.
- Clean Wayland host: Obsidian frame 3/13 on the same settings/viewport sequence.
- Native frame across four profiles, including two with Veynrel R03: 0/46.
- Final R03 paired repeat with read-only views: Obsidian frame 2/13, Native frame
  0/13; both Markdown files byte-identical, real WM resize/zoom/split/popout pass.

These counts are observations, not statistical guarantees. Debugger pauses can
affect later timing. Every exception remains in the raw receipts.

Verified workaround: **Settings → Interface → Window frame style → Native frame
→ Relaunch**. Both its actual X11 decorations and the absence of `frameDom` were
checked. No host code, third-party code, global method or prototype was modified.
No workaround was added to Veynrel. The defect remains on custom frames and
requires an upstream lifecycle fix; this report does not prescribe an untested
patch.
