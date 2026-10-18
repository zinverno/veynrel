// Evaluation only. Literal evidence coverage is a proxy, never semantic adjudication.
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const relations = ['same_information','partial_overlap','related_distinct','conflicting','unrelated','insufficient_context'];
const actions = ['consider_merge','consider_embed_b_in_a','consider_embed_a_in_b','consider_atomize','add_link','no_change','manual_review'];
const kinds = ['shared','unique_a','unique_b','context_a','context_b','standalone_a','standalone_b','conflict','version_difference','comparison'];
const keys = (v, names) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === names.length && names.every(k => Object.prototype.hasOwnProperty.call(v,k));
const text = (v, max=1600) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const list = (v,max,predicate) => Array.isArray(v) && v.length <= max && v.every(predicate);
const refs = v => list(v,8,x=>text(x,32));
const recommendation = v => keys(v,['action','reason','evidence']) && actions.includes(v.action) && text(v.reason) && refs(v.evidence);
const requiredQuotes = c => /_(a|b)$/.test(c.kind) ? text(c[c.kind.endsWith('_a')?'quoteA':'quoteB'],1200) : text(c.quoteA,1200)&&text(c.quoteB,1200);
/** Syntax/shape only: deliberately independent of quote and relation consistency checks. */
export function shapeValid(v) {
  return keys(v,['relation','explanation','claims','recommendation','alternatives','limitations']) && relations.includes(v.relation) &&
    keys(v.explanation,['text','evidence']) && text(v.explanation.text) && refs(v.explanation.evidence) &&
    list(v.claims,8,c=>keys(c,['id','kind','text','quoteA','quoteB']) && text(c.id,32) && kinds.includes(c.kind) && text(c.text) &&
      (c.quoteA===null||text(c.quoteA,1200)) && (c.quoteB===null||text(c.quoteB,1200)) && requiredQuotes(c)) && recommendation(v.recommendation) &&
    list(v.alternatives,3,recommendation) && list(v.limitations,8,v=>text(v));
}
export function validateCorpus(corpus, validate) {
  assert.equal(corpus.version,1); assert(corpus.cases.length>=20);
  const ids=new Set(), paths=new Set();
  for(const c of corpus.cases) {
    assert(!ids.has(c.id));ids.add(c.id);assert(['en','ru'].includes(c.language));assert.equal(c.notes.length,2);
    assert.equal(c.paths.length,2);assert(c.gold.risks.length);assert(c.gold.allowedActions.length);
    for(const p of c.paths){assert(/^Realistic\/[\w/-]+\/Note\.md$/.test(p));assert(!paths.has(p));paths.add(p);}
    for(const u of c.gold.unique){const s=c.notes[u.side];assert.equal(s.slice(u.start,u.end),u.quote,c.id+': UTF-16 span');assert.equal(s.indexOf(u.quote),u.start);}
    for(const quote of c.gold.desiredTransfers)assert(c.notes[1-c.gold.canonical].includes(quote),c.id+': desired transfer');
    validate(JSON.stringify(c.controlResponse),...c.notes);
  }
  assert(corpus.cases.some(c=>c.language==='ru')&&corpus.cases.some(c=>c.language==='en'));
}
const occurrence = (quote,source) => {const start=source.indexOf(quote);return start>=0&&source.indexOf(quote,start+1)===-1;};
export function scoreResponse(c,raw,validate,adjudication=null) {
  let value;try{value=JSON.parse(raw);}catch{}
  const shape=raw.length<=64000&&shapeValid(value);
  let productionFailure=null;try{validate(raw,...c.notes);}catch(e){productionFailure=e.reason??'invalidResponse';}
  const claims=Array.isArray(value?.claims)?value.claims.filter(x=>x&&typeof x==='object'):[];
  const quotes=claims.flatMap(claim=>[0,1].flatMap(side=>typeof claim[side?'quoteB':'quoteA']==='string'?[{side,text:claim[side?'quoteB':'quoteA']}]:[]));
  const exact=quotes.filter(q=>q.text.length>0&&occurrence(q.text,c.notes[q.side])).length;
  const covered=c.gold.unique.filter(u=>claims.some(claim=>(['conflict','version_difference'].includes(u.kind)?claim.kind===u.kind:['unique_','context_','standalone_'].some(k=>claim.kind===k+(u.side?'b':'a'))) &&
    typeof claim[u.side?'quoteB':'quoteA']==='string' && occurrence(claim[u.side?'quoteB':'quoteA'],c.notes[u.side]) && claim[u.side?'quoteB':'quoteA'].includes(u.quote))).map(u=>u.id);
  const recommended=[value?.recommendation,...(Array.isArray(value?.alternatives)?value.alternatives:[])].map(x=>x?.action).filter(Boolean);
  let semantic=null;
  if(adjudication){
    assert.equal(adjudication.responseSha256,sha256(raw),'Adjudication belongs to another response');
    assert(text(adjudication.reviewer));assert.equal(adjudication.complete,true);
    assert.deepEqual(adjudication.claims.map(x=>x.id).sort(),claims.map(x=>x.id).sort());
    const goldIds=new Set(c.gold.unique.map(u=>u.id)), correct=new Set();
    for(const a of adjudication.claims){assert(['correct','incorrect','uncertain'].includes(a.verdict));assert(Array.isArray(a.uniqueIds));for(const id of a.uniqueIds){assert(goldIds.has(id));if(a.verdict==='correct')correct.add(id);}}
    semantic={reviewer:adjudication.reviewer,correctClaims:adjudication.claims.filter(x=>x.verdict==='correct').length,
      incorrectClaims:adjudication.claims.filter(x=>x.verdict==='incorrect').length,uncertainClaims:adjudication.claims.filter(x=>x.verdict==='uncertain').length,uniqueCovered:[...correct]};
  }
  return {id:c.id,responseSha256:sha256(raw),shapeValid:!!shape,productionAccepted:productionFailure===null,productionFailure,
    relation:value?.relation??null,relationCorrect:relations.includes(value?.relation)?c.gold.relations.includes(value.relation):false,
    uniqueTotal:c.gold.unique.length,uniqueLiteralCovered:covered,quoteCount:quotes.length,exactQuoteCount:exact,
    falseMerge:c.gold.neverMerge&&recommended.includes('consider_merge'),
    falseConflict:!c.gold.contradiction&&claims.some(x=>x.kind==='conflict'),
    abstained:value?.relation==='insufficient_context',abstentionRequired:c.gold.abstentionRequired,
    actionPolicyCorrect:recommended.length>0&&recommended.every(x=>c.gold.allowedActions.includes(x)),
    unsupportedActions:recommended.filter(x=>x==='consider_atomize'),semantic};
}
export function summarize(rows) {
  const sum=fn=>rows.reduce((n,r)=>n+Number(fn(r)),0), rate=(n,d)=>({numerator:n,denominator:d,value:d?n/d:null});
  return {responses:rows.length,shape:rate(sum(r=>r.shapeValid),rows.length),productionAcceptance:rate(sum(r=>r.productionAccepted),rows.length),
    relationAccuracy:rate(sum(r=>r.relationCorrect),rows.length),uniqueLiteralRecallProxy:rate(sum(r=>r.uniqueLiteralCovered.length),sum(r=>r.uniqueTotal)),
    exactQuotePrecision:rate(sum(r=>r.exactQuoteCount),sum(r=>r.quoteCount)),falseMergePairs:sum(r=>r.falseMerge),falseConflictPairs:sum(r=>r.falseConflict),
    justifiedAbstentionPrecision:rate(sum(r=>r.abstained&&r.abstentionRequired),sum(r=>r.abstained)),
    requiredAbstentionRecall:rate(sum(r=>r.abstained&&r.abstentionRequired),sum(r=>r.abstentionRequired)),
    actionPolicyAccuracy:rate(sum(r=>r.actionPolicyCorrect),rows.length),unsupportedActionPairs:sum(r=>r.unsupportedActions.length>0),
    semanticReviewedPairs:sum(r=>!!r.semantic),semanticClaimPrecision:rate(sum(r=>r.semantic?.correctClaims??0),sum(r=>r.semantic?r.semantic.correctClaims+r.semantic.incorrectClaims+r.semantic.uncertainClaims:0)),
    semanticUniqueRecall:rate(sum(r=>r.semantic?.uniqueCovered.length??0),sum(r=>r.semantic?r.uniqueTotal:0))};
}
