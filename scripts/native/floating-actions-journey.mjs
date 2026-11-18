import assert from 'node:assert/strict';
export async function runFloatingActions({main,wait,pass,shot,key,focus,providerUrl,report,pause,connection,endpoint,pendingReply}) {
  const click = async selector => {
    const point=await main.ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing native action: '+${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await main.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await main.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  };
  const stage = async name => { await main.ev('plugin.settingsSave'); (report.ioStages??=[]).push({name,time:Date.now()/1000,io:await main.ev('({...uxIO,...stageIO})'),providerCalls:report.providerRequests.length}); };
  const control = id => `[data-floating="${id}"]`, action = id => `[data-health-action="${id}"]`;
  const escape = () => key('Escape','Escape',27);
  const shotWindow = name => shot(name,main,true);
  const language = async value => {
    await main.ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await main.ev(`{const s=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));s.value='${value}';s.dispatchEvent(new Event('change'));}void 0`);
    await main.ev('plugin.settingsSave');await main.ev('app.setting.close();void 0');await focus();
  };
  const select = async () => {
    await main.ev("ed.focus();ed.setSelection({line:2,ch:0},{line:2,ch:25});void 0");await pause(60);
  };
  const model = async value => main.ev(`plugin.settings.provider='ollama';plugin.settings.baseUrl='${providerUrl}/v1';plugin.settings.apiKey='';plugin.settings.model='${value}';plugin.notifyLanguageModelSettingsChanged();void 0`);
  await language('en');await main.ev("app.changeTheme('obsidian');void 0");await wait("document.body.classList.contains('theme-dark')");
  await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');
  await pass('Floating is OFF by default',"!document.querySelector('.veynrel-floating')&&!plugin.settings.floatingActions?.enabled");
  await main.ev("window.sourceLeaf=app.workspace.getLeavesOfType('markdown').find(l=>l.view.file?.path==='Source.md')??app.workspace.getLeaf('tab');sourceLeaf.openFile(app.vault.getFileByPath('Source.md'),{state:{mode:'source'}})");
  await main.ev('app.workspace.setActiveLeaf(sourceLeaf,{focus:true});void 0');await wait("sourceLeaf.view.getMode()==='source'&&!!sourceLeaf.view.editor");
  await main.ev("window.ed=sourceLeaf.view.editor;window.originalSource=ed.getValue();void 0");await focus();await main.ev('app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0');await pause(250);
  await stage('before-toggle');await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-floating-actions');void 0");await wait("document.querySelectorAll('.veynrel-floating').length===1");
  await stage('toggle');await shotWindow('panel-collapsed-dark');await select();await stage('select');
  const reads=await main.ev('uxIO.pluginRead'),requests=report.providerRequests.length;
  await click(control('toggle'));await stage('expand');await shotWindow('panel-expanded-dark');
  await pass('Expand retains exact selection and sends nothing',"ed.getSelection()==='Two facts stay unchanged.'&&document.querySelector('.veynrel-floating-context').textContent.includes('Selection')");
  assert.equal(await main.ev('uxIO.pluginRead'),reads);assert.equal(report.providerRequests.length,requests);
  const grip=await main.ev("(()=>{const r=document.querySelector('[data-floating=grip]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await main.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...grip});
  for(let i=1;i<=12;i++){await main.send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:grip.x-25*i,y:grip.y-15*i});await pause(20);}
  await main.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:grip.x-300,y:grip.y-180});
  await pass('Drag preserves selection and starts no action',"ed.getSelection()==='Two facts stay unchanged.'&&!document.querySelector('.modal-container')");
  assert.equal(report.providerRequests.length,requests);await stage('drag');await shotWindow('panel-after-drag');
  const cancelGrip=await main.ev("(()=>{const r=document.querySelector('[data-floating=grip]').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
  await main.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...cancelGrip});
  await main.ev("{const g=document.querySelector('[data-floating=grip]');g.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1}));}void 0");
  await main.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...cancelGrip});
  await pass('Pointer cancel leaves no drag or action',"!document.querySelector('.veynrel-floating.is-dragging')&&!document.querySelector('.modal-container')&&ed.getSelection()==='Two facts stay unchanged.'");
  await model('fixture-style');await click(control('style'));await wait("!!document.querySelector('.veynrel-floating-style')");
  await pass('Consent is passive and hides the panel',"ed.getValue()===originalSource&&document.querySelector('.veynrel-floating').inert");assert.equal(report.providerRequests.length,requests);await stage('consent');await shotWindow('style-consent');
  await click('.veynrel-floating-consent input');await click(action('float-generate'));await stage('generate');await wait("!!document.querySelector('[data-style-state=preview]')");
  await pass('Real response is previewed without a live write','ed.getValue()===originalSource');await stage('preview');await shotWindow('style-preview');
  await click(action('float-apply'));await wait("!!document.querySelector('[data-style-state=applied]')");
  await pass('Apply changes only the captured selection',"ed.getValue()===originalSource.replace('Two facts stay unchanged.','Two facts remain unchanged.')");
  await stage('apply');await click(action('float-close'));await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);
  await pass('One native Undo restores the entire original','ed.getValue()===originalSource');await shotWindow('style-undo');
  await key('z','KeyZ',90,undefined,10);await pass('Style native Redo reapplies the exact range',"ed.getValue()===originalSource.replace('Two facts stay unchanged.','Two facts remain unchanged.')");await key('z','KeyZ',90,undefined,2);
  await main.ev('sourceLeaf.view.save()');
  await select();await click(control('style'));await escape();await stage('cancel');await pass('Escape closes only modal and restores origin',"!document.querySelector('.modal-container')&&document.activeElement.dataset.floating==='style'");
  const listeners = () => main.ev('({settings:plugin.languageModelListeners.size, author:plugin.recallAuthoring.listeners.size})');
  const initialListeners = await listeners();
  const closedRecall = async () => assert.deepEqual(await listeners(), initialListeners, 'Recall releases both modal subscriptions');
  // Changing model settings before consent disarms Generate even after restoring the original values.
  await model('fixture-recall');await select();await click(control('recall'));
  await main.ev("window.formerGenerate=document.querySelector('[data-health-action=recall-authoring-generate]');void 0");
  const beforeConsent = report.providerRequests.length;
  assert.deepEqual(await listeners(), {settings:initialListeners.settings+1,author:initialListeners.author+1});
  await main.ev("window.recallTemperature=plugin.settings.temperature;plugin.settings.temperature+=0.1;plugin.notifyLanguageModelSettingsChanged();plugin.settings.temperature=recallTemperature;plugin.notifyLanguageModelSettingsChanged();void 0");
  await pass('Settings change before consent removes Generate', "!document.querySelector('[data-health-action=recall-authoring-generate]')&&plugin.recallAuthoring.getSnapshot().state==='idle'");
  assert.equal(report.providerRequests.length,beforeConsent);await escape();await closedRecall();
  // Recall uses the same captured range and its existing generate+append consent, without a new preview.
  await model('fixture-recall');await select();await click(control('recall'));await wait(`!!document.querySelector('${action('recall-authoring-generate')}')`);await shotWindow('recall-consent');
  await main.ev('formerGenerate.click();plugin.notifyLanguageModelSettingsChanged();void 0');
  await pass('Closed modal controls cannot submit a new consent', "plugin.recallAuthoring.getSnapshot().state==='confirming'");
  assert.equal(report.providerRequests.length,beforeConsent);
  await click(action('recall-authoring-generate'));await wait("plugin.recallAuthoring.getSnapshot().result?.status==='success'");
  await pass('Recall inserts and updates its existing queue',"ed.getValue().includes('What protects edits?::Explicit review')&&plugin.recallAuthoring.getSnapshot().result.cardCount===3&&plugin.recallAuthoring.recall.getSnapshot().summary.active===4");await shotWindow('recall-inserted');
  await escape();await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);await pass('Recall native Undo restores original','ed.getValue()===originalSource');await main.ev('sourceLeaf.view.save()');await wait('plugin.recallAuthoring.recall.getSnapshot().summary.active===1');await shotWindow('recall-undo');
  await key('z','KeyZ',90,undefined,10);await pass('Recall native Redo restores generated cards',"ed.getValue().includes('What protects edits?::Explicit review')");await main.ev('sourceLeaf.view.save()');await wait('plugin.recallAuthoring.recall.getSnapshot().summary.active===4');await shotWindow('recall-redo');
  await key('z','KeyZ',90,undefined,2);await main.ev('sourceLeaf.view.save()');
  // Same real transport with controlled synthetic delay/error; no provider stubs in the plugin.
  const draft = async name => {
    await model(name);await main.ev('app.workspace.setActiveLeaf(sourceLeaf,{focus:true});void 0');if(await main.ev("document.querySelector('.veynrel-floating-body').hidden"))await click(control('toggle'));await select();await click(control('style'));await wait("!!document.querySelector('.veynrel-floating-style')");
    await click('.veynrel-floating-consent input');await click(action('float-generate'));
  };
  for(const change of ['cancel','source','provider','switch']) {
    await draft('fixture-delay');
    const reply = await pendingReply();
    if(change==='cancel')await escape();
    if(change==='source')await main.ev("ed.replaceRange('Owner edit ',{line:2,ch:0});void 0");
    if(change==='provider')await model('fixture-style');
    if(change==='switch')await main.ev("sourceLeaf.openFile(app.vault.getFileByPath('Other.md'),{state:{mode:'source'}})");
    await reply();
    if(change!=='cancel')await wait("!!document.querySelector('[data-style-state=conflict]')");
    if(change!=='cancel')await pass('Style '+change+' blocks late Apply',"!!document.querySelector('[data-style-state=conflict]')&&!document.querySelector('[data-health-action=float-apply]')");
    if(change!=='cancel')await shotWindow('style-conflict-'+change);
    if(change==='switch')await pass('Switch never writes old response into B',`sourceLeaf.view.editor.getValue()===${JSON.stringify("# Synthetic second note\n\n[[Source]]\n")}`);
    if(await main.ev("!!document.querySelector('.modal-container')"))await escape();
    if(change==='switch'){await main.ev("sourceLeaf.openFile(app.vault.getFileByPath('Source.md'),{state:{mode:'source'}})");await main.ev('window.ed=sourceLeaf.view.editor;void 0');}
    if(change==='source'){await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);}
    await main.ev('sourceLeaf.view.save()');await pass('Style '+change+' leaves original recoverable','ed.getValue()===originalSource');
  }
  await draft('fixture-timeout');
  for(let i=0;i<80;i++){if(await main.ev("!!document.querySelector('[data-style-state=error]')"))break;await pause(500);}
  await pass('Actual buffered timeout leaves source untouched',"!!document.querySelector('[data-style-state=error]')&&ed.getValue()===originalSource");await shotWindow('style-timeout');await escape();
  for (const change of ['cancel','provider','provider-cycle','tuning-cycle','source']) {
    await model('fixture-recall-delay');await select();await click(control('recall'));
    const count = report.providerRequests.length;
    await click(action('recall-authoring-generate'));
    const reply=await pendingReply();assert.equal(report.providerRequests.length,count+1);
    if (change === 'cancel') await click(action('float-cancel'));
    if (change.startsWith('provider')) {
      const changeProvider = provider => main.ev(`plugin.getLanguageModelSettingsPort().update({...plugin.getLanguageModelSettingsPort().get(),provider:'${provider}'})`);
      await changeProvider('custom');
      if (change === 'provider-cycle') await changeProvider('ollama');
    }
    if (change === 'tuning-cycle') await main.ev("plugin.settings.temperature+=0.1;plugin.notifyLanguageModelSettingsChanged();plugin.settings.temperature=recallTemperature;plugin.notifyLanguageModelSettingsChanged();void 0");
    if (change === 'source') await main.ev("ed.replaceRange('Owner edit ',{line:2,ch:0});void 0");
    await reply();
    await wait("plugin.recallAuthoring.getSnapshot().result?.reason==='conflict'");
    await pass('Recall '+change+' refuses the late response and preserves the queue',
      "!ed.getValue().includes('What protects edits?::Explicit review')&&plugin.recallAuthoring.recall.getSnapshot().summary.active===1");
    if (await main.ev("!!document.querySelector('.modal-container')")) await escape();
    await closedRecall();
    if (change==='source') {await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);}
    await main.ev('sourceLeaf.view.save()');
  }
  await draft('fixture-error');await wait("!!document.querySelector('[data-style-state=error]')");await pass('Provider error is safe and does not write','ed.getValue()===originalSource');await shotWindow('style-provider-error');await escape();
  await draft('fixture-style');await wait("!!document.querySelector('[data-style-state=preview]')");
  await main.ev("ed.replaceRange('Manual ',{line:2,ch:0});void 0");await click(action('float-apply'));
  await pass('Source changed at Apply refuses the transaction',"!!document.querySelector('[data-style-state=conflict]')&&ed.getValue().includes('Manual Two facts stay unchanged.')");await shotWindow('style-apply-conflict');await escape();await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);await main.ev('sourceLeaf.view.save()');
  await model('fixture-style');await main.ev("ed.setCursor({line:0,ch:0});ed.focus();void 0");await pause(50);await click(control('style'));
  await pass('No selection is explicitly whole-note',"document.querySelector('.veynrel-floating-style').textContent.includes('Whole note')");await click('.veynrel-floating-consent input');await click(action('float-generate'));await wait("!!document.querySelector('[data-style-state=preview]')");await click(action('float-apply'));await click(action('float-close'));await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);await pass('Whole-note Apply has native Undo','ed.getValue()===originalSource');await main.ev('sourceLeaf.view.save()');
  // A full Markdown fixture goes through the same real transport, editor transaction and native Undo.
  await main.ev(`window.protectedOriginal=${JSON.stringify('---\ntitle: Stable\n---\n# Unicode Я 😀\n\nTwo facts stay unchanged. [[Other]] `code()`\n\n```js\nf()\n```\n')};ed.setValue(protectedOriginal);ed.setCursor({line:0,ch:0});sourceLeaf.view.save()`);
  await main.ev('ed.focus();void 0');await pause(100);await click(control('style'));await click('.veynrel-floating-consent input');await click(action('float-generate'));await wait("!!document.querySelector('[data-style-state=preview]')");await click(action('float-apply'));await click(action('float-close'));
  await pass('Whole Markdown preserves YAML links code and Unicode',"ed.getValue()===protectedOriginal.replace('Two facts stay unchanged.','Two facts remain unchanged.')");await main.ev('ed.focus();void 0');await key('z','KeyZ',90,undefined,2);await pass('Protected whole-note native Undo','ed.getValue()===protectedOriginal');await main.ev('ed.setValue(originalSource);sourceLeaf.view.save()');
  const handoffRequests=report.providerRequests.length;
  await select();await click(control('tag'));await wait("!!document.querySelector('.veynrel-tool-explanation')");await pass('Tag explanation identifies whole exact file',"document.querySelector('.veynrel-tool-explanation').textContent.includes('Source.md')&&document.querySelector('.veynrel-tool-explanation').textContent.includes('Whole note')");await click(action('tool-info-open'));await wait("!!document.querySelector('.ai-local-note [role=alert]')");await pass('R05 open-editor refusal stays under the existing owner',"sourceLeaf.view.file.path==='Source.md'&&ed.getValue()===originalSource");await shotWindow('tag-existing-guard');await escape();
  await select();await click(control('atomize'));await click(action('tool-info-open'));await wait("!!document.querySelector('.veynrel-atom-source')");await pass('Atomization receives exact whole file',"document.querySelector('.veynrel-atom-source').textContent.includes('Source.md')");await shotWindow('atomization-whole-file');await escape();assert.equal(report.providerRequests.length,handoffRequests);
  await main.ev(`plugin.getSemanticSettingsPort().update({...plugin.settings.semantic,enabled:true,embeddingProvider:'ollama',embeddingModel:'overview-synthetic',embeddingBaseUrl:'${providerUrl}'})`);await main.ev('plugin.getSemanticController().refreshSemanticStatus()');
  await click(control('search'));await wait("!!document.querySelector('.ai-semantic-search-modal input')");await pass('Search opens passively without submitting selection',"document.querySelector('.ai-semantic-search-modal input').value===''");assert.equal(report.providerRequests.length,handoffRequests);await main.send('Input.insertText',{text:'ideas and connections'});await stage('search-typing');assert.equal(report.providerRequests.length,handoffRequests);await key('Enter','Enter',13,'\r');
  await wait("!!document.querySelector('.ai-semantic-result-card')||!!document.querySelector('.modal-button-container .mod-cta')");if(await main.ev("!!document.querySelector('.modal-button-container .mod-cta')"))await click('.modal-button-container .mod-cta');await wait("!!document.querySelector('.ai-semantic-result-card')");await shotWindow('panel-search-results');await escape();
  // A separate editor has its own source; the panel never reuses the previous Markdown on Canvas.
  await main.ev("window.panelSplit=app.workspace.getLeaf('split');panelSplit.openFile(app.vault.getFileByPath('Other.md'),{state:{mode:'source'}})");await main.ev('app.workspace.setActiveLeaf(panelSplit,{focus:true});void 0');
  await pass('Split shows the actual B source',"document.querySelector('.veynrel-floating-context').textContent.includes('Other.md')");await shotWindow('panel-split-B');await main.ev('panelSplit.detach();app.workspace.setActiveLeaf(sourceLeaf,{focus:true});void 0');
  await main.ev("window.nonMarkdown=app.workspace.getLeaf('tab');nonMarkdown.setViewState({type:'empty',active:true})");await pass('Non-Markdown disables all source actions',"document.querySelector('[data-floating=style]').disabled&&document.querySelector('[data-floating=search]').disabled");await shotWindow('panel-no-source');await main.ev('nonMarkdown.detach();app.workspace.setActiveLeaf(sourceLeaf,{focus:true});void 0');
  // Popout uses its own document, modal and focus. Main source remains independent.
  const openPopout = async () => {
    await main.ev("window.panelPop=app.workspace.getLeaf('window');panelPop.openFile(app.vault.getFileByPath('Other.md'),{state:{mode:'source'}})");await wait('panelPop.view.containerEl.ownerDocument!==document');await main.ev('app.workspace.setActiveLeaf(panelPop,{focus:true});void 0');
    let target;for(let i=0;i<100;i++){target=(await(await fetch(`${endpoint}/json/list`)).json()).find(t=>t.type==='page'&&t.id!==main.id);if(target)break;await pause(50);}assert(target);
    const pop=await connection(target);await focus(pop);await wait("document.querySelectorAll('.veynrel-floating').length===1",pop);
    return pop;
  };
  let pop=await openPopout();
  await pop.ev("document.querySelector('[data-floating=toggle]').click();document.querySelector('[data-floating=style]').focus();window.popClicks=0;document.querySelector('[data-floating=style]').addEventListener('click',()=>popClicks++);void 0");
  for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Enter',code:'Enter',windowsVirtualKeyCode:13,...(type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{})});
  report.popoutSource=await main.ev('(()=>{const p=plugin.floating.panels.get(panelPop.view.containerEl.ownerDocument);return{valid:p.source?.current(),hasModal:!!p.modal,hasLeaf:app.workspace.getLeavesOfType("markdown").includes(panelPop),mode:p.source?.mode,currentMode:panelPop.view.getMode(),ranges:p.source?.ranges.length}})()');
  report.popoutState=await pop.ev("({clicks:window.popClicks,source:document.querySelector('.veynrel-floating-context')?.textContent,disabled:document.querySelector('[data-floating=style]')?.disabled,modal:!!document.querySelector('.modal-container'),active:document.activeElement?.outerHTML})");await shot('panel-popout-attempt',pop,true);
  await pass('Popout modal is in the source document and panel is inert',"!!document.querySelector('.veynrel-floating-style')&&document.querySelector('.veynrel-floating').inert",pop);await shot('panel-popout-consent',pop,true);
  for(const type of ['keyDown','keyUp'])await pop.send('Input.dispatchKeyEvent',{type,key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await pause(50);
  await pass('Popout Escape restores exact originating control',"document.activeElement.dataset.floating==='style'",pop);
  await model('fixture-delay');
  const stylePopCount=report.providerRequests.length;
  await pop.ev("document.querySelector('[data-floating=style]').click();document.querySelector('.veynrel-floating-consent input').click();document.querySelector('[data-health-action=float-generate]').click();void 0");
  const styleReply=await pendingReply();assert.equal(report.providerRequests.length,stylePopCount+1);await main.ev('panelPop.detach();void 0');await styleReply();
  await pass('Closing pending Style popout preserves main source','ed.getValue()===originalSource');
  pop=await openPopout();await pop.ev("document.querySelector('[data-floating=toggle]').click();void 0");
  await model('fixture-recall-delay');
  const popCount = report.providerRequests.length;
  await pop.ev("document.querySelector('[data-floating=recall]').click();void 0");
  await pass('Recall consent belongs to the popout source', "document.querySelector('.veynrel-floating-recall .veynrel-recall-source')?.textContent==='Other.md'",pop);
  await pop.ev("document.querySelector('[data-health-action=recall-authoring-generate]').click();void 0");const recallReply=await pendingReply();assert.equal(report.providerRequests.length,popCount+1);
  await main.ev('panelPop.detach();void 0');await recallReply();
  await wait("!['generating','ingesting'].includes(plugin.recallAuthoring.getSnapshot().state)");
  await closedRecall();
  await pass('Closing pending Recall popout preserves main and original popout note',
    "(async()=>ed.getValue()===originalSource&&await app.vault.read(app.vault.getFileByPath('Other.md'))==='# Synthetic second note\\n\\n[[Source]]\\n'&&plugin.recallAuthoring.recall.getSnapshot().summary.active===1)()");
  await focus();await pass('Closing popout preserves one main toolbar',"document.querySelectorAll('.veynrel-floating').length===1");
  await main.ev("window.electronWindow.setContentSize(390,900);void 0");await wait('innerWidth===390');
  await pass('Floating stays inside 390px viewport',"(()=>{const r=document.querySelector('.veynrel-floating').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()");await shotWindow('panel-390');
  await pass('Panel fits central workspace below tabs and above status bar', "(()=>{const r=document.querySelector('.veynrel-floating').getBoundingClientRect(),root=document.querySelector('.workspace-split.mod-root'),b=root.getBoundingClientRect(),tab=root.querySelector('.workspace-tab-header-container').getBoundingClientRect(),status=document.querySelector('.status-bar').getBoundingClientRect();return r.left>=b.left&&r.right<=b.right&&r.top>=tab.bottom&&r.bottom<=Math.min(b.bottom,status.height?status.top:b.bottom)})()");
  await main.ev("window.electronWindow.webContents.setZoomFactor(1.4);void 0");await pause(100);await pass('Zoom clamps the toolbar',"(()=>{const r=document.querySelector('.veynrel-floating').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()");await main.ev("window.electronWindow.webContents.setZoomFactor(1);void 0");
  await main.send('Emulation.setEmulatedMedia' ,{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await pass('Reduced motion disables expansion animation',"getComputedStyle(document.querySelector('.veynrel-floating-body')).animationName==='none'");
  await main.ev("document.querySelector('[data-floating=grip]').focus();void 0");await key('ArrowLeft','ArrowLeft',37);await key('Home','Home',36);await shotWindow('panel-keyboard-reset');
  await escape();await pass('Escape collapses the toolbar',"document.querySelector('.veynrel-floating-body').hidden");
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-floating-actions');void 0");await wait("!document.querySelector('.veynrel-floating')");
  await main.ev("app.commands.executeCommandById('ai-knowledge-hub:veynrel-floating-actions');void 0");await wait("document.querySelectorAll('.veynrel-floating').length===1");
  await pass('Disable/re-enable has one instance',"document.querySelectorAll('.veynrel-floating').length===1");
  for(const lang of ['en','ru']) {
    await language(lang);await model('fixture-style');
    for(const theme of ['dark','light']) {
      await main.ev(`app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');void 0`);await wait(`document.body.classList.contains('theme-${theme}')`);
      for(const width of [1100,390]) {
        await main.ev(`window.electronWindow.setContentSize(${width},900);app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();void 0`);await wait(`innerWidth===${width}`);
        if(await main.ev("!document.querySelector('.veynrel-floating-body').hidden"))await click(control('collapse'));
        await shotWindow(`panel-collapsed-${lang}-${theme}-${width}`);await select();await click(control('toggle'));
        await pass(`Toolbar ${lang}/${theme}/${width} fits`,"(()=>{const r=document.querySelector('.veynrel-floating').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()");
        await shotWindow(`panel-expanded-${lang}-${theme}-${width}`);await click(control('style'));await shotWindow(`style-consent-${lang}-${theme}-${width}`);
        await click('.veynrel-floating-consent input');await click(action('float-generate'));await wait("!!document.querySelector('[data-style-state=preview]')");await shotWindow(`style-preview-${lang}-${theme}-${width}`);await escape();
      }
    }
  }
  await main.ev('sourceLeaf.view.save();void 0');await pause(150);
  await language('en');await draft('fixture-delay');const unloadReply=await pendingReply();
  await main.ev("app.plugins.disablePlugin('ai-knowledge-hub')");await unloadReply();
  await pass('Unload removes roots and blocks late pending writes',"!document.querySelector('.veynrel-floating')&&!document.querySelector('.veynrel-floating-style')&&ed.getValue()===originalSource");
  await main.ev("app.plugins.enablePlugin('ai-knowledge-hub')");await wait("!!app.plugins.plugins['ai-knowledge-hub']&&document.querySelectorAll('.veynrel-floating').length===1");await main.ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];void 0");
  await pass('Reload restores only bounded position and enabled flag',"(()=>{const p=plugin.settings.floatingActions,r=document.querySelector('.veynrel-floating').getBoundingClientRect();return Object.keys(p).sort().join(',')==='enabled,x,y'&&p.enabled&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})()");await shotWindow('panel-after-plugin-reload');
  report.floatingEvidence='Synthetic selected text, actual loopback buffered provider, native consent/preview/Apply/Undo and Recall generation/insertion/Undo/Redo. No paid model.';
}
