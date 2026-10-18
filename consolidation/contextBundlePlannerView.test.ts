import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn() }));
import { setLanguage } from "../i18n";
import { ChangePlannerView } from "./changePlannerView";
import { ChangePlannerSession } from "./changePlannerSession";
import { bundleFixture } from "../tests/contextBundleFixture";
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

describe("ContextBundlePlan UI has no apply route",()=>{
  it.each(["ru","en"] as const)("%s: independent confirmations, full previews, explicit distinct intent and cleared selection", async language=>{
    setLanguage(language);const f=bundleFixture(); f.analysis.result.relation="related_distinct";f.analysis.result.recommendation.action="manual_review";
    const root=new Element(),single=vi.fn(),multi=vi.fn(),merge=vi.fn();
    const s=new ChangePlannerSession({analysis:()=>f.analysis,read:async()=>f.read});
    new ChangePlannerView(root as unknown as HTMLElement,s,f.analysis,single,multi,merge);await s.prepare();
    const field=(key:string)=>root.all().find(e=>e.attrs["data-planner-field"]===key)!;
    const select=(key:string,value:string)=>{const e=field(key);e.value=value;e.listeners.get("change")!()};
    const check=(key:string)=>{const e=field("bundle-"+key);e.checked=true;e.listeners.get("change")!()};
    const build=()=>root.all().find(e=>e.attrs["data-bundle-action"]==="build")!;
    select("operation","copy_context_bundle");expect(build().disabled).toBe(true);expect(field("bundle-canonical").value).toBe("");
    select("bundle-canonical","0");select("bundle-kind","code_explanation");select("bundle-selection",String(f.choice.core!.start));check("boundariesConfirmed");
    for(const r of f.choice.context)check("context-"+r.start);check("contextConfirmed");select("bundle-dependencies","unresolved");
    select("bundle-insertion",String(f.choice.insertion));check("insertionConfirmed");expect(build().disabled).toBe(true);
    select("bundle-dependencies","reviewed");expect(build().disabled).toBe(true);check("distinctIntent");expect(build().disabled).toBe(false);
    build().listeners.get("click")!();await vi.waitFor(()=>expect(s.view.stage).toBe("ready"));
    expect(root.all().find(e=>e.attrs["data-bundle-text"]==="before")?.text).toBe(f.pair[0].content);
    expect(root.all().find(e=>e.attrs["data-bundle-text"]==="after")?.text).toBe(s.view.bundlePlan!.canonical.after);
    expect(root.all().some(e=>/^@(bundle|planner|merge)\./u.test(e.text))).toBe(false);
    expect(root.all().some(e=>e.attrs["data-safe-action"]||e.attrs["data-merge-apply-action"]||e.attrs["data-multi-action"])).toBe(false);
    expect(single).not.toHaveBeenCalled();expect(multi).not.toHaveBeenCalled();expect(merge).not.toHaveBeenCalled();
    select("bundle-selection",String(f.choice.core!.start));expect(s.view.bundlePlan).toBeUndefined();expect(field("bundle-contextConfirmed").checked).toBe(false);
    expect(field("bundle-insertion").value).toBe("");select("bundle-canonical","1");expect(field("bundle-kind").value).toBe("");expect(field("bundle-selection")).toBeUndefined();
    root.all().find(e=>e.attrs["data-bundle-action"]==="cancel")!.listeners.get("click")!();expect(s.view.stage).toBe("cancelled");
  });
});
