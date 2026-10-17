import { parseLinktext } from "obsidian";
import type { App } from "obsidian";
import { readPlannerPair } from "./changePlannerSession";
import { buildMergePlan } from "./mergePlan";
import type { MergeIncoming } from "./mergePlan";
import { readCachedIncoming } from "./pairSnapshot";
import { sameSavedNote } from "./savedNote";
import { checksum, requireSafe } from "./operationJournal";
import type { MergePort } from "./mergeApply";
import type { SafeApplyPort } from "./safeApply";
import type { PlanPair } from "./changePlan";

/** Merge consent compares every available cached incoming path, not the inspector's bounded preview. */
export function readMergeIncoming(app: App, paths: readonly [string, string]): MergeIncoming {
  return [readCachedIncoming(app, paths[0], Number.MAX_SAFE_INTEGER) ?? null, readCachedIncoming(app, paths[1], Number.MAX_SAFE_INTEGER) ?? null];
}
export function guardMergePair(app: App, port: SafeApplyPort, pair: PlanPair, incoming: MergeIncoming): () => void {
  return () => {
    for (const n of pair) {
      port.guard(n); requireSafe(n.file.stat.ctime === n.created && JSON.stringify(app.metadataCache.getFileCache(n.file)) === JSON.stringify(n.cache), "stale");
      // Resolve all native link kinds again, including Markdown links and frontmatter properties.
      const refs = [...(n.cache?.links ?? []), ...(n.cache?.embeds ?? []), ...(n.cache?.frontmatterLinks ?? [])];
      requireSafe(refs.every((ref, i) => (app.metadataCache.getFirstLinkpathDest(parseLinktext(ref.link).path, n.path)?.path ?? null) === n.references[i].target), "stale");
    }
    requireSafe(JSON.stringify(readMergeIncoming(app, [pair[0].path, pair[1].path])) === JSON.stringify(incoming), "stale");
  };
}
export function obsidianMergePort(app: App, port: SafeApplyPort): MergePort {
  return {
    async check(plan, analysis, pinned) {
      const paths = [analysis.pair[0].path, analysis.pair[1].path] as const;
      const read = await readPlannerPair(app, paths), incoming = readMergeIncoming(app, paths);
      const rebuilt = buildMergePlan(analysis, read.pair, { operation: "merge_knowledge", canonical: plan.provenance.userCanonical,
        transfers: plan.transfers, insertion: plan.insertion.anchor, insertionConfirmed: plan.insertion.confirmed }, incoming);
      requireSafe(JSON.stringify(rebuilt) === JSON.stringify(plan), "stale");
      const side = plan.provenance.userCanonical, notes = [read.pair[side], read.pair[side === 0 ? 1 : 0]] as const;
      if (pinned) requireSafe(notes.every((n, i) => sameSavedNote(n, pinned[i])), "stale");
      const check = guardMergePair(app, port, read.pair, incoming); check(); return { notes, guard: check };
    },
    async undo(record, pinned, restoration) {
      const c = record.canonical, s = record.secondary, read = await readPlannerPair(app, [c.path, s.path]);
      const [canonical, secondary] = read.pair;
      requireSafe(canonical.created === c.created && canonical.content === c.after && canonical.bytes === new TextEncoder().encode(c.after).length &&
        secondary.created === s.created && secondary.modified === (restoration?.modified ?? s.modified) && secondary.bytes === s.bytes && secondary.content === s.content &&
        await checksum(secondary.content) === s.hash && read.pair.every(n => n.cache?.sections), "conflict");
      if (pinned) requireSafe(read.pair.every((n, i) => sameSavedNote(n, pinned[i]) &&
        JSON.stringify(n.cache) === JSON.stringify(pinned[i].cache) && JSON.stringify(n.references) === JSON.stringify(pinned[i].references)), "conflict");
      const check = guardMergePair(app, port, read.pair, readMergeIncoming(app, [c.path, s.path])); check(); return { notes: read.pair, guard: check };
    },
  };
}
