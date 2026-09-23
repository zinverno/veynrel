import { describe, expect, it, vi } from "vitest";
import { RecallHealthAdapter } from "./recallHealthAdapter";
import { productFixture, cardsPath } from "./testSupport";

describe("Recall Health adapter", () => {
  it("constructs without IO and only projects counts, load state and next due time from the one owner", async () => {
    const f = productFixture(), adapter = new RecallHealthAdapter(f.product);
    const summary = adapter.getSnapshot();
    expect(summary).toEqual({ loadState: "uninitialized", firstRun: false, active: 0, due: 0, new: 0 });
    expect(f.factory).not.toHaveBeenCalled(); expect(f.adapter.exists).not.toHaveBeenCalled();
    await Promise.all([adapter.initialize(), f.product.initialize()]);
    expect(f.factory).toHaveBeenCalledTimes(1); expect(adapter.getSnapshot().firstRun).toBe(true);
    expect(f.vault.getMarkdownFiles).not.toHaveBeenCalled(); expect(f.vault.read).not.toHaveBeenCalled(); expect(f.adapter.write).not.toHaveBeenCalled();
    await f.product.refreshCards(); f.product.startSession(); f.product.revealAnswer();
    expect(adapter.getSnapshot()).toEqual({ loadState: "ready", firstRun: false, active: 1, due: 1, new: 1, nextDueAt: 100 });
    expect(JSON.stringify(adapter.getSnapshot())).not.toMatch(/Question|SECRET|question|answer|stability|difficulty|session|error|previews/u);
    Object.assign(summary, { active: 200 }); expect(adapter.getSnapshot().active).toBe(1);
  });

  it("notifies after durable review/inventory and isolates throwing listeners, with working unsubscribe", async () => {
    const f = productFixture(), adapter = new RecallHealthAdapter(f.product), listener = vi.fn();
    adapter.subscribe(() => { throw new Error("view failed"); }); const off = adapter.subscribe(listener);
    await adapter.initialize(); await f.product.refreshCards();
    f.product.startSession(); f.time(200); f.product.revealAnswer(); await f.product.rate("again");
    expect(listener).toHaveBeenCalled(); expect(adapter.getSnapshot()).toMatchObject({ active: 1, due: 0, new: 0, nextDueAt: 60200 });
    expect(JSON.parse(f.files.get(cardsPath)!) as unknown).toMatchObject({ version: 2,
      cards: { [f.service().listCards()[0].id]: { schedule: { reviewCount: 1 } } } });
    expect(f.product.getSnapshot().error).toBeUndefined();
    off(); listener.mockClear(); f.product.endSession(); expect(listener).not.toHaveBeenCalled();
    f.time(60200); expect(adapter.getSnapshot().due).toBe(1);
  });

  it("keeps schedules of known active cards after partial inventory and excludes retired cards", async () => {
    const f = productFixture(), adapter = new RecallHealthAdapter(f.product);
    await adapter.initialize(); await f.product.refreshCards();
    f.vault.read.mockRejectedValueOnce(new Error("unreadable")); f.time(200); await f.product.refreshCards();
    expect(f.product.getSnapshot().inventoryResult?.complete).toBe(false);
    expect(adapter.getSnapshot()).toMatchObject({ active: 1, due: 1, nextDueAt: 100 });
    f.vault.read.mockResolvedValue("## Flashcards\n"); f.time(300); await f.product.refreshCards();
    expect(f.service().listCards()[0].state).toBe("retired");
    expect(adapter.getSnapshot()).toEqual({ loadState: "ready", firstRun: false, active: 0, due: 0, new: 0 });
  });
});
