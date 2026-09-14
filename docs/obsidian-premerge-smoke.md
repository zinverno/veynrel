# PR #21 final pre-merge verification — 2026-09-14

**READY TO MERGE.** Real Obsidian Desktop, a real desktop popout, real Obsidian Mobile in an Android emulator, and the standalone Companion were exercised. Six candidate defects were found and corrected in five focused commits. All final scenarios and automated checks pass. PR #21 remains open and unmerged; plugin version 1.7.0 is unchanged.

This report supplements the [completed forensic audit](obsidian-review-audit.md). It does not repeat that audit or claim a hosted Obsidian rescan. Machine-readable results, including original failures and successful retests, are in [smoke.json](premerge-evidence/smoke.json). [Verification and regression logs](premerge-evidence/logs/) and screenshots are retained alongside it.

Stored log messages retain their content; trailing whitespace and surplus blank lines were normalized for Git checks.

## 1. Final Git state

- Branch: `fix/obsidian-review-scorecard`.
- Initial head: `c9826495ef8f9a2a268489ecc0ff036a2aabab2e`.
- Final tested code: `4a0418ad8ff38c5bb308b85327225ee4551af781`. The delivery commit containing this report changes documentation/evidence only; the PR head identifies that commit.
- PR: <https://github.com/zinverno/vault-audit-AI/pull/21>.
- Initial status was clean. Remotes were fetched and the target branch refreshed without rebase or merge. Main remained `edace7ec45295a03c92db8bed4e5b9491e764995`, including the final remote check. No material base movement occurred.
- Added code/test commits: `fb74d4f`, `4c448cb`, `9b02015`, `23aab51`, `4a0418a`. The report/evidence is a separate delivery commit.
- Clean verification checkout: `/tmp/vault-audit-smoke/rc-repo`, cloned with `--no-hardlinks` from the committed branch. It was clean after verification. Generated bundles, dependencies and SDK files are not committed.

No merge, tag, version bump, release publication or modification of published 1.7.0 assets was performed.

## 2. Environment and isolation

| Component | Actually used |
| --- | --- |
| Host | Manjaro Linux, kernel 6.12.95, x86_64 |
| CLI | Node 24.14.1; npm 11.11.0 |
| Desktop | Installed Obsidian 1.12.7, followed by 1.13.7 after its isolated-profile update/restart |
| Desktop runtime | Electron 39.8.10; Chromium 142.0.7444.265; embedded Node 22.22.1 |
| Display/automation | Actual Wayland/Xwayland desktop, X11 `:0`; Chrome DevTools Protocol against Electron. Xvfb was unnecessary. |
| Mobile | Official Obsidian 1.13.8 APK; Android 15/API 35, build AE3A.240806.019; WebView Chromium 124.0.6367.219 |
| Emulator | Android Emulator 37.1.11, x86_64/KVM, headless SwiftShader; isolated AVD and ADB server on port 5038 |
| Companion | Production Node build, real HTTP/MCP and SQLite; Qdrant disabled; ephemeral localhost ports |

Desktop used `/tmp/vault-audit-smoke/vault` and an isolated configuration/cache directory. Companion used `/tmp/vault-audit-smoke/companion-data`. Mobile used an emulator-only app-storage vault named `VaultSmoke`. All notes, tokens and provider responses were synthetic. A temporary SDK directory under the repository was required by `/tmp` capacity; it was removed after shutdown. No normal vault, normal Obsidian profile or paid API credential was used.

The desktop fixture began with 70 deterministic notes: all requested basic paths, separate `Projects/Alpha.md` and `Archive/Alpha.md`, frontmatter, headings, links/aliases, tags, fences, tables, callouts, block IDs, embeds, Unicode/Cyrillic, near duplicates, deep paths, empty/unusual Markdown, and a 389,898-byte large note. Generated smoke reports expanded the final indexed set to 157 Markdown files. Mobile used six transferred fixture notes plus generated results.

