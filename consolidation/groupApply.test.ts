import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({TFile:class {},MarkdownView:class {},getLanguage:()=>"en",parseLinktext:(s:string)=>({path:s}),requestUrl:vi.fn(),parseYaml:vi.fn()}));
import { requestUrl } from "obsidian";
import { groupFixture, groupNote } from "../tests/groupFixture";
import { groupApplyFixture as setup } from "../tests/groupApplyFixture";
import { GroupJournal } from "./groupJournal";
import { createSafeApplyService } from "./obsidianSafeApply";
import { groupRecord, validateGroupRecord } from "./groupJournal";
import { checksum, validateOperation } from "./operationJournal";
import { mergeFixture } from "../tests/mergeFixture";
import { validateBundleRecord } from "./bundleJournal";
import { buildGroupPlan } from "./groupPlan";
import { contextGroups } from "./groupStructure";
import { bundleApplyFixture } from "../tests/bundleApplyFixture";
import { archiveApplyFixture } from "../tests/archiveApplyFixture";
import corpus from "../tests/fixtures/consolidation-realistic-v1.json";
import { buildMergePlan } from "./mergePlan";
import { validateMergeRecord, mergeRecord } from "./mergeJournal";
import { validateMultiRecord, multiRecord } from "./multiFileJournal";
import { validateArchiveRecord } from "./archiveJournal";
import { buildMultiFilePlan } from "./multiFilePlan";
import { readPlannerPair } from "./changePlannerSession";
import { paragraphRanges, buildChangePlan } from "./changePlan";
const reason=(reason:string):unknown=>expect.objectContaining({reason});
const unchanged=(f:ReturnType<typeof setup>)=>{
  expect(f.contents.get(f.plan.secondary.path)).toBe(f.plan.secondary.content);
  const n=f.pair.find(n=>n.path===f.plan.secondary.path)!;
  expect(n.file.stat).toEqual({ctime:n.created,mtime:n.modified,size:n.bytes});
  expect(f.vault.modify).not.toHaveBeenCalled();expect(f.vault.create).not.toHaveBeenCalled();expect(f.vault.delete).not.toHaveBeenCalled();
};
const apply=async(f:ReturnType<typeof setup>)=>{const r=await f.review();await f.group.execute(r);return r;};
const freshSingle=async(f:ReturnType<typeof setup>)=>{
  const read=await readPlannerPair(f.app,[f.pair[0].path,f.pair[1].path]),analysis={...f.analysis,pair:read.pair};
  const plan=buildChangePlan(analysis,read.pair,{operation:"add_link",source:0,selection:paragraphRanges(read.pair[0])[0],confirmed:true},read.linktexts[1]);
  return {read,analysis,plan};
};
const groupEvidence=(f:ReturnType<typeof setup>)=>[...f.disk].filter(([path])=>path.startsWith(f.groupJournal.root+"/"));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("separate structured-copy authority",()=>{
  it.each([1,2,3] as const)("copies H%s and undoes after restart, both directions and CRLF",async level=>{
    for(const side of [0,1] as const)for(const crlf of [false,true]){
      const f=setup(side,crlf,level),review=await f.review();
      expect(f.disk.size).toBe(0);expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
      const process=f.vault.process.getMockImplementation()!;
      f.vault.process.mockImplementation(async(...args)=>{
        const [entry]=await f.groupJournal.entries();expect(entry.damaged).toBe(false);
        expect([...f.disk.keys()].filter(k=>k.endsWith("record.json")||k.endsWith("backup.json"))).toHaveLength(2);
        return process(...args);
      });
      await f.group.execute(review);expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after);unchanged(f);
      expect((await f.group.history())[0]).toMatchObject({state:"applied",canUndo:true,blocking:false});
      const restarted=f.restart(),undo=await restarted.group!.reviewUndo(review.id,()=>true);
      expect(f.vault.process).toHaveBeenCalledTimes(1);await restarted.group!.execute(undo);unchanged(f);
      expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.before);
      expect((await restarted.group!.history())[0]).toMatchObject({state:"undone",canUndo:false,blocking:false});
      await expect(f.group.execute(review)).rejects.toEqual(reason("used"));await expect(restarted.group!.execute(undo)).rejects.toEqual(reason("used"));
      await expect(restarted.group!.reviewUndo(review.id,()=>true)).rejects.toThrow();await expect(f.review()).rejects.toThrow();
      expect(await f.mergeJournal.entries()).toEqual([]);expect(await f.archiveJournal.entries()).toEqual([]);expect(requestUrl).not.toHaveBeenCalled();
    }
  });
  it("native persisted cache version survives restart, public structure changes still refuse Undo",async()=>{
    const f=setup(),r=await apply(f),secondary=f.pair[1];
    secondary.cache!.headings=secondary.cache!.headings!.map(item=>({position:item.position,heading:item.heading,level:item.level}));
    f.caches.set(secondary.file,{...secondary.cache,v:1} as never);
    const restarted=f.restart(),undo=await restarted.group!.reviewUndo(r.id,()=>true);
    f.caches.set(secondary.file,{...secondary.cache,v:1,tags:[]} as never);
    await expect(restarted.group!.execute(undo)).rejects.toThrow();expect(f.vault.process).toHaveBeenCalledTimes(1);
    f.caches.set(secondary.file,{...secondary.cache,v:1} as never);
    await restarted.group!.execute(await restarted.group!.reviewUndo(r.id,()=>true));unchanged(f);
  });
  it("analysis changed during final journal reads invalidates consent and execution",async()=>{
    for(const phase of ["review","execute"]){
      const f=setup(),r=phase==="execute"?await f.review():undefined,has=f.groupJournal.has.bind(f.groupJournal),entries=f.groupJournal.entries.bind(f.groupJournal);
      if(phase==="review")vi.spyOn(f.groupJournal,"has").mockImplementation(async id=>{const v=await has(id);f.analysis.result.relation="conflicting";return v;});
      else vi.spyOn(f.groupJournal,"entries").mockImplementation(async()=>{const v=await entries();if(v.length)f.analysis.result.relation="conflicting";return v;});
      await expect(r?f.group.execute(r):f.review()).rejects.toThrow();expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
    }
  });
  it("stable ID, strict discriminators, unchanged old validators and no archive eligibility",async()=>{
    const f=setup(),r=await groupRecord(f.plan);expect((await groupRecord(f.plan)).id).toBe(r.id);
    expect(await validateGroupRecord(r,r.id)).toEqual(r);
    await expect(validateBundleRecord(r,r.id)).rejects.toThrow();await expect(validateMergeRecord(r,r.id)).rejects.toThrow();await expect(validateMultiRecord(r,r.id)).rejects.toThrow();
    await expect(validateArchiveRecord(r,r.id)).rejects.toThrow();await expect(validateOperation(r,r.id)).rejects.toThrow();
    for(const mutate of [(x:typeof r)=>{x.operation="merge_knowledge_copy" as never;},(x:typeof r)=>{x.plan.hierarchy.inserted[0].level=2;},
      (x:typeof r)=>{x.plan.group.range.start++;},(x:typeof r)=>{x.plan.group.copied.pop();},(x:typeof r)=>{x.plan.canonical.after+="tamper";},
      (x:typeof r)=>{x.plan.confirmations.group!.start++;},(x:typeof r)=>{x.plan.insertion.edit.inserted+="x";}]){
      const bad=structuredClone(r);mutate(bad);bad.id=await checksum(JSON.stringify({...bad,id:"",createdAt:0}));
      await expect(validateGroupRecord(bad,bad.id)).rejects.toEqual(reason("storage"));
    }
    await apply(f);await expect(f.merge.readApplied(r.id,()=>true)).rejects.toThrow();unchanged(f);
  });
  it.each([0,1])("rejects source %s change before review, after consent and after backups",async side=>{
    for(const phase of ["review","consent","backup"])for(const kind of ["content","ctime","mtime","size","path","identity","metadata","editor"]){
      const f=setup(),n=f.pair[side];const change=()=>{
        if(kind==="content")f.contents.set(n.path,n.content+" changed");if(kind==="ctime")n.file.stat.ctime++;
        if(kind==="mtime")n.file.stat.mtime++;if(kind==="size")n.file.stat.size++;if(kind==="path")n.file.path+="x";
        if(kind==="identity")n.file={...n.file};if(kind==="metadata")f.caches.set(n.file,{...n.cache,tags:[]});if(kind==="editor")f.editor(side);
      };
      if(phase==="review"){change();await expect(f.review()).rejects.toThrow();}
      else {const r=await f.review();if(phase==="consent")change();else {const copy=f.adapter.copy.getMockImplementation()!;f.adapter.copy.mockImplementation(async(...a)=>{await copy(...a);change();});}
        await expect(f.group.execute(r)).rejects.toThrow();}
      expect(f.vault.process,phase+kind).not.toHaveBeenCalled();
    }
  });
  it.each(["resolver","incoming"])("dependency %s changes after consent refuse all writes",async kind=>{
    const f=setup(),r=await f.review();
    if(kind==="resolver")vi.spyOn(f.app.metadataCache,"getFirstLinkpathDest").mockReturnValue(null);
    else f.app.metadataCache.resolvedLinks={};
    await expect(f.group.execute(r)).rejects.toThrow();expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
  });
  it("callback race checks exact before; post-write secondary mutation never marks success",async()=>{
    const f=setup(),r=await f.review(),before=f.contents.get(f.plan.canonical.path);
    const process=f.vault.process.getMockImplementation()!;f.vault.process.mockImplementation(async(file,cb)=>{f.contents.set(file.path,before+"user edit");return process(file,cb);});
    await expect(f.group.execute(r)).rejects.toEqual(reason("write"));unchanged(f);expect(f.contents.get(f.plan.canonical.path)).toBe(before+"user edit");
    const g=setup(),p=g.vault.process.getMockImplementation()!;g.vault.process.mockImplementation(async(...args)=>{const v=await p(...args);g.contents.set(g.plan.secondary.path,"external edit");return v;});
    await expect(apply(g)).rejects.toEqual(reason("conflict"));expect((await g.groupJournal.entries())[0].receipts).toEqual([]);
  });
  it.each([0,1])("later edit on %s including same-text touch blocks Undo",async side=>{
    for(const content of [false,true]){
      const f=setup(),r=await apply(f);f.pair[side].file.stat.mtime++;
      if(content)f.contents.set(f.pair[side].path,"USER CONTENT");const saved=new Map(f.contents);
      await expect(f.restart().group!.reviewUndo(r.id,()=>true)).rejects.toThrow();expect(f.contents).toEqual(saved);
    }
  });
  it("cancelled, discarded and concurrent consent cannot execute; final analysis mutation fails",async()=>{
    const f=setup(),r=await f.review();f.group.discard(r);await expect(f.group.execute(r)).rejects.toEqual(reason("used"));
    const a=await f.review(),b=await f.review();await f.group.execute(a);await expect(f.group.execute(b)).rejects.toThrow();unchanged(f);
    const g=setup(),v=await g.review();g.cancel();await expect(g.group.execute(v)).rejects.toEqual(reason("cancelled"));expect(g.disk.size).toBe(0);
    const h=setup(),w=await h.review();h.analysis.result.limitations.push("changed");await expect(h.group.execute(w)).rejects.toThrow();expect(h.disk.size).toBe(0);
  });
});

