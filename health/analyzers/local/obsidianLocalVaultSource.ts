import { parseLinktext } from "obsidian";
import type { MetadataCache, TFile, Vault } from "obsidian";
import { compareStrings, isText, isTimestamp, isVaultPath } from "../../domain/validation";
import { checkpoint, isCancellation, LocalAnalysisCancelledError, throwIfAborted, withAbort } from "./cancellation";
import { boundedDiagnostics, diagnostic } from "./diagnostics";
import type { AnalyzerDiagnostic } from "../types";
import { defaultLocalVaultScope } from "./localVaultSource";
import type { LocalVaultScope, LocalVaultSource } from "./localVaultSource";
import type { LocalNoteSnapshot, LocalVaultSnapshot } from "./types";
import { createLocalVaultRevision } from "./localVaultRevision";
import type { LocalVaultFreshnessProbe, LocalVaultRevision } from "./localVaultRevision";

export const LOCAL_READ_CONCURRENCY = 8;
export interface ObsidianLocalVaultApp {
  vault: Pick<Vault, "configDir" | "getMarkdownFiles" | "read">;
  metadataCache: Pick<MetadataCache, "getFileCache" | "getFirstLinkpathDest">;
}

export class ObsidianLocalVaultSource implements LocalVaultSource, LocalVaultFreshnessProbe {
  constructor(private readonly app: ObsidianLocalVaultApp, private readonly additionalScope?: LocalVaultScope) {}

  /** Shares the exact enumeration and scope path with capture; never reads contents or metadata. */
  async captureRevision(signal: AbortSignal): Promise<LocalVaultRevision> {
    const inventory = this.captureInventory(signal);
    return createLocalVaultRevision(inventory.entries, inventory.noteListComplete);
  }

  private captureInventory(signal: AbortSignal) {
    throwIfAborted(signal);
    const scope = defaultLocalVaultScope(this.app.vault.configDir);
    const diagnostics: AnalyzerDiagnostic[] = [];
    let files: TFile[];
    try { files = this.app.vault.getMarkdownFiles(); }
    catch (error) {
      throwIfAborted(signal);
      if (isCancellation(error)) throw new LocalAnalysisCancelledError();
      throw new Error("Local Health could not obtain the Markdown note list.");
    }
    const entries: { file: TFile; path: string; basename: string; mtime: number }[] = [];
    const paths = new Set<string>();
    let noteListComplete = true;
    for (const file of files) {
      throwIfAborted(signal);
      const { path, basename } = file;
      if (!/\.md$/iu.test(path) || !scope.includes(path) || (this.additionalScope && !this.additionalScope.includes(path))) continue;
      if (!isVaultPath(path) || !isText(basename, 4096) || !isTimestamp(file.stat.mtime) || paths.has(path)) {
        noteListComplete = false;
        diagnostics.push(diagnostic("invalid-note", isVaultPath(path) ? path : undefined));
        continue;
      }
      paths.add(path);
      entries.push({ file, path, basename, mtime: file.stat.mtime });
    }
    entries.sort((a, b) => compareStrings(a.path, b.path));
    return { entries, paths, noteListComplete, diagnostics };
  }

  async capture(signal: AbortSignal): Promise<LocalVaultSnapshot> {
    const { entries, paths, noteListComplete, diagnostics } = this.captureInventory(signal);
    const notes: LocalNoteSnapshot[] = new Array<LocalNoteSnapshot>(entries.length);
    let nextIndex = 0;
    let stopped = false;
    const worker = async (): Promise<void> => {
      while (!stopped && nextIndex < entries.length) {
        throwIfAborted(signal);
        const index = nextIndex++;
        const entry = entries[index];
        let content: string | undefined;
        let contentAvailable = false;
        try {
          content = await withAbort(this.app.vault.read(entry.file), signal);
          throwIfAborted(signal);
          contentAvailable = true;
        } catch (error) {
          throwIfAborted(signal);
          if (isCancellation(error)) throw error;
          diagnostics.push(diagnostic("content-unavailable", entry.path));
        }
        let links = this.captureLinks(entry.file, entry.path, paths, signal);
        if (!links.linksAvailable) diagnostics.push(diagnostic("links-unavailable", entry.path));
        if (entry.file.path !== entry.path || entry.file.stat.mtime !== entry.mtime) {
          content = undefined;
          contentAvailable = false;
          links = { resolvedOutgoing: [], unresolvedLinks: [], linksAvailable: false };
          diagnostics.push(diagnostic("note-changed", entry.path));
        }
        notes[index] = { path: entry.path, basename: entry.basename, mtime: entry.mtime, content, contentAvailable, ...links };
        await checkpoint(signal, index + 1);
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(LOCAL_READ_CONCURRENCY, entries.length) }, () => worker()));
    } catch (error) {
      stopped = true;
      throw error;
    }
    throwIfAborted(signal);
    return {
      notes,
      coverage: {
        noteListComplete,
        contentComplete: noteListComplete && notes.every((note) => note.contentAvailable),
        linksComplete: noteListComplete && notes.every((note) => note.linksAvailable),
      },
      ...boundedDiagnostics(diagnostics),
    };
  }

  private captureLinks(file: TFile, sourcePath: string, paths: ReadonlySet<string>, signal: AbortSignal): Pick<LocalNoteSnapshot, "resolvedOutgoing" | "unresolvedLinks" | "linksAvailable"> {
    try {
      const cache = this.app.metadataCache.getFileCache(file);
      if (!cache) return { resolvedOutgoing: [], unresolvedLinks: [], linksAvailable: false };
      const outgoing = new Set<string>();
      const unresolved = new Map<string, number>();
      const references = [...(cache.links ?? []), ...(cache.embeds ?? []), ...(cache.frontmatterLinks ?? []), ...(cache.referenceLinks ?? [])];
      for (const reference of references) {
        throwIfAborted(signal);
        const target = reference.link.trim();
        // URI schemes and protocol-relative URLs are external, never vault graph edges.
        if (/^[a-z][a-z0-9+.-]*:/iu.test(target) || target.startsWith("//")) continue;
        if (!isText(target, 4096)) throw new Error("Invalid internal link target");
        const linkpath = parseLinktext(target).path;
        // A subpath-only link addresses this existing note. Anchor validation is not in v1.
        if (!linkpath) continue;
        const destination = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
        if (destination) {
          if (destination.path !== sourcePath && paths.has(destination.path)) outgoing.add(destination.path);
        } else {
          unresolved.set(target, (unresolved.get(target) ?? 0) + 1);
        }
      }
      return {
        resolvedOutgoing: [...outgoing].sort(compareStrings),
        unresolvedLinks: [...unresolved].sort(([a], [b]) => compareStrings(a, b)).map(([target, count]) => ({ target, count })),
        linksAvailable: true,
      };
    } catch (error) {
      throwIfAborted(signal);
      if (isCancellation(error)) throw error;
      return { resolvedOutgoing: [], unresolvedLinks: [], linksAvailable: false };
    }
  }
}
