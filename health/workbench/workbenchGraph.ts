import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { fitGraph, panGraph, zoomGraph } from "../ui/graphViewport";
import type { Viewport } from "../ui/graphViewport";
import type { WorkbenchModel } from "./workbenchModel";
import { canvasWorldWidth, fitPoints, MAP_HEIGHT, wheelFactor } from "./workbenchGeometry";
import type { MapItem, XY } from "./workbenchGeometry";
import type { TagZone } from "./workbenchTags";
import type { WorkbenchSimulation } from "./workbenchSimulation";
import { assignTagHues, haloSpots, paletteFor, tagColor } from "./workbenchPalette";
import { placeLabels } from "./workbenchLabels";
import type { ScreenBox } from "./workbenchLabels";

let rendererSequence=0;
export interface WorkbenchGraphState {
  links:boolean; semantic:boolean; viewport:Viewport; focus?:readonly string[]; overview?:Viewport;
  fitted?:boolean; hues:Record<string,number>;
  metrics:{frames:number; renderMs:number; frameTimes:number[]};
}
export const newWorkbenchGraphState = ():WorkbenchGraphState => ({links:true,semantic:true,viewport:fitGraph(),hues:{},metrics:{frames:0,renderMs:0,frameTimes:[]}});
export function focusWorkbench(state:WorkbenchGraphState,paths:readonly string[],model:WorkbenchModel):void {
  state.overview??={...state.viewport};const members=new Set(paths);
  model.edges.forEach(edge=>{if(paths.includes(edge.source)||paths.includes(edge.target)){members.add(edge.source);members.add(edge.target);}});
  state.focus=[...members];
}
export function overviewWorkbench(state:WorkbenchGraphState):void {
  if(state.overview)state.viewport=state.overview;
  state.focus=undefined;state.overview=undefined;
}
export interface GraphOptions {
  items:readonly MapItem[]; simulation:WorkbenchSimulation; query:string; zones:readonly TagZone[]; activeZones:readonly string[];
  zone?:string; selectZone(tag?:string):void; group(paths:readonly string[]):void;
}

