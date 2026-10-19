import type { App } from "obsidian";
import type { SafeApplyPort } from "./safeApply";
import type { PlanPair } from "./changePlan";
import type { ArchivePlanV2 } from "./archivePlanV2";
import { readArchiveDependenciesV2 } from "./obsidianArchiveV2";
import { readPlannerPair } from "./changePlannerSession";
import { guardMergePair, readMergeIncoming } from "./obsidianMergeApply";
import { sameSavedNote } from "./savedNote";
import { checksum, requireSafe } from "./operationJournal";
import { structuralEvidence, structuralMetadata, unarchiveMetadata } from "./structuralArchiveEvidence";
import type { StructuralRestoration } from "./structuralArchiveEvidence";
import type { StructuralEnvironment, StructuralArchiveRecord } from "./structuralArchiveJournal";

function environment(app: App, notes: PlanPair, plan?: ArchivePlanV2): string {
  const read = readArchiveDependenciesV2(app, notes), dependencies = read.dependencies;
  requireSafe(dependencies.every(d => JSON.stringify(d.issues) === JSON.stringify(["external_consumers_unverified"]) && d.incoming !== null), "conflict");
  const metadata = notes.map(n => { requireSafe(n.cache?.sections, "stale"); return structuralMetadata(n.cache); }) as StructuralEnvironment["metadata"];
  if (plan) {
    metadata[1] = unarchiveMetadata(metadata[1], plan);
    const c = plan.canonical.path, s = plan.secondary.path, original = `[[${c.slice(0, -3)}]]`;
    const archiveRef = (r: { kind: string; original: string; target: string | null }) => r.kind === "property" && r.original === original && r.target === c;
    requireSafe(dependencies[1].outgoing.filter(archiveRef).length === 1, "conflict");
    dependencies[1].outgoing = dependencies[1].outgoing.filter(r => !archiveRef(r));
    for (const d of dependencies) {
      d.targets = d.targets.filter(r => !(r.from === s && archiveRef(r)));
      if (d.path === c) {
        const incoming = d.incoming!.find(i => i.path === s);
        requireSafe(incoming && incoming.references.filter(archiveRef).length === 1, "conflict");
        incoming.references = incoming.references.filter(r => !archiveRef(r)); incoming.count--;
        d.incoming = d.incoming!.filter(i => i.count > 0);
      }
    }
  }
  const consumers = [...read.identities].filter(([path]) => !notes.some(n => n.path === path)).sort(([a], [b]) => a.localeCompare(b)).map(([path, file]) => {
    const cache = file && app.metadataCache.getFileCache(file); requireSafe(file && cache, "conflict");
    return { path, created: file.stat.ctime, modified: file.stat.mtime, bytes: file.stat.size, metadata: structuralMetadata(cache) };
  });
  return structuralEvidence({ metadata, dependencies, consumers });
}
export async function readStructuralArchiveInput(app: App, port: SafeApplyPort, paths: readonly [string, string], archived?: ArchivePlanV2, pinned?: PlanPair) {
  const { pair } = await readPlannerPair(app, paths);
  if (pinned) requireSafe(pair.every((n, i) => sameSavedNote(n, pinned[i]) && n.created === pinned[i].created &&
    structuralEvidence(n.cache) === structuralEvidence(pinned[i].cache) && structuralEvidence(n.references) === structuralEvidence(pinned[i].references)), "stale");
  const base = guardMergePair(app, port, pair, readMergeIncoming(app, paths)), snapshot = readArchiveDependenciesV2(app, pair);
  const evidence = environment(app, pair, archived);
  const guard = () => {
    base(); requireSafe(environment(app, pair, archived) === evidence, "stale");
    requireSafe([...snapshot.identities].every(([path, file]) => app.vault.getFileByPath(path) === file) &&
      paths.every((path, i) => app.metadataCache.getFirstLinkpathDest(path.slice(0, -3), paths[1 - i]) === pair[i].file), "stale");
  };
  guard(); return { notes: pair, guard, environment: evidence };
}
export async function readStructuralArchiveState(app: App, port: SafeApplyPort, record: StructuralArchiveRecord, archived: boolean, pinned?: PlanPair) {
  const p = record.plan, checked = await readStructuralArchiveInput(app, port, [p.canonical.path, p.secondary.path], archived ? p : undefined, pinned), [c, s] = checked.notes;
  requireSafe(c.created === p.canonical.created && c.modified === p.canonical.modified && c.bytes === p.canonical.bytes && c.content === p.canonical.content &&
    s.created === p.secondary.created && s.content === (archived ? p.secondary.after : p.secondary.before) && s.bytes === new TextEncoder().encode(s.content).length &&
    await checksum(c.content) === record.hashes.canonical && await checksum(s.content) === (archived ? record.hashes.after : record.hashes.before) && checked.environment === record.environment, "conflict");
  checked.guard(); return checked;
}
/** Called from native parent Undo, with no owner lock acquisition or journal mutation. */
export async function checkStructuralRestoration(app: App, port: SafeApplyPort, notes: PlanPair, restoration: StructuralRestoration): Promise<() => void> {
  const checked = await readStructuralArchiveState(app, port, restoration.record, false, notes);
  requireSafe(checked.notes[1].modified === restoration.modified && await checksum(checked.notes[1].content) === restoration.receipt.hash, "archive_chain");
  return checked.guard;
}
