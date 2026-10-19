import {afterEach,describe,expect,it,vi} from "vitest";
vi.mock("obsidian",()=>({TFile:class {},TFolder:class {},MarkdownView:class {},getLanguage:()=>"en",parseLinktext:(s:string)=>({path:s}),requestUrl:vi.fn(),parseYaml:vi.fn()}));
import {emptyAtomFixture as setup} from "../tests/emptyAtomFixture";
import {groupApplyFixture} from "../tests/groupApplyFixture";
import {bundleApplyFixture} from "../tests/bundleApplyFixture";
import {archiveApplyFixture} from "../tests/archiveApplyFixture";
import {createSafeApplyService} from "./obsidianSafeApply";
import {buildMultiFilePlan} from "./multiFilePlan";
import {paragraphRanges} from "./changePlan";
import {multiRecord} from "./multiFileJournal";
import {groupRecord} from "./groupJournal";
import {EmptyAtomJournal,emptyAtomRecord} from "./emptyAtomJournal";
const reason=(reason:string):unknown=>expect.objectContaining({reason});
const familyRoots=["consolidation-operations","consolidation-multi-operations","consolidation-merge-operations","consolidation-archive-operations","consolidation-bundle-operations","consolidation-group-operations","consolidation-empty-atom-operations"];
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
describe("seven-family integration",()=>{
  it.each(familyRoots)("global damage in %s blocks new consent",async family=>{
    const f=setup(),root=`${f.vault.configDir}/plugins/ai-knowledge-hub/${family}`;f.privateFolders.add(root);f.disk.set(root+"/foreign.json","{");
    await expect(f.review()).rejects.toEqual(reason("storage"));expect(f.vault.process).not.toHaveBeenCalled();
  });
  it.each(["single","multi","merge","archive","bundle","group"])("local %s evidence reserves only overlapping paths",async family=>{
    const old=family==="archive"||family==="merge"?await archiveApplyFixture():family==="bundle"?bundleApplyFixture():groupApplyFixture();
    const g=old as ReturnType<typeof groupApplyFixture>,b=old as ReturnType<typeof bundleApplyFixture>,a=old as Awaited<ReturnType<typeof archiveApplyFixture>>;
    if(family==="single"){
      const r=await old.service.review(old.single,old.analysis,()=>true);old.adapter.copy.mockRejectedValueOnce(Error("stop"));await expect(old.service.apply(r!)).rejects.toBeDefined();
    }
    if(family==="multi")await old.multiJournal.prepare(await multiRecord(buildMultiFilePlan(old.analysis,old.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(old.pair[0])[0],paragraphRanges(old.pair[1])[0]],confirmed:[true,true]},old.read.linktexts)));
    if(family==="group")await g.groupJournal.prepare(await groupRecord(g.plan));
    if(family==="bundle")await b.bundle.execute(await b.review());
    if(family==="archive")await a.archive.execute(await a.review());
    const journal=family==="single"?old.journal:family==="multi"?old.multiJournal:family==="merge"?old.mergeJournal:family==="archive"?old.archiveJournal:family==="bundle"?b.bundleJournal:g.groupJournal;
    for(const overlapping of [true,false]){
      const f=setup(undefined,overlapping?[old.pair[0].path,old.pair[1].path]:undefined),root=`${f.vault.configDir}/plugins/ai-knowledge-hub/${journal.root.split("/").pop()}`;
      for(const folder of old.folders)if(folder.startsWith(journal.root))f.privateFolders.add(folder.replace(journal.root,root));
      for(const [path,raw] of old.disk)if(path.startsWith(journal.root))f.disk.set(path.replace(journal.root,root),path.endsWith("backup.json")?"{":raw);
      if(overlapping)await expect(f.review()).rejects.toEqual(reason("storage"));else {const r=await f.review();f.atom.discard(r);}
      expect(f.vault.process).not.toHaveBeenCalled();
    }
  });
  it.each(["single","multi","group","bundle","bundle-undo","merge-undo","archive","archive-undo","resolution"])("pending atom blocks actual %s entrypoint",async kind=>{
    const archived=kind.startsWith("archive")||kind==="merge-undo",f=archived?await archiveApplyFixture():kind==="group"?groupApplyFixture():bundleApplyFixture();
    const b=f as ReturnType<typeof bundleApplyFixture>,g=f as ReturnType<typeof groupApplyFixture>,a=f as Awaited<ReturnType<typeof archiveApplyFixture>>;
    if(kind==="bundle-undo")await b.bundle.execute(await b.review());if(kind==="archive-undo")await a.archive.execute(await a.review());
    let resolutionId="";
    if(kind==="resolution"){const r=await f.service.review(f.single,f.analysis,()=>true);await f.service.apply(r!);resolutionId=r!.id;f.disk.set(f.journal.root+"/"+r!.id+"/applied.json","{");}
    const atom=setup(undefined,[f.pair[0].path,f.pair[1].path]),record=await emptyAtomRecord((await atom.plan()).plan);
    const journal=new EmptyAtomJournal(f.adapter as never,f.vault.configDir,"ai-knowledge-hub");await journal.prepare(record);
    const service=createSafeApplyService(f.app,"ai-knowledge-hub"),before=new Map(f.contents),disk=new Map(f.disk);
    const run=()=>{
      if(kind==="single")return service.review(f.single,f.analysis,()=>true);
      if(kind==="multi")return service.multi!.review(buildMultiFilePlan(f.analysis,f.pair,{operation:"add_reciprocal_links",selections:[paragraphRanges(f.pair[0])[0],paragraphRanges(f.pair[1])[0]],confirmed:[true,true]},f.read.linktexts),f.analysis,()=>true);
      if(kind==="group")return service.group!.review(g.plan,g.analysis,()=>true);
      if(kind==="bundle")return service.bundle!.review(b.plan,b.analysis,()=>true);
      if(kind==="bundle-undo")return b.bundleJournal.entries().then(rows=>service.bundle!.reviewUndo(rows[0].id,()=>true));
      if(kind==="merge-undo")return service.merge!.reviewUndo(a.mergeReview.id,()=>true);
      if(kind==="archive")return service.archive!.review(a.plan,()=>true);
      if(kind==="archive-undo")return a.archiveJournal.entries().then(rows=>service.archive!.reviewUndo(rows[0].id,()=>true));
      return service.reviewResolution(resolutionId,()=>true);
    };
    await expect(run()).rejects.toEqual(reason("storage"));expect(f.contents).toEqual(before);expect(f.disk).toEqual(disk);
  });
  it("the same plugin lock excludes every family and history during journal preparation",async()=>{
    const f=setup(),r=await f.review();let release!:()=>void;const copy=f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementation(async(...args)=>{await new Promise<void>(resolve=>{release=resolve;});await copy(...args);});
    const pending=f.atom.execute(r);await vi.waitFor(()=>expect(release).toBeDefined());
    const calls=[()=>f.service.history(),()=>f.service.reviewUndo("x",()=>true),()=>f.service.reviewResolution("x",()=>true),()=>f.service.multi!.reviewUndo("x",()=>true),
      ()=>f.service.merge!.reviewUndo("x",()=>true),()=>f.service.archive!.reviewUndo("x",()=>true),()=>f.service.bundle!.reviewUndo("x",()=>true),()=>f.service.group!.reviewUndo("x",()=>true),()=>f.atom.history()];
    for(const call of calls)await expect(call()).rejects.toEqual(reason("busy"));release();await pending;
  });
});
