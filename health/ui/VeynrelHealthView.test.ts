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
    querySelector(selector: string): Element | undefined { return selector === "[data-health-heading]" ? this.all().find((e) => e.attrs["data-health-heading"])
      : this.all().find((e) => e.attrs["data-health-action"] === selector.match(/="([^"]+)"/u)?.[1]); }
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
import { appFixture, flush, root, preferencesFixture } from "../obsidian/testSupport";
import type { HealthPreferences } from "../preferences";
import { VeynrelHealthView } from "./VeynrelHealthView";
import { HealthRecoveryModal } from "./healthRecoveryModal";
import { registerHealth } from "../obsidian/registerHealth";
import { openHealthView } from "../obsidian/openHealthView";
import { openHealthNote } from "../obsidian/openHealthNote";

beforeEach(() => { setLanguage("en"); mocks.Modal.opened = []; });
function fixture(initial: Partial<HealthPreferences> = { profileChosen: true, onboardingCompleted: true }) {
  const f = appFixture(); const file = new mocks.TFile(); f.vault.getAbstractFileByPath.mockReturnValue(file);
  const p = preferencesFixture(initial);
  const controller = new HealthPluginController(f.app, "ai-knowledge-hub", p.preferences);
  const tools = vi.fn(); const view = new VeynrelHealthView({ app: f.app } as never, controller, tools);
  return { ...f, ...p, controller, tools, view, content: view.contentEl as unknown as InstanceType<typeof mocks.Element> };
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

describe("integrated Health onboarding", () => {
  it("asks one question, resumes after reopen without reading notes, scans only on click and keeps one live region", async () => {
    const f = fixture({}); await f.view.onOpen();
    expect(f.content.texts()).toContain("Welcome to Veynrel");
    expect(f.content.all().filter((e) => e.tag === "button" && e.attrs["data-health-action"]?.startsWith("profile-"))).toHaveLength(5);
    expect(f.content.action("scan")).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled();
    const live = f.content.all().find((e) => e.attrs.role === "status");
    const choice = f.content.action("profile-research"); choice.focus(); choice.click();
    await vi.waitFor(() => expect(f.content.action("scan")).toBeDefined());
    expect(f.preferences.get()).toMatchObject({ profile: "research", profileChosen: true, onboardingCompleted: false });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    expect(f.content.all().find((e) => e.attrs.role === "status")).toBe(live);
    expect(f.content.ownerDocument.activeElement?.tag).toBe("h1");
    await f.view.onClose(); await f.view.onOpen();
    expect(f.content.texts()).not.toContain("Welcome"); expect(f.content.action("scan")).toBeDefined(); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("scan").click(); const pending = f.controller.runLocalScan();
    expect(f.preferences.get().onboardingCompleted).toBe(false); await pending;
    expect(f.content.texts()).toContain("Veynrel found something"); expect(f.content.texts()).toContain("Note without connections");
    expect(f.content.action("continue")).toBeDefined(); expect(f.content.action("tools")).toBeUndefined();
    expect(f.preferences.get().onboardingCompleted).toBe(false);
    f.content.action("continue").click(); await vi.waitFor(() => expect(f.content.action("tools")).toBeDefined());
    expect(f.preferences.get().onboardingCompleted).toBe(true); expect(f.vault.read).toHaveBeenCalledTimes(1);
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("tools")).toBeDefined();
    expect(f.content.all().filter((e) => e.attrs.role === "status")).toHaveLength(1);
    expect(f.vault.read).toHaveBeenCalledTimes(1);
  });
  it("Skip saves Mixed, permanently exits onboarding and never scans", async () => {
    const f = fixture({}); await f.view.onOpen(); f.content.action("skip").click();
    await vi.waitFor(() => expect(f.content.action("tools")).toBeDefined());
    expect(f.preferences.get()).toEqual({ profile: "mixed", profileChosen: true, onboardingCompleted: true, onboardingVersion: 1 });
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("skip")).toBeUndefined();
    expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("migrating an existing scan uses it immediately after profile selection and derives Result after restart", async () => {
    const f = fixture({}); await f.controller.runLocalScan(); f.controller.dispose(); f.vault.read.mockClear();
    const controller = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const view = new VeynrelHealthView({ app: f.app } as never, controller, f.tools); await view.onOpen();
    const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
    expect(content.texts()).toContain("Welcome"); content.action("profile-work").click();
    await vi.waitFor(() => expect(content.action("continue")).toBeDefined());
    expect(content.action("scan")).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled();
    await view.onClose(); controller.dispose();
    const restarted = new HealthPluginController(f.app, "ai-knowledge-hub", f.preferences);
    const reopened = new VeynrelHealthView({ app: f.app } as never, restarted, f.tools); await reopened.onOpen();
    expect((reopened.contentEl as unknown as InstanceType<typeof mocks.Element>).action("continue")).toBeDefined();
    expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("safe errors retain Profile or Result when choice, Skip or completion fails", async () => {
    const f = fixture({}); await f.view.onOpen(); f.save.mockRejectedValue(new Error("private details"));
    f.content.action("profile-work").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Health preferences"));
    expect(f.content.action("profile-work")).toBeDefined(); expect(f.preferences.get().profileChosen).toBe(false);
    f.content.action("skip").click(); await flush(); expect(f.preferences.get().onboardingCompleted).toBe(false);
    expect(f.content.texts()).not.toContain("private details");
    const result = fixture({ profileChosen: true }); await result.view.onOpen(); await result.controller.runLocalScan();
    result.save.mockRejectedValueOnce(new Error("private details")); result.content.action("continue").click();
    await vi.waitFor(() => expect(result.content.texts()).toContain("Couldn't save Health preferences"));
    expect(result.content.action("continue")).toBeDefined(); expect(result.content.action("tools")).toBeUndefined();
    expect(result.preferences.get().onboardingCompleted).toBe(false); expect(result.content.texts()).not.toContain("private details");
    result.content.action("continue").click(); await vi.waitFor(() => expect(result.content.action("tools")).toBeDefined());
  });
  it("Change profile is secondary, shows a non-color selected marker, has no Skip and never scans", async () => {
    const f = fixture({ profile: "work", profileChosen: true, onboardingCompleted: true }); await f.view.onOpen();
    f.content.action("change-profile").click();
    expect(f.content.action("profile-work").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("profile-work").texts()).toContain("✓ Selected"); expect(f.content.action("skip")).toBeUndefined();
    f.save.mockRejectedValueOnce(new Error("private detail")); f.content.action("profile-research").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't save Health preferences"));
    expect(f.content.action("profile-work").attrs["aria-pressed"]).toBe("true");
    expect(f.content.action("profile-research").attrs["aria-pressed"]).toBe("false");
    f.content.action("profile-research").click(); await vi.waitFor(() => expect(f.content.action("profile-research")).toBeUndefined());
    expect(f.content.texts()).toContain("Profile: Research & writing");
    expect(f.preferences.get().onboardingCompleted).toBe(true); expect(f.vault.read).not.toHaveBeenCalled();
    f.content.action("tools").click(); expect(f.tools).toHaveBeenCalledTimes(1);
  });
  it.each(["findings.json", "scan-runs.json"])("recovery of %s wins before Welcome and preserves preferences", async (file) => {
    const f = fixture({ profile: "research" }); f.files.set(`${root}/${file}`, "{bad"); await f.view.onOpen();
    expect(f.content.texts()).not.toContain("Welcome"); expect(f.content.action("profile-research")).toBeUndefined();
    const preferences = f.preferences.get(); f.content.action("recover").click();
    mocks.Modal.opened[0].contentEl.all().find((e) => e.text === "Back up and reset")!.click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Welcome"));
    expect(f.preferences.get()).toEqual(preferences); expect(f.save).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
  });
  it("Russian first-result copy localizes the selected Finding while retaining its stored text", async () => {
    setLanguage("ru"); const f = fixture({ profileChosen: true }); await f.view.onOpen(); await f.controller.runLocalScan();
    expect(f.content.texts()).toContain("Заметка без связей"); expect(f.content.texts()).not.toContain("Note has no");
    const finding = f.controller.getState().recommendationFinding!;
    expect(finding.title).not.toMatch(/[А-Яа-яЁё]/u); expect(f.content.action("continue").text).toBe("Перейти в Health");
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
    registerHealth(plugin as never, vi.fn(), preferencesFixture().preferences);
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
