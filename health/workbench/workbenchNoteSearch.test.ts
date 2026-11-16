import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({getLanguage:()=>"en",setIcon:vi.fn()}));
import { setLanguage } from "../../i18n";
import { renderPairNoteSearch, searchPairNotes } from "./workbenchNoteSearch";
class Element {
  children:Element[]=[]; value=""; text=""; tag="div"; attrs:Record<string,string>={}; disabled=false;
  ownerDocument:{activeElement?:Element}; listeners=new Map<string,(event:any)=>void>();
  constructor(document:{activeElement?:Element}={}){this.ownerDocument=document;}
  createEl(tag:string,options:{text?:string;attr?:Record<string,string>}={}){const e=new Element(this.ownerDocument);e.tag=tag;e.text=options.text??"";e.attrs=options.attr??{};this.children.push(e);return e;}
  createDiv(){return this.createEl("div");} empty(){this.children=[];} setText(text:string){this.text=text;}
  setAttribute(key:string,value:string){this.attrs[key]=value;}
  addEventListener(name:string,listener:(event:any)=>void){this.listeners.set(name,listener);}
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
