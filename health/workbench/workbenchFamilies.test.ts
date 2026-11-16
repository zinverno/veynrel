import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({getLanguage:()=>"en"}));
import { semanticFamilies } from "./workbenchFamilies";
import { searchPairNotes, NOTE_SEARCH_LIMIT } from "./workbenchNoteSearch";
import type { SemanticGlobalMapProductSnapshot } from "../semanticGlobalMapPort";
import { semanticRevision } from "../connections/testFixtures";
import type { ConnectionSelection } from "../connections/connectionSelection";

function fixture(): { -readonly [K in keyof SemanticGlobalMapProductSnapshot]: SemanticGlobalMapProductSnapshot[K] } {
  const names=["Docker/A.md","Docker/B.md","Database/A.md","Database/B.md","Bridge.md","Diary.md","ML.md"];
  const pairs=[[0,1,.99],[0,4,.98],[1,4,.97],[2,3,.99],[2,4,.96],[3,4,.95]];
  const score=(a:number,b:number)=>pairs.find(([x,y])=>x===Math.min(a,b)&&y===Math.max(a,b))?.[2]??.1;
  const nodes=names.map((path,a)=>({id:path,path,basename:path,coreSimilarity:.5,semanticConnectedness:.5,
    neighbors:names.map((path,b)=>({path,score:score(a,b)})).filter(n=>n.path!==path).sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path)).slice(0,5)}));
  const edges=nodes.flatMap((node,a)=>node.neighbors.filter(n=>node.path<n.path).map(n=>({left:node.path,right:n.path,score:n.score,mutual:nodes.find(x=>x.path===n.path)!.neighbors.some(x=>x.path===node.path)})));
  return {state:"ready",busy:false,supportedNoteCount:500,map:{revision:semanticRevision,indexedNoteCount:7,mappedNoteCount:7,capturedAt:1,nodes,edges,scope:{id:"all",revision:1,paths:names}}};
}

describe("tentative local semantic cores",()=>{
  it("supports one note in two cores without transitive merging",()=>{
    const result=semanticFamilies(fixture())!;
    expect(result.families.map(f=>f.paths)).toEqual([["Bridge.md","Database/A.md","Database/B.md"],["Bridge.md","Docker/A.md","Docker/B.md"]]);
    expect(result.represented).toBe(5);expect(result.families.every(f=>f.relationships.length===3)).toBe(true);
  });
  it("is deterministic across order/capture time and has separate revision evidence",()=>{
    const a=fixture(),b=fixture();b.map={...b.map!,capturedAt:999,nodes:[...b.map!.nodes].reverse().map(n=>({...n,neighbors:[...n.neighbors].reverse()})),edges:[...b.map!.edges].reverse()};
    expect(semanticFamilies(a)?.families).toEqual(semanticFamilies(b)?.families);
    expect(semanticFamilies(a)).toBe(semanticFamilies(a));
    const changed={...a,map:{...a.map!,revision:{...semanticRevision,vectorGeneration:semanticRevision.vectorGeneration+1}}};
    expect(semanticFamilies(changed)?.families).toEqual(semanticFamilies(a)?.families);
    expect(semanticFamilies(changed)?.map.revision).not.toEqual(semanticFamilies(a)?.map.revision);
  });
  it.each(["idle","loading","stale","unavailable","error"] as const)("never publishes families for %s even with retained old evidence",state=>{
    expect(semanticFamilies({...fixture(),state})).toBeUndefined();
  });
  it("ignores busy and missing maps",()=>{
    expect(semanticFamilies({...fixture(),busy:true})).toBeUndefined();
    expect(semanticFamilies({state:"ready",busy:false,supportedNoteCount:500})).toBeUndefined();
  });
  it.each([0,1,2,3])("does not invent topics for tiny %i-note corpora without discarded contrast",count=>{
    const s=fixture();s.map={...s.map!,nodes:s.map!.nodes.slice(0,count).map(n=>({...n,neighbors:n.neighbors.filter(m=>s.map!.nodes.slice(0,count).some(x=>x.path===m.path))}))};
    expect(semanticFamilies(s)?.families).toEqual([]);
  });
  it("rejects a lone similar pair, nonreciprocal edge, chain and single cross-topic bridge",()=>{
    const s=fixture();s.map={...s.map!,edges:s.map!.edges.filter(e=>!(e.left==="Docker/A.md"&&e.right==="Docker/B.md")&&!(e.left==="Database/A.md"&&e.right==="Database/B.md"))};
    expect(semanticFamilies(s)?.families).toEqual([]);
    const non=fixture();non.map={...non.map!,edges:non.map!.edges.map(e=>({...e,mutual:false}))};expect(semanticFamilies(non)?.families).toEqual([]);
  });
  it("rejects flat scores, tied gaps and weak contrast",()=>{
    for(const scores of [[.9,.9,.9,.9,.9],[.9,.8,.7,.6,.5],[.9,.9,.88,.88,.88]]){
      const s=fixture();s.map={...s.map!,nodes:s.map!.nodes.map(n=>({...n,neighbors:n.neighbors.map((x,i)=>({...x,score:scores[i]}))}))};
      expect(semanticFamilies(s)?.families).toEqual([]);
    }
  });
  it("never uses a folder, basename, tag, diary or real link as family evidence",()=>{
    const s=fixture();s.map={...s.map!,edges:[]};expect(semanticFamilies(s)?.families).toEqual([]);
    expect(semanticFamilies(fixture())?.families.some(f=>f.paths.includes("Diary.md"))).toBe(false);
  });
  it("scope participates in identity; extra unindexed paths cannot become members",()=>{
    const a=fixture(),b=fixture();b.map={...b.map!,scope:{id:"folder:Knowledge",revision:1,paths:[...b.map!.scope!.paths,"Unknown.md"]}};
    expect(semanticFamilies(a)?.families[0].id).not.toBe(semanticFamilies(b)?.families[0].id);
    expect(semanticFamilies(b)?.families.every(f=>!f.paths.includes("Unknown.md"))).toBe(true);
  });
});
describe("bounded exact-path pair choices",()=>{
  it.each([1000,5000,10000])("bounds %i results while reporting every match",count=>{
    const paths=Array.from({length:count},(_,i)=>`Area/Note ${i}.md`);
    const result=searchPairNotes(paths,paths[0],"Note");expect(result.paths).toHaveLength(NOTE_SEARCH_LIMIT);expect(result.total).toBe(count-1);
    expect(searchPairNotes(paths,paths[0],`Area/Note ${count-1}.md`).paths).toEqual([paths[count-1]]);
  });
  it("preserves duplicate basenames, case, Unicode and exact source identity",()=>{
    const paths=["source.md","One/Same.md","Two/Same.md","Личное/Ёлка.md"];
    expect(searchPairNotes(paths,paths[0],"same").paths).toEqual(paths.slice(1,3));
    expect(searchPairNotes(paths,paths[0],"two/same").paths).toEqual([paths[2]]);
    expect(searchPairNotes(paths,paths[0],"ёлка").paths).toEqual([paths[3]]);
    expect(searchPairNotes(paths,"missing.md","").total).toBe(0);
  });
  it("keeps excluded and unknown choices unavailable",()=>{
    const paths=["source.md","allow.md","excluded.md","unknown.md"];
    const policy:ConnectionSelection={revision:"1",document:p=>p==="excluded.md"?"exclude":"allow",pair:(_,p)=>p==="unknown.md"?"unknown":"allow",unknown:()=>false};
    expect(searchPairNotes(paths,paths[0],"",policy)).toEqual({paths:["allow.md"],total:1,blocked:2});
  });
});
