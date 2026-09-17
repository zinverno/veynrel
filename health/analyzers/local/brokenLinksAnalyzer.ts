import type { FindingCandidate } from "../../domain/finding";
import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import { checkpoint } from "./cancellation";
import { analyzerResult, localCandidate } from "./candidates";
import { diagnostic } from "./diagnostics";

const ID = "broken-links";
const VERSION = "1";
export const brokenLinksAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ snapshot, graph }, signal) {
    const candidates: FindingCandidate[] = [];
    let processed = 0;
    for (const note of snapshot.notes) {
      await checkpoint(signal, processed++);
      if (!note.linksAvailable) continue;
      const counts = new Map<string, number>();
      for (const link of note.unresolvedLinks) {
        await checkpoint(signal, processed++);
        counts.set(link.target, (counts.get(link.target) ?? 0) + link.count);
      }
      for (const [target, count] of counts) {
        candidates.push(localCandidate({ analyzerId: ID, dimension: "structure", type: "broken-link", impact: "attention",
          title: "Unresolved internal link", explanation: "Obsidian could not resolve this internal link to a vault file.",
          notePaths: [note.path], evidence: [{ kind: "source-path", path: note.path }, { kind: "target", value: target.slice(0, 500) },
            { kind: "target-length", value: target.length }, { kind: "target-truncated", value: target.length > 500 }, { kind: "occurrence-count", value: count }],
          actions: [{ kind: "open-note", path: note.path }],
        }, { paths: [note.path], key: target }));
      }
    }
    return analyzerResult(ID, VERSION, candidates, graph.complete, graph.complete ? [] : [diagnostic("partial-links")]);
  },
};
