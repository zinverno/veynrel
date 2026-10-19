import {afterEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>{
  class Element {
    closest() { return null; }
    focused=false;focus(){this.focused=true;}setAttribute(key:string,value:string){this.attrs[key]=value;}
    querySelector(){return this.all().find(e=>["alert","status"].includes(e.attrs.role)||e.tag==="h3")??null;}
    children:Element[]=[];text="";tag="div";attrs:Record<string,string>={};listeners=new Map<string,()=>void>();
    empty(){this.children=[];}addClass(){}setText(text:string){this.text=text;}
    create(tag:string,opts:{text?:string;attr?:Record<string,string>}={}){const e=new Element();e.tag=tag;e.text=opts.text??"";e.attrs=opts.attr??{};this.children.push(e);return e;}
    createEl(tag:string,opts={}){return this.create(tag,opts);}createDiv(opts={}){return this.create("div",opts);}createSpan(opts={}){return this.create("span",opts);}
    addEventListener(key:string,fn:()=>void){this.listeners.set(key,fn);}all():Element[]{return [this,...this.children.flatMap(e=>e.all())];}
    action(key:string){return this.all().find(e=>e.attrs["data-empty-atom-apply"]===key);}click(){this.listeners.get("click")?.();}
  }
  class Modal{contentEl=new Element();modalEl=new Element();titleEl=new Element();constructor(public app:unknown){}onOpen(){}onClose(){}open(){this.onOpen();}close(){this.onClose();}}
  return {Element,Modal};
});
vi.mock("obsidian",()=>({TFile:class {},TFolder:class {},MarkdownView:class {},Modal:mocks.Modal,getLanguage:()=>"en",parseLinktext:(s:string)=>({path:s}),requestUrl:vi.fn(),parseYaml:vi.fn()}));
import {emptyAtomFixture} from "../tests/emptyAtomFixture";
import {emptyAtomRecord} from "./emptyAtomJournal";
import {EmptyAtomApplyModal,renderEmptyAtomHistory} from "./emptyAtomApplyModal";
import type {EmptyAtomApply} from "./emptyAtomApply";
import {setLanguage} from "../i18n";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
async function setup(){
  const f=emptyAtomFixture(),record=await emptyAtomRecord((await f.plan()).plan),review={id:record.id,action:"apply" as const,record};
  const events=new Map<object,()=>void>(),on=vi.fn((_key:string,fn:()=>void)=>{const ref={};events.set(ref,fn);return ref;}),offref=vi.fn((ref:object)=>events.delete(ref));
  const app={vault:{on,offref},metadataCache:{on,offref}},service={execute:vi.fn(async()=>{}),discard:vi.fn()},prepare=vi.fn(async(_current:()=>boolean)=>review);
  const modal=new EmptyAtomApplyModal(app as never,service as unknown as EmptyAtomApply,prepare,vi.fn());
  return {modal,review,service,prepare,events,offref,root:modal.contentEl as unknown as InstanceType<typeof mocks.Element>};
}
describe("separate empty-note consent",()=>{
  it("recorded success is not replaced by late metadata events",async()=>{
    const f=await setup();f.modal.open();await flush();f.root.action("confirm")!.click();await flush();
    expect(f.events.size).toBe(0);expect(f.root.action("history")).toBeDefined();expect(f.root.all().some(e=>e.attrs.role==="alert")).toBe(false);
  });
  it.each(["en","ru"] as const)("%s shows exact originals, context, empty before, after and diff before consent",async language=>{
    setLanguage(language);const f=await setup();f.modal.open();await flush();const p=f.review.record.plan,all=f.root.all();
    expect(all.filter(e=>e.attrs["data-empty-atom-text"]==="@atom.original").map(e=>e.text)).toEqual(p.sources.map(n=>n.markdown));
    expect(all.find(e=>e.attrs["data-empty-atom-text"]==="@planner.before")!.text).toBe("");
    expect(all.find(e=>e.attrs["data-empty-atom-text"]==="@planner.after")!.text).toBe(p.target.after);
    expect(all.some(e=>e.tag==="img"||e.text.startsWith("@emptyAtom."))).toBe(false);expect(f.service.execute).not.toHaveBeenCalled();
    f.root.action("confirm")!.click();await flush();expect(f.service.execute).toHaveBeenCalledExactlyOnceWith(f.review);
  });
  it.each(["close","change"])("%s revokes late reads and cannot restore a confirm button",async action=>{
    const f=await setup();let done!:()=>void;f.prepare.mockImplementationOnce(()=>new Promise(resolve=>{done=()=>resolve(f.review);}));
    f.modal.open();if(action==="close")f.modal.close();else [...f.events.values()][0]();done();await flush();
    expect(f.root.action("confirm")).toBeUndefined();expect(f.service.discard).toHaveBeenCalledWith(f.review);expect(f.service.execute).not.toHaveBeenCalled();
    if(action==="close")expect(f.events.size).toBe(0);
  });
  it("observed changes revoke an already displayed ticket and cancel removes listeners",async()=>{
    const f=await setup();f.modal.open();await flush();const confirm=f.root.action("confirm")!;[...f.events.values()][4]();confirm.click();await flush();
    expect(f.service.execute).not.toHaveBeenCalled();expect(f.service.discard).toHaveBeenCalledWith(f.review);f.modal.close();expect(f.events.size).toBe(0);
  });
  it("Undo has separate reversed preview; history never dispatches automatically",async()=>{
    const f=await setup();Object.assign(f.review,{action:"undo"});f.modal.open();await flush();const p=f.review.record.plan;
    expect(f.root.all().find(e=>e.attrs["data-empty-atom-text"]==="@planner.before")!.text).toBe(p.target.after);
    expect(f.root.all().find(e=>e.attrs["data-empty-atom-text"]==="@planner.after")!.text).toBe("");
    const root=new mocks.Element(),action=vi.fn();renderEmptyAtomHistory(root as unknown as HTMLElement,{id:f.review.id,record:f.review.record,state:"applied",targetState:"after",sourcesUnchanged:true,editorBlocked:false,canUndo:true,recovered:false,blocking:false,damaged:false,scope:"none",receipts:[],issues:[]},action);
    expect(action).not.toHaveBeenCalled();expect(f.service.execute).not.toHaveBeenCalled();root.action("undoReview")!.click();expect(action).toHaveBeenCalledOnce();
  });
});
