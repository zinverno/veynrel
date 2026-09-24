import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callOpenRouter } from "../../api";
import { DeepAuditEngine, DEFAULT_DEEP_AUDIT_CONFIG } from "../../deepAudit";
import { DEFAULT_SETTINGS } from "../../settings";
import { NoteIndexManager } from "../../noteIndex";
import { deepFixture, gate } from "../testSupport";
import { validateDeepMapSummaries } from "../mapValidation";
import { FindingStore } from "../../health/store/findingStore";
import { MemoryHealthStorage } from "../../health/store/testSupport";
import { setLanguage } from "../../i18n";

vi.mock("obsidian", () => ({ Modal: class {}, Notice: class {}, PluginSettingTab: class {}, getLanguage: () => "en" }));
vi.mock("../../api", () => ({ callOpenRouter: vi.fn() }));
beforeEach(() => {
  vi.stubGlobal("window", { setTimeout: (fn: () => void) => setTimeout(fn, 0), clearTimeout });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(callOpenRouter).mockReset().mockImplementation(async (_settings, _system, user) => JSON.stringify(
    [...user.matchAll(/^PATH: (.+)$/gmu)].map((match) => ({ path: match[1], quality: "draft", mainIdea: "PRIVATE_MAIN_IDEA", keyIdeas: "PRIVATE_KEY_IDEAS",
      keyPoints: ["PRIVATE_POINTS"], entities: ["PRIVATE_ENTITIES"], suggestedTags: ["PRIVATE_TAGS"], suggestedLinks: ["PRIVATE_LINKS"] }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const signal = () => new AbortController().signal;

describe("strict Deep MAP-only reuse", () => {
  it("shares scope and transport, truncates content, runs every note each time, and writes no index/report/Canvas/Markdown", async () => {
    const f = deepFixture(["A.md", "B.md", "C.md", "Templates/T.md", ".ai-backup-old/X.md", "Private/Config/X.md", "Notes/.hidden.md"]);
    const before = [...f.disk];
    const first = await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    expect(first).toMatchObject({ totalFiles: 3, analyzedFiles: 3, complete: true });
    await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    expect(callOpenRouter).toHaveBeenCalledTimes(6);
    for (const [settings, system, user, options] of vi.mocked(callOpenRouter).mock.calls) {
      expect(settings.model).toBe("model-a"); expect(system).toContain('"quality"');
      expect(user.length).toBeLessThan(5000); expect(user).not.toMatch(/SENTINEL_KEY|recall|findings|vectors|semantic/iu);
      expect(options instanceof AbortSignal ? options : options?.signal).toBeInstanceOf(AbortSignal);
    }
    for (const mutation of [f.vault.modify, f.vault.create, f.vault.delete, f.vault.rename, f.vault.process, f.vault.adapter.write]) expect(mutation).not.toHaveBeenCalled();
    expect(f.vault.adapter.read).not.toHaveBeenCalled(); expect([...f.disk]).toEqual(before);
    expect(Object.keys(first.revision)).toEqual(["token"]); expect(typeof first.revision.token).toBe("string");
  });

  it("persists only a path, classification, static copy and safe action, with stable identity", async () => {
    const f = deepFixture();
    vi.mocked(callOpenRouter).mockResolvedValueOnce('[{"path":"A.md","quality":"draft","mainIdea":"PRIVATE"}]')
      .mockResolvedValueOnce('[{"path":"B.md","quality":"developed"}]').mockResolvedValueOnce('[{"path":"C.md","quality":"polished"}]');
    const result = await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({ analyzerId: "knowledge-quality", source: "deep-ai", dimension: "knowledge", type: "knowledge-draft",
      confidence: "medium", impact: "review", notePaths: ["A.md"], evidence: [{ kind: "deep-quality", value: "draft", path: "A.md" }], actions: [{ kind: "open-note", path: "A.md" }] });
    const storage = new MemoryHealthStorage(); const store = new FindingStore(storage); await store.load();
    await store.reconcile({ scope: { source: "deep-ai", analyzerIds: ["knowledge-quality"] }, candidates: result.candidates, complete: true });
    expect(storage.files.get("findings.json")).not.toMatch(/SENTINEL|PRIVATE|mainIdea|keyIdeas|keyPoints|entities|suggestedTags|suggestedLinks|model-a|localhost|prompt|payload/iu);
    expect((await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!)).candidates[0].fingerprint).toBe(result.candidates[0].fingerprint);
  });

  it.each([
    [null], [1], [{}], [{ path: "A.md" }], [{ path: "A.md", quality: "DRAFT" }], [{ path: "A.md", quality: null }],
    [{ path: "../A.md", quality: "draft" }], [{ path: "/A.md", quality: "draft" }], [{ path: "A.txt", quality: "draft" }],
    [{ path: "Other.md", quality: "draft" }], [{ path: "A.md", quality: "draft" }, { path: "A.md", quality: "polished" }],
    [{ path: "A.md", quality: "draft" }, { path: "A.md", quality: "draft" }, { path: "A.md", quality: "draft" }],
  ])("does not accept malformed or duplicate classification %j", (...entries) => {
    expect(validateDeepMapSummaries(entries, ["A.md"])).toEqual({ summaries: [], complete: false });
  });

  it("marks missing/unknown/batch-external paths incomplete while keeping independent valid positives", async () => {
    const f = deepFixture();
    vi.mocked(callOpenRouter).mockResolvedValueOnce('[{"path":"A.md","quality":"draft"},{"path":"Invented.md","quality":"draft"}]')
      .mockResolvedValueOnce('[]').mockResolvedValueOnce('[{"path":"B.md","quality":"draft"}]');
    const result = await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    expect(result).toMatchObject({ analyzedFiles: 1, totalFiles: 3, complete: false });
    expect(result.candidates.map((item) => item.notePaths)).toEqual([["A.md"]]);
  });

  it.each([undefined, null, "invalid"])("MAP-only validation remains strict with legacy language %s", async (language) => {
    const f = deepFixture(["A.md"]); Object.assign(f.config.settings, { language });
    vi.mocked(callOpenRouter).mockResolvedValue('[{"path":"Invented.md","quality":"draft"},{"path":"A.md","quality":"unknown"}]');
    expect(await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!)).toMatchObject({ candidates: [], analyzedFiles: 0, complete: false });
  });

  it("reuses existing retries for strict parse failure and never synthesizes drafts", async () => {
    const f = deepFixture(["A.md", "B.md"]);
    vi.mocked(callOpenRouter).mockImplementation(async (_settings, _system, user) => user.includes("PATH: A.md") ? "{bad JSON PRIVATE_PROVIDER_BODY" : '[{"path":"B.md","quality":"developed"}]');
    const result = await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    expect(callOpenRouter).toHaveBeenCalledTimes(DEFAULT_DEEP_AUDIT_CONFIG.maxRetries + 2);
    expect(result).toMatchObject({ totalFiles: 2, analyzedFiles: 1, complete: false, candidates: [] });
    expect(JSON.stringify(result)).not.toContain("PRIVATE_PROVIDER_BODY");
  });

  it("counts unreadable notes as failed coverage and permits a truly empty captured scope", async () => {
    const f = deepFixture(); f.vault.cachedRead.mockRejectedValueOnce(new Error("PRIVATE_READ"));
    expect(await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!)).toMatchObject({ totalFiles: 3, analyzedFiles: 2, complete: false });
    f.files.length = 0;
    expect(await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!)).toMatchObject({ totalFiles: 0, analyzedFiles: 0, complete: true });
  });

  it.each(["path", "mtime", "size", "add", "remove"])("rejects a changed vault %s after MAP and at later verification", async (change) => {
    const f = deepFixture(); const result = await f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    if (change === "path") f.files[0].path = "Renamed.md";
    if (change === "mtime") f.files[0].stat.mtime++;
    if (change === "size") f.files[0].stat.size++;
    if (change === "add") f.files.push({ ...f.files[0], path: "Added.md" });
    if (change === "remove") f.files.pop();
    await expect(async () => f.adapter.verifyCurrent(result.revision, signal())).rejects.toMatchObject({ code: "deep-vault-changed" });
  });

  it("holds model/tuning fixed while a newer committed configuration invalidates the scan", async () => {
    const f = deepFixture(); const hold = gate<string>(); vi.mocked(callOpenRouter).mockReturnValueOnce(hold.promise);
    const pending = f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!); await vi.waitFor(() => expect(callOpenRouter).toHaveBeenCalledTimes(1));
    f.config.settings.model = "model-b"; f.config.settings.temperature = 0.1; f.config.settings.deepAudit.batchSize = 20; f.config.revision++;
    hold.release('[{"path":"A.md","quality":"draft"}]');
    await expect(pending).rejects.toMatchObject({ code: "deep-config-changed" });
    expect(vi.mocked(callOpenRouter).mock.calls.map(([settings]) => settings.model)).toEqual(["model-a", "model-a", "model-a"]);
  });

  it("freezes the existing MAP prompt language at start even when global UI language changes", async () => {
    const f = deepFixture(); f.config.settings.language = "en"; setLanguage("en");
    const hold = gate<string>(); vi.mocked(callOpenRouter).mockReturnValueOnce(hold.promise);
    const pending = f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!);
    await vi.waitFor(() => expect(callOpenRouter).toHaveBeenCalledTimes(1)); setLanguage("ru");
    hold.release('[{"path":"A.md","quality":"draft"}]'); await pending;
    for (const [, system, user] of vi.mocked(callOpenRouter).mock.calls) {
      expect(system).toContain("You are a knowledge-base analyst"); expect(user).toContain("Analyze these notes");
    }
    setLanguage("en");
  });

  it("consent is passive and stale or uncommitted configuration cannot enumerate or transmit notes", async () => {
    const f = deepFixture(); const consent = f.adapter.getConsent()!;
    expect(consent.providerKind).toBe("local"); expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled();
    f.config.current = false; expect(f.adapter.getConsent()).toBeUndefined();
    await expect(f.adapter.analyzeKnowledge(signal(), consent)).rejects.toMatchObject({ code: "deep-config-changed" });
    f.config.current = true; f.config.settings.provider = "openrouter"; f.config.revision++;
    await expect(f.adapter.analyzeKnowledge(signal(), consent)).rejects.toMatchObject({ code: "deep-config-changed" });
    expect(f.adapter.getConsent()?.providerKind).toBe("cloud");
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.cachedRead).not.toHaveBeenCalled(); expect(callOpenRouter).not.toHaveBeenCalled();
  });

  it("rejects changes made during MAP, opaque tokens from other sessions, and unavailable configuration safely", async () => {
    const f = deepFixture(); const hold = gate<string>(); vi.mocked(callOpenRouter).mockReturnValueOnce(hold.promise);
    const pending = f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!); await vi.waitFor(() => expect(callOpenRouter).toHaveBeenCalledTimes(1));
    f.files[0].stat.mtime++; hold.release('[{"path":"A.md","quality":"draft"}]');
    await expect(pending).rejects.toMatchObject({ code: "deep-vault-changed" });
    await expect(async () => f.adapter.verifyCurrent({ token: "invented" }, signal())).rejects.toMatchObject({ code: "deep-config-changed" });
    f.config.settings.model = "";
    await expect(f.adapter.analyzeKnowledge(signal(), f.adapter.getConsent()!)).rejects.toMatchObject({ code: "deep-config-changed" });
  });

  it("bridges abort into pending provider work and stops further batches", async () => {
    const f = deepFixture(); const hold = gate<string>(); const abort = new AbortController();
    vi.mocked(callOpenRouter).mockReturnValueOnce(hold.promise);
    const pending = f.adapter.analyzeKnowledge(abort.signal, f.adapter.getConsent()!); await vi.waitFor(() => expect(callOpenRouter).toHaveBeenCalledTimes(1));
    const options = vi.mocked(callOpenRouter).mock.calls[0][3];
    const providerSignal = options instanceof AbortSignal ? options : options?.signal;
    abort.abort(); await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(providerSignal?.aborted).toBe(true); hold.release('[{"path":"A.md","quality":"draft"}]');
    await new Promise((resolve) => setTimeout(resolve, 10)); expect(callOpenRouter).toHaveBeenCalledTimes(1);
  });

  it("leaves legacy MAP -> REDUCE -> synthesis and index behavior intact", async () => {
    const f = deepFixture(["A.md"]);
    const index = { isStale: vi.fn(() => true), set: vi.fn(), save: vi.fn(), setClusters: vi.fn() };
    vi.mocked(callOpenRouter).mockResolvedValueOnce('[{"path":"A.md","quality":"draft","topics":["topic"],"entities":[],"keyIdeas":"idea"}]')
      .mockResolvedValueOnce('{"clusters":[{"name":"Topic","description":"desc","filePaths":["A.md"],"suggestedMOC":"Topic"}]}')
      .mockResolvedValueOnce("## Insights\nLegacy report\n## Action plan\nLegacy plan");
    const engine = new DeepAuditEngine(f.app, { ...DEFAULT_SETTINGS, ...f.config.settings }, { delayBetweenBatchesMs: 0 }, index as unknown as NoteIndexManager);
    const report = await engine.run();
    expect(callOpenRouter).toHaveBeenCalledTimes(3); expect(report.processedFiles).toBe(1); expect(report.clusters).toHaveLength(1);
    expect(index.set).toHaveBeenCalled(); expect(index.setClusters).toHaveBeenCalled(); expect(index.save).toHaveBeenCalledTimes(2);
    await expect(engine.runMapOnly()).rejects.toThrow("unindexed");
  });
});
