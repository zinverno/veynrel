import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn(), TFile: class {} }));
import { requestUrl } from "obsidian";
import { ApiRequestError, callOpenRouter } from "../api";
import cases from "../tests/fixtures/relationships.json";
import { RelationshipSession } from "./relationshipSession";
import type { RelationshipPair } from "./relationshipSession";
import { RELATIONSHIP_OPTIONS } from "./relationshipPrompt";
import { RelationshipError } from "./relationshipContract";

function fixture(name = "near_duplicates") {
  const item = cases.find(c => c.name === name)!;
  let pair: RelationshipPair = [item.a, item.b].map((content, i) => ({
    path: `${i}/Same.md`, file: {} as TFile, content, modified: 1, bytes: content.length,
  })) as unknown as RelationshipPair;
  const settings = { provider: "custom" as const, model: "test-model", apiKey: "secret-test-key", baseUrl: "https://example.test/v1", temperature: 0.3, topK: 10 };
  const listeners = new Set<() => void>();
  const deps = {
    settings: { get: () => ({ ...settings }), subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } },
    read: vi.fn(async () => pair),
    complete: vi.fn(async (_settings: typeof settings, _system: string, _user: string, _signal: AbortSignal) => JSON.stringify(item.response)),
  };
  const session = new RelationshipSession(deps);
  return { session, deps, settings, item, listeners, change: () => { pair = [{ ...pair[0], content: pair[0].content + " changed", modified: 2 }, pair[1]]; },
    replace: (a: string, b: string) => { pair = [{ ...pair[0], content: a }, { ...pair[1], content: b }]; } };
}
function deferred<T>() { let resolve!: (v: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("relationship consent and lifecycle", () => {
  it("does no reads or requests at construction; preparation is local and discloses exact payload without the key", async () => {
    const f = fixture(); expect(f.deps.read).not.toHaveBeenCalled(); await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.session.prepare(); expect(f.deps.complete).not.toHaveBeenCalled();
    const preview = f.session.view.consent!;
    expect(preview.paths).toEqual(["0/Same.md", "1/Same.md"]);
    const body = JSON.parse(preview.body) as { messages: { content: string }[] };
    expect(JSON.parse(body.messages[1].content)).toEqual({ A: f.item.a, B: f.item.b });
    expect(JSON.stringify(f.session.view)).not.toContain("secret-test-key");
    expect(preview.bytes).toBe(new TextEncoder().encode(preview.body).byteLength);
    await f.session.confirm(); expect(f.deps.complete).toHaveBeenCalledOnce(); expect(f.deps.read).toHaveBeenCalledTimes(3);
    expect(f.session.view.stage).toBe("result"); expect(f.session.view.consent).toBeUndefined();
  });
  it.each(cases)("handles fake $name analysis", async item => {
    const f = fixture(item.name); await f.session.prepare(); await f.session.confirm();
    expect(f.session.view.result?.relation).toBe(item.response.relation);
    if (item.name === "standalone_large_section") {
      expect(f.item.a.length).toBeGreaterThan(12000);
      expect(f.deps.complete.mock.calls[0][2]).toContain("A bounded queue");
    }
  });
  it("uses the existing transport and sends exactly the consent body after confirmation", async () => {
    const f = fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(f.item.response) } }] }) } as never);
    f.deps.complete.mockImplementation((settings, system, user, signal) => callOpenRouter(settings, system, user, { ...RELATIONSHIP_OPTIONS, signal }));
    await f.session.prepare(); const body = f.session.view.consent!.body; expect(requestUrl).not.toHaveBeenCalled();
    await f.session.confirm(); expect(requestUrl).toHaveBeenCalledOnce();
    expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body });
  });
  it.each([[20001, 1], [17000, 17000], [20000, 12000]])("blocks oversized whole inputs %s/%s without requests", async (a, b) => {
    const f = fixture(); f.replace((a === 20000 ? "\0" : "x").repeat(a), (a === 20000 ? "\0" : "y").repeat(b));
    await f.session.prepare(); expect(f.session.view).toEqual({ stage: "error", error: "tooLarge" });
    await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
  });
  it("invalidates changed files before send and after reply even without an event", async () => {
    const f = fixture(); await f.session.prepare(); f.change(); await f.session.confirm();
    expect(f.deps.complete).not.toHaveBeenCalled(); expect(f.session.view.stage).toBe("stale");
    const g = fixture(); await g.session.prepare();
    g.deps.complete.mockImplementation(async () => { g.change(); return JSON.stringify(g.item.response); });
    await g.session.confirm(); expect(g.session.view.stage).toBe("stale"); expect(g.session.view.result).toBeUndefined();
  });
  it.each(["prepare", "before", "after"])("withholds analysis when a selected file disappears at %s", async when => {
    const f = fixture();
    if (when !== "prepare") await f.session.prepare();
    if (when === "after") f.deps.complete.mockImplementation(async () => {
      f.deps.read.mockRejectedValueOnce(new RelationshipError("source")); return JSON.stringify(f.item.response);
    });
    else f.deps.read.mockRejectedValueOnce(new RelationshipError("source"));
    if (when === "prepare") await f.session.prepare(); else await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "source" });
    expect(f.deps.complete).toHaveBeenCalledTimes(when === "after" ? 1 : 0);
  });
  it.each(["cancel", "close", "invalidate"] as const)("%s prevents late results and repeat clicks", async action => {
    const f = fixture(), response = deferred<string>(); f.deps.complete.mockReturnValue(response.promise);
    await f.session.prepare(); const run = f.session.confirm(); await Promise.resolve(); await f.session.confirm();
    expect(f.deps.complete).toHaveBeenCalledOnce(); f.session[action]();
    expect(f.deps.complete.mock.calls[0][3].aborted).toBe(true);
    response.resolve(JSON.stringify(f.item.response)); await run;
    expect(f.session.view.result).toBeUndefined(); expect(f.deps.complete).toHaveBeenCalledOnce();
    if (action === "close") expect(f.listeners.size).toBe(0);
  });
  it("invalidates completed results on settings or source change and does not resend", async () => {
    const f = fixture(); await f.session.prepare(); await f.session.confirm();
    f.settings.model = "different"; for (const fn of f.listeners) fn();
    expect(f.session.view).toEqual({ stage: "stale" }); expect(f.deps.complete).toHaveBeenCalledOnce();
    const g = fixture(); await g.session.prepare(); await g.session.confirm(); g.session.invalidate(); expect(g.session.view.result).toBeUndefined();
  });
  it.each(["before", "during"])("rejects model changes %s send even before a settings event", async when => {
    const f = fixture(); await f.session.prepare();
    if (when === "before") f.settings.model = "changed";
    else f.deps.complete.mockImplementation(async () => { f.settings.model = "changed"; return JSON.stringify(f.item.response); });
    await f.session.confirm(); expect(f.session.view.stage).toBe("stale");
    expect(f.deps.complete).toHaveBeenCalledTimes(when === "before" ? 0 : 1);
  });
  it("cancels preparation, refuses replayed consent and requires fresh preparation after dismiss", async () => {
    const f = fixture(), read = deferred<RelationshipPair>(); f.deps.read.mockReturnValueOnce(read.promise);
    const run = f.session.prepare(); await f.session.prepare(); expect(f.deps.read).toHaveBeenCalledOnce();
    f.session.cancel(); read.resolve(await f.deps.read()); await run; await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
    await f.session.prepare(); await f.session.confirm(); f.session.dismiss(); await f.session.confirm();
    expect(f.deps.complete).toHaveBeenCalledOnce(); expect(f.session.view.stage).toBe("dismissed");
  });
  it("exposes only current successful source evidence to local planning, without retaining credentials", async () => {
    const f = fixture(); expect(f.session.analysisSource).toBeUndefined(); await f.session.prepare(); expect(f.session.analysisSource).toBeUndefined();
    await f.session.confirm(); const source = f.session.analysisSource!;
    expect(source.pair.map(note => note.content)).toEqual([f.item.a, f.item.b]); expect(source.result).toBe(f.session.view.result);
    expect(JSON.stringify(source)).not.toContain("secret-test-key");
    f.settings.model = "silently-changed"; expect(f.session.analysisSource).toBeUndefined(); expect(f.session.view.stage).toBe("stale");
    await f.session.prepare(); await f.session.confirm(); expect(f.session.analysisSource?.model).toBe("silently-changed");
    f.session.dismiss(); expect(f.session.analysisSource).toBeUndefined();
  });
  it("never retries errors or shows raw provider data, and rejects invalid evidence", async () => {
    const f = fixture(); await f.session.prepare(); f.deps.complete.mockRejectedValue(Error("secret response"));
    await f.session.confirm(); await f.session.confirm(); expect(f.deps.complete).toHaveBeenCalledOnce();
    expect(f.session.view).toEqual({ stage: "error", error: "transport" });
    await f.session.prepare(); f.deps.complete.mockResolvedValue("invalid JSON"); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "invalidResponse" });
    await f.session.prepare(); const bad = structuredClone(f.item.response); bad.claims[0].quoteA = "made up";
    f.deps.complete.mockResolvedValue(JSON.stringify(bad)); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "unverifiedEvidence" });
  });
  it.each(["https://secret:password@example.test/v1", "https://example.test/v1?key=secret", "file:///private"])("refuses unsafe destination disclosure %s", async baseUrl => {
    const f = fixture(); f.settings.baseUrl = baseUrl; await f.session.prepare();
    expect(f.session.view).toEqual({ stage: "error", error: "configuration" }); expect(f.deps.read).not.toHaveBeenCalled();
  });
});