The plugin was installed under `ai-knowledge-hub` from the PR build. A disposable helper plugin exposed actual Obsidian API classes to the desktop test harness; deterministic provider barriers and one scoped backup-write failure injection were test instrumentation, not replacements for Obsidian's Vault or editor implementation.

| Final artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `main.js` | 421,023 | `56ce72a3f986cad29cede18331b38d0a1f049f707d08eaade608f4f5fa2d5fd6` |
| `manifest.json` | 355 | `e780bcfc96864dc6dafef007a9df1f5d3545eadb133376fd5f5fd142cec8ec51` |
| `styles.css` | 52,025 | `ea9eb63e24921f0e34965ffcafcf91d4067728b83980fb0143adcd108782dcfd` |

The clean build, desktop-installed bundle and mobile-installed bundle have the identical final `main.js` hash. All 87 files in the running Companion build matched the final clean production build. Initial-head artifact hashes are retained separately in the JSON.

## 3. Native execution matrix

| Scenario | Real native runtime used? | Method | Result | Evidence |
| --- | --- | --- | --- | --- |
| Desktop startup | Yes | Launch isolated Obsidian; reopen after complete process exit | PASS, 1.12.7 and 1.13.7 | `startup`, `desktopFinal`; desktop logs |
| Plugin enable | Yes | Actual plugin manager and PR artifacts | PASS, 20 unique commands | `startup`, `desktopFinal` |
| Disable/reload | Yes | Actual plugin manager, repeated cycles, full application restart | PASS | `lifecycle-8-cycles`, `final-popout-unload` |
| Settings | Yes, desktop/mobile | Actual settings DOM, provider selection, toggles, persistence | PASS | `settings`, `settings-persistence`, `mobileFinal`; screenshots |
| Commands | Yes | Enumerate and invoke registered callbacks, UI/confirmation/cancel paths | PASS within scope described below | `commands-start-and-cancel` |
| Context menus | Yes | Actual workspace editor-menu registration, real Menu DOM and clicks | PASS, all six original handlers | `six-context-actions`, popout screenshot |
| Note writes | Yes, desktop/mobile | Actual Vault/editor/disk or mobile adapter reads | PASS | write records; `mobileFinal` |
| Concurrent edit | Yes, desktop/mobile | Hold actual HTTP response, modify note, explicitly release | PASS | `concurrent-edit`, `mobile-concurrent-edit` |
| Backups | Yes | Real hidden backup files; scoped injected adapter failure | PASS | backup records; `mobile-normal-write-backup` |
| Provider streaming | Yes, desktop/mobile | Actual plugin `fetch` to deterministic HTTP SSE server | PASS | stream records; `mobile-stream` |
| Companion | Yes, standalone process | Production server, real HTTP/MCP/SQLite and native plugin client | PASS | sync/proposal records, MCP matrix, server logs |
| Popout | Yes | Separate Obsidian window/document, menus, proposals, unload/reload | PASS | `native-popout`, `final-popout`, `final-popout-unload` |
| Mobile | Yes | Real Android OS emulator and official Obsidian APK, WebView automation | PASS reduced suite | `mobileFinal`, mobile screenshot |

Screenshots: [desktop settings](premerge-evidence/desktop-settings.png), [real popout menu](premerge-evidence/desktop-popout.png), [Android settings](premerge-evidence/mobile-settings.png).

## 4. Smoke test matrix

Evidence keys below refer to `desktopHistory` in `smoke.json`, unless specified otherwise. Earlier FAIL records are retained as reproductions; named retests and the final chronological results establish disposition.

