# Recall topics and vocabulary verification — 2026-11-08

The [PR #136 path-reuse/no-op follow-up](path-reuse-followup.md) records the later fixes, before/after reproductions and updated native artifact hashes. The original feature evidence below remains tied to its recorded build.

Branch: `feat/recall-topics-vocabulary`. Base: `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720`, verified against remote main before implementation. The original checkout and its unrelated files were left untouched; implementation used a separate worktree. Package/manifest remain 2.3.1. This is development evidence, not a release.

## Implementation and data preservation

See the [implementation decisions](implementation.md) and [user guide](../wiki/Recall.md). Changes cover the existing Recall domain, parsers/source, schema/store, service/product, Health view and authoring bridge; command/context/batch share one generator. FSRS, dependencies, plugin ID and other plugin spaces are unchanged.

Study questions accept leading `#flashcards/topic/subtopic` tags. Tags and line order do not change identity. Vocabulary uses note properties plus an ATX `## Vocabulary` section, with one `expression::translation` per line and no per-entry service fields. Both directions share the entry but have independent schedules.

Valid legacy schemas retain IDs and schedules. Before the first v4 mutation, the original JSON is backed up and verified. Retired cards remain stored; complete current note captures alone can retire missing entries. Observed rename events retain the source identity anchor. Source, editor, lifecycle, model and prompt guards run at the final write boundary, including inside the closed-file `Vault.process` callback. No atomicity between Markdown and metadata is claimed.

## Automated checks

Environment: Linux, Node 24.14.1, npm 11.11.0; lockfile installation with `npm ci --ignore-scripts --no-audit --no-fund`. No dependency or lockfile change.

| Check | Actual result |
| --- | --- |
| Baseline Recall | 558 tests / 20 files passed |
| Baseline TypeScript | Both projects passed |
| Full suite, `npm test -- --maxWorkers=2` | 5,292 tests / 195 files passed |
| Final UI/topic check after moving the unchanged template into a constant | 80 tests / 2 files passed |
| `npm run lint` | Typecheck, production build and ESLint passed; two existing fetch warnings in api.ts and studio/community/transport.ts |
| `npm run audit:proposals` | 5/5 mutations rejected; restored tests passed |
| `npm run build` | Passed; exact runtime hashes in native evidence |
| `git diff --check` | Passed |

The proposal audit first encountered sandbox child-process restrictions, then passed on the approved host in a disposable directory. Tests cover strict generation/normal completion, long inputs and selections, BOM/CRLF/trailing whitespace, parser compatibility, hierarchical scopes before queue limits, malformed/partial sources, Unicode/RTL/homonyms, independent direction histories, copies/rename ambiguity, retirement/reactivation, legacy migration and backup failures, stale scan/review and authoring races, and all existing generator entrances. Existing AST/VM contracts were updated to execute the real extracted generator rather than removed.

A separate read-only review found stale authoring, split-editor selection, retag freshness, incomplete vocabulary, scoped status and batch lifetime/reporting issues. Each was fixed with a regression check; the final recheck reported no unresolved blocking finding in the reviewed scope.

## Native desktop evidence

[Machine-readable report and exact hashes](evidence/native.json): **31 checks passed** on Obsidian **1.13.7**, Electron **43.6.0**, Linux desktop. Final run recorded **zero runtime exceptions**. Only synthetic notes and an isolated profile/vault were used. The six model requests went to a credential-free loopback HTTP fixture. Production transport, parser, store, scheduler and renderer ran unchanged.

Verified:

- RU/EN generation and the existing command; a single real Ctrl+Z removes generated content while preserving earlier manual typing, Ctrl+Shift+Z restores it, and later typing has a separate Undo step.
- Parent topic excludes `db2`; native rating key 3 commits one review. Vocabulary hides the answer and shows the direction; local imports/reviews add no model requests.
- Rename, line reorder, retag, disabling/re-enabling reverse, plugin reload and full Obsidian process restart preserve vocabulary IDs and schedules; saved prompt override persists.
- Length/malformed output causes no insertion or repair request; concurrent source editing blocks apply; long material is rejected before transport and an explicit selection bounds the request.
- EN/RU × built-in light/dark × 320/390/1280 px, without horizontal overflow. These are desktop viewport sizes.

Screenshots: [generated RU source](evidence/ru-generated.png), [vocabulary question](evidence/vocabulary-question.png), [RU dark 320 px](evidence/recall-ru-dark-320.png), [EN light desktop](evidence/recall-en-light-1280.png).

Reproduce after building:

```sh
node scripts/recall-topics-native.mjs /tmp/veynrel-recall-native-unique-run
```

The script requires the installed Linux Obsidian/Electron paths, a display and a free CDP port 9297. It refuses an existing destination, checks the connected vault path, and closes its own process. Earlier harness runs corrected CDP key modifiers, object serialization, schedule comparison ordering, pane sizing, and waiting for debounce ingestion before Refresh. One intermediate run invoked Refresh while the corresponding UI action was disabled; it was not counted as a pass. Final evidence comes from the completed rerun, not from the earlier partial runs.

## Bounded cost

[Synthetic measurement](evidence/performance.json): 10,000 cards across 100 notes, 5,000 matching the selected parent topic. A cold scoped summary took 27.1 ms. For 100 warm combinations of summary, next due, facets and a queue limited to 100, median was 6.6 ms, p95 8.7 ms, maximum 11.5 ms. No additional source reads occurred. Serialized metadata was 6,532,647 bytes.

The service caches active cards/facets by store revision; scoped counts iterate that bounded cache. These timings are local measurements, not a mobile or full-render performance guarantee.

## Limits and manual handoff

**Live generation quality was not evaluated.** The [three-source evaluation kit and rubric](quality-rubric.md) are ready; no live model, paid key or automatic repair was used. Format tests and synthetic responses cannot establish educational quality.

Physical mobile, legacy CM5, screen readers, popouts, custom themes, arbitrary offline moves and all Sync conflicts were not tested. Native migration from each historic schema was not repeated; migration/backup guarantees have automated fixture coverage. Native BOM/CRLF encoding behavior was not certified; serializer preservation has contract coverage. Context menu and batch have automated route/race coverage, but their full native UI flows were not rerun in this harness.

For a short manual check, use a disposable vault:

1. Copy the built `main.js`, `manifest.json`, `styles.css` into the plugin directory and enable it. Open a saved RU/EN note, choose a topic and generate questions. Check source text, Undo and Redo.
2. Copy the vocabulary template from the guide, choose `both`, refresh and review a parent topic. Confirm unrelated topics are absent and both directions hide their answers.
3. Rate an entry, rename the note, reorder/retag it, disable/re-enable reverse, then restart Obsidian. Confirm its history is retained.
4. Try an unsaved/divergent buffer or a note over the input limit; generation must stop with an actionable error. If editor save or metadata persistence fails after insertion, retain the inserted text, save and refresh instead of regenerating.

No merge, release, version bump or personal-vault installation/migration was performed.
