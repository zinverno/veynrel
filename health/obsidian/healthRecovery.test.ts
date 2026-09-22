import { describe, expect, it } from "vitest";
import { HealthRecovery, HealthRecoveryError } from "./healthRecovery";
import { adapterFixture, root } from "./testSupport";

function fixture() {
  const f = adapterFixture();
  f.files.set(`${root}/findings.json`, '{"version":999,"future":"keep verbatim"}');
  f.files.set(`${root}/scan-runs.json`, "{damaged history");
  const protectedFiles = ["Notes/A.md", "Private/Config/plugins/ai-knowledge-hub/data.json", "Private/Config/plugins/ai-knowledge-hub/note-index.json", "Private/Config/plugins/ai-knowledge-hub/semantic-index/index.json"];
  for (const path of protectedFiles) f.files.set(path, `protected: ${path}`);
  return { ...f, protectedFiles, recovery: new HealthRecovery(f.adapter, root, () => "100-test") };
}

describe("Health recovery boundary", () => {
  it("backs up unsupported Findings and damaged history verbatim before resetting only Health", async () => {
    const f = fixture(); const before = new Map(f.files);
    const result = await f.recovery.recover("all");
    expect(result.backups).toEqual([`${root}/recovery/findings.100-test.recovery.json`, `${root}/recovery/scan-runs.100-test.recovery.json`]);
    expect(f.files.get(result.backups[0])).toBe(before.get(`${root}/findings.json`));
    expect(f.files.get(result.backups[1])).toBe(before.get(`${root}/scan-runs.json`));
    expect(f.files.has(`${root}/findings.json`)).toBe(false); expect(f.files.has(`${root}/scan-runs.json`)).toBe(false);
    for (const path of f.protectedFiles) expect(f.files.get(path)).toBe(before.get(path));
    expect(f.adapter.write).not.toHaveBeenCalled(); expect(f.adapter.read).not.toHaveBeenCalled();
  });
  it("history-only recovery preserves Findings exactly", async () => {
    const f = fixture(); const before = f.files.get(`${root}/findings.json`);
    expect((await f.recovery.recover("history")).backups).toHaveLength(1);
    expect(f.files.get(`${root}/findings.json`)).toBe(before);
    expect(f.adapter.rename).toHaveBeenCalledTimes(1);
  });
  it("rolls back the first move when the second move fails", async () => {
    const f = fixture(); const before = new Map(f.files); const rename = f.adapter.rename.getMockImplementation()!;
    f.adapter.rename.mockImplementation(async (from, to) => { if (from.endsWith("/scan-runs.json")) throw new Error("Denied"); await rename(from, to); });
    await expect(f.recovery.recover("all")).rejects.toThrow(HealthRecoveryError);
    expect(f.files).toEqual(before);
  });
  it("keeps a backup if rollback itself fails, never deleting the surviving bytes", async () => {
    const f = fixture(); const original = f.files.get(`${root}/findings.json`); const rename = f.adapter.rename.getMockImplementation()!;
    f.adapter.rename.mockImplementation(async (from, to) => { if (from !== `${root}/findings.json`) throw new Error("Offline"); await rename(from, to); });
    await expect(f.recovery.recover("all")).rejects.toThrow(HealthRecoveryError);
    expect(f.files.get(`${root}/recovery/findings.100-test.recovery.json`)).toBe(original);
    expect(f.files.get(`${root}/scan-runs.json`)).toBe("{damaged history");
  });
  it("never overwrites a colliding backup or changes originals", async () => {
    const f = fixture(); f.files.set(`${root}/recovery/findings.100-test.recovery.json`, "older"); const before = new Map(f.files);
    await expect(f.recovery.recover("all")).rejects.toThrow(HealthRecoveryError);
    expect(f.files).toEqual(before); expect(f.adapter.rename).not.toHaveBeenCalled();
  });
  it("fails safely on inaccessible storage without assuming corruption", async () => {
    const f = fixture(); const before = new Map(f.files); f.adapter.exists.mockRejectedValue(new Error("Permission denied"));
    await expect(f.recovery.recover("all")).rejects.toThrow(HealthRecoveryError);
    expect(f.files).toEqual(before); expect(f.adapter.rename).not.toHaveBeenCalled();
  });
  it("does not reset directory-shaped storage or create backups for missing files", async () => {
    const f = adapterFixture(); const recovery = new HealthRecovery(f.adapter, root, () => "id");
    expect(await recovery.recover("all")).toEqual({ backups: [] }); expect(f.adapter.mkdir).not.toHaveBeenCalled();
    f.folders.add(`${root}/findings.json`);
    await expect(recovery.recover("all")).rejects.toThrow(HealthRecoveryError); expect(f.adapter.rename).not.toHaveBeenCalled();
  });
  it("rejects unsafe root and backup identifiers", async () => {
    const f = adapterFixture(); expect(() => new HealthRecovery(f.adapter, "../data")).toThrow();
    await expect(new HealthRecovery(f.adapter, root, () => "../bad").recover("all")).rejects.toThrow(HealthRecoveryError);
    expect(f.adapter.rename).not.toHaveBeenCalled();
  });
});
