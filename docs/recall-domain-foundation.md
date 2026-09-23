# Veynrel Recall domain foundation

This document records the PR #37 foundation and its schema v1. The subsequent
[native FSRS scheduler](recall-fsrs-scheduler.md) adds scheduling and a read-only
v1 → v2 migration; the parser, identity and inventory contracts below are unchanged.

Recall is Veynrel's native spaced-repetition domain. Veynrel owns card discovery,
identity and the active/retired inventory in this stage. Future stages will own
review state, history, ratings, FSRS scheduling, queues and sessions. There is no
runtime dependency on any flashcard/review plugin, including st3v3nmw Spaced
Repetition. Nothing reads its installation state, data, API or scheduling metadata.
Only the human-readable card text syntax is reused; schedule interoperability is
not claimed.

This subsystem is dormant: `main.ts` does not import or instantiate it. Plugin
startup, Health and navigation are unchanged. There is no Recall UI, navigation
tab, automatic initialization, scan, card creation, editing or deletion. Health's
Recall dimension still says **Not enabled**. No scheduler fields, review actions,
due dates, FSRS package, new dependency, semantic analysis, Deep AI, remote sync or
Connect integration are added.

## Flow and ownership

```text
Explicit scan(signal)
  → public Vault.getMarkdownFiles / Vault.read
  → Flashcards section extraction (immutable candidates)
  → validate candidates and calculate next inventory
  → serialize temporary snapshot
  → verify current vault revision inside store queue
  → write recall/cards.json
  → publish the committed snapshot
```

`RecallService(storage, source, clock?)` constructs exactly one private
`RecallStore`. Neither construction performs IO. One owner must serve a plugin
storage root; cross-process/multiple-owner writes are not supported.

Public application API:

- `initialize(): Promise<RecallLoadResult>` loads Recall metadata once. It never
  enumerates/reads Markdown, creates directories, writes or scans cards.
- `scan(signal): Promise<RecallInventoryResult>` explicitly reads and reconciles
  cards. Initialization is required. Overlap rejects with
  `RecallScanAlreadyRunningError`; scans are not queued behind another scan.
- `listCards({ state?, path? }?)` and `getCard(id)` return independent copies.
  Filters are only `active`, `retired` and exact canonical path. List order is ID
  ascending using code-unit comparison, independent of locale.

The result reports one `observedAt`, unique `cardsSeen`, `created`, `updated`,
`retired`, `complete`, `committed`, `freshness`, coverage and bounded diagnostics.
`updated` counts existing identities observed, including reactivation. A partial
fresh scan can commit detected cards. A stale scan returns all three change
counts as zero, `complete: false`, `committed: false`, `freshness: "stale"`.
Failed final enumeration similarly returns `freshness: "unavailable"`. Failed
initial enumeration, cancellation, invalid input, poisoned storage and write
failures reject; they are never presented as a successful empty inventory.

## Established producer and parser contract

The existing `ai-flashcards-note` command, `generateFlashcardsForNote()`, batch
Flashcards action, context-menu action, prompts and helpers are unchanged.
`buildFlashcardsContent()` still appends exactly:

```markdown
## Flashcards
#flashcards

What is X::Y
Why Z::Because Q
```

`tests/fixtures/recall-generated.md` is compared byte-for-byte with execution of
the real `buildFlashcardsContent`, `extractFlashcards` and `appendSection` source.
The test substitutes only the LLM transport, then parses and reconciles the
result into two active cards. Recall itself never invokes the generator.

Parser scope is deliberately narrow:

- A section starts at an ATX heading (one to six `#`, up to three leading spaces)
  whose text is exactly case-sensitive `Flashcards`. Surrounding whitespace and
  optional closing heading hashes are stripped. No translated headings, emphasis
  stripping or heading heuristics are used. Production emits `## Flashcards` in
  every language. Setext headings do not start Recall sections.
- The section ends at EOF or the next same/higher-level heading. Lower-level
  headings remain inside the section and do not change its original level.
  Setext headings can terminate a section. Separate Flashcards sections are
  supported. `#flashcards` and blank lines are ignored; the marker is optional and
  does not enable cards outside an explicit section.
- Cards occupy one logical line. The **first `::`** is the only structural
  separator; subsequent `::` belong to the answer. Both sides must be nonempty
  after normalization. This exactly matches the existing producer's splitter.
  There is no natural-language interpretation or second card syntax.
- Normal `foo::bar` outside Flashcards sections is ignored. Lines without `::`
  inside a section are ordinary prose. Card text is not inferred from them.
- Leading YAML frontmatter (optional BOM; `---` opener and `---`/`...` closer,
  allowing trailing horizontal whitespace),
  backtick/tilde fences with matching closing character and at least the opening
  length, indented code lines and HTML-comment lines are ignored. Fence-contained
  headings cannot open/end a section. Unclosed frontmatter/fences/comments mark
  extraction incomplete. This is a narrow generated-section parser, not full
  CommonMark/container-block support.
