/** Synthetic vectors test projection contracts, never real embedding quality. */
import { semanticGlobalMapFixture } from "./global-semantic-map-fixture";
export async function r06FamiliesFixture() {
  const input: [string, string, number[]][] = [
    ["Docker/Guide.md", "Container images share immutable layers. A deployment pins its image digest.\n\n#topic/containers/runtime", [1,.01,0,0,0]],
    ["Docker/Volumes.md", "Volumes preserve container data between image replacements.\n\n#topic/containers", [1,.02,0,0,0]],
    ["Database/Guide.md", "A transaction commits atomically; isolation governs concurrent readers.\n\n#topic/databases/sql", [.01,1,0,0,0]],
    ["Database/Indexes.md", "A selective index reduces scanned rows but adds maintenance cost.\n\n#topic/databases", [.02,1,0,0,0]],
    ["Bridges/Docker database.md", "Running a database in Docker combines volume persistence with transaction recovery.\n\n#topic/containers #topic/databases", [1,1,0,0,0]],
    ["Architecture/Boundaries.md", "A module boundary defines ownership and stable interfaces. [[Docker/Guide]] is a deliberate implementation bridge.", [0,0,1,.01,0]],
    ["Architecture/Ports.md", "Ports separate a domain from external adapters. An interface states the ownership contract.", [0,0,1,.02,0]],
    ["Architecture/Lifecycle.md", "The component owner disposes resources and callbacks when its view closes.", [0,0,1,.03,0]],
    ["ML/Training.md", "Training adjusts model parameters using a fixed loss and examples. This is an implementation reference.", [0,0,0,1,.01]],
    ["ML/Critique.md", "A critique of training terminology shares vocabulary with the reference but has a different purpose.", [0,0,0,1,.02]],
    ["Journal/Walk.md", "Today I walked by the river and recorded the changing light. No organizational taxonomy is required.", [0,0,0,0,1]],
    ["Architecture/Unresolved.md", "Unresolved cross-reference for structural inspection: [[Missing source]].", [.1,.1,.1,.1,1]],
  ];
  const notes=input.map(([path,body])=>({path,text:`# ${path.split('/').pop()!.replace(/\.md$/u,'')}\n\n${body}\n`}));
  const fixture=await semanticGlobalMapFixture(0,32);
  await fixture.store.applyChanges({upserts:notes.map((note,i)=>{
    const vector=new Float32Array(32);input[i][2].forEach((v,d)=>{vector[d]=v;});
    const norm=Math.hypot(...vector);for(let d=0;d<vector.length;d++)vector[d]/=norm;
    return {id:note.path+':0',path:note.path,ordinal:0,headingPath:[],contentHash:`r062-synthetic-${i}`,preview:note.text,
      source:{startOffset:0,endOffset:note.text.length,startLine:0,endLine:note.text.split('\n').length-1},vector};
  }),deleteIds:[]});
  return {notes,files:fixture.files};
}
