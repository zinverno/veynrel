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
    field(name: string) { return this.all().find(e => e.attrs["data-local-link"] === name)!; }
    event(name: string) { this.listeners.get(name)?.(); }
    change(value: string) { this.value = value; this.event("change"); }
  }
  class Modal {
    constructor(readonly app: unknown) {}
    contentEl = new Element(); modalEl = new Element(); titleEl = new Element();
    onOpen() {} onClose() {} open() { this.onOpen(); } close() { this.onClose(); }
  }
  return { Modal, Element, read: vi.fn(), consent: vi.fn() };
});
vi.mock("obsidian", () => ({ Modal: mocks.Modal, getLanguage: () => "en" }));
vi.mock("./readLocalLinkPair", () => ({ readLocalLinkPair: mocks.read }));
vi.mock("./safeApplyModal", () => ({ SafeApplyModal: class { constructor(...args: unknown[]) { mocks.consent(...args); } open() {} } }));
import { LocalLinkModal } from "./localLinkModal";
import { setLanguage } from "../i18n";
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function setup() {
  const paths = ["one/Same.md", "two/Same.md"] as const;
  mocks.read.mockReset(); mocks.consent.mockClear();
  mocks.read.mockResolvedValue({ pair: paths.map(path => ({ path, file: {}, created: 1, modified: 1, bytes: 6, content: "Plain.\n", references: [],
    cache: { sections: [{ type: "paragraph", position: { start: { offset: 0 }, end: { offset: 6 } } }] } })), linktexts: paths.map(p => p.slice(0, -3)) });
  const service = { reviewLocalLink: vi.fn() }, modal = new LocalLinkModal({} as never, paths, service as never);
  const root = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
  return { modal, root, service };
}
describe("local link UI has distinct range and write consent", () => {
  it.each(["ru", "en"] as const)("%s requires explicit direction, range and confirmation before handing off to Safe Apply", async language => {
    setLanguage(language); const f = setup(); f.modal.open(); await flush();
    expect(f.root.field("review")).toBeUndefined(); expect(f.service.reviewLocalLink).not.toHaveBeenCalled();
    f.root.field("direction").change("0"); expect(f.root.field("review").disabled).toBe(true);
    f.root.field("paragraph").change("0"); const confirm = f.root.field("range-confirm"); confirm.checked = true; confirm.event("change");
    expect(f.root.field("review").disabled).toBe(false);
    f.root.field("direction").change("1"); expect(f.root.field("review").disabled).toBe(true);
    f.root.field("paragraph").change("0"); const renewed = f.root.field("range-confirm"); renewed.checked = true; renewed.event("change");
    expect(f.root.all().some(e => e.text.includes("@localLink."))).toBe(false);
    const button = f.root.field("review"); button.event("click"); button.event("click");
    expect(mocks.consent).toHaveBeenCalledOnce(); expect(f.service.reviewLocalLink).not.toHaveBeenCalled();
    expect(mocks.consent.mock.calls[0][6]).toMatchObject({ sourcePath: "two/Same.md", targetPath: "one/Same.md", origin: "user" });
  });
  it("does not republish late preparation after Escape/close", async () => {
    const f = setup(); let finish!: (value: unknown) => void;
    mocks.read.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    f.modal.open(); f.modal.close(); finish({ pair: [] }); await flush(); expect(f.root.children).toEqual([]); expect(mocks.consent).not.toHaveBeenCalled();
  });
});
