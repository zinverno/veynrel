import { parseLinktext } from "obsidian";
import type { App } from "obsidian";
import type { MergeApply } from "./mergeApply";
import type { PlanPair, PlanReference } from "./changePlan";
import type { ArchiveDependencies } from "./archivePlan";
import type { ArchiveRead } from "./archiveSession";
import { readCachedIncoming } from "./pairSnapshot";
import { requireSafe } from "./operationJournal";

/** Consult caches of known consumers only; do not read their Markdown or scan the vault. */
export function readArchiveDependencies(app: App, notes: PlanPair): { dependencies: ArchiveDependencies[]; fingerprint: string } {
  const evidence: unknown[] = [];
  const dependencies = notes.map(note => {
    const paths = readCachedIncoming(app, note.path, Number.MAX_SAFE_INTEGER)?.items.sort();
    const incoming = paths?.map(path => {
      const file = app.vault.getFileByPath(path), cache = file ? app.metadataCache.getFileCache(file) : null;
      const references: PlanReference[] = [];
      for (const [kind, items] of [["link", cache?.links], ["embed", cache?.embeds], ["property", cache?.frontmatterLinks]] as const) {
        for (const ref of items ?? []) {
          const target = app.metadataCache.getFirstLinkpathDest(parseLinktext(ref.link).path, path)?.path ?? null;
          if (target === note.path) references.push({ kind, original: ref.original, target });
        }
      }
      const count = app.metadataCache.resolvedLinks[path][note.path];
      evidence.push({ path, stat: file?.stat, cache });
      return { path, count, references, metadataAvailable: !!cache };
    }) ?? null;
    return { path: note.path, outgoing: note.references, incoming };
  });
  return { dependencies, fingerprint: JSON.stringify(evidence) };
}
export async function readArchiveBasis(app: App, merge: MergeApply, id: string, current: () => boolean): Promise<ArchiveRead> {
  const checked = await merge.readApplied(id, current), snapshot = readArchiveDependencies(app, checked.notes);
  const guard = () => {
    requireSafe(current(), "stale"); checked.guard();
    const fresh = readArchiveDependencies(app, checked.notes);
    requireSafe(JSON.stringify(fresh) === JSON.stringify(snapshot), "stale");
    requireSafe(app.metadataCache.getFirstLinkpathDest(checked.record.canonical.path.slice(0, -3), checked.record.secondary.path) === checked.notes[0].file, "stale");
  };
  guard(); return { ...checked, dependencies: snapshot.dependencies, guard };
}
