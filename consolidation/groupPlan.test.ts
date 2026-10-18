import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, getLanguage: () => "en", requestUrl: vi.fn(), parseLinktext: (s: string) => ({ path: s }) }));
import { buildGroupPlan, validateGroupPlan } from "./groupPlan";
import { contextGroups, groupHeadings } from "./groupStructure";
import { groupFixture, groupNote } from "../tests/groupFixture";
import { ChangePlannerSession } from "./changePlannerSession";
import type { PlannerRead } from "./changePlannerSession";
import { mergeBlockFailure, mergeHints } from "./mergePlan";
import { paragraphRanges } from "./changePlan";

const build = (f = groupFixture()) => buildGroupPlan(f.analysis, f.pair, f.choice, f.read.linktexts);
const fail = (fn: () => unknown, reason: string) => expect(fn).toThrow(expect.objectContaining({ reason }));
describe("read-only heading-scoped contract", () => {
  it.each([0,1] as const)("canonical %s: copies exact subsection + ancestor introductions, never sibling chapters", canonical => {
    const f = groupFixture(canonical), p = build(f);
    expect(p.secondary.content).toBe(f.pair[1-canonical].content);
    expect(p.group.context).toHaveLength(2); expect(p.group.range.text).toContain('### Trial');
    expect(p.group.range.text).not.toContain('## Other'); expect(p.canonical.after).not.toContain('An unselected observation.');
    expect(p.hierarchy.inserted.map(h => h.level)).toEqual([1,2,3]);
    for (const h of p.hierarchy.inserted) expect(p.canonical.after.slice(h.destinationOffset,h.destinationOffset+h.text.length)).toBe(h.text);
    const pieces = [...p.group.copied,...p.group.retained].sort((a,b) => a.start-b.start);
    expect(pieces.map(r=>r.text).join('')).toBe(p.secondary.content);
    expect(p.canonical.after).toBe(p.canonical.before+p.insertion.edit.inserted);
    expect(JSON.parse(JSON.stringify(p))).toEqual(p); expect(JSON.stringify(p)).not.toContain('"file":');
    expect(validateGroupPlan(p,f.analysis,f.pair,f.choice,f.read.linktexts)).toEqual(p);
    expect(p.operation).toBe('copy_context_group'); expect(p.readOnly).toBe(true);
  });
  it("preserves Unicode, combining characters, CRLF and complete originals", () => {
    const f=groupFixture(1,'\r\n'),p=build(f);
    expect(p.insertion.separator).toBe('\r\n\r\n');
    expect(p.secondary.content).toBe(f.pair[0].content);
    expect(p.group.copied.every(r=>p.canonical.after.includes(r.text))).toBe(true);
    expect(p.canonical.after).toContain('Наблюдение 🪶 é.\r\n');
  });
  it("bounds nested/repeated headings by identity/offset rather than title or LLM quotes", () => {
    const n=groupNote('X.md','# Root\n\nIntro.\n\n## Same\n\nOne.\n\n### Child\n\nChild text.\n\n## Same\n\nTwo.\n\n# End\n\nLast.\n');
    const {headings:h,groups:g}=contextGroups(n);
    expect(h.map(x=>x.parent)).toEqual([null,0,1,0,null]);
    expect(g[1].range.end).toBe(h[3].range.start); expect(g[2].range.end).toBe(h[3].range.start);
    expect(g[3].range.end).toBe(h[4].range.start); expect(g[1].range.text).not.toContain('Two.');
    expect(g[3].range.text).toContain('Two.'); expect(g[3].range.start).not.toBe(g[1].range.start);
  });
  it.each(['groupConfirmed','contextConfirmed','insertionConfirmed'] as const)("requires separate %s", key=>{
    const f=groupFixture();f.choice[key]=false;fail(()=>build(f),'confirmation');
  });
  it("requires context representation, no unresolved external/semantic dependency, and EOF choice",()=>{
    const f=groupFixture();f.choice.representation=null;fail(()=>build(f),'confirmation');
    f.choice.representation='original_heading_branch';f.choice.dependencies='unresolved';fail(()=>build(f),'dependencies');
    f.choice.dependencies=null;fail(()=>build(f),'dependencies');f.choice.dependencies='reviewed';
    f.choice.insertion=10;fail(()=>build(f),'hierarchy');
  });
  it.each(['conflicting','unrelated','insufficient_context'] as const)("%s never gets structural permission",relation=>{
    const f=groupFixture();f.analysis.result.relation=relation;
    f.analysis.result.recommendation={action:'manual_review',reason:'Review.',evidence:['s']};
    if(relation==='conflicting')f.analysis.result.claims[0].kind='conflict';
    fail(()=>build(f),'semantic');
  });
  it("version difference and model context cannot be discharged by a heading",()=>{
    const f=groupFixture();f.analysis.result.relation='conflicting';f.analysis.result.claims[0].kind='version_difference';
    f.analysis.result.recommendation.action='manual_review';fail(()=>build(f),'semantic');
    const g=groupFixture();g.analysis.result.claims.push({id:'ctx',kind:'context_b',text:'Unknown attribution.',quoteA:null,quoteB:'Второй абзац.'});
    fail(()=>build(g),'context');
  });
  it("related distinct requires separate intent; it never becomes a merge recommendation",()=>{
    const f=groupFixture();f.analysis.result.relation='related_distinct';f.analysis.result.recommendation.action='manual_review';
    fail(()=>build(f),'intent');f.choice.distinctIntent=true;expect(build(f).provenance.analysis.recommendation.action).toBe('manual_review');
  });
  it.each(['[[Link]]','![[Embed]]','Text ^id','Text [^footnote]','https://example.invalid','www.example.invalid','ftp://example.invalid',
    '`code`','- unfinished list','1. ordered','> attributed quotation','<div>HTML</div>','Text $math$','| table |','Text #tag'])('rejects dependency %s anywhere in group or ancestor intro', text=>{
    for(const location of ['Второй абзац.','Shared scoped fact.']){
      const f=groupFixture(); const s=f.pair[1], next=groupNote(s.path,s.content.replace(location,text));
      Object.assign(s,next);f.analysis.pair=[{...f.pair[0]},{...s}];
      expect(contextGroups(s).groups[2].failure).toBe('protected');
    }
  });
  it("detects native protected metadata even when its literal text appears plain",()=>{
    const f=groupFixture(),n=f.pair[1],s=n.cache!.sections!.find(s=>s.type==='paragraph'&&s.position.start.offset>60)!;
    n.cache!.blocks={hidden:{id:'hidden',position:s.position}};
    expect(contextGroups(n).groups[2].failure).toBe('protected');
  });
  it.each([[30,20],[-1,5],[2,10000],[2,2],[NaN,4]])("refuses corrupt protected metadata offsets %s..%s",(start,end)=>{
    const f=groupFixture(),n=f.pair[1];
    n.cache!.blocks={bad:{id:'bad',position:{start:{offset:start,line:0,col:0},end:{offset:end,line:0,col:0}}}};
    fail(()=>contextGroups(n),'metadata');
  });
  it.each(['ftp://example.invalid','mailto:a@example.invalid'])('rejects external heading address %s',address=>{
    fail(()=>contextGroups(groupNote('X.md','# Root '+address+'\n\nBody.\n')),'hierarchy');
  });
  it.each(['# Root\n\n### Gap\n\nBody.\n','## Orphan\n\nBody.\n','# Root\n\n#### Too deep\n\nBody.\n','# Root #\n\nBody.\n'])('refuses incompatible hierarchy %s', text=>{
    fail(()=>contextGroups(groupNote('X.md',text)),'hierarchy');
  });
  it("preserves canonical YAML and links while refusing source preamble / unsafe destination boundary",()=>{
    const f=groupFixture(),n=f.pair[0];Object.assign(n,groupNote(n.path,'---\ntitle: Keep\n---\n\n# Existing\n\nShared scoped fact.\n\n[[Existing link]]\n\nSafe ending.\n'));
    f.analysis.pair=[{...n},{...f.pair[1]}];f.choice.insertion=n.content.length;
    expect(build(f).canonical.after.startsWith(n.content)).toBe(true);
    const source=groupNote('S.md','Preamble scope.\n\n# Heading\n\nBody.\n');expect(contextGroups(source).groups[0].failure).toBe('context');
    Object.assign(n,groupNote(n.path,'# Existing\n\nShared scoped fact.\n\n```js\nconst x = 1;\n```\n'));
    f.analysis.pair=[{...n},{...f.pair[1]}];f.choice.insertion=n.content.length;fail(()=>build(f),'hierarchy');
  });
  it("rejects arbitrary range edits, missing native headings, uncovered text and tampered plans",()=>{
    const f=groupFixture(),p=build(f);f.choice.group!.start++;fail(()=>build(f),'range');f.choice.group!.start--;
    for(const changed of [{...p,readOnly:false},{...p,canonical:{...p.canonical,after:p.canonical.after+'x'}},{...p,extra:true}])
      fail(()=>validateGroupPlan(changed,f.analysis,f.pair,f.choice,f.read.linktexts),'source');
    const n=groupNote('X.md','# Root\n\nBody.\n');n.cache!.headings=[];fail(()=>groupHeadings(n),'metadata');
    n.cache!.sections!.pop();fail(()=>groupHeadings(n),'metadata');
  });
  it("old mergeBlockFailure still rejects paragraphs under headings",()=>{
    const f=groupFixture(),n=f.pair[1];
    expect(paragraphRanges(n).every(r=>mergeBlockFailure(n,r,mergeHints(f.analysis.result,f.pair),1)==='heading')).toBe(true);
  });
});

