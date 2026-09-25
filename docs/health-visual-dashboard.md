# Health visual dashboard

The first visualization milestone after Veynrel 1.9 changes only Health home
presentation. The existing `HealthSnapshot`, controller outcomes and Recall
metadata supply every value. Opening Health remains passive.

## Visual language and hierarchy

1. **Vault Pulse:** current Health signal, finding count, coverage, last committed
   check and the existing explicit local Check action.
2. **Recommended now:** the existing recommendation, localized title/explanation,
   Open note and Review finding. Selection and ranking are unchanged.
3. **Four dimensions:** icon, area, discrete state, one primary metric, analysis
   depth/completeness and a decorative status rail. Recall prioritizes due cards;
   other enabled dimensions show open Findings. Disabled capabilities stay neutral.
4. **Current insights:** Findings by area beside the latest local check, Recall
   metadata and Knowledge metrics. Smaller panels share horizontal space on desktop.
5. **Secondary controls:** profile and Tools. Existing Semantic/Deep setup surfaces
   follow the dashboard with their current explicit actions and consent boundaries.

Pulse means current Health; dimensions identify areas; charts show measurements;
Findings identify actionable work. A graph is reserved for real knowledge
relationships. No graph or topology placeholder is drawn here.

Repeated introductory descriptions and the second total-findings block are removed.
The local-only privacy statement is a small secondary line attached to the local
check, not a claim about all Veynrel functionality. Recall retains the explanation
that only tracked cards are counted and inventory refresh is explicit.

## Pure presentation model

`healthHomeViewModel` includes a `HealthDashboardModel`, derived by
`healthDashboardModel` without IO or DOM access. The model contains Pulse, the four
Findings rows, latest local-check metrics, Recall metrics and Knowledge metrics.
Existing home card/recommendation/recovery models remain their presentation owners.

`VaultPulseModel` has a discrete `state`, localized label, separate discrete
coverage and label, real `openFindings`, optional epoch `lastCheckedAt` and localized
last-check text. Its only numeric values are the actual count and timestamp.

Priority is:

1. A Local, Semantic or Deep Health scan running → **Checking…**.
2. Any current dimension needs attention → **Needs attention**.
3. Otherwise any current dimension recommends review → **Review recommended**.
4. Every enabled dimension is trusted, complete and currently Good → **Stable**.
5. Otherwise → **Unknown**.

“Stable” names the current Good state. It does not assert an improvement, trend,
retention rate or comparison with earlier scans. Empty/unknown enabled dimensions
cannot establish Good merely because their finding counts are zero. Disabled
Recall/Knowledge do not prevent Good. Recall storage recovery/unavailability is
unknown, not a fabricated finding or attention count. Mutations and recovery do
not animate the signal as if a scan were running.

There is no Health score, percentage health, normalized severity or BPM. Changing
a count without changing a dimension state never changes Pulse shape or speed.

## Coverage and scan association

Coverage is independent of severity, scoped to enabled areas, and never expressed
as a percentage:

| Label | Meaning |
| --- | --- |
| Complete coverage | All enabled dimensions have trusted, complete coverage |
| Mixed coverage | Some enabled dimensions are complete, others are not |
| Limited coverage | An enabled area has established data, but none has complete coverage |
| Coverage not established | No enabled area has trusted coverage/ready tracked-card metadata |

A completed/partial Local or Deep scan must have its existing `last*ScanReconciled`
flag. Connections at Semantic depth also require the independent Semantic
association. These flags already encode the store's receipt checks; the dashboard
neither reconstructs receipts nor changes aggregation. `analysisComplete` is still
required. A partial/failed/uncommitted/stale latest outcome cannot promote an older
Good result. Recall completeness means ready tracked scheduling metadata, not a
fresh vault-wide inventory or objective memory quality.

