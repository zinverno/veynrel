export type HealthDimension = "structure" | "connections" | "recall" | "knowledge";
export type FindingState = "open" | "snoozed" | "dismissed" | "resolved";
export type FindingImpact = "info" | "review" | "attention";
export type FindingConfidence = "deterministic" | "high" | "medium";
export type FindingSource = "local" | "semantic" | "deep-ai" | "recall";

/** Small explanatory facts, never full note bodies. Paths are canonical vault-relative strings. */
export interface FindingEvidence {
  kind: string;
  label?: string;
  value?: string | number | boolean;
  path?: string;
  relatedPath?: string;
  snippet?: string;
}

/** Describes an action; execution and authorization belong to future consumers. */
export interface FindingAction {
  kind: string;
  label?: string;
  path?: string;
  relatedPath?: string;
}

/** An analyzer supplies observations, never lifecycle state. */
export interface FindingCandidate {
  readonly fingerprint: string;
  readonly analyzerId: string;
  readonly dimension: HealthDimension;
  readonly type: string;
  readonly source: FindingSource;
  impact: FindingImpact;
  confidence: FindingConfidence;
  title: string;
  explanation: string;
  notePaths: string[];
  evidence: FindingEvidence[];
  actions: FindingAction[];
}

export interface Finding extends FindingCandidate {
  readonly id: string;
  state: FindingState;
  readonly firstSeenAt: number;
  lastSeenAt: number;
  snoozedUntil?: number;
}
