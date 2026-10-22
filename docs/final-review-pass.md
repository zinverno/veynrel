# Final review pass — decision first

This completes the planned presentation/contract pass on draft PR #113. It is not beta release approval, model-quality acceptance, or approval of the previous map experiments. The next product stages (candidate usefulness rules, integration acceptance, beta preparation) remain outside this change.

## Baseline and owners

Work continued on `fix/review-flow-stabilization` from `4c77d2e4257c9e9c4020c74974b01ce901711c6c`, with its unchanged dependent base `fix/relationship-evidence-binding` (#112, `eb998837064521a71ac3354822d59d5d21c00c1d`). Other working trees and the main checkout were preserved. #110 output budget/finish checks, #111 intent-to-planner, #112 snapshot binding and #113 ReviewFacts/preflight remain in place.

The data owners are still RelationshipSession, RecommendationPreflight, ChangePlannerSession and ReviewFacts. No new executor, index, persistence layer or ranking was introduced. Writers, journals, tickets, recovery, maps, FSRS and provider configuration are unchanged.

## What changed

- One native button is the entire primary decision card: icon, origin, availability, honest effect and preparation verb. There are no nested controls. Enter/Space and pointer activation enter the existing intent-specific preparation. They do not send HTTP or write Markdown.
- The pair remains visible above the decision. The automatic result scroll now includes the return area instead of pushing the pair off-screen. Parameters retain the chosen operation; document selection uses two radio cards without preselecting canonical material or consent. A known embed direction is not asked again.
- Consent is a compact summary of the actual full-source request, provider/model, possible payment and unchanged 8192-token limit. Exact payload/endpoint/budget policy remain inspectable. Pending and cancellation use actual session states, without percentages or remote-cancellation promises.
- Shared/different findings and the complete rationale are visible. Exact evidence is a separate readable view: each claim, kind, A/B source and literal quote, plus the frozen/current distinction. No Markdown or embedded content is executed.
- Refused answers have a short error surface and a separate technical report, not a mixed “diagnostics and evidence” drawer. Copying uses a deliberately constructed allowlist. It excludes source text, note names/paths/hashes, catalogue/claim IDs, raw response/reasoning, keys, headers and URLs. Unavailable values remain unknown (including runtime build identity, which is not embedded in this plugin).
- Exact review still displays the real diff and changed/preserved paths before separate Apply. Confirmed link/Undo outcomes use the same surfaces and the existing read-back result. A written link explicitly does not resolve semantic overlap. Local list updates after Apply/Undo/manual edits use the existing #113 mechanism.

`reference/decision-first.html` was opened in Chromium, and the required PNGs were inspected. Native frames were compared against them. Fixed deviations included result scroll hiding the pair, inconsistent parameter selection controls, weak light-theme accent text, and the error/success hierarchy. Scoped Obsidian theme tokens and existing Lucide icons are used; no framework, font download or dependency was added. Full sources and diffs retain deliberate separate scrolling; the main review route has one page scroll owner.

## Single-recommendation contract

The exact personal failing response was not supplied. The regression for `alternatives[0] / action_relation_mismatch` is explicitly synthetic: legacy `refs.v1`, `related_distinct`, primary `add_link`, incompatible alternative `consider_merge`. It is still rejected, with the actual safe enums in diagnostics. This does not assert those enums were present in the user's unavailable response.

New requests declare `veynrel.relationship.refs.v2`. The root contains exactly `schema`, `relation`, `claims`, `explanation`, `recommendation`, `limitations`. `alternatives`, including an empty array, is an error. The session requires the schema it requested. After validating that exact shape, the adapter constructs the existing internal result with `alternatives: []`, binds fragment IDs from the frozen catalogue, then passes through the unchanged strict relation/action/evidence validator. No part of a returned invalid answer is stripped or repaired.

Legacy v1 still accepts only its own exact shape and validates every alternative. Extra fields, unknown IDs, old-schema answers to new requests and incompatible primary actions are rejected. A rejected answer grants no planner authority. Prompt, builder, consent preview and sent body change together. OutputLimit, stop requirement, timeout, reasoning policy and no-auto-retry behavior are unchanged. Interface alternatives are separately checked and explicitly labelled as interface choices.

## Verification

- Full suite: **4,689 tests / 173 files**; typecheck, production build and diff check.
- Obsidian lint: **0 errors**, full log included with delivery; the existing `api.ts` request streaming advisory is retained, not suppressed.
- Proposal mutation audit: **5/5 killed**, restored tests pass. Its initial sandbox `spawnSync EPERM` was rerun in the authorized process context; that blocked attempt was not counted as a pass.
- Installer: exact three-file install into a disposable fixture, external backup, preservation of settings/index/journals, refusal of original-name vault, tampered bundle and symlink target. Fixed TEST wrapper syntax checked; never executed against TEST.
- New tests cover actual product builder → requestUrl transport parser → binding → strict validator, legacy mismatch, strict v2 shape, consent-body equality, repeated confirm, rejection without authority and allowlist privacy. Existing output-limit/null/timeout/cancel, stale/late completion, planner and executor safety tests remain enabled.

Intermediate scratch copies used to diagnose the sandbox audit accidentally entered one test/lint discovery run. They were removed and the complete clean checks rerun; the scratch-inclusive run is not acceptance evidence.

## Frozen native evidence

Build source: `3b9e08226821293ed6f5da08ce92ddd4a3a966c2`. Final native evidence and measured contrast are in [report.json](final-review-pass-evidence/report.json); all published media are full frames of that frozen build in a newly created six-note synthetic vault. Obsidian 1.13.7 / Electron 43.6.0 on Linux. Responses and vectors are synthetic, served over loopback through the real product HTTP path. They do not test live model or embedding quality. No paid requests, personal vault reads for fixtures, or TEST writes were made.

- [Continuous Apply → list → reopen → History → separate Undo → list route](final-review-pass-evidence/review-apply-list-reopen-history-undo.mp4).
- [Unavailable recommendation before navigation](final-review-pass-evidence/unavailable-before-navigation.mp4).
- [Rejected primary and copied report](final-review-pass-evidence/rejected-primary-report.mp4).
- [Decision](final-review-pass-evidence/decision-ru-theme-dark-1280.png), [consent](final-review-pass-evidence/consent-ru-theme-dark-1280.png), [parameters](final-review-pass-evidence/link-parameters.png), [exact diff](final-review-pass-evidence/exact-review.png), [verified result](final-review-pass-evidence/applied.png), [error report](final-review-pass-evidence/error-report.png).
- [Light/390 error](final-review-pass-evidence/error-ru-theme-light-390.png), [real split](final-review-pass-evidence/real-split.png), [real popout](final-review-pass-evidence/popout-list.png). The evidence folder also contains all RU/EN dark/light and narrow matrix frames, 200% zoom, keyboard and full diff views.
- [Before hashes](final-review-pass-evidence/before.json) equal [hashes after real Undo](final-review-pass-evidence/after-undo.json). Subsequent manual edit/rename/delete checks are separate; no file copying was counted as Undo.

The harness checks Link, Merge preparation and exact review on a separate eligible plain pair, available and unsupported Embed, no_change, manual_review, and incompatible primary. Eight explicit loopback completions match all eight consent bodies. It also checks no map construction, local refresh, unknown/stale outcomes and independent popout state. The frozen run passed **59 named native checks**, produced **88 full frames** and a **23.3-second continuous main-route video**. Across 1,592 measured text/control samples, minimum normal-text contrast was **5.86:1** in the tested built-in themes. Disabled controls are excluded from this contrast measurement; their explanations remain readable. These values come from composited native colors, not CSS-class presence.

## Delivery and limits

Frozen `main.js`, `manifest.json`, `styles.css`, `SHA256SUMS`, `SOURCE_COMMIT`, `REVIEW_HEAD` and the fixed-target `install-to-test.sh` are under the permanent artifact directory `final-review-3b9e082`. `SOURCE_COMMIT` identifies executable code; later documentation/evidence commits are recorded by `REVIEW_HEAD`. No installer invocation relies on variables from a previous terminal. Backups remain outside the vault and only the three plugin files are replaced.

The PR remains draft/open with auto-merge off. There is no merge, release or version change. This visual route is frozen for the next planned acceptance work; no additional redesign or product stage is started here.

Not tested: paid/live-model quality, physical mobile, macOS/Windows, screen-reader speech, older Electron/CSS implementations or third-party themes. 390px is a narrow desktop pane. Split/popout checks cover actual windows, layout and local state propagation; the full write route is recorded in the main pane. Model conclusions remain provisional even when evidence binding passes. Session-only decisions remain session-only. History Undo still requires a fresh valid review and can be blocked by subsequent edits or incomplete journals.
