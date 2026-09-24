# Native Recall FSRS scheduler

This document records the scheduler stage. The subsequent
[Recall review experience](recall-review-experience.md) adds the lazy product
surface and recovery while preserving this algorithm and storage contract.
[Recall Health](recall-health-integration.md) now displays the same scheduling state;
the dormant/Not enabled boundaries below describe only the original scheduler stage.

Veynrel owns its Recall domain, scheduling policy, persistence and future review
experience. FSRS-6 supplies the mathematical memory model. Users do not install
an external review plugin, Anki or a scheduler package. Production code has no
FSRS package dependency and never consults external plugin installation, APIs,
metadata or review state.

This stage is dormant and accessible through domain/service APIs only. There is
no startup initialization, automatic scan, Recall navigation, review page, reveal
interaction or rating buttons. Health Recall remains **Not enabled**. Existing
flashcard generation, prompts, command, batch and context-menu actions are
unchanged. The [foundation parser and identity contract](recall-domain-foundation.md)
still consumes explicit `Question::Answer` lines inside `Flashcards` sections.

## Algorithm provenance and reference parity

The algorithm source is Open Spaced Repetition's
[FSRS algorithm specification, including FSRS-6](https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm#fsrs-6).
The implementation in `recall/scheduler/fsrs6.ts` independently expresses those
equations; it does not copy an upstream scheduler implementation. FSRS-6 inherits
initialization, difficulty damping/mean reversion and recall/lapse equations from
the earlier sections of that specification, and changes the short-term stability
and forgetting curve.

Policy and numerical behavior are cross-checked against
[py-fsrs v6.3.2](https://github.com/open-spaced-repetition/py-fsrs/releases/tag/v6.3.2),
commit **9446cb06605c597a063aeee49f7d188d42e34dc2**, specifically its
[scheduler implementation](https://github.com/open-spaced-repetition/py-fsrs/blob/9446cb06605c597a063aeee49f7d188d42e34dc2/fsrs/scheduler.py).
The reference's `scheduler.py` SHA-256 is
`dd04d86ba98ee22106f6bbdb7eede00fa3c848dbf15d18e33db4584f333bac46`.
FSRS and py-fsrs are projects of Open Spaced Repetition; the reference repository
is MIT licensed. No reference implementation is bundled with Veynrel.

The exact 21 parameters, indexed from zero in the equations, are:

```text
[0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194,
 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629,
 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542]
```

For grade `g` (1–4), stability `S`, difficulty `D` and elapsed whole days `t`:

```text
decay  = -w[20]
factor = 0.9^(1/decay) - 1
R(t,S) = (1 + factor*t/S)^decay
S0(g)  = max(0.001, w[g-1])
Draw(g)= w[4] - exp(w[5]*(g-1)) + 1
D0(g)  = clamp(Draw(g), 1, 10)
Dnext  = clamp(w[7]*Draw(4) + (1-w[7])*(D-w[6]*(g-3)*(10-D)/9), 1, 10)
```

For recalls after at least one whole day, stability grows by the canonical recall
factor, with `w[15]` for Hard and `w[16]` for Easy:

```text
Snext = S * (1 + exp(w[8])*(11-D)*S^(-w[9])*(exp((1-R)*w[10])-1)*hardPenalty*easyBonus)
```

For Again after at least one whole day, the lapse expression is capped by the
reference's short-term lapse ceiling:

```text
Snext = min(w[11]*D^(-w[12])*((S+1)^w[13]-1)*exp((1-R)*w[14]), S/exp(w[17]*w[18]))
```

For subsequent reviews less than 24 hours apart, all phases use the FSRS-6
short-term multiplier:

```text
m = exp(w[17]*(g-3+w[18])) * S^(-w[19])
Snext = S * (g >= 2 ? max(1,m) : m)
```

Every resulting stability is bounded below by **0.001 days**. Difficulty stays
in **1..10**. Mean reversion uses the raw initial Easy difficulty before clamping.
Stability updates use the previous difficulty. Non-finite/invalid input and
results reject rather than persisting NaN/Infinity or coercing malformed data.

## Fixed Veynrel policy v1

`VEYNREL_RECALL_SCHEDULER` is `{ algorithm: "fsrs-6", policyVersion: 1 }`.
The identifier is technical and independent of localization. Parameters, policy
and step arrays are frozen constants.

| Setting | Value |
| --- | --- |
| Desired retention | 0.90 |
| Learning steps | 1 minute, 10 minutes |
| Relearning steps | 10 minutes |
| Maximum review interval | 36,500 days |
| Interval fuzzing | Disabled |
| Elapsed memory days | `max(0, floor((at - lastReviewAt) / 86400000))` |
| Review interval rounding | Nearest whole day, ties to even; then clamp to 1..36,500 |

Epoch duration, not local midnight or timezone, determines elapsed days. This is
the pinned reference's rule. A crossing of midnight within 24 hours remains a
short-term review. A retrievability query before the last review clamps elapsed
time to zero and returns 1; an actual review must be strictly later.

The review interval in days is the inverse forgetting curve:
`S / factor * (desiredRetention^(1/decay) - 1)`, rounded and bounded as above.
Learning and Relearning intervals use fixed steps instead. Fuzzing is a scheduler
policy around FSRS, not part of its core memory model. There is no randomness,
daily new-card quota, clock access or local-time calculation in the pure core.

## Ratings, phases and durable schedule

| Public rating | Internal grade | Meaning |
| --- | --- | --- |
| `again` | 1 | Forgot the answer |
| `hard` | 2 | Recalled with serious difficulty |
| `good` | 3 | Recalled, possibly after hesitation |
| `easy` | 4 | Recalled easily |

Product APIs accept only these lowercase ratings. Numeric grades are internal.
`RecallCard.state` remains the inventory lifecycle `active | retired`. The separate
schedule phase is `learning | review | relearning`; retirement is not Relearning.

Each `RecallCard.schedule` persists:

```typescript
interface RecallSchedule {
  readonly algorithm: "fsrs-6";
  readonly policyVersion: 1;
  readonly phase: "learning" | "review" | "relearning";
  readonly step?: number;
  readonly dueAt: number;
  readonly lastReviewAt?: number;
  readonly stability?: number;
  readonly difficulty?: number;
  readonly reviewCount: number;
  readonly lapseCount: number;
  readonly lastRating?: "again" | "hard" | "good" | "easy";
}
```

Timestamps are nonnegative integer UTC epoch milliseconds representable by Date;
no Date objects are persisted. Steps are zero-based: Learning 0 or 1; Relearning
0; Review has no step. Stability and difficulty are both absent before the first
rating and both present afterward, alongside last-review time and rating.
Counters are nonnegative safe integers. `dueAt > lastReviewAt` for reviewed cards;
counter or timestamp overflow rejects the operation.

Newly discovered cards have `phase: learning`, `step: 0`, `dueAt: firstSeenAt`,
zero counters and no memory/latest-review fields. They are due immediately.
Every successful rating increments `reviewCount`. Only Again from incoming
Review phase increments `lapseCount`, including an early same-day Review Again.
Again during initial Learning or Relearning does not add a lapse.

| Incoming phase/step | Again | Hard | Good | Easy |
| --- | --- | --- | --- | --- |
| Learning 0, including new | Learning 0, 1 min | Learning 0, 5.5 min | Learning 1, 10 min | Graduate to Review |
| Learning 1 | Learning 0, 1 min | Learning 1, 10 min | Graduate to Review | Graduate to Review |
| Review | Relearning 0, 10 min; lapse +1 | Review | Review | Review |
| Relearning 0 | Relearning 0, 10 min | Relearning 0, 15 min | Graduate to Review | Graduate to Review |

Every Review outcome and graduation uses the computed, bounded day interval.
All ratings update memory, including learning steps and same-day repeats.

## Pure APIs, preview and application queries

The pure core exposes `createInitialSchedule`, `rateSchedule`, `previewRatings`,
`getRetrievability` and `nextIntervalDays`. It has no storage, Obsidian, Vault,
network, DOM, random state or implicit clock. `getRetrievability` returns
`undefined` for an unreviewed card, otherwise a finite probability in [0,1].
Retrievability is calculated at query time and never stored.

`RecallRatingOutcome` contains `rating`, a fresh `schedule`, derived `intervalMs`
and optional `retrievabilityBefore`. Intervals and retrievability are not persisted
separately. Preview computes four independent outcomes without changing input.
For the **same schedule and timestamp**, a subsequent commit produces the exact
previewed outcome, including JavaScript floating-point serialization. If another
review commits in between, the old preview is stale and must be refreshed; using
the same timestamp again rejects. Inventory does not alter an existing schedule.

`RecallService` retains its one private store and existing explicit inventory API,
and adds:

- `listDue(at, limit?)`: active cards with `dueAt <= at`, ordered by due time then
  code-unit card ID. The optional integer limit is 0..10,000; omitted means all
  due cards, already bounded by the 10,000-card storage limit. Retired cards are
  excluded. No daily limits or extra queue state are persisted.
- `previewCard(id, at)`: four outcomes for an existing active card, without IO.
- `reviewCard(id, rating, reviewedAt)`: persist and return the selected outcome.
- `getRetrievability(id, at)`: current probability or explicit no-memory result.
- `getSummary(at)`: active, due, new, learning, review and relearning counts.
  `new` means active with zero reviews, a subset of Learning. Phase counts include
  all active cards in that phase; retired cards contribute to none of the counts.

Missing IDs and invalid times/limits reject. Getters, queues, previews and committed
outcomes contain independent nested schedule copies. No caller can mutate store
memory through a returned object. Explicit early reviews are allowed; the domain
does not require `dueAt <= reviewedAt`. A future default UI will offer due cards.

## Storage v2, migration and durability

This section records the original scheduler schema. The current format is
[v3 with read-only v1/v2 migration](recall-authoring-bridge.md#storage-v3-compatibility);
the scheduler and durability behavior below is unchanged.

The dedicated `<configDir>/plugins/<manifest.id>/recall/cards.json` originally used:

```typescript
{ version: 2, updatedAt: number, cards: Record<string, RecallCard> }
```

Algorithm and policy version are explicit **on every card's schedule**, including
unreviewed cards. They are not duplicated in the snapshot header. Serialization
retains sorted object keys, two-space indentation and a final newline. Strict
validation covers all old identity/content/lifecycle fields plus schedule keys,
phase/step consistency, memory presence, counters, timestamps and numeric bounds.
Unreviewed due time must equal first-seen time; last-review time cannot exceed
snapshot `updatedAt`.

Valid schema v1 loads as `loaded/writable` after migration entirely in memory.
Every active and retired v1 card receives the initial unreviewed schedule with
`dueAt = firstSeenAt`. Identity, inventory state and all existing metadata survive.
Loading performs **zero writes and zero Markdown reads**. Only the next actual
inventory or review mutation serializes v2. Empty v1 snapshots also migrate.

Malformed data is `invalid`; unknown future schema versions or nonempty unknown
algorithm/positive integer policy versions are `unsupported`. Read failures are
`unavailable`. These states are write-blocked and never reset/coerced. Missing
storage remains empty/writable. Unsupported/corrupt bytes are preserved, and
scans refuse even Markdown reads. User-facing recovery is still required before
Recall UI ships.

Reviews run inside the existing store mutation queue:

```text
require writable storage → validate ID/existence/active state
→ validate rating/time and strictly later last-review time
→ compute temporary schedule against latest state
→ validate/serialize temporary snapshot → persist → publish → return outcome
```

There is no optimistic schedule change. A failed write leaves every published
field unchanged and poisons the owner (`unavailable`, write-blocked), because the
adapter might have truncated bytes. A replacement owner must reload metadata.
The adapter performs one serialized file write; power-loss atomicity, journaling
and cross-owner coordination remain deferred, as in the foundation.

Double-clicks/stale reviews with `reviewedAt <= lastReviewAt` reject with no write,
even when both entered the queue concurrently. Future UI must also disable
ratings during commit. Review promises report durable success/failure; no review
cancellation API is introduced. Inventory cancellation retains its existing
before-write/no-publication and issued-successful-write/committed-truth behavior.

Inventory computes against the latest queued snapshot and preserves schedules
for existing cards, retirement and recurrence. New IDs alone receive new memory.
A review advances snapshot `updatedAt` monotonically; an older captured inventory
is rejected as a stale observation before any commit or retirement. A non-older
inventory merges the current schedule. Vault freshness checks still run inside
the queue immediately before inventory persistence. A completed fresh inventory
may retire absence but never resets memory. An overdue retired card that returns
at the same identity is immediately due again.

Question/answer edits and path renames still create new learning items. There is
no identity migration or automatic memory transfer from the old, retired card.

Only explicit card Q/A, inventory metadata and current scheduling state are
stored. No note bodies, surrounding prose, review event log, telemetry or semantic
content are added. A rating writes only `recall/cards.json`; it never calls
`vault.modify/create/delete/rename/process`. Scheduling/review/queue operations
perform zero Markdown reads, LLM/provider/embedding/semantic calls or network
requests. Health storage and findings remain separate.

## Golden fixture generation and checks

`tests/fixtures/fsrs6-reference.json` contains only synthetic cards and fixed UTC
times: **57 scenarios / 110 ratings**, eight retrievability probes and nine interval
probes. It records the reference version/commit/source hash, generator, Python
version, parameters and policy. Expected memory/phase/step/interval/probability
values come from real py-fsrs execution, not duplicated equations in tests.
Veynrel-only counters are supplied by the generator's small policy wrapper.

Manual regeneration (outside production dependencies):

```sh
git clone --branch v6.3.2 --depth 1 https://github.com/open-spaced-repetition/py-fsrs.git /tmp/veynrel-fsrs6-reference
python3 scripts/generate-fsrs6-reference.py /tmp/veynrel-fsrs6-reference
```

The checked-in fixture was generated with Python 3.14.6 and the reference's
`typing-extensions` dependency available. The script requires the exact commit
and clean reference source. It executes `Scheduler.review_card` with the exact
fixed policy and fuzzing disabled; scalar interval probes use `_next_interval`.
Normal Vitest tests use only the static JSON, with no Python, network or FSRS npm
package. Stability is compared to 12 decimal places after division by reference
stability; difficulty/probability use 12 decimal places; discrete fields and
intervals match exactly. Sequences feed each actual result into the next review.

Coverage includes every rating from new/Learning/Review/Relearning, both learning
steps, same-day and delayed reviews, 24-hour boundaries and UTC midnight,
graduation/lapses, long overdue cards, min stability, difficulty bounds, maximum
interval and half-even rounding. Preview/commit and repeated-call JSON equality
are checked throughout the golden sequences. Additional tests cover migration,
poisoning, persist failure, copy safety, queue sorting, counters and scan/review
concurrency. Runtime spies and the recursive import/call audit prove the local
boundary and confine metadata writes to the dedicated adapter. The audit also
rejects `Math.random` in Recall and impure scheduler dependencies.

Focused checks:

```sh
npm test -- recall/scheduler/fsrs6.test.ts recall/store/migration.test.ts
npm test -- recall/store/review.test.ts recall/services/recallService.test.ts
npm test -- recall
```

The generator/parser/identity regression suite remains in the Recall run. No
native Obsidian review UI validation is claimed: no such UI exists in this stage.

Local verification: `npm ci`, typecheck, focused golden/migration/review tests,
`npm test -- recall` (**319 tests / 12 files**), full `npm test` (**1,868 / 78**),
`npx eslint recall`, repository lint, proposal mutation audit (**5/5 caught**),
production build and baseline diff checks. Fixture regeneration was byte-identical.
Recall ESLint is clean; repository lint retains the pre-existing `api.ts:413`
fetch warning. Parser/identity/generator, Health, package manifests/lockfile and
plugin versions have no changes.

## Deferred slices

A future Review Session will consume these APIs for reveal, four rating buttons,
keyboard controls and refreshed previews, with recovery and commit-in-flight
handling. A separate history store needs an explicit transaction strategy before
introducing a full historical review log. Current counters/latest state do not
support parameter optimization; personalized training is not implemented.
Recall Health integration follows usable review sessions and remains separate
from scheduling persistence. Stable note identity/rename reconciliation, fuzzing,
daily limits, remote sync and Connect integration are outside this slice.
