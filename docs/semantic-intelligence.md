# Simple Semantic Intelligence (PR #33)

This is the implementation record for setup. The current integrated product and
passive-IO contract are documented in [MVP hardening](mvp-hardening.md).

Baseline: clean, fast-forwarded `main` at
`7acc6f99bd9ee385955777691f5acbdcc664988b`, the actual PR #32 merge commit.
Branch: `feat/simple-semantic-intelligence`. No version bump, tag, release or merge.

## Product boundary

The existing Health workspace gains a secondary Semantic Intelligence section
below local Health. The four Health dimensions, Findings Inbox, onboarding and
recovery remain unchanged. Setup is a transient inline sub-flow; navigation remains
**Health | Findings**, with no new leaf or settings modal. Local Health works with
Semantic Intelligence disabled. No Semantic Findings are created.

`health/semanticIntelligencePort.ts` is the injected, product-only contract. Its
implementation, `semantic/product/semanticIntelligenceController.ts`, delegates to
the existing embedding validator/test and the existing controller's cached status,
explicit refresh, index, rebuild and search methods. Health imports no provider,
semantic controller or network implementation. No new vector store, provider,
watcher, algorithm or Companion integration is introduced.

Reading the snapshot, opening Health, entering setup, choosing a mode, editing and
Back perform no provider checks, index work, settings saves or local scans.
Snapshots contain enabled/state/provider label/model/vector count/busy information;
they contain no credentials, full settings, endpoint, raw error or index identity.
The pure view-model derives localized text and available actions. A small
subscription emits around explicit product operations and observes the shared
engine for Advanced-command and automatic-sync updates; there is no polling.

| Existing cached status | Product presentation |
| --- | --- |
| Semantic disabled | Enable Semantic Intelligence |
| Not initialized / not inspected | Configured; Check setup, Build index, Change setup |
| Initializing / indexing / active setup operation | Busy; duplicate actions disabled |
| Ready, zero vectors | Index required |
| Ready, positive vector count | Ready; Search by meaning, Change setup |
| Incompatible | Index needs rebuilding; Rebuild, Change setup |
| Error | Needs attention; Check setup, Change setup |

A successful connection with no usable index shows **Connected / Index required**,
not Ready. Dimensions appear only in the setup success confirmation. Normal Ready
shows provider/model and vector count, without dimensions, generation or space ID.

## Presets, drafts and connection testing

Provider profiles in `embeddings/types.ts` remain authoritative:

| Choice | Existing provider | Profile default URL | Profile default model |
| --- | --- | --- | --- |
| Local & private | Ollama | `http://localhost:11434` | `embeddinggemma` |
| Cloud | OpenRouter | `https://openrouter.ai/api/v1` | `openai/text-embedding-3-small` |
| Custom | OpenAI-compatible | Existing Custom value, otherwise profile default | Existing Custom value, otherwise profile default |

There is no persisted `semanticMode`, route, draft or connection result. Selecting
a preset does not mutate settings. Only the view's form holds draft credentials;
closing, Back or leaving the sub-flow discards it. Existing embedding credentials
may seed the corresponding password field. Local/Cloud always test their profile
defaults; Custom permits editing URL/model/key. Language-model credentials are
never borrowed or changed.

Connect copies the draft, validates through `validateEmbeddingSettings`, then calls
`testEmbeddingConnection(candidate)`. Existing HTTP(S), model and official OpenAI
API-key rules remain authoritative. Custom endpoints can omit a key where the
existing validator allows it. The existing test embeds only the fixed phrase
`Vault Audit AI embedding test`; it does not enumerate or read Markdown. Status
inspection after commit reuses the persisted embedding descriptor. It does not
probe provider dimensions, enumerate notes, or read note content.

One product operation runs at a time. Mode switching, fields, Connect, Build and
Rebuild cannot queue duplicate work. Errors are safe localized categories: invalid
configuration, connection failure or save failure. Ollama failure includes guidance
to run Ollama and install its model. No installation, shell execution, automatic
provider discovery or model catalog fetch is added.

## Persistence and concurrent edits

`SemanticSettingsPort.get()` and `update()` return copies. `AIHubPlugin` uses the
same promise queue for ordinary saves, Health preferences and semantic setup:

