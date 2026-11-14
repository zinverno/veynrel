# R02 native zoom exception: bounded attribution follow-up

Date: 2026-11-13. Existing draft PR #140 only; no runtime fix or new PR.

**Disposition: gate remains open.** The identical exception was already captured before R02, but the current short comparison did not reproduce it in any of the three environments. This establishes that the signature is not new to R02; it does not establish its trigger, rule out an effect on its frequency, or justify a completely green coexistence gate. No exception filter, host/Excalidraw modification or speculative workaround was added.

## Original receipts

Read together: [R01 report](release-2.4.0-verification.md#failed-attempts-and-limits), [R01 first upgrade receipt](release-2.4.0-evidence/native-upgrade-attempt1.json), [R02 report](r02-excalidraw-removal-verification.md#native-acceptance), [R02 coexistence receipt](r02-excalidraw-removal-evidence/native-with-excalidraw.json). These original records remain unchanged.

The two exception descriptions compare byte-for-byte equal:

```text
TypeError: t.webContents.getZoomFactor is not a function
    at e.updateStatus (app://obsidian.md/app.js:1:1516930)
    at c (app://obsidian.md/app.js:1:545776)
    at u (app://obsidian.md/app.js:1:545888)
```

R01 recorded it at timestamp `1794540977932.971`; R02 at `1794547128030.236`. Both report Obsidian 1.13.7 / Electron 43.6.0. The R01 repeat had zero exceptions without changing its ZIP. The R02 receipt retained its overall FAIL despite 66 successful functional assertions.

The original R02 exception occurred about 0.94 seconds after the local `incomplete-en-390.png` capture, near the narrow-to-wide viewport transition. Capture timing is correlation, not proof of the trigger. Read-only inspection of the installed host source locates the failing access in the frameless titlebar's `updateStatus`: it reads `this.eWin.webContents.getZoomFactor()`. The titlebar subscribes to resize through a 50 ms debounced callback. This identifies the failing host operation, not why its method was temporarily unavailable.

## Controlled comparison

Three separate, newly created disposable vault/profile pairs used the same binaries and synthetic files. No personal vault/settings were read or changed. The baseline was rebuilt from the exact pre-R02 main `05f4cdaeb9bf5aa092901f3e5079bb302b82e596`; all three resulting runtime hashes match the original R01 package. R02 used source `2245d74305adc32a0957c734091f487a04c3e615`, as delivered at PR HEAD `4ca1c22eddb63eff0efc5bf4877f9c676ec69ab7` before this follow-up.

Versions in every new profile: **Obsidian 1.13.7, Electron 43.6.0, Excalidraw 2.29.0**, Linux desktop/X11. Host assets were read, never patched:

| Installed host file | SHA-256 |
| --- | --- |
| `obsidian.asar` | `a52a7daf1e2460bae03de80f2816604bd16a56cd374fbe5ce8d1a9ef5604059d` |
| bootstrap `app.asar` | `8588f1fd23c9f63d3507a9740d656252cf0fbe0538e00e5d8eb7660533416c52` |
| `app.js` read from the installed archive | `8efbf581e259cabef4f9c9a34814cfe3c02863757377e56b3603933c50e89898` |

Each receipt records exact Excalidraw and applicable Veynrel runtime hashes, loaded plugin IDs, every observed zoom value and all captured exceptions/call errors.

Identical short scenario:

1. Wait for layout, plugin registration, Excalidraw API and drawing metadata; assert versions and Veynrel presence/absence.
2. Open synthetic Markdown in source and Reading views; explicitly open the registered Excalidraw view with an existing drawing; return to Markdown.
3. Three cycles of 390 → 1300 desktop viewport widths, followed by native `window:zoom-in`, `window:zoom-out`, `window:reset-zoom` commands. Assert the actual window zoom changed, with 300 ms settling between actions.
4. Observe the final state, compare the drawing bytes, save the receipt and close only that disposable process.

| Environment | Scenario | Exceptions / evaluated-call errors | Observed zoom | Drawing bytes |
| --- | --- | --- | --- | --- |
| [Obsidian + Excalidraw, no Veynrel](r02-excalidraw-removal-evidence/zoom-host.json) | Completed | 0 / 0 | 1 → 1.0954451150103321 → 1, repeated three times | Identical |
| [Pre-R02 main + Excalidraw](r02-excalidraw-removal-evidence/zoom-base.json) | Completed | 0 / 0 | Same | Identical |
| [R02 + Excalidraw](r02-excalidraw-removal-evidence/zoom-r02.json) | Completed | 0 / 0 | Same | Identical |

At every recorded sample, the titlebar's remote `getZoomFactor` property was a function. The missing-method condition was not observed. These negative results apply to this bounded sequence and its timing, not arbitrary long sessions or all host lifecycle races.

## Reproduction and unsuccessful attempts

The [local probe](../scripts/r02-host-zoom-native.mjs) uses only Node standard libraries and the existing synthetic drawing fixture. It refuses an existing output directory, validates loaded versions, records runtime hashes, and retains every exception rather than suppressing matching ones. It performs no generation/provider action; fixture credentials are empty and HTTP(S) renderer requests are blocked. The full 66-scenario suite was not repeated.

```sh
DISPLAY=:0 node scripts/r02-host-zoom-native.mjs \
  /tmp/veynrel-r02-zoom-UNIQUE \
  /path/to/excalidraw-2.29.0 \
  /path/to/built-main-05f4cda \
  /path/to/built-r02-2245d74
```

[Earlier-attempt receipts](r02-excalidraw-removal-evidence/zoom-earlier-attempts.json) distinguish incomplete/inadequate runs from the final comparison. Initial CDP key combinations left zoom at 1 and were not counted as a zoom test; the server then restarted before the third report was saved. The remaining process's exact disposable vault path was verified before closing it. Native host commands replaced those ineffective combinations. The next control profile did not reach Excalidraw view readiness, although its baseline and R02 cases completed without exceptions. The final comparison explicitly waits for the API/metadata and opens the registered drawing view; all three cases then completed.

## Checks and remaining uncertainty

New local checks: probe syntax, JSON receipt parsing, exact original-stack equality, baseline/R01 asset equality, loaded versions, actual zoom assertions, unchanged drawing hashes, final R02 asset equality, Markdown links, privacy and diff review. No runtime, manifest, dependency, Recall or third-party source was changed. The original full local suite is not presented as newly rerun; GitHub CI is rechecked on the evidence commit and reported in PR #140.

The evidence supports a pre-existing host exception signature and no observed R02-specific failure in the short comparison. Its immediate cause and reproducible trigger remain unknown. Accordingly, the original strict coexistence gate stays unresolved; no green status is inferred from a non-reproduction. Other platforms, longer timing/race matrices and live model quality were not tested. No paid call, merge, tag, release, deployment or R03 work occurred.
