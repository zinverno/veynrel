import assert from 'node:assert/strict';
export async function runFloatingSource({main,wait,pass,shot,key,providerUrl,report,pause,focus}) {
  const click=async s=>{const point=await main.ev(`(()=>{const e=document.querySelector(${JSON.stringify(s)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);for(const type of ['mousePressed','mouseReleased'])await main.send('Input.dispatchMouseEvent',{type,button:'left',clickCount:1,...point});};
  const escape=()=>key('Escape','Escape',27);
  await main.ev(`plugin.settings.provider='ollama';plugin.settings.baseUrl='${providerUrl}/v1';plugin.settings.model='fixture-style';plugin.notifyLanguageModelSettingsChanged();void 0`);
  const text='# Unicode Я 😀\r\n\r\nTwo facts stay unchanged.\r\n\r\nOutside [[Other]] `code()`\r\n';
  await main.ev(`app.vault.create('CRLF.md',${JSON.stringify(text)}).then(()=>undefined)`);
  await main.ev("window.sourceLeaf=app.workspace.getLeavesOfType('markdown')[0];sourceLeaf.openFile(app.vault.getFileByPath('CRLF.md'),{state:{mode:'source'}})");await main.ev('app.workspace.setActiveLeaf(sourceLeaf,{focus:true});window.ed=sourceLeaf.view.editor;void 0');
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-floating-actions');void 0");await wait("!!document.querySelector('[data-floating=toggle]')");await click('[data-floating=toggle]');
  const prepare=async()=>{await main.ev('ed.focus();ed.setSelection({line:2,ch:0},{line:2,ch:25});void 0');await pause(50);await click('[data-floating=style]');await wait("!!document.querySelector('.veynrel-floating-style')");};
  const generate=async()=>{await main.ev("document.querySelector('.veynrel-floating-consent input').click();void 0");await click('[data-health-action=float-generate]');await wait("!!document.querySelector('[data-style-state=preview]')");};
  const count=report.providerRequests.length;await prepare();await main.ev("document.querySelector('.veynrel-floating-consent input').click();void 0");await click('[data-health-action=float-generate]');await wait("!!document.querySelector('[data-style-state=error]')");
  await pass('CRLF is explicitly refused before provider request',"document.querySelector('[data-style-state=error]').textContent.includes('CRLF')");assert.equal(report.providerRequests.length,count);assert.equal(await main.ev("app.vault.read(app.vault.getFileByPath('CRLF.md'))"),text);await shot('style-crlf-refused',main,true);await escape();
  // LF is the supported native editor format; exercise Unicode and one transaction here.
  await main.ev(`sourceLeaf.detach();app.vault.modify(app.vault.getFileByPath('CRLF.md'),${JSON.stringify(text.replaceAll('\r\n','\n'))})`);
  await main.ev("window.sourceLeaf=app.workspace.getLeaf('tab');sourceLeaf.openFile(app.vault.getFileByPath('CRLF.md'),{state:{mode:'source'}})");await main.ev('app.workspace.setActiveLeaf(sourceLeaf,{focus:true});window.ed=sourceLeaf.view.editor;void 0');
  await prepare();await generate();await main.ev("window.applyOnce=document.querySelector('[data-health-action=float-apply]');applyOnce.click();applyOnce.click();void 0");await click('[data-health-action=float-close]');await main.ev('sourceLeaf.view.save()');
  assert.equal(await main.ev("app.vault.read(app.vault.getFileByPath('CRLF.md'))"),text.replaceAll('\r\n','\n').replace('Two facts stay unchanged.','Two facts remain unchanged.'));report.checks.push('LF Unicode bytes outside range preserved; double Apply fenced');
  await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);await main.ev('sourceLeaf.view.save()');assert.equal(await main.ev("app.vault.read(app.vault.getFileByPath('CRLF.md'))"),text.replaceAll('\r\n','\n'));report.checks.push('Native Undo restores exact LF Unicode bytes');
  for(const change of ['rename','close']) {
    await prepare();await generate();
    if(change==='rename')await main.ev("app.vault.rename(app.vault.getFileByPath('CRLF.md'),'Renamed.md')");else await main.ev('sourceLeaf.detach();void 0');
    await click('[data-health-action=float-apply]');await pass(change+' blocks prepared Apply',"!!document.querySelector('[data-style-state=conflict]')");await shot('style-'+change+'-refused',main,true);await escape();
    if(change==='rename')await main.ev("app.vault.rename(app.vault.getFileByPath('Renamed.md'),'CRLF.md')");
  }
  await main.ev("app.vault.delete(app.vault.getFileByPath('CRLF.md'))");
  await main.ev("window.readLeaf=app.workspace.getLeaf('tab');readLeaf.openFile(app.vault.getFileByPath('Source.md'),{state:{mode:'preview'}})");await main.ev('app.workspace.setActiveLeaf(readLeaf,{focus:true});void 0');
  await pass('Reading mode explains disabled editing without reusing a selection',"document.querySelector('[data-floating=style]').disabled&&document.querySelector('[data-floating=recall]').disabled&&document.querySelector('.veynrel-floating-context').textContent.includes('editing mode')");
  await pause(200);report.readModeSource=await main.ev("(()=>{const p=plugin.floating.panels.get(document);return{current:p.source?.current(),path:p.source?.path,mode:p.source?.mode,ranges:p.source?.ranges.length,enabled:!document.querySelector('[data-floating=search]').disabled}})()");await focus();await main.ev("window.searchClicks=0;document.querySelector('[data-floating=search]').addEventListener('click',()=>searchClicks++);void 0");await click('[data-floating=search]');report.searchClick=await main.ev("({clicks:searchClicks,focused:document.hasFocus(),active:document.activeElement?.dataset.floating})");await wait("!!app.setting?.modalEl?.isConnected");await pass('No-index search opens existing configuration',"app.setting.modalEl.isConnected&&!document.querySelector('.ai-semantic-search-modal')");report.settingsOwner=await main.ev('({sameDocument:app.setting.modalEl.ownerDocument===document,connected:app.setting.modalEl.isConnected})');await main.ev('app.setting.close();void 0');
}
