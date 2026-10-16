// node scripts/pair-inspector-native.mjs /tmp/pair-inspector-taxonomy-fresh --taxonomy
// Reuses isolated native host, real Tools route, UI, MetadataCache and settings queue.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function taxonomyScenario({ ev, wait, cdp, close, focusMain, root, vault, paths: [a, b] }) {
  await close(); await wait("!document.querySelector('.ai-pair-inspector')");
  const files = {
    'Taxonomy/English.md': '---\ntags: [role/theory, Flat, domain/programming, role]\ntype: moc\n---\n#role/theory #role/theory #difficulty/basic\n',
    'Taxonomy/Russian.md': '---\ntags: [роль/теория, тип/практика, сложность/сложно, domain/english]\n---\n#role/theory #роль/теория #flat\n',
    'Taxonomy/String.md': '---\ntags: тема/кэш\n---\n#type/atom #domain/programming/tools\n',
    'Taxonomy/Empty.md': 'Empty source.\n', 'Taxonomy/Unavailable.md': '#Unavailable\n',
    'backups/Excluded.md': '#must_not_appear\n', 'templates/Excluded.md': '#must_not_appear\n',
  };
  for (let i = 0; i < 120; i++) files[`Taxonomy/Batch-${i}.md`] = 'No tags.\n';
  await ev(`window.taxSeed={paths:${JSON.stringify(Object.keys(files))},ready:false};taxSeed.ref=app.metadataCache.on('resolved',()=>{taxSeed.ready=taxSeed.paths.every(p=>{const f=app.vault.getFileByPath(p);return f&&app.metadataCache.getFileCache(f)})});void 0`);
  for (const [name, content] of Object.entries(files)) { fs.mkdirSync(path.dirname(vault + '/' + name), { recursive: true }); fs.writeFileSync(vault + '/' + name, content); }
  await wait('taxSeed.ready'); await ev('app.metadataCache.offref(taxSeed.ref);void 0');
  const checks = [];
  const pass = async (name, expression) => { assert(await ev(expression), name); checks.push(name); console.log(name); };
  const action = name => ev(`document.querySelector('[data-taxonomy-action=${name}]').click()`);
  const stage = value => wait(`document.querySelector('[data-taxonomy-stage]')?.dataset.taxonomyStage===${JSON.stringify(value)}`);
  const opened = async () => { await wait("!!document.querySelector('.ai-taxonomy')"); await ev('tax.modal=[...plugin.taxonomyModals].at(-1);tax.session=tax.modal.session;void 0'); };
  const shut = async () => { await ev('tax.modal.close();void 0'); await wait("!document.querySelector('.ai-taxonomy')"); };
  await ev(`window.tax={baselineRead:io.read.length,enumerations:0};tax.enumerate=app.vault.getMarkdownFiles.bind(app.vault);
    app.vault.getMarkdownFiles=()=>{tax.enumerations++;return tax.enumerate()};
    tax.cache=app.metadataCache.getFileCache.bind(app.metadataCache);
    app.metadataCache.getFileCache=f=>f.path==='Taxonomy/Unavailable.md'?null:tax.cache(f);
    tax.before=JSON.parse(JSON.stringify(plugin.settings));
    hv.contentEl.querySelector('[data-health-action=nav-tools]').click();void 0`);
  try {
    await pass('Tools entry is passive', 'tax.enumerations===0&&io.read.length===tax.baselineRead&&io.network===0&&io.write===0');
    await ev("hv.contentEl.querySelector('[data-health-action=tool-openTagTaxonomy]').click()"); await opened();
    await pass('Opening taxonomy reads only saved rules, with no scan or profile creation', 'tax.enumerations===0&&io.read.length===tax.baselineRead&&!plugin.settings.tagTaxonomyProfile&&!tax.session.inventory');
    await ev("document.querySelector('[data-taxonomy-action=analyze]').click();document.querySelector('[data-taxonomy-action=cancel]').click()");
    await wait("tax.session.inventory?.state==='cancelled'");
    await pass('Cancellation exposes partial coverage and no category proposals', "tax.session.inventory.processed<tax.session.inventory.total&&!document.querySelector('[data-taxonomy-action=useSuggestions]')");
    await action('analyze'); await wait("tax.session.inventory?.state==='complete'");
    await pass('Native helper combines YAML and inline tags with note-level deduplication', "tax.session.inventory.tags.find(t=>t.tag==='role/theory').notes===2&&tax.session.inventory.tags.find(t=>t.tag==='роль/теория').notes===1&&tax.session.inventory.tags.some(t=>t.tag==='тема/кэш')");
    await pass('Missing metadata, empty lists and exclusions are distinct', "tax.session.inventory.unavailable===1&&tax.session.inventory.empty===122&&tax.session.inventory.excluded===2&&!tax.session.inventory.tags.some(t=>t.tag==='must_not_appear')");
    const inventory = await ev('tax.session.inventory');
    await pass('Similar flat tag names remain distinct', "tax.session.inventory.tags.some(t=>t.tag==='Flat')&&tax.session.inventory.tags.some(t=>t.tag==='flat')");
    await ev("document.querySelector('.ai-taxonomy section details summary').focus()");
    await pass('Tree summary accepts keyboard focus', "document.activeElement===document.querySelector('.ai-taxonomy section details summary')");
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await wait("!!document.querySelector('.ai-taxonomy-tree')");
    await ev("[...document.querySelectorAll('.ai-taxonomy-tree summary')].find(e=>e.textContent.startsWith('#role —')).click()");
    await wait("document.querySelector('.ai-taxonomy-tree').textContent.includes('#role/theory — 2')");
    await pass('Keyboard expands real hierarchy; exact parent counts do not sum child counts', "document.querySelector('.ai-taxonomy-tree').textContent.includes('#role — 1')");
    await ev("document.querySelector('.ai-taxonomy section').scrollIntoView()");
    fs.writeFileSync(root+'/taxonomy-inventory-ru-dark-390.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await action('useSuggestions');
    await pass('Prefixes form separate unconfirmed dimensions; structural type is not inferred as role', "tax.session.draft.categories.find(c=>c.prefixes.includes('type')).purpose==='other'&&tax.session.draft.categories.find(c=>c.prefixes.includes('тип')).purpose==='other'&&!plugin.settings.tagTaxonomyProfile");
    await ev(`tax.set=(key,value)=>{const e=[...document.querySelectorAll('[data-taxonomy-focus]')].find(e=>e.dataset.taxonomyFocus===key);e.value=value;e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input'))};
      tax.role=tax.session.draft.categories.find(c=>c.name==='role').id;tax.set(tax.role+'-prefixes',${JSON.stringify('role\nтип')});void 0`);
    await pass('Conflicting prefix assignment blocks review', "document.querySelector('[data-taxonomy-action=review]').disabled");
    await ev("{const input=[...document.querySelectorAll('.ai-taxonomy input')].find(e=>e.value==='тип');input.closest('fieldset').querySelector('[data-taxonomy-action=remove]').click()}void 0");
    await ev("tax.set(tax.role+'-tags','Flat');tax.set(tax.role+'-multiplicity','multiple');tax.difficulty=tax.session.draft.categories.find(c=>c.name==='difficulty').id;tax.set(tax.difficulty+'-interpretation','global');void 0");
    await action('review'); await stage('review');
    await pass('Review shows changes but writes no profile', "!plugin.settings.tagTaxonomyProfile&&document.querySelector('.ai-taxonomy').textContent.includes('Flat')");
    await ev("document.querySelector('[data-taxonomy-action=save]').click();plugin.settings.notifyOnCopy=!plugin.settings.notifyOnCopy;window.taxOrdinary=plugin.saveSettings();void 0");
    await stage('saved'); await ev('taxOrdinary');
    await pass('Confirmed rules and concurrent ordinary settings both persist', "plugin.settings.tagTaxonomyProfile.categories.find(c=>c.id===tax.role).prefixes.join(',')==='role,тип'&&plugin.settings.tagTaxonomyProfile.categories.find(c=>c.id===tax.difficulty).interpretation==='global'&&plugin.settings.notifyOnCopy!==tax.before.notifyOnCopy");
    const disk = JSON.parse(fs.readFileSync(vault + '/.obsidian/plugins/ai-knowledge-hub/data.json','utf8'));
    assert.equal(disk.tagTaxonomyProfile.version,1); assert.deepEqual(Object.keys(disk.tagTaxonomyProfile).sort(),['categories','version']);
    assert(!JSON.stringify(disk.tagTaxonomyProfile).includes('Taxonomy/')); checks.push('data.json stores rules only, without inventory, counts or note paths');
    await shut(); await ev('plugin.loadSettings();');
    for (const language of ['ru','en']) {
      await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
      await ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='ru'));s.value=${JSON.stringify(language)};s.dispatchEvent(new Event('change'))}void 0`); await ev('plugin.settingsSave');
      await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await ev('app.setting.close();void 0');
      await focusMain();
      await wait("!document.querySelector('.modal')");
      await ev("tax.beforeOpen=tax.enumerations;hv.contentEl.querySelector('[data-health-action=nav-tools]').click();hv.contentEl.querySelector('[data-health-action=tool-openTagTaxonomy]').click();void 0"); await opened();
      await pass(language + ': reopened profile survives without another scan', 'tax.enumerations===tax.beforeOpen&&!tax.session.inventory&&tax.session.draft.categories.some(c=>c.prefixes.includes("тип")&&c.prefixes.includes("role"))');
      for (const theme of ['theme-light','theme-dark']) for (const width of [1200,390]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}')`);
        await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        fs.writeFileSync(root+`/taxonomy-${language}-${theme}-${width}.png`,Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
        const overflow = await ev("[...document.querySelectorAll('.ai-taxonomy,.ai-taxonomy fieldset,.ai-taxonomy input,.ai-taxonomy select,.ai-taxonomy textarea')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,key:e.dataset.taxonomyFocus,width:e.clientWidth,scroll:e.scrollWidth}))");
        assert.deepEqual(overflow, [], `${language} ${theme} ${width}: horizontal overflow`);
        checks.push(`${language} ${theme} ${width}: no horizontal overflow`);
      }
      await pass(language + ': all editable controls have accessible labels', "[...document.querySelectorAll('.ai-taxonomy input,.ai-taxonomy select,.ai-taxonomy textarea')].every(e=>e.id&&[...document.querySelectorAll('.ai-taxonomy label')].some(l=>l.htmlFor===e.id))");
      await ev("document.querySelector('.ai-taxonomy .ai-semantic-result-card').scrollIntoView()");
      fs.writeFileSync(root+`/taxonomy-${language}-rules-dark-390.png`,Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
      await shut();
    }
    await ev('plugin.getToolsPort().openTagTaxonomy();void 0'); await opened();
    await ev("document.querySelector('[data-taxonomy-action=analyze]').click();app.vault.trigger('modify',app.vault.getFileByPath('Taxonomy/English.md'));void 0");
    await wait("tax.session.inventory?.state==='stale'"); await pass('A vault event during scanning marks the result stale', "!document.querySelector('[data-taxonomy-action=useSuggestions]')");
    await ev("document.querySelector('[data-taxonomy-action=analyze]').click();tax.modal.close();void 0"); await wait("!document.querySelector('.ai-taxonomy')");
    await pass('Close aborts the active scan and cannot restore its UI', 'tax.session.closed&&tax.session.operation.signal.aborted');
    await pass('Taxonomy performs no note-body reads, Markdown writes or network calls', 'io.read.length===tax.baselineRead&&io.write===0&&io.network===0');
    const io = await ev('({noteBodyReads:io.read.length-tax.baselineRead,markdownWrites:io.write,networkCalls:io.network})');
    return {status:'PASS',inventory,io,checks,limitations:'Synthetic native vault; one deliberately unavailable cache entry and a synthetic modify event. No LLM calls. Desktop Linux only; no physical mobile or screen reader tests.'};
  } finally {
    if(await ev("!!document.querySelector('.ai-taxonomy')"))await shut();
    await ev('app.vault.getMarkdownFiles=tax.enumerate;app.metadataCache.getFileCache=tax.cache;void 0');
    await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`); await wait("document.querySelectorAll('.ai-pair-source').length===2");
  }
}
