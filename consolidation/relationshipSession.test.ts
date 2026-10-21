import { relationshipWireFixture, relationshipFixtureUser } from "../tests/relationshipWireFixture";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TFile } from "obsidian";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn(), TFile: class {} }));
import { requestUrl } from "obsidian";
import { ApiRequestError, callOpenRouter } from "../api";
import cases from "../tests/fixtures/relationships.json";
import { RelationshipSession } from "./relationshipSession";
import type { RelationshipPair } from "./relationshipSession";
import { relationshipOptions } from "./relationshipPrompt";
import type { CallOptions } from "../api";
import type { LanguageModelSettingsSnapshot } from "../deep/product/languageModelSettingsPort";
import { RelationshipError } from "./relationshipContract";

function fixture(name = "near_duplicates") {
  const item = cases.find(c => c.name === name)!;
  let pair: RelationshipPair = [item.a, item.b].map((content, i) => ({
    path: `${i}/Same.md`, file: {} as TFile, content, modified: 1, bytes: content.length,
  })) as unknown as RelationshipPair;
  const settings: LanguageModelSettingsSnapshot = { provider: "custom", model: "test-model", apiKey: "secret-test-key", baseUrl: "https://example.test/v1", temperature: 0.3, topK: 10 };
  const listeners = new Set<() => void>();
  const deps = {
    settings: { get: () => ({ ...settings }), subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } },
    read: vi.fn(async () => pair),
    complete: vi.fn(async (_settings: typeof settings, _system: string, _user: string, _signal: AbortSignal, _options: Readonly<CallOptions>) => JSON.stringify(relationshipWireFixture(item.response, _user))),
  };
  const session = new RelationshipSession(deps);
  return { session, deps, settings, item, listeners, change: () => { pair = [{ ...pair[0], content: pair[0].content + " changed", modified: 2 }, pair[1]]; },
    replace: (a: string, b: string) => { pair = [{ ...pair[0], content: a }, { ...pair[1], content: b }]; } };
}
function wire(f: ReturnType<typeof fixture>, response = f.item.response): string {
  const consent = f.session.view.consent;
  const user = consent ? relationshipFixtureUser(consent.body) : f.deps.complete.mock.calls.at(-1)![2];
  return JSON.stringify(relationshipWireFixture(response, user));
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
    expect(JSON.parse(body.messages[1].content)).toMatchObject({ A: f.item.a, B: f.item.b });
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
    const f = fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout }); await f.session.prepare();
    vi.mocked(requestUrl).mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: wire(f) } }] }) } as never);
    f.deps.complete.mockImplementation((settings, system, user, signal, options) => callOpenRouter(settings, system, user, { ...options, signal }));
    const body = f.session.view.consent!.body; expect(requestUrl).not.toHaveBeenCalled();
    await f.session.confirm(); expect(requestUrl).toHaveBeenCalledOnce();
    expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body });
  });
  it.each([[20001, 1], [17000, 17000], [20000, 12000]])("blocks oversized whole inputs %s/%s without requests", async (a, b) => {
    const f = fixture(); f.replace((a === 20000 ? "\0" : "x").repeat(a), (a === 20000 ? "\0" : "y").repeat(b));
    await f.session.prepare(); expect(f.session.view).toEqual({ stage: "error", error: "tooLarge" });
    await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
  });
  it("counts catalogue growth before consent, without truncating complete inputs", async () => {
    const f = fixture();
    const a = Array.from({ length: 16000 }, (_, i) => String.fromCharCode(0x4e00 + i)).join("");
    f.replace(a, a); await f.session.prepare();
    expect(f.session.view).toEqual({ stage: "error", error: "tooLarge" });
    expect(f.session.view.consent).toBeUndefined(); await f.session.confirm(); expect(f.deps.complete).not.toHaveBeenCalled();
  });
  it("cannot reuse a previous catalogue even for unchanged source text", async () => {
    const f = fixture(); await f.session.prepare(); const oldWire = wire(f); f.session.cancel();
    await f.session.prepare(); f.deps.complete.mockResolvedValue(oldWire); await f.session.confirm();
    expect(f.session.view.error).toBe("unverifiedEvidence"); expect(f.session.view.diagnostics?.every(d => d.code === "reference_unknown")).toBe(true);
    expect(f.session.analysisSource).toBeUndefined(); expect(f.deps.complete).toHaveBeenCalledOnce();
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
      f.deps.read.mockRejectedValueOnce(new RelationshipError("source")); return wire(f);
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
    response.resolve(wire(f)); await run;
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
    else f.deps.complete.mockImplementation(async () => { f.settings.model = "changed"; return wire(f); });
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
    const badWire = relationshipWireFixture(f.item.response, relationshipFixtureUser(f.session.view.consent!.body)); badWire.claims[0].evidenceA = "unknown";
    f.deps.complete.mockResolvedValue(JSON.stringify(badWire)); await f.session.confirm();
    expect(f.session.view).toMatchObject({ stage: "error", error: "unverifiedEvidence", diagnostics: [{ field: "claims[0].evidenceA", code: "reference_unknown" }] });
  });
  it.each(["https://secret:password@example.test/v1", "https://example.test/v1?key=secret", "file:///private"])("refuses unsafe destination disclosure %s", async baseUrl => {
    const f = fixture(); f.settings.baseUrl = baseUrl; await f.session.prepare();
    expect(f.session.view).toEqual({ stage: "error", error: "configuration" }); expect(f.deps.read).not.toHaveBeenCalled();
  });
});

