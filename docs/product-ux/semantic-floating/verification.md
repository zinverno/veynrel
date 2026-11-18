# Semantic routes and floating actions in Obsidian

The dependent branch starts at #157, `e097e3e477085f42cee1d058bfe0c90e5bff4265`. The production code tested here is `647cebab6bbab9028ae99713e7436a592df17681`. The two full native receipts use `cd061b7f75acc6766930481713e152797d79935b`, which adds synchronization to the synthetic provider. The runtime files have identical bytes on both commits. The PR body records the final review HEAD.

## Install in a disposable vault

Close Obsidian for the disposable vault. Extract the ZIP into its `.obsidian/plugins/` directory. The archive contains one `ai-knowledge-hub/` directory with the three files below. Open the vault, enable Veynrel, and run the floating-actions command in the command palette. The panel starts disabled. The manifest retains the base version 2.3.1. [Installation ZIP](veynrel-semantic-floating-install.zip)

| File | SHA-256 |
|---|---|
| main.js | `56dff3e53dea596da65d2e04f2e91743737b709ab6f2969618ed48ac63e3042f` |
| manifest.json | `a1c0f8f03004a3d19141ae0bae00f33dcc2a4e6c0e66135d99c0ab419e13a6a1` |
| styles.css | `9e472caea184c6e8b5002fce6d540afd32b67e07777c070e0b4667bc55daf4e3` |
| ZIP | `4263bd1a05f6dca8f2d6b2092ee96f7312c1b42e557277606931f80767254a90` |

