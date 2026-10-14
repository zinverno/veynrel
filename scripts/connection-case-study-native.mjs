// Real Obsidian via loopback CDP. Run only against the vault created by connection-case-study.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { json, sha, corpus, adapters, cohort, summarize, cachedVectors, model, baseUrl, repository } from './connection-case-study.mjs';

export async function connect(endpoint) {
  const url = new URL(endpoint);
  assert(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname));
  const pages = await (await fetch(endpoint + '/json/list')).json();
  const page = pages.find(p => p.url.startsWith('app://obsidian.md/')); assert(page);
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0; const pending = new Map();
  socket.onmessage = event => {
    const message = JSON.parse(event.data), p = pending.get(message.id);
    if (!p) return;
    clearTimeout(p.timer); pending.delete(message.id);
    if (message.error) p.reject(Error(JSON.stringify(message.error))); else p.resolve(message.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id, timer = setTimeout(() => { pending.delete(next); reject(Error('CDP timeout: ' + method)); }, 30000);
    pending.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  const ev = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
  };
  const wait = async expression => {
    for (let i = 0; i < 200; i++) {
      if (await ev(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Native readiness timeout: ' + expression);
  };
  return { send, ev, wait, close: () => { for (const p of pending.values()) clearTimeout(p.timer); socket.close(); } };
}

export async function run(endpoint, root) {
  assert(/^\/tmp\/[a-zA-Z0-9_-]+$/.test(root));
  const baseline = json(root + '/offline.json'), a = await adapters(), vault = root + '/vault';
  assert(!fs.existsSync(root + '/native.json'), 'Use a fresh run directory');
  const documents = corpus();
  const { cache } = cachedVectors(documents.flatMap(d => new a.MarkdownChunker().chunk(d)));
  const markdownHashes = () => Object.fromEntries(documents.map(d => [d.path, sha(fs.readFileSync(vault + '/' + d.path))]));
  const initialHashes = markdownHashes(); assert.deepEqual(initialHashes, baseline.corpusSha256);
  const settings = json(vault + '/.obsidian/plugins/ai-knowledge-hub/data.json');
  assert(settings.semantic.embeddingBaseUrl === baseUrl && settings.semantic.embeddingProvider === 'openai-compatible' &&
    settings.semantic.embeddingModel === model && !settings.semantic.openRouterApiKey && !settings.semantic.openAICompatibleApiKey &&
    !settings.rerank.enabled && !settings.decisions.enabled && !settings.companion.enabled, 'Use the prepared local-only configuration');
  const native = await connect(endpoint), { ev, send, wait } = native;
  const replayRequests = [], rejectedRequests = [];
  const server = http.createServer(async (req, res) => {
    try {
      assert(req.method === 'POST' && req.url === '/v1/embeddings' && !req.headers.authorization);
      let bytes = ''; for await (const chunk of req) { bytes += chunk; assert(bytes.length <= 100000); }
      const body = JSON.parse(bytes);
      assert(body.model === model && Array.isArray(body.input) && body.input.length > 0 && body.input.every(t => cache.has(t)));
      replayRequests.push(body.input.map(sha));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ model, data: body.input.map((t, index) => ({ index, embedding: Array.from(cache.get(t)) })) }));
    } catch { rejectedRequests.push('unplanned local request'); res.writeHead(400); res.end('Uncached input; no remote fallback'); }
  });
  const report = { source: 'Real native Obsidian; synthetic text; cached real embeddings', screenshots: [], checks: [],
    humanVerdicts: 'Requires human review for all 10; control tests are not quality labels' };
  const check = (name, value) => { assert(value, name); report.checks.push(name); };
  const click = action => ev(`(()=>{const e=hv.contentEl.querySelector('[data-health-action=${JSON.stringify(action)}]');if(!e)throw Error('missing action');e.click();})()`);
  const capture = async (name, purpose) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 1550, y: 1000 });
    await wait('!document.querySelector(".notice-container .notice, .tooltip")');
    await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const privacy = await ev(`(()=>{const t=document.body.innerText;return {password:[...document.querySelectorAll('input[type=password]')].some(e=>e.value),
      suspect:/sk-or-|sk-proj-|ghp_|-----BEGIN.*PRIVATE KEY|Bearer\\s+[A-Za-z0-9]|[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(t)};})()`);
    assert(!privacy.password && !privacy.suspect, 'Screenshot DOM privacy check');
    fs.mkdirSync(root + '/assets', { recursive: true });
    const bytes = Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    fs.writeFileSync(root + '/assets/' + name, bytes, { flag: 'wx' });
    report.screenshots.push({ file: name, purpose, sha256: sha(bytes), viewport: { width: 1600, height: 1100 },
      masks: [], hidden: [], capture: 'CDP Page.captureScreenshot, native Electron', privacy, visualReview: 'required' });
  };
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(19643, '127.0.0.1', resolve); });
    await wait('Boolean(window.app?.workspace)');
    assert.equal(await ev('app.vault.adapter.getBasePath()'), vault);
    await ev(`(()=>{const b=[...document.querySelectorAll('.modal button')].find(b=>b.textContent==='Trust author and enable plugins');if(b)b.click();})()`);
    await wait("Boolean(app.plugins.plugins['ai-knowledge-hub'])");
    await wait("Boolean(app.commands.commands['ai-knowledge-hub:veynrel-open-health'])");
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
    report.environment = await ev('({electron:process.versions.electron,platform:process.platform,userAgent:navigator.userAgent,plugin:app.plugins.plugins["ai-knowledge-hub"].manifest.version})');
    report.artifactSha256 = sha(fs.readFileSync(vault + '/.obsidian/plugins/ai-knowledge-hub/main.js'));
    assert.equal(report.artifactSha256, sha(fs.readFileSync(repository + 'main.js')));
    await ev(`(async()=>{window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;
      await engine.refreshSemanticStatus();app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health');})()`);
    await wait("Boolean(app.workspace.getLeavesOfType('veynrel-health')[0]?.view.body)");
    await ev(`(async()=>{window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;await hv.controller.getHealthService();
      window.cp=hv.comparison;window.gp=hv.globalMap;window.tp=hv.topology;
      app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();
      window.caseIO={embed:0,read:0,cachedRead:0,write:0};window.caseRestores=[];
      const wrap=(object,key,counter)=>{const old=object[key];object[key]=function(...args){caseIO[counter]++;return old.apply(this,args)};caseRestores.push(()=>object[key]=old)};
      const provider=engine.runtimeSlot.runtime.components.searchService.provider;
      wrap(provider,'embed','embed');wrap(app.vault,'read','read');wrap(app.vault,'cachedRead','cachedRead');
      const old=app.vault.adapter.write;app.vault.adapter.write=function(p,...args){if(p.endsWith('.md'))caseIO.write++;return old.call(this,p,...args)};
      caseRestores.push(()=>app.vault.adapter.write=old);
    })()`);
    await click('nav-discover');
    check('passive Discover leaves both owners idle', await ev("gp.getSnapshot().state==='idle' && cp.getSnapshot().state==='idle'"));
    await click('global-map-open'); await ev('gp.load()');
    await wait("gp.getSnapshot().state==='ready' && !gp.getSnapshot().busy");
    check('native map contains 40 notes', await ev('gp.getSnapshot().map.nodes.length===40'));
    await capture('01-semantic-map.png', 'Initial map, before comparison or link action');
    await click('global-map-back'); await click('connections-open'); await ev('cp.load()');
    await wait("cp.getSnapshot().state==='ready'");
    const comparison = await ev('cp.getSnapshot().comparison');
    report.before = summarize(comparison); report.cohort = cohort(comparison, a);
    assert.deepEqual(report.before, baseline.counts); assert.deepEqual(report.cohort, baseline.cohort);
    check('native metadata and cached vectors match offline comparison', true);
    report.topologyEdges = await ev('tp.getSnapshot().map.edges');
    for (const rank of ['mutual-top-3', 'mutual-top-5', 'one-sided-top-5']) {
      await click('connections-rank-' + rank);
      const shown = await ev('hv.contentEl.querySelectorAll("[data-health-action^=connections-pair-]").length');
      check('rank filter ' + rank, shown === Math.min(50, baseline.counts.ranks[rank]));
    }
    await click('connections-rank-mutual-top-3'); await click('connections-pair-0');
    await ev(`(()=>{const input=hv.contentEl.querySelector('[data-health-action="connections-search"]');input.value='note-019';input.dispatchEvent(new Event('input'));})()`);
    check('path filter shows only matching pairs', await ev('[...hv.contentEl.querySelectorAll("[data-health-action^=connections-pair-]")].every(e=>e.innerText.includes("note-019"))'));
    await ev(`(()=>{const input=hv.contentEl.querySelector('[data-health-action="connections-search"]');input.value='';input.dispatchEvent(new Event('input'));const box=hv.contentEl.querySelector('[data-health-action="connections-hide-excalidraw"]');box.checked=true;box.dispatchEvent(new Event('change'));})()`);
    check('Excalidraw toggle preserves this corpus without such files', await ev('hv.contentEl.querySelectorAll("[data-health-action^=connections-pair-]").length===27'));
    await ev(`(()=>{const box=hv.contentEl.querySelector('[data-health-action="connections-hide-excalidraw"]');box.checked=false;box.dispatchEvent(new Event('change'));})()`);
    await click('connections-pair-0');
    report.inspectorText = await ev('hv.contentEl.querySelector(".veynrel-connections-inspector").innerText');
    await capture('02-candidate-evidence.png', 'First frozen candidate: ranks, similarity and shared neighbors');
    report.passiveIO = await ev('({...caseIO})');
    assert.deepEqual(report.passiveIO, { embed: 0, read: 0, cachedRead: 0, write: 0 });
    assert.deepEqual(markdownHashes(), initialHashes);
    check('map and comparison read no bodies, create no links and call no embedding provider', true);
    // Exercise controls on one pair, then clear. These are not human usefulness judgments.
    for (const verdict of ['useful', 'not-useful', 'unsure']) {
      await click('connections-review-' + verdict);
      check('session control ' + verdict, await ev(`hv.comparisonView.reviewByPairId.get(${JSON.stringify(report.cohort[0].id)})===${JSON.stringify(verdict)}`));
    }
    await click('connections-review-filter-unreviewed');
    check('unreviewed filter removes control-test label', await ev('hv.contentEl.querySelectorAll("[data-health-action^=connections-pair-]").length===26'));
    await click('connections-review-filter-all'); await click('connections-pair-0'); await click('connections-review-clear');
    const unavailable = report.cohort[0].leftPath;
    await ev(`window.caseOriginalMetadata=app.metadataCache.getFileCache;app.metadataCache.getFileCache=function(f){return f.path===${JSON.stringify(unavailable)}?null:caseOriginalMetadata.call(this,f)};`);
    await ev('cp.refresh()');
    const partial = await ev('cp.getSnapshot().comparison');
    report.injectedMissingMetadata = { path: unavailable, counts: summarize(partial) };
    assert.deepEqual(report.injectedMissingMetadata.counts, baseline.missingMetadata.counts);
    check('injected missing metadata excludes every incident pair', !partial.pairs.some(p => [p.leftPath, p.rightPath].includes(unavailable)));
    await ev('app.metadataCache.getFileCache=caseOriginalMetadata;delete window.caseOriginalMetadata;');
    await ev('cp.refresh()'); await click('connections-pair-0'); await click('connections-review-unsure');
    await ev('tp.markStale()');
    check('stale capture retains review and is labelled stale', await ev("cp.getSnapshot().state==='stale' && hv.comparisonView.reviewByPairId.size===1"));
    await ev('cp.refresh()');
    check('new snapshot clears session reviews', await ev('hv.comparisonView.reviewByPairId.size===0'));
    await click('connections-pair-0'); await click('connections-open-pair');
    const selected = report.cohort[0];
    await wait(`app.workspace.getLeavesOfType('markdown').some(l=>l.view.file?.path===${JSON.stringify(selected.rightPath)})`);
    report.sideBySide = await ev('app.workspace.getLeavesOfType("markdown").map(l=>l.view.file?.path)');
    check('both notes opened for inspection', [selected.leftPath, selected.rightPath].every(p => report.sideBySide.includes(p)));
    // Investigator action, explicitly authorized by the experiment; never a product recommendation action.
    await ev(`app.fileManager.processFrontMatter(app.vault.getAbstractFileByPath(${JSON.stringify(selected.leftPath)}),fm=>{fm.related=[${JSON.stringify('[[' + selected.rightPath.slice(0, -3) + ']]')}];})`);
    await wait(`app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(${JSON.stringify(selected.leftPath)}))?.frontmatterLinks?.some(l=>l.link===${JSON.stringify(selected.rightPath.slice(0, -3))})`);
    // Changed source offsets trigger re-embedding in current production indexing, even for unchanged text.
    await ev(`app.workspace.setActiveLeaf(app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path===${JSON.stringify(selected.leftPath)}),{focus:true})`);
    await ev('engine.indexCurrentNote()');
    await ev('cp.refresh()');
    await wait("cp.getSnapshot().state==='ready'");
    const after = await ev('cp.getSnapshot().comparison'); report.after = summarize(after);
    report.action = { pair: selected.id, method: 'Investigator via Obsidian processFrontMatter', from: selected.leftPath, to: selected.rightPath,
      before: selected, after: after.pairs.find(p => p.id === selected.id) };
    check('action becomes directed Aligned with identical semantic evidence', report.action.after.category === 'aligned' &&
      report.action.after.markdown.direction === 'left-to-right' && JSON.stringify(selected.semantic) === JSON.stringify(report.action.after.semantic));
    const finalHashes = markdownHashes();
    report.changedFiles = Object.keys(finalHashes).filter(p => finalHashes[p] !== initialHashes[p]);
    assert.deepEqual(report.changedFiles, [selected.leftPath]);
    report.afterMarkdown = fs.readFileSync(vault + '/' + selected.leftPath, 'utf8');
    await ev(`(async()=>{const leaves=app.workspace.getLeavesOfType('markdown');for(const l of leaves)await l.setViewState({type:'markdown',state:{file:l.view.file.path,mode:'preview'},active:false});app.workspace.setActiveLeaf(leaves.find(l=>l.view.file.path===${JSON.stringify(selected.leftPath)}),{focus:true});})()`);
    await capture('03-linked-notes-clean.png', 'New frontmatter cross-reference and both note bodies in real Obsidian');
    const target = await ev(`(()=>{const e=document.querySelector('.metadata-container [data-href="${selected.rightPath.slice(0, -3)}"]');if(!e)throw Error('Missing native property link');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...target });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...target });
    await wait(`app.workspace.getActiveFile()?.path===${JSON.stringify(selected.rightPath)}`);
    check('new native property link opens its target', true);
    report.finalEmbeddingCalls = await ev('caseIO.embed'); report.localReplayRequests = replayRequests;
    report.rejectedLocalRequests = rejectedRequests;
    check('post-edit indexing uses only exact cached inputs over loopback', rejectedRequests.length === 0 && replayRequests.length > 0 && report.finalEmbeddingCalls === replayRequests.length);
    fs.writeFileSync(root + '/native.json', JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ before: report.before, after: report.after, checks: report.checks.length, screenshots: report.screenshots.length }, null, 2));
  } finally {
    await ev('if(window.caseOriginalMetadata)app.metadataCache.getFileCache=caseOriginalMetadata;window.caseRestores?.reverse().forEach(f=>f());').catch(() => {});
    if (server.listening) await new Promise(resolve => server.close(resolve));
    native.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run(process.argv[2], process.argv[3]);
