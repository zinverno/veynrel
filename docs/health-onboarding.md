# Health onboarding (migration PR 5)

Baseline: clean `main` at `b41d5edebdcd97fd5405ace874795f08b302911c`, after PR #30
was merged. Branch: `feat/health-onboarding`. No version, release, tag or merge.

The existing Health ItemView now asks one optional question about vault purpose,
offers an explicit local scan, shows one useful result, then opens the existing
Home. It asks for no API keys, providers, embeddings, LLMs or Companion setup.
No automatic or inferred profile selection occurs. The local-scan copy remains
“No AI required. Nothing leaves your device.” This describes that scan only.

## Durable preferences and migration

Only the existing plugin `data.json` receives a new `health` block:

```ts
interface HealthPreferences {
  profile: VaultProfile; // Existing learning | research | work | personal | mixed
  profileChosen: boolean;
  onboardingCompleted: boolean;
  onboardingVersion: number;
}
// Defaults; current onboardingVersion is 1.
{ profile: "mixed", profileChosen: false, onboardingCompleted: false, onboardingVersion: 1 }
```

`mergeHealthPreferences(unknown)` returns only these four fields. Missing or
non-object blocks use independent defaults. Invalid profiles become `mixed`;
non-boolean intent flags become `false`, without truthiness coercion. This PR
normalizes the version to 1 while retaining valid intent flags. It does not force
a version-based replay. Unknown extra Health preference keys are discarded.

The merge extends the existing embedding/Companion merge path. Provider, semantic,
Companion, Deep Audit and UI values remain intact. Missing preferences alone do
not cause a startup save; the pre-existing Companion vault-ID migration still
behaves as before. Test credentials are synthetic and compared without printing
their values. No Health preference enters Findings/history or any index.

`HealthPreferencesPort.get()/update()` isolates consumers from `AIHubSettings`.
`HealthPreferencesController` copies reads/patches and serializes updates. Its host
callback uses `plugin.saveSettings(nextHealth)`, saving a candidate settings object
before assigning `plugin.settings.health`. Ordinary settings saves share the queue
so a concurrent save cannot persist an older profile over a new choice. Failure
leaves the effective profile/intent unchanged, reports fixed localized copy, and
allows retry. It does not promise filesystem crash-atomicity beyond `saveData`.

## State derivation and first result

`healthOnboardingViewModel` derives the route; transient scan state, result copies
and recommendations are not persisted:

| Condition, in priority order | Route |
| --- | --- |
| Findings or history require recovery, or recovery is running | Existing recovery UI |
| `onboardingCompleted` | Existing Health Home |
| Profile not chosen | One profile question with Skip |
| Busy, error, absent/unreconciled scan, failed/stale/unverified outcome | Scan |
| Reconciled completed or partial result | Result |

A usable result requires `lastLocalScanReconciled` and a completed/partial scan.
If an in-session outcome exists it must match the scan, be fresh and committed.
That flag uses the service's existing reconciliation/receipt semantics, including
matching durable timestamps after restart; the scan algorithm is unchanged.

* Complete Structure and Connections, both `good`, with no open review/attention
  Findings: **Baseline check complete** and the narrow structural-attention claim.
  Informational findings alone do not invalidate this claim.
* Backend recommendation with a safely resolvable note: one localized Finding,
  **Open note**, and **Continue to Health**. The action never executes a persisted
  action descriptor; it rechecks the existing Markdown path before navigation.
* Open Findings without a safe recommendation CTA: a review count and Continue.
* Partial/incomplete coverage: limited-coverage copy, a known recommendation when
  available, Continue and Scan again. Absence never becomes a healthy baseline.
* Stale/failed attempts: stay at Scan with existing outcome copy. After restart,
  an unmatched receipt uses conservative unverified-result copy and Scan again.
* Findings committed but history write failed: retain honest PR #30 status copy.
  In-session reconciliation may support a result; restart uses durable semantics.

Selecting a profile saves `profile` and `profileChosen: true` immediately, without
scanning. Existing trustworthy Health scans are reused. No index rebuild, Deep
Audit rerun or provider reconfiguration occurs. Closing before scanning resumes
at Scan. An existing trustworthy result resumes at Result until acknowledged.

