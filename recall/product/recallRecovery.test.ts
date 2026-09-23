import { describe, expect, it } from "vitest";
import { productFixture, cardsPath, recallRoot } from "./testSupport";
import { RecallRecovery } from "./recallRecovery";

describe("Recall exact-byte recovery boundary", () => {
  const original = '\uFEFF{\r\n  "version": 999, "future": "☃"\r\n}\n\0';
  it("moves exact bytes at fixed Recall paths and leaves every other domain untouched", async () => {
    const f = productFixture(original);
    for (const path of ["A.md", "Private/Config/plugins/ai-knowledge-hub/health/findings.json", "Private/Config/plugins/ai-knowledge-hub/data.json", "semantic/index.json"]) f.files.set(path, "UNCHANGED");
    const others = [...f.files].filter(([path]) => path !== cardsPath);
    await f.recovery.recover();
    expect(f.adapter.rename).toHaveBeenCalledExactlyOnceWith(cardsPath, `${recallRoot}/recovery/cards-test-backup.recovery.json`);
    expect(f.files.has(cardsPath)).toBe(false); expect(f.files.get(`${recallRoot}/recovery/cards-test-backup.recovery.json`)).toBe(original);
    for (const [path, bytes] of others) expect(f.files.get(path)).toBe(bytes);
    expect(f.adapter.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled();
  });

  it.each(["mkdir", "stat", "rename"] as const)("preserves original bytes when %s fails", async (method) => {
    const f = productFixture(original); f.adapter[method].mockRejectedValueOnce(new Error("PRIVATE"));
    await expect(f.recovery.recover()).rejects.toThrow("preserved"); expect(f.files.get(cardsPath)).toBe(original);
    expect(f.adapter.write).not.toHaveBeenCalled();
  });

  it("restores original when rename completes then rejects", async () => {
    const f = productFixture(original), rename = f.adapter.rename.getMockImplementation()!;
    f.adapter.rename.mockImplementationOnce(async (from, to) => { await rename(from, to); throw new Error("PRIVATE"); });
    await expect(f.recovery.recover()).rejects.toThrow("preserved");
    expect(f.files.get(cardsPath)).toBe(original); expect(f.adapter.rename).toHaveBeenCalledTimes(2);
  });

  it("preserves the surviving backup if the adapter also fails rollback, without publishing an empty owner", async () => {
    const f = productFixture(original), rename = f.adapter.rename.getMockImplementation()!;
    await f.product.initialize();
    f.adapter.rename.mockImplementationOnce(async (from, to) => { await rename(from, to); throw new Error("PRIVATE"); }).mockRejectedValueOnce(new Error("PRIVATE rollback"));
    f.product.requestRecovery(); await f.product.recoverStorage();
    expect(f.files.get(`${recallRoot}/recovery/cards-test-backup.recovery.json`)).toBe(original);
    expect(f.product.getSnapshot()).toMatchObject({ loadState: "invalid", error: "recovery" }); expect(f.factory).toHaveBeenCalledTimes(1);
  });

  it("never overwrites an existing backup or treats a directory as card metadata", async () => {
    const f = productFixture(original); f.files.set(`${recallRoot}/recovery/cards-test-backup.recovery.json`, "OLD BACKUP");
    await expect(f.recovery.recover()).rejects.toThrow(); expect(f.files.get(cardsPath)).toBe(original); expect(f.adapter.rename).not.toHaveBeenCalled();
    f.files.delete(cardsPath); f.folders.add(cardsPath); expect(await f.recovery.canRecover()).toBe(false);
    await expect(f.recovery.recover()).rejects.toThrow();
  });

  it("rejects unsafe backup IDs/config roots without touching files", async () => {
    const f = productFixture(original);
    const recovery = new RecallRecovery(f.adapter, f.vault.configDir, "ai-knowledge-hub", () => "../escape");
    await expect(recovery.recover()).rejects.toThrow(); expect(f.adapter.rename).not.toHaveBeenCalled();
    expect(() => new RecallRecovery(f.adapter, "../elsewhere", "ai-knowledge-hub")).toThrow();
  });
});
