// Run only via pair-inspector-native.mjs with --atomization --atomization-create-gate.
// This probes public Vault.create in a disposable vault; it is NOT an Apply executor.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

export async function atomizationCreateGate({ev, wait, cdp, root, vault, ROOT}) {
  assert(root.startsWith('/tmp/pair-inspector-') && !root.includes('..') && vault === root+'/vault');
  const report = {gate:'NOT_RUN', cases:[], benchmark:[], limits:[
    'Linux desktop filesystem adapter only; no mobile or other adapter guarantee.',
    'Barriers delay a real API call without changing its exists result or its writer.',
    'Synthetic competing creates are test actions, not product Apply or a model request.',
    'No Apply/Undo journal, ownership receipt, trash or crash-recovery executor is connected.'
  ]};
  const save = () => fs.writeFileSync(root+'/atomization-create-gate.json', JSON.stringify(report,null,2)+'\n');
  const snapshot = () => Object.fromEntries(fs.readdirSync(vault,{recursive:true})
    .filter(p => (p.endsWith('.md') || /consolidation-/.test(p)) && !p.startsWith('Creation gate/'))
    .filter(p => fs.statSync(vault+'/'+p).isFile()).sort().map(p => [p,hash(fs.readFileSync(vault+'/'+p))]));
  const before = snapshot(), planned = '# Verified atom\n\nA synthetic observation.\n\nSource: [[Atomization/fact]]\n\n<!-- veynrel-atomization: synthetic-gate-only -->\n';
  const competing = '# Independent note\n\nCOMPETING WRITER: this text must survive.\n';
  fs.mkdirSync(vault+'/Creation gate');
  await wait('!!app.vault.getAbstractFileByPath("Creation gate")');
  report.artifactSha256 = hash(fs.readFileSync(ROOT+'/main.js'));
  report.version = await ev('({obsidian:document.title.match(/Obsidian ([0-9.]+)/)?.[1],electron:process.versions.electron})');
  const methods = await ev(`({create:Object.getPrototypeOf(app.vault).create.toString(),write:app.vault.adapter.write.toString()})`);
  // Retain installed-source diagnostics locally, not as distributed Obsidian source code.
  fs.writeFileSync(root+'/creation-api.json',JSON.stringify(methods,null,2)+'\n');
  report.apiFingerprint = {create:hash(methods.create),write:hash(methods.write)};
  await ev(`window.gate={planned:${JSON.stringify(planned)},competing:${JSON.stringify(competing)},
    originalWrite:app.vault.adapter.write,originalRead:app.vault.read,networkBefore:io.network,
    observe:window.atomSession?.deps.atomizationObservation};void 0`);
  const row = async (name,path,outcome,expected) => {
    const content=fs.readFileSync(vault+'/'+path,'utf8');
    const r={name,path,outcome,content,sha256:hash(content),competingSurvived:content===competing};
    report.cases.push(r);save();assert.equal(content,expected,name);return r;
  };
  const create = (path,text) => ev(`app.vault.create(${JSON.stringify(path)},${JSON.stringify(text)}).then(f=>({status:'fulfilled',path:f?.path}),e=>({status:'rejected',error:String(e)}))`);
  // Pause at the public adapter boundary after Vault.create's own absence check.
  const pauseCreate = async path => {
    await ev(`gate.path=${JSON.stringify(path)};gate.paused=false;gate.resume=undefined;
      app.vault.adapter.write=function(path,...args){
        if(path===gate.path&&!gate.paused){gate.paused=true;return new Promise(resolve=>gate.resume=resolve).then(()=>gate.originalWrite.call(this,path,...args))}
        return gate.originalWrite.call(this,path,...args)
      };
      gate.pending=app.vault.create(gate.path,gate.planned).then(f=>({status:'fulfilled',path:f?.path}),e=>({status:'rejected',error:String(e)}));void 0`);
    await wait('gate.paused&&!!gate.resume');
    assert(!fs.existsSync(vault+'/'+path),'first create passed absence check while target is absent');
  };
  const resumeCreate = async () => {
    const result=await ev('gate.resume();gate.pending');
    await ev('app.vault.adapter.write=gate.originalWrite;void 0');return result;
  };
  try {
    assert(await ev('typeof gate.observe==="function"'),'Run with --atomization to reuse the real planner observation closure');
    let path='Creation gate/Already exists.md';
    assert.equal((await create(path,competing)).status,'fulfilled');
    let outcome=await create(path,planned);assert.equal(outcome.status,'rejected');
    await row('Existing native TFile is preserved',path,outcome,competing);

    path='Creation gate/After preview.md';
    assert(await ev(`app.vault.adapter.exists(${JSON.stringify(path)}).then(exists=>!exists&&!app.vault.getAbstractFileByPath(${JSON.stringify(path)}))`));
    fs.writeFileSync(vault+'/'+path,competing,{flag:'wx'});
    outcome=await create(path,planned);assert.equal(outcome.status,'rejected');
    await row('File appears after preview but before create: refused',path,outcome,competing);

    // No API wrappers or scheduling barriers: two callers in the same native window.
    for(let n=0;n<10;n++) {
      path=`Creation gate/Concurrent ${n}.md`;
      outcome=await ev(`Promise.all([app.vault.create(${JSON.stringify(path)},gate.competing),app.vault.create(${JSON.stringify(path)},gate.planned)].map(p=>p.then(f=>({status:'fulfilled',path:f?.path}),e=>({status:'rejected',error:String(e)}))))`);
      const content=fs.readFileSync(vault+'/'+path,'utf8');
      assert([competing,planned].includes(content));
      report.cases.push({name:'Unmodified concurrent Vault.create',path,outcome,content,sha256:hash(content),competingSurvived:content===competing});save();
    }

    path='Creation gate/Same app race.md';await pauseCreate(path);
    const second=await create(path,competing);assert.equal(second.status,'fulfilled');
    assert.equal(fs.readFileSync(vault+'/'+path,'utf8'),competing);
    await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
    await ev(`app.workspace.getLeaf(true).openFile(app.vault.getFileByPath(${JSON.stringify(path)}),{state:{mode:'source'}})`);
    await wait('app.workspace.getActiveFile()?.path==="Creation gate/Same app race.md"');
    fs.writeFileSync(root+'/creation-gate-before.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));
    await ev('app.workspace.getLeavesOfType("markdown").forEach(l=>l.detach());void 0');
    outcome=await resumeCreate();assert.equal(outcome.status,'fulfilled');
    await row('Competing Vault.create commits before paused create resumes: OVERWRITTEN',path,{first:outcome,second},planned);

    path='Creation gate/Disk race.md';await pauseCreate(path);
    fs.writeFileSync(vault+'/'+path,competing,{flag:'wx'});
    assert.equal(fs.readFileSync(vault+'/'+path,'utf8'),competing);
    outcome=await resumeCreate();assert.equal(outcome.status,'fulfilled');
    await row('Independent disk writer after native absence check: OVERWRITTEN',path,outcome,planned);
    report.gate='BLOCKED_NO_OVERWRITE';save();

    await cdp('Emulation.setDeviceMetricsOverride',{width:1200,height:900,deviceScaleFactor:1,mobile:false});
    await ev(`app.workspace.getLeaf(true).openFile(app.vault.getFileByPath('Creation gate/Same app race.md'),{state:{mode:'source'}})`);
    await wait('app.workspace.getActiveFile()?.path==="Creation gate/Same app race.md"');
    fs.writeFileSync(root+'/creation-gate-overwrite.png',Buffer.from((await cdp('Page.captureScreenshot',{format:'png'})).data,'base64'));

    // The exact product observer is metadata-only: benchmark its native cache inventory,
    // sorting, alias/link scan, serialization and adapter absence check together.
    const source='Atomization/fact.md', target='Atoms/Benchmark unique.md';
    const observe=()=>ev(`gate.observe(${JSON.stringify(target)},${JSON.stringify(source)}).then(o=>({metadataComplete:o.metadataComplete,files:o.inventory.length,conflicts:o.linkConflicts}))`);
    await wait('app.vault.getMarkdownFiles().every(f=>!!app.metadataCache.getFileCache(f)?.sections)');
    report.metadataBeforeEmpty=await observe();assert.equal(report.metadataBeforeEmpty.metadataComplete,true);
    fs.writeFileSync(vault+'/Creation gate/Empty.md','',{flag:'wx'});
    await wait('!!app.vault.getFileByPath("Creation gate/Empty.md")&&!!app.metadataCache.getFileCache(app.vault.getFileByPath("Creation gate/Empty.md"))');
    report.emptyNoteCache=await ev('app.metadataCache.getFileCache(app.vault.getFileByPath("Creation gate/Empty.md"))');
    report.metadataWithEmpty=await observe();assert.equal(report.emptyNoteCache.sections,undefined);assert.equal(report.metadataWithEmpty.metadataComplete,false);
    // Preserve the observed refusal; never substitute [] for unknown sections.
    fs.writeFileSync(vault+'/Creation gate/Empty.md','This synthetic note now contains a plain paragraph.');
    await wait('!!app.metadataCache.getFileCache(app.vault.getFileByPath("Creation gate/Empty.md"))?.sections');
    for(const count of [1000,10000]) {
      fs.mkdirSync(vault+'/Creation gate/Scale',{recursive:true});
      for(let i=count===1000?0:1000;i<count;i++)fs.writeFileSync(vault+`/Creation gate/Scale/Note ${i}.md`,`---\naliases: [Synthetic alias ${i}]\n---\nSynthetic paragraph ${i}.\n\n[[Missing target ${i}]]\n`);
      let ready=false;
      for(let i=0;i<240;i++) {
        ready=await ev(`app.vault.getMarkdownFiles().filter(f=>f.path.startsWith('Creation gate/Scale/')&&app.metadataCache.getFileCache(f)?.sections).length===${count}`);
        if(ready)break;await new Promise(r=>setTimeout(r,250));
      }
      assert(ready,'Native metadata completed for '+count+' notes');
      const samples=await ev(`(async()=>{const samples=[];for(let i=0;i<8;i++){
        const reads=io.read.length,start=performance.now();const o=await gate.observe(${JSON.stringify(target)},${JSON.stringify(source)});
        if(!o.metadataComplete||o.linkConflicts.length)throw Error('Incomplete benchmark observation');
        const milliseconds=performance.now()-start;if(i)samples.push({milliseconds,files:o.inventory.length,bytes:new TextEncoder().encode(JSON.stringify(o)).length,markdownReads:io.read.length-reads});
      }return samples})()`);
      const sorted=samples.map(s=>s.milliseconds).sort((a,b)=>a-b);
      report.benchmark.push({syntheticNotes:count,samples,medianMs:sorted[3],maxMs:sorted.at(-1)});save();
      console.log('Native atomization inventory benchmark',count,'notes:',sorted[3].toFixed(1),'ms median');
    }
    assert.deepEqual(snapshot(),before,'Existing Markdown and journals remain byte-identical');
    report.sourceHashes=before;report.sourcesUnchanged=true;
    assert.equal(await ev('io.network-gate.networkBefore'),0);
    report.additionalNetwork=0;report.harnessVaultCreates=await ev('io.write');
    report.status='PASS: blocker reproduced; Apply remains disconnected';save();return report;
  } catch(error) {
    report.status='FAIL';report.error=String(error);save();throw error;
  } finally {
    await ev('app.vault.adapter.write=gate.originalWrite;app.vault.read=gate.originalRead;void 0');save();
  }
}
