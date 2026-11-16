import type { Viewport } from "../ui/graphViewport";
import { sameLocalVaultRevision } from "../analyzers/local/localVaultRevision";
import { topologyStatus } from "../topology/topologyPresentation";
import { structureCoverage } from "./workbenchStructure";
import { layoutTopology } from "../topology/topologyLayout";
import type { VaultTopologySnapshot } from "../topology/types";
import { renderNoteActions, type NoteActions } from "./noteActions";
import { WorkbenchInspectors } from "./workbenchInspectors";
import type { WorkbenchInspector } from "./workbenchInspectors";
import { semanticFamilies } from "./workbenchFamilies";
import type { SemanticFamily } from "./workbenchFamilies";
import { renderFamilies, type FamilyBrowserState } from "./renderFamilies";
import { renderPairNoteSearch, searchPairNotes } from "./workbenchNoteSearch";
import { t, currentLanguage } from "../../i18n";
import type { Finding } from "../domain/finding";
import { healthButton, healthDetails } from "../ui/renderHealthHome";
import type { WorkbenchData, PairReviewPort } from "./workbenchData";
import { linkFact, pairId, reconcileWorkbenchSelection, workbenchModel, workbenchGeometryKey } from "./workbenchModel";
import { WorkbenchSimulation } from "./workbenchSimulation";
import type { MapPoint, WorkbenchPair } from "./workbenchModel";
import { focusWorkbench, newWorkbenchGraphState, overviewWorkbench, renderWorkbenchGraph } from "./workbenchGraph";
import { canvasWorldWidth, fitPoints, mapItems } from "./workbenchGeometry";
import type { MapItem } from "./workbenchGeometry";
import { matchesTagFilter, MAX_ACTIVE_ZONES, tagZones } from "./workbenchTags";
import { initialZones, newZoneState, renderZoneControls } from "./workbenchZones";

