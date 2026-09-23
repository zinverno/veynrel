import type { TFile, Vault } from "obsidian";
import { compareStrings, isTimestamp, isVaultPath } from "../../health/domain/validation";
import { MAX_NOTE_LENGTH, MAX_RECALL_CARDS } from "../domain/card";
import type { RecallCardCandidate, RecallExtraction } from "../domain/card";
import { isRecallPath } from "../domain/identity";
import { parseMarkdownFlashcards } from "../parser/markdownFlashcards";
import { recallCheckpoint, throwIfAborted, withRecallAbort } from "../cancellation";
import { RecallDiagnostics } from "../diagnostics";
import { RecallSourceUnavailableError } from "./types";
import type { RecallInventory, RecallSource } from "./types";

export const RECALL_READ_CONCURRENCY = 8;
export const MAX_RECALL_NOTES = 10000;
type RecallVault = Pick<Vault, "configDir" | "getMarkdownFiles" | "read">;
interface Entry { file: TFile; path: string; mtime: number; size: number }

/** Read-only public Obsidian APIs. No metadata cache, plugin registry, index or provider. */
export class ObsidianRecallSource implements RecallSource {
  constructor(private readonly vault: RecallVault) {
    if (!isVaultPath(vault.configDir)) throw new Error("Invalid Recall configuration directory.");
  }

  private includes(path: string): boolean {
    const lower = path.toLowerCase();
    const config = this.vault.configDir.toLowerCase();
    return lower !== config && !lower.startsWith(`${config}/`) &&
      !lower.split("/").slice(0, -1).some((part) => part === ".ai-backup" || part.startsWith(".ai-backup-"));
  }

  private inventory(signal: AbortSignal) {
    throwIfAborted(signal);
    let files: TFile[];
    try { files = this.vault.getMarkdownFiles(); }
    catch { throwIfAborted(signal); throw new RecallSourceUnavailableError(); }
    const diagnostics = new RecallDiagnostics();
    const entries: Entry[] = [];
    const paths = new Set<string>();
    let complete = true;
    for (const file of files) {
      throwIfAborted(signal);
      if (typeof file.path === "string" && !this.includes(file.path)) continue;
      if (!isRecallPath(file.path) || !isTimestamp(file.stat?.mtime) || !Number.isSafeInteger(file.stat.size) || file.stat.size < 0 || paths.has(file.path)) {
        complete = false; diagnostics.add("invalid-note", isRecallPath(file.path) ? file.path : undefined); continue;
      }
      paths.add(file.path);
      entries.push({ file, path: file.path, mtime: file.stat.mtime, size: file.stat.size });
    }
    entries.sort((a, b) => compareStrings(a.path, b.path));
    if (entries.length > MAX_RECALL_NOTES) { complete = false; diagnostics.add("inventory-limit"); }
    // Exact tuples avoid revision hash collisions. Include size as a cheap extra change signal.
    const revision = JSON.stringify([1, complete, entries.map(({ path, mtime, size }) => [path, mtime, size])]);
    return { entries, complete, diagnostics, revision };
  }

  async captureRevision(signal: AbortSignal): Promise<string> { return this.inventory(signal).revision; }

  async capture(signal: AbortSignal): Promise<RecallInventory> {
    const inventory = this.inventory(signal);
    const { diagnostics } = inventory;
    const entries = inventory.entries.slice(0, MAX_RECALL_NOTES);
    const cards: RecallCardCandidate[] = [];
    let complete = inventory.complete;
    let notesRead = 0;
    // Fixed batches keep both read concurrency and retained note bodies bounded; merge in path order.
    for (let offset = 0; offset < entries.length; offset += RECALL_READ_CONCURRENCY) {
      throwIfAborted(signal);
      const batch = await Promise.all(entries.slice(offset, offset + RECALL_READ_CONCURRENCY).map((entry) => this.readNote(entry, signal)));
      for (const note of batch) {
        notesRead += Number(note.read);
        complete = complete && note.complete;
        diagnostics.merge(note);
        for (const card of note.cards) {
          if (cards.length === MAX_RECALL_CARDS) { complete = false; diagnostics.add("card-limit"); break; }
          cards.push(card);
        }
      }
      if (cards.length === MAX_RECALL_CARDS && offset + batch.length < entries.length) {
        complete = false; diagnostics.add("card-limit"); break;
      }
      await recallCheckpoint(signal, offset + batch.length);
    }
    throwIfAborted(signal);
    return Object.freeze({ cards: Object.freeze(cards), complete, ...diagnostics.result(), revision: inventory.revision,
      coverage: Object.freeze({ notesSeen: inventory.entries.length, notesRead, noteListComplete: inventory.complete }) });
  }

  private async readNote(entry: Entry, signal: AbortSignal): Promise<RecallExtraction & { read: boolean }> {
    const unavailable = (code: "note-changed" | "oversized-note" | "content-unavailable") =>
      ({ cards: [], complete: false, diagnostics: [{ code, path: entry.path }], diagnosticsTruncated: 0, read: false });
    const changed = () => entry.file.path !== entry.path || entry.file.stat.mtime !== entry.mtime || entry.file.stat.size !== entry.size;
    throwIfAborted(signal);
    if (changed()) return unavailable("note-changed");
    if (entry.size > MAX_NOTE_LENGTH) return unavailable("oversized-note");
    let content: string;
    try { content = await withRecallAbort(this.vault.read(entry.file), signal); }
    catch { throwIfAborted(signal); return unavailable("content-unavailable"); }
    throwIfAborted(signal);
    if (changed()) return unavailable("note-changed");
    const extracted = await parseMarkdownFlashcards(entry.path, content, signal);
    if (changed()) return unavailable("note-changed");
    return { ...extracted, read: true };
  }
}
