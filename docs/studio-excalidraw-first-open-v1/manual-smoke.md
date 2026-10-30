# Synthetic manual smoke

Use a separate disposable vault only. No keys, provider account or network model is needed. Nothing here installs into an existing vault automatically.

## Inspect the saved native drawings offline

The review ZIP's `smoke-kit/vault/` contains Source.md and three generated native drawings. Copy this folder to a new disposable location. Manually enable the supplied Veynrel build and your Excalidraw **2.29.0** only in that copy. Opening these saved files verifies native editing/read compatibility; it is not a reproduction of first-ever Studio Open, because that eligibility intentionally is not persisted.

1. Open each drawing, use native Fit (Shift+1), pan and zoom. Move a block and verify its bound arrow follows.
2. Double-click a node text or branch label and edit it; Ctrl+S, close, reopen. Verify text and bindings survive.
3. Ctrl-click the “Источник / Source” caption to open Source.md. Right-click the caption and choose native Edit link to inspect it; Escape returns to the link popup, Tab focuses its link, Ctrl+Enter opens it. Plain Enter is the native text-edit command while a text element is selected.
4. Verify Source.md's SHA256 against `SOURCE-SHA256SUMS`; edits belong only to the drawing. At narrow widths use manual zoom/pan to read long stress labels.

## Reproduce creation and first explicit Open locally

The ZIP includes the native harness and deterministic fixtures, with no remote backend. It requires Node with global WebSocket, `/usr/bin/electron43`, `/usr/lib/obsidian/app.asar` (tested Obsidian 1.13.7), a graphical X11 session, and a folder containing only Excalidraw 2.29.0's `main.js`, `styles.css`, `manifest.json`. Do not copy personal plugin data.json or credentials. CDP 9291 must be free.

From the unpacked ZIP root, run:

```sh
node smoke-kit/scripts/studio-excalidraw-first-open-native.mjs \
  /tmp/veynrel-diagram-native-manual-unique \
  /path/to/excalidraw-2.29.0-assets after "$PWD/build"
```

The output path must not exist. The harness creates only that synthetic vault/profile, starts a loopback-only responder, validates unchanged production request bodies, creates nine comparison drawings plus a native-default-fit case, runs pointer/keyboard edit/save/reopen/navigation tests and exits. It leaves raw PNGs and `native-report.json`; inspect outcome, exceptions, hashes and request count. All fixture requests are synthetic, even though the harness exercises the production structured-output path. It changes no user/global settings and performs no remote inference.

The checked-in repository command is equivalent, using `scripts/studio-excalidraw-first-open-native.mjs` after `npm run build`. To capture a baseline, pass `before` and the separately built base artifacts as the last two arguments. Never substitute a live provider or credential.
