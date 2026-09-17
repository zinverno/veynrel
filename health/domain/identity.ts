import { stableHash } from "../../utils/stableHash";
import type { FindingSource, HealthDimension } from "./finding";
import { isFingerprint, isIdentifier, isOneOf, isText, isVaultPath } from "./validation";

export interface FindingFingerprintInput {
  source: FindingSource;
  analyzerId: string;
  dimension: HealthDimension;
  type: string;
  /** An unordered set. A/B and B/A identify the same pair. */
  paths: readonly string[];
  /** Stable technical discriminator, e.g. a link target/heading; never localized prose. */
  key?: string;
}

export function canonicalFindingPaths(paths: readonly string[]): string[] {
  if (!Array.isArray(paths) || paths.length > 100) {
    throw new Error("Invalid finding paths");
  }
  const values: unknown[] = Array.from(paths);
  if (!values.every(isVaultPath)) throw new Error("Invalid finding paths");
  return [...new Set(values)].sort();
}

/** A versioned JSON tuple avoids separator ambiguity and remains inspectable. */
export function createFindingFingerprint(input: FindingFingerprintInput): string {
  if (!isOneOf(input.source, ["local", "semantic", "deep-ai", "recall"]) ||
      !isOneOf(input.dimension, ["structure", "connections", "recall", "knowledge"]) ||
      !isIdentifier(input.analyzerId) || !isIdentifier(input.type) ||
      (input.key !== undefined && !isText(input.key, 4096))) {
    throw new Error("Invalid fingerprint input");
  }
  const fingerprint = `v1:${JSON.stringify([input.source, input.analyzerId, input.dimension, input.type, canonicalFindingPaths(input.paths), input.key ?? null])}`;
  if (!isFingerprint(fingerprint)) throw new Error("Invalid fingerprint");
  return fingerprint;
}

export function findingIdFromFingerprint(fingerprint: string): string {
  if (!isFingerprint(fingerprint)) throw new Error("Invalid fingerprint");
  return `finding-${stableHash(fingerprint)}`;
}

export function isFindingId(value: unknown): value is string {
  return typeof value === "string" && /^finding-[0-9a-f]{16}$/u.test(value);
}
