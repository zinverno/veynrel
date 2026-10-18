# Group Apply — native acceptance

PASS on Linux desktop with Obsidian **1.13.7** and Electron **43.6.0**, using newly created synthetic vaults only. PR #95 was verified merged into `main` at `e0145d3362249f597b302fa9d405ec5cda9d7ead`; this work starts from that commit and preserves its completed-operation reservation policy.

The final Group run has **133 assertions: 18 baseline Inspector + 115 Group**. A second run has **116 assertions: 18 repeated baseline + 7 selected Group refusals + 91 existing Bundle regressions**. These are two runs, not 249 independent scenarios. Both used production artifact SHA-256 `0fac2c5f49a5a0ed8e4a140ffb6820f812f13bfcfc493d088e74926f96625630`. There are **61 published screenshots** (58 Group, 3 representative Bundle), 34 full Group plans and six independently checked byte-restoration results.

Evidence: [Group report](group-apply-evidence/native-report.json), [refusal/Bundle report](group-apply-evidence/regression-report.json), [refusal screenshot repeat](group-apply-evidence/refusal-report.json), [restored bytes](group-apply-evidence/byte-restoration.json), [completion cases](group-apply-evidence/completion-cases.json), [local validation](group-apply-evidence/validation.json), [hash manifest](group-apply-evidence/sha256.json). The [protocol](group-apply-v1.md) describes authority, journal validation and limits. All sources, control responses and screenshots are synthetic; no personal notes, paid keys or paid models were used.

## Successful cycles and frozen regression

The PR #92 corpus and gold labels are unchanged: SHA-256 `dc7cfdf692791552abd9b06c128f6a2c78f666882b159412b647ef747ef0cda8`. Native RU cases use its scenario **06** with an explicit CRLF conversion applied to both notes and scripted evidence quotes. EN cases add repeated heading titles and a canonical preamble with existing YAML, tags, frontmatter/body links and no terminal newline. Swapping canonical reverses the scripted quote sides as well. These derived fixtures do not modify the frozen corpus.

| Case | Variants | Observed result |
| --- | --- | --- |
| 06, RU | H1 / H2 / H3 selections, canonical B, CRLF | GroupPlan → separate consent → real Vault.process → SIGKILL/restart → separate Undo → both original byte sequences |
| EN nested guide | H1 / H2 / H3 selections, canonical A, LF, Unicode, repeated sibling titles | Same; existing canonical YAML/links preserved, unselected siblings retained only in secondary |
| 05 and 19 | Actual full group selected; ancestor representation, context and EOF confirmed; external evidence explicitly unresolved | Build and Apply remain unavailable; no Markdown or journal writes |
| 22 and 23 | Frozen rich dependencies / unscoped adjacent prose | No supported executable Group plan |
| 07 / 08 / 09 | Existing Bundle Apply, EN/RU, A/B, LF/CRLF | All six old code/list/quotation Apply → restart → Undo cycles still pass on the same build |

For 05/19 the refusal is the explicit unresolved-dependency choice, not a claim that a local structural parser detects all semantic external dependencies in prose. No new dependency policy or semantic proof is introduced. The earlier four ordinary MergePlan cases remain covered by the unchanged frozen-corpus unit suite. This is executor acceptance, not an improved LLM-quality score or broader planner eligibility.

Every successful cycle compares the two files as Buffers. Native process instrumentation observes only canonical. A whole-vault Markdown snapshot compares all other notes; secondary also retains birthtime, mtime and size. Restart performs no repair or rollback. After explicit Undo, independently retained SHA-256 results match both original sources.

## Consent, UI and refusal coverage

Each Group selection is reviewed in RU/EN, light/dark, at desktop widths 1200 and 390 px. Assertions cover full literal canonical before/after, secondary, insertion, diff, copied ranges, localized labels, no rendered source HTML/embeds and no horizontal overflow. Final Apply is activated with keyboard Enter. Undo has a separate inverse preview and confirmation. Native main-window and popout editors for either participant refuse consent without forced buffer saves.

Representative screenshots: [EN H3, light 1200](group-apply-evidence/group-apply-en-3-theme-light-1200.png), [RU H3, dark 390](group-apply-evidence/group-apply-ru-3-theme-dark-390.png), [RU diff](group-apply-evidence/group-apply-diff-ru-3.png), [popout refusal](group-apply-evidence/group-editor-true-1.png), [unresolved external context](group-apply-evidence/group-refusal-19.png), [retained damaged evidence](group-apply-evidence/group-recovery-torn-applied.png).

Two confirmation windows compete while the first writer is held. Single/Multi Apply tickets and all old Undo/resolution entrypoints are refused by the same execution owner. Global incidents injected into each of the six journal families after consent prevent the Group writer. Unit integration additionally exercises local/global damage, actual old review/Undo/resolution entrypoints against an unresolved Group operation, late results, cancellation, private tickets, exact-before callback races, stale metadata/resolver/incoming dependencies and repeated IDs.

## Completion is separate from Undo