| Scenario / steps performed | Expected result | Actual result | Status / evidence |
| --- | --- | --- | --- |
| Start, enable, inspect settings; disable/enable and reopen application | Load without exceptions; restore settings | 20 commands, settings available and persisted; no plugin exception | PASS: startup/settings/lifecycle records |
| Select all five LLM providers and toggle four optional controls | Controls and defaults remain valid | Provider-specific settings rendered, optional features default off | PASS: `settings` |
| Invalid provider/Companion endpoint and settings search | Controlled error, no crash | Invalid URLs rejected; note preserved; 1.13.7 settings search UI opened | PASS: endpoint records; declarative search advisory remains |
| Enumerate and invoke all 20 commands | Unique IDs; controlled start/cancel/disabled behavior | No thrown registration or invocation errors | PASS: `commands-start-and-cancel`; not every command's complete generation workflow |
| Invoke all six context actions | Original handler runs once; menu closes | Improve style, Shorten, Rephrase, Generate Dataview, Flashcards, Split note into atomic notes all executed | PASS: `six-context-actions` |
| Batch replacement and separate same-basename backups | Correct replacement and original backups | Exact expected content; frontmatter retained by response; paths distinct | PASS: `normal-replacement-nested-backups` |
| Force backup failure | Original file must survive | One injected failure; original bytes unchanged | PASS: `backup-failure-preserves-original` |
| Edit, rename, delete/recreate or delete during held AI response | Stale replacement must abort | Later content/identity survived; deleted note not recreated | PASS: four `concurrent-*` records |
| Generate flashcards, then inject a concurrent edit | Preserve original; reject stale transformation | Original retained; conflict protected | PASS: flashcard records |
| Two concurrent atomization calls plus independent append | No lost edit, unlinked output or duplicated section | Fixed implementation shares generation, creates one linked note; replay creates none | PASS: `atom-concurrency-final`, mobile atom result |
| Empty/whitespace output | No destructive empty replacement | Controlled error and unchanged source after fix | PASS: empty-response records; API regressions |
| Vault Audit on fixture set | Report/canvas generated promptly | Real files generated; medium audit approximately 0.89 s | PASS: `vault-audit-medium` |
| Build semantic index, search, Similar Notes, duplicates | Valid requests/storage and rendered results | Final desktop: 652 vectors/157 Markdown files; search, 10 similar results, 100 duplicate candidates | PASS: semantic records; deterministic vectors do not establish relevance quality |
| Ask your Vault success and cancellation | Incremental output, safe final Markdown, source cards, no crash | Final heading/bold rendered, 11 source cards, scripts removed and unsafe URL inert; cancellation controlled | PASS: `ask-vault-ui`, `ask-vault-cancel` |
| AutoSync independent note creation | Changed note enters index automatically | Actual runtime snapshot included the new path, generation advanced | PASS: `auto-sync` |
| Five chat provider classes; three embedding classes | Correct endpoint, model/messages and provider options | OpenAI/OpenRouter/Groq/custom/Ollama chat; OpenRouter/OpenAI-compatible/Ollama embeddings accepted by mock | PASS: provider records; settings/embedding retest |
| 400/401/403/429/500, malformed JSON, hung response | Controlled failure without destructive writes | All preserved original; buffered timeout approximately 31.54 s | PASS: network records |
| SSE chunks, malformed-only SSE, disconnect, final-event token | Correct chunks/final token or controlled error | Unicode chunks correct; empty malformed stream rejected; disconnect rejected; final token retained after fix | PASS: stream records/regressions |
| Connect/sync native plugin to real Companion | Authenticated mirror without provider keys | 97-note snapshot synchronized; SQLite persisted across restart | PASS: `plugin-companion-sync`, restart records |
| Queue/review/approve/reject/duplicate/replay proposals | No pre-approval mutation; capability separation | Preview read-only, explicit native approval required, rejection preserved, duplicate applied once, replay acknowledgement only | PASS: proposal records |
| Hostile paths, malformed proposals, vectors and auth | Denial and recovery | 23 negative/recovery checks passed, including credentials used against the wrong API | PASS: `mcpNegative` |
| Huge/malicious Markdown and traversal-looking atom title | No script execution or escaped write | 384,099-character output handled; generated title stayed in vault | PASS: hostile Markdown/title records |
| Eight desktop lifecycle cycles; repeated mobile cycles | Stable registrations and responsiveness | Commands 20→0→20, identical desktop event/ribbon counts; mobile 3 final cycles | PASS: lifecycle records |
| Popout note/menu/proposal/unload | Correct document ownership and clean disposal | Separate native document and six actions; unload removes commands | PASS: popout records |
| Reduced Android suite and full emulator restart | Survive native load/write/read/stream/unload | All eight final mobile cases passed after recovery | PASS: `mobileFinal` |

