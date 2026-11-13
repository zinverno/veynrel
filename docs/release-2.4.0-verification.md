# R01: Recall 2.4.0 candidate verification — 2026-11-13

Status: locally validated candidate; **not merged, tagged or released**. Auto-merge remains off. [Upgrade and recovery instructions](release-2.4.0-candidate.md) are part of the handoff. The original working tree, personal vault and frozen experiments were not modified.

## Source and scope

- Base: `becb982f8d789ab53bbec31a83952b818e70d4cd`, the current main when work began. Merged #136 is an ancestor; #137 is the base merge. Neither change was reimplemented.
- Planning contract: [PR #138 at 191353c](https://github.com/zinverno/veynrel/blob/191353ca856d52ba2be7e519e4cbee480e8638de/docs/roadmap/vault-assistant-plan.md), still an open draft when read. It was not merged into main or this branch. The supplied R01 task contract was also read.
- Runtime correction and tests: `9361413`. Three failing regressions and a native reproduction established that an unrecognized Vocabulary heading silently retired four existing vocabulary cards. Their schedules were retained in retired metadata, not deleted. The three-line parser correction marks this source incomplete; EN/RU guidance names the heading. Four new cases include intentional empty-section behavior.
- Separate version/documentation commit and packaged source: `f5fa83f769d76cb39aa737a884bb45f89824d8c8`. Later evidence-only commits do not change these runtime bytes. `SOURCE_COMMIT` in the package deliberately records the tested build source, not a future merge commit.
- R01 runtime callers remain the existing parser, source adapter and authoring validator. No API, storage schema, scheduler, dependency, default preview workflow or unrelated product feature changed. R02–R15 were not started.

## Published baseline and exact candidate assets

The downloaded [stable 2.3.1](https://github.com/zinverno/veynrel/releases/tag/2.3.1) includes `SOURCE_COMMIT` = `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`. Its published SHA256SUMS verified all three runtime files and the source marker. GitHub asset digests agreed. Main already containing Recall #136/#137 is a separate fact from their absence in stable 2.3.1.

| File | Stable 2.3.1 SHA-256 | Candidate 2.4.0 SHA-256 |
| --- | --- | --- |
| main.js | `8df93c1a160b5c6ef322857fb5c3c3fae2e76c4ed905ecc1bd729da0a23a5740` | `b032fe7fcc2df3622e9648516ab28b4bd0172e50789ad25523db8175c92d38e6` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` | `ba93cd6f9414354baeabfbd139f3e683a5179e2e453791abaeb511c4f738e4e5` |
| styles.css | `664302cd8a51b2cf693f77df3e644e9d746c0279a8ea50408181679a6d5314fa` | `4cb735511f12b3f964f4aeb93da65dcbf4c71b584b8ddb74e6924c6ab78f1acb` |

The package contains exactly those three runtime files, SOURCE_COMMIT and SHA256SUMS. Both final native runs installed from a separately extracted ZIP, whose contents verified against the checksums. The post-lint build matches those extracted runtime bytes. ZIP `veynrel-2.4.0-rc-r01.zip` SHA-256: `450eb439c695d26073b04fdd5fe01a048adcbc52c8acdda1e1da3fb575bdaf37`.

## Checks performed in this session

Environment: Linux, Node 24.14.1, npm 11.11.0. These results were newly produced; prior reports were used only to locate existing contracts and harnesses.

| Check | Result |
| --- | --- |
| Clean lockfile installation, `npm ci` | PASS; advisory findings below |
| Baseline Recall + release compatibility | 648 tests / 25 files passed |
| Missing-heading regression before fix | 3 failures reproduced; positive empty-section case passed |
| Fixed Recall + release compatibility | 652 tests / 25 files passed |
| Final version compatibility | 7 tests passed |
| Full suite, `npm test -- --maxWorkers=2` | 5,320 tests / 197 files passed |
| `npm run lint` | PASS: both TypeScript projects, production build and Obsidian lint; two existing fetch warnings retained |
| `npm run build` | PASS; packaged hashes above |
| `npm run audit:proposals` | 5/5 mutations killed; every restored test passed |
| Final ZIP structure, extraction, checksums and build equality | PASS |
| Final native fresh install | 45 checks passed; zero runtime exceptions |
| Final native stable upgrade and recovery | 51 checks passed; zero runtime exceptions |
| Post-run persisted files | Independent direction schedules, one active Reading/partial-result card per note, preserved adjacent typing and no duplicate generated block verified |
| Git diff and privacy review | Scoped runtime correction, tests/harness, version metadata, English documentation and synthetic evidence only |

The two retained lint warnings are `api.ts` (streaming fetch) and `studio/community/transport.ts` (bounded/redirect-controlled fetch). Their allowance was not changed.

`npm audit` reported **6 high and 17 moderate**, zero critical, in the existing development dependency tree. High findings affect brace-expansion, fast-uri, js-yaml, nanoid, source-map-js and Vite. Every affected installed node is marked dev in the lockfile; esbuild's runtime input list contains no `node_modules` files. This does not make the tooling advisory-free. No dependency was upgraded: a structural lockfile comparison proved that only the two root version fields changed. The tooling findings remain an explicit follow-up for a separate publication decision.

## Native evidence and R01 acceptance

Native Obsidian **1.13.7**, Electron **43.6.0**, Linux desktop. Reports: [fresh install](release-2.4.0-evidence/native-fresh.json), [stable upgrade, repeated run](release-2.4.0-evidence/native-upgrade.json). Each run made eight synthetic loopback generation requests. The two linked reports have zero captured runtime exceptions, checked separately from the harness's functional assertions. The first upgrade attempt is retained below. Selected screenshots are committed; the full captures are retained in the local handoff. No live provider, paid inference or role experiment was used.

| R01 criterion | Evidence and boundary |
| --- | --- |
| Legacy database backup/migration; progress through reorder, retag and observed move | Stable's real published binary created a v3 store with two cards, including reviewed and retired history. Candidate loading preserved original settings/store bytes. Injected backup failure blocked mutation; retry produced one exact original-byte backup before v4 persistence. IDs/schedules survived move/retag; vocabulary reorder/direction toggles and restart preserved schedules. v1/v2 coverage is automated fixtures, not native upgrades from every release. |
| Native insertion, Undo, queue refresh and Redo without losing adjacent edits | Both editor and Reading view ran production authoring/transport/parser/store. Saved files were compared to editor contents; real keyboard Undo/Redo retired/reactivated the queue. Typing before and after generation remained separate. Reading view activated editing before insertion. Process restart retained data. |
| Unsupported vocabulary diagnosed; valid pairs work without a model | Misspelled/absent section reports the note without retiring existing cards; malformed pair reports `Words.md:11`. Native imports and direction checks made no additional model requests. Parent topic excludes db2. [Diagnostic screenshot](release-2.4.0-evidence/invalid-vocabulary-line.png). |
| Exact source/assets; fresh install and published-stable upgrade | Both final scenarios used the extracted candidate above. Fresh install started without data.json or a Recall store, then configured synthetic transport. Upgrade preserved settings and hotkeys, exercised migration and recovered from failures. Old stable refused v4 without rewriting it; complete pre-upgrade snapshot restoration recovered the exact old card objects and settings. |
| Keep evidence boundaries and spending constraints | Synthetic standalone questions demonstrate the workflow only. Live educational/factual quality was NOT TESTED. No paid call, personal-vault installation, merge, release, tag or deployment. |

An injected Recall-store failure left generated Markdown saved and reported a partial result. Retry loading followed by Refresh admitted it without regeneration and preserved previous schedules. [Partial-result screenshot](release-2.4.0-evidence/partial-metadata-failure.png). Empty/malformed/incomplete output, changed sources, long inputs and explicit selection retain their existing unit/native guards.

The final post-upgrade state is preserved separately before the rollback exercise. Restoration uses the full stable snapshot, not a binary swap or a fabricated reverse migration. The automatic pre-v4 file alone is not a complete downgrade backup and contains no post-upgrade reviews.

## Failed attempts and limits

The original main passed the existing 36-check native harness, then failed the new heading case as expected. A preflight initially over-required `needsRecovery=true` for a write failure; the actual supported result was partial + unavailable with Retry guidance. Another preflight compared schedule JSON strings and failed because reload canonicalizes key order; deep object comparison then passed. These were harness corrections, not runtime fixes. A subsequent 51-check preflight passed before the separate version commit; the final candidate was then tested again in both packaged scenarios. Sandbox child-Git checks required approved host execution; mutation audit likewise ran on the host in its disposable directory.

The [first packaged upgrade attempt](release-2.4.0-evidence/native-upgrade-attempt1.json) passed all 51 functional checks but captured `TypeError: t.webContents.getZoomFactor is not a function`. Its stack contains only Obsidian `app://obsidian.md/app.js` frames; the trigger was not established. This was not treated as a clean run. Repeating the unchanged ZIP in another new profile passed all 51 checks with zero exceptions. The initial host exception remains a disclosed limitation; no speculative host/runtime fix was made.

No physical mobile, macOS/Windows, legacy CM5, screen reader, custom theme, offline move inference, arbitrary Sync conflict, power-loss atomicity or minimum-Obsidian-version certification is claimed. EN/RU, both built-in themes and 320/390/1280-pixel desktop widths passed. Full native context-menu/batch UI routes were not rerun; their shared authoring and route guards have automated coverage. No new live-model quality result exists.

The local candidate is ready for owner review of this evidence and the update/recovery procedure. GitHub CI, merge approval, actual release-source rebuild, tag/release publication and provenance attestation remain separate gates; this report does not turn them into completed actions.
