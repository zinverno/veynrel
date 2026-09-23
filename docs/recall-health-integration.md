# Recall Health integration

Recall Health answers **“Does my known Recall queue need attention right now?”**
It derives the review/scheduling state of Veynrel-tracked active cards from the
existing native FSRS-6 Recall owner. No external spaced-repetition plugin is needed.

It does **not** establish that every possible flashcard has been discovered, that
Markdown inventory is globally fresh, that every note should have cards, or that
the user's memory is objectively good. **Good** means tracked active cards exist
and none is due now. **Refresh flashcards** updates cards from notes; opening
Health never performs that inventory. The card also explains this distinction.

## State mapping

| Recall metadata | Health state | Depth | Complete | Card status |
| --- | --- | --- | --- | --- |
| Uninitialized / loading | unknown | not-enabled | false | Not enabled |
| Ready, first run | unknown | not-enabled | false | Not enabled |
| Ready, established inventory, zero active | unknown | basic | true | No active cards |
| Ready, active > 0, due > 0 | review-recommended | basic | true | Review recommended |
| Ready, active > 0, due = 0 | good | basic | true | Good |
| Invalid / unsupported | unknown | not-enabled | false | Recall data needs recovery |
| Unavailable | unknown | not-enabled | false | Recall data unavailable |

Due cards are normal spaced-repetition work, never **Needs attention** Findings.
`basic` is the existing internal local-analysis depth. Recall displays **Native
FSRS**, not **Basic analysis**, with `{due} due · {active} active`. New count remains
available in the sanitized signal but is reserved for Recall workspace detail.
EN/RU copy includes Russian plural forms. No card text, answers, scheduler
parameters, raw errors or credentials enter the Health snapshot.

First-run copy invites the user to set up Recall. Complete empty inventory is
neutral, not Good. A partial inventory does not invalidate known schedules;
existing Recall reconciliation preserves unknown/absent cards conservatively.
Retired cards do not contribute active/due counts or next due time.

## Shared ownership and boundaries

```text
registerHealth
  ├─ one RecallProductController ── Recall workspace product port
  │       └─ one lazy RecallService / RecallStore
  └─ RecallHealthAdapter(same product)
          └─ Health-owned RecallHealthPort
                  └─ HealthPluginController → HealthService → aggregateHealth
                          └─ healthHomeViewModel → renderHealthHome
```

`health/recallHealthPort.ts` exposes only `initialize`, `getSnapshot`, `subscribe`
and primitive load/first-run/count/next-due metadata. The adapter lives under
`recall/product`, projects the existing product snapshot and delegates loading and
notifications. It owns no cache, reader, parser, recovery policy or due calculation.
Health aggregation has no Recall service/storage/scheduler dependency.

The controller subscribes once for its plugin lifetime. Every workspace view
subscribes to that controller and removes its listener on close. Both Home and
the existing Recall route receive committed product changes, including reviews,
inventory and recovery. Subscriber exceptions cannot invalidate durable mutations.
Plugin disposal removes the bridge subscription. Multiple Health views share
exactly the same Recall product/service/store; only presentation timers are local.
PR #39's single transient review-surface ownership remains unchanged.

## Metadata-only initialization

This deliberately changes PR #39's **only opening Recall initializes Recall**
boundary. Plugin construction/registration still performs **zero Recall IO**.
Health onboarding and Health recovery keep Recall dormant. Once normal Health
navigation becomes available, the view requests passive Recall initialization.

The existing storage adapter may check/read `recall/cards.json`. It does not
enumerate Markdown, read notes, scan inventory, write metadata, create directories,
call `requestUrl`, contact a provider, or initialize another owner. Missing storage
is an empty first run. Further Health/Findings/Discover navigation reuses the loaded
state without another read. Health's own existing metadata initialization is unchanged.

After restart, persisted v2 schedules appear on Health before visiting Recall.
Valid v1 inventory migrates in memory only; its active cards appear new/due, with
zero migration writes. The next explicit inventory/review mutation writes v2
according to the existing Recall contract.

## Updates and due-time wakeup

Reviews and successful explicit Find/Refresh publish only after persistence.
Health updates immediately without a Health scan. No optimistic Good state is
shown while a review write is pending. Successful scoped Recall recovery replaces
the blocked service/store with a missing first-run owner: Home returns to **Not
enabled**, with no automatic inventory.

While Home shows active cards with zero due, it schedules one timeout at the
existing product's earliest `nextDueAt`. The callback only rerenders and obtains
a fresh summary from cached metadata. This allows **Good → Review recommended**
when time passes, including Again's one-minute boundary, with no reads or writes.
The same timer helper serves the existing idle Recall overview.

Each render cancels/recomputes the timer; navigation away, view close and product
updates clear it. Delays are bounded by `2_147_483_647` milliseconds and rechecked
after waking. A deadline crossed during rendering schedules an immediate callback.
There is no interval, polling, automatic review or automatic scan.

## Navigation, isolation and persistence

Every available Recall card state has an explicit `action: "recall"`, rendered as
a native button with text status/counts and visible keyboard focus. It opens
`{ page: "recall" }` within the same ItemView. It never filters Findings by Recall.
The existing responsive four-card grid is retained; long copy wraps at 390px.

Invalid/unsupported/unavailable Recall data affects only the Recall card. Health
local scan, Findings, Discover, Structure and Connections remain usable. Clicking
Recall opens its existing recovery/Retry surface; Home has no Recall reset controls.
`HealthRecovery` does not know about Recall files. Blocking Health recovery still
dominates the view and navigation.

There are **no Recall Findings, Recall ScanRuns or Recall reconciliation receipts**.
Recall due/active counts never affect `openFindings`, `newFindings` or Finding
recommendation ranking. Recall card Finding counts are zero. Scheduling state is
derived, with no Health persistence: reviews/inventory/recovery do not write
`health/findings.json` or `health/scan-runs.json`. Only Recall's existing metadata
and scoped recovery paths are authoritative. Markdown is never mutated.

Structure and Connections retain their existing local/semantic policies, and
Knowledge stays Not enabled. Health local scan completeness/failure does not
downgrade a valid Recall schedule.

## Verification

Focused integration and existing review regression checks:

```sh
npm test -- health/services/recallHealth.test.ts health/ui/recallHealthViewModel.test.ts recall/product/recallHealthAdapter.test.ts health/ui/recallView.test.ts
```

These cover the full state mapping, sanitation/copy ownership, unchanged Finding
bytes/counts/recommendation, zero-IO construction, onboarding, passive Health entry,
all four ratings and persist-before-publish, time wakeup/cleanup, v1/v2 restart,
partial/empty/retired inventory, corruption/recovery/Retry and multiple views.
Existing Recall question/reveal, decision time, previews and keyboard tests remain
part of the regression suite. See [native smoke evidence](recall-health-evidence/README.md)
for the exact artifact, desktop checks and platform limits.

## Deferred work

No review history, optimizer, daily limits, decks, automatic inventory/generation/
review, Knowledge Health, Deep Intelligence, Hidden Connections or external plugin
integration is added. A future overall action model could combine Recall workload
with Finding recommendations without manufacturing Findings. Global inventory
freshness would need its own explicit coverage contract. Native mobile, popouts,
screen readers and custom themes require separate verification.
