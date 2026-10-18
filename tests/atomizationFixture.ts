import { atomizationCandidates, emptyAtomizationChoice } from "../consolidation/atomizationPlan";
import type { AtomizationChoice, AtomizationObservation } from "../consolidation/atomizationPlan";
import type { PlanPair } from "../consolidation/changePlan";
import type { RelationshipAnalysis } from "../consolidation/relationshipSession";
import { groupNote } from "./groupFixture";

export function atomizationFixture(text = "A blue envelope marks a completed trial.") {
  const pair: PlanPair = [groupNote("Sources/Original.md", text), groupNote("Sources/Comparison.md", "An amber envelope marks a pending trial.")];
  const analysis: RelationshipAnalysis = { pair: [{ ...pair[0] }, { ...pair[1] }], provider: "offline", model: "control",
    result: { relation: "related_distinct", claims: [{ id: "c", kind: "comparison", text: "Different observations.", quoteA: text, quoteB: pair[1].content }], explanation: { text: "Review standalone knowledge.", evidence: ["c"] },
      recommendation: { action: "manual_review", reason: "User context review required.", evidence: ["c"] }, alternatives: [], limitations: ["Synthetic control; not model quality evidence."] } };
  const candidates = atomizationCandidates(pair[0]).filter(c => !c.failure);
  const candidate = candidates[candidates.length - 1];
  const choice: AtomizationChoice = { ...emptyAtomizationChoice(), side: 0, kind: candidate?.kind ?? null, range: candidate?.range ?? null,
    title: "Trial observation", path: "Atoms/Trial observation.md", unitConfirmed: true, contextConfirmed: true, manualConfirmed: true,
    titleConfirmed: true, sourceConfirmed: true, dependenciesReviewed: true };
  const observation: AtomizationObservation = { path: choice.path, absent: true, parentExists: true, configDir: "custom-config", sourceLink: "Sources/Original",
    inventory: [], linkConflicts: [], metadataComplete: true, dependencies: { resolved: {}, unresolved: {} } };
  return { pair, analysis, choice, observation, read: { pair, linktexts: ["Sources/Original", "Sources/Comparison"] as const } };
}
