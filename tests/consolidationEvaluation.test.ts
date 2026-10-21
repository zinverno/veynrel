import {describe,it,expect,vi} from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import corpus from "./fixtures/consolidation-realistic-v1.json";
import {validateRelationshipResponse} from "../consolidation/relationshipContract";
import {scoreResponse,shapeValid,summarize,validateCorpus,sha256} from "../scripts/consolidation-evaluation-metrics.mjs";
import {evaluate,inputs,compare} from "../scripts/consolidation-evaluation.mjs";
import {authorize,runLive} from "../scripts/consolidation-evaluation-live.mjs";
const fixture=(id:string)=>structuredClone(corpus.cases.find(c=>c.id===id)!);
const score=(c:ReturnType<typeof fixture>,r=c.controlResponse)=>scoreResponse(c,JSON.stringify(r),validateRelationshipResponse);
const profiles=fs.readFileSync("tests/fixtures/consolidation-model-profiles.json");
const temp=()=>fs.mkdtempSync(path.join(os.tmpdir(),"veynrel-eval-unit-"));
const approval=async(root=temp())=>{const d=await inputs();return {approved:true,purpose:"Veynrel synthetic Relationship Analyzer evaluation",runId:"unit-test-run",runDirectory:path.join(root,"unit-test-run"),corpusSha256:d.corpusSha256,promptSha256:d.promptSha256,
  profilesSha256:sha256(profiles),expiresAt:new Date(Date.now()+60000).toISOString(),dedicatedUnusedKey:true,noBYOK:true,maxRequests:3,maxUSD:3,reservePerRequestUSD:1,maxPromptUSDPerMillion:1,maxCompletionUSDPerMillion:1,caseIds:["03"]};};

