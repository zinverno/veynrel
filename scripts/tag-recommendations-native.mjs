// node scripts/pair-inspector-native.mjs /tmp/pair-inspector-tags-fresh --taxonomy --tag-recommendations
// Native UI/cache/files, scripted transport only. These fixtures do not measure model accuracy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function tagRecommendationScenario({ ev, wait, cdp, close, focusMain, root, vault, paths: [a,b], ROOT }) {
  await close(); await wait("!document.querySelector('.ai-pair-inspector')");
  const cases = JSON.parse(fs.readFileSync(ROOT + '/tests/fixtures/tag-recommendations.json', 'utf8'));
  const selected = 'Recommendations/Selected.md', other = 'Recommendations/Other/Selected.md';
  const checks = [], refusals = [];
  const run = code => ev(`(async()=>{${code}})()`);
  const pass = async (name, expression) => { assert(await ev(expression), name); checks.push(name); console.log(name); };
  const action = key => ev(`document.querySelector('[data-tag-rec-action=${key}]').click()`);
  const stage = value => wait(`document.querySelector('[data-tag-rec-stage]')?.dataset.tagRecStage===${JSON.stringify(value)}`);
  const scan = async () => { await ev("document.querySelector('[data-taxonomy-action=analyze]').click()"); await wait("tr.modal.session.inventory?.state==='complete'"); };
  const shut = async () => { await ev('tr.modal.close();void 0'); await wait("!document.querySelector('.ai-taxonomy')"); };
  const write = async files => {
    const changes = Object.entries(files).filter(([name, content]) => !fs.existsSync(vault+'/'+name) || fs.readFileSync(vault+'/'+name,'utf8') !== content);
    if (!changes.length) return;
    await ev(`window.trWrite={expected:new Map(${JSON.stringify(changes)}),seen:new Set(),resolved:false};
      trWrite.changed=app.metadataCache.on('changed',(file,data)=>{if(trWrite.expected.get(file.path)===data)trWrite.seen.add(file.path)});
      trWrite.done=app.metadataCache.on('resolved',()=>{if(trWrite.seen.size===trWrite.expected.size)trWrite.resolved=true});void 0`);
    for (const [name, content] of changes) { fs.mkdirSync(path.dirname(vault+'/'+name), {recursive:true}); fs.writeFileSync(vault+'/'+name,content); }
    await wait('trWrite.resolved'); await ev('app.metadataCache.offref(trWrite.changed);app.metadataCache.offref(trWrite.done);void 0');
  };
  await write({ [selected]: cases[0].content, [other]: 'Unselected private source text.\n', 'Recommendations/Inventory.md': [...new Set(cases.flatMap(c=>c.tags))].map(tag=>'#'+tag).join(' ') });
  await run(`window.tr={calls:[],mode:'ok',pending:[],selected:${JSON.stringify(selected)}};
    tr.savedModel=plugin.getLanguageModelSettingsPort().get();tr.savedProfile=plugin.getTaxonomyProfilePort().get();
    tr.model={...tr.savedModel,provider:'custom',model:'synthetic-tags',apiKey:'synthetic-tag-key',baseUrl:'https://example.invalid/v1',temperature:0.2};
    await plugin.getLanguageModelSettingsPort().update(tr.model);void 0`);
  const open = async item => {
    await run(`tr.fixture=${JSON.stringify(item)};await plugin.getTaxonomyProfilePort().save(tr.fixture.profile,plugin.getTaxonomyProfilePort().get(),new AbortController().signal);
      hv.contentEl.querySelector('[data-health-action=nav-tools]').click();tr.baseline=io.read.length;tr.before=tr.calls.length;
      hv.contentEl.querySelector('[data-health-action=tool-openTagTaxonomy]').click();tr.modal=[...plugin.taxonomyModals].at(-1);tr.session=tr.modal.recommendations;
      tr.session.deps.complete=async(settings,system,user,signal)=>{tr.calls.push({settings:{model:settings.model,baseUrl:settings.baseUrl},system,user});tr.signal=signal;
        if(tr.mode==='slow')await new Promise(resolve=>tr.pending.push(resolve));
        if(tr.mode==='invalid')return 'not JSON';
        const response=JSON.parse(JSON.stringify(tr.fixture.response));
        if(tr.mode==='badQuote')response.categories[0].quote='fabricated evidence';
        return JSON.stringify(response);};void 0`);
    await wait("!!document.querySelector('.ai-tag-recommendations')");
    await pass(item.name+': Tools opening is passive', 'io.read.length===tr.baseline&&tr.calls.length===tr.before&&!tr.modal.session.inventory');
    await scan();
    await pass(item.name+': explicit scan does not read bodies or call LLM', 'io.read.length===tr.baseline&&tr.calls.length===tr.before');
    await action('select'); await wait("!!document.querySelector('.prompt-input')");
    await ev(`{const input=document.querySelector('.prompt-input');input.value=${JSON.stringify(selected)};input.dispatchEvent(new Event('input'))}void 0`);
    await wait(`document.querySelector('.suggestion-item')?.textContent===${JSON.stringify(selected)}`);
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await wait(`tr.session.path===${JSON.stringify(selected)}&&!document.querySelector('.prompt-input')`);
    await pass(item.name+': exact-path selection is passive', 'io.read.length===tr.baseline&&tr.calls.length===tr.before');
  };
  const prepare = async () => {
    await ev("document.querySelector('[data-tag-rec-action=analyze]').focus()");
    await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
    await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await stage('consent');
    await pass('Keyboard activation retains focus on explicit confirmation', "document.activeElement?.dataset.tagRecAction==='confirm'");
    await pass('Exact complete request preview before explicit confirmation', `tr.calls.length===tr.before&&JSON.stringify(JSON.parse(JSON.parse(tr.session.view.consent.body).messages[1].content))===JSON.stringify({source:tr.fixture.content,confirmedProfile:plugin.getTaxonomyProfilePort().get(),observedTags:tr.modal.session.inventory.tags.map(t=>t.tag)})&&!document.querySelector('.ai-tag-recommendations').textContent.includes('synthetic-tag-key')`);
  };
  const screenshot = async (name, expression = "[...document.querySelectorAll('.ai-tag-recommendations,.ai-tag-recommendations pre')].every(e=>e.scrollWidth<=e.clientWidth+1)") => {
    // A hovered native Notice pauses its timer; keep the pointer outside screenshot content.
    await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
    await wait("!document.querySelector('.notice')");
    await ev(`document.querySelector(${JSON.stringify(name.endsWith('-consent') ? '.ai-tag-recommendations details' : '.ai-tag-recommendations [data-tag-rec-category]')}).scrollIntoView({block:'center'})`);
    await pass(name+': no horizontal overflow', expression);
    fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
  };
  try {
    for (const item of cases) {
      await write({ [selected]: item.content }); await open(item); await prepare();
      await action('confirm'); await stage('result');
      await pass(item.name+': scripted result validated; only selected source read', 'tr.calls.length===tr.before+1&&io.read.slice(tr.baseline).every(p=>p===tr.selected)&&io.read.length-tr.baseline===3');
      await action('dismiss'); await stage('dismissed'); await pass('Dismiss does not persist or resend', 'tr.calls.length===tr.before+1'); await shut();
    }
    // Full language/theme/width matrix for both consent and displayed result.
    for (const language of ['ru','en']) {
      await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
      await ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='ru'));s.value=${JSON.stringify(language)};s.dispatchEvent(new Event('change'))}void 0`);
      await ev('plugin.settingsSave'); await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      await ev('app.setting.close();void 0'); await focusMain(); await wait("!document.querySelector('.modal')");
      const item = cases.find(c=>c.name==='justified_new_tag'); await write({[selected]:item.content}); await open(item); await prepare();
      for (const theme of ['theme-light','theme-dark']) for (const width of [1200,390]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}')`);
        await screenshot(`tags-${language}-${theme}-${width}-consent`);
      }
      await action('confirm'); await stage('result');
      for (const theme of ['theme-light','theme-dark']) for (const width of [1200,390]) {
        await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}')`);
        await screenshot(`tags-${language}-${theme}-${width}-result`);
      }
      await pass(language+': translated labels, existing/new/none sections and no Apply controls', "!document.querySelector('.ai-tag-recommendations').textContent.includes('@tagRec.')&&document.querySelectorAll('.ai-tag-recommendations h4').length===4&&!document.querySelector('[data-tag-rec-action=apply]')");
      await shut();
    }
    const item = cases[0]; await write({[selected]:item.content}); await open(item);
    for (const [mode,error] of [['invalid','invalidResponse'],['badQuote','evidence']]) {
      await ev(`tr.mode='${mode}';tr.before=tr.calls.length;void 0`); await prepare(); await action('confirm'); await stage('error');
      await pass(mode+': response withheld without retry', `tr.session.view.error==='${error}'&&!tr.session.view.result&&tr.calls.length===tr.before+1`); refusals.push(error);
    }
    await ev("tr.mode='ok';tr.before=tr.calls.length;tr.cache=app.metadataCache.getFileCache.bind(app.metadataCache);app.metadataCache.getFileCache=f=>f.path===tr.selected?null:tr.cache(f);void 0");
    await scan(); await action('analyze'); await stage('error');
    await pass('Missing metadata prevents sending and does not claim tag absence', "tr.session.view.error==='inventory'&&tr.calls.length===tr.before"); refusals.push('incomplete inventory');
    await ev('app.metadataCache.getFileCache=tr.cache;void 0'); await scan(); await prepare();
    await ev("app.vault.trigger('modify',app.vault.getFileByPath(tr.selected));void 0"); await stage('stale');
    await ev('tr.session.confirm()'); await pass('Source/inventory change before confirmation prevents sending', 'tr.calls.length===tr.before'); refusals.push('stale before send');
    await scan(); await prepare();
    await run("await plugin.getTaxonomyProfilePort().save({...tr.fixture.profile,categories:tr.fixture.profile.categories.map(c=>({...c,name:c.name+' changed'}))},plugin.getTaxonomyProfilePort().get(),new AbortController().signal);void 0");
    await stage('stale'); await pass('A committed profile edit invalidates consent without sending', 'tr.calls.length===tr.before'); refusals.push('profile changed');
    await run("await plugin.getTaxonomyProfilePort().save(tr.fixture.profile,plugin.getTaxonomyProfilePort().get(),new AbortController().signal);void 0");
    await prepare(); await ev("tr.mode='slow';document.querySelector('[data-tag-rec-action=confirm]').click();document.querySelector('[data-tag-rec-action=confirm]')?.click();void 0");
    await wait('tr.pending.length===1'); await action('cancel'); await stage('cancelled');
    await ev('tr.pending.shift()();void 0'); await pass('Cancel aborts waiting; a double click dispatches once', 'tr.signal.aborted&&tr.calls.length===tr.before+1&&!tr.session.view.result');
    await ev("tr.mode='ok';tr.before=tr.calls.length;void 0"); await prepare(); await action('confirm'); await stage('result');
    await write({[selected]: item.content+'\nChanged after analysis.'}); await stage('stale');
    await pass('A real saved-file edit invalidates an already displayed result', '!tr.session.view.result'); refusals.push('changed after result');
    await write({[selected]:item.content}); await scan(); await ev('tr.before=tr.calls.length;void 0'); await prepare();
    await ev("tr.mode='slow';document.querySelector('[data-tag-rec-action=confirm]').click();void 0"); await wait('tr.pending.length===1');
    await run("await plugin.getLanguageModelSettingsPort().update({...tr.model,model:'changed-model'});void 0"); await stage('stale');
    await ev('tr.pending.shift()();void 0'); await pass('Model change during request aborts and suppresses late result', 'tr.signal.aborted&&!tr.session.view.result'); refusals.push('model change during request');
    await run("await plugin.getLanguageModelSettingsPort().update(tr.model);tr.before=tr.calls.length;void 0"); await prepare();
    await action('confirm'); await wait('tr.pending.length===1'); await shut();
    await ev('tr.pending.shift()();void 0');
    await pass('Close blocks late UI and warns that a dispatched call may be billed', "tr.signal.aborted&&!document.querySelector('.ai-taxonomy')&&[...document.querySelectorAll('.notice')].some(e=>/charge|оплат/.test(e.textContent))");
    await write({[selected]:'x'.repeat(20001)}); await open(item); await action('analyze'); await stage('error');
    await pass('Oversized note refuses full analysis without sending', "tr.session.view.error==='tooLarge'&&tr.calls.length===tr.before"); refusals.push('oversized source'); await shut();
    await pass('No Markdown writes or real network calls throughout recommendations', 'io.write===0&&io.network===0');
    const data=fs.readFileSync(vault+'/.obsidian/plugins/ai-knowledge-hub/data.json','utf8');
    assert(!data.includes('confirmedProfile')&&!data.includes('observedTags')&&!data.includes('Preliminary interpretation'));
    checks.push('Settings contain no request bodies, inventories or model results');
    return {status:'PASS',checks,refusals,scriptedCalls:await ev('tr.calls.length'),markdownWrites:await ev('io.write'),networkCalls:await ev('io.network'),limits:'Fake completion only; native cache and lifecycle, not semantic model accuracy. fetch/XHR counters plus injected completion; requestUrl not instrumented. Linux desktop, not physical mobile or screen readers.'};
  } finally {
    if (await ev("!!document.querySelector('.ai-taxonomy')")) await shut();
    await run('if(tr.cache)app.metadataCache.getFileCache=tr.cache;await plugin.getLanguageModelSettingsPort().update(tr.savedModel);void 0');
    await ev(`engine.inspectPair({leftPath:${JSON.stringify(a)},rightPath:${JSON.stringify(b)}})`); await wait("document.querySelectorAll('.ai-pair-source').length===2");
  }
}