export interface WorkbenchActions {
  notes?: NoteActions;
  openNote(path: string): void; search(): void; settings(): void; history(): void;
  advanced(page: "topology" | "semantic-map" | "connection-opportunities" | "semantic-neighborhood"): void;
  similar(): void;
  decisions?(): void;
}
/** Visual context survives review; consent and final tickets belong to disposable review owners. */
export class WorkbenchView {
  readonly element: HTMLElement;
  private readonly inspectors: WorkbenchInspectors;
  private readonly browser: HTMLElement;
  private readonly review: HTMLElement;
  private stopReview?: () => void;
  private stopGraph?: () => void;
  private remove: () => void;
  private removeDecisions?: () => void;
  private removeMigration: () => void;
  private disposed = false;
  private suspended = false;
  private closeRules?: () => void;
  private pendingRender?: { win: Window; id: number };
  private generation = 0;
  private mode: "repeats" | "connections" | "notes" = "repeats";
  private query = "";
  private limit = 60;
  private showList = false;
  private showDetail = true;
  private expanded = false;
  private selected?: WorkbenchPair;
  private note?: string;
  private secondQuery = "";
  private families: FamilyBrowserState = { open: false, query: "" };
  private familyMap?: object;
  private findings: readonly Finding[] = [];
  private surface: "structure" | "similarity" = "structure";
  private graphs = { structure: newWorkbenchGraphState(), similarity: newWorkbenchGraphState() };
  private get graph() { return this.graphs[this.surface]; }
  private structureMap?: VaultTopologySnapshot;
  private structureSimulation = new WorkbenchSimulation();
  private isolated = false;
  private zones = newZoneState();
  private zonesInitialized = false;
  private points: readonly MapPoint[] = [];
  private items: readonly MapItem[] = [];
  private simulation = new WorkbenchSimulation();
  private groups: Record<"structure" | "similarity", { paths?: readonly string[]; camera?: Viewport }> = { structure: {}, similarity: {} };
  private get groupPaths() { return this.groups[this.surface].paths; }
  private set groupPaths(paths: readonly string[] | undefined) { this.groups[this.surface].paths = paths; }
  private get groupCamera() { return this.groups[this.surface].camera; }
  private set groupCamera(camera: typeof this.graph.viewport | undefined) { this.groups[this.surface].camera = camera; }
  private geometryKey = "";
  private representationKey = "";
  private layoutCount = 0;
  private layoutMilliseconds = 0;
  private representationMilliseconds = 0;
  private listScroll = 0;
  private pageScroll = 0;
  private language = currentLanguage();
  private layoutShell?: Element | null;
  private layoutHost?: HTMLElement | null;
  constructor(parent: HTMLElement, readonly data: WorkbenchData, private readonly pair: PairReviewPort, private readonly actions: WorkbenchActions,
    private readonly scrollOwner: HTMLElement) {
    this.element=parent.createDiv({cls:"veynrel-workbench"});
    this.browser=this.element.createDiv({cls:"veynrel-workbench-browser"});this.review=this.element.createDiv({cls:"veynrel-workbench-review"});this.review.hidden=true;
    this.inspectors=new WorkbenchInspectors(data,()=>this.render(),{
      openNote:path=>actions.openNote(path),selectNote:path=>{if(this.data.scope.paths.includes(path))this.selectNote(path);},
      returnToMap:()=>this.focusMap(),
      openPair:(left,right)=>{this.actions.openNote(left);this.actions.openNote(right);},
    });
    this.element.addEventListener("keydown",this.escape);
    this.removeMigration=this.element.onWindowMigrated(()=>{this.cancelRender();this.render();});
    this.removeDecisions=pair.decisions?.subscribe(()=>this.requestRender());
    void pair.decisions?.load().catch(()=>{});
    this.remove=data.subscribe(()=>this.requestRender());this.render();
  }
  selectPaths(paths: readonly string[]): void {
    if (this.disposed || this.stopReview || !paths.every(path => this.data.scope.paths.includes(path))) return;
    if (paths.length === 1) this.selectNote(paths[0]);
    else if (paths.length === 2 && paths[0] !== paths[1]) {
      try { const p = this.data.captureParticipation(); if (p && (!paths.every(path => p.document(path) === "allow") || p.pair(paths[0], paths[1]) !== "allow")) return; } catch { return; }
      const pair = [...paths].sort() as [string, string]; this.selectPair({ id: pairId(...pair), paths: pair, basis: "selected" });
    }
  }
  inspect(panel: WorkbenchInspector): void { this.surface=panel==="topology"?"structure":"similarity";this.inspectors.open(panel,this.note??this.selected?.paths[0]); }
  private cancelRender(): void {
    if(this.pendingRender)this.pendingRender.win.cancelAnimationFrame(this.pendingRender.id);
    this.pendingRender=undefined;
  }
  private requestRender(): void {
    if(this.disposed||this.suspended||this.pendingRender)return;
    const win=this.element.ownerDocument.defaultView;
    if(!win)return;
    // Metadata arrives per file; rebuilding the whole graph per event stalls cold large vaults.
    this.pendingRender={win,id:win.requestAnimationFrame(()=>{this.pendingRender=undefined;this.render();})};
  }
  update(findings: readonly Finding[]): void {
    if(this.disposed)return;
    this.findings=findings;
    if(this.language!==currentLanguage()){this.language=currentLanguage();this.suspend();}
    this.suspended=false; this.syncLayout(true); this.render();
  }
  suspend(): void {
    this.suspended=true; this.cancelRender(); this.inspectors.unmount(); this.data.cancel();
    this.element.closest(".veynrel-shell")?.classList.remove("is-map-expanded");
    this.suspended=true; this.closeRules?.(); this.closeRules=undefined;
    this.syncLayout(false);
    this.generation++;this.stopGraph?.();this.stopGraph=undefined;
    this.stopReview?.();this.stopReview=undefined;this.review.empty();this.review.hidden=true;this.browser.hidden=false;
  }
  dispose(): void {
    this.disposed=true;this.suspend();this.remove();this.removeDecisions?.();this.removeMigration();this.data.dispose();this.element.removeEventListener("keydown",this.escape);
    this.element.closest(".veynrel-shell")?.classList.remove("is-map-expanded");
  }
  private syncLayout(mounted: boolean): void {
    const shell=mounted?this.element.closest(".veynrel-shell"):null,host=mounted?this.element.parentElement:null;
    if(this.layoutShell!==shell)this.layoutShell?.removeAttribute("data-workbench-mounted");
    if(this.layoutHost!==host)this.layoutHost?.removeAttribute("data-workbench-host");
    this.layoutShell=shell;this.layoutHost=host;
    shell?.setAttribute("data-workbench-mounted","true");host?.setAttribute("data-workbench-host","true");
  }
  private escape = (event: KeyboardEvent): void => {
    const target=event.target as HTMLElement;
    if(event.key!=="Escape"||event.defaultPrevented||this.stopReview||target.closest('input,textarea,select,[contenteditable="true"]')||
      this.element.ownerDocument.querySelector(".modal-container, .menu")||this.element.closest('[data-menu-open="true"]'))return;
    if(this.inspectors.panel){this.inspectors.close();event.preventDefault();event.stopPropagation();return;}
    const help=this.browser.querySelector<HTMLDetailsElement>(".veynrel-map-help[open]");
    if(help){help.open=false;event.preventDefault();event.stopPropagation();return;}
    if(this.zones.open)this.zones.open=false;
    else if(this.expanded)this.expanded=false;
    else if(this.surface==="similarity"&&this.families.selected){this.families.selected=undefined;overviewWorkbench(this.graph);}
    else if(this.graph.focus)overviewWorkbench(this.graph);
    else if(this.selected||this.note){this.selected=undefined;this.note=undefined;}
    else return;
    event.preventDefault();event.stopPropagation();this.render();this.focusMap();
  };
  private render(): void {
    if(this.disposed||this.suspended||this.stopReview)return;
    this.cancelRender();
    this.syncLayout(true);
    const generation=++this.generation,current=():boolean=>!this.disposed&&generation===this.generation;
    const active=this.element.ownerDocument.activeElement as HTMLInputElement|null;
    const key=this.element.contains(active)?active?.getAttribute("data-health-action"):undefined;
    const selection=active?.tagName==="INPUT"?[active.selectionStart,active.selectionEnd]:undefined;
    const scroll=this.scrollOwner.scrollTop;
    this.listScroll=this.browser.querySelector(".veynrel-workbench-list")?.scrollTop??this.listScroll;
    this.stopGraph?.();this.stopGraph=undefined;this.inspectors.unmount();this.browser.empty();
    this.element.closest(".veynrel-shell")?.classList.toggle("is-map-expanded",this.expanded);
    const button=(parent:HTMLElement,label:string,action:()=>void,id:string,disabled=false,primary=false):HTMLButtonElement=>
      healthButton(parent,label,()=>{if(current())action();},id,disabled,primary);
    const observed=workbenchModel(this.data,this.findings.filter(finding=>finding.state==="open"));
    // A path match is not proof of unchanged sources. Verification stays in the existing Review list.
    const decisions=this.pair.decisions;
    const eligible=(pair:WorkbenchPair):boolean=>!decisions||(decisions.state==="ready"&&!decisions.hasPaths(pair.paths));
    const model={...observed,connections:observed.connections.filter(eligible),repeats:observed.repeats.filter(eligible)};
    const paths=new Set(model.nodes.map(node=>node.path));
    this.selected=reconcileWorkbenchSelection(model,this.selected);if(this.note&&!paths.has(this.note))this.note=undefined;
    const topology=this.data.dependencies.topology.getSnapshot();
    const coverage=structureCoverage(topology,this.data.scope.paths);
    const structural=this.surface==="structure";
    const graphModel=structural?{...model,edges:model.edges.filter(edge=>edge.kind==="link")}:model;
    const geometryKey=workbenchGeometryKey(model);
    if(!structural&&geometryKey!==this.geometryKey){
      this.geometryKey=geometryKey;this.graphs.similarity.fitted=false;const started=performance.now(),paused=this.simulation.paused;this.simulation=new WorkbenchSimulation();this.simulation.paused=paused;this.simulation.update(model.nodes,model.edges);this.points=this.simulation.points;
      this.layoutMilliseconds=performance.now()-started;this.layoutCount++;
    }
    if(structural&&topology.map!==this.structureMap&&(!topology.map||!this.structureMap||!sameLocalVaultRevision(topology.map.revision,this.structureMap.revision))){
      this.structureMap=topology.map;this.graphs.structure.fitted=false;
      const started=performance.now();this.structureSimulation=new WorkbenchSimulation();this.structureSimulation.paused=true;
      this.structureSimulation.points=(topology.map?layoutTopology(topology.map).points:[]).filter(point=>paths.has(point.path)).map(point=>({...point,vx:0,vy:0}));
      this.layoutMilliseconds=performance.now()-started;this.layoutCount++;
    }
    this.points=structural?this.structureSimulation.points:this.simulation.points;
    const representationKey=JSON.stringify([this.surface,structural?topology.map?.revision:geometryKey,this.groupPaths]);
    if(representationKey!==this.representationKey){
      const started=performance.now();this.representationKey=representationKey;this.items=mapItems(this.groupPaths?this.points.filter(point=>this.groupPaths!.includes(point.path)):this.points);this.representationMilliseconds=performance.now()-started;
    }
    const semantic=this.data.semantic?.getSnapshot();
    const families=semanticFamilies(semantic);
    if(this.families.selected&&(!families||this.familyMap!==families.map)){
      this.families.selected=undefined;overviewWorkbench(this.graphs.similarity);
    }
    this.familyMap=families?.map;
    const metadata=semantic?.state==="idle"&&topology.state==="idle"&&!this.data.busy?undefined:this.data.dependencies.tags?.getSnapshot(),zones=tagZones(metadata);
    if(!this.zonesInitialized&&zones.length){this.zones.active=initialZones(zones);this.zonesInitialized=true;}
    const selectedPaths:readonly string[]=this.selected?.paths??(this.note?[this.note]:[]);
    const heading=this.browser.createDiv({cls:"veynrel-workbench-heading"});
    for(const surface of ["structure","similarity"] as const)button(heading,t(`@uxc.${surface}`),()=>{this.surface=surface;this.render();},`workbench-surface-${surface}`).setAttribute("aria-pressed",String(this.surface===surface));
    heading.createSpan({text:this.data.scope.id==="all"?t("@workspace.all"):this.data.scope.id.replace(/^folder:/u,"")});
    button(heading,t(this.expanded?"@mapnav.collapse":"@mapnav.expand"),()=>{this.expanded=!this.expanded;this.render();},"workbench-expand").setAttribute("aria-pressed",String(this.expanded));
    const toolbar=this.browser.createDiv({cls:"veynrel-workbench-toolbar"});
    const search=toolbar.createEl("input",{type:"search",attr:{placeholder:t("@workbench.search"),"aria-label":t("@workbench.search"),"data-health-action":"workbench-search"}});
    search.value=this.query;search.addEventListener("input",()=>{if(current()){this.query=search.value;this.limit=60;this.render();}});
    button(toolbar,t(this.showList?"@mapnav.hide-list":"@mapnav.show-list"),()=>{this.showList=!this.showList;this.render();},"workbench-map-toggle").setAttribute("aria-pressed",String(this.showList));
    renderZoneControls(toolbar,zones,this.zones,current,()=>this.render());
    button(toolbar,t(structural?"@uxc.load-links":"@mapnav.load"),()=>{
      if(structural){this.data.dependencies.tags?.refresh();void this.data.dependencies.topology.refresh();}else void this.data.refresh();
    },"workbench-refresh",structural?topology.state==="loading":this.data.busy);
    if(structural)button(toolbar,t("@uxc.isolated"),()=>{this.isolated=!this.isolated;this.render();},"workbench-isolated",!coverage.complete).setAttribute("aria-pressed",String(this.isolated));
    if(this.data.busy)button(toolbar,t("@r062b.cancel"),()=>this.data.cancel(),"workbench-cancel");
    if(this.data.dependencies.editRules)button(toolbar,t("@rules.title"),()=>{this.closeRules=this.data.dependencies.editRules!();},"workbench-rules");
    if(selectedPaths.length)button(toolbar,t("@mapnav.selection"),()=>{this.showDetail=!this.showDetail;this.render();},"workbench-selection-toggle");
    const status=this.browser.createDiv({cls:"veynrel-workbench-status",attr:{role:"status","aria-live":"polite"}});
    if(structural){
      status.createSpan({text:topologyStatus(topology)});
      if(topology.map){
        const unknown=coverage.unknown;
        status.createSpan({text:t("@uxc.structure-count",{scope:model.nodes.length,total:topology.map.noteCount,links:topology.map.resolvedLinkCount})});
        status.createSpan({text:t(unknown?"@uxc.metadata-partial":"@uxc.metadata-complete",{count:unknown??0})});
      }
    }else{
      status.createSpan({text:semantic?.state==="ready"?t("@mapnav.ready",{count:semantic.mappedNoteCount??semantic.map?.nodes.length??0,total:model.nodes.length}):t(`@workbench.map-state.${semantic?.state??"idle"}`)});
      if(semantic?.reason==="too-large")status.createSpan({text:t("@workbench.cap",{count:semantic.mappedNoteCount??0,cap:semantic.supportedNoteCount})});
    }
    if(metadata){const unknown=metadata.notes.filter(note=>note.state!=="known").length;if(unknown)status.createSpan({text:t("@mapnav.tags-unknown",{count:unknown??0})});}
    if(this.data.dependencies.rules?.state==="error")status.createSpan({text:t("@rules.loadError")});
    if(!structural&&semantic?.selection){const s=semantic.selection;status.createSpan({text:t("@rules.coverage",{eligible:s.eligibleNoteCount,excluded:s.excludedNoteCount,pairs:s.excludedPairCount,unknown:s.unknownNoteCount,pending:s.unknownPairCount}),attr:{"data-rules-coverage":""}});}
    const unmapped=model.nodes.filter(node=>!node.semantic).length;
    if(!structural&&unmapped)status.createSpan({text:t("@r06.unmapped",{count:unmapped})});
    if(decisions?.state!==undefined&&decisions.state!=="ready")status.createSpan({text:t(decisions.state==="loading"?"@decision.loading":"@decision.loadError")});
    if(!model.linksCurrent)status.createSpan({text:t("@mapnav.links-stale")});
    const context=this.browser.createDiv({cls:"veynrel-map-context"});
    if(this.graph.focus){
      context.createEl("strong",{text:t("@mapnav.focus",{count:this.graph.focus.length})});
      button(context,t(this.data.scope.id==="all"?"@mapnav.all-map":"@mapnav.overview"),()=>{this.families.selected=undefined;overviewWorkbench(this.graph);this.render();},"workbench-overview");
    }
    if(this.groupPaths){context.createSpan({text:t("@mapnav.group",{count:this.groupPaths.length})});button(context,t("@mapnav.groups-back"),()=>{
      this.groupPaths=undefined;overviewWorkbench(this.graph);if(this.groupCamera)this.graph.viewport=this.groupCamera;this.groupCamera=undefined;this.render();
    },"workbench-groups-back");}
    if(this.zones.filter.length||this.query){
      context.createSpan({text:`${t("@mapnav.filter")}: ${this.query} ${t(`@mapnav.${this.zones.mode}`)} ${this.zones.filter.map(tag=>`#${tag}`).join(" · ")}`});
      button(context,t("@mapnav.clear-filter"),()=>{this.zones.filter=[];this.query="";this.render();},"workbench-clear-filter");
    }
    const needle=this.query.trim().toLocaleLowerCase();
    const isolatedPaths=coverage.isolated;
    const included=(path:string):boolean=>(!structural||!this.isolated||isolatedPaths.has(path))&&path.toLocaleLowerCase().includes(needle)&&matchesTagFilter(path,zones,this.zones.filter,this.zones.mode)&&(!this.groupPaths||this.groupPaths.includes(path));
    const visiblePaths=new Set(model.nodes.filter(node=>included(node.path)).map(node=>node.path));
    const work=this.browser.createDiv({cls:`veynrel-workbench-grid${this.showList?" is-list-open":""}`});
    const map=work.createEl("section",{cls:"veynrel-workbench-map-pane"});
    const visibleItems=this.items.filter(item=>(item.members??[item.path]).some(path=>visiblePaths.has(path))).map(item=>item.members?{...item,members:item.members.filter(path=>visiblePaths.has(path))}:item);
    const available=structural?Boolean(topology.map):semantic?.state==="ready"&&Boolean(semantic.map);
    if(available)this.stopGraph=renderWorkbenchGraph(map,graphModel,selectedPaths,this.graph,{structural,items:visibleItems,simulation:structural?this.structureSimulation:this.simulation,query:this.query,zones,activeZones:this.zones.active,zone:this.zones.selected,
      selectZone:tag=>{if(current()){this.zones.selected=tag;this.render();}},group:members=>{if(current()){
        overviewWorkbench(this.graph);this.groupCamera={...this.graph.viewport};this.groupPaths=members;this.graph.viewport={x:0,y:0,zoom:1};this.graph.fitted=false;this.render();
      }}},path=>{if(current())this.selectNote(path);},()=>{if(current())this.render();});
    if(!available){
      map.createEl("p",{text:t(structural?"@uxc.structure-empty":"@uxc.similarity-empty")});
      if(!structural)button(map,t("@uxc.setup"),()=>this.actions.settings(),"workbench-setup");
    }
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
      if(this.mode!=="notes")listPane.createEl("small",{text:t(`@workbench.state.${this.mode==="connections"?(this.data.connectionError?"error":this.data.comparison?.getSnapshot().state??"idle"):this.data.duplicateState}`)});
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
      work.setAttribute("data-detail-visible","true");
      const detail=work.createEl("section",{cls:"veynrel-workbench-selection",attr:{tabindex:"-1","data-workbench-selection":"true"}});
      const detailTools=detail.createDiv({cls:"veynrel-detail-tools"});
      button(detailTools,t("@mapnav.close"),()=>{this.showDetail=false;this.render();this.focusMap();},"workbench-detail-close");
      for(const path of selectedPaths){
        detail.createEl("h2",{text:path.split("/").pop()!.replace(/\.md$/u,"")});
        detail.createEl("p",{text:path,cls:"veynrel-workbench-path"});
        for(const family of families?.families.filter(f=>f.paths.includes(path))??[])button(detail,t("@r062.family-name",{count:family.paths.length}),()=>this.selectFamily(family),`membership-${encodeURIComponent(family.id)}`);
        const neighbors=semantic?.state==="ready"?semantic.map?.nodes.find(n=>n.path===path)?.neighbors:undefined;
        const relations=healthDetails(detail,t("@r062.relations"),`relations-${encodeURIComponent(path)}`);
        relations.createEl("p",{text:t(neighbors?"@r062.neighbor-basis":"@r062.neighbor-unknown")});
        for(const neighbor of neighbors??[])button(relations,`${neighbor.path} · ${neighbor.score.toFixed(4)}`,()=>this.selectPair({id:pairId(path,neighbor.path),paths:[path,neighbor.path].sort() as [string,string],basis:"selected"}),`neighbor-${encodeURIComponent(neighbor.path)}`);
        if(!coverage.complete)relations.createEl("p",{text:t("@uxc.relations-partial")});
        relations.createEl("p",{text:t(model.linksCurrent?"@r062.links-observed":"@mapnav.links-stale")});
        for(const direction of ["incoming","outgoing"] as const){
          const links=[...model.edges.filter(e=>e.kind==="link"),...model.external].filter(e=>direction==="incoming"?e.target===path:e.source===path);
          relations.createEl("p",{text:t(`@topology.${direction}-notes`,{n:links.length})});
          for(const edge of links.slice(0,10)){
            const other=direction==="incoming"?edge.source:edge.target;
            button(relations,`${direction==="incoming"?"←":"→"} ${other}${paths.has(other)?"":` · ${t("@r062.external")}`}`,()=>this.actions.openNote(other),`linked-${direction}-${encodeURIComponent(other)}`);
          }
          if(links.length>10)relations.createEl("small",{text:t("@topology.showing-items",{shown:10,total:links.length})});
        }
        const memberships=zones.filter(zone=>zone.members.has(path)&&zone.direct.includes(path)),chips=detail.createDiv({cls:"veynrel-memberships"});
        for(const zone of memberships){const visible=this.zones.active.includes(zone.tag);button(chips,`${visible?"":"+ "}#${zone.tag}`,()=>{
          if(!visible&&this.zones.active.length<MAX_ACTIVE_ZONES)this.zones.active.push(zone.tag);else if(!visible)this.zones.open=true;
          this.zones.selected=zone.tag;this.render();
        },`workbench-membership-${encodeURIComponent(zone.tag)}`).setAttribute("aria-pressed",String(visible));}
        const tagState=metadata?.notes.find(note=>note.path===path);
        if(!memberships.length)detail.createEl("small",{text:t(tagState?.state==="known"?"@mapnav.no-tags":`@mapnav.metadata-${tagState?.state??"unknown"}`)});
        const hidden=memberships.filter(zone=>!this.zones.active.includes(zone.tag));
        if(hidden.length)button(detail,t("@mapnav.hidden-memberships",{count:hidden.length,categories:[...new Set(hidden.map(zone=>zone.categoryName))].join(", ")}),()=>{this.zones.open=true;this.render();},`workbench-hidden-${encodeURIComponent(path)}`);
        for(const panel of ["topology","semantic-map","semantic-neighborhood"] as const)if(this.inspectors.supports(panel))button(detail,t(`@workbench.advanced.${panel}`),()=>{if(this.data.scope.id==="all")this.inspectors.open(panel,path);else this.actions.advanced(panel);},`workbench-inspect-${panel}-${encodeURIComponent(path)}`);
        button(detail,t("@consolidation.open"),()=>this.actions.openNote(path),`workbench-open-${encodeURIComponent(path)}`);
      }
      if(this.actions.notes)renderNoteActions(detail,selectedPaths,this.actions.notes,current);
      if(selectedPaths.some(path=>!visiblePaths.has(path)))detail.createEl("small",{text:t("@mapnav.outside-filter")});
      if(this.selected){
        if(decisions?.hasPaths(this.selected.paths))detail.createEl("p",{text:t("@r062b.prior-decision")});
        detail.createEl("p",{text:t(`@workbench.link.${linkFact(model,this.selected.paths)}`)});
        detail.createEl("small",{text:t(`@workbench.basis.${this.selected.basis}`)});
        button(detail,t("@workbench.compare"),()=>this.openReview(),"workbench-compare",false,true);
      }else if(this.note){
        const candidates=[...new Map([...model.connections,...model.repeats].filter(pair=>pair.paths.includes(this.note!)).map(pair=>[pair.id,pair])).values()];
        if(candidates.length){detail.createEl("h3",{text:t("@mapnav.candidates")});for(const pair of candidates.slice(0,5))button(detail,`${t("@visual.review")} · ${pair.paths.find(path=>path!==this.note)!}`,()=>this.selectPair(pair),`workbench-related-${encodeURIComponent(pair.id)}`);}
        const source=this.note;
        const rules=this.data.dependencies.rules;
        if(rules?.state==="loading")button(detail,t("@r062.load-choices"),()=>{void rules.load().catch(()=>{});},"workbench-load-choices");
        const search=(query:string):ReturnType<typeof searchPairNotes>|undefined=>{
          try{return searchPairNotes(this.data.scope.paths,source,query,this.data.captureParticipation());}catch{return;}
        };
        renderPairNoteSearch(detail,{query:this.secondQuery,changed:query=>{this.secondQuery=query;},current,search,select:path=>{
          if(this.note!==source||!this.data.scope.paths.includes(path)||path===source)return;
          try{const policy=this.data.captureParticipation();if(policy&&(policy.document(source)!=="allow"||policy.document(path)!=="allow"||policy.pair(source,path)!=="allow"))return;}catch{return;}
          const id=pairId(source,path);this.selectPair(model.repeats.find(p=>p.id===id)??model.connections.find(p=>p.id===id)??{id,paths:[source,path].sort() as [string,string],basis:"selected"});
        }});
      }
      button(detail,t("@mapnav.focus-action"),()=>{
        const box=this.browser.querySelector<SVGSVGElement>("svg[data-camera]")?.viewBox.baseVal;
        const width=box?canvasWorldWidth(box.width,box.height):undefined;
        focusWorkbench(this.graph,selectedPaths,graphModel);this.graph.viewport=fitPoints(this.items.filter(item=>this.graph.focus!.includes(item.path)),width);this.render();
      },"workbench-focus");
      button(detail,t("@mapnav.clear-selection"),()=>{this.note=undefined;this.selected=undefined;this.render();this.focusMap();},"workbench-clear-selection");
      const diagnostics=healthDetails(detail,t("@mapnav.details"),"workbench-selection-details");
      selectedPaths.forEach(path=>diagnostics.createEl("p",{text:path,cls:"veynrel-workbench-path"}));
      diagnostics.createEl("p",{text:t("@workbench.candidate-disclaimer")});
      if(this.selected?.score!==undefined)diagnostics.createEl("p",{text:String(this.selected.score)});
      for(const edge of model.external.filter(edge=>selectedPaths.includes(edge.source)||selectedPaths.includes(edge.target)))diagnostics.createEl("p",{text:`${edge.source} → ${edge.target}`});
    }
    if(!structural)renderFamilies(this.browser,families,this.families,{current,select:family=>this.selectFamily(family),note:path=>this.selectNote(path),back:()=>{
      this.families.selected=undefined;overviewWorkbench(this.graph);this.render();this.browser.querySelector<HTMLElement>('[data-health-action="workbench-families"]')?.focus();
    }});
    this.inspectors.render(this.browser);
    const footer=this.browser.createDiv({cls:"veynrel-workbench-footer"});
    if(this.actions.decisions)button(footer,t("@decision.reviewed",{count:this.pair.decisions?.list().length??0}),()=>this.actions.decisions!(),"workbench-decisions");
    button(footer,t("@safeApply.history"),()=>this.actions.history(),"workbench-history");
    const details=healthDetails(footer,t("@workbench.coverage"),"workbench-coverage");
    details.createEl("p",{text:t(structural?"@uxc.structure-grammar":"@mapnav.geometry-note")});
    details.createEl("p",{text:t("@workbench.coverage-count",{notes:model.nodes.length,indexed:semantic?.indexedNoteCount??"—",mapped:semantic?.mappedNoteCount??"—"})});
    details.createEl("pre",{text:JSON.stringify({scope:{id:this.data.scope.id,revision:this.data.scope.revision},semantic:semantic?.map?.revision,topology:this.data.dependencies.topology.getSnapshot().map?.revision,
      tags:metadata?.revision,comparisonCurrent:model.comparisonCurrent,duplicateState:this.data.duplicateState,duplicateComplete:this.data.duplicates?.complete},null,2)});
    const advanced=healthDetails(footer,t("@workbench.advanced"),"workbench-advanced");
    for(const page of ["topology","semantic-map","connection-opportunities","semantic-neighborhood"] as const)button(advanced,t(`@workbench.advanced.${page}`),()=>{if(this.data.scope.id==="all"&&this.inspectors.supports(page))this.inspectors.open(page,this.note??this.selected?.paths[0]);else this.actions.advanced(page);},`workbench-advanced-${page}`);
    button(advanced,t("@workbench.similar"),()=>this.actions.similar(),"workbench-similar");
    button(advanced,t("@polish.explore.search"),()=>{
      if(this.data.scope.id==="all")this.actions.search();else{const confirm=advanced.createDiv();confirm.createEl("p",{text:t("@workbench.search-scope")});button(confirm,t("@workspace.continue"),()=>this.actions.search(),"workbench-search-confirm");}
    },"workbench-semantic-search");
    if(key){const target=Array.from(this.browser.querySelectorAll<HTMLElement>("[data-health-action]")).find(element=>element.getAttribute("data-health-action")===key);
      target?.focus({preventScroll:true});if(selection&&target?.tagName==="INPUT"&&(target as HTMLInputElement).type==="search")(target as HTMLInputElement).setSelectionRange(selection[0],selection[1]);}
    this.scrollOwner.scrollTop=scroll;
  }
  private selectNote(path:string):void {if(!this.data.scope.paths.includes(path))return;if(this.note!==path)this.secondQuery="";this.selected=undefined;this.note=path;this.showDetail=true;this.showList=false;this.render();this.focusSelection();}
  private selectFamily(family:SemanticFamily):void {
    const current=semanticFamilies(this.data.semantic?.getSnapshot());
    if(!current?.families.includes(family))return;
    this.surface="similarity";this.families.selected=family.id;this.families.open=true;this.note=undefined;this.selected=undefined;
    this.graph.overview??={...this.graph.viewport};this.graph.focus=family.paths;
    const box=this.browser.querySelector<SVGSVGElement>("svg[data-camera]")?.viewBox.baseVal;
    this.graph.viewport=fitPoints(this.simulation.points.filter(point=>family.paths.includes(point.path)),box?canvasWorldWidth(box.width,box.height):undefined);
    this.render();this.focusMap();
  }
  private selectPair(pair:WorkbenchPair):void {this.selected=pair;this.note=undefined;this.showDetail=true;this.showList=false;this.render();this.focusSelection();}
  private focusSelection():void {
    const detail=this.browser.querySelector<HTMLElement>("[data-workbench-selection]");
    detail?.scrollIntoView({block:"start"});detail?.focus({preventScroll:true});
  }
  private focusMap():void {
    const graph=this.browser.querySelector<SVGSVGElement>(".veynrel-workbench-map > svg");
    graph?.scrollIntoView({block:"center"});graph?.focus({preventScroll:true});
  }
  private openReview():void {
    if(!this.selected||this.stopReview||this.disposed)return;
    this.pageScroll=this.scrollOwner.scrollTop;this.stopGraph?.();this.stopGraph=undefined;
    this.browser.hidden=true;this.review.hidden=false;this.review.empty();const generation=++this.generation;
    const back=healthButton(this.review,t("@workbench.back"),()=>{
      if(!this.stopReview||generation!==this.generation)return;
      this.suspend();this.suspended=false;this.render();this.scrollOwner.scrollTop=this.pageScroll;
      this.browser.querySelector<HTMLElement>('[data-health-action="workbench-compare"]')?.focus({preventScroll:true});
    },"workbench-back");
    const content=this.review.createDiv();this.stopReview=this.pair.mount(content,this.selected.paths,()=>{if(!this.disposed&&generation===this.generation){this.suspend();this.suspended=false;this.render();this.scrollOwner.scrollTop=this.pageScroll;this.browser.querySelector<HTMLElement>('[data-health-action="workbench-compare"]')?.focus({preventScroll:true});}});back.focus();this.scrollOwner.scrollTop=0;
  }
}
