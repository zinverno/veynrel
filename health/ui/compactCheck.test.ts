import { describe, it, expect, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en" }));
import { setLanguage } from "../../i18n";
import { findingsInboxViewModel, findingsRoute } from "./findingsInboxViewModel";
import { inboxFinding } from "./testSupport";
import { LocalScanCoordinator } from "../analyzers/local/localScanCoordinator";
import { note, snapshot } from "../analyzers/local/testFixtures";

describe("compact check data boundaries", () => {
  it.each(["en", "ru"] as const)("all 10k findings remain reachable with at most 60 rows in %s", language => {
    setLanguage(language);
    const findings = Array.from({length:10_000},(_,i)=>inboxFinding({id:`finding-${i}`,notePaths:[`Folder/Note-${i}.md`]}));
    const seen=new Set<string>();
    for(let offset=0;offset<findings.length;offset+=60){
      const m=findingsInboxViewModel({findings,route:findingsRoute({offset})});
      expect(m.rows.length).toBeLessThanOrEqual(60);expect(m.total).toBe(10_000);m.rows.forEach(r=>seen.add(r.id));
    }
    expect(seen.size).toBe(10_000);
    const m=findingsInboxViewModel({findings,route:findingsRoute({query:"Folder/Note-9999.md"})});
    expect(m.rows.map(r=>r.id)).toEqual(["finding-9999"]);
  });
  it("searches actual evidence and keeps dismissed decisions separate from open results", () => {
    const f=inboxFinding({type:"broken-link",notePaths:["A.md"],evidence:[{kind:"target",value:"MissingTarget"}]});
    const dismissed=inboxFinding({...f,id:"dismissed",state:"dismissed"});
    const m=findingsInboxViewModel({findings:[f,dismissed],route:findingsRoute({query:"MissingTarget",category:"links"})});
    expect(m.rows.map(r=>r.id)).toEqual([f.id]);expect(m.counts.dismissed).toBe(1);
    expect(m.rows[0].facts.join(" ")).toContain("MissingTarget");expect(m.rows[0]).not.toHaveProperty("line");
  });
  it("does not conflate unavailable metadata/content, and retains bounded diagnostic paths", async () => {
    const input={...snapshot([note("known.md"),note("metadata.md",{linksAvailable:false}),note("content.md",{contentAvailable:false,content:undefined})],{contentComplete:false,linksComplete:false}),
      diagnostics:[{code:"links-unavailable" as const,message:"Link metadata unavailable",path:"metadata.md"}]};
    const source={capture:vi.fn(async()=>input)};
    const result=await new LocalScanCoordinator(source).analyze(new AbortController().signal);
    expect(result.coverage).toMatchObject({listed:3,fullyAvailable:1,contentUnavailable:1,linksUnavailable:1,noteListComplete:true});
    expect(result.coverage?.diagnostics[0].path).toBe("metadata.md");expect(source.capture).toHaveBeenCalledTimes(1);
    expect(result.results.find(r=>r.analyzerId==="orphans")?.complete).toBe(false);
  });
  it("empty is a complete zero source; cancelled capture cannot publish a complete receipt", async () => {
    const source={capture:vi.fn(async()=>snapshot([]))};
    expect((await new LocalScanCoordinator(source).analyze(new AbortController().signal)).coverage).toMatchObject({listed:0,fullyAvailable:0,noteListComplete:true});
    const abort=new AbortController();abort.abort();source.capture.mockClear();
    await expect(new LocalScanCoordinator(source).analyze(abort.signal)).rejects.toThrow();expect(source.capture).not.toHaveBeenCalled();
  });
});
