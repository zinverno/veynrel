import { MarkdownView, type App, type Editor, type EditorSelection, type TFile, type WorkspaceLeaf } from "obsidian";

/** Transient only. Never serialized, logged, or re-resolved from the active editor. */
export interface EditorSource {
  readonly document: Document; readonly window: Window; readonly leaf: WorkspaceLeaf;
  readonly view: MarkdownView; readonly editor: Editor; readonly file: TFile; readonly path: string;
  readonly mode: string; readonly original: string; readonly selection: string;
  readonly ranges: readonly EditorSelection[]; readonly from: number; readonly to: number;
  current(): boolean;
  supportsNativeEdit(): Promise<boolean>;
}
export function captureEditorSource(app: App, leaf: WorkspaceLeaf | undefined, doc: Document, alive: () => boolean): EditorSource | undefined {
  const view = leaf?.view;
  if (!(view instanceof MarkdownView) || !view.file || !view.editor || view.containerEl.ownerDocument !== doc || !doc.defaultView) return;
  const editor = view.editor, file = view.file, path = file.path, mode = view.getMode(), original = editor.getValue(), mtime = file.stat.mtime;
  const ranges = editor.listSelections().map(r => ({ anchor: { ...r.anchor }, head: { ...r.head } }));
  const range = ranges[0], start = range ? editor.posToOffset(range.anchor) : 0, end = range ? editor.posToOffset(range.head) : 0;
  const selected = mode === "source" && start !== end;
  const from = selected ? Math.min(start, end) : 0, to = selected ? Math.max(start, end) : original.length;
  return { document: doc, window: doc.defaultView, leaf: leaf!, view, editor, file, path, mode, original,
    selection: selected ? original.slice(from, to) : "", ranges, from, to,
    supportsNativeEdit: async () => {
      // The native editor normalizes CRLF on save; refuse instead of changing bytes outside the range.
      const saved = await app.vault.read(file);
      return !saved.includes("\r") && (!saved.startsWith("\uFEFF") || original.startsWith("\uFEFF"));
    },
    current: () => alive() && !doc.defaultView?.closed && view.containerEl.isConnected &&
      view.containerEl.ownerDocument === doc && app.workspace.getLeavesOfType("markdown").includes(leaf!) && leaf!.view === view &&
      view.file === file && file.path === path && app.vault.getFileByPath(path) === file && file.stat.mtime === mtime &&
      view.editor === editor && view.getMode() === mode && editor.getValue() === original,
  };
}