## 5. Defects found and fixed

| Severity | Reproduction and root cause | Fix / affected file | Regression / commit |
| --- | --- | --- | --- |
| High | HTTP 200 with empty content erased a real batch note. Response validation accepted empty strings. | Reject empty/whitespace buffered output in `api.ts`. | Two API cases; native desktop/mobile retests; `fb74d4f` |
| Medium | Malformed-only/empty SSE silently succeeded; content sharing an event with `finish_reason` was dropped. Completion returned before content/empty-result checks. | Consume final content before completion; reject a stream without usable text in `api.ts`. | Six API cases and native SSE retests; `fb74d4f` |
| Medium | Protocol-1 status response missing required fields displayed Companion as ready. Client validated only the common envelope. | Validate status and nonnegative safe-integer vault count in `companionSync/client.ts`. | Three client cases; native `INVALID_RESPONSE` retest; `4c448cb` |
| Medium | Real sync accepted finite doubles that overflow Float32, all-zero vectors, and underflow-to-zero vectors. Storage and query paths could not use them. | Validate Float32 finiteness and nonzero norm in `companion/src/protocol/schemas.ts`. | Three real-HTTP regression cases; native server negative matrix; `9b02015` |
| Low, test tooling | Repeating tests after production build resolved generated `main.js` instead of TypeScript source. | Explicit source import in `mainMenus.test.ts`. | Test→build→test sequence passes; `23aab51` |
| Medium | Two held atomizations created two atom files, but the duplicate-section guard omitted the second file's link. Atomic append alone did not cover generation side effects. | Share in-progress work per TFile in `main.ts`; retain atomic append. | Deterministic two-call test plus desktop/mobile one-generated-note and replay assertions; `4a0418a` |

These are defects found in the candidate; this pass does not claim every one originated in PR #21. No unrelated refactor, reduced feature, weakened rule, changed denylist, or new dependency was used to resolve them.

## 6. Note-write safety evidence

- **Normal replacement:** expected full result written; original frontmatter/other text preserved where the mock transformation was instructed to retain them. Flashcards retained original content. Arbitrary AI replacement is not claimed to preserve metadata it intentionally removes.
- **Nested backup:** actual `.ai-backup-<unique>/Projects/Alpha.md` contains the exact pre-operation content, on desktop and Android.
- **Same-basename collision:** separate backups for `Projects/Alpha.md` and `Archive/Alpha.md`; neither overwrote the other.
- **Backup failure:** scoped adapter-write exception prevented replacement; actual source bytes stayed unchanged.
- **Concurrent user edit:** HTTP barrier established that AI work had started; an independent Vault modification then survived the attempted replacement, on both platforms.
- **Rename:** renamed original remained intact and the stale path was not replaced.
- **File replacement:** deleting and recreating the original path with a different TFile preserved the replacement content.
- **Deletion:** removed file stayed absent after the held response was released.
- **Atomic append:** independent user append survived. Final concurrent atomization created exactly one atom, linked it once under one heading, and a later repeat created no duplicate. The initial unlinked-output reproduction is retained in evidence.

All barriers were explicit request-received/release synchronization, not timing guesses. The mobile recovery harness initially reused identical before/after text; that produced no real conflict and was corrected to start from distinct content before rerunning successfully.

## 7. Companion evidence

The real production server initialized SQLite, answered authenticated status/sync requests, mirrored a 97-note plugin snapshot, exposed seven MCP tools, and persisted proposals. Native approval/rejection UI was exercised in the popout. MCP had no claim/apply authority; sync credentials could not invoke MCP, and MCP credentials could not sync. Preview alone never mutated a note.

