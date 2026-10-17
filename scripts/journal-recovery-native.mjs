// Synthetic DataAdapter fault injection and actual SIGKILL, never a personal vault.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {safeApplyHarness} from './safe-apply-native.mjs';
export async function journalRecoveryScenario(context) {
  const {ev,wait,cdp,root,vault,ROOT,restart}=context, checks=[];
  const h=safeApplyHarness(context,['Recovery/English/Same.md','Recovery/Русский/Same.md']);
  const {a,b,setup,plan,apply,history,click,closeAll}=h;
  const pass=async(name,expr)=>{assert(await ev(expr),name);checks.push(name);console.log(name);};
  const shot=async name=>{await cdp('Input.dispatchMouseEvent',{type:'mouseMoved',x:0,y:0});fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));};
  const rowExpr=id=>`(await plugin.safeApply.history()).find(r=>r.id===${JSON.stringify(id)})`;
  const rowSelector=id=>`[data-operation-id="${id}"]`;
  const openResolution=async id=>{await history();await click(rowSelector(id)+' [data-safe-action=resolve]');await wait("!!document.querySelector('.ai-journal-resolution [data-safe-action=resolveConfirm]')");};
  const confirm=async()=>{await click('.ai-journal-resolution [data-safe-action=resolveConfirm]');await wait("!!document.querySelector('.ai-journal-resolution [data-safe-action=history]')");};
  const journal=vault+'/.obsidian/plugins/ai-knowledge-hub/consolidation-operations';
  const hashes=dir=>Object.fromEntries(fs.readdirSync(dir).map(n=>[n,createHash('sha256').update(fs.readFileSync(dir+'/'+n)).digest('hex')]));
  await setup();await plan();await apply();
  const firstId=await ev(`(async()=>{return (await plugin.safeApply.history()).find(r=>r.record?.sourcePath===${JSON.stringify(a)}).id})()`);
  const dir=journal+'/'+firstId, saved=fs.readFileSync(vault+'/'+a,'utf8');
  fs.writeFileSync(dir+'/backup.json','{"version":1,');const originals=hashes(dir);
  await restart();await history();
  await pass('After real Apply and restart: partial backup has a local blocker and exact after evidence',`(async()=>{const r=${rowExpr(firstId)};return r.scope==='local'&&r.canResolve&&!r.canUndo&&r.sourceState==='after'&&r.issues.some(i=>i.code==='invalid_json')})()`);
  await pass('Affected source and target are blocked; unrelated paths are not',`(async()=>{for(const path of ${JSON.stringify([a,b])}){try{await plugin.safeApply.checkBlockers([path]);return false}catch(e){if(e.reason!=='storage')return false}}await plugin.safeApply.checkBlockers(['Independent/A.md','Independent/B.md']);return true})()`);
  await shot('journal-diagnostics');
  // Preview has no disk writes, even across language/theme/width changes.
  for(const language of ['en','ru']) {
    await closeAll();await ev("app.setting.open();app.setting.openTabById('ai-knowledge-hub');void 0");
    await ev(`{const e=[...app.setting.modalEl.querySelectorAll('select')].find(e=>[...e.options].some(o=>o.value==='ru'));e.value='${language}';e.dispatchEvent(new Event('change'));}void 0`);
    await ev('plugin.settingsSave');await ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');await ev('app.setting.close();void 0');
    await openResolution(firstId);
    for(const theme of ['theme-light','theme-dark'])for(const width of [1200,390]) {
      await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
      await ev(`document.body.removeClass('theme-light','theme-dark');document.body.addClass('${theme}');document.querySelector('.ai-journal-resolution details').open=true;void 0`);
      await pass(`${language} ${theme} ${width}: localized resolution review fits, with literal text and separate confirmation`,"[...document.querySelectorAll('.ai-journal-resolution,.ai-journal-resolution pre,.ai-journal-resolution .ai-proposal-diff,.ai-operation-history,.ai-operation-history .ai-semantic-result-card')].every(e=>e.scrollWidth<=e.clientWidth+1)&&!document.querySelector('.ai-journal-resolution').textContent.includes('@journal.')&&!document.querySelector('.ai-journal-resolution img,.ai-journal-resolution iframe')&&!!document.querySelector('.ai-journal-resolution [data-safe-action=resolveConfirm]')&&!document.querySelector('.ai-journal-resolution [data-safe-action=undo]')");
      await shot(`journal-${language}-${theme}-${width}`);
      if(theme==='theme-dark'&&width===390) {
        await ev("document.querySelector('.ai-journal-resolution [data-safe-action=resolveConfirm]').scrollIntoView({block:'center'});void 0");
        await shot(`journal-${language}-confirmation-390`);
      }
    }
  }
  assert.deepEqual(hashes(dir),originals);assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),saved);checks.push('All previews preserve journal and Markdown bytes');
  await ev("document.querySelector('.ai-journal-resolution [data-safe-action=resolveConfirm]').focus();void 0");
  await pass('Confirmation can receive keyboard focus',"document.activeElement?.dataset.safeAction==='resolveConfirm'");
  await confirm();await restart();await history();
  await pass('Explicit resolution survives restart, stays separate from Undo, and releases only this incident',`(async()=>{const r=${rowExpr(firstId)};await plugin.safeApply.checkBlockers(${JSON.stringify([a,b])});return r.state==='resolved'&&!r.canUndo&&!r.canResolve&&r.damaged})()`);
  for(const[name,hash]of Object.entries(originals))assert.equal(hashes(dir)[name],hash);
  assert.equal(fs.readFileSync(vault+'/'+a,'utf8'),saved);checks.push('Resolution retained every original journal byte and exact saved Markdown');
  await shot('journal-resolved-after-restart');
  // A real independent operation still goes through the existing native Apply path.
  const independent=safeApplyHarness(context,['Independent/One.md','Independent/Two.md']);
  await independent.setup();await independent.plan();await independent.apply();
  assert.equal(fs.readFileSync(vault+'/'+independent.a,'utf8'),await ev('safePlan.after'));checks.push('Independent native Apply succeeds alongside retained incidents');
  for(const point of ['intent','commit','acknowledgement']) {
    const paths=[`Fault/${point}/A.md`,`Fault/${point}/B.md`], f=safeApplyHarness(context,paths);
    await f.setup();await f.plan();await f.apply();
    const id=await ev(`(async()=>{return (await plugin.safeApply.history()).find(r=>r.record?.sourcePath===${JSON.stringify(paths[0])}).id})()`);
    const opdir=journal+'/'+id, content=fs.readFileSync(vault+'/'+paths[0],'utf8');
    fs.writeFileSync(opdir+'/backup.json','{torn');const before=hashes(opdir);
    await openResolution(id);
    await ev(`window.crashReached=false;{const adapter=plugin.safeApply.journal.adapter,write=adapter.write.bind(adapter),read=adapter.read.bind(adapter);
      ${point==='acknowledgement'?`adapter.read=async path=>{if(path.includes('/${id}/resolution-')&&path.endsWith('.commit.json')){crashReached=true;return new Promise(()=>{})}return read(path)}`:
      `adapter.write=async(path,data,...rest)=>{if(path.includes('/${id}/resolution-')&&${point==='commit'?"path.endsWith('.commit.json')":"!path.endsWith('.commit.json')"}){await write(path,data.slice(0,24),...rest);crashReached=true;return new Promise(()=>{})}return write(path,data,...rest)}`}
    }void 0`);
    await click('.ai-journal-resolution [data-safe-action=resolveConfirm]');await wait('crashReached');
    const interrupted=hashes(opdir);await restart();await history();
    if(point==='acknowledgement') {
      await pass('SIGKILL after complete commit, before readback: decision recovered, no Markdown replay',`(async()=>{const r=${rowExpr(id)};return r.state==='resolved'&&!r.canUndo})()`);
    } else {
      await pass(`SIGKILL during ${point}: torn attempt cannot unblock and fresh review remains possible`, `(async()=>{const r=${rowExpr(id)};return r.state==='conflict'&&r.canResolve&&!r.resolution&&r.resolutionAttempts.some(e=>e.status!=='valid')})()`);
      await shot(`journal-killed-${point}`);
      await openResolution(id);await confirm();await restart();await history();
      await pass(`New uniquely named attempt after ${point} interruption persists`, `(async()=>{const r=${rowExpr(id)};return r.state==='resolved'&&!r.canUndo})()`);
    }
    for(const[name,hash]of Object.entries({...before,...interrupted}))assert.equal(hashes(opdir)[name],hash);
    assert.equal(fs.readFileSync(vault+'/'+paths[0],'utf8'),content);checks.push(point+': original and interrupted evidence retained, no Markdown changed');
  }
  // Refusal: later user changes retain the source and cannot be waived by a click.
  const refusal=safeApplyHarness(context,['Refusal/A.md','Refusal/B.md']);await refusal.setup();await refusal.plan();await refusal.apply();
  const refusalId=await ev("(async()=>{return (await plugin.safeApply.history()).find(r=>r.record?.sourcePath==='Refusal/A.md').id})()");
  fs.writeFileSync(journal+'/'+refusalId+'/backup.json','{bad');
  fs.appendFileSync(vault+'/Refusal/A.md','\nLATER USER TEXT\n');
  await wait("app.vault.read(app.vault.getFileByPath('Refusal/A.md')).then(s=>s.includes('LATER USER TEXT'))");await history();
  await pass('Later user text blocks resolution and Undo while showing the verified backup',`(async()=>{const r=${rowExpr(refusalId)};return r.sourceState==='different'&&!r.canResolve&&!r.canUndo&&r.record.before.length>0})()`);
  await shot('journal-refusal');
  await pass('Native recovery and resolution made no network requests','io.network===0');
  return {status:'PASS',checks,artifactSha256:createHash('sha256').update(fs.readFileSync(ROOT+'/main.js')).digest('hex'),originals,
    limits:'Actual Linux desktop and process SIGKILL with DataAdapter fault injection. No power-loss/fsync guarantee, mobile, independent concurrent vault processes, remote sync, screen reader or live LLM acceptance.'};
}
