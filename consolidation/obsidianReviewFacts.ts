import { reviewDecisions } from "./reviewDecisions";
import type { App, TAbstractFile } from "obsidian";
import { readPlannerPair } from "./changePlannerSession";
import { checksum } from "./operationJournal";
import { ReviewFacts } from "../health/workbench/reviewFacts";
import { subscribeReviewRefresh, reviewOutcomeSnapshot } from "./reviewRefresh";

export function createReviewFacts(app: App, changed: () => void): ReviewFacts {
  const pending = new Set<string>();
  return new ReviewFacts({
    read: async paths => {
      if (paths.some(p => !app.vault.getFileByPath(p))) return { signatures: [], missing: true };
      const { pair } = await readPlannerPair(app, paths);
      const signatures = await Promise.all(pair.map(async n => `${n.file.stat.ctime}:${await checksum(n.content)}`));
      return { signatures, kept: await reviewDecisions(app)?.kept(pair).catch(() => false), links: pair.every(n => n.cache && !pending.has(n.path)) ?
        [pair[0].references.some(r => r.target === paths[1]), pair[1].references.some(r => r.target === paths[0])] : undefined };
    },
    history: async () => reviewOutcomeSnapshot(app),
    subscribe: notify => {
      const change = (f: TAbstractFile, old?: string) => { pending.add(f.path); if (old) pending.add(old); notify(old ? [f.path, old] : [f.path]); };
      const vault = [app.vault.on("create", change), app.vault.on("modify", change), app.vault.on("delete", change), app.vault.on("rename", change)];
      const metadata = [app.metadataCache.on("changed", f => { pending.delete(f.path); notify([f.path]); }), app.metadataCache.on("resolved", () => notify())];
      const remove = subscribeReviewRefresh(app, paths => notify(paths));
      return () => { vault.forEach(r => app.vault.offref(r)); metadata.forEach(r => app.metadataCache.offref(r)); remove(); };
    },
  }, changed);
}
