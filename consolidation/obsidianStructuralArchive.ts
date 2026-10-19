import type { ArchiveParentRead } from "./archivePlanV2";
import type { App } from "obsidian";
import type { SafeApplyPort } from "./safeApply";
import { buildArchivePlanV2 } from "./archivePlanV2";
import { readArchiveDependenciesV2 } from "./obsidianArchiveV2";
import { obsidianGroupPort } from "./obsidianGroupApply";
import { obsidianBundlePort } from "./obsidianBundleApply";
import { sameSavedNote } from "./savedNote";
import { checksum, requireSafe } from "./operationJournal";
import { structuralEvidence } from "./structuralArchiveEvidence";
import type { StructuralArchivePort } from "./structuralArchiveApply";
import { readStructuralArchiveInput, readStructuralArchiveState } from "./obsidianStructuralArchiveState";

/** Archive state authority is independent of parent Undo's historical secondary mtime. */
export function obsidianStructuralArchivePort(app: App, port: SafeApplyPort): StructuralArchivePort {
  return {
    async check(plan, parent, pinned) {
      const first = parent.operation === "copy_context_group" ? await obsidianGroupPort(app, port).undo(parent, pinned) : await obsidianBundlePort(app, port).undo(parent, pinned);
      const checked = await readStructuralArchiveInput(app, port, [plan.canonical.path, plan.secondary.path], undefined, first.notes);
      const deps = readArchiveDependenciesV2(app, checked.notes).dependencies;
      const rebuilt = buildArchivePlanV2({ ...checked, record: parent, recordHash: await checksum(JSON.stringify(parent)),
        entry: { id: parent.id, record: parent, damaged: false, scope: "none", issues: [], receipts: [plan.provenance.receipt] } as ArchiveParentRead["entry"], dependencies: deps },
      { status: plan.status, limitationsReviewed: plan.confirmation.limitationsReviewed, unknownDependenciesAccepted: plan.confirmation.unknownDependenciesAccepted,
        dispositions: plan.preservation.map(f => ({ range: f.range, disposition: f.disposition })) });
      requireSafe(structuralEvidence(rebuilt) === structuralEvidence(plan), "stale"); first.guard(); checked.guard(); return checked;
    },
    undo: (r, pinned) => readStructuralArchiveState(app, port, r, true, pinned),
    restored: (r, pinned) => readStructuralArchiveState(app, port, r, false, pinned),
    async observe(r, archived, previous) {
      // Foreground metadata settling only; no repeated writes, journal retries or startup repair.
      const canonical = await port.read(r.plan.canonical.path), secondary = await port.read(r.plan.secondary.path);
      requireSafe(canonical && secondary && sameSavedNote(canonical, previous[0]) && secondary.file === previous[1].file &&
        secondary.content === (archived ? r.plan.secondary.after : r.plan.secondary.before) && secondary.file.stat.ctime === r.plan.secondary.created &&
        secondary.bytes === new TextEncoder().encode(secondary.content).length, "conflict");
      const deadline = Date.now() + 2000;
      for (;;) {
        port.guard(canonical); port.guard(secondary);
        try {
          const checked = await readStructuralArchiveState(app, port, r, archived);
          requireSafe(sameSavedNote(checked.notes[0], canonical) && sameSavedNote(checked.notes[1], secondary), "conflict");
          return checked;
        } catch (error) {
          if (Date.now() >= deadline) throw error;
          await new Promise(resolve => window.setTimeout(resolve, 25));
        }
      }
    },
  };
}
