// Read-only author-review stage in native Obsidian. No verdicts or Markdown actions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './connection-case-study-native.mjs';
import { adapters,json,sha,summarize,repository,corpus,cachedVectors,inputs,cohort,model,baseUrl } from './connection-case-study-ru.mjs';
export async function run(endpoint,root) {
  assert(/^\/tmp\/[a-zA-Z0-9_-]+$/.test(root)); assert(!fs.existsSync(root+'/native.json'));
  const a=await adapters(), expected=json(root+'/offline.json'), all=json(root+'/snapshots.json'), vault=root+'/vault';
  const docs=corpus(), {chunks}=await inputs(), {cache}=cachedVectors(chunks);
  const hashes=()=>Object.fromEntries(docs.map(d=>[d.path,sha(fs.readFileSync(vault+'/'+d.path))]));
  assert.deepEqual(hashes(),expected.corpusSha256);
  const settings=json(vault+'/.obsidian/plugins/ai-knowledge-hub/data.json');
  assert.equal(settings.semantic.embeddingBaseUrl,baseUrl);assert.equal(settings.semantic.embeddingModel,model);
  assert(!settings.apiKey&&!settings.semantic.openRouterApiKey&&!settings.semantic.openAICompatibleApiKey);
  const requests=[],rejected=[];
  const server=http.createServer(async(req,res)=>{
    try {assert(req.method==='POST'&&req.url==='/v1/embeddings'&&!req.headers.authorization);
      let bytes='';for await(const b of req){bytes+=b;assert(bytes.length<=100000);}
      const body=JSON.parse(bytes);assert(body.model===model&&Array.isArray(body.input)&&body.input.length>0&&body.input.every(t=>cache.has(t)));
      requests.push(body.input.map(sha));res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({model,data:body.input.map((t,index)=>({index,embedding:Array.from(cache.get(t))}))}));
    }catch{rejected.push('unplanned request');res.writeHead(400);res.end('No uncached inputs or remote fallback');}
  });
  const n=await connect(endpoint),{ev,send,wait}=n;
  const report={source:'Native Obsidian, Russian synthetic corpus, newly computed local MiniLM vectors',checks:[],screenshots:[],humanReview:'Not collected; no verdict controls used',action:'Not performed; waiting for author'};
  const check=(label,value)=>{assert(value,label);report.checks.push(label);};
  const click=action=>ev(`(()=>{const e=hv.contentEl.querySelector('[data-health-action=${JSON.stringify(action)}]');if(!e)throw Error('Missing action');e.click()})()`);
  const capture=async(file,purpose)=>{
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:1550,y:1000});
    await wait('!document.querySelector(".notice-container .notice, .tooltip")');
    await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const privacy=await ev(`(()=>{const t=document.body.innerText;return {password:[...document.querySelectorAll('input[type=password]')].some(e=>e.value),suspect:/sk-or-|sk-proj-|ghp_|-----BEGIN.*PRIVATE KEY|Bearer\\s+[A-Za-z0-9]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(t)}})()`);
    assert(!privacy.password&&!privacy.suspect);
    const bytes=Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64');
    fs.mkdirSync(root+'/assets',{recursive:true});fs.writeFileSync(root+'/assets/'+file,bytes,{flag:'wx'});
    report.screenshots.push({file,purpose,sha256:sha(bytes),viewport:{width:1600,height:1100},capture:'Native Electron CDP',masks:[],hidden:[],privacy,visualReview:'required'});
  };
  try {
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(19643,'127.0.0.1',resolve)});
    await wait('Boolean(window.app?.workspace)');assert.equal(await ev('app.vault.adapter.getBasePath()'),vault);
    await ev(`(()=>{const b=[...document.querySelectorAll('.modal button')].find(b=>b.textContent==='Trust author and enable plugins');if(b)b.click()})()`);
    await wait("Boolean(app.commands.commands['ai-knowledge-hub:veynrel-open-health'])");
    await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
    report.environment=await ev('({electron:process.versions.electron,platform:process.platform,userAgent:navigator.userAgent,plugin:app.plugins.plugins["ai-knowledge-hub"].manifest.version})');
    report.artifactSha256=sha(fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/main.js'));
    assert.equal(report.artifactSha256,sha(fs.readFileSync(repository+'main.js')));
    await ev(`(async()=>{window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;await engine.refreshSemanticStatus();app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')})()`);
    await wait("Boolean(app.workspace.getLeavesOfType('veynrel-health')[0]?.view.body)");
    await ev(`(async()=>{window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;await hv.controller.getHealthService();window.cp=hv.comparison;window.gp=hv.globalMap;window.tp=hv.topology;
      app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();window.caseIO={embed:0,read:0,cachedRead:0,write:0};window.caseRestores=[];
      const wrap=(o,k,c)=>{const old=o[k];o[k]=function(...args){caseIO[c]++;return old.apply(this,args)};caseRestores.push(()=>o[k]=old)};
      wrap(engine.runtimeSlot.runtime.components.searchService.provider,'embed','embed');wrap(app.vault,'read','read');wrap(app.vault,'cachedRead','cachedRead');
      const old=app.vault.adapter.write;app.vault.adapter.write=function(p,...args){if(p.endsWith('.md'))caseIO.write++;return old.call(this,p,...args)};caseRestores.push(()=>app.vault.adapter.write=old);
    })()`);
    await click('nav-discover');check('passive Discover leaves owners idle',await ev("gp.getSnapshot().state==='idle'&&cp.getSnapshot().state==='idle'"));
    await click('global-map-open');await ev('gp.load()');await wait("gp.getSnapshot().state==='ready'&&!gp.getSnapshot().busy");
    check('40 notes in native Global Map',await ev('gp.getSnapshot().map.nodes.length===40'));
    await capture('01-russian-map.png','Russian map with 40 notes, before any link action');
    await click('global-map-back');await click('connections-open');await ev('cp.load()');await wait("cp.getSnapshot().state==='ready'");
    const comparison=await ev('cp.getSnapshot().comparison');report.counts=summarize(comparison);report.cohort=cohort(comparison,a);
    assert.deepEqual(report.counts,expected.counts);assert.deepEqual(comparison.pairs,all.comparison.pairs);assert.deepEqual(report.cohort,expected.cohort);
    check('all native pairs, ranks, shared neighbors and counts match offline',true);
    report.topologyEdges=await ev('tp.getSnapshot().map.edges');
    for(const category of ['aligned','explicit-only','candidate']) {
      await click('connections-'+category);
      check('category '+category,await ev(`hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]').length===${Math.min(50,comparison.pairs.filter(p=>p.category===category).length)}`));
    }
    for(const rank of ['mutual-top-3','mutual-top-5','one-sided-top-5']) {
      await click('connections-rank-'+rank);
      check('rank filter '+rank,await ev(`hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]').length===${Math.min(50,expected.counts.ranks[rank])}`));
    }
    await click('connections-rank-mutual-top-3');
    const first=report.cohort[0];assert(first);
    const query=first.leftPath.slice(0,3);
    await ev(`(()=>{const input=hv.contentEl.querySelector('[data-health-action="connections-search"]');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input'))})()`);
    const matching=report.cohort.filter(p=>p.leftPath.includes(query)||p.rightPath.includes(query));
    check('search filters selected path prefix',await ev(`[...hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]')].every(e=>e.innerText.includes(${JSON.stringify(query)}))`)&&matching.length>0);
    await ev(`(()=>{const input=hv.contentEl.querySelector('[data-health-action="connections-search"]');input.value='';input.dispatchEvent(new Event('input'));const box=hv.contentEl.querySelector('[data-health-action="connections-hide-excalidraw"]');box.checked=true;box.dispatchEvent(new Event('change'))})()`);
    check('Excalidraw filter preserves this corpus',await ev(`hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]').length===${Math.min(50,expected.counts.ranks['mutual-top-3'])}`));
    await ev(`(()=>{const box=hv.contentEl.querySelector('[data-health-action="connections-hide-excalidraw"]');box.checked=false;box.dispatchEvent(new Event('change'))})()`);
    await click('connections-pair-0');report.inspectorText=await ev('hv.contentEl.querySelector(".veynrel-connections-inspector").innerText');
    await capture('02-russian-candidate.png','First frozen Candidate, ranks, similarity and shared neighbors; unreviewed');
    report.passiveIO=await ev('({...caseIO})');assert.deepEqual(report.passiveIO,{embed:0,read:0,cachedRead:0,write:0});
    check('passive map/comparison: zero body reads, provider calls and Markdown writes',true);
    const missing=expected.missingMetadata.path;
    await ev(`window.caseOriginalMetadata=app.metadataCache.getFileCache;app.metadataCache.getFileCache=function(f){return f.path===${JSON.stringify(missing)}?null:caseOriginalMetadata.call(this,f)}`);
    await ev('cp.refresh()');const partial=await ev('cp.getSnapshot().comparison');report.injectedMissingMetadata={path:missing,counts:summarize(partial)};
    assert.deepEqual(report.injectedMissingMetadata,expected.missingMetadata);check('missing metadata remains unclassified',!partial.pairs.some(p=>[p.leftPath,p.rightPath].includes(missing)));
    await ev('app.metadataCache.getFileCache=caseOriginalMetadata;delete window.caseOriginalMetadata');await ev('cp.refresh()');
    assert.deepEqual(summarize(await ev('cp.getSnapshot().comparison')),expected.counts);check('metadata restoration restores counts',true);
    await click('connections-pair-0');await click('connections-open-pair');
    await wait(`app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path===${JSON.stringify(first.rightPath)})`);
    report.openedNotes=await ev('app.workspace.getLeavesOfType("markdown").map(l=>l.view.file?.path)');
    check('both notes opened for reading', [first.leftPath,first.rightPath].every(p=>report.openedNotes.includes(p)));
    check('no human verdict assigned',await ev('hv.comparisonView.reviewByPairId.size===0'));
    assert.deepEqual(hashes(),expected.corpusSha256);check('all 40 Markdown files unchanged',true);
    report.localReplayRequests=requests;report.rejectedLocalRequests=rejected;assert.equal(rejected.length,0);
    fs.writeFileSync(root+'/native.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({counts:report.counts,checks:report.checks.length,screenshots:report.screenshots.length}));
  } finally {
    await ev('if(window.caseOriginalMetadata)app.metadataCache.getFileCache=caseOriginalMetadata;window.caseRestores?.reverse().forEach(f=>f())').catch(()=>{});
    if(server.listening)await new Promise(resolve=>server.close(resolve));n.close();
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run(process.argv[2],process.argv[3]);