describe("durable evidence and fault boundaries",()=>{
  it.each(["before-backup","first-copy","both-copies","before-process","after-write","torn-applied","undo-intent","undo-write","torn-undone"])("restart after %s never mutates and uses actual content",async point=>{
    const f=setup(),r=await f.review();
    const write=f.adapter.write.getMockImplementation()!,copy=f.adapter.copy.getMockImplementation()!,process=f.vault.process.getMockImplementation()!;
    if(point.startsWith("undo")||point==="torn-undone")await f.group.execute(r);
    const ticket=point.startsWith("undo")||point==="torn-undone"?await f.group.reviewUndo(r.id,()=>true):r;
    if(point==="before-backup")f.adapter.mkdir.mockRejectedValueOnce(Error("crash"));
    if(point==="first-copy")f.adapter.copy.mockRejectedValueOnce(Error("crash"));
    if(point==="both-copies")f.adapter.copy.mockImplementationOnce(async(...a)=>{await copy(...a);throw Error("crash");});
    if(point==="before-process")f.vault.process.mockRejectedValueOnce(Error("crash"));
    if(point==="after-write"||point==="undo-write")f.vault.process.mockImplementationOnce(async(...a)=>{await process(...a);throw Error("crash");});
    if(point==="torn-applied"||point==="torn-undone"||point==="undo-intent")f.adapter.write.mockImplementation(async(path,raw)=>{
      const m=JSON.parse(raw) as {state?:string};if(m.state===(point==="torn-applied"?"applied":point==="torn-undone"?"undone":"undo_intent")){
        await write(path,point==="undo-intent"?raw:raw.slice(0,20));throw Error("crash");}await write(path,raw);
    });
    await expect(f.group.execute(ticket)).rejects.toThrow();unchanged(f);
    const data=new Map(f.contents),disk=new Map(f.disk),service=f.restart(),rows=await service.group!.history();
    expect(f.contents).toEqual(data);expect(f.disk).toEqual(disk);
    if(point==="before-backup")expect(rows).toEqual([]);
    else {
      const row=rows[0],undone=point==="undo-write"||point==="torn-undone",applied=["after-write","torn-applied","undo-intent"].includes(point);
      expect(row.state).toBe(undone?"undone":applied?"applied":"prepared");
      expect(row.canUndo).toBe(point==="after-write"||point==="undo-intent");
      if(point==="after-write"){f.vault.process.mockImplementation(process);await service.group!.execute(await service.group!.reviewUndo(r.id,()=>true));expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.before);}
    }
  });
  it.each(["record.json","backup.json"])("damaged %s preserves evidence and blocks Undo",async name=>{
    const f=setup(),r=await apply(f),path=f.groupJournal.root+"/"+r.id+"/"+name;f.disk.set(path,"{");const disk=new Map(f.disk);
    const row=(await f.restart().group!.history())[0];expect(row).toMatchObject({damaged:true,scope:"local",canUndo:false});
    await expect(f.group.reviewUndo(r.id,()=>true)).rejects.toThrow();expect(f.disk).toEqual(disk);unchanged(f);
  });
  it.each(["own-backup","foreign-journal","undone-receipt"])("late %s damage during Undo state read blocks the writer",async kind=>{
    const f=setup(),r=await apply(f),undo=await f.group.reviewUndo(r.id,()=>true);
    const read=f.port.read.bind(f.port);let reads=0;
    vi.spyOn(f.port,"read").mockImplementation(async path=>{
      const note=await read(path);
      // Native reads use readPlannerPair; port reads here are the two state inspections.
      if(++reads===4){
        if(kind==="own-backup")f.disk.set(f.groupJournal.root+"/"+r.id+"/backup.json","{");
        else if(kind==="undone-receipt")await f.groupJournal.mark(r.record,"undone",{...f.pair[0],content:f.plan.canonical.before,modified:f.pair[0].file.stat.mtime+1});
        else {f.folders.add(f.journal.root);f.disk.set(f.journal.root+"/unknown.json","{");}
      }
      return note;
    });
    await expect(f.group.execute(undo)).rejects.toThrow();expect(reads).toBeGreaterThanOrEqual(4);
    expect(f.vault.process).toHaveBeenCalledTimes(1);expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after);unchanged(f);
  });
  it("one shared lock excludes every old executor, Undo, resolution and history",async()=>{
    const f=setup();let release!:()=>void;const copy=f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementation(async(...a)=>{await new Promise<void>(r=>{release=r;});await copy(...a);});
    const pending=apply(f);await vi.waitFor(()=>expect(release).toBeDefined());
    const calls=[()=>f.service.review(f.single,f.analysis,()=>true),()=>f.service.reviewUndo("x",()=>true),()=>f.service.reviewResolution("x",()=>true),
      ()=>f.multi.reviewUndo("x",()=>true),()=>f.merge.reviewUndo("x",()=>true),()=>f.service.archive!.reviewUndo("x",()=>true),()=>f.bundle.reviewUndo("x",()=>true),()=>f.group.history()];
    for(const call of calls)await expect(call()).rejects.toEqual(reason("busy"));release();await pending;unchanged(f);
  });
  it.each(["none","canonical","secondary"])("completed Apply with %s edit releases paths, but never grants stale Undo or consent",async edited=>{
    const f=setup(),staleSingle=await f.service.review(f.single,f.analysis,()=>true),r=await apply(f);
    const oldUndo=await f.group.reviewUndo(r.id,()=>true),evidence=groupEvidence(f);
    if(edited!=="none"){
      const note=f.pair[edited==="canonical"?0:1],content=f.contents.get(note.path)!+"\nUSER CONTENT 🪶\n";
      f.contents.set(note.path,content);note.file.stat.mtime++;note.file.stat.size=Buffer.byteLength(content);
      f.caches.set(note.file,groupNote(note.path,content).cache);
    }
    const service=f.restart(),row=(await service.group!.history())[0];
    expect(row).toMatchObject({state:edited==="none"?"applied":"conflict",blocking:false,canUndo:edited==="none"});
    if(edited!=="none")await expect(service.group!.reviewUndo(r.id,()=>true)).rejects.toThrow();
    await expect(f.service.apply(staleSingle!)).rejects.toThrow();await expect(f.group.execute(r)).rejects.toEqual(reason("used"));
    const current=await freshSingle(f),saved=new Map(f.contents);
    const single=await service.review(current.plan,current.analysis,()=>true);expect(single).toBeTruthy();expect(f.contents).toEqual(saved);
    const multi=buildMultiFilePlan(current.analysis,current.read.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(current.read.pair[0])[0],paragraphRanges(current.read.pair[1])[0]],confirmed:[true,true]},current.read.linktexts);
    const multiConsent=await service.multi!.review(multi,current.analysis,()=>true);service.multi!.discard(multiConsent);
    await service.apply(single!);expect(f.contents.get(f.plan.canonical.path)).toBe(current.plan.after);expect(f.contents.get(f.plan.secondary.path)).toBe(saved.get(f.plan.secondary.path));
    const after=new Map(f.contents);await expect(f.group.execute(oldUndo)).rejects.toThrow();
    await expect(service.group!.reviewUndo(r.id,()=>true)).rejects.toThrow();expect(f.contents).toEqual(after);
    expect((await service.group!.history())[0]).toMatchObject({blocking:false,canUndo:false});
    expect(groupEvidence(f)).toEqual(evidence);await expect(f.groupJournal.prepare(r.record)).rejects.toEqual(reason("used"));
    await expect(service.merge!.readApplied(r.id,()=>true)).rejects.toThrow();expect(groupEvidence(f)).toEqual(evidence);
  });
  it.each(["prepared","missing-applied","record.json","backup.json","conflicting-receipts","pending-undo","restored-without-undone"])("unresolved %s still reserves both paths",async fault=>{
    const f=setup(),r=await f.review();
    if(fault==="prepared")await f.groupJournal.prepare(r.record);else await f.group.execute(r);
    if(fault==="missing-applied")for(const path of f.disk.keys())if(path.includes("/mark-"))f.disk.delete(path);
    if(["record.json","backup.json"].includes(fault))f.disk.set(f.groupJournal.root+"/"+r.id+"/"+fault,"{");
    if(fault==="conflicting-receipts")await f.groupJournal.mark(r.record,"applied",{...(await f.port.read(f.plan.canonical.path))!,modified:12345});
    if(fault==="pending-undo"||fault==="restored-without-undone"){
      await f.groupJournal.mark(r.record,"undo_intent",(await f.port.read(f.plan.canonical.path))!);
      if(fault==="restored-without-undone")await f.vault.process(f.pair[0].file,()=>f.plan.canonical.before);
    }
    const service=f.restart(),current=await freshSingle(f),before=new Map(f.contents),disk=new Map(f.disk);
    expect((await service.group!.history())[0].blocking).toBe(true);
    for(const path of [f.plan.canonical.path,f.plan.secondary.path])await expect(service.group!.blockers([path])).rejects.toEqual(reason("storage"));
    await expect(service.review(current.plan,current.analysis,()=>true)).rejects.toEqual(reason("storage"));
    expect(f.contents).toEqual(before);expect(f.disk).toEqual(disk);
  });
  it("completed Undo stays terminal after later edits; a live stale guard cannot re-reserve completed Apply",async()=>{
    const f=setup(),r=await apply(f),guard=vi.spyOn(f.port,"guard").mockImplementation(()=>{throw Object.assign(Error("stale"),{reason:"stale"});});
    expect((await f.group.history())[0]).toMatchObject({blocking:false,canUndo:false});guard.mockRestore();
    await f.group.execute(await f.group.reviewUndo(r.id,()=>true));f.contents.set(f.plan.canonical.path,"Later user data");
    expect((await f.restart().group!.history())[0]).toMatchObject({blocking:false,canUndo:false,state:"conflict"});
  });
  it.each(["single","multi","merge"])("damaged local %s evidence blocks group on participating paths",async kind=>{
    const f=setup();
    if(kind==="single"){
      const t=await f.service.review(f.single,f.analysis,()=>true);f.adapter.copy.mockRejectedValueOnce(Error("backup failure"));
      await expect(f.service.apply(t!)).rejects.toThrow();
    }else if(kind==="multi"){
      const p=buildMultiFilePlan(f.analysis,f.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(f.pair[0])[0],paragraphRanges(f.pair[1])[0]],confirmed:[true,true]},f.read.linktexts);
      await f.multiJournal.prepare(await multiRecord(p));
    }else{
      const m=mergeFixture();m.pair.forEach((n,i)=>{n.path=f.pair[i].path;n.file.path=n.path;});m.analysis.pair=m.pair;const p=buildMergePlan(m.analysis,m.pair,m.choice);
      await f.mergeJournal.prepare(await mergeRecord(p));
    }
    if(kind!=="single"){
      const j=kind==="multi"?f.multiJournal:f.mergeJournal,r=(await j.entries())[0];
      f.disk.set(j.root+"/"+r.id+"/backup.json","{");expect((await j.entries())[0]).toMatchObject({damaged:true,scope:"local"});
    }
    await expect(f.review()).rejects.toEqual(reason("storage"));expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
  });
  it.each(["single","multi","merge","archive","bundle","group"])("global %s journal corruption blocks group consent",async kind=>{
    const f=setup(),root=({single:f.journal,multi:f.multiJournal,merge:f.mergeJournal,archive:f.archiveJournal,bundle:f.bundleJournal,group:f.groupJournal})[kind as "single"].root;
    f.folders.add(root);f.disk.set(root+"/unknown.json","{");await expect(f.review()).rejects.toEqual(reason("storage"));expect(f.vault.process).not.toHaveBeenCalled();
  });
});


