# Obsidian Review warnings — safe follow-up, 2026-10-30

Base: `0f19591e7667d87d91a64c24749e158adf9ca21d` (merged PR #129, fetched `origin/main`). Branch: `fix/obsidian-review-warnings-safe-v1`, isolated worktree. Runtime/test implementation: `fc284863d4d29a218806a9dffd9b810a43bbb996`; subsequent commits contain evidence and native harness diagnostics only. The PR HEAD is recorded in the PR description. Version remains 2.2.1.

Four of the six reported warning locations are resolved; the two network advisories remain visible and justified. This is **not** a claim of a clean hosted Community scorecard.

## Exact comparison

| Reported location on base | Before | After | Reason |
| --- | --- | --- | --- |
| `api.ts:472` | `fetch` | Retained | Incremental SSE reader and physical transport abort are required. |
| `studio/community/transport.ts:13` | `fetch` | Retained | Redirect veto before following, bounded streaming reads, omitted credentials. |
| `studio/preservationChecks.ts:38` | Unnecessary assertion | Fixed | Both `match.index!` assertions removed; regexes and native offsets unchanged. |
| `studio/view.ts:480` | Unnecessary assertion | Fixed | Callback captures a narrowed local checkbox; acknowledgement remains mandatory. |
| `styles.css:3297` | `:has(> details[open])` | Fixed | Local `.is-inspector-open`, initialized and updated on native `toggle`. |
| `styles.css:3320` | `:has(:checked)` | Fixed | Local `.is-selected` follows each native radio's checked state. |

The six locations are seven individual diagnostics: the preservation line contains two assertions. On the same five affected/network TypeScript files, official ESLint diagnostics are **5 → 2** (three assertion errors removed, two fetch warnings retained). CSS `:has()` warnings are **2 → 0**. Combined, the scoped raw diagnostic count is **7 → 2**; the user's grouped locations are **6 → 2**.

[ESLint before](obsidian-review-safe-v1-evidence/before-official-eslint.json) / [after](obsidian-review-safe-v1-evidence/after-official-eslint.json), [CSS before](obsidian-review-safe-v1-evidence/before-official-stylelint.json) / [after](obsidian-review-safe-v1-evidence/after-official-stylelint.json).

The repository pins TypeScript 5.3.3. Its `matchAll` declaration still has optional `index`, and its narrowing does not flag the captured mutable `ack`; the original repository lint therefore reports only the two fetch warnings. TypeScript 5.9.3 reproduces the three reported assertions. An explicit undefined-index guard retains compatibility with 5.3.3 without another assertion, cast, regex change, inferred offset, or dependency upgrade. Native `matchAll` results always supply the index; an anomalous missing index marks checks partial.

## Scanner scope and limits

The comparison uses the official `eslint-plugin-obsidianmd` **0.4.2**, ESLint **9.39.5**, typescript-eslint **8.72.1**, TypeScript **5.9.3**, Stylelint **17.16.0**, and `stylelint-config-obsidianmd` **0.1.0**. Tools were installed outside the worktree. ESLint uses a copy of the existing repository configuration with only its absolute `tsconfigRootDir` adjusted; production lint/configuration is unchanged. The TypeScript comparison covers `api.ts`, Community transport, preservation checks, Studio view and diagram view. The full repository also passes its unchanged lint gate.

The isolated attempt with current TypeScript `latest` (7.0.2) cannot initialize typescript-eslint (`TypeFlags` is unavailable). The supported 5.9.3 toolchain is used identically before/after, rather than changing project dependencies.

Stylelint's complete official configuration still reports **1321 standard errors before and after**, mostly formatting/specificity rules. They are included in full. This is **not an overall Stylelint PASS**. Only the two targeted CSS warnings were removed; unrelated stylesheet rules were not reformatted or disabled.

Hosted **Review branch / Preview: NOT RUN**. No authenticated Obsidian Community management connection is available in this session. GitHub Actions is a separate check. The official [FAQ](https://docs.obsidian.md/community-directory/faq) describes the local ESLint approximation; the [management documentation](https://docs.obsidian.md/community-directory/manage-entry) describes Preview.

To verify the published PR branch without a release: sign in to Obsidian Community → **Plugins → Your entries → Veynrel → Review branch** → enter `fix/obsidian-review-warnings-safe-v1` (or the exact PR HEAD SHA) → **Run preview scan**. Confirm the recorded ref/SHA and compare the six locations above. Save the resulting Preview report. Do not use Request review of a release as a substitute for this branch check.

## Why both fetch calls remain

The [public Obsidian API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) exposes `requestUrl` as a promise for complete text/JSON/ArrayBuffer, with no stream reader, AbortSignal, redirect policy, credential mode or maximum incoming-byte option. Its HTTP-error `throw` flag is not a redirect veto. The installed API declarations and the current public declarations were checked; no documented desktop/mobile-compatible equivalent was found.

| Contract | Existing implementation | Why buffered requestUrl is insufficient |
| --- | --- | --- |
| SSE UX | `streamOpenRouter` reads chunks, parses events and invokes `onToken` before completion. Completion/error and repetition checks remain. | Waiting for the whole response would remove progressive output. |
| Cancellation and timeout | AbortController reaches fetch and the active stream reader; cleanup cancels/releases the reader. | Stopping local promise waiting cannot physically cancel the underlying request. |
| Community redirects | `redirect: "error"`; status, final URL and redirected flag checked. | Checking the returned URL cannot undo a request already sent to a redirected origin. |
| Community input bounds | Content-Length precheck plus byte cap during reading; fatal UTF-8 decoder and strict MIME. | Checking a complete buffered body happens after downloading it. |
| Community privacy | Fixed allowlist, bodyless GET, `credentials: "omit"`, no referrer/cache. | No equivalent documented credential/redirect controls. |

`api.ts`, `studio/community/transport.ts`, `scripts/lint-obsidian.mjs` and `eslint.config.mjs` are byte-identical to base. The gate still accepts only one warning at each of the two exact file/rule keys. No alias, suppression, scanner exclusion, Node/Electron replacement, transport modification or additional warning allowance was introduced. Existing fetch/CORS platform limitations remain; this change does not claim mobile certification or cancellation of provider billing.

## Automated validation

| Command/check | Result |
| --- | --- |
| `npm ci` | PASS from unchanged lockfile in the isolated worktree |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| `npm run lint` | PASS, zero errors and exactly the two reviewed fetch warnings |
| `npm test -- --maxWorkers=4` | PASS: **5186 tests / 192 files** |
| Focused API / transport / preservation / workflow / create suite | PASS: **183 tests** |
| `npm run audit:proposals` | PASS: **5/5** mutations killed; restored baselines pass |
| `git diff --check` | PASS |
| Preservation equivalence with original implementation | PASS: **72 text pairs / 459 findings**, exact deep equality of findings/spans/lines/coverage and link-context observations |

[Logs and raw reports](obsidian-review-safe-v1-evidence/). Existing network tests exercise three separately delivered SSE chunks, abort after the first token, timeout, late settlement, completion errors, loop detection, Community redirect options/status/final cross-origin URL, chunked byte overflow, MIME, allowlist and credential omission. Two new tests reject malformed and truncated UTF-8. These are deterministic controlled-stream/transport tests, not remote inference. The production fetch code is unchanged.

The first sandboxed mutation audit could not capture spawned child output; the same unchanged audit passed outside that process restriction. Initial CI caught the standalone scanner reproduction script placed under docs, outside the TypeScript project. It now lives with the other development harnesses in scripts; no product code was relocated and lint configuration is unchanged. No assertion or timeout was weakened.

## Native acceptance

One candidate bundle, Linux Obsidian **1.13.7 / Electron 43.6.0**, disposable synthetic vaults/profiles. [Bundle hashes](obsidian-review-safe-v1-evidence/BUILD_SHA256SUMS) and [source commit](obsidian-review-safe-v1-evidence/BUILD_SOURCE_COMMIT).

- Diagram: **37 checks**, Excalidraw **2.29.0**, **7 loopback completions**, zero recorded exceptions. Real create/open/edit/drag-bound-arrow/save/reopen, source link, guards, late responses and restart are retained. [Report](obsidian-review-safe-v1-evidence/diagram-native.json).
- CSS states: **96 native measurements**, RU/EN × actual light/dark × 1300/720/390. Initial selection, pointer, native ArrowLeft, return to draft, rerender; inspector closed/open/closed. Each measurement temporarily substitutes the original CSS in the same DOM, compares computed properties, then restores candidate CSS in `finally`: **zero differences**. Selected state agrees with native radio state; wide open inspector has two columns, narrow inspector one; no horizontal overflow. Toggling preserves the preview DOM, frozen proposal and request count. Theme classes and actual surface/text changes are asserted.
- Markdown: **35 checks**, **9 loopback completions**, zero recorded exceptions. Checkbox off/on/off, disabled confirmation, Escape and actual Modal.close, fresh acknowledgement after reopening, unchanged notes on cancellation, exact YAML/document write, Create/Apply/Undo/history/recovery and native keyboard creation confirmation. All original UTF-8 hashes restored. [Report](obsidian-review-safe-v1-evidence/markdown-native.json).

- Community: **47 checks on base and 47 on candidate**, with the same harness. Install, immutable Review, Apply/Undo, updates, offline cache, damaged origins, publication package, RU/EN, actual light/dark and 1200/390 pass. Candidate: **1 loopback completion**, no remote catalog route, zero recorded exceptions. [Base report](obsidian-review-safe-v1-evidence/community-base.json) / [candidate report](obsidian-review-safe-v1-evidence/community-native.json). Two earlier candidate attempts stopped responding through CDP at the first size/theme transition; one was interrupted, one failed on the new bounded CDP diagnostic timeout. The cause remains unproven. These attempts are retained locally and listed in [summary.json](obsidian-review-safe-v1-evidence/summary.json); they are not counted as passes. The final before/after runs use identical checks, without retries inside the harness or changed runtime bytes. The 15-second CDP timeout affects only test diagnostics, not model/transport deadlines.

The first Markdown attempt stopped before the confirmation opened while another test window was active; concurrency is a possible cause, not proven. A second attempt exposed an incorrect test selector for the host close control. The final isolated run uses native Escape and the host Modal.close API and passes all expectations. Runtime bytes did not change between attempts. Failed artifacts are preserved locally and are not counted as passes.

Selected unedited native frames: [radio cards, EN dark](obsidian-review-safe-v1-evidence/warning-modes-en-dark-1300.png), [wide inspector](obsidian-review-safe-v1-evidence/warning-inspector-en-dark-1300.png), [narrow inspector, RU light](obsidian-review-safe-v1-evidence/warning-inspector-ru-light-390.png), [unchecked write acknowledgement](obsidian-review-safe-v1-evidence/confirm-inplace-warning.png).

## Reproduction and boundaries

For the local official-tool comparison, copy `scanner-tools-package.json` and `scanner-tools-lock.json` from the evidence directory into an empty tools directory as `package.json` and `package-lock.json`; copy `scripts/obsidian-review-warning-scan.mjs` there as `scan.mjs`, run `npm ci`, then `node scan.mjs /absolute/worktree /absolute/output`. Scan the base and candidate worktrees with that same isolated tools directory. This does not edit either worktree's lint configuration. Raw TypeScript results are scoped to the five files named above; CSS results cover the full stylesheet.

Run the repository commands above, then with installed Excalidraw 2.29.0 assets and unique **nonexistent** synthetic output directories:

```sh
git show 0f19591e7667d87d91a64c24749e158adf9ca21d:styles.css > /tmp/veynrel-review-base.css
VEYNREL_REVIEW_BASE_CSS=/tmp/veynrel-review-base.css node scripts/studio-excalidraw-native.mjs /tmp/veynrel-diagram-native-review-unique /path/to/synthetic-excalidraw-assets
node scripts/studio-source-preservation-native.mjs /tmp/veynrel-studio-native-review-unique
COMMUNITY_PUBLIC=0 node scripts/studio-community-native.mjs /tmp/veynrel-community-native-review-unique /path/to/local-catalog-fixture
```

Run native harnesses sequentially so their windows do not compete for keyboard focus. Do not set `COMMUNITY_PUBLIC=1`. The diagram harness redirects only native requestUrl destination/headers to loopback, preserves the confirmed request body and runs production preflight with synthetic endpoint metadata. Community UI smoke injects a local catalog port; it is not evidence of real public-catalog delivery. Markdown uses the unmodified empty-key Ollama loopback route. No remote LLM call, real credential, key file, personal note, TEST-vault, user theme, site, catalog mutation, model/prompt/routing/timeout change, version bump, merge, release or deploy occurred.

Physical mobile, screen readers, third-party themes and hosted Preview remain unverified. Model quality: **NOT RE-EVALUATED**.
