// Installation/rollback only. Native boot and supported operation recovery use review-flow-native.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const [root,build,...previous]=process.argv.slice(2);
assert(root?.startsWith('/home/zinvernix/projects/veynrel-artifacts/')&&!fs.existsSync(root)&&previous.length===3);
fs.mkdirSync(root);const names=['main.js','manifest.json','styles.css'],sha=b=>createHash('sha256').update(b).digest('hex');
const retained={
 'data.json':JSON.stringify({language:'ru',semanticAutoSyncSuspended:true,provider:'custom',apiKey:''}),
 'review-decisions.json':'{"version":1,"decisions":[]}', 'review-decisions.json.bak':'{"version":1,"decisions":[]}',
 'connection-rules.json':'{"version":1,"rules":[{"id":"rule-1","mode":"within","selector":{"kind":"tag","value":"practice/task"},"enabled":true}]}',
 'connection-rules.json.bak':'{"version":1,"rules":[]}',
 'semantic-index/preservation-probe.bin':'synthetic opaque index bytes',
 'recall/cards.json':'{"version":2,"cards":[]}', 'recall/recovery/old.json':'synthetic previous recovery bytes',
 'consolidation-operations/preservation-probe/record.json':'synthetic opaque journal probe',
};
const checks=[];
for(const [i,old] of [null,...previous].entries()){
 const vault=root+'/case-'+i,dir=vault+'/.obsidian/plugins/ai-knowledge-hub';fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(vault+'/Synthetic.md','# Synthetic\n\nDo not modify.\n');
 for(const [p,text] of Object.entries(retained)){fs.mkdirSync(path.dirname(dir+'/'+p),{recursive:true});fs.writeFileSync(dir+'/'+p,text);}
 if(old)for(const n of names)fs.copyFileSync(old+'/'+n,dir+'/'+n);
 const opts={encoding:'utf8',env:{...process.env,XDG_STATE_HOME:root+'/state-'+i}};
 const output=execFileSync('bash',[build+'/install-knowledge-workbench.sh',vault],opts),backup=output.match(/^Backup: (.+)$/m)[1];
 assert(!backup.startsWith(vault+'/'));
 for(const n of names)assert.deepEqual(fs.readFileSync(dir+'/'+n),fs.readFileSync(build+'/'+n));
 const preserved=()=>{for(const [p,text] of Object.entries(retained))assert.equal(fs.readFileSync(dir+'/'+p,'utf8'),text);assert.equal(fs.readFileSync(vault+'/Synthetic.md','utf8'),'# Synthetic\n\nDo not modify.\n');};preserved();
 // Rollback is three-file restoration with the plugin stopped, never a journal/data rollback.
 for(const n of names){if(old){assert.deepEqual(fs.readFileSync(backup+'/'+n),fs.readFileSync(old+'/'+n));fs.copyFileSync(backup+'/'+n,dir+'/'+n);}else fs.unlinkSync(dir+'/'+n);}
 preserved();if(old)for(const n of names)assert.deepEqual(fs.readFileSync(dir+'/'+n),fs.readFileSync(old+'/'+n));
 checks.push({case:i,old:old?{version:JSON.parse(fs.readFileSync(old+'/manifest.json')).version,sha256:sha(fs.readFileSync(old+'/main.js'))}:null,retained:Object.keys(retained),install:true,rollback:true});
}
// Fail during a real three-file replacement; verify the external backup makes the partial installation recoverable.
const vault=root+'/case-1',dir=vault+'/.obsidian/plugins/ai-knowledge-hub',shim=root+'/bin';fs.mkdirSync(shim);
fs.writeFileSync(shim+'/mv','#!/bin/bash\ncase "$*" in *styles.css*) exit 71;; esac\nexec /usr/bin/mv "$@"\n');fs.chmodSync(shim+'/mv',0o755);
const failure=spawnSync('bash',[build+'/install-knowledge-workbench.sh',vault],{encoding:'utf8',env:{...process.env,PATH:shim+':'+process.env.PATH,XDG_STATE_HOME:root+'/failure-state'}});
assert.notEqual(failure.status,0);const backup=failure.stdout.match(/^Backup: (.+)$/m)[1];
for(const n of names){assert.deepEqual(fs.readFileSync(backup+'/'+n),fs.readFileSync(previous[0]+'/'+n));fs.copyFileSync(backup+'/'+n,dir+'/'+n);}
for(const [p,text] of Object.entries(retained))assert.equal(fs.readFileSync(dir+'/'+p,'utf8'),text);
checks.push({replacementFailure:true,externalBackupRestoration:true,automaticRollback:false});
fs.writeFileSync(root+'/report.json',JSON.stringify({status:'PASS',checks,limits:'Opaque byte-retention probes do not assert journal/index schema compatibility. Native valid previous-operation Undo is checked separately. No cross-process or Sync claim.'},null,2));console.log(JSON.stringify({status:'PASS',checks:checks.length,root}));
