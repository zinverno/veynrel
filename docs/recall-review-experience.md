# Native Recall review experience

Recall is Veynrel's built-in spaced-repetition workspace. The existing ItemView
offers **Health | Findings | Discover | Recall** after onboarding. There is no
second view type, external review plugin, Markdown scheduling metadata or
automatic generation. Health's Recall dimension remains **Not enabled**.

The [card foundation](recall-domain-foundation.md) and
[native FSRS-6 scheduler](recall-fsrs-scheduler.md) retain their parser, identity,
reconciliation and scheduling contracts. The legacy flashcard command, prompt,
batch action and context-menu action are unchanged.

## Ownership and lazy lifecycle

`registerHealth` composes one `RecallProductController` for the plugin lifetime.
It holds a factory for one `RecallService`, which owns one `RecallStore`.
Construction performs zero filesystem operations, enumeration, note reads,
writes or network calls. Health, Findings and Discover never initialize Recall.
Only navigating to Recall loads metadata through the dedicated
`recall/cards.json` adapter. Missing metadata is an empty writable first run.

The UI uses the narrow `RecallProductPort` and safe snapshots, never the store,
source, parser or scheduler implementation. Initialization is single-flight.
Normal navigation reuses the owner. Retry after an unavailable load or confirmed
recovery replaces the blocked owner, without scanning. No store is constructed
per render, session or review. Snapshots contain copies, safe fixed errors and
presentation data, with no raw diagnostics, exceptions, storage bytes or FSRS
parameters.

The transient `{ page: "recall" }` route is never persisted. Closing/reopening
the workspace starts on Health. If Obsidian duplicates the workspace tab, only
one tab owns the Recall surface: entering Recall in another tab returns the
previous tab to Health and discards its session. Closing an unrelated tab does
not affect the owner. All tabs share the single service/store.

Health recovery/onboarding still dominates navigation. Recall corruption affects
only Recall. Loading, refresh, review saving and recovery have separate flags;
navigation remains available during an issued write. Subscriptions publish
operation boundaries, successful ratings and safe errors. A throwing subscriber
cannot fail a durable operation. There is no polling. An idle overview may set
one disposable wakeup for its next due time; completed sessions never wait for a
learning timer.

## Overview and explicit discovery

The first run explains `## Flashcards` and `question::answer`, then offers
**Find flashcards**. Only that action or **Refresh flashcards** calls
`RecallService.scan(signal)`. It reuses the deterministic, bounded, cancellable
inventory source/parser, including freshness and partial-scan retirement rules.
Refresh is unavailable during a session; users return to the overview first.

While scanning, a busy status replaces percentages and duplicate refreshes are
disabled. Complete empty discovery shows “No flashcards found” and mentions the
existing generation command without invoking it. Partial/stale discovery uses
neutral incomplete copy and retains service-approved active cards. Only a safe
completion/commit result and active count reach the UI.

The overview gets due/active/new counts from `getSummary(now)`. **Start review**
appears when cards are due. `getNextDueAt()` returns the earliest active due time,
excluding retired cards, for caught-up/overview copy. Display dates use EN/RU and
the system timezone; localized values never feed back into FSRS mathematics.

## Session and decision timestamp

The transient session holds a count, current card, captured decision timestamp
and four preview intervals. There is no persisted queue or promised fixed total.

```text
Overview → Start → Question → Show answer → Revealed → Save rating
                      ↑                                  │
                      └──── next due card, after persist ─┤
                                                         └→ Caught up
```

Start and every successful rating request `listDue(now, 1)`. The service supplies
only active cards with `dueAt <= now`, ordered by due time then ID. New cards use
the same queue. Learning cards may return during a long session only after they
become due. No current due card means immediate completion with the session
count, next due time and **Back to Recall**; no review-ahead control exists.

Before reveal, the product snapshot omits the answer entirely. The DOM contains
the question and source button, with no hidden answer or rating controls. Card
content is literal text with preserved line breaks and Markdown characters;
display does not execute HTML, note embeds, remote images or Markdown links.

**Show answer** captures exactly one `decisionAt = clock()` and calls
`previewCard(id, decisionAt)`. It then exposes the answer and exactly
**Again / Hard / Good / Easy**. Labels format the returned `intervalMs` as seconds,
minutes with optional seconds, hours with optional minutes, or whole days.
EN/RU plural rules are display-only. UI code never derives intervals from memory
fields.

A rating synchronously locks review controls and calls
`reviewCard(id, rating, decisionAt)` with that **same timestamp**, even if the
user waited before clicking. Only durable success increments the count, clears
reveal/preview state and selects the next due card. Each new decision captures a
fresh timestamp. The busy lock and the store's strictly increasing last-review
timestamp prevent double clicks and stale commits.

