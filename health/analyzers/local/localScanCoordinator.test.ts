import { describe, expect, it, vi } from "vitest";
import { LocalScanCoordinator } from "./localScanCoordinator";
import { LOCAL_HEALTH_ANALYZERS } from "./index";
import { note, snapshot } from "./testFixtures";
import { createLocalAnalysisContext } from "./localNoteGraph";
import { analyzerResult } from "./candidates";
import { isFindingCandidate } from "../../domain/findingValidation";
import * as identity from "../../domain/identity";
import type { AnalyzerResult, HealthAnalyzer } from "../types";
import type { LocalAnalysisContext, LocalVaultSnapshot } from "./types";

const signal = (): AbortSignal => new AbortController().signal;
const richNotes = () => [
  note("A/Foo.md", { content: "Long repeated body of knowledge that exceeds the duplicate eligibility threshold.", resolvedOutgoing: ["B/Foo.md"], unresolvedLinks: [{ target: "Missing", count: 2 }] }),
  note("B/Foo.md", { content: "Long repeated body of knowledge that exceeds the duplicate eligibility threshold.", resolvedOutgoing: ["C.md"] }),
  note("C.md", { content: "" }), note("D.md", { content: "Tiny", resolvedOutgoing: ["D.md"] }),
  note("E.md", { resolvedOutgoing: ["F.md"] }), note("F.md", { resolvedOutgoing: ["E.md"] }),
];
function source(value: LocalVaultSnapshot) { return { capture: vi.fn(async () => value) }; }
function custom(id: string, analyze: HealthAnalyzer<LocalAnalysisContext>["analyze"]): HealthAnalyzer<LocalAnalysisContext> {
  return { id, version: "1", analyze };
}

