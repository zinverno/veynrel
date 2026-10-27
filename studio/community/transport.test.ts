import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COMMUNITY_INDEX } from "./schema";
import { communityTransport } from "./transport";

beforeEach(() => vi.stubGlobal("window", { setTimeout, clearTimeout }));
afterEach(() => vi.unstubAllGlobals());
function response(body: string, options: ResponseInit = {}, url = COMMUNITY_INDEX): Response {
  const r = new Response(body, { headers: { "content-type": "application/json" }, ...options }); Object.defineProperty(r, "url", { value: url }); return r;
}
describe("fixed-origin redirect-denying streaming transport", () => {
  it("uses credential-free bodyless GET and refuses every redirect before following", async () => {
    const fetch = vi.fn().mockResolvedValue(response("{}")); vi.stubGlobal("fetch", fetch);
    expect(await communityTransport.get(COMMUNITY_INDEX, 10)).toBe("{}");
    expect(fetch).toHaveBeenCalledWith(COMMUNITY_INDEX, expect.objectContaining({ method: "GET", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", cache: "no-store" }));
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("body");
    await expect(communityTransport.get("http://127.0.0.1", 10)).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([301, 302, 303, 307, 308, 404, 500])("rejects response status %s without another request", async status => {
    const fetch = vi.fn().mockResolvedValue(response("{}", { status, headers: { location: "http://127.0.0.1" } })); vi.stubGlobal("fetch", fetch);
    await expect(communityTransport.get(COMMUNITY_INDEX, 10)).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
    expect((fetch.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
  });
  it("rejects unexpected final URL, redirected flag, bad MIME, byte overflow and unavailable servers", async () => {
    const redirected = response("{}"); Object.defineProperty(redirected, "redirected", { value: true });
    for (const r of [response("{}", {}, "https://other.example"), redirected, response("{}", { headers: { "content-type": "text/html" } }), response("{}", { headers: { "content-type": "application/json", "content-length": "999999" } }), response("я".repeat(6))]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r)); await expect(communityTransport.get(COMMUNITY_INDEX, 10)).rejects.toThrow();
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline"))); await expect(communityTransport.get(COMMUNITY_INDEX, 10)).rejects.toThrow("offline");
  });
  it("caps chunked bodies before retaining all bytes", async () => {
    let cancelled = false; const r = new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } }), { headers: { "content-type": "application/json" } });
    Object.defineProperty(r, "url", { value: COMMUNITY_INDEX }); vi.stubGlobal("fetch", vi.fn().mockResolvedValue(r));
    await expect(communityTransport.get(COMMUNITY_INDEX, 10)).rejects.toThrow("size"); expect(cancelled).toBe(true);
  });
  it("aborts a stalled request at the bounded deadline without retry", async () => {
    let expire!: () => void;
    vi.stubGlobal("window", { setTimeout: (callback: () => void, ms: number) => { expect(ms).toBe(15_000); expire = callback; return 1; }, clearTimeout: vi.fn() });
    const fetch = vi.fn((_url: string, options: RequestInit) => new Promise<Response>((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("timeout", "AbortError")))));
    vi.stubGlobal("fetch", fetch); const request = communityTransport.get(COMMUNITY_INDEX, 10); expire();
    await expect(request).rejects.toThrow("offline"); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
