# Discover v1

Current addition: Ready Discover separates **Explore** (the same three workflows)
from **Semantic Health**, whose explicit **Check semantic duplicates** action
persists Findings through HealthService. See
[Semantic duplicate Health Findings](semantic-health-duplicates.md). The original
v1 implementation and its historical verification are recorded below; its three
exploratory workflows still do not persist Findings.

Baseline: clean, fast-forwarded `main` at
`f565e494e200b66225886a00dc6a5d6a9c800585`, the actual PR #33 merge commit.
Branch: `feat/discover-surface`. No version bump, tag, release or merge.

## Purpose and navigation

Discover makes existing semantic capabilities accessible from the Veynrel workspace:
**Search by meaning**, **Related notes**, and **Potential duplicates**. These are
exploratory workflows; they do not create Semantic Findings or change Health.
Ask your Vault remains available through its existing command, outside this
semantic-only surface because it also requires language-model configuration.

The existing `VeynrelHealthView` renders **Health | Findings | Discover** after
onboarding completes. Recovery continues to take precedence and hides normal
navigation. There is no new leaf type. The route union adds `{ page: "discover" }`
alongside Health and Findings; it remains view-local and resets to Health on close.
No route, result, draft or selection is persisted in settings or Health storage.

Health keeps its existing capability/setup section, local dimension links,
recommendation-to-Finding navigation, profile chooser and Tools. Discover is the
usage surface. Local Health remains usable with Semantic Intelligence disabled.

## Cached capability states

The pure `discoverViewModel` consumes `SemanticIntelligenceSnapshot` and reuses
the existing capability presentation for readiness, index and error states.
`renderDiscover` only creates native DOM from that model; it makes no engine
decisions. Details are limited to provider/model and usable vector count, without
embedding space IDs, generations, dimensions, thresholds, settings or credentials.

| Capability | Discover presentation and actions |
| --- | --- |
| Disabled | Semantic Intelligence required; Enable |
| Configured / uninspected | Check setup, Build semantic index, Change setup |
| Known empty index | Index required; Build semantic index, Change setup |
| Ready with positive vector count | Exactly Search by meaning, Related notes, Potential duplicates |
| Busy | Current operation text; no duplicate actions; normal navigation stays usable |
| Incompatible | Index needs rebuilding; Rebuild index, Change setup |
| Error | Safe needs-attention copy; Check setup, Change setup |

Enable and Change call the same internal `openSemanticSetup()` helper used from
Health. It selects Health and opens the existing setup chooser. There is no
second setup implementation. Back discards drafts and returns to Health.

## Existing engine delegation

Health depends only on the injected `SemanticIntelligencePort`. Its adapter in
`semantic/product/semanticIntelligenceController.ts` adds two Ready-guarded
delegates alongside existing Search:

| Discover workflow | Existing controller method |
| --- | --- |
| Search by meaning | `openSearch()` |
| Related notes | `openSimilarNotes()` |
| Potential duplicates | `openPotentialDuplicates()` |

The existing controller owns active Markdown-file checks, missing-file Notices,
readiness, runtime initialization, compatibility, errors and all three modals.
Related uses the currently/recently active Markdown file through the existing
Obsidian controller behavior. Discover does not inspect or read that file itself.
No query field, results UI, ranking, similarity or duplicate algorithm is added.
The existing duplicate threshold **0.95** and result limit are unchanged.

Check, Build and Rebuild reuse the existing product-port methods. First indexing
still requires a separate explicit action with the existing remote privacy
confirmation. Rebuild retains the existing destructive confirmation. Neither is
triggered by opening Discover. Clear remains in Advanced Settings.

## Passive opening and isolation

Navigating to Discover reads only cached semantic capability state. It does not
test a provider, call `requestUrl`/`refreshSemanticStatus`, build/rebuild an index,
read/enumerate Markdown, start a local scan or save settings. Existing background
auto-sync is unchanged and remains independent of opening the page.

Discover does not access FindingStore for semantic results. A populated-store
integration test navigates and invokes all three workflows, then compares exact
stored bytes, Finding count/lifecycle data and the Health snapshot. All remain
unchanged. Native smoke separately compares the durable Findings file before and
after the workflow sequence. No semantic result persistence is introduced.

The transitive Health import audit includes the new renderer/view-model and
explicitly rejects semantic runtime/discovery/controller/vector dependencies and
Markdown reads. The existing semantic-product boundary audit still permits only
the existing embedding test/settings/controller interfaces, without direct vault,
vector or Companion access.

## Localization, keyboard and layout

