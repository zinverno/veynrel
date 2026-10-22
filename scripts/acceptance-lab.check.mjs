// Offline boundary checks. Uses only a freshly owned temporary fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import { run, safePaths } from './acceptance-lab.mjs';
import { generate, validate, walk, sha } from './acceptance-lab/generate.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'veynrel-lab-check-'));
try {
  const source=path.join(root,'source');fs.mkdirSync(source);fs.writeFileSync(path.join(source,'SQL.md'),'A private original sentence must never become generated note prose.\n');
  const before=fs.readFileSync(path.join(source,'SQL.md'));
  const opts={source,output:path.join(root,'vault'),reportDir:path.join(root,'reports'),count:1000,seed:'checks',dryRun:true};
  const first=run(opts),second=run(opts);assert.deepEqual(first,second);assert(!fs.existsSync(opts.output));assert(!fs.existsSync(opts.reportDir));
  assert.equal(first.metrics.count,1000);assert.equal(first.metrics.labelledPairs,120);assert(first.metrics.empty>0);assert(first.metrics.structures.h6>0);assert(first.metrics.englishNotes>=50);
  const written=run({...opts,dryRun:false});assert.equal(written.corpusSha256,first.corpusSha256);assert.equal(walk(opts.output).length,1000);assert.deepEqual(fs.readFileSync(path.join(source,'SQL.md')),before);
  const Ajv=createRequire(import.meta.url)('ajv'); // Existing locked ESLint dependency; no install or network.
  const validateManifest=new Ajv().compile(JSON.parse(fs.readFileSync(new URL('./acceptance-lab/manifest.schema.json',import.meta.url))));
  assert(validateManifest(JSON.parse(fs.readFileSync(opts.reportDir+'/manifest.json'))),JSON.stringify(validateManifest.errors));
  assert.throws(()=>run({...opts,dryRun:false}),/existing/);assert.throws(()=>safePaths(source,path.join(source,'child'),path.join(root,'reports2')),/overlapping/);
  fs.symlinkSync(source,path.join(root,'source-alias'));assert.throws(()=>safePaths(source,path.join(root,'source-alias','child'),path.join(root,'reports2')),/overlapping/);
  const a=generate({seed:'one'}),b=generate({seed:'two'});assert.notEqual(sha(JSON.stringify(a)),sha(JSON.stringify(b)));
  assert.throws(()=>generate({count:299}));assert.throws(()=>generate({count:1001}));
  const bad=structuredClone(a);bad.notes[250].text='Bearer abcdefghijklmnopqrstuvwxyz0123456789';assert.throws(()=>validate(bad),/secrets=1/);
  const copied=structuredClone(a);copied.notes[400].text=copied.notes[401].text;assert.throws(()=>validate(copied),/duplicateGroups/);
  fs.writeFileSync(path.join(source,'SQL.md'),a.notes[300].text);
  assert.throws(()=>run({...opts,seed:'one',output:path.join(root,'new'),reportDir:path.join(root,'new-reports')}),/private=/);
  assert(!fs.existsSync(path.join(root,'new')));
  fs.writeFileSync(path.join(source,'SQL.md'),Buffer.from([0xff]));assert.throws(()=>run({...opts,output:path.join(root,'invalid'),reportDir:path.join(root,'invalid-reports')}));
  console.log('PASS: deterministic 1000-note writes; 120 labels; dry-run no writes; source unchanged; overwrite/overlap/symlink refusal; secret, copy and invalid UTF-8 rejection.');
}finally {fs.rmSync(root,{recursive:true,force:true});}
