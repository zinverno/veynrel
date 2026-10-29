# PR #128 review follow-up — r2

Only delivery tools, native checks and evidence changed from `96db41f5eb8a7e9ef20c8d11c4e0a39143c24855`. PR #128 was open at the start; its existing branch is updated. Fetched `origin/main`: `4ef4d2893c944467657f9b54a64d826fb9f96e84`. No production transport, UI, engine, YAML policy, prompts, routing, timeout, guard, CI or dependency changes.

## R1: shipped responder and real production route

The canonical `scripts/studio-smoke/loopback.py` and `scripts/studio-smoke/test_loopback.py` are now tracked. The `scripts/studio-smoke/build_review.py` copies the canonical files and verifies their hashes against the native-tested kit. The responder permits only an absent Authorization header or exactly one `Bearer ollama` header. Other values receive a generic error without logging or reflecting them. The loopback bind, 300,000-byte bound, request shape checks and lack of a remote backend remain intact.

[Real HTTP checks](evidence-r2/http-checks.json): 7 tests / 10 requests passed. Absent header and exact sentinel returned 200. An unrelated synthetic Bearer, lower-case sentinel, trailing-space sentinel, empty header, invalid path, invalid JSON, invalid structure and oversize body returned 400. Captured responder stdout/stderr were empty.

[Native smoke report](evidence-r2/native-smoke-report.json): the generated smoke-kit was exercised in Obsidian 1.13.7 / Electron 43.6.0 using the unchanged bundle, Ollama-compatible settings and an empty key. The UI prepared `Source.md`, required explicit generation consent, received the kit's exact synthetic response, presented Review and a separate write confirmation, then created the exact planned Markdown. All original hashes stayed unchanged. The actual production header builder and `requestUrl` transport reached the shipped Python handler; no request/header loader, body rewrite or direct engine execution was used. The observer delegates unchanged handler logic and records only status, expected-path boolean and a safe header category: `ollama-sentinel`, HTTP 200. One generation request; three native checks passed. The output and exact write plan are retained in evidence.

## R2: actual native light/dark verification

The existing host mechanism `app.changeTheme('moonstone'|'obsidian')` now drives the check. It waits for the expected `theme-light`/`theme-dark` in the element's owner document and absence of the opposite class. A switch from the opposite theme must change both computed surface and text colors. No direct class injection is used.

Observed Review colors:

| Requested | Actual class | Surface | Text |
| --- | --- | --- | --- |
| Light | `theme-light` | `rgb(255, 255, 255)` | `rgb(34, 34, 34)` |
| Dark | `theme-dark` | `rgb(28, 28, 28)` | `rgb(218, 218, 218)` |

[Native Source Preservation report](evidence-r2/native-source-report.json) records requested/actual theme, transition colors, panel geometry, viewport and overflow for each capture. The full matrix has 16 frames: RU/EN × light/dark × 390/1300 px × Review/write confirmation. [PNG checks](evidence-r2/screenshot-checks.json) verify every frame's viewport width, exact matrix coverage and pixels matching its measured surface/text colors. Representative light and dark frames were also visually inspected. The new gallery uses only this corrected matrix. [Browser validation](evidence-r2/gallery-check.json) loaded all 16 images and 36 local HTTP resources, checked both theme filters (eight frames each) and 390/1280 px layouts without horizontal overflow.

Source Preservation native passed all 27 checks with nine synthetic loopback requests and no renderer exceptions. Existing exact payload, create-only, Apply/Undo, original/control hashes, unsaved-editor refusal, selected batch, partial receipt failure, restart without replay, receipt-only recovery and keyboard checks remain. Actual theme switching legitimately saves Obsidian's `.obsidian/appearance.json`; only that host preference path is excluded from the passive journal count. Note reads/writes/creates, every other adapter write and Studio journal writes remain checked. The full IO trace is retained.

## Runtime and reproducibility

Rebuilt runtime is byte-identical to r1 and to both accepted native runs:

```text
c8549e2af58e5d93a14ecb8f2f75fe0d59d6204a2145404eb948a6d638b684d9  main.js
0a56930f3846b7c4ff047a63aaddf4dd471624df91a2bb0388b85bde5c561c71  styles.css
03001af2b852b53a31721fee83b353ad2d6496f55d327c150f0540bb5371c93b  manifest.json
```

`npm run lint` includes typecheck and build; it passed with the two existing fetch advisories. Script syntax, HTTP regression, screenshot pixel checks and `git diff --check` passed. General CI configuration and protective tests are unchanged. Full Markdown, Community and diagram native suites were **NOT rerun** in r2; their r1 reports remain historical evidence.

From the repository, build the plugin, run the HTTP test and the native harness. Its optional third argument is an absolute generated smoke-kit path. Then validate the 16 captures:

```sh
python3 scripts/studio-smoke/test_loopback.py /tmp/http-checks.json
node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-UNIQUE
node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-SMOKE-UNIQUE /absolute/path/to/smoke-kit
python3 scripts/studio-smoke/check_screenshots.py /tmp/veynrel-studio-native-UNIQUE /tmp/screenshot-checks.json
python3 scripts/studio-smoke/build_review.py /absolute/path/to/new-review-r2
```

The screenshot validator uses existing local Pillow for validation only; it adds no plugin dependency. The generator requires fresh output paths, verifies all runtime/kit hashes, writes `REVIEW.json`, the relative-resource gallery and `SHA256SUMS`, then tests every archived checksum. `REVIEW.json` identifies the final commit.

## Superseded evidence and limits

[Independent r1 findings](evidence-r2/independent-checks.json) and [attempts/limitations](evidence-r2/attempts-limitations.json) preserve both delivery mistakes. Original r1 evidence files and the original folder/ZIP are retained. Their incorrect light labels and smoke compatibility claims are superseded; they are not active acceptance evidence.

Real-model format, meaning and usefulness: **NOT RE-EVALUATED**. Only synthetic loopback was used; no remote inference, key file, personal credentials, TEST-vault, site, catalog, user installation, merge, release or deploy. Physical mobile, screen-reader speech, third-party themes/hooks and external filesystem races are not covered by this follow-up.
