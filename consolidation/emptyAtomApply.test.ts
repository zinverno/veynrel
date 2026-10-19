import { afterEach,describe,expect,it,vi } from "vitest";
vi.mock("obsidian",()=>({TFile:class {},TFolder:class {},MarkdownView:class {},getLanguage:()=>"en",parseLinktext:(s:string)=>({path:s}),requestUrl:vi.fn(),parseYaml:vi.fn()}));
import { emptyAtomFixture as setup } from "../tests/emptyAtomFixture";
import { emptyAtomRecord,validateEmptyAtomRecord } from "./emptyAtomJournal";
import { checksum } from "./operationJournal";
import { atomizationCandidates } from "./atomizationPlan";
import { buildChangePlan,paragraphRanges } from "./changePlan";
import { readPlannerPair,ChangePlannerSession } from "./changePlannerSession";
const reason=(reason:string):unknown=>expect.objectContaining({reason});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const untouched=(f:ReturnType<typeof setup>)=>{
  for(const n of f.pair){expect(f.contents.get(n.path)).toBe(n.content);expect(n.file.stat).toEqual({ctime:n.created,mtime:n.modified,size:n.bytes});}
  for(const method of [f.vault.modify,f.vault.create,f.vault.delete,f.vault.trash,f.vault.rename,f.vault.createFolder])expect(method).not.toHaveBeenCalled();
  expect([...f.disk.keys()].every(p=>!p.endsWith(".md"))).toBe(true);expect(f.files.has(f.choice.path)).toBe(true);
};
describe("existing empty note authority",()=>{
  it.each(["A blue envelope marks a completed trial.","При температуре ниже 0 °C наблюдение 🪶 é остаётся гипотезой.","# Scope\n\nOnly in trial A.\n\n## Conditions\n\nIf dry, expect blue.\n\n### Observation\n\nA blue mark is tentative.\n"])("fills and clears exact bytes after restart: %s",async text=>{
    for(const newline of ["\n","\r\n"]){
      const f=setup(text.replace(/\n/gu,newline)),{plan}=await f.plan(),r=await f.review();
      expect(f.disk.size).toBe(0);expect(f.vault.process).not.toHaveBeenCalled();
      await f.atom.execute(r);expect(f.contents.get(f.choice.path)).toBe(plan.target.after);untouched(f);
      expect((await f.atom.history())[0]).toMatchObject({state:"applied",canUndo:true,blocking:false});
      f.rebind();const restarted=f.restart().emptyAtom!,undo=await restarted.reviewUndo(r.id,()=>true);
      await restarted.execute(undo);expect(f.contents.get(f.choice.path)).toBe("");untouched(f);
      expect((await restarted.history())[0]).toMatchObject({state:"undone",canUndo:false,blocking:false});
      await expect(restarted.execute(undo)).rejects.toEqual(reason("used"));
      expect(f.vault.process.mock.calls.every(([file])=>file.path===f.choice.path)).toBe(true);
    }
  });
  it.each([1,2,3])("copies a complete H%s with necessary context",async level=>{
    const f=setup("# Guide\n\nScope is trial A.\n\n## Conditions\n\nIf dry only.\n\n### Fact\n\nTentative blue mark.\n");
    const candidate=atomizationCandidates(f.pair[0]).find(c=>c.kind==="section"&&!c.failure&&c.range.text.startsWith("#".repeat(level)+" "));
    expect(candidate).toBeDefined();f.choice.kind=candidate!.kind;f.choice.range=candidate!.range;
    const {plan}=await f.plan();await f.atom.execute(await f.review());expect(f.contents.get(f.choice.path)).toBe(plan.target.after);untouched(f);
  });
  it("validates durable records without runtime identity tokens and rejects forged semantics even with rehash",async()=>{
    const f=setup(),r=await emptyAtomRecord((await f.plan()).plan);
    expect(await validateEmptyAtomRecord(JSON.parse(JSON.stringify(r)),r.id)).toEqual(r);
    for(const mutate of [(p:typeof r.plan)=>{p.version=1 as 2;},(p:typeof r.plan)=>{p.target.after+="invented";},(p:typeof r.plan)=>{p.confirmations.targetConfirmed=false;},(p:typeof r.plan)=>{p.selected.range.start++;}]){
      const copy=structuredClone(r);mutate(copy.plan);copy.hashes.after=await checksum(copy.plan.target.after);copy.id=await checksum(JSON.stringify({...copy,id:"",createdAt:0}));
      await expect(validateEmptyAtomRecord(copy,copy.id)).rejects.toEqual(reason("storage"));
    }
  });
});

