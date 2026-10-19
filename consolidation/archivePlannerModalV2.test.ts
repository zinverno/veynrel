import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; value = ""; checked = false; disabled = false; open = false;
    listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; } focus() {}
    create(tag: string, opts: { text?: string; attr?: Record<string, string>; value?: string } = {}) { const e = new Element(); Object.assign(e, { tag, text: opts.text ?? "", attrs: opts.attr ?? {}, value: opts.value ?? "" }); this.children.push(e); return e; }
    createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    querySelector() { return null; }
    find(attr: string, value?: string) { return this.all().find(e => value === undefined ? attr in e.attrs : e.attrs[attr] === value)!; }
    change() { this.listeners.get("change")?.(); } click() { if (!this.disabled) this.listeners.get("click")?.(); }
  }
  class Modal { contentEl = new Element(); modalEl = new Element(); titleEl = new Element(); constructor(readonly app: unknown) {} onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); } }
  return { Element, Modal };
});
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, Modal: mocks.Modal, parseYaml: vi.fn(), getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s, subpath: "" }) }));
import { ArchivePlannerModalV2, renderStructuralArchiveAction } from "./archivePlannerModalV2";
import { groupApplyFixture } from "../tests/groupApplyFixture";
import { readArchiveBasisV2 } from "./obsidianArchiveV2";
import type { ArchiveReadV2 } from "./archiveSessionV2";
import { setLanguage } from "../i18n";
async function fixture() {
  const f = groupApplyFixture(), review = await f.review(); await f.group.execute(review);
  const input = await readArchiveBasisV2(f.app, f.service, "copy_context_group", review.id, () => true);
  const listeners = new Map<string, () => void>(), events = { on: (key: string, fn: () => void) => { listeners.set(key, fn); return key; }, offref: vi.fn((key: string) => { listeners.delete(key); }) };
  const read = vi.fn(async () => input), app = { vault: events, metadataCache: events, workspace: events };
  const modal = new ArchivePlannerModalV2(app as never, read), root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
  return { modal, root, read, input, events, listeners, f };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe("structural archive v2 UI", () => {
  it.each(["en", "ru"] as const)("%s requires each disposition, shows literal sources, diff and JSON without Apply", async language => {
    setLanguage(language); const f = await fixture(); f.modal.open(); await flush();
    expect(f.root.find("data-archive-text", "secondary").text).toBe(f.input.record.plan.secondary.content);
    expect(f.root.find("data-archive-text", "canonical").text).toBe(f.input.record.plan.canonical.after);
    expect(f.root.find("data-archive-action", "build").disabled).toBe(true);
    const count = f.root.all().filter(e => "data-archive-fragment" in e.attrs).length;
    for (let i = 0; i < count; i++) { const select = f.root.find("data-archive-fragment", String(i)); select.value = "retained"; select.change(); }
    const status = f.root.find("data-archive-status"); status.value = "archived"; status.change();
    const ack = f.root.find("data-archive-ack"); ack.checked = true; ack.change();
    expect(f.root.find("data-archive-action", "build").disabled).toBe(true);
    const unknown = f.root.find("data-archive-unknown"); expect(unknown.checked).toBe(false); unknown.checked = true; unknown.change();
    f.root.find("data-archive-action", "build").click(); await flush();
    expect(f.root.find("data-archive-text", "before").text).toBe(f.input.record.plan.secondary.content);
    expect(f.root.find("data-archive-text", "after").text).toContain("archive_status: archived");
    expect(f.root.find("data-archive-text", "json").text).toContain('"operation": "structural_archive_in_place_plan"');
    expect(f.root.all().some(e => /@archive\./u.test(e.text))).toBe(false);
    expect(f.root.all().filter(e => e.tag === "button").some(e => /apply|применить|undo/iu.test(e.text))).toBe(false);
    const first = f.root.find("data-archive-fragment", "0"); first.value = "consolidate"; first.change();
    expect(f.modal.session.view.plan).toBeUndefined(); expect(f.root.find("data-archive-action", "build").disabled).toBe(true);
    f.modal.close(); expect(f.events.offref).toHaveBeenCalledTimes(8);
  });
  it.each(["modify", "create", "delete", "rename", "changed", "resolved"])("%s invalidates the whole review", async event => {
    const f = await fixture(); f.modal.open(); await flush(); f.listeners.get(event)!();
    expect(f.modal.session.view).toEqual({ stage: "stale" }); expect(f.root.find("data-archive-text", "secondary")).toBeUndefined();
    f.modal.close(); expect(f.listeners.size).toBe(0);
  });
  it("cancels and closes pending reads without late publication", async () => {
    for (const close of [false, true]) {
      const f = await fixture(); let done!: (r: ArchiveReadV2) => void;
      f.read.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })); f.modal.open();
      if (close) f.modal.close(); else f.root.find("data-archive-action", "cancel").click();
      done(f.input); await flush(); expect(f.modal.session.view.stage).toBe(close ? "idle" : "cancelled");
      expect(f.modal.session.view.plan).toBeUndefined(); if (close) expect(f.root.children).toHaveLength(0);
    }
  });
});

it("history opens v2 only for intact completed parents and explains every unavailable row", async () => {
  const f = await fixture(), row = (await f.f.group.history())[0], open = vi.fn();
  const root = new mocks.Element(); renderStructuralArchiveAction(root as never, row, open);
  root.find("data-archive-v2-action", "open").click(); expect(open).toHaveBeenCalledOnce();
  for (const patch of [{ canUndo: false }, { damaged: true }, { recovered: true }, { blocking: true }, { receipts: [] },
    { receipts: [{ ...row.receipts[0], state: "undo_intent" as const }] }]) {
    root.empty(); renderStructuralArchiveAction(root as never, { ...row, ...patch }, open);
    expect(root.find("data-archive-v2-action", "open")).toBeUndefined(); expect(root.find("data-archive-v2-unavailable")).toBeDefined();
  }
});

it.each(["file-open", "layout-change"])("%s revokes published v2 when an affected editor appears", async event => {
  const f = await fixture(); f.modal.open(); await flush();
  const dispositions = f.root.all().filter(e => "data-archive-fragment" in e.attrs);
  for (const e of dispositions) { e.value = "retained"; e.change(); }
  const status = f.root.find("data-archive-status"); status.value = "archived"; status.change();
  for (const attr of ["data-archive-ack", "data-archive-unknown"]) { const e = f.root.find(attr); e.checked = true; e.change(); }
  f.root.find("data-archive-action", "build").click(); await flush(); expect(f.modal.session.view.stage).toBe("ready");
  f.f.editor(); f.listeners.get(event)!();
  expect(f.modal.session.view.stage).toBe("stale"); expect(f.modal.session.view.plan).toBeUndefined(); f.modal.close();
});
