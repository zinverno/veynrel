# 2.4.0 Recall release candidate: upgrade and recovery

Status: **candidate, not published**. This is the bounded R01 delivery from the [planning PR's verified contract](https://github.com/zinverno/veynrel/blob/191353ca856d52ba2be7e519e4cbee480e8638de/docs/roadmap/vault-assistant-plan.md). It authorizes no merge, tag, release publication, deployment or installation into a personal vault. The actual published stable baseline checked on 2026-11-13 is [2.3.1](https://github.com/zinverno/veynrel/releases/tag/2.3.1), source `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`.

## Candidate changes

The candidate delivers the already merged [Recall topics/vocabulary work #136](https://github.com/zinverno/veynrel/pull/136) and [Reading-view persistence fix #137](https://github.com/zinverno/veynrel/pull/137). Version 2.4.0 is a minor increment because these capabilities are new relative to stable 2.3.1. Plugin identity remains `ai-knowledge-hub`; the declared Obsidian minimum remains 1.8.7.

R01 adds one reproduced runtime correction: an explicitly marked vocabulary note without a recognized `Vocabulary` section now reports an incomplete source and keeps existing cards active. Previously a misspelled heading silently produced an empty complete capture and retired them. The guidance identifies the required heading; a deliberately empty recognized section still retires removed entries. No scheduler changes, mandatory question preview, duplicate audit, Anki import, new dependency or R02–R15 work is included.

See the [Recall guide](wiki/Recall.md) for supported syntax and the [R01 verification report](release-2.4.0-verification.md) for exact tested assets, checks, failed attempts and limitations. Synthetic transport tests verify workflow behavior, not live-model quality or the educational value of generated questions.

## Before updating an existing vault

1. Finish or cancel running work. Save notes, close all Obsidian windows for this vault, and pause synchronization on every device that can write it.
2. Make a complete, readable snapshot **outside the vault**: notes, attachments and the entire configuration directory, including hidden files. For the default configuration this includes `.obsidian/plugins/ai-knowledge-hub/`, `data.json`, `recall/cards.json`, any Recall backups/recovery files, hotkeys and enabled-plugin settings. A customized configuration directory replaces `.obsidian` in these paths. Treat backups as private because settings may contain credentials.
3. Record the installed version and preserve its matching `main.js`, `manifest.json` and `styles.css`. Verify that the backup can be copied into a disposable vault and opened. Do not rely on Git worktrees, a runtime-only ZIP or synchronization history as a complete data backup.
4. For candidate evaluation, copy the three **matching candidate** runtime files into a disposable copy's existing plugin directory. Keep the plugin ID and all existing data files. Do not delete the plugin directory, replace `data.json` with defaults, or copy the test fixtures into a real vault.
5. Start that copy, inspect preserved preferences, then open Recall. Loading valid old metadata migrates it only in memory. The first actual mutation writes v4 after saving and verifying the exact original JSON in a unique `recall/cards.pre-v4-<timestamp>-<uuid>.json`. A backup failure blocks the write; do not bypass it by deleting metadata or changing its version number.
6. Inspect active and retired cards, due dates, study topics and vocabulary directions. Use Refresh explicitly. A partial or malformed source is not evidence that missing cards should be removed. Review existing material without a model before trying generation.

Stable 2.3.1 writes schema v3. The candidate also supports valid v1/v2 input through the existing migration code; those older schemas have automated fixture coverage, not a claim of native upgrades from every historical release. V1 did not contain FSRS review schedules, so those cards receive initial schedules rather than invented historical progress.

## Partial failures after generation

Markdown insertion and Recall metadata are separate writes. If questions are saved but Recall cannot update, preserve the note. Retry loading Recall if offered, then Refresh; do not generate again to repair the queue. If saving the editor is not confirmed, preserve the buffer, save explicitly and Refresh. Normal editor Undo/Redo applies to the inserted block; closed-file batch writes have their own backup behavior and do not promise editor Undo.

A corrupt or future schema remains write-blocked. Before any recovery action, preserve the entire current vault and plugin directory. The explicit Recall recovery action moves the original metadata to `recall/recovery/cards-<id>.recovery.json` and starts a new store; it **does not recover old scheduling history**. Refresh can rebuild questions from notes, but cannot reconstruct lost review events. Prefer restoring a known compatible complete snapshot when progress must be retained.

## Returning to stable

Replacing only `main.js` with 2.3.1 is **not a rollback**: stable refuses schema v4. The automatic pre-v4 backup is one metadata file, not a full copy of notes/settings and not a record of reviews performed after migration.

Close Obsidian and pause Sync first. Preserve the entire post-upgrade vault separately, including new notes, edits, v4 metadata and backups. Restore the complete pre-upgrade snapshot into a separate recovery copy together with all three matching stable runtime files; verify it there before deciding which copy should become active. This restores progress to the snapshot time, so later reviews/edits require deliberate reconciliation and must not be silently discarded. Do not edit the schema number, merge JSON schedules by hand, or run old and new versions concurrently against one store.

If no complete compatible snapshot exists, keep both current metadata and any pre-v4 backup unchanged. Disable Recall while investigating recovery; a simple binary downgrade cannot guarantee preservation. Native R01 verification exercises both the old runtime's refusal of v4 and restoration of the complete stable snapshot.

## Candidate package and publication boundary

The local package contains only `main.js`, `manifest.json`, `styles.css`, `SOURCE_COMMIT` and `SHA256SUMS`. `SOURCE_COMMIT` identifies the exact source checkout; checksums cover the three runtime files and that source marker. Keep the verification report alongside the handoff, not inside the plugin directory. No credentials, `data.json`, notes, test profiles or dependency tree belong in the package.

Rebuild using Node 24 and the committed lockfile. Run the complete suite, typecheck, build, lint and proposal mutation audit. Extract the candidate ZIP into a new directory, verify `SHA256SUMS`, and use those extracted files for both native runs:

```sh
node scripts/recall-topics-native.mjs /tmp/veynrel-recall-native-fresh-unique /path/to/extracted-candidate
node scripts/recall-topics-native.mjs /tmp/veynrel-recall-native-upgrade-unique /path/to/extracted-candidate /path/to/downloaded-stable-2.3.1
```

The stable directory must include its published `SOURCE_COMMIT`; verify its published checksums before running. The harness requires Linux Obsidian/Electron at the repository's documented paths, X11 and free CDP port 9297. Run the two instances sequentially. Every destination must be new; all notes and settings are synthetic, generation uses loopback HTTP, and each run closes its own process. UI assertions cover desktop viewports, not physical mobile devices.

Before any separately authorized publication, recheck main, the PR head, CI, version/tag collisions and latest stable. Rebuild the actual approved merge source and compare all runtime bytes with the tested candidate. If bytes differ, rerun the affected checks. Record the actual release source rather than presenting a pre-merge candidate SHA as the merge SHA. Publication, provenance attestation and personal-vault installation are separate, unperformed gates.
