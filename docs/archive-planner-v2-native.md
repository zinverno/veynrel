# Archive Planner v2 — native acceptance

PASS on Linux with **Obsidian 1.13.7 / Electron 43.6.0**, using newly created synthetic vaults and the production build. Artifact SHA-256: `27ff72c93cda4a430ca418406b421fe18d678c95493a9a5059b1ab579ea1efc4`.

The final v2 run has **93 archive assertions across eight cases**, plus 18 existing Inspector baseline checks. It publishes **59 screenshots**, eight full `ArchivePlanV2` JSON snapshots and a [case ledger](archive-planner-v2-evidence/cases.json). See the [full native report](archive-planner-v2-evidence/native-report.json), [local validation](archive-planner-v2-evidence/validation.json) and [artifact manifest](archive-planner-v2-evidence/sha256.json). The [protocol document](archive-planner-v2.md) explains the preservation contract and future Undo chain design.

## What ran

| Parent | EN / LF | RU / CRLF | Native source evidence |
| --- | --- | --- | --- |
| Group H3 with H1/H2 ancestor introductions and retained H2 sibling | PASS | PASS | Three exact copied source ranges, whole-source partition, individual uncopied decisions |
| Bundle Code + explanation | PASS | PASS | Native code section and all confirmed surrounding paragraphs |
| Bundle List + context | PASS | PASS | Native list-item boundaries and all confirmed surrounding paragraphs |
| Bundle Quotation + attribution | PASS | PASS | Native blockquote and attribution/context boundaries |

Each case creates new sources, drives the real Inspector/planner and separately confirmed **Group/Bundle Apply** through `Vault.process()`, checks the validated journal and `applied` receipt, verifies canonical after and byte-identical secondary, then SIGKILL/restarts its owned Obsidian process. Archive review is opened from the restarted Operation History. Scripted analysis replaces the model only while preparing the parent; it is not semantic-quality evidence.

The review starts with all choices/checkboxes empty. Group's remaining heading and prose require decisions; choosing further consolidation blocks the plan. Bundle v1 copies its complete validated envelope, so those cases have no non-whitespace uncopied fragments. Status, limitation acknowledgement and the separate unknown-consumer decision remain required. Known consumers include backlinks, embeds and property links; Group includes heading subpaths.

A ready V2 plan includes the original parent operation/ID, full exact canonical text, full secondary before/after, the YAML-only diff and all source ranges. Concatenating every partition part reproduces the complete original secondary. Removing only the proposed insertion reproduces it again. No Archive Apply button or executor is exposed. Changing a decision immediately removes the plan; cancel/restart never restores confirmations.

All eight cases run built-in light/dark themes at **1200 and 390 desktop pixels**, with localized EN/RU controls and no horizontal overflow. Screenshot examples:

- [EN Group, light 1200](archive-planner-v2-evidence/archive-v2-group-en-theme-light-1200.png), [RU Group, dark 390](archive-planner-v2-evidence/archive-v2-group-ru-theme-dark-390.png).
- [Code proposed after](archive-planner-v2-evidence/archive-v2-07-en-after.png), [List diff](archive-planner-v2-evidence/archive-v2-08-ru-diff.png), [Quotation controls](archive-planner-v2-evidence/archive-v2-09-en-controls.png).
- [Secondary popout revokes ready plan](archive-planner-v2-evidence/archive-v2-group-en-popout-stale.png), [canonical editing revokes review](archive-planner-v2-evidence/archive-v2-group-ru-stale.png).

## Read-only boundary

After each authorized parent Apply, the harness freezes **every vault Markdown file and every consolidation journal JSON**, including SHA-256, byte size and mtime. These snapshots remain identical through review/build/choice changes/cancel/restart. The planner interval records **zero Vault mutation calls, zero journal adapter mutations and zero model-factory calls** in all eight cases. Fetch/XHR attempts are blocked and counted; relationship, Decisions and Rerank factories are blocked and counted during archive review. No actual provider is contacted. The harness does not instrument Obsidian's `requestUrl` directly; unit spies and the planner's absence of provider ports complement the measured boundary.

The EN Group case additionally opens secondary in a real native popout **after publication**: workspace events revoke the ready plan without a file edit, and disk snapshots remain identical. EN/RU Group cases intentionally edit canonical after the read-only boundary; the old operation then has no eligible archive action in History. Those deliberate test edits are not planner writes.

V2 plans are verified snapshots, not persistent execution permissions or continuous monitors. Hidden adapter-only journal changes may not emit Obsidian events and require a new review. Every build re-reads all authority; no background filesystem scan is introduced. The future executor must independently validate the chain described in the protocol.

## Tests, review and reproduction

Unit coverage includes completed Merge v1/Group/Bundle, prepared-only and recovered-only parents, absent/torn/conflicting applied receipts, missing/disagreeing copies, Undo states, source/stat/identity/cache/resolver/editor changes, pending Single/Multi conflicts, cross-family journal damage, sequential operations over one pair, H1/H2/H3 and ancestor introductions, Code/List/Quotation context, range gaps/overlaps/damaged structures, unknown incoming data, subpaths, YAML refusal, Unicode/CRLF and stale async/cancel/close/selection sequences. V1 formatting and full Merge Archive Apply/Undo regression suites remain enabled.

Independent code review found a missing workspace subscription for an editor opened after publication. It was fixed and covered by unit tests and the real popout scenario above. An intermediate native run preceded that fix and is not the final evidence. Early test/lint failures were limited to the new test harness using the wrong Single Apply method, reusing a now-ambiguous synthetic quote for a second Group operation, and missing TypeScript annotations. No product checks, timeouts or safety contracts were weakened. A sandbox proposal-audit attempt returned empty child stdout; the unchanged outside-sandbox run passed 5/5 mutations and all restored tests.

After `npm ci` and `npm run build`, use the existing Linux native prerequisites (`/usr/bin/electron43`, `/usr/lib/obsidian/app.asar`, X11, CDP port 9274 free). Each output directory must be new:

```sh
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-archive-v2-acceptance --archive-planner-v2
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-archive-v2-merge-check --archive-planner
```

Published v2 run: `/tmp/pair-inspector-archive-v2-2`. The separate Merge v1 regression passed **40 archive assertions plus 18 repeated Inspector baseline checks** on the identical production artifact and is reported in [merge-native-report.json](archive-planner-v2-evidence/merge-native-report.json). Local gates are recorded in `validation.json`; GitHub checks on the PR head remain authoritative for CI.

390 px is desktop emulation, not physical mobile. No custom themes, screen reader, other OS or exhaustive external-consumer guarantee is claimed. Group retained rich syntax is intentionally refused; the UI and protocol disclose it. No Group/Bundle Archive Apply, timestamp relaxation, legacy atomization change, version bump or release is included.
