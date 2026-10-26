# Studio v1 verification

The native harness is `scripts/studio-native.mjs`. It creates a fresh synthetic six-note vault and separate Obsidian profile, uses the existing `callOpenRouter` → `requestUrl` → loopback HTTP path, and runs real native views, guards, journals and `Vault.process`. Its local response fixtures test mechanics, not LLM quality. It never reads a personal vault or uses real credentials.

```sh
npm run build
node scripts/studio-native.mjs /tmp/veynrel-studio-native-unique-name
```

The harness expects the existing Linux installation (`/usr/bin/electron43`, `/usr/lib/obsidian/app.asar`), DISPLAY and free CDP port 9286. It refuses a preexisting output directory. A real GUI/localhost-capable host is required. SIGKILL targets only its owned isolated process. Reports include artifact hashes, exact original/final Markdown hashes and the executed assertions; screenshots are full native frames.

Coverage includes passive opening, built-ins, a saved user recipe across actual process restart, single/manual multi/folder scope, identical basenames in nested paths, exact consent-body equality, literal untrusted HTML/embed rendering, selective Apply, history/Undo, changed source and incomplete completion refusal, cancellation before/during generation and during mass Apply, actual open-editor refusal, two tabs sharing the owner, close/reopen during generation, and actual SIGKILL after physical Apply/Undo before receipts.

The responsive matrix closes Obsidian's system sidebars, then checks the library, consent, review and history in RU/EN, built-in dark/light, and 1200/390 px windows. A narrow desktop window is not a physical mobile test. The harness also activates a recipe using native Enter.

## Manual acceptance in Obsidian

1. Install the built `main.js`, unchanged `manifest.json` and `styles.css` into a **test vault's** plugin directory. Enable Veynrel; configure a test/local model in its existing settings.
2. Open **Open Veynrel Studio** from the command palette or the wand ribbon icon. Search Built-in / My recipes; create a recipe, save it, restart Obsidian and verify it remains. Export JSON with the select/copy control; importing a user recipe requires a new unique `user.*` ID.
3. Choose a built-in and one or several saved notes, or explicitly select a folder. Save those notes and leave their editors open. Verify the model's context budget. Press **Read selected notes & review request**. If any editor has unsaved changes, Studio asks you to save and prepare again.
4. Inspect each full path, count, provider/model/endpoint, context allowance and exact JSON body. Cancel here to send nothing. Separately agree to generation to create proposals.
5. Inspect original/proposed literal Markdown and diff. Check only wanted files. Use **Review selected writes**, read the warning, then separately confirm Apply. An open affected editor blocks writing. Save and close all affected editors, including popouts, then confirm the same Review again: no new LLM request is made. This retry is available only when preflight prevented the operation from starting. Inspect each result; use Stop inside the Apply dialog to prevent later files.
6. Open History. Review Undo and confirm separately; verify exact originals. Make a synthetic edit after Apply and verify Undo refuses it. Keep unconfirmed/damaged evidence and inspect the documented recovery options; never delete journals merely to enable an action.

Remaining platform boundaries: real-model factual accuracy, paid endpoints, hardware power-loss durability, physical mobile/touch, screen-reader speech, third-party themes/editors, Windows/macOS and external Sync/multi-process races are not established by these tests.

## Recorded UX follow-up — 2026-10-27

Runtime source: `e763b1cfa929c75e199e204ce6ee8854e9be4b49`, based on PR head `50b99a7471fd6d610c65c3a117291f4debaf28ac`. [Current evidence](studio-ux-evidence/README.md) is separate from the original v1 evidence below. Build/native-installed hashes match. Linux Obsidian 1.13.7 / Electron 43.6.0.

