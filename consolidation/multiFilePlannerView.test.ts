import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
import { setLanguage } from "../i18n";
import { ChangePlannerView } from "./changePlannerView";
import { ChangePlannerSession } from "./changePlannerSession";
import { multiFileFixture } from "../tests/multiFileFixture";

class Element {
    closest() { return null; }
  focused = false;
  focus() { this.focused = true; }
  setAttribute(key: string, value: string) { this.attrs[key] = value; }
  querySelector() { return this.all().find(e => ["alert", "status"].includes(e.attrs.role) || e.tag === "h3") ?? null; }
  children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false; hidden = false; checked = false; value = "";
  listeners = new Map<string, () => void>();
  empty() { this.children = []; } setText(text: string) { this.text = text; }
  create(tag: string, opts: { text?: string; attr?: Record<string, string>; value?: string } = {}) {
    const child = new Element(); child.tag = tag; child.text = opts.text ?? ""; child.attrs = opts.attr ?? {}; child.value = opts.value ?? "";
    this.children.push(child); return child;
  }
  createEl(tag: string, opts = {}) { return this.create(tag, opts); }
  createDiv(opts = {}) { return this.create("div", opts); }
  createSpan(opts = {}) { return this.create("span", opts); }
  addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
  all(): Element[] { return [this, ...this.children.flatMap(child => child.all())]; }
}
async function setup() {
  const f = multiFileFixture(), root = new Element(), review = vi.fn();
  const session = new ChangePlannerSession({ analysis: () => f.analysis, read: async () => f.read });
  new ChangePlannerView(root as unknown as HTMLElement, session, f.analysis, review); await session.prepare();
  const field = (name: string) => root.all().find(e => e.attrs["data-planner-field"] === name)!;
  const action = (name: string) => root.all().find(e => e.attrs["data-planner-action"] === name)!;
  const select = (name: string, value: string) => { const e = field(name); e.value = value; e.listeners.get("change")!(); };
  const check = (name: string) => { const e = field(name); e.checked = true; e.listeners.get("change")!(); };
  const build = async () => { action("buildMulti").listeners.get("click")!(); await vi.waitFor(() => expect(session.view.stage).toBe("ready")); };
  return { ...f, root, review, session, field, action, select, check, build };
}
describe("combined plan controls and preview", () => {
  it.each(["ru", "en"] as const)("%s requires both locations, preserves full literal text, and never offers Apply", async language => {
    setLanguage(language); const f = await setup();
    f.select("operation", "add_reciprocal_links"); expect(f.action("buildMulti").disabled).toBe(true);
    f.select("range-0", "1"); f.select("range-1", "2");
    f.check("confirm-0"); expect(f.action("buildMulti").disabled).toBe(true);
    f.check("confirm-1"); expect(f.action("buildMulti").disabled).toBe(false); await f.build();
    const elements = f.root.all();
    expect(elements.filter(e => e.attrs["data-multi-file"])).toHaveLength(2);
    expect(elements.filter(e => e.attrs["data-planner-text"] === "before").map(e => e.text)).toEqual(f.pair.map(n => n.content));
    expect(elements.some(e => e.tag === "pre" && e.text.includes('<img src="https://example.invalid/tracker">'))).toBe(true);
    expect(elements.some(e => ["img", "iframe", "script"].includes(e.tag))).toBe(false);
    expect(elements.some(e => e.attrs["data-safe-action"])).toBe(false); expect(f.review).not.toHaveBeenCalled();
    expect(elements.some(e => e.text.startsWith("@multi.") || e.text.startsWith("@planner."))).toBe(false);
    expect(f.session.view.plan).toBeUndefined();
    f.select("range-0", "2"); expect(f.session.view.multiPlan).toBeUndefined();
    expect(f.field("confirm-0").checked).toBe(false); expect(f.field("confirm-1").checked).toBe(false);
    expect(f.action("buildMulti").disabled).toBe(true);
  });
  it("switching back keeps the original single-file Safe Apply review and no-change behavior", async () => {
    const f = await setup(); f.select("operation", "add_reciprocal_links"); f.select("range-0", "1"); f.select("range-1", "2");
    f.check("confirm-0"); f.check("confirm-1"); await f.build();
    f.select("operation", "add_link"); expect(f.session.view.multiPlan).toBeUndefined();
    f.select("range", "0"); f.check("confirm"); f.action("build").listeners.get("click")!();
    await vi.waitFor(() => expect(f.session.view.plan?.operation).toBe("add_link"));
    f.root.all().find(e => e.attrs["data-safe-action"] === "review")!.listeners.get("click")!();
    expect(f.review).toHaveBeenCalledWith(f.session.view.plan);
    f.select("operation", "no_change"); f.action("build").listeners.get("click")!();
    await vi.waitFor(() => expect(f.session.view.plan?.operation).toBe("no_change"));
    expect(f.root.all().some(e => e.attrs["data-safe-action"])).toBe(false);
  });
  it("cancellation and preparation clear both selections instead of choosing a replacement paragraph", async () => {
    const f = await setup(); f.select("operation", "add_reciprocal_links"); f.select("range-0", "1"); f.select("range-1", "2");
    f.check("confirm-0"); f.check("confirm-1"); await f.build(); f.action("cancel").listeners.get("click")!();
    expect(f.session.view.multiPlan).toBeUndefined(); f.action("prepare").listeners.get("click")!();
    await vi.waitFor(() => expect(f.session.view.stage).toBe("choosing"));
    f.select("operation", "add_reciprocal_links"); expect(f.field("range-0").value).toBe(""); expect(f.field("range-1").value).toBe("");
    expect(f.action("buildMulti").disabled).toBe(true);
  });
});
