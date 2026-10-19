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
    action(key: string) { return this.all().find(e => e.attrs["data-bundle-apply-action"] === key); }
    click() { this.listeners.get("click")?.(); }
  }
  class Modal { constructor(readonly app: unknown) {} contentEl = new Element(); modalEl = new Element(); titleEl = new Element(); onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); } }
  return { Element, Modal };
});
vi.mock("obsidian", () => ({ TFile: class {}, Modal: mocks.Modal, getLanguage: () => "en" }));
import { BundleApplyModal, renderBundleHistory } from "./bundleApplyModal";
import type { BundleApply } from "./bundleApply";
import { buildContextBundlePlan } from "./contextBundlePlan";
import { bundleRecord } from "./bundleJournal";
import { bundleFixture } from "../tests/contextBundleFixture";
import { setLanguage } from "../i18n";
async function fixture() {
  const f = bundleFixture(), record = await bundleRecord(buildContextBundlePlan(f.analysis, f.pair, f.choice,f.read.linktexts));
  const review = { id: record.id, action: "apply" as const, record }, service = { execute: vi.fn(async () => {}), discard: vi.fn() }, history = vi.fn();
  const prepare = vi.fn(async (_current: () => boolean) => review);
  const modal = new BundleApplyModal(eventApp() as never, service as unknown as BundleApply, prepare, history);
  return { modal, service, prepare, review, history, root: modal.contentEl as unknown as InstanceType<typeof mocks.Element> };
}
function eventApp() { const listeners = new Map<string, () => void>(); const events = { on: (name: string, fn: () => void) => { listeners.set(name, fn); return name; }, offref: (name: string) => listeners.delete(name) }; return { vault: events, metadataCache: events, workspace: events }; }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
describe("separate bundle consent", () => {
  it.each(["ru", "en"] as const)("%s presents full before/after, secondary, copied ranges and diff before enabling Apply", async language => {
    setLanguage(language); const f = await fixture(); f.modal.open(); await flush();
    const r = f.review.record.plan;
    expect(f.root.all().filter(e => e.attrs["data-bundle-apply-text"]).map(e => e.text)).toEqual([r.canonical.before, r.canonical.after, r.secondary.content, ...r.bundle.blocks.map(t => t.range.text), JSON.stringify(r.insertion,null,2)]);
    expect(f.root.all().some(e => e.tag === "img" || e.text.startsWith("@bundleApply."))).toBe(false);
    expect(f.root.all().filter(e => e.tag === "details").every(e => !(e as unknown as {open: boolean}).open)).toBe(true);
    expect(f.service.execute).not.toHaveBeenCalled(); f.root.action("confirm")!.click(); await flush(); expect(f.service.execute).toHaveBeenCalledExactlyOnceWith(f.review);
  });
  it("close during review revokes late consent and double click dispatches only once", async () => {
    const f = await fixture(); let done!: () => void;
    f.prepare.mockImplementationOnce(() => new Promise(resolve => { done = () => resolve(f.review); }));
    f.modal.open(); f.modal.close(); done(); await flush(); expect(f.service.execute).not.toHaveBeenCalled(); expect(f.service.discard).toHaveBeenCalledWith(f.review);
    const g = await fixture(); g.service.execute.mockImplementationOnce(() => new Promise(resolve => { done = resolve; }));
    g.modal.open(); await flush(); const confirm = g.root.action("confirm")!; confirm.click(); confirm.click(); g.modal.close(); done(); await flush();
    expect(g.service.execute).toHaveBeenCalledTimes(1); expect(g.root.children).toHaveLength(0);
  });
  it("history offers separate Undo review and shows recovery evidence without auto-dispatch", async () => {
    const f = await fixture(), root = new mocks.Element(), action = vi.fn();
    const row = { id: f.review.id, record: f.review.record, state: "applied" as const, canonicalState: "after" as const, secondaryUnchanged: true,
      receipts: [], issues: [], scope: "none" as const, blocking: false, damaged: false, recovered: true, editorBlocked: false, canUndo: true };
    renderBundleHistory(root as unknown as HTMLElement, row, action);
    expect(root.all().filter(e => e.attrs["data-operation-id"])).toHaveLength(1); expect(action).not.toHaveBeenCalled();
    expect(root.all().some(e=>e.attrs["data-archive-action"])).toBe(false);
    root.action("undoReview")!.click(); expect(action).toHaveBeenCalledOnce();
    const blocked = new mocks.Element(); renderBundleHistory(blocked as unknown as HTMLElement, { ...row, damaged: true, canUndo: false }, action);
    expect(blocked.action("undoReview")).toBeUndefined(); expect(blocked.all().filter(e => e.attrs["data-bundle-apply-text"])).toHaveLength(8);
  });
  it("Undo preview reverses canonical before/after and leaves secondary literal", async () => {
    const f = await fixture(); Object.assign(f.review, { action: "undo" }); f.modal.open(); await flush();
    expect(f.root.all().filter(e => ["before", "after", "secondary"].includes(e.attrs["data-bundle-apply-text"])).map(e => e.text)).toEqual([f.review.record.plan.canonical.after, f.review.record.plan.canonical.before, f.review.record.plan.secondary.content]);
    expect(f.service.execute).not.toHaveBeenCalled(); f.root.action("confirm")!.click(); await flush(); expect(f.service.execute).toHaveBeenCalledOnce();
  });
});
