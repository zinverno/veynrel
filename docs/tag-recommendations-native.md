# Tag Recommendations v1: native verification

**PASS** on Linux desktop with installed Obsidian package **1.13.7-2**
(`pacman -Q obsidian`) and Electron **43.6.0**, in a newly created synthetic vault
and separate application profile. No real notes or credentials were used.

Source branch: `feat/tag-recommendations-v1`, based on merged PR #81 at
`f36960b3df488e32de66abd6d53fa47fd87024f3`. The machine-readable
[native report](tag-recommendations-evidence/native-report.json) contains the
SHA-256 of the exact production artifacts copied into the native vault, every
assertion and the boundaries of instrumentation. Manifest stays at 2.1.0.

Command:

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-tag-recommendations-pr --taxonomy --tag-recommendations
```

The test uses the actual Tools route, native full-path picker and keyboard Enter,
MetadataCache, settings queue, modal and session. Only the completion callback is
replaced before preparing any request. The base harness also checks the existing
Pair Inspector using its deterministic semantic fixture; Tag Recommendations
neither creates nor queries embeddings.

## Observed results

- **118 Tag Recommendations assertions passed**, plus **28 taxonomy** and
  **18 Pair Inspector** assertions. Repeated boundary checks run across fixtures.
- Eight scripted cases: theory with a small example, a practical guide,
  programming difficulty, language-learning difficulty, multiple topics,
  no applicable tag, a justified proposed tag and insufficient context.
- Opening Tools/the modal, scanning and selecting a file did not read note bodies
  or invoke the fake model. Every successful analysis read only the selected
  source, exactly three times: preparation, pre-send, post-response.
- Complete consent matched the source, saved profile and complete observed
  inventory. The key was absent from UI, and the provider/model/endpoint and
  exact body were visible. Keyboard activation moved focus to confirmation.
- Each confirmed request dispatched once; dismissal did not save or resend.
  **16 scripted completions**, **zero observed Markdown writes**, and **zero
  fetch/XHR/provider-network calls**. No paid requests were made.
- Native profile saving/reopening and concurrent unrelated settings remained
  valid. Recommendations, sources, inventories and request/response bodies did
  not appear in persisted settings.
- RU/EN × light/dark × 1200/390 px passed horizontal-overflow checks for both
  consent and results (16 screenshots). Native picker and confirmation worked
  with the keyboard. Existing profile controls retained accessible labels.

The scripted prose intentionally stays English in some fixtures even under RU UI;
this tests translated host controls and verbatim handling of model text. The
request instructs the real model to use the UI language. Real model compliance,
classification quality and native screen-reader speech were not evaluated.

## Refusals and stale/cancelled outcomes

Observed in native UI, with no confident recommendation retained:

| Situation | Outcome |
| --- | --- |
| No applicable category tag in scripted response | `none`; no suggestions |
| Insufficient source context | `insufficient_context`; no suggestions |
| Invalid JSON | Entire response withheld; no retry |
| Fabricated quote | Entire response withheld; no retry |
| One missing MetadataCache entry | No request; coverage unknown |
| Source/inventory event before confirmation | Consent invalidated; no request |
| Committed profile edit | Consent invalidated; no request |
| Real saved-file edit after result | Result removed |
| Model changed during delayed request | Waiting aborted; late result ignored |
| Double confirmation and cancel | One dispatch, aborted waiting, no result |
| Close during delayed request | No restored UI; possible-billing notice shown |
| Source over 20,000 UTF-16 units | Whole analysis refused; no request |

Unit tests additionally cover invented existing tags, exact/case-only new-tag
duplicates, malformed/duplicate-key JSON, ambiguous quotes, missing profile,
strict/flexible policy, domain/prerequisite evidence, source deletion, silent
pre/post-read changes, oversized inventory/request, and profile/inventory/settings
changes around request boundaries.

## Screenshots

| Consent | Result |
| --- | --- |
| [EN, light, 1200 px](tag-recommendations-evidence/tags-en-theme-light-1200-consent.png) | [RU, light, 1200 px](tag-recommendations-evidence/tags-ru-theme-light-1200-result.png) |
| [EN, dark, 390 px](tag-recommendations-evidence/tags-en-theme-dark-390-consent.png) | [RU, dark, 390 px](tag-recommendations-evidence/tags-ru-theme-dark-390-result.png) |

## Automated gates and limits

`npm test`: **125 files / 3114 tests passed**. `npm run typecheck`,
`npm run lint`, `npm run build`, `npm run audit:proposals` and `git diff --check`
passed. Lint retains only the existing accepted streaming-fetch advisory at
`api.ts:404`; no new warnings. Proposal mutation audit killed **5/5** mutants and
restored tests passed. Its sandbox run produced empty child-process output; the
unchanged audit passed outside the sandbox.

This demonstrates contracts and native desktop behavior with **fake model output**,
not semantic accuracy or live-provider reliability. MetadataCache may lag and
excluded notes are outside the dictionary, so a new-tag proposal does not prove
vault-wide absence. Inputs above 20,000 source units / 500 tags / 16 categories /
128 KiB request are refused rather than partially analyzed. Full details are in
[the feature document](tag-recommendations-v1.md).

Native network counters cover fetch/XHR and existing provider factories, not
`requestUrl` itself. The completion boundary is replaced before any invocation;
unit tests separately mock `requestUrl` and assert its body equals the approved
preview. Fixture setup/editing is external to the feature and intentionally writes
synthetic files. Physical mobile devices, other operating systems, screen readers,
custom themes and paid providers were not tested.
