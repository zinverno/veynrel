import type { Finding, FindingConfidence, FindingImpact, HealthDimension } from "../domain/finding";
import type { Recommendation } from "../domain/recommendation";
import { DEFAULT_VAULT_PROFILE } from "../domain/profile";
import type { VaultProfile } from "../domain/profile";
import { compareStrings } from "../domain/validation";

const IMPACT: Record<FindingImpact, number> = { attention: 0, review: 1, info: 2 };
const CONFIDENCE: Record<FindingConfidence, number> = { deterministic: 0, high: 1, medium: 2 };
const RELEVANCE: Record<VaultProfile, readonly HealthDimension[]> = {
  learning: ["recall", "knowledge", "connections", "structure"],
  research: ["connections", "knowledge", "structure", "recall"],
  work: ["structure", "connections", "knowledge", "recall"],
  personal: ["connections", "structure", "knowledge", "recall"],
  mixed: [],
};

export function findingPair(finding: Finding): readonly [string, string] | undefined {
  if (finding.source === "semantic" && finding.type === "semantic-duplicate" && finding.notePaths.length === 2 && finding.notePaths[0] !== finding.notePaths[1])
    return [finding.notePaths[0], finding.notePaths[1]];
  const action = finding.actions.find(a => a.kind === "compare-notes" && a.path && a.relatedPath && a.path !== a.relatedPath &&
    finding.notePaths.includes(a.path) && finding.notePaths.includes(a.relatedPath));
  return action?.path && action.relatedPath ? [action.path, action.relatedPath] : undefined;
}

/** Bounded, actionable observations. Stable ties do not resurface advice merely because a scan ran. */
export function nextActionFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter(finding => finding.state === "open" && finding.impact !== "info" && finding.evidence.length > 0 &&
    (findingPair(finding) || finding.type === "broken-link" && finding.actions.some(action => action.kind === "open-note" && action.path && finding.notePaths.includes(action.path))))
    .sort((a, b) => IMPACT[a.impact] - IMPACT[b.impact] || CONFIDENCE[a.confidence] - CONFIDENCE[b.confidence] || compareStrings(a.id, b.id))
    .slice(0, 3);
}

/** Lexicographic priorities: impact, confidence, profile, lastSeenAt DESC, ID ASC. */
export function selectRecommendation(findings: readonly Finding[], profile: VaultProfile = DEFAULT_VAULT_PROFILE): Recommendation | undefined {
  const relevance = RELEVANCE[profile];
  const finding = findings.filter((item) => item.state === "open" && item.actions.length > 0).sort((a, b) =>
    IMPACT[a.impact] - IMPACT[b.impact] || CONFIDENCE[a.confidence] - CONFIDENCE[b.confidence] ||
    relevance.indexOf(a.dimension) - relevance.indexOf(b.dimension) || b.lastSeenAt - a.lastSeenAt || compareStrings(a.id, b.id),
  )[0];
  return finding ? { id: `recommendation-${finding.id}`, findingId: finding.id, title: finding.title,
    explanation: finding.explanation, action: { ...finding.actions[0] } } : undefined;
}
