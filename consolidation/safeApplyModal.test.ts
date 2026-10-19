import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    closest() { return null; }
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false;
    listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; }
    create(tag: string, opts: { text?: string; attr?: Record<string, string> } = {}) {
      const el = new Element(); el.tag = tag; el.text = opts.text ?? ""; el.attrs = opts.attr ?? {}; this.children.push(el); return el;
    }
    createEl(tag: string, opts = {}) { return this.create(tag, opts); }
    createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    focus() {}
    querySelector() { return this.all().find(e => e.attrs.role === "alert") ?? this.all().find(e => e.attrs.role === "status") ?? this.all().find(e => e.tag === "h3"); }
    all(): Element[] { return [this, ...this.children.flatMap(el => el.all())]; }
    action(key: string) { return this.all().find(el => el.attrs["data-safe-action"] === key); }
    click() { this.listeners.get("click")?.(); }
  }
  class Modal {
    constructor(readonly app: unknown) {}
    contentEl = new Element(); modalEl = new Element(); titleEl = new Element();
    onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); }
  }
  return { Element, Modal };
});
vi.mock("obsidian", () => ({ Modal: mocks.Modal, getLanguage: () => "en" }));
import { SafeApplyModal, OperationHistoryModal, JournalResolutionModal } from "./safeApplyModal";
import type { SafeApplyService, OperationHistory } from "./safeApply";
import { setLanguage } from "../i18n";
function eventApp() { const listeners = new Map<string, () => void>(); const events = { on: (name: string, fn: () => void) => { listeners.set(name, fn); return name; }, offref: (name: string) => listeners.delete(name) }; return { vault: events, metadataCache: events, workspace: events }; }
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function fixture() {
  const review = { id: "one", before: '<img src="bad">', after: "new text", sourcePath: "Folder/Same.md" };
  const service = { apply: vi.fn(async () => {}), undo: vi.fn(async () => {}), discard: vi.fn(), history: vi.fn(async () => []) };
  const prepare = vi.fn(async (_current: () => boolean) => review);
  const modal = new SafeApplyModal(eventApp() as never, service as unknown as SafeApplyService, prepare);
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
    const modal = new OperationHistoryModal(eventApp() as never, f.service as unknown as SafeApplyService);
    modal.open(); modal.close(); finish(); await flush(); expect((modal.contentEl as unknown as InstanceType<typeof mocks.Element>).children).toHaveLength(0);
    expect(f.service.apply).not.toHaveBeenCalled(); expect(f.service.undo).not.toHaveBeenCalled();
  });
});

function resolutionFixture() {
  const row = { id: "incident", record: { sourcePath: "Folder/Same.md", targetPath: "Other/Same.md", before: "<img src=bad>", after: "proposed", operation: "add_link", createdAt: 1 },
    state: "conflict", scope: "local", sourceState: "after", canResolve: true, canUndo: false, damaged: true,
    evidence: [{ name: "record.json", status: "valid", sha256: "abc" }, { name: "backup.json", status: "missing", sha256: null }],
    issues: [{ file: "backup.json", code: "missing" }], resolutionAttempts: [] } as unknown as OperationHistory;
  const review = { row };
  const service = { reviewResolution: vi.fn(async (_id: string, _current: () => boolean) => review), resolve: vi.fn(async () => {}), discardResolution: vi.fn(), history: vi.fn(async () => [row]) };
  const modal = new JournalResolutionModal(eventApp() as never, service as unknown as SafeApplyService, row.id);
  const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
  return { row, review, service, modal, root };
}
describe("incident resolution consent", () => {
  it.each(["ru", "en"] as const)("%s preview separates verified evidence, scope and acknowledgement from Undo", async language => {
    setLanguage(language); const f = resolutionFixture(); f.modal.open(); await flush();
    expect(f.service.resolve).not.toHaveBeenCalled();
    expect(f.root.all().some(el => el.tag === "img")).toBe(false);
    expect(f.root.all().some(el => el.text.includes("@journal.") || el.text.includes("@safeApply."))).toBe(false);
    expect(f.root.action("confirm")).toBeUndefined(); expect(f.root.action("undoConfirm")).toBeUndefined();
    f.root.action("resolveConfirm")!.click(); await flush(); expect(f.service.resolve).toHaveBeenCalledWith(f.review);
    expect(f.root.action("undo")).toBeUndefined();
  });
  it("close during verification discards late evidence and cannot restore UI", async () => {
    const f = resolutionFixture(); let finish!: () => void;
    f.service.reviewResolution.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve(f.review); }));
    f.modal.open(); f.modal.close(); finish(); await flush();
    expect(f.service.discardResolution).toHaveBeenCalledWith(f.review); expect(f.root.children).toHaveLength(0); expect(f.service.resolve).not.toHaveBeenCalled();
  });
  it("double confirmation and close during recording never duplicate or republish", async () => {
    const f = resolutionFixture(); let finish!: () => void;
    f.service.resolve.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.modal.open(); await flush(); const button = f.root.action("resolveConfirm")!;
    button.click(); button.click(); f.modal.close(); finish(); await flush();
    expect(f.service.resolve).toHaveBeenCalledOnce(); expect(f.root.children).toHaveLength(0);
    expect(f.service.reviewResolution.mock.calls[0][1]()).toBe(false);
  });
  it("history exposes unresolved incidents, but resolved history never offers Undo", async () => {
    const f = resolutionFixture(), modal = new OperationHistoryModal(eventApp() as never, f.service as unknown as SafeApplyService);
    modal.open(); await flush(); const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(root.action("resolve")).toBeDefined(); expect(root.action("undo")).toBeUndefined();
    f.row.canResolve = false; f.row.state = "resolved";
    root.action("refresh")!.click(); await flush();
    expect(root.action("resolve")).toBeUndefined(); expect(root.action("undo")).toBeUndefined(); expect(f.service.resolve).not.toHaveBeenCalled();
  });
});
