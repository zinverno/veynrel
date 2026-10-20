import fs from 'node:fs';
import assert from 'node:assert/strict';
export async function labNativeScenario(c) {
  const {ev,wait,cdp,shot,pass,focusMain,restart,close,manifest,report,suite}=c;
  const click=selector=>ev(`{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Unavailable control: '+${JSON.stringify(selector)});e.click();}void 0`);
  const field=(key,value,event='change')=>ev(`{const e=document.querySelector('[data-planner-field="${key}"]');if(!e)throw Error('Missing field: ${key}');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('${event}'));}void 0`);
  const health=async()=>{await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');void 0");await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-discover]')");await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");};
  const history=async()=>{await close();await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await wait('!plugin.safeApply.busy');await ev("app.commands.executeCommandById('ai-knowledge-hub:consolidation-operation-history');void 0");await wait("!!document.querySelector('.ai-operation-history [data-safe-action=refresh]:not(:disabled)')&&!plugin.safeApply.busy");};
  const locale=async language=>{
    await close();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');await focusMain();
  };
  const installResponse=async scenario=>ev(`Object.assign(plugin.settings,{provider:'custom',model:'offline-lab-control',apiKey:'synthetic-only-not-a-key',baseUrl:'https://example.invalid/v1'});
    window.labFactory??=engine.relationshipSession;engine.relationshipSession=paths=>{const s=labFactory(paths);s.deps.complete=async()=>{io.model++;return JSON.stringify(${JSON.stringify(scenario.response)})};return s;};void 0`);
  const pair=async scenario=>{await close();await focusMain();await installResponse(scenario);await ev(`engine.inspectPair({leftPath:${JSON.stringify(scenario.paths[0])},rightPath:${JSON.stringify(scenario.paths[1])}});void 0`);await wait("document.querySelectorAll('.ai-pair-note').length===2&&document.querySelector('.ai-pair-status')?.dataset.state==='ready'");};
  const planner=async scenario=>{await pair(scenario);await click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");await click('[data-relationship-action=confirm]');await wait("!!document.querySelector('[data-planner-action=open]')");await click('[data-planner-action=open]');await wait("document.querySelector('[data-planner-stage]')?.dataset.plannerStage==='choosing'");await ev('window.labPlanner=[...engine.pairInspectors].at(-1).planner;void 0');};
  await health();await pass('Native initialization sees all 1000 files and cached metadata','app.vault.getMarkdownFiles().length===1000');
  let t=performance.now();await click('[data-health-action=scan]');await wait('!hv.controller.getState().busy&&!!hv.controller.getState().outcome');report.measurements.healthScanMs=performance.now()-t;
  report.health=await ev('({outcome:hv.controller.getState().outcome,snapshot:hv.controller.getState().snapshot})');
  await pass('Health scan completed without a provider request','!hv.controller.getState().error&&io.network===0');await shot('health');
  await click('[data-health-action=nav-findings]');await pass('Findings navigation rendered','hv.contentEl.textContent.length>100');await shot('findings');
  t=performance.now();await click('[data-health-action=nav-discover]');await ev('engine.refreshSemanticStatus();void 0');await wait("!!hv.contentEl.querySelector('[data-health-action=discover-duplicates]')");report.measurements.discoverMs=performance.now()-t;
  t=performance.now();await history();report.measurements.historyOpenMs=performance.now()-t;await shot('history-initial');await close();
  const single=manifest.scenarios.find(s=>s.id==='single');
  if(suite!=='actions')for(const language of ['en','ru']) {
    await locale(language);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1650,390]) {
      const label=`${language}-${theme}-${width}`;
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:920,deviceScaleFactor:1,mobile:false});await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
      await close();await health();await click('[data-health-action=nav-discover]');await click('[data-health-action=discover-duplicates]');await wait("!!document.querySelector('.ai-semantic-duplicate-card')");
      await pass(label+' duplicates outer width and wrapped actions',`(()=>{const e=document.querySelector('.ai-semantic-duplicates-modal'),r=e.getBoundingClientRect();return r.width<=${width}&&${width===1650?'r.width>=900':'r.width<=390'}&&getComputedStyle(e.querySelector('.ai-consolidation-actions')).gap==='12px'&&e.scrollWidth<=e.clientWidth+1})()`);
      await shot('duplicates-'+label);
      await click('.ai-semantic-duplicate-card .ai-consolidation-actions button:last-child');await wait("document.querySelectorAll('.ai-pair-note').length===2");
      await pass(label+' compact Inspector and closed metadata',"(()=>{const e=document.querySelector('.ai-pair-inspector');return e.scrollWidth<=e.clientWidth+1&&[...e.querySelectorAll('details')].every(d=>!d.open)&&!/@ux\.|@consolidation\./.test(e.textContent)})()");await shot('inspector-'+label);
      await pair(single);const before=await ev('io.model');await click('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
      await pass(label+' consent is local with closed exact JSON',`io.model===${before}&&[...document.querySelectorAll('.ai-relationship details')].every(e=>!e.open)&&document.querySelector('.ai-relationship pre').textContent===[...engine.pairInspectors].at(-1).relationship.view.consent.body`);
      await pass(label+' confirmation visible without JSON scrolling',"(()=>{const b=document.querySelector('[data-relationship-action=confirm]').getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight})()");await shot('consent-'+label);
      await ev("document.querySelector('.ai-relationship summary').focus();void 0");for(const type of ['keyDown','keyUp'])await cdp('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',...(type==='keyDown'?{text:'\r'}:{})});
      await pass(label+' keyboard opens exact payload without sending',`document.querySelector('.ai-relationship details').open&&io.model===${before}`);
      await click('[data-relationship-action=cancel]');await pass(label+' cancel keeps provider untouched',`io.model===${before}&&document.querySelector('[data-relationship-stage]').dataset.relationshipStage==='cancelled'`);
    }
  }
  await cdp('Emulation.clearDeviceMetricsOverride');await close();await focusMain();
  const long=manifest.notes.filter(n=>n.form==='long').slice(0,2).map(n=>n.path);
  t=performance.now();await ev(`engine.inspectPair({leftPath:${JSON.stringify(long[0])},rightPath:${JSON.stringify(long[1])}});void 0`);await wait("document.querySelectorAll('.ai-pair-note').length===2");report.measurements.longInspectorMs=performance.now()-t;
  await ev("document.querySelectorAll('.ai-pair-note > details').forEach(e=>e.open=true);void 0");await pass('Long Markdown previews remain bounded and keyboard scrollable',"[...document.querySelectorAll('.ai-pair-source')].every(e=>e.scrollWidth<=e.clientWidth+1&&e.getAttribute('tabindex')==='0')");await shot('long-inspector');
  t=performance.now();await ev(`for(let i=0;i<50;i++)app.metadataCache.trigger('resolved');void 0`);report.measurements.metadataBurstMs=performance.now()-t;
  await pass('50 MetadataCache events invalidate Inspector without an automatic model call',"document.querySelector('.ai-pair-status').dataset.state==='stale'&&io.network===0");
  await close();await focusMain();
  if(suite!=='actions') {
    await ev('window.labPopout=app.workspace.openPopoutLeaf({width:1000,height:800});void 0');
    await wait('labPopout.view.containerEl.ownerDocument!==document&&!!labPopout.view.containerEl.ownerDocument.defaultView');
    await ev('window.labPopoutWindow=labPopout.view.containerEl.ownerDocument.defaultView;labPopoutWindow.focus();void 0');
    await wait('activeWindow===labPopoutWindow');
    await ev(`engine.inspectPair({leftPath:${JSON.stringify(long[0])},rightPath:${JSON.stringify(long[1])}});void 0`);
    await wait("!!labPopoutWindow.document.querySelector('.ai-pair-inspector .ai-pair-note')");
    await pass('Real native popout owns the Inspector and preserves keyboard controls',"(()=>{const e=labPopoutWindow.document.querySelector('.ai-pair-inspector');return e.ownerDocument!==document&&e.scrollWidth<=e.clientWidth+1&&!!e.querySelector('button')})()");
    const main=(await cdp('Target.getTargetInfo')).targetInfo.targetId;
    const targets=(await(await fetch('http://127.0.0.1:'+c.port+'/json/list')).json()).filter(t=>t.type==='page'&&t.id!==main);
    let captured=0;
    for(const target of targets) {
      const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let id=0;
      const send=(method,params)=>new Promise((resolve,reject)=>{const request=++id;ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===request)m.error?reject(m.error):resolve(m.result);};ws.send(JSON.stringify({id:request,method,params}));});
      try {const found=await send('Runtime.evaluate',{expression:"!!document.querySelector('.ai-pair-inspector')",returnByValue:true});if(found.result.value){const result=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(c.root+'/popout.png',Buffer.from(result.data,'base64'));captured++;}}finally{ws.close();}
    }
    assert.equal(captured,1,'Exactly one owned Inspector popout captured');
    await ev('for(const inspector of engine.pairInspectors)inspector.close();labPopout.detach();void 0');await focusMain();
    await pair(single);const calls=await ev('io.model');
    t=performance.now();
    report.metadataChanges=await ev(`(async()=>{
      const file=app.vault.getFileByPath(${JSON.stringify(single.paths[0])}),before=await app.vault.read(file);let last=before,changed=0;
      const ref=app.metadataCache.on('changed',f=>{if(f===file)changed++});
      try {for(let i=0;i<20;i++){const n=changed;last=before+'\\n<!-- synthetic metadata churn '+i+' -->\\n';await app.vault.modify(file,last);for(let j=0;j<200&&changed===n;j++)await new Promise(r=>setTimeout(r,10));if(changed===n)throw Error('Native cache event missing');}}
      finally {app.metadataCache.offref(ref);if(await app.vault.read(file)!==last)throw Error('Fixture changed outside harness; no cleanup write');await app.vault.modify(file,before);}
      return {writes:20,changedEvents:changed,cleanup:'Explicit fixture cleanup; not Apply/Undo recovery'};
    })()`);
    report.measurements.metadata20WritesMs=performance.now()-t;
    await pass('20 real Vault modifications invalidate Inspector without provider calls',`document.querySelector('.ai-pair-status').dataset.state==='stale'&&io.model===${calls}&&io.network===0`);
    await close();await focusMain();
  }
  if(suite==='actions'||suite==='all'){const {labActions}=await import('./native-actions.mjs');await labActions({...c,click,field,pair,planner,history,locale});}
  await restart();await history();await pass('History opens after native process restart','!!document.querySelector(".ai-operation-history")&&app.vault.getMarkdownFiles().length===1000');await shot('history-restarted');
  report.measurements.finalRendererMemory=await ev('process.memoryUsage()');
  await close();
}
