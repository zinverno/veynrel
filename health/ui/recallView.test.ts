import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  class Element {
    children: Element[] = []; text = ""; cls = ""; tag = "div"; disabled = false; parent?: Element;
    attrs: Record<string, string> = {}; listeners = new Map<string, Set<(event: unknown) => void>>();
    ownerDocument: { activeElement: Element | null } = { activeElement: null };
    private append(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element {
      const child = new Element(); Object.assign(child, { tag, text: opts.text ?? "", cls: opts.cls ?? "", attrs: opts.attr ?? {}, parent: this, ownerDocument: this.ownerDocument });
      this.children.push(child); return child;
    }
    createEl(tag: string, opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append(tag, opts); }
    createDiv(opts: { cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("div", opts); }
    createSpan(opts: { text?: string; cls?: string; attr?: Record<string, string> } = {}): Element { return this.append("span", opts); }
    set textContent(text: string) { this.text = text; }
    addClass(cls: string): void { this.cls += ` ${cls}`; }
    toggleClass(cls: string, on: boolean): void { if (on) this.addClass(cls); }
    empty(): void { this.children = []; this.text = ""; }
    setText(text: string): void { this.text = text; }
    setAttribute(key: string, value: string): void { this.attrs[key] = value; }
    getAttribute(key: string): string | null { return this.attrs[key] ?? null; }
    all(): Element[] { return [this, ...this.children.flatMap((child) => child.all())]; }
    contains(child: Element | null): boolean { return child !== null && this.all().includes(child); }
    querySelector(selector: string): Element | undefined {
      const match = selector.match(/^\[([\w-]+)(?:="([^"]+)")?\]$/u);
      return match ? this.all().find((element) => match[2] ? element.attrs[match[1]] === match[2] : element.attrs[match[1]] !== undefined) : undefined;
    }
    closest(_selector: string): Element | undefined {
      return ["input", "textarea", "select"].includes(this.tag) || (this.attrs.contenteditable !== undefined && this.attrs.contenteditable !== "false") || this.attrs.role === "textbox"
        ? this : this.parent?.closest(_selector);
    }
    focus(): void { if (!this.disabled) this.ownerDocument.activeElement = this; }
    addEventListener(type: string, listener: (event: unknown) => void): void {
      const listeners = this.listeners.get(type) ?? new Set(); listeners.add(listener); this.listeners.set(type, listeners);
    }
    removeEventListener(type: string, listener: (event: unknown) => void): void { this.listeners.get(type)?.delete(listener); }
    click(): void { if (!this.disabled) for (const listener of [...this.listeners.get("click") ?? []]) listener({ target: this }); }
    key(key: string, extra: Record<string, unknown> = {}): void {
      const event = { key, target: this, preventDefault: vi.fn(), ...extra };
      this.dispatchKey(event);
    }
    private dispatchKey(event: unknown): void {
      for (const listener of [...this.listeners.get("keydown") ?? []]) listener(event);
      this.parent?.dispatchKey(event);
    }
    action(key: string): Element | undefined { return this.querySelector(`[data-health-action="${key}"]`); }
    texts(): string { return this.all().map((element) => element.text).join("\n"); }
  }
  class ItemView { contentEl = new Element(); app: unknown; constructor(leaf: { app: unknown }) { this.app = leaf.app; } }
  class Modal { contentEl = new Element(); titleEl = new Element(); open(): void {} close(): void {} }
  class TFile { path = "A.md"; basename = "A"; extension = "md"; stat = { mtime: 1, size: 100 }; }
  return { Element, ItemView, Modal, TFile, requestUrl: vi.fn(), setIcon: vi.fn(), Notice: vi.fn(),
    setTimeout: vi.fn<(callback: () => void, delay: number) => number>(() => 1), clearTimeout: vi.fn() };
});
vi.mock("obsidian", () => ({ ...mocks, getLanguage: () => "en", parseLinktext: (path: string) => ({ path, subpath: "" }) }));
import { setLanguage } from "../../i18n";
import { productFixture, cardsPath } from "../../recall/product/testSupport";
import { candidate, gate } from "../../recall/testSupport";
import { HealthPluginController } from "../obsidian/healthPluginController";
import { preferencesFixture, flush, root } from "../obsidian/testSupport";
import { VeynrelHealthView } from "./VeynrelHealthView";
import { registerHealth } from "../obsidian/registerHealth";
import { openHealthNote } from "../obsidian/openHealthNote";
import { formatRecallInterval, recallViewModel } from "./recallViewModel";
import type { RecallRating } from "../../recall/scheduler/types";

beforeEach(() => {
  setLanguage("en"); mocks.requestUrl.mockClear();
  mocks.setTimeout.mockClear(); mocks.clearTimeout.mockClear();
  vi.stubGlobal("window", { setTimeout: mocks.setTimeout, clearTimeout: mocks.clearTimeout });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function fixture(raw?: string, onboarded = true) {
  const f = productFixture(raw), p = preferencesFixture({ profileChosen: onboarded, onboardingCompleted: onboarded });
  const health = new HealthPluginController(f.app, "ai-knowledge-hub", p.preferences);
  const view = new VeynrelHealthView({ app: f.app } as never, health, vi.fn(), undefined, f.product);
  const content = view.contentEl as unknown as InstanceType<typeof mocks.Element>;
  return { ...f, view, content, health, action: (key: string) => content.action(key)! };
}
async function reviewFixture() {
  const f = fixture(); await f.view.onOpen(); f.action("nav-recall").click(); await flush();
  f.action("recall-refresh").click(); await vi.waitFor(() => expect(f.content.action("recall-start")).toBeDefined());
  f.action("recall-start").click(); f.time(200); return f;
}

describe("Recall workspace route and lazy composition", () => {
  it("registers one existing view without Recall IO and other routes never initialize Recall", async () => {
    const f = fixture(), plugin = { app: f.app, manifest: { id: "ai-knowledge-hub" }, registerView: vi.fn(), register: vi.fn(), addRibbonIcon: vi.fn(), addCommand: vi.fn() };
    registerHealth(plugin as never, vi.fn(), preferencesFixture().preferences);
    expect(plugin.registerView).toHaveBeenCalledTimes(1); expect(f.adapter.exists).not.toHaveBeenCalled();
    await f.view.onOpen(); f.action("nav-findings").click(); f.action("nav-discover").click(); f.action("nav-health").click();
    expect(f.factory).not.toHaveBeenCalled(); expect(f.adapter.exists.mock.calls.some(([path]) => path === cardsPath)).toBe(false);
    for (const page of ["health", "findings", "discover", "recall"]) expect(f.content.action(`nav-${page}`)).toBeDefined();
    f.action("nav-recall").click(); await flush();
    expect(f.action("nav-recall").attrs["aria-current"]).toBe("page"); expect(f.factory).toHaveBeenCalledTimes(1);
    expect(f.content.texts()).toContain("Find flashcards"); expect(f.content.texts()).toContain("question::answer");
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    expect(f.adapter.exists.mock.calls.filter(([path]) => path === cardsPath)).toHaveLength(1);
    await f.view.onClose(); await f.view.onOpen(); expect(f.content.action("scan")).toBeDefined(); expect(f.content.action("recall-refresh")).toBeUndefined();
  });

  it.each(["onboarding", "health-recovery"])("%s still hides normal navigation and causes no Recall IO", async (kind) => {
    const f = fixture(undefined, kind !== "onboarding"); if (kind === "health-recovery") f.files.set(`${root}/findings.json`, "{");
    await f.view.onOpen(); expect(f.content.action("nav-recall")).toBeUndefined(); expect(f.factory).not.toHaveBeenCalled();
  });

  it("closing another workspace tab preserves the session; entering Recall transfers surface ownership", async () => {
    const f = await reviewFixture(); f.action("recall-reveal").click();
    const other = new VeynrelHealthView({ app: f.app } as never, f.health, vi.fn(), undefined, f.product);
    const content = other.contentEl as unknown as InstanceType<typeof mocks.Element>;
    await other.onOpen(); await other.onClose();
    expect(f.product.getSnapshot().session?.revealed).toBe(true); expect(f.content.texts()).toContain("SECRET ANSWER");
    await other.onOpen(); content.action("nav-recall")!.click();
    expect(f.action("nav-health").attrs["aria-current"]).toBe("page"); expect(f.content.texts()).not.toContain("SECRET ANSWER");
    expect(f.product.getSnapshot().session).toBeUndefined(); content.action("recall-start")!.click();
    await f.view.onClose(); expect(f.product.getSnapshot().session?.card).toBeDefined();
    expect(f.factory).toHaveBeenCalledTimes(1); expect(f.vault.read).toHaveBeenCalledTimes(1);
    await other.onClose(); expect(f.product.getSnapshot().session).toBeUndefined();
  });

  it("wakes an idle overview at its next due time and removes the wakeup on navigation", async () => {
    const f = await reviewFixture(); f.action("recall-reveal").click(); f.action("recall-again").click();
    await vi.waitFor(() => expect(f.product.getSnapshot().session?.complete).toBe(true));
    const dueAt = f.product.getSnapshot().nextDueAt!; vi.spyOn(Date, "now").mockReturnValue(200);
    f.action("recall-back").click(); expect(mocks.setTimeout).toHaveBeenLastCalledWith(expect.any(Function), dueAt - 200);
    const calls = mocks.setTimeout.mock.calls;
    const wake = calls[calls.length - 1][0];
    f.time(dueAt); vi.spyOn(Date, "now").mockReturnValue(dueAt); wake();
    expect(f.content.action("recall-start")).toBeDefined(); f.action("nav-health").click();
    expect(mocks.clearTimeout).toHaveBeenCalledWith(1);
  });

  it("first Find click alone scans, updates counts and exposes Start review", async () => {
    const f = fixture(); await f.view.onOpen(); f.action("nav-recall").click(); await flush();
    const entered = gate(), hold = gate(); f.vault.read.mockImplementationOnce(async () => { entered.release(); await hold.promise; return "## Flashcards\nQuestion::SECRET ANSWER"; });
    f.action("recall-refresh").click(); await entered.promise;
    expect(f.action("recall-refresh").disabled).toBe(true); expect(f.content.texts()).toContain("Scanning flashcards…");
    hold.release(); await vi.waitFor(() => expect(f.content.action("recall-start")).toBeDefined());
    expect(f.product.getSnapshot().summary).toMatchObject({ due: 1, new: 1, active: 1 }); expect(f.vault.read).toHaveBeenCalledTimes(1);
    expect(f.content.texts()).toContain("Active cards found: 1."); expect(mocks.requestUrl).not.toHaveBeenCalled();
  });
});

describe("Recall question/reveal/rate surface", () => {
  it("does not render the answer anywhere before reveal, then shows exactly four real previews and focuses each transition", async () => {
    const f = await reviewFixture();
    expect(f.content.texts()).toContain("Question"); expect(f.content.texts()).not.toContain("SECRET ANSWER");
    expect(f.content.action("recall-good")).toBeUndefined(); expect(f.content.action("recall-refresh")).toBeUndefined();
    expect(f.content.ownerDocument.activeElement?.attrs["data-recall-question"]).toBe("true");
    f.action("recall-reveal").focus(); f.action("recall-reveal").click();
    expect(f.content.texts()).toContain("SECRET ANSWER"); expect(f.content.ownerDocument.activeElement?.attrs["data-recall-answer"]).toBe("true");
    const id = f.product.getSnapshot().session!.card!.id, previews = f.service().previewCard(id, 200);
    for (const rating of ["again", "hard", "good", "easy"] as const) expect(f.action(`recall-${rating}`).texts()).toContain(formatRecallInterval(previews[rating].intervalMs));
    expect(f.action("recall-hard").texts()).toContain("5 min 30 sec");
    f.time(20_000); f.action("recall-good").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("You're caught up"));
    expect(f.service().getCard(id)?.schedule).toEqual(previews.good.schedule);
    expect(f.content.texts()).toContain("Reviewed this session: 1"); expect(f.content.texts()).not.toContain("SECRET ANSWER");
    f.action("recall-back").click(); expect(f.content.action("recall-refresh")).toBeDefined(); expect(f.content.texts()).toContain("Next review:");
  });

  it("focuses the next question only after durable success and blocks duplicate ratings", async () => {
    const f = fixture(); f.vault.read.mockResolvedValue("## Flashcards\nOne::ANSWER ONE\nTwo::ANSWER TWO");
    await f.view.onOpen(); f.action("nav-recall").click(); await flush(); await f.product.refreshCards(); f.action("recall-start").click();
    const id = f.product.getSnapshot().session!.card!.id; f.time(200); f.action("recall-reveal").click();
    const good = f.action("recall-good"), easy = f.action("recall-easy"), entered = gate(), hold = gate(), write = f.adapter.write;
    f.adapter.write = vi.fn(async (path, raw) => { entered.release(); await hold.promise; await write(path, raw); });
    good.click(); easy.click(); await entered.promise;
    expect(f.action("recall-good").disabled).toBe(true); expect(f.product.getSnapshot().session?.card?.id).toBe(id);
    hold.release(); await vi.waitFor(() => expect(f.product.getSnapshot().session?.reviewed).toBe(1));
    expect(f.product.getSnapshot().session?.card?.id).not.toBe(id); expect(f.adapter.write).toHaveBeenCalledTimes(1);
    expect(f.content.ownerDocument.activeElement?.attrs["data-recall-question"]).toBe("true");
    expect(f.content.texts()).not.toContain("ANSWER");
  });

  it("failed persistence keeps answer/card/count visible and offers scoped recovery", async () => {
    const f = await reviewFixture(); f.action("recall-reveal").click(); f.adapter.write.mockRejectedValueOnce(new Error("PRIVATE"));
    f.action("recall-good").click(); await vi.waitFor(() => expect(f.content.action("recall-retry")).toBeDefined());
    expect(f.content.texts()).toContain("Couldn't save this review."); expect(f.content.texts()).toContain("SECRET ANSWER");
    expect(f.content.texts()).toContain("Reviewed this session: 0"); expect(f.content.texts()).not.toContain("PRIVATE");
    expect(f.action("recall-good").disabled).toBe(true); f.action("nav-health").click(); expect(f.content.action("scan")).toBeDefined();
  });

  it.each(["navigate", "close"])("%s while saving never restores the old session surface", async (leave) => {
    const f = await reviewFixture(); f.action("recall-reveal").click(); const entered = gate(), hold = gate(), write = f.adapter.write;
    f.adapter.write = vi.fn(async (path, raw) => { entered.release(); await hold.promise; await write(path, raw); });
    f.action("recall-easy").click(); await entered.promise;
    if (leave === "navigate") f.action("nav-discover").click(); else { await f.view.onClose(); await f.view.onOpen(); }
    hold.release(); await vi.waitFor(() => expect(f.product.getSnapshot().reviewSaving).toBe(false));
    expect(f.content.texts()).not.toContain("SECRET ANSWER"); expect(f.content.action("recall-back")).toBeUndefined();
    f.action("nav-recall").click(); expect(f.content.action("recall-reveal")).toBeUndefined(); expect(f.product.getSnapshot().session).toBeUndefined();
    expect(f.service().listCards()[0].schedule.reviewCount).toBe(1);
  });

  it("source navigation validates paths at click time and a missing note never blocks a rating", async () => {
    const f = await reviewFixture(); f.open.mockImplementation((path) => openHealthNote(f.app, path));
    f.vault.getAbstractFileByPath.mockReturnValue(new mocks.TFile()); f.action("recall-source").click(); await flush(); expect(f.openFile).toHaveBeenCalledTimes(1);
    f.vault.getAbstractFileByPath.mockReturnValue(null); f.action("recall-source").click(); await flush(); expect(f.content.texts()).toContain("This note is no longer available.");
    expect(await openHealthNote(f.app, "../escape.md")).toBe(false); expect(await openHealthNote(f.app, "Private/Config/hidden.md")).toBe(false);
    f.action("recall-reveal").click(); f.action("recall-easy").click(); await vi.waitFor(() => expect(f.product.getSnapshot().session?.reviewed).toBe(1));
  });
});

describe("Recall keyboard boundaries", () => {
  it.each([["1", "again"], ["2", "hard"], ["3", "good"], ["4", "easy"]] as const)("%s activates %s only after reveal with review focus", async (key, rating) => {
    const f = await reviewFixture(), rate = vi.spyOn(f.product, "rate");
    f.content.ownerDocument.activeElement!.key(key); expect(rate).not.toHaveBeenCalled();
    // Reveal uses a real button's native activation; no document-wide Space/Enter interception.
    f.action("recall-reveal").click(); f.content.ownerDocument.activeElement!.key(key);
    expect(rate).toHaveBeenCalledExactlyOnceWith(rating);
    await vi.waitFor(() => expect(f.product.getSnapshot().session?.reviewed).toBe(1));
  });

  it("ignores modified/editable/outside-focus/repeated keys and unregisters detached review listeners", async () => {
    const f = await reviewFixture(); f.action("recall-reveal").click(); const rate = vi.spyOn(f.product, "rate");
    const answer = f.content.ownerDocument.activeElement!, review = answer.parent!.parent!;
    for (const flag of ["ctrlKey", "metaKey", "altKey", "shiftKey", "repeat"]) answer.key("3", { [flag]: true });
    for (const tag of ["input", "textarea", "select"]) { const input = review.createEl(tag); input.focus(); input.key("3"); }
    const edit = review.createDiv({ attr: { contenteditable: "true" } }).createSpan(); edit.focus(); edit.key("3");
    f.action("nav-health").focus(); answer.key("3"); expect(rate).not.toHaveBeenCalled();
    f.action("nav-health").click(); expect(review.listeners.get("keydown")?.size).toBe(0);
    answer.focus(); answer.key("3"); expect(rate).not.toHaveBeenCalled();
    f.action("nav-recall").click(); f.action("recall-start").click(); f.action("recall-reveal").click();
    const nextReview = f.content.ownerDocument.activeElement!.parent!.parent!; await f.view.onClose();
    expect(nextReview.listeners.get("keydown")?.size).toBe(0);
  });

  it("ignores rating shortcuts while a write is pending", async () => {
    const f = await reviewFixture(); f.action("recall-reveal").click(); const entered = gate(), hold = gate(), write = f.adapter.write;
    f.adapter.write = vi.fn(async (path, raw) => { entered.release(); await hold.promise; await write(path, raw); });
    f.action("recall-good").click(); await entered.promise; f.action("recall-easy").focus(); f.action("recall-easy").key("4");
    expect(f.adapter.write).toHaveBeenCalledTimes(1); hold.release(); await vi.waitFor(() => expect(f.product.getSnapshot().reviewSaving).toBe(false));
  });
});

describe("Recall recovery and presentation", () => {
  it("opens migrated v1 cards as due/new without writing, then writes v2 on the first UI rating", async () => {
    const card = candidate();
    const f = fixture(JSON.stringify({ version: 1, updatedAt: 10,
      cards: { [card.id]: { ...card, firstSeenAt: 10, lastSeenAt: 10, state: "active" } } }));
    await f.view.onOpen(); f.action("nav-recall").click(); await flush();
    expect(f.product.getSnapshot().summary).toMatchObject({ due: 1, new: 1 });
    expect(f.content.action("recall-recover")).toBeUndefined(); expect(f.adapter.write).not.toHaveBeenCalled();
    f.action("recall-start").click(); f.action("recall-reveal").click(); f.action("recall-easy").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("You're caught up"));
    expect(JSON.parse(f.files.get(cardsPath)!) as unknown).toMatchObject({ version: 2 });
    expect(f.vault.read).not.toHaveBeenCalled(); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
  });

  it.each(["{broken", '{"version":99}'])("scopes recovery to Recall and requires confirmation before moving %s", async (raw) => {
    const f = fixture(raw); await f.view.onOpen(); f.action("nav-recall").click(); await flush();
    expect(f.content.texts()).toContain("Recall data needs recovery"); expect(f.content.action("recall-refresh")).toBeUndefined();
    f.action("nav-findings").click(); expect(f.content.action("state-open")).toBeDefined();
    f.action("nav-discover").click(); expect(f.content.action("recall-recover")).toBeUndefined();
    f.action("nav-recall").click(); f.action("recall-recover").click();
    expect(f.content.texts()).toContain("Learned scheduling state will not automatically transfer"); expect(f.adapter.rename).not.toHaveBeenCalled();
    f.action("recall-cancel-recovery").click(); expect(f.files.get(cardsPath)).toBe(raw);
    f.action("recall-recover").click(); f.action("recall-confirm-recovery").click(); await vi.waitFor(() => expect(f.content.texts()).toContain("Find flashcards"));
    expect(f.files.get(cardsPath)).toBeUndefined(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it("shows recovery failure without a new writable surface", async () => {
    const f = fixture("{"); await f.view.onOpen(); f.action("nav-recall").click(); await flush();
    f.adapter.rename.mockRejectedValueOnce(new Error("PRIVATE")); f.action("recall-recover").click(); f.action("recall-confirm-recovery").click();
    await vi.waitFor(() => expect(f.content.texts()).toContain("Couldn't reset Recall data."));
    expect(f.content.action("recall-refresh")).toBeUndefined(); expect(f.files.get(cardsPath)).toBe("{"); expect(f.content.texts()).not.toContain("PRIVATE");
  });

  it.each(["en", "ru"] as const)("renders complete localized review copy in %s with semantic buttons/live status", async (language) => {
    setLanguage(language); const f = await reviewFixture(); f.action("recall-reveal").click();
    expect(f.content.texts()).not.toContain("@recall.");
    expect(f.action("recall-hard").texts()).toContain(language === "en" ? "5 min 30 sec" : "5 мин 30 с");
    for (const rating of ["again", "hard", "good", "easy"] as RecallRating[]) expect(f.action(`recall-${rating}`).tag).toBe("button");
    expect(f.content.all().find((element) => element.attrs.role === "status")?.attrs["aria-live"]).toBe("polite");
    expect(f.content.all().find((element) => element.cls.includes("veynrel-recall"))?.attrs["aria-busy"]).toBe("false");
  });

  it("distinguishes complete empty inventory from partial absence", async () => {
    const f = fixture(); await f.product.initialize(); f.vault.read.mockResolvedValue("No cards"); await f.product.refreshCards();
    expect(recallViewModel(f.product.getSnapshot()).emptyTitle).toBe("No flashcards found");
    f.vault.read.mockRejectedValueOnce(new Error("PRIVATE")); await f.product.refreshCards();
    const model = recallViewModel(f.product.getSnapshot()); expect(model.emptyTitle).toBe("No cards available"); expect(model.status).toContain("incomplete");
  });

  it.each([[1_000, "1 sec"], [60_000, "1 min"], [330_000, "5 min 30 sec"], [600_000, "10 min"], [10_800_000, "3 h"], [345_600_000, "4 days"]])("formats %s milliseconds as %s", (ms, expected) => expect(formatRecallInterval(Number(ms))).toBe(expected));

  it.each([[1, "1 день"], [2, "2 дня"], [5, "5 дней"], [21, "21 день"]])("uses Russian plural forms for %s days", (days, expected) => {
    setLanguage("ru"); expect(formatRecallInterval(Number(days) * 86_400_000)).toBe(expected);
  });
});
