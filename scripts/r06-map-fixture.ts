/** Distinct synthetic text and deterministic vectors, not embedding-quality evidence. */
import { semanticGlobalMapFixture } from "./global-semantic-map-fixture";
const topics = [
  ["Databases", "query plans, transaction isolation and indexes", "A selective index reduces scanned rows; a transaction still needs an isolation contract."],
  ["Ecology", "wetlands, river flow and species diversity", "A restored wetland slows flood water while providing habitat for migratory birds."],
  ["Music", "rhythm, harmony and listening", "Changing meter alters phrasing; the same melody can support several harmonic readings."],
  ["Cooking", "fermentation, heat and ingredients", "Temperature and elapsed fermentation time change dough texture without changing the ingredient list."],
  ["Networks", "latency, queues and distributed failures", "A retry can amplify congestion; idempotent delivery requires a stable operation identity."],
  ["Language", "translation, context and ambiguity", "A word can name different concepts; its surrounding sentence constrains the translation."],
  ["Astronomy", "orbits, spectra and observation", "A stellar spectrum records absorption lines; atmospheric interference limits measurement."],
  ["Journal", "personal observations without prescribed taxonomy", "An unlinked diary entry can be useful without tags or organizational rules."],
];
export async function r06Fixture(count: number, indexed = count) {
  const notes = Array.from({length:count},(_,i)=>{
    const topic = Math.floor(i/25)%topics.length, [folder,subject,detail]=topics[topic];
    const path=`${folder}/Note ${String(i).padStart(5,"0")}.md`;
    return {path,topic,bridge:i%25===12,text:`# ${folder}: observation ${i}\n\n${detail}\n\nExperiment ${i}: examine ${subject}; sample ${i*17+3}, observation window ${i%31+1} days.\n`};
  });
  for(let i=0;i<notes.length;i++){
    const note=notes[i],next=notes.find(n=>n.topic!==(note.topic)) ?? note;
    if(note.bridge)note.text+=`\nThis is a deliberate cross-topic reference, not an error: [[${next.path.slice(0,-3)}]].\n`;
    else if(i%25>2)note.text+=`\nRelated local example: [[${notes[i-1].path.slice(0,-3)}]].\n`;
    if(note.topic!==7)note.text+=`\n#topic/${topics[note.topic][0].toLowerCase()}${i<2?" #kind/task":""}${note.bridge?" #role/bridge":""}\n`;
  }
  const fixture=await semanticGlobalMapFixture(0,32);
  const upserts=notes.slice(0,indexed).map((note,i)=>{
    const vector=new Float32Array(32);vector[0]=.1;vector[1+note.topic]=1;
    if(note.bridge)vector[1+(note.topic+1)%8]=.7;
    for(let d=10;d<32;d++)vector[d]=Math.sin((i+1)*(d+3))*.01;
    if(i<2){vector.fill(0);vector[0]=.1;vector[1]=1;}
    const norm=Math.hypot(...vector);for(let d=0;d<32;d++)vector[d]/=norm;
    return {id:note.path+":0",path:note.path,ordinal:0,headingPath:[],contentHash:`r06-synthetic-${i}`,
      preview:note.text,source:{startOffset:0,endOffset:note.text.length,startLine:0,endLine:note.text.split("\n").length-1},vector};
  });
  await fixture.store.applyChanges({upserts,deleteIds:[]});
  return {notes,files:fixture.files};
}
