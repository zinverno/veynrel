import fs from 'node:fs';
import assert from 'node:assert/strict';

// Public, deliberately overlapping metadata. No personal text/taxonomy is read.
export function createVisualFixture(vault, count, fixture, lab) {
 const broad=[['topic/sql',95],['role/theory',94],['difficulty/advanced',54],['type/guide',50],['status/working',45],['role/practice',31]];
 const names=['Query plans and the cost of a forgotten assumption','Transactions across independent services','A practical guide to repeatable experiments','Boundaries of a reliable cache','Reading a difficult execution trace','When a shared definition becomes ambiguous','Small steps toward reproducible knowledge'];
 const paths=['Workbench/A/Cache.md','Workbench/B/Cache.md',...Array.from({length:152},(_,i)=>`Synthetic/${['Database','Systems','Methods','Examples'][i%4]}/${String(i+1).padStart(3,'0')} — ${names[i%names.length]}.md`)];
 const tags=paths.map(()=>[]);
 broad.forEach(([tag,size],j)=>{for(let k=0;k<size;k++){const index=k<2?k:2+((k-2)*(j===1?7:11)+j*17)%148;tags[index].push(tag);}});
 for(let i=0;i<40;i++)for(let k=0;k<(i===39?1:8);k++){
   const index=2+(i*17+k*13)%148;
   if(tags[index].length<8)tags[index].push(`${['topic','role','difficulty','type','status'][i%5]}/sample-${String(i+1).padStart(2,'0')}`);
 }
 paths.forEach((path,i)=>{
  fs.mkdirSync(vault+'/'+path.split('/').slice(0,-1).join('/'),{recursive:true});
  const half=Math.ceil(tags[i].length/2), front=tags[i].slice(0,half),inline=tags[i].slice(half);
  const text=i===0?fixture.a:i===1?fixture.b:`# ${path.split('/').pop().replace(/\.md$/,'')}\n\nSynthetic visual-review material ${i}. This document describes a fictional experiment and contains no personal information.\n\n[[${paths[2+(i+1)%148].replace(/\.md$/,'')}]]\n[[${paths[2+(Math.floor(i/12)*12)%148].replace(/\.md$/,'')}]]\n`;
  // Pair fixture text stays intact so the existing evidence validator can verify exact ranges.
  fs.writeFileSync(vault+'/'+path,(i<2?'':`---\ntags: ${JSON.stringify(front)}\n---\n`)+text+'\n\n'+(i<2?tags[i]:inline).map(t=>'#'+t).join(' ')+'\n');
 });
 if(count>154){
  assert(lab&&fs.existsSync(lab),'Larger runs reuse the existing synthetic Lab');
  const source=fs.readdirSync(lab,{recursive:true}).filter(p=>p.endsWith('.md')&&fs.statSync(lab+'/'+p).isFile()).sort();
  assert(source.length===1000);
  for(const p of source.slice(0,count-154)){const path='LabCopy/'+p;fs.mkdirSync(vault+'/'+path.split('/').slice(0,-1).join('/'),{recursive:true});fs.copyFileSync(lab+'/'+p,vault+'/'+path);paths.push(path);}
 }
 const direct=[...new Set(tags.flat())];assert.equal(direct.length,46);
 const membership=Object.fromEntries(direct.map(tag=>[tag,tags.filter(ts=>ts.includes(tag)).length]));
 broad.forEach(([tag,size])=>assert.equal(membership[tag],size));
 return {paths,description:{synthetic:true,count,directTags:46,broad:Object.fromEntries(broad),membership,maxTags:Math.max(...tags.map(t=>t.length)),untagged:paths.slice(150,154),unknownScenario:paths[153],vectors:'Artificial deterministic UI fixture; not embedding quality'}};
}
