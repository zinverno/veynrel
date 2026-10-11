// Explicit --fake or --live only. --live never repeats any existing operation journal.
import fs from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { ROOT, productionAdapters, readKey, keyPreflight } from './rerank-comparison.mjs';
import { connect } from './rerank-comparison-native.mjs';
import { check, BudgetJournal } from './rerank-comparison-budget.mjs';
import { digest, limits, notes, query, embeddingModel, rerankModel } from './release-2.1.0-paid-guard.mjs';
const mode = process.argv[2]; check(['--fake','--live'].includes(mode), 'explicit-mode-required');
const fake = mode === '--fake', root = fake ? fs.mkdtempSync('/tmp/veynrel-210-e2e-fake-') : '/tmp/veynrel-210-e2e-live';
const state = fake ? root + '/state' : '/home/zinvernix/.local/state/veynrel/release-2.1.0-e2e';
const assets = Object.fromEntries(['main.js','manifest.json','styles.css'].map(a => [a,digest(fs.readFileSync(ROOT+a))]));
check(JSON.parse(fs.readFileSync(ROOT+'manifest.json')).version === '2.1.0', 'candidate-version');
const a = await productionAdapters(), chunker = new a.MarkdownChunker();
const chunks = notes.flatMap((content,i) => chunker.chunk({ id:`note-${i}.md`,path:`note-${i}.md`,content }));
check(chunks.length === 8, 'eight-bounded-chunks');
const plan = { version:'2.1.0', source:execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim(), assets,
  models:[embeddingModel,rerankModel], limits, query, notesSha256:digest(JSON.stringify(notes)),
  embeddingTexts:chunks.map(c=>c.text), outboundTexts:chunks.map(c=>chunker.outboundText(c)),
  rules:'3 embedding operations (dimensions,index,query); 1 manual rerank; sequential, no retries, receipt required, USD 0.02/M tokens each', date:'2026-10-11' };
if (!fake && fs.existsSync(state)) {
  const header = JSON.parse(fs.readFileSync(state+'/budget.jsonl','utf8').split('\n')[0]);
  const old = new BudgetJournal(state,digest(JSON.stringify(plan)),header.baselineUsage,limits);
  try { const saved = old.summary(); console.log(JSON.stringify({ status:'SKIPPED_EXISTING_JOURNAL',...saved })); }
  finally { old.close(); } process.exit(0);
}
check(fake || !fs.existsSync(root), 'existing-live-profile-needs-inspection');
check(fake || new Date().toISOString().slice(0,10) === plan.date, 'tariffs-need-recheck');
const key = fake ? '' : readKey(), before = fake ? {usage:0,limit:50,limit_remaining:50} : await keyPreflight(key);
check(before.limit_remaining >= .005, 'insufficient-remaining');
fs.mkdirSync(root,{recursive:true}); fs.writeFileSync(root+'/plan.json',JSON.stringify(plan,null,2));
const vault=root+'/vault', dir=vault+'/.obsidian/plugins/ai-knowledge-hub';fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(root+'/profile',{recursive:true});
notes.forEach((text,i)=>fs.writeFileSync(vault+`/note-${i}.md`,text));
fs.writeFileSync(dir+'/data.json',JSON.stringify({language:'en',apiKey:'',semanticAutoSyncSuspended:true,
  semantic:{enabled:true,embeddingProvider:'openrouter',embeddingModel,embeddingBaseUrl:'https://openrouter.ai/api/v1',openRouterApiKey:'session-provider-memory',openAICompatibleApiKey:''},
  rerank:{enabled:true,triggerMode:'manual',model:rerankModel,apiKey:'session-provider-memory'},decisions:{enabled:false},
  companion:{enabled:false},health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}}));
fs.writeFileSync(vault+'/.obsidian/community-plugins.json','[]');fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false}');
fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({vaults:{release:{path:vault,ts:Date.now(),open:true}}}));
for(const asset of Object.keys(assets))fs.copyFileSync(ROOT+asset,dir+'/'+asset);
// Obsidian exposes its API to plugins, not Node's renderer require. This disposable observer leaves candidate assets unchanged.
const observer = vault+'/.obsidian/plugins/release-test-observer'; fs.mkdirSync(observer);
fs.writeFileSync(observer+'/manifest.json',JSON.stringify({id:'release-test-observer',name:'Synthetic release observer',version:'1.0.0',minAppVersion:'1.8.7',author:'test',description:'Disposable release transport observer'}));
fs.writeFileSync(observer+'/main.js',"const api=require('obsidian');module.exports=class extends api.Plugin{onload(){window.__releaseHost=api;}onunload(){delete window.__releaseHost;}};");

