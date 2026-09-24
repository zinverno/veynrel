# Knowledge Health v1

Knowledge Health offers an LLM-assisted review signal: which notes appear
underdeveloped or draft-like and worth revisiting? It does not verify facts,
identify hallucinations or contradictions, rate sources, or assess the user's
intelligence. A useful short note can be classified as a draft, and a polished
note can still be wrong. Users decide whether a Finding matters.

## One analyzer and one existing engine

The persisted compatibility contract is `knowledge-quality`, version `1`, source
`deep-ai`, dimension `knowledge`, type `knowledge-draft`, impact `review`, and
confidence `medium`. There is no deterministic/high confidence claim or score.
Only `quality === "draft"` creates a Finding. Developed and polished results
contribute coverage without creating Findings. Profiles never change detection.

```text
Check Knowledge -> content-sharing confirmation -> Start analysis
  -> HealthPluginController -> HealthService.runDeepScan
  -> DeepHealthAnalysisPort -> DeepHealthAnalysisAdapter
  -> DeepAuditEngine.runMapOnly (without NoteIndexManager)
  -> existing buildBatches / runMapPhase / analyzeBatch / callOpenRouter
  -> validated classifications -> FindingStore.reconcileBatch -> Deep ScanRun
```

Health imports neither the Deep engine, settings implementation, provider
internals nor `api.ts`. The adapter has no persistence capability. The existing
plugin-lifetime HealthService owns the single FindingStore. Local, Semantic and
Deep Health scans share one single-flight guard, with no queue of scans.

`runMapOnly` shares the existing note reads, truncation, batching, bounded
concurrency, MAP prompts, retry policy and language-model transport. Strict mode
is explicit and cannot be disabled by an absent or malformed language setting.
The locale for existing MAP prompts is fixed at run start. No second HTTP client,
provider abstraction, batching engine, retry loop or duplicate prompt is added.

The shared Deep scope excludes the configured plugin directory, `Templates/`,
paths beginning `.ai-backup`, and dot-prefixed note basenames. The original scope
policy is preserved in `collectDeepAuditFiles`; path and metadata validation
fails closed when a reliable revision cannot be captured.

Legacy `DeepAuditEngine.run()` and `ai-deep-vault-audit` retain MAP, REDUCE,
clustering/merging, final synthesis, optional index updates and the existing
report/Canvas caller. Knowledge never calls those later stages: it only needs
per-note classification. The adapter does not construct or load NoteIndexManager.

## Confirmation and configuration

Opening Health, clicking Check Knowledge, cancelling confirmation, and navigating
away perform no note enumeration, content reads, provider requests or writes.
Only Start analysis begins a scan. The confirmation is transient and navigation
or view close discards it. It explains bounded note-content sharing, no note
modification, multiple possible requests, and provider/model-dependent costs for
cloud/custom endpoints. Ollama copy names the configured Ollama endpoint; custom
copy says requests go to the configured endpoint. There are no price lookups,
monetary estimates, promised token counts or automatic connection tests.

Configured and Connected permit checking; Unconfigured, Busy and known Connection
failed do not in the normal UI. Check connection and Change remain separate.
Neither successful Connect nor Check connection starts Knowledge analysis.
Startup, Health open, Local/Semantic scans, Recall and settings saves never do so.

`getConsent()` is a metadata-only Deep Health port operation. It supplies a
provider kind and an opaque in-memory configuration generation. Consent is bound
to that committed configuration, and `analyzeKnowledge(signal, consent)` rejects
an obsolete token before reading the scope. Unsaved or failed Advanced edits
block Knowledge until the live relevant values match a committed configuration.
This prevents an uncommitted Ollama selection from describing local consent while
a previously committed cloud configuration would receive the notes.

The plugin copies committed provider, model, endpoint, credential, temperature,
topK, Deep tuning and language. Successful relevant configuration mutations
advance a generation, including changing A -> B -> A; unrelated Health settings
do not. Each scan copies that committed snapshot for all batches. A change during
analysis remains saved normally; it invalidates the old analysis without
restoring old settings or erasing existing Findings. API keys and raw settings
never appear in consent, the Health revision, Findings, ScanRuns or diagnostics.

## Strict validation and completeness