1. Copy the candidate and expected previous semantic settings.
2. Inside the queue, read the latest ordinary settings and reject a stale semantic
   candidate if Advanced settings changed during the connection test.
3. Persist the merged settings with `saveData` before publishing the candidate.
4. If legacy Advanced controls changed effective semantic settings during that
   disk write, persist their current values in the same queue, reject the obsolete
   setup and do not publish or invalidate it.
5. Otherwise update the existing semantic object in place, preserving references
   captured by Advanced controls, then call `notifySettingsChanged` exactly once.
6. Explicitly inspect the resulting semantic status and notify the product view.

A failed connection performs no save. A rejected initial save leaves the previous
effective settings and controller configuration intact. No optimistic enablement
or invalidation happens before persistence. Ordinary `notifyOnCopy` edits survive
both queue orderings; tests also cover Advanced edits during both testing and disk
I/O. Every LLM setting (`provider`, `apiKey`, `model`, `baseUrl`, `temperature`) and
unrelated setting survives a successful semantic connection unchanged.

This is an effective-settings transaction, not a new filesystem transaction layer.
Obsidian's `saveData` still defines disk durability. If a candidate write succeeds,
Advanced changes during that write, and both the corrective write and queued
Advanced save fail, effective Advanced settings remain intact but durable state
cannot be guaranteed. The failed setup is not published or notified. A regression
also covers a failed corrective write recovered by the queued Advanced save.

## Existing index and automatic synchronization

Connect never builds, clears or rebuilds an index. First Build delegates to
`ObsidianSemanticController.indexVault()`, including its existing file count,
privacy/provider confirmation, indexing, error handling and activation of
automatic synchronization. Rebuild is available only for an incompatible index
and delegates to `rebuildIndex()` with its existing destructive confirmation.
Clear remains Advanced-only. Cancelling either confirmation preserves the index.

An existing compatible index can immediately remain Ready after connection.
Changing the embedding configuration preserves the old index and displays the
engine's Incompatible state. Ready search opens the existing semantic search
modal; existing users are not forced through setup. Uninspected configurations
offer explicit Check setup; reading/rendering their cached status does not refresh
or contact providers. Advanced changes notify mounted product views through the shared engine status
subscription. View close detaches that subscription; engine disposal clears it.

A bounded notification option suppresses reconciliation for a Simple Setup commit.
The existing auto-sync queue retains pending work but defers it until a real
Markdown event or explicit reconfiguration. This also covers a disabled existing
index with pending edits and a late startup layout-ready reconciliation. Without
that deferral, enabling an existing index could read notes as a side effect of
Connect. Advanced callers keep the original default reconciliation behavior;
pending work is not discarded and subsequent real Markdown changes still sync.
Plugin startup also defers offline reconciliation until real Markdown activity.
It performs no Markdown/provider work and no Companion mirror request. Explicit
indexing and post-commit Companion synchronization remain available. Existing
automatic operations already in flight are not attributed to opening Health.
There is no automatic first-index operation.

Local copy states that Ollama generates embeddings on this device and stores the
index locally. Cloud/Custom copy distinguishes the fixed test phrase from note
chunks sent during explicit indexing, and discloses future automatic Markdown
sync for an existing index. The actual remote-index confirmation remains owned by
the existing semantic controller.

## Localization and accessibility

53 new keys have EN and RU text; provider/model identifiers remain unchanged.
Mode choices are native buttons with `aria-pressed`, a textual selected marker
and visible focus. Fields have wrapping labels; key inputs use `type=password`
and `autocomplete=off`. Busy state disables actions and uses the existing polite
live region. Tab/Enter work without custom keyboard handlers. Choices stack at
narrow widths, and scoped native-theme CSS avoids overflow at a 390px viewport.

## Automated verification

71 added tests: repository total **1,332 in 59 files**; Health **435 in 24 files**
(baseline: 1,261 and 412 respectively). Focused product/transaction tests:
**43 in 4 files**. Coverage includes all presets, fixed-phrase transport, no-note
reads, validation, rollback, both ordinary-save orderings, stale Advanced edits,
LLM isolation, empty vs ready, explicit build/search/rebuild delegation, preserved
confirmations, pending sync deferral, late layout readiness and future sync.

