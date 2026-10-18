import type { App } from "obsidian";
import type { ArchivePort } from "./archiveApply";
import { buildArchivePlan } from "./archivePlan";
import { readPlannerPair } from "./changePlannerSession";
import type { PlanPair } from "./changePlan";
import { readArchiveDependencies } from "./obsidianArchive";
import { guardMergePair, readMergeIncoming } from "./obsidianMergeApply";
import { sameSavedNote } from "./savedNote";
import type { SafeApplyPort } from "./safeApply";
import { requireSafe } from "./operationJournal";

/** No journal writes or nested service locks; caller owns provenance validation and the shared lock. */
export function obsidianArchivePort(app: App, port: SafeApplyPort): ArchivePort {
  const read = async (paths: readonly [string, string], pinned?: PlanPair) => {
    const { pair } = await readPlannerPair(app, paths);
    requireSafe(pair.every(n => n.cache?.sections), "stale");
    if (pinned) requireSafe(pair.every((n, i) => sameSavedNote(n, pinned[i]) && n.created === pinned[i].created &&
      JSON.stringify(n.cache) === JSON.stringify(pinned[i].cache) && JSON.stringify(n.references) === JSON.stringify(pinned[i].references)), "stale");
    const dependencies = readArchiveDependencies(app, pair), base = guardMergePair(app, port, pair, readMergeIncoming(app, paths));
    const guard = () => {
      base(); requireSafe(JSON.stringify(readArchiveDependencies(app, pair)) === JSON.stringify(dependencies), "stale");
      requireSafe(app.metadataCache.getFirstLinkpathDest(paths[0].slice(0, -3), paths[1]) === pair[0].file, "stale");
    };
    guard(); return { notes: pair, guard, dependencies: dependencies.dependencies };
  };
  return {
    async check(plan, parent, pinned) {
      const checked = await read([plan.canonical.path, plan.secondary.path], pinned), [c, s] = checked.notes;
      requireSafe(c.created === plan.canonical.created && c.modified === plan.canonical.modified && c.bytes === plan.canonical.bytes && c.content === plan.canonical.content &&
        s.created === plan.secondary.created && s.modified === plan.secondary.modified && s.bytes === plan.secondary.bytes && s.content === plan.secondary.before, "stale");
      const rebuilt = buildArchivePlan(parent, plan.provenance.receipt, plan.provenance.recordHash, c, s, checked.dependencies,
        { status: plan.status, dispositions: plan.preservation.map(f => ({ range: f.range, disposition: f.disposition })), limitationsReviewed: plan.confirmation.limitationsReviewed });
      requireSafe(JSON.stringify(rebuilt) === JSON.stringify(plan), "stale"); checked.guard(); return checked;
    },
    async undo(record, pinned) {
      const p = record.plan, checked = await read([p.canonical.path, p.secondary.path], pinned), [c, s] = checked.notes;
      requireSafe(c.created === p.canonical.created && c.modified === p.canonical.modified && c.bytes === p.canonical.bytes && c.content === p.canonical.content &&
        s.created === p.secondary.created && s.content === p.secondary.after && s.bytes === new TextEncoder().encode(s.content).length, "conflict");
      checked.guard(); return checked;
    },
  };
}
