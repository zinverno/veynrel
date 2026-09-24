import { MarkdownView, TFile } from "obsidian";
import type { App } from "obsidian";
import { PROVIDER_PROFILES } from "./constants";
import { validateLanguageModelSettings } from "./deep/product/validateLanguageModelSettings";
import { sameLanguageModelConnection } from "./deep/product/languageModelSettingsPort";
import type { LanguageModelSettingsPort, LanguageModelSettingsSnapshot } from "./deep/product/languageModelSettingsPort";
import { NoteWriteConflictError, replaceNoteIfUnchanged } from "./noteWrites";
import { MAX_NOTE_LENGTH } from "./recall/domain/card";
import { isRecallSourcePath } from "./recall/source/obsidianRecallSource";
import type { RecallProductPort } from "./recall/product/types";
import type { RecallAuthoringPort, RecallAuthoringResult, RecallAuthoringSnapshot } from "./recall/product/recallAuthoringPort";

/** UTF-16 characters sent by the authoritative producer, including legacy/batch calls. */
export const MAX_FLASHCARD_INPUT_LENGTH = 32_000;

export function resolveFlashcardNote(app: App, path: unknown): TFile | undefined {
  if (!isRecallSourcePath(path, app.vault.configDir)) return undefined;
  const file = app.vault.getFileByPath(path);
  return file instanceof TFile && file.path === path && file.extension.toLowerCase() === "md" ? file : undefined;
}

/** Host bridge only. Generation is injected from the existing plugin producer. */
export class RecallAuthoringAdapter implements RecallAuthoringPort {
  private state: RecallAuthoringSnapshot["state"] = "idle";
  private result?: RecallAuthoringResult;
  private confirmation?: { file: TFile; path: string; settings: LanguageModelSettingsSnapshot };
  private operationPath?: string;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  private readonly cleanup: (() => void)[];

  constructor(private readonly app: App, private readonly settings: LanguageModelSettingsPort,
    private readonly recall: RecallProductPort,
    private readonly build: (content: string, settings: LanguageModelSettingsSnapshot) => Promise<{ newContent: string; cardCount: number }>) {
    this.cleanup = [settings.subscribe(() => { this.cancelConfirmation(); this.notify(); })];
    const changed = () => {
      if (this.confirmation && this.currentNote() !== this.confirmation.file) this.cancelConfirmation();
      this.notify();
    };
    const refs = [app.workspace.on("active-leaf-change", changed), app.workspace.on("file-open", changed), app.workspace.on("layout-change", changed)];
    this.cleanup.push(() => refs.forEach((ref) => app.workspace.offref(ref)));
  }

  private get busy(): boolean { return this.state === "generating" || this.state === "ingesting"; }

  private configured(): boolean {
    try {
      const settings = this.settings.get();
      return Object.prototype.hasOwnProperty.call(PROVIDER_PROFILES, settings.provider) && validateLanguageModelSettings(settings) === null;
    } catch { return false; }
  }

  private resolve(path: unknown): TFile | undefined {
    return resolveFlashcardNote(this.app, path);
  }

  private currentNote(): TFile | undefined {
    // Obsidian supplies the current/recent file. It must still be open in a Markdown view;
    // never retain our own last-note cache or choose an arbitrary open note.
    const file = this.app.workspace.getActiveFile();
    return file && this.resolve(file.path) === file && this.app.workspace.getLeavesOfType("markdown").some((leaf) =>
      leaf.view instanceof MarkdownView && leaf.view.file === file) ? file : undefined;
  }

  getSnapshot(): RecallAuthoringSnapshot {
    const provider = this.confirmation?.settings.provider ?? this.settings.get().provider;
    const sourcePath = this.confirmation?.path ?? (this.busy ? this.operationPath : this.currentNote()?.path);
    // A completed result belongs to its source, including when the user switched notes while it was pending.
    const result = sourcePath === this.operationPath ? this.result : undefined;
    return { state: this.result && !result ? "idle" : this.state, configured: this.configured(), sourcePath,
      local: provider === "ollama", providerLabel: PROVIDER_PROFILES[provider]?.label ?? "",
      inputLimit: MAX_FLASHCARD_INPUT_LENGTH,
      result: result ? { ...result } : undefined };
  }

