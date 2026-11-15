import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; attrs: Record<string, string> = {}; disabled = false; checked = false; value = "";
    listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; } focus() {}
    createEl(_tag: string, opts: { text?: string; value?: string; attr?: Record<string, string> } = {}) {
      const el = new Element(); el.text = opts.text ?? ""; el.value = opts.value ?? ""; el.attrs = opts.attr ?? {}; this.children.push(el); return el;
    }
    createDiv() { const el = new Element(); this.children.push(el); return el; }
    addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(el => el.all())]; }
    field(name: string) { return this.all().find(e => e.attrs["data-local-note"] === name)!; }
    event(name: string) { this.listeners.get(name)?.(); }
    change(value: string) { this.value = value; this.event("change"); }
  }
  class Modal {
    constructor(readonly app: unknown) {}
    contentEl = new Element(); modalEl = new Element(); titleEl = new Element();
    setPlaceholder() {}
    onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); }
  }
  return { Modal, Element, read: vi.fn(), consent: vi.fn() };
});
vi.mock("obsidian", () => ({ Modal: mocks.Modal, getLanguage: () => "en", FuzzySuggestModal: mocks.Modal }));
vi.mock("./obsidianLocalNote", () => ({ ObsidianLocalNote: class {} }));
vi.mock("./consolidationUx", () => ({ focusStatus: () => {}, historyHeading: () => {}, reviewSummary: () => {} }));
vi.mock("./planDiffView", () => ({ renderPlanDiff: () => {} }));
import { LocalNoteModal } from "./localNoteModal";
import { LocalNoteApplyModal, renderLocalNoteHistory } from "./localNoteApplyModal";
import { SafeApplyError } from "./operationJournal";
import { setLanguage } from "../i18n";
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const lifetimeApp = () => ({ vault: { on: vi.fn(), offref: vi.fn() }, metadataCache: { on: vi.fn(), offref: vi.fn() }, workspace: { on: vi.fn(), offref: vi.fn() } });
function setup() {
  const source = { path: "Source.md", created: 1, modified: 2, bytes: 6, content: "Plain." };
  const metadata = { sections: [{ type: "paragraph", position: { start: { offset: 0 }, end: { offset: 6 } } }] };
  const native = { prepare: vi.fn(async () => ({ source, metadata, authority: "", definitions: null, profile: { categories: [{ tags: ["allowed/rare"], prefixes: ["prefix"] }] } })), plan: vi.fn(async (_prepared: unknown, _choice: unknown) => ({})) };
  const service = { localNote: { review: vi.fn(async () => { throw Error("test handoff"); }), discard: vi.fn(), execute: vi.fn() } };
  const modal = new LocalNoteModal(lifetimeApp() as never, "Source.md", "add_inline_tag", native as never, service as never, vi.fn(), { tags: [{ tag: "observed/tag" }] } as never);
  return { native, service, modal, root: modal.contentEl as unknown as InstanceType<typeof mocks.Element> };
}
describe("local note UI and separate consent", () => {
  it.each(["ru", "en"] as const)("%s keeps tag/range choice explicit and does not apply at preparation", async lang => {
    setLanguage(lang); const f = setup(); f.modal.open(); await flush();
    expect(f.root.field("review").disabled).toBe(true);
    const choices = f.root.field("tag-choice").children;
    expect(choices.some(o => o.value === "allowed/rare")).toBe(true);
    expect(choices.some(o => o.value === "observed/tag")).toBe(true);
    expect(choices.some(o => o.value === "prefix")).toBe(false);
    f.root.field("tag-choice").change("allowed/rare"); expect(f.root.field("review").disabled).toBe(true);
    f.root.field("range").change("0"); expect(f.root.field("review").disabled).toBe(false);
    f.root.field("review").event("click"); await flush();
    expect(f.native.plan).toHaveBeenCalledOnce(); expect(f.service.localNote.execute).not.toHaveBeenCalled();
    expect(f.native.plan.mock.calls[0][1]).toMatchObject({ kind: "add_inline_tag", tag: "allowed/rare" });
  });
  it("closing while reading does not open or republish a late plan", async () => {
    const f = setup(); let finish!: (p: unknown) => void;
    f.native.prepare.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.modal.open(); f.modal.close(); finish({}); await flush(); expect(f.root.children).toEqual([]); expect(f.native.plan).not.toHaveBeenCalled();
  });
  it.each(["apply", "undo"] as const)("%s requires a separate confirmation and consumes double activation", async action => {
    const review = { id: "id", action, record: { plan: { source: { path: "Source.md", content: "Before" }, after: "After", choice: { kind: "add_inline_tag" } } } };
    const service = { localNote: { execute: vi.fn(async () => {}), discard: vi.fn() } }, prepare = vi.fn(async () => review);
    const modal = new LocalNoteApplyModal(lifetimeApp() as never, service as never, prepare as never, vi.fn());
    modal.open(); await flush(); expect(service.localNote.execute).not.toHaveBeenCalled();
    const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>, confirm = root.field("confirm");
    confirm.event("click"); confirm.event("click"); await flush(); expect(service.localNote.execute).toHaveBeenCalledOnce();
  });
  describe.each(["ru", "en"] as const)("%s single-note copy", language => {
    it.each(["add_inline_tag", "repair_wikilink"] as const)("%s uses accurate Apply/Undo confirmation and success text", async operation => {
      setLanguage(language);
      for (const action of ["apply", "undo"] as const) {
        const review = { id: "id", action, record: { plan: { source: { path: "Source.md", content: "Before" }, after: "After", choice: { kind: operation, target: { path: "Target.md" } } } } };
        const service = { localNote: { execute: vi.fn(async () => {}), discard: vi.fn() } };
        const modal = new LocalNoteApplyModal(lifetimeApp() as never, service as never, (async () => review) as never, vi.fn());
        modal.open(); await flush();
        const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
        expect(root.field("confirm").text).toBe(language === "ru" ? action === "apply" ? "Применить это изменение" : "Откатить это изменение" : action === "apply" ? "Apply this change" : "Undo this change");
        expect(service.localNote.execute).not.toHaveBeenCalled();
        expect(root.all().map(e => e.text).join(" ")).not.toMatch(/canonical|secondary|group|групп/iu);
        root.field("confirm").event("click"); await flush();
        expect(service.localNote.execute).toHaveBeenCalledOnce();
        expect(root.all().find(e => e.attrs.role === "status")?.text).toBe(language === "ru" ? action === "apply" ? "Изменение сохранено и зафиксировано в журнале." : "Исходный Markdown восстановлен." : action === "apply" ? "Change saved and recorded in the journal." : "Original Markdown restored.");
        expect(root.all().map(e => e.text).join(" ")).not.toMatch(/canonical|secondary|group|групп/iu); modal.close();
      }
    });
    it.each(["add_inline_tag", "repair_wikilink"] as const)("%s History and write-error text do not claim a group transfer or success", async operation => {
      setLanguage(language);
      const root = new mocks.Element();
      renderLocalNoteHistory(root as never, { id: "id", state: "applied", canUndo: true, receipts: [], issues: [], record: { createdAt: 1, operation, plan: { source: { path: "Source.md" } } } } as never, vi.fn());
      expect(root.field("undo").text).toBe(language === "ru" ? "Проверить откат" : "Review undo");
      expect(root.all().map(e => e.text).join(" ")).not.toMatch(/canonical|secondary|group|групп/iu);
      const review = { id: "id", action: "apply", record: { plan: { source: { path: "Source.md", content: "Before" }, after: "After", choice: { kind: operation, target: { path: "Target.md" } } } } };
      const service = { localNote: { execute: vi.fn(async () => { throw new SafeApplyError("write"); }), discard: vi.fn() } };
      const modal = new LocalNoteApplyModal(lifetimeApp() as never, service as never, (async () => review) as never, vi.fn());
      modal.open(); await flush(); const content = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
      content.field("confirm").event("click"); await flush();
      expect(content.all().find(e => e.attrs.role === "alert")?.text).toMatch(language === "ru" ? /Запись не подтверждена/u : /Write not confirmed/u);
      expect(content.all().map(e => e.text).join(" ")).not.toMatch(/canonical|secondary|group|групп|Change saved|Изменение сохранено/iu); modal.close();
    });
  });

});
