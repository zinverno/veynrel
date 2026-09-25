# Native Health home

This is the first user-visible Health migration stage (PR 4). The plugin registers
`veynrel-health`, a native Obsidian `ItemView`, and the `veynrel-open-health` command.
The main activity ribbon now opens Health. `ai-hub-open-panel`, `ai-batch-process`
and every other existing command keep their behavior. The secondary **Tools**
button now navigates to the [Tools catalog](product-ia.md) in this same view.
Batch processing remains the existing modal, launched explicitly from that catalog.

PR 5 adds optional, integrated [profile onboarding](health-onboarding.md) around
this same view. Recovery takes precedence, and the normal Home appears after Skip
or Continue. Opening Health and choosing a profile never trigger a scan.

## Ownership and lifecycle

`main.ts` delegates registration to `health/obsidian/registerHealth.ts`. Registration
constructs a lightweight `HealthPluginController`; it does not initialize storage,
read note contents, scan, monitor the vault, or request network access. The first
view open lazily constructs and initializes one `HealthService` / `FindingStore`
using the actual `vault.adapter`, `vault.configDir`, and plugin manifest ID. Missing
storage initialization creates no files or directories. A restored workspace view
may initialize metadata, but never scans automatically.

Ribbon and command share a single-flight opening callback. An existing Health leaf
is revealed; otherwise `getLeaf("tab")` creates a main workspace tab and receives
its view state before `revealLeaf()`. There is no concrete-view access before reveal,
so deferred views can load through Obsidian's normal lifecycle.

Each view owns one controller subscription. Closing removes it and invalidates late
UI continuations without disposing the service. Scans and their promises belong to
the controller: closing/reopening a tab preserves running state and the last outcome.
The controller consumes failures even with no views attached. Plugin unload aborts
its scan and removes subscriptions. Recovery and scans are mutually exclusive.
There is no cancellation button or new progress API in this stage.

## Presentation

The post-1.9 home presentation is now the [visual Health dashboard](health-visual-dashboard.md):
Vault Pulse, recommendation, compact dimensions, real current metrics, then
secondary controls. That document supersedes the original card/footer layout
description below; this view's lifecycle, actions and recovery contracts remain.

A pure `healthHomeViewModel` maps the existing snapshot and typed scan outcome into
localized copy. New interface copy uses the existing English/Russian `i18n.ts`
contract. Recommendation ranking remains in the backend. The presentation mapper
localizes the selected local Finding's title/explanation; unknown types retain
their stored text. Persisted text and identity are never modified.

Before any scan the home offers **Scan my vault**, explains that the check is local
and requires no AI, and shows unknown local dimensions. Manual scans retain cached
cards while showing **Checking your vault…** and disabling Scan. There is no fake
percentage, polling, Health score, or Findings Inbox. A secondary inline profile
chooser appears after onboarding; it reuses the onboarding options and copy.

| Backend / outcome | Presentation |
| --- | --- |
| `good` with complete analysis | Good |
| `needs-attention` | Needs attention |
| `review-recommended` | Review recommended |
| `unknown` | Not fully analyzed |
| Basic depth, incomplete coverage | Basic analysis · incomplete |
| Knowledge | Not enabled before analysis; trusted Deep coverage or open Knowledge Findings enable the existing Knowledge-filtered Inbox |
| Recall | [Native scheduling state](recall-health-integration.md), always opens Recall when available |
| Completed scan | Vault check complete |
| Partial scan | Check completed with limited coverage; some areas could not be fully verified |
| Stale scan | Vault changed; no scan results were applied; Scan again |
| Failed scan | Could not complete; previous Health results were not replaced; Try again |
| Findings committed, history failed | Health results saved; scan history could not be updated |

The view never equates `basic` with completeness. A failed/partial outcome cannot
render Good from absence even if the previous cached snapshot was complete. Known
attention/review Findings remain visible. Cards show dimension, state, open count
and depth/completeness; the footer shows the total open count.

At most one backend recommendation appears. Its optional **Open note** button uses
the referenced Finding's first affected path, not its action descriptor. The view
checks canonical scope and an existing Markdown `TFile` again on click, then calls
`WorkspaceLeaf.openFile()`. Missing notes produce an inline message and leave Findings
unchanged. No generic action executor or Markdown mutation is introduced.

## Recovery and durability

`HealthRecovery` is a storage abstraction outside the view. Recovery requires a
native confirmation modal stating that only Health metadata is reset and that
notes, semantic index, and AI provider settings are unaffected. Cancel is initially
focused. The controller independently verifies the allowed scope after confirmation.

* Invalid, unsupported, or unavailable Findings: block Scan; back up/reset both
  Findings and history so old scan receipts cannot describe a new Findings store.