await build({entryPoints:[ROOT+'scripts/release-2.1.0-paid-guard.mjs'],bundle:true,platform:'node',format:'cjs',outfile:root+'/guard.cjs',logLevel:'silent'});
const port=9264, child=spawn('/usr/bin/electron43',['/usr/lib/obsidian/app.asar','--user-data-dir='+root+'/profile','--remote-debugging-port='+port,'--disable-gpu','--ozone-platform=x11'],
  {env:{...process.env,...(fake?{}:{OPENROUTER_API_KEY:key})},stdio:'ignore'});
let client;const report={mode:fake?'native-fake':'native-live',date:new Date().toISOString(),source:plan.source,assets,planSha256:digest(JSON.stringify(plan)),checks:[],keyBefore:before};
try {
  client=await connect(port);const {evaluate:ev,waitFor:wait}=client;
  const pass=(label,ok)=>{check(ok,label);report.checks.push(label);};
  await wait('!!window.app?.workspace?.layoutReady');pass('isolated synthetic vault',await ev(`app.vault.adapter.basePath===${JSON.stringify(vault)}`));
  await ev("(async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);})()");

  await ev("(async()=>{await app.plugins.loadManifests();await app.plugins.enablePlugin('release-test-observer');})()");
  const installed = await ev(`(()=>{try{require(${JSON.stringify(root+'/guard.cjs')}).install(${JSON.stringify(plan)},${JSON.stringify(state)},${before.usage},${fake},window.__releaseHost);return 'installed';}catch(error){return ${fake} ? String(error) : 'guard-install-failed';}})()`);
  if(fake && installed!=='installed') console.log(installed);
  check(installed==='installed',fake?installed:'guard-install-failed');
  await ev(`(async()=>{
    window.__releaseErrors=[];const error=console.error;console.error=(...args)=>{if(${fake})__releaseErrors.push(args.map(a=>String(a)));error(...args);};
    const originalEval=window.eval;window.__release210.boundImports=0;
    // Observe the real installed bundle's Obsidian module boundary; preserve its code and native requestUrl.
    window.eval=source=>{const evaluated=originalEval(source);if(!source.includes('//# sourceURL=plugin:ai-knowledge-hub'))return evaluated;
      return (require,module,exports)=>evaluated(id=>{const api=require(id);if(id!=='obsidian')return api;__release210.boundImports++;return new Proxy(api,{get:(target,key,receiver)=>key==='requestUrl'?__release210.transport:Reflect.get(target,key,receiver)});},module,exports);};
    try{await app.plugins.enablePlugin('ai-knowledge-hub');}finally{window.eval=originalEval;}
    __release210.attach();window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;
  })()`);
  pass('installed bundle guarded at every Obsidian import; key only in providers',await ev('__release210.boundImports>0 && engine.rerankProvider(plugin.settings.rerank).transport===__release210.transport'));

  // The user authorized indexing these eight synthetic notes. Search and refinement below use the actual UI.
  await ev('engine.confirm=async()=>true;engine.indexVault()');
  await wait("engine.getSemanticStatus().kind==='ready'");
  pass('real production index ready, eight vectors',await ev('engine.getSemanticStatus().indexedChunks===8 || engine.runtimeSlot.runtime.getStats().vectorCount===8'));
  pass('indexing sends no rerank',await ev("__release210.receipts.length===2 && __release210.receipts.every(r=>r.id.startsWith('embedding-'))"));
  await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-open-health']");
  await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')");
  await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-discover]')");
  await ev("app.workspace.getLeavesOfType('veynrel-health')[0].view.contentEl.querySelector('[data-health-action=nav-discover]').click();void 0");
  await ev("app.commands.executeCommandById('ai-knowledge-hub:ai-semantic-search')");
  await wait("!!document.querySelector('.ai-semantic-search-modal input')");
  await ev(`{const el=document.querySelector('.ai-semantic-search-modal input');el.value=${JSON.stringify(query)};el.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.ai-semantic-search-input-row button').click();}`);
  await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='semantic'");
  pass('semantic search interface visible',true);
  report.baseline=await ev('__release210.candidates');report.poolSha256=digest(JSON.stringify(report.baseline));fs.writeFileSync(root+'/baseline.json',JSON.stringify(report.baseline,null,2));
  pass('eight original results; one query embedding; zero rerank before click',await ev("document.querySelectorAll('.ai-semantic-result-card').length===8 && __release210.receipts.length===3 && !__release210.receipts.some(r=>r.id==='manual-rerank')"));
  await ev("document.querySelector('[data-rerank-action=refine]').click();void 0");
  await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='reranked'");
  report.refined=await ev("__release210.updates.filter(u=>u.stage==='reranked').at(-1).results");
  pass('HTTP 200, installed production validator PASS, exactly one rerank',await ev("__release210.validator==='PASS' && __release210.receipts.length===4 && __release210.receipts.at(-1).id==='manual-rerank' && __release210.receipts.at(-1).httpStatus===200"));
  pass('semantic scores preserved',report.refined.every(d=>report.baseline.find(b=>b.path===d.path)?.score===d.score));
  await ev("document.querySelector('[data-rerank-action=original]').click();void 0");await wait("document.querySelector('.ai-semantic-search-status').dataset.state==='semantic'");
  await ev("document.querySelector('[data-rerank-action=refined]').click();void 0");await wait("document.querySelector('.ai-semantic-search-status').dataset.state==='reranked'");
  pass('toggles perform no new embedding or rerank',await ev('__release210.receipts.length===4'));
  // Open the relevant headerless note wherever the model placed it; improvement is not required.
  await ev("[...document.querySelectorAll('.ai-semantic-result-card')].find(el=>el.querySelector('.ai-semantic-result-title').innerText==='note-0').click();void 0");await wait("app.workspace.getActiveFile()?.path==='note-0.md'");
  pass('relevant note opens at its current fragment',await ev('app.workspace.activeEditor.editor.getCursor().line===0'));
  await ev("app.setting.open();app.setting.openTabById('about');void 0");report.environment=await ev("({obsidian:app.setting.modalEl.innerText.match(/Version ([0-9.]+)/)?.[1],electron:process.versions.electron,platform:process.platform,plugin:plugin.manifest.version})");await ev('app.setting.close()');
  await ev('__release210.finish()');report.receipts=await ev('__release210.receipts');report.budget=await ev('__release210.summary');
  report.keyAfter=fake?{usage:report.budget.spentNanodollars/1e9}:await keyPreflight(key);
  // Free accounting observations only; never repeat a billable operation.
  for(let i=0;!fake && i<15 && Math.abs((report.keyAfter.usage-before.usage)*1e9-report.budget.spentNanodollars)>2;i++) {
    await new Promise(resolve=>setTimeout(resolve,2000));report.keyAfter=await keyPreflight(key);
  }
  report.keyUsageReconciled=Math.abs((report.keyAfter.usage-before.usage)*1e9-report.budget.spentNanodollars)<=2;
  pass('provider receipts reconcile with cumulative key usage',report.keyUsageReconciled);
  pass('installed assets match verified build',Object.entries(assets).every(([p,h])=>digest(fs.readFileSync(dir+'/'+p))===h));
  pass('no real key in settings or artifacts',fake || ![dir+'/data.json',...Object.keys(assets).map(p=>dir+'/'+p)].some(p=>fs.readFileSync(p).includes(Buffer.from(key))));
  report.status='PASS';fs.writeFileSync(root+'/evidence.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,mode:report.mode,checks:report.checks.length,budget:report.budget,keyUsageReconciled:report.keyUsageReconciled,evidence:root+'/evidence.json'}));
} catch(error) {
  if(fake && client) { try { console.log(await client.evaluate("({status:window.engine?.getSemanticStatus(),modal:document.querySelector('.modal')?.innerText,commands:Object.keys(app.commands.commands).filter(k=>k.startsWith('ai-knowledge-hub:')),healthViews:app.workspace.getLeavesOfType('veynrel-health').map(l=>l.view.contentEl.innerText.slice(0,700)),errors:window.__releaseErrors,notices:[...document.querySelectorAll('.notice')].map(e=>e.innerText),boundImports:window.__release210?.boundImports})")); } catch {} }
  report.status='BLOCKED';report.error='native-e2e-incomplete';fs.writeFileSync(root+'/evidence.json',JSON.stringify(report,null,2)+'\n');
  // No provider error text, credentials or evaluated expressions in output.
  console.log(JSON.stringify({status:'BLOCKED',lastPassed:report.checks.at(-1),error:typeof error?.message==='string' && /^[A-Za-z0-9 .,:;_-]{1,180}$/.test(error.message)?error.message:'native-failure',evidence:root+'/evidence.json'}));process.exitCode=1;
} finally {
  if(client) {try{await client.evaluate("window.__release210?.journal.close();window.close()");}catch{}client.close();}child.kill();
}