  requestGeneration(): void {
    if (this.disposed || this.busy || this.recall.getSnapshot().session) return;
    const file = this.currentNote();
    if (!this.configured() || !file) return;
    this.confirmation = { file, path: file.path, settings: { ...this.settings.get() } };
    this.state = "confirming"; this.result = undefined; this.notify();
  }

  cancelConfirmation(): void {
    if (this.state !== "confirming") return;
    this.confirmation = undefined; this.state = "idle"; this.notify();
  }

  async generate(): Promise<RecallAuthoringResult | undefined> {
    const consent = this.confirmation;
    if (this.disposed || this.state !== "confirming" || !consent) return;
    this.confirmation = undefined;
    this.operationPath = consent.path;
    if (this.currentNote() !== consent.file || this.resolve(consent.path) !== consent.file) {
      return this.finish({ status: "error", reason: "source-unavailable" });
    }
    if (!sameLanguageModelConnection(consent.settings, this.settings.get())) return this.finish({ status: "error", reason: "unconfigured" });
    return this.generateForNote(consent.file);
  }

  /** Existing command/context actions already express generation intent. They share this exact write/ingest path. */
  async generateForNote(file: TFile): Promise<RecallAuthoringResult | undefined> {
    if (this.disposed || this.busy) return;
    this.confirmation = undefined;
    this.operationPath = file.path;
    if (!this.configured()) return this.finish({ status: "error", reason: "unconfigured" });
    const path = file.path;
    if (this.resolve(path) !== file || !Number.isSafeInteger(file.stat.size) || file.stat.size < 0 || file.stat.size > MAX_NOTE_LENGTH) {
      return this.finish({ status: "error", reason: "source-unavailable" });
    }
    const settings = { ...this.settings.get() };
    this.state = "generating"; this.result = undefined; this.operationPath = path; this.notify();
    let content: string;
    try { content = await this.app.vault.read(file); }
    catch { return this.finish({ status: "error", reason: "source-unavailable" }); }
    if (this.disposed || this.resolve(path) !== file || content.length > MAX_NOTE_LENGTH) return this.finish({ status: "error", reason: "source-unavailable" });
    let generated: { newContent: string; cardCount: number };
    try { generated = await this.build(content, settings); }
    catch { return this.finish({ status: "error", reason: "generation-failed" }); }
    if (this.disposed) return this.finish({ status: "error", reason: "source-unavailable" });
    try { await replaceNoteIfUnchanged(this.app.vault, file, path, content, generated.newContent); }
    catch (error) { return this.finish({ status: "error", reason: error instanceof NoteWriteConflictError ? "conflict" : "markdown-save-failed" }); }
    this.state = "ingesting"; this.notify();
    const updated = await this.ingestNote(path);
    return this.finish(updated === "updated" ? { status: "success", cardCount: generated.cardCount }
      : { status: "partial", cardCount: generated.cardCount, reason: "recall-update-failed", needsRecovery: updated === "blocked" });
  }

  /** Used once per successfully changed batch path after its Markdown writes. Never scans the vault. */
  async ingestNote(path: string): Promise<"updated" | "blocked" | "failed"> {
    if (this.disposed) return "blocked";
    try { return await this.recall.refreshNote(path); } catch { return "failed"; }
  }

  private finish(result: RecallAuthoringResult): RecallAuthoringResult {
    this.result = result; this.state = result.status === "error" ? "error" : "success";
    this.notify(); return { ...result };
  }
  subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  dispose(): void { this.disposed = true; this.confirmation = undefined; this.cleanup.forEach((cleanup) => cleanup()); this.listeners.clear(); }
  private notify(): void { if (!this.disposed) for (const listener of [...this.listeners]) { try { listener(); } catch { /* Presentation cannot fail writes. */ } } }
}
