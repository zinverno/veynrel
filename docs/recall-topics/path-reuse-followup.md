# PR #136: source path reuse and no-op persistence

Follow-up to `871ed577fa06a7aa797c6ff96078b82878e58673`, verified as the open PR's HEAD before editing. The same `feat/recall-topics-vocabulary` branch is used. Scope is limited to the two reproduced defects.

## Fixes and compatibility

`RecallStore` now resolves ownership before admitting candidates. Existing cards retain their IDs, fingerprint inputs and schedules. When a path's old anchor belongs to a renamed source, a newly observed independent source gets an unused canonical-path-shaped anchor. All stored anchors (including retired records), stored paths and incoming paths are reserved during allocation. No file or per-entry UUID is created.

The old writer could already have saved disjoint cards from two paths with one shared anchor. Existing exact matches are retained under their old IDs; newly observed entries use an exclusively owned anchor. Ambiguous existing histories and final ID/fingerprint collisions still reject the update rather than guessing.

**Schema remains v4:** no field, identity formula, decoder or interpretation of stored fingerprints changes. The existing `sourceKey` field remains the identity input, independent of current `path`. v1/v2/v3 migration and existing v4 data stay readable. A regression fixture explicitly covers pre-fix v4 sources sharing one anchor. The migration test now verifies that an unchanged observation defers backup, then a real retag saves/verifies the original bytes before writing.

A targeted reconciliation with no created, changed, reactivated or retired card returns without serialization, backup, storage write, revision change or timestamp update. It still runs the source-freshness and cancellation checks inside the serialized store queue. Full inventory coverage/timestamps retain their existing semantics. Parsing of unknown notes is retained, so manually added first Flashcards/Vocabulary are discovered.

Production changes are limited to `recall/store/recallStore.ts` and the explanatory `sourceKey` comment in `recall/domain/card.ts`. No scheduler, generation, preview, vocabulary syntax, UI, dependency or version change.

## Reproduction before and after

[Machine-readable reproduction](evidence/path-reuse-reproduction.json). The supplied pinned reproducer was run on the original build with SHA-256 `57a677fd…e0eb2b`. The same scenarios were then run against the changed production modules bundled by esbuild, with mocked Obsidian APIs and in-memory storage. These are contract/write-count measurements, **not disk timings or native performance benchmarks**.

| Scenario | Before | After |
| --- | --- | --- |
| New Words.md after moving original to Archive/Words.md | Targeted and full update throw identity collision; 1 active card | Both updates succeed; 2 independent cards |
| Original reviewed schedule | Preserved despite rejected update | Preserved; new source starts with a fresh schedule |
| Three empty targeted refreshes | 3 writes | 0 writes |
| Three modify events + actual debounce, empty database | 3 writes | 0 writes; first-run state retained |
| Three unrelated refreshes, 1,000 cards | 3 × 605,649 bytes = 1,816,947 bytes | 0 writes / 0 bytes |

The event-level regression also runs with 1,000 cards: its different fixture produced 3 writes totaling 1,754,604 bytes before the fix, and asserts 0 writes / 0 bytes afterward. Both sizes describe their specific synthetic fixtures.

## Tests and native evidence

- The first 16 new regressions on the original source produced **15 failures and 1 pass**. After the fix all 16 passed; two additional checks cover no-op freshness/cancellation and vocabulary direction changes through events.
- **18 new regressions** in `sourceOwnership.test.ts` and `noteEvents.test.ts`: study/forward/both, targeted/full refresh, repeated moves and return to an available name, overlapping/non-overlapping entries, retired history, restart, existing v4 shared anchors, ambiguity, first-card discovery, retag, direction changes, malformed partial captures, removal and reactivation.
- Recall: **635 tests / 24 files passed**. Full suite: **5,310 tests / 197 files passed**. Final focused checks after test-fixture lint cleanup: **40 tests / 3 files passed**.
- Typecheck (both projects), production build, lint, proposal mutation audit (**5/5**) and diff check passed. Lint retains the two existing fetch advisories. The first lint attempt found fixture typing/logging issues; those were corrected without rule exemptions.
- Separate read-only review found no Required/Critical issues in ownership, compatibility, no-op and queue handling.

[Native before](evidence/path-reuse-native-before.json) reproduces the failed new-file import on the old exact bundle. [Native after](evidence/path-reuse-native-after.json) records **36 passing checks**, exact updated runtime hashes and zero runtime exceptions on Linux Obsidian **1.13.7**, Electron **43.6.0**.

The new native checks create a second dictionary at the old path, rate it independently, preserve the original history, move both files repeatedly, refresh the full inventory and restart Obsidian. A forwarding spy on the real adapter observes zero `cards.json` write calls across three saved prose edits; the real file remains byte-identical. The existing native Ctrl+Z/Ctrl+Shift+Z checks also pass, preserving neighboring manual typing. The harness uses a new disposable vault/profile and synthetic loopback transport; no personal vault, credentials or live model are used.

Reproduce with `npm run build`, then `node scripts/recall-topics-native.mjs /tmp/veynrel-recall-native-unique-followup`. For a manual spot check: import/rate a dictionary, rename it, create another dictionary at the old name with an overlapping pair, refresh both and confirm independent histories; generate questions in a saved study note and exercise Undo/Redo.

Offline/Sync move inference, ambiguous replacement of a tracked destination, physical mobile, legacy CM5 and live generation quality remain unverified. No merge, release, paid/remote model request or personal-vault installation was performed.
