# Tools / Settings IA verification

Branch: `feat/product-ia-tools-settings` in `zinverno/veynrel`.
Preflight ran checkout main, fast-forward-only pull, porcelain status and HEAD.
Actual baseline: `4bd9f5048a9ef605c4d2396eb00bb7842b8568a7`; working tree clean.
Implementation through `14741697819b6893d5c8582a8025cb4e72cb9c33`.

## Automated checks

| Check | Result |
| --- | --- |
| `npm ci` | Passed; existing audit output: 4 moderate, 3 high advisories; no lockfile change |
| `npm run typecheck` | Passed, including strict Health project |
| `npm test -- health` | 828 tests / 37 files passed |
| `npm test -- semantic` | 347 / 17 passed |
| `npm test -- recall` | 557 / 20 passed |
| `npm test -- connect` | 50 / 3 passed |
| `npm test -- deep` | 103 / 5 passed |
| `npm test` | 2,325 / 95 passed |
| `npx eslint health semantic recall connect deep` | Passed, no warnings |
| `npm run lint` | Passed; retains one existing streaming `fetch` warning in `api.ts` |
| `npm run audit:proposals` | 5/5 mutation checks killed; restored tests passed |
| `npm run build` | Passed |
| `git diff --check 4bd9f5048a9ef605c4d2396eb00bb7842b8568a7..HEAD` | Passed |

Focused coverage includes final navigation, EN/RU rendering, Tools passive entry
and one-call actions, launcher failure/retry and detached-route guards, mounted
onboarding takeover, recovery, Settings summaries and setup reuse, independent
views, command compatibility, six context actions, 1.7/current upgrade fixtures,
settings inventory and modern/legacy parity, and the real flashcard producer
fixture consumed by native Recall. Existing Deep/Semantic/Connect save concurrency,
confirmation, batch backups and proposal mutation regressions remain green.

The Health dependency-boundary suite proves UI imports no plugin, transport,
legacy engine or note-writing implementation. Tools host tests verify the exact
existing Batch/Audit modal classes and RAG/MOC/report delegation. The source
inventory regression freezes 44 baseline control/helper/schema/default contracts;
all 35 setting rows and 27 durable UI keys remain represented.

Independent code review found a stale launcher-error message after a successful
retry. The fix clears it before retry; a failure→success regression passes. Review
of the corrected diff found no remaining material issue.

## Isolated native desktop

Host: **Obsidian 1.12.7 / Electron 39.8.10**, Linux desktop. Disposable vault/profile
under `/tmp/product-ia-smoke`, synthetic Alpha/Beta notes and saved audit clusters.
No personal credentials, live model inference or external Companion service.
Explicit index preparation used injected offline vectors. The real plugin,
controllers, modal classes, filesystem adapter, parser and DOM were used.

Installed public SDK inspected: **obsidian 1.12.3**. It has no supported typed
settings-tab navigation operation. Product UI displays the native path instead;
the smoke followed **Settings → Community plugins → Veynrel → Options gear**
and verified the original native setting tab. Opening it performed zero writes
or connection tests. Obsidian 1.12.7 exercised the legacy `Setting` renderer;
modern renderer parity is covered through its shared definitions/callbacks, not
claimed as a native 1.13 host run.

Final `main.js` SHA-256:
`c328274a8ee629cbf0f5a0f533198bb1bdd13316ae09a3b146dc9788c8074872`.
The workspace build and isolated installed copy matched. Other hashes and native
assertions are in [native evidence](product-ia-evidence/native.json).

| Native check | Observation |
| --- | --- |
| Final navigation | Health, Findings, Discover, Recall, Connect, Tools, Settings |
| Tools and Settings, cold and warm | Zero network/transport calls, Markdown enumeration/reads, writes, Health scans, Recall or Connect work |
| Batch action | Exact `BatchProcessModal`; existing preview enumerates notes but processes none |
| Deep Audit action | Exact `AuditModeModal`, including Single Audit; no Knowledge scan or Health receipt |
| Ask Vault action | Existing `AskVaultModal`; opening sends no query |
| MOC action | One generated note created from saved clusters, then existing generated note updated; no model request with saved descriptions |
| Settings | Deep Configured, Semantic Ready with model/vector count, Connect Configured, native Recall copy |
| Setup reuse | Existing Deep/Semantic choosers in Health and existing Connect route |
| Advanced tab | Six regrouped native sections, 35 rows / 27 keys, zero opening writes or tests |
| Compatibility | All 21 IDs registered; old panel, batch, Deep Audit and RAG commands executed successfully |
| Command palette | 15 available actions with no active editor; all contextual IDs remain registered; no stale/doubled product prefix |
| Context menu | All six original actions in the actual editor menu |
| Multiple views | Same controller, Semantic, Recall, Connect and tool adapter; independent routes |
| Close / reopen | Returns to Health |

Native counter objects record called operations; an empty object means all
instrumented counts remained zero. MOC writes can legitimately wake the existing
automatic semantic synchronization. That background work was settled before
passive measurements, and suspended in the final MOC fixture; opening a route did
not trigger it. No engine change was made for the test harness.

## Presentation and accessibility

[All 56 cases](product-ia-evidence/presentation.json) passed:
2 routes × EN/RU × dark/light × **320, 390, 768, 960, 1024, 1280, 1440px**.
Each checks view/section horizontal overflow, translation keys, credential hiding,
branding, one active nav item, heading hierarchy, real buttons, button height,
keyboard Tab focus with a visible outline, and passive IO. Representative native
screenshots were also visually inspected, including lower-page editor/reference
and Advanced Settings content.

| Example | Screenshot |
| --- | --- |
| Tools, EN dark desktop | [1280px](product-ia-evidence/tools-en-dark-1280.png) |
| Tools, EN dark narrow | [390px](product-ia-evidence/tools-en-dark-390.png) |
| Settings, RU light narrow | [390px](product-ia-evidence/settings-ru-light-390.png) |
| Editor catalog and product cross-references | [RU light lower Tools](product-ia-evidence/tools-ru-light-390-bottom.png) |
| Recall and Advanced Settings instructions | [RU light lower Settings](product-ia-evidence/settings-ru-light-390-bottom.png) |

Native mobile, popouts, screen-reader behavior, custom themes, native Obsidian 1.13
settings search/rendering, and live providers are not claimed. They remain release
hardening coverage alongside existing dependency advisories and the retained
streaming lint warning. Narrow desktop emulation is not mobile-platform proof.

## Delivery boundaries

No AI capability, engine, analyzer, prompt family, durable schema, migration,
command-ID removal, storage/manifest-ID rename, dependency change, version bump,
tag or release. The PR is intended to remain open/unmerged. Current architecture
and the complete legacy capability map are in [product-ia.md](product-ia.md).
