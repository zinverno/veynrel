import { stableHash } from "../../utils/stableHash";
import { compareStrings, isTimestamp } from "../domain/validation";
import { checkpoint } from "../analyzers/local/cancellation";
import { createLocalAnalysisContext } from "../analyzers/local/localNoteGraph";
import { createLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import type { LocalVaultSnapshot } from "../analyzers/local/types";
import type { BrokenTarget, TopologyEdge, TopologyNode, VaultTopologySnapshot } from "./types";

/** Validates with Local Health's graph constructor. Retains structural metadata only. */
export async function deriveTopology(input: LocalVaultSnapshot, capturedAt: number, signal: AbortSignal): Promise<VaultTopologySnapshot> {
  if (!isTimestamp(capturedAt)) throw new Error("Invalid topology capture time");
  const { graph, snapshot } = await createLocalAnalysisContext(input, signal);
  const neighbors = new Map(graph.paths.map((path) => [path,
    [...new Set([...graph.incoming[path], ...graph.outgoing[path]])].sort(compareStrings)]));
  const discovery = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string>();
  const connectors = new Set<string>();
  const groups: string[][] = [];
  let clock = 0;
  let processed = 0;
  // Iterative Tarjan DFS: O(V + E) after canonical ordering, without recursion depth limits.
  for (const root of graph.paths) {
    await checkpoint(signal, processed++);
    if (discovery.has(root)) continue;
    const members = [root];
    discovery.set(root, ++clock); low.set(root, clock);
    const stack = [{ path: root, next: 0, children: 0 }];
    while (stack.length) {
      await checkpoint(signal, processed++);
      const frame = stack[stack.length - 1];
      const adjacent = neighbors.get(frame.path)!;
      if (frame.next < adjacent.length) {
        const next = adjacent[frame.next++];
        if (!discovery.has(next)) {
          frame.children++;
          parent.set(next, frame.path); discovery.set(next, ++clock); low.set(next, clock);
          members.push(next); stack.push({ path: next, next: 0, children: 0 });
        } else if (next !== parent.get(frame.path)) {
          low.set(frame.path, Math.min(low.get(frame.path)!, discovery.get(next)!));
        }
      } else {
        stack.pop();
        const ancestor = parent.get(frame.path);
        if (ancestor !== undefined) {
          low.set(ancestor, Math.min(low.get(ancestor)!, low.get(frame.path)!));
          if (parent.has(ancestor) && low.get(frame.path)! >= discovery.get(ancestor)!) connectors.add(ancestor);
        } else if (frame.children > 1) connectors.add(frame.path);
      }
    }
    groups.push(members.sort(compareStrings));
  }
  groups.sort((a, b) => b.length - a.length || compareStrings(a[0], b[0]));
  const componentFor = new Map<string, string>();
  const components = groups.map((paths, index) => {
    const id = `component-${stableHash(paths[0])}`;
    for (const path of paths) componentFor.set(path, id);
    return Object.freeze({ id, paths: Object.freeze(paths), primary: index === 0 });
  });
  const targets = new Map<string, Map<string, number>>();
  const edges: TopologyEdge[] = [];
  const nodes: TopologyNode[] = [];
  for (const note of snapshot.notes) {
    await checkpoint(signal, processed++);
    const unresolved = new Map<string, number>();
    if (note.linksAvailable) for (const link of note.unresolvedLinks) {
      unresolved.set(link.target, (unresolved.get(link.target) ?? 0) + link.count);
    }
    let occurrences = 0;
    for (const [target, count] of unresolved) {
      if (!Number.isSafeInteger(count)) throw new Error("Invalid topology count");
      occurrences += count;
      if (!targets.has(target)) targets.set(target, new Map());
      targets.get(target)!.set(note.path, count);
    }
    if (!Number.isSafeInteger(occurrences)) throw new Error("Invalid topology count");
    const incoming = graph.incoming[note.path].length;
    const outgoing = graph.outgoing[note.path].length;
    nodes.push(Object.freeze({ id: `note-${stableHash(note.path)}`, path: note.path, basename: note.basename,
      incoming, outgoing, degree: incoming + outgoing, componentId: componentFor.get(note.path)!, linksAvailable: note.linksAvailable,
      orphan: graph.complete && incoming + outgoing === 0, connector: graph.complete && connectors.has(note.path),
      unresolvedTargetCount: unresolved.size, unresolvedOccurrenceCount: occurrences }));
    for (const target of graph.outgoing[note.path]) edges.push(Object.freeze({ source: note.path, target }));
  }
  const brokenTargets: BrokenTarget[] = [...targets].sort(([a], [b]) => compareStrings(a, b)).map(([target, sources]) => {
    const entries = [...sources].map(([path, occurrences]) => Object.freeze({ path, occurrences }));
    const occurrences = entries.reduce((sum, entry) => sum + entry.occurrences, 0);
    if (!Number.isSafeInteger(occurrences)) throw new Error("Invalid topology count");
    return Object.freeze({ id: `target-${stableHash(target)}`, target, sources: Object.freeze(entries), occurrences });
  });
  const brokenOccurrenceCount = brokenTargets.reduce((sum, target) => sum + target.occurrences, 0);
  if (!Number.isSafeInteger(brokenOccurrenceCount)) throw new Error("Invalid topology count");
  return Object.freeze({ revision: Object.freeze(createLocalVaultRevision(snapshot.notes, snapshot.coverage.noteListComplete)), capturedAt,
    complete: graph.complete, nodes: Object.freeze(nodes), edges: Object.freeze(edges), brokenTargets: Object.freeze(brokenTargets),
    components: Object.freeze(components), noteCount: nodes.length, resolvedLinkCount: edges.length, componentCount: components.length,
    orphanCount: graph.complete ? nodes.filter((node) => node.orphan).length : undefined,
    connectorCount: graph.complete ? connectors.size : undefined,
    brokenTargetCount: brokenTargets.length, brokenOccurrenceCount });
}
