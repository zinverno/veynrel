import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; cls = ""; tag = "div"; disabled = false;
    attrs: Record<string, string> = {}; listeners: Array<() => void> = [];
    ownerDocument: { activeElement: Element | null } = { activeElement: null };
    private append(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element {
      const child = new Element(); Object.assign(child, { tag, text: opts.text ?? "", cls: opts.cls ?? "", attrs: opts.attr ?? {}, ownerDocument: this.ownerDocument });
      this.children.push(child); return child;
    }
    createEl(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append(tag, opts); }
    createDiv(opts: { cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("div", opts); }
    createSpan(opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("span", opts); }
    addClass(cls: string): void { this.cls += ` ${cls}`; }
    toggleClass(cls: string, enabled: boolean): void { if (enabled) this.addClass(cls); }
    empty(): void { this.children = []; this.text = ""; }
    setText(text: string): void { this.text = text; }
    setAttribute(key: string, value: string): void { this.attrs[key] = value; }
    getAttribute(key: string): string | null { return this.attrs[key] ?? null; }
    contains(child: Element): boolean { return this.all().includes(child); }
    querySelector(selector: string): Element | undefined { return this.all().find((e) => e.attrs["data-health-action"] === selector.match(/="([^"]+)"/u)?.[1]); }
    focus(): void { if (!this.disabled) this.ownerDocument.activeElement = this; }
    addEventListener(_type: string, fn: () => void): void { this.listeners.push(fn); }
    click(): void { for (const listener of this.listeners) listener(); }
    all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
    action(key: string): Element { return this.all().find((e) => e.attrs["data-health-action"] === key)!; }
    texts(): string { return this.all().map((e) => e.text).join("\n"); }
  }
  class Modal {
    static opened: Modal[] = [];
    contentEl = new Element(); titleEl = new Element();
    onOpen(): void {} onClose(): void {}
    open(): void { Modal.opened.push(this); this.onOpen(); } close(): void { this.onClose(); }
  }
  class ItemView { contentEl = new Element(); app: unknown; constructor(leaf: { app: unknown }) { this.app = leaf.app; } }
  class TFile { path = "A.md"; basename = "A"; extension = "md"; stat = { mtime: 1 }; }
  return { Element, Modal, ItemView, TFile };
});
vi.mock("obsidian", () => ({ ...mocks, setIcon: vi.fn(), Notice: vi.fn(), getLanguage: () => "en", parseLinktext: (link: string) => ({ path: link, subpath: "" }) }));
import { setLanguage } from "../../i18n";
import { HealthPluginController } from "../obsidian/healthPluginController";
import { appFixture, flush, root } from "../obsidian/testSupport";
import { VeynrelHealthView } from "./VeynrelHealthView";
import { HealthRecoveryModal } from "./healthRecoveryModal";
import { registerHealth } from "../obsidian/registerHealth";
import { openHealthView } from "../obsidian/openHealthView";
import { openHealthNote } from "../obsidian/openHealthNote";

beforeEach(() => { setLanguage("en"); mocks.Modal.opened = []; });
function fixture() {
  const f = appFixture(); const file = new mocks.TFile(); f.vault.getAbstractFileByPath.mockReturnValue(file);
  const controller = new HealthPluginController(f.app, "ai-knowledge-hub");
  const tools = vi.fn(); const view = new VeynrelHealthView({ app: f.app } as never, controller, tools);
  return { ...f, controller, tools, view, content: view.contentEl as unknown as InstanceType<typeof mocks.Element> };
}

describe("native Health view lifecycle", () => {
  it("opening only initializes storage; a click scans once and notifications update the dashboard", async () => {
    const f = fixture(); await f.view.onOpen();
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.content.texts()).toContain("Check your vault");
    let release!: (body: string) => void; f.vault.read.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const oldButton = f.content.action("scan"); oldButton.click(); oldButton.click(); await flush();
    expect(f.vault.read).toHaveBeenCalledTimes(1); expect(f.content.action("scan").disabled).toBe(true);
    expect(f.content.texts()).toContain("Checking your vault…");
    expect(f.content.getAttribute("aria-busy")).toBeNull(); // The live region stays available while the dashboard is busy.
    expect(f.content.all().find((e) => e.attrs.role === "status")?.attrs["aria-live"]).toBe("polite");
    const pending = f.controller.runLocalScan(); release("Meaningful content longer than thirty two characters for the scan."); await pending;
    expect(f.content.texts()).toContain("Vault check complete"); expect(f.content.texts()).toContain("Review recommended");
    expect(f.content.action("scan").disabled).toBe(false); expect(f.content.action("open-note")).toBeDefined();
    f.content.action("tools").click(); expect(f.tools).toHaveBeenCalledTimes(1);
  });
  it("close unsubscribes without cancelling; reopen reflects the same plugin-owned running scan", async () => {
    const f = fixture(); const realSubscribe = f.controller.subscribe.bind(f.controller);
    const removals: ReturnType<typeof vi.fn>[] = [];
    const subscribe = vi.spyOn(f.controller, "subscribe").mockImplementation((listener) => {
      const remove = vi.fn(realSubscribe(listener)); removals.push(remove); return remove;
    }); await f.view.onOpen();
    f.vault.read.mockReturnValueOnce(new Promise(() => {})); f.content.action("scan").click(); await flush();
    await f.view.onClose(); expect(f.content.children).toHaveLength(0); expect(removals[0]).toHaveBeenCalledTimes(1);
    expect(f.controller.getState().busy).toBe(true);
    await f.view.onOpen(); expect(f.content.action("scan").disabled).toBe(true);
    expect(subscribe).toHaveBeenCalledTimes(2);
    await f.view.onClose(); expect(removals[1]).toHaveBeenCalledTimes(1); f.controller.dispose(); await flush();
    expect(f.content.children).toHaveLength(0); expect(f.controller.getState().busy).toBe(false);
  });
  it("closing during initialization does not attach a late subscription", async () => {
    const f = fixture(); let release!: (exists: boolean) => void;
    f.adapter.exists.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    const subscribe = vi.spyOn(f.controller, "subscribe"); const opening = f.view.onOpen();
    await f.view.onClose(); release(false); await opening;
    expect(subscribe).not.toHaveBeenCalled(); expect(f.content.children).toHaveLength(0);
  });
  it("rechecks note existence at click time and leaves Findings unchanged if the note disappeared", async () => {
    const f = fixture(); await f.view.onOpen(); await f.controller.runLocalScan();
    const service = await f.controller.getHealthService(); const before = service.listFindings();
    f.vault.getAbstractFileByPath.mockReturnValue(null);
    f.content.action("open-note").click(); await flush();
    expect(f.content.texts()).toContain("This note is no longer available"); expect(f.openFile).not.toHaveBeenCalled();
    expect(service.listFindings()).toEqual(before); expect(f.content.action("open-note")).toBeUndefined();
  });
  it("blocking recovery requires modal confirmation and Cancel leaves files untouched", async () => {
    const f = fixture(); f.files.set(`${root}/findings.json`, "{bad"); await f.view.onOpen();
    expect(f.content.action("scan")).toBeUndefined(); f.content.action("recover").click();
    const modal = mocks.Modal.opened[0]; expect(modal.contentEl.texts()).toContain("does not delete or edit your notes");
    modal.contentEl.all().find((e) => e.text === "Cancel")!.click(); expect(f.adapter.rename).not.toHaveBeenCalled();
    f.content.action("recover").click(); const confirmation = mocks.Modal.opened[1];
    confirmation.contentEl.all().find((e) => e.text === "Back up and reset")!.click();
    await vi.waitFor(() => expect(f.content.action("scan")).toBeDefined());
    expect(f.content.texts()).toContain("Check your vault"); expect(f.vault.read).not.toHaveBeenCalled();
  });
});

