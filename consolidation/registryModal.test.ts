import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; attrs: Record<string, string> = {}; disabled = false; checked = false; value = "";
    listeners = new Map<string, () => void>();
    empty() { this.children = []; } addClass() {} setText(text: string) { this.text = text; } focus() {}
    createEl(_tag: string, opts: { text?: string; value?: string; attr?: Record<string, string> } = {}) {
      const el = new Element(); el.text = opts.text ?? ""; el.value = opts.value ?? ""; el.attrs = opts.attr ?? {}; this.children.push(el); return el;
    }
    createSpan(opts: {text?:string} = {}) { const el = new Element(); el.text = opts.text ?? ""; this.children.push(el); return el; }
    createDiv() { const el = new Element(); this.children.push(el); return el; }
    addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(el => el.all())]; }
    field(name: string) { return this.all().find(e => e.attrs["data-registry-field"] === name)!; }
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
import { RegistryEditModal } from "./registryEditModal";
import { RegistryApplyModal } from "./registryApplyModal";
import { organizationDocument } from "./organizationProfile";
import { SafeApplyError } from "./operationJournal";
import { setLanguage } from "../i18n";
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const lifetimeApp = () => ({ vault: { on: vi.fn(), offref: vi.fn() }, metadataCache: { on: vi.fn(), offref: vi.fn() }, workspace: { on: vi.fn(), offref: vi.fn() } });
const definitions = { version: 1 as const, profile: { version: 1 as const, categories: [] }, tags: [{ tag: "Rare/Ё", state: "allowed" as const, description: "Keep case" }], conventions: [] };
function setup() {
  const native = { read: vi.fn(async () => ({ path: "Rules.md", content: organizationDocument(null, definitions) })), plan: vi.fn(async (_source: unknown, _choice: unknown) => ({})) };
  const owner = { registry: { review: vi.fn(async () => { throw Error("test handoff"); }), discard: vi.fn(), execute: vi.fn() } };
  const modal = new RegistryEditModal(lifetimeApp() as never, native as never, owner as never, vi.fn());
  return { modal, native, owner, root: modal.contentEl as unknown as InstanceType<typeof mocks.Element> };
}
describe("registry UI edits one explicit definition with separate consent", () => {
  it.each(["ru", "en"] as const)("%s preserves literal unused tags, selected status/description and explicit removal", async lang => {
    setLanguage(lang);
    for (const remove of [false, true]) {
      const f = setup(); f.modal.open(); await flush(); expect(f.native.plan).not.toHaveBeenCalled();
      f.root.field("entry").change("Rare/Ё"); expect(f.root.field("tag").value).toBe("Rare/Ё");
      f.root.field("state").change("deprecated"); const desc = f.root.field("description"); desc.value = "New description"; desc.event("input");
      f.root.field("remove").checked = remove; f.root.field("remove").event("change");
      f.root.all().find(e => e.attrs["data-registry-action"] === "review")!.event("click"); await flush();
      expect(f.native.plan.mock.calls[0][1]).toEqual({ kind: "tag", key: "Rare/Ё", value: remove ? null : { tag: "Rare/Ё", state: "deprecated", description: "New description" } });
      expect(f.owner.registry.execute).not.toHaveBeenCalled();
    }
  });
  it("does not hand off after close while source is loading or a plan is pending", async () => {
    const f = setup(); let finish!: (p: never) => void;
    f.native.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.modal.open(); f.modal.close(); finish({} as never); await flush(); expect(f.root.children).toEqual([]); expect(f.native.plan).not.toHaveBeenCalled();
  });
  it.each(["ru", "en"] as const)("%s separate Apply/Undo and failure never claim unrelated notes changed", async lang => {
    setLanguage(lang);
    for (const action of ["apply", "undo"] as const) for (const fail of [false, true]) {
      const review = { id: "id", action, record: { plan: { source: { path: "Rules.md", content: "Before" }, after: "After" } } };
      const owner = { registry: { execute: vi.fn(async () => { if (fail) throw new SafeApplyError("write"); }), discard: vi.fn() } };
      const modal = new RegistryApplyModal(lifetimeApp() as never, owner as never, (async () => review) as never, vi.fn());
      modal.open(); await flush(); const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
      const confirm = root.all().find(e => e.attrs["data-registry"] === "confirm")!;
      expect(confirm.text).toBe(lang === "ru" ? action === "apply" ? "Применить это изменение" : "Откатить это изменение" : action === "apply" ? "Apply this change" : "Undo this change");
      expect(owner.registry.execute).not.toHaveBeenCalled(); confirm.event("click"); confirm.event("click"); await flush(); expect(owner.registry.execute).toHaveBeenCalledOnce();
      expect(root.all().some(e => e.attrs.role === (fail ? "alert" : "status"))).toBe(true);
      if (fail) expect(root.all().map(e => e.text).join(" ")).not.toMatch(/Change saved|Изменение сохранено/u);
      modal.close();
    }
  });
});
