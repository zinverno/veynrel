import { describe, expect, it, vi } from "vitest";
import { WorkbenchData } from "./workbenchData";
import { ConnectionRules } from "../connections/connectionRules";
import type { ConnectionSelectionSource, SemanticGlobalMapPort } from "../semanticGlobalMapPort";
import { workbenchGeometryKey, type WorkbenchModel } from "./workbenchModel";

describe("R06 map/list selection ownership", () => {
  async function fixture(graphical: boolean, tagsAvailable = true, corrupt = false) {
    const rules = new ConnectionRules({ read: async () => corrupt ? "invalid" : null, write: vi.fn(async () => {}) }, async () => 1);
    if (!corrupt) { await rules.load(); await rules.add("within", { kind: "tag", value: "type/task" }); }
    let captured: ConnectionSelectionSource | undefined;
    const semantic: SemanticGlobalMapPort = { getSnapshot: () => ({state:"idle",busy:false,supportedNoteCount:500}),
      load: vi.fn(async () => {}), refresh: vi.fn(async () => {}), dispose: vi.fn(), subscribe: () => () => {},
      focus: vi.fn(async () => {}), resetFocus: vi.fn(), search: () => ({nodes:[],total:0}) };
    const refresh = vi.fn(async () => { captured?.capture(); });
    const data = new WorkbenchData({id:"all",revision:1,paths:["A.md","B.md","C.md"]}, {
      rules, tags: tagsAvailable ? {getSnapshot: () => ({revision:1,categories:[],notes:[
        {path:"A.md",state:"known",tags:["type/task"]},{path:"B.md",state:"known",tags:["type/task"]},{path:"C.md",state:"known",tags:[]},
      ]}),refresh:vi.fn(),subscribe:() => () => {},dispose:vi.fn()} : undefined,
      topology:{getSnapshot:()=>({state:"idle"}),load:refresh,refresh,subscribe:()=>()=>{},dispose:vi.fn()},
      createSemantic: (_scope, selection) => {captured=selection;return semantic;},
      createComparison: () => ({getSnapshot:()=>({state:"idle"}),load:refresh,refresh,subscribe:()=>()=>{},dispose:vi.fn()}),
    },graphical);
    expect(refresh).not.toHaveBeenCalled();
    await data.refresh(graphical ? "map" : "connections");
    return {data,captured,refresh,rules};
  }
  it("binds the identical confirmed policy to graphical and list owners before computation", async () => {
    const map=await fixture(true),list=await fixture(false);
    for(const f of [map,list]) {
      expect(f.captured?.capture()?.pair("A.md","B.md")).toBe("exclude");
      expect(f.captured?.capture()?.pair("A.md","C.md")).toBe("allow");
      expect(f.refresh).toHaveBeenCalledOnce(); f.data.dispose();
    }
    expect(map.captured?.capture()?.revision).toBe(list.captured?.capture()?.revision);
  });
  it.each([true,false])("keeps missing metadata unknown in graphical=%s", async graphical => {
    const f=await fixture(graphical,false);
    expect(f.captured?.capture()?.pair("A.md","B.md")).toBe("unknown");f.data.dispose();
  });
  it.each([true,false])("does not compute through corrupt rules in graphical=%s", async graphical => {
    const f=await fixture(graphical,true,true);expect(f.refresh).not.toHaveBeenCalled();expect(f.rules.state).toBe("error");
    expect(()=>f.captured?.capture()).toThrow();f.data.dispose();
  });
});

describe("semantic layout identity", () => {
  const model: WorkbenchModel={nodes:[{path:"A.md",semantic:true,linksAvailable:true},{path:"B.md",semantic:true,linksAvailable:true}],
    edges:[{source:"A.md",target:"B.md",kind:"semantic",score:.8}],repeats:[],connections:[],external:[],linksCurrent:true,semanticCurrent:true,comparisonCurrent:true};
  it("ignores real links, metadata freshness and input ordering",()=>{
    expect(workbenchGeometryKey({...model,nodes:[...model.nodes].reverse().map(n=>({...n,linksAvailable:false})),linksCurrent:false,semanticCurrent:false,
      edges:[{source:"B.md",target:"A.md",kind:"link"},...model.edges]})).toBe(workbenchGeometryKey(model));
  });
  it("changes for semantic evidence or eligible identity, not just node count",()=>{
    expect(workbenchGeometryKey({...model,edges:[{...model.edges[0],score:.7}]})).not.toBe(workbenchGeometryKey(model));
    expect(workbenchGeometryKey({...model,nodes:model.nodes.map(n=>({...n,semantic:false}))})).not.toBe(workbenchGeometryKey(model));
  });
});
