import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    closest() { return null; }
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false; listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; }
    create(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) { const e = new Element(); e.tag = tag; e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; this.children.push(e); return e; }
    createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    focus() {}
    querySelector() { return this.all().find(e => e.attrs.role === "alert") ?? this.all().find(e => e.attrs.role === "status") ?? this.all().find(e => e.tag === "h3"); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    action(key: string) { return this.all().find(e => e.attrs["data-multi-action"] === key); }
    click() { this.listeners.get("click")?.(); }
  }
  class Modal { constructor(readonly app: unknown) {} contentEl = new Element(); modalEl = new Element(); titleEl = new Element(); onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); } }
  return { Element, Modal };
});
vi.mock("obsidian", () => ({ TFile: class {}, Modal: mocks.Modal, getLanguage: () => "en" }));
import { MultiFileApplyModal, renderMultiHistory } from "./multiFileApplyModal";
import type { MultiFileApply } from "./multiFileApply";
import { buildMultiFilePlan } from "./multiFilePlan";
import { multiRecord } from "./multiFileJournal";
import { multiFileFixture } from "../tests/multiFileFixture";
import { setLanguage } from "../i18n";
async function fixture() {
  const f = multiFileFixture(), record = await multiRecord(buildMultiFilePlan(f.analysis, f.pair, f.choice, f.read.linktexts));
  const review = { id: record.id, action: "apply" as const, record }, service = { execute: vi.fn(async () => {}), discard: vi.fn() }, history = vi.fn();
  const prepare = vi.fn(async (_current: () => boolean) => review);
  const modal = new MultiFileApplyModal(eventApp() as never, service as unknown as MultiFileApply, prepare, history);
  return { modal, service, prepare, review, history, root: modal.contentEl as unknown as InstanceType<typeof mocks.Element> };
}
function eventApp() { const listeners = new Map<string, () => void>(); const events = { on: (name: string, fn: () => void) => { listeners.set(name, fn); return name; }, offref: (name: string) => listeners.delete(name) }; return { vault: events, metadataCache: events, workspace: events }; }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
describe("one combined write consent and history", () => {
  it.each(["ru", "en"] as const)("%s shows two full literal sources/diffs and sends nothing until confirmation", async language => {
    setLanguage(language); const f = await fixture(); f.modal.open(); await flush();
    expect(f.root.all().filter(e => e.attrs["data-multi-preview"])).toHaveLength(2);
    expect(f.root.all().filter(e => e.tag === "pre" && f.review.record.files.some(n => n.before === e.text || n.after === e.text))).toHaveLength(4);
    expect(f.root.all().some(e => e.tag === "img" || e.text.startsWith("@multiSafe."))).toBe(false);
    expect(f.service.execute).not.toHaveBeenCalled(); f.root.action("confirm")!.click(); await flush(); expect(f.service.execute).toHaveBeenCalledExactlyOnceWith(f.review);
  });
  it("close during review discards the late ticket; two clicks during execution cannot dispatch twice", async () => {
    const f = await fixture(); let done!: () => void;
    f.prepare.mockImplementationOnce(() => new Promise(resolve => { done = () => resolve(f.review); }));
    f.modal.open(); f.modal.close(); done(); await flush(); expect(f.service.execute).not.toHaveBeenCalled(); expect(f.service.discard).toHaveBeenCalledWith(f.review);
    const g = await fixture(); g.service.execute.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    g.modal.open(); await flush(); const confirm = g.root.action("confirm")!; confirm.click(); confirm.click(); g.modal.close(); done(); await flush();
    expect(g.service.execute).toHaveBeenCalledTimes(1); expect(g.root.children).toHaveLength(0);
  });
  it("history is one operation with both participants and an explicit compensation action", async () => {
    const f = await fixture(), root = new mocks.Element(), action = vi.fn();
    renderMultiHistory(root as unknown as HTMLElement, { id: f.review.id, record: f.review.record, state: "partial", participants: ["after", "before"],
      action: "compensate", issues: [], scope: "local", blocking: true, damaged: false, recovered: true, editorBlocked: false, markerWarnings: false, marks: [] }, action);
    expect(root.all().filter(e => e.attrs["data-operation-id"])).toHaveLength(1); expect(root.all().filter(e => e.attrs["data-multi-preview"])).toHaveLength(2);
    expect(action).not.toHaveBeenCalled(); root.action("action.compensate")!.click(); expect(action).toHaveBeenCalledOnce();
  });
});
