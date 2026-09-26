import { t } from "../../i18n";
import { compareStrings } from "../domain/validation";
import type { TopologyNode, VaultTopologyProductSnapshot, VaultTopologySnapshot } from "./types";

export const TOPOLOGY_LIST_LIMIT = 20;
export const TOPOLOGY_EDGE_LIMIT = 10_000;

export function searchTopology(nodes: readonly TopologyNode[], query: string): { nodes: readonly TopologyNode[]; total: number } {
  const text = query.trim().toLowerCase();
  const matches = nodes.filter((node) => node.path.toLowerCase().includes(text) || node.basename.toLowerCase().includes(text));
  return { nodes: matches.slice(0, TOPOLOGY_LIST_LIMIT), total: matches.length };
}
export function topologyStatus(snapshot: VaultTopologyProductSnapshot): string {
  if (snapshot.error === "changed") return t("@topology.changed");
  if (snapshot.state === "error") return t("@topology.error");
  if (snapshot.state === "loading") return t("@topology.loading");
  if (snapshot.state === "stale") return t("@topology.stale");
  return snapshot.map ? t(snapshot.map.complete ? "@topology.complete" : "@topology.partial") : "";
}
export function topologyMetrics(map: VaultTopologySnapshot): Array<{ label: string; value: number | string }> {
  return [
    { label: t("@topology.notes"), value: map.noteCount },
    { label: t("@topology.links"), value: map.resolvedLinkCount },
    { label: t(map.complete ? "@topology.components" : "@topology.observed-components"), value: map.componentCount },
    { label: t("@topology.orphans"), value: map.orphanCount ?? t("@topology.unknown") },
    { label: t("@topology.connectors"), value: map.connectorCount ?? t("@topology.unknown") },
    { label: t("@topology.broken"), value: map.brokenOccurrenceCount },
  ];
}
/** A relationship retains direction and whether the two directed edges were collapsed. */
export function topologyRelationships(map: VaultTopologySnapshot) {
  const pairs = new Map<string, { source: string; target: string; reciprocal: boolean }>();
  for (const edge of map.edges) {
    const key = JSON.stringify([edge.source, edge.target].sort(compareStrings));
    const existing = pairs.get(key);
    if (existing) existing.reciprocal = true;
    else pairs.set(key, { source: edge.source, target: edge.target, reciprocal: false });
  }
  const relationships = [...pairs.values()].slice(0, TOPOLOGY_EDGE_LIMIT);
  return { relationships, shown: relationships.reduce((sum, edge) => sum + (edge.reciprocal ? 2 : 1), 0), total: map.edges.length };
}
