# R02 verification: retire diagram generation

Verification date: 2026-11-13. This is an unpublished development change, not a release or a Marketplace update.

## Revisions and scope

- Base: `05f4cdaeb9bf5aa092901f3e5079bb302b82e596` (`main`), checked again during verification.
- Runtime/test/harness source: `2245d74305adc32a0957c734091f487a04c3e615`. The following evidence commit changes documentation and evidence only; the exact PR HEAD is recorded in the PR description.
- #138 and #139 were independently verified merged. Public latest stable remains **2.3.1**, published 2026-11-02, source `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`.
- Development's **2.4.0** remains intermediate and unpublished. Package/manifest versions, lockfile, dependencies, `versions.json`, Recall, frozen evaluation fixtures, research stages and historical assets are unchanged.

The original checkout had unrelated untracked work and was left intact. Work took place in a separate worktree and branch from the verified main. No personal vault, installed user plugin, paid model, release, tag, deployment or next roadmap stage was used.

The [dependency audit and removal guide](studio-diagram-removal.md#dependency-audit-and-historical-evidence) identifies the ten deleted runtime modules and their callers. Removal includes structure/flowchart generation, preparation/preview, navigation/actions, owner registration/disposal, adapters/probes, endpoint metadata/schema routing and unused types/messages/styles. Shared Markdown transport, gates, Review, source guards, history/recovery and Community remain.

The [release policy](roadmap/vault-assistant-plan.md#release-policy-and-acquisition-work) is the owner's decision: accept all R01–R15 before one public release; no stable/beta/prerelease or Marketplace publication before that. Internal candidates and per-PR tests/docs/backups/migration checks continue. Every merge needs a separate owner decision; auto-merge stays off. A byte comparison confirmed the fixed product constraints and complete ordered R01–R15 unit section were unchanged.

## Final runtime files

These are the actual production files copied into disposable Obsidian vaults, not files downloaded from public stable.

| File | SHA-256 |
| --- | --- |
| `main.js` | `62c87dd88a66e613d46c96736c1bc6c2ddfd674b3df4404309cbf52033e83da9` |
| `styles.css` | `b12c11d1996525a0c99a804dcd80085fa138d75fe7e229caaef16ebc83e17267` |
| `manifest.json` | `245ce6bb637085a8582da5f2fce09e239969ea83db68262f67a0edef03ebecfe` |

## Automated checks

All results below were obtained in this R02 session against the final source; historical numbers are not substituted for new runs. Node 24.14.1, npm 11.11.0.

| Command/check | Result |
| --- | --- |
| `npm ci` | PASS; existing lockfile, no dependency update |
| `npm test -- studio --maxWorkers=4` | PASS: 297 tests / 12 files, including Community regressions |
| `npm test -- --maxWorkers=4` | PASS: 5,149 tests / 194 files |
| `npm run typecheck` | PASS |
| `npm run build` | PASS, production |
| `npm run lint` | PASS, zero errors; two existing fetch advisories in `api.ts` and `studio/community/transport.ts` |
| `npm run audit:proposals` | PASS outside sandbox: 5/5 mutations killed and every restored test passed |
| Native harness syntax, diff whitespace, changed Markdown links/anchors | PASS |
| Production import graph / compiled markers | 355 inputs; no `studio/diagram/` input, generator, adapter, plugin ID or diagram schema |

Four retirement regressions cover no installed-plugin probes, retained registration, ignored valid/damaged archives, absent routes/modules/CSS and removed schema/metadata transport. Before removal, three of these tests failed as intended; all four pass afterward. The Studio baseline was 468 tests / 15 files. The smaller final suite reflects deletion of retired feature tests; frozen output/provenance hash checks remain.

The final audit's first sandbox attempt returned empty child-test output and failed its own assertion. It is not counted as a pass; the unchanged audit was then run outside the sandbox and passed. `npm ci` reports 23 existing dependency advisories (17 moderate, 6 high); remediation is outside R02 and no audit-fix/dependency update was attempted.

[Final command log excerpts](r02-excalidraw-removal-evidence/checks.txt) include SHA-256 identifiers of the complete local logs. [Baseline dependency audit](r02-excalidraw-removal-evidence/dependency-audit.json) records the removed closure.

## Native acceptance

Results and captures are recorded in the evidence attached to this report. Checks use real Linux desktop Obsidian 1.13.7 / Electron 43.6.0 and fresh disposable vaults/profiles, with explicit plugin and full-process restarts. The optional coexistence run loads the published Excalidraw 2.29.0 assets into that temporary vault only.

| Final run | Observed result |
| --- | --- |
| [Without Excalidraw](r02-excalidraw-removal-evidence/native-without-excalidraw.json) | **PASS**: 66 checks, 12 synthetic loopback requests, zero captured renderer exceptions |
| [With installed Excalidraw 2.29.0](r02-excalidraw-removal-evidence/native-with-excalidraw.json) | **Overall FAIL** at the strict zero-exception gate; all 66 functional assertions completed, 12 synthetic requests, one host exception |
| [Community Library](r02-excalidraw-removal-evidence/native-community.json) | **PASS**: 47 checks, one synthetic model request, ten local catalog GETs, zero captured renderer exceptions |

The coexistence exception is `TypeError: t.webContents.getZoomFactor is not a function`; all three captured frames point to `app://obsidian.md/app.js` (`e.updateStatus`, `c`, `u`). The report retains the exception and failing gate. No Veynrel frame was captured, but the underlying host/third-party cause has not been isolated. This run is not advertised as a completely green native gate; no exception filter or product workaround was added.

| Required scenario | Direct observation on final files |
| --- | --- |
| Clean launch without Excalidraw | Plugin absent; Studio opens with no diagram owner/route/command, zero model/note read/write on passive opening |
| Launch with Excalidraw | Real 2.29.0 plugin loaded and hashed; same Veynrel capabilities and navigation; overall exception caveat above |
| Complete Markdown Studio workflow | Real consent, loopback production transport, immutable Review, separate-note creation; incomplete output cannot be applied |
| Review → Apply → History → supported Undo | Exact BOM/CRLF/YAML source bytes restored; editor guards, cancellation, receipt failure and explicit recovery exercised |
| Old diagram state/journals | Restored old view state opens safely; valid and malformed diagram archives ignored, zero archive reads; Markdown history usable |
| Existing drawings | `.excalidraw.md` and `.excalidraw` hashes identical before/after, with and without the optional plugin |
| Plugin and Obsidian restart | Disable/enable and full process restart; no automatic repeat writes; exact archives/drawings retained |
| RU/EN, themes, keyboard, narrow panel | Built-in dark/light × EN/RU × 390/1300 desktop widths; Library/History/Review/confirmation, exact clipboard fragments and native Enter confirmation |

The compiled bundle/import-graph assertions and no-probe registration test supplement the visible navigation checks: absence of a button alone is not the removal evidence. Captures: [legacy History with drawings still present](r02-excalidraw-removal-evidence/legacy-history-with-excalidraw.png), [EN dark narrow Library](r02-excalidraw-removal-evidence/library-en-dark-390.png), [RU light narrow confirmation](r02-excalidraw-removal-evidence/confirmation-ru-light-390.png). These are unedited native screenshots of synthetic fixtures.

Earlier attempts are preserved in [their separate record](r02-excalidraw-removal-evidence/earlier-attempts.json). An initial narrow-window assertion failed immediately after resizing; the harness now waits two animation frames and bounded layout readiness before the unchanged overflow assertion. A repeat passed without a CSS fix. An initial coexistence attempt later failed when the cancellation fixture's request did not reach loopback after restart (`network` row); its cause was not isolated. The final coexistence run completed that scenario. These earlier attempts used the pre-final bundle, before removal of two obsolete drawing mentions in shared timeout/cancellation messages; their successes are not substituted for final-file results.

No paid/live inference was performed. Loopback responses verify transport, consent, parsing, UI and write/recovery boundaries; they do not establish model quality. The Community catalog fixture is also served locally; this is not a new production HTTPS/catalog availability claim.

Community coverage includes explicit catalog load/inspection/install, installed provenance after restart, recipe execution through Runner/Review/Apply/Undo, locally modified update preservation, offline stale cache, delisting, damaged cache/origin state, RU/EN and actual default light/dark at 390/1200 pixels. The export-form check creates a local synthetic JSON package only; it does not publish anything. All original Markdown hashes were restored.

[RU light Community card at 390 pixels](r02-excalidraw-removal-evidence/community-ru-light-390.png). JSON attachments are curated extracts of complete local native reports; each records the original report's SHA-256. Exact synthetic fixtures and assertions are in the checked-in harnesses. Profiles, plugin settings and personal data are not attached.

## Legacy data

Valid intent/receipt records and a malformed archive under `studio/diagrams/`, plus existing `.excalidraw.md` and `.excalidraw` drawings, are staged with Veynrel disabled. After enabling, history inspection and Markdown operations, their SHA-256 values must remain identical, including after restarts. The native report retains before/after maps and archive-read observations.

There is no legacy migration, cleanup or silent conversion. Markdown History ignores the separate diagram namespace. [Exact archive locations, inspection/export and backup instructions](studio-diagram-removal.md#legacy-data-and-updating) explain how to retain records outside the UI. The existing Connections file-format filter remains passive; it is not an Excalidraw integration. Recall's R01 restoration requirements still apply to an older-version rollback.

## Limits

No Windows/macOS, physical mobile, custom theme, screen-reader speech, arbitrary third-party plugin interactions or external cross-process race coverage is claimed. Narrow desktop widths and keyboard actions are bounded checks, not a full accessibility certification. Public 2.3.1 remains unchanged and still offers the historical diagram workflow. The next version removes it; no replacement drawing feature is added.
