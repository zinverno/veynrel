import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ getLanguage: () => "en", requestUrl: vi.fn(), parseYaml: () => ({}) }));
vi.mock("../recallEditor", () => ({ replaceInEditor: vi.fn() }));
import { replaceInEditor } from "../recallEditor";
import { StyleSession } from "./styleSession";
import type { EditorSource } from "./editorSource";
import { setLanguage } from "../i18n";

function fixture(original = "Prefix\nTwo facts stay unchanged.\nSuffix", selection = "Two facts stay unchanged.") {
  vi.mocked(replaceInEditor).mockClear(); setLanguage("en"); let alive = true;
  const source = { path: "Source.md", original, selection, from: selection ? original.indexOf(selection) : 0,
    to: selection ? original.indexOf(selection) + selection.length : original.length, mode: "source", ranges: [{}], editor: {}, current: () => alive, supportsNativeEdit: async () => true } as unknown as EditorSource;
  const settings = { provider: "ollama" as const, model: "fixture", baseUrl: "http://127.0.0.1:1/v1", apiKey: "", temperature: .5, topK: 5 };
  const port = { get: () => ({ ...settings }), subscribe: () => () => {}, update: vi.fn() };
  const request = vi.fn(async (_settings: unknown, _system: string, _user: string) => "Two facts remain unchanged.");
  const session = new StyleSession(source, port, request);
  return { session, request, source, settings, invalidate: () => { alive = false; } };
}
describe("captured Style draft and Apply", () => {
  it("stays passive until consent and applies the captured range only once", async () => {
    const f = fixture(); expect(f.request).not.toHaveBeenCalled(); expect(replaceInEditor).not.toHaveBeenCalled();
    const a = f.session.generate(), b = f.session.generate(); await Promise.all([a, b]);
    expect(f.request).toHaveBeenCalledOnce(); expect(f.session.state).toBe("preview"); expect(replaceInEditor).not.toHaveBeenCalled();
    f.session.apply(); f.session.apply(); expect(replaceInEditor).toHaveBeenCalledExactlyOnceWith(f.source.editor, f.source.original, 7, 32, "Two facts remain unchanged.");
    expect(f.session.state).toBe("applied");
  });
  it.each(["source", "model", "temperature", "cancel"])("refuses %s changes after request without redirecting to the current editor", async change => {
    const f = fixture(); let resolve!: (v: string) => void; f.request.mockImplementation(() => new Promise(r => { resolve = r; }));
    const pending = f.session.generate(); await Promise.resolve();
    if (change === "source") f.invalidate(); else if (change === "cancel") f.session.cancel(); else if (change === "model") f.settings.model = "changed"; else f.settings.temperature = .8;
    resolve("Two facts remain unchanged."); await pending;
    expect(f.session.state).toBe(change === "cancel" ? "cancelled" : "conflict"); f.session.apply(); expect(replaceInEditor).not.toHaveBeenCalled();
  });
  it("revalidates immediately before Apply", async () => { const f = fixture(); await f.session.generate(); f.invalidate(); f.session.apply(); expect(f.session.state).toBe("conflict"); expect(replaceInEditor).not.toHaveBeenCalled(); });
  it("does not truncate oversized material or send an unsupported range", async () => {
    const f = fixture("x".repeat(50001), ""); await f.session.generate(); expect(f.session.reason).toBe("limit"); expect(f.request).not.toHaveBeenCalled();
    const g = fixture(); Object.assign(g.source, { ranges: [{}, {}] }); await g.session.generate(); expect(g.session.reason).toBe("unsupported"); expect(g.request).not.toHaveBeenCalled();
  });
  it.each([
    ["---\nid: stable\n---\nOld text", "---\nid: changed\n---\nNew text"],
    ["Old [[Link]]", "New [[Changed]]"], ["Old `code()`", "New `other()`"],
    ["Old\n```js\nf()\n```\n", "New\n```js\ng()\n```\n"],
    ["[reference][id]", "New text"],
  ])("blocks protected or unsupported Markdown: %s", async (before, after) => {
    const f = fixture(before, ""); f.request.mockResolvedValue(after); await f.session.generate(); expect(f.session.reason).toBe("protected"); f.session.apply(); expect(replaceInEditor).not.toHaveBeenCalled();
  });
  it("refuses native-normalized file formats before sending material", async () => {
    const f = fixture(); Object.assign(f.source, { supportsNativeEdit: async () => false });
    await f.session.generate(); expect(f.session.reason).toBe("format"); expect(f.request).not.toHaveBeenCalled();
  });
  it("keeps complete YAML, links and code in whole-note material and preview", async () => {
    const text = "---\nid: stable\n---\nOld text [[Link]] `code()`\n```js\nf()\n```\n";
    const f = fixture(text, ""); f.request.mockResolvedValue(text.replace("Old text", "Clear text")); await f.session.generate();
    expect(f.session.state).toBe("preview"); expect(f.request.mock.calls[0][2]).toContain(text); f.session.apply();
    expect(replaceInEditor).toHaveBeenCalledWith(f.source.editor, text, 0, text.length, text.replace("Old text", "Clear text"));
  });
  it("retains safe failure without raw provider errors or automatic retry", async () => {
    const f = fixture(); f.request.mockRejectedValue(Error("PRIVATE response")); await f.session.generate(); expect(f.session.state).toBe("error"); expect(f.session.reason).toBe("request");
    await f.session.generate(); expect(f.request).toHaveBeenCalledOnce(); expect(JSON.stringify(f.session)).not.toContain("PRIVATE");
  });
});
