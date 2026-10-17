import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
import { setLanguage } from "../i18n";
import { ChangePlannerView } from "./changePlannerView";
import { ChangePlannerSession } from "./changePlannerSession";
import { paragraphRanges } from "./changePlan";
import { mergeFixture } from "../tests/mergeFixture";

class Element {
  children: Element[] = []; text = ""; tag = "div"; attrs: Record<string, string> = {}; disabled = false; hidden = false; checked = false; value = "";
  listeners = new Map<string, () => void>();
  empty() { this.children = []; } setText(text: string) { this.text = text; }
  create(tag: string, opts: { text?: string; attr?: Record<string, string>; value?: string } = {}) {
    const e = new Element(); e.tag = tag; e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; e.value = opts.value ?? ""; this.children.push(e); return e;
  }
  createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
  addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
  all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
}
async function setup() {
  const f = mergeFixture(), root = new Element(), single = vi.fn(), multi = vi.fn();
  const session = new ChangePlannerSession({ analysis: () => f.analysis, read: async () => f.read });
  new ChangePlannerView(root as unknown as HTMLElement, session, f.analysis, single, multi); await session.prepare();
  const field = (name: string) => root.all().find(e => e.attrs["data-planner-field"] === name)!;
  const action = (name: string) => root.all().find(e => e.attrs["data-merge-action"] === name)!;
  const select = (name: string, value: string) => { const e = field(name); e.value = value; e.listeners.get("change")!(); };
  const check = (name: string) => { const e = field(name); e.checked = true; e.listeners.get("change")!(); };
  select("operation", "merge_knowledge");
  const choose = () => { select("merge-canonical", "0"); check(`merge-transfer-${paragraphRanges(f.pair[1])[1].start}`); select("merge-location", "0"); check("merge-confirm"); };
  const build = async () => { action("build").listeners.get("click")!(); await vi.waitFor(() => expect(session.view.stage).toBe("ready")); };
  return { ...f, root, session, single, multi, field, action, select, check, choose, build };
}
describe("merge choices and honest literal preview", () => {
  it.each(["en", "ru"] as const)("%s requires user canonical/block/context/point choices and offers no Apply", async language => {
    setLanguage(language); const f = await setup(); expect(f.field("merge-canonical").value).toBe(""); expect(f.action("build").disabled).toBe(true);
    expect(f.root.all().filter(e => e.attrs["data-merge-text"]?.startsWith("source-")).map(e => e.text)).toEqual(f.pair.map(n => n.content));
    f.select("merge-canonical", "0");
    expect(f.field(`merge-transfer-${paragraphRanges(f.pair[1])[2].start}`).disabled).toBe(true);
    f.check(`merge-transfer-${paragraphRanges(f.pair[1])[1].start}`); f.select("merge-location", "0"); expect(f.action("build").disabled).toBe(true);
    f.check("merge-confirm"); expect(f.action("build").disabled).toBe(false); await f.build();
    const all = f.root.all(), plan = f.session.view.mergePlan!;
    expect(all.find(e => e.attrs["data-merge-text"] === "after")?.text).toBe(plan.canonical.after);
    expect(all.filter(e => e.attrs["data-merge-text"]?.startsWith("retained-")).map(e => e.text).join("")).toBe(plan.secondary.content);
    expect(all.some(e => e.attrs["data-safe-action"] || e.attrs["data-multi-action"])).toBe(false);
    expect(f.single).not.toHaveBeenCalled(); expect(f.multi).not.toHaveBeenCalled();
    expect(all.some(e => /^@(merge|relationship|planner)\./u.test(e.text))).toBe(false);
    f.select("merge-canonical", "1"); expect(f.session.view.mergePlan).toBeUndefined(); expect(f.field("merge-location").value).toBe("");
    expect(f.root.all().filter(e => e.attrs["data-planner-field"]?.startsWith("merge-transfer-")).every(e => !e.checked)).toBe(true);
  });
  it("decline clears the plan; switching operation retains the existing no-change and single-file paths", async () => {
    const f = await setup(); f.choose(); await f.build(); f.action("cancel").listeners.get("click")!(); expect(f.session.view.stage).toBe("cancelled");
    expect(f.session.view.mergePlan).toBeUndefined(); await f.session.prepare(); f.select("operation", "no_change");
    f.root.all().find(e => e.attrs["data-planner-action"] === "build")!.listeners.get("click")!();
    await vi.waitFor(() => expect(f.session.view.plan?.operation).toBe("no_change")); expect(f.session.view.mergePlan).toBeUndefined();
    f.select("operation", "add_link"); f.select("range", "0"); f.check("confirm");
    f.root.all().find(e => e.attrs["data-planner-action"] === "build")!.listeners.get("click")!();
    await vi.waitFor(() => expect(f.session.view.plan?.operation).toBe("add_link"));
    f.root.all().find(e => e.attrs["data-safe-action"] === "review")!.listeners.get("click")!(); expect(f.single).toHaveBeenCalledOnce();
  });
  it("shows hostile source markup as text without creating elements", async () => {
    const f = await setup(); f.pair[0].content += '\n<img src="https://example.invalid">\n'; f.session.changeSelection();
    const elements = f.root.all(); expect(elements.some(e => e.tag === "pre" && e.text.includes("<img"))).toBe(true);
    expect(elements.some(e => ["img", "script", "iframe"].includes(e.tag))).toBe(false);
  });
});
