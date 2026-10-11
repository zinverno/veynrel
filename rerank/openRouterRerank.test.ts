import { beforeAll, afterAll, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ requestUrl: vi.fn() }));
import { requestUrl } from "obsidian";
import type { RequestUrlParam } from "obsidian";
import type { RerankTransport } from "./openRouterRerank";
import { OpenRouterRerankProvider, RerankError, payloadFits, rerankBody, testRerankConnection, validateRerankResponse } from "./openRouterRerank";
import { DEFAULT_RERANK_SETTINGS, mergeRerankSettings, RERANK_LIMITS } from "./types";

beforeAll(() => vi.stubGlobal("window", {
  setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms),
  clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}));
afterAll(() => vi.unstubAllGlobals());

const settings = { ...DEFAULT_RERANK_SETTINGS, enabled: true, apiKey: "synthetic-private-key" };
const signal = () => new AbortController().signal;
const payload = (results: unknown = [{ index: 1, relevance_score: 12 }, { index: 0, relevance_score: -3 }]) => ({ model: settings.model, results });
const response = (body: unknown = payload()) => ({ status: 200, text: JSON.stringify(body) });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe("OpenRouter rerank boundary", () => {
  it("keeps upgrades disabled and keys independent", () => {
    expect(mergeRerankSettings()).toEqual(DEFAULT_RERANK_SETTINGS);
    expect(mergeRerankSettings({ enabled: "true" as never })).toEqual(DEFAULT_RERANK_SETTINGS);
    expect(mergeRerankSettings({ model: "chosen/id" })).toMatchObject({ enabled: false, apiKey: "", model: "chosen/id" });
  });
  it.each([
    [undefined, "manual"], [{ enabled: false }, "manual"], [{ enabled: true }, "automatic"],
    [{ enabled: true, triggerMode: "manual" }, "manual"], [{ enabled: false, triggerMode: "automatic" }, "automatic"],
  ] as const)("migrates the trigger without changing credentials or model: %j", (stored, triggerMode) => {
    expect(mergeRerankSettings(stored)).toMatchObject({ triggerMode });
    expect(mergeRerankSettings({ ...stored, model: "user/existing-model", apiKey: "synthetic-independent-key" }))
      .toMatchObject({ triggerMode, model: "user/existing-model", apiKey: "synthetic-independent-key" });
  });
  it("uses the dedicated endpoint and all indices, without paths or telemetry", async () => {
    const transport = vi.fn<RerankTransport>(async () => response());
    const result = await new OpenRouterRerankProvider(settings, transport).rank("query", ["alpha", "beta"], signal());
    expect(result).toEqual([{ index: 1, relevanceScore: 12 }, { index: 0, relevanceScore: -3 }]);
    expect(transport).toHaveBeenCalledOnce();
    expect(transport.mock.calls[0][0]).toEqual({ url: "https://openrouter.ai/api/v1/rerank", method: "POST",
      contentType: "application/json", headers: { Authorization: "Bearer synthetic-private-key" }, throw: false,
      body: JSON.stringify({ model: settings.model, query: "query", documents: ["alpha", "beta"], top_n: 2, provider: { allow_fallbacks: false } }) });
  });
  it.each([null, {}, [], { results: [] }, payload([]), payload([{ index: 0, relevance_score: 1 }]),
    payload([{ index: 0, relevance_score: 1 }, { index: 0, relevance_score: 2 }]),
    ...[-1, 2, 0.5, "1", null].map(index => payload([{ index: 0, relevance_score: 1 }, { index, relevance_score: 2 }])),
    ...[NaN, Infinity, "1", null].map(score => payload([{ index: 0, relevance_score: score }, { index: 1, relevance_score: 2 }])),
  ])("rejects malformed, duplicate, out of range and incomplete responses: %j", body => {
    expect(() => validateRerankResponse(body, 2)).toThrow("Rerank: invalid-response");
  });
  it("ignores provider document text and permits finite scores outside 0..1", () => {
    expect(validateRerankResponse(payload([{ index: 1, relevance_score: -9, document: { text: "<script>untrusted path</script>" } },
      { index: 0, relevance_score: 11 }]), 2)).toEqual([{ index: 1, relevanceScore: -9 }, { index: 0, relevanceScore: 11 }]);
  });
  it.each([[401, "auth"], [403, "auth"], [402, "credits"], [429, "rate-limit"], [500, "server"], [503, "server"], [404, "request"]])(
    "classifies HTTP %s without retaining bodies or retrying", async (status, code) => {
      const transport = vi.fn(async () => ({ status: Number(status), text: "synthetic-private-key query note text" }));
      const error: unknown = await new OpenRouterRerankProvider(settings, transport).rank("private query", ["private a", "private b"], signal()).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(RerankError);
      expect((error as RerankError).code).toBe(code);
      expect(String(error) + JSON.stringify(error)).not.toMatch(/private|query|note text/);
      expect(transport).toHaveBeenCalledOnce();
    });
  it.each(["", "null", "<html>private response</html>"])("rejects empty and non-JSON body %s", async text => {
    await expect(new OpenRouterRerankProvider(settings, async () => ({ status: 200, text })).rank("query", ["a", "b"], signal()))
      .rejects.toMatchObject({ code: "invalid-response" });
  });
  it("sanitizes network exceptions", async () => {
    await expect(new OpenRouterRerankProvider(settings, async () => { throw new Error("private-key, query, fragment"); })
      .rank("query", ["a", "b"], signal())).rejects.toEqual(new RerankError("network"));
  });
  it("times out once and ignores a late rejection", async () => {
    vi.useFakeTimers(); let reject!: (error: Error) => void;
    const transport = vi.fn(() => new Promise<never>((_resolve, fail) => { reject = fail; }));
    const pending = new OpenRouterRerankProvider(settings, transport).rank("query", ["a", "b"], signal());
    const checked = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(RERANK_LIMITS.timeoutMs);
    await checked; reject(new Error("late-private-error")); await Promise.resolve();
    expect(transport).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
  it("stops waiting on cancellation and rejects an already cancelled operation without HTTP", async () => {
    const cancellation = new AbortController();
    const transport = vi.fn(() => new Promise<never>(() => {}));
    const provider = new OpenRouterRerankProvider(settings, transport);
    const pending = provider.rank("query", ["a", "b"], cancellation.signal);
    await Promise.resolve(); cancellation.abort();
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    await expect(provider.rank("query", ["a", "b"], cancellation.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("enforces count, query, fragment and serialized UTF-8 limits before HTTP", async () => {
    const transport = vi.fn(async () => response());
    const provider = new OpenRouterRerankProvider(settings, transport);
    for (const [query, docs] of [["😀".repeat(2001), ["a", "b"]], ["q", ["😀".repeat(4001), "b"]],
      ["q", Array(31).fill("a")], ["q", Array(30).fill("😀".repeat(4000))], ["q", ["a"]]] as [string, string[]][]) {
      await expect(provider.rank(query, docs, signal())).rejects.toMatchObject({ code: "request" });
    }
    expect(transport).not.toHaveBeenCalled();
    expect(payloadFits(settings.model, "q", Array(30).fill("😀".repeat(4000)))).toBe(false);
    expect(new TextEncoder().encode(rerankBody(settings.model, "q", ["😀", "b"])).length).toBeGreaterThan(rerankBody(settings.model, "q", ["😀", "b"]).length);
    await provider.rank("😀".repeat(2000), ["😀".repeat(4000), "b"], signal());
    expect(transport).toHaveBeenCalledOnce();
  });
  it("tests only synthetic data, explicitly, even with rerank disabled", async () => {
    vi.mocked(requestUrl).mockResolvedValue(response() as never);
    expect(requestUrl).not.toHaveBeenCalled();
    await testRerankConnection({ ...settings, enabled: false }, signal());
    const body = JSON.parse((vi.mocked(requestUrl).mock.calls[0][0] as RequestUrlParam).body as string) as { query: string; documents: string[] };
    expect(body.query).toBe("Which fruit is yellow?");
    expect(body.documents).toEqual(["A banana is yellow.", "A bicycle has two wheels."]);
  });
});
