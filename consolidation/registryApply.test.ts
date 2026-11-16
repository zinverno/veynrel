import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s }), requestUrl: vi.fn(), parseYaml: vi.fn() }));
import { TFile } from "obsidian";
import { registryFixture } from "../tests/registryFixture";
import { registryRecord, validateRegistryRecord } from "./registryJournal";
import { checksum } from "./operationJournal";
import { localBytes } from "./localNotePlan";
const reason = (reason: string): unknown => expect.objectContaining({ reason });
describe("registry family under the shared SafeApplyService owner", () => {
  it("publishes invalidation and verified rules, and invalidates a prepared note's registry authority", async () => {
    const f = registryFixture(), local = await f.service.localNote!.review(await f.nativePlanForNote(), () => true), states: string[] = [];
    f.registry.subscribe(() => states.push(f.registry.state));
    await f.service.registry!.execute(await f.service.registry!.review(await f.plan(), () => true));
    expect(states).toEqual(["changed", "ready"]);
    await expect(f.service.localNote!.execute(local)).rejects.toThrow();
    expect(f.vault.process).toHaveBeenCalledOnce(); expect(f.contents.get("Source.md")).toContain("A simple paragraph.");
  });
  it("history cannot offer automatic Undo after disconnection", async () => {
    const f = registryFixture(); await f.service.registry!.execute(await f.service.registry!.review(await f.plan(), () => true));
    f.connect(null); expect((await f.service.registry!.history())[0].canUndo).toBe(false);
  });
  it("separate confirmation, real process, two copies, rules refresh, restart and exact Undo", async () => {
    const f = registryFixture(), plan = await f.plan(), review = await f.service.registry!.review(plan, () => true);
    expect(f.disk.size).toBe(0); expect(f.vault.process).not.toHaveBeenCalled();
    await f.service.registry!.execute(review);
    expect(f.contents.get(f.path)).toBe(plan.after); expect(f.vault.process).toHaveBeenCalledOnce(); expect(f.vault.modify).not.toHaveBeenCalled();
    expect(f.registry.state).toBe("ready"); expect(f.registry.definitions!.tags[0].tag).toBe("Rare"); expect(f.notify).toHaveBeenCalled(); expect(f.adapter.copy).toHaveBeenCalledOnce();
    const next = f.restart().registry!, row = (await next.history())[0];
    expect(row).toMatchObject({ state: "applied", canUndo: true, damaged: false });
    await next.execute(await next.reviewUndo(review.id, () => true));
    expect(Buffer.from(f.contents.get(f.path)!)).toEqual(Buffer.from(f.original)); expect(f.registry.definitions!.tags).toEqual([]);
    expect((await next.history())[0].state).toBe("undone"); expect(f.contents.get("Source.md")).toContain("A simple paragraph.");
  });
  it.each(["source", "external-same-stat", "identity", "rename", "delete", "ctime", "editor", "switch", "disconnect"])("refuses %s after Review without dispatch", async change => {
    const f = registryFixture(), r = await f.service.registry!.review(await f.plan(), () => true), file = f.files.get(f.path)!;
    if (change === "source") f.edit(f.path, f.original + "User text");
    if (change === "external-same-stat") f.contents.set(f.path, f.original.replace("explanation", "explanation!"));
    if (change === "identity") f.files.set(f.path, Object.assign(new TFile(), { ...file, stat: { ...file.stat } }));
    if (change === "rename") file.path = "Other.md";
    if (change === "delete") f.files.delete(f.path);
    if (change === "ctime") file.stat.ctime++;
    if (change === "editor") f.openEditor();
    if (change === "switch") f.connect("Other.md");
    if (change === "disconnect") f.connect(null);
    await expect(f.service.registry!.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("exact callback catches an external edit with no observable stat change", async () => {
    const f = registryFixture(), r = await f.service.registry!.review(await f.plan(), () => true);
    const process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementation(async (file, cb) => { f.contents.set(f.path, "External editor"); return process(file, cb); });
    await expect(f.service.registry!.execute(r)).rejects.toEqual(reason("write")); expect(f.contents.get(f.path)).toBe("External editor");
  });
  it.each(["backup", "write", "marker"])("preserves evidence and never replays after %s failure", async failure => {
    const f = registryFixture(), r = await f.service.registry!.review(await f.plan(), () => true);
    const write = f.adapter.write.getMockImplementation()!;
    if (failure === "backup") f.adapter.copy.mockRejectedValueOnce(Error("backup"));
    if (failure === "write") f.vault.process.mockRejectedValueOnce(Error("denied"));
    if (failure === "marker") f.adapter.write.mockImplementation(async (path, raw) => { if (path.includes("/mark-")) throw Error("interrupted"); return write(path, raw); });
    await expect(f.service.registry!.execute(r)).rejects.toThrow();
    const calls = f.vault.process.mock.calls.length; f.adapter.write.mockImplementation(write);
    const next = f.restart().registry!, row = (await next.history())[0]; expect(f.vault.process).toHaveBeenCalledTimes(calls);
    if (failure === "marker") {
      expect(row).toMatchObject({ state: "applied", recovered: true, canUndo: true });
      await next.execute(await next.reviewUndo(r.id, () => true)); expect(f.contents.get(f.path)).toBe(f.original);
    } else { expect(row.blocking).toBe(true); expect(row.canUndo).toBe(false); expect(f.contents.get(f.path)).toBe(f.original); }
  });
  it("a failed refresh cannot claim rules were successfully saved; exact History remains available", async () => {
    const f = registryFixture(), r = await f.service.registry!.review(await f.plan(), () => true);
    vi.spyOn(f.registry, "refreshAfterWrite").mockRejectedValueOnce(Error("reload failed"));
    await expect(f.service.registry!.execute(r)).rejects.toThrow(); expect((await f.service.registry!.history())[0]).toMatchObject({ state: "applied", canUndo: true });
  });
  it("rejects Undo after a user's content edit or an unknown open editor", async () => {
    const f = registryFixture(), r = await f.service.registry!.review(await f.plan(), () => true); await f.service.registry!.execute(r);
    f.openEditor(); await expect(f.service.registry!.reviewUndo(r.id, () => true)).rejects.toThrow();
    f.app.workspace.iterateAllLeaves = () => {}; f.edit(f.path, f.contents.get(f.path)! + "user");
    await expect(f.service.registry!.reviewUndo(r.id, () => true)).rejects.toThrow(); expect(f.vault.process).toHaveBeenCalledOnce();
  });
  it("one-use tickets, cancellation, close and double dispatch", async () => {
    const f = registryFixture(), p = await f.plan(); let active = true;
    const cancelled = await f.service.registry!.review(p, () => active); active = false;
    await expect(f.service.registry!.execute(cancelled)).rejects.toEqual(reason("cancelled"));
    const closed = await f.service.registry!.review(p, () => true); f.service.registry!.discard(closed);
    await expect(f.service.registry!.execute(closed)).rejects.toEqual(reason("used"));
    const r = await f.service.registry!.review(p, () => true), results = await Promise.allSettled([f.service.registry!.execute(r), f.service.registry!.execute(r)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(f.vault.process).toHaveBeenCalledOnce();
  });
  it("uses the same lock as an independent R05.2 operation and preserves its v1 records", async () => {
    const f = registryFixture(), local = await f.service.localNote!.review(await f.nativePlanForNote(), () => true);
    const reg = await f.service.registry!.review(await f.plan(), () => true);
    const results = await Promise.allSettled([f.service.localNote!.execute(local), f.service.registry!.execute(reg)]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1]).toMatchObject({ status: "rejected", reason: { reason: "busy" } });
    const raw = [...f.disk].filter(([p]) => p.includes('consolidation-local-note-operations'));
    await f.service.registry!.execute(await f.service.registry!.review(await f.plan(), () => true));
    expect([...f.disk].filter(([p]) => p.includes('consolidation-local-note-operations'))).toEqual(raw);
  });
  it("unidentifiable damaged registry evidence blocks other operation families", async () => {
    const f = registryFixture(); f.folders.add('SyntheticConfig/plugins/ai-knowledge-hub/consolidation-registry-operations');
    f.disk.set('SyntheticConfig/plugins/ai-knowledge-hub/consolidation-registry-operations/unexpected', 'broken');
    await expect(f.service.localNote!.review(await f.nativePlanForNote(), () => true)).rejects.toEqual(reason("storage")); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("recomputed hashes cannot authorize arbitrary Markdown or another discriminator", async () => {
    const f = registryFixture(), r = await registryRecord(await f.plan());
    r.plan.after += "Other change"; r.hashes.after = await checksum(r.plan.after); r.id = await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 }));
    await expect(validateRegistryRecord(r, r.id)).rejects.toEqual(reason("storage"));
    const valid = await registryRecord(await f.plan()); await expect(validateRegistryRecord({ ...valid, operation: "add_inline_tag" }, valid.id)).rejects.toThrow();
  });
  it("preserves BOM/read-byte protection and rejects malformed loaded definitions", async () => {
    const f = registryFixture(); f.files.get(f.path)!.stat.size += 3; await expect(f.native.read()).rejects.toThrow();
    f.files.get(f.path)!.stat.size = localBytes(f.original); f.edit(f.path, '\uFEFF' + f.original); await expect(f.native.read()).rejects.toThrow();
    f.edit(f.path, 'broken'); await expect(f.native.read()).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
});
