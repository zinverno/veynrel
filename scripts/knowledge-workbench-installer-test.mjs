import fs from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fs.mkdtempSync(tmpdir()+'/veynrel-workbench-install-test-');
const build=root+'/build',vault=root+'/Test vault',plugin=vault+'/.obsidian/plugins/ai-knowledge-hub';
fs.mkdirSync(build);fs.mkdirSync(plugin,{recursive:true});
const files={'main.js':'synthetic build','manifest.json':'{"id":"ai-knowledge-hub"}','styles.css':'/* synthetic */'};
const sha=value=>createHash('sha256').update(value).digest('hex');
for(const [name,value]of Object.entries(files)){fs.writeFileSync(build+'/'+name,value);fs.writeFileSync(plugin+'/'+name,'previous '+name)}
fs.copyFileSync(new URL('./install-knowledge-workbench.sh',import.meta.url),build+'/install.sh');
fs.writeFileSync(build+'/SOURCE_COMMIT','a'.repeat(40)+'\n');
fs.writeFileSync(build+'/SHA256SUMS',Object.entries(files).map(([name,value])=>`${sha(value)}  ${name}\n`).join(''));
for(const name of ['data.json','review-decisions.json','review-decisions.json.bak','connection-rules.json','connection-rules.json.bak','semantic-index/data','consolidation-operations/receipt']){fs.mkdirSync(plugin+'/'+name.split('/').slice(0,-1).join('/'),{recursive:true});fs.writeFileSync(plugin+'/'+name,'preserve '+name)}
const options={encoding:'utf8',env:{...process.env,XDG_STATE_HOME:root+'/state'}};
const output=execFileSync('bash',[build+'/install.sh',vault],options);const backup=output.match(/^Backup: (.+)$/m)[1];
for(const [name,value]of Object.entries(files)){assert.equal(fs.readFileSync(plugin+'/'+name,'utf8'),value);assert.equal(fs.readFileSync(backup+'/'+name,'utf8'),'previous '+name)}
for(const name of ['data.json','review-decisions.json','review-decisions.json.bak','connection-rules.json','connection-rules.json.bak','semantic-index/data','consolidation-operations/receipt'])assert.equal(fs.readFileSync(plugin+'/'+name,'utf8'),'preserve '+name);
const original=root+'/New Life 2.0';fs.mkdirSync(original+'/.obsidian',{recursive:true});assert.notEqual(spawnSync('bash',[build+'/install.sh',original],options).status,0);
fs.writeFileSync(build+'/main.js','tampered');assert.notEqual(spawnSync('bash',[build+'/install.sh',vault],options).status,0);assert.equal(fs.readFileSync(plugin+'/main.js','utf8'),files['main.js']);
fs.writeFileSync(build+'/main.js',files['main.js']);fs.renameSync(plugin+'/styles.css',plugin+'/styles.saved');fs.symlinkSync(plugin+'/styles.saved',plugin+'/styles.css');assert.notEqual(spawnSync('bash',[build+'/install.sh',vault],options).status,0);
console.log(JSON.stringify({status:'PASS',root,checks:['exact install','external three-file backup','settings/index/journals unchanged','original refused','tamper refused before writes','symlink target refused']}));
