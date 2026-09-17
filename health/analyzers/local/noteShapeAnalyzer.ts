import type { FindingCandidate } from "../../domain/finding";
import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import { checkpoint } from "./cancellation";
import { analyzerResult, localCandidate } from "./candidates";
import { diagnostic } from "./diagnostics";
import { meaningfulCharacterCount, NEAR_EMPTY_MEANINGFUL_CHARACTERS, noteBody } from "./content";
import { contentCoverageComplete } from "./localNoteGraph";

const ID = "note-shape";
const VERSION = "1";
export const noteShapeAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ snapshot }, signal) {
    const candidates: FindingCandidate[] = [];
    for (const [index, note] of snapshot.notes.entries()) {
      await checkpoint(signal, index);
      if (!note.contentAvailable || note.content === undefined) continue;
      const count = meaningfulCharacterCount(noteBody(note.content));
      if (count >= NEAR_EMPTY_MEANINGFUL_CHARACTERS) continue;
      candidates.push(localCandidate({ analyzerId: ID, dimension: "structure", type: count === 0 ? "empty-note" : "near-empty-note", impact: count === 0 ? "review" : "info",
        title: count === 0 ? "Empty note body" : "Very short note body", explanation: "The body has fewer than 32 Unicode letters or numbers after leading frontmatter is excluded.",
        notePaths: [note.path], evidence: [{ kind: "meaningful-character-count", value: count }], actions: [{ kind: "open-note", path: note.path }],
      }, { paths: [note.path] }));
    }
    const complete = contentCoverageComplete(snapshot);
    return analyzerResult(ID, VERSION, candidates, complete, complete ? [] : [diagnostic("partial-content")]);
  },
};