| Gate | Observed result |
| --- | --- |
| Full test suite | **4,872 passed / 181 files**. |
| Studio suite | **110 passed / 3 files**, including **23 new cases**. The original implementation failed 14 of the first new regression cases before the fix. |
| Typecheck / build / lint | Passed; 0 lint errors and the same existing `api.ts:442` advisory. A new test's unbound-method lint error was fixed by inspecting the spy call list; its assertion is unchanged. |
| Proposal audit | **5/5 mutations killed**, restored baselines passed. Same sandbox child-output failure; unchanged audit rerun on the host passed. |
| Native acceptance | **69 checks, 39 screenshots, 17 loopback calls**. No real/paid model. |
| Before Apply | All **6 note SHA-256 hashes unchanged** through preparation/generation with the real editor open; write counter stayed **12 → 12** (earlier cases had already exercised Apply/Undo). |
| Same Review after closing | ID unchanged, provider-call counter **11 → 11** across refused Apply, editor close and successful Apply. |
| Saved/unsaved/popout | Real attached Markdown editor permits generation; unsaved buffer refuses it; two real windows permit saved reads, remaining popout blocks writing. The unsaved-buffer case suspends only that synthetic view's save scheduler. |
| Restart | Real process restart followed by protected Undo restores originals without a provider call. Existing Apply/Undo SIGKILL cases still pass. |
| Final vault | All **6/6 original hashes restored**; unrelated note never read by Studio. |

The native run exposed persistent file pointers in core Backlinks/Outgoing links/Outline inspectors. Studio now distinguishes those bufferless inspectors from editable views, with unchanged legacy guard defaults. Earlier runs also hit modal activation/readiness timeouts; the final harness uses actual pointer events, explicit window focus (including after popout), readiness waits and renderer-exception capture. A restart attempt correctly refused Undo because Obsidian restored a recent editor layout after SIGKILL. The final harness explicitly verifies this refusal, then closes that test editor before confirming Undo. [Earlier attempts](studio-ux-evidence/earlier-attempts.json), including prior successful runs, are retained; failed runs are not counted as completed native acceptance. No timeout, old assertion or write check was relaxed.

The three richer Markdown fixtures and [real-model manual protocol](studio-real-model-readiness.md) cover fact preservation, YAML/links/code, unknown exercise/nutrition values and quoted adversarial instructions. **Ollama was unavailable; real-model quality evaluation was NOT RUN.** Synthetic replies test transport and review boundaries, not factual accuracy or semantic prompt-injection resistance.

## Original v1 acceptance — 2026-10-26 UTC / 2026-10-27 Moscow

Runtime source: `fbb9c2c7face433fd8f3c0e387ba84f5fc227359`; subsequent commits add only documentation, harness and evidence. Build/native-installed files are SHA-256 identical, recorded in [build-info.json](studio-evidence/build-info.json). Actual runtime: Linux Obsidian **1.13.7**, Electron **43.6.0**.

| Gate | Observed result |
| --- | --- |
| `npm test -- --maxWorkers=4` | **4,849 passed / 181 files**, including **87 Studio tests / 3 files**. No old tests, assertions or timeouts changed. |
| `npm run typecheck` | Both repository TypeScript projects passed. |
| `npm run build` | Passed; artifact matches the native-installed build. |
| `npm run lint` | Passed: **0 errors, 1 existing approved streaming-fetch advisory** at `api.ts:442`. Typecheck/build also passed in this chain. |
| `npm run audit:proposals` | **5/5 mutations killed**, every restored baseline passed. Sandbox attempt returned empty child Vitest output; unchanged audit ran successfully on the native host. |
| `git diff --check` | Passed. |
| Native harness | **58 checks**, **35 full screenshots**, **16 loopback HTTP requests**; exact body equality checked on normal consent routes. |
| Native source integrity | **6/6 original SHA-256 hashes restored**; the unrelated note was neither read by Studio nor changed. |
| Independent code review | Found coercible enum arrays; fixed with explicit string validation and negative recipe/journal tests. Follow-up review and 87-test rerun passed; no remaining finding from that review. |

[Native report](studio-evidence/native-report.json), [evidence index](studio-evidence/README.md) and [earlier unsuccessful attempts](studio-evidence/earlier-attempts.json) are retained. The earlier attempts exposed harness readiness, CDP expression/selector, viewport configuration and runtime-version collection issues; they were not claimed as completed runs. The final entire suite exited 0. The first broad automated run exposed static ItemView import coupling; Studio registration now uses the repository's existing dynamic-import pattern, with no changes to legacy tests.

The native images include all four surfaces in the language/theme/width matrix. The only provider is synthetic loopback. This is transport, UI and recovery evidence, not a benchmark of real model transformations or nutrition/exercise accuracy.
