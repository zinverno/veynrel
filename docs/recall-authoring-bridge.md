# Native Recall authoring bridge

Explicit flashcard generation now connects the existing Markdown producer to
Veynrel's native Recall inventory, FSRS-6 scheduler, review surface and Recall
Health. No external spaced-repetition plugin is required.

## Authoring and consent

Open a Markdown note, open Health → Recall, and choose **Create from current
note**. The confirmation shows the exact vault-relative source path. It explains
the note read, bounded model input, configured provider/endpoint, Markdown
mutation and native Recall admission. Choose **Generate flashcards** to proceed.
Cancel, navigation away, closing the view, or changing the selected note ends
unsubmitted confirmation without generation IO. An already submitted operation
continues across view navigation; plugin disposal stops work before an unissued
Markdown write. An issued durable write cannot be cancelled or rolled back.

Opening Recall, rendering authoring, and opening/cancelling confirmation perform
zero note reads, provider calls, Markdown writes or Recall writes. The existing
Recall metadata-only initialization is unchanged. Startup, note opens/edits,
inventory, Health scans, Deep Connect and Check connection never generate cards.

The source is freshly resolved through Obsidian's current-file API and must still
be open in a Markdown view. There is no separate cached note or arbitrary fallback
to another open file. With no eligible current note, the surface asks the user to
open one. Immediately before work, the host requires the same existing `TFile`,
a canonical vault-relative Markdown path outside the actual config directory and
all internal `.ai-backup`/`.ai-backup-*` directories. Single-note authoring rejects
files larger than the existing Recall 2 MiB note bound before reading them, and
checks the returned content length as well.

**Start review** remains primary whenever cards are due. Authoring is secondary
on the overview and is absent during a review session, including its completion
screen. Existing review remains usable during the provider request. Only the
short metadata ingestion operation occupies Recall's writable owner.

## One producer and shared Deep configuration

`main.ts` still owns `buildFlashcardsContent()`, `extractFlashcards()` and the
unchanged EN/RU `@flashcards_prompt`. All generation paths use that producer and
its validated `cardCount`:

- Recall authoring uses a host adapter injected at plugin registration.
- `ai-flashcards-note` retains its command ID and routes through that adapter.
- The existing **Flashcards** context action delegates to the same note command.
- Batch **Flashcards** retains its prompt, append behavior, backups and report.
  It collects successful paths and performs sequential targeted ingestion after
  the Markdown writes, including completed writes before batch cancellation.
  Failed/unmodified paths are not imported. No per-file or final full-vault scan
  is triggered. A metadata failure is noted in the batch report.

The producer sends at most the first 32,000 UTF-16 characters of the selected
note. It appends to the complete original Markdown, preserving the body beyond
that input bound. No other note, Health Finding, Recall schedule or vector is
added to the request. The shared transport owns authentication; credentials are
not inserted into prompts. A settings snapshot fixes the connection for each
request. Changing shared connection settings invalidates pending confirmation.

Provider/model/key/Base URL remain the shared Deep Intelligence settings from
PR #42. Structurally **Configured** is sufficient; **Connected** is not required.
Unconfigured setup directs the user to Deep configuration without reading the
note or testing the provider. Ollama copy names the configured endpoint without
assuming it is on this device. Cloud/custom copy names the provider and warns of
possible usage costs. No endpoint URL or credential enters authoring snapshots.

The historical prompt wording is preserved, including its old plugin reference;
it does not introduce a dependency on that plugin. The authoritative syntax is
unchanged:

```markdown
## Flashcards
#flashcards

Question::Answer
```

Generation appends another section. It does not merge, reformat or rewrite old
card sections. Invalid output rejected by the existing extractor produces no
Markdown write or Recall ingestion.

## Mutation and durable boundaries

`replaceNoteIfUnchanged()` revalidates file identity and path before processing,
then verifies them again with exact original content inside `Vault.process()`.
An edit, rename, delete or replacement while the model is running cannot be
overwritten or recreated at an obsolete path. A typed conflict maps to fixed
localized feedback; provider bodies and raw exceptions never enter product state.

There are two durable steps, with **no transaction across them**:

1. Append the validated flashcard section to Markdown.
2. Admit the changed note into the existing Recall owner.

If step 1 fails, step 2 is not attempted. If step 1 succeeds and step 2 fails,
the note keeps its cards. The product says **Flashcards were added to the note,
but Recall could not update**. It does not report total generation failure or
roll Markdown back. Retry loading Recall if needed, then use **Refresh flashcards**.

Invalid, unsupported or unavailable Recall storage never gets silently replaced.
Explicit generation can still save Markdown; blocked admission directs the user
to recover Recall and then refresh. A failed metadata write does not publish an
optimistic inventory or schedule. The existing poisoned-owner/recovery rules
continue to apply, including possible partial disk writes from a failing adapter.

## Targeted inventory and schedules

