import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import type { FindingCandidate } from "../../domain/finding";
import { checkpoint } from "./cancellation";
import { analyzerResult } from "./candidates";
import { degreeFinding } from "./degreeFindings";
import { diagnostic } from "./diagnostics";

const ID = "no-incoming-links";
const VERSION = "1";
export const noIncomingLinksAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ graph }, signal) {
    await checkpoint(signal, 0);
    const candidates: FindingCandidate[] = [];
    if (!graph.complete) return analyzerResult(ID, VERSION, candidates, false, [diagnostic("partial-links")]);
    for (const [index, path] of graph.paths.entries()) {
      await checkpoint(signal, index + 1);
      const outgoing = graph.outgoing[path].length;
      if (!graph.incoming[path].length && outgoing > 0) candidates.push(degreeFinding(ID, "no-incoming-links", path, 0, outgoing,
        "Note without incoming links", "This note links to other in-scope notes, but none link back to it."));
    }
    return analyzerResult(ID, VERSION, candidates, true);
  },
};
