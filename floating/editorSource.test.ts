import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ MarkdownView: class {}, setIcon: vi.fn(), getLanguage: () => "en" }));
import { MarkdownView, type App, type WorkspaceLeaf } from "obsidian";
import { captureEditorSource } from "./editorSource";
import { floatingPreferences } from "./floatingPanel";
function fixture() {
  const doc = { defaultView: { closed: false } } as unknown as Document;
  const file = { path: "A.md", stat: { mtime: 1 } };
  let text = "Outside [selected] end", leafOpen = true, alive = true;
  const editor = { getValue: () => text, listSelections: () => [{ anchor: { line: 0, ch: 9 }, head: { line: 0, ch: 17 } }], posToOffset: (p: { ch: number }) => p.ch };
  const view = Object.assign(new MarkdownView({} as never), { editor, file, getMode: () => "source", containerEl: { ownerDocument: doc, isConnected: true } });
  const leaf = { view } as unknown as WorkspaceLeaf;
  const app = { vault: { getFileByPath: () => file }, workspace: { getLeavesOfType: () => leafOpen ? [leaf] : [] } } as unknown as App;
  const source = captureEditorSource(app, leaf, doc, () => alive)!;
  return { source, doc, file, view, leaf, app, text: (next: string) => { text = next; }, close: () => { leafOpen = false; }, disable: () => { alive = false; } };
}
describe("document-owned captured source", () => {
  it("captures exact ranges and selection before focus loss without reading the vault", () => { const f = fixture(); expect(f.source.selection).toBe("selected"); expect(f.source.from).toBe(9); expect(f.source.to).toBe(17); expect(f.source.current()).toBe(true); });
  it.each(["edit", "rename", "revision", "closed", "disable", "window", "canvas"])("rejects %s without guessing another file", change => {
    const f = fixture();
    if(change === "edit") f.text("Changed"); else if(change === "rename") f.file.path = "B.md"; else if(change === "revision") f.file.stat.mtime++;
    else if(change === "closed") f.close(); else if(change === "disable") f.disable(); else if(change === "window") Object.assign(f.doc.defaultView!, { closed: true });
    else Object.assign(f.leaf, { view: {} });
    expect(f.source.current()).toBe(false);
  });
  it("does not accept an editor from another document or a non-Markdown view", () => {
    const f = fixture(); expect(captureEditorSource(f.app, f.leaf, {} as Document, () => true)).toBeUndefined();
    expect(captureEditorSource(f.app, { view: {} } as WorkspaceLeaf, f.doc, () => true)).toBeUndefined();
  });
  it("stores only a default-OFF flag and finite clamped position", () => {
    expect(floatingPreferences()).toEqual({ enabled: false, x: 1, y: 1 });
    expect(floatingPreferences({ enabled: true, x: NaN, y: -20 })).toEqual({ enabled: true, x: 1, y: 0 });
    expect(floatingPreferences({ x: Infinity, y: 3, text: "PRIVATE" } as never)).toEqual({ enabled: false, x: 1, y: 1 });
  });
});
