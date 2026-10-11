// Free release guard checks; never loads credentials or connects to a provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BudgetJournal } from './rerank-comparison-budget.mjs';
import { guardedTransport, requestOperation, limits, digest, embeddingModel, query } from './release-2.1.0-paid-guard.mjs';
const plan = { embeddingTexts: ['synthetic index'], outboundTexts: [] };
const request = input => ({url:'https://openrouter.ai/api/v1/embeddings',method:'POST',body:JSON.stringify({model:embeddingModel,input,encoding_format:'float'}),headers:{Authorization:'Bearer synthetic-secret'}});
const receipt = cost => ({status:200,text:JSON.stringify({model:embeddingModel,usage:{total_tokens:100,cost},data:[{index:0,embedding:[1,0]}]})});
function fixture(t) {
  const root=fs.mkdtempSync('/tmp/release-budget-test-'),dir=root+'/state',fingerprint=digest(JSON.stringify(plan));
  const journal=new BudgetJournal(dir,fingerprint,0,limits);t.after(()=>{journal.close();fs.rmSync(root,{recursive:true,force:true});});
  return {dir,fingerprint,journal};
}
test('lower release ceiling is durable, cannot reopen with old defaults or enlarged limits',t=>{
  const {dir,fingerprint,journal}=fixture(t);assert.deepEqual([journal.header.planning,journal.header.ceiling],[2e6,5e6]);
  const op=requestOperation(request([query]),plan);assert.throws(()=>journal.reserve({...op,reserve:2e6+1},0),/money-limit/);
  journal.close();assert.throws(()=>new BudgetJournal(dir,fingerprint,0),/journal-plan-mismatch/);
  assert.throws(()=>new BudgetJournal(dir,fingerprint,0,{planning:3e6,ceiling:5e6}),/journal-plan-mismatch/);
});
test('reserve is fsynced before dispatch; responses remain identical; replay cannot pay twice',async t=>{
  const {dir,fingerprint,journal}=fixture(t), response=receipt(.000002);let sent=0;
  const transport=guardedTransport({journal,plan,preflight:async()=>({usage:0}),transport:async()=>{
    assert.equal(JSON.parse(fs.readFileSync(journal.file,'utf8').trim().split('\n').at(-1)).state,'reserved');sent++;return response;
  }});
  assert.equal(await transport(request([query])),response);journal.close();
  const resumed=new BudgetJournal(dir,fingerprint,0,limits);
  const again=guardedTransport({journal:resumed,plan,preflight:async()=>({usage:0}),transport:async()=>{sent++;return response;}});
  await assert.rejects(again(request([query])),/paid-run-stopped/);assert.equal(sent,1);assert.equal(resumed.summary().spentNanodollars,2000);
  assert(!fs.readFileSync(journal.file,'utf8').includes('synthetic-secret'));resumed.close();
});
test('uncertain HTTP retains reservation and stops all later operations across restart',async t=>{
  const {dir,fingerprint,journal}=fixture(t);let sent=0;
  const transport=guardedTransport({journal,plan,preflight:async()=>({usage:0}),transport:async()=>{sent++;throw Error('synthetic-secret');}});
  await assert.rejects(transport(request([query])),/^Error: paid-run-stopped$/);
  await assert.rejects(transport(request(plan.embeddingTexts)),/paid-run-stopped/);assert.equal(sent,1);assert.equal(journal.summary().unresolvedNanodollars,250000);
  journal.close();const resumed=new BudgetJournal(dir,fingerprint,0,limits);
  assert.throws(()=>resumed.reserve(requestOperation(request(plan.embeddingTexts),plan),0),/reconciliation-required/);
  assert(!fs.readFileSync(journal.file,'utf8').includes('synthetic-secret'));resumed.close();
});
test('unknown receipt price is not zero and prevents subsequent dispatch',async t=>{
  const {journal}=fixture(t);let sent=0;const transport=guardedTransport({journal,plan,preflight:async()=>({usage:0}),transport:async()=>{sent++;return receipt(undefined);}});
  await assert.rejects(transport(request([query])),/paid-run-stopped/);await assert.rejects(transport(request(plan.embeddingTexts)),/paid-run-stopped/);
  assert.equal(sent,1);assert.equal(journal.entries.get('embedding-query').cost,null);
});
test('unexpected price or unrelated key usage stops without retries',async t=>{
  for(const extraUsage of [false,true]) {
    const {journal}=fixture(t);let sent=0;
    const transport=guardedTransport({journal,plan,preflight:async()=>({usage:extraUsage&&sent?.001:0}),transport:async()=>{sent++;return receipt(extraUsage?.000002:.00002);}});
    await assert.rejects(transport(request([query])),/paid-run-stopped/);await assert.rejects(transport(request(plan.embeddingTexts)),/paid-run-stopped/);assert.equal(sent,1);
  }
});
test('unplanned endpoint, model, input and overlapping calls cannot dispatch',async t=>{
  for(const bad of [{...request([query]),url:'https://openrouter.ai/api/v1/chat/completions'},request(['unplanned'])])assert.throws(()=>requestOperation(bad,plan));
  const {journal}=fixture(t);let release, sent=0;
  const transport=guardedTransport({journal,plan,preflight:async()=>({usage:0}),transport:async()=>{sent++;await new Promise(r=>release=r);return receipt(.000002);}});
  const first=transport(request([query]));while(!release)await Promise.resolve();
  await assert.rejects(transport(request(plan.embeddingTexts)),/paid-run-stopped/);release();await first;assert.equal(sent,1);
});
