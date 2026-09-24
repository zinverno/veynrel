# Deep Intelligence setup

Baseline: merged PR #41, `f5104ab17d67006f9d8f4ace390b5178a983368f`.
Branch: `feat/deep-intelligence-setup`. No version change or release.

Deep Intelligence is the simple Health-page setup path for Veynrel's existing
language-model tools. It configures deeper reasoning for Deep Audit, Single Audit,
Ask Vault, writing/transformations, batch tools, flashcards and MOC workflows.
Those tools retain their existing command IDs and read the same shared settings.
Setup does not run them. Setup alone leaves Knowledge Health **Not enabled**; no Knowledge
analyzer, Findings, ScanRun or reconciliation receipt is added by setup. The
subsequent [Knowledge Health](knowledge-health.md) path adds explicit, confirmed
analysis and Findings through a separate Health-owned analysis port.

## Ownership and boundaries

```text
AIHubPlugin (one lifetime)
  settings save queue -> data.json
  LanguageModelSettingsPort -> existing AIHubSettings fields
  LanguageModelConnectionPort -> existing testConnection(complete candidate)
  DeepIntelligenceController -> health/deepIntelligencePort.ts
    -> VeynrelHealthView x N -> inline Health section and transient setup
```

Health depends only on its own product contract. It imports no `api.ts`,
`settings.ts`, provider implementation, Deep engine or transport. The controller
owns no `AIHubSettings` object. Its narrow settings snapshot has `provider`,
`apiKey`, `model`, `baseUrl`, `temperature` and `topK`; only the four connection
fields can be changed through Simple setup. Temperature, topK and Deep Audit
tuning stay unchanged, including newer concurrent Advanced edits.

`data.json` remains the sole durable source. There is no `deep.enabled`, persisted
Ready flag, credential store, provider-settings file or second language-model
client. The host constructs the complete candidate and calls the existing
`testConnection()`. Existing `validateSettings()` is re-exported from the same
pure validator used by Deep; its rules and existing callers remain unchanged.
The `InsertionType` type moves to constants and is re-exported from settings to
remove a type dependency on the host UI. Provider profiles remain in their
existing authoritative table.

## Providers and drafts

| Provider | Profile default model | Simple fields | Key |
| --- | --- | --- | --- |
| Ollama | `llama3.2` | Model | Not required |
| OpenRouter | `openrouter/free` | Model, API key | Required |
| OpenAI | `gpt-4o-mini` | Model, API key | Required |
| Groq | `llama-3.1-8b-instant` | Model, API key | Required |
| Custom OpenAI-compatible | Empty | Base URL, Model, API key | Optional |

Labels, default endpoints/models and key requirements come from
`PROVIDER_PROFILES`. The chooser adds only presentation categories: local, cloud
and custom. The model IDs above are profile defaults, not recommendations,
availability guarantees or price claims.

Choosing the currently configured provider copies its existing endpoint, model
and key into an in-memory draft, including customized standard-provider endpoints.
Choosing another provider uses its profile defaults and an empty key. Standard
endpoints normally need no editing; Custom exposes Base URL. Advanced retains
its endpoint controls for every provider, model tools, key controls and tuning.
No model catalog or pricing request runs when opening the chooser or form.

Every provider exposes an editable model field. Keys use `type=password` and
`autocomplete=off`; they appear only in settings or an intentional editing draft.
Back, page navigation and view close discard the UI draft. Draft origins are
kept privately in a WeakMap, so another view or Advanced cannot silently make an
already-open form overwrite a newer connection even before Connect is clicked.

## State and explicit actions

| Product state | UI | Meaning |
| --- | --- | --- |
| `unconfigured` | Not configured | Shared settings fail existing structural validation |
| `configured` | Configured | Usable settings without a current successful explicit test |
| `ready` | Connected | This exact configuration passed a test in this controller lifetime |
| `busy` | Connecting… / Checking… | One explicit connection operation is in flight |
| `error` | Connection failed | An explicit test of the current configuration failed |

Validation enforces a known provider, model, Base URL, profile-required key and
the existing temperature rule. Invalid legacy settings are neither reset nor
saved. Normal host loading/provider inference remains authoritative; Deep does
not infer providers or migrate settings. Existing valid configurations appear as
Configured without re-entry, testing or an additional migration write.

The private in-memory connection signature includes provider, Base URL, model and
key. It is never exposed or persisted. Advanced connection changes invalidate
Connected and notify mounted views without network activity. Tuning changes do
not change the tested connection identity. Restart returns valid settings to
Configured. Connected records a past explicit check, not an ongoing availability
guarantee; Ollama's existing test checks availability/model listing, not inference
or the presence of the selected model.

**Connect:** reject duplicates; copy the draft before awaiting; validate; test;
persist transactionally; publish the saved fields; associate Ready only with the
tested signature. Test failure saves nothing and leaves the committed settings
unchanged. Save failure cannot publish the candidate as Ready. The form remains
retryable with a bounded localized `invalid`, `connection`, `save` or `busy`
message. A failed different draft does not falsely mark the current configuration
as failed; its form shows the failure while the existing connection retains its
own status.

**Check connection:** copy current settings and call the same test exactly once.
No settings or other storage is written. Completion is associated with that
signature, so a newer Advanced configuration cannot inherit an obsolete Ready or
Error result. Deep Busy disables duplicate Deep actions but does not lock Health
scans, Findings navigation or Recall.

Construction, snapshots, ordinary rendering and chooser/form entry perform zero
network, provider tests, note enumeration, note reads or settings writes. A host's
pre-existing first-load Companion vault-ID migration is unchanged; Deep adds no
startup write. Subscribers are shared across views and exceptions are isolated.
Closing one view removes only its subscriptions. Operations belong to the shared
controller, so a current candidate can save after navigating away/closing the
initiating view. Epoch and setup-identity checks prevent resurrecting its form.

