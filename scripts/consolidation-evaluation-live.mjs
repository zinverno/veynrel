// Opt-in evaluation runner, separate from all product journals. Never invoked by npm test/native acceptance.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {inputs} from './consolidation-evaluation.mjs';
import {ROOT} from './consolidation-evaluation-adapter.mjs';
import {sha256} from './consolidation-evaluation-metrics.mjs';
const endpoint='https://openrouter.ai/api/v1';
const positive=v=>typeof v==='number'&&Number.isFinite(v)&&v>0;
const nano=v=>Math.ceil(v*1e9);
export function authorize(a,data,profileBytes,now=Date.now()) {
  assert(a?.approved===true&&a.purpose==='Veynrel synthetic Relationship Analyzer evaluation','Separate explicit approval required');
  assert(/^[a-z0-9-]{8,80}$/.test(a.runId),'Invalid run ID');
  assert(typeof a.runDirectory==='string'&&path.isAbsolute(a.runDirectory)&&path.normalize(a.runDirectory)===a.runDirectory,'Approval must bind one absolute run directory');
  assert.equal(a.corpusSha256,data.corpusSha256);assert.equal(a.promptSha256,data.promptSha256);assert.equal(a.profilesSha256,sha256(profileBytes));
  assert(Number.isFinite(Date.parse(a.expiresAt))&&Date.parse(a.expiresAt)>now,'Approval expired');
  assert(a.dedicatedUnusedKey===true&&a.noBYOK===true,'Dedicated capped key without BYOK required');
  assert(Number.isInteger(a.maxRequests)&&a.maxRequests>0&&a.maxRequests<=100);
  assert(positive(a.maxUSD)&&a.maxUSD<=100&&positive(a.reservePerRequestUSD)&&a.reservePerRequestUSD<=a.maxUSD);
  assert(positive(a.maxPromptUSDPerMillion)&&positive(a.maxCompletionUSDPerMillion));
  const profiles=JSON.parse(profileBytes).profiles;assert(Array.isArray(profiles)&&profiles.length>=3&&profiles.length<=10);
  assert(new Set(profiles.map(p=>p.id)).size===profiles.length);
  for(const p of profiles)assert(/^[a-z0-9-]+$/.test(p.id)&&/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(p.model));
  assert(Array.isArray(a.caseIds)&&a.caseIds.length>0&&new Set(a.caseIds).size===a.caseIds.length);
  for(const id of a.caseIds)assert(data.requests.some(r=>r.id===id&&!r.tooLarge),'Unknown or gated case');
  assert(a.caseIds.length*profiles.length<=a.maxRequests,'Request ceiling exceeded');
  assert(nano(a.reservePerRequestUSD)*a.caseIds.length*profiles.length<=nano(a.maxUSD),'Reservation ceiling exceeded');
  return profiles;
}
/** A bounded one-shot run. Existing run directory means STOP, including after interruption; never resume/retry blindly. */
export async function runLive({optIn,authorization,profileBytes,runRoot,getKey,transport=fetch}) {
  assert(optIn===true,'--allow-paid required');
  const data=await inputs(),profiles=authorize(authorization,data,profileBytes);
  const runDir=path.join(fs.realpathSync(runRoot),authorization.runId);assert.equal(runDir,authorization.runDirectory,'Approval belongs to another run directory');fs.mkdirSync(runDir,{mode:0o700});
  const log=fs.openSync(path.join(runDir,'receipts.jsonl'),'wx',0o600);
  const record=value=>{const bytes=Buffer.from(JSON.stringify(value)+'\n');assert.equal(fs.writeSync(log,bytes),bytes.length,'Incomplete receipt write');fs.fsyncSync(log);};
  let count=0,reserved=0;
  try {
    record({event:'authorized',authorizationSha256:sha256(JSON.stringify(authorization)),corpusSha256:data.corpusSha256,promptSha256:data.promptSha256,
      profilesSha256:sha256(profileBytes),maxRequests:authorization.maxRequests,maxUSD:authorization.maxUSD});
    const key=getKey();assert(typeof key==='string'&&key.length>0,'Dedicated key missing');
    const request=async(route,body)=>{
      const r=await transport(endpoint+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        ...(body?{body:JSON.stringify(body)}:{}),redirect:'error',signal:AbortSignal.timeout(90000)});
      assert(r.ok,'Provider request failed; no retry');const value=await r.text();assert(Buffer.byteLength(value)<=1024*1024,'Provider response too large');return JSON.parse(value);
    };
    const info=(await request('/key')).data;
    assert(positive(info?.limit)&&info.limit<=authorization.maxUSD&&info.limit_reset===null&&info.usage===0&&info.byok_usage===0&&info.limit_remaining===info.limit,'Key must be unused with a non-resetting cap no larger than approval');
    record({event:'key-cap',limit:info.limit,usage:info.usage});
    for(const profile of profiles){
      const output={profile:profile.id,model:profile.model,corpusSha256:data.corpusSha256,promptSha256:data.promptSha256,items:[]};
      for(const caseId of authorization.caseIds){
        assert(Date.parse(authorization.expiresAt)>Date.now(),'Approval expired');
        const c=data.corpus.cases.find(c=>c.id===caseId),input=data.requests.find(r=>r.id===caseId).input;
        const body=data.api.buildChatBody({provider:'openrouter',model:profile.model},data.api.relationshipPrompt(c.language),input,data.api.RELATIONSHIP_OPTIONS);
        body.usage={include:true};body.provider={allow_fallbacks:false,require_parameters:true,data_collection:'deny',max_price:{prompt:authorization.maxPromptUSDPerMillion,completion:authorization.maxCompletionUSDPerMillion}};
        const bytes=Buffer.byteLength(JSON.stringify(body));assert(bytes<=data.api.RELATIONSHIP_LIMITS.requestBytes);
        // Conservative text-token reservation, not a promise about a provider's billing/tokenizer.
        const estimate=((bytes+4096)*authorization.maxPromptUSDPerMillion+body.max_tokens*authorization.maxCompletionUSDPerMillion)/1e6;
        assert(estimate<=authorization.reservePerRequestUSD,'Reservation smaller than conservative text estimate');
        assert(++count<=authorization.maxRequests);reserved+=nano(authorization.reservePerRequestUSD);assert(reserved<=nano(authorization.maxUSD)&&reserved<=nano(info.limit));
        const operationId=sha256(authorization.runId+'\n'+profile.id+'\n'+caseId),requestSha256=sha256(JSON.stringify(body));
        record({event:'reserved',operationId,caseId,profile:profile.id,requestSha256,reserveUSD:authorization.reservePerRequestUSD});
        assert(Date.parse(authorization.expiresAt)>Date.now(),'Approval expired before dispatch');
        const start=Date.now(),result=await request('/chat/completions',body),cost=result.usage?.cost;
        assert(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0&&nano(cost)<=nano(authorization.reservePerRequestUSD),'Unknown/excess billing: stop and reconcile manually');
        assert(result.usage?.is_byok!==true,'Unexpected BYOK billing');
        record({event:'receipt',operationId,costUSD:cost,elapsedMs:Date.now()-start});
        const raw=result.choices?.[0]?.message?.content;assert(typeof raw==='string','Missing response content');
        output.items.push({caseId,raw,finishReason:result.choices[0].finish_reason??null,responseSha256:sha256(raw)});
        fs.writeFileSync(path.join(runDir,profile.id+'-'+caseId+'.json'),JSON.stringify({...output,items:[output.items.at(-1)]},null,2)+'\n',{flag:'wx',mode:0o600});
      }
      fs.writeFileSync(path.join(runDir,profile.id+'.json'),JSON.stringify(output,null,2)+'\n',{flag:'wx',mode:0o600});
    }
    record({event:'completed',requests:count,reservedUSD:reserved/1e9});return {runDir,requests:count};
  }catch(error){record({event:'stopped',requests:count,reservedUSD:reserved/1e9,reason:'Manual reconciliation required; no automatic retry'});throw error;}
  finally{fs.closeSync(log);}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try{
    const [flag,approvalFile,runRoot]=process.argv.slice(2);assert(flag==='--allow-paid'&&approvalFile&&runRoot,'Separate authorization file and --allow-paid required');
    const authorization=JSON.parse(fs.readFileSync(approvalFile,'utf8')),profileBytes=fs.readFileSync(ROOT+'tests/fixtures/consolidation-model-profiles.json');
    const result=await runLive({optIn:true,authorization,profileBytes,runRoot,getKey:()=>process.env.VEYNREL_EVAL_OPENROUTER_KEY});console.log(JSON.stringify(result));
  }catch{console.error('Evaluation stopped. Inspect local receipts; do not retry or reuse this approval without billing reconciliation.');process.exitCode=1;}
}
