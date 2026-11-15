import type { App } from "obsidian";
import type { SafeApplyPort } from "./safeApply";
import { readSavedNote, sameSavedNote } from "./savedNote";
import type { SavedNote } from "./savedNote";
import { localSource } from "./obsidianLocalNote";
import { localBytes, localPath } from "./localNotePlan";
import { requireSafe } from "./operationJournal";
import { ORGANIZATION_DOCUMENT_LIMIT, parseOrganizationDocument } from "./organizationProfile";
import { buildRegistryPlan, validateRegistryPlan } from "./registryPlan";
import type { RegistryChoice, RegistryPlan } from "./registryPlan";
import type { RegistryRecord } from "./registryJournal";
import type { OrganizationRegistry } from "./organizationRegistry";

export interface RegistryCheck { notes: SavedNote[]; guard(): void }
export interface RegistryPort {
  check(plan: RegistryPlan, pinned?: readonly SavedNote[]): Promise<RegistryCheck>;
  undo(record: RegistryRecord, pinned?: readonly SavedNote[]): Promise<RegistryCheck>;
  committed(note: SavedNote): Promise<void>;
}
/** Reads only the connected saved registry. No metadata inference or settings fallback. */
export class ObsidianRegistry implements RegistryPort {
  constructor(private readonly app: App, private readonly port: SafeApplyPort, private readonly registry: () => OrganizationRegistry) {}
  async read(): Promise<SavedNote> {
    const path = this.registry().path; requireSafe(path && localPath(path), "stale");
    const file = this.app.vault.getFileByPath(path), created = file?.stat.ctime;
    requireSafe(file && file.stat.size <= ORGANIZATION_DOCUMENT_LIMIT * 4, "stale");
    const note = await readSavedNote(this.app, path);
    requireSafe(note.state === "ready" && note.file === file && file.stat.ctime === created &&
      note.bytes === localBytes(note.content) && !note.content.startsWith("\uFEFF"), "stale");
    parseOrganizationDocument(note.content); this.guard(note, created); return note;
  }
  private guard(note: SavedNote, created: number): void {
    requireSafe(this.registry().path === note.path && note.file.stat.ctime === created, "stale"); this.port.guard(note);
  }
  async plan(note: SavedNote, choice: RegistryChoice): Promise<RegistryPlan> {
    const plan = buildRegistryPlan(localSource(note), choice); await this.check(plan, [note]); return plan;
  }
  async check(plan: RegistryPlan, pinned?: readonly SavedNote[]): Promise<RegistryCheck> {
    validateRegistryPlan(plan); const note = await this.read();
    requireSafe(JSON.stringify(localSource(note)) === JSON.stringify(plan.source) && (!pinned || sameSavedNote(note, pinned[0])), "stale");
    const guard = () => this.guard(note, plan.source.created); guard(); return { notes: [note], guard };
  }
  async undo(record: RegistryRecord, pinned?: readonly SavedNote[]): Promise<RegistryCheck> {
    const note = await this.read();
    requireSafe(note.path === record.plan.source.path && note.content === record.plan.after && note.file.stat.ctime === record.plan.source.created &&
      (!pinned || sameSavedNote(note, pinned[0])), "conflict");
    const guard = () => this.guard(note, record.plan.source.created); guard(); return { notes: [note], guard };
  }
  async committed(note: SavedNote): Promise<void> { await this.registry().refreshAfterWrite(note); }
}