describe("Relationship Analyzer transport diagnostics", () => {
  function transport() {
    const f = fixture(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    f.settings.provider = "openrouter"; f.settings.model = "deepseek/deepseek-v4-flash-0731";
    f.deps.complete.mockImplementation((settings, system, user, signal, options) => callOpenRouter(settings, system, user, { ...options, signal }));
    const reply = (payload: unknown) => vi.mocked(requestUrl).mockResolvedValueOnce({ status: 200, text: JSON.stringify(payload) } as never);
    return { ...f, reply };
  }
  it.each(["explanation", "recommendation", "alternative"] as const)("rejects catalogue IDs in %s claim references through the transport parser", async field => {
    const f = transport(); await f.session.prepare();
    const consent = f.session.view.consent!.body;
    const response = relationshipWireFixture(f.item.response, relationshipFixtureUser(consent));
    const fragment = response.claims[0].evidenceA!;
    if (field === "alternative") Object.assign(response, { alternatives: [{ action: "manual_review", reason: "Synthetic review", evidence: [fragment] }] });
    else response[field].evidence = [fragment];
    const content = JSON.stringify(response);
    f.reply({ choices: [{ finish_reason: "stop", message: { content } }] });
    await f.session.confirm(); await f.session.confirm();
    expect(f.session.view).toMatchObject({ stage: "error", error: "invalidResponse" });
    expect(f.session.view.diagnostics).toContainEqual({ field: `${field === "alternative" ? "alternatives[0]" : field}.evidence`, code: "evidence_unknown" });
    expect(f.session.analysisSource).toBeUndefined(); expect(requestUrl).toHaveBeenCalledOnce();
    expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body: consent });
    expect(JSON.stringify(response)).toBe(content);
  });
  it("accepts separately generated claim references without translating fragment IDs into claims", async () => {
    const f = transport(); await f.session.prepare();
    const content = wire(f), consent = f.session.view.consent!.body;
    f.reply({ choices: [{ finish_reason: "stop", message: { content } }] });
    await f.session.confirm();
    expect(f.session.view.stage).toBe("result");
    expect(f.session.view.result?.explanation.evidence).toEqual(f.item.response.explanation.evidence);
    expect(requestUrl).toHaveBeenCalledOnce();
    expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body: consent });
  });
  it.each([null, "", undefined, '{"relation":', "valid"])("length %s never becomes evidence or a retry", async content => {
    const f = transport(); await f.session.prepare();
    f.reply({ choices: [{ finish_reason: "length", message: { content: content === "valid" ? wire(f) : content,
      reasoning: wire(f), reasoning_content: "private", reasoning_details: [{ text: "private" }] } }],
      usage: { completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 4000 } } });
    await Promise.all([f.session.confirm(), f.session.confirm()]); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "outputLimit" });
    expect(f.session.analysisSource).toBeUndefined(); expect(requestUrl).toHaveBeenCalledOnce();
    expect(JSON.stringify(f.session.view)).not.toMatch(/private|reasoning|4000/);
  });
  it.each([undefined, null, {}, { completion_tokens: -1 }, { completion_tokens: "4000" },
    { completion_tokens: 4000, completion_tokens_details: { reasoning_tokens: 5000 } }, { completion_tokens: Number.POSITIVE_INFINITY }])("does not infer counts from unknown/invalid usage %j", async usage => {
    const f = transport(); f.reply({ choices: [{ finish_reason: "length", message: { content: null } }], usage });
    await f.session.prepare(); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "outputLimit" });
  });
  it.each([null, "", " \n"])("stop with %s and reasoning is empty, never recovered", async content => {
    const f = transport(); await f.session.prepare(); f.reply({ choices: [{ finish_reason: "stop", message: { content, reasoning: wire(f) } }] });
    await f.session.prepare(); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "emptyResponse" });
  });
  it.each([undefined, null, "invented", "tool_calls"])("rejects missing/unexpected completion %s", async finish_reason => {
    const f = transport(); await f.session.prepare(); f.reply({ choices: [{ finish_reason, message: { content: wire(f) } }] });
    await f.session.prepare(); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error: "unexpectedCompletion" });
  });
  it.each([
    [{}, "invalidEnvelope"], [{ choices: [] }, "invalidEnvelope"], [{ choices: "private" }, "invalidEnvelope"],
    [{ choices: [{ finish_reason: "length", message: null }] }, "invalidEnvelope"],
    [{ choices: [{ finish_reason: "stop", message: {} }] }, "invalidEnvelope"],
    [{ choices: [{ finish_reason: 42, message: { content: "private" } }] }, "invalidEnvelope"],
    [{ error: { code: 503, message: "private", metadata: { key: "private" } } }, "provider"],
    [{ choices: [{ finish_reason: "error", error: { message: "private" }, message: {} }] }, "provider"],
    [{ choices: [{ finish_reason: "content_filter", message: { content: null } }] }, "refused"],
    [{ choices: [{ finish_reason: "stop", message: { content: "text", refusal: "private" } }] }, "refused"],
    [{ choices: [{ finish_reason: "stop", message: { content: "text", tool_calls: [{ id: "private" }] } }] }, "unexpectedCompletion"],
  ])("safe envelope failure %#", async (payload, error) => {
    const f = transport(); f.reply(payload); await f.session.prepare(); await f.session.confirm(); await f.session.confirm();
    expect(f.session.view).toEqual({ stage: "error", error }); expect(f.session.analysisSource).toBeUndefined();
    expect(requestUrl).toHaveBeenCalledOnce(); expect(JSON.stringify(f.session.view)).not.toContain("private");
  });
  it.each(["valid", "JSON", "reference", "evidence"])("stop still uses the strict %s contract", async variant => {
    const f = transport(); await f.session.prepare();
    const response = relationshipWireFixture(f.item.response, relationshipFixtureUser(f.session.view.consent!.body));
    if (variant === "reference") response.claims[0].evidenceA = "invented-reference";
    if (variant === "evidence") response.recommendation.evidence = ["unknown"];
    f.reply({ choices: [{ finish_reason: "stop", message: { content: variant === "JSON" ? "{broken" : JSON.stringify(response) } }] });
    await f.session.confirm();
    if (variant === "valid") expect(f.session.view.result).toEqual(f.item.response);
    else { expect(f.session.view.error).toBe(variant === "JSON" ? "invalidResponse" : "unverifiedEvidence"); expect(f.session.analysisSource).toBeUndefined(); }
    expect(requestUrl).toHaveBeenCalledOnce();
  });
  it.each(["deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-flash-20260731", "other-model"])("freezes %s policy and sends the byte-identical consent body", async model => {
    const f = transport(); f.settings.model = model; await f.session.prepare();
    f.reply({ choices: [{ finish_reason: "stop", message: { content: wire(f) } }] });
    const consent = f.session.view.consent!;
    expect(JSON.parse(consent.body)).toMatchObject({ model, max_tokens: 8192, reasoning: model === "other-model" ? { effort: "low" } : { enabled: false } });
    expect(consent.maxTokens).toBe(8192); expect(requestUrl).not.toHaveBeenCalled();
    await f.session.confirm(); expect(vi.mocked(requestUrl).mock.calls[0][0]).toMatchObject({ body: consent.body });
    expect(Object.isFrozen(f.deps.complete.mock.calls[0][4])).toBe(true);
    expect(Object.isFrozen(f.deps.complete.mock.calls[0][4].reasoning)).toBe(true);
    expect(f.session.view.stage).toBe("result");
  });
  it("requires new consent when model changes the reasoning policy", async () => {
    const f = transport(); await f.session.prepare(); const first = f.session.view.consent!;
    f.settings.model = "other-model"; await f.session.confirm(); expect(f.session.view.stage).toBe("stale");
    expect(requestUrl).not.toHaveBeenCalled(); await f.session.prepare();
    expect(f.session.view.consent!.body).not.toBe(first.body); expect(f.session.view.consent!.reasoning).toBe("low");
  });
  it.each(["custom", "ollama", "openai", "groq"] as const)("never applies OpenRouter reasoning fields to %s", provider => {
    const f = transport(); f.settings.provider = provider;
    expect(relationshipOptions(f.settings)).toEqual({ maxTokens: 8192, temperature: 0, timeoutMs: 120_000, requireFinishReason: true });
  });
  it("accepts a complete response at 38.6 seconds with the call-specific limit, once", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    const f = fixture(), pending = deferred<never>();
    vi.mocked(requestUrl).mockReturnValueOnce(pending.promise as never);
    f.deps.complete.mockImplementation((settings, system, user, signal, options) => callOpenRouter(settings, system, user, { ...options, signal }));
    await f.session.prepare(); const run = f.session.confirm();
    await vi.advanceTimersByTimeAsync(38_600);
    expect(f.session.view.stage).toBe("running");
    pending.resolve({ status: 200, text: JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: wire(f) } }] }) } as never);
    await run; expect(f.session.view.stage).toBe("result"); expect(requestUrl).toHaveBeenCalledOnce();
  });
  it("stops at 120 seconds, suppresses late results, and never reuses consent", async () => {
    vi.useFakeTimers(); vi.stubGlobal("window", { setTimeout, clearTimeout });
    const f = fixture(), pending = deferred<never>();
    vi.mocked(requestUrl).mockReturnValueOnce(pending.promise as never);
    f.deps.complete.mockImplementation((settings, system, user, signal, options) => callOpenRouter(settings, system, user, { ...options, signal }));
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
