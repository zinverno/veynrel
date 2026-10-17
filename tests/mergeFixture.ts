import { TFile } from "obsidian";
import type { PlanNote, PlanPair } from "../consolidation/changePlan";
import { paragraphRanges } from "../consolidation/changePlan";
import type { RelationshipAnalysis } from "../consolidation/relationshipSession";
import { validateRelationshipResponse } from "../consolidation/relationshipContract";
import type { MergeChoice } from "../consolidation/mergePlan";
import type { PlannerRead } from "../consolidation/changePlannerSession";
import fixture from "./fixtures/merge-planner.json";

/** Synthetic native offsets, not a production Markdown parser. Structured tests set their own cache entries. */
export function mergeNote(path: string, content: string): PlanNote {
  let cursor = 0;
  const sections = content.trimEnd().split(/\r?\n\r?\n/u).map(text => {
    const start = content.indexOf(text, cursor); cursor = start + text.length;
    return { type: "paragraph", position: { start: { offset: start, line: 0, col: 0 }, end: { offset: cursor, line: 0, col: 0 } } };
  });
  const bytes = new TextEncoder().encode(content).byteLength;
  return { path, content, created: 1, modified: 2, bytes,
    file: Object.assign(new TFile(), { path, stat: { ctime: 1, mtime: 2, size: bytes } }), cache: { sections }, references: [] };
}
export function mergeFixture() {
  const pair: PlanPair = [mergeNote(fixture.paths[0], fixture.a), mergeNote(fixture.paths[1], fixture.b)];
  const analysis: RelationshipAnalysis = { pair: [{ ...pair[0] }, { ...pair[1] }],
    result: validateRelationshipResponse(JSON.stringify(fixture.response), fixture.a, fixture.b), provider: "Fake", model: "synthetic" };
  const choice: MergeChoice = { operation: "merge_knowledge", canonical: 0,
    transfers: [{ range: paragraphRanges(pair[1])[1], contextReviewed: true }], insertion: paragraphRanges(pair[0])[0], insertionConfirmed: true };
  const read: PlannerRead = { pair, linktexts: [pair[0].path.slice(0, -3), pair[1].path.slice(0, -3)] };
  return { pair, analysis, choice, read };
}
