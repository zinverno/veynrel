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
