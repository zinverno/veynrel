// Russian adaptation: reuse production algorithms; no network or automatic note edits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { adapters, json, sha, summarize, repository } from './connection-case-study.mjs';
export { adapters, json, sha, summarize, repository };
export const directory = repository + 'docs/case-studies/connection-opportunities/ru/';
export const model = 'local/paraphrase-multilingual-MiniLM-L12-v2-max512';
export const baseUrl = 'http://127.0.0.1:19643/v1';
export const protocol = () => json(directory + 'protocol.json');
export function corpus() {
  const p = protocol();
  return p.notes.map(n => {
    let content = fs.readFileSync(directory + 'corpus/' + n.source, 'utf8');
    assert.equal(sha(content), n.sha256, 'Frozen source changed: ' + n.source);
    for (const other of p.notes) content = content.replaceAll('[[' + other.source.slice(0, -3) + ']]', '[[' + other.vault.slice(0, -3) + ']]');
    return { path: n.vault, source: n.source, content };
  });
}
export async function inputs() {
  const a = await adapters(), documents = corpus();
  return { documents, chunks: documents.flatMap(d => new a.MarkdownChunker().chunk(d)), protocolSha256: sha(fs.readFileSync(directory + 'protocol.json')) };
}
export function cachedVectors(chunks) {
  const manifest = json(directory + 'vectors.json'), bytes = fs.readFileSync(directory + 'vectors.f32.gz'), raw = gunzipSync(bytes);
  assert.equal(sha(bytes), manifest.compressedSha256); assert.equal(sha(raw), manifest.float32Sha256);
  assert.equal(manifest.protocolSha256, sha(fs.readFileSync(directory + 'protocol.json')));
  assert.equal(raw.length, chunks.length * manifest.dimensions * 4);
  assert.deepEqual(chunks.map(c => ({ path: c.path, ordinal: c.ordinal, sha256: sha(c.text) })), manifest.inputs.map(({path,ordinal,sha256})=>({path,ordinal,sha256})));
  const cache = new Map();
  chunks.forEach((c,i) => { const v = Float32Array.from({length:manifest.dimensions},(_,d)=>raw.readFloatLE((i*manifest.dimensions+d)*4));
    assert(v.every(Number.isFinite) && Math.hypot(...v)>0); cache.set(c.text,v); });
  return { manifest, cache };
}
export function cohort(comparison, a) {
  const state=a.newConnectionComparisonViewState(); a.syncConnectionComparison(state,comparison);
  Object.assign(state,protocol().cohort);
  return a.filteredConnectionPairs(state).slice(0,protocol().cohort.take);
}
export async function prepare(root) {
  assert(/^\/tmp\/[a-zA-Z0-9_-]+$/.test(root) && !fs.existsSync(root), 'Use a new direct child of /tmp');
  const a=await adapters(), {documents,chunks,protocolSha256}=await inputs(), {manifest,cache}=cachedVectors(chunks), p=protocol();
  const vault=root+'/vault', plugin=vault+'/.obsidian/plugins/ai-knowledge-hub';
  fs.mkdirSync(plugin,{recursive:true}); fs.mkdirSync(root+'/profile');
  for(const d of documents) fs.writeFileSync(vault+'/'+d.path,d.content);
  const disk=x=>{assert(!path.isAbsolute(x)&&!x.split('/').includes('..'));return path.join(plugin,x);};
  const persistence={exists:async x=>fs.existsSync(disk(x)),readText:async x=>fs.readFileSync(disk(x),'utf8'),
    readBinary:async x=>Uint8Array.from(fs.readFileSync(disk(x))).buffer,writeText:async(x,v)=>fs.writeFileSync(disk(x),v),
    writeBinary:async(x,v)=>fs.writeFileSync(disk(x),Buffer.from(v)),createDirectory:async x=>fs.mkdirSync(disk(x),{recursive:true}),
    remove:async x=>fs.unlinkSync(disk(x)),rename:async(x,y)=>fs.renameSync(disk(x),disk(y))};
  let store,replayed=0;
  const provider={id:'openai-compatible',model,dimensions:async()=>manifest.dimensions,
    embed:async texts=>texts.map(t=>{assert(cache.has(t),'Unknown input: no remote fallback');replayed++;return cache.get(t).slice();})};
  await assert.rejects(provider.embed(['unplanned input']),/Unknown input/);
  const indexing=new a.IndexingService({chunker:new a.MarkdownChunker(),embeddingProvider:provider,
    embeddingSpace:{providerId:provider.id,model,baseUrl},vectorStoreFactory:options=>(store=new a.LocalVectorStore({...options,persistence,basePath:'semantic-index'}))});
  await indexing.initialize(); const indexingResult=await indexing.reconcileAll(documents,{retryTransient:false});
  const analysis=await new a.SemanticDiscoveryService(store,manifest.dimensions).analyzeGlobalSemanticMap(); assert.equal(analysis.state,'ready');
  const revision={vectorGeneration:indexing.getStats().vectorGeneration,vectorCount:chunks.length,dimensions:manifest.dimensions,
    provider:provider.id,model,configurationRevision:0,runtimeRevision:1};
  const semantic=a.projectGlobalSemanticMap(analysis,revision,1);
  const names=new Map(p.notes.map(n=>[n.source,n.vault]));
  const snapshot={notes:documents.map(d=>({path:d.path,basename:d.path.slice(0,-3),mtime:1,content:'',contentAvailable:false,
    linksAvailable:true,unresolvedLinks:[],resolvedOutgoing:p.links.filter(([from])=>from===d.source).map(([,to])=>names.get(to))})),
    coverage:{noteListComplete:true,contentComplete:false,linksComplete:true},diagnostics:[],diagnosticsTruncated:0};
  const topology=await a.deriveTopology(snapshot,1,new AbortController().signal), comparison=a.deriveConnectionComparison(semantic,topology,1), selected=cohort(comparison,a);
  assert.equal(new Set(selected.map(x=>x.id)).size,selected.length);
  const key=(l,r)=>JSON.stringify([l,r].sort()), sparse=new Set(semantic.edges.map(e=>key(e.left,e.right))), explicit=new Set(topology.edges.map(e=>key(e.source,e.target)));
  assert.equal(comparison.candidateCount,[...sparse].filter(x=>!explicit.has(x)).length);
  assert.equal(comparison.alignedCount,[...sparse].filter(x=>explicit.has(x)).length);
  assert.equal(comparison.explicitOnlyCount,[...explicit].filter(x=>!sparse.has(x)).length);
  const unavailable=selected[0]?.leftPath??documents[0].path;
  const partial=a.deriveConnectionComparison(semantic,{...topology,nodes:topology.nodes.map(n=>n.path===unavailable?{...n,linksAvailable:false}:n)},1);
  assert(!partial.pairs.some(x=>[x.leftPath,x.rightPath].includes(unavailable))); assert(partial.unclassifiedSemanticPairCount>0);
  const output={protocolSha256,corpusSha256:Object.fromEntries(documents.map(d=>[d.path,sha(d.content)])),notes:documents.length,chunks:chunks.length,
    replayed,indexingResult,counts:summarize(comparison),cohort:selected,missingMetadata:{path:unavailable,counts:summarize(partial)}};
  if(fs.existsSync(directory+'observations/offline.json')) assert.deepEqual(JSON.parse(JSON.stringify(output)),json(directory+'observations/offline.json'));
  fs.writeFileSync(root+'/offline.json',JSON.stringify(output,null,2)+'\n');
  fs.writeFileSync(root+'/snapshots.json',JSON.stringify({semantic,topology,comparison},null,2)+'\n');
  fs.writeFileSync(root+'/profile/obsidian.json',JSON.stringify({vaults:{connectionRu:{path:vault,ts:Date.now(),open:true}}}));
  fs.writeFileSync(vault+'/.obsidian/community-plugins.json','["ai-knowledge-hub"]');
  fs.writeFileSync(vault+'/.obsidian/app.json','{"checkForUpdates":false,"showInlineTitle":false,"propertiesInDocument":"visible"}');
  fs.writeFileSync(plugin+'/data.json',JSON.stringify({language:'ru',apiKey:'',semantic:{enabled:true,embeddingProvider:provider.id,embeddingModel:model,
    embeddingBaseUrl:baseUrl,openRouterApiKey:'',openAICompatibleApiKey:''},rerank:{enabled:false},decisions:{enabled:false},companion:{enabled:false},
    health:{profile:'mixed',profileChosen:true,onboardingCompleted:true}},null,2));
  for(const f of ['main.js','manifest.json','styles.css']) fs.copyFileSync(repository+f,plugin+'/'+f);
  console.log(JSON.stringify({root,counts:output.counts,cohort:selected.map(x=>[x.leftPath,x.rightPath])},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(process.argv[2]==='inputs') fs.writeFileSync(process.argv[3],JSON.stringify(await inputs(),null,2)+'\n',{flag:'wx'});
  else {assert.equal(process.argv[2],'prepare');await prepare(process.argv[3]);}
}
