import { stableHash } from "../../../utils/stableHash";
import { compareStrings } from "../../domain/validation";
import type { FindingCandidate } from "../../domain/finding";
import type { HealthAnalyzer } from "../types";
import type { LocalAnalysisContext } from "./types";
import { checkpoint } from "./cancellation";
import { analyzerResult, localCandidate, representedPaths } from "./candidates";
import { diagnostic } from "./diagnostics";

const ID = "graph-components";
const VERSION = "1";
export const graphComponentsAnalyzer: HealthAnalyzer<LocalAnalysisContext> = {
  id: ID, version: VERSION,
  async analyze({ graph }, signal) {
    await checkpoint(signal, 0);
    const candidates: FindingCandidate[] = [];
    if (!graph.complete) return analyzerResult(ID, VERSION, candidates, false, [diagnostic("partial-links")]);
    const visited = new Set<string>();
    const components: string[][] = [];
    let processed = 0;
    for (const root of graph.paths) {
      await checkpoint(signal, processed++);
      if (visited.has(root)) continue;
      const members: string[] = [];
      const pending = [root];
      visited.add(root);
      while (pending.length) {
        const path = pending.pop()!;
        members.push(path);
        for (const neighbor of [...graph.outgoing[path], ...graph.incoming[path]]) {
          await checkpoint(signal, processed++);
          if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
        }
      }
      if (members.length > 1) components.push(members.sort(compareStrings));
    }
    components.sort((a, b) => b.length - a.length || compareStrings(a[0], b[0]));
    const primary = components[0];
    for (const members of components.slice(1)) {
      await checkpoint(signal, processed++);
      const paths = representedPaths(members);
      candidates.push(localCandidate({ analyzerId: ID, dimension: "connections", type: "isolated-graph-component", impact: "review",
        title: "Disconnected multi-note knowledge island", explanation: "These notes form an island outside the deterministically selected primary component. This is a review suggestion, not an error.",
        notePaths: paths, evidence: [{ kind: "component-size", value: members.length }, { kind: "represented-path-count", value: paths.length }, { kind: "primary-component-size", value: primary.length }],
        actions: [{ kind: "open-note", path: paths[0] }, { kind: "find-connections", path: paths[0] }],
      }, { paths: [], key: `v1:${members.length}:${stableHash(JSON.stringify(members))}` }));
    }
    return analyzerResult(ID, VERSION, candidates, true);
  },
};