/** A disposable renderer over persistent UI physics. Data/safety owners never enter this loop. */
export function renderWorkbenchGraph(parent:HTMLElement,model:WorkbenchModel,selected:readonly string[],state:WorkbenchGraphState,
  options:GraphOptions,select:(path:string)=>void,redraw:()=>void):()=>void {
  const document=parent.ownerDocument,win=document.defaultView!;
  const scene=parent.createDiv({cls:"veynrel-workbench-map veynrel-visual-map"});
  const svg=scene.createSvg("svg");svg.setAttribute("role","group");svg.setAttribute("tabindex","0");svg.setAttribute("aria-label",t("@mapnav.canvas"));
  let live=true,frame:number|undefined,visible=true,hovered:string|undefined,focused:string|undefined,activeTag=options.zone;
  let width=1000,height=640,base=1,measured=false,lastTime:number|undefined,suppressClick=false;
  const simulation=options.simulation,media=win.matchMedia("(prefers-reduced-motion: reduce)");
  const element=(tag:string,attributes:Record<string,string|number>,host:Element=svg):SVGElement=>{
    const node=host.createSvg(tag as keyof SVGElementTagNameMap);
    for(const [key,value]of Object.entries(attributes))node.setAttribute(key,String(value));return node;
  };
  const rendererId=++rendererSequence;
  const defs=element("defs",{}),world=element("g",{"data-map-world":"true"}),fields=element("g",{class:"veynrel-soft-fields"},world);
  const items=options.items.filter(item=>!state.focus||(item.members??[item.path]).some(path=>state.focus!.includes(path)));
  const byPath=new Map(items.map(item=>[item.path,item]));
  const zones=options.activeZones.map(tag=>options.zones.find(zone=>zone.tag===tag)).filter((zone):zone is TagZone=>Boolean(zone));
  assignTagHues(zones.map(zone=>zone.tag),state.hues);
  const toolbar=scene.createDiv({cls:"veynrel-workbench-map-tools"});
  const control=(label:string,action:()=>void,id:string):HTMLButtonElement=>{
    const button=healthButton(toolbar,label,()=>{if(live)action();},id);button.setAttribute("aria-label",label);button.title=label;return button;
  };
  for(const key of ["links","semantic"]as const)control(t(key==="links"?"@workbench.links":"@workbench.meaning"),()=>{state[key]=!state[key];redraw();},`workbench-layer-${key}`).setAttribute("aria-pressed",String(state[key]));
  const zoneKeys=scene.createDiv({cls:"veynrel-zone-keys"});
  const zoneNodes=new Map<string,{field:SVGElement;gradient:SVGElement;stops:SVGElement[];chip:HTMLButtonElement}>();
  for(const [index,zone]of zones.entries()){
    const gradient=element("radialGradient",{id:`veynrel-soft-${rendererId}-${index}`},defs);
    const stops=[element("stop",{offset:"0%","stop-opacity":.22},gradient),element("stop",{offset:"55%","stop-opacity":.09},gradient),element("stop",{offset:"100%","stop-opacity":0},gradient)];
    const field=element("g",{class:"veynrel-tag-zone","data-zone":zone.tag},fields);
    const chip=healthButton(zoneKeys,`#${zone.tag} · ${zone.members.size}`,()=>{if(live)options.selectZone(zone.tag);},`workbench-zone-key-${encodeURIComponent(zone.tag)}`);
    chip.setAttribute("data-zone-title",zone.tag);chip.setAttribute("aria-pressed",String(options.zone===zone.tag));
    chip.addEventListener("pointerenter",()=>{activeTag=zone.tag;schedule();});chip.addEventListener("pointerleave",()=>{activeTag=options.zone;schedule();});
    chip.addEventListener("focus",()=>{activeTag=zone.tag;schedule();});chip.addEventListener("blur",()=>{activeTag=options.zone;schedule();});
    zoneNodes.set(zone.tag,{field,gradient,stops,chip});
  }
  const eligible=model.edges.filter(edge=>(edge.kind==="link"?state.links:state.semantic)&&byPath.has(edge.source)&&byPath.has(edge.target));
  const relevant=eligible.filter(edge=>!selected.length||selected.includes(edge.source)||selected.includes(edge.target));
  const shown=relevant.slice(0,selected.length?80:45);
  const lines=shown.map(edge=>{
    const line=element("line",{class:`veynrel-workbench-edge is-${edge.kind}`,"data-source":edge.source,"data-target":edge.target,"data-kind":edge.kind},world);
    element("title",{},line).textContent=`${edge.source} ${edge.kind==="link"?"→":"···"} ${edge.target}${edge.score===undefined?"":` · ${edge.score}`}`;
    const arrow=edge.kind==="link"?element("path",{class:"veynrel-workbench-arrow"},world):undefined;
    return {edge,line,arrow};
  });
  const labelLayer=scene.createDiv({cls:"veynrel-map-labels",attr:{"aria-hidden":"true"}});
  const candidatePaths=new Set([...model.repeats,...model.connections].flatMap(pair=>pair.paths));
  const degree=new Map<string,number>();model.edges.forEach(edge=>{degree.set(edge.source,(degree.get(edge.source)??0)+1);degree.set(edge.target,(degree.get(edge.target)??0)+1);});
  const nodes=items.map(point=>{
    const chosen=(point.members??[point.path]).some(path=>selected.includes(path));
    const node=element(point.members?"rect":"circle",{class:`veynrel-workbench-node${chosen?" is-selected":""}${point.members?" is-group":""}`,role:"button",tabindex:0,[point.members?"data-group":"data-path"]:point.path},world);
    node.setAttribute("aria-label",point.members?`${point.label} · ${point.members.length}`:point.path);
    element("title",{},node).textContent=node.getAttribute("aria-label");
    const label=labelLayer.createDiv({cls:"veynrel-workbench-label",text:point.members?`${point.members.length} · ${point.label}`:point.path.split("/").pop()!.replace(/\.md$/u,"")});
    label.dataset.labelPath=point.path;
    const rim=candidatePaths.has(point.path)?element("circle",{class:"veynrel-candidate-rim","data-candidate":point.path},world):undefined;
    const memberships=zones.filter(zone=>zone.members.has(point.path));
    const segments=memberships.map(zone=>({zone,arc:element("path",{class:"veynrel-membership-segment","data-membership":zone.tag,"data-member-path":point.path},world)}));
    const choose=():void=>{if(live&&!suppressClick)point.members?options.group(point.members):select(point.path);};
    node.addEventListener("click",choose);
    node.addEventListener("keydown",event=>{if(["Enter"," "].includes(event.key)){event.preventDefault();suppressClick=false;choose();}});
    node.addEventListener("pointerenter",()=>{hovered=point.path;measured=false;schedule();});node.addEventListener("pointerleave",()=>{hovered=undefined;measured=false;schedule();});
    node.addEventListener("focus",()=>{focused=point.path;measured=false;schedule();});node.addEventListener("blur",()=>{focused=undefined;measured=false;schedule();});
    return {point,node,label,rim,segments,chosen,labelWidth:0,labelHeight:0};
  });
  const help=scene.createEl("details",{cls:"veynrel-map-help"});
  help.createEl("summary",{text:t("@visual.help"),attr:{"aria-label":t("@visual.help")}});
  help.createEl("p",{text:t("@visual.grammar")});
  help.createEl("p",{text:t("@visual.suggested")});
  help.createEl("p",{text:t("@mapnav.map-count",{shown:items.reduce((n,item)=>n+(item.members?.length??1),0),total:model.nodes.length,groups:items.filter(item=>item.members).length,edges:shown.length,hidden:eligible.length-shown.length})});
  help.addEventListener("toggle",()=>schedule());
  const motion=control(t(simulation.paused?"@visual.resume":"@visual.pause"),()=>{simulation.paused=!simulation.paused;motion.textContent=t(simulation.paused?"@visual.resume":"@visual.pause");motion.setAttribute("aria-pressed",String(simulation.paused));motion.setAttribute("aria-label",motion.textContent??"");motion.title=motion.textContent??"";schedule();},"workbench-motion");
  motion.setAttribute("aria-pressed",String(simulation.paused));
  const camera=():void=>{state.fitted=true;schedule();};
  for(const [id,factor,label]of [["in",1.2,"+"],["out",1/1.2,"−"]]as const){const button=control(t(`@workbench.zoom-${id}`),()=>{state.viewport=zoomGraph(state.viewport,factor,500,320,12,.05);camera();},`workbench-zoom-${id}`);button.textContent=label;}
  control(t("@workbench.fit"),()=>{state.viewport=fitPoints(items,canvasWorldWidth(width,height));camera();},"workbench-fit");
  if(selected.length)control(t("@mapnav.show-selection"),()=>{state.viewport=fitPoints(items.filter(item=>(item.members??[item.path]).some(path=>selected.includes(path))),canvasWorldWidth(width,height));camera();},"workbench-show-selection");
  const visibleNow=():boolean=>live&&visible&&!document.hidden&&Boolean(svg.getClientRects().length);
  function schedule():void {if(live&&frame===undefined&&visibleNow())frame=win.requestAnimationFrame(paint);}
  const background=():string=>{
    let el:HTMLElement|null=scene;
    while(el){const color=win.getComputedStyle(el).backgroundColor;if(color!=="transparent"&&color!=="rgba(0, 0, 0, 0)")return color;el=el.parentElement;}
    return "rgb(32,32,32)";
  };
  let bg=background(),fieldsTick=-1;
  const styleZones=():void=>{bg=background();for(const [tag,{stops,chip}]of zoneNodes){const color=tagColor(tag,bg,state.hues);stops.forEach(stop=>stop.setAttribute("stop-color",color));chip.style.setProperty("--tag-color",color);}};
  styleZones();
  function paint(time:number):void {
    frame=undefined;if(!visibleNow())return;
    const started=performance.now();
    const oldWidth=width,oldHeight=height;width=svg.clientWidth||1000;height=svg.clientHeight||640;base=height/MAP_HEIGHT;
    if(oldWidth!==width||oldHeight!==height)measured=false;
    svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    if(media.matches&&!simulation.paused)simulation.settle();else simulation.tick();
    if(!state.fitted&&items.length){state.viewport=fitPoints(items,canvasWorldWidth(width,height));state.fitted=true;}
    const view=state.viewport,scale=base*view.zoom,tx=width/2-500*base+view.x*base,ty=view.y*base;
    world.setAttribute("transform",`translate(${tx} ${ty}) scale(${scale})`);svg.setAttribute("data-camera",JSON.stringify(view));
    svg.setAttribute("data-simulation",JSON.stringify({alpha:simulation.alpha,ticks:simulation.ticks,revisions:simulation.revisions,paused:simulation.paused,reduced:media.matches}));
    const active=options.zones.find(zone=>zone.tag===activeTag),attention=hovered??focused;
    const neighbors=new Set(attention?[attention]:[]);if(attention)model.edges.forEach(edge=>{if(edge.source===attention||edge.target===attention){neighbors.add(edge.source);neighbors.add(edge.target);}});
    const updateFields=fieldsTick<0 || simulation.alpha===0 && fieldsTick!==simulation.ticks || simulation.ticks-fieldsTick>=4;
    for(const zone of zones){
      const own=zoneNodes.get(zone.tag)!,emphasis=zone.tag===activeTag||selected.some(path=>zone.members.has(path))||Boolean(attention&&zone.members.has(attention));
      own.chip.classList.toggle("is-active",emphasis);own.field.classList.toggle("is-active",emphasis);
      own.field.setAttribute("opacity",String(activeTag&&zone.tag!==activeTag? .025:emphasis?.18:.07));
      if(updateFields){const spots=haloSpots(items,zone.members);while(own.field.children.length>spots.length)own.field.lastElementChild!.remove();
      spots.forEach((spot,i)=>{const circle=own.field.children[i]??element("circle",{fill:`url(#${own.gradient.id})`},own.field);circle.setAttribute("cx",String(spot.x));circle.setAttribute("cy",String(spot.y));circle.setAttribute("r",String(spot.r));});}
      const opacity=paletteFor(bg).opacity;own.stops[0].setAttribute("stop-opacity",String(.6+opacity));own.stops[1].setAttribute("stop-opacity",".2");
    }
    if(updateFields)fieldsTick=simulation.ticks;
    if(!measured){
      for(const item of nodes){item.label.classList.toggle("is-priority",item.chosen||attention===item.point.path);item.label.style.maxWidth=`${Math.min(item.chosen?320:230,Math.max(90,width-40))}px`;}
      for(const item of nodes){const box=item.label.getBoundingClientRect();item.labelWidth=box.width;item.labelHeight=box.height;}
    }
    const origin=scene.getBoundingClientRect(),obstacles:ScreenBox[]=[];
    for(const el of Array.from(parent.closest(".veynrel-workbench-grid")?.querySelectorAll<HTMLElement>(".veynrel-workbench-map-tools,.veynrel-zone-keys,.veynrel-map-help,.veynrel-zone-selection,.veynrel-workbench-selection,.veynrel-workbench-list-pane")??[])){
      const box=el.getBoundingClientRect();if(box.width&&box.height)obstacles.push({x:box.x-origin.x,y:box.y-origin.y,width:box.width,height:box.height});
    }
    for(const {edge,line,arrow}of lines){
      const a=byPath.get(edge.source)!,b=byPath.get(edge.target)!;
      for(const [key,value]of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))line.setAttribute(key,String(value));
      line.classList.toggle("is-neighbor",Boolean(attention&&(edge.source===attention||edge.target===attention)));
      if(arrow){const angle=Math.atan2(b.y-a.y,b.x-a.x),x=b.x-Math.cos(angle)*8/scale,y=b.y-Math.sin(angle)*8/scale;arrow.setAttribute("d",`M${x-5/scale*Math.cos(angle-.5)} ${y-5/scale*Math.sin(angle-.5)} L${x} ${y} L${x-5/scale*Math.cos(angle+.5)} ${y-5/scale*Math.sin(angle+.5)}`);}
    }
    for(const item of nodes){
      const {point,node,rim,segments,chosen}=item,hot=chosen||attention===point.path;
      node.classList.toggle("is-keyboard-focused",focused===point.path);node.classList.toggle("is-hovered",hovered===point.path);
      node.classList.toggle("is-zone-member",active?.members.has(point.path)??false);
      const dim=Boolean(active&&!active.members.has(point.path))||Boolean(attention&&!neighbors.has(point.path)&&!chosen);
      node.classList.toggle("is-dimmed",dim);
      if(point.members){for(const [key,value]of Object.entries({x:point.x-25/scale,y:point.y-17/scale,width:50/scale,height:34/scale,rx:9/scale}))node.setAttribute(key,String(value));}
      else {node.setAttribute("cx",String(point.x));node.setAttribute("cy",String(point.y));node.setAttribute("r",String((hot?5.5:3.4)/scale));}
      if(rim){rim.setAttribute("cx",String(point.x));rim.setAttribute("cy",String(point.y));rim.setAttribute("r",String((hot?8:5.9)/scale));rim.classList.toggle("is-dimmed",dim);}
      segments.forEach(({zone,arc},i)=>{
        const show=hot||active?.members.has(point.path);arc.setAttribute("opacity",show?"1":"0");if(!show)return;
        const radius=(hot?11:6.2)/scale,start=-Math.PI/2+i*2*Math.PI/segments.length+.1,end=start+2*Math.PI/segments.length-.2;
        arc.setAttribute("d",`M${point.x+Math.cos(start)*radius} ${point.y+Math.sin(start)*radius} A${radius} ${radius} 0 ${end-start>Math.PI?1:0} 1 ${point.x+Math.cos(end)*radius} ${point.y+Math.sin(end)*radius}`);
        arc.setAttribute("stroke",tagColor(zone.tag,bg,state.hues));arc.setAttribute("opacity",hot||active?.members.has(point.path)?"1":"0");
      });
    }
    measured=true;
    const anchors=nodes.filter(item=>(simulation.alpha===0||simulation.paused||item.chosen||attention===item.point.path)&&(!active||active.members.has(item.point.path)||item.chosen)).map(item=>({id:item.point.path,x:item.point.x*scale+tx,y:item.point.y*scale+ty,width:item.labelWidth,height:item.labelHeight,
      priority:item.chosen?100000:attention===item.point.path?90000:options.query&&item.point.path.toLocaleLowerCase().includes(options.query.toLocaleLowerCase())?80000:item.point.members?70000:degree.get(item.point.path)??0}));
    obstacles.push(...nodes.map(({point})=>({x:point.x*scale+tx-6,y:point.y*scale+ty-6,width:12,height:12})));
    const placements=placeLabels(anchors,width,height,obstacles);
    for(const {point,label}of nodes){const box=placements.get(point.path);label.classList.toggle("is-label-hidden",!box);if(box){label.style.left=`${box.x}px`;label.style.top=`${box.y}px`;}}
    state.metrics.frames++;state.metrics.renderMs+=performance.now()-started;
    if(lastTime!==undefined&&simulation.alpha>0){state.metrics.frameTimes.push(time-lastTime);if(state.metrics.frameTimes.length>240)state.metrics.frameTimes.shift();}lastTime=time;
    if(simulation.alpha>0&&!simulation.paused&&!media.matches)schedule();
  }
  const pointAt=(x:number,y:number):XY|undefined=>{
    const matrix=svg.getScreenCTM();if(!matrix)return;
    const p=svg.createSVGPoint();p.x=x;p.y=y;const local=p.matrixTransform(matrix.inverse());return {x:(local.x-width/2)/base+500,y:local.y/base};
  };
  const wheel=(event:WheelEvent):void=>{
    if(!live||event.ctrlKey||event.metaKey)return;
    const anchor=pointAt(event.clientX,event.clientY);if(!anchor)return;
    event.preventDefault();event.stopPropagation();state.viewport=zoomGraph(state.viewport,wheelFactor(event.deltaY,event.deltaMode,height),anchor.x,anchor.y,12,.05);camera();
  };
  svg.addEventListener("wheel",wheel,{passive:false});
  let drag:{start:XY;last:XY;id:number;moved:boolean;path?:string}|undefined,capture:number|undefined;
  const finish=():void=>{
    if(drag?.path)simulation.release(drag.path);suppressClick=drag?.moved??suppressClick;drag=undefined;
    document.removeEventListener("pointermove",move);document.removeEventListener("pointerup",finish);document.removeEventListener("pointercancel",finish);
    const id=capture;capture=undefined;if(id!==undefined&&svg.hasPointerCapture(id))svg.releasePointerCapture(id);
  };
  const move=(event:PointerEvent):void=>{
    if(!live||!drag||event.pointerId!==drag.id)return;const p=pointAt(event.clientX,event.clientY);if(!p)return;
    if(!drag.moved&&Math.hypot(event.clientX-drag.start.x,event.clientY-drag.start.y)>4){drag.moved=true;capture=drag.id;svg.setPointerCapture(capture);svg.focus({preventScroll:true});}
    if(drag.moved){
      if(drag.path){const view=state.viewport;simulation.pin(drag.path,(p.x-view.x)/view.zoom,(p.y-view.y)/view.zoom);fieldsTick=-1;if(media.matches)simulation.alpha=0;}
      else state.viewport=panGraph(state.viewport,p.x-drag.last.x,p.y-drag.last.y,12,.05);
      camera();
    }drag.last=p;
  };
  const down=(event:PointerEvent):void=>{
    if(!live||event.button!==0)return;suppressClick=false;const point=pointAt(event.clientX,event.clientY);if(!point)return;
    drag={start:{x:event.clientX,y:event.clientY},last:point,id:event.pointerId,moved:false,path:(event.target as Element).getAttribute("data-path")??undefined};
    document.addEventListener("pointermove",move);document.addEventListener("pointerup",finish);document.addEventListener("pointercancel",finish);
  };
  svg.addEventListener("pointerdown",down);svg.addEventListener("lostpointercapture",finish);
  const keydown=(event:KeyboardEvent):void=>{
    if(!live||event.altKey||event.ctrlKey||event.metaKey)return;
    const moves:Record<string,XY>={ArrowLeft:{x:40,y:0},ArrowRight:{x:-40,y:0},ArrowUp:{x:0,y:40},ArrowDown:{x:0,y:-40}};
    if(moves[event.key]){event.preventDefault();const p=moves[event.key],factor=event.shiftKey?3:1;state.viewport=panGraph(state.viewport,p.x*factor,p.y*factor,12,.05);camera();}
    else if(["+","=","-"].includes(event.key)){event.preventDefault();state.viewport=zoomGraph(state.viewport,event.key==="-"?1/1.2:1.2,500,320,12,.05);camera();}
  };
  svg.addEventListener("keydown",keydown);
  const visibility=():void=>{if(!visibleNow()){if(frame!==undefined)win.cancelAnimationFrame(frame);frame=undefined;lastTime=undefined;finish();}else schedule();};
  const resize=new win.ResizeObserver(()=>{measured=false;schedule();});resize.observe(svg);
  const intersection=new win.IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;visibility();});intersection.observe(svg);
  const theme=new win.MutationObserver(()=>{measured=false;styleZones();schedule();});theme.observe(document.body,{attributes:true,attributeFilter:["class","style"]});
  document.addEventListener("visibilitychange",visibility);media.addEventListener("change",visibility);schedule();
  return ()=>{live=false;if(frame!==undefined)win.cancelAnimationFrame(frame);finish();resize.disconnect();intersection.disconnect();theme.disconnect();document.removeEventListener("visibilitychange",visibility);media.removeEventListener("change",visibility);svg.removeEventListener("wheel",wheel);svg.removeEventListener("pointerdown",down);svg.removeEventListener("lostpointercapture",finish);svg.removeEventListener("keydown",keydown);};
}
