import { MarkdownView, TFolder, type App, type TFile, type WorkspaceLeaf, type FileView } from "obsidian";
import type { AIHubSettings } from "../settings";
import { callOpenRouter, validateSettings } from "../api";
import { extractJSON, smartTruncate } from "../deepAudit";
import { MAX_TOKENS_AUDIT, STREAM_CONTEXT_MAX_CHARS } from "../constants";
import { currentLanguage, t, tAll } from "../i18n";
import { languageModelSettingsSnapshot, type LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import { readSavedNote, sameSavedNote, type SavedNote } from "../consolidation/savedNote";
import { atomKey, validateAtomizationPath } from "../consolidation/atomizationPlan";
import { guardSavedEditors } from "../consolidation/obsidianSafeApply";
import { replaceNoteIfUnchanged } from "../noteWrites";
import { sanitizeFileName, noteToWikiLink } from "../utils/noteNames";

type Failure = "stale" | "path" | "occupied" | "editor" | "response" | "cancelled" | "write" | "already" | "settings" | "unsaved";
export class GenerationError extends Error { constructor(readonly reason: Failure) { super(reason); } }
function requireGeneration(value: unknown, reason: Failure): asserts value { if (!value) throw new GenerationError(reason); }
export interface AtomProposal { readonly id: number; readonly title: string; readonly path: string; readonly content: string }
export interface AtomWritePlan { readonly proposals: readonly AtomProposal[]; readonly addition: string; readonly after: string }
const writers = new WeakSet<App>();

/** Generative legacy workflow, not the strict extraction planner or its Apply/Undo protocol. */
export class GenerativeAtomization {
  private readonly settings: string;
  private readonly language = currentLanguage();
  readonly model: Readonly<LanguageModelSettingsSnapshot>;
  readonly system = t("@atomize_prompt");
  readonly user: string;
  readonly folder: string;
  private readonly folders = new Map<string, TFolder | null>();
  private readonly abort = new AbortController();
  private generated = false;
  private proposals: readonly AtomProposal[] = [];
  private plan?: AtomWritePlan;
  private readonly created = new Map<string, SavedNote>();
  private writing = false;
  private stopped = false;
  private completed = false;
  private uncertain?: string;
  private constructor(private readonly app: App, private readonly getSettings: () => AIHubSettings, readonly source: SavedNote) {
    const settings = getSettings();
    this.model = Object.freeze(languageModelSettingsSnapshot(settings));
    this.settings = JSON.stringify({ model: this.model, location: settings.atomsLocation, folder: settings.atomsFolder });
    this.user = smartTruncate(source.content, STREAM_CONTEXT_MAX_CHARS);
    this.folder = settings.atomsLocation === "folder" ? settings.atomsFolder.replace(/\/+$/, "") || "Atoms" : source.path.split("/").slice(0, -1).join("/");
  }
  static async prepare(app: App, getSettings: () => AIHubSettings, file: TFile): Promise<GenerativeAtomization> {
    const source = await readSavedNote(app, file.path);
    requireGeneration(source.state === "ready" && source.file === file, "stale");
    requireGeneration(!tAll("## Атомарные заметки").some(h => source.content.includes(h)), "already");
    const session = new GenerativeAtomization(app, getSettings, Object.freeze(source));
    session.checkPath(`${session.folder ? session.folder + "/" : ""}Atom.md`);
    let path = "";
    for (const part of session.folder.split("/").filter(Boolean)) {
      path = path ? `${path}/${part}` : part;
      const entry = app.vault.getAbstractFileByPath(path);
      requireGeneration(!entry || entry instanceof TFolder, "path");
      requireGeneration(!!entry || !await app.vault.adapter.exists(path), "occupied");
      session.folders.set(path, entry);
    }
    return session;
  }
  get connectionError(): string | null { return validateSettings(this.model); }
  get createdPaths(): string[] { return [...this.created.keys()]; }
  get uncertainPath(): string | undefined { return this.uncertain; }
  get done(): boolean { return this.completed; }
  cancel(): void { this.stopped = true; this.abort.abort(); }
  private checkPath(path: string): void {
    try { validateAtomizationPath(path, this.app.vault.configDir); } catch { throw new GenerationError("path"); }
  }
  private async fresh(writing = false): Promise<void> {
    requireGeneration(!this.stopped, "cancelled");
    const settings = this.getSettings();
    requireGeneration(this.language === currentLanguage() && this.settings === JSON.stringify({ model: languageModelSettingsSnapshot(settings), location: settings.atomsLocation, folder: settings.atomsFolder }), "stale");
    const source = await readSavedNote(this.app, this.source.path);
    requireGeneration(source.state === "ready" && sameSavedNote(source, this.source), "stale");
    if (writing) {
      try { guardSavedEditors(this.app, [this.source, ...this.created.values()]); } catch { throw new GenerationError("editor"); }
    }
    requireGeneration(!this.stopped, "cancelled");
  }
  /** Explicit UI action only: never close or discard an unsaved buffer. */
  async closeSavedTabs(): Promise<void> {
    await this.fresh();
    const notes = [this.source, ...this.created.values()], leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      // Backlinks/outline also reference files; only native Markdown tabs are closed here.
      if (!(leaf.view instanceof MarkdownView)) return;
      const loaded = (leaf.view as Partial<FileView>).file;
      const note = notes.find(n => leaf.getViewState().state?.file === n.path || loaded === n.file || loaded?.path === n.path);
      if (!note) return;
      requireGeneration(leaf.view.getViewData() === note.content, "unsaved");
      leaves.push(leaf);
    });
    for (const leaf of leaves) leaf.detach();
  }
  async generate(): Promise<readonly AtomProposal[]> {
    requireGeneration(!this.generated && !this.connectionError, "settings");
    this.generated = true; // One request per consent, including failed or cancelled calls.
    await this.fresh();
    const raw = await callOpenRouter(this.model, this.system, this.user, { maxTokens: MAX_TOKENS_AUDIT, signal: this.abort.signal, requireFinishReason: true });
    await this.fresh();
    let parsed: unknown;
    try { parsed = extractJSON<unknown>(raw); } catch { throw new GenerationError("response"); }
    const atoms = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" && "atoms" in parsed ? parsed.atoms : null;
    requireGeneration(Array.isArray(atoms) && atoms.length <= 8, "response");
    const taken = new Set(this.app.vault.getAllLoadedFiles().map(f => atomKey(f.path)));
    const iso = new Date().toISOString();
    const proposals: AtomProposal[] = [];
    for (const [id, value] of (atoms as unknown[]).entries()) {
      requireGeneration(value && typeof value === "object" && "title" in value && "body" in value && typeof value.title === "string" && typeof value.body === "string", "response");
      const title = value.title.replace(/\s+/g, " ").trim(), body = value.body.trim();
      requireGeneration(title && body, "response");
      const base = sanitizeFileName(title) || "Atom";
      let path = "";
      for (let n = 1; n <= 1000; n++) {
        path = `${this.folder ? this.folder + "/" : ""}${base}${n === 1 ? "" : `-${n}`}.md`;
        this.checkPath(path);
        if (!taken.has(atomKey(path)) && !await this.app.vault.adapter.exists(path)) break;
        requireGeneration(n < 1000, "occupied");
      }
      taken.add(atomKey(path));
      proposals.push(Object.freeze({ id, title, path, content: t("@atom_note", { iso, title, body }) }));
    }
    await this.fresh();
    this.proposals = Object.freeze(proposals);
    return this.proposals;
  }
  async review(ids: readonly number[]): Promise<AtomWritePlan> {
    requireGeneration(!this.writing && !this.completed, "stale");
    const selected = this.proposals.filter(p => ids.includes(p.id));
    requireGeneration(selected.length > 0 && selected.length === new Set(ids).size, "response");
    requireGeneration(this.created.size === 0 || this.plan?.proposals.every(p => ids.includes(p.id)) && this.plan.proposals.length === selected.length, "stale");
    const eol = this.source.content.includes("\r\n") ? "\r\n" : "\n";
    const addition = `${this.source.content.endsWith(eol + eol) ? "" : this.source.content.endsWith(eol) ? eol : eol + eol}${t("## Атомарные заметки")}${eol}${eol}${selected.map(p => `- ${noteToWikiLink(p.path)}`).join(eol)}${eol}`;
    const plan = Object.freeze({ proposals: Object.freeze(selected), addition, after: this.source.content + addition });
    await this.check(plan);
    this.plan = plan;
    return plan;
  }
  private async check(plan: AtomWritePlan): Promise<void> {
    await this.fresh(true);
    requireGeneration(!this.uncertain, "write");
    for (const [path, expected] of this.folders) {
      const actual = this.app.vault.getAbstractFileByPath(path);
      requireGeneration(actual === expected && (!!actual || !await this.app.vault.adapter.exists(path)), "stale");
    }
    const inventory = this.app.vault.getAllLoadedFiles();
    for (const p of plan.proposals) {
      const created = this.created.get(p.path);
      if (created) {
        const actual = await readSavedNote(this.app, p.path);
        requireGeneration(actual.state === "ready" && sameSavedNote(actual, created), "stale");
      } else {
        requireGeneration(!inventory.some(f => atomKey(f.path) === atomKey(p.path)) && !await this.app.vault.adapter.exists(p.path), "occupied");
      }
    }
    await this.fresh(true);
  }
  async apply(plan: AtomWritePlan): Promise<void> {
    requireGeneration(plan === this.plan && !this.writing && !this.completed && !writers.has(this.app), "stale");
    this.writing = true; writers.add(this.app);
    try {
      await this.check(plan);
      for (const [path, folder] of this.folders) if (!folder) {
        await this.fresh(true);
        requireGeneration(!this.app.vault.getAbstractFileByPath(path) && !await this.app.vault.adapter.exists(path), "occupied");
        this.folders.set(path, await this.app.vault.createFolder(path));
      }
      for (const p of plan.proposals) if (!this.created.has(p.path)) {
        await this.check(plan);
        // shortcut: public Vault.create has no cross-process exclusive-create contract; no external-writer atomicity or rollback is promised.
        this.uncertain = p.path;
        const file = await this.app.vault.create(p.path, p.content);
        const read = await readSavedNote(this.app, p.path);
        requireGeneration(read.state === "ready" && read.file === file && read.content === p.content, "write");
        this.created.set(p.path, Object.freeze(read)); this.uncertain = undefined;
      }
      await this.check(plan);
      this.uncertain = this.source.path;
      await replaceNoteIfUnchanged(this.app.vault, this.source.file, this.source.path, this.source.content, plan.after);
      const after = await readSavedNote(this.app, this.source.path);
      requireGeneration(after.state === "ready" && after.file === this.source.file && after.content === plan.after, "write");
      this.uncertain = undefined; this.completed = true;
    } finally { this.writing = false; writers.delete(this.app); }
  }
  /** A failed create can be retried only after absence is confirmed; ambiguous writes remain visible. */
  async retryReview(plan: AtomWritePlan): Promise<AtomWritePlan> {
    if (this.uncertain && this.uncertain !== this.source.path && !this.app.vault.getAbstractFileByPath(this.uncertain) && !await this.app.vault.adapter.exists(this.uncertain)) this.uncertain = undefined;
    return this.review(plan.proposals.map(p => p.id));
  }
}
