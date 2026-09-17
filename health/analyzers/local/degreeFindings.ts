import { localCandidate } from "./candidates";
import type { FindingCandidate } from "../../domain/finding";

export function degreeFinding(analyzerId: string, type: string, path: string, incoming: number, outgoing: number, title: string, explanation: string, incomingCountComplete = true): FindingCandidate {
  return localCandidate({ analyzerId, dimension: "structure", type, impact: "review", title, explanation, notePaths: [path],
    evidence: [{ kind: "incoming-count", value: incoming }, { kind: "incoming-count-complete", value: incomingCountComplete }, { kind: "outgoing-count", value: outgoing }],
    actions: [{ kind: "open-note", path }, { kind: "find-connections", path }],
  }, { paths: [path] });
}
