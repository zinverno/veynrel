import type { LocalVaultSnapshot } from "../analyzers/local/types";

/** Synthetic only; imported by tests/native fixture generation, never by the plugin. */
export function syntheticTopologyFixture(): LocalVaultSnapshot {
  const path = (index: number): string => `Synthetic/Note-${String(index).padStart(4, "0")}.md`;
  const outgoing = Array.from({ length: 1000 }, () => new Set<number>());
  for (const [start, size] of [[0, 800], [800, 100], [900, 60]]) {
    for (let index = 0; index < size; index++) {
      for (const offset of [1, 2, 11, 41]) outgoing[start + index].add(start + (index + offset) % size);
      if (index % 5 === 0) outgoing[start + (index + 1) % size].add(start + index);
    }
  }
  outgoing[799].add(960);
  for (let index = 960; index < 979; index++) outgoing[index].add(index + 1);
  return { notes: outgoing.map((targets, index) => ({ path: path(index), basename: `Note-${String(index).padStart(4, "0")}`,
    mtime: 100, contentAvailable: false, linksAvailable: true, resolvedOutgoing: [...targets].map(path),
    unresolvedLinks: index % 37 === 0 ? [{ target: `Missing-${index % 4}`, count: 2 }] : [] })),
    coverage: { noteListComplete: true, contentComplete: false, linksComplete: true }, diagnostics: [], diagnosticsTruncated: 0 };
}