describe("Relationship Analyzer transport diagnostics", () => {
  it("accepts a complete response at 38.6 seconds with the call-specific limit, once", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    const f = fixture(), pending = deferred<never>();
    vi.mocked(requestUrl).mockReturnValueOnce(pending.promise as never);
    f.deps.complete.mockImplementation((settings, system, user, signal) => callOpenRouter(settings, system, user, { ...RELATIONSHIP_OPTIONS, signal }));
    await f.session.prepare(); const run = f.session.confirm();
    await vi.advanceTimersByTimeAsync(38_600);
    expect(f.session.view.stage).toBe("running");
    pending.resolve({ status: 200, text: JSON.stringify({ choices: [{ message: { content: JSON.stringify(f.item.response) } }] }) } as never);
    await run; expect(f.session.view.stage).toBe("result"); expect(requestUrl).toHaveBeenCalledOnce();
  });
  it("stops at 120 seconds, suppresses late results, and never reuses consent", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    const f = fixture(), pending = deferred<never>();
    vi.mocked(requestUrl).mockReturnValueOnce(pending.promise as never);
    f.deps.complete.mockImplementation((settings, system, user, signal) => callOpenRouter(settings, system, user, { ...RELATIONSHIP_OPTIONS, signal }));
    await f.session.prepare(); const run = f.session.confirm();
    await vi.advanceTimersByTimeAsync(119_999); expect(f.session.view.stage).toBe("running");
    await vi.advanceTimersByTimeAsync(1); await run;
    expect(f.session.view).toEqual({ stage: "error", error: "timeout" });
    pending.resolve({ status: 200, text: "private late response" } as never);
    await Promise.resolve(); await f.session.confirm();
    expect(f.session.view.result).toBeUndefined(); expect(requestUrl).toHaveBeenCalledOnce();
  });
  it.each(["network", "http", "provider", "emptyResponse", "invalidEnvelope"] as const)("exposes safe %s diagnostics only", async reason => {
    const f = fixture(); await f.session.prepare();
    f.deps.complete.mockRejectedValue(new ApiRequestError(reason, "Bearer private-token and provider personal data", reason === "http" ? 503 : undefined));
    await f.session.confirm(); await f.session.confirm();
    expect(f.session.view.error).toBe(reason); expect(f.deps.complete).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.session.view)).not.toMatch(/private|personal|Bearer/);
    expect(f.session.view.httpStatus).toBe(reason === "http" ? 503 : undefined);
  });
});