describe("local scan coordination", () => {
  it("captures once, runs all stable registry IDs/versions and validates every candidate", async () => {
    const input = source(snapshot(richNotes()));
    const fingerprint = vi.spyOn(identity, "createFindingFingerprint");
    const result = await new LocalScanCoordinator(input).analyze(signal());
    expect(input.capture).toHaveBeenCalledTimes(1);
    expect(result.notesSeen).toBe(6);
    const ids = ["broken-links", "duplicate-titles", "exact-duplicates", "graph-components", "no-incoming-links", "no-outgoing-links", "note-shape", "orphans"];
    expect(LOCAL_HEALTH_ANALYZERS.map((analyzer) => [analyzer.id, analyzer.version])).toEqual(ids.map((id) => [id, "1"]));
    expect(result.results.map((item) => item.analyzerId)).toEqual(ids);
    expect(result.analyzerVersions).toEqual(Object.fromEntries(ids.map((id) => [id, "1"])));
    for (const item of result.results) {
      expect(item.successful).toBe(true);
      expect(item.complete).toBe(true);
      expect(item.candidates.length).toBeGreaterThan(0);
      expect(item.candidates.every(isFindingCandidate)).toBe(true);
      expect(item.candidates.every((candidate) => candidate.analyzerId === item.analyzerId && candidate.source === "local" && candidate.confidence === "deterministic")).toBe(true);
      expect(item.candidates.map((candidate) => candidate.fingerprint)).toEqual(item.candidates.map((candidate) => candidate.fingerprint).sort());
    }
    expect(fingerprint).toHaveBeenCalledTimes(result.results.reduce((count, item) => count + item.candidates.length, 0));
    fingerprint.mockRestore();
    const dTypes = result.results.flatMap((item) => item.candidates).filter((item) => item.notePaths.includes("D.md")).map((item) => item.type);
    expect(dTypes).toContain("orphan-note");
    expect(dTypes).not.toContain("no-incoming-links");
    expect(dTypes).not.toContain("no-outgoing-links");
  });

  it("is deterministic under note order, edge order and registry order changes", async () => {
    const notes = richNotes();
    const first = await new LocalScanCoordinator(source(snapshot(notes))).analyze(signal());
    const reversed = notes.reverse().map((item) => ({ ...item, resolvedOutgoing: [...item.resolvedOutgoing].reverse() }));
    const second = await new LocalScanCoordinator(source(snapshot(reversed)), [...LOCAL_HEALTH_ANALYZERS].reverse()).analyze(signal());
    expect(second).toEqual(first);
  });

  it("distinguishes successful partial coverage from failure, without false graph claims", async () => {
    const notes = [...richNotes(), note("Unknown.md", { content: undefined, contentAvailable: false, linksAvailable: false })];
    const result = await new LocalScanCoordinator(source(snapshot(notes))).analyze(signal());
    for (const item of result.results) {
      expect(item.successful).toBe(true);
      expect(item.complete).toBe(item.analyzerId === "duplicate-titles");
      if (["orphans", "no-incoming-links", "graph-components"].includes(item.analyzerId)) expect(item.candidates).toEqual([]);
    }
    expect(result.results.find((item) => item.analyzerId === "no-outgoing-links")!.candidates.map((item) => item.notePaths)).toEqual([["C.md"]]);
    expect(result.results.flatMap((item) => item.candidates).some((item) => item.notePaths.includes("Unknown.md"))).toBe(false);
  });

  it("isolates an unexpected exception, returns a safe diagnostic and continues", async () => {
    const failing = custom("aaa-failing", async () => { throw new Error("SECRET MARKDOWN BODY\n at private stack"); });
    const result = await new LocalScanCoordinator(source(snapshot([note("D.md")])), [failing, LOCAL_HEALTH_ANALYZERS[7]]).analyze(signal());
    expect(result.results[0]).toEqual({ analyzerId: "aaa-failing", analyzerVersion: "1", successful: false, complete: false, candidates: [],
      diagnostics: [{ code: "analyzer-failed", message: "The analyzer failed; its results cannot establish absence." }] });
    expect(result.results[1]).toMatchObject({ analyzerId: "orphans", successful: true, complete: true });
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("private stack");
  });

  it("rejects programmer-invalid output instead of publishing false completeness", async () => {
    const bad = custom("invalid", async () => ({ ...analyzerResult("invalid", "1", [], true), candidates: [{ title: "Not a FindingCandidate" }] } as AnalyzerResult));
    const result = await new LocalScanCoordinator(source(snapshot([])), [bad]).analyze(signal());
    expect(result.results[0]).toMatchObject({ successful: false, complete: false, candidates: [] });
  });

  it("protects the shared snapshot/graph from an analyzer that tries to mutate them", async () => {
    const mutator = custom("aaa-mutator", async (context) => {
      (context.snapshot.notes[0] as { content: string }).content = "";
      return analyzerResult("aaa-mutator", "1", [], true);
    });
    const result = await new LocalScanCoordinator(source(snapshot([note("A.md")])), [mutator, LOCAL_HEALTH_ANALYZERS[6]]).analyze(signal());
    expect(result.results[0].successful).toBe(false);
    expect(result.results[1]).toMatchObject({ successful: true, candidates: [] });
    const context = await createLocalAnalysisContext(snapshot(richNotes()), signal());
    expect(() => (context.graph.outgoing["A/Foo.md"] as string[]).push("D.md")).toThrow();
  });

  it("rejects duplicate/invalid IDs before capture", () => {
    const input = source(snapshot([]));
    expect(() => new LocalScanCoordinator(input, [LOCAL_HEALTH_ANALYZERS[0], LOCAL_HEALTH_ANALYZERS[0]])).toThrow("duplicate");
    expect(() => new LocalScanCoordinator(input, [custom("", async () => analyzerResult("", "1", [], true))])).toThrow("Invalid");
    expect(input.capture).not.toHaveBeenCalled();
  });

  it("propagates pre-abort, abort between analyzers, and an analyzer AbortError", async () => {
    const input = source(snapshot([]));
    const controller = new AbortController(); controller.abort();
    await expect(new LocalScanCoordinator(input).analyze(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(input.capture).not.toHaveBeenCalled();
    const next = new AbortController();
    const first = custom("a", async () => { next.abort(); return analyzerResult("a", "1", [], true); });
    const secondAnalyze = vi.fn(async () => analyzerResult("b", "1", [], true));
    const second = custom("b", secondAnalyze);
    await expect(new LocalScanCoordinator(input, [first, second]).analyze(next.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(secondAnalyze).not.toHaveBeenCalled();
    const aborter = custom("a", async () => { const error = new Error("Cancelled"); error.name = "AbortError"; throw error; });
    await expect(new LocalScanCoordinator(input, [aborter, second]).analyze(signal())).rejects.toMatchObject({ name: "AbortError" });
    expect(secondAnalyze).not.toHaveBeenCalled();
  });

  it("does not wait forever for a blocked source or analyzer after cancellation", async () => {
    for (const stage of ["source", "analyzer"]) {
      const controller = new AbortController();
      const blocked = new Promise<never>(() => {});
      let entered!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; });
      const input = { capture: async () => { if (stage === "source") { entered(); return blocked; } return snapshot([]); } };
      const analyzer = custom("a", async () => { entered(); return blocked; });
      const pending = new LocalScanCoordinator(input, [analyzer]).analyze(controller.signal);
      await started;
      controller.abort();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    }
  });

  it("permits real event-loop cancellation during a large duplicate grouping loop", async () => {
    const context = await createLocalAnalysisContext(snapshot(Array.from({ length: 600 }, (_, i) => note(`N${i}.md`))), signal());
    const controller = new AbortController();
    const analyzer = LOCAL_HEALTH_ANALYZERS.find((item) => item.id === "exact-duplicates")!;
    const pending = analyzer.analyze(context, controller.signal);
    setTimeout(() => controller.abort(), 0);
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("does not reinterpret an invalid snapshot as a healthy empty vault", async () => {
    const input = source(snapshot([note("A.md", { contentAvailable: true, content: undefined })]));
    await expect(new LocalScanCoordinator(input).analyze(signal())).rejects.toThrow("Invalid local vault snapshot");
  });
});
