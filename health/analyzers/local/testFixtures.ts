import type { LocalNoteSnapshot, LocalVaultSnapshot } from "./types";

export function note(path: string, overrides: Partial<LocalNoteSnapshot> = {}): LocalNoteSnapshot {
  return { path, basename: path.slice(path.lastIndexOf("/") + 1, -3), mtime: 100, content: "A useful note containing substantially more than thirty two meaningful characters.",
    contentAvailable: true, resolvedOutgoing: [], unresolvedLinks: [], linksAvailable: true, ...overrides };
}

export function snapshot(notes: readonly LocalNoteSnapshot[], coverage: Partial<LocalVaultSnapshot["coverage"]> = {}): LocalVaultSnapshot {
  return { notes, coverage: { noteListComplete: true, contentComplete: true, linksComplete: true, ...coverage }, diagnostics: [], diagnosticsTruncated: 0 };
}
