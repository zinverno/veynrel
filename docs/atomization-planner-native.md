# Atomization Planner v1 — native acceptance

PASS on the final plugin artifact in **real Obsidian 1.13.7 / Electron 43.6.0, Linux**. Base `main` was `c29bd847bfc8c264fe7f414ffb553958b2bb8bb4`, the merged PR #96. The branch does not change legacy `main.ts`, atomization settings, version or releases.

- [Complete native plans, observations, counters and assertions](atomization-planner-evidence/native-report.json)
- [Frozen PR #92 regression results](atomization-planner-evidence/regression-report.json)
- [Validation and exact build hashes](atomization-planner-evidence/validation.json), [artifact hashes](atomization-planner-evidence/sha256.json)
- [Contract, legacy comparison and future Apply/Undo crash design](atomization-planner-v1.md)

## Verification

| Gate | Result |
|---|---|
| `npm test` | 4008 tests / 153 files, including 98 new atomization tests |
| Typecheck | PASS, both configured TypeScript projects |
| Lint | PASS; existing `api.ts:404` fetch advisory only |
| Build | PASS; artifact SHA-256 `65b4ffa6448eb7917973c07e4ac92e6d2b20ab84c3ce73b6e8126ca64d80ffd1` |
| `audit:proposals` | 5/5 mutations killed; restored tests pass |
| `git diff --check` | PASS |
| Native atomization | 98 assertions, all PASS |
| Native previous copying paths | 64 Group + 118 Context Bundle assertions, all PASS |
| Native base inspector | 18 assertions, all PASS |

GitHub CI is checked on the published PR head; its live status is authoritative. Local evidence is not presented as a CI result.

## What ran

The isolated disposable vault contains synthetic notes only, no personal content and no real API credentials. Tests invoke the actual Pair Inspector, Change Planner UI/session, native TFile/MetadataCache/resolver and the production plan validator. Analyzer transport alone is scripted with disclosed controls. Its 30 calls supply existing analysis results for separate scenarios; **every planning path asserts no additional completion**. There is no claim about real model quality or semantic independence.

The dedicated `tests/fixtures/atomization-v1.json` covers a standalone fact, an entire conditional assertion, H1/H2/H3, conflicting versions, attributed and unattributed quotations, code, lists, links, unresolved embeds, a dependent paragraph, Unicode and CRLF. Native branches preserve exact source/context strings; the full source remains unchanged. Manual selections require the extra unchecked context consent. A standalone model hint still uses the full native range and ordinary context confirmation.

Native UI/lifecycle coverage includes:

- RU/EN, default light/dark themes, 1200/390 px, keyboard Enter to Build and caret/focus preservation while typing.
- Complete source, selected range, copied parent context, separately displayed added title/source link, complete future Markdown and unchanged remaining source.
- No Apply control or execution callback. Title/path changes alone never create a file.
- Empty confirmations, changes clearing all confirmations, cancel and reopening with blank source/title/path.
- Cancel, close and selection change during final source reread: released late results publish no plan and restore no UI.
- Loss of source MetadataCache: stale state, no fallback permission.
- Source edit after selection: Analyzer becomes stale and the planner is destroyed.
- Existing target, case-insensitive basename collision, unresolved-link capture, relative/ambiguous paths, hidden directory and missing parent: explicit refusal.

Unit tests additionally exercise tampered JSON, extra fields, source identities/ctime/mtime, full content, structure/cache/reference/resolver changes, dependency and analysis changes during verification, title injection, normalized collisions (including attachments), and existing links/embeds/frontmatter links/aliases. Fake cache fixtures are test-only; native acceptance uses Obsidian's actual cache.

## No-write and regression evidence

The native atomization counters are **0 Markdown writer calls, 0 Markdown adapter writes, 0 journal mutations and 0 observed network calls**. Every scenario pins the scripted Analyzer count before planning. File inventory plus SHA-256 snapshots of all Markdown and consolidation journal files are identical before/after the complete scenario: this also detects newly created Markdown files. The harness makes the explicitly recorded source edit and restores it outside the product; counters remain scoped to product calls. Settings writes for switching UI language and Obsidian's own workspace state are outside the Markdown/journal claim.

Instrumentation covers Vault writers, adapter operations for Markdown/journals, fetch/XHR and injected Analyzer/Decisions/Rerank transport paths. It is not OS-wide traffic capture. Production atomization modules expose no write, journal, Apply or completion port; source inspection complements these runtime counters. Only the two selected saved Markdown files are read during planning; the name/dependency inventory uses metadata.

The PR #92 corpus remains SHA-256 `dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8`. Its 24 original cases/control labels were not edited. Existing native Group and Context Bundle scenarios reran against those same inputs, including the original input-size gate, refusals, permitted plain copies and supported context copies. Offline Analyzer contract/metric tests ran in `npm test`. The old evaluation metric still marks `consider_atomize` as unavailable for **execution**; this read-only preview deliberately does not change that historical evaluator or its labels.

## Screenshots

These are unedited native captures. Full text panels scroll; complete strings are retained in the machine report.

| Surface | EN | RU |
|---|---|---|
| Light 1200 | [preview](atomization-planner-evidence/atom-en-theme-light-1200.png) | [preview](atomization-planner-evidence/atom-ru-theme-light-1200.png) |
| Light 390 | [preview](atomization-planner-evidence/atom-en-theme-light-390.png) | [preview](atomization-planner-evidence/atom-ru-theme-light-390.png) |
| Dark 1200 | [preview](atomization-planner-evidence/atom-en-theme-dark-1200.png) | [preview](atomization-planner-evidence/atom-ru-theme-dark-1200.png) |
| Dark 390 | [preview](atomization-planner-evidence/atom-en-theme-dark-390.png) | [preview](atomization-planner-evidence/atom-ru-theme-dark-390.png) |
| Selected context | [context](atomization-planner-evidence/atom-en-context.png) | [context](atomization-planner-evidence/atom-ru-context.png) |

[Path refusal](atomization-planner-evidence/atom-path-refusal.png).

## Reproduction and limits

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-atomization-NEW --context-bundles --structured-groups --atomization
```

The root must not exist. The harness uses `/usr/bin/electron43`, `/usr/lib/obsidian/app.asar`, its own profile and owned process. It never opens a real user vault or weakens Electron's sandbox. The initial sandbox launch failed with `sandbox_host_linux.cc:41 Operation not permitted`; the authorized native launch outside the command sandbox passed. [Run history](atomization-planner-evidence/harness-history.json) separates that environment failure, the earlier successful atomization run and the final combined acceptance.

390 px is desktop viewport emulation, not physical mobile acceptance. Other operating systems, screen readers, custom themes and live model quality were not tested. Unknown external dependencies and semantic independence remain user judgments. Future filesystem creation, crash recovery and Undo are documented design requirements only; they have no implementation or acceptance claim in this PR.
