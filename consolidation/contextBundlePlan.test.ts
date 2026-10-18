import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn(), parseLinktext: (s: string) => ({path:s}) }));
import { buildContextBundlePlan, validateContextBundlePlan } from "./contextBundlePlan";
import { contextBundleCandidates, contextBundleDestination } from "./contextBundleStructure";
import { bundleFixture, bundleNote } from "../tests/contextBundleFixture";
import { ChangePlannerSession } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";
import corpus from "../tests/fixtures/consolidation-realistic-v1.json";
import { mergeBlockFailure, mergeHints } from "./mergePlan";
import { paragraphRanges } from "./changePlan";

const build=(f=bundleFixture())=>buildContextBundlePlan(f.analysis,f.pair,f.choice,f.read.linktexts);
const fail=(fn:()=>unknown,reason:string)=>expect(fn).toThrow(expect.objectContaining({reason}));
describe("ContextBundlePlan separate read-only contract",()=>{
  it.each(["```js\nreturn freeSlots > 0;\n```","1. Проверить название.\n2. Не выдумывать дату.","> Donor recollection."])("copies complete %s, ordered context and originals", core=>{
    for(const canonical of [0,1] as const) for(const newline of ["\n","\r\n"]){
      const f=bundleFixture(core,canonical,newline),p=build(f);
      expect(p.canonical.before).toBe(f.pair[canonical].content);expect(p.secondary.content).toBe(f.pair[1-canonical].content);
      expect(p.canonical.after).toBe(p.canonical.before+p.insertion.edit.inserted);
      expect(p.insertion.edit.inserted).toBe(newline.repeat(2)+p.bundle.range.text);
      expect([...p.bundle.retained,p.bundle.range].sort((a,b)=>a.start-b.start).map(r=>r.text).join("")).toBe(p.secondary.content);
      for(const b of p.bundle.blocks) expect(p.secondary.content.slice(b.range.start,b.range.end)).toBe(b.range.text);
      expect(p.bundle.blocks.map(b=>b.role)).toEqual(["context_before","context_before","core","context_after"]);
      expect(p.readOnly).toBe(true);expect(p.operation).toBe("copy_context_bundle");
      expect(JSON.parse(JSON.stringify(p))).toEqual(p);expect(JSON.stringify(p)).not.toContain('"file":');
      expect(validateContextBundlePlan(p,f.analysis,f.pair,f.choice,f.read.linktexts)).toEqual(p);
    }
  });
  it("preserves Cyrillic, combining characters, astral characters and CRLF literally",()=>{
    const f=bundleFixture("```text\nКириллица 🪶 é\n```",1,"\r\n"),p=build(f);
    expect(p.canonical.after).toContain("Кириллица 🪶 é\r\n");expect(p.bundle.core.end-p.bundle.core.start).toBe(p.bundle.core.text.length);
  });
  it.each(["07","08","09"])("frozen scenario %s has complete source context, without altering reference annotations",id=>{
    const c=corpus.cases.find(c=>c.id.startsWith(id))!;
    const f=bundleFixture();f.pair.forEach((n,i)=>Object.assign(n,bundleNote(c.paths[i],c.notes[i])));
    f.analysis.pair=[{...f.pair[0]},{...f.pair[1]}];f.analysis.result=c.controlResponse as typeof f.analysis.result;
    const candidate=contextBundleCandidates(f.pair[1])[0];
    Object.assign(f.choice,{kind:candidate.kind,core:candidate.core,context:[...candidate.before,...candidate.after],insertion:f.pair[0].content.length});
    const p=build(f);expect(p.bundle.range.text).toBe(c.notes[1].trimEnd());
    expect(p.provenance.analysis).toEqual(c.controlResponse);expect(p.limitations).toContain("user_context_roles_not_proof");
  });
  it.each(["```js\nreturn 1;","```js\nreturn 1;\n~~~","```js\n```\n```"," ```js\nreturn 1;\n```"])("refuses incomplete/ambiguous fence %s",core=>{
    if(core.startsWith(" ")) {const n=bundleNote("X.md",`Intro.\n\n${core}\n\nOutro.`);n.cache!.sections![1].type="code";expect(contextBundleCandidates(n)[0].failure).toBe("fence");}
    else fail(()=>build(bundleFixture(core)),"fence");
  });
  it.each(["1. First.\n3. Missing second.","- First.\n  - Nested.","- First.\n  Continuation.","- [ ] Task.","- First.\n+ Different marker.","1. First.\n2. …","1. 1. Nested item.","- - Nested item.","1. --- ","1. 1."])("refuses list %s",core=>{
    expect(()=>build(bundleFixture(core))).toThrow();
  });
  it("requires complete native item positions and rejects missing or orphaned items",()=>{
    const f=bundleFixture("1. First.\n2. Second.");f.pair[1].cache!.listItems!.pop();fail(()=>build(f),"metadata");
    const g=bundleFixture("1. First.\n2. Second.");g.pair[1].cache!.listItems![1].parent=4;fail(()=>build(g),"list");
    for(const [start,end] of [[-4,-1],[0,2],[2,10000],[3,3]]){
      const n=bundleFixture("1. First.\n2. Second.").pair[1];
      n.cache!.listItems!.push({parent:0,position:{start:{offset:start,line:0,col:0},end:{offset:end,line:0,col:0}}});
      fail(()=>contextBundleCandidates(n),"metadata");
    }
  });
  it.each(["> > Nested.","> First.\nLazy continuation.","> [!info] Callout.","> Claim.\n>","> - Nested item.","> 1. Nested item.",">     indented code","> ---","> ===","> --- ","> -- -","> +","> 1."])("refuses quotation %s",core=>fail(()=>build(bundleFixture(core)),"quotation"));
  it.each(["> Claim.\n\nStatus.","Attribution.\n\n> Claim."])("requires both attribution/scope and status context",text=>{
    expect(contextBundleCandidates(bundleNote("X.md",text))[0].failure).toBe("context");
  });
  it.each(["[[Link]]","![[Embed]]","Text ^id","Text [^footnote]","https://example.invalid","ftp://example.invalid","mailto:a@example.invalid","<span>HTML</span>"])("refuses protected context %s",text=>{
    const f=bundleFixture(),n=f.pair[1];Object.assign(n,bundleNote(n.path,n.content.replace("This observation does not establish a general rule.",text)));
    expect(contextBundleCandidates(n)[0].failure).toBe("protected");
  });
  it("native dependencies and uncovered source cannot disappear behind plain literals",()=>{
    const n=bundleFixture().pair[1],pos=n.cache!.sections![0].position;
    n.cache!.blocks={id:{id:"id",position:pos}};expect(contextBundleCandidates(n)[0].failure).toBe("protected");
    n.cache!.blocks={};n.cache!.sections!.pop();fail(()=>contextBundleCandidates(n),"metadata");
  });
  it("repeated core text has distinct offsets; shared contexts are unresolved, never selected by quote",()=>{
    const n=bundleNote("X.md","Intro.\n\n> Same.\n\nMiddle.\n\n> Same.\n\nOutro."),c=contextBundleCandidates(n);
    expect(c).toHaveLength(2);expect(c[0].core.text).toBe(c[1].core.text);expect(c[0].core.start).not.toBe(c[1].core.start);
    expect(c.every(c=>c.failure==="dependencies")).toBe(true);
  });
  it("rejects headings on either side, properties and prose-only adjacency",()=>{
    fail(()=>contextBundleCandidates(bundleNote("X.md","# Scope\n\nIntro.\n\n> Quote.\n\nOutro.")),"heading");
    fail(()=>contextBundleDestination(bundleNote("X.md","# Other scope\n\nBody.")),"heading");
    const n=bundleFixture().pair[1];n.cache!.frontmatter={scope:"Unknown"};fail(()=>contextBundleCandidates(n),"context");
    expect(contextBundleCandidates(bundleNote("X.md","If this applies.\n\nIt only works then."))).toEqual([]);
  });
  it.each(["boundariesConfirmed","contextConfirmed","insertionConfirmed"] as const)("requires independent %s",key=>{
    const f=bundleFixture();f.choice[key]=false;fail(()=>build(f),"confirmation");
  });
  it("requires all selected context in exact order, explicit dependencies and EOF",()=>{
    const f=bundleFixture();f.choice.context.reverse();fail(()=>build(f),"context");f.choice.context.reverse();
    f.choice.context.pop();fail(()=>build(f),"context");
    const g=bundleFixture();g.choice.dependencies="unresolved";fail(()=>build(g),"dependencies");g.choice.dependencies="reviewed";
    g.choice.insertion=0;fail(()=>build(g),"range");
  });
  it.each(["conflicting","unrelated","insufficient_context"] as const)("%s cannot be permitted structurally",relation=>{
    const f=bundleFixture();f.analysis.result.relation=relation;f.analysis.result.recommendation.action="manual_review";
    if(relation==="conflicting")f.analysis.result.claims[0].kind="conflict";fail(()=>build(f),"semantic");
  });
  it("versions are refused and related-distinct needs separate intent without rewriting recommendation",()=>{
    const f=bundleFixture();f.analysis.result.relation="conflicting";f.analysis.result.recommendation.action="manual_review";f.analysis.result.claims[0].kind="version_difference";fail(()=>build(f),"semantic");
    const g=bundleFixture();g.analysis.result.relation="related_distinct";g.analysis.result.recommendation.action="manual_review";
    fail(()=>build(g),"intent");g.choice.distinctIntent=true;expect(build(g).provenance.analysis.recommendation.action).toBe("manual_review");
  });
  it("rejects partial core and plan tampering; old MergePlan rules remain strict",()=>{
    const f=bundleFixture(),p=build(f);f.choice.core!.start++;fail(()=>build(f),"range");f.choice.core!.start--;
    for(const value of [{...p,readOnly:false},{...p,bundle:{...p.bundle,blocks:[]}},{...p,canonical:{...p.canonical,after:"changed"}}])
      fail(()=>validateContextBundlePlan(value,f.analysis,f.pair,f.choice,f.read.linktexts),"source");
    expect(paragraphRanges(f.pair[1]).some(r=>!!mergeBlockFailure(f.pair[1],r,mergeHints(f.analysis.result,f.pair),1))).toBe(true);
  });
});

