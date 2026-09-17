import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import type { FindingCandidate } from "../../domain/finding";
import { checkpoint } from "./cancellation";
import { analyzerResult } from "./candidates";
import { degreeFinding } from "./degreeFindings";
import { diagnostic } from "./diagnostics";

const ID = "orphans";
const VERSION = "1";
export const orphanAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ graph }, signal) {
    await checkpoint(signal, 0);
    const candidates: FindingCandidate[] = [];
    if (!graph.complete) return analyzerResult(ID, VERSION, candidates, false, [diagnostic("partial-links")]);
    for (const [index, path] of graph.paths.entries()) {
      await checkpoint(signal, index + 1);
      if (!graph.incoming[path].length && !graph.outgoing[path].length) candidates.push(degreeFinding(ID, "orphan-note", path, 0, 0,
        "Note without connections", "No other in-scope Markdown note links to this note, and it links to no other in-scope note."));
    }
    return analyzerResult(ID, VERSION, candidates, true);
  },
};
