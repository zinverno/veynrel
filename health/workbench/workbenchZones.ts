import { t } from "../../i18n";
import { healthButton } from "../ui/renderHealthHome";
import { MAX_ACTIVE_ZONES } from "./workbenchTags";
import type { TagZone } from "./workbenchTags";
export interface ZoneState { active: string[]; filter: string[]; mode: "all" | "any"; query: string; category: string; selected?: string; open: boolean; proposed:boolean }
export const newZoneState = (): ZoneState => ({ active:[], filter:[], mode:"all", query:"", category:"", open:false, proposed:true });
export function initialZones(zones: readonly TagZone[]): string[] {
  const categories = [...new Set(zones.map(zone=>zone.category))];
  const ordered = categories.map(category=>zones.filter(zone=>zone.category===category && zone.direct.length).sort((a,b)=>b.members.size-a.members.size))
    .sort((a,b)=>(b[0]?.members.size??0)-(a[0]?.members.size??0));
  const result:string[]=[];
  for (let i=0; result.length<3 && ordered.some(group=>group[i]); i++) for (const group of ordered) if (group[i] && result.length<3) result.push(group[i].tag);
  return result;
}
export function renderZoneControls(parent: HTMLElement, zones: readonly TagZone[], state: ZoneState, current: () => boolean, redraw: () => void): void {
  const button=(host:HTMLElement,label:string,action:()=>void,id:string,disabled=false):HTMLButtonElement=>healthButton(host,label,()=>{ if(current()) action(); },id,disabled);
  const available=state.active.filter(tag=>zones.some(zone=>zone.tag===tag));
  button(parent,t(state.proposed?"@visual.proposed":"@visual.layers",{active:available.length,total:zones.length}),()=>{state.open=!state.open;redraw();},"workbench-zones").setAttribute("aria-expanded",String(state.open));
  if (!state.open) return;
  const panel=parent.createDiv({cls:"veynrel-zones-panel",attr:{role:"region","aria-label":t("@mapnav.zone-controls")}});
  const top=panel.createDiv({cls:"veynrel-zone-heading"});
  top.createEl("strong",{text:t("@mapnav.zone-controls")});
  button(top,t("@mapnav.close"),()=>{state.open=false;redraw();},"workbench-zones-close");
  panel.createEl("small",{text:t("@mapnav.zone-bound",{shown:available.length,hidden:zones.length-available.length,cap:MAX_ACTIVE_ZONES})});
  for(const tag of state.active.filter(tag=>!available.includes(tag)))button(panel,`#${tag} · ${t("@mapnav.metadata-stale")} ×`,()=>{state.active=state.active.filter(value=>value!==tag);redraw();},`zone-remove-${encodeURIComponent(tag)}`);
  const query=panel.createEl("input",{type:"search",attr:{"aria-label":t("@mapnav.tag-search"),placeholder:t("@mapnav.tag-search"),"data-health-action":"workbench-tag-search"}});query.value=state.query;
  query.addEventListener("input",()=>{if(current()){state.query=query.value;redraw();}});
  const categories=panel.createEl("select",{attr:{"aria-label":t("@mapnav.categories"),"data-health-action":"workbench-category"}});
  categories.createEl("option",{text:t("@mapnav.categories"),value:""});
  for(const [id,name] of new Map(zones.map(zone=>[zone.category,zone.categoryName]))) categories.createEl("option",{text:name,value:id});
  categories.value=state.category;
  categories.addEventListener("change",()=>{if(current()){state.category=categories.value;redraw();}});
  if(state.category) button(panel,t("@mapnav.show-category"),()=>{
    const extra=zones.filter(zone=>zone.category===state.category&&zone.direct.length&&!state.active.includes(zone.tag));
    state.proposed=false;state.active.push(...extra.slice(0,MAX_ACTIVE_ZONES-state.active.length).map(zone=>zone.tag));redraw();
  },"workbench-show-category",state.active.length>=MAX_ACTIVE_ZONES);
  const filters=panel.createEl("label",{text:t("@mapnav.filter-mode")});
  const mode=filters.createEl("select",{attr:{"aria-label":t("@mapnav.filter-mode"),"data-health-action":"workbench-filter-mode"}});
  for(const value of ["all","any"] as const) mode.createEl("option",{text:t(`@mapnav.${value}`),value});
  mode.value=state.mode;mode.addEventListener("change",()=>{if(current()){state.mode=mode.value as "all"|"any";redraw();}});
  const list=panel.createDiv({cls:"veynrel-zone-options"});
  const shown=zones.filter(zone=>(!state.category||zone.category===state.category)&&zone.tag.toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
  for(const zone of shown.slice(0,100)){
    const row=list.createDiv({cls:"veynrel-zone-option"});
    const active=state.active.includes(zone.tag);
    const toggle=button(row,`#${zone.tag} · ${zone.members.size}`,()=>{state.proposed=false;state.active=active?state.active.filter(tag=>tag!==zone.tag):[...state.active,zone.tag];redraw();},`zone-toggle-${encodeURIComponent(zone.tag)}`,!active&&state.active.length>=MAX_ACTIVE_ZONES);
    toggle.setAttribute("aria-pressed",String(active));toggle.title=t("@mapnav.membership-count",{direct:zone.direct.length,inherited:zone.inherited.length});
    const label=row.createEl("label",{text:t("@mapnav.filter")});const input=label.createEl("input",{type:"checkbox",attr:{"aria-label":`${t("@mapnav.filter")} #${zone.tag}`,"data-filter-tag":zone.tag,"data-health-action":`filter-${encodeURIComponent(zone.tag)}`}});input.checked=state.filter.includes(zone.tag);
    input.addEventListener("change",()=>{if(current()){state.filter=input.checked?[...state.filter,zone.tag]:state.filter.filter(tag=>tag!==zone.tag);redraw();}});
  }
  if(shown.length>100) panel.createEl("small",{text:t("@mapnav.refine-tags",{count:shown.length})});
  if(state.filter.length) button(panel,t("@mapnav.clear-filter"),()=>{state.filter=[];redraw();},"workbench-clear-tag-filter");
}