describe("realistic evaluation separates shape, grounding, semantics and applicability",()=>{
  it("keeps the historical quote experiment separate from the new product wire schema",async()=>{
    const d=await inputs();
    expect(d.promptSha256).toBe("c52d9c5ca313a6280bf6b270c84f9b6ae09abaa1186638b6510cbde9779bf5f6");
    expect(d.api.relationshipPrompt("en")).toContain('"quoteA"');
    expect(d.api.relationshipPrompt("en")).not.toContain("veynrel.relationship.refs.v1");
    expect(Object.keys(JSON.parse(d.requests[0].input) as Record<string, unknown>)).toEqual(["A","B"]);
    const a=await approval();expect(()=>authorize({...a,promptSha256:"product-wire-prompt"},d,profiles)).toThrow();
  });
  it("validates all reference spans, languages, exact control quotes and all 24 cases",()=>{
    validateCorpus(corpus,validateRelationshipResponse);expect(corpus.cases).toHaveLength(24);
    expect(corpus.cases.filter(c=>c.gold.fullCycle).map(c=>c.gold.canonical)).toEqual([0,1,1,0]);
  });
  it("distinguishes required quote type, invented quote and grounded wrong interpretation",()=>{
    const c=fixture("03"),r=c.controlResponse;
    const missing=structuredClone(r);missing.claims[0].quoteA=null;expect(shapeValid(missing)).toBe(false);
    const invented=structuredClone(r);invented.claims[0].quoteA="A sentence absent from the source.";
    expect(score(c,invented)).toMatchObject({shapeValid:true,productionAccepted:false,productionFailure:"unverifiedEvidence"});
    const wrong=structuredClone(r);wrong.relation="related_distinct";wrong.recommendation.action="add_link";
    expect(score(c,wrong)).toMatchObject({shapeValid:true,productionAccepted:true,relationCorrect:false});
    expect(score(c,wrong).semantic).toBeNull();
  });
  it("detects a grounded but false merge recommendation and false conflict",()=>{
    const c=fixture("12"),r=c.controlResponse;r.relation="partial_overlap";r.claims[0].kind="shared";r.recommendation.action="consider_merge";
    expect(score(c,r)).toMatchObject({productionAccepted:true,falseMerge:true,relationCorrect:false});
    const alternative={...r,recommendation:{...r.recommendation,action:"manual_review"},alternatives:[{...r.recommendation,action:"consider_merge"}]};
    expect(scoreResponse(c,JSON.stringify(alternative),validateRelationshipResponse).falseMerge).toBe(true);
    r.relation="conflicting";r.claims[0].kind="conflict";r.recommendation.action="manual_review";
    expect(score(c,r)).toMatchObject({productionAccepted:true,falseConflict:true});
    expect(score(fixture("13")).falseConflict).toBe(false);
  });
  it("compares three configurations and exposes unequal coverage instead of hiding missing responses",async()=>{
    const d=await inputs(),root=temp();
    const files=["a","b","c"].map((profile,i)=>{
      const f=path.join(root,profile+".json");fs.writeFileSync(f,JSON.stringify({profile,corpusSha256:d.corpusSha256,promptSha256:d.promptSha256,
        items:(i===2?[]:[{caseId:"03",raw:JSON.stringify(fixture("03").controlResponse)}])}));return f;
    });
    const result=await compare(files);expect(result.coverageComparable).toBe(false);expect(result.profiles[2].missingEligible).toHaveLength(23);
    await expect(compare([files[0],files[0],files[1]])).rejects.toThrow("Duplicate configuration");
    await expect(compare(files.slice(0,2))).rejects.toThrow("three configurations");
  });
  it("does not reward abstain-all as useful analysis or count truncated coverage as complete",()=>{
    const abstain={relation:"insufficient_context",explanation:{text:"Insufficient evidence.",evidence:[]},claims:[],recommendation:{action:"no_change",reason:"Need context.",evidence:[]},alternatives:[],limitations:[]};
    const rows=corpus.cases.filter(c=>c.id!=="18").map(c=>scoreResponse(c,JSON.stringify(abstain),validateRelationshipResponse));
    const metrics=summarize(rows);expect(metrics.shape.value).toBe(1);expect(metrics.justifiedAbstentionPrecision.numerator).toBe(1);expect(metrics.justifiedAbstentionPrecision.denominator).toBe(23);
    expect(score(fixture("19")).uniqueLiteralCovered.length).toBeLessThan(fixture("19").gold.unique.length);
  });
  it("requires conflict/version typing for those reference units and flags unavailable atomization",()=>{
    for(const id of ["11","13"]){
      const c=fixture(id),before=score(c);expect(before.uniqueLiteralCovered).toHaveLength(2);
      const claims=c.controlResponse.claims.flatMap<{id:string;kind:string;text:string;quoteA:string|null;quoteB:string|null}>(claim=>claim.kind==="conflict"||claim.kind==="version_difference"?
        [{...claim,id:claim.id+"a",kind:"unique_a",quoteB:null},{...claim,id:claim.id+"b",kind:"unique_b",quoteA:null}]:[claim]);
      expect(scoreResponse(c,JSON.stringify({...c.controlResponse,claims}),validateRelationshipResponse).uniqueLiteralCovered).toHaveLength(0);
    }
    const c=fixture("03"),claim=c.controlResponse.claims.find(c=>c.kind==="unique_b")!;claim.kind="standalone_b";
    c.controlResponse.recommendation={action:"consider_atomize",reason:"Diagnostic action availability probe.",evidence:[claim.id]};
    expect(score(c)).toMatchObject({productionAccepted:true,unsupportedActions:["consider_atomize"]});
  });
  it("requires complete response-bound semantic adjudication; literal correctness alone has no semantic score",()=>{
    const c=fixture("03"),raw=JSON.stringify(c.controlResponse),a={responseSha256:sha256(raw),reviewer:"unit fixture",complete:true,
      claims:c.controlResponse.claims.map(c=>({id:c.id,verdict:"correct",uniqueIds:[]}))};
    expect(scoreResponse(c,raw,validateRelationshipResponse,a).semantic?.correctClaims).toBe(c.controlResponse.claims.length);
    expect(()=>scoreResponse(c,raw+" ",validateRelationshipResponse,a)).toThrow();
    expect(()=>scoreResponse(c,raw,validateRelationshipResponse,{...a,claims:[]})).toThrow();
    expect(scoreResponse(c,"{broken",validateRelationshipResponse).productionAccepted).toBe(false);
  });
  it("offline run has no fetch, labels its circular controls, and rejects stale reference adjudication/imports",async()=>{
    const fetch=vi.fn(()=>{throw Error("offline network");});vi.stubGlobal("fetch",fetch);
    try{
      const result=await evaluate();expect(result.kind).toContain("NOT-model-quality");expect(result.inputGated).toEqual(["18"]);expect(result.rows).toHaveLength(23);expect(result.metrics.semanticReviewedPairs).toBe(0);expect(fetch).not.toHaveBeenCalled();
      const dir=temp(),file=path.join(dir,"adjudication.json");fs.writeFileSync(file,JSON.stringify({corpusSha256:"stale",cases:{}}));
      await expect(evaluate(null,file)).rejects.toThrow("another reference");
      fs.writeFileSync(file,JSON.stringify({corpusSha256:"stale",profile:"x",items:[]}));await expect(evaluate(file)).rejects.toThrow();
    }finally{vi.unstubAllGlobals();}
  });
});
describe("external runner authorization and bounded receipts (mock HTTP only)",()=>{
  it("rejects missing opt-in before credentials, network or output",async()=>{
    const getKey=vi.fn(),transport=vi.fn();await expect(runLive({optIn:false,authorization:{},profileBytes:profiles,runRoot:temp(),getKey,transport})).rejects.toThrow();expect(getKey).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
  });
  it("rejects stale approval, gated input, wrong corpus, count and reservation ceilings",async()=>{
    const a=await approval(),d=await inputs();
    for(const patch of [{approved:false},{expiresAt:"2020-01-01"},{caseIds:["18"]},{corpusSha256:"wrong"},{maxRequests:2},{maxUSD:2}])expect(()=>authorize({...a,...patch},d,profiles)).toThrow();
  });
  it("runs at most the approved three profiles; writes reservations before HTTP, never stores the key, never replays",async()=>{
    const root=temp(),a=await approval(root);let calls=0;
    const transport=vi.fn(async(url:string,options:RequestInit)=>{
      if(url.endsWith("/key"))return new Response(JSON.stringify({data:{limit:3,limit_remaining:3,usage:0,byok_usage:0,limit_reset:null}}));
      calls++;const ledger=fs.readFileSync(path.join(root,a.runId,"receipts.jsonl"),"utf8");expect((JSON.parse(ledger.trim().split("\n").at(-1)!) as {event:string}).event).toBe("reserved");
      if(typeof options.body!=="string")throw Error("Expected serialized request body");
      const body=JSON.parse(options.body) as {max_tokens:number;temperature:number;provider:{allow_fallbacks:boolean}};expect(body.max_tokens).toBe(4000);expect(body.temperature).toBe(0);expect(body.provider.allow_fallbacks).toBe(false);
      return new Response(JSON.stringify({usage:{cost:0.001},choices:[{message:{content:JSON.stringify(fixture("03").controlResponse)},finish_reason:"stop"}]}));
    });
    const args={optIn:true,authorization:a,profileBytes:profiles,runRoot:root,getKey:()=>"secret-test-key",transport};
    await runLive(args);expect(calls).toBe(3);expect(transport).toHaveBeenCalledTimes(4);
    for(const file of fs.readdirSync(path.join(root,a.runId)))expect(fs.readFileSync(path.join(root,a.runId,file),"utf8")).not.toContain("secret-test-key");
    await expect(runLive(args)).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(4);
    await expect(runLive({...args,runRoot:temp()})).rejects.toThrow("another run directory");expect(transport).toHaveBeenCalledTimes(4);
  });
  it("unknown billing stops after one reserved request with evidence and no retry",async()=>{
    const root=temp(),a=await approval(root),transport=vi.fn(async(url:string)=>new Response(JSON.stringify(url.endsWith("/key")?{data:{limit:3,limit_remaining:3,usage:0,byok_usage:0,limit_reset:null}}:{choices:[]})));
    await expect(runLive({optIn:true,authorization:a,profileBytes:profiles,runRoot:root,getKey:()=>"fixture",transport})).rejects.toThrow("billing");expect(transport).toHaveBeenCalledTimes(2);
    const log=fs.readFileSync(path.join(root,a.runId,"receipts.jsonl"),"utf8");expect(log).toContain('"event":"reserved"');expect(log).toContain('"event":"stopped"');expect(log).not.toContain('"event":"completed"');
  });
  it("a partial reservation write or expired approval during persistence cannot dispatch",async()=>{
    for(const fault of ["short-write","expired"]){
      const root=temp(),a=await approval(root),transport=vi.fn(async()=>new Response(JSON.stringify({data:{limit:3,limit_remaining:3,usage:0,byok_usage:0,limit_reset:null}})));
      const original=fs.writeSync;let pending=false;
      const write=vi.spyOn(fs,"writeSync").mockImplementation((...args:Parameters<typeof fs.writeSync>)=>{
        if(String(args[1]).includes('"event":"reserved"')){pending=true;if(fault==="short-write")return 1;}
        return Reflect.apply(original,fs,args);
      });
      const now=vi.spyOn(Date,"now");now.mockImplementation(()=>pending&&fault==="expired"?Date.parse(a.expiresAt)+1:Date.parse(a.expiresAt)-30000);
      try{await expect(runLive({optIn:true,authorization:a,profileBytes:profiles,runRoot:root,getKey:()=>"fixture",transport})).rejects.toThrow();expect(transport).toHaveBeenCalledTimes(1);}
      finally{write.mockRestore();now.mockRestore();}
    }
  });
});