Three native cases start from a completed Group Apply: edit canonical, edit secondary, or leave both unchanged. Each restarts Obsidian, checks released path reservations, builds a fresh Single-file plan from current sources and executes it through real Vault.process. Current text is preserved; old Group journals remain byte-for-byte unchanged.

An edit to either participant revokes the old Undo ticket and prevents a fresh old Undo review. With initially unchanged sources, Undo is available until the later Single-file operation changes canonical; the previously issued Group Undo ticket then also refuses. A completed operation ID cannot be prepared again and cannot serve as Archive Eligibility provenance. Screenshots show the [new review after canonical editing](group-apply-evidence/group-completed-canonical-review.png) and [old nonblocking history after secondary editing](group-apply-evidence/group-completed-secondary-history.png).

This follows fixed PR #95 Bundle and Merge completion semantics. Archive's active reservation remains unchanged because its parent Merge Undo exception requires a validated Archive Apply/Undo chain. Group introduces no such exception and does not weaken saved-note mtime checks.

## SIGKILL and recovery

The runner waits at each boundary, kills only its owned Obsidian process with SIGKILL and starts a fresh process. File bytes and journal hashes are checked before explicit actions. It never repairs the product evidence to continue a scenario.

| Interruption | Actual state after restart | Result |
| --- | --- | --- |
| Before preparing backups | Original sources, no operation | PASS |
| After first full copy | Original sources, damaged preparation | PASS; evidence retained, actions blocked |
| After both full copies | Original sources, prepared | PASS; reservation retained |
| Before Vault.process | Original sources, prepared | PASS |
| After canonical write, before applied | Expected after, recovered applied | PASS; explicit fresh Undo restores original bytes |
| During applied receipt | Expected after, torn evidence | PASS; automatic Undo blocked |
| After undo_intent | Expected after, pending Undo | PASS; fresh explicit recovery Undo restores bytes |
| After reverse write, before undone | Original canonical, recovered undone | PASS; incomplete operation stays reserved |
| During undone receipt | Original canonical, torn evidence | PASS; no repeated Undo, evidence retained |

A backup-copy IO error also causes no Markdown process call. Secondary and all other Markdown remain unchanged in success, error and interruption paths. Restored text without complete terminal evidence does not authorize silent receipt completion or release unresolved recovery reservations.

## Verification history and reproduction

Two early harness failures are preserved in [harness-failures.json](group-apply-evidence/harness-failures.json). One expected the native paragraph end to include a trailing newline; the corrected expectation uses the actual trimmed paragraph boundary. Another timed out opening review around a history refresh. The harness now waits for the shared owner and records review errors; the original timeout did not capture the exact alert reason. No Markdown/journal evidence was repaired. An intermediate passing run preceded the final canonical-prefix metadata check and is not the published final-build evidence.

Undo validation was checked against real persisted MetadataCache: only private root `v` and object key order are normalized, retaining every public value and array order. The new port checks the unchanged canonical prefix and the inserted hierarchy/sections separately, so source-only preamble refusals do not incorrectly reject a safe existing canonical YAML preamble. Repeated headings and disjoint copied ancestor introductions are matched by exact mapped offsets.

Final local gates: **3910 tests / 149 files**, typecheck, lint, production build, `audit:proposals` and `git diff --check`. Lint retains the existing `api.ts:404` fetch warning, with zero errors. An earlier full-suite run under concurrent native/build load hit three existing 5-second import-test timeouts; the final full run passed without changing timeouts. Two sandbox proposal-audit invocations received empty child stdout; the unchanged outside-sandbox run passed **5/5** mutations and every restored test. GitHub checks at the PR's actual head remain authoritative for CI.

After `npm ci` and `npm run build`, run sequentially on a supported Linux desktop with the existing native harness prerequisites (`/usr/bin/electron43`, `/usr/lib/obsidian/app.asar`, an X11 display and CDP port 9274 available). Each root must be new:

```sh
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-group-acceptance --group-apply
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-group-regression --group-apply --group-refusals --bundle-apply
```

Published runs used `/tmp/pair-inspector-group-apply-4` and `/tmp/pair-inspector-group-regression-1`. The latter explicitly selected unresolved groups for 05/19. A short `/tmp/pair-inspector-group-refusals-2` repeat (18 baseline + the same 7 refusal checks) scrolled to the disabled planner controls before capturing the four published refusal screenshots; it adds no new scenario coverage. The three published Bundle screenshots are samples; its full assertion matrix is in the regression report. Top-level Inspector IO counters are process-local (after restarts, the final process only), not cumulative counts of authorized Group writes; Group/Bundle assertions and disk comparisons cover those writes separately.

Network counters cover fetch/XHR and provider factories; scripted Analyzer completion replaces actual model calls. No new requestUrl instrumentation or provider-quality claim is made. 390 px is a desktop viewport, not a physical mobile test. No macOS/Windows, custom themes/editors, screen reader, power-loss, fsync, filesystem atomicity, ACID or independent-process exclusion guarantee is claimed. Torn or incomplete evidence can require manual review.
