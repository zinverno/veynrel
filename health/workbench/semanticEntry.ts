import type { SemanticMapScope } from "../semanticGlobalMapPort";

export type SemanticIntent = "map" | "families" | "pair" | "neighborhood" | "opportunities" | "focus" | "similar";
/** Navigation only. No consent, mutation ticket, editor text or persisted result. */
export interface SemanticEntry {
  readonly intent: SemanticIntent;
  readonly scope: SemanticMapScope;
  readonly sourcePath?: string;
  readonly pairPaths?: readonly [string, string];
  readonly familyId?: string;
  readonly returnTo: "semantic";
}

export function semanticEntryScope(intent: SemanticIntent): "requested" | "global" {
  return intent === "map" || intent === "families" || intent === "pair" ? "requested" : "global";
}

export function distinctSemanticPair(paths: readonly string[]): paths is readonly [string, string] {
  return paths.length === 2 && !!paths[0] && !!paths[1] && paths[0] !== paths[1];
}
