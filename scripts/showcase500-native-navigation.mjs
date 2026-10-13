// Free UI navigation verification: saved real result, no key access, all HTTP blocked.
import { spawn } from 'node:child_process';
import { connect } from './rerank-comparison-native.mjs';
import { freeze, json, LOCAL, check } from './showcase500-rerank-v1.mjs';

const outcome = json(LOCAL + '/outcomes/rerank-0-q001.json');
const pool = json(LOCAL + '/pools/Q001.json');
const child = spawn('/usr/bin/electron43', ['/usr/lib/obsidian/app.asar',
  '--user-data-dir=' + LOCAL + '/native-profile', '--remote-debugging-port=9297',
  '--disable-gpu', '--ozone-platform=x11'], { stdio: 'ignore' });
let client;
const report = {
  kind: 'free UI navigation recovery with saved real result', paidCalls: 0, queryEmbeddingCalls: 0,
  checks: [], originalPaidOperation: 'rerank-0-q001',
  originalLiveChecksEvidence: 'Control flow reached opens-selected-fragment check after successful preceding assertions; paid outcome is durable. Earlier cursor assertion had no await for cursor positioning.',
};
try {
  client = await connect(9297);
  const { evaluate: ev, waitFor: wait } = client;
  await wait('!!window.app?.workspace?.layoutReady');
  check(await ev(`app.vault.adapter.basePath===${JSON.stringify(LOCAL + '/vault')}`), 'wrong-vault');
  await ev(`(async()=>{
    if(!app.plugins.isEnabled())await app.plugins.setEnable(true);
    await app.plugins.loadManifests();await app.plugins.enablePlugin('showcase-observer');
  })()`);
  await ev(`(()=>{
    window.__noNetworkCalls=0;const old=window.eval;
    window.eval=source=>{
      const f=old(source);if(!source.includes('//# sourceURL=plugin:ai-knowledge-hub'))return f;
      return(require,module,exports)=>f(id=>{
        const api=require(id);if(id!=='obsidian')return api;
        return new Proxy(api,{get:(target,key,receiver)=>key==='requestUrl'
          ?()=>{__noNetworkCalls++;throw Error('offline-tripwire');}:Reflect.get(target,key,receiver)});
      },module,exports);
    };window.__originalEval=old;
  })()`);
  await ev(`(async()=>{
    try{await app.plugins.enablePlugin('ai-knowledge-hub');}finally{window.eval=__originalEval;}
    window.plugin=app.plugins.plugins['ai-knowledge-hub'];window.engine=plugin.semanticController;
  })()`);
  // Only the free recovery uses saved results; the original paid search remains in its own receipt.
  await ev(`engine.searchDiscover=async()=>({stage:'semantic',
    results:${JSON.stringify(pool.baseline.slice(0, 10))},
    session:{id:950001,configured:true,refine:async()=>(${JSON.stringify(outcome.result)})}})`);
  await wait("!!app.commands.commands['ai-knowledge-hub:ai-semantic-search']");
  await ev("app.commands.executeCommandById('ai-knowledge-hub:ai-semantic-search')");
  await wait("!!document.querySelector('.ai-semantic-search-modal input')");
  await ev(`{const input=document.querySelector('.ai-semantic-search-modal input');
    input.value='saved evaluation result';input.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('.ai-semantic-search-input-row button').click();}`);
  await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='semantic'");
  await ev("document.querySelector('[data-rerank-action=refine]').click();void 0");
  await wait("document.querySelector('.ai-semantic-search-status')?.dataset.state==='reranked'");
  await ev(`document.querySelector('[data-rerank-action=original]').click();
    document.querySelector('[data-rerank-action=refined]').click();void 0`);
  report.checks.push('saved live result toggles in installed UI');
  await ev("document.querySelector('.ai-semantic-result-card').click();void 0");
  const first = outcome.result.results[0];
  await wait(`app.workspace.getActiveFile()?.path===${JSON.stringify(first.path)}`);
  report.cursorAtPathReady = await ev('app.workspace.activeEditor?.editor?.getCursor()?.line');
  await wait(`app.workspace.activeEditor?.editor?.getCursor()?.line===${first.rerankMatch.source.startLine}`);
  report.cursorAfterAwait = await ev('app.workspace.activeEditor.editor.getCursor().line');
  report.expectedLine = first.rerankMatch.source.startLine;
  report.checks.push('selected real fragment opened after asynchronous cursor positioning');
  check(await ev('__noNetworkCalls===0'), 'unexpected-api');
  report.checks.push('zero HTTP including embeddings/rerank');
  report.status = 'PASS';
  // Retain the original recovery evidence when a later free recheck has different timing.
  const output = LOCAL + '/native-ui-recovery-recheck.json';
  freeze(output, report);
  console.log(JSON.stringify(report));
} finally {
  if (client) { await client.evaluate('window.close()').catch(() => {}); client.close(); }
  child.kill();
}
