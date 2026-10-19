# Structural Archive v2 — native acceptance

Scope: real Linux Obsidian, new synthetic vaults only, public `Vault.process()`, a scripted Relationship Analyzer only to prepare the completed Group/Bundle parent. No actual provider or paid request. The executable harness is [structural-archive-native.mjs](../scripts/structural-archive-native.mjs), selected through the existing native launcher.

## Reproduce

Build once and keep that artifact unchanged while running the matrix. Each command needs a previously nonexistent `/tmp/pair-inspector-*` root and exclusive use of the harness's CDP port 9274. The launcher owns and kills only its spawned Obsidian process.

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structural-cycles --structural-archive
```

This runs Group H1/H2/H3 and Bundle Code + Explanation, List + Context, Quotation + Attribution in EN/LF and RU/CRLF, with reversed canonical side, Unicode, known backlink/embed/property-link consumers and heading subpaths. Each of the 12 cases does:

```text
Parent Apply → restart → ArchivePlanV2 → final review → Archive Apply
→ SIGKILL/restart → separate Archive Undo → SIGKILL/restart → Parent Undo
```

Both final files must equal the original literal Markdown. The actual secondary mtime after Archive Undo must differ from the parent's historical mtime. Active Archive must remove Parent Undo; complete restoration must enable it. Only secondary reaches `Vault.process()` during archive Apply/Undo; only canonical reaches it during Parent Undo. Screenshots cover both built-in themes at 1200 and 390 pixels. Extra EN/RU scenarios open real main-window and popout editors and require final consent to be revoked without executor writes.

Planner and final review freeze SHA-256/size/mtime of every vault Markdown file and consolidation journal JSON. Those snapshots must remain equal before confirmation. Mutation hooks count `process` and other vault calls; journal adapter mutations and model factories are counted separately. Relationship/Decisions/Rerank factories and fetch/XHR are blocked during the archive interval. Obsidian `requestUrl` is not directly instrumented; the absent provider path and unit coverage supplement this observed boundary.

## Real interruption matrix

Run each checkpoint in its own fresh vault; preserve failed/interrupted journals:

```sh
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structural-group-first --structural-archive --structural-crash=first-backup
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structural-bundle-first --structural-archive --structural-bundle --structural-crash=first-backup
```

Repeat for `before-backup`, `first-backup`, `both-backups`, `before-write`, `after-write`, `torn-applied`, `undo-intent`, `undo-after-write`, `torn-undone` — nine checkpoints for each parent family. The harness pauses at the actual journal/dispatch boundary, sends SIGKILL to its owned Electron process, restarts the same synthetic vault, and checks actual Markdown and every journal file/hash/mtime. Torn receipt tests persist a truncated real receipt before killing the process. No fixture deletes or repairs that evidence.

Only `before-backup` leaves ordinary Parent Undo eligible. Every prepared, active, torn or incomplete chain refuses Parent Undo; incomplete archive operations offer no automatic Archive Undo. The reverse-write checkpoints specifically prove that original source text does not authorize Parent Undo without a complete receipt chain.

## Negative controls and regressions

Use a fresh root per control:

```sh
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structural-backlink --structural-archive --structural-negative=new-backlink
```

Controls: `parent-copy`, `metadata`, `replacement`, `canonical-edit`, `secondary-edit`, `new-backlink`, `pending-single`, `competing`, and `block-<family>`, where family is `operations`, `multi-operations`, `merge-operations`, `archive-operations`, `bundle-operations`, `group-operations`, `empty-atom-operations`, or `structural-archive-operations`.

The replacement control deliberately renames a real TFile and creates a new file with identical Markdown. Those two adversarial fixture operations are excluded from the executor mutation claim. Secondary edit, new backlink and intact pending Single are introduced after full Archive Undo and must block Parent Undo. The pending journal has two valid copies and no applied marker; it is not a damaged-record shortcut. The competing control holds native dispatch and checks the shared owner refuses another archive ticket and Parent Undo.

Merge Archive v1 runs separately on the same artifact:

```sh
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-structural-merge-regression --archive-apply
```

Unit coverage additionally exercises wrong parent type/ID/hash, missing/disagreeing copies, duplicate/conflicting/torn/absent receipts, repeated Apply/Undo, multiple archives for one parent, identity/stats/content/cache/resolver changes, all eight blockers after consent and after copies, pending Single/Multi records, broken restoration after parent Undo intent, H1/H2/H3 and Bundle contexts, preservation/YAML integrity, Unicode/CRLF, cancellation and late UI results. Existing planner and all seven executor/journal suites remain enabled.

## Evidence and limits

**PASS, 2026-10-19:** 36 fresh-vault runs on Obsidian **1.13.7**, Electron **43.6.0**. One production artifact: `0166e1a5844ff80bc9d356fc74b429a9835841b8e1f55071c73e0d3f87bc6487`.

| Gate | Result |
| --- | --- |
| Full Group/Bundle round trips | 12/12; 172 cycle/editor assertions |
| Main-window/popout consent controls | 4/4, EN/RU |
| Real SIGKILL checkpoints | 18/18, nine per parent family |
| Native negative controls | 16/16, including all eight journal families |
| Merge Archive v1 regression | PASS, 58 archive assertions |
| Unit tests | 4430/4430, 161 files |
| Typecheck, lint, build, diff-check | PASS; no new lint warnings |
| Proposal mutation audit | 5/5 mutations killed; restored tests passed |

[Run ledger](structural-archive-v2-evidence/runs.json), [cycle report](structural-archive-v2-evidence/cycles-report.json), [case IDs and mtimes](structural-archive-v2-evidence/cases.json), [complete parent/archive chains and final file hashes](structural-archive-v2-evidence/completed-chains.json), [Merge v1 report](structural-archive-v2-evidence/merge-v1-report.json), [local validation](structural-archive-v2-evidence/validation.json), [evidence SHA-256 manifest](structural-archive-v2-evidence/sha256.json).

The complete-chain export independently checks equal recovery copies, the exact immutable parent, the original parent applied receipt, each archive receipt's record/prior-receipt hash, and byte-identical final files. It includes actual filesystem secondary `mtimeMs`; Obsidian's public integer-millisecond mtime exactly equals the rounded filesystem value and the archive undone receipt, and differs from the original parent mtime. No production timestamp tolerance was introduced.

Representative screenshots: [RU Group, dark/390](structural-archive-v2-evidence/structural-group3-ru-theme-dark-390.png), [EN Bundle, light/1200](structural-archive-v2-evidence/structural-07-en-theme-light-1200.png), [exact YAML diff](structural-archive-v2-evidence/structural-08-en-diff.png), [separate Undo](structural-archive-v2-evidence/structural-09-ru-undo.png), [popout refusal](structural-archive-v2-evidence/editor-ru-true.png). The directory includes all 48 theme/width review captures, 12 diffs, 12 Undo previews, four editor controls, and recovery/negative screenshots.

Final observed results and artifact hashes are recorded alongside this report in `structural-archive-v2-evidence/`. Native acceptance is synthetic and covers Linux desktop with built-in themes. 390 pixels is desktop emulation, not physical mobile. It does not establish screen-reader/custom-theme support, cross-process filesystem atomicity, fsync durability or exhaustive discovery of external consumers.

The preliminary run exposed a harness timing error: closing a completed parent Undo starts a read-only history refresh; opening the next Apply before it finishes correctly returned `busy`. The harness now waits for the owner. Opening an editor also correctly revokes the planner itself, so editor controls use independent sources instead of attempting to reuse that revoked plan. Visual inspection caught a copied Merge-specific provenance label in the new final review; it now uses the existing generic v2 parent label and has a RU/EN regression assertion.

A parallel local validation attempt timed out in older tests; the isolated repeat passed without weakening timeouts. `audit:proposals` required execution outside the sandbox because its nested test process returned empty captured output inside it. These harness/environment incidents are distinct from passing product assertions. Independent review also found an intact pending Single reservation missing from the restoration path; a failing regression reproduced it before the shared pending check was added to restoration evidence.
