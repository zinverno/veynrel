import { parseLinktext } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import type { SafeApplyService } from "./safeApply";
import type { PlanPair } from "./changePlan";
import type { ArchiveParent, ArchiveDependenciesV2 } from "./archivePlanV2";
import type { ArchiveReadV2 } from "./archiveSessionV2";
import { archivePartition } from "./archivePlanV2";
import { requireSafe } from "./operationJournal";

/** Known cache consumers only. Missing consumers and unclassified counts remain visible. */
export function readArchiveDependenciesV2(app: App, notes: PlanPair) {
  const identities = new Map<string, ReturnType<App["vault"]["getFileByPath"]>>();
  const evidence: unknown[] = [];
  const refs = (path: string, cache: CachedMetadata | null | undefined): ArchiveDependenciesV2["targets"] => {
    const result: ArchiveDependenciesV2["targets"] = [];
    for (const [kind, items] of [["link", cache?.links], ["embed", cache?.embeds], ["property", cache?.frontmatterLinks]] as const) {
      for (const ref of items ?? []) {
        const parsed = parseLinktext(ref.link), file = app.metadataCache.getFirstLinkpathDest(parsed.path, path);
        if (file) identities.set(file.path, file);
        result.push({ from: path, kind, original: ref.original, target: file?.path ?? null, subpath: parsed.subpath });
      }
    }
    return result;
  };
  const dependencies: ArchiveDependenciesV2[] = notes.map(note => {
    const targets = refs(note.path, note.cache), issues: string[] = ["external_consumers_unverified"];
    const index = app.metadataCache.resolvedLinks;
    if (!index) issues.push("incoming_index_missing");
    const incoming = index ? Object.keys(index).sort().flatMap(path => {
      requireSafe(index[path] && typeof index[path] === "object", "stale");
      if (!Object.prototype.hasOwnProperty.call(index[path], note.path)) return [];
      const count = index[path][note.path];
      requireSafe(Number.isSafeInteger(count) && count >= 0, "stale");
      if (!count) return [];
      const file = app.vault.getFileByPath(path), cache = file ? app.metadataCache.getFileCache(file) : null;
      identities.set(path, file); evidence.push({ path, stat: file ? { ...file.stat } : null, cache });
      const references = refs(path, cache).filter(r => r.target === note.path); targets.push(...references);
      if (!file || !cache) issues.push("consumer_metadata_missing");
      if (references.length !== count) issues.push("incoming_count_mismatch");
      return [{ path, count, metadataAvailable: !!file && !!cache, references: references.map(({ kind, original, target }) => ({ kind, original, target })) }];
    }) : null;
    if (targets.some(r => r.target === null)) issues.push("unresolved_outgoing");
    return { path: note.path, outgoing: note.references, incoming, targets, issues: [...new Set(issues)] };
  });
  return { dependencies, fingerprint: JSON.stringify({ dependencies, evidence }), identities };
}

export async function readArchiveBasisV2(app: App, service: Pick<SafeApplyService, "readArchiveParent">,
  operation: ArchiveParent["operation"], id: string, current: () => boolean): Promise<ArchiveReadV2> {
  const checked = await service.readArchiveParent(operation, id, current);
  archivePartition(checked.record, checked.notes[1]);
  const snapshot = readArchiveDependenciesV2(app, checked.notes);
  const guard = () => {
    requireSafe(current(), "stale"); checked.guard();
    const fresh = readArchiveDependenciesV2(app, checked.notes);
    requireSafe(fresh.fingerprint === snapshot.fingerprint && fresh.identities.size === snapshot.identities.size &&
      [...snapshot.identities].every(([path, file]) => app.vault.getFileByPath(path) === file && fresh.identities.get(path) === file), "stale");
    requireSafe(app.metadataCache.getFirstLinkpathDest(checked.record.plan.canonical.path.slice(0, -3), checked.record.plan.secondary.path) === checked.notes[0].file, "stale");
  };
  guard(); return { ...checked, dependencies: snapshot.dependencies, guard };
}
