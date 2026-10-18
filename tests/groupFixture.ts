import type { PlanPair } from "../consolidation/changePlan";
import { mergeNote } from "./mergeFixture";
import { contextGroups } from "../consolidation/groupStructure";
import { emptyGroupChoice } from "../consolidation/groupPlan";
import type { GroupChoice } from "../consolidation/groupPlan";
import type { RelationshipAnalysis } from "../consolidation/relationshipSession";
import type { PlannerRead } from "../consolidation/changePlannerSession";

/** Test-only offsets for hand-authored ATX/plain fixtures; native acceptance supplies real MetadataCache. */
export function groupNote(path: string, text: string) {
  const n = mergeNote(path, text);
  n.cache!.headings = [];
  for (const s of n.cache!.sections!) {
    const literal = text.slice(s.position.start.offset, s.position.end.offset), h = /^(#{1,6}) (.+)$/u.exec(literal);
    if (h) { s.type = "heading"; n.cache!.headings.push({ heading: h[2], level: h[1].length, position: s.position }); }
    else if (literal.startsWith("```")) s.type = "code";
    else if (/^[-\d>]/u.test(literal)) s.type = "list";
  }
  return n;
}
export function groupFixture(canonical: 0 | 1 = 0, newline = "\n") {
  const a = '# Existing guide\n\nShared scoped fact.\n\n## Existing scope\n\nAn existing observation.\n';
  const b = '# Source guide\n\nShared scoped fact.\n\n## Practice\n\n### Trial\n\nНаблюдение 🪶 é.\n\nВторой абзац.\n\n## Other\n\nAn unselected observation.\n';
  const pair = (canonical === 0 ? [a,b] : [b,a]).map((s,i) => groupNote(`${i}/Note.md`,s.replace(/\n/gu,newline))) as unknown as PlanPair;
  const analysis: RelationshipAnalysis = { pair: [{ ...pair[0] }, { ...pair[1] }], provider: "offline", model: "control",
    result: { relation: "partial_overlap", explanation: { text: "Shared scope with distinct observations.", evidence: ["s"] },
      claims: [{ id: "s", kind: "shared", text: "Shared fact.", quoteA: "Shared scoped fact.", quoteB: "Shared scoped fact." }],
      recommendation: { action: "consider_merge", reason: "Review context.", evidence: ["s"] }, alternatives: [], limitations: ["Semantic independence is unverified."] } };
  const choice: GroupChoice = { ...emptyGroupChoice(), canonical, group: contextGroups(pair[1-canonical]).groups[2].range,
    representation: "original_heading_branch", insertion: pair[canonical].content.length, groupConfirmed: true, contextConfirmed: true,
    insertionConfirmed: true, dependencies: "reviewed" };
  const read: PlannerRead = { pair, linktexts: ["0/Note", "1/Note"] };
  return { pair, analysis, choice, read };
}