- Oversized/invalid explicit card lines produce a diagnostic and incomplete
  extraction. Safely parsed cards remain available, but absence cannot retire
  any prior card. Invalid note paths are rejected, not repaired.

## Card contract and identity v1

`RecallCardCandidate` contains readonly `id`, `fingerprint`, `path`, `question`,
`answer`. Parser candidates and result arrays are also frozen at runtime.
`RecallCard` adds only `firstSeenAt`, `lastSeenAt`, and `state: "active" | "retired"`.
There are no FSRS or other scheduling fields.

```text
fingerprint = "v1:" + JSON.stringify([canonicalVaultPath, question, answer])
id          = "recall-" + stableHash(fingerprint)
```

The existing platform-independent `utils/stableHash.ts` supplies 16 lowercase
hex characters. This is a deterministic identifier, not a cryptographic hash.
The store compares fingerprints before reusing an ID and refuses a collision.
Paths are vault-relative canonical Markdown paths: no absolute/traversal paths,
backslashes, empty/dot segments, leading/trailing segment whitespace or controls.
Case and Unicode are preserved; path aliases are not silently normalized.

Q/A normalization converts CRLF/CR to LF and trims outer whitespace. It preserves
case, punctuation, internal Markdown, tabs, spacing and Unicode normalization
form. Stored card text must remain single-line; controls other than tab and
Unicode line/paragraph separators are rejected. Wording/case/punctuation edits
produce a new learning item. Reordering lines or changing surrounding prose
does not change identity. Identical normalized cards within one note, including
across repeated sections, yield one candidate plus bounded `duplicate-card`
diagnostics. The same text in different notes is a different item. No line
number, ordinal, mtime, localized string or random ID contributes to identity.

**V1 tradeoff:** path belongs to identity. Renaming a note or editing Q/A creates
a new ID and first-seen time. The old identity retires only on a complete fresh
scan. No rename-history migration or automatic scheduling-state transfer exists.

## Inventory coverage, freshness and cancellation

`ObsidianRecallSource` uses only public `Vault.getMarkdownFiles()` and
`Vault.read()`. It never uses a semantic index or the Local Health snapshot.
Config-directory descendants are excluded using `vault.configDir`; so are
directories named `.ai-backup` or prefixed `.ai-backup-` at any depth. Comparisons
for these exclusions ignore case. Ordinary Markdown filenames such as
`.ai-backup-plan.md` are included. Templates are included. The nested-backup
exclusion is intentionally conservative; legacy generation creates root backups.

Sorted immutable descriptors capture `[path, mtime, size]` before reading. Their
exact versioned JSON tuple sequence plus enumeration completeness is the
transient revision; no hashing ambiguity or note contents enter that revision.
The entire eligible inventory contributes even when the read limit is reached.
Reads occur in batches of eight and results are merged in path order. Each file's
path/mtime/size is checked before reading, after reading and after parsing.
Changed notes are unavailable, never zero-card facts. Read/parse failures and
resource limits mark the scan incomplete. Coverage reports eligible valid
`notesSeen`, successfully read unchanged `notesRead`, and `noteListComplete`.

The store validates/copies inputs, calculates a temporary state, serializes it,
and then runs the source's final revision check **inside its serialized write
queue**, immediately before handing bytes to storage. Addition, removal, rename,
mtime or size changes prevent the entire reconciliation, including updates and
new cards. Partial results can never retire absence, even when revision matches.

Cancellation checks occur before capture, around reads, periodically during
parsing (with event-loop yields), in the store queue and after the freshness
guard. Pending non-abortable Vault reads are detached; no further batch starts.
Cancellation before the write is issued publishes nothing and retires nothing.
Once the storage write has been issued it cannot be retracted with AbortSignal:
if it succeeds, the service publishes/returns the committed outcome, including
cancellation during or after that write. It never reports a fictitious rollback.

This is not a filesystem transaction. A change after the last revision check,
including while directory preparation/write is in progress, remains a small race
window. Same-path content changes that preserve both mtime and size cannot be
detected by this lightweight revision. No filesystem locks, content-hash rereads
or event journal are introduced.

## Separate persistence and lifecycle

The dedicated `RecallStoragePort` exposes `read()` and `write(contents)` for one
fixed file only. `ObsidianRecallStorage(adapter, vault.configDir, plugin.manifest.id)`
derives `<configDir>/plugins/<manifest.id>/recall/cards.json`. It does not consult
any other plugin ID. No FindingStore, HealthStorage, `health/findings.json` or
`health/scan-runs.json` is involved. Recall reuses only existing pure primitive
validation helpers currently located in `health/domain/validation.ts` and the
shared stable hash; it has its own storage, source, cancellation and diagnostics.

