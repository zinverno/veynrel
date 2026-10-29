import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn() }));
import { requestUrl } from "obsidian";
import { buildChatBody, callOpenRouter, readOpenRouterEndpoints } from "../../api";
import { DiagramCapabilities } from "./capabilities";
import { DIAGRAM_SCHEMA } from "./spec";

const settings = { provider: "openrouter" as const, baseUrl: "https://openrouter.ai/api/v1", model: "example/model", apiKey: "synthetic-only", temperature: 0.65, topK: 5 };
const parameters = ["structured_outputs", "response_format", "max_tokens", "temperature", "repetition_penalty", "frequency_penalty", "reasoning"];
const row = (tag = "example/region") => ({ tag, supported_parameters: [...parameters] });
const payload = (endpoints: unknown[] = [row()], id = settings.model) => ({ data: { id, endpoints } });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("explicit endpoint preflight", () => {
  it("is lazy and sends only a credential-free metadata GET, even if passed a full settings object", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const request = vi.mocked(requestUrl).mockReset().mockResolvedValue({ status: 200, text: JSON.stringify(payload()) } as never);
    const capabilities = new DiagramCapabilities(); expect(request).not.toHaveBeenCalled();
    expect((await capabilities.resolve(settings)).endpoint).toBe("example/region");
    expect(request).toHaveBeenCalledExactlyOnceWith({ url: "https://openrouter.ai/api/v1/models/example/model/endpoints", method: "GET", throw: false });
    expect(JSON.stringify(request.mock.calls)).not.toContain(settings.apiKey);
  });
  it.each(["ollama", "openai", "groq", "custom"] as const)("rejects unverified %s without reading metadata", async provider => {
    const read = vi.fn(); await expect(new DiagramCapabilities(read).resolve({ ...settings, provider })).rejects.toThrow("capabilities"); expect(read).not.toHaveBeenCalled();
  });
  it("does not send public metadata to a custom URL or an invalid model path", async () => {
    const request = vi.mocked(requestUrl).mockReset();
    for (const change of [{ baseUrl: "https://untrusted.invalid/v1" }, { model: "../private?key=secret" }]) {
      await expect(readOpenRouterEndpoints({ ...settings, ...change })).rejects.toThrow();
    }
    expect(request).not.toHaveBeenCalled();
  });
  it.each(parameters)("requires endpoint-specific %s support", async missing => {
    const read = vi.fn(async () => payload([{ ...row(), supported_parameters: parameters.filter(p => p !== missing) }]));
    await expect(new DiagramCapabilities(read).resolve(settings)).rejects.toThrow("capabilities"); expect(read).toHaveBeenCalledOnce();
  });
  it.each([{}, payload([], "other/model"), payload([{ tag: "example/region" }]), payload([{ ...row(), service_tier: "priority" }]), payload(Array(257).fill(row()))])("fails closed on incomplete or incompatible metadata", async value => {
    await expect(new DiagramCapabilities(async () => value).resolve(settings)).rejects.toThrow("capabilities");
  });
  it("does not choose a prefix that would include an unsupported variant or region", async () => {
    const read = vi.fn(async () => payload([row("example"), row("example/region"), { ...row("example/unverified"), supported_parameters: ["response_format"] }]));
    expect((await new DiagramCapabilities(read).resolve(settings)).endpoint).toBe("example/region");
  });
  it("bounds cache size and lifetime, keys by model, and never retries failed reads", async () => {
    vi.useFakeTimers(); const read = vi.fn(async (s: { model: string }) => payload([row()], s.model));
    const c = new DiagramCapabilities(read), first = await c.resolve(settings);
    expect(Object.isFrozen(first)).toBe(true); expect(await c.resolve(settings)).toBe(first); expect(read).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(300_000); await c.resolve(settings); expect(read).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 8; i++) await c.resolve({ ...settings, model: `example/m${i}` });
    await c.resolve(settings); expect(read).toHaveBeenCalledTimes(11);
    const fail = vi.fn(async () => { throw Error("private-body"); });
    await expect(new DiagramCapabilities(fail).resolve(settings)).rejects.toThrow(/^capabilities$/); expect(fail).toHaveBeenCalledOnce();
  });
});

describe("opt-in transport shape", () => {
  const options = { maxTokens: 8192, requireFinishReason: true, reasoning: { enabled: false as const }, structuredOutput: { name: "diagram_spec_v1", schema: DIAGRAM_SCHEMA, endpoint: "example/region" } };
  it("sends exactly the displayed JSON Schema and route through the existing buffered transport", async () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const request = vi.mocked(requestUrl).mockReset().mockResolvedValue({ status: 200, text: JSON.stringify({ choices: [{ message: { content: "{}" }, finish_reason: "stop" }] }) } as never);
    const preview = JSON.stringify(buildChatBody(settings, "system", "user", options));
    await callOpenRouter(settings, "system", "user", options);
    expect(request).toHaveBeenCalledOnce(); expect(request.mock.calls[0][0]).toMatchObject({ body: preview });
    expect(JSON.parse(preview)).toMatchObject({ response_format: { type: "json_schema", json_schema: { strict: true, schema: DIAGRAM_SCHEMA } }, provider: { only: ["example/region"], order: ["example/region"], allow_fallbacks: false, require_parameters: true } });
  });
  it.each(["openrouter", "ollama", "openai", "groq", "custom"] as const)("preserves legacy %s bodies and rejects unsupported opt-in", provider => {
    const s = { ...settings, provider };
    const body = buildChatBody(s, "system", "user", {});
    expect(body).toEqual({ model: s.model, messages: [{ role: "system", content: "system" }, { role: "user", content: "user" }], temperature: s.temperature, max_tokens: 2000,
      ...(provider === "openrouter" ? { repetition_penalty: 1.15 } : {}), ...(provider === "ollama" ? {} : { frequency_penalty: 0.1 }) });
    if (provider !== "openrouter") expect(() => buildChatBody(s, "system", "user", options)).toThrow();
  });
});
