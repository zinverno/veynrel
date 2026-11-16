const fs=require('fs'),path=require('path'),crypto=require('crypto');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
(async()=>{
 const fixture=await require('/tmp/veynrel-map-native-delivery120/fixture.cjs').r06Fixture(10000,0);
 const expected=new Map(fixture.notes.map(n=>[n.path,sha(Buffer.from(n.text))]));
 const rows=[];
 for(const entry of fs.readdirSync('/tmp').filter(n=>n.startsWith('veynrel-map-native-')).sort()){
  const root=path.join('/tmp',entry),file=path.join(root,'report.json');
  if(!fs.existsSync(file))continue;
  const report=JSON.parse(fs.readFileSync(file)),mismatches=[];const hashes={};
  for(const note of fixture.notes.slice(0,report.count)){
   const f=path.join(root,'vault',note.path),actual=fs.existsSync(f)?sha(fs.readFileSync(f)):null;
   hashes[note.path]=actual;if(actual!==expected.get(note.path))mismatches.push(note.path);
  }
  rows.push({attempt:entry.replace('veynrel-map-native-',''),count:report.count,checked:fixture.notes.slice(0,report.count).length,mismatches,manifestSha256:sha(JSON.stringify(hashes)),status:mismatches.length?'FAIL':'PASS'});
 }
 fs.writeFileSync('/tmp/r06-postrun-bytes.json',JSON.stringify({kind:'independent read-only post-run byte audit; does not retroactively pass failed native scenarios',fixtureSha256:sha(fs.readFileSync('/tmp/veynrel-map-native-delivery120/fixture.cjs')),expectedSource:'scripts/r06-map-fixture.ts at f5fa98ad5abf33ccba9a384c306b7e90be651505; first N note text independent of index count',rows},null,2)+'\n');
 console.log(rows.map(r=>[r.attempt,r.checked,r.status]));
 if(rows.some(r=>r.status!=='PASS'))process.exitCode=1;
})();
