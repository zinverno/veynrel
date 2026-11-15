import { describe, expect, it, vi } from "vitest";
vi.mock("obsidian", () => ({ TFile: class {}, MarkdownView: class {}, getLanguage: () => "en", parseLinktext: (s: string) => ({ path: s }), requestUrl: vi.fn(), parseYaml: vi.fn() }));
import { TFile } from "obsidian";
import { localBytes, tagRanges } from "./localNotePlan";
import { readLocalLinkPair } from "./readLocalLinkPair";
import { buildLocalLinkPlan } from "./localLinkPlan";
import { paragraphRanges } from "./changePlan";
import { localNoteFixture } from "../tests/localNoteFixture";
import { localNoteRecord, validateLocalNoteRecord } from "./localNoteJournal";
import { checksum } from "./operationJournal";
const reason = (reason: string): unknown => expect.objectContaining({ reason });
describe("local action owner and durable journal", () => {
  it.each(["add_inline_tag", "repair_wikilink"] as const)("%s: no pre-Apply writes; exact bytes, restart/history, Undo", async kind => {
    const f = localNoteFixture(), before = f.contents.get("Source.md"), plan = await f.plan(kind);
    const review = await f.service.localNote!.review(plan, () => true);
    expect(f.vault.process).not.toHaveBeenCalled(); expect(f.disk.size).toBe(0);
    await f.service.localNote!.execute(review); expect(f.contents.get("Source.md")).toBe(plan.after);
    expect(f.vault.modify).not.toHaveBeenCalled(); expect(f.adapter.copy).toHaveBeenCalledTimes(1);
    const restart = f.restart().localNote!, rows = await restart.history();
    expect(rows[0]).toMatchObject({ state: "applied", canUndo: true, damaged: false });
    await restart.execute(await restart.reviewUndo(review.id, () => true));
    expect(f.contents.get("Source.md")).toBe(before); expect((await restart.history())[0].state).toBe("undone");
    await expect(f.service.localNote!.execute(review)).rejects.toEqual(reason("used"));
  });
  it("rejects arbitrary patches even when every hash and record ID is recomputed", async () => {
    const f = localNoteFixture(), r = await localNoteRecord(await f.plan());
    r.plan.after = "attacker patch"; r.hashes.after = await checksum(r.plan.after);
    r.id = await checksum(JSON.stringify({ ...r, id: "", createdAt: 0 }));
    await expect(validateLocalNoteRecord(r, r.id)).rejects.toEqual(reason("storage"));
  });
  it.each(["source", "target", "registry-settings", "editor"])("revokes prepared repair on %s change", async what => {
    const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan("repair_wikilink"), () => true);
    if (what === "source" || what === "target") f.edit(what === "source" ? "Source.md" : "Folder/Target.md", "Changed.");
    if (what === "editor") f.editor();
    if (what === "registry-settings") f.setRules({ profile: null, registryPath: "Missing.md" });
    await expect(f.service.localNote!.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("consumes confirmation on close/cancel and on concurrent dispatch", async () => {
    const f = localNoteFixture(); let active = true;
    const r = await f.service.localNote!.review(await f.plan(), () => active); active = false;
    await expect(f.service.localNote!.execute(r)).rejects.toEqual(reason("cancelled"));
    await expect(f.service.localNote!.execute(r)).rejects.toEqual(reason("used"));
    expect(f.disk.size).toBe(0);
  });
  it("backup failure prevents dispatch, reserves ID, and blocks older operation families", async () => {
    const f = localNoteFixture(), p = await f.plan(), r = await f.service.localNote!.review(p, () => true);
    f.adapter.copy.mockRejectedValueOnce(new Error("disk"));
    await expect(f.service.localNote!.execute(r)).rejects.toEqual(reason("storage"));
    expect(f.vault.process).not.toHaveBeenCalled(); expect((await f.restart().localNote!.history())[0].damaged).toBe(true);
    await expect(f.restart().localNote!.review(p, () => true)).rejects.toEqual(reason("storage"));
  });
  it("write denial leaves prepared evidence, never auto-replays on restart", async () => {
    const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan(), () => true);
    f.vault.process.mockRejectedValueOnce(new Error("denied"));
    await expect(f.service.localNote!.execute(r)).rejects.toEqual(reason("write"));
    expect((await f.restart().localNote!.history())[0]).toMatchObject({ state: "prepared", canUndo: false, blocking: true });
    expect(f.vault.process).toHaveBeenCalledTimes(1);
  });
  it("recovers an actual write without an applied marker through explicit Undo only", async () => {
    const f = localNoteFixture(), before = f.contents.get("Source.md"), r = await f.service.localNote!.review(await f.plan(), () => true);
    const write = f.adapter.write.getMockImplementation()!;
    f.adapter.write.mockImplementation(async (path, text) => { if (path.includes("/mark-")) throw Error("marker"); await write(path, text); });
    await expect(f.service.localNote!.execute(r)).rejects.toEqual(reason("storage"));
    f.adapter.write.mockImplementation(write);
    const service = f.restart().localNote!, rows = await service.history();
    expect(rows[0]).toMatchObject({ state: "applied", recovered: true, canUndo: true });
    expect(f.vault.process).toHaveBeenCalledTimes(1);
    await service.execute(await service.reviewUndo(r.id, () => true)); expect(f.contents.get("Source.md")).toBe(before);
  });
  it("refuses Undo after user editing, but terminal receipts release the reservation", async () => {
    const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan(), () => true);
    await f.service.localNote!.execute(r); f.edit("Source.md", "User revision.");
    await expect(f.restart().localNote!.reviewUndo(r.id, () => true)).rejects.toEqual(reason("conflict"));
    expect((await f.restart().localNote!.history())[0]).toMatchObject({ canUndo: false, blocking: false });
  });
  it.each(["allowed", "excluded", "deprecated"])("registry state %s is authoritative, including unused/case variants", async state => {
    const f = localNoteFixture();
    const content = "# My rules\n\n```veynrel-organization\n" + JSON.stringify({ version: 1, profile: { version: 1, categories: [] }, tags: [{ tag: "TOPIC/RARE", state, description: "User choice" }], conventions: [] }) + "\n```\n";
    f.contents.set("Rules.md", content); f.files.set("Rules.md", Object.assign(new TFile(), { path: "Rules.md", basename: "Rules", extension: "md", stat: { ctime: 1, mtime: 2, size: localBytes(content) } })); f.cache("Rules.md");
    f.setRules({ profile: null, registryPath: "Rules.md" });
    if (state !== "allowed") { await expect(f.plan()).rejects.toEqual(reason("tag_rule")); return; }
    const plan = await f.plan(), r = await f.service.localNote!.review(plan, () => true);
    f.edit("Rules.md", content + "Unrelated user text.");
    await expect(f.service.localNote!.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    f.edit("Rules.md", "damaged registry"); await expect(f.plan()).rejects.toThrow();
  });
  it("missing metadata and stale native occurrence positions fail closed", async () => {
    const f = localNoteFixture(), file = f.files.get("Source.md")!;
    f.caches.delete(file); await expect(f.plan()).rejects.toThrow();
    f.cache(file.path); f.caches.get(file)!.links![1].position.start.offset++;
    await expect(f.plan("repair_wikilink")).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("already resolved old token and ambiguous selected target are refused", async () => {
    const f = localNoteFixture();
    const resolve = f.app.metadataCache.getFirstLinkpathDest.bind(f.app.metadataCache);
    f.app.metadataCache.getFirstLinkpathDest = () => f.files.get("Folder/Target.md")!;
    await expect(f.plan("repair_wikilink")).rejects.toThrow();
    f.app.metadataCache.getFirstLinkpathDest = resolve;
    const p = await f.plan("repair_wikilink"), r = await f.service.localNote!.review(p, () => true);
    f.app.metadataCache.getFirstLinkpathDest = () => null;
    await expect(f.service.localNote!.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("partial new evidence blocks an existing v1 add-link on the same source, without changing v1 format", async () => {
    const f = localNoteFixture(), read = await readLocalLinkPair(f.app, ["Source.md", "Folder/Target.md"]);
    const old = buildLocalLinkPlan(read, 0, paragraphRanges(read.pair[0])[0], true);
    const newReview = await f.service.localNote!.review(await f.plan(), () => true);
    f.adapter.copy.mockRejectedValueOnce(Error("backup")); await expect(f.service.localNote!.execute(newReview)).rejects.toThrow();
    await expect(f.service.reviewLocalLink(old, () => true)).rejects.toEqual(reason("storage")); expect(f.vault.process).not.toHaveBeenCalled();
  });
  it("the owner lock prevents overlapping dispatch of one confirmation", async () => {
    const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan(), () => true);
    const results = await Promise.allSettled([f.service.localNote!.execute(r), f.service.localNote!.execute(r)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(f.vault.process).toHaveBeenCalledTimes(1);
  });

  it("shares the lock across independent source plans without automatically retrying the busy operation", async () => {
    const f = localNoteFixture(), first = await f.service.localNote!.review(await f.plan(), () => true);
    const p = await f.native.prepare("Folder/Target.md");
    const second = await f.service.localNote!.review(await f.native.plan(p, { kind: "add_inline_tag", tag: "other", range: tagRanges(p.source, p.metadata)[0] }), () => true);
    const results = await Promise.allSettled([f.service.localNote!.execute(first), f.service.localNote!.execute(second)]);
    expect(results[0].status).toBe("fulfilled"); expect(results[1]).toMatchObject({ status: "rejected", reason: { reason: "busy" } });
    expect(f.contents.get("Folder/Target.md")).toBe("Target.\r\n"); expect(f.vault.process).toHaveBeenCalledTimes(1);
    await expect(f.service.localNote!.execute(second)).rejects.toEqual(reason("used"));
  });
  it("checks current full text inside Vault.process even when external editing did not change observed stat", async () => {
    const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan(), () => true), process = f.vault.process.getMockImplementation()!;
    f.vault.process.mockImplementationOnce(async (file, cb) => { f.contents.set(file.path, "External edit."); return process(file, cb); });
    await expect(f.service.localNote!.execute(r)).rejects.toEqual(reason("write"));
    expect(f.contents.get("Source.md")).toBe("External edit.");
    expect((await f.restart().localNote!.history())[0]).toMatchObject({ state: "conflict", blocking: true });
  });
  it("rechecks rules after durable backup IO, before dispatch", async () => {
    const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan(), () => true), copy = f.adapter.copy.getMockImplementation()!;
    f.adapter.copy.mockImplementationOnce(async (a, b) => { await copy(a, b); f.setRules({ profile: null, registryPath: "Missing.md" }); });
    await expect(f.service.localNote!.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    expect((await f.restart().localNote!.history())[0]).toMatchObject({ state: "prepared", blocking: true });
  });
  it("same-path target replacement and target deletion invalidate a confirmed repair", async () => {
    for (const replace of [true, false]) {
      const f = localNoteFixture(), r = await f.service.localNote!.review(await f.plan("repair_wikilink"), () => true);
      const path = "Folder/Target.md", old = f.files.get(path)!;
      if (replace) f.files.set(path, Object.assign(new TFile(), old)); else f.files.delete(path);
      await expect(f.service.localNote!.execute(r)).rejects.toThrow(); expect(f.vault.process).not.toHaveBeenCalled();
    }
  });

});
