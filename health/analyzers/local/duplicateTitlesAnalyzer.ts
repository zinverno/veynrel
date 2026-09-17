import type { FindingCandidate } from "../../domain/finding";
import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import { checkpoint } from "./cancellation";
import { analyzerResult, localCandidate, representedPaths } from "./candidates";
import { diagnostic } from "./diagnostics";

const ID = "duplicate-titles";
const VERSION = "1";
export const duplicateTitlesAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ snapshot }, signal) {
    const groups = new Map<string, string[]>();
    let processed = 0;
    for (const note of snapshot.notes) {
      await checkpoint(signal, processed++);
      const group = groups.get(note.basename);
      if (group) group.push(note.path);
      else groups.set(note.basename, [note.path]);
    }
    const candidates: FindingCandidate[] = [];
    for (const [basename, members] of groups) {
      await checkpoint(signal, processed++);
      if (members.length < 2) continue;
      const paths = representedPaths(members);
      candidates.push(localCandidate({ analyzerId: ID, dimension: "connections", type: "duplicate-title-group", impact: "review",
        title: "Notes with the same title", explanation: "Multiple notes share this exact basename. Case variants remain separate; the path list may contain representatives.",
        notePaths: paths, evidence: [{ kind: "basename", value: basename.slice(0, 500) }, { kind: "basename-length", value: basename.length },
          { kind: "basename-truncated", value: basename.length > 500 }, { kind: "member-count", value: members.length }, { kind: "represented-path-count", value: paths.length }],
        actions: [{ kind: "compare-notes", path: paths[0], relatedPath: paths[1] }],
      }, { paths: [], key: basename }));
    }
    const complete = snapshot.coverage.noteListComplete;
    return analyzerResult(ID, VERSION, candidates, complete, complete ? [] : [diagnostic("partial-note-list")]);
  },
};