describe("navigation and registration", () => {
  it("reveals deferred existing leaves without inspecting their view", async () => {
    const leaf = { get view(): never { throw new Error("Deferred view accessed"); } };
    const workspace = { getLeavesOfType: vi.fn(() => [leaf]), getLeaf: vi.fn(), revealLeaf: vi.fn(async (_leaf: unknown) => undefined) };
    await openHealthView(workspace as never); expect(workspace.getLeaf).not.toHaveBeenCalled(); expect(workspace.revealLeaf).toHaveBeenCalledTimes(1); expect(workspace.revealLeaf.mock.calls[0][0]).toBe(leaf);
  });
  it("creates a main tab, sets its type, then reveals it", async () => {
    const calls: string[] = [];
    const leaf = { setViewState: vi.fn(async () => { calls.push("state"); }) };
    const workspace = { getLeavesOfType: () => [], getLeaf: vi.fn(() => leaf), revealLeaf: vi.fn(async () => { calls.push("reveal"); }) };
    await openHealthView(workspace as never);
    expect(workspace.getLeaf).toHaveBeenCalledWith("tab"); expect(leaf.setViewState).toHaveBeenCalledWith({ type: "veynrel-health", active: true });
    expect(calls).toEqual(["state", "reveal"]);
  });
  it("ribbon and new command share one opening path; registration does not initialize or scan", async () => {
    const f = appFixture(); const leaf = { setViewState: vi.fn(async () => undefined) };
    const workspace = { getLeavesOfType: vi.fn(() => [] as typeof leaf[]), getLeaf: vi.fn(() => leaf), revealLeaf: vi.fn(async (_leaf: unknown) => undefined) };
    Object.assign(f.app, { workspace });
    const plugin = { app: f.app, manifest: { id: "ai-knowledge-hub" }, registerView: vi.fn(), register: vi.fn(),
      addRibbonIcon: vi.fn(), addCommand: vi.fn() };
    registerHealth(plugin as never, vi.fn());
    expect(f.adapter.exists).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
    const ribbon = plugin.addRibbonIcon.mock.calls[0][2] as () => void;
    const command = plugin.addCommand.mock.calls[0][0] as { id: string; callback: () => void };
    expect(command.id).toBe("veynrel-open-health"); expect(command.callback).toBe(ribbon);
    ribbon(); command.callback(); ribbon(); await flush(); expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
    workspace.getLeavesOfType.mockReturnValue([leaf]); ribbon(); await flush(); expect(workspace.getLeaf).toHaveBeenCalledTimes(1);
  });
  it("Open note accepts only existing, canonical, in-scope Markdown files", async () => {
    const f = fixture();
    for (const path of [undefined, "../A.md", "/A.md", "Private/Config/secret.md"]) expect(await openHealthNote(f.app, path)).toBe(false);
    expect(f.openFile).not.toHaveBeenCalled();
    expect(await openHealthNote(f.app, "A.md")).toBe(true); expect(f.openFile).toHaveBeenCalledTimes(1);
    const attachment = new mocks.TFile(); attachment.extension = "pdf"; f.vault.getAbstractFileByPath.mockReturnValue(attachment);
    expect(await openHealthNote(f.app, "A.md")).toBe(false);
  });
  it("confirmation cannot run twice and never confirms merely by opening", () => {
    const confirmed = vi.fn(); const modal = new HealthRecoveryModal({} as never, "history", confirmed); modal.open();
    expect(confirmed).not.toHaveBeenCalled(); const content = modal.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(content.texts()).toContain("Findings will be preserved"); const button = content.all().find((e) => e.text === "Back up and reset")!;
    button.click(); button.click(); expect(confirmed).toHaveBeenCalledTimes(1);
  });
});
