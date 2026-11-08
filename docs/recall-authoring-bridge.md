# Native Recall authoring bridge

The current bridge uses the existing Recall owner, local FSRS scheduler and Health adapter. No external spaced-repetition plugin is required. See [Recall](wiki/Recall.md) for current syntax and user flow, and [topics/vocabulary verification](recall-topics/verification.md) for this branch's evidence.

## Current path

`main.ts.buildFlashcardsContent` delegates to the pure `recall/authoring.ts` preparation, strict output validator and insertion serializer. Command, context menu and batch share it. `api.ts` remains the transport owner and requires normal completion for Recall. The localized default instruction now covers source grounding, independent questions, caveats, coverage and fewer questions when material is insufficient. An explicit `settings.recallPrompt` override is retained until reset.

`recallAuthoring.ts` owns host consent, captured settings/source/editor, stale checks, isolated editor insertion and targeted metadata refresh. It never constructs a second scheduler/store. The authoring port includes editable instructions and selected options, but never credentials, endpoint URLs, raw provider responses or note bodies. The generator's selected source is not silently truncated. No generated-question preview is required.

`recallEditor.ts` uses Obsidian's runtime `@codemirror/commands` history annotation with one insertion. The module is external in the bundle; no second CodeMirror/history implementation or new npm dependency is shipped. Open buffers must match saved content before transport. The final guard runs after the saved-source reread. Closed-file paths retain `Vault.process` conflict checks; batch retains exact backups. There is no atomic transaction across Markdown and JSON, and no automatic generation retry after a metadata failure.

`RecallService.refreshNote` reconciles only the selected complete, current snapshot. Partial captures admit valid observations without retiring unseen cards. The store keeps its serialized persist-first queue, prior schedules and retired history. Known rename events update the source path while retaining its identity anchor. Review freshness checks verify both identity and the selected scope.

The product presents Topics/Vocabulary through one scope predicate and cached metadata. Opening or filtering does not scan notes or call a model. Saved changes after initialization trigger bounded per-note refresh; dirty editors invalidate displayed cards immediately. Global Recall Health counts remain separate from a filtered review session.

## Schema v4

Valid v1/v2/v3 data, including PR #44's transitional v2 inventory marker, loads without writes. New fields default to `kind: study`, `studyTags: []` and the legacy source identity anchor. Study IDs and all supported schedules remain unchanged. Before the first migration mutation, storage preserves and verifies the original JSON contents in a unique `cards.pre-v4-*.json`. A failed backup blocks the write. Future/corrupt schemas and unsupported scheduler policies remain blocked.

The exact seven-card PR #44 file remains a regression fixture. Current tests preserve its IDs, schedules and coverage through the first v4 write. The following evidence describes older builds and is not evidence for new features.

## Historical verification before topics/vocabulary (schemas v1-v3)

### Schema v3 follow-up

Baseline: `89d10ad4bdde792bfbb9408e82d3c66f5a861fb2` (PR #44 merged).
`npm ci`, typecheck, Recall ESLint, full lint, proposal mutation audit (5/5) and
build passed. Focused Recall: **556 tests in 20 files**. Full suite: **2,248 tests
in 91 files**. Lint retains the pre-existing streaming `fetch` warning at
`api.ts:402`. Runtime changes are confined to the schema constant and decoder;
the authoring, inventory, scheduler, review, Health and UI implementations are
unchanged. The prior native file below is now also a durable regression fixture;
this storage-only follow-up does not claim a new native smoke run.

### PR #44 authoring bridge

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