V1 snapshot:

```typescript
{
  version: 1,
  updatedAt: number,
  cards: Record<string, RecallCard>
}
```

Object keys at every level are serialized in deterministic sorted order with
two-space JSON indentation and a final newline. Loading validates exact allowed
keys, version, canonical paths, Q/A bounds, recomputed fingerprint and ID, map
key/ID equality, lifecycle state, valid epoch-millisecond timestamps,
`firstSeenAt <= lastSeenAt <= updatedAt`, card count and document length.

Load states are `loaded`, `missing`, `invalid`, `unsupported`, `unavailable`.
Missing is empty/writable and causes no initialization writes. Unknown future
integer schema versions are unsupported; malformed versions are invalid. The
codec's version dispatch is the migration foundation. V1 has no prior schema and
does not invent a migration or downgrade. Invalid/unsupported/unavailable bytes
are never automatically reset or overwritten; scan refuses even Markdown reads.

Reconciliation uses one timestamp for every detected card. The service clamps a
backward clock to the latest durable snapshot timestamp; invalid clocks reject.

| Observation | Result |
| --- | --- |
| New identity | Active; firstSeenAt = lastSeenAt = observation |
| Existing active identity | Preserve firstSeenAt; update lastSeenAt |
| Retired identity reappears | Active again; preserve firstSeenAt |
| Missing active identity, complete fresh scan | Retired; preserve prior lastSeenAt |
| Missing identity, partial scan | Preserve state and timestamps |
| Stale or cancelled before write | No changes |

Retired cards are retained and never deleted. This leaves room for future review
history without claiming that history exists now. Persistence precedes memory
publication. On write failure, previous cards/timestamps remain visible and the
owner becomes write-blocked because the failed write may have truncated disk
bytes. A replacement owner must reload metadata before any retry. Invalid bytes
remain blocked after restart. There is no user-facing recovery yet: an explicit
recovery experience is required **before Recall UI ships**.

Only card text and Recall metadata are persisted. Whole notes, frontmatter,
other sections, surrounding prose, embeddings, raw exceptions and diagnostics
are not stored. Explicit Q/A storage is intentional so future review rendering
does not require reparsing notes at every render. Reads never call `requestUrl`,
`callOpenRouter`, providers, embedding APIs or other network transports. The only
file write is Recall's `cards.json` (plus creation of its directory chain).
No scan calls `vault.modify/create/delete/rename/process`.

## Limits and deferred work

| Resource | V1 limit |
| --- | --- |
| Question / answer | 2,000 / 8,000 UTF-16 code units after normalization |
| Note read | 2 MiB reported file bytes; also 2 Mi UTF-16 code units after read |
| Notes read / extracted or stored cards | 10,000 / 10,000 (retired cards included in storage) |
| Concurrent reads | 8 |
| Diagnostics | 100; `diagnosticsTruncated` records omitted entries |
| Serialized metadata | 32 Mi UTF-16 code units; adapter also bounds reported bytes before read |

Limits never authorize retirement from partial coverage. If the retained-state
count or serialized-size limit is exceeded, reconciliation rejects before write
rather than pruning history. Filesystem writes are serialized through one store;
they are not crash-atomic. Journaling/backup recovery, multi-owner coordination,
resource-limit UX, more Markdown containers and stable note identity are deferred.

Future scheduler work can build on validated identity and lifecycle with explicit
storage migration. Again/Hard/Good/Easy, FSRS, due queues, sessions, review history
and a usable native Recall page are future stages. Health Recall integration
follows working scheduling/review behavior and remains separate from review
state. External plugin installation must continue to have no effect.

## Executable evidence

`npm test -- recall` covers parser syntax/scope, generator compatibility and
existing entry points, identity, strict codec validation, persistence/copy
safety, active/retired recurrence, corrupted bytes, limits, source exclusions,
freshness, exclusivity and cancellation before/after persistence. Runtime spies
check Markdown mutation counts. `recall/boundary.test.ts` audits all Recall
production modules and their permitted runtime dependencies for network,
semantic, external-plugin and Markdown-write paths, and confines writes to the
Recall storage port/adapter. Tests also compare operation with/without unrelated
external plugin configuration present. They require no provider or credentials.

Local verification for this foundation: `npm ci`, `npm run typecheck`,
`npm test -- recall` (154 tests / 9 files), full `npm test` (1,703 / 75),
`npx eslint recall`, `npm run lint`, `npm run audit:proposals` (5/5 mutations
caught), production build and baseline diff whitespace checks. The existing
`api.ts:413` fetch lint warning remains unchanged. Native Obsidian UI testing is
not claimed for this dormant, UI-free stage; source/storage adapters are exercised
against instrumented public-API fixtures.