Every model entry is treated as untrusted JSON. A usable result requires a
canonical vault-relative Markdown path in the requested batch and quality
exactly `draft`, `developed` or `polished`. Unknown/batch-external paths are
ignored and make coverage incomplete. Duplicate paths invalidate that path,
including its first result. Invalid/missing quality never defaults to draft.
Missing paths, malformed entries, unreadable notes and exhausted batch retries
prevent complete coverage. Invalid JSON retains the existing strict parse/retry
behavior; failed responses never synthesize drafts.

| Analysis result | Reconciliation and history |
| --- | --- |
| Every eligible note has exactly one valid result, fresh | Complete scope; completed Deep ScanRun |
| At least one valid result, any missing/failed/invalid coverage, fresh | Positive candidates only; partial scope and ScanRun; absence resolves nothing |
| Nonempty scope, zero valid results | Failed; no Findings write or receipt advance |
| Empty eligible scope, fresh | Completed technical scan; Unknown, “No notes to analyze” |
| Unavailable, stale, cancelled before commit, or reconciliation failure | Failed; no new Findings or resolution |

An unknown extra model path can make a run incomplete even if all requested
notes have valid classifications. No invented path becomes a Finding.

The adapter verifies a collision-safe JSON representation of sorted
`[path, mtime, size]` tuples after MAP. Health verifies it again inside the queued
FindingStore `beforeCommit` guard, alongside configuration generation/currentness.
A mismatch commits no Findings or receipt. The in-session Health revision is a
random opaque token backed by an adapter WeakMap; it contains no content, paths,
credential or settings values and is never persisted.

As with Local/Semantic Health, there is a small race after the last freshness
check while the Findings write occurs. There is no filesystem/provider lock or
journal. A content change that restores identical path/mtime/size is outside this
metadata-revision guarantee. Classification reflects truncated content, not a
full-text proof of note quality.

## Findings, receipts and lifecycle

The existing fingerprint helper receives only source, analyzer ID, dimension,
type and the single note path. No model/provider, generated prose, quality text,
locale or timestamp enters identity. A renamed note has a new path identity.

Backend fallback copy is fixed:

- `Knowledge note may need development`
- `Deep analysis suggests this note may be incomplete or underdeveloped.`

Evidence is exactly `{kind: "deep-quality", value: "draft", path}` and the only
action descriptor is `{kind: "open-note", path}`. Health stores no body, main
idea, key points, entities, tags, links, prompt, raw response or generated
explanation. UI presentation is localized in EN/RU, including “Deep analysis” and
“Deep assessment: Draft”. There are no calibrated percentages or truth scores.
Affected-note navigation uses the existing safe read/navigation path; arbitrary
FindingAction kinds are not executed.

Deep ScanRuns use type `deep`, analyzerVersions `{"knowledge-quality":"1"}`,
actual captured eligible notesSeen, outcome counts, and the receipt map returned
by the actual Findings commit. Cancellation after scope capture retains the
captured total. Safe diagnostics are bounded codes: `deep-unavailable`,
`deep-analysis-failed`, `deep-partial`, `deep-vault-changed`, `deep-config-changed`,
`deep-reconciliation-failed`, `deep-cancelled`, and `history-not-recorded`.
Provider and storage exception text is never promoted into Health state.

The existing owner `deep-ai:knowledge-quality` is independent of Local and
Semantic receipts. Each source's reconciliation updates only its owners.
Dismiss/Snooze/Reopen advance global Findings updatedAt but preserve all receipts.
If Findings commit succeeds and history fails, the outcome reports that failure
while retaining committed Findings and receipts. After restart an older Deep
ScanRun cannot borrow the newer receipt; Local/Semantic associations remain
current. Recall does not use Findings or analysis receipts.

Existing lifecycle policy applies without a Knowledge exception:

- Draft reanalysis preserves Dismissed, and unexpired Snoozed, user intent.
- Complete absence resolves Open and Snoozed Findings. Partial absence resolves
  nothing. A resolved Finding that reappears opens with the same ID/firstSeenAt.
- **Dismissed absence remains Dismissed**, by the existing shared store contract.
  The requested dismissed -> improved -> Resolved scenario conflicts with that
  contract and the requirement not to introduce custom lifecycle. Resolution is
  verified after explicit Reopen; no generic lifecycle behavior was changed.

