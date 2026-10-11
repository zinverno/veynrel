// Free native acceptance only; isolated /tmp profiles, synthetic embeddings, no real key.
import fs from 'node:fs';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { connect } from './rerank-comparison-native.mjs';
import { ROOT, sha256 } from './rerank-comparison.mjs';
import { check } from './rerank-comparison-budget.mjs';
const [mode, root] = process.argv.slice(2);
check(['upgrade', 'manual', 'decisions'].includes(mode) && root?.startsWith('/tmp/') && !root.includes('..'), 'arguments');
const vault = root + '/vault', dir = vault + '/.obsidian/plugins/ai-knowledge-hub';
const assets = ['main.js', 'manifest.json', 'styles.css'];
const published = { 'main.js': '0eb1a12e8415ced10be27342851407c8dd7e41cd513735f6e3728ae2715f17ea',
  'manifest.json': '3adfa924ce9cbfa749e836c3a05b60ac4f59d3e32b326bdd653c9dea5f7af2cb',
  'styles.css': '090874f18246ccb5f79403b91b85b5489f43a70ed0b18f3e420bde2b9f0c911d' };
check(!fs.existsSync(vault), 'use-fresh-synthetic-profile');
const run = args => { const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  check(result.status === 0, 'free-driver-failed:' + result.stderr.slice(-800)); return result.stdout; };
let server, embeddings = 0;
if (mode !== 'upgrade') run([`scripts/${mode === 'manual' ? 'rerank' : 'decisions'}-native.mjs`, 'prepare', root, ...(mode === 'manual' ? ['manual'] : [])]);
else {
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(root + '/profile', { recursive: true });
  for (let i = 0; i < 8; i++) fs.writeFileSync(vault + `/note-${i}.md`, `${i ? '# Synthetic topic\n\n' : ''}Synthetic release note ${i}. A retry uses a delay.\n\n## Flashcards\n\nQuestion ${i}::Answer ${i}\n`);
  fs.writeFileSync(dir + '/data.json', JSON.stringify({ language: 'en', provider: 'ollama', model: 'synthetic-custom-chat',
    temperature: 0.23, notifyOnCopy: false, semanticAutoSyncSuspended: true,
    semantic: { enabled: true, embeddingProvider: 'openai-compatible', embeddingModel: 'synthetic-upgrade', embeddingBaseUrl: 'http://127.0.0.1:19363/v1', openRouterApiKey: '', openAICompatibleApiKey: '' },
    companion: { enabled: false }, health: { profile: 'research', profileChosen: true, onboardingCompleted: true } }));
  fs.writeFileSync(vault + '/.obsidian/community-plugins.json', '["ai-knowledge-hub"]');
  fs.writeFileSync(vault + '/.obsidian/hotkeys.json', '{"ai-knowledge-hub:ai-semantic-search":[{"modifiers":["Mod","Shift"],"key":"Y"}]}');
  fs.writeFileSync(vault + '/.obsidian/app.json', '{"checkForUpdates":false}');
  fs.writeFileSync(root + '/profile/obsidian.json', JSON.stringify({ vaults: { release: { path: vault, ts: Date.now(), open: true } } }));
  for (const asset of assets) {
    const bytes = fs.readFileSync('/tmp/veynrel-2.1.0-release/published-2.0.1/' + asset);
    check(sha256(bytes) === published[asset], 'published-digest-mismatch'); fs.writeFileSync(dir + '/' + asset, bytes);
  }
  server = http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    const { input } = JSON.parse(body); check(Array.isArray(input) && !req.headers.authorization, 'synthetic-only'); embeddings++;
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: input.map((_, index) => ({ index, embedding: [1, .2, .1] })) }));
  });
  await new Promise(resolve => server.listen(19363, '127.0.0.1', resolve));
}
const port = mode === 'upgrade' ? 9263 : mode === 'manual' ? 9261 : 9262;
const child = spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar', '--user-data-dir=' + root + '/profile', '--remote-debugging-port=' + port, '--disable-gpu', '--ozone-platform=x11'], { stdio: 'ignore' });
let client;
try {
  client = await connect(port); const { evaluate: ev, waitFor: wait } = client;
  await wait('!!window.app?.workspace?.layoutReady');
  check(await ev(`app.vault.adapter.basePath===${JSON.stringify(vault)}`), 'isolated-vault');
  await ev("(async()=>{if(!app.plugins.isEnabled())await app.plugins.setEnable(true);if(!app.plugins.plugins['ai-knowledge-hub'])await app.plugins.enablePlugin('ai-knowledge-hub');})()");
  await wait("!!app.plugins.plugins['ai-knowledge-hub']?.semanticController");
  if (mode !== 'upgrade') {
    const output = await new Promise((resolve, reject) => {
      const driver = spawn(process.execPath, [`scripts/${mode === 'manual' ? 'rerank' : 'decisions'}-native.mjs`, 'run', root, ...(mode === 'manual' ? ['manual'] : [])], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let text = ''; driver.stdout.on('data', c => text += c); driver.stderr.on('data', c => text += c);
      driver.on('exit', code => code === 0 ? resolve(text) : reject(Error('native-driver-failed:' + text.slice(-2200))));
    }); console.log(output);
  } else {
    const report = { checks: [], publishedAssets: published, candidateAssets: Object.fromEntries(assets.map(a => [a, sha256(fs.readFileSync(ROOT + a))])) };
    const pass = (name, condition) => { check(condition, name); report.checks.push(name); };
    await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;void 0");
    pass('Published 2.0.1 installed with stable identity', await ev("plugin.manifest.version==='2.0.1' && plugin.manifest.id==='ai-knowledge-hub' && plugin.manifest.name==='Veynrel'"));
    await ev('engine.confirm=async()=>true;engine.indexVault()'); await wait("engine.getSemanticStatus().kind==='ready'");
    await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')");
    await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-recall]')");
    await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;hv.controller.runLocalScan()");
    pass('Published Health local scan completes before upgrade', await ev('!hv.controller.getState().busy'));
    await ev("hv.contentEl.querySelector('[data-health-action=nav-recall]').click();hv.contentEl.querySelector('[data-health-action=recall-refresh]').click();void 0");
    await wait("!!hv.contentEl.querySelector('[data-health-action=recall-start]')");
    await ev("hv.contentEl.querySelector('[data-health-action=recall-start]').click();hv.contentEl.querySelector('[data-health-action=recall-reveal]').click();hv.contentEl.querySelector('[data-health-action=recall-good]').click();void 0");
    await wait('!hv.recall.getSnapshot().reviewSaving && hv.recall.getSnapshot().session?.reviewed===1');
    await ev('plugin.saveSettings()');
    await ev("app.plugins.disablePlugin('ai-knowledge-hub')");
    const inventory = () => {
      const map = {}; const walk = path => { for (const e of fs.readdirSync(path, { withFileTypes: true })) {
        const p = path + '/' + e.name; if (e.isDirectory()) walk(p); else if (!assets.includes(e.name)) map[p.slice(dir.length + 1)] = sha256(fs.readFileSync(p));
      } }; walk(dir); return map;
    };
    const before = inventory();
    fs.mkdirSync(root + '/before-data', { recursive: true });
    for(const p of Object.keys(before)) { fs.mkdirSync(root + '/before-data/' + p.split('/').slice(0,-1).join('/'), { recursive: true }); fs.copyFileSync(dir + '/' + p, root + '/before-data/' + p); }
    const oldSettings = JSON.parse(fs.readFileSync(dir + '/data.json'));
    const notes = Object.fromEntries(fs.readdirSync(vault).filter(p => p.endsWith('.md')).map(p => [p, sha256(fs.readFileSync(vault + '/' + p))]));
    const hotkeys = fs.readFileSync(vault + '/.obsidian/hotkeys.json', 'utf8'), enabled = fs.readFileSync(vault + '/.obsidian/community-plugins.json', 'utf8');
    pass('Existing index and reviewed Recall data exist before upgrade', Object.keys(before).some(p => p.includes('semantic-index')) && Object.keys(before).some(p => p.includes('recall')));
    for (const asset of assets) fs.copyFileSync(ROOT + asset, dir + '/' + asset);
    await ev("(async()=>{await app.plugins.loadManifests();await app.plugins.enablePlugin('ai-knowledge-hub');window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;await engine.refreshSemanticStatus();})()");
    pass('Candidate loads as 2.1.0 with existing index ready, without rebuild', await ev("plugin.manifest.version==='2.1.0' && engine.getSemanticStatus().kind==='ready'"));
    fs.writeFileSync(root + '/data-hashes.json', JSON.stringify({before, after:inventory()},null,2));
    pass('Settings, index, Recall and all existing plugin data bytes preserved', JSON.stringify(before) === JSON.stringify(inventory()));
    pass('Notes, enabled state and custom hotkey preserved', Object.entries(notes).every(([p,h]) => sha256(fs.readFileSync(vault + '/' + p)) === h) && fs.readFileSync(vault + '/.obsidian/hotkeys.json','utf8') === hotkeys && fs.readFileSync(vault + '/.obsidian/community-plugins.json','utf8') === enabled);
    pass('Non-default preferences and provider configuration preserved', await ev(`plugin.settings.model===${JSON.stringify(oldSettings.model)} && plugin.settings.temperature===0.23 && !plugin.settings.notifyOnCopy && plugin.settings.health.profile==='research' && JSON.stringify(plugin.settings.semantic)===${JSON.stringify(JSON.stringify(oldSettings.semantic))}`));
    pass('No old rerank configuration becomes off/manual Voyage with empty independent key', await ev("!plugin.settings.rerank.enabled && plugin.settings.rerank.triggerMode==='manual' && plugin.settings.rerank.model==='voyageai/rerank-3-lite' && plugin.settings.rerank.apiKey===''") );
    const baseline = embeddings;
    await ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-open-health')");
    await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.contentEl.querySelector('[data-health-action=nav-recall]')");
    await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;hv.contentEl.querySelector('[data-health-action=nav-recall]').click();void 0");
    pass('Recall overview and retained review inventory render after upgrade', await ev("!!hv.contentEl.querySelector('[data-health-action=recall-start]')"));
    await ev("hv.contentEl.querySelector('[data-health-action=nav-health]').click();void 0");
    pass('Health dashboard renders after upgrade', await ev("!!hv.contentEl.querySelector('.veynrel-vault-pulse')"));
    await ev("hv.contentEl.querySelector('[data-health-action=nav-discover]').click();app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    pass('Passive Health, Recall, Discover and settings make no embedding HTTP', embeddings === baseline);
    await ev('app.setting.close();engine.openSearch()'); await wait("!!document.querySelector('.ai-semantic-search-modal input')");
    await ev("{const input=document.querySelector('.ai-semantic-search-modal input');input.value='synthetic retry';input.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('.ai-semantic-search-input-row button').click();}");
    await wait("document.querySelectorAll('.ai-semantic-result-card').length===8");
    pass('Existing index searches after upgrade with one query embedding', embeddings === baseline + 1);
    await ev("document.querySelector('.ai-semantic-result-card').click();void 0"); await wait("!!app.workspace.getActiveFile()");
    pass('Local note navigation works', await ev("app.workspace.getActiveFile().path.endsWith('.md')"));
    report.preservedFiles = before; report.notes = notes; report.embeddings = embeddings;
    await ev("app.setting.open();app.setting.openTabById('about');void 0");
    report.environment = await ev("({obsidian:app.setting.modalEl.innerText.match(/Version ([0-9.]+)/)?.[1],electron:process.versions.electron,platform:process.platform})"); await ev('app.setting.close()');
    await ev("app.plugins.disablePlugin('ai-knowledge-hub')");
    fs.writeFileSync(dir + '/data.json', JSON.stringify({ ...oldSettings, rerank: { enabled: true, apiKey: 'synthetic-unused' } }));
    await ev("(async()=>{await app.plugins.enablePlugin('ai-knowledge-hub');window.plugin=app.plugins.plugins['ai-knowledge-hub'];})()");
    pass('Separate legacy enabled configuration retains automatic and implicit Cohere', await ev("plugin.settings.rerank.enabled && plugin.settings.rerank.triggerMode==='automatic' && plugin.settings.rerank.model==='cohere/rerank-v3.5'"));
    pass('Installed candidate assets match build byte for byte', assets.every(a => sha256(fs.readFileSync(dir + '/' + a)) === report.candidateAssets[a]));
    fs.writeFileSync(root + '/native.json', JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  }
} finally { if (client) { try { await client.evaluate('window.close()'); } catch {} client.close(); } child.kill(); if(server) await new Promise(resolve => server.close(resolve)); }
