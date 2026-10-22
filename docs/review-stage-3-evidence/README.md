# Stage 3 synthetic evidence

Frozen source `48edb0b51c469a6efbd3a36f11136144df29f9f3`, Linux Obsidian 1.13.7 /
Electron 43.6.0. All frames are complete native viewport captures. No personal
vault, TEST, live model or embeddings were used. Artificial vectors and loopback
responses test application mechanics, not semantic quality.

## Two continuous recordings

- [List → consent → recommendation → review → Apply → list → history → Undo](main-review-apply-list-reopen-history-undo.mp4).
- [Rules → sixth neighbor → duplicates → saved decision → upgrade → restart → disable/restore](rules-connection-rules-route.mp4).

Key frames: [decision card](main-link-result.png), [exact review](main-exact-review.png),
[list after Apply](main-list-after-apply.png), [list after Undo](main-list-after-undo.png),
[early refusal](main-unavailable-embed.png), [Archive review](main-archive-separate-review.png),
[active Archive blocks parent Undo](main-archive-blocks-parent.png),
[both Undo operations completed](main-archive-parent-undone.png),
[persisted rule + reviewed pair](rules-05-after-restart.png),
[1000-note cap](scale-1000-1000-cap.png), [explicit scoped computation](scale-1000-1000-explicit-folder.png),
[light 390 px](main-result-ru-theme-light-390.png), [real popout](main-popout-list.png).

## Reports and preservation

| Report | Observations |
|---|---|
| [main](main-report.json) | 64 assertions, 11 loopback requests, all consent bodies equal sent bodies, Link/Archive chains |
| [rules](rules-report.json) | 36 assertions, 0 requests; saved in #114 then upgraded; real popout shares owner |
| [decisions](decisions-report.json) | 28 assertions, 0 requests; restart/restore/error/reverse pair and separate content edit |
| [state faults](state-report.json) | 10 cases: empty/corrupt/unsupported/unreadable/backup for both stores |
| [empty](scale-0-report.json), [154](scale-154-report.json), [500](scale-500-report.json), [1000](scale-1000-report.json) | inventory, measured native refresh, explicit cap and scoped calculation, four close/reopen cycles each |
| [upgrade #113](upgrade113-report.json) | real old-build Link Apply, install current build, History validator and current-build Undo; 8 loopback requests |
| [upgrade 2.1.0](upgrade210-report.json) | exact published build booted before install; current route afterward; 8 loopback requests |
| [installer and rollback](upgrade-storage.json) | four isolated targets plus replacement fault; opaque probes establish byte retention only |

[Original Markdown hashes](main-before.json) equal both [after Link Undo](main-after-undo.json)
and [after Archive/Parent Undo](main-after-archive-chain.json). [After Apply](main-after-apply.json)
and [after Merge](main-after-merge.json) record actual changes, never fixture restoration.
The #113 transition likewise has separate before/after-apply/after-undo hash files.
The later synthetic manual edits are labelled separately in native reports.

Full frames and additional transition/fault captures remain in the permanent
artifact kit. This index selects key states instead of requiring dozens of images.
`SHA256SUMS` covers the published evidence files. Exact final review SHA and CI
artifact comparison live in the PR and frozen kit (avoiding a self-referential
commit hash in this document).

## Reproduction

Use a new output directory under the artifact root for each call; the harness
refuses an existing one. Run serially because its isolated CDP port is 9393.

```sh
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD integration
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD rules PREVIOUS_114_BUILD
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD decisions
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD state
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD scale-0
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD scale-154
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD scale-500
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD scale-1000
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD upgrade-operation PREVIOUS_113_BUILD
node scripts/review-flow-native.mjs NEW_ROOT FROZEN_BUILD upgrade PUBLISHED_210_BUILD
node scripts/beta-upgrade-check.mjs NEW_STORAGE_ROOT FROZEN_BUILD PUBLISHED_210_BUILD PREVIOUS_113_BUILD PREVIOUS_114_BUILD
```

Automatic gates: [4714 tests](tests.log), [typechecks/build/lint](lint.log),
[5/5 mutation audit](audit.log), [existing installer regression](installer.log).
No paid diagnostic authorization is reused. Complete-run fixture requests total
27 and cost $0; incomplete development runs are disclosed in the main report,
not counted as successful acceptance. Physical mobile, screen reader, Sync,
other OS and hardware compositor coverage are not claimed.
