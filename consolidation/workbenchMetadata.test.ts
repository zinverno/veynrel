import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({getAllTags:(cache:{frontmatter?:{tags:string[]};tags?:{tag:string}[]})=>[...(cache.frontmatter?.tags??[]).map(tag=>`#${tag}`),...(cache.tags??[]).map(tag=>tag.tag)]}));
import { createWorkbenchMetadata } from "./workbenchMetadata";
import type { App } from "obsidian";
import type { TaxonomyProfilePort } from "./taxonomyProfile";
function fixture(){
 const events=()=>{const map=new Map<string,Set<(...args:unknown[])=>void>>();return {on:(event:string,fn:(...args:unknown[])=>void)=>{if(!map.has(event))map.set(event,new Set());map.get(event)!.add(fn);return {event,fn};},offref:({event,fn}:{event:string;fn:(...args:unknown[])=>void})=>map.get(event)?.delete(fn),emit:(event:string,...args:unknown[])=>map.get(event)?.forEach(fn=>fn(...args)),map};};
 const vault=events(),cache=events(),file={path:"A.md"},metadata={frontmatter:{tags:["topic/sql","role/theory"]},tags:[{tag:"#difficulty/advanced"},{tag:"#role/practice"},{tag:"#role/theory"}]};
 const app={vault:{...vault,getFileByPath:vi.fn(()=>file),read:vi.fn()},metadataCache:{...cache,getFileCache:vi.fn(()=>metadata)}};
 const stop=vi.fn(),profile={get:()=>null,subscribe:()=>stop} as unknown as TaxonomyProfilePort;
 return {app:app as unknown as App,host:app,file,vault,cache,stop,source:createWorkbenchMetadata(app as unknown as App,["A.md"],profile)};
}
describe("workbench host tag projection",()=>{
 it("uses frontmatter+inline normalization without reading Markdown or losing multiple memberships",()=>{const f=fixture();
  expect(f.source.getSnapshot().notes[0]).toEqual({path:"A.md",state:"known",tags:["topic/sql","role/theory","difficulty/advanced","role/practice"]});
  expect(f.host.vault.read).not.toHaveBeenCalled();expect(f.source.getSnapshot()).toBe(f.source.getSnapshot());f.source.dispose();
 });
 it("distinguishes cache absence, known empty, stale modification, matching cache event, rename and delete",()=>{const f=fixture();
  f.vault.emit("modify",f.file);expect(f.source.getSnapshot().notes[0].state).toBe("stale");
  f.cache.emit("changed",f.file);expect(f.source.getSnapshot().notes[0].state).toBe("known");
  f.host.metadataCache.getFileCache.mockReturnValue({frontmatter:{tags:[]},tags:[]});f.cache.emit("changed",f.file);
  expect(f.source.getSnapshot().notes[0]).toEqual({path:"A.md",state:"known",tags:[]});
  f.host.metadataCache.getFileCache.mockReturnValue(null as never);f.cache.emit("changed",f.file);expect(f.source.getSnapshot().notes[0].state).toBe("unknown");
  f.file.path="B.md";f.vault.emit("rename",f.file,"A.md");expect(f.source.getSnapshot().notes[0].state).toBe("unknown");
  f.host.vault.getFileByPath.mockReturnValue(null as never);f.vault.emit("delete",{path:"A.md"});expect(f.source.getSnapshot().notes[0].state).toBe("unknown");f.source.dispose();
 });
 it("releases owned events and never wakes disposed views",()=>{const f=fixture(),listener=vi.fn();f.source.subscribe(listener);f.source.dispose();
  f.cache.emit("changed",f.file);f.vault.emit("modify",f.file);expect(listener).not.toHaveBeenCalled();expect(f.stop).toHaveBeenCalledOnce();
 });
});
