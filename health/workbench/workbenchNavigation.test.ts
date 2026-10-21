import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian",()=>({getLanguage:()=>"en"}));
import { edgeAttraction, workbenchLayout } from "./workbenchModel";
import type { WorkbenchModel } from "./workbenchModel";
import { fitPoints, mapItems, membershipCells, wheelFactor } from "./workbenchGeometry";
import { focusWorkbench, newWorkbenchGraphState, overviewWorkbench } from "./workbenchGraph";
import { tagZones, matchesTagFilter } from "./workbenchTags";
import { initialZones } from "./workbenchZones";
import { zoomGraph } from "../ui/graphViewport";
const node=(path:string)=>({path,semantic:false,linksAvailable:true});
const tags=tagZones({revision:1,categories:[{id:"role",name:"Material",prefixes:["role"],tags:[]}],notes:[
 {path:"A.md",state:"known",tags:["topic/sql/cte","role/theory","difficulty/advanced"]},
 {path:"B.md",state:"known",tags:["role/theory","role/practice","topic/sql-old"]},
 {path:"C.md",state:"known",tags:[]},{path:"D.md",state:"unknown",tags:["role/theory"]},{path:"E.md",state:"stale",tags:["role/theory"]},
]});
describe("read-only multi-tag membership",()=>{
 it("retains three facets, two roles, exact nested separators and known emptiness",()=>{
  expect(tags.filter(zone=>zone.direct.includes("A.md")).map(zone=>zone.tag)).toEqual(["difficulty/advanced","role/theory","topic/sql/cte"]);
  expect(tags.filter(zone=>zone.direct.includes("B.md"))).toHaveLength(3);
  expect(tags.find(zone=>zone.tag==="topic/sql")?.inherited).toEqual(["A.md"]);
  expect(tags.find(zone=>zone.tag==="role/theory")?.members).toEqual(new Set(["A.md","B.md"]));
  expect(tags.find(zone=>zone.tag==="role/practice")?.categoryName).toBe("Material");
  expect(tags.find(zone=>zone.tag==="topic/sql-old")?.categoryName).toBe("#topic");
  expect(tags.every(zone=>!["C.md","D.md","E.md"].some(p=>zone.members.has(p)))).toBe(true);
 });
 it("AND/OR do not confuse visible layers with the document set",()=>{
  expect(matchesTagFilter("A.md",tags,["role/theory","role/practice"],"all")).toBe(false);
  expect(matchesTagFilter("A.md",tags,["role/theory","role/practice"],"any")).toBe(true);
  expect(matchesTagFilter("B.md",tags,["role/theory","role/practice"],"all")).toBe(true);
  expect(matchesTagFilter("D.md",tags,["missing"],"any")).toBe(false);
  expect(matchesTagFilter("D.md",tags,[],"all")).toBe(true);
 });
 it("keeps dense membership while bounding initial layer detail across categories",()=>{
  const dense=tagZones({revision:1,categories:[],notes:[{path:"A.md",state:"known",tags:Array.from({length:30},(_,i)=>`category${i}/tag`)}]});
  expect(dense.filter(z=>z.direct.includes("A.md"))).toHaveLength(30);
  expect(initialZones(dense)).toHaveLength(6);
  expect(new Set(initialZones(dense).map(tag=>dense.find(z=>z.tag===tag)!.category)).size).toBe(6);
 });
 it("covers every combination A∩B, B∩C, A∩C and A∩B∩C without a primary zone",()=>{
  const memberships=[["A","B"],["B","C"],["A","C"],["A","B","C"]];
  const zones=tagZones({revision:1,categories:[],notes:memberships.map((tags,i)=>({path:`${i}.md`,state:"known",tags}))});
  memberships.forEach((expected,i)=>expect(zones.filter(z=>z.members.has(`${i}.md`)).map(z=>z.tag)).toEqual(expected));
  expect(zones.reduce((n,z)=>n+z.members.size,0)).toBe(9);
 });
});
describe("bounded layout and presentation",()=>{
 it.each([0,1,2,154,500,501,1000])("represents every unique file for %i without taking the first 80",count=>{
  const nodes=Array.from({length:count},(_,i)=>node(`Area/N${String(i).padStart(4,"0")}.md`));
  const points=workbenchLayout(nodes,[]),items=mapItems(points);
  expect(items.flatMap(item=>item.members??[item.path]).sort()).toEqual(nodes.map(n=>n.path).sort());
  expect(items.length).toBeLessThanOrEqual(500);
  expect(items.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))).toBe(true);
  if(count>500)expect(items.every(item=>item.members&&item.path.startsWith("group:"))).toBe(true);
  else expect(items).toHaveLength(count);
 });
 it("retains deterministic geometry and makes higher semantic weight a stronger, shorter attraction",()=>{
  const weak={source:"A.md",target:"B.md",kind:"semantic" as const,score:.1},strong={...weak,score:.95};
  expect(edgeAttraction(strong).length).toBeLessThan(edgeAttraction(weak).length);
  expect(edgeAttraction(strong).strength).toBeGreaterThan(edgeAttraction(weak).strength);
  const points=(score:number)=>workbenchLayout([node("A.md"),node("B.md")],[{...weak,score}]);
  const distance=(p:ReturnType<typeof points>)=>Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y);
  expect(distance(points(.95))).toBeLessThan(distance(points(.1)));
  expect(workbenchLayout([node("B.md"),node("A.md")],[strong])).toEqual(points(.95));
  expect(edgeAttraction({source:"A.md",target:"B.md",kind:"link"})).toEqual({length:110,strength:.025});
 });
 it("splits membership contours around a nonmember between two members",()=>{
  const points=[{path:"A",x:100,y:100},{path:"X",x:120,y:100},{path:"B",x:140,y:100}];
  const cells=membershipCells(points);
  expect(Math.max(...cells.get("A")!.map(p=>p.x))).toBe(110);
  expect(Math.min(...cells.get("B")!.map(p=>p.x))).toBe(130);
  expect(cells.get("X")!.every(p=>p.x>=110&&p.x<=130)).toBe(true);
 });
 it("fit changes only camera; explicit focus/return restores exact overview camera",()=>{
  const state=newWorkbenchGraphState();state.viewport={x:56,y:-20,zoom:2.3};const previous={...state.viewport};
  const model:WorkbenchModel={edges:[{source:"A",target:"B",kind:"link"}],nodes:[node("A"),node("B"),node("C")],repeats:[],connections:[],external:[],linksCurrent:true,semanticCurrent:false,comparisonCurrent:false};
  focusWorkbench(state,["A"],model);expect(state.focus).toEqual(["A","B"]);
  state.viewport=fitPoints([{x:100,y:100},{x:140,y:140}]);expect(state.focus).toEqual(["A","B"]);
  focusWorkbench(state,["C"],model);overviewWorkbench(state);expect(state.viewport).toEqual(previous);expect(state.focus).toBeUndefined();
  overviewWorkbench(state);expect(state.viewport).toEqual(previous);
 });
 it("normalizes wheel units, preserves cursor anchor and clamps fast input",()=>{
  expect(wheelFactor(3,1,640)).toBe(wheelFactor(48,0,640));expect(wheelFactor(.1,2,640)).toBe(wheelFactor(64,0,640));
  const before={x:-31,y:29,zoom:1.4},anchor={x:280,y:130};const after=zoomGraph(before,wheelFactor(-200,0,640),anchor.x,anchor.y,12);
  expect((anchor.x-after.x)/after.zoom).toBeCloseTo((anchor.x-before.x)/before.zoom);
  expect((anchor.y-after.y)/after.zoom).toBeCloseTo((anchor.y-before.y)/before.zoom);
  expect(zoomGraph(after,1e9,280,130,12).zoom).toBe(12);
 });
  it("fits a wide neighborhood to the actual narrow viewBox",()=>{
    const points=[{x:100,y:100},{x:900,y:500}],width=400,view=fitPoints(points,width);
    for(const point of points){expect(point.x*view.zoom+view.x).toBeGreaterThanOrEqual(500-width/2);expect(point.x*view.zoom+view.x).toBeLessThanOrEqual(500+width/2);}
    const next=zoomGraph(view,1.1,380,240,12,.05);expect((380-next.x)/next.zoom).toBeCloseTo((380-view.x)/view.zoom);
  });
});