Missing status fields now produce `INVALID_RESPONSE`. Wrong dimensions, null, NaN/Infinity syntax, Float32 overflow, zero/underflow vectors, huge payloads, missing fields and hostile paths were rejected. A valid query immediately after negative cases succeeded. Controlled server stop produced a plugin error; restart with the same SQLite state restored readiness and sync. Both recorded server shutdowns exited 0.

The built-in real-process MCP smoke also passed five retrieval tools under both protocol versions, before and after SQLite-only restart. It made four query-embedding HTTP calls and zero stored-note embedding calls. All 87 running build files matched the final clean build. Inspection of 57 proxy-recorded requests found no provider-key transfer; only independent synthetic auth tokens were used.

## 8. Provider/network evidence

Normal JSON requests used actual Obsidian `requestUrl`. Streaming used actual renderer `fetch` on desktop and Android, with chunked Unicode output and clean completion. The mock allowed only the observed app origins (`app://obsidian.md` and mobile `http://localhost`); no application security header or CORS enforcement was disabled.

Provider classes were redirected to controlled local endpoints, so this establishes request construction and runtime behavior, not live vendor availability. OpenRouter-specific options and Ollama differences were checked. Embeddings used `/v1/embeddings` and Ollama `/api/embed`.

400, 401, 403, 429, 500, malformed JSON and timeout all failed without destructive replacement. Malformed-only streaming, premature disconnect, and final-event content were retested after the fixes. Existing tolerance of malformed noise between valid chunks and natural EOF with valid text remains. Runtime logs contained none of the five placeholder credential sentinels.

## 9. Lifecycle and log inspection

Eight desktop disable/enable cycles returned from 0 to 20 commands, with identical before/after Vault event counts, workspace event counts and one ribbon icon. Measured cycles took approximately 37–81 ms. Popout unload/reload and a complete desktop process restart passed. The final Android suite performed three further cycles with settings retained; final explicit unload left zero plugin commands. No uncaught plugin errors or reconnect storm was observed. No exhaustive heap/handle leak measurement is claimed.

Classified diagnostics:

- Electron's application-level CSP/unsafe-eval warning appeared on debugger connections; no plugin exception accompanied it and no CSP was changed.
- Node emitted the expected experimental SQLite warning. Companion logged expected sanitized warnings for deliberately denied proposals and invalid queries.
- Android emitted variation-seed, EGL fallback and WebView overlay diagnostics; the UI rendered and the final suite completed without JavaScript or Android application exceptions.
- Android also reported CPU-variant/JDWP, unavailable Bluetooth/Custom Tabs and predictive-back capabilities. Native resource-close warnings appeared in two bursts, together with rendering/frame/IME delays. The log has no allocation owner or stack, so these warnings cannot establish a plugin leak or be declared harmless. They remain an explicit limit on native resource/performance claims; the functional tests and registration counts passed. No smooth physical-device performance claim is made.
- The first Android **host emulator** exited with signal 11 after QEMU CPU-thread stall messages. Resource contention is suspected, not proven. It was restarted with one virtual CPU, the persisted vault and final bundle loaded, the complete final suite passed, and graceful emulator shutdown exited 0. This was not silently counted as a pass.
- Setup/harness failures included cross-device clone hardlinks, SDK package discovery, localized labels, wrong DOM/source-card selectors, modal document/stack selection, tied deterministic search ranking, stale editor state and the identical-content mobile fixture. Each affected check was corrected and rerun; these are distinguished from the six product/test defects above.

Desktop 1.12.7 and 1.13.7 processes closed with exit 0. Companion shut down with exit 0. Mock servers, isolated ADB and the emulator were stopped; the temporary SDK was removed.

## 10. Desktop/popout/mobile status