The Health transitive dependency audit remains enforced and now explicitly rejects
Obsidian network imports. A separate AST audit restricts product imports/calls,
prohibits direct vault/vector/Companion access, and verifies existing command IDs
and Advanced controls. UI integration tests cover zero network/index/scan on open,
all draft interactions, Back, safe errors, EN/RU, late completion after close and
existing users. Secret-bearing test assertions compare booleans rather than dump
settings/request arguments.

Passed: `npm ci`, `npm run typecheck`, `npm test -- health`,
`npm test -- semantic/product semanticSettings`, `npm test`,
`npx eslint health semantic`, `npm run lint`, `npm run audit:proposals`
(all five mutations killed), `npm run build`, and baseline-to-HEAD diff whitespace
validation. The unchanged lockfile reports seven dependency advisories (four
moderate, three high); the existing `api.ts:413` fetch lint warning remains.

Independent source review identified concurrency and deferred-sync edge cases;
they were fixed with regressions. Final review reported no remaining concrete
blocker and identified the disk-durability limit described above. The independent
reviewer did not rerun tests or native smoke.

## Native evidence (2026-09-23, Europe/Moscow)

Real Obsidian **1.12.7 / Electron 39.8.10**, Linux desktop, isolated profile and
three synthetic notes. No personal vault or real provider credentials were used.
Installed bundle/styles/manifest matched the final production build byte for byte;
hashes and counters are in [native.json](semantic-intelligence-evidence/native.json).

| Native action | Observed result |
| --- | --- |
| Disabled and configured Health open | Zero requestUrl/fetch, provider checks, note reads/enumeration, index calls or settings saves |
| All modes, editing, Back | One existing Health leaf; zero side effects; drafts discarded |
| Keyboard and password fields | Tab/Enter, selected marker, 2px focus; labeled password inputs with autocomplete off |
| Real Local Connect | One fixed-phrase request, no note reads/enumeration/save; safe Ollama-unavailable guidance |
| Configured Check | One explicit refresh; absent index needs no provider request |
| Remote Build cancelled | Existing OpenRouter privacy confirmation; no note reads or embedding calls |
| Explicit local Health scan | Three reads, four local Findings, zero provider calls; Inbox remains usable |
| Fixture Custom Connect | One fixed-phrase request, one save, one notification, one refresh; zero note reads/enumeration/index calls; Index required |
| Fixture explicit Build | Existing confirmation accepted, one indexVault call, three note reads, three vectors; Ready |
| Fixture existing semantic actions | Search by meaning opens existing modal; Similar Notes and Potential Duplicates commands open their existing modals |
| Fixture changed model | Incompatible without reads/build/rebuild; Rebuild opens existing destructive confirmation; cancel preserves index |
| Fixture compatible reconnect | Ready with existing vectors; zero note reads/index calls |
| Advanced | Embeddings controls, manual Clear/Rebuild and all 21 plugin commands retained |
| 390px / EN / RU | No overflow in setup, Health, Findings, onboarding or recovery; actual dark/light themes inspected |

The fixture transport returns synthetic vectors at the existing `requestUrl`
boundary; the native UI, controller, runtime and local vector store are real.
These fixture successes are **not** claims of live Cloud or Ollama success.
All three Markdown bodies remained byte-identical. No instrumented runtime errors
or unhandled rejections occurred. Selected inspected captures:
[RU Cloud fields](semantic-intelligence-evidence/cloud-fields-ru-light-390.png),
[normal Ready with fixture vectors](semantic-intelligence-evidence/ready-home-fixture-390.png),
[real Ollama failure](semantic-intelligence-evidence/local-result-dark-390.png).

## Unchanged and deferred

Diff checks confirm no changes to Advanced `settings.ts`, embedding providers,
indexing, vector storage, chunking, Health domain/schemas, analyzers, services,
FindingStore, local scan/controller lifecycle, preferences, manifest/version or
dependency files. The only existing semantic lifecycle changes are the bounded
notification/queue deferral described above.

Semantic Health Findings, hidden connections, duplicate Findings, Discover, Deep
Intelligence, LLM/Ask redesign, Recall/FSRS and Health Score remain deferred. Native
Android/iOS, popout, screen-reader verification and live provider success are not
claimed; 390px desktop coverage is not a mobile-platform smoke.