Continue alone saves `onboardingCompleted: true`. Starting a scan does not complete
onboarding. A failed completion save retains Result. Initial Skip saves `mixed`,
`profileChosen: true`, `onboardingCompleted: true` and opens normal Home permanently.
The later Change profile control has no Skip; Mixed is an ordinary explicit choice.

Recovery backs up/resets only existing Health metadata and creates a fresh service
owner. It never resets profile or either intent flag. History-only recovery retains
PR #30's usable Findings/scan behavior, while taking precedence over onboarding.

## Profiles and presentation

| Value | English | Russian |
| --- | --- | --- |
| `learning` | Learning & studying | Учёба и обучение |
| `research` | Research & writing | Исследования и тексты |
| `work` | Work & projects | Работа и проекты |
| `personal` | Personal knowledge base | Личная база знаний |
| `mixed` | Mixed / I'm not sure | Смешанное / пока не уверен |

Names and descriptions are shared by initial onboarding and the inline Home
chooser via `healthProfileOptions.ts` and existing `i18n.ts`. The English descriptions
cover learning theory/courses/technical material/languages; connecting research
ideas/sources/notes; organizing project knowledge/documentation/working notes;
using Obsidian as a general second brain; and balanced recommendations. Russian
descriptions convey the same uses naturally. Supporting copy explicitly says that
only recommendations change and all features remain available.

The persisted profile flows into `HealthService.getSnapshot(profile)`. Existing
backend impact/confidence/profile/recency/ID ranking stays in place. There are no
profile parameters in detection, scan scope, or reconciliation. The secondary Home
control saves and rerenders without changing Findings, history or capabilities.

`findingPresentation.ts` maps known **local** Finding types to EN/RU title and short
explanation keys, shared by Home and onboarding:

`broken-link`, `orphan-note`, `no-incoming-links`, `no-outgoing-links`, `empty-note`,
`near-empty-note`, `exact-duplicate-group`, `duplicate-title-group`,
`isolated-graph-component`.

Unknown types and nonlocal sources fall back to persisted title/explanation. The
mapper returns two strings; it never localizes or changes IDs, fingerprints, types,
analyzer IDs, evidence kinds, sources, actions or persisted prose. No UI ranking or
raw technical evidence interpolation is added.

## Interaction and validation

Profile options are native buttons for mouse/touch/keyboard with visible focus,
`aria-pressed`, and a textual checkmark for the selected option. Focus stays within
the active view when a step/button disappears. One live status region remains
mounted. Theme variables and wrapping layouts support narrow workspace panes.

53 test cases were added (1,141 -> 1,194 repository tests; 292 -> 345 Health-related
tests), in four new test files and expanded controller/view suites. Existing
service receipt tests gained assertions and existing settings fixtures gained the
new required default. Checks prove five profiles produce identical Findings,
eight analyzer versions and vault scope; work -> research changes only the backend
recommendation, with zero note reads or Health storage writes. Restart and failure
tests cover profile, scan, result, completion, Skip and recovery semantics.

Verification on this branch:

* `npm ci`: passed; unchanged lockfile reports 7 dependency advisories (4 moderate,
  3 high), outside this PR's scope.
* `npm run typecheck`: passed, including strict Health compilation.
* `npm test -- health`: 345 tests / 21 files passed.
* `npm test`: 1,194 tests / 53 files passed.
* Focused settings/preferences/onboarding/presentation command: 57 tests / 6 files
  passed (the settings filter also matches existing Companion settings tests).
* `npx eslint health`: passed with no warnings.
* `npm run lint`: passed; the existing `api.ts:413` fetch warning remains.
* `npm run audit:proposals`: all 5 mutations killed; restored tests passed.
* `npm run build`: passed. Emitted runtime imports are Obsidian only, with 46 Health
  production inputs and no test/server inputs. The transitive Health boundary test
  forbids AI/network/Companion imports and Markdown mutation calls.

No changes to analyzer IDs/versions, Finding types/fingerprints, FindingStore or
Health storage schemas, scan algorithms, plugin ID/version, existing commands,
ribbon leaf reuse/DeferredView semantics, or legacy Tools. Custom exclusions,
template exclusions, AI unlocks and the Findings Inbox remain later work.
