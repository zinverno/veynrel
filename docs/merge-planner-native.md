# Merge Planner native acceptance

**PASS**, 2026-10-17, Linux, Obsidian **1.13.7-2**, Electron **43.6.0**.
New isolated synthetic vaults and profiles; no personal notes, credentials or paid
requests. PR #87 was verified merged before branching from current `main`
`26dcff47985ba3090f6aa358d773783a4477b33a`.

## Reproduce

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-merge-NEW \
  --change-planner --multi-file-planner --merge-planner
```

Use a new directory with that prefix. The harness owns its Obsidian process and CDP
port 9274. It installs the production build into a synthetic vault and uses fake
Relationship Analyzer responses after the normal explicit consent flow. Fixture
setup and external edit cases write only synthetic files; the product's planning
flows must perform no Markdown writes, journal mutations or network calls.

## Results and artifacts

The combined run passed **176 assertions**: Pair Inspector **18**, single-file
Change Planner **51**, reciprocal-link Multi-file Planner **55**, Merge Planner
**52**. An earlier targeted run passed **70** (Pair Inspector + Merge Planner).
Counts include repeated confirmation/language checks, not 176 distinct features.

- [Combined report](merge-planner-evidence/report.json)
- [Targeted report](merge-planner-evidence/targeted-report.json)
- [Evidence checksums](merge-planner-evidence/sha256.json)

Copied artifacts in both successful vaults were byte-compared with the repository
build. The same product artifact was used in both runs:

| Artifact | SHA-256 |
| --- | --- |
| `main.js` | `56dda677e39c70b4eecc2785e56e2685dc33527ee5e0a73dc5077f5d7f7fd776` |
| `styles.css`, unchanged | `7c6d353ef5952e4b305265bf163bfc24f2852c6ce71b1cbb6ef40da1b04ee05f` |
| `manifest.json`, unchanged | `1d701d48f24d7303b0f9c1657756260f9f72b3227a07bedeb239c64bd55a8282` |

| Native case | Observed result |
| --- | --- |
| Open/choose merge | No extra provider call; preparation reads only both selected saved files. Canonical choice starts empty. |
| Explicit block and location | Build disabled until user selects and confirms the whole block and insertion context; keyboard Enter builds. |
| A canonical, then B canonical | Correct full paths, including Cyrillic/spaces and homonymous filenames; switching clears the entire plan and all choices. |
| Complete plan | Exact insertion splice, full before/after, literal diff and retained ranges reconstructing every character of secondary source. No single/multi executable plan or Apply control. |
| Repeated identical paragraph | Only the second explicitly selected occurrence is recorded; no inferred quote boundaries. |
| RU/EN × light/dark × 1200/390 px | Localized controls/results, no horizontal overflow; no Markdown, HTML or embeds executed. |
| Contextual example | Same-side contextual paragraph disabled; it remains in the original note. |
| Structural dependencies | Source blocks under headings or containing links/embeds disabled. Existing canonical YAML, headings, links and embeds remain unchanged in preview. |
| Contradiction / version difference | Refusal, no plan, no automatic semantic resolution. |
| Later saved edit to A or B | Analyzer becomes stale and closes/clears the planner. |
| Changed cache while final read is held | Entire result stale; double click starts no extra build/read. |
| Close during final read | No late result or restored UI. |
| New analysis / decline | Prior plan removed; new analysis still waits for separate consent. Decline leaves no plan. |
| IO | Exactly six selected-source reads for preparation + successful build; no additional fake LLM call during planning. Zero Vault mutations (including process), journal writes/copies and fetch/XHR calls. |

An initial attempt failed in the **new harness**, after Pair Inspector checks: a
slash escape in a JavaScript template produced an invalid CDP expression when
installing journal counters (`SyntaxError: Unexpected end of input`). It did not
establish Merge Planner acceptance. The harness now matches the two journal path
segments explicitly; no product safety check was changed or weakened. Its
[failure report](merge-planner-evidence/initial-harness-failure.json) is retained.
Both subsequent complete runs passed.

## Screenshots

| Language | Light 1200 | Light 390 | Dark 1200 | Dark 390 |
| --- | --- | --- | --- | --- |
| EN | [Plan](merge-planner-evidence/merge-en-theme-light-1200.png) | [Plan](merge-planner-evidence/merge-en-theme-light-390.png) | [Plan](merge-planner-evidence/merge-en-theme-dark-1200.png) | [Plan](merge-planner-evidence/merge-en-theme-dark-390.png) |
| RU | [План](merge-planner-evidence/merge-ru-theme-light-1200.png) | [План](merge-planner-evidence/merge-ru-theme-light-390.png) | [План](merge-planner-evidence/merge-ru-theme-dark-1200.png) | [План](merge-planner-evidence/merge-ru-theme-dark-390.png) |

- Full [before/after EN](merge-planner-evidence/merge-en-before-after.png),
  [RU](merge-planner-evidence/merge-ru-before-after.png).
- Literal [diff EN](merge-planner-evidence/merge-en-diff.png),
  [RU](merge-planner-evidence/merge-ru-diff.png).
- [Structural refusal](merge-planner-evidence/merge-structural-refusals.png),
  [contradiction](merge-planner-evidence/merge-refuse-conflict.png),
  [different versions](merge-planner-evidence/merge-refuse-version_difference.png).

## Automated checks and scope of evidence

`npm test`: **3473 tests / 134 files passed**, including **73** new merge tests.
Typecheck, lint, build, `audit:proposals` (**5/5 mutations killed**) and
`git diff --check` passed. Lint retains the pre-existing `api.ts:404` streaming-fetch
warning with zero errors. Tests/audit ran outside the sandbox after sandbox Vitest
did not complete; no incomplete run is counted as PASS.

Unit tests cover exact preservation, both canonical choices, near-identical and
partially overlapping sources, unselected context, repeated text, protected regions,
heading/attribution dependencies, contradictions, versions, source deletion, both
freshness phases, changed paths/identities/stats/cache/resolver/references, analysis
invalidation, cancel/close/double click and unchanged executor boundaries. They also
assert no requestUrl, network, editor-buffer reads, body enumeration, journal or
Markdown mutations. Existing Safe Apply/Undo and other suites passed in the full
unit run; native Apply/Undo/crash tests were not rerun for this read-only feature.

Native network counters observe fetch/XHR and fake completion counts, not every
possible transport. Native dependency metadata does not prove semantic completeness
or cache freshness. Model quality was not evaluated. There was no physical mobile,
other OS, screen-reader, popout, custom-theme or external-process testing. No Merge
executor, archival, deletion or new durable journal is implemented or claimed.
