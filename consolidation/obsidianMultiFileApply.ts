import type { App } from "obsidian";
import { readPlannerPair } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";
import { buildMultiFilePlan } from "./multiFilePlan";
import { buildChangePlan } from "./changePlan";
import { sameSavedNote } from "./savedNote";
import { requireSafe } from "./operationJournal";
import type { MultiFilePort } from "./multiFileApply";
import type { SafeApplyPort } from "./safeApply";

/** Public native reads/resolver only; no cursor, forced save, file creation or direct adapter Markdown IO. */
export function obsidianMultiFilePort(app: App, port: SafeApplyPort): MultiFilePort {
  return {
    async review(plan, analysis) {
      const read = await readPlannerPair(app, plan.participants);
      const rebuilt = buildMultiFilePlan(analysis, read.pair, { operation: "add_reciprocal_links",
        selections: [plan.files[0].userSelection.range, plan.files[1].userSelection.range],
        confirmed: [plan.files[0].userSelection.confirmed, plan.files[1].userSelection.confirmed] }, read.linktexts);
      requireSafe(JSON.stringify(rebuilt) === JSON.stringify(plan), "stale");
      for (const n of read.pair) port.guard(n);
      return read;
    },
    async step(r, expected, pinned, baseline, next, analysis, written = [false, false]) {
      const deadline = Date.now() + 1500;
      let read: PlannerRead;
      for (;;) {
        read = await readPlannerPair(app, [r.files[0].path, r.files[1].path]);
        for (const [i, n] of read.pair.entries()) requireSafe(n.file.stat.ctime === r.files[i].created && sameSavedNote(n, pinned[i]) &&
          n.content === (expected[i] === "before" ? r.files[i].before : r.files[i].after), "conflict");
        if (read.pair.every(n => n.cache)) break;
        // Native process temporarily evicts its own cache. Only wait for our writes; recheck both saved texts every time.
        requireSafe(read.pair.every((n, i) => n.cache || written[i]) && Date.now() < deadline, "stale");
        await new Promise<void>(resolve => window.setTimeout(resolve, 25));
      }
      for (const [i, n] of read.pair.entries()) {
        requireSafe(read.linktexts[i], "stale");
        // Written participants may have delayed cache events; unchanged sources must retain reviewed structure.
        if (baseline && expected[i] === "before") requireSafe(JSON.stringify(n.cache) === JSON.stringify(baseline.pair[i].cache) &&
          JSON.stringify(n.references) === JSON.stringify(baseline.pair[i].references), "stale");
      }
      if (next !== undefined) {
        // add_link does not consume model claims; recheck the remaining native paragraph/link guard on current sources.
        requireSafe(analysis, "stale");
        const rebuilt = buildChangePlan({ ...analysis, pair: read.pair }, read.pair, {
          operation: "add_link", source: next, selection: r.files[next].selection, confirmed: true }, read.linktexts[next === 0 ? 1 : 0]);
        requireSafe(rebuilt.after === r.files[next].after && JSON.stringify(rebuilt.edit) === JSON.stringify(r.files[next].edit), "stale");
      }
      const guard = () => {
        for (const [i, n] of read.pair.entries()) {
          port.guard(n); requireSafe(n.file.stat.ctime === r.files[i].created, "conflict");
          requireSafe((app.metadataCache.getFileCache(n.file) || written[i]) && app.metadataCache.getFirstLinkpathDest(r.files[i === 0 ? 1 : 0].path.slice(0, -3), n.path) === read.pair[i === 0 ? 1 : 0].file, "stale");
          if (baseline && expected[i] === "before") requireSafe(JSON.stringify(app.metadataCache.getFileCache(n.file)) === JSON.stringify(baseline.pair[i].cache), "stale");
        }
      };
      guard(); return { notes: read.pair, guard };
    },
  };
}
