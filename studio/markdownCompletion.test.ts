import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { RequestUrlParam, RequestUrlResponse } from "obsidian";
const transport = vi.hoisted(() => vi.fn<(r: RequestUrlParam) => Promise<RequestUrlResponse>>());
vi.mock("obsidian", async () => {
  const yaml = await vi.importActual<{ load(s: string): unknown }>("js-yaml");
  return { TFile: class {}, getLanguage: () => "en", requestUrl: transport, parseYaml: (s: string) => yaml.load(s) };
});
import { TFile } from "obsidian";
import { buildChatBody, callOpenRouter, callStudioMarkdown } from "../api";
import { BUILTIN_RECIPES } from "./builtins";
import { RecipeRunner } from "./runner";
import { StudioApply } from "./apply";
import { StudioJournal } from "./journal";
import { StudioStorage } from "./storage";
import { testAdapter } from "./testAdapter";
import type { StudioNotePort, StudioSource } from "./ports";
import late from "./evaluation/fixtures/late-markdown.json";

const settings = { provider: "ollama" as const, model: "synthetic", baseUrl: "http://127.0.0.1:1234/v1", apiKey: "", temperature: .2, topK: 5 };
const envelope = (content: string | null = "# Complete\nSaved facts.", finish_reason: string | null = "stop", extra = {}) => ({ choices: [{ message: { content, ...extra }, finish_reason }] });
const http = (body: unknown, status = 200) => ({ status, text: typeof body === "string" ? body : JSON.stringify(body), headers: {}, json: null, arrayBuffer: new ArrayBuffer(0) });
function fixture(raw = "---\nid: stable\n---\nSaved facts.", count = 1) {
  const disk = testAdapter();
  const sources: StudioSource[] = Array.from({ length: count }, (_, i) => ({ path: `Source${i}.md`, file: new TFile(), content: raw, bytes: new TextEncoder().encode(raw).length, created: 1, modified: 2 }));
  const notes = { read: vi.fn(async path => ({ ...sources.find(s => s.path === path)! })), readGuard: vi.fn(), writeGuard: vi.fn(), process: vi.fn() } satisfies StudioNotePort;
  const storage = new StudioStorage(disk.adapter, ".obsidian", "ai-knowledge-hub"), journal = new StudioJournal(storage), writer = new StudioApply(journal, notes);
  const runner = new RecipeRunner({ notes, inventory: () => sources.map(s => s.path), complete: callStudioMarkdown, settings: { get: () => settings, update: async s => s, subscribe: () => () => {} } }, writer);
  const prepare = (index = 0) => runner.prepare(BUILTIN_RECIPES[index], BUILTIN_RECIPES[index].parameters, { paths: sources.map(s => s.path) }, 32768);
  return { disk, sources, notes, storage, journal, writer, runner, prepare };
}
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout }); transport.mockReset(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Studio-only Markdown completion and deadline", () => {
  it.each([20_000, 66_000, 89_999])("keeps the exact complete result at %i ms and the consent body", async delay => {
    const f = fixture(), p = await f.prepare();
    expect(p.requests[0].options.timeoutMs).toBe(90_000);
    const { timeoutMs: _timeout, ...oldOptions } = p.requests[0].options;
    expect(p.requests[0].body).toBe(JSON.stringify(buildChatBody(settings, p.requests[0].system, p.requests[0].user, oldOptions)));
    transport.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(http(envelope())), delay)));
    const pending = f.runner.generate(p); await vi.advanceTimersByTimeAsync(delay - 1);
    expect(f.runner.review).toBeUndefined(); expect(f.writer.operations.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(1); const review = await pending;
    expect(review.rows[0]).toMatchObject({ status: "generated", rawResponse: "# Complete\nSaved facts.", after: "---\nid: stable\n---\n# Complete\nSaved facts." });
    expect(transport).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ body: p.requests[0].body }));
    expect(f.notes.process).not.toHaveBeenCalled(); expect(f.writer.operations.busy).toBe(false);
  });
  it.each(["resolve", "reject"])("expires at exactly 90 seconds and observes late %s after a new run", async outcome => {
    const f = fixture(); let resolve!: (r: ReturnType<typeof http>) => void, reject!: (e: Error) => void;
    transport.mockImplementationOnce(() => new Promise((a, b) => { resolve = a; reject = b; }));
    const pending = f.runner.generate(await f.prepare()); await vi.advanceTimersByTimeAsync(89_999);
    expect(f.runner.running).toBe(true); expect(f.runner.review).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1); const failed = await pending;
    expect(failed.rows[0]).toMatchObject({ status: "failed", reason: "timeout", after: null });
    expect(f.writer.operations.busy).toBe(false);
    transport.mockResolvedValueOnce(http(envelope("New result")));
    const next = await f.runner.generate(await f.prepare());
    if (outcome === "resolve") resolve(http(envelope("Late ignored", "length"))); else reject(Error("Late ignored"));
    await vi.advanceTimersByTimeAsync(1); expect(f.runner.review).toBe(next);
    expect(next.rows[0].rawResponse).toBe("New result"); expect(failed.rows[0].rawResponse).toBeUndefined(); expect(f.notes.process).not.toHaveBeenCalled();
  });
  it.each(["cancel", "dispose"] as const)("%s stops waiting immediately and releases the shared operation", async action => {
    const f = fixture("Saved facts", 2); let reject!: (e: Error) => void;
    transport.mockImplementationOnce(() => new Promise((_a, b) => { reject = b; }));
    const pending = f.runner.generate(await f.prepare()); await vi.advanceTimersByTimeAsync(1_000);
    f.runner[action](); await vi.advanceTimersByTimeAsync(0); const r = await pending;
    expect(r.rows.map(x => x.status)).toEqual(["cancelled", "cancelled"]); expect(f.writer.operations.busy).toBe(false);
    expect(f.runner.canApply).toBe(false); expect(transport).toHaveBeenCalledTimes(1);
    reject(Error("Late rejection")); await vi.advanceTimersByTimeAsync(100_000);
    expect(f.runner.review).toBe(r); expect(f.notes.process).not.toHaveBeenCalled();
  });
  it("retains length as incomplete at 33 seconds, never constructs a writable document, and persists the status only", async () => {
    const f = fixture(); const raw = '<script>bad()</script> ![](https://invalid.test/image)\n# Fragment';
    transport.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(http(envelope(raw, "length", { reasoning: "MUST_NOT_SURFACE" }))), 33_000)));
    const pending = f.runner.generate(await f.prepare()); await vi.advanceTimersByTimeAsync(33_000); const r = await pending;
    expect(r.rows[0]).toMatchObject({ status: "incomplete", rawResponse: raw, after: null });
    expect(r.rows[0].document).toBeUndefined(); expect(r.rows[0].checks).toBeUndefined(); expect(Object.isFrozen(r.rows[0])).toBe(true);
    expect(f.runner.state).toBe("incomplete"); expect(f.runner.canApply).toBe(false);
    for (const destination of ["source", "new-note"] as const) {
      await expect(f.runner.reviewWrite(r, destination, [{ path: r.rows[0].path, target: r.rows[0].path }])).rejects.toThrow();
      expect(() => f.runner.previewOutput(r.rows[0], destination, "Other.md")).toThrow();
    }
    await expect(f.writer.apply(r, f.sources, [r.rows[0].path], () => true)).rejects.toThrow();
    const history = await new StudioJournal(f.storage).runs();
    expect(history[0]).toMatchObject({ state: "incomplete", damaged: false }); expect(await f.journal.entries()).toEqual([]);
    expect(JSON.stringify([...f.disk.files.values()])).not.toContain(raw); expect(transport).toHaveBeenCalledTimes(1); expect(f.notes.process).not.toHaveBeenCalled();
  });
  it("does not lose an earlier incomplete status when a later batch request is cancelled", async () => {
    const f = fixture("Saved facts", 2);
    transport.mockResolvedValueOnce(http(envelope("Fragment", "length"))).mockImplementationOnce(() => new Promise(() => {}));
    const pending = f.runner.generate(await f.prepare()); await vi.advanceTimersByTimeAsync(1000);
    expect(transport).toHaveBeenCalledTimes(2); f.runner.cancel(); await vi.advanceTimersByTimeAsync(0);
    expect((await pending).rows.map(r => r.status)).toEqual(["incomplete", "cancelled"]);
    expect((await new StudioJournal(f.storage).runs())[0].state).toBe("incomplete");
  });
  it.each([
    ["empty", envelope("", "length")], ["blank", envelope("  ", "length")], ["null", envelope(null, "length")],
    ["oversized", envelope("x".repeat(48_001), "length")], ["control", envelope("bad\0", "length")],
    ["refusal priority", envelope("fragment", "length", { refusal: "no" })],
    ["tool priority", envelope("fragment", "length", { tool_calls: [{}] })], ["function call", envelope("fragment", "length", { function_call: {} })],
    ["provider priority", { ...envelope("fragment", "length"), error: { code: 400 } }],
    ["choice error", { choices: [{ ...envelope("fragment", "length").choices[0], error: {} }] }],
    ["invalid tools", envelope("fragment", "length", { tool_calls: {} })], ["invalid refusal", envelope("fragment", "length", { refusal: true })],
    ["filtered", envelope("fragment", "content_filter")], ["missing reason", envelope("fragment", null)], ["unknown reason", envelope("fragment", "unknown")],
    ["invalid JSON", "{"], ["invalid envelope", { choices: [{ message: "bad", finish_reason: "length" }] }],
    ["reasoning only", { choices: [{ message: { reasoning: "hidden" }, finish_reason: "length" }] }],
  ])("rejects %s without exposing diagnostic text", async (_name, body) => {
    const f = fixture(); transport.mockResolvedValueOnce(http(body)); const r = await f.runner.generate(await f.prepare());
    expect(r.rows[0]).toMatchObject({ status: "failed", after: null }); expect(r.rows[0].rawResponse).toBeUndefined();
    expect(f.runner.canApply).toBe(false); expect(transport).toHaveBeenCalledTimes(1);
  });
  it("keeps ordinary callers on 30 seconds and rejects length, including structured diagram output", async () => {
    transport.mockImplementationOnce(() => new Promise(() => {}));
    const pending = expect(callOpenRouter(settings, "system", "user")).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(30_000); await pending;
    transport.mockResolvedValue(http(envelope('{"nodes":[]', "length")));
    await expect(callOpenRouter(settings, "system", "user", { requireFinishReason: true })).rejects.toMatchObject({ reason: "outputLimit" });
    expect(transport).toHaveBeenCalledTimes(2);
  });
});

describe("historical Qwen local replay; reconstructed envelopes, no new inference", () => {
  it.each(late.cases)("$id at $delayMs ms", async c => {
    expect(createHash("sha256").update(c.content).digest("hex")).toBe(c.sha256);
    const f = fixture(c.source);
    transport.mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(http(envelope(c.content, c.finishReason))), c.delayMs)));
    const pending = f.runner.generate(await f.prepare(c.recipeIndex)); await vi.advanceTimersByTimeAsync(Math.ceil(c.delayMs)); const r = await pending;
    expect(r.rows[0].rawResponse).toBe(c.content);
    expect(r.rows[0].status).toBe(c.finishReason === "stop" ? "generated" : "incomplete");
    expect(r.rows[0].after === null).toBe(c.finishReason === "length");
    expect(transport).toHaveBeenCalledTimes(1); expect(f.notes.process).not.toHaveBeenCalled();
  });
});
