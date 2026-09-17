import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import type { FindingCandidate } from "../../domain/finding";
import { checkpoint } from "./cancellation";
import { analyzerResult } from "./candidates";
import { degreeFinding } from "./degreeFindings";
import { diagnostic } from "./diagnostics";

const ID = "no-outgoing-links";
const VERSION = "1";
export const noOutgoingLinksAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ snapshot, graph }, signal) {
    const candidates: FindingCandidate[] = [];
    for (const [index, note] of snapshot.notes.entries()) {
      await checkpoint(signal, index);
      const incoming = graph.incoming[note.path].length;
      if (snapshot.coverage.noteListComplete && note.linksAvailable && !graph.outgoing[note.path].length && incoming > 0) candidates.push(degreeFinding(ID, "no-outgoing-links", note.path, incoming, 0,
        "Note without outgoing links", "Other in-scope notes link here, but this note links to no other in-scope Markdown note.", graph.complete));
    }
    return analyzerResult(ID, VERSION, candidates, graph.complete, graph.complete ? [] : [diagnostic("partial-links")]);
  },
};