`lastCheckedAt` is the latest completion timestamp among associated, committed
Local/Semantic/Deep checks. An unassociated or failed attempt does not advance it.
The separate **Last local check** panel describes the actual latest attempt,
including Failed/Partial status; it does not pretend that failed results were
applied. Dates use `Intl.DateTimeFormat(dateLocale())` with local date and time;
formatted strings are never persisted.

## Measurements and limitations

| Visual | Existing source | What is deliberately absent |
| --- | --- | --- |
| Findings by area | `snapshot.dimensions` open/attention/review counts | Second Finding scan or new filters |
| Last local check | `lastLocalScan.notesSeen`, created/updated/resolved, status, completedAt | History trend or comparison |
| Recall | Ready, enabled metadata: active, due, new, nextDueAt | Retention, history, success rate or future workload |
| Knowledge | Associated `lastDeepScan.notesSeen`, current Knowledge open Findings, depth/completeness | Developed/Polished distribution or another MAP run |
| Recommendation | Current selected recommendation/Finding presentation | New ranking or generated explanation |

Findings order is always Structure, Connections, Recall, Knowledge. Info is
`max(0, open - attention - review)`. The shared scale is the largest current open
count. Each segment width is `impactCount / maximum`, so the entire row is
`openCount / maximum`. With 78 versus 1, the ratios are 1 and 1/78. **There is no
minimum visual width.** Zero rows have zero-width segments and exact text counts;
an all-zero chart never divides by zero. The striped Review segment, solid
Attention segment, muted Info segment, visible exact breakdowns and legend avoid
relying on color alone. Recall scheduling signals create no Recall Findings.

Area buttons reuse the existing Findings dimension filter. Recall opens the
existing Recall workspace, including its established setup/recovery behavior.
Knowledge metrics never reconstruct missing classifications from draft Findings.
No history store/API is exposed for decoration and no historical data is invented.

## SVG, themes, motion and accessibility

`renderVaultPulse` uses Obsidian's native `createSvg` helper: one SVG, two paths.
All five shapes are code-owned constants. Curved signals deliberately avoid a
medical heartbeat. There is no Canvas/WebGL, foreignObject, HTML injection, remote
resource, note-derived SVG or chart dependency.

Pulse and primary highlights use `--interactive-accent` and
`--interactive-accent-hover`; text, backgrounds, rails and bar textures use
Obsidian tokens. No brand palette is imposed. A user's yellow accent remains yellow.
Typography uses the existing UI/heading/font-weight variables.

Normal states are static. Checking uses a restrained four-second CSS travelling
highlight over a visible base path. There are no JS animation loops, polling,
per-frame measurements or ResizeObservers. `prefers-reduced-motion: reduce`
disables that animation and removes dashes, leaving a static emphasized signal
and identical adjacent text. The optional scan-completion sweep is deferred: this
version needs no new transient view state, cleanup timer or replay guard.

SVG and status rails are decorative (`aria-hidden=true`). Real text exposes the
state, coverage, count and check time. Buttons keep stable `data-health-action`
keys and the existing view focus restoration; visible focus outlines remain.
The persistent polite live region and busy-state behavior are unchanged.

The wide layout uses four dimension columns and a two-column insights grid.
At intermediate widths dimensions use two columns. At narrow split widths the
cards/panels stack. Container queries follow actual Obsidian leaf width; no
ResizeObserver is needed. Default theme small text remains 13px in the measured
native environment, and primary state/metrics have stronger hierarchy.

## Passive IO, onboarding and recovery

No analyzer, controller, store, schema, scheduler or provider is added/modified.
Opening/rendering consumes cached snapshots and existing persisted metadata only.
The existing first-entry Health/Recall metadata reads remain; there are no added
Markdown enumeration/reads, network/embedding/LLM calls, writes or automatic scans.
Native instrumentation observed two existing metadata reads and zero active IO;
one host workspace write was distinguished from plugin persistence.

Onboarding still controls entry. Blocking Findings recovery returns before Pulse
or charts are rendered. History-only degradation retains the current dashboard
where permitted, with unestablished coverage. Missing scans/capabilities and zero
Findings have explicit empty copy instead of broken chart containers. EN and RU
strings use the existing translation system without raw keys.

