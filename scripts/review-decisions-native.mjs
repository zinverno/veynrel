// Companion to review-flow-native.mjs: product state and native input, no provider request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
export async function reviewDecisionChecks(c) {
 const {ev,wait,click,clickSelector,shot,startVideo,stopVideo,pass,openPair,locale,field,cdp,pause,settle,
   vault,dir,root,pairPaths,before,markdown,requests,checks,metrics,screenshots,sourceCommit}=c;
 const id=JSON.stringify([...pairPaths].sort()), selector=`[data-pair-id=${JSON.stringify(id)}]`;
 const exists=`!!document.querySelector(${JSON.stringify(selector)})`;
 const ready=()=>wait('!hv.workbench.facts?.running&&!hv.workbench.facts?.dirty.size');
 const dataPath=dir+'/review-decisions.json';
 const unchanged=()=>assert.deepEqual(markdown(vault),before);
 await field('[data-health-action=scope-picker]','Workbench');await wait("hv.areaIndex.selection.path==='Workbench'");
 await click('review-refresh');await wait('!hv.workbench.data.busy');await ready();
 await field('[data-health-action=review-search]','Cache','input');await ready();
 await startVideo('leave-refresh-restart-restore');
 await shot('01-active-list');await openPair('Cache');await shot('02-pair');
 await pass('One leave action; dismiss recommendation is absent',"document.querySelectorAll('[data-review-keep]').length===1&&!document.querySelector('[data-relationship-action=dismiss]')");
 await ev("document.querySelector('[data-review-keep]').focus();void 0");
 await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 await wait("!!document.querySelector('[data-review-decision-saved]')");await ready();await shot('03-left-unchanged');await pause(800);
 await pass('Save closes pair, keeps scope/query, updates active queue',`!hv.workbench.stopReview&&!(${exists})&&hv.areaIndex.selection.path==='Workbench'&&document.querySelector('[data-health-action=review-search]').value==='Cache'`);
 assert.equal(JSON.parse(fs.readFileSync(dataPath,'utf8')).decisions.length,1);unchanged();
 await click('review-refresh');await wait('!hv.workbench.data.busy');await ready();
 await pass('Candidate refresh preserves the decision',`!(${exists})`);await shot('04-refresh');
 await click('nav-home');await wait("hv.route.page==='home'");
 await click('nav-discover');await wait("hv.route.page==='discover'&&!!document.querySelector('[data-health-action=review-refresh]')");
 await click('review-refresh');await wait('!hv.workbench.data.busy');await ready();
 await pass('Switching section does not restore an unchanged pair',`!(${exists})`);
 await shot('05-before-restart');await pause(800);
 await ev("await app.plugins.disablePlugin('ai-knowledge-hub');await app.plugins.enablePlugin('ai-knowledge-hub');void 0");
 await wait("!!app.commands.commands['ai-knowledge-hub:veynrel-review-vault']");
 await ev("window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;app.commands.executeCommandById('ai-knowledge-hub:veynrel-review-vault');void 0");
 await wait("!!app.workspace.getLeavesOfType('veynrel-health')[0]?.view.workbench");
 await ev("window.hv=app.workspace.getLeavesOfType('veynrel-health')[0].view;void 0");
 await click('review-refresh');await wait('!hv.workbench.data.busy');await ready();
 await pass('Real disable/enable reloads decisions and still excludes pair',`!(${exists})&&!!document.querySelector('[data-health-action=review-reviewed]')`);
 await shot('06-after-restart');await click('review-reviewed');await shot('07-reviewed');await pause(900);
 await clickSelector('[data-review-restore]');await ready();await wait(exists);await shot('08-restored');await stopVideo();
 await pass('Reviewed restores a pair after restart without Markdown Undo',exists);unchanged();assert.equal(requests.length,0);
 // Back, request cancellation and a storage failure cannot decide for the user.
 await openPair('Cache');await click('review-back');await ready();await pass('Ordinary Back does not decide',exists);
 await openPair('Cache');await clickSelector('[data-relationship-action=analyze]');await wait("!!document.querySelector('[data-relationship-action=confirm]')");
 await clickSelector('[data-relationship-action=cancel]');await click('review-back');await ready();
 await pass('Cancelling consent neither sends nor decides',exists);assert.equal(requests.length,0);
 await openPair('Cache');
 await ev("window.realDecisionWrite=app.vault.adapter.write.bind(app.vault.adapter);app.vault.adapter.write=async(p,text,...args)=>{if(p.endsWith('/review-decisions.json.tmp'))throw Error('Synthetic persistence failure');return realDecisionWrite(p,text,...args)};void 0");
 await clickSelector('[data-review-keep]');await wait("document.querySelector('[data-review-decision-status]').textContent.includes('Не удалось сохранить')");await shot('09-save-refused');
 await pass('Save failure stays in comparison and commits no decision',"!!hv.workbench.stopReview&&!!document.querySelector('[data-review-keep]:not(:disabled)')");
 assert.equal(JSON.parse(fs.readFileSync(dataPath,'utf8')).decisions.length,0);unchanged();
 await click('review-back');await ready();await pass('Failed save leaves candidate active',exists);
 await ev('app.vault.adapter.write=realDecisionWrite;void 0');
 // Reverse actual pair owner, same canonical path/content identity.
 await openPair('Cache');
 await ev(`{const host=hv.contentEl.querySelector('.ai-pair-inspector');hv.workbench.stopReview();hv.workbench.stopReview=engine.mountPairReview(host,${JSON.stringify([...pairPaths].reverse())},()=>hv.workbench.back());}void 0`);
 await wait("!!document.querySelector('[data-review-keep]:not(:disabled)')");await clickSelector('[data-review-keep]');await wait('!hv.workbench.stopReview');await ready();
 await pass('Reverse A/B suppresses the same canonical pair',`!(${exists})`);
 const record=JSON.parse(fs.readFileSync(dataPath,'utf8')).decisions[0];assert.deepEqual(record.notes.map(n=>n.path),[...pairPaths].sort());
 await click('review-connections');await click('review-refresh');await wait('!hv.workbench.data.busy');await ready();
 await pass('Connections active queue respects the same decision',`!(${exists})`);
 await click('review-repeats');await ready();
 // A native storage touch with identical Markdown must not invalidate; an actual edit must.
 assert.equal(await ev('app.vault.adapter.basePath'),vault);
 await ev(`{const f=app.vault.getFileByPath(${JSON.stringify(pairPaths[0])});await app.vault.modify(f,await app.vault.read(f));}void 0`);await ready();
 await pass('Identical text rewrite does not invalidate the decision',`!(${exists})`);unchanged();
 fs.writeFileSync(root+'/unchanged-before-content-test.json',JSON.stringify(markdown(vault),null,2));
 const edited=fs.readFileSync(vault+'/'+pairPaths[0],'utf8')+'\nA separate synthetic edit reopens review.\n';
 await ev(`await app.vault.modify(app.vault.getFileByPath(${JSON.stringify(pairPaths[0])}),${JSON.stringify(edited)});void 0`);
 await wait(exists);await ready();await shot('10-changed-text');
 await pass('Changed Markdown revives pair without deleting the old decision',`${exists}&&!!document.querySelector('[data-health-action=review-reviewed]')`);
 const hashes=markdown(vault);for(const p of Object.keys(before))if(p!==pairPaths[0])assert.equal(hashes[p],before[p]);
 checks.push('Full Markdown hashes unchanged through decision/refresh/restart/restore/failure; separate edit affects exactly one synthetic file');
 // Both themes/languages at normal and narrow widths, on the accepted source-note presentation.
 for(const language of ['ru','en']) {
   await locale(language);
   for(const theme of ['theme-dark','theme-light'])for(const width of [1280,390]) {
     await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
     await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');void 0`);
     await openPair('Cache');await shot(`pair-${language}-${theme}-${width}`);
     await pass(`Leave control fits ${language} ${theme} ${width}`,"(()=>{const e=document.querySelector('[data-review-keep]');const r=e.getBoundingClientRect();return !e.disabled&&r.width>0&&r.left>=0&&r.right<=innerWidth&&!document.querySelector('[data-relationship-action=dismiss]')})()");
     await click('review-back');await ready();await shot(`list-${language}-${theme}-${width}`);
   }
 }
 assert.equal(requests.length,0);
 metrics.runtime=await ev("({obsidian:require('@electron/remote').app.getVersion(),electron:process.versions.electron})");
 fs.writeFileSync(root+'/report.json',JSON.stringify({status:'native decision regression',sourceCommit,checks,metrics,screenshots,httpRequests:requests.length,
   originalMarkdown:before,afterContentTest:hashes,limitations:'No live model; no personal vault or TEST installation. One explicit synthetic content edit follows all unchanged-hash checks.'},null,2));
 console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
}
