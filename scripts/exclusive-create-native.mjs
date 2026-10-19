// Native Linux gate only. No product command imports the candidate creator.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
const hash = data => createHash('sha256').update(data).digest('hex');
export async function exclusiveCreateScenario({ev,wait,cdp,root,vault,ROOT,restart}) {
  assert(vault===ROOT+'.esbuild/'+root.split('/').pop()+'/vault');
  const report={status:'RUNNING',cases:[],benchmark:[]};
  const save=()=>fs.writeFileSync(root+'/exclusive-create-v2.json',JSON.stringify(report,null,2)+'\n');
  const snapshot=()=>Object.fromEntries(fs.readdirSync(vault,{recursive:true}).filter(p=>p.endsWith('.md')&&!p.startsWith('Exclusive/')).sort().map(p=>[p,hash(fs.readFileSync(vault+'/'+p))]));
  const before=snapshot();
  const helper=vault+'/.obsidian/plugins/exclusive-gate-helper';fs.mkdirSync(helper,{recursive:true});
  fs.writeFileSync(helper+'/manifest.json',JSON.stringify({id:'exclusive-gate-helper',name:'Synthetic exclusive gate helper',version:'1.0.0',minAppVersion:'1.8.7',author:'test',description:'Disposable native fixture only',isDesktopOnly:true}));
  await build({absWorkingDir:ROOT,stdin:{resolveDir:ROOT,contents:`
    import {Plugin,Platform,FileSystemAdapter} from 'obsidian';
    import {inspectDesktopCreation} from './consolidation/desktopExclusiveCreate';
    import {readAtomizationObservation} from './consolidation/obsidianAtomization';
    import {readSavedNote,sameSavedNote} from './consolidation/savedNote';
    module.exports=class extends Plugin { onload(){
      const real=require('node:fs'),path=require('node:path');
      const x=window.exclusiveGate={inspectDesktopCreation,observe:readAtomizationObservation,readSavedNote,sameSavedNote,handles:[],events:[],beforeOpen:null,beforeWrite:null,afterSync:null,
        platform:{desktop:Platform.isDesktopApp,filesystemAdapter:this.app.vault.adapter instanceof FileSystemAdapter,node:process.versions.node,os:process.platform},real,path};
      const io={...real.promises,open:async(...args)=>{
        if(args[1]==='wx'&&x.beforeOpen)await x.beforeOpen(...args);
        const h=await real.promises.open(...args);x.handles.push(h);x.events.push({op:'open',flags:args[1],fd:h.fd});
        if(args[1]==='wx') {
          const write=h.writeFile.bind(h),sync=h.sync.bind(h);
          h.writeFile=async(...a)=>{if(x.beforeWrite)await x.beforeWrite();return write(...a)};
          h.sync=async()=>{await sync();if(x.afterSync)await x.afterSync()};
        }
        return h;
      }};
      x.load=()=>({fs:{...real,promises:io},path,platform:process.platform});
    }};`},bundle:true,platform:'node',format:'cjs',external:['obsidian'],outfile:helper+'/main.js'});
  fs.writeFileSync(vault+'/.obsidian/community-plugins.json',JSON.stringify(['ai-knowledge-hub','exclusive-gate-helper']));
  await ev("(async()=>{await app.plugins.loadManifests();await app.plugins.enablePlugin('exclusive-gate-helper')})()");await wait('!!window.exclusiveGate');
  await ev('window.x=exclusiveGate;void 0');
  fs.mkdirSync(vault+'/Exclusive');await wait('!!app.vault.getAbstractFileByPath("Exclusive")');
  report.platform=await ev('x.platform');report.statfs=fs.statfsSync(vault).type.toString(16);report.buildSha256=hash(fs.readFileSync(ROOT+'/main.js'));
  report.sourceSha256=Object.fromEntries(['consolidation/desktopExclusiveCreate.ts','consolidation/obsidianAtomization.ts','scripts/exclusive-create-native.mjs','scripts/atomization-native.mjs','scripts/pair-inspector-native.mjs'].map(p=>[p,hash(fs.readFileSync(ROOT+p))]));
  const body='# Verified Ω\r\n\r\nУсловие сохраняется дословно. 🪶\r\n\r\n[[Atomization/fact]]\r\n', competitor='# Competitor\n\nPreserve these bytes.\n';
  const record=(name,data)=>{report.cases.push({name,...data});save();console.log(name)};
  const result=expression=>ev(`(${expression}).then(value=>({ok:true,value}),e=>({ok:false,reason:e.reason,code:e.code,mayHaveCreated:e.mayHaveCreated,message:String(e)}))`);
  const create=(p,text=body)=>result(`x.cap.create(${JSON.stringify(p)},${JSON.stringify(text)})`);
  const assertClosed=async()=>assert(await ev('x.handles.every(h=>h.fd===-1)'),'All returned descriptors were closed');
  const read=p=>fs.readFileSync(vault+'/'+p,'utf8');
  const reset=()=>ev('x.beforeOpen=null;x.beforeWrite=null;x.afterSync=null;void 0');
  const capture=async(name,p)=>{
    await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
    await ev(`app.workspace.getLeaf(true).openFile(app.vault.getFileByPath(${JSON.stringify(p)}),{state:{mode:'source'}})`);
    await wait('app.workspace.getActiveFile()?.path==='+JSON.stringify(p));
    fs.writeFileSync(root+'/'+name+'.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
  };
  try {
    // Exercise default runtime loading, not only the injectable test loader.
    const defaults=await result("x.inspectDesktopCreation(app,'confirmed-local-unsynchronized').then(c=>({available:c.available,applyReady:c.applyReady,filesystem:c.filesystem,reason:c.reason}))");
    assert(defaults.ok&&defaults.value.available&&defaults.value.applyReady===false,JSON.stringify(defaults));record('Actual desktop API and lazy Node loading',defaults.value);
    await ev("x.inspectDesktopCreation(app,'confirmed-local-unsynchronized',x.load).then(c=>{x.cap=c})");
    for(const scope of ['unknown','network','synchronized']) {
      const r=await ev(`x.inspectDesktopCreation(app,${JSON.stringify(scope)}).then(c=>({available:c.available,reason:c.reason}))`);assert.equal(r.available,false);record('Refuse '+scope,r);
    }
    const unknown=await ev("x.inspectDesktopCreation({vault:{adapter:{}}},'confirmed-local-unsynchronized')");assert.equal(unknown.available,false);record('Refuse non-FileSystemAdapter',unknown);

    for(let i=0;i<10;i++) {
      const p='Exclusive/Legacy '+i+'.md';
      const r=await ev(`Promise.allSettled([app.vault.create(${JSON.stringify(p)},${JSON.stringify(competitor)}),app.vault.create(${JSON.stringify(p)},${JSON.stringify(body)})]).then(a=>a.map(r=>r.status))`);
      assert.deepEqual(r,['fulfilled','fulfilled']);assert.equal(read(p),body);record('PR98 red regression '+i,{outcomes:r,competingSurvived:false});
    }
    let p='Exclusive/Existing.md';fs.writeFileSync(vault+'/'+p,competitor);
    let r=await create(p);assert(!r.ok&&!r.mayHaveCreated);assert.equal(read(p),competitor);record('Existing competitor preserved',r);
    p='Exclusive/After preview.md';assert(!fs.existsSync(vault+'/'+p));fs.writeFileSync(vault+'/'+p,competitor,{flag:'wx'});
    r=await create(p);assert(!r.ok&&!r.mayHaveCreated);assert.equal(read(p),competitor);record('Competitor after preview preserved',r);

    p='Exclusive/Before open.md';
    await ev(`x.beforeOpen=()=>new Promise(resolve=>x.releaseCompetitor=resolve);x.atBoundary=x.cap.create(${JSON.stringify(p)},${JSON.stringify(body)}).then(()=>({ok:true}),e=>({ok:false,reason:e.reason,code:e.code,mayHaveCreated:e.mayHaveCreated}));void 0`);
    await wait('!!x.releaseCompetitor');fs.writeFileSync(vault+'/'+p,competitor,{flag:'wx'});
    r=await ev('x.releaseCompetitor();x.atBoundary');assert(!r.ok&&!r.mayHaveCreated&&r.code==='EEXIST');assert.equal(read(p),competitor);record('Independent process immediately before exclusive open preserved',r);await reset();
    for(let i=0;i<10;i++) {
      p='Exclusive/Exclusive race '+i+'.md';
      const r=await ev(`Promise.allSettled([x.cap.create(${JSON.stringify(p)},'first'),x.cap.create(${JSON.stringify(p)},'second')]).then(a=>a.map(r=>r.status==='fulfilled'?{ok:true,body:r.value.markdown}:{ok:false,reason:r.reason.reason,created:r.reason.mayHaveCreated}))`);
      assert.equal(r.filter(x=>x.ok).length,1);assert.equal(read(p),r.find(x=>x.ok).body);record('Exclusive concurrent pair '+i,{outcomes:r,winnerPreserved:true});
    }
    p='Exclusive/Vault wins.md';
    await ev(`x.beforeOpen=async()=>{await app.vault.create(${JSON.stringify(p)},${JSON.stringify(competitor)});x.beforeOpen=null};void 0`);
    r=await create(p);assert(!r.ok&&!r.mayHaveCreated);assert.equal(read(p),competitor);record('Concurrent public Vault.create wins and is preserved',r);await reset();

    // A later writer can still change an owned inode. Verification must refuse it.
    p='Exclusive/Later writer.md';r=await create(p);assert(r.ok);await ev(`x.created=${JSON.stringify(r.value)};void 0`);
    fs.writeFileSync(vault+'/'+p,competitor);r=await result('x.cap.verify(x.created)');assert(!r.ok);record('Later independent write revokes verification',r);
    // A stale Vault.create that passed exists before exclusive creation can overwrite afterwards.
    p='Exclusive/Stale Vault writer.md';
    await ev(`x.nativeWrite=app.vault.adapter.write;app.vault.adapter.write=function(path,...args){
      if(path===${JSON.stringify(p)})return new Promise(resolve=>x.resumeVault=resolve).then(()=>x.nativeWrite.call(this,path,...args));
      return x.nativeWrite.call(this,path,...args)};
      x.pendingVault=app.vault.create(${JSON.stringify(p)},${JSON.stringify(competitor)});void 0`);
    await wait('!!x.resumeVault');r=await create(p);assert(r.ok);await ev(`x.created=${JSON.stringify(r.value)};x.resumeVault();x.pendingVault.then(()=>null)`);
    await ev('app.vault.adapter.write=x.nativeWrite;void 0');assert.equal(read(p),competitor);
    r=await result('x.cap.verify(x.created)');assert(!r.ok);record('Stale Vault writer after exclusive create is detected',r);

    p='Exclusive/Опыт Ω 🪶.md';r=await create(p);assert(r.ok);assert.equal(read(p),body);await ev(`x.unicode=${JSON.stringify(r.value)};void 0`);
    const start=Date.now();
    await wait(`app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(p)}))?.headings?.[0]?.heading==='Verified Ω'&&app.metadataCache.resolvedLinks[${JSON.stringify(p)}]?.['Atomization/fact.md']===1`);
    assert.equal(await ev(`app.vault.read(app.vault.getFileByPath(${JSON.stringify(p)}))`),body);
    const cache=await ev(`app.metadataCache.getFileCache(app.vault.getFileByPath(${JSON.stringify(p)}))`);await result('x.cap.verify(x.unicode)').then(r=>assert(r.ok));
    record('Unicode/CRLF discovered through native watcher and coherent MetadataCache',{milliseconds:Date.now()-start,cache,identity:await ev('x.unicode.identity')});await capture('exclusive-unicode-created',p);
    fs.writeFileSync(vault+'/Exclusive/CASE.md',competitor);
    r=await create('Exclusive/case.md');assert(!r.ok&&!r.mayHaveCreated);assert.equal(read('Exclusive/CASE.md'),competitor);record('Case-normalized collision refused',r);

    fs.mkdirSync(root+'/outside');fs.writeFileSync(root+'/outside/Sentinel.md',competitor);
    fs.symlinkSync(root+'/outside',vault+'/Exclusive/Symlink');
    r=await create('Exclusive/Symlink/New.md');assert(!r.ok&&!r.mayHaveCreated);assert(!fs.existsSync(root+'/outside/New.md'));record('Symlink parent cannot escape vault',r);
    fs.symlinkSync(root+'/outside/Sentinel.md',vault+'/Exclusive/Final link.md');
    r=await create('Exclusive/Final link.md');assert(!r.ok&&!r.mayHaveCreated);assert.equal(fs.readFileSync(root+'/outside/Sentinel.md','utf8'),competitor);record('Final symlink preserves outside target',r);
    fs.symlinkSync(root+'/outside/Missing.md',vault+'/Exclusive/Dangling.md');r=await create('Exclusive/Dangling.md');assert(!r.ok&&!fs.existsSync(root+'/outside/Missing.md'));record('Dangling symlink refused',r);
    for(const p of ['../Escape.md','/tmp/Escape.md','Exclusive/Missing/New.md']) {r=await create(p);assert(!r.ok&&!r.mayHaveCreated);record('Invalid or missing parent '+p,r)}
    fs.mkdirSync(vault+'/Exclusive/Denied',0o500);r=await create('Exclusive/Denied/New.md');assert(!r.ok&&!r.mayHaveCreated&&r.code==='EACCES');record('Permission error without creation',r);fs.chmodSync(vault+'/Exclusive/Denied',0o700);

    // Pinning prevents a symlink replacement from redirecting the open to a foreign directory.
    fs.mkdirSync(vault+'/Exclusive/Swap');p='Exclusive/Swap/New.md';
    await ev(`x.beforeOpen=async()=>{await x.real.promises.rename(${JSON.stringify(vault+'/Exclusive/Swap')},${JSON.stringify(vault+'/Exclusive/Swap moved')});await x.real.promises.symlink(${JSON.stringify(root+'/outside')},${JSON.stringify(vault+'/Exclusive/Swap')});x.beforeOpen=null};void 0`);
    r=await create(p);assert(!r.ok&&r.mayHaveCreated);assert(!fs.existsSync(root+'/outside/New.md'));assert.equal(read('Exclusive/Swap moved/New.md'),'');record('Parent replaced by symlink: no escape, empty evidence retained',r);await reset();
    await assertClosed();
    // A directory descriptor prevents symlink traversal, but it is not an atomic vault-boundary lock.
    const otherVault=ROOT+'.esbuild/'+root.split('/').pop()+'/boundary-synthetic-vault';fs.mkdirSync(otherVault);
    fs.mkdirSync(vault+'/Exclusive/Relocate');
    await ev(`x.beforeOpen=async()=>{await x.real.promises.rename(${JSON.stringify(vault+'/Exclusive/Relocate')},${JSON.stringify(otherVault+'/Moved')});x.beforeOpen=null};void 0`);
    r=await create('Exclusive/Relocate/New.md');assert(!r.ok&&r.mayHaveCreated);assert.equal(fs.readFileSync(otherVault+'/Moved/New.md','utf8'),'');
    record('BLOCKER: parent moved to a second synthetic vault before exclusive open',{...r,foreignBytesOverwritten:false,emptyFileOutsideOriginalVault:true});
    report.applyGate='BLOCKED_PARENT_RELOCATION';await reset();await assertClosed();

    p='Exclusive/Write error.md';await ev("x.beforeWrite=async()=>{throw Object.assign(Error('injected write error'),{code:'EIO'})};void 0");
    r=await create(p);assert(!r.ok&&r.mayHaveCreated);assert.equal(read(p),'');record('Write error retains empty file, closes all descriptors',r);await reset();await assertClosed();

    // Source deletion/recreation is a distinct Apply precondition, not supplied by O_EXCL.
    p='Exclusive/Source.md';fs.writeFileSync(vault+'/'+p,'Source before.');await wait('!!app.vault.getFileByPath("Exclusive/Source.md")');
    await ev("x.readSavedNote(app,'Exclusive/Source.md').then(s=>{x.sourceBefore=s})");
    fs.unlinkSync(vault+'/'+p);await wait('!app.vault.getFileByPath("Exclusive/Source.md")');
    assert.equal(await ev("x.readSavedNote(app,'Exclusive/Source.md').then(r=>r.state)"),'missing');
    fs.writeFileSync(vault+'/'+p,'Source before.',{flag:'wx'});await wait('!!app.vault.getFileByPath("Exclusive/Source.md")');
    assert.equal(await ev("x.readSavedNote(app,'Exclusive/Source.md').then(r=>r.state==='ready'&&x.sameSavedNote(x.sourceBefore,r))"),false);
    record('External source delete/recreate fails saved-source identity guard',{createDispatched:false});

    // Real SIGKILL in native Obsidian, while the descriptor owns an empty file.
    await assertClosed();await ev("x.beforeWrite=()=>new Promise(resolve=>x.releaseCrash=resolve);void x.cap.create('Exclusive/Crash empty.md','unfinished').catch(()=>{})");await wait('!!x.releaseCrash');assert.equal(read('Exclusive/Crash empty.md'),'');
    await restart();await wait('!!window.exclusiveGate');await ev("window.x=exclusiveGate;x.inspectDesktopCreation(app,'confirmed-local-unsynchronized',x.load).then(c=>{x.cap=c})");
    assert.equal(read('Exclusive/Crash empty.md'),'');r=await create('Exclusive/Crash empty.md');assert(!r.ok&&!r.mayHaveCreated);record('SIGKILL after empty create: restart performs no retry or cleanup',r);

    // Remove only this gate's symlink fixtures before metadata completeness/scale checks.
    for(const name of ['Symlink','Final link.md','Dangling.md','Swap']) {fs.unlinkSync(vault+'/Exclusive/'+name);await wait('!app.vault.getAbstractFileByPath('+JSON.stringify('Exclusive/'+name)+')')}
    // Native empty cache now admits only an exact zero-byte proof.
    fs.writeFileSync(vault+'/Exclusive/Confirmed empty.md','');await wait('!!app.vault.getFileByPath("Exclusive/Confirmed empty.md")&&!!app.metadataCache.getFileCache(app.vault.getFileByPath("Exclusive/Confirmed empty.md"))');
    await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f))');
    const obs=await ev("x.observe(app,'Atoms/Unique future.md','Atomization/fact.md').then(o=>({complete:o.metadataComplete,empty:o.inventory.filter(f=>f.emptyVerified)}))");
    report.emptyDiagnostics=await ev("Promise.all(app.vault.getMarkdownFiles().filter(f=>!app.metadataCache.getFileCache(f)?.sections).map(async f=>({path:f.path,stat:f.stat,disk:await app.vault.adapter.stat(f.path),cache:app.metadataCache.getFileCache(f),resolved:app.metadataCache.resolvedLinks[f.path],unresolved:app.metadataCache.unresolvedLinks[f.path]})))");report.emptyObservation=obs;save();
    assert(obs.complete&&obs.empty.some(f=>f.path==='Exclusive/Confirmed empty.md'));record('Native empty note verified without fabricating sections',obs);
    // Other fault fixtures are also empty: replace only test-owned empty targets before the scale measurement.
    for(const p of fs.readdirSync(vault+'/Exclusive',{recursive:true}).filter(p=>p.endsWith('.md'))) {
      const full=vault+'/Exclusive/'+p;if(fs.lstatSync(full).isSymbolicLink())continue;
      if(fs.statSync(full).size===0&&p!=='Confirmed empty.md')fs.writeFileSync(full,'Synthetic recovered test fixture.');
    }
    for(const n of [1000,10000]) {
      fs.mkdirSync(vault+'/Exclusive/Scale',{recursive:true});
      for(let i=n===1000?0:1000;i<n;i++)fs.writeFileSync(vault+`/Exclusive/Scale/Note ${i}.md`,`---\naliases: [Scale alias ${i}]\n---\nSynthetic paragraph ${i}.\n\n[[Missing ${i}]]\n`);
      for(let i=0;i<240;i++){if(await ev(`app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('Exclusive/Scale/')&&app.metadataCache.getFileCache(f)?.sections).length===${n}`))break;if(i===239)throw Error('Metadata scale timeout');await new Promise(r=>setTimeout(r,250))}
      const samples=await ev(`(async()=>{const samples=[],read=app.vault.read;let reads=[];app.vault.read=function(f){reads.push(f.path);return read.call(this,f)};try{for(let i=0;i<8;i++){reads=[];const t=performance.now(),o=await x.observe(app,'Atoms/Unique future.md','Atomization/fact.md');if(!o.metadataComplete)throw Error('Incomplete scale observation');const ms=performance.now()-t;if(i)samples.push({ms,files:o.inventory.length,bytes:new TextEncoder().encode(JSON.stringify(o)).length,reads})}return samples}finally{app.vault.read=read}})()`);
      assert(samples.every(s=>s.reads.every(p=>p==='Exclusive/Confirmed empty.md')));const times=samples.map(s=>s.ms).sort((a,b)=>a-b);report.benchmark.push({notes:n,medianMs:times[3],maxMs:times.at(-1),samples});save();console.log('Scale',n,times[3]);
    }
    assert.deepEqual(snapshot(),before);await assertClosed();report.sourcesUnchanged=true;report.sourceHashes=before;report.status='PASS';save();return report;
  }catch(e){report.status='FAIL';report.error=String(e);save();throw e}
  finally{await ev('if(window.x?.nativeWrite)app.vault.adapter.write=x.nativeWrite;void 0')}
}