## Transactional settings and Advanced concurrency

The host uses the existing serialized settings-save queue shared by ordinary,
Health and Semantic saves:

1. Copy candidate/expected narrow settings before queueing.
2. Inside the queue, compare the expected connection with current settings.
3. Merge only candidate connection fields over current settings, preserving newer
   unrelated values, and await `saveData()` before publication.
4. Compare again after persistence. Legacy Advanced controls mutate in memory
   before queueing their save. If they changed a connection field during the
   write, restore the current settings on disk inside the queue and reject the
   obsolete candidate. A queued Advanced save still runs if correction fails.
5. Publish only successful fields into the existing settings object; notify
   subscribers without allowing observer exceptions to fail persistence.

Advanced edits during testing and during persistence are covered separately.
Health preferences, Semantic credentials/settings, Companion options, UI options
and Deep Audit tuning are preserved. Simple setup never replaces a stale whole
`data.json`. No extra synchronization or migration is needed for Advanced to show
the new values on normal render or for existing LLM commands to consume them.

## Connection IO, privacy and costs

| Provider | Existing connection request |
| --- | --- |
| Ollama | `GET <configured endpoint without /v1>/api/tags` |
| Others | `POST <configured endpoint>/chat/completions`, user message `Hi`, `max_tokens: 1` |

Connect/Check send zero vault Markdown, selected text, Findings, Recall cards or
vectors. They construct/run no Deep analyzer and perform no embedding operation.
The public snapshot/view model contains no key, Authorization header, endpoint,
technical signature, provider response, raw error, prompt or note content. Product
errors and recorded evidence are bounded and contain no credentials.

Ollama uses its configured endpoint, which Advanced may customize; Custom sends
requests to the supplied endpoint. There is no absolute privacy guarantee for
arbitrary endpoints. Cloud/custom requests may cost money depending on provider
and model, including tests. No pricing lookup/estimate or free-model claim is made.
Note content is sent only by explicitly run existing LLM operations, never setup.

Semantic embeddings and their credentials remain separate from language-model
configuration. Setup never changes the semantic index/receipts, Recall cards/FSRS
state, or `health/findings.json` / `health/scan-runs.json`. Knowledge aggregation
is unchanged and remains Not enabled. No new navigation tab is added.

## Verification

- `npm ci`: completed; unchanged lockfile/dependencies. Existing advisories: four
  moderate and three high, deferred to dependency maintenance.
- `npm run typecheck`: passed, including the strict Health project.
- Focused Deep controller/settings/boundary plus Health view tests: 138 passed.
  Deep-only controller/settings/boundary tests: 55 cases.
- `npm test -- health`: 742 passed; `npm test -- semantic`: 345 passed.
- `npm test`: 2,052 passed across 87 files.
- `npx eslint health deep`: passed.
- Repository lint and build passed; lint retains only the previously reviewed
  streaming `fetch` warning. Proposal mutation audit: 5/5 killed outside the
  sandbox after the known empty child-process output failure inside it.
  Final diff/CI checks are recorded with the PR handoff.

Tests cover all five profiles, legacy/invalid configuration, minimal existing
transport requests, exact signature invalidation, key privacy, no note IO,
duplicate operations, safe failures, save rejection/retry, concurrent unrelated
settings/tuning, Advanced edits during testing/disk writes (including correction
failure), stale forms, subscriptions, two views and late completion. Existing
legacy transports and command IDs have contract regressions.

Native evidence: [results](deep-intelligence-evidence/native.json), with isolated
Obsidian 1.12.7 / Electron 39.8.10 and synthetic data only. The real bundled plugin,
views, Advanced controls, settings persistence and `testConnection()` execute;
only Obsidian's `requestUrl` boundary returns deterministic fixture responses and
rejects non-fixture endpoints. This verifies the native integration, not live
provider availability or cloud-model inference.

The native journey covers passive legacy config, Ollama and Custom Connect,
Advanced provider/model/endpoint edits, product-to-Advanced reflection, Check with
zero saves, failed Connect/Check, two shared views, late navigation and plugin
reload. Native tests also hold the provider test and then `saveData()` while a real
Advanced model control changes: both obsolete candidates are rejected and the
newer model remains on disk. Across setup/check the counters stay at zero for Markdown enumeration,
read/cachedRead, Health writes, Recall writes and semantic-index mutation.

The layout matrix covers 84 cases: EN/RU × dark/light × 320/390/1280px × Health,
chooser and five provider forms. It verifies no horizontal overflow, native
buttons, labels, password attributes, focus restoration and passive IO. Scoped
`aria-busy` leaves the live status region available. Narrow desktop emulation is
not native mobile, popout, screen-reader or custom-theme certification.

Representative captures: [Connected, EN/light, 390px](deep-intelligence-evidence/connected-en-light-390.png)
and [Custom setup, RU/dark, 390px](deep-intelligence-evidence/custom-ru-dark-390.png).

The independent code review identified a stale already-open draft overwrite;
the origin guard and controller/view regressions address it. No remaining material
finding was reported. Graphify had no repository graph to query; current source
and callers were inspected directly.

## Deferred

Knowledge Health analysis/Findings is the next step. No new Deep analyzer, automatic
audit, Hidden Connections, Connect product, embedding changes, Recall changes,
model benchmarking/catalog fetching, production dependency, version bump, tag or
release is included. The PR is intended to remain open and unmerged.

Existing dependency advisories and the reviewed SSE `fetch` advisory remain for
their separate maintenance work. Live provider testing and additional native
platform/accessibility coverage are not claimed. The baseline stores `topK` but
has no dedicated Advanced `topK` input; its existing value and behavior are preserved.