* Valid Findings with damaged history: offer history-only recovery; Findings and
  manual scans remain usable, and missing history cannot establish healthy absence.
* Permission/I/O failures are described as inaccessible storage, not assumed corruption.

Only these paths can be moved, using the injected root:

```text
<configDir>/plugins/<manifest.id>/health/findings.json
<configDir>/plugins/<manifest.id>/health/scan-runs.json
```

Existing files are renamed verbatim with supported `DataAdapter.rename` into:

```text
<root>/recovery/findings.<epoch-ms>-<uuid>.recovery.json
<root>/recovery/scan-runs.<epoch-ms>-<uuid>.recovery.json
```

Both originals and backup destinations are checked before moving; destination
collisions fail rather than overwrite. No parsing/migration of unknown schemas,
Node filesystem API, deletion, or blank-file overwrite is used. Reset leaves missing
Health files, which the existing storage code initializes on the next explicit scan.
If a move fails, earlier moves are restored where possible. If rollback also fails,
the surviving backup is retained and the UI reports failure. Multi-file recovery is
not a filesystem transaction; interrupted recovery may require manual restoration
from the retained backups. Backups are deliberately not pruned automatically.

After successful recovery the controller drops the old subscription/service/store
and initializes a fresh owner. The old idempotent, write-blocked store is never
unblocked in place. The replacement starts conservatively until a new full scan.
Recovery never accesses Markdown notes, `note-index.json`, `semantic-index/`,
`data.json`, provider keys, Companion data, or proposals. Normal scan durability
remains the application layer's separate Findings and history commits.

## Layout and accessibility

Styles are scoped to `.veynrel-health-*` and use Obsidian theme variables. Cards use
two columns with `minmax(0, 1fr)`, collapsing to one at a 520px view-container width;
a 600px viewport rule also covers narrow hosts. Primary buttons expand to full
width. Text wraps without fixed card widths. Actual buttons, visible keyboard focus,
text plus icons, and a persistent polite status live region provide keyboard/touch
access. No hover-only actions, animation, or motion dependency is present. Attention
states use calm text; error styling is reserved for actual failures.

## Validation and remaining stages

Unit tests cover view-model copy/completeness, controller singleton and scan lifetime,
view subscription cleanup, deferred leaf opening, note validation, confirmation and
recovery failure/rollback. A transitive source audit keeps the Health dependency graph
free of AI/network/Companion code and Vault Markdown mutation calls. Real desktop
smoke evidence is recorded in the PR; narrow desktop testing is not native mobile
validation. Custom themes, mobile and popout windows retain separate platform checks.

PR 5 adds onboarding/profile UX. PR 6 owns the Findings Inbox and lifecycle/action
UI. [Recall Health](recall-health-integration.md) now observes the shared native
Recall owner; normal Health entry may read Recall metadata after onboarding.
Deep Health, automatic Recall scans and settings redesign remain out of scope.
Existing AI writing, semantic search, RAG, Deep Audit, Companion and proposal
workflows remain separate and keep their existing behavior.

### Desktop smoke recorded 2026-09-22

Tested the installed Obsidian 1.12.7 / Electron 39 runtime with an isolated profile
and three synthetic notes, without provider credentials. The installed final
`main.js` matched the repository production build (SHA-256
`2bb3da75c31b321e2326d53aaa0d7623c541a7dd99ce717e69f92bcafb076e2b`).

* Ribbon reuse: three clicks, one Health tab; opening read zero notes, wrote zero
  files and made zero observed fetch calls. A restored/reopened view did not scan.
* Manual scan: three notes read once; broken-link and orphan Findings; only the two
  Health JSON files written. Running disabled Scan and retained the dashboard.
* Close/reopen during a gated read retained the same owner and running state.
  Open note navigated to the expected Markdown file. Tools and the legacy control
  command opened the existing batch modal. All 20 old plugin commands plus the one
  new Health command were registered; no live AI/provider operation was attempted.
* Controlled missing metadata, revision change and enumeration failure exercised
  partial, stale and failed UI states. Known Findings stayed visible; absent
  connections never became Good from those outcomes. No runtime errors observed.
* History-only recovery preserved Findings. Unsupported Findings required a blocking
  confirmation, Cancel preserved bytes, and reset kept verbatim recovery backups.
  Both paths replaced the service; synthetic notes and plugin settings were unchanged.
* Inspected dark and light native themes. At a 390px desktop viewport the Health
  content was 334px wide with no horizontal overflow, one card column and a full-width
  primary button. Native Tab navigation reached Scan with a visible 2px outline.

This is desktop/narrow-window evidence, not an iOS/Android, popout, custom-theme, or
provider/Companion end-to-end certification. Recovery failure/rollback and late
history-write failure are covered by synthetic tests; filesystem power loss is not.
