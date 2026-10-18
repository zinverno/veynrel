import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({TFile:class {},MarkdownView:class {},getLanguage:()=>"en",parseLinktext:(s:string)=>({path:s}),requestUrl:vi.fn(),parseYaml:vi.fn()}));
import { requestUrl } from "obsidian";
import { bundleApplyFixture as setup } from "../tests/bundleApplyFixture";
import { bundleRecord, validateBundleRecord } from "./bundleJournal";
import { checksum, validateOperation } from "./operationJournal";
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
const apply=async(f:ReturnType<typeof setup>)=>{const r=await f.review();await f.bundle.execute(r);return r;};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("separate structured-copy authority",()=>{
  it.each(["```js\nreturn 1;\n```","1. Название.\n2. Дата.","> Recollection 🪶 é."])("copies and undoes %s after restart, both directions and CRLF",async core=>{
    for(const side of [0,1] as const)for(const crlf of [false,true]){
      const f=setup(core,side,crlf),review=await f.review();
      expect(f.disk.size).toBe(0);expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
      const process=f.vault.process.getMockImplementation()!;
      f.vault.process.mockImplementation(async(...args)=>{
        const [entry]=await f.bundleJournal.entries();expect(entry.damaged).toBe(false);
        expect([...f.disk.keys()].filter(k=>k.endsWith("record.json")||k.endsWith("backup.json"))).toHaveLength(2);
        return process(...args);
      });
      await f.bundle.execute(review);expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after);unchanged(f);
      expect((await f.bundle.history())[0]).toMatchObject({state:"applied",canUndo:true,blocking:true});
      const restarted=f.restart(),undo=await restarted.bundle!.reviewUndo(review.id,()=>true);
      expect(f.vault.process).toHaveBeenCalledTimes(1);await restarted.bundle!.execute(undo);unchanged(f);
      expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.before);
      expect((await restarted.bundle!.history())[0]).toMatchObject({state:"undone",canUndo:false,blocking:false});
      await expect(f.bundle.execute(review)).rejects.toEqual(reason("used"));await expect(restarted.bundle!.execute(undo)).rejects.toEqual(reason("used"));
      await expect(restarted.bundle!.reviewUndo(review.id,()=>true)).rejects.toThrow();await expect(f.review()).rejects.toThrow();
      expect(await f.mergeJournal.entries()).toEqual([]);expect(await f.archiveJournal.entries()).toEqual([]);expect(requestUrl).not.toHaveBeenCalled();
    }
  });
  it("native persisted cache version survives restart, public structure changes still refuse Undo",async()=>{
    const f=setup("1. First.\n2. Second."),r=await apply(f),secondary=f.pair[1];
    secondary.cache!.listItems=secondary.cache!.listItems!.map(item=>({position:item.position,parent:item.parent}));
    f.caches.set(secondary.file,{...secondary.cache,v:1} as never);
    const restarted=f.restart(),undo=await restarted.bundle!.reviewUndo(r.id,()=>true);
    f.caches.set(secondary.file,{...secondary.cache,v:1,tags:[]} as never);
    await expect(restarted.bundle!.execute(undo)).rejects.toThrow();expect(f.vault.process).toHaveBeenCalledTimes(1);
    f.caches.set(secondary.file,{...secondary.cache,v:1} as never);
    await restarted.bundle!.execute(await restarted.bundle!.reviewUndo(r.id,()=>true));unchanged(f);
  });
  it("analysis changed during final journal reads invalidates consent and execution",async()=>{
    for(const phase of ["review","execute"]){
      const f=setup(),r=phase==="execute"?await f.review():undefined,has=f.bundleJournal.has.bind(f.bundleJournal),entries=f.bundleJournal.entries.bind(f.bundleJournal);
      if(phase==="review")vi.spyOn(f.bundleJournal,"has").mockImplementation(async id=>{const v=await has(id);f.analysis.result.relation="conflicting";return v;});
      else vi.spyOn(f.bundleJournal,"entries").mockImplementation(async()=>{const v=await entries();if(v.length)f.analysis.result.relation="conflicting";return v;});
      await expect(r?f.bundle.execute(r):f.review()).rejects.toThrow();expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
    }
  });
  it("stable ID, strict discriminators, unchanged old validators and no archive eligibility",async()=>{
    const f=setup(),r=await bundleRecord(f.plan);expect((await bundleRecord(f.plan)).id).toBe(r.id);
    expect(await validateBundleRecord(r,r.id)).toEqual(r);
    await expect(validateMergeRecord(r,r.id)).rejects.toThrow();await expect(validateMultiRecord(r,r.id)).rejects.toThrow();
    await expect(validateArchiveRecord(r,r.id)).rejects.toThrow();await expect(validateOperation(r,r.id)).rejects.toThrow();
    for(const mutate of [(x:typeof r)=>{x.operation="merge_knowledge_copy" as never;},(x:typeof r)=>{x.plan.kind="heading_group" as never;},
      (x:typeof r)=>{x.plan.bundle.core.start++;},(x:typeof r)=>{x.plan.bundle.blocks.pop();},(x:typeof r)=>{x.plan.canonical.after+="tamper";},
      (x:typeof r)=>{x.plan.confirmations.context.pop();},(x:typeof r)=>{x.plan.insertion.edit.inserted+="x";}]){
      const bad=structuredClone(r);mutate(bad);bad.id=await checksum(JSON.stringify({...bad,id:"",createdAt:0}));
      await expect(validateBundleRecord(bad,bad.id)).rejects.toEqual(reason("storage"));
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
        await expect(f.bundle.execute(r)).rejects.toThrow();}
      expect(f.vault.process,phase+kind).not.toHaveBeenCalled();
    }
  });
  it.each(["resolver","incoming"])("dependency %s changes after consent refuse all writes",async kind=>{
    const f=setup(),r=await f.review();
    if(kind==="resolver")vi.spyOn(f.app.metadataCache,"getFirstLinkpathDest").mockReturnValue(null);
    else f.app.metadataCache.resolvedLinks={};
    await expect(f.bundle.execute(r)).rejects.toThrow();expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
  });
  it("callback race checks exact before; post-write secondary mutation never marks success",async()=>{
    const f=setup(),r=await f.review(),before=f.contents.get(f.plan.canonical.path);
    const process=f.vault.process.getMockImplementation()!;f.vault.process.mockImplementation(async(file,cb)=>{f.contents.set(file.path,before+"user edit");return process(file,cb);});
    await expect(f.bundle.execute(r)).rejects.toEqual(reason("write"));unchanged(f);expect(f.contents.get(f.plan.canonical.path)).toBe(before+"user edit");
    const g=setup(),p=g.vault.process.getMockImplementation()!;g.vault.process.mockImplementation(async(...args)=>{const v=await p(...args);g.contents.set(g.plan.secondary.path,"external edit");return v;});
    await expect(apply(g)).rejects.toEqual(reason("conflict"));expect((await g.bundleJournal.entries())[0].receipts).toEqual([]);
  });
  it.each([0,1])("later edit on %s including same-text touch blocks Undo",async side=>{
    for(const content of [false,true]){
      const f=setup(),r=await apply(f);f.pair[side].file.stat.mtime++;
      if(content)f.contents.set(f.pair[side].path,"USER CONTENT");const saved=new Map(f.contents);
      await expect(f.restart().bundle!.reviewUndo(r.id,()=>true)).rejects.toThrow();expect(f.contents).toEqual(saved);
    }
  });
  it("cancelled, discarded and concurrent consent cannot execute; final analysis mutation fails",async()=>{
    const f=setup(),r=await f.review();f.bundle.discard(r);await expect(f.bundle.execute(r)).rejects.toEqual(reason("used"));
    const a=await f.review(),b=await f.review();await f.bundle.execute(a);await expect(f.bundle.execute(b)).rejects.toThrow();unchanged(f);
    const g=setup(),v=await g.review();g.cancel();await expect(g.bundle.execute(v)).rejects.toEqual(reason("cancelled"));expect(g.disk.size).toBe(0);
    const h=setup(),w=await h.review();h.analysis.result.limitations.push("changed");await expect(h.bundle.execute(w)).rejects.toThrow();expect(h.disk.size).toBe(0);
  });
});