`RecallService.refreshNote()` resolves and reads exactly one eligible note, uses
the existing `parseMarkdownFlashcards()`, and checks file identity/mtime/size again
immediately before metadata persistence. It does not enumerate Markdown files or
read unrelated notes. Parsing and storage retain their existing bounds. A source
that cannot be completely parsed or revalidated reports failed admission, leaving
the saved Markdown available to explicit Refresh.

`RecallStore.admit()` shares the existing reconciliation implementation and
serialized persistence queue. It always uses incomplete coverage, so it never
retires absent cards in this or any other note. The v1 append-only bridge needs
no absence reconciliation. A queued review's latest durable schedule takes
precedence over the earlier observation time.

Identical question/answer/path identities deduplicate in Recall, even if Markdown
contains the generated line twice. Existing schedules are preserved exactly.
Exact retired recurrence reactivates the same ID and `firstSeenAt`, preserving its
FSRS schedule. Only new identities receive a new schedule and become due now.
The same plugin-lifetime `RecallProductController`, `RecallService` and
`RecallStore` notify Recall and Recall Health immediately after persistence.

## First run and full inventory

Tracked cards and established full-vault inventory are separate facts. `firstRun`
continues to identify missing Recall metadata. A targeted first import creates
reviewable tracked cards, while the new product `inventoryEstablished` remains
false. The overview explicitly says that a full inventory is not established;
the rest of the vault remains undiscovered until Find/Refresh.

An additive optional `inventoryCompletedAt` field in v2 `recall/cards.json` records
only a committed, complete full-vault inventory. Partial scans and targeted imports
cannot establish it; reviews and later imports preserve it. Legacy v1/v2 files
without the marker remain readable and their schedules are preserved, but their
past full coverage is conservatively unknown until the next complete Refresh.
Loading performs no migration write. Older builds with strict v2 field validation
will block an extended snapshot rather than silently dropping this evidence.

The marker means a complete inventory occurred, not that coverage stays fresh
forever. Recall Health reports the actual workload of **tracked** cards. Known
targeted cards can make it recommend review without implying vault-wide coverage.

## Isolation and product boundary

Health/Recall UI consume `RecallAuthoringPort` only. They do not import `main.ts`,
`api.ts`, `AIHubSettings` or a provider client. `RecallAuthoringAdapter` lives in
the host layer and receives the authoritative producer and the existing Recall
port. Its public state contains only phase, configuration availability, selected
path, safe provider label, input limit, fixed result categories and card count.
It never contains note bodies, prompts, answers, API keys, URLs or raw responses.

Generation does not run a Knowledge analyzer, create Findings or ScanRuns, advance
any Local/Semantic/Deep receipt, request embeddings, or explicitly update a semantic
index. The existing independent Markdown-change observer may run normal automatic
semantic sync when the user has enabled it.

## Verification

Regression tests cover passive/cancel/navigation behavior, real producer/prompt
reuse, bounded selected-note input, exact stale-write protection, provider/invalid
output/save failures, truthful metadata failure, blocked bytes, duplicate and
retired recurrence, review concurrency, one-note scope, persisted coverage,
batch admission, EN/RU, confirmation focus, busy state and review priority.

Baseline: `50af303014f7eddacb29d1756af5324bf2c79681` (PR #43 merged).
`npm ci`, typecheck, focused ESLint, full lint, build and the proposal mutation
audit (5/5 mutations rejected) passed. Focused tests: Recall 472, Deep 103,
Health 813. Full suite: **2,164 tests in 90 files passed**. Full lint retains the
existing streaming `fetch` warning at `api.ts:402`; there are no lint errors.

[Native evidence](recall-authoring-evidence/native.json) records the exact bundle
hashes, counters and assertions from isolated Obsidian 1.12.7 / Electron 39.8.10
on Linux. Only Veynrel is installed. The fixture uses synthetic notes and injects
deterministic responses at `requestUrl`; the real transport, generator, parser,
UI, store and scheduler run without personal credentials or live inference.

Native checks cover zero-work startup/overview/confirmation/cancel/navigation,
generation and immediate due/new/Health updates, review of generated cards,
duplicate identity and schedule preservation, review during generation, stale
edits, safe provider failure, metadata-write partial success and Refresh recovery,
the actual command/context actions, restart, corrupt-store protection, and
unconfigured Deep. Existing Health Findings, receipts and ScanRuns stay
byte-identical. A successful generation observes three `Vault.read` calls:
the original note read, Obsidian's internal `Vault.process` read and the one-note
Recall ingestion read. The editor's `cachedRead` observer is independent.

All 24 EN/RU × dark/light × 320/390/960px × overview/confirmation cases fit
without horizontal overflow. Confirmation headings receive focus, long paths
wrap, and local/cloud privacy wording excludes credentials. Screenshots:
[EN dark 390px](recall-authoring-evidence/confirmation-en-dark-390.png) and
[RU light 390px](recall-authoring-evidence/confirmation-ru-light-390.png).
This is native desktop evidence; live providers, native mobile, popouts,
screen readers and custom themes were not tested.

No production dependency, application version bump, tag or release is included.
