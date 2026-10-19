import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    closest() { return null; }
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; }
    create(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) { const e = new Element(); e.tag = tag; e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; this.children.push(e); return e; }
    createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    focus() {}
    querySelector() { return this.all().find(e => e.attrs.role === "alert") ?? this.all().find(e => e.attrs.role === "status") ?? this.all().find(e => e.tag === "h3"); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    action(key: string) { return this.all().find(e => e.attrs["data-archive-apply-action"] === key); }
    click() { this.listeners.get("click")?.(); }
  }
  class Modal { constructor(readonly app: unknown) {} contentEl = new Element(); modalEl = new Element(); titleEl = new Element(); onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); } }
  return { Element, Modal };
});
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Test-only native YAML substitute.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { TFile: class {}, MarkdownView: class {}, Modal: mocks.Modal, parseYaml: (s: string) => yaml.load(s), getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s.split("#")[0] }) };
});
import { ArchiveApplyModal, renderArchiveHistory } from "./archiveApplyModal";
import type { ArchiveApply } from "./archiveApply";
import { archiveApplyFixture } from "../tests/archiveApplyFixture";
import { setLanguage } from "../i18n";
function eventApp() { const listeners = new Map<string, () => void>(); const events = { on: (name: string, fn: () => void) => { listeners.set(name, fn); return name; }, offref: (name: string) => listeners.delete(name) }; return { vault: events, metadataCache: events, workspace: events }; }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
async function fixture() {
  const f = await archiveApplyFixture(), review = await f.review(), service = { execute: vi.fn(async () => {}), discard: vi.fn() }, history = vi.fn();
  const prepare = vi.fn(async (_current: () => boolean) => review), modal = new ArchiveApplyModal(eventApp() as never, service as unknown as ArchiveApply, prepare, history);
  return { ...f, modal, service, prepare, review, history, root: modal.contentEl as unknown as InstanceType<typeof mocks.Element> };
}
describe("separate archive consent", () => {
  it.each(["ru", "en"] as const)("%s shows complete sources, parent provenance, each disposition and limits before dispatch", async language => {
    setLanguage(language); const f = await fixture(), before = new Map(f.disk); f.modal.open(); await flush(); const p = f.review.record.plan;
    expect(f.root.all().filter(e => e.attrs["data-archive-apply-text"]).map(e => e.text)).toEqual([p.secondary.before, p.secondary.after, p.canonical.content, ...p.preservation.map(x => x.range.text)]);
    const text = f.root.all().map(e => e.text).join("\n"); expect(text).toContain(p.provenance.id); expect(text).toContain(p.secondary.path); expect(text).toContain(p.canonical.path);
    expect(text).not.toMatch(/@archive/); expect(f.disk).toEqual(before); expect(f.vault.process).not.toHaveBeenCalled(); expect(f.service.execute).not.toHaveBeenCalled();
    f.root.action("confirm")!.click(); await flush(); expect(f.service.execute).toHaveBeenCalledExactlyOnceWith(f.review);
  });
  it("cancel closes consent, late review is discarded and double click dispatches once", async () => {
    const f = await fixture(); let done!: () => void;
    f.prepare.mockImplementationOnce(() => new Promise(resolve => { done = () => resolve(f.review); }));
    f.modal.open(); f.modal.close(); done(); await flush(); expect(f.service.discard).toHaveBeenCalledWith(f.review); expect(f.service.execute).not.toHaveBeenCalled();
    const g = await fixture(); g.modal.open(); await flush(); g.service.execute.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    const confirm = g.root.action("confirm")!; confirm.click(); confirm.click(); g.modal.close(); done(); await flush();
    expect(g.service.execute).toHaveBeenCalledTimes(1); expect(g.root.children).toHaveLength(0);
  });
  it("Undo reverses secondary only and history distinguishes recovered, damaged and parent chain states", async () => {
    const f = await fixture(); f.prepare.mockResolvedValueOnce({ ...f.review, action: "undo" }); f.modal.open(); await flush(); const p = f.review.record.plan;
    expect(f.root.all().filter(e => ["before", "after", "canonical"].includes(e.attrs["data-archive-apply-text"])).map(e => e.text)).toEqual([p.secondary.after, p.secondary.before, p.canonical.content]);
    for (const parentUndo of ["undo_first", "merge_ready", "chain_incomplete", "parent_unavailable"] as const) {
      const root = new mocks.Element(), action = vi.fn();
      renderArchiveHistory(root as unknown as HTMLElement, { id: f.review.id, record: f.review.record, state: "applied", receipts: [], issues: [],
        scope: "none", damaged: false, recovered: true, editorBlocked: false, canUndo: parentUndo === "undo_first", parentUndo }, action);
      expect(root.all().map(e => e.text).join("\n")).toContain(p.provenance.id); expect(action).not.toHaveBeenCalled();
      expect(!!root.action("undoReview")).toBe(parentUndo === "undo_first");
    }
  });
});