## Knowledge aggregation and UI

Trusted Deep coverage requires the latest completed/partial Deep ScanRun,
matching current nonempty scope receipts and the current analyzer version.

| Knowledge observation | State | Depth / completeness |
| --- | --- | --- |
| No trusted scan and no open Finding | Unknown / Not enabled | Not enabled / false |
| Open attention or review Finding | Needs attention or Review recommended | Coverage tracked independently |
| Trusted completed scan, notesSeen > 0, no open attention/review | Good | Deep / true |
| Trusted completed empty scope | Unknown / No notes to analyze | Deep / true |
| Trusted partial, no open positive Finding | Unknown | Deep / false |
| Trusted partial with open review Finding | Review recommended | Deep / false |

Positive persisted Findings remain useful without complete absence coverage.
Knowledge contributes to overall Finding counts and existing generic ranking,
but never changes Structure, Connections or Recall counts. No ranking weights or
profile behavior were added. The Knowledge card opens the existing Findings
Inbox filtered by Knowledge once it has trusted Deep coverage or open Findings;
there is no separate Knowledge page. Check Knowledge lives in Deep Intelligence.

During analysis the UI says “Checking knowledge…” and offers Cancel, with no
invented progress/ETA. Abort reaches the MAP engine and shared transport. No
unrelated connection test is cancelled. A precommit cancel records failed history
but preserves Findings. A durable Findings write already issued is completed and
reported truthfully, even when cancellation arrives during that write.

Plugin restart restores Findings/history/receipts without provider requests or
note reads. Deep setup may be Configured after restart; that neither hides
persisted Knowledge state nor prevents a new explicit, confirmed scan.

## Verification and limitations

Validation for this change:

| Command | Result |
| --- | --- |
| `npm ci` | Passed; dependency and lock files unchanged |
| `npm run typecheck` | Passed |
| `npm test -- health` | 807 tests across 37 files passed |
| `npm test -- deep` | 103 tests across 5 files passed |
| `npm test` | 2,119 tests across 89 files passed |
| `npx eslint health deep` | Passed without warnings |
| `npm run lint` | Passed; existing `api.ts:402` fetch warning only |
| `npm run audit:proposals` | 5/5 mutations killed; restored tests passed |
| `npm run build` | Passed |

One sandbox audit attempt lost child-process output; standalone reruns inside
and outside the sandbox passed. No proposal code or audit assertion was changed.

Automated coverage includes actual MAP-only engine/adapter reuse, malformed JSON
and classifications, invented/batch-external/duplicate paths, full and partial
coverage, no usable results, empty scope, fixed settings/locale, stale vault and
configuration inside the real store queue, consent after failed saves, abort,
lifecycle, history failure, three-source receipt isolation, aggregation and
EN/RU presentation. The existing legacy engine still exercises MAP -> REDUCE ->
synthesis with index updates. Health dependency boundaries remain enforced.

[Native evidence](knowledge-health-evidence/native.json) records real isolated
Obsidian 1.12.7 / Electron 39.8.10, synthetic notes and a deterministic injection
at `requestUrl`. The production bundle, shared transport, MAP engine, adapter,
service, store and UI run normally. No personal credentials or live model calls
are used. It covers passive entry/confirmation/cancel/navigation, mixed results,
detail, dismissal/rerun, improvement after Reopen, recurrence, partial batches,
cancel, fixed-model stale configuration, restart, EN/RU, dark/light and 390px.
Screenshots show [Finding detail](knowledge-health-evidence/detail-en-dark-390.png)
and [Russian consent](knowledge-health-evidence/confirmation-ru-light-390.png).

Byte/file-list checks prove unchanged Markdown and note-index.json, no report,
Canvas or MOC, no generated content in Health, and no Semantic/Recall storage.
Native desktop evidence does not claim Android/iOS, popout, screen-reader,
custom-theme, live-provider quality or pricing validation.

Deferred: factual verification, contradictions, credibility/source quality,
hidden connections, rewriting, additional Knowledge analyzers, model-calibrated
quality, and caching with explicit analyzer provenance. Legacy note-index.json
contains mixed provenance (including historical Single Audit records), so it
cannot prove Health coverage in v1; every check runs the entire eligible scope.
No note-index migration, dependency, version bump, tag or release is included.
