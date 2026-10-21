/** Read-only cache projection. Neither a zone nor its visibility grants write authority. */
export interface WorkbenchTagRecord {
  path: string; state: "known" | "unknown" | "stale"; tags: readonly string[];
}
export interface WorkbenchTagCategory { id: string; name: string; prefixes: readonly string[]; tags: readonly string[] }
export interface WorkbenchTagSnapshot { revision: number; notes: readonly WorkbenchTagRecord[]; categories: readonly WorkbenchTagCategory[] }
export interface WorkbenchTagsPort {
  getSnapshot(): WorkbenchTagSnapshot;
  refresh(): void;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}
export interface TagZone {
  tag: string; category: string; categoryName: string;
  direct: readonly string[]; inherited: readonly string[]; members: ReadonlySet<string>;
}
export const MAX_ACTIVE_ZONES = 8;
export function tagZones(snapshot?: WorkbenchTagSnapshot): TagZone[] {
  const zones = new Map<string, TagZone>();
  for (const note of snapshot?.notes ?? []) {
    if (note.state !== "known") continue;
    for (const literal of note.tags) {
      const segments = literal.split("/");
      for (let depth = 1; depth <= segments.length; depth++) {
        const tag = segments.slice(0, depth).join("/");
        const category = snapshot?.categories.find(category => literal.includes("/") ? category.prefixes.includes(segments[0]) : category.tags.includes(literal));
        let zone = zones.get(tag);
        if (!zone) {
          zone = { tag, category: category?.id ?? `tag:${segments[0]}`, categoryName: category?.name ?? `#${segments[0]}`,
            direct: [], inherited: [], members: new Set<string>() }; zones.set(tag, zone);
        }
        (zone.members as Set<string>).add(note.path);
        const members = (depth === segments.length ? zone.direct : zone.inherited) as string[];
        if (!members.includes(note.path)) members.push(note.path);
      }
    }
  }
  return [...zones.values()].sort((a, b) => a.tag < b.tag ? -1 : 1);
}
export function matchesTagFilter(path: string, zones: readonly TagZone[], tags: readonly string[], mode: "all" | "any"): boolean {
  if (!tags.length) return true;
  const matches = tags.map(tag => zones.find(zone => zone.tag === tag)?.members.has(path) === true);
  return mode === "all" ? matches.every(Boolean) : matches.some(Boolean);
}
