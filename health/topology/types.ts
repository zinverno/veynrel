import type { LocalVaultRevision, LocalVaultFreshnessProbe } from "../analyzers/local/localVaultRevision";
import type { LocalVaultSnapshot } from "../analyzers/local/types";

export interface TopologyNode {
  readonly id: string;
  readonly path: string;
  readonly basename: string;
  readonly incoming: number;
  readonly outgoing: number;
  /** Directed degree: reciprocal neighbors contribute twice. */
  readonly degree: number;
  readonly componentId: string;
  readonly linksAvailable: boolean;
  /** Both classifications require complete graph coverage. */
  readonly orphan: boolean;
  readonly connector: boolean;
  readonly unresolvedTargetCount: number;
  readonly unresolvedOccurrenceCount: number;
}
export interface TopologyEdge { readonly source: string; readonly target: string }
export interface BrokenTarget {
  readonly id: string;
  readonly target: string;
  readonly sources: readonly { readonly path: string; readonly occurrences: number }[];
  readonly occurrences: number;
}
export interface TopologyComponent {
  readonly id: string;
  readonly paths: readonly string[];
  readonly primary: boolean;
}
export interface VaultTopologySnapshot {
  readonly revision: LocalVaultRevision;
  readonly capturedAt: number;
  readonly complete: boolean;
  readonly nodes: readonly TopologyNode[];
  readonly edges: readonly TopologyEdge[];
  readonly brokenTargets: readonly BrokenTarget[];
  readonly components: readonly TopologyComponent[];
  readonly noteCount: number;
  readonly resolvedLinkCount: number;
  readonly componentCount: number;
  /** Undefined means unknown, not zero. */
  readonly orphanCount?: number;
  readonly connectorCount?: number;
  readonly brokenTargetCount: number;
  readonly brokenOccurrenceCount: number;
}
export interface VaultTopologyProductSnapshot {
  readonly state: "idle" | "loading" | "ready" | "stale" | "error";
  readonly map?: VaultTopologySnapshot;
  readonly error?: "build" | "changed";
  readonly timing?: { readonly captureMs: number; readonly derivationMs: number };
}
export interface VaultTopologyPort {
  getSnapshot(): VaultTopologyProductSnapshot;
  subscribe(listener: () => void): () => void;
  load(): Promise<void>;
  refresh(): Promise<void>;
  dispose(): void;
}
export interface TopologySource extends LocalVaultFreshnessProbe {
  captureMetadata(signal: AbortSignal): Promise<LocalVaultSnapshot>;
}