Failure never advances the card/count. The revealed answer stays visible with
“Couldn't save this review.” A writable owner permits retry of the same decision.
A failed adapter write poisons the owner and shows scoped recovery/retry with
ratings disabled. Raw exceptions never reach the UI. Leaving/closing discards
the session identity; an issued write finishes truthfully but its late completion
cannot reopen the discarded surface. No unchosen rating is inferred or saved.

Source navigation is separate and explicit. The existing safe-note helper
revalidates the canonical vault-relative path, config/backup exclusions, file
existence and Markdown type before opening. A missing note gives safe status and
does not prevent reviewing persisted card content. Displaying/reviewing a card
never reads its source note.

## Keyboard, accessibility and layout

Show answer is a real button with native Space/Enter activation. After reveal,
when the review surface owns focus, **1 / 2 / 3 / 4** activate its actual rating
buttons. Shortcuts ignore saves, repeats, Ctrl/Meta/Alt/Shift and editable
inputs/contenteditable regions. They cannot rate before reveal or from another
page. Local listeners are removed on rerender, route change and close.

The renderer uses real headings, labeled question/answer regions, button labels,
`aria-current="page"`, visible focus and scoped `aria-busy`. A persistent polite
live region announces concise status outside the replaced busy content. Reveal
focuses the answer heading; successful transitions focus the next question.
Ratings do not rely on color. Obsidian variables support light/dark themes;
ratings use four columns at wide widths and a 2×2 grid at narrow widths. Q/A and
long paths wrap; overview actions stack. Note paths are never translated.

## Recovery before reset

Invalid/future-schema/future-policy data remains write-blocked. Unavailable
storage offers **Retry**, plus backup/reset only when the fixed live path can be
identified as a file. Invalid/unsupported stores offer backup/reset with file
safety rechecked during the operation.

The first button opens a separate confirmation state. Copy explains that active
scheduling data will reset, a backup will remain, notes/cards will not change,
cards can be rediscovered, and learned state will not automatically transfer
from the backup. Cancel performs no IO.

`RecallRecovery` derives the manifest plugin root and uses only DataAdapter
`exists`, `stat`, `mkdir` and `rename`:

```text
<plugin-root>/recall/cards.json
→ <plugin-root>/recall/recovery/cards-<timestamp>-<unique-id>.recovery.json
```

No parse/reserialize, copy, delete or overwrite occurs. Collisions/non-files
reject. Only a confirmed and verified successful move permits a fresh owner to
load the now-missing live file. It offers **Find flashcards**, without a scan or
initial write. Future data is preserved exactly, never reinterpreted as v2.

Preparation/move failure keeps the owner blocked. If an adapter moves but then
rejects, or post-move verification fails, recovery attempts to restore the
original path. If rollback also fails, the backup is retained and the owner
remains blocked. This is not a filesystem transaction; simultaneous external
writers and adapter/power failures cannot be made atomic here. No Health,
semantic, settings or Markdown path is a recovery target.

Valid v1 metadata needs no recovery: it migrates in memory, appears as due/new
cards and performs no load write. First rating or inventory mutation writes v2.
Inventory preserves schedules through observation, retirement and exact-identity
recurrence. Content/path edits still create new identities and new schedules.

## Local boundaries and verification

Opening Recall performs metadata IO only. Reviews write only
`recall/cards.json`, with zero Markdown enumeration/reads/mutations, network,
LLM, embedding or semantic calls. Explicit inventory may enumerate/read Markdown
but cannot mutate it or call providers. Recovery moves only the fixed Recall
file. External review-plugin installation, APIs, metadata and state are never
consulted.

Tests exercise the real service/store through the controller, plus DOM routes,
reveal, keyboard and confirmation. Coverage includes delayed preview/commit
parity, rapid mixed ratings, failed writes, navigation in flight, due selection,
recurrence, subscriber isolation, v1 UI migration, lazy construction, recovery
failure/rollback and duplicate workspace ownership. Recursive dependency/call
audits retain the no-network/no-Markdown-write boundary; the only new adapter
mutation allowance is the dedicated Recall backup move/rollback.

Focused checks: `npm test -- health/ui/recallView.test.ts recall/product`.
See [native evidence](recall-review-evidence/README.md) for artifact hashes,
side-effect counts, screenshots, full checks and platform limits.

## Deferred work

Recall Health aggregation/Findings remain for the next slice. Full history needs
a durability strategy before personalized parameter optimization is possible.
Decks, categories, daily limits, rich Markdown rendering, card editing, rename
reconciliation, automatic generation/scanning, sync and Connect are outside this
change. No production dependency, plugin version, tag or release is added.
