import type { CompanionConnectionStatus, CompanionSettings } from "../../companionSync/types";

/** Adapter to the one existing Semantic-owned Companion service. No transport ownership. */
export interface ConnectEnginePort {
  getStatus(): CompanionConnectionStatus;
  subscribeStatus(listener: () => void): () => void;
  test(settings: CompanionSettings, signal?: AbortSignal): Promise<void>;
  syncCurrent(signal?: AbortSignal): Promise<"synced" | "semantic-required" | "disabled" | "obsolete">;
  getSemanticMirrorState(): { enabled: boolean; cachedReady: boolean };
  openProposalReview(): void;
}
