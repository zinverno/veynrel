# Recall topics and vocabulary implementation

Base: `cd9e8fc4048b4a17d0dc68993bd8b340d9da4720` (remote main checked 2026-11-08), package 2.3.1. Baseline: 558 Recall tests in 20 files and both TypeScript projects pass. No repository AGENTS.md or existing Graphify graph was found; the affected paths were traced in source and existing AST contract tests.

## Plan and boundaries

1. Extend the single Recall candidate/store to study tags and opt-in vocabulary. Keep FSRS unchanged. Version the codec and preserve original storage before the first migration write.
2. Use one scope predicate for queue, summary and next due. Reconcile only complete, fresh note snapshots; preserve schedules and retired entries. Preserve identities on observed rename events, without guessing offline moves or merging copies.
3. Extract source preparation, strict output validation and insertion. All command/context/batch paths use the same generator. Use a captured editor and isolated insertion for open notes; retain guarded backup writes for closed batch files.
4. Extend the existing Recall surface with topics/vocabulary and compact generation controls. Persist only an explicit Recall prompt override; never carry a topic from another note.
5. Run contract, integration, full repository and disposable native checks; document evidence and limits.

Study syntax: leading `#flashcards/...` tags on a `question::answer` line in an ATX Flashcards section. Multiple tags share one schedule. Topic matching is case-insensitive with `/` boundaries; spelling is preserved. Untagged legacy questions remain supported.

Vocabulary syntax: explicit `veynrel-recall: vocabulary`, note-level language/translation language/direction and study tags, with `expression::translation` under an ATX Vocabulary section. Default direction is forward. Reverse cards have independent schedules. No AI is needed to parse or review them.

Identity: preserve legacy study IDs; tags and line order are not identity. Vocabulary identity includes both sides, languages and direction. Observed rename moves the stored source path while retaining its identity anchor. Ambiguous collisions fail closed. There is no offline move guessing, duplicate audit, new scheduler, space merger, release or personal-vault installation.

API references: [Obsidian Editor](https://docs.obsidian.md/Plugins/Editor/Editor) and [CodeMirror history source](https://github.com/codemirror/commands/blob/main/src/history.ts). The host history annotation isolates the insertion on both sides; the runtime module stays external to the bundle. [Spaced Repetition deck documentation](https://stephenmwangi.com/obsidian-spaced-repetition/flashcards/decks/) informed hierarchical/question-tag behavior only; no state, API or runtime dependency from that plugin is used.
