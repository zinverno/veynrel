# Veynrel 1.9.0 release candidate

This branch prepares version **1.9.0** of the existing `ai-knowledge-hub` plugin. It does not publish a release, create a tag, or upload release assets. The redesign is complete; this change adds release documentation, published-artifact upgrade fixtures, version consistency checks, a bounded settings-durability fix, and missing English localization for existing Advanced controls.

## Baseline and published comparison

- Repository: `zinverno/veynrel`; branch: `chore/release-1.9.0`.
- PR #47 was already merged at `2026-09-24T18:23:23Z`. After `git checkout main`, `git pull --ff-only`, and an empty `git status --porcelain=v1`, the actual baseline was `9818f2a1dc1df4fe744f9edc3c53717e6ca5232c`.
- The latest published release is [1.8.0](https://github.com/zinverno/veynrel/releases/tag/1.8.0), published `2026-09-15T18:26:58Z`. Its annotated tag object is `4be60a16f74331107e6f532bf93b7dcf89c95a95`; its peeled commit is `21a1b83afd0ddf4650ebbeced947fb0d424c3f6e`.
- GitHub release metadata and remote tags showed no published/tagged `1.9.0` or `v1.9.0`. An unrelated old draft is not a published release.
- The user-facing comparison is **published 1.8.0 → this candidate**, not just the last merged PR. See the [draft release notes](releases/1.9.0.md).

| Area | Already published in 1.8.0 | 1.9.0 delta |
| --- | --- | --- |
| Identity and installation | Veynrel branding, same plugin ID, normal update path | No new plugin or reinstall |
| Semantic discovery | Indexing, search, related notes, duplicate candidates, RAG, incremental synchronization | Discover and Semantic Intelligence setup; explicit duplicate Findings integration |
| Health | Legacy audit/report workflows | Four dimensions, deterministic checks, Findings Inbox/lifecycle, scoped reconciliation receipts, onboarding/recovery |
| Recall | Explicit AI-generated Markdown cards | Native inventory, FSRS-6 schedules, review/reveal/four ratings, Recall Health, authoring-to-inventory bridge |
| Knowledge | Deep Audit note cache, Single/Batch audit, clusters/MOCs | Deep Intelligence setup and confirmed LLM-assisted underdevelopment signals; no truth-verification claim |
| Companion | Mirror, MCP reads/search, proposed changes with Obsidian approval | Dedicated Connect setup/status/confirmation surface; same protocol 1 |
| Product organization | Commands, editor actions, native provider/settings controls | Health / Findings / Discover / Recall / Connect / Tools / Settings; existing workflows retained |

## Version and release files

`npm version 1.9.0 --no-git-tag-version` used the existing version script. `package.json`, the package-lock root/package entry, and `manifest.json` are `1.9.0`; `versions.json` maps `1.9.0` to `1.8.7`. The plugin ID, author, funding URL, command IDs, and storage paths are unchanged. The manifest name remains **Veynrel**, and `isDesktopOnly` remains `false`.

**Minimum remains 1.8.7.** The official Linux 1.8.7 distribution (Electron 33.3.2) ran the candidate, including navigation, local Health, native Recall, persistence, reloads, and legacy settings. No runtime evidence required raising the minimum.

The public release asset set remains exactly **`main.js`, `manifest.json`, `styles.css`**. Build metadata and the evidence below are review material, not release assets. Generated `main.js` and `.esbuild/` remain ignored under the established workflow.

| Asset | Candidate bytes | Candidate SHA-256 | Published 1.8.0 bytes |
| --- | ---: | --- | ---: |
| `main.js` | 765344 | `ef5a1deff49120e1fa730c5bcf75d6399f773730523d69ac9392ac841e078c32` | 424254 |
| `manifest.json` | 349 | `b018c1d54c7a94044007f80e25a330f20e0ebdea9597e3bd56e3a8570489ac9f` | 350 |
| `styles.css` | 66344 | `16ca3bf971baf678a13302ab66c47c938ba6c8928fe5af96d16e31b92660247e` | 52071 |

The increased bundle contains the integrated redesign. There is no arbitrary size target. The esbuild audit covered **162 production input modules**: no test fixtures, evidence/screenshots, Python/golden data, development packages, or synthetic credential markers; the only external runtime import is `obsidian`.

## Actual 1.8.0 upgrade

Downloaded all three published assets and matched their SHA-256 hashes to GitHub's asset digests. Installed them into an isolated synthetic Obsidian vault, seeded non-default settings, distinct synthetic LLM/embedding/Companion credentials, hotkeys, output folders, notes, and a binary user-data sentinel. The actual published code generated supported flashcards, wrote and searched a semantic index, and persisted Deep Audit records and clusters.

The fixture was frozen before upgrade. A fresh copy received **only the three candidate release assets**, followed by manifest refresh and plugin reload in native Obsidian 1.13.7. The frozen originals were not changed to satisfy assertions. The [checked-in fixture and provenance](../tests/fixtures/upgrade-1.8.0/provenance.json) retain published settings, index bytes, cache, commands, and generated Markdown; [native results](release-1.9.0-evidence/results.json) retain the preservation checks.

| Upgrade contract | Result |
| --- | --- |
| ID, enabled state, hotkeys | PASS; same ID, enabled/hotkey JSON byte-identical; the historical Ctrl+Shift+Y hotkey opened its existing batch panel in native Obsidian |
| Durable settings | PASS; all old values loaded exactly, including provider/model/tuning, independent credentials, output folders, language, Semantic settings and Companion identity; passive load did not save `data.json` |
| Commands/context actions | PASS; all 20 published IDs retained, 21 current IDs unique; six historical editor actions present once with `showContextMenu`, absent after disabling it and reloading |
| Semantic index | PASS; published descriptor/binary bytes unchanged; load did not rewrite either file; search succeeded without rebuilding; Discover recognized Ready; explicit Connect sync reused the index |
| Deep Audit cache | PASS; `note-index.json` unchanged on upgrade and usable by Single Audit/MOC; not counted as trusted Knowledge Health coverage |
| Companion | PASS; `enabled`, `endpoint`, `token`, `timeoutMs`, `vaultId` retained; protocol 1 unchanged |
| Notes and user data | PASS; byte-identical notes, folders/data sentinel, index/cache and configuration preservation checks (14 unchanged files besides the replaced assets and settings later changed explicitly) |
| First Health opening | PASS; missing stores are valid. Existing users intentionally see optional profile onboarding; Skip saves only new Health preferences and runs no scan. No historical usage inference or note migration |
| First Recall opening | PASS; missing `recall/cards.json` is valid; no automatic Markdown discovery or store creation. Explicit Find discovered four cards produced by 1.8.0; reveal and all ratings persisted |

An initial negative fixture used bare `Question::Answer` pairs outside a Flashcards section. Those are unsupported and were correctly ignored without changing notes. The separate positive fixture used the actual published generator to create `## Flashcards`; the negative original remains untouched. Discovery supports the documented section grammar, not arbitrary third-party card formats.

Supported update paths are the normal Community Plugin update and manual replacement of the same three assets in the existing folder. Installation instructions were checked against this actual asset replacement, unchanged ID and release conventions. **The hosted Community update offer for 1.9.0 is unverified until publication**, which this PR deliberately does not perform. Existing 1.7.0 compatibility tests also remain passing; the primary native release test is 1.8.0 → 1.9.0.

## Recall schema and scale

| Format | Automated current-candidate result |
| --- | --- |
| v1 inventory | Loads in memory; original cards retained; native scheduler defaults established without writes; next explicit mutation writes v3 |
| Canonical v2 | Loads schedules unchanged; zero load-time migration writes |
| Merged transitional v2 | Actual synthetic native fixture loads; schedules and full-inventory marker retained; first explicit v3 mutation preserves all seven cards |
| v3 | Round trips schedules/coverage and remains unchanged on load |
| Future schema/scheduler | Blocked; original bytes preserved, no coercion or automatic reset |

Evidence is in `recall/store/migration.test.ts`, `schemaV3.test.ts`, `codec.test.ts`, `review.test.ts`, and `obsidianRecallStorage.test.ts`, all rerun in the **557-test Recall suite**. This schema matrix is automated storage/service verification, not four separate native UI migrations.

The deterministic large vault added **1,000 Markdown notes**, each with two resolved links, one unresolved link, and four supported cards. Including the small synthetic action fixture, it contained **1,008 notes, 1,016 Findings, and 4,006 cards**. No personal vault or expensive live provider was used. Obsidian's metadata cache was allowed to finish loading; a prior cold-cache run correctly reported partial coverage and was not counted as a complete scan.

| Native Linux 1.13.7 measurement | One observed run |
| --- | ---: |
| Local Health | 925 ms |
| Construct/layout 1,016 Findings | 222 ms |
| Filter / open detail | 212 / 211 ms |
| Recall inventory refresh | 392 ms |
| Recall review/save | 190 ms |
| Largest sampled event-loop gap | 684 ms |
| Observed renderer JS heap | 63,370,814 bytes |
| DOM nodes in the measured view | 5,109 |

These final-bundle timings measure native DOM construction and synchronous layout, not paint completion. Background-window animation-frame pauses contaminated an earlier timing attempt; that attempt was excluded. Counts, deterministic filters, details, due summaries, review and persistence passed. The existing 10,000-card cap remains. This is coarse single-machine evidence, not a latency or memory guarantee. Findings currently render their list without pagination; 1,016 rows were usable here, so no speculative rendering architecture was added. Existing quadratic semantic duplicate comparison was not benchmarked across the large vault and is not presented as scalable to arbitrary vault sizes.

## Platforms, settings and presentation

| Surface/platform | Coverage |
| --- | --- |
| Linux Obsidian 1.8.7 / Electron 33.3.2 | Official complete desktop distribution; plugin load, seven routes, local scan, inventory/reveal/ratings/persistence, three re-enable cycles; legacy native settings |
| Linux Obsidian 1.13.7 / Electron 39.8.10 | Published-artifact upgrade, integrated actions, modern settings window, large vault, popout, recovery, unload, presentation |
| Android 15 / API 35 x86_64 emulator, Obsidian 1.13.8 | Real APK/WebView execution; seven product routes and Connect presentation, local Health, explicit Recall inventory/review/reveal/four ratings/persistence; 390×844 and 320×844; three re-enable cycles |
| Workspace popout | Real second native document; same Health, Semantic, Recall and Connect owners, view-local routes, shared session and one active Recall review view; subscriptions/DOM cleaned when closed |
| Other platforms | Physical Android, iOS, macOS and Windows unverified in this run |

The final bundle repeated the desktop upgrade/actions/passive matrix, modern settings/search, layouts, lifecycle, recovery, popout, keyboard and scale checks. The full minimum-desktop/Android action matrices and archived 14-file hash comparison preceded the final translation-only change; final asset replacement repeated load/navigation on those platforms and preserved settings and card bytes. Exact artifact scope is retained in the evidence JSON.

Mobile Connect did not require a localhost server and did not attempt a phone-to-Companion network call. Keyboard-only claims apply to desktop only. The mobile result is emulator coverage, not a claim of universal mobile behavior.

Modern native search returned specific Veynrel rows for Deep Intelligence, Semantic, Companion, Connect, MCP, MOC, Atoms and Insertion; choosing a result opened the correct tab. Recall has no Advanced control and intentionally has no Advanced search result. Both native settings hosts retained **35 rows / 27 durable bindings**, product group labels, three password inputs, one settings tab, working update callbacks and language switching. Shared-settings concurrency and failed-save behavior are covered by the real callback/queue regressions plus the existing Deep/Semantic/Connect suites. Those concurrency cases are automated; they are not claimed as simultaneous manual input in two native settings windows.

The integrated presentation matrix passed **112 cases**: seven routes × EN/RU × default dark/light × 320/390/768/1280 pixels. A further **64 cases** covered provider forms, Knowledge confirmation, Health/Recall recovery and confirmations at the same widths/themes. No horizontal overflow or inaccessible primary action was observed. See [route measurements](release-1.9.0-evidence/presentation.json), [setup/recovery measurements](release-1.9.0-evidence/setup-presentation.json), and representative desktop/mobile screenshots in that directory.

Accessibility checks include native Tab traversal and visible focus, Space to reveal an answer, focus moving to a real rating button, headings, one `aria-current` navigation item, separate polite live regions and `aria-busy`, actual confirmation controls with Cancel initially focused, plus automated focus restoration/review guards. **No screen-reader harness was available; this is not screen-reader certification.** Only default dark/light themes were tested; no universal custom-theme claim is made.

EN/RU primary routes and settings showed no raw translation keys. FSRS, MCP, provider/model IDs and paths remain technical names. Existing translations now cover the custom-provider label, model label, accessible name, API-key placeholder and filename-template description; missing English Companion descriptions were added. A regression checks English row metadata across all five providers. Some pre-existing legacy Deep Audit progress messages remain Russian in the English workflow; this is recorded below rather than described as complete legacy localization.

## Passive IO and explicit action matrix

Startup may read `data.json` and saved feature metadata. Opening Health/Findings loads findings/history metadata; Recall initializes its saved card metadata; Discover/Connect/Settings may inspect cached/configuration metadata. These are not zero-disk-IO claims. Passive startup and all seven routes made **no Markdown reads/enumeration, provider/Companion requests, index building, scans, or plugin writes** in the upgrade probe. Obsidian's own workspace layout writes were distinguished from plugin persistence.

| Explicit action | Current verification |
| --- | --- |
| Local Health | Native small/large vault and automated completeness/reconciliation contracts |
| Semantic setup/index/search | Actual published index production + current compatible-index search/reuse; current provider setup/indexing integration tests and native setup surfaces |
| Semantic Health | Native completed scan; real-runtime integration asserts no provider calls or note mutation |
| Deep setup / Knowledge Health | Native connection check and confirmed complete deterministic MAP analysis; no truth-verification claim |
| Recall Find / authoring / review | Native explicit discovery, selected-note generation/append/ingestion, reveal and all four ratings; native Android review |
| Connect test/sync | Native deterministic protocol-1 status/plan/batch transport and reuse of compatible published mirror input |
| Proposal review/apply | Native list/preview performs no Markdown write; explicit Approve uses one guarded `Vault.process`; sibling wire tests also cover rejection/conflicts |
| Tools batch | Actual one-note deterministic generation, backup/replacement/report |
| Tools Deep Audit | Native Single Audit persisted cache; a changed source then completed Batch audit and generated report/Canvas |
| Tools Ask Vault | Native retrieval plus actual streaming parser over injected SSE; source context and correct provider credential asserted |
| Tools MOC / legacy output | Generated MOC from published saved cluster without an LLM call; Deep report/Canvas remained functional |

Providers/transports were injected only in the isolated test harness. No production endpoint or provider implementation was replaced. Live provider calls are unverified and are not required for correctness. No personal credentials were inspected or printed.

## Storage, failure and lifecycle boundaries

The [README storage table](../README.md#local-data-locations) documents `data.json`, optional `semantic-index/`, legacy `note-index.json`, additive `health/`, and optional `recall/cards.json`. They need not all exist. Native scoped recovery preserved unrelated settings, indexes and schedules; Semantic corrupt metadata remained byte-identical and visible as an error. Automated tests additionally cover incompatible descriptors, future schemas, unreadable data and interrupted writes.

| Injected failure | Verified behavior / test owner |
| --- | --- |
| `data.json` | New real-settings-callback regressions reproduce the old leak of a failed Advanced edit into a later Health save. Rollback now retains last acknowledged settings, nested control references and newer queued edits; Semantic reconciliation waits for the matching durable configuration. `releaseSettingsDurability.test.ts`, Deep/Semantic/Connect settings suites |
| Health findings | No optimistic Finding publication; failed mutation remains retryable/blocked as appropriate. `health/store/reconcileBatch.test.ts`, `health/obsidian/healthPluginController.test.ts` |
| Health history | Prior history retained, committed Findings distinguished from an unsaved receipt. `health/store/persistence.test.ts`, integrated service/controller tests |
| Recall cards | No optimistic rating/schedule; failed/partial storage is blocked and bytes retained for explicit recovery. `recall/store/review.test.ts`, `recallStore.test.ts`, `obsidianRecallStorage.test.ts` |
| Semantic persistence | Failed binary persistence does not publish a new generation; writer barriers and stale lifecycles remain guarded. `semantic/semanticConcurrency.integration.test.ts`, vector-store persistence tests |
| Markdown authoring | Provider/invalid-output/Markdown failures do not ingest; Markdown success plus Recall failure reports partial success and retains old schedules. `recall/authoring.test.ts`, existing guarded-write tests |
| Proposal application/ack | Guarded write failures, stale claims, verification failure and lost completion acknowledgement remain distinct; same-session acknowledgement retry does not repeat the Vault write. `proposals/application.test.ts`, sibling smoke and five proposal mutation tests |

The failure matrix above is deterministic unit/integration injection. Native recovery and in-flight unload were exercised separately; physical power removal was not simulated.

These boundaries are **not fully crash-atomic**:

- Health Findings and scan history are separate writes. A completed Findings commit may outlive its missing history receipt; absence-derived conclusions require matching coverage/receipt evidence.
- Recall writes one file through the adapter. A process/OS interruption can leave truncated JSON; reload blocks it and explicit recovery preserves a backup. There is no journal or fsync guarantee.
- Settings rollback describes the last acknowledged save in memory; an interrupted underlying `saveData` write is not repaired by a crash transaction.
- AI authoring commits Markdown before Recall ingestion. A partial outcome can leave useful cards in Markdown with the previous Recall state; explicit Refresh repairs inventory.
- Proposal Vault mutation precedes server acknowledgement. Same-session receipts support acknowledgement-only retry; across restart, immutable base/absence checks prevent blindly applying the same change again. Inspect the real note if acknowledgement was lost.
- Semantic temporary/backup replacement and recovery protect ordinary failures, but they are not advertised as a cross-file power-loss transaction.

Native plugin disable/re-enable while Local Health, Semantic search, Knowledge analysis, Recall save, authoring, Connect test and Connect sync were held in flight caused no product UI resurrection. Obsidian may keep its own **Plugin no longer active** tab placeholder. Already-issued adapter writes or `requestUrl` transports can finish; cancellation guards prevent later work/publication where applicable. Three additional cycles kept 21 commands, one ribbon, one tab, one registered view, 36 plugin cleanup registrations, and observed workspace/vault listener counts stable.

## Privacy and network review

| Path | Permitted content/credential |
| --- | --- |
| Local Health / Recall scheduling | Local note analysis or saved schedules; no provider credential or network |
| Embedding indexing/sync | Intended chunks to the selected embedding endpoint, using only embedding credentials |
| Semantic query / Ask retrieval | Query embedding; Ask sends only validated retrieved source context plus the question to the configured LLM |
| Deep / Knowledge / authoring / writing | Explicit task input and bounded eligible notes to the selected LLM; local scheduling and Findings are not forwarded |
| Companion | Disclosed paths/content/chunks/vectors/descriptors, status and proposal traffic; only Companion bearer token |
| External MCP | Separate server-side credential; not managed or exposed by the plugin |

Native transport assertions and sibling protocol tests verify separation: no LLM/embedding keys in Companion payloads/auth, no Companion token at AI endpoints, and no plugin-managed MCP token. Explicit model-list/test controls also make requests. Enabled existing synchronization may follow later Markdown/index activity; opening routes does not initiate it. Proposal preview is inert text and direct external Vault writes remain unavailable through this workflow. See the updated [README privacy section](../README.md#privacy-and-data-flow) for storage, backups, remote endpoints and downstream Markdown renderer behavior.

## Verification and dependency audit

Required checks were rerun on the candidate:

| Check | Result |
| --- | --- |
| `npm ci`, `npm run typecheck` | PASS |
| `npm test -- health` | 828 / 37 files |
| `npm test -- semantic` | 347 / 17 files |
| `npm test -- recall` | 557 / 20 files |
| `npm test -- connect` | 50 / 3 files |
| `npm test -- deep` | 103 / 5 files |
| `npm test` | 2,335 / 96 files |
| Focused ESLint and `npm run lint` | PASS; zero errors, one intentional streaming `fetch` warning at `api.ts:402` |
| `npm run audit:proposals` | PASS; five of five mutants killed |
| `npm audit --omit=dev` | Zero production findings |
| `npm audit` | Seven development-package findings: four moderate, three high; expected nonzero audit exit |
| `npm run build`, bundle audit, diff whitespace check | PASS |

Affected development packages: `@vitest/mocker`, `vitest`, `esbuild`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`. They are tooling-only and do not appear in the plugin bundle. No blind dependency upgrades were made. The reviewed browser `fetch` exception remains necessary for streaming; buffered requests continue using `requestUrl`.

Clean-clone reproduction and scanner install results are recorded in `release-1.9.0-evidence/builds.json` after final-head verification. The two CI-owned scanner consumers are npm **10.9.2** and **11.11.0**, with Node 24. Independent clean `npm ci` / production builds must match the asset hashes above. Final PR checks must be green on the exact submitted HEAD; the handoff records that SHA and CI URLs.

Sibling compatibility uses the clean current Companion checkout at `62ff1b6ed0fd04290e6ab00216d5c6b51d94db5c`, with `VAULT_AUDIT_COMPANION_DIR` pointing to its existing local directory. The existing ten-case wire smoke covers protocol/authentication, mirror reconciliation, MCP retrieval/search, proposal approval/rejection, unsafe vectors, errors, disconnect/restart and credential separation. No new server deployment is required solely for plugin 1.9.0.

## Release disposition

**BLOCKER:** none found in the tested candidate. CI and exact-head clean builds remain mandatory handoff checks; a failure there blocks the release-preparation PR from being considered verified.

**NON-BLOCKERS:** development-only npm advisories; the one intentional streaming lint warning; documented non-crash-atomic writes; optional profile onboarding for existing users; full rendered Findings list at the measured scale; existing quadratic semantic duplicate search. Pre-existing legacy Deep Audit progress includes some Russian diagnostic strings in English, and a fully fresh cache yields a “no files analyzed” notice instead of a new Batch report; a changed-note audit and existing MOC/cache paths work. These are deferred legacy polish, not new redesign features.

**UNVERIFIED:** live AI providers and real external TLS/network deployments; physical phones/iOS/macOS/Windows; custom themes; actual screen-reader output; physical power-loss behavior; Community catalogue delivery of the unpublished 1.9.0 update. No unsupported platform or certification claim is inferred from `isDesktopOnly: false`.

No Hidden Connections, alternate analyzer, Recall optimization/decks/limits/analytics, new MCP tools, new providers, or recommendation system was added. The release-note draft is [Veynrel 1.9.0](releases/1.9.0.md). The PR must remain open and unmerged, with no tag or release publication.