describe('GroupPlan freshness and disposable lifetime',()=>{
  async function setup(){const f=groupFixture();const read=vi.fn(async()=>f.read);const deps={analysis:()=>f.analysis,read,incoming:()=>[null,null] as const};
    const s=new ChangePlannerSession(deps);await s.prepare();return {...f,s,deps,read};}
  it('rereads both sources twice; selection clears plan, no writer/provider/journal port exists',async()=>{
    const f=await setup();await f.s.buildGroup(f.choice);expect(f.s.view.stage).toBe('ready');expect(f.read).toHaveBeenCalledTimes(3);
    expect(f.s.view.plan??f.s.view.multiPlan??f.s.view.mergePlan).toBeUndefined();f.s.changeSelection();expect(f.s.view.groupPlan).toBeUndefined();
  });
  it.each([0,1])('rejects source %s content, identity, ctime, mtime, size, cache, resolver and references changes',async side=>{
    for(const kind of ['content','file','created','modified','bytes','cache','references','resolver']){
      const f=await setup();
      const next: PlannerRead={pair:[{...f.pair[0]},{...f.pair[1]}],linktexts:['0/Note','1/Note']};const n=next.pair[side];
      if(kind==='resolver')next.linktexts=['',''];else if(kind==='content')n.content+='x';else if(kind==='file')n.file={...n.file};
      else if(kind==='cache')n.cache={...n.cache,tags:[]};else if(kind==='references')n.references=[{kind:'link',original:'x',target:null}];
      else if(kind==='created')n.created=3;else if(kind==='modified')n.modified=3;else n.bytes++;
      f.read.mockResolvedValue(next);await f.s.buildGroup(f.choice);expect(f.s.view.stage,kind).toBe('stale');expect(f.s.view.groupPlan).toBeUndefined();
    }
  });
  it.each(['cancel','close','changeSelection','invalidate'] as const)('%s blocks late publication',async action=>{
    const f=await setup();let release!:(r:PlannerRead)=>void;
    f.read.mockImplementationOnce(async()=>({pair:f.pair,linktexts:['0/Note','1/Note']}));
    f.read.mockImplementationOnce(()=>new Promise(r=>{release=r}));const pending=f.s.buildGroup(f.choice);
    await vi.waitFor(()=>expect(release).toBeDefined());f.s[action]();release({pair:f.pair,linktexts:['0/Note','1/Note']});await pending;
    expect(f.s.view.groupPlan).toBeUndefined();expect(f.s.view.stage).toBe(action==='close'?'idle':action==='cancel'?'cancelled':'stale');
  });
  it('rejects cache/incoming/analysis changes during publication verification',async()=>{
    for(const kind of ['incoming','analysis','metadata','analysis-content']){
      const f=await setup();f.read.mockImplementationOnce(async()=>({pair:f.pair,linktexts:['0/Note','1/Note']}));
      f.read.mockImplementationOnce(async()=>{
        if(kind==='incoming')f.deps.incoming=()=>[{items:['Consumer.md'],total:1},null] as never;
        if(kind==='analysis')f.deps.analysis=()=>({...f.analysis});
        if(kind==='analysis-content')f.analysis.result.limitations.push('Changed while verification was pending.');
        return {pair:kind==='metadata'?[{...f.pair[0],cache:{...f.pair[0].cache,tags:[]}},f.pair[1]]:f.pair,linktexts:['0/Note','1/Note']};
      });await f.s.buildGroup(f.choice);expect(f.s.view.stage).toBe('stale');expect(f.s.view.groupPlan).toBeUndefined();
    }
  });
});
