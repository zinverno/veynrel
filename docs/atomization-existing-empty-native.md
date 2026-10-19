# Existing empty note: native acceptance

The [protocol](atomization-existing-empty-note-v1.md) uses only existing-file `Vault.process()`. Creation remains blocked by the separate PR #98/#99 regression. No personal vault, paid model or production monkeypatch is involved. Test-only wrappers count calls or pause before/after actual native operations; they are not bundled into Veynrel.

Final native result: **PASS — 168 assertions**, Obsidian **1.13.7**, Electron **43.6.0**, Linux desktop. Ten language/content cycles and all nine SIGKILL boundaries completed. The reviewed production bundle SHA-256 is `13f9f3cbf4fef2cfc633f30a996a2ad093156bfc754adf3f0b7bf337c2e74e4c`. The regression-only exclusive creator is absent from `.esbuild/meta.json`.

## Reproduction

```sh
npm run build
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-empty-atom-<fresh-id> --empty-atom-apply
node scripts/pair-inspector-native.mjs /tmp/pair-inspector-empty-creation-regression-<fresh-id> --atomization --exclusive-create-v2
```

Use a new nonexistent directory for each run. The harness launches an owned Linux Obsidian process with a separate profile and a newly generated synthetic vault, accepts trust only for that vault, and kills/restarts only its own process. Original sources and targets are authored by the fixture outside the operation under test. Crash evidence is moved outside the synthetic vault by the harness after each observation so intentionally damaged global storage does not contaminate later cases. The plugin never performs that cleanup.

## Native matrix

- Real product UI: plan → separate unchecked confirmations → final review → actual `Vault.process` → receipt → SIGKILL → history → separate Undo review → actual `Vault.process` to `""`. Ten cycles cover RU/EN paragraphs, conditional assertions and H1/H2/H3 with context, LF/CRLF, combining Unicode and emoji.
- Before/after snapshots cover **all Markdown paths and bytes**, with only the existing target allowed to change. The number of Markdown files stays constant throughout each Apply/Undo. Native counters verify no create/delete/rename/trash/append/modify/user-folder call and no Markdown adapter write by the operation; only the chosen target is passed to `Vault.process`.
- Native empty caches `{}` and, after restart, `{v:1}`. No normalization of missing cache into an empty section list.
- Full literal sources, selected unit/context, additions, empty before, complete after and diff. RU/EN, light/dark, 1200/390 px; these are desktop viewports, not mobile acceptance. No HTML/Markdown rendering or remote media in the preview.
- Target/source edits after review, target replacement/rename, lost MetadataCache, close during a pending native read, cancel/reopen and selection changes revoke consent without journal/Markdown writes.
- Later target/source edits, replacement/rename and a new incoming backlink prevent old Undo while completed receipts release path reservations.
- Clean affected editors for all three participants, both main window and actual popouts, refuse consent. Two actual desktop windows with separate review tickets produce one write under the shared owner. Repeated Apply and Undo are refused.
- Nine real SIGKILL boundaries: before journal, after first copy, after second copy, before process, after forward process before applied, torn applied, after undo intent, after reverse process before undone, torn undone. Markdown and raw journal evidence remain identical across restart; no background creation, clearing, deletion or receipt repair occurs. Ambiguous entries offer manual recovery and reserve their known paths.

The scripted Relationship Analyzer response is supplied through the existing isolated harness; counters assert it is not called again by plan/review/Apply/Undo. It proves UI/protocol integration, not LLM quality or semantic independence. The native process uses the installed public Obsidian APIs. Unit tests separately exercise exact callback mismatch with stale cached stat, forged/foreign tickets, rehashed invalid plans, conflicts/corruption, all seven local/global journal families and the common execution lock.

## Evidence and error log

Machine-readable final results, source/build fingerprints, complete plan JSON, crash journal copies and representative screenshots are in [`atomization-existing-empty-evidence/`](atomization-existing-empty-evidence/). `validation.json` records the exact local checks. `development-errors.json` records unsuccessful intermediate checks rather than treating them as product acceptance.

Console logs have trailing whitespace normalized for diff-check. Journal copies and receipts retain their exact native bytes; `artifact-sha256.json` fingerprints every other evidence file.

Representative captures: [EN/light/1200](atomization-existing-empty-evidence/empty-atom-en-theme-light-1200.png), [RU/dark/390](atomization-existing-empty-evidence/empty-atom-ru-theme-dark-390.png), [popout refusal](atomization-existing-empty-evidence/empty-atom-popout-refusal.png), [interrupted Apply](atomization-existing-empty-evidence/empty-atom-recovery-after-process.png), [torn Undo receipt](atomization-existing-empty-evidence/empty-atom-recovery-torn-undone.png). Full exact before/after text is also saved in each `*-plan.json`; screenshot clipping does not stand in for the byte comparison.

The first complete adversarial harness run stopped before the final crash boundary with the planner already `idle`, rather than `ready`. It performed no operation at that point. The exact invalidating event was not recorded; fixture timing was suspected. The harness now waits for public MetadataCache events to settle before interacting with its freshly authored fixtures; production invalidation was not relaxed. The complete matrix was rerun in a fresh vault. A unit fixture's nonexistent candidate-label property and TypeScript-only test/event-overload mistakes were also corrected before acceptance.

During review, a URL-shaped title was found to disagree with the strict postwrite heading validator. V2 now refuses that title before journaling or writing; a regression test covers it. V1 and legacy behavior are unchanged.

## Limits

User-created target files are required. Undo clears contents and keeps the file. Independent processes, sync clients and other plugins are not locked; public `Vault.process` is not an OS-level compare-and-swap against an external path replacement/deletion. No protection against malicious recreation of identical content/timestamps across restart, physical power loss, fsync/ACID durability, other OSes, mobile, custom editors, screen readers or live providers is claimed. Conservative inventory revalidation can disable old Undo after unrelated vault changes; it never blocks a fresh action solely because a prior operation has intact terminal receipts.

The `Vault.create` overwrite regression and the exclusive creator's parent-relocation blocker remain separate from this successful existing-file workflow. Nothing here authorizes automatic creation or deletion of an atomic note.

The separate final-build creation regression also passed as a **diagnostic refusal gate**: the original 10/10 public-create race pairs remain red, and parent relocation still leaves unauthorized empty evidence outside the intended vault. Its existing observation benchmark measured 12.8 ms at 1,000 notes and 123.9 ms at 10,000 notes in this run. Those are the PR #99 observation benchmark, not a throughput claim for the entire new multi-check executor.
