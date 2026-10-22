# Review flow stabilization

Dependent on draft #112 (`eb998837064521a71ac3354822d59d5d21c00c1d`), preserving #110 output limits, #112 snapshot-bound evidence IDs and #111 recommendation → planner. This is a list-first flow correction, not approval of the earlier map design.

## State and ownership

The list separates the saved content observation, current local file/link facts and the last confirmed operation. Link Apply does not resolve a content-overlap candidate. Known links are shown directionally. In connection mode, an already linked pair remains inspectable but is outside the unlinked candidate count; source ranking and candidate storage are unchanged. Changed text explicitly makes semantic freshness unconfirmed, even if the loaded index revision itself has not changed.

`ReviewFacts` reads only displayed pairs, initially at most 60 pairs. Explicit “more” expands that displayed set. One serial drain coalesces invalidations; path events target matching pairs, a metadata resolution event rechecks the displayed set. There is no polling, model call, embedding generation or graphical construction. Unknown cache/read failures never become an assertion that no link exists. Rename/delete does not silently substitute another canonical path. List scope, search, selected pair, scroll and focus remain navigation state.

The UI receives an outcome **after** a real executor promise succeeds, including when its modal has already closed. The application-scoped cache retains at most 128 recent operation summaries, not tickets, Markdown or write authority. Opening History explicitly can populate the cache from the history owner’s checked rows. **Automatic refresh never calls a history service, scans all journal files or acquires the executor lock.** A local recheck failure cannot undo a successful operation or cause a second dispatch. Apply failures do not publish success.

After plugin restart, local file/link facts are read again. Historical outcomes are displayed after explicit History; no background recovery or journal scan is introduced. “Keep separate” is a reversible, session-only decision bound to the exact two file identities, contents and saved versions (at most 64 records). It never deletes/hides a candidate or proves absence of overlap. A source change expires its applicability. Closing or dismissing a review does not create this decision.

## Availability before navigation

`RecommendationPreflight` reads the existing `PlannerRead`, including the actual resolver linktexts. It compares saved sources with the validated analysis and refuses unavailable metadata. Generation checks revoke late callbacks on metadata/source/settings changes and disposal. The result’s primary action remains disabled while checking or when unavailable. Alternatives are checked independently. No plan, consent or ticket is produced by preflight.

Existing `requireChangeRange`, structure guards and planner owners remain authoritative. Range failures are collected rather than taking the first paragraph’s error as the pair’s diagnosis. Missing metadata and a known existing link take precedence. Plain-paragraph, evidence, unique-fragment, dependency and cycle guards are unchanged. An unresolved target is not replaced with a guessed canonical-looking linktext. Builders and final reviews still perform their original fresh checks; availability is a hint about a possible scenario, not a guarantee that a later selection will pass.

Embed is described literally: replace **one whole eligible paragraph** with an embed of **the entire other file**. It is not a merge or a transfer of a unique section. The common unsupported case is explained on the analysis result before a disabled button; the UI does not navigate to an empty planner. Plugin alternatives are limited to checked link/combine options, distinct from model alternatives and the explicit user decision.

## Presentation

The existing native shell remains. Note paths, complete model rationale, evidence quotes, request body, bytes, reasoning policy and source metadata use native disclosures. Brief model statements are displayed only whole; longer statements remain complete in disclosures, never rewritten or truncated into a new assertion. Consent still visibly names the pair, provider/model, full saved text/properties, possible payment and output cap. Disclosed and sent request bodies are unchanged.

The list has one action per row, current facts and a compact operation outcome. The relationship panel uses the page’s scroll owner. Parameters continue the selected scenario with unchecked confirmations. Exact review preserves the full diff, affected paths, limitations, separate Apply and separate Undo. Single-file success names the actual effect and paths and offers an explicit return action. No writer, ticket, journal/recovery format, ranking, map, FSRS or version changes.

## Verification

- Full suite: 172 files, 4,681 tests passed with `--maxWorkers=2` (50.07 s), including the final compact-parameter presentation. Exact-head CI is recorded in delivery evidence.
- `typecheck`, production `build`, Obsidian `lint`: pass. The pre-existing `api.ts:442` streaming-fetch advisory remains; no new lint warnings are accepted.
- `audit:proposals`: all five mutations killed; restored tests pass. `git diff --check`: pass.
- Installer fixture: exact three-file installation, external backup, settings/index/journal preservation, original-vault refusal, tamper and symlink refusal. The fixed TEST wrapper is syntax-checked, **not executed**.
- Offline regressions cover Apply/Undo observations, delayed metadata, failed recheck, unrelated pairs, rename/delete, stale/closed callbacks, resolved linktexts, unavailable alternatives, reversible snapshot-bound decisions and newest-first history exceeding the 128-entry cache.

