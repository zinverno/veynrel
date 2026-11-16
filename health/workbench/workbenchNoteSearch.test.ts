import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({getLanguage:()=>"en",setIcon:vi.fn()}));
import { setLanguage } from "../../i18n";
import { renderPairNoteSearch, searchPairNotes } from "./workbenchNoteSearch";
import { renderFamilies } from "./renderFamilies";
import type { FamilyProjection } from "./workbenchFamilies";
type TestEvent={key?:string;preventDefault():void;stopPropagation():void};
class Element {
  children:Element[]=[]; value=""; text=""; tag="div"; attrs:Record<string,string>={}; disabled=false;
  ownerDocument:{activeElement?:Element}; listeners=new Map<string,(event:TestEvent)=>void>();
  constructor(document:{activeElement?:Element}={}){this.ownerDocument=document;}
  createEl(tag:string,options:{text?:string;attr?:Record<string,string>}={}){const e=new Element(this.ownerDocument);e.tag=tag;e.text=options.text??"";e.attrs=options.attr??{};this.children.push(e);return e;}
  createDiv(options:{text?:string;attr?:Record<string,string>}={}){const e=new Element(this.ownerDocument);e.text=options.text??"";e.attrs=options.attr??{};this.children.push(e);return e;} empty(){this.children=[];} setText(text:string){this.text=text;}
  setAttribute(key:string,value:string){this.attrs[key]=value;}
  addEventListener(name:string,listener:(event:TestEvent)=>void){this.listeners.set(name,listener);}
  all():Element[]{return [this,...this.children.flatMap(e=>e.all())];}
  querySelectorAll(tag:string){return this.all().slice(1).filter(e=>e.tag===tag);}
  focus(){this.ownerDocument.activeElement=this;}
  event(name:string,key?:string){const event={key,preventDefault:vi.fn(),stopPropagation:vi.fn()};this.listeners.get(name)?.(event);return event;}
}
describe("native-control pair search presentation",()=>{
  it.each(["ru","en"] as const)("bounds DOM and supports keyboard/focus in %s",lang=>{
    setLanguage(lang);const root=new Element(),select=vi.fn(),paths=Array.from({length:10000},(_,i)=>`Folder/Note ${i}.md`);let current=true;
    renderPairNoteSearch(root as unknown as HTMLElement,{query:"",changed:vi.fn(),current:()=>current,search:q=>searchPairNotes(paths,paths[0],q),select});
    const section=root.children[0],input=root.querySelectorAll("input")[0];
    expect(root.querySelectorAll("button")).toHaveLength(20);expect(root.all().length).toBeLessThan(70);
    expect(root.querySelectorAll("p")[0].text).toContain("9999");expect(input.attrs["aria-label"]).not.toContain("@");
    input.focus();section.event("keydown","ArrowDown");expect(root.ownerDocument.activeElement).toBe(root.querySelectorAll("button")[0]);
    section.event("keydown","ArrowUp");expect(root.ownerDocument.activeElement).toBe(input);
    input.value="Note 9999.md";input.event("input");expect(root.querySelectorAll("button")).toHaveLength(1);
    const button=root.querySelectorAll("button")[0];button.focus();section.event("keydown","Escape");expect(root.ownerDocument.activeElement).toBe(input);
    button.event("click");expect(select).toHaveBeenCalledWith(paths[9999]);current=false;button.event("click");expect(select).toHaveBeenCalledOnce();
  });
  it("unavailable policy has a visible explanation and no selectable results",()=>{
    setLanguage("en");const root=new Element();renderPairNoteSearch(root as unknown as HTMLElement,{query:"",changed:vi.fn(),current:()=>true,search:()=>undefined,select:vi.fn()});
    expect(root.querySelectorAll("button")).toHaveLength(0);expect(root.querySelectorAll("p")[0].text).toContain("not available");
  });
});

describe("family context presentation",()=>{
  it.each(["ru","en"] as const)("shows only the selected membership and keeps explicit overview return in %s",lang=>{
    setLanguage(lang);const root=new Element(),back=vi.fn(),note=vi.fn();
    const family={id:"one",paths:["A.md","B.md","C.md"],relationships:[{left:"A.md",right:"B.md",score:.9}]};
    const projection={map:{nodes:family.paths.map(path=>({path})),indexedNoteCount:6,revision:{sequence:1}},represented:6,families:[family,{...family,id:"two",paths:["D.md","E.md","F.md"]}]} as unknown as FamilyProjection;
    renderFamilies(root as unknown as HTMLElement,projection,{open:true,query:"",selected:"one"},{current:()=>true,select:vi.fn(),note,back});
    expect(root.querySelectorAll("input")).toHaveLength(0);expect(root.querySelectorAll("button")).toHaveLength(4);
    root.querySelectorAll("button")[1].event("click");expect(note).toHaveBeenCalledWith("A.md");
    root.querySelectorAll("button")[0].event("click");expect(back).toHaveBeenCalledOnce();
    expect(root.all().some(e=>e.text.includes("D.md"))).toBe(false);
    expect(root.all().filter(e=>e.tag==="summary").map(e=>e.text).join(" ")).not.toContain("@");
  });
});
