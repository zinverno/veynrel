import { vi } from "vitest";
import type { Finding } from "../domain/finding";
import { findingIdFromFingerprint } from "../domain/identity";
import { candidate } from "../store/testSupport";

export function inboxFinding(overrides: Partial<Finding> = {}): Finding {
  const item = candidate(overrides);
  return { ...item, id: findingIdFromFingerprint(item.fingerprint), state: "open", firstSeenAt: 1, lastSeenAt: 2, ...overrides };
}

export function toolsFixture() {
  return { openAskVault: vi.fn(), openDeepAudit: vi.fn(async () => {}), generateMocs: vi.fn(async () => {}),
    openBatchProcessing: vi.fn(), runLegacyVaultAudit: vi.fn(async () => {}) };
}