describe("Group-specific hierarchy and isolation",()=>{
  it("public preview mutation and forged/cross-service consent cannot authorize different content",async()=>{
    const f=setup(),r=await f.review();r.record.plan.canonical.after="UNAUTHORIZED";r.record.plan.group.copied=[];
    await expect(f.group.execute({...r})).rejects.toEqual(reason("used"));
    await expect(f.restart().group!.execute(r)).rejects.toEqual(reason("used"));
    await f.group.execute(r);expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after);unchanged(f);
  });

  it("frozen 06 copies the chosen H3 context, restart Undo restores both Markdown byte-for-byte",async()=>{
    const c=corpus.cases.find(c=>c.id==="06")!,input=groupFixture(1);
    input.pair.forEach((n,i)=>Object.assign(n,groupNote(n.path,c.notes[i])));
    input.analysis.pair=input.pair;input.analysis.result=c.controlResponse as typeof input.analysis.result;
    input.choice.insertion=input.pair[1].content.length;
    const f=setup(1,false,3,input),before=[...f.contents].map(([p,t])=>[p,Buffer.from(t)]),r=await apply(f);
    expect(f.plan.hierarchy.inserted.map(h=>h.level)).toEqual([1,2,3]);
    const restarted=f.restart();await restarted.group!.execute(await restarted.group!.reviewUndo(r.id,()=>true));
    expect([...f.contents].map(([p,t])=>[p,Buffer.from(t)])).toEqual(before);
  });
  it.each(["Plain preamble.\n\nShared scoped fact.\n", "---\ntitle: Keep\n---\n\n# Existing\n\nShared scoped fact.\n"])("Undo accepts valid destination preamble/YAML: %s",async content=>{
    const input=groupFixture();Object.assign(input.pair[0],groupNote(input.pair[0].path,content));
    input.analysis.pair=input.pair;input.choice.insertion=content.length;
    const f=setup(0,false,3,input),r=await apply(f),restart=f.restart();
    await restart.group!.execute(await restart.group!.reviewUndo(r.id,()=>true));expect(f.contents.get(f.plan.canonical.path)).toBe(content);unchanged(f);
  });
  it("repeated sibling titles retain exact offsets; no sibling is silently included",async()=>{
    const input=groupFixture(),n=input.pair[1],content=n.content.replace("## Other","## Practice")+"\n### Trial\n\nOnly in the retained sibling.\n";
    Object.assign(n,groupNote(n.path,content));input.analysis.pair=input.pair;
    const f=setup(0,false,3,input),r=await apply(f);expect(f.plan.canonical.after).not.toContain("Only in the retained sibling.");
    expect(f.plan.group.retained.map(r=>r.text).join("")).toContain("### Trial");
    const restarted=f.restart();await restarted.group!.execute(await restarted.group!.reviewUndo(r.id,()=>true));unchanged(f);
  });
  it.each(["heading","ancestor-section","protected-ancestor","prefix-tags","prefix-section"])("changed native %s inside copied context refuses Undo",async kind=>{
    const f=setup(),r=await apply(f),cache=structuredClone(f.caches.get(f.pair[0].file)!);
    const start=f.plan.insertion.point+f.plan.insertion.separator.length;
    if(kind==="heading")cache.headings!.find(h=>h.position.start.offset===start)!.level=2;
    const section=cache.sections!.find(s=>s.type==="paragraph"&&s.position.start.offset>start)!;
    if(kind==="ancestor-section")section.type="code";
    if(kind==="protected-ancestor")cache.blocks={hidden:{id:"hidden",position:section.position}};
    if(kind==="prefix-tags")cache.tags=[];
    if(kind==="prefix-section")cache.sections!.find(s=>s.type==="paragraph"&&s.position.end.offset<start)!.type="code";
    f.caches.set(f.pair[0].file,cache);const saved=new Map(f.contents);
    await expect(f.group.reviewUndo(r.id,()=>true)).rejects.toThrow();expect(f.contents).toEqual(saved);expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
  it.each(["05","19","22","23"])("frozen %s cannot execute without its missing dependencies or structure",id=>{
    const c=corpus.cases.find(c=>c.id===id)!,input=groupFixture(id==="19"?1:0);
    input.pair.forEach((n,i)=>Object.assign(n,groupNote(n.path,c.notes[i])));input.analysis.pair=input.pair;input.analysis.result=c.controlResponse as typeof input.analysis.result;
    const side=input.choice.canonical!,groups=contextGroups(input.pair[1-side]).groups;
    input.choice.group=groups.at(-1)?.range??null;input.choice.insertion=input.pair[side].content.length;
    if(id==="05"||id==="19")input.choice.dependencies="unresolved";
    expect(()=>buildGroupPlan(input.analysis,input.pair,input.choice,input.read.linktexts)).toThrow();
  });
  it.each(["bundle","archive"])("damaged local %s copies block Group while unrelated paths stay available",async kind=>{
    const other=kind==="bundle"?bundleApplyFixture():await archiveApplyFixture();
    if(kind==="bundle"){const b=other as ReturnType<typeof bundleApplyFixture>;await b.bundle.execute(await b.review());}
    else {const a=other as Awaited<ReturnType<typeof archiveApplyFixture>>;await a.archive.execute(await a.review());}
    const input=groupFixture();input.pair.forEach((n,i)=>{n.path=other.pair[i].path;n.file.path=n.path;});input.analysis.pair=input.pair;input.read.linktexts=input.pair.map(n=>n.path.slice(0,-3)) as [string,string];
    const f=setup(0,false,3,input),old=kind==="bundle"?(other as ReturnType<typeof bundleApplyFixture>).bundleJournal:other.archiveJournal;
    const dest=kind==="bundle"?f.bundleJournal:f.archiveJournal;
    for(const folder of other.folders)if(folder.startsWith(old.root))f.folders.add(folder.replace(old.root,dest.root));
    for(const [path,raw] of other.disk)if(path.startsWith(old.root))f.disk.set(path.replace(old.root,dest.root),path.endsWith("backup.json")?"{":raw);
    expect((await dest.entries())[0]).toMatchObject({damaged:true,scope:"local"});
    await expect(f.review()).rejects.toEqual(reason("storage"));expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("Group unresolved reservation blocks every old executor and resolution regardless of history source state",async()=>{
    const f=setup(),r=await f.review();await f.groupJournal.prepare(r.record);
    const calls=[()=>f.service.review(f.single,f.analysis,()=>true),()=>f.group.blockers([f.plan.secondary.path]),()=>f.group.blockers([f.plan.canonical.path])];
    for(const call of calls)await expect(call()).rejects.toEqual(reason("storage"));
    await expect(f.group.blockers(["Unrelated.md"])).resolves.toBeUndefined();
  });
});


describe("six-family owner integration",()=>{
  it.each(["single-review","multi-review","bundle-review","bundle-undo","merge-undo","archive-review","archive-undo","resolution"])("unresolved Group blocks real %s entrypoint",async kind=>{
    const archived=kind.startsWith("archive")||kind==="merge-undo",f=archived?await archiveApplyFixture():bundleApplyFixture();
    if(kind==="bundle-undo"){const b=f as ReturnType<typeof bundleApplyFixture>;await b.bundle.execute(await b.review());}
    if(kind==="archive-undo"){const a=f as Awaited<ReturnType<typeof archiveApplyFixture>>;await a.archive.execute(await a.review());}
    let resolutionId="";
    if(kind==="resolution"){
      const r=await f.service.review(f.single,f.analysis,()=>true);await f.service.apply(r!);resolutionId=r!.id;
      f.disk.set(f.journal.root+"/"+resolutionId+"/applied.json","{");
    }
    const input=groupFixture();input.pair.forEach((n,i)=>{n.path=f.pair[i].path;n.file.path=n.path;});input.analysis.pair=input.pair;
    const g=new GroupJournal(f.adapter as never,f.vault.configDir,"ai-knowledge-hub");
    await g.prepare(await groupRecord(buildGroupPlan(input.analysis,input.pair,input.choice,input.read.linktexts)));
    const service=createSafeApplyService(f.app,"ai-knowledge-hub"),before=new Map(f.contents),disk=new Map(f.disk);
    const b=f as ReturnType<typeof bundleApplyFixture>,a=f as Awaited<ReturnType<typeof archiveApplyFixture>>;
    const run=async()=>{
      if(kind==="single-review")return service.review(b.single,b.analysis,()=>true);
      if(kind==="multi-review")return service.multi!.review(buildMultiFilePlan(b.analysis,b.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(b.pair[0])[0],paragraphRanges(b.pair[1])[0]],confirmed:[true,true]},b.read.linktexts),b.analysis,()=>true);
      if(kind==="bundle-review")return service.bundle!.review(b.plan,b.analysis,()=>true);
      if(kind==="bundle-undo")return service.bundle!.reviewUndo((await b.bundleJournal.entries())[0].id,()=>true);
      if(kind==="merge-undo")return service.merge!.reviewUndo(a.mergeReview.id,()=>true);
      if(kind==="archive-review")return service.archive!.review(a.plan,()=>true);
      if(kind==="archive-undo")return service.archive!.reviewUndo((await a.archiveJournal.entries())[0].id,()=>true);
      return service.reviewResolution(resolutionId,()=>true);
    };
    await expect(run()).rejects.toEqual(reason("storage"));expect(f.contents).toEqual(before);expect(f.disk).toEqual(disk);
  });
});
