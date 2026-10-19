import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
import { setLanguage } from "../i18n";
import { ChangePlannerView } from "./changePlannerView";
import { ChangePlannerSession } from "./changePlannerSession";
import { renderGroupPlanner } from "./groupPlannerView";
import { groupFixture } from "../tests/groupFixture";
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
    const e = new Element(); e.tag = tag; e.text = opts.text ?? ""; e.attrs = opts.attr ?? {}; e.value = opts.value ?? ""; this.children.push(e); return e;
  }
  createEl(tag: string, opts = {}) { return this.create(tag, opts); } createDiv(opts = {}) { return this.create("div", opts); } createSpan(opts = {}) { return this.create("span", opts); }
  addEventListener(event: string, fn: () => void) { this.listeners.set(event, fn); }
  all(): Element[] { return [this, ...this.children.flatMap(e => e.all())]; }
}

describe("GroupPlan UI without an execution callback remains read-only",()=>{
  it.each(["ru","en"] as const)("%s: independent confirmations, full previews, explicit distinct intent and cleared selection", async language=>{
    setLanguage(language);const f=groupFixture(); f.analysis.result.relation="related_distinct";f.analysis.result.recommendation.action="manual_review";
    const root=new Element(),single=vi.fn(),multi=vi.fn(),merge=vi.fn();
    const s=new ChangePlannerSession({analysis:()=>f.analysis,read:async()=>f.read});
    new ChangePlannerView(root as unknown as HTMLElement,s,f.analysis,single,multi,merge);await s.prepare();
    const field=(key:string)=>root.all().find(e=>e.attrs["data-planner-field"]===key)!;
    const select=(key:string,value:string)=>{const e=field(key);e.value=value;e.listeners.get("change")!()};
    const check=(key:string)=>{const e=field("group-"+key);e.checked=true;e.listeners.get("change")!()};
    const build=()=>root.all().find(e=>e.attrs["data-group-action"]==="build")!;
    select("operation","copy_context_group");expect(build().disabled).toBe(true);expect(field("group-canonical").value).toBe("");
    select("group-canonical","0");select("group-selection",String(f.choice.group!.start));check("groupConfirmed");
    select("group-representation","original_heading_branch");check("contextConfirmed");select("group-dependencies","unresolved");
    select("group-insertion",String(f.choice.insertion));check("insertionConfirmed");expect(build().disabled).toBe(true);
    select("group-dependencies","reviewed");expect(build().disabled).toBe(true);check("distinctIntent");expect(build().disabled).toBe(false);
    build().listeners.get("click")!();await vi.waitFor(()=>expect(s.view.stage).toBe("ready"));
    expect(root.all().find(e=>e.attrs["data-group-text"]==="before")?.text).toBe(f.pair[0].content);
    expect(root.all().find(e=>e.attrs["data-group-text"]==="after")?.text).toBe(s.view.groupPlan!.canonical.after);
    expect(root.all().some(e=>/^@(group|planner|merge)\./u.test(e.text))).toBe(false);
    expect(root.all().some(e=>e.attrs["data-safe-action"]||e.attrs["data-merge-apply-action"]||e.attrs["data-multi-action"])).toBe(false);
    expect(single).not.toHaveBeenCalled();expect(multi).not.toHaveBeenCalled();expect(merge).not.toHaveBeenCalled();
    select("group-selection",String(f.choice.group!.start));expect(s.view.groupPlan).toBeUndefined();expect(field("group-contextConfirmed").checked).toBe(false);
    expect(field("group-insertion").value).toBe("");select("group-canonical","1");expect(field("group-selection").value).toBe("");
    root.all().find(e=>e.attrs["data-group-action"]==="cancel")!.listeners.get("click")!();expect(s.view.stage).toBe("cancelled");
  });
});

it("a ready GroupPlan opens only the separate explicit review callback",async()=>{
  const f=groupFixture(),s=new ChangePlannerSession({analysis:()=>f.analysis,read:async()=>f.read}),review=vi.fn();
  await s.prepare();const before=new Element();renderGroupPlanner(before as unknown as HTMLElement,s,f.analysis,f.choice,vi.fn(),review);
  expect(before.all().some(e=>e.attrs["data-group-apply-action"])).toBe(false);await s.buildGroup(f.choice);
  const root=new Element();renderGroupPlanner(root as unknown as HTMLElement,s,f.analysis,f.choice,vi.fn(),review);expect(review).not.toHaveBeenCalled();
  root.all().find(e=>e.attrs["data-group-apply-action"]==="review")!.listeners.get("click")!();expect(review).toHaveBeenCalledExactlyOnceWith(s.view.groupPlan);
});
