import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    closest() { return null; }
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; checked = false; disabled = false; listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; }
    create(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) { const e = new Element(); e.tag = tag; e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; this.children.push(e); return e; }
    createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    focus() {}
    querySelector() { return this.all().find(e => e.attrs.role === "alert") ?? this.all().find(e => e.attrs.role === "status") ?? this.all().find(e => e.tag === "h3"); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    action(key: string) { return this.all().find(e => e.attrs["data-structural-archive-action"] === key); }
    click() { if (!this.disabled) this.listeners.get("click")?.(); }
  }
  class Modal { contentEl = new Element(); modalEl = new Element(); titleEl = new Element(); constructor(readonly app: unknown) {} onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); } }
  return { Element, Modal };
});
vi.mock("obsidian", async () => {
  // eslint-disable-next-line import/no-extraneous-dependencies -- Test-only native YAML substitute.
  const yaml = await import("js-yaml") as { load(s: string): unknown };
  return { TFile: class {}, MarkdownView: class {}, Modal: mocks.Modal, parseYaml: (s: string) => yaml.load(s), getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s.split("#")[0], subpath: s.includes("#") ? s.slice(s.indexOf("#")) : "" }) };
});
import { StructuralArchiveApplyModal, renderStructuralArchiveHistory } from "./structuralArchiveApplyModal";
import type { StructuralArchiveApply } from "./structuralArchiveApply";
import { structuralArchiveFixture } from "../tests/structuralArchiveFixture";
import { setLanguage } from "../i18n";
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
async function fixture() {
  const f = await structuralArchiveFixture(), review = await f.archive.review(f.archivePlan, () => true), service = { execute: vi.fn(async () => {}), discard: vi.fn(), guard: vi.fn() }, history = vi.fn();
  const listeners = new Map<string, () => void>(), events = { on: (key: string, fn: () => void) => { listeners.set(key, fn); return key; }, offref: (key: string) => listeners.delete(key) };
  const app = { vault: events, metadataCache: events, workspace: events };
  const prepare = vi.fn(async (_current: () => boolean) => review), modal = new StructuralArchiveApplyModal(app as never, service as unknown as StructuralArchiveApply, prepare, history);
  return { ...f, listeners, modal, service, prepare, review, history, root: modal.contentEl as unknown as InstanceType<typeof mocks.Element> };
}
const consent = (root: InstanceType<typeof mocks.Element>) => {
  const ack = root.all().find(e => e.attrs["data-structural-archive-ack"])!; ack.checked = true; ack.listeners.get("change")!();
};
describe("structural archive final consent", () => {
  it.each(["ru", "en"] as const)("%s shows full evidence without writes before a fresh confirmation", async language => {
    setLanguage(language); const f = await fixture(), before = [...f.disk]; f.modal.open(); await flush();
    const p = f.review.record.plan, text = f.root.all().map(e => e.text).join("\n");
    for (const value of [p.provenance.id, p.provenance.operation, p.secondary.path, p.canonical.path, p.secondary.before, p.secondary.after, p.canonical.content]) expect(text).toContain(value);
    expect(text).not.toMatch(/@(?:archive|structuralArchive)|Merge Apply/u);
    expect(text).toContain(language === "ru" ? "Подтверждённая родительская операция" : "Confirmed parent operation");
    expect(f.root.action("confirm")!.disabled).toBe(true); f.root.action("confirm")!.click(); expect(f.service.execute).not.toHaveBeenCalled();
    expect([...f.disk]).toEqual(before); expect(f.vault.process).not.toHaveBeenCalled();
    consent(f.root); f.root.action("confirm")!.click(); await flush(); expect(f.service.execute).toHaveBeenCalledExactlyOnceWith(f.review);
  });
  it.each(["create", "modify", "delete", "rename", "changed", "resolved", "file-open", "layout-change"])("%s revokes consent before execution", async event => {
    const f = await fixture(); f.modal.open(); await flush(); const current = f.prepare.mock.calls[0][0];
    consent(f.root); if (event === "file-open" || event === "layout-change") f.service.guard.mockImplementationOnce(() => { throw Error("editor"); });
    f.listeners.get(event)!(); expect(current()).toBe(false); expect(f.root.action("confirm")).toBeUndefined(); expect(f.service.execute).not.toHaveBeenCalled();
    f.modal.close(); expect(f.listeners.size).toBe(0);
  });
  it("late review after close is discarded and consumed-ticket events never erase successful result", async () => {
    const f = await fixture(); let done!: () => void;
    f.prepare.mockImplementationOnce(() => new Promise(resolve => { done = () => resolve(f.review); })); f.modal.open(); f.modal.close(); done(); await flush();
    expect(f.service.discard).toHaveBeenCalledWith(f.review); expect(f.service.execute).not.toHaveBeenCalled();
    const g = await fixture(); g.modal.open(); await flush(); consent(g.root); const confirm = g.root.action("confirm")!;
    g.service.execute.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })); confirm.click(); confirm.click(); done(); await flush();
    expect(g.service.execute).toHaveBeenCalledTimes(1); expect(g.listeners.size).toBe(0);
    expect(g.root.action("history")).toBeDefined(); expect(g.root.all().some(e => e.attrs.role === "alert")).toBe(false);
  });
  it("Undo reverses secondary only and history exposes only confirmed eligibility", async () => {
    const f = await fixture(); f.prepare.mockResolvedValueOnce({ ...f.review, action: "undo" }); f.modal.open(); await flush(); const p = f.review.record.plan;
    expect(f.root.all().filter(e => ["before", "after", "canonical"].includes(e.attrs["data-structural-archive-text"])).map(e => e.text)).toEqual([p.secondary.after, p.secondary.before, p.canonical.content]);
    for (const parentUndo of ["undo_first", "parent_ready", "chain_incomplete", "parent_unavailable"] as const) {
      const root = new mocks.Element(), action = vi.fn(); renderStructuralArchiveHistory(root as unknown as HTMLElement, { id: f.review.id, record: f.review.record, state: "applied", receipts: [], issues: [],
        scope: "none", damaged: false, recovered: true, editorBlocked: false, canUndo: parentUndo === "undo_first", parentUndo }, action);
      expect(root.all().map(e => e.text).join("\n")).toContain(p.provenance.id); expect(!!root.action("undoReview")).toBe(parentUndo === "undo_first");
    }
  });
});
