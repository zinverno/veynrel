import { describe, expect, it, vi } from "vitest";
const dom = vi.hoisted(() => {
  const document: { activeElement?: Element } = {};
  class Element {
    closest() { return null; }
    hidden = false; scrollTop = 0; selectionStart = 0; selectionEnd = 0;
    contains(el: Element) { return this.all().includes(el); }
    setSelectionRange() {}
    children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; cls = "";
    value = ""; disabled = false; checked = false; open = false; parentElement?: Element; ownerDocument = document;
    listeners = new Map<string, () => void>();
    empty() { this.children = []; this.text = ""; }
    addClass(...names: string[]) { this.cls += ` ${names.join(" ")}`; }
    setText(text: string) { this.text = text; }
    setAttribute(key: string, value: string) { this.attrs[key] = value; }
    getAttribute(key: string) { return this.attrs[key] ?? null; }
    create(tag: string, options: { text?: string; attr?: Record<string, string>; cls?: string; value?: string } = {}) {
      const el = new Element(); el.tag = tag; el.text = options.text ?? ""; el.attrs = options.attr ?? {}; el.cls = options.cls ?? ""; el.value = options.value ?? "";
      el.parentElement = this; this.children.push(el); return el;
    }
    createEl(tag: string, options = {}) { return this.create(tag, options); }
    createDiv(options = {}) { return this.create("div", options); }
    createSpan(options = {}) { return this.create("span", options); }
    addEventListener(key: string, fn: () => void) { this.listeners.set(key, fn); }
    all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
    matches(selector: string): boolean {
      return selector.split(",").some(part => {
        const value = part.trim(), match = /^\[([^=\]]+)(?:="([^"]*)")?\]$/u.exec(value);
        return match ? this.attrs[match[1]] !== undefined && (match[2] === undefined || this.attrs[match[1]] === match[2]) : this.tag === value;
      });
    }
    querySelector(selector: string) { return this.all().slice(1).find(el => el.matches(selector)); }
    querySelectorAll(selector: string) { return this.all().slice(1).filter(el => el.matches(selector)); }
    focus() { document.activeElement = this; }
    click() { if (!this.disabled) this.listeners.get("click")?.(); }
    change(value?: string) { if (value !== undefined) this.value = value; this.listeners.get("change")?.(); }
  }
  const modals: Modal[] = [];
  class Modal {
    contentEl = new Element(); titleEl = new Element(); modalEl = new Element(); opened = false;
    constructor(readonly app: unknown) { modals.push(this); }
    onOpen() {} onClose() {}
    open() { this.opened = true; this.onOpen(); }
    close() { this.opened = false; this.onClose(); }
  }
  return { Element, Modal, modals, document };
});
vi.mock("obsidian", () => ({ getLanguage: () => "en", setIcon: vi.fn() }));
vi.mock("./workbenchSimulation", () => ({ WorkbenchSimulation: class { constructor() { throw Error("Simulation must not exist on list route"); } } }));
vi.mock("./workbenchGraph", () => ({ renderWorkbenchGraph: () => { throw Error("Renderer must not run"); } }));
import { setLanguage } from "../../i18n";
import { ReviewListView } from "./reviewListView";
import { WorkbenchData } from "./workbenchData";
import { pairId } from "./workbenchModel";
import type { Finding } from "../domain/finding";

