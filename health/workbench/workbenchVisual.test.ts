import { describe, expect, it } from "vitest";
import { WorkbenchSimulation } from "./workbenchSimulation";
import { assignTagHues, haloSpots, paletteFor, tagColor } from "./workbenchPalette";
import { overlaps, placeLabels } from "./workbenchLabels";
const notes=(count:number)=>Array.from({length:count},(_,i)=>Object.freeze({path:`Area/${i}.md`,semantic:false,linksAvailable:true}));
describe("finite UI physics",()=>{
  it("cools, never mutates immutable inputs and does no further work after settling",()=>{
    const nodes=Object.freeze(notes(154)),edges=Object.freeze([{source:"Area/0.md",target:"Area/1.md",kind:"link" as const}]);
    const before=JSON.stringify({nodes,edges}),sim=new WorkbenchSimulation();sim.update(nodes,edges);
    const seed=sim.points.map(p=>[p.x,p.y]);sim.settle();
    expect(sim.alpha).toBe(0);expect(sim.ticks).toBeLessThan(160);expect(sim.points.map(p=>[p.x,p.y])).not.toEqual(seed);
    expect(JSON.stringify({nodes,edges})).toBe(before);const ticks=sim.ticks;expect(sim.tick()).toBe(false);expect(sim.ticks).toBe(ticks);
  });
  it("retains unchanged paths on data update; duplicate basenames are different files",()=>{
    const sim=new WorkbenchSimulation();sim.update(notes(3),[]);sim.settle();const old=sim.points.find(p=>p.path==="Area/0.md")!;
    const position={x:old.x,y:old.y};sim.update([...notes(2),{path:"Other/0.md",semantic:false,linksAvailable:true}],[]);
    expect(sim.points.find(p=>p.path===old.path)).toMatchObject(position);expect(sim.points.some(p=>p.path==="Area/2.md")).toBe(false);expect(sim.points).toHaveLength(3);
  });
  it("pins the grabbed node, releases it and honors a separate pause",()=>{
    const sim=new WorkbenchSimulation();sim.update(notes(10),[]);sim.pin("Area/0.md",121,93);sim.tick();expect(sim.points.find(p=>p.path==="Area/0.md")).toMatchObject({x:121,y:93});
    sim.release("Area/0.md");sim.tick();expect(sim.points.find(p=>p.path==="Area/0.md")!.x).not.toBe(121);
    sim.paused=true;const before=JSON.stringify(sim.points);expect(sim.tick()).toBe(false);expect(JSON.stringify(sim.points)).toBe(before);
    sim.pin("Area/0.md",50,60);expect(sim.points.find(p=>p.path==="Area/0.md")).toMatchObject({x:50,y:60});
  });
  it("does not invent forces for missing semantic scores and does not simulate 1000 documents",()=>{
    const a=new WorkbenchSimulation(),b=new WorkbenchSimulation();a.update(notes(2),[]);b.update(notes(2),[{source:"Area/0.md",target:"Area/1.md",kind:"semantic"}]);a.settle();b.settle();expect(a.points).toEqual(b.points);
    const large=new WorkbenchSimulation();large.update(notes(1000),[]);expect(large.tick()).toBe(false);expect(large.points).toHaveLength(1000);large.pin("Area/0.md",100,100);large.release("Area/0.md");expect(large.alpha).toBe(0);expect(large.tick()).toBe(false);
  });
});
describe("screen text and tag orientation",()=>{
  it.each([.3,.5,.8,1,1.5,2.2,4])("avoids labels/controls/viewport collisions at zoom %s",zoom=>{
    const anchors=Array.from({length:154},(_,i)=>({id:String(i),x:400+Math.cos(i*2.4)*Math.sqrt(i)*20*zoom,y:300+Math.sin(i*2.4)*Math.sqrt(i)*20*zoom,width:150,height:20,priority:i===0?100:0}));
    const controls={x:0,y:0,width:500,height:60},placed=placeLabels(anchors,800,600,[controls]);
    expect(placed.has("0")).toBe(true);const boxes=[...placed.values()];
    boxes.forEach((box,i)=>{expect(overlaps(box,controls)).toBe(false);expect(box.x).toBeGreaterThanOrEqual(8);expect(box.x+box.width).toBeLessThanOrEqual(792);boxes.slice(i+1).forEach(other=>expect(overlaps(box,other)).toBe(false));});
  });
  it("keeps canonical tag hues through reorder/toggle/theme changes and adapts lightness",()=>{
    const tags=["topic/sql","role/theory","difficulty/advanced","type/guide","status/working","role/practice"],hues:Record<string,number>={};
    assignTagHues(tags,hues);const original={...hues};assignTagHues([...tags].reverse(),hues);assignTagHues([tags[1]],hues);expect(hues).toEqual(original);
    const values=Object.values(hues);values.forEach((h,i)=>values.slice(i+1).forEach(other=>expect(Math.min(Math.abs(h-other),360-Math.abs(h-other))).toBeGreaterThan(25)));
    expect(paletteFor("rgb(245,245,245)").light).toBe(true);expect(paletteFor("rgb(24,24,24)").light).toBe(false);
    expect(tagColor(tags[0],"rgb(245,245,245)",hues)).not.toBe(tagColor(tags[0],"rgb(24,24,24)",hues));expect(hues).toEqual(original);
  });
  it("literal tag IDs cannot collide with object prototype properties",()=>{
    const hues:Record<string,number>={};assignTagHues(["__proto__","constructor"],hues);
    expect(Number.isFinite(hues["__proto__"])).toBe(true);expect(Number.isFinite(hues["constructor"])).toBe(true);expect(Object.getPrototypeOf(hues)).toBe(Object.prototype);
  });
  it("disconnected members get local soft spots, never a long hull or inferred foreign membership",()=>{
    const points=[{path:"A",x:0,y:0},{path:"X",x:20,y:0},{path:"B",x:900,y:900}],members=new Set(["A","B"]),spots=haloSpots(points,members);
    expect(spots).toHaveLength(2);expect(spots.every(s=>s.r<100)).toBe(true);expect(members.has("X")).toBe(false);
  });
});