The harness copied the production assets into each disposable vault. All three installed hashes match the extracted ZIP in each candidate run. The baseline matches the [original #157 receipt](../evidence/ux-followup/after/report.json).

## Native evidence

Obsidian 1.13.7, Electron 43.6.0, Linux X11, private Xvfb/Openbox sessions. Each run used a fresh synthetic vault and profile. Semantic fixtures use stored vectors. Explicit generation and query requests use a loopback HTTP server. The runs below exited zero, closed all recorded CDP ports and cleaned up their process groups. Every original Markdown fixture matched its starting SHA-256 at completion. [Run index](evidence/runs.json) · [Evidence checksums](evidence/SHA256SUMS)

| Scenario | Checks | Observation |
|---|---:|---|
| [#157 baseline](evidence/before/report.json) | 3 | Seven earlier destinations, overview, and native editor with floating actions absent |
| [Full](evidence/full/report.json) | 135 | Seven routes, panel, split/popout, lifecycle, source guards, restart, both language and base-theme variants, 390 px |
| [Full with Minimal 9.0.2](evidence/minimal/report.json) | 136 | Verified theme identity and CSS, same editor and routing journeys |
| [Routes alone](evidence/routes/report.json) | 71 | Late source/scope changes, partial metadata, Back, selected pair, 0 provider calls |
| [Global cap](evidence/cap/report.json) | 3 | 502 indexed documents, cap 500, zero focus scores |
| [Editor edges](evidence/edges/report.json) | 9 | CRLF refused before HTTP, LF/Unicode exact Undo, duplicate Apply, rename/close, Reading-mode settings |
| [#157 follow-up regression](evidence/followup/report.json) | 90 | Overview, ring, batch, findings, keyboard and popout flows on the candidate build |

| Hub entry | #157 | Candidate result |
|---|---|---|
| Map | [Before](evidence/before/before-map.png) | [Graph and mode controls](evidence/full/routes-map-en-dark.png) |
| Families | [Before](evidence/before/before-families.png) | [Members of the selected family](evidence/full/routes-families-en-dark.png) |
| Notes and pairs | [Before](evidence/before/before-notes.png) | [A/B selection](evidence/full/routes-pair-select-en.png) and [existing review](evidence/full/routes-pair-review-en.png) |
| Neighborhood | [Before](evidence/before/before-neighborhood.png) | [Indexed excerpts and line references](evidence/full/routes-neighborhood-en-dark.png) |
| Opportunities | [Before](evidence/before/before-opportunities.png) | [Candidates](evidence/full/routes-opportunities-en-dark.png) and [persisted review decision](evidence/full/opportunity-durable-decision.png) |
| Global focus | [Before](evidence/before/before-focus.png) | [Full paginated scores](evidence/full/routes-focus-en-dark.png) and [cap refusal](evidence/cap/global-focus-cap-refused.png) |
| Similar notes | [Before](evidence/before/before-similar.png) | [Ranked documents with a separate fragment action](evidence/full/routes-similar-en-dark.png) |

The [route and action contracts](contract.md) specify owners, source scope, consent, writes and Undo. The [uncut route recording](evidence/routes/journey.mp4) includes traversal and Back. The [full native recording](evidence/full/journey.mp4) includes the two execution flows. Three continuous excerpts retain the native order and timing. [Grip drag through the split switch](evidence/full/drag-and-switch.mp4) · [Style preview, Apply and editor Undo](evidence/full/style-apply-undo.mp4) · [Recall generation, insert, Undo and Redo](evidence/full/recall-insert-undo-redo.mp4)

### Selection, consent and writes

The full receipt recorded zero provider calls through panel enable, expand, selection, drag and Style consent. Enable and drag each persisted one settings change. The first draft request produced a preview with the source still intact. Apply changed the selected sentence in one editor transaction. The stage counters measure Vault methods, so the editor assertions and saved bytes establish the editing outcome. Search opened with an empty field. Selection, opening and typing issued no search request until submission. [Stage counters and request digests](evidence/full/report.json) · [CRLF refusal](evidence/edges/style-crlf-refused.png)

Floating Recall submitted exactly the 25-character selection. Three generated cards took the existing queue from one to four. Saving after native Undo restored one, and saving after Redo restored four. The harness held replies at the HTTP server until cancellation, a real provider update, a provider round trip, a tuning round trip, a source edit or popout closure. It checked both source text and queue and measured the language-model and authoring listener sets before opening and after closing. Reusing an old Generate button failed to submit a later consent. An unchanged settings notification allowed normal generation. [Recall consent](evidence/full/recall-consent.png) · [Inserted cards](evidence/full/recall-inserted.png) · [Undo](evidence/full/recall-undo.png) · [Redo](evidence/full/recall-redo.png)

### Recovery and failed attempts

The previous session printed the original full report for run `64022cb70986` with 127 checks and 117 screenshot entries. Rebuilding clean `edc1bcd` in a separate directory produced `fc6299ca128b2cfdc7ebc2eee7713bf0acabd72e6c4ffad904832dbe8d153a83`. Adding only the recovered uncommitted modal change produced `2133b63a67dddbeaba12dc0e32478087a793bdf779da8726c5001d18d8798800`, matching both the original report and the surviving bundle. The previous passing full run therefore included that dirty source change.

The owner reported exit 143 for the later dedicated routes command. The runner maps SIGTERM to 143 and its own timeout to 124. The previous session ended at its usage limit while the shell was active. The sender of the signal and the last completed assertion cannot be established from the retained record. A later reboot cleared the tmpfs containing the original log and vaults. The local recovery archive retains 32 printed launcher receipts (16 nonzero exits), report excerpts and 24 rendered images from that session. The 143 run has no passing result. [Historical attempt index and opened reference PNGs](evidence/historical-attempts.json)

Two native failures during resumption have their original report and failure screenshot preserved. Changing scope passed before synthetic-folder cleanup raised EISDIR. Another assertion sampled the Style UI before its late response reached the conflict state. The subsequent failure snapshot already showed conflict. The final harness waits for the request at the loopback server, changes the context, releases the response and waits for the observed terminal state. [Folder cleanup failure](evidence/scope-fail/report.json) · [Timing failure](evidence/timing-fail/report.json)

### Engineering checks and coverage

The full Vitest suite passed 5,472 tests in 216 files with four workers on the final production code. Lint ran both TypeScript projects and the production build. It reported two existing fetch warnings, in `api.ts` and the Studio Community transport. The mutation audit killed all five mutants and passed all restored tests. Two sandbox attempts failed on nested Node process creation before the successful audit outside the sandbox. The session guard and three real launcher tests passed, including explicit SIGTERM and timeout cleanup. [Vitest](evidence/checks/final-tests.log) · [Lint and build](evidence/checks/final-lint.log) · [Mutation](evidence/checks/audit-native.log) · [Session](evidence/checks/session.log) · [Runner](evidence/checks/runner.log)

Desktop evidence covers English and Russian, dark and light themes, Minimal, keyboard, narrow desktop and independent popouts. Semantic ranking quality, physical touch, screen readers and mobile hardware remain unverified. Historical Community ownership, cold-10k, other e.isShown cases and CDP timeout incidents remain outside these results. Visual acceptance belongs to the owner.
