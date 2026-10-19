import { vi } from "vitest";
import { MarkdownView, TFile, TFolder } from "obsidian";
import type { App, CachedMetadata } from "obsidian";
import { atomizationFixture } from "./atomizationFixture";
import { groupNote } from "./groupFixture";
import type { EmptyAtomChoice } from "../consolidation/emptyAtomPlan";
import { EmptyAtomJournal } from "../consolidation/emptyAtomJournal";
import { createSafeApplyService, obsidianSafeApplyPort } from "../consolidation/obsidianSafeApply";
import { obsidianEmptyAtomPort } from "../consolidation/obsidianEmptyAtom";

/** Synthetic caches only; the native suite supplies Obsidian's parser and Vault.process. */
export function emptyAtomFixture(text?: string, sourcePaths?:readonly [string,string]) {
  vi.stubGlobal("window", { setTimeout });
  const f=atomizationFixture(text), choice:EmptyAtomChoice={...f.choice,operation:"write_atom_to_empty_note",targetConfirmed:true};
  if(sourcePaths){f.pair.forEach((n,i)=>{n.path=sourcePaths[i];n.file.path=n.path;});f.analysis.pair=f.pair;}
  const contents=new Map<string,string>(),files=new Map<string,TFile>(),caches=new Map<TFile,CachedMetadata|null>();
  const folders=new Map(["","Sources","Atoms"].map(path=>[path,Object.assign(new TFolder(),{path})]));
  for(const n of f.pair){const parent=n.path.slice(0,n.path.lastIndexOf("/"));if(parent)folders.set(parent,Object.assign(new TFolder(),{path:parent}));}
  const disk=new Map<string,string>(),privateFolders=new Set<string>();
  const metadataCache={resolvedLinks:{} as Record<string,Record<string,number>>,unresolvedLinks:{} as Record<string,Record<string,number>>,
    getFileCache:(file:TFile)=>caches.get(file)??null,
    getFirstLinkpathDest:(p:string)=>files.get(p.endsWith(".md")?p:p+".md")??null};
  const cacheFor=(value:string):CachedMetadata=>{
    if(value==="")return {};
    const cache=groupNote("parser.md",value).cache!;
    const links=[...value.matchAll(/\[\[([^\]]+)\]\]/gu)].map(m=>({link:m[1],original:m[0],position:{start:{offset:m.index!,line:0,col:0},end:{offset:m.index!+m[0].length,line:0,col:0}}}));
    if(links.length)cache.links=links;
    return cache;
  };
  const dependencies=()=>{
    metadataCache.resolvedLinks={};metadataCache.unresolvedLinks={};
    for(const [path,file] of files)for(const link of caches.get(file)?.links??[]){
      const target=metadataCache.getFirstLinkpathDest(link.link),map=target?metadataCache.resolvedLinks:metadataCache.unresolvedLinks;
      (map[path]??={})[target?.path??link.link]=1;
    }
  };
  const add=(path:string,value:string,file=Object.assign(new TFile(),{path,stat:{ctime:1,mtime:2,size:new TextEncoder().encode(value).length}}))=>{
    Object.assign(file,{extension:"md",basename:path.split("/").pop()!.slice(0,-3)});
    files.set(path,file);contents.set(path,value);caches.set(file,cacheFor(value));dependencies();return file;
  };
  for(const n of f.pair){add(n.path,n.content,n.file);caches.set(n.file,n.cache);}
  const target=add(choice.path,"");
  const adapter={
    exists:vi.fn(async(p:string)=>disk.has(p)||privateFolders.has(p)||files.has(p)||folders.has(p)),
    stat:vi.fn(async(p:string)=>files.has(p)?{type:"file",...files.get(p)!.stat}:disk.has(p)?{type:"file",size:new TextEncoder().encode(disk.get(p)).length}:privateFolders.has(p)||folders.has(p)?{type:"folder",size:0}:null),
    read:vi.fn(async(p:string)=>{if(!disk.has(p))throw Error("missing");return disk.get(p)!;}),
    write:vi.fn(async(p:string,data:string)=>{if(p.endsWith(".md"))throw Error("Markdown adapter write forbidden");disk.set(p,data);}),
    copy:vi.fn(async(from:string,to:string)=>{if(disk.has(to))throw Error("exists");disk.set(to,disk.get(from)!);}),
    mkdir:vi.fn(async(p:string)=>{privateFolders.add(p);}),
    list:vi.fn(async(p:string)=>({files:[...disk.keys()].filter(s=>s.slice(0,s.lastIndexOf("/"))===p),folders:[...privateFolders].filter(s=>s.slice(0,s.lastIndexOf("/"))===p)})),
  };
  const edit=(path:string,value:string)=>{const file=files.get(path)!;contents.set(path,value);file.stat.mtime++;file.stat.size=new TextEncoder().encode(value).length;caches.set(file,cacheFor(value));dependencies();};
  let views:unknown[]=[],current=true;
  const vault={configDir:"SyntheticConfig",adapter,getAllLoadedFiles:()=>[...folders.values(),...files.values()],getMarkdownFiles:()=>[...files.values()],
    getFileByPath:(p:string)=>files.get(p)??null,getAbstractFileByPath:(p:string)=>files.get(p)??folders.get(p)??null,getRoot:()=>folders.get("")!,
    read:vi.fn(async(file:TFile)=>contents.get(file.path)!),
    process:vi.fn(async(file:TFile,callback:(value:string)=>string)=>{const value=callback(contents.get(file.path)!);edit(file.path,value);return value;}),
    modify:vi.fn(),create:vi.fn(),delete:vi.fn(),trash:vi.fn(),rename:vi.fn(),createFolder:vi.fn()};
  const app={vault,metadataCache,workspace:{iterateAllLeaves:(fn:(v:unknown)=>void)=>views.forEach(fn)}} as unknown as App;
  const port=obsidianSafeApplyPort(app),native=obsidianEmptyAtomPort(app,port),journal=new EmptyAtomJournal(adapter as never,vault.configDir,"ai-knowledge-hub");
  const restart=()=>createSafeApplyService(app,"ai-knowledge-hub"),service=restart(),atom=service.emptyAtom!;
  const plan=()=>native.plan(f.analysis,choice);
  const review=async()=>atom.review((await plan()).plan,f.analysis,()=>current);
  return {...f,choice,contents,files,caches,folders,disk,privateFolders,adapter,vault,app,metadataCache,target,port,native,journal,service,atom,restart,plan,review,add,edit,dependencies,
    cancel:()=>{current=false;},
    editor:(path=choice.path)=>{views=[{view:Object.assign(new MarkdownView({} as never),{file:files.get(path),getViewData:()=>contents.get(path)}),getViewState:()=>({state:{file:path}})}];},
    replace:(path=choice.path)=>{const old=files.get(path)!;return add(path,contents.get(path)!,Object.assign(new TFile(),{path,stat:{...old.stat,ctime:old.stat.ctime+1}}));},
    rebind:()=>{for(const [path,old] of files){const fresh=Object.assign(new TFile(),{...old,stat:{...old.stat}});files.set(path,fresh);caches.set(fresh,{...caches.get(old),v:1} as CachedMetadata);}},
  };
}
