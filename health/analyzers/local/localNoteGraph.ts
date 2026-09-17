import { compareStrings, isText, isTimestamp, isVaultPath } from "../../domain/validation";
import { checkpoint } from "./cancellation";
import type { LocalAnalysisContext, LocalNoteSnapshot, LocalVaultSnapshot } from "./types";

export function contentCoverageComplete(snapshot: LocalVaultSnapshot): boolean {
  return snapshot.coverage.noteListComplete && snapshot.coverage.contentComplete &&
    snapshot.notes.every((note) => note.contentAvailable && typeof note.content === "string");
}

/** Canonicalize and freeze owned copies. Even an analyzer that throws cannot edit shared input. */
export async function createLocalAnalysisContext(input: LocalVaultSnapshot, signal: AbortSignal): Promise<LocalAnalysisContext> {
  const notes: LocalNoteSnapshot[] = [];
  const knownPaths = new Set<string>();
  for (const [index, note] of input.notes.entries()) {
    await checkpoint(signal, index);
    if (!isVaultPath(note.path) || !/\.md$/iu.test(note.path) || !isText(note.basename, 4096) ||
        note.basename !== note.path.slice(note.path.lastIndexOf("/") + 1, -3) || !isTimestamp(note.mtime) || knownPaths.has(note.path) ||
        typeof note.linksAvailable !== "boolean" || typeof note.contentAvailable !== "boolean" ||
        (note.contentAvailable && typeof note.content !== "string") ||
        !note.resolvedOutgoing.every(isVaultPath) || !note.unresolvedLinks.every((link) =>
          isText(link.target, 4096) && link.target === link.target.trim() && Number.isSafeInteger(link.count) && link.count > 0)) {
      throw new Error("Invalid local vault snapshot");
    }
    knownPaths.add(note.path);
    notes.push(Object.freeze({ ...note, content: note.contentAvailable ? note.content : undefined,
      resolvedOutgoing: Object.freeze([...new Set(note.resolvedOutgoing)].sort(compareStrings)),
      unresolvedLinks: Object.freeze(note.unresolvedLinks.map((link) => Object.freeze({ ...link })).sort((a, b) => compareStrings(a.target, b.target))),
    }));
  }
  notes.sort((a, b) => compareStrings(a.path, b.path));
  const snapshot: LocalVaultSnapshot = Object.freeze({ ...input, notes: Object.freeze(notes), coverage: Object.freeze({ ...input.coverage }),
    diagnostics: Object.freeze(input.diagnostics.map((item) => Object.freeze({ ...item }))),
  });
  const incoming = new Map(notes.map((note) => [note.path, new Set<string>()]));
  const outgoing = new Map(notes.map((note) => [note.path, new Set<string>()]));
  let processed = 0;
  for (const note of notes) {
    await checkpoint(signal, processed++);
    if (!note.linksAvailable) continue;
    for (const target of note.resolvedOutgoing) {
      await checkpoint(signal, processed++);
      if (target === note.path || !knownPaths.has(target)) continue;
      outgoing.get(note.path)!.add(target);
      incoming.get(target)!.add(note.path);
    }
  }
  const materialize = (edges: Map<string, Set<string>>): Readonly<Record<string, readonly string[]>> =>
    Object.freeze(Object.fromEntries([...edges].map(([path, neighbors]) => [path, Object.freeze([...neighbors].sort(compareStrings))])));
  return Object.freeze({ snapshot, graph: Object.freeze({ paths: Object.freeze(notes.map((note) => note.path)), incoming: materialize(incoming), outgoing: materialize(outgoing),
    complete: snapshot.coverage.noteListComplete && snapshot.coverage.linksComplete && notes.every((note) => note.linksAvailable),
  }) });
}