describe("bundle publication lifetime and freshness",()=>{
  async function setup(){const f=bundleFixture(),read=vi.fn(async()=>f.read),deps={analysis:()=>f.analysis,read,incoming:()=>[null,null] as const};
    const s=new ChangePlannerSession(deps);await s.prepare();return {...f,s,read,deps};}
  it("reads twice before publication; selection invalidates and no write/provider/journal port exists",async()=>{
    const f=await setup();await f.s.buildBundle(f.choice);expect(f.s.view.stage).toBe("ready");expect(f.read).toHaveBeenCalledTimes(3);
    expect(f.s.view.plan??f.s.view.multiPlan??f.s.view.mergePlan??f.s.view.groupPlan).toBeUndefined();f.s.changeSelection();expect(f.s.view.bundlePlan).toBeUndefined();
  });
  it.each([0,1])("rejects any freshness difference on side %s",async side=>{
    for(const kind of ["content","file","created","modified","bytes","cache","references","resolver"]){
      const f=await setup(),next:PlannerRead={pair:[{...f.pair[0]},{...f.pair[1]}],linktexts:["0/Note","1/Note"]};
      next.linktexts=["0/Note","1/Note"];const n=next.pair[side];
      if(kind==="resolver")next.linktexts=["",""];else if(kind==="content")n.content+="x";else if(kind==="file")n.file={...n.file};
      else if(kind==="cache")n.cache={...n.cache,tags:[]};else if(kind==="references")n.references=[{kind:"link",original:"x",target:null}];
      else if(kind==="created")n.created=3;else if(kind==="modified")n.modified=3;else n.bytes++;
      f.read.mockResolvedValue(next);await f.s.buildBundle(f.choice);expect(f.s.view.stage,kind).toBe("stale");expect(f.s.view.bundlePlan).toBeUndefined();
    }
  });
  it.each(["cancel","close","changeSelection","invalidate"] as const)("%s prevents late publication",async action=>{
    const f=await setup();let release!:(r:PlannerRead)=>void;
    f.read.mockImplementationOnce(async()=>({pair:f.pair,linktexts:["0/Note","1/Note"]}));f.read.mockImplementationOnce(()=>new Promise(r=>{release=r}));
    const pending=f.s.buildBundle(f.choice);await vi.waitFor(()=>expect(release).toBeDefined());f.s[action]();release({pair:f.pair,linktexts:["0/Note","1/Note"]});await pending;
    expect(f.s.view.bundlePlan).toBeUndefined();expect(f.s.view.stage).toBe(action==="close"?"idle":action==="cancel"?"cancelled":"stale");
  });
  it("rejects final-read metadata, incoming and analysis mutation",async()=>{
    for(const kind of ["metadata","incoming","analysis","analysis-content"]){
      const f=await setup();f.read.mockImplementationOnce(async()=>({pair:f.pair,linktexts:["0/Note","1/Note"]}));
      f.read.mockImplementationOnce(async()=>{
        if(kind==="incoming")f.deps.incoming=()=>[{items:["Consumer.md"],total:1},null] as never;
        if(kind==="analysis")f.deps.analysis=()=>({...f.analysis});if(kind==="analysis-content")f.analysis.result.limitations.push("Changed.");
        return {pair:kind==="metadata"?[{...f.pair[0],cache:{...f.pair[0].cache,tags:[]}},f.pair[1]]:f.pair,linktexts:["0/Note","1/Note"]};
      });await f.s.buildBundle(f.choice);expect(f.s.view.stage).toBe("stale");expect(f.s.view.bundlePlan).toBeUndefined();
    }
  });
});