## Verification and evidence

Baseline: `a10776422379f77bfc35068cec14a6e2a6ad691d`; branch:
`feat/health-visual-dashboard`; tested implementation commit: `98c6ec0`.
Production bundle hashes, all measured native
cases, interaction/IO results and limitations are in
[native.json](health-visual-dashboard-evidence/native.json).

- `npm ci`: passed, unchanged lockfile/dependencies (seven existing development
  dependency advisories: four moderate, three high).
- `npm run typecheck`: passed.
- `npm test -- health`: **852 tests / 38 files passed**.
- `npm test`: **2,359 tests / 97 files passed**.
- `npx eslint health`: passed without warnings.
- `npm run lint`: passed; only the existing `api.ts` streaming-fetch advisory.
- `npm run audit:proposals`: **5/5 mutations killed**, restored tests pass. The
  sandbox child process initially produced no output; the unchanged audit passed
  in the host environment. No test or audit was weakened.
- `npm run build` and diff whitespace check: passed.
- A separate source review found no remaining blockers. The explicitly specified
  “Stable” label was retained as a discrete state name, as defined above.

The installed **Obsidian 1.13.7 / Electron 39.8.10 on Linux** was launched with a
separate disposable profile and synthetic vault. Eight scenarios × EN/RU × default
dark/light × 320/390/768/1280 viewport widths = **128 passed cases**. All cases
checked horizontal overflow, button reachability, localization and current state.
Exact seeded Recall 143/12/4, Knowledge 148/7 and skewed 78/1 bars were asserted.
Scanning used the real local scan with a held synthetic read; recovery used actual
invalid synthetic metadata. Other scenarios loaded serialized Health/Recall
fixtures through the existing stores and aggregation. No personal vault was
inspected or automated.

Native interaction checks passed: real Tab focus/visible outline after rerender,
existing area filters and Recall navigation, recommendation detail, custom yellow
accent propagation, passive initial entry/reopen, reduced motion, and an actual
explicit local scan through committed completion. Twenty synchronous renders had
an 8.3ms median and 16.5ms maximum on this host (172 view nodes); this is not a
frame-rate or cross-device performance claim. No native JS exceptions occurred.

Representative synthetic screenshots:

- [Attention, desktop](health-visual-dashboard-evidence/health-attention-desktop.png)
- [Attention, 390px](health-visual-dashboard-evidence/health-attention-390.png)
- [All enabled Good, light desktop](health-visual-dashboard-evidence/health-good-desktop.png)
- [Scanning](health-visual-dashboard-evidence/health-scanning.png)
- [Reduced motion, static scanning](health-visual-dashboard-evidence/health-reduced-motion-static.png)

Reproduction: use a separate native profile/vault, install the three built assets,
seed the scenario counts listed in `native.json` through the existing versioned
Health/Recall codecs, and repeat the recorded viewport/theme/language combinations.
The session fixture generator/CDP scripts are retained in
`/tmp/health-visual-smoke/`; they guard the exact disposable vault path. No
credentials, personal paths, note contents or personal screenshots are evidence.
The matrix verifies desktop responsive widths, not mobile OS behavior. This
milestone does not claim popout, screen-reader output, third-party theme or personal
installed-vault validation. GitHub CI is checked on the exact final PR HEAD and
reported in the handoff, avoiding a self-referential evidence commit.

## Next visual milestone

**Real Vault topology / relationship visualization**, through an explicit narrow
local visualization port for nodes, edges, components, orphans, bridges and broken
targets. Findings counts cannot reconstruct that graph truthfully.

**Interactive semantic neighborhood** also waits for a contract describing the
selected note, related-note similarity and edges/weights. Neither graph is
implemented or represented by a decorative placeholder here.

No version bump, tag, release or dependency addition. The PR remains open/unmerged.
