import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false;
    listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; }
    create(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) {
      const el = new Element(); el.tag = tag; el.text = opts.text ?? ""; el.attrs = opts.attr ?? {}; this.children.push(el); return el;
    }
    createEl(tag: string, opts = {}) { return this.create(tag, opts); }
    createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(el => el.all())]; }
    action(key: string) { return this.all().find(el => el.attrs["data-safe-action"] === key); }
    click() { this.listeners.get("click")?.(); }
  }
  class Modal {
    contentEl = new Element(); modalEl = new Element(); titleEl = new Element();
    onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); }
  }
  return { Element, Modal };
});
vi.mock("obsidian", () => ({ Modal: mocks.Modal, getLanguage: () => "en" }));
import { SafeApplyModal, OperationHistoryModal } from "./safeApplyModal";
import type { SafeApplyService } from "./safeApply";
import { setLanguage } from "../i18n";
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function fixture() {
  const review = { id: "one", before: '<img src="bad">', after: "new text", sourcePath: "Folder/Same.md" };
  const service = { apply: vi.fn(async () => {}), undo: vi.fn(async () => {}), discard: vi.fn(), history: vi.fn(async () => []) };
  const prepare = vi.fn(async (_current: () => boolean) => review);
  const modal = new SafeApplyModal({} as never, service as unknown as SafeApplyService, prepare);
  const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
  return { review, service, prepare, modal, root };
}
describe("separate apply consent lifecycle", () => {
  it.each(["ru", "en"] as const)("renders %s full text diff safely and never writes on opening", async language => {
    setLanguage(language); const f = fixture(); f.modal.open(); await flush();
    expect(f.service.apply).not.toHaveBeenCalled(); expect(f.service.undo).not.toHaveBeenCalled();
    expect(f.root.all().some(el => el.tag === "img")).toBe(false); expect(f.root.all().some(el => el.text === f.review.before)).toBe(true);
    expect(f.root.all().some(el => el.text.includes("@safeApply."))).toBe(false);
    expect(f.root.action("confirm")).toBeDefined(); f.root.action("confirm")!.click(); await flush(); expect(f.service.apply).toHaveBeenCalledOnce();
  });
  it("close before preparation completes discards the late review without restoring UI", async () => {
    const f = fixture(); let finish!: () => void; f.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(f.review); }));
    f.modal.open(); f.modal.close(); finish(); await flush(); expect(f.root.children).toHaveLength(0); expect(f.service.discard).toHaveBeenCalledWith(f.review); expect(f.service.apply).not.toHaveBeenCalled();
  });
  it("double click and close during a write cannot publish late controls or write twice", async () => {
    const f = fixture(); let finish!: () => void; f.service.apply.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.modal.open(); await flush(); const button = f.root.action("confirm")!; button.click(); button.click(); f.modal.close(); finish(); await flush();
    expect(f.service.apply).toHaveBeenCalledOnce(); expect(f.root.children).toHaveLength(0); expect(f.prepare.mock.calls[0][0]()).toBe(false);
  });
  it("history refresh cannot publish after close and never applies or undoes automatically", async () => {
    const f = fixture(); let finish!: () => void; f.service.history.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve([]); }));
    const modal = new OperationHistoryModal({} as never, f.service as unknown as SafeApplyService);
    modal.open(); modal.close(); finish(); await flush(); expect((modal.contentEl as unknown as InstanceType<typeof mocks.Element>).children).toHaveLength(0);
    expect(f.service.apply).not.toHaveBeenCalled(); expect(f.service.undo).not.toHaveBeenCalled();
  });
});
