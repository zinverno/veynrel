# Recall

Recall schedules study questions and vocabulary locally using the same FSRS scheduler. Reviewing existing material needs no model, embeddings or API key. The topics/vocabulary changes described here are on the development branch based on 2.3.1; this is not a release announcement.

## Study topics

Put questions in an ATX heading named exactly `Flashcards`. Legacy `Question::Answer` remains supported. Put one or more study tags before a question:

```markdown
## Flashcards
#flashcards/databases/indexes Why can an index slow down writes?::Writes must update the index too.
#flashcards/databases/transactions #flashcards/reliability What does atomicity mean?::A transaction completes entirely or its changes are not saved.
An older question::An older answer
```

Tags are metadata, not part of the displayed question. Multiple tags share one schedule. Select a parent topic to include its descendants: `flashcards/db` includes `flashcards/db/indexes`, but not `flashcards/db2`. Comparison ignores case; saved spelling is retained. Ordinary note tags are not automatically attached to study questions. Legacy cards appear under **No study tag**.

Open **Veynrel: Open Veynrel**, then **Review** (Recall). Choose the mode and topic, then start reviewing. Queue, due/active/new counts and next review date use the same filters. Changing filters ends the current session. Reveal the answer and rate it with Again / Hard / Good / Easy or keys 1–4. Answers are displayed as text; HTML and remote embeds are not executed.

## Generate questions

Open a saved note, then choose **Create from current note** in Recall. The compact settings block offers count, study tag with existing-tag suggestions, optional goal, and additional instructions. The expandable base instruction can be saved or reset. A saved override survives restart and is never silently replaced by an updated default.

The note's study tag is suggested explicitly; another note's last tag is not carried over. The output follows the source language. A selected passage in the active editor becomes the source, and its length is shown before generation. Otherwise the note's study material is used, excluding properties and existing Flashcards sections. Material above 32,000 UTF-16 characters is rejected before a request; select a shorter passage and retry. Requested count is a maximum, not a quota.

Generation is explicit and makes one model request. Valid questions are inserted directly into the source; there is no mandatory draft preview or per-card approval. Malformed, empty, refused or incomplete output is not appended and does not trigger paid repair/retry. Format checks do not establish factual or educational quality.

Insertion extends the first suitable ATX Flashcards section, immediately before the next same/higher heading, or creates one if absent. Existing sections, properties, trailing spaces and line endings are retained by the serializer. Unclosed code/comments/frontmatter block insertion. In an open editor, insertion uses the host's CodeMirror history isolation: one generation is one Undo operation, separate from adjacent typing. Redo restores the same block. Obsidian's own editor saving behavior still governs file encoding and line endings.

Save unsaved edits before generation. Divergent buffers, source replacement/deletion/edits, model or prompt changes, and plugin unload prevent an unissued insertion. The captured editor receives the change even if another note is opened. Batch uses the same generator and guarded backup writes for closed files; those writes do not promise editor Ctrl+Z. Markdown and Recall metadata are separate commits. If metadata updating fails after insertion, keep the questions and refresh Recall; do not generate again just to import them.

## Vocabulary

Use one note per learning language and topic. Set properties once and write pairs in an ATX `Vocabulary` section. The format is `expression::translation`; no per-entry tags, UUIDs, generated questions or duplicate Flashcards section are needed.

```markdown
---
veynrel-recall: vocabulary
recall-language: en
recall-translation-language: ru
recall-direction: forward
tags:
  - flashcards/languages/en/travel
---

## Vocabulary
luggage::багаж
boarding pass::посадочный талон
Could you repeat that?::Не могли бы вы повторить?
```

Copy the template into a note and use **Refresh flashcards**. Recall never creates properties automatically or changes unrelated properties such as `type` or `project`. The Vocabulary view includes a template and language/note filters.

Language values accept BCP-47-shaped identifiers beyond English, such as `de`, `ar` or `pt-BR`. `recall-direction` accepts `forward` (default), `reverse` or `both`. Each direction has its own schedule. Disabling one retires its cards while retaining progress; enabling it again restores that history. The card shows the language direction and hides the other side until reveal. Evaluate acceptable translations yourself; no exact-answer matcher or AI grader is used.

Unicode, RTL text, phrases, apostrophes, punctuation and multiple meanings remain ordinary text. Commas do not split answers, and homonyms with different translations remain distinct. Only explicit vocabulary notes and their Vocabulary sections are read as vocabulary; ordinary `::` prose elsewhere is ignored. Missing/invalid entries produce path/line diagnostics. An incomplete capture can add valid cards but cannot retire unseen ones.

## Progress and recovery

Line order and study tags do not define identity. Observed file rename/move events preserve IDs and schedules. Editing an expression, translation or language creates new knowledge with a new schedule; the old card remains retired. Identical text in different notes is not merged. Ambiguous rename collisions fail closed. Arbitrary offline moves, file replacement and Sync conflicts are not automatically inferred.

Once Recall has been initialized, saved note changes are refreshed locally after a short debounce. Starting and rating a card verifies its source, including open buffers; stale or unsaved content blocks review. Undo/removal retires absent entries only after a complete current note capture; Redo restores unchanged entries and their schedules. No full-vault scan or model request runs on filter changes.

Schema v4 reads valid v1/v2/v3, including transitional v2 coverage. Existing IDs and schedules remain intact. Loading migrates only in memory; the first mutation saves and verifies exact original JSON contents in a unique `recall/cards.pre-v4-*.json` before rewriting. Corrupt/future schemas remain write-blocked. The 10,000-card and storage-size limits include retired cards and both vocabulary directions. FSRS formulas are unchanged.

[Verification and limitations](../recall-topics/verification.md) · [Getting started](Getting-started.md) · [Privacy](Providers-and-privacy.md)