The native harness `scripts/review-flow-native.mjs` launches Obsidian 1.13.7 / Electron 43.6.0 in a new isolated synthetic profile. It uses four synthetic notes with overlap, unique/context paragraphs, YAML, headings, bold text, inline code and links. The existing product request builder, loopback HTTP, real transport parser, evidence adapter, strict validator, planners, executor and History/Undo are exercised. Artificial vectors and scripted responses test the route, **not model quality**. Every HTTP body is compared byte-for-byte with its consent preview. The original vault and TEST are never opened or written.

The final frozen run completed 35 checks: continuous Apply → list → same pair → History → separate Undo → list, cancelled review with no outcome, unavailable embed before navigation, RU/EN and built-in light/dark at 1280/390 CSS px, native keyboard input, 200% application zoom, reduced-motion preference, a real popout, and modify/rename/delete updates in both windows. Three explicit loopback completions per successful run; zero paid/provider requests and no background completions. Markdown SHA-256 equality is checked immediately after real Undo; subsequent manual-edit tests are recorded separately and never used to manufacture an Undo PASS.

Frozen-build measurement: 34 local pair rechecks, mean 28.8 ms, p95 330.4 ms, max 387.2 ms; opening 220.3 ms. This includes snapshot reads and local hashing under recording, not semantic inference or a general performance claim.

Native-development failures were retained locally: an invalid synthetic duplicate recommendation, then screenshot/probe errors (top-level await, remote buffer serialization, and popout `about:blank` target selection). A frozen run timed out opening a pair after locale/viewport switching. The harness now waits for local fact checks and the settled layout before obtaining click coordinates. Another run reached the RU/EN result matrix but stopped because Electron's globally focused window was null; zoom now addresses the tested window directly. The subsequent final frozen run passed all 35 checks. It never retries Apply or provider requests. None of the incomplete runs was reported as complete acceptance.

## Delivery and evidence

Draft [PR #113](https://github.com/zinverno/veynrel/pull/113), base `fix/relationship-evidence-binding`; auto-merge is off. Frozen source: `3bb91bdf83603f3ed9a81760097c4579abcfb755`. Subsequent delivery commits contain the harness's window-addressing fix and evidence only. Build SHA-256 values are in the [native report](review-flow-stabilization-evidence/report.json); [CI](https://github.com/zinverno/veynrel/pull/113/checks) runs on the delivered head.

- [Continuous native route](review-flow-stabilization-evidence/review-apply-list-reopen-history-undo.mp4): list → consent → result → parameters → exact review/cancel → Apply → list → same pair → History → separate Undo → list.
- [Unavailable recommendation before navigation](review-flow-stabilization-evidence/unavailable-before-navigation.mp4).
- Full frames: [consent](review-flow-stabilization-evidence/consent-1.png), [parameters](review-flow-stabilization-evidence/link-parameters.png), [exact review](review-flow-stabilization-evidence/exact-review.png), [confirmed write](review-flow-stabilization-evidence/applied.png), [list after Apply](review-flow-stabilization-evidence/list-after-apply.png), [separate Undo](review-flow-stabilization-evidence/separate-undo-review.png), [list after Undo](review-flow-stabilization-evidence/list-after-undo.png).
- [RU early refusal](review-flow-stabilization-evidence/unavailable-ru.png), [390 px light](review-flow-stabilization-evidence/result-ru-theme-light-390.png), [popout](review-flow-stabilization-evidence/popout-list.png). The evidence directory contains all 38 uncut frames and [SHA256SUMS](review-flow-stabilization-evidence/SHA256SUMS).
- [Before hashes](review-flow-stabilization-evidence/before.json) equal [after real Undo](review-flow-stabilization-evidence/after-undo.json). [Later manual edits](review-flow-stabilization-evidence/after-manual-edits.json) are a separate test.

The frozen three-file build, source marker, hashes, logs, copied evidence and fixed TEST installer are in the separately delivered permanent artifact folder. The installer has no dependence on previous shell variables, verifies all three hashes and places backups outside the vault; it was not executed on TEST.

## Limits

No live model/provider test is part of this task; #112’s diagnostic authorization is closed. No personal-vault installation, merge or release. Mobile operating systems, every third-party theme and a large real-world journal corpus are not native-tested. History-derived summary retention and “keep separate” decisions are deliberately bounded/session-only. Native acceptance demonstrates the synthetic workflow and does not replace the user’s visual approval or claim that every arbitrary structure is executable.
