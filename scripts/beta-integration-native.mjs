// Additional acceptance steps inside the existing native harness; no replacement product owners.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';

export async function archiveChain(c) {
 const {ev,wait,clickSelector:click,field,shot,closeModals,markdown,vault,root,before,checks}=c;
 const history=async()=>{
  await closeModals();await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");
  await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]:not(:disabled)')&&!plugin.safeApply.busy");
  if(!await ev("!!document.querySelector('.ai-operation-history [data-operation-id]')"))await click('.ai-operation-history [data-safe-action=refresh]');
  await wait("!!document.querySelector('.ai-operation-history [data-operation-id]')&&!plugin.safeApply.busy");
 };
 const merge=await ev('[...engine.pairReviews].at(-1).planner.view.mergePlan');
 await click('.modal [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.modal [data-merge-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+merge.canonical.path,'utf8'),merge.canonical.after);
 assert.equal(fs.readFileSync(vault+'/'+merge.secondary.path,'utf8'),merge.secondary.content);
 fs.writeFileSync(root+'/after-merge.json',JSON.stringify(markdown(vault),null,2));await shot('merge-applied');
 const parent=await ev(`await (async()=>(await plugin.safeApply.merge.journal.entries()).find(e=>e.record?.canonical.path===${JSON.stringify(merge.canonical.path)}).id)()`);
 assert.equal(typeof parent,"string");await history();await click(`[data-operation-id="${parent}"] [data-archive-action=open]`);
 await wait("document.querySelector('.ai-archive-planner [data-archive-stage]')?.dataset.archiveStage==='choosing'");
 const count=await ev("document.querySelectorAll('.ai-archive-planner [data-archive-fragment]').length");assert(count>0);
 for(let i=0;i<count;i++)await field(`[data-archive-fragment="${i}"]`,i?'retained':'represented');
 await field('[data-archive-status]','archived');await click('[data-archive-ack]');await click('[data-archive-action=build]');
 await wait("document.querySelector('.ai-archive-planner [data-archive-stage]')?.dataset.archiveStage==='ready'");
 const plan=await ev("JSON.parse(document.querySelector('[data-archive-text=json]').textContent)");
 await click('[data-archive-action=applyReview]');await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");await shot('archive-separate-review');
 await click('.ai-archive-apply [data-archive-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+plan.secondary.path,'utf8'),plan.secondary.after);
 assert.equal(fs.readFileSync(vault+'/'+plan.canonical.path,'utf8'),plan.canonical.content);
 const id=await ev(`await (async()=>(await plugin.safeApply.archive.journal.entries()).find(e=>e.record?.plan.provenance.id===${JSON.stringify(parent)}).id)()`);
 await history();assert(!await ev(`!!document.querySelector('[data-operation-id="${parent}"] [data-merge-apply-action=undoReview]')`),'active archive blocks parent Undo');await shot('archive-blocks-parent');
 await click(`[data-operation-id="${id}"] [data-archive-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-archive-apply [data-archive-apply-action=confirm]')");
 await click('.ai-archive-apply [data-archive-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-archive-apply [data-archive-apply-action=history]')");
 assert.equal(fs.readFileSync(vault+'/'+merge.secondary.path,'utf8'),merge.secondary.content);
 assert.equal(fs.readFileSync(vault+'/'+merge.canonical.path,'utf8'),merge.canonical.after);
 await history();await click(`[data-operation-id="${parent}"] [data-merge-apply-action=undoReview]`);await wait("!!document.querySelector('.ai-merge-apply [data-merge-apply-action=confirm]')");
 await click('.ai-merge-apply [data-merge-apply-action=confirm]');await wait("!plugin.safeApply.busy&&!!document.querySelector('.ai-merge-apply [data-merge-apply-action=history]')");
 assert.deepEqual(markdown(vault),before);fs.writeFileSync(root+'/after-archive-chain.json',JSON.stringify(markdown(vault),null,2));await shot('archive-parent-undone');await closeModals();
 checks.push('Real Merge → separate Archive → Archive Undo → Parent Undo restores every Markdown hash; secondary preserved until Archive; active archive blocks parent');
}

export async function swapBuild(c, next, label) {
 const {ev,wait,root,dir,vault,build}=c;
 assert.equal(await ev('app.vault.adapter.basePath'),vault);
 await ev("await app.plugins.disablePlugin('ai-knowledge-hub');void 0");
 const retained=()=>Object.fromEntries(fs.readdirSync(dir,{recursive:true}).filter(p=>!['main.js','manifest.json','styles.css'].includes(p)&&fs.statSync(dir+'/'+p).isFile()).sort().map(p=>[p,fs.readFileSync(dir+'/'+p).toString('base64')]));
 const before=retained();
 const output=execFileSync('bash',[build+'/install-knowledge-workbench.sh',vault],{encoding:'utf8',env:{...process.env,XDG_STATE_HOME:root+'/installer-state'}});
 // The generic installer is copied next to the exact build being installed.
 assert.equal(next,build);assert.deepEqual(retained(),before);
 fs.writeFileSync(root+'/upgrade-'+label+'.json',JSON.stringify({retainedFiles:Object.keys(before),output},null,2));
 await ev("await app.plugins.enablePlugin('ai-knowledge-hub');window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");
 await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.workbench");await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
}

export async function scaleChecks(c) {
 const {ev,wait,click,clickSelector,field,shot,closeModals,root,vault,before,markdown,checks,metrics,requests,sourceCommit,count}=c;
 const ready=()=>wait('!hv.workbench.data.busy&&!hv.workbench.facts?.running&&!hv.workbench.facts?.dirty.size');
 const start=performance.now();await click('review-connections');await click('review-refresh');await ready();metrics.connectionsMs=performance.now()-start;
 const state=await ev('hv.workbench.data.semantic?.getSnapshot()');
 assert.equal(await ev('hv.areaIndex.snapshot.paths.length'),count);
 if(count>500){
  assert.equal(state.reason,'too-large');assert(!state.map);await shot('1000-cap');
  const rules=await ev("await hv.workbench.data.dependencies.rules.add('exclude',{kind:'tag',value:'synthetic'}).then(()=>true)");assert(rules);
  await click('review-refresh');await ready();assert.equal(await ev('hv.workbench.data.semantic.getSnapshot().reason'),'too-large');
  // Select a real folder from the full inventory, never silently slice the first 500.
  const folder=await ev("[...document.querySelector('[data-health-action=scope-picker]').options].map(o=>o.value).find(p=>p&&hv.areaIndex.snapshot.paths.filter(f=>f.startsWith(p+'/')).length>=20&&hv.areaIndex.snapshot.paths.filter(f=>f.startsWith(p+'/')).length<=500)");assert(folder);
  await field('[data-health-action=scope-picker]',folder);await click('review-refresh');await ready();
  assert.equal(await ev('hv.workbench.data.semantic.getSnapshot().state'),'ready');
  metrics.scoped=await ev('({paths:hv.workbench.data.scope.paths.length,mapped:hv.workbench.data.semantic.getSnapshot().mappedNoteCount})');await shot('1000-explicit-folder');
 }else if(count) {assert.equal(state.state,'ready');assert.equal(state.mappedNoteCount,count);}
 else assert(!state?.map?.nodes.length);
 if(count===154){
  const began=performance.now();await clickSelector('[data-pair-id]');await wait("document.querySelectorAll('.ai-pair-note').length===2");metrics.pairOpenMs=performance.now()-began;await click('review-back');await ready();
 }
 metrics.semantic={state:state?.state,reason:state?.reason,mapped:state?.mappedNoteCount,supported:state?.supportedNoteCount};await shot('scale-list');
 // Inspect actual owners after repeated destruction, not just a DOM-node count.
 const owners=[];
 for(let i=0;i<4;i++){
  await ev('window.previousWorkbench=hv.workbench;hv.leaf.detach();void 0');await wait('previousWorkbench.disposed');
  owners.push(await ev('({disposed:previousWorkbench.disposed,dataDisposed:previousWorkbench.data.disposed,listeners:previousWorkbench.data.listeners.size,factsDisposed:previousWorkbench.facts?.disposed,semanticDisposed:previousWorkbench.data.semantic?.disposed})'));
  await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.workbench");await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");await ready();
 }
 assert(owners.every(o=>o.disposed&&o.dataDisposed&&o.listeners===0&&o.factsDisposed&&o.semanticDisposed!==false),JSON.stringify(owners));metrics.disposedOwners=owners;
 if(count===154){
  await ev('hv.workbenchHost.create=realHostCreate;void 0');await click('review-map');await wait('!!hv.workbench.map');await shot('secondary-map');
  await ev('window.previousMap=hv.workbench.map;void 0');await click('nav-home');
  assert(await ev('previousMap.data.disposed'));await click('nav-discover');await ready();assert(await ev('!hv.workbench.map&&!hv.workbench.data.semantic'));
  for(const page of ['health','recall','tools','settings']){
   await click('nav-'+page);await wait(`hv.route.page==='${page}'`);await shot('smoke-'+page);
  }
  await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");await wait("!!document.querySelector('.ai-operation-history')");await closeModals();
  const ids=await ev("Object.keys(app.commands.commands).filter(k=>k.startsWith('ai-knowledge-hub:')&&/search|batch|vault-audit/.test(k))");metrics.commands=ids;
  for(const id of ids.filter(k=>k.endsWith(':ai-batch-process')||k.endsWith(':ai-deep-vault-audit')||k.endsWith(':ai-semantic-search'))){await ev(`app.commands.executeCommandById(${JSON.stringify(id)});void 0`);await shot('tool-'+id.split(':')[1]);await closeModals();}
 }
 assert.deepEqual(markdown(vault),before);assert.equal(requests.length,0);
 checks.push('Full inventory; explicit calculation and cap; repeated view disposal; no Markdown changes or HTTP');
 fs.writeFileSync(root+'/report.json',JSON.stringify({sourceCommit,count,checks,metrics,httpRequests:requests.length,originalMarkdown:before,finalMarkdown:markdown(vault)},null,2));
 console.log(JSON.stringify({status:'PASS',count,root}));
}

export async function stateChecks(c) {
 const {ev,wait,click,clickSelector,openPair,root,dir,vault,before,markdown,requests,shot,sourceCommit}=c;
 const restart=async()=>{
  await ev("await app.plugins.enablePlugin('ai-knowledge-hub');window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");
  await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.workbench");await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
 };
 const stop=()=>ev("await app.plugins.disablePlugin('ai-knowledge-hub');void 0");
 await openPair('Cache');await wait("!!document.querySelector('[data-review-keep]:not(:disabled)')");await clickSelector('[data-review-keep]');await wait("!!document.querySelector('[data-review-decision-saved]')");
 await ev("await hv.workbench.data.dependencies.rules.add('within',{kind:'tag',value:'synthetic'});void 0");
 const names=['connection-rules.json','review-decisions.json'],saved=Object.fromEntries(names.map(n=>[n,fs.readFileSync(dir+'/'+n)])),checks=[];
 for(const name of names)for(const kind of ['empty','corrupt','unsupported','unreadable','backup']){
  await stop();for(const n of names){fs.writeFileSync(dir+'/'+n,saved[n]);fs.writeFileSync(dir+'/'+n+'.bak',saved[n]);}
  const file=dir+'/'+name;
  if(kind==='backup'){fs.unlinkSync(file);fs.writeFileSync(file+'.tmp','incomplete staging, never authoritative');}
  else if(kind==='unreadable')fs.chmodSync(file,0o000);
  else fs.writeFileSync(file,kind==='empty'?'':kind==='corrupt'?'{truncated':'{"version":999}');
  const bad=kind==='unreadable'||kind==='backup'?null:fs.readFileSync(file,'utf8');await restart();
  await wait("hv.workbench.data.dependencies.rules.state!=='loading'");
  const rules=name==='connection-rules.json';
  if(kind==='backup'){
   assert.equal(await ev(rules?'hv.workbench.data.dependencies.rules.list().length':'hv.workbench.pair.decisions.list().length'),1);
   assert(!fs.existsSync(file),'backup load does not silently rewrite primary');
  }else{
   if(rules){assert.equal(await ev('hv.workbench.data.dependencies.rules.state'),'error');await click('review-connections');await click('review-refresh');await wait('!hv.workbench.data.busy');assert(await ev('hv.workbench.data.connectionError'));}
   else {await click('review-refresh');await wait('!hv.workbench.data.busy&&!hv.workbench.facts.running&&!hv.workbench.facts.dirty.size');assert.equal(await ev('hv.workbench.pair.decisions.list().length'),0);assert(await ev("!!document.querySelector('[data-pair-id]')"));}
   if(bad!==null)assert.equal(fs.readFileSync(file,'utf8'),bad);
  }
  await shot('state-'+name.split('.')[0]+'-'+kind);await stop();if(kind==='unreadable')fs.chmodSync(file,0o600);for(const n of names)fs.writeFileSync(dir+'/'+n,saved[n]);await restart();
  checks.push({name,kind,safe:true});
 }
 assert.deepEqual(markdown(vault),before);assert.equal(requests.length,0);
 fs.writeFileSync(root+'/report.json',JSON.stringify({sourceCommit,status:'PASS',checks,httpRequests:0,markdownUnchanged:true,limits:'Offline state corruption while stopped, not concurrent-process or Sync acceptance. Fixture state is explicitly restored between fault cases; Markdown is never restored by the harness.'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
}