- **Desktop: NATIVELY VERIFIED** — actual Linux Obsidian 1.12.7 and 1.13.7.
- **Popout: NATIVELY VERIFIED** — actual separate Obsidian window/document, including final-build unload/reload.
- **Mobile: NATIVELY VERIFIED** — real Obsidian 1.13.8 on Android 15 in an OS emulator. This does not cover iOS, a physical phone, or every Android/WebView version.

## 11. Final automated verification

All commands below ran in the fresh `4a0418a` checkout. Exact exit codes, timing and paths are in `automatedVerification` and the retained logs. No stale build was used for the clean build or installations.

| Exact command/check | Result |
| --- | --- |
| `npm ci` | PASS; 352 packages installed |
| `npm ci --prefix companion` | PASS; 152 packages installed |
| `npm test` | PASS; **792 tests / 28 files** |
| `npm run build` | PASS; browser/CJS bundle and dependency metadata |
| `npx tsc --noEmit --module ES2020 --ignoreDeprecations 5.0` | PASS |
| `npm run lint` | PASS; 0 errors, 4 retained plugin advisories; Companion 0 warnings |
| `npm --prefix companion run typecheck` | PASS |
| `npm --prefix companion test` | PASS; **216 tests / 14 files** |
| `npm --prefix companion run lint` | PASS, zero warnings |
| `npm --prefix companion run build` | PASS |
| `npm --prefix companion run smoke:mcp` | PASS; five tools × two protocol versions × before/after restart |
| Bundle boundary, enforced inside build | PASS; 59 inputs, only `obsidian` external; Companion contributors limited to pure proposal types/content hash |
| `git diff --check` | PASS |
| GitHub CI for tested code `4a0418a` | Both push and pull-request verify jobs SUCCESS; [run](https://github.com/zinverno/vault-audit-AI/actions/runs/34882626017) |

The final documentation-only delivery head is checked separately in the maintainer handoff. Session-native scripts were also executed after the relevant fixes; their resulting records are retained rather than shipping a general-purpose vault-mutating test harness.

## 12. Remaining risk

- **Known code behavior:** no unresolved defect from this gate. Incremental streaming can retain partial output after cancellation; `requestUrl` timeout does not prove physical transport cancellation. Settings search lacks declarative definitions. These retained contracts/advisories were not broadened into unrelated rewrites.
- **Platform/coverage limits:** Linux desktop, real popout and Android emulator are covered. iOS, Windows/macOS, physical devices and old supported Obsidian versions are not. Every command's registration/start path was checked, but full Deep Audit/MOC generation and long-duration heap profiling were not exhaustive. Mock vectors test functionality, not retrieval quality. External Qdrant and paid vendor services were not exercised.
- **Hosted scanner:** no public rescan or new attestation was performed; the old public scorecard remains outside this gate's proof.
- **Dependencies:** fresh installs report seven root development-tool vulnerabilities (four moderate, three high), zero Companion vulnerabilities. Root runtime has no npm dependencies; no advisory fix/version upgrade was attempted in this bounded pass.
- **Official lint advisories:** exactly four remain visible: streaming `fetch`, settings declarative-search API, and two intentional hardcoded configuration-path denylist entries. The denylist was preserved.
- **Environment:** one host-emulator crash was recovered and documented; native test results are from completed runs, not an assumption that the emulator is universally stable.
- **Native diagnostics:** unattributed Android resource-close warnings and rendering delays remain documented. No functional failure or JavaScript exception accompanied the final scenarios, but native framework leak/performance behavior is not proven by this gate.

## 13. Merge recommendation

**READY TO MERGE**

The high-risk write, response-validation, vector and proposal boundaries have passing native/integration evidence and regression tests. All realistically executed final smoke scenarios pass, including Android and popout, and automated checks/CI are green on the tested code. Remaining limits are explicit and do not require another code audit of this change.

## 14. Next action

The maintainer should confirm the documentation delivery head's green PR checks and merge PR #21 when ready. Release/version/tag decisions remain a separate future action. This verification does not merge or publish anything.
