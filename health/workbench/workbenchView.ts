import { t, currentLanguage } from "../../i18n";
import type { Finding } from "../domain/finding";
import { healthButton, healthDetails } from "../ui/renderHealthHome";
import type { WorkbenchData, PairReviewPort } from "./workbenchData";
import { linkFact, pairId, reconcileWorkbenchSelection, workbenchModel } from "./workbenchModel";
import { WorkbenchSimulation } from "./workbenchSimulation";
import type { MapPoint, WorkbenchPair } from "./workbenchModel";
import { focusWorkbench, newWorkbenchGraphState, overviewWorkbench, renderWorkbenchGraph } from "./workbenchGraph";
import { canvasWorldWidth, fitPoints, mapItems } from "./workbenchGeometry";
import type { MapItem } from "./workbenchGeometry";
import { matchesTagFilter, MAX_ACTIVE_ZONES, tagZones } from "./workbenchTags";
import { initialZones, newZoneState, renderZoneControls } from "./workbenchZones";

export interface WorkbenchActions {
  openNote(path: string): void; search(): void; settings(): void; history(): void;
  advanced(page: "topology" | "semantic-map" | "connection-opportunities" | "semantic-neighborhood"): void;
  similar(): void;
}
/** Visual context survives review; consent and final tickets belong to disposable review owners. */
export class WorkbenchView {
  readonly element: HTMLElement;
  private readonly browser: HTMLElement;
  private readonly review: HTMLElement;
  private stopReview?: () => void;
  private stopGraph?: () => void;
  private remove: () => void;
  private removeMigration: () => void;
  private disposed = false;
  private generation = 0;
  private mode: "repeats" | "connections" | "notes" = "repeats";
  private query = "";
  private limit = 60;
  private showList = false;
  private showDetail = true;
  private pinned = false;
  private expanded = false;
  private selected?: WorkbenchPair;
  private note?: string;
  private findings: readonly Finding[] = [];
  private graph = newWorkbenchGraphState();
  private zones = newZoneState();
  private zonesInitialized = false;
  private points: readonly MapPoint[] = [];
  private items: readonly MapItem[] = [];
  private simulation = new WorkbenchSimulation();
  private groupPaths?: readonly string[];
  private groupCamera?: typeof this.graph.viewport;
  private geometryKey = "";
  private representationKey = "";
  private layoutCount = 0;
  private layoutMilliseconds = 0;
  private listScroll = 0;
  private pageScroll = 0;
  private language = currentLanguage();
  constructor(parent: HTMLElement, readonly data: WorkbenchData, private readonly pair: PairReviewPort, private readonly actions: WorkbenchActions,
    private readonly scrollOwner: HTMLElement) {
    this.element=parent.createDiv({cls:"veynrel-workbench"});
    this.browser=this.element.createDiv({cls:"veynrel-workbench-browser"});this.review=this.element.createDiv({cls:"veynrel-workbench-review"});this.review.hidden=true;
    this.element.addEventListener("keydown",this.escape);
    this.removeMigration=this.element.onWindowMigrated(()=>this.render());
    this.remove=data.subscribe(()=>this.render());this.render();
  }
  update(findings: readonly Finding[]): void {
    this.findings=findings;
    if(this.language!==currentLanguage()){this.language=currentLanguage();this.suspend();}
    this.render();
  }
  suspend(): void {
    this.generation++;this.stopGraph?.();this.stopGraph=undefined;
    this.stopReview?.();this.stopReview=undefined;this.review.empty();this.review.hidden=true;this.browser.hidden=false;
  }
  dispose(): void {
    this.disposed=true;this.suspend();this.remove();this.removeMigration();this.data.dispose();this.element.removeEventListener("keydown",this.escape);
    this.element.closest(".veynrel-shell")?.classList.remove("is-map-expanded");
  }
  private escape = (event: KeyboardEvent): void => {
    const target=event.target as HTMLElement;
    if(event.key!=="Escape"||event.defaultPrevented||this.stopReview||target.closest('input,textarea,select,[contenteditable="true"]')||
      this.element.ownerDocument.querySelector(".modal-container, .menu")||this.element.closest('[data-menu-open="true"]'))return;
    const help=this.browser.querySelector<HTMLDetailsElement>(".veynrel-map-help[open]");
    if(help){help.open=false;event.preventDefault();event.stopPropagation();return;}
    if(this.zones.open)this.zones.open=false;
    else if(this.expanded)this.expanded=false;
    else if(this.graph.focus)overviewWorkbench(this.graph);
    else if(this.selected||this.note){this.selected=undefined;this.note=undefined;}
    else return;
    event.preventDefault();event.stopPropagation();this.render();this.browser.querySelector<SVGSVGElement>("svg[tabindex]")?.focus();
  };
  private render(): void {
    if(this.disposed||this.stopReview)return;
    const generation=++this.generation,current=():boolean=>!this.disposed&&generation===this.generation;
    const active=this.element.ownerDocument.activeElement as HTMLInputElement|null;
    const key=this.element.contains(active)?active?.getAttribute("data-health-action"):undefined;
    const selection=active?.tagName==="INPUT"?[active.selectionStart,active.selectionEnd]:undefined;
    const scroll=this.scrollOwner.scrollTop;
    this.listScroll=this.browser.querySelector(".veynrel-workbench-list")?.scrollTop??this.listScroll;
    this.stopGraph?.();this.stopGraph=undefined;this.browser.empty();
    this.element.closest(".veynrel-shell")?.classList.toggle("is-map-expanded",this.expanded);
    const button=(parent:HTMLElement,label:string,action:()=>void,id:string,disabled=false,primary=false):HTMLButtonElement=>
      healthButton(parent,label,()=>{if(current())action();},id,disabled,primary);
    const model=workbenchModel(this.data,this.findings.filter(finding=>finding.state==="open"));
    const paths=new Set(model.nodes.map(node=>node.path));
    this.selected=reconcileWorkbenchSelection(model,this.selected);if(this.note&&!paths.has(this.note))this.note=undefined;
    const geometryKey=JSON.stringify([model.nodes.map(node=>node.path),model.edges,model.linksCurrent,model.semanticCurrent]);
    if(geometryKey!==this.geometryKey){
      this.geometryKey=geometryKey;const started=performance.now();this.simulation.update(model.nodes,model.edges.filter(edge=>edge.kind==="link"?model.linksCurrent:model.semanticCurrent));this.points=this.simulation.points;
      this.layoutMilliseconds=performance.now()-started;this.layoutCount++;
    }
    const representationKey=JSON.stringify([geometryKey,this.groupPaths]);
    if(representationKey!==this.representationKey){
      this.representationKey=representationKey;this.items=mapItems(this.groupPaths?this.points.filter(point=>this.groupPaths!.includes(point.path)):this.points);
    }
    const metadata=this.data.dependencies.tags?.getSnapshot(),zones=tagZones(metadata);
    if(!this.zonesInitialized&&zones.length){this.zones.active=initialZones(zones);this.zonesInitialized=true;}
    const selectedPaths:readonly string[]=this.selected?.paths??(this.note?[this.note]:[]);
    const heading=this.browser.createDiv({cls:"veynrel-workbench-heading"});
    heading.createEl("h1",{text:t("@workspace.map")});
    heading.createSpan({text:this.data.scope.id==="all"?t("@workspace.all"):this.data.scope.id.replace(/^folder:/u,"")});
    button(heading,t(this.expanded?"@mapnav.collapse":"@mapnav.expand"),()=>{this.expanded=!this.expanded;this.render();},"workbench-expand").setAttribute("aria-pressed",String(this.expanded));
    const toolbar=this.browser.createDiv({cls:"veynrel-workbench-toolbar"});
    const search=toolbar.createEl("input",{type:"search",attr:{placeholder:t("@workbench.search"),"aria-label":t("@workbench.search"),"data-health-action":"workbench-search"}});
    search.value=this.query;search.addEventListener("input",()=>{if(current()){this.query=search.value;this.limit=60;this.render();}});
    button(toolbar,t(this.showList?"@mapnav.hide-list":"@mapnav.show-list"),()=>{this.showList=!this.showList;this.render();},"workbench-map-toggle").setAttribute("aria-pressed",String(this.showList));
    renderZoneControls(toolbar,zones,this.zones,current,()=>this.render());
    button(toolbar,t("@mapnav.load"),()=>{void this.data.refresh();},"workbench-refresh",this.data.busy);
    if(selectedPaths.length)button(toolbar,t("@mapnav.selection"),()=>{this.showDetail=!this.showDetail;this.render();},"workbench-selection-toggle");
    const status=this.browser.createDiv({cls:"veynrel-workbench-status",attr:{role:"status","aria-live":"polite"}});
    const semantic=this.data.semantic?.getSnapshot();
    status.createSpan({text:semantic?.state==="ready"?t("@mapnav.ready",{count:semantic.mappedNoteCount??semantic.map?.nodes.length??0,total:model.nodes.length}):t(`@workbench.map-state.${semantic?.state??"idle"}`)});
    if(semantic?.reason==="too-large")status.createSpan({text:t("@workbench.cap",{count:semantic.mappedNoteCount??0,cap:semantic.supportedNoteCount})});
    if(metadata){const unknown=metadata.notes.filter(note=>note.state!=="known").length;if(unknown)status.createSpan({text:t("@mapnav.tags-unknown",{count:unknown})});}
    if(!model.linksCurrent)status.createSpan({text:t("@mapnav.links-stale")});
    const context=this.browser.createDiv({cls:"veynrel-map-context"});
    if(this.graph.focus){
      context.createEl("strong",{text:t("@mapnav.focus",{count:this.graph.focus.length})});
      button(context,t(this.data.scope.id==="all"?"@mapnav.all-map":"@mapnav.overview"),()=>{overviewWorkbench(this.graph);this.render();},"workbench-overview");
    }
    if(this.groupPaths){context.createSpan({text:t("@mapnav.group",{count:this.groupPaths.length})});button(context,t("@mapnav.groups-back"),()=>{
      this.groupPaths=undefined;overviewWorkbench(this.graph);if(this.groupCamera)this.graph.viewport=this.groupCamera;this.groupCamera=undefined;this.render();
    },"workbench-groups-back");}
    if(this.zones.filter.length||this.query){
      context.createSpan({text:`${t("@mapnav.filter")}: ${this.query} ${t(`@mapnav.${this.zones.mode}`)} ${this.zones.filter.map(tag=>`#${tag}`).join(" · ")}`});
      button(context,t("@mapnav.clear-filter"),()=>{this.zones.filter=[];this.query="";this.render();},"workbench-clear-filter");
    }
    const needle=this.query.trim().toLocaleLowerCase();
    const included=(path:string):boolean=>path.toLocaleLowerCase().includes(needle)&&matchesTagFilter(path,zones,this.zones.filter,this.zones.mode)&&(!this.groupPaths||this.groupPaths.includes(path));
    const visiblePaths=new Set(model.nodes.filter(node=>included(node.path)).map(node=>node.path));
    const work=this.browser.createDiv({cls:`veynrel-workbench-grid${this.showList?" is-list-open":""}${this.pinned?" is-detail-pinned":""}`});
    const map=work.createEl("section",{cls:"veynrel-workbench-map-pane"});
    const visibleItems=this.items.filter(item=>(item.members??[item.path]).some(path=>visiblePaths.has(path))).map(item=>item.members?{...item,members:item.members.filter(path=>visiblePaths.has(path))}:item);
    this.stopGraph=renderWorkbenchGraph(map,model,selectedPaths,this.graph,{items:visibleItems,simulation:this.simulation,query:this.query,zones,activeZones:this.zones.active,zone:this.zones.selected,
      selectZone:tag=>{if(current()){this.zones.selected=tag;this.render();}},group:members=>{if(current()){
        overviewWorkbench(this.graph);this.groupCamera={...this.graph.viewport};this.groupPaths=members;this.graph.viewport={x:0,y:0,zoom:1};this.render();
      }}},path=>{if(current())this.selectNote(path);},()=>{if(current())this.render();});
    if(this.zones.selected){
      const zone=zones.find(zone=>zone.tag===this.zones.selected);
      if(zone){const selected=map.createDiv({cls:"veynrel-zone-selection"});selected.createEl("strong",{text:`#${zone.tag} · ${zone.members.size}`});
        button(selected,t("@mapnav.filter-zone"),()=>{this.zones.filter=[zone.tag];this.render();},"workbench-filter-zone");
        button(selected,t("@mapnav.clear-zone"),()=>{this.zones.selected=undefined;this.render();},"workbench-clear-zone");}
    }
    if(this.showList){
      const listPane=work.createEl("section",{cls:"veynrel-workbench-list-pane"});
      const modes=listPane.createDiv({cls:"veynrel-workbench-modes",attr:{role:"group","aria-label":t("@workbench.scenarios")}});
      for(const mode of ["repeats","connections","notes"] as const)button(modes,t(`@workbench.${mode}`),()=>{this.mode=mode;this.limit=60;this.listScroll=0;this.render();},`workbench-mode-${mode}`).setAttribute("aria-pressed",String(this.mode===mode));
      const pairs=(this.mode==="connections"?model.connections:model.repeats).filter(pair=>pair.paths.every(path=>matchesTagFilter(path,zones,this.zones.filter,this.zones.mode))&&pair.paths.some(path=>included(path)));
      const notes=model.nodes.filter(node=>included(node.path)),total=this.mode==="notes"?notes.length:pairs.length;
      listPane.createEl("h2",{text:`${t(`@workbench.${this.mode}`)} · ${total}`});
      if(this.mode!=="notes")listPane.createEl("small",{text:t(`@workbench.state.${this.data.duplicateState}`)});
      const list=listPane.createEl("ul",{cls:"veynrel-workbench-list",attr:{"aria-label":t(`@workbench.${this.mode}`)}});
      if(this.mode==="notes")for(const node of notes.slice(0,this.limit)){
        const row=list.createEl("li"),control=button(row,node.path,()=>this.selectNote(node.path),`workbench-note-${encodeURIComponent(node.path)}`);
        control.setAttribute("aria-pressed",String(selectedPaths.includes(node.path)));control.setAttribute("data-workbench-path",node.path);
      }else for(const pair of pairs.slice(0,this.limit)){
        const row=list.createEl("li"),control=button(row,`${pair.paths[0]} ↔ ${pair.paths[1]}`,()=>this.selectPair(pair),`workbench-pair-${encodeURIComponent(pair.id)}`);
        control.setAttribute("aria-pressed",String(this.selected?.id===pair.id));control.setAttribute("data-workbench-pair",pair.id);
        row.createEl("small",{text:t(`@workbench.basis.${pair.basis}`)});
      }
      if(!total)listPane.createEl("p",{text:t(this.query||this.zones.filter.length?"@workbench.no-search":this.mode==="notes"?"@workbench.no-notes":
        this.mode==="repeats"&&this.data.duplicateState==="ready"?"@workbench.no-candidates":this.mode==="connections"&&model.comparisonCurrent?"@workbench.no-connections":"@workbench.not-checked")});
      if(total>this.limit)button(listPane,t("@workbench.more"),()=>{this.limit+=60;this.render();},"workbench-more");
      list.scrollTop=this.listScroll;
    }
    if(selectedPaths.length&&this.showDetail){
      const detail=work.createEl("section",{cls:"veynrel-workbench-selection",attr:{tabindex:"-1","data-workbench-selection":"true"}});
      const detailTools=detail.createDiv({cls:"veynrel-detail-tools"});
      button(detailTools,t(this.pinned?"@mapnav.unpin":"@mapnav.pin"),()=>{this.pinned=!this.pinned;this.render();},"workbench-pin");
      button(detailTools,t("@mapnav.close"),()=>{this.showDetail=false;this.render();},"workbench-detail-close");
      for(const path of selectedPaths){
        detail.createEl("h2",{text:path.split("/").pop()!.replace(/\.md$/u,"")});
        const memberships=zones.filter(zone=>zone.members.has(path)&&zone.direct.includes(path)),chips=detail.createDiv({cls:"veynrel-memberships"});
        for(const zone of memberships){const visible=this.zones.active.includes(zone.tag);button(chips,`${visible?"":"+ "}#${zone.tag}`,()=>{
          if(!visible&&this.zones.active.length<MAX_ACTIVE_ZONES)this.zones.active.push(zone.tag);else if(!visible)this.zones.open=true;
          this.zones.selected=zone.tag;this.render();
        },`workbench-membership-${encodeURIComponent(zone.tag)}`).setAttribute("aria-pressed",String(visible));}
        const tagState=metadata?.notes.find(note=>note.path===path);
        if(!memberships.length)detail.createEl("small",{text:t(tagState?.state==="known"?"@mapnav.no-tags":`@mapnav.metadata-${tagState?.state??"unknown"}`)});
        const hidden=memberships.filter(zone=>!this.zones.active.includes(zone.tag));
        if(hidden.length)button(detail,t("@mapnav.hidden-memberships",{count:hidden.length,categories:[...new Set(hidden.map(zone=>zone.categoryName))].join(", ")}),()=>{this.zones.open=true;this.render();},`workbench-hidden-${encodeURIComponent(path)}`);
        button(detail,t("@consolidation.open"),()=>this.actions.openNote(path),`workbench-open-${encodeURIComponent(path)}`);
      }
      if(selectedPaths.some(path=>!visiblePaths.has(path)))detail.createEl("small",{text:t("@mapnav.outside-filter")});
      if(this.selected){
        detail.createEl("p",{text:t(`@workbench.link.${linkFact(model,this.selected.paths)}`)});
        detail.createEl("small",{text:t(`@workbench.basis.${this.selected.basis}`)});
        button(detail,t("@workbench.compare"),()=>this.openReview(),"workbench-compare",false,true);
      }else if(this.note){
        const candidates=[...new Map([...model.connections,...model.repeats].filter(pair=>pair.paths.includes(this.note!)).map(pair=>[pair.id,pair])).values()];
        if(candidates.length){detail.createEl("h3",{text:t("@mapnav.candidates")});for(const pair of candidates.slice(0,5))button(detail,`${t("@visual.review")} · ${pair.paths.find(path=>path!==this.note)!}`,()=>this.selectPair(pair),`workbench-related-${encodeURIComponent(pair.id)}`);}
        const label=detail.createEl("label",{text:t("@workbench.second-note")});
        const picker=label.createEl("select",{attr:{"data-health-action":"workbench-second","aria-label":t("@workbench.second-note")}});
        picker.createEl("option",{text:t("@workbench.choose"),value:""});
        for(const node of model.nodes)if(node.path!==this.note)picker.createEl("option",{text:node.path,value:node.path});
        picker.addEventListener("change",()=>{if(!current()||!this.note||!paths.has(picker.value)||picker.value===this.note)return;
          const a=this.note,b=picker.value;this.selectPair(model.repeats.find(pair=>pair.id===pairId(a,b))??model.connections.find(pair=>pair.id===pairId(a,b))??{id:pairId(a,b),paths:[a,b].sort() as [string,string],basis:"selected"});});
      }
      button(detail,t("@mapnav.focus-action"),()=>{
        const box=this.browser.querySelector<SVGSVGElement>("svg[data-camera]")?.viewBox.baseVal;
        const width=box?canvasWorldWidth(box.width,box.height):undefined;
        focusWorkbench(this.graph,selectedPaths,model);this.graph.viewport=fitPoints(this.items.filter(item=>this.graph.focus!.includes(item.path)),width);this.render();
      },"workbench-focus");
      button(detail,t("@mapnav.clear-selection"),()=>{this.note=undefined;this.selected=undefined;this.render();},"workbench-clear-selection");
      const diagnostics=healthDetails(detail,t("@mapnav.details"),"workbench-selection-details");
      selectedPaths.forEach(path=>diagnostics.createEl("p",{text:path,cls:"veynrel-workbench-path"}));
      diagnostics.createEl("p",{text:t("@workbench.candidate-disclaimer")});
      if(this.selected?.score!==undefined)diagnostics.createEl("p",{text:String(this.selected.score)});
      for(const edge of model.external.filter(edge=>selectedPaths.includes(edge.source)||selectedPaths.includes(edge.target)))diagnostics.createEl("p",{text:`${edge.source} → ${edge.target}`});
    }
    const footer=this.browser.createDiv({cls:"veynrel-workbench-footer"});
    button(footer,t("@safeApply.history"),()=>this.actions.history(),"workbench-history");
    const details=healthDetails(footer,t("@workbench.coverage"),"workbench-coverage");
    details.createEl("p",{text:t("@mapnav.geometry-note")});
    details.createEl("p",{text:t("@workbench.coverage-count",{notes:model.nodes.length,indexed:semantic?.indexedNoteCount??"—",mapped:semantic?.mappedNoteCount??"—"})});
    details.createEl("pre",{text:JSON.stringify({scope:{id:this.data.scope.id,revision:this.data.scope.revision},semantic:semantic?.map?.revision,topology:this.data.dependencies.topology.getSnapshot().map?.revision,
      tags:metadata?.revision,comparisonCurrent:model.comparisonCurrent,duplicateState:this.data.duplicateState,duplicateComplete:this.data.duplicates?.complete},null,2)});
    const advanced=healthDetails(footer,t("@workbench.advanced"),"workbench-advanced");
    for(const page of ["topology","semantic-map","connection-opportunities","semantic-neighborhood"] as const)button(advanced,t(`@workbench.advanced.${page}`),()=>this.actions.advanced(page),`workbench-advanced-${page}`);
    button(advanced,t("@workbench.similar"),()=>this.actions.similar(),"workbench-similar");
    button(advanced,t("@polish.explore.search"),()=>{
      if(this.data.scope.id==="all")this.actions.search();else{const confirm=advanced.createDiv();confirm.createEl("p",{text:t("@workbench.search-scope")});button(confirm,t("@workspace.continue"),()=>this.actions.search(),"workbench-search-confirm");}
    },"workbench-semantic-search");
    if(key){const target=Array.from(this.browser.querySelectorAll<HTMLElement>("[data-health-action]")).find(element=>element.getAttribute("data-health-action")===key);
      target?.focus({preventScroll:true});if(selection&&target?.tagName==="INPUT"&&(target as HTMLInputElement).type==="search")(target as HTMLInputElement).setSelectionRange(selection[0],selection[1]);}
    this.scrollOwner.scrollTop=scroll;
  }
  private selectNote(path:string):void {this.selected=undefined;this.note=path;this.showDetail=true;this.showList=false;this.render();this.focusSelection();}
  private selectPair(pair:WorkbenchPair):void {this.selected=pair;this.note=undefined;this.showDetail=true;this.showList=false;this.render();this.focusSelection();}
  private focusSelection():void {this.browser.querySelector<HTMLElement>("[data-workbench-selection]")?.focus({preventScroll:true});}
  private openReview():void {
    if(!this.selected||this.stopReview||this.disposed)return;
    this.pageScroll=this.scrollOwner.scrollTop;this.stopGraph?.();this.stopGraph=undefined;
    this.browser.hidden=true;this.review.hidden=false;this.review.empty();const generation=++this.generation;
    const back=healthButton(this.review,t("@workbench.back"),()=>{
      if(!this.stopReview||generation!==this.generation)return;
      this.suspend();this.render();this.scrollOwner.scrollTop=this.pageScroll;
      this.browser.querySelector<HTMLElement>('[data-health-action="workbench-compare"]')?.focus({preventScroll:true});
    },"workbench-back");
    const content=this.review.createDiv();this.stopReview=this.pair.mount(content,this.selected.paths);back.focus();this.scrollOwner.scrollTop=0;
  }
}
