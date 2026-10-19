import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    closest() { return null; }
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
vi.mock("obsidian", () => ({ TFile: class {}, Modal: mocks.Modal, parseYaml: vi.fn(), getLanguage: () => "en" }));
import { ArchivePlannerModal } from "./archivePlannerModal";
import { mergeFixture, mergeNote } from "../tests/mergeFixture";
import { buildMergePlan } from "./mergePlan";
import { mergeRecord } from "./mergeJournal";
import type { ArchiveRead } from "./archiveSession";
import { setLanguage } from "../i18n";
async function fixture() {
  const f = mergeFixture(), record = await mergeRecord(buildMergePlan(f.analysis, f.pair, f.choice));
  const input: ArchiveRead = { record, recordHash: "a".repeat(64), notes: [mergeNote(record.canonical.path, record.canonical.after), f.pair[1]],
    entry: { id: record.id, record, damaged: false, scope: "none", issues: [], receipts: [{ state: "applied", modified: 3, bytes: 500 }] },
    dependencies: [{ path: record.secondary.path, incoming: null, outgoing: [] }], guard: vi.fn() };
  const listeners = new Map<string, () => void>(), events = { on: (key: string, fn: () => void) => { listeners.set(key, fn); return key; }, offref: vi.fn((key: string) => { listeners.delete(key); }) };
  const read = vi.fn(async () => input), app = { vault: events, metadataCache: events };
  const modal = new ArchivePlannerModal(app as never, read), root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
  return { modal, root, read, input, events, listeners };
}
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
describe("archive review UI", () => {
  it.each(["en", "ru"] as const)("%s requires each disposition, shows literal sources, diff and JSON without Apply", async language => {
    setLanguage(language); const f = await fixture(); f.modal.open(); await flush();
    expect(f.root.find("data-archive-text", "secondary").text).toBe(f.input.record.secondary.content);
    expect(f.root.find("data-archive-text", "canonical").text).toBe(f.input.record.canonical.after);
    expect(f.root.find("data-archive-action", "build").disabled).toBe(true);
    const count = f.root.all().filter(e => "data-archive-fragment" in e.attrs).length;
    for (let i = 0; i < count; i++) { const select = f.root.find("data-archive-fragment", String(i)); select.value = "retained"; select.change(); }
    const status = f.root.find("data-archive-status"); status.value = "archived"; status.change();
    const ack = f.root.find("data-archive-ack"); ack.checked = true; ack.change();
    f.root.find("data-archive-action", "build").click(); await flush();
    expect(f.root.find("data-archive-text", "before").text).toBe(f.input.record.secondary.content);
    expect(f.root.find("data-archive-text", "after").text).toContain("archive_status: archived");
    expect(f.root.find("data-archive-text", "json").text).toContain('"operation": "archive_in_place_plan"');
    expect(f.root.all().some(e => /@archive\./u.test(e.text))).toBe(false);
    expect(f.root.all().filter(e => e.tag === "button").some(e => /apply|применить|undo/iu.test(e.text))).toBe(false);
    const first = f.root.find("data-archive-fragment", "0"); first.value = "consolidate"; first.change();
    expect(f.modal.session.view.plan).toBeUndefined(); expect(f.root.find("data-archive-action", "build").disabled).toBe(true);
    f.modal.close(); expect(f.events.offref).toHaveBeenCalledTimes(6);
  });
  it.each(["modify", "create", "delete", "rename", "changed", "resolved"])("%s invalidates the whole review", async event => {
    const f = await fixture(); f.modal.open(); await flush(); f.listeners.get(event)!();
    expect(f.modal.session.view).toEqual({ stage: "stale" }); expect(f.root.find("data-archive-text", "secondary")).toBeUndefined();
    f.modal.close(); expect(f.listeners.size).toBe(0);
  });
  it("cancels and closes pending reads without late publication", async () => {
    for (const close of [false, true]) {
      const f = await fixture(); let done!: (r: ArchiveRead) => void;
      f.read.mockImplementationOnce(() => new Promise(resolve => { done = resolve; })); f.modal.open();
      if (close) f.modal.close(); else f.root.find("data-archive-action", "cancel").click();
      done(f.input); await flush(); expect(f.modal.session.view.stage).toBe(close ? "idle" : "cancelled");
      expect(f.modal.session.view.plan).toBeUndefined(); if (close) expect(f.root.children).toHaveLength(0);
    }
  });
});