describe("durable evidence and fault boundaries",()=>{
  it.each(["before-backup","first-copy","both-copies","before-process","after-write","torn-applied","undo-intent","undo-write","torn-undone"])("restart after %s never mutates and uses actual content",async point=>{
    const f=setup(),r=await f.review();
    const write=f.adapter.write.getMockImplementation()!,copy=f.adapter.copy.getMockImplementation()!,process=f.vault.process.getMockImplementation()!;
    if(point.startsWith("undo")||point==="torn-undone")await f.bundle.execute(r);
    const ticket=point.startsWith("undo")||point==="torn-undone"?await f.bundle.reviewUndo(r.id,()=>true):r;
    if(point==="before-backup")f.adapter.mkdir.mockRejectedValueOnce(Error("crash"));
    if(point==="first-copy")f.adapter.copy.mockRejectedValueOnce(Error("crash"));
    if(point==="both-copies")f.adapter.copy.mockImplementationOnce(async(...a)=>{await copy(...a);throw Error("crash");});
    if(point==="before-process")f.vault.process.mockRejectedValueOnce(Error("crash"));
    if(point==="after-write"||point==="undo-write")f.vault.process.mockImplementationOnce(async(...a)=>{await process(...a);throw Error("crash");});
    if(point==="torn-applied"||point==="torn-undone"||point==="undo-intent")f.adapter.write.mockImplementation(async(path,raw)=>{
      const m=JSON.parse(raw) as {state?:string};if(m.state===(point==="torn-applied"?"applied":point==="torn-undone"?"undone":"undo_intent")){
        await write(path,point==="undo-intent"?raw:raw.slice(0,20));throw Error("crash");}await write(path,raw);
    });
    await expect(f.bundle.execute(ticket)).rejects.toThrow();unchanged(f);
    const data=new Map(f.contents),disk=new Map(f.disk),service=f.restart(),rows=await service.bundle!.history();
    expect(f.contents).toEqual(data);expect(f.disk).toEqual(disk);
    if(point==="before-backup")expect(rows).toEqual([]);
    else {
      const row=rows[0],undone=point==="undo-write"||point==="torn-undone",applied=["after-write","torn-applied","undo-intent"].includes(point);
      expect(row.state).toBe(undone?"undone":applied?"applied":"prepared");
      expect(row.canUndo).toBe(point==="after-write"||point==="undo-intent");
      if(point==="after-write"){f.vault.process.mockImplementation(process);await service.bundle!.execute(await service.bundle!.reviewUndo(r.id,()=>true));expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.before);}
    }
  });
  it.each(["record.json","backup.json"])("damaged %s preserves evidence and blocks Undo",async name=>{
    const f=setup(),r=await apply(f),path=f.bundleJournal.root+"/"+r.id+"/"+name;f.disk.set(path,"{");const disk=new Map(f.disk);
    const row=(await f.restart().bundle!.history())[0];expect(row).toMatchObject({damaged:true,scope:"local",canUndo:false});
    await expect(f.bundle.reviewUndo(r.id,()=>true)).rejects.toThrow();expect(f.disk).toEqual(disk);unchanged(f);
  });
  it.each(["own-backup","foreign-journal","undone-receipt"])("late %s damage during Undo state read blocks the writer",async kind=>{
    const f=setup(),r=await apply(f),undo=await f.bundle.reviewUndo(r.id,()=>true);
    const read=f.port.read.bind(f.port);let reads=0;
    vi.spyOn(f.port,"read").mockImplementation(async path=>{
      const note=await read(path);
      // Native reads use readPlannerPair; port reads here are the two state inspections.
      if(++reads===4){
        if(kind==="own-backup")f.disk.set(f.bundleJournal.root+"/"+r.id+"/backup.json","{");
        else if(kind==="undone-receipt")await f.bundleJournal.mark(r.record,"undone",{...f.pair[0],content:f.plan.canonical.before,modified:f.pair[0].file.stat.mtime+1});
        else {f.folders.add(f.journal.root);f.disk.set(f.journal.root+"/unknown.json","{");}
      }
      return note;
    });
    await expect(f.bundle.execute(undo)).rejects.toThrow();expect(reads).toBeGreaterThanOrEqual(4);
    expect(f.vault.process).toHaveBeenCalledTimes(1);expect(f.contents.get(f.plan.canonical.path)).toBe(f.plan.canonical.after);unchanged(f);
  });
  it("one shared lock excludes every old executor, Undo, resolution and history",async()=>{
    const f=setup();let release!:()=>void;const copy=f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementation(async(...a)=>{await new Promise<void>(r=>{release=r;});await copy(...a);});
    const pending=apply(f);await vi.waitFor(()=>expect(release).toBeDefined());
    const calls=[()=>f.service.review(f.single,f.analysis,()=>true),()=>f.service.reviewUndo("x",()=>true),()=>f.service.reviewResolution("x",()=>true),
      ()=>f.multi.reviewUndo("x",()=>true),()=>f.merge.reviewUndo("x",()=>true),()=>f.service.archive!.reviewUndo("x",()=>true),()=>f.bundle.history()];
    for(const call of calls)await expect(call()).rejects.toEqual(reason("busy"));release();await pending;unchanged(f);
  });
  it("active bundle blocks old single/multi operations and clears only after verified Undo",async()=>{
    const f=setup(),single=await f.service.review(f.single,f.analysis,()=>true),r=await apply(f);expect(single).toBeTruthy();
    await expect(f.service.apply(single!)).rejects.toThrow();
    const read=await readPlannerPair(f.app,[f.pair[0].path,f.pair[1].path]),analysis={...f.analysis,pair:read.pair};
    const singleFresh=buildChangePlan(analysis,read.pair,{operation:"add_link",source:0,selection:paragraphRanges(read.pair[0])[0],confirmed:true},read.linktexts[1]);
    await expect(f.service.review(singleFresh,analysis,()=>true)).rejects.toEqual(reason("storage"));
    const multi=buildMultiFilePlan(analysis,read.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(read.pair[0])[0],paragraphRanges(read.pair[1])[0]],confirmed:[true,true]},read.linktexts);
    await expect(f.multi.review(multi,analysis,()=>true)).rejects.toEqual(reason("storage"));
    await f.bundle.execute(await f.bundle.reviewUndo(r.id,()=>true));expect((await f.bundle.history())[0].blocking).toBe(false);unchanged(f);
  });
  it.each(["single","multi","merge"])("valid prepared local %s evidence blocks bundle on participating paths",async kind=>{
    const f=setup();
    if(kind==="single"){
      const t=await f.service.review(f.single,f.analysis,()=>true);f.adapter.copy.mockRejectedValueOnce(Error("backup failure"));
      await expect(f.service.apply(t!)).rejects.toThrow();
    }else if(kind==="multi"){
      const p=buildMultiFilePlan(f.analysis,f.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(f.pair[0])[0],paragraphRanges(f.pair[1])[0]],confirmed:[true,true]},f.read.linktexts);
      await f.multiJournal.prepare(await multiRecord(p));
    }else{
      const p=buildMergePlan(f.analysis,f.pair,{operation:"merge_knowledge",canonical:1,transfers:[{range:paragraphRanges(f.pair[0])[1],contextReviewed:true}],insertion:paragraphRanges(f.pair[1])[0],insertionConfirmed:true});
      await f.mergeJournal.prepare(await mergeRecord(p));
    }
    await expect(f.review()).rejects.toEqual(reason("storage"));expect(f.vault.process).not.toHaveBeenCalled();unchanged(f);
  });
  it.each(["single","multi","merge","archive","bundle"])("global %s journal corruption blocks bundle consent",async kind=>{
    const f=setup(),root=({single:f.journal,multi:f.multiJournal,merge:f.mergeJournal,archive:f.archiveJournal,bundle:f.bundleJournal})[kind as "single"].root;
    f.folders.add(root);f.disk.set(root+"/unknown.json","{");await expect(f.review()).rejects.toEqual(reason("storage"));expect(f.vault.process).not.toHaveBeenCalled();
  });
});
