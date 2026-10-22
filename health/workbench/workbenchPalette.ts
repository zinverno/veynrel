import { pathSeed } from "./workbenchSimulation";
import type { MapItem } from "./workbenchGeometry";
/** Hue belongs to the literal tag, never its position in the active-layer array. */
export function tagHue(tag:string):number { return pathSeed(tag)%360; }
const savedHue=(known:Record<string,number>,tag:string):number|undefined=>Object.prototype.hasOwnProperty.call(known,tag)&&Number.isFinite(known[tag])?known[tag]:undefined;
export function assignTagHues(tags:readonly string[], known:Record<string,number>):void {
  const used=tags.filter(tag=>savedHue(known,tag)!==undefined).map(tag=>known[tag]);
  for(const tag of [...tags].sort())if(savedHue(known,tag)===undefined){
    let hue=tagHue(tag),best=hue,distance=-1;
    for(let i=0;i<36;i++){
      const candidate=(hue+i*137.508)%360,min=Math.min(180,...used.map(other=>Math.min(Math.abs(candidate-other),360-Math.abs(candidate-other))));
      if(min>distance){distance=min;best=candidate;}
    }
    Object.defineProperty(known,tag,{value:best,enumerable:true,writable:true,configurable:true});used.push(best);
  }
}
export function paletteFor(background:string): { light:boolean; saturation:number; lightness:number; opacity:number } {
  const components=background.match(/[\d.]+/gu)?.slice(0,3).map(Number);
  const light=components?.length===3 ? components[0]*.2126+components[1]*.7152+components[2]*.0722>150 : false;
  return {light,saturation:light?55:62,lightness:light?38:70,opacity:light?.10:.13};
}
export function tagColor(tag:string, background:string, known:Record<string,number>={}):string {
  const palette=paletteFor(background);return `hsl(${savedHue(known,tag)??tagHue(tag)} ${palette.saturation}% ${palette.lightness}%)`;
}
/** Local radial patches, not polygons: background is orientation, never membership. */
export function haloSpots(items:readonly MapItem[], members:ReadonlySet<string>): {x:number;y:number;r:number}[] {
  const bins=new Map<string,{x:number;y:number;n:number}>();
  for(const item of items){
    if(item.members||!members.has(item.path))continue;
    const key=`${Math.floor(item.x/85)},${Math.floor(item.y/85)}`,bin=bins.get(key)??{x:0,y:0,n:0};
    bin.x+=item.x;bin.y+=item.y;bin.n++;bins.set(key,bin);
  }
  // shortcut: 96 local patches per tag at the 500-node cap; consider canvas only if profiling warrants it.
  return [...bins.values()].slice(0,96).map(bin=>({x:bin.x/bin.n,y:bin.y/bin.n,r:65+Math.min(30,bin.n*3)}));
}
