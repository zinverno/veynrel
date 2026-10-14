// Native research only. The optional RU02 action writes one link in a disposable copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './connection-case-study-native.mjs';
import { adapters,json,sha,summarize,repository,corpus,cachedVectors,inputs,cohort,model,baseUrl } from './connection-case-study-ru.mjs';
export async function run(endpoint,root,action) {
  assert(action===undefined||action==='--action-ru02','Only the explicit RU02 action is supported');
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
  const report={source:'Native Obsidian, Russian synthetic corpus, newly computed local MiniLM vectors',checks:[],screenshots:[],humanReview:'No verdict controls used; author opinions are outside this technical recording',action:'Not performed'};
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
    await capture(action?'01-ru02-initial-map.png':'01-russian-map.png','Russian map with 40 notes, before any link action');
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
    const selectedIndex=action?1:0, first=report.cohort[selectedIndex];assert(first);
    if(action)assert(first.leftPath.startsWith('007 -')&&first.rightPath.startsWith('008 -'));
    const query=first.leftPath.slice(0,3);
    await ev(`(()=>{const input=hv.contentEl.querySelector('[data-health-action="connections-search"]');input.value=${JSON.stringify(query)};input.dispatchEvent(new Event('input'))})()`);
    const matching=report.cohort.filter(p=>p.leftPath.includes(query)||p.rightPath.includes(query));
    check('search filters selected path prefix',await ev(`[...hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]')].every(e=>e.innerText.includes(${JSON.stringify(query)}))`)&&matching.length>0);
    await ev(`(()=>{const input=hv.contentEl.querySelector('[data-health-action="connections-search"]');input.value='';input.dispatchEvent(new Event('input'));const box=hv.contentEl.querySelector('[data-health-action="connections-hide-excalidraw"]');box.checked=true;box.dispatchEvent(new Event('change'))})()`);
    check('Excalidraw filter preserves this corpus',await ev(`hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]').length===${Math.min(50,expected.counts.ranks['mutual-top-3'])}`));
    await ev(`(()=>{const box=hv.contentEl.querySelector('[data-health-action="connections-hide-excalidraw"]');box.checked=false;box.dispatchEvent(new Event('change'))})()`);
    await click('connections-pair-'+selectedIndex);report.inspectorText=await ev('hv.contentEl.querySelector(".veynrel-connections-inspector").innerText');
    await capture(action?'02-ru02-before.png':'02-russian-candidate.png',action?'RU02 before the link: Candidate, ranks and shared neighbors':'First frozen Candidate, ranks, similarity and shared neighbors; unreviewed');
    report.passiveIO=await ev('({...caseIO})');assert.deepEqual(report.passiveIO,{embed:0,read:0,cachedRead:0,write:0});
    check('passive map/comparison: zero body reads, provider calls and Markdown writes',true);
    const missing=expected.missingMetadata.path;
    await ev(`window.caseOriginalMetadata=app.metadataCache.getFileCache;app.metadataCache.getFileCache=function(f){return f.path===${JSON.stringify(missing)}?null:caseOriginalMetadata.call(this,f)}`);
    await ev('cp.refresh()');const partial=await ev('cp.getSnapshot().comparison');report.injectedMissingMetadata={path:missing,counts:summarize(partial)};
    assert.deepEqual(report.injectedMissingMetadata,expected.missingMetadata);check('missing metadata remains unclassified',!partial.pairs.some(p=>[p.leftPath,p.rightPath].includes(missing)));
    await ev('app.metadataCache.getFileCache=caseOriginalMetadata;delete window.caseOriginalMetadata');await ev('cp.refresh()');
    assert.deepEqual(summarize(await ev('cp.getSnapshot().comparison')),expected.counts);check('metadata restoration restores counts',true);
    await click('connections-pair-'+selectedIndex);await click('connections-open-pair');
    await wait(`app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path===${JSON.stringify(first.rightPath)})`);
    report.openedNotes=await ev('app.workspace.getLeavesOfType("markdown").map(l=>l.view.file?.path)');
    check('both notes opened for reading', [first.leftPath,first.rightPath].every(p=>report.openedNotes.includes(p)));
    check('no human verdict assigned',await ev('hv.comparisonView.reviewByPairId.size===0'));
    assert.deepEqual(hashes(),expected.corpusSha256);check('all 40 Markdown files unchanged',true);
    if(action) {
      const target=first.rightPath.slice(0,-3), beforeText=fs.readFileSync(vault+'/'+first.leftPath,'utf8');
      assert.equal(first.category,'candidate');
      report.beforeComparison=comparison;
      report.beforeSemantic=await ev('gp.getSnapshot().map');
      report.beforeIndex=await ev('engine.runtimeSlot.runtime.components.indexingService.getStats()');
      // Only investigator action uses native editing. Connection Opportunities never writes links.
      await ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${JSON.stringify(first.leftPath)}),fm=>{if(fm.related!==undefined)throw Error('Unexpected existing related');fm.related=[${JSON.stringify('[['+target+']]')}];})`);
      await wait(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${JSON.stringify(first.leftPath)}))?.frontmatterLinks?.some(l=>l.link===${JSON.stringify(target)})`);
      await wait(`app.metadataCache.resolvedLinks[${JSON.stringify(first.leftPath)}]?.[${JSON.stringify(first.rightPath)}]===1`);
      report.nativeMetadata=await ev(`({frontmatter:app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${JSON.stringify(first.leftPath)})).frontmatterLinks,resolved:app.metadataCache.resolvedLinks[${JSON.stringify(first.leftPath)}]})`);
      check('native MetadataCache resolves exactly one new directed link',Object.keys(report.nativeMetadata.resolved).length===1);
      report.afterMarkdown=fs.readFileSync(vault+'/'+first.leftPath,'utf8');
      const beforeChunks=new a.MarkdownChunker().chunk({path:first.leftPath,content:beforeText});
      const afterChunks=new a.MarkdownChunker().chunk({path:first.leftPath,content:report.afterMarkdown});
      assert.deepEqual(afterChunks.map(c=>c.text),beforeChunks.map(c=>c.text));
      report.chunkComparison={before:beforeChunks.map(c=>({sha256:sha(c.text),source:c.source})),after:afterChunks.map(c=>({sha256:sha(c.text),source:c.source}))};
      check('indexed text unchanged; current Russian vectors remain valid',true);
      await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===${JSON.stringify(first.leftPath)}),{focus:true})`);
      await ev('engine.indexCurrentNote()');
      await ev('cp.refresh()');await wait("cp.getSnapshot().state==='ready'");
      const after=await ev('cp.getSnapshot().comparison');report.after=summarize(after);report.afterComparison=after;
      report.afterSemantic=await ev('gp.getSnapshot().map');
      report.afterIndex=await ev('engine.runtimeSlot.runtime.components.indexingService.getStats()');
      report.afterTopologyEdges=await ev('tp.getSnapshot().map.edges');
      report.topologyDelta={added:report.afterTopologyEdges.filter(e=>!report.topologyEdges.some(b=>JSON.stringify(b)===JSON.stringify(e))),removed:report.topologyEdges.filter(e=>!report.afterTopologyEdges.some(b=>JSON.stringify(b)===JSON.stringify(e)))};
      assert.equal(report.topologyDelta.added.length,1);assert.equal(report.topologyDelta.removed.length,0);
      check('topology adds one edge and removes none',true);
      report.action={id:'RU02',method:'Investigator via native processFrontMatter',from:first.leftPath,to:first.rightPath,before:first,after:after.pairs.find(p=>p.id===first.id)};
      check('RU02 becomes Aligned, left-to-right',report.action.after.category==='aligned'&&report.action.after.markdown.direction==='left-to-right');
      assert.deepEqual(report.action.after.semantic,first.semantic);
      assert.deepEqual(after.pairs.filter(p=>p.id!==first.id),comparison.pairs.filter(p=>p.id!==first.id));
      check('other 148 classified pairs remain identical',true);
      assert.deepEqual(report.afterSemantic.nodes,report.beforeSemantic.nodes);
      assert.deepEqual(report.afterSemantic.edges,report.beforeSemantic.edges);
      check('semantic nodes and edges remain identical',true);
      assert.equal(after.candidateCount,142);assert.equal(after.alignedCount,6);assert.equal(after.explicitOnlyCount,1);
      check('measured counts are 142 Candidate, 6 Aligned, 1 Explicit-only',true);
      await click('connections-aligned');
      await ev(`(()=>{const row=[...hv.contentEl.querySelectorAll('[data-health-action^="connections-pair-"]')].find(e=>e.textContent.includes(${JSON.stringify(first.leftPath.slice(0,-3))})&&e.textContent.includes(${JSON.stringify(target)}));if(!row)throw Error('RU02 missing from Aligned UI');row.click()})()`);
      report.afterInspectorText=await ev('hv.contentEl.querySelector(".veynrel-connections-inspector").innerText');
      check('RU02 can be selected in the Aligned UI',true);
      const finalHashes=hashes();report.changedFiles=Object.keys(finalHashes).filter(p=>finalHashes[p]!==expected.corpusSha256[p]);
      assert.deepEqual(report.changedFiles,[first.leftPath]);report.afterCorpusSha256=finalHashes;
      check('only disposable note 007 changed',true);
      await ev(`(async()=>{for(const l of app.workspace.getLeavesOfType('markdown'))await l.setViewState({type:'markdown',state:{file:l.view.file.path,mode:'preview'},active:false});app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown').find(l=>l.view.file.path===${JSON.stringify(first.leftPath)}),{focus:true})})()`);
      await wait(`[...document.querySelectorAll('.metadata-container [data-href]')].some(e=>e.dataset.href===${JSON.stringify(target)}&&e.getBoundingClientRect().width>0)`);
      const point=await ev(`(()=>{const e=[...document.querySelectorAll('.metadata-container [data-href]')].find(e=>e.dataset.href===${JSON.stringify(target)});if(!e)throw Error('Missing native property link');const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Link not visible');return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
      await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
      await wait(`app.workspace.getActiveFile()?.path===${JSON.stringify(first.rightPath)}`);
      report.navigation={method:'Native property link clicked with mouse',from:first.leftPath,expected:first.rightPath,actual:await ev('app.workspace.getActiveFile().path')};
      check('new native property link opens its target',report.navigation.actual===first.rightPath);
      // Restore the source beside the opened target to show the link and both bodies.
      await ev(`(async()=>{const leaves=app.workspace.getLeavesOfType('markdown');await leaves[0].setViewState({type:'markdown',state:{file:${JSON.stringify(first.leftPath)},mode:'preview'},active:false});app.workspace.setActiveLeaf(leaves.find(l=>l.view.file.path===${JSON.stringify(first.rightPath)}),{focus:true})})()`);
      await wait(`[...document.querySelectorAll('.metadata-container [data-href]')].some(e=>e.dataset.href===${JSON.stringify(target)}&&e.getBoundingClientRect().width>0)`);
      await capture('03-ru02-after.png','After verified native navigation: actual related link and both Russian note bodies');
      report.finalIO=await ev('({...caseIO})');
      check('post-edit indexing replays only exact current Russian inputs',requests.length>0&&rejected.length===0&&report.finalIO.embed===requests.length);
      check('action does not assign public human verdicts',await ev('hv.comparisonView.reviewByPairId.size===0'));
    }
    report.localReplayRequests=requests;report.rejectedLocalRequests=rejected;assert.equal(rejected.length,0);
    fs.writeFileSync(root+'/native.json',JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({counts:report.counts,after:report.after,checks:report.checks.length,screenshots:report.screenshots.length}));
  } finally {
    await ev('if(window.caseOriginalMetadata)app.metadataCache.getFileCache=caseOriginalMetadata;window.caseRestores?.reverse().forEach(f=>f())').catch(()=>{});
    if(server.listening)await new Promise(resolve=>server.close(resolve));n.close();
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await run(process.argv[2],process.argv[3],process.argv[4]);
