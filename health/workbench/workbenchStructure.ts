import type { VaultTopologyProductSnapshot } from "../topology/types";

/** Unknown incoming metadata anywhere prevents classifying a scoped note as isolated. */
export function structureCoverage(snapshot: VaultTopologyProductSnapshot, scope: readonly string[]) {
  const paths = new Set(scope), map = snapshot.map;
  const complete = snapshot.state === "ready" && map?.complete === true;
  return {
    complete,
    unknown: map?.nodes.filter(node => !node.linksAvailable).length,
    represented: map?.nodes.filter(node => paths.has(node.path)).length ?? 0,
    isolated: new Set(complete ? map.nodes.filter(node => paths.has(node.path) && node.orphan).map(node => node.path) : []),
  };
}