const paths = ["Practice/Task.md", "Theory/Task.md"];
const finding = { id: "saved", state: "open", type: "semantic-duplicate", notePaths: paths, evidence: [] } as unknown as Finding;
function setup(scopePaths = paths, localFacts?: import("./workbenchData").PairReviewPort["localFacts"]) {
  setLanguage("en");
  dom.document.activeElement = undefined;
  const root = new dom.Element();
  const forbidden = vi.fn(() => { throw Error("Graphical dependency called"); });
  const data = new WorkbenchData({ id: "all", revision: 1, paths: scopePaths }, {
    topology: { getSnapshot: () => ({ state: "idle" }), subscribe: () => () => {}, refresh: forbidden, load: forbidden, dispose: vi.fn() },
    createSemantic: forbidden, createComparison: forbidden,
  }, false);
  const close = vi.fn(), mount = vi.fn((_container: HTMLElement, _paths: readonly [string, string]) => close), history = vi.fn();
  const map = vi.fn(() => ({ update: vi.fn(), dispose: vi.fn() }));
  const view = new ReviewListView(root as unknown as HTMLElement, data, { mount, localFacts }, { map, history, settings: vi.fn() }, root as unknown as HTMLElement);
  view.update([finding]);
  const action = (key: string) => root.querySelector(`[data-health-action="${key}"]`)!;
  return { root, data, view, mount, close, map, history, forbidden, action };
}
describe("standalone review list", () => {
  it("opens, searches, compares and returns with no graphical construction or work", async () => {
    const f = setup();
    expect(f.root.all().map(e => e.text).join(" ")).toContain("Saved finding");
    const search = f.action("review-search"); search.value = "Task"; search.listeners.get("input")!();
    const compare = f.root.querySelector("[data-pair-id]")!;
    f.root.scrollTop = 230; compare.click(); compare.click();
    expect(f.mount).toHaveBeenCalledOnce(); expect(f.mount.mock.calls[0][1]).toEqual(paths);
    const back = f.action("review-back"); back.click();
    expect(f.close).toHaveBeenCalledOnce(); expect(f.root.scrollTop).toBe(230);
    expect(f.action("review-search").value).toBe("Task");
    expect(dom.document.activeElement?.attrs["data-pair-id"]).toBe(pairId(...paths as [string, string]));
    f.root.querySelector("[data-pair-id]")!.click(); back.click(); expect(f.close).toHaveBeenCalledOnce();
    f.view.suspend(); expect(f.close).toHaveBeenCalledTimes(2);
    f.view.update([finding]); f.action("review-history").click(); expect(f.history).toHaveBeenCalledOnce();
    await f.data.refresh("repeats"); expect(f.forbidden).not.toHaveBeenCalled(); expect(f.map).not.toHaveBeenCalled(); f.view.dispose();
  });
  it("separates ItemViews and creates/disposes a map only after its explicit action", () => {
    const a = setup(), b = setup(); a.action("review-map").click(); expect(a.map).toHaveBeenCalledOnce(); expect(b.map).not.toHaveBeenCalled();
    const graphical = a.map.mock.results[0].value as { dispose: ReturnType<typeof vi.fn> }; a.action("review-back").click(); expect(graphical.dispose).toHaveBeenCalledOnce();
    expect(b.mount).not.toHaveBeenCalled(); a.view.dispose(); b.view.dispose();
  });
  it("inherits only navigation on scope replacement, never a live pair owner", () => {
    const a = setup(), b = setup();
    const search = a.action("review-search"); search.value = "Task"; search.listeners.get("input")!();
    a.root.querySelector("[data-pair-id]")!.click(); a.view.dispose(); b.view.inheritNavigation(a.view);
    expect(a.close).toHaveBeenCalledOnce(); expect(b.mount).not.toHaveBeenCalled();
    expect(b.action("review-search").value).toBe("Task"); b.view.dispose();
  });
  it("keeps all saved candidates in source order across pages and distinguishes same basenames", () => {
    const scope = [paths[0], ...Array.from({ length: 133 }, (_, i) => `Theory/${i}/Task.md`)];
    const f = setup(scope);
    f.view.update(scope.slice(1).map((path, i) => ({ ...finding, notePaths: [paths[0], path], id: String(i) })));
    expect(f.root.querySelectorAll("[data-pair-id]")).toHaveLength(60);
    f.action("review-more").focus(); f.action("review-more").click();
    expect(f.root.querySelectorAll("[data-pair-id]")).toHaveLength(120);
    expect(dom.document.activeElement?.attrs["data-health-action"]).toBe("review-more");
    f.action("review-more").click(); expect(f.root.querySelectorAll("[data-pair-id]")).toHaveLength(133);
    expect(f.root.querySelectorAll("[data-pair-id]").map(el => el.attrs["data-pair-id"])).toEqual(scope.slice(1).map(path => pairId(paths[0], path)));
    const text = f.root.all().map(e => e.text).join(" "); expect(text).toContain(paths[0]); expect(text).toContain(scope[1]);
    f.view.dispose();
  });
});

it("local Apply/Undo facts retain the candidate and never present stale observations as fresh", () => {
  let notify = () => {};
  let fact: import("./reviewFacts").ReviewFact = { state: "ready", links: [false, false] };
  const local = { get: () => fact, track: vi.fn(), refresh: vi.fn(), reopen: vi.fn(), dispose: vi.fn() };
  const f = setup(paths, changed => { notify = changed; return local; });
  const id = f.root.querySelector("[data-pair-id]")!.attrs["data-pair-id"];
  fact = { state: "ready", links: [true, false], changed: true, operation: { id: "op", paths, state: "applied", created: 1, operation: "add_link" } };
  notify();
  let text = f.root.all().map(e => e.text).join(" ");
  expect(text).toContain("semantic freshness is unconfirmed"); expect(text).toContain("Link A → B already exists.");
  expect(f.root.querySelector("[data-pair-id]")!.attrs["data-pair-id"]).toBe(id);
  fact = { ...fact, links: [false, false], operation: { ...fact.operation!, state: "undone" } }; notify();
  text = f.root.all().map(e => e.text).join(" ");
  expect(text).toContain("Change undone."); expect(text).not.toContain("Link A → B already exists.");
  expect(f.root.querySelector("[data-pair-id]")!.attrs["data-pair-id"]).toBe(id);
  f.view.dispose(); expect(local.dispose).toHaveBeenCalledOnce();
});
