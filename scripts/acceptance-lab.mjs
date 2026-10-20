#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { generate, validate, sourceProfile, sha, random, walk } from './acceptance-lab/generate.mjs';

const repo=fs.realpathSync(fileURLToPath(new URL('..',import.meta.url)));
export function safePaths(source,output,reportDir) {
  const input=fs.realpathSync(source),parent=fs.realpathSync(path.dirname(output));
  const target=path.join(parent,path.basename(output)),reportParent=fs.realpathSync(path.dirname(reportDir)),reports=path.join(reportParent,path.basename(reportDir));
  const contains=(a,b)=>b===a||b.startsWith(a+path.sep);
  if(contains(input,target)||contains(target,input)||contains(input,reports)||contains(reports,input)||contains(target,reports)||contains(reports,target))throw Error('Source, vault and reports must be separate, non-overlapping directories');
  if(contains(repo,target)||contains(repo,reports))throw Error('Generated vault and reports must stay outside the repository');
  if(fs.existsSync(target)||fs.existsSync(reports))throw Error('Refusing existing vault or report path; choose new paths');
  return {input,target,reports};
}
export function run(options) {
  const {input,target,reports}=safePaths(path.resolve(options.source),path.resolve(options.output),path.resolve(options.reportDir));
  const source=sourceProfile(input),dataset=generate({count:options.count,seed:options.seed,profile:source.public});
  const metrics=validate(dataset,source.privateShingles);
  const manifest={schema:'veynrel.acceptance-lab.v2',seed:dataset.seed,sourceProfile:source.public,notes:dataset.notes.map(({text,...n})=>({...n,sha256:sha(text),bytes:Buffer.byteLength(text)})),pairs:dataset.pairs,scenarios:dataset.scenarios};
  manifest.corpusSha256=sha(manifest.notes.map(n=>n.path+':'+n.sha256).join('\n'));
  const rng=random(dataset.seed+':manual-review'),sample=[...dataset.notes].map(n=>({n,r:rng()})).sort((a,b)=>a.r-b.r).slice(0,50).map(x=>x.n);
  if(options.dryRun)return {dryRun:true,metrics,corpusSha256:manifest.corpusSha256};
  // Validate the entire corpus before any write; exclusive creation refuses races and existing vaults.
  fs.mkdirSync(target,{mode:0o700});fs.mkdirSync(reports,{mode:0o700});
  for(const n of dataset.notes){const file=path.join(target,n.path);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,n.text,{flag:'wx',mode:0o600});}
  const write=(name,value)=>fs.writeFileSync(path.join(reports,name),value,{flag:'wx',mode:0o600});
  write('manifest.json',JSON.stringify(manifest,null,2)+'\n');write('metrics.json',JSON.stringify(metrics,null,2)+'\n');
  write('sample-50.md',sample.map(n=>`<!-- ${n.path} | ${n.form} -->\n\n${n.text}\n\n---\n`).join('\n'));
  write('sample-50.json',JSON.stringify(sample.map(n=>({path:n.path,form:n.form,sha256:sha(n.text)})),null,2)+'\n');
  if(walk(target).length!==options.count)throw Error('Written count mismatch');
  for(const n of manifest.notes)if(sha(fs.readFileSync(path.join(target,n.path)))!==n.sha256)throw Error('Written hash mismatch');
  if(sourceProfile(input).public.fingerprint!==source.public.fingerprint)throw Error('Source changed during generation; inspect before accepting');
  return {dryRun:false,metrics,corpusSha256:manifest.corpusSha256};
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {values:v}=parseArgs({options:{source:{type:'string'},output:{type:'string'},'report-dir':{type:'string'},count:{type:'string',default:'1000'},seed:{type:'string',default:'veynrel-lab-v2'},'dry-run':{type:'boolean',default:false},help:{type:'boolean'}}});
    if(v.help)console.log('node scripts/acceptance-lab.mjs --source SOURCE --output NEW_VAULT --report-dir NEW_REPORT_DIR [--count 1000] [--seed veynrel-lab-v2] [--dry-run]\nNo network or paid models. Source is read-only. Existing paths are always refused.');
    else {if(!v.source||!v.output||!v['report-dir'])throw Error('source, output and report-dir are required');console.log(JSON.stringify(run({source:v.source,output:v.output,reportDir:v['report-dir'],count:Number(v.count),seed:v.seed,dryRun:v['dry-run']}),null,2));}
  }catch(error){console.error(error instanceof Error?error.message:'Generation failed');process.exitCode=1;}
}
