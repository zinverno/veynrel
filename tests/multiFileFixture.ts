import { TFile } from "obsidian";
import type { PlanNote, PlanPair } from "../consolidation/changePlan";
import { paragraphRanges } from "../consolidation/changePlan";
import type { RelationshipAnalysis } from "../consolidation/relationshipSession";
import { validateRelationshipResponse } from "../consolidation/relationshipContract";
import type { MultiFileChoice } from "../consolidation/multiFilePlan";
import type { PlannerRead } from "../consolidation/changePlannerSession";
import fixture from "./fixtures/multi-file-planner.json";
import relationship from "./fixtures/change-planner.json";

export function multiFileFixture() {
  const note = (path: string, content: string): PlanNote => {
    let offset = 0;
    const sections = content.trimEnd().split("\n\n").map(text => {
      const start = content.indexOf(text, offset); offset = start + text.length;
      return { type: "paragraph", position: { start: { offset: start, line: 0, col: 0 }, end: { offset, line: 0, col: 0 } } };
    });
    const bytes = new TextEncoder().encode(content).byteLength;
    return { path, content, created: 1, modified: 2, bytes,
      file: Object.assign(new TFile(), { path, stat: { ctime: 1, mtime: 2, size: bytes } }), cache: { sections }, references: [] };
  };
  const pair: PlanPair = [note(fixture.paths[0], fixture.a), note(fixture.paths[1], fixture.b)];
  const analysis: RelationshipAnalysis = { pair: pair.map(n => ({ ...n })) as unknown as RelationshipAnalysis["pair"],
    result: validateRelationshipResponse(JSON.stringify(relationship.response), fixture.a, fixture.b), provider: "Fake", model: "synthetic" };
  const choice: MultiFileChoice = { operation: "add_reciprocal_links", selections: [paragraphRanges(pair[0])[1], paragraphRanges(pair[1])[2]], confirmed: [true, true] };
  const read: PlannerRead = { pair, linktexts: [pair[0].path.slice(0, -3), pair[1].path.slice(0, -3)] };
  return { pair, analysis, choice, read };
}