describe("refusal before writing",()=>{
  it.each([{}, {v:1}])("proves a native empty cache %j with exact reads",async cache=>{
    const f=setup();f.caches.set(f.target,cache as never);const r=await f.review();await f.atom.execute(r);untouched(f);
  });
  it.each(["nonempty","whitespace","missing-cache","unknown-cache","properties","size","adapter-stat","same-source","alias","homonym","case","backlink","unknown-other","title-url"])("refuses %s",async kind=>{
    const f=setup();
    if(kind==="nonempty"||kind==="whitespace")f.edit(f.choice.path,kind==="whitespace"?"\n":"user text");
    if(kind==="missing-cache")f.caches.set(f.target,null);
    if(kind==="unknown-cache")f.caches.set(f.target,{unknown:true} as never);
    if(kind==="properties")f.caches.set(f.target,{frontmatter:{}});
    if(kind==="size")f.target.stat.size=1;
    if(kind==="adapter-stat"){const stat=f.adapter.stat.getMockImplementation()!;f.adapter.stat.mockImplementation(async p=>p===f.choice.path?{type:"file",size:0,ctime:99,mtime:2}:stat(p));}
    if(kind==="same-source")f.choice.path=f.pair[0].path;
    if(kind==="alias"){const n=f.add("Alias.md","Alias text.");f.caches.get(n)!.frontmatter={aliases:["Trial observation"]};}
    if(kind==="homonym")f.add("Trial observation.md","Other observation.");
    if(kind==="case")f.add("Atoms/TRIAL OBSERVATION.md","Other observation.");
    if(kind==="backlink")f.add("Incoming.md","See [[Atoms/Trial observation]].");
    if(kind==="unknown-other"){const n=f.add("Unknown.md","Text without metadata.");f.caches.set(n,{});}
    if(kind==="title-url")f.choice.title="Observation HTTPS://example.invalid";
    await expect(f.review()).rejects.toBeDefined();expect(f.vault.process).not.toHaveBeenCalled();expect(f.disk.size).toBe(0);
  });
  it.each(["cancel","discard","target-edit","replace","rename","source-edit","cache","analysis","editor"])("revokes a prepared consent on %s",async kind=>{
    const f=setup(),r=await f.review();
    if(kind==="cancel")f.cancel();if(kind==="discard")f.atom.discard(r);
    if(kind==="target-edit")f.edit(f.choice.path,"User wins.");if(kind==="replace")f.replace();
    if(kind==="rename")f.target.path="Renamed.md";if(kind==="source-edit")f.edit(f.pair[0].path,"Changed source.");
    if(kind==="cache")f.caches.set(f.target,null);if(kind==="analysis")f.analysis.result.limitations.push("Changed analysis.");if(kind==="editor")f.editor();
    await expect(f.atom.execute(r)).rejects.toBeDefined();expect(f.vault.process).not.toHaveBeenCalled();expect(f.disk.size).toBe(0);
  });
  it("refuses bytes introduced immediately inside Vault.process, with unchanged cached stat",async()=>{
    const f=setup(),r=await f.review(),process=f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementation(async(...args)=>{f.contents.set(f.choice.path,"Concurrent content.");return process(...args);});
    await expect(f.atom.execute(r)).rejects.toEqual(reason("write"));expect(f.contents.get(f.choice.path)).toBe("Concurrent content.");untouched(f);
    expect((await f.atom.history())[0]).toMatchObject({blocking:true,canUndo:false});
  });
  it("rejects mutation after both recovery copies, before process",async()=>{
    const f=setup(),r=await f.review(),copy=f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementation(async(...args)=>{await copy(...args);f.edit(f.choice.path,"Changed after consent.");});
    await expect(f.atom.execute(r)).rejects.toBeDefined();expect(f.vault.process).not.toHaveBeenCalled();expect(f.contents.get(f.choice.path)).toBe("Changed after consent.");
  });
  it("consumes private tickets once and serializes competing windows with all families",async()=>{
    const f=setup(),a=await f.review(),b=await f.review();
    await expect(f.atom.execute({...a})).rejects.toEqual(reason("used"));
    const result=await Promise.allSettled([f.atom.execute(a),f.atom.execute(b)]);expect(result.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect(f.vault.process).toHaveBeenCalledTimes(1);await expect(f.atom.execute(a)).rejects.toEqual(reason("used"));
  });
  it("mutating the public review cannot change private write authority",async()=>{
    const f=setup(),r=await f.review(),expected=r.record.plan.target.after;r.record.plan.target.after="Injected preview";r.record.plan.sources=[] as never;
    await expect(f.restart().emptyAtom!.execute(r)).rejects.toEqual(reason("used"));await f.atom.execute(r);
    expect(f.contents.get(f.choice.path)).toBe(expected);untouched(f);
  });
  it.each(["edit","source","backlink","replace","rename","cache","editor"])("blocks old Undo on %s, but releases completed reservations",async kind=>{
    const f=setup(),r=await f.review();await f.atom.execute(r);
    if(kind==="edit")f.edit(f.choice.path,"User changes.");if(kind==="source")f.edit(f.pair[1].path,"Source changes.");
    if(kind==="backlink")f.add("Incoming.md","Now [[Atoms/Trial observation]] is in use.");if(kind==="replace")f.replace();
    if(kind==="rename"){f.files.delete(f.choice.path);f.target.path="Moved.md";f.files.set("Moved.md",f.target);}
    if(kind==="cache")f.caches.set(f.target,null);if(kind==="editor")f.editor();
    await expect(f.atom.reviewUndo(r.id,()=>true)).rejects.toBeDefined();expect(f.vault.process).toHaveBeenCalledTimes(1);
    expect((await f.atom.history())[0]).toMatchObject({blocking:false,canUndo:false});
  });
  it("allows a fresh old-family plan after a completed atom and refuses it with pending atom evidence",async()=>{
    const f=setup(),r=await f.review();await f.atom.execute(r);f.edit(f.choice.path,"Later user edit.");
    const {pair,linktexts}=await readPlannerPair(f.app,[f.pair[0].path,f.pair[1].path]);
    const p=buildChangePlan(f.analysis,pair,{operation:"add_link",source:0,selection:paragraphRanges(pair[0])[0],confirmed:true},linktexts[1]);
    const review=await f.service.review(p,f.analysis,()=>true);f.service.discard(review!);
    for(const path of [...f.disk.keys()].filter(p=>p.includes("/mark-")))f.disk.delete(path);
    await expect(f.service.review(p,f.analysis,()=>true)).rejects.toEqual(reason("storage"));
  });
  it("a completed Undo allows a new exact plan with a different operation ID",async()=>{
    const f=setup(),first=await f.review();await f.atom.execute(first);await f.atom.execute(await f.atom.reviewUndo(first.id,()=>true));
    const next=await f.review();expect(next.id).not.toBe(first.id);await f.atom.execute(next);
    expect((await f.atom.history()).filter(r=>r.state==="applied"&&r.canUndo)).toHaveLength(1);untouched(f);
  });
});

describe("append-only crash evidence",()=>{
  it.each(["before-journal","first-copy","second-copy","before-process","after-process","torn-applied","undo-intent","after-undo","torn-undone"])("restart at %s performs no recovery write",async stage=>{
    const f=setup(),r=await f.review(),write=f.adapter.write.getMockImplementation()!,copy=f.adapter.copy.getMockImplementation()!,process=f.vault.process.getMockImplementation()!;
    if(stage==="before-journal")f.adapter.mkdir.mockRejectedValueOnce(Error("stop"));
    if(stage==="first-copy")f.adapter.copy.mockRejectedValueOnce(Error("stop"));
    if(stage==="second-copy")f.adapter.copy.mockImplementationOnce(async(...args)=>{await copy(...args);throw Error("stop");});
    if(stage==="before-process")f.vault.process.mockRejectedValueOnce(Error("stop"));
    if(stage==="after-process")f.vault.process.mockImplementationOnce(async(...args)=>{await process(...args);throw Error("stop");});
    if(stage==="torn-applied")f.adapter.write.mockImplementation(async(p,s)=>{if(s.includes('"state":"applied"')){await write(p,"{");throw Error("stop");}await write(p,s);});
    if(["undo-intent","after-undo","torn-undone"].includes(stage)){
      await f.atom.execute(r);const undo=await f.atom.reviewUndo(r.id,()=>true);
      if(stage==="undo-intent")f.vault.process.mockRejectedValueOnce(Error("stop"));
      if(stage==="after-undo")f.vault.process.mockImplementationOnce(async(...args)=>{await process(...args);throw Error("stop");});
      if(stage==="torn-undone")f.adapter.write.mockImplementation(async(p,s)=>{if(s.includes('"state":"undone"')){await write(p,"{");throw Error("stop");}await write(p,s);});
      await expect(f.atom.execute(undo)).rejects.toBeDefined();
    }else await expect(f.atom.execute(r)).rejects.toBeDefined();
    const before=new Map(f.contents),evidence=new Map(f.disk),count=f.vault.process.mock.calls.length;
    f.rebind();const rows=await f.restart().emptyAtom!.history();expect(f.contents).toEqual(before);expect(f.disk).toEqual(evidence);expect(f.vault.process).toHaveBeenCalledTimes(count);untouched(f);
    expect(rows.every(row=>!row.canUndo&&row.blocking)).toBe(true);
  });
  it.each(["missing-copy","both-corrupt","unknown-file","conflicting-receipt"])("rejects %s evidence",async kind=>{
    const f=setup(),r=await f.review();await f.atom.execute(r);const dir=`${f.journal.root}/${r.id}`;
    if(kind==="missing-copy")f.disk.delete(`${dir}/backup.json`);
    if(kind==="both-corrupt"){f.disk.set(`${dir}/record.json`,"{}");f.disk.set(`${dir}/backup.json`,"{}");}
    if(kind==="unknown-file")f.disk.set(`${f.journal.root}/foreign.json`,"{}");
    if(kind==="conflicting-receipt"){
      const mark=[...f.disk.keys()].find(p=>p.includes("/mark-"))!,receipt=JSON.parse(f.disk.get(mark)!) as {attempt:string;modified:number};receipt.attempt=crypto.randomUUID();receipt.modified++;
      f.disk.set(`${dir}/mark-${receipt.attempt}.json`,JSON.stringify(receipt));
    }
    await expect(f.atom.reviewUndo(r.id,()=>true)).rejects.toBeDefined();expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
});

describe("disposable planning",()=>{
  it.each(["close","cancel","selection"])("late reads cannot revive %s",async action=>{
    const f=setup(),native=f.native,session=new ChangePlannerSession({analysis:()=>f.analysis,read:()=>readPlannerPair(f.app,[f.pair[0].path,f.pair[1].path]),emptyAtom:native});
    await session.prepare();let done!:()=>void;const plan=native.plan.bind(native);
    vi.spyOn(native,"plan").mockImplementationOnce(async(...args)=>{await new Promise<void>(resolve=>{done=resolve;});return plan(...args);});
    const pending=session.buildEmptyAtom(f.choice);while(!done)await Promise.resolve();
    if(action==="close")session.close();else if(action==="cancel")session.cancel();else session.changeSelection();
    done();await pending;expect(session.view.emptyAtomPlan).toBeUndefined();expect(f.disk.size).toBe(0);expect(f.vault.process).not.toHaveBeenCalled();
  });
});
