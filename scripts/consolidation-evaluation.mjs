// Default mode is offline; credentials are never read here.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {evaluationAdapter,ROOT} from './consolidation-evaluation-adapter.mjs';
import {sha256,validateCorpus,scoreResponse,summarize} from './consolidation-evaluation-metrics.mjs';

export async function inputs() {
  const bytes=fs.readFileSync(ROOT+'tests/fixtures/consolidation-realistic-v1.json');
  const corpus=JSON.parse(bytes), api=await evaluationAdapter();validateCorpus(corpus,api.validateRelationshipResponse);
  const promptSha256=sha256(JSON.stringify(['en','ru'].map(l=>api.relationshipPrompt(l))));
  const requests=corpus.cases.map(c=>{
    const input=JSON.stringify({A:c.notes[0],B:c.notes[1]});
    const body=api.buildChatBody({provider:'openrouter',model:'evaluation-placeholder'},api.relationshipPrompt(c.language),input,api.RELATIONSHIP_OPTIONS);
    const tooLarge=c.notes.some(s=>s.length>api.RELATIONSHIP_LIMITS.noteCharacters)||c.notes.reduce((n,s)=>n+s.length,0)>api.RELATIONSHIP_LIMITS.pairCharacters||Buffer.byteLength(JSON.stringify(body))>api.RELATIONSHIP_LIMITS.requestBytes;
    return {id:c.id,input,tooLarge};
  });
  return {corpus,api,corpusSha256:sha256(bytes),promptSha256,requests};
}
export async function evaluate(responseFile=null,adjudicationFile=null) {
  const {corpus,api,corpusSha256,promptSha256,requests}=await inputs();
  const imported=responseFile?JSON.parse(fs.readFileSync(responseFile,'utf8')):null;
  if(imported){assert.equal(imported.corpusSha256,corpusSha256);assert.equal(imported.promptSha256,promptSha256);assert(typeof imported.profile==='string');assert(Array.isArray(imported.items));}
  const items=imported?.items??corpus.cases.filter(c=>!requests.find(r=>r.id===c.id).tooLarge).map(c=>({caseId:c.id,raw:JSON.stringify(c.controlResponse)}));
  const adjudications=adjudicationFile?JSON.parse(fs.readFileSync(adjudicationFile,'utf8')):null;
  if(adjudications)assert.equal(adjudications.corpusSha256,corpusSha256,'Adjudication belongs to another reference corpus');
  const decisions=adjudications?.cases??{};
  const seen=new Set();const rows=items.map(item=>{
    assert(!seen.has(item.caseId),'Duplicate response');seen.add(item.caseId);assert(typeof item.raw==='string');
    const c=corpus.cases.find(c=>c.id===item.caseId);assert(c,'Unknown case');assert(!requests.find(r=>r.id===c.id).tooLarge,'Input gate must precede requests');
    return scoreResponse(c,item.raw,api.validateRelationshipResponse,decisions[c.id]);
  });
  return {version:1,kind:imported?'imported-responses-provenance-not-independently-verified':'scripted-control-replay-NOT-model-quality',profile:imported?.profile??'curated-control',
    corpusSha256,promptSha256,annotation:corpus.annotation,inputGated:requests.filter(r=>r.tooLarge).map(r=>r.id),
    missingEligible:requests.filter(r=>!r.tooLarge&&!seen.has(r.id)).map(r=>r.id),metrics:summarize(rows),rows,
    limitations:['Control replay is circular and measures the evaluator, not model quality.','Literal quote coverage is not semantic completeness.',
      'Reference judgments were authored by one AI engineering curator; independent human expert review is NOT RUN.',
      'Semantic claim quality remains unmeasured until response-bound adjudication. Native applicability is reported separately.']};
}
export async function compare(files) {
  assert(files.length>=3,'Comparison requires at least three configurations');
  const reports=await Promise.all(files.map(file=>evaluate(file)));assert.equal(new Set(reports.map(r=>r.profile)).size,reports.length,'Duplicate configuration');
  return {kind:'configuration-comparison',coverageComparable:reports.every(r=>JSON.stringify(r.rows.map(x=>x.id).sort())===JSON.stringify(reports[0].rows.map(x=>x.id).sort())),
    profiles:reports,limits:'Unreviewed semantic metrics remain null; compare only identical case coverage. Imported provenance is not authenticated by this harness.'};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [mode='offline',out,response,adjudication]=process.argv.slice(2);
  assert(['offline','import','compare'].includes(mode),'Use offline OUT.json, import OUT.json RESPONSES.json [ADJUDICATION.json], or compare OUT.json RESPONSES...');
  assert(out&&(!fs.existsSync(out)),'Supply a new output file');assert(mode!=='import'||response);
  const result=mode==='compare'?await compare(process.argv.slice(4)):await evaluate(mode==='import'?response:null,adjudication);
  fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
  console.log('Offline evaluation saved to '+out);
}
