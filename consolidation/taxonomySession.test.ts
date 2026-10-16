import { describe, expect, it, vi } from "vitest";
import { TaxonomySession } from "./taxonomySession";
import { TaxonomyError } from "./taxonomyProfile";
import type { TagTaxonomyProfile } from "./taxonomyProfile";
import type { TaxonomyInventory } from "./taxonomyScan";
const profile: TagTaxonomyProfile = { version: 1, categories: [{ id: "role", name: "Роль", purpose: "role", multiplicity: "one_primary", interpretation: "global", prefixes: ["role"], tags: [] }] };
function fixture() {
  const port = { get: vi.fn(() => structuredClone(profile)), save: vi.fn(async (_next: TagTaxonomyProfile, _expected: TagTaxonomyProfile | null, _signal: AbortSignal) => {}) };
  const inventory: TaxonomyInventory = { state: "complete", total: 1, eligible: 1, excluded: 0, processed: 1, unavailable: 0, empty: 0, tags: [{ tag: "role/theory", notes: 1 }] };
  const scan = vi.fn(async (_excluded: string[], _signal: AbortSignal) => inventory);
  const session = new TaxonomySession(port, scan); return { port, scan, session, inventory };
}
describe("taxonomy draft, review and asynchronous lifecycle", () => {
  it("opens without scanning or saving and requires a current review before explicit save", async () => {
    const f = fixture(); expect(f.scan).not.toHaveBeenCalled(); await f.session.save(); expect(f.port.save).not.toHaveBeenCalled();
    f.session.draft.categories[0].multiplicity = "multiple"; f.session.review();
    f.session.draft.categories[0].interpretation = "domain"; await f.session.save(); expect(f.port.save).not.toHaveBeenCalled();
    f.session.review(); await f.session.save(); expect(f.port.save).toHaveBeenCalledOnce();
    expect(f.port.save.mock.calls[0][0]).not.toHaveProperty("inventory"); expect(f.session.stage).toBe("saved");
  });
  it("scans only explicitly without replacing confirmed or edited rules", async () => {
    const f = fixture(); f.session.draft.categories[0].name = "Моя роль"; await f.session.analyze([]);
    expect(f.session.inventory).toEqual(f.inventory); expect(f.session.draft.categories[0].name).toBe("Моя роль"); expect(f.port.save).not.toHaveBeenCalled();
  });
  it("cancels scans, blocks duplicate dispatch and never publishes after close", async () => {
    const f = fixture(); let release!: (value: TaxonomyInventory) => void;
    f.scan.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })); const work = f.session.analyze([]);
    await f.session.analyze([]); expect(f.scan).toHaveBeenCalledOnce(); f.session.cancelScan(); expect(f.scan.mock.calls[0][1].aborted).toBe(true);
    f.session.close(); release(f.inventory); await work; expect(f.session.inventory).toBeUndefined(); expect(f.port.save).not.toHaveBeenCalled();
  });
  it("preserves the previous profile on errors and cannot double-save", async () => {
    const f = fixture(); f.session.draft.categories[0].name = "Changed"; f.session.review();
    f.port.save.mockRejectedValueOnce(new TaxonomyError("conflict")); const work = f.session.save(); await f.session.save(); await work;
    expect(f.port.save).toHaveBeenCalledOnce(); expect(f.session.error).toBe("conflict"); expect(f.session.base).toEqual(profile);
    f.session.reload(); expect(f.session.draft).toEqual(profile);
  });
});