Ten new EN/RU keys cover Discover and the workflow explanations; existing localized
Semantic Intelligence state/action strings are reused. Russian navigation is
**Состояние | Находки | Открытия**. Provider/model identifiers are not translated.

Navigation is a native `nav`, with `aria-current="page"`, pressed state and visible
selection. Workflow cards are real buttons with a title and concise explanation.
Navigation focuses the new page heading; normal Tab/Enter reaches each workflow.
Existing focus outlines and the mounted polite live region announce operation
state. Native grid layout uses three columns when space permits and one column
at narrow widths, with Obsidian theme variables and no additional dependencies.

## Automated verification

**27 added tests**: **1,359 repository tests in 60 files**, **459 Health tests in
25 files**, and **33 semantic/product tests in two files**. Baseline totals were
1,332 repository and 435 Health tests.

Coverage includes all cached capability states, positive-vector readiness, exact
workflow delegation, passive navigation and reopen, no nav during onboarding or
recovery, shared setup/Back, explicit Build/Rebuild, safe error/busy states,
duplicate-click protection, Findings/Health isolation, EN/RU, and dependency
boundaries. Existing semantic command and Advanced control audits remain active.

Passed: `npm ci`, `npm run typecheck`, `npm test -- health`,
`npm test -- semantic/product`, `npm test`, `npx eslint health semantic`,
`npm run lint`, `npm run audit:proposals` (5/5 mutations killed),
`npm run build`, and baseline-to-HEAD whitespace validation. The existing
`api.ts:413` fetch warning and seven lockfile advisories (four moderate, three high)
are unchanged. Independent read-only review found no concrete blocker; the
reviewer did not independently run the test suite or native smoke.

## Native desktop smoke (2026-09-23)

Real installed **Obsidian 1.12.7 / Electron 39.8.10**, an isolated profile and three
synthetic notes. No personal credentials or real provider success are claimed.
The embedding transport returns synthetic vectors; the setup transaction, native
UI, semantic controller, runtime and local index are real. Installed artifacts
match the final production build; hashes/counters are in
[native.json](discover-evidence/native.json).

| Check | Observed result |
| --- | --- |
| Disabled/configured/Ready Discover opening | Zero provider/network, refresh, note reads/enumeration, index, scan or settings/Findings write calls |
| Enable from Discover | Health chooser opens in the same leaf; Back discards key draft; zero side effects |
| Explicit local Health scan | Three note reads; local Findings remain available |
| Explicit Build from Discover | Existing privacy confirmation; one indexVault invocation and three reads after acceptance; Ready with three vectors |
| Keyboard workflows | Tab/Enter opens Semantic search, Similar notes and Highly similar notes; 2px visible focus |
| Related source | Actually open/recently active `A.md`, with Discover active; one existing controller delegation |
| State fixtures | All seven presentations, including empty index and busy, render with zero calls; temporary product-snapshot overrides are restored |
| Rebuild | Existing destructive confirmation opens only on click; cancelled |
| Findings isolation | Byte-identical durable file, zero workflow writes; recovery fixture restored byte for byte |
| Responsive | 320/390px: one column; 768px: two; 1024/1440px: three; no horizontal overflow |
| EN/RU and themes | English dark and Russian light captures inspected; full 390px pane is 334px wide with equal scroll width |
| Surrounding surfaces | Findings/profile chooser fit at 390px; onboarding/recovery hide Discover and fit a narrow split |

Cached-state overrides test presentation, not real provider failure or corrupt
indexes. Initial direct engine-status overrides for empty/busy were superseded by
the explicit snapshot fixtures because the existing runtime correctly returned
its actual Ready index. All three Markdown files remained byte-identical; no
instrumented runtime errors or unhandled rejections occurred.

Inspected captures: [Ready, English](discover-evidence/ready-en-dark.png),
[Ready, Russian at 390px](discover-evidence/ready-ru-light-390.png),
[index required](discover-evidence/index-required-en-390.png).

## Unchanged and deferred

Baseline diff confirms no changes to `ObsidianSemanticController`, semantic
auto-sync/discovery algorithms, threshold/limits, providers, index/vector/chunking
code, Advanced settings, Health aggregation/domain/analyzers/store/services,
settings persistence, command IDs or manifest/version/dependency files.

Semantic Health integration, hidden connections, semantic duplicate Findings,
Ask/LLM/Deep Intelligence, Recall/FSRS and Health Score remain deferred. Native
Android/iOS, popout and screen-reader testing remain gaps; desktop width checks
do not establish mobile-platform support. Existing semantic setup persistence
limits documented in [Semantic Intelligence](semantic-intelligence.md) are unchanged.
